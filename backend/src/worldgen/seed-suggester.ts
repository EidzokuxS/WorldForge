import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { clampTokens } from "../lib/index.js";
import type { SeedCategory } from "./seed-roller.js";
import type { IpResearchContext } from "./ip-researcher.js";
import { buildIpContextBlock, buildStopSlopRules } from "./scaffold-steps/prompt-utils.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SuggestSeedsRequest {
  premise: string;
  name?: string;
  role: ResolvedRole;
  ipContext?: IpResearchContext | null;
  research?: { enabled: boolean; searchProvider?: string; braveApiKey?: string; zaiApiKey?: string; maxSearchSteps?: number };
}

export interface SuggestedSeeds {
  geography: string;
  politicalStructure: string;
  centralConflict: string;
  culturalFlavor: string[];
  environment: string;
  wildcard: string;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface DnaCategoryResult {
  value: string | string[];
  reasoning: string;
}

// ---------------------------------------------------------------------------
// Category metadata (order matters — each sees previous)
// ---------------------------------------------------------------------------

const categoryDescriptions: Record<SeedCategory, string> = {
  geography: "physical landscape, terrain, or spatial structure",
  politicalStructure: "how power is organized - government, authority, hierarchy",
  centralConflict: "the core tension or struggle driving the world",
  culturalFlavor: "2-3 real-world or thematic cultural inspirations",
  environment: "climate, atmosphere, or environmental condition",
  wildcard: "one unexpected, unique element that makes this world stand out",
};

const DNA_CATEGORIES: ReadonlyArray<{ key: SeedCategory; label: string }> = [
  { key: "geography", label: "Geography" },
  { key: "politicalStructure", label: "Political Structure" },
  { key: "centralConflict", label: "Central Conflict" },
  { key: "culturalFlavor", label: "Cultural Flavor" },
  { key: "environment", label: "Environment" },
  { key: "wildcard", label: "Wildcard" },
];

// ---------------------------------------------------------------------------
// Sequential DNA generation — 6 calls, each sees previous categories
// ---------------------------------------------------------------------------

export async function suggestWorldSeeds(
  req: SuggestSeedsRequest
): Promise<{ seeds: SuggestedSeeds; ipContext: IpResearchContext | null }> {
  const ipContext = req.ipContext ?? null;
  const results: Partial<Record<SeedCategory, DnaCategoryResult>> = {};
  const accumulated: string[] = [];

  for (const { key, label } of DNA_CATEGORIES) {
    const isCultural = key === "culturalFlavor";

    const ipInstruction = ipContext
      ? `This world is based on "${ipContext.franchise}". Describe the ACTUAL canonical ${label.toLowerCase()} as modified by the premise changes below. Use franchise-specific terminology.`
      : `This is an original world. Generate a specific, concrete ${label.toLowerCase()} based on the premise.`;

    const ipBlock = buildIpContextBlock(ipContext);

    const accumulatedSection = accumulated.length > 0
      ? `\nALREADY ESTABLISHED DNA:\n${accumulated.join("\n")}\n\nYour ${label.toLowerCase()} MUST be consistent with and influenced by the above.`
      : "";

    const prompt = `You are describing the ${label} of a world for a text RPG.

${ipInstruction}
${ipBlock}
PREMISE: "${req.premise}"
${accumulatedSection}

Return the ${label.toLowerCase()} as a concrete 1-2 sentence description${isCultural ? " (2-3 cultural/thematic inspirations as an array)" : ""}, plus 1 sentence of reasoning explaining WHY this follows from the premise${accumulated.length > 0 ? " and previous DNA" : ""}.
${buildStopSlopRules()}`;

    let categoryResult: DnaCategoryResult;

    if (isCultural) {
      const result = await generateObject({
        model: createModel(req.role.provider),
        schema: z.object({ value: z.array(z.string()).min(2).max(3), reasoning: z.string() }),
        prompt,
        temperature: req.role.temperature,
        maxOutputTokens: clampTokens(req.role.maxTokens),
      });
      categoryResult = result.object;
    } else {
      const result = await generateObject({
        model: createModel(req.role.provider),
        schema: z.object({ value: z.string(), reasoning: z.string() }),
        prompt,
        temperature: req.role.temperature,
        maxOutputTokens: clampTokens(req.role.maxTokens),
      });
      categoryResult = result.object;
    }
    results[key] = categoryResult;

    const displayValue = Array.isArray(categoryResult.value)
      ? categoryResult.value.join(", ")
      : categoryResult.value;
    accumulated.push(`- ${label}: ${displayValue} (Reasoning: ${categoryResult.reasoning})`);
  }

  const seeds: SuggestedSeeds = {
    geography: results.geography!.value as string,
    politicalStructure: results.politicalStructure!.value as string,
    centralConflict: results.centralConflict!.value as string,
    culturalFlavor: results.culturalFlavor!.value as string[],
    environment: results.environment!.value as string,
    wildcard: results.wildcard!.value as string,
  };

  return { seeds, ipContext };
}

// ---------------------------------------------------------------------------
// Single seed suggestion (independent — no sequential dependency)
// ---------------------------------------------------------------------------

export async function suggestSingleSeed(
  req: SuggestSeedsRequest & { category: SeedCategory; ipContext?: IpResearchContext | null }
): Promise<string | string[]> {
  const isCultural = req.category === "culturalFlavor";
  const ipContext = req.ipContext ?? null;
  const ipBlock = buildIpContextBlock(ipContext);

  const prompt = `You are a world-building assistant. Based on this premise, suggest a value for "${req.category}" (${categoryDescriptions[req.category]}).
${ipBlock}
PREMISE: "${req.premise}"

Be specific, creative, and evocative. 1-2 sentences max.${isCultural ? " Return 2-3 cultural/thematic inspirations." : ""}
${buildStopSlopRules()}`;

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
