import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { clampTokens, createLogger } from "../lib/index.js";
import type { SeedCategory } from "./seed-roller.js";
import { researchKnownIP, type IpResearchContext } from "./ip-researcher.js";
import type { SearchProvider } from "@worldforge/shared";

const log = createLogger("seed-suggester");

const suggestedSeedsSchema = z.object({
  geography: z
    .string()
    .describe("Physical landscape, terrain type, or spatial structure of the world"),
  politicalStructure: z
    .string()
    .describe("How power is organized - government, authority, hierarchy"),
  centralConflict: z
    .string()
    .describe("The core tension or struggle driving the world"),
  culturalFlavor: z
    .array(z.string())
    .min(2)
    .max(3)
    .describe(
      "2-3 real-world or thematic cultural inspirations that flavor the world"
    ),
  environment: z
    .string()
    .describe("Climate, atmosphere, or environmental condition"),
  wildcard: z
    .string()
    .describe("One unexpected, unique element that makes this world stand out"),
});

export type SuggestedSeeds = z.infer<typeof suggestedSeedsSchema>;

export interface SuggestSeedsRequest {
  premise: string;
  name?: string;
  role: ResolvedRole;
  /** Pre-fetched research context (avoids re-researching for single seed calls) */
  ipContext?: IpResearchContext | null;
  /** Research config — if provided, triggers IP research */
  research?: {
    enabled?: boolean;
    searchProvider?: SearchProvider;
    maxSearchSteps?: number;
  };
}

const categoryDescriptions: Record<SeedCategory, string> = {
  geography: "physical landscape, terrain, or spatial structure",
  politicalStructure: "how power is organized - government, authority, hierarchy",
  centralConflict: "the core tension or struggle driving the world",
  culturalFlavor: "2-3 real-world or thematic cultural inspirations",
  environment: "climate, atmosphere, or environmental condition",
  wildcard: "one unexpected, unique element that makes this world stand out",
};

export interface SuggestSeedsResult {
  seeds: SuggestedSeeds;
  ipContext: IpResearchContext | null;
}

export async function suggestWorldSeeds(
  req: SuggestSeedsRequest
): Promise<SuggestSeedsResult> {
  // Run IP research if enabled and not already provided
  let ipContext = req.ipContext ?? null;
  if (!ipContext && req.research?.enabled !== false) {
    try {
      ipContext = await researchKnownIP(
        { premise: req.premise, name: req.name ?? "", knownIP: undefined, research: req.research },
        req.role,
        req.research?.maxSearchSteps ?? 5,
      );
      if (ipContext) {
        log.info(`IP research for seeds: "${ipContext.franchise}" (${ipContext.source}), ${ipContext.keyFacts.length} facts`);
      } else {
        log.info("No known IP detected — generating original world seeds");
      }
    } catch (err) {
      log.warn("IP research failed, proceeding without context", err);
    }
  }

  const ipSection = ipContext
    ? `\n\nFRANCHISE CONTEXT (${ipContext.franchise}):\nKey facts:\n${ipContext.keyFacts.map(f => `- ${f}`).join("\n")}\nTone: ${ipContext.tonalNotes.join(", ")}\n\nIMPORTANT: Suggestions MUST be consistent with this franchise's lore, geography, politics, and tone. Use canonical terminology and locations where appropriate.`
    : "";

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: suggestedSeedsSchema,
    prompt: `You are a world-building assistant for a text RPG. Based on the player's premise below, suggest creative and fitting World DNA constraints.

PREMISE: "${req.premise}"${ipSection}

For each category, suggest a concise value (1-2 sentences max) that fits naturally with the premise. Be specific and evocative - avoid generic fantasy tropes unless the premise calls for them. The suggestions should feel like they belong in this specific world, not any random world.

For culturalFlavor, pick 2-3 real-world cultural aesthetics or thematic inspirations that would enrich this world (e.g., "Feudal Japanese", "Soviet brutalist", "Mesoamerican", "1980s cyberpunk").`,
    temperature: req.role.temperature,
    maxOutputTokens: clampTokens(req.role.maxTokens),
  });

  return { seeds: result.object, ipContext };
}

export async function suggestSingleSeed(
  req: SuggestSeedsRequest & { category: SeedCategory }
): Promise<string | string[]> {
  const isCultural = req.category === "culturalFlavor";
  const ipContext = req.ipContext;
  const ipSection = ipContext
    ? `\n\nFRANCHISE: ${ipContext.franchise}\nKey facts: ${ipContext.keyFacts.slice(0, 5).join("; ")}\nTone: ${ipContext.tonalNotes.join(", ")}\nSuggestion MUST be consistent with this franchise's lore.`
    : "";

  const prompt = `You are a world-building assistant. Based on this premise, suggest a value for "${req.category}" (${categoryDescriptions[req.category]}).

PREMISE: "${req.premise}"${ipSection}

Be specific, creative, and evocative. 1-2 sentences max.${isCultural ? " Return 2-3 cultural/thematic inspirations." : ""}`;

  if (isCultural) {
    const result = await generateObject({
      model: createModel(req.role.provider),
      schema: z.object({ value: z.array(z.string()).min(2).max(3) }),
      prompt,
      temperature: req.role.temperature,
      maxOutputTokens: 512,
    });
    return result.object.value;
  }

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({ value: z.string() }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: 512,
  });
  return result.object.value;
}
