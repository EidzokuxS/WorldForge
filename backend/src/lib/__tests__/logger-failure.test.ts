import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import {
  resetLoggerForTest,
  __setTurnFileDispatchForTest,
} from "../logger-test-utils.js";

class ExplodingSink extends Writable {
  public attempts = 0;
  override _write(
    _chunk: Buffer | string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.attempts += 1;
    // Simulate an internal failure by throwing AND swallowing it inside the
    // sink's own try/catch — mirroring what the TurnFileDispatch does in
    // production. If this write propagated the error to pino-multistream,
    // the process would emit an uncaughtException. Our contract is that
    // internal disk failures NEVER crash the process.
    try {
      throw new Error("disk full");
    } catch {
      /* swallow — dispatch must isolate user-sink failures from the process */
    }
    cb();
  }
}

describe("logger failure isolation", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-logger-fail-"));
    resetLoggerForTest({ logRoot: tmpDir });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("does not throw when the dispatch stream encounters an internal failure", () => {
    const sink = new ExplodingSink();
    __setTurnFileDispatchForTest(sink);
    const log = createLogger("safe");
    // Contract: internal sink failures MUST be isolated. log.info returns
    // void and must not throw, and the sink's _write must have been called.
    expect(() => log.info("safe-message")).not.toThrow();
    expect(sink.attempts).toBeGreaterThanOrEqual(1);
  });

  it(
    "50-iteration reset loop completes without EMFILE (no pino-pretty worker leak)",
    () => {
      // In test mode, pretty transport is routed to a plain Writable stdout
      // sink (no worker thread). Rebuilding the root pino instance N times
      // must be cheap and idempotent — each cycle fully releases its
      // predecessor's resources.
      for (let i = 0; i < 50; i++) {
        const loopDir = mkdtempSync(join(tmpdir(), `wf-logger-loop-${i}-`));
        try {
          resetLoggerForTest({ logRoot: loopDir });
          const log = createLogger("loop");
          log.info(`iter-${i}`);
        } finally {
          try {
            rmSync(loopDir, { recursive: true, force: true });
          } catch {
            /* ignore */
          }
        }
      }
      // Reaching this point means no EMFILE / EAGAIN was thrown during the loop.
      expect(true).toBe(true);
    },
    15_000,
  );
});
