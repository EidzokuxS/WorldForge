import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../ai/index.js", () => ({
  callStoryteller: vi.fn(),
  resolveRoleModel: vi.fn(() => ({
    provider: { baseUrl: "http://localhost:1234", model: "test-model", apiKey: "" },
    temperature: 0.7,
    maxTokens: 2048,
  })),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: vi.fn(),
  getCampaignPremise: vi.fn(() => "A harsh frontier under failing wardstones."),
  getChatHistory: vi.fn(() => []),
  getActiveCampaign: vi.fn(() => null),
  loadCampaign: vi.fn(async (campaignId: string) => ({
    id: campaignId,
    name: `Campaign ${campaignId}`,
    createdAt: "2026-01-01",
    premise: "A harsh frontier under failing wardstones.",
  })),
  popLastMessages: vi.fn(() => []),
  replaceChatMessage: vi.fn(),
  getLastPlayerAction: vi.fn(() => "Retry the duel"),
  createCheckpoint: vi.fn(),
  pruneAutoCheckpoints: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  clamp: vi.fn((value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max),
  ),
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(() => ({
    judge: { providerId: "p1", model: "judge-model", temperature: 0.1, maxTokens: 1024 },
    storyteller: { providerId: "p1", model: "story-model", temperature: 0.7, maxTokens: 2048 },
    embedder: { providerId: "", model: "", temperature: 0.1, maxTokens: 256 },
    providers: [
      {
        id: "p1",
        name: "Provider",
        baseUrl: "http://localhost:1234",
        apiKey: "",
        defaultModel: "story-model",
        isBuiltin: false,
      },
    ],
    ui: { showRawReasoning: false },
  })),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          get: vi.fn(() => ({ hp: 5, currentLocationId: "loc-1" })),
        })),
      })),
    })),
  })),
}));

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  tickPresentNpcs: vi.fn(async () => []),
  simulateOffscreenNpcs: vi.fn(async () => []),
  checkAndTriggerReflections: vi.fn(async () => []),
  tickFactions: vi.fn(async () => []),
  sanitizeNarrative: vi.fn((text: string) => text),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  drainPendingCommittedEvents: vi.fn(() => []),
  embedAndUpdateEvent: vi.fn(),
}));

const runtimeSnapshots = new Map<string, unknown>();

vi.mock("../../campaign/runtime-state.js", () => ({
  tryBeginTurn: vi.fn(() => true),
  endTurn: vi.fn(),
  hasActiveTurn: vi.fn(() => false),
  hasLiveTurnSnapshot: vi.fn((campaignId: string) => runtimeSnapshots.has(campaignId)),
  setLastTurnSnapshot: vi.fn((campaignId: string, snapshot: unknown) => {
    runtimeSnapshots.set(campaignId, snapshot);
  }),
  getLastTurnSnapshot: vi.fn((campaignId: string) => runtimeSnapshots.get(campaignId)),
  clearLastTurnSnapshot: vi.fn((campaignId: string) => {
    runtimeSnapshots.delete(campaignId);
  }),
}));

import { processTurn, captureSnapshot, restoreSnapshot } from "../../engine/index.js";
import chatRoutes from "../chat.js";

const mockedProcessTurn = vi.mocked(processTurn);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedRestoreSnapshot = vi.mocked(restoreSnapshot);

const app = new Hono();
app.route("/chat", chatRoutes);

function createTurnStream(events: Array<{ type: string; data: unknown }>) {
  return (async function* () {
    for (const event of events) {
      yield event as any;
    }
  })();
}

beforeEach(() => {
  vi.clearAllMocks();
  runtimeSnapshots.clear();
});

describe("Phase 38 retry/undo reopen seam", () => {
  it("restores the last snapshot before retry replays the turn so bundle reopen cannot skip authority migration", async () => {
    const previousSnapshot = { bundleId: "legacy-turn-boundary" } as const;
    runtimeSnapshots.set("campaign-38", previousSnapshot);
    mockedRestoreSnapshot.mockResolvedValue(undefined);
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([{ type: "done", data: { tick: 7 } }]),
    );

    const response = await app.request("/chat/retry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ campaignId: "campaign-38" }),
    });

    expect(response.status).toBe(200);
    await response.text();

    expect(mockedRestoreSnapshot).toHaveBeenCalledWith("campaign-38", previousSnapshot);
    expect(mockedRestoreSnapshot.mock.invocationCallOrder[0]).toBeLessThan(
      mockedProcessTurn.mock.invocationCallOrder[0],
    );
  });

  it("reopens the last snapshot before undo succeeds so retry/undo restore shares the same authority seam", async () => {
    const previousSnapshot = { bundleId: "legacy-turn-boundary" } as const;
    runtimeSnapshots.set("campaign-38", previousSnapshot);
    mockedRestoreSnapshot.mockResolvedValue(undefined);

    const response = await app.request("/chat/undo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ campaignId: "campaign-38" }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, messagesRemoved: 2 });
    expect(mockedRestoreSnapshot).toHaveBeenCalledWith("campaign-38", previousSnapshot);
  });
});
