import { describe, it, expect } from "vitest";
import { computeCompositeScore } from "../episodic-events.js";

describe("computeCompositeScore", () => {
  it("computes correct weighted score with all factors at max", () => {
    // similarity=1.0, tick=10, importance=10, currentTick=10
    // recency = 10/10 = 1.0, importanceNorm = 10/10 = 1.0
    // composite = 1.0*0.4 + 1.0*0.3 + 1.0*0.3 = 1.0
    const score = computeCompositeScore(1.0, 10, 10, 10);
    expect(score).toBeCloseTo(1.0, 5);
  });

  it("computes correct weighted score with mixed values", () => {
    // similarity=0.8, tick=5, importance=6, currentTick=10
    // recency = 5/10 = 0.5, importanceNorm = 6/10 = 0.6
    // composite = 0.8*0.4 + 0.5*0.3 + 0.6*0.3 = 0.32 + 0.15 + 0.18 = 0.65
    const score = computeCompositeScore(0.8, 5, 6, 10);
    expect(score).toBeCloseTo(0.65, 5);
  });

  it("handles currentTick=0 (recency defaults to 1.0)", () => {
    // similarity=0.5, tick=0, importance=5, currentTick=0
    // recency = 1.0 (fallback), importanceNorm = 5/10 = 0.5
    // composite = 0.5*0.4 + 1.0*0.3 + 0.5*0.3 = 0.20 + 0.30 + 0.15 = 0.65
    const score = computeCompositeScore(0.5, 0, 5, 0);
    expect(score).toBeCloseTo(0.65, 5);
  });

  it("handles importance=0", () => {
    // similarity=1.0, tick=10, importance=0, currentTick=10
    // recency = 10/10 = 1.0, importanceNorm = 0/10 = 0.0
    // composite = 1.0*0.4 + 1.0*0.3 + 0.0*0.3 = 0.40 + 0.30 + 0.0 = 0.70
    const score = computeCompositeScore(1.0, 10, 0, 10);
    expect(score).toBeCloseTo(0.70, 5);
  });

  it("handles importance=10 (max)", () => {
    // similarity=0.0, tick=1, importance=10, currentTick=10
    // recency = 1/10 = 0.1, importanceNorm = 10/10 = 1.0
    // composite = 0.0*0.4 + 0.1*0.3 + 1.0*0.3 = 0.0 + 0.03 + 0.30 = 0.33
    const score = computeCompositeScore(0.0, 1, 10, 10);
    expect(score).toBeCloseTo(0.33, 5);
  });

  it("old events have lower recency", () => {
    const scoreRecent = computeCompositeScore(0.8, 9, 5, 10);
    const scoreOld = computeCompositeScore(0.8, 1, 5, 10);
    expect(scoreRecent).toBeGreaterThan(scoreOld);
  });

  it("higher importance yields higher score", () => {
    const scoreHigh = computeCompositeScore(0.5, 5, 9, 10);
    const scoreLow = computeCompositeScore(0.5, 5, 2, 10);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });

  it("higher similarity yields higher score", () => {
    const scoreHigh = computeCompositeScore(0.9, 5, 5, 10);
    const scoreLow = computeCompositeScore(0.2, 5, 5, 10);
    expect(scoreHigh).toBeGreaterThan(scoreLow);
  });
});
