import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { WorldSeeds } from "./seed-roller.js";
import { extractLoreCards } from "./lore-extractor.js";
import type { IpResearchContext, ResearchConfig } from "@worldforge/shared";
import { evaluateResearchSufficiency } from "./ip-researcher.js";
import { createLogger } from "../lib/index.js";
import type { SearchConfig } from "../lib/web-search.js";
import type {
  GenerateScaffoldRequest,
  GenerationProgress,
  WorldScaffold,
  ExtractedLoreCard,
} from "./types.js";


const log = createLogger("worldgen");

const locationSchema = z.object({
  name: z.string(),
  description: z.string().default("").describe("2-3 sentences"),
  tags: z
    .array(z.string())
    .default([])
    .describe("Structural tags like [Warm], [Crowded], [Dangerous]"),
  isStarting: z
    .boolean()
    .default(false)
    .describe("Exactly one location must be the starting location"),
  connectedTo: z.array(z.string()).default([]).describe("Names of connected locations"),
});

const factionSchema = z.object({
  name: z.string(),
  tags: z
    .array(z.string())
    .default([])
    .describe("Faction tags like [Militaristic], [Secretive]"),
  goals: z.array(z.string()).default([]),
  assets: z.array(z.string()).default([]),
  territoryNames: z
    .array(z.string())
    .default([])
    .describe("Names of locations this faction controls"),
});

const npcSchema = z.object({
  name: z.string(),
  persona: z.string().default("").describe("2-3 sentence personality and backstory"),
  tags: z
    .array(z.string())
    .default([])
    .describe("Character tags like [Master Swordsman], [Cynical]"),
  goals: z.union([
    z.object({
      shortTerm: z.array(z.string()).default([]),
      longTerm: z.array(z.string()).default([]),
    }),
    // Some models return goals as flat array or string — normalize
    z.array(z.string()).transform((arr) => ({ shortTerm: arr, longTerm: [] })),
    z.string().transform((s) => ({ shortTerm: [s], longTerm: [] })),
  ]).default({ shortTerm: [], longTerm: [] }),
  locationName: z.string().default("").describe("Name of the location where NPC starts"),
  factionName: z
    .string()
    .nullable()
    .default(null)
    .describe("Faction this NPC belongs to, if any"),
});

const refinedPremiseStepSchema = z.object({
  refinedPremise: z
    .string()
    .describe(
      "2-3 sentence refined world premise weaving all DNA seeds with the player concept"
    ),
});

const locationsStepSchema = z.object({
  locations: z.array(locationSchema).min(4).max(8),
});

const factionsStepSchema = z.object({
  factions: z.array(factionSchema).min(2).max(5),
});

const npcsStepSchema = z.object({
  npcs: z.array(npcSchema).min(3).max(10),
});


const SEED_LABELS: Array<{ field: keyof WorldSeeds; label: string }> = [
  { field: "geography", label: "Geography" },
  { field: "politicalStructure", label: "Political Structure" },
  { field: "centralConflict", label: "Central Conflict" },
  { field: "culturalFlavor", label: "Cultural Flavor" },
  { field: "environment", label: "Environment" },
  { field: "wildcard", label: "Wildcard" },
];

function buildSeedConstraints(seeds?: Partial<WorldSeeds>): string {
  if (!seeds) {
    return "";
  }

  const lines: string[] = [];
  for (const { field, label } of SEED_LABELS) {
    const v = seeds[field];
    if (!v || (Array.isArray(v) && v.length === 0)) continue;
    lines.push(`- ${label}: ${Array.isArray(v) ? v.join(", ") : v}`);
  }

  if (lines.length === 0) {
    return "";
  }

  return `\nWORLD DNA (hard constraints - you MUST incorporate ALL of these):\n${lines.join("\n")}\n`;
}

function formatNameList(names: string[]): string {
  if (names.length === 0) {
    return "- (none)";
  }
  return names.map((name) => `- ${name}`).join("\n");
}

function reportProgress(
  onProgress: ((progress: GenerationProgress) => void) | undefined,
  step: number,
  totalSteps: number,
  label: string
): void {
  onProgress?.({ step, totalSteps, label });
}

function buildIpContextBlock(ipContext: IpResearchContext | null): string {
  if (!ipContext) return "";
  const facts = ipContext.keyFacts.map((f) => `  - ${f}`).join("\n");
  const tone = ipContext.tonalNotes.map((t) => `  - ${t}`).join("\n");
  return `\nKNOWN IP CONTEXT (${ipContext.franchise}, source: ${ipContext.source}):\nKey facts:\n${facts}\nTone/atmosphere:\n${tone}\nIMPORTANT: Honour the spirit and tone of this franchise but do NOT use its trademarked names, places, or characters verbatim — create analogous original equivalents.\n`;
}

export async function generateRefinedPremiseStep(
  req: GenerateScaffoldRequest,
  ipContext: IpResearchContext | null,
  additionalInstruction?: string
): Promise<string> {
  const seedConstraints = buildSeedConstraints(req.seeds);
  const ipBlock = buildIpContextBlock(ipContext);

  const prompt = `You are refining a world concept for a text RPG.

PLAYER CONCEPT:
Name: ${req.name}
Premise: ${req.premise}
${seedConstraints}${ipBlock}
REQUIREMENTS:
- Write only "refinedPremise" as 2-3 dense, evocative sentences.
- Keep the premise coherent, specific, and playable.
- If WORLD DNA constraints are present, you MUST incorporate all of them.
- If KNOWN IP CONTEXT is present, reflect its tone and core concepts via original names.${additionalInstruction ? `\nADDITIONAL INSTRUCTION FROM USER:\n${additionalInstruction}` : ""}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: refinedPremiseStepSchema,
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.refinedPremise;
}

export async function generateLocationsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  ipContext: IpResearchContext | null,
  additionalInstruction?: string
): Promise<WorldScaffold["locations"]> {
  const ipBlock = buildIpContextBlock(ipContext);

  const prompt = `You are generating locations for a text RPG world.

WORLD PREMISE:
${refinedPremise}
${ipBlock}
REQUIREMENTS:
- Create 4-6 locations with unique names.
- Exactly one location must have isStarting=true.
- Every other location must have isStarting=false.
- connectedTo values must reference only names from this same locations list.
- Keep connections coherent: no self-links, no invented names, and avoid isolated nodes.
- Keep descriptions vivid (2-3 sentences) and tags structural.
- If KNOWN IP CONTEXT is present, create locations that feel authentic to that world's geography and naming conventions (but with original names).${additionalInstruction ? `\nADDITIONAL INSTRUCTION FROM USER:\n${additionalInstruction}` : ""}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: locationsStepSchema,
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.locations;
}

export async function generateFactionsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string
): Promise<WorldScaffold["factions"]> {
  const ipBlock = buildIpContextBlock(ipContext);

  const prompt = `You are generating factions for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}
${ipBlock}
REQUIREMENTS:
- Create 2-5 factions with distinct motives.
- territoryNames must contain only names from KNOWN LOCATIONS.
- Do not invent or reference unknown locations.
- Goals and assets should create tension and player-facing opportunities.
- If KNOWN IP CONTEXT is present, model faction archetypes on the IP's factions/races (but with original names and adjusted themes).${additionalInstruction ? `\nADDITIONAL INSTRUCTION FROM USER:\n${additionalInstruction}` : ""}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: factionsStepSchema,
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.factions;
}

export async function generateNpcsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string
): Promise<WorldScaffold["npcs"]> {
  const ipBlock = buildIpContextBlock(ipContext);

  const prompt = `You are generating key NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
REQUIREMENTS:
- Create 3-10 NPCs with unique identities.
- locationName must be one of KNOWN LOCATIONS.
- factionName must be either one of KNOWN FACTIONS or null.
- Persona and goals should naturally produce conflicts and alliances.
- If KNOWN IP CONTEXT is present, give NPCs archetypes, speech patterns, and motivations that resonate with the IP's tone (but use original names and backstories).${additionalInstruction ? `\nADDITIONAL INSTRUCTION FROM USER:\n${additionalInstruction}` : ""}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: npcsStepSchema,
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.npcs;
}

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
  onProgress?: (progress: GenerationProgress) => void,
  currentStep?: number,
  totalSteps?: number,
): Promise<IpResearchContext | null> {
  if (!ipContext) return null;

  if (currentStep !== undefined && totalSteps !== undefined) {
    reportProgress(onProgress, currentStep, totalSteps, `Checking research for ${step}...`);
  }

  const searchConfig = buildSearchConfig(req);
  return evaluateResearchSufficiency(ipContext, step, premise, req.role, searchConfig);
}

export async function generateWorldScaffold(
  req: GenerateScaffoldRequest,
  onProgress?: (progress: GenerationProgress) => void
): Promise<{ scaffold: WorldScaffold; enrichedIpContext: IpResearchContext | null }> {
  // ipContext is pre-cached from suggest-seeds phase (loaded from config.json)
  let ipContext = req.ipContext ?? null;
  if (ipContext) {
    log.info(`Using cached IP context: "${ipContext.franchise}" (${ipContext.keyFacts.length} facts, source: ${ipContext.source})`);
  }

  const totalSteps = 5;
  let currentStep = 0;

  reportProgress(onProgress, currentStep++, totalSteps, "Refining world premise");
  const refinedPremise = await generateRefinedPremiseStep(req, ipContext);
  log.info(`Premise refined (${refinedPremise.length} chars)`);

  // Sufficiency check before locations
  ipContext = await checkSufficiency(ipContext, "locations", refinedPremise, req);
  reportProgress(onProgress, currentStep++, totalSteps, "Building locations");
  const locations = await generateLocationsStep(req, refinedPremise, ipContext);
  log.info(`Generated ${locations.length} locations`);
  const locationNames = locations.map((location) => location.name);

  // Sufficiency check before factions
  ipContext = await checkSufficiency(ipContext, "factions", refinedPremise, req);
  reportProgress(onProgress, currentStep++, totalSteps, "Forging factions");
  const factions = await generateFactionsStep(req, refinedPremise, locationNames, ipContext);
  log.info(`Generated ${factions.length} factions`);
  const factionNames = factions.map((faction) => faction.name);

  // Sufficiency check before NPCs
  ipContext = await checkSufficiency(ipContext, "npcs", refinedPremise, req);
  reportProgress(onProgress, currentStep++, totalSteps, "Creating key NPCs");
  const npcs = await generateNpcsStep(
    req,
    refinedPremise,
    locationNames,
    factionNames,
    ipContext
  );
  log.info(`Generated ${npcs.length} NPCs`);

  const baseScaffold = { refinedPremise, locations, factions, npcs, loreCards: [] as ExtractedLoreCard[] };

  reportProgress(onProgress, currentStep++, totalSteps, "Extracting world lore");
  const loreCards = await extractLoreCards(baseScaffold, req.role, req.fallbackRole);
  log.info(`Extracted ${loreCards.length} lore cards`);

  return {
    scaffold: { refinedPremise, locations, factions, npcs, loreCards },
    enrichedIpContext: ipContext,
  };
}
