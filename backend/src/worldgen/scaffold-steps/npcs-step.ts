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
    ? `List 6-10 canonical characters from "${ipContext.franchise}" who are most relevant to this premise. Use REAL canonical names (e.g., "Kakashi Hatake" not "Silver-haired Mentor", "Darth Vader" not "Dark Enforcer"). Include characters directly mentioned in the premise AND characters who would logically be affected by the premise changes.`
    : "List 6-8 key characters who drive this world's conflicts and story. Each must have a clear relationship to at least one faction or location.";

  const prompt = `You are planning key NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
TASK: ${keyInstruction}

RULES:
- locationName MUST be one of KNOWN LOCATIONS listed above.
- factionName MUST be one of KNOWN FACTIONS listed above, or null if unaffiliated.
- role: 1 sentence describing what this character does in the story.

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
    ? `List 3-5 supporting characters to round out the world. These can be original characters OR minor canonical characters. They should fill roles not covered by the key characters (merchants, informants, guards, rivals).`
    : "List 3-5 supporting characters who populate the world. Each serves a specific gameplay function (quest giver, merchant, rival, informant).";

  const prompt = `You are planning supporting NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS:
${formatNameList(locationNames)}

KNOWN FACTIONS:
${formatNameList(factionNames)}
${ipBlock}
KEY CHARACTERS ALREADY PLANNED: ${keyNames.join(", ")}
Supporting characters must NOT duplicate any key character. Fill gaps in the world.

TASK: ${supportingInstruction}

RULES:
- locationName MUST be one of KNOWN LOCATIONS listed above.
- factionName MUST be one of KNOWN FACTIONS listed above, or null if unaffiliated.
- role: 1 sentence describing this character's gameplay function.

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
    ? `- For known IP characters: persona must reflect their CANONICAL personality, modified only by the premise's butterfly effects.`
    : "";

  const prompt = `Detail these NPCs for a text RPG world.

WORLD PREMISE:
${refinedPremise}

KNOWN LOCATIONS: ${locationNames.join(", ")}
KNOWN FACTIONS: ${factionNames.join(", ")}
${ipBlock}
${previousSection}
NPCs TO DETAIL NOW:
${batch.map((b) => `- ${b.name} (${b.tier}): ${b.role}`).join("\n")}

RULES:
- persona: 2-3 sentences of CONCRETE personality and backstory. Not "a mysterious figure" but specific details about their history, skills, and relationships.
- tags: character traits and skills relevant to gameplay. Include combat abilities, social traits, wealth level.
- goals: 1-2 short-term (current objectives) and 1-2 long-term (life ambitions).
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
