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
  deriveRuntimeCharacterTags: vi.fn().mockReturnValue(["Compatibility Tag"]),
}));

vi.mock("../storyteller-contract.js", () => ({
  buildStorytellerContract: vi
    .fn()
    .mockReturnValue("Use richer character identity layers, not tag-only shorthand."),
}));

vi.mock("../start-condition-runtime.js", () => ({
  deriveStartConditionEffects: vi.fn().mockReturnValue({
    activeStatusFlags: [],
    promptLines: [],
  }),
}));

vi.mock("../../inventory/authority.js", async () => {
  const actual = await vi.importActual<typeof import("../../inventory/authority.js")>(
    "../../inventory/authority.js",
  );
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

describe("assemblePrompt character identity slices", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (readCampaignConfig as Mock).mockReturnValue({
      premise: "Identity-first runtime world.",
      currentTick: 13,
    });
    (getChatHistory as Mock).mockReturnValue([]);
    (getDb as Mock).mockReturnValue(
      createMockDb({
        players: [
          {
            id: "player-1",
            campaignId: "test-campaign-123",
            name: "Iria",
            currentLocationId: "loc-1",
            currentSceneLocationId: "loc-1",
          },
        ],
        locations: [
          {
            id: "loc-1",
            campaignId: "test-campaign-123",
            name: "Ash Market",
            description: "A smoke-stained bazaar.",
            tags: '["market"]',
            connectedTo: "[]",
          },
        ],
        npcs: [
          {
            id: "npc-1",
            campaignId: "test-campaign-123",
            name: "Captain Mire",
            tags: '["warden"]',
            currentLocationId: "loc-1",
            currentSceneLocationId: "loc-1",
          },
        ],
      }) as unknown as ReturnType<typeof getDb>,
    );

    (hydrateStoredPlayerRecord as Mock).mockReturnValue({
      identity: {
        displayName: "Iria",
        tier: "key",
        baseFacts: {
          biography: "A courier carrying state secrets through occupied streets.",
          socialRole: ["outsider courier", "wanted witness"],
          hardConstraints: ["Cannot expose the satchel", "Cannot abandon her sister"],
        },
        behavioralCore: {
          motives: ["Protect her sister", "Get the satchel to safety"],
          pressureResponses: ["Deflects with dry humor", "Cuts exits before trusting anyone"],
          taboos: ["Will not sell out civilians"],
          attachments: ["Her sister", "The satchel"],
          selfImage: "A survivor who keeps moving even when cornered.",
        },
        liveDynamics: {
          activeGoals: ["Reach the river gate", "Find a safe contact"],
          beliefDrift: ["The wardens may still have one honest captain"],
          currentStrains: ["Sleep-starved", "Under active pursuit"],
          earnedChanges: ["Now trusts Mira with courier routes"],
        },
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
      },
      socialContext: { currentLocationName: "Ash Market" },
      capabilities: { wealthTier: null },
      state: { hp: 5, statusFlags: [] },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        signatureItems: [],
      },
      startConditions: {},
      continuity: {
        identityInertia: "anchored",
        protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
        mutableSurface: ["identity.liveDynamics"],
        changePressureNotes: ["Deep shifts must be earned over multiple turns."],
      },
    });

    (hydrateStoredNpcRecord as Mock).mockReturnValue({
      identity: {
        displayName: "Captain Mire",
        tier: "key",
        baseFacts: {
          biography: "A veteran watch captain holding a brittle district together.",
          socialRole: ["watch captain", "district warden"],
          hardConstraints: ["Cannot publicly break with the wardens yet"],
        },
        behavioralCore: {
          motives: ["Keep the district from collapsing"],
          pressureResponses: ["Turns colder under pressure", "Tests loyalty before offering protection"],
          taboos: ["Will not hand civilians to the riot squads"],
          attachments: ["The market families", "His exhausted patrol"],
          selfImage: "The last intact wall between order and panic.",
        },
        liveDynamics: {
          activeGoals: ["Hold the barricade", "Find a way to shield Iria"],
          beliefDrift: ["Iria may be worth trusting"],
          currentStrains: ["Outnumbered", "Running on fumes"],
          earnedChanges: ["Quietly protects courier routes from the registry"],
        },
      },
      profile: { personaSummary: "A hard-eyed officer hiding concern behind discipline." },
      motivations: {
        shortTermGoals: ["Hold the barricade"],
        longTermGoals: ["Keep the district alive"],
        beliefs: ["Trust is expensive"],
      },
      capabilities: { wealthTier: null },
      continuity: {
        identityInertia: "anchored",
        protectedCore: ["identity.baseFacts", "identity.behavioralCore"],
        mutableSurface: ["identity.liveDynamics"],
        changePressureNotes: ["Small scenes should update strain before identity."],
      },
    });

    (loadAuthoritativeInventoryView as Mock).mockReturnValue({
      items: [],
      carried: [],
      equipped: [],
      signature: [],
      compatibility: {
        inventorySeed: [],
        equippedItemRefs: [],
        signatureItems: [],
      },
    });
  });

  it("surfaces base facts, behavioral core, live dynamics, and continuity cues in runtime prompt context", async () => {
    const result = await assemblePrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
    });

    expect(result.formatted).toContain("Base Facts:");
    expect(result.formatted).toContain("Behavioral Core:");
    expect(result.formatted).toContain("Live Dynamics:");
    expect(result.formatted).toContain("Continuity:");
    expect(result.formatted).toContain("Protect her sister");
    expect(result.formatted).toContain("Turns colder under pressure");
    expect(result.formatted).toContain("Under active pursuit");
    expect(result.formatted).toContain("identityInertia=anchored");
  });

  it("keeps derived tags as shorthand while richer identity remains the prompt truth", async () => {
    const result = await assemblePrompt({
      campaignId: "test-campaign-123",
      contextWindow: 8192,
    });

    expect(result.formatted).toContain("Tags: Compatibility Tag");
    expect(result.formatted).toContain("Behavioral Core:");
    expect(result.formatted).toContain("Live Dynamics:");
    expect(result.formatted).not.toContain("Tags are the only identity truth");
  });
});
