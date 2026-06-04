import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Phase 58-03 — prompt dump side-car tests.
//
// Covers: (a) disabled no-op, (b) enabled write, (c) no turn context
// no-op, (d) write-failure fail-loud (log.error + throw), (e) no
// loadSettings calls on the hot path.
// ---------------------------------------------------------------------------

describe("writePromptSideCarIfEnabled", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "wf-prompt-dump-"));
    process.env.GSD_LOG_ROOT = tmpRoot;
    // Clear any residual module state from previous tests so dynamic
    // imports below rebuild prompt-dump (and its deps) against a fresh
    // logger-setup singleton per-test.
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GSD_LOG_ROOT;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* best effort — Windows may hold handles briefly */
    }
  });

  const ROLES = {
    judge: true,
    storyteller: true,
    oracle: true,
    npcAgent: true,
    reflection: true,
    embedder: true,
  } as const;

  it("no-ops silently when observability.dumpFullPrompts is false (default)", async () => {
    const { configureObservability, resetLoggerForTest } = await import(
      "../logger-setup.js"
    );
    const { runWithTurnContext } = await import("../logger-context.js");
    resetLoggerForTest({ logRoot: tmpRoot });
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: ROLES,
    });

    const { writePromptSideCarIfEnabled } = await import("../prompt-dump.js");
    await runWithTurnContext(
      { turnId: "abcdef12-3456-7890-abcd-ef1234567890", campaignId: "cmp1", tick: 5 },
      () => {
        expect(() =>
          writePromptSideCarIfEnabled("hidden-tool-driving", "PROMPT"),
        ).not.toThrow();
      },
    );

    expect(existsSync(join(tmpRoot, "campaigns", "cmp1"))).toBe(false);
  });

  it("writes the prompt to a turnId/tick/label-suffixed file when enabled", async () => {
    const { configureObservability, resetLoggerForTest } = await import(
      "../logger-setup.js"
    );
    const { runWithTurnContext } = await import("../logger-context.js");
    resetLoggerForTest({ logRoot: tmpRoot });
    configureObservability({
      enabled: true,
      dumpFullPrompts: true,
      roles: ROLES,
    });

    const { writePromptSideCarIfEnabled } = await import("../prompt-dump.js");
    const promptText = "FULL PROMPT TEXT — the quick brown fox";

    await runWithTurnContext(
      { turnId: "abcdef12345678901234567890123456", campaignId: "cmp2", tick: 3 },
      () => {
        writePromptSideCarIfEnabled("hidden-tool-driving", promptText);
      },
    );

    const logsDir = join(tmpRoot, "campaigns", "cmp2", "logs");
    expect(existsSync(logsDir)).toBe(true);

    const files = readdirSync(logsDir);
    const dumpFile = files.find((f) =>
      /^turn-3-abcdef12-prompt-hidden-tool-driving\.txt$/.test(f),
    );
    expect(dumpFile).toBeDefined();
    const content = readFileSync(join(logsDir, dumpFile!), "utf-8");
    expect(content).toBe(promptText);
  });

  it("no-ops when called outside runWithTurnContext (no turn context to route to)", async () => {
    const { configureObservability, resetLoggerForTest } = await import(
      "../logger-setup.js"
    );
    resetLoggerForTest({ logRoot: tmpRoot });
    configureObservability({
      enabled: true,
      dumpFullPrompts: true,
      roles: ROLES,
    });

    const { writePromptSideCarIfEnabled } = await import("../prompt-dump.js");
    expect(() =>
      writePromptSideCarIfEnabled("hidden-tool-driving", "ORPHAN PROMPT"),
    ).not.toThrow();

    expect(existsSync(join(tmpRoot, "campaigns"))).toBe(false);
  });

  it("FAILS LOUD when enabled and writeFileSync throws (log.error + throw)", async () => {
    // Mock node:fs so writeFileSync throws. MUST be registered BEFORE
    // the dynamic import of prompt-dump (vi.resetModules ran in beforeEach).
    vi.doMock("node:fs", async (importOriginal) => {
      const actual = (await importOriginal()) as Record<string, unknown>;
      return {
        ...actual,
        default: { ...(actual.default as Record<string, unknown>) },
        writeFileSync: vi.fn(() => {
          throw new Error("disk full");
        }),
        mkdirSync: vi.fn(() => undefined),
      };
    });

    const { configureObservability, resetLoggerForTest } = await import(
      "../logger-setup.js"
    );
    const { runWithTurnContext } = await import("../logger-context.js");
    resetLoggerForTest({ logRoot: tmpRoot });
    configureObservability({
      enabled: true,
      dumpFullPrompts: true,
      roles: ROLES,
    });

    const { writePromptSideCarIfEnabled } = await import("../prompt-dump.js");

    let threw: Error | undefined;
    try {
      runWithTurnContext(
        {
          turnId: "fffff111-2222-3333-4444-555555555555",
          campaignId: "cmp-fail",
          tick: 7,
        },
        () => {
          writePromptSideCarIfEnabled("final-narration", "PROMPT");
        },
      );
    } catch (err) {
      threw = err as Error;
    }

    expect(threw).toBeDefined();
    expect(threw!.message).toMatch(/disk full/);

    vi.doUnmock("node:fs");
  });

  it("never calls loadSettings on the hot path (snapshot cache only)", async () => {
    const { configureObservability, resetLoggerForTest } = await import(
      "../logger-setup.js"
    );
    const { runWithTurnContext } = await import("../logger-context.js");
    resetLoggerForTest({ logRoot: tmpRoot });
    configureObservability({
      enabled: true,
      dumpFullPrompts: true,
      roles: ROLES,
    });

    // Spy on the settings manager to prove prompt-dump doesn't
    // re-read settings from disk when emitting dumps. If this spy
    // ever fires, prompt-dump has regressed to hot-path disk I/O.
    const mgr = await import("../../settings/manager.js");
    const spy = vi.spyOn(mgr, "loadSettings");

    const { writePromptSideCarIfEnabled } = await import("../prompt-dump.js");
    const ctx = {
      turnId: "ffffffff-0000-0000-0000-000000000000",
      campaignId: "cmp-hot",
      tick: 0,
    };

    for (let i = 0; i < 100; i += 1) {
      runWithTurnContext(ctx, () => {
        writePromptSideCarIfEnabled("hidden-tool-driving", `PROMPT ${i}`);
      });
    }

    expect(spy).not.toHaveBeenCalled();
  });
});
