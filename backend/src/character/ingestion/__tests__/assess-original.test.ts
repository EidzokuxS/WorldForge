import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { CharacterDraft } from "@worldforge/shared";
import rogueDraft from "./fixtures/draft-rogue.json" with { type: "json" };

const captured: { prompt?: string } = {};
const humanStats = {
  attackPotency: { tier: "Street", rank: 4 },
  durability: { tier: "Street", rank: 3 },
  speed: { tier: "Human", rank: 8 },
  intelligence: { tier: "Above Average", rank: 6 },
  hax: [],
  vulnerabilities: [{ description: "No combat training for duels", severity: "minor" }],
};

const {
  mockGenerateObject,
  mockCreateModel,
  mockPowerStatsGenerationSchema,
} = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
  mockCreateModel: vi.fn(() => ({ modelId: "mock" })),
  mockPowerStatsGenerationSchema: {
    name: "strict-power-stats-generation-schema",
    parse: vi.fn((raw: any) => raw),
  },
}));

vi.mock("../../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: mockGenerateObject,
}));
vi.mock("../../../ai/index.js", () => ({ createModel: mockCreateModel }));
vi.mock("../../../lib/clamp.js", () => ({ clampTokens: (n: number) => n ?? 2048 }));
vi.mock("../../../lib/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }),
}));
vi.mock("../../known-ip-worldgen-research.js", () => ({
  powerStatsGenerationSchema: mockPowerStatsGenerationSchema,
  AP_DUR_TIER_LIST: "Human, Street, …",
  SPEED_TIER_LIST: "Human, Superhuman, …",
  INTELLIGENCE_TIER_LIST: "Average, Above Average, …",
}));

import { assessOriginalCharacterPowerStats } from "../assess-original.js";
import { IngestionPipelineError } from "../errors.js";

beforeEach(() => {
  captured.prompt = undefined;
  mockGenerateObject.mockReset();
  mockCreateModel.mockClear();
  mockPowerStatsGenerationSchema.parse.mockReset();
  mockPowerStatsGenerationSchema.parse.mockImplementation((raw: any) => raw);
  mockGenerateObject.mockImplementation(async (opts: any) => {
    captured.prompt = opts.prompt;
    return { object: humanStats };
  });
});

const role: any = { provider: "glm", temperature: 0.3, maxTokens: 4096 };

describe("assessOriginalCharacterPowerStats", () => {
  it("produces powerStats on the draft", async () => {
    const out = await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      role, premise: "A port city",
    });
    expect(out.powerStats).toBeDefined();
    expect(out.powerStats!.attackPotency.tier).toBe("Street");
    expect(Array.isArray(out.powerStats!.hax)).toBe(true);
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({
      retries: 1,
      timeout: { totalMs: 90_000 },
      mode: "tool",
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    });
    expect(mockGenerateObject.mock.calls[0]?.[0].schema).toBe(mockPowerStatsGenerationSchema);
    expect(mockGenerateObject.mock.calls[0]?.[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("bounds imported-card assessment with bypass reasoning and one provider attempt", async () => {
    await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      cardText: "A cat-burglar with a grappling hook.",
      role,
      premise: "A port city",
      isImportedCharacter: true,
    });

    expect(mockCreateModel).toHaveBeenCalledWith(role.provider, {
      role: "generator",
      reasoningMode: "bypass",
    });
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({
      retries: 1,
      timeout: { totalMs: 90_000 },
      mode: "tool",
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    });
    expect(mockGenerateObject.mock.calls[0]?.[0].schema).toBe(mockPowerStatsGenerationSchema);
    expect(mockGenerateObject.mock.calls[0]?.[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("uses one strict imported generation result without entering repair", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: humanStats });

    const assessed = await assessOriginalCharacterPowerStats(importedAssessmentInput());

    expect(assessed.powerStats).toEqual(humanStats);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockPowerStatsGenerationSchema.parse).toHaveBeenCalledTimes(1);
  });

  it("fails malformed imported output without a repair or fallback call", async () => {
    mockGenerateObject.mockResolvedValueOnce({ object: {} });
    mockPowerStatsGenerationSchema.parse.mockImplementationOnce(() => {
      throw new Error("strict PowerStats validation failed");
    });

    await expect(assessOriginalCharacterPowerStats(importedAssessmentInput()))
      .rejects.toThrow(IngestionPipelineError);

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockPowerStatsGenerationSchema.parse).toHaveBeenCalledTimes(1);
  });

  it("retries original output with the same strict request identity and caps at three attempts", async () => {
    const requests: any[] = [];
    mockGenerateObject
      .mockImplementationOnce(async (opts: any) => {
        requests.push(opts);
        throw new Error("invalid structured output");
      })
      .mockImplementationOnce(async (opts: any) => {
        requests.push(opts);
        return { object: humanStats };
      });

    const assessed = await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      role,
      premise: "A port city",
    });

    expect(assessed.powerStats).toEqual(humanStats);
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
    expect(mockCreateModel).toHaveBeenCalledTimes(1);
    expect(requests[0].model).toBe(requests[1].model);
    expect(requests[0].schema).toBe(requests[1].schema);
    expect(requests[0].prompt).toBe(requests[1].prompt);
    expect(requests[0]).toMatchObject({
      mode: "tool",
      retries: 1,
      timeout: { totalMs: 90_000 },
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    });
    expect(requests[1]).toMatchObject({
      mode: "tool",
      retries: 1,
      timeout: { totalMs: 90_000 },
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    });
  });

  it("fails malformed original output after three strict attempts without normalization or repair", async () => {
    mockGenerateObject.mockResolvedValue({ object: {} });
    mockPowerStatsGenerationSchema.parse.mockImplementation(() => {
      throw new Error("strict PowerStats validation failed");
    });

    await expect(assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      role,
      premise: "A port city",
    })).rejects.toThrow(IngestionPipelineError);

    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
    expect(mockPowerStatsGenerationSchema.parse).toHaveBeenCalledTimes(3);
  }, 30000);

  it("accepts an imported power response after 45 seconds within the shared budget", async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    mockGenerateObject.mockImplementationOnce(async (opts: { abortSignal?: AbortSignal }) => {
      operationSignal = opts.abortSignal;
      await waitFor(45_001);
      return { object: humanStats };
    });

    const pending = assessOriginalCharacterPowerStats(importedAssessmentInput());
    await vi.advanceTimersByTimeAsync(45_001);
    const assessed = await pending;

    expect(assessed.powerStats).toEqual(humanStats);
    expect(operationSignal).toBeInstanceOf(AbortSignal);
    expect(operationSignal?.aborted).toBe(false);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({
      timeout: { totalMs: 90_000 },
    });
  });

  it("rejects an imported power assessment at 90000 ms and ignores a late rejection", async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    let lateReject!: (error: Error) => void;
    mockGenerateObject.mockImplementationOnce(async (opts: { abortSignal?: AbortSignal }) => {
      operationSignal = opts.abortSignal;
      return await new Promise<{ object: typeof humanStats }>((_resolve, reject) => {
        lateReject = reject;
      });
    });

    const startedAt = Date.now();
    const pending = assessOriginalCharacterPowerStats(importedAssessmentInput());
    let settledAt = -1;
    void pending.catch(() => {
      settledAt = Date.now() - startedAt;
    });

    await vi.advanceTimersByTimeAsync(89_999);
    expect(settledAt).toBe(-1);
    expect(operationSignal?.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).rejects.toThrow(IngestionPipelineError);
    expect(settledAt).toBe(90_000);
    expect(operationSignal?.aborted).toBe(true);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    lateReject(new Error("late provider completion"));
    await vi.runAllTicks();
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("lets an imported power fallback finish inside the remaining shared budget", async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    let primaryFailedAt = -1;
    let fallbackFinishedAt = -1;
    mockGenerateObject.mockImplementationOnce(async (opts: { abortSignal?: AbortSignal }) => {
      operationSignal = opts.abortSignal;
      const startedAt = Date.now();
      await waitFor(10_000);
      primaryFailedAt = Date.now() - startedAt;
      await waitFor(20_000);
      fallbackFinishedAt = Date.now() - startedAt;
      if (operationSignal?.aborted) {
        throw new Error("shared operation budget expired");
      }
      return { object: humanStats };
    });

    const pending = assessOriginalCharacterPowerStats(importedAssessmentInput());
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toMatchObject({ powerStats: humanStats });

    expect(primaryFailedAt).toBe(10_000);
    expect(fallbackFinishedAt).toBe(30_000);
    expect(operationSignal?.aborted).toBe(false);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("fences an imported power fallback at the shared budget without a second window", async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    let fallbackStartedAt = -1;
    mockGenerateObject.mockImplementationOnce(async (opts: { abortSignal?: AbortSignal }) => {
      operationSignal = opts.abortSignal;
      const startedAt = Date.now();
      await waitFor(89_000);
      fallbackStartedAt = Date.now() - startedAt;
      await waitFor(2_000);
      if (operationSignal?.aborted) {
        throw new Error("shared operation budget expired");
      }
      return { object: humanStats };
    });

    const pending = assessOriginalCharacterPowerStats(importedAssessmentInput());
    const rejection = expect(pending).rejects.toThrow(IngestionPipelineError);
    await vi.advanceTimersByTimeAsync(91_000);
    await rejection;

    expect(fallbackStartedAt).toBe(89_000);
    expect(operationSignal?.aborted).toBe(true);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("prompt marks character as ORIGINAL and names it", async () => {
    await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      role, premise: "A port city",
    });
    expect(captured.prompt).toContain("ORIGINAL");
    expect(captured.prompt).toContain("Serin Varn");
  });

  it("prompt includes override text when provided", async () => {
    await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      overrideText: "she should be City-tier not Street",
      role, premise: "A port city",
    });
    expect(captured.prompt).toContain("USER OVERRIDE");
    expect(captured.prompt).toContain("she should be City-tier not Street");
  });

  it("prompt includes card text when provided", async () => {
    await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      cardText: "A cat-burglar with a grappling hook.",
      role, premise: "A port city",
    });
    expect(captured.prompt).toContain("A cat-burglar with a grappling hook");
  });

  it("prompt tells LLM Human/Street is default and to not inflate tiers (literal string)", async () => {
    await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      role, premise: "A port city",
    });
    expect(captured.prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: original-power-assessment.v1");
    expect(captured.prompt).toContain("Minimal valid output");
    expect(captured.prompt).toContain('"speed": { "tier": "Human", "rank": 5 }');
    expect(captured.prompt).not.toContain("Athletic Human");
    expect(captured.prompt).toContain("Invalid example");
    expect(captured.prompt).toContain("Do not invent feats, tiers, source roles, or canonical facts");
    expect(captured.prompt).toContain("Human");
    expect(captured.prompt).toContain("Street");
    expect(captured.prompt).toContain("Do not inflate tiers");
  });

  it("hax=[] instruction present for civilians", async () => {
    await assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      role, premise: "A port city",
    });
    expect(captured.prompt).toContain("hax must be []");
  });

  it("does not perform web search (no mcp / webSearch imports)", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const target = path.resolve(here, "..", "assess-original.ts");
    const src = fs.readFileSync(target, "utf-8");
    expect(src).not.toMatch(/webSearch/);
    expect(src).not.toMatch(/withMcpClient/);
    expect(src).not.toMatch(/withSearchMcp/);
    expect(src).not.toMatch(/loosePowerStatsSchema/);
    expect(src).not.toMatch(/normalizeLlmPowerStats/);
    expect(src).not.toMatch(/repairPowerStats/);
  });

  it("throws IngestionPipelineError on repeated LLM failure", async () => {
    mockGenerateObject.mockRejectedValueOnce(new Error("LLM down"))
      .mockRejectedValueOnce(new Error("LLM down"))
      .mockRejectedValueOnce(new Error("LLM down"));
    await expect(
      assessOriginalCharacterPowerStats({
        draft: rogueDraft as unknown as CharacterDraft,
        role, premise: "A port city",
      })
    ).rejects.toThrow(IngestionPipelineError);
    expect(mockGenerateObject).toHaveBeenCalledTimes(3);
  }, 30000);

  it("does not retry a failed imported-card power assessment", async () => {
    mockGenerateObject.mockRejectedValue(new Error("provider stalled"));

    await expect(assessOriginalCharacterPowerStats({
      draft: rogueDraft as unknown as CharacterDraft,
      cardText: "A cat-burglar with a grappling hook.",
      role,
      premise: "A port city",
      isImportedCharacter: true,
    })).rejects.toThrow(IngestionPipelineError);

    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });
});

afterEach(() => {
  vi.useRealTimers();
});

function waitFor(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function importedAssessmentInput() {
  return {
    draft: rogueDraft as unknown as CharacterDraft,
    cardText: "A cat-burglar with a grappling hook.",
    role,
    premise: "A port city",
    isImportedCharacter: true,
  };
}
