import { describe, it, expect, vi, beforeEach } from "vitest";

const { recordLocationRecentEventMock } = vi.hoisted(() => ({
  recordLocationRecentEventMock: vi.fn(),
}));

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

vi.mock("../location-events.js", () => ({
  recordLocationRecentEvent: recordLocationRecentEventMock,
  listRecentLocationEvents: vi.fn(),
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

  it("update_faction_goal tool returns a proposal without mutating faction rows", async () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.update_faction_goal.execute!({
      factionName: "Iron Brotherhood",
      oldGoal: "Expand territory to the west",
      newGoal: "Consolidate western holdings",
    }, {} as never);

    expect(result).toMatchObject({
      status: "proposal_only",
      kind: "update_faction_goal",
      committed: false,
      campaignId: CAMPAIGN_ID,
      tick: TICK,
      factionName: "Iron Brotherhood",
      oldGoal: "Expand territory to the west",
      newGoal: "Consolidate western holdings",
    });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("declare_world_event with affectedLocations returns a proposal without chronicle or location writes", async () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.declare_world_event.execute!({
      event: "Plague sweeps the eastern provinces",
      eventType: "plague" as const,
      affectedLocations: ["Eastmarch"],
    }, {} as never);

    expect(result).toMatchObject({
      status: "proposal_only",
      kind: "declare_world_event",
      committed: false,
      campaignId: CAMPAIGN_ID,
      tick: TICK,
      event: "Plague sweeps the eastern provinces",
      eventType: "plague",
      affectedLocations: ["Eastmarch"],
      chronicleText: "[WORLD EVENT] Plague sweeps the eastern provinces",
    });
    expect(getDb).not.toHaveBeenCalled();
    expect(recordLocationRecentEventMock).not.toHaveBeenCalled();
  });

  it("declare_world_event with no affectedLocations keeps the proposal location list empty", async () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.declare_world_event.execute!({
      event: "A comet lights up the night sky",
      eventType: "anomaly" as const,
    }, {} as never);

    expect(result).toMatchObject({
      status: "proposal_only",
      kind: "declare_world_event",
      committed: false,
      affectedLocations: [],
      chronicleText: "[WORLD EVENT] A comet lights up the night sky",
    });
    expect(getDb).not.toHaveBeenCalled();
  });

  it("declare_world_event proposal has [WORLD EVENT] chronicle text prefix", async () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.declare_world_event.execute!({
      event: "Earthquake strikes the capital",
      eventType: "disaster" as const,
    }, {} as never);

    expect(result).toMatchObject({
      chronicleText: "[WORLD EVENT] Earthquake strikes the capital",
    });
  });

  it("faction_action returns proposed target and tag changes without location-event projection", async () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.faction_action.execute!(
      {
        action: "Fortified Westmarch",
        outcome: "Raised new barricades at the western gate",
        targetLocation: "Westmarch",
        tagChanges: [],
      },
      {} as never,
    );

    expect(result).toMatchObject({
      status: "proposal_only",
      kind: "faction_action",
      committed: false,
      targetLocation: "Westmarch",
      tagChanges: [],
    });
    expect(getDb).not.toHaveBeenCalled();
    expect(recordLocationRecentEventMock).not.toHaveBeenCalled();
  });

  it("add_chronicle_entry returns a proposal without inserting chronicle rows", async () => {
    const tools = createFactionTools(CAMPAIGN_ID, TICK);
    const result = await tools.add_chronicle_entry.execute!({
      text: "The Iron Brotherhood expanded into Westmarch",
    }, {} as never);

    expect(result).toMatchObject({
      status: "proposal_only",
      kind: "add_chronicle_entry",
      committed: false,
      text: "The Iron Brotherhood expanded into Westmarch",
    });
    expect(getDb).not.toHaveBeenCalled();
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

  it("keeps faction prompts concrete, chronicle-backed, and free of stale worldview wording", async () => {
    const faction = createMockFaction({ id: "faction-001", name: "Iron Brotherhood" });

    setupMockDb({
      factions: [faction],
      locations: [
        {
          id: "loc-west",
          name: "Westmarch",
          tags: '["fortified","Controlled by Iron Brotherhood"]',
        },
      ],
      chronicle: [
        { tick: 9, text: "The Iron Brotherhood seized the toll bridge." },
      ],
    });

    (generateText as ReturnType<typeof vi.fn>).mockResolvedValue({
      steps: [],
    });

    await tickFactions(CAMPAIGN_ID, 10, JUDGE_PROVIDER, 10);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain('You are the world simulation engine evaluating faction "Iron Brotherhood".');
    expect(systemPrompt).toContain("Use faction goals, territory, neighbors, assets, and chronicle-backed world state as your canonical macro context.");
    expect(systemPrompt).toContain("Choose ONE macro-level action proposal for this faction.");
    expect(systemPrompt).toContain("These tools are proposal-only.");
    expect(systemPrompt).toContain("Durable world changes must be committed later through the authority pipeline.");
    expect(systemPrompt).toContain("SPECIFIC, OBSERVABLE intended change");
    expect(systemPrompt).toContain("Recent World Events:");
    expect(systemPrompt).not.toContain("All characters, items, locations, and factions use a tag-based system");
    expect(systemPrompt).not.toContain("Your output must be narrative prose only.");
    expect(systemPrompt).not.toContain("Use tag-only worldview updates");
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
