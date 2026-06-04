import { describe, it, expect, vi, beforeEach } from "vitest";
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

const { mockGenerateObject } = vi.hoisted(() => ({
  mockGenerateObject: vi.fn(),
}));

vi.mock("../../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: mockGenerateObject,
}));
vi.mock("../../../ai/index.js", () => ({ createModel: vi.fn(() => ({ modelId: "mock" })) }));
vi.mock("../../../lib/clamp.js", () => ({ clampTokens: (n: number) => n ?? 2048 }));
vi.mock("../../../lib/index.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), event: vi.fn() }),
}));
vi.mock("../../known-ip-worldgen-research.js", () => ({
  loosePowerStatsSchema: {},
  normalizeLlmPowerStats: (raw: any) => raw,
  repairPowerStats: vi.fn(async () => humanStats),
  AP_DUR_TIER_LIST: "Human, Street, …",
  SPEED_TIER_LIST: "Human, Superhuman, …",
  INTELLIGENCE_TIER_LIST: "Average, Above Average, …",
  describeZodIssues: (_e: any) => ["issue"],
  recordFromUnknown: (v: any) => v,
}));

import { assessOriginalCharacterPowerStats } from "../assess-original.js";
import { IngestionPipelineError } from "../errors.js";

beforeEach(() => {
  captured.prompt = undefined;
  mockGenerateObject.mockReset();
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
    expect(mockGenerateObject.mock.calls[0]?.[0]).toMatchObject({ retries: 1 });
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
  }, 30000);
});
