import type { CharacterDraft } from "@worldforge/shared";
import { createLogger } from "../lib/index.js";
import { assessPowerStats } from "./ingestion/power-assessor.js";
import type {
  IngestionClassification,
  IngestionContext,
  IngestionSources,
} from "./ingestion/types.js";

const log = createLogger("enrich-npcs-batch");

export type EnrichNpcTier = "key" | "supporting";

export interface EnrichNpcsBatchItem {
  draft: CharacterDraft;
  tier: EnrichNpcTier;
}

export interface EnrichNpcsBatchOptions {
  items: EnrichNpcsBatchItem[];
  buildClassification: (item: EnrichNpcsBatchItem) => IngestionClassification;
  ctx: IngestionContext;
  buildSources?: (item: EnrichNpcsBatchItem) => IngestionSources;
  researchDigest?: string | null;
  concurrency?: number;
}

const DEFAULT_CONCURRENCY = 4;

const EMPTY_SOURCES: IngestionSources = {
  mode: "parse",
  role: "key",
  freeText: null,
  archetype: null,
  card: null,
  overrideText: null,
  displayName: null,
};

export async function enrichNpcsBatch(
  opts: EnrichNpcsBatchOptions,
): Promise<CharacterDraft[]> {
  const { items, buildClassification, buildSources, ctx } = opts;
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);

  if (items.length === 0) {
    return [];
  }

  log.info("enrichNpcsBatch start", { count: items.length, concurrency });

  const results: CharacterDraft[] = [];

  for (let start = 0; start < items.length; start += concurrency) {
    const chunk = items.slice(start, start + concurrency);
    const chunkResults = await Promise.all(
      chunk.map((item) =>
        assessPowerStats({
          draft: item.draft,
          sources: buildSources ? buildSources(item) : EMPTY_SOURCES,
          classification: buildClassification(item),
          researchDigest: opts.researchDigest ?? null,
          ctx,
        }),
      ),
    );

    results.push(...chunkResults);
  }

  log.info("enrichNpcsBatch complete", { count: items.length });

  return results;
}
