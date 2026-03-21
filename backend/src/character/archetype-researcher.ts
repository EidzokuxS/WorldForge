import { generateText, stepCountIs, type ToolSet } from "ai";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { ResearchConfig } from "@worldforge/shared";
import { createLogger, withMcpClient } from "../lib/index.js";

const log = createLogger("archetype-researcher");

export async function researchArchetype(opts: {
  archetype: string;
  role: ResolvedRole;
  research: ResearchConfig;
}): Promise<string | null> {
  if (!opts.research.enabled) return null;

  const maxSteps = opts.research.maxSearchSteps ?? 3;

  try {
    return await withMcpClient(
      async (tools: ToolSet) => {
        const result = await generateText({
          model: createModel(opts.role.provider),
          tools,
          stopWhen: stepCountIs(maxSteps),
          prompt: `Research the character archetype "${opts.archetype}". Find key personality traits, abilities, backstory elements, motivations, and signature characteristics. Summarize in 3-5 paragraphs suitable for inspiring an original RPG character.`,
          temperature: opts.role.temperature,
        });
        if (result.text?.trim()) return result.text;
        return null;
      },
      async () => {
        const result = await generateText({
          model: createModel(opts.role.provider),
          prompt: `Describe the character archetype "${opts.archetype}" — key personality traits, abilities, backstory elements, motivations, and signature characteristics. 3-5 paragraphs.`,
          temperature: opts.role.temperature,
          maxOutputTokens: opts.role.maxTokens,
        });
        return result.text || null;
      },
    );
  } catch {
    log.error("Archetype research failed entirely");
    return null;
  }
}
