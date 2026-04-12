import { describe, it, expect, vi, beforeEach } from "vitest";

const { accumulateReflectionBudgetMock, getRelationshipGraphMock } = vi.hoisted(() => ({
  accumulateReflectionBudgetMock: vi.fn(),
  getRelationshipGraphMock: vi.fn(),
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

import { createNpcAgentTools } from "../npc-tools.js";
import { tickNpcAgent, tickPresentNpcs } from "../npc-agent.js";
import { getDb } from "../../db/index.js";
import { callOracle } from "../oracle.js";
import { executeToolCall } from "../tool-executor.js";
import { storeEpisodicEvent } from "../../vectors/episodic-events.js";
import { generateText } from "ai";
import { npcs, locations, locationEdges, players, items } from "../../db/schema.js";

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

  it("act tool calls Oracle and executeToolCall; returns oracle result", async () => {
    const mockDb = setupMockDb({});
    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.act.execute!(
      { action: "steal the ruby" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(callOracle).toHaveBeenCalled();
    expect(result).toHaveProperty("oracleResult");
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

  it("move_to updates NPC currentLocationId on success", async () => {
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

    expect(result).toHaveProperty("moved", true);
    expect(mockDb.run).toHaveBeenCalled();
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

    expect(result).toEqual({
      moved: true,
      from: "Shibuya Crossing",
      to: "Tokyo Jujutsu High",
      travelCost: 2,
      path: ["Shibuya Crossing", "Hidden Station Platform", "Tokyo Jujutsu High"],
    });
    expect(mockDb.run).toHaveBeenCalled();
  });

  it("update_own_goal replaces old goal with new goal", async () => {
    const mockDb = setupMockDb({});

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.update_own_goal.execute!(
      { oldGoal: "sell rare goods", newGoal: "find rare artifacts", type: "short_term" as const },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toHaveProperty("updated", true);
    expect(mockDb.run).toHaveBeenCalled();
  });

  it("speak returns dialogue text as result without Oracle", async () => {
    setupMockDb({});

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const result = await tools.speak.execute!(
      { dialogue: "Welcome to my shop!", target: "player" },
      { toolCallId: "tc1", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(result).toHaveProperty("spoke", true);
    expect(result).toHaveProperty("dialogue", "Welcome to my shop!");
    expect(callOracle).not.toHaveBeenCalled();
    expect(storeEpisodicEvent).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.objectContaining({
        location: "Market Square",
      }),
    );
  });

  it("increments reflection budget when present-NPC dialogue commits an episodic event", async () => {
    setupMockDb({});

    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    await tools.speak.execute!(
      { dialogue: "We need allies before dawn.", target: "Hero" },
      { toolCallId: "tc2", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(storeEpisodicEvent).toHaveBeenCalled();
    expect(accumulateReflectionBudgetMock).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      ["Greta the Merchant", "Hero"],
      3,
    );
  });

  it("avoids double-counting reflection budget when present-NPC act piggybacks through log_event", async () => {
    setupMockDb({});
    const tools = createNpcAgentTools(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    await tools.act.execute!(
      { action: "broker a risky deal" },
      { toolCallId: "tc3", messages: [], abortSignal: undefined as unknown as AbortSignal }
    );

    expect(executeToolCall).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      "log_event",
      expect.objectContaining({
        participants: ["Greta the Merchant"],
      }),
      TICK,
    );
    expect(accumulateReflectionBudgetMock).not.toHaveBeenCalled();
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
          derivedTags: '["encounter scope mismatch","same broad location"]',
        }),
      ],
    });

    const results = await tickPresentNpcs(CAMPAIGN_ID, TICK, JUDGE_PROVIDER, LOCATION_ID);

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
      player: { name: "Elara" },
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
            relationshipRefs: ["rel-elara"],
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
      player: { name: "Elara" },
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

  it("filters nearby entities by encounter scope and justified knowledge basis instead of same broad location membership", async () => {
    setupMockDb({
      npcsAtLocation: [
        {
          name: "Megumi Fushiguro",
          tags: '["ally","encounter scope","knowledge basis: perceived_now"]',
        },
        {
          name: "Satoru Gojo",
          tags: '["same broad location","outside encounter scope","knowledge basis: none"]',
        },
      ],
      player: { name: "Yuji Itadori" },
    });

    await tickNpcAgent(CAMPAIGN_ID, NPC_ID, TICK, JUDGE_PROVIDER);

    const systemPrompt = (generateText as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]?.system as string;
    expect(systemPrompt).toContain("Nearby entities:");
    expect(systemPrompt).toContain("Megumi Fushiguro");
    expect(systemPrompt).not.toContain("Satoru Gojo");
  });
});
