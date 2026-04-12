import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../campaign/index.js", () => ({
  readCampaignConfig: vi.fn(),
  getChatHistory: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../location-events.js", () => ({
  listRecentLocationEvents: vi.fn().mockReturnValue([]),
}));

vi.mock("../graph-queries.js", () => ({
  getRelationshipGraph: vi.fn().mockReturnValue([]),
}));

vi.mock("../../character/record-adapters.js", () => ({
  hydrateStoredPlayerRecord: vi.fn(),
  hydrateStoredNpcRecord: vi.fn(),
}));

vi.mock("../../character/runtime-tags.js", () => ({
  deriveRuntimeCharacterTags: vi.fn().mockReturnValue(["Tagged"]),
}));

vi.mock("../storyteller-contract.js", () => ({
  buildStorytellerContract: vi.fn().mockReturnValue("Use canonical character records and authoritative items."),
}));

vi.mock("../start-condition-runtime.js", () => ({
  deriveStartConditionEffects: vi.fn().mockReturnValue({
    activeStatusFlags: [],
    promptLines: [],
  }),
}));

vi.mock("../../inventory/authority.js", async () => {
  const actual = await vi.importActual<typeof import("../../inventory/authority.js")>("../../inventory/authority.js");
  return {
    ...actual,
    loadAuthoritativeInventoryView: vi.fn(),
  };
});

import { assemblePrompt } from "../prompt-assembler.js";
import { readCampaignConfig, getChatHistory } from "../../campaign/index.js";
import { getDb } from "../../db/index.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
} from "../../character/record-adapters.js";
import { loadAuthoritativeInventoryView } from "../../inventory/authority.js";
import {
  players as playersTable,
  locations as locationsTable,
  npcs as npcsTable,
  items as itemsTable,
  relationships as relationshipsTable,
  chronicle as chronicleTable,
  factions as factionsTable,
} from "../../db/schema.js";

function createMockDb(overrides: {
  players?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  npcs?: Record<string, unknown>[];
  items?: Record<string, unknown>[];
  relationships?: Record<string, unknown>[];
  chronicle?: Record<string, unknown>[];
  factions?: Record<string, unknown>[];
} = {}) {
  const tableMap = new Map<unknown, Record<string, unknown>[]>([
    [playersTable, overrides.players ?? []],
    [locationsTable, overrides.locations ?? []],
    [npcsTable, overrides.npcs ?? []],
    [itemsTable, overrides.items ?? []],
    [relationshipsTable, overrides.relationships ?? []],
    [chronicleTable, overrides.chronicle ?? []],
    [factionsTable, overrides.factions ?? []],
  ]);

  const selectFn = vi.fn().mockImplementation(() => ({
    from: vi.fn().mockImplementation((table: unknown) => {
      const data = tableMap.get(table) ?? [];
      return {
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              all: vi.fn().mockReturnValue(data),
            }),
            all: vi.fn().mockReturnValue(data),
          }),
          all: vi.fn().mockReturnValue(data),
          get: vi.fn().mockReturnValue(data[0]),
        }),
        orderBy: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            all: vi.fn().mockReturnValue(data),
          }),
          all: vi.fn().mockReturnValue(data),
        }),
        all: vi.fn().mockReturnValue(data),
        get: vi.fn().mockReturnValue(data[0]),
      };
    }),
  }));

  return { select: selectFn };
}

describe("assemblePrompt authoritative inventory reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (readCampaignConfig as Mock).mockReturnValue({
      premise: "Authoritative inventory test world.",
      currentTick: 8,
    });
    (getChatHistory as Mock).mockReturnValue([]);
    (getDb as Mock).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "player-1",
            campaignId: "test-campaign-123",
            name: "Hero",
            currentLocationId: "loc-1",
          },
        ],
        locations: [
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Town Square",
            description: "Stone and wind.",
            tags: "[]",
            connectedTo: "[]",
          },
        ],
        npcs: [
          {
            id: "npc-1",
            campaignId: "test-campaign-123",
            name: "Captain Mire",
            currentLocationId: "loc-1",
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    (hydrateStoredPlayerRecord as Mock).mockReturnValue({
      identity: { displayName: "Hero" },
      profile: { species: "", gender: "", ageText: "", appearance: "" },
      socialContext: { currentLocationName: "Town Square" },
      capabilities: { wealthTier: null },
      state: { hp: 5, statusFlags: [] },
      loadout: {
        inventorySeed: ["Legacy Dagger"],
        equippedItemRefs: ["Legacy Bow"],
        signatureItems: ["Legacy Crest"],
      },
      startConditions: {},
    });

    (hydrateStoredNpcRecord as Mock).mockReturnValue({
      identity: { displayName: "Captain Mire", tier: "key" },
      profile: { personaSummary: "Holding the line." },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
      },
      capabilities: { wealthTier: null },
      loadout: {
        inventorySeed: ["Legacy Spear"],
        equippedItemRefs: ["Legacy Spear"],
        signatureItems: [],
      },
    });

    (loadAuthoritativeInventoryView as Mock).mockImplementation((_campaignId: string, ownerId: string) => {
      if (ownerId === "player-1") {
        return {
          items: [],
          carried: [{ name: "Bedroll" }],
          equipped: [{ name: "Iron Sword" }],
          signature: [{ name: "Family Compass" }],
          compatibility: {
            inventorySeed: ["Bedroll"],
            equippedItemRefs: ["Iron Sword"],
            signatureItems: ["Family Compass"],
          },
        };
      }

      return {
        items: [],
        carried: [{ name: "Bandage Roll" }],
        equipped: [{ name: "Warden Pike" }],
        signature: [],
        compatibility: {
          inventorySeed: ["Bandage Roll"],
          equippedItemRefs: ["Warden Pike"],
          signatureItems: [],
        },
      };
    });
  });

  it("uses authoritative player carried, equipped, and signature items instead of legacy loadout fallback", async () => {
    const result = await assemblePrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
    });

    expect(loadAuthoritativeInventoryView).toHaveBeenCalledWith("test-campaign-123", "player-1");
    expect(result.formatted).toContain("Equipped: Iron Sword");
    expect(result.formatted).toContain("Signature Items: Family Compass");
    expect(result.formatted).toContain("Inventory: Bedroll");
    expect(result.formatted).not.toContain("Legacy Bow");
    expect(result.formatted).not.toContain("Legacy Dagger");
    expect(result.formatted).not.toContain("Legacy Crest");
  });

  it("prefers authoritative NPC equipment over stale legacy record loadout", async () => {
    const result = await assemblePrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
    });

    expect(loadAuthoritativeInventoryView).toHaveBeenCalledWith("test-campaign-123", "npc-1");
    expect(result.formatted).toContain("Captain Mire");
    expect(result.formatted).toContain("Equipped: Warden Pike");
    expect(result.formatted).toContain("Inventory: Bandage Roll");
    expect(result.formatted).not.toContain("Legacy Spear");
  });
});
