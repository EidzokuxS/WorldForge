import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { SearchProvider, IpResearchContext } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { GenerateScaffoldRequest } from "./types.js";
import { createLogger } from "../lib/index.js";
import { webSearch, type SearchConfig } from "../lib/web-search.js";

const log = createLogger("ip-researcher");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

// IpResearchContext re-exported from @worldforge/shared
export type { IpResearchContext } from "@worldforge/shared";

// ---------------------------------------------------------------------------
// LLM-based franchise detection
// ---------------------------------------------------------------------------

const confidenceEnum = z.string().transform((val): "certain" | "likely" | "unknown" => {
  const v = val.toLowerCase().trim();
  if (["certain", "definitive", "confirmed", "yes", "100%"].includes(v)) return "certain";
  if (["likely", "probable", "high", "probably"].includes(v)) return "likely";
  return "unknown";
}).describe(
  "How confident you are: 'certain' = definitely a known IP, 'likely' = probably references something but you're not 100% sure, 'unknown' = might be original or might reference something obscure you don't recognize"
);

const franchiseDetectionSchema = z.object({
  confidence: confidenceEnum,
  franchise: z.string().nullable().describe("The canonical franchise name if detected, null if completely original"),
  searchQuery: z.string().nullable().describe(
    "A web search query to verify or learn more about this potential IP. Set even if you're unsure — the search will confirm. Null only if you're certain it's a 100% original world with zero references to existing media."
  ),
});

const searchVerifySchema = z.object({
  isKnownIP: z.boolean().describe("Based on search results, is this a real franchise/IP?"),
  franchise: z.string().nullable().describe("The canonical franchise name confirmed by search, null if not a real IP"),
});

/**
 * Detect franchise using LLM analysis + optional web search verification.
 *
 * Flow:
 * - "certain" → use franchise directly
 * - "likely"/"unknown" + searchQuery → quick web search to verify
 * - no searchQuery → original world
 */
async function detectFranchise(
  knownIP: string | undefined,
  premise: string,
  name: string,
  role: ResolvedRole,
  searchConfig: SearchConfig,
): Promise<string | null> {
  if (knownIP?.trim()) {
    return knownIP.trim();
  }

  try {
    const { object } = await generateObject({
      model: createModel(role.provider),
      schema: franchiseDetectionSchema,
      prompt: `Analyze this RPG campaign concept. Does it reference a known intellectual property (movie, book, game, anime, manga, TV show, comic, tabletop RPG)?

Campaign name: "${name}"
Premise: "${premise}"

Consider: character names, location names, faction names, magic systems, terminology, plot elements that match existing media. Even subtle references count (e.g. mentioning "Sasuke" or "chakra" implies Naruto, "lightsaber" implies Star Wars).

If you're not sure — that's fine. Set confidence to "likely" or "unknown" and provide a searchQuery so we can verify via web search. Better to search and confirm than to miss a reference.`,
      temperature: 0.1,
    });

    // Certain → use directly
    if (object.confidence === "certain" && object.franchise) {
      log.info(`Franchise detected (certain): "${object.franchise}"`);
      return object.franchise;
    }

    // Has a search query → verify via web search
    if (object.searchQuery) {
      log.info(`Franchise uncertain (${object.confidence}), verifying via search: "${object.searchQuery}"`);
      const verified = await verifyFranchiseViaSearch(
        object.searchQuery,
        object.franchise,
        premise,
        role,
        searchConfig,
      );
      if (verified) {
        log.info(`Franchise confirmed by search: "${verified}"`);
        return verified;
      }
      log.info("Search did not confirm a known franchise — treating as original world");
      return null;
    }

    // No search query, not certain → original world
    return null;
  } catch (error) {
    log.warn("LLM franchise detection failed, assuming original world", error);
    return null;
  }
}

/**
 * Quick web search to verify whether a premise references a real franchise.
 * Single search query → parse results → LLM confirms or denies.
 */
async function verifyFranchiseViaSearch(
  searchQuery: string,
  candidateFranchise: string | null,
  premise: string,
  role: ResolvedRole,
  searchConfig: SearchConfig,
): Promise<string | null> {
  try {
    const results = await webSearch(searchQuery, searchConfig, 5);

    if (results.length === 0) {
      log.info("No search results for franchise verification, using LLM candidate");
      return candidateFranchise;
    }

    const searchText = results
      .map((r) => `- ${r.title}: ${r.description} (${r.url})`)
      .join("\n");

    const { object } = await generateObject({
      model: createModel(role.provider),
      schema: searchVerifySchema,
      prompt: `Based on these search results, is "${candidateFranchise ?? searchQuery}" a real franchise/IP?\n\nSearch results:\n${searchText}\n\nOriginal premise: "${premise}"`,
      temperature: 0.0,
    });

    return object.isKnownIP ? object.franchise : null;
  } catch (error) {
    log.warn("Franchise verification search failed, using LLM candidate", error);
    return candidateFranchise;
  }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const ipResearchContextSchema = z.object({
  franchise: z.string().describe("The canonical franchise/IP name"),
  keyFacts: z
    .array(z.string())
    .min(3)
    .max(50)
    .describe(
      "Key lore facts covering: geography, races/species, factions, power systems, characters, history, creatures, culture. Each fact is one complete sentence. 15-40 facts for major franchises."
    ),
  tonalNotes: z
    .array(z.string())
    .min(1)
    .max(12)
    .describe("Atmospheric/tonal signals: grimdark, hopepunk, high-magic, shonen action, etc."),
  canonicalNames: z.object({
    locations: z.array(z.string()).describe("Major canonical location names from the franchise (cities, villages, planets, regions). Use EXACT names from source material. Include all major locations."),
    factions: z.array(z.string()).describe("Major canonical faction/organization names (governments, guilds, armies, clans). Use EXACT names from source material."),
    characters: z.array(z.string()).describe("Major canonical character names (protagonists, antagonists, leaders, key supporting). Use EXACT full names from source material."),
  }).describe("Explicit lists of canonical entity names — these will be injected into generation prompts to prevent the AI from inventing substitutes."),
});

// ---------------------------------------------------------------------------
// MCP primary path
// ---------------------------------------------------------------------------

// Schema for LLM to decide what to research next
const researchPlanSchema = z.object({
  queries: z.array(z.string()).min(1).max(10).describe(
    "Search queries to look up. Each query should target a specific aspect of the franchise that needs clarification."
  ),
  knownFromOverview: z.array(z.string()).max(30).describe(
    "Key facts already clear from the overview — no need to search for these."
  ),
});

function formatResults(query: string, results: { title: string; description: string; url: string }[]): string {
  return `## "${query}"\n${results.map((r) => `- **${r.title}**: ${r.description} (${r.url})`).join("\n")}`;
}

async function researchViaWebSearch(
  franchise: string,
  role: ResolvedRole,
  searchConfig: SearchConfig,
): Promise<IpResearchContext> {
  const allSearchResults: string[] = [];

  // ── Phase 1: Broad overview search ──
  log.info(`Research phase 1: broad overview for "${franchise}"`);
  let overviewText = "";
  try {
    const overviewResults = await webSearch(`${franchise} world lore overview wiki`, searchConfig, 10);
    if (overviewResults.length > 0) {
      overviewText = formatResults(`${franchise} overview`, overviewResults);
      allSearchResults.push(overviewText);
      log.info(`Overview: ${overviewResults.length} results`);
    }
  } catch (err) {
    log.warn("Overview search failed", err);
  }

  // ── Phase 2: LLM reads overview, decides what to deep-dive ──
  let deepDiveQueries: string[] = [];

  if (overviewText) {
    try {
      const { object: plan } = await generateObject({
        model: createModel(role.provider),
        schema: researchPlanSchema,
        prompt: `You are researching the franchise "${franchise}" for a tabletop RPG world generator.

Here is a broad overview from web search:

${overviewText}

Based on this, what SPECIFIC topics still need deeper research? Focus on what's essential for worldbuilding:
- Geography, regions, notable locations
- Races, species, creatures
- Factions, nations, political structure
- Power system (magic, technology, abilities)
- Key characters and their roles
- Major conflicts and historical events
- Flora, fauna, environment, climate

List what you already know from the overview (no need to search again) and generate targeted search queries for gaps. Each query should be specific, e.g. "${franchise} hidden villages map" not just "${franchise} locations".`,
        temperature: 0.2,
      });

      deepDiveQueries = plan.queries;
      if (plan.knownFromOverview.length > 0) {
        log.info(`Already known from overview: ${plan.knownFromOverview.length} facts`);
      }
      log.info(`Phase 2: ${deepDiveQueries.length} deep-dive queries planned`);
    } catch (err) {
      log.warn("Research planning failed, using default queries", err);
      deepDiveQueries = [
        `${franchise} races species factions`,
        `${franchise} power system magic abilities`,
        `${franchise} geography locations map`,
      ];
    }
  } else {
    // Overview failed — use broad defaults
    deepDiveQueries = [
      `${franchise} world setting lore`,
      `${franchise} races factions characters`,
      `${franchise} power system geography`,
    ];
  }

  // ── Phase 3: Execute deep-dive searches ──
  for (const query of deepDiveQueries) {
    try {
      const results = await webSearch(query, searchConfig, 8);
      if (results.length > 0) {
        allSearchResults.push(formatResults(query, results));
        log.info(`Deep-dive: ${results.length} results for "${query}"`);
      }
    } catch (err) {
      log.warn(`Deep-dive search failed: "${query}"`, err);
    }
  }

  if (allSearchResults.length === 0) {
    log.warn("All searches failed, falling back to LLM knowledge");
    return researchViaLLM(franchise, role);
  }

  // ── Phase 4: LLM compiles everything into structured context ──
  const searchText = allSearchResults.join("\n\n");

  const { object } = await generateObject({
    model: createModel(role.provider),
    schema: ipResearchContextSchema,
    prompt: `You are a franchise lore researcher compiling a worldbuilding reference for "${franchise}".

Web search results:

${searchText}

Compile ALL relevant worldbuilding information into structured data. Be thorough — this will be used to generate an RPG world. Include:
- Geography & notable locations
- Races, species, creatures
- Factions, nations, organizations
- Power/magic system with key terminology
- Major characters and their significance
- Historical events and conflicts
- Environmental/atmospheric details
- Cultural elements and traditions

Every fact should be a complete, self-contained sentence.`,
    temperature: 0.1,
  });

  log.info(`Research complete for "${franchise}": ${object.keyFacts.length} facts, ${object.tonalNotes.length} tonal notes`);

  return {
    franchise: object.franchise,
    keyFacts: object.keyFacts,
    tonalNotes: object.tonalNotes,
    canonicalNames: object.canonicalNames,
    source: "mcp" as const,
  };
}

// ---------------------------------------------------------------------------
// LLM fallback path
// ---------------------------------------------------------------------------

async function researchViaLLM(
  franchise: string,
  role: ResolvedRole
): Promise<IpResearchContext> {
  const prompt = `You are an expert on tabletop RPGs and popular fiction franchises.

Provide a structured lore overview for the franchise: "${franchise}"

Focus on information useful for building a custom RPG world inspired by this IP:
- KEY FACTS: geography & locations, races & species, factions & nations, power/magic system, key characters, historical events, creatures, cultural elements (up to 30, one sentence each)
- TONAL NOTES: atmospheric/genre descriptors for the world's feel (up to 8 phrases)`;

  const { object } = await generateObject({
    model: createModel(role.provider),
    schema: ipResearchContextSchema,
    prompt,
    temperature: 0.3,
    maxOutputTokens: role.maxTokens,
  });

  log.info(`LLM fallback research complete for "${franchise}": ${object.keyFacts.length} facts`);

  return {
    franchise: object.franchise,
    keyFacts: object.keyFacts,
    tonalNotes: object.tonalNotes,
    canonicalNames: object.canonicalNames,
    source: "llm",
  };
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

/**
 * Step 0 of the world generation pipeline.
 *
 * Returns an `IpResearchContext` when the premise or `knownIP` field references
 * a recognisable franchise. Returns `null` when no franchise is detected (pure
 * original world), skipping the step with zero overhead.
 */
export interface ResearchableRequest {
  premise: string;
  name: string;
  knownIP?: string;
  research?: { searchProvider?: SearchProvider; braveApiKey?: string; zaiApiKey?: string };
}

export async function researchKnownIP(
  req: ResearchableRequest,
  role: ResolvedRole,
  maxSearchSteps = 10
): Promise<IpResearchContext | null> {
  const searchProvider: SearchProvider = req.research?.searchProvider ?? "brave";

  const searchConfig: SearchConfig = {
    provider: searchProvider,
    braveApiKey: req.research?.braveApiKey,
    zaiApiKey: req.research?.zaiApiKey,
    llmProvider: role.provider,
  };

  const franchise = await detectFranchise(req.knownIP, req.premise, req.name, role, searchConfig);

  if (!franchise) {
    return null;
  }
  log.info(`Detected franchise: "${franchise}" — starting research (maxSteps=${maxSearchSteps}, provider=${searchProvider})`);

  try {
    return await researchViaWebSearch(franchise, role, searchConfig);
  } catch (error) {
    log.warn("Web research failed, falling back to LLM knowledge", error);
    try {
      return await researchViaLLM(franchise, role);
    } catch (llmError) {
      log.error("Research failed entirely (web + LLM)", llmError);
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Research sufficiency evaluation
// ---------------------------------------------------------------------------

const sufficiencySchema = z.object({
  sufficient: z.boolean().describe(
    "true if the existing facts provide enough detail to generate this section accurately"
  ),
  missingTopics: z.array(z.string()).max(3).describe(
    "Up to 3 specific topics that need more research for this section. Each should be a concrete search query."
  ),
});

/**
 * Evaluate whether cached research is sufficient for a specific scaffold step.
 * If not, run targeted searches and merge new facts into ipContext.
 * Returns the (potentially enriched) ipContext.
 */
export async function evaluateResearchSufficiency(
  ipContext: IpResearchContext,
  step: "locations" | "factions" | "npcs",
  premise: string,
  role: ResolvedRole,
  searchConfig?: SearchConfig,
): Promise<IpResearchContext> {
  const stepDescriptions: Record<string, string> = {
    locations: "geographic locations, cities, landmarks, terrain, and spatial layout",
    factions: "political factions, organizations, clans, guilds, and power groups",
    npcs: "notable characters, leaders, heroes, villains, and key personalities",
  };

  try {
    const { object: evaluation } = await generateObject({
      model: createModel(role.provider),
      schema: sufficiencySchema,
      prompt: `You are evaluating whether existing research about "${ipContext.franchise}" is sufficient to generate ${stepDescriptions[step]} for a world scaffold.

PREMISE: "${premise}"

EXISTING RESEARCH (${ipContext.keyFacts.length} facts):
${ipContext.keyFacts.map((f) => `- ${f}`).join("\n")}

Is this enough to generate accurate, detailed ${step} for this franchise? Consider:
- Do we know enough specific ${step} from the source material?
- Are there major ${step} missing that would make the generation inaccurate?
- Would a fan notice obvious omissions?

If insufficient, suggest up to 3 targeted search queries to fill the gaps.`,
      temperature: 0.2,
      maxOutputTokens: 32000,
    });

    if (evaluation.sufficient || evaluation.missingTopics.length === 0) {
      log.info(`Research sufficient for ${step} (${ipContext.franchise})`);
      return ipContext;
    }

    if (!searchConfig) {
      log.info(`Research gaps for ${step} but no search config — proceeding with existing data`);
      return ipContext;
    }

    // Run targeted searches for missing topics
    log.info(`Research gaps for ${step}: ${evaluation.missingTopics.join(", ")} — searching...`);
    const newFacts: string[] = [];

    for (const topic of evaluation.missingTopics) {
      try {
        const results = await webSearch(topic, searchConfig, 5);
        if (results.length > 0) {
          // Extract facts from search results via LLM
          const snippets = results.map((r) => `${r.title}: ${r.description}`).join("\n");
          const { object: extracted } = await generateObject({
            model: createModel(role.provider),
            schema: z.object({
              facts: z.array(z.string()).max(5).describe("Key facts extracted from search results"),
            }),
            prompt: `Extract key CANONICAL facts about "${ipContext.franchise}" relevant to ${step} from these search results:\n\n${snippets}\n\nRULES:\n- Only include facts from the OFFICIAL canon (manga, anime, games by the original creators).\n- EXCLUDE fan-made content, fan wikis speculation, filler episodes, non-canon movies, and fan theories.\n- Each fact must name specific canonical entities (places, characters, organizations).\n- Only include facts that are NOT already known:\n${ipContext.keyFacts.slice(0, 10).map((f) => `- ${f}`).join("\n")}`,
            temperature: 0.1,
            maxOutputTokens: 32000,
          });
          newFacts.push(...extracted.facts);
        }
      } catch (err) {
        log.warn(`Sufficiency search failed for "${topic}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (newFacts.length === 0) {
      log.info(`No new facts found for ${step} — proceeding with existing data`);
      return ipContext;
    }

    // Deduplicate: filter out facts that are too similar to existing ones
    const existingLower = new Set(ipContext.keyFacts.map((f) => f.toLowerCase().trim()));
    const unique = newFacts.filter((f) => !existingLower.has(f.toLowerCase().trim()));

    if (unique.length === 0) {
      return ipContext;
    }

    log.info(`Enriched research for ${step}: +${unique.length} new facts`);
    return {
      ...ipContext,
      keyFacts: [...ipContext.keyFacts, ...unique],
    };
  } catch (err) {
    log.warn(`Sufficiency evaluation failed for ${step}: ${err instanceof Error ? err.message : String(err)}`);
    return ipContext;
  }
}
