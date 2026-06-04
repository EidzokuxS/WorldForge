/**
 * Phase 58-04 baseline plus Phase 70 ScenePlan seams for observability acceptance.
 *
 * These are the event names that a single turn (through all six LLM roles,
 * plus the route-level wrappers) MUST emit. Missing any one fails the
 * acceptance gate for route-level turn observability.
 *
 * Notes on overlap:
 *   - Seam 5 (`sse.emit` for `oracle_result`) and seam 17 (`sse.emit`
 *     generic) share the event NAME `sse.emit`. To prove seam 5
 *     specifically, check for an event where `payload.type === "oracle_result"`.
 *   - `prompt.assembled` fires for the final visible narration pass under
 *     a single name.
 *   - `llm.attempt` fires once per retry iteration inside safeGenerateObject.
 *   - `sse.stream.aggregate` fires once per (turnId, delta-type) at turn end.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export const EXPECTED_18_SEAMS = [
  "turn.begin",
  "movement.detect",
  "target.context",
  "oracle.call",
  "sse.emit",
  "prompt.assembled",
  "scene.frame",
  "judge.scene-plan",
  "scene.plan.validation",
  "scene.plan.execution",
  "scene.packet",
  "visible-narration.packet-guard",
  "tool.call",
  "db.write",
  "npcAgent.tick",
  "storyteller.visible.call",
  "reflection.tick",
  "faction.tick",
  "embedder.call",
  "vector.write",
  "turn.end",
  "llm.attempt",
  "sse.stream.aggregate",
] as const;

export type ExpectedSeam = (typeof EXPECTED_18_SEAMS)[number];

/**
 * Read every turn-*.jsonl file under
 *   `{tmpRoot}/campaigns/{campaignId}/logs/`
 * and return the union set of distinct event names observed.
 */
export function collectSeamsFromJsonl(
  tmpRoot: string,
  campaignId: string,
): Set<string> {
  const logsDir = join(tmpRoot, "campaigns", campaignId, "logs");
  let files: string[] = [];
  try {
    files = readdirSync(logsDir).filter((f) =>
      /^turn-\d+-[0-9a-f]{8}\.jsonl$/.test(f),
    );
  } catch {
    return new Set<string>();
  }
  const seams = new Set<string>();
  for (const f of files) {
    const raw = readFileSync(join(logsDir, f), "utf-8").trim();
    if (!raw) continue;
    for (const line of raw.split(/\r?\n/)) {
      try {
        const rec = JSON.parse(line) as { event?: string };
        if (rec.event) seams.add(rec.event);
      } catch {
        /* skip malformed */
      }
    }
  }
  return seams;
}

/**
 * Read every turn-*.jsonl file under
 *   `{tmpRoot}/campaigns/{campaignId}/logs/`
 * and return the full list of parsed records in file-sorted, line-order.
 */
export function readAllEventsFromJsonl(
  tmpRoot: string,
  campaignId: string,
): Array<Record<string, unknown>> {
  const logsDir = join(tmpRoot, "campaigns", campaignId, "logs");
  let files: string[] = [];
  try {
    files = readdirSync(logsDir)
      .filter((f) => /^turn-\d+-[0-9a-f]{8}\.jsonl$/.test(f))
      .sort();
  } catch {
    return [];
  }
  const out: Array<Record<string, unknown>> = [];
  for (const f of files) {
    const raw = readFileSync(join(logsDir, f), "utf-8").trim();
    if (!raw) continue;
    for (const line of raw.split(/\r?\n/)) {
      try {
        out.push(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* skip malformed */
      }
    }
  }
  return out;
}

/**
 * List every turn-*.jsonl filename for a campaign. Useful for
 * same-tick retry collision assertions (unique suffixes).
 */
export function listTurnJsonlFiles(
  tmpRoot: string,
  campaignId: string,
): string[] {
  const logsDir = join(tmpRoot, "campaigns", campaignId, "logs");
  try {
    return readdirSync(logsDir)
      .filter((f) => /^turn-\d+-[0-9a-f]{8}\.jsonl$/.test(f))
      .sort();
  } catch {
    return [];
  }
}
