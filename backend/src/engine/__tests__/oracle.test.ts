import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ai SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
}));

// Mock provider registry
vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import {
  rollD100,
  resolveOutcome,
  callOracle,
  oracleOutputSchema,
  type OraclePayload,
} from "../oracle.js";
import { generateObject } from "ai";
import { createModel } from "../../ai/provider-registry.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";

const mockProvider: ProviderConfig = {
  id: "test",
  name: "Test Provider",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
};

const mockPayload: OraclePayload = {
  intent: "Pick the lock",
  method: "Using lockpicks",
  actorTags: ["skilled-thief", "nimble"],
  targetTags: ["iron-lock", "rusted"],
  environmentTags: ["dim-light", "quiet"],
  sceneContext: "A dark corridor in the castle dungeon.",
};

describe("rollD100", () => {
  it("returns integer between 1 and 100 (100 iterations)", () => {
    for (let i = 0; i < 100; i++) {
      const result = rollD100();
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(100);
      expect(Number.isInteger(result)).toBe(true);
    }
  });
});

describe("resolveOutcome", () => {
  it("returns strong_hit when roll <= chance * 0.5", () => {
    expect(resolveOutcome(10, 60)).toBe("strong_hit");
  });

  it("returns weak_hit when roll > chance*0.5 but <= chance", () => {
    expect(resolveOutcome(45, 60)).toBe("weak_hit");
  });

  it("returns miss when roll > chance", () => {
    expect(resolveOutcome(75, 60)).toBe("miss");
  });

  it("returns strong_hit at boundary (roll=30, chance=60 -> 30 <= 30)", () => {
    expect(resolveOutcome(30, 60)).toBe("strong_hit");
  });

  it("returns weak_hit at boundary (roll=60, chance=60 -> 60 <= 60)", () => {
    expect(resolveOutcome(60, 60)).toBe("weak_hit");
  });

  it("handles edge case roll=1, chance=1", () => {
    // chance*0.5 = 0.5, roll=1 > 0.5 so NOT strong_hit, but 1 <= 1 so weak_hit
    expect(resolveOutcome(1, 1)).toBe("weak_hit");
  });
});

describe("oracleOutputSchema", () => {
  it("accepts valid object {chance: 50, reasoning: 'text'}", () => {
    const result = oracleOutputSchema.safeParse({
      chance: 50,
      reasoning: "The actor has relevant skills.",
    });
    expect(result.success).toBe(true);
  });

  it("rejects chance=0 (min=1)", () => {
    const result = oracleOutputSchema.safeParse({
      chance: 0,
      reasoning: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects chance=100 (max=99)", () => {
    const result = oracleOutputSchema.safeParse({
      chance: 100,
      reasoning: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects chance=-1", () => {
    const result = oracleOutputSchema.safeParse({
      chance: -1,
      reasoning: "text",
    });
    expect(result.success).toBe(false);
  });

  it("rejects chance=101", () => {
    const result = oracleOutputSchema.safeParse({
      chance: 101,
      reasoning: "text",
    });
    expect(result.success).toBe(false);
  });
});

describe("callOracle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns OracleResult with chance, roll, outcome, reasoning", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { chance: 65, reasoning: "The thief is skilled." },
    } as any);

    const result = await callOracle(mockPayload, mockProvider);

    expect(result).toHaveProperty("chance", 65);
    expect(result).toHaveProperty("roll");
    expect(result).toHaveProperty("outcome");
    expect(result).toHaveProperty("reasoning", "The thief is skilled.");
    expect(typeof result.roll).toBe("number");
    expect(["strong_hit", "weak_hit", "miss"]).toContain(result.outcome);
  });

  it("enforces temperature=0 in generateObject call", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { chance: 50, reasoning: "Even odds." },
    } as any);

    await callOracle(mockPayload, mockProvider);

    expect(generateObject).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateObject).mock.calls[0]![0] as any;
    expect(callArgs.temperature).toBe(0);
  });

  it("throws when generateObject fails and no fallback provider is configured", async () => {
    vi.mocked(generateObject).mockRejectedValue(new Error("API error"));

    await expect(callOracle(mockPayload, mockProvider)).rejects.toThrow("API error");
  });

  it("clamps chance to 1-99 even if value is out of range", async () => {
    // Simulate generateObject returning out-of-range chance (bypassing Zod somehow)
    vi.mocked(generateObject).mockResolvedValue({
      object: { chance: 0, reasoning: "Should be clamped." },
    } as any);

    const result = await callOracle(mockPayload, mockProvider);

    expect(result.chance).toBeGreaterThanOrEqual(1);
    expect(result.chance).toBeLessThanOrEqual(99);
  });

  it("calls createModel with the provided provider config", async () => {
    vi.mocked(generateObject).mockResolvedValue({
      object: { chance: 50, reasoning: "test" },
    } as any);

    await callOracle(mockPayload, mockProvider);

    expect(createModel).toHaveBeenCalledWith(mockProvider);
  });
});
