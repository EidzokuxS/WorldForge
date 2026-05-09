import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getTurnContext } from "./logger-context.js";
import {
  getObservabilityConfigSnapshot,
  getLogRoot,
} from "./logger-setup.js";
import { createLogger } from "./logger.js";

/**
 * Phase 58-03 — side-car prompt dumper.
 *
 * When `observability.dumpFullPrompts === true`, the full assembled
 * prompt text is written to
 *   `{logRoot}/campaigns/{id}/logs/turn-{tick}-{turnId8}-prompt-{label}.txt`
 *
 * Design constraints (per plan):
 *
 *   1. NO hot-path disk I/O on settings. Reads
 *      `getObservabilityConfigSnapshot()` from the cache populated by
 *      settings/manager when settings are read or written. The cache
 *      is synchronous; no disk settings re-read is allowed here.
 *
 *   2. NO silent degradation. If the feature is enabled and the write
 *      fails, the error is logged AND re-thrown. Callers that silently
 *      swallow the throw would violate CLAUDE.md; callers that care
 *      about the dump (debug workflows) need a loud failure.
 *
 *   3. NO import-cycle: this module is deliberately NOT re-exported on
 *      `lib/index.ts`. Consumers (currently prompt-assembler.ts) import
 *      it directly from `../lib/prompt-dump.js`.
 */

// NOT re-exported from lib/index.ts — cycle prevention (Plan 58-01).
// Direct imports only.

const log = createLogger("prompt-dump");

/**
 * Write the full prompt text for a single pass to a side-car file.
 *
 * - No-op when `observability.dumpFullPrompts` is false (normal case).
 * - No-op when called outside `runWithTurnContext` (no turn context to
 *   route the file to — not a failure, just nothing to write).
 * - On write failure: logs `prompt.dump.failed` and rethrows.
 *
 * @param label  Identifier for the pass (e.g. `hidden-tool-driving`,
 *               `final-narration`). Sanitized to `[a-zA-Z0-9_-]` for
 *               filesystem safety.
 * @param formatted  The full assembled prompt string. Written verbatim.
 */
export function writePromptSideCarIfEnabled(
  label: string,
  formatted: string,
): void {
  // Sync cache read — settings disk I/O is forbidden on this hot path.
  if (!getObservabilityConfigSnapshot().dumpFullPrompts) return;

  const ctx = getTurnContext();
  if (!ctx) return; // No context = nothing to route to. Not a failure.

  const turnIdSlice = ctx.turnId.slice(0, 8);
  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, "_");
  const dir = join(getLogRoot(), "campaigns", ctx.campaignId, "logs");
  const file = join(
    dir,
    `turn-${ctx.tick}-${turnIdSlice}-prompt-${safeLabel}.txt`,
  );

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, formatted, "utf-8");
  } catch (err) {
    // NO SILENT NO-OP — per CLAUDE.md. If the feature is enabled and
    // the write fails, the operator needs to know (permissions, full
    // disk, path too long, etc).
    log.error("prompt.dump.failed", {
      event: "prompt.dump.failed",
      path: file,
      error: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
