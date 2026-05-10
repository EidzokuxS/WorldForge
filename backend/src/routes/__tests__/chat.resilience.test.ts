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

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  resumePendingTurnNarration: vi.fn(),
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  findPendingNarrationSaga: vi.fn(() => null),
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
vi.mock("../../vectors/episodic-events.js", () => ({
  embedAndUpdateEvent: (...args: unknown[]) => mockEmbedAndUpdateEvent(...args),
  drainPendingCommittedEvents: (...args: unknown[]) => mockDrainPendingCommittedEvents(...args),
}));

const runtimeSnapshots = new Map<string, unknown>();
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
  setLastTurnSnapshot: (campaignId: string, snapshot: unknown) => {
    runtimeSnapshots.set(campaignId, snapshot);
  },
  getLastTurnSnapshot: (campaignId: string) => runtimeSnapshots.get(campaignId),
  clearLastTurnSnapshot: (campaignId: string) => {
    runtimeSnapshots.delete(campaignId);
  },
  hasLiveTurnSnapshot: (campaignId: string) => runtimeSnapshots.has(campaignId),
  clearCampaignRuntimeState: (campaignId: string) => {
    runtimeActiveTurns.delete(campaignId);
    runtimeSnapshots.delete(campaignId);
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
  processTurn,
  resumePendingTurnNarration,
  restoreSnapshot,
} from "../../engine/index.js";
import chatRoutes from "../chat.js";

const app = new Hono();
app.route("/chat", chatRoutes);

const CAMPAIGN_ID = "phase-89-chat-resilience";

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
  runtimeActiveTurns.clear();
  mockDrainPendingCommittedEvents.mockReturnValue([]);
  mockedFindPendingNarrationSaga.mockReturnValue(null);
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
  it("resumes a pending saga without opening a new paid turn and releases the route lock", async () => {
    const pendingSaga = {
      id: "saga-p89-pending",
      turnId: "turn-p89-pending",
      status: "resolved_pending_narration",
    };
    mockedFindPendingNarrationSaga.mockReturnValue(pendingSaga as never);
    mockedResumePendingTurnNarration.mockImplementation(() =>
      createTurnStream([
        { type: "narrative", data: { text: "Pending narration resumes cleanly." } },
        { type: "done", data: { tick: 7, resumed: true } },
      ]) as never,
    );

    const res = await app.request("/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: CAMPAIGN_ID,
        playerAction: "Try to start new paid work",
        intent: "Try to start new paid work",
        method: "",
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
