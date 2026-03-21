import { describe, it, expect } from "vitest";
import {
  loadSettings,
  saveSettings,
  normalizeSettings,
  rebindProviderReferences,
} from "../index.js";

describe("settings barrel exports", () => {
  it("exports loadSettings", () => {
    expect(typeof loadSettings).toBe("function");
  });

  it("exports saveSettings", () => {
    expect(typeof saveSettings).toBe("function");
  });

  it("exports normalizeSettings", () => {
    expect(typeof normalizeSettings).toBe("function");
  });

  it("exports rebindProviderReferences", () => {
    expect(typeof rebindProviderReferences).toBe("function");
  });
});
