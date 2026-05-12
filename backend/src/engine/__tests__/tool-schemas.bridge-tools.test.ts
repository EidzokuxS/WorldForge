import { describe, expect, it, vi } from "vitest";

const { executeToolCallMock } = vi.hoisted(() => ({
  executeToolCallMock: vi.fn(),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: executeToolCallMock,
}));

import { buildRuntimeToolInputContract } from "../prompt-contracts.js";
import {
  createStorytellerTools,
  runtimeToolInputSchemas,
  type RuntimeToolName,
} from "../tool-schemas.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";
import {
  buildObservationToolResult,
  isObservationToolResult,
  type ToolResult,
} from "../tool-result.js";

const lookupToolNames = [
  "list_visible_affordances",
  "list_navigation_options",
  "find_location_candidates",
  "find_object_candidates",
  "find_actor_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "check_route",
] as const satisfies readonly RuntimeToolName[];

function createExecutionContext(): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "actor-player",
    subjectActorRefs: new Set(["actor-player", "player"]),
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-market",
    legalLocationRefs: new Set(["loc-market", "scene-market", "current_location", "current_scene"]),
    legalActorRefs: new Set(["actor-player", "player"]),
    legalItemRefs: new Set(["item-tea-sign"]),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(["loc-market", "current_location"]),
    currentSceneRefs: new Set(["scene-market", "current_scene"]),
    legalMovementRefs: new Set(["edge-tea-lane", "loc-tea-lane", "east tea lane"]),
    bridgeLookup: {
      current: {
        campaignId: "campaign-1",
        tick: 3,
        playerActorId: "actor-player",
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-market",
        currentLocationName: "Canal Market",
        currentSceneScopeName: "Canal Market Counter",
        currentLocationDescription: null,
        currentSceneScopeDescription: null,
      },
      visibleActors: [
        {
          id: "actor-player",
          actorId: "actor-player",
          type: "player",
          label: "Player",
          awareness: "clear",
        },
      ],
      awarenessHints: [],
      legalTargets: [
        {
          id: "item:tea-sign",
          type: "item",
          label: "Painted Tea Sign",
          itemId: "item-tea-sign",
          tags: ["tea", "shop"],
        },
      ],
      legalMovement: [
        {
          id: "edge-tea-lane",
          locationId: "loc-tea-lane",
          label: "East Tea Lane",
          connected: true,
          travelCost: 4,
          path: ["loc-market", "loc-tea-lane"],
        },
      ],
      localRecentEvents: [],
      playerKnownFacts: [],
      allowedTools: [...lookupToolNames],
    },
  };
}

describe("bridge lookup tool schemas", () => {
  it("registers all bridge lookup tools in runtime schemas and Storyteller tools", () => {
    const tools = createStorytellerTools("campaign-1", 3, undefined, createExecutionContext());

    for (const toolName of lookupToolNames) {
      expect(runtimeToolInputSchemas).toHaveProperty(toolName);
      expect(tools).toHaveProperty(toolName);
    }
  });

  it("validates lookup inputs, caps, and known-fact query/ref requirements", () => {
    expect(runtimeToolInputSchemas.find_location_candidates.safeParse({
      query: "tea lane",
      tags: ["shop"],
      maxResults: 8,
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.find_location_candidates.safeParse({
      query: "tea lane",
      maxResults: 9,
    }).success).toBe(false);
    expect(runtimeToolInputSchemas.inspect_known_fact.safeParse({}).success).toBe(false);
    expect(runtimeToolInputSchemas.inspect_known_fact.safeParse({
      ref: "knowledge:tea-route",
      scope: "known",
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.check_route.safeParse({
      destinationRef: "East Tea Lane",
      mode: "walk",
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.check_route.safeParse({ mode: "walk" }).success).toBe(false);
  });

  it("returns observation-only results from lookup tools without entering executeToolCall", async () => {
    const tools = createStorytellerTools("campaign-1", 3, undefined, createExecutionContext());
    const executeFindObjectCandidates = tools.find_object_candidates.execute as (
      input: { query: string; maxResults: number },
      options?: unknown,
    ) => Promise<ToolResult>;
    const result = await executeFindObjectCandidates({
      query: "tea sign",
      maxResults: 4,
    }, undefined);

    expect(result).toMatchObject({
      success: true,
      kind: "observation",
      observationOnly: true,
    });
    expect(isObservationToolResult(result)).toBe(true);
    expect(JSON.stringify(result)).toContain("Painted Tea Sign");
    expect(executeToolCallMock).not.toHaveBeenCalled();
  });

  it("documents lookup tools compactly and marks fact/route lookup as observation-only", () => {
    const contract = buildRuntimeToolInputContract({
      toolNames: ["inspect_known_fact", "check_route"],
    });

    expect(contract).toContain('"inspect_known_fact" input');
    expect(contract).toContain('"check_route" input');
    expect(contract).toContain("Observation-only fact lookup");
    expect(contract).toContain("hidden routes deny without names");
    expect(contract.length).toBeLessThan(5000);
  });

  it("has an explicit observation ToolResult representation distinct from mutation authority", () => {
    const result = buildObservationToolResult({
      result: { candidates: [], observationOnly: true },
    });

    expect(result).toMatchObject({
      success: true,
      status: "success",
      kind: "observation",
      observationOnly: true,
    });
    expect(result.authority).toBeUndefined();
    expect(isObservationToolResult(result)).toBe(true);
  });
});

describe("record_dialogue_outcome schema", () => {
  it("accepts multilingual direct speech when structural enums and claims carry the semantics", () => {
    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      speakerRef: "Road Warden",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "proof",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance: "The proof requirement controls later lawful passage attempts.",
      quote: "持参するのは封印確認済みの通行証だ。",
      summary: "Der Wachposten nennt den erforderlichen Nachweis.",
      claims: [
        {
          claimKind: "requirement",
          polarity: "requires",
          subjectText: "seal-verified transit chit",
          summary: "A seal-verified transit chit is required.",
        },
      ],
      sourceRefs: ["Road Warden", "Player"],
    }).success).toBe(true);
  });

  it("rejects durable procedural answers without future use or structured claims", () => {
    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      speakerRef: "Road Warden",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "proof",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureRelevance: "The proof requirement controls later lawful passage attempts.",
      summary: "The warden names proof.",
      sourceRefs: ["Road Warden", "Player"],
    }).success).toBe(false);
  });

  it("requires requestedRoleText for unavailable/no-current-answer outcomes", () => {
    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      addresseeRefs: ["Player"],
      outcomeKind: "unavailable",
      topicKind: "safety",
      authorityKind: "no_visible_authority",
      truthStatus: "unconfirmed",
      durability: "durable",
      futureUseKind: "safety",
      futureRelevance: "The player must seek a visible safety authority elsewhere.",
      summary: "No ward engineer is visible here.",
      sourceRefs: ["Player"],
    }).success).toBe(false);
  });

  it("rejects no-visible-authority on visible speaker outcomes", () => {
    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      speakerRef: "Road Warden",
      addresseeRefs: ["Player"],
      outcomeKind: "refused",
      topicKind: "status",
      authorityKind: "no_visible_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "npc_memory",
      futureRelevance: "The refusal affects later warden interactions.",
      summary: "The warden refuses to answer.",
      sourceRefs: ["Road Warden"],
    }).success).toBe(false);

    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      speakerRef: "Road Warden",
      addresseeRefs: ["Player"],
      outcomeKind: "unavailable",
      topicKind: "status",
      authorityKind: "no_visible_authority",
      truthStatus: "unconfirmed",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The player must find the actual office elsewhere.",
      requestedRoleText: "signal warden office",
      summary: "No signal warden office is visible here.",
      sourceRefs: ["Player"],
    }).success).toBe(false);
  });
});

describe("record_world_fact schema", () => {
  it("accepts structured durable contradictions without parsing summary prose", () => {
    expect(runtimeToolInputSchemas.record_world_fact.safeParse({
      sourceKind: "comparison",
      truthStatus: "disputed",
      factKind: "contradiction",
      topicKind: "procedure",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance:
        "The mismatch should guide which office the player asks before choosing a route.",
      summary:
        "The posted date and the route log disagree; treat the gap as unresolved.",
      claims: [
        {
          claimKind: "contradiction",
          polarity: "unknown",
          subjectText: "posted date vs route log",
          summary: "The date mismatch is unresolved.",
        },
      ],
      subjectRefs: ["route log"],
      sourceRefs: ["Player"],
    }).success).toBe(true);
  });

  it("rejects unknown positive facts that should be gaps or contradictions", () => {
    expect(runtimeToolInputSchemas.record_world_fact.safeParse({
      sourceKind: "comparison",
      truthStatus: "unknown",
      factKind: "route_status",
      topicKind: "route",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The route status should affect later travel.",
      summary: "The route may be closed.",
      claims: [
        {
          claimKind: "route_status",
          polarity: "unknown",
          subjectText: "north route",
          summary: "The route status is unknown.",
        },
      ],
      sourceRefs: ["Player"],
    }).success).toBe(false);
  });
});
