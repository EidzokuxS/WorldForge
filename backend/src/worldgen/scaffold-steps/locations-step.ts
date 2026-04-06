import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import {
  buildCanonicalList,
  buildIpContextBlock,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
  reportSubProgress,
} from "./prompt-utils.js";
import type { IpResearchContext } from "../ip-researcher.js";
import type { GenerateScaffoldRequest, GenerationProgress, ScaffoldLocation } from "../types.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const locationPlanSchema = z.object({
  locations: z.array(z.object({
    name: z.string(),
    purpose: z.string().describe("1 line: why this location matters"),
    isStarting: z.boolean().default(false),
  })).max(8),
});

/** Single-entity detail schema -- NO name field (review fix #6: planned name is authoritative). */
const locationDetailSingleSchema = z.object({
  description: z.string().describe("2-3 concrete sentences: physical details, atmosphere, significance"),
  tags: z.array(z.string()).describe("Structural tags: [Warm], [Crowded], [Dangerous], [Controlled by X]"),
  connectedTo: z.array(z.string()).describe("Names of connected locations from the plan"),
});

// ---------------------------------------------------------------------------
// generateLocationsStep -- plan + per-entity detail calls with accumulator
// ---------------------------------------------------------------------------

export async function generateLocationsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
  onProgress?: (progress: GenerationProgress) => void,
  progressStep?: number,
  progressTotalSteps?: number,
): Promise<ScaffoldLocation[]> {
  const ipBlock = buildIpContextBlock(ipContext);
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "locations",
  );
  const canonLocs = buildCanonicalList(ipContext, "locations");

  // --- Call 1: PLAN ---
  const planInstruction = ipContext
    ? `You are writing a location reference for the ${ipContext.franchise} universe. Output 5-8 CANONICAL locations.
${canonLocs}
HARD RULE: Your location names MUST come from the canonical list above. At least 5 out of your locations MUST use names EXACTLY as listed. You may add at most 1-2 original locations ONLY if the premise divergence logically creates a new place that does not exist in canon.
PROCEDURE:
1. Pick 5-8 names from the CANONICAL LOCATIONS list above. These are your locations.
2. For each, note how the PREMISE DIVERGENCE changes its present state (leadership, allegiance, condition, inhabitants). If unchanged, keep it canon.
3. Only if the premise creates a genuinely new place (e.g., a new base for a reassigned character), add it as slot 6-8 with an original name.
Copy-paste canonical names exactly. Never translate, simplify, or invent substitutes.`
    : `Generate 5-8 locations for this original world. Prioritize variety of function:
- At least 1 seat of political power (capital, palace, council hall)
- At least 1 economic hub (market town, trade port, mining settlement)
- At least 1 wilderness or frontier zone
- At least 1 location tied to the central conflict
- Remaining slots: fill gaps (religious site, criminal underworld, scholarly institution, etc.)`;

  const plan = await generateObject({
    model: createModel(req.role.provider),
    schema: locationPlanSchema,
    prompt: `${planInstruction}

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
CONSTRAINTS:
- Exactly ONE location has isStarting=true -- the player's starting point. Pick a location where a newcomer or young character would plausibly begin.
- Every location must serve a DIFFERENT narrative function. No two locations filling the same role (e.g., two "training grounds" or two "hidden bases").
- purpose: one sentence explaining what this location IS and why it matters to the world (not just to the premise).${additionalInstruction ? `\nADDITIONAL: ${additionalInstruction}` : ""}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  const planned = plan.object.locations;
  const nameList = planned.map((l) => l.name);

  // --- Calls 2+: DETAIL (1 entity per LLM call with sequential accumulator) ---
  const detailed: ScaffoldLocation[] = [];

  for (let i = 0; i < planned.length; i++) {
    const entity = planned[i];
    const step = progressStep ?? 0;
    const total = progressTotalSteps ?? 1;

    if (onProgress) {
      reportSubProgress(onProgress, step, total, "Building locations...", i, planned.length, `Location: ${entity.name}`);
    }

    // Full detail of ALL previously generated locations (per D-02)
    const previousSummary = detailed.length > 0
      ? `ALREADY DETAILED LOCATIONS:\n${detailed.map((l) =>
          `- ${l.name}: ${l.description} [Tags: ${l.tags.join(", ")}] [Connected: ${l.connectedTo.join(", ")}]`
        ).join("\n")}\n`
      : "";

    const detail = await generateObject({
      model: createModel(req.role.provider),
      schema: locationDetailSingleSchema,
      prompt: `You are writing a location reference sheet for a text RPG engine. The engine uses these fields mechanically -- be precise.

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
ALL LOCATIONS IN THIS WORLD: ${nameList.join(", ")}

${previousSummary}LOCATION TO DETAIL NOW: "${entity.name}"
Purpose: ${entity.purpose}

FIELD INSTRUCTIONS:
- description: Exactly 2-3 sentences. Sentence 1 = physical appearance (size, terrain, architecture). Sentence 2 = who lives/works here and what they do. Sentence 3 (optional) = what changed due to the premise, or a notable danger/resource.${ipContext ? ` For known-IP locations: start from the canonical location, then describe only the present-state consequences of PREMISE DIVERGENCE. Keep unrelated canon intact.` : ""}
- tags: Mechanical tags the game engine reads. Format: [Adjective] or [Controlled by FactionName]. Examples: [Warm], [Crowded], [Dangerous], [Poor], [Fortified], [Controlled by Iron Guard]. 3-5 tags per location.
- connectedTo: Which other locations a player can travel to from here. ONLY use names from this list: ${nameList.join(", ")}. Never link a location to itself ("${entity.name}"). Each location connects to 1-3 others. Consider connections to ALREADY DETAILED locations above for consistency.

${buildStopSlopRules()}`,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
    });

    // REVIEW FIX #6: Force planned name as authoritative
    detailed.push({
      name: entity.name,  // From plan, NOT from LLM output
      description: detail.object.description,
      tags: detail.object.tags,
      isStarting: entity.isStarting ?? false,
      connectedTo: detail.object.connectedTo.filter((n) =>
        nameList.some(valid => valid.toLowerCase() === n.toLowerCase()) &&
        n.toLowerCase() !== entity.name.toLowerCase()
      ),
    });
  }

  if (detailed.length === 0) {
    return detailed;
  }

  // Keep location planning best-effort: if the model omitted or duplicated
  // the starting flag, normalize to exactly one starting location.
  const firstStartingIndex = detailed.findIndex((loc) => loc.isStarting);
  const normalizedStartingIndex = firstStartingIndex >= 0 ? firstStartingIndex : 0;

  return detailed.map((loc, index) => ({
    ...loc,
    isStarting: index === normalizedStartingIndex,
  }));
}
