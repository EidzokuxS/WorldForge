import { describe, it, expect } from "vitest";
import { parseTags, parseNpcGoals, parseBeliefs } from "../parse-helpers.js";

describe("parseTags", () => {
  it("parses a valid JSON string array", () => {
    expect(parseTags('["warrior","brave","tall"]')).toEqual([
      "warrior",
      "brave",
      "tall",
    ]);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseTags("[]")).toEqual([]);
  });

  it("filters out non-string elements", () => {
    expect(parseTags('[1, "valid", null, true, "also-valid"]')).toEqual([
      "valid",
      "also-valid",
    ]);
  });

  it("returns empty array for non-array JSON (object)", () => {
    expect(parseTags('{"key":"value"}')).toEqual([]);
  });

  it("returns empty array for non-array JSON (string)", () => {
    expect(parseTags('"just a string"')).toEqual([]);
  });

  it("returns empty array for non-array JSON (number)", () => {
    expect(parseTags("42")).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseTags("not json at all")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseTags("")).toEqual([]);
  });
});

describe("parseNpcGoals", () => {
  it("parses a valid goals object", () => {
    const input = JSON.stringify({
      short_term: ["find food", "rest"],
      long_term: ["become king"],
    });
    expect(parseNpcGoals(input)).toEqual({
      short_term: ["find food", "rest"],
      long_term: ["become king"],
    });
  });

  it("returns empty arrays when fields are missing", () => {
    expect(parseNpcGoals("{}")).toEqual({ short_term: [], long_term: [] });
  });

  it("returns empty arrays when fields are not arrays", () => {
    const input = JSON.stringify({ short_term: "oops", long_term: 123 });
    expect(parseNpcGoals(input)).toEqual({ short_term: [], long_term: [] });
  });

  it("filters non-string elements within goal arrays", () => {
    const input = JSON.stringify({
      short_term: ["valid", 42, null],
      long_term: [true, "also-valid"],
    });
    expect(parseNpcGoals(input)).toEqual({
      short_term: ["valid"],
      long_term: ["also-valid"],
    });
  });

  it("returns default for non-object JSON (array)", () => {
    expect(parseNpcGoals('["not","an","object"]')).toEqual({
      short_term: [],
      long_term: [],
    });
  });

  it("returns default for non-object JSON (null)", () => {
    expect(parseNpcGoals("null")).toEqual({ short_term: [], long_term: [] });
  });

  it("returns default for invalid JSON", () => {
    expect(parseNpcGoals("broken{json")).toEqual({
      short_term: [],
      long_term: [],
    });
  });

  it("returns default for empty string", () => {
    expect(parseNpcGoals("")).toEqual({ short_term: [], long_term: [] });
  });
});

describe("parseBeliefs", () => {
  it("parses a valid JSON string array", () => {
    expect(parseBeliefs('["honor is everything","the gods watch"]')).toEqual([
      "honor is everything",
      "the gods watch",
    ]);
  });

  it("returns empty array for empty JSON array", () => {
    expect(parseBeliefs("[]")).toEqual([]);
  });

  it("filters out non-string elements", () => {
    expect(parseBeliefs('[1, "real belief", false]')).toEqual(["real belief"]);
  });

  it("returns empty array for non-array JSON", () => {
    expect(parseBeliefs('{"not":"array"}')).toEqual([]);
  });

  it("returns empty array for invalid JSON", () => {
    expect(parseBeliefs("<<<>>>")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(parseBeliefs("")).toEqual([]);
  });
});
