import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  searchEpisodicEvents: vi.fn().mockResolvedValue([
    {
      id: "evt-1",
      text: "Greta sold rare goods to the adventurer",
      tick: 3,
      location: "Market Square",
      participants: ["Greta the Merchant", "player"],
      importance: 5,
      type: "event",
      vector: [0.1, 0.2],
    },
    {
      id: "evt-2",
      text: "Greta was threatened by bandits",
      tick: 4,
      location: "Market Square",
      participants: ["Greta the Merchant", "Bandit Leader"],
      importance: 7,
      type: "event",
      vector: [0.3, 0.4],
    },
  ]),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn().mockResolvedValue({ success: true, result: {} }),
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "",
    steps: [
      {
        toolCalls: [
          {
            toolName: "set_belief",
            input: { belief: "The market is dangerous", evidence: ["bandit attack"] },
          },
        ],
        toolResults: [
          { output: { updated: true } },
        ],
      },
    ],
  }),
  tool: vi.fn((def: Record<string, unknown>) => def),
  stepCountIs: vi.fn().mockReturnValue(() => false),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import { createReflectionTools } from "../reflection-tools.js";
import { runReflection, checkAndTriggerReflections, REFLECTION_THRESHOLD } from "../reflection-agent.js";
import { getDb } from "../../db/index.js";
import { executeToolCall } from "../tool-executor.js";

const CAMPAIGN_ID = "test-campaign-123";
const NPC_ID = "npc-001";
const TICK = 10;

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
    id: NPC_ID,
    campaignId: CAMPAIGN_ID,
    name: "Greta the Merchant",
    persona: "A shrewd merchant who values profit above all",
    tags: '["merchant","shrewd","wealthy"]',
    tier: "key",
    currentLocationId: "loc-001",
    goals: '{"short_term":["sell rare goods"],"long_term":["become guild master"]}',
    beliefs: '["money talks"]',
    unprocessedImportance: 20,
    ...overrides,
  };
}

function setupMockDb(options: {
  npc?: Record<string, unknown> | null;
  npcsAboveThreshold?: Record<string, unknown>[];
}) {
  const mockNpc = options.npc !== undefined ? options.npc : createMockNpc();
  const npcsAboveThreshold = options.npcsAboveThreshold ?? [];

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    get: vi.fn().mockReturnValue(mockNpc),
    all: vi.fn().mockReturnValue(npcsAboveThreshold),
  };

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

// -- Tests --------------------------------------------------------------------

describe("createReflectionTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 6 tools: set_belief, set_goal, drop_goal, set_relationship, upgrade_wealth, upgrade_skill", () => {
    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    expect(tools).toHaveProperty("set_belief");
    expect(tools).toHaveProperty("set_goal");
    expect(tools).toHaveProperty("drop_goal");
    expect(tools).toHaveProperty("set_relationship");
    expect(tools).toHaveProperty("upgrade_wealth");
    expect(tools).toHaveProperty("upgrade_skill");
    expect(Object.keys(tools)).toHaveLength(6);
  });

  it("set_belief appends a new belief to NPC beliefs JSON", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.set_belief.execute!(
      { belief: "The market is dangerous", evidence: ["bandit attack"] },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toHaveProperty("updated", true);
    expect(mockDb.run).toHaveBeenCalled();
    // Check the set() call contains the updated beliefs
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(setCall).toBeDefined();
    const beliefsStr = setCall?.beliefs as string;
    expect(beliefsStr).toBeDefined();
    const beliefs = JSON.parse(beliefsStr) as string[];
    expect(beliefs).toContain("money talks");
    expect(beliefs).toContain("The market is dangerous");
  });

  it("set_goal adds a goal to the appropriate priority array", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.set_goal.execute!(
      { goal: "hire bodyguards", priority: "short_term" as const },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toHaveProperty("updated", true);
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const goalsStr = setCall?.goals as string;
    const goals = JSON.parse(goalsStr) as { short_term: string[]; long_term: string[] };
    expect(goals.short_term).toContain("hire bodyguards");
    expect(goals.short_term).toContain("sell rare goods");
  });

  it("drop_goal removes a goal from NPC goals (case-insensitive)", async () => {
    const mockDb = setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.drop_goal.execute!(
      { goal: "Sell Rare Goods" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toHaveProperty("updated", true);
    const setCall = mockDb.set.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    const goalsStr = setCall?.goals as string;
    const goals = JSON.parse(goalsStr) as { short_term: string[]; long_term: string[] };
    expect(goals.short_term).not.toContain("sell rare goods");
  });

  it("set_relationship calls executeToolCall with set_relationship", async () => {
    setupMockDb({});

    const tools = createReflectionTools(CAMPAIGN_ID, NPC_ID);
    const result = await tools.set_relationship.execute!(
      { target: "Bandit Leader", tag: "enemy", reason: "Threatened my livelihood" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(executeToolCall).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "set_relationship",
      expect.objectContaining({
        entityA: "Greta the Merchant",
        entityB: "Bandit Leader",
        tag: "enemy",
        reason: "Threatened my livelihood",
      }),
      0,
    );
  });
});

describe("runReflection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls Judge LLM with NPC episodic events and resets unprocessedImportance to 0", async () => {
    const mockDb = setupMockDb({});
    const { generateText } = await import("ai");

    const result = await runReflection(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    expect(generateText).toHaveBeenCalled();
    // Verify unprocessedImportance was reset to 0
    const setCall = mockDb.set.mock.calls.find(
      (call) => (call[0] as Record<string, unknown>)?.unprocessedImportance === 0,
    );
    expect(setCall).toBeDefined();
  });
});

describe("checkAndTriggerReflections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("only reflects NPCs with unprocessedImportance >= REFLECTION_THRESHOLD", async () => {
    const qualifyingNpc = createMockNpc({ id: "npc-above", unprocessedImportance: 20 });
    const mockDb = setupMockDb({
      npcsAboveThreshold: [qualifyingNpc],
    });

    // When checkAndTriggerReflections runs, it queries NPCs above threshold then calls runReflection for each
    // The mock db.all returns npcsAboveThreshold for the first all() call
    // The subsequent get() calls within runReflection use the default npc mock
    const results = await checkAndTriggerReflections(CAMPAIGN_ID, TICK, JUDGE_PROVIDER);

    expect(results.length).toBeGreaterThanOrEqual(1);
  });

  it("skips NPCs below threshold (returns empty array)", async () => {
    setupMockDb({
      npcsAboveThreshold: [], // No NPCs above threshold
    });

    const results = await checkAndTriggerReflections(CAMPAIGN_ID, TICK, JUDGE_PROVIDER);

    expect(results).toEqual([]);
  });

  it("REFLECTION_THRESHOLD equals 10", () => {
    expect(REFLECTION_THRESHOLD).toBe(10);
  });
});
