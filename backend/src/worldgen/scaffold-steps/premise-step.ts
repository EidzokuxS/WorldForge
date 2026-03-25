import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import { buildIpContextBlock, buildSeedConstraints, buildStopSlopRules } from "./prompt-utils.js";
import type { IpResearchContext } from "../ip-researcher.js";
import type { GenerateScaffoldRequest } from "../types.js";

const refinedPremiseSchema = z.object({
  refinedPremise: z.string().describe("2-3 sentence refined world premise"),
});

export async function generateRefinedPremiseStep(
  req: GenerateScaffoldRequest,
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
): Promise<string> {
  const seedConstraints = buildSeedConstraints(req.seeds);
  const ipBlock = buildIpContextBlock(ipContext);

  const prompt = `You are a world-state summarizer for a text RPG engine.

PLAYER CONCEPT:
Name: ${req.name}
Premise: ${req.premise}
${seedConstraints}${ipBlock}
YOUR TASK: Write exactly 2-3 sentences describing the current state of this world.

RULES:
1. Describe the world AS IT EXISTS RIGHT NOW — not a plot synopsis, not a story hook. What does a bird's-eye view of this world show today?
2. Preserve every character relationship the user stated VERBATIM. If the user wrote "A trained by B, C by D" — output those exact pairings unchanged. Do not swap, merge, or reinterpret them.
3. For known IPs: use canonical titles and epithets as they exist in the franchise. Do not invent titles.
4. If WORLD DNA constraints are listed above, weave ALL of them into the premise. None may be omitted.
5. Do not introduce characters, events, factions, or details that the user's premise does not state or directly imply.
6. Do not write hooks like "but little do they know..." or "the stage is set for...". State facts about the world's current condition.${additionalInstruction ? `\n\nADDITIONAL USER INSTRUCTION:\n${additionalInstruction}` : ""}

${buildStopSlopRules()}`;

  const result = await generateObject({
    model: createModel(req.role.provider),
    schema: refinedPremiseSchema,
    prompt,
    temperature: req.role.temperature,
    maxOutputTokens: req.role.maxTokens,
  });

  return result.object.refinedPremise;
}
