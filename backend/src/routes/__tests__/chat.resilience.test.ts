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
const mockGetTurnSaga = vi.fn((_input?: unknown) => null);

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  resumePendingTurnNarration: vi.fn(),
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  findPendingNarrationSaga: vi.fn(() => null),
  getSettledTurnPacket: (input: unknown) => mockGetSettledTurnPacket(input),
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
const mockRetractStoredEpisodicEvent = vi.fn();
const mockRetractPendingCommittedEventsForTick = vi.fn();
vi.mock("../../vectors/episodic-events.js", () => ({
  embedAndUpdateEvent: (...args: unknown[]) => mockEmbedAndUpdateEvent(...args),
  drainPendingCommittedEvents: (...args: unknown[]) => mockDrainPendingCommittedEvents(...args),
  drainPendingCommittedEventsByIds: (...args: unknown[]) =>
    mockDrainPendingCommittedEventsByIds(...args),
  retractStoredEpisodicEvent: (...args: unknown[]) => mockRetractStoredEpisodicEvent(...args),
  retractPendingCommittedEventsForTick: (...args: unknown[]) =>
    mockRetractPendingCommittedEventsForTick(...args),
}));

const runtimeSnapshots = new Map<string, unknown>();
const runtimeSnapshotMetadata = new Map<string, {
  acceptedDurableEventIds: string[];
  producedDurableEventIds: string[];
}>();
const runtimeActiveTurns = new Set<string>();

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
    },
  ) => {
    runtimeSnapshots.set(campaignId, snapshot);
    runtimeSnapshotMetadata.set(campaignId, {
      acceptedDurableEventIds: [...new Set(metadata?.acceptedDurableEventIds ?? [])],
      producedDurableEventIds: [...new Set(metadata?.producedDurableEventIds ?? [])],
    });
  },
  getLastTurnSnapshot: (campaignId: string) => runtimeSnapshots.get(campaignId),
  getLastTurnSnapshotMetadata: (campaignId: string) =>
    runtimeSnapshotMetadata.get(campaignId) ?? {
      acceptedDurableEventIds: [],
      producedDurableEventIds: [],
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
  mockDrainPendingCommittedEvents.mockReturnValue([]);
  mockDrainPendingCommittedEventsByIds.mockReturnValue([]);
  mockGetSettledTurnPacket.mockReturnValue(null);
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
  it("resumes a pending saga through the explicit resume route without opening a new paid turn", async () => {
    const pendingSaga = mockPendingSaga({
      id: "saga-p89-pending",
      turnId: "turn-p89-pending",
    });
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockGetTurnSaga.mockReturnValue(pendingSaga as never);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        { type: "narrative", data: { text: "Pending narration resumes cleanly." } },
        { type: "done", data: { tick: 7, resumed: true } },
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
    expect(runtimeActiveTurns.has(CAMPAIGN_ID)).toBe(false);
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
