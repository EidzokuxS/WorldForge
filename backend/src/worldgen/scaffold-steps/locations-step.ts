import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import {
  buildCanonicalList,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildScaffoldPromptContract,
  buildStopSlopRules,
  buildWorldgenResearchContextBlock,
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
    kind: z.enum(["macro", "persistent_sublocation"]).optional(),
    parentLocationName: z.string().nullable().optional(),
  })).max(12),
});

type LocationPlanRow = z.infer<typeof locationPlanSchema>["locations"][number];

const MAX_LOCATION_PLAN_TOPOLOGY_ATTEMPTS = 3;

/** Single-entity detail schema -- NO name field (review fix #6: planned name is authoritative). */
const locationDetailSingleSchema = z.object({
  description: z.string().describe("2-3 concrete sentences: physical details, atmosphere, significance"),
  tags: z.array(z.string()).describe("Structural tags: [Warm], [Crowded], [Dangerous], [Controlled by X]"),
  connectedTo: z.array(z.string()).describe("Names of connected locations from the plan"),
});

const LOCATION_SCAFFOLD_PROMPT_CONTRACT = buildScaffoldPromptContract({
  marker: "STRUCTURED_OUTPUT_CONTRACT: scaffold-location.v1",
  title: "Location scaffold contract",
  requiredFields:
    'Plan returns "locations"; each item has "name", "purpose", "isStarting", "kind", and "parentLocationName". Location rows are macro places plus physically contained persistent sublocations. Detail returns "description", "tags", and "connectedTo"; planned name, kind, and parentLocationName remain authoritative. Do not infer source, canon, franchise, or hierarchy meaning from raw names.',
  nestedShapes:
    '"locations": [{ "name": "Signal Base", "purpose": "Coordinates anomalous signal monitoring.", "isStarting": false, "kind": "macro", "parentLocationName": null }, { "name": "Signal Base Antenna Deck", "purpose": "Tracks sky signals from the base roof.", "isStarting": true, "kind": "persistent_sublocation", "parentLocationName": "Signal Base" }]; detail shape { "description": "...", "tags": ["Signal Array"], "connectedTo": ["Signal Base"] }.',
  caps:
    "Generate 5-12 total location rows, no more than 6 macro rows, no more than 6 persistent sublocation rows, and no more than 3 generated sublocations under any one macro; every macro row must have at least one persistent_sublocation child; one concrete persistent_sublocation isStarting=true; tags 3-5; connectedTo 1-3 names from the known location list and never the current location.",
  nullableRules:
    'Macro rows use "kind": "macro" and "parentLocationName": null. Persistent sublocation rows use "kind": "persistent_sublocation" and parentLocationName must exactly match a generated macro location name. A macro with no child sublocation is invalid because broad places become one crowded room at runtime. connectedTo and tags are arrays; return [] only when no valid link/tag exists. Do not use null for location arrays or booleans.',
  validMinimal:
    '{ "locations": [{ "name": "Signal Base", "purpose": "Coordinates anomalous signal monitoring.", "isStarting": false, "kind": "macro", "parentLocationName": null }, { "name": "Signal Base Antenna Deck", "purpose": "Tracks sky signals from the base roof.", "isStarting": true, "kind": "persistent_sublocation", "parentLocationName": "Signal Base" }] }',
  validExample:
    '{ "description": "A sealed ridge facility full of dish arrays.", "tags": ["Signal Array", "Guarded"], "connectedTo": ["Signal Base"] }',
  invalidExamples: [
    '{ "locations": "Signal Base, Market" }',
    '{ "name": "Signal Base", "connectedTo": "Market" }',
    '{ "locations": [{ "name": "Signal Basement", "kind": "persistent_sublocation", "parentLocationName": "Unknown Base" }] }',
    '{ "locations": [{ "name": "Signal Base", "kind": "macro", "parentLocationName": null }, { "name": "Market District", "kind": "macro", "parentLocationName": null }] }',
    '{ "locations": [{ "name": "Signal Base", "kind": "macro", "parentLocationName": null, "isStarting": true }, { "name": "Signal Base Antenna Deck", "kind": "persistent_sublocation", "parentLocationName": "Signal Base", "isStarting": false }] }',
    '{ "locations": [{ "name": "Excluded Mechanics Village", "sourceRole": "backend inferred canon" }] }',
    '{ "locations": [{ "name": "Naruto Village", "kind": "macro", "parentLocationName": null, "sourceRole": "backend inferred franchise from raw name" }] }',
  ],
});

function planKind(row: LocationPlanRow): "macro" | "persistent_sublocation" {
  return row.kind === "persistent_sublocation" ? "persistent_sublocation" : "macro";
}

function validateLocationPlanTopology(rows: readonly LocationPlanRow[]): string[] {
  const issues: string[] = [];
  const macroNames = new Set<string>();
  const childCounts = new Map<string, number>();
  const explicitMacroStarts = rows.filter(
    (row) => row.isStarting && planKind(row) === "macro",
  );

  for (const row of rows) {
    if (planKind(row) === "macro") {
      macroNames.add(row.name);
      childCounts.set(row.name, 0);
      if (row.parentLocationName?.trim()) {
        issues.push(`Macro "${row.name}" must use parentLocationName null.`);
      }
    }
  }

  for (const row of rows) {
    if (planKind(row) !== "persistent_sublocation") continue;
    const parentName = row.parentLocationName?.trim() ?? "";
    if (!parentName) {
      issues.push(`Persistent sublocation "${row.name}" is missing parentLocationName.`);
      continue;
    }
    if (!macroNames.has(parentName)) {
      issues.push(`Persistent sublocation "${row.name}" parentLocationName "${parentName}" does not match a generated macro.`);
      continue;
    }
    childCounts.set(parentName, (childCounts.get(parentName) ?? 0) + 1);
  }

  if (macroNames.size === 0) {
    issues.push("Location plan must include at least one macro location.");
  }

  for (const macroName of macroNames) {
    if ((childCounts.get(macroName) ?? 0) === 0) {
      issues.push(
        `Macro "${macroName}" has no persistent_sublocation child; add a concrete contained scene under it so broad NPC placement does not collapse into one room.`,
      );
    }
  }

  if (explicitMacroStarts.length > 0) {
    issues.push(
      `Starting location must be a concrete persistent_sublocation, not macro "${explicitMacroStarts[0]!.name}".`,
    );
  }

  return issues;
}

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
  const researchArtifact = req.researchArtifact ?? null;
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext,
    target: "locations",
  });
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        premiseDivergence,
        "locations",
      );
  const canonLocs = researchArtifact ? "" : buildCanonicalList(ipContext, "locations");

  // --- Call 1: PLAN ---
  const planInstruction = researchArtifact
    ? `Generate 5-12 total location rows using the research artifact source usage rules.
Use sources whose useFor includes locations, institutions, geography, or world structure.
Do NOT import locations, villages, nations, or geography from any source whose avoidFor includes locations, factions, npcs, or timeline.
If a source is only marked for power_system/mechanics, treat it as ability context only, not as setting geography.
Favor named locations and institutions from the artifact's generated context when the artifact rules allow them for locations.
Generate macro places plus physically contained persistent sublocations. Every macro must have at least one concrete playable child scene. If source material only provides a broad macro place, add a source-consistent contained scene under it as runtime scope without claiming extra canon authority. Do not infer source, canon, franchise, or hierarchy meaning from raw names.`
    : ipContext
    ? `You are writing a location reference for the ${ipContext.franchise} universe. Output 5-12 CANONICAL location rows.
${canonLocs}
HARD RULE: Your location names MUST come from the canonical list above. At least 5 out of your locations MUST use names EXACTLY as listed. You may add at most 1-2 original locations ONLY if the premise divergence logically creates a new place that does not exist in canon.
PROCEDURE:
1. Pick 5-12 rows from the CANONICAL LOCATIONS list above. These are your macro places plus physically contained persistent sublocations. Every macro must have at least one concrete playable child scene.
2. For each, note how the PREMISE DIVERGENCE changes its present state (leadership, allegiance, condition, inhabitants). If unchanged, keep it canon.
3. If the canonical list only provides broad macro names, add source-consistent contained scene rows beneath them as runtime scope. These child rows are playable scene structure, not a backend claim that canon uniquely names that exact room.
4. Only if the premise creates a genuinely new macro place (e.g., a new base for a reassigned character), add it as a later row with an original name.
Copy-paste canonical names exactly. Never translate, simplify, or invent substitutes. Do not infer source, canon, franchise, or hierarchy meaning from raw names.`
    : `Generate 5-12 total location rows for this original world: macro places plus physically contained persistent sublocations. Every macro must have at least one concrete playable child scene. Prioritize variety of function:
- At least 1 seat of political power (capital, palace, council hall)
- At least 1 economic hub (market town, trade port, mining settlement)
- At least 1 wilderness or frontier zone
- At least 1 location tied to the central conflict
- Remaining slots: fill gaps (religious site, criminal underworld, scholarly institution, physically contained sublocation, etc.)
Do not infer source, canon, franchise, or hierarchy meaning from raw names.`;

  let planned: LocationPlanRow[] | null = null;
  let topologyRepairInstruction = "";
  let lastTopologyIssues: string[] = [];

  for (let attempt = 0; attempt < MAX_LOCATION_PLAN_TOPOLOGY_ATTEMPTS; attempt += 1) {
    const plan = await generateObject({
      model: createModel(req.role.provider),
      schema: locationPlanSchema,
      prompt: `${planInstruction}

${LOCATION_SCAFFOLD_PROMPT_CONTRACT}
${topologyRepairInstruction}

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
CONSTRAINTS:
- Exactly ONE concrete persistent_sublocation has isStarting=true -- the player's starting scene. Pick a scene where a newcomer or young character would plausibly begin.
- Every macro location must have at least one explicit persistent_sublocation child. Do not leave a broad district, city, campus, base, or region as the only playable scene under that macro.
- Every location must serve a DIFFERENT narrative function. No two locations filling the same role (e.g., two "training grounds" or two "hidden bases").
- purpose: one sentence explaining what this location IS and why it matters to the world (not just to the premise).${additionalInstruction ? `\nADDITIONAL: ${additionalInstruction}` : ""}

${buildStopSlopRules()}`,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
    });

    lastTopologyIssues = validateLocationPlanTopology(plan.object.locations);
    if (lastTopologyIssues.length === 0) {
      planned = plan.object.locations;
      break;
    }

    topologyRepairInstruction = `
LOCATION TOPOLOGY REPAIR REQUIRED:
${lastTopologyIssues.map((issue) => `- ${issue}`).join("\n")}
Return a complete corrected locations array. Keep source-appropriate macro places, but add or reclassify explicit persistent_sublocation rows with parentLocationName matching the affected macro names. Backend will reject any plan that leaves macro rows without child scenes or starts the player on a macro row.`;
  }

  if (!planned) {
    throw new Error(
      `Location plan topology invalid after ${MAX_LOCATION_PLAN_TOPOLOGY_ATTEMPTS} attempts: ${lastTopologyIssues.join(" ")}`,
    );
  }

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

${LOCATION_SCAFFOLD_PROMPT_CONTRACT}

WORLD PREMISE:
${refinedPremise}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
ALL LOCATIONS IN THIS WORLD: ${nameList.join(", ")}

${previousSummary}LOCATION TO DETAIL NOW: "${entity.name}"
Purpose: ${entity.purpose}

FIELD INSTRUCTIONS:
- description: Exactly 2-3 sentences. Sentence 1 = physical appearance (size, terrain, architecture). Sentence 2 = who lives/works here and what they do. Sentence 3 (optional) = what changed due to the premise, or a notable danger/resource.${!researchArtifact && ipContext ? ` For known-IP locations: start from the canonical location, then describe only the present-state consequences of PREMISE DIVERGENCE. Keep unrelated canon intact.` : ""}
- tags: Mechanical tags the game engine reads. Format: [Adjective] or [Controlled by FactionName]. Examples: [Warm], [Crowded], [Dangerous], [Poor], [Fortified], [Controlled by Iron Guard]. 3-5 tags per location.
- connectedTo: Which other locations a player can travel to from here. ONLY use names from this list: ${nameList.join(", ")}. Never link a location to itself ("${entity.name}"). Each location connects to 1-3 others. Consider connections to ALREADY DETAILED locations above for consistency.

${buildStopSlopRules()}`,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
    });

    // REVIEW FIX #6: Force planned name as authoritative
    const locationKind = entity.kind === "persistent_sublocation" ? "persistent_sublocation" : "macro";
    detailed.push({
      name: entity.name,  // From plan, NOT from LLM output
      description: detail.object.description,
      tags: detail.object.tags,
      isStarting: entity.isStarting ?? false,
      connectedTo: detail.object.connectedTo.filter((n) =>
        nameList.some(valid => valid.toLowerCase() === n.toLowerCase()) &&
        n.toLowerCase() !== entity.name.toLowerCase()
      ),
      kind: locationKind,
      parentLocationName: locationKind === "persistent_sublocation"
        ? entity.parentLocationName ?? null
        : null,
    });
  }

  if (detailed.length === 0) {
    return detailed;
  }

  // Keep location planning best-effort: if the model omitted or duplicated
  // the starting flag, normalize to exactly one starting location.
  const firstStartingIndex = detailed.findIndex((loc) => loc.isStarting);
  const firstSublocationIndex = detailed.findIndex(
    (loc) => loc.kind === "persistent_sublocation",
  );
  const normalizedStartingIndex = firstStartingIndex >= 0
    ? firstStartingIndex
    : firstSublocationIndex >= 0
      ? firstSublocationIndex
      : 0;

  return detailed.map((loc, index) => ({
    ...loc,
    isStarting: index === normalizedStartingIndex,
  }));
}
