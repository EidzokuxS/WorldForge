/**
 * Oracle probability system.
 *
 * Evaluates action probability via Judge LLM (generateObject with Zod schema,
 * temperature 0), rolls D100, resolves 3-tier outcome (strong_hit / weak_hit / miss).
 * Never returns chance 0 or 100. Retries with Fallback role on primary failure.
 */

import crypto from "node:crypto";
import { z } from "zod";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { withModelFallback } from "../ai/with-model-fallback.js";

// -- Types -------------------------------------------------------------------

export type OutcomeTier = "strong_hit" | "weak_hit" | "miss";

export interface OraclePayload {
  intent: string;
  method: string;
  actorTags: string[];
  targetTags: string[];
  environmentTags: string[];
  sceneContext: string;
}

export interface OracleResult {
  chance: number;
  roll: number;
  outcome: OutcomeTier;
  reasoning: string;
}

// -- Schema ------------------------------------------------------------------

export const oracleOutputSchema = z.object({
  chance: z.number().min(1).max(99),
  reasoning: z.string().max(500),
});

// -- Pure functions ----------------------------------------------------------

export function rollD100(): number {
  return crypto.randomInt(1, 101);
}

export function resolveOutcome(roll: number, chance: number): OutcomeTier {
  if (roll <= chance * 0.5) return "strong_hit";
  if (roll <= chance) return "weak_hit";
  return "miss";
}

// -- Oracle LLM call --------------------------------------------------------

const ORACLE_SYSTEM_PROMPT = `You are the Oracle Judge for a text RPG. Your job is to evaluate the probability of success for a player's action.

Given the actor's capabilities (tags), the target's attributes (tags), and the environmental conditions (tags), estimate the chance of success as a number from 1 to 99.

Use only the provided actorTags, targetTags, environmentTags, and sceneContext as evidence snapshots.
Do NOT widen this into narration, character creation, or world simulation.

Rules:
- NEVER return 0 or 100. Nothing is impossible, nothing is guaranteed.
- Base your evaluation on the mechanical interaction of tags, not narrative preference.
- Do NOT default to high chances. A character without an explicit skill tag for the attempted action starts at ~30%. Only specialized training (relevant tags) pushes above 50%.
- If the actor attempts a SPECIFIC named technique/ability and does NOT have a tag for it, the chance should be very low (5-20%). Having a related but different skill gives only a small bonus.
- Characters WITH relevant skill tags should generally succeed: [Master Swordsman] attacking a common guard should be 80+.
- Environmental factors modify the base chance by +/-10 to +/-20 (darkness, advantageous terrain, weather).
- If the actor is wounded (low HP noted in scene context), reduce chance for physically demanding actions by 10-20%. A character at HP 1-2 is severely hampered.
- Provide brief reasoning referencing SPECIFIC tags (or lack thereof) that justify the number.

Calibration bands:
- 5-15%: Acting far outside capabilities (no relevant tags, attempting advanced techniques)
- 20-35%: Unskilled attempt at something requiring training
- 40-55%: Relevant but not specialized (adjacent skill, basic training)
- 60-75%: Directly relevant skill tag (Adept/Skilled level)
- 80-90%: Master-level tag against lesser opposition
- 91-99%: Overwhelming advantage (multiple relevant tags, weak target, ideal conditions)

Example:
Action: Pick the iron lock using lockpicks
Actor: [skilled-thief, nimble]
Target: [iron-lock, rusted]
Environment: [dim-light, quiet]
-> { "chance": 75, "reasoning": "Skilled thief with appropriate tools against a rusted lock. Dim light is a minor hindrance." }

Example:
Action: Intimidate the guard captain
Actor: [scrawny, peasant]
Target: [veteran-soldier, fearless, armored]
-> { "chance": 8, "reasoning": "A scrawny peasant has almost no leverage against a fearless veteran in full armor." }

Example:
Action: Cast Fireball
Actor: [wind-mage, novice]
Target: []
Environment: [forest, dry]
-> { "chance": 12, "reasoning": "Actor has wind magic, not fire magic. No fire-related tags. Novice skill level. Attempting a technique outside their element gives very low odds." }`;

function buildOraclePrompt(payload: OraclePayload): string {
  return [
    `Action: ${payload.intent}${payload.method ? ` via ${payload.method}` : ""}`,
    `Actor: [${payload.actorTags.join(", ")}]`,
    `Target: [${payload.targetTags.join(", ")}]`,
    `Environment: [${payload.environmentTags.join(", ")}]`,
    `Scene: ${payload.sceneContext}`,
  ].join("\n");
}

async function executeOracleCall(
  provider: ProviderConfig,
  userPrompt: string
): Promise<OracleResult> {
  const model = createModel(provider);
  const { object } = await safeGenerateObject({
    model,
    schema: oracleOutputSchema,
    temperature: 0,
    system: ORACLE_SYSTEM_PROMPT,
    prompt: userPrompt,
  });

  // Clamp as safety net even if Zod somehow passes out-of-range
  const chance = Math.max(1, Math.min(99, object.chance));
  const roll = rollD100();
  const outcome = resolveOutcome(roll, chance);
  return { chance, roll, outcome, reasoning: object.reasoning };
}

export async function callOracle(
  payload: OraclePayload,
  provider: ProviderConfig,
  fallbackProvider?: ProviderConfig | null
): Promise<OracleResult> {
  const userPrompt = buildOraclePrompt(payload);

  if (fallbackProvider) {
    return withModelFallback(
      () => executeOracleCall(provider, userPrompt),
      () => executeOracleCall(fallbackProvider, userPrompt),
      "oracle:callOracle"
    );
  }

  // No fallback configured — just call primary, let error propagate
  return executeOracleCall(provider, userPrompt);
}
