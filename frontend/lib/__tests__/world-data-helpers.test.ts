import { describe, it, expect } from "vitest";
import {
  buildIdMaps,
  buildRelationshipMaps,
  toEditableScaffold,
} from "../world-data-helpers";
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
    ...overrides,
  };
}

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
