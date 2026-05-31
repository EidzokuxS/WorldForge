import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  accumulateReflectionBudgetMock,
  getRelationshipGraphMock,
  logEventMock,
  logInfoMock,
  logWarnMock,
  logErrorMock,
  readWorldClockMock,
  validateBaseWorldVersionMock,
  commitAuthorityTraceMock,
} = vi.hoisted(() => ({
  accumulateReflectionBudgetMock: vi.fn(),
  getRelationshipGraphMock: vi.fn(),
  logEventMock: vi.fn(),
  logInfoMock: vi.fn(),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn(),
  readWorldClockMock: vi.fn(() => ({
    campaignId: "test-campaign-123",
    worldVersion: 0,
    worldTimeMinutes: 5,
    currentTick: 5,
    updatedAt: 123,
  })),
  validateBaseWorldVersionMock: vi.fn(() => ({
    campaignId: "test-campaign-123",
    worldVersion: 0,
    worldTimeMinutes: 5,
    currentTick: 5,
    updatedAt: 123,
  })),
  commitAuthorityTraceMock: vi.fn(() => ({
    toolResultId: "authority-trace-1",
    campaignId: "test-campaign-123",
    sourceEntity: { type: "npc", id: "npc-001" },
    baseWorldVersion: 0,
    resultWorldVersion: 1,
    worldTimeMinutes: 5,
    elapsedWorldTimeMinutes: 0,
    stateDeltaRefs: [],
    eventRefs: [],
    witnesses: [],
    knowledgeOutputs: [],
    visibilityOutputs: [],
    resources: [],
  })),
}));

// Mock all external dependencies before imports
vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  storeEpisodicEvent: vi.fn().mockResolvedValue("evt-123"),
  searchEpisodicEvents: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../vectors/embeddings.js", () => ({
  embedTexts: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

vi.mock("../oracle.js", () => ({
  callOracle: vi.fn().mockResolvedValue({
    chance: 60,
    roll: 30,
    outcome: "strong_hit",
    reasoning: "Test reasoning",
  }),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn().mockResolvedValue({ success: true, result: {} }),
}));

vi.mock("../living-world-authority.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../living-world-authority.js")>();
  return {
    ...actual,
    readWorldClock: readWorldClockMock,
    validateBaseWorldVersion: validateBaseWorldVersionMock,
    commitAuthorityTrace: commitAuthorityTraceMock,
  };
});

vi.mock("../target-context.js", () => ({
  resolveActionTargetContext: vi.fn().mockResolvedValue({
    targetLabel: null,
    targetType: "none",
    targetTags: [],
    source: "fallback",
    fallbackReason: "No supported concrete target resolved",
  }),
}));

vi.mock("../graph-queries.js", () => ({
  getRelationshipGraph: getRelationshipGraphMock,
}));

vi.mock("ai", () => ({
  generateText: vi.fn().mockResolvedValue({
    text: "",
    steps: [],
    toolCalls: [],
    toolResults: [],
  }),
  stepCountIs: vi.fn((count: number) => count),
  tool: vi.fn((def: Record<string, unknown>) => def),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("../reflection-budget.js", () => ({
  accumulateReflectionBudget: accumulateReflectionBudgetMock,
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: logEventMock,
    info: logInfoMock,
    warn: logWarnMock,
    error: logErrorMock,
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => await fn()),
}));

import { createNpcAgentTools } from "../npc-tools.js";
import { tickNpcAgent, tickPresentNpcs } from "../npc-agent.js";
import { getDb } from "../../db/index.js";
import { callOracle } from "../oracle.js";
import { resolveActionTargetContext } from "../target-context.js";
import { executeToolCall } from "../tool-executor.js";
import { storeEpisodicEvent } from "../../vectors/episodic-events.js";
import { generateText } from "ai";
import { npcs, locations, locationEdges, players, items, worldClocks } from "../../db/schema.js";

const CAMPAIGN_ID = "test-campaign-123";
const NPC_ID = "npc-001";
const TICK = 5;
const LOCATION_ID = "loc-001";

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
    currentLocationId: LOCATION_ID,
    goals: '{"short_term":["sell rare goods"],"long_term":["become guild master"]}',
    beliefs: '["money talks","trust no one"]',
    characterRecord: JSON.stringify({
      identity: {
        id: NPC_ID,
        campaignId: CAMPAIGN_ID,
        role: "npc",
        tier: "key",
        displayName: "Greta the Merchant",
        canonicalStatus: "original",
      },
      profile: {
        species: "",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "A patient fixer who trades in favors.",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: LOCATION_ID,
        currentLocationName: "Market Square",
        relationshipRefs: [],
        socialStatus: ["connected"],
        originMode: "native",
      },
      motivations: {
        shortTermGoals: ["Broker a truce"],
        longTermGoals: ["Own the market district"],
        beliefs: ["Every debt can be collected"],
        drives: ["Profit"],
        frictions: ["Watched by rivals"],
      },
      capabilities: {
        traits: ["Observant"],
        skills: [{ name: "Negotiation", tier: "Master" }],
        flaws: ["Secretive"],
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
        legacyTags: ["merchant", "shrewd", "wealthy"],
      },
    }),
    derivedTags: '["merchant","shrewd","wealthy"]',
    ...overrides,
  };
}

function createPoweredMockNpc(overrides: Record<string, unknown> = {}) {
  const base = createMockNpc();
  return {
    ...base,
    characterRecord: JSON.stringify({
      ...JSON.parse(String(base.characterRecord)),
      powerStats: {
        attackPotency: { tier: "Town", rank: 6 },
        speed: { tier: "Hypersonic", rank: 5 },
        durability: { tier: "Town", rank: 5 },
        intelligence: { tier: "Genius", rank: 6 },
        hax: [],
        vulnerabilities: [],
      },
    }),
    ...overrides,
  };
}

function createMockLocation(overrides: Record<string, unknown> = {}) {
  return {
    id: LOCATION_ID,
    campaignId: CAMPAIGN_ID,
    name: "Market Square",
    description: "A bustling marketplace",
    tags: '["urban","busy","commercial"]',
    connectedTo: '["loc-002","loc-003"]',
    ...overrides,
  };
}

function setupMockDb(options: {
  npc?: Record<string, unknown> | null;
  location?: Record<string, unknown> | null;
  graphLocations?: Record<string, unknown>[];
  graphEdges?: Record<string, unknown>[];
  npcsAtLocation?: Record<string, unknown>[];
  player?: Record<string, unknown> | null;
  adjacentLocation?: Record<string, unknown> | null;
}) {
  const mockNpc = options.npc !== undefined ? options.npc : createMockNpc();
  const mockLocation = options.location !== undefined ? options.location : createMockLocation();
  const graphLocations = options.graphLocations ?? [mockLocation, options.adjacentLocation ?? null].filter(
    (row): row is Record<string, unknown> => row != null,
  );
  const graphEdges =
    options.graphEdges ??
    graphLocations.flatMap((location) => {
      const connectedTo = (() => {
        try {
          return JSON.parse(String(location.connectedTo ?? "[]")) as string[];
        } catch {
          return [];
        }
      })();
      return connectedTo.map((targetId, index) => ({
        id: `edge-${String(location.id)}-${targetId}-${index}`,
        campaignId: CAMPAIGN_ID,
        fromLocationId: String(location.id),
        toLocationId: targetId,
        travelCost: 1,
        discovered: true,
      }));
    });
  const npcsAtLoc = options.npcsAtLocation ?? [];
  const mockPlayer = options.player ?? null;
  const adjacentLoc = options.adjacentLocation ?? null;

  let lastFromTable: unknown = null;
  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastFromTable = table;
      return db;
    }),
    where: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    run: vi.fn(),
    transaction: vi.fn((fn: () => unknown) => fn()),
    get: vi.fn().mockImplementation(() => {
      // Return based on call order context
      return mockNpc;
    }),
    all: vi.fn().mockReturnValue(npcsAtLoc),
  };

  // More precise mocking using call tracking
  let getCallCount = 0;
  let allCallCount = 0;

  db.get.mockImplementation(() => {
    if (lastFromTable === (npcs as unknown)) {
      return mockNpc;
    }
    if (lastFromTable === (locations as unknown)) {
      getCallCount++;
      if (getCallCount === 1) return mockLocation;
      if (getCallCount === 2) return adjacentLoc;
      return mockLocation;
    }
    if (lastFromTable === (worldClocks as unknown)) {
      return {
        campaignId: CAMPAIGN_ID,
        worldVersion: 0,
        worldTimeMinutes: TICK,
        currentTick: TICK,
        updatedAt: 123,
      };
    }
    return null;
  });

  db.all.mockImplementation(() => {
    if (lastFromTable === (locations as unknown)) {
      return graphLocations;
    }
    if (lastFromTable === (locationEdges as unknown)) {
      return graphEdges;
    }
    if (lastFromTable === (npcs as unknown)) {
      allCallCount++;
      return allCallCount === 1 ? npcsAtLoc : [];
    }
    if (lastFromTable === (players as unknown)) {
      return mockPlayer ? [mockPlayer] : [];
    }
    if (lastFromTable === (items as unknown)) {
      return [];
    }
    return [];
  });

  (getDb as ReturnType<typeof vi.fn>).mockReturnValue(db);
  return db;
}

// -- Tests --------------------------------------------------------------------

describe("createNpcAgentTools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns object with act, speak, move_to, update_own_goal keys", () => {
    setupMockDb({});
    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);
    expect(tools).toHaveProperty("act");
    expect(tools).toHaveProperty("speak");
    expect(tools).toHaveProperty("move_to");
    expect(tools).toHaveProperty("update_own_goal");
    expect(Object.keys(tools)).toHaveLength(4);
  });

  it("act returns an action proposal without Oracle or background execution", async () => {
    const mockDb = setupMockDb({});
    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.act.execute!(
      { action: "steal the ruby" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "act",
      proposal: {
        npcId: NPC_ID,
        action: "steal the ruby",
      },
    });
    expect(callOracle).not.toHaveBeenCalled();
    expect(resolveActionTargetContext).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
  });

  it("act does not perform combat target resolution or roll hostile actions", async () => {
    const mockDb = setupMockDb({
      npc: createPoweredMockNpc(),
    });
    vi.mocked(resolveActionTargetContext).mockResolvedValueOnce({
      targetLabel: "Intruder",
      targetType: "character",
      targetTags: ["Fast", "Armed"],
      combatSnapshot: {
        label: "Intruder",
        powerStats: {
          attackPotency: { tier: "Building", rank: 5 },
          speed: { tier: "Subsonic", rank: 4 },
          durability: { tier: "Building", rank: 4 },
          intelligence: { tier: "Gifted", rank: 4 },
          hax: [],
          vulnerabilities: [],
        },
      },
      source: "parsed",
      fallbackReason: null,
    });

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.act.execute!(
      { action: "Strike the intruder with a cursed blow" },
      { toolCallId: "tc-hostile", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "act",
      proposal: {
        npcId: NPC_ID,
        action: "Strike the intruder with a cursed blow",
      },
    });
    expect(callOracle).not.toHaveBeenCalled();
    expect(resolveActionTargetContext).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
  });

  it("act stays proposal-only for non-character or no-power targets", async () => {
    setupMockDb({
      npc: createPoweredMockNpc(),
    });
    vi.mocked(resolveActionTargetContext).mockResolvedValueOnce({
      targetLabel: "Moon Key",
      targetType: "item",
      targetTags: ["Ancient"],
      source: "parsed",
      fallbackReason: null,
    });

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.act.execute!(
      { action: "Strike the intruder with a cursed blow" },
      { toolCallId: "tc-item", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "act",
    });
    expect(callOracle).not.toHaveBeenCalled();
    expect(resolveActionTargetContext).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("move_to validates destination is adjacent; rejects non-adjacent", async () => {
    const mockDb = setupMockDb({
      adjacentLocation: null, // Target location not found
    });

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.move_to.execute!(
      { targetLocation: "Forbidden Castle" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toHaveProperty("error");
    expect((result as { error: string }).error).toMatch(/not found|not adjacent/i);
  });

  it("move_to returns a movement proposal without authority-backed execution", async () => {
    const adjLocation = {
      id: "loc-002",
      name: "Harbor",
      connectedTo: '["loc-001"]',
    };

    const mockDb = setupMockDb({
      adjacentLocation: adjLocation,
    });

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.move_to.execute!(
      { targetLocation: "Harbor" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "move_to",
      proposal: {
        npcId: NPC_ID,
        targetLocation: "Harbor",
        from: "Market Square",
        travelCost: 1,
        path: ["Market Square", "Harbor"],
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("move_to shares the travel cost contract with player movement for multi-edge destinations", async () => {
    const npc = createMockNpc({
      currentLocationId: "loc-001",
    });
    const currentLocation = createMockLocation({
      id: "loc-001",
      name: "Shibuya Crossing",
      connectedTo: '["loc-002"]',
    });
    const stationLocation = {
      id: "loc-002",
      campaignId: CAMPAIGN_ID,
      name: "Hidden Station Platform",
      description: "A persistent sublocation below the district.",
      tags: '["persistent_sublocation"]',
      connectedTo: '["loc-001","loc-003"]',
    };
    const targetLocation = {
      id: "loc-003",
      campaignId: CAMPAIGN_ID,
      name: "Tokyo Jujutsu High",
      description: "A hilltop academy beyond the city rail lines.",
      tags: '["macro"]',
      connectedTo: '["loc-002"]',
    };
    const mockDb = setupMockDb({
      npc,
      location: currentLocation,
      adjacentLocation: targetLocation,
      graphLocations: [currentLocation, stationLocation, targetLocation],
    });

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);
    const result = await tools.move_to.execute!(
      { targetLocation: "Tokyo Jujutsu High" },
      { toolCallId: "tc-phase43", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "move_to",
      proposal: {
        npcId: NPC_ID,
        targetLocation: "Tokyo Jujutsu High",
        from: "Shibuya Crossing",
        travelCost: 2,
        path: ["Shibuya Crossing", "Hidden Station Platform", "Tokyo Jujutsu High"],
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("update_own_goal returns a proposal without mutating NPC goals", async () => {
    const mockDb = setupMockDb({});

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.update_own_goal.execute!(
      { oldGoal: "sell rare goods", newGoal: "find rare artifacts", type: "short_term" as const },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "update_own_goal",
      proposal: {
        npcId: NPC_ID,
        oldGoal: "sell rare goods",
        newGoal: "find rare artifacts",
        type: "short_term",
      },
    });
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(validateBaseWorldVersionMock).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("update_own_goal does not enter stale authority validation because it is proposal-only", async () => {
    const mockDb = setupMockDb({});
    validateBaseWorldVersionMock.mockImplementationOnce(() => {
      throw new Error("stale world version");
    });

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.update_own_goal.execute!(
      { oldGoal: "sell rare goods", newGoal: "find rare artifacts", type: "short_term" as const },
      { toolCallId: "tc-stale", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "update_own_goal",
    });
    expect(validateBaseWorldVersionMock).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("speak returns a dialogue proposal without Oracle or background execution", async () => {
    const mockDb = setupMockDb({});

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.speak.execute!(
      { dialogue: "Welcome to my shop!", target: "player" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "speak",
      proposal: {
        npcId: NPC_ID,
        dialogue: "Welcome to my shop!",
        target: "player",
      },
    });
    expect(callOracle).not.toHaveBeenCalled();
    expect(storeEpisodicEvent).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
  });

  it("does not write NPC dialogue memory or route player-facing dialogue through background executor", async () => {
    const mockDb = setupMockDb({});

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.speak.execute!(
      { dialogue: "We need allies before dawn.", target: "Hero" },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "speak",
      proposal: {
        npcId: NPC_ID,
        dialogue: "We need allies before dawn.",
        target: "Hero",
      },
    });
    expect(storeEpisodicEvent).not.toHaveBeenCalled();
    expect(accumulateReflectionBudgetMock).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
  });

  it("act does not route present-NPC outcomes through log_event or reflection budget", async () => {
    const mockDb = setupMockDb({});
    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.act.execute!(
      { action: "broker a risky deal" },
      { toolCallId: "tc3", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toMatchObject({
      accepted: false,
      proposalOnly: true,
      toolName: "act",
      proposal: {
        npcId: NPC_ID,
        action: "broker a risky deal",
      },
    });
    expect(callOracle).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(mockDb.update).not.toHaveBeenCalled();
    expect(mockDb.run).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
    expect(accumulateReflectionBudgetMock).not.toHaveBeenCalled();
  });

  it("all NPC tool proposals avoid authority writes and background execution", async () => {
    setupMockDb({
      adjacentLocation: {
        id: "loc-002",
        name: "Harbor",
        connectedTo: '["loc-001"]',
      },
    });
    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    await tools.act.execute!(
      { action: "broker a risky deal" },
      { toolCallId: "tc-act", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    await tools.speak.execute!(
      { dialogue: "The price changes at dusk.", target: "Hero" },
      { toolCallId: "tc-speak", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    await tools.move_to.execute!(
      { targetLocation: "Harbor" },
      { toolCallId: "tc-move", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );
    await tools.update_own_goal.execute!(
      { oldGoal: "", newGoal: "watch the harbor", type: "short_term" as const },
      { toolCallId: "tc-goal", messages: [], abortSignal: undefined as unknown as AbortSignal },
    );

    expect(callOracle).not.toHaveBeenCalled();
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(storeEpisodicEvent).not.toHaveBeenCalled();
    expect(accumulateReflectionBudgetMock).not.toHaveBeenCalled();
    expect(commitAuthorityTraceMock).not.toHaveBeenCalled();
  });
});

describe("tickPresentNpcs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty array when no key NPCs at player location", async () => {
    setupMockDb({ npcsAtLocation: [] });

    const results = await tickPresentNpcs(CAMPAIGN_ID, TICK, JUDGE_PROVIDER, LOCATION_ID);

    expect(results).toEqual([]);
  });

  it("uses encounter scope instead of same broad location membership when selecting present NPCs", async () => {
    setupMockDb({
      npcsAtLocation: [
        createMockNpc({
          name: "Satoru Gojo",
          currentLocationId: LOCATION_ID,
          currentSceneLocationId: "rooftop-overwatch",
          derivedTags: '["encounter scope mismatch","same broad location"]',
        }),
      ],
    });

    const results = await tickPresentNpcs(
      CAMPAIGN_ID,
      TICK,
      JUDGE_PROVIDER,
      LOCATION_ID,
      "platform-7",
    );

    expect(results).toEqual([]);
  });
});

describe("tickNpcAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getRelationshipGraphMock.mockReturnValue([]);
  });

  it("builds NPC prompts from canonical record fields before falling back to legacy blobs", async () => {
    setupMockDb({
      npc: createMockNpc({
        persona: "Legacy merchant persona",
        tags: '["legacy-only"]',
        goals: '{"short_term":["legacy goal"],"long_term":[]}',
        beliefs: '["legacy belief"]',
      }),
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    expect(generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("Your profile: A patient fixer who trades in favors."),
      }),
    );

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain(
      "Canonical NPC record authority: profile, socialContext, motivations, capabilities, and state define who you are right now.",
    );
    expect(systemPrompt).toContain(
      "Derived runtime tags are compact compatibility evidence, not the source-of-truth.",
    );
    expect(systemPrompt).toContain("Your traits: [Observant, Master Negotiation, Secretive, Wealthy, Hidden, connected, Profit, Watched by rivals]");
    expect(systemPrompt).toContain("Your goals:\n  - [short] Broker a truce\n  - [long] Own the market district");
    expect(systemPrompt).toContain("Your beliefs: [Every debt can be collected]");
    expect(systemPrompt).toContain("Nearby entities:");
    expect(systemPrompt).toContain("Recent memories involving you:");
    expect(systemPrompt).not.toContain("legacy-only");
    expect(systemPrompt).not.toContain("Legacy merchant persona");
    expect(systemPrompt).not.toContain("legacy belief");
    expect(systemPrompt).not.toContain("Legacy persona/goals/beliefs blobs are authoritative");
    expect(systemPrompt).not.toContain("Use the legacy tags/persona blob as your main worldview");
  });

  it("reads reflected canonical beliefs, goals, and relationships on later turns", async () => {
    getRelationshipGraphMock.mockReturnValue([
      {
        entityName: "Greta the Merchant",
        relationships: [
          {
            targetName: "Elara",
            tags: ["Trusted Ally"],
            reason: "Elara protected the bazaar from raiders",
          },
        ],
      },
    ]);

    setupMockDb({
      npc: createMockNpc({
        beliefs: '["legacy belief"]',
        goals: '{"short_term":["legacy goal"],"long_term":[]}',
        characterRecord: JSON.stringify({
          identity: {
            id: NPC_ID,
            campaignId: CAMPAIGN_ID,
            role: "npc",
            tier: "key",
            displayName: "Greta the Merchant",
            canonicalStatus: "original",
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "A patient fixer who trades in favors.",
          },
          socialContext: {
            factionId: null,
            factionName: null,
            homeLocationId: null,
            homeLocationName: null,
            currentLocationId: LOCATION_ID,
            currentLocationName: "Market Square",
            relationshipRefs: [
              {
                entityId: "player-1",
                entityName: "Elara",
                type: "Trusted Ally",
                reason: "Elara protected the bazaar from raiders",
              },
            ],
            socialStatus: ["connected"],
            originMode: "native",
          },
          motivations: {
            shortTermGoals: ["Protect Elara's trade route"],
            longTermGoals: ["Bind the market's allies together"],
            beliefs: ["Elara honors her bargains"],
            drives: ["Profit"],
            frictions: ["Watched by rivals"],
          },
          capabilities: {
            traits: ["Observant"],
            skills: [{ name: "Negotiation", tier: "Master" }],
            flaws: ["Secretive"],
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
            legacyTags: ["merchant", "shrewd", "wealthy"],
          },
        }),
      }),
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Your beliefs: [Elara honors her bargains]");
    expect(systemPrompt).toContain(
      "Your goals:\n  - [short] Protect Elara's trade route\n  - [long] Bind the market's allies together",
    );
    expect(systemPrompt).toContain(
      "Your relationships:\nGreta the Merchant --[Trusted Ally]--> Elara (Elara protected the bazaar from raiders)",
    );
    expect(systemPrompt).not.toContain("legacy belief");
    expect(systemPrompt).not.toContain("legacy goal");
  });

  it("builds NPC planning prompts from behavioral core and live dynamics for key characters", async () => {
    setupMockDb({
      npc: createMockNpc({
        characterRecord: JSON.stringify({
          identity: {
            id: NPC_ID,
            campaignId: CAMPAIGN_ID,
            role: "npc",
            tier: "key",
            displayName: "Greta the Merchant",
            canonicalStatus: "known_ip_canonical",
            baseFacts: {
              biography: "A broker holding the bazaar's faction web together.",
              socialRole: ["market broker", "quiet fixer"],
              hardConstraints: ["Will not expose her ledger network"],
            },
            behavioralCore: {
              motives: [],
              pressureResponses: [],
              taboos: [],
              attachments: ["The bazaar families"],
              selfImage: "The hinge the market swings on.",
            },
            liveDynamics: {
              attachments: ["The bazaar families"],
              activeGoals: ["Protect Elara's trade route", "Expose the registry leak"],
              beliefDrift: ["Elara might be a reliable ally"],
              currentStrains: ["Watched by rivals", "Two favors from collapse"],
              earnedChanges: ["Now risks inventory to cover refugees"],
            },
            personality: {
              summary: "A market broker who keeps power by reading weakness before anyone names it.",
              voice: "Measured, dry, and always one implication ahead of the room.",
              decisionStyle: "Tests leverage quietly, then moves all at once.",
              worldview: "Security belongs to whoever can keep the ledger balanced.",
              internalContradictions: [
                "Protects the bazaar like family, but treats most loyalties as temporary currency.",
              ],
              personalMythology: "She is the hinge the market swings on, whether anyone thanks her or not.",
              sampleLines: [
                "Coin is loud. Favors are quieter, and they last longer.",
              ],
            },
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "A patient fixer who trades in favors.",
          },
          socialContext: {
            factionId: null,
            factionName: null,
            homeLocationId: null,
            homeLocationName: null,
            currentLocationId: LOCATION_ID,
            currentLocationName: "Market Square",
            relationshipRefs: [],
            socialStatus: ["connected"],
            originMode: "native",
          },
          motivations: {
            shortTermGoals: ["Protect Elara's trade route"],
            longTermGoals: ["Bind the market's allies together"],
            beliefs: ["Elara honors her bargains"],
            drives: ["Profit"],
            frictions: ["Watched by rivals"],
          },
          capabilities: {
            traits: ["Observant"],
            skills: [{ name: "Negotiation", tier: "Master" }],
            flaws: ["Secretive"],
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
            legacyTags: ["merchant", "shrewd", "wealthy"],
          },
        }),
      }),
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Personality:");
    expect(systemPrompt).toContain(
      "Personality summary: A market broker who keeps power by reading weakness before anyone names it.",
    );
    expect(systemPrompt).toContain(
      "Voice: Measured, dry, and always one implication ahead of the room.",
    );
    expect(systemPrompt).toContain("Live dynamics:");
    expect(systemPrompt).toContain("Current strains: Watched by rivals; Two favors from collapse");
    expect(systemPrompt).not.toContain("Enduring motives:");
    expect(systemPrompt).not.toContain("Pressure responses:");
    expect(systemPrompt).not.toContain("Taboos:");
  });

  it("filters nearby entities by encounter scope and justified knowledge basis instead of same broad location membership", async () => {
    setupMockDb({
      npcsAtLocation: [
        {
          id: "npc-megumi",
          name: "Megumi Fushiguro",
          tags: '["ally","encounter scope","knowledge basis: perceived_now"]',
          currentLocationId: LOCATION_ID,
          currentSceneLocationId: LOCATION_ID,
        },
        {
          id: "npc-gojo",
          name: "Satoru Gojo",
          tags: '["same broad location","outside encounter scope","knowledge basis: none"]',
          currentLocationId: LOCATION_ID,
          currentSceneLocationId: "rooftop-overwatch",
        },
      ],
      player: {
        id: "player-1",
        name: "Yuji Itadori",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Nearby entities:");
    expect(systemPrompt).toContain("Megumi Fushiguro");
    expect(systemPrompt).toContain("knowledge=perceived_now");
    expect(systemPrompt).not.toContain("Satoru Gojo");
  });

  it("injects COMBAT POSTURE when a clear-awareness powered target is present", async () => {
    setupMockDb({
      npc: createPoweredMockNpc(),
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
        characterRecord: JSON.stringify({
          identity: {
            id: "player-1",
            campaignId: CAMPAIGN_ID,
            role: "player",
            tier: "key",
            displayName: "Elara",
            canonicalStatus: "imported",
          },
          profile: {
            species: "",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "A dangerous swordswoman.",
          },
          socialContext: {
            factionId: null,
            factionName: null,
            homeLocationId: null,
            homeLocationName: null,
            currentLocationId: LOCATION_ID,
            currentLocationName: "Market Square",
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
            traits: ["Swordswoman"],
            skills: [],
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
            sourceKind: "import",
            importMode: "manual",
            templateId: null,
            archetypePrompt: null,
            worldgenOrigin: null,
            legacyTags: [],
          },
          powerStats: {
            attackPotency: { tier: "Building", rank: 5 },
            speed: { tier: "Subsonic", rank: 4 },
            durability: { tier: "Building", rank: 4 },
            intelligence: { tier: "Gifted", rank: 4 },
            hax: [],
            vulnerabilities: [],
          },
        }),
      },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("[COMBAT POSTURE]");
    expect(systemPrompt).toContain("Primary target: Elara");
    expect(systemPrompt).toContain("Can win direct exchange:");
    expect(logEventMock).toHaveBeenCalledWith(
      "combat.posture.derived",
      expect.objectContaining({
        source: "npc",
        npcId: NPC_ID,
        vsLabel: "Elara",
      }),
    );
  });

  it("keeps the pre-phase prompt path when no powered clear target exists", async () => {
    setupMockDb({
      npc: createPoweredMockNpc(),
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).not.toContain("[COMBAT POSTURE]");
    expect(systemPrompt).toContain("Choose at most ONE proposal that best serves your current goals");
    expect(systemPrompt).toContain("standalone NPC ticks do not roll, adjudicate, or commit world state");
    expect(systemPrompt).toContain("passing is valid");
    expect(logEventMock).not.toHaveBeenCalledWith(
      "combat.posture.derived",
      expect.anything(),
    );
  });

  it("logs NPC decision reasoning with usage and tool names", async () => {
    setupMockDb({
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I move first and ask for leverage.",
      reasoningText: "Greta prefers a probing opener that preserves optionality.",
      finishReason: "stop",
      response: {
        modelId: "glm-5.1",
      },
      usage: {
        inputTokens: 210,
        outputTokens: 48,
        totalTokens: 258,
      },
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "tc-speak",
              toolName: "speak",
              input: {
                dialogue: "Let's not waste each other's time.",
                target: "Elara",
              },
            },
          ],
          toolResults: [
            {
              output: {
                accepted: false,
                proposalOnly: true,
                toolName: "speak",
              },
            },
          ],
        },
      ],
      toolCalls: [],
      toolResults: [],
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    expect(logEventMock).toHaveBeenCalledWith(
      "npcAgent.decision",
      expect.objectContaining({
        npcId: NPC_ID,
        npcName: "Greta the Merchant",
        finishReason: "stop",
        responseModel: "glm-5.1",
        reasoningLen: "Greta prefers a probing opener that preserves optionality.".length,
        toolCallNames: ["speak"],
        usage: {
          inputTokens: 210,
          outputTokens: 48,
          totalTokens: 258,
        },
      }),
    );
    expect(logEventMock).toHaveBeenCalledWith(
      "npcAgent.reasoning",
      expect.objectContaining({
        npcId: NPC_ID,
        npcName: "Greta the Merchant",
        reasoningText: "Greta prefers a probing opener that preserves optionality.",
        responseModel: "glm-5.1",
        usage: {
          inputTokens: 210,
          outputTokens: 48,
          totalTokens: 258,
        },
      }),
    );
  });

  it("extracts NPC reasoning from Z.AI chat response body when reasoningText is empty", async () => {
    setupMockDb({
      npcsAtLocation: [],
      player: {
        id: "player-1",
        name: "Elara",
        currentLocationId: LOCATION_ID,
        currentSceneLocationId: LOCATION_ID,
      },
    });

    vi.mocked(generateText).mockResolvedValueOnce({
      text: "I test the room before committing.",
      reasoningText: undefined,
      finishReason: "stop",
      response: {
        modelId: "glm-5.1",
        body: {
          choices: [
            {
              message: {
                content: "I test the room before committing.",
                reasoning_content: "Greta probes first because the stranger's intent is still unclear.",
                role: "assistant",
              },
            },
          ],
        },
      },
      usage: {
        inputTokens: 180,
        outputTokens: 42,
        totalTokens: 222,
      },
      steps: [],
      toolCalls: [],
      toolResults: [],
    } as unknown as Awaited<ReturnType<typeof generateText>>);

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    expect(logEventMock).toHaveBeenCalledWith(
      "npcAgent.decision",
      expect.objectContaining({
        npcId: NPC_ID,
        reasoningLen: "Greta probes first because the stranger's intent is still unclear.".length,
      }),
    );
    expect(logEventMock).toHaveBeenCalledWith(
      "npcAgent.reasoning",
      expect.objectContaining({
        npcId: NPC_ID,
        reasoningText: "Greta probes first because the stranger's intent is still unclear.",
      }),
    );
  });
});
