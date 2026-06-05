import type { OraclePayload, OracleResult } from "../oracle.js";
import {
  assertOracleSettlementV2,
  type GmJudgeOracleV2,
  type GmReadOracleV2,
  type ModelFacingTurnPacketV2,
  type OracleSettlementV2,
  type SettledEvidenceV2,
} from "./contracts.js";

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function labelsForRefs(packet: ModelFacingTurnPacketV2, refs: readonly string[]): string[] {
  const labels = new Map<string, string>();
  for (const actor of packet.scene.actors) labels.set(actor.ref.toLowerCase(), actor.label);
  for (const target of packet.scene.targets) labels.set(target.ref.toLowerCase(), target.label);
  for (const item of packet.scene.inventory) labels.set(item.ref.toLowerCase(), item.label);
  for (const route of packet.scene.movementOptions) labels.set(route.ref.toLowerCase(), route.label);
  const sceneRef = packet.scene.currentScene.ref ?? packet.scene.currentLocation.ref;
  const sceneLabel = packet.scene.currentScene.label ?? packet.scene.currentLocation.label;
  if (sceneRef && sceneLabel) labels.set(sceneRef.toLowerCase(), sceneLabel);
  return uniqueStrings(refs.map((ref) => labels.get(ref.toLowerCase()) ?? ref));
}

function sceneTags(packet: ModelFacingTurnPacketV2): string[] {
  return uniqueStrings([
    packet.scene.currentLocation.label,
    packet.scene.currentScene.label,
    ...packet.scene.recentEvents.slice(0, 4).map((event) => event.summary),
  ]).slice(0, 8);
}

function oracleAdmission(input: {
  gmJudge?: GmJudgeOracleV2;
  gmRead?: GmReadOracleV2;
}): GmReadOracleV2["oracleRequest"] {
  if (input.gmJudge) {
    const { postOracleRoute: _postOracleRoute, ...request } = input.gmJudge.oracleAdmission;
    return request;
  }
  if (input.gmRead) return input.gmRead.oracleRequest;
  throw new Error("Oracle v2 settlement requires a GM Judge oracle admission.");
}

export function buildOraclePayloadV2(input: {
  modelPacket: ModelFacingTurnPacketV2;
  gmJudge?: GmJudgeOracleV2;
  gmRead?: GmReadOracleV2;
}): OraclePayload {
  const request = oracleAdmission(input);
  const targetLabels = labelsForRefs(input.modelPacket, request.targetRefs);
  return {
    intent: input.gmRead?.actionInterpretation.intent ?? request.question,
    method: input.gmRead?.actionInterpretation.method ?? request.uncertaintyKind,
    actorTags: labelsForRefs(input.modelPacket, [request.actorRef]),
    targetTags: targetLabels,
    environmentTags: sceneTags(input.modelPacket),
    sceneContext: [
      `Question: ${request.question}`,
      `Stakes: ${request.stakes}`,
      `Strong hit means: ${request.outcomeMeanings.strong_hit}`,
      `Weak hit means: ${request.outcomeMeanings.weak_hit}`,
      `Miss means: ${request.outcomeMeanings.miss}`,
      `Uncertainty kind: ${request.uncertaintyKind}`,
      `Scene: ${input.modelPacket.scene.currentScene.label ?? input.modelPacket.scene.currentLocation.label ?? "unknown"}`,
      `Evidence refs: ${request.evidenceRefs.join(", ")}`,
    ].join("\n"),
  };
}

export function buildOracleSettlementV2(input: {
  settlementId: string;
  modelPacket: ModelFacingTurnPacketV2;
  gmJudge?: GmJudgeOracleV2;
  gmRead?: GmReadOracleV2;
  result: OracleResult;
}): OracleSettlementV2 {
  const request = oracleAdmission(input);
  const selectedMeaning = request.outcomeMeanings[input.result.outcome];
  const narratorSummary = [
    `Oracle outcome: ${input.result.outcome}.`,
    `Selected meaning: ${selectedMeaning}`,
    `Question: ${request.question}`,
    `Stakes: ${request.stakes}`,
  ].join(" ");

  return assertOracleSettlementV2({
    version: "oracle-settlement.v2",
    settlementId: input.settlementId,
    campaignId: input.modelPacket.campaignId,
    turnId: input.modelPacket.turnId,
    request,
    result: input.result,
    evidenceAuthority: "oracle_settlement",
    mutationAuthority: "none",
    narratorSummary,
    visibleOutcome: {
      outcome: input.result.outcome,
      question: request.question,
      stakes: request.stakes,
      selectedMeaning,
    },
  });
}

export function oracleSettlementEvidenceV2(settlement: OracleSettlementV2): SettledEvidenceV2 {
  return {
    evidenceId: `oracle-outcome-${settlement.settlementId}`,
    kind: "oracle_outcome",
    authority: "oracle_settlement",
    text: settlement.narratorSummary,
    sourceRefs: settlement.request.evidenceRefs,
  };
}
