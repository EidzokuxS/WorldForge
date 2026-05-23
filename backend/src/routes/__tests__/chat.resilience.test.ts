import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

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
  readCampaignConfig: vi.fn(() => ({
    name: "Phase 89",
    premise: "Runtime resilience route test.",
    createdAt: 0,
    currentTick: 0,
  })),
}));

vi.mock("../../lib/index.js", () => ({
  clamp: vi.fn((value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max),
  ),
  getErrorMessage: vi.fn((error: unknown, fallback: string) =>
    error instanceof Error && error.message ? error.message : fallback,
  ),
  getPlayerSafeErrorMessage: vi.fn((_error: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
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
  sha256Prefix: vi.fn(() => "phase89deadbeef"),
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
const mockHasPreparedSettledTurnPacketRecovery = vi.fn((_input?: unknown) => false);
const mockGetTurnSaga = vi.fn((_input?: unknown) => null);
const mockFindAbandonedPreSettledTurnSaga = vi.fn(
  (_input?: unknown): TurnSagaRecord | null => null,
);
const mockRecordAbandonedTurnRollback = vi.fn(
  (_input?: unknown): unknown => undefined,
);

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  resumePendingTurnNarration: vi.fn(),
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  findPendingNarrationSaga: vi.fn(() => null),
  findAbandonedPreSettledTurnSaga: (input: unknown) =>
    mockFindAbandonedPreSettledTurnSaga(input),
  getSettledTurnPacket: (input: unknown) => mockGetSettledTurnPacket(input),
  hasPreparedSettledTurnPacketRecovery: (input: unknown) =>
    mockHasPreparedSettledTurnPacketRecovery(input),
  getTurnSaga: (input: unknown) => mockGetTurnSaga(input),
  recordAbandonedTurnRollback: (input: unknown) =>
    mockRecordAbandonedTurnRollback(input),
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
  queuePostTurnSimulationProposals: vi.fn(),
  buildDoneBoundaryData: vi.fn((_campaignId: string, data: unknown) => ({
    ...(data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : { value: data }),
    worldVersion: 0,
    worldTimeMinutes: 0,
  })),
}));

vi.mock("../../engine/grounded-lookup.js", () => ({
  runGroundedLookup: vi.fn(),
}));

const mockEmbedAndUpdateEvent = vi.fn();
const mockDrainPendingCommittedEvents = vi.fn((..._args: unknown[]) => []);
const mockDrainPendingCommittedEventsByIds = vi.fn((..._args: unknown[]) => []);
const mockReadTurnDurableEventIds = vi.fn(
  (..._args: unknown[]): string[] => [],
);
const mockRetractStoredEpisodicEvent = vi.fn();
const mockRetractPendingCommittedEventsForTick = vi.fn();
vi.mock("../../vectors/episodic-events.js", () => ({
  embedAndUpdateEvent: (...args: unknown[]) => mockEmbedAndUpdateEvent(...args),
  drainPendingCommittedEvents: (...args: unknown[]) => mockDrainPendingCommittedEvents(...args),
  drainPendingCommittedEventsByIds: (...args: unknown[]) =>
    mockDrainPendingCommittedEventsByIds(...args),
  isDurableEventProjectionAllowed: vi.fn(() => true),
  readTurnDurableEventIds: (...args: unknown[]) => mockReadTurnDurableEventIds(...args),
  retractStoredEpisodicEvent: (...args: unknown[]) => mockRetractStoredEpisodicEvent(...args),
  retractPendingCommittedEventsForTick: (...args: unknown[]) =>
    mockRetractPendingCommittedEventsForTick(...args),
}));

const runtimeSnapshots = new Map<string, unknown>();
const runtimeSnapshotMetadata = new Map<string, {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
  playerAction: string | null;
  chatHistoryLengthBeforeTurn: number | null;
  chatHistoryLengthAfterTurn: number | null;
}>();
const runtimeActiveTurns = new Set<string>();
const runtimePendingRollbackIntents = new Map<string, unknown>();

vi.mock("../../campaign/runtime-state.js", () => ({
  assertActiveTurnLease: vi.fn(),
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
  setPendingRollbackIntent: (input: { campaignId: string }) => {
    runtimePendingRollbackIntents.set(input.campaignId, input);
  },
  getPendingRollbackIntent: (campaignId: string) => {
    const pending = runtimePendingRollbackIntents.get(campaignId);
    if (pending instanceof Error) throw pending;
    return pending ?? null;
  },
  clearPendingRollbackIntent: (campaignId: string) => {
    runtimePendingRollbackIntents.delete(campaignId);
  },
  clearCampaignRuntimeState: (campaignId: string) => {
    runtimeActiveTurns.delete(campaignId);
    runtimeSnapshots.delete(campaignId);
    runtimeSnapshotMetadata.delete(campaignId);
    runtimePendingRollbackIntents.delete(campaignId);
  },
}));

vi.mock("../../images/index.js", () => ({
  generateImage: vi.fn(),
  resolveImageProvider: vi.fn(() => null),
  buildScenePrompt: vi.fn(() => "scene prompt"),
  buildLocationPrompt: vi.fn(() => "location prompt"),
  ensureImageDir: vi.fn(),
  cacheImage: vi.fn(),
  imageExists: vi.fn(() => false),
}));

import { resolveRoleModel } from "../../ai/index.js";
import {
  getActiveCampaign,
  getCampaignPremise,
  getChatHistory,
  loadCampaign,
} from "../../campaign/index.js";
import { loadSettings } from "../../settings/index.js";
import {
  buildDoneBoundaryData,
  captureSnapshot,
  findPendingNarrationSaga,
  PendingNarrationError,
    processTurn,
    processOpeningScene,
    resumePendingTurnNarration,
    restoreSnapshot,
    type TurnSagaRecord,
} from "../../engine/index.js";
import chatRoutes from "../chat.js";

const app = new Hono();
app.route("/chat", chatRoutes);

const CAMPAIGN_ID = "phase-89-chat-resilience";

function mockPendingSaga(overrides: Partial<TurnSagaRecord> = {}): TurnSagaRecord {
  return {
    id: "saga-pending",
    campaignId: CAMPAIGN_ID,
    turnId: "turn-pending",
    playerId: null,
    actionId: null,
    actionText: null,
    sourceAction: null,
    status: "resolved_pending_narration",
    statusReason: null,
    statusUpdatedAt: 1,
    activeLockToken: null,
    activeWorkerId: null,
    activeStartedAt: null,
    requiresNarration: true,
    baseWorldVersion: 0,
    resultWorldVersion: 1,
    oracleDecisionId: null,
    settledTurnPacketId: null,
    latestNarratorAttemptId: null,
    provenance: {},
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

const mockedGetActive = vi.mocked(getActiveCampaign);
const mockedGetPremise = vi.mocked(getCampaignPremise);
const mockedGetHistory = vi.mocked(getChatHistory);
const mockedLoadCampaign = vi.mocked(loadCampaign);
const mockedLoadSettings = vi.mocked(loadSettings);
const mockedResolveRole = vi.mocked(resolveRoleModel);
const mockedProcessTurn = vi.mocked(processTurn);
const mockedProcessOpeningScene = vi.mocked(processOpeningScene);
const mockedResumePendingTurnNarration = vi.mocked(resumePendingTurnNarration);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedRestoreSnapshot = vi.mocked(restoreSnapshot);
const mockedFindPendingNarrationSaga = vi.mocked(findPendingNarrationSaga);
const mockedBuildDoneBoundaryData = vi.mocked(buildDoneBoundaryData);

async function* createTurnStream(events: Array<{ type: string; data: unknown }>) {
  for (const event of events) {
    yield event as never;
  }
}

async function* createThrowingTurnStream(
  events: Array<{ type: string; data: unknown }>,
  error: Error,
) {
  for (const event of events) {
    yield event as never;
  }
  throw error;
}

function sseEventNames(body: string): string[] {
  return Array.from(body.matchAll(/^event: ([^\r\n]+)/gm), (match) => match[1]);
}

function setupStoryteller() {
  mockedLoadSettings.mockReturnValue({
    judge: { providerId: "p1", model: "judge-model", temperature: 0.1, maxTokens: 1024 },
    storyteller: { providerId: "p1", model: "storyteller-model", temperature: 0.7, maxTokens: 2048 },
    embedder: { providerId: "", model: "", temperature: 0.1, maxTokens: 256 },
    providers: [
      {
        id: "p1",
        name: "Local",
        baseUrl: "http://localhost:1234",
        apiKey: "",
        defaultModel: "local-model",
        isBuiltin: false,
      },
    ],
    images: { providerId: "", model: "", stylePrompt: "" },
    ui: { showRawReasoning: false },
  } as never);

  mockedResolveRole.mockImplementation((roleConfig, providers) => {
    const provider = providers.find((candidate) => candidate.id === roleConfig.providerId)
      ?? providers[0]
      ?? {
        id: "p1",
        name: "Local",
        baseUrl: "http://localhost:1234",
        apiKey: "",
        defaultModel: "local-model",
        isBuiltin: false,
      };
    return {
      provider: {
        ...provider,
        model: roleConfig.model ?? provider.defaultModel,
      },
      temperature: roleConfig.temperature,
      maxTokens: roleConfig.maxTokens,
    };
  });
}

function setupLoadedCampaign() {
  mockedGetActive.mockReturnValue(null as never);
  mockedLoadCampaign.mockImplementation(async (campaignId) => ({
    id: campaignId,
    name: `Campaign ${campaignId}`,
    createdAt: "2026-01-01",
  }) as never);
  mockedGetPremise.mockReturnValue("A closeout runtime resilience scenario.");
  mockedGetHistory.mockReturnValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeSnapshots.clear();
  runtimeSnapshotMetadata.clear();
  runtimeActiveTurns.clear();
  runtimePendingRollbackIntents.clear();
  mockDrainPendingCommittedEvents.mockReturnValue([]);
  mockDrainPendingCommittedEventsByIds.mockReturnValue([]);
  mockReadTurnDurableEventIds.mockReturnValue([]);
  mockGetSettledTurnPacket.mockReturnValue(null);
  mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(false);
  mockFindAbandonedPreSettledTurnSaga.mockReturnValue(null);
  mockRecordAbandonedTurnRollback.mockReturnValue(undefined);
  mockedFindPendingNarrationSaga.mockReturnValue(null);
  mockGetTurnSaga.mockReturnValue(null);
  mockedCaptureSnapshot.mockReturnValue({
    campaignId: CAMPAIGN_ID,
    bundleDir: "phase-89-snapshot",
    capturedAt: 1,
  } as never);
  mockedBuildDoneBoundaryData.mockImplementation((_campaignId: string, data: unknown) => ({
    ...(data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, unknown>
      : { value: data }),
    worldVersion: 0,
    worldTimeMinutes: 0,
  }) as never);
  setupStoryteller();
  setupLoadedCampaign();
});

describe("Phase 89 chat route resilience", () => {
  it("recovers a persisted pending rollback intent before starting new work", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-pending-rollback",
      bundleDir: "snapshots/snapshot-pending-rollback",
      capturedAt: 77,
      capturedWorldVersion: 12,
      capturedWorldTimeMinutes: 240,
    };
    const orderedCalls: string[] = [];
    runtimePendingRollbackIntents.set(CAMPAIGN_ID, {
      version: 1,
      campaignId: CAMPAIGN_ID,
      route: "/action",
      snapshot,
      turnId: "turn-pending-rollback",
      eventIds: [],
      createdAt: 1,
    });
    mockReadTurnDurableEventIds.mockImplementation(() => {
      orderedCalls.push("readTurnDurableEventIds");
      return ["evt-pending-rollback"];
    });
    mockedRestoreSnapshot.mockImplementation(() => {
      orderedCalls.push("restoreSnapshot");
      return undefined as never;
    });
    mockRetractStoredEpisodicEvent.mockImplementation(() => {
      orderedCalls.push("retractStoredEpisodicEvent");
      return undefined;
    });
    mockedProcessTurn.mockImplementation(() => {
      orderedCalls.push("processTurn");
      return createTurnStream([{ type: "done", data: { tick: 9 } }]) as never;
    });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Continue after rollback crash",
        intent: "Continue after rollback crash",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockReadTurnDurableEventIds).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "turn-pending-rollback",
    );
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
    expect(mockRetractStoredEpisodicEvent).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      eventId: "evt-pending-rollback",
    });
    expect(runtimePendingRollbackIntents.has(CAMPAIGN_ID)).toBe(false);
    expect(orderedCalls).toEqual([
      "readTurnDurableEventIds",
      "restoreSnapshot",
      "retractStoredEpisodicEvent",
      "processTurn",
    ]);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("blocks route work when persisted rollback intent is malformed", async () => {
    runtimePendingRollbackIntents.set(
      CAMPAIGN_ID,
      new Error("Pending rollback intent for campaign phase-89-chat-resilience is malformed."),
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Try to continue through malformed rollback.",
        intent: "Try to continue through malformed rollback.",
        method: "",
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Action request failed.");
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockRetractStoredEpisodicEvent).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(runtimePendingRollbackIntents.has(CAMPAIGN_ID)).toBe(true);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("recovers a persisted pending rollback intent before explicit resume work", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-before-resume-rollback",
      bundleDir: "snapshots/snapshot-before-resume-rollback",
      capturedAt: 88,
      capturedWorldVersion: 14,
      capturedWorldTimeMinutes: 260,
    };
    const pendingSaga = mockPendingSaga({
      id: "saga-resume-after-rollback",
      turnId: "turn-resume-after-rollback",
      actionText: "Finish the recovered narration.",
    });
    const orderedCalls: string[] = [];
    runtimePendingRollbackIntents.set(CAMPAIGN_ID, {
      version: 1,
      campaignId: CAMPAIGN_ID,
      route: "/action",
      snapshot,
      turnId: "turn-crashed-before-retraction",
      eventIds: [],
      createdAt: 1,
    });
    mockReadTurnDurableEventIds.mockImplementation(() => {
      orderedCalls.push("readTurnDurableEventIds");
      return ["evt-resume-rollback"];
    });
    mockedRestoreSnapshot.mockImplementation(() => {
      orderedCalls.push("restoreSnapshot");
      return undefined as never;
    });
    mockRetractStoredEpisodicEvent.mockImplementation(() => {
      orderedCalls.push("retractStoredEpisodicEvent");
      return undefined;
    });
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetTurnSaga.mockReturnValue(pendingSaga as never);
    mockedResumePendingTurnNarration.mockImplementation(() => {
      orderedCalls.push("resumePendingTurnNarration");
      return createTurnStream([
        { type: "narrative", data: { text: "Recovered narration resumes." } },
        { type: "done", data: { tick: 9, resumed: true } },
      ]) as never;
    });

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        resumeToken: "resume_phase89deadbeef",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Recovered narration resumes.");
    expect(mockReadTurnDurableEventIds).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "turn-crashed-before-retraction",
    );
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(CAMPAIGN_ID, snapshot);
    expect(mockRetractStoredEpisodicEvent).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      eventId: "evt-resume-rollback",
    });
    expect(runtimePendingRollbackIntents.has(CAMPAIGN_ID)).toBe(false);
    expect(orderedCalls).toEqual([
      "readTurnDurableEventIds",
      "restoreSnapshot",
      "retractStoredEpisodicEvent",
      "resumePendingTurnNarration",
    ]);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("blocks explicit resume work when persisted rollback intent is malformed", async () => {
    runtimePendingRollbackIntents.set(
      CAMPAIGN_ID,
      new Error("Pending rollback intent for campaign phase-89-chat-resilience is malformed."),
    );

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        resumeToken: "resume_phase89deadbeef",
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Resume request failed.");
    expect(mockedFindPendingNarrationSaga).not.toHaveBeenCalled();
    expect(mockedResumePendingTurnNarration).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockRetractStoredEpisodicEvent).not.toHaveBeenCalled();
    expect(runtimePendingRollbackIntents.has(CAMPAIGN_ID)).toBe(true);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("rolls back an abandoned pre-settled turn before starting a new action", async () => {
    const preTurnSnapshot = {
      snapshotId: "snapshot-before-abandoned",
      bundleDir: "snapshots/snapshot-before-abandoned",
      capturedAt: 321,
      capturedWorldVersion: 11,
      capturedWorldTimeMinutes: 120,
      fileHashes: {
        stateDb: "state-hash",
        config: "config-hash",
        chatHistory: "chat-hash",
        vectors: "vector-hash",
      },
    };
    const abandonedSaga = mockPendingSaga({
      id: "saga-abandoned-tool-loop",
      turnId: "turn-abandoned-tool-loop",
      status: "tool_loop_running",
      actionText: "Open the sealed docket.",
      provenance: { preTurnSnapshot },
    });
    const orderedCalls: string[] = [];
    mockFindAbandonedPreSettledTurnSaga.mockReturnValue(abandonedSaga);
    mockReadTurnDurableEventIds.mockReturnValue(["evt-abandoned"]);
    mockedRestoreSnapshot.mockImplementation(() => {
      orderedCalls.push("restoreSnapshot");
      return undefined as never;
    });
    mockRetractStoredEpisodicEvent.mockImplementation(() => {
      orderedCalls.push("retractStoredEpisodicEvent");
      return undefined;
    });
    mockRecordAbandonedTurnRollback.mockImplementation(() => {
      orderedCalls.push("recordAbandonedTurnRollback");
      return undefined;
    });
    mockedProcessTurn.mockImplementation(() => {
      orderedCalls.push("processTurn");
      return createTurnStream([{ type: "done", data: { tick: 9 } }]) as never;
    });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Continue after restart",
        intent: "Continue after restart",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockReadTurnDurableEventIds).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "turn-abandoned-tool-loop",
    );
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        snapshotId: "snapshot-before-abandoned",
        fileHashes: expect.objectContaining({ vectors: "vector-hash" }),
      }),
    );
    expect(mockRetractStoredEpisodicEvent).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      eventId: "evt-abandoned",
    });
    expect(mockRecordAbandonedTurnRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        saga: abandonedSaga,
        reason: expect.stringContaining("rolled back"),
      }),
    );
    expect(orderedCalls).toEqual([
      "restoreSnapshot",
      "retractStoredEpisodicEvent",
      "recordAbandonedTurnRollback",
      "processTurn",
    ]);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("blocks a prepared world consequence saga for resume instead of rolling it back", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-prepared-world-consequence",
      turnId: "turn-prepared-world-consequence",
      status: "world_consequence_running",
      settledTurnPacketId: null,
    });
    mockFindAbandonedPreSettledTurnSaga.mockReturnValue(pendingSaga);
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetSettledTurnPacket.mockReturnValue(null);
    mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(true);

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Start another turn",
        intent: "Start another turn",
        method: "",
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        pendingNarration: true,
        resumable: true,
        status: "world_consequence_running",
      }),
    );
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockRetractStoredEpisodicEvent).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("tombstones an abandoned opening saga without requiring a pre-turn snapshot", async () => {
    const openingSaga = mockPendingSaga({
      id: "saga-opening-before-packet",
      turnId: "opening:0:before-packet",
      status: "world_consequence_running",
      actionText: "[opening scene]",
      sourceAction: { kind: "opening_scene", currentTick: 0 },
      provenance: {
        source: "opening_scene",
        authority: "settled_packet",
        recoveryAuthority: "no_mutation_before_settled_packet",
      },
    });
    const orderedCalls: string[] = [];
    mockFindAbandonedPreSettledTurnSaga.mockReturnValue(openingSaga);
    mockReadTurnDurableEventIds.mockReturnValue(["evt-opening-stale"]);
    mockRetractStoredEpisodicEvent.mockImplementation(() => {
      orderedCalls.push("retractStoredEpisodicEvent");
      return undefined;
    });
    mockRecordAbandonedTurnRollback.mockImplementation(() => {
      orderedCalls.push("recordAbandonedTurnRollback");
      return undefined;
    });
    mockedProcessTurn.mockImplementation(() => {
      orderedCalls.push("processTurn");
      return createTurnStream([{ type: "done", data: { tick: 1 } }]) as never;
    });

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Begin after opening restart",
        intent: "Begin after opening restart",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockRetractStoredEpisodicEvent).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      eventId: "evt-opening-stale",
    });
    expect(mockRecordAbandonedTurnRollback).toHaveBeenCalledWith(
      expect.objectContaining({
        saga: openingSaga,
        reason: expect.stringContaining("opening scene"),
      }),
    );
    expect(orderedCalls).toEqual([
      "retractStoredEpisodicEvent",
      "recordAbandonedTurnRollback",
      "processTurn",
    ]);
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("blocks /opening on a resumable prepared opening saga instead of creating another opening", async () => {
    const openingSaga = mockPendingSaga({
      id: "saga-opening-prepared",
      turnId: "opening:0:prepared",
      status: "world_consequence_running",
      actionText: "[opening scene]",
      settledTurnPacketId: null,
      sourceAction: { kind: "opening_scene", currentTick: 0 },
      provenance: {
        source: "opening_scene",
        authority: "settled_packet",
        recoveryAuthority: "no_mutation_before_settled_packet",
      },
    });
    mockFindAbandonedPreSettledTurnSaga.mockReturnValue(openingSaga);
    mockedFindPendingNarrationSaga.mockReturnValue(openingSaga as never);
    mockGetSettledTurnPacket.mockReturnValue(null);
    mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(true);
    mockedGetHistory.mockReturnValue([]);
    mockedProcessOpeningScene.mockImplementation(() =>
      createTurnStream([
        { type: "narrative", data: { text: "A second opening should not run." } },
        { type: "done", data: { tick: 0, opening: true } },
      ]) as never,
    );

    const res = await app.request("/chat/opening", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: CAMPAIGN_ID }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        pendingNarration: true,
        resumable: true,
        status: "world_consequence_running",
      }),
    );
    expect(mockedProcessOpeningScene).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockRecordAbandonedTurnRollback).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("rolls back a non-resumable world consequence saga before new work", async () => {
    const preTurnSnapshot = {
      snapshotId: "snapshot-before-world-consequence",
      bundleDir: "snapshots/snapshot-before-world-consequence",
      capturedAt: 456,
      capturedWorldVersion: 12,
      capturedWorldTimeMinutes: 130,
      fileHashes: {
        stateDb: "state-hash",
        config: "config-hash",
        chatHistory: "chat-hash",
      },
    };
    const pendingSaga = mockPendingSaga({
      id: "saga-world-consequence-no-packet",
      turnId: "turn-world-consequence-no-packet",
      status: "world_consequence_running",
      settledTurnPacketId: null,
      provenance: { preTurnSnapshot },
    });
    mockedFindPendingNarrationSaga
      .mockReturnValueOnce(pendingSaga as never)
      .mockReturnValue(null as never);
    mockGetSettledTurnPacket.mockReturnValue(null);
    mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(false);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([{ type: "done", data: { tick: 10 } }]) as never,
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Continue after failed consequence",
        intent: "Continue after failed consequence",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    await res.text();
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({ snapshotId: "snapshot-before-world-consequence" }),
    );
    expect(mockRecordAbandonedTurnRollback).toHaveBeenCalledWith(
      expect.objectContaining({ saga: pendingSaga }),
    );
    expect(mockedProcessTurn).toHaveBeenCalled();
  });

  it("fails closed and releases the route lease when abandoned turn recovery lacks a snapshot", async () => {
    const abandonedSaga = mockPendingSaga({
      id: "saga-no-snapshot",
      turnId: "turn-no-snapshot",
      status: "tool_loop_running",
      provenance: {},
    });
    mockFindAbandonedPreSettledTurnSaga.mockReturnValue(abandonedSaga);

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Continue anyway",
        intent: "Continue anyway",
        method: "",
      }),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("Action request failed.");
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it.each([
    {
      route: "/chat/opening",
      body: { campaignId: CAMPAIGN_ID },
    },
    {
      route: "/chat/lookup",
      body: {
        campaignId: CAMPAIGN_ID,
        lookupKind: "character_canon_fact",
        subject: "Greta",
      },
    },
    {
      route: "/chat/retry",
      body: { campaignId: CAMPAIGN_ID },
    },
    {
      route: "/chat/undo",
      body: { campaignId: CAMPAIGN_ID },
    },
    {
      route: "/chat/edit",
      body: { campaignId: CAMPAIGN_ID, messageIndex: 0, newContent: "Edited." },
    },
  ])("runs abandoned-turn recovery gate before $route route work", async ({ route, body }) => {
    mockFindAbandonedPreSettledTurnSaga.mockReturnValue(mockPendingSaga({
      id: `saga-${route}`,
      turnId: `turn-${route}`,
      status: "tool_loop_running",
      provenance: {},
    }));

    const res = await app.request(route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    expect(res.status).toBe(500);
    expect(mockedCaptureSnapshot).not.toHaveBeenCalled();
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("resumes a pending saga through the explicit resume route without opening a new paid turn", async () => {
    const sagaSnapshot = {
      snapshotId: "snapshot-before-pending",
      bundleDir: "snapshots/snapshot-before-pending",
      capturedAt: 123,
      capturedWorldVersion: 7,
      capturedWorldTimeMinutes: 90,
      fileHashes: {
        stateDb: "state-hash",
        config: "config-hash",
        chatHistory: "chat-hash",
      },
    };
    const pendingSaga = mockPendingSaga({
      id: "saga-p89-pending",
      turnId: "turn-p89-pending",
      actionText: "Ask the witness to finish the story.",
      provenance: {
        preTurnSnapshot: sagaSnapshot,
        chatHistoryLengthBeforeTurn: 4,
      },
    });
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetTurnSaga.mockReturnValue(pendingSaga as never);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        { type: "narrative", data: { text: "Pending narration resumes cleanly." } },
        {
          type: "done",
          data: {
            tick: 7,
            resumed: true,
            acceptedDurableEventIds: ["evt-resumed"],
            producedDurableEventIds: ["evt-resumed", "evt-hidden-rejected"],
          },
        },
      ]) as never,
    );

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        resumeToken: "resume_phase89deadbeef",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Pending narration resumes cleanly.");
    expect(mockedResumePendingTurnNarration).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "turn-p89-pending",
      }),
    );
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedCaptureSnapshot).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(runtimeSnapshots.get(CAMPAIGN_ID)).toEqual({
      campaignId: CAMPAIGN_ID,
      ...sagaSnapshot,
    });
    expect(runtimeSnapshotMetadata.get(CAMPAIGN_ID)).toMatchObject({
      acceptedDurableEventIds: ["evt-resumed"],
      producedDurableEventIds: ["evt-resumed", "evt-hidden-rejected"],
      playerAction: "Ask the witness to finish the story.",
      chatHistoryLengthBeforeTurn: 4,
      chatHistoryLengthAfterTurn: 0,
    });
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("treats a prepared settled packet recovery event as a resumable route boundary", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-prepared-only",
      turnId: "turn-prepared-only",
      status: "world_consequence_running",
      settledTurnPacketId: null,
      actionText: "Wait for the final account.",
    });
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetTurnSaga.mockReturnValue(pendingSaga as never);
    mockGetSettledTurnPacket.mockReturnValue(null);
    mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(true);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        { type: "scene-settling", data: { phase: "final-narration", resumed: true } },
        { type: "done", data: { tick: 8, resumed: true } },
      ]) as never,
    );

    const historyRes = await app.request(`/chat/history?campaignId=${CAMPAIGN_ID}`);
    expect(historyRes.status).toBe(200);
    const historyBody = await historyRes.json();
    expect(historyBody.pendingNarration).toEqual(
      expect.objectContaining({
        pendingNarration: true,
        resumable: true,
        status: "world_consequence_running",
      }),
    );

    const resumeRes = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        resumeToken: "resume_phase89deadbeef",
      }),
    });

    expect(resumeRes.status).toBe(200);
    const resumeBody = await resumeRes.text();
    expect(resumeBody).toContain("event: done");
    expect(mockedResumePendingTurnNarration).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "turn-prepared-only",
      }),
    );
    expect(mockedProcessTurn).not.toHaveBeenCalled();
  });

  it("keeps a world consequence saga non-resumable when no packet or prepared recovery exists", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-not-ready",
      turnId: "turn-not-ready",
      status: "world_consequence_running",
      settledTurnPacketId: null,
    });
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetSettledTurnPacket.mockReturnValue(null);
    mockHasPreparedSettledTurnPacketRecovery.mockReturnValue(false);

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        resumeToken: "resume_phase89deadbeef",
      }),
    });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body).toEqual(
      expect.objectContaining({
        pendingNarration: true,
        resumable: false,
        status: "world_consequence_running",
      }),
    );
    expect(mockedResumePendingTurnNarration).not.toHaveBeenCalled();
  });

  it("keeps an explicit pending narration resume error as pending instead of treating it as resumed", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-p95-terminal-error",
      turnId: "turn-p95-terminal-error",
    });
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetTurnSaga.mockReturnValue(pendingSaga as never);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        {
          type: "error",
          data: {
            error: "Narration guard still needs repair.",
            pendingNarration: true,
            resumable: true,
            turnId: "turn-p95-terminal-error",
          },
        },
      ]) as never,
    );

    const res = await app.request("/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        resumeToken: "resume_phase89deadbeef",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const eventNames = sseEventNames(body);

    expect(eventNames.at(-1)).toBe("error");
    expect(body).toContain("Narration guard still needs repair.");
    expect(body).toContain("\"pendingNarration\":true");
    expect(mockedProcessTurn).not.toHaveBeenCalled();
    expect(mockedCaptureSnapshot).not.toHaveBeenCalled();
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("surfaces a resumable terminal error when pending narration resume closes without done or error", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-p95-silent-resume",
      turnId: "turn-p95-silent-resume",
    });

    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "final-narration" } };
        throw new PendingNarrationError(pendingSaga);
      })() as never,
    );
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        { type: "scene-settling", data: { phase: "final-narration", resumed: true } },
      ]) as never,
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Resolve the turn",
        intent: "Resolve the turn",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const eventNames = sseEventNames(body);

    expect(eventNames).toContain("scene-settling");
    expect(eventNames.at(-1)).toBe("error");
    expect(body).toContain("\"pendingNarration\":true");
    expect(body).toContain("\"resumable\":true");
    expect(body).not.toContain("turn-p95-silent-resume");
    expect(body).not.toContain("saga-p95-silent-resume");
    expect(eventNames).not.toContain("done");
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("surfaces a resumable terminal error when pending narration resume throws after settled resume", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-p95-prompt-safety",
      turnId: "turn-p95-prompt-safety",
    });

    mockedProcessTurn.mockImplementation(() =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "final-narration" } };
        throw new PendingNarrationError(pendingSaga);
      })() as never,
    );
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createThrowingTurnStream(
        [
          { type: "scene-settling", data: { phase: "final-narration", resumed: true } },
        ],
        new Error("prompt safety failed"),
      ) as never,
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Resolve the turn",
        intent: "Resolve the turn",
        method: "",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.text();
    const eventNames = sseEventNames(body);

    expect(eventNames).toContain("scene-settling");
    expect(eventNames.at(-1)).toBe("error");
    expect(body).toContain(
      "\"error\":\"Pending narration could not be completed yet. The settled turn state was preserved.\"",
    );
    expect(body).toContain("\"pendingNarration\":true");
    expect(body).toContain("\"resumable\":true");
    expect(body).not.toContain("\"turnId\":\"turn-p95-prompt-safety\"");
    expect(body).not.toContain("\"sagaId\":\"saga-p95-prompt-safety\"");
    expect(eventNames).not.toContain("done");
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });

  it("preserves finalized paid state when the done-boundary SSE write fails", async () => {
    const snapshot = { bundleId: "pre-finalized-phase-89" };
    let paidState = "pre-turn";

    mockedCaptureSnapshot.mockReturnValue(snapshot as never);
    mockedBuildDoneBoundaryData.mockImplementation(() => {
      throw new Error("phase 89 done boundary write failed");
    });
    mockedRestoreSnapshot.mockImplementation(() => {
      paidState = "rolled-back";
      return undefined as never;
    });
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([
        { type: "narrative", data: { text: "Paid result already committed." } },
        (() => {
          paidState = "finalized";
          return { type: "done", data: { tick: 8 } };
        })(),
      ]) as never,
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
    expect(mockedRestoreSnapshot).not.toHaveBeenCalled();
    expect(paidState).toBe("finalized");
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
  });
});
