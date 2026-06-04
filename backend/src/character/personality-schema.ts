import type { CharacterPersonality } from "@worldforge/shared";
import { z } from "zod";

/**
 * Flat personality field fragment for LLM Zod schemas.
 *
 * Phase 64: single source of truth shared by npc-generator.ts and
 * worldgen/scaffold-steps/npcs-step.ts. Keep the field list identical across
 * all call-sites by importing this helper instead of duplicating it inline.
 */
export const personalityFieldSchema = z.object({
  personalitySummary: z.string().max(400).default(""),
  personalityVoice: z.string().max(600).default(""),
  personalityDecisionStyle: z.string().max(400).default(""),
  personalityWorldview: z.string().max(400).default(""),
  personalityContradictions: z.array(z.string().max(300)).max(3).default([]),
  personalityMythology: z.string().max(400).default(""),
  personalitySampleLines: z.array(z.string().max(300)).min(0).max(3).default([]),
});

export type FlatPersonalityFields = z.infer<typeof personalityFieldSchema>;

/**
 * Map the flat personality fields into the nested CharacterPersonality shape
 * expected by CharacterDraft.identity.personality.
 */
export function mapFlatPersonalityToNested(
  flat: FlatPersonalityFields,
): CharacterPersonality {
  return {
    summary: flat.personalitySummary,
    voice: flat.personalityVoice,
    decisionStyle: flat.personalityDecisionStyle,
    worldview: flat.personalityWorldview,
    internalContradictions: flat.personalityContradictions,
    personalMythology: flat.personalityMythology,
    sampleLines: flat.personalitySampleLines,
  };
}
