import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import type { IpResearchContext } from "@worldforge/shared";
import { fromLegacyScaffoldNpc } from "../../character/record-adapters.js";
import type { GenerateScaffoldRequest, ScaffoldNpc } from "../types.js";
import { buildCharacterPromptContract } from "../../character/prompt-contract.js";
import {
  buildIpContextBlock,
  buildCanonicalList,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  formatNameList,
  buildStopSlopRules,
} from "./prompt-utils.js";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const npcPlanSchema = z.object({
  npcs: z.array(
    z.object({
      name: z.string(),
      role: z.string().describe("1 line: what role this character plays"),
      locationName: z.string(),
      factionName: z.string().nullable(),
    })
  ),
});

const npcDetailSchema = z.object({
  npcs: z.array(
    z.object({
      name: z.string(),
      persona: z
        .string()
        .describe(
          "2-3 sentences: personality, background, motivation. Concrete details, no vague archetypes."
        ),
      tags: z
        .array(z.string())
        .describe(
          "Character traits and skills: [Master Swordsman], [Cynical], [Wealthy]"
        ),
      goals: z
        .union([
          z.object({
            shortTerm: z.array(z.string()).min(1).max(3),
            longTerm: z.array(z.string()).min(1).max(3),
          }),
          z.object({
            short_term: z.array(z.string()).min(1).max(3),
            long_term: z.array(z.string()).min(1).max(3),
          }).transform((g) => ({ shortTerm: g.short_term, longTerm: g.long_term })),
        ])
        .catch({ shortTerm: ["Survive"], longTerm: ["Find purpose"] }),
    })
  ),
});

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PlannedNpc {
  name: string;
  role: string;
  locationName: string;
  factionName: string | null;
  tier: "key" | "supporting";
}

interface DetailedNpc {
  name: string;
  persona: string;
  tags: string[];
  goals: { shortTerm: string[]; longTerm: string[] };
}

const WORLDGEN_NPC_DETAIL_CONTRACT = buildCharacterPromptContract({
  roleEmphasis:
    "For worldgen NPC details, use the shared draft pipeline: keep identity, profile, socialContext, motivations, capabilities, state, loadout, startConditions, and provenance coherent before projecting scaffold-compatible fields.",
});

// ---------------------------------------------------------------------------
// Plan calls
// ---------------------------------------------------------------------------

async function planKeyNpcs(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
): Promise<PlannedNpc[]> {
  const ipBlock = buildIpContextBlock(ipContext);
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "key npcs",
  );

  const canonChars = buildCanonicalList(ipContext, "characters");

  const keyInstruction = ipContext
    ? `List 6-10 CANONICAL characters from ${ipContext.franchise}.
${canonChars}
HARD RULE: Your character names MUST come from the canonical list above. Do NOT invent original characters for the key tier.
PROCEDURE:
1. Pick 6-10 names from the CANONICAL CHARACTERS list above.
2. Include canonical characters who are active in the PRESENT WORLD STATE after PREMISE DIVERGENCE.
3. If PREMISE DIVERGENCE says a canonical protagonist was replaced or is absent, do NOT include that character in the current cast unless the divergence explicitly says they still coexist.
4. Add other canon characters who would logically interact with the changed world state while preserving unaffected canon.
Copy-paste canonical full names exactly. Assign each to a location and faction from the lists below.`
    : `List 6-8 key characters who hold power, drive conflict, or control resources in this world. Each must connect to at least one faction or location. Ensure variety:
- At least 1 political leader
- At least 1 antagonist or rival
- At least 1 mentor or ally figure
- At least 1 wild card (spy, trickster, rogue agent)`;

  const prompt = `You are planning key NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
TASK: ${keyInstruction}

FIELD CONSTRAINTS:
- locationName: MUST exactly match one name from KNOWN LOCATIONS above. Copy-paste the name.
- factionName: MUST exactly match one name from KNOWN FACTIONS above, or be null if the character is unaffiliated.
- role: One sentence stating what this character DOES (their function in the world), not who they ARE.

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({
      // Treat plan generation as best-effort: ask for 6-10 in the prompt,
      // but don't fail the whole worldgen step if the model returns fewer.
      npcs: npcPlanSchema.shape.npcs.max(10),
    }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.npcs.map((npc) => ({
    ...npc,
    locationName: validateLocation(npc.locationName, locationNames),
    factionName: validateFaction(npc.factionName, factionNames),
    tier: "key" as const,
  }));
}

async function planSupportingNpcs(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
  keyNames: string[],
): Promise<PlannedNpc[]> {
  const ipBlock = buildIpContextBlock(ipContext);
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "supporting npcs",
  );

  const supportingInstruction = ipContext
    ? `List 3-5 supporting characters. These can be minor canonical characters or original characters created only where PREMISE DIVERGENCE or gameplay needs require them. They must fill GAMEPLAY roles not covered by key characters: merchants, informants, gatekeepers, quest givers, local rivals. Preserve unaffected canon support characters when they still fit the present world state.`
    : `List 3-5 supporting characters who serve specific gameplay functions. Each must offer the player something concrete: goods to buy, information to trade, jobs to accept, or obstacles to overcome.`;

  const prompt = `You are planning supporting NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
KEY CHARACTERS ALREADY PLANNED: ${keyNames.join(", ")}
Do NOT duplicate any key character. Supporting characters fill gaps — they give the player people to interact with in locations that lack key NPCs.

TASK: ${supportingInstruction}

FIELD CONSTRAINTS:
- locationName: MUST exactly match one name from KNOWN LOCATIONS above. Copy-paste the name. Prefer locations that have no key NPCs assigned yet.
- factionName: MUST exactly match one name from KNOWN FACTIONS above, or be null if unaffiliated.
- role: One sentence stating this character's GAMEPLAY FUNCTION (what they offer the player), not personality.

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({
      // Supporting NPCs are additive; partial output is still usable.
      npcs: npcPlanSchema.shape.npcs.max(5),
    }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.npcs.map((npc) => ({
    ...npc,
    locationName: validateLocation(npc.locationName, locationNames),
    factionName: validateFaction(npc.factionName, factionNames),
    tier: "supporting" as const,
  }));
}

// ---------------------------------------------------------------------------
// Detail calls (batches of 4-5)
// ---------------------------------------------------------------------------

async function detailNpcBatch(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
  batch: PlannedNpc[],
  previouslyDetailed: Array<{ name: string; tier: string; persona: string }>,
): Promise<DetailedNpc[]> {
  const ipBlock = buildIpContextBlock(ipContext);
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "npc details",
  );

  const previousSection =
    previouslyDetailed.length > 0
      ? `ALREADY DETAILED NPCs:\n${previouslyDetailed.map((n) => `- ${n.name} (${n.tier}): ${n.persona.slice(0, 60)}`).join("\n")}\n`
      : "";

  const ipPersonaRule = ipContext
    ? `- For known-IP characters: describe their canonical personality and backstory as modified by the present world state. Keep unaffected canon details intact, but do NOT reintroduce replaced protagonists or reverted relationships unless PREMISE DIVERGENCE explicitly says they coexist.`
    : "";

  const prompt = `You are detailing NPCs for a text RPG engine. The engine reads these fields mechanically — follow the format exactly.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationNames.join(", ")}
KNOWN FACTIONS: ${factionNames.join(", ")}
${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
${previousSection}
NPCs TO DETAIL NOW:
${batch.map((b) => `- ${b.name} (${b.tier}): ${b.role}`).join("\n")}

SHARED CONTRACT:
${WORLDGEN_NPC_DETAIL_CONTRACT}
Project the canonical character facets into scaffold-compatible fields:
- profile and world role should drive persona.
- socialContext should stay consistent with locationName and factionName.
- motivations should drive goals.shortTerm and goals.longTerm.
- tags are derived runtime tags: a compatibility view over the canonical record, not a separate schema.

FIELD INSTRUCTIONS:
- persona: Exactly 2-3 sentences. Sentence 1 = who they are and their background. Sentence 2 = personality and how they treat others. Sentence 3 (optional) = a specific skill, secret, or relationship that matters for gameplay. Never write "mysterious" or "enigmatic" — state concrete facts.
- tags: Gameplay-relevant traits and skills. Format: [Trait] or [Skill]. Examples: [Master Swordsman], [Cynical], [Wealthy], [Poisoner], [Charismatic], [Illiterate]. 3-5 tags per NPC.
- goals: An object with EXACTLY two keys: "shortTerm" and "longTerm".
  - "shortTerm": array of 1-2 strings. Current objectives the character is actively pursuing RIGHT NOW. Each goal names a specific action, target, or deadline.
  - "longTerm": array of 1-2 strings. Life ambitions or multi-year plans. Each goal names a specific outcome, not a vague aspiration.
  - Example: { "shortTerm": ["Recover the stolen shipment before the festival"], "longTerm": ["Become guild master of the Merchants' Circle"] }
  - CRITICAL: The keys MUST be "shortTerm" and "longTerm" (camelCase). NOT "short_term", NOT "short-term".
${ipPersonaRule}

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({
      npcs: npcDetailSchema.shape.npcs.min(1).max(batch.length),
    }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.npcs;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

function validateLocation(
  locationName: string,
  locationNames: string[],
): string {
  if (locationNames.length === 0) return locationName;

  // Exact match
  if (locationNames.includes(locationName)) return locationName;

  // Case-insensitive match
  const lower = locationName.toLowerCase();
  const match = locationNames.find((n) => n.toLowerCase() === lower);
  if (match) return match;

  // Fallback to first location
  return locationNames[0] ?? locationName;
}

function validateFaction(
  factionName: string | null,
  factionNames: string[],
): string | null {
  if (factionName === null) return null;
  if (factionNames.length === 0) return null;

  // Exact match
  if (factionNames.includes(factionName)) return factionName;

  // Case-insensitive match
  const lower = factionName.toLowerCase();
  const match = factionNames.find((n) => n.toLowerCase() === lower);
  if (match) return match;

  // Unknown faction -> null
  return null;
}

// ---------------------------------------------------------------------------
// Batch utility
// ---------------------------------------------------------------------------

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    result.push(arr.slice(i, i + size));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate NPCs in two tiers (key + supporting) via plan+detail mini-calls.
 *
 * Key NPCs (6-10): canonical characters for known IPs, or plot-driving
 * characters for original worlds.
 *
 * Supporting NPCs (3-5): gap-filling characters (merchants, informants, etc.)
 *
 * Total: 10-15 NPCs, each with a `tier` field.
 */
export async function generateNpcsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
): Promise<ScaffoldNpc[]> {
  // Phase A: Plan key NPCs
  const keyPlanned = await planKeyNpcs(
    req,
    refinedPremise,
    locationNames,
    factionNames,
    ipContext,
  );

  const keyNames = keyPlanned.map((n) => n.name);

  // Phase B: Plan supporting NPCs
  const supportingPlanned = await planSupportingNpcs(
    req,
    refinedPremise,
    locationNames,
    factionNames,
    ipContext,
    keyNames,
  );

  // Combine all planned NPCs
  const allPlanned: PlannedNpc[] = [...keyPlanned, ...supportingPlanned];

  // Phase C: Detail all NPCs in batches of 3
  const batches = chunk(allPlanned, 3);
  const allDetailed: DetailedNpc[] = [];
  const previouslyDetailed: Array<{
    name: string;
    tier: string;
    persona: string;
  }> = [];

  for (const batch of batches) {
    const detailed = await detailNpcBatch(
      req,
      refinedPremise,
      locationNames,
      factionNames,
      ipContext,
      batch,
      previouslyDetailed,
    );

    allDetailed.push(...detailed);

    // Track for subsequent batches
    for (const d of detailed) {
      const planEntry = batch.find(
        (p) => p.name.toLowerCase() === d.name.toLowerCase(),
      );
      previouslyDetailed.push({
        name: d.name,
        tier: planEntry?.tier ?? "supporting",
        persona: d.persona,
      });
    }
  }

  // Merge plan + detail data
  const result: ScaffoldNpc[] = allDetailed.map((detail) => {
    const planEntry = allPlanned.find(
      (p) => p.name.toLowerCase() === detail.name.toLowerCase(),
    );
    const locationName = planEntry?.locationName ?? locationNames[0] ?? "";
    const factionName = planEntry?.factionName ?? null;
    const tier = planEntry?.tier ?? "supporting";
    const canonicalStatus = ipContext
      ? req.premiseDivergence && req.premiseDivergence.mode !== "canonical"
        ? "known_ip_diverged"
        : "known_ip_canonical"
      : "original";

    const legacyNpc = {
      name: detail.name,
      persona: detail.persona,
      tags: detail.tags,
      goals: detail.goals,
      locationName,
      factionName,
      tier,
    } satisfies ScaffoldNpc;

    return {
      ...legacyNpc,
      draft: fromLegacyScaffoldNpc(legacyNpc, {
        canonicalStatus,
        sourceKind: "worldgen",
        currentLocationName: locationName,
        factionName,
        originMode: "resident",
      }),
    };
  });

  // If additionalInstruction provided, it was already considered in the prompts
  // (unused in current flow but kept for signature compatibility)
  void additionalInstruction;

  return result;
}
