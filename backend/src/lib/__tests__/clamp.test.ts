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
  it("clamps to 1-32000 range and rounds", () => {
    expect(clampTokens(1024)).toBe(1024);
  });

  it("rounds fractional values", () => {
    expect(clampTokens(1024.7)).toBe(1025);
    expect(clampTokens(1024.3)).toBe(1024);
  });

  it("clamps below minimum to 1", () => {
    expect(clampTokens(0)).toBe(1);
    expect(clampTokens(-100)).toBe(1);
  });

  it("clamps above maximum to 32000", () => {
    expect(clampTokens(50000)).toBe(32000);
    expect(clampTokens(100000)).toBe(32000);
  });

  it("returns 1 for exactly 1", () => {
    expect(clampTokens(1)).toBe(1);
  });

  it("returns 32000 for exactly 32000", () => {
    expect(clampTokens(32000)).toBe(32000);
  });
});
