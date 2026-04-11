import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// -- Mocks --------------------------------------------------------------------

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../oracle.js", () => ({
  callOracle: vi.fn(),
}));

vi.mock("../prompt-assembler.js", () => ({
  assemblePrompt: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  getChatHistory: vi.fn(),
  appendChatMessages: vi.fn(),
  advanceCampaignTick: vi.fn(),
  incrementTick: vi.fn(),
  readCampaignConfig: vi.fn(),
}));

vi.mock("../tool-schemas.js", () => ({
  createStorytellerTools: vi.fn(),
}));

// Mock the ai module
vi.mock("ai", () => ({
  streamText: vi.fn(),
  stepCountIs: vi.fn().mockReturnValue({ type: "step-count", count: 2 }),
  tool: vi.fn((def: unknown) => def),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn().mockResolvedValue({ object: { isMovement: false, destination: null } }),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import { processTurn, type TurnEvent } from "../turn-processor.js";
import { callOracle } from "../oracle.js";
import { assemblePrompt } from "../prompt-assembler.js";
import {
  getChatHistory,
  appendChatMessages,
  advanceCampaignTick,
  incrementTick,
  readCampaignConfig,
} from "../../campaign/index.js";
import { createStorytellerTools } from "../tool-schemas.js";
import { streamText } from "ai";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { getDb } from "../../db/index.js";
import { players, locations, locationEdges, npcs, items } from "../../db/schema.js";

// -- Helpers ------------------------------------------------------------------

const CAMPAIGN_ID = "test-campaign-123";

function createTestOptions(overrides = {}) {
  return {
    campaignId: CAMPAIGN_ID,
    playerAction: "I attack the goblin",
    intent: "Attack the goblin",
    method: "sword swing",
    judgeProvider: {
      id: "test",
      name: "Test",
      baseUrl: "http://localhost",
      apiKey: "key",
      model: "test-model",
    },
    storytellerProvider: {
      id: "test",
      name: "Test",
      baseUrl: "http://localhost",
      apiKey: "key",
      model: "test-model",
    },
    storytellerTemperature: 0.8,
    storytellerMaxTokens: 2000,
    ...overrides,
  };
}

function mockOracleResult() {
  return {
    chance: 65,
    roll: 30,
    outcome: "strong_hit" as const,
    reasoning: "Skilled warrior vs weak goblin",
  };
}

function mockAssembledPrompt() {
  return {
    formatted: "System prompt with world context",
    sections: [],
    totalTokens: 100,
    budgetUsed: 10,
  };
}

/**
 * Create a mock async iterable for fullStream that yields the given parts.
 */
function createMockFullStream(parts: Array<{ type: string; [key: string]: unknown }>) {
  return {
    [Symbol.asyncIterator]: async function* () {
      for (const part of parts) {
        yield part;
      }
    },
  };
}

function setupMocks(options: {
  streamParts?: Array<{ type: string; [key: string]: unknown }>;
  oracleResult?: { chance: number; roll: number; outcome: string; reasoning: string };
} = {}) {
  const oracleResult = options.oracleResult ?? mockOracleResult();
  const streamParts = options.streamParts ?? [
    { type: "text-delta", text: "The goblin " },
    { type: "text-delta", text: "falls." },
  ];

  // Mock DB
  const mockDb = createEntityLookupDb({});
  (getDb as Mock).mockReturnValue(mockDb);

  (advanceCampaignTick as Mock).mockReturnValue(6);
  // Mock Oracle
  (callOracle as Mock).mockResolvedValue(oracleResult);

  // Mock assemblePrompt
  (assemblePrompt as Mock).mockResolvedValue(mockAssembledPrompt());

  // Mock chat history
  (getChatHistory as Mock).mockReturnValue([
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Welcome, adventurer." },
  ]);

  // Mock readCampaignConfig
  (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });

  // Mock incrementTick
  (incrementTick as Mock).mockReturnValue(6);

  // Mock createStorytellerTools
  (createStorytellerTools as Mock).mockReturnValue({});

  // Mock streamText
  (streamText as Mock).mockReturnValue({
    fullStream: createMockFullStream(streamParts),
    text: Promise.resolve("The goblin falls."),
  });

  return { oracleResult, mockDb };
}

function createEntityLookupDb(options: {
  playerRow?: Record<string, unknown>;
  locationRows?: Array<Record<string, unknown>>;
  edgeRows?: Array<Record<string, unknown>>;
  npcRows?: Array<Record<string, unknown>>;
  itemRows?: Array<Record<string, unknown>>;
}) {
  const playerRow = options.playerRow ?? {
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Hero",
    hp: 5,
    tags: '["legacy-only"]',
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
        drives: ["Determined"],
        frictions: [],
      },
      capabilities: {
        traits: ["Brave"],
        skills: [{ name: "Swordsman", tier: "Skilled" }],
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
  };
  const locationRows = options.locationRows ?? [
    {
      id: "loc-1",
      campaignId: CAMPAIGN_ID,
      name: "Town Square",
      description: "A bustling square",
      tags: '["urban", "crowded"]',
      connectedTo: "[]",
      isStarting: false,
    },
  ];
  const edgeRows =
    options.edgeRows ??
    locationRows.flatMap((location) => {
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
  const npcRows = options.npcRows ?? [];
  const itemRows = options.itemRows ?? [];
  let lastFromTable: unknown = null;
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastFromTable = table;
      return mockDb;
    }),
    where: vi.fn().mockImplementation(() => {
      if (lastFromTable === (players as unknown)) {
        return {
          get: vi.fn().mockReturnValue(playerRow),
          all: vi.fn().mockReturnValue([playerRow]),
        };
      }
      if (lastFromTable === (locations as unknown)) {
        return {
          get: vi.fn().mockReturnValue(locationRows[0] ?? null),
          all: vi.fn().mockReturnValue(locationRows),
        };
      }
      if (lastFromTable === (locationEdges as unknown)) {
        return {
          get: vi.fn().mockReturnValue(edgeRows[0] ?? null),
          all: vi.fn().mockReturnValue(edgeRows),
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
      return {
        get: vi.fn().mockReturnValue(null),
        all: vi.fn().mockReturnValue([]),
      };
    }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          run: vi.fn(),
        })),
      })),
    })),
  };

  return mockDb;
}

function createOpeningPlayerRow(overrides: {
  currentTick?: number;
  currentLocationId?: string;
  startLocationId?: string;
  statusFlags?: string[];
  immediateSituation?: string;
  entryPressure?: string[];
  companions?: string[];
  startingVisibility?: string;
  arrivalMode?: string;
} = {}) {
  const currentLocationId = overrides.currentLocationId ?? "loc-1";
  const startLocationId = overrides.startLocationId ?? "loc-1";

  return {
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Hero",
    hp: 5,
    tags: '["legacy-only"]',
    equippedItems: "[]",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    currentLocationId,
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
        currentLocationId,
        currentLocationName: "Town Square",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "outsider",
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
        skills: [{ name: "Swordsman", tier: "Skilled" }],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      state: {
        hp: 5,
        conditions: [],
        statusFlags: overrides.statusFlags ?? [],
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {
        startLocationId,
        arrivalMode: overrides.arrivalMode ?? "on-foot",
        immediateSituation:
          overrides.immediateSituation
          ?? "A tail is closing in as you push through the market crowd.",
        entryPressure: overrides.entryPressure ?? ["under watch", "clock running out"],
        companions: overrides.companions ?? ["Mira"],
        startingVisibility: overrides.startingVisibility ?? "noticed",
      },
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
  };
}

async function collectEvents(generator: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

// -- Tests --------------------------------------------------------------------

describe("processTurn", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: no movement detected
    vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isMovement: false, destination: null } } as never);
  });

  it("yields oracle_result event first", async () => {
    const { oracleResult } = setupMocks();
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    expect(events[0]).toEqual({
      type: "oracle_result",
      data: oracleResult,
    });
  });

  it("yields narrative events with text for each text chunk", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The goblin " },
        { type: "text-delta", text: "falls." },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const narrativeEvents = events.filter((e) => e.type === "narrative");
    expect(narrativeEvents).toHaveLength(2);
    expect(narrativeEvents[0]!.data).toEqual({ text: "The goblin " });
    expect(narrativeEvents[1]!.data).toEqual({ text: "falls." });
  });

  it("yields state_update events for tool results", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The goblin is wounded." },
        {
          type: "tool-result",
          toolName: "add_tag",
          input: { entityName: "Goblin", entityType: "npc", tag: "wounded" },
          output: { success: true, result: { entity: "Goblin", tags: ["wounded"] } },
        },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const stateUpdates = events.filter((e) => e.type === "state_update");
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0]!.data).toEqual({
      tool: "add_tag",
      args: { entityName: "Goblin", entityType: "npc", tag: "wounded" },
      result: { success: true, result: { entity: "Goblin", tags: ["wounded"] } },
    });
  });

  it("yields quick_actions event when offer_quick_actions tool is called", async () => {
    const actions = [
      { label: "Loot", action: "Search the body" },
      { label: "Move", action: "Continue down the corridor" },
      { label: "Rest", action: "Take a short rest" },
    ];
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "Victory!" },
        {
          type: "tool-result",
          toolName: "offer_quick_actions",
          input: { actions },
          output: { success: true, result: { actions } },
        },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const quickActions = events.filter((e) => e.type === "quick_actions");
    expect(quickActions).toHaveLength(1);
    expect(quickActions[0]!.data).toEqual({
      success: true,
      result: { actions },
    });
  });

  it("emits server-side fallback quick actions when storyteller omits the tool call", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The signal room falls quiet." },
      ],
    });

    let lastFromTable: unknown = null;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockImplementation((table: unknown) => {
        lastFromTable = table;
        return mockDb;
      }),
      where: vi.fn().mockImplementation(() => {
        if (lastFromTable === (players as unknown)) {
          return {
            get: vi.fn().mockReturnValue({
              id: "player-1",
              name: "Hero",
              tags: '["warrior"]',
              currentLocationId: "loc-1",
            }),
          };
        }
        if (lastFromTable === (locations as unknown)) {
          return {
            get: vi.fn().mockReturnValue({
              id: "loc-1",
              name: "Signal Room",
            }),
          };
        }
        if (lastFromTable === (npcs as unknown)) {
          return {
            all: vi.fn().mockReturnValue([{ name: "Dr. Sato" }]),
          };
        }
        return {
          get: vi.fn().mockReturnValue(null),
          all: vi.fn().mockReturnValue([]),
        };
      }),
    };
    (getDb as Mock).mockReturnValue(mockDb);

    const events = await collectEvents(processTurn(createTestOptions()));

    const quickActions = events.filter((e) => e.type === "quick_actions");
    expect(quickActions).toHaveLength(1);
    expect(quickActions[0]!.data).toEqual({
      success: true,
      result: {
        actions: [
          { label: "Talk to Dr. Sato", action: "Talk to Dr. Sato" },
          { label: "Look around", action: "Look around Signal Room for anything noteworthy" },
          { label: "Press the advantage", action: "Press the advantage and continue forward" },
        ],
      },
    });
  });

  it("yields done event as last event with tick", async () => {
    setupMocks();
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const lastEvent = events[events.length - 1];
    expect(lastEvent?.type).toBe("done");
    expect(lastEvent?.data).toHaveProperty("tick");
  });

  it("calls assemblePrompt with actionResult from Oracle", async () => {
    const { oracleResult } = setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(assemblePrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        includeRecentConversation: false,
        actionResult: oracleResult,
      })
    );
  });

  it("uses streamText with tools from createStorytellerTools", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(createStorytellerTools).toHaveBeenCalledWith(CAMPAIGN_ID, expect.any(Number), expect.any(String));
    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: expect.any(Object),
      })
    );
  });

  it("uses stopWhen: stepCountIs(2) for multi-step tool calling", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        stopWhen: expect.anything(),
      })
    );
  });

  it("persists user and assistant messages to chat history", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    // User message persisted
    expect(appendChatMessages).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "I attack the goblin" }),
      ])
    );

    // Assistant message persisted (after stream completes)
    expect(appendChatMessages).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant" }),
      ])
    );
  });

  it("increments tick after completion", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(incrementTick).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("calls post-turn callback with summary if provided", async () => {
    setupMocks();
    const onPostTurn = vi.fn();
    const options = createTestOptions({ onPostTurn });

    await collectEvents(processTurn(options));

    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: expect.any(Number),
        oracleResult: expect.any(Object),
        toolCalls: expect.any(Array),
        narrativeText: expect.any(String),
      })
    );
  });

  it("D-02/D-03 emits finalizing_turn and waits for rollback-critical post-turn work before done", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The goblin falls." },
        {
          type: "tool-result",
          toolName: "offer_quick_actions",
          input: {
            actions: [{ label: "Loot", action: "Loot the goblin" }],
          },
          output: {
            success: true,
            result: {
              actions: [{ label: "Loot", action: "Loot the goblin" }],
            },
          },
        },
      ],
    });

    let resolvePostTurn: (() => void) | null = null;
    const onPostTurn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePostTurn = resolve;
        }),
    );

    const generator = processTurn(createTestOptions({ onPostTurn }));
    const observedTypes: string[] = [];

    for (let i = 0; i < 8; i += 1) {
      const step = await generator.next();
      if (step.done) break;
      observedTypes.push(step.value.type);
      if (step.value.type === "finalizing_turn") {
        break;
      }
    }

    expect(observedTypes).toContain("finalizing_turn");

    let doneResolved = false;
    const pendingDone = generator.next().then((result) => {
      doneResolved = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onPostTurn).toHaveBeenCalledTimes(1);
    expect(doneResolved).toBe(false);

    if (resolvePostTurn) {
      resolvePostTurn();
    }

    const doneStep = await pendingDone;
    expect(doneStep.done).toBe(false);
    expect(doneStep.value).toEqual({
      type: "done",
      data: { tick: 6 },
    });
  });

  it("does not fail rollback-critical finalization after 60 seconds of legitimate work", async () => {
    vi.useFakeTimers();

    try {
      setupMocks({
        streamParts: [
          { type: "text-delta", text: "The goblin falls." },
          {
            type: "tool-result",
            toolName: "offer_quick_actions",
            input: {
              actions: [{ label: "Loot", action: "Loot the goblin" }],
            },
            output: {
              success: true,
              result: {
                actions: [{ label: "Loot", action: "Loot the goblin" }],
              },
            },
          },
        ],
      });

      let resolvePostTurn: (() => void) | null = null;
      const generator = processTurn(
        createTestOptions({
          onPostTurn: () =>
            new Promise<void>((resolve) => {
              resolvePostTurn = resolve;
            }),
        }),
      );

      let sawFinalizing = false;
      for (let i = 0; i < 8; i += 1) {
        const step = await generator.next();
        if (step.done) break;
        if (step.value.type === "finalizing_turn") {
          sawFinalizing = true;
          break;
        }
      }

      expect(sawFinalizing).toBe(true);

      let settled = false;
      const pendingDone = generator.next().then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(60_001);

      expect(settled).toBe(false);

      if (resolvePostTurn) {
        resolvePostTurn();
      }
      const doneStep = await pendingDone;
      expect(doneStep.done).toBe(false);
      expect(doneStep.value).toEqual({
        type: "done",
        data: { tick: 6 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  describe("movement in turn processing", () => {
    it("yields location_change state_update when moving to connected location", async () => {
      vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isMovement: true, destination: "the tavern" } } as never);

      const playerRow = {
        id: "player-1",
        name: "Hero",
        tags: '["warrior"]',
        currentLocationId: "loc-1",
      };
      const currentLocation = {
        id: "loc-1",
        name: "Town Square",
        description: "A bustling square",
        tags: '["urban"]',
        connectedTo: '["loc-2","loc-3"]',
      };
      const destLocation = {
        id: "loc-2",
        name: "The Tavern",
        description: "A cozy tavern",
        tags: '["indoor"]',
        connectedTo: '["loc-1"]',
      };

      const allLocations = [currentLocation, destLocation];

      // Track which table is being queried via from()
      let lastFromTable: unknown = null;
      const mockRun = vi.fn();

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation((table: unknown) => {
          lastFromTable = table;
          return mockDb;
        }),
        where: vi.fn().mockImplementation(() => {
          // Return different results based on which table was last queried
          if (lastFromTable === (players as unknown)) {
            return {
              get: vi.fn().mockReturnValue(playerRow),
              all: vi.fn().mockReturnValue([playerRow]),
            };
          }
          if (lastFromTable === (locations as unknown)) {
            return {
              get: vi.fn().mockReturnValue(currentLocation),
              all: vi.fn().mockReturnValue(allLocations),
            };
          }
          return {
            get: vi.fn().mockReturnValue(null),
            all: vi.fn().mockReturnValue([]),
          };
        }),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              run: mockRun,
            })),
          })),
        })),
      };

      (getDb as Mock).mockReturnValue(mockDb);
      (callOracle as Mock).mockResolvedValue(mockOracleResult());
      (assemblePrompt as Mock).mockResolvedValue(mockAssembledPrompt());
      (getChatHistory as Mock).mockReturnValue([]);
      (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
      (incrementTick as Mock).mockReturnValue(6);
      (createStorytellerTools as Mock).mockReturnValue({});
      (streamText as Mock).mockReturnValue({
        fullStream: createMockFullStream([
          { type: "text-delta", text: "You walk to the tavern." },
        ]),
        text: Promise.resolve("You walk to the tavern."),
      });

      const options = createTestOptions({
        playerAction: "go to the tavern",
        intent: "Travel to the tavern",
        method: "walking",
      });

      const events = await collectEvents(processTurn(options));

      const locationChanges = events.filter(
        (e) => e.type === "state_update" && (e.data as Record<string, unknown>).type === "location_change"
      );
      expect(locationChanges).toHaveLength(1);
      expect(locationChanges[0]!.data).toEqual({
        type: "location_change",
        locationId: "loc-2",
        locationName: "The Tavern",
      });
    });

    it("does not block movement to non-connected location, passes through to Oracle", async () => {
      vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isMovement: true, destination: "the tavern" } } as never);

      const playerRow = {
        id: "player-1",
        name: "Hero",
        tags: '["warrior"]',
        currentLocationId: "loc-1",
      };
      const currentLocation = {
        id: "loc-1",
        name: "Town Square",
        description: "A bustling square",
        tags: '["urban"]',
        connectedTo: '["loc-3"]', // loc-2 NOT connected
      };
      const destLocation = {
        id: "loc-2",
        name: "The Tavern",
        description: "A cozy tavern",
        tags: '["indoor"]',
        connectedTo: '["loc-1"]',
      };

      const allLocations = [currentLocation, destLocation];
      let lastFromTable: unknown = null;

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation((table: unknown) => {
          lastFromTable = table;
          return mockDb;
        }),
        where: vi.fn().mockImplementation(() => {
          if (lastFromTable === (players as unknown)) {
            return {
              get: vi.fn().mockReturnValue(playerRow),
              all: vi.fn().mockReturnValue([playerRow]),
            };
          }
          if (lastFromTable === (locations as unknown)) {
            return {
              get: vi.fn().mockReturnValue(currentLocation),
              all: vi.fn().mockReturnValue(allLocations),
            };
          }
          return {
            get: vi.fn().mockReturnValue(null),
            all: vi.fn().mockReturnValue([]),
          };
        }),
      };

      (getDb as Mock).mockReturnValue(mockDb);
      (callOracle as Mock).mockResolvedValue(mockOracleResult());
      (assemblePrompt as Mock).mockResolvedValue(mockAssembledPrompt());
      (getChatHistory as Mock).mockReturnValue([]);
      (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
      (incrementTick as Mock).mockReturnValue(6);
      (createStorytellerTools as Mock).mockReturnValue({});
      (streamText as Mock).mockReturnValue({
        fullStream: createMockFullStream([
          { type: "text-delta", text: "The path is blocked." },
        ]),
        text: Promise.resolve("The path is blocked."),
      });

      const options = createTestOptions({
        playerAction: "go to the tavern",
        intent: "Travel to the tavern",
        method: "walking",
      });

      const events = await collectEvents(processTurn(options));

      // Should NOT have a location_change event (not connected)
      const locationChanges = events.filter(
        (e) => e.type === "state_update" && (e.data as Record<string, unknown>).type === "location_change"
      );
      expect(locationChanges).toHaveLength(0);

      // Oracle should still be called (action proceeds normally)
      expect(callOracle).toHaveBeenCalled();
    });
  });

  it("still yields oracle result on Oracle failure (fallback)", async () => {
    // Oracle has its own fallback -- callOracle always returns a result
    const fallbackResult = {
      chance: 50,
      roll: 42,
      outcome: "weak_hit" as const,
      reasoning: "Oracle unavailable -- using coin flip fallback",
    };
    setupMocks({ oracleResult: fallbackResult });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    expect(events[0]).toEqual({
      type: "oracle_result",
      data: fallbackResult,
    });
  });

  it("derives Oracle actor tags from canonical player records instead of raw stored tags", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: false, destination: null },
    } as never);

    const playerRow = {
      id: "player-1",
      name: "Hero",
      hp: 4,
      tags: '["legacy-only"]',
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
          socialStatus: ["Wanted"],
          originMode: "resident",
        },
        motivations: {
          shortTermGoals: [],
          longTermGoals: [],
          beliefs: [],
          drives: ["Curious"],
          frictions: [],
        },
        capabilities: {
          traits: ["Brave"],
          skills: [{ name: "Swordsman", tier: "Skilled" }],
          flaws: [],
          specialties: [],
          wealthTier: "Poor",
        },
        state: {
          hp: 4,
          conditions: ["Wounded"],
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
          legacyTags: ["legacy-only"],
        },
      }),
      derivedTags: '["legacy-only"]',
      currentLocationId: "loc-1",
    };
    const locationRow = {
      id: "loc-1",
      name: "Town Square",
      description: "A busy square",
      tags: '["urban"]',
      connectedTo: "[]",
    };

    let lastFromTable: unknown = null;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockImplementation((table: unknown) => {
        lastFromTable = table;
        return mockDb;
      }),
      where: vi.fn().mockImplementation(() => {
        if (lastFromTable === (players as unknown)) {
          return {
            get: vi.fn().mockReturnValue(playerRow),
            all: vi.fn().mockReturnValue([playerRow]),
          };
        }
        if (lastFromTable === (locations as unknown)) {
          return {
            get: vi.fn().mockReturnValue(locationRow),
            all: vi.fn().mockReturnValue([locationRow]),
          };
        }
        return {
          get: vi.fn().mockReturnValue(null),
          all: vi.fn().mockReturnValue([]),
        };
      }),
    };

    (getDb as Mock).mockReturnValue(mockDb);
    (callOracle as Mock).mockResolvedValue(mockOracleResult());
    (assemblePrompt as Mock).mockResolvedValue(mockAssembledPrompt());
    (getChatHistory as Mock).mockReturnValue([]);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (incrementTick as Mock).mockReturnValue(6);
    (createStorytellerTools as Mock).mockReturnValue({});
    (streamText as Mock).mockReturnValue({
      fullStream: createMockFullStream([{ type: "text-delta", text: "The goblin falls." }]),
      text: Promise.resolve("The goblin falls."),
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(callOracle).toHaveBeenCalledWith(
      expect.objectContaining({
        actorTags: [
          "Brave",
          "Skilled Swordsman",
          "Poor",
          "Wounded",
          "Wanted",
          "Curious",
        ],
      }),
      expect.anything(),
      null,
    );
  });

  it("translates structured start conditions into opening-scene Oracle modifiers and companion context", async () => {
    setupMocks();
    const playerRow = createOpeningPlayerRow();
    const mockDb = createEntityLookupDb({
      playerRow,
      locationRows: [
        {
          id: "loc-1",
          campaignId: CAMPAIGN_ID,
          name: "Town Square",
          description: "A busy square ringed by food stalls.",
          tags: '["urban", "crowded"]',
          connectedTo: "[]",
          isStarting: true,
        },
      ],
    });

    (getDb as Mock).mockReturnValue(mockDb);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 0 });

    await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Slip between the stalls and keep moving",
          intent: "Escape the tail in the market",
          method: "quick evasive movement",
        }),
      ),
    );

    expect(callOracle).toHaveBeenCalledWith(
      expect.objectContaining({
        actorTags: expect.arrayContaining([
          "Opening: Arrival - On Foot",
          "Opening: Visibility - Noticed",
          "Opening: Pressure - Under Watch",
          "Opening: Pressure - Clock Running Out",
          "Opening: Companion Present",
          "Opening: Situation - Pursued",
        ]),
        sceneContext: expect.stringContaining("Opening Companions: Mira"),
      }),
      expect.anything(),
      null,
    );

    expect(callOracle).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneContext: expect.stringContaining("Opening Constraints:"),
      }),
      expect.anything(),
      null,
    );
  });

  it("expires opening-state flags after the early-turn ceiling for the next persisted turn boundary", async () => {
    setupMocks();
    const playerRow = createOpeningPlayerRow({
      statusFlags: [
        "Opening: Arrival - On Foot",
        "Opening: Visibility - Noticed",
        "Opening: Pressure - Under Watch",
        "Opening: Companion Present",
        "Opening: Situation - Pursued",
      ],
    });
    const mockDb = createEntityLookupDb({ playerRow });

    (getDb as Mock).mockReturnValue(mockDb);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 2 });
    (incrementTick as Mock).mockReturnValue(3);

    await collectEvents(processTurn(createTestOptions()));

    expect(mockDb.update).toHaveBeenCalled();
  });

  it("clears opening-state flags for persisted player state after a connected location change", async () => {
    setupMocks();
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: true, destination: "Safehouse" },
    } as never);

    const playerRow = createOpeningPlayerRow({
      currentLocationId: "loc-1",
      startLocationId: "loc-1",
      statusFlags: [
        "Opening: Arrival - On Foot",
        "Opening: Visibility - Noticed",
        "Opening: Pressure - Under Watch",
        "Opening: Companion Present",
        "Opening: Situation - Pursued",
      ],
    });
    const mockDb = createEntityLookupDb({
      playerRow,
      locationRows: [
        {
          id: "loc-1",
          campaignId: CAMPAIGN_ID,
          name: "Town Square",
          description: "A busy square ringed by food stalls.",
          tags: '["urban", "crowded"]',
          connectedTo: '["loc-2"]',
          isStarting: true,
        },
        {
          id: "loc-2",
          campaignId: CAMPAIGN_ID,
          name: "Safehouse",
          description: "A shuttered safehouse down a side alley.",
          tags: '["hidden", "indoors"]',
          connectedTo: '["loc-1"]',
          isStarting: false,
        },
      ],
    });
    (getDb as Mock).mockReturnValue(mockDb);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 1 });

    await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Go to the Safehouse",
          intent: "Travel to the Safehouse",
          method: "moving quickly toward the Safehouse",
        }),
      ),
    );

    expect(mockDb.update).toHaveBeenCalled();
  });

  it("keeps narration directives outcome-specific instead of re-authoring generic tool policy", async () => {
    setupMocks({
      oracleResult: {
        chance: 55,
        roll: 42,
        outcome: "weak_hit",
        reasoning: "The action works, but the situation stays unstable.",
      },
    });

    await collectEvents(processTurn(createTestOptions()));

    const streamArgs = (streamText as Mock).mock.calls[0]![0] as {
      system: string;
    };

    expect(streamArgs.system).toContain("[NARRATION DIRECTIVE]");
    expect(streamArgs.system).toContain("The player SUCCEEDED WITH A COMPLICATION.");
    expect(streamArgs.system).not.toContain("After narration, you MUST call offer_quick_actions");
    expect(streamArgs.system).not.toContain("light hit = -1");
  });

  it("uses resolveTravelPath travel cost for multi-edge movement instead of adjacency-only teleport movement", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: true, destination: "Tokyo Jujutsu High" },
    } as never);

    const mockDb = createEntityLookupDb({
      playerRow: createOpeningPlayerRow({ currentLocationId: "loc-shibuya" }),
      locationRows: [
        {
          id: "loc-shibuya",
          campaignId: CAMPAIGN_ID,
          name: "Shibuya Crossing",
          description: "A packed district of neon and pedestrian flow.",
          tags: '["macro"]',
          connectedTo: '["loc-station"]',
          isStarting: true,
        },
        {
          id: "loc-station",
          campaignId: CAMPAIGN_ID,
          name: "Hidden Station Platform",
          description: "A persistent sublocation below the district.",
          tags: '["persistent_sublocation"]',
          connectedTo: '["loc-shibuya","loc-school"]',
          isStarting: false,
        },
        {
          id: "loc-school",
          campaignId: CAMPAIGN_ID,
          name: "Tokyo Jujutsu High",
          description: "A hilltop academy beyond the city rail lines.",
          tags: '["macro"]',
          connectedTo: '["loc-station"]',
          isStarting: false,
        },
      ],
    });

    (getDb as Mock).mockReturnValue(mockDb);
    (callOracle as Mock).mockResolvedValue(mockOracleResult());
    (assemblePrompt as Mock).mockResolvedValue(mockAssembledPrompt());
    (getChatHistory as Mock).mockReturnValue([]);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 12 });
    (advanceCampaignTick as Mock).mockReturnValue(14);
    (incrementTick as Mock).mockReturnValue(13);
    (createStorytellerTools as Mock).mockReturnValue({});
    (streamText as Mock).mockReturnValue({
      fullStream: createMockFullStream([
        { type: "text-delta", text: "You make the long trip to the academy." },
      ]),
      text: Promise.resolve("You make the long trip to the academy."),
    });

    const events = await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Travel to Tokyo Jujutsu High",
          intent: "Travel to Tokyo Jujutsu High",
          method: "taking the fastest believable route",
        }),
      ),
    );

    expect(events).toContainEqual({
      type: "state_update",
      data: {
        type: "location_change",
        locationId: "loc-school",
        locationName: "Tokyo Jujutsu High",
        travelCost: 2,
        tickAdvance: 2,
        path: ["Shibuya Crossing", "Hidden Station Platform", "Tokyo Jujutsu High"],
      },
    });
    expect(advanceCampaignTick).toHaveBeenCalledWith(CAMPAIGN_ID, 2);
    expect(incrementTick).not.toHaveBeenCalled();
  });

  describe("target-aware oracle", () => {
    it("passes non-empty targetTags for supported character targets instead of the old empty-target seam", async () => {
      setupMocks();
      const mockDb = createEntityLookupDb({
        npcRows: [
          {
            id: "npc-1",
            campaignId: CAMPAIGN_ID,
            name: "Goblin Raider",
            persona: "Hostile scout",
            tags: '["legacy-only"]',
            tier: "persistent",
            currentLocationId: "loc-1",
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 0,
            characterRecord: JSON.stringify({
              identity: {
                id: "npc-1",
                campaignId: CAMPAIGN_ID,
                role: "npc",
                tier: "persistent",
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
                socialStatus: ["Raider"],
                originMode: "unknown",
              },
              motivations: {
                shortTermGoals: [],
                longTermGoals: [],
                beliefs: [],
                drives: ["Cruel"],
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
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
            derivedTags: "[]",
          },
        ],
      });

      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Strike the Goblin Raider with my sword",
            intent: "Strike the Goblin Raider",
            method: "Skilled sword slash at Goblin Raider",
          }),
        ),
      );

      expect(callOracle).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTags: expect.arrayContaining([
            "Agile",
            "Skilled Dagger Fighting",
            "Hidden",
            "Raider",
            "Cruel",
          ]),
        }),
        expect.anything(),
        null,
      );
    });

    it("passes normalized stored tags for supported item and location/object targets", async () => {
      setupMocks();

      const itemDb = createEntityLookupDb({
        itemRows: [
          {
            id: "item-1",
            campaignId: CAMPAIGN_ID,
            name: "Moon Key",
            tags: '["Ancient", "Silver", "Locked-Door Key"]',
            ownerId: null,
            locationId: "loc-1",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(itemDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Use the Moon Key on the sealed gate",
            intent: "Use the Moon Key",
            method: "Press the Moon Key into the lock",
          }),
        ),
      );

      expect(callOracle).toHaveBeenLastCalledWith(
        expect.objectContaining({
          targetTags: ["Ancient", "Silver", "Locked-Door Key"],
        }),
        expect.anything(),
        null,
      );

      const locationDb = createEntityLookupDb({
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A bustling square",
            tags: '["urban", "crowded"]',
            connectedTo: "[]",
            isStarting: false,
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Signal Tower",
            description: "An old relay station",
            tags: '["elevated", "exposed", "arcane-device"]',
            connectedTo: "[]",
            isStarting: false,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(locationDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Inspect the Signal Tower for weak points",
            intent: "Inspect the Signal Tower",
            method: "Careful survey of Signal Tower",
          }),
        ),
      );

      expect(callOracle).toHaveBeenLastCalledWith(
        expect.objectContaining({
          targetTags: ["elevated", "exposed", "arcane-device"],
        }),
        expect.anything(),
        null,
      );
    });

    it("keeps unsupported target fallback honest with targetTags: []", async () => {
      setupMocks();
      const mockDb = createEntityLookupDb({});
      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Attack the impossible shimmer",
            intent: "Attack the impossible shimmer",
            method: "Wild swing at the impossible shimmer",
          }),
        ),
      );

      expect(callOracle).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTags: [],
        }),
        expect.anything(),
        null,
      );
    });

    it("does not run a second target parser when movement already resolved the destination target candidate", async () => {
      setupMocks();
      vi.mocked(safeGenerateObject).mockResolvedValue({
        object: { isMovement: true, destination: "Signal Tower" },
      } as never);

      const mockDb = createEntityLookupDb({
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A bustling square",
            tags: '["urban", "crowded"]',
            connectedTo: '["loc-2"]',
            isStarting: false,
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Signal Tower",
            description: "An old relay station",
            tags: '["elevated", "exposed"]',
            connectedTo: '["loc-1"]',
            isStarting: false,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Go to the Signal Tower",
            intent: "Travel to the Signal Tower",
            method: "walking to Signal Tower",
          }),
        ),
      );

      expect(safeGenerateObject).toHaveBeenCalledTimes(1);
      expect(callOracle).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTags: ["elevated", "exposed"],
        }),
        expect.anything(),
        null,
      );
    });
  });
});
