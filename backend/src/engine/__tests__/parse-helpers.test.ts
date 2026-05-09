import { describe, expect, it } from "vitest";

import {
  collectToolCalls,
  parseBeliefs,
  parseNpcGoals,
  parseTags,
} from "../parse-helpers.js";

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

describe("collectToolCalls", () => {
  it("deduplicates cumulative AI SDK steps by toolCallId and matches results by id", () => {
    const calls = collectToolCalls([
      {
        toolCalls: [
          { toolName: "log_event", toolCallId: "call-1", input: { text: "record" } },
        ],
        toolResults: [
          { toolCallId: "call-1", output: { success: true, result: { eventId: "event-1" } } },
        ],
      },
      {
        toolCalls: [
          { toolName: "log_event", toolCallId: "call-1", input: { text: "record" } },
          { toolName: "add_tag", toolCallId: "call-2", input: { tag: "caught-lying" } },
        ],
        toolResults: [
          { toolCallId: "call-2", output: { success: true, result: { tags: ["caught-lying"] } } },
        ],
      },
      {
        toolCalls: [
          { toolName: "log_event", toolCallId: "call-1", input: { text: "record" } },
          { toolName: "add_tag", toolCallId: "call-2", input: { tag: "caught-lying" } },
          { toolName: "offer_quick_actions", toolCallId: "call-3", input: { actions: [] } },
        ],
        toolResults: [
          { toolCallId: "call-3", output: { success: true, result: { actions: [] } } },
        ],
      },
    ]);

    expect(calls).toEqual([
      {
        tool: "log_event",
        args: { text: "record" },
        result: { success: true, result: { eventId: "event-1" } },
        toolCallId: "call-1",
      },
      {
        tool: "add_tag",
        args: { tag: "caught-lying" },
        result: { success: true, result: { tags: ["caught-lying"] } },
        toolCallId: "call-2",
      },
      {
        tool: "offer_quick_actions",
        args: { actions: [] },
        result: { success: true, result: { actions: [] } },
        toolCallId: "call-3",
      },
    ]);
  });

  it("preserves repeated calls without toolCallId because they cannot be proven duplicates", () => {
    const calls = collectToolCalls([
      {
        toolCalls: [
          { toolName: "log_event", input: { text: "first" } },
          { toolName: "log_event", input: { text: "first" } },
        ],
        toolResults: [
          { output: { success: true, result: { eventId: "event-1" } } },
          { output: { success: false, error: "tool_failed" } },
        ],
      },
    ]);

    expect(calls).toHaveLength(2);
    expect(calls.map((call) => call.result)).toEqual([
      { success: true, result: { eventId: "event-1" } },
      { success: false, error: "tool_failed" },
    ]);
  });
});
