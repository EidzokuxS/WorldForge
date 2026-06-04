import { z } from "zod";
import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/index.js";
import {
  loosePowerStatsSchema,
  normalizeLlmPowerStats,
  repairPowerStats,
  AP_DUR_TIER_LIST,
  SPEED_TIER_LIST,
  INTELLIGENCE_TIER_LIST,
  describeZodIssues,
  recordFromUnknown,
} from "../known-ip-worldgen-research.js";
import { clampTokens } from "../../lib/clamp.js";
import { createLogger } from "../../lib/index.js";
import { withPipelineRetry } from "./retry.js";
import { buildPowerStatsPromptContract } from "../prompt-contract.js";
import type { CharacterDraft, PowerStats } from "@worldforge/shared";
import type { ResolvedRole } from "../../ai/resolve-role-model.js";

const log = createLogger("assess-original-powerstats");

/**
 * Stage 4 (original branch) — LLM-only PowerStats inference for ORIGINAL or
 * IMPORTED characters. No web search. LLM infers tiers from draft persona,
 * card text, and user override. Uses the same loose-schema +
 * normalizeLlmPowerStats + repairPowerStats loop as the canon branch to
 * avoid divergent coercion code.
 *
 * Default expectation: most original characters are Human or Street tier —
 * the prompt explicitly discourages tier inflation.
 */
export async function assessOriginalCharacterPowerStats(opts: {
  draft: CharacterDraft;
  cardText?: string;
  overrideText?: string;
  role: ResolvedRole;
  premise: string;
}): Promise<CharacterDraft> {
  const { draft, cardText, overrideText, role, premise } = opts;

  const prompt = `You are assessing the power level of an ORIGINAL (non-canonical) WorldForge character using VS Battles Wiki tier conventions.

${buildPowerStatsPromptContract({
  marker: "original-power-assessment.v1",
  evidenceLabel: "provided character draft, card text, and user override",
})}

${overrideText ? `USER OVERRIDE (HIGHEST PRIORITY — must win any other signal):
${overrideText}

If the user override directly sets a power level (e.g. "street-level brawler", "planetary threat"), honor it literally. Add vulnerabilities that explain any material weakness the override introduces.

` : ""}Current world premise: ${premise}

Character name: ${draft.identity.displayName}
Background: ${draft.profile.backgroundSummary}
Persona: ${draft.profile.personaSummary}
Tags / Traits: ${draft.capabilities.traits?.join(", ") || "(none)"}
Skills: ${draft.capabilities.skills.map((s) => `${s.tier} ${s.name}`).join(", ") || "(none)"}
Drives: ${draft.motivations.drives.join("; ") || "(none)"}
${cardText ? `\nSource card text (author's interpretation; use as evidence, override still wins):\n${cardText}\n` : ""}
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
    { "name": "<ability>", "type": "<category>", "bypassTier": "<AP tier or null>", "limitations": ["<limit>"] }
  ],
  "vulnerabilities": [
    { "description": "<weakness>", "severity": "minor"|"major"|"critical" }
  ]
}

GROUNDING RULES:
- Most original characters are Human (ranks 1-5) or Street (ranks 1-5). Only assign higher tiers if abilities explicitly support it.
- Do not inflate tiers. Ground every tier in evidence from the persona / tags / card / override. If evidence is thin, choose the lower tier.
- If the character has no supernatural powers, hax must be [] (empty array). Do not fabricate magical abilities.
- If the character has clearly mundane skills, intelligence is typically Average or Above Average.
- Do not invent hax abilities that no source supports.`;

  const powerStats: PowerStats = await withPipelineRetry("power_assess", async () => {
    log.info("assess-original: generating PowerStats", {
      displayName: draft.identity.displayName,
      hasCard: !!cardText,
      hasOverride: !!overrideText,
    });
    const { object: rawObject } = await generateObject({
      model: createModel(role.provider),
      schema: loosePowerStatsSchema,
      prompt,
      temperature: Math.min(role.temperature, 0.3),
      maxOutputTokens: clampTokens(role.maxTokens),
      retries: 1,
    });

    try {
      return normalizeLlmPowerStats(recordFromUnknown(rawObject));
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      return await repairPowerStats({
        rawObject: recordFromUnknown(rawObject),
        failures: describeZodIssues(error),
        draft,
        franchise: "Original",
        role,
        premise,
        premiseDivergence: null,
        searchDigest: cardText ?? "(no card text)",
        overrideText,
      });
    }
  });

  return { ...draft, powerStats };
}
