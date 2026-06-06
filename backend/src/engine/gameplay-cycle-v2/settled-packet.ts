import {
  assertNoPrivateTermsInPublicPayloadV2,
  assertNarratorViewV2,
  assertPublicGmReadProjectionV2,
  assertSettledPacketPersistenceV2,
  assertSettledTurnPacketV2,
  type GmReadV2,
  type GmReadNoMutationV2,
  type GmJudgeV2,
  type GameplayToolIdV2,
  type ModelFacingTurnPacketV2,
  type NarratorViewV2,
  type OracleSettlementV2,
  type PublicGmReadProjectionV2,
  type SettledEvidenceV2,
  type SettledPacketPersistenceV2,
  type SettledTurnPacketV2,
} from "./contracts.js";
import { buildPublicGmJudgeProjectionV2 } from "./gm-judge.js";
import { oracleSettlementEvidenceV2 } from "./oracle-settlement.js";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function evidenceId(prefix: string, index: number): string {
  return `${prefix}-${index + 1}`;
}

const BASE_NARRATOR_FORBIDDEN_CLAIMS = [
  "absence_or_no_change",
  "movement_or_arrival_without_receipt",
  "route_availability_without_receipt",
  "discovery_or_search_result_without_receipt",
  "item_state_without_receipt",
  "npc_knowledge_or_response_without_receipt",
  "condition_or_rest_benefit_without_receipt",
  "hidden_or_offscreen_event_without_receipt",
  "location_or_world_fact_change_without_receipt",
] as const;

function runtimeReceiptLimitForNarrator(
  evidence: SettledEvidenceV2,
): NarratorViewV2["evidenceContract"]["receiptLimits"][number] | null {
  if (
    evidence.authority !== "runtime_receipt"
    || !evidence.sourceReceiptId
    || !evidence.sourceToolId
  ) {
    return null;
  }

  const toolId = evidence.sourceToolId as GameplayToolIdV2;
  switch (toolId) {
    case "time.advance.v2":
      return {
        sourceReceiptId: evidence.sourceReceiptId,
        toolId,
        proves: [
          "elapsed in-world time",
          "updated world clock",
        ],
        doesNotProve: [
          "nothing changed",
          "everything stayed the same",
          "no visible changes occurred",
          "nothing happened",
          "movement or arrival",
          "route availability",
          "rest benefits, healing, fatigue, or condition changes",
          "hidden or offscreen events",
          "discovery or search results",
          "absence",
          "NPC knowledge",
          "item state",
          "location state",
          "world facts",
        ],
      };
    case "route.check.v2":
      return {
        sourceReceiptId: evidence.sourceReceiptId,
        toolId,
        proves: ["route availability only"],
        doesNotProve: ["movement", "arrival", "current-scene change"],
      };
    default:
      return null;
  }
}

function buildNarratorEvidenceContractV2(
  packet: SettledTurnPacketV2,
): NarratorViewV2["evidenceContract"] {
  return {
    authoritativeSource: "acceptedEvidence",
    forbiddenClaimKinds: [...BASE_NARRATOR_FORBIDDEN_CLAIMS],
    receiptLimits: packet.acceptedEvidence
      .map(runtimeReceiptLimitForNarrator)
      .filter((limit): limit is NarratorViewV2["evidenceContract"]["receiptLimits"][number] => Boolean(limit)),
  };
}

export function currentSceneEvidence(packet: ModelFacingTurnPacketV2): SettledEvidenceV2[] {
  const evidence: SettledEvidenceV2[] = [];
  const sceneLabel = packet.scene.currentScene.label ?? packet.scene.currentLocation.label ?? null;
  if (sceneLabel) {
    evidence.push({
      evidenceId: evidenceId("scene-status", evidence.length),
      kind: "scene_status",
      authority: "scene_frame",
      text: `Current scene: ${sceneLabel}.`,
      sourceRefs: uniqueStrings([packet.scene.currentScene.ref ?? undefined, packet.scene.currentLocation.ref ?? undefined]),
    });
  }
  for (const actor of packet.scene.actors.filter((actor) => actor.role !== "player").slice(0, 8)) {
    evidence.push({
      evidenceId: evidenceId("visible-actor", evidence.length),
      kind: "visible_actor",
      authority: "scene_frame",
      text: `Visible actor: ${actor.label}.`,
      sourceRefs: [actor.ref],
    });
  }
  for (const option of packet.scene.movementOptions.slice(0, 8)) {
    evidence.push({
      evidenceId: evidenceId("movement-option", evidence.length),
      kind: "movement_option",
      authority: "scene_frame",
      text: `Movement option: ${option.label}${option.connected ? " is connected" : " is not connected"}.`,
      sourceRefs: [option.ref],
    });
  }
  for (const target of packet.scene.targets.slice(0, 8)) {
    evidence.push({
      evidenceId: evidenceId("visible-target", evidence.length),
      kind: target.kind === "item" ? "visible_object" : "scene_status",
      authority: "scene_frame",
      text: `Visible ${target.kind}: ${target.label}.`,
      sourceRefs: [target.ref],
    });
  }
  for (const item of packet.scene.inventory.slice(0, 8)) {
    evidence.push({
      evidenceId: evidenceId("inventory-item", evidence.length),
      kind: "inventory_item",
      authority: "scene_frame",
      text: `Inventory item: ${item.label} (${item.equipState}).`,
      sourceRefs: [item.ref],
    });
  }
  for (const event of packet.scene.recentEvents.slice(0, 6)) {
    evidence.push({
      evidenceId: evidenceId("recent-event", evidence.length),
      kind: "recent_visible_event",
      authority: "scene_frame",
      text: event.summary,
      sourceRefs: [],
    });
  }
  return evidence;
}

function gmReadEvidence(read: GmReadV2): SettledEvidenceV2 | null {
  if (read.path === "clarification") {
    return {
      evidenceId: "gm-read-clarification-1",
      kind: "clarification_request",
      authority: "gm_read_clarification",
      text: read.clarificationPrompt ?? "The player action needs clarification.",
      sourceRefs: read.evidenceRefs,
    };
  }
  if (read.path === "roll_oracle") {
    return null;
  }
  if (read.path === "tool_plan") {
    return null;
  }
  return {
    evidenceId: "gm-read-resolution-1",
    kind: "direct_resolution",
    authority: read.path === "continue" ? "gm_read_continue" : "gm_read_direct",
    text: read.noMutationReason,
    sourceRefs: read.evidenceRefs,
  };
}

export function buildPublicGmReadProjectionV2(input: {
  gmRead: GmReadV2;
  settlementBasis: PublicGmReadProjectionV2["settlementBasis"];
}): PublicGmReadProjectionV2 {
  return assertPublicGmReadProjectionV2({
    version: "public-gm-read-projection.v2",
    path: input.gmRead.path,
    turnNeed: input.gmRead.turnNeed,
    focalActorRefs: input.gmRead.focalActorRefs,
    evidenceRefs: input.gmRead.evidenceRefs,
    targetRefs: input.gmRead.actionInterpretation.targetRefs,
    requiredEffectKinds: [],
    settlementBasis: input.settlementBasis,
  });
}

function assertPublicSettledPacketCandidate(input: {
  packet: SettledTurnPacketV2;
  privateGuardTerms: readonly string[];
}): SettledTurnPacketV2 {
  assertNoPrivateTermsInPublicPayloadV2({
    payloadName: "settled-turn-packet.v2",
    payload: input.packet,
    privateGuardTerms: input.privateGuardTerms,
  });
  return input.packet;
}

export function buildNoReceiptSettledTurnPacketV2(input: {
  packetId: string;
  modelPacket: ModelFacingTurnPacketV2;
  gmRead: GmReadNoMutationV2;
  gmJudge: GmJudgeV2;
}): SettledTurnPacketV2 {
  const packet = assertSettledTurnPacketV2({
    version: "settled-turn-packet.v2",
    packetId: input.packetId,
    campaignId: input.modelPacket.campaignId,
    turnId: input.modelPacket.turnId,
    playerAction: input.modelPacket.playerAction,
    baseTick: input.modelPacket.baseTick,
    baseWorldVersion: input.modelPacket.baseWorldVersion,
    resultWorldVersion: input.modelPacket.baseWorldVersion,
    gmReadPublic: buildPublicGmReadProjectionV2({
      gmRead: input.gmRead,
      settlementBasis: input.gmRead.path === "clarification"
        ? "gm_read_clarification"
        : input.gmRead.path === "continue"
          ? "gm_read_continue"
          : "gm_read_direct",
    }),
    gmJudgePublic: buildPublicGmJudgeProjectionV2({
      gmJudge: input.gmJudge,
      settlementBasis: input.gmJudge.lane === "clarification"
        ? "gm_judge_clarification"
        : input.gmJudge.lane === "continue"
          ? "gm_judge_continue"
          : "gm_judge_direct",
    }),
    oracleVisibleOutcome: null,
    acceptedEvidence: [
      ...currentSceneEvidence(input.modelPacket),
      gmReadEvidence(input.gmRead),
    ].filter((evidence): evidence is SettledEvidenceV2 => Boolean(evidence)),
    acceptedRuntimeReceiptIds: [],
    acceptedDurableEventIds: [],
    stepAudit: {
      skippedCount: 0,
      failedCount: 0,
    },
    auditRef: `audit-${input.packetId}`,
  });
  return assertPublicSettledPacketCandidate({
    packet,
    privateGuardTerms: input.modelPacket.runtimePrivateGuardTerms,
  });
}

export function buildOracleSettledTurnPacketV2(input: {
  packetId: string;
  modelPacket: ModelFacingTurnPacketV2;
  gmRead: Extract<GmReadV2, { path: "roll_oracle" }>;
  gmJudge: GmJudgeV2;
  oracleSettlement: OracleSettlementV2;
}): SettledTurnPacketV2 {
  const packet = assertSettledTurnPacketV2({
    version: "settled-turn-packet.v2",
    packetId: input.packetId,
    campaignId: input.modelPacket.campaignId,
    turnId: input.modelPacket.turnId,
    playerAction: input.modelPacket.playerAction,
    baseTick: input.modelPacket.baseTick,
    baseWorldVersion: input.modelPacket.baseWorldVersion,
    resultWorldVersion: input.modelPacket.baseWorldVersion,
    gmReadPublic: buildPublicGmReadProjectionV2({
      gmRead: input.gmRead,
      settlementBasis: "oracle_settlement",
    }),
    gmJudgePublic: buildPublicGmJudgeProjectionV2({
      gmJudge: input.gmJudge,
      settlementBasis: "oracle_settlement",
    }),
    oracleVisibleOutcome: input.oracleSettlement.visibleOutcome,
    acceptedEvidence: [
      ...currentSceneEvidence(input.modelPacket),
      oracleSettlementEvidenceV2(input.oracleSettlement),
    ],
    acceptedRuntimeReceiptIds: [],
    acceptedDurableEventIds: [],
    stepAudit: {
      skippedCount: 0,
      failedCount: 0,
    },
    auditRef: `audit-${input.packetId}`,
  });
  return assertPublicSettledPacketCandidate({
    packet,
    privateGuardTerms: input.modelPacket.runtimePrivateGuardTerms,
  });
}

export function buildSettledPacketPersistencePendingV2(
  packet: SettledTurnPacketV2,
): SettledPacketPersistenceV2 {
  return assertSettledPacketPersistenceV2({
    version: "settled-packet-persistence.v2",
    packetId: packet.packetId,
    campaignId: packet.campaignId,
    turnId: packet.turnId,
    status: "resolved_pending_narration",
    narratorAttemptStatus: "not_started",
  });
}

export function buildNarratorViewV2(packet: SettledTurnPacketV2): NarratorViewV2 {
  return assertNarratorViewV2({
    version: "narrator-view.v2",
    packetId: packet.packetId,
    campaignId: packet.campaignId,
    turnId: packet.turnId,
    playerAction: packet.playerAction,
    gmReadPath: packet.gmReadPublic.path,
    acceptedEvidence: packet.acceptedEvidence,
    languageContract: {
      responseLanguage: "match_player_action",
      sourceField: "playerAction",
      preserveLabelsVerbatim: true,
    },
    narrationLimits: {
      mayInferNewFacts: false,
      mayCallTools: false,
      mayUseFailedOrSkippedAsTruth: false,
    },
    evidenceContract: buildNarratorEvidenceContractV2(packet),
  });
}
