/**
 * Phase 58-04 baseline plus Phase 70 ScenePlan observability integration test.
 *
 * Exercises the REAL Hono chat route via `app.request("/api/chat/action",
 * ...)` and asserts that one full turn emits all expected seams in
 * `EXPECTED_18_SEAMS`, correlated by a single turnId, with payload
 * shape invariants for the checker-flagged keys:
 *
 *   - `sse.emit` with `payload.type === "oracle_result"` (seam 5)
 *   - `target.context` carries `payload.targetTags` as an array
 *   - `prompt.assembled` carries `payload.assembledChars` as a number
 *
 * Test-infrastructure invariants per REVIEWS.md / plan:
 *   - `resetLoggerForTest` + `GSD_LOG_ROOT` env (NOT working-directory swap)
 *   - `GSD_CAMPAIGNS_ROOT` env (so chat route resolves the seed fixture)
 *   - LLM mocks via `vi.doMock` + dynamic import (applyMocks pattern)
 *   - `app.request(...)` (REAL route) — never invokes the turn processor
 *     directly as a TS function call.
 *
 * Secret-leak guard: the mocked settings contain a placeholder apiKey
 * `"SECRET_KEY_PLACEHOLDER"`. We assert no record in the JSONL file
 * contains that literal after redaction.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  existsSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  EXPECTED_18_SEAMS,
  collectSeamsFromJsonl,
  readAllEventsFromJsonl,
} from "./fixtures/expected-seams.js";
import { applyMocks } from "./fixtures/mock-llm.js";
import { seedCampaignWithAllSeams } from "./fixtures/seed-campaign.js";

async function drainBody(res: Response): Promise<void> {
  const reader = res.body!.getReader();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }
}

function assertCompactScenePlanPayload(payload: unknown): void {
  const data = payload as Record<string, unknown> | undefined;
  expect(data).toBeDefined();
  expect(data).not.toHaveProperty("prompt");
  expect(data).not.toHaveProperty("messages");
  expect(data).not.toHaveProperty("hiddenRationale");
  expect(data).not.toHaveProperty("forbiddenActorNames");
  expect(data).not.toHaveProperty("forbiddenFactMarkers");
  expect(data).not.toHaveProperty("situationSummary");
  expect(data).not.toHaveProperty("sceneQuestion");
  expect(JSON.stringify(data ?? {})).not.toContain("Hidden Watcher");
  expect(JSON.stringify(data ?? {})).not.toContain("hidden-actor:hidden-watcher");
}

describe("Turn observability — single turn seam coverage via REAL chat route", () => {
  let tmpDir: string;
  let logsRoot: string;
  let campaignsRoot: string;

  beforeEach(async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "wf-obs-"));
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

  it("emits all expected seams with a single turnId after one mocked turn via app.request", async () => {
    const campaignId = "test-obs-campaign";
    seedCampaignWithAllSeams(campaignsRoot, campaignId, { tick: 3 });

    // Dynamic import AFTER applyMocks so the route resolves against mocks.
    const { Hono } = await import("hono");
    const { default: chatRoutes } = await import("../../routes/chat.js");
    const app = new Hono();
    app.route("/api/chat", chatRoutes);

    const res = await app.request("/api/chat/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignId,
        playerAction: "look at the tavern",
        intent: "look",
        method: "",
      }),
    });
    expect(res.status).toBe(200);
    await drainBody(res);

    // Allow pino sync-append dispatch to finish.
    await new Promise((r) => setTimeout(r, 50));

    const logsDir = join(logsRoot, "campaigns", campaignId, "logs");
    expect(existsSync(logsDir)).toBe(true);
    const files = readdirSync(logsDir).filter((f) =>
      /^turn-\d+-[0-9a-f]{8}\.jsonl$/.test(f),
    );
    expect(files.length).toBeGreaterThanOrEqual(1);

    // --- seam coverage matrix --------------------------------------
    const actualSeams = collectSeamsFromJsonl(logsRoot, campaignId);
    const missing = EXPECTED_18_SEAMS.filter((s) => !actualSeams.has(s));
    expect(missing).toEqual([]);

    // --- correlation: single turnId + campaignId + tick -------------
    const events = readAllEventsFromJsonl(logsRoot, campaignId);
    expect(events.length).toBeGreaterThan(0);
    const turnIds = new Set(events.map((e) => e.turnId));
    expect(turnIds.size).toBe(1);
    expect(events.every((e) => e.campaignId === campaignId)).toBe(true);
    expect(events.every((e) => e.tick === 3)).toBe(true);

    // --- turn.begin first, turn.end last ----------------------------
    expect(events[0].event).toBe("turn.begin");
    expect(events[events.length - 1].event).toBe("turn.end");

    // --- Checker issue 7: sse.emit with oracle_result ---------------
    const oracleResultEmit = events.find(
      (e) =>
        e.event === "sse.emit" &&
        (e.payload as Record<string, unknown> | undefined)?.type ===
          "oracle_result",
    );
    expect(oracleResultEmit).toBeDefined();

    // --- Checker issue 9a: target.context.payload.targetTags is array -
    const targetCtx = events.filter((e) => e.event === "target.context");
    expect(targetCtx.length).toBeGreaterThan(0);
    for (const e of targetCtx) {
      const payload = e.payload as Record<string, unknown> | undefined;
      expect(Array.isArray(payload?.targetTags)).toBe(true);
    }

    // --- Phase 66: combat.envelope is always logged with bounded payload ---
    const combatEnvelopeEvents = events.filter((e) => e.event === "combat.envelope");
    expect(combatEnvelopeEvents.length).toBeGreaterThan(0);
    for (const e of combatEnvelopeEvents) {
      const payload = e.payload as Record<string, unknown> | undefined;
      expect(typeof payload?.built).toBe("boolean");
      expect(typeof payload?.hostileAction).toBe("boolean");
    }

    // --- Checker issue 9b: prompt.assembled.payload.assembledChars num -
    const promptEvents = events.filter((e) => e.event === "prompt.assembled");
    expect(promptEvents.length).toBeGreaterThan(0);
    for (const e of promptEvents) {
      const payload = e.payload as Record<string, unknown> | undefined;
      expect(typeof payload?.assembledChars).toBe("number");
    }

    // --- Phase 70: ScenePlan path bypasses player-turn world-brain ---
    const worldBrainEvents = events.filter((e) => e.event === "world-brain.scene-direction");
    expect(worldBrainEvents).toHaveLength(0);
    expect(events.filter((e) => e.event === "judge.hidden.plan")).toHaveLength(0);
    expect(events.filter((e) => e.event === "judge.hidden.execution")).toHaveLength(0);

    const sceneFrameEvents = events.filter((e) => e.event === "scene.frame");
    expect(sceneFrameEvents).toHaveLength(1);
    expect(sceneFrameEvents[0]?.payload).toEqual(
      expect.objectContaining({
        source: "player-turn",
        activeActorIds: expect.any(Array),
        targetCandidateCount: expect.any(Number),
        movementCandidateCount: expect.any(Number),
      }),
    );

    const scenePlanEvents = events.filter((e) => e.event === "judge.scene-plan");
    expect(scenePlanEvents).toHaveLength(1);
    expect(scenePlanEvents[0]?.payload).toEqual(
      expect.objectContaining({
        plannedActionCount: expect.any(Number),
        hiddenRationaleLength: expect.any(Number),
      }),
    );

    const validationEvents = events.filter((e) => e.event === "scene.plan.validation");
    expect(validationEvents).toHaveLength(1);
    expect(validationEvents[0]?.payload).toEqual(
      expect.objectContaining({
        ok: true,
        issueCount: 0,
      }),
    );

    const executionEvents = events.filter((e) => e.event === "scene.plan.execution");
    expect(executionEvents).toHaveLength(1);
    expect(executionEvents[0]?.payload).toEqual(
      expect.objectContaining({
        plannedActionCount: expect.any(Number),
        executedActionCount: expect.any(Number),
        canonicalEventCount: expect.any(Number),
      }),
    );

    const packetEvents = events.filter((e) => e.event === "scene.packet");
    expect(packetEvents).toHaveLength(1);
    expect(packetEvents[0]?.payload).toEqual(
      expect.objectContaining({
        visibleActorCount: expect.any(Number),
        forbiddenActorCount: expect.any(Number),
        forbiddenFactMarkerCount: expect.any(Number),
      }),
    );

    const packetGuardEvents = events.filter((e) => e.event === "visible-narration.packet-guard");
    expect(packetGuardEvents).toHaveLength(1);
    expect(packetGuardEvents[0]?.payload).toEqual(
      expect.objectContaining({
        attempts: expect.any(Number),
        retried: false,
        violationCount: 0,
      }),
    );

    const latencyTraceEvent = events.find((e) => e.event === "turn.latency.trace");
    expect(latencyTraceEvent).toBeDefined();
    const latencyTrace = latencyTraceEvent?.payload as
      | {
          stages?: Array<Record<string, unknown>>;
          serializedGroups?: Array<Record<string, unknown>>;
          parallelGroups?: Array<Record<string, unknown>>;
          diagnostics?: Array<Record<string, unknown>>;
          didClipModelOutput?: unknown;
        }
      | undefined;
    expect(latencyTrace?.didClipModelOutput).toBe(false);
    expect(latencyTrace?.serializedGroups?.length).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(latencyTrace?.parallelGroups)).toBe(true);
    expect(latencyTrace?.parallelGroups).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          groupId: "actor-frame-retrieval-1",
          label: "actor frame retrieval",
          jobCount: 2,
          writeScopes: [],
          serializedFallbackCount: 0,
          metadata: expect.objectContaining({
            readOnly: true,
            frameType: "ActorFrame",
          }),
        }),
        expect.objectContaining({
          groupId: "actor-prep-1",
          label: "actor decision prep",
          jobCount: 1,
          writeScopes: ["actor:npc-barkeep"],
          serializedFallbackCount: 0,
        }),
      ]),
    );
    const latencyStages = new Map(
      (latencyTrace?.stages ?? []).map((stage) => [stage.stage, stage]),
    );
    expect(latencyStages.get("scene_frame")).toEqual(
      expect.objectContaining({
        criticality: "L0",
        blocksPlayerResponse: true,
        criticalPath: true,
        sourceStageId: "scene_frame",
        durationMs: expect.any(Number),
      }),
    );
    expect(latencyStages.get("actor_reactions")).toEqual(
      expect.objectContaining({
        criticality: "L1",
        blocksPlayerResponse: true,
        criticalPath: true,
      }),
    );
    expect(latencyStages.get("pre_narrator_due_work")).toEqual(
      expect.objectContaining({
        criticality: "L2",
        blocksPlayerResponse: true,
        criticalPath: true,
      }),
    );
    expect(latencyStages.get("final_prompt")).toEqual(
      expect.objectContaining({
        criticality: "L0",
        blocksPlayerResponse: true,
        criticalPath: true,
        durationMs: expect.any(Number),
      }),
    );
    expect(latencyStages.get("final_narration")).toEqual(
      expect.objectContaining({
        criticality: "L0",
        blocksPlayerResponse: true,
        criticalPath: true,
        durationMs: expect.any(Number),
      }),
    );
    expect(
      latencyTrace?.diagnostics?.some((diagnostic) => diagnostic.code === "output_clip_attempt"),
    ).toBe(false);
    assertCompactScenePlanPayload(latencyTrace);

    for (const event of [
      ...sceneFrameEvents,
      ...scenePlanEvents,
      ...validationEvents,
      ...executionEvents,
      ...packetEvents,
      ...packetGuardEvents,
    ]) {
      assertCompactScenePlanPayload(event.payload);
    }

    // --- No secret leak: apiKey placeholder must not appear anywhere -
    for (const f of files) {
      const raw = readFileSync(join(logsDir, f), "utf-8");
      expect(raw).not.toContain("SECRET_KEY_PLACEHOLDER");
    }
  });

  it("emits bounded combat.bounds.derived payloads for hostile turns", async () => {
    const campaignId = "test-obs-combat-bounds";
    seedCampaignWithAllSeams(campaignsRoot, campaignId, { tick: 4 });

    const { Hono } = await import("hono");
    const { default: chatRoutes } = await import("../../routes/chat.js");
    const app = new Hono();
    app.route("/api/chat", chatRoutes);

    const res = await app.request("/api/chat/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignId,
        playerAction: "strike the barkeep",
        intent: "attack",
        method: "knife slash",
      }),
    });
    expect(res.status).toBe(200);
    await drainBody(res);
    await new Promise((r) => setTimeout(r, 50));

    const events = readAllEventsFromJsonl(logsRoot, campaignId);
    const boundsEvent = events.find((e) => e.event === "combat.bounds.derived");
    expect(boundsEvent).toBeDefined();
    expect(boundsEvent?.payload).toEqual(
      expect.objectContaining({
        source: "player",
        outcome: "strong_hit",
        matchup: "advantaged",
      }),
    );
    expect(JSON.stringify(boundsEvent?.payload ?? {}).length).toBeLessThanOrEqual(512);
  });

  it("emits exactly one bounded world-brain scene-direction event for opening scenes", async () => {
    const campaignId = "test-obs-opening-world-brain";
    seedCampaignWithAllSeams(campaignsRoot, campaignId, { tick: 7 });

    const { Hono } = await import("hono");
    const { default: chatRoutes } = await import("../../routes/chat.js");
    const app = new Hono();
    app.route("/api/chat", chatRoutes);

    const res = await app.request("/api/chat/opening", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ campaignId }),
    });
    expect(res.status).toBe(200);
    await drainBody(res);
    await new Promise((r) => setTimeout(r, 50));

    const events = readAllEventsFromJsonl(logsRoot, campaignId);
    const worldBrainEvents = events.filter((e) => e.event === "world-brain.scene-direction");

    expect(worldBrainEvents).toHaveLength(1);
    expect(worldBrainEvents[0]?.payload).toEqual(
      expect.objectContaining({
        source: "opening-scene",
        ran: true,
      }),
    );
    expect(JSON.stringify(worldBrainEvents[0]?.payload ?? {}).length).toBeLessThanOrEqual(512);
  });
});
