import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

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
}));

vi.mock("../../lib/index.js", () => ({
  clamp: vi.fn((val: number, min: number, max: number) =>
    Math.min(Math.max(val, min), max)
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
  loadSettings: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../engine/index.js", () => ({
  processTurn: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  tickPresentNpcs: vi.fn(),
  simulateOffscreenNpcs: vi.fn(),
  checkAndTriggerReflections: vi.fn(),
  tickFactions: vi.fn(),
  sanitizeNarrative: vi.fn((text: string) => text),
}));

vi.mock("../../ai/with-model-fallback.js", () => ({
  resolveFallbackProvider: vi.fn(() => null),
}));

import { callStoryteller } from "../../ai/index.js";
import {
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
import {
  processTurn,
  captureSnapshot,
  restoreSnapshot,
} from "../../engine/index.js";
import chatRoutes from "../chat.js";

const mockedGetActive = vi.mocked(getActiveCampaign);
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
const mockedProcessTurn = vi.mocked(processTurn);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedRestoreSnapshot = vi.mocked(restoreSnapshot);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/chat", chatRoutes);

const CAMPAIGN_ID = "campaign-42";

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
    fallback: { providerId: "", model: "", timeoutMs: 1000, retryCount: 0 },
  } as any);

  mockedResolveRole.mockReturnValue({
    provider: { baseUrl: "http://localhost:1234", apiKey: "", model: "st-model" },
    temperature: 0.7,
    maxTokens: 2048,
  } as any);
}

function setupDbMock(player: { hp: number } | null = { hp: 5 }) {
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

beforeEach(() => {
  vi.clearAllMocks();
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
    expect(body.messages).toHaveLength(2);
    expect(body.messages[0].role).toBe("user");
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
});

describe("Campaign-loaded gameplay transport", () => {
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
    expect(body.messages).toHaveLength(2);
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
    mockedProcessTurn.mockImplementation(({ campaignId }) =>
      createTurnStream([{ type: "done", data: { tick: 1, campaignId } }]),
    );
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
});

// ---------------------------------------------------------------------------
// POST /chat
// ---------------------------------------------------------------------------
describe("POST /chat", () => {
  it("streams storyteller response", async () => {
    activateCampaign();
    setupStoryteller();
    mockedGetPremise.mockReturnValue("A world of wonder.");
    mockedGetHistory.mockReturnValue([]);

    // Mock callStoryteller to return a fake stream response
    const fakeStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("The story continues..."));
        controller.close();
      },
    });
    mockedCallStoryteller.mockReturnValue({
      toTextStreamResponse: vi.fn(() =>
        new Response(fakeStream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
          },
        })
      ),
    } as any);

    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "I open the door." }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/plain");
    const text = await res.text();
    expect(text).toBe("The story continues...");
    expect(mockedCallStoryteller).toHaveBeenCalledOnce();
  });

  it("returns 400 when no active campaign", async () => {
    mockedGetActive.mockReturnValue(null as any);

    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "test" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("No active campaign loaded.");
  });

  it("returns 400 for empty playerAction", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ playerAction: "   " }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for missing playerAction", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
