import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatAction,
  chatEdit,
  chatHistory,
  chatLookup,
  chatResume,
  chatRetry,
  chatUndo,
  deleteCheckpointApi,
  deleteLoreCardById,
  generateWorld,
  generateCharacter,
  getWorldData,
  importV2Card,
  loadCheckpointApi,
  IngestionError,
  parseCharacter,
  parseTurnSSE,
  readErrorMessage,
  readIngestionError,
  researchCharacter,
  suggestSeed,
  updateLoreCard,
} from "../api";
import type { LoreCardItem, LoreCardUpdateInput } from "../api-types";
import type { WorldgenResearchArtifactV2 } from "@worldforge/shared";

const RESEARCH_ARTIFACT: WorldgenResearchArtifactV2 = {
  version: 2,
  rawPremise: "Jujutsu Kaisen world with Naruto power system",
  rawKnownIP: "Jujutsu Kaisen",
  researchBrief: {
    interpretationSummary: "Use Jujutsu Kaisen as the world basis and Naruto as the power system overlay.",
    ambiguityNotes: [],
    sourceUsageRules: [],
    searchJobs: [],
  },
  searchResults: [],
  generatedContext: {
    keyFacts: ["Tokyo Jujutsu High anchors the setting."],
    tonalNotes: ["Occult action"],
    canonicalNames: {
      characters: ["Satoru Gojo"],
    },
  },
  provenance: {
    createdAt: "2026-04-26T00:00:00.000Z",
    model: "test-model",
    searchProvider: "test",
  },
};

const PUBLIC_HANDLES = {
  actorNpc: "pdto_actor_11111111111111111111111111111111",
  actorNpc2: "pdto_actor_22222222222222222222222222222222",
  actorSibling: "pdto_actor_33333333333333333333333333333333",
  actorPlayer: "pdto_actor_44444444444444444444444444444444",
  event: "pdto_event_11111111111111111111111111111111",
  itemLantern: "pdto_item_11111111111111111111111111111111",
  placeScene: "pdto_place_11111111111111111111111111111111",
  placeBroad: "pdto_place_22222222222222222222222222222222",
  placeNext: "pdto_place_33333333333333333333333333333333",
  placeOtherScene: "pdto_place_44444444444444444444444444444444",
  relationship: "pdto_relationship_11111111111111111111111111111111",
  routeNext: "pdto_route_11111111111111111111111111111111",
  checkpoint: "pdto_checkpoint_11111111111111111111111111111111",
} as const;

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

describe("checkpoint API helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("loads checkpoints through public handles in route paths", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        id: PUBLIC_HANDLES.checkpoint,
        checkpointHandle: PUBLIC_HANDLES.checkpoint,
        name: "Before the bridge",
        description: "",
        createdAt: 1779610000000,
        auto: false,
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await loadCheckpointApi("camp-1", PUBLIC_HANDLES.checkpoint);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/campaigns/camp-1/checkpoints/${PUBLIC_HANDLES.checkpoint}/load`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("deletes checkpoints through public handles in route paths", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await deleteCheckpointApi("camp-1", PUBLIC_HANDLES.checkpoint);

    expect(fetchMock).toHaveBeenCalledWith(
      `http://localhost:3001/api/campaigns/camp-1/checkpoints/${PUBLIC_HANDLES.checkpoint}`,
      expect.objectContaining({ method: "DELETE" }),
    );
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

describe("worldgen API helpers", () => {
  const fetchMock = vi.fn<typeof fetch>();

  afterEach(() => {
    fetchMock.mockReset();
    vi.unstubAllGlobals();
  });

  function lastBody(): Record<string, unknown> {
    const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const init = call?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body));
  }

  it("suggestSeed includes a researchArtifact only when one exists", async () => {
    fetchMock.mockImplementation(async () => new Response(
      JSON.stringify({ category: "geography", value: "Tokyo wards" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await suggestSeed("Premise", "geography", null, null, RESEARCH_ARTIFACT);
    expect(lastBody()).toMatchObject({
      premise: "Premise",
      category: "geography",
      researchArtifact: RESEARCH_ARTIFACT,
    });

    await suggestSeed("Premise", "geography", null, null, null);
    expect(lastBody()).not.toHaveProperty("researchArtifact");
  });

  it("generateWorld includes a researchArtifact only when one exists", async () => {
    fetchMock.mockImplementation(async () => new Response(
      JSON.stringify({ startingLocation: "Tokyo Jujutsu High" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ));
    vi.stubGlobal("fetch", fetchMock);

    await generateWorld("campaign-1", undefined, null, null, RESEARCH_ARTIFACT);
    expect(lastBody()).toMatchObject({
      campaignId: "campaign-1",
      researchArtifact: RESEARCH_ARTIFACT,
    });

    await generateWorld("campaign-1", undefined, null, null, null);
    expect(lastBody()).not.toHaveProperty("researchArtifact");
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

  it("chatAction sends quick-action handles as backend-owned authority when provided", async () => {
    const response = new Response("event: done\ndata: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    fetchMock.mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      chatAction("campaign-42", "Ask the clerk", "Ask the clerk", "", {
        quickActionHandle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-42",
        playerAction: "Ask the clerk",
        intent: "Ask the clerk",
        method: "",
        quickActionHandle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
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

  it("chatResume is a streaming helper and sends the explicit resume token", async () => {
    const response = new Response("event: done\ndata: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    fetchMock.mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatResume("campaign-42", "saga-token-1")).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campaignId: "campaign-42", resumeToken: "saga-token-1" }),
    });
  });

  it("chatLookup is a streaming helper and sends campaignId plus the lookup payload", async () => {
    const response = new Response("event: done\ndata: {}\n\n", {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });

    fetchMock.mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(chatLookup("campaign-42", {
      lookupKind: "power_profile",
      subject: "Satoru Gojo",
      compareAgainst: "Ryomen Sukuna",
    })).resolves.toBe(response);
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/chat/lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        campaignId: "campaign-42",
        lookupKind: "power_profile",
        subject: "Satoru Gojo",
        compareAgainst: "Ryomen Sukuna",
      }),
    });
  });

  it("chatUndo is a JSON helper and returns parsed undo results", async () => {
    const undoResult = { ok: true, messagesRemoved: 2 };

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
    const editResult = { ok: true };

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

  it("getWorldData preserves explicit currentScene payload fields and scene-scoped fallback handles", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: {
          id: PUBLIC_HANDLES.placeScene,
          name: "Platform 7",
          broadLocationId: PUBLIC_HANDLES.placeBroad,
          broadLocationName: "Shibuya Station",
          sceneNpcIds: [PUBLIC_HANDLES.actorNpc, PUBLIC_HANDLES.actorNpc2],
          clearNpcIds: [PUBLIC_HANDLES.actorNpc],
          awareness: {
            byNpcId: {
              [PUBLIC_HANDLES.actorNpc]: "clear",
              [PUBLIC_HANDLES.actorNpc2]: "hint",
            },
            hintSignals: ["A pressure shift crawls along the far edge of the platform."],
          },
        },
        locations: [],
        npcs: [
          {
            id: PUBLIC_HANDLES.actorNpc,
            campaignId: "camp-1",
            name: "Nobara Kugisaki",
            persona: "",
            tags: "[]",
            tier: "key",
            currentLocationId: PUBLIC_HANDLES.placeBroad,
            sceneScopeId: PUBLIC_HANDLES.placeScene,
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        factions: [],
        relationships: [],
        items: [],
        player: {
          id: PUBLIC_HANDLES.actorPlayer,
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
          currentLocationId: PUBLIC_HANDLES.placeBroad,
          sceneScopeId: PUBLIC_HANDLES.placeScene,
        },
        personaTemplates: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1");

    expect(world.currentScene).toMatchObject({
      id: PUBLIC_HANDLES.placeScene,
      sceneHandle: PUBLIC_HANDLES.placeScene,
      name: "Platform 7",
      broadLocationId: PUBLIC_HANDLES.placeBroad,
      broadPlaceHandle: PUBLIC_HANDLES.placeBroad,
      broadLocationName: "Shibuya Station",
      sceneNpcIds: [PUBLIC_HANDLES.actorNpc, PUBLIC_HANDLES.actorNpc2],
      actorHandles: [PUBLIC_HANDLES.actorNpc, PUBLIC_HANDLES.actorNpc2],
      clearNpcIds: [PUBLIC_HANDLES.actorNpc],
      clearActorHandles: [PUBLIC_HANDLES.actorNpc],
      awareness: {
        byNpcId: {
          [PUBLIC_HANDLES.actorNpc]: "clear",
          [PUBLIC_HANDLES.actorNpc2]: "hint",
        },
        byActorHandle: {
          [PUBLIC_HANDLES.actorNpc]: "clear",
          [PUBLIC_HANDLES.actorNpc2]: "hint",
        },
        hintSignals: ["A pressure shift crawls along the far edge of the platform."],
      },
    });
    expect(world.npcs[0]?.sceneScopeId).toBe(PUBLIC_HANDLES.placeScene);
    expect(world.player?.sceneScopeId).toBe(PUBLIC_HANDLES.placeScene);
  });

  it("getWorldData keeps authoritative currentScene ids separate from same-broad NPC rows", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: {
          id: PUBLIC_HANDLES.placeScene,
          name: "Platform 7",
          broadLocationId: PUBLIC_HANDLES.placeBroad,
          broadLocationName: "Shibuya Station",
          sceneNpcIds: [PUBLIC_HANDLES.actorNpc, PUBLIC_HANDLES.actorNpc2],
          clearNpcIds: [PUBLIC_HANDLES.actorNpc],
          awareness: {
            byNpcId: {
              [PUBLIC_HANDLES.actorNpc]: "clear",
              [PUBLIC_HANDLES.actorNpc2]: "hint",
              [PUBLIC_HANDLES.actorSibling]: "clear",
            },
            hintSignals: ["A cursed echo carries from another platform."],
          },
        },
        locations: [],
        npcs: [
          {
            id: PUBLIC_HANDLES.actorNpc,
            campaignId: "camp-1",
            name: "Concourse Warden",
            persona: "",
            tags: "[]",
            tier: "supporting",
            currentLocationId: PUBLIC_HANDLES.placeBroad,
            sceneScopeId: PUBLIC_HANDLES.placeScene,
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: PUBLIC_HANDLES.actorSibling,
            campaignId: "camp-1",
            name: "Rooftop Lookout",
            persona: "",
            tags: "[]",
            tier: "supporting",
            currentLocationId: PUBLIC_HANDLES.placeBroad,
            sceneScopeId: PUBLIC_HANDLES.placeOtherScene,
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        factions: [],
        relationships: [],
        items: [],
        player: {
          id: PUBLIC_HANDLES.actorPlayer,
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
          currentLocationId: PUBLIC_HANDLES.placeBroad,
          sceneScopeId: PUBLIC_HANDLES.placeScene,
        },
        personaTemplates: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1");

    expect(world.currentScene?.sceneNpcIds).toEqual([PUBLIC_HANDLES.actorNpc, PUBLIC_HANDLES.actorNpc2]);
    expect(world.currentScene?.clearNpcIds).toEqual([PUBLIC_HANDLES.actorNpc]);
    expect(world.currentScene?.awareness.byNpcId[PUBLIC_HANDLES.actorSibling]).toBe("clear");
    expect(world.npcs.map((npc) => npc.id)).toEqual([PUBLIC_HANDLES.actorNpc, PUBLIC_HANDLES.actorSibling]);
    expect(world.npcs[1]?.currentLocationId).toBe(PUBLIC_HANDLES.placeBroad);
    expect(world.npcs[1]?.sceneScopeId).toBe(PUBLIC_HANDLES.placeOtherScene);
  });

  it("getWorldData maps public DTO handles into frontend world aliases", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: {
          sceneHandle: PUBLIC_HANDLES.placeScene,
          name: "Platform 7",
          broadPlaceHandle: PUBLIC_HANDLES.placeBroad,
          broadLocationName: "Shibuya Station",
          actorHandles: [PUBLIC_HANDLES.actorNpc],
          clearActorHandles: [PUBLIC_HANDLES.actorNpc],
          awareness: {
            byActorHandle: {
              [PUBLIC_HANDLES.actorNpc]: "clear",
            },
            hintSignals: [],
          },
        },
        locations: [
          {
            placeHandle: PUBLIC_HANDLES.placeBroad,
            name: "Shibuya Station",
            description: "Transit hum.",
            tags: [],
            connectedToPlaceHandles: [PUBLIC_HANDLES.placeNext],
            connectedPaths: [
              {
                routeHandle: PUBLIC_HANDLES.routeNext,
                toPlaceHandle: PUBLIC_HANDLES.placeNext,
                toLocationName: "Exit 13",
                travelCost: 1,
              },
            ],
            recentHappenings: [],
            isStarting: true,
          },
        ],
        npcs: [
          {
            actorHandle: PUBLIC_HANDLES.actorNpc,
            name: "Station Guard",
            persona: "",
            tags: "[]",
            tier: "supporting",
            currentPlaceHandle: PUBLIC_HANDLES.placeBroad,
            sceneHandle: PUBLIC_HANDLES.placeScene,
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        factions: [],
        relationships: [],
        items: [
          {
            itemHandle: PUBLIC_HANDLES.itemLantern,
            name: "Lantern",
            tags: "[]",
            placeHandle: PUBLIC_HANDLES.placeBroad,
            ownerActorHandle: null,
          },
        ],
        player: {
          actorHandle: PUBLIC_HANDLES.actorPlayer,
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
          currentPlaceHandle: PUBLIC_HANDLES.placeBroad,
          sceneHandle: PUBLIC_HANDLES.placeScene,
        },
        personaTemplates: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1");

    expect(world.locations[0]?.id).toBe(PUBLIC_HANDLES.placeBroad);
    expect(world.locations[0]?.connectedTo).toEqual([PUBLIC_HANDLES.placeNext]);
    expect(world.locations[0]?.connectedPaths?.[0]).toMatchObject({
      edgeId: PUBLIC_HANDLES.routeNext,
      routeHandle: PUBLIC_HANDLES.routeNext,
      toLocationId: PUBLIC_HANDLES.placeNext,
      toPlaceHandle: PUBLIC_HANDLES.placeNext,
    });
    expect(world.currentScene?.id).toBe(PUBLIC_HANDLES.placeScene);
    expect(world.currentScene?.sceneNpcIds).toEqual([PUBLIC_HANDLES.actorNpc]);
    expect(world.npcs[0]?.id).toBe(PUBLIC_HANDLES.actorNpc);
    expect(world.npcs[0]?.currentLocationId).toBe(PUBLIC_HANDLES.placeBroad);
    expect(world.items[0]?.id).toBe(PUBLIC_HANDLES.itemLantern);
    expect(world.player?.id).toBe(PUBLIC_HANDLES.actorPlayer);
  });

  it("getWorldData ignores private npc identity envelopes on the gameplay world surface", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: null,
        locations: [],
        npcs: [
          {
            actorHandle: PUBLIC_HANDLES.actorNpc,
            name: "Station Guard",
            persona: "Keeps people moving.",
            tags: "[]",
            tier: "supporting",
            currentPlaceHandle: PUBLIC_HANDLES.placeBroad,
            sceneHandle: PUBLIC_HANDLES.placeScene,
            goals: "{\"short_term\":[\"Watch the gates\"],\"long_term\":[]}",
            beliefs: "[]",
            characterRecord: {
              identity: { id: "npc-raw-1", displayName: "Raw Guard" },
            },
            draft: {
              identity: { displayName: "Draft Guard" },
            },
            npc: {
              name: "Legacy Guard",
              draft: { identity: { displayName: "Legacy Draft Guard" } },
            },
          },
        ],
        factions: [],
        relationships: [],
        items: [],
        player: null,
        personaTemplates: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1");

    expect(world.npcs[0]).toMatchObject({
      id: PUBLIC_HANDLES.actorNpc,
      name: "Station Guard",
      persona: "",
      goals: { short_term: [], long_term: [] },
      beliefs: [],
      characterRecord: null,
      draft: null,
      npc: null,
    });
    expect(JSON.stringify(world.npcs[0])).not.toContain("Keeps people moving");
    expect(JSON.stringify(world.npcs[0])).not.toContain("Watch the gates");
    expect(JSON.stringify(world.npcs[0])).not.toContain("Raw Guard");
    expect(JSON.stringify(world.npcs[0])).not.toContain("Draft Guard");
    expect(JSON.stringify(world.npcs[0])).not.toContain("Legacy Guard");
  });

  it("getWorldData exposes NPC semantic fields only for explicit review projection", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: null,
        locations: [],
        npcs: [
          {
            actorHandle: PUBLIC_HANDLES.actorNpc,
            name: "Station Guard",
            persona: "Keeps people moving.",
            tags: "[]",
            tier: "supporting",
            currentPlaceHandle: PUBLIC_HANDLES.placeBroad,
            sceneHandle: PUBLIC_HANDLES.placeScene,
            goals: "{\"short_term\":[\"Watch the gates\"],\"long_term\":[]}",
            beliefs: "[\"Queues should keep moving.\"]",
          },
        ],
        factions: [],
        relationships: [],
        items: [],
        player: null,
        personaTemplates: [],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("camp-1", { projection: "review" });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/campaigns/camp-1/world?projection=review");
    expect(world.npcs[0]).toMatchObject({
      id: PUBLIC_HANDLES.actorNpc,
      name: "Station Guard",
      persona: "Keeps people moving.",
      goals: { short_term: ["Watch the gates"], long_term: [] },
      beliefs: ["Queues should keep moving."],
      characterRecord: null,
      draft: null,
      npc: null,
    });
  });

  it("getWorldData refuses to promote raw backend ids from legacy fields into public handles", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: {
          id: "scene-platform-7",
          broadLocationId: "loc-shibuya-station",
          sceneNpcIds: ["npc-1"],
          clearNpcIds: ["npc-1"],
          awareness: {
            byNpcId: {
              "npc-1": "clear",
            },
          },
        },
        locations: [
          {
            id: "loc-shibuya-station",
            name: "Shibuya Station",
            description: "Transit hum.",
            tags: [],
            connectedTo: ["loc-exit-13"],
            connectedPaths: [
              {
                edgeId: "route-main",
                toLocationId: "loc-exit-13",
                travelCost: 1,
              },
            ],
            recentHappenings: [
              {
                id: "event-1",
                locationId: "loc-shibuya-station",
                eventType: "rumor",
                summary: "A raw event should not become authority.",
                tick: 1,
                importance: 1,
                createdAt: 1,
              },
            ],
            isStarting: true,
          },
        ],
        npcs: [
          {
            id: "npc-1",
            name: "Station Guard",
            persona: "",
            tags: "[]",
            tier: "supporting",
            currentLocationId: "loc-shibuya-station",
            sceneScopeId: "scene-platform-7",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
        ],
        factions: [
          {
            id: "faction-1",
            name: "Transit Office",
            tags: "[]",
            goals: "[]",
            assets: "[]",
          },
        ],
        relationships: [
          {
            id: "relationship-1",
            entityA: "npc-1",
            entityB: "faction-1",
            tags: "[]",
            reason: null,
          },
        ],
        items: [
          {
            id: "item-1",
            name: "Lantern",
            tags: "[]",
            ownerId: "player-1",
            locationId: "loc-shibuya-station",
          },
        ],
        player: {
          id: "player-1",
          name: "Yuji Itadori",
          race: "",
          gender: "",
          age: "",
          appearance: "",
          hp: 5,
          tags: "[]",
          equippedItems: "[]",
          inventory: [{ id: "item-1", name: "Lantern", equipState: "carried" }],
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

    expect(world.currentScene).toBeNull();
    expect(world.locations).toEqual([]);
    expect(world.npcs).toEqual([]);
    expect(world.factions).toEqual([]);
    expect(world.relationships).toEqual([]);
    expect(world.items).toEqual([]);
    expect(world.player).toBeNull();
    expect(JSON.stringify(world)).not.toMatch(/(?:loc|npc|item|faction|relationship|player)-/);
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

  it("normalizes oracle_result to outcome-only and drops leaked reasoning and math", async () => {
    const onOracleResult = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: oracle_result",
        'data: {"outcome":"weak_hit","chance":65,"roll":42,"reasoning":"SECRET","rationale":"SECRET_RATIONALE"}',
        "",
        "event: done",
        "data: {}",
        "",
      ].join("\n")),
      {
        onNarrative: vi.fn(),
        onOracleResult,
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onOracleResult).toHaveBeenCalledWith({ outcome: "weak_hit" });
    expect(JSON.stringify(onOracleResult.mock.calls[0]?.[0])).not.toContain("65");
    expect(JSON.stringify(onOracleResult.mock.calls[0]?.[0])).not.toContain("42");
    expect(JSON.stringify(onOracleResult.mock.calls[0]?.[0])).not.toContain("SECRET");
  });

  it("preserves quick-action capability handles while normalizing the event payload", async () => {
    const onQuickActions = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: quick_actions",
        "data: {\"actions\":[{\"label\":\"Ask\",\"action\":\"Ask the clerk.\",\"handle\":\"qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\",\"debug\":\"hidden\"}]}",
        "",
        "event: done",
        "data: {}",
        "",
      ].join("\n")),
      {
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onQuickActions).toHaveBeenCalledWith([{
      label: "Ask",
      action: "Ask the clerk.",
      handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    }]);
    expect(JSON.stringify(onQuickActions.mock.calls[0]?.[0])).not.toContain("hidden");
  });

  it("drops streamed quick actions that lack backend capability handles", async () => {
    const onQuickActions = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: quick_actions",
        "data: {\"actions\":[{\"label\":\"Ask\",\"action\":\"Ask the clerk.\"},{\"label\":\"Move\",\"action\":\"Move closer.\",\"handle\":\"not-a-capability\"}]}",
        "",
        "event: done",
        "data: {}",
        "",
      ].join("\n")),
      {
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onQuickActions).toHaveBeenCalledWith([]);
  });

  it("dispatches a dedicated finalization callback before done", async () => {
    const onFinalizing = vi.fn();
    const onDone = vi.fn();

    await parseTurnSSE(
      createStream([
        'event: narrative',
        'data: {"text":"The gate trembles."}',
        "",
        "event: finalizing_turn",
        "data: {\"stage\":\"rollback_critical\",\"tick\":7}",
        "",
        "event: done",
        "data: {\"tick\":7,\"worldVersion\":2,\"worldTimeMinutes\":45}",
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
    expect(onFinalizing).toHaveBeenCalledWith({ stage: "rollback_critical", tick: 7 });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onFinalizing.mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
  });

  it("passes done boundary metadata to completion handlers", async () => {
    const onDone = vi.fn();

    await parseTurnSSE(
      createStream([
        'event: narrative',
        'data: {"text":"The gate trembles."}',
        "",
        "event: finalizing_turn",
        "data: {\"stage\":\"rollback_critical\"}",
        "",
        "event: done",
        "data: {\"tick\":12,\"worldVersion\":4,\"worldTimeMinutes\":90,\"privateTerm\":\"hidden\"}",
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
    );

    expect(onDone).toHaveBeenCalledWith({
      tick: 12,
      worldVersion: 4,
      worldTimeMinutes: 90,
    });
    expect(JSON.stringify(onDone.mock.calls[0]?.[0])).not.toContain("hidden");
  });

  it("normalizes safe stage payloads and drops hidden progress fields", async () => {
    const onSceneSettling = vi.fn();
    const onFinalizing = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: scene-settling",
        "data: {\"stage\":\"scene-settling\",\"stageId\":\"resolving-nearby-reactions\",\"phase\":\"actor-reactions\",\"criticality\":\"L1\",\"criticalPath\":true,\"hiddenActorName\":\"Hidden Watcher\",\"proposalId\":\"proposal-secret\"}",
        "",
        'event: narrative',
        'data: {"text":"The gate trembles."}',
        "",
        "event: finalizing_turn",
        "data: {\"stage\":\"rollback_critical\",\"stageId\":\"advancing-world-time\",\"tick\":8,\"privateTerm\":\"Forest Outpost\"}",
        "",
        "event: done",
        "data: {\"tick\":7,\"worldVersion\":2,\"worldTimeMinutes\":45}",
        "",
      ].join("\n")),
      {
        onSceneSettling,
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onFinalizing,
        onDone: vi.fn(),
        onError: vi.fn(),
      },
    );

    expect(onSceneSettling).toHaveBeenCalledWith({
      stage: "scene-settling",
      stageId: "resolving-nearby-reactions",
      phase: "actor-reactions",
      criticality: "L1",
      criticalPath: true,
    });
    expect(onFinalizing).toHaveBeenCalledWith({
      stage: "rollback_critical",
      stageId: "advancing-world-time",
      tick: 8,
    });
    expect(JSON.stringify(onSceneSettling.mock.calls[0]?.[0])).not.toContain("Hidden Watcher");
    expect(JSON.stringify(onSceneSettling.mock.calls[0]?.[0])).not.toContain("proposal-secret");
    expect(JSON.stringify(onFinalizing.mock.calls[0]?.[0])).not.toContain("Forest Outpost");
  });

  it("ignores finalizing_turn safely when the optional callback is omitted", async () => {
    const onDone = vi.fn();

    await expect(
      parseTurnSSE(
        createStream([
          'event: narrative',
          'data: {"text":"The gate trembles."}',
          "",
          "event: finalizing_turn",
          "data: {\"tick\":8,\"worldVersion\":3,\"worldTimeMinutes\":50}",
          "",
          "event: done",
          "data: {\"tick\":8,\"worldVersion\":3,\"worldTimeMinutes\":50}",
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

  it("reports done-without-visible-narrative as an accepted turn error", async () => {
    const onNarrative = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: finalizing_turn",
        "data: {\"stage\":\"commit\",\"tick\":8}",
        "",
        "event: done",
        "data: {\"tick\":8,\"worldVersion\":3,\"worldTimeMinutes\":50}",
        "",
      ].join("\n")),
      {
        onNarrative,
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onFinalizing: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onNarrative).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Turn finished without visible narration. Please retry.");
  });

  it("does not count whitespace-only narrative as visible accepted turn text", async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: narrative",
        'data: {"text":"   "}',
        "",
        "event: finalizing_turn",
        "data: {\"stage\":\"commit\",\"tick\":8}",
        "",
        "event: done",
        "data: {\"tick\":8,\"worldVersion\":3,\"worldTimeMinutes\":50}",
        "",
      ].join("\n")),
      {
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onFinalizing: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Turn finished without visible narration. Please retry.");
  });

  it("reports a closed stream with no terminal event or narrative", async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: scene-settling",
        "data: {\"stage\":\"scene_settling\"}",
        "",
      ].join("\n")),
      {
        onSceneSettling: vi.fn(),
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("Turn stream ended before completion.");
  });

  it("reports visible narrative streams that close before done as incomplete", async () => {
    const onNarrative = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: narrative",
        'data: {"text":"The gate opens, but the transport dies."}',
        "",
      ].join("\n")),
      {
        onNarrative,
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onNarrative).toHaveBeenCalledWith("The gate opens, but the transport dies.");
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Turn stream ended before completion.");
  });

  it("reports lookup streams that close before done as incomplete", async () => {
    const onLookupResult = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: lookup_result",
        'data: {"lookupKind":"power_profile","subject":"Gojo","answer":"Bounded answer","citations":[],"uncertaintyNotes":[],"sceneImpact":"Lookup only."}',
        "",
      ].join("\n")),
      {
        onLookupResult,
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onLookupResult).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Turn stream ended before completion.");
  });

  it("keeps lookup-only done streams successful without narrative", async () => {
    const onLookupResult = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: lookup_result",
        'data: {"lookupKind":"power_profile","subject":"Gojo","answer":"Bounded answer","citations":[],"uncertaintyNotes":[],"sceneImpact":"Lookup only."}',
        "",
        "event: done",
        "data: {\"tick\":7,\"worldVersion\":2,\"worldTimeMinutes\":45}",
        "",
      ].join("\n")),
      {
        onLookupResult,
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onLookupResult).toHaveBeenCalledTimes(1);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("normalizes lookup_result payloads before exposing them to the UI", async () => {
    const onLookupResult = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: lookup_result",
        'data: {"lookupKind":"power_profile","subject":"  Gojo  ","answer":"Bounded answer","citations":[{"kind":"research","label":" Character grounding ","excerpt":"Infinity prevents contact.","extra":"ignored"},{"kind":"bad ref","label":"Missing excerpt"}],"uncertaintyNotes":[" Stored facts only. ",""],"sceneImpact":"Lookup only.","extra":"ignored"}',
        "",
        "event: done",
        "data: {\"lookup\":true}",
        "",
      ].join("\n")),
      {
        onLookupResult,
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onLookupResult).toHaveBeenCalledWith({
      lookupKind: "power_profile",
      subject: "Gojo",
      answer: "Bounded answer",
      citations: [
        {
          kind: "research",
          label: "Character grounding",
          excerpt: "Infinity prevents contact.",
        },
      ],
      uncertaintyNotes: ["Stored facts only."],
      sceneImpact: "Lookup only.",
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onError).not.toHaveBeenCalled();
  });

  it("reports malformed lookup_result payloads as projection failures", async () => {
    const onLookupResult = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: lookup_result",
        'data: {"lookupKind":"debug","subject":"Gojo","answer":"Bounded answer","citations":[],"uncertaintyNotes":[],"sceneImpact":"Lookup only."}',
        "",
        "event: done",
        "data: {\"lookup\":true}",
        "",
      ].join("\n")),
      {
        onLookupResult,
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone: vi.fn(),
        onError,
      },
    );

    expect(onLookupResult).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith("Lookup result failed public projection.");
  });

  it("preserves resumed completion metadata for pending narration recovery", async () => {
    const onDone = vi.fn();

    await parseTurnSSE(
      createStream([
        'event: narrative',
        'data: {"text":"The prior turn finally resolves."}',
        "",
        "event: done",
        "data: {\"tick\":9,\"worldVersion\":5,\"worldTimeMinutes\":75,\"resumed\":true}",
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
    );

    expect(onDone).toHaveBeenCalledWith({
      tick: 9,
      worldVersion: 5,
      worldTimeMinutes: 75,
      resumed: true,
    });
  });

  it("reports visible turn streams that finish without durable boundary metadata", async () => {
    const onDone = vi.fn();
    const onError = vi.fn();

    await parseTurnSSE(
      createStream([
        'event: narrative',
        'data: {"text":"The gate trembles."}',
        "",
        "event: done",
        "data: {\"tick\":9}",
        "",
      ].join("\n")),
      {
        onNarrative: vi.fn(),
        onOracleResult: vi.fn(),
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError,
      },
    );

    expect(onDone).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Turn finished without durable boundary metadata. Please refresh before continuing.",
    );
  });

  it("dispatches reasoning on its own event lane without regressing lookup_result, narrative, or done", async () => {
    const onLookupResult = vi.fn();
    const onNarrative = vi.fn();
    const onReasoning = vi.fn();
    const onDone = vi.fn();

    await parseTurnSSE(
      createStream([
        "event: lookup_result",
        'data: {"lookupKind":"power_profile","subject":"Gojo","answer":"Bounded answer","citations":[],"uncertaintyNotes":[],"sceneImpact":"Lookup only."}',
        "",
        "event: narrative",
        'data: {"text":"Infinity warps the air."}',
        "",
        "event: reasoning",
        'data: {"text":"Provider reasoning stays outside canonical narration."}',
        "",
        "event: done",
          "data: {\"tick\":8,\"worldVersion\":3,\"worldTimeMinutes\":50}",
        "",
      ].join("\n")),
      {
        onLookupResult,
        onNarrative,
        onOracleResult: vi.fn(),
        onReasoning,
        onStateUpdate: vi.fn(),
        onQuickActions: vi.fn(),
        onDone,
        onError: vi.fn(),
      },
    );

    expect(onLookupResult).toHaveBeenCalledWith(
      expect.objectContaining({
        lookupKind: "power_profile",
        subject: "Gojo",
      }),
    );
    expect(onNarrative).toHaveBeenCalledWith("Infinity warps the air.");
    expect(onReasoning).toHaveBeenCalledWith({
      text: "Provider reasoning stays outside canonical narration.",
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onLookupResult.mock.invocationCallOrder[0]).toBeLessThan(onNarrative.mock.invocationCallOrder[0]);
    expect(onNarrative.mock.invocationCallOrder[0]).toBeLessThan(onReasoning.mock.invocationCallOrder[0]);
    expect(onReasoning.mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
  });
});

// ---------------------------------------------------------------------------
// Phase 61 — IngestionError transport + overrideText forwarding
// ---------------------------------------------------------------------------

function makeJsonResponse(body: unknown, init: { status: number; statusText?: string }): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: init.statusText ?? "",
    json: async () => body,
  } as unknown as Response;
}

function makeBrokenJsonResponse(init: { status: number; statusText?: string }): Response {
  return {
    ok: init.status >= 200 && init.status < 300,
    status: init.status,
    statusText: init.statusText ?? "",
    json: async () => {
      throw new Error("not json");
    },
  } as unknown as Response;
}

describe("IngestionError transport", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("readIngestionError parses 502 payload into IngestionError with stage+attempts", async () => {
    const response = makeJsonResponse(
      { error: "Draft synthesis failed", stage: "synthesize", attempts: 3 },
      { status: 502 },
    );
    const err = await readIngestionError(response);
    expect(err).toBeInstanceOf(IngestionError);
    const ingestion = err as IngestionError;
    expect(ingestion.stage).toBe("synthesize");
    expect(ingestion.attempts).toBe(3);
    expect(ingestion.message).toBe("Draft synthesis failed");
  });

  it("readIngestionError returns plain Error when payload has no stage", async () => {
    const response = makeJsonResponse({ error: "bad input" }, { status: 400 });
    const err = await readIngestionError(response);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(IngestionError);
    expect(err.message).toBe("bad input");
  });

  it("readIngestionError falls back to statusText when JSON parse fails", async () => {
    const response = makeBrokenJsonResponse({ status: 500, statusText: "Internal Server Error" });
    const err = await readIngestionError(response);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(IngestionError);
    expect(err.message).toBe("Internal Server Error");
  });

  it("apiPost throws IngestionError on 502 response (via parseCharacter)", async () => {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(
        { error: "Power assessment failed", stage: "power_assess", attempts: 3 },
        { status: 502 },
      ),
    );
    await expect(
      parseCharacter("camp-1", "concept", "player"),
    ).rejects.toBeInstanceOf(IngestionError);
  });
});

describe("overrideText forwarding", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockOk() {
    fetchMock.mockResolvedValueOnce(
      makeJsonResponse(
        {
          role: "player",
          character: { identity: { displayName: "Test" } },
          draft: { identity: { displayName: "Test" } },
        },
        { status: 200 },
      ),
    );
  }

  function lastBody(): Record<string, unknown> {
    const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1];
    const init = call?.[1] as RequestInit | undefined;
    return JSON.parse(String(init?.body));
  }

  it("parseCharacter forwards overrideText when provided", async () => {
    mockOk();
    await parseCharacter("camp-1", "concept", "player", [], [], "override text").catch(() => {});
    expect(lastBody()).toMatchObject({ overrideText: "override text" });
  });

  it("parseCharacter omits overrideText when not provided", async () => {
    mockOk();
    await parseCharacter("camp-1", "concept", "player").catch(() => {});
    expect(lastBody()).not.toHaveProperty("overrideText");
  });

  it("parseCharacter omits overrideText when explicitly empty string", async () => {
    mockOk();
    await parseCharacter("camp-1", "concept", "player", [], [], "").catch(() => {});
    expect(lastBody()).not.toHaveProperty("overrideText");
  });

  it("generateCharacter forwards overrideText when provided", async () => {
    mockOk();
    await generateCharacter("camp-1", "player", [], [], "override instructions").catch(() => {});
    expect(lastBody()).toMatchObject({ overrideText: "override instructions" });
  });

  it("researchCharacter forwards overrideText when provided", async () => {
    mockOk();
    await researchCharacter("camp-1", "archetype", "player", [], [], "override details").catch(() => {});
    expect(lastBody()).toMatchObject({ overrideText: "override details" });
  });

  it("importV2Card forwards overrideText via options", async () => {
    mockOk();
    await importV2Card(
      "camp-1",
      {
        name: "Test",
        description: "Desc",
        personality: "Pers",
        scenario: "Scene",
        tags: [],
      },
      { role: "player", overrideText: "override from import" },
    ).catch(() => {});
    expect(lastBody()).toMatchObject({ overrideText: "override from import" });
  });

  it("importV2Card omits overrideText when not provided via options", async () => {
    mockOk();
    await importV2Card(
      "camp-1",
      {
        name: "Test",
        description: "Desc",
        personality: "Pers",
        scenario: "Scene",
        tags: [],
      },
      { role: "player" },
    ).catch(() => {});
    expect(lastBody()).not.toHaveProperty("overrideText");
  });
});
