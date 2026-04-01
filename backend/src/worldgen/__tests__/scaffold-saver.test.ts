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
  factions: { _name: "factions" },
  npcs: { _name: "npcs" },
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
import { saveScaffoldToDb } from "../scaffold-saver.js";
import type { WorldScaffold } from "../types.js";

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

describe("saveScaffoldToDb", () => {
  beforeEach(() => {
    dbCalls.length = 0;
    uuidCounter = 0;
  });

  it("calls db.transaction with a function", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    expect(dbCalls.length).toBeGreaterThan(0);
  });

  it("clearExistingScaffold deletes relationships, npcs, factions, locations in order", () => {
    saveScaffoldToDb("campaign-1", buildScaffold());
    const deletes = dbCalls.filter((c) => c.op === "delete");
    expect(deletes.length).toBe(4);
    expect(deletes[0]!.table).toBe("relationships");
    expect(deletes[1]!.table).toBe("npcs");
    expect(deletes[2]!.table).toBe("factions");
    expect(deletes[3]!.table).toBe("locations");
  });

  it("insertLocations creates one row per location with correct fields", () => {
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
    expect(first.connectedTo).toBe("[]");
  });

  it("updateAdjacency creates bidirectional connections", () => {
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
