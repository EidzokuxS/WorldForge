import { describe, expect, it } from "vitest";

import {
  buildNarratorPacket,
  formatNarratorPacketForPrompt,
  summarizeRuntimeToolResultForNarrator,
  type CanonicalTurnPacket,
} from "../narrator-packet.js";
import type { SceneFrame } from "../scene-frame.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const visibleNpcId = "22222222-2222-4222-8222-222222222222";
const locationId = "33333333-3333-4333-8333-333333333333";
const anchorEventId = "44444444-4444-4444-8444-444444444444";
const responseId = "55555555-5555-4555-8555-555555555555";
const successfulActionId = "66666666-6666-4666-8666-666666666666";
const failedActionId = "77777777-7777-4777-8777-777777777777";
const unreferencedActionId = "88888888-8888-4888-8888-888888888888";
const secondActionId = "99999999-9999-4999-8999-999999999999";
const thirdActionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const fourthActionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const fifthActionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 12,
    playerActorId: playerId,
    currentLocationId: locationId,
    currentSceneScopeId: locationId,
    playerAction: "I test the locked side door.",
    roster: {
      active: [
        {
          id: playerId,
          type: "player",
          label: "Iria",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
        {
          id: visibleNpcId,
          type: "npc",
          label: "Mira",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
      forbiddenActorIds: [],
      forbiddenActorLabels: [],
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event"],
    oracle: null,
  };
}

function createCanonicalTurnPacket(): CanonicalTurnPacket {
  return {
    campaignId: "campaign-1",
    tick: 12,
    playerAction: "I test the locked side door.",
    oracleOutcome: null,
    narratorFacts: {
      anchorEventId,
      eventIds: [anchorEventId],
      responseIds: [responseId],
      actionIds: [successfulActionId],
      toolResultRefs: [{ actionId: successfulActionId, toolName: "log_event" }],
    },
    anchorEvent: {
      id: anchorEventId,
      actorId: playerId,
      kind: "player_action",
      summary: "Iria tests the locked side door.",
      perceivableByPlayer: true,
    },
    events: [
      {
        id: anchorEventId,
        actorId: playerId,
        kind: "player_action",
        summary: "Iria tests the locked side door.",
        perceivableByPlayer: true,
      },
    ],
    responses: [
      {
        id: responseId,
        actorId: visibleNpcId,
        responseKind: "gesture",
        eventId: anchorEventId,
        summary: "Mira watches the lock without stepping closer.",
        visibleToPlayer: true,
      },
    ],
    effects: [
      {
        id: "effect-success",
        actionId: successfulActionId,
        actorId: visibleNpcId,
        toolName: "log_event",
        summary: "The lock rattles but stays closed.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { eventId: successfulActionId } },
      },
      {
        id: "effect-failed",
        actionId: failedActionId,
        actorId: visibleNpcId,
        toolName: "log_event",
        summary: "FAILED SENTINEL: the side door opens onto a hidden tunnel.",
        perceivableByPlayer: true,
        toolResult: { success: false, error: "tool_failed" },
      },
      {
        id: "effect-unreferenced",
        actionId: unreferencedActionId,
        actorId: visibleNpcId,
        toolName: "log_event",
        summary: "SKIPPED SENTINEL: Mira finds a spare key.",
        perceivableByPlayer: true,
      },
    ],
    actionResults: [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-success",
        actorId: visibleNpcId,
        toolName: "log_event",
        input: {
          text: "The lock rattles but stays closed.",
          importance: 2,
          participants: ["Iria", "Mira"],
        },
        args: {
          text: "The lock rattles but stays closed.",
          importance: 2,
          participants: ["Iria", "Mira"],
        },
        result: { success: true, result: { eventId: successfulActionId } },
      },
    ],
    guardrails: ["Narrate only committed player-perceivable packet facts."],
    controlReturnReason: "Return control after the immediate lock check.",
  };
}

describe("narrator packet settlement boundary", () => {
  it("formats only narratorFacts-referenced successful effects and omits failed or skipped sentinels", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "The lock rattles but stays closed.",
    );
    expect(formatted).toContain("The lock rattles but stays closed.");
    expect(formatted).not.toContain("FAILED SENTINEL");
    expect(formatted).not.toContain("SKIPPED SENTINEL");
  });

  it("uses concrete successful log_event text when no explicit effect was authored", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults[0] = {
      ...canonicalTurnPacket.actionResults[0]!,
      input: {
        text: "The Gondolier names the Three-Lantern Marker and says it burns amber.",
        importance: 7,
        participants: ["Gondolier", "Iria"],
      },
      args: {
        text: "The Gondolier names the Three-Lantern Marker and says it burns amber.",
        importance: 7,
        participants: ["Gondolier", "Iria"],
      },
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "The Gondolier names the Three-Lantern Marker and says it burns amber.",
    );
    expect(formatted).toContain(
      "The Gondolier names the Three-Lantern Marker and says it burns amber.",
    );
    expect(formatted).not.toContain(`Committed log_event result ${successfulActionId}.`);
  });

  it("uses legacy log_event summary text when no explicit effect was authored", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults[0] = {
      ...canonicalTurnPacket.actionResults[0]!,
      input: {
        summary: "The bridge patrol lowers one spear but keeps the line tight.",
      },
      args: {
        summary: "The bridge patrol lowers one spear but keeps the line tight.",
      },
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "The bridge patrol lowers one spear but keeps the line tight.",
    );
  });

  it("materializes concrete successful runtime observations as settled narrator effects", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const acceptedActions: CanonicalTurnPacket["actionResults"] = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-log-event",
        actorId: visibleNpcId,
        toolName: "log_event",
        input: {
          text: "The dock clerk records the waxed-cloth manifest dispute as unresolved.",
          importance: 6,
          participants: ["Iria", "Mira"],
          durability: "durable",
          futureRelevance: "The manifest dispute can draw later inspection pressure.",
        },
        args: {
          text: "The dock clerk records the waxed-cloth manifest dispute as unresolved.",
          importance: 6,
          participants: ["Iria", "Mira"],
          durability: "durable",
          futureRelevance: "The manifest dispute can draw later inspection pressure.",
        },
        result: {
          success: true,
          result: { eventId: "event-manifest-dispute", durability: "durable", persisted: true },
        },
      },
      {
        order: 1,
        actionId: secondActionId,
        actionRef: "step-reveal-location",
        actorId: visibleNpcId,
        toolName: "reveal_location",
        input: {
          name: "loc-temp-uuid-only",
          description: "A narrow stair recessed behind ledger shelves.",
          tags: ["route", "local"],
          connectedToName: "current_scene",
        },
        args: {
          name: "loc-temp-uuid-only",
          description: "A narrow stair recessed behind ledger shelves.",
          tags: ["route", "local"],
          connectedToName: "current_scene",
        },
        result: {
          success: true,
          result: {
            id: "loc-recessed-counting-stair",
            name: "Recessed Counting Stair",
            connectedTo: "Pier Records Counter",
          },
        },
      },
      {
        order: 2,
        actionId: thirdActionId,
        actionRef: "step-move-to",
        actorId: playerId,
        toolName: "move_to",
        input: { targetLocationName: "loc-recessed-counting-stair" },
        args: { targetLocationName: "loc-recessed-counting-stair" },
        result: {
          success: true,
          result: {
            locationId: "loc-recessed-counting-stair",
            locationName: "Recessed Counting Stair",
            travelCost: 1,
            path: ["Pier Records Counter", "Recessed Counting Stair"],
          },
        },
      },
      {
        order: 3,
        actionId: fourthActionId,
        actionRef: "step-spawn-npc",
        actorId: visibleNpcId,
        toolName: "spawn_npc",
        input: {
          name: "npc-generated-placeholder",
          tags: ["porter", "witness"],
          locationRef: "current_scene",
        },
        args: {
          name: "npc-generated-placeholder",
          tags: ["porter", "witness"],
          locationRef: "current_scene",
        },
        result: {
          success: true,
          result: { id: "npc-ledger-porter", name: "Ledger Porter" },
        },
      },
      {
        order: 4,
        actionId: fifthActionId,
        actionRef: "step-spawn-item",
        actorId: visibleNpcId,
        toolName: "spawn_item",
        input: {
          name: "item-generated-placeholder",
          tags: ["manifest", "persistent"],
          ownerName: "current_scene",
          ownerType: "location",
        },
        args: {
          name: "item-generated-placeholder",
          tags: ["manifest", "persistent"],
          ownerName: "current_scene",
          ownerType: "location",
        },
        result: {
          success: true,
          result: {
            id: "item-waxed-cloth-manifest",
            name: "Waxed-Cloth Manifest",
            owner: "Pier Records Counter",
            ownerType: "location",
          },
        },
      },
    ];
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults = acceptedActions;
    canonicalTurnPacket.narratorFacts.actionIds = acceptedActions.map((action) => action.actionId);
    canonicalTurnPacket.narratorFacts.toolResultRefs = acceptedActions.map((action) => ({
      actionId: action.actionId,
      toolName: action.toolName,
    }));

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toEqual([
      "The dock clerk records the waxed-cloth manifest dispute as unresolved.",
      "Recessed Counting Stair becomes reachable from Pier Records Counter.",
      "The scene moves to Recessed Counting Stair.",
      "Ledger Porter becomes visibly present in the scene.",
      "Waxed-Cloth Manifest becomes available to Pier Records Counter.",
    ]);
    expect(formatted).toContain("Waxed-Cloth Manifest");
    expect(formatted).toContain("Ledger Porter");
    expect(formatted).toContain("Recessed Counting Stair");
    expect(formatted).not.toContain("loc-temp-uuid-only");
    expect(formatted).not.toContain("npc-generated-placeholder");
    expect(formatted).not.toContain("item-generated-placeholder");
    expect(formatted).not.toMatch(/validated .* consequence settles/i);
  });

  it("does not convert referenced failed or guarded tool attempts into settled effects", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [
      {
        id: "effect-guarded-failure",
        actionId: failedActionId,
        actorId: visibleNpcId,
        toolName: "spawn_item",
        summary: "FAILED REFERENCED SENTINEL: Mira receives a master office key.",
        perceivableByPlayer: true,
        toolResult: { success: false, error: "Unsupported access proof claim." },
      },
    ];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: failedActionId,
        actionRef: "step-guarded-failure",
        actorId: visibleNpcId,
        toolName: "log_event",
        input: {
          text: "Mira Voss has a master key that opens the sealed records office.",
          importance: 8,
          participants: ["Mira"],
          durability: "durable",
          futureRelevance: "The claimed key would grant office access.",
        },
        args: {
          text: "Mira Voss has a master key that opens the sealed records office.",
          importance: 8,
          participants: ["Mira"],
          durability: "durable",
          futureRelevance: "The claimed key would grant office access.",
        },
        result: { success: false, error: "Unsupported access proof claim." },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [failedActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: failedActionId, toolName: "log_event" },
      { actionId: failedActionId, toolName: "spawn_item" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects).toEqual([]);
    expect(formatted).toContain("No player-perceivable effects are in scope.");
    expect(formatted).not.toContain("FAILED REFERENCED SENTINEL");
    expect(formatted).not.toContain("master key that opens");
    expect(formatted).not.toContain("Mira receives a master office key");
  });

  it("keeps failed claimed possessions unconfirmed in log_event summaries", () => {
    const summary = summarizeRuntimeToolResultForNarrator({
      toolName: "log_event",
      actionId: successfulActionId,
      toolInput: {
        text: "Mira Voss claimed to possess a master key to every signal-house door and attempted to unlock a sealed office. The key did not work - either it doesn't exist, doesn't fit this lock, or is a bluff exposed by the attempt.",
      },
      toolArgs: {},
    });

    expect(summary).toContain("No confirmed possession or access is established");
    expect(summary).not.toContain("The key did not work");
  });

  it("summarizes contested outcome bounds from the accepted tool result", () => {
    const summary = summarizeRuntimeToolResultForNarrator({
      toolName: "request_contested_outcome",
      actionId: successfulActionId,
      toolInput: {
        actorName: "Watcher",
        targetName: "Mira Voss",
        mode: "restrain",
      },
      toolArgs: {},
      toolResult: {
        success: true,
        result: {
          kind: "contested_outcome_bounds",
          actorName: "Watcher",
          targetName: "Mira Voss",
          matchup: "dominant",
          allowedEffects: ["The actor may force immediate pressure, but not an automatic capture."],
          prohibitedEffects: [
            "Do not declare death, incapacitation, capture, escape, HP loss, inventory transfer, or relocation unless a later successful tool/state result commits it.",
          ],
        },
      },
    });

    expect(summary).toContain("Watcher");
    expect(summary).toContain("Mira Voss");
    expect(summary).toContain("dominant matchup");
    expect(summary).toContain("not an automatic capture");
    expect(summary).toContain("Do not declare death");
  });

  it("summarizes non-log runtime tools without leaking backend action ids", () => {
    const examples = [
      {
        toolName: "transfer_item" as const,
        toolInput: { itemName: "brass key", targetName: "Mira", targetType: "character" },
        expected: "brass key moves to Mira.",
      },
      {
        toolName: "move_to" as const,
        toolInput: { targetLocationName: "Lantern Pier" },
        expected: "The scene moves to Lantern Pier.",
      },
      {
        toolName: "set_condition" as const,
        toolInput: { targetName: "Iria", delta: -1 },
        expected: "Iria's condition changes.",
      },
      {
        toolName: "spawn_npc" as const,
        toolInput: { name: "Harbor Porter", tags: ["porter"], locationRef: "current_scene" },
        expected: "Harbor Porter becomes visibly present in the scene.",
      },
      {
        toolName: "reveal_location" as const,
        toolInput: {
          name: "Lantern Pier",
          description: "A wet stone landing.",
          tags: ["pier"],
          connectedToName: "Canal Gate",
        },
        expected: "Lantern Pier becomes reachable from Canal Gate.",
      },
      {
        toolName: "spawn_item" as const,
        toolInput: {
          name: "sealed route chit",
          tags: ["route-token"],
          ownerName: "Mira",
          ownerType: "character",
        },
        expected: "sealed route chit becomes available to Mira.",
      },
    ];

    for (const example of examples) {
      const summary = summarizeRuntimeToolResultForNarrator({
        toolName: example.toolName,
        actionId: successfulActionId,
        toolInput: example.toolInput,
        toolArgs: example.toolInput,
      });

      expect(summary).toBe(example.expected);
      expect(summary).not.toContain(successfulActionId);
      expect(summary).not.toMatch(/^Committed /);
    }
  });
});
