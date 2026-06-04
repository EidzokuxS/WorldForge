import {
  assertGameplayRuntimeReceiptLedgerV2,
  assertSettledTurnPacketV2,
  type GameplayRuntimeReceiptLedgerV2,
  type GameplayRuntimeReceiptV2,
  type GmActionChecklistV2,
  type GmReadChecklistV2,
  type ModelFacingTurnPacketV2,
  type SettledStepAuditV2,
  type SettledTurnPacketV2,
} from "./contracts.js";
import { normalizeRuntimeReceiptEvidenceV2 } from "./evidence-normalizer.js";
import { currentSceneEvidence } from "./settled-packet.js";

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function maxWorldVersion(receipts: readonly GameplayRuntimeReceiptV2[], baseWorldVersion: number): number {
  return receipts
    .filter((receipt) => receipt.status === "accepted")
    .reduce((result, receipt) => Math.max(result, receipt.resultWorldVersion), baseWorldVersion);
}

function stepIds(checklist: GmActionChecklistV2): Set<string> {
  return new Set(checklist.steps.map((step) => step.stepId));
}

function acceptedLocalMutationTrigger(receipt: GameplayRuntimeReceiptV2): boolean {
  return receipt.status === "accepted"
    && receipt.mutationApplied
    && receipt.mutationAuthority !== "none"
    && receipt.mutationAuthority !== "world"
    && receipt.mutationAuthority !== "ui";
}

function receiptAudit(receipt: GameplayRuntimeReceiptV2): SettledStepAuditV2 {
  return {
    stage: `runtime_executor:${receipt.status}`,
    reason: receipt.failureReason ?? receipt.visibleSummary,
    evidenceIds: [],
  };
}

export function buildRuntimeReceiptLedgerV2(input: {
  ledgerId: string;
  modelPacket: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  receipts: GameplayRuntimeReceiptV2[];
}): GameplayRuntimeReceiptLedgerV2 {
  if (
    input.checklist.campaignId !== input.modelPacket.campaignId
    || input.checklist.turnId !== input.modelPacket.turnId
    || input.checklist.baseWorldVersion !== input.modelPacket.baseWorldVersion
  ) {
    throw new Error("Runtime receipt ledger checklist must match the model-facing packet turn.");
  }

  const allowedStepIds = stepIds(input.checklist);
  const acceptedStepIds = new Set<string>();
  const acceptedLocalConsequenceIds = new Set<string>();
  const priorReceipts = new Map<string, GameplayRuntimeReceiptV2>();
  let chainHeadWorldVersion = input.modelPacket.baseWorldVersion;
  for (const receipt of input.receipts) {
    if (receipt.baseWorldVersion !== chainHeadWorldVersion) {
      throw new Error(`Runtime receipt ${receipt.receiptId} does not follow the current world-version chain head.`);
    }

    if (receipt.source.kind === "gm_action_checklist") {
      const source = receipt.source;
      const step = input.checklist.steps.find((candidateStep) =>
        candidateStep.stepId === source.stepId);
      if (!allowedStepIds.has(receipt.stepId) || !step) {
        throw new Error(`Runtime receipt ${receipt.receiptId} references unknown checklist step ${receipt.stepId}.`);
      }
      if (receipt.status === "accepted" && receipt.capabilityId !== step.requiredCapabilityId) {
        throw new Error(`Runtime receipt ${receipt.receiptId} capability does not match checklist step ${step.stepId}.`);
      }
      if (receipt.status === "accepted") {
        for (const dependency of step.dependsOnStepIds) {
          if (!acceptedStepIds.has(dependency)) {
            throw new Error(`Runtime receipt ${receipt.receiptId} accepted before dependency ${dependency}.`);
          }
        }
        if (acceptedStepIds.has(receipt.stepId)) {
          throw new Error(`Runtime receipt ledger has duplicate accepted receipt for checklist step ${receipt.stepId}.`);
        }
        acceptedStepIds.add(receipt.stepId);
      }
    } else {
      const source = receipt.source;
      const trigger = priorReceipts.get(source.triggerReceiptId);
      if (!trigger || !acceptedLocalMutationTrigger(trigger)) {
        throw new Error(`Local consequence receipt ${receipt.receiptId} requires an accepted local mutation trigger receipt.`);
      }
      const consequenceKey = `${source.scheduleId}:${source.consequenceId}`;
      if (receipt.status === "accepted") {
        if (acceptedLocalConsequenceIds.has(consequenceKey)) {
          throw new Error(`Runtime receipt ledger has duplicate accepted local consequence receipt for ${source.consequenceId}.`);
        }
        acceptedLocalConsequenceIds.add(consequenceKey);
      }
    }
    chainHeadWorldVersion = receipt.mutationApplied
      ? receipt.resultWorldVersion
      : chainHeadWorldVersion;
    priorReceipts.set(receipt.receiptId, receipt);
  }

  return assertGameplayRuntimeReceiptLedgerV2({
    version: "gameplay-runtime-receipt-ledger.v2",
    ledgerId: input.ledgerId,
    campaignId: input.modelPacket.campaignId,
    turnId: input.modelPacket.turnId,
    checklistId: input.checklist.checklistId,
    baseWorldVersion: input.modelPacket.baseWorldVersion,
    receipts: input.receipts,
  });
}

function sameTurnPacket(input: {
  initialPacket: ModelFacingTurnPacketV2;
  candidatePacket: ModelFacingTurnPacketV2;
  role: string;
}): void {
  if (
    input.candidatePacket.campaignId !== input.initialPacket.campaignId
    || input.candidatePacket.turnId !== input.initialPacket.turnId
    || input.candidatePacket.playerAction !== input.initialPacket.playerAction
  ) {
    throw new Error(`${input.role} model-facing packet must match the initial turn packet.`);
  }
  if (input.candidatePacket.baseWorldVersion < input.initialPacket.baseWorldVersion) {
    throw new Error(`${input.role} model-facing packet cannot precede the initial turn packet.`);
  }
}

function validateReceiptModelPackets(input: {
  ledger: GameplayRuntimeReceiptLedgerV2;
  initialPacket: ModelFacingTurnPacketV2;
  receiptModelPackets: Partial<Record<string, ModelFacingTurnPacketV2>>;
}): void {
  const receiptIds = new Set(input.ledger.receipts.map((receipt) => receipt.receiptId));
  for (const receiptId of Object.keys(input.receiptModelPackets)) {
    if (!receiptIds.has(receiptId)) {
      throw new Error(`Receipt model packet ${receiptId} does not correspond to a runtime receipt.`);
    }
  }

  for (const receipt of input.ledger.receipts) {
    if (receipt.status !== "accepted") continue;
    const receiptPacket = input.receiptModelPackets[receipt.receiptId];
    if (!receiptPacket) {
      throw new Error(`Accepted runtime receipt ${receipt.receiptId} requires an exact pre-step model-facing packet.`);
    }
    sameTurnPacket({
      initialPacket: input.initialPacket,
      candidatePacket: receiptPacket,
      role: `receipt ${receipt.receiptId}`,
    });
    if (receiptPacket.baseWorldVersion !== receipt.baseWorldVersion) {
      throw new Error(`Receipt model packet ${receipt.receiptId} baseWorldVersion must match the receipt baseWorldVersion.`);
    }
  }
}

export function buildRuntimeSettledTurnPacketV2(input: {
  packetId: string;
  modelPacket: ModelFacingTurnPacketV2;
  latestModelPacket?: ModelFacingTurnPacketV2;
  receiptModelPackets?: Partial<Record<string, ModelFacingTurnPacketV2>>;
  gmRead: GmReadChecklistV2;
  checklist: GmActionChecklistV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
}): SettledTurnPacketV2 {
  if (input.ledger.campaignId !== input.modelPacket.campaignId || input.ledger.turnId !== input.modelPacket.turnId) {
    throw new Error("Runtime receipt ledger must match the model-facing packet turn.");
  }
  if (input.ledger.checklistId !== input.checklist.checklistId) {
    throw new Error("Runtime receipt ledger checklistId must match the accepted checklist.");
  }

  const latestModelPacket = input.latestModelPacket ?? input.modelPacket;
  sameTurnPacket({
    initialPacket: input.modelPacket,
    candidatePacket: latestModelPacket,
    role: "latest",
  });
  validateReceiptModelPackets({
    ledger: input.ledger,
    initialPacket: input.modelPacket,
    receiptModelPackets: input.receiptModelPackets ?? {},
  });

  const acceptedEvidence = currentSceneEvidence(latestModelPacket);
  const failedSteps: SettledStepAuditV2[] = [];
  const acceptedRuntimeReceiptIds: string[] = [];
  const acceptedDurableEventIds: string[] = [];
  const seenReceiptStepIds = new Set<string>();

  for (const receipt of input.ledger.receipts) {
    seenReceiptStepIds.add(receipt.stepId);
    if (receipt.status !== "accepted") {
      failedSteps.push(receiptAudit(receipt));
      continue;
    }

    const normalized = normalizeRuntimeReceiptEvidenceV2({
      modelPacket: input.receiptModelPackets?.[receipt.receiptId] ?? latestModelPacket,
      receipt,
    });
    if (normalized.status !== "accepted") {
      throw new Error(
        `Accepted runtime receipt ${receipt.receiptId} failed evidence normalization: ${normalized.issues.map((issue) => issue.message).join("; ")}`,
      );
    }

    acceptedEvidence.push(normalized.evidence);
    acceptedRuntimeReceiptIds.push(receipt.receiptId);
    acceptedDurableEventIds.push(...receipt.durableEventIds);
  }

  const skippedSteps = input.checklist.steps
    .filter((step) => !seenReceiptStepIds.has(step.stepId))
    .map((step): SettledStepAuditV2 => ({
      stage: "runtime_executor:skipped",
      reason: `Checklist step ${step.stepId} was not executed: ${step.purpose}`,
      evidenceIds: [],
    }));

  return assertSettledTurnPacketV2({
    version: "settled-turn-packet.v2",
    packetId: input.packetId,
    campaignId: input.modelPacket.campaignId,
    turnId: input.modelPacket.turnId,
    playerAction: input.modelPacket.playerAction,
    baseTick: input.modelPacket.baseTick,
    baseWorldVersion: input.modelPacket.baseWorldVersion,
    resultWorldVersion: maxWorldVersion(input.ledger.receipts, input.modelPacket.baseWorldVersion),
    gmRead: input.gmRead,
    oracleSettlement: null,
    acceptedEvidence,
    acceptedRuntimeReceiptIds: uniqueStrings(acceptedRuntimeReceiptIds),
    acceptedDurableEventIds: uniqueStrings(acceptedDurableEventIds),
    skippedSteps,
    failedSteps,
    privateGuardTerms: uniqueStrings([
      ...input.modelPacket.runtimePrivateGuardTerms,
      ...latestModelPacket.runtimePrivateGuardTerms,
      ...Object.values(input.receiptModelPackets ?? {}).flatMap((packet) =>
        packet?.runtimePrivateGuardTerms ?? []),
    ]),
  });
}
