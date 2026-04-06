import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import {
  buildCanonicalList,
  buildIpContextBlock,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
  formatNameList,
  reportSubProgress,
} from "./prompt-utils.js";
import type { IpResearchContext } from "../ip-researcher.js";
import type { GenerateScaffoldRequest, GenerationProgress, ScaffoldFaction } from "../types.js";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const factionPlanSchema = z.object({
  factions: z.array(z.object({
    name: z.string(),
    purpose: z.string().describe("1 line: what role this faction plays in the world"),
  })).max(6),
});

/** Single-entity detail schema -- NO name field (review fix #6: planned name is authoritative). */
const factionDetailSingleSchema = z.object({
  tags: z.array(z.string()).describe("Faction traits: [Militaristic], [Secretive], [Trade-focused]"),
  goals: z.array(z.string()).min(1).max(3).describe("1-3 concrete faction goals"),
  assets: z.array(z.string()).min(1).max(3).describe("1-3 faction resources or advantages"),
  territoryNames: z.array(z.string()).describe("Controlled locations from the known locations list"),
});

// ---------------------------------------------------------------------------
// generateFactionsStep -- plan + per-entity detail calls with accumulator
// ---------------------------------------------------------------------------

export async function generateFactionsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
  onProgress?: (progress: GenerationProgress) => void,
  progressStep?: number,
  progressTotalSteps?: number,
): Promise<ScaffoldFaction[]> {
  const ipBlock = buildIpContextBlock(ipContext);
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "factions",
  );
  const canonFactions = buildCanonicalList(ipContext, "factions");

  // --- Call 1: PLAN ---
  const planInstruction = ipContext
    ? `You are writing a faction reference for the ${ipContext.franchise} universe. Output 3-6 CANONICAL factions.
${canonFactions}
HARD RULE: Your faction names MUST come from the canonical list above. Do NOT invent new factions. The premise changes WHO leads or joins a faction, not WHETHER the faction exists.
PROCEDURE:
1. Pick 3-6 names from the CANONICAL FACTIONS list above. These ARE your factions.
2. For each, note how the PREMISE DIVERGENCE changes its leadership, goals, allegiance, or pressure points in the present world.
3. You may add a new faction ONLY if the premise explicitly describes one that has no canonical equivalent.
Copy-paste canonical faction names exactly. Never create "premise-themed" factions.`
    : `Generate 3-6 factions that form the political skeleton of this world. Ensure structural variety:
- At least 1 governing authority (state, council, empire)
- At least 1 opposition or rebel force
- At least 1 non-state power (merchant guild, criminal network, religious order, mage circle)
- Each faction must have at least one natural rival among the other factions.`;

  const plan = await generateObject({
    model: createModel(req.role.provider),
    schema: factionPlanSchema,
    prompt: `${planInstruction}

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
CONSTRAINTS:
- purpose: one sentence explaining what ROLE this faction plays in the world's power dynamics (not just its relationship to the premise).
- No two factions may fill the same structural role (e.g., two "secretive criminal organizations").
- Every faction must have at least one point of conflict with another faction in the list.${additionalInstruction ? `\nADDITIONAL: ${additionalInstruction}` : ""}

${buildStopSlopRules()}`,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  const planned = plan.object.factions;

  // --- Calls 2+: DETAIL (1 entity per LLM call with sequential accumulator) ---
  const detailed: ScaffoldFaction[] = [];

  for (let i = 0; i < planned.length; i++) {
    const entity = planned[i];
    const step = progressStep ?? 0;
    const total = progressTotalSteps ?? 1;

    if (onProgress) {
      reportSubProgress(onProgress, step, total, "Forging factions...", i, planned.length, `Faction: ${entity.name}`);
    }

    // Full detail of ALL previously generated factions (per D-02)
    const previousSummary = detailed.length > 0
      ? `ALREADY DETAILED FACTIONS:\n${detailed.map((f) =>
          `- ${f.name}: Goals: ${f.goals.join("; ")} | Assets: ${f.assets.join("; ")} | Territory: ${f.territoryNames.join(", ")} [Tags: ${f.tags.join(", ")}]`
        ).join("\n")}\n`
      : "";

    const detail = await generateObject({
      model: createModel(req.role.provider),
      schema: factionDetailSingleSchema,
      prompt: `You are writing a faction reference sheet for a text RPG engine. The engine reads these fields mechanically -- be precise.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationNames.join(", ")}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
ALL FACTIONS IN THIS WORLD: ${planned.map(f => f.name).join(", ")}

${previousSummary}FACTION TO DETAIL NOW: "${entity.name}"
Purpose: ${entity.purpose}

FIELD INSTRUCTIONS:
- tags: Mechanical trait tags. Format: [Adjective]. Examples: [Militaristic], [Secretive], [Wealthy], [Religious], [Expansionist], [Decentralized]. 2-4 tags per faction.
- goals: 1-3 SPECIFIC objectives with concrete targets. Bad: "Expand influence." Good: "Annex the northern mining towns before winter." Each goal names a place, person, resource, or deadline. Consider goals of ALREADY DETAILED factions above to ensure rival dynamics.
- assets: 1-3 concrete resources. Not "great power" -- name the specific army, spy network, trade fleet, artifact, or territory they control.
- territoryNames: Locations this faction controls or operates from. ONLY use names from this list: ${locationNames.join(", ")}. A faction may control 0 locations if it operates covertly or is nomadic. Avoid claiming territory already controlled by factions in ALREADY DETAILED above unless the faction explicitly contests it.${ipContext ? `\n- For known-IP factions: start from the canonical faction, then update only the goals, assets, territory, or alliances that PREMISE DIVERGENCE changes. Preserve untouched canon exactly.` : ""}

${buildStopSlopRules()}`,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
    });

    // REVIEW FIX #6: Force planned name as authoritative
    detailed.push({
      name: entity.name,  // From plan, NOT from LLM output
      tags: detail.object.tags,
      goals: detail.object.goals,
      assets: detail.object.assets,
      territoryNames: detail.object.territoryNames.filter((t) =>
        locationNames.some(valid => valid.toLowerCase() === t.toLowerCase())
      ),
    });
  }

  return detailed;
}
