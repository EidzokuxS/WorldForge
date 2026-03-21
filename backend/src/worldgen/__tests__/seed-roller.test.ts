import crypto from "node:crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { rollSeed, rollWorldSeeds, parseWorldSeeds } from "../seed-roller.js";
import type { WorldSeeds, SeedCategory } from "../seed-roller.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** All six seed categories. */
const ALL_CATEGORIES: SeedCategory[] = [
  "geography",
  "politicalStructure",
  "centralConflict",
  "culturalFlavor",
  "environment",
  "wildcard",
];

/** Categories that return a single string. */
const STRING_CATEGORIES: SeedCategory[] = [
  "geography",
  "politicalStructure",
  "centralConflict",
  "environment",
  "wildcard",
];

// ---------------------------------------------------------------------------
// rollSeed
// ---------------------------------------------------------------------------

describe("rollSeed", () => {
  describe("string categories", () => {
    it.each(STRING_CATEGORIES)(
      "returns a non-empty string for %s",
      (category) => {
        const result = rollSeed(category);
        expect(typeof result).toBe("string");
        expect((result as string).length).toBeGreaterThan(0);
      },
    );
  });

  describe("culturalFlavor", () => {
    it("returns an array of strings", () => {
      const result = rollSeed("culturalFlavor");
      expect(Array.isArray(result)).toBe(true);
      for (const item of result as string[]) {
        expect(typeof item).toBe("string");
        expect(item.length).toBeGreaterThan(0);
      }
    });

    it("returns 2 or 3 items (2 + randomInt(2))", () => {
      // Run multiple times to gain confidence about the range
      const lengths = new Set<number>();
      for (let i = 0; i < 50; i++) {
        const result = rollSeed("culturalFlavor") as string[];
        lengths.add(result.length);
        expect(result.length).toBeGreaterThanOrEqual(2);
        expect(result.length).toBeLessThanOrEqual(3);
      }
      // With 50 iterations we almost certainly see both 2 and 3
    });

    it("returns unique items (no duplicates)", () => {
      for (let i = 0; i < 30; i++) {
        const result = rollSeed("culturalFlavor") as string[];
        const unique = new Set(result);
        expect(unique.size).toBe(result.length);
      }
    });
  });

  describe("deterministic output with mocked randomInt", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let randomIntSpy: any;

    beforeEach(() => {
      randomIntSpy = vi.spyOn(crypto, "randomInt");
    });

    afterEach(() => {
      randomIntSpy.mockRestore();
    });

    it("geography returns the first item when randomInt returns 0", () => {
      randomIntSpy.mockReturnValue(0);
      const result = rollSeed("geography");
      expect(result).toBe("Vast archipelago of floating islands");
    });

    it("culturalFlavor picks deterministically when randomInt returns 0", () => {
      // First call: 2 + randomInt(2) -> 2 + 0 = 2 items
      // Subsequent calls inside pickMultiple all return 0 (swap with self)
      randomIntSpy.mockReturnValue(0);
      const result = rollSeed("culturalFlavor") as string[];
      expect(result).toHaveLength(2);
      expect(result[0]).toBe("Medieval Scandinavian");
      expect(result[1]).toBe("Feudal Japanese");
    });
  });

  describe("default / unknown category", () => {
    it("falls through to wildcard pool for unknown categories", () => {
      // TypeScript prevents this at compile time, but at runtime
      // the default branch returns a WILDCARD item
      const result = rollSeed("nonexistent" as SeedCategory);
      expect(typeof result).toBe("string");
      expect((result as string).length).toBeGreaterThan(0);
    });
  });
});

// ---------------------------------------------------------------------------
// rollWorldSeeds
// ---------------------------------------------------------------------------

describe("rollWorldSeeds", () => {
  it("returns an object with all six seed categories", () => {
    const seeds = rollWorldSeeds();
    for (const key of ALL_CATEGORIES) {
      expect(seeds).toHaveProperty(key);
    }
  });

  it("string fields are non-empty strings", () => {
    const seeds = rollWorldSeeds();
    for (const key of STRING_CATEGORIES) {
      expect(typeof seeds[key]).toBe("string");
      expect((seeds[key] as string).length).toBeGreaterThan(0);
    }
  });

  it("culturalFlavor is a non-empty array of strings", () => {
    const seeds = rollWorldSeeds();
    expect(Array.isArray(seeds.culturalFlavor)).toBe(true);
    expect(seeds.culturalFlavor!.length).toBeGreaterThanOrEqual(2);
    for (const item of seeds.culturalFlavor!) {
      expect(typeof item).toBe("string");
    }
  });

  it("returns no extra keys beyond the six categories", () => {
    const seeds = rollWorldSeeds();
    const keys = Object.keys(seeds);
    expect(keys.sort()).toEqual([...ALL_CATEGORIES].sort());
  });

  it("produces varied results across multiple calls", () => {
    const results = Array.from({ length: 20 }, () => rollWorldSeeds());
    const geographies = new Set(results.map((s) => s.geography));
    // With 12 items and 20 rolls, we should see more than 1 unique value
    expect(geographies.size).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// parseWorldSeeds
// ---------------------------------------------------------------------------

describe("parseWorldSeeds", () => {
  // -- Null / rejection cases ------------------------------------------------

  describe("returns null for invalid input", () => {
    it.each([
      ["null", null],
      ["undefined", undefined],
      ["number", 42],
      ["string", "hello"],
      ["boolean", true],
      ["array", [1, 2, 3]],
    ])("returns null for %s", (_label, value) => {
      // Arrays pass isRecord (typeof [] === "object" && [] !== null)
      // but have no valid seed fields, so the result is still null
      expect(parseWorldSeeds(value)).toBeNull();
    });

    it("returns null for an empty object", () => {
      expect(parseWorldSeeds({})).toBeNull();
    });

    it("returns null for an object with only unrelated keys", () => {
      expect(parseWorldSeeds({ foo: "bar", baz: 123 })).toBeNull();
    });
  });

  // -- String fields ---------------------------------------------------------

  describe("string seed fields", () => {
    it("parses a single string field", () => {
      const result = parseWorldSeeds({ geography: "Floating islands" });
      expect(result).toEqual({ geography: "Floating islands" });
    });

    it("parses all five string fields", () => {
      const input: WorldSeeds = {
        geography: "Tundra",
        politicalStructure: "Empire",
        centralConflict: "War",
        environment: "Twilight",
        wildcard: "Sentient moon",
      };
      const result = parseWorldSeeds(input);
      expect(result).toEqual(input);
    });

    it("trims whitespace from string fields", () => {
      const result = parseWorldSeeds({
        geography: "  Floating islands  ",
        wildcard: "\tSentient moon\n",
      });
      expect(result).toEqual({
        geography: "Floating islands",
        wildcard: "Sentient moon",
      });
    });

    it("ignores empty strings", () => {
      const result = parseWorldSeeds({ geography: "", wildcard: "Moon" });
      expect(result).toEqual({ wildcard: "Moon" });
    });

    it("ignores whitespace-only strings", () => {
      const result = parseWorldSeeds({ geography: "   ", wildcard: "Moon" });
      expect(result).toEqual({ wildcard: "Moon" });
    });

    it("ignores non-string values in string fields", () => {
      const result = parseWorldSeeds({
        geography: 42,
        politicalStructure: true,
        centralConflict: null,
        environment: undefined,
        wildcard: "Valid",
      });
      expect(result).toEqual({ wildcard: "Valid" });
    });
  });

  // -- culturalFlavor --------------------------------------------------------

  describe("culturalFlavor", () => {
    it("parses a valid culturalFlavor array", () => {
      const result = parseWorldSeeds({
        culturalFlavor: ["Medieval", "Byzantine"],
      });
      expect(result).toEqual({ culturalFlavor: ["Medieval", "Byzantine"] });
    });

    it("trims items in culturalFlavor", () => {
      const result = parseWorldSeeds({
        culturalFlavor: ["  Medieval  ", "\tByzantine\n"],
      });
      expect(result).toEqual({ culturalFlavor: ["Medieval", "Byzantine"] });
    });

    it("filters out empty strings after trimming", () => {
      const result = parseWorldSeeds({
        culturalFlavor: ["Medieval", "  ", "", "Byzantine"],
      });
      expect(result).toEqual({ culturalFlavor: ["Medieval", "Byzantine"] });
    });

    it("returns null when all culturalFlavor items are empty after trim", () => {
      const result = parseWorldSeeds({
        culturalFlavor: ["", "  ", "\t"],
      });
      expect(result).toBeNull();
    });

    it("ignores culturalFlavor if it is not an array", () => {
      const result = parseWorldSeeds({ culturalFlavor: "Medieval" });
      expect(result).toBeNull();
    });

    it("ignores culturalFlavor if array contains non-strings", () => {
      const result = parseWorldSeeds({ culturalFlavor: ["Medieval", 42] });
      expect(result).toBeNull();
    });

    it("rejects culturalFlavor with mixed types (string + boolean)", () => {
      const result = parseWorldSeeds({
        culturalFlavor: ["Medieval", true],
      });
      expect(result).toBeNull();
    });

    it("returns null for an empty culturalFlavor array", () => {
      const result = parseWorldSeeds({ culturalFlavor: [] });
      expect(result).toBeNull();
    });
  });

  // -- Mixed fields ----------------------------------------------------------

  describe("mixed fields", () => {
    it("parses string fields alongside culturalFlavor", () => {
      const input = {
        geography: "Tundra",
        culturalFlavor: ["Medieval", "Persian"],
      };
      const result = parseWorldSeeds(input);
      expect(result).toEqual(input);
    });

    it("ignores extra/unknown keys", () => {
      const result = parseWorldSeeds({
        geography: "Tundra",
        unknownField: "ignored",
        extra: 99,
      });
      expect(result).toEqual({ geography: "Tundra" });
      expect(result).not.toHaveProperty("unknownField");
      expect(result).not.toHaveProperty("extra");
    });
  });

  // -- Partial objects -------------------------------------------------------

  describe("partial objects", () => {
    it("parses when only one field is present", () => {
      expect(parseWorldSeeds({ environment: "Twilight" })).toEqual({
        environment: "Twilight",
      });
    });

    it("skips invalid fields and keeps valid ones", () => {
      const result = parseWorldSeeds({
        geography: "",
        politicalStructure: null,
        centralConflict: "War",
        environment: 42,
        wildcard: "  ",
        culturalFlavor: [123],
      });
      expect(result).toEqual({ centralConflict: "War" });
    });
  });

  // -- Round-trip: rollWorldSeeds -> parseWorldSeeds --------------------------

  describe("round-trip", () => {
    it("parseWorldSeeds accepts output of rollWorldSeeds", () => {
      const seeds = rollWorldSeeds();
      const parsed = parseWorldSeeds(seeds);
      expect(parsed).not.toBeNull();
      // Every field that was rolled should be present after parsing
      for (const key of STRING_CATEGORIES) {
        expect(parsed![key]).toBe(seeds[key]);
      }
      expect(parsed!.culturalFlavor).toEqual(seeds.culturalFlavor);
    });
  });
});
