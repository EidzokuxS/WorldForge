// Re-export step functions for backward compatibility with routes/worldgen.ts regenerate-section
export { generateRefinedPremiseStep } from "./scaffold-steps/premise-step.js";
export { generateLocationsStep } from "./scaffold-steps/locations-step.js";
export { generateFactionsStep } from "./scaffold-steps/factions-step.js";
export { generateNpcsStep } from "./scaffold-steps/npcs-step.js";

import { generateRefinedPremiseStep } from "./scaffold-steps/premise-step.js";
import { generateLocationsStep } from "./scaffold-steps/locations-step.js";
import { generateFactionsStep } from "./scaffold-steps/factions-step.js";
import { generateNpcsStep } from "./scaffold-steps/npcs-step.js";
import { reportProgress } from "./scaffold-steps/prompt-utils.js";
import { extractLoreCards } from "./lore-extractor.js";
import { evaluateResearchSufficiency } from "./ip-researcher.js";
import { interpretPremiseDivergence } from "./premise-divergence.js";
import { createLogger } from "../lib/index.js";
import type { IpResearchContext } from "@worldforge/shared";
import type { SearchConfig } from "../lib/web-search.js";
import type {
  GenerateScaffoldRequest,
  GenerationProgress,
  WorldScaffold,
  ExtractedLoreCard,
} from "./types.js";

const log = createLogger("worldgen");

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

/** Run sufficiency check if ipContext is available, return enriched context */
async function checkSufficiency(
  ipContext: IpResearchContext | null,
  step: "locations" | "factions" | "npcs",
  premise: string,
  req: GenerateScaffoldRequest,
): Promise<IpResearchContext | null> {
  if (!ipContext) return null;

  const searchConfig = buildSearchConfig(req);
  return evaluateResearchSufficiency(ipContext, step, premise, req.role, searchConfig);
}

export async function generateWorldScaffold(
  req: GenerateScaffoldRequest,
  onProgress?: (progress: GenerationProgress) => void,
): Promise<{ scaffold: WorldScaffold; enrichedIpContext: IpResearchContext | null }> {
  // ipContext is pre-cached from suggest-seeds phase (loaded from config.json)
  let ipContext = req.ipContext ?? null;
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

  const totalSteps = 5;
  let currentStep = 0;

  // Step 1: Premise
  reportProgress(onProgress, currentStep++, totalSteps, "Refining world premise...");
  const refinedPremise = await generateRefinedPremiseStep(requestWithDivergence, ipContext);
  log.info(`Premise refined (${refinedPremise.length} chars)`);

  // Step 2: Locations (with sufficiency check)
  ipContext = await checkSufficiency(ipContext, "locations", refinedPremise, req);
  reportProgress(onProgress, currentStep++, totalSteps, "Building locations (plan + detail)...");
  const locations = await generateLocationsStep(requestWithDivergence, refinedPremise, ipContext);
  log.info(`Generated ${locations.length} locations`);
  const locationNames = locations.map((l) => l.name);

  // Step 3: Factions (with sufficiency check)
  ipContext = await checkSufficiency(ipContext, "factions", refinedPremise, req);
  reportProgress(onProgress, currentStep++, totalSteps, "Forging factions (plan + detail)...");
  const factions = await generateFactionsStep(requestWithDivergence, refinedPremise, locationNames, ipContext);
  log.info(`Generated ${factions.length} factions`);
  const factionNames = factions.map((f) => f.name);

  // Step 4: NPCs (with sufficiency check)
  ipContext = await checkSufficiency(ipContext, "npcs", refinedPremise, req);
  reportProgress(onProgress, currentStep++, totalSteps, "Creating NPCs (key + supporting)...");
  const npcs = await generateNpcsStep(requestWithDivergence, refinedPremise, locationNames, factionNames, ipContext);
  log.info(`Generated ${npcs.length} NPCs (${npcs.filter((n) => n.tier === "key").length} key, ${npcs.filter((n) => n.tier === "supporting").length} supporting)`);

  // Step 5: Lore (with ipContext for grounding)
  const baseScaffold: WorldScaffold = { refinedPremise, locations, factions, npcs, loreCards: [] as ExtractedLoreCard[] };
  reportProgress(onProgress, currentStep++, totalSteps, "Extracting world lore...");
  const loreCards = await extractLoreCards(
    baseScaffold,
    req.role,
    req.fallbackRole,
    ipContext,
    premiseDivergence,
  );
  log.info(`Extracted ${loreCards.length} lore cards`);

  return {
    scaffold: { refinedPremise, locations, factions, npcs, loreCards },
    enrichedIpContext: ipContext,
  };
}
