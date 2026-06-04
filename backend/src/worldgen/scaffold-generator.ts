// Re-export step functions for backward compatibility with routes/worldgen.ts regenerate-section
export { generateRefinedPremiseStep } from "./scaffold-steps/premise-step.js";
export { generateLocationsStep } from "./scaffold-steps/locations-step.js";
export { generateFactionsStep } from "./scaffold-steps/factions-step.js";
export { generateNpcsStep } from "./scaffold-steps/npcs-step.js";
export { expandNpcPlacementScenes } from "./scaffold-steps/placement-expansion-step.js";

import { generateRefinedPremiseStep } from "./scaffold-steps/premise-step.js";
import { generateLocationsStep } from "./scaffold-steps/locations-step.js";
import { generateFactionsStep } from "./scaffold-steps/factions-step.js";
import { generateNpcsStep } from "./scaffold-steps/npcs-step.js";
import { expandNpcPlacementScenes } from "./scaffold-steps/placement-expansion-step.js";
import {
  reportProgress,
  buildWorldgenResearchContextBlock,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
} from "./scaffold-steps/prompt-utils.js";
import { validateAndFixStage, validateCrossStage } from "./scaffold-steps/validation.js";
import {
  regenerateLocationEntity,
  regenerateFactionEntity,
  regenerateNpcEntity,
} from "./scaffold-steps/regen-helpers.js";
import { extractLoreCards } from "./lore-extractor.js";
import {
  evaluateResearchArtifactSufficiency,
  evaluateResearchSufficiency,
} from "./ip-researcher.js";
import { interpretPremiseDivergence } from "./premise-divergence.js";
import type { WorldgenResearchFrame } from "./research-frame.js";
import { createLogger } from "../lib/index.js";
import type {
  IpResearchContext,
  PremiseDivergence,
  WorldgenResearchArtifactV2,
} from "@worldforge/shared";
import type { SearchConfig } from "../lib/web-search.js";
import type {
  GenerateScaffoldRequest,
  GenerationProgress,
  WorldScaffold,
  ExtractedLoreCard,
  ScaffoldLocation,
  ScaffoldFaction,
  ScaffoldNpc,
} from "./types.js";

const log = createLogger("worldgen");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build SearchConfig from research settings for sufficiency checks */
function buildSearchConfig(req: GenerateScaffoldRequest): SearchConfig | undefined {
  if (!req.research) return undefined;
  return {
    provider: req.research.searchProvider,
    braveApiKey: req.research.braveApiKey,
    zaiApiKey: req.research.zaiApiKey,
    llmProvider: req.role.provider,
  };
}

interface SufficiencyState {
  ipContext: IpResearchContext | null;
  researchArtifact: WorldgenResearchArtifactV2 | null;
}

/** Run artifact-first sufficiency checks, falling back to legacy ipContext only when no v2 artifact exists. */
async function checkSufficiency(
  ipContext: IpResearchContext | null,
  researchArtifact: WorldgenResearchArtifactV2 | null,
  researchFrame: WorldgenResearchFrame | null | undefined,
  step: "locations" | "factions" | "npcs",
  premise: string,
  req: GenerateScaffoldRequest,
): Promise<SufficiencyState> {
  if (researchArtifact) {
    const searchConfig = buildSearchConfig(req);
    return {
      ipContext,
      researchArtifact: await evaluateResearchArtifactSufficiency(
        researchArtifact,
        step,
        premise,
        req.role,
        searchConfig,
      ),
    };
  }

  if (!ipContext) return { ipContext: null, researchArtifact: null };

  const searchConfig = buildSearchConfig(req);
  return {
    ipContext: await evaluateResearchSufficiency(
      ipContext,
      step,
      premise,
      req.role,
      searchConfig,
      researchFrame,
    ),
    researchArtifact: null,
  };
}

/** Build context block for validation prompts */
function buildContextBlock(
  refinedPremise: string,
  ipContext: IpResearchContext | null,
  researchArtifact: WorldgenResearchArtifactV2 | null,
  premiseDivergence: PremiseDivergence | null | undefined,
): string {
  const researchBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext,
    target: "validation",
  });
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence ?? null);
  return `WORLD PREMISE:\n${refinedPremise}\n${researchBlock}${divergenceBlock ? `\n${divergenceBlock}` : ""}`;
}

// ---------------------------------------------------------------------------
// Validation prompt builders
// ---------------------------------------------------------------------------

function buildLocationValidationPrompt(
  entities: readonly ScaffoldLocation[],
  contextBlock: string,
): string {
  const entityList = entities.map(l =>
    `- ${l.name}: ${l.description} [Tags: ${l.tags.join(", ")}] [Connected: ${l.connectedTo.join(", ")}]`
  ).join("\n");

  return `You are a worldbuilding consistency auditor. Review these LOCATIONS for quality issues.

${contextBlock}

LOCATIONS:
${entityList}

CHECK FOR:
1. Duplicate or near-duplicate location names
2. Semantic overlap (two locations serving the exact same narrative purpose)
3. Broken connectedTo references (names not matching any location)
4. Vague descriptions (generic placeholder text instead of concrete details)
5. Tags that contradict the description
6. Canon violations (if known-IP context is provided)
7. Missing connections (orphan locations with no connectedTo)

Report CRITICAL issues that would break gameplay. Minor flavor inconsistencies are WARNINGS.
Empty issues array if everything is clean.

${buildStopSlopRules()}`;
}

function buildFactionValidationPrompt(
  entities: readonly ScaffoldFaction[],
  contextBlock: string,
  locationNames: readonly string[],
): string {
  const entityList = entities.map(f =>
    `- ${f.name}: Goals: ${f.goals.join("; ")} [Territory: ${f.territoryNames.join(", ")}] [Tags: ${f.tags.join(", ")}] [Assets: ${f.assets.join(", ")}]`
  ).join("\n");

  return `You are a worldbuilding consistency auditor. Review these FACTIONS for quality issues.

${contextBlock}

KNOWN LOCATIONS: ${locationNames.join(", ")}

FACTIONS:
${entityList}

CHECK FOR:
1. Duplicate or near-duplicate faction names
2. Semantic overlap (two factions with identical goals and purpose)
3. Territory references not matching any known location
4. Vague or generic goals (not specific enough for gameplay)
5. Tags that contradict the faction goals
6. Canon violations (if known-IP context is provided)
7. Factions with no assets or territory (ungrounded in the world)

Report CRITICAL issues that would break gameplay. Minor flavor inconsistencies are WARNINGS.
Empty issues array if everything is clean.

${buildStopSlopRules()}`;
}

function buildNpcValidationPrompt(
  entities: readonly ScaffoldNpc[],
  contextBlock: string,
  locationNames: readonly string[],
  factionNames: readonly string[],
): string {
  const entityList = entities.map(n =>
    `- ${n.name} (${n.tier ?? "unknown"}) at ${n.locationName}, scene: ${n.sceneLocationName ?? "none"}, faction: ${n.factionName ?? "none"}: ${n.persona} [Tags: ${n.tags.join(", ")}] [Goals: short=${n.goals.shortTerm.join("; ")}, long=${n.goals.longTerm.join("; ")}]`
  ).join("\n");

  return `You are a worldbuilding consistency auditor. Review these NPCs for quality issues.

${contextBlock}

KNOWN LOCATIONS: ${locationNames.join(", ")}
KNOWN FACTIONS: ${factionNames.join(", ")}

NPCs:
${entityList}

CHECK FOR:
1. Duplicate or near-duplicate NPC names
2. Semantic overlap (two NPCs with identical roles and personas)
3. locationName references not matching any known location
4. sceneLocationName references not matching any known location or sublocation
5. Faction references not matching any known faction
6. Vague personas (generic placeholder text instead of concrete character details)
7. Goals that contradict the NPC's faction alignment
8. Canon violations (if known-IP context is provided)
9. Missing goals (NPCs with no short-term or long-term goals)

Report CRITICAL issues that would break gameplay. Minor flavor inconsistencies are WARNINGS.
Empty issues array if everything is clean.

${buildStopSlopRules()}`;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

export async function generateWorldScaffold(
  req: GenerateScaffoldRequest,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<{
  scaffold: WorldScaffold;
  enrichedIpContext: IpResearchContext | null;
  researchArtifact: WorldgenResearchArtifactV2 | null;
}> {
  // ipContext is pre-cached from suggest-seeds phase (loaded from config.json)
  let ipContext = req.ipContext ?? null;
  let researchArtifact = req.researchArtifact ?? null;
  const premiseDivergence = req.premiseDivergence
    ?? await interpretPremiseDivergence(ipContext, req.premise, req.role);
  if (ipContext) {
    log.info(`Using cached IP context: "${ipContext.franchise}" (${ipContext.keyFacts.length} facts, source: ${ipContext.source})`);
  }
  if (premiseDivergence) {
    log.info(`Using premise divergence: ${premiseDivergence.mode}`);
  }
  const requestWithDivergence: GenerateScaffoldRequest = {
    ...req,
    premiseDivergence,
  };
  const currentRequest = (): GenerateScaffoldRequest => ({
    ...requestWithDivergence,
    researchArtifact,
  });

  const totalSteps = 10;
  // Step 0: Premise
  // Step 1: Locations (plan + per-entity detail)
  // Step 2: Location validation
  // Step 3: Factions (plan + per-entity detail)
  // Step 4: Faction validation
  // Step 5: NPCs (plan key + plan supporting + per-entity detail)
  // Step 6: NPC placement expansion
  // Step 7: NPC validation
  // Step 8: Cross-stage validation
  // Step 9: Lore extraction (4 category calls)
  let currentStep = 0;

  // Step 0: Premise
  reportProgress(onProgress, currentStep, totalSteps, "Refining world premise...");
  const refinedPremise = await generateRefinedPremiseStep(currentRequest(), ipContext);
  log.info(`Premise refined (${refinedPremise.length} chars)`);
  currentStep++;

  // Step 1: Locations (with sufficiency check)
  ({ ipContext, researchArtifact } = await checkSufficiency(
    ipContext,
    researchArtifact,
    req.researchFrame,
    "locations",
    refinedPremise,
    req,
  ));
  let locations = await generateLocationsStep(
    currentRequest(), refinedPremise, ipContext,
    undefined, // additionalInstruction
    onProgress, currentStep, totalSteps,
  );
  log.info(`Generated ${locations.length} locations`);
  currentStep++;

  // Step 2: Location validation (if Judge available)
  if (req.judgeRole) {
    reportProgress(onProgress, currentStep, totalSteps, "Validating locations...");
    const contextBlock = buildContextBlock(refinedPremise, ipContext, researchArtifact, premiseDivergence);
    locations = await validateAndFixStage(
      locations,
      req.judgeRole,
      (entities) => buildLocationValidationPrompt(entities, contextBlock),
      // REVIEW FIX #4: currentEntities param provides current-round state
      (entity, fix, currentEntities) => regenerateLocationEntity(
        entity, fix, currentRequest(), refinedPremise, ipContext, currentEntities,
      ),
    );
    log.info(`Locations after validation: ${locations.length}`);
  }
  currentStep++;
  let locationNames = locations.map((l) => l.name);

  // Step 3: Factions (with sufficiency check)
  ({ ipContext, researchArtifact } = await checkSufficiency(
    ipContext,
    researchArtifact,
    req.researchFrame,
    "factions",
    refinedPremise,
    req,
  ));
  let factions = await generateFactionsStep(
    currentRequest(), refinedPremise, locationNames, ipContext,
    undefined,
    onProgress, currentStep, totalSteps,
  );
  log.info(`Generated ${factions.length} factions`);
  currentStep++;

  // Step 4: Faction validation (if Judge available)
  if (req.judgeRole) {
    reportProgress(onProgress, currentStep, totalSteps, "Validating factions...");
    const contextBlock = buildContextBlock(refinedPremise, ipContext, researchArtifact, premiseDivergence);
    factions = await validateAndFixStage(
      factions,
      req.judgeRole,
      (entities) => buildFactionValidationPrompt(entities, contextBlock, locationNames),
      // REVIEW FIX #4: currentEntities for current-round state
      (entity, fix, currentEntities) => regenerateFactionEntity(
        entity, fix, currentRequest(), refinedPremise, locationNames, ipContext, currentEntities,
      ),
    );
    log.info(`Factions after validation: ${factions.length}`);
  }
  currentStep++;
  const factionNames = factions.map((f) => f.name);

  // Step 5: NPCs (with sufficiency check)
  ({ ipContext, researchArtifact } = await checkSufficiency(
    ipContext,
    researchArtifact,
    req.researchFrame,
    "npcs",
    refinedPremise,
    req,
  ));
  let npcs = await generateNpcsStep(
    currentRequest(), refinedPremise, locations, factionNames, ipContext,
    undefined,
    onProgress, currentStep, totalSteps,
  );
  log.info(`Generated ${npcs.length} NPCs (${npcs.filter((n) => n.tier === "key").length} key, ${npcs.filter((n) => n.tier === "supporting").length} supporting)`);
  currentStep++;

  // Step 6: Expand locations around NPC placement needs before saving.
  reportProgress(onProgress, currentStep, totalSteps, "Expanding NPC scene placement...");
  const expandedPlacement = await expandNpcPlacementScenes(
    currentRequest(),
    refinedPremise,
    locations,
    factions,
    npcs,
    ipContext,
  );
  locations = expandedPlacement.locations;
  npcs = expandedPlacement.npcs;
  locationNames = locations.map((l) => l.name);
  log.info(`NPC placement expansion complete: ${locations.length} locations, ${npcs.length} NPCs`);
  currentStep++;

  // Step 7: NPC validation (if Judge available)
  if (req.judgeRole) {
    reportProgress(onProgress, currentStep, totalSteps, "Validating NPCs...");
    const contextBlock = buildContextBlock(refinedPremise, ipContext, researchArtifact, premiseDivergence);
    npcs = await validateAndFixStage(
      npcs,
      req.judgeRole,
      (entities) => buildNpcValidationPrompt(entities, contextBlock, locationNames, factionNames),
      // REVIEW FIX #4: currentEntities for current-round state
      (entity, fix, currentEntities) => regenerateNpcEntity(
        entity, fix, currentRequest(), refinedPremise, locationNames, factionNames, ipContext, currentEntities,
      ),
    );
    log.info(`NPCs after validation: ${npcs.length}`);
  }
  currentStep++;

  // Step 8: Cross-stage validation (if Judge available)
  // REVIEW FIX #1: Uses bounded 3-round loop (implemented in validateCrossStage)
  if (req.judgeRole) {
    reportProgress(onProgress, currentStep, totalSteps, "Cross-stage consistency check...");
    const contextBlock = buildContextBlock(refinedPremise, ipContext, researchArtifact, premiseDivergence);
    const crossResult = await validateCrossStage(
      locations, factions, npcs,
      req.judgeRole,
      contextBlock,
      // REVIEW FIX #4: Regen callbacks close over CURRENT outer vars (locations/factions/npcs are let-bound and updated)
      (npc, fix) => regenerateNpcEntity(npc, fix, currentRequest(), refinedPremise, locationNames, factionNames, ipContext, npcs),
      (faction, fix) => regenerateFactionEntity(faction, fix, currentRequest(), refinedPremise, locationNames, ipContext, factions),
    );
    locations = crossResult.locations;
    factions = crossResult.factions;
    npcs = crossResult.npcs;
    log.info("Cross-stage validation complete");
  }
  currentStep++;

  // Step 9: Lore extraction (4 category calls)
  const baseScaffold: WorldScaffold = { refinedPremise, locations, factions, npcs, loreCards: [] as ExtractedLoreCard[] };
  const loreCards = await extractLoreCards(baseScaffold, req.role, {
    ipContext,
    premiseDivergence,
    onProgress,
    progressStep: currentStep,
    progressTotalSteps: totalSteps,
    researchArtifact,
  });
  log.info(`Extracted ${loreCards.length} lore cards`);

  return {
    scaffold: { refinedPremise, locations, factions, npcs, loreCards },
    enrichedIpContext: ipContext,
    researchArtifact,
  };
}
