import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  chatAction,
  chatEdit,
  chatHistory,
  chatLookup,
  chatRetry,
  chatUndo,
  deleteLoreCardById,
  generateWorld,
  generateCharacter,
  getWorldData,
  importV2Card,
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

  it("getWorldData keeps authoritative currentScene ids separate from same-broad NPC rows", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({
        currentScene: {
          id: "scene-platform-7",
          name: "Platform 7",
          broadLocationId: "loc-shibuya-station",
          broadLocationName: "Shibuya Station",
          sceneNpcIds: ["npc-clear", "npc-hint"],
          clearNpcIds: ["npc-clear"],
          awareness: {
            byNpcId: {
              "npc-clear": "clear",
              "npc-hint": "hint",
              "npc-sibling": "clear",
            },
            hintSignals: ["A cursed echo carries from another platform."],
          },
        },
        locations: [],
        npcs: [
          {
            id: "npc-clear",
            campaignId: "camp-1",
            name: "Concourse Warden",
            persona: "",
            tags: "[]",
            tier: "supporting",
            currentLocationId: "loc-shibuya-station",
            sceneScopeId: "scene-platform-7",
            goals: "{\"short_term\":[],\"long_term\":[]}",
            beliefs: "[]",
          },
          {
            id: "npc-sibling",
            campaignId: "camp-1",
            name: "Rooftop Lookout",
            persona: "",
            tags: "[]",
            tier: "supporting",
            currentLocationId: "loc-shibuya-station",
            sceneScopeId: "scene-rooftop",
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

    expect(world.currentScene?.sceneNpcIds).toEqual(["npc-clear", "npc-hint"]);
    expect(world.currentScene?.clearNpcIds).toEqual(["npc-clear"]);
    expect(world.currentScene?.awareness.byNpcId["npc-sibling"]).toBe("clear");
    expect(world.npcs.map((npc) => npc.id)).toEqual(["npc-clear", "npc-sibling"]);
    expect(world.npcs[1]?.currentLocationId).toBe("loc-shibuya-station");
    expect(world.npcs[1]?.sceneScopeId).toBe("scene-rooftop");
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
        "data: {\"stage\":\"rollback_critical\",\"tick\":7}",
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
    expect(onFinalizing).toHaveBeenCalledWith({ stage: "rollback_critical", tick: 7 });
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onFinalizing.mock.invocationCallOrder[0]).toBeLessThan(onDone.mock.invocationCallOrder[0]);
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
        "data: {}",
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
        "data: {}",
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
        "data: {}",
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
        "data: {}",
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
        "data: {}",
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
