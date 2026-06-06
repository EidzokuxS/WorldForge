import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

const { resolveQuickActionSelectionMock } = vi.hoisted(() => ({
  resolveQuickActionSelectionMock: vi.fn(),
}));

const {
  isCleanGameplayRuntimeEnabledMock,
  processCleanGameplayTurnMock,
} = vi.hoisted(() => ({
  isCleanGameplayRuntimeEnabledMock: vi.fn(() => false),
  processCleanGameplayTurnMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../ai/index.js", () => ({
  callStoryteller: vi.fn(),
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: vi.fn(),
  getCampaignPremise: vi.fn(),
  getChatHistory: vi.fn(),
  getActiveCampaign: vi.fn(),
  loadCampaign: vi.fn(),
  popLastMessages: vi.fn(),
  replaceChatMessage: vi.fn(),
  getLastPlayerAction: vi.fn(),
  createCheckpoint: vi.fn(),
  pruneAutoCheckpoints: vi.fn(),
  // Phase 58-03: chat.ts reads currentTick from this at turn.begin.
  readCampaignConfig: vi.fn(() => ({
    name: "Test",
    premise: "",
    createdAt: 0,
    currentTick: 0,
  })),
}));

vi.mock("../../lib/index.js", () => ({
  clamp: vi.fn((val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max)
  ),
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getPlayerSafeErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  })),
  // Phase 58-03: chat.ts wraps the streamSSE body in these to attach
  // turnId/campaignId/tick to every downstream log record. Tests that
  // stub the lib barrel must provide pass-through fakes.
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
  shouldLogRole: vi.fn(() => true),
  getObservabilityConfigSnapshot: vi.fn(() => ({
    enabled: true,
    dumpFullPrompts: false,
    roles: {
      judge: true,
      storyteller: true,
      oracle: true,
      npcAgent: true,
      reflection: true,
      embedder: true,
      tool: true,
      prompt: true,
    },
  })),
  getLogRoot: vi.fn(() => ""),
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

const mockGetSettledTurnPacket = vi.fn((_input?: unknown) => null);
const mockGetTurnSaga = vi.fn((_input?: unknown) => null);
const mockHasPreparedSettledTurnPacketRecovery = vi.fn((_input?: unknown) => false);
const mockHasTurnSagaSnapshotRecovery = vi.fn((_input?: unknown) => false);

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  resumeGameplayCycleV2PendingNarration: vi.fn(),
  resumePendingTurnNarration: vi.fn(),
  findLatestGameplayCycleV2PendingNarrationPacket: vi.fn(() => null),
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  findPendingNarrationSaga: vi.fn(() => null),
  getSettledTurnPacket: (input: unknown) => mockGetSettledTurnPacket(input),
  hasPreparedSettledTurnPacketRecovery: (input: unknown) =>
    mockHasPreparedSettledTurnPacketRecovery(input),
  hasTurnSagaSnapshotRecovery: (input: unknown) => mockHasTurnSagaSnapshotRecovery(input),
  getTurnSaga: (input: unknown) => mockGetTurnSaga(input),
  PendingNarrationError: class PendingNarrationError extends Error {
    constructor(public readonly pendingSaga: unknown) {
      super("Pending narration.");
      this.name = "PendingNarrationError";
    }
  },
  NarrationRepairExhaustedError: class NarrationRepairExhaustedError extends Error {
    constructor(message = "Narration repair exhausted.") {
      super(message);
      this.name = "NarrationRepairExhaustedError";
    }
  },
  GameplayCycleV2PendingNarrationError: class GameplayCycleV2PendingNarrationError extends Error {
    packetId: string;
    campaignId: string;
    turnId: string;

    constructor(input: {
      packetId: string;
      campaignId: string;
      turnId: string;
      cause?: unknown;
    }) {
      super(`gameplay-cycle-v2 narration pending retry for packet ${input.packetId}`);
      this.name = "GameplayCycleV2PendingNarrationError";
      this.packetId = input.packetId;
      this.campaignId = input.campaignId;
      this.turnId = input.turnId;
      this.cause = input.cause;
    }
  },
  tickPresentNpcs: vi.fn(),
  simulateOffscreenNpcs: vi.fn(),
  checkAndTriggerReflections: vi.fn(),
  tickFactions: vi.fn(),
  queuePostTurnSimulationProposals: vi.fn(),
  buildDoneBoundaryData: vi.fn((_campaignId: string, data: unknown) => ({
    ...(data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : { value: data }),
    worldVersion: 0,
    worldTimeMinutes: 0,
  })),
  readWorldClock: vi.fn(() => ({ campaignId: CAMPAIGN_ID, worldVersion: 0, worldTimeMinutes: 0, currentTick: 0, updatedAt: 0 })),
  sanitizeNarrative: vi.fn((text: string) => text),
}));

vi.mock("../../engine/grounded-lookup.js", () => ({
  runGroundedLookup: vi.fn(),
}));

vi.mock("../../engine/quick-action-offers.js", () => ({
  resolveQuickActionSelection: (...args: unknown[]) => resolveQuickActionSelectionMock(...args),
  isQuickActionSelectionError: (error: unknown) =>
    Boolean(error && typeof error === "object" && (error as { name?: string }).name === "QuickActionSelectionError"),
}));

vi.mock("../../engine/gameplay-cycle-runtime/runtime.js", () => ({
  isCleanGameplayRuntimeEnabled: () => isCleanGameplayRuntimeEnabledMock(),
  processCleanGameplayTurn: (...args: unknown[]) => processCleanGameplayTurnMock(...args),
}));

const mockEmbedAndUpdateEvent = vi.fn();
const mockDrainPendingCommittedEvents = vi.fn();
const mockDrainPendingCommittedEventsByIds = vi.fn(
  (_campaignId?: unknown, _eventIds?: unknown): Array<{
    id: string;
    text: string;
    tick?: number;
    location?: string;
    participants?: string[];
    importance?: number;
    type?: string;
  }> => [],
);
const mockRetractStoredEpisodicEvent = vi.fn((_input?: unknown) => undefined);
const mockRetractPendingCommittedEventsForTick = vi.fn(
  async (_campaignId?: unknown, _tick?: unknown): Promise<Array<{ id: string; text: string }>> => [],
);
const runtimeSnapshots = new Map<string, unknown>();
const runtimeSnapshotMetadata = new Map<string, {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
  playerAction: string | null;
  chatHistoryLengthBeforeTurn: number | null;
  chatHistoryLengthAfterTurn: number | null;
}>();
const runtimeActiveTurns = new Set<string>();

vi.mock("../../vectors/episodic-events.js", () => ({
  embedAndUpdateEvent: (...args: unknown[]) => mockEmbedAndUpdateEvent(...args),
  drainPendingCommittedEvents: (...args: unknown[]) => mockDrainPendingCommittedEvents(...args),
  drainPendingCommittedEventsByIds: (campaignId: unknown, eventIds: unknown) =>
    mockDrainPendingCommittedEventsByIds(campaignId, eventIds),
  retractStoredEpisodicEvent: (input: unknown) => mockRetractStoredEpisodicEvent(input),
  retractPendingCommittedEventsForTick: (campaignId: unknown, tick: unknown) =>
    mockRetractPendingCommittedEventsForTick(campaignId, tick),
}));

vi.mock("../../campaign/runtime-state.js", () => ({
  tryBeginTurn: (campaignId: string) => {
    if (runtimeActiveTurns.has(campaignId)) {
      return false;
    }
    runtimeActiveTurns.add(campaignId);
    return true;
  },
  endTurn: (campaignId: string) => {
    runtimeActiveTurns.delete(campaignId);
  },
  hasActiveTurn: (campaignId: string) => runtimeActiveTurns.has(campaignId),
  setLastTurnSnapshot: (
    campaignId: string,
    snapshot: unknown,
    metadata?: {
      acceptedDurableEventIds?: readonly string[];
      producedDurableEventIds?: readonly string[];
      playerAction?: string | null;
      chatHistoryLengthBeforeTurn?: number | null;
      chatHistoryLengthAfterTurn?: number | null;
    },
  ) => {
    runtimeSnapshots.set(campaignId, snapshot);
    runtimeSnapshotMetadata.set(campaignId, {
      acceptedDurableEventIds: [...new Set(metadata?.acceptedDurableEventIds ?? [])],
      producedDurableEventIds: [...new Set(metadata?.producedDurableEventIds ?? [])],
      playerAction: metadata?.playerAction ?? null,
      chatHistoryLengthBeforeTurn: metadata?.chatHistoryLengthBeforeTurn ?? null,
      chatHistoryLengthAfterTurn: metadata?.chatHistoryLengthAfterTurn ?? null,
    });
  },
  getLastTurnSnapshot: (campaignId: string) => runtimeSnapshots.get(campaignId),
  getLastTurnSnapshotMetadata: (campaignId: string) =>
    runtimeSnapshotMetadata.get(campaignId) ?? {
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      playerAction: null,
      chatHistoryLengthBeforeTurn: null,
      chatHistoryLengthAfterTurn: null,
    },
  clearLastTurnSnapshot: (campaignId: string) => {
    runtimeSnapshots.delete(campaignId);
    runtimeSnapshotMetadata.delete(campaignId);
  },
  hasLiveTurnSnapshot: (campaignId: string) => runtimeSnapshots.has(campaignId),
  clearCampaignRuntimeState: (campaignId: string) => {
    runtimeActiveTurns.delete(campaignId);
    runtimeSnapshots.delete(campaignId);
    runtimeSnapshotMetadata.delete(campaignId);
  },
}));

import { callStoryteller } from "../../ai/index.js";
import {
  appendChatMessages,
  getActiveCampaign,
  getCampaignPremise,
  getChatHistory,
  loadCampaign,
  popLastMessages,
  replaceChatMessage,
  getLastPlayerAction,
} from "../../campaign/index.js";
import { loadSettings } from "../../settings/index.js";
import { resolveRoleModel } from "../../ai/index.js";
import { getDb } from "../../db/index.js";
import { getErrorMessage, getPlayerSafeErrorMessage } from "../../lib/index.js";
import {
  processOpeningScene,
  processTurn,
  resumeGameplayCycleV2PendingNarration,
  resumePendingTurnNarration,
  captureSnapshot,
  restoreSnapshot,
  findPendingNarrationSaga,
  findLatestGameplayCycleV2PendingNarrationPacket,
  PendingNarrationError,
  NarrationRepairExhaustedError,
  GameplayCycleV2PendingNarrationError,
  checkAndTriggerReflections,
  tickPresentNpcs,
  simulateOffscreenNpcs,
  tickFactions,
  queuePostTurnSimulationProposals,
  buildDoneBoundaryData,
} from "../../engine/index.js";
import { runGroundedLookup } from "../../engine/grounded-lookup.js";
import chatRoutes from "../chat.js";

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedAppendChatMessages = vi.mocked(appendChatMessages);
const mockedGetPremise = vi.mocked(getCampaignPremise);
const mockedGetHistory = vi.mocked(getChatHistory);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedPopLastMessages = vi.mocked(popLastMessages);
const mockedReplaceChatMessage = vi.mocked(replaceChatMessage);
const mockedGetLastPlayerAction = vi.mocked(getLastPlayerAction);
const mockedCallStoryteller = vi.mocked(callStoryteller);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRole = vi.mocked(resolveRoleModel);
const mockedGetDb = vi.mocked(getDb);
const mockedGetErrorMessage = vi.mocked(getErrorMessage);
const mockedGetPlayerSafeErrorMessage = vi.mocked(getPlayerSafeErrorMessage);
const mockedProcessTurn = vi.mocked(processTurn);
const mockedResumeGameplayCycleV2PendingNarration = vi.mocked(resumeGameplayCycleV2PendingNarration);
const mockedResumePendingTurnNarration = vi.mocked(resumePendingTurnNarration);
const mockedProcessOpeningScene = vi.mocked(processOpeningScene);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedRestoreSnapshot = vi.mocked(restoreSnapshot);
const mockedFindPendingNarrationSaga = vi.mocked(findPendingNarrationSaga);
const mockedFindLatestGameplayCycleV2PendingNarrationPacket =
  vi.mocked(findLatestGameplayCycleV2PendingNarrationPacket);
const mockedCheckAndTriggerReflections = vi.mocked(checkAndTriggerReflections);
const mockedTickPresentNpcs = vi.mocked(tickPresentNpcs);
const mockedSimulateOffscreenNpcs = vi.mocked(simulateOffscreenNpcs);
const mockedTickFactions = vi.mocked(tickFactions);
const mockedQueuePostTurnSimulationProposals = vi.mocked(queuePostTurnSimulationProposals);
const mockedBuildDoneBoundaryData = vi.mocked(buildDoneBoundaryData);
const mockedRunGroundedLookup = vi.mocked(runGroundedLookup);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/chat", chatRoutes);

const CAMPAIGN_ID = "campaign-42";
const chatHistoryByCampaign = new Map<string, Array<{ role: string; content: string }>>();

function activateCampaign() {
  mockedGetActive.mockReturnValue({
    id: CAMPAIGN_ID,
    name: "Test Campaign",
    createdAt: "2026-01-01",
  } as any);
}

function setupStoryteller() {
  mockedLoadSettings.mockReturnValue({
    judge: { providerId: "p1", model: "judge-model", temperature: 0.1, maxTokens: 1024 },
    storyteller: { providerId: "p1", model: "st-model", temperature: 0.7, maxTokens: 2048 },
    embedder: { providerId: "", model: "", temperature: 0.1, maxTokens: 256 },
    providers: [{ id: "p1", name: "P1", baseUrl: "http://localhost:1234", apiKey: "", defaultModel: "m", isBuiltin: false }],
    ui: { showRawReasoning: false },
  } as any);

  mockedResolveRole.mockReturnValue({
    provider: { baseUrl: "http://localhost:1234", apiKey: "", model: "st-model" },
    temperature: 0.7,
    maxTokens: 2048,
  } as any);
}

function setupDbMock(
  player:
    | { hp: number; currentLocationId?: string | null; currentSceneLocationId?: string | null }
    | null = { hp: 5, currentLocationId: "loc-001", currentSceneLocationId: "loc-001" },
) {
  const query = {
    from: vi.fn(),
    where: vi.fn(),
    get: vi.fn(() => player),
    all: vi.fn(() => []),
  } as any;

  query.from.mockReturnValue(query);
  query.where.mockReturnValue(query);

  mockedGetDb.mockReturnValue({
    select: vi.fn(() => query),
  } as any);
}

function createTurnStream(events: Array<{ type: string; data: unknown }>) {
  return (async function* () {
    for (const event of events) {
      yield event as any;
    }
  })();
}

function parseSseEvents(body: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = [];
  const blocks = body.split(/\r?\n\r?\n/).map((block) => block.trim()).filter(Boolean);
  for (const block of blocks) {
    const event = block.match(/^event: (.+)$/m)?.[1];
    const data = block.match(/^data: (.*)$/m)?.[1];
    if (!event || data === undefined) continue;
    try {
      events.push({ event, data: JSON.parse(data) });
    } catch {
      events.push({ event, data });
    }
  }
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolveQuickActionSelectionMock.mockReset();
  isCleanGameplayRuntimeEnabledMock.mockReset();
  isCleanGameplayRuntimeEnabledMock.mockReturnValue(false);
  processCleanGameplayTurnMock.mockReset();
  mockDrainPendingCommittedEvents.mockReturnValue([]);
  mockDrainPendingCommittedEventsByIds.mockReturnValue([]);
  mockRetractPendingCommittedEventsForTick.mockResolvedValue([]);
  mockGetSettledTurnPacket.mockReturnValue(null);
  mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(false);
  mockHasTurnSagaSnapshotRecovery.mockReturnValue(false);
  runtimeSnapshots.clear();
  runtimeSnapshotMetadata.clear();
  runtimeActiveTurns.clear();
  chatHistoryByCampaign.clear();
  mockedGetPremise.mockReturnValue("A dark fantasy world.");
  mockedGetActive.mockReturnValue(null as any);
  mockedLoadCampaign.mockResolvedValue({
    id: CAMPAIGN_ID,
    name: "Loaded Campaign",
    createdAt: "2026-01-01",
  } as any);
  mockedAppendChatMessages.mockImplementation((campaignId, messages) => {
    const existing = chatHistoryByCampaign.get(campaignId) ?? [];
    existing.push(...messages);
    chatHistoryByCampaign.set(campaignId, existing);
  });
  mockedGetHistory.mockImplementation((campaignId) => {
    return [...(chatHistoryByCampaign.get(campaignId) ?? [])] as any;
  });
  mockedQueuePostTurnSimulationProposals.mockReturnValue({
    campaignId: CAMPAIGN_ID,
    baseWorldVersion: 0,
    worldTimeMinutes: 0,
    queued: [],
  } as any);
  mockedBuildDoneBoundaryData.mockImplementation((_campaignId, data) => ({
    ...(data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : { value: data }),
    worldVersion: 0,
    worldTimeMinutes: 0,
  }));
  mockedFindPendingNarrationSaga.mockReturnValue(null);
  mockedFindLatestGameplayCycleV2PendingNarrationPacket.mockReturnValue(null);
  mockGetTurnSaga.mockReturnValue(null);
});

// ---------------------------------------------------------------------------
// GET /chat/history
// ---------------------------------------------------------------------------
describe("GET /chat/history", () => {
  it("returns 400 when campaignId query is missing", async () => {
    activateCampaign();

    const res = await app.request("/chat/history");

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("campaignId is required.");
  });

  it("returns messages and premise", async () => {
    activateCampaign();
    mockedGetPremise.mockReturnValue("A dark fantasy world.");
    mockedGetHistory.mockReturnValue([
      { role: "user", content: "I look around." },
      { role: "assistant", content: "You see a forest." },
    ] as any);

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.premise).toBe("A dark fantasy world.");
    expect(body.hasLiveTurnSnapshot).toBe(false);
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
  });

  it("projects pending narration recovery without leaking saga status", async () => {
    activateCampaign();
    mockedFindPendingNarrationSaga.mockReturnValue({
      id: "saga-hidden-history",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-hidden-history",
      status: "world_consequence_running",
      settledTurnPacketId: null,
    } as any);

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pendingNarration).toMatchObject({
      pendingNarration: true,
      resumable: false,
      recoveryState: "finalizing_turn",
    });
    expect(body.pendingNarration).not.toHaveProperty("status");
    expect(JSON.stringify(body)).not.toContain("world_consequence_running");
    expect(JSON.stringify(body)).not.toContain("saga-hidden-history");
    expect(JSON.stringify(body)).not.toContain("turn-hidden-history");
  });

  it("marks prepared settled-packet recovery as resumable without exposing saga internals", async () => {
    activateCampaign();
    mockedFindPendingNarrationSaga.mockReturnValue({
      id: "saga-prepared-history",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-prepared-history",
      status: "world_consequence_running",
      settledTurnPacketId: null,
    } as any);
    mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(true);

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pendingNarration).toMatchObject({
      pendingNarration: true,
      resumable: true,
      recoveryState: "resume_ready",
      resumeToken: expect.stringMatching(/^resume_/),
    });
    expect(JSON.stringify(body)).not.toContain("world_consequence_running");
    expect(JSON.stringify(body)).not.toContain("saga-prepared-history");
    expect(JSON.stringify(body)).not.toContain("turn-prepared-history");
  });

  it("marks pre-turn snapshot recovery as resumable without exposing saga internals", async () => {
    activateCampaign();
    mockedFindPendingNarrationSaga.mockReturnValue({
      id: "saga-snapshot-history",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-snapshot-history",
      status: "world_consequence_running",
      settledTurnPacketId: null,
    } as any);
    mockHasTurnSagaSnapshotRecovery.mockReturnValue(true);

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pendingNarration).toMatchObject({
      pendingNarration: true,
      resumable: true,
      recoveryState: "resume_ready",
      resumeToken: expect.stringMatching(/^resume_/),
    });
    expect(JSON.stringify(body)).not.toContain("world_consequence_running");
    expect(JSON.stringify(body)).not.toContain("saga-snapshot-history");
    expect(JSON.stringify(body)).not.toContain("turn-snapshot-history");
  });

  it("returns 404 when the requested campaign cannot be loaded", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockRejectedValue(new Error("missing campaign"));

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Campaign not active or not found.");
  });

  it("returns 500 when getChatHistory throws", async () => {
    activateCampaign();
    mockedGetPremise.mockImplementation(() => {
      throw new Error("read error");
    });

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

describe("POST /chat/opening", () => {
  it("streams an authoritative opening scene when the campaign has no assistant messages yet", async () => {
    setupStoryteller();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedGetHistory.mockReturnValue([{ role: "user", content: "Premise setup only." }] as any);
    mockedProcessOpeningScene.mockImplementation(() =>
      createTurnStream([
        { type: "scene-settling", data: { phase: "opening" } },
        { type: "narrative", data: { text: "Lanternlight cuts across Ash Market as the watch closes in." } },
        { type: "done", data: { tick: 0, opening: true } },
      ]),
    );

    const res = await app.request("/chat/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: scene-settling");
    expect(body).toContain("event: narrative");
    expect(body).toContain("Lanternlight cuts across Ash Market");
    expect(mockedProcessOpeningScene).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
      }),
    );
  });

  it("rejects opening generation when an assistant message already exists", async () => {
    setupStoryteller();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedGetHistory.mockReturnValue([
      { role: "user", content: "Look around." },
      { role: "assistant", content: "The market glares back at you." },
    ] as any);

    const res = await app.request("/chat/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("Opening scene already exists for this campaign.");
    expect(mockedProcessOpeningScene).not.toHaveBeenCalled();
  });

  it("still allows opening generation when prior assistant history is factual lookup only", async () => {
    setupStoryteller();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedGetHistory.mockReturnValue([
      { role: "user", content: "/lookup character: Satoru Gojo" },
      {
        role: "assistant",
        content:
          "[Lookup: character_canon_fact] Gojo remains sealed until the Prison Realm opens.",
      },
    ] as any);
    mockedProcessOpeningScene.mockImplementation(() =>
      createTurnStream([
        { type: "scene-settling", data: { phase: "opening" } },
        { type: "narrative", data: { text: "The station groans awake around you." } },
        { type: "done", data: { tick: 0, opening: true } },
      ]),
    );

    const res = await app.request("/chat/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: narrative");
    expect(body).toContain("The station groans awake around you.");
    expect(mockedProcessOpeningScene).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
      }),
    );
  });
});

describe("Targeted gameplay route campaignId validation", () => {
  it("rejects /chat/action without campaignId", async () => {
    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerAction: "I open the door.",
        intent: "Open the door.",
        method: "",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("campaignId is required.");
  });

  it("routes /chat/action to the clean gameplay runtime when the clean lane is enabled", async () => {
    setupStoryteller();
    setupDbMock();
    isCleanGameplayRuntimeEnabledMock.mockReturnValue(true);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      bundleDir: "clean-pre-turn",
      capturedAt: 1,
    }) as any);
    processCleanGameplayTurnMock.mockImplementation((options) =>
      createTurnStream([
        {
          type: "scene-settling",
          data: { stage: "scene-frame", phase: "gameplay-cycle-runtime" },
        },
        {
          type: "narrative",
          data: { text: "Текущая сцена: Market." },
        },
        {
          type: "done",
          data: {
            runtime: "gameplay-cycle-runtime",
            turnId: "clean-turn-1",
            packetId: "frame-1",
          },
        },
      ])
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Осматриваюсь.",
        intent: "legacy field ignored",
        method: "legacy field ignored",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("gameplay-cycle-runtime");
    expect(body).toContain("Текущая сцена: Market.");
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(processCleanGameplayTurnMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        submittedPlayerAction: "Осматриваюсь.",
        normalizedPlayerAction: "Осматриваюсь.",
      }),
    );
    expect(mockedQueuePostTurnSimulationProposals).not.toHaveBeenCalled();
  });

  it("rejects /chat/retry without campaignId", async () => {
    const res = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("campaignId is required.");
  });

  it("rejects /chat/undo without campaignId", async () => {
    const res = await app.request("/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("campaignId is required.");
  });

  it("rejects /chat/edit without campaignId", async () => {
    const res = await app.request("/chat/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messageIndex: 1,
        newContent: "Updated text",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("campaignId is required.");
  });

  it("rejects /chat/lookup without campaignId", async () => {
    const res = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        lookupKind: "character_canon_fact",
        subject: "Satoru Gojo",
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("campaignId is required.");
  });
});

describe("turn lock cleanup on provider resolution errors", () => {
  const provider = {
    id: "p1",
    name: "P1",
    baseUrl: "http://localhost:1234",
    apiKey: "",
    defaultModel: "m",
    isBuiltin: false,
  };

  function mockSettings(overrides: {
    judgeProviderId?: string;
    storytellerProviderId?: string;
  } = {}) {
    mockedLoadSettings.mockReturnValue({
      judge: {
        providerId: overrides.judgeProviderId ?? "p1",
        model: "judge-model",
        temperature: 0.1,
        maxTokens: 1024,
      },
      storyteller: {
        providerId: overrides.storytellerProviderId ?? "p1",
        model: "st-model",
        temperature: 0.7,
        maxTokens: 2048,
      },
      embedder: { providerId: "", model: "", temperature: 0.1, maxTokens: 256 },
      providers: [provider],
      ui: { showRawReasoning: false },
    } as any);
    mockedResolveRole.mockReturnValue({
      provider: { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: "model" },
      temperature: 0.1,
      maxTokens: 1024,
    } as any);
  }

  it("releases /chat/opening lock when storyteller resolution fails", async () => {
    mockSettings({ storytellerProviderId: "" });

    const res = await app.request("/chat/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(400);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
    expect(mockedProcessOpeningScene).not.toHaveBeenCalled();
  });

  it("releases /chat/action lock when judge resolution fails", async () => {
    mockSettings({ judgeProviderId: "" });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Press for an answer",
        intent: "Press for an answer",
        method: "",
      }),
    });

    expect(res.status).toBe(400);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
    expect(mockedProcessTurn).not.toHaveBeenCalled();
  });

  it("releases /chat/retry lock when storyteller resolution fails after judge resolves", async () => {
    mockSettings({ storytellerProviderId: "" });
    runtimeSnapshots.set(CAMPAIGN_ID, {
      campaignId: CAMPAIGN_ID,
      bundleDir: "previous-turn-boundary",
      capturedAt: 1,
    });
    mockedGetLastPlayerAction.mockReturnValue("Retry the last move");

    const res = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(400);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
    expect(mockedProcessTurn).not.toHaveBeenCalled();
  });
});

describe("Campaign-loaded gameplay transport", () => {
  it("routes explicit grounded lookups through /chat/lookup without invoking the normal turn pipeline", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "power_profile",
      subject: "Satoru Gojo",
      answer: "Gojo overwhelms close-range opponents through Infinity and Domain Expansion.",
      citations: [
        {
          kind: "research",
          label: "Character grounding",
          excerpt: "Infinity prevents direct contact while his domain overloads the target.",
        },
      ],
      uncertaintyNotes: [
        "Cross-setting scaling remains bounded to stored grounded cues.",
      ],
      sceneImpact: "Clarifies the factual baseline without advancing the scene.",
    });

    const res = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        lookupKind: "power_profile",
        subject: "Satoru Gojo",
        compareAgainst: "Ryomen Sukuna",
        question: "Who has the stronger battle control kit?",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(mockedRunGroundedLookup).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      lookupKind: "power_profile",
      subject: "Satoru Gojo",
      compareAgainst: "Ryomen Sukuna",
      question: "Who has the stronger battle control kit?",
    });
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(body).toContain("event: lookup_result");
    expect(body).toContain("event: done");
    expect(body).toContain("Gojo overwhelms close-range opponents");
    expect(body).toContain("\"kind\":\"research\"");
    expect(body).not.toContain("event: scene-settling");
    expect(body).not.toContain("event: oracle_result");
    expect(body).not.toContain("event: narrative");
    expect(body).not.toContain("event: state_update");
    expect(body).not.toContain("event: quick_actions");
  });

  it("projects lookup SSE and assistant history through the player-facing boundary", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "character_canon_fact",
      subject: "actor:raw_gojo",
      answer:
        "actor:raw_gojo invoked record_world_fact through tool-result-secret near loc-secret 123e4567-e89b-12d3-a456-426614174000.",
      citations: [
        {
          kind: "research",
          label: "campaign:source",
          excerpt: "npc_secret saw tool-result-secret at location:private.",
        },
      ],
      uncertaintyNotes: ["forecast-secret remains model-internal."],
      sceneImpact: "location:private should not leave the backend boundary.",
    });

    const res = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        lookupKind: "character_canon_fact",
        subject: "actor:raw_gojo",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: lookup_result");
    expect(body).toContain("[hidden]");
    expect(body).not.toContain("actor:raw_gojo");
    expect(body).not.toContain("record_world_fact");
    expect(body).not.toContain("tool-result-secret");
    expect(body).not.toContain("loc-secret");
    expect(body).not.toContain("npc_secret");
    expect(body).not.toContain("location:private");
    expect(body).not.toContain("forecast-secret");
    expect(body).not.toContain("123e4567-e89b-12d3-a456-426614174000");

    const persistedMessages = mockedAppendChatMessages.mock.calls.at(-1)?.[1];
    expect(persistedMessages?.[1]?.content).toContain("[hidden]");
    expect(persistedMessages?.[1]?.content).not.toContain("actor:raw_gojo");
    expect(persistedMessages?.[1]?.content).not.toContain("record_world_fact");
    expect(persistedMessages?.[1]?.content).not.toContain("tool-result-secret");
    expect(persistedMessages?.[1]?.content).not.toContain("123e4567-e89b-12d3-a456-426614174000");
  });

  it("persists lookup exchanges to /chat/history without creating a live turn snapshot", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "character_canon_fact",
      subject: "Satoru Gojo",
      answer: "Gojo is the strongest active sorcerer prior to his sealing.",
      citations: [],
      uncertaintyNotes: [],
      sceneImpact: "Lookup only.",
    });

    const res = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        lookupKind: "character_canon_fact",
        subject: "Satoru Gojo",
      }),
    });

    expect(res.status).toBe(200);
    const streamBody = await res.text();
    expect(streamBody).toContain("event: lookup_result");
    expect(streamBody).toContain("event: done");
    expect(streamBody).not.toContain("event: oracle_result");
    expect(streamBody).not.toContain("event: narrative");
    expect(mockedAppendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      { role: "user", content: "/lookup character: Satoru Gojo" },
      {
        role: "assistant",
        content:
          "[Lookup: character_canon_fact] Gojo is the strongest active sorcerer prior to his sealing.",
      },
    ]);

    const historyRes = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.hasLiveTurnSnapshot).toBe(false);
    expect(historyBody.messages).toEqual([
      { role: "user", content: "/lookup character: Satoru Gojo" },
      {
        role: "assistant",
        content:
          "[Lookup: character_canon_fact] Gojo is the strongest active sorcerer prior to his sealing.",
      },
    ]);
  });

  it("persists compare exchanges on the same history lane with factual compare entries", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "power_profile",
      subject: "Satoru Gojo",
      answer: "Gojo owns range control, while Sukuna threatens the broader finishing ceiling.",
      citations: [],
      uncertaintyNotes: [],
      sceneImpact: "Lookup only.",
    });

    const res = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        lookupKind: "power_profile",
        subject: "Satoru Gojo",
        compareAgainst: "Ryomen Sukuna",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedAppendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      { role: "user", content: "/compare Satoru Gojo vs Ryomen Sukuna" },
      {
        role: "assistant",
        content:
          "[Lookup: compare] Gojo owns range control, while Sukuna threatens the broader finishing ceiling.",
      },
    ]);

    const historyRes = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.hasLiveTurnSnapshot).toBe(false);
    expect(historyBody.messages).toEqual([
      { role: "user", content: "/compare Satoru Gojo vs Ryomen Sukuna" },
      {
        role: "assistant",
        content:
          "[Lookup: compare] Gojo owns range control, while Sukuna threatens the broader finishing ceiling.",
      },
    ]);
  });

  it("rejects retry when a lookup moves the transcript past the live gameplay boundary", async () => {
    setupStoryteller();
    setupDbMock();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      bundleDir: "pre-turn-boundary",
      capturedAt: 1,
    }) as any);
    mockedProcessTurn.mockImplementation(({ campaignId, playerAction }) => {
      mockedAppendChatMessages(campaignId, [
        { role: "user", content: playerAction },
        { role: "assistant", content: "The harbor bell answers your signal." },
      ] as any);
      return createTurnStream([{ type: "done", data: { tick: 2 } }]);
    });
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "character_canon_fact",
      subject: "Harbor Master",
      answer: "The harbor master controls inspection dock access.",
      citations: [],
      uncertaintyNotes: [],
      sceneImpact: "Lookup only.",
    });

    const actionRes = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Signal the harbor bell",
        intent: "Signal the harbor bell",
        method: "",
      }),
    });
    expect(actionRes.status).toBe(200);
    await actionRes.text();

    const lookupRes = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        lookupKind: "character_canon_fact",
        subject: "Harbor Master",
      }),
    });
    expect(lookupRes.status).toBe(200);
    await lookupRes.text();

    const historyRes = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);
    expect(historyRes.status).toBe(200);
    await expect(historyRes.json()).resolves.toMatchObject({ hasLiveTurnSnapshot: false });

    const retryRes = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(retryRes.status).toBe(400);
    await expect(retryRes.json()).resolves.toMatchObject({ error: "Nothing to retry." });
    expect(mockedProcessTurn).toHaveBeenCalledTimes(1);
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });

  it("rejects undo when a compare entry is the current transcript tail", async () => {
    setupStoryteller();
    setupDbMock();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      bundleDir: "pre-turn-boundary",
      capturedAt: 1,
    }) as any);
    mockedProcessTurn.mockImplementation(({ campaignId, playerAction }) => {
      mockedAppendChatMessages(campaignId, [
        { role: "user", content: playerAction },
        { role: "assistant", content: "The duel demand lands in the plaza." },
      ] as any);
      return createTurnStream([{ type: "done", data: { tick: 2 } }]);
    });
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "power_profile",
      subject: "Gojo",
      answer: "Gojo controls range while Sukuna threatens finishing pressure.",
      citations: [],
      uncertaintyNotes: [],
      sceneImpact: "Lookup only.",
    });

    const actionRes = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Challenge the plaza champion",
        intent: "Challenge the plaza champion",
        method: "",
      }),
    });
    expect(actionRes.status).toBe(200);
    await actionRes.text();

    const lookupRes = await app.request("/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        lookupKind: "power_profile",
        subject: "Gojo",
        compareAgainst: "Sukuna",
      }),
    });
    expect(lookupRes.status).toBe(200);
    await lookupRes.text();

    const undoRes = await app.request("/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(undoRes.status).toBe(400);
    await expect(undoRes.json()).resolves.toMatchObject({ error: "Nothing to undo." });
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });

  it("accepts canon fact, event clarification, and power comparison lookups through the dedicated schema", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedRunGroundedLookup.mockResolvedValue({
      lookupKind: "world_canon_fact",
      subject: "Shibuya Incident",
      answer: "Bounded lookup answer.",
      citations: [],
      uncertaintyNotes: [],
      sceneImpact: "Lookup only.",
    });

    const payloads = [
      {
        campaignId: CAMPAIGN_ID,
        lookupKind: "world_canon_fact",
        subject: "Jujutsu High barriers",
      },
      {
        campaignId: CAMPAIGN_ID,
        lookupKind: "event_clarification",
        subject: "Shibuya Incident",
        question: "What triggered the civilian lockdown?",
      },
      {
        campaignId: CAMPAIGN_ID,
        lookupKind: "power_profile",
        subject: "Satoru Gojo",
        compareAgainst: "Ryomen Sukuna",
      },
    ];

    for (const payload of payloads) {
      const res = await app.request("/chat/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      expect(res.status).toBe(200);
      await res.text();
    }
  });

  it("streams only one visible narrative event for a settled action turn", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        { type: "oracle_result", data: { outcome: "weak_hit" } },
        { type: "scene-settling", data: { phase: "final-narration" } },
        { type: "narrative", data: { text: "Nanami let the warning land before he moved." } },
        { type: "finalizing_turn", data: { stage: "rollback_critical" } },
        { type: "done", data: { tick: 2 } },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Press Nanami for an answer",
        intent: "Press Nanami for an answer",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body.match(/event: narrative/g)).toHaveLength(1);
    expect(body).toContain("Nanami let the warning land before he moved.");
  });

  it("strips private ids and reasoning from player SSE events", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        {
          type: "oracle_result",
          data: {
            outcome: "weak_hit",
            reasoning: "Secret oracle reasoning.",
            rationale: "Secret oracle rationale.",
            sagaId: "oracle-saga-data-secret",
            turnId: "oracle-turn-data-secret",
            authority: "oracle-authority-secret",
            rawEvent: { marker: "oracle-raw-event-secret" },
          },
        },
        {
          type: "turn_resolution",
          data: {
            kind: "status_read",
            resolutionState: "observation_grounded",
            combatIntent: false,
            toolNames: ["inspect_known_fact", "record_world_fact"],
            evidenceIds: ["action-result:read-1"],
            consequenceIds: ["action-result:mutate-1"],
            explicitNoCombatEvidenceIds: ["action-result:no-combat-1"],
          },
        },
        { type: "state_update", data: { type: "raw_tool_result", id: "action-result:raw-1" } },
        {
          type: "state_update",
          data: {
            type: "location_change",
            locationId: "location:raw-secret-market",
            locationName: "route-confirmation desk",
            path: ["location:raw-origin", "route-confirmation landing", "Canal Market"],
            travelCost: 2,
          },
        },
        { type: "narrative", data: { text: "Nanami let the warning land before he moved." } },
        { type: "reasoning", data: { text: "Reasoning stays on a debug lane." } },
        {
          type: "done",
          data: {
            tick: 2,
            privateTerm: "hidden-from-done",
            acceptedDurableEventIds: ["evt-speak"],
            producedDurableEventIds: ["evt-speak"],
          },
        },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Press Nanami for an answer",
        intent: "Press Nanami for an answer",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: narrative");
    expect(body).toContain("event: oracle_result");
    expect(body).toContain("event: turn_resolution");
    expect(body).toContain("event: state_update");
    expect(body).toContain("status_read");
    expect(body).toContain("route-confirmation desk");
    expect(body).toContain("route-confirmation landing");
    expect(body).toContain("Canal Market");
    expect(body).toContain("\"travelCost\":2");
    expect(body).toContain("\"worldVersion\":0");
    expect(body).toContain("\"worldTimeMinutes\":0");
    expect(body).not.toContain("event: reasoning");
    expect(body).not.toContain("Reasoning stays on a debug lane.");
    expect(body).not.toContain("Secret oracle reasoning.");
    expect(body).not.toContain("Secret oracle rationale.");
    expect(body).not.toContain("oracle-saga-data-secret");
    expect(body).not.toContain("oracle-turn-data-secret");
    expect(body).not.toContain("oracle-authority-secret");
    expect(body).not.toContain("oracle-raw-event-secret");
    expect(body).not.toContain("resolutionState");
    expect(body).not.toContain("observation_grounded");
    expect(body).not.toContain("combatIntent");
    expect(body).not.toContain("toolNames");
    expect(body).not.toContain("inspect_known_fact");
    expect(body).not.toContain("record_world_fact");
    expect(body).not.toContain("raw_tool_result");
    expect(body).not.toContain("location:raw-secret-market");
    expect(body).not.toContain("location:raw-origin");
    expect(body).not.toContain("action-result:");
    expect(body).not.toContain("evt-speak");
    expect(body).not.toContain("hidden-from-done");
    expect(body).not.toContain("Nanami let the warning land before he moved.Reasoning stays on a debug lane.");
  });

  it("serializes public SSE from sanitized event data without raw TurnEvent envelope fields", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        {
          type: "narrative",
          data: { text: "The clerk keeps the ledger open on the counter." },
          sagaId: "saga-top-level-secret",
          turnId: "turn-top-level-secret",
          authority: { toolResultId: "tool-result-top-level-secret" },
          rawEvent: { hidden: "raw-event-top-level-secret" },
        } as any,
        {
          type: "done",
          data: { tick: 2, worldVersion: 7, worldTimeMinutes: 12 },
          sagaId: "saga-done-top-level-secret",
          turnId: "turn-done-top-level-secret",
          authority: { eventRefs: ["event-top-level-secret"] },
        } as any,
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Wait at the ledger counter",
        intent: "Wait at the ledger counter",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const events = parseSseEvents(body);
    expect(events).toEqual([
      {
        event: "narrative",
        data: { text: "The clerk keeps the ledger open on the counter." },
      },
      {
        event: "done",
        data: { tick: 2, worldVersion: 0, worldTimeMinutes: 0 },
      },
    ]);
    for (const forbidden of [
      "saga-top-level-secret",
      "turn-top-level-secret",
      "tool-result-top-level-secret",
      "raw-event-top-level-secret",
      "saga-done-top-level-secret",
      "turn-done-top-level-secret",
      "event-top-level-secret",
      "rawEvent",
      "authority",
      "sagaId",
      "turnId",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("projects error SSE through a player-facing allow-list", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        {
          type: "error",
          data: {
            error: "Narration guard still needs repair.",
            pendingNarration: true,
            resumable: true,
            recoveryState: "resume_ready",
            resumeToken: "resume_deadbeefcafef00d",
            settled: true,
            recoverable: true,
            sagaId: "saga-error-data-secret",
            turnId: "turn-error-data-secret",
            authority: { toolResultId: "tool-result-error-data-secret" },
            rawEvent: { hidden: "raw-event-error-data-secret" },
            debugOnly: "debug-error-data-secret",
          },
        },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Wait at the ledger counter",
        intent: "Wait at the ledger counter",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(parseSseEvents(body)).toEqual([
      {
        event: "error",
        data: {
          error: "Narration guard still needs repair.",
          pendingNarration: true,
          resumable: true,
          recoveryState: "resume_ready",
          resumeToken: "resume_deadbeefcafef00d",
          settled: true,
          recoverable: true,
        },
      },
    ]);
    for (const forbidden of [
      "saga-error-data-secret",
      "turn-error-data-secret",
      "tool-result-error-data-secret",
      "raw-event-error-data-secret",
      "debug-error-data-secret",
      "sagaId",
      "turnId",
      "authority",
      "rawEvent",
      "debugOnly",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("projects quick actions through a player-facing SSE allow-list", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        {
          type: "quick_actions",
          data: {
            success: true,
            result: {
              actions: [
                {
                  label: "Ask actor_hidden",
                  action: "Ask actor_hidden about route_hidden_path via tool_result_8 and spawn_npc.",
                  handle: "qac_0123456789abcdef0123456789abcdef",
                },
                {
                  label: "Ask",
                  action: "Ask the clerk about the sealed queue.",
                  handle: "qac_11111111111111111111111111111111",
                },
                {
                  label: "Watch",
                  action: "Watch the counter for a change in posture.",
                  handle: "qac_22222222222222222222222222222222",
                },
                {
                  label: "Move",
                  action: "Step toward the open registry desk.",
                  handle: "qac_33333333333333333333333333333333",
                },
              ],
            },
            authority: { toolResultId: "tool-result-secret" },
            toolResultId: "tool-result-secret",
            debug: "raw debug data",
          },
        },
        { type: "internal_debug", data: { id: "tool-result-unknown", debug: "hidden" } },
        { type: "done", data: { tick: 2 } },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Ask for options",
        intent: "Ask for options",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: quick_actions");
    expect(body).toContain("qac_0123456789abcdef0123456789abcdef");
    expect(body).toContain("Ask [hidden] about [hidden] via [hidden] and [hidden].");
    expect(body).toContain("Ask the clerk about the sealed queue.");
    expect(body).not.toContain("\"success\"");
    expect(body).not.toContain("\"result\"");
    expect(body).not.toContain("authority");
    expect(body).not.toContain("toolResultId");
    expect(body).not.toContain("tool-result-secret");
    expect(body).not.toContain("actor_hidden");
    expect(body).not.toContain("route_hidden_path");
    expect(body).not.toContain("tool_result_8");
    expect(body).not.toContain("spawn_npc");
    expect(body).not.toContain("raw debug data");
    expect(body).not.toContain("event: internal_debug");
    expect(body).not.toContain("tool-result-unknown");
  });

  it("does not flush quick-action SSE when the turn rolls back before done", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = { bundleId: "pre-quick-action-failure" } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield {
          type: "quick_actions",
          data: {
            actions: [
              {
                label: "Ask",
                action: "Ask what changed.",
                handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
              },
            ],
          },
        } as any;
        throw new Error("later receipt boundary failed");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Ask for options",
        intent: "Ask for options",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).not.toContain("event: quick_actions");
    expect(body).not.toContain("qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
  });

  it("resolves selected quick-action handles before starting the turn processor", async () => {
    setupStoryteller();
    setupDbMock();
    resolveQuickActionSelectionMock.mockResolvedValue({
      action: "Ask the clerk about the sealed queue.",
      label: "Ask the clerk",
      handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      offerId: "qao-private",
      actionId: "qaa-private",
      baseWorldVersion: 0,
    });
    mockedProcessTurn.mockImplementation(({ playerAction }) =>
      createTurnStream([
        { type: "narrative", data: { text: `Resolved: ${playerAction}` } },
        { type: "done", data: { tick: 2, worldVersion: 0, worldTimeMinutes: 0 } },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Tampered prose from the browser",
        intent: "Tampered prose from the browser",
        method: "",
        quickActionHandle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    });

    expect(res.status).toBe(200);
    expect(resolveQuickActionSelectionMock).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      currentTick: 0,
    });
    expect(mockedProcessTurn).toHaveBeenCalledWith(expect.objectContaining({
      playerAction: "Ask the clerk about the sealed queue.",
      intent: "Ask the clerk about the sealed queue.",
      method: "",
    }));
    const body = await res.text();
    expect(body).toContain("Resolved: Ask the clerk about the sealed queue.");
    expect(body).not.toContain("Resolved: Tampered prose from the browser");
  });

  it("resolves route quick-action handles while ignoring tampered browser refs", async () => {
    setupStoryteller();
    setupDbMock();
    resolveQuickActionSelectionMock.mockResolvedValue({
      action: "Follow the east stair toward the glass registry desk.",
      label: "Follow east stair",
      handle: "qac_abababababababababababababababab",
      offerId: "qao-private-route",
      actionId: "qaa-private-route",
      baseWorldVersion: 0,
    });
    mockedProcessTurn.mockImplementation(({ playerAction }) =>
      createTurnStream([
        { type: "narrative", data: { text: `Resolved route: ${playerAction}` } },
        { type: "done", data: { tick: 2, worldVersion: 0, worldTimeMinutes: 0 } },
      ]),
    );

    const tamperedBrowserText =
      "Follow raw loc-secret-east-stair via npc-hidden-clerk item-private-ledger "
      + "route-main pdto_place_secret sourceRefs offerId actionId qao-private-route qaa-private-route.";

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: tamperedBrowserText,
        intent: tamperedBrowserText,
        method: "",
        quickActionHandle: "qac_abababababababababababababababab",
      }),
    });

    expect(res.status).toBe(200);
    expect(resolveQuickActionSelectionMock).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      handle: "qac_abababababababababababababababab",
      currentTick: 0,
    });
    expect(mockedProcessTurn).toHaveBeenCalledWith(expect.objectContaining({
      playerAction: "Follow the east stair toward the glass registry desk.",
      intent: "Follow the east stair toward the glass registry desk.",
      method: "",
    }));
    const body = await res.text();
    expect(body).toContain("Resolved route: Follow the east stair toward the glass registry desk.");
    for (const forbidden of [
      "loc-secret-east-stair",
      "npc-hidden-clerk",
      "item-private-ledger",
      "route-main",
      "pdto_place_secret",
      "sourceRefs",
      "offerId",
      "actionId",
      "qao-private-route",
      "qaa-private-route",
      tamperedBrowserText,
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("rejects stale or forged quick-action handles without invoking the turn processor", async () => {
    setupStoryteller();
    setupDbMock();
    resolveQuickActionSelectionMock.mockRejectedValue({
      name: "QuickActionSelectionError",
      message: "That quick action is no longer available. Choose or type another action.",
      statusCode: 409,
    });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Use stale chip",
        intent: "Use stale chip",
        method: "",
        quickActionHandle: "qac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      }),
    });

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "That quick action is no longer available. Choose or type another action.",
    });
    expect(mockedProcessTurn).not.toHaveBeenCalled();
  });

  it("restores the pre-turn snapshot when gameplay-cycle-v2 fails before settlement", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    } as any;
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield {
          type: "scene-settling",
          data: { stage: "gm-read", phase: "gameplay-cycle-v2" },
        } as any;
        throw new Error("gameplay-cycle-v2 pre-settlement contract failed: GM Read generation failed before settlement");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Go to Silt Warrens",
        intent: "Go to Silt Warrens",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).toContain("Turn processing failed. The pre-turn state was restored; please retry.");
    expect(body).not.toContain("\"pendingNarration\":true");
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
  });

  it("projects progress events through the player-facing SSE allow-list", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        {
          type: "scene-settling",
          data: {
            stage: "scene-settling",
            phase: "actor-reactions",
            hiddenActorName: "Hidden Watcher",
            proposalId: "proposal-secret",
          },
        },
        {
          type: "finalizing_turn",
          data: {
            stage: "rollback_critical",
            privateTerm: "Forest Outpost",
          },
        },
        {
          type: "auto_checkpoint",
          data: { reason: "actor:secret-watcher" },
        },
        { type: "done", data: { tick: 2 } },
      ]),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Wait and watch",
        intent: "Wait and watch",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: scene-settling");
    expect(body).toContain("\"stageId\":\"resolving-nearby-reactions\"");
    expect(body).toContain("event: finalizing_turn");
    expect(body).toContain("\"stageId\":\"advancing-world-time\"");
    expect(body).toContain("event: auto_checkpoint");
    expect(body).toContain("Checkpoint available");
    expect(body).not.toContain("Hidden Watcher");
    expect(body).not.toContain("proposal-secret");
    expect(body).not.toContain("Forest Outpost");
    expect(body).not.toContain("actor:secret-watcher");
  });

  it.each([
    {
      path: "/chat/opening",
      fallback: "Opening request failed.",
      body: { campaignId: CAMPAIGN_ID },
    },
    {
      path: "/chat/action",
      fallback: "Action request failed.",
      body: {
        campaignId: CAMPAIGN_ID,
        playerAction: "Wait",
        intent: "Wait",
        method: "",
      },
    },
    {
      path: "/chat/retry",
      fallback: "Retry request failed.",
      body: { campaignId: CAMPAIGN_ID },
    },
  ])("uses player-safe JSON errors for outer $path failures", async ({ path, fallback, body }) => {
    mockedGetErrorMessage.mockImplementationOnce((error: unknown, fallbackMessage?: string) =>
      error instanceof Error ? error.message : fallbackMessage ?? "fallback",
    );
    mockedGetPlayerSafeErrorMessage.mockImplementationOnce((_error: unknown, fallbackMessage?: string) =>
      fallbackMessage ?? "fallback",
    );
    mockedLoadSettings.mockImplementationOnce(() => {
      throw new Error("outer failure actor_hidden tool_result_8");
    });

    const res = await app.request(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain(fallback);
    expect(text).not.toContain("actor_hidden");
    expect(text).not.toContain("tool_result_8");
    expect(text).not.toContain("outer failure");
    expect(mockedGetPlayerSafeErrorMessage).toHaveBeenCalledWith(expect.any(Error), fallback);
  });

  it("loads history by explicit campaignId when no campaign is active", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedGetPremise.mockReturnValue("A dark fantasy world.");
    mockedGetHistory.mockReturnValue([
      { role: "user", content: "I look around." },
      { role: "assistant", content: "You see a forest." },
    ] as any);

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    expect(mockedLoadCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
    const body = await res.json();
    expect(body.hasLiveTurnSnapshot).toBe(false);
    expect(body.messages).toHaveLength(2);
  });

  it("uses player-safe errors when explicit campaign loading fails", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockRejectedValueOnce(new Error("missing actor_hidden tool_result_8"));
    mockedGetErrorMessage.mockImplementationOnce((error: unknown, fallback?: string) =>
      error instanceof Error ? error.message : fallback ?? "fallback",
    );
    mockedGetPlayerSafeErrorMessage.mockImplementationOnce((_error: unknown, fallback?: string) =>
      fallback ?? "fallback",
    );

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(404);
    const bodyText = await res.text();
    expect(bodyText).toContain("Campaign not active or not found.");
    expect(bodyText).not.toContain("actor_hidden");
    expect(bodyText).not.toContain("tool_result_8");
    expect(mockedGetPlayerSafeErrorMessage).toHaveBeenCalledWith(
      expect.any(Error),
      "Campaign not active or not found.",
    );
  });

  it("projects history messages without backend resume metadata", async () => {
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockResolvedValue({
      id: CAMPAIGN_ID,
      name: "Loaded Campaign",
      createdAt: "2026-01-01",
    } as any);
    mockedGetPremise.mockReturnValue("A dark fantasy world.");
    mockedGetHistory.mockReturnValue([
      { role: "user", content: "I wait by the counter." },
      {
        role: "assistant",
        content:
          "The clerk returns with actor_hidden, tool_result_8, source:event-1, response-visible-1, effect_hidden, and 01890f9a-20f3-7cc2-9b7c-1a2b3c4d5e6f in a stale transcript.",
        metadata: {
          resumeNarration: {
            sagaId: "saga-secret-1",
            narratorAttemptId: "narrator-attempt-secret-1",
            turnId: "turn-secret-1",
            toolResultId: "tool-result-secret-1",
          },
          authority: {
            toolResultId: "tool-result-secret-2",
          },
        },
      },
    ] as any);

    const res = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);

    expect(res.status).toBe(200);
    const bodyText = await res.text();
    const body = JSON.parse(bodyText);
    expect(body.messages).toEqual([
      { role: "user", content: "I wait by the counter." },
      {
        role: "assistant",
        content:
          "The clerk returns with [hidden], [hidden], [hidden], [hidden], [hidden], and [hidden] in a stale transcript.",
      },
    ]);
    expect(bodyText).toContain("[hidden]");
    expect(bodyText).not.toContain("metadata");
    expect(bodyText).not.toContain("resumeNarration");
    expect(bodyText).not.toContain("saga-secret-1");
    expect(bodyText).not.toContain("narratorAttemptId");
    expect(bodyText).not.toContain("narrator-attempt-secret-1");
    expect(bodyText).not.toContain("turn-secret-1");
    expect(bodyText).not.toContain("tool-result-secret");
    expect(bodyText).not.toContain("authority");
    expect(bodyText).not.toContain("actor_hidden");
    expect(bodyText).not.toContain("tool_result_8");
    expect(bodyText).not.toContain("source:event-1");
    expect(bodyText).not.toContain("response-visible-1");
    expect(bodyText).not.toContain("effect_hidden");
    expect(bodyText).not.toContain("01890f9a");
  });

  it("reports live turn snapshot availability in history after a successful action", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshotCampaignId = "campaign-snapshot";

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedGetPremise.mockReturnValue("A dark fantasy world.");
    chatHistoryByCampaign.set(snapshotCampaignId, [
      { role: "user", content: "Look around." },
      { role: "assistant", content: "You see a forest." },
    ] as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(({ campaignId, playerAction }) => {
      mockedAppendChatMessages(campaignId, [
        { role: "user", content: playerAction },
        { role: "assistant", content: "The action resolves." },
      ] as any);
      return createTurnStream([{ type: "done", data: { tick: 1 } }]);
    });

    const actionRes = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: snapshotCampaignId,
        playerAction: "Look around",
        intent: "Look around",
        method: "",
      }),
    });
    expect(actionRes.status).toBe(200);
    await actionRes.text();

    const historyRes = await app.request(`/chat/history?campaignId=${snapshotCampaignId}`);
    expect(historyRes.status).toBe(200);
    const body = await historyRes.json();
    expect(body.hasLiveTurnSnapshot).toBe(true);
  });

  it("records post-turn world simulation as proposals before done without direct detached mutations", async () => {
    setupStoryteller();
    setupDbMock();
    const orderedCalls: string[] = [];

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedQueuePostTurnSimulationProposals.mockImplementation(() => {
      orderedCalls.push("queuePostTurnSimulationProposals");
      return {
        campaignId: CAMPAIGN_ID,
        baseWorldVersion: 7,
        worldTimeMinutes: 11,
        queued: [
          {
            proposalId: "proposal-1",
            campaignId: CAMPAIGN_ID,
            proposalType: "npc_reflection_updates",
            baseWorldVersion: 7,
            writeScopes: ["npc:memory"],
            status: "pending",
          },
        ],
      } as any;
    });
    mockedProcessTurn.mockImplementation(({ onPostTurn }) =>
      (async function* () {
        yield { type: "oracle_result", data: { outcome: "strong_hit" } } as any;
        yield { type: "scene-settling", data: { phase: "local-present-scene" } } as any;
        orderedCalls.push("finalizing_turn");
        yield { type: "finalizing_turn", data: { stage: "rollback_critical" } } as any;
        await onPostTurn?.({
          tick: 2,
          toolCalls: [],
        } as any);
        orderedCalls.push("done");
        yield { type: "done", data: { tick: 2 } } as any;
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Press Greta about the raiders",
        intent: "Press Greta about the raiders",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: finalizing_turn");
    expect(body).toContain("event: done");
    expect(body.indexOf("event: finalizing_turn")).toBeLessThan(body.indexOf("event: done"));
    expect(orderedCalls.indexOf("done")).toBeGreaterThan(orderedCalls.indexOf("finalizing_turn"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(orderedCalls).toEqual([
      "finalizing_turn",
      "queuePostTurnSimulationProposals",
      "done",
    ]);
    expect(mockedQueuePostTurnSimulationProposals).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        tick: 2,
        playerLocationId: "loc-001",
        playerSceneScopeId: "loc-001",
      }),
    );
    expect(mockedSimulateOffscreenNpcs).not.toHaveBeenCalled();
    expect(mockedCheckAndTriggerReflections).not.toHaveBeenCalled();
    expect(mockedTickFactions).not.toHaveBeenCalled();
    expect(mockedTickPresentNpcs).not.toHaveBeenCalled();
  });

  it("does not inject a pre-visible scene scope settlement callback into action turns", async () => {
    setupStoryteller();
    setupDbMock();

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    let processTurnOptions: Parameters<typeof processTurn>[0] | null = null;
    mockedProcessTurn.mockImplementation((options) => {
      processTurnOptions = options;
      return (
      (async function* () {
        yield { type: "scene-settling", data: { phase: "local-present-scene" } } as any;
        yield { type: "done", data: { tick: 2 } } as any;
      })()
      );
    });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Hold the platform",
        intent: "Hold the platform",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(processTurnOptions).toEqual(
      expect.objectContaining({
        onPostTurn: expect.any(Function),
      }),
    );
    expect(processTurnOptions).not.toHaveProperty("onBeforeVisibleNarration");
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(mockedTickPresentNpcs).not.toHaveBeenCalled();
  });

  it("drains queued committed events for non-log_event writers after reflection finalization", async () => {
    setupStoryteller();
    setupDbMock();
    const orderedCalls: string[] = [];

    mockedLoadSettings.mockReturnValue({
      judge: { providerId: "p1", model: "judge-model", temperature: 0.1, maxTokens: 1024 },
      storyteller: { providerId: "p1", model: "st-model", temperature: 0.7, maxTokens: 2048 },
      embedder: { providerId: "p1", model: "embed-model", temperature: 0.1, maxTokens: 256 },
      providers: [{ id: "p1", name: "P1", baseUrl: "http://localhost:1234", apiKey: "", defaultModel: "m", isBuiltin: false }],
      ui: { showRawReasoning: false },
    } as any);
    mockedResolveRole.mockReturnValue({
      provider: { baseUrl: "http://localhost:1234", apiKey: "", model: "embed-model" },
      temperature: 0.1,
      maxTokens: 256,
    } as any);

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedQueuePostTurnSimulationProposals.mockImplementation(() => {
      orderedCalls.push("queuePostTurnSimulationProposals");
      return {
        campaignId: CAMPAIGN_ID,
        baseWorldVersion: 0,
        worldTimeMinutes: 0,
        queued: [],
      } as any;
    });
    mockDrainPendingCommittedEventsByIds.mockReturnValue([
      {
        id: "evt-speak",
        text: 'Greta the Merchant said to player: "Keep your voice down."',
        tick: 2,
        location: "Market Square",
        participants: ["Greta the Merchant", "player"],
        importance: 3,
        type: "dialogue",
      },
      {
        id: "evt-offscreen",
        text: "[Off-screen] Greta the Merchant: bribed the watch captain",
        tick: 2,
        location: "Harbor Watch",
        participants: ["Greta the Merchant"],
        importance: 3,
        type: "npc_offscreen",
      },
    ]);
    mockedProcessTurn.mockImplementation(({ onPostTurn }) =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "local-present-scene" } } as any;
        yield { type: "finalizing_turn", data: { stage: "rollback_critical" } } as any;
        await onPostTurn?.({
          tick: 2,
          toolCalls: [],
          acceptedDurableEventIds: ["evt-speak", "evt-offscreen"],
          producedDurableEventIds: ["evt-speak", "evt-offscreen"],
        } as any);
        yield {
          type: "done",
          data: {
            tick: 2,
            acceptedDurableEventIds: ["evt-speak", "evt-offscreen"],
            producedDurableEventIds: ["evt-speak", "evt-offscreen"],
          },
        } as any;
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Ask Greta what changed",
        intent: "Ask Greta what changed",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(orderedCalls).toEqual(["queuePostTurnSimulationProposals"]);
    expect(mockedSimulateOffscreenNpcs).not.toHaveBeenCalled();
    expect(mockedCheckAndTriggerReflections).not.toHaveBeenCalled();
    expect(mockedTickFactions).not.toHaveBeenCalled();
    expect(mockedTickPresentNpcs).not.toHaveBeenCalled();
    expect(mockDrainPendingCommittedEventsByIds).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      ["evt-speak", "evt-offscreen"],
    );
    expect(mockEmbedAndUpdateEvent).toHaveBeenCalledTimes(2);
    expect(mockEmbedAndUpdateEvent).toHaveBeenNthCalledWith(
      1,
      "evt-speak",
      'Greta the Merchant said to player: "Keep your voice down."',
      expect.objectContaining({ model: expect.any(String) }),
    );
    expect(mockEmbedAndUpdateEvent).toHaveBeenNthCalledWith(
      2,
      "evt-offscreen",
      "[Off-screen] Greta the Merchant: bribed the watch captain",
      expect.objectContaining({ model: expect.any(String) }),
    );
  });

  it("keeps undo snapshots isolated by campaignId", async () => {
    setupStoryteller();
    setupDbMock();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockImplementation((campaignId) => ({
      campaignId,
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    }) as any);
    mockedProcessTurn.mockImplementation(({ campaignId, playerAction }) => {
      mockedAppendChatMessages(campaignId, [
        { role: "user", content: playerAction },
        { role: "assistant", content: `Resolved ${playerAction}` },
      ] as any);
      return createTurnStream([{ type: "done", data: { tick: 1, campaignId } }]);
    });
    mockedGetLastPlayerAction.mockImplementation((campaignId) => `retry-${campaignId}`);
    mockedPopLastMessages.mockReturnValue([] as any);

    const actionA = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-a",
        playerAction: "Action A",
        intent: "Action A",
        method: "",
      }),
    });
    expect(actionA.status).toBe(200);
    await actionA.text();

    const actionB = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-b",
        playerAction: "Action B",
        intent: "Action B",
        method: "",
      }),
    });
    expect(actionB.status).toBe(200);
    await actionB.text();

    const undoA = await app.request("/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: "campaign-a" }),
    });

    expect(undoA.status).toBe(200);
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(
      "campaign-a",
      expect.objectContaining({ campaignId: "campaign-a" }),
    );
    expect(mockedRestoreSnapshot).not.toHaveBeenCalledWith(
      "campaign-a",
      expect.objectContaining({ campaignId: "campaign-b" }),
    );
  });

  it("D-02/D-03 emits error and restores the authoritative bundle when /chat/action finalization fails", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = { bundleId: "turn-boundary-action" } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "oracle_result", data: { outcome: "strong_hit" } } as any;
        yield { type: "finalizing_turn", data: { stage: "rollback_critical" } } as any;
        throw new Error("rollback-critical finalization failed");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Strike now",
        intent: "Strike now",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: finalizing_turn");
    expect(body).toContain("event: error");
    expect(body).not.toContain("event: done");
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);

    const historyRes = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);
    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.hasLiveTurnSnapshot).toBe(false);
  });

  it("rejects a new /chat/action while pending narration must be resumed separately", async () => {
    setupStoryteller();
    const pendingSaga = {
      id: "saga-pending-action",
      turnId: "turn-pending-action",
      status: "resolved_pending_narration",
    } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga);

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Start a new action",
        intent: "Start a new action",
        method: "",
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      pendingNarration: true,
      resumable: true,
      recoveryState: "resume_ready",
    });
    expect(body).not.toHaveProperty("status");
    expect(body.error).toContain("Resume it before sending a new action");
    expect(mockedResumePendingTurnNarration).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedCaptureSnapshot).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockedAppendChatMessages).not.toHaveBeenCalled();
  });

  it("does not restore paid resolution when narrator repair is exhausted after settled packet", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = { bundleId: "pre-paid-resolution" } as any;
    const pendingSaga = {
      id: "saga-repair-pending",
      turnId: "turn-repair-pending",
      status: "narrator_repairing",
    } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedFindPendingNarrationSaga
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(pendingSaga);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        {
          type: "narrative",
          data: { text: "The pending narration resumes with actor_hidden and tool_result_8." },
        },
        { type: "done", data: { tick: 3, resumed: true } },
      ]) as any,
    );
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "final-narration" } } as any;
        throw new NarrationRepairExhaustedError("Visible narration needs repair.");
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Force the gate",
        intent: "Force the gate",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: scene-settling");
    expect(body).toContain("event: narrative");
    expect(body).toContain("The pending narration resumes");
    expect(body).not.toContain("actor_hidden");
    expect(body).not.toContain("tool_result_8");
    expect(body).toContain("event: done");
    expect(body).toContain("\"resumed\":true");
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });

  it("does not restore paid resolution when a generic post-settled error leaves pending narration", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = { bundleId: "pre-paid-generic-error" } as any;
    const pendingSaga = {
      id: "saga-generic-pending",
      turnId: "turn-generic-pending",
      status: "resolved_pending_narration",
    } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedFindPendingNarrationSaga
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(pendingSaga);
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "final-narration" } } as any;
        throw new Error("post-settled narrator tail failed");
      })(),
    );
    mockedResumePendingTurnNarration.mockImplementation(() => {
      const error = new Error("worker owns pending narration");
      error.name = "TurnSagaLockConflictError";
      throw error;
    });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Force the gate",
        intent: "Force the gate",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: error");
    expect(body).toContain("\"pendingNarration\":true");
    expect(body).toContain("\"resumable\":true");
    expect(body).toContain("\"recoveryState\":\"resume_ready\"");
    expect(body).not.toContain("resolved_pending_narration");
    expect(body).not.toContain("turn-generic-pending");
    expect(body).not.toContain("saga-generic-pending");
    expect(mockedResumePendingTurnNarration).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "turn-generic-pending",
      }),
    );
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });

  it("does not restore v2 settled packet state when gameplay-cycle-v2 narration is pending retry", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = { bundleId: "pre-v2-pending-narration" } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedFindPendingNarrationSaga.mockReturnValue(null);
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "gameplay-cycle-v2" } } as any;
        throw new GameplayCycleV2PendingNarrationError({
          packetId: "v2packet-test-pending",
          campaignId: CAMPAIGN_ID,
          turnId: "v2turn-test-pending",
          cause: new Error("storyteller transport failed"),
        });
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Walk north",
        intent: "Walk north",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: scene-settling");
    expect(body).toContain("event: error");
    expect(body).toContain("\"pendingNarration\":true");
    expect(body).toContain("\"runtime\":\"gameplay-cycle-v2\"");
    expect(body).toContain("\"packetId\":\"v2packet-test-pending\"");
    expect(body).toContain("\"turnId\":\"v2turn-test-pending\"");
    expect(body).toContain("\"resumable\":true");
    expect(body).toContain("\"recoveryState\":\"resume_ready\"");
    expect(body).toContain("\"resumeToken\":\"resume_v2_deadbeefcafef00d\"");
    expect(mockedResumePendingTurnNarration).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });

  it("does not restore finalized paid state when /chat/action final done write fails", async () => {
    setupStoryteller();
    setupDbMock();
    const snapshot = { bundleId: "pre-finalized-done-action" } as any;
    let paidState = "pre-turn";

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot.mockReturnValue(snapshot);
    mockedRestoreSnapshot.mockImplementation(() => {
      paidState = "rolled-back";
      return undefined as any;
    });
    mockedBuildDoneBoundaryData.mockImplementation(() => {
      throw new Error("final done write failed");
    });
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "narrative", data: { text: "The paid result is already committed." } } as any;
        paidState = "finalized";
        yield { type: "done", data: { tick: 2 } } as any;
      })(),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Commit the costly turn",
        intent: "Commit the costly turn",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: narrative");
    expect(body).toContain("event: error");
    expect(body).toContain("\"settled\":true");
    expect(body).not.toContain("event: done");
    expect(mockedProcessTurn).toHaveBeenCalledTimes(1);
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(paidState).toBe("finalized");
  });

  it("D-04/D-05 restores the same bundle before and after a failed /chat/retry replay", async () => {
    setupStoryteller();
    setupDbMock();
    const previousSnapshot = { bundleId: "turn-boundary-retry" } as any;
    const freshSnapshot = { bundleId: "turn-boundary-retry-fresh" } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedCaptureSnapshot
      .mockReturnValueOnce(previousSnapshot)
      .mockReturnValueOnce(freshSnapshot);
    mockedGetLastPlayerAction.mockReturnValue("Retry the swing");
    mockedPopLastMessages.mockReturnValue([] as any);
    mockedProcessTurn
      .mockImplementationOnce(({ campaignId, playerAction }) => {
        mockedAppendChatMessages(campaignId, [
          { role: "user", content: playerAction },
          { role: "assistant", content: "The swing lands." },
        ] as any);
        return createTurnStream([{ type: "done", data: { tick: 1 } }]);
      })
      .mockImplementationOnce(
        () =>
          (async function* () {
            yield { type: "finalizing_turn", data: { stage: "rollback_critical" } } as any;
            throw new Error("reflection finalization timed out");
          })(),
      );

    const actionRes = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Retry the swing",
        intent: "Retry the swing",
        method: "",
      }),
    });
    expect(actionRes.status).toBe(200);
    await actionRes.text();

    const retryRes = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(retryRes.status).toBe(200);
    const retryBody = await retryRes.text();
    expect(retryBody).toContain("event: finalizing_turn");
    expect(retryBody).toContain("event: error");
    expect(retryBody).not.toContain("event: done");
    expect(mockedRestoreSnapshot).toHaveBeenNthCalledWith(1, CAMPAIGN_ID, previousSnapshot);
    expect(mockedRestoreSnapshot).toHaveBeenNthCalledWith(2, CAMPAIGN_ID, previousSnapshot);

    const historyRes = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);
    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.hasLiveTurnSnapshot).toBe(false);
  });

  it("does not restore finalized paid state again when /chat/retry final done write fails", async () => {
    setupStoryteller();
    setupDbMock();
    const previousSnapshot = { bundleId: "pre-finalized-done-retry" } as any;
    let restoreCount = 0;
    let paidState = "previous-turn";

    runtimeSnapshots.set(CAMPAIGN_ID, previousSnapshot);
    chatHistoryByCampaign.set(CAMPAIGN_ID, [
      { role: "user", content: "Retry the costly turn" },
      { role: "assistant", content: "The costly turn resolved once." },
    ] as any);
    runtimeSnapshotMetadata.set(CAMPAIGN_ID, {
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
      playerAction: "Retry the costly turn",
      chatHistoryLengthBeforeTurn: 0,
      chatHistoryLengthAfterTurn: 2,
    });
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedGetLastPlayerAction.mockReturnValue("Retry the costly turn");
    mockedRestoreSnapshot.mockImplementation(() => {
      restoreCount += 1;
      paidState = restoreCount === 1 ? "retry-start-restored" : "rolled-back-after-done";
      return undefined as any;
    });
    mockedBuildDoneBoundaryData.mockImplementation(() => {
      throw new Error("retry final done write failed");
    });
    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "narrative", data: { text: "The retry result is committed." } } as any;
        paidState = "retry-finalized";
        yield { type: "done", data: { tick: 3 } } as any;
      })(),
    );

    const res = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("event: narrative");
    expect(body).toContain("event: error");
    expect(body).toContain("\"settled\":true");
    expect(body).not.toContain("event: done");
    expect(mockedProcessTurn).toHaveBeenCalledTimes(1);
    expect(mockedRestoreSnapshot).toHaveBeenCalledTimes(1);
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, previousSnapshot);
    expect(paidState).toBe("retry-finalized");
  });

  it("rejects /chat/retry while pending narration has a separate resume owner", async () => {
    setupStoryteller();
    const pendingSaga = {
      id: "saga-pending-retry",
      turnId: "turn-pending-retry",
      status: "resolved_pending_narration",
    } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga);

    const res = await app.request("/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toMatchObject({
      pendingNarration: true,
      resumable: true,
      recoveryState: "resume_ready",
    });
    expect(body).not.toHaveProperty("status");
    expect(body.error).toContain("Resume it before retrying");
    expect(mockedResumePendingTurnNarration).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockedGetLastPlayerAction).not.toHaveBeenCalled();
  });

  it("streams existing pending narration only through /chat/resume", async () => {
    setupStoryteller();
    setupDbMock();
    const pendingSaga = {
      id: "saga-pending-resume",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-pending-resume",
      status: "resolved_pending_narration",
      settledTurnPacketId: null,
    } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga);
    mockGetTurnSaga.mockReturnValue(pendingSaga);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        {
          type: "narrative",
          data: { text: "Resume finishes pending narration from route_hidden_path." },
        },
        { type: "done", data: { tick: 4, resumed: true } },
      ]) as any,
    );

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, resumeToken: "resume_deadbeefcafef00d" }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Resume finishes pending narration from [hidden].");
    expect(body).not.toContain("route_hidden_path");
    expect(mockedResumePendingTurnNarration).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "turn-pending-resume",
      }),
    );
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockedGetLastPlayerAction).not.toHaveBeenCalled();
    expect(mockedQueuePostTurnSimulationProposals).not.toHaveBeenCalled();
  });

  it("streams gameplay-cycle-v2 pending narration through /chat/resume without legacy saga resume", async () => {
    setupStoryteller();
    setupDbMock();
    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedFindPendingNarrationSaga.mockReturnValue(null);
    mockedFindLatestGameplayCycleV2PendingNarrationPacket.mockReturnValue({
      packetId: "v2packet-resume",
      campaignId: CAMPAIGN_ID,
      turnId: "v2turn-resume",
      status: "resolved_pending_narration",
      narratorAttemptStatus: "failed_pending_retry",
    } as any);
    mockedResumeGameplayCycleV2PendingNarration.mockImplementation(() =>
      createTurnStream([
        {
          type: "narrative",
          data: { text: "The v2 settled narration resumes." },
        },
        {
          type: "done",
          data: {
            tick: 5,
            runtime: "gameplay-cycle-v2",
            packetId: "v2packet-resume",
          },
        },
      ]) as any,
    );

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, resumeToken: "resume_v2_deadbeefcafef00d" }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("The v2 settled narration resumes.");
    expect(body).toContain("\"runtime\":\"gameplay-cycle-v2\"");
    expect(body).toContain("\"packetId\":\"v2packet-resume\"");
    expect(mockedResumeGameplayCycleV2PendingNarration).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        packetId: "v2packet-resume",
      }),
    );
    expect(mockedResumePendingTurnNarration).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });

  it("routes pre-turn snapshot recovery through /chat/resume for pre-settled crash states", async () => {
    setupStoryteller();
    setupDbMock();
    const pendingSaga = {
      id: "saga-snapshot-resume",
      campaignId: CAMPAIGN_ID,
      turnId: "turn-snapshot-resume",
      status: "world_consequence_running",
      settledTurnPacketId: null,
    } as any;

    mockedGetActive.mockReturnValue(null as any);
    mockedLoadCampaign.mockImplementation(async (campaignId) => ({
      id: campaignId,
      name: `Campaign ${campaignId}`,
      createdAt: "2026-01-01",
    }) as any);
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga);
    mockHasTurnSagaSnapshotRecovery.mockReturnValue(true);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        {
          type: "error",
          data: {
            error: "Turn recovery restored the pre-turn boundary. Please try the action again.",
            pendingNarration: false,
            restored: true,
            retryable: true,
            recoveryState: "pre_turn_snapshot_restored",
          },
        },
      ]) as any,
    );

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID, resumeToken: "resume_deadbeefcafef00d" }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("pre_turn_snapshot_restored");
    expect(body).not.toContain("saga-snapshot-resume");
    expect(body).not.toContain("turn-snapshot-resume");
    expect(mockedResumePendingTurnNarration).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "turn-snapshot-resume",
      }),
    );
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// POST /chat
// ---------------------------------------------------------------------------
describe("POST /chat", () => {
  it("returns 410 Gone and never reaches the legacy storyteller bypass", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "I open the door." }),
    });

    expect(res.status).toBe(410);
    expect(mockedCallStoryteller).not.toHaveBeenCalled();
    expect(mockedAppendChatMessages).not.toHaveBeenCalled();
  });

  it("hard-fails before body validation or campaign lookup", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(410);
    expect(mockedGetActive).not.toHaveBeenCalled();
    expect(mockedCallStoryteller).not.toHaveBeenCalled();
  });
});
