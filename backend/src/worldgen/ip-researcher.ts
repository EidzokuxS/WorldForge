import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import type { SearchProvider, IpResearchContext } from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { GenerateScaffoldRequest } from "./types.js";
import { createLogger } from "../lib/index.js";
import { clampTokens } from "../lib/clamp.js";
import { webSearch, type SearchConfig } from "../lib/web-search.js";
import {
  buildWorldgenResearchPlan,
  type WorldgenResearchJob,
  type WorldgenResearchPlan,
} from "./retrieval-intent.js";
import type { WorldgenResearchFrame } from "./research-frame.js";
import { buildWorldgenResearchFrameBlock } from "./research-frame.js";

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
  const knownIpHint = knownIP?.trim() || null;

  try {
    const { object } = await generateObject({
      model: createModel(role.provider),
      schema: franchiseDetectionSchema,
      prompt: `Analyze this RPG campaign concept. Does it reference a known intellectual property (movie, book, game, anime, manga, TV show, comic, tabletop RPG)?

Campaign name: "${name}"
Premise: "${premise}"
${knownIpHint ? `IP field hint: "${knownIpHint}"` : ""}

Consider: character names, location names, faction names, magic systems, terminology, plot elements that match existing media. Even subtle references count (e.g. mentioning "Sasuke" or "chakra" implies Naruto, "lightsaber" implies Star Wars).
If an IP field hint is present, treat it as a clue, not canonical truth. Extract the underlying franchise name if one exists. Do not repeat long descriptive prose from the field unless that exact prose is the official title.

If you're not sure — that's fine. Set confidence to "likely" or "unknown" and provide a searchQuery so we can verify via web search. Better to search and confirm than to miss a reference.`,
      temperature: 0.1,
    });

    // Certain → use directly
    if (object.confidence === "certain" && object.franchise) {
      log.info(`Franchise detected (certain): "${object.franchise}"`);
      return object.franchise;
    }

    // Has a search query → verify via web search
    const verificationQuery = object.searchQuery ?? knownIpHint;
    if (verificationQuery) {
      log.info(`Franchise uncertain (${object.confidence}), verifying via search: "${verificationQuery}"`);
      const verified = await verifyFranchiseViaSearch(
        verificationQuery,
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
      log.warn("No search results for franchise verification; refusing to assume the candidate franchise is correct");
      return null;
    }

    const searchText = results
      .map((r) => `- ${r.title}: ${r.description} (${r.url})`)
      .join("\n");

    const { object } = await generateObject({
      model: createModel(role.provider),
      schema: searchVerifySchema,
      prompt: `A user wrote this RPG premise: "${premise}"

We suspect it references "${candidateFranchise ?? searchQuery}". Search results:
${searchText}

QUESTION: Does the user's PREMISE actually describe this franchise's world?
- The premise must contain franchise-specific elements (unique characters, locations, terminology, magic systems, plot points).
- Sharing a common word or generic theme is NOT enough. Only count references that would be meaningless outside the franchise.
- If the campaign name resembles a franchise but the premise describes an unrelated world, answer false.`,
      temperature: 0.0,
    });

    return object.isKnownIP ? object.franchise : null;
  } catch (error) {
    log.warn("Franchise verification search failed; refusing to trust the unverified LLM candidate", error);
    return null;
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
    .describe(
      "Key lore facts covering: geography, races/species, factions, power systems, characters, history, creatures, culture. Each fact is one complete sentence. 15-40 facts for major franchises."
    ),
  tonalNotes: z
    .array(z.string())
    .min(1)
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

function formatAttemptedJobs(plan: WorldgenResearchPlan): string {
  return plan.jobs
    .map((job, index) => `${index + 1}. [${job.topic}] ${job.query} — ${job.purpose}`)
    .join("\n");
}

function formatResults(job: WorldgenResearchJob, results: { title: string; description: string; url: string }[]): string {
  return [
    `## ${job.topic}`,
    `QUERY: "${job.query}"`,
    `PURPOSE: ${job.purpose}`,
    results.map((r) => `- **${r.title}**: ${r.description} (${r.url})`).join("\n"),
  ].join("\n");
}

async function researchViaWebSearch(
  franchise: string,
  premise: string,
  role: ResolvedRole,
  searchConfig: SearchConfig,
  maxSearchSteps: number,
): Promise<IpResearchContext> {
  const plan = buildWorldgenResearchPlan({
    franchise,
    premise,
    maxJobs: maxSearchSteps,
  });
  const allSearchResults: string[] = [];

  log.info(`Planned ${plan.jobs.length} focused retrieval jobs for "${franchise}"`);

  for (const job of plan.jobs) {
    try {
      const results = await webSearch(job.query, searchConfig, 8);
      if (results.length > 0) {
        allSearchResults.push(formatResults(job, results));
        log.info(`Focused search: ${results.length} results for [${job.topic}] "${job.query}"`);
      }
    } catch (err) {
      log.warn(`Focused search failed for [${job.topic}] "${job.query}"`, err);
    }
  }

  if (allSearchResults.length === 0) {
    throw new Error(
      `All focused searches failed for "${franchise}". Attempted jobs:\n${formatAttemptedJobs(plan)}`,
    );
  }

  const searchText = allSearchResults.join("\n\n");

  const { object } = await generateObject({
    model: createModel(role.provider),
    schema: ipResearchContextSchema,
    prompt: `You are a franchise lore researcher compiling a worldbuilding reference for "${franchise}".

Web search results:

${searchText}

Compile ALL relevant worldbuilding information into structured data. Be thorough — this will be used to generate an RPG world. Preserve the distinctions between the focused retrieval jobs instead of collapsing them into one vague summary. Include:
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
    return await researchViaWebSearch(franchise, req.premise, role, searchConfig, maxSearchSteps);
  } catch (error) {
    log.error("Known-IP research failed without a valid grounded result", error);
    throw error;
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
    "Up to 3 short research gaps that need more canon grounding for this section. Each item should be a concise fact topic, not a full search query and not a restatement of the user premise or IP field."
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
  researchFrame?: WorldgenResearchFrame | null,
): Promise<IpResearchContext> {
  const stepDescriptions: Record<string, string> = {
    locations: "geographic locations, cities, landmarks, terrain, and spatial layout",
    factions: "political factions, organizations, clans, guilds, and power groups",
    npcs: "notable characters, leaders, heroes, villains, and key personalities",
  };

  try {
    const frameBlock = buildWorldgenResearchFrameBlock(researchFrame, step);
    const { object: evaluation } = await generateObject({
      model: createModel(role.provider),
      schema: sufficiencySchema,
      prompt: `You are evaluating whether existing research about "${ipContext.franchise}" is sufficient to generate ${stepDescriptions[step]} for a world scaffold.

PREMISE: "${premise}"
${frameBlock ? `\n${frameBlock}\n` : ""}

EXISTING RESEARCH (${ipContext.keyFacts.length} facts):
${ipContext.keyFacts.map((f) => `- ${f}`).join("\n")}

Is this enough to generate accurate, detailed ${step} for this franchise? Consider:
- Do we know enough specific ${step} from the source material?
- Are there major ${step} missing that would make the generation inaccurate?
- Would a fan notice obvious omissions?
- If WORLDGEN RESEARCH FRAME is present, judge sufficiency against those active DNA and divergence constraints, not only against generic canon.

If insufficient, suggest up to 3 short missing fact topics to fill the gaps.
Rules for missingTopics:
- 2-10 words each when possible
- name the missing canon fact domain, entity, region, event, rule, or relationship
- do not paste the raw IP field, raw premise, or long prose from WORLDGEN RESEARCH FRAME
- bad: "Jujutsu Kaisen world, but there's a Naruto power system as well canonical locations..."
- good: "Shibuya underground layout", "Five Great Nations geography", "Akatsuki regional influence"`,
      temperature: 0.2,
      maxOutputTokens: clampTokens(role.maxTokens),
    });

    if (evaluation.sufficient || evaluation.missingTopics.length === 0) {
      log.info(`Research sufficient for ${step} (${ipContext.franchise})`);
      return ipContext;
    }

    if (!searchConfig) {
      log.info(`Research gaps for ${step} but no search config — proceeding with existing data`);
      return ipContext;
    }

    const plan = buildWorldgenResearchPlan({
      franchise: ipContext.franchise,
      premise,
      step,
      missingTopics: evaluation.missingTopics,
      researchFrame,
      maxJobs: 3,
    });

    if (plan.jobs.length === 0) {
      return ipContext;
    }

    log.info(`Research gaps for ${step}. Focused jobs:\n${formatAttemptedJobs(plan)}`);
    const newFacts: string[] = [];

    for (const job of plan.jobs) {
      try {
        const results = await webSearch(job.query, searchConfig, 5);
        if (results.length > 0) {
          const snippets = results.map((r) => `${r.title}: ${r.description}`).join("\n");
          const { object: extracted } = await generateObject({
            model: createModel(role.provider),
            schema: z.object({
              facts: z.array(z.string()).max(5).describe("Key facts extracted from search results"),
            }),
            prompt: `Extract key CANONICAL facts about "${ipContext.franchise}" relevant to ${step} from these search results.

RETRIEVAL JOB
- Topic: ${job.topic}
- Purpose: ${job.purpose}
- Query: ${job.query}
${frameBlock ? `\n${frameBlock}\n` : ""}

SEARCH RESULTS
${snippets}

RULES:
- Only include facts from the OFFICIAL canon (manga, anime, games by the original creators).
- EXCLUDE fan-made content, fan wikis speculation, filler episodes, non-canon movies, and fan theories.
- Each fact must name specific canonical entities (places, characters, organizations).
- Prefer facts that help with the active WORLDGEN RESEARCH FRAME and current ${step} step.
- Only include facts that are NOT already known:
${ipContext.keyFacts.slice(0, 10).map((f) => `- ${f}`).join("\n")}`,
            temperature: 0.1,
            maxOutputTokens: clampTokens(role.maxTokens),
          });
          newFacts.push(...extracted.facts);
        }
      } catch (err) {
        log.warn(`Sufficiency search failed for "${job.query}": ${err instanceof Error ? err.message : String(err)}`);
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
