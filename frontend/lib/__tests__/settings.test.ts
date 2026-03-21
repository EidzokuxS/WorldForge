import { describe, it, expect } from "vitest";
import {
  NONE_PROVIDER_ID,
  BUILTIN_PROVIDER_PRESETS,
  createDefaultSettings,
  getErrorMessage,
} from "../settings";

describe("settings re-exports", () => {
  it("exports NONE_PROVIDER_ID", () => {
    expect(typeof NONE_PROVIDER_ID).toBe("string");
    expect(NONE_PROVIDER_ID.length).toBeGreaterThan(0);
  });

  it("exports BUILTIN_PROVIDER_PRESETS as non-empty array", () => {
    expect(Array.isArray(BUILTIN_PROVIDER_PRESETS)).toBe(true);
    expect(BUILTIN_PROVIDER_PRESETS.length).toBeGreaterThan(0);
  });

  it("exports createDefaultSettings that returns valid settings", () => {
    const settings = createDefaultSettings();
    expect(settings).toBeDefined();
    expect(Array.isArray(settings.providers)).toBe(true);
  });

  it("exports getErrorMessage", () => {
    expect(typeof getErrorMessage).toBe("function");
  });
});

describe("getErrorMessage", () => {
  it("extracts message from Error instance", () => {
    expect(getErrorMessage(new Error("test error"), "fallback")).toBe("test error");
  });

  it("returns fallback for non-Error", () => {
    expect(getErrorMessage("string error", "fallback")).toBe("fallback");
  });

  it("returns fallback for null", () => {
    expect(getErrorMessage(null, "fallback")).toBe("fallback");
  });
});
