import { createHash } from "node:crypto";

/**
 * Phase 58-03 — SSE event hashing / aggregation helpers.
 *
 * Purpose:
 *   The original `sse.emit` instrumentation attached a full `dataPreview`
 *   copy of every SSE payload to the log record. On long storyteller
 *   streams (hundreds of text-delta events) this floods the JSONL turn
 *   file with duplicate prose. Codex review flagged this as a hot-path
 *   spam risk.
 *
 * Solution:
 *   - Non-delta events emit a single lightweight record containing only
 *     `{ type, byteLength, sha256Prefix }`. The 16-char hex prefix lets a
 *     debugger correlate a log entry with the actual SSE bytes captured
 *     on the wire without duplicating the full payload in the log.
 *   - Delta events (text-delta, delta, reasoning-delta) are aggregated
 *     per (turnId, type) pair. At turn end the caller pulls one summary
 *     record per type via `finalizeAggregators(turnId)`, producing a
 *     single `sse.stream.aggregate` event with totals and the hash of
 *     the concatenated deltas.
 *
 * Map keying:
 *   `${turnId}:${type}` — keeps per-turn isolation, supports concurrent
 *   turns in different campaigns without cross-contamination.
 */

/** Hex prefix of sha256(data). Defaults to 16 chars. */
export function sha256Prefix(data: string | Buffer, prefixLen = 16): string {
  return createHash("sha256").update(data).digest("hex").slice(0, prefixLen);
}

const DELTA_TYPES = new Set(["text-delta", "delta", "reasoning-delta"]);

/** Classify an SSE event `type` as a delta (stream) chunk. */
export function isDeltaType(type: string): boolean {
  return DELTA_TYPES.has(type);
}

/**
 * Accumulator for a stream of delta events belonging to a single
 * (turnId, type) pair. Records chunk counts, total bytes, and a running
 * SHA-256 hash of the concatenated chunks.
 */
export class StreamAggregator {
  private deltaCount = 0;
  private totalBytes = 0;
  private hasher = createHash("sha256");

  record(chunk: string | Buffer): void {
    this.deltaCount += 1;
    const buf = typeof chunk === "string" ? Buffer.from(chunk, "utf8") : chunk;
    this.totalBytes += buf.byteLength;
    this.hasher.update(buf);
  }

  finalize(): {
    deltaCount: number;
    totalBytes: number;
    sha256OfConcatenated: string;
  } {
    return {
      deltaCount: this.deltaCount,
      totalBytes: this.totalBytes,
      sha256OfConcatenated: this.hasher.digest("hex"),
    };
  }
}

// Map keyed by `${turnId}:${type}`. Cleared entries per turnId are
// removed inside `finalizeAggregators(turnId)`. Intentionally module-
// scoped — one process-wide table is safe because every entry is
// keyed by the turnId UUID.
const streamAggs = new Map<string, StreamAggregator>();

/** Look up (or create) the aggregator for (turnId, type). */
export function getOrCreateAggregator(
  turnId: string,
  type: string,
): StreamAggregator {
  const key = `${turnId}:${type}`;
  let agg = streamAggs.get(key);
  if (!agg) {
    agg = new StreamAggregator();
    streamAggs.set(key, agg);
  }
  return agg;
}

/**
 * Finalize and remove every aggregator belonging to `turnId`.
 *
 * Returns one summary per `type` seen during the turn. Callers are
 * expected to invoke this inside the turn's `finally` block and emit
 * one `sse.stream.aggregate` log event per returned entry.
 */
export function finalizeAggregators(
  turnId: string,
): Array<{
  type: string;
  deltaCount: number;
  totalBytes: number;
  sha256OfConcatenated: string;
}> {
  const out: Array<{
    type: string;
    deltaCount: number;
    totalBytes: number;
    sha256OfConcatenated: string;
  }> = [];
  const prefix = `${turnId}:`;
  for (const [key, agg] of streamAggs.entries()) {
    if (!key.startsWith(prefix)) continue;
    const type = key.slice(prefix.length);
    out.push({ type, ...agg.finalize() });
    streamAggs.delete(key);
  }
  return out;
}

/** Test-only: clear all in-memory aggregator state. */
export function __resetStreamAggregatorsForTest(): void {
  streamAggs.clear();
}
