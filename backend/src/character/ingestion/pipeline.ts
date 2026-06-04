import { extractIngestionSources } from "./extractor.js";
import { classifyCanonicalStatus } from "./classifier.js";
import { synthesizeDraftFromSources } from "./synthesizer.js";
import { assessPowerStats } from "./power-assessor.js";
import { IngestionPipelineError } from "./errors.js";
import { researchArchetype } from "../archetype-researcher.js";
import { createLogger } from "../../lib/index.js";
import type { CharacterDraft } from "@worldforge/shared";
import type {
  IngestionContext,
  IngestionInput,
  IngestionSources,
  IngestionClassification,
} from "./types.js";

const log = createLogger("ingestion-pipeline");

/**
 * Synthesis-time canon research — runs ONLY when mode === "research" and
 * research is enabled. Feeds a free-text archetype digest into Stage 3.
 *
 * Web search for canon characters happens separately inside Stage 4 via
 * enrichKnownIpWorldgenNpcDraft.
 *
 * NOTE: researchArchetype (archetype-researcher.ts) catches its own errors
 * and returns null — we call it directly WITHOUT withPipelineRetry because
 * retry would never trigger (the function never throws).
 */
async function runCanonResearch(
  _classification: IngestionClassification,
  sources: IngestionSources,
  ctx: IngestionContext,
): Promise<string | null> {
  if (sources.mode !== "research" || !sources.archetype) return null;
  if (!ctx.settings.research?.enabled) return null;
  return await researchArchetype({
    archetype: sources.archetype,
    role: ctx.gen,
    research: ctx.settings.research,
  });
}

/**
 * Public entry point for the character ingestion pipeline.
 *
 * Orchestrates 4 stages in order:
 *   Stage 1: extractIngestionSources (pure)
 *   Stage 2: classifyCanonicalStatus (pure) + optional runCanonResearch
 *   Stage 3: synthesizeDraftFromSources (LLM, priority-merge)
 *   Stage 4: assessPowerStats (LLM, canon-vs-original dispatcher)
 *
 * Throws IngestionPipelineError on unrecoverable failure — never returns
 * a draft with undefined powerStats.
 */
export async function ingestCharacterDraft(
  input: IngestionInput,
  ctx: IngestionContext,
): Promise<CharacterDraft> {
  log.info("ingestCharacterDraft: starting", {
    mode: input.mode,
    role: input.role,
    campaignId: input.campaignId,
  });

  // Stage 1: extract
  const sources = extractIngestionSources(input);

  // Stage 2: classify (+ optional synthesis-time research)
  const classification = classifyCanonicalStatus({
    sources,
    ipContext: ctx.campaign.ipContext,
    premiseDivergence: ctx.campaign.premiseDivergence,
  });
  log.info("ingestCharacterDraft: classified", {
    canonicalStatus: classification.canonicalStatus,
    franchise: classification.franchise,
  });

  const researchDigest = await runCanonResearch(classification, sources, ctx);

  // Stage 3: synthesize
  const draft = await synthesizeDraftFromSources({
    sources,
    classification,
    researchDigest,
    ctx,
  });

  // Stage 4: assess PowerStats
  const enriched = await assessPowerStats({
    draft,
    sources,
    classification,
    researchDigest,
    ctx,
  });

  if (!enriched.powerStats) {
    throw new IngestionPipelineError({
      stage: "power_assess",
      attempts: 0,
      cause: null,
      message: `Pipeline completed but powerStats is undefined for ${enriched.identity.displayName}. This indicates a bug in Stage 4.`,
    });
  }

  log.info("ingestCharacterDraft: complete", {
    displayName: enriched.identity.displayName,
  });
  return enriched;
}
