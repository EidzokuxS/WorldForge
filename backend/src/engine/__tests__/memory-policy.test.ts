import { describe, expect, it } from "vitest";
import { evaluateMemoryWrite } from "../memory-policy.js";

describe("memory policy", () => {
  it("rejects narration flavor and stock prose as durable memory", () => {
    expect(evaluateMemoryWrite({
      eventType: "ambient",
      summary: "The atmosphere smells of ozone and most people keep walking.",
      source: "narration",
      importance: 6,
    })).toEqual({ write: false, reason: "narration_flavor_not_memory" });
  });

  it("accepts source-backed consequential events with concrete anchors", () => {
    expect(evaluateMemoryWrite({
      eventType: "promise",
      summary: "Mira promised to bring the bridge key to Depot Seven.",
      source: "committed_event",
      importance: 5,
    })).toMatchObject({
      write: true,
      route: "memory",
      reason: "consequential_source_backed_event",
    });
  });

  it("keeps reports and rumors in their own routes", () => {
    expect(evaluateMemoryWrite({
      eventType: "report",
      summary: "Guard reports that Ilya left the south gate.",
      source: "committed_event",
      importance: 4,
    })).toMatchObject({ write: true, route: "report_message" });

    expect(evaluateMemoryWrite({
      eventType: "rumor",
      summary: "Someone says 'the tower key belongs to Tova'.",
      source: "committed_event",
      importance: 4,
    })).toMatchObject({ write: true, route: "rumor" });
  });
});
