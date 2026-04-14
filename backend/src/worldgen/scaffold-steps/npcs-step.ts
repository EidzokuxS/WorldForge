import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import type { IpResearchContext } from "@worldforge/shared";
import { fromLegacyScaffoldNpc } from "../../character/record-adapters.js";
import { enrichKnownIpWorldgenNpcDraft } from "../../character/known-ip-worldgen-research.js";
import type { GenerateScaffoldRequest, GenerationProgress, ScaffoldNpc } from "../types.js";
import { buildCharacterPromptContract } from "../../character/prompt-contract.js";
import {
  buildIpContextBlock,
  buildCanonicalList,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  formatNameList,
  buildStopSlopRules,
  reportSubProgress,
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

/**
 * Per-entity detail schema. CRITICAL: No `name` field.
 * The planned name is authoritative (review fix #6).
 */
const npcDetailSingleSchema = z.object({
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
  selfImage: z
    .string()
    .default("")
    .describe(
      "1 sentence: how this character privately frames their own role, worth, or burden. Must not duplicate persona verbatim."
    ),
  socialRoles: z
    .array(z.string())
    .default([])
    .describe(
      "1-3 concise in-world roles or statuses, e.g. [Teacher], [Clan Heir], [Border Commander]. Do not include generic system labels like NPC or player."
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
  selfImage: string;
  socialRoles: string[];
}

interface PreviousNpcDetailContext {
  name: string;
  tier: string;
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

function buildPreviousNpcSection(
  previouslyDetailed: PreviousNpcDetailContext[],
  mode: "full" | "compact" | "none",
): string {
  if (mode === "none" || previouslyDetailed.length === 0) {
    return "";
  }

  if (mode === "compact") {
    return `ALREADY DETAILED NPCs:\n${previouslyDetailed.map((n) =>
      `- ${n.name} (${n.tier}) [Tags: ${n.tags.slice(0, 3).join(", ")}]`
    ).join("\n")}\n`;
  }

  return `ALREADY DETAILED NPCs:\n${previouslyDetailed.map((n) =>
    `- ${n.name} (${n.tier}): ${n.persona} [Tags: ${n.tags.join(", ")}] [Goals: ${n.goals.shortTerm.join("; ")} / ${n.goals.longTerm.join("; ")}]`
  ).join("\n")}\n`;
}

async function generateNpcDetail(opts: {
  req: GenerateScaffoldRequest;
  npc: PlannedNpc;
  refinedPremise: string;
  locationNames: string[];
  factionNames: string[];
  allPlanned: PlannedNpc[];
  ipBlock: string;
  knownIpContract: string;
  divergenceBlock: string;
  ipPersonaRule: string;
  previouslyDetailed: PreviousNpcDetailContext[];
}): Promise<z.infer<typeof npcDetailSingleSchema>> {
  const attemptModes: Array<"full" | "compact" | "none"> = ["full", "compact", "none"];
  let lastError: Error | undefined;

  for (const mode of attemptModes) {
    const previousSection = buildPreviousNpcSection(opts.previouslyDetailed, mode);
    const prompt = `You are detailing a single NPC for a text RPG engine. The engine reads these fields mechanically -- follow the format exactly.

WORLD PREMISE:
${opts.refinedPremise}

KNOWN LOCATIONS: ${opts.locationNames.join(", ")}
KNOWN FACTIONS: ${opts.factionNames.join(", ")}
ALL NPCs IN THIS WORLD: ${opts.allPlanned.map((n) => `${n.name} (${n.tier})`).join(", ")}
${opts.ipBlock}
${opts.knownIpContract ? `${opts.knownIpContract}\n` : ""}${opts.divergenceBlock ? `${opts.divergenceBlock}\n` : ""}
${previousSection}
NPC TO DETAIL NOW: "${opts.npc.name}" (${opts.npc.tier})
Role: ${opts.npc.role}
Location: ${opts.npc.locationName}, Faction: ${opts.npc.factionName ?? "none"}

SHARED CONTRACT:
${WORLDGEN_NPC_DETAIL_CONTRACT}

FIELD INSTRUCTIONS:
- persona: Exactly 2-3 sentences. Sentence 1 = who they are and their background. Sentence 2 = personality and how they treat others. Sentence 3 (optional) = a specific skill, secret, or relationship that matters for gameplay. Never write "mysterious" or "enigmatic" -- state concrete facts. Consider relationships with ALREADY DETAILED NPCs above -- reference them by name where relevant.
- selfImage: Exactly 1 sentence in this character's own frame. What do they privately think they are, owe, protect, deserve, or refuse to become? This must add something new beyond persona.
- socialRoles: 1-3 concise in-world roles/statuses. Good: [Teacher], [Special Grade Sorcerer], [Clan Heir], [Border Commander]. Bad: [NPC], [Character], [Important Person].
- tags: Gameplay-relevant traits and skills. Format: [Trait] or [Skill]. Examples: [Master Swordsman], [Cynical], [Wealthy], [Poisoner], [Charismatic], [Illiterate]. 3-5 tags per NPC.
- goals: An object with EXACTLY two keys: "shortTerm" and "longTerm".
  - "shortTerm": array of 1-2 strings. Current objectives the character is actively pursuing RIGHT NOW.
  - "longTerm": array of 1-2 strings. Life ambitions or multi-year plans.
  - CRITICAL: The keys MUST be "shortTerm" and "longTerm" (camelCase).
${opts.ipPersonaRule}

OUTPUT LIMITS:
- Keep persona under 120 words.
- Keep selfImage to one sentence.
- Return only the required JSON payload; do not include commentary.

${buildStopSlopRules()}`;

    try {
      const detail = await generateObject({
        model: createModel(opts.req.role.provider),
        schema: npcDetailSingleSchema,
        prompt,
        temperature: Math.min(opts.req.role.temperature, 0.35),
        maxOutputTokens: opts.req.role.maxTokens,
        retries: 1,
      });
      return detail.object;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw lastError ?? new Error(`Failed to generate NPC detail for ${opts.npc.name}.`);
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
 *
 * Detail calls are per-entity (1 NPC per LLM call) with a cross-tier
 * accumulator so each subsequent NPC sees full details of all previously
 * detailed NPCs.
 */
export async function generateNpcsStep(
  req: GenerateScaffoldRequest,
  refinedPremise: string,
  locationNames: string[],
  factionNames: string[],
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
  onProgress?: (progress: GenerationProgress) => void,
  progressStep?: number,
  progressTotalSteps?: number,
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

  // Compute shared prompt blocks once (constant for entire step)
  const ipBlock = buildIpContextBlock(ipContext);
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "npc details",
  );
  const ipPersonaRule = ipContext
    ? `- For known-IP characters: describe their canonical personality and backstory as modified by the present world state. Keep unaffected canon details intact, but do NOT reintroduce replaced protagonists or reverted relationships unless PREMISE DIVERGENCE explicitly says they coexist.`
    : "";

  // Phase C: Detail all NPCs sequentially (per-entity, not batched)
  const allDetailed: DetailedNpc[] = [];
  const previouslyDetailed: PreviousNpcDetailContext[] = [];

  for (let i = 0; i < allPlanned.length; i++) {
    const npc = allPlanned[i]!;
    const step = progressStep ?? 0;
    const total = progressTotalSteps ?? 1;

    if (onProgress) {
      reportSubProgress(
        onProgress,
        step,
        total,
        "Creating NPCs...",
        i,
        allPlanned.length,
        `NPC: ${npc.name} (${npc.tier})`,
      );
    }

    const detail = await generateNpcDetail({
      req,
      npc,
      refinedPremise,
      locationNames,
      factionNames,
      allPlanned,
      ipBlock,
      knownIpContract,
      divergenceBlock,
      ipPersonaRule,
      previouslyDetailed,
    });

    // REVIEW FIX #6: Force planned name as authoritative
    allDetailed.push({
      name: npc.name, // From plan, NOT from LLM output
      persona: detail.persona,
      tags: detail.tags,
      goals: detail.goals,
      selfImage: detail.selfImage,
      socialRoles: detail.socialRoles,
    });

    // Track for subsequent calls -- FULL detail, not truncated
    previouslyDetailed.push({
      name: npc.name, // Forced from plan
      tier: npc.tier,
      persona: detail.persona,
      tags: detail.tags,
      goals: detail.goals,
    });
  }

  // Merge plan + detail data
  const result: ScaffoldNpc[] = [];

  for (const detail of allDetailed) {
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

    const roleLabels = dedupeStrings([
      ...detail.socialRoles,
      planEntry?.role ?? "",
      factionName ?? "",
    ]);

    let draft = fromLegacyScaffoldNpc(legacyNpc, {
      canonicalStatus,
      sourceKind: "worldgen",
      currentLocationName: locationName,
      factionName,
      originMode: "resident",
    });

    draft = {
      ...draft,
      identity: {
        ...draft.identity,
        baseFacts: {
          biography: draft.identity.baseFacts?.biography ?? "",
          socialRole: roleLabels,
          hardConstraints: draft.identity.baseFacts?.hardConstraints ?? [],
        },
        behavioralCore: {
          motives: draft.identity.behavioralCore?.motives ?? [],
          pressureResponses: draft.identity.behavioralCore?.pressureResponses ?? [],
          taboos: draft.identity.behavioralCore?.taboos ?? [],
          attachments: draft.identity.behavioralCore?.attachments ?? [],
          selfImage: detail.selfImage.trim(),
        },
      },
    };

    if (ipContext && tier === "key") {
      draft = await enrichKnownIpWorldgenNpcDraft({
        draft,
        franchise: ipContext.franchise,
        role: req.role,
        research: req.research,
        premise: refinedPremise,
        premiseDivergence: req.premiseDivergence,
      });
    }

    result.push({
      ...legacyNpc,
      draft: {
        ...draft,
        provenance: {
          ...draft.provenance,
          worldgenOrigin: planEntry?.role ?? null,
        },
      },
    });
  }

  // If additionalInstruction provided, it was already considered in the prompts
  // (unused in current flow but kept for signature compatibility)
  void additionalInstruction;

  return result;
}
function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (key === "npc" || key === "player" || seen.has(key)) continue;

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}
