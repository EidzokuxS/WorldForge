import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import { withModelFallback } from "../ai/with-model-fallback.js";
import { createLogger } from "../lib/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";
import { LORE_CATEGORIES } from "./types.js";
import type { WorldScaffold, ExtractedLoreCard, GenerationProgress, LoreCategory } from "./types.js";
import {
  buildCharacterStartGuardrail,
  buildIpContextBlock,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildStopSlopRules,
  reportSubProgress,
} from "./scaffold-steps/prompt-utils.js";

const log = createLogger("lore-extractor");

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const loreCardSchema = z.object({
  term: z.string().describe("Short unique name or title (1-5 words)"),
  definition: z
    .string()
    .describe("Factual 1-2 sentence definition, no narrative"),
  category: z.enum(LORE_CATEGORIES),
});

const locationLoreSchema = z.object({
  loreCards: z.array(loreCardSchema).min(3).max(15),
});

const factionLoreSchema = z.object({
  loreCards: z.array(loreCardSchema).min(3).max(15),
});

const npcLoreSchema = z.object({
  loreCards: z.array(loreCardSchema).min(3).max(15),
});

const conceptLoreSchema = z.object({
  loreCards: z.array(loreCardSchema).min(5).max(20),
});

export type { ExtractedLoreCard };

// ---------------------------------------------------------------------------
// Allowed categories per extraction call (review fix #5)
// ---------------------------------------------------------------------------

const LOCATION_LORE_CATEGORIES: LoreCategory[] = ["location", "event"];
const FACTION_LORE_CATEGORIES: LoreCategory[] = ["faction", "rule"];
const NPC_LORE_CATEGORIES: LoreCategory[] = ["npc", "ability"];
const CONCEPT_LORE_CATEGORIES: LoreCategory[] = ["concept", "rule", "ability", "item", "event"];

// ---------------------------------------------------------------------------
// Scaffold context formatter
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Shared prompt blocks interface
// ---------------------------------------------------------------------------

interface SharedPromptBlocks {
  context: string;
  ipBlock: string;
  divergenceBlock: string;
  knownIpContract: string;
  ipQualityRule: string;
  ipFactsSection: string;
  characterStartGuardrail: string;
  slopRules: string;
}

function buildSharedBlocks(
  scaffold: WorldScaffold,
  ipContext: IpResearchContext | null,
  premiseDivergence: PremiseDivergence | null,
): SharedPromptBlocks {
  const context = formatScaffoldContext(scaffold);
  const ipBlock = buildIpContextBlock(ipContext);
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "lore cards",
  );
  const characterStartGuardrail = buildCharacterStartGuardrail();
  const slopRules = buildStopSlopRules();

  const ipFactsSection =
    ipContext?.keyFacts && ipContext.keyFacts.length > 0
      ? `\nFRANCHISE REFERENCE FACTS (use as primary source for concept/ability/rule cards):\n${ipContext.keyFacts.map((f) => `  - ${f}`).join("\n")}\n`
      : "";

  const ipQualityRule = ipContext
    ? `- For known IPs: concept/ability/rule cards MUST describe actual franchise systems, powers, and mechanics drawn from the REFERENCE FACTS above. Never invent systems that do not exist in the franchise canon.
- For known IPs: when PREMISE DIVERGENCE changes one role, relationship, allegiance, or institution, update only lore affected by that change. Keep untouched canon facts explicit in the lore cards.`
    : "";

  return {
    context,
    ipBlock,
    divergenceBlock,
    knownIpContract,
    ipQualityRule,
    ipFactsSection,
    characterStartGuardrail,
    slopRules,
  };
}

function buildSharedPromptHeader(blocks: SharedPromptBlocks): string {
  return `${blocks.context}
${blocks.ipBlock}${blocks.knownIpContract ? `${blocks.knownIpContract}\n` : ""}${blocks.divergenceBlock ? `${blocks.divergenceBlock}\n` : ""}${blocks.ipFactsSection}${blocks.characterStartGuardrail}`;
}

// ---------------------------------------------------------------------------
// Category-specific extraction functions
// ---------------------------------------------------------------------------

const MAX_RETRIES = 2;

async function extractCategoryLore(
  role: ResolvedRole,
  fallbackRole: ResolvedRole | undefined,
  prompt: string,
  schema: z.ZodType,
  reducedSchema: z.ZodType,
  allowedCategories: LoreCategory[],
  categoryLabel: string,
): Promise<ExtractedLoreCard[]> {
  let lastError: Error | null = null;

  // Primary attempts
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await generateObject({
        model: createModel(role.provider),
        schema,
        prompt,
        temperature: role.temperature,
        maxOutputTokens: role.maxTokens,
      });
      // POST-FILTER: only allowed categories (review fix #5)
      return (result.object as { loreCards: ExtractedLoreCard[] }).loreCards.filter(
        (card) => allowedCategories.includes(card.category),
      );
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      log.warn(
        `${categoryLabel} lore extraction attempt ${attempt}/${MAX_RETRIES} failed: ${lastError.message}`,
      );
      if (attempt < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }

  // Reduced schema attempt
  try {
    log.info(`Attempting ${categoryLabel} lore extraction with reduced card count`);
    const result = await generateObject({
      model: createModel(role.provider),
      schema: reducedSchema,
      prompt,
      temperature: role.temperature,
      maxOutputTokens: role.maxTokens,
    });
    return (result.object as { loreCards: ExtractedLoreCard[] }).loreCards.filter(
      (card) => allowedCategories.includes(card.category),
    );
  } catch (reducedError) {
    const lastPrimaryError = reducedError;

    // Fallback model attempt
    if (fallbackRole) {
      try {
        log.info(`Attempting ${categoryLabel} lore extraction with fallback model`);
        return await withModelFallback(
          async () => { throw lastPrimaryError; },
          async () => {
            const fbResult = await generateObject({
              model: createModel(fallbackRole.provider),
              schema: reducedSchema,
              prompt,
              temperature: fallbackRole.temperature,
              maxOutputTokens: fallbackRole.maxTokens,
            });
            return (fbResult.object as { loreCards: ExtractedLoreCard[] }).loreCards.filter(
              (card) => allowedCategories.includes(card.category),
            );
          },
          `lore-extraction:${categoryLabel}`,
        );
      } catch (fallbackError) {
        log.error(`${categoryLabel} lore extraction failed with fallback model too`, fallbackError);
      }
    }

    // Category extraction is best-effort: log and return empty
    log.warn(
      `${categoryLabel} lore extraction failed entirely after all attempts: ${lastError?.message ?? "unknown"}`,
    );
    return [];
  }
}

async function extractLocationLore(
  role: ResolvedRole,
  fallbackRole: ResolvedRole | undefined,
  blocks: SharedPromptBlocks,
): Promise<ExtractedLoreCard[]> {
  const header = buildSharedPromptHeader(blocks);
  const prompt = `You are a world encyclopedia compiler. Extract structured lore cards about LOCATIONS from this RPG world scaffold.

${header}

EXTRACTION PROCEDURE:
1. Create one "location" card per scaffold location. term = location name. definition = 1-2 sentence factual summary (geography, population, function). Do NOT copy the scaffold description verbatim -- summarize.
2. Add 2-5 "event" cards about location-specific historical events: battles, discoveries, disasters, founding events.

CARD FORMAT:
- term: 1-5 word unique name. No articles ("the"). No generic terms.
- definition: 1-2 factual sentences. State what it IS and what it DOES.
- category MUST be one of: location, event
${blocks.ipQualityRule}

${blocks.slopRules}`;

  const reducedSchema = z.object({ loreCards: z.array(loreCardSchema).min(1).max(10) });
  return extractCategoryLore(role, fallbackRole, prompt, locationLoreSchema, reducedSchema, LOCATION_LORE_CATEGORIES, "location");
}

async function extractFactionLore(
  role: ResolvedRole,
  fallbackRole: ResolvedRole | undefined,
  blocks: SharedPromptBlocks,
): Promise<ExtractedLoreCard[]> {
  const header = buildSharedPromptHeader(blocks);
  const prompt = `You are a world encyclopedia compiler. Extract structured lore cards about FACTIONS from this RPG world scaffold.

${header}

EXTRACTION PROCEDURE:
1. Create one "faction" card per scaffold faction. term = faction name. definition = what they control and what they want.
2. Add 2-5 "rule" cards about faction-specific laws, treaties, political systems, trade agreements, or hierarchies.

CARD FORMAT:
- term: 1-5 word unique name. No articles ("the"). No generic terms.
- definition: 1-2 factual sentences. State what it IS and what it DOES.
- category MUST be one of: faction, rule
${blocks.ipQualityRule}

${blocks.slopRules}`;

  const reducedSchema = z.object({ loreCards: z.array(loreCardSchema).min(1).max(10) });
  return extractCategoryLore(role, fallbackRole, prompt, factionLoreSchema, reducedSchema, FACTION_LORE_CATEGORIES, "faction");
}

async function extractNpcLore(
  role: ResolvedRole,
  fallbackRole: ResolvedRole | undefined,
  blocks: SharedPromptBlocks,
): Promise<ExtractedLoreCard[]> {
  const header = buildSharedPromptHeader(blocks);
  const prompt = `You are a world encyclopedia compiler. Extract structured lore cards about NPCs from this RPG world scaffold.

${header}

EXTRACTION PROCEDURE:
1. Create one "npc" card per scaffold NPC. term = character name. definition = their role and single most important trait or relationship.
2. Add 3-5 "ability" cards for named techniques, spells, fighting styles, special powers used by NPCs or available in this world.

CARD FORMAT:
- term: 1-5 word unique name. No articles ("the"). No generic terms.
- definition: 1-2 factual sentences. State what it IS and what it DOES.
- category MUST be one of: npc, ability
${blocks.ipQualityRule}

${blocks.slopRules}`;

  const reducedSchema = z.object({ loreCards: z.array(loreCardSchema).min(1).max(10) });
  return extractCategoryLore(role, fallbackRole, prompt, npcLoreSchema, reducedSchema, NPC_LORE_CATEGORIES, "npc");
}

async function extractConceptLore(
  role: ResolvedRole,
  fallbackRole: ResolvedRole | undefined,
  blocks: SharedPromptBlocks,
): Promise<ExtractedLoreCard[]> {
  const header = buildSharedPromptHeader(blocks);
  const prompt = `You are a world encyclopedia compiler. Extract structured lore cards about WORLD SYSTEMS from this RPG world scaffold.

${header}

EXTRACTION PROCEDURE:
Extract 10-20 cards covering world systems, magic, technology, items, and history. Do NOT duplicate location/faction/NPC cards from other extraction passes.
Focus on:
- "concept" cards: power systems, magic types, technologies, social structures, economic systems.
- "rule" cards: physical laws, magic constraints, political laws, taboos, treaties.
- "ability" cards: named techniques, spells, fighting styles, special powers.
- "item" cards: named artifacts, weapons, resources, currencies.
- "event" cards: historical wars, catastrophes, treaties, discoveries that shaped the current world.

CARD FORMAT:
- term: 1-5 word unique name. No articles ("the"). No generic terms -- use the world's own terminology.
- definition: 1-2 factual sentences. State what it IS and what it DOES.
- category MUST be one of: concept, rule, ability, item, event
${blocks.ipQualityRule}

${blocks.slopRules}`;

  const reducedSchema = z.object({ loreCards: z.array(loreCardSchema).min(3).max(15) });
  return extractCategoryLore(role, fallbackRole, prompt, conceptLoreSchema, reducedSchema, CONCEPT_LORE_CATEGORIES, "concept");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function extractLoreCards(
  scaffold: WorldScaffold,
  role: ResolvedRole,
  fallbackRole?: ResolvedRole,
  ipContext?: IpResearchContext | null,
  premiseDivergence?: PremiseDivergence | null,
  onProgress?: (progress: GenerationProgress) => void,
  progressStep?: number,
  progressTotalSteps?: number,
): Promise<ExtractedLoreCard[]> {
  const blocks = buildSharedBlocks(
    scaffold,
    ipContext ?? null,
    premiseDivergence ?? null,
  );

  const step = progressStep ?? 0;
  const total = progressTotalSteps ?? 1;
  const CATEGORY_COUNT = 4;

  // 1. Location lore
  reportSubProgress(onProgress, step, total, "Extracting lore...", 0, CATEGORY_COUNT, "Location lore");
  const locationCards = await extractLocationLore(role, fallbackRole, blocks);

  // 2. Faction lore
  reportSubProgress(onProgress, step, total, "Extracting lore...", 1, CATEGORY_COUNT, "Faction lore");
  const factionCards = await extractFactionLore(role, fallbackRole, blocks);

  // 3. NPC lore
  reportSubProgress(onProgress, step, total, "Extracting lore...", 2, CATEGORY_COUNT, "NPC lore");
  const npcCards = await extractNpcLore(role, fallbackRole, blocks);

  // 4. Concept/ability/item/event lore
  reportSubProgress(onProgress, step, total, "Extracting lore...", 3, CATEGORY_COUNT, "World systems lore");
  const conceptCards = await extractConceptLore(role, fallbackRole, blocks);

  // Merge and deduplicate by term (case-insensitive)
  const allCards = [...locationCards, ...factionCards, ...npcCards, ...conceptCards];
  const seen = new Set<string>();
  const deduped = allCards.filter((card) => {
    const key = card.term.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return deduped;
}
