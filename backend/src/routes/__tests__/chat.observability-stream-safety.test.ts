/**
 * Phase 58-04 Task 2b — SSE stream-safety byte-identical test.
 *
 * Proves that the Storyteller SSE transcript is BYTE-IDENTICAL (after
 * normalizing volatile fields) between:
 *   - baseline: `configureObservability({enabled: false, ...})`
 *   - treatment: `configureObservability({enabled: true, ...})`
 *
 * Assertion:  `Buffer.compare(normalize(baseline), normalize(treatment)) === 0`
 *
 * Volatile fields normalized away before compare:
 *   - timestamps (numeric)
 *   - turnId UUIDs (V4 pattern in JSON, plus the `turnId` JSON field)
 *
 * Test-infrastructure invariants:
 *   - `resetLoggerForTest` + `GSD_LOG_ROOT`
 *   - `GSD_CAMPAIGNS_ROOT` for route-level fixture resolution
 *   - `vi.doMock` + dynamic import via applyMocks (NOT top-level vi.mock)
 *   - `configureObservability` imported DIRECTLY from ../../lib/logger-setup.js
 *     (not through a barrel re-export, per Plan 58-01 cycle prevention)
 *   - `Buffer.compare` used for the final byte equality check
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Buffer } from "node:buffer";
import { applyMocks } from "../../engine/__tests__/fixtures/mock-llm.js";
import { seedCampaignWithAllSeams } from "../../engine/__tests__/fixtures/seed-campaign.js";

/**
 * Normalize volatile fields in the SSE transcript so byte compare is stable.
 * Replaces timestamps, UUIDs (including turnId) with fixed sentinel values.
 */
function normalizeSse(raw: Buffer): Buffer {
  let s = raw.toString("utf8");
  // Numeric timestamps.
  s = s.replace(/"timestamp"\s*:\s*\d+/g, '"timestamp":0');
  s = s.replace(/"createdAt"\s*:\s*\d+/g, '"createdAt":0');
  s = s.replace(/"updatedAt"\s*:\s*\d+/g, '"updatedAt":0');
  s = s.replace(/"startedAt"\s*:\s*\d+/g, '"startedAt":0');
  // Explicit turnId JSON field.
  s = s.replace(/"turnId"\s*:\s*"[^"]+"/g, '"turnId":"UUID"');
  // Any UUID v4-ish string anywhere else in the transcript.
  s = s.replace(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
    "UUID",
  );
  return Buffer.from(s, "utf8");
}

async function captureSseBody(
  app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> },
  campaignId: string,
): Promise<Buffer> {
  const res = await app.request("/api/chat/action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      campaignId,
      playerAction: "look",
      intent: "look",
      method: "",
    }),
  });
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return Buffer.from(out);
}

describe("Storyteller SSE stream safety — byte-identical observability off vs on", () => {
  let tmpDir: string;
  let logsRoot: string;
  let campaignsRoot: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-obs-stream-"));
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

  it("produces byte-identical SSE transcript with observability enabled vs disabled (Buffer.compare === 0)", async () => {
    const campaignId = "stream-safety";
    seedCampaignWithAllSeams(campaignsRoot, campaignId, { tick: 0 });

    const { Hono } = await import("hono");
    const { default: chatRoutes } = await import("../../routes/chat.js");
    // Direct import from logger-setup.js (NOT via barrel) per Plan 58-01
    // cycle-prevention convention.
    const { configureObservability } = await import(
      "../../lib/logger-setup.js"
    );

    const app = new Hono();
    app.route("/api/chat", chatRoutes);

    // --- Run 1: observability disabled (baseline) ------------------
    configureObservability({
      enabled: false,
      dumpFullPrompts: false,
      roles: {
        judge: false,
        storyteller: false,
        oracle: false,
        npcAgent: false,
        reflection: false,
        embedder: false,
      },
    });
    const baselineRaw = await captureSseBody(app, campaignId);
    const baseline = normalizeSse(baselineRaw);

    // --- Run 2: observability enabled (treatment) ------------------
    configureObservability({
      enabled: true,
      dumpFullPrompts: false,
      roles: {
        judge: true,
        storyteller: true,
        oracle: true,
        npcAgent: true,
        reflection: true,
        embedder: true,
      },
    });
    const treatmentRaw = await captureSseBody(app, campaignId);
    const treatment = normalizeSse(treatmentRaw);

    // BYTE-IDENTICAL after normalization.
    expect(Buffer.compare(baseline, treatment)).toBe(0);
  });
});
