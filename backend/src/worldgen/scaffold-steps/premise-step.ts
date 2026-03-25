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

  const prompt = `You are refining a world premise for a text RPG.

PLAYER CONCEPT:
Name: ${req.name}
Premise: ${req.premise}
${seedConstraints}${ipBlock}
PREMISE REFINEMENT RULES:
- Output EXACTLY 2-3 sentences that set the stage for this world.
- PRESERVE the user's stated character relationships VERBATIM. If the user says "Naruto trained by Tsunade, Sakura by Orochimaru" — your premise MUST state exactly that. Do NOT swap, reorder, or reinterpret pairings.
- For known IPs: use CANONICAL character titles and epithets (e.g., Tsunade = "Slug Princess/Legendary Sannin", Jiraiya = "Toad Sage", Orochimaru = "Snake Sannin"). Do NOT invent titles.
- Set the WORLD STATE, not a plot summary. Describe what the world looks like NOW given the premise changes.
- If WORLD DNA constraints are present, incorporate all of them.
- Do NOT add characters, events, or details not stated or implied by the user's premise.${additionalInstruction ? `\n\nADDITIONAL USER INSTRUCTION:\n${additionalInstruction}` : ""}

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
