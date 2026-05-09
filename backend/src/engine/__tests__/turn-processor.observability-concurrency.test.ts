/**
 * Phase 58-04 Task 2a — Concurrent-turn + same-tick retry test.
 *
 * Proves two invariants of the per-turn JSONL logging:
 *
 *   1. Two turns in DIFFERENT campaigns running concurrently via
 *      `Promise.all` produce SEPARATE JSONL files — neither contains
 *      the other's turnId, nor the other's campaignId. No logger-side
 *      cross-contamination.
 *
 *   2. Same-campaign same-tick retries produce DISTINCT filenames
 *      thanks to the turnId slice suffix in the filename pattern
 *      `turn-{tick}-{turnId8}.jsonl`. Second run does not overwrite
 *      the first.
 *
 * Same test-infrastructure invariants as turn-processor.observability.test.ts:
 *   - `resetLoggerForTest` + `GSD_LOG_ROOT` (NOT working-directory swap)
 *   - `GSD_CAMPAIGNS_ROOT` for route-level fixture resolution
 *   - `vi.doMock` + dynamic import via applyMocks
 *   - Never invokes the turn processor directly as a TS function call
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyMocks } from "./fixtures/mock-llm.js";
import { seedCampaignWithAllSeams } from "./fixtures/seed-campaign.js";
import { listTurnJsonlFiles } from "./fixtures/expected-seams.js";

async function drainBody(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

describe("Turn observability — concurrent turns + same-tick retry", () => {
  let tmpDir: string;
  let logsRoot: string;
  let campaignsRoot: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-obs-conc-"));
    logsRoot = join(tmpDir, "log-root");
    campaignsRoot = join(tmpDir, "campaigns-root");
    mkdirSync(logsRoot, { recursive: true });
    mkdirSync(campaignsRoot, { recursive: true });
    process.env.GSD_LOG_ROOT = logsRoot;
    process.env.GSD_CAMPAIGNS_ROOT = campaignsRoot;
    vi.resetModules();
    await applyMocks();
    const { resetLoggerForTest } = await import(
      "../../lib/logger-setup.js"
    );
    resetLoggerForTest({ logRoot: logsRoot });
  });

  afterEach(() => {
    delete process.env.GSD_LOG_ROOT;
    delete process.env.GSD_CAMPAIGNS_ROOT;
    vi.restoreAllMocks();
    vi.resetModules();
    try {
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // best effort — Windows may hold handles briefly
    }
  });

  it("two concurrent campaigns produce separate files with no cross-contamination", async () => {
    const a = "concurrent-A";
    const b = "concurrent-B";
    seedCampaignWithAllSeams(campaignsRoot, a, { tick: 1 });
    seedCampaignWithAllSeams(campaignsRoot, b, { tick: 2 });

    const { Hono } = await import("hono");
    const { default: chatRoutes } = await import("../../routes/chat.js");
    const app = new Hono();
    app.route("/api/chat", chatRoutes);

    const [resA, resB] = await Promise.all([
      app.request("/api/chat/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: a,
          playerAction: "look",
          intent: "look",
          method: "",
        }),
      }),
      app.request("/api/chat/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: b,
          playerAction: "look",
          intent: "look",
          method: "",
        }),
      }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);
    await Promise.all([drainBody(resA), drainBody(resB)]);
    await new Promise((r) => setTimeout(r, 50));

    const filesA = listTurnJsonlFiles(logsRoot, a);
    const filesB = listTurnJsonlFiles(logsRoot, b);
    expect(filesA.length).toBe(1);
    expect(filesB.length).toBe(1);

    const rawA = readFileSync(
      join(logsRoot, "campaigns", a, "logs", filesA[0]),
      "utf-8",
    );
    const rawB = readFileSync(
      join(logsRoot, "campaigns", b, "logs", filesB[0]),
      "utf-8",
    );

    const eventsA = rawA
      .trim()
      .split(/\r?\n/)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
    const eventsB = rawB
      .trim()
      .split(/\r?\n/)
      .map((l) => JSON.parse(l) as Record<string, unknown>);

    // Every record in A is tagged with A; every record in B is tagged with B.
    for (const e of eventsA) expect(e.campaignId).toBe(a);
    for (const e of eventsB) expect(e.campaignId).toBe(b);

    // TurnIds differ across the two flights.
    const turnIdA = eventsA[0].turnId as string;
    const turnIdB = eventsB[0].turnId as string;
    expect(turnIdA).not.toBe(turnIdB);

    // No cross-contamination — neither file contains the other's identifiers.
    expect(rawA).not.toContain(turnIdB);
    expect(rawA).not.toContain(b);
    expect(rawB).not.toContain(turnIdA);
    expect(rawB).not.toContain(a);
  });

  it("same-campaign same-tick retries produce DISTINCT filenames (turnId suffix disambiguates)", async () => {
    const c = "retry-same-tick";
    seedCampaignWithAllSeams(campaignsRoot, c, { tick: 5 });

    const { Hono } = await import("hono");
    const { default: chatRoutes } = await import("../../routes/chat.js");
    const app = new Hono();
    app.route("/api/chat", chatRoutes);

    // First action at tick 5 — route reads config.currentTick=5.
    const res1 = await app.request("/api/chat/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignId: c,
        playerAction: "look",
        intent: "look",
        method: "",
      }),
    });
    await drainBody(res1);

    // Second action at same tick (route mock never advances tick).
    const res2 = await app.request("/api/chat/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignId: c,
        playerAction: "look again",
        intent: "look",
        method: "",
      }),
    });
    await drainBody(res2);
    await new Promise((r) => setTimeout(r, 50));

    const files = readdirSync(join(logsRoot, "campaigns", c, "logs")).filter(
      (f) => /^turn-\d+-[0-9a-f]{8}\.jsonl$/.test(f),
    );
    expect(files.length).toBeGreaterThanOrEqual(2);

    // Every file at the same tick has a distinct turnId suffix.
    const suffixes = files.map(
      (f) => f.match(/^turn-\d+-([0-9a-f]{8})\.jsonl$/)![1],
    );
    expect(new Set(suffixes).size).toBe(suffixes.length);

    // And both files are at tick 5 (same tick, different turnId).
    const ticks = files.map(
      (f) => Number(f.match(/^turn-(\d+)-[0-9a-f]{8}\.jsonl$/)![1]),
    );
    expect(ticks.every((t) => t === 5)).toBe(true);
  });
});
