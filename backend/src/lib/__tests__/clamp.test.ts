import { describe, it, expect } from "vitest";
import { clamp, clampTokens } from "../clamp.js";

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min when below range", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max when above range", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("returns min when value equals min", () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it("returns max when value equals max", () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it("works with negative ranges", () => {
    expect(clamp(0, -10, -5)).toBe(-5);
    expect(clamp(-7, -10, -5)).toBe(-7);
    expect(clamp(-15, -10, -5)).toBe(-10);
  });

  it("works with decimal values", () => {
    expect(clamp(0.5, 0, 2)).toBe(0.5);
    expect(clamp(2.5, 0, 2)).toBe(2);
  });
});

describe("clampTokens", () => {
  it("raises smaller budgets to the 32k minimum", () => {
    expect(clampTokens(1024)).toBe(32_768);
  });

  it("rounds fractional values above the minimum", () => {
    expect(clampTokens(32_768.7)).toBe(32_769);
    expect(clampTokens(32_768.3)).toBe(32_768);
  });

  it("raises nonpositive budgets to the 32k minimum", () => {
    expect(clampTokens(0)).toBe(32_768);
    expect(clampTokens(-100)).toBe(32_768);
  });

  it("preserves budgets above the minimum", () => {
    expect(clampTokens(50_000)).toBe(50_000);
    expect(clampTokens(100_000)).toBe(100_000);
  });

  it("returns the exact minimum unchanged", () => {
    expect(clampTokens(32_768)).toBe(32_768);
  });
});
