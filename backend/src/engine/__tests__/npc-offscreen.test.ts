import { describe, it, expect, vi, beforeEach } from "vitest";

const { accumulateReflectionBudgetMock } = vi.hoisted(() => ({
  accumulateReflectionBudgetMock: vi.fn(),
}));

// Mock all external dependencies before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  storeEpisodicEvent: vi.fn().mockResolvedValue("evt-123"),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: JSON.stringify({ updates: [] }),
  }),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("../reflection-budget.js", () => ({
  accumulateReflectionBudget: accumulateReflectionBudgetMock,
}));

import {
  simulateOffscreenNpcs,
  parseOffscreenUpdates,
  applyOffscreenUpdate,
} from "../npc-offscreen.js";
import { getDb } from "../../db/index.js";
import { generateText } from "ai";
import { storeEpisodicEvent } from "../../vectors/episodic-events.js";

const CAMPAIGN_ID = "test-campaign-123";
const PLAYER_LOCATION_ID = "loc-001";

const JUDGE_PROVIDER = {
  id: "test-provider",
  name: "Test",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
};

// -- Mock DB helpers ----------------------------------------------------------

function createMockNpc(overrides: Record<string, unknown> = {}) {
  return {
    id: "npc-001",
    campaignId: CAMPAIGN_ID,
    name: "Lord Blackwood",
    persona: "A cunning noble lord",
    tags: '["noble","cunning","wealthy"]',
    tier: "key",
    currentLocationId: "loc-002", // NOT at player location
    goals: '{"short_term":["gather allies"],"long_term":["seize the throne"]}',
    beliefs: '["power is everything"]',
    characterRecord: JSON.stringify({
      identity: {
        id: "npc-001",
        campaignId: CAMPAIGN_ID,
        role: "npc",
        tier: "key",
        displayName: "Lord Blackwood",
        canonicalStatus: "original",
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "A calculating noble who hides panic behind manners.",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-002",
        currentLocationName: "Council Hall",
        relationshipRefs: [],
        socialStatus: ["noble"],
        originMode: "native",
      },
      motivations: {
        shortTermGoals: ["Secure the council vote"],
        longTermGoals: ["Take the throne"],
        beliefs: ["Power rewards patience"],
        drives: ["Ambition"],
        frictions: ["Paranoid"],
      },
      capabilities: {
        traits: ["Strategic"],
        skills: [{ name: "Intrigue", tier: "Master" }],
        flaws: ["Cruel"],
        specialties: [],
        wealthTier: "Wealthy",
      },
      state: {
        hp: 5,
        conditions: ["Hidden"],
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
        legacyTags: ["noble", "cunning", "wealthy"],
      },
    }),
    derivedTags: '["noble","cunning","wealthy"]',
    ...overrides,
  };
}

function setupMockDb(options: {
  offscreenNpcs?: Record<string, unknown>[];
  locationByName?: Record<string, unknown> | null;
}) {
  const offscreenNpcs = options.offscreenNpcs ?? [];
  const locationByName = options.locationByName ?? null;

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    get: vi.fn().mockReturnValue(locationByName),
    all: vi.fn(),
    leftJoin: vi.fn().mockReturnThis(),
  };

  let allCallCount = 0;
  db.all.mockImplementation(() => {
    allCallCount++;
    if (allCallCount === 1) return offscreenNpcs;
    return [];
  });

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

// -- Tests --------------------------------------------------------------------

describe("simulateOffscreenNpcs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no off-screen key NPCs exist", async () => {
    setupMockDb({ offscreenNpcs: [] });

    const results = await simulateOffscreenNpcs(
      CAMPAIGN_ID,
      10, // tick divisible by 5
      JUDGE_PROVIDER,
      PLAYER_LOCATION_ID,
    );

    expect(results).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("skips NPCs at the player's location (they are on-screen)", async () => {
    // NPC at player's location should NOT appear in offscreen query
    // The DB query itself filters by currentLocationId != playerLocationId
    // So if we return no results, generateObject should not be called
    setupMockDb({ offscreenNpcs: [] });

    const results = await simulateOffscreenNpcs(
      CAMPAIGN_ID,
      10,
      JUDGE_PROVIDER,
      PLAYER_LOCATION_ID,
    );

    expect(results).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("only runs when tick % interval === 0", async () => {
    setupMockDb({
      offscreenNpcs: [createMockNpc()],
    });

    // Tick 7 with interval 5 => 7 % 5 !== 0, should skip
    const results = await simulateOffscreenNpcs(
      CAMPAIGN_ID,
      7,
      JUDGE_PROVIDER,
      PLAYER_LOCATION_ID,
      5,
    );

    expect(results).toEqual([]);
    // DB should not even be queried
    expect(getDb).not.toHaveBeenCalled();
  });

  it("calls generateObject with batch prompt for off-screen NPCs", async () => {
    const npc = createMockNpc();
    setupMockDb({ offscreenNpcs: [npc] });

    (generateText as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      text: JSON.stringify({
        updates: [
          {
            npcName: "Lord Blackwood",
            newLocation: null,
            actionSummary: "Plotted in his study",
            goalProgress: null,
          },
        ],
      }),
    });

    const results = await simulateOffscreenNpcs(
      CAMPAIGN_ID,
      10,
      JUDGE_PROVIDER,
      PLAYER_LOCATION_ID,
    );

    expect(generateText).toHaveBeenCalledOnce();
    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Persona: A calculating noble who hides panic behind manners.");
    expect(systemPrompt).toContain("  Traits: [Strategic, Master Intrigue, Cruel, Wealthy, Hidden, noble, Ambition, Paranoid]");
    expect(systemPrompt).toContain("Goals: short=[Secure the council vote], long=[Take the throne]");
    expect(systemPrompt).not.toContain("A cunning noble lord");
    expect(results).toHaveLength(1);
    expect(results[0]!.npcName).toBe("Lord Blackwood");
    expect(results[0]!.actionSummary).toBe("Plotted in his study");
  });
});

describe("parseOffscreenUpdates", () => {
  it("correctly parses structured LLM output into per-NPC updates", () => {
    const raw = [
      {
        npcName: "Lord Blackwood",
        newLocation: "Castle Keep",
        actionSummary: "Moved to the castle",
        goalProgress: "Made progress on alliances",
      },
      {
        npcName: "Elara",
        newLocation: null,
        actionSummary: "Trained in the arena",
        goalProgress: null,
      },
    ];

    const parsed = parseOffscreenUpdates(raw);

    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.npcName).toBe("Lord Blackwood");
    expect(parsed[0]!.newLocation).toBe("Castle Keep");
    expect(parsed[1]!.npcName).toBe("Elara");
    expect(parsed[1]!.newLocation).toBeNull();
  });
});

describe("applyOffscreenUpdate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes new location and goal changes to DB", async () => {
    const mockDb = setupMockDb({
      locationByName: { id: "loc-003", name: "Castle Keep" },
    });

    const storedNpc = createMockNpc();
    await applyOffscreenUpdate(
      CAMPAIGN_ID,
      {
        npcId: "npc-001",
        npcName: "Lord Blackwood",
        currentGoals: '{"short_term":["gather allies"],"long_term":["seize the throne"]}',
        currentCharacterRecord: storedNpc.characterRecord as string,
        storedRecord: {
          campaignId: storedNpc.campaignId,
          persona: storedNpc.persona,
          tags: storedNpc.tags,
          tier: storedNpc.tier as "temporary" | "persistent" | "key",
          currentLocationId: storedNpc.currentLocationId,
          goals: storedNpc.goals,
          beliefs: storedNpc.beliefs,
          unprocessedImportance: 0,
          inactiveTicks: 0,
          createdAt: 0,
          characterRecord: storedNpc.characterRecord,
          derivedTags: storedNpc.derivedTags,
        },
      },
      {
        npcName: "Lord Blackwood",
        newLocation: "Castle Keep",
        actionSummary: "Moved to the castle to meet allies",
        goalProgress: "Formed alliance with Duke",
      },
      10,
    );

    // Should have called update for location change
    expect(mockDb.update).toHaveBeenCalled();
    expect(mockDb.set).toHaveBeenCalledWith(
      expect.objectContaining({
        currentLocationId: "loc-003",
        goals: expect.stringContaining("Formed alliance with Duke"),
        characterRecord: expect.stringContaining("Formed alliance with Duke"),
        derivedTags: expect.any(String),
      }),
    );
    // Should store episodic event
    expect(storeEpisodicEvent).toHaveBeenCalled();
  });

  it("increments reflection budget after committed off-screen event writes", async () => {
    setupMockDb({
      locationByName: { id: "loc-003", name: "Castle Keep" },
    });

    const storedNpc = createMockNpc();
    await applyOffscreenUpdate(
      CAMPAIGN_ID,
      {
        npcId: "npc-001",
        npcName: "Lord Blackwood",
        currentGoals: '{"short_term":["gather allies"],"long_term":["seize the throne"]}',
        currentCharacterRecord: storedNpc.characterRecord as string,
        storedRecord: {
          campaignId: storedNpc.campaignId,
          persona: storedNpc.persona,
          tags: storedNpc.tags,
          tier: storedNpc.tier as "temporary" | "persistent" | "key",
          currentLocationId: storedNpc.currentLocationId,
          goals: storedNpc.goals,
          beliefs: storedNpc.beliefs,
          unprocessedImportance: 0,
          inactiveTicks: 0,
          createdAt: 0,
          characterRecord: storedNpc.characterRecord,
          derivedTags: storedNpc.derivedTags,
        },
      },
      {
        npcName: "Lord Blackwood",
        newLocation: "Castle Keep",
        actionSummary: "Moved to the castle to meet allies",
        goalProgress: "Formed alliance with Duke",
      },
      10,
    );

    expect(storeEpisodicEvent).toHaveBeenCalled();
    expect(accumulateReflectionBudgetMock).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      ["Lord Blackwood"],
      3,
    );
  });
});
