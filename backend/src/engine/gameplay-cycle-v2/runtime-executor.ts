import { z } from "zod";
import {
  assertGameplayRuntimeReceiptV2,
  gameplayRuntimeMutationAuthorityV2Schema,
  type GameplayRuntimeReceiptV2,
  type GameplayRuntimeReceiptSourceV2,
  type GameplayToolIdV2,
  type GameplayToolRequestV2,
  type GmActionChecklistV2,
  type ModelFacingTurnPacketV2,
} from "./contracts.js";
import { getRuntimeCapabilityDefinitionV2 } from "./capability-catalog.js";
import type { GameplayRefRegistryV2 } from "./ref-registry.js";
import { validateGameplayToolRequestV2 } from "./tool-request-planner.js";

const handlerOutcomeSchema = z.object({
  status: z.enum(["accepted", "rejected", "failed"]),
  mutationApplied: z.boolean(),
  mutationAuthority: gameplayRuntimeMutationAuthorityV2Schema.default("none"),
  resultWorldVersion: z.number().int().nonnegative(),
  visibleSummary: z.string().trim().min(1).max(700),
  evidenceRefs: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
  durableEventIds: z.array(z.string().trim().min(1).max(180)).max(12).default([]),
  failureReason: z.string().trim().min(1).max(700).optional(),
}).strict();

export type GameplayToolHandlerOutcomeV2 = z.input<typeof handlerOutcomeSchema>;
type ParsedGameplayToolHandlerOutcomeV2 = z.output<typeof handlerOutcomeSchema>;

export type GameplayToolHandlerV2 = (input: {
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  request: GameplayToolRequestV2;
  refRegistry?: GameplayRefRegistryV2;
  priorReceipts: readonly GameplayRuntimeReceiptV2[];
}) => GameplayToolHandlerOutcomeV2 | Promise<GameplayToolHandlerOutcomeV2>;

export type GameplayToolHandlerRegistryV2 =
  Partial<Record<GameplayToolIdV2, GameplayToolHandlerV2>>;

export interface RuntimeExecutorResultV2 {
  status: GameplayRuntimeReceiptV2["status"];
  receipt: GameplayRuntimeReceiptV2;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function rawStringField(value: unknown, field: string): string | null {
  if (!isRecord(value)) return null;
  const fieldValue = value[field];
  return typeof fieldValue === "string" && fieldValue.trim() ? fieldValue.trim() : null;
}

function receiptEvidenceAuthority(
  request: GameplayToolRequestV2 | null,
): GameplayRuntimeReceiptV2["evidenceAuthority"] {
  if (!request) return "observation_only";
  const capability = getRuntimeCapabilityDefinitionV2(request.capabilityId);
  if (capability.evidenceAuthority === "mutation_receipt_required") return "mutation_receipt";
  if (capability.evidenceAuthority === "terminal_receipt_required") return "terminal_receipt";
  return "observation_only";
}

function buildReceipt(input: {
  receiptId: string;
  request: GameplayToolRequestV2 | null;
  rawCandidate: unknown;
  selectedStepId: string;
  baseWorldVersion: number;
  status: GameplayRuntimeReceiptV2["status"];
  evidenceAuthority?: GameplayRuntimeReceiptV2["evidenceAuthority"];
  mutationApplied?: boolean;
  mutationAuthority?: GameplayRuntimeReceiptV2["mutationAuthority"];
  resultWorldVersion?: number;
  visibleSummary: string;
  evidenceRefs?: string[];
  durableEventIds?: string[];
  failureReason?: string;
  source: GameplayRuntimeReceiptSourceV2;
  emittedAt: number;
}): GameplayRuntimeReceiptV2 {
  return assertGameplayRuntimeReceiptV2({
    version: "gameplay-runtime-receipt.v2",
    receiptId: input.receiptId,
    requestId: input.request?.requestId
      ?? rawStringField(input.rawCandidate, "requestId")
      ?? `invalid-request-${input.selectedStepId}`,
    stepId: input.request?.stepId ?? input.selectedStepId,
    source: input.source,
    capabilityId: input.request?.capabilityId ?? null,
    toolId: input.request?.toolId ?? null,
    status: input.status,
    evidenceAuthority: input.evidenceAuthority ?? receiptEvidenceAuthority(input.request),
    mutationAuthority: input.mutationAuthority ?? "none",
    mutationApplied: input.mutationApplied ?? false,
    baseWorldVersion: input.baseWorldVersion,
    resultWorldVersion: input.resultWorldVersion ?? input.baseWorldVersion,
    visibleSummary: input.visibleSummary,
    evidenceRefs: input.evidenceRefs ?? [],
    durableEventIds: input.durableEventIds ?? [],
    failureReason: input.failureReason,
    emittedAt: input.emittedAt,
  });
}

function rejectedReceipt(input: {
  receiptId: string;
  rawCandidate: unknown;
  selectedStepId: string;
  baseWorldVersion: number;
  reason: string;
  emittedAt: number;
  source: GameplayRuntimeReceiptSourceV2;
}): RuntimeExecutorResultV2 {
  const receipt = buildReceipt({
    receiptId: input.receiptId,
    request: null,
    rawCandidate: input.rawCandidate,
    selectedStepId: input.selectedStepId,
    baseWorldVersion: input.baseWorldVersion,
    status: "rejected",
    visibleSummary: "The runtime rejected the requested gameplay effect before mutation.",
    failureReason: input.reason,
    source: input.source,
    emittedAt: input.emittedAt,
  });
  return { status: receipt.status, receipt };
}

function failedReceipt(input: {
  receiptId: string;
  request: GameplayToolRequestV2;
  baseWorldVersion: number;
  reason: string;
  source: GameplayRuntimeReceiptSourceV2;
  emittedAt: number;
}): RuntimeExecutorResultV2 {
  const receipt = buildReceipt({
    receiptId: input.receiptId,
    request: input.request,
    rawCandidate: input.request,
    selectedStepId: input.request.stepId,
    baseWorldVersion: input.baseWorldVersion,
    status: "failed",
    visibleSummary: "The runtime tool failed without applying mutation.",
    failureReason: input.reason,
    source: input.source,
    emittedAt: input.emittedAt,
  });
  return { status: receipt.status, receipt };
}

function validateOutcomeAgainstCapability(input: {
  request: GameplayToolRequestV2;
  outcome: ParsedGameplayToolHandlerOutcomeV2;
  baseWorldVersion: number;
}): string | null {
  const capability = getRuntimeCapabilityDefinitionV2(input.request.capabilityId);
  if (input.outcome.status !== "accepted") {
    if (input.outcome.mutationApplied) return "Rejected or failed handler outcomes must not apply mutation.";
    if (input.outcome.resultWorldVersion !== input.baseWorldVersion) {
      return "Rejected or failed handler outcomes must preserve baseWorldVersion.";
    }
    if (!input.outcome.failureReason) return "Rejected or failed handler outcomes require failureReason.";
    return null;
  }
  if (input.outcome.failureReason) return "Accepted handler outcomes must not include failureReason.";
  if (capability.evidenceAuthority === "mutation_receipt_required") {
    if (!input.outcome.mutationApplied) {
      return `Capability ${input.request.capabilityId} requires an applied mutation receipt.`;
    }
    if (input.outcome.resultWorldVersion <= input.baseWorldVersion) {
      return "Accepted mutation outcomes must advance resultWorldVersion.";
    }
    if (input.outcome.mutationAuthority === "none") {
      return "Accepted mutation outcomes require explicit mutationAuthority.";
    }
  } else if (input.outcome.mutationApplied) {
    return `Capability ${input.request.capabilityId} is not allowed to apply mutation.`;
  } else if (input.outcome.resultWorldVersion !== input.baseWorldVersion) {
    return `Non-mutating capability ${input.request.capabilityId} must preserve baseWorldVersion.`;
  }
  return null;
}

export async function executeGameplayToolRequestV2(input: {
  packet: ModelFacingTurnPacketV2;
  checklist: GmActionChecklistV2;
  stepId: string;
  request: unknown;
  handlers: GameplayToolHandlerRegistryV2;
  refRegistry?: GameplayRefRegistryV2;
  priorReceipts?: readonly GameplayRuntimeReceiptV2[];
  source?: GameplayRuntimeReceiptSourceV2;
  receiptId: string;
  emittedAt: number;
}): Promise<RuntimeExecutorResultV2> {
  const receiptSource = input.source ?? {
    kind: "gm_action_checklist" as const,
    checklistId: input.checklist.checklistId,
    stepId: input.stepId,
  };

  const requestValidation = validateGameplayToolRequestV2({
    packet: input.packet,
    checklist: input.checklist,
    stepId: input.stepId,
    candidate: input.request,
  });

  if (requestValidation.status !== "accepted") {
    return rejectedReceipt({
      receiptId: input.receiptId,
      rawCandidate: input.request,
      selectedStepId: input.stepId,
      baseWorldVersion: input.packet.baseWorldVersion,
      reason: requestValidation.issues.map((issue) => issue.message).join("; "),
      source: receiptSource,
      emittedAt: input.emittedAt,
    });
  }

  const request = requestValidation.request;
  const handler = input.handlers[request.toolId];
  if (!handler) {
    return failedReceipt({
      receiptId: input.receiptId,
      request,
      baseWorldVersion: input.packet.baseWorldVersion,
      reason: `No gameplay-cycle-v2 handler registered for ${request.toolId}.`,
      source: receiptSource,
      emittedAt: input.emittedAt,
    });
  }

  let rawOutcome: unknown;
  try {
    rawOutcome = await handler({
      packet: input.packet,
      checklist: input.checklist,
      request,
      refRegistry: input.refRegistry,
      priorReceipts: input.priorReceipts ?? [],
    });
  } catch (error) {
    return failedReceipt({
      receiptId: input.receiptId,
      request,
      baseWorldVersion: input.packet.baseWorldVersion,
      reason: error instanceof Error ? error.message : "Runtime handler threw an unknown error.",
      source: receiptSource,
      emittedAt: input.emittedAt,
    });
  }

  const outcomeParse = handlerOutcomeSchema.safeParse(rawOutcome);
  if (!outcomeParse.success) {
    return failedReceipt({
      receiptId: input.receiptId,
      request,
      baseWorldVersion: input.packet.baseWorldVersion,
      reason: `Runtime handler returned invalid outcome: ${outcomeParse.error.issues.map((issue) => issue.message).join("; ")}`,
      source: receiptSource,
      emittedAt: input.emittedAt,
    });
  }

  const outcome = outcomeParse.data;
  const outcomeContractFailure = validateOutcomeAgainstCapability({
    request,
    outcome,
    baseWorldVersion: input.packet.baseWorldVersion,
  });
  if (outcomeContractFailure) {
    return failedReceipt({
      receiptId: input.receiptId,
      request,
      baseWorldVersion: input.packet.baseWorldVersion,
      reason: outcomeContractFailure,
      source: receiptSource,
      emittedAt: input.emittedAt,
    });
  }

  const receipt = buildReceipt({
    receiptId: input.receiptId,
    request,
    rawCandidate: input.request,
    selectedStepId: input.stepId,
    baseWorldVersion: input.packet.baseWorldVersion,
    status: outcome.status,
    mutationApplied: outcome.mutationApplied,
    mutationAuthority: outcome.mutationApplied ? outcome.mutationAuthority : "none",
    resultWorldVersion: outcome.resultWorldVersion,
    visibleSummary: outcome.visibleSummary,
    evidenceRefs: outcome.evidenceRefs,
    durableEventIds: outcome.durableEventIds,
    failureReason: outcome.failureReason,
    source: receiptSource,
    emittedAt: input.emittedAt,
  });
  return { status: receipt.status, receipt };
}
