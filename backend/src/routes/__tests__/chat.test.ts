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
  processOpeningScene: vi.fn(),
  captureSnapshot: vi.fn(),
  restoreSnapshot: vi.fn(),
  tickPresentNpcs: vi.fn(),
  simulateOffscreenNpcs: vi.fn(),
  checkAndTriggerReflections: vi.fn(),
  tickFactions: vi.fn(),
  sanitizeNarrative: vi.fn((text: string) => text),
}));

vi.mock("../../engine/grounded-lookup.js", () => ({
  runGroundedLookup: vi.fn(),
}));

const mockEmbedAndUpdateEvent = vi.fn();
const mockDrainPendingCommittedEvents = vi.fn();
const runtimeSnapshots = new Map<string, unknown>();
const runtimeActiveTurns = new Set<string>();

vi.mock("../../vectors/episodic-events.js", () => ({
  embedAndUpdateEvent: (...args: unknown[]) => mockEmbedAndUpdateEvent(...args),
  drainPendingCommittedEvents: (...args: unknown[]) => mockDrainPendingCommittedEvents(...args),
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
import {
  processOpeningScene,
  processTurn,
  captureSnapshot,
  restoreSnapshot,
  checkAndTriggerReflections,
  tickPresentNpcs,
  simulateOffscreenNpcs,
  tickFactions,
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
const mockedProcessTurn = vi.mocked(processTurn);
const mockedProcessOpeningScene = vi.mocked(processOpeningScene);
const mockedCaptureSnapshot = vi.mocked(captureSnapshot);
const mockedRestoreSnapshot = vi.mocked(restoreSnapshot);
const mockedCheckAndTriggerReflections = vi.mocked(checkAndTriggerReflections);
const mockedTickPresentNpcs = vi.mocked(tickPresentNpcs);
const mockedSimulateOffscreenNpcs = vi.mocked(simulateOffscreenNpcs);
const mockedTickFactions = vi.mocked(tickFactions);
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

beforeEach(() => {
  vi.clearAllMocks();
  mockDrainPendingCommittedEvents.mockReturnValue([]);
  runtimeSnapshots.clear();
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

  it("streams a separate reasoning SSE event without merging it into narrative", async () => {
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
        { type: "narrative", data: { text: "Nanami let the warning land before he moved." } },
        { type: "reasoning", data: { text: "Reasoning stays on a debug lane." } },
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
    expect(body).toContain("event: narrative");
    expect(body).toContain("event: reasoning");
    expect(body).toContain("Reasoning stays on a debug lane.");
    expect(body).not.toContain("Nanami let the warning land before he moved.Reasoning stays on a debug lane.");
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
    mockedGetHistory.mockReturnValue([
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
    mockedProcessTurn.mockImplementation(() =>
      createTurnStream([{ type: "done", data: { tick: 1 } }]),
    );

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

  it("triggers reflection during post-turn finalization", async () => {
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
    mockedTickPresentNpcs.mockImplementation(async () => {
      orderedCalls.push("tickPresentNpcs");
      return [];
    });
    mockedSimulateOffscreenNpcs.mockImplementation(async () => {
      orderedCalls.push("simulateOffscreenNpcs");
      return [];
    });
    mockedCheckAndTriggerReflections.mockImplementation(async () => {
      orderedCalls.push("checkAndTriggerReflections");
      return [];
    });
    mockedTickFactions.mockImplementation(async () => {
      orderedCalls.push("tickFactions");
      return [];
    });
    mockedProcessTurn.mockImplementation(({ onBeforeVisibleNarration, onPostTurn }) =>
      (async function* () {
        yield { type: "oracle_result", data: { outcome: "strong_hit" } } as any;
        yield { type: "scene-settling", data: { phase: "local-present-scene" } } as any;
        await onBeforeVisibleNarration?.({
          currentTick: 1,
          predictedTick: 2,
          currentLocationId: "loc-001",
          oracleResult: { outcome: "strong_hit" },
          toolCalls: [],
          openingScene: false,
        } as any);
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
    expect(orderedCalls).toEqual([
      "tickPresentNpcs",
      "finalizing_turn",
      "simulateOffscreenNpcs",
      "checkAndTriggerReflections",
      "tickFactions",
      "done",
    ]);
  });

  it("uses local scene scope instead of broad currentLocationId for pre-visible scene scope settlement", async () => {
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
    mockedProcessTurn.mockImplementation(({ onBeforeVisibleNarration, onPostTurn }) =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "local-present-scene" } } as any;
        await onBeforeVisibleNarration?.({
          currentTick: 1,
          predictedTick: 2,
          currentLocationId: "shibuya-district",
          currentSceneScopeId: "platform-7",
          oracleResult: { outcome: "strong_hit" },
          toolCalls: [],
          openingScene: false,
        } as any);
        await onPostTurn?.({
          tick: 2,
          toolCalls: [],
        } as any);
        yield { type: "done", data: { tick: 2 } } as any;
      })(),
    );

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
    expect(mockedTickPresentNpcs).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      2,
      expect.any(Object),
      "shibuya-district",
      "platform-7",
      undefined,
    );
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
    mockedTickPresentNpcs.mockImplementation(async () => {
      orderedCalls.push("tickPresentNpcs");
      return [];
    });
    mockedSimulateOffscreenNpcs.mockImplementation(async () => {
      orderedCalls.push("simulateOffscreenNpcs");
      return [];
    });
    mockedCheckAndTriggerReflections.mockImplementation(async () => {
      orderedCalls.push("checkAndTriggerReflections");
      return [];
    });
    mockedTickFactions.mockImplementation(async () => {
      orderedCalls.push("tickFactions");
      return [];
    });
    mockDrainPendingCommittedEvents.mockReturnValue([
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
    mockedProcessTurn.mockImplementation(({ onBeforeVisibleNarration, onPostTurn }) =>
      (async function* () {
        yield { type: "scene-settling", data: { phase: "local-present-scene" } } as any;
        await onBeforeVisibleNarration?.({
          currentTick: 1,
          predictedTick: 2,
          currentLocationId: "loc-001",
          oracleResult: { outcome: "strong_hit" },
          toolCalls: [],
          openingScene: false,
        } as any);
        yield { type: "finalizing_turn", data: { stage: "rollback_critical" } } as any;
        await onPostTurn?.({
          tick: 2,
          toolCalls: [],
        } as any);
        yield { type: "done", data: { tick: 2 } } as any;
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(orderedCalls).toEqual([
      "tickPresentNpcs",
      "simulateOffscreenNpcs",
      "checkAndTriggerReflections",
      "tickFactions",
    ]);
    expect(mockDrainPendingCommittedEvents).toHaveBeenCalledWith(CAMPAIGN_ID, 2);
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
      .mockImplementationOnce(() =>
        createTurnStream([{ type: "done", data: { tick: 1 } }]),
      )
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
