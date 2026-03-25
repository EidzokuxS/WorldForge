import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import type { IpResearchContext } from "@worldforge/shared";
import type { GenerateScaffoldRequest, ScaffoldNpc } from "../types.js";
import {
  buildIpContextBlock,
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

  const keyInstruction = ipContext
    ? `List 6-10 CANONICAL characters from ${ipContext.franchise}.
HARD RULE: ALL key characters MUST be real, canonical characters from the franchise. Do NOT invent original characters for the key tier.
PROCEDURE:
1. List the franchise's major characters: protagonists, antagonists, mentors, political leaders, key supporting cast.
2. Include ALL characters named or implied by the premise.
3. Add other canonical characters who would logically interact with the premise changes.
Use canonical full names exactly as they appear in the franchise. Assign each to a canonical location and faction from the lists provided.`
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
TASK: ${keyInstruction}

FIELD CONSTRAINTS:
- locationName: MUST exactly match one name from KNOWN LOCATIONS above. Copy-paste the name.
- factionName: MUST exactly match one name from KNOWN FACTIONS above, or be null if the character is unaffiliated.
- role: One sentence stating what this character DOES (their function in the world), not who they ARE.

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({
      npcs: npcPlanSchema.shape.npcs.min(6).max(10),
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

  const supportingInstruction = ipContext
    ? `List 3-5 supporting characters. These can be minor canonical characters or original characters. They must fill GAMEPLAY roles not covered by key characters: merchants, informants, gatekeepers, quest givers, local rivals.`
    : `List 3-5 supporting characters who serve specific gameplay functions. Each must offer the player something concrete: goods to buy, information to trade, jobs to accept, or obstacles to overcome.`;

  const prompt = `You are planning supporting NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
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
      npcs: npcPlanSchema.shape.npcs.min(3).max(5),
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

  const previousSection =
    previouslyDetailed.length > 0
      ? `ALREADY DETAILED NPCs:\n${previouslyDetailed.map((n) => `- ${n.name} (${n.tier}): ${n.persona.slice(0, 60)}`).join("\n")}\n`
      : "";

  const ipPersonaRule = ipContext
    ? `- For known-IP characters: describe their canonical personality and backstory first, then note ONLY changes caused by the premise divergence.`
    : "";

  const prompt = `You are writing NPC reference cards for a text RPG engine. The engine reads these fields mechanically — follow the format exactly.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationNames.join(", ")}
KNOWN FACTIONS: ${factionNames.join(", ")}
${ipBlock}
${previousSection}
NPCs TO DETAIL NOW:
${batch.map((b) => `- ${b.name} (${b.tier}): ${b.role}`).join("\n")}

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

  // Phase C: Detail all NPCs in batches of 4-5
  const batches = chunk(allPlanned, 5);
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
    return {
      name: detail.name,
      persona: detail.persona,
      tags: detail.tags,
      goals: detail.goals,
      locationName: planEntry?.locationName ?? locationNames[0] ?? "",
      factionName: planEntry?.factionName ?? null,
      tier: planEntry?.tier ?? "supporting",
    };
  });

  // If additionalInstruction provided, it was already considered in the prompts
  // (unused in current flow but kept for signature compatibility)
  void additionalInstruction;

  return result;
}
