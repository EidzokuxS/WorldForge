import { z } from "zod";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/index.js";
import {
  buildIpContextBlock,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
} from "./prompt-utils.js";
import type {
  ScaffoldLocation,
  ScaffoldFaction,
  ScaffoldNpc,
  GenerateScaffoldRequest,
} from "../types.js";
import type { IpResearchContext } from "@worldforge/shared";

// ---------------------------------------------------------------------------
// Location regen schema — NO name field (review fix #6: name forced from plan)
// ---------------------------------------------------------------------------

const locationRegenSchema = z.object({
  description: z.string(),
  tags: z.array(z.string()),
  connectedTo: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// regenerateLocationEntity
// ---------------------------------------------------------------------------

export async function regenerateLocationEntity(
  entity: ScaffoldLocation,
  fix: string,
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  ipContext: IpResearchContext | null,
  currentLocations: readonly ScaffoldLocation[], // REVIEW FIX #4: current-round state, not stale
): Promise<ScaffoldLocation> {
  const ipBlock = buildIpContextBlock(ipContext);
  const divergenceBlock = buildPremiseDivergenceBlock(req.premiseDivergence ?? null);
  const allNames = currentLocations.map(l => l.name);
  const otherLocations = currentLocations
    .filter(l => l.name.toLowerCase() !== entity.name.toLowerCase())
    .map(l => `- ${l.name}: ${l.description} [Tags: ${l.tags.join(", ")}]`)
    .join("\n");

  // REVIEW FIX #6: Schema does NOT include name -- we force it from the plan
  const result = await safeGenerateObject({
    model: createModel(req.role.provider),
    schema: locationRegenSchema,
    prompt: `You are rewriting a location for a text RPG engine. Fix the specific issue described below.

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${divergenceBlock ? `${divergenceBlock}\n` : ""}
ALL LOCATION NAMES: ${allNames.join(", ")}

OTHER LOCATIONS:
${otherLocations}

LOCATION TO FIX: "${entity.name}"
Current description: ${entity.description}
Current tags: ${entity.tags.join(", ")}
Current connections: ${entity.connectedTo.join(", ")}

ISSUE TO FIX:
${fix}

Rewrite this location's description, tags, and connectedTo. Fix the flagged issue while preserving all other correct details.
connectedTo: ONLY use names from: ${allNames.join(", ")}. Never include "${entity.name}" itself.

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  // REVIEW FIX #6: Force planned name as authoritative
  return {
    ...entity,
    description: result.object.description,
    tags: result.object.tags,
    connectedTo: result.object.connectedTo.filter(n =>
      allNames.some(valid => valid.toLowerCase() === n.toLowerCase()) &&
      n.toLowerCase() !== entity.name.toLowerCase()
    ),
  };
}

// ---------------------------------------------------------------------------
// Faction regen schema — NO name field (review fix #6)
// ---------------------------------------------------------------------------

const factionRegenSchema = z.object({
  tags: z.array(z.string()),
  goals: z.array(z.string()).min(1).max(3),
  assets: z.array(z.string()).min(1).max(3),
  territoryNames: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// regenerateFactionEntity
// ---------------------------------------------------------------------------

export async function regenerateFactionEntity(
  entity: ScaffoldFaction,
  fix: string,
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: readonly string[],
  ipContext: IpResearchContext | null,
  currentFactions: readonly ScaffoldFaction[], // REVIEW FIX #4
): Promise<ScaffoldFaction> {
  const ipBlock = buildIpContextBlock(ipContext);
  const divergenceBlock = buildPremiseDivergenceBlock(req.premiseDivergence ?? null);
  // REVIEW FIX #3 (D-05): Include ALL canonical faction names
  const allFactionNames = currentFactions.map(f => f.name);

  // REVIEW FIX #6: Schema does NOT include name
  const result = await safeGenerateObject({
    model: createModel(req.role.provider),
    schema: factionRegenSchema,
    prompt: `You are rewriting a faction for a text RPG engine. Fix the specific issue described below.

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${divergenceBlock ? `${divergenceBlock}\n` : ""}
KNOWN LOCATIONS: ${[...locationNames].join(", ")}
ALL FACTION NAMES: ${allFactionNames.join(", ")}

FACTION TO FIX: "${entity.name}"
Current tags: ${entity.tags.join(", ")}
Current goals: ${entity.goals.join("; ")}
Current assets: ${entity.assets.join("; ")}
Current territory: ${entity.territoryNames.join(", ")}

ISSUE TO FIX:
${fix}

Rewrite this faction's tags, goals, assets, and territoryNames. Fix the flagged issue while preserving all other correct details.
territoryNames: ONLY use names from: ${[...locationNames].join(", ")}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  // REVIEW FIX #6: Force planned name
  return {
    ...entity,
    tags: result.object.tags,
    goals: result.object.goals,
    assets: result.object.assets,
    territoryNames: result.object.territoryNames.filter(t =>
      [...locationNames].some(valid => valid.toLowerCase() === t.toLowerCase())
    ),
  };
}

// ---------------------------------------------------------------------------
// NPC regen schema — NO name field (review fix #6), goals union+catch
// ---------------------------------------------------------------------------

const npcRegenGoalsSchema = z.union([
  z.object({
    shortTerm: z.array(z.string()).min(1).max(3),
    longTerm: z.array(z.string()).min(1).max(3),
  }),
  z.object({
    short_term: z.array(z.string()).min(1).max(3),
    long_term: z.array(z.string()).min(1).max(3),
  }).transform((g) => ({ shortTerm: g.short_term, longTerm: g.long_term })),
]).catch({ shortTerm: ["Survive"], longTerm: ["Find purpose"] });

const npcRegenSchema = z.object({
  persona: z.string(),
  tags: z.array(z.string()),
  goals: npcRegenGoalsSchema,
});

// ---------------------------------------------------------------------------
// regenerateNpcEntity
// ---------------------------------------------------------------------------

export async function regenerateNpcEntity(
  entity: ScaffoldNpc,
  fix: string,
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: readonly string[],
  factionNames: readonly string[],
  ipContext: IpResearchContext | null,
  currentNpcs: readonly ScaffoldNpc[], // REVIEW FIX #4
): Promise<ScaffoldNpc> {
  const ipBlock = buildIpContextBlock(ipContext);
  const divergenceBlock = buildPremiseDivergenceBlock(req.premiseDivergence ?? null);
  // REVIEW FIX #3 (D-05): Include ALL canonical NPC names
  const allNpcNames = currentNpcs.map(n => n.name);

  // REVIEW FIX #6: Schema does NOT include name
  const result = await safeGenerateObject({
    model: createModel(req.role.provider),
    schema: npcRegenSchema,
    prompt: `You are rewriting an NPC for a text RPG engine. Fix the specific issue described below.

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${divergenceBlock ? `${divergenceBlock}\n` : ""}
KNOWN LOCATIONS: ${[...locationNames].join(", ")}
KNOWN FACTIONS: ${[...factionNames].join(", ")}
ALL NPC NAMES: ${allNpcNames.join(", ")}

NPC TO FIX: "${entity.name}" (${entity.tier ?? "unknown"})
Location: ${entity.locationName}, Faction: ${entity.factionName ?? "none"}
Current persona: ${entity.persona}
Current tags: ${entity.tags.join(", ")}
Current goals: shortTerm=[${entity.goals.shortTerm.join("; ")}], longTerm=[${entity.goals.longTerm.join("; ")}]

ISSUE TO FIX:
${fix}

Rewrite this NPC's persona, tags, and goals. Fix the flagged issue while preserving all other correct details.
- goals MUST have keys "shortTerm" and "longTerm" (camelCase), each an array of 1-3 strings.

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  // REVIEW FIX #6: Force planned name. Preserve tier, locationName, factionName, draft
  return {
    ...entity,
    persona: result.object.persona,
    tags: result.object.tags,
    goals: result.object.goals,
  };
}
