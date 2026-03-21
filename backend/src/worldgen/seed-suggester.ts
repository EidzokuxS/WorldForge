import { generateObject } from "ai";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { clampTokens } from "../lib/clamp.js";
import type { SeedCategory } from "./seed-roller.js";

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
  role: ResolvedRole;
}

const categoryDescriptions: Record<SeedCategory, string> = {
  geography: "physical landscape, terrain, or spatial structure",
  politicalStructure: "how power is organized - government, authority, hierarchy",
  centralConflict: "the core tension or struggle driving the world",
  culturalFlavor: "2-3 real-world or thematic cultural inspirations",
  environment: "climate, atmosphere, or environmental condition",
  wildcard: "one unexpected, unique element that makes this world stand out",
};

export async function suggestWorldSeeds(
  req: SuggestSeedsRequest
): Promise<SuggestedSeeds> {
  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: suggestedSeedsSchema,
    prompt: `You are a world-building assistant for a text RPG. Based on the player's premise below, suggest creative and fitting World DNA constraints.

PREMISE: "${req.premise}"

For each category, suggest a concise value (1-2 sentences max) that fits naturally with the premise. Be specific and evocative - avoid generic fantasy tropes unless the premise calls for them. The suggestions should feel like they belong in this specific world, not any random world.

For culturalFlavor, pick 2-3 real-world cultural aesthetics or thematic inspirations that would enrich this world (e.g., "Feudal Japanese", "Soviet brutalist", "Mesoamerican", "1980s cyberpunk").`,
    temperature: req.role.temperature,
    maxOutputTokens: clampTokens(req.role.maxTokens),
  });

  return result.object;
}

export async function suggestSingleSeed(
  req: SuggestSeedsRequest & { category: SeedCategory }
): Promise<string | string[]> {
  const isCultural = req.category === "culturalFlavor";
  const prompt = `You are a world-building assistant. Based on this premise, suggest a value for "${req.category}" (${categoryDescriptions[req.category]}).

PREMISE: "${req.premise}"

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
