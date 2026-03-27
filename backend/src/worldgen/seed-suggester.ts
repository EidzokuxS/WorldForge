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
      ? `This world is the ${ipContext.franchise} universe. Describe its canonical ${label.toLowerCase()} as it exists in the source material, then note any modifications caused by the premise divergence. Use the franchise's own terminology.`
      : `This is an original world. Generate a specific, concrete ${label.toLowerCase()} that follows logically from the premise.`;

    const ipBlock = buildIpContextBlock(ipContext);

    const accumulatedSection = accumulated.length > 0
      ? `\nALREADY ESTABLISHED DNA:\n${accumulated.join("\n")}\n\nYour ${label.toLowerCase()} MUST be consistent with the above. Do not contradict established DNA.`
      : "";

    const prompt = `You are defining the ${label} of a world for a text RPG engine.

${ipInstruction}
${ipBlock}
PREMISE: "${req.premise}"
${accumulatedSection}

OUTPUT:
- value: ${isCultural ? "An array of 2-3 specific cultural or thematic inspirations (real-world cultures, literary genres, historical periods)" : "A concrete 1-2 sentence description. Name specific places, systems, or conditions — not vague adjectives"}.
- reasoning: 1 sentence explaining why this ${label.toLowerCase()} follows from the premise${accumulated.length > 0 ? " and established DNA" : ""}.
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

  const prompt = `Define the ${req.category} (${categoryDescriptions[req.category]}) for a text RPG world.
${ipBlock}
PREMISE: "${req.premise}"

OUTPUT: ${isCultural ? "An array of 2-3 specific cultural or thematic inspirations." : "A concrete 1-2 sentence description. Name specific places, systems, or conditions."}
${buildStopSlopRules()}`;

  if (isCultural) {
    const result = await generateObject({
      model: createModel(req.role.provider),
      schema: z.object({ value: z.array(z.string()).min(2).max(3) }),
      prompt,
      temperature: req.role.temperature,
      maxOutputTokens: 32000,
    });
    return result.object.value;
  }

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: z.object({ value: z.string() }),
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: 32000,
  });
  return result.object.value;
}
