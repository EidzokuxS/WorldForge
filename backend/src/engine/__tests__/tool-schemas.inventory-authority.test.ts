import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import type { z } from "zod";

vi.mock("ai", () => ({
  tool: vi.fn((definition: unknown) => definition),
}));

type ZodLike<T> = z.ZodType<T>;

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

import { createStorytellerTools } from "../tool-schemas.js";
import { executeToolCall } from "../tool-executor.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";

function createExecutionContext(): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "player-1",
    subjectActorRefs: new Set(["player-1", "Hero"]),
    authority: {
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "player-1" },
      elapsedWorldTimeMinutes: 1,
    },
    currentLocationId: "loc-square",
    currentSceneScopeId: "loc-square",
    legalLocationRefs: new Set(["loc-square", "Town Square", "current_location", "current_scene"]),
    legalActorRefs: new Set(["player-1", "Hero"]),
    legalItemRefs: new Set(["Iron Sword"]),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(["loc-square", "Town Square", "current_location"]),
    currentSceneRefs: new Set(["loc-square", "Town Square", "current_scene"]),
    legalMovementRefs: new Set(),
  };
}

describe("createStorytellerTools inventory authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (executeToolCall as Mock).mockResolvedValue({ success: true });
  });

  it("keeps transfer_item as the only item-state mutation tool and accepts structured equip semantics", async () => {
    const executionContext = createExecutionContext();
    const tools = createStorytellerTools("campaign-1", 5, undefined, executionContext);

    expect(Object.keys(tools)).toContain("transfer_item");
    expect(Object.keys(tools)).not.toContain("equip_item");
    expect(Object.keys(tools)).not.toContain("unequip_item");

    const schema = tools.transfer_item.inputSchema as unknown as ZodLike<Record<string, unknown>>;

    expect(
      schema.safeParse({
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
        equipState: "equipped",
        equippedSlot: "main-hand",
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
      }).success,
    ).toBe(true);

    expect(
      schema.safeParse({
        itemName: "Iron Sword",
        targetName: "Town Square",
        targetType: "location",
      }).success,
    ).toBe(true);

    await (tools.transfer_item.execute as (args: unknown) => Promise<unknown>)({
      itemName: "Iron Sword",
      targetName: "Hero",
      targetType: "character",
      equipState: "equipped",
      equippedSlot: "main-hand",
    });

    expect(executeToolCall).toHaveBeenCalledWith(
      "campaign-1",
      "transfer_item",
      expect.objectContaining({
        itemName: "Iron Sword",
        targetName: "Hero",
        targetType: "character",
        equipState: "equipped",
        equippedSlot: "main-hand",
      }),
      5,
      undefined,
      executionContext,
    );
  });
});
