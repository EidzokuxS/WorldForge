import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  actorKnowledgeRecords,
  authorityTraces,
  campaigns,
  items,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  players,
  simulationProposals,
  turnClockLedger,
  worldClocks,
} from "../../db/schema.js";
import {
  assertSceneFrameEnvelopeV2,
  assertTurnAttemptContextV2,
  buildApiResponseProjectionV2,
  assertTurnStartEnvelopeV2,
  admitExplicitMovementV2,
  apiResponseProjectionV2Schema,
  buildNarratorViewV2,
  buildModelFacingTurnPacketV2,
  buildGameplayRefRegistryV2,
  buildNoReceiptSettledTurnPacketV2 as buildNoReceiptSettledTurnPacketCoreV2,
  buildGmJudgePromptV2,
  buildGmJudgeSystemPromptV2,
  buildOraclePayloadV2 as buildOraclePayloadCoreV2,
  buildOracleSettlementV2 as buildOracleSettlementCoreV2,
  buildOracleSettledTurnPacketV2 as buildOracleSettledTurnPacketCoreV2,
  buildSettledPacketPersistencePendingV2,
  capabilityForEffectKindV2,
  composeGameplayCycleMutatingTurnV2 as composeGameplayCycleMutatingTurnCoreV2,
  formatModelFacingTurnPacketForPromptV2,
  GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS,
  getRuntimeCapabilityDefinitionV2,
  finalizeGameplayCycleV2Packet,
  executeGameplayToolRequestV2,
  gameplayRuntimeReceiptV2Schema,
  buildRuntimeReceiptLedgerV2,
  buildRuntimeSettledTurnPacketV2 as buildRuntimeSettledTurnPacketCoreV2,
  gmReadCandidateV2LooseSchema,
  createDbBackedGameplayToolHandlersV2,
  refreshFrameAfterAcceptedMutationV2,
  scheduleLocalConsequencesV2,
  listRuntimeCapabilityDefinitionsV2,
  markGameplayCycleV2PacketNarratorRendering,
  markGameplayCycleV2PacketNarratorFailedPendingRetry,
  persistSettledTurnPacketV2,
  readGameplayCycleV2Packet,
  compileSimpleGmActionChecklistV2 as compileSimpleGmActionChecklistCoreV2,
  validateGmActionChecklistV2 as validateGmActionChecklistCoreV2,
  validateGameplayToolRequestV2,
  normalizeRuntimeReceiptEvidenceV2,
  resolveGameplayRefV2,
  validateGmReadChecklistV2 as validateGmReadChecklistCoreV2,
  validateGmJudgeV2,
  validateGmReadOracleV2 as validateGmReadOracleCoreV2,
  validateGmReadNoMutationV2,
  validateGmReadV2,
  modelFacingTurnPacketSchema,
  settledTurnPacketV2Schema,
  runtimeCapabilityIdSchema,
  gameplayToolRequestV2Schema,
  toolIdForCapabilityV2,
  sceneFrameEnvelopeSchema,
  turnAttemptContextSchema,
  turnStartEnvelopeSchema,
  type TurnAttemptContextV2,
  type RuntimeCapabilityIdV2,
  type ExplicitMovementAdmissionV2,
  type GmJudgeChecklistV2,
  type GmJudgeOracleV2,
} from "../gameplay-cycle-v2/index.js";
import { buildSceneFrame, type SceneFrame } from "../scene-frame.js";
import type { ScopedForecastExcerpt } from "../world-forecast.js";

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected object fixture.");
  }
  return value as Record<string, unknown>;
}

function withoutFixtureSidecars(candidate: unknown): unknown {
  const record = asRecord(candidate);
  const {
    checklistRequest: _checklistRequest,
    oracleRequest: _oracleRequest,
    ...rest
  } = record;
  return rest;
}

function buildCompatGmJudgeFromLegacyGmReadV2(input: {
  gmRead: any;
}): any {
  const read = input.gmRead;
  if (read.path === "tool_plan") {
    return {
      version: "gm-judge.v2",
      lane: "action_checklist",
      physicalPossibility: "possible",
      checkNeed: "backend_action_checklist",
      actorRefs: read.checklistRequest.actorRefs,
      targetRefs: read.checklistRequest.targetRefs,
      evidenceRefs: read.checklistRequest.evidenceRefs,
      rationale: read.rationale,
      checklistAdmission: read.checklistRequest,
    } satisfies GmJudgeChecklistV2;
  }
  if (read.path === "roll_oracle") {
    return {
      version: "gm-judge.v2",
      lane: "roll_oracle",
      physicalPossibility: "uncertain",
      checkNeed: "oracle_uncertainty",
      actorRefs: [read.oracleRequest.actorRef],
      targetRefs: read.oracleRequest.targetRefs,
      evidenceRefs: read.oracleRequest.evidenceRefs,
      rationale: read.rationale,
      oracleAdmission: {
        ...read.oracleRequest,
        postOracleRoute: "settle_visible_outcome_only",
      },
    } satisfies GmJudgeOracleV2;
  }
  if (read.path === "clarification") {
    return {
      version: "gm-judge.v2",
      lane: "clarification",
      physicalPossibility: "underspecified",
      checkNeed: "clarification_needed",
      actorRefs: read.focalActorRefs,
      targetRefs: read.actionInterpretation.targetRefs,
      evidenceRefs: read.evidenceRefs,
      rationale: read.rationale,
      clarificationPrompt: read.clarificationPrompt ?? "Please clarify the action.",
    };
  }
  return {
    version: "gm-judge.v2",
    lane: read.path,
    physicalPossibility: "possible",
    checkNeed: "no_check",
    actorRefs: read.focalActorRefs,
    targetRefs: read.actionInterpretation.targetRefs,
    evidenceRefs: read.evidenceRefs,
    rationale: read.rationale,
    noMutationReason: read.noMutationReason,
  };
}

function validateGmReadChecklistV2(input: Parameters<typeof validateGmReadChecklistCoreV2>[0]): any {
  const admission = asRecord(input.candidate).checklistRequest;
  const result = validateGmReadChecklistCoreV2({
    ...input,
    candidate: withoutFixtureSidecars(input.candidate),
  });
  if (result.status === "accepted") {
    return {
      ...result,
      read: {
        ...result.read,
        checklistRequest: admission,
      },
    };
  }
  return result;
}

function validateGmReadOracleV2(input: Parameters<typeof validateGmReadOracleCoreV2>[0]): any {
  const admission = asRecord(input.candidate).oracleRequest;
  const result = validateGmReadOracleCoreV2({
    ...input,
    candidate: withoutFixtureSidecars(input.candidate),
  });
  if (result.status === "accepted") {
    return {
      ...result,
      read: {
        ...result.read,
        oracleRequest: admission,
      },
    };
  }
  return result;
}

function checklistJudgeFor(input: { gmRead: any; gmJudge?: GmJudgeChecklistV2 }): GmJudgeChecklistV2 {
  return input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead });
}

function validateGmActionChecklistV2(input: any): ReturnType<typeof validateGmActionChecklistCoreV2> {
  return validateGmActionChecklistCoreV2({
    ...input,
    gmJudge: checklistJudgeFor(input),
  });
}

function compileSimpleGmActionChecklistV2(input: any): ReturnType<typeof compileSimpleGmActionChecklistCoreV2> {
  return compileSimpleGmActionChecklistCoreV2({
    ...input,
    gmJudge: checklistJudgeFor(input),
  });
}

function buildRuntimeSettledTurnPacketV2(input: any): ReturnType<typeof buildRuntimeSettledTurnPacketCoreV2> {
  return buildRuntimeSettledTurnPacketCoreV2({
    ...input,
    gmJudge: input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead }),
  });
}

function composeGameplayCycleMutatingTurnV2(
  input: Omit<Parameters<typeof composeGameplayCycleMutatingTurnCoreV2>[0], "gmJudge"> & {
    gmJudge?: GmJudgeChecklistV2;
  },
): ReturnType<typeof composeGameplayCycleMutatingTurnCoreV2> {
  return composeGameplayCycleMutatingTurnCoreV2({
    ...input,
    gmJudge: input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead }),
  });
}

function buildNoReceiptSettledTurnPacketV2(input: any): ReturnType<typeof buildNoReceiptSettledTurnPacketCoreV2> {
  return buildNoReceiptSettledTurnPacketCoreV2({
    ...input,
    gmJudge: input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead }),
  });
}

function buildOraclePayloadV2(input: any): ReturnType<typeof buildOraclePayloadCoreV2> {
  return buildOraclePayloadCoreV2({
    ...input,
    gmJudge: input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead }),
  });
}

function buildOracleSettlementV2(input: any): ReturnType<typeof buildOracleSettlementCoreV2> {
  return buildOracleSettlementCoreV2({
    ...input,
    gmJudge: input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead }),
  });
}

function buildOracleSettledTurnPacketV2(input: any): ReturnType<typeof buildOracleSettledTurnPacketCoreV2> {
  return buildOracleSettledTurnPacketCoreV2({
    ...input,
    gmJudge: input.gmJudge ?? buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: input.gmRead }),
  });
}

function startEnvelope() {
  return {
    version: "turn-start-envelope.v2",
    route: "/api/chat/action",
    campaignId: "campaign-alpha",
    turnId: "turn-alpha",
    playerAction: "I take in the room before doing anything.",
    quickActionSelection: null,
    baseTick: 0,
    chatHistoryLengthBeforeTurn: 0,
    preTurnSnapshot: {
      bundleDir: "snapshots/campaign-alpha/turn-alpha",
      capturedAt: 1,
    },
    providers: {
      judge: { id: "openai", model: "gpt-5.5-pro" },
      storyteller: { id: "openai", model: "gpt-5.5-pro" },
    },
    startedAt: 2,
  };
}

function attemptContext(): TurnAttemptContextV2 {
  return assertTurnAttemptContextV2({
    version: "turn-attempt-context.v2",
    campaignId: "campaign-alpha",
    turnId: "turn-alpha",
    playerAction: "I take in the room before doing anything.",
    baseTick: 0,
    baseWorldVersion: 7,
    chatHistoryLengthBeforeTurn: 0,
    preTurnSnapshot: {
      bundleDir: "snapshots/campaign-alpha/turn-alpha",
      capturedAt: 1,
    },
    idempotencyKey: "turn-alpha:0:7",
    allowedTerminalStates: [
      "pre_settlement_restore",
      "pending_narration",
      "finalized_done",
    ],
    settlementPhase: "pre_settlement",
  });
}

function refreshedAttemptContext(overrides: Partial<TurnAttemptContextV2> = {}): TurnAttemptContextV2 {
  return assertTurnAttemptContextV2({
    ...attemptContext(),
    baseWorldVersion: 8,
    settlementPhase: "settled_packet_persisted",
    ...overrides,
  });
}

function sceneFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    campaignId: "campaign-alpha",
    tick: 0,
    worldVersion: 7,
    playerActorId: "player-alpha",
    currentLocationId: "location-alpha",
    currentSceneScopeId: "scene-alpha",
    currentLocationName: "Atrium",
    currentSceneScopeName: "Atrium Floor",
    playerAction: "I take in the room before doing anything.",
    roster: {
      active: [{
        id: "actor-npc-1",
        actorId: "actor-npc-1",
        type: "npc",
        label: "Clerk Mara",
        locationId: "location-alpha",
        sceneScopeId: "scene-alpha",
        awareness: "clear",
        awarenessHint: "watching the desk",
      }],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
    },
    recentEvents: [{
      id: "event-secret-id",
      tick: 0,
      summary: "A bell rang in the atrium.",
      source: "location_recent_event",
      actorIds: ["actor-npc-1"],
      perceivableByPlayer: true,
    }],
    targetCandidates: [{
      id: "item-secret-id",
      type: "item",
      label: "brass ledger",
      itemId: "item-secret-id",
      tags: ["document"],
    }],
    movementCandidates: [{
      id: "route-secret-id",
      locationId: "location-beta",
      label: "North Hall",
      connected: true,
      travelCost: 1,
    }],
    playerInventory: [{
      id: "inventory-secret-id",
      itemId: "item-player-1",
      label: "sealed note",
      tags: ["document"],
      equipState: "carried",
      equippedSlot: null,
      isSignature: false,
    }],
    deferredHooks: [],
    allowedTools: [],
    oracle: null,
    ...overrides,
  };
}

function scopedForecast(): ScopedForecastExcerpt {
  return {
    version: "scoped-forecast-excerpt.v1",
    baseTick: 0,
    promptReady: true,
    entries: [{
      entryId: "forecast-pressure-1",
      horizonTicks: 3,
      subjectRefs: [{
        type: "scene",
        id: "Atrium",
        label: "Atrium",
      }],
      confidence: 0.4,
      pressure: "Foot traffic may increase if the player waits.",
      preconditions: [],
    }],
    forbiddenPrivateTerms: ["hidden courier"],
  };
}

function movementToolPlanFixture(options: {
  privateGuardTerms?: string[];
  allowedCapabilityIds?: RuntimeCapabilityIdV2[];
} = {}) {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Player", "North Hall"],
      privateGuardTerms: options.privateGuardTerms ?? [],
      allowedCapabilityIds: options.allowedCapabilityIds ?? ["observe_visible", "movement", "route_check"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player wants to move to North Hall.",
      sceneQuestion: "What movement consequence must be planned?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "North Hall"],
      actionInterpretation: {
        intent: "Move to North Hall.",
        method: "walk",
        targetRefs: ["North Hall"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Movement needs backend settlement.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["movement"],
        actorRefs: ["Player"],
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        checklistGoal: "Plan movement.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Checklist GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-tool-request-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Move to North Hall.",
      steps: [{
        stepId: "step-1",
        purpose: "Move the player to North Hall.",
        actorRef: "Player",
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        requiredCapabilityId: "movement",
        intendedEffect: {
          kind: "movement",
          summary: "The player moves to North Hall.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "The player arrives in North Hall.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function routeCheckToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Player", "North Hall"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "route_check"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player checks whether North Hall is reachable.",
      sceneQuestion: "What route check must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "North Hall"],
      actionInterpretation: {
        intent: "Check route to North Hall.",
        method: "look before moving",
        targetRefs: ["North Hall"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "A concrete exposed route can be checked without movement.",
      checklistRequest: {
        turnPath: "procedural",
        requiredEffectKinds: ["route_check"],
        actorRefs: ["Player"],
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        checklistGoal: "Check route availability without moving.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Route-check GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-route-request-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "procedural",
      turnIntent: "Check route to North Hall.",
      steps: [{
        stepId: "step-1",
        purpose: "Check whether North Hall is an exposed legal route.",
        actorRef: "Player",
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        requiredCapabilityId: "route_check",
        intendedEffect: {
          kind: "route_check",
          summary: "Check whether North Hall is reachable.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "The player learns whether the route is available.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Route-check checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function npcMovementToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Clerk Mara", "North Hall"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "movement"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "Clerk Mara must move to North Hall.",
      sceneQuestion: "What movement consequence must be planned?",
      focalActorRefs: ["Clerk Mara"],
      evidenceRefs: ["Clerk Mara", "Atrium", "North Hall"],
      actionInterpretation: {
        intent: "Move Clerk Mara to North Hall.",
        method: "walk",
        targetRefs: ["North Hall"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Visible NPC movement needs backend settlement.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["movement"],
        actorRefs: ["Clerk Mara"],
        targetRefs: ["North Hall"],
        evidenceRefs: ["Clerk Mara", "Atrium", "North Hall"],
        checklistGoal: "Move the visible NPC.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("NPC movement GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-npc-move-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Move Clerk Mara to North Hall.",
      steps: [{
        stepId: "step-1",
        purpose: "Move Clerk Mara to North Hall.",
        actorRef: "Clerk Mara",
        targetRefs: ["North Hall"],
        evidenceRefs: ["Clerk Mara", "Atrium", "North Hall"],
        requiredCapabilityId: "movement",
        intendedEffect: {
          kind: "movement",
          summary: "Clerk Mara moves to North Hall.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "Clerk Mara arrives in North Hall.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("NPC movement checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function sceneBeatToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Player", "Clerk Mara"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "scene_beat_record"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "A visible scene beat must be settled without structural mutation.",
      sceneQuestion: "What local beat should be recorded for narration?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium"],
      actionInterpretation: {
        intent: "Pause near the desk.",
        method: "wait",
        targetRefs: ["Atrium"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "The beat needs terminal receipt evidence only.",
      checklistRequest: {
        turnPath: "procedural",
        requiredEffectKinds: ["scene_beat"],
        actorRefs: ["Player"],
        targetRefs: [],
        evidenceRefs: ["Player", "Atrium"],
        checklistGoal: "Record the visible local beat.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Scene beat GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-scene-beat-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "procedural",
      turnIntent: "Record a scene-local beat.",
      steps: [{
        stepId: "step-1",
        purpose: "Record that the player waits near the desk.",
        actorRef: "Player",
        targetRefs: [],
        evidenceRefs: ["Player", "Atrium"],
        requiredCapabilityId: "scene_beat_record",
        intendedEffect: {
          kind: "scene_beat",
          summary: "The player waits near the desk.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "The local beat is available to narration.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Scene beat checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function dialogueToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Player", "Clerk Mara"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "dialogue_record", "scene_beat_record", "time_advance"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "A visible actor can answer the player's procedural question.",
      sceneQuestion: "What visible dialogue outcome must be recorded?",
      focalActorRefs: ["Clerk Mara"],
      evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
      actionInterpretation: {
        intent: "Ask Clerk Mara for the desk procedure.",
        method: "spoken question",
        targetRefs: ["Clerk Mara"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "The visible answer needs terminal receipt evidence without durable memory.",
      checklistRequest: {
        turnPath: "procedural",
        requiredEffectKinds: ["dialogue_outcome"],
        actorRefs: ["Clerk Mara"],
        targetRefs: ["Player"],
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        checklistGoal: "Record Clerk Mara's visible answer as terminal dialogue evidence only.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Dialogue GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-dialogue-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "procedural",
      turnIntent: "Record a visible dialogue outcome.",
      steps: [{
        stepId: "step-1",
        purpose: "Record Clerk Mara's answer.",
        actorRef: "Clerk Mara",
        targetRefs: ["Player"],
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        requiredCapabilityId: "dialogue_record",
        intendedEffect: {
          kind: "dialogue_outcome",
          summary: "Clerk Mara answers the procedural question.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "Clerk Mara's answer is available to narration.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Dialogue checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function dialogueToWorldFactToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Player", "Clerk Mara"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "dialogue_record", "world_fact_record"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player asks for a procedure and wants to remember it.",
      sceneQuestion: "What dialogue and player-known knowledge effects must be settled?",
      focalActorRefs: ["Player", "Clerk Mara"],
      evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
      actionInterpretation: {
        intent: "Ask Clerk Mara and record the answer as a future-usable procedure.",
        method: "spoken question and note-taking",
        targetRefs: ["Clerk Mara"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "The answer must be recorded first; durable player-known knowledge is a separate mutation.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["dialogue_outcome", "world_fact"],
        actorRefs: ["Player", "Clerk Mara"],
        targetRefs: ["Clerk Mara"],
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        checklistGoal: "Record Clerk Mara's answer, then record the player-known procedure sourced to that receipt.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Dialogue-to-world-fact GM Read fixture must be accepted.");
  }
  const gmJudge = checklistJudgeFor({ gmRead: readResult.read });
  const dialogueThenFactJudge: GmJudgeChecklistV2 = {
    ...gmJudge,
    checklistAdmission: {
      ...gmJudge.checklistAdmission,
      requiredEffectKinds: ["dialogue_outcome", "world_fact"],
      actorRefs: ["Player", "Clerk Mara"],
      targetRefs: ["Player", "Clerk Mara"],
      evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
      checklistGoal: "Record Clerk Mara's answer, then record the player-known procedure sourced to that receipt.",
    },
  };
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    gmJudge: dialogueThenFactJudge,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-dialogue-world-fact-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Record visible answer and player-known procedure.",
      steps: [
        {
          stepId: "step-1",
          purpose: "Record Clerk Mara's visible answer.",
          actorRef: "Clerk Mara",
          targetRefs: ["Player"],
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          requiredCapabilityId: "dialogue_record",
          intendedEffect: {
            kind: "dialogue_outcome",
            summary: "Clerk Mara gives the desk procedure.",
            stateScope: "local_scene",
          },
          expectedVisibleEffect: "Clerk Mara's quoted answer is settled.",
          dependsOnStepIds: [],
        },
        {
          stepId: "step-2",
          purpose: "Record the quoted procedure as player-known knowledge.",
          actorRef: "Player",
          targetRefs: ["Clerk Mara"],
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          requiredCapabilityId: "world_fact_record",
          intendedEffect: {
            kind: "world_fact",
            summary: "Player records Clerk Mara's procedure as future-usable knowledge.",
            stateScope: "knowledge",
          },
          expectedVisibleEffect: "Accepted player-known knowledge mutation receipt.",
          dependsOnStepIds: ["step-1"],
        },
      ],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Dialogue-to-world-fact checklist fixture must be accepted.");
  }

  return {
    packet,
    gmRead: readResult.read,
    gmJudge: dialogueThenFactJudge,
    checklist: checklistResult.checklist,
  };
}

function supportActorToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Atrium Floor", "Player"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "support_actor_create"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player looks for a temporary local helper in the current scene.",
      sceneQuestion: "What support actor creation must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
      actionInterpretation: {
        intent: "Find a nearby dockhand helper.",
        method: "look around the current scene",
        targetRefs: ["Atrium Floor"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Creating a visible temporary support actor requires backend mutation authority.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["support_actor_create"],
        actorRefs: ["Player"],
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        checklistGoal: "Create one temporary current-scene support actor if accepted by backend authority.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Support actor GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-support-actor-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Create a temporary local dockhand.",
      steps: [{
        stepId: "step-1",
        purpose: "Create one temporary dockhand support actor in the current scene.",
        actorRef: "Player",
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        requiredCapabilityId: "support_actor_create",
        intendedEffect: {
          kind: "support_actor_create",
          summary: "A temporary dockhand support actor becomes visible in the current scene.",
          stateScope: "actor",
        },
        expectedVisibleEffect: "A temporary dockhand support actor is available in the current scene.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Support actor checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function minorPoiToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Atrium Floor", "Player"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "minor_poi_create"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player looks for an ordinary visible notice board in the current scene.",
      sceneQuestion: "What minor point of interest must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
      actionInterpretation: {
        intent: "Find a notice board near the atrium entrance.",
        method: "look around the current scene",
        targetRefs: ["Atrium Floor"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Creating a visible current-scene POI requires backend mutation authority.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["minor_poi_create"],
        actorRefs: ["Player"],
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        checklistGoal: "Create one visible current-scene minor POI if accepted by backend authority.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Minor POI GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-minor-poi-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Create a visible local notice board.",
      steps: [{
        stepId: "step-1",
        purpose: "Create one visible notice board target in the current scene.",
        actorRef: "Player",
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        requiredCapabilityId: "minor_poi_create",
        intendedEffect: {
          kind: "minor_poi_create",
          summary: "A notice board becomes visible as a current-scene point of interest.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "A visible notice board POI is available in the current scene.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Minor POI checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function locationRevealToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Atrium Floor", "Player"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "location_reveal"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player identifies a visible service window as a local place handle.",
      sceneQuestion: "What place-handle reveal must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
      actionInterpretation: {
        intent: "Make the service window a citable current-scene place handle.",
        method: "use visible current-scene evidence",
        targetRefs: ["Atrium Floor"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "A visible place handle requires backend local-scene mutation authority.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["location_reveal"],
        actorRefs: ["Player"],
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        checklistGoal: "Reveal one source-bounded visible current-scene place handle if accepted by backend authority.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Location reveal GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-location-reveal-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Reveal a visible local service window handle.",
      steps: [{
        stepId: "step-1",
        purpose: "Reveal one visible current-scene service window handle.",
        actorRef: "Player",
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        requiredCapabilityId: "location_reveal",
        intendedEffect: {
          kind: "location_reveal",
          summary: "A service window becomes visible as a current-scene place handle.",
          stateScope: "local_scene",
        },
        expectedVisibleEffect: "A visible service window place handle is available in the current scene.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Location reveal checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function entityTagToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Player", "brass ledger"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "entity_tag"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player marks the visible brass ledger.",
      sceneQuestion: "What tag mutation must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "brass ledger"],
      actionInterpretation: {
        intent: "Mark the brass ledger as suspicious.",
        method: "write a visible mark",
        targetRefs: ["brass ledger"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "A visible object tag needs backend mutation authority.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["entity_tag"],
        actorRefs: ["Player"],
        targetRefs: ["brass ledger"],
        evidenceRefs: ["Player", "Atrium", "brass ledger"],
        checklistGoal: "Apply one concrete tag to the visible ledger.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Entity-tag GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-entity-tag-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Mark the brass ledger.",
      steps: [{
        stepId: "step-1",
        purpose: "Apply the suspicious tag to the visible brass ledger.",
        actorRef: "Player",
        targetRefs: ["brass ledger"],
        evidenceRefs: ["Player", "Atrium", "brass ledger"],
        requiredCapabilityId: "entity_tag",
        intendedEffect: {
          kind: "entity_tag",
          summary: "The brass ledger is marked suspicious.",
          stateScope: "item",
        },
        expectedVisibleEffect: "The brass ledger carries the suspicious tag.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Entity-tag checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function itemTransferToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Atrium Floor", "Player", "Clerk Mara", "sealed note", "brass ledger"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "item_transfer"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player puts down a modeled inventory item in the current scene.",
      sceneQuestion: "What item custody mutation must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
      actionInterpretation: {
        intent: "Drop the sealed note in the current scene.",
        method: "put it down",
        targetRefs: ["sealed note", "Atrium Floor"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "A modeled item custody/location change requires backend item authority.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["item_transfer"],
        actorRefs: ["Player"],
        targetRefs: ["sealed note", "Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
        checklistGoal: "Move the modeled inventory item into the current scene.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Item-transfer GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-item-transfer-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Drop the sealed note.",
      steps: [{
        stepId: "step-1",
        purpose: "Move sealed note from player inventory to the current scene.",
        actorRef: "Player",
        targetRefs: ["sealed note", "Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
        requiredCapabilityId: "item_transfer",
        intendedEffect: {
          kind: "item_transfer",
          summary: "The sealed note is no longer in player inventory and is visible in the current scene.",
          stateScope: "item",
        },
        expectedVisibleEffect: "The sealed note is placed in the current scene.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Item-transfer checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function actorConditionToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: attemptContext(),
    frame: sceneFrame(),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Atrium Floor", "Player", "Clerk Mara"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "condition_set"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player deliberately drops to one knee in the current scene.",
      sceneQuestion: "What actor condition mutation must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
      actionInterpretation: {
        intent: "Set the player's visible posture to prone.",
        method: "physical posture change",
        targetRefs: ["Player"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "A concrete visible actor condition requires backend actor authority.",
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["condition"],
        actorRefs: ["Player"],
        targetRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        checklistGoal: "Apply one concrete visible Player condition through actor condition authority.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Actor condition GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-actor-condition-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "mutating",
      turnIntent: "Set the Player prone condition.",
      steps: [{
        stepId: "step-1",
        purpose: "Set the Player's visible posture condition to prone.",
        actorRef: "Player",
        targetRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        requiredCapabilityId: "condition_set",
        intendedEffect: {
          kind: "condition",
          summary: "The Player is visibly prone in the current scene.",
          stateScope: "actor",
        },
        expectedVisibleEffect: "Accepted actor condition mutation receipt for Player.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Actor condition checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function timeAdvanceToolPlanFixture() {
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt: assertTurnAttemptContextV2({
      ...attemptContext(),
      playerAction: "I stay in the atrium and wait exactly fifteen minutes.",
    }),
    frame: sceneFrame({
      playerAction: "I stay in the atrium and wait exactly fifteen minutes.",
    }),
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: ["Atrium", "Atrium Floor", "Player"],
      privateGuardTerms: [],
      allowedCapabilityIds: ["observe_visible", "time_advance"],
    },
  }));
  const readResult = validateGmReadChecklistV2({
    packet,
    candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player explicitly waits in the current scene.",
      sceneQuestion: "What elapsed-time authority must be settled?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
      actionInterpretation: {
        intent: "Wait exactly fifteen minutes in the current scene.",
        method: "wait",
        targetRefs: ["Atrium Floor"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Explicit elapsed time requires backend clock authority.",
      checklistRequest: {
        turnPath: "procedural",
        requiredEffectKinds: ["time_advance"],
        actorRefs: ["Player"],
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        checklistGoal: "Advance only the world clock for the player's explicit wait.",
      },
    },
  });
  expect(readResult.status).toBe("accepted");
  if (readResult.status !== "accepted") {
    throw new Error("Time-advance GM Read fixture must be accepted.");
  }
  const checklistResult = validateGmActionChecklistV2({
    packet,
    gmRead: readResult.read,
    candidate: {
      version: "gm-action-checklist.v2",
      checklistId: "checklist-time-advance-1",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      baseWorldVersion: 7,
      sourceGmReadPath: "tool_plan",
      turnPath: "procedural",
      turnIntent: "Wait exactly fifteen minutes.",
      steps: [{
        stepId: "step-1",
        purpose: "Advance the world clock for the explicit wait only.",
        actorRef: "Player",
        targetRefs: ["Atrium Floor"],
        evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        requiredCapabilityId: "time_advance",
        intendedEffect: {
          kind: "time_advance",
          summary: "Fifteen in-world minutes pass in the current scene.",
          stateScope: "world",
        },
        expectedVisibleEffect: "Accepted elapsed-time receipt for the current scene clock.",
        dependsOnStepIds: [],
      }],
    },
  });
  expect(checklistResult.status).toBe("accepted");
  if (checklistResult.status !== "accepted") {
    throw new Error("Time-advance checklist fixture must be accepted.");
  }

  return { packet, gmRead: readResult.read, checklist: checklistResult.checklist };
}

function dbTempFixture(prefix: string): {
  tempDir: string;
  cleanup: () => void;
} {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));
  connectDb(join(tempDir, "state.db"));
  runMigrations();
  return {
    tempDir,
    cleanup: () => {
      closeDb();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

function seedP16World(options: {
  disconnectedRoute?: boolean;
  worldVersion?: number;
} = {}): void {
  const timestamp = 1_000;
  const db = getDb();
  db.insert(campaigns).values({
    id: "campaign-alpha",
    name: "P16 Fixture",
    premise: "A test campaign for gameplay-cycle-v2 handlers.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  db.insert(locations).values([{
    id: "location-alpha",
    campaignId: "campaign-alpha",
    name: "Atrium",
    description: "The current broad location.",
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: true,
    connectedTo: "[]",
  }, {
    id: "scene-alpha",
    campaignId: "campaign-alpha",
    name: "Atrium Floor",
    description: "The current scene scope.",
    kind: "ephemeral_scene",
    parentLocationId: null,
    anchorLocationId: "location-alpha",
    persistence: "ephemeral",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: false,
    connectedTo: "[]",
  }, {
    id: "location-beta",
    campaignId: "campaign-alpha",
    name: "North Hall",
    description: "A connected destination.",
    kind: "macro",
    parentLocationId: null,
    anchorLocationId: null,
    persistence: "persistent",
    expiresAtTick: null,
    archivedAtTick: null,
    tags: "[]",
    isStarting: false,
    connectedTo: "[]",
  }]).run();
  if (!options.disconnectedRoute) {
    db.insert(locationEdges).values({
      id: "edge-alpha-beta",
      campaignId: "campaign-alpha",
      fromLocationId: "location-alpha",
      toLocationId: "location-beta",
      travelCost: 2,
      discovered: true,
    }).run();
  }
  db.insert(players).values({
    id: "player-alpha",
    campaignId: "campaign-alpha",
    name: "Player",
    race: "human",
    gender: "",
    age: "",
    appearance: "",
    hp: 5,
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    equippedItems: "[]",
    currentLocationId: "location-alpha",
    currentSceneLocationId: "scene-alpha",
  }).run();
  db.insert(npcs).values({
    id: "actor-npc-1",
    campaignId: "campaign-alpha",
    name: "Clerk Mara",
    persona: "A careful clerk.",
    characterRecord: "{}",
    derivedTags: "[]",
    tags: "[]",
    tier: "persistent",
    currentLocationId: "location-alpha",
    currentSceneLocationId: "scene-alpha",
    goals: '{"short_term":[],"long_term":[]}',
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: timestamp,
  }).run();
  db.insert(items).values([{
    id: "item-secret-id",
    campaignId: "campaign-alpha",
    name: "brass ledger",
    tags: JSON.stringify(["document"]),
    ownerId: null,
    locationId: "scene-alpha",
    equipState: "carried",
    equippedSlot: null,
    isSignature: false,
  }, {
    id: "item-player-1",
    campaignId: "campaign-alpha",
    name: "sealed note",
    tags: JSON.stringify(["document"]),
    ownerId: "player-alpha",
    locationId: null,
    equipState: "carried",
    equippedSlot: null,
    isSignature: false,
  }]).run();
  db.insert(worldClocks).values({
    campaignId: "campaign-alpha",
    worldVersion: options.worldVersion ?? 7,
    worldTimeMinutes: 10,
    currentTick: 0,
    updatedAt: timestamp,
  }).run();
}

function registryForPacket(frame: SceneFrame = sceneFrame()) {
  return buildGameplayRefRegistryV2({
    turnId: "turn-alpha",
    frame,
  });
}

function movementAdmissionFixture(options: {
  playerAction?: string;
  frame?: Partial<SceneFrame>;
  visibleRefs?: string[];
  capabilityIds?: Array<"observe_visible" | "movement" | "route_check">;
} = {}) {
  const playerAction = options.playerAction ?? "I go to North Hall.";
  const attempt = assertTurnAttemptContextV2({
    ...attemptContext(),
    playerAction,
  });
  const frame = sceneFrame({
    playerAction,
    ...options.frame,
  });
  const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
    version: "scene-frame-envelope.v2",
    attempt,
    frame,
    scopedForecastExcerpt: null,
    refs: {
      visibleRefs: options.visibleRefs ?? ["Atrium", "Atrium Floor", "Player", "North Hall"],
      privateGuardTerms: [],
      allowedCapabilityIds: options.capabilityIds ?? ["observe_visible", "movement", "route_check"],
    },
  }));
  return {
    frame,
    packet,
    registry: buildGameplayRefRegistryV2({
      turnId: packet.turnId,
      frame,
    }),
  };
}

describe("gameplay-cycle-v2 primitive contracts", () => {
  it("accepts a transport-owned turn start envelope without gameplay semantics", () => {
    const parsed = assertTurnStartEnvelopeV2(startEnvelope());

    expect(parsed.route).toBe("/api/chat/action");
    expect(parsed.playerAction).toContain("room");
    expect("intent" in parsed).toBe(false);
    expect("method" in parsed).toBe(false);
  });

  it("requires turn attempts to preserve restore, pending narration, and done terminal states", () => {
    expect(turnAttemptContextSchema.safeParse({
      ...attemptContext(),
      allowedTerminalStates: ["finalized_done"],
    }).success).toBe(false);

    expect(attemptContext().allowedTerminalStates).toEqual([
      "pre_settlement_restore",
      "pending_narration",
      "finalized_done",
    ]);
  });

  it("keeps the initial capability catalog free of old runtime tool surfaces", () => {
    for (const forbidden of [
      "move_to",
      "spawn_npc",
      "log_event",
      "add_chronicle_entry",
      "candidateToolRequest",
      "plannedTools",
    ]) {
      expect(runtimeCapabilityIdSchema.safeParse(forbidden).success).toBe(false);
    }

    expect(runtimeCapabilityIdSchema.safeParse("movement").success).toBe(true);
    expect(runtimeCapabilityIdSchema.safeParse("dialogue_record").success).toBe(true);
    expect(runtimeCapabilityIdSchema.safeParse("oracle_roll").success).toBe(true);
    expect(GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS).toContain("runtime-tool-input-schemas");
  });

  it("defines every runtime capability through the v2 capability catalog", () => {
    const ids = runtimeCapabilityIdSchema.options;
    const definitions = listRuntimeCapabilityDefinitionsV2();

    expect(definitions.map((definition) => definition.capabilityId).sort())
      .toEqual([...ids].sort());
    for (const definition of definitions) {
      expect(definition.purpose).not.toMatch(/\bmove_to\b|\bspawn_npc\b|\blog_event\b|\bplannedTools\b/u);
      expect(definition.capabilityId).toBe(getRuntimeCapabilityDefinitionV2(definition.capabilityId).capabilityId);
    }
    expect(getRuntimeCapabilityDefinitionV2("movement")).toMatchObject({
      evidenceAuthority: "mutation_receipt_required",
      plannerSurface: "tool_request",
      ownsEffectKinds: ["movement"],
    });
    expect(getRuntimeCapabilityDefinitionV2("oracle_roll")).toMatchObject({
      evidenceAuthority: "terminal_receipt_required",
      plannerSurface: "oracle",
      ownsEffectKinds: [],
    });
    expect(capabilityForEffectKindV2("dialogue_outcome")).toBe("dialogue_record");
    expect(capabilityForEffectKindV2("route_check")).toBe("route_check");
  });

  it("compiles a simple route-check GM Read into a backend-owned intent checklist", () => {
    const { packet, gmRead } = routeCheckToolPlanFixture();
    const compiled = compileSimpleGmActionChecklistV2({ packet, gmRead });

    expect(compiled?.status).toBe("accepted");
    if (!compiled || compiled.status !== "accepted") {
      throw new Error("Simple route-check checklist must compile.");
    }
    expect(compiled.checklist).toMatchObject({
      version: "gm-action-checklist.v2",
      campaignId: packet.campaignId,
      turnId: packet.turnId,
      baseWorldVersion: packet.baseWorldVersion,
      sourceGmReadPath: "tool_plan",
      turnPath: "procedural",
      steps: [{
        stepId: "step-1",
        actorRef: "Player",
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        requiredCapabilityId: "route_check",
        intendedEffect: {
          kind: "route_check",
          stateScope: "location",
        },
      }],
    });
    const publicShape = JSON.stringify(compiled.checklist);
    expect(publicShape).not.toContain("route.check.v2");
    expect(publicShape).not.toContain("effectBinding");
    expect(publicShape).not.toContain("toolName");
  });

  it("compiles simple movement, dialogue, support actor, entity tag, item transfer, condition, time advance, and scene-beat GM Reads without executable payloads", () => {
    const movement = movementAdmissionFixture();
    const acceptedMovement = validateGmReadChecklistV2({
      packet: movement.packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player explicitly moves to North Hall.",
        sceneQuestion: "What backend movement must settle?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium Floor", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium Floor", "North Hall"],
          checklistGoal: "Settle the explicit movement only through an accepted movement receipt.",
        },
      },
    });
    expect(acceptedMovement.status).toBe("accepted");
    if (acceptedMovement.status !== "accepted") {
      throw new Error("Movement GM Read must be accepted.");
    }
    const compiledMovement = compileSimpleGmActionChecklistV2({
      packet: movement.packet,
      gmRead: acceptedMovement.read,
    });
    expect(compiledMovement?.status).toBe("accepted");
    if (!compiledMovement || compiledMovement.status !== "accepted") {
      throw new Error("Simple movement checklist must compile.");
    }
    expect(compiledMovement.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "movement",
      intendedEffect: {
        kind: "movement",
        stateScope: "actor",
      },
    });

    const dialogue = dialogueToolPlanFixture();
    const compiledDialogue = compileSimpleGmActionChecklistV2({
      packet: dialogue.packet,
      gmRead: dialogue.gmRead,
    });
    expect(compiledDialogue?.status).toBe("accepted");
    if (!compiledDialogue || compiledDialogue.status !== "accepted") {
      throw new Error("Simple dialogue checklist must compile.");
    }
    expect(compiledDialogue.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "dialogue_record",
      targetRefs: ["Player"],
      intendedEffect: {
        kind: "dialogue_outcome",
        stateScope: "local_scene",
      },
    });

    const sceneBeat = sceneBeatToolPlanFixture();
    const compiledSceneBeat = compileSimpleGmActionChecklistV2({
      packet: sceneBeat.packet,
      gmRead: sceneBeat.gmRead,
    });
    expect(compiledSceneBeat?.status).toBe("accepted");
    if (!compiledSceneBeat || compiledSceneBeat.status !== "accepted") {
      throw new Error("Simple scene-beat checklist must compile.");
    }
    expect(compiledSceneBeat.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "scene_beat_record",
      targetRefs: [],
      intendedEffect: {
        kind: "scene_beat",
        stateScope: "local_scene",
      },
    });

    const supportActor = supportActorToolPlanFixture();
    const compiledSupportActor = compileSimpleGmActionChecklistV2({
      packet: supportActor.packet,
      gmRead: supportActor.gmRead,
    });
    expect(compiledSupportActor?.status).toBe("accepted");
    if (!compiledSupportActor || compiledSupportActor.status !== "accepted") {
      throw new Error("Simple support-actor checklist must compile.");
    }
    expect(compiledSupportActor.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "support_actor_create",
      targetRefs: ["Atrium Floor"],
      intendedEffect: {
        kind: "support_actor_create",
        stateScope: "actor",
      },
    });

    const minorPoi = minorPoiToolPlanFixture();
    const compiledMinorPoi = compileSimpleGmActionChecklistV2({
      packet: minorPoi.packet,
      gmRead: minorPoi.gmRead,
    });
    expect(compiledMinorPoi?.status).toBe("accepted");
    if (!compiledMinorPoi || compiledMinorPoi.status !== "accepted") {
      throw new Error("Simple minor-POI checklist must compile.");
    }
    expect(compiledMinorPoi.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "minor_poi_create",
      targetRefs: ["Atrium Floor"],
      intendedEffect: {
        kind: "minor_poi_create",
        stateScope: "local_scene",
      },
    });

    const entityTag = entityTagToolPlanFixture();
    const compiledEntityTag = compileSimpleGmActionChecklistV2({
      packet: entityTag.packet,
      gmRead: entityTag.gmRead,
    });
    expect(compiledEntityTag?.status).toBe("accepted");
    if (!compiledEntityTag || compiledEntityTag.status !== "accepted") {
      throw new Error("Simple entity-tag checklist must compile.");
    }
    expect(compiledEntityTag.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "entity_tag",
      targetRefs: ["brass ledger"],
      intendedEffect: {
        kind: "entity_tag",
        stateScope: "item",
      },
    });

    const itemTransfer = itemTransferToolPlanFixture();
    const compiledItemTransfer = compileSimpleGmActionChecklistV2({
      packet: itemTransfer.packet,
      gmRead: itemTransfer.gmRead,
    });
    expect(compiledItemTransfer?.status).toBe("accepted");
    if (!compiledItemTransfer || compiledItemTransfer.status !== "accepted") {
      throw new Error("Simple item-transfer checklist must compile.");
    }
    expect(compiledItemTransfer.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "item_transfer",
      targetRefs: ["sealed note", "Atrium Floor"],
      intendedEffect: {
        kind: "item_transfer",
        stateScope: "item",
      },
    });

    const actorCondition = actorConditionToolPlanFixture();
    const compiledActorCondition = compileSimpleGmActionChecklistV2({
      packet: actorCondition.packet,
      gmRead: actorCondition.gmRead,
    });
    expect(compiledActorCondition?.status).toBe("accepted");
    if (!compiledActorCondition || compiledActorCondition.status !== "accepted") {
      throw new Error("Simple actor-condition checklist must compile.");
    }
    expect(compiledActorCondition.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "condition_set",
      targetRefs: ["Player"],
      intendedEffect: {
        kind: "condition",
        stateScope: "actor",
      },
    });

    const timeAdvance = timeAdvanceToolPlanFixture();
    const compiledTimeAdvance = compileSimpleGmActionChecklistV2({
      packet: timeAdvance.packet,
      gmRead: timeAdvance.gmRead,
    });
    expect(compiledTimeAdvance?.status).toBe("accepted");
    if (!compiledTimeAdvance || compiledTimeAdvance.status !== "accepted") {
      throw new Error("Simple time-advance checklist must compile.");
    }
    expect(compiledTimeAdvance.checklist.steps[0]).toMatchObject({
      requiredCapabilityId: "time_advance",
      targetRefs: ["Atrium Floor"],
      intendedEffect: {
        kind: "time_advance",
        stateScope: "world",
      },
    });

    const publicShape = JSON.stringify({
      movement: compiledMovement.checklist,
      dialogue: compiledDialogue.checklist,
      sceneBeat: compiledSceneBeat.checklist,
      supportActor: compiledSupportActor.checklist,
      entityTag: compiledEntityTag.checklist,
      itemTransfer: compiledItemTransfer.checklist,
      actorCondition: compiledActorCondition.checklist,
      timeAdvance: compiledTimeAdvance.checklist,
    });
    expect(publicShape).not.toContain("actor.move.v2");
    expect(publicShape).not.toContain("dialogue.record.v2");
    expect(publicShape).not.toContain("support_actor.create.v2");
    expect(publicShape).not.toContain("scene_beat.record.v2");
    expect(publicShape).not.toContain("entity.tag.v2");
    expect(publicShape).not.toContain("item.transfer.v2");
    expect(publicShape).not.toContain("actor.condition_set.v2");
    expect(publicShape).not.toContain("time.advance.v2");
    expect(publicShape).not.toContain("effectBinding");
  });

  it("compiles multi-effect route and movement admissions in executable dependency order", () => {
    const { packet, gmRead } = movementToolPlanFixture();
    const gmJudge = checklistJudgeFor({ gmRead });
    const routeThenMoveJudge: GmJudgeChecklistV2 = {
      ...gmJudge,
      checklistAdmission: {
        ...gmJudge.checklistAdmission,
        requiredEffectKinds: ["route_check", "movement"],
        checklistGoal: "Check route availability, then move to North Hall.",
      },
    };

    const compiled = compileSimpleGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: routeThenMoveJudge,
    });

    expect(compiled?.status).toBe("accepted");
    if (!compiled || compiled.status !== "accepted") {
      throw new Error("Multi-effect movement checklist must compile.");
    }
    expect(compiled.checklist.steps).toMatchObject([
      {
        stepId: "step-1",
        requiredCapabilityId: "route_check",
        intendedEffect: {
          kind: "route_check",
          stateScope: "location",
        },
        dependsOnStepIds: [],
      },
      {
        stepId: "step-2",
        requiredCapabilityId: "movement",
        intendedEffect: {
          kind: "movement",
          stateScope: "actor",
        },
        dependsOnStepIds: ["step-1"],
      },
    ]);
    const publicShape = JSON.stringify(compiled.checklist);
    expect(publicShape).not.toContain("route.check.v2");
    expect(publicShape).not.toContain("actor.move.v2");
    expect(publicShape).not.toContain("effectBinding");
  });

  it("compiles dialogue then player-known world fact admissions without invoking checklist payload planning", () => {
    const { packet, gmRead, gmJudge } = dialogueToWorldFactToolPlanFixture();

    const compiled = compileSimpleGmActionChecklistV2({ packet, gmRead, gmJudge });

    expect(compiled?.status).toBe("accepted");
    if (!compiled || compiled.status !== "accepted") {
      throw new Error("Dialogue-to-world-fact checklist must compile.");
    }
    expect(compiled.checklist.steps).toMatchObject([
      {
        stepId: "step-1",
        actorRef: "Player",
        requiredCapabilityId: "dialogue_record",
        intendedEffect: {
          kind: "dialogue_outcome",
          stateScope: "local_scene",
        },
        dependsOnStepIds: [],
      },
      {
        stepId: "step-2",
        actorRef: "Player",
        requiredCapabilityId: "world_fact_record",
        intendedEffect: {
          kind: "world_fact",
          stateScope: "knowledge",
        },
        dependsOnStepIds: ["step-1"],
      },
    ]);
    const publicShape = JSON.stringify(compiled.checklist);
    expect(publicShape).not.toContain("dialogue.record.v2");
    expect(publicShape).not.toContain("world_fact.record.v2");
    expect(publicShape).not.toContain("effectBinding");
  });

  it("compiles dialogue plus local scene-beat admissions as a terminal non-mutating graph", () => {
    const { packet, gmRead } = dialogueToolPlanFixture();
    const judge = checklistJudgeFor({ gmRead });
    const dialogueThenBeatJudge: GmJudgeChecklistV2 = {
      ...judge,
      checklistAdmission: {
        ...judge.checklistAdmission,
        requiredEffectKinds: ["dialogue_outcome", "scene_beat"],
        actorRefs: ["Player", "Clerk Mara"],
        targetRefs: ["Player", "Clerk Mara"],
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        checklistGoal: "Record the visible reply and the player's local non-moving scene beat.",
      },
    };

    const compiled = compileSimpleGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: dialogueThenBeatJudge,
    });

    expect(compiled?.status).toBe("accepted");
    if (!compiled || compiled.status !== "accepted") {
      throw new Error("Dialogue plus scene-beat checklist must compile.");
    }
    expect(compiled.checklist.steps).toMatchObject([
      {
        stepId: "step-1",
        requiredCapabilityId: "dialogue_record",
        intendedEffect: {
          kind: "dialogue_outcome",
          stateScope: "local_scene",
        },
        dependsOnStepIds: [],
      },
      {
        stepId: "step-2",
        requiredCapabilityId: "scene_beat_record",
        intendedEffect: {
          kind: "scene_beat",
          stateScope: "local_scene",
        },
        dependsOnStepIds: [],
      },
    ]);
    const publicShape = JSON.stringify(compiled.checklist);
    expect(publicShape).not.toContain("dialogue.record.v2");
    expect(publicShape).not.toContain("scene_beat.record.v2");
    expect(publicShape).not.toContain("effectBinding");
  });

  it("compiles dialogue plus local stay and elapsed-time admissions without free-form checklist planning", () => {
    const { packet, gmRead } = dialogueToolPlanFixture();
    const judge = checklistJudgeFor({ gmRead });
    const dialogueStayWaitJudge: GmJudgeChecklistV2 = {
      ...judge,
      checklistAdmission: {
        ...judge.checklistAdmission,
        turnPath: "mutating",
        requiredEffectKinds: ["dialogue_outcome", "scene_beat", "time_advance"],
        actorRefs: ["Player", "Clerk Mara"],
        targetRefs: ["Player", "Clerk Mara", "Atrium"],
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        checklistGoal: "Record the visible reply, the player's local stay, and explicit elapsed time.",
      },
    };

    const compiled = compileSimpleGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: dialogueStayWaitJudge,
    });

    expect(compiled?.status).toBe("accepted");
    if (!compiled || compiled.status !== "accepted") {
      throw new Error("Dialogue plus local stay/time checklist must compile.");
    }
    expect(compiled.checklist.steps.map((step) => ({
      stepId: step.stepId,
      capability: step.requiredCapabilityId,
      effectKind: step.intendedEffect.kind,
    }))).toEqual([
      { stepId: "step-1", capability: "dialogue_record", effectKind: "dialogue_outcome" },
      { stepId: "step-2", capability: "scene_beat_record", effectKind: "scene_beat" },
      { stepId: "step-3", capability: "time_advance", effectKind: "time_advance" },
    ]);
    const publicShape = JSON.stringify(compiled.checklist);
    expect(publicShape).not.toContain("dialogue.record.v2");
    expect(publicShape).not.toContain("scene_beat.record.v2");
    expect(publicShape).not.toContain("time.advance.v2");
    expect(publicShape).not.toContain("effectBinding");
  });

  it("does not compile unsupported mixed simple-effect graphs without an explicit dependency rule", () => {
    const { packet, gmRead } = dialogueToolPlanFixture();
    const judge = checklistJudgeFor({ gmRead });
    const unsupportedJudge: GmJudgeChecklistV2 = {
      ...judge,
      checklistAdmission: {
        ...judge.checklistAdmission,
        requiredEffectKinds: ["support_actor_create", "dialogue_outcome"],
        actorRefs: ["Clerk Mara"],
        targetRefs: ["Clerk Mara"],
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        checklistGoal: "Create a support actor and then use dialogue, which requires an explicit refresh graph.",
      },
    };

    expect(compileSimpleGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: unsupportedJudge,
    })).toBeNull();
  });

  it("accepts a SceneFrame envelope only when frame and attempt authority match", () => {
    const parsed = assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: ["offscreen pressure"],
        allowedCapabilityIds: ["observe_visible", "route_options"],
      },
    });

    expect(parsed.frame.worldVersion).toBe(7);
    expect(parsed.refs.allowedCapabilityIds).toEqual(["observe_visible", "route_options"]);
  });

  it("rejects SceneFrame envelopes with stale frame state", () => {
    expect(sceneFrameEnvelopeSchema.safeParse({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame({ worldVersion: 8 }),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }).success).toBe(false);
  });

  it("rejects backend-only refs and legacy tool names in model-facing frame refs", () => {
    const base = {
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    };

    expect(sceneFrameEnvelopeSchema.safeParse({
      ...base,
      refs: { ...base.refs, visibleRefs: ["actor:player-alpha"] },
    }).success).toBe(false);
    expect(sceneFrameEnvelopeSchema.safeParse({
      ...base,
      refs: { ...base.refs, visibleRefs: ["550e8400-e29b-41d4-a716-446655440000"] },
    }).success).toBe(false);
    expect(sceneFrameEnvelopeSchema.safeParse({
      ...base,
      refs: { ...base.refs, visibleRefs: ["move_to"] },
    }).success).toBe(false);
  });

  it("rejects legacy compatibility fields at the new start-envelope boundary", () => {
    expect(turnStartEnvelopeSchema.safeParse({
      ...startEnvelope(),
      intent: "legacy mirror",
      method: "",
    }).success).toBe(false);
  });

  it("builds a prompt-safe model-facing packet from labels, not backend ids", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: scopedForecast(),
      refs: {
        visibleRefs: ["Atrium", "Clerk Mara"],
        privateGuardTerms: ["private faction timer"],
        allowedCapabilityIds: ["observe_visible", "route_options", "dialogue_record"],
      },
    }));

    expect(packet.scene.actors.map((actor) => actor.ref)).toContain("Clerk Mara");
    expect(packet.scene.movementOptions[0]).toMatchObject({ ref: "North Hall" });
    expect(packet.scene.targets[0]).toMatchObject({ ref: "brass ledger" });
    expect(packet.scene.inventory[0]).toMatchObject({ ref: "sealed note" });
    expect(packet.capabilities.map((capability) => capability.capabilityId)).toEqual([
      "observe_visible",
      "route_options",
      "dialogue_record",
    ]);
    const dialogueCapability = getRuntimeCapabilityDefinitionV2("dialogue_record");
    expect(packet.capabilities.find((capability) => capability.capabilityId === "dialogue_record"))
      .toEqual({
        capabilityId: dialogueCapability.capabilityId,
        purpose: dialogueCapability.purpose,
        evidenceAuthority: dialogueCapability.evidenceAuthority,
      });
    expect(JSON.stringify(packet)).not.toContain("actor-npc-1");
    expect(JSON.stringify(packet)).not.toContain("route-secret-id");
    expect(JSON.stringify(packet)).not.toContain("item-secret-id");
  });

  it("projects the player only through the canonical Player ref", () => {
    const frame = sceneFrame({
      roster: {
        active: [{
          id: "actor-player-1",
          actorId: "player-alpha",
          type: "player",
          label: "Mira Voss",
          locationId: "location-alpha",
          sceneScopeId: "scene-alpha",
          awareness: "clear",
          awarenessHint: "ready to move",
        }, ...sceneFrame().roster.active],
        support: [],
        background: [],
      },
      targetCandidates: [{
        id: "target-player-1",
        type: "actor",
        label: "Mira Voss",
        actorId: "player-alpha",
        tags: ["player"],
      }, ...sceneFrame().targetCandidates],
    });
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame,
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement", "route_check"],
      },
    }));

    expect(packet.scene.actors.map((actor) => actor.ref)).toEqual(["Player", "Clerk Mara"]);
    expect(packet.scene.targets.map((target) => target.ref)).not.toContain("Mira Voss");
    expect(packet.citableRefs).toContain("Player");
    expect(packet.citableRefs).not.toContain("Mira Voss");

    const registry = buildGameplayRefRegistryV2({ turnId: packet.turnId, frame });
    expect(registry.entries.find((entry) =>
      entry.ref === "Mira Voss" && entry.kind === "visible_actor")).toBeUndefined();
    expect(registry.entries.find((entry) =>
      entry.ref === "Mira Voss" && entry.kind === "visible_target")).toBeUndefined();
  });

  it("keeps private guard terms out of the prompt payload", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: scopedForecast(),
      refs: {
        visibleRefs: ["Atrium", "Clerk Mara"],
        privateGuardTerms: ["private faction timer"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    expect(packet.runtimePrivateGuardTerms).toEqual([
      "private faction timer",
      "hidden courier",
    ]);
    const promptPayload = formatModelFacingTurnPacketForPromptV2(packet);
    expect(JSON.stringify(promptPayload)).not.toContain("private faction timer");
    expect(JSON.stringify(promptPayload)).not.toContain("hidden courier");
  });

  it("keeps backend ids in a backend-only v2 ref registry, not the model-facing packet", () => {
    const frame = sceneFrame();
    const envelope = assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame,
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Atrium Floor", "Player", "Clerk Mara", "North Hall", "brass ledger"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement", "route_check"],
      },
    });
    const packet = buildModelFacingTurnPacketV2(envelope);
    const registry = buildGameplayRefRegistryV2({
      turnId: packet.turnId,
      frame,
    });

    expect(JSON.stringify(formatModelFacingTurnPacketForPromptV2(packet))).not.toContain("location-beta");
    expect(JSON.stringify(formatModelFacingTurnPacketForPromptV2(packet))).not.toContain("route-secret-id");

    const destination = resolveGameplayRefV2({
      registry,
      ref: "North Hall",
      allowedKinds: ["movement_option"],
    });
    expect(destination.status).toBe("resolved");
    if (destination.status !== "resolved") {
      throw new Error("Movement destination ref must resolve.");
    }
    expect(destination.entry.ids.locationId).toBe("location-beta");
    expect(destination.entry.ids.candidateId).toBe("route-secret-id");

    const actor = resolveGameplayRefV2({
      registry,
      ref: "Player",
      allowedKinds: ["player_actor"],
    });
    expect(actor.status).toBe("resolved");
    if (actor.status !== "resolved") {
      throw new Error("Player ref must resolve.");
    }
    expect(actor.entry.ids.playerActorId).toBe("player-alpha");
  });

  it("exposes refreshed temporary support actors as playable visible_actor refs after mutation", () => {
    const refreshedFrame = sceneFrame({
      worldVersion: 8,
      roster: {
        ...sceneFrame().roster,
        support: [{
          id: "actor-temp-dockhand",
          actorId: "actor-temp-dockhand",
          type: "npc",
          label: "Local Dockhand",
          locationId: "location-alpha",
          sceneScopeId: "scene-alpha",
          awareness: "clear",
          awarenessHint: "waiting near the loading marks",
        }],
      },
    });
    const refreshedAttempt = refreshedAttemptContext({
      baseWorldVersion: 8,
    });
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: refreshedAttempt,
      frame: refreshedFrame,
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Atrium Floor", "Player", "Local Dockhand"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "dialogue_record"],
      },
    }));
    const registry = buildGameplayRefRegistryV2({
      turnId: packet.turnId,
      frame: refreshedFrame,
    });

    expect(packet.scene.actors).toContainEqual({
      ref: "Local Dockhand",
      label: "Local Dockhand",
      role: "support",
      awarenessHint: "waiting near the loading marks",
      status: {
        conditions: [],
        hp: null,
      },
    });
    expect(packet.citableRefs).toContain("Local Dockhand");
    expect(resolveGameplayRefV2({
      registry,
      ref: "Local Dockhand",
      allowedKinds: ["visible_actor"],
    })).toMatchObject({
      status: "resolved",
      entry: {
        kind: "visible_actor",
        ids: {
          actorId: "actor-temp-dockhand",
          sceneScopeId: "scene-alpha",
        },
      },
    });
    expect(JSON.stringify(packet)).not.toContain("actor-temp-dockhand");
  });

  it("admits explicit movement from packet and registry without tool payload authority", () => {
    const { packet, registry } = movementAdmissionFixture({
      playerAction: "I choose North Hall and walk there.",
    });

    const admission = admitExplicitMovementV2({
      packet,
      refRegistry: registry,
    });

    expect(admission.status).toBe("admitted");
    if (admission.status !== "admitted") throw new Error("Expected movement admission.");
    expect(admission.destinationRef).toBe("North Hall");
    expect(admission.checklistAdmission).toEqual({
      turnPath: "mutating",
      requiredEffectKinds: ["movement"],
      actorRefs: ["Player"],
      targetRefs: ["North Hall"],
      evidenceRefs: ["Player", "Atrium Floor", "North Hall"],
      checklistGoal: "Settle the explicit movement only through an accepted movement receipt.",
    });
    expect(JSON.stringify(admission)).not.toMatch(/\bmove_actor\b|\btoolName\b|\binput\b/u);
  });

  it("does not admit ambiguous, disconnected, or capability-missing movement", () => {
    const duplicate = movementAdmissionFixture({
      playerAction: "I go to North Hall.",
      frame: {
        movementCandidates: [
          {
            id: "route-secret-id",
            locationId: "location-beta",
            label: "North Hall",
            connected: true,
            travelCost: 1,
          },
          {
            id: "route-secret-id-2",
            locationId: "location-gamma",
            label: "North Hall",
            connected: true,
            travelCost: 1,
          },
        ],
      },
    });
    expect(admitExplicitMovementV2({
      packet: duplicate.packet,
      refRegistry: duplicate.registry,
    })).toMatchObject({
      status: "not_admitted",
      reason: "movement destination mention is ambiguous.",
    });

    const disconnected = movementAdmissionFixture({
      playerAction: "I go to North Hall.",
      frame: {
        movementCandidates: [{
          id: "route-secret-id",
          locationId: "location-beta",
          label: "North Hall",
          connected: false,
          travelCost: 1,
        }],
      },
    });
    expect(admitExplicitMovementV2({
      packet: disconnected.packet,
      refRegistry: disconnected.registry,
    })).toMatchObject({
      status: "not_admitted",
    });

    const noCapability = movementAdmissionFixture({
      playerAction: "I go to North Hall.",
      capabilityIds: ["observe_visible", "route_check"],
    });
    expect(admitExplicitMovementV2({
      packet: noCapability.packet,
      refRegistry: noCapability.registry,
    })).toMatchObject({
      status: "not_admitted",
      reason: "movement capability is not available.",
    });
  });

  it("keeps explicit movement admission outside GM Read sidecars", () => {
    const { packet, registry } = movementAdmissionFixture({
      playerAction: "I choose North Hall and walk there.",
    });
    const admission = admitExplicitMovementV2({
      packet,
      refRegistry: registry,
    });
    expect(admission.status).toBe("admitted");

    const readResult = validateGmReadV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player is leaving for North Hall.",
        sceneQuestion: "What backend-owned effect must settle the travel?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium Floor", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement requires backend settlement.",
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") throw new Error("Expected interpretation-only GM Read.");
    expect(admission.status === "admitted" ? admission.checklistAdmission.requiredEffectKinds : [])
      .toEqual(["movement"]);
    expect(JSON.stringify(readResult.read)).not.toContain("checklistRequest");
  });

  it("keeps route-check GM Reads interpretation-only even when exact movement is separately admissible", () => {
    const { packet, registry } = movementAdmissionFixture({
      playerAction: "I do not move; I check whether North Hall is reachable.",
    });
    const admission = admitExplicitMovementV2({
      packet,
      refRegistry: registry,
    });
    expect(admission.status).toBe("admitted");

    const routeCheckResult = validateGmReadV2({
      packet,
      candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player wants route availability without travel.",
      sceneQuestion: "Is North Hall reachable from here?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium Floor", "North Hall"],
      actionInterpretation: {
        intent: "Check route availability without moving.",
        method: "visual route check",
        targetRefs: ["North Hall"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Route availability is observation-only.",
      },
    });
    expect(routeCheckResult.status).toBe("accepted");
    if (routeCheckResult.status !== "accepted") throw new Error("Expected route check GM Read.");
    expect(JSON.stringify(routeCheckResult.read)).not.toContain("checklistRequest");
    expect(admission.status === "admitted" ? admission.checklistAdmission.requiredEffectKinds : [])
      .toEqual(["movement"]);
  });

  it("rejects sidecars and executable payloads in explicit movement GM Read candidates", () => {
    const { packet, registry } = movementAdmissionFixture({
      playerAction: "I choose North Hall and walk there.",
    });
    const admission = admitExplicitMovementV2({
      packet,
      refRegistry: registry,
    });
    expect(admission.status).toBe("admitted");

    const invalid = validateGmReadV2({
      packet,
      candidate: {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player is leaving for North Hall.",
      sceneQuestion: "What backend-owned effect must settle the travel?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "North Hall"],
      actionInterpretation: {
        intent: "Move to North Hall.",
        method: "walk",
        targetRefs: ["North Hall"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Movement requires backend settlement.",
      checklistRequest: admission.status === "admitted" ? admission.checklistAdmission : null,
      toolName: "move_actor",
      },
    });
    expect(invalid.status).toBe("fallback_clarification");
  });

  it("fails closed when a model-safe ref is ambiguous for a handler-owned kind", () => {
    const registry = buildGameplayRefRegistryV2({
      turnId: "turn-alpha",
      frame: sceneFrame({
        movementCandidates: [{
          id: "route-north-1",
          locationId: "location-north-1",
          label: "North Hall",
          connected: true,
          travelCost: 1,
        }, {
          id: "route-north-2",
          locationId: "location-north-2",
          label: "North Hall",
          connected: true,
          travelCost: 2,
        }],
      }),
    });

    const resolution = resolveGameplayRefV2({
      registry,
      ref: "North Hall",
      allowedKinds: ["movement_option"],
    });

    expect(resolution.status).toBe("ambiguous");
    if (resolution.status !== "ambiguous") {
      throw new Error("Duplicate movement label must be ambiguous.");
    }
    expect(resolution.entries.map((entry) => entry.ids.locationId)).toEqual([
      "location-north-1",
      "location-north-2",
    ]);
  });

  it("resolves refs by explicit handler-owned kind instead of semantic label guessing", () => {
    const registry = buildGameplayRefRegistryV2({
      turnId: "turn-alpha",
      frame: sceneFrame({
        currentSceneScopeName: "North Hall",
        currentSceneScopeId: "scene-north-current",
        movementCandidates: [{
          id: "route-secret-id",
          locationId: "location-beta",
          label: "North Hall",
          connected: true,
          travelCost: 1,
        }],
      }),
    });

    const movementResolution = resolveGameplayRefV2({
      registry,
      ref: "North Hall",
      allowedKinds: ["movement_option"],
    });
    expect(movementResolution.status).toBe("resolved");
    if (movementResolution.status !== "resolved") {
      throw new Error("Movement option must resolve by kind.");
    }
    expect(movementResolution.entry.ids.locationId).toBe("location-beta");

    const sceneResolution = resolveGameplayRefV2({
      registry,
      ref: "North Hall",
      allowedKinds: ["current_scene"],
    });
    expect(sceneResolution.status).toBe("resolved");
    if (sceneResolution.status !== "resolved") {
      throw new Error("Current scene must resolve by kind.");
    }
    expect(sceneResolution.entry.ids.locationId).toBe("scene-north-current");
  });

  it("does not expose hidden or background actor labels as model-facing refs", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame({
        roster: {
          active: sceneFrame().roster.active,
          support: [],
          background: [{
            id: "actor-hidden-1",
            actorId: "actor-hidden-1",
            type: "npc",
            label: "Hidden Clerk",
            locationId: "location-alpha",
            sceneScopeId: "scene-alpha",
            awareness: "none",
            awarenessHint: "someone is nearby",
          }],
        },
        perception: {
          ...sceneFrame().perception,
          forbiddenActorLabels: ["Hidden Clerk"],
        },
      }),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara"],
        privateGuardTerms: ["Hidden Clerk"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    expect(JSON.stringify(packet.scene)).not.toContain("Hidden Clerk");
    expect(packet.citableRefs).not.toContain("Hidden Clerk");
    expect(JSON.stringify(formatModelFacingTurnPacketForPromptV2(packet))).not.toContain("Hidden Clerk");
  });

  it("rejects projection packets when private terms leak into public prompt fields", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium"],
        privateGuardTerms: ["forbidden phrase"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    expect(modelFacingTurnPacketSchema.safeParse({
      ...packet,
      scene: {
        ...packet.scene,
        recentEvents: [{
          summary: "The forbidden phrase appears in public text.",
          tick: 0,
          source: "chat_history",
        }],
      },
    }).success).toBe(false);
  });

  it("accepts a grounded direct GM Read without runtime payloads", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadNoMutationV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player pauses to take in the visible atrium.",
        sceneQuestion: "What does the player notice without changing state?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium"],
        actionInterpretation: {
          intent: "Observe the room before acting.",
          method: null,
          targetRefs: ["Atrium"],
        },
        turnNeed: "none",
        rationale: "The action is observational and does not assert a durable change.",
        noMutationReason: "Observation can be narrated from current visible scene facts.",
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.read.path).toBe("direct");
  });

  it("treats an empty direct clarificationPrompt as absent while preserving clarification requirements", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const directResult = validateGmReadNoMutationV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player observes.",
        sceneQuestion: "What is visible?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player"],
        actionInterpretation: {
          intent: "Observe.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "none",
        rationale: "No mutation.",
        noMutationReason: "Visible scene evidence is enough.",
        clarificationPrompt: "",
      },
    });
    expect(directResult.status).toBe("accepted");
    expect(directResult.read.clarificationPrompt).toBeUndefined();

    const clarificationResult = validateGmReadNoMutationV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "clarification",
        situationSummary: "The target is unclear.",
        sceneQuestion: "Which object is meant?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player"],
        actionInterpretation: {
          intent: "Interact with an object.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "clarification_needed",
        rationale: "The object is not identified.",
        noMutationReason: "Clarification is needed before any state change.",
        clarificationPrompt: "",
      },
    });
    expect(clarificationResult.status).toBe("fallback_clarification");
    expect(clarificationResult.issues.some((issue) =>
      issue.path === "clarificationPrompt")).toBe(true);
  });

  it("admits tool_plan GM Read through the unified live validator without executable payloads", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "route_check", "movement", "scene_beat_record"],
      },
    }));

    const result = validateGmReadV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move to a visible connected destination.",
        sceneQuestion: "Which backend-owned effect must settle the move?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement requires backend-owned mutation authority.",
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.read.path).toBe("tool_plan");

    const smuggled = validateGmReadV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "Bad payload.",
        sceneQuestion: "Bad payload.",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "North Hall"],
        actionInterpretation: {
          intent: "Move.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Bad.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "North Hall"],
          checklistGoal: "Bad.",
        },
        toolName: "move_actor",
        input: {
          actorId: "player-alpha",
          destinationId: "location-north",
        },
      },
    });
    expect(smuggled.status).toBe("fallback_clarification");
    expect(smuggled.issues.some((issue) => issue.code === "executable_payload")).toBe(true);
  });

  it("normalizes GM Read discriminator fields from structured checklist ownership", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "route_check", "movement", "scene_beat_record"],
      },
    }));

    const result = validateGmReadV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player wants to move to a visible connected destination.",
        sceneQuestion: "Which backend-owned effect must settle the move?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement requires backend-owned mutation authority.",
        noMutationReason: "",
        clarificationPrompt: "",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Move the player only if the accepted movement tool receipt applies.",
        },
      },
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.issues.some((issue: any) => issue.code === "schema_invalid")).toBe(true);

    const smuggledSidecar = validateGmReadV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player wants to move.",
        sceneQuestion: "Bad sidecar.",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "North Hall"],
        actionInterpretation: {
          intent: "Move.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Bad.",
        oracleRequest: {
          toolName: "move_actor",
        },
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "North Hall"],
          checklistGoal: "Bad.",
        },
      },
    });
    expect(smuggledSidecar.status).toBe("fallback_clarification");
    expect(smuggledSidecar.issues.some((issue) => issue.code === "executable_payload")).toBe(true);
  });

  it("keeps GM Read candidate generation sidecars path-scoped before final validation", () => {
    const baseToolPlan = {
      version: "gm-read.v2",
      path: "tool_plan",
      situationSummary: "The player wants to move to a connected destination.",
      sceneQuestion: "Which backend effect owns the move?",
      focalActorRefs: ["Player"],
      evidenceRefs: ["Player", "Atrium", "North Hall"],
      actionInterpretation: {
        intent: "Move to North Hall.",
        method: "walk",
        targetRefs: ["North Hall"],
      },
      turnNeed: "backend_action_checklist",
      rationale: "Movement requires backend-owned mutation authority.",
    };

    expect(gmReadCandidateV2LooseSchema.safeParse(baseToolPlan).success).toBe(true);
    expect(gmReadCandidateV2LooseSchema.safeParse({
      ...baseToolPlan,
      noMutationReason: "",
      clarificationPrompt: "",
    }).success).toBe(false);
    const emptySidecarValidation = validateGmReadV2({
      packet: movementAdmissionFixture().packet,
      candidate: {
        ...baseToolPlan,
        noMutationReason: "",
        clarificationPrompt: "",
      },
    });
    expect(emptySidecarValidation.status).toBe("fallback_clarification");
    expect(gmReadCandidateV2LooseSchema.safeParse({
      ...baseToolPlan,
      noMutationReason: "Sidecar from model repair, not tool-plan truth.",
      clarificationPrompt: "Sidecar from model repair, not a clarification path.",
    }).success).toBe(false);
    const sidecarValidation = validateGmReadV2({
      packet: movementAdmissionFixture().packet,
      candidate: {
        ...baseToolPlan,
        noMutationReason: "Sidecar from model repair, not tool-plan truth.",
        clarificationPrompt: "Sidecar from model repair, not a clarification path.",
      },
    });
    expect(sidecarValidation.status).toBe("fallback_clarification");
    expect(gmReadCandidateV2LooseSchema.safeParse({
      ...baseToolPlan,
      checklistRequest: {
        turnPath: "mutating",
        requiredEffectKinds: ["movement"],
        actorRefs: ["Player"],
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        checklistGoal: "Move the player after an accepted movement receipt.",
      },
    }).success).toBe(false);
    expect(gmReadCandidateV2LooseSchema.safeParse({
      ...baseToolPlan,
      oracleRequest: {
        question: "",
        stakes: "",
        outcomeMeanings: { strong_hit: "", weak_hit: "", miss: "" },
        uncertaintyKind: "perception",
        actorRef: "",
        targetRefs: [],
        evidenceRefs: [],
      },
    }).success).toBe(false);
  });

  it("falls back to clarification when GM Read contains executable payload fields", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadNoMutationV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "Try to smuggle a tool.",
        sceneQuestion: "Bad read.",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player"],
        actionInterpretation: {
          intent: "Observe.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "none",
        rationale: "Bad.",
        noMutationReason: "Bad.",
        candidateToolRequest: {
          toolName: "move_actor",
          input: { destinationRef: "North Hall" },
        },
      },
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.issues.some((issue: any) => issue.code === "executable_payload")).toBe(true);
    expect(result.read.path).toBe("clarification");
  });

  it("falls back to clarification when GM Read cites refs outside the packet", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadNoMutationV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "continue",
        situationSummary: "The read cites a hidden actor.",
        sceneQuestion: "What happens next?",
        focalActorRefs: ["Hidden Courier"],
        evidenceRefs: ["Player"],
        actionInterpretation: {
          intent: "Continue.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "none",
        rationale: "Hidden actor should fail.",
        noMutationReason: "No mutation.",
      },
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.issues.some((issue: any) => issue.code === "uncited_ref")).toBe(true);
    expect(result.read.evidenceRefs).toContain("Player");
  });

  it("does not accept tool-plan paths in the no-mutation GM Read slice", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadNoMutationV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player tries a state change.",
        sceneQuestion: "Will it mutate?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player"],
        actionInterpretation: {
          intent: "Move somewhere.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Unsupported in this slice.",
        noMutationReason: "No.",
      },
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.read.turnNeed).toBe("clarification_needed");
  });

  it("accepts a roll_oracle GM Read only as uncertainty, not as a tool payload", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara", "brass ledger"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadOracleV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "roll_oracle",
        situationSummary: "The player risks drawing attention while checking the ledger.",
        sceneQuestion: "Does the risky check succeed without alerting Clerk Mara?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "Clerk Mara", "brass ledger"],
        actionInterpretation: {
          intent: "Check the ledger quietly.",
          method: "quiet inspection",
          targetRefs: ["brass ledger"],
        },
        turnNeed: "oracle_uncertainty",
        rationale: "The result depends on uncertain attention and skill.",
        oracleRequest: {
          question: "Can the player check the brass ledger quietly enough to avoid drawing attention?",
          stakes: "A miss means the attempt attracts attention; a hit keeps the moment controlled.",
          outcomeMeanings: {
            strong_hit: "The player checks the ledger quietly and keeps full control of the moment.",
            weak_hit: "The player checks the ledger, but the moment stays tense.",
            miss: "The quiet check fails and attention is drawn.",
          },
          uncertaintyKind: "physical_risk",
          actorRef: "Player",
          targetRefs: ["brass ledger"],
          evidenceRefs: ["Player", "Atrium", "Clerk Mara", "brass ledger"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.read.path).toBe("roll_oracle");
    expect(result.read.turnNeed).toBe("oracle_uncertainty");
  });

  it("rejects roll_oracle GM Read when it smuggles executable payloads", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadOracleV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "roll_oracle",
        situationSummary: "Bad oracle read.",
        sceneQuestion: "Bad.",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium"],
        actionInterpretation: {
          intent: "Risk something.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "oracle_uncertainty",
        rationale: "Bad.",
        oracleRequest: {
          question: "Does the hidden courier notice?",
          stakes: "A bad hidden fact would leak.",
          outcomeMeanings: {
            strong_hit: "The immediate attention test clearly favors the actor.",
            weak_hit: "The immediate attention test partially favors the actor.",
            miss: "The immediate attention test fails.",
          },
          uncertaintyKind: "perception",
          actorRef: "Player",
          targetRefs: [],
          evidenceRefs: ["Player", "Atrium"],
        },
        toolInput: { name: "move_actor" },
      },
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.issues.some((issue: any) => issue.code === "executable_payload")).toBe(true);
  });

  it("rejects roll_oracle GM Read when it cites refs outside the model packet", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));

    const result = validateGmReadOracleV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "roll_oracle",
        situationSummary: "Bad oracle read.",
        sceneQuestion: "Does the hidden courier notice?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "Hidden Courier"],
        actionInterpretation: {
          intent: "Risk something.",
          method: null,
          targetRefs: ["Hidden Courier"],
        },
        turnNeed: "oracle_uncertainty",
        rationale: "Bad hidden ref.",
        oracleRequest: {
          question: "Does the hidden courier notice?",
          stakes: "A hidden fact would leak.",
          outcomeMeanings: {
            strong_hit: "The visible attention test clearly succeeds.",
            weak_hit: "The visible attention test partly succeeds.",
            miss: "The visible attention test fails.",
          },
          uncertaintyKind: "perception",
          actorRef: "Player",
          targetRefs: ["Hidden Courier"],
          evidenceRefs: ["Player", "Atrium", "Hidden Courier"],
        },
      },
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.issues.some((issue: any) => issue.code === "uncited_ref")).toBe(true);
  });

  it("maps Oracle v2 requests to label-only probability adapter payloads", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara", "brass ledger"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const readResult = validateGmReadOracleV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "roll_oracle",
        situationSummary: "The player risks attention.",
        sceneQuestion: "Does the quiet check work?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "Clerk Mara", "brass ledger"],
        actionInterpretation: {
          intent: "Check the ledger quietly.",
          method: "quiet inspection",
          targetRefs: ["brass ledger"],
        },
        turnNeed: "oracle_uncertainty",
        rationale: "Uncertain attention and skill.",
        oracleRequest: {
          question: "Can the player check the brass ledger quietly enough to avoid drawing attention?",
          stakes: "A miss attracts attention; a hit keeps the moment controlled.",
          outcomeMeanings: {
            strong_hit: "The player checks the ledger quietly and keeps full control of the moment.",
            weak_hit: "The player checks the ledger, but the moment stays tense.",
            miss: "The quiet check fails and attention is drawn.",
          },
          uncertaintyKind: "physical_risk",
          actorRef: "Player",
          targetRefs: ["brass ledger"],
          evidenceRefs: ["Player", "Atrium", "Clerk Mara", "brass ledger"],
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Oracle GM Read fixture must be accepted.");
    }
    const read = readResult.read;

    const payload = buildOraclePayloadV2({ modelPacket: packet, gmRead: read });

    expect(payload.intent).toBe("Check the ledger quietly.");
    expect(payload.actorTags).toEqual(["Player"]);
    expect(payload.targetTags).toEqual(["brass ledger"]);
    expect(payload.sceneContext).toContain("Question:");
    expect(JSON.stringify(payload)).not.toContain("actor-npc-1");
    expect(JSON.stringify(payload)).not.toContain("item-secret-id");
  });

  it("accepts a GM Read checklist request without executable tool payloads", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement"],
      },
    }));

    const result = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move from the atrium to North Hall.",
        sceneQuestion: "What backend-owned consequence must be planned?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement changes current scene/location authority and needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Plan the movement consequence without executable tool input.",
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }
    expect(result.read.path).toBe("tool_plan");
    expect(result.read.checklistRequest.requiredEffectKinds).toEqual(["movement"]);
  });

  it("builds and validates a bounded gm-judge.v2 admission from legacy GM Read", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move from the atrium to North Hall.",
        sceneQuestion: "What backend-owned consequence must be admitted?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement changes current scene/location authority and needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Admit the movement consequence without executable tool input.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }

    const judge = buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: readResult.read });
    const validation = validateGmJudgeV2({
      packet,
      gmRead: readResult.read,
      candidate: judge,
    });

    expect(validation.status).toBe("accepted");
    if (validation.status !== "accepted") {
      throw new Error("GM Judge fixture must be accepted.");
    }
    expect(validation.judge.lane).toBe("action_checklist");
    if (validation.judge.lane === "action_checklist") {
      expect(validation.judge.checklistAdmission.requiredEffectKinds).toEqual(["movement"]);
      expect(validation.judge.checklistAdmission.checklistGoal).toContain("movement consequence");
    }
    expect(JSON.stringify(validation.judge)).not.toContain("toolName");
    expect(JSON.stringify(validation.judge)).not.toContain("toolInput");
  });

  it("builds a model-facing Judge prompt without making compat admission the runtime result", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move from the atrium to North Hall.",
        sceneQuestion: "What backend-owned consequence must be admitted?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement changes current scene/location authority and needs backend settlement.",
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }
    const systemPrompt = buildGmJudgeSystemPromptV2();
    const prompt = buildGmJudgePromptV2({
      packet,
      gmRead: readResult.read,
      deterministicAdmission: null,
    });

    expect(systemPrompt).toContain("Judge is an admission record only");
    expect(systemPrompt).toContain("Do not narrate, mutate, emit tool names");
    expect(systemPrompt).toContain("For action_checklist, create checklistAdmission");
    expect(prompt).toContain('"acceptedGmRead"');
    expect(prompt).not.toContain('"compatibilityAdmission"');
    expect(prompt).not.toContain('"checklistRequest"');
    expect(prompt).not.toContain("toolName");
    expect(prompt).not.toContain("toolInput");
  });

  it("rejects gm-judge.v2 executable payloads, uncited refs, and lane drift", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move from the atrium to North Hall.",
        sceneQuestion: "What backend-owned consequence must be admitted?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement changes current scene/location authority and needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Admit the movement consequence without executable tool input.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }

    const executableRejected = validateGmJudgeV2({
      packet,
      gmRead: readResult.read,
      candidate: {
        version: "gm-judge.v2",
        lane: "roll_oracle",
        physicalPossibility: "uncertain",
        checkNeed: "oracle_uncertainty",
        actorRefs: ["Player"],
        targetRefs: ["Hidden Hall"],
        evidenceRefs: ["Player", "Atrium"],
        rationale: "Drifts from the accepted checklist GM Read.",
        oracleAdmission: {
          question: "Can the player move?",
          stakes: "A miss blocks the move.",
          outcomeMeanings: {
            strong_hit: "The movement works.",
            weak_hit: "The movement works with pressure.",
            miss: "The movement fails.",
          },
          uncertaintyKind: "physical_risk",
          actorRef: "Player",
          targetRefs: ["Hidden Hall"],
          evidenceRefs: ["Player", "Atrium"],
          postOracleRoute: "settle_visible_outcome_only",
          toolInput: { destinationRef: "Hidden Hall" },
        },
      },
    });

    expect(executableRejected.status).toBe("rejected");
    expect(executableRejected.issues.some((issue) => issue.code === "executable_payload")).toBe(true);

    const driftRejected = validateGmJudgeV2({
      packet,
      gmRead: readResult.read,
      candidate: {
        version: "gm-judge.v2",
        lane: "roll_oracle",
        physicalPossibility: "uncertain",
        checkNeed: "oracle_uncertainty",
        actorRefs: ["Player"],
        targetRefs: ["Hidden Hall"],
        evidenceRefs: ["Player", "Atrium"],
        rationale: "Drifts from the accepted checklist GM Read.",
        oracleAdmission: {
          question: "Can the player move?",
          stakes: "A miss blocks the move.",
          outcomeMeanings: {
            strong_hit: "The movement works.",
            weak_hit: "The movement works with pressure.",
            miss: "The movement fails.",
          },
          uncertaintyKind: "physical_risk",
          actorRef: "Player",
          targetRefs: ["Hidden Hall"],
          evidenceRefs: ["Player", "Atrium"],
          postOracleRoute: "settle_visible_outcome_only",
        },
      },
    });

    expect(driftRejected.status).toBe("rejected");
    expect(driftRejected.issues.some((issue) => issue.code === "uncited_ref")).toBe(true);
    expect(driftRejected.issues.some((issue) => issue.code === "gm_read_mismatch")).toBe(true);
  });

  it("rejects action checklist effects not admitted by gm-judge.v2", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement", "world_fact_record"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move from the atrium to North Hall.",
        sceneQuestion: "What backend-owned consequence must be admitted?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement changes current scene/location authority and needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Admit only the movement consequence.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }
    const judge = buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: readResult.read });
    if (judge.lane !== "action_checklist") {
      throw new Error("Expected action_checklist GM Judge.");
    }

    const rejected = validateGmActionChecklistV2({
      packet,
      gmRead: readResult.read,
      gmJudge: judge,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-judge-drift",
        campaignId: "campaign-alpha",
        turnId: "turn-alpha",
        baseWorldVersion: 7,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Move to North Hall.",
        steps: [{
          stepId: "step-1",
          purpose: "Record an unadmitted world fact instead of movement.",
          actorRef: "Player",
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          requiredCapabilityId: "world_fact_record",
          intendedEffect: {
            kind: "world_fact",
            summary: "The destination is considered reached.",
            stateScope: "knowledge",
          },
          expectedVisibleEffect: "A world fact is recorded.",
          dependsOnStepIds: [],
        }],
      },
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) =>
      issue.code === "gm_read_mismatch"
      && issue.message.includes("not admitted by GM Judge")
    )).toBe(true);
  });

  it("rejects duplicate gm-judge checklist effect admissions", () => {
    const { packet, gmRead } = movementToolPlanFixture();
    const judge = checklistJudgeFor({ gmRead });

    const rejected = validateGmJudgeV2({
      packet,
      gmRead,
      candidate: {
        ...judge,
        checklistAdmission: {
          ...judge.checklistAdmission,
          requiredEffectKinds: ["movement", "movement"],
        },
      },
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) =>
      issue.path === "checklistAdmission.requiredEffectKinds"
      && issue.message.includes("unique")
    )).toBe(true);
  });

  it("rejects action checklists that miss admitted effects or duplicate checklist effects", () => {
    const { packet, gmRead } = movementToolPlanFixture();
    const judge = checklistJudgeFor({ gmRead });
    const routeThenMoveJudge: GmJudgeChecklistV2 = {
      ...judge,
      checklistAdmission: {
        ...judge.checklistAdmission,
        requiredEffectKinds: ["route_check", "movement"],
        checklistGoal: "Check route availability, then move to North Hall.",
      },
    };

    const missingMovement = validateGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: routeThenMoveJudge,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-missing-movement",
        campaignId: packet.campaignId,
        turnId: packet.turnId,
        baseWorldVersion: packet.baseWorldVersion,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Check the route but omit movement.",
        steps: [{
          stepId: "step-1",
          purpose: "Check route availability only.",
          actorRef: "Player",
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          requiredCapabilityId: "route_check",
          intendedEffect: {
            kind: "route_check",
            summary: "Route to North Hall is checked.",
            stateScope: "location",
          },
          expectedVisibleEffect: "Route availability is settled.",
          dependsOnStepIds: [],
        }],
      },
    });

    expect(missingMovement.status).toBe("rejected");
    expect(missingMovement.issues.some((issue) =>
      issue.code === "admission_mismatch"
      && issue.message.includes("missing admitted effect")
    )).toBe(true);

    const duplicateMovement = validateGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: routeThenMoveJudge,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-duplicate-movement",
        campaignId: packet.campaignId,
        turnId: packet.turnId,
        baseWorldVersion: packet.baseWorldVersion,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Duplicate movement incorrectly.",
        steps: [
          {
            stepId: "step-1",
            purpose: "First movement.",
            actorRef: "Player",
            targetRefs: ["North Hall"],
            evidenceRefs: ["Player", "Atrium", "North Hall"],
            requiredCapabilityId: "movement",
            intendedEffect: {
              kind: "movement",
              summary: "Move once.",
              stateScope: "actor",
            },
            expectedVisibleEffect: "Move once.",
            dependsOnStepIds: [],
          },
          {
            stepId: "step-2",
            purpose: "Second movement.",
            actorRef: "Player",
            targetRefs: ["North Hall"],
            evidenceRefs: ["Player", "Atrium", "North Hall"],
            requiredCapabilityId: "movement",
            intendedEffect: {
              kind: "movement",
              summary: "Move twice.",
              stateScope: "actor",
            },
            expectedVisibleEffect: "Move twice.",
            dependsOnStepIds: [],
          },
        ],
      },
    });

    expect(duplicateMovement.status).toBe("rejected");
    expect(duplicateMovement.issues.some((issue) =>
      issue.code === "admission_mismatch"
      && issue.message.includes("duplicate intended effect")
    )).toBe(true);
  });

  it("rejects non-contiguous checklist step ids and refs outside Judge admission", () => {
    const { packet, gmRead } = movementToolPlanFixture();
    const judge = checklistJudgeFor({ gmRead });

    const rejected = validateGmActionChecklistV2({
      packet,
      gmRead,
      gmJudge: judge,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-bad-step-id-and-ref",
        campaignId: packet.campaignId,
        turnId: packet.turnId,
        baseWorldVersion: packet.baseWorldVersion,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Move with invalid structure.",
        steps: [{
          stepId: "step-2",
          purpose: "Move with an unadmitted scene ref.",
          actorRef: "Player",
          targetRefs: ["Atrium"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          requiredCapabilityId: "movement",
          intendedEffect: {
            kind: "movement",
            summary: "Move to North Hall.",
            stateScope: "actor",
          },
          expectedVisibleEffect: "Player moves.",
          dependsOnStepIds: [],
        }],
      },
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) =>
      issue.code === "admission_mismatch"
      && issue.message.includes("expected step-1")
    )).toBe(true);
    expect(rejected.issues.some((issue) =>
      issue.code === "admission_mismatch"
      && issue.message.includes("targetRef")
      && issue.message.includes("not admitted")
    )).toBe(true);
  });

  it("accepts an action checklist with one intended backend-owned effect per step", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement", "route_check"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants to move to North Hall.",
        sceneQuestion: "What movement consequence must be planned?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement", "route_check"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Plan route verification and movement.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }

    const checklistResult = validateGmActionChecklistV2({
      packet,
      gmRead: readResult.read,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-1",
        campaignId: "campaign-alpha",
        turnId: "turn-alpha",
        baseWorldVersion: 7,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Move to North Hall.",
        steps: [
          {
            stepId: "step-1",
            purpose: "Verify the route to North Hall.",
            actorRef: "Player",
            targetRefs: ["North Hall"],
            evidenceRefs: ["Player", "Atrium", "North Hall"],
            requiredCapabilityId: "route_check",
            intendedEffect: {
              kind: "route_check",
              summary: "Route to North Hall is checked.",
              stateScope: "location",
            },
            expectedVisibleEffect: "Route availability to North Hall is settled.",
            dependsOnStepIds: [],
          },
          {
            stepId: "step-2",
            purpose: "Apply the player's movement to North Hall.",
            actorRef: "Player",
            targetRefs: ["North Hall"],
            evidenceRefs: ["Player", "Atrium", "North Hall"],
            requiredCapabilityId: "movement",
            intendedEffect: {
              kind: "movement",
              summary: "Player current scene/location changes to North Hall if legal.",
              stateScope: "actor",
            },
            expectedVisibleEffect: "The player arrives at North Hall if the receipt is accepted.",
            dependsOnStepIds: ["step-1"],
          },
        ],
      },
    });

    expect(checklistResult.status).toBe("accepted");
    if (checklistResult.status !== "accepted") {
      throw new Error("Checklist fixture must be accepted.");
    }
    expect(checklistResult.checklist.steps).toHaveLength(2);
    expect(JSON.stringify(checklistResult.checklist)).not.toContain("toolName");
    expect(JSON.stringify(checklistResult.checklist)).not.toContain("input");
  });

  it("rejects action checklist executable payloads and invalid dependency ordering", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: ["hidden courier"],
        allowedCapabilityIds: ["observe_visible", "movement"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants a structural consequence.",
        sceneQuestion: "What must be planned?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Plan movement.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }

    const rejected = validateGmActionChecklistV2({
      packet,
      gmRead: readResult.read,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-bad",
        campaignId: "campaign-alpha",
        turnId: "turn-alpha",
        baseWorldVersion: 7,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Move to North Hall with a hidden courier leak.",
        plannedTools: [{ toolName: "move_to", input: { destinationRef: "North Hall" } }],
        steps: [{
          stepId: "step-1",
          purpose: "Move the player while leaking hidden courier.",
          actorRef: "Player",
          targetRefs: ["Hidden Hall"],
          evidenceRefs: ["Player", "North Hall"],
          requiredCapabilityId: "dialogue_record",
          intendedEffect: {
            kind: "movement",
            summary: "Move toward hidden courier.",
            stateScope: "location",
          },
          expectedVisibleEffect: "The player arrives.",
          dependsOnStepIds: ["step-2"],
        }, {
          stepId: "step-2",
          purpose: "Follow-up step.",
          actorRef: "Player",
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "North Hall"],
          requiredCapabilityId: "movement",
          intendedEffect: {
            kind: "movement",
            summary: "A second movement effect.",
            stateScope: "location",
          },
          expectedVisibleEffect: "The player arrives again.",
          dependsOnStepIds: [],
        }],
      },
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) => issue.code === "executable_payload")).toBe(true);
    expect(rejected.issues.some((issue) => issue.code === "schema_invalid")).toBe(true);
  });

  it("rejects action checklist uncited refs, capability mismatches, and private leaks", () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: ["hidden courier"],
        allowedCapabilityIds: ["observe_visible", "movement"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player wants a structural consequence.",
        sceneQuestion: "What must be planned?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement needs backend settlement.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Plan movement.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Checklist GM Read fixture must be accepted.");
    }

    const rejected = validateGmActionChecklistV2({
      packet,
      gmRead: readResult.read,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-semantic-bad",
        campaignId: "campaign-alpha",
        turnId: "turn-alpha",
        baseWorldVersion: 7,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Move to North Hall with hidden courier pressure.",
        steps: [{
          stepId: "step-1",
          purpose: "Move the player while leaking hidden courier.",
          actorRef: "Player",
          targetRefs: ["Hidden Hall"],
          evidenceRefs: ["Player", "North Hall"],
          requiredCapabilityId: "dialogue_record",
          intendedEffect: {
            kind: "movement",
            summary: "Move toward hidden courier.",
            stateScope: "location",
          },
          expectedVisibleEffect: "The player arrives.",
          dependsOnStepIds: [],
        }],
      },
    });

    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) => issue.code === "uncited_ref")).toBe(true);
    expect(rejected.issues.some((issue) => issue.code === "capability_mismatch")).toBe(true);
    expect(rejected.issues.some((issue) => issue.code === "unavailable_capability")).toBe(true);
    expect(rejected.issues.some((issue) => issue.code === "private_term_leak")).toBe(true);
  });

  it("accepts a one-step v2 tool request binding without old tool input semantics", () => {
    const { packet, checklist } = movementToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-1",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("actor.move.v2");
    expect(JSON.stringify(result.request)).not.toContain("toolName");
    expect(JSON.stringify(result.request)).not.toContain('"input"');
  });

  it("accepts a terminal dialogue v2 tool request without durable state semantics", () => {
    const { packet, checklist } = dialogueToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-dialogue-1",
        stepId: "step-1",
        capabilityId: "dialogue_record",
        toolId: "dialogue.record.v2",
        effectBinding: {
          speakerRef: "Clerk Mara",
          addresseeRefs: ["Player"],
          outcomeKind: "answer",
          summary: "Clerk Mara says the ledger must stay on the desk.",
          quotedSpeech: "Keep the ledger here until I stamp it.",
          languageBasis: {
            responseLanguage: "match_player_action",
            sourceField: "playerAction",
          },
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Dialogue tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("dialogue.record.v2");
    if (result.request.toolId !== "dialogue.record.v2") {
      throw new Error("Dialogue tool request fixture must narrow to dialogue.record.v2.");
    }
    expect(result.request.effectBinding.languageBasis).toEqual({
      responseLanguage: "match_player_action",
      sourceField: "playerAction",
    });
    expect(JSON.stringify(result.request)).not.toContain("record_dialogue_outcome");
    expect(JSON.stringify(result.request)).not.toContain("stateEffects");
    expect(JSON.stringify(result.request)).not.toContain("worldFact");
  });

  it("accepts a clean support_actor.create.v2 request with bounded temporary current-scene identity", () => {
    const { packet, checklist } = supportActorToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-support-actor-1",
        stepId: "step-1",
        capabilityId: "support_actor_create",
        toolId: "support_actor.create.v2",
        effectBinding: {
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          roleKind: "dockhand",
          roleLabel: "local dockhand",
          displayName: "Local Dockhand",
          persona: {
            publicSummary: "A practical local worker who can answer visible route questions.",
            visibleCue: "waiting near the loading marks",
            voiceHint: "short and concrete",
          },
          tags: ["dockhand", "local-helper"],
          identityBounds: {
            tier: "temporary",
            persistence: "current_scene",
            significance: "minor_support",
            agency: "reactive_only",
            mayBecomePersistentHere: false,
          },
          reason: "The player is looking for a nearby ordinary helper in the current scene.",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Support actor tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("support_actor.create.v2");
    expect(result.request.effectBinding).toMatchObject({
      anchorScope: "current_scene",
      anchorRef: "Atrium Floor",
      identityBounds: {
        tier: "temporary",
        persistence: "current_scene",
        significance: "minor_support",
        agency: "reactive_only",
        mayBecomePersistentHere: false,
      },
    });
    expect(JSON.stringify(result.request)).not.toContain("create_scene_extra");
    expect(JSON.stringify(result.request)).not.toContain("spawn_npc");
    expect(JSON.stringify(result.request)).not.toContain("toolName");
  });

  it("accepts a clean minor_poi.create.v2 request with current-scene target-only authority", () => {
    const { packet, checklist } = minorPoiToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-minor-poi-1",
        stepId: "step-1",
        capabilityId: "minor_poi_create",
        toolId: "minor_poi.create.v2",
        effectBinding: {
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          poiLabel: "Notice Board",
          purpose: "The player needs an ordinary visible board for current-scene postings.",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Minor POI tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("minor_poi.create.v2");
    expect(result.request.effectBinding).toMatchObject({
      anchorScope: "current_scene",
      anchorRef: "Atrium Floor",
      poiLabel: "Notice Board",
    });
    expect(JSON.stringify(result.request)).not.toContain("create_minor_poi");
    expect(JSON.stringify(result.request)).not.toContain("location.reveal");
    expect(JSON.stringify(result.request)).not.toContain("move_actor");
  });

  it("accepts a clean location.reveal.v2 request with source-bounded place-handle authority", () => {
    const { packet, checklist } = locationRevealToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-location-reveal-1",
        stepId: "step-1",
        capabilityId: "location_reveal",
        toolId: "location.reveal.v2",
        effectBinding: {
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          revealMode: "create_visible_place_handle",
          placeHandleKind: "service_window",
          locationLabel: "Service Window",
          visibleDescription: "A small service window set into the atrium wall.",
          sourceAuthority: {
            kind: "current_scene_visible_evidence",
            sourceRefs: ["Player", "Atrium Floor"],
            sourceSummary: "The handle is bounded to visible current-scene evidence.",
          },
          exposure: {
            targetKind: "location",
            visibleCurrentSceneTarget: true,
            movementCandidate: false,
            routeEdgeCreated: false,
            currentSceneChanged: false,
            absenceProof: false,
            hiddenDiscovery: false,
            itemCreated: false,
            actorCreated: false,
            worldFactCreated: false,
          },
          reason: "The player needs this visible service window as a citable local place handle.",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Location reveal tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("location.reveal.v2");
    expect(result.request.effectBinding).toMatchObject({
      anchorScope: "current_scene",
      anchorRef: "Atrium Floor",
      locationLabel: "Service Window",
      exposure: {
        movementCandidate: false,
        routeEdgeCreated: false,
        currentSceneChanged: false,
        absenceProof: false,
        hiddenDiscovery: false,
      },
    });
    expect(JSON.stringify(result.request)).not.toContain("reveal_location");
    expect(JSON.stringify(result.request)).not.toContain("move_actor");
  });

  it("rejects the old bare location.reveal.v2 placeholder schema", () => {
    const { packet, checklist } = locationRevealToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-location-reveal-placeholder",
        stepId: "step-1",
        capabilityId: "location_reveal",
        toolId: "location.reveal.v2",
        effectBinding: {
          locationLabel: "Service Window",
          anchorRef: "Atrium Floor",
          revealReason: "The player found it.",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") {
      throw new Error("Bare placeholder location reveal request must be rejected.");
    }
    expect(result.issues.some((issue) => issue.code === "schema_invalid")).toBe(true);
  });

  it("accepts a clean entity.tag.v2 request with scoped entity authority", () => {
    const { packet, checklist } = entityTagToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-entity-tag-1",
        stepId: "step-1",
        capabilityId: "entity_tag",
        toolId: "entity.tag.v2",
        effectBinding: {
          entityScope: "visible_item",
          entityRef: "brass ledger",
          operation: "add",
          tag: "suspicious",
          evidenceRefs: ["Player", "Atrium", "brass ledger"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Entity tag tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("entity.tag.v2");
    expect(result.request.effectBinding).toMatchObject({
      entityScope: "visible_item",
      entityRef: "brass ledger",
      operation: "add",
      tag: "suspicious",
    });
    expect(JSON.stringify(result.request)).not.toContain("add_tag");
    expect(JSON.stringify(result.request)).not.toContain("entityName");
    expect(JSON.stringify(result.request)).not.toContain("entityType");
  });

  it("accepts a clean item.transfer.v2 request with scoped custody authority", () => {
    const { packet, checklist } = itemTransferToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-item-transfer-1",
        stepId: "step-1",
        capabilityId: "item_transfer",
        toolId: "item.transfer.v2",
        effectBinding: {
          action: "drop_to_current_scene",
          itemScope: "player_inventory_item",
          itemRef: "sealed note",
          sourceScope: "player_inventory",
          sourceRef: "Player",
          targetScope: "current_scene",
          targetRef: "Atrium Floor",
          equip: { mode: "unequipped" },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Item transfer tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("item.transfer.v2");
    expect(result.request.effectBinding).toMatchObject({
      action: "drop_to_current_scene",
      itemScope: "player_inventory_item",
      itemRef: "sealed note",
      sourceScope: "player_inventory",
      targetScope: "current_scene",
      targetRef: "Atrium Floor",
    });
    expect(JSON.stringify(result.request)).not.toContain("transfer_item");
    expect(JSON.stringify(result.request)).not.toContain("itemName");
    expect(JSON.stringify(result.request)).not.toContain("targetName");
  });

  it("rejects legacy and partial-stack item.transfer.v2 request shapes", () => {
    const { packet, checklist } = itemTransferToolPlanFixture();

    const legacy = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-item-transfer-legacy",
        stepId: "step-1",
        capabilityId: "item_transfer",
        toolId: "item.transfer.v2",
        effectBinding: {
          itemName: "sealed note",
          targetName: "Atrium Floor",
          targetType: "location",
          transferredItemName: "half the coins",
          remainingItemName: "remaining coins",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
        },
      },
    });

    expect(legacy.status).toBe("rejected");
    expect(legacy.issues.some((issue) => issue.path.includes("action"))).toBe(true);
    expect(legacy.issues.some((issue) => issue.path.includes("itemScope"))).toBe(true);

    const uncitedTarget = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-item-transfer-uncited",
        stepId: "step-1",
        capabilityId: "item_transfer",
        toolId: "item.transfer.v2",
        effectBinding: {
          action: "give_to_visible_actor",
          itemScope: "player_inventory_item",
          itemRef: "sealed note",
          sourceScope: "player_inventory",
          sourceRef: "Player",
          targetScope: "visible_actor_inventory",
          targetRef: "Clerk Mara",
          equip: { mode: "unchanged" },
          evidenceRefs: ["Player", "Atrium", "sealed note"],
        },
      },
    });

    expect(uncitedTarget.status).toBe("rejected");
    expect(uncitedTarget.issues.some((issue) => issue.code === "uncited_ref")).toBe(true);
  });

  it("accepts a clean actor.condition_set.v2 request with scoped actor authority", () => {
    const { packet, checklist } = actorConditionToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-actor-condition-1",
        stepId: "step-1",
        capabilityId: "condition_set",
        toolId: "actor.condition_set.v2",
        effectBinding: {
          actorRef: "Player",
          actorScope: "player_actor",
          operation: {
            kind: "set_condition",
            conditionLabel: "prone",
          },
          sourceAuthority: {
            kind: "current_scene_visible_evidence",
            sourceRefs: ["Player", "Atrium Floor"],
            sourceSummary: "The player visibly drops to one knee in the current scene.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Actor condition tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("actor.condition_set.v2");
    expect(result.request.effectBinding).toMatchObject({
      actorRef: "Player",
      actorScope: "player_actor",
      operation: {
        kind: "set_condition",
        conditionLabel: "prone",
      },
      sourceAuthority: {
        kind: "current_scene_visible_evidence",
      },
    });
    expect(JSON.stringify(result.request)).not.toContain("set_actor_condition");
    expect(JSON.stringify(result.request)).not.toContain('"operation":"set"');
    expect(JSON.stringify(result.request)).not.toContain("amount");
  });

  it("rejects old placeholder and invalid actor.condition_set.v2 request shapes", () => {
    const { packet, checklist } = actorConditionToolPlanFixture();

    const legacy = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-actor-condition-legacy",
        stepId: "step-1",
        capabilityId: "condition_set",
        toolId: "actor.condition_set.v2",
        effectBinding: {
          actorRef: "Player",
          operation: "set",
          conditionLabel: "prone",
          amount: 1,
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });
    expect(legacy.status).toBe("rejected");
    expect(legacy.issues.some((issue) => issue.path.includes("actorScope"))).toBe(true);
    expect(legacy.issues.some((issue) => issue.path.includes("sourceAuthority"))).toBe(true);

    const noncanonical = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-actor-condition-noncanonical",
        stepId: "step-1",
        capabilityId: "condition_set",
        toolId: "actor.condition_set.v2",
        effectBinding: {
          actorRef: "Player",
          actorScope: "player_actor",
          operation: {
            kind: "set_condition",
            conditionLabel: "hiddenly-shattered",
          },
          sourceAuthority: {
            kind: "current_scene_visible_evidence",
            sourceRefs: ["Player", "Atrium Floor"],
            sourceSummary: "The player visibly changes posture.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });
    expect(noncanonical.status).toBe("rejected");
    expect(noncanonical.issues.some((issue) => issue.path.includes("conditionLabel"))).toBe(true);

    const badHp = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-actor-condition-bad-hp",
        stepId: "step-1",
        capabilityId: "condition_set",
        toolId: "actor.condition_set.v2",
        effectBinding: {
          actorRef: "Player",
          actorScope: "player_actor",
          operation: {
            kind: "adjust_player_hp",
            hpDelta: -2,
          },
          sourceAuthority: {
            kind: "accepted_runtime_receipt",
            sourceReceiptIds: ["receipt-source-1"],
            sourceSummary: "A prior accepted receipt settled the harm.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });
    expect(badHp.status).toBe("rejected");
    expect(badHp.issues.some((issue) => issue.path.includes("hpDelta"))).toBe(true);
  });

  it("accepts a clean time.advance.v2 request with explicit elapsed-time authority", () => {
    const { packet, checklist } = timeAdvanceToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-time-advance-1",
        stepId: "step-1",
        capabilityId: "time_advance",
        toolId: "time.advance.v2",
        effectBinding: {
          actorRef: "Player",
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          reasonKind: "wait",
          elapsedMinutes: 15,
          sourceAuthority: {
            kind: "explicit_player_elapsed_time_intent",
            actorRef: "Player",
            anchorRef: "Atrium Floor",
            sourceSummary: "The player explicitly waits exactly fifteen minutes in the current scene.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") {
      throw new Error("Time advance tool request fixture must be accepted.");
    }
    expect(result.request.toolId).toBe("time.advance.v2");
    expect(result.request.effectBinding).toMatchObject({
      actorRef: "Player",
      anchorScope: "current_scene",
      anchorRef: "Atrium Floor",
      reasonKind: "wait",
      elapsedMinutes: 15,
      sourceAuthority: {
        kind: "explicit_player_elapsed_time_intent",
        actorRef: "Player",
        anchorRef: "Atrium Floor",
      },
    });
    expect(JSON.stringify(result.request)).not.toContain("advance_time");
    expect(JSON.stringify(result.request)).not.toContain('"minutes"');
    expect(JSON.stringify(result.request)).not.toContain('"reason"');
  });

  it("rejects old placeholder and invalid time.advance.v2 request shapes", () => {
    const { packet, checklist } = timeAdvanceToolPlanFixture();

    const legacy = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-time-advance-legacy",
        stepId: "step-1",
        capabilityId: "time_advance",
        toolId: "time.advance.v2",
        effectBinding: {
          minutes: 15,
          reason: "The player waits.",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });
    expect(legacy.status).toBe("rejected");
    expect(legacy.issues.some((issue) => issue.path.includes("actorRef"))).toBe(true);
    expect(legacy.issues.some((issue) => issue.path.includes("elapsedMinutes"))).toBe(true);
    expect(legacy.issues.some((issue) => issue.path.includes("sourceAuthority"))).toBe(true);

    const excessive = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-time-advance-excessive",
        stepId: "step-1",
        capabilityId: "time_advance",
        toolId: "time.advance.v2",
        effectBinding: {
          actorRef: "Player",
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          reasonKind: "wait",
          elapsedMinutes: 241,
          sourceAuthority: {
            kind: "explicit_player_elapsed_time_intent",
            actorRef: "Player",
            anchorRef: "Atrium Floor",
            sourceSummary: "The player asks to wait too long for this primitive.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });
    expect(excessive.status).toBe("rejected");
    expect(excessive.issues.some((issue) => issue.path.includes("elapsedMinutes"))).toBe(true);

    const mismatchedSource = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-time-advance-mismatched-source",
        stepId: "step-1",
        capabilityId: "time_advance",
        toolId: "time.advance.v2",
        effectBinding: {
          actorRef: "Player",
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          reasonKind: "watch",
          elapsedMinutes: 15,
          sourceAuthority: {
            kind: "explicit_player_elapsed_time_intent",
            actorRef: "Player",
            anchorRef: "Atrium",
            sourceSummary: "The player watches from a mismatched anchor.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
    });
    expect(mismatchedSource.status).toBe("rejected");
    expect(mismatchedSource.issues.some((issue) => issue.path.includes("sourceAuthority.anchorRef"))).toBe(true);

    const missingEvidence = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-time-advance-missing-evidence",
        stepId: "step-1",
        capabilityId: "time_advance",
        toolId: "time.advance.v2",
        effectBinding: {
          actorRef: "Player",
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          reasonKind: "rest",
          elapsedMinutes: 15,
          sourceAuthority: {
            kind: "explicit_player_elapsed_time_intent",
            actorRef: "Player",
            anchorRef: "Atrium Floor",
            sourceSummary: "The player rests in the current scene.",
          },
          evidenceRefs: ["Player"],
        },
      },
    });
    expect(missingEvidence.status).toBe("rejected");
    expect(missingEvidence.issues.some((issue) => issue.path.includes("evidenceRefs"))).toBe(true);
  });

  it("rejects non-silence dialogue receipts that lack visible quoted speech content", () => {
    const { packet, checklist } = dialogueToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-dialogue-empty",
        stepId: "step-1",
        capabilityId: "dialogue_record",
        toolId: "dialogue.record.v2",
        effectBinding: {
          speakerRef: "Clerk Mara",
          addresseeRefs: ["Player"],
          outcomeKind: "answer",
          summary: "Clerk Mara gives an answer, but the content is not recorded.",
          languageBasis: {
            responseLanguage: "match_player_action",
            sourceField: "playerAction",
          },
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) =>
      issue.path === "effectBinding.quotedSpeech"
      && issue.message.includes("Non-silence dialogue outcomes require quotedSpeech")
    )).toBe(true);
  });

  it("rejects dialogue tool requests without player-action language basis", () => {
    const { packet, checklist } = dialogueToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-dialogue-no-language",
        stepId: "step-1",
        capabilityId: "dialogue_record",
        toolId: "dialogue.record.v2",
        effectBinding: {
          speakerRef: "Clerk Mara",
          addresseeRefs: ["Player"],
          outcomeKind: "answer",
          summary: "Clerk Mara gives an answer.",
          quotedSpeech: "Keep the ledger here until I stamp it.",
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) =>
      issue.code === "schema_invalid"
      && issue.path.includes("languageBasis")
    )).toBe(true);
  });

  it("rejects old runtime tool request surfaces and executable payload fields", () => {
    const { packet, checklist } = movementToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-old",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "move_to",
        input: {
          toolName: "move_actor",
          args: { destinationRef: "North Hall" },
          plannedTools: [{ toolName: "move_to" }],
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "legacy_tool_surface")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "executable_payload")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "schema_invalid")).toBe(true);
  });

  it("rejects tool requests for non-tool-request capability surfaces", () => {
    expect(toolIdForCapabilityV2("observe_visible")).toBeNull();
    expect(toolIdForCapabilityV2("oracle_roll")).toBeNull();
    expect(toolIdForCapabilityV2("quick_action_offer")).toBeNull();
    expect(gameplayToolRequestV2Schema.safeParse({
      version: "gameplay-tool-request.v2",
      requestId: "tool-request-oracle",
      stepId: "step-1",
      capabilityId: "oracle_roll",
      toolId: "oracle.roll.v2",
      effectBinding: {
        actorRef: "Player",
        evidenceRefs: ["Player"],
      },
    }).success).toBe(false);
  });

  it("rejects tool requests whose capability or tool id does not match the selected step", () => {
    const { packet, checklist } = movementToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-mismatch",
        stepId: "step-1",
        capabilityId: "dialogue_record",
        toolId: "dialogue.record.v2",
        effectBinding: {
          speakerRef: "Player",
          addresseeRefs: [],
          outcomeKind: "other",
          summary: "Wrong tool for a movement step.",
          quotedSpeech: "This is the wrong tool for the selected step.",
          languageBasis: {
            responseLanguage: "match_player_action",
            sourceField: "playerAction",
          },
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "capability_mismatch")).toBe(true);
  });

  it("rejects tool request refs outside the selected checklist step and private leaks", () => {
    const { packet, checklist } = movementToolPlanFixture({
      privateGuardTerms: ["hidden courier"],
    });

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-uncited",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "Hidden Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "hidden courier"],
        },
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "uncited_ref")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "private_term_leak")).toBe(true);
  });

  it("rejects multi-step payloads at the one-step tool request planner boundary", () => {
    const { packet, checklist } = movementToolPlanFixture();

    const result = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-multistep",
        stepId: "step-2",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
        plannedTools: [{
          toolName: "move_to",
          input: { destinationRef: "North Hall" },
        }],
      },
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "step_mismatch")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "executable_payload")).toBe(true);
  });

  it("executes an accepted movement request as a mutation receipt", async () => {
    const { packet, checklist } = movementToolPlanFixture();

    const result = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-accepted",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player moved to North Hall.",
          evidenceRefs: ["Player", "North Hall"],
          durableEventIds: ["event-move-1"],
        }),
      },
      receiptId: "receipt-move-1",
      emittedAt: 10,
    });

    expect(result.status).toBe("accepted");
    expect(result.receipt).toMatchObject({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-move-1",
      requestId: "tool-request-move-accepted",
      stepId: "step-1",
      capabilityId: "movement",
      toolId: "actor.move.v2",
      status: "accepted",
      evidenceAuthority: "mutation_receipt",
      mutationAuthority: "local_scene",
      mutationApplied: true,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
    });
    expect(gameplayRuntimeReceiptV2Schema.safeParse(result.receipt).success).toBe(true);
  });

  it("executes an accepted route check as observation-only without world mutation", async () => {
    const { packet, checklist } = routeCheckToolPlanFixture();
    const registry = buildGameplayRefRegistryV2({
      turnId: packet.turnId,
      frame: sceneFrame(),
    });

    const result = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-route-accepted",
        stepId: "step-1",
        capabilityId: "route_check",
        toolId: "route.check.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "route.check.v2": ({ refRegistry, request }) => {
          expect(refRegistry).toBe(registry);
          if (request.toolId !== "route.check.v2") {
            throw new Error("Route-check handler received the wrong tool request.");
          }
          const destination = resolveGameplayRefV2({
            registry: refRegistry!,
            ref: request.effectBinding.destinationRef,
            allowedKinds: ["movement_option"],
          });
          expect(destination.status).toBe("resolved");
          return {
            status: "accepted",
            mutationApplied: false,
            mutationAuthority: "none",
            resultWorldVersion: 7,
            visibleSummary: destination.status === "resolved"
              ? `${destination.entry.label} resolves to ${destination.entry.ids.locationId}.`
              : "Route could not resolve.",
            evidenceRefs: ["Player", "North Hall"],
          };
        },
      },
      refRegistry: registry,
      receiptId: "receipt-route-1",
      emittedAt: 11,
    });

    expect(result.status).toBe("accepted");
    expect(result.receipt).toMatchObject({
      status: "accepted",
      evidenceAuthority: "observation_only",
      mutationAuthority: "none",
      mutationApplied: false,
      baseWorldVersion: 7,
      resultWorldVersion: 7,
    });
    expect(result.receipt.visibleSummary).toContain("location-beta");
  });

  it("rejects invalid executor requests before any handler can mutate", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    let handlerCalled = false;

    const result = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-uncited-exec",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "Hidden Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Hidden Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => {
          handlerCalled = true;
          return {
            status: "accepted",
            mutationApplied: true,
            mutationAuthority: "local_scene",
            resultWorldVersion: 8,
            visibleSummary: "This must not execute.",
            evidenceRefs: ["Player"],
          };
        },
      },
      receiptId: "receipt-rejected-1",
      emittedAt: 12,
    });

    expect(handlerCalled).toBe(false);
    expect(result.status).toBe("rejected");
    expect(result.receipt).toMatchObject({
      status: "rejected",
      mutationApplied: false,
      mutationAuthority: "none",
      baseWorldVersion: 7,
      resultWorldVersion: 7,
    });
    expect(result.receipt.failureReason).toContain("outside the selected checklist step refs");
  });

  it("fails closed when a handler returns malformed mutation authority", async () => {
    const { packet, checklist } = movementToolPlanFixture();

    const result = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-bad-handler",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "none",
          resultWorldVersion: 7,
          visibleSummary: "Bad handler tried to apply mutation without authority.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-failed-1",
      emittedAt: 13,
    });

    expect(result.status).toBe("failed");
    expect(result.receipt).toMatchObject({
      status: "failed",
      evidenceAuthority: "mutation_receipt",
      mutationApplied: false,
      mutationAuthority: "none",
      baseWorldVersion: 7,
      resultWorldVersion: 7,
    });
    expect(result.receipt.failureReason).toContain("advance resultWorldVersion");
  });

  it("normalizes route-check receipts as availability evidence only", async () => {
    const { packet, checklist } = routeCheckToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-route-normalize",
        stepId: "step-1",
        capabilityId: "route_check",
        toolId: "route.check.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "route.check.v2": () => ({
          status: "accepted",
          mutationApplied: false,
          resultWorldVersion: 7,
          visibleSummary: "North Hall is visible and connected.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-route-normalize",
      emittedAt: 14,
    });

    const normalized = normalizeRuntimeReceiptEvidenceV2({
      modelPacket: packet,
      receipt: execution.receipt,
    });

    expect(normalized.status).toBe("accepted");
    if (normalized.status !== "accepted") {
      throw new Error("Route evidence normalization must be accepted.");
    }
    expect(normalized.evidence.authority).toBe("runtime_receipt");
    expect(normalized.evidence.kind).toBe("runtime_receipt");
    expect(normalized.evidence.text).toContain("route availability only");
    expect(normalized.evidence.text).toContain("not movement or arrival");
  });

  it("normalizes time.advance.v2 receipts as elapsed-time-only evidence", async () => {
    const { packet, checklist } = timeAdvanceToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-time-normalize",
        stepId: "step-1",
        capabilityId: "time_advance",
        toolId: "time.advance.v2",
        effectBinding: {
          actorRef: "Player",
          anchorScope: "current_scene",
          anchorRef: "Atrium Floor",
          reasonKind: "wait",
          elapsedMinutes: 15,
          sourceAuthority: {
            kind: "explicit_player_elapsed_time_intent",
            actorRef: "Player",
            anchorRef: "Atrium Floor",
            sourceSummary: "The player explicitly waits exactly fifteen minutes.",
          },
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
        },
      },
      handlers: {
        "time.advance.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "world",
          resultWorldVersion: 8,
          visibleSummary: "15 minutes pass in Atrium Floor.",
          evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          durableEventIds: [],
        }),
      },
      receiptId: "receipt-time-normalize",
      emittedAt: 15,
    });

    const normalized = normalizeRuntimeReceiptEvidenceV2({
      modelPacket: packet,
      receipt: execution.receipt,
    });

    expect(normalized.status).toBe("accepted");
    if (normalized.status !== "accepted") {
      throw new Error("Time evidence normalization must be accepted.");
    }
    expect(normalized.evidence.text).toContain("elapsed in-world time");
    expect(normalized.evidence.text).toContain("updated world clock");
    expect(normalized.evidence.text).toContain("does not prove movement");
    expect(normalized.evidence.text).toContain("rest benefits");
    expect(normalized.evidence.text).toContain("hidden/offscreen events");
    expect(normalized.evidence.text).toContain("absence");
  });

  it("builds a runtime settled packet from accepted mutation receipts only", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-packet",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
          durableEventIds: ["event-move-packet"],
        }),
      },
      receiptId: "receipt-move-packet",
      emittedAt: 15,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-packet",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const settledPacket = buildRuntimeSettledTurnPacketV2({
      packetId: "packet-runtime-move",
      modelPacket: packet,
      gmRead,
      checklist,
      ledger,
      receiptModelPackets: {
        [execution.receipt.receiptId]: packet,
      },
    });
    const narratorView = buildNarratorViewV2(settledPacket);

    expect(settledPacket.resultWorldVersion).toBe(8);
    expect(settledPacket.acceptedRuntimeReceiptIds).toEqual(["receipt-move-packet"]);
    expect(settledPacket.acceptedDurableEventIds).toEqual(["event-move-packet"]);
    expect(settledPacket.stepAudit).toEqual({ failedCount: 0, skippedCount: 0 });
    expect(settledPacket.acceptedEvidence.some((evidence) =>
      evidence.authority === "runtime_receipt"
      && evidence.sourceReceiptId === "receipt-move-packet"
      && evidence.text.includes("Movement receipt accepted")
      && evidence.text.includes("Player arrives at North Hall"),
    )).toBe(true);
    expect(narratorView.acceptedEvidence.some((evidence) =>
      evidence.authority === "runtime_receipt")).toBe(true);
  });

  it("keeps private GM Read labels out of public settled packets and narrator views", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture({
      privateGuardTerms: ["Sigil Boss Torvin Kask", "Litha Corsen"],
    });
    const leakingInternalGmRead = {
      ...gmRead,
      rationale:
        "Internal-only note: Sigil Boss Torvin Kask and Litha Corsen are background pressure.",
    };
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-private-gm-read-public-packet",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-private-gm-read-public-packet",
      emittedAt: 115,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-private-gm-read-public-packet",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const settledPacket = buildRuntimeSettledTurnPacketV2({
      packetId: "packet-private-gm-read-public-packet",
      modelPacket: packet,
      gmRead: leakingInternalGmRead,
      checklist,
      ledger,
      receiptModelPackets: {
        [execution.receipt.receiptId]: packet,
      },
    });
    const narratorView = buildNarratorViewV2(settledPacket);

    expect(JSON.stringify(settledPacket)).not.toContain("Sigil Boss Torvin Kask");
    expect(JSON.stringify(settledPacket)).not.toContain("Litha Corsen");
    expect(JSON.stringify(narratorView)).not.toContain("Sigil Boss Torvin Kask");
    expect(JSON.stringify(narratorView)).not.toContain("Litha Corsen");
    expect(leakingInternalGmRead.rationale).toContain("Sigil Boss Torvin Kask");
    expect(settledPacket.gmReadPublic.path).toBe("tool_plan");
    expect(settledPacket.gmReadPublic.requiredEffectKinds).toEqual([]);
    expect(settledPacket.gmJudgePublic.requiredEffectKinds).toContain("movement");
  });

  it("keeps rejected runtime receipts out of settled truth while recording failed step audit", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-rejected-packet",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "Hidden Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Hidden Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => {
          throw new Error("Handler must not run for rejected requests.");
        },
      },
      receiptId: "receipt-rejected-packet",
      emittedAt: 16,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-rejected-packet",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const settledPacket = buildRuntimeSettledTurnPacketV2({
      packetId: "packet-runtime-rejected",
      modelPacket: packet,
      gmRead,
      checklist,
      ledger,
    });

    expect(execution.status).toBe("rejected");
    expect(settledPacket.resultWorldVersion).toBe(7);
    expect(settledPacket.acceptedRuntimeReceiptIds).toEqual([]);
    expect(settledPacket.acceptedDurableEventIds).toEqual([]);
    expect(settledPacket.acceptedEvidence.some((evidence) =>
      evidence.authority === "runtime_receipt")).toBe(false);
    expect(settledPacket.stepAudit.failedCount).toBe(1);
    expect(JSON.stringify(settledPacket)).not.toContain("outside the selected checklist step refs");
    expect(ledger.receipts[0]?.failureReason).toContain("outside the selected checklist step refs");
  });

  it("rejects accepted receipt evidence when it leaks private terms", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture({
      privateGuardTerms: ["hidden courier"],
    });
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-private-receipt",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player follows the hidden courier to North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-private-leak",
      emittedAt: 17,
    });

    const normalized = normalizeRuntimeReceiptEvidenceV2({
      modelPacket: packet,
      receipt: execution.receipt,
    });
    expect(normalized.status).toBe("rejected");
    if (normalized.status !== "rejected") {
      throw new Error("Private leaking evidence must be rejected.");
    }
    expect(normalized.issues.some((issue) => issue.code === "private_term_leak")).toBe(true);

    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-private-leak",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });
    expect(() => buildRuntimeSettledTurnPacketV2({
      packetId: "packet-private-leak",
      modelPacket: packet,
      gmRead,
      checklist,
      ledger,
      receiptModelPackets: {
        [execution.receipt.receiptId]: packet,
      },
    })).toThrow("failed evidence normalization");
  });

  it("records unexecuted checklist steps as skipped packet audit, not truth", () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();
    const extendedChecklist = {
      ...checklist,
      steps: [
        ...checklist.steps,
        {
          stepId: "step-2",
          purpose: "Record a follow-up scene beat.",
          actorRef: "Player",
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "North Hall"],
          requiredCapabilityId: "scene_beat_record",
          intendedEffect: {
            kind: "scene_beat",
            summary: "Player steadies after arrival.",
            stateScope: "local_scene",
          },
          expectedVisibleEffect: "The player steadies after arriving.",
          dependsOnStepIds: ["step-1"],
        },
      ],
    } as typeof checklist;
    const receipt = gameplayRuntimeReceiptV2Schema.parse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-manual-move",
      requestId: "tool-request-manual-move",
      stepId: "step-1",
      source: {
        kind: "gm_action_checklist",
        checklistId: extendedChecklist.checklistId,
        stepId: "step-1",
      },
      capabilityId: "movement",
      toolId: "actor.move.v2",
      status: "accepted",
      evidenceAuthority: "mutation_receipt",
      mutationAuthority: "local_scene",
      mutationApplied: true,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
      visibleSummary: "Player arrives at North Hall.",
      evidenceRefs: ["Player", "North Hall"],
      durableEventIds: [],
      emittedAt: 18,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-skipped-step",
      modelPacket: packet,
      checklist: extendedChecklist,
      receipts: [receipt],
    });

    const settledPacket = buildRuntimeSettledTurnPacketV2({
      packetId: "packet-skipped-step",
      modelPacket: packet,
      gmRead,
      checklist: extendedChecklist,
      ledger,
      receiptModelPackets: {
        [receipt.receiptId]: packet,
      },
    });

    expect(settledPacket.acceptedRuntimeReceiptIds).toEqual(["receipt-manual-move"]);
    expect(settledPacket.stepAudit.skippedCount).toBe(1);
    expect(JSON.stringify(settledPacket)).not.toContain("step-2");
    expect(JSON.stringify(settledPacket.acceptedEvidence)).not.toContain("steadies after arriving");
  });

  it("rejects ledger receipts that do not follow strict world-version chain head", () => {
    const { packet, checklist } = movementToolPlanFixture();
    const twoStepChecklist = {
      ...checklist,
      steps: [
        checklist.steps[0],
        {
          ...checklist.steps[0],
          stepId: "step-2",
          purpose: "Move again from stale context.",
          dependsOnStepIds: ["step-1"],
        },
      ],
    } as typeof checklist;
    const firstReceipt = gameplayRuntimeReceiptV2Schema.parse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-chain-1",
      requestId: "request-chain-1",
      stepId: "step-1",
      source: {
        kind: "gm_action_checklist",
        checklistId: twoStepChecklist.checklistId,
        stepId: "step-1",
      },
      capabilityId: "movement",
      toolId: "actor.move.v2",
      status: "accepted",
      evidenceAuthority: "mutation_receipt",
      mutationAuthority: "local_scene",
      mutationApplied: true,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
      visibleSummary: "Player arrives at North Hall.",
      evidenceRefs: ["Player", "North Hall"],
      durableEventIds: [],
      emittedAt: 50,
    });
    const staleSecondReceipt = gameplayRuntimeReceiptV2Schema.parse({
      ...firstReceipt,
      receiptId: "receipt-chain-2",
      requestId: "request-chain-2",
      stepId: "step-2",
      source: {
        kind: "gm_action_checklist",
        checklistId: twoStepChecklist.checklistId,
        stepId: "step-2",
      },
      baseWorldVersion: 7,
      resultWorldVersion: 9,
      emittedAt: 51,
    });

    expect(() => buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-stale-chain",
      modelPacket: packet,
      checklist: twoStepChecklist,
      receipts: [firstReceipt, staleSecondReceipt],
    })).toThrow("current world-version chain head");
  });

  it("rejects accepted non-mutating receipts that advance world version", () => {
    expect(gameplayRuntimeReceiptV2Schema.safeParse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-route-advances",
      requestId: "request-route-advances",
      stepId: "step-1",
      capabilityId: "route_check",
      toolId: "route.check.v2",
      status: "accepted",
      evidenceAuthority: "observation_only",
      mutationAuthority: "none",
      mutationApplied: false,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
      visibleSummary: "North Hall is visible and connected.",
      evidenceRefs: ["Player", "North Hall"],
      durableEventIds: [],
      emittedAt: 52,
    }).success).toBe(false);
  });

  it("requires exact pre-step model packets for accepted receipt evidence normalization", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-prestep-required",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-prestep-required",
      emittedAt: 53,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-prestep-required",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    expect(() => buildRuntimeSettledTurnPacketV2({
      packetId: "packet-prestep-missing",
      modelPacket: packet,
      gmRead,
      checklist,
      ledger,
    })).toThrow("requires an exact pre-step model-facing packet");

    expect(() => buildRuntimeSettledTurnPacketV2({
      packetId: "packet-prestep-mismatch",
      modelPacket: packet,
      gmRead,
      checklist,
      ledger,
      receiptModelPackets: {
        [execution.receipt.receiptId]: {
          ...packet,
          baseWorldVersion: 8,
        },
      },
    })).toThrow("must match the receipt baseWorldVersion");
  });

  it("rejects accepted dependent receipts when prerequisite steps were not accepted earlier", () => {
    const { packet, checklist } = movementToolPlanFixture();
    const dependentChecklist = {
      ...checklist,
      steps: [
        {
          ...checklist.steps[0],
          requiredCapabilityId: "route_check",
          intendedEffect: {
            kind: "route_check",
            summary: "Check route before movement.",
            stateScope: "local_scene",
          },
        },
        {
          ...checklist.steps[0],
          stepId: "step-2",
          dependsOnStepIds: ["step-1"],
        },
      ],
    } as typeof checklist;
    const acceptedSecondReceipt = gameplayRuntimeReceiptV2Schema.parse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-dependent-without-first",
      requestId: "request-dependent-without-first",
      stepId: "step-2",
      source: {
        kind: "gm_action_checklist",
        checklistId: dependentChecklist.checklistId,
        stepId: "step-2",
      },
      capabilityId: "movement",
      toolId: "actor.move.v2",
      status: "accepted",
      evidenceAuthority: "mutation_receipt",
      mutationAuthority: "local_scene",
      mutationApplied: true,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
      visibleSummary: "Player arrives at North Hall.",
      evidenceRefs: ["Player", "North Hall"],
      durableEventIds: [],
      emittedAt: 54,
    });

    expect(() => buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-dependent-without-first",
      modelPacket: packet,
      checklist: dependentChecklist,
      receipts: [acceptedSecondReceipt],
    })).toThrow("accepted before dependency");
  });

  it("rejects local consequence receipts without an accepted local mutation trigger", () => {
    const { packet, checklist } = movementToolPlanFixture();
    const localReceipt = gameplayRuntimeReceiptV2Schema.parse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-local-without-trigger",
      requestId: "request-local-without-trigger",
      stepId: "step-1",
      source: {
        kind: "local_consequence_schedule",
        scheduleId: "schedule-missing-trigger",
        consequenceId: "local-consequence-1",
        triggerReceiptId: "receipt-missing-trigger",
      },
      capabilityId: "scene_beat_record",
      toolId: "scene_beat.record.v2",
      status: "accepted",
      evidenceAuthority: "terminal_receipt",
      mutationAuthority: "none",
      mutationApplied: false,
      baseWorldVersion: 7,
      resultWorldVersion: 7,
      visibleSummary: "Clerk Mara notices the movement.",
      evidenceRefs: ["Clerk Mara", "Atrium", "Player"],
      durableEventIds: [],
      emittedAt: 55,
    });

    expect(() => buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-local-without-trigger",
      modelPacket: packet,
      checklist,
      receipts: [localReceipt],
    })).toThrow("accepted local mutation trigger");
  });

  it("does not require a frame refresh for accepted non-mutating receipts", async () => {
    const { packet, checklist } = routeCheckToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-route-refresh",
        stepId: "step-1",
        capabilityId: "route_check",
        toolId: "route.check.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "route.check.v2": () => ({
          status: "accepted",
          mutationApplied: false,
          resultWorldVersion: 7,
          visibleSummary: "North Hall is visible and connected.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-route-refresh",
      emittedAt: 19,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-route-refresh",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
    });

    expect(refresh).toMatchObject({
      status: "not_required",
      triggerReceiptIds: [],
      refreshedPacket: null,
    });
  });

  it("requires a refreshed frame after an accepted mutation receipt", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-refresh-required",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 9,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-refresh-required",
      emittedAt: 20,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-refresh-required",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
    });

    expect(refresh.status).toBe("rejected");
    expect(refresh.triggerReceiptIds).toEqual(["receipt-move-refresh-required"]);
    expect(refresh.reason).toContain("require a refreshed SceneFrame envelope");
  });

  it("refreshes the model-facing packet from a post-mutation SceneFrame envelope", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-refresh",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-refresh",
      emittedAt: 21,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-refresh",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
      refreshedEnvelope: {
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationId: "location-beta",
          currentSceneScopeId: "scene-beta",
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
          movementCandidates: [{
            id: "route-return-secret-id",
            locationId: "location-alpha",
            label: "Atrium",
            connected: true,
            travelCost: 1,
          }],
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player", "Atrium"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "route_options", "movement"],
        },
      },
    });

    expect(refresh.status).toBe("refreshed");
    if (refresh.status !== "refreshed") {
      throw new Error("Frame refresh fixture must be accepted.");
    }
    expect(refresh.triggerReceiptIds).toEqual(["receipt-move-refresh"]);
    expect(refresh.refreshedPacket.baseWorldVersion).toBe(8);
    expect(refresh.refreshedPacket.scene.currentScene.label).toBe("North Hall");
    expect(refresh.refreshedPacket.scene.movementOptions.map((option) => option.label))
      .toContain("Atrium");
    expect(refresh.refreshedPacket.citableRefs).toContain("North Hall");
  });

  it("refreshes post-mutation packets with the refreshed SceneFrame tick", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-refresh-tick",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-refresh-tick",
      emittedAt: 22,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-refresh-tick",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
      refreshedEnvelope: {
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext({ baseTick: 3, baseWorldVersion: 8 }),
        frame: sceneFrame({
          tick: 3,
          worldVersion: 8,
          currentLocationId: "location-beta",
          currentSceneScopeId: "scene-beta",
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player", "Atrium"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "movement"],
        },
      },
    });

    expect(refresh.status).toBe("refreshed");
    if (refresh.status !== "refreshed") throw new Error("Frame refresh must be accepted.");
    expect(refresh.refreshedPacket.baseTick).toBe(3);
    expect(refresh.refreshedPacket.baseWorldVersion).toBe(8);
  });

  it("rejects refreshed frames whose tick does not match the refreshed attempt", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-refresh-bad-tick",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-refresh-bad-tick",
      emittedAt: 23,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-refresh-bad-tick",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
      refreshedEnvelope: {
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext({ baseTick: 3, baseWorldVersion: 8 }),
        frame: sceneFrame({ tick: 2, worldVersion: 8 }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["Atrium", "Player", "North Hall"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "movement"],
        },
      },
    });

    expect(refresh.status).toBe("rejected");
    expect(refresh.reason).toContain("SceneFrame tick must match the turn attempt base tick");
  });

  it("rejects stale refreshed frames after accepted mutation receipts", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-refresh-stale",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-refresh-stale",
      emittedAt: 22,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-refresh-stale",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
      refreshedEnvelope: {
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext({ baseWorldVersion: 7 }),
        frame: sceneFrame({ worldVersion: 7 }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["Atrium", "Player", "North Hall"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "movement"],
        },
      },
    });

    expect(refresh.status).toBe("rejected");
    expect(refresh.reason).toContain("must equal accepted mutation resultWorldVersion 8");
    expect(refresh.refreshedPacket).toBeNull();
  });

  it("does not schedule local consequences for accepted observation-only receipts", async () => {
    const { packet, checklist } = routeCheckToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-route-local-none",
        stepId: "step-1",
        capabilityId: "route_check",
        toolId: "route.check.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "route.check.v2": () => ({
          status: "accepted",
          mutationApplied: false,
          resultWorldVersion: 7,
          visibleSummary: "North Hall is visible and connected.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-route-local-none",
      emittedAt: 23,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-route-local-none",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });

    const schedule = scheduleLocalConsequencesV2({
      scheduleId: "schedule-route-none",
      modelPacket: packet,
      ledger,
    });

    expect(schedule).toMatchObject({
      version: "local-consequence-schedule.v2",
      route: "none",
      triggerReceiptIds: [],
      entries: [],
    });
    expect(schedule.skipped[0]?.reason).toContain("No accepted local mutation receipts");
  });

  it("schedules required visible local consequences after accepted local mutation", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-local-schedule",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-local-schedule",
      emittedAt: 24,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-local-schedule",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });
    const refresh = refreshFrameAfterAcceptedMutationV2({
      previousPacket: packet,
      ledger,
      refreshedEnvelope: {
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
          roster: {
            active: [{
              id: "actor-mara",
              actorId: "actor-mara",
              type: "npc",
              label: "Clerk Mara",
              locationId: "location-beta",
              sceneScopeId: "scene-beta",
              awareness: "clear",
              awarenessHint: "notices the arrival",
            }],
            support: [],
            background: [{
              id: "actor-hidden",
              actorId: "actor-hidden",
              type: "npc",
              label: "Hidden Clerk",
              locationId: "location-beta",
              sceneScopeId: "scene-beta",
              awareness: "none",
              awarenessHint: null,
            }],
          },
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player", "Clerk Mara"],
          privateGuardTerms: ["Hidden Clerk"],
          allowedCapabilityIds: ["observe_visible", "scene_beat_record"],
        },
      },
    });
    expect(refresh.status).toBe("refreshed");
    if (refresh.status !== "refreshed") {
      throw new Error("Refresh must be accepted for local consequence schedule.");
    }

    const schedule = scheduleLocalConsequencesV2({
      scheduleId: "schedule-move-local",
      modelPacket: refresh.refreshedPacket,
      ledger,
    });

    expect(schedule.route).toBe("required_before_packet");
    expect(schedule.triggerReceiptIds).toEqual(["receipt-move-local-schedule"]);
    expect(schedule.entries).toHaveLength(1);
    expect(schedule.entries[0]).toMatchObject({
      route: "required_before_packet",
      actorRef: "Clerk Mara",
      triggerReceiptId: "receipt-move-local-schedule",
      requiredCapabilityId: "scene_beat_record",
      intendedEffectKind: "scene_beat",
    });
    expect(schedule.entries[0]?.reason).toContain("records visibility only");
    expect(schedule.entries[0]?.reason).not.toMatch(/\bmay need\b|\bresponse\b|\battention\b|\breaction\b|\bknowledge\b/iu);
    expect(JSON.stringify(schedule)).not.toContain("Hidden Clerk");
  });

  it("keeps accepted local mutations without visible actors as deferred audit only", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const execution = await executeGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-local-deferred",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-local-deferred",
      emittedAt: 25,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-local-deferred",
      modelPacket: packet,
      checklist,
      receipts: [execution.receipt],
    });
    const emptyActorPacket = {
      ...packet,
      baseWorldVersion: 8,
      scene: {
        ...packet.scene,
        actors: packet.scene.actors.filter((actor) => actor.role === "player"),
        currentScene: {
          ...packet.scene.currentScene,
          label: "North Hall",
          ref: "North Hall",
        },
      },
      citableRefs: ["Player", "North Hall"],
    };

    const schedule = scheduleLocalConsequencesV2({
      scheduleId: "schedule-local-deferred",
      modelPacket: emptyActorPacket,
      ledger,
    });

    expect(schedule.route).toBe("deferred_audit");
    expect(schedule.triggerReceiptIds).toEqual(["receipt-move-local-deferred"]);
    expect(schedule.entries).toEqual([]);
    expect(schedule.skipped[0]?.reason).toContain("no visible non-player actors");
  });

  it("rejects stale local consequence scheduler packets relative to the ledger", async () => {
    const { packet, checklist } = movementToolPlanFixture();
    const packetAtEight = {
      ...packet,
      baseWorldVersion: 8,
    };
    const checklistAtEight = {
      ...checklist,
      baseWorldVersion: 8,
    };
    const execution = await executeGameplayToolRequestV2({
      packet: packetAtEight,
      checklist: checklistAtEight,
      stepId: "step-1",
      request: {
        version: "gameplay-tool-request.v2",
        requestId: "tool-request-move-local-stale",
        stepId: "step-1",
        capabilityId: "movement",
        toolId: "actor.move.v2",
        effectBinding: {
          actorRef: "Player",
          destinationRef: "North Hall",
          travelMode: "walk",
          evidenceRefs: ["Player", "Atrium", "North Hall"],
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
      receiptId: "receipt-move-local-stale",
      emittedAt: 26,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-move-local-stale",
      modelPacket: packetAtEight,
      checklist: checklistAtEight,
      receipts: [execution.receipt],
    });

    expect(() => scheduleLocalConsequencesV2({
      scheduleId: "schedule-local-stale",
      modelPacket: packet,
      ledger,
    })).toThrow("stale relative to the runtime ledger");
  });

  it("blocks an accepted movement before packet when visible local consequences are required", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-move",
      ledgerId: "ledger-compose-move",
      scheduleId: "schedule-compose-move",
      initialPacket: packet,
      gmRead,
      checklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-move",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
          durableEventIds: ["event-compose-move"],
        }),
      },
      refreshedFrameProvider: () => ({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationId: "location-beta",
          currentSceneScopeId: "scene-beta",
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
          roster: {
            active: [{
              id: "actor-mara",
              actorId: "actor-mara",
              type: "npc",
              label: "Clerk Mara",
              locationId: "location-beta",
              sceneScopeId: "scene-beta",
              awareness: "clear",
              awarenessHint: "notices the arrival",
            }],
            support: [],
            background: [],
          },
          movementCandidates: [],
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player", "Clerk Mara"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "scene_beat_record"],
        },
      }),
      receiptIdForStep: (stepId) => `receipt-compose-${stepId}`,
      emittedAtForStep: (_stepId, index) => index + 30,
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      throw new Error("Composition movement fixture must block for local consequences.");
    }
    expect(result.latestPacket.baseWorldVersion).toBe(8);
    expect(result.refreshes).toHaveLength(1);
    expect(result.settledPacket).toBeNull();
    expect(result.reason).toContain("requires local consequences before");
    expect(result.localConsequenceSchedule?.route).toBe("required_before_packet");
    expect(result.localConsequenceSchedule?.entries[0]).toMatchObject({
      actorRef: "Clerk Mara",
      triggerReceiptId: "receipt-compose-step-1",
    });
  });

  it("generates dependent tool requests against the refreshed model-facing packet", async () => {
    const packet = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "North Hall"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible", "movement", "scene_beat_record"],
      },
    }));
    const readResult = validateGmReadChecklistV2({
      packet,
      candidate: {
        version: "gm-read.v2",
        path: "tool_plan",
        situationSummary: "The player moves and then steadies at the new scene.",
        sceneQuestion: "Which accepted runtime effects settle the turn?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "North Hall"],
        actionInterpretation: {
          intent: "Move to North Hall and pause there.",
          method: "walk",
          targetRefs: ["North Hall"],
        },
        turnNeed: "backend_action_checklist",
        rationale: "Movement needs mutation authority and the local beat needs a terminal receipt.",
        checklistRequest: {
          turnPath: "mutating",
          requiredEffectKinds: ["movement", "scene_beat"],
          actorRefs: ["Player"],
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          checklistGoal: "Move the player, refresh frame, then record the local beat.",
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Dependent request GM Read fixture must be accepted.");
    }
    const checklistResult = validateGmActionChecklistV2({
      packet,
      gmRead: readResult.read,
      candidate: {
        version: "gm-action-checklist.v2",
        checklistId: "checklist-dependent-refresh",
        campaignId: packet.campaignId,
        turnId: packet.turnId,
        baseWorldVersion: packet.baseWorldVersion,
        sourceGmReadPath: "tool_plan",
        turnPath: "mutating",
        turnIntent: "Move and then record the visible local pause.",
        steps: [{
          stepId: "step-1",
          purpose: "Move the player to North Hall.",
          actorRef: "Player",
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "Atrium", "North Hall"],
          requiredCapabilityId: "movement",
          intendedEffect: {
            kind: "movement",
            summary: "Player moves to North Hall.",
            stateScope: "local_scene",
          },
          expectedVisibleEffect: "The player arrives in North Hall.",
          dependsOnStepIds: [],
        }, {
          stepId: "step-2",
          purpose: "Record the local pause after arrival.",
          actorRef: "Player",
          targetRefs: ["North Hall"],
          evidenceRefs: ["Player", "North Hall"],
          requiredCapabilityId: "scene_beat_record",
          intendedEffect: {
            kind: "scene_beat",
            summary: "Player pauses in North Hall.",
            stateScope: "local_scene",
          },
          expectedVisibleEffect: "The player steadies in North Hall.",
          dependsOnStepIds: ["step-1"],
        }],
      },
    });
    expect(checklistResult.status).toBe("accepted");
    if (checklistResult.status !== "accepted") {
      throw new Error("Dependent request checklist fixture must be accepted.");
    }

    const providerWorldVersions: number[] = [];
    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-dependent-refresh",
      ledgerId: "ledger-dependent-refresh",
      scheduleId: "schedule-dependent-refresh",
      initialPacket: packet,
      gmRead: readResult.read,
      checklist: checklistResult.checklist,
      requestCandidateProvider: ({ packet: providerPacket, step }) => {
        providerWorldVersions.push(providerPacket.baseWorldVersion);
        if (step.stepId === "step-1") {
          return {
            version: "gameplay-tool-request.v2",
            requestId: "tool-request-dependent-move",
            stepId: "step-1",
            capabilityId: "movement",
            toolId: "actor.move.v2",
            effectBinding: {
              actorRef: "Player",
              destinationRef: "North Hall",
              travelMode: "walk",
              evidenceRefs: ["Player", "Atrium", "North Hall"],
            },
          };
        }
        return {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-dependent-beat",
          stepId: "step-2",
          capabilityId: "scene_beat_record",
          toolId: "scene_beat.record.v2",
          effectBinding: {
            actorRef: "Player",
            summary: "Player steadies in North Hall.",
            evidenceRefs: ["Player", "North Hall"],
          },
        };
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
          durableEventIds: [],
        }),
        "scene_beat.record.v2": ({ packet: handlerPacket }) => ({
          status: "accepted",
          mutationApplied: false,
          mutationAuthority: "none",
          resultWorldVersion: handlerPacket.baseWorldVersion,
          visibleSummary: "Player steadies in North Hall.",
          evidenceRefs: ["Player", "North Hall"],
          durableEventIds: [],
        }),
      },
      refreshedFrameProvider: () => ({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationId: "location-beta",
          currentSceneScopeId: "scene-beta",
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
          roster: {
            active: [],
            support: [],
            background: [],
          },
          movementCandidates: [],
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "scene_beat_record"],
        },
      }),
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") {
      throw new Error("Dependent request provider fixture must settle.");
    }
    expect(providerWorldVersions).toEqual([7, 8]);
    expect(result.ledger.receipts.map((receipt) => receipt.toolId))
      .toEqual(["actor.move.v2", "scene_beat.record.v2"]);
    expect(result.settledPacket.resultWorldVersion).toBe(8);
  });

  it("executes required local consequence receipts before composing the settled packet", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-local-exec",
      ledgerId: "ledger-compose-local-exec",
      scheduleId: "schedule-compose-local-exec",
      initialPacket: packet,
      gmRead,
      checklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-local-move",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
      },
      localConsequenceCandidatesByConsequenceId: {
        "local-consequence-1": {
          version: "local-consequence-tool-request-candidate.v2",
          candidateId: "candidate-local-clerk",
          consequenceId: "local-consequence-1",
          triggerReceiptId: "receipt-compose-step-1",
          request: {
            version: "gameplay-tool-request.v2",
            requestId: "tool-request-local-clerk",
            stepId: "step-1",
            capabilityId: "scene_beat_record",
            toolId: "scene_beat.record.v2",
            effectBinding: {
              actorRef: "Clerk Mara",
              summary: "Clerk Mara notices the player's arrival without changing world state.",
              evidenceRefs: ["Clerk Mara", "North Hall", "Player"],
            },
          },
          rationale: "Visible actor reaction required before player-facing settlement.",
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
          durableEventIds: ["event-compose-local-move"],
        }),
        "scene_beat.record.v2": () => ({
          status: "accepted",
          mutationApplied: false,
          resultWorldVersion: 8,
          visibleSummary: "Clerk Mara notices the player's arrival.",
          evidenceRefs: ["Clerk Mara", "North Hall", "Player"],
          durableEventIds: ["event-compose-local-clerk"],
        }),
      },
      refreshedFrameProvider: () => ({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationId: "location-beta",
          currentSceneScopeId: "scene-beta",
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
          roster: {
            active: [{
              id: "actor-mara",
              actorId: "actor-mara",
              type: "npc",
              label: "Clerk Mara",
              locationId: "location-beta",
              sceneScopeId: "scene-beta",
              awareness: "clear",
              awarenessHint: "notices the arrival",
            }],
            support: [],
            background: [],
          },
          movementCandidates: [],
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player", "Clerk Mara"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "scene_beat_record"],
        },
      }),
      receiptIdForStep: (stepId) => `receipt-compose-${stepId}`,
      receiptIdForLocalConsequence: (consequenceId) => `receipt-${consequenceId}`,
      emittedAtForStep: (_stepId, index) => index + 60,
      emittedAtForLocalConsequence: (_consequenceId, index) => index + 70,
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") {
      throw new Error("Local consequence execution fixture must settle.");
    }
    expect(result.ledger.receipts).toHaveLength(2);
    expect(result.ledger.receipts[1]).toMatchObject({
      source: {
        kind: "local_consequence_schedule",
        scheduleId: "schedule-compose-local-exec",
        consequenceId: "local-consequence-1",
        triggerReceiptId: "receipt-compose-step-1",
      },
      status: "accepted",
      capabilityId: "scene_beat_record",
      baseWorldVersion: 8,
      resultWorldVersion: 8,
    });
    expect(result.settledPacket.acceptedRuntimeReceiptIds).toEqual([
      "receipt-compose-step-1",
      "receipt-local-consequence-1",
    ]);
    expect(result.settledPacket.acceptedDurableEventIds).toEqual([
      "event-compose-local-move",
      "event-compose-local-clerk",
    ]);
    expect(result.settledPacket.acceptedEvidence.some((evidence) =>
      evidence.sourceReceiptId === "receipt-local-consequence-1"
      && evidence.text.includes("Clerk Mara notices the player's arrival"),
    )).toBe(true);
  });

  it("blocks mismatched local consequence candidates before handler execution", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();
    let localHandlerCalled = false;

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-local-invalid",
      ledgerId: "ledger-compose-local-invalid",
      scheduleId: "schedule-compose-local-invalid",
      initialPacket: packet,
      gmRead,
      checklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-invalid-local-move",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
      },
      localConsequenceCandidatesByConsequenceId: {
        "local-consequence-1": {
          version: "local-consequence-tool-request-candidate.v2",
          candidateId: "candidate-local-wrong-actor",
          consequenceId: "local-consequence-1",
          triggerReceiptId: "receipt-compose-step-1",
          request: {
            version: "gameplay-tool-request.v2",
            requestId: "tool-request-local-wrong-actor",
            stepId: "step-1",
            capabilityId: "scene_beat_record",
            toolId: "scene_beat.record.v2",
            effectBinding: {
              actorRef: "Player",
              summary: "Wrong actor beat must not run.",
              evidenceRefs: ["Player", "North Hall"],
            },
          },
          rationale: "Bad candidate.",
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
        "scene_beat.record.v2": () => {
          localHandlerCalled = true;
          return {
            status: "accepted",
            mutationApplied: false,
            resultWorldVersion: 8,
            visibleSummary: "This must not run.",
            evidenceRefs: ["Player"],
          };
        },
      },
      refreshedFrameProvider: () => ({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player", "Clerk Mara"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "scene_beat_record"],
        },
      }),
      receiptIdForStep: (stepId) => `receipt-compose-${stepId}`,
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      throw new Error("Mismatched local consequence candidate must block.");
    }
    expect(localHandlerCalled).toBe(false);
    expect(result.reason).toContain("does not match schedule entry");
    expect(result.settledPacket).toBeNull();
  });

  it("composes route-check observation without refresh or local consequence truth", async () => {
    const { packet, gmRead, checklist } = routeCheckToolPlanFixture();
    let refreshCalled = false;
    let registryProviderCalls = 0;
    const registry = buildGameplayRefRegistryV2({
      turnId: packet.turnId,
      frame: sceneFrame(),
    });

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-route",
      ledgerId: "ledger-compose-route",
      scheduleId: "schedule-compose-route",
      initialPacket: packet,
      gmRead,
      checklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-route",
          stepId: "step-1",
          capabilityId: "route_check",
          toolId: "route.check.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
      },
      handlers: {
        "route.check.v2": ({ refRegistry, request }) => {
          expect(refRegistry).toBe(registry);
          if (request.toolId !== "route.check.v2") {
            throw new Error("Route-check handler received the wrong tool request.");
          }
          const destination = resolveGameplayRefV2({
            registry: refRegistry!,
            ref: request.effectBinding.destinationRef,
            allowedKinds: ["movement_option"],
          });
          expect(destination.status).toBe("resolved");
          return {
            status: "accepted",
            mutationApplied: false,
            resultWorldVersion: 7,
            visibleSummary: destination.status === "resolved"
              ? `${destination.entry.label} is visible and connected as ${destination.entry.ids.locationId}.`
              : "North Hall is visible and connected.",
            evidenceRefs: ["Player", "North Hall"],
          };
        },
      },
      refRegistryProvider: ({ packet: providerPacket }) => {
        registryProviderCalls += 1;
        expect(providerPacket).toBe(packet);
        return registry;
      },
      refreshedFrameProvider: () => {
        refreshCalled = true;
        return null;
      },
      receiptIdForStep: (stepId) => `receipt-compose-${stepId}`,
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") {
      throw new Error("Route composition fixture must settle.");
    }
    expect(refreshCalled).toBe(false);
    expect(registryProviderCalls).toBe(1);
    expect(result.refreshes).toEqual([]);
    expect(result.latestPacket).toBe(packet);
    expect(result.settledPacket.resultWorldVersion).toBe(7);
    expect(result.localConsequenceSchedule.route).toBe("none");
    expect(result.settledPacket.acceptedEvidence.some((evidence) =>
      evidence.text.includes("route availability only")
      && evidence.text.includes("not movement or arrival"),
    )).toBe(true);
  });

  it("composes rejected requests as failed audit without handler execution or runtime truth", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();
    let handlerCalled = false;

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-rejected",
      ledgerId: "ledger-compose-rejected",
      scheduleId: "schedule-compose-rejected",
      initialPacket: packet,
      gmRead,
      checklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-rejected",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "Hidden Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Hidden Hall"],
          },
        },
      },
      handlers: {
        "actor.move.v2": () => {
          handlerCalled = true;
          return {
            status: "accepted",
            mutationApplied: true,
            mutationAuthority: "local_scene",
            resultWorldVersion: 8,
            visibleSummary: "This must not run.",
            evidenceRefs: ["Player"],
          };
        },
      },
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") {
      throw new Error("Rejected request composition must settle as audit.");
    }
    expect(handlerCalled).toBe(false);
    expect(result.settledPacket.acceptedRuntimeReceiptIds).toEqual([]);
    expect(result.settledPacket.acceptedEvidence.some((evidence) =>
      evidence.authority === "runtime_receipt")).toBe(false);
    expect(result.settledPacket.stepAudit.failedCount).toBe(1);
    expect(JSON.stringify(result.settledPacket)).not.toContain("outside the selected checklist step refs");
    expect(result.ledger.receipts[0]?.failureReason).toContain("outside the selected checklist step refs");
    expect(result.localConsequenceSchedule.route).toBe("none");
  });

  it("blocks composition before settled truth when accepted mutation has no refreshed frame", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture();

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-no-refresh",
      ledgerId: "ledger-compose-no-refresh",
      scheduleId: "schedule-compose-no-refresh",
      initialPacket: packet,
      gmRead,
      checklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-no-refresh",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
      },
    });

    expect(result.status).toBe("blocked");
    if (result.status !== "blocked") {
      throw new Error("Missing refresh composition fixture must block.");
    }
    expect(result.reason).toContain("require a refreshed SceneFrame envelope");
    expect(result.ledger?.receipts).toHaveLength(1);
    expect(result.settledPacket).toBeNull();
    expect(result.localConsequenceSchedule).toBeNull();
  });

  it("validates dependent post-mutation requests against the refreshed packet, not stale initial refs", async () => {
    const { packet, gmRead, checklist } = movementToolPlanFixture({
      allowedCapabilityIds: ["observe_visible", "movement", "route_check"],
    });
    const extendedChecklist = {
      ...checklist,
      steps: [
        checklist.steps[0],
        {
          stepId: "step-2",
          purpose: "Check whether returning to the Atrium is still exposed after the move.",
          actorRef: "Player",
          targetRefs: ["Atrium"],
          evidenceRefs: ["Player", "Atrium"],
          requiredCapabilityId: "route_check",
          intendedEffect: {
            kind: "route_check",
            summary: "Check whether Atrium remains a visible route.",
            stateScope: "local_scene",
          },
          expectedVisibleEffect: "The player learns whether the Atrium route is still exposed.",
          dependsOnStepIds: ["step-1"],
        },
      ],
    } as typeof checklist;
    let secondHandlerCalled = false;

    const result = await composeGameplayCycleMutatingTurnV2({
      packetId: "packet-compose-dependent",
      ledgerId: "ledger-compose-dependent",
      scheduleId: "schedule-compose-dependent",
      initialPacket: packet,
      gmRead,
      checklist: extendedChecklist,
      requestsByStepId: {
        "step-1": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-dependent-move",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
        "step-2": {
          version: "gameplay-tool-request.v2",
          requestId: "tool-request-compose-dependent-route",
          stepId: "step-2",
          capabilityId: "route_check",
          toolId: "route.check.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "Atrium",
            evidenceRefs: ["Player", "Atrium"],
          },
        },
      },
      handlers: {
        "actor.move.v2": () => ({
          status: "accepted",
          mutationApplied: true,
          mutationAuthority: "local_scene",
          resultWorldVersion: 8,
          visibleSummary: "Player arrives at North Hall.",
          evidenceRefs: ["Player", "North Hall"],
        }),
        "route.check.v2": () => {
          secondHandlerCalled = true;
          return {
            status: "accepted",
            mutationApplied: false,
            resultWorldVersion: 8,
            visibleSummary: "Atrium remains available.",
            evidenceRefs: ["Player", "Atrium"],
          };
        },
      },
      refreshedFrameProvider: () => ({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext(),
        frame: sceneFrame({
          worldVersion: 8,
          currentLocationId: "location-beta",
          currentSceneScopeId: "scene-beta",
          currentLocationName: "North Hall",
          currentSceneScopeName: "North Hall",
          roster: {
            active: [],
            support: [],
            background: [],
          },
          movementCandidates: [],
        }),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["North Hall", "Player"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "route_check"],
        },
      }),
      receiptIdForStep: (stepId) => `receipt-compose-${stepId}`,
      emittedAtForStep: (_stepId, index) => index + 40,
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") {
      throw new Error("Dependent composition fixture must settle with failed audit.");
    }
    expect(secondHandlerCalled).toBe(false);
    expect(result.ledger.receipts).toHaveLength(2);
    expect(result.ledger.receipts[1]).toMatchObject({
      status: "rejected",
      stepId: "step-2",
      baseWorldVersion: 8,
      resultWorldVersion: 8,
    });
    expect(result.settledPacket.acceptedRuntimeReceiptIds).toEqual(["receipt-compose-step-1"]);
    expect(result.settledPacket.stepAudit.failedCount).toBe(1);
    expect(JSON.stringify(result.settledPacket)).not.toContain("outside the selected checklist step refs");
    expect(result.ledger.receipts[1]?.failureReason).toContain("outside the selected checklist step refs");
    expect(JSON.stringify(result.settledPacket.acceptedEvidence)).not.toContain("Atrium remains available");
  });

  it("builds a no-receipt settled packet from accepted scene and GM Read evidence", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: scopedForecast(),
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara"],
        privateGuardTerms: ["private faction timer"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const readResult = validateGmReadNoMutationV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player observes the atrium.",
        sceneQuestion: "What is visible without changing state?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium"],
        actionInterpretation: {
          intent: "Observe the atrium.",
          method: null,
          targetRefs: ["Atrium"],
        },
        turnNeed: "none",
        rationale: "No state changes are requested.",
        noMutationReason: "The scene can be described from accepted SceneFrame evidence.",
      },
    });
    expect(readResult.status).toBe("accepted");

    const packet = buildNoReceiptSettledTurnPacketV2({
      packetId: "packet-direct-1",
      modelPacket,
      gmRead: readResult.read,
    });

    expect(packet.acceptedRuntimeReceiptIds).toEqual([]);
    expect(packet.acceptedDurableEventIds).toEqual([]);
    expect(packet.baseWorldVersion).toBe(7);
    expect(packet.resultWorldVersion).toBe(7);
    expect(packet.acceptedEvidence.some((evidence) => evidence.kind === "scene_status")).toBe(true);
    expect(packet.acceptedEvidence.some((evidence) => evidence.kind === "direct_resolution")).toBe(true);
    expect(packet.gmJudgePublic.lane).toBe("direct");
    expect(packet.gmJudgePublic.checkNeed).toBe("no_check");
    expect(JSON.stringify(packet.acceptedEvidence)).not.toContain("private faction timer");
    expect(JSON.stringify(packet.acceptedEvidence)).not.toContain("hidden courier");
  });

  it("settles Oracle results as evidence without runtime mutation authority", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: scopedForecast(),
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara", "brass ledger"],
        privateGuardTerms: ["private faction timer"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const readResult = validateGmReadOracleV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "roll_oracle",
        situationSummary: "The player risks drawing attention while checking the ledger.",
        sceneQuestion: "Does the risky check succeed quietly?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "Clerk Mara", "brass ledger"],
        actionInterpretation: {
          intent: "Check the ledger quietly.",
          method: "quiet inspection",
          targetRefs: ["brass ledger"],
        },
        turnNeed: "oracle_uncertainty",
        rationale: "The result depends on uncertain attention and skill.",
        oracleRequest: {
          question: "Can the player check the brass ledger quietly enough to avoid drawing attention?",
          stakes: "A miss attracts attention; a hit keeps the moment controlled.",
          outcomeMeanings: {
            strong_hit: "The player checks the ledger quietly and keeps full control of the moment.",
            weak_hit: "The player checks the ledger, but the moment stays tense.",
            miss: "The quiet check fails and attention is drawn.",
          },
          uncertaintyKind: "physical_risk",
          actorRef: "Player",
          targetRefs: ["brass ledger"],
          evidenceRefs: ["Player", "Atrium", "Clerk Mara", "brass ledger"],
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Oracle GM Read fixture must be accepted.");
    }
    const judge = buildCompatGmJudgeFromLegacyGmReadV2({ gmRead: readResult.read });
    if (judge.lane !== "roll_oracle") {
      throw new Error("Expected roll_oracle GM Judge.");
    }
    const settlement = buildOracleSettlementV2({
      settlementId: "oracle-settlement-1",
      modelPacket,
      gmRead: readResult.read,
      gmJudge: judge,
      result: {
        chance: 47,
        roll: 41,
        outcome: "weak_hit",
        reasoning: "The check is possible, but Clerk Mara is nearby.",
      },
    });

    const packet = buildOracleSettledTurnPacketV2({
      packetId: "packet-oracle-1",
      modelPacket,
      gmRead: readResult.read,
      gmJudge: judge,
      oracleSettlement: settlement,
    });
    const narratorView = buildNarratorViewV2(packet);

    expect(packet.oracleVisibleOutcome?.selectedMeaning)
      .toBe("The player checks the ledger, but the moment stays tense.");
    expect(packet.gmJudgePublic.lane).toBe("roll_oracle");
    expect(packet.gmJudgePublic.checkNeed).toBe("oracle_uncertainty");
    expect(packet.acceptedRuntimeReceiptIds).toEqual([]);
    expect(packet.acceptedDurableEventIds).toEqual([]);
    expect(packet.acceptedEvidence.some((evidence) =>
      evidence.kind === "oracle_outcome"
      && evidence.authority === "oracle_settlement"
      && evidence.text.includes("weak_hit"),
    )).toBe(true);
    expect(packet.acceptedEvidence.some((evidence) =>
      evidence.kind === "oracle_outcome"
      && evidence.text.includes("Selected meaning: The player checks the ledger, but the moment stays tense."),
    )).toBe(true);
    expect(narratorView.gmReadPath).toBe("roll_oracle");
    expect(JSON.stringify(narratorView)).not.toContain("private faction timer");
    expect(JSON.stringify(narratorView)).not.toContain("hidden courier");
  });

  it("rejects roll_oracle settled packets without accepted Oracle settlement evidence", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara", "brass ledger"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const readResult = validateGmReadOracleV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "roll_oracle",
        situationSummary: "The player risks attention.",
        sceneQuestion: "Does it work?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "brass ledger"],
        actionInterpretation: {
          intent: "Check quietly.",
          method: null,
          targetRefs: ["brass ledger"],
        },
        turnNeed: "oracle_uncertainty",
        rationale: "The outcome is uncertain.",
        oracleRequest: {
          question: "Can the player check the brass ledger quietly?",
          stakes: "A miss attracts attention.",
          outcomeMeanings: {
            strong_hit: "The player checks the ledger quietly.",
            weak_hit: "The player checks the ledger with a complication.",
            miss: "The quiet check fails and attention is drawn.",
          },
          uncertaintyKind: "physical_risk",
          actorRef: "Player",
          targetRefs: ["brass ledger"],
          evidenceRefs: ["Player", "Atrium", "brass ledger"],
        },
      },
    });
    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") {
      throw new Error("Oracle GM Read fixture must be accepted.");
    }

    expect(settledTurnPacketV2Schema.safeParse({
      version: "settled-turn-packet.v2",
      packetId: "packet-oracle-invalid",
      campaignId: modelPacket.campaignId,
      turnId: modelPacket.turnId,
      playerAction: modelPacket.playerAction,
      baseTick: modelPacket.baseTick,
      baseWorldVersion: modelPacket.baseWorldVersion,
      resultWorldVersion: modelPacket.baseWorldVersion,
      gmReadPublic: {
        version: "public-gm-read-projection.v2",
        path: "roll_oracle",
        turnNeed: "oracle_uncertainty",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "brass ledger"],
        targetRefs: ["brass ledger"],
        requiredEffectKinds: [],
        settlementBasis: "oracle_settlement",
      },
      gmJudgePublic: {
        version: "public-gm-judge-projection.v2",
        lane: "roll_oracle",
        physicalPossibility: "uncertain",
        checkNeed: "oracle_uncertainty",
        actorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium", "brass ledger"],
        targetRefs: ["brass ledger"],
        requiredEffectKinds: [],
        settlementBasis: "oracle_settlement",
      },
      oracleVisibleOutcome: null,
      acceptedEvidence: [],
      acceptedRuntimeReceiptIds: [],
      acceptedDurableEventIds: [],
      stepAudit: {
        skippedCount: 0,
        failedCount: 0,
      },
    }).success).toBe(false);
  });

  it("creates persistence and narrator views without exposing private guard terms", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: scopedForecast(),
      refs: {
        visibleRefs: ["Atrium", "Player", "Clerk Mara"],
        privateGuardTerms: ["private faction timer"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const read = validateGmReadNoMutationV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "clarification",
        situationSummary: "The player used an ambiguous target.",
        sceneQuestion: "Which target does the player mean?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium"],
        actionInterpretation: {
          intent: "Use an ambiguous object.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "clarification_needed",
        rationale: "The target is unclear.",
        noMutationReason: "Clarification is needed before any state change.",
        clarificationPrompt: "Which visible object do you mean?",
      },
    }).read;
    const packet = buildNoReceiptSettledTurnPacketV2({
      packetId: "packet-clarification-1",
      modelPacket,
      gmRead: read,
    });

    const persistence = buildSettledPacketPersistencePendingV2(packet);
    expect(persistence).toMatchObject({
      status: "resolved_pending_narration",
      narratorAttemptStatus: "not_started",
    });

    const narratorView = buildNarratorViewV2(packet);
    expect(narratorView.gmReadPath).toBe("clarification");
    expect(narratorView.acceptedEvidence.some((evidence) =>
      evidence.kind === "clarification_request" && evidence.text === "Which visible object do you mean?",
    )).toBe(true);
    expect(narratorView.narrationLimits).toEqual({
      mayInferNewFacts: false,
      mayCallTools: false,
      mayUseFailedOrSkippedAsTruth: false,
    });
    expect(narratorView.languageContract).toEqual({
      responseLanguage: "match_player_action",
      sourceField: "playerAction",
      preserveLabelsVerbatim: true,
    });
    expect(JSON.stringify(narratorView)).not.toContain("private faction timer");
    expect(JSON.stringify(narratorView)).not.toContain("hidden courier");
  });

  it("rejects public settled builders that leak private terms and schema packets that claim receipts without evidence", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: ["secret pressure"],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const read = validateGmReadNoMutationV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player observes.",
        sceneQuestion: "What is visible?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium"],
        actionInterpretation: {
          intent: "Observe.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "none",
        rationale: "No mutation.",
        noMutationReason: "Visible scene evidence is enough.",
      },
    }).read;
    const packet = buildNoReceiptSettledTurnPacketV2({
      packetId: "packet-invalid-1",
      modelPacket,
      gmRead: read,
    });

    expect(() => buildNoReceiptSettledTurnPacketV2({
      packetId: "packet-invalid-private-leak",
      modelPacket,
      gmRead: {
        ...read,
        noMutationReason: "The secret pressure leaked.",
      },
    })).toThrow("leaked private guard term");

    expect(settledTurnPacketV2Schema.safeParse({
      ...packet,
      acceptedRuntimeReceiptIds: ["receipt-1"],
    }).success).toBe(false);
  });

  it("projects settled truth to the route narrative and done API events", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const read = validateGmReadNoMutationV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player observes the atrium.",
        sceneQuestion: "What is visible?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player", "Atrium"],
        actionInterpretation: {
          intent: "Observe.",
          method: null,
          targetRefs: ["Atrium"],
        },
        turnNeed: "none",
        rationale: "No mutation.",
        noMutationReason: "Visible scene evidence is enough.",
      },
    }).read;
    const settledPacket = buildNoReceiptSettledTurnPacketV2({
      packetId: "packet-api-1",
      modelPacket,
      gmRead: read,
    });

    const projection = buildApiResponseProjectionV2({
      packet: settledPacket,
      narrativeText: "You take in the atrium without changing anything yet.",
      tick: 1,
      worldVersion: 7,
      worldTimeMinutes: 5,
    });

    expect(projection.narrativeEvent).toEqual({
      type: "narrative",
      data: { text: "You take in the atrium without changing anything yet." },
    });
    expect(projection.doneEvent).toEqual({
      type: "done",
      data: {
        tick: 1,
        worldVersion: 7,
        worldTimeMinutes: 5,
        opening: false,
        turnId: "turn-alpha",
        packetId: "packet-api-1",
        runtime: "gameplay-cycle-v2",
      },
    });
  });

  it("executes route.check.v2 as observation-only DB-backed receipt", async () => {
    const fixture = dbTempFixture("wf-v2-db-route-");
    try {
      seedP16World();
      const { packet, checklist } = routeCheckToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "route-check-db-1",
          stepId: "step-1",
          capabilityId: "route_check",
          toolId: "route.check.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-route-check-db-1",
        emittedAt: 20,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "observation_only",
        mutationApplied: false,
        mutationAuthority: "none",
        baseWorldVersion: 7,
        resultWorldVersion: 7,
      });
      expect(execution.receipt.visibleSummary).toContain("North Hall");

      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player?.currentLocationId).toBe("location-alpha");
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes actor.move.v2 as atomic player row, character record, and authority mutation", async () => {
    const fixture = dbTempFixture("wf-v2-db-player-move-");
    try {
      seedP16World();
      const { packet, checklist } = movementToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-move-db-1",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-actor-move-db-1",
        emittedAt: 21,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "actor",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
      });
      expect(execution.receipt.durableEventIds).toEqual([]);

      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player?.currentLocationId).toBe("location-beta");
      expect(player?.currentSceneLocationId).toBe("location-beta");
      const record = JSON.parse(player?.characterRecord ?? "{}") as {
        socialContext?: { currentLocationId?: string; currentLocationName?: string };
      };
      expect(record.socialContext?.currentLocationId).toBe("location-beta");
      expect(record.socialContext?.currentLocationName).toBe("North Hall");

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 8,
        worldTimeMinutes: 12,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.actor.move.v2",
        sourceEntityType: "player",
        sourceEntityId: "player-alpha",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:actor-move-db-1",
      });
      expect(getDb().select().from(turnClockLedger).all()).toMatchObject([{
        campaignId: "campaign-alpha",
        turnId: "turn-alpha",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        deltaMinutes: 2,
        reasonKind: "travel",
      }]);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes actor.move.v2 for NPC rows without exposing legacy tool authority", async () => {
    const fixture = dbTempFixture("wf-v2-db-npc-move-");
    try {
      seedP16World();
      const { packet, checklist } = npcMovementToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "npc-move-db-1",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Clerk Mara",
            destinationRef: "North Hall",
            travelMode: "careful",
            evidenceRefs: ["Clerk Mara", "Atrium", "North Hall"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-npc-move-db-1",
        emittedAt: 22,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        mutationApplied: true,
        mutationAuthority: "actor",
        resultWorldVersion: 8,
      });
      const npc = getDb().select().from(npcs).where(eq(npcs.id, "actor-npc-1")).get();
      expect(npc?.currentLocationId).toBe("location-beta");
      expect(npc?.currentSceneLocationId).toBe("location-beta");
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces[0]).toMatchObject({
        sourceEntityType: "npc",
        sourceEntityId: "actor-npc-1",
        toolResultId: "gameplay-v2:turn-alpha:npc-move-db-1",
      });
      expect(JSON.stringify(execution.receipt)).not.toContain("ToolResult");
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back actor.move.v2 row changes when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-move-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = movementToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-move-rollback-1",
          stepId: "step-1",
          capabilityId: "movement",
          toolId: "actor.move.v2",
          effectBinding: {
            actorRef: "Player",
            destinationRef: "North Hall",
            travelMode: "walk",
            evidenceRefs: ["Player", "Atrium", "North Hall"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterActorRowUpdateBeforeAuthorityTrace: () => {
              throw new Error("forced authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-actor-move-rollback-1",
        emittedAt: 23,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced authority failure");
      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player?.currentLocationId).toBe("location-alpha");
      expect(player?.currentSceneLocationId).toBe("scene-alpha");
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes time.advance.v2 as atomic world clock and ledger authority only", async () => {
    const fixture = dbTempFixture("wf-v2-db-time-advance-");
    try {
      seedP16World();
      const { packet, checklist } = timeAdvanceToolPlanFixture();
      const beforeCounts = {
        players: getDb().select().from(players).all().length,
        npcs: getDb().select().from(npcs).all().length,
        items: getDb().select().from(items).all().length,
        locations: getDb().select().from(locations).all().length,
      };

      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "time-advance-db-1",
          stepId: "step-1",
          capabilityId: "time_advance",
          toolId: "time.advance.v2",
          effectBinding: {
            actorRef: "Player",
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            reasonKind: "wait",
            elapsedMinutes: 15,
            sourceAuthority: {
              kind: "explicit_player_elapsed_time_intent",
              actorRef: "Player",
              anchorRef: "Atrium Floor",
              sourceSummary: "The player explicitly waits exactly fifteen minutes.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-time-advance-db-1",
        emittedAt: 24,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "world",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        durableEventIds: [],
      });
      expect(execution.receipt.visibleSummary).toBe("15 minutes pass in Atrium Floor.");

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 8,
        worldTimeMinutes: 25,
        currentTick: 25,
      });
      const ledgerRows = getDb().select().from(turnClockLedger).all();
      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows[0]).toMatchObject({
        campaignId: "campaign-alpha",
        turnId: "turn-alpha",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        deltaMinutes: 15,
        reasonKind: "wait",
        sourceReceiptRef: "authority:gameplay-v2:turn-alpha:time-advance-db-1",
        resultWorldTimeMinutes: 25,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.time.advance.v2",
        sourceEntityType: "world_clock",
        sourceEntityId: "campaign-alpha",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        worldTimeMinutes: 25,
        elapsedWorldTimeMinutes: 15,
        toolResultId: "gameplay-v2:turn-alpha:time-advance-db-1",
        eventIds: "[]",
      });
      expect(JSON.parse(traces[0].stateDeltaRefs)).toEqual(["world_clock:campaign-alpha:time"]);
      expect(JSON.parse(traces[0].metadata)).toMatchObject({
        toolId: "time.advance.v2",
        actorRef: "Player",
        anchorRef: "Atrium Floor",
        reasonKind: "wait",
        elapsedMinutes: 15,
        sourceAuthority: {
          kind: "explicit_player_elapsed_time_intent",
          actorRef: "Player",
          anchorRef: "Atrium Floor",
        },
      });

      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player?.currentLocationId).toBe("location-alpha");
      expect(player?.currentSceneLocationId).toBe("scene-alpha");
      expect(getDb().select().from(players).all()).toHaveLength(beforeCounts.players);
      expect(getDb().select().from(npcs).all()).toHaveLength(beforeCounts.npcs);
      expect(getDb().select().from(items).all()).toHaveLength(beforeCounts.items);
      expect(getDb().select().from(locations).all()).toHaveLength(beforeCounts.locations);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
      expect(getDb().select().from(actorKnowledgeRecords).all()).toHaveLength(0);
      expect(getDb().select().from(simulationProposals).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back time.advance.v2 clock changes when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-time-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = timeAdvanceToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "time-advance-rollback-1",
          stepId: "step-1",
          capabilityId: "time_advance",
          toolId: "time.advance.v2",
          effectBinding: {
            actorRef: "Player",
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            reasonKind: "watch",
            elapsedMinutes: 15,
            sourceAuthority: {
              kind: "explicit_player_elapsed_time_intent",
              actorRef: "Player",
              anchorRef: "Atrium Floor",
              sourceSummary: "The player explicitly watches for fifteen minutes.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterTimeAdvanceClockUpdateBeforeAuthorityTrace: () => {
              throw new Error("forced time authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-time-advance-rollback-1",
        emittedAt: 25,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced time authority failure");
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 7,
        worldTimeMinutes: 10,
        currentTick: 0,
      });
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
      expect(getDb().select().from(simulationProposals).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes scene_beat.record.v2 as terminal receipt without DB mutation", async () => {
    const fixture = dbTempFixture("wf-v2-db-scene-beat-");
    try {
      seedP16World();
      const { packet, checklist } = sceneBeatToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "scene-beat-db-1",
          stepId: "step-1",
          capabilityId: "scene_beat_record",
          toolId: "scene_beat.record.v2",
          effectBinding: {
            actorRef: "Player",
            summary: "The player waits near the desk.",
            evidenceRefs: ["Player", "Atrium"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-scene-beat-db-1",
        emittedAt: 24,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "terminal_receipt",
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
        durableEventIds: [],
      });
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes dialogue.record.v2 as terminal receipt without DB mutation", async () => {
    const fixture = dbTempFixture("wf-v2-db-dialogue-");
    try {
      seedP16World();
      const { packet, checklist } = dialogueToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "dialogue-db-1",
          stepId: "step-1",
          capabilityId: "dialogue_record",
          toolId: "dialogue.record.v2",
          effectBinding: {
            speakerRef: "Clerk Mara",
            addresseeRefs: ["Player"],
            outcomeKind: "answer",
            summary: "Clerk Mara says the ledger must stay on the desk.",
            quotedSpeech: "Keep the ledger here until I stamp it.",
            languageBasis: {
              responseLanguage: "match_player_action",
              sourceField: "playerAction",
            },
            evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-dialogue-db-1",
        emittedAt: 25,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "terminal_receipt",
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
        durableEventIds: [],
      });
      expect(execution.receipt.visibleSummary).toContain("Clerk Mara dialogue outcome (answer)");
      expect(execution.receipt.visibleSummary).toContain("Keep the ledger here until I stamp it.");
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("requires source-bounded world_fact.record.v2 shape and rejects legacy summary-only payloads", () => {
    const { packet, checklist } = dialogueToWorldFactToolPlanFixture();
    const valid = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-2",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "world-fact-valid-1",
        stepId: "step-2",
        capabilityId: "world_fact_record",
        toolId: "world_fact.record.v2",
        effectBinding: {
          knowledgeOwnerRef: "Player",
          subjectRefs: ["Clerk Mara"],
          statement: "Clerk Mara reported that the ledger must stay on the desk until she stamps it.",
          summary: "Clerk Mara's desk procedure is recorded as a reported note.",
          truthStatus: "reported",
          futureUseKind: "procedure",
          source: {
            sourceKind: "accepted_dialogue_receipt",
            sourceReceiptIds: ["receipt-dialogue-source-1"],
            sourceQuote: "Keep the ledger here until I stamp it.",
            sourceSummary: "Clerk Mara gave the desk procedure.",
          },
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        },
      },
    });
    expect(valid.status).toBe("accepted");

    const legacy = validateGameplayToolRequestV2({
      packet,
      checklist,
      stepId: "step-2",
      candidate: {
        version: "gameplay-tool-request.v2",
        requestId: "world-fact-legacy-1",
        stepId: "step-2",
        capabilityId: "world_fact_record",
        toolId: "world_fact.record.v2",
        effectBinding: {
          subjectRefs: ["Clerk Mara"],
          summary: "The ledger must stay on the desk.",
          futureUseKind: "procedure",
          evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        },
      },
    });
    expect(legacy.status).toBe("rejected");
    expect(legacy.issues.map((issue) => issue.message).join(" ")).toContain("expected \"Player\"");
  });

  it("executes world_fact.record.v2 as atomic player-known knowledge mutation sourced to accepted dialogue", async () => {
    const fixture = dbTempFixture("wf-v2-db-world-fact-");
    try {
      seedP16World();
      const { packet, checklist } = dialogueToWorldFactToolPlanFixture();
      const dialogueExecution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "dialogue-source-db-1",
          stepId: "step-1",
          capabilityId: "dialogue_record",
          toolId: "dialogue.record.v2",
          effectBinding: {
            speakerRef: "Clerk Mara",
            addresseeRefs: ["Player"],
            outcomeKind: "answer",
            summary: "Clerk Mara says the ledger must stay on the desk.",
            quotedSpeech: "Keep the ledger here until I stamp it.",
            languageBasis: {
              responseLanguage: "match_player_action",
              sourceField: "playerAction",
            },
            evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-dialogue-source-db-1",
        emittedAt: 26,
      });
      expect(dialogueExecution.status).toBe("accepted");

      const knowledgeExecution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-2",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "world-fact-db-1",
          stepId: "step-2",
          capabilityId: "world_fact_record",
          toolId: "world_fact.record.v2",
          effectBinding: {
            knowledgeOwnerRef: "Player",
            subjectRefs: ["Clerk Mara"],
            statement: "Clerk Mara reported that the ledger must stay on the desk until she stamps it.",
            summary: "Clerk Mara's desk procedure is recorded as a reported note.",
            truthStatus: "reported",
            futureUseKind: "procedure",
            source: {
              sourceKind: "accepted_dialogue_receipt",
              sourceReceiptIds: ["receipt-dialogue-source-db-1"],
              sourceQuote: "Keep the ledger here until I stamp it.",
              sourceSummary: "Clerk Mara gave the desk procedure.",
            },
            evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        priorReceipts: [dialogueExecution.receipt],
        receiptId: "receipt-world-fact-db-1",
        emittedAt: 27,
      });

      expect(knowledgeExecution.status).toBe("accepted");
      expect(knowledgeExecution.receipt).toMatchObject({
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "knowledge",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        durableEventIds: [],
      });
      expect(knowledgeExecution.receipt.visibleSummary).toContain("Player-known knowledge recorded");

      const records = getDb().select().from(actorKnowledgeRecords).all();
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        campaignId: "campaign-alpha",
        actorId: "player-alpha",
        route: "report_message",
        truthStatus: "reported",
        statement: "Clerk Mara reported that the ledger must stay on the desk until she stamps it.",
        baseWorldVersion: 7,
        validFromWorldVersion: 8,
        observedAtWorldVersion: 7,
        privacy: "private",
      });
      expect(JSON.parse(records[0].subjectRefs)).toEqual(["Clerk Mara"]);
      const metadata = JSON.parse(records[0].metadata) as {
        objectiveCanon?: boolean;
        sourceReceiptIds?: string[];
        sourceQuote?: string;
      };
      expect(metadata.objectiveCanon).toBe(false);
      expect(metadata.sourceReceiptIds).toEqual(["receipt-dialogue-source-db-1"]);
      expect(metadata.sourceQuote).toBe("Keep the ledger here until I stamp it.");

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(8);
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.player_knowledge.record.v2",
        sourceEntityType: "actor_knowledge",
        sourceEntityId: records[0].id,
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:world-fact-db-1",
      });
      expect(JSON.parse(traces[0].stateDeltaRefs)).toEqual([
        `actor_knowledge:${records[0].id}:created`,
        "actor:player-alpha:knowledge",
      ]);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects world_fact.record.v2 when the claimed source receipt is not an accepted prior receipt", async () => {
    const fixture = dbTempFixture("wf-v2-db-world-fact-source-");
    try {
      seedP16World();
      const { packet, checklist } = dialogueToWorldFactToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-2",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "world-fact-missing-source-1",
          stepId: "step-2",
          capabilityId: "world_fact_record",
          toolId: "world_fact.record.v2",
          effectBinding: {
            knowledgeOwnerRef: "Player",
            subjectRefs: ["Clerk Mara"],
            statement: "Clerk Mara reported that the ledger must stay on the desk until she stamps it.",
            summary: "Clerk Mara's desk procedure is recorded as a reported note.",
            truthStatus: "reported",
            futureUseKind: "procedure",
            source: {
              sourceKind: "accepted_dialogue_receipt",
              sourceReceiptIds: ["receipt-not-present"],
              sourceQuote: "Keep the ledger here until I stamp it.",
              sourceSummary: "Clerk Mara gave the desk procedure.",
            },
            evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        priorReceipts: [],
        receiptId: "receipt-world-fact-missing-source-1",
        emittedAt: 28,
      });

      expect(execution.status).toBe("rejected");
      expect(execution.receipt.failureReason).toContain("not an accepted prior receipt");
      expect(getDb().select().from(actorKnowledgeRecords).all()).toHaveLength(0);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back world_fact.record.v2 knowledge insert when authority commit fails", async () => {
    const fixture = dbTempFixture("wf-v2-db-world-fact-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = dialogueToWorldFactToolPlanFixture();
      const sourceReceipt = gameplayRuntimeReceiptV2Schema.parse({
        version: "gameplay-runtime-receipt.v2",
        receiptId: "receipt-dialogue-source-rollback-1",
        requestId: "dialogue-source-rollback-1",
        stepId: "step-1",
        source: {
          kind: "gm_action_checklist",
          checklistId: checklist.checklistId,
          stepId: "step-1",
        },
        capabilityId: "dialogue_record",
        toolId: "dialogue.record.v2",
        status: "accepted",
        evidenceAuthority: "terminal_receipt",
        mutationAuthority: "none",
        mutationApplied: false,
        baseWorldVersion: 7,
        resultWorldVersion: 7,
        visibleSummary: "Clerk Mara dialogue outcome (answer): Clerk Mara says the ledger must stay on the desk. Quote: Keep the ledger here until I stamp it.",
        evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
        durableEventIds: [],
        emittedAt: 29,
      });
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-2",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "world-fact-rollback-1",
          stepId: "step-2",
          capabilityId: "world_fact_record",
          toolId: "world_fact.record.v2",
          effectBinding: {
            knowledgeOwnerRef: "Player",
            subjectRefs: ["Clerk Mara"],
            statement: "Clerk Mara reported that the ledger must stay on the desk until she stamps it.",
            summary: "Clerk Mara's desk procedure is recorded as a reported note.",
            truthStatus: "reported",
            futureUseKind: "procedure",
            source: {
              sourceKind: "accepted_dialogue_receipt",
              sourceReceiptIds: ["receipt-dialogue-source-rollback-1"],
              sourceQuote: "Keep the ledger here until I stamp it.",
              sourceSummary: "Clerk Mara gave the desk procedure.",
            },
            evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterWorldFactKnowledgeInsertBeforeAuthorityTrace: () => {
              throw new Error("forced knowledge authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        priorReceipts: [sourceReceipt],
        receiptId: "receipt-world-fact-rollback-1",
        emittedAt: 30,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt.failureReason).toContain("forced knowledge authority failure");
      expect(getDb().select().from(actorKnowledgeRecords).all()).toHaveLength(0);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
    } finally {
      fixture.cleanup();
    }
  });

  it("does not schedule local consequences for private player-known knowledge mutation", () => {
    const { packet, checklist } = dialogueToWorldFactToolPlanFixture();
    const dialogueReceipt = gameplayRuntimeReceiptV2Schema.parse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-dialogue-private-source-1",
      requestId: "dialogue-private-source-1",
      stepId: "step-1",
      source: {
        kind: "gm_action_checklist",
        checklistId: checklist.checklistId,
        stepId: "step-1",
      },
      capabilityId: "dialogue_record",
      toolId: "dialogue.record.v2",
      status: "accepted",
      evidenceAuthority: "terminal_receipt",
      mutationAuthority: "none",
      mutationApplied: false,
      baseWorldVersion: 7,
      resultWorldVersion: 7,
      visibleSummary: "Clerk Mara dialogue outcome (answer): Clerk Mara gives the desk procedure. Quote: Keep the ledger here until I stamp it.",
      evidenceRefs: ["Clerk Mara", "Player", "Atrium"],
      durableEventIds: [],
      emittedAt: 30,
    });
    const receipt = gameplayRuntimeReceiptV2Schema.parse({
      version: "gameplay-runtime-receipt.v2",
      receiptId: "receipt-world-fact-private-1",
      requestId: "world-fact-private-1",
      stepId: "step-2",
      source: {
        kind: "gm_action_checklist",
        checklistId: checklist.checklistId,
        stepId: "step-2",
      },
      capabilityId: "world_fact_record",
      toolId: "world_fact.record.v2",
      status: "accepted",
      evidenceAuthority: "mutation_receipt",
      mutationAuthority: "knowledge",
      mutationApplied: true,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
      visibleSummary: "Player-known knowledge recorded from accepted_dialogue_receipt: Clerk Mara's desk procedure is recorded.",
      evidenceRefs: ["Player", "Clerk Mara", "Atrium"],
      durableEventIds: [],
      emittedAt: 31,
    });
    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: "ledger-world-fact-private-1",
      modelPacket: packet,
      checklist,
      receipts: [dialogueReceipt, receipt],
    });

    const schedule = scheduleLocalConsequencesV2({
      scheduleId: "schedule-world-fact-private-1",
      modelPacket: { ...packet, baseWorldVersion: 8 },
      ledger,
    });
    expect(schedule.route).toBe("none");
    expect(schedule.triggerReceiptIds).toEqual([]);
  });

  it("executes support_actor.create.v2 as atomic temporary current-scene actor mutation", async () => {
    const fixture = dbTempFixture("wf-v2-db-support-actor-");
    try {
      seedP16World();
      const { packet, checklist } = supportActorToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "support-actor-db-1",
          stepId: "step-1",
          capabilityId: "support_actor_create",
          toolId: "support_actor.create.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            roleKind: "dockhand",
            roleLabel: "local dockhand",
            displayName: "Local Dockhand",
            persona: {
              publicSummary: "A practical local worker who can answer visible route questions.",
              visibleCue: "waiting near the loading marks",
              voiceHint: "short and concrete",
            },
            tags: ["dockhand", "local-helper"],
            identityBounds: {
              tier: "temporary",
              persistence: "current_scene",
              significance: "minor_support",
              agency: "reactive_only",
              mayBecomePersistentHere: false,
            },
            reason: "The player is looking for a nearby ordinary helper in the current scene.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-support-actor-db-1",
        emittedAt: 25,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        toolId: "support_actor.create.v2",
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "actor",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
      });
      expect(execution.receipt.visibleSummary).toContain("Local Dockhand");
      expect(execution.receipt.evidenceRefs).toContain("Atrium Floor");

      const actors = getDb().select().from(npcs).where(eq(npcs.name, "Local Dockhand")).all();
      expect(actors).toHaveLength(1);
      expect(actors[0]).toMatchObject({
        campaignId: "campaign-alpha",
        tier: "temporary",
        currentLocationId: "location-alpha",
        currentSceneLocationId: "scene-alpha",
      });
      expect(JSON.parse(actors[0].tags)).toEqual(expect.arrayContaining([
        "temporary-support",
        "dockhand",
        "local-helper",
      ]));
      const record = JSON.parse(actors[0].characterRecord) as {
        identity?: { role?: string; tier?: string; displayName?: string };
        socialContext?: { currentLocationId?: string };
      };
      expect(record.identity).toMatchObject({
        role: "npc",
        tier: "temporary",
        displayName: "Local Dockhand",
      });
      expect(record.socialContext?.currentLocationId).toBe("location-alpha");

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 8,
        worldTimeMinutes: 10,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.support_actor.create.v2",
        sourceEntityType: "npc",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:support-actor-db-1",
      });
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes minor_poi.create.v2 as atomic visible current-scene target mutation", async () => {
    const fixture = dbTempFixture("wf-v2-db-minor-poi-");
    const previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    try {
      process.env.GSD_CAMPAIGNS_ROOT = fixture.tempDir;
      const campaignDir = join(fixture.tempDir, "campaign-alpha");
      mkdirSync(campaignDir, { recursive: true });
      writeFileSync(join(campaignDir, "config.json"), JSON.stringify({
        name: "P16 Fixture",
        premise: "A test campaign for gameplay-cycle-v2 handlers.",
        currentTick: 0,
        createdAt: 1_000,
        updatedAt: 1_000,
      }));
      seedP16World();
      const { packet, checklist } = minorPoiToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "minor-poi-db-1",
          stepId: "step-1",
          capabilityId: "minor_poi_create",
          toolId: "minor_poi.create.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            poiLabel: "Notice Board",
            purpose: "The player needs an ordinary visible board for current-scene postings.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-minor-poi-db-1",
        emittedAt: 25,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        toolId: "minor_poi.create.v2",
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "local_scene",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
      });
      expect(execution.receipt.visibleSummary).toContain("Notice Board");
      expect(execution.receipt.evidenceRefs).toContain("Atrium Floor");

      const poiRows = getDb().select().from(locations).where(eq(locations.name, "Notice Board")).all();
      expect(poiRows).toHaveLength(1);
      expect(poiRows[0]).toMatchObject({
        campaignId: "campaign-alpha",
        kind: "ephemeral_scene",
        parentLocationId: "scene-alpha",
        anchorLocationId: "location-alpha",
        persistence: "ephemeral",
        connectedTo: "[]",
      });
      expect(JSON.parse(poiRows[0].tags)).toEqual(expect.arrayContaining([
        "minor-poi",
        "gameplay-v2-created",
        "current-scene-poi",
        "target-only",
        "no-route",
      ]));
      const poiEdges = getDb().select().from(locationEdges).all()
        .filter((edge) =>
          edge.fromLocationId === poiRows[0].id || edge.toLocationId === poiRows[0].id);
      expect(poiEdges).toHaveLength(0);

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 8,
        worldTimeMinutes: 10,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.minor_poi.create.v2",
        sourceEntityType: "location",
        sourceEntityId: poiRows[0].id,
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:minor-poi-db-1",
      });
      const traceMetadata = JSON.parse(traces[0].metadata) as {
        exposure?: string;
        movementCandidate?: boolean;
        routeEdgeCreated?: boolean;
        worldFactCreated?: boolean;
        itemCreated?: boolean;
      };
      expect(traceMetadata).toMatchObject({
        exposure: "visible_target_only",
        movementCandidate: false,
        routeEdgeCreated: false,
        worldFactCreated: false,
        itemCreated: false,
      });
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);

      const refreshedFrame = await buildSceneFrame({
        campaignId: "campaign-alpha",
        tick: 0,
        playerAction: "I inspect the notice board.",
      });
      expect(refreshedFrame.targetCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `minor_poi:${poiRows[0].id}`,
          type: "location",
          label: "Notice Board",
          locationId: poiRows[0].id,
        }),
      ]));
      expect(refreshedFrame.movementCandidates.map((candidate) => candidate.label))
        .not.toContain("Notice Board");

      const refreshedPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext({
          playerAction: "I inspect the notice board.",
          baseTick: refreshedFrame.tick,
          baseWorldVersion: 8,
        }),
        frame: refreshedFrame,
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["Atrium", "Atrium Floor", "Player"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "route_check", "movement", "minor_poi_create"],
        },
      }));
      expect(refreshedPacket.scene.targets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          ref: "Notice Board",
          label: "Notice Board",
          kind: "location",
        }),
      ]));
      expect(refreshedPacket.citableRefs).toContain("Notice Board");
      const refreshedRegistry = buildGameplayRefRegistryV2({
        turnId: "turn-alpha",
        frame: refreshedFrame,
      });
      const visibleTarget = resolveGameplayRefV2({
        registry: refreshedRegistry,
        ref: "Notice Board",
        allowedKinds: ["visible_target"],
      });
      expect(visibleTarget.status).toBe("resolved");
      if (visibleTarget.status !== "resolved") {
        throw new Error("Notice Board must resolve as a visible target.");
      }
      expect(visibleTarget.entry).toMatchObject({
        kind: "visible_target",
        metadata: {
          targetKind: "location",
        },
      });
      const movementTarget = resolveGameplayRefV2({
        registry: refreshedRegistry,
        ref: "Notice Board",
        allowedKinds: ["movement_option"],
      });
      expect(movementTarget.status).toBe("missing");
    } finally {
      if (previousCampaignRoot === undefined) {
        delete process.env.GSD_CAMPAIGNS_ROOT;
      } else {
        process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
      }
      fixture.cleanup();
    }
  });

  it("rejects minor_poi.create.v2 duplicate no-op without mutating DB state or advancing world version", async () => {
    const fixture = dbTempFixture("wf-v2-db-minor-poi-noop-");
    try {
      seedP16World();
      getDb().insert(locations).values({
        id: "poi-existing-notice-board",
        campaignId: "campaign-alpha",
        name: "Notice Board",
        description: "An existing board.",
        kind: "ephemeral_scene",
        parentLocationId: "scene-alpha",
        anchorLocationId: "location-alpha",
        persistence: "ephemeral",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: JSON.stringify(["minor-poi", "target-only", "no-route"]),
        isStarting: false,
        connectedTo: "[]",
      }).run();
      const { packet, checklist } = minorPoiToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "minor-poi-noop-1",
          stepId: "step-1",
          capabilityId: "minor_poi_create",
          toolId: "minor_poi.create.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            poiLabel: "Notice Board",
            purpose: "The player needs an ordinary visible board for current-scene postings.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-minor-poi-noop-1",
        emittedAt: 26,
      });

      expect(execution.status).toBe("rejected");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("already present in the current scene");
      expect(getDb().select().from(locations).where(eq(locations.name, "Notice Board")).all()).toHaveLength(1);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      expect(getDb().select().from(locationEdges).all()).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes location.reveal.v2 as atomic visible current-scene place-handle mutation", async () => {
    const fixture = dbTempFixture("wf-v2-db-location-reveal-");
    const previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    try {
      process.env.GSD_CAMPAIGNS_ROOT = fixture.tempDir;
      const campaignDir = join(fixture.tempDir, "campaign-alpha");
      mkdirSync(campaignDir, { recursive: true });
      writeFileSync(join(campaignDir, "config.json"), JSON.stringify({
        name: "P16 Fixture",
        premise: "A test campaign for gameplay-cycle-v2 handlers.",
        currentTick: 0,
        createdAt: 1_000,
        updatedAt: 1_000,
      }));
      seedP16World();
      const { packet, checklist } = locationRevealToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "location-reveal-db-1",
          stepId: "step-1",
          capabilityId: "location_reveal",
          toolId: "location.reveal.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            revealMode: "create_visible_place_handle",
            placeHandleKind: "service_window",
            locationLabel: "Service Window",
            visibleDescription: "A small service window set into the atrium wall.",
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The service window is bounded to visible current-scene evidence.",
            },
            exposure: {
              targetKind: "location",
              visibleCurrentSceneTarget: true,
              movementCandidate: false,
              routeEdgeCreated: false,
              currentSceneChanged: false,
              absenceProof: false,
              hiddenDiscovery: false,
              itemCreated: false,
              actorCreated: false,
              worldFactCreated: false,
            },
            reason: "The player needs this visible service window as a citable local place handle.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-location-reveal-db-1",
        emittedAt: 28,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        toolId: "location.reveal.v2",
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "local_scene",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
      });
      expect(execution.receipt.visibleSummary).toContain("Service Window");

      const handleRows = getDb().select().from(locations).where(eq(locations.name, "Service Window")).all();
      expect(handleRows).toHaveLength(1);
      expect(handleRows[0]).toMatchObject({
        campaignId: "campaign-alpha",
        kind: "ephemeral_scene",
        parentLocationId: "scene-alpha",
        anchorLocationId: "location-alpha",
        persistence: "ephemeral",
        connectedTo: "[]",
      });
      expect(JSON.parse(handleRows[0].tags)).toEqual(expect.arrayContaining([
        "location-reveal",
        "gameplay-v2-created",
        "current-scene-place-handle",
        "target-only",
        "no-route",
      ]));
      const handleEdges = getDb().select().from(locationEdges).all()
        .filter((edge) =>
          edge.fromLocationId === handleRows[0].id || edge.toLocationId === handleRows[0].id);
      expect(handleEdges).toHaveLength(0);

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 8,
        worldTimeMinutes: 10,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.location.reveal.v2",
        sourceEntityType: "location",
        sourceEntityId: handleRows[0].id,
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:location-reveal-db-1",
      });
      const traceMetadata = JSON.parse(traces[0].metadata) as {
        exposure?: {
          movementCandidate?: boolean;
          routeEdgeCreated?: boolean;
          currentSceneChanged?: boolean;
          absenceProof?: boolean;
          hiddenDiscovery?: boolean;
        };
        movementCandidate?: boolean;
        routeEdgeCreated?: boolean;
        currentSceneChanged?: boolean;
        absenceProof?: boolean;
        hiddenDiscovery?: boolean;
        itemCreated?: boolean;
        actorCreated?: boolean;
        worldFactCreated?: boolean;
      };
      expect(traceMetadata.exposure).toMatchObject({
        movementCandidate: false,
        routeEdgeCreated: false,
        currentSceneChanged: false,
        absenceProof: false,
        hiddenDiscovery: false,
      });
      expect(traceMetadata).toMatchObject({
        movementCandidate: false,
        routeEdgeCreated: false,
        currentSceneChanged: false,
        absenceProof: false,
        hiddenDiscovery: false,
        itemCreated: false,
        actorCreated: false,
        worldFactCreated: false,
      });
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);

      const refreshedFrame = await buildSceneFrame({
        campaignId: "campaign-alpha",
        tick: 0,
        playerAction: "I inspect the service window.",
      });
      expect(refreshedFrame.targetCandidates).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: `location_reveal:${handleRows[0].id}`,
          type: "location",
          label: "Service Window",
          locationId: handleRows[0].id,
        }),
      ]));
      expect(refreshedFrame.movementCandidates.map((candidate) => candidate.label))
        .not.toContain("Service Window");

      const refreshedPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext({
          playerAction: "I inspect the service window.",
          baseTick: refreshedFrame.tick,
          baseWorldVersion: 8,
        }),
        frame: refreshedFrame,
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["Atrium", "Atrium Floor", "Player"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "route_check", "movement", "location_reveal"],
        },
      }));
      expect(refreshedPacket.scene.targets).toEqual(expect.arrayContaining([
        expect.objectContaining({
          ref: "Service Window",
          label: "Service Window",
          kind: "location",
        }),
      ]));
      expect(refreshedPacket.citableRefs).toContain("Service Window");
      const refreshedRegistry = buildGameplayRefRegistryV2({
        turnId: "turn-alpha",
        frame: refreshedFrame,
      });
      const visibleTarget = resolveGameplayRefV2({
        registry: refreshedRegistry,
        ref: "Service Window",
        allowedKinds: ["visible_target"],
      });
      expect(visibleTarget.status).toBe("resolved");
      if (visibleTarget.status !== "resolved") {
        throw new Error("Service Window must resolve as a visible target.");
      }
      expect(visibleTarget.entry).toMatchObject({
        kind: "visible_target",
        metadata: {
          targetKind: "location",
        },
      });
      const movementTarget = resolveGameplayRefV2({
        registry: refreshedRegistry,
        ref: "Service Window",
        allowedKinds: ["movement_option"],
      });
      expect(movementTarget.status).toBe("missing");
    } finally {
      if (previousCampaignRoot === undefined) {
        delete process.env.GSD_CAMPAIGNS_ROOT;
      } else {
        process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
      }
      fixture.cleanup();
    }
  });

  it("rejects location.reveal.v2 duplicate no-op without mutating DB state or advancing world version", async () => {
    const fixture = dbTempFixture("wf-v2-db-location-reveal-noop-");
    try {
      seedP16World();
      getDb().insert(locations).values({
        id: "place-existing-service-window",
        campaignId: "campaign-alpha",
        name: "Service Window",
        description: "An existing place handle.",
        kind: "ephemeral_scene",
        parentLocationId: "scene-alpha",
        anchorLocationId: "location-alpha",
        persistence: "ephemeral",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: JSON.stringify(["location-reveal", "target-only", "no-route"]),
        isStarting: false,
        connectedTo: "[]",
      }).run();
      const { packet, checklist } = locationRevealToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "location-reveal-noop-1",
          stepId: "step-1",
          capabilityId: "location_reveal",
          toolId: "location.reveal.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            revealMode: "create_visible_place_handle",
            placeHandleKind: "service_window",
            locationLabel: "Service Window",
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The service window is bounded to visible current-scene evidence.",
            },
            exposure: {
              targetKind: "location",
              visibleCurrentSceneTarget: true,
              movementCandidate: false,
              routeEdgeCreated: false,
              currentSceneChanged: false,
              absenceProof: false,
              hiddenDiscovery: false,
              itemCreated: false,
              actorCreated: false,
              worldFactCreated: false,
            },
            reason: "The player needs this visible service window as a citable local place handle.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-location-reveal-noop-1",
        emittedAt: 29,
      });

      expect(execution.status).toBe("rejected");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("already present in the current scene");
      expect(getDb().select().from(locations).where(eq(locations.name, "Service Window")).all()).toHaveLength(1);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      expect(getDb().select().from(locationEdges).all()).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back location.reveal.v2 row insert when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-location-reveal-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = locationRevealToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "location-reveal-rollback-1",
          stepId: "step-1",
          capabilityId: "location_reveal",
          toolId: "location.reveal.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            revealMode: "create_visible_place_handle",
            placeHandleKind: "service_window",
            locationLabel: "Service Window",
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The service window is bounded to visible current-scene evidence.",
            },
            exposure: {
              targetKind: "location",
              visibleCurrentSceneTarget: true,
              movementCandidate: false,
              routeEdgeCreated: false,
              currentSceneChanged: false,
              absenceProof: false,
              hiddenDiscovery: false,
              itemCreated: false,
              actorCreated: false,
              worldFactCreated: false,
            },
            reason: "The player needs this visible service window as a citable local place handle.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterLocationRevealInsertBeforeAuthorityTrace: () => {
              throw new Error("forced location reveal authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-location-reveal-rollback-1",
        emittedAt: 30,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced location reveal authority failure");
      expect(getDb().select().from(locations).where(eq(locations.name, "Service Window")).all()).toHaveLength(0);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      expect(getDb().select().from(locationEdges).all()).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back minor_poi.create.v2 row insert when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-minor-poi-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = minorPoiToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "minor-poi-rollback-1",
          stepId: "step-1",
          capabilityId: "minor_poi_create",
          toolId: "minor_poi.create.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            poiLabel: "Notice Board",
            purpose: "The player needs an ordinary visible board for current-scene postings.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterMinorPoiInsertBeforeAuthorityTrace: () => {
              throw new Error("forced minor poi authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-minor-poi-rollback-1",
        emittedAt: 27,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced minor poi authority failure");
      expect(getDb().select().from(locations).where(eq(locations.name, "Notice Board")).all()).toHaveLength(0);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      expect(getDb().select().from(locationEdges).all()).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects support_actor.create.v2 duplicate no-op without mutating DB state or advancing world version", async () => {
    const fixture = dbTempFixture("wf-v2-db-support-actor-noop-");
    try {
      seedP16World();
      getDb().insert(npcs).values({
        id: "actor-existing-temp",
        campaignId: "campaign-alpha",
        name: "Local Dockhand",
        persona: "An existing temporary helper.",
        characterRecord: "{}",
        derivedTags: "[]",
        tags: JSON.stringify(["temporary-support", "dockhand"]),
        tier: "temporary",
        currentLocationId: "location-alpha",
        currentSceneLocationId: "scene-alpha",
        goals: '{"short_term":[],"long_term":[]}',
        beliefs: "[]",
        unprocessedImportance: 0,
        inactiveTicks: 0,
        createdAt: 1_000,
      }).run();
      const { packet, checklist } = supportActorToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "support-actor-noop-db-1",
          stepId: "step-1",
          capabilityId: "support_actor_create",
          toolId: "support_actor.create.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            roleKind: "dockhand",
            roleLabel: "local dockhand",
            displayName: "Local Dockhand",
            persona: {
              publicSummary: "A practical local worker.",
            },
            tags: ["dockhand"],
            identityBounds: {
              tier: "temporary",
              persistence: "current_scene",
              significance: "minor_support",
              agency: "reactive_only",
              mayBecomePersistentHere: false,
            },
            reason: "The player is looking for a nearby ordinary helper in the current scene.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-support-actor-noop-db-1",
        emittedAt: 26,
      });

      expect(execution.status).toBe("rejected");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("already present in the current scene");
      expect(getDb().select().from(npcs).where(eq(npcs.name, "Local Dockhand")).all()).toHaveLength(1);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back support_actor.create.v2 row insert when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-support-actor-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = supportActorToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "support-actor-rollback-db-1",
          stepId: "step-1",
          capabilityId: "support_actor_create",
          toolId: "support_actor.create.v2",
          effectBinding: {
            anchorScope: "current_scene",
            anchorRef: "Atrium Floor",
            roleKind: "dockhand",
            roleLabel: "local dockhand",
            displayName: "Rollback Dockhand",
            persona: {
              publicSummary: "A practical local worker.",
            },
            tags: ["dockhand"],
            identityBounds: {
              tier: "temporary",
              persistence: "current_scene",
              significance: "minor_support",
              agency: "reactive_only",
              mayBecomePersistentHere: false,
            },
            reason: "The player is looking for a nearby ordinary helper in the current scene.",
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterSupportActorInsertBeforeAuthorityTrace: () => {
              throw new Error("forced support actor authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-support-actor-rollback-db-1",
        emittedAt: 27,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt.failureReason).toContain("forced support actor authority failure");
      expect(getDb().select().from(npcs).where(eq(npcs.name, "Rollback Dockhand")).all()).toHaveLength(0);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes entity.tag.v2 as atomic visible-item tag mutation with authority trace", async () => {
    const fixture = dbTempFixture("wf-v2-db-entity-tag-");
    try {
      seedP16World();
      const { packet, checklist } = entityTagToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "entity-tag-db-1",
          stepId: "step-1",
          capabilityId: "entity_tag",
          toolId: "entity.tag.v2",
          effectBinding: {
            entityScope: "visible_item",
            entityRef: "brass ledger",
            operation: "add",
            tag: "Urgent Discrepancy",
            evidenceRefs: ["Player", "Atrium", "brass ledger"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-entity-tag-db-1",
        emittedAt: 26,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "item",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        durableEventIds: [],
      });
      expect(execution.receipt.visibleSummary).toContain("brass ledger adds tag urgent-discrepancy");

      const item = getDb().select().from(items).where(eq(items.id, "item-secret-id")).get();
      expect(JSON.parse(item?.tags ?? "[]")).toEqual(["document", "urgent-discrepancy"]);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(8);
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.entity.tag.v2",
        sourceEntityType: "item",
        sourceEntityId: "item-secret-id",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:entity-tag-db-1",
      });
      expect(JSON.parse(traces[0]?.stateDeltaRefs ?? "[]")).toEqual(["item:item-secret-id:tags"]);
      expect(JSON.parse(traces[0]?.metadata ?? "{}")).toMatchObject({
        entityScope: "visible_item",
        entityRef: "brass ledger",
        operation: "add",
        tag: "urgent-discrepancy",
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("executes entity.tag.v2 remove against an inventory item", async () => {
    const fixture = dbTempFixture("wf-v2-db-entity-tag-remove-");
    try {
      seedP16World();
      getDb().update(items)
        .set({ tags: JSON.stringify(["document", "sealed"]) })
        .where(eq(items.id, "item-player-1"))
        .run();
      const { packet, checklist } = entityTagToolPlanFixture();
      const inventoryChecklist = {
        ...checklist,
        steps: [{
          ...checklist.steps[0],
          targetRefs: ["sealed note"],
          evidenceRefs: ["Player", "Atrium", "sealed note"],
        }],
      };
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist: inventoryChecklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "entity-tag-remove-db-1",
          stepId: "step-1",
          capabilityId: "entity_tag",
          toolId: "entity.tag.v2",
          effectBinding: {
            entityScope: "inventory_item",
            entityRef: "sealed note",
            operation: "remove",
            tag: "sealed",
            evidenceRefs: ["Player", "Atrium", "sealed note"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-entity-tag-remove-db-1",
        emittedAt: 27,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        mutationApplied: true,
        mutationAuthority: "item",
        resultWorldVersion: 8,
      });
      const item = getDb().select().from(items).where(eq(items.id, "item-player-1")).get();
      expect(JSON.parse(item?.tags ?? "[]")).toEqual(["document"]);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects entity.tag.v2 no-op without mutating DB state or advancing world version", async () => {
    const fixture = dbTempFixture("wf-v2-db-entity-tag-noop-");
    try {
      seedP16World();
      const { packet, checklist } = entityTagToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "entity-tag-noop-db-1",
          stepId: "step-1",
          capabilityId: "entity_tag",
          toolId: "entity.tag.v2",
          effectBinding: {
            entityScope: "visible_item",
            entityRef: "brass ledger",
            operation: "add",
            tag: "document",
            evidenceRefs: ["Player", "Atrium", "brass ledger"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-entity-tag-noop-db-1",
        emittedAt: 28,
      });

      expect(execution.status).toBe("rejected");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("already has tag document");
      const item = getDb().select().from(items).where(eq(items.id, "item-secret-id")).get();
      expect(JSON.parse(item?.tags ?? "[]")).toEqual(["document"]);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back entity.tag.v2 row changes when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-entity-tag-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = entityTagToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "entity-tag-rollback-db-1",
          stepId: "step-1",
          capabilityId: "entity_tag",
          toolId: "entity.tag.v2",
          effectBinding: {
            entityScope: "visible_item",
            entityRef: "brass ledger",
            operation: "add",
            tag: "suspicious",
            evidenceRefs: ["Player", "Atrium", "brass ledger"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterEntityTagRowUpdateBeforeAuthorityTrace: () => {
              throw new Error("forced entity tag authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-entity-tag-rollback-db-1",
        emittedAt: 29,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced entity tag authority failure");
      const item = getDb().select().from(items).where(eq(items.id, "item-secret-id")).get();
      expect(JSON.parse(item?.tags ?? "[]")).toEqual(["document"]);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes item.transfer.v2 drop as atomic item-location mutation with authority trace", async () => {
    const fixture = dbTempFixture("wf-v2-db-item-transfer-drop-");
    try {
      seedP16World();
      const { packet, checklist } = itemTransferToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "item-transfer-drop-db-1",
          stepId: "step-1",
          capabilityId: "item_transfer",
          toolId: "item.transfer.v2",
          effectBinding: {
            action: "drop_to_current_scene",
            itemScope: "player_inventory_item",
            itemRef: "sealed note",
            sourceScope: "player_inventory",
            sourceRef: "Player",
            targetScope: "current_scene",
            targetRef: "Atrium Floor",
            equip: { mode: "unequipped" },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-item-transfer-drop-db-1",
        emittedAt: 30,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "item",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        durableEventIds: [],
      });
      const item = getDb().select().from(items).where(eq(items.id, "item-player-1")).get();
      expect(item).toMatchObject({
        ownerId: null,
        locationId: "scene-alpha",
        equipState: "carried",
        equippedSlot: null,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.item.transfer.v2",
        sourceEntityType: "item",
        sourceEntityId: "item-player-1",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:item-transfer-drop-db-1",
      });
      expect(JSON.parse(traces[0]?.stateDeltaRefs ?? "[]")).toEqual(["item:item-player-1:custody"]);
      expect(JSON.parse(traces[0]?.metadata ?? "{}")).toMatchObject({
        action: "drop_to_current_scene",
        itemScope: "player_inventory_item",
        sourceScope: "player_inventory",
        targetScope: "current_scene",
        previous: {
          ownerId: "player-alpha",
          locationId: null,
          equipState: "carried",
          equippedSlot: null,
        },
        next: {
          ownerId: null,
          locationId: "scene-alpha",
          equipState: "carried",
          equippedSlot: null,
        },
      });
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(8);
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes item.transfer.v2 take from visible scene item into player inventory", async () => {
    const fixture = dbTempFixture("wf-v2-db-item-transfer-take-");
    try {
      seedP16World();
      const { packet, checklist } = itemTransferToolPlanFixture();
      const takeChecklist = {
        ...checklist,
        steps: [{
          ...checklist.steps[0],
          targetRefs: ["brass ledger", "Player"],
          evidenceRefs: ["Player", "Atrium", "Atrium Floor", "brass ledger"],
        }],
      };
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist: takeChecklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "item-transfer-take-db-1",
          stepId: "step-1",
          capabilityId: "item_transfer",
          toolId: "item.transfer.v2",
          effectBinding: {
            action: "take_to_player_inventory",
            itemScope: "visible_scene_item",
            itemRef: "brass ledger",
            sourceScope: "current_scene",
            sourceRef: "Atrium Floor",
            targetScope: "player_inventory",
            targetRef: "Player",
            equip: { mode: "carried" },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor", "brass ledger"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-item-transfer-take-db-1",
        emittedAt: 31,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        mutationApplied: true,
        mutationAuthority: "item",
        resultWorldVersion: 8,
      });
      const item = getDb().select().from(items).where(eq(items.id, "item-secret-id")).get();
      expect(item).toMatchObject({
        ownerId: "player-alpha",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
    } finally {
      fixture.cleanup();
    }
  });

  it("executes item.transfer.v2 equip and rejects same-slot no-op without advancing world version", async () => {
    const fixture = dbTempFixture("wf-v2-db-item-transfer-equip-");
    try {
      seedP16World();
      const { packet, checklist } = itemTransferToolPlanFixture();
      const equipChecklist = {
        ...checklist,
        steps: [{
          ...checklist.steps[0],
          targetRefs: ["sealed note", "Player"],
          evidenceRefs: ["Player", "Atrium", "sealed note"],
        }],
      };
      const request = {
        version: "gameplay-tool-request.v2" as const,
        requestId: "item-transfer-equip-db-1",
        stepId: "step-1",
        capabilityId: "item_transfer" as const,
        toolId: "item.transfer.v2" as const,
        effectBinding: {
          action: "equip_player_item" as const,
          itemScope: "player_inventory_item" as const,
          itemRef: "sealed note",
          sourceScope: "player_inventory" as const,
          sourceRef: "Player",
          targetScope: "player_inventory" as const,
          targetRef: "Player",
          equip: { mode: "equipped" as const, slot: "main-hand" },
          evidenceRefs: ["Player", "Atrium", "sealed note"],
        },
      };
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist: equipChecklist,
        stepId: "step-1",
        request,
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-item-transfer-equip-db-1",
        emittedAt: 32,
      });

      expect(execution.status).toBe("accepted");
      let item = getDb().select().from(items).where(eq(items.id, "item-player-1")).get();
      expect(item).toMatchObject({
        ownerId: "player-alpha",
        locationId: null,
        equipState: "equipped",
        equippedSlot: "main-hand",
      });

      const rejected = await executeGameplayToolRequestV2({
        packet: { ...packet, baseWorldVersion: 8 },
        checklist: { ...equipChecklist, baseWorldVersion: 8 },
        stepId: "step-1",
        request: { ...request, requestId: "item-transfer-equip-noop-db-1" },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: {
          ...registryForPacket(sceneFrame({ worldVersion: 8 })),
          baseWorldVersion: 8,
        },
        receiptId: "receipt-item-transfer-equip-noop-db-1",
        emittedAt: 33,
      });
      expect(rejected.status).toBe("rejected");
      expect(rejected.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 8,
      });
      item = getDb().select().from(items).where(eq(items.id, "item-player-1")).get();
      expect(item?.equippedSlot).toBe("main-hand");
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(8);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back item.transfer.v2 row changes when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-item-transfer-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = itemTransferToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "item-transfer-rollback-db-1",
          stepId: "step-1",
          capabilityId: "item_transfer",
          toolId: "item.transfer.v2",
          effectBinding: {
            action: "drop_to_current_scene",
            itemScope: "player_inventory_item",
            itemRef: "sealed note",
            sourceScope: "player_inventory",
            sourceRef: "Player",
            targetScope: "current_scene",
            targetRef: "Atrium Floor",
            equip: { mode: "unequipped" },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor", "sealed note"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterItemTransferRowUpdateBeforeAuthorityTrace: () => {
              throw new Error("forced item transfer authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-item-transfer-rollback-db-1",
        emittedAt: 34,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced item transfer authority failure");
      const item = getDb().select().from(items).where(eq(items.id, "item-player-1")).get();
      expect(item).toMatchObject({
        ownerId: "player-alpha",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("executes actor.condition_set.v2 Player posture as atomic actor mutation with authority trace", async () => {
    const fixture = dbTempFixture("wf-v2-db-actor-condition-player-");
    const previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    try {
      process.env.GSD_CAMPAIGNS_ROOT = fixture.tempDir;
      const campaignDir = join(fixture.tempDir, "campaign-alpha");
      mkdirSync(campaignDir, { recursive: true });
      writeFileSync(join(campaignDir, "config.json"), JSON.stringify({
        name: "P16 Fixture",
        premise: "A test campaign for gameplay-cycle-v2 handlers.",
        currentTick: 0,
        createdAt: 1_000,
        updatedAt: 1_000,
      }));
      seedP16World();
      const { packet, checklist } = actorConditionToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-player-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Player",
            actorScope: "player_actor",
            operation: {
              kind: "set_condition",
              conditionLabel: "prone",
            },
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The player visibly drops to one knee in the current scene.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-actor-condition-player-db-1",
        emittedAt: 35,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        toolId: "actor.condition_set.v2",
        evidenceAuthority: "mutation_receipt",
        mutationApplied: true,
        mutationAuthority: "actor",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        durableEventIds: [],
      });
      expect(execution.receipt.visibleSummary).toBe("Player gains condition prone.");
      expect(execution.receipt.evidenceRefs).toEqual(expect.arrayContaining([
        "Player",
        "Atrium",
        "Atrium Floor",
      ]));

      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player).toMatchObject({
        hp: 5,
        currentLocationId: "location-alpha",
        currentSceneLocationId: "scene-alpha",
      });
      const playerRecord = JSON.parse(player?.characterRecord ?? "{}") as {
        state?: { hp?: number; conditions?: string[] };
      };
      expect(playerRecord.state?.hp).toBe(5);
      expect(playerRecord.state?.conditions).toEqual(["prone"]);
      expect(JSON.parse(player?.derivedTags ?? "[]")).toContain("prone");

      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock).toMatchObject({
        worldVersion: 8,
        worldTimeMinutes: 10,
      });
      const traces = getDb().select().from(authorityTraces).all();
      expect(traces).toHaveLength(1);
      expect(traces[0]).toMatchObject({
        operation: "gameplay-cycle-v2.actor.condition_set.v2",
        sourceEntityType: "player",
        sourceEntityId: "player-alpha",
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        toolResultId: "gameplay-v2:turn-alpha:actor-condition-player-db-1",
      });
      expect(JSON.parse(traces[0]?.stateDeltaRefs ?? "[]")).toEqual(["player:player-alpha:condition:prone"]);
      expect(JSON.parse(traces[0]?.metadata ?? "{}")).toMatchObject({
        actorRef: "Player",
        actorScope: "player_actor",
        actorKind: "player",
        operation: {
          kind: "set_condition",
          conditionLabel: "prone",
        },
        previousHp: 5,
        nextHp: 5,
        previousConditions: [],
        nextConditions: ["prone"],
        sourceAuthority: {
          kind: "current_scene_visible_evidence",
        },
      });
      expect(getDb().select().from(turnClockLedger).all()).toHaveLength(0);
      expect(getDb().select().from(locationRecentEvents).all()).toHaveLength(0);

      const refreshedFrame = await buildSceneFrame({
        campaignId: "campaign-alpha",
        tick: 0,
        playerAction: "I stay prone.",
      });
      const refreshedPlayer = refreshedFrame.roster.active.find((actor) => actor.type === "player");
      expect(refreshedPlayer).toMatchObject({
        label: "Player",
        statusConditions: ["prone"],
        hp: 5,
      });
      const refreshedPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
        version: "scene-frame-envelope.v2",
        attempt: refreshedAttemptContext({
          playerAction: "I stay prone.",
          baseTick: refreshedFrame.tick,
          baseWorldVersion: 8,
        }),
        frame: refreshedFrame,
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["Atrium", "Atrium Floor", "Player"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible", "condition_set"],
        },
      }));
      expect(refreshedPacket.scene.actors).toEqual(expect.arrayContaining([
        expect.objectContaining({
          ref: "Player",
          status: {
            conditions: ["prone"],
            hp: 5,
          },
        }),
      ]));
    } finally {
      if (previousCampaignRoot === undefined) {
        delete process.env.GSD_CAMPAIGNS_ROOT;
      } else {
        process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
      }
      fixture.cleanup();
    }
  });

  it("executes actor.condition_set.v2 against a visible NPC condition but rejects NPC HP authority", async () => {
    const fixture = dbTempFixture("wf-v2-db-actor-condition-npc-");
    try {
      seedP16World();
      const { packet, checklist } = actorConditionToolPlanFixture();
      const npcChecklist = {
        ...checklist,
        steps: [{
          ...checklist.steps[0],
          actorRef: "Clerk Mara",
          targetRefs: ["Clerk Mara"],
          evidenceRefs: ["Player", "Atrium", "Clerk Mara"],
        }],
      };
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist: npcChecklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-npc-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Clerk Mara",
            actorScope: "visible_actor",
            operation: {
              kind: "set_condition",
              conditionLabel: "exhausted",
            },
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Clerk Mara"],
              sourceSummary: "Clerk Mara is visibly sagging in the current scene.",
            },
            evidenceRefs: ["Player", "Atrium", "Clerk Mara"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-actor-condition-npc-db-1",
        emittedAt: 36,
      });

      expect(execution.status).toBe("accepted");
      expect(execution.receipt).toMatchObject({
        mutationApplied: true,
        mutationAuthority: "actor",
        resultWorldVersion: 8,
      });
      const npc = getDb().select().from(npcs).where(eq(npcs.id, "actor-npc-1")).get();
      const npcRecord = JSON.parse(npc?.characterRecord ?? "{}") as {
        state?: { conditions?: string[] };
      };
      expect(npcRecord.state?.conditions).toEqual(["exhausted"]);
      expect(JSON.parse(npc?.derivedTags ?? "[]")).toContain("exhausted");

      const npcHpExecution = await executeGameplayToolRequestV2({
        packet: { ...packet, baseWorldVersion: 8 },
        checklist: { ...npcChecklist, baseWorldVersion: 8 },
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-npc-hp-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Clerk Mara",
            actorScope: "visible_actor",
            operation: {
              kind: "adjust_player_hp",
              hpDelta: -1,
            },
            sourceAuthority: {
              kind: "accepted_runtime_receipt",
              sourceReceiptIds: ["receipt-actor-condition-npc-db-1"],
              sourceSummary: "A prior accepted source exists, but NPC HP remains out of scope.",
            },
            evidenceRefs: ["Player", "Atrium", "Clerk Mara"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: {
          ...registryForPacket(sceneFrame({ worldVersion: 8 })),
          baseWorldVersion: 8,
        },
        priorReceipts: [execution.receipt],
        receiptId: "receipt-actor-condition-npc-hp-db-1",
        emittedAt: 37,
      });
      expect(npcHpExecution.status).toBe("rejected");
      expect(npcHpExecution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 8,
      });
      expect(npcHpExecution.receipt.failureReason).toContain("adjust_player_hp is only valid for Player");
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(8);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("rejects actor.condition_set.v2 duplicate and unsupported Player HP sources without mutating DB state", async () => {
    const fixture = dbTempFixture("wf-v2-db-actor-condition-noop-");
    try {
      seedP16World();
      const { packet, checklist } = actorConditionToolPlanFixture();
      const first = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-noop-first-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Player",
            actorScope: "player_actor",
            operation: {
              kind: "set_condition",
              conditionLabel: "prone",
            },
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The player visibly drops to one knee.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: registryForPacket(),
        receiptId: "receipt-actor-condition-noop-first-db-1",
        emittedAt: 38,
      });
      expect(first.status).toBe("accepted");

      const duplicate = await executeGameplayToolRequestV2({
        packet: { ...packet, baseWorldVersion: 8 },
        checklist: { ...checklist, baseWorldVersion: 8 },
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-noop-second-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Player",
            actorScope: "player_actor",
            operation: {
              kind: "set_condition",
              conditionLabel: "prone",
            },
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The player is already visibly prone.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: {
          ...registryForPacket(sceneFrame({ worldVersion: 8 })),
          baseWorldVersion: 8,
        },
        receiptId: "receipt-actor-condition-noop-second-db-1",
        emittedAt: 39,
      });

      expect(duplicate.status).toBe("rejected");
      expect(duplicate.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 8,
      });
      expect(duplicate.receipt.failureReason).toContain("already has condition");

      const hpFromVisibleScene = await executeGameplayToolRequestV2({
        packet: { ...packet, baseWorldVersion: 8 },
        checklist: { ...checklist, baseWorldVersion: 8 },
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-hp-visible-source-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Player",
            actorScope: "player_actor",
            operation: {
              kind: "adjust_player_hp",
              hpDelta: -1,
            },
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "Raw visible scene evidence is not enough for HP harm in this slice.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2(),
        refRegistry: {
          ...registryForPacket(sceneFrame({ worldVersion: 8 })),
          baseWorldVersion: 8,
        },
        receiptId: "receipt-actor-condition-hp-visible-source-db-1",
        emittedAt: 40,
      });
      expect(hpFromVisibleScene.status).toBe("rejected");
      expect(hpFromVisibleScene.receipt.failureReason).toContain("Player HP adjustment requires an accepted runtime receipt source");
      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player?.hp).toBe(5);
      const playerRecord = JSON.parse(player?.characterRecord ?? "{}") as {
        state?: { conditions?: string[] };
      };
      expect(playerRecord.state?.conditions).toEqual(["prone"]);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(8);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(1);
    } finally {
      fixture.cleanup();
    }
  });

  it("rolls back actor.condition_set.v2 row changes when authority commit fails inside the v2 transaction", async () => {
    const fixture = dbTempFixture("wf-v2-db-actor-condition-rollback-");
    try {
      seedP16World();
      const { packet, checklist } = actorConditionToolPlanFixture();
      const execution = await executeGameplayToolRequestV2({
        packet,
        checklist,
        stepId: "step-1",
        request: {
          version: "gameplay-tool-request.v2",
          requestId: "actor-condition-rollback-db-1",
          stepId: "step-1",
          capabilityId: "condition_set",
          toolId: "actor.condition_set.v2",
          effectBinding: {
            actorRef: "Player",
            actorScope: "player_actor",
            operation: {
              kind: "set_condition",
              conditionLabel: "prone",
            },
            sourceAuthority: {
              kind: "current_scene_visible_evidence",
              sourceRefs: ["Player", "Atrium Floor"],
              sourceSummary: "The player visibly drops to one knee.",
            },
            evidenceRefs: ["Player", "Atrium", "Atrium Floor"],
          },
        },
        handlers: createDbBackedGameplayToolHandlersV2({
          testHooks: {
            afterActorConditionRowUpdateBeforeAuthorityTrace: () => {
              throw new Error("forced actor condition authority failure");
            },
          },
        }),
        refRegistry: registryForPacket(),
        receiptId: "receipt-actor-condition-rollback-db-1",
        emittedAt: 41,
      });

      expect(execution.status).toBe("failed");
      expect(execution.receipt).toMatchObject({
        mutationApplied: false,
        mutationAuthority: "none",
        resultWorldVersion: 7,
      });
      expect(execution.receipt.failureReason).toContain("forced actor condition authority failure");
      const player = getDb().select().from(players).where(eq(players.id, "player-alpha")).get();
      expect(player?.hp).toBe(5);
      const playerRecord = JSON.parse(player?.characterRecord ?? "{}") as {
        state?: { conditions?: string[] };
      };
      expect(playerRecord.state?.conditions ?? []).toEqual([]);
      const clock = getDb().select().from(worldClocks).where(eq(worldClocks.campaignId, "campaign-alpha")).get();
      expect(clock?.worldVersion).toBe(7);
      expect(getDb().select().from(authorityTraces).all()).toHaveLength(0);
    } finally {
      fixture.cleanup();
    }
  });

  it("persists v2 settled packets through pending, rendering, and finalized states", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "wf-v2-packet-store-"));
    connectDb(join(tempDir, "state.db"));
    try {
      const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
        version: "scene-frame-envelope.v2",
        attempt: attemptContext(),
        frame: sceneFrame(),
        scopedForecastExcerpt: null,
        refs: {
          visibleRefs: ["Atrium", "Player"],
          privateGuardTerms: [],
          allowedCapabilityIds: ["observe_visible"],
        },
      }));
      const read = validateGmReadNoMutationV2({
        packet: modelPacket,
        candidate: {
          version: "gm-read.v2",
          path: "direct",
          situationSummary: "The player observes the atrium.",
          sceneQuestion: "What is visible?",
          focalActorRefs: ["Player"],
          evidenceRefs: ["Player", "Atrium"],
          actionInterpretation: {
            intent: "Observe.",
            method: null,
            targetRefs: ["Atrium"],
          },
          turnNeed: "none",
          rationale: "No mutation.",
          noMutationReason: "Visible scene evidence is enough.",
        },
      }).read;
      const settledPacket = buildNoReceiptSettledTurnPacketV2({
        packetId: "v2packet-test-persist",
        modelPacket,
        gmRead: read,
      });
      const persistence = buildSettledPacketPersistencePendingV2(settledPacket);
      const narratorView = buildNarratorViewV2(settledPacket);

      const pending = persistSettledTurnPacketV2({
        packet: settledPacket,
        persistence,
        narratorView,
      });
      expect(pending).toMatchObject({
        packetId: "v2packet-test-persist",
        status: "resolved_pending_narration",
        narratorAttemptStatus: "not_started",
      });
      expect(readGameplayCycleV2Packet("v2packet-test-persist")?.packet.version)
        .toBe("settled-turn-packet.v2");

      const rendering = markGameplayCycleV2PacketNarratorRendering("v2packet-test-persist");
      expect(rendering).toMatchObject({
        status: "narrator_rendering",
        narratorAttemptStatus: "started",
      });

      const projection = buildApiResponseProjectionV2({
        packet: settledPacket,
        narrativeText: "You take in the atrium.",
        tick: 1,
        worldVersion: 7,
        worldTimeMinutes: 5,
      });
      const finalized = finalizeGameplayCycleV2Packet({
        packetId: settledPacket.packetId,
        apiProjection: projection,
      });
      expect(finalized).toMatchObject({
        status: "finalized",
        narratorAttemptStatus: "succeeded_projected",
      });
      expect(finalized.apiProjection?.doneEvent.data.packetId).toBe("v2packet-test-persist");
      expect(finalized.narratorView?.acceptedEvidence.length).toBeGreaterThan(0);
    } finally {
      closeDb();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("persists mutating checklist and receipt ledger audit with the v2 packet", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "wf-v2-packet-audit-"));
    connectDb(join(tempDir, "state.db"));
    try {
      const { packet: modelPacket, gmRead, checklist } = movementToolPlanFixture();
      const receipt = gameplayRuntimeReceiptV2Schema.parse({
        version: "gameplay-runtime-receipt.v2",
        receiptId: "receipt-audit-move-1",
        requestId: "tool-request-audit-move-1",
        stepId: "step-1",
        source: {
          kind: "gm_action_checklist",
          checklistId: checklist.checklistId,
          stepId: "step-1",
        },
        capabilityId: "movement",
        toolId: "actor.move.v2",
        status: "accepted",
        evidenceAuthority: "mutation_receipt",
        mutationAuthority: "local_scene",
        mutationApplied: true,
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        visibleSummary: "Player moved to North Hall.",
        evidenceRefs: ["Player", "North Hall"],
        durableEventIds: ["event-audit-move-1"],
        emittedAt: 10,
      });
      const ledger = buildRuntimeReceiptLedgerV2({
        ledgerId: "ledger-audit-1",
        modelPacket,
        checklist,
        receipts: [receipt],
      });
      const settledPacket = buildRuntimeSettledTurnPacketV2({
        packetId: "v2packet-test-audit",
        modelPacket,
        receiptModelPackets: {
          [receipt.receiptId]: modelPacket,
        },
        gmRead,
        checklist,
        ledger,
      });
      const narratorView = buildNarratorViewV2(settledPacket);

      const pending = persistSettledTurnPacketV2({
        packet: settledPacket,
        persistence: buildSettledPacketPersistencePendingV2(settledPacket),
        checklist,
        receiptLedger: ledger,
        narratorView,
      });
      expect(pending.checklist?.checklistId).toBe(checklist.checklistId);
      expect(pending.receiptLedger?.ledgerId).toBe("ledger-audit-1");
      expect(pending.receiptLedger?.receipts[0]?.receiptId).toBe("receipt-audit-move-1");

      const rendering = markGameplayCycleV2PacketNarratorRendering(settledPacket.packetId);
      expect(rendering.checklist?.checklistId).toBe(checklist.checklistId);
      expect(rendering.receiptLedger?.receipts).toHaveLength(1);

      const failedPending = markGameplayCycleV2PacketNarratorFailedPendingRetry(settledPacket.packetId);
      expect(failedPending.status).toBe("resolved_pending_narration");
      expect(failedPending.narratorAttemptStatus).toBe("failed_pending_retry");
      expect(failedPending.checklist?.checklistId).toBe(checklist.checklistId);
      expect(failedPending.receiptLedger?.ledgerId).toBe("ledger-audit-1");
      expect(failedPending.apiProjection).toBeNull();

      const projection = buildApiResponseProjectionV2({
        packet: settledPacket,
        narrativeText: "You arrive in North Hall.",
        tick: 1,
        worldVersion: 8,
        worldTimeMinutes: 6,
      });
      const finalized = finalizeGameplayCycleV2Packet({
        packetId: settledPacket.packetId,
        apiProjection: projection,
      });
      expect(finalized.checklist?.steps[0]?.requiredCapabilityId).toBe("movement");
      expect(finalized.receiptLedger?.receipts[0]?.resultWorldVersion).toBe(8);
      expect(readGameplayCycleV2Packet(settledPacket.packetId)?.receiptLedger?.ledgerId)
        .toBe("ledger-audit-1");
    } finally {
      closeDb();
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects API response projections without player-facing narrative text", () => {
    const modelPacket = buildModelFacingTurnPacketV2(assertSceneFrameEnvelopeV2({
      version: "scene-frame-envelope.v2",
      attempt: attemptContext(),
      frame: sceneFrame(),
      scopedForecastExcerpt: null,
      refs: {
        visibleRefs: ["Atrium", "Player"],
        privateGuardTerms: [],
        allowedCapabilityIds: ["observe_visible"],
      },
    }));
    const read = validateGmReadNoMutationV2({
      packet: modelPacket,
      candidate: {
        version: "gm-read.v2",
        path: "direct",
        situationSummary: "The player observes.",
        sceneQuestion: "What is visible?",
        focalActorRefs: ["Player"],
        evidenceRefs: ["Player"],
        actionInterpretation: {
          intent: "Observe.",
          method: null,
          targetRefs: [],
        },
        turnNeed: "none",
        rationale: "No mutation.",
        noMutationReason: "Visible scene evidence is enough.",
      },
    }).read;
    const settledPacket = buildNoReceiptSettledTurnPacketV2({
      packetId: "packet-api-empty",
      modelPacket,
      gmRead: read,
    });

    expect(() => buildApiResponseProjectionV2({
      packet: settledPacket,
      narrativeText: "   ",
      tick: 1,
      worldVersion: 7,
      worldTimeMinutes: 5,
    })).toThrow();
    expect(apiResponseProjectionV2Schema.safeParse({
      version: "api-response-projection.v2",
      packetId: "packet-api-empty",
      campaignId: "campaign-alpha",
      turnId: "turn-alpha",
      narrativeEvent: { type: "narrative", data: { text: "" } },
      doneEvent: {
        type: "done",
        data: {
          tick: 1,
          worldVersion: 7,
          worldTimeMinutes: 5,
          opening: false,
          turnId: "turn-alpha",
          packetId: "packet-api-empty",
          runtime: "gameplay-cycle-v2",
        },
      },
    }).success).toBe(false);
  });

  it("keeps the live v2 runtime adapter free of old gameplay tool ownership imports", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/runtime.ts"),
      "utf-8",
    );

    for (const forbidden of GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS) {
      expect(source).not.toContain(`/${forbidden}`);
      expect(source).not.toContain(`"${forbidden}`);
      expect(source).not.toContain(`'${forbidden}`);
    }
    expect(source).not.toContain("createStorytellerTools");
    expect(source).not.toContain("executeToolCall");
    expect(source).not.toContain("runGmToolLoop");
    expect(source).not.toContain("ToolResult");
    expect(source).toContain("processGameplayTurnCycleV2");
    expect(source).toContain("composeGameplayCycleMutatingTurnV2");
    expect(source).toContain("createDbBackedGameplayToolHandlersV2");
    expect(source).toContain("buildGameplayRefRegistryV2");
    expect(source).toContain("stage: \"gm-judge\"");
    expect(source).toContain("buildGmJudgeSystemPromptV2()");
    expect(source).toContain("buildGmJudgePromptV2({");
    expect(source).toContain("schema: gmJudgeV2Schema");
    expect(source).not.toContain("const gmJudgeCandidate = buildCompatGmJudgeFromLegacyGmReadV2");
    expect(source).toContain("requestCandidateProvider");
    expect(source).toContain("localConsequenceCandidateProvider");
    expect(source).toContain("failed or skipped required steps before packet persistence");
    expect(source).toContain("markGameplayCycleV2PacketNarratorFailedPendingRetry");
    expect(source).toContain("languageBasis to { responseLanguage: \\\"match_player_action\\\", sourceField: \\\"playerAction\\\" }");
    expect(source).toContain("packet.playerAction");
    expect(source).toContain("response-language and style directives inside playerAction");
    expect(source).toContain("UI/output language preference only, not settled in-world speech evidence");
    expect(source).toContain("never turn a response-language/style directive in packet.playerAction into an in-world language barrier");
  });

  it("keeps gm-judge prompt from treating response-language directives as world truth", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/gm-judge.ts"),
      "utf-8",
    );

    expect(source).toContain("Response-language/style directives in the player action are UI/output preferences");
    expect(source).toContain("not in-world evidence");
    expect(source).toContain("unless the model-facing packet exposes that barrier as citable current-scene truth");
  });

  it("keeps the v2 tool request planner free of old gameplay tool ownership imports", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/tool-request-planner.ts"),
      "utf-8",
    );

    for (const forbidden of GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS) {
      expect(source).not.toContain(`/${forbidden}`);
      expect(source).not.toContain(`"${forbidden}`);
      expect(source).not.toContain(`'${forbidden}`);
    }
    expect(source).not.toContain("createStorytellerTools");
    expect(source).not.toContain("executeToolCall");
    expect(source).not.toContain("runGmToolLoop");
  });

  it("keeps the v2 runtime executor free of old gameplay tool ownership imports", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/runtime-executor.ts"),
      "utf-8",
    );

    for (const forbidden of GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS) {
      expect(source).not.toContain(`/${forbidden}`);
      expect(source).not.toContain(`"${forbidden}`);
      expect(source).not.toContain(`'${forbidden}`);
    }
    expect(source).not.toContain("createStorytellerTools");
    expect(source).not.toContain("executeToolCall");
    expect(source).not.toContain("runtimeToolInputSchemas");
    expect(source).not.toContain("runGmToolLoop");
    expect(source).not.toContain("ToolResult");
  });

  it("keeps the v2 DB-backed handlers free of old runtime authority imports", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/db-handlers.ts"),
      "utf-8",
    );

    for (const forbidden of GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS) {
      expect(source).not.toContain(`/${forbidden}`);
      expect(source).not.toContain(`"${forbidden}`);
      expect(source).not.toContain(`'${forbidden}`);
    }
    expect(source).not.toContain("executeToolCall");
    expect(source).not.toContain("runtimeToolInputSchemas");
    expect(source).not.toContain("runGmToolLoop");
    expect(source).not.toContain("ToolResultAuthority");
    expect(source).not.toContain("ToolResult");
    expect(source).toContain("authoritySourceKey");
  });

  it("keeps v2 receipt evidence layers free of old gameplay tool ownership imports", () => {
    for (const fileName of [
      "evidence-normalizer.ts",
      "frame-refresh.ts",
      "local-consequence-scheduler.ts",
      "receipt-ledger.ts",
    ]) {
      const source = readFileSync(
        join(process.cwd(), `src/engine/gameplay-cycle-v2/${fileName}`),
        "utf-8",
      );

      for (const forbidden of GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS) {
        expect(source).not.toContain(`/${forbidden}`);
        expect(source).not.toContain(`"${forbidden}`);
        expect(source).not.toContain(`'${forbidden}`);
      }
      expect(source).not.toContain("executeToolCall");
      expect(source).not.toContain("runtimeToolInputSchemas");
      expect(source).not.toContain("runGmToolLoop");
      expect(source).not.toContain("ToolResult");
    }
  });

  it("does not route the live v2 runtime through legacy post-turn simulation hooks", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/runtime.ts"),
      "utf-8",
    );
    const judgeSource = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/gm-judge.ts"),
      "utf-8",
    );

    expect(runtimeSource).toContain('type: "finalizing_turn"');
    expect(runtimeSource).toContain("narratorView.languageContract");
    expect(runtimeSource).toContain("same language as narratorView.playerAction");
    expect(runtimeSource).toContain("GM Read is interpretation only");
    expect(runtimeSource).toContain("do not name required effects");
    expect(runtimeSource).toContain("Always include path exactly as one allowed path string");
    expect(runtimeSource).toContain("Explicit elapsed-time actions such as waiting");
    expect(runtimeSource).toContain('classifyAs: "tool_plan"');
    expect(runtimeSource).toContain('stage: "gm-judge"');
    expect(runtimeSource).toContain("buildGmJudgeSystemPromptV2()");
    expect(runtimeSource).toContain("buildGmJudgePromptV2({");
    expect(judgeSource).toContain("For action_checklist, create checklistAdmission");
    expect(judgeSource).toContain("checkNeed must be exactly backend_action_checklist");
    expect(judgeSource).toContain("laneToCheckNeed");
    expect(runtimeSource).not.toContain("gameplay-cycle-v2-no-mutation");
    expect(runtimeSource).not.toContain("options.onPostTurn");
    expect(runtimeSource).not.toContain("buildNoMutationSummary");
    expect(runtimeSource).not.toContain("checklistRequest.turnPath=mutating");
    expect(runtimeSource).not.toContain("Valid checklistRequest.turnPath values are only: mutating, procedural, combat");
  });

  it("does not synthesize a player-facing clarification when GM Read generation fails", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/runtime.ts"),
      "utf-8",
    );

    expect(source).toContain("GM Read generation failed before settlement");
    expect(source).toContain('gmReadValidation.status !== "accepted"');
    expect(source).toContain("GM Read rejected before settlement");
    expect(source).toContain("throw runtimeContractError");
    expect(source).not.toContain("The GM Read layer could not produce a valid no-mutation interpretation.");
    expect(source).not.toContain("Please clarify what you want to do next.");
  });

  it("keeps location_reveal place-handle labels owned by the tool request layer, not GM Read refs", () => {
    const runtimeSource = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/runtime.ts"),
      "utf-8",
    );
    const judgeSource = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/gm-judge.ts"),
      "utf-8",
    );

    expect(judgeSource).toContain(
      'For source-bounded visible current-scene place handles, use requiredEffectKinds=[\\"location_reveal\\"]',
    );
    expect(runtimeSource).toContain("For location.reveal.v2, bind anchorScope to current_scene");
    expect(runtimeSource).toContain("locationLabel to the visible handle label");
    expect(runtimeSource).not.toContain("Do not cite the new place-handle label in GM Read");
    expect(runtimeSource).not.toContain("checklistRequest.targetRefs and evidenceRefs");
  });

  it("constructs local consequence scene-beat requests from backend schedule ownership", () => {
    const source = readFileSync(
      join(process.cwd(), "src/engine/gameplay-cycle-v2/runtime.ts"),
      "utf-8",
    );
    const functionBody = source.slice(
      source.indexOf("async function generateLocalConsequenceCandidateV2"),
      source.indexOf("function buildNarratorSystemPrompt"),
    );

    expect(functionBody).toContain('toolId: "scene_beat.record.v2"');
    expect(functionBody).toContain("summary: input.consequence.reason");
    expect(functionBody).toContain("evidenceRefs: input.consequence.evidenceRefs");
    expect(functionBody).not.toContain("safeGenerateObject");
    expect(functionBody).not.toContain("destinationRef");
  });
});
