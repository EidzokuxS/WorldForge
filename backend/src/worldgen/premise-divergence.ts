import { z } from "zod";
import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";

import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { clampTokens, createLogger } from "../lib/index.js";

const log = createLogger("premise-divergence");

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9'\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveCanonicalCharacterName(
  candidate: string | null | undefined,
  canonicalNames: string[],
): string | null {
  if (!candidate) return null;
  const normalizedCandidate = normalizeForMatch(candidate);
  if (!normalizedCandidate) return null;

  const exact = canonicalNames.find(
    (name) => normalizeForMatch(name) === normalizedCandidate,
  );
  return exact ?? candidate;
}

function dedupeLines(values: string[]): string[] {
  return Array.from(
    new Map(
      values
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .map((value) => [value.toLowerCase(), value] as const),
    ).values(),
  );
}

const protagonistKindSchema = z
  .enum(["canonical", "custom", "player", "original"])
  .transform((value) => (value === "canonical" ? "canonical" : "custom"));

const premiseDivergenceSchema = z.object({
  mode: z.enum(["canonical", "coexisting", "diverged"]),
  protagonistRole: z.object({
    kind: protagonistKindSchema,
    interpretation: z.enum(["canonical", "replacement", "coexisting", "outsider", "unknown"]),
    canonicalCharacterName: z.string().nullable().optional(),
    roleSummary: z.string().max(240),
  }),
  preservedCanonFacts: z.array(z.string().max(180)).max(4),
  changedCanonFacts: z.array(z.string().max(180)).max(4),
  currentStateDirectives: z.array(z.string().max(180)).max(4),
  ambiguityNotes: z.array(z.string()).max(5),
});

export async function interpretPremiseDivergence(
  ipContext: IpResearchContext | null | undefined,
  premise: string,
  role: ResolvedRole,
): Promise<PremiseDivergence | null> {
  if (!ipContext) return null;

  const canonicalCharacters = ipContext.canonicalNames?.characters ?? [];
  const prompt = `You interpret how a player's campaign premise diverges from a known canon setting.

FRANCHISE:
${ipContext.franchise}

PREMISE:
"${premise}"

CANONICAL CHARACTERS:
${canonicalCharacters.length > 0 ? canonicalCharacters.map((name) => `- ${name}`).join("\n") : "- (none provided)"}

CANONICAL FACTS:
${ipContext.keyFacts.map((fact) => `- ${fact}`).join("\n")}

TONE:
${ipContext.tonalNotes.map((note) => `- ${note}`).join("\n")}

TASK:
Return a structured interpretation of the present campaign state.

STRICT RULES:
- Treat canon as the baseline. Record only what the premise actually changes.
- Do not mutate or rewrite canon facts. Summarize what stays true in preservedCanonFacts and what changes in changedCanonFacts.
- Use protagonistRole.interpretation = "replacement" only when the player's custom protagonist clearly displaces a canonical protagonist or active role.
- If the player merely arrives in the setting, joins the cast, or coexists with canon, use "outsider" or "coexisting" instead of "replacement".
- When naming a replaced canonical character, use an exact name from CANONICAL CHARACTERS if available.
- currentStateDirectives must be prompt-ready instructions about the world as it exists now.
- If the premise is mostly unchanged canon, return mode = "canonical". If the player coexists alongside canon, return "coexisting". Use "diverged" only for genuine state changes.
- Never use regex-style guessing. If something is ambiguous, record it in ambiguityNotes instead of fabricating certainty.

Keep the output compact:
- preservedCanonFacts: 0-3 short bullets
- changedCanonFacts: 0-3 short bullets
- currentStateDirectives: 1-3 short imperative bullets
- ambiguityNotes: 0-2 short bullets
- protagonistRole.roleSummary: one short sentence only`;

  async function runInterpretation(
    promptText: string,
    maxOutputTokens?: number,
  ): Promise<PremiseDivergence> {
    const result = await generateObject({
      model: createModel(role.provider),
      schema: premiseDivergenceSchema,
      prompt: promptText,
      temperature: 0,
      ...(maxOutputTokens === undefined ? {} : { maxOutputTokens }),
    });

    return {
      ...result.object,
      protagonistRole: {
        ...result.object.protagonistRole,
        canonicalCharacterName: resolveCanonicalCharacterName(
          result.object.protagonistRole.canonicalCharacterName,
          canonicalCharacters,
        ),
      },
      preservedCanonFacts: dedupeLines(result.object.preservedCanonFacts),
      changedCanonFacts: dedupeLines(result.object.changedCanonFacts),
      currentStateDirectives: dedupeLines(result.object.currentStateDirectives),
      ambiguityNotes: dedupeLines(result.object.ambiguityNotes),
    };
  }

  try {
    return await runInterpretation(prompt);
  } catch (error) {
    log.warn("Premise divergence interpretation failed on first attempt; retrying with explicit output budget", error);
    try {
      return await runInterpretation(
        `${prompt}

RETRY MODE:
- Minimize output aggressively.
- Prefer empty arrays over filler.
- Use at most 1 item per array unless absolutely necessary.
- Keep every string short.`,
        clampTokens(Math.max(role.maxTokens, 8192)),
      );
    } catch (retryError) {
      log.warn("Premise divergence interpretation failed after retry; continuing without divergence artifact", retryError);
      return null;
    }
  }
}
