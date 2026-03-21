import { generateText, stepCountIs, type ToolSet } from "ai";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { SearchProvider } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { GenerateScaffoldRequest } from "./types.js";
import { createLogger, withSearchMcp } from "../lib/index.js";

const log = createLogger("ip-researcher");

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface IpResearchContext {
  /** Canonical franchise name, e.g. "Warhammer 40,000" */
  franchise: string;
  /** Up to 15 key lore facts (races, factions, magic systems, tone…) */
  keyFacts: string[];
  /** Up to 5 tonal / atmosphere notes for prompting */
  tonalNotes: string[];
  /** Whether context came from live web search or LLM internal knowledge */
  source: "mcp" | "llm";
}

// ---------------------------------------------------------------------------
// LLM-based franchise detection
// ---------------------------------------------------------------------------

const franchiseDetectionSchema = z.object({
  confidence: z.enum(["certain", "likely", "unknown"]).describe(
    "How confident you are: 'certain' = definitely a known IP, 'likely' = probably references something but you're not 100% sure, 'unknown' = might be original or might reference something obscure you don't recognize"
  ),
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
  searchProvider: SearchProvider = "duckduckgo",
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
        searchProvider,
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
  searchProvider: SearchProvider,
): Promise<string | null> {
  try {
    return await withSearchMcp(
      searchProvider,
      async (tools: ToolSet) => {
        const { text: searchResults } = await generateText({
          model: createModel(role.provider),
          tools,
          stopWhen: stepCountIs(3),
          prompt: `Search for: "${searchQuery}". Then determine if the search results confirm this is a real franchise/IP that the following campaign premise references:\n\nPremise: "${premise}"\n\nReturn your findings as plain text.`,
          temperature: 0.1,
        });

        const { object } = await generateObject({
          model: createModel(role.provider),
          schema: searchVerifySchema,
          prompt: `Based on these search results, is "${candidateFranchise ?? searchQuery}" a real franchise/IP?\n\nSearch results:\n${searchResults}\n\nOriginal premise: "${premise}"`,
          temperature: 0.0,
        });

        return object.isKnownIP ? object.franchise : null;
      },
      async () => {
        // MCP search unavailable — fall back to LLM knowledge only
        log.warn("Search MCP unavailable for franchise verification, using LLM knowledge only");
        return candidateFranchise;
      },
    );
  } catch (error) {
    log.warn("Franchise verification search failed", error);
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
    .max(15)
    .describe(
      "Key lore facts: races, factions, magic systems, history, technology. Each fact is one sentence."
    ),
  tonalNotes: z
    .array(z.string())
    .min(1)
    .max(5)
    .describe("Atmospheric/tonal signals: grimdark, hopepunk, high-magic, etc."),
});

// ---------------------------------------------------------------------------
// MCP primary path
// ---------------------------------------------------------------------------

async function researchViaMCP(
  franchise: string,
  role: ResolvedRole,
  maxSearchSteps: number,
  searchProvider: SearchProvider = "duckduckgo"
): Promise<IpResearchContext> {
  return withSearchMcp(
    searchProvider,
    async (tools: ToolSet) => {
      const searchPrompt = `You are a franchise lore researcher for a tabletop RPG world generator.
Research the franchise "${franchise}" using the available DuckDuckGo search tools.

Your goals:
1. Search for "${franchise} lore overview"
2. Search for "${franchise} races factions"
3. Search for "${franchise} magic system" (or equivalent power/technology system)

After researching, compile:
- Up to 15 concise KEY FACTS about the franchise world (races, factions, notable locations, historical events, power systems)
- Up to 5 TONAL NOTES describing the atmosphere (e.g. "grimdark military sci-fi", "high fantasy epic", "cosmic horror")

Output your final compiled notes in plain text.`;

      const { text: rawResearch } = await generateText({
        model: createModel(role.provider),
        tools,
        stopWhen: stepCountIs(maxSearchSteps),
        prompt: searchPrompt,
        temperature: 0.3,
      });

      // Parse the LLM's freeform research into structured data
      const parsePrompt = `You just completed web research on the franchise "${franchise}". Here are your research notes:

${rawResearch}

Now structure these into a clean JSON object.`;

      const { object } = await generateObject({
        model: createModel(role.provider),
        schema: ipResearchContextSchema,
        prompt: parsePrompt,
        temperature: 0.1,
      });

      log.info(`MCP research complete for "${franchise}": ${object.keyFacts.length} facts collected`);

      return {
        franchise: object.franchise,
        keyFacts: object.keyFacts,
        tonalNotes: object.tonalNotes,
        source: "mcp" as const,
      };
    },
    () => researchViaLLM(franchise, role),
  );
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
- KEY FACTS: races, factions, power systems, notable historical events, signature locations (up to 15, one sentence each)
- TONAL NOTES: atmospheric/genre descriptors for the world's feel (up to 5 phrases)`;

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
export async function researchKnownIP(
  req: GenerateScaffoldRequest,
  role: ResolvedRole,
  maxSearchSteps = 10
): Promise<IpResearchContext | null> {
  const searchProvider: SearchProvider = req.research?.searchProvider ?? "duckduckgo";
  const franchise = await detectFranchise(req.knownIP, req.premise, req.name, role, searchProvider);

  if (!franchise) {
    return null;
  }
  log.info(`Detected franchise: "${franchise}" — starting research (maxSteps=${maxSearchSteps}, provider=${searchProvider})`);

  try {
    return await researchViaMCP(franchise, role, maxSearchSteps, searchProvider);
  } catch (error) {
    log.error("Research failed entirely", error);
    return null;
  }
}
