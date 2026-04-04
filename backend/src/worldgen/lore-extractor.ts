import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import { withModelFallback } from "../ai/with-model-fallback.js";
import { createLogger } from "../lib/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";
import { LORE_CATEGORIES } from "./types.js";
import type { WorldScaffold, ExtractedLoreCard } from "./types.js";
import {
  buildCharacterStartGuardrail,
  buildIpContextBlock,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
} from "./scaffold-steps/prompt-utils.js";

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
  fallbackRole?: ResolvedRole,
  ipContext?: IpResearchContext | null,
  premiseDivergence?: PremiseDivergence | null,
): Promise<ExtractedLoreCard[]> {
  const context = formatScaffoldContext(scaffold);
  const ipBlock = buildIpContextBlock(ipContext ?? null);
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence ?? null);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext ?? null,
    premiseDivergence ?? null,
    "lore cards",
  );
  const characterStartGuardrail = buildCharacterStartGuardrail();

  const ipFactsSection =
    ipContext?.keyFacts && ipContext.keyFacts.length > 0
      ? `\nFRANCHISE REFERENCE FACTS (use as primary source for concept/ability/rule cards):\n${ipContext.keyFacts.map((f) => `  - ${f}`).join("\n")}\n`
      : "";

  const ipQualityRule = ipContext
    ? `- For known IPs: concept/ability/rule cards MUST describe actual franchise systems, powers, and mechanics drawn from the REFERENCE FACTS above. Never invent systems that do not exist in the franchise canon.
- For known IPs: when PREMISE DIVERGENCE changes one role, relationship, allegiance, or institution, update only lore affected by that change. Keep untouched canon facts explicit in the lore cards.`
    : "";

  const prompt = `You are a world encyclopedia compiler. Extract 30-50 structured lore cards from this RPG world scaffold. Each card is a database entry the game engine uses for semantic search — accuracy and specificity matter.

${context}
${ipBlock}${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}${ipFactsSection}${characterStartGuardrail}

EXTRACTION PROCEDURE:
1. Create one "location" card per scaffold location. term = location name. definition = 1-2 sentence factual summary (geography, population, function). Do NOT copy the scaffold description verbatim — summarize.
2. Create one "npc" card per scaffold NPC. term = character name. definition = their role and single most important trait.
3. Create one "faction" card per scaffold faction. term = faction name. definition = what they control and what they want.
4. Extract 10-20 additional cards from world knowledge (not just the scaffold text):
   - "concept" cards: power systems, magic types, technologies, social structures, economic systems.
   - "rule" cards: physical laws, magic constraints, political laws, taboos, treaties.
   - "ability" cards: named techniques, spells, fighting styles, special powers.
   - "item" cards: named artifacts, weapons, resources, currencies.
   - "event" cards: historical wars, catastrophes, treaties, discoveries that shaped the current world.

CARD FORMAT:
- term: 1-5 word unique name. No articles ("the"). No generic terms ("Magic System") — use the world's own terminology.
- definition: 1-2 factual sentences. State what it IS and what it DOES. No narrative flair, no "is said to be", no "legend has it".
- category: one of location, npc, faction, ability, rule, concept, item, event.
${ipQualityRule}

TARGET: 30-50 cards total. Minimum: 1 per location + 1 per NPC + 1 per faction + 10 concept/ability/rule/item/event cards.

${buildStopSlopRules()}`;

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
