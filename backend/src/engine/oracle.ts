/**
 * Oracle probability system.
 *
 * Evaluates action probability via Judge LLM (generateObject with Zod schema,
 * temperature 0), rolls D100, resolves 3-tier outcome (strong_hit / weak_hit / miss).
 * Never returns chance 0 or 100. Falls back to 50% on failure.
 */

import crypto from "node:crypto";
import { z } from "zod";
import { generateObject } from "ai";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("oracle");

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

Rules:
- NEVER return 0 or 100. Nothing is impossible, nothing is guaranteed.
- Base your evaluation on the mechanical interaction of tags, not narrative preference.
- A peasant swinging at a dragon gets ~5. A master swordsman against a drunk bandit gets ~90.
- Environmental factors modify the base chance (darkness, rain, noise).
- Provide brief reasoning based on the mechanical factors.

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
-> { "chance": 8, "reasoning": "A scrawny peasant has almost no leverage against a fearless veteran in full armor." }`;

export async function callOracle(
  payload: OraclePayload,
  provider: ProviderConfig
): Promise<OracleResult> {
  try {
    const userPrompt = [
      `Action: ${payload.intent}${payload.method ? ` via ${payload.method}` : ""}`,
      `Actor: [${payload.actorTags.join(", ")}]`,
      `Target: [${payload.targetTags.join(", ")}]`,
      `Environment: [${payload.environmentTags.join(", ")}]`,
      `Scene: ${payload.sceneContext}`,
    ].join("\n");

    const model = createModel(provider);

    const { object } = await generateObject({
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
  } catch (error) {
    log.warn("Oracle call failed, using coin flip fallback", error);
    const roll = rollD100();
    const outcome = resolveOutcome(roll, 50);
    return {
      chance: 50,
      roll,
      outcome,
      reasoning: "Oracle unavailable -- using coin flip fallback",
    };
  }
}
