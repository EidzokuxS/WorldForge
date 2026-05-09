import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../oracle.js", () => ({
  callOracle: vi.fn(),
}));

vi.mock("../prompt-assembler.js", () => ({
  assembleJudgeAdjudicationPrompt: vi.fn(),
  assembleFinalNarrationPrompt: vi.fn().mockResolvedValue({
    system: "",
    prompt: "",
    totalTokens: 0,
  }),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: vi.fn(),
  advanceCampaignTick: vi.fn(),
  incrementTick: vi.fn(),
  readCampaignConfig: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("../hidden-adjudication.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../hidden-adjudication.js")>()),
  runHiddenAdjudicationPlan: vi.fn(),
}));

vi.mock("../target-context.js", () => ({
  resolveActionTargetContext: vi.fn().mockResolvedValue({ targetTags: [] }),
}));

vi.mock("../world-brain.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../world-brain.js")>();
  return {
    ...actual,
    runWorldBrainSceneDirection: vi.fn().mockResolvedValue({
      situationSummary: "The player is readying a weapon already in the scene.",
      sceneQuestion: "Does the player take possession of the weapon cleanly?",
      focalActorNames: ["Hero"],
      backgroundActorNames: [],
      presenceReasons: [
        {
          actorName: "Hero",
          reason: "The player is the only clear actor involved in the equip action.",
          perceivable: true,
        },
      ],
      causalBeats: [
        {
          summary: "The equip action is about authoritative inventory transfer, not social escalation.",
          perceivable: true,
        },
      ],
      narrationGuardrails: ["Keep the narration anchored to the equip action."],
    }),
  };
});

vi.mock("../../character/record-adapters.js", () => ({
  hydrateStoredPlayerRecord: vi.fn((row: { currentLocationId: string | null; hp?: number }) => ({
    socialContext: {
      currentLocationId: row.currentLocationId,
      currentLocationName: "Town Square",
    },
    state: {
      hp: row.hp ?? 5,
      statusFlags: [],
    },
    startConditions: {
      startLocationId: null,
      arrivalMode: null,
      immediateSituation: null,
      entryPressure: [],
      companions: [],
      startingVisibility: null,
      resolvedNarrative: null,
      sourcePrompt: null,
    },
  })),
  projectPlayerRecord: vi.fn((record: unknown) => ({
    characterRecord: JSON.stringify(record),
    equippedItems: "[]",
    tags: "[]",
  })),
}));

vi.mock("../../character/runtime-tags.js", () => ({
  deriveRuntimeCharacterTags: vi.fn().mockReturnValue([]),
}));

vi.mock("../start-condition-runtime.js", () => ({
  applyStartConditionEffects: vi.fn((record: unknown) => ({
    record,
    changed: false,
    effects: { sceneContextLines: [] },
  })),
  deriveStartConditionEffects: vi.fn(() => ({
    isActive: false,
    openingStatusFlags: [],
    activeStatusFlags: [],
    sceneFlags: [],
    sceneContextLines: [],
    promptLines: [],
    companionNames: [],
    expirationReason: "none",
  })),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  })),
  withRole: <T,>(_role: string, fn: () => T) => fn(),
}));

vi.mock("ai", () => ({
  tool: vi.fn((definition: unknown) => definition),
  generateText: vi.fn().mockResolvedValue({
    text: "Hero readies the Iron Sword.",
    toolCalls: [],
  }),
}));

import { getDb } from "../../db/index.js";
import { callOracle } from "../oracle.js";
import { assembleJudgeAdjudicationPrompt } from "../prompt-assembler.js";
import {
  appendChatMessages,
  incrementTick,
  readCampaignConfig,
} from "../../campaign/index.js";
import { processTurn, type TurnEvent } from "../turn-processor.js";
import { runHiddenAdjudicationPlan } from "../hidden-adjudication.js";
import { players, locations, items } from "../../db/schema.js";
import { buildAuthoritativeInventoryView } from "../../inventory/authority.js";

const CAMPAIGN_ID = "test-campaign-123";

type MutableInventoryItem = {
  id: string;
  campaignId: string;
  name: string;
  tags: string;
  ownerId: string | null;
  locationId: string | null;
  equipState: "carried" | "equipped";
  equippedSlot: string | null;
  isSignature: boolean;
};

function getDrizzleTableName(table: unknown): string | null {
  return (table as Record<PropertyKey, unknown>)?.[Symbol.for("drizzle:Name")] as string | null;
}

function createMutableInventoryDb() {
  const state = {
    players: [
      {
        id: "player-1",
        campaignId: CAMPAIGN_ID,
        name: "Hero",
        hp: 5,
        currentLocationId: "loc-1",
        characterRecord: "{}",
        equippedItems: "[]",
        tags: "[]",
      },
    ],
    locations: [
      {
        id: "loc-1",
        campaignId: CAMPAIGN_ID,
        name: "Town Square",
        description: "A wind-cut square of old stone.",
        tags: "[]",
      },
    ],
    items: [
      {
        id: "item-1",
        campaignId: CAMPAIGN_ID,
        name: "Iron Sword",
        tags: '["weapon"]',
        ownerId: null,
        locationId: "loc-1",
        equipState: "carried" as const,
        equippedSlot: null,
        isSignature: false,
      },
    ] satisfies MutableInventoryItem[],
  };

  let lastTableName: string | null = null;

  const getRows = (tableName: string | null): Record<string, unknown>[] => {
    switch (tableName) {
      case "players":
        return state.players;
      case "locations":
        return state.locations;
      case "items":
        return state.items;
      default:
        return [];
    }
  };

  const db = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastTableName = getDrizzleTableName(table);
      return db;
    }),
    where: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockImplementation(() => getRows(lastTableName)[0]),
      all: vi.fn().mockImplementation(() => getRows(lastTableName)),
      orderBy: vi.fn().mockImplementation(() => ({
        limit: vi.fn().mockImplementation(() => ({
          all: vi.fn().mockReturnValue([]),
        })),
        all: vi.fn().mockReturnValue([]),
      })),
    })),
    update: vi.fn().mockImplementation((table: unknown) => {
      const tableName = getDrizzleTableName(table);
      return {
        set: vi.fn().mockImplementation((values: Record<string, unknown>) => ({
          where: vi.fn().mockImplementation(() => ({
            run: vi.fn().mockImplementation(() => {
              const row = getRows(tableName)[0];
              if (row) {
                Object.assign(row, values);
              }
            }),
          })),
        })),
      };
    }),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockReturnValue({
        run: vi.fn(),
        onConflictDoUpdate: vi.fn().mockReturnValue({ run: vi.fn() }),
      }),
    })),
  };

  return { db, state };
}

async function collectEvents(generator: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

describe("processTurn inventory authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (callOracle as Mock).mockResolvedValue({
      chance: 65,
      roll: 20,
      outcome: "strong_hit",
      reasoning: "Test oracle result",
    });
    (assembleJudgeAdjudicationPrompt as Mock).mockResolvedValue({
      system: "[ACTION RESULT]\n\nOutcome: strong_hit",
      messages: [{ role: "user", content: "Ready the sword" }],
      assembledBase: {
        formatted: "System prompt",
        sections: [],
        totalTokens: 100,
        budgetUsed: 10,
      },
    });
    (appendChatMessages as Mock).mockImplementation(() => {});
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (incrementTick as Mock).mockReturnValue(6);
  });

  it("reaches the live hidden adjudication transfer_item seam and mutates authoritative item rows", async () => {
    const { db, state } = createMutableInventoryDb();
    (getDb as Mock).mockReturnValue(db);
    const previousScenePlanFlag = process.env.SCENE_PLAN_ENABLED;
    process.env.SCENE_PLAN_ENABLED = "false";

    const transferArgs = {
      itemName: "Iron Sword",
      targetName: "Hero",
      targetType: "character" as const,
      equipState: "equipped" as const,
      equippedSlot: "main-hand",
    };

    (runHiddenAdjudicationPlan as Mock).mockResolvedValue({
      rationale: "Equip the sword before visible narration.",
      actions: [{ toolName: "transfer_item", input: transferArgs }],
    });

    let events: TurnEvent[];
    try {
      events = await collectEvents(
        processTurn({
          campaignId: CAMPAIGN_ID,
          playerAction: "Ready the sword",
          intent: "Ready the sword",
          method: "equipping the blade",
          judgeProvider: {
            id: "judge",
            name: "Judge",
            baseUrl: "http://localhost",
            apiKey: "key",
            model: "judge-model",
          },
          storytellerProvider: {
            id: "storyteller",
            name: "Storyteller",
            baseUrl: "http://localhost",
            apiKey: "key",
            model: "storyteller-model",
          },
          storytellerTemperature: 0.8,
          storytellerMaxTokens: 512,
        }),
      );
    } finally {
      if (previousScenePlanFlag === undefined) {
        delete process.env.SCENE_PLAN_ENABLED;
      } else {
        process.env.SCENE_PLAN_ENABLED = previousScenePlanFlag;
      }
    }

    expect(events).toContainEqual({
      type: "state_update",
      data: {
        tool: "transfer_item",
        args: transferArgs,
        result: expect.objectContaining({ success: true }),
      },
    });

    const authoritativeView = buildAuthoritativeInventoryView(
      state.items.filter((item) => item.ownerId === "player-1"),
    );

    expect(authoritativeView.equipped.map((item) => item.name)).toEqual(["Iron Sword"]);
    expect(authoritativeView.carried).toHaveLength(0);
  });
});
