import { enrichKnownIpWorldgenNpcDraft } from "../known-ip-worldgen-research.js";
import { assessOriginalCharacterPowerStats } from "./assess-original.js";
import { IngestionPipelineError } from "./errors.js";
import { createLogger } from "../../lib/index.js";
import type { CharacterDraft } from "@worldforge/shared";
import type {
  IngestionClassification,
  IngestionContext,
  IngestionSources,
} from "./types.js";

const log = createLogger("ingestion-power-assessor");

function buildCardText(sources: IngestionSources): string | undefined {
  if (!sources.card) return undefined;
  const parts = [sources.card.description, sources.card.personality, sources.card.scenario]
    .map((p) => (p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.length > 0 ? parts.join("\n\n") : undefined;
}

/**
 * Stage 4 dispatcher — routes PowerStats assessment based on
 * classification.canonicalStatus:
 *
 * - known_ip_canonical / known_ip_diverged  → enrichKnownIpWorldgenNpcDraft
 *   (web search + VS Battles canon assessment + override)
 *
 * - original / imported  → assessOriginalCharacterPowerStats
 *   (LLM-only inference from draft + card text + override, no web search)
 *
 * Canon branch requires both a franchise and research.enabled. Missing
 * either throws IngestionPipelineError(stage='power_assess') — no silent
 * fallback to the original branch.
 *
 * Both branches guarantee a draft with non-undefined powerStats OR throw.
 */
export async function assessPowerStats(opts: {
  draft: CharacterDraft;
  sources: IngestionSources;
  classification: IngestionClassification;
  researchDigest: string | null;
  ctx: IngestionContext;
}): Promise<CharacterDraft> {
  const { draft, sources, classification, ctx } = opts;
  const status = classification.canonicalStatus;

  log.info("assessPowerStats dispatch", {
    displayName: draft.identity.displayName,
    canonicalStatus: status,
    franchise: classification.franchise,
    hasOverride: !!sources.overrideText,
  });

  if (status === "known_ip_canonical" || status === "known_ip_diverged") {
    if (!classification.franchise) {
      throw new IngestionPipelineError({
        stage: "power_assess",
        attempts: 0,
        cause: null,
        message: `Cannot run canon PowerStats assessment without a franchise (got ${classification.franchise}).`,
      });
    }
    if (!ctx.settings.research?.enabled) {
      throw new IngestionPipelineError({
        stage: "power_assess",
        attempts: 0,
        cause: null,
        message: `Canon PowerStats assessment requires research to be enabled for ${draft.identity.displayName}.`,
      });
    }
    return await enrichKnownIpWorldgenNpcDraft({
      draft,
      franchise: classification.franchise,
      role: ctx.gen,
      research: ctx.settings.research,
      premise: ctx.campaign.premise,
      premiseDivergence: classification.premiseDivergence,
      overrideText: sources.overrideText ?? undefined,
    });
  }

  // original / imported branch
  return await assessOriginalCharacterPowerStats({
    draft,
    cardText: buildCardText(sources),
    overrideText: sources.overrideText ?? undefined,
    role: ctx.gen,
    premise: ctx.campaign.premise,
  });
}
