import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({ steps: [] }),
  stepCountIs: vi.fn().mockReturnValue(() => false),
  tool: vi.fn((def) => def),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import { createFactionTools } from "../faction-tools.js";
import { tickFactions } from "../world-engine.js";
import { getDb } from "../../db/index.js";
import { generateText } from "ai";

const CAMPAIGN_ID = "test-campaign-123";
const TICK = 10;

const JUDGE_PROVIDER = {
  id: "test-provider",
  name: "Test",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
};

// -- Mock DB helpers ----------------------------------------------------------

function createMockFaction(overrides: Record<string, unknown> = {}) {
  return {
    id: "faction-001",
    campaignId: CAMPAIGN_ID,
    name: "Iron Brotherhood",
    tags: '["militant","expansionist"]',
    goals: '["Expand territory to the west","Control trade routes"]',
    assets: '["500 soldiers","3 warships"]',
    ...overrides,
  };
}

function setupMockDb(options: {
  factions?: Record<string, unknown>[];
  locations?: Record<string, unknown>[];
  chronicle?: Record<string, unknown>[];
  factionByName?: Record<string, unknown> | null;
  locationByName?: Record<string, unknown> | null;
}) {
  const allFactions = options.factions ?? [];
  const allLocations = options.locations ?? [];
  const allChronicle = options.chronicle ?? [];
  const factionByName = options.factionByName ?? null;
  const locationByName = options.locationByName ?? null;

  let allCallCount = 0;
  let getCallCount = 0;

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    get: vi.fn().mockImplementation(() => {
      getCallCount++;
      // First get calls resolve faction/location by name
      if (getCallCount <= 2) return factionByName ?? locationByName;
      return locationByName;
    }),
    all: vi.fn().mockImplementation(() => {
      allCallCount++;
      // First .all() call returns factions
      if (allCallCount === 1) return allFactions;
      // Second .all() returns locations for faction territory
      if (allCallCount === 2) return allLocations;
      // Third .all() returns neighboring factions
      if (allCallCount === 3) return [];
      // Fourth .all() returns chronicle entries
      if (allCallCount === 4) return allChronicle;
      return [];
    }),
  };

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

// -- Tests: createFactionTools ------------------------------------------------

describe("createFactionTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns object with keys faction_action, update_faction_goal, add_chronicle_entry, declare_world_event", () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    expect(tools).toHaveProperty("faction_action");
    expect(tools).toHaveProperty("update_faction_goal");
    expect(tools).toHaveProperty("add_chronicle_entry");
    expect(tools).toHaveProperty("declare_world_event");
    expect(Object.keys(tools)).toHaveLength(4);
  });

  it("faction_action tool has correct inputSchema fields", () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const actionTool = tools.faction_action;
    expect(actionTool).toHaveProperty("inputSchema");
    expect(actionTool).toHaveProperty("execute");
  });

  it("update_faction_goal tool replaces old goal with new goal", async () => {
    const faction = createMockFaction();
    const mockDb = setupMockDb({ factions: [faction] });
    mockDb.get.mockReturnValue({
      id: "faction-001",
      name: "Iron Brotherhood",
      goals: '["Expand territory to the west","Control trade routes"]',
    });

    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    // AI SDK v6 tool.execute takes (input, options)
    const result = await tools.update_faction_goal.execute!({
      factionName: "Iron Brotherhood",
      oldGoal: "Expand territory to the west",
      newGoal: "Consolidate western holdings",
    }, {} as never);

    expect(result).toHaveProperty("updated", true);
  });

  it("declare_world_event with affectedLocations adds chronicle entry and applies event tag to location", async () => {
    const mockDb = setupMockDb({
      factions: [],
      locationByName: {
        id: "loc-east",
        name: "Eastmarch",
        tags: '["frontier"]',
      },
    });

    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.declare_world_event.execute!({
      event: "Plague sweeps the eastern provinces",
      eventType: "plague" as const,
      affectedLocations: ["Eastmarch"],
    }, {} as never);

    expect(result).toHaveProperty("entryId");
    expect(result).toHaveProperty("locationsAffected", 1);
    // Should insert chronicle entry
    expect(mockDb.insert).toHaveBeenCalled();
    // Should update location tags
    expect(mockDb.update).toHaveBeenCalled();
  });

  it("declare_world_event with no affectedLocations still creates chronicle entry", async () => {
    const mockDb = setupMockDb({ factions: [] });

    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.declare_world_event.execute!({
      event: "A comet lights up the night sky",
      eventType: "anomaly" as const,
    }, {} as never);

    expect(result).toHaveProperty("entryId");
    expect(result).toHaveProperty("locationsAffected", 0);
    // Should insert chronicle entry
    expect(mockDb.insert).toHaveBeenCalled();
    // Should NOT update any locations
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("declare_world_event chronicle entry has [WORLD EVENT] prefix", async () => {
    const insertedValues: Record<string, unknown>[] = [];
    const mockDb = setupMockDb({ factions: [] });
    mockDb.values.mockImplementation((val: Record<string, unknown>) => {
      insertedValues.push(val);
      return mockDb;
    });

    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    await tools.declare_world_event.execute!({
      event: "Earthquake strikes the capital",
      eventType: "disaster" as const,
    }, {} as never);

    expect(insertedValues.length).toBeGreaterThan(0);
    const chronicleEntry = insertedValues[0]!;
    expect(chronicleEntry.text).toContain("[WORLD EVENT]");
    expect(chronicleEntry.text).toContain("Earthquake strikes the capital");
  });

  it("add_chronicle_entry tool inserts chronicle row", async () => {
    const mockDb = setupMockDb({ factions: [] });

    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    // AI SDK v6 tool.execute takes (input, options)
    const result = await tools.add_chronicle_entry.execute!({
      text: "The Iron Brotherhood expanded into Westmarch",
    }, {} as never);

    expect(result).toHaveProperty("entryId");
    expect(mockDb.insert).toHaveBeenCalled();
  });
});

// -- Tests: tickFactions ------------------------------------------------------

describe("tickFactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips when tick % interval !== 0 (returns empty array)", async () => {
    const results = await tickFactions(CAMPAIGN_ID, 7, JUDGE_PROVIDER, 10);
    expect(results).toEqual([]);
    expect(getDb).not.toHaveBeenCalled();
  });

  it("queries all factions for campaignId and processes each sequentially", async () => {
    const faction1 = createMockFaction({ id: "faction-001", name: "Iron Brotherhood" });
    const faction2 = createMockFaction({ id: "faction-002", name: "Silver Circle" });

    setupMockDb({
      factions: [faction1, faction2],
      locations: [],
      chronicle: [],
    });

    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: [],
    });

    const results = await tickFactions(CAMPAIGN_ID, 10, JUDGE_PROVIDER, 10);

    // Should process both factions
    expect(results).toHaveLength(2);
    expect(results[0]!.factionName).toBe("Iron Brotherhood");
    expect(results[1]!.factionName).toBe("Silver Circle");
    // generateText should have been called twice (once per faction)
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it("returns empty array when no factions exist", async () => {
    setupMockDb({ factions: [] });

    const results = await tickFactions(CAMPAIGN_ID, 10, JUDGE_PROVIDER, 10);
    expect(results).toEqual([]);
    expect(generateText).not.toHaveBeenCalled();
  });

  it("catches per-faction errors without stopping other factions", async () => {
    const faction1 = createMockFaction({ id: "faction-001", name: "Iron Brotherhood" });
    const faction2 = createMockFaction({ id: "faction-002", name: "Silver Circle" });

    setupMockDb({
      factions: [faction1, faction2],
      locations: [],
      chronicle: [],
    });

    // First call throws, second succeeds
    (generateText as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error("LLM timeout"))
      .mockResolvedValueOnce({ steps: [] });

    const results = await tickFactions(CAMPAIGN_ID, 10, JUDGE_PROVIDER, 10);

    expect(results).toHaveLength(2);
    expect(results[0]!.error).toBe("LLM timeout");
    expect(results[1]!.error).toBeUndefined();
  });
});
