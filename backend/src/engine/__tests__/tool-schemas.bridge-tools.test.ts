import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeToolCallMock } = vi.hoisted(() => ({
  executeToolCallMock: vi.fn(),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: executeToolCallMock,
  toolRequiresExecutionAuthority: (toolName: string) =>
    toolName !== "request_contested_outcome" && toolName !== "offer_quick_actions",
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
  beforeEach(() => {
    executeToolCallMock.mockReset();
  });

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

  it("does not expose legacy raw id fields in model-facing movement/spawn schemas", () => {
    expect(runtimeToolInputSchemas.move_actor.safeParse({
      actorRef: "Player",
      destinationRef: "East Tea Lane",
      routeId: "edge-tea-lane",
      evidenceRefs: ["East Tea Lane"],
    }).data).not.toHaveProperty("routeId");

    expect(runtimeToolInputSchemas.create_scene_extra.safeParse({
      locationId: "loc-tea-lane",
      role: "courier",
      reason: "The public desk needs an ordinary courier.",
    }).success).toBe(true);
    expect(runtimeToolInputSchemas.create_scene_extra.safeParse({
      locationId: "loc-tea-lane",
      role: "courier",
      reason: "The public desk needs an ordinary courier.",
    }).data).not.toHaveProperty("locationId");

    expect(runtimeToolInputSchemas.spawn_npc.safeParse({
      name: "Market Runner",
      tags: ["messenger"],
      locationRef: "current_scene",
      locationId: "loc-tea-lane",
    }).data).not.toHaveProperty("locationId");
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

  it("fails closed for model-facing state-bearing tools without an execution context", async () => {
    const tools = createStorytellerTools("campaign-1", 3);
    const executeTransferItem = tools.transfer_item.execute as (
      input: { itemName: string; targetName: string; targetType: "character" },
      options?: unknown,
    ) => Promise<ToolResult>;

    const result = await executeTransferItem({
      itemName: "Iron Sword",
      targetName: "Hero",
      targetType: "character",
    }, undefined);

    expect(result).toMatchObject({
      success: false,
      status: "failure",
      error: expect.stringContaining("requires an execution context"),
    });
    expect(executeToolCallMock).not.toHaveBeenCalled();
  });

  it("routes quick-action offers through the runtime executor so handles are backend-owned", async () => {
    const context = createExecutionContext();
    const tools = createStorytellerTools("campaign-1", 3, undefined, context);
    executeToolCallMock.mockResolvedValueOnce({
      success: true,
      result: {
        actions: [
          {
            label: "Ask",
            action: "Ask the clerk.",
            handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          {
            label: "Watch",
            action: "Watch the queue.",
            handle: "qac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
          {
            label: "Move",
            action: "Move to the counter.",
            handle: "qac_cccccccccccccccccccccccccccccccc",
          },
        ],
      },
    } satisfies ToolResult);
    const executeOfferQuickActions = tools.offer_quick_actions.execute as (
      input: {
        actions: Array<{ label: string; action: string }>;
        sourceRefs?: string[];
      },
      options?: unknown,
    ) => Promise<ToolResult>;

    const input = {
      actions: [
        { label: "Ask", action: "Ask the clerk." },
        { label: "Watch", action: "Watch the queue." },
        { label: "Move", action: "Move to the counter." },
      ],
      sourceRefs: ["current_scene"],
    };
    const result = await executeOfferQuickActions(input, undefined);

    expect(result).toMatchObject({
      success: true,
      result: {
        actions: [
          expect.objectContaining({ handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }),
          expect.objectContaining({ handle: "qac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }),
          expect.objectContaining({ handle: "qac_cccccccccccccccccccccccccccccccc" }),
        ],
      },
    });
    expect(executeToolCallMock).toHaveBeenCalledWith(
      "campaign-1",
      "offer_quick_actions",
      input,
      3,
      undefined,
      context,
    );
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

describe("transfer_item schema", () => {
  it("accepts optional partial-transfer split names only as a pair", () => {
    expect(runtimeToolInputSchemas.transfer_item.safeParse({
      itemName: "Three Ration Slips",
      targetName: "Bureau Window",
      targetType: "location",
      transferredItemName: "Two Ration Slips",
      remainingItemName: "One Ration Slip",
    }).success).toBe(true);

    expect(runtimeToolInputSchemas.transfer_item.safeParse({
      itemName: "Three Ration Slips",
      targetName: "Bureau Window",
      targetType: "location",
      transferredItemName: "Two Ration Slips",
    }).success).toBe(false);

    expect(runtimeToolInputSchemas.transfer_item.safeParse({
      itemName: "Three Ration Slips",
      targetName: "Hero",
      targetType: "npc",
      transferredItemName: "Two Ration Slips",
      remainingItemName: "One Ration Slip",
      equipState: "carried",
    }).success).toBe(true);
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

  it("rejects durable procedural answers without a concrete quote surface", () => {
    const result = runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      speakerRef: "Lead Warden",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The answer decides where the player must go next.",
      summary: "The Lead Warden tells Mira where to obtain the manifest.",
      claims: [
        {
          claimKind: "route_status",
          polarity: "states",
          subjectText: "green-lantern manifest office",
          summary: "The Lead Warden states where the manifest must be obtained.",
        },
      ],
      sourceRefs: ["Lead Warden", "Player"],
    });

    if (result.success) {
      throw new Error("Expected missing quote to fail.");
    }
    expect(result.error.issues.some((issue) => issue.path.join(".") === "quote")).toBe(true);
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

  it("keeps communicative claims separate from applied state effects", () => {
    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      speakerRef: "Gate Guard",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "permission",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance:
        "The guard's stated condition can guide the player's next entry attempt.",
      quote: "\"A convincing registry phrase would be enough.\"",
      summary: "The guard says a convincing registry phrase would be enough.",
      claims: [
        {
          claimKind: "permission",
          polarity: "allows",
          subjectText: "convincing registry phrase",
          summary: "A convincing registry phrase would satisfy this guard.",
        },
      ],
      stateEffects: [],
      sourceRefs: ["Gate Guard", "Player"],
    }).success).toBe(true);
  });

  it("validates applied_now state effects as typed mutation receipts, not prose", () => {
    const base = {
      speakerRef: "Gate Guard",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "permission",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance:
        "The guard now treats the player as cleared by the bluff.",
      quote: "\"That will do. You may pass.\"",
      summary: "Готово.",
      claims: [
        {
          claimKind: "permission",
          polarity: "allows",
          subjectRef: "Gate Guard",
          summary: "The guard currently allows this attempt.",
        },
      ],
      sourceRefs: ["Gate Guard", "Player"],
    };

    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      ...base,
      stateEffects: [
        {
          effectId: "guard-cleared-by-bluff",
          status: "applied_now",
          stateReceipt: "state_receipt_1_1",
          summary: "The backend resolves this applied state from a prior receipt.",
        },
      ],
    }).success).toBe(true);

    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      ...base,
      stateEffects: [
        {
          effectId: "guard-cleared-by-bluff",
          status: "applied_now",
          structuralTool: "add_tag",
          targetRef: "Gate Guard",
          stateKey: "tag",
          stateValue: "cleared-by-bluff",
          summary: "The guard now has the cleared-by-bluff tag.",
        },
      ],
    }).success).toBe(false);

    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      ...base,
      stateEffects: [
        {
          effectId: "guard-cleared-by-bluff",
          status: "applied_now",
          targetRef: "Gate Guard",
          stateKey: "tag",
          stateValue: "cleared-by-bluff",
          summary: "The guard now has the cleared-by-bluff tag.",
        },
      ],
    }).success).toBe(false);

    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      ...base,
      stateEffects: [
        {
          effectId: "guard-cleared-by-bluff",
          status: "asserted_only",
          structuralTool: "add_tag",
          summary: "The guard says a tag would work.",
        },
      ],
    }).success).toBe(false);

    expect(runtimeToolInputSchemas.record_dialogue_outcome.safeParse({
      ...base,
      durability: "scene_local",
      stateEffects: [
        {
          effectId: "guard-cleared-by-bluff",
          status: "applied_now",
          structuralTool: "add_tag",
          targetRef: "Gate Guard",
          stateKey: "tag",
          stateValue: "cleared-by-bluff",
          summary: "The guard now has the cleared-by-bluff tag.",
        },
      ],
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
