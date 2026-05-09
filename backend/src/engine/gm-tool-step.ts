import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, getErrorMessage, withRole } from "../lib/index.js";
import { executeToolCall, type ToolResult } from "./tool-executor.js";
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
} from "./model-facing-scene.js";
import type { SceneFrame } from "./scene-frame.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

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
  maxCandidateRequests?: number;
  reviseStep?: (input: {
    step: GmActionChecklist["steps"][number];
    attempt: number;
    validationError: GmToolStepValidationError;
  }) => Promise<GmToolStepCandidateRequest | null> | GmToolStepCandidateRequest | null;
}

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

  const result = await executeToolCall(
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
          const revisedResult = await executeToolCall(
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
}

export async function runGmToolStepRevision(
  args: RunGmToolStepRevisionArgs,
): Promise<GmToolStepCandidateRequest | null> {
  const scenePacket = buildModelFacingScenePacket(args.frame);
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
        JSON.stringify(args.step, null, 2),
        "",
        "BACKEND VALIDATION ERROR",
        JSON.stringify(args.validationError, null, 2),
        "",
        "CHECKLIST TURN INTENT",
        args.checklist.turnIntent,
        "",
        "MODEL-FACING SCENE VIEW",
        JSON.stringify(scenePacket.view, null, 2),
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
