import {
  type GameplayRuntimeReceiptLedgerV2,
  type GameplayRuntimeReceiptV2,
  type GmActionChecklistV2,
  type GmReadChecklistV2,
  type LocalConsequenceScheduleV2,
  type ModelFacingTurnPacketV2,
  type SettledTurnPacketV2,
} from "./contracts.js";
import {
  type FrameRefreshResultV2,
  refreshFrameAfterAcceptedMutationV2,
} from "./frame-refresh.js";
import {
  buildRuntimeReceiptLedgerV2,
  buildRuntimeSettledTurnPacketV2,
} from "./receipt-ledger.js";
import {
  executeGameplayToolRequestV2,
  type GameplayToolHandlerRegistryV2,
} from "./runtime-executor.js";
import type { GameplayRefRegistryV2 } from "./ref-registry.js";
import { scheduleLocalConsequencesV2 } from "./local-consequence-scheduler.js";
import {
  executeRequiredLocalConsequencesV2,
  type LocalConsequenceRefreshedFrameProviderV2,
} from "./local-consequence-executor.js";

export interface GameplayCycleCompositionSettledV2 {
  status: "settled";
  initialPacket: ModelFacingTurnPacketV2;
  latestPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  settledPacket: SettledTurnPacketV2;
  localConsequenceSchedule: LocalConsequenceScheduleV2;
  refreshes: FrameRefreshResultV2[];
}

export interface GameplayCycleCompositionBlockedV2 {
  status: "blocked";
  reason: string;
  initialPacket: ModelFacingTurnPacketV2;
  latestPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2 | null;
  receipts: GameplayRuntimeReceiptV2[];
  refreshes: FrameRefreshResultV2[];
  settledPacket: null;
  localConsequenceSchedule: LocalConsequenceScheduleV2 | null;
}

export type GameplayCycleCompositionResultV2 =
  | GameplayCycleCompositionSettledV2
  | GameplayCycleCompositionBlockedV2;

export type RefreshedFrameProviderV2 = (input: {
  previousPacket: ModelFacingTurnPacketV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  receipt: GameplayRuntimeReceiptV2;
  receipts: GameplayRuntimeReceiptV2[];
}) => unknown | Promise<unknown>;

export type GameplayRefRegistryProviderV2 = (input: {
  packet: ModelFacingTurnPacketV2;
}) => GameplayRefRegistryV2 | null | undefined | Promise<GameplayRefRegistryV2 | null | undefined>;

export type GameplayToolRequestCandidateProviderV2 = (input: {
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  gmRead: GmReadChecklistV2;
  step: GmActionChecklistV2["steps"][number];
  stepIndex: number;
  receipts: GameplayRuntimeReceiptV2[];
  refreshes: FrameRefreshResultV2[];
}) => unknown | Promise<unknown>;

export type LocalConsequenceCandidateProviderV2 = (input: {
  initialPacket: ModelFacingTurnPacketV2;
  latestPacket: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  gmRead: GmReadChecklistV2;
  ledger: GameplayRuntimeReceiptLedgerV2;
  schedule: LocalConsequenceScheduleV2;
  consequence: LocalConsequenceScheduleV2["entries"][number];
  consequenceIndex: number;
}) => unknown | Promise<unknown>;

function defaultReceiptId(stepId: string): string {
  return `receipt-${stepId}`;
}

function defaultEmittedAt(index: number): number {
  return index + 1;
}

function acceptedReceiptForStep(
  receipts: readonly GameplayRuntimeReceiptV2[],
  stepId: string,
): boolean {
  return receipts.some((receipt) =>
    receipt.stepId === stepId && receipt.status === "accepted");
}

function buildLedger(input: {
  ledgerId: string;
  initialPacket: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  receipts: GameplayRuntimeReceiptV2[];
}): GameplayRuntimeReceiptLedgerV2 | null {
  if (input.receipts.length === 0) return null;
  return buildRuntimeReceiptLedgerV2({
    ledgerId: input.ledgerId,
    modelPacket: input.initialPacket,
    checklist: input.checklist,
    receipts: [...input.receipts],
  });
}

export async function composeGameplayCycleMutatingTurnV2(input: {
  packetId: string;
  ledgerId: string;
  scheduleId: string;
  initialPacket: ModelFacingTurnPacketV2;
  gmRead: GmReadChecklistV2;
  checklist: GmActionChecklistV2;
  requestsByStepId?: Partial<Record<string, unknown>>;
  requestCandidateProvider?: GameplayToolRequestCandidateProviderV2;
  handlers: GameplayToolHandlerRegistryV2;
  refRegistryProvider?: GameplayRefRegistryProviderV2;
  refreshedFrameProvider?: RefreshedFrameProviderV2;
  localConsequenceRefreshedFrameProvider?: LocalConsequenceRefreshedFrameProviderV2;
  localConsequenceCandidatesByConsequenceId?: Partial<Record<string, unknown>>;
  localConsequenceCandidateProvider?: LocalConsequenceCandidateProviderV2;
  receiptIdForStep?: (stepId: string, index: number) => string;
  emittedAtForStep?: (stepId: string, index: number) => number;
  receiptIdForLocalConsequence?: (consequenceId: string, index: number) => string;
  emittedAtForLocalConsequence?: (consequenceId: string, index: number) => number;
  maxRequiredLocalConsequenceEntries?: number;
}): Promise<GameplayCycleCompositionResultV2> {
  let latestPacket = input.initialPacket;
  const receipts: GameplayRuntimeReceiptV2[] = [];
  const receiptModelPackets: Partial<Record<string, ModelFacingTurnPacketV2>> = {};
  const refreshes: FrameRefreshResultV2[] = [];

  for (const [index, step] of input.checklist.steps.entries()) {
    const dependenciesAccepted = step.dependsOnStepIds.every((dependencyStepId) =>
      acceptedReceiptForStep(receipts, dependencyStepId));
    if (!dependenciesAccepted) continue;

    const request = input.requestsByStepId?.[step.stepId]
      ?? (input.requestCandidateProvider
        ? await input.requestCandidateProvider({
          packet: latestPacket,
          checklist: input.checklist,
          gmRead: input.gmRead,
          step,
          stepIndex: index,
          receipts: [...receipts],
          refreshes: [...refreshes],
        })
        : undefined);
    if (!request) {
      return {
        status: "blocked",
        reason: `Missing gameplay-cycle-v2 tool request candidate for checklist step ${step.stepId}.`,
        initialPacket: input.initialPacket,
        latestPacket,
        ledger: buildLedger({
          ledgerId: input.ledgerId,
          initialPacket: input.initialPacket,
          checklist: input.checklist,
          receipts,
        }),
        receipts,
        refreshes,
        settledPacket: null,
        localConsequenceSchedule: null,
      };
    }

    const refRegistry = input.refRegistryProvider
      ? await input.refRegistryProvider({ packet: latestPacket })
      : undefined;
    const execution = await executeGameplayToolRequestV2({
      packet: latestPacket,
      checklist: input.checklist,
      stepId: step.stepId,
      request,
      handlers: input.handlers,
      refRegistry: refRegistry ?? undefined,
      priorReceipts: [...receipts],
      receiptId: input.receiptIdForStep?.(step.stepId, index) ?? defaultReceiptId(step.stepId),
      emittedAt: input.emittedAtForStep?.(step.stepId, index) ?? defaultEmittedAt(index),
    });

    receipts.push(execution.receipt);
    receiptModelPackets[execution.receipt.receiptId] = latestPacket;

    const ledger = buildRuntimeReceiptLedgerV2({
      ledgerId: input.ledgerId,
      modelPacket: input.initialPacket,
      checklist: input.checklist,
      receipts,
    });

    if (execution.receipt.status === "accepted" && execution.receipt.mutationApplied) {
      const refreshedEnvelope = input.refreshedFrameProvider
        ? await input.refreshedFrameProvider({
          previousPacket: latestPacket,
          ledger,
          receipt: execution.receipt,
          receipts: [...receipts],
        })
        : undefined;
      const refresh = refreshFrameAfterAcceptedMutationV2({
        previousPacket: latestPacket,
        ledger,
        refreshedEnvelope,
      });
      refreshes.push(refresh);

      if (refresh.status !== "refreshed") {
        return {
          status: "blocked",
          reason: refresh.reason,
          initialPacket: input.initialPacket,
          latestPacket,
          ledger,
          receipts,
          refreshes,
          settledPacket: null,
          localConsequenceSchedule: null,
        };
      }

      latestPacket = refresh.refreshedPacket;
    }
  }

  const ledger = buildLedger({
    ledgerId: input.ledgerId,
    initialPacket: input.initialPacket,
    checklist: input.checklist,
    receipts,
  });
  if (!ledger) {
    return {
      status: "blocked",
      reason: "Tool-plan composition produced no runtime receipts; settled truth cannot be built from checklist intent alone.",
      initialPacket: input.initialPacket,
      latestPacket,
      ledger: null,
      receipts,
      refreshes,
      settledPacket: null,
      localConsequenceSchedule: null,
    };
  }

  const localConsequenceSchedule = scheduleLocalConsequencesV2({
    scheduleId: input.scheduleId,
    modelPacket: latestPacket,
    ledger,
    maxRequiredEntries: input.maxRequiredLocalConsequenceEntries,
  });
  if (localConsequenceSchedule.route === "required_before_packet") {
    const localCandidates: Partial<Record<string, unknown>> = {
      ...(input.localConsequenceCandidatesByConsequenceId ?? {}),
    };
    if (input.localConsequenceCandidateProvider) {
      for (const [index, consequence] of localConsequenceSchedule.entries.entries()) {
        if (localCandidates[consequence.consequenceId]) continue;
        localCandidates[consequence.consequenceId] = await input.localConsequenceCandidateProvider({
          initialPacket: input.initialPacket,
          latestPacket,
          checklist: input.checklist,
          gmRead: input.gmRead,
          ledger,
          schedule: localConsequenceSchedule,
          consequence,
          consequenceIndex: index,
        });
      }
    }
    if (Object.keys(localCandidates).length > 0) {
      const localExecution = await executeRequiredLocalConsequencesV2({
        executionId: `local-execution-${input.scheduleId}`,
        ledgerId: input.ledgerId,
        initialPacket: input.initialPacket,
        latestPacket,
        checklist: input.checklist,
        ledger,
        schedule: localConsequenceSchedule,
        candidatesByConsequenceId: localCandidates,
        handlers: input.handlers,
        refRegistryProvider: input.refRegistryProvider,
        refreshedFrameProvider: input.localConsequenceRefreshedFrameProvider,
        receiptIdForConsequence: input.receiptIdForLocalConsequence,
        emittedAtForConsequence: input.emittedAtForLocalConsequence,
      });
      Object.assign(receiptModelPackets, localExecution.receiptModelPackets);
      if (localExecution.status !== "resolved") {
        return {
          status: "blocked",
          reason: localExecution.reason,
          initialPacket: input.initialPacket,
          latestPacket: localExecution.latestPacket,
          ledger: localExecution.ledger,
          receipts: [...receipts, ...localExecution.receipts],
          refreshes: [...refreshes, ...localExecution.refreshes],
          settledPacket: null,
          localConsequenceSchedule,
        };
      }

      latestPacket = localExecution.latestPacket;
      const settledPacket = buildRuntimeSettledTurnPacketV2({
        packetId: input.packetId,
        modelPacket: input.initialPacket,
        latestModelPacket: latestPacket,
        receiptModelPackets,
        gmRead: input.gmRead,
        checklist: input.checklist,
        ledger: localExecution.ledger,
      });
      return {
        status: "settled",
        initialPacket: input.initialPacket,
        latestPacket,
        ledger: localExecution.ledger,
        settledPacket,
        localConsequenceSchedule,
        refreshes: [...refreshes, ...localExecution.refreshes],
      };
    }

    return {
      status: "blocked",
      reason: "Accepted local mutation requires local consequences before the player-facing settled packet.",
      initialPacket: input.initialPacket,
      latestPacket,
      ledger,
      receipts,
      refreshes,
      settledPacket: null,
      localConsequenceSchedule,
    };
  }

  let settledPacket: SettledTurnPacketV2;
  try {
    settledPacket = buildRuntimeSettledTurnPacketV2({
      packetId: input.packetId,
      modelPacket: input.initialPacket,
      latestModelPacket: latestPacket,
      receiptModelPackets,
      gmRead: input.gmRead,
      checklist: input.checklist,
      ledger,
    });
  } catch (error) {
    return {
      status: "blocked",
      reason: error instanceof Error ? error.message : "Runtime settled packet construction failed.",
      initialPacket: input.initialPacket,
      latestPacket,
      ledger,
      receipts,
      refreshes,
      settledPacket: null,
      localConsequenceSchedule,
    };
  }

  return {
    status: "settled",
    initialPacket: input.initialPacket,
    latestPacket,
    ledger,
    settledPacket,
    localConsequenceSchedule,
    refreshes,
  };
}
