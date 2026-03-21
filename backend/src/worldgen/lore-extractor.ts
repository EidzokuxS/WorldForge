import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import { withModelFallback } from "../ai/with-model-fallback.js";
import { createLogger } from "../lib/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { LORE_CATEGORIES } from "./types.js";
import type { WorldScaffold, ExtractedLoreCard } from "./types.js";

const log = createLogger("lore-extractor");

const loreCardSchema = z.object({
  term: z.string().describe("Short unique name or title (1-5 words)"),
  definition: z
    .string()
    .describe("Factual 1-2 sentence definition, no narrative"),
  category: z.enum(LORE_CATEGORIES),
});

const loreExtractionSchema = z.object({
  loreCards: z.array(loreCardSchema).min(20).max(60),
});

export type { ExtractedLoreCard };

function formatScaffoldContext(scaffold: WorldScaffold): string {
  const locationLines = scaffold.locations
    .map(
      (loc) =>
        `- ${loc.name}: ${loc.description} [Tags: ${loc.tags.join(", ")}]`
    )
    .join("\n");

  const factionLines = scaffold.factions
    .map(
      (f) =>
        `- ${f.name}: Goals: ${f.goals.join("; ")} | Assets: ${f.assets.join("; ")} [Tags: ${f.tags.join(", ")}]`
    )
    .join("\n");

  const npcLines = scaffold.npcs
    .map(
      (n) =>
        `- ${n.name} (${n.locationName}${n.factionName ? `, ${n.factionName}` : ""}): ${n.persona} [Tags: ${n.tags.join(", ")}]`
    )
    .join("\n");

  return `WORLD PREMISE:
${scaffold.refinedPremise}

LOCATIONS:
${locationLines}

FACTIONS:
${factionLines}

KEY NPCs:
${npcLines}`;
}

export async function extractLoreCards(
  scaffold: WorldScaffold,
  role: ResolvedRole,
  fallbackRole?: ResolvedRole
): Promise<ExtractedLoreCard[]> {
  const context = formatScaffoldContext(scaffold);

  const prompt = `You are a world-building encyclopedist. Given a generated RPG world, extract 30-50 structured lore cards — factual knowledge entries that define this world.

${context}

EXTRACTION RULES:
- Each location → one "location" card
- Each NPC → one "npc" card
- Each faction → one "faction" card
- Extract world concepts: magic systems, technologies, political systems, currencies, religions → "concept" cards
- Extract world rules: what is possible, what is forbidden, physical laws → "rule" cards
- Extract notable items, artifacts, or assets mentioned → "item" cards
- Extract any special abilities or powers mentioned → "ability" cards
- Definition must be 1-2 factual sentences, no storytelling or narrative flair
- Term should be a short unique name (1-5 words)
- Aim for 30-50 cards total, covering all aspects of the world`;

  const MAX_RETRIES = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateObject({
        model: createModel(role.provider),
        schema: loreExtractionSchema,
        prompt,
        temperature: role.temperature,
        maxOutputTokens: role.maxTokens,
      });
      return result.object.loreCards;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.warn(
        `Lore extraction attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  // If all retries failed, try with a reduced schema (min 10 instead of 20)
  const reducedSchema = z.object({
    loreCards: z.array(loreCardSchema).min(10).max(30),
  });

  try {
    log.info("Attempting lore extraction with reduced card count (10-30)");
    const result = await generateObject({
      model: createModel(role.provider),
      schema: reducedSchema,
      prompt,
      temperature: role.temperature,
      maxOutputTokens: role.maxTokens,
    });
    return result.object.loreCards;
  } catch (reducedError) {
    const lastPrimaryError = reducedError;

    // If all primary retries failed, try with fallback model via withModelFallback
    if (fallbackRole) {
      try {
        log.info("Attempting lore extraction with fallback model via withModelFallback");
        return await withModelFallback(
          // Primary already failed -- pass a guaranteed-failure thunk
          async () => { throw lastPrimaryError; },
          // Fallback: try with fallback model + reduced schema
          async () => {
            const fbResult = await generateObject({
              model: createModel(fallbackRole.provider),
              schema: reducedSchema,
              prompt,
              temperature: fallbackRole.temperature,
              maxOutputTokens: fallbackRole.maxTokens,
            });
            return fbResult.object.loreCards;
          },
          "lore-extraction:extractLoreCards"
        );
      } catch (fallbackError) {
        log.error("Lore extraction failed with fallback model too", fallbackError);
      }
    }

    throw new Error(
      `Lore extraction failed after ${MAX_RETRIES} retries: ${lastError?.message ?? "unknown error"}. ` +
        `Check that the Generator provider (${role.provider.model}) supports structured JSON output.`
    );
  }
}
