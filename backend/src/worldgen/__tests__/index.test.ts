import { describe, it, expect } from "vitest";
import {
  rollWorldSeeds,
  rollSeed,
  parseWorldSeeds,
} from "../index.js";

describe("worldgen barrel exports", () => {
  it("exports rollWorldSeeds", () => {
    expect(rollWorldSeeds).toBeDefined();
    expect(typeof rollWorldSeeds).toBe("function");
  });

  it("exports rollSeed", () => {
    expect(rollSeed).toBeDefined();
    expect(typeof rollSeed).toBe("function");
  });

  it("exports parseWorldSeeds", () => {
    expect(parseWorldSeeds).toBeDefined();
    expect(typeof parseWorldSeeds).toBe("function");
  });
});

describe("parseWorldSeeds via barrel", () => {
  it("returns null for undefined", () => {
    expect(parseWorldSeeds(undefined)).toBeNull();
  });

  it("returns null for non-object", () => {
    expect(parseWorldSeeds("string")).toBeNull();
    expect(parseWorldSeeds(42)).toBeNull();
  });

  it("parses valid seeds object", () => {
    const result = parseWorldSeeds({ geography: "Islands" });
    expect(result).toBeDefined();
    expect(result?.geography).toBe("Islands");
  });
});
