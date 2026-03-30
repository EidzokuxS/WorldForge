import { safeGenerateObject as generateObject } from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { createModel } from "../../ai/index.js";
import {
  buildIpContextBlock,
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildSeedConstraints,
  buildStopSlopRules,
} from "./prompt-utils.js";
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
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = buildKnownIpGenerationContract(
    ipContext,
    premiseDivergence,
    "refined premise",
  );

  const prompt = `You are a world-state summarizer for a text RPG engine.

PLAYER CONCEPT:
Name: ${req.name}
Premise: ${req.premise}
${seedConstraints}${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
YOUR TASK: Write exactly 2-3 sentences describing the current state of this world.

RULES:
1. Describe the world AS IT EXISTS RIGHT NOW — not a plot synopsis, not a story hook. What does a bird's-eye view of this world show today?
2. Preserve every character relationship the user stated VERBATIM. If the user wrote "A trained by B, C by D" — output those exact pairings unchanged. Do not swap, merge, or reinterpret them.
3. For known IPs: summarize the present world state by combining FRANCHISE REFERENCE + PREMISE DIVERGENCE. Do not fall back to a blind canon synopsis or reintroduce changed facts.
4. If WORLD DNA constraints are listed above, weave ALL of them into the premise. None may be omitted.
5. Preserve unchanged canon explicitly when it matters. Only alter facts, roles, allegiances, or relationships that the divergence block says have changed.
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
