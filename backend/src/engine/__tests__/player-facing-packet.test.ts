import { describe, expect, it } from "vitest";

import type { NarratorPacket } from "../narrator-packet.js";
import {
  buildPlayerFacingPacketFromNarratorPacket,
  formatPlayerFacingPacketForPrompt,
  PlayerFacingPacketSafetyError,
} from "../player-facing-packet.js";

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

describe("PlayerFacingPacket", () => {
  it("formats only committed player-visible truth and omits raw canonical packet data", () => {
    const packet = buildPlayerFacingPacketFromNarratorPacket(createNarratorPacket());
    const formatted = formatPlayerFacingPacketForPrompt(packet);

    expect(formatted).toContain("[PLAYER-FACING PACKET]");
    expect(formatted).toContain("[NARRATOR PACKET]");
    expect(formatted).toContain("The depot queue grows restless.");
    expect(formatted).toContain("Paper clicks once behind the ledger wall.");
    expect(formatted).toContain("[CONTEXT BUDGET TRACE]");
    expect(formatted).not.toContain("Hidden Auditor");
    expect(formatted).not.toContain(`hidden-actor:${hiddenNpcId}`);
    expect(formatted).not.toContain("Forest Outpost");
    expect(formatted).not.toContain("canonicalTurnPacket");
    expect(packet.audit.canonicalTurnPacketOmitted).toBe(true);
    expect(packet.audit.hiddenExcludedCount).toBeGreaterThanOrEqual(6);
    expect(packet.contextBudgetTrace.didClipModelOutput).toBe(false);
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
});
