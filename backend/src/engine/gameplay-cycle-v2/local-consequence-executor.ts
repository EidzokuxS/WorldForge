import {
  assertGmActionChecklistV2,
  assertLocalConsequenceExecutionV2,
  assertLocalConsequenceToolRequestCandidateV2,
  type GameplayRuntimeReceiptLedgerV2,
  type GameplayRuntimeReceiptV2,
  type GmActionChecklistV2,
  type LocalConsequenceExecutionV2,
  type LocalConsequenceScheduleEntryV2,
  type LocalConsequenceScheduleV2,
  type LocalConsequenceToolRequestCandidateV2,
  type ModelFacingTurnPacketV2,
} from "./contracts.js";
import {
  type FrameRefreshResultV2,
  refreshFrameAfterAcceptedMutationV2,
} from "./frame-refresh.js";
import { buildRuntimeReceiptLedgerV2 } from "./receipt-ledger.js";
import {
  executeGameplayToolRequestV2,
  type GameplayToolHandlerRegistryV2,
} from "./runtime-executor.js";
import type { GameplayRefRegistryV2 } from "./ref-registry.js";

export interface LocalConsequenceExecutionResolvedV2 {
  status: "resolved";
  latestPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  receipts: GameplayRuntimeReceiptV2[];
  receiptModelPackets: Record<string, ModelFacingTurnPacketV2>;
  refreshes: FrameRefreshResultV2[];
  execution: LocalConsequenceExecutionV2;
}

export interface LocalConsequenceExecutionBlockedV2 {
  status: "blocked";
  reason: string;
  unresolvedConsequenceIds: string[];
  latestPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  receipts: GameplayRuntimeReceiptV2[];
  receiptModelPackets: Record<string, ModelFacingTurnPacketV2>;
  refreshes: FrameRefreshResultV2[];
  execution: LocalConsequenceExecutionV2 | null;
}

export type LocalConsequenceExecutionResultV2 =
  | LocalConsequenceExecutionResolvedV2
  | LocalConsequenceExecutionBlockedV2;

export type LocalConsequenceRefreshedFrameProviderV2 = (input: {
  previousPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  receipt: GameplayRuntimeReceiptV2;
  receipts: GameplayRuntimeReceiptV2[];
  consequenceId: string;
}) => unknown | Promise<unknown>;

export type LocalConsequenceRefRegistryProviderV2 = (input: {
  packet: ModelFacingTurnPacketV2;
}) => GameplayRefRegistryV2 | null | undefined | Promise<GameplayRefRegistryV2 | null | undefined>;

function visibleActorRefs(packet: ModelFacingTurnPacketV2): Set<string> {
  return new Set(packet.scene.actors
    .filter((actor) => actor.role !== "background")
    .map((actor) => actor.ref.toLowerCase()));
}

function triggerReceipt(
  ledger: GameplayRuntimeReceiptLedgerV2,
  receiptId: string,
): GameplayRuntimeReceiptV2 | null {
  return ledger.receipts.find((receipt) => receipt.receiptId === receiptId) ?? null;
}

function acceptedLocalMutationTrigger(receipt: GameplayRuntimeReceiptV2 | null): boolean {
  return Boolean(receipt)
    && receipt?.status === "accepted"
    && receipt.mutationApplied
    && receipt.mutationAuthority !== "none"
    && receipt.mutationAuthority !== "knowledge"
    && receipt.mutationAuthority !== "world"
    && receipt.mutationAuthority !== "ui";
}

function localStepId(index: number): `step-${number}` {
  return `step-${index + 1}` as `step-${number}`;
}

function requestActorRef(candidate: LocalConsequenceToolRequestCandidateV2): string | null {
  const binding = candidate.request.effectBinding as Record<string, unknown>;
  const value = binding.actorRef ?? binding.speakerRef;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function buildLocalConsequenceChecklist(input: {
  latestPacket: ModelFacingTurnPacketV2;
  schedule: LocalConsequenceScheduleV2;
  entries: LocalConsequenceScheduleEntryV2[];
  entry: LocalConsequenceScheduleEntryV2;
  stepId: string;
}): GmActionChecklistV2 {
  return assertGmActionChecklistV2({
    version: "gm-action-checklist.v2",
    checklistId: `local-${input.schedule.scheduleId}`,
    campaignId: input.latestPacket.campaignId,
    turnId: input.latestPacket.turnId,
    baseWorldVersion: input.latestPacket.baseWorldVersion,
    sourceGmReadPath: "tool_plan",
    turnPath: "procedural",
    turnIntent: "Resolve required local consequences before player-facing settlement.",
    steps: input.entries.map((entry, index) => ({
      stepId: index === input.entries.indexOf(input.entry) ? input.stepId : localStepId(index),
      purpose: entry.reason,
      actorRef: entry.actorRef,
      targetRefs: [],
      evidenceRefs: entry.evidenceRefs,
      requiredCapabilityId: entry.requiredCapabilityId,
      intendedEffect: {
        kind: entry.intendedEffectKind,
        summary: entry.reason,
        stateScope: "local_scene",
      },
      expectedVisibleEffect: entry.reason,
      dependsOnStepIds: [],
    })),
  });
}

function executionSummary(input: {
  executionId: string;
  schedule: LocalConsequenceScheduleV2;
  inputLedger: GameplayRuntimeReceiptLedgerV2;
  outputLedger: GameplayRuntimeReceiptLedgerV2;
  receipts: GameplayRuntimeReceiptV2[];
  resolvedConsequenceIds: string[];
  skippedReasons: string[];
}): LocalConsequenceExecutionV2 {
  return assertLocalConsequenceExecutionV2({
    version: "local-consequence-execution.v2",
    executionId: input.executionId,
    campaignId: input.schedule.campaignId,
    turnId: input.schedule.turnId,
    scheduleId: input.schedule.scheduleId,
    inputLedgerId: input.inputLedger.ledgerId,
    outputLedgerId: input.outputLedger.ledgerId,
    baseWorldVersion: input.inputLedger.baseWorldVersion,
    resultWorldVersion: input.outputLedger.receipts.reduce(
      (result, receipt) => Math.max(result, receipt.resultWorldVersion),
      input.inputLedger.baseWorldVersion,
    ),
    resolvedConsequenceIds: input.resolvedConsequenceIds,
    acceptedReceiptIds: input.receipts
      .filter((receipt) => receipt.status === "accepted")
      .map((receipt) => receipt.receiptId),
    rejectedReceiptIds: input.receipts
      .filter((receipt) => receipt.status === "rejected")
      .map((receipt) => receipt.receiptId),
    failedReceiptIds: input.receipts
      .filter((receipt) => receipt.status === "failed")
      .map((receipt) => receipt.receiptId),
    skipped: input.skippedReasons.map((reason) => ({
      stage: "local_consequence_executor",
      reason,
      evidenceIds: [],
    })),
  });
}

export async function executeRequiredLocalConsequencesV2(input: {
  executionId: string;
  ledgerId: string;
  initialPacket: ModelFacingTurnPacketV2;
  latestPacket: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  schedule: LocalConsequenceScheduleV2;
  candidatesByConsequenceId: Partial<Record<string, unknown>>;
  handlers: GameplayToolHandlerRegistryV2;
  refRegistryProvider?: LocalConsequenceRefRegistryProviderV2;
  refreshedFrameProvider?: LocalConsequenceRefreshedFrameProviderV2;
  receiptIdForConsequence?: (consequenceId: string, index: number) => string;
  emittedAtForConsequence?: (consequenceId: string, index: number) => number;
}): Promise<LocalConsequenceExecutionResultV2> {
  if (input.schedule.route !== "required_before_packet") {
    const execution = executionSummary({
      executionId: input.executionId,
      schedule: input.schedule,
      inputLedger: input.ledger,
      outputLedger: input.ledger,
      receipts: [],
      resolvedConsequenceIds: [],
      skippedReasons: ["No required local consequences were scheduled for pre-packet execution."],
    });
    return {
      status: "resolved",
      latestPacket: input.latestPacket,
      ledger: input.ledger,
      receipts: [],
      receiptModelPackets: {},
      refreshes: [],
      execution,
    };
  }

  let latestPacket = input.latestPacket;
  let outputLedger = input.ledger;
  const allReceipts = [...input.ledger.receipts];
  const localReceipts: GameplayRuntimeReceiptV2[] = [];
  const receiptModelPackets: Record<string, ModelFacingTurnPacketV2> = {};
  const refreshes: FrameRefreshResultV2[] = [];
  const resolvedConsequenceIds: string[] = [];
  const skippedReasons: string[] = [];

  for (const [index, entry] of input.schedule.entries.entries()) {
    const currentVisibleActors = visibleActorRefs(latestPacket);
    if (!currentVisibleActors.has(entry.actorRef.toLowerCase())) {
      const execution = executionSummary({
        executionId: input.executionId,
        schedule: input.schedule,
        inputLedger: input.ledger,
        outputLedger,
        receipts: localReceipts,
        resolvedConsequenceIds,
        skippedReasons: [
          ...skippedReasons,
          `Required local consequence ${entry.consequenceId} actor ${entry.actorRef} is no longer visible.`,
        ],
      });
      return {
        status: "blocked",
        reason: `Required local consequence ${entry.consequenceId} actor ${entry.actorRef} is no longer visible.`,
        unresolvedConsequenceIds: input.schedule.entries.slice(index).map((candidate) => candidate.consequenceId),
        latestPacket,
        ledger: outputLedger,
        receipts: localReceipts,
        receiptModelPackets,
        refreshes,
        execution,
      };
    }

    const trigger = triggerReceipt(outputLedger, entry.triggerReceiptId);
    if (!acceptedLocalMutationTrigger(trigger)) {
      const execution = executionSummary({
        executionId: input.executionId,
        schedule: input.schedule,
        inputLedger: input.ledger,
        outputLedger,
        receipts: localReceipts,
        resolvedConsequenceIds,
        skippedReasons,
      });
      return {
        status: "blocked",
        reason: `Required local consequence ${entry.consequenceId} does not have an accepted local mutation trigger.`,
        unresolvedConsequenceIds: input.schedule.entries.slice(index).map((candidate) => candidate.consequenceId),
        latestPacket,
        ledger: outputLedger,
        receipts: localReceipts,
        receiptModelPackets,
        refreshes,
        execution,
      };
    }

    const rawCandidate = input.candidatesByConsequenceId[entry.consequenceId];
    if (!rawCandidate) {
      const execution = executionSummary({
        executionId: input.executionId,
        schedule: input.schedule,
        inputLedger: input.ledger,
        outputLedger,
        receipts: localReceipts,
        resolvedConsequenceIds,
        skippedReasons,
      });
      return {
        status: "blocked",
        reason: `Missing local consequence request candidate for ${entry.consequenceId}.`,
        unresolvedConsequenceIds: input.schedule.entries.slice(index).map((candidate) => candidate.consequenceId),
        latestPacket,
        ledger: outputLedger,
        receipts: localReceipts,
        receiptModelPackets,
        refreshes,
        execution,
      };
    }

    let candidate: LocalConsequenceToolRequestCandidateV2;
    try {
      candidate = assertLocalConsequenceToolRequestCandidateV2(rawCandidate);
    } catch (error) {
      const execution = executionSummary({
        executionId: input.executionId,
        schedule: input.schedule,
        inputLedger: input.ledger,
        outputLedger,
        receipts: localReceipts,
        resolvedConsequenceIds,
        skippedReasons,
      });
      return {
        status: "blocked",
        reason: error instanceof Error ? error.message : `Invalid local consequence request candidate for ${entry.consequenceId}.`,
        unresolvedConsequenceIds: input.schedule.entries.slice(index).map((entryCandidate) => entryCandidate.consequenceId),
        latestPacket,
        ledger: outputLedger,
        receipts: localReceipts,
        receiptModelPackets,
        refreshes,
        execution,
      };
    }

    const actorRef = requestActorRef(candidate);
    if (
      candidate.consequenceId !== entry.consequenceId
      || candidate.triggerReceiptId !== entry.triggerReceiptId
      || candidate.request.capabilityId !== entry.requiredCapabilityId
      || actorRef !== entry.actorRef
    ) {
      const execution = executionSummary({
        executionId: input.executionId,
        schedule: input.schedule,
        inputLedger: input.ledger,
        outputLedger,
        receipts: localReceipts,
        resolvedConsequenceIds,
        skippedReasons,
      });
      return {
        status: "blocked",
        reason: `Local consequence request candidate ${candidate.candidateId} does not match schedule entry ${entry.consequenceId}.`,
        unresolvedConsequenceIds: input.schedule.entries.slice(index).map((entryCandidate) => entryCandidate.consequenceId),
        latestPacket,
        ledger: outputLedger,
        receipts: localReceipts,
        receiptModelPackets,
        refreshes,
        execution,
      };
    }

    const localChecklist = buildLocalConsequenceChecklist({
      latestPacket,
      schedule: input.schedule,
      entries: input.schedule.entries,
      entry,
      stepId: candidate.request.stepId,
    });
    const refRegistry = input.refRegistryProvider
      ? await input.refRegistryProvider({ packet: latestPacket })
      : undefined;
    const execution = await executeGameplayToolRequestV2({
      packet: latestPacket,
      checklist: localChecklist,
      stepId: candidate.request.stepId,
      request: candidate.request,
      handlers: input.handlers,
      refRegistry: refRegistry ?? undefined,
      priorReceipts: [...allReceipts],
      source: {
        kind: "local_consequence_schedule",
        scheduleId: input.schedule.scheduleId,
        consequenceId: entry.consequenceId,
        triggerReceiptId: entry.triggerReceiptId,
      },
      receiptId: input.receiptIdForConsequence?.(entry.consequenceId, index)
        ?? `receipt-${entry.consequenceId}`,
      emittedAt: input.emittedAtForConsequence?.(entry.consequenceId, index)
        ?? index + 1,
    });

    allReceipts.push(execution.receipt);
    localReceipts.push(execution.receipt);
    receiptModelPackets[execution.receipt.receiptId] = latestPacket;
    outputLedger = buildRuntimeReceiptLedgerV2({
      ledgerId: input.ledgerId,
      modelPacket: input.initialPacket,
      checklist: input.checklist,
      receipts: allReceipts,
    });

    if (execution.receipt.status !== "accepted") {
      const summary = executionSummary({
        executionId: input.executionId,
        schedule: input.schedule,
        inputLedger: input.ledger,
        outputLedger,
        receipts: localReceipts,
        resolvedConsequenceIds,
        skippedReasons,
      });
      return {
        status: "blocked",
        reason: execution.receipt.failureReason ?? `Local consequence ${entry.consequenceId} was not accepted.`,
        unresolvedConsequenceIds: input.schedule.entries.slice(index).map((entryCandidate) => entryCandidate.consequenceId),
        latestPacket,
        ledger: outputLedger,
        receipts: localReceipts,
        receiptModelPackets,
        refreshes,
        execution: summary,
      };
    }

    resolvedConsequenceIds.push(entry.consequenceId);

    if (execution.receipt.mutationApplied) {
      const refreshedEnvelope = input.refreshedFrameProvider
        ? await input.refreshedFrameProvider({
          previousPacket: latestPacket,
          ledger: outputLedger,
          receipt: execution.receipt,
          receipts: [...allReceipts],
          consequenceId: entry.consequenceId,
        })
        : undefined;
      const refresh = refreshFrameAfterAcceptedMutationV2({
        previousPacket: latestPacket,
        ledger: outputLedger,
        refreshedEnvelope,
      });
      refreshes.push(refresh);
      if (refresh.status !== "refreshed") {
        const summary = executionSummary({
          executionId: input.executionId,
          schedule: input.schedule,
          inputLedger: input.ledger,
          outputLedger,
          receipts: localReceipts,
          resolvedConsequenceIds,
          skippedReasons,
        });
        return {
          status: "blocked",
          reason: refresh.reason,
          unresolvedConsequenceIds: input.schedule.entries.slice(index + 1).map((entryCandidate) => entryCandidate.consequenceId),
          latestPacket,
          ledger: outputLedger,
          receipts: localReceipts,
          receiptModelPackets,
          refreshes,
          execution: summary,
        };
      }
      latestPacket = refresh.refreshedPacket;
    }
  }

  const execution = executionSummary({
    executionId: input.executionId,
    schedule: input.schedule,
    inputLedger: input.ledger,
    outputLedger,
    receipts: localReceipts,
    resolvedConsequenceIds,
    skippedReasons,
  });

  return {
    status: "resolved",
    latestPacket,
    ledger: outputLedger,
    receipts: localReceipts,
    receiptModelPackets,
    refreshes,
    execution,
  };
}
