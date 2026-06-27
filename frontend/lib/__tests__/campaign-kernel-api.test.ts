import { afterEach, describe, expect, it, vi } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import {
  applyWorldDna,
  composeCampaignGraph,
  importPlayerCard,
  loadCampaignKernel,
  parsePlayerCharacterDraft,
  savePlayerCast,
  suggestCampaignWorldDna,
  suggestCampaignWorldDnaCategory,
} from "../campaign-kernel-api";

function ok(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function makeDraft(): CharacterDraft {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Mira Vale",
      canonicalStatus: "original",
    },
    profile: {
      species: "human",
      gender: "",
      ageText: "",
      appearance: "",
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: null,
      relationshipRefs: [],
      socialStatus: [],
      originMode: "native",
    },
    motivations: {
      shortTermGoals: [],
      longTermGoals: [],
      beliefs: [],
      drives: [],
      frictions: [],
    },
    capabilities: {
      traits: [],
      skills: [],
      flaws: [],
      specialties: [],
      wealthTier: null,
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "idle",
    },
    loadout: {
      inventorySeed: [],
      equippedItemRefs: [],
      currencyNotes: "",
      signatureItems: [],
    },
    startConditions: {},
    provenance: {
      sourceKind: "player-input",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

describe("campaign kernel API helpers", () => {
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

  it("loads the campaign kernel from the kernel API surface", async () => {
    fetchMock.mockResolvedValue(ok({ kernel: { campaignId: "camp-1" } }));
    vi.stubGlobal("fetch", fetchMock);

    await loadCampaignKernel("camp-1");

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3001/api/kernel/campaigns/camp-1/kernel");
  });

  it("applies World DNA through the kernel API", async () => {
    fetchMock.mockResolvedValue(ok({
      campaign: { id: "camp-1" },
      kernel: { campaignId: "camp-1" },
      worldDna: { geography: "Coast" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await applyWorldDna("camp-1", {
      seeds: {
        geography: "Coast",
        politicalStructure: "Guild council",
        centralConflict: "Trade war",
        culturalFlavor: ["Lantern rites"],
        environment: "Storm season",
        wildcard: "Talking maps",
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/world-dna/apply",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toMatchObject({
      seeds: {
        geography: "Coast",
        culturalFlavor: ["Lantern rites"],
      },
    });
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/api/worldgen");
  });

  it("re-rolls all World DNA through the kernel API", async () => {
    fetchMock.mockResolvedValue(ok({
      seeds: {
        geography: "New coast",
        politicalStructure: "New council",
        centralConflict: "New war",
        culturalFlavor: ["New rites"],
        environment: "New storm",
        wildcard: "New maps",
      },
    }));
    vi.stubGlobal("fetch", fetchMock);

    await suggestCampaignWorldDna("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/world-dna/suggest",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toEqual({});
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/api/worldgen");
  });

  it("re-rolls one World DNA category through the kernel API", async () => {
    fetchMock.mockResolvedValue(ok({ category: "geography", value: "New coast" }));
    vi.stubGlobal("fetch", fetchMock);

    await suggestCampaignWorldDnaCategory("camp-1", "geography");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/world-dna/suggest-category",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toEqual({ category: "geography" });
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/api/worldgen");
  });

  it("parses player drafts through the kernel API", async () => {
    fetchMock.mockResolvedValue(ok({ draft: makeDraft() }));
    vi.stubGlobal("fetch", fetchMock);

    await parsePlayerCharacterDraft("camp-1", {
      concept: "A courier.",
      overrideText: "Keep it grounded.",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/player/parse",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toEqual({
      concept: "A courier.",
      overrideText: "Keep it grounded.",
    });
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("/api/worldgen");
  });

  it("imports player cards through the kernel API", async () => {
    fetchMock.mockResolvedValue(ok({ draft: makeDraft() }));
    vi.stubGlobal("fetch", fetchMock);

    await importPlayerCard(
      "camp-1",
      {
        name: "Mira",
        description: "desc",
        personality: "calm",
        scenario: "station",
        tags: ["rail"],
        mesExample: "",
      },
      { importMode: "outsider" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/player/import-card",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toMatchObject({
      name: "Mira",
      importMode: "outsider",
    });
  });

  it("saves player cast through the kernel API", async () => {
    const draft = makeDraft();
    fetchMock.mockResolvedValue(ok({ kernel: { campaignId: "camp-1" }, playerCharacter: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await savePlayerCast("camp-1", {
      draft,
      source: "player_created",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/cast/player",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toMatchObject({
      draft,
      source: "player_created",
    });
  });

  it("composes campaign graph through the kernel API", async () => {
    fetchMock.mockResolvedValue(ok({ kernel: { campaignId: "camp-1" }, worldGraph: { nodes: [], edges: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await composeCampaignGraph("camp-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:3001/api/kernel/campaigns/camp-1/graph/compose",
      expect.objectContaining({ method: "POST" }),
    );
    expect(lastBody()).toEqual({});
  });
});
