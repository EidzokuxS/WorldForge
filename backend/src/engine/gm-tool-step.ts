import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { getSqliteConnection } from "../db/index.js";
import { withSqliteWriteLock } from "../db/sqlite-write-lock.js";
import { createLogger, getErrorMessage, withRole } from "../lib/index.js";
import { executeToolCall, type ToolResult } from "./tool-executor.js";
import {
  executeBridgeCandidateTool,
  isBridgeLookupToolName,
} from "./bridge-candidate-tools.js";
import { isObservationToolResult } from "./tool-result.js";
import {
  dynamicCreationBudgetExceededError,
  dynamicCreationBudgetKey,
} from "./gm-tool-budget.js";
import {
  createPlayerTurnToolExecutionContext,
  validateToolInputGrounding,
  type ToolExecutionContext,
  type ToolGroundingIssue,
} from "./tool-execution-context.js";
import type { GmActionChecklist } from "./gm-action-checklist.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  buildModelFacingScenePromptView,
} from "./model-facing-scene.js";
import {
  sanitizeModelFacingConversationText,
  sanitizeModelFacingJson,
} from "./model-facing-conversation.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  canRuntimeToolSatisfyRequirement,
  isAcceptedRuntimeReceipt,
  runtimeRequirementPreparatoryTools,
  type RuntimeRequirementLike,
  runtimeToolHasRole,
  runtimeToolIsSideEffecting,
} from "./tool-contracts.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";
import {
  appliedStateEffectsFromDialoguePayload,
  DIALOGUE_STRUCTURAL_EFFECT_TOOLS,
  receiptBacksAppliedStateEffect,
  structuralStateReceiptFromToolCall,
} from "./dialogue-state-receipt.js";
import { retractDurableMemoryForRejectedSteps } from "./durable-side-effect-retraction.js";

const log = createLogger("gm-tool-step");
const GM_TOOL_STEP_MAX_CANDIDATE_REQUESTS = 8;

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];

export const gmToolStepCandidateRequestSchema = z
  .object({
    toolName: z.enum(runtimeToolNames),
    actorRef: z.string().trim().min(1).max(160).optional(),
    targetRefs: z.array(z.string().trim().min(1).max(160)).max(4).default([]),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((request, ctx) => {
    const schema = runtimeToolInputSchemas[request.toolName];
    const parsed = schema.safeParse(request.input);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: `candidateToolRequest.input does not satisfy ${request.toolName} runtime schema.`,
        path: ["input"],
      });
    }
  });

export type GmToolStepStatus = "done" | "skipped" | "revised";

export interface GmToolStepCandidateRequest {
  toolName: RuntimeToolName;
  actorRef?: string;
  targetRefs: string[];
  input: Record<string, unknown>;
}

export interface GmToolStepValidationError {
  code:
    | "missing_candidate"
    | "tool_not_allowed"
    | "private_term_leak"
    | "schema_invalid"
    | "grounding_invalid"
    | "tool_failed"
    | "semantic_budget_exceeded";
  message: string;
  path?: string;
  toolName?: RuntimeToolName | string;
}

export interface GmToolStepResult {
  stepId: string;
  attempt: number;
  status: GmToolStepStatus;
  toolName: RuntimeToolName | null;
  candidateInput: Record<string, unknown> | null;
  validationError: GmToolStepValidationError | null;
  visibleEffect: string;
  privateGuardTerms: string[];
  mutationRefs: string[];
  settledAtTick: number;
  result: ToolResult | null;
}

export interface ExecuteGmToolStepsArgs {
  campaignId: string;
  tick: number;
  frame: SceneFrame;
  checklist: GmActionChecklist;
  forbiddenPrivateTerms?: readonly string[];
  executionContext?: ToolExecutionContext;
  runtimeRequirement?: RuntimeRequirementLike | null;
  maxCandidateRequests?: number;
  reviseStep?: (input: {
    step: GmActionChecklist["steps"][number];
    attempt: number;
    validationError: GmToolStepValidationError;
  }) => Promise<GmToolStepCandidateRequest | null> | GmToolStepCandidateRequest | null;
}

type GmToolStepMutationBoundary = {
  readonly active: boolean;
  beginForTool(toolName: RuntimeToolName): void;
  commit(): void;
  rollback(): void;
};

let gmToolStepBoundaryCounter = 0;

function normalizePrivateTerm(value: string): string {
  return value.trim().toLowerCase();
}

function collectPrivateTermLeaks(value: unknown, forbiddenPrivateTerms: readonly string[]): string[] {
  const terms = forbiddenPrivateTerms.map(normalizePrivateTerm).filter(Boolean);
  if (terms.length === 0) return [];

  const leaks = new Set<string>();
  const visit = (entry: unknown): void => {
    if (typeof entry === "string") {
      const normalized = entry.toLowerCase();
      for (const term of terms) {
        if (normalized.includes(term)) {
          leaks.add(term);
        }
      }
      return;
    }
    if (Array.isArray(entry)) {
      entry.forEach(visit);
      return;
    }
    if (!entry || typeof entry !== "object") return;
    Object.values(entry).forEach(visit);
  };

  visit(value);
  return [...leaks];
}

export interface RunGmToolStepRevisionArgs {
  provider: ProviderConfig;
  frame: SceneFrame;
  checklist: GmActionChecklist;
  step: GmActionChecklist["steps"][number];
  validationError: GmToolStepValidationError;
  maxOutputTokens?: number;
}

function toCandidateRequest(
  request: GmActionChecklist["steps"][number]["candidateToolRequest"],
): GmToolStepCandidateRequest | null {
  if (!request) return null;
  return {
    toolName: request.toolName,
    actorRef: request.actorRef,
    targetRefs: [...request.targetRefs],
    input: { ...request.input },
  };
}

function schemaValidationError(
  request: GmToolStepCandidateRequest,
): GmToolStepValidationError | null {
  const schema = runtimeToolInputSchemas[request.toolName];
  const parsed = schema.safeParse(request.input);
  if (parsed.success) return null;
  return {
    code: "schema_invalid",
    message: `candidate input failed ${request.toolName} runtime schema.`,
    path: "candidateToolRequest.input",
    toolName: request.toolName,
  };
}

function groundingValidationError(
  request: GmToolStepCandidateRequest,
  context: ToolExecutionContext,
): GmToolStepValidationError | null {
  const issue: ToolGroundingIssue | null = validateToolInputGrounding({
    toolName: request.toolName,
    toolInput: request.input,
    context,
    pathPrefix: "candidateToolRequest.input",
  });
  if (!issue) return null;
  return {
    code: "grounding_invalid",
    message: issue.message,
    path: issue.path,
    toolName: issue.toolName ?? request.toolName,
  };
}

function validateCandidateRequest(
  request: GmToolStepCandidateRequest | null,
  context: ToolExecutionContext,
  allowedTools: ReadonlySet<RuntimeToolName>,
  forbiddenPrivateTerms: readonly string[],
): GmToolStepValidationError | null {
  if (!request) {
    return {
      code: "missing_candidate",
      message: "runtime_tool step is missing candidateToolRequest.",
    };
  }

  if (!allowedTools.has(request.toolName)) {
    return {
      code: "tool_not_allowed",
      message: `${request.toolName} is not allowed by the current SceneFrame.`,
      path: "candidateToolRequest.toolName",
      toolName: request.toolName,
    };
  }

  const leakedTerms = collectPrivateTermLeaks(request.input, forbiddenPrivateTerms);
  if (leakedTerms.length > 0) {
    return {
      code: "private_term_leak",
      message: "candidateToolRequest.input contains a private forbidden term.",
      path: "candidateToolRequest.input",
      toolName: request.toolName,
    };
  }

  return schemaValidationError(request) ?? groundingValidationError(request, context);
}

function mutationRefsFromToolResult(result: ToolResult): string[] {
  if (isObservationToolResult(result)) return [];
  const refs = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string" && value.trim()) {
      refs.add(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, entry] of Object.entries(value)) {
      if (/id|name|ref/i.test(key)) {
        visit(entry);
      }
    }
  };

  visit(result.result);
  return [...refs].slice(0, 12);
}

function createGmToolStepMutationBoundary(campaignId: string): GmToolStepMutationBoundary {
  gmToolStepBoundaryCounter += 1;
  const savepointName = `gm_tool_step_${gmToolStepBoundaryCounter}`;
  let active = false;
  let closed = false;

  const ensureActive = (): void => {
    if (closed || active) return;
    getSqliteConnection().exec(`SAVEPOINT ${savepointName}`);
    active = true;
    log.event("gm-tool-step.mutation-boundary.start", {
      campaignId,
      savepointName,
    });
  };

  const close = (mode: "commit" | "rollback"): void => {
    if (closed || !active) {
      closed = true;
      return;
    }
    const sqlite = getSqliteConnection();
    if (mode === "rollback") {
      sqlite.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
    }
    sqlite.exec(`RELEASE SAVEPOINT ${savepointName}`);
    closed = true;
    active = false;
    log.event("gm-tool-step.mutation-boundary.close", {
      campaignId,
      savepointName,
      mode,
    });
  };

  return {
    get active() {
      return active;
    },
    beginForTool(toolName) {
      if (runtimeToolIsSideEffecting(toolName)) {
        ensureActive();
      }
    },
    commit() {
      close("commit");
    },
    rollback() {
      close("rollback");
    },
  };
}

function checklistMayExecuteSideEffects(checklist: GmActionChecklist): boolean {
  return checklist.steps.some((step) => {
    const candidate = toCandidateRequest(step.candidateToolRequest);
    return candidate ? runtimeToolIsSideEffecting(candidate.toolName) : false;
  });
}

function checklistMayProduceSideEffects(input: {
  checklist: GmActionChecklist;
  reviseStep: ExecuteGmToolStepsArgs["reviseStep"] | undefined;
}): boolean {
  return checklistMayExecuteSideEffects(input.checklist) || Boolean(input.reviseStep);
}

function checklistPlansTerminalReceipt(checklist: GmActionChecklist): boolean {
  return checklist.steps.some((step) => {
    const candidate = toCandidateRequest(step.candidateToolRequest);
    return candidate ? runtimeToolHasRole(candidate.toolName, "terminal_receipt") : false;
  });
}

function structuralEffectsBackedByPriorStepReceipts(
  results: readonly GmToolStepResult[],
  dialogueResult: GmToolStepResult,
): boolean {
  const dialogueIndex = results.indexOf(dialogueResult);
  if (dialogueIndex < 0 || dialogueResult.toolName !== "record_dialogue_outcome") {
    return false;
  }
  const payload = dialogueResult.result?.result
    && typeof dialogueResult.result.result === "object"
    && !Array.isArray(dialogueResult.result.result)
    ? dialogueResult.result.result as Record<string, unknown>
    : null;
  const effects = appliedStateEffectsFromDialoguePayload(payload);
  return effects.length > 0
    && effects.every((effect) =>
      results.slice(0, dialogueIndex).some((priorResult) => {
        const receipt = structuralStateReceiptFromToolCall({
          toolName: priorResult.toolName,
          candidateInput: priorResult.candidateInput,
          result: priorResult.result,
        });
        return Boolean(receipt && receiptBacksAppliedStateEffect(receipt, effect));
      }));
}

function acceptedRuntimeReceiptResult(
  results: readonly GmToolStepResult[],
  result: GmToolStepResult,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  return isAcceptedRuntimeReceipt({
    toolName: result.toolName,
    result: result.result,
    requirement,
    appliedStructuralEffectsBacked: structuralEffectsBackedByPriorStepReceipts(results, result),
  });
}

function acceptedTerminalReceiptResult(
  results: readonly GmToolStepResult[],
  result: GmToolStepResult,
  requirement: RuntimeRequirementLike | null | undefined,
): boolean {
  return result.toolName !== null
    && runtimeToolHasRole(result.toolName, "terminal_receipt")
    && acceptedRuntimeReceiptResult(results, result, requirement);
}

function missingPlannedTerminalReceipt(
  checklist: GmActionChecklist,
  results: readonly GmToolStepResult[],
  requirement: RuntimeRequirementLike | null | undefined,
): RuntimeToolName | null {
  for (const step of checklist.steps) {
    const candidate = toCandidateRequest(step.candidateToolRequest);
    if (!candidate || !runtimeToolHasRole(candidate.toolName, "terminal_receipt")) continue;
    const result = results.find((entry) => entry.stepId === step.stepId);
    if (!result || !acceptedTerminalReceiptResult(results, result, requirement)) {
      return candidate.toolName;
    }
  }
  return null;
}

function resultHasSuccessfulSideEffect(result: GmToolStepResult): boolean {
  return Boolean(
    result.toolName
      && runtimeToolIsSideEffecting(result.toolName)
      && result.result?.success === true
      && result.result.status !== "failure"
      && !result.result.contractFailure
      && !isObservationToolResult(result.result),
  );
}

function missingRuntimeReceiptBoundary(
  results: readonly GmToolStepResult[],
  requirement: RuntimeRequirementLike | null | undefined,
): string | null {
  const successfulSideEffects = results.filter(resultHasSuccessfulSideEffect);
  if (successfulSideEffects.length === 0) return null;
  if (!requirement) {
    return "typed runtimeRequirement was not provided; rolled back legacy checklist side effects.";
  }
  const offender = successfulSideEffects.find((result) =>
    !sideEffectHasAcceptedReceiptBoundary(results, result, requirement));
  return offender
    ? `${offender.toolName ?? "side-effecting tool"} did not satisfy or feed an accepted runtime receipt for runtimeRequirement.kind=${requirement.kind}; rolled back legacy checklist side effects.`
    : null;
}

function sideEffectHasAcceptedReceiptBoundary(
  results: readonly GmToolStepResult[],
  result: GmToolStepResult,
  requirement: RuntimeRequirementLike,
): boolean {
  if (acceptedRuntimeReceiptResult(results, result, requirement)) {
    return true;
  }

  if (!result.toolName) return false;
  const resultIndex = results.indexOf(result);
  const laterResults = resultIndex >= 0 ? results.slice(resultIndex + 1) : [];

  if (
    requirement.kind === "dialogue_outcome"
    && DIALOGUE_STRUCTURAL_EFFECT_TOOLS.has(result.toolName)
  ) {
    return laterResults.some((laterResult) =>
      acceptedTerminalReceiptResult(results, laterResult, requirement));
  }

  if (
    result.toolName === "advance_time"
    && (requirement.kind === "state_mutation" || requirement.kind === "scene_beat")
  ) {
    return laterResults.some((laterResult) =>
      laterResult.toolName
      && canRuntimeToolSatisfyRequirement(laterResult.toolName, requirement)
      && acceptedRuntimeReceiptResult(results, laterResult, requirement));
  }

  const preparatoryTools = runtimeRequirementPreparatoryTools(requirement);
  if (preparatoryTools.includes(result.toolName)) {
    return laterResults.some((laterResult) =>
      laterResult.toolName
      && canRuntimeToolSatisfyRequirement(laterResult.toolName, requirement)
      && acceptedRuntimeReceiptResult(results, laterResult, requirement));
  }

  return false;
}

function failedSideEffectingToolResult(
  results: readonly GmToolStepResult[],
): GmToolStepResult | null {
  return results.find((result) =>
    result.toolName
      && runtimeToolIsSideEffecting(result.toolName)
      && result.status === "skipped"
      && result.validationError?.code === "tool_failed") ?? null;
}

function rollbackSideEffectResults(input: {
  results: readonly GmToolStepResult[];
  reason: string;
}): GmToolStepResult[] {
  return input.results.map((result) => {
    if (
      result.toolName
      && runtimeToolIsSideEffecting(result.toolName)
      && result.result?.success === true
      && result.status !== "skipped"
    ) {
      return {
        ...result,
        status: "skipped",
        validationError: {
          code: "tool_failed",
          message: input.reason,
          toolName: result.toolName,
        },
        visibleEffect: "",
        mutationRefs: [],
        result: null,
      };
    }
    return result;
  });
}

function buildSkippedResult(input: {
  step: GmActionChecklist["steps"][number];
  attempt: number;
  candidate: GmToolStepCandidateRequest | null;
  validationError: GmToolStepValidationError;
  tick: number;
}): GmToolStepResult {
  return {
    stepId: input.step.stepId,
    attempt: input.attempt,
    status: "skipped",
    toolName: input.candidate?.toolName ?? null,
    candidateInput: input.candidate?.input ?? null,
    validationError: input.validationError,
    visibleEffect: "",
    privateGuardTerms: [],
    mutationRefs: [],
    settledAtTick: input.tick,
    result: null,
  };
}

async function executeSingleStep(input: {
  campaignId: string;
  tick: number;
  step: GmActionChecklist["steps"][number];
  context: ToolExecutionContext;
  allowedTools: ReadonlySet<RuntimeToolName>;
  forbiddenPrivateTerms: readonly string[];
  remainingCandidateRequests: number;
  mutationBoundary?: GmToolStepMutationBoundary;
  reviseStep?: ExecuteGmToolStepsArgs["reviseStep"];
}): Promise<{ result: GmToolStepResult; candidateRequestCount: number }> {
  if (input.step.requiredAction !== "runtime_tool") {
    return {
      candidateRequestCount: 0,
      result: {
        stepId: input.step.stepId,
        attempt: 1,
        status: "skipped",
        toolName: null,
        candidateInput: null,
        validationError: {
          code: "missing_candidate",
          message: `${input.step.requiredAction} steps are deferred to later orchestration.`,
        },
        visibleEffect: "",
        privateGuardTerms: [],
        mutationRefs: [],
        settledAtTick: input.tick,
        result: null,
      },
    };
  }

  let candidate = toCandidateRequest(input.step.candidateToolRequest);
  let candidateRequestCount = candidate ? 1 : 0;
  let validationError = validateCandidateRequest(
    candidate,
    input.context,
    input.allowedTools,
    input.forbiddenPrivateTerms,
  );
  let attempt = 1;

  if (
    validationError
    && input.reviseStep
    && candidateRequestCount < input.remainingCandidateRequests
  ) {
    let revised: GmToolStepCandidateRequest | null = null;
    try {
      revised = await input.reviseStep({
        step: input.step,
        attempt: 2,
        validationError,
      });
    } catch (error) {
      validationError = {
        ...validationError,
        message: `${validationError.message} Revision failed: ${getErrorMessage(
          error,
          "GM tool-step revision failed.",
        )}`,
      };
    }
    if (revised) {
      candidate = revised;
      attempt = 2;
      candidateRequestCount += 1;
      validationError = validateCandidateRequest(
        candidate,
        input.context,
        input.allowedTools,
        input.forbiddenPrivateTerms,
      );
    }
  }

  if (validationError || !candidate) {
    return {
      candidateRequestCount,
      result: buildSkippedResult({
        step: input.step,
        attempt,
        candidate,
        validationError: validationError ?? {
          code: "missing_candidate",
          message: "runtime_tool step has no executable candidate after revision.",
        },
        tick: input.tick,
      }),
    };
  }

  input.mutationBoundary?.beginForTool(candidate.toolName);
  const result = isBridgeLookupToolName(candidate.toolName)
    ? executeBridgeCandidateTool(candidate.toolName, candidate.input, input.context)
    : await executeToolCall(
        input.campaignId,
        candidate.toolName,
        candidate.input,
        input.tick,
        undefined,
        input.context,
      );

  if (!result.success) {
    let toolRevisionError: string | null = null;
    if (
      input.reviseStep
      && attempt === 1
      && candidateRequestCount < input.remainingCandidateRequests
    ) {
      const toolFailure: GmToolStepValidationError = {
        code: "tool_failed",
        message: result.error ?? `${candidate.toolName} failed.`,
        toolName: candidate.toolName,
      };
      let revised: GmToolStepCandidateRequest | null = null;
      try {
        revised = await input.reviseStep({
          step: input.step,
          attempt: 2,
          validationError: toolFailure,
        });
      } catch (error) {
        toolRevisionError = getErrorMessage(error, "GM tool-step revision failed.");
      }
      if (revised) {
        candidateRequestCount += 1;
        const revisedValidationError = validateCandidateRequest(
          revised,
          input.context,
          input.allowedTools,
          input.forbiddenPrivateTerms,
        );
        if (!revisedValidationError) {
          input.mutationBoundary?.beginForTool(revised.toolName);
          const revisedResult = isBridgeLookupToolName(revised.toolName)
            ? executeBridgeCandidateTool(revised.toolName, revised.input, input.context)
            : await executeToolCall(
                input.campaignId,
                revised.toolName,
                revised.input,
                input.tick,
                undefined,
                input.context,
              );
          if (revisedResult.success) {
            return {
              candidateRequestCount,
              result: {
                stepId: input.step.stepId,
                attempt: 2,
                status: "revised",
                toolName: revised.toolName,
                candidateInput: revised.input,
                validationError: null,
                visibleEffect: input.step.expectedVisibleEffect,
                privateGuardTerms: [...input.forbiddenPrivateTerms],
                mutationRefs: mutationRefsFromToolResult(revisedResult),
                settledAtTick: input.tick,
                result: revisedResult,
              },
            };
          }
        }
      }
    }

    return {
      candidateRequestCount,
      result: buildSkippedResult({
        step: input.step,
        attempt,
        candidate,
        validationError: {
          code: "tool_failed",
          message: toolRevisionError
            ? `${result.error ?? `${candidate.toolName} failed.`} Revision failed: ${toolRevisionError}`
            : result.error ?? `${candidate.toolName} failed.`,
          toolName: candidate.toolName,
        },
        tick: input.tick,
      }),
    };
  }

  return {
    candidateRequestCount,
    result: {
      stepId: input.step.stepId,
      attempt,
      status: attempt > 1 ? "revised" : "done",
      toolName: candidate.toolName,
      candidateInput: candidate.input,
      validationError: null,
      visibleEffect: input.step.expectedVisibleEffect,
      privateGuardTerms: [...input.forbiddenPrivateTerms],
      mutationRefs: mutationRefsFromToolResult(result),
      settledAtTick: input.tick,
      result,
    },
  };
}

export async function executeGmToolSteps(
  args: ExecuteGmToolStepsArgs,
): Promise<GmToolStepResult[]> {
  const runSteps = async (
    mutationBoundary?: GmToolStepMutationBoundary,
  ): Promise<GmToolStepResult[]> => {
    const context = args.executionContext ?? createPlayerTurnToolExecutionContext(args.frame);
    const allowedTools = new Set(args.frame.allowedTools);
    const forbiddenPrivateTerms = args.forbiddenPrivateTerms ?? [];
    const maxCandidateRequests = args.maxCandidateRequests ?? GM_TOOL_STEP_MAX_CANDIDATE_REQUESTS;
    let candidateRequestCount = 0;
    const results: GmToolStepResult[] = [];
    const skippedStepIds = new Set<string>();
    const dynamicCreationKeys = new Set<string>();

    for (const step of args.checklist.steps) {
      if (candidateRequestCount >= maxCandidateRequests) {
        const result = buildSkippedResult({
          step,
          attempt: 1,
          candidate: toCandidateRequest(step.candidateToolRequest),
          validationError: {
            code: "missing_candidate",
            message: `Candidate request limit ${maxCandidateRequests} reached.`,
          },
          tick: args.tick,
        });
        results.push(result);
        skippedStepIds.add(step.stepId);
        continue;
      }

      const blockedDependency = step.dependsOnStepIds.find((stepId) => skippedStepIds.has(stepId));
      if (blockedDependency) {
        const result = buildSkippedResult({
          step,
          attempt: 1,
          candidate: toCandidateRequest(step.candidateToolRequest),
          validationError: {
            code: "missing_candidate",
            message: `Dependency ${blockedDependency} was skipped.`,
          },
          tick: args.tick,
        });
        results.push(result);
        skippedStepIds.add(step.stepId);
        continue;
      }

      const candidate = toCandidateRequest(step.candidateToolRequest);
      const dynamicKey = dynamicCreationBudgetKey(candidate);
      if (dynamicKey && dynamicCreationKeys.has(dynamicKey)) {
        const result = buildSkippedResult({
          step,
          attempt: 1,
          candidate,
          validationError: {
            code: "semantic_budget_exceeded",
            message: dynamicCreationBudgetExceededError(),
            path: "candidateToolRequest.input",
            toolName: candidate?.toolName,
          },
          tick: args.tick,
        });
        results.push(result);
        skippedStepIds.add(step.stepId);
        continue;
      }

      const executed = await executeSingleStep({
        campaignId: args.campaignId,
        tick: args.tick,
        step,
        context,
        allowedTools,
        forbiddenPrivateTerms,
        remainingCandidateRequests: Math.max(0, maxCandidateRequests - candidateRequestCount),
        mutationBoundary,
        reviseStep: args.reviseStep,
      });
      candidateRequestCount += executed.candidateRequestCount;
      const result = executed.result;
      results.push(result);
      const executedKey = dynamicCreationBudgetKey(
        result.toolName && result.candidateInput
          ? {
              toolName: result.toolName,
              input: result.candidateInput,
            }
          : null,
      );
      if (executedKey && (result.status === "done" || result.status === "revised")) {
        dynamicCreationKeys.add(executedKey);
      }
      if (result.status === "skipped") {
        skippedStepIds.add(step.stepId);
      }
      log.event("gm-tool-step.result", {
        checklistVersion: args.checklist.version,
        stepId: result.stepId,
        attempt: result.attempt,
        status: result.status,
        toolName: result.toolName,
        validationErrorCode: result.validationError?.code ?? null,
        mutationRefCount: result.mutationRefs.length,
        settledAtTick: result.settledAtTick,
        candidateRequestCount,
      });
    }

    return results;
  };

  if (!checklistMayProduceSideEffects({
    checklist: args.checklist,
    reviseStep: args.reviseStep,
  })) {
    return await runSteps();
  }

  const mutationBoundary = createGmToolStepMutationBoundary(args.campaignId);
  return await withSqliteWriteLock(`gm-tool-step:${args.campaignId}`, async () => {
    try {
      const results = await runSteps(mutationBoundary);
      const missingTerminalReceipt = checklistPlansTerminalReceipt(args.checklist)
        ? missingPlannedTerminalReceipt(args.checklist, results, args.runtimeRequirement)
        : null;
      const missingRuntimeReceipt = missingRuntimeReceiptBoundary(results, args.runtimeRequirement);
      const failedSideEffect = failedSideEffectingToolResult(results);
      if ((missingTerminalReceipt || missingRuntimeReceipt || failedSideEffect) && mutationBoundary.active) {
        const reason = missingTerminalReceipt
          ? `${missingTerminalReceipt} terminal receipt was not accepted; rolled back legacy checklist side effects.`
          : missingRuntimeReceipt
            ? missingRuntimeReceipt
          : `${failedSideEffect?.toolName ?? "side-effecting tool"} failed; rolled back legacy checklist side effects.`;
        mutationBoundary.rollback();
        await retractDurableMemoryForRejectedSteps({
          campaignId: args.campaignId,
          stepResults: results,
          reason,
          source: "rejected_gm_tool_step",
        });
        return rollbackSideEffectResults({ results, reason });
      }
      mutationBoundary.commit();
      return results;
    } catch (error) {
      try {
        mutationBoundary.rollback();
      } catch (rollbackError) {
        log.warn("Failed to rollback GM tool-step mutation boundary", {
          campaignId: args.campaignId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      throw error;
    }
  });
}

export async function runGmToolStepRevision(
  args: RunGmToolStepRevisionArgs,
): Promise<GmToolStepCandidateRequest | null> {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const promptView = buildModelFacingScenePromptView(scenePacket.view);
  const sanitizeForRepair = (value: unknown) =>
    JSON.stringify(
      sanitizeModelFacingJson(value, {
        safety: scenePacket.safety,
        maxChars: 500,
      }),
      null,
      2,
    );
  log.event("model-facing.scene-packet", {
    source: "gm-tool-step-revision",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model: createModel(args.provider, { role: "judge" }),
      schema: gmToolStepCandidateRequestSchema,
      system: [
        "You revise exactly one rejected GM runtime tool candidate.",
        "Return one candidateToolRequest JSON object only.",
        "Use the same step purpose and expected visible effect.",
        "Use only model-facing refs and allowed tools.",
        "Keep the revision as the smallest legal backend action that preserves the playable beat.",
        "Do not rescue an illegal player claim by inventing evidence, possession, access, consent, or a remote ref.",
        "Do not narrate, plan extra steps, invent backend IDs, or write state deltas.",
      ].join(" "),
      prompt: [
        "REJECTED CHECKLIST STEP",
        sanitizeForRepair(args.step),
        "",
        "BACKEND VALIDATION ERROR",
        sanitizeForRepair(args.validationError),
        "",
        "CHECKLIST TURN INTENT",
        sanitizeModelFacingConversationText(args.checklist.turnIntent, {
          safety: scenePacket.safety,
          maxChars: 1000,
        }),
        "",
        "MODEL-FACING SCENE VIEW",
        JSON.stringify(promptView, null, 2),
        "",
        "ALLOWED TOOLS FROM frame.allowedTools",
        args.frame.allowedTools.length > 0
          ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
          : "- none",
      ].join("\n"),
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 700,
      retries: 0,
    }),
  );

  return result.object;
}
