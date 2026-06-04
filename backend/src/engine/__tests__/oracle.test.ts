import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock ai SDK
vi.mock("ai", () => ({
  generateObject: vi.fn(),
  generateText: vi.fn(),
}));

// Mock provider registry
vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import {
  DURABILITY_NO_BYPASS_CLAMP_LINE,
  rollD100,
  resolveOutcome,
  callOracle,
  oracleOutputSchema,
  type OraclePayload,
} from "../oracle.js";
import { buildOraclePromptContract } from "../prompt-contracts.js";
import { generateText } from "ai";
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

describe("oracle prompt contract helper", () => {
  it("exposes exact Oracle output shape, caps, examples, and backend authority", () => {
    const contract = buildOraclePromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: oracle.v1");
    expect(contract).toContain('{ "chance": integer 1-99, "reasoning": string max 500 chars }');
    expect(contract).toContain("chance must never be 0 or 100");
    expect(contract).toContain("reasoning max 500 chars");
    expect(contract).toContain("Do not use randomness to create or confirm missing inventory");
    expect(contract).toContain("claimed key, permit, pass, credential");
    expect(contract).toContain("Compact valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain('{ "chance": 50, "reasoning": "Even odds from the supplied tags." }');
    expect(contract).toContain("Invalid examples:");
    expect(contract).toContain("chance 0");
    expect(contract).toContain("overlong rationale");
    expect(contract).toContain("Backend authority:");
    expect(contract).toContain("backend owns the d100 roll and outcome tier");
    expect(contract).toContain("must not invent targets, destination, tags, combat facts, or state mutation");
  });
});

describe("callOracle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns OracleResult with chance, roll, outcome, reasoning", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":65,"reasoning":"The thief is skilled."}',
    } as never);

    const result = await callOracle(mockPayload, mockProvider);

    expect(result).toHaveProperty("chance", 65);
    expect(result).toHaveProperty("roll");
    expect(result).toHaveProperty("outcome");
    expect(result).toHaveProperty("reasoning", "The thief is skilled.");
    expect(typeof result.roll).toBe("number");
    expect(["strong_hit", "weak_hit", "miss"]).toContain(result.outcome);
  });

  it("enforces temperature=0 in generateObject call", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":50,"reasoning":"Even odds."}',
    } as never);

    await callOracle(mockPayload, mockProvider);

    expect(generateText).toHaveBeenCalledTimes(1);
    const callArgs = vi.mocked(generateText).mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs.temperature).toBe(0);
  });

  it("throws when generateObject fails and no fallback provider is configured", async () => {
    vi.mocked(generateText).mockRejectedValue(new Error("API error"));

    await expect(callOracle(mockPayload, mockProvider)).rejects.toThrow("API error");
  });

  it("keeps the oracle prompt deterministic and calibration-focused without stale worldview instructions", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":75,"reasoning":"Skilled thief with favorable tools and conditions."}',
    } as never);

    await callOracle(mockPayload, mockProvider);

    const callArgs = vi.mocked(generateText).mock.calls[0]![0] as Record<string, unknown>;
    const systemPrompt = String(callArgs.system ?? "");
    const prompt = String(callArgs.prompt ?? "");

    expect(systemPrompt).toContain("Your job is to evaluate the probability of success for a player's action.");
    expect(systemPrompt).toContain("STRUCTURED_OUTPUT_CONTRACT: oracle.v1");
    expect(systemPrompt).toContain('{ "chance": integer 1-99, "reasoning": string max 500 chars }');
    expect(systemPrompt).toContain("Do not return outcome, roll, state mutation, prose narration, tool calls, or target selection.");
    expect(systemPrompt).toContain("backend owns the d100 roll and outcome tier");
    expect(systemPrompt).toContain("Use only the provided actorTags, targetTags, environmentTags, and sceneContext as evidence snapshots.");
    expect(systemPrompt).toContain("Do NOT widen this into narration, character creation, or world simulation.");
    expect(systemPrompt).toContain("Do NOT decide that a claimed item, credential, authority, or access proof exists");
    expect(systemPrompt).toContain("Calibration bands:");
    expect(systemPrompt).not.toContain("Your output must be narrative prose only.");
    expect(systemPrompt).not.toContain("Treat every player and NPC as one shared CharacterDraft/CharacterRecord model");
    expect(systemPrompt).not.toContain("offer_quick_actions");
    expect(prompt).toContain("Action: Pick the lock via Using lockpicks");
    expect(prompt).toContain("Actor: [skilled-thief, nimble]");
    expect(prompt).toContain("Target: [iron-lock, rusted]");
    expect(prompt).toContain("Environment: [dim-light, quiet]");
  });

  it("keeps targetTags as a first-class oracle payload field even when fallback is honest and empty", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":40,"reasoning":"No concrete target context was resolved."}',
    } as never);

    await callOracle(
      {
        ...mockPayload,
        targetTags: [],
      },
      mockProvider,
    );

    const callArgs = vi.mocked(generateText).mock.calls[0]![0] as Record<string, unknown>;
    const prompt = String(callArgs.prompt ?? "");

    expect(prompt).toContain("Target: []");
  });

  it("calls createModel with the provided provider config", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":50,"reasoning":"test"}',
    } as never);

    await callOracle(mockPayload, mockProvider);

    expect(createModel).toHaveBeenCalledWith(mockProvider);
  });

  it("renders an envelope block when combatEnvelope is present", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":28,"reasoning":"Direct force is checked by the target durability gap."}',
    } as never);

    await callOracle(
      {
        ...mockPayload,
        combatEnvelope: {
          matchup: "disadvantaged",
          durabilityTierGap: 2,
          durabilityStepGap: 20,
          speedTierGap: -1,
          speedStepGap: -10,
          intelligenceTierGap: 0,
          intelligenceStepGap: 0,
          actorBypassesTarget: false,
          targetBypassesActor: false,
          actorBypassSources: [],
          targetBypassSources: [],
          relevantVulnerabilities: [],
          summaryLines: [
            "Matchup: disadvantaged.",
            "Target durability is two tiers above actor attack.",
          ],
        },
      },
      mockProvider,
    );

    const callArgs = vi.mocked(generateText).mock.calls[0]![0] as Record<string, unknown>;
    const prompt = String(callArgs.prompt ?? "");

    expect(prompt).toContain("[Combat Envelope]");
    expect(prompt).toContain("Matchup: disadvantaged");
    expect(prompt).toContain("durabilityTierGap: 2");
    expect(prompt).toContain("- Matchup: disadvantaged.");
  });

  it("locks the no-bypass durability clamp phrase when the envelope says direct force is outclassed", async () => {
    vi.mocked(generateText).mockResolvedValue({
      text: '{"chance":22,"reasoning":"Raw force is heavily disfavored without a bypass."}',
    } as never);

    await callOracle(
      {
        ...mockPayload,
        combatEnvelope: {
          matchup: "outmatched",
          durabilityTierGap: 3,
          durabilityStepGap: 30,
          speedTierGap: -1,
          speedStepGap: -10,
          intelligenceTierGap: -1,
          intelligenceStepGap: -10,
          actorBypassesTarget: false,
          targetBypassesActor: true,
          actorBypassSources: [],
          targetBypassSources: ["Infinity"],
          relevantVulnerabilities: [],
          summaryLines: ["Target durability is three tiers above actor attack."],
        },
      },
      mockProvider,
    );

    const callArgs = vi.mocked(generateText).mock.calls[0]![0] as Record<string, unknown>;
    const prompt = String(callArgs.prompt ?? "");
    expect(prompt).toContain(DURABILITY_NO_BYPASS_CLAMP_LINE);
  });
});
