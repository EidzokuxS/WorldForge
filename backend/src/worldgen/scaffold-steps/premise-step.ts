import {
  isSafeGenerateObjectError,
  safeGenerateObject as generateObject,
} from "../../ai/generate-object-safe.js";
import { z } from "zod";
import { generateText } from "ai";
import { createModel } from "../../ai/index.js";
import {
  buildKnownIpGenerationContract,
  buildPremiseDivergenceBlock,
  buildSeedConstraints,
  buildStopSlopRules,
  buildWorldgenResearchContextBlock,
} from "./prompt-utils.js";
import { buildPremiseRefinementPromptContract } from "../prompt-contracts.js";
import type { IpResearchContext } from "../ip-researcher.js";
import type { GenerateScaffoldRequest } from "../types.js";

const refinedPremiseSchema = z.object({
  refinedPremise: z.string().describe("2-3 sentence refined world premise"),
});

function normalizeRefinedPremiseText(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error("Refined premise fallback returned empty text.");
  }

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { refinedPremise?: unknown };
      if (typeof parsed.refinedPremise === "string" && parsed.refinedPremise.trim()) {
        return parsed.refinedPremise.trim();
      }
    } catch {
      // Fall through to plain text handling.
    }
  }

  return trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .replace(/^"(.*)"$/s, "$1")
    .trim();
}

export async function generateRefinedPremiseStep(
  req: GenerateScaffoldRequest,
  ipContext: IpResearchContext | null,
  additionalInstruction?: string,
): Promise<string> {
  const seedConstraints = buildSeedConstraints(req.seeds);
  const researchArtifact = req.researchArtifact ?? null;
  const ipBlock = buildWorldgenResearchContextBlock({
    researchArtifact,
    ipContext,
    target: "refined premise",
  });
  const premiseDivergence = req.premiseDivergence ?? null;
  const divergenceBlock = buildPremiseDivergenceBlock(premiseDivergence);
  const knownIpContract = researchArtifact
    ? ""
    : buildKnownIpGenerationContract(
        ipContext,
        premiseDivergence,
        "refined premise",
      );
  const researchRule = researchArtifact
    ? "3. If research context is present, summarize the present world state by following its source usage rules. Do not collapse sources into one franchise baseline."
    : "3. For known IPs: summarize the present world state by combining LEGACY IP REFERENCE + PREMISE DIVERGENCE. Do not fall back to a blind source synopsis or reintroduce changed facts.";
  const outputContract = buildPremiseRefinementPromptContract();

  const prompt = `You are a world-state summarizer for a text RPG engine.

${outputContract}

PLAYER CONCEPT:
Name: ${req.name}
Premise: ${req.premise}
${seedConstraints}${ipBlock}
${knownIpContract ? `${knownIpContract}\n` : ""}${divergenceBlock ? `${divergenceBlock}\n` : ""}
YOUR TASK: Write exactly 2-3 sentences describing the current state of this world.

RULES:
1. Describe the world AS IT EXISTS RIGHT NOW — not a plot synopsis, not a story hook. What does a bird's-eye view of this world show today?
2. Preserve every character relationship the user stated VERBATIM. If the user wrote "A trained by B, C by D" — output those exact pairings unchanged. Do not swap, merge, or reinterpret them.
${researchRule}
4. If WORLD DNA constraints are listed above, weave ALL of them into the premise. None may be omitted.
5. Preserve unchanged canon explicitly when it matters. Only alter facts, roles, allegiances, or relationships that the divergence block says have changed.
6. Do not write hooks like "but little do they know..." or "the stage is set for...". State facts about the world's current condition.${additionalInstruction ? `\n\nADDITIONAL USER INSTRUCTION:\n${additionalInstruction}` : ""}

${buildStopSlopRules()}`;

  const model = createModel(req.role.provider);

  try {
    const result = await generateObject({
      model,
      schema: refinedPremiseSchema,
      prompt,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
    });

    return result.object.refinedPremise;
  } catch (error) {
    if (!isSafeGenerateObjectError(error)) {
      throw error;
    }

    const { text } = await generateText({
      model,
      temperature: req.role.temperature,
      maxOutputTokens: req.role.maxTokens,
      system: [
        "You are a world-state summarizer for a text RPG engine.",
        "Respond with plain text only.",
        "Write exactly 2-3 sentences.",
        "Do not use JSON, markdown, bullet points, labels, or quotes.",
      ].join(" "),
      prompt,
    });

    return normalizeRefinedPremiseText(text);
  }
}
