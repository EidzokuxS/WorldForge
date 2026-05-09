import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn().mockResolvedValue({
    object: { targetName: null, targetType: null },
  }),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import { factions, items, locations, npcs, players } from "../../db/schema.js";
import { getDb } from "../../db/index.js";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { resolveActionTargetContext } from "../target-context.js";
import { buildTargetContextPromptContract } from "../prompt-contracts.js";

const CAMPAIGN_ID = "test-campaign";
const PROVIDER = {
  id: "test",
  name: "Test",
  baseUrl: "http://localhost",
  apiKey: "key",
  model: "test-model",
};

function createPlayerRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Hero",
    hp: 5,
    tags: "[]",
    equippedItems: "[]",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    currentLocationId: "loc-1",
    characterRecord: JSON.stringify({
      identity: {
        id: "player-1",
        campaignId: CAMPAIGN_ID,
        role: "player",
        tier: "key",
        displayName: "Hero",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
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
        currentLocationId: "loc-1",
        currentLocationName: "Town Square",
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
        traits: ["Brave"],
        skills: [{ name: "Swordplay", tier: "Skilled" }],
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
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: [],
      },
      powerStats: {
        attackPotency: { tier: "Town", rank: 6 },
        speed: { tier: "Hypersonic", rank: 4 },
        durability: { tier: "Town", rank: 5 },
        intelligence: { tier: "Genius", rank: 6 },
        hax: [],
        vulnerabilities: [],
      },
    }),
    derivedTags: "[]",
    ...overrides,
  };
}

function createNpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "npc-1",
    campaignId: CAMPAIGN_ID,
    name: "Goblin Raider",
    persona: "Hostile scout",
    tags: "[]",
    tier: "supporting",
    currentLocationId: "loc-1",
    goals: '{"short_term":[],"long_term":[]}',
    beliefs: "[]",
    createdAt: 0,
    unprocessedImportance: 0,
    inactiveTicks: 0,
    characterRecord: JSON.stringify({
      identity: {
        id: "npc-1",
        campaignId: CAMPAIGN_ID,
        role: "npc",
        tier: "supporting",
        displayName: "Goblin Raider",
        canonicalStatus: "original",
      },
      profile: {
        species: "Goblin",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "Hostile scout",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-1",
        currentLocationName: "Town Square",
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
        traits: ["Agile"],
        skills: [{ name: "Dagger Fighting", tier: "Skilled" }],
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
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: [],
      },
    }),
    derivedTags: "[]",
    ...overrides,
  };
}

function createDb(options: {
  playerRows?: Record<string, unknown>[];
  npcRows?: Record<string, unknown>[];
  itemRows?: Record<string, unknown>[];
  locationRows?: Record<string, unknown>[];
  factionRows?: Record<string, unknown>[];
}) {
  const playerRows = options.playerRows ?? [];
  const npcRows = options.npcRows ?? [];
  const itemRows = options.itemRows ?? [];
  const locationRows = options.locationRows ?? [];
  const factionRows = options.factionRows ?? [];

  let lastFromTable: unknown = null;
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastFromTable = table;
      return db;
    }),
    where: vi.fn().mockImplementation(() => {
      if (lastFromTable === (players as unknown)) {
        return {
          get: vi.fn().mockReturnValue(playerRows[0] ?? null),
          all: vi.fn().mockReturnValue(playerRows),
        };
      }
      if (lastFromTable === (npcs as unknown)) {
        return {
          get: vi.fn().mockReturnValue(npcRows[0] ?? null),
          all: vi.fn().mockReturnValue(npcRows),
        };
      }
      if (lastFromTable === (items as unknown)) {
        return {
          get: vi.fn().mockReturnValue(itemRows[0] ?? null),
          all: vi.fn().mockReturnValue(itemRows),
        };
      }
      if (lastFromTable === (locations as unknown)) {
        return {
          get: vi.fn().mockReturnValue(locationRows[0] ?? null),
          all: vi.fn().mockReturnValue(locationRows),
        };
      }
      if (lastFromTable === (factions as unknown)) {
        return {
          get: vi.fn().mockReturnValue(factionRows[0] ?? null),
          all: vi.fn().mockReturnValue(factionRows),
        };
      }
      return {
        get: vi.fn().mockReturnValue(null),
        all: vi.fn().mockReturnValue([]),
      };
    }),
  };

  return db;
}

describe("resolveActionTargetContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("exposes a target-context structured-output contract helper", () => {
    const contract = buildTargetContextPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: target-context.v1");
    expect(contract).toContain('{ "targetName": string|null, "targetType": "character"|"item"|"location/object"|"faction"|null }');
    expect(contract).toContain("targetName must be one of the listed candidates or null");
    expect(contract).toContain("targetType must be null when targetName is null");
    expect(contract).toContain("Compact valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain('{ "targetName": null, "targetType": null }');
    expect(contract).toContain("Invalid examples:");
    expect(contract).toContain("invented target");
    expect(contract).toContain("enum drift");
    expect(contract).toContain("Backend authority:");
    expect(contract).toContain("backend resolves only explicit listed targets");
    expect(contract).toContain("must not invent a missing target");
  });

  it("places the target-context structured-output contract before classifier data", async () => {
    (getDb as Mock).mockReturnValue(
      createDb({
        itemRows: [
          {
            id: "item-1",
            campaignId: CAMPAIGN_ID,
            name: "Moon Key",
            tags: '["Ancient", "Silver"]',
          },
        ],
      }),
    );

    await resolveActionTargetContext({
      campaignId: CAMPAIGN_ID,
      playerAction: "Touch the impossible shimmer",
      intent: "Touch the impossible shimmer",
      method: "Reach for the impossible shimmer",
      judgeProvider: PROVIDER,
    });

    const prompt = String(vi.mocked(safeGenerateObject).mock.calls[0]?.[0]?.prompt ?? "");
    const contractIndex = prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: target-context.v1");
    const actionIndex = prompt.indexOf("Player action:");

    expect(contractIndex).toBeGreaterThanOrEqual(0);
    expect(contractIndex).toBeLessThan(actionIndex);
    expect(prompt).toContain('{ "targetName": string|null, "targetType": "character"|"item"|"location/object"|"faction"|null }');
    expect(prompt).toContain("targetName must be one of the listed candidates or null");
    expect(prompt).toContain("If no explicit listed target is present, return both fields as null.");
    expect(prompt).toContain("Invalid examples:");
    expect(prompt).toContain("Backend authority:");
    expect(prompt).toContain("must not invent a missing target");
  });

  it("includes a combat snapshot for resolved character targets with powerStats", async () => {
    (getDb as Mock).mockReturnValue(
      createDb({
        playerRows: [createPlayerRow()],
      }),
    );

    const result = await resolveActionTargetContext({
      campaignId: CAMPAIGN_ID,
      playerAction: "Strike Hero with a sword",
      intent: "Strike Hero",
      method: "Sword slash at Hero",
      judgeProvider: PROVIDER,
    });

    expect(result.targetType).toBe("character");
    expect(result.combatSnapshot).toBeDefined();
    expect(result.combatSnapshot).toMatchObject({
      label: "Hero",
      powerStats: {
        attackPotency: { tier: "Town", rank: 6 },
      },
    });
  });

  it("omits combat snapshot cleanly when the resolved character lacks powerStats", async () => {
    const playerRow = createPlayerRow({
      characterRecord: JSON.stringify({
        ...JSON.parse(String(createPlayerRow().characterRecord)),
        powerStats: undefined,
      }),
    });

    (getDb as Mock).mockReturnValue(
      createDb({
        playerRows: [playerRow],
      }),
    );

    const result = await resolveActionTargetContext({
      campaignId: CAMPAIGN_ID,
      playerAction: "Strike Hero with a sword",
      intent: "Strike Hero",
      method: "Sword slash at Hero",
      judgeProvider: PROVIDER,
    });

    expect(result.targetType).toBe("character");
    expect(result.combatSnapshot).toBeUndefined();
  });

  it("does not fabricate combat data for non-character targets", async () => {
    (getDb as Mock).mockReturnValue(
      createDb({
        itemRows: [
          {
            id: "item-1",
            campaignId: CAMPAIGN_ID,
            name: "Moon Key",
            tags: '["Ancient", "Silver"]',
          },
        ],
      }),
    );

    const result = await resolveActionTargetContext({
      campaignId: CAMPAIGN_ID,
      playerAction: "Use the Moon Key on the vault",
      intent: "Use the Moon Key",
      method: "Press the Moon Key into the lock",
      judgeProvider: PROVIDER,
    });

    expect(result.targetType).toBe("item");
    expect(result.targetTags).toEqual(["Ancient", "Silver"]);
    expect(result.combatSnapshot).toBeUndefined();
  });

  it("preserves fallback semantics for missing or unknown targets", async () => {
    (getDb as Mock).mockReturnValue(
      createDb({
        playerRows: [createPlayerRow()],
        npcRows: [createNpcRow()],
      }),
    );

    const result = await resolveActionTargetContext({
      campaignId: CAMPAIGN_ID,
      playerAction: "Touch the impossible shimmer",
      intent: "Touch the impossible shimmer",
      method: "Reach for the impossible shimmer",
      judgeProvider: PROVIDER,
    });

    expect(result).toMatchObject({
      targetLabel: null,
      targetType: "none",
      targetTags: [],
      source: "fallback",
    });
    expect(result.combatSnapshot).toBeUndefined();
    expect(result.fallbackReason).toBeTruthy();
  });
});
