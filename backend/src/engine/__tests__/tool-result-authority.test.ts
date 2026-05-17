import { describe, expect, it } from "vitest";
import {
  attachToolResultAuthority,
  buildObservationToolResult,
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
    const modelVisibleJson = JSON.stringify(result);
    expect(modelVisibleJson).not.toContain("authority");
    expect(modelVisibleJson).not.toContain("toolResultId");
    expect(modelVisibleJson).not.toContain("campaign-1");
    expect(modelVisibleJson).not.toContain("npc-1");
    expect(modelVisibleJson).toContain("Mira");
  });

  it("serializes tool payloads without backend IDs or provenance refs", () => {
    const result = attachToolResultAuthority(
      {
        success: true,
        result: {
          npcId: "npc-disputes-clerk",
          locationId: "location:loc-concourse",
          delegateTool: "spawn_npc",
          name: "Concourse Disputes Clerk",
          locationName: "Concourse",
          routeId: "route-tea-lane",
          authorityRef: "authority:gm-loop",
          campaignRef: "campaign-main",
          sourceRefs: ["event-secret", "location:loc-concourse"],
          nested: {
            eventId: "event-dialogue-structural",
            delegateTool: "reveal_location",
            summary:
              "The clerk points to location:loc-concourse, route_hidden_path, tool_result_8, and npc-disputes-clerk.",
          },
          sourceLinkedSummary: {
            responseId: "response-visible-1",
            effectId: "effect-hidden-1",
            sourceIds: [
              "tool-result-abc",
              "route_hidden_path",
              "550e8400-e29b-41d4-a716-446655440000",
            ],
            summary:
              "A player-facing source-linked summary mentions action-result-1 and response-visible-1.",
          },
        },
        modelSafeRefs: [
          "Concourse Disputes Clerk",
          "current_location",
          "location:loc-concourse",
          "route_hidden_path",
          "550e8400-e29b-41d4-a716-446655440000",
        ],
      },
      {
        ...authorityBase,
        stateDeltaRefs: ["npc:npc-disputes-clerk", "location:loc-concourse"],
      },
    );

    const modelVisibleJson = JSON.stringify(result);
    expect(modelVisibleJson).toContain("Concourse Disputes Clerk");
    expect(modelVisibleJson).toContain("current_location");
    expect(modelVisibleJson).toContain("[backend ref hidden]");
    expect(modelVisibleJson).not.toContain("npcId");
    expect(modelVisibleJson).not.toContain("locationId");
    expect(modelVisibleJson).not.toContain("routeId");
    expect(modelVisibleJson).not.toContain("authorityRef");
    expect(modelVisibleJson).not.toContain("campaignRef");
    expect(modelVisibleJson).not.toContain("delegateTool");
    expect(modelVisibleJson).not.toContain("responseId");
    expect(modelVisibleJson).not.toContain("effectId");
    expect(modelVisibleJson).not.toContain("sourceIds");
    expect(modelVisibleJson).not.toContain("sourceRefs");
    expect(modelVisibleJson).not.toContain("event-dialogue-structural");
    expect(modelVisibleJson).not.toContain("location:loc-concourse");
    expect(modelVisibleJson).not.toContain("npc-disputes-clerk");
    expect(modelVisibleJson).not.toContain("route_hidden_path");
    expect(modelVisibleJson).not.toContain("tool_result_8");
    expect(modelVisibleJson).not.toContain("authority:gm-loop");
    expect(modelVisibleJson).not.toContain("campaign-main");
    expect(modelVisibleJson).not.toContain("spawn_npc");
    expect(modelVisibleJson).not.toContain("reveal_location");
    expect(modelVisibleJson).not.toContain("response-visible-1");
    expect(modelVisibleJson).not.toContain("effect-hidden-1");
    expect(modelVisibleJson).not.toContain("action-result-1");
    expect(modelVisibleJson).not.toContain("tool-result-abc");
    expect(modelVisibleJson).not.toContain("550e8400");
    expect(modelVisibleJson).toContain("player-facing");
    expect(modelVisibleJson).toContain("source-linked");
  });

  it("serializes observation-only helper results through the same model-safe boundary", () => {
    const result = buildObservationToolResult({
      result: {
        candidates: [
          {
            id: "actor:550e8400-e29b-41d4-a716-446655440001",
            label: "Road Warden",
            sourceRefs: ["event-1", "location:loc-gate"],
          },
        ],
      },
      modelSafeRefs: ["Road Warden", "actor:550e8400-e29b-41d4-a716-446655440001"],
    });

    const modelVisibleJson = JSON.stringify(result);
    expect(modelVisibleJson).toContain("Road Warden");
    expect(modelVisibleJson).not.toContain("actor:550e8400");
    expect(modelVisibleJson).not.toContain("location:loc-gate");
    expect(modelVisibleJson).not.toContain("sourceRefs");
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

  it("serializes validation failures with model-safe hints only", () => {
    const result = buildValidationFailureToolResult("bad ref", {
      code: "invalid_source_ref",
      path: "input.sourceRefs.0",
      retryable: true,
      invalidRef: "location:loc-secret",
      refHints: [
        "current_location",
        "location:loc-secret",
        "tool_result_8",
        "authority:gm-loop",
        "550e8400-e29b-41d4-a716-446655440000",
        "Road Warden",
      ],
      message: "Use a visible source ref instead of location:loc-secret or tool_result_8.",
    });

    const modelVisible = JSON.stringify(result);
    expect(modelVisible).toContain("current_location");
    expect(modelVisible).toContain("Road Warden");
    expect(modelVisible).not.toContain("location:loc-secret");
    expect(modelVisible).not.toContain("tool_result_8");
    expect(modelVisible).not.toContain("authority:gm-loop");
    expect(modelVisible).not.toContain("550e8400");
    expect(modelVisible).not.toContain("invalidRef");
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
