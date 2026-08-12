import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  IngestionContext,
  IngestionSources,
  IngestionClassification,
} from "../types.js";
import gojoCard from "./fixtures/v2-gojo.json" with { type: "json" };
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const canonDigest = fs.readFileSync(
  path.join(__dirname, "fixtures", "canon-digest.txt"),
  "utf-8",
);

// Mock generateObject: capture prompt, return canned rich output
const captured: { prompt?: string } = {};
const { mockBuildCharacterPromptContract, mockGenerateObject, mockCreateModel } = vi.hoisted(() => ({
  mockBuildCharacterPromptContract: vi.fn((opts?: { marker?: string }) =>
    `STRUCTURED_OUTPUT_CONTRACT: ${opts?.marker ?? "character.v1"}\nCONTRACT`
  ),
  mockGenerateObject: vi.fn(),
  mockCreateModel: vi.fn(() => ({ modelId: "mock" })),
}));
const richOutput = {
  name: "Gojo Satoru",
  race: "Human",
  gender: "male",
  age: "28",
  appearance: "white hair, red eyes",
  backgroundSummary:
    "Strongest sorcerer. User override noted: red eyes instead of blue.",
  personaSummary: "Cocky teacher",
  drives: ["protect students"],
  frictions: ["political pressure"],
  shortTermGoals: ["train Yuji"],
  longTermGoals: ["end curses"],
  tags: ["Limitless User", "Six Eyes", "Teacher"],
  hp: 5,
  equippedItems: [],
  locationName: "Jujutsu High",
};

vi.mock("../../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: mockGenerateObject,
}));

vi.mock("../../../ai/index.js", () => ({
  createModel: mockCreateModel,
}));

// Mock the promoted exports from generator.ts
vi.mock("../../generator.js", () => ({
  richCharacterSchema: {
    extend: () => ({}),
  },
  buildFlatOutputStrategy: (_o: unknown) => "STRATEGY",
  toCharacterDraftFromRich: (rich: unknown, opts: Record<string, unknown>) => ({
    ...(rich as Record<string, unknown>),
    provenance: {
      sourceKind: opts.sourceKind,
      importMode: opts.importMode,
      canonicalStatus: opts.canonicalStatus,
    },
  }),
}));
vi.mock("../../prompt-contract.js", () => ({
  buildCharacterPromptContract: mockBuildCharacterPromptContract,
}));
vi.mock("../../v2-sections.js", () => ({
  buildV2CardSections: (o: { name: string; description: string }) =>
    `CARD[${o.name}]:${o.description}`,
}));
vi.mock("../../import-utils.js", () => ({
  buildImportModeGuidance: (m: string) => `IMPORT:${m}`,
}));
vi.mock("../../../lib/clamp.js", () => ({
  clampTokens: (n: number) => n ?? 2048,
}));
vi.mock("../../../lib/index.js", () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: vi.fn(),
  }),
}));

import { synthesizeDraftFromSources } from "../synthesizer.js";
import { IngestionPipelineError } from "../errors.js";

const ctx: IngestionContext = {
  gen: {
    provider: { id: "glm", protocol: "openai" } as never,
    temperature: 0.5,
    maxTokens: 4096,
  } as never,
  campaign: {
    premise: "Modern Tokyo with jujutsu sorcerers",
    ipContext: null,
    premiseDivergence: null,
  },
  settings: {} as never,
  locationNames: ["Jujutsu High", "Shibuya"],
  factionNames: ["Tokyo Faculty"],
};

const baseClassification: IngestionClassification = {
  canonicalStatus: "known_ip_canonical",
  franchise: "Jujutsu Kaisen",
  ipContext: null,
  premiseDivergence: null,
};

function sources(partial: Partial<IngestionSources>): IngestionSources {
  return {
    mode: "import",
    role: "player",
    freeText: null,
    archetype: null,
    card: null,
    overrideText: null,
    displayName: null,
    ...partial,
  } as IngestionSources;
}

beforeEach(() => {
  captured.prompt = undefined;
  mockBuildCharacterPromptContract.mockClear();
  mockGenerateObject.mockReset();
  mockCreateModel.mockClear();
  mockGenerateObject.mockImplementation(async (opts: Record<string, unknown>) => {
    captured.prompt = opts.prompt as string;
    return { object: richOutput };
  });
});

describe("synthesizeDraftFromSources priority merge", () => {
  it("includes PRIORITY 1, 2, 3, 4 section headers when all sources present", async () => {
    await synthesizeDraftFromSources({
      sources: sources({
        mode: "import",
        card: gojoCard as never,
        displayName: "Gojo Satoru",
        overrideText: "her eyes are red not blue",
      }),
      classification: baseClassification,
      researchDigest: canonDigest,
      ctx,
    });
    expect(captured.prompt).toContain("PRIORITY 1");
    expect(captured.prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: character-synthesis.v1");
    expect(mockBuildCharacterPromptContract).toHaveBeenCalledWith(
      expect.objectContaining({ marker: "character-synthesis.v1" }),
    );
    expect(captured.prompt).toContain("PRIORITY 2");
    expect(captured.prompt).toContain("PRIORITY 3");
    expect(captured.prompt).toContain("PRIORITY 4");
    expect(captured.prompt).toContain("her eyes are red not blue");
    expect(captured.prompt).toContain("CARD[Gojo Satoru]");
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({ retries: 1 });
    expect(mockCreateModel).toHaveBeenCalledWith(ctx.gen.provider, {
      role: "generator",
      reasoningMode: "bypass",
    });
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({
      timeout: { totalMs: 90_000 },
    });
    expect(mockGenerateObject.mock.calls[0]?.[0].abortSignal).toBeInstanceOf(AbortSignal);
  });

  it("accepts an imported primary response after 45 seconds within the shared budget", async () => {
    vi.useFakeTimers();
    let operationSignal: AbortSignal | undefined;
    mockGenerateObject.mockImplementationOnce(async (opts: { abortSignal?: AbortSignal }) => {
      operationSignal = opts.abortSignal;
      await waitFor(45_001);
      return { object: richOutput };
    });

    const pending = synthesizeDraftFromSources(importedSynthesisInput());
    await vi.advanceTimersByTimeAsync(45_001);
    const draft = await pending;

    expect(draft.provenance).toMatchObject({ sourceKind: "import" });
    expect(operationSignal).toBeInstanceOf(AbortSignal);
    expect(operationSignal?.aborted).toBe(false);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({
      timeout: { totalMs: 90_000 },
    });
  });

  it("lets an imported fallback finish inside the remaining shared budget", async () => {
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
      return { object: richOutput };
    });

    const pending = synthesizeDraftFromSources(importedSynthesisInput());
    await vi.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toBeDefined();

    expect(primaryFailedAt).toBe(10_000);
    expect(fallbackFinishedAt).toBe(30_000);
    expect(operationSignal?.aborted).toBe(false);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("fences an imported fallback at the shared budget without a second window", async () => {
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
      return { object: richOutput };
    });

    const pending = synthesizeDraftFromSources(importedSynthesisInput());
    const rejection = expect(pending).rejects.toThrow(IngestionPipelineError);
    await vi.advanceTimersByTimeAsync(91_000);
    await rejection;

    expect(fallbackStartedAt).toBe(89_000);
    expect(operationSignal?.aborted).toBe(true);
    expect(mockGenerateObject).toHaveBeenCalledTimes(1);
  });

  it("preserves default reasoning and retry behavior outside import", async () => {
    await synthesizeDraftFromSources({
      sources: sources({ mode: "parse", freeText: "A careful dock worker." }),
      classification: { ...baseClassification, canonicalStatus: "original", franchise: null },
      researchDigest: null,
      ctx,
    });

    expect(mockCreateModel).toHaveBeenCalledWith(ctx.gen.provider);
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({ timeout: undefined });
    expect(mockGenerateObject.mock.calls[0]?.[0]).not.toHaveProperty("abortSignal");
  });

  it("override text appears in PRIORITY 1 section before PRIORITY 2", async () => {
    await synthesizeDraftFromSources({
      sources: sources({
        mode: "import",
        card: gojoCard as never,
        displayName: "Gojo Satoru",
        overrideText: "she is weaker than canon",
      }),
      classification: baseClassification,
      researchDigest: null,
      ctx,
    });
    const p = captured.prompt!;
    const p1Index = p.indexOf("PRIORITY 1");
    const p2Index = p.indexOf("PRIORITY 2");
    const overrideIndex = p.indexOf("she is weaker than canon");
    expect(p1Index).toBeGreaterThan(0);
    expect(overrideIndex).toBeGreaterThan(p1Index);
    expect(overrideIndex).toBeLessThan(p2Index);
  });

  it("writes overrideText to provenance on returned draft", async () => {
    const draft = await synthesizeDraftFromSources({
      sources: sources({
        mode: "parse",
        freeText: "a haunted clockmaker",
        overrideText: "she has a mechanical arm",
      }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(
      (draft.provenance as { overrideText?: string }).overrideText,
    ).toBe("she has a mechanical arm");
  });

  it("does not set provenance.overrideText when override is null", async () => {
    const draft = await synthesizeDraftFromSources({
      sources: sources({ mode: "generate" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(
      (draft.provenance as { overrideText?: string }).overrideText,
    ).toBeUndefined();
  });

  it("marks card sections as absent when no card supplied (parse mode)", async () => {
    await synthesizeDraftFromSources({
      sources: sources({ mode: "parse", freeText: "a rogue" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(captured.prompt).toContain("no card imported");
  });

  it("marks research as absent for original characters", async () => {
    await synthesizeDraftFromSources({
      sources: sources({ mode: "parse", freeText: "a rogue" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(captured.prompt).toContain("not a canonical character");
  });

  it("uses archetype label for research mode", async () => {
    await synthesizeDraftFromSources({
      sources: sources({ mode: "research", archetype: "world-weary paladin" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(captured.prompt).toContain("ARCHETYPE");
    expect(captured.prompt).toContain("world-weary paladin");
  });

  it("maps sourceKind correctly for each mode", async () => {
    const parseDraft = await synthesizeDraftFromSources({
      sources: sources({ mode: "parse", freeText: "x" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(
      (parseDraft.provenance as { sourceKind?: string }).sourceKind,
    ).toBe("player-input");

    const importDraft = await synthesizeDraftFromSources({
      sources: sources({ mode: "import", card: gojoCard as never }),
      classification: baseClassification,
      researchDigest: null,
      ctx,
    });
    expect(
      (importDraft.provenance as { sourceKind?: string }).sourceKind,
    ).toBe("import");

    const researchDraft = await synthesizeDraftFromSources({
      sources: sources({ mode: "research", archetype: "paladin" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(
      (researchDraft.provenance as { sourceKind?: string }).sourceKind,
    ).toBe("archetype");

    const generateDraft = await synthesizeDraftFromSources({
      sources: sources({ mode: "generate" }),
      classification: { ...baseClassification, canonicalStatus: "original" },
      researchDigest: null,
      ctx,
    });
    expect(
      (generateDraft.provenance as { sourceKind?: string }).sourceKind,
    ).toBe("generator");
  });

  it("throws IngestionPipelineError with stage='synthesize' after 3 failed attempts", async () => {
    mockGenerateObject
      .mockRejectedValueOnce(new Error("LLM down"))
      .mockRejectedValueOnce(new Error("LLM down"))
      .mockRejectedValueOnce(new Error("LLM down"));

    let caught: unknown;
    try {
      await synthesizeDraftFromSources({
        sources: sources({ mode: "parse", freeText: "x" }),
        classification: { ...baseClassification, canonicalStatus: "original" },
        researchDigest: null,
        ctx,
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(IngestionPipelineError);
    expect((caught as IngestionPipelineError).stage).toBe("synthesize");
    expect((caught as IngestionPipelineError).attempts).toBe(3);
  }, 30000);

  it("does not retry a failed imported-card synthesis", async () => {
    mockGenerateObject.mockRejectedValue(new Error("provider stalled"));

    await expect(synthesizeDraftFromSources({
      sources: sources({ mode: "import", card: gojoCard as never }),
      classification: { ...baseClassification, canonicalStatus: "imported", franchise: null },
      researchDigest: null,
      ctx,
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

function importedSynthesisInput() {
  return {
    sources: sources({ mode: "import", card: gojoCard as never }),
    classification: baseClassification,
    researchDigest: null,
    ctx,
  };
}
