import { describe, expect, it } from "vitest";

import {
  buildNarratorPacket,
  formatNarratorPacketForPrompt,
  repairModelGuidancePerceivableResponses,
  repairPromptUnsafePerceivableEffects,
  summarizeRuntimeToolResultForNarrator,
  type CanonicalTurnPacket,
} from "../narrator-packet.js";
import { buildModelFacingScenePacket } from "../model-facing-scene.js";
import { buildPlayerFacingPacketFromNarratorPacket } from "../player-facing-packet.js";
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
    worldVersion: 0,
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
        evidenceAuthority: "backend_fact",
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
  it("summarizes accepted time passage as completed elapsed time", () => {
    const summary = summarizeRuntimeToolResultForNarrator({
      toolName: "advance_time",
      actionId: "action-time",
      toolInput: {
        minutes: 4320,
        reason: "The player waits until the full moon tide begins.",
      },
      toolArgs: {
        minutes: 4320,
        reason: "The player waits until the full moon tide begins.",
      },
      toolResult: {
        success: true,
        result: {
          minutes: 4320,
          reason: "The player waits until the full moon tide begins.",
          clockAdvanced: true,
        },
        authority: {
          toolResultId: "tool-result-time",
          campaignId: "campaign-1",
          sourceEntity: { type: "player", id: playerId },
          baseWorldVersion: 1,
          resultWorldVersion: 2,
          worldTimeMinutes: 4332,
          elapsedWorldTimeMinutes: 4320,
          stateDeltaRefs: ["world_time", "elapsed:4320"],
          eventRefs: [],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
        },
      },
    });

    expect(summary).toBe("3 days pass.");
    expect(summary).not.toMatch(/\bstretch ahead\b/i);
  });

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

  it("builds a player-facing evidence ledger from settled visible packet sources", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });

    expect(packet.evidenceLedger?.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "player_action_request:player-action",
        `anchor_event:${anchorEventId}`,
        `committed_event:${anchorEventId}`,
        `perceivable_response:${responseId}`,
        "perceivable_effect:effect-success",
        `tool_result:${successfulActionId}`,
        `visible_actor:${playerId}`,
        `visible_actor:${visibleNpcId}`,
        "guardrail:1",
        "control_return:current",
      ]),
    );
    expect(formatNarratorPacketForPrompt(packet)).toContain("[EVIDENCE LEDGER]");
    expect(formatNarratorPacketForPrompt(packet)).toContain("p5 [category=perceivable_effect]");
    expect(formatNarratorPacketForPrompt(packet)).not.toContain(
      "perceivable_effect:effect-success",
    );
  });

  it("does not promote no-mutation model guidance responses into narrator facts", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.responses[0] = {
      ...canonicalTurnPacket.responses[0]!,
      summary: "GM no-mutation direction: the clerk accepts the seal and opens the route.",
      evidenceAuthority: "model_guidance",
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableResponses).toEqual([]);
    expect(packet.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      `perceivable_response:${responseId}`,
    );
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("does not promote legacy no-mutation responses without backend-owned action anchors", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.narratorFacts.actionIds = [];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [];
    const { evidenceAuthority: _evidenceAuthority, ...legacyResponse } =
      canonicalTurnPacket.responses[0]!;
    canonicalTurnPacket.responses[0] = {
      ...legacyResponse,
      summary: "Legacy GM no-mutation direction: the clerk accepts the seal.",
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableResponses).toEqual([]);
    expect(packet.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      `perceivable_response:${responseId}`,
    );
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("repairs stale persisted no-mutation responses before they can be cited", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.narratorFacts.actionIds = [];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [];
    const { evidenceAuthority: _evidenceAuthority, ...legacyResponse } =
      canonicalTurnPacket.responses[0]!;
    canonicalTurnPacket.responses[0] = {
      ...legacyResponse,
      summary: "Legacy GM no-mutation direction: the clerk accepts the seal.",
    };
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const stalePacket = {
      ...packet,
      perceivableResponses: [canonicalTurnPacket.responses[0]!],
      evidenceLedger: [
        ...(packet.evidenceLedger ?? []),
        {
          id: `perceivable_response:${responseId}`,
          category: "perceivable_response" as const,
          summary: canonicalTurnPacket.responses[0]!.summary,
          sourceId: responseId,
        },
      ],
      sourceLinkedSummaries: [
        ...(packet.sourceLinkedSummaries ?? []),
        {
          id: "source-linked-response",
          summary: canonicalTurnPacket.responses[0]!.summary,
          sourceIds: [responseId],
          summarizedItemCount: 1,
        },
      ],
      redactionAudit: packet.redactionAudit
        ? {
            ...packet.redactionAudit,
            retainedEvidenceCount: (packet.evidenceLedger ?? []).length + 1,
          }
        : undefined,
    };

    const repaired = repairModelGuidancePerceivableResponses(stalePacket);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.perceivableResponses).toEqual([]);
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      `perceivable_response:${responseId}`,
    );
    expect(repaired.sourceLinkedSummaries?.map((summary) => summary.id)).not.toContain(
      "source-linked-response",
    );
    expect(repaired.redactionAudit?.retainedEvidenceCount).toBe(repaired.evidenceLedger?.length);
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("does not promote mixed-packet legacy responses without response-owned authority", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const { evidenceAuthority: _evidenceAuthority, ...legacyResponse } =
      canonicalTurnPacket.responses[0]!;
    canonicalTurnPacket.responses[0] = {
      ...legacyResponse,
      summary: "Legacy GM guidance in a mixed packet: the clerk accepts the seal.",
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(canonicalTurnPacket.actionResults.length).toBeGreaterThan(0);
    expect(canonicalTurnPacket.effects.length).toBeGreaterThan(0);
    expect(packet.perceivableEffects.map((effect) => effect.id)).toContain("effect-success");
    expect(packet.perceivableResponses).toEqual([]);
    expect(packet.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      `perceivable_response:${responseId}`,
    );
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("repairs mixed stale responses and untrusted source-less response evidence", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const { evidenceAuthority: _evidenceAuthority, ...legacyResponse } =
      canonicalTurnPacket.responses[0]!;
    canonicalTurnPacket.responses[0] = {
      ...legacyResponse,
      summary: "Legacy GM guidance in a mixed packet: the clerk accepts the seal.",
    };
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const stalePacket = {
      ...packet,
      perceivableResponses: [canonicalTurnPacket.responses[0]!],
      evidenceLedger: [
        ...(packet.evidenceLedger ?? []),
        {
          id: `perceivable_response:${responseId}`,
          category: "perceivable_response" as const,
          summary: canonicalTurnPacket.responses[0]!.summary,
          sourceId: responseId,
        },
        {
          id: "perceivable_response:legacy-source-missing",
          category: "perceivable_response" as const,
          summary: "Legacy response evidence without source id.",
        },
      ],
    };

    const repaired = repairModelGuidancePerceivableResponses(stalePacket);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.perceivableEffects.map((effect) => effect.id)).toContain("effect-success");
    expect(repaired.perceivableResponses).toEqual([]);
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      `perceivable_response:${responseId}`,
    );
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      "perceivable_response:legacy-source-missing",
    );
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("repairs ledger-only stale response evidence even without response array entries", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });
    const stalePacket = {
      ...packet,
      perceivableResponses: [],
      evidenceLedger: [
        ...(packet.evidenceLedger ?? []).filter((entry) => entry.category !== "perceivable_response"),
        {
          id: "perceivable_response:ghost-response",
          category: "perceivable_response" as const,
          summary: "Ledger-only legacy GM guidance: the clerk accepts the seal.",
          sourceId: "ghost-response",
        },
        {
          id: "perceivable_response:legacy-source-missing",
          category: "perceivable_response" as const,
          summary: "Source-less legacy GM guidance: the clerk accepts the seal.",
        },
      ],
      sourceLinkedSummaries: [
        ...(packet.sourceLinkedSummaries ?? []),
        {
          id: "source-linked-ghost-response",
          summary: "Ledger-only legacy GM guidance: the clerk accepts the seal.",
          sourceIds: ["ghost-response"],
          summarizedItemCount: 1,
        },
        {
          id: "source-linked-source-less-response",
          summary: "Source-less legacy GM guidance: the clerk accepts the seal.",
          sourceIds: [],
          summarizedItemCount: 1,
        },
      ],
    };

    const repaired = repairModelGuidancePerceivableResponses(stalePacket);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.perceivableResponses).toEqual([]);
    expect(repaired.perceivableEffects.map((effect) => effect.id)).toContain("effect-success");
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      "perceivable_response:ghost-response",
    );
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      "perceivable_response:legacy-source-missing",
    );
    expect(repaired.sourceLinkedSummaries?.map((summary) => summary.id)).not.toContain(
      "source-linked-ghost-response",
    );
    expect(repaired.sourceLinkedSummaries?.map((summary) => summary.id)).not.toContain(
      "source-linked-source-less-response",
    );
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("drops summary-only orphan response text without response or ledger entries", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });
    const stalePacket = {
      ...packet,
      perceivableResponses: [],
      evidenceLedger: [],
      sourceLinkedSummaries: [{
        id: "summary-only-ghost-response",
        summary: "Legacy GM guidance: the clerk accepts the seal.",
        sourceIds: ["ghost-response"],
        summarizedItemCount: 1,
      }],
    };

    const repaired = repairModelGuidancePerceivableResponses(stalePacket);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.sourceLinkedSummaries?.map((summary) => summary.id)).not.toContain(
      "summary-only-ghost-response",
    );
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("drops mixed source-linked summaries instead of preserving blended stale prose", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });
    const stalePacket = {
      ...packet,
      sourceLinkedSummaries: [{
        id: "mixed-trusted-and-ghost",
        summary: "Trusted lock observation plus legacy GM guidance: the clerk accepts the seal.",
        sourceIds: [responseId, "ghost-response"],
        summarizedItemCount: 2,
      }],
    };

    const repaired = repairModelGuidancePerceivableResponses(stalePacket);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.perceivableResponses.map((response) => response.id)).toEqual([responseId]);
    expect(repaired.sourceLinkedSummaries?.map((summary) => summary.id)).not.toContain(
      "mixed-trusted-and-ghost",
    );
    expect(formatted).toContain("Mira watches the lock without stepping closer.");
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("keeps backend-owned response evidence while dropping orphan response evidence", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });
    const stalePacket = {
      ...packet,
      evidenceLedger: [
        ...(packet.evidenceLedger ?? []),
        {
          id: "perceivable_response:ghost-response",
          category: "perceivable_response" as const,
          summary: "Orphan legacy GM guidance: the clerk accepts the seal.",
          sourceId: "ghost-response",
        },
      ],
      sourceLinkedSummaries: [
        ...(packet.sourceLinkedSummaries ?? []),
        {
          id: "source-linked-ghost-response",
          summary: "Orphan legacy GM guidance: the clerk accepts the seal.",
          sourceIds: ["ghost-response"],
          summarizedItemCount: 1,
        },
      ],
    };

    const repaired = repairModelGuidancePerceivableResponses(stalePacket);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.perceivableResponses.map((response) => response.id)).toEqual([responseId]);
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).toContain(
      `perceivable_response:${responseId}`,
    );
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      "perceivable_response:ghost-response",
    );
    expect(repaired.sourceLinkedSummaries?.map((summary) => summary.id)).not.toContain(
      "source-linked-ghost-response",
    );
    expect(formatted).toContain("Mira watches the lock without stepping closer.");
    expect(formatted).not.toContain("the clerk accepts the seal");
  });

  it("records redaction audit counts without formatting hidden proposal payloads", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.events.push({
      id: "event-hidden-private",
      actorId: visibleNpcId,
      kind: "environment",
      summary: "HIDDEN EVENT SENTINEL: Hidden Proposal Vault opens.",
      perceivableByPlayer: false,
    });
    canonicalTurnPacket.responses.push({
      id: "response-hidden-private",
      actorId: visibleNpcId,
      responseKind: "system",
      eventId: "event-hidden-private",
      summary: "HIDDEN RESPONSE SENTINEL: private proposal answer.",
      visibleToPlayer: false,
    });
    canonicalTurnPacket.effects.push({
      id: "effect-hidden-private",
      actorId: visibleNpcId,
      summary: "HIDDEN EFFECT SENTINEL: the private proposal commits.",
      perceivableByPlayer: false,
    });

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
      forbiddenPrivateTerms: ["Hidden Proposal Vault", "private proposal answer"],
      uncommittedProposalCandidates: [
        { id: "proposal-hidden-vault", status: "pending", hidden: true },
      ],
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.redactionAudit).toMatchObject({
      hiddenEventCount: 1,
      hiddenResponseCount: 1,
      failedEffectCount: 1,
      unreferencedEffectCount: 1,
      hiddenEffectCount: 1,
      forbiddenPrivateTermCount: 2,
      uncommittedProposalCount: 1,
    });
    expect(packet.contextBudgetTrace?.frameType).toBe("NarratorPacket");
    expect(packet.contextBudgetTrace?.didClipModelOutput).toBe(false);
    expect(formatted).toContain("[REDACTION AUDIT]");
    expect(formatted).toContain("uncommittedProposalCount: 1");
    expect(formatted).not.toContain("HIDDEN EVENT SENTINEL");
    expect(formatted).not.toContain("HIDDEN RESPONSE SENTINEL");
    expect(formatted).not.toContain("HIDDEN EFFECT SENTINEL");
    expect(formatted).not.toContain("proposal-hidden-vault");
    expect(formatted).not.toContain("Hidden Proposal Vault");
    expect(formatted).not.toContain("private proposal answer");
  });

  it("keeps private POV terms out of player prompt and model-facing scene packets", () => {
    const frame = createFrame();
    frame.roster.active[1] = {
      ...frame.roster.active[1]!,
      label: "ash-cloaked captain",
      summary: "A public-facing officer blocks the checkpoint.",
    };
    frame.roster.background = [
      {
        id: "npc-private-commander",
        actorId: "npc-private-commander",
        type: "npc",
        label: "Commander Ilyra",
        locationId,
        sceneScopeId: locationId,
        awareness: "none",
        summary: "PRIVATE OATH: Commander Ilyra believes the Black Ledger is under the shrine.",
      },
    ];
    frame.perception.forbiddenActorIds = ["npc-private-commander"];
    frame.perception.forbiddenActorLabels = [
      "Commander Ilyra",
      "Black Ledger",
      "PRIVATE OATH",
      "pending proposal payload",
    ];
    frame.recentEvents = [
      {
        id: "visible-signal",
        source: "location_recent_event",
        summary: "A sealed report case rests behind the officer.",
        tick: 12,
        actorIds: [],
        perceivableByPlayer: true,
      },
      {
        id: "private-report",
        source: "location_recent_event",
        summary:
          "Commander Ilyra hides the Black Ledger through a pending proposal payload.",
        tick: 12,
        actorIds: ["npc-private-commander"],
        perceivableByPlayer: false,
      },
    ];
    frame.targetCandidates = [
      {
        id: "actor:npc-private-commander",
        type: "actor",
        actorId: "npc-private-commander",
        label: "Commander Ilyra",
        awareness: "none",
      },
    ];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.anchorEvent.summary = "Iria studies the sealed report case.";
    canonicalTurnPacket.events = [{
      id: "visible-signal",
      actorId: visibleNpcId,
      kind: "environment",
      summary: "A sealed report case rests behind the officer.",
      perceivableByPlayer: true,
    }];
    canonicalTurnPacket.narratorFacts.eventIds = ["visible-signal"];

    const narratorPacket = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
      forbiddenPrivateTerms: ["Commander Ilyra", "Black Ledger", "PRIVATE OATH"],
    });
    const modelFacingPacket = buildModelFacingScenePacket(frame);
    const formatted = formatNarratorPacketForPrompt(narratorPacket);
    const serializedModelView = JSON.stringify(modelFacingPacket.view);

    expect(formatted).toContain("sealed report case");
    expect(formatted).not.toContain("Commander Ilyra");
    expect(formatted).not.toContain("Black Ledger");
    expect(formatted).not.toContain("PRIVATE OATH");
    expect(formatted).not.toContain("pending proposal payload");
    expect(serializedModelView).not.toContain("Commander Ilyra");
    expect(serializedModelView).not.toContain("Black Ledger");
    expect(serializedModelView).not.toContain("PRIVATE OATH");
    expect(serializedModelView).not.toContain("pending proposal payload");
  });

  it("repairs stale persisted narrator packets by dropping unsafe non-creation effects", () => {
    const narratorPacket = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
      forbiddenPrivateTerms: ["Black Ledger"],
    });
    narratorPacket.perceivableEffects = [
      ...narratorPacket.perceivableEffects,
      {
        id: "effect-stale-private",
        actionId: secondActionId,
        actorId: visibleNpcId,
        toolName: "log_event",
        summary: "Mira internally recognizes the Black Ledger pattern but betrays nothing.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { durability: "durable", persisted: true } },
      },
    ];
    narratorPacket.evidenceLedger = [
      ...(narratorPacket.evidenceLedger ?? []),
      {
        id: "perceivable_effect:effect-stale-private",
        category: "perceivable_effect",
        summary: "Mira internally recognizes the Black Ledger pattern but betrays nothing.",
        sourceId: "effect-stale-private",
      },
      {
        id: `tool_result:${secondActionId}`,
        category: "tool_result",
        summary:
          "The accepted action result supports this player-perceivable effect: Mira internally recognizes the Black Ledger pattern.",
        sourceId: secondActionId,
      },
    ];
    narratorPacket.sourceLinkedSummaries = [{
      id: "source-linked-stale-private",
      summary: "Overflow summary mentions the Black Ledger.",
      sourceIds: ["effect-stale-private"],
      summarizedItemCount: 1,
    }];

    expect(() => buildPlayerFacingPacketFromNarratorPacket(narratorPacket)).toThrow(
      /forbidden packet term/i,
    );

    const repaired = repairPromptUnsafePerceivableEffects(narratorPacket);
    const playerFacingPacket = buildPlayerFacingPacketFromNarratorPacket(repaired);
    const formatted = formatNarratorPacketForPrompt(repaired);

    expect(repaired.perceivableEffects.map((effect) => effect.id)).not.toContain("effect-stale-private");
    expect(repaired.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      "perceivable_effect:effect-stale-private",
    );
    expect(playerFacingPacket.perceivableEffects.map((effect) => effect.id)).not.toContain(
      "effect-stale-private",
    );
    expect(formatted).not.toContain("Black Ledger");
  });

  it("includes hidden-source visible disturbances anonymously when no private term is present", () => {
    const hiddenActorId = "npc-hidden-scout";
    const hiddenActionId = "action-hidden-scout-disturbance";
    const frame = createFrame();
    frame.roster.background = [
      {
        id: hiddenActorId,
        actorId: hiddenActorId,
        type: "npc",
        label: "Roof Scout",
        locationId,
        sceneScopeId: locationId,
        awareness: "none",
      },
    ];
    frame.perception.forbiddenActorIds = [hiddenActorId];
    frame.perception.forbiddenActorLabels = ["Roof Scout"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [
      {
        id: "effect-hidden-disturbance",
        actionId: hiddenActionId,
        actorId: hiddenActorId,
        toolName: "log_event",
        summary: "A loose shutter bangs twice above the alley.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { durability: "scene_local", persisted: false } },
      },
    ];
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.narratorFacts.actionIds = [hiddenActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: hiddenActionId, toolName: "log_event" },
    ];

    const packet = buildNarratorPacket({ frame, canonicalTurnPacket });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "A loose shutter bangs twice above the alley.",
    );
    expect(formatted).toContain("A loose shutter bangs twice above the alley.");
    expect(formatted).not.toContain("Roof Scout");
    expect(formatted).not.toContain(hiddenActorId);
    expect(formatted).not.toContain(hiddenActionId);
  });

  it("redacts hidden actor identity/private terms from visible consequences before formatting", () => {
    const hiddenActorId = "npc-hidden-gojo";
    const hiddenActionId = "action-hidden-gojo-reaction";
    const hiddenText =
      "Satoru Gojo's Six Eyes catch the Infinity Lattice pulse from across the district.";
    const frame = createFrame();
    frame.roster.background = [
      {
        id: hiddenActorId,
        actorId: hiddenActorId,
        type: "npc",
        label: "Satoru Gojo",
        locationId,
        sceneScopeId: locationId,
        awareness: "none",
        summary: hiddenText,
      },
    ];
    frame.perception.forbiddenActorIds = [hiddenActorId];
    frame.perception.forbiddenActorLabels = ["Satoru Gojo", "Six Eyes"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [
      ...canonicalTurnPacket.effects,
      {
        id: "effect-hidden-gojo-reaction",
        actionId: hiddenActionId,
        actorId: hiddenActorId,
        toolName: "log_event",
        summary: hiddenText,
        perceivableByPlayer: true,
        toolResult: { success: true, result: { durability: "scene_local", persisted: false } },
      },
    ];
    canonicalTurnPacket.actionResults = [
      ...canonicalTurnPacket.actionResults,
      {
        order: 1,
        actionId: hiddenActionId,
        actionRef: "actor-tool:hidden-gojo:log_event:1",
        actorId: hiddenActorId,
        toolName: "log_event",
        input: { text: hiddenText, importance: 3, participants: ["Satoru Gojo"] },
        args: { text: hiddenText, importance: 3, participants: ["Satoru Gojo"] },
        result: { success: true, result: { durability: "scene_local", persisted: false } },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [
      ...canonicalTurnPacket.narratorFacts.actionIds,
      hiddenActionId,
    ];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      ...canonicalTurnPacket.narratorFacts.toolResultRefs,
      { actionId: hiddenActionId, toolName: "log_event" },
    ];

    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
      forbiddenPrivateTerms: ["Infinity Lattice"],
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.length).toBeGreaterThan(0);
    expect(formatted).toContain("The lock rattles but stays closed.");
    expect(formatted).not.toContain("Satoru Gojo");
    expect(formatted).not.toContain("Six Eyes");
    expect(formatted).not.toContain("Infinity Lattice");
    expect(formatted).not.toContain(hiddenActorId);
    expect(formatted).not.toContain(hiddenActionId);
    expect(() => formatNarratorPacketForPrompt(packet)).not.toThrow();
  });

  it("drops visible-actor private cognition before it becomes a player-facing effect", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [
      ...canonicalTurnPacket.effects,
      {
        id: "effect-private-cognition",
        actionId: secondActionId,
        actorId: visibleNpcId,
        toolName: "log_event",
        summary:
          "Mira privately recognizes Nyx Corallus in the sealed proof pattern and recalls the seven receipts.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { durability: "durable", persisted: true } },
      },
    ];
    canonicalTurnPacket.actionResults = [
      ...canonicalTurnPacket.actionResults,
      {
        order: 1,
        actionId: secondActionId,
        actionRef: "actor-tool:mira:private-cognition",
        actorId: visibleNpcId,
        toolName: "log_event",
        input: {
          text:
            "Mira privately recognizes Nyx Corallus in the sealed proof pattern and recalls the seven receipts.",
        },
        args: {
          text:
            "Mira privately recognizes Nyx Corallus in the sealed proof pattern and recalls the seven receipts.",
        },
        result: { success: true, result: { durability: "durable", persisted: true } },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId, secondActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "log_event" },
      { actionId: secondActionId, toolName: "log_event" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
      forbiddenPrivateTerms: ["Nyx Corallus", "seven receipts"],
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.id)).toContain("effect-success");
    expect(packet.perceivableEffects.map((effect) => effect.id)).not.toContain(
      "effect-private-cognition",
    );
    expect(formatted).toContain("The lock rattles but stays closed.");
    expect(formatted).not.toContain("Nyx Corallus");
    expect(formatted).not.toContain("seven receipts");
  });

  it("still includes visible actor effects without anonymous-source redaction", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.id)).toContain("effect-success");
    expect(packet.perceivableEffects.map((effect) => effect.actorId)).toContain(visibleNpcId);
    expect(formatted).toContain("Mira");
    expect(formatted).not.toContain("actor=22222222-2222-4222-8222-222222222222");
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

  it("surfaces structural dialogue outcome content in narrator evidence", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "record_dialogue_outcome" },
    ];
    canonicalTurnPacket.actionResults[0] = {
      ...canonicalTurnPacket.actionResults[0]!,
      toolName: "record_dialogue_outcome",
      input: {
        speakerRef: "Concourse Disputes Clerk",
        addresseeRefs: ["Iria"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "settled_by_backend",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance:
          "Mismatched prose: the back alley is the official next step.",
        summary:
          "Mismatched prose: the courier should ignore the chamber and use a back alley.",
        claims: [
          {
            claimKind: "requirement",
            polarity: "requires",
            subjectText: "Seal Verification Chamber",
            summary:
              "Mismatched prose: the sealed message should go to a back alley.",
          },
        ],
        sourceRefs: ["Concourse Disputes Clerk", "Iria"],
      },
      args: {
        summary:
          "Mismatched prose: the courier should ignore the chamber and use a back alley.",
      },
      result: {
        success: true,
        result: {
          summary:
            "Mismatched prose: the courier should ignore the chamber and use a back alley.",
          claims: [
            {
              claimKind: "requirement",
              polarity: "requires",
              subjectText: "Seal Verification Chamber",
              summary:
                "Mismatched prose: the sealed message should go to a back alley.",
            },
          ],
          futureRelevance:
            "Mismatched prose: the back alley is the official next step.",
          durability: "durable",
          persisted: true,
        },
      },
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects.map((effect) => effect.summary).join("\n")).toContain(
      "Seal Verification Chamber",
    );
    expect(formatted).toContain("Seal Verification Chamber");
    expect(formatted).not.toContain("back alley");
    expect(formatted).not.toContain("ignore the chamber");
    expect(formatted).not.toContain("validated record dialogue outcome consequence settles");
  });

  it("attaches dialogue outcome precision facts to perceivable effect and tool result evidence", () => {
    const dialogueResult = {
      summary:
        "Brasswick confirms second bell has not yet passed and names the east aqueduct maintenance catwalk.",
      quote:
        "Second bell hasn't rung yet. Take the east maintenance catwalk south, then the stone causeway.",
      claims: [
        {
          claimKind: "route_status",
          polarity: "states",
          summary:
            "Second bell has not yet passed; it is still early-to-mid afternoon.",
        },
        {
          claimKind: "route_status",
          polarity: "allows",
          summary:
            "The safest route is the east aqueduct maintenance catwalk south along the channel, then the stone causeway approach.",
        },
      ],
      stateEffects: [
        {
          status: "applied_now",
          targetRef: "Refused Petition: Roster Inquiry",
          stateKey: "possession",
          stateValue: "internal-custody-debug-token",
          summary: "The refused petition remains carried by Iri Vale.",
        },
      ],
      persisted: true,
    };
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "record_dialogue_outcome" },
    ];
    canonicalTurnPacket.effects = [
      {
        id: "effect-dialogue-route",
        actionId: successfulActionId,
        actorId: visibleNpcId,
        toolName: "record_dialogue_outcome",
        summary: "Brasswick gives route timing and tribunal approach guidance.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: dialogueResult },
      },
    ];
    canonicalTurnPacket.actionResults[0] = {
      ...canonicalTurnPacket.actionResults[0]!,
      toolName: "record_dialogue_outcome",
      result: { success: true, result: dialogueResult },
    };

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const effectEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === "perceivable_effect:effect-dialogue-route");
    const toolEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === `tool_result:${successfulActionId}`);

    expect(effectEvidence?.precisionFacts?.map((fact) => fact.value)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Second bell has not yet passed"),
        expect.stringContaining("east maintenance catwalk south"),
      ]),
    );
    expect(effectEvidence?.precisionFacts?.map((fact) => fact.value).join("\n")).not.toContain(
      "The refused petition remains carried by Iri Vale",
    );
    expect(effectEvidence?.precisionFacts?.map((fact) => fact.value)).not.toContain(
      "internal-custody-debug-token",
    );
    expect(toolEvidence?.precisionFacts?.map((fact) => fact.value)).toEqual(
      effectEvidence?.precisionFacts?.map((fact) => fact.value),
    );
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

  it("does not auto-promote structural tag mutations into perceivable narration effects", () => {
    const rawTag = "cressen-permitted-harmonic-intervention";
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-add-permission-tag",
        actorId: visibleNpcId,
        toolName: "add_tag",
        input: {
          entityName: "Iria",
          entityType: "player",
          tag: rawTag,
        },
        args: {
          entityName: "Iria",
          entityType: "player",
          tag: rawTag,
        },
        result: {
          success: true,
          result: {
            entity: "Iria",
            appliedTag: rawTag,
            tags: ["repair-singer", rawTag],
          },
        },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "add_tag" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects).toEqual([]);
    expect(packet.evidenceLedger?.map((entry) => entry.id)).not.toContain(
      `tool_result:${successfulActionId}`,
    );
    expect(formatted).not.toContain(rawTag);
    expect(formatted).not.toContain("gains");
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
      "You arrive at Recessed Counting Stair.",
      "Ledger Porter becomes visibly present in the scene.",
      "Waxed-Cloth Manifest becomes available to Pier Records Counter.",
    ]);
    const revealEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === `perceivable_effect:action-result:${secondActionId}`);
    const moveEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === `perceivable_effect:action-result:${thirdActionId}`);
    expect(revealEvidence).toEqual(expect.objectContaining({
      summaryBackendFact: false,
      precisionFacts: expect.arrayContaining([
        expect.objectContaining({
          kind: "summary",
          value: "Recessed Counting Stair is reachable from Pier Records Counter.",
          claimKind: "route_status",
        }),
      ]),
    }));
    expect(moveEvidence).toEqual(expect.objectContaining({
      summaryBackendFact: false,
      precisionFacts: expect.arrayContaining([
        expect.objectContaining({
          kind: "summary",
          value: "You arrive at Recessed Counting Stair.",
          claimKind: "location_change",
        }),
      ]),
    }));
    expect(formatted).toContain("Waxed-Cloth Manifest");
    expect(formatted).toContain("Ledger Porter");
    expect(formatted).toContain("Recessed Counting Stair");
    expect(formatted).not.toContain("loc-temp-uuid-only");
    expect(formatted).not.toContain("npc-generated-placeholder");
    expect(formatted).not.toContain("item-generated-placeholder");
    expect(formatted).not.toMatch(/validated .* consequence settles/i);
  });

  it("allows exact same-turn visible actor creation labels in the narrator packet", () => {
    const cases: Array<{
      toolName: "spawn_npc" | "create_scene_extra";
      label: string;
      actionRef: string;
    }> = [
      {
        toolName: "spawn_npc",
        label: "Station Attendant",
        actionRef: "step-spawn-station-attendant",
      },
      {
        toolName: "create_scene_extra",
        label: "Platform Sweeper",
        actionRef: "step-create-platform-sweeper",
      },
    ];

    for (const example of cases) {
      const frame = createFrame();
      frame.perception.forbiddenActorLabels = [example.label];
      const canonicalTurnPacket = createCanonicalTurnPacket();
      canonicalTurnPacket.effects = [];
      canonicalTurnPacket.actionResults = [
        {
          order: 0,
          actionId: successfulActionId,
          actionRef: example.actionRef,
          actorId: visibleNpcId,
          toolName: example.toolName,
          input: {
            name: "generated-placeholder",
            locationRef: "current_scene",
          },
          args: {
            name: "generated-placeholder",
            locationRef: "current_scene",
          },
          result: {
            success: true,
            result: {
              id: `npc-${example.label.toLowerCase().replace(/\s+/g, "-")}`,
              name: example.label,
            },
          },
        },
      ];
      canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId];
      canonicalTurnPacket.narratorFacts.toolResultRefs = [{
        actionId: successfulActionId,
        toolName: example.toolName,
      }];

      const packet = buildNarratorPacket({
        frame,
        canonicalTurnPacket,
      });

      expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
        `${example.label} becomes visibly present in the scene.`,
      );
      expect(() => formatNarratorPacketForPrompt(packet)).not.toThrow();
      expect(packet.forbiddenActorNames).toContain(example.label);
    }
  });

  it("keeps movement receipt summaries support-only while exposing narratable movement facts", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const advanceActionId = "action-advance-gondola";
    const moveActionId = "action-move-gondola";
    canonicalTurnPacket.effects = [
      {
        id: "effect-advance-gondola",
        actionId: advanceActionId,
        actorId: playerId,
        toolName: "advance_time",
        summary: "12 minutes pass.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            minutes: 12,
            reason: "Gondola transit from Lantern-Lit Gondola Pier to Tower Bridge east gallery",
            clockAdvanced: true,
          },
        },
      },
      {
        id: "effect-move-gondola",
        actionId: moveActionId,
        actorId: playerId,
        toolName: "move_actor",
        summary: "Player moves to Tower Bridge Concourse - East Gallery Landing.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            kind: "move_actor",
            actorRef: "Player",
            actorRefs: ["Player", "current_player", playerId],
            locationName: "Tower Bridge Concourse - East Gallery Landing",
            travelCost: 1,
            path: ["Lantern-Lit Gondola Pier", "Tower Bridge Concourse - East Gallery Landing"],
          },
        },
      },
    ];
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.narratorFacts.actionIds = [advanceActionId, moveActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: advanceActionId, toolName: "advance_time" },
      { actionId: moveActionId, toolName: "move_actor" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const advanceEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === "perceivable_effect:effect-advance-gondola");
    const moveEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === "perceivable_effect:effect-move-gondola");

    expect(advanceEvidence).toEqual(expect.objectContaining({
      summary: "12 minutes pass.",
      summaryBackendFact: false,
      precisionFacts: expect.arrayContaining([
        expect.objectContaining({
          value: "Gondola transit from Lantern-Lit Gondola Pier to Tower Bridge east gallery takes 12 minutes.",
          claimKind: "playable_beat",
        }),
      ]),
    }));
    expect(moveEvidence).toEqual(expect.objectContaining({
      summary: "Player moves to Tower Bridge Concourse - East Gallery Landing.",
      summaryBackendFact: false,
      precisionFacts: expect.arrayContaining([
        expect.objectContaining({
          value: "You arrive at Tower Bridge Concourse - East Gallery Landing.",
          claimKind: "location_change",
        }),
      ]),
    }));
  });

  it("does not duplicate duration when advance_time reason already names it", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const advanceActionId = "action-advance-walk";
    canonicalTurnPacket.effects = [
      {
        id: "effect-advance-walk",
        actionId: advanceActionId,
        actorId: playerId,
        toolName: "advance_time",
        summary: "15 minutes pass.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            minutes: 15,
            reason: "Walking the public marked way from Canal Market District to Tower Bridge Concourse takes approximately 15 minutes.",
            clockAdvanced: true,
          },
        },
      },
    ];
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.narratorFacts.actionIds = [advanceActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: advanceActionId, toolName: "advance_time" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const advanceEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === "perceivable_effect:effect-advance-walk");

    expect(advanceEvidence?.precisionFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value: "Walking the public marked way from Canal Market District to Tower Bridge Concourse takes approximately 15 minutes.",
        claimKind: "playable_beat",
      }),
    ]));
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("15 minutes takes 15 minutes");
  });

  it("formats elapsed action clauses as playable beats instead of receipt-style duration tails", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const advanceActionId = "action-copy-ridge-marker";
    canonicalTurnPacket.effects = [
      {
        id: "effect-copy-ridge-marker",
        actionId: advanceActionId,
        actorId: playerId,
        toolName: "advance_time",
        summary: "5 minutes pass.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            minutes: 5,
            reason:
              "Fen reads the Ridge Marker aloud while the player copies the exact wording into their damaged field ledger; a few minutes of careful documentation work at the gatehouse threshold before stepping out onto the northern path.",
            clockAdvanced: true,
          },
        },
      },
    ];
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.narratorFacts.actionIds = [advanceActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: advanceActionId, toolName: "advance_time" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const advanceEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === "perceivable_effect:effect-copy-ridge-marker");

    expect(advanceEvidence?.precisionFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        value:
          "5 minutes pass as Fen reads the Ridge Marker aloud while the player copies the exact wording into their damaged field ledger.",
        claimKind: "playable_beat",
      }),
    ]));
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("takes 5 minutes");
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("a few minutes of careful documentation work");
  });

  it("exposes public minor-POI descriptions as narratable backend facts", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const poiActionId = "action-create-ridge-marker";
    canonicalTurnPacket.effects = [
      {
        id: "effect-create-ridge-marker",
        actionId: poiActionId,
        actorId: playerId,
        toolName: "create_minor_poi",
        summary: "Ridge Marker becomes available near Disaster Route Gatehouse.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            id: "loc-ridge-marker",
            name: "Ridge Marker",
            connectedTo: "Disaster Route Gatehouse",
            kind: "minor_poi",
            poiType: "notice_board",
            visibility: "public",
            description:
              "Inscription at the Ventwatch Ridge boundary marker: 'NORTHERN LAVA-TUBE - VENTWATCH BOUNDARY - CLEARANCE ZONE 7-N.'",
          },
        },
      },
    ];
    canonicalTurnPacket.actionResults = [];
    canonicalTurnPacket.narratorFacts.actionIds = [poiActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: poiActionId, toolName: "create_minor_poi" },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const poiEvidence = packet.evidenceLedger?.find((entry) =>
      entry.id === "perceivable_effect:effect-create-ridge-marker");

    expect(poiEvidence).toEqual(expect.objectContaining({
      summaryBackendFact: false,
      precisionFacts: expect.arrayContaining([
        expect.objectContaining({
          value:
            "Inscription at the Ventwatch Ridge boundary marker: 'NORTHERN LAVA-TUBE - VENTWATCH BOUNDARY - CLEARANCE ZONE 7-N.'",
          sourcePath: "toolResult.result.description",
          claimKind: "playable_beat",
        }),
        expect.objectContaining({
          value: "Ridge Marker is available near Disaster Route Gatehouse.",
          claimKind: "route_status",
        }),
      ]),
    }));
  });

  it("does not let observation-only scene-extra reuse authorize hidden labels in later effects", () => {
    const frame = createFrame();
    frame.roster.active = frame.roster.active.filter((actor) => actor.id === playerId);
    frame.perception.forbiddenActorLabels = ["Advocate Pelorren"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.playerAction =
      "I try a playful low-risk bluff with an invented civic phrase.";
    canonicalTurnPacket.effects = [
      {
        id: `action-result:${successfulActionId}`,
        actionId: successfulActionId,
        actorId: playerId,
        toolName: "create_scene_extra",
        summary: "create_scene_extra settled through backend observation.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          kind: "observation",
          observationOnly: true,
          result: {
            id: "npc-advocate-pelorren",
            name: "Advocate Pelorren",
            reusedExisting: true,
          },
        },
      },
      {
        id: `action-result:${secondActionId}`,
        actionId: secondActionId,
        actorId: playerId,
        toolName: "log_event",
        summary:
          "Sera Venn bluffed Advocate Pelorren with the invented phrase; Pelorren treated it as harmless confusion.",
        perceivableByPlayer: true,
        toolResult: {
          success: true,
          result: {
            durability: "scene_local",
            persisted: false,
          },
        },
      },
    ];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-reuse-advocate",
        actorId: playerId,
        toolName: "create_scene_extra",
        input: {
          role: "witness",
          roleText: "Public advocate",
          locationRef: "current_scene",
        },
        args: {
          role: "witness",
          roleText: "Public advocate",
          locationRef: "current_scene",
        },
        result: canonicalTurnPacket.effects[0]!.toolResult!,
      },
      {
        order: 1,
        actionId: secondActionId,
        actionRef: "step-log-bluff",
        actorId: playerId,
        toolName: "log_event",
        input: {
          text: "Sera Venn bluffed Advocate Pelorren with the invented phrase; Pelorren treated it as harmless confusion.",
          durability: "scene_local",
        },
        args: {
          text: "Sera Venn bluffed Advocate Pelorren with the invented phrase; Pelorren treated it as harmless confusion.",
          durability: "scene_local",
        },
        result: canonicalTurnPacket.effects[1]!.toolResult!,
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId, secondActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "create_scene_extra" },
      { actionId: secondActionId, toolName: "log_event" },
    ];

    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
    });

    expect(packet.allowedVisibleActorNames).not.toContain("Advocate Pelorren");
    expect(packet.forbiddenActorNames).toContain("Advocate Pelorren");
    expect(packet.perceivableEffects.map((effect) => effect.summary).join("\n")).not.toContain(
      "Advocate Pelorren",
    );
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("Advocate Pelorren");
  });

  it("rejects same-turn visible actor creation label substrings", () => {
    const frame = createFrame();
    frame.perception.forbiddenActorLabels = ["Market Ledger Clerk", "Hidden Inspector"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-create-canal-market-ledger-clerk",
        actorId: visibleNpcId,
        toolName: "create_scene_extra",
        input: {
          name: "Canal Market Ledger Clerk",
          locationRef: "current_scene",
        },
        args: {
          name: "Canal Market Ledger Clerk",
          locationRef: "current_scene",
        },
        result: {
          success: true,
          result: {
            id: "npc-canal-market-ledger-clerk",
            name: "Canal Market Ledger Clerk",
          },
        },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [{
      actionId: successfulActionId,
      toolName: "create_scene_extra",
    }];

    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
    });

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "Canal Market Ledger Clerk becomes visibly present in the scene.",
    );
    expect(packet.forbiddenActorNames).toContain("Market Ledger Clerk");
    expect(packet.forbiddenActorNames).toContain("Hidden Inspector");
    expect(() => formatNarratorPacketForPrompt(packet)).toThrow(/NarratorPacket prompt unsafe/);
  });

  it("does not allow private terms embedded in same-turn visible actor creation labels", () => {
    const frame = createFrame();
    frame.perception.forbiddenActorLabels = ["Forest Outpost Clerk"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-create-forest-outpost-clerk",
        actorId: visibleNpcId,
        toolName: "create_scene_extra",
        input: {
          name: "Forest Outpost Clerk",
          locationRef: "current_scene",
        },
        args: {
          name: "Forest Outpost Clerk",
          locationRef: "current_scene",
        },
        result: {
          success: true,
          result: {
            id: "npc-forest-outpost-clerk",
            name: "Forest Outpost Clerk",
          },
        },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [{
      actionId: successfulActionId,
      toolName: "create_scene_extra",
    }];

    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
      forbiddenPrivateTerms: ["Forest Outpost"],
    });

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "Forest Outpost Clerk becomes visibly present in the scene.",
    );
    expect(packet.forbiddenActorNames).toContain("Forest Outpost Clerk");
    expect(packet.forbiddenPrivateTerms).toContain("Forest Outpost");
    expect(() => formatNarratorPacketForPrompt(packet)).toThrow(/NarratorPacket prompt unsafe/);
  });

  it("does not let a shorter visible actor creation suppress a longer hidden actor label", () => {
    const frame = createFrame();
    frame.perception.forbiddenActorLabels = ["Canal Market Ledger Clerk"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-create-market-ledger-clerk",
        actorId: visibleNpcId,
        toolName: "create_scene_extra",
        input: {
          name: "Market Ledger Clerk",
          locationRef: "current_scene",
        },
        args: {
          name: "Market Ledger Clerk",
          locationRef: "current_scene",
        },
        result: {
          success: true,
          result: {
            id: "npc-market-ledger-clerk",
            name: "Market Ledger Clerk",
          },
        },
      },
      {
        order: 1,
        actionId: secondActionId,
        actionRef: "step-hidden-longer-label-leak",
        actorId: visibleNpcId,
        toolName: "log_event",
        input: {
          text: "Canal Market Ledger Clerk watches from the offscreen booth.",
        },
        args: {
          text: "Canal Market Ledger Clerk watches from the offscreen booth.",
        },
        result: {
          success: true,
          result: { eventId: "event-hidden-longer-label-leak" },
        },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId, secondActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "create_scene_extra" },
      { actionId: secondActionId, toolName: "log_event" },
    ];

    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
    });

    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "Market Ledger Clerk becomes visibly present in the scene.",
    );
    expect(packet.forbiddenActorNames).toContain("Canal Market Ledger Clerk");
    expect(packet.perceivableEffects.map((effect) => effect.summary).join("\n")).not.toContain(
      "Canal Market Ledger Clerk watches",
    );
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("Canal Market Ledger Clerk watches");
  });

  it("keeps hidden actor labels forbidden when they are not same-turn visible creations", () => {
    const frame = createFrame();
    frame.perception.forbiddenActorLabels = ["Station Attendant", "Back-Room Auditor"];
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-spawn-station-attendant",
        actorId: visibleNpcId,
        toolName: "spawn_npc",
        input: {
          name: "generated-placeholder",
          locationRef: "current_scene",
        },
        args: {
          name: "generated-placeholder",
          locationRef: "current_scene",
        },
        result: {
          success: true,
          result: { id: "npc-station-attendant", name: "Station Attendant" },
        },
      },
      {
        order: 1,
        actionId: secondActionId,
        actionRef: "step-hidden-leak",
        actorId: visibleNpcId,
        toolName: "log_event",
        input: {
          text: "Back-Room Auditor watches from the offscreen booth.",
        },
        args: {
          text: "Back-Room Auditor watches from the offscreen booth.",
        },
        result: {
          success: true,
          result: { eventId: "event-hidden-leak" },
        },
      },
    ];
    canonicalTurnPacket.narratorFacts.actionIds = [successfulActionId, secondActionId];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [
      { actionId: successfulActionId, toolName: "spawn_npc" },
      { actionId: secondActionId, toolName: "log_event" },
    ];

    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
    });

    expect(packet.forbiddenActorNames).toContain("Station Attendant");
    expect(packet.forbiddenActorNames).toContain("Back-Room Auditor");
    expect(packet.perceivableEffects.map((effect) => effect.summary)).toContain(
      "Station Attendant becomes visibly present in the scene.",
    );
    expect(packet.perceivableEffects.map((effect) => effect.summary).join("\n")).not.toContain(
      "Back-Room Auditor",
    );
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("Back-Room Auditor");
  });

  it("does not infer intent-marker perceivable effects directly from referenced action results", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    const acceptedActions: CanonicalTurnPacket["actionResults"] = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-move-actor",
        actorId: playerId,
        toolName: "move_actor",
        input: {
          actorRef: "Iria",
          destinationRef: "Tea Lane",
          evidenceRefs: ["route-tea-lane"],
        },
        args: {
          actorRef: "Iria",
          destinationRef: "Tea Lane",
          evidenceRefs: ["route-tea-lane"],
        },
        result: {
          success: true,
          result: {
            kind: "move_actor",
            actorRef: "Iria",
            locationId: "loc-tea-lane",
            locationName: "Tea Lane",
            travelCost: 1,
            path: ["Market District", "Tea Lane"],
          },
        },
      },
      {
        order: 1,
        actionId: secondActionId,
        actionRef: "step-minor-poi",
        actorId: visibleNpcId,
        toolName: "create_minor_poi",
        input: {
          poiType: "tea_stall",
          areaRef: "current_location",
          reason: "A public market supports ordinary tea service.",
        },
        args: {
          poiType: "tea_stall",
          areaRef: "current_location",
          reason: "A public market supports ordinary tea service.",
        },
        result: {
          success: true,
          result: {
            kind: "minor_poi",
            id: "loc-tea-stall",
            name: "Lantern Tea Stall",
            connectedTo: "Market District",
            poiType: "tea_stall",
          },
        },
      },
      {
        order: 2,
        actionId: thirdActionId,
        actionRef: "step-scene-extra",
        actorId: visibleNpcId,
        toolName: "create_scene_extra",
        input: {
          role: "courier",
          reason: "A temporary clerk can answer routine public questions.",
        },
        args: {
          role: "courier",
          reason: "A temporary clerk can answer routine public questions.",
        },
        result: {
          success: true,
          result: {
            kind: "scene_extra",
            id: "npc-counter-courier",
            name: "Counter Courier",
            role: "courier",
          },
        },
      },
      {
        order: 3,
        actionId: fourthActionId,
        actionRef: "step-search",
        actorId: playerId,
        toolName: "start_search",
        input: { actorRef: "Iria", query: "tea stall" },
        args: { actorRef: "Iria", query: "tea stall" },
        result: {
          success: true,
          result: {
            kind: "search_started",
            actorRef: "Iria",
            query: "tea stall",
            found: false,
            discoveryCreated: false,
            targetTruth: "unconfirmed",
          },
        },
      },
      {
        order: 4,
        actionId: fifthActionId,
        actionRef: "step-intent",
        actorId: playerId,
        toolName: "record_player_intent",
        input: { actorRef: "Iria", intentType: "claim", targetHint: "hidden courier route" },
        args: { actorRef: "Iria", intentType: "claim", targetHint: "hidden courier route" },
        result: {
          success: true,
          result: {
            kind: "player_intent_recorded",
            actorRef: "Iria",
            intentType: "claim",
            targetHint: "hidden courier route",
            claimTruth: "unconfirmed",
            proofCreated: false,
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
    const summaries = packet.perceivableEffects.map((effect) => effect.summary);

    expect(summaries).toEqual([
      "Iria moves to Tea Lane.",
      "Lantern Tea Stall becomes reachable from Market District.",
      "Counter Courier becomes visibly present in the scene.",
    ]);
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("starts searching for tea stall");
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("records an unconfirmed intent");
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("found tea stall");
    expect(formatNarratorPacketForPrompt(packet)).not.toContain("confirmed hidden courier route");
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
        expected: "You arrive at Lantern Pier.",
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

  it("summarizes observation lookup results without exposing tool names as scene prose", () => {
    const summary = summarizeRuntimeToolResultForNarrator({
      toolName: "find_location_candidates",
      actionId: successfulActionId,
      toolInput: { query: "original square" },
      toolArgs: { query: "original square" },
      toolResult: {
        success: true,
        kind: "observation",
        observationOnly: true,
        result: {
          queryMatched: false,
          candidates: [],
          count: 0,
        },
      },
    });

    expect(summary).toContain("No matching visible or reachable location is confirmed");
    expect(summary).not.toContain("find_location_candidates");
    expect(summary).not.toContain("find location");
    expect(summary).not.toContain("sweep");
    expect(summary).not.toMatch(/validated .* consequence/i);
  });

  it("keeps lookup-grounded observations as packet evidence instead of asking final prose to invent status", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.turnResolution = {
      kind: "status_read",
      resolutionState: "observation_grounded",
      combatIntent: false,
      evidenceIds: [`action-result:${successfulActionId}`],
      consequenceIds: [],
      explicitNoCombatEvidenceIds: [`action-result:${successfulActionId}`],
      toolNames: ["list_visible_affordances"],
    };
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.narratorFacts.actionIds = [];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 0,
        actionId: successfulActionId,
        actionRef: "step-observe",
        actorId: playerId,
        toolName: "list_visible_affordances",
        input: { focus: "personnel routes public desk" },
        args: { focus: "personnel routes public desk" },
        result: {
          success: true,
          kind: "observation",
          observationOnly: true,
          result: {
            visibleActors: [{ label: "Mira", type: "npc" }],
            categories: {
              personnel: {
                actors: [{ label: "Mira", type: "npc" }],
                absence: null,
              },
              barriers: {
                absence: "No visible barrier refs are present.",
              },
            },
          },
        },
        summary:
          "Scene scan: personnel Mira; barriers No visible barrier refs are present.",
      },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });
    const formatted = formatNarratorPacketForPrompt(packet);

    expect(packet.perceivableEffects).toEqual([]);
    expect(packet.perceivableObservations?.map((observation) => observation.summary)).toEqual([
      "Scene scan: personnel Mira; barriers No visible barrier refs are present.",
    ]);
    expect(packet.perceivableObservations?.[0]?.atoms).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "actor",
          summary: "Mira",
          claimSupport: expect.arrayContaining(["actor_presence"]),
        }),
        expect.objectContaining({
          kind: "absence",
          summary: "No visible barrier refs are present.",
          claimSupport: expect.arrayContaining(["route_status"]),
        }),
      ]),
    );
    expect(packet.evidenceLedger).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: `observation_result:${successfulActionId}:a1`,
          category: "observation_result",
          summary: "Mira",
          claimSupport: expect.arrayContaining(["actor_presence"]),
        }),
        expect.objectContaining({
          category: "observation_result",
          summary: "No visible barrier refs are present.",
          claimSupport: expect.arrayContaining(["route_status"]),
        }),
      ]),
    );
    expect(formatted).toContain("[PLAYER-VISIBLE OBSERVATIONS]");
    expect(formatted).toContain("o1.a1 [actor]: Mira");
  });

  it("omits observation results that are neither turn-resolution evidence nor narratorFacts", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.turnResolution = {
      kind: "state_mutation",
      resolutionState: "mutated",
      combatIntent: false,
      evidenceIds: [`action-result:${successfulActionId}`],
      consequenceIds: [`action-result:${successfulActionId}`],
      explicitNoCombatEvidenceIds: [],
      toolNames: ["log_event", "list_visible_affordances"],
    };
    canonicalTurnPacket.effects = [];
    canonicalTurnPacket.narratorFacts.actionIds = [];
    canonicalTurnPacket.narratorFacts.toolResultRefs = [];
    canonicalTurnPacket.actionResults = [
      {
        order: 1,
        actionId: "observation-not-accepted",
        actionRef: "step-observe-extra",
        actorId: playerId,
        toolName: "list_visible_affordances",
        input: { focus: "remote route rumor" },
        args: { focus: "remote route rumor" },
        result: {
          success: true,
          kind: "observation",
          observationOnly: true,
          result: {
            categories: {
              routes: {
                facts: [{
                  id: "remote-route-rumor",
                  summary: "A remote service stair might exist beyond the scene.",
                }],
                absence: null,
              },
            },
          },
        },
        summary: "Scene scan: routes A remote service stair might exist beyond the scene.",
      },
    ];

    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });

    expect(packet.perceivableObservations).toEqual([]);
    expect(packet.evidenceLedger).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "observation_result",
        }),
      ]),
    );
  });

  it("redacts backend refs from committed prompt summaries", () => {
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket: createCanonicalTurnPacket(),
    });
    packet.perceivableEvents[0] = {
      ...packet.perceivableEvents[0]!,
      summary: "Iria cites actor:hidden-watcher and route_hidden_path.",
    };
    packet.perceivableResponses[0] = {
      ...packet.perceivableResponses[0]!,
      summary: "Mira mentions tool_result_8 and location:loc-secret.",
    };
    packet.perceivableEffects[0] = {
      ...packet.perceivableEffects[0]!,
      summary: "The lock logs authority:gm-loop and source:event-1.",
    };
    packet.currentInventory = [
      {
        id: "inventory-secret",
        itemId: "item-secret",
        label: "Satchel actor_hidden",
        equipState: "carried",
        equippedSlot: null,
        isSignature: false,
        tags: ["route-tea-lane"],
      },
    ];
    packet.hintSignals = ["A hint mentions campaign-main."];
    packet.guardrails = ["Never expose tool-result-7."];
    packet.sourceLinkedSummaries = [{
      id: "summary-raw-refs",
      summary: "Overflow mentions candidate_secret and 550e8400-e29b-41d4-a716-446655440000.",
      sourceIds: ["event-1"],
      summarizedItemCount: 1,
    }];

    const formatted = formatNarratorPacketForPrompt(packet);

    expect(formatted).toContain("[backend ref hidden]");
    for (const leaked of [
      "actor:hidden-watcher",
      "route_hidden_path",
      "tool_result_8",
      "location:loc-secret",
      "authority:gm-loop",
      "source:event-1",
      "actor_hidden",
      "route-tea-lane",
      "campaign-main",
      "tool-result-7",
      "candidate_secret",
      "550e8400",
    ]) {
      expect(formatted).not.toContain(leaked);
    }
  });

  it("redacts backend refs from oracle outcomes while preserving safe prose markers", () => {
    const canonicalTurnPacket = createCanonicalTurnPacket();
    canonicalTurnPacket.oracleOutcome =
      "weak_hit with actor:hidden-watcher, route_hidden_path, tool-result-7, " +
      "source:event-1, effect_hidden, response-visible-1, " +
      "550e8400-e29b-41d4-a716-446655440000, source-linked, player-facing, " +
      "player_known, and player_visible.";
    const packet = buildNarratorPacket({
      frame: createFrame(),
      canonicalTurnPacket,
    });

    const formatted = formatNarratorPacketForPrompt(packet);

    expect(formatted).toContain("[backend ref hidden]");
    for (const leaked of [
      "actor:hidden-watcher",
      "route_hidden_path",
      "tool-result-7",
      "source:event-1",
      "effect_hidden",
      "response-visible-1",
      "550e8400",
    ]) {
      expect(formatted).not.toContain(leaked);
    }
    for (const safeMarker of [
      "source-linked",
      "player-facing",
      "player_known",
      "player_visible",
    ]) {
      expect(formatted).toContain(safeMarker);
    }
  });

  it("does not expose structural refs in dialogue/world-fact narrator summaries", () => {
    const dialogueSummary = summarizeRuntimeToolResultForNarrator({
      toolName: "record_dialogue_outcome",
      actionId: successfulActionId,
      toolInput: {
        outcomeKind: "answer",
        topicKind: "proof",
        authorityKind: "explicit_source",
        truthStatus: "reported",
        durability: "scene_local",
        speakerRef: "actor_2",
        addresseeRefs: ["Player", "actor:private-handler"],
        sourceRefs: ["event:secret-route"],
        claims: [
          {
            claimKind: "procedure",
            polarity: "affirmed",
            subjectRef: "route_1",
          },
        ],
      },
      toolArgs: {},
    });
    const factSummary = summarizeRuntimeToolResultForNarrator({
      toolName: "record_world_fact",
      actionId: successfulActionId,
      toolInput: {
        factKind: "procedure",
        topicKind: "proof",
        truthStatus: "reported",
        sourceKind: "observed",
        durability: "persistent",
        subjectRefs: ["loc-secret-vault", "movement_1"],
        sourceRefs: ["tool-result-abc"],
        claims: [
          {
            claimKind: "procedure",
            polarity: "affirmed",
            subjectText: "posted item applies",
          },
        ],
      },
      toolArgs: {},
    });

    expect(dialogueSummary).not.toContain("actor_2");
    expect(dialogueSummary).not.toContain("actor:private-handler");
    expect(dialogueSummary).not.toContain("event:secret-route");
    expect(dialogueSummary).not.toContain("route_1");
    expect(dialogueSummary).toContain("referenced speaker");
    expect(dialogueSummary).toContain("referenced subject");
    expect(factSummary).not.toContain("loc-secret-vault");
    expect(factSummary).not.toContain("movement_1");
    expect(factSummary).not.toContain("tool-result-abc");
    expect(factSummary).toContain("posted item applies");
  });
});
