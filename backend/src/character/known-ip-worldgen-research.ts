import { z } from "zod";
import type {
  CharacterDraft,
  PowerStats,
  ResearchConfig,
  PremiseDivergence,
} from "@worldforge/shared";
import {
  AP_DURABILITY_TIERS,
  SPEED_TIERS,
  INTELLIGENCE_TIERS,
  normalizeApDurTier,
  normalizeSpeedTier,
  normalizeIntelligenceTier,
} from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { createModel } from "../ai/index.js";
import { webSearch, type SearchConfig } from "../lib/web-search.js";
import { clampTokens } from "../lib/clamp.js";
import { buildPowerStatsPromptContract } from "./prompt-contract.js";

/**
 * Coerced Zod schema for LLM output. Uses z.preprocess to normalize
 * tier names before enum validation, matching the shared powerStatsSchema
 * approach but using string enums inline to avoid import cycles.
 */
const coercedApDurTierSchema = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    return normalizeApDurTier(val) ?? val;
  },
  z.enum(AP_DURABILITY_TIERS as unknown as [string, ...string[]]),
);

const coercedSpeedTierSchema = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    return normalizeSpeedTier(val) ?? val;
  },
  z.enum(SPEED_TIERS as unknown as [string, ...string[]]),
);

const coercedIntelligenceTierSchema = z.preprocess(
  (val) => {
    if (typeof val !== "string") return val;
    return normalizeIntelligenceTier(val) ?? val;
  },
  z.enum(INTELLIGENCE_TIERS as unknown as [string, ...string[]]),
);

const tierRankSchema = <T extends z.ZodTypeAny>(tierSchema: T) =>
  z.object({ tier: tierSchema, rank: z.number().int().min(1).max(10) });

const haxAbilitySchema = z.object({
  name: z.string().min(1),
  type: z.string().min(1),
  bypassTier: coercedApDurTierSchema.nullable(),
  limitations: z.array(z.string()),
});

const characterVulnerabilitySchema = z.object({
  description: z.string().min(1),
  severity: z.enum(["minor", "major", "critical"]),
});

const powerStatsLlmSchema = z.object({
  attackPotency: tierRankSchema(coercedApDurTierSchema),
  speed: tierRankSchema(coercedSpeedTierSchema),
  durability: tierRankSchema(coercedApDurTierSchema),
  intelligence: tierRankSchema(coercedIntelligenceTierSchema),
  hax: z.array(haxAbilitySchema),
  vulnerabilities: z.array(characterVulnerabilitySchema),
});

/** Loose passthrough schema for first-attempt LLM output before strict parse. */
export const loosePowerStatsSchema = z.object({}).passthrough();

function dedupeStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];

  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    deduped.push(normalized);
  }

  return deduped;
}

function stringFromUnknown(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized || undefined;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function rankFromUnknown(value: unknown): number | undefined {
  let parsed: number;

  if (typeof value === "number") {
    parsed = value;
  } else if (typeof value === "string") {
    const normalized = value.trim();
    if (!normalized) return undefined;
    parsed = Number(normalized);
  } else {
    return undefined;
  }

  return Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 1 && parsed <= 10
    ? parsed
    : undefined;
}

export function recordFromUnknown(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

export function describeZodIssues(error: z.ZodError): string[] {
  return dedupeStrings(
    error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .filter(Boolean),
  );
}

function buildSearchConfig(research: ResearchConfig, role: ResolvedRole): SearchConfig {
  return {
    provider: research.searchProvider,
    braveApiKey: research.braveApiKey,
    zaiApiKey: research.zaiApiKey,
    llmProvider: role.provider,
  };
}

function buildPremiseDivergenceNote(premiseDivergence: PremiseDivergence | null | undefined): string {
  if (!premiseDivergence) {
    return "No divergence artifact was provided. Stay fully canonical.";
  }

  const changedFacts = premiseDivergence.changedCanonFacts.length > 0
    ? premiseDivergence.changedCanonFacts.map((fact) => `- ${fact}`).join("\n")
    : "- No explicit canon changes were listed.";
  const directives = premiseDivergence.currentStateDirectives.length > 0
    ? premiseDivergence.currentStateDirectives.map((fact) => `- ${fact}`).join("\n")
    : "- Preserve canon conservatively.";

  return `Premise divergence mode: ${premiseDivergence.mode}
Changed canon facts:
${changedFacts}
Current world-state directives:
${directives}`;
}

export const AP_DUR_TIER_LIST = AP_DURABILITY_TIERS.join(", ");
export const SPEED_TIER_LIST = SPEED_TIERS.join(", ");
export const INTELLIGENCE_TIER_LIST = INTELLIGENCE_TIERS.join(", ");

const KNOWN_IP_POWER_STATS_PROMPT_CONTRACT = buildPowerStatsPromptContract({
  marker: "power-stats.v1",
  evidenceLabel: "raw payload and search results",
});

/**
 * Attempt to normalize a loose LLM response into a valid PowerStats object.
 * Handles common LLM output variants: nested objects, alternate key names, etc.
 */
export function normalizeLlmPowerStats(raw: Record<string, unknown>): PowerStats {
  const rawAP = recordFromUnknown(raw.attackPotency ?? raw.attack_potency ?? raw.attack);
  const rawSpeed = recordFromUnknown(raw.speed);
  const rawDur = recordFromUnknown(raw.durability ?? raw.defense);
  const rawInt = recordFromUnknown(raw.intelligence ?? raw.intellect);

  const normalized = {
    attackPotency: {
      tier: stringFromUnknown(rawAP.tier) ?? stringFromUnknown(raw.attackPotency),
      rank: rankFromUnknown(rawAP.rank),
    },
    speed: {
      tier: stringFromUnknown(rawSpeed.tier) ?? stringFromUnknown(raw.speed),
      rank: rankFromUnknown(rawSpeed.rank),
    },
    durability: {
      tier: stringFromUnknown(rawDur.tier) ?? stringFromUnknown(raw.durability),
      rank: rankFromUnknown(rawDur.rank),
    },
    intelligence: {
      tier: stringFromUnknown(rawInt.tier) ?? stringFromUnknown(raw.intelligence),
      rank: rankFromUnknown(rawInt.rank),
    },
    hax: Array.isArray(raw.hax) ? raw.hax : [],
    vulnerabilities: Array.isArray(raw.vulnerabilities) ? raw.vulnerabilities : [],
  };

  const parsed = powerStatsLlmSchema.parse(normalized);
  return parsed as PowerStats;
}

export async function repairPowerStats(opts: {
  rawObject: Record<string, unknown>;
  failures: string[];
  draft: CharacterDraft;
  franchise: string;
  role: ResolvedRole;
  premise: string;
  premiseDivergence?: PremiseDivergence | null;
  searchDigest: string;
  overrideText?: string;
}): Promise<PowerStats> {
  let currentRaw = opts.rawObject;
  let currentFailures = opts.failures;
  let lastError: z.ZodError | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { object: rawRepairObject } = await generateObject({
      model: createModel(opts.role.provider),
      schema: loosePowerStatsSchema,
      prompt: `You are repairing a malformed VS Battles power stats payload for WorldForge.

${KNOWN_IP_POWER_STATS_PROMPT_CONTRACT}

${opts.overrideText ? `USER OVERRIDE (HIGHEST PRIORITY — must win conflicts with canon):
${opts.overrideText}

If the user override requests a power-level change (e.g. "nerfed to City tier", "weaker than canon", "removed X ability"), honor it by:
- Adjusting tier and rank down (or up) to match the directive.
- Adding an entry to vulnerabilities with severity "major" or "critical" explaining the limitation.
- Removing or constraining hax abilities the user says are absent.

` : ""}Franchise: ${opts.franchise}
Character: ${opts.draft.identity.displayName}
Current world premise: ${opts.premise}
${buildPremiseDivergenceNote(opts.premiseDivergence)}

Search results:
${opts.searchDigest}

Malformed raw payload:
${JSON.stringify(currentRaw, null, 2)}

Repair task:
- Reformat into the exact target schema with these fields:
  attackPotency: { tier: string, rank: 1-10 }
  speed: { tier: string, rank: 1-10 }
  durability: { tier: string, rank: 1-10 }
  intelligence: { tier: string, rank: 1-10 }
  hax: [{ name, type, bypassTier (tier name or null), limitations: string[] }]
  vulnerabilities: [{ description, severity: "minor"|"major"|"critical" }]
- Remaining validation failures that MUST be fixed: ${currentFailures.join(", ")}.
- Use only facts from the raw payload and search results.
- If evidence is too thin to repair a power fact, fail closed by leaving validation unable to pass instead of inventing a tier, feat, hax, or vulnerability.
- Repair must never invent power facts, source roles, canonical facts, feats, or unsupported scaling.
- Do not create new hax or vulnerabilities unless they are already supported by the malformed raw payload or search results.
- Attack Potency / Durability tiers: ${AP_DUR_TIER_LIST}
- Speed tiers: ${SPEED_TIER_LIST}
- Intelligence tiers: ${INTELLIGENCE_TIER_LIST}
- Rank within tier: Low = 1-3, Mid = 4-7, High = 8-10.`,
      temperature: Math.min(opts.role.temperature, 0.2),
      maxOutputTokens: clampTokens(opts.role.maxTokens),
    });

    try {
      return normalizeLlmPowerStats(recordFromUnknown(rawRepairObject));
    } catch (error) {
      if (!(error instanceof z.ZodError)) {
        throw error;
      }

      lastError = error;
      currentRaw = recordFromUnknown(rawRepairObject);
      currentFailures = describeZodIssues(error);

      if (attempt === 3) {
        throw error;
      }
    }
  }

  throw lastError ?? new Error("PowerStats repair failed unexpectedly.");
}

export async function enrichKnownIpWorldgenNpcDraft(opts: {
  draft: CharacterDraft;
  franchise: string;
  role: ResolvedRole;
  research: ResearchConfig | undefined;
  premise: string;
  premiseDivergence?: PremiseDivergence | null;
  overrideText?: string;
}): Promise<CharacterDraft> {
  if (!opts.research?.enabled) {
    throw new Error(
      `Known-IP key NPC grounding requires research to be enabled (${opts.draft.identity.displayName}).`,
    );
  }

  const query = `${opts.franchise} ${opts.draft.identity.displayName} abilities powers personality affiliations weaknesses`;
  const searchResults = await webSearch(
    query,
    buildSearchConfig(opts.research, opts.role),
    Math.min(6, Math.max(4, opts.research.maxSearchSteps ?? 6)),
  );

  if (searchResults.length === 0) {
    throw new Error(
      `No canon search results for key known-IP NPC "${opts.draft.identity.displayName}" in ${opts.franchise}.`,
    );
  }

  const searchDigest = searchResults
    .map((result) => `- ${result.title}: ${result.description} (${result.url})`)
    .join("\n");

  const { object: rawObject } = await generateObject({
    model: createModel(opts.role.provider),
    schema: loosePowerStatsSchema,
    prompt: `You are assessing the power level of a canonical character using VS Battles Wiki tier conventions for WorldForge.

${KNOWN_IP_POWER_STATS_PROMPT_CONTRACT}

${opts.overrideText ? `USER OVERRIDE (HIGHEST PRIORITY — must win conflicts with canon):
${opts.overrideText}

If the user override requests a power-level change (e.g. "nerfed to City tier", "weaker than canon", "removed X ability"), honor it by:
- Adjusting tier and rank down (or up) to match the directive.
- Adding an entry to vulnerabilities with severity "major" or "critical" explaining the limitation.
- Removing or constraining hax abilities the user says are absent.

` : ""}Franchise: ${opts.franchise}
Character: ${opts.draft.identity.displayName}
Current world premise: ${opts.premise}
Current authored persona: ${opts.draft.profile.personaSummary}
Current authored goals: ${[...opts.draft.motivations.shortTermGoals, ...opts.draft.motivations.longTermGoals].join("; ") || "(none)"}
${buildPremiseDivergenceNote(opts.premiseDivergence)}

Search results:
${searchDigest}

Task:
Return a structured power assessment using VS Battles Wiki tier+rank format.

Attack Potency / Durability tiers (pick one): ${AP_DUR_TIER_LIST}
Speed tiers (pick one): ${SPEED_TIER_LIST}
Intelligence tiers (pick one): ${INTELLIGENCE_TIER_LIST}
Rank within tier: Low = 1-3, Mid = 4-7, High = 8-10.

Return this exact JSON structure:
{
  "attackPotency": { "tier": "<AP tier name>", "rank": <1-10> },
  "speed": { "tier": "<Speed tier name>", "rank": <1-10> },
  "durability": { "tier": "<AP/Dur tier name>", "rank": <1-10> },
  "intelligence": { "tier": "<Intelligence tier name>", "rank": <1-10> },
  "hax": [
    {
      "name": "<ability name>",
      "type": "<category e.g. Spatial Manipulation, Reality Warping>",
      "bypassTier": "<AP/Dur tier name this ignores, or null if not bypassing>",
      "limitations": ["<limitation 1>", "<limitation 2>"]
    }
  ],
  "vulnerabilities": [
    { "description": "<weakness description>", "severity": "minor"|"major"|"critical" }
  ]
}

Ground all assessments in attested canon feats from the search results.
Do not inflate tiers beyond what the evidence supports.`,
    temperature: Math.min(opts.role.temperature, 0.3),
    maxOutputTokens: clampTokens(opts.role.maxTokens),
  });

  let powerStats: PowerStats;
  try {
    powerStats = normalizeLlmPowerStats(recordFromUnknown(rawObject));
  } catch (error) {
    if (!(error instanceof z.ZodError)) {
      throw error;
    }

    powerStats = await repairPowerStats({
      rawObject: recordFromUnknown(rawObject),
      failures: describeZodIssues(error),
      draft: opts.draft,
      franchise: opts.franchise,
      role: opts.role,
      premise: opts.premise,
      premiseDivergence: opts.premiseDivergence,
      searchDigest,
      overrideText: opts.overrideText,
    });
  }

  const enrichedDraft: CharacterDraft = {
    ...opts.draft,
    powerStats,
  };

  return enrichedDraft;
}
