import { describe, expect, it } from "vitest";
import {
  attachToolResultAuthority,
  buildPartialToolResult,
  buildValidationFailureToolResult,
  inferRefsFromToolResultPayload,
} from "../tool-result.js";

const authorityBase = {
  campaignId: "campaign-1",
  sourceEntity: { type: "player", id: "player-1" },
  baseWorldVersion: 4,
  resultWorldVersion: 5,
  worldTimeMinutes: 12,
  elapsedWorldTimeMinutes: 1,
  stateDeltaRefs: ["npc-1", "Courtyard"],
  eventRefs: ["event-1"],
  witnesses: ["player-1"],
  knowledgeOutputs: [],
  visibilityOutputs: [],
  resources: [],
};

describe("ToolResult authority contract", () => {
  it("attaches authoritative metadata to successful state changes", () => {
    const result = attachToolResultAuthority(
      {
        success: true,
        result: {
          npcId: "npc-1",
          name: "Mira",
          locationName: "Courtyard",
        },
      },
      {
        ...authorityBase,
        requireStateDelta: true,
      },
    );

    expect(result.status).toBe("success");
    expect(result.authority).toMatchObject({
      campaignId: "campaign-1",
      baseWorldVersion: 4,
      resultWorldVersion: 5,
      worldTimeMinutes: 12,
      stateDeltaRefs: ["npc-1", "Courtyard"],
      eventRefs: ["event-1"],
    });
    expect(result.authority?.toolResultId).toEqual(expect.any(String));
  });

  it("rejects successful authoritative writes without mutation refs", () => {
    expect(() =>
      attachToolResultAuthority(
        { success: true, result: { note: "empty" } },
        {
          ...authorityBase,
          stateDeltaRefs: [],
          eventRefs: [],
          requireStateDelta: true,
        },
      ),
    ).toThrow("stateDeltaRefs");
  });

  it("keeps validation failures explicit instead of pretending they succeeded", () => {
    const result = attachToolResultAuthority(
      buildValidationFailureToolResult("stale base"),
      {
        ...authorityBase,
        resultWorldVersion: undefined,
        worldTimeMinutes: undefined,
        stateDeltaRefs: [],
        eventRefs: [],
        failureReason: "stale base",
      },
    );

    expect(result.success).toBe(false);
    expect(result.status).toBe("failure");
    expect(result.authority).toMatchObject({
      baseWorldVersion: 4,
      failureReason: "stale base",
    });

    expect(() =>
      attachToolResultAuthority(
        { success: false, status: "success", error: "bad" },
        authorityBase,
      ),
    ).toThrow("Failed ToolResult cannot carry success status");
  });

  it("preserves partial status for recoverable tool outputs", () => {
    const result = buildPartialToolResult({ applied: ["tag"] }, "second mutation failed");

    expect(result).toEqual({
      success: false,
      status: "partial",
      result: { applied: ["tag"] },
      error: "second mutation failed",
    });
  });

  it("extracts stable refs from model-facing payloads but not arbitrary prose", () => {
    expect(
      inferRefsFromToolResultPayload({
        id: "loc-1",
        name: "Signal Tower",
        nested: {
          eventId: "event-1",
          description: "Plain prose should not become an authority ref.",
        },
      }),
    ).toEqual(["loc-1", "Signal Tower", "event-1"]);
  });
});
