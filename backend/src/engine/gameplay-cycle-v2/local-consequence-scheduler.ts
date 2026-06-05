import {
  assertLocalConsequenceScheduleV2,
  type GameplayRuntimeReceiptLedgerV2,
  type GameplayRuntimeReceiptV2,
  type LocalConsequenceScheduleEntryV2,
  type LocalConsequenceScheduleV2,
  type ModelFacingTurnPacketV2,
  type SettledStepAuditV2,
} from "./contracts.js";

function acceptedLocalMutationReceipts(
  ledger: GameplayRuntimeReceiptLedgerV2,
): GameplayRuntimeReceiptV2[] {
  return ledger.receipts.filter((receipt) =>
    receipt.status === "accepted"
    && receipt.mutationApplied
    && receipt.mutationAuthority !== "knowledge"
    && receipt.mutationAuthority !== "world"
    && receipt.mutationAuthority !== "ui");
}

function visibleNonPlayerActors(packet: ModelFacingTurnPacketV2) {
  return packet.scene.actors.filter((actor) =>
    actor.role !== "player" && actor.role !== "background");
}

function triggerSummary(receipts: readonly GameplayRuntimeReceiptV2[]): string {
  return receipts
    .map((receipt) => `${receipt.toolId ?? "runtime"}:${receipt.visibleSummary}`)
    .join("; ")
    .slice(0, 420);
}

function entryForActor(input: {
  actorRef: string;
  actorLabel: string;
  receipt: GameplayRuntimeReceiptV2;
  currentSceneRef: string;
  index: number;
}): LocalConsequenceScheduleEntryV2 {
  return {
    consequenceId: `local-consequence-${input.index + 1}`,
    route: "required_before_packet",
    actorRef: input.actorRef,
    triggerReceiptId: input.receipt.receiptId,
    reason: `Visible actor ${input.actorLabel} is present in ${input.currentSceneRef} after accepted receipt ${input.receipt.receiptId}; this records visibility only.`,
    requiredCapabilityId: "scene_beat_record",
    intendedEffectKind: "scene_beat",
    evidenceRefs: [input.actorRef, input.currentSceneRef, ...input.receipt.evidenceRefs]
      .filter((ref, index, refs) => refs.indexOf(ref) === index)
      .slice(0, 12),
  };
}

function skippedAudit(reason: string, evidenceIds: string[] = []): SettledStepAuditV2 {
  return {
    stage: "local_consequence_scheduler",
    reason,
    evidenceIds,
  };
}

export function scheduleLocalConsequencesV2(input: {
  scheduleId: string;
  modelPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  maxRequiredEntries?: number;
}): LocalConsequenceScheduleV2 {
  if (input.ledger.campaignId !== input.modelPacket.campaignId || input.ledger.turnId !== input.modelPacket.turnId) {
    throw new Error("Local consequence scheduler requires ledger and model packet from the same turn.");
  }
  if (input.ledger.baseWorldVersion > input.modelPacket.baseWorldVersion) {
    throw new Error("Local consequence scheduler model packet is stale relative to the runtime ledger.");
  }

  const triggerReceipts = acceptedLocalMutationReceipts(input.ledger);
  if (triggerReceipts.length === 0) {
    return assertLocalConsequenceScheduleV2({
      version: "local-consequence-schedule.v2",
      scheduleId: input.scheduleId,
      campaignId: input.modelPacket.campaignId,
      turnId: input.modelPacket.turnId,
      baseWorldVersion: input.ledger.baseWorldVersion,
      frameWorldVersion: input.modelPacket.baseWorldVersion,
      route: "none",
      triggerReceiptIds: [],
      entries: [],
      skipped: [skippedAudit("No accepted local mutation receipts require immediate local consequences.")],
    });
  }

  const actors = visibleNonPlayerActors(input.modelPacket);
  const triggerReceiptIds = triggerReceipts.map((receipt) => receipt.receiptId);
  if (actors.length === 0) {
    return assertLocalConsequenceScheduleV2({
      version: "local-consequence-schedule.v2",
      scheduleId: input.scheduleId,
      campaignId: input.modelPacket.campaignId,
      turnId: input.modelPacket.turnId,
      baseWorldVersion: input.ledger.baseWorldVersion,
      frameWorldVersion: input.modelPacket.baseWorldVersion,
      route: "deferred_audit",
      triggerReceiptIds,
      entries: [],
      skipped: [skippedAudit(
        `Accepted local mutation receipts have no visible non-player actors in the refreshed frame: ${triggerSummary(triggerReceipts)}`,
        triggerReceiptIds,
      )],
    });
  }

  const currentSceneRef = input.modelPacket.scene.currentScene.ref
    ?? input.modelPacket.scene.currentLocation.ref
    ?? "current_scene";
  const maxEntries = Math.max(1, Math.min(input.maxRequiredEntries ?? 3, 6));
  const entries = actors.slice(0, maxEntries).map((actor, index) =>
    entryForActor({
      actorRef: actor.ref,
      actorLabel: actor.label,
      receipt: triggerReceipts[0],
      currentSceneRef,
      index,
    }));
  const skipped = actors.length > entries.length
    ? [skippedAudit(
      `${actors.length - entries.length} additional visible actor(s) deferred after the required local consequence budget.`,
      triggerReceiptIds,
    )]
    : [];

  return assertLocalConsequenceScheduleV2({
    version: "local-consequence-schedule.v2",
    scheduleId: input.scheduleId,
    campaignId: input.modelPacket.campaignId,
    turnId: input.modelPacket.turnId,
    baseWorldVersion: input.ledger.baseWorldVersion,
    frameWorldVersion: input.modelPacket.baseWorldVersion,
    route: "required_before_packet",
    triggerReceiptIds,
    entries,
    skipped,
  });
}
