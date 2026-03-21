import { describe, it, expect } from "vitest";
import {
  formatUtcDate,
  readSeedValue,
  normalizeSeedValue,
  seedValueToTextarea,
  createEmptyDnaState,
  createDnaStateFromSeeds,
  isGeneratorConfigured,
  collectEnabledSeeds,
  WORLD_DNA_CARDS,
} from "../utils";

// ---------------------------------------------------------------------------
// formatUtcDate
// ---------------------------------------------------------------------------
describe("formatUtcDate", () => {
  it("formats timestamp to UTC string", () => {
    const ts = Date.UTC(2026, 0, 15, 10, 30);
    expect(formatUtcDate(ts)).toBe("2026-01-15 10:30 UTC");
  });

  it("zero-pads month and day", () => {
    const ts = Date.UTC(2026, 2, 3, 4, 5);
    expect(formatUtcDate(ts)).toBe("2026-03-03 04:05 UTC");
  });
});

// ---------------------------------------------------------------------------
// readSeedValue
// ---------------------------------------------------------------------------
describe("readSeedValue", () => {
  it("returns string for non-culturalFlavor", () => {
    expect(readSeedValue({ geography: "Island" }, "geography")).toBe("Island");
  });

  it("returns empty string for missing non-culturalFlavor", () => {
    expect(readSeedValue({}, "geography")).toBe("");
  });

  it("returns array for culturalFlavor", () => {
    expect(readSeedValue({ culturalFlavor: ["A", "B"] }, "culturalFlavor")).toEqual(["A", "B"]);
  });

  it("returns empty array for missing culturalFlavor", () => {
    expect(readSeedValue({}, "culturalFlavor")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// normalizeSeedValue
// ---------------------------------------------------------------------------
describe("normalizeSeedValue", () => {
  it("trims and splits comma-separated string for culturalFlavor", () => {
    expect(normalizeSeedValue("culturalFlavor", "A , B , C")).toEqual(["A", "B", "C"]);
  });

  it("filters empty entries for culturalFlavor", () => {
    expect(normalizeSeedValue("culturalFlavor", "A,,B,")).toEqual(["A", "B"]);
  });

  it("passes array through for culturalFlavor", () => {
    expect(normalizeSeedValue("culturalFlavor", ["X", " Y "])).toEqual(["X", "Y"]);
  });

  it("joins array for non-culturalFlavor", () => {
    expect(normalizeSeedValue("geography", ["A", "B"])).toBe("A, B");
  });

  it("returns string as-is for non-culturalFlavor", () => {
    expect(normalizeSeedValue("geography", "Mountains")).toBe("Mountains");
  });
});

// ---------------------------------------------------------------------------
// seedValueToTextarea
// ---------------------------------------------------------------------------
describe("seedValueToTextarea", () => {
  it("joins array with commas", () => {
    expect(seedValueToTextarea(["A", "B"])).toBe("A, B");
  });

  it("returns string as-is", () => {
    expect(seedValueToTextarea("Hello")).toBe("Hello");
  });
});

// ---------------------------------------------------------------------------
// createEmptyDnaState
// ---------------------------------------------------------------------------
describe("createEmptyDnaState", () => {
  it("creates all 6 categories", () => {
    const state = createEmptyDnaState();
    expect(Object.keys(state)).toHaveLength(6);
  });

  it("all slots are enabled and not custom", () => {
    const state = createEmptyDnaState();
    for (const key of Object.keys(state) as (keyof typeof state)[]) {
      expect(state[key].enabled).toBe(true);
      expect(state[key].isCustom).toBe(false);
    }
  });

  it("culturalFlavor has empty array value", () => {
    const state = createEmptyDnaState();
    expect(state.culturalFlavor.value).toEqual([]);
  });

  it("other categories have empty string value", () => {
    const state = createEmptyDnaState();
    expect(state.geography.value).toBe("");
    expect(state.wildcard.value).toBe("");
  });
});

// ---------------------------------------------------------------------------
// createDnaStateFromSeeds
// ---------------------------------------------------------------------------
describe("createDnaStateFromSeeds", () => {
  it("creates state from full seeds", () => {
    const state = createDnaStateFromSeeds({
      geography: "Islands",
      politicalStructure: "Democracy",
      centralConflict: "War",
      culturalFlavor: ["A", "B"],
      environment: "Tropical",
      wildcard: "Magic",
    });
    expect(state.geography.value).toBe("Islands");
    expect(state.culturalFlavor.value).toEqual(["A", "B"]);
    expect(state.wildcard.value).toBe("Magic");
  });

  it("handles missing seeds gracefully", () => {
    const state = createDnaStateFromSeeds({});
    expect(state.geography.value).toBe("");
    expect(state.culturalFlavor.value).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// isGeneratorConfigured
// ---------------------------------------------------------------------------
describe("isGeneratorConfigured", () => {
  it("returns true when provider has API key", () => {
    expect(
      isGeneratorConfigured({
        providers: [{ id: "p1", baseUrl: "https://api.openai.com", apiKey: "sk-test" }],
        generator: { providerId: "p1" },
      })
    ).toBe(true);
  });

  it("returns true for local provider without API key", () => {
    expect(
      isGeneratorConfigured({
        providers: [{ id: "p1", baseUrl: "http://localhost:1234", apiKey: "" }],
        generator: { providerId: "p1" },
      })
    ).toBe(true);
  });

  it("returns false when provider not found", () => {
    expect(
      isGeneratorConfigured({
        providers: [],
        generator: { providerId: "p1" },
      })
    ).toBe(false);
  });

  it("returns false for remote provider without API key", () => {
    expect(
      isGeneratorConfigured({
        providers: [{ id: "p1", baseUrl: "https://api.openai.com", apiKey: "" }],
        generator: { providerId: "p1" },
      })
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// collectEnabledSeeds
// ---------------------------------------------------------------------------
describe("collectEnabledSeeds", () => {
  it("returns undefined for null state", () => {
    expect(collectEnabledSeeds(null)).toBeUndefined();
  });

  it("returns undefined when all slots empty", () => {
    expect(collectEnabledSeeds(createEmptyDnaState())).toBeUndefined();
  });

  it("collects enabled non-empty seeds", () => {
    const state = createEmptyDnaState();
    state.geography = { value: "Mountains", enabled: true, isCustom: false };
    state.wildcard = { value: "Time travel", enabled: true, isCustom: false };
    const result = collectEnabledSeeds(state);
    expect(result).toEqual({ geography: "Mountains", wildcard: "Time travel" });
  });

  it("skips disabled seeds", () => {
    const state = createEmptyDnaState();
    state.geography = { value: "Mountains", enabled: false, isCustom: false };
    state.wildcard = { value: "Time travel", enabled: true, isCustom: false };
    const result = collectEnabledSeeds(state);
    expect(result).toEqual({ wildcard: "Time travel" });
  });

  it("collects culturalFlavor as array", () => {
    const state = createEmptyDnaState();
    state.culturalFlavor = { value: ["A", "B"], enabled: true, isCustom: false };
    const result = collectEnabledSeeds(state);
    expect(result).toEqual({ culturalFlavor: ["A", "B"] });
  });

  it("parses culturalFlavor string to array", () => {
    const state = createEmptyDnaState();
    state.culturalFlavor = { value: "A, B, C" as unknown as string[], enabled: true, isCustom: false };
    const result = collectEnabledSeeds(state);
    expect(result).toEqual({ culturalFlavor: ["A", "B", "C"] });
  });
});

// ---------------------------------------------------------------------------
// WORLD_DNA_CARDS
// ---------------------------------------------------------------------------
describe("WORLD_DNA_CARDS", () => {
  it("has 6 categories", () => {
    expect(WORLD_DNA_CARDS).toHaveLength(6);
  });

  it("all categories have label and emoji", () => {
    for (const card of WORLD_DNA_CARDS) {
      expect(card.label.length).toBeGreaterThan(0);
      expect(card.emoji.length).toBeGreaterThan(0);
    }
  });
});
