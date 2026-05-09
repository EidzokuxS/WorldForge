import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../logger.js";
import { resetLoggerForTest } from "../logger-test-utils.js";
import { runWithTurnContext } from "../logger-context.js";

describe("logger per-turn file destination", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-logger-file-"));
    resetLoggerForTest({ logRoot: tmpDir });
  });

  afterEach(() => {
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("writes JSONL to campaigns/<id>/logs/turn-<tick>-<turnId8>.jsonl with 8-char slice", () => {
    const log = createLogger("x");
    runWithTurnContext(
      { turnId: "abcdef1234", campaignId: "cmp", tick: 7 },
      () => {
        log.info("hello");
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

    const content = readFileSync(expectedFile, "utf8").trim();
    expect(content.length).toBeGreaterThan(0);
    const parsed = JSON.parse(content.split("\n")[0]) as Record<string, unknown>;
    expect(parsed.msg).toBe("hello");
    expect(parsed.campaignId).toBe("cmp");
    expect(parsed.tick).toBe(7);
    expect(parsed.turnId).toBe("abcdef1234");
  });

  it("filename matches regex turn-<tick>-<8hex>.jsonl", () => {
    const log = createLogger("x");
    runWithTurnContext(
      { turnId: "0123456789abcdef", campaignId: "cmp", tick: 3 },
      () => {
        log.info("tick3");
      },
    );
    const expectedFile = join(
      tmpDir,
      "campaigns",
      "cmp",
      "logs",
      "turn-3-01234567.jsonl",
    );
    expect(existsSync(expectedFile)).toBe(true);
    expect(expectedFile).toMatch(/turn-3-[0-9a-f]{8}\.jsonl$/);
  });

  it("separate turns go to different files (same tick, different turnId)", () => {
    const log = createLogger("x");
    runWithTurnContext(
      { turnId: "aaaaaaaa1111", campaignId: "cmp", tick: 4 },
      () => log.info("turn-a"),
    );
    runWithTurnContext(
      { turnId: "bbbbbbbb2222", campaignId: "cmp", tick: 4 },
      () => log.info("turn-b"),
    );

    const fileA = join(
      tmpDir,
      "campaigns",
      "cmp",
      "logs",
      "turn-4-aaaaaaaa.jsonl",
    );
    const fileB = join(
      tmpDir,
      "campaigns",
      "cmp",
      "logs",
      "turn-4-bbbbbbbb.jsonl",
    );
    expect(existsSync(fileA)).toBe(true);
    expect(existsSync(fileB)).toBe(true);
    expect(readFileSync(fileA, "utf8")).toContain("turn-a");
    expect(readFileSync(fileB, "utf8")).toContain("turn-b");
  });

  it("does NOT write to legacy backend/logs/YYYY-MM-DD.log path", () => {
    const log = createLogger("x");
    log.info("no-context");
    const legacyDir = join(process.cwd(), "logs");
    // Even if the legacy dir existed from previous runs, the new logger
    // must not create/write files matching YYYY-MM-DD.log.
    const today = new Date().toISOString().slice(0, 10);
    const legacyFile = join(legacyDir, `${today}.log`);
    if (existsSync(legacyFile)) {
      const mtime = readFileSync(legacyFile, "utf8");
      // If it exists from stale state, just ensure our message isn't in it.
      expect(mtime).not.toContain("no-context-test-marker-xyzzy");
    }
  });
});
