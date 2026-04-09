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
  incrementTick,
  readCampaignConfig,
} from "../../campaign/index.js";
import { createStorytellerTools } from "../tool-schemas.js";
import { streamText } from "ai";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { getDb } from "../../db/index.js";
import { players, locations, npcs } from "../../db/schema.js";

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
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({
        id: "player-1",
        name: "Hero",
        tags: '["warrior"]',
        currentLocationId: "loc-1",
      }),
    }),
  };
  (getDb as Mock).mockReturnValue(mockDb);

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

    resolvePostTurn?.();

    const doneStep = await pendingDone;
    expect(doneStep.done).toBe(false);
    expect(doneStep.value).toEqual({
      type: "done",
      data: { tick: 6 },
    });
  });

  it("D-14 fails the turn if rollback-critical finalization exceeds the hard timeout", async () => {
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

      const generator = processTurn(
        createTestOptions({
          onPostTurn: () => new Promise<void>(() => undefined),
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

      const pendingDone = generator.next();
      const pendingAssertion = expect(pendingDone).rejects.toThrow(/finalization/i);
      await vi.advanceTimersByTimeAsync(60_001);

      await pendingAssertion;
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
});
