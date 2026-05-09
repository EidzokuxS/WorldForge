import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const routeState = vi.hoisted(() => {
  const runtimeSnapshots = new Map<string, unknown>();
  const runtimeActiveTurns = new Set<string>();
  const chatHistoryByCampaign = new Map<string, Array<{ role: string; content: string }>>();
  const partialMutations: string[] = [];

  return {
    runtimeSnapshots,
    runtimeActiveTurns,
    chatHistoryByCampaign,
    partialMutations,
    mockTryBeginTurn: vi.fn((campaignId: string) => {
      if (runtimeActiveTurns.has(campaignId)) return false;
      runtimeActiveTurns.add(campaignId);
      return true;
    }),
    mockEndTurn: vi.fn((campaignId: string) => {
      runtimeActiveTurns.delete(campaignId);
    }),
    mockSetLastTurnSnapshot: vi.fn((campaignId: string, snapshot: unknown) => {
      runtimeSnapshots.set(campaignId, snapshot);
    }),
    mockGetLastTurnSnapshot: vi.fn((campaignId: string) => runtimeSnapshots.get(campaignId)),
    mockClearLastTurnSnapshot: vi.fn((campaignId: string) => {
      runtimeSnapshots.delete(campaignId);
    }),
    mockLogError: vi.fn(),
  };
});
const {
  runtimeSnapshots,
  runtimeActiveTurns,
  chatHistoryByCampaign,
  partialMutations,
  mockTryBeginTurn,
  mockEndTurn,
  mockSetLastTurnSnapshot,
  mockGetLastTurnSnapshot,
  mockClearLastTurnSnapshot,
  mockLogError,
} = routeState;

vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: vi.fn(),
  getCampaignPremise: vi.fn(() => "A test world."),
  getChatHistory: vi.fn((campaignId: string) => chatHistoryByCampaign.get(campaignId) ?? []),
  getActiveCampaign: vi.fn(() => null),
  loadCampaign: vi.fn(async (campaignId: string) => ({
    id: campaignId,
    name: "Loaded Campaign",
    createdAt: "2026-01-01",
  })),
  replaceChatMessage: vi.fn(),
  getLastPlayerAction: vi.fn(),
  createCheckpoint: vi.fn(),
  pruneAutoCheckpoints: vi.fn(),
  readCampaignConfig: vi.fn(() => ({
    name: "Loaded Campaign",
    premise: "",
    createdAt: 0,
    currentTick: 0,
  })),
}));

vi.mock("../../lib/index.js", () => ({
  clamp: vi.fn((val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max),
  ),
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: routeState.mockLogError,
    warn: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  })),
  runWithTurnContext: <T,>(_ctx: unknown, fn: () => T): T => fn(),
  getTurnContext: vi.fn(() => undefined),
  withRole: <T,>(_role: unknown, fn: () => T): T => fn(),
}));

vi.mock("../../lib/logger-setup.js", () => ({
  rootPino: {
    flush: vi.fn(),
    child: () => ({
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    }),
  },
}));

vi.mock("../../lib/sse-hash.js", () => ({
  sha256Prefix: vi.fn(() => "deadbeefcafef00d"),
  isDeltaType: vi.fn(() => false),
  getOrCreateAggregator: vi.fn(() => ({ record: vi.fn() })),
  finalizeAggregators: vi.fn(() => []),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  tickPresentNpcs: vi.fn(),
  simulateOffscreenNpcs: vi.fn(),
  checkAndTriggerReflections: vi.fn(),
  tickFactions: vi.fn(),
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
  embedAndUpdateEvent: vi.fn(),
  drainPendingCommittedEvents: vi.fn(() => []),
}));

vi.mock("../../campaign/runtime-state.js", () => ({
  tryBeginTurn: routeState.mockTryBeginTurn,
  endTurn: routeState.mockEndTurn,
  hasActiveTurn: (campaignId: string) => routeState.runtimeActiveTurns.has(campaignId),
  setLastTurnSnapshot: routeState.mockSetLastTurnSnapshot,
  getLastTurnSnapshot: routeState.mockGetLastTurnSnapshot,
  clearLastTurnSnapshot: routeState.mockClearLastTurnSnapshot,
  hasLiveTurnSnapshot: (campaignId: string) => routeState.runtimeSnapshots.has(campaignId),
}));

import { resolveRoleModel } from "../../ai/index.js";
import { appendChatMessages, getLastPlayerAction } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import {
  processTurn,
  captureSnapshot,
  restoreSnapshot,
  tickPresentNpcs,
  buildDoneBoundaryData,
} from "../../engine/index.js";
import { drainPendingCommittedEvents } from "../../vectors/episodic-events.js";
import { loadSettings } from "../../settings/index.js";
import chatRoutes from "../chat.js";

const app = new Hono();
app.route("/chat", chatRoutes);

const CAMPAIGN_ID = "campaign-scene-plan";
const mockedResolveRoleModel = vi.mocked(resolveRoleModel);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedGetDb = vi.mocked(getDb);
const mockedProcessTurn = vi.mocked(processTurn);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedRestoreSnapshot = vi.mocked(restoreSnapshot);
const mockedTickPresentNpcs = vi.mocked(tickPresentNpcs);
const mockedBuildDoneBoundaryData = vi.mocked(buildDoneBoundaryData);
const mockedDrainPendingCommittedEvents = vi.mocked(drainPendingCommittedEvents);
const mockedGetLastPlayerAction = vi.mocked(getLastPlayerAction);
const mockedAppendChatMessages = vi.mocked(appendChatMessages);

function setupSettings() {
  mockedLoadSettings.mockReturnValue({
    judge: { providerId: "p1", model: "judge-model", temperature: 0.1, maxTokens: 1024 },
    storyteller: { providerId: "p1", model: "story-model", temperature: 0.7, maxTokens: 2048 },
    embedder: { providerId: "", model: "", temperature: 0.1, maxTokens: 256 },
    providers: [
      {
        id: "p1",
        name: "P1",
        baseUrl: "http://localhost:1234",
        apiKey: "",
        defaultModel: "model",
        isBuiltin: false,
      },
    ],
    ui: { showRawReasoning: false },
  } as any);
  mockedResolveRoleModel.mockReturnValue({
    provider: { baseUrl: "http://localhost:1234", apiKey: "", model: "model" },
    temperature: 0.1,
    maxTokens: 1024,
  } as any);
}

function setupDbMock() {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    get: vi.fn(() => ({
      hp: 5,
      currentLocationId: "loc-1",
      currentSceneLocationId: "loc-1",
    })),
    all: vi.fn(() => []),
  } as any;
  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);
  mockedGetDb.mockReturnValue({
    select: vi.fn(() => query),
  } as any);
}

function turnStream(events: Array<{ type: string; data: unknown }>) {
  return (async function* () {
    for (const event of events) {
      yield event as any;
    }
  })();
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeSnapshots.clear();
  runtimeActiveTurns.clear();
  chatHistoryByCampaign.clear();
  partialMutations.length = 0;
  setupSettings();
  setupDbMock();
  mockedCaptureSnapshot.mockImplementation(async (campaignId) => ({
    campaignId,
    bundleDir: `bundle-${campaignId}`,
    capturedAt: 1,
  }));
  mockedProcessTurn.mockImplementation(() =>
    turnStream([{ type: "done", data: { tick: 1 } }]),
  );
  mockedDrainPendingCommittedEvents.mockReturnValue([]);
  mockedAppendChatMessages.mockImplementation((campaignId, messages) => {
    const existing = chatHistoryByCampaign.get(campaignId) ?? [];
    existing.push(...messages);
    chatHistoryByCampaign.set(campaignId, existing);
  });
});

describe("ScenePlan chat route cutover", () => {
  it("normal action route never passes onBeforeVisibleNarration", async () => {
    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Ask the guard what happened",
        intent: "Ask the guard what happened",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();

    const actionOptions = mockedProcessTurn.mock.calls[0]?.[0] as any;
    expect(actionOptions).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        onPostTurn: expect.any(Function),
      }),
    );
    expect(actionOptions).not.toHaveProperty("onBeforeVisibleNarration");
    expect(mockedTickPresentNpcs).not.toHaveBeenCalled();
  });

  it("treats intent and method as compatibility fields instead of product semantics", async () => {
    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "I ask Iru if she is safe.",
        intent: "Attack Iru immediately",
        method: "with a sword",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();

    const actionOptions = mockedProcessTurn.mock.calls[0]?.[0] as any;
    expect(actionOptions).toEqual(
      expect.objectContaining({
        playerAction: "I ask Iru if she is safe.",
        intent: "I ask Iru if she is safe.",
        method: "",
      }),
    );
  });

  it.each([
    ["direct speech", "I say hello to Iru.", "Iru nods without any roll."],
    ["observation", "I look around the room.", "The room stays quiet."],
    ["clarification", "Do the thing with it.", "Which thing do you mean?"],
    ["Continue", "Continue scene.", "The scene breathes for a beat."],
  ])("streams %s no-roll turns without oracle_result receipts", async (_caseName, actionText, narration) => {
    mockedProcessTurn.mockImplementation(() =>
      turnStream([
        { type: "narrative", data: narration },
        { type: "done", data: { tick: 1 } },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: actionText,
        intent: actionText,
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("event: narrative");
    expect(body).toContain("event: done");
    expect(body).not.toContain("event: oracle_result");
  });

  it("restores snapshot and clears last-turn snapshot when requested Oracle fails", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "pre-oracle-failure-boundary",
      capturedAt: 1,
    };
    mockedCaptureSnapshot.mockResolvedValue(snapshot as any);
    runtimeSnapshots.set(CAMPAIGN_ID, { bundleDir: "stale-success-boundary" });
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        throw new Error("oracle provider failed before roll receipt");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Try to force the sealed door open.",
        intent: "Try to force the sealed door open.",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("event: error");
    expect(body).not.toContain("event: oracle_result");
    expect(body).not.toContain("event: done");
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
    expect(mockClearLastTurnSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(runtimeSnapshots.has(CAMPAIGN_ID)).toBe(false);
  });

  it("restores snapshot when an invalid GM-selected tool or ID fails after partial mutation", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "pre-invalid-gm-tool-boundary",
      capturedAt: 1,
    };
    mockedCaptureSnapshot.mockResolvedValue(snapshot as any);
    mockedRestoreSnapshot.mockImplementation(async () => {
      partialMutations.length = 0;
    });
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        partialMutations.push("invalid tool wrote partial state");
        throw new Error("unsupported_tool: GM selected unknown target id");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Open that sealed hatch.",
        intent: "Open that sealed hatch.",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("event: error");
    expect(body).not.toContain("event: done");
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
    expect(partialMutations).toEqual([]);
    expect(mockedAppendChatMessages).not.toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ role: "assistant" })]),
    );
  });

  it("retry route restores snapshot on ScenePlan failure without onBeforeVisibleNarration", async () => {
    runtimeSnapshots.set(CAMPAIGN_ID, {
      campaignId: CAMPAIGN_ID,
      bundleDir: "previous-turn-boundary",
      capturedAt: 1,
    });
    mockedGetLastPlayerAction.mockReturnValue("Retry the strike");

    const res = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    await res.text();

    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({ bundleDir: "previous-turn-boundary" }),
    );
    const retryOptions = mockedProcessTurn.mock.calls[0]?.[0] as any;
    expect(retryOptions).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        playerAction: "Retry the strike",
        onPostTurn: expect.any(Function),
      }),
    );
    expect(retryOptions).not.toHaveProperty("onBeforeVisibleNarration");
    expect(mockedTickPresentNpcs).not.toHaveBeenCalled();
  });

  it("execution failure after action N restores snapshot, removes partial mutations, and persists no unsafe assistant message", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "pre-scene-plan-boundary",
      capturedAt: 1,
    };
    mockedCaptureSnapshot.mockResolvedValue(snapshot as any);
    mockedRestoreSnapshot.mockImplementation(async () => {
      partialMutations.length = 0;
    });
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "oracle_result", data: { outcome: "strong_hit" } } as any;
        yield { type: "scene-settling", data: { phase: "scene-plan-execution" } } as any;
        partialMutations.push("action N partial mutations");
        throw new Error("executeScenePlan action N failed after partial mutations");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Force the vault open",
        intent: "Force the vault open",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("event: oracle_result");
    expect(body).toContain("event: scene-settling");
    expect(body).toContain("event: error");
    expect(body).not.toContain("event: done");
    expect(body).not.toContain("event: narrative");
    expect(body).not.toContain("unsafe assistant");
    expect(mockLogError).toHaveBeenCalledWith(
      "Turn processing failed; restoring pre-turn boundary",
      expect.any(Error),
    );
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
    expect(mockClearLastTurnSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(mockEndTurn).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(partialMutations).toEqual([]);
    expect(mockedAppendChatMessages).not.toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ role: "assistant" })]),
    );
  });

  it("drains pending committed events after wrong-location ScenePlan rollback without narrating remote spawn", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "pre-remote-spawn-boundary",
      capturedAt: 1,
    };
    mockedCaptureSnapshot.mockResolvedValue(snapshot as any);
    mockedRestoreSnapshot.mockImplementation(async () => {
      partialMutations.length = 0;
    });
    mockedDrainPendingCommittedEvents.mockReturnValueOnce([
      {
        id: "queued-before-abort",
        text: "durable event queued before abort",
      } as any,
    ]);
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        partialMutations.push("attempted Outpost Cook spawn at Forest Outpost");
        throw new Error("ScenePlan grounding failed before execution: remote_location_ref");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Ask the cafe clerk for the price.",
        intent: "Ask the cafe clerk for the price.",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain("event: error");
    expect(body).not.toContain("event: narrative");
    expect(body).not.toContain("event: done");
    expect(body).not.toContain("Forest Outpost");
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
    expect(mockedDrainPendingCommittedEvents).toHaveBeenCalledWith(CAMPAIGN_ID, 0);
    expect(partialMutations).toEqual([]);
    expect(mockedAppendChatMessages).not.toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([expect.objectContaining({ role: "assistant" })]),
    );
  });

  it("stores the undo snapshot before emitting done boundary metadata", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "pre-success-boundary",
      capturedAt: 1,
    };
    mockedCaptureSnapshot.mockResolvedValue(snapshot as any);
    const snapshotWasStoredAtDone: boolean[] = [];
    mockedBuildDoneBoundaryData.mockImplementationOnce((campaignId, data) => {
      snapshotWasStoredAtDone.push(runtimeSnapshots.has(campaignId));
      return {
        ...(data && typeof data === "object" && !Array.isArray(data)
          ? data as Record<string, unknown>
          : { value: data }),
        worldVersion: 4,
        worldTimeMinutes: 9,
      };
    });
    mockedProcessTurn.mockImplementation(() =>
      turnStream([{ type: "done", data: { tick: 4 } }]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Hold position",
        intent: "Hold position",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();

    expect(body).toContain('"worldVersion":4');
    expect(snapshotWasStoredAtDone).toEqual([true]);
    expect(mockSetLastTurnSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
  });
});
