import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";
import type {
  CharacterDraft,
  LocationKind,
  LocationPersistence,
} from "@worldforge/shared";
import {
  buildIdMaps,
  buildRelationshipMaps,
  toEditableScaffold,
} from "../world-data-helpers";
import { getWorldData } from "../api";
import type { WorldData, LoreCardItem } from "../api-types";

/** Minimal WorldData fixture with 2 locations, 1 faction, 2 NPCs, 2 relationships. */
function makeWorldData(overrides?: Partial<WorldData>): WorldData {
  return {
    locations: [
      {
        id: "loc-1",
        campaignId: "c1",
        name: "Tavern",
        description: "A cozy tavern",
        tags: ["safe"],
        connectedTo: ["loc-2"],
        isStarting: true,
      },
      {
        id: "loc-2",
        campaignId: "c1",
        name: "Market",
        description: "A busy market",
        tags: ["trade"],
        connectedTo: ["loc-1"],
        isStarting: false,
      },
    ],
    npcs: [
      {
        id: "npc-1",
        campaignId: "c1",
        name: "Bartender",
        persona: "Friendly innkeeper",
        tags: ["friendly"],
        tier: "key",
        currentLocationId: "loc-1",
        goals: { short_term: ["serve drinks"], long_term: ["retire"] },
        beliefs: [],
      },
      {
        id: "npc-2",
        campaignId: "c1",
        name: "Wanderer",
        persona: "Mysterious traveler",
        tags: ["mysterious"],
        tier: "temporary",
        currentLocationId: null,
        goals: { short_term: [], long_term: [] },
        beliefs: [],
      },
    ],
    factions: [
      {
        id: "fac-1",
        campaignId: "c1",
        name: "Guild",
        tags: ["powerful"],
        goals: ["control trade"],
        assets: ["gold"],
      },
    ],
    relationships: [
      {
        id: "rel-1",
        campaignId: "c1",
        entityA: "fac-1",
        entityB: "loc-1",
        tags: ["Controls"],
        reason: null,
      },
      {
        id: "rel-2",
        campaignId: "c1",
        entityA: "npc-1",
        entityB: "fac-1",
        tags: ["Member"],
        reason: null,
      },
    ],
    items: [],
    player: null,
    personaTemplates: [],
    ...overrides,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("WorldData location typing", () => {
  it("reuses shared location lifecycle vocabulary", () => {
    type WorldLocation = WorldData["locations"][number];

    expectTypeOf<WorldLocation["locationKind"]>().toEqualTypeOf<
      LocationKind | null | undefined
    >();
    expectTypeOf<WorldLocation["persistence"]>().toEqualTypeOf<
      LocationPersistence | null | undefined
    >();
  });
});

describe("getWorldData", () => {
  it("parses connected paths and recent happenings while deriving compatibility connectedTo from the path graph", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locations: [
          {
            id: "loc-1",
            campaignId: "c1",
            name: "Shibuya Crossing",
            description: "Macro hub",
            tags: JSON.stringify(["urban"]),
            isStarting: true,
            kind: "macro",
            persistence: "persistent",
            connectedPaths: [
              {
                edgeId: "edge-1",
                toLocationId: "loc-2",
                toLocationName: "Shibuya Station",
                travelCost: 2,
              },
            ],
            recentHappenings: [
              {
                id: "event-1",
                locationId: "loc-1",
                sourceLocationId: "scene-1",
                anchorLocationId: "loc-1",
                eventType: "ephemeral_scene",
                summary: "A rooftop clash spilled cursed residue into the crossing.",
                tick: 12,
                importance: 4,
                archivedAtTick: 13,
                createdAt: 1700000000000,
              },
            ],
          },
        ],
        npcs: [],
        factions: [],
        relationships: [],
        items: [],
        player: null,
        personaTemplates: [],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("c1");

    expect(world.locations[0]).toMatchObject({
      connectedTo: ["loc-2"],
      connectedPaths: [
        {
          edgeId: "edge-1",
          toLocationId: "loc-2",
          toLocationName: "Shibuya Station",
          travelCost: 2,
        },
      ],
      recentHappenings: [
        expect.objectContaining({
          summary: "A rooftop clash spilled cursed residue into the crossing.",
        }),
      ],
      locationKind: "macro",
      persistence: "persistent",
    });
  });

  it("keeps richer world fields optional enough for older payloads", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        locations: [
          {
            id: "loc-1",
            campaignId: "c1",
            name: "Old Tavern",
            description: "Compatibility payload",
            tags: JSON.stringify(["safe"]),
            connectedTo: JSON.stringify(["loc-2"]),
            isStarting: true,
          },
        ],
        npcs: [],
        factions: [],
        relationships: [],
        items: [],
        player: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const world = await getWorldData("c1");

    expect(world.locations[0]).toMatchObject({
      connectedTo: ["loc-2"],
      connectedPaths: [],
      recentHappenings: [],
      locationKind: null,
      persistence: null,
    });
  });
});

describe("buildIdMaps", () => {
  const world = makeWorldData();
  const maps = buildIdMaps(world);

  it("creates locationIdToName map with correct entries", () => {
    expect(maps.locationIdToName.get("loc-1")).toBe("Tavern");
    expect(maps.locationIdToName.get("loc-2")).toBe("Market");
    expect(maps.locationIdToName.size).toBe(2);
  });

  it("creates factionIdToName map with correct entries", () => {
    expect(maps.factionIdToName.get("fac-1")).toBe("Guild");
    expect(maps.factionIdToName.size).toBe(1);
  });

  it("creates npcIdToName map with correct entries", () => {
    expect(maps.npcIdToName.get("npc-1")).toBe("Bartender");
    expect(maps.npcIdToName.get("npc-2")).toBe("Wanderer");
    expect(maps.npcIdToName.size).toBe(2);
  });
});

describe("buildRelationshipMaps", () => {
  it("identifies Controls relationships (faction->location territory)", () => {
    const world = makeWorldData();
    const maps = buildIdMaps(world);
    const { factionTerritories } = buildRelationshipMaps(world, maps);

    expect(factionTerritories.get("Guild")).toEqual(["Tavern"]);
  });

  it("identifies Member relationships (npc->faction membership)", () => {
    const world = makeWorldData();
    const maps = buildIdMaps(world);
    const { npcFaction } = buildRelationshipMaps(world, maps);

    expect(npcFaction.get("Bartender")).toBe("Guild");
    expect(npcFaction.has("Wanderer")).toBe(false);
  });

  it("ignores relationships with unknown IDs", () => {
    const world = makeWorldData({
      relationships: [
        {
          id: "rel-x",
          campaignId: "c1",
          entityA: "unknown-id",
          entityB: "loc-1",
          tags: ["Controls"],
          reason: null,
        },
        {
          id: "rel-y",
          campaignId: "c1",
          entityA: "npc-1",
          entityB: "unknown-fac",
          tags: ["Member"],
          reason: null,
        },
      ],
    });
    const maps = buildIdMaps(world);
    const { factionTerritories, npcFaction } = buildRelationshipMaps(world, maps);

    expect(factionTerritories.size).toBe(0);
    expect(npcFaction.size).toBe(0);
  });
});

describe("toEditableScaffold", () => {
  const lore: LoreCardItem[] = [
    { id: "lore-1", term: "Dragon", definition: "A fire-breathing beast", category: "creature" },
  ];

  it("converts location connectedTo from IDs to names", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "A test premise", lore);

    expect(scaffold.locations[0].connectedTo).toEqual(["Market"]);
    expect(scaffold.locations[1].connectedTo).toEqual(["Tavern"]);
  });

  it("prefers connected path destinations over stale connectedTo compatibility arrays", () => {
    const world = makeWorldData({
      locations: [
        {
          id: "loc-1",
          campaignId: "c1",
          name: "Tavern",
          description: "A cozy tavern",
          tags: ["safe"],
          connectedTo: ["stale-edge"],
          connectedPaths: [
            {
              edgeId: "edge-1",
              toLocationId: "loc-2",
              toLocationName: "Market",
              travelCost: 2,
            },
          ],
          recentHappenings: [],
          isStarting: true,
        },
        {
          id: "loc-2",
          campaignId: "c1",
          name: "Market",
          description: "A busy market",
          tags: ["trade"],
          connectedTo: [],
          connectedPaths: [],
          recentHappenings: [],
          isStarting: false,
        },
      ],
    });

    const scaffold = toEditableScaffold(world, "A test premise", lore);

    expect(scaffold.locations[0].connectedTo).toEqual(["Market"]);
  });

  it("maps NPC currentLocationId to locationName", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "", lore);

    expect(scaffold.npcs[0].locationName).toBe("Tavern");
  });

  it("sets NPC locationName to empty string when currentLocationId is null", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "", lore);

    expect(scaffold.npcs[1].locationName).toBe("");
  });

  it("maps NPC factionName from Member relationships", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "", lore);

    expect(scaffold.npcs[0].factionName).toBe("Guild");
    expect(scaffold.npcs[1].factionName).toBeNull();
  });

  it("handles NPC goals in snake_case format", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "", []);

    expect(scaffold.npcs[0].goals).toEqual({
      shortTerm: ["serve drinks"],
      longTerm: ["retire"],
    });
  });

  it("handles NPC goals in camelCase format", () => {
    const world = makeWorldData({
      npcs: [
        {
          id: "npc-cc",
          campaignId: "c1",
          name: "CamelNpc",
          persona: "test",
          tags: [],
          tier: "key",
          currentLocationId: null,
          goals: { shortTerm: ["explore"], longTerm: ["discover"] } as unknown as { short_term: string[]; long_term: string[] },
          beliefs: [],
        },
      ],
    });
    const scaffold = toEditableScaffold(world, "", []);

    expect(scaffold.npcs[0].goals).toEqual({
      shortTerm: ["explore"],
      longTerm: ["discover"],
    });
  });

  it("prefers canonical npc draft fields over legacy persona/tag blobs", () => {
    const draft: CharacterDraft = {
      identity: {
        role: "npc",
        tier: "key",
        displayName: "Draft Bartender",
        canonicalStatus: "original",
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "Keeps notes on every patron",
      },
      socialContext: {
        factionId: null,
        factionName: "Guild",
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Market",
        relationshipRefs: [],
        socialStatus: ["connected"],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: ["Gather rumors"],
        longTermGoals: ["Control the tavern trade"],
        beliefs: [],
        drives: ["Order"],
        frictions: ["Distrusts adventurers"],
      },
      capabilities: {
        traits: ["observant"],
        skills: [],
        flaws: ["possessive"],
        specialties: [],
        wealthTier: null,
      },
      state: {
        hp: 5,
        conditions: [],
        statusFlags: [],
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {},
      provenance: {
        sourceKind: "worldgen",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: ["friendly"],
      },
    };

    const scaffold = toEditableScaffold(
      makeWorldData({
        npcs: [
          {
            id: "npc-1",
            campaignId: "c1",
            name: "Legacy Bartender",
            persona: "Friendly innkeeper",
            tags: ["friendly"],
            tier: "key",
            currentLocationId: "loc-1",
            goals: { short_term: ["serve drinks"], long_term: ["retire"] },
            beliefs: [],
            draft,
          },
        ],
      }),
      "",
      [],
    );

    expect(scaffold.npcs[0]).toMatchObject({
      name: "Draft Bartender",
      persona: "Keeps notes on every patron",
      locationName: "Market",
      factionName: "Guild",
      goals: {
        shortTerm: ["Gather rumors"],
        longTerm: ["Control the tavern trade"],
      },
      draft,
    });
    expect(scaffold.npcs[0].tags).toContain("observant");
    expect(scaffold.npcs[0].tags).toContain("Order");
  });

  it("prefers draft.identity.tier over legacy row tier when both are present", () => {
    const draft: CharacterDraft = {
      identity: {
        role: "npc",
        tier: "supporting",
        displayName: "Archivist Pell",
        canonicalStatus: "original",
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "Tracks every ship that enters port",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: null,
        currentLocationName: "Market",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
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
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {},
      provenance: {
        sourceKind: "worldgen",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: [],
      },
    };

    const scaffold = toEditableScaffold(
      makeWorldData({
        npcs: [
          {
            id: "npc-tier-1",
            campaignId: "c1",
            name: "Archivist Pell",
            persona: "Legacy persona",
            tags: [],
            tier: "key",
            currentLocationId: "loc-1",
            goals: { short_term: [], long_term: [] },
            beliefs: [],
            draft,
          },
        ],
      }),
      "",
      [],
    );

    expect(scaffold.npcs[0].tier).toBe("supporting");
  });

  it("maps legacy persistent runtime rows to supporting scaffold NPCs when draft is missing", () => {
    const scaffold = toEditableScaffold(
      makeWorldData({
        npcs: [
          {
            id: "npc-tier-2",
            campaignId: "c1",
            name: "Harbor Clerk",
            persona: "Keeps the manifests",
            tags: [],
            tier: "persistent",
            currentLocationId: "loc-1",
            goals: { short_term: [], long_term: [] },
            beliefs: [],
          },
        ],
      }),
      "",
      [],
    );

    expect(scaffold.npcs[0].tier).toBe("supporting");
  });

  it("falls back to key only when neither draft tier nor legacy row tier exists", () => {
    const scaffold = toEditableScaffold(
      makeWorldData({
        npcs: [
          {
            id: "npc-tier-3",
            campaignId: "c1",
            name: "Unknown Stranger",
            persona: "No file on record",
            tags: [],
            tier: undefined as unknown as string,
            currentLocationId: null,
            goals: { short_term: [], long_term: [] },
            beliefs: [],
          },
        ],
      }),
      "",
      [],
    );

    expect(scaffold.npcs[0].tier).toBe("key");
  });

  it("transforms lore cards into simplified objects", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "premise", lore);

    expect(scaffold.loreCards).toEqual([
      { term: "Dragon", definition: "A fire-breathing beast", category: "creature" },
    ]);
  });

  it("maps faction territoryNames from Controls relationships", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "", []);

    expect(scaffold.factions[0].territoryNames).toEqual(["Tavern"]);
  });

  it("filters out unknown connectedTo IDs (returns only valid names)", () => {
    const world = makeWorldData({
      locations: [
        {
          id: "loc-1",
          campaignId: "c1",
          name: "Tavern",
          description: "A cozy tavern",
          tags: [],
          connectedTo: ["loc-2", "loc-unknown"],
          isStarting: true,
        },
        {
          id: "loc-2",
          campaignId: "c1",
          name: "Market",
          description: "A busy market",
          tags: [],
          connectedTo: [],
          isStarting: false,
        },
      ],
    });
    const scaffold = toEditableScaffold(world, "", []);

    expect(scaffold.locations[0].connectedTo).toEqual(["Market"]);
  });

  it("sets refinedPremise from the premise parameter", () => {
    const world = makeWorldData();
    const scaffold = toEditableScaffold(world, "Epic adventure begins", []);

    expect(scaffold.refinedPremise).toBe("Epic adventure begins");
  });
});
