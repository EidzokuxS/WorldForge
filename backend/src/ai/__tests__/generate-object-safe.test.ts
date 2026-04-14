import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";

const mockGenerateText = vi.fn();

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  generateObject: vi.fn(),
}));

const { safeGenerateObject } = await import("../generate-object-safe.js");

describe("safeGenerateObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("coerces string-array elements from object payloads with item-like keys", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        equippedItems: [
          { name: "White Lightning" },
          { item: "Seal Eyepatch" },
          { label: "Travel Papers" },
        ],
      }),
    });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        equippedItems: z.array(z.string()),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object).toEqual({
      equippedItems: [
        "White Lightning",
        "Seal Eyepatch",
        "Travel Papers",
      ],
    });
  });
});
