import { describe, expect, it } from "vitest";

import {
  buildNarratorPacket,
  type CanonicalTurnPacket,
  type NarratorPacket,
} from "../narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
  PlayerFacingPacketSafetyError,
} from "../player-facing-packet.js";
import type { SceneFrame } from "../scene-frame.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const visibleNpcId = "22222222-2222-4222-8222-222222222222";
const hiddenNpcId = "33333333-3333-4333-8333-333333333333";

function createNarratorPacket(): NarratorPacket {
  return {
    campaignId: "campaign-1",
    tick: 12,
    playerAction: "I wait by the depot counter.",
    oracleOutcome: "weak_hit",
    anchorEvent: {
      id: "event-player",
      actorId: playerId,
      kind: "player_action",
      summary: "Mira waits by the depot counter.",
      perceivableByPlayer: true,
    },
    perceivableEvents: [
      {
        id: "event-player",
        actorId: playerId,
        kind: "player_action",
        summary: "Mira waits by the depot counter.",
        perceivableByPlayer: true,
      },
    ],
    perceivableResponses: [
      {
        id: "response-visible",
        actorId: visibleNpcId,
        responseKind: "spoken",
        eventId: "event-player",
        summary: "The clerk says the last route stamp is missing.",
        visibleToPlayer: true,
      },
    ],
    perceivableEffects: [
      {
        id: "effect-visible",
        actorId: visibleNpcId,
        actionId: "action-visible",
        toolName: "log_event",
        summary: "The depot queue grows restless.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { eventId: "event-visible" } },
      },
    ],
    visibleActors: [
      { id: playerId, label: "Mira", type: "player" },
      { id: visibleNpcId, label: "Depot Clerk", type: "npc" },
    ],
    hintSignals: ["Paper clicks once behind the ledger wall."],
    guardrails: ["Keep unseen identities unnamed."],
    controlReturnReason: "Return control after the clerk's reply.",
    allowedVisibleActorNames: ["Mira", "Depot Clerk"],
    forbiddenActorNames: ["Hidden Auditor"],
    forbiddenFactMarkers: [`hidden-actor:${hiddenNpcId}`],
    forbiddenPrivateTerms: ["Forest Outpost"],
    canonicalTurnPacket: {
      campaignId: "campaign-1",
      tick: 12,
      playerAction: "I wait by the depot counter.",
      oracleOutcome: "weak_hit",
      narratorFacts: {
        anchorEventId: "event-player",
        eventIds: ["event-player"],
        responseIds: ["response-visible"],
        actionIds: ["action-visible"],
        toolResultRefs: [{ actionId: "action-visible", toolName: "log_event" }],
      },
      anchorEvent: {
        id: "event-player",
        actorId: playerId,
        kind: "player_action",
        summary: "Mira waits by the depot counter.",
        perceivableByPlayer: true,
      },
      events: [
        {
          id: "event-hidden",
          actorId: hiddenNpcId,
          kind: "environment",
          summary: "Forest Outpost reports a private offscreen alarm.",
          perceivableByPlayer: false,
        },
      ],
      responses: [
        {
          id: "response-hidden",
          actorId: hiddenNpcId,
          responseKind: "system",
          eventId: "event-hidden",
          summary: "Hidden Auditor signs a sealed warrant.",
          visibleToPlayer: false,
        },
      ],
      effects: [
        {
          id: "effect-hidden",
          actorId: hiddenNpcId,
          summary: "Forest Outpost changes watch rotation.",
          perceivableByPlayer: false,
        },
      ],
      actionResults: [],
      guardrails: ["Keep unseen identities unnamed."],
      controlReturnReason: "Return control after the clerk's reply.",
    },
  };
}

function createBridgeFrame(): SceneFrame {
  return {
    campaignId: "campaign-90-04",
    tick: 90,
    playerActorId: playerId,
    currentLocationId: "loc-canal-market",
    currentSceneScopeId: "scene-courier-counter",
    currentLocationName: "Canal Market",
    currentSceneScopeName: "Courier Counter",
    playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player" as const,
          label: "Tourist Courier",
          locationId: "loc-canal-market",
          sceneScopeId: "scene-courier-counter",
          awareness: "clear" as const,
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: ["A public market sign points toward Tea Row."],
      actorAwareness: {},
      forbiddenActorLabels: ["Hidden Tea Broker"],
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [
      {
        id: "route-market-tea-row",
        locationId: "loc-tea-row",
        label: "Tea Row",
        connected: true,
        travelCost: 1,
      },
    ],
    deferredHooks: [],
    allowedTools: ["move_actor", "create_minor_poi", "start_search"],
    oracle: null,
  };
}

function createBridgeCanonicalTurnPacket(): CanonicalTurnPacket {
  return {
    campaignId: "campaign-90-04",
    tick: 91,
    playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId: "event-player-action",
      eventIds: ["event-player-action"],
      responseIds: [],
      actionIds: ["action-move", "action-poi", "action-search", "action-hidden"],
      toolResultRefs: [
        { actionId: "action-move", toolName: "move_actor" },
        { actionId: "action-poi", toolName: "create_minor_poi" },
        { actionId: "action-search", toolName: "start_search" },
        { actionId: "action-hidden", toolName: "create_minor_poi" },
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
        id: "effect-hidden",
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
      "Only mention movement, tea stall, route, or search from successful tool results.",
    ],
    controlReturnReason: "Return control after grounded route and tea search setup.",
  };
}

describe("PlayerFacingPacket", () => {
  it("formats only committed player-visible truth and omits raw canonical packet data", () => {
    const packet = buildPlayerFacingPacketFromNarratorPacket(createNarratorPacket());
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(formatted).toContain("[PLAYER-FACING PACKET]");
    expect(formatted).toContain("[NARRATOR PACKET]");
    expect(formatted).toContain("The depot queue grows restless.");
    expect(formatted).toContain("Paper clicks once behind the ledger wall.");
    expect(formatted).toContain("[CONTEXT BUDGET TRACE]");
    expect(formatted).not.toContain("tool=log_event");
    expect(formatted).not.toContain("log_event");
    expect(formatted).not.toContain("Hidden Auditor");
    expect(formatted).not.toContain(`hidden-actor:${hiddenNpcId}`);
    expect(formatted).not.toContain("Forest Outpost");
    expect(formatted).not.toContain("canonicalTurnPacket");
    expect(packet.audit.canonicalTurnPacketOmitted).toBe(true);
    expect(packet.audit.hiddenExcludedCount).toBeGreaterThanOrEqual(6);
    expect(packet.audit.redactionAudit.hiddenEventCount).toBe(1);
    expect(packet.audit.redactionAudit.hiddenResponseCount).toBe(1);
    expect(packet.audit.redactionAudit.hiddenEffectCount).toBe(1);
    expect(formatted).toContain("[REDACTION AUDIT]");
    expect(formatted).toContain("hiddenEventCount: 1");
    expect(packet.contextBudgetTrace.didClipModelOutput).toBe(false);
  });

  it("can omit diagnostic-only packet sections for compact final narration prompts", () => {
    const packet = buildPlayerFacingPacketFromNarratorPacket(createNarratorPacket());
    const formatted = formatPlayerFacingPacketForPrompt(packet, {
      includeDiagnostics: false,
      includeTechnicalRefs: false,
    });

    expect(formatted).toContain("The depot queue grows restless.");
    expect(formatted).toContain("[CONTROL RETURN]");
    expect(formatted).toContain("Player attempted:");
    expect(formatted).not.toContain("Player action request:");
    expect(formatted).not.toContain("Campaign: campaign-1");
    expect(formatted).not.toContain("Tick:");
    expect(formatted).not.toContain("Anchor event:");
    expect(formatted).not.toContain("actor=");
    expect(formatted).not.toContain("action=");
    expect(formatted).not.toContain("kind=");
    expect(formatted).not.toContain(hiddenNpcId);
    expect(formatted).not.toContain("[VISIBLE SOURCE IDS -- DIAGNOSTIC, DO NOT USE AS evidenceRefs]");
    expect(formatted).not.toContain("[SOURCE-LINKED SUMMARIES]");
    expect(formatted).not.toContain("[REDACTION AUDIT]");
    expect(formatted).not.toContain("[CONTEXT BUDGET TRACE]");
  });

  it("formats current inventory status as player-facing source without exposing raw canonical data", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.currentInventory = [
      {
        id: "current-inventory:item-logbook",
        itemId: "item-logbook",
        label: "Courier Route Logbook",
        tags: ["document", "reviewed"],
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
      },
    ];
    narratorPacket.evidenceLedger = [
      ...(narratorPacket.evidenceLedger ?? []),
      {
        id: "current_inventory_status:item-logbook",
        category: "current_inventory_status",
        summary:
          "Courier Route Logbook is currently carried by the player. Item tags/state: document, reviewed.",
        sourceId: "item-logbook",
      },
    ];

    const packet = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(packet.sourceRefs).toContainEqual({
      id: "item-logbook",
      kind: "current_inventory_status",
    });
    expect(formatted).toContain("[CURRENT INVENTORY STATUS]");
    expect(formatted).toContain(
      "Courier Route Logbook is currently carried by the player. Item tags/state: document, reviewed.",
    );
    expect(formatted).not.toContain("canonicalTurnPacket");
  });

  it("fails closed if a forbidden private term enters visible packet prose", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.perceivableEffects[0] = {
      ...narratorPacket.perceivableEffects[0]!,
      summary: "Forest Outpost becomes visible from the depot window.",
    };

    expect(() => buildPlayerFacingPacketFromNarratorPacket(narratorPacket)).toThrow(
      PlayerFacingPacketSafetyError,
    );
  });

  it("allows a same-turn visible scene-extra label that also appears in forbidden actor names", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.playerAction = "I ask the Exchange Validation Clerk to cite the rule.";
    narratorPacket.forbiddenActorNames = ["Exchange Validation Clerk"];
    narratorPacket.visibleActors = [
      ...narratorPacket.visibleActors,
      { id: "actor-exchange-clerk", label: "Exchange Validation Clerk", type: "npc" },
    ];
    narratorPacket.perceivableEffects[0] = {
      id: "action-result:create-clerk",
      actorId: playerId,
      actionId: "create-clerk",
      toolName: "create_scene_extra",
      summary: "Exchange Validation Clerk becomes visibly present in the scene.",
      perceivableByPlayer: true,
      toolResult: {
        success: true,
        result: {
          id: "actor-exchange-clerk",
          name: "Exchange Validation Clerk",
        },
      },
    };
    narratorPacket.canonicalTurnPacket = {
      ...narratorPacket.canonicalTurnPacket,
      playerAction: narratorPacket.playerAction,
      narratorFacts: {
        ...narratorPacket.canonicalTurnPacket.narratorFacts,
        actionIds: ["create-clerk"],
        toolResultRefs: [{ actionId: "create-clerk", toolName: "create_scene_extra" }],
      },
      actionResults: [
        {
          order: 1,
          actionId: "create-clerk",
          actionRef: "tool-call-1",
          actorId: playerId,
          toolName: "create_scene_extra",
          input: { name: "Exchange Validation Clerk" },
          args: { name: "Exchange Validation Clerk" },
          result: {
            success: true,
            result: {
              id: "actor-exchange-clerk",
              name: "Exchange Validation Clerk",
            },
          },
          summary: "Exchange Validation Clerk becomes visibly present in the scene.",
        },
      ],
    };

    const packet = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(packet.committedVisibleActorCreationLabels).toContain("Exchange Validation Clerk");
    expect(formatted).toContain("Exchange Validation Clerk becomes visibly present in the scene.");
  });

  it("rejects same-turn visible scene-extra label substrings", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.forbiddenActorNames = ["Validation Clerk"];
    narratorPacket.visibleActors = [
      ...narratorPacket.visibleActors,
      { id: "actor-exchange-clerk", label: "Exchange Validation Clerk", type: "npc" },
    ];
    narratorPacket.perceivableEffects[0] = {
      id: "action-result:create-clerk",
      actorId: playerId,
      actionId: "create-clerk",
      toolName: "create_scene_extra",
      summary: "Exchange Validation Clerk becomes visibly present in the scene.",
      perceivableByPlayer: true,
      toolResult: {
        success: true,
        result: {
          id: "actor-exchange-clerk",
          name: "Exchange Validation Clerk",
        },
      },
    };
    narratorPacket.canonicalTurnPacket = {
      ...narratorPacket.canonicalTurnPacket,
      narratorFacts: {
        ...narratorPacket.canonicalTurnPacket.narratorFacts,
        actionIds: ["create-clerk"],
        toolResultRefs: [{ actionId: "create-clerk", toolName: "create_scene_extra" }],
      },
      actionResults: [
        {
          order: 1,
          actionId: "create-clerk",
          actionRef: "tool-call-1",
          actorId: playerId,
          toolName: "create_scene_extra",
          input: { name: "Exchange Validation Clerk" },
          args: { name: "Exchange Validation Clerk" },
          result: {
            success: true,
            result: {
              id: "actor-exchange-clerk",
              name: "Exchange Validation Clerk",
            },
          },
          summary: "Exchange Validation Clerk becomes visibly present in the scene.",
        },
      ],
    };

    expect(() => buildPlayerFacingPacketFromNarratorPacket(narratorPacket)).toThrow(
      PlayerFacingPacketSafetyError,
    );
  });

  it("rejects forbidden private terms embedded in same-turn visible actor labels", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.forbiddenActorNames = ["Forest Outpost Clerk"];
    narratorPacket.forbiddenPrivateTerms = ["Forest Outpost"];
    narratorPacket.visibleActors = [
      ...narratorPacket.visibleActors,
      { id: "actor-forest-clerk", label: "Forest Outpost Clerk", type: "npc" },
    ];
    narratorPacket.perceivableEffects[0] = {
      id: "action-result:create-clerk",
      actorId: playerId,
      actionId: "create-clerk",
      toolName: "create_scene_extra",
      summary: "Forest Outpost Clerk becomes visibly present in the scene.",
      perceivableByPlayer: true,
      toolResult: {
        success: true,
        result: {
          id: "actor-forest-clerk",
          name: "Forest Outpost Clerk",
        },
      },
    };
    narratorPacket.canonicalTurnPacket = {
      ...narratorPacket.canonicalTurnPacket,
      narratorFacts: {
        ...narratorPacket.canonicalTurnPacket.narratorFacts,
        actionIds: ["create-clerk"],
        toolResultRefs: [{ actionId: "create-clerk", toolName: "create_scene_extra" }],
      },
      actionResults: [
        {
          order: 1,
          actionId: "create-clerk",
          actionRef: "tool-call-1",
          actorId: playerId,
          toolName: "create_scene_extra",
          input: { name: "Forest Outpost Clerk" },
          args: { name: "Forest Outpost Clerk" },
          result: {
            success: true,
            result: {
              id: "actor-forest-clerk",
              name: "Forest Outpost Clerk",
            },
          },
          summary: "Forest Outpost Clerk becomes visibly present in the scene.",
        },
      ],
    };

    expect(() => buildPlayerFacingPacketFromNarratorPacket(narratorPacket)).toThrow(
      PlayerFacingPacketSafetyError,
    );
  });

  it("allows forbidden private names only when they remain player-sourced claims", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.playerAction = "I claim Hidden Auditor personally authorized me.";
    narratorPacket.anchorEvent = {
      ...narratorPacket.anchorEvent,
      summary: "Player action request: I claim Hidden Auditor personally authorized me.",
    };
    narratorPacket.perceivableEvents[0] = {
      ...narratorPacket.perceivableEvents[0]!,
      summary: "Player action request: I claim Hidden Auditor personally authorized me.",
    };
    narratorPacket.canonicalTurnPacket = {
      ...narratorPacket.canonicalTurnPacket,
      playerAction: narratorPacket.playerAction,
      anchorEvent: narratorPacket.anchorEvent,
      events: [narratorPacket.perceivableEvents[0]!],
    };

    const packet = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(formatted).toContain("I claim Hidden Auditor personally authorized me.");
    expect(formatted).toContain("player-supplied claims");

    packet.perceivableEffects[0] = {
      ...packet.perceivableEffects[0]!,
      toolName: "log_event",
      summary: "Mira claimed Hidden Auditor personally authorized her; no proof was confirmed.",
    };
    const claimEcho = formatPlayerFacingPacketForPrompt(packet);
    expect(claimEcho).toContain("Mira claimed Hidden Auditor personally authorized her");

    packet.perceivableEffects[0] = {
      ...packet.perceivableEffects[0]!,
      summary: "Hidden Auditor appears from a private office.",
    };
    expect(() => formatPlayerFacingPacketForPrompt(packet)).toThrow(
      PlayerFacingPacketSafetyError,
    );
  });

  it("allows record_player_intent to echo an unconfirmed player claim without making it truth", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.playerAction = "I claim Hidden Auditor gave me a courier seal.";
    narratorPacket.perceivableEffects[0] = {
      ...narratorPacket.perceivableEffects[0]!,
      toolName: "record_player_intent",
      summary: "Mira records an unconfirmed claim about Hidden Auditor.",
      toolResult: {
        success: true,
        result: {
          kind: "player_intent_recorded",
          targetHint: "Hidden Auditor",
          claimTruth: "unconfirmed",
          proofCreated: false,
        },
      },
    };

    const packet = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(formatted).toContain("unconfirmed claim about Hidden Auditor");
    expect(formatted).not.toContain("gave Mira a courier seal");
  });

  it("surfaces tourist route bridge facts only from successful tool results", () => {
    const narratorPacket = buildNarratorPacket({
      frame: createBridgeFrame(),
      canonicalTurnPacket: createBridgeCanonicalTurnPacket(),
      forbiddenPrivateTerms: ["Hidden Tea Vault", "private vault tea room"],
    });
    const packet = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(formatted).toContain("Tourist Courier moves to Tea Row");
    expect(formatted).toContain("Lantern Tea Stall becomes reachable from Canal Market");
    expect(formatted).toContain("starts searching for чайная лавка; no discovery is confirmed");
    expect(formatted).toContain("perceivable_effect:action-result:action-move");
    expect(formatted).toContain("perceivable_effect:action-result:action-poi");
    expect(formatted).toContain("perceivable_effect:action-result:action-search");
    expect(formatted).not.toContain("Hidden Tea Broker");
    expect(formatted).not.toContain("Hidden Tea Vault");
    expect(formatted).not.toContain("private vault tea room");
  });

  it("records source-linked overflow summaries without clipping visible narration output", () => {
    const narratorPacket = createNarratorPacket();
    narratorPacket.perceivableResponses = Array.from({ length: 42 }, (_, index) => ({
      id: `response-visible-${index + 1}`,
      actorId: visibleNpcId,
      responseKind: "spoken",
      eventId: "event-player",
      summary: `Visible depot response ${index + 1} stays source linked.`,
      visibleToPlayer: true,
    }));

    const packet = buildPlayerFacingPacketFromNarratorPacket(narratorPacket);
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(packet.contextBudgetTrace.summarizedItemCount).toBeGreaterThan(0);
    expect(packet.contextBudgetTrace.sourceLinkedSummaryCount).toBeGreaterThan(0);
    expect(packet.contextBudgetTrace.overflowWarnings.map((warning) => warning.code)).toContain(
      "items_summarized_by_budget",
    );
    expect(packet.contextBudgetTrace.didClipModelOutput).toBe(false);
    expect(formatted).toContain("[SOURCE-LINKED SUMMARIES]");
    expect(formatted).toContain("additional player-facing packet records summarized for budget");
    expect(formatted).toContain("didClipModelOutput: false");
    expect(formatted).not.toContain("truncateToFit");
    expect(formatted).not.toContain("sanitizeNarrative");
  });
});
