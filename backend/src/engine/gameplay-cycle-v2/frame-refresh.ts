import {
  assertSceneFrameEnvelopeV2,
  type GameplayRuntimeReceiptLedgerV2,
  type GameplayRuntimeReceiptV2,
  type ModelFacingTurnPacketV2,
  type SceneFrameEnvelopeV2,
} from "./contracts.js";
import { buildModelFacingTurnPacketV2 } from "./projection.js";

export interface FrameRefreshNotRequiredV2 {
  status: "not_required";
  reason: string;
  triggerReceiptIds: [];
  refreshedPacket: null;
}

export interface FrameRefreshAcceptedV2 {
  status: "refreshed";
  reason: string;
  triggerReceiptIds: string[];
  refreshedPacket: ModelFacingTurnPacketV2;
}

export interface FrameRefreshRejectedV2 {
  status: "rejected";
  reason: string;
  triggerReceiptIds: string[];
  refreshedPacket: null;
}

export type FrameRefreshResultV2 =
  | FrameRefreshNotRequiredV2
  | FrameRefreshAcceptedV2
  | FrameRefreshRejectedV2;

function acceptedMutationReceipts(
  ledger: GameplayRuntimeReceiptLedgerV2,
): GameplayRuntimeReceiptV2[] {
  return ledger.receipts.filter((receipt) =>
    receipt.status === "accepted" && receipt.mutationApplied);
}

function expectedResultWorldVersion(
  receipts: readonly GameplayRuntimeReceiptV2[],
  baseWorldVersion: number,
): number {
  return receipts.reduce(
    (result, receipt) => Math.max(result, receipt.resultWorldVersion),
    baseWorldVersion,
  );
}

function sameTurn(input: {
  previousPacket: ModelFacingTurnPacketV2;
  refreshedEnvelope: SceneFrameEnvelopeV2;
}): string | null {
  const attempt = input.refreshedEnvelope.attempt;
  if (attempt.campaignId !== input.previousPacket.campaignId) {
    return "Refreshed frame campaignId must match the previous model-facing packet.";
  }
  if (attempt.turnId !== input.previousPacket.turnId) {
    return "Refreshed frame turnId must match the previous model-facing packet.";
  }
  if (attempt.playerAction !== input.previousPacket.playerAction) {
    return "Refreshed frame playerAction must match the original turn action.";
  }
  return null;
}

export function refreshFrameAfterAcceptedMutationV2(input: {
  previousPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  refreshedEnvelope?: unknown;
}): FrameRefreshResultV2 {
  const mutationReceipts = acceptedMutationReceipts(input.ledger);
  const triggerReceiptIds = mutationReceipts.map((receipt) => receipt.receiptId);
  if (mutationReceipts.length === 0) {
    return {
      status: "not_required",
      reason: "No accepted mutation receipts require a SceneFrame refresh.",
      triggerReceiptIds: [],
      refreshedPacket: null,
    };
  }

  if (!input.refreshedEnvelope) {
    return {
      status: "rejected",
      reason: "Accepted mutation receipts require a refreshed SceneFrame envelope before dependent planning or narration.",
      triggerReceiptIds,
      refreshedPacket: null,
    };
  }

  let envelope: SceneFrameEnvelopeV2;
  try {
    envelope = assertSceneFrameEnvelopeV2(input.refreshedEnvelope);
  } catch (error) {
    return {
      status: "rejected",
      reason: error instanceof Error ? error.message : "Refreshed SceneFrame envelope failed validation.",
      triggerReceiptIds,
      refreshedPacket: null,
    };
  }

  const turnMismatch = sameTurn({
    previousPacket: input.previousPacket,
    refreshedEnvelope: envelope,
  });
  if (turnMismatch) {
    return {
      status: "rejected",
      reason: turnMismatch,
      triggerReceiptIds,
      refreshedPacket: null,
    };
  }

  const expectedWorldVersion = expectedResultWorldVersion(
    mutationReceipts,
    input.previousPacket.baseWorldVersion,
  );
  if (envelope.attempt.baseWorldVersion !== expectedWorldVersion) {
    return {
      status: "rejected",
      reason: `Refreshed frame baseWorldVersion ${envelope.attempt.baseWorldVersion} must equal accepted mutation resultWorldVersion ${expectedWorldVersion}.`,
      triggerReceiptIds,
      refreshedPacket: null,
    };
  }

  const refreshedPacket = buildModelFacingTurnPacketV2(envelope);
  if (refreshedPacket.baseWorldVersion !== expectedWorldVersion) {
    return {
      status: "rejected",
      reason: "Refreshed model-facing packet did not inherit the accepted mutation resultWorldVersion.",
      triggerReceiptIds,
      refreshedPacket: null,
    };
  }

  return {
    status: "refreshed",
    reason: "SceneFrame refreshed from accepted mutation receipts.",
    triggerReceiptIds,
    refreshedPacket,
  };
}
