import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Phase 58-03 — route-level ALS correlation test.
//
// Exercises the REAL chat route (via Hono `app.request`) with a mocked
// turn generator. Proves that:
//   - `turn.begin` fires as the first structured event in the JSONL file.
//   - `turn.end` fires as the last structured event (finally block).
//   - every record in the file carries the SAME `turnId`, `campaignId`, `tick`.
//   - delta / text-delta SSE events are aggregated (NOT emitted per chunk).
//   - concurrent turns across distinct campaigns DO NOT cross-contaminate:
//     two request flights produce two distinct log files, each carrying
//     only its own turnId / campaignId.
// ---------------------------------------------------------------------------

// Mocks — only stub the collaborators that need to be deterministic.
// DO NOT mock `../../lib/index.js` — we need the real pino logger + ALS.
vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  tickPresentNpcs: vi.fn(),
  simulateOffscreenNpcs: vi.fn(),
  checkAndTriggerReflections: vi.fn(),
  tickFactions: vi.fn(),
  findPendingNarrationSaga: vi.fn(() => null),
  resumePendingTurnNarration: vi.fn(),
  NarrationRepairExhaustedError: class NarrationRepairExhaustedError extends Error {},
  PendingNarrationError: class PendingNarrationError extends Error {},
  queuePostTurnSimulationProposals: vi.fn((input: { campaignId: string }) => ({
    campaignId: input.campaignId,
    baseWorldVersion: 0,
    worldTimeMinutes: 0,
    queued: [],
  })),
  buildDoneBoundaryData: vi.fn((_campaignId: string, data: unknown) => ({
    ...(data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : { value: data }),
    worldVersion: 0,
    worldTimeMinutes: 0,
  })),
  readWorldClock: vi.fn((campaignId: string) => ({ campaignId, worldVersion: 0, worldTimeMinutes: 0, currentTick: 0, updatedAt: 0 })),
}));

vi.mock("../../engine/grounded-lookup.js", () => ({
  runGroundedLookup: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  drainPendingCommittedEvents: vi.fn(() => []),
  embedAndUpdateEvent: vi.fn(),
}));

vi.mock("../../images/index.js", () => ({
  generateImage: vi.fn(),
  resolveImageProvider: vi.fn(() => null),
  buildScenePrompt: vi.fn(() => ""),
  buildLocationPrompt: vi.fn(() => ""),
  ensureImageDir: vi.fn(),
  cacheImage: vi.fn(),
  imageExists: vi.fn(() => true),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    select: () => ({
      from: () => ({
        where: () => ({
          get: () => ({ hp: 5, currentLocationId: null, currentSceneLocationId: null }),
        }),
      }),
    }),
  })),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(() => ({
    judge: { providerId: "p1", model: "judge-model", temperature: 0.1, maxTokens: 1024 },
    storyteller: { providerId: "p1", model: "st-model", temperature: 0.7, maxTokens: 2048 },
    embedder: { providerId: "", model: "", temperature: 0.1, maxTokens: 256 },
    providers: [
      {
        id: "p1",
        name: "P1",
        baseUrl: "http://localhost:1234",
        apiKey: "SECRET_KEY_PLACEHOLDER",
        defaultModel: "st-model",
        isBuiltin: false,
      },
    ],
    ui: { showRawReasoning: false },
    research: { maxSearchSteps: 0 },
    images: { stylePrompt: "" },
    observability: {
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
    },
  })),
}));

vi.mock("../helpers.js", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    resolveStoryteller: vi.fn(() => ({
      resolved: {
        provider: {
          id: "p1",
          name: "P1",
          baseUrl: "http://localhost:1234",
          apiKey: "SECRET_KEY_PLACEHOLDER",
          model: "st-model",
        },
        temperature: 0.7,
        maxTokens: 2048,
      },
    })),
    resolveJudge: vi.fn(() => ({
      resolved: {
        provider: {
          id: "p1",
          name: "P1",
          baseUrl: "http://localhost:1234",
          apiKey: "SECRET_KEY_PLACEHOLDER",
          model: "judge-model",
        },
        temperature: 0.1,
        maxTokens: 1024,
      },
    })),
    resolveEmbedder: vi.fn(() => ({ error: "not configured", status: 400 })),
    requireLoadedCampaign: vi.fn(async (_c: unknown, _id: string) => ({ id: _id })),
  };
});

vi.mock("../../campaign/runtime-state.js", () => {
  const active = new Set<string>();
  const snapshots = new Map<string, unknown>();
  return {
    tryBeginTurn: (id: string) => {
      if (active.has(id)) return false;
      active.add(id);
      return true;
    },
    endTurn: (id: string) => {
      active.delete(id);
    },
    hasActiveTurn: (id: string) => active.has(id),
    hasAnyActiveTurn: () => active.size > 0,
    setLastTurnSnapshot: (id: string, snap: unknown) => {
      snapshots.set(id, snap);
    },
    getLastTurnSnapshot: (id: string) => snapshots.get(id),
    clearLastTurnSnapshot: (id: string) => {
      snapshots.delete(id);
    },
    hasLiveTurnSnapshot: (id: string) => snapshots.has(id),
  };
});

vi.mock("../../campaign/chat-history.js", () => ({
  buildLookupHistoryMessages: vi.fn(() => []),
}));

vi.mock("../../campaign/index.js", async (importOriginal) => {
  const mod = (await importOriginal()) as Record<string, unknown>;
  return {
    ...mod,
    appendChatMessages: vi.fn(),
    getChatHistory: vi.fn(() => []),
    getCampaignPremise: vi.fn(() => "premise"),
    replaceChatMessage: vi.fn(() => true),
    getLastPlayerAction: vi.fn(() => "look around"),
    createCheckpoint: vi.fn(async () => undefined),
    pruneAutoCheckpoints: vi.fn(async () => undefined),
    // readCampaignConfig is NOT mocked here — chat.ts imports it directly;
    // it reads config.json from disk, and we seed that in `seedCampaign`.
  };
});

// Imports must come AFTER the mocks above.
import chatRoutes from "../chat.js";
import { processTurn } from "../../engine/index.js";
import { resetLoggerForTest } from "../../lib/logger-test-utils.js";

const mockedProcessTurn = vi.mocked(processTurn);

function buildApp(): Hono {
  const app = new Hono();
  app.route("/api/chat", chatRoutes);
  return app;
}

function seedCampaign(root: string, campaignId: string, tick = 0): void {
  const dir = join(root, campaignId);
  mkdirSync(dir, { recursive: true });
  const config = {
    name: `Test-${campaignId}`,
    premise: "A smoke-test premise.",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    generationComplete: true,
    currentTick: tick,
  };
  writeFileSync(join(dir, "config.json"), JSON.stringify(config, null, 2));
}

function createTurnEvents(events: Array<{ type: string; data: unknown }>) {
  return (async function* () {
    for (const event of events) {
      yield event as { type: string; data: unknown };
    }
  })();
}

async function drainBody(res: Response): Promise<string> {
  const reader = res.body!.getReader();
  const chunks: Uint8Array[] = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    buf.set(c, off);
    off += c.length;
  }
  return new TextDecoder().decode(buf);
}

function findTurnJsonl(logsDir: string): string | undefined {
  if (!existsSync(logsDir)) return undefined;
  return readdirSync(logsDir).find((f) => /^turn-\d+-[0-9a-f]{8}\.jsonl$/.test(f));
}

function readJsonlEvents(
  path: string,
): Array<Record<string, unknown>> {
  const raw = readFileSync(path, "utf-8").trim();
  if (!raw) return [];
  return raw.split(/\r?\n/).map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("chat route — AsyncLocalStorage correlation (Phase 58-03)", () => {
  let tmpRoot: string;
  let logsRoot: string;
  let campaignsRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "wf-chat-ctx-"));
    logsRoot = join(tmpRoot, "log-root");
    campaignsRoot = join(tmpRoot, "campaigns-root");
    mkdirSync(logsRoot, { recursive: true });
    mkdirSync(campaignsRoot, { recursive: true });
    process.env.GSD_LOG_ROOT = logsRoot;
    process.env.GSD_CAMPAIGNS_ROOT = campaignsRoot;
    resetLoggerForTest({ logRoot: logsRoot });
    mockedProcessTurn.mockReset();
  });

  afterEach(() => {
    delete process.env.GSD_LOG_ROOT;
    delete process.env.GSD_CAMPAIGNS_ROOT;
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      // best effort — Windows may hold handles briefly
    }
  });

  it("emits turn.begin/turn.end with shared turnId through the REAL /action route", async () => {
    const campaignId = "ctx-alpha";
    seedCampaign(campaignsRoot, campaignId, 3);
    mockedProcessTurn.mockImplementation(() =>
      createTurnEvents([
        { type: "scene-settling", data: { phase: "begin" } },
        { type: "text-delta", data: "Hello " },
        { type: "text-delta", data: "world" },
        { type: "done", data: { tick: 3 } },
      ]) as unknown as ReturnType<typeof processTurn>,
    );

    const app = buildApp();
    const res = await app.request("/api/chat/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        campaignId,
        playerAction: "look around",
        intent: "look",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await drainBody(res);
    // Allow pino's sync-append path to flush.
    await new Promise((r) => setTimeout(r, 50));

    const logsDir = join(logsRoot, "campaigns", campaignId, "logs");
    const file = findTurnJsonl(logsDir);
    expect(file).toBeDefined();
    const filePath = join(logsDir, file!);
    const events = readJsonlEvents(filePath);

    expect(events.length).toBeGreaterThanOrEqual(2);

    // Single turnId across the whole turn.
    const turnIds = new Set(events.map((e) => e.turnId));
    expect(turnIds.size).toBe(1);

    // campaignId + tick rode along.
    expect(events.every((e) => e.campaignId === campaignId)).toBe(true);
    expect(events.every((e) => e.tick === 3)).toBe(true);

    // turn.begin is the first structured event; turn.end is the last.
    const eventNames = events.map((e) => e.event);
    expect(eventNames[0]).toBe("turn.begin");
    expect(eventNames[eventNames.length - 1]).toBe("turn.end");

    // text-delta chunks were aggregated — no per-delta sse.emit records.
    const sseEmits = events.filter(
      (e) =>
        e.event === "sse.emit" &&
        ((e.payload as Record<string, unknown>)?.type === "text-delta"),
    );
    expect(sseEmits.length).toBe(0);

    // Exactly one aggregate record for the text-delta stream.
    const aggregates = events.filter(
      (e) =>
        e.event === "sse.stream.aggregate" &&
        ((e.payload as Record<string, unknown>)?.type === "text-delta"),
    );
    expect(aggregates.length).toBe(1);
    expect(
      (aggregates[0].payload as Record<string, unknown>).deltaCount,
    ).toBe(2);

    // No API key leakage even though we stuffed a placeholder into settings.
    const whole = readFileSync(filePath, "utf-8");
    expect(whole).not.toContain("SECRET_KEY_PLACEHOLDER");
  });

  it("produces separate log files for two concurrent campaigns with no cross-contamination", async () => {
    const alpha = "ctx-concurrent-a";
    const beta = "ctx-concurrent-b";
    seedCampaign(campaignsRoot, alpha, 1);
    seedCampaign(campaignsRoot, beta, 2);

    mockedProcessTurn.mockImplementation(((opts: { campaignId: string }) =>
      createTurnEvents([
        { type: "scene-settling", data: { phase: "begin", campaignId: opts.campaignId } },
        { type: "done", data: { tick: opts.campaignId === alpha ? 1 : 2 } },
      ])) as unknown as typeof processTurn);

    const app = buildApp();

    const [resA, resB] = await Promise.all([
      app.request("/api/chat/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: alpha,
          playerAction: "look around alpha",
          intent: "look",
          method: "",
        }),
      }),
      app.request("/api/chat/action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          campaignId: beta,
          playerAction: "look around beta",
          intent: "look",
          method: "",
        }),
      }),
    ]);

    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    await Promise.all([drainBody(resA), drainBody(resB)]);
    await new Promise((r) => setTimeout(r, 50));

    const alphaLogs = join(logsRoot, "campaigns", alpha, "logs");
    const betaLogs = join(logsRoot, "campaigns", beta, "logs");
    const alphaFile = findTurnJsonl(alphaLogs);
    const betaFile = findTurnJsonl(betaLogs);
    expect(alphaFile).toBeDefined();
    expect(betaFile).toBeDefined();

    const alphaEvents = readJsonlEvents(join(alphaLogs, alphaFile!));
    const betaEvents = readJsonlEvents(join(betaLogs, betaFile!));

    const alphaTurnIds = new Set(alphaEvents.map((e) => e.turnId));
    const betaTurnIds = new Set(betaEvents.map((e) => e.turnId));
    expect(alphaTurnIds.size).toBe(1);
    expect(betaTurnIds.size).toBe(1);
    const [alphaTurnId] = [...alphaTurnIds];
    const [betaTurnId] = [...betaTurnIds];
    expect(alphaTurnId).not.toBe(betaTurnId);

    // Neither file contains the other's identifiers.
    const alphaRaw = readFileSync(join(alphaLogs, alphaFile!), "utf-8");
    const betaRaw = readFileSync(join(betaLogs, betaFile!), "utf-8");
    expect(alphaRaw).not.toContain(betaTurnId as string);
    expect(alphaRaw).not.toContain(beta);
    expect(betaRaw).not.toContain(alphaTurnId as string);
    expect(betaRaw).not.toContain(alpha);
  });
});
