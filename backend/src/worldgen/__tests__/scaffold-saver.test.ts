import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Track all DB calls ----
interface DbCall {
  op: "insert" | "update" | "delete";
  table: string;
  data?: unknown;
  where?: unknown;
}

const dbCalls: DbCall[] = [];

// ---- Mock crypto.randomUUID to return predictable IDs ----
let uuidCounter = 0;
vi.mock("node:crypto", () => ({
  default: {
    randomUUID: () => `uuid-${++uuidCounter}`,
  },
}));

// ---- Mock DB schema symbols (inline, no external refs) ----
vi.mock("../../db/schema.js", () => ({
  campaigns: { _name: "campaigns" },
  locations: { _name: "locations", id: "locations.id" },
  locationEdges: { _name: "location_edges", campaignId: "location_edges.campaignId" },
  locationRecentEvents: {
    _name: "location_recent_events",
    campaignId: "location_recent_events.campaignId",
  },
  items: { _name: "items", campaignId: "items.campaignId" },
  factions: { _name: "factions" },
  npcs: { _name: "npcs" },
  players: { _name: "players", campaignId: "players.campaignId" },
  relationships: { _name: "relationships", campaignId: "relationships.campaignId" },
}));

// ---- Mock drizzle-orm eq ----
vi.mock("drizzle-orm", () => ({
  eq: (col: unknown, val: unknown) => ({ _eq: { col, val } }),
}));

// ---- Build chainable mock DB ----
function createChainableMock(table: unknown) {
  const chain = {
    _table: table,
    values: (data: unknown) => {
      dbCalls.push({ op: "insert", table: (table as { _name: string })._name, data });
      return chain;
    },
    set: (data: unknown) => {
      chain._setData = data;
      return chain;
    },
    where: (condition: unknown) => {
      chain._where = condition;
      return chain;
    },
    run: () => {
      if (chain._setData) {
        dbCalls.push({ op: "update", table: (table as { _name: string })._name, data: chain._setData, where: chain._where });
      }
      if (chain._isDelete) {
        dbCalls.push({ op: "delete", table: (table as { _name: string })._name, where: chain._where });
      }
    },
    _setData: undefined as unknown,
    _where: undefined as unknown,
    _isDelete: false,
  };
  return chain;
}

const mockTx = {
  insert: (table: unknown) => createChainableMock(table),
  update: (table: unknown) => createChainableMock(table),
  delete: (table: unknown) => {
    const chain = createChainableMock(table);
    chain._isDelete = true;
    return chain;
  },
};

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(() => ({
    transaction: (fn: (tx: unknown) => void) => fn(mockTx),
  })),
}));

// ---- Import after mocks ----
import type { PowerStats } from "@worldforge/shared";
import { saveScaffoldToDb } from "../scaffold-saver.js";
import type { WorldScaffold } from "../types.js";
import {
  DENSE_LOCATION_EXPECTED,
  makeDenseLocationScaffold,
  type DenseLocationWorldScaffold,
} from "./fixtures/dense-location-scaffold.js";

// ---- Test data ----
function buildScaffold(): WorldScaffold {
  return {
    refinedPremise: "A dark fantasy world torn by war.",
    locations: [
      {
        name: "Castle Keep",
        description: "A fortified castle atop a hill.",
        tags: ["fortified", "military"],
        isStarting: true,
        connectedTo: ["Dark Forest"],
      },
      {
        name: "Dark Forest",
        description: "A dense forest full of dangers.",
        tags: ["wild", "dangerous"],
        isStarting: false,
        connectedTo: ["Castle Keep"],
      },
    ],
    factions: [
      {
        name: "Iron Guard",
        tags: ["military", "honorable"],
        goals: ["Defend the realm"],
        assets: ["castle garrison"],
        territoryNames: ["Castle Keep"],
      },
    ],
    npcs: [
      {
        name: "Captain Aldric",
        persona: "A stern but fair military commander.",
        tags: ["veteran", "leader"],
        goals: { shortTerm: ["Patrol borders"], longTerm: ["Unite the kingdoms"] },
        locationName: "Castle Keep",
        factionName: "Iron Guard",
        tier: "key" as const,
        draft: {
          identity: {
            role: "npc",
            tier: "key",
            displayName: "Captain Aldric",
            canonicalStatus: "original",
          },
          profile: {
            species: "Human",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "A veteran commander.",
            personaSummary: "A stern but fair military commander.",
          },
          socialContext: {
            factionId: null,
            factionName: "Iron Guard",
            homeLocationId: null,
            homeLocationName: null,
            currentLocationId: null,
            currentLocationName: "Castle Keep",
            relationshipRefs: [],
            socialStatus: [],
            originMode: "resident",
          },
          motivations: {
            shortTermGoals: ["Patrol borders"],
            longTermGoals: ["Unite the kingdoms"],
            beliefs: [],
            drives: ["Duty-bound"],
            frictions: [],
          },
          capabilities: {
            traits: ["Veteran"],
            skills: [{ name: "Commander", tier: "Skilled" }],
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
            worldgenOrigin: "scaffold",
            legacyTags: [],
          },
        },
      },
      {
        name: "Mira the Wanderer",
        persona: "A mysterious traveler with no allegiance.",
        tags: ["mysterious", "traveler"],
        goals: { shortTerm: ["Find shelter"], longTerm: ["Discover the truth"] },
        locationName: "Unknown Village",
        factionName: null,
        tier: "supporting" as const,
      },
    ],
    loreCards: [],
  };
}

function getLocationInserts(): Array<Record<string, unknown>> {
  return dbCalls
    .filter((c) => c.op === "insert" && c.table === "locations")
    .map((c) => c.data as Record<string, unknown>);
}

function getLocationByName(name: string): Record<string, unknown> {
  const row = getLocationInserts().find((location) => location.name === name);
  if (!row) {
    throw new Error(`Missing location insert for ${name}`);
  }
  return row;
}

function getEdgeInserts(): Array<Record<string, unknown>> {
  return dbCalls
    .filter((c) => c.op === "insert" && c.table === "location_edges")
    .map((c) => c.data as Record<string, unknown>);
}

function getLocationConnectedProjection(
  locationId: string,
): string[] {
  const locationUpdate = dbCalls
    .filter((c) => c.op === "update" && c.table === "locations")
    .find((c) => c.where && JSON.stringify(c.where).includes(locationId));
  if (!locationUpdate) {
    return [];
  }
  return JSON.parse(
    (locationUpdate.data as Record<string, unknown>).connectedTo as string,
  ) as string[];
}

function getNpcInserts(): Array<Record<string, unknown>> {
  return dbCalls
    .filter((c) => c.op === "insert" && c.table === "npcs")
    .map((c) => c.data as Record<string, unknown>);
}

function getNpcByName(name: string): Record<string, unknown> {
  const row = getNpcInserts().find((npc) => npc.name === name);
  if (!row) {
    throw new Error(`Missing NPC insert for ${name}`);
  }
  return row;
}

describe("saveScaffoldToDb", () => {
  beforeEach(() => {
    dbCalls.length = 0;
    uuidCounter = 0;
  });

  it("calls db.transaction with a function", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    expect(dbCalls.length).toBeGreaterThan(0);
  });

  it("clearExistingScaffold clears player/item location refs before deleting scaffold tables", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const playerReset = dbCalls.find(
      (c) => c.op === "update" && c.table === "players",
    );
    const itemReset = dbCalls.find(
      (c) => c.op === "update" && c.table === "items",
    );
    const deletes = dbCalls.filter((c) => c.op === "delete");

    expect(playerReset?.data).toEqual({
      currentLocationId: null,
      currentSceneLocationId: null,
    });
    expect(itemReset?.data).toEqual({ locationId: null });
    expect(deletes.length).toBe(6);
    expect(deletes[0]!.table).toBe("relationships");
    expect(deletes[1]!.table).toBe("npcs");
    expect(deletes[2]!.table).toBe("factions");
    expect(deletes[3]!.table).toBe("location_recent_events");
    expect(deletes[4]!.table).toBe("location_edges");
    expect(deletes[5]!.table).toBe("locations");
  });

  it("insertLocations creates one row per location with Phase 43 default fields", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const locationInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "locations",
    );
    expect(locationInserts.length).toBe(2);

    const first = locationInserts[0]!.data as Record<string, unknown>;
    expect(first.name).toBe("Castle Keep");
    expect(first.campaignId).toBe("campaign-1");
    expect(first.description).toBe("A fortified castle atop a hill.");
    expect(first.tags).toBe(JSON.stringify(["fortified", "military"]));
    expect(first.isStarting).toBe(true);
    expect(first.kind).toBe("macro");
    expect(first.parentLocationId).toBeNull();
    expect(first.anchorLocationId).toBeNull();
    expect(first.persistence).toBe("persistent");
    expect(first.expiresAtTick).toBeNull();
    expect(first.archivedAtTick).toBeNull();
    expect(first.connectedTo).toBe("[]");
  });

  it("persists explicit dense scaffold sublocations with parent ids", () => {
    saveScaffoldToDb("campaign-1", makeDenseLocationScaffold());

    const macro = getLocationByName(DENSE_LOCATION_EXPECTED.macro);
    expect(macro.kind).toBe("macro");
    expect(macro.parentLocationId).toBeNull();

    for (const expected of DENSE_LOCATION_EXPECTED.sublocations) {
      const sublocation = getLocationByName(expected.name);
      expect(sublocation.kind).toBe("persistent_sublocation");
      expect(sublocation.parentLocationId).toBe(macro.id);
      expect(sublocation.persistence).toBe("persistent");
      expect(JSON.parse(sublocation.tags as string)).toContain("persistent_sublocation");
    }
  });

  it("adds containment travel edges between macro and sublocation rows without relying on connectedTo", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.locations = scaffold.locations.map((location) => ({
      ...location,
      connectedTo: [],
    }));

    saveScaffoldToDb("campaign-1", scaffold);

    const macro = getLocationByName(DENSE_LOCATION_EXPECTED.macro);
    const sublocation = getLocationByName("Station Concourse");
    const edgeInserts = getEdgeInserts();
    expect(edgeInserts).toContainEqual(
      expect.objectContaining({
        fromLocationId: macro.id,
        toLocationId: sublocation.id,
      }),
    );
    expect(edgeInserts).toContainEqual(
      expect.objectContaining({
        fromLocationId: sublocation.id,
        toLocationId: macro.id,
      }),
    );
    expect(getLocationConnectedProjection(macro.id as string)).toContain(
      sublocation.id,
    );
    expect(getLocationConnectedProjection(sublocation.id as string)).toContain(
      macro.id,
    );
  });

  it("rejects duplicate scaffold location names before persistence maps are built", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.locations = [
      scaffold.locations[0]!,
      {
        ...scaffold.locations[1]!,
        name: scaffold.locations[0]!.name,
      },
    ];

    expect(() =>
      saveScaffoldToDb("campaign-1", scaffold as DenseLocationWorldScaffold),
    ).toThrow(/duplicate scaffold location name/i);
    expect(dbCalls.some((c) => c.op === "insert" && c.table === "locations")).toBe(
      false,
    );
  });

  it("keeps legacy flat scaffold locations macro-compatible", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());

    for (const location of getLocationInserts()) {
      expect(location.kind).toBe("macro");
      expect(location.parentLocationId).toBeNull();
      expect(location.persistence).toBe("persistent");
    }
  });

  it("rejects persistent sublocations with invalid explicit parent references", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.locations[1] = {
      ...scaffold.locations[1]!,
      parentLocationName: "Missing Parent Location",
    };

    expect(() =>
      saveScaffoldToDb("campaign-1", scaffold as DenseLocationWorldScaffold),
    ).toThrow(/parentLocationName/i);
  });

  it("updateAdjacency creates bidirectional compatibility projection", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const locationUpdates = dbCalls.filter(
      (c) => c.op === "update" && c.table === "locations",
    );
    expect(locationUpdates.length).toBe(2);

    const firstData = locationUpdates[0]!.data as Record<string, unknown>;
    const secondData = locationUpdates[1]!.data as Record<string, unknown>;

    const firstConnected = JSON.parse(firstData.connectedTo as string) as string[];
    const secondConnected = JSON.parse(secondData.connectedTo as string) as string[];

    // uuid-1 is Castle Keep, uuid-2 is Dark Forest
    expect(firstConnected).toContain("uuid-2");
    expect(secondConnected).toContain("uuid-1");
  });

  it("updateAdjacency inserts normalized location edges with default travel cost", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const edgeInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "location_edges",
    );

    expect(edgeInserts.length).toBe(2);
    for (const edge of edgeInserts) {
      const data = edge.data as Record<string, unknown>;
      expect(data.campaignId).toBe("campaign-1");
      expect(data.travelCost).toBe(1);
      expect(data.discovered).toBe(true);
    }
  });

  it("skips self-loop edges and self-target compatibility adjacency for fresh scaffold persistence", () => {
    const scaffold = buildScaffold();
    scaffold.locations[0] = {
      ...scaffold.locations[0]!,
      connectedTo: ["Castle Keep", "Dark Forest"],
    };

    saveScaffoldToDb("campaign-1", scaffold);

    const edgeInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "location_edges",
    );
    expect(edgeInserts).toHaveLength(2);
    expect(edgeInserts).not.toContainEqual(
      expect.objectContaining({
        data: expect.objectContaining({
          fromLocationId: "uuid-1",
          toLocationId: "uuid-1",
        }),
      }),
    );

    const locationUpdates = dbCalls.filter(
      (c) => c.op === "update" && c.table === "locations",
    );
    const firstConnected = JSON.parse(
      (locationUpdates[0]!.data as Record<string, unknown>).connectedTo as string,
    ) as string[];
    expect(firstConnected).toEqual(["uuid-2"]);
  });

  it("insertFactions creates rows with name, tags/goals/assets as JSON", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const factionInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "factions",
    );
    expect(factionInserts.length).toBe(1);

    const faction = factionInserts[0]!.data as Record<string, unknown>;
    expect(faction.name).toBe("Iron Guard");
    expect(faction.campaignId).toBe("campaign-1");
    expect(faction.tags).toBe(JSON.stringify(["military", "honorable"]));
    expect(faction.goals).toBe(JSON.stringify(["Defend the realm"]));
    expect(faction.assets).toBe(JSON.stringify(["castle garrison"]));
  });

  it("insertNpcs sets tier to 'key' and maps locationName to locationId", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );
    expect(npcInserts.length).toBe(2);

    const aldric = npcInserts[0]!.data as Record<string, unknown>;
    expect(aldric.tier).toBe("key");
    expect(aldric.name).toBe("Captain Aldric");
    expect(aldric.currentLocationId).toBe("uuid-1");
    expect(aldric.goals).toBe(
      JSON.stringify({
        short_term: ["Patrol borders"],
        long_term: ["Unite the kingdoms"],
      }),
    );
    expect(aldric.characterRecord).toBeDefined();
    expect(aldric.derivedTags).toBeDefined();
  });

  it("persists NPC broad location and scene placement for persistent sublocations", () => {
    saveScaffoldToDb("campaign-1", makeDenseLocationScaffold());

    const macro = getLocationByName(DENSE_LOCATION_EXPECTED.macro);
    const station = getLocationByName("Station Concourse");
    const warden = getNpcByName("Transit Warden");
    const characterRecord = JSON.parse(warden.characterRecord as string) as {
      socialContext: {
        currentLocationId: string | null;
        currentLocationName: string | null;
      };
    };

    expect(warden.currentLocationId).toBe(macro.id);
    expect(warden.currentSceneLocationId).toBe(station.id);
    expect(characterRecord.socialContext).toMatchObject({
      currentLocationId: macro.id,
      currentLocationName: DENSE_LOCATION_EXPECTED.macro,
    });
  });

  it("persists macro scene placement as broad and scene ids on the macro row", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.npcs[0] = {
      ...scaffold.npcs[0]!,
      locationName: "Market Approach",
      sceneLocationName: "Market Approach",
    };

    saveScaffoldToDb("campaign-1", scaffold);

    const market = getLocationByName("Market Approach");
    const warden = getNpcByName("Transit Warden");
    expect(warden.currentLocationId).toBe(market.id);
    expect(warden.currentSceneLocationId).toBe(market.id);
  });

  it("resolves broad-only sublocation NPC placement to parent macro plus scene id", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.npcs[0] = {
      ...scaffold.npcs[0]!,
      locationName: "Station Concourse",
      sceneLocationName: null,
    };

    saveScaffoldToDb("campaign-1", scaffold as DenseLocationWorldScaffold);

    const macro = getLocationByName(DENSE_LOCATION_EXPECTED.macro);
    const station = getLocationByName("Station Concourse");
    const warden = getNpcByName("Transit Warden");
    const characterRecord = JSON.parse(warden.characterRecord as string) as {
      socialContext: {
        currentLocationId: string | null;
        currentLocationName: string | null;
      };
    };
    expect(warden.currentLocationId).toBe(macro.id);
    expect(warden.currentSceneLocationId).toBe(station.id);
    expect(characterRecord.socialContext).toMatchObject({
      currentLocationId: macro.id,
      currentLocationName: DENSE_LOCATION_EXPECTED.macro,
    });
  });

  it("persists sibling sublocation NPCs under one broad macro with distinct scene ids", () => {
    saveScaffoldToDb("campaign-1", makeDenseLocationScaffold());

    const macro = getLocationByName(DENSE_LOCATION_EXPECTED.macro);
    const rooftop = getLocationByName("Rooftop Service Corridor");
    const platform = getLocationByName("Underground Platform");
    const runner = getNpcByName("Signal Runner");
    const medic = getNpcByName("Platform Medic");

    expect(runner.currentLocationId).toBe(macro.id);
    expect(medic.currentLocationId).toBe(macro.id);
    expect(runner.currentSceneLocationId).toBe(rooftop.id);
    expect(medic.currentSceneLocationId).toBe(platform.id);
    expect(runner.currentSceneLocationId).not.toBe(medic.currentSceneLocationId);
  });

  it("rejects scene sublocation placement when explicit broad location conflicts with parent macro", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.npcs[0] = {
      ...scaffold.npcs[0]!,
      locationName: "Market Approach",
      sceneLocationName: "Station Concourse",
    };

    expect(() =>
      saveScaffoldToDb("campaign-1", scaffold as DenseLocationWorldScaffold),
    ).toThrow(/sceneLocationName.*locationName|locationName.*sceneLocationName/i);
  });

  it("rejects invalid explicit sceneLocationName before NPC persistence", () => {
    const scaffold = makeDenseLocationScaffold();
    scaffold.npcs[0] = {
      ...scaffold.npcs[0]!,
      sceneLocationName: "Missing Service Tunnel",
    };

    expect(() =>
      saveScaffoldToDb("campaign-1", scaffold as DenseLocationWorldScaffold),
    ).toThrow(/sceneLocationName/i);
    expect(getNpcInserts()).toHaveLength(0);
  });

  it("keeps omitted sceneLocationName compatible with legacy broad-only placement", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());

    const aldric = getNpcByName("Captain Aldric");
    expect(aldric.currentLocationId).toBe(getLocationByName("Castle Keep").id);
    expect(aldric.currentSceneLocationId).toBeNull();
  });

  it("draft-backed NPC edit convergence keeps save/load/world-payload round-trip fields aligned at the persistence seam", () => {
    const scaffold = buildScaffold();
    scaffold.npcs[0] = {
      ...scaffold.npcs[0]!,
      name: "Marshal Selene Voss",
      persona: "Now leads from the front and trusts the village scouts.",
      tags: ["strategist", "scarred", "field medic"],
      goals: {
        shortTerm: ["Fortify the village", "Brief the scouts"],
        longTerm: ["Keep the refugees alive", "Break the siege"],
      },
      locationName: "Dark Forest",
      factionName: null,
      tier: "supporting",
    };

    saveScaffoldToDb("campaign-1", scaffold);

    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );
    const persistedNpc = npcInserts[0]!.data as Record<string, unknown>;
    const characterRecord = JSON.parse(persistedNpc.characterRecord as string) as {
      identity: {
        displayName: string;
        tier: string;
      };
      profile: {
        personaSummary: string;
      };
      socialContext: {
        currentLocationId: string | null;
        currentLocationName: string | null;
        factionName: string | null;
      };
      motivations: {
        shortTermGoals: string[];
        longTermGoals: string[];
      };
    };

    expect(persistedNpc.name).toBe("Marshal Selene Voss");
    expect(persistedNpc.persona).toBe(
      "Now leads from the front and trusts the village scouts.",
    );
    expect(JSON.parse(persistedNpc.tags as string)).toEqual([
      "strategist",
      "scarred",
      "field medic",
    ]);
    expect(JSON.parse(persistedNpc.goals as string)).toEqual({
      short_term: ["Fortify the village", "Brief the scouts"],
      long_term: ["Keep the refugees alive", "Break the siege"],
    });
    expect(persistedNpc.tier).toBe("persistent");
    expect(persistedNpc.currentLocationId).toBe("uuid-2");
    expect(characterRecord.identity.displayName).toBe("Marshal Selene Voss");
    expect(characterRecord.identity.tier).toBe("supporting");
    expect(characterRecord.profile.personaSummary).toBe(
      "Now leads from the front and trusts the village scouts.",
    );
    expect(characterRecord.socialContext).toMatchObject({
      currentLocationId: "uuid-2",
      currentLocationName: "Dark Forest",
      factionName: null,
    });
    expect(characterRecord.motivations).toMatchObject({
      shortTermGoals: ["Fortify the village", "Brief the scouts"],
      longTermGoals: ["Keep the refugees alive", "Break the siege"],
    });
  });

  it("reconcileDraftBackedScaffoldNpc preserves draft.powerStats on supporting-tier round-trip", () => {
    const scaffold = buildScaffold();
    const supportingPowerStats: PowerStats = {
      attackPotency: { tier: "Wall", rank: 4 },
      speed: { tier: "Superhuman", rank: 3 },
      durability: { tier: "Wall", rank: 4 },
      intelligence: { tier: "Gifted", rank: 6 },
      hax: [
        {
          name: "Hidden Route Memory",
          type: "Information Analysis",
          bypassTier: null,
          limitations: ["Only applies to paths Mira has walked before"],
        },
      ],
      vulnerabilities: [
        {
          description: "Breaks rhythm when cut off from landmarks.",
          severity: "major" as const,
        },
      ],
    };

    scaffold.npcs[1] = {
      ...scaffold.npcs[1]!,
      draft: {
        ...scaffold.npcs[0]!.draft!,
        identity: {
          ...scaffold.npcs[0]!.draft!.identity,
          tier: "supporting",
          displayName: "Mira the Wanderer",
        },
        profile: {
          ...scaffold.npcs[0]!.draft!.profile,
          personaSummary: "A mysterious traveler with no allegiance.",
        },
        socialContext: {
          ...scaffold.npcs[0]!.draft!.socialContext,
          factionName: null,
          currentLocationId: null,
          currentLocationName: "Unknown Village",
        },
        motivations: {
          ...scaffold.npcs[0]!.draft!.motivations,
          shortTermGoals: ["Find shelter"],
          longTermGoals: ["Discover the truth"],
        },
        powerStats: supportingPowerStats,
      },
    };

    saveScaffoldToDb("campaign-1", scaffold);

    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );
    const persistedNpc = npcInserts.find(
      (c) => (c.data as Record<string, unknown>).name === "Mira the Wanderer",
    )!.data as Record<string, unknown>;
    const characterRecord = JSON.parse(persistedNpc.characterRecord as string) as {
      identity: {
        tier: string;
      };
      powerStats?: typeof supportingPowerStats;
    };

    expect(characterRecord.identity.tier).toBe("supporting");
    expect(characterRecord.powerStats).toEqual(supportingPowerStats);
  });

  it("persists worldgen NPCs without synthetic grounding or power profiles", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );

    const aldric = JSON.parse((npcInserts[0]!.data as Record<string, unknown>).characterRecord as string) as {
      grounding?: {
        summary: string;
        powerProfile?: {
          attack: string;
          uncertaintyNotes: string[];
        };
      };
    };
    const mira = JSON.parse((npcInserts[1]!.data as Record<string, unknown>).characterRecord as string) as {
      grounding?: {
        summary: string;
        powerProfile?: {
          attack: string;
        };
      };
    };

    expect(aldric.grounding).toBeUndefined();
    expect(mira.grounding).toBeUndefined();
  });

  it("NPC with unknown locationName gets null currentLocationId", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );
    const mira = npcInserts[1]!.data as Record<string, unknown>;
    expect(mira.name).toBe("Mira the Wanderer");
    expect(mira.currentLocationId).toBeNull();
  });

  it("maps scaffold tier 'supporting' to DB tier 'persistent'", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );
    const mira = npcInserts[1]!.data as Record<string, unknown>;
    expect(mira.name).toBe("Mira the Wanderer");
    expect(mira.tier).toBe("persistent");
  });

  it("keeps scaffold tier 'key' as DB tier 'key'", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const npcInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "npcs",
    );
    const aldric = npcInserts[0]!.data as Record<string, unknown>;
    expect(aldric.name).toBe("Captain Aldric");
    expect(aldric.tier).toBe("key");
  });

  it("insertMembershipRelationships creates relationship with ['Member'] tag for NPCs with factionName", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const relInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "relationships",
    );
    const memberRels = relInserts.filter((c) => {
      const data = c.data as Record<string, unknown>;
      return (data.tags as string).includes("Member");
    });
    expect(memberRels.length).toBe(1);

    const rel = memberRels[0]!.data as Record<string, unknown>;
    expect(rel.tags).toBe(JSON.stringify(["Member"]));
    expect(rel.reason).toContain("Captain Aldric");
    expect(rel.reason).toContain("Iron Guard");
  });

  it("deduplicates membership relationships when duplicate scaffold NPC names resolve to the same entity", () => {
    const scaffold = buildScaffold();
    scaffold.npcs.push({
      ...scaffold.npcs[0]!,
      persona: "Duplicate source row for the same generated character.",
    });

    saveScaffoldToDb("campaign-1", scaffold);
    const relInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "relationships",
    );
    const memberRels = relInserts.filter((c) => {
      const data = c.data as Record<string, unknown>;
      return (data.tags as string).includes("Member");
    });

    expect(memberRels.length).toBe(1);
  });

  it("NPC with no factionName skips membership relationship", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const relInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "relationships",
    );
    const memberRels = relInserts.filter((c) => {
      const data = c.data as Record<string, unknown>;
      return (data.tags as string).includes("Member");
    });
    expect(memberRels.length).toBe(1);
    for (const rel of memberRels) {
      expect((rel.data as Record<string, unknown>).reason).not.toContain("Mira");
    }
  });

  it("insertTerritoryRelationships creates relationship with ['Controls'] tag and deduplicates", () => {
    const scaffold = buildScaffold();
    scaffold.factions[0]!.territoryNames = ["Castle Keep", "Castle Keep"];

    saveScaffoldToDb("campaign-1", scaffold);
    const relInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "relationships",
    );
    const territoryRels = relInserts.filter((c) => {
      const data = c.data as Record<string, unknown>;
      return (data.tags as string).includes("Controls");
    });
    expect(territoryRels.length).toBe(1);

    const rel = territoryRels[0]!.data as Record<string, unknown>;
    expect(rel.tags).toBe(JSON.stringify(["Controls"]));
    expect(rel.reason).toContain("Iron Guard");
    expect(rel.reason).toContain("Castle Keep");
  });

  it("deduplicates territory relationships when duplicate scaffold factions resolve to the same entity", () => {
    const scaffold = buildScaffold();
    scaffold.factions.push({
      ...scaffold.factions[0]!,
      goals: ["Duplicate source row for the same faction."],
    });

    saveScaffoldToDb("campaign-1", scaffold);
    const relInserts = dbCalls.filter(
      (c) => c.op === "insert" && c.table === "relationships",
    );
    const territoryRels = relInserts.filter((c) => {
      const data = c.data as Record<string, unknown>;
      return (data.tags as string).includes("Controls");
    });

    expect(territoryRels.length).toBe(1);
  });

  it("updates campaign premise via tx.update(campaigns).set({premise, updatedAt})", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const campaignUpdates = dbCalls.filter(
      (c) => c.op === "update" && c.table === "campaigns",
    );
    expect(campaignUpdates.length).toBe(1);

    const data = campaignUpdates[0]!.data as Record<string, unknown>;
    expect(data.premise).toBe("A dark fantasy world torn by war.");
    expect(data.updatedAt).toBeDefined();
    expect(typeof data.updatedAt).toBe("number");
  });
});
