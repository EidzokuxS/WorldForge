import {
  type GameplayRuntimeReceiptV2,
  type ModelFacingTurnPacketV2,
  type SettledEvidenceV2,
} from "./contracts.js";

export interface RuntimeReceiptEvidenceNormalizationIssueV2 {
  code: "not_accepted" | "private_term_leak" | "uncited_ref";
  message: string;
}

export interface RuntimeReceiptEvidenceAcceptedV2 {
  status: "accepted";
  evidence: SettledEvidenceV2;
  issues: [];
}

export interface RuntimeReceiptEvidenceRejectedV2 {
  status: "rejected";
  evidence: null;
  issues: RuntimeReceiptEvidenceNormalizationIssueV2[];
}

export type RuntimeReceiptEvidenceNormalizationResultV2 =
  | RuntimeReceiptEvidenceAcceptedV2
  | RuntimeReceiptEvidenceRejectedV2;

function lowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function receiptEvidenceText(receipt: GameplayRuntimeReceiptV2): string {
  switch (receipt.toolId) {
    case "route.check.v2":
      return `Route check receipt accepted: ${receipt.visibleSummary} This proves route availability only, not movement or arrival.`;
    case "actor.move.v2":
      return `Movement receipt accepted: ${receipt.visibleSummary}`;
    case "dialogue.record.v2":
      return `Dialogue receipt accepted: ${receipt.visibleSummary}`;
    case "world_fact.record.v2":
      return `Player-known knowledge receipt accepted: ${receipt.visibleSummary} This records source-bounded player knowledge only, not objective canon, absence, discovery, movement, item state, or NPC private knowledge.`;
    case "support_actor.create.v2":
      return `Support actor receipt accepted: ${receipt.visibleSummary}`;
    case "entity.tag.v2":
      return `Entity tag receipt accepted: ${receipt.visibleSummary}`;
    case "item.transfer.v2":
      return `Item transfer receipt accepted: ${receipt.visibleSummary}`;
    case "actor.condition_set.v2":
      return `Actor condition receipt accepted: ${receipt.visibleSummary} This proves only the listed actor condition or Player HP change. It does not prove combat resolution, NPC private condition, offscreen harm, relationship/faction/reputation change, item/location/world-fact state, or additional injuries.`;
    case "time.advance.v2":
      return `Time advance receipt accepted: ${receipt.visibleSummary} This proves only elapsed in-world time and the updated world clock. It does not prove movement, route availability, rest benefits, healing, fatigue, condition changes, hidden/offscreen events, discovery, search results, absence, no-change claims, NPC knowledge, item state, location state, or world facts. Do not narrate that nothing changed, everything stayed the same, no visible changes occurred, or nothing happened unless separate accepted evidence proves that exact fact.`;
    case "scene_beat.record.v2":
      return `Scene beat receipt accepted: ${receipt.visibleSummary}`;
    case "location.reveal.v2":
      return `Location reveal receipt accepted: ${receipt.visibleSummary} This proves only that the place handle is visible and citable in the current scene; it does not prove movement, route availability, search progress, hidden discovery, or absence.`;
    case "minor_poi.create.v2":
      return `Minor POI receipt accepted: ${receipt.visibleSummary}`;
    default:
      return `Runtime receipt accepted: ${receipt.visibleSummary}`;
  }
}

export function normalizeRuntimeReceiptEvidenceV2(input: {
  modelPacket: ModelFacingTurnPacketV2;
  receipt: GameplayRuntimeReceiptV2;
}): RuntimeReceiptEvidenceNormalizationResultV2 {
  const issues: RuntimeReceiptEvidenceNormalizationIssueV2[] = [];

  if (input.receipt.status !== "accepted") {
    issues.push({
      code: "not_accepted",
      message: "Only accepted runtime receipts can become settled evidence.",
    });
  }

  const citableRefs = lowerSet(input.modelPacket.citableRefs);
  for (const ref of input.receipt.evidenceRefs) {
    if (!citableRefs.has(ref.toLowerCase())) {
      issues.push({
        code: "uncited_ref",
        message: `Runtime receipt evidence ref "${ref}" is not citable in the model-facing packet.`,
      });
    }
  }

  const evidenceText = receiptEvidenceText(input.receipt);
  const publicText = JSON.stringify({
    text: evidenceText,
    sourceRefs: input.receipt.evidenceRefs,
  }).toLowerCase();
  for (const term of input.modelPacket.runtimePrivateGuardTerms) {
    if (term.trim() && publicText.includes(term.trim().toLowerCase())) {
      issues.push({
        code: "private_term_leak",
        message: "A private guard term leaked into runtime receipt evidence.",
      });
    }
  }

  if (issues.length > 0) {
    return {
      status: "rejected",
      evidence: null,
      issues,
    };
  }

  return {
    status: "accepted",
    evidence: {
      evidenceId: `runtime-receipt-${input.receipt.receiptId}`,
      kind: "runtime_receipt",
      authority: "runtime_receipt",
      text: evidenceText,
      sourceRefs: input.receipt.evidenceRefs,
      sourceReceiptId: input.receipt.receiptId,
      sourceToolId: input.receipt.toolId ?? undefined,
    },
    issues: [],
  };
}
