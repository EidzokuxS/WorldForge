import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

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

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn().mockResolvedValue({
    object: { isMovement: false, destination: null },
  }),
}));

vi.mock("../target-context.js", () => ({
  resolveActionTargetContext: vi.fn().mockResolvedValue({ targetTags: [] }),
}));

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
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock("ai", () => ({
  tool: vi.fn((definition: unknown) => definition),
  streamText: vi.fn(),
  stepCountIs: vi.fn().mockReturnValue({ type: "step-count", count: 3 }),
}));

import { streamText } from "ai";
import { getDb } from "../../db/index.js";
import { callOracle } from "../oracle.js";
import { assemblePrompt } from "../prompt-assembler.js";
import {
  appendChatMessages,
  getChatHistory,
  incrementTick,
  readCampaignConfig,
} from "../../campaign/index.js";
import { processTurn, type TurnEvent } from "../turn-processor.js";
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
    from: vi.fn().mockImplementation((table: { _?: { name?: string } }) => {
      lastTableName = table?._?.name ?? null;
      return db;
    }),
    where: vi.fn().mockImplementation(() => ({
      get: vi.fn().mockImplementation(() => getRows(lastTableName)[0]),
      all: vi.fn().mockImplementation(() => getRows(lastTableName)),
    })),
    update: vi.fn().mockImplementation((table: { _?: { name?: string } }) => {
      const tableName = table?._?.name ?? null;
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
    (assemblePrompt as Mock).mockResolvedValue({
      formatted: "System prompt",
      sections: [],
      totalTokens: 100,
      budgetUsed: 10,
    });
    (getChatHistory as Mock).mockReturnValue([]);
    (appendChatMessages as Mock).mockImplementation(() => {});
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (incrementTick as Mock).mockReturnValue(6);
  });

  it("reaches the live storyteller transfer_item tool seam and mutates authoritative item rows", async () => {
    const { db, state } = createMutableInventoryDb();
    (getDb as Mock).mockReturnValue(db);

    const transferArgs = {
      itemName: "Iron Sword",
      targetName: "Hero",
      targetType: "character" as const,
      equipState: "equipped" as const,
      equippedSlot: "main-hand",
    };

    (streamText as Mock).mockImplementation(({ tools }: { tools: Record<string, { execute: (args: unknown) => Promise<unknown> }> }) => ({
      fullStream: (async function* () {
        const output = await tools.transfer_item.execute(transferArgs);
        yield {
          type: "tool-result",
          toolName: "transfer_item",
          input: transferArgs,
          output,
        };
        yield {
          type: "text-delta",
          text: "Hero slides the sword into a ready grip.",
        };
      })(),
      text: Promise.resolve("Hero slides the sword into a ready grip."),
    }));

    const events = await collectEvents(
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
