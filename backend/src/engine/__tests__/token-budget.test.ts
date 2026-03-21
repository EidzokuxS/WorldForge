import { describe, it, expect } from "vitest";
import {
  estimateTokens,
  allocateBudgets,
  truncateToFit,
  DEFAULT_BUDGETS,
  type PromptSection,
} from "../token-budget.js";

describe("estimateTokens", () => {
  it("returns Math.ceil(length / 4) for a simple string", () => {
    // "hello world" = 11 chars => Math.ceil(11/4) = 3
    expect(estimateTokens("hello world")).toBe(3);
  });

  it("returns 0 for empty string", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("handles single character", () => {
    expect(estimateTokens("a")).toBe(1);
  });

  it("handles exactly divisible length", () => {
    // 8 chars => 8/4 = 2
    expect(estimateTokens("abcdefgh")).toBe(2);
  });

  it("handles long strings", () => {
    const long = "x".repeat(1000);
    expect(estimateTokens(long)).toBe(250);
  });
});

describe("allocateBudgets", () => {
  it("returns correct absolute values for 8192 context window", () => {
    const budgets = allocateBudgets(8192);
    // systemRules: 0.05 * 8192 = 409.6 => floor = 409
    expect(budgets.systemRules).toBe(Math.floor(0.05 * 8192));
    expect(budgets.worldPremise).toBe(Math.floor(0.03 * 8192));
    expect(budgets.recentConversation).toBe(Math.floor(0.20 * 8192));
  });

  it("includes responseHeadroom in the output", () => {
    const budgets = allocateBudgets(8192);
    expect(budgets.responseHeadroom).toBe(Math.floor(0.25 * 8192));
  });

  it("section budgets (excluding responseHeadroom) sum to <= contextWindow", () => {
    const budgets = allocateBudgets(8192);
    const { responseHeadroom, ...sections } = budgets;
    const sum = Object.values(sections).reduce((a, b) => a + b, 0);
    expect(sum).toBeLessThanOrEqual(8192);
  });

  it("all budget keys match DEFAULT_BUDGETS keys", () => {
    const budgets = allocateBudgets(4096);
    for (const key of Object.keys(DEFAULT_BUDGETS)) {
      expect(budgets).toHaveProperty(key);
    }
  });
});

describe("truncateToFit", () => {
  function makeSection(
    name: string,
    priority: number,
    tokens: number,
    canTruncate: boolean
  ): PromptSection {
    // Create content with the right estimated tokens
    const content = "x".repeat(tokens * 4);
    return { name, priority, content, estimatedTokens: tokens, canTruncate };
  }

  it("returns sections unchanged when total is under budget", () => {
    const sections = [
      makeSection("a", 0, 100, false),
      makeSection("b", 1, 100, true),
    ];
    const result = truncateToFit(sections, 300);
    expect(result).toHaveLength(2);
    expect(result[0]!.estimatedTokens).toBe(100);
    expect(result[1]!.estimatedTokens).toBe(100);
  });

  it("trims canTruncate=true sections when over budget", () => {
    const sections = [
      makeSection("fixed", 0, 100, false),
      makeSection("trimmable", 7, 300, true),
    ];
    const result = truncateToFit(sections, 200);
    // fixed stays at 100, trimmable must shrink to fit within 200
    expect(result[0]!.estimatedTokens).toBe(100);
    expect(result[1]!.estimatedTokens).toBeLessThanOrEqual(100);
    const total = result.reduce((s, sec) => s + sec.estimatedTokens, 0);
    expect(total).toBeLessThanOrEqual(200);
  });

  it("never modifies canTruncate=false sections", () => {
    const sections = [
      makeSection("fixed", 0, 200, false),
      makeSection("trimmable", 7, 100, true),
    ];
    // Budget is 250, total is 300. Only trimmable can shrink.
    const result = truncateToFit(sections, 250);
    expect(result[0]!.estimatedTokens).toBe(200);
    expect(result[0]!.content).toBe("x".repeat(800));
  });

  it("trims lowest importance (highest priority number) first", () => {
    const sections = [
      makeSection("fixed", 0, 50, false),
      makeSection("mid", 4, 200, true),
      makeSection("low", 7, 200, true),
    ];
    // Total: 450, budget: 300. Need to cut 150.
    const result = truncateToFit(sections, 300);
    // "low" (priority 7) should be trimmed before "mid" (priority 4)
    const lowSection = result.find((s) => s.name === "low")!;
    const midSection = result.find((s) => s.name === "mid")!;
    expect(lowSection.estimatedTokens).toBeLessThan(200);
    // If low was enough to absorb all cuts, mid stays intact
    if (lowSection.estimatedTokens >= 0) {
      const totalAfter = result.reduce((s, sec) => s + sec.estimatedTokens, 0);
      expect(totalAfter).toBeLessThanOrEqual(300);
    }
  });

  it("removes section entirely if needed", () => {
    const sections = [
      makeSection("fixed", 0, 200, false),
      makeSection("trimmable", 7, 200, true),
    ];
    // Budget is 200, only fixed fits
    const result = truncateToFit(sections, 200);
    const trimmable = result.find((s) => s.name === "trimmable")!;
    expect(trimmable.estimatedTokens).toBe(0);
  });
});
