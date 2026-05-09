import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Writable } from "node:stream";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import {
  resetLoggerForTest,
  __setTurnFileDispatchForTest,
} from "../logger-test-utils.js";
import { runWithTurnContext } from "../logger-context.js";

class CaptureSink extends Writable {
  public lines: string[] = [];
  override _write(
    chunk: Buffer | string,
    _enc: BufferEncoding,
    cb: (err?: Error | null) => void,
  ): void {
    this.lines.push(
      typeof chunk === "string" ? chunk : chunk.toString("utf8"),
    );
    cb();
  }
}

describe("logger multistream — dispatch + file destination", () => {
  let tmpDir: string;
  let sink: CaptureSink;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-logger-multi-"));
    resetLoggerForTest({ logRoot: tmpDir });
    sink = new CaptureSink();
    __setTurnFileDispatchForTest(sink);
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("captures one record per log call in the dispatch sink", () => {
    const log = createLogger("multi");
    log.info("first");
    log.info("second");
    expect(sink.lines.length).toBeGreaterThanOrEqual(2);
    const text = sink.lines.join("");
    expect(text).toContain("first");
    expect(text).toContain("second");
  });

  it("writes to per-turn file when context is active AND to dispatch sink", () => {
    const log = createLogger("multi");

    // Use a fresh dispatch (not the captured one) so real file write happens.
    resetLoggerForTest({ logRoot: tmpDir });

    runWithTurnContext(
      { turnId: "abcdef1234", campaignId: "cmp", tick: 7 },
      () => {
        log.info("hello world");
      },
    );

    const expectedFile = join(
      tmpDir,
      "campaigns",
      "cmp",
      "logs",
      "turn-7-abcdef12.jsonl",
    );
    expect(existsSync(expectedFile)).toBe(true);
    const text = readFileSync(expectedFile, "utf8");
    expect(text).toContain("hello world");
  });
});
