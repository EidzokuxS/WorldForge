import { rootPino, shouldLogRole } from "./logger-setup.js";
import { serializePayload } from "./logger-serializers.js";
import { getTurnContext } from "./logger-context.js";

/**
 * Phase 58 — drop-in replacement for the 62-line text-file logger.
 * Wrapping contract: every user field lands under `payload.*` so
 * pino.redact's `payload.*` wildcard paths (up to depth 6) catch
 * secrets regardless of nesting level.
 *
 * Backward-compatible: `createLogger(tag).info/.warn/.error(msg, data?)`
 * still works at all 33 existing call sites. New: `.debug` and `.event`.
 */
export function createLogger(tag: string) {
  const child = rootPino.child({ tag });

  const roleGate = (level: "info" | "warn" | "error" | "debug") => {
    const ctx = getTurnContext();
    return shouldLogRole(ctx?.role, level);
  };

  return {
    info: (m: string, d?: unknown) => {
      if (!roleGate("info")) return;
      if (d !== undefined) {
        child.info({ payload: serializePayload(d) }, m);
      } else {
        child.info(m);
      }
    },
    warn: (m: string, d?: unknown) => {
      if (d !== undefined) {
        child.warn({ payload: serializePayload(d) }, m);
      } else {
        child.warn(m);
      }
    },
    error: (m: string, d?: unknown) => {
      if (d !== undefined) {
        child.error({ payload: serializePayload(d) }, m);
      } else {
        child.error(m);
      }
    },
    debug: (m: string, d?: unknown) => {
      if (!roleGate("debug")) return;
      if (d !== undefined) {
        child.debug({ payload: serializePayload(d) }, m);
      } else {
        child.debug(m);
      }
    },
    event: (eventName: string, d?: unknown) => {
      if (!roleGate("info")) return;
      child.info(
        { event: eventName, payload: serializePayload(d) },
        eventName,
      );
    },
  };
}
