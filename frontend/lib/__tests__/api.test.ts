import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chatAction,
  chatEdit,
  chatHistory,
  chatRetry,
  chatUndo,
  deleteLoreCardById,
  getWorldData,
  parseTurnSSE,
  readErrorMessage,
  updateLoreCard,
} from "../api";
import type { LoreCardItem, LoreCardUpdateInput } from "../api-types";

// ---------------------------------------------------------------------------
// readErrorMessage
// ---------------------------------------------------------------------------
describe("readErrorMessage", () => {
  it("extracts error from JSON response", async () => {
    const response = {
      json: async () => ({ error: "Something went wrong" }),
      statusText: "Internal Server Error",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Something went wrong");
  });

  it("falls back to statusText when no error field", async () => {
    const response = {
      json: async () => ({ data: "ok" }),
      statusText: "Bad Request",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Bad Request");
  });

  it("falls back to statusText when json parse fails", async () => {
    const response = {
      json: async () => { throw new Error("not json"); },
      statusText: "Not Found",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Not Found");
  });

  it("returns 'Request failed' when statusText is empty", async () => {
    const response = {
      json: async () => { throw new Error(); },
      statusText: "",
    } as unknown as Response;
    expect(await readErrorMessage(response)).toBe("Request failed");
  });
});

describe("lore item API helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("updateLoreCard sends PUT with the exact payload and returns parsed card data", async () => {
    const payload: LoreCardUpdateInput = {
      term: "The Black Spire",
      definition: "A ruined tower watching the northern pass.",
      category: "location",
    };
    const card: LoreCardItem = { id: "card-7", ...payload };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ card }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateLoreCard("camp-1", "card-7", payload)).resolves.toEqual(card);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/campaigns/camp-1/lore/card-7", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  });

  it("deleteLoreCardById sends DELETE to the item endpoint", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteLoreCardById("camp-1", "card-9")).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/campaigns/camp-1/lore/card-9", {
      method: "DELETE",
    });
  });

  it("propagates update lore card API errors", async () => {
    const payload: LoreCardUpdateInput = {
      term: "Bad",
      definition: "",
      category: "concept",
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "Lore card not found." }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(updateLoreCard("camp-1", "missing-card", payload)).rejects.toThrow("Lore card not found.");
  });

  it("propagates delete lore card API errors", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: "Definition is required." }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(deleteLoreCardById("camp-1", "blocked-card")).rejects.toThrow("Definition is required.");
  });
});

describe("gameplay API helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("chatHistory sends the campaignId in the history query string", async () => {
    const history = {
      messages: [{ role: "assistant", content: "Welcome back." }],
      premise: "A haunted frontier.",
      hasLiveTurnSnapshot: false,
    };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(history), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatHistory("campaign id/42")).resolves.toEqual(history);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/chat/history?campaignId=campaign%20id%2F42",
    );
  });

  it("chatAction is a streaming helper and sends the explicit campaignId in the request body", async () => {
    const response = new Response("event: done\ndata: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    fetchMock.mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatAction("campaign-42", "Open the gate", "Open the gate", ""),
    ).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-42",
        playerAction: "Open the gate",
        intent: "Open the gate",
        method: "",
      }),
    });
  });

  it("chatRetry is a streaming helper and sends only the explicit campaignId", async () => {
    const response = new Response("event: done\ndata: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    fetchMock.mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatRetry("campaign-42")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/retry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: "campaign-42" }),
    });
  });

  it("chatUndo is a JSON helper and returns parsed undo results", async () => {
    const undoResult = { success: true, messagesRemoved: 2 };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(undoResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatUndo("campaign-42")).resolves.toEqual(undoResult);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: "campaign-42" }),
    });
  });

  it("chatEdit is a JSON helper and sends campaignId with the edit payload", async () => {
    const editResult = { success: true };

    fetchMock.mockResolvedValue(
      new Response(JSON.stringify(editResult), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatEdit("campaign-42", 3, "New content")).resolves.toEqual(editResult);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-42",
        messageIndex: 3,
        newContent: "New content",
      }),
    });
  });

  it("getWorldData preserves explicit currentScene payload fields and scene-scoped fallback ids", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: {
          id: "scene-platform-7",
          name: "Platform 7",
          broadLocationId: "loc-shibuya-station",
          broadLocationName: "Shibuya Station",
          sceneNpcIds: ["npc-1", "npc-2"],
          clearNpcIds: ["npc-1"],
          awareness: {
            byNpcId: {
              "npc-1": "clear",
              "npc-2": "hint",
            },
            hintSignals: ["A pressure shift crawls along the far edge of the platform."],
          },
        },
        locations: [],
        npcs: [
          {
            id: "npc-1",
            campaignId: "camp-1",
            name: "Nobara Kugisaki",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: "loc-shibuya-station",
            sceneScopeId: "scene-platform-7",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        factions: [],
        relationships: [],
        items: [],
        player: {
          id: "player-1",
          campaignId: "camp-1",
          name: "Yuji Itadori",
          race: "",
          gender: "",
          age: "",
          appearance: "",
          hp: 5,
          tags: "[]",
          equippedItems: "[]",
          inventory: [],
          equipment: [],
          currentLocationId: "loc-shibuya-station",
          sceneScopeId: "scene-platform-7",
        },
        personaTemplates: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1");

    expect(world.currentScene).toEqual({
      id: "scene-platform-7",
      name: "Platform 7",
      broadLocationId: "loc-shibuya-station",
      broadLocationName: "Shibuya Station",
      sceneNpcIds: ["npc-1", "npc-2"],
      clearNpcIds: ["npc-1"],
      awareness: {
        byNpcId: {
          "npc-1": "clear",
          "npc-2": "hint",
        },
        hintSignals: ["A pressure shift crawls along the far edge of the platform."],
      },
    });
    expect(world.npcs[0]?.sceneScopeId).toBe("scene-platform-7");
    expect(world.player?.sceneScopeId).toBe("scene-platform-7");
  });
});

describe("parseTurnSSE", () => {
  function createStream(payload: string): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload));
        controller.close();
      },
    });
  }

  it("dispatches a dedicated finalization callback before done", async () => {
    const onFinalizing = vi.fn();
    const onDone = vi.fn();

    await parseTurnSSE(
      createStream([
        'event: narrative',
        'data: {"text":"The gate trembles."}',
        "",
        "event: finalizing_turn",
        "data: {}",
        "",
        "event: done",
        "data: {}",
        "",
      ].join("\n")),
      {
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onFinalizing,
        onDone,
        onError: vi.fn(),
      },
    );

    expect(onFinalizing).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onFinalizing.mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
  });

  it("ignores finalizing_turn safely when the optional callback is omitted", async () => {
    const onDone = vi.fn();

    await expect(
      parseTurnSSE(
        createStream([
          "event: finalizing_turn",
          "data: {}",
          "",
          "event: done",
          "data: {}",
          "",
        ].join("\n")),
        {
          onNarrative: vi.fn(),
          onOracleResult: vi.fn(),
          onStateUpdate: vi.fn(),
          onQuickActions: vi.fn(),
          onDone,
          onError: vi.fn(),
        },
      ),
    ).resolves.toBeUndefined();

    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
