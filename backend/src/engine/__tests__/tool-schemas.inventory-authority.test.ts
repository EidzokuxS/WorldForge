import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("ai", () => ({
  tool: vi.fn((definition: unknown) => definition),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

import { createStorytellerTools } from "../tool-schemas.js";
import { executeToolCall } from "../tool-executor.js";

describe("createStorytellerTools inventory authority", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (executeToolCall as Mock).mockResolvedValue({ success: true });
  });

  it("keeps transfer_item as the only item-state mutation tool and accepts structured equip semantics", async () => {
    const tools = createStorytellerTools("campaign-1", 5);

    expect(Object.keys(tools)).toContain("transfer_item");
    expect(Object.keys(tools)).not.toContain("equip_item");
    expect(Object.keys(tools)).not.toContain("unequip_item");

    const schema = tools.transfer_item.inputSchema;

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

    await tools.transfer_item.execute({
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
    );
  });
});
