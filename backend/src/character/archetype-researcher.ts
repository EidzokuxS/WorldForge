import { generateText, stepCountIs, type ToolSet } from "ai";
import { createModel } from "../ai/index.js";
import type { CharacterDraft, CharacterGroundingProfile } from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { ResearchConfig } from "@worldforge/shared";
import { createLogger, withMcpClient } from "../lib/index.js";
import { synthesizeGroundedCharacterProfile } from "./grounded-character-profile.js";

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
          prompt: `Research the character archetype "${opts.archetype}" to support a shared CharacterDraft pipeline. Summarize the archetype in sections that feed canonical drafting: profile, motivations, capabilities, background hooks, social context cues, and signature traits. Keep the summary concrete enough to inspire an original RPG character without copying canon wholesale.`,
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

export function synthesizeArchetypeGrounding(opts: {
  archetype: string;
  draft: CharacterDraft;
  researchContext: string | null;
}): CharacterGroundingProfile | undefined {
  if (!opts.researchContext?.trim()) {
    return undefined;
  }

  return synthesizeGroundedCharacterProfile({
    draft: opts.draft,
    summaryHint: `${opts.archetype}: ${firstNonEmpty([
      opts.researchContext,
      opts.draft.profile.backgroundSummary,
      opts.draft.profile.personaSummary,
    ])}`,
    evidenceText: opts.researchContext,
    evidenceKind: "research",
    evidenceLabel: "Archetype research",
    uncertaintyNotes: [
      "Archetype research grounding is limited to the retrieved summary plus stored character evidence.",
    ],
  });
}

function firstNonEmpty(values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (value?.trim()) {
      return value.trim();
    }
  }

  return "Grounded character profile";
}
