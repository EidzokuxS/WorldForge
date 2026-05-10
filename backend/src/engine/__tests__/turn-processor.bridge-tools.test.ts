import { describe, expect, it } from "vitest";

import { executeBridgeCandidateTool } from "../bridge-candidate-tools.js";
import {
  buildStartSearchResult,
  prepareCreateMinorPoiInput,
  prepareMoveActorInput,
} from "../bridge-state-tools.js";
import { classifyClarificationReview } from "../clarification-reviewer.js";
import type { GmRead } from "../gm-turn-read.js";
import { buildNarratorPacket, type CanonicalTurnPacket } from "../narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
} from "../player-facing-packet.js";
import type { SceneFrame } from "../scene-frame.js";
import { scenePlanSchema } from "../scene-plan-schema.js";
import { createPlayerTurnToolExecutionContext } from "../tool-execution-context.js";
import { runtimeToolInputSchemas } from "../tool-schemas.js";

const exactInput = "иду дальше по логичному маршруту и ищу чайную лавку";
const playerId = "11111111-1111-4111-8111-111111111111";
const clerkId = "22222222-2222-4222-8222-222222222222";
const hiddenBrokerId = "33333333-3333-4333-8333-333333333333";

type ToolLedgerStep = {
  order: number;
  toolName: string;
  success: boolean;
  mutation: "none" | "validated";
  evidenceRefs: string[];
};

function createTouristCourierFrame(): SceneFrame {
  return {
    campaignId: "campaign-90-04",
    tick: 90,
    playerActorId: playerId,
    currentLocationId: "loc-canal-market",
    currentSceneScopeId: "scene-courier-counter",
    currentLocationName: "Canal Market",
    currentSceneScopeName: "Courier Counter",
    playerAction: exactInput,
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Tourist Courier",
          locationId: "loc-canal-market",
          sceneScopeId: "scene-courier-counter",
          awareness: "clear",
        },
        {
          id: clerkId,
          actorId: clerkId,
          type: "npc",
          label: "Courier Clerk",
          locationId: "loc-canal-market",
          sceneScopeId: "scene-courier-counter",
          awareness: "clear",
          tags: ["courier", "route", "service"],
        },
      ],
      support: [
        {
          id: hiddenBrokerId,
          actorId: hiddenBrokerId,
          type: "npc",
          label: "Hidden Tea Broker",
          locationId: "loc-private-vault",
          sceneScopeId: "loc-private-vault",
          awareness: "none",
          tags: ["private", "hidden"],
        },
      ],
      background: [],
    },
    perception: {
      playerAwarenessHints: ["A public sign points toward the market tea row."],
      actorAwareness: {},
      forbiddenActorLabels: ["Hidden Tea Broker"],
    },
    recentEvents: [
      {
        id: "event-public-tea-route",
        tick: 89,
        summary: "A courier clerk mentioned that tea vendors usually stand along Tea Row.",
        source: "location_recent_event",
        actorIds: [clerkId],
        perceivableByPlayer: true,
      },
      {
        id: "event-hidden-tea-vault",
        tick: 89,
        summary: "Hidden Tea Broker reserved the private vault route.",
        source: "location_recent_event",
        actorIds: [hiddenBrokerId],
        perceivableByPlayer: false,
      },
    ],
    targetCandidates: [
      {
        id: "actor:courier-clerk",
        actorId: clerkId,
        type: "actor",
        label: "Courier Clerk",
        awareness: "clear",
        tags: ["courier", "route", "service"],
      },
      {
        id: "item:market-route-sign",
        itemId: "item-market-route-sign",
        type: "item",
        label: "Market Route Sign",
        locationId: "loc-canal-market",
        tags: ["route", "public", "market"],
      },
    ],
    movementCandidates: [
      {
        id: "route-market-tea-row",
        locationId: "loc-tea-row",
        label: "Tea Row",
        connected: true,
        travelCost: 1,
        path: ["Canal Market", "Tea Row"],
      },
    ],
    deferredHooks: [],
    allowedTools: [
      "list_navigation_options",
      "find_location_candidates",
      "find_poi_candidates",
      "inspect_known_fact",
      "check_route",
      "move_actor",
      "create_minor_poi",
      "start_search",
      "record_player_intent",
    ],
    oracle: null,
  };
}

function createContext() {
  const context = createPlayerTurnToolExecutionContext(createTouristCourierFrame());
  context.authority = {
    baseWorldVersion: 90,
    sourceEntity: { type: "player", id: playerId },
    elapsedWorldTimeMinutes: 1,
  };
  context.bridgeLookup?.playerKnownFacts.push({
    id: "knowledge:public-tea-route",
    summary: "reported: Tea Row is a public market route with ordinary tea service.",
    visibilityRoute: "player_known",
    confidence: 0.8,
    sourceRefs: ["event-public-tea-route", "item-market-route-sign"],
  });
  return context;
}

const parserLikeClarification: Extract<GmRead, { path: "clarification" }> = {
  version: "gm-read.v1",
  situationSummary: "The tourist courier wants to continue and find tea.",
  sceneQuestion: "Which backend route should be used?",
  focalActorRefs: ["Tourist Courier"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "follow a logical route and look for a tea stall",
    targetRefs: [],
  },
  path: "clarification",
  clarificationPrompt: "Which connected location should I use for that route?",
  rationale: "The player did not provide an exact route id.",
  evidenceRefs: ["Tourist Courier"],
  narrationGuardrails: ["Do not narrate movement or a tea stall before tool results."],
};

const repairedToolPlan: GmRead = {
  version: "gm-read.v1",
  situationSummary: "The tourist courier wants to continue and find tea.",
  sceneQuestion: "How can legal bridge tools ground the market route and tea search?",
  focalActorRefs: ["Tourist Courier"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "follow the obvious public market route and look for tea",
    targetRefs: ["Tea Row", "knowledge:public-tea-route"],
  },
  path: "tool_plan",
  turnIntent:
    "Use lookup tools to ground the public route and tea-service affordance, then use state tools for movement, search, or a constrained minor POI.",
  rationale: "The intent is understandable, local, public, low-risk, and supported by bridge candidates.",
  evidenceRefs: ["Tourist Courier", "Tea Row", "knowledge:public-tea-route"],
  narrationGuardrails: [
    "Narrate only successful move_actor, create_minor_poi, start_search results, or visible public facts.",
  ],
};

function runDeterministicBridgeLedger(): ToolLedgerStep[] {
  const context = createContext();
  const ledger: ToolLedgerStep[] = [];
  const push = (
    toolName: string,
    success: boolean,
    mutation: ToolLedgerStep["mutation"],
    evidenceRefs: string[],
  ) => {
    ledger.push({ order: ledger.length + 1, toolName, success, mutation, evidenceRefs });
  };

  const navigation = executeBridgeCandidateTool("list_navigation_options", {}, context);
  push("list_navigation_options", navigation.success, "none", ["route-market-tea-row"]);

  const location = executeBridgeCandidateTool(
    "find_location_candidates",
    { query: "logical route Tea Row", tags: ["route"], maxResults: 3 },
    context,
  );
  push("find_location_candidates", location.success, "none", ["route-market-tea-row"]);

  const knownFact = executeBridgeCandidateTool(
    "inspect_known_fact",
    { query: "public tea service", maxResults: 2 },
    context,
  );
  push("inspect_known_fact", knownFact.success, "none", ["knowledge:public-tea-route"]);

  const hiddenFact = executeBridgeCandidateTool(
    "inspect_known_fact",
    { query: "vault broker", maxResults: 2 },
    context,
  );
  expect(hiddenFact.success).toBe(false);
  expect(context.authority?.baseWorldVersion).toBe(90);
  expect(JSON.stringify(hiddenFact)).not.toContain("Hidden Tea Broker");
  expect(JSON.stringify(hiddenFact)).not.toContain("private vault");

  const poi = executeBridgeCandidateTool(
    "find_poi_candidates",
    { query: "чайная лавка", includePotential: true, maxResults: 3 },
    context,
  );
  push("find_poi_candidates", poi.success, "none", ["potential:loc-canal-market"]);

  const route = executeBridgeCandidateTool(
    "check_route",
    { actorRef: "Tourist Courier", destinationRef: "Tea Row", mode: "walk" },
    context,
  );
  push("check_route", route.success, "none", ["route-market-tea-row"]);

  const move = prepareMoveActorInput({
    actorRef: "Tourist Courier",
    destinationRef: "Tea Row",
    routeId: "route-market-tea-row",
    evidenceRefs: ["route-market-tea-row"],
    intentSummary: exactInput,
  }, context);
  expect(move.ok).toBe(true);
  push("move_actor", move.ok, "validated", ["route-market-tea-row"]);

  const minorPoi = prepareCreateMinorPoiInput({
    areaRef: "current_location",
    poiType: "tea_stall",
    name: "Lantern Tea Stall",
    visibility: "public",
    persistence: "scene_local",
    reason: "The public market route supports an ordinary tea stall.",
  }, context);
  expect(minorPoi.ok).toBe(true);
  push("create_minor_poi", minorPoi.ok, "validated", ["knowledge:public-tea-route"]);

  const searchInput = runtimeToolInputSchemas.start_search.parse({
    actorRef: "Tourist Courier",
    query: "чайная лавка",
    scope: "current_location",
    method: "browse",
    intentSummary: exactInput,
  });
  const search = buildStartSearchResult(searchInput, context);
  expect(search.ok).toBe(true);
  push("start_search", search.ok, "validated", ["create_minor_poi:Lantern Tea Stall"]);

  return ledger;
}

function createCanonicalTurnPacket(): CanonicalTurnPacket {
  return {
    campaignId: "campaign-90-04",
    tick: 91,
    playerAction: exactInput,
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId: "event-player-action",
      eventIds: ["event-player-action"],
      responseIds: [],
      actionIds: ["action-move", "action-poi", "action-search"],
      toolResultRefs: [
        { actionId: "action-move", toolName: "move_actor" },
        { actionId: "action-poi", toolName: "create_minor_poi" },
        { actionId: "action-search", toolName: "start_search" },
      ],
    },
    anchorEvent: {
      id: "event-player-action",
      actorId: playerId,
      kind: "player_action",
      summary: "Tourist Courier asks to follow the logical route and look for a tea stall.",
      perceivableByPlayer: true,
    },
    events: [],
    responses: [],
    effects: [
      {
        id: "effect-failed-hidden",
        actionId: "action-hidden",
        actorId: playerId,
        toolName: "create_minor_poi",
        summary: "Hidden Tea Broker opens a private vault tea room.",
        perceivableByPlayer: true,
        toolResult: {
          success: false,
          error: "unsupported_action_claim",
          result: { denied: true },
        },
      },
    ],
    actionResults: [
      {
        order: 1,
        actionId: "action-move",
        actionRef: "move_actor",
        actorId: playerId,
        toolName: "move_actor",
        input: {
          actorRef: "Tourist Courier",
          destinationRef: "Tea Row",
        },
        args: {},
        result: {
          success: true,
          result: {
            actorRef: "Tourist Courier",
            locationName: "Tea Row",
            routeEvidenceRefs: ["route-market-tea-row"],
          },
        },
      },
      {
        order: 2,
        actionId: "action-poi",
        actionRef: "create_minor_poi",
        actorId: playerId,
        toolName: "create_minor_poi",
        input: {
          areaRef: "current_location",
          poiType: "tea_stall",
          name: "Lantern Tea Stall",
        },
        args: {},
        result: {
          success: true,
          result: {
            name: "Lantern Tea Stall",
            connectedTo: "Canal Market",
            poiType: "tea_stall",
          },
        },
      },
      {
        order: 3,
        actionId: "action-search",
        actionRef: "start_search",
        actorId: playerId,
        toolName: "start_search",
        input: {
          actorRef: "Tourist Courier",
          query: "чайная лавка",
        },
        args: {},
        result: {
          success: true,
          result: {
            actorRef: "Tourist Courier",
            query: "чайная лавка",
            targetTruth: "unconfirmed",
            found: false,
            discoveryCreated: false,
          },
        },
      },
      {
        order: 4,
        actionId: "action-hidden",
        actionRef: "create_minor_poi",
        actorId: playerId,
        toolName: "create_minor_poi",
        input: { name: "Hidden Tea Vault" },
        args: {},
        result: {
          success: false,
          error: "unsupported_action_claim",
          result: { denied: true },
        },
      },
    ],
    guardrails: [
      "Mention movement, route, tea stall, and search only from successful tool results or visible facts.",
    ],
    controlReturnReason: "Return control after the route and tea search are grounded.",
  };
}

describe("Phase 90 tourist/courier bridge acceptance", () => {
  it("repairs parser-like exact-ID clarification before any player-visible output", () => {
    const frame = createTouristCourierFrame();
    const review = classifyClarificationReview({
      playerAction: exactInput,
      frame,
      gmRead: parserLikeClarification,
    });
    const visibleGmRead = review.repaired ? repairedToolPlan : parserLikeClarification;

    expect(review).toMatchObject({
      reviewed: true,
      repaired: true,
      reason: "bridgeable_parser_like_clarification",
      parserLikePattern: "connected_location",
    });
    expect(visibleGmRead.path).toBe("tool_plan");
    expect(JSON.stringify(visibleGmRead)).not.toMatch(/connected location|exact route id|backend route/i);
  });

  it("runs the deterministic route, POI, known-fact, route-check, move, and minor-POI bridge sequence", () => {
    const ledger = runDeterministicBridgeLedger();

    expect(ledger.map((step) => step.toolName)).toEqual([
      "list_navigation_options",
      "find_location_candidates",
      "inspect_known_fact",
      "find_poi_candidates",
      "check_route",
      "move_actor",
      "create_minor_poi",
      "start_search",
    ]);
    expect(ledger.every((step) => step.success)).toBe(true);
    expect(ledger.filter((step) => step.mutation === "validated").map((step) => step.toolName))
      .toEqual(["move_actor", "create_minor_poi", "start_search"]);
  });

  it("keeps player-facing route narration backed by successful tool results and visible facts", () => {
    const packet = buildNarratorPacket({
      frame: createTouristCourierFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
      forbiddenPrivateTerms: ["Hidden Tea Vault", "private vault tea room"],
    });
    const playerPacket = buildPlayerFacingPacketFromNarratorPacket(packet);
    const formatted = formatPlayerFacingPacketForPrompt(playerPacket);

    expect(formatted).toContain("Tourist Courier moves to Tea Row");
    expect(formatted).toContain("Lantern Tea Stall becomes reachable from Canal Market");
    expect(formatted).toContain("starts searching for чайная лавка; no discovery is confirmed");
    expect(formatted).toContain("perceivable_effect:action-result:action-move");
    expect(formatted).toContain("perceivable_effect:action-result:action-poi");
    expect(formatted).not.toContain("Hidden Tea Broker");
    expect(formatted).not.toContain("Hidden Tea Vault");
    expect(formatted).not.toContain("private vault tea room");
  });

  it("keeps observation-only lookup results out of visible settled consequences", () => {
    const packet = buildNarratorPacket({
      frame: createTouristCourierFrame(),
      canonicalTurnPacket: {
        campaignId: "campaign-90-04",
        tick: 91,
        playerAction: exactInput,
        oracleOutcome: null,
        narratorFacts: {
          anchorEventId: "event-player-action",
          eventIds: ["event-player-action"],
          responseIds: [],
          actionIds: ["action-lookup"],
          toolResultRefs: [
            { actionId: "action-lookup", toolName: "list_navigation_options" },
          ],
        },
        anchorEvent: {
          id: "event-player-action",
          actorId: playerId,
          kind: "player_action",
          summary: "Tourist Courier looks for the public tea route.",
          perceivableByPlayer: true,
        },
        events: [],
        responses: [],
        effects: [],
        actionResults: [
          {
            order: 1,
            actionId: "action-lookup",
            actionRef: "lookup-navigation",
            actorId: playerId,
            toolName: "list_navigation_options",
            input: {},
            args: {},
            result: {
              success: true,
              kind: "observation",
              observationOnly: true,
              result: { candidates: [{ label: "Tea Row" }] },
            },
          },
        ],
        guardrails: [],
        controlReturnReason: "Return after internal lookup.",
      },
    });
    const formatted = formatPlayerFacingPacketForPrompt(
      buildPlayerFacingPacketFromNarratorPacket(packet),
    );

    expect(packet.perceivableEffects).toEqual([]);
    expect(formatted).not.toContain("validated list navigation options consequence settles");
    expect(formatted).not.toContain("Tea Row");
  });

  it("round-trips state-bearing bridge actions through the strict ScenePlan schema", () => {
    const plan = scenePlanSchema.parse({
      actionInterpretation: {
        actorId: playerId,
        intent: "follow the legal route and make the tea stall playable",
        method: "tool_plan",
        targetIds: [],
      },
      anchorEvent: {
        id: "44444444-4444-4444-8444-444444444441",
        actorId: playerId,
        subjectIds: [],
        kind: "player_action",
      },
      primaryResponse: {
        id: "44444444-4444-4444-8444-444444444442",
        actorId: playerId,
        responseKind: "environment",
        eventId: "44444444-4444-4444-8444-444444444441",
        visibleToPlayer: true,
      },
      supportResponses: [],
      plannedActions: [
        {
          id: "44444444-4444-4444-8444-444444444443",
          actorId: playerId,
          toolName: "move_actor",
          input: {
            actorRef: "Tourist Courier",
            destinationRef: "Tea Row",
            evidenceRefs: ["route-market-tea-row"],
          },
        },
        {
          id: "44444444-4444-4444-8444-444444444444",
          actorId: playerId,
          toolName: "create_minor_poi",
          input: {
            areaRef: "current_location",
            poiType: "tea_stall",
            name: "Lantern Tea Stall",
            reason: "The public market route supports ordinary tea service.",
          },
        },
      ],
      deferredHooks: [],
      narratorFacts: {
        anchorEventId: "44444444-4444-4444-8444-444444444441",
        eventIds: ["44444444-4444-4444-8444-444444444441"],
        responseIds: ["44444444-4444-4444-8444-444444444442"],
        actionIds: [
          "44444444-4444-4444-8444-444444444443",
          "44444444-4444-4444-8444-444444444444",
        ],
        toolResultRefs: [
          {
            actionId: "44444444-4444-4444-8444-444444444443",
            toolName: "move_actor",
          },
          {
            actionId: "44444444-4444-4444-8444-444444444444",
            toolName: "create_minor_poi",
          },
        ],
      },
      hiddenRationale: "State-bearing bridge tools are schema-modeled explicitly.",
    });

    expect(plan.plannedActions.map((action) => action.toolName)).toEqual([
      "move_actor",
      "create_minor_poi",
    ]);
    expect(scenePlanSchema.safeParse({
      ...plan,
      plannedActions: [
        {
          id: "44444444-4444-4444-8444-444444444445",
          actorId: playerId,
          toolName: "list_navigation_options",
          input: {},
        },
      ],
    }).success).toBe(false);
  });
});
