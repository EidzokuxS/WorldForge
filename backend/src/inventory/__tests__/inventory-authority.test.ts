import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";

type TempCampaignContext = {
  rootDir: string;
  campaignsDir: string;
  campaignId: string;
  campaignDir: string;
  dbPath: string;
};

function makeTempCampaignContext(prefix: string): TempCampaignContext {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const campaignsDir = path.join(rootDir, "campaigns");
  const campaignId = "phase-38-legacy-campaign";
  const campaignDir = path.join(campaignsDir, campaignId);
  const dbPath = path.join(campaignDir, "state.db");

  fs.mkdirSync(path.join(campaignDir, "vectors"), { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir, "config.json"),
    JSON.stringify(
      {
        name: "Legacy Campaign",
        premise: "A legacy save that predates Phase 38.",
        createdAt: 1,
        updatedAt: 1,
      },
      null,
      2,
    ),
    "utf-8",
  );
  fs.writeFileSync(path.join(campaignDir, "chat_history.json"), "[]", "utf-8");

  return {
    rootDir,
    campaignsDir,
    campaignId,
    campaignDir,
    dbPath,
  };
}

function makeLegacyPlayerDraft(loadout: {
  inventorySeed: string[];
  equippedItemRefs: string[];
  signatureItems: string[];
}) {
  return {
    identity: {
      role: "player",
      tier: "key",
      displayName: "Avery Vale",
      canonicalStatus: "original",
    },
    profile: {
      species: "Human",
      gender: "Nonbinary",
      ageText: "29",
      appearance: "Travel-stained coat and a careful gaze.",
      backgroundSummary: "",
      personaSummary: "",
    },
    socialContext: {
      factionId: null,
      factionName: null,
      homeLocationId: null,
      homeLocationName: null,
      currentLocationId: null,
      currentLocationName: "Wayfarer Gate",
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
      wealthTier: "Poor",
    },
    state: {
      hp: 5,
      conditions: [],
      statusFlags: [],
      activityState: "active",
    },
    loadout: {
      inventorySeed: loadout.inventorySeed,
      equippedItemRefs: loadout.equippedItemRefs,
      currencyNotes: "",
      signatureItems: loadout.signatureItems,
    },
    startConditions: {},
    provenance: {
      sourceKind: "generator",
      importMode: null,
      templateId: null,
      archetypePrompt: null,
      worldgenOrigin: null,
      legacyTags: [],
    },
  };
}

function makeLegacyPlayerRecord(loadout: {
  inventorySeed: string[];
  equippedItemRefs: string[];
  signatureItems: string[];
}) {
  return {
    ...makeLegacyPlayerDraft(loadout),
    identity: {
      ...makeLegacyPlayerDraft(loadout).identity,
      id: "player-1",
      campaignId: "phase-38-legacy-campaign",
    },
    socialContext: {
      ...makeLegacyPlayerDraft(loadout).socialContext,
      currentLocationId: "loc-1",
    },
    provenance: {
      ...makeLegacyPlayerDraft(loadout).provenance,
      sourceKind: "migration",
    },
  };
}

async function importManagerHarness(context: TempCampaignContext) {
  vi.resetModules();
  vi.doUnmock("../../db/index.js");
  vi.doUnmock("../../db/migrate.js");
  vi.doUnmock("../../db/schema.js");
  vi.doUnmock("../../campaign/manager.js");
  vi.doUnmock("../../worldgen/index.js");
  vi.doUnmock("../../lib/index.js");
  vi.doMock("../../campaign/paths.js", () => ({
    assertSafeId: vi.fn(),
    CAMPAIGNS_DIR: context.campaignsDir,
    getCampaignDir: (id: string) => path.join(context.campaignsDir, id),
    getCampaignConfigPath: (id: string) =>
      path.join(context.campaignsDir, id, "config.json"),
  }));
  vi.doMock("../../vectors/index.js", () => ({
    openVectorDb: vi.fn(async () => ({})),
    closeVectorDb: vi.fn(async () => {}),
  }));

  const dbModule = await import("../../db/index.js");
  const migrateModule = await import("../../db/migrate.js");
  const schemaModule = await import("../../db/schema.js");
  const managerModule = await import("../../campaign/manager.js");

  return {
    connectDb: dbModule.connectDb,
    closeDb: dbModule.closeDb,
    getDb: dbModule.getDb,
    runMigrations: migrateModule.runMigrations,
    campaigns: schemaModule.campaigns,
    items: schemaModule.items,
    locations: schemaModule.locations,
    players: schemaModule.players,
    loadCampaign: managerModule.loadCampaign,
  };
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
});

describe("authoritative inventory schema contract", () => {
  it("exposes explicit equip_state, equipped_slot, and is_signature columns on items", async () => {
    vi.resetModules();
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase38-schema-"));
    let closeDb = () => {};

    try {
      const dbModule = await import("../../db/index.js");
      const { runMigrations } = await import("../../db/migrate.js");
      closeDb = dbModule.closeDb;

      dbModule.connectDb(path.join(tempDir, "state.db"));
      runMigrations();

      const itemColumns = dbModule
        .getSqliteConnection()
        .prepare("PRAGMA table_info(items)")
        .all() as Array<{ name: string; notnull: number; dflt_value: string | null }>;

      expect(itemColumns.map((column) => column.name)).toEqual(
        expect.arrayContaining(["equip_state", "equipped_slot", "is_signature"]),
      );
      expect(itemColumns.find((column) => column.name === "equip_state")).toMatchObject({
        notnull: 1,
        dflt_value: '"carried"',
      });
      expect(itemColumns.find((column) => column.name === "is_signature")).toMatchObject({
        notnull: 1,
        dflt_value: "0",
      });

    } finally {
      closeDb();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("save-character authoritative item seeding", () => {
  it("writes equipState/equippedSlot/isSignature from canonical loadout slots instead of tags", async () => {
    vi.resetModules();

    const dbCalls: Array<unknown> = [];
    const mockRun = vi.fn();
    const mockGet = vi
      .fn()
      .mockReturnValueOnce(null)
      .mockReturnValueOnce(null);
    const mockAll = vi.fn(() => [{ id: "loc-1", name: "Wayfarer Gate", isStarting: true }]);
    const mockWhere = vi.fn(() => ({ all: mockAll, get: mockGet, run: mockRun }));
    const mockFrom = vi.fn(() => ({ where: mockWhere, get: mockGet }));
    const mockSelect = vi.fn(() => ({ from: mockFrom }));
    const mockInsert = vi.fn(() => ({
      values: (values: unknown) => {
        dbCalls.push(values);
        return { run: mockRun };
      },
    }));
    const mockDelete = vi.fn(() => ({ where: mockWhere }));

    vi.doMock("../../db/index.js", () => ({
      getDb: vi.fn(() => ({
        select: mockSelect,
        insert: mockInsert,
        delete: mockDelete,
      })),
    }));
    vi.doMock("../../campaign/index.js", () => ({
      getActiveCampaign: vi.fn(() => ({
        id: "campaign-1",
        name: "Test Campaign",
        premise: "A borderland on the edge of collapse.",
        createdAt: 1,
      })),
      loadCampaign: vi.fn(async () => ({
        id: "campaign-1",
        name: "Test Campaign",
        premise: "A borderland on the edge of collapse.",
        createdAt: 1,
      })),
      readCampaignConfig: vi.fn(() => ({ currentTick: 0 })),
    }));
    vi.doMock("../../settings/index.js", () => ({
      loadSettings: vi.fn(() => ({
        providers: [],
        generator: { providerId: "", model: "", temperature: 0.7, maxTokens: 2048 },
        images: { providerId: "", model: "", stylePrompt: "", enabled: false },
        research: { enabled: false, maxSearchSteps: 3, searchProvider: "duckduckgo" },
      })),
    }));
    vi.doMock("../../worldgen/index.js", () => ({
      resolveStartingLocation: vi.fn(),
    }));
    vi.doMock("../../images/index.js", () => ({
      generateImage: vi.fn(),
      resolveImageProvider: vi.fn(() => null),
      buildPortraitPrompt: vi.fn(),
      ensureImageDir: vi.fn(),
      cacheImage: vi.fn(),
    }));
    vi.doMock("../../character/index.js", () => ({
      parseCharacterDescription: vi.fn(),
      generateCharacter: vi.fn(),
      generateCharacterFromArchetype: vi.fn(),
      mapV2CardToCharacter: vi.fn(),
      parseNpcDescription: vi.fn(),
      mapV2CardToNpc: vi.fn(),
      generateNpcFromArchetype: vi.fn(),
      researchArchetype: vi.fn(),
    }));
    vi.doMock("../../ai/index.js", () => ({
      resolveRoleModel: vi.fn(() => ({
        provider: { baseUrl: "http://localhost", model: "test", apiKey: "" },
        temperature: 0.7,
        maxTokens: 2048,
      })),
    }));
    vi.doMock("../../lib/index.js", () => ({
      getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
      getErrorStatus: vi.fn(() => 500),
      createLogger: vi.fn(() => ({
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      })),
    }));

    const characterRoutes = (await import("../../routes/character.js")).default;
    const app = new Hono();
    app.route("/api/worldgen", characterRoutes);

    const response = await app.request("/api/worldgen/save-character", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        campaignId: "campaign-1",
        draft: makeLegacyPlayerDraft({
          inventorySeed: ["Bedroll"],
          equippedItemRefs: ["Iron Sword"],
          signatureItems: ["Family Compass"],
        }),
      }),
    });

    expect(response.status).toBe(200);

    const seededItems = dbCalls[1] as Array<Record<string, unknown>> | undefined;

    expect(seededItems).toBeDefined();
    expect(seededItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "Iron Sword",
          equipState: "equipped",
          equippedSlot: expect.any(String),
          isSignature: false,
        }),
        expect.objectContaining({
          name: "Bedroll",
          equipState: "carried",
          equippedSlot: null,
          isSignature: false,
        }),
        expect.objectContaining({
          name: "Family Compass",
          equipState: "carried",
          equippedSlot: null,
          isSignature: true,
        }),
      ]),
    );
  });
});

describe("loadCampaign legacy migration", () => {
  it("backfills legacy loadout-only campaigns exactly once and preserves authoritative rows on a second reopen", async () => {
    const context = makeTempCampaignContext("wf-phase38-load-");
    let closeDb = () => {};

    try {
      const {
        connectDb,
        closeDb: closeDbConnection,
        campaigns,
        getDb,
        items,
        locations,
        players,
        runMigrations,
        loadCampaign,
      } = await importManagerHarness(context);
      closeDb = closeDbConnection;

      connectDb(context.dbPath);
      runMigrations();

      getDb()
        .insert(campaigns)
        .values({
          id: context.campaignId,
          name: "Legacy Campaign",
          premise: "A legacy save that predates Phase 38.",
          createdAt: 1,
          updatedAt: 1,
        })
        .run();

      getDb()
        .insert(locations)
        .values({
          id: "loc-1",
          campaignId: context.campaignId,
          name: "Wayfarer Gate",
          description: "A drafty stone gate above the marsh road.",
        })
        .run();

      getDb()
        .insert(players)
        .values({
          id: "player-1",
          campaignId: context.campaignId,
          name: "Avery Vale",
          race: "Human",
          gender: "Nonbinary",
          age: "29",
          appearance: "Travel-stained coat and a careful gaze.",
          hp: 5,
          tags: "[]",
          equippedItems: JSON.stringify(["Iron Sword"]),
          currentLocationId: "loc-1",
          characterRecord: JSON.stringify(
            makeLegacyPlayerRecord({
              inventorySeed: ["Bedroll", "Family Compass"],
              equippedItemRefs: ["Iron Sword"],
              signatureItems: ["Family Compass"],
            }),
          ),
          derivedTags: "[]",
        })
        .run();

      closeDb();

      await loadCampaign(context.campaignId);

      const firstPassNames = getDb()
        .select({ name: items.name })
        .from(items)
        .all()
        .map((row) => row.name)
        .sort();

      expect(firstPassNames).toEqual(["Bedroll", "Family Compass", "Iron Sword"]);

      await loadCampaign(context.campaignId);

      const secondPassNames = getDb()
        .select({ name: items.name })
        .from(items)
        .all()
        .map((row) => row.name)
        .sort();

      expect(secondPassNames).toEqual(["Bedroll", "Family Compass", "Iron Sword"]);
    } finally {
      closeDb();
      fs.rmSync(context.rootDir, { recursive: true, force: true });
    }
  });

  it("fails closed when characterRecord.loadout and equippedItems disagree about the same legacy item", async () => {
    const context = makeTempCampaignContext("wf-phase38-conflict-");
    let closeDb = () => {};

    try {
      const {
        connectDb,
        closeDb: closeDbConnection,
        campaigns,
        getDb,
        locations,
        players,
        runMigrations,
        loadCampaign,
      } = await importManagerHarness(context);
      closeDb = closeDbConnection;

      connectDb(context.dbPath);
      runMigrations();

      getDb()
        .insert(campaigns)
        .values({
          id: context.campaignId,
          name: "Legacy Campaign",
          premise: "A legacy save that predates Phase 38.",
          createdAt: 1,
          updatedAt: 1,
        })
        .run();

      getDb()
        .insert(locations)
        .values({
          id: "loc-1",
          campaignId: context.campaignId,
          name: "Wayfarer Gate",
          description: "A drafty stone gate above the marsh road.",
        })
        .run();

      getDb()
        .insert(players)
        .values({
          id: "player-1",
          campaignId: context.campaignId,
          name: "Avery Vale",
          race: "Human",
          gender: "Nonbinary",
          age: "29",
          appearance: "Travel-stained coat and a careful gaze.",
          hp: 5,
          tags: "[]",
          equippedItems: JSON.stringify(["Oak Staff"]),
          currentLocationId: "loc-1",
          characterRecord: JSON.stringify(
            makeLegacyPlayerRecord({
              inventorySeed: [],
              equippedItemRefs: ["Iron Sword"],
              signatureItems: [],
            }),
          ),
          derivedTags: "[]",
        })
        .run();

      closeDb();

      await expect(loadCampaign(context.campaignId)).rejects.toThrow(
        /phase-38-legacy-campaign|player-1|Iron Sword|Oak Staff/i,
      );
    } finally {
      closeDb();
      fs.rmSync(context.rootDir, { recursive: true, force: true });
    }
  });
});
