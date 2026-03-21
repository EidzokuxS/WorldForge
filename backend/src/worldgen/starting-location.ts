import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";

export interface StartingLocationResult {
  locationName: string;
  narrative: string;
}

export async function resolveStartingLocation(opts: {
  premise: string;
  locationNames: string[];
  userPrompt: string;
  role: ResolvedRole;
}): Promise<StartingLocationResult> {
  const locationList = opts.locationNames.join(", ");

  const { object } = await generateObject({
    model: createModel(opts.role.provider),
    schema: z.object({
      locationName: z.string().describe("One of the known locations"),
      narrative: z.string().describe("1-2 sentences describing why the character starts here"),
    }),
    prompt: `WORLD PREMISE: ${opts.premise}\n\nKNOWN LOCATIONS: ${locationList}\n\nPLAYER REQUEST: "${opts.userPrompt}"\n\nPick the best starting location and write 1-2 sentences explaining why the character begins their journey there.`,
    temperature: opts.role.temperature,
    maxOutputTokens: opts.role.maxTokens,
  });

  return object;
}
