import { generateText, stepCountIs, type ToolSet } from "ai";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { ResearchConfig } from "@worldforge/shared";
import { createLogger, withSearchMcp } from "../lib/index.js";

const log = createLogger("archetype-researcher");

export async function researchArchetype(opts: {
  archetype: string;
  role: ResolvedRole;
  research: ResearchConfig;
}): Promise<string | null> {
  if (!opts.research.enabled) return null;

  const maxSteps = opts.research.maxSearchSteps ?? 3;

  try {
    return await withSearchMcp(
      opts.research.searchProvider,
      async (tools: ToolSet) => {
        const result = await generateText({
          model: createModel(opts.role.provider),
          tools,
          stopWhen: stepCountIs(maxSteps),
          prompt: `Research the character archetype "${opts.archetype}" to support a shared CharacterDraft pipeline. Summarize the archetype in sections that feed canonical drafting: profile, motivations, capabilities, background hooks, social context cues, signature traits, personality, voice samples (direct quotes if canon, paraphrased otherwise), decision style, worldview, notable contradictions, and mythology phrase. Keep the summary concrete enough to inspire an original RPG character without copying canon wholesale.`,
          temperature: opts.role.temperature,
        });
        if (result.text?.trim()) return result.text;
        return null;
      },
    );
  } catch (error) {
    log.error("Archetype research failed entirely", error);
    return null;
  }
}

// synthesizeArchetypePowerStats removed in Phase 60-04: PowerStats assessment
// is now performed by the ingestion pipeline's Stage 4 dispatcher
// (backend/src/character/ingestion/power-assessor.ts), which routes through
// either enrichKnownIpWorldgenNpcDraft (canon) or assessOriginalCharacterPowerStats
// (original/imported). The old fail-closed `undefined` return was a placeholder
// that never belonged in the pipeline-era runtime.
