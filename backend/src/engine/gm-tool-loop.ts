import { stepCountIs, type StopCondition } from "ai";

import { generateText } from "../ai/raindrop-workshop.js";
import { extractReasoningText } from "../ai/extract-reasoning-text.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { getSqliteConnection } from "../db/index.js";
import { withSqliteWriteLock } from "../db/sqlite-write-lock.js";
import { createLogger, withRole } from "../lib/index.js";
import type { OracleResult } from "./oracle.js";
import {
  collectToolCalls,
  extractToolResultPayload,
  type CollectedToolCall,
} from "./parse-helpers.js";
import type { GmRead } from "./gm-turn-read.js";
import {
  grantsClaimedAccessFromUnconfirmedProof,
  isUnconfirmedAccessProofClaim,
  UNCONFIRMED_ACCESS_CLAIM_TOOL_ERROR,
} from "./player-action-epistemics.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  oracleContextForModelPrompt,
  oracleResultForModelPrompt,
  type ModelFacingSceneView,
  redactModelFacingJson,
  type ModelFacingPromptSafety,
} from "./model-facing-scene.js";
import {
  formatModelFacingPlayerActionText,
  formatModelFacingRecentConversation,
  sanitizeModelFacingConversationText,
} from "./model-facing-conversation.js";
import {
  normalizeModelFacingAllowedTools,
  type SceneFrame,
} from "./scene-frame.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createPlayerTurnToolExecutionContext,
  type DialogueAddressedTargetInput,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { createStorytellerTools, type RuntimeToolName } from "./tool-schemas.js";
import type { ToolResult } from "./tool-executor.js";
import { isObservationToolResult, toModelVisibleToolResult } from "./tool-result.js";
import {
  buildRuntimeReceiptPlan,
  canRuntimeToolSatisfyRequirement,
  canRuntimeToolSatisfyReceiptPlan,
  dialogueOutcomeSatisfiesStructuralRequirement,
  isAcceptedRuntimeReceipt,
  isAcceptedRuntimeReceiptForPlan,
  isAcceptedTerminalToolResult,
  isRuntimeToolName,
  requiredTerminalToolForRuntimeRequirement,
  runtimeRequirementPreparatoryTools,
  runtimeRequirementStateEffectKinds,
  runtimeRequirementStateMutationTools,
  runtimeToolHasRole,
  runtimeToolIsSideEffecting,
  type RuntimeRequirementLike,
} from "./tool-contracts.js";
import {
  attachStructuralStateReceiptsToToolResult,
  appliedStateEffectsFromDialoguePayload,
  DIALOGUE_STRUCTURAL_EFFECT_TOOLS,
  dialogueStateTokenAliases,
  receiptBacksAppliedStateEffect,
  resolveAppliedStateEffectFromReceipt,
  structuralStateReceiptFromToolCall,
} from "./dialogue-state-receipt.js";
import type { GmToolStepResult } from "./gm-tool-step.js";
import {
  dynamicCreationBudgetExceededError,
  dynamicCreationBudgetKey,
} from "./gm-tool-budget.js";
import {
  durableMemoryDetailsFromRejectedStep,
  retractDurableMemoryForRejectedSteps,
} from "./durable-side-effect-retraction.js";
import {
  scopedForecastForModelPrompt,
  type ScopedForecastExcerpt,
} from "./world-forecast.js";
import { playerBlockingStageLimit } from "./runtime-limits.js";

const log = createLogger("gm-tool-loop");

export const GM_TOOL_LOOP_MAX_STEPS = 12;
export const GM_TOOL_LOOP_TRANSPORT_MAX_RETRIES = 3;
export const GM_TOOL_LOOP_TIMEOUT_MS = playerBlockingStageLimit("WORLDFORGE_GM_TOOL_LOOP_TIMEOUT_MS");
export const GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS = readRuntimePositiveInteger(
  ["WORLDFORGE_GM_TOOL_LOOP_MAX_OUTPUT_TOKENS", "WF_GM_TOOL_LOOP_MAX_OUTPUT_TOKENS"],
  2_048,
);
export const GM_TOOL_LOOP_STATUS_READ_MAX_STEPS = 4;
export const GM_TOOL_LOOP_STATUS_READ_TIMEOUT_MS = playerBlockingStageLimit(
  "WORLDFORGE_GM_TOOL_LOOP_STATUS_READ_TIMEOUT_MS",
);
export const GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS = readRuntimePositiveInteger(
  [
    "WORLDFORGE_GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS",
    "WF_GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS",
  ],
  2_048,
);
export const GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS = 6;
export const GM_TOOL_LOOP_TERMINAL_CLOSURE_MAX_STEPS = 2;
export const GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS = playerBlockingStageLimit(
  [
    "WORLDFORGE_GM_TOOL_LOOP_PROCEDURAL_TIMEOUT_MS",
    "WORLDFORGE_GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS",
  ],
);
export const GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS = readRuntimePositiveInteger(
  [
    "WORLDFORGE_GM_TOOL_LOOP_PROCEDURAL_MAX_OUTPUT_TOKENS",
    "WORLDFORGE_GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS",
    "WF_GM_TOOL_LOOP_PROCEDURAL_MAX_OUTPUT_TOKENS",
    "WF_GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS",
  ],
  4_096,
);
export const GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL = "OBSERVATION_COMPLETE";

const GM_TOOL_LOOP_SEQUENTIAL_TOOL_PROVIDER_OPTIONS = {
  openai: {
    parallelToolCalls: false,
  },
  anthropic: {
    disableParallelToolUse: true,
  },
} satisfies NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>;

type GmToolLoopProfileName =
  | "default_runtime_execution"
  | "broad_status_read_observation"
  | "procedural_conversation_outcome"
  | "world_fact_recording";

type RequiredTerminalToolName = "record_dialogue_outcome" | "record_world_fact";

interface GmToolLoopProfile {
  name: GmToolLoopProfileName;
  activeTools: RuntimeToolName[];
  maxSteps: number;
  timeoutMs: number;
  maxOutputTokens: number;
  requiredTerminalTool?: RequiredTerminalToolName;
}

function readRuntimePositiveInteger(envNames: string | readonly string[], defaultValue: number): number {
  const names = Array.isArray(envNames) ? envNames : [envNames];
  for (const name of names) {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === "") continue;

    const value = Number(raw.trim());
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`${name} must be a positive integer, got "${raw}".`);
    }
    return value;
  }

  return defaultValue;
}

const STATUS_READ_OBSERVATION_TOOLS = new Set<RuntimeToolName>([
  "list_visible_affordances",
  "list_navigation_options",
  "find_location_candidates",
  "find_object_candidates",
  "find_actor_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "check_route",
]);

const PROCEDURAL_CONVERSATION_TOOLS = new Set<RuntimeToolName>([
  "list_visible_affordances",
  "find_object_candidates",
  "find_actor_candidates",
  "inspect_known_fact",
  "create_scene_extra",
  "record_dialogue_outcome",
  "advance_time",
]);
const WORLD_FACT_RECORDING_TOOLS = new Set<RuntimeToolName>([
  "list_visible_affordances",
  "find_object_candidates",
  "find_actor_candidates",
  "find_location_candidates",
  "inspect_known_fact",
  "record_world_fact",
  "advance_time",
]);
const TERMINAL_SEMANTIC_RECEIPT_TOOLS = new Set<RuntimeToolName>([
  "record_dialogue_outcome",
  "record_world_fact",
]);

export interface RunGmToolLoopArgs {
  campaignId: string;
  provider: ProviderConfig;
  tick: number;
  playerAction: string;
  frame: SceneFrame;
  gmRead: Extract<GmRead, { path: "tool_plan" | "roll_oracle" | "combat_transition" }>;
  oracleResult?: OracleResult | null;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  recentConversation?: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}

export interface GmToolLoopResult {
  intent: string;
  text: string;
  observationSummary?: string;
  reasoningText?: string;
  stepResults: GmToolStepResult[];
  acceptedStepIds: string[];
  acceptedToolResultIds: string[];
  rawToolCalls: CollectedToolCall[];
}

function filterToolsToAllowed(
  tools: ReturnType<typeof createStorytellerTools>,
  allowedTools: readonly RuntimeToolName[],
): Partial<ReturnType<typeof createStorytellerTools>> {
  const allowed = new Set<RuntimeToolName>(allowedTools);
  return Object.fromEntries(
    Object.entries(tools).filter(([toolName]) => allowed.has(toolName as RuntimeToolName)),
  ) as Partial<ReturnType<typeof createStorytellerTools>>;
}

type StorytellerToolSet = ReturnType<typeof createStorytellerTools>;
type StorytellerToolDef = StorytellerToolSet[keyof StorytellerToolSet];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function stringArrayField(record: Record<string, unknown>, field: string): string[] {
  const value = record[field];
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    : [];
}

function uniqueNonEmptyStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizePrivateGuardTerm(value: string): string {
  return value.trim().toLowerCase();
}

function collectInputStrings(value: unknown, output: string[] = []): string[] {
  if (typeof value === "string") {
    if (value.trim()) output.push(value);
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectInputStrings(entry, output));
    return output;
  }
  if (!isRecord(value)) return output;
  Object.values(value).forEach((entry) => collectInputStrings(entry, output));
  return output;
}

function toolInputContainsForbiddenPrivateTerm(
  input: unknown,
  forbiddenPrivateTerms: readonly string[],
): boolean {
  const normalizedTerms = forbiddenPrivateTerms
    .map(normalizePrivateGuardTerm)
    .filter(Boolean);
  if (normalizedTerms.length === 0) return false;
  return collectInputStrings(input).some((text) => {
    const normalizedText = text.toLowerCase();
    return normalizedTerms.some((term) => normalizedText.includes(term));
  });
}

function privateSourceBoundaryToolInputError(): string {
  return [
    "private_source_boundary_term_in_tool_input",
    "Tool input copied private/source-boundary wording into a state mutation.",
    "Rewrite using only visible/public terms or player-sourced claim wording; do not repeat hidden forecast terms.",
  ].join(": ");
}

function withPrivateSourceBoundaryGuard(
  tools: Partial<StorytellerToolSet>,
  forbiddenPrivateTerms: readonly string[],
): Partial<StorytellerToolSet> {
  if (forbiddenPrivateTerms.length === 0) return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function") {
        return [toolName, toolDef];
      }

      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          if (toolInputContainsForbiddenPrivateTerm(input, forbiddenPrivateTerms)) {
            return {
              success: false,
              error: privateSourceBoundaryToolInputError(),
            };
          }

          const result = await originalExecute(input, ...rest);
          return isToolResult(result)
            ? result
            : malformedToolResult(
                "Tool result was not returned by the runtime source-boundary guard.",
                toolName,
              );
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function proceduralConversationDialogueOutcomeError(): string {
  return [
    "procedural_conversation_dialogue_outcome_requires_structural_durable_result",
    "Reusable procedural, safety, route, proof, permission, warning, office, or unavailable-role dialogue outcomes must be recorded with record_dialogue_outcome using structured outcomeKind/topicKind/authorityKind/truthStatus fields.",
    "Retry with the grounded answer, refusal, silence, warning, redirect, or unavailable-role outcome as durable record_dialogue_outcome with futureUseKind and futureRelevance.",
  ].join(": ");
}

function dialogueOutcomeDurabilityExceedsRuntimeRequirementError(): string {
  return [
    "dialogue_outcome_durability_exceeds_runtime_requirement",
    "record_dialogue_outcome durability=durable cannot satisfy GM Read runtimeRequirement.durability=scene_local.",
    "GM Read owns durable-vs-scene-local classification. Retry with scene_local for this local exchange, or GM Read must be repaired to require durable when the answer should matter later.",
  ].join(": ");
}

function runtimeRequirementTopicError(input: {
  toolName: RuntimeToolName;
  requiredTopicKind: string;
  actualTopicKind: string | null;
}): string {
  return [
    "runtime_requirement_topic_mismatch",
    `${input.toolName} must match GM Read runtimeRequirement.topicKind=${input.requiredTopicKind}.`,
    `Received topicKind=${input.actualTopicKind ?? "missing"}.`,
    "Retry with the same contract kind and the required topicKind; do not satisfy it through another topic or prose.",
  ].join(": ");
}

function withProceduralConversationOutcomeGuard(
  tools: Partial<StorytellerToolSet>,
  args: RunGmToolLoopArgs,
): Partial<StorytellerToolSet> {
  const guardedTools: Partial<StorytellerToolSet> = {
    ...tools,
  };

  const dialogueToolDef = tools.record_dialogue_outcome;
  if (dialogueToolDef && typeof dialogueToolDef.execute === "function") {
    const originalExecute = dialogueToolDef.execute.bind(dialogueToolDef) as (...args: unknown[]) => unknown;
    guardedTools.record_dialogue_outcome = {
      ...dialogueToolDef,
      async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
        const candidateInput = isRecord(input) ? input : {};
        const durability = stringField(candidateInput, "durability");
        const futureUseKind = stringField(candidateInput, "futureUseKind");
        const futureRelevance = stringField(candidateInput, "futureRelevance");
        const topicKind = stringField(candidateInput, "topicKind");
        const requirement = gmReadRuntimeRequirement(args);
        if (
          requirement?.kind === "dialogue_outcome"
          && requirement.topicKind
          && topicKind !== requirement.topicKind
        ) {
          return {
            success: false,
            error: runtimeRequirementTopicError({
              toolName: "record_dialogue_outcome",
              requiredTopicKind: requirement.topicKind,
              actualTopicKind: topicKind,
            }),
          };
        }
        if (
          requirement?.kind === "dialogue_outcome"
          && requirement.durability === "durable"
          && (durability !== "durable" || !futureUseKind || !futureRelevance)
        ) {
          return {
            success: false,
            error: proceduralConversationDialogueOutcomeError(),
          };
        }
        if (
          requirement?.kind === "dialogue_outcome"
          && requirement.durability === "scene_local"
          && durability === "durable"
        ) {
          const error = dialogueOutcomeDurabilityExceedsRuntimeRequirementError();
          return {
            success: false,
            status: "failure",
            error,
            contractFailure: {
              code: "dialogue_outcome_durability_exceeds_runtime_requirement",
              toolName: "record_dialogue_outcome",
              terminalKind: "dialogue_outcome",
              retryable: true,
              message: error,
            },
          };
        }

        const result = await originalExecute(input, ...rest);
        return isToolResult(result)
          ? result
          : malformedToolResult(
              "Tool result was not returned by the procedural dialogue outcome guard.",
              "record_dialogue_outcome",
            );
      },
    } as typeof dialogueToolDef;
  }

  const logEventToolDef = tools.log_event;
  if (
    isConversationalToolLoop(args)
    && logEventToolDef
    && typeof logEventToolDef.execute === "function"
  ) {
    guardedTools.log_event = {
      ...logEventToolDef,
      async execute(): Promise<ToolResult> {
        return {
          success: false,
          error: [
            "procedural_conversation_requires_record_dialogue_outcome",
            "Do not use log_event to satisfy an NPC answer/refusal/silence/warning outcome.",
            "Retry with record_dialogue_outcome so outcomeKind/topicKind/authorityKind/truthStatus carry the semantics.",
          ].join(": "),
        };
      },
    } as typeof logEventToolDef;
  }

  return guardedTools;
}

function withWorldFactRequirementGuard(
  tools: Partial<StorytellerToolSet>,
  args: RunGmToolLoopArgs,
): Partial<StorytellerToolSet> {
  const worldFactToolDef = tools.record_world_fact;
  if (!worldFactToolDef || typeof worldFactToolDef.execute !== "function") return tools;

  const guardedTools: Partial<StorytellerToolSet> = {
    ...tools,
  };
  const originalExecute = worldFactToolDef.execute.bind(worldFactToolDef) as (...args: unknown[]) => unknown;
  guardedTools.record_world_fact = {
    ...worldFactToolDef,
    async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
      const candidateInput = isRecord(input) ? input : {};
      const topicKind = stringField(candidateInput, "topicKind");
      const requirement = gmReadRuntimeRequirement(args);
      if (
        requirement?.kind === "world_fact"
        && requirement.topicKind
        && topicKind !== requirement.topicKind
      ) {
        return {
          success: false,
          error: runtimeRequirementTopicError({
            toolName: "record_world_fact",
            requiredTopicKind: requirement.topicKind,
            actualTopicKind: topicKind,
          }),
        };
      }

      const result = await originalExecute(input, ...rest);
      return isToolResult(result)
        ? result
        : malformedToolResult(
            "Tool result was not returned by the world fact requirement guard.",
            "record_world_fact",
          );
    },
  } as typeof worldFactToolDef;

  return guardedTools;
}

function runtimeRequirementToolMismatchError(input: {
  toolName: RuntimeToolName;
  requirement: NonNullable<GmRead["runtimeRequirement"]>;
}): string {
  const requiredTool = requiredTerminalToolForRuntimeRequirement(input.requirement);
  return [
    "runtime_requirement_tool_mismatch",
    `${input.toolName} cannot satisfy GM Read runtimeRequirement.kind=${input.requirement.kind}.`,
    requiredTool
      ? `Required receipt tool: ${requiredTool}.`
      : "Required receipt tool: a tool whose typed contract satisfies this runtimeRequirement.",
    "Retry with a compatible receipt tool; use helper observation tools first only when refs are missing.",
  ].join(": ");
}

function canRunBeforeRequiredReceipt(
  toolName: RuntimeToolName,
  requirement: NonNullable<GmRead["runtimeRequirement"]>,
): boolean {
  const receiptPlan = buildRuntimeReceiptPlan(requirement);
  if (canRuntimeToolSatisfyReceiptPlan(toolName, receiptPlan)) return true;
  if (runtimeRequirementPreparatoryTools(requirement).includes(toolName)) return true;
  if (runtimeRequirementStateMutationTools(requirement).includes(toolName)) return true;
  if (runtimeToolHasRole(toolName, "helper_observation")) return true;

  if (requirement.kind === "dialogue_outcome") {
    if (toolName === "create_scene_extra") return true;
    return false;
  }

  return false;
}

function withRuntimeRequirementReceiptGuard(
  tools: Partial<StorytellerToolSet>,
  args: RunGmToolLoopArgs,
): Partial<StorytellerToolSet> {
  const requirement = gmReadRuntimeRequirement(args);
  if (!requirement || requirement.kind === "observation_read") return tools;

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function" || !isRuntimeToolName(toolName)) {
        return [toolName, toolDef];
      }
      if (canRunBeforeRequiredReceipt(toolName, requirement)) {
        return [toolName, toolDef];
      }

      const error = runtimeRequirementToolMismatchError({
        toolName,
        requirement,
      });
      const guardedTool = {
        ...toolDef,
        async execute(): Promise<ToolResult> {
          return {
            success: false,
            status: "failure",
            error,
            contractFailure: {
              code: "runtime_requirement_tool_mismatch",
              toolName,
              terminalKind: requirement.kind,
              retryable: true,
              message: error,
            },
          };
        },
      } as StorytellerToolDef;

      return [toolName, guardedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

type GmToolLoopMutationBoundary = {
  readonly trackedStepResults: readonly GmToolStepResult[];
  readonly taintedReason: string | null;
  beginForTool(toolName: RuntimeToolName): void;
  taint(reason: string): void;
  assertCanCommit(): void;
  commit(): void;
  rollback(): void;
  trackToolResult(input: {
    tick: number;
    toolName: RuntimeToolName;
    candidateInput: unknown;
    result: ToolResult;
  }): void;
};

let gmToolLoopBoundaryCounter = 0;

function shouldUseGmToolLoopMutationBoundary(toolName: RuntimeToolName): boolean {
  return runtimeToolIsSideEffecting(toolName);
}

function createGmToolLoopMutationBoundary(campaignId: string): GmToolLoopMutationBoundary {
  gmToolLoopBoundaryCounter += 1;
  const savepointName = `gm_tool_loop_receipt_${gmToolLoopBoundaryCounter}`;
  let active = false;
  let closed = false;
  let taintedReason: string | null = null;
  const trackedStepResults: GmToolStepResult[] = [];

  const ensureActive = (): void => {
    if (closed || active) return;
    getSqliteConnection().exec(`SAVEPOINT ${savepointName}`);
    active = true;
    log.event("gm-tool-loop.mutation-boundary.start", {
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
    log.event("gm-tool-loop.mutation-boundary.close", {
      campaignId,
      savepointName,
      mode,
      trackedStepCount: trackedStepResults.length,
    });
  };

  return {
    get trackedStepResults() {
      return trackedStepResults;
    },
    get taintedReason() {
      return taintedReason;
    },
    taint(reason) {
      taintedReason ??= reason;
    },
    assertCanCommit() {
      if (!taintedReason) return;
      throw new Error(
        `GM tool loop mutation boundary cannot commit after malformed side-effecting tool result: ${taintedReason}`,
      );
    },
    commit() {
      this.assertCanCommit();
      close("commit");
    },
    rollback() {
      close("rollback");
    },
    beginForTool(toolName) {
      if (shouldUseGmToolLoopMutationBoundary(toolName)) {
        ensureActive();
      }
    },
    trackToolResult(input) {
      if (!shouldUseGmToolLoopMutationBoundary(input.toolName)) return;
      trackedStepResults.push({
        stepId: `mutation-boundary-${trackedStepResults.length + 1}`,
        attempt: 1,
        status: "done",
        toolName: input.toolName,
        candidateInput: isRecord(input.candidateInput) ? input.candidateInput : null,
        validationError: null,
        visibleEffect: input.result.success
          ? `${input.toolName} settled inside GM tool-loop mutation boundary.`
          : "",
        privateGuardTerms: [],
        mutationRefs: input.result.success ? mutationRefsFromToolResult(input.result) : [],
        settledAtTick: input.tick,
        result: input.result,
      });
    },
  };
}

function withGmToolLoopMutationBoundary(
  tools: Partial<StorytellerToolSet>,
  boundary: GmToolLoopMutationBoundary,
  tick: number,
): Partial<StorytellerToolSet> {
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function" || !isRuntimeToolName(toolName)) {
        return [toolName, toolDef];
      }

      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          boundary.beginForTool(toolName);
          const result = await originalExecute(input, ...rest);
          if (!isToolResult(result)) {
            if (shouldUseGmToolLoopMutationBoundary(toolName)) {
              boundary.taint(`${toolName} returned a non-ToolResult after entering the boundary.`);
            }
            return malformedToolResult(
              "Tool result was not returned by the GM tool-loop mutation boundary.",
              toolName,
            );
          }
          if (
            shouldUseGmToolLoopMutationBoundary(toolName)
            && isMalformedToolResultFailure(result)
          ) {
            boundary.taint(`${toolName} returned a malformed result inside an inner runtime wrapper.`);
          }
          const resultWithStateReceipts = attachStructuralStateReceiptsToToolResult({
            toolName,
            candidateInput: input,
            result,
            prefix: `state_receipt_${boundary.trackedStepResults.length + 1}`,
          });
          boundary.trackToolResult({
            tick,
            toolName,
            candidateInput: input,
            result: resultWithStateReceipts,
          });
          return resultWithStateReceipts;
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function withDynamicCreationBudget(
  tools: Partial<StorytellerToolSet>,
  executionContext: ToolExecutionContext,
): Partial<StorytellerToolSet> {
  const dynamicCreationKeys = new Set<string>();
  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function") {
        return [toolName, toolDef];
      }

      const runtimeToolName = toolName as RuntimeToolName;
      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          const candidateInput = isRecord(input) ? input : {};
          const budgetKey = dynamicCreationBudgetKey({
            toolName: runtimeToolName,
            input: candidateInput,
          });

          if (budgetKey && dynamicCreationKeys.has(budgetKey)) {
            return {
              success: false as const,
              error: dynamicCreationBudgetExceededError(),
            };
          }

          const result = await originalExecute(input, ...rest);
          if (!isToolResult(result)) {
            return malformedToolResult(
              "Tool result was not returned by the runtime tool loop.",
              runtimeToolName,
            );
          }
          if (budgetKey && result.success) {
            dynamicCreationKeys.add(budgetKey);
          }
          applySuccessfulToolObservationToExecutionContext({
            toolName: runtimeToolName,
            toolInput: candidateInput,
            result,
            context: executionContext,
          });
          return result;
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function withUnconfirmedAccessClaimGuard(
  tools: Partial<StorytellerToolSet>,
  playerAction: string,
): Partial<StorytellerToolSet> {
  if (!isUnconfirmedAccessProofClaim(playerAction)) {
    return tools;
  }

  return Object.fromEntries(
    Object.entries(tools).map(([toolName, toolDef]) => {
      if (!toolDef || typeof toolDef.execute !== "function") {
        return [toolName, toolDef];
      }

      const runtimeToolName = toolName as RuntimeToolName;
      const originalExecute = toolDef.execute.bind(toolDef) as (...args: unknown[]) => unknown;
      const wrappedTool = {
        ...toolDef,
        async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
          if (grantsClaimedAccessFromUnconfirmedProof(runtimeToolName, input)) {
            return {
              success: false,
              error: UNCONFIRMED_ACCESS_CLAIM_TOOL_ERROR,
            };
          }

          const result = await originalExecute(input, ...rest);
          return isToolResult(result)
            ? result
            : malformedToolResult(
                "Tool result was not returned by the runtime access-claim guard.",
                runtimeToolName,
              );
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  forbiddenPrivateTerms: readonly string[] = [],
  safety?: ModelFacingPromptSafety,
): string {
  return formatModelFacingRecentConversation(recentConversation, {
    safety,
    extraForbiddenTerms: forbiddenPrivateTerms,
  });
}

function actorPromptRef(
  view: ModelFacingSceneView,
  actor: ModelFacingSceneView["visibleActors"][number],
): string | null {
  if (
    actor.id === view.localScene.playerActorId
    || actor.actorId === view.localScene.playerActorId
  ) {
    return "Player";
  }
  return actor.label || null;
}

function addRefReplacement(
  replacements: Map<string, string>,
  rawRef: string | null | undefined,
  promptRef: string | null | undefined,
): void {
  const raw = rawRef?.trim();
  const prompt = promptRef?.trim();
  if (!raw || !prompt) return;
  replacements.set(raw.toLowerCase(), prompt);
}

function addTypedRefReplacement(
  replacements: Map<string, string>,
  type: string,
  rawRef: string | null | undefined,
  promptRef: string | null | undefined,
): void {
  const raw = rawRef?.trim();
  if (!raw) return;
  addRefReplacement(replacements, `${type}:${raw}`, promptRef);
}

function buildPromptRefReplacementMap(view: ModelFacingSceneView): Map<string, string> {
  const replacements = new Map<string, string>();
  addRefReplacement(replacements, view.localScene.playerActorId, "Player");
  addTypedRefReplacement(replacements, "actor", view.localScene.playerActorId, "Player");
  addRefReplacement(replacements, view.localScene.currentLocationId, "current_location");
  addTypedRefReplacement(replacements, "location", view.localScene.currentLocationId, "current_location");
  addRefReplacement(replacements, view.localScene.currentSceneScopeId, "current_scene");
  addTypedRefReplacement(replacements, "location", view.localScene.currentSceneScopeId, "current_scene");

  for (const actor of view.visibleActors ?? []) {
    const promptRef = actorPromptRef(view, actor);
    addRefReplacement(replacements, actor.id, promptRef);
    addTypedRefReplacement(replacements, "actor", actor.id, promptRef);
    addRefReplacement(replacements, actor.actorId, promptRef);
    addTypedRefReplacement(replacements, "actor", actor.actorId, promptRef);
  }

  for (const candidate of view.legalTargets ?? []) {
    const promptRef = candidate.label || null;
    addRefReplacement(replacements, candidate.id, promptRef);
    addRefReplacement(replacements, candidate.actorId, promptRef);
    addTypedRefReplacement(replacements, "actor", candidate.actorId, promptRef);
    addRefReplacement(replacements, candidate.itemId, promptRef);
    addTypedRefReplacement(replacements, "item", candidate.itemId, promptRef);
    addRefReplacement(replacements, candidate.locationId, promptRef);
    addTypedRefReplacement(replacements, "location", candidate.locationId, promptRef);
    addRefReplacement(replacements, candidate.factionId, promptRef);
    addTypedRefReplacement(replacements, "faction", candidate.factionId, promptRef);
  }

  for (const candidate of view.legalMovement ?? []) {
    const promptRef = candidate.label || null;
    addRefReplacement(replacements, candidate.id, promptRef);
    addTypedRefReplacement(replacements, "location", candidate.id, promptRef);
    addRefReplacement(replacements, candidate.locationId, promptRef);
    addTypedRefReplacement(replacements, "location", candidate.locationId, promptRef);
  }

  return replacements;
}

function replaceModelFacingRefs(value: unknown, replacements: ReadonlyMap<string, string>): unknown {
  if (typeof value === "string") {
    return replacements.get(value.trim().toLowerCase()) ?? value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => replaceModelFacingRefs(entry, replacements));
  }
  if (!isRecord(value)) {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      replaceModelFacingRefs(entry, replacements),
    ]),
  );
}

function buildGmToolLoopSceneViewForPrompt(view: ModelFacingSceneView): unknown {
  const replacements = buildPromptRefReplacementMap(view);
  return {
    localScene: {
      tick: view.localScene.tick,
      currentLocationRef: "current_location",
      currentSceneRef: "current_scene",
      currentLocationName: view.localScene.currentLocationName ?? null,
      currentSceneScopeName: view.localScene.currentSceneScopeName ?? null,
    },
    visibleActors: (view.visibleActors ?? []).map((actor) => ({
      ref: actorPromptRef(view, actor),
      label: actor.label,
      type: actor.type,
      awareness: actor.awareness,
      tags: actor.tags?.slice(0, 6),
      summary: actor.summary ?? null,
    })),
    awarenessHints: view.awarenessHints ?? [],
    privateContext: view.privateContext ?? {
      hiddenActorCount: 0,
      opaquePresenceCategories: [],
    },
    localRecentEvents: (view.localRecentEvents ?? []).map((event) => ({
      tick: event.tick,
      source: event.source,
      summary: event.summary,
      actorRefs: uniqueNonEmptyStrings(
        event.actorIds.map((actorId) =>
          replacements.get(actorId.trim().toLowerCase()) ?? null),
      ).slice(0, 4),
    })),
    legalTargetCount: (view.legalTargets ?? []).length,
    legalMovementCount: (view.legalMovement ?? []).length,
    oracle: oracleResultForModelPrompt(view.oracle),
    oracleContext: oracleContextForModelPrompt(view.oracleContext),
    combatEnvelope: view.combatEnvelope ? { present: true } : undefined,
  };
}

function buildGmReadForToolLoopPrompt(gmRead: GmRead, view: ModelFacingSceneView): unknown {
  return replaceModelFacingRefs(gmRead, buildPromptRefReplacementMap(view));
}

function buildCandidateRefsForPrompt(view: ModelFacingSceneView): unknown {

  return {
    current: {
      currentLocation: {
        ref: "current_location",
        label: view.localScene.currentLocationName ?? null,
      },
      currentScene: {
        ref: "current_scene",
        label: view.localScene.currentSceneScopeName ?? null,
      },
    },
    actors: view.visibleActors.map((actor) => ({
      ref: actorPromptRef(view, actor),
      label: actor.label,
      awareness: actor.awareness,
    })),
    targets: view.legalTargets.map((candidate) => ({
      ref: candidate.label || null,
      label: candidate.label,
      type: candidate.type,
    })),
    movements: view.legalMovement.map((candidate) => ({
      ref: candidate.label || null,
      label: candidate.label,
    })),
  };
}

function gmReadRuntimeRequirement(args: RunGmToolLoopArgs): NonNullable<GmRead["runtimeRequirement"]> | null {
  if (
    args.gmRead.path !== "tool_plan"
    && args.gmRead.path !== "roll_oracle"
    && args.gmRead.path !== "combat_transition"
  ) {
    return null;
  }
  const requirement = args.gmRead.runtimeRequirement;
  return requirement && requirement.kind !== "none" ? requirement : null;
}

function dialogueAddressedTargetFromGmRead(
  args: RunGmToolLoopArgs,
): DialogueAddressedTargetInput | null {
  const requirement = gmReadRuntimeRequirement(args);
  if (requirement?.kind !== "dialogue_outcome") return null;
  const binding = requirement.speakerBinding;
  if (binding?.kind === "visible_actor") {
    return { kind: "visible_ref", ref: binding.speakerRef };
  }
  if (binding?.kind === "prose_role") {
    return { kind: "prose_role", roleText: binding.requestedRoleText };
  }
  if (binding?.kind === "no_visible_authority") {
    return { kind: "no_visible_authority", roleText: binding.requestedRoleText };
  }

  const firstStructuredTarget = args.gmRead.actionInterpretation.targetRefs[0];
  return firstStructuredTarget
    ? { kind: "visible_ref", ref: firstStructuredTarget }
    : { kind: "none" };
}

function assertSupportedGmToolRuntimeRequirement(args: RunGmToolLoopArgs): void {
  if (args.gmRead.path !== "tool_plan") return;
  const requirement = gmReadRuntimeRequirement(args);
  if (!requirement) {
    throw new Error(
      "GM tool loop requires a typed non-none runtimeRequirement for tool_plan. Downstream regex/prose inference is disabled.",
    );
  }
}

function assertRuntimeRequirementCanBeSatisfied(
  requirement: NonNullable<GmRead["runtimeRequirement"]> | null,
  profile: GmToolLoopProfile,
): void {
  if (!requirement) return;
  if (requirement.kind === "observation_read") return;
  if (
    requirement.kind === "dialogue_outcome"
    && requirement.requiresStructuralEffect === true
    && runtimeRequirementStateEffectKinds(requirement).length === 0
  ) {
    throw new Error(
      "GM tool loop cannot run: dialogue_outcome requiresStructuralEffect=true must include runtimeRequirement.effectKind/effectKinds.",
    );
  }
  if (
    requirement.kind === "dialogue_outcome"
    && requirement.requiresStructuralEffect === true
  ) {
    const structuralOwners = runtimeRequirementStateMutationTools(requirement);
    if (!profile.activeTools.some((toolName) => structuralOwners.includes(toolName))) {
      throw new Error(
        `GM tool loop cannot run: dialogue_outcome structural effects ${runtimeRequirementStateEffectKinds(requirement).join(",")} have no active structural owner in profile ${profile.name}.`,
      );
    }
  }
  if (profile.activeTools.some((toolName) =>
    canRuntimeToolSatisfyRequirement(toolName, requirement))) {
    return;
  }
  throw new Error(
    `GM tool loop cannot run: runtimeRequirement ${requirement.kind} has no active receipt-capable tool in profile ${profile.name}.`,
  );
}

function isBroadStatusReadToolLoop(args: RunGmToolLoopArgs): boolean {
  if (args.gmRead.path !== "tool_plan") return false;
  const requirement = gmReadRuntimeRequirement(args);
  if (requirement?.kind === "observation_read") return true;
  return false;
}

function isWorldFactToolLoop(args: RunGmToolLoopArgs): boolean {
  if (args.gmRead.path !== "tool_plan") return false;
  const requirement = gmReadRuntimeRequirement(args);
  return requirement?.kind === "world_fact";
}

function dialogueOutcomeRequiresStructuralEffect(args: RunGmToolLoopArgs): boolean {
  const requirement = gmReadRuntimeRequirement(args);
  return requirement?.kind === "dialogue_outcome"
    && requirement.requiresStructuralEffect === true;
}

function dialogueOutcomeRequiresNoVisibleAuthority(args: RunGmToolLoopArgs): boolean {
  const requirement = gmReadRuntimeRequirement(args);
  return requirement?.kind === "dialogue_outcome"
    && requirement.speakerBinding?.kind === "no_visible_authority";
}

function playerTurnActiveTools(tools: readonly RuntimeToolName[]): RuntimeToolName[] {
  return normalizeModelFacingAllowedTools({ tools, mode: "player_turn" });
}

function activeToolsForRuntimeRequirement(
  tools: readonly RuntimeToolName[],
  requirement: RuntimeRequirementLike | null | undefined,
): RuntimeToolName[] {
  if (!requirement) {
    return tools.filter((toolName) =>
      !runtimeToolIsSideEffecting(toolName)
      && !TERMINAL_SEMANTIC_RECEIPT_TOOLS.has(toolName));
  }

  const receiptOwners = new Set(runtimeRequirementStateMutationTools(requirement));
  const preparatoryOwners = new Set(runtimeRequirementPreparatoryTools(requirement));
  const requiredTerminalTool = requiredTerminalToolForRuntimeRequirement(requirement);
  const receiptPlan = buildRuntimeReceiptPlan(requirement);

  return tools.filter((toolName) => {
    if (!runtimeToolIsSideEffecting(toolName)) return true;
    if (requiredTerminalTool && toolName === requiredTerminalTool) return true;
    if (receiptOwners.has(toolName) || preparatoryOwners.has(toolName)) return true;
    if (canRuntimeToolSatisfyReceiptPlan(toolName, receiptPlan)) return true;
    if (
      requirement.kind === "scene_beat"
      && canRuntimeToolSatisfyRequirement(toolName, requirement)
    ) {
      return true;
    }
    return false;
  });
}

function defaultRuntimeExecutionTools(args: RunGmToolLoopArgs): RuntimeToolName[] {
  const requirement = gmReadRuntimeRequirement(args);
  const tools = activeToolsForRuntimeRequirement(args.frame.allowedTools, requirement);
  return playerTurnActiveTools(tools);
}

function selectGmToolLoopProfile(args: RunGmToolLoopArgs): GmToolLoopProfile {
  const requestedMaxOutputTokens = args.maxOutputTokens ?? GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS;
  if (isReusableProceduralInformationTurn(args)) {
    const requestedProceduralMaxOutputTokens =
      args.maxOutputTokens ?? GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS;
    const requiresStructuralEffect = dialogueOutcomeRequiresStructuralEffect(args);
    const noVisibleAuthority = dialogueOutcomeRequiresNoVisibleAuthority(args);
    const requirement = gmReadRuntimeRequirement(args);
    const structuralEffectTools = requiresStructuralEffect
      ? new Set([
          ...runtimeRequirementStateMutationTools(requirement),
          ...runtimeRequirementPreparatoryTools(requirement),
        ])
      : new Set<RuntimeToolName>();
    return {
      name: "procedural_conversation_outcome",
      activeTools: playerTurnActiveTools(
        args.frame.allowedTools.filter((toolName) =>
          (PROCEDURAL_CONVERSATION_TOOLS.has(toolName)
            && !(noVisibleAuthority && toolName === "create_scene_extra"))
          || (requiresStructuralEffect
            && DIALOGUE_STRUCTURAL_EFFECT_TOOLS.has(toolName)
            && structuralEffectTools.has(toolName)),
        ),
      ),
      maxSteps: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
      timeoutMs: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
      maxOutputTokens: Math.min(
        requestedProceduralMaxOutputTokens,
        GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS,
      ),
      requiredTerminalTool: "record_dialogue_outcome",
    };
  }
  if (isBroadStatusReadToolLoop(args)) {
    return {
      name: "broad_status_read_observation",
      activeTools: playerTurnActiveTools(
        args.frame.allowedTools.filter((toolName) =>
          STATUS_READ_OBSERVATION_TOOLS.has(toolName),
        ),
      ),
      maxSteps: GM_TOOL_LOOP_STATUS_READ_MAX_STEPS,
      timeoutMs: GM_TOOL_LOOP_STATUS_READ_TIMEOUT_MS,
      maxOutputTokens: Math.min(requestedMaxOutputTokens, GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS),
    };
  }
  if (isWorldFactToolLoop(args)) {
    const requestedWorldFactMaxOutputTokens =
      args.maxOutputTokens ?? GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS;
    return {
      name: "world_fact_recording",
      activeTools: playerTurnActiveTools(
        args.frame.allowedTools.filter((toolName) =>
          WORLD_FACT_RECORDING_TOOLS.has(toolName),
        ),
      ),
      maxSteps: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
      timeoutMs: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
      maxOutputTokens: Math.min(
        requestedWorldFactMaxOutputTokens,
        GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS,
      ),
      requiredTerminalTool: "record_world_fact",
    };
  }

  return {
    name: "default_runtime_execution",
    activeTools: defaultRuntimeExecutionTools(args),
    maxSteps: GM_TOOL_LOOP_MAX_STEPS,
    timeoutMs: GM_TOOL_LOOP_TIMEOUT_MS,
    maxOutputTokens: requestedMaxOutputTokens,
  };
}

function formatGmToolLoopProfilePrompt(profile: GmToolLoopProfile): string {
  if (profile.name === "default_runtime_execution") {
    return [
      "PROFILE: default_runtime_execution",
      "Use the allowed runtime tools normally for the concrete GM Read path.",
    ].join("\n");
  }

  if (profile.name === "procedural_conversation_outcome") {
    return [
      "PROFILE: procedural_conversation_outcome",
      "This turn must structurally record a visible/current actor, source, or authority dialogue outcome from GM Read runtimeRequirement.",
      "Use only the listed conversation/procedure tools. Do not create locations, items, movement, access, possession, combat, relationships, or persistent/key actors unless GM Read sets runtimeRequirement.requiresStructuralEffect=true and the listed structural tool is the direct consequence of this playable beat.",
      "Use a lookup only when needed to verify visible people, carried/visible documents, or current/known facts before recording the dialogue outcome.",
      "If GM Read speakerBinding.kind is no_visible_authority, do not create a temporary responder and do not bind another speaker; record unavailable/no_current_answer with authorityKind no_visible_authority, requestedRoleText, and no speakerRef.",
      "If no legal non-player speakerRef is visible but GM Read speakerBinding.kind is prose_role and the current scene plausibly contains an ordinary responder, create one temporary current-scene responder first with create_scene_extra using role clerk/service/support/witness/vendor/courier/porter. Set create_scene_extra.roleText to the exact GM Read speakerBinding.requestedRoleText when possible, or echo that text in reason. Then use the returned name as speakerRef in record_dialogue_outcome; do not copy backend IDs from tool diagnostics.",
      "If the player addressed a role or ordinary person from recent visible prose that is not in CANDIDATE REFS, do not substitute another visible NPC just because that NPC is legal. Create the addressed responder with create_scene_extra, or record unavailable/no_current_answer with requestedRoleText.",
      "Create at most one temporary responder in this profile, and only when that responder is needed to answer, refuse, redirect, witness, or make the current public/service scene playable.",
      "If the player states a question, reports a block, or shows documents, do not spend a step recording the player's intent here. The player action is already the intent; call record_dialogue_outcome for the NPC/source answer, refusal, silence, gesture, warning, redirect, unavailable role, or no-current-answer result.",
      "For record_dialogue_outcome, semantics live in outcomeKind/topicKind/authorityKind/truthStatus/futureUseKind, claims, and stateEffects. quote is the concrete player-visible answer surface; durable answered procedure/permission/proof/route/safety/status outcomes require quote. If no concrete answer can be spoken, use refused/unavailable/no_current_answer/redirected instead of answered.",
      "Legal refs for speakerRef, addresseeRefs, and sourceRefs must be copied exactly from CANDIDATE REFS as Player/current_scene/current_location/human-readable labels, or from a successful tool result name in this loop.",
      "Role or office words from the player action are not refs. Put them in requestedRoleText; never use a role label like dispatcher/clerk/office/warden as speakerRef or sourceRefs unless it appears as a legal ref or was returned by create_scene_extra.",
      "If the requested role or authority is not currently visible and the scene does not plausibly support a temporary responder, use record_dialogue_outcome with outcomeKind unavailable or no_current_answer, authorityKind no_visible_authority, requestedRoleText, and no speakerRef.",
      "For unavailable/no_current_answer, sourceRefs should cite an existing legal ref such as Player, current_scene, current_location, the visible place/object/document the player used, or a player-known fact. Do not cite the unavailable role as a source ref.",
      "For reusable procedure questions, no-answer/unavailable-role outcomes are still procedural outcomes. Record them as durable record_dialogue_outcome with futureUseKind and futureRelevance when they constrain the player's next route, office, evidence, safety choice, or later attempt.",
      "Use durable record_dialogue_outcome with futureRelevance for reusable procedural answers, document failures, named offices, citations, permissions, prohibitions, route facts, warnings, or obligations. Do not stop after only advance_time, lookup, record_player_intent, or log_event.",
      "If the NPC/source only says what would work, what they believe, or what rule applies, leave stateEffects empty; that is a communicative answer, not an applied state.",
      "If the outcome actually applies durable state now because the player earned, bluffed, persuaded, proved, paid, fought, or otherwise made something happen, first make the matching structural state-bearing tool call in its own observed step; then record_dialogue_outcome with stateEffects[{ status:'applied_now', stateReceipt:'state_receipt_...' }], citing the stateReceipt alias from that tool result. Do not hand-copy target/key/value; the backend resolves them from the receipt.",
      "When runtimeRequirement.requiresStructuralEffect is true, do not call record_dialogue_outcome until every needed structural state-bearing tool has already succeeded. Preliminary dialogue records without backed applied_now stateEffects waste the player-blocking loop and will fail validation.",
      "If the attempted structural change is refused, unavailable, redirected, impossible, not currently owed, or otherwise not applied, record that typed non-application as record_dialogue_outcome with outcomeKind refused/unavailable/no_current_answer/redirected/silent and no applied_now stateEffects. Do not invent a structural tool for a change that did not happen.",
      "For payments, deposits, custody transfer, access grants, status marks, relationship shifts, route openings, injuries, and item movement, settle the concrete world change first with add_tag/remove_tag/set_relationship/transfer_item/move_actor/reveal_location/spawn_item/set_condition as appropriate; then record the NPC/source answer once with backed stateEffects.",
      "For partial payments, deposits, or giving part of a bundled item, use transfer_item with transferredItemName and remainingItemName so the paid portion and the player's remainder are both concrete state.",
      "Do not make the game bureaucratic by default: creative or tone-appropriate success can grant access, trust, suspicion relief, or a route directly when the scene supports it. Still record the successful consequence structurally so later turns remember it.",
      "Do not mark a reusable procedural outcome scene_local just because no NPC answers; scene_local is only for exchanges that will not matter after this turn.",
      "Do not offer quick actions before recording the NPC/source outcome. Quick actions are not a substitute for an answer, refusal, warning, redirect, unavailable role, or no-current-answer.",
      "Stop as soon as the procedural NPC outcome is recorded; do not keep probing tools to improve prose.",
    ].join("\n");
  }

  if (profile.name === "world_fact_recording") {
    return [
      "PROFILE: world_fact_recording",
      "This turn must structurally record a future-usable player-known fact from GM Read runtimeRequirement.",
      "Use only lookup tools and record_world_fact. Do not create actors, locations, items, movement, access, combat, relationships, or dialogue outcomes in this profile.",
      "Use lookup tools only to gather existing visible/current refs or player-known fact refs before recording the fact.",
      "Use record_world_fact for comparisons, contradictions, gaps, public notices, route-log checks, office/procedure facts, warnings, leads, and status facts that should matter later.",
      "For uncertainty, record truthStatus disputed or unknown with factKind contradiction or gap. Do not invent a positive fact to close the uncertainty.",
      "Semantics live in sourceKind/truthStatus/factKind/topicKind/futureUseKind and claims. summary and futureRelevance may be any language and are display/evidence only.",
      "sourceRefs, subjectRefs, and claims[].subjectRef must be visible/current refs, movement refs, or player-known fact refs from CANDIDATE REFS or lookup results.",
      "For the current place, use CANDIDATE REFS current.currentScene.ref/current.currentLocation.ref, which are current_scene/current_location. Do not invent or copy typed backend location refs.",
      "If a concept like a notice board, date gap, route-log mismatch, office name, permit, or procedure is not an exact legal ref, put it in claims[].subjectText/summary, not in claims[].subjectRef, subjectRefs, or sourceRefs.",
      "Do not use log_event, record_dialogue_outcome, or final assistant prose to satisfy world_fact.",
      "Stop as soon as record_world_fact succeeds; do not keep probing tools to improve prose.",
    ].join("\n");
  }

  return [
    "PROFILE: broad_status_read_observation",
    "This turn is a broad observe/take-stock/status-read request. Answer by reading existing visible/legal state, not by materializing a bespoke scene.",
    "Use observation-only lookup tools only. Do not call start_search, create_minor_poi, create_scene_extra, spawn_item, reveal_location, move_actor, log_event, record_player_intent, or advance_time for this profile.",
    "One broad lookup is usually enough; use at most one targeted follow-up lookup when the first observation leaves the requested visible category unanswered.",
    "If a lookup returns success:false, read the error and try a different allowed observation lookup instead of stopping.",
    "Stop as soon as observations give the final narrator enough existing visible affordances, routes, people, objects, or local status to describe the next playable choice.",
    `After the last tool observation, output exactly ${GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL} and no other text. Do not summarize the status in assistant text here; this profile records tool observations only.`,
  ].join("\n");
}

function formatLocalityAndCreationOrder(profile: GmToolLoopProfile): string {
  const activeTools = new Set(profile.activeTools);
  const canRevealLocation = activeTools.has("reveal_location");
  const canCreateMinorPoi = activeTools.has("create_minor_poi");
  const placeOwnerLines = canRevealLocation
    ? [
        "- If the turn needs a specific newly discovered/entered place (back room, booth, alley mouth, office, hatch, service door area) and it is not already in legal movement/location refs, call reveal_location first, anchored to current_scene or current_location.",
        "- For reveal_location.connectedToName, prefer the literal alias current_scene/current_location. Only use a location label if you copy an exact legal ref from the model-facing view; never shorten or paraphrase it.",
        "- If the player actually enters that new place, call move_actor after reveal_location succeeds, then use the move_actor observation as the current scene for later tools.",
        "- Do not use spawn_item, log_event, or final text to imply an unrevealed local place exists before the backend has accepted reveal_location.",
      ]
    : canCreateMinorPoi
      ? [
          "- If the turn needs an ordinary local low-impact public affordance (tea stall, street vendor, shrine desk, notice board, courier desk), call create_minor_poi anchored to current_scene/current_location.",
          "- create_minor_poi is the only active local-place creation owner in this profile. Do not invent rooms, offices, hidden passages, faction sites, rare shops, or key locations in prose.",
          "- If the player actually moves, use move_actor only to legal movement refs or successful route helper aliases; create_minor_poi alone does not complete movement.",
        ]
      : [
          "- This profile has no local-place creation owner. Do not imply a new durable place, route, room, booth, desk, office, or passage exists unless it is already in legal refs.",
        ];

  return [
    "LOCALITY AND CREATION ORDER",
    ...placeOwnerLines,
    "- Support NPCs are allowed when the scene needs someone concrete to answer, oppose, guide, trade, witness, or make the place playable. They should be spawned into the current scene/current location or a just-revealed observed location, not a guessed remote place.",
    "- Items are allowed when a tangible thing becomes persistent, transferable, inspectable, usable, owned, or likely to matter later. Do not spawn incidental set dressing, implied props, or generic scenery; describe those later in narration instead.",
    "- Use durable log_event only for a new future-relevant fact that is not a possession/access/item-use/movement claim. Successful spawn_item and transfer_item results already carry those concrete facts; successful move_actor carries movement facts.",
    "- Use scene_local log_event for attempted, refused, witnessed, conversational, or bluff beats; if an NPC's suspicion should persist, prefer a concrete NPC/location consequence tool when one is justified by legal refs.",
    "- Future-relevant pressure checklist: raised voices tied to an inspection dispute, named/role actors who continue acting, waxed cloth or manifests that create an obligation, recessed doors/stairs/routes, defensive posture, danger changes, or aftermath after violence require state-bearing tool observations. Do not leave them only in text.",
    "- Low-stakes sensory color is allowed for final narration later when it creates no durable actor, prop, route, obligation, combat state, danger change, or aftermath.",
    "- Locked/restricted access: do not call place or movement tools to let a player through a false or unconfirmed key/permit/authority claim by inventing another method. No sudden lockpicks, seal-breaking tools, hidden credentials, or unlisted specialty skills.",
    "- A player's claim that they already have a key, permit, pass, credential, or authority is not backend proof. Even on an Oracle hit, do not create the claimed item, open restricted access, or move through it unless current model-facing refs already confirm the proof exists.",
    "- If an unconfirmed access claim cannot be proven from backend state, legal outcomes are refusal, suspicion, alarm, a request for proof, or a visible failed attempt. Use scene_local log_event/add_tag/offer_quick_actions rather than access-granting tools.",
    "- Names can be private facts too. If the player names a person, faction, place, or authority that is not present in model-facing refs, treat that exact name as raw player claim text only: do not record it as confirmed identity, location, consent, or authority. Prefer phrasing tool inputs as the named authority/person from the player's claim unless a visible/current ref already exposes the exact name.",
  ].join("\n");
}

export function buildGmToolLoopPrompt(
  args: RunGmToolLoopArgs,
  profile: GmToolLoopProfile = selectGmToolLoopProfile(args),
): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  return [
    "GM RUNTIME TOOL LOOP TASK",
    "You are the Game Master runtime executor for one player turn.",
    "GM Read supplies the beat anchor. Execute only the concrete backend work needed to make that same playable beat true.",
    "Use runtime tools when the world must change. Backend tools are the only authority for mutations.",
    "Call at most one runtime tool per assistant step. After each tool result, read the observation and decide the next needed tool.",
    "Stop once the needed backend observations are enough for the final narrator. Do not keep probing tools to improve prose.",
    "A required runtime contract is satisfied only by a tool result with success:true, status not failure, and the required terminal tool for GM Read runtimeRequirement. A failed terminal attempt is not a receipt; read contractFailure/refHints and retry with legal refs.",
    "Do not write final player-facing narration here. The visible narrator runs after backend observations settle.",
    "Use observation-only lookup tools for fuzzy low-risk intent before choosing a state tool. Read their observations, then choose visible labels/current aliases/helper aliases or stop only if observation is enough.",
    "Lookup observations never mutate world state and never reveal hidden/private/offscreen names; do not treat lookup candidates as completed movement or created facts.",
    "Do not satisfy future-relevant concrete pressure in assistant prose. If this pass introduces actors, props, obligations, routes, combat posture, danger changes, or aftermath that should matter later, it must be represented by successful existing runtime tools.",
    "If a tool returns success:false, do not restate the same invalid call. Correct it only if the model-facing scene refs make a legal correction obvious.",
    "Use only model-facing refs, visible actors, legal targets, legal movement, and allowed tools.",
    "Do not invent backend IDs, offscreen actors, remote locations, hidden private facts, or state deltas.",
    "Recent transcript is continuity, not legal refs. Tool participants/targets must be clear local/current refs in the model-facing view or a successful observation from this loop.",
    "Scoped forecast pressure is advisory only. It may explain why a local signal matters, but it never expands legal refs or scripts an outcome.",
    "Do not copy hidden/private forecast wording into tool inputs. Translate pressure into visible/public language; if a private-source-boundary guard rejects a tool, rewrite the tool input without repeating the forbidden wording.",
    "When advance_time is listed in ALLOWED TOOLS and the player intentionally waits, travels, rests, shops, observes, trains, researches, or names elapsed time, call advance_time with the GM-estimated in-world minutes before later state tools for that same beat.",
    "",
    formatGmToolLoopProfilePrompt(profile),
    "",
    formatLocalityAndCreationOrder(profile),
    "",
    "CONVERSATION COMPLETION",
    "- If the player asks, speaks to, negotiates with, or questions a visible/current-scene NPC or a support NPC you create, do not stop after only create_scene_extra, record_player_intent, advance_time, or a log_event that only repeats the player's request.",
    "- Before stopping a conversational turn, create at least one successful record_dialogue_outcome that structurally records the NPC/source answer, refusal, warning, silence, gesture, redirect, unavailable role, or no-current-answer result.",
    "- Use scene_local record_dialogue_outcome for an immediate non-durable exchange; use durable record_dialogue_outcome with futureUseKind/futureRelevance for reusable leads, names, procedures, warnings, permissions, obligations, route facts, or promises.",
    "- Do not use log_event text to satisfy an NPC answer/refusal/silence/warning. log_event is legacy memory/fact logging, not a dialogue outcome contract.",
    "",
    "PLAYER ACTION RAW TEXT (SANITIZED PLAYER-AUTHORED PROSE; NOT LEGAL REFS)",
    formatModelFacingPlayerActionText(args.playerAction, {
      safety: scenePacket.safety,
      extraForbiddenTerms: args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    }),
    "",
    "GM READ",
    JSON.stringify(
      redactModelFacingJson(
        buildGmReadForToolLoopPrompt(args.gmRead, scenePacket.view),
        scenePacket.safety,
      ),
      null,
      2,
    ),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(buildGmToolLoopSceneViewForPrompt(scenePacket.view), null, 2),
    "",
    "CANDIDATE REFS FROM MODEL-FACING VIEW ONLY",
    JSON.stringify(buildCandidateRefsForPrompt(scenePacket.view), null, 2),
    "",
    "ALLOWED TOOLS",
    profile.activeTools.length > 0
      ? profile.activeTools.map((toolName) => `- ${toolName}`).join("\n")
      : "- none",
    "",
    "ORACLE RESULT",
    args.oracleResult
      ? JSON.stringify(redactModelFacingJson(oracleResultForModelPrompt(args.oracleResult), scenePacket.safety), null, 2)
      : "- none",
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(scopedForecastForModelPrompt(args.scopedForecastExcerpt), null, 2),
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation,
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
      scenePacket.safety,
    ),
  ].join("\n");
}

function isToolResult(value: unknown): value is ToolResult {
  return (
    typeof value === "object"
    && value !== null
    && !Array.isArray(value)
    && "success" in value
    && typeof (value as { success?: unknown }).success === "boolean"
  );
}

function malformedToolResult(error: string, toolName?: RuntimeToolName | string): ToolResult {
  return {
    success: false,
    status: "failure",
    error,
    contractFailure: {
      code: "malformed_tool_result",
      toolName,
      retryable: false,
      message: error,
    },
  };
}

function isMalformedToolResultFailure(result: ToolResult): boolean {
  return result.success === false && result.contractFailure?.code === "malformed_tool_result";
}

function toolNameFromStepResult(
  step: Record<string, unknown>,
  result: Record<string, unknown>,
  index: number,
): RuntimeToolName | null {
  const directName = result.toolName;
  if (typeof directName === "string" && directName.trim()) {
    return directName.trim() as RuntimeToolName;
  }
  const toolCalls = step.toolCalls;
  if (!Array.isArray(toolCalls)) return null;
  const pairedCall = toolCalls[index];
  if (!isRecord(pairedCall)) return null;
  const pairedName = pairedCall.toolName;
  return typeof pairedName === "string" && pairedName.trim()
    ? pairedName.trim() as RuntimeToolName
    : null;
}

function toolResultPayload(result: Record<string, unknown>): unknown {
  return extractToolResultPayload(result);
}

function hasSuccessfulStatusReadObservation(
  toolNames: readonly RuntimeToolName[],
): StopCondition<any> {
  const allowedTools = new Set<RuntimeToolName>(toolNames);
  return ({ steps }) => {
    const step = steps.at(-1);
    if (!isRecord(step)) return false;
    const toolResults = step.toolResults;
    if (!Array.isArray(toolResults)) return false;
    return toolResults.some((entry, index) => {
      if (!isRecord(entry)) return false;
      const toolName = toolNameFromStepResult(step, entry, index);
      if (!toolName || !allowedTools.has(toolName)) return false;
      const payload = toolResultPayload(entry);
      return isToolResult(payload)
        && payload.success === true
        && isObservationToolResult(payload);
    });
  };
}

function hasAcceptedRuntimeTerminalReceipt(
  requirement: NonNullable<GmRead["runtimeRequirement"]> | null,
  trackedStepResults?: () => readonly GmToolStepResult[],
): StopCondition<any> {
  const requiredTool = requiredTerminalToolForRuntimeRequirement(requirement);
  return ({ steps }) => {
    if (!requiredTool) return false;
    const step = steps.at(-1);
    if (!isRecord(step)) return false;
    const toolResults = step.toolResults;
    if (!Array.isArray(toolResults)) return false;
    return toolResults.some((entry, index) => {
      if (!isRecord(entry)) return false;
      const toolName = toolNameFromStepResult(step, entry, index);
      if (toolName !== requiredTool) return false;
      const payload = toolResultPayload(entry);
      return isToolResult(payload)
        && isAcceptedTerminalToolResult({
          toolName,
          result: payload,
          requirement,
          appliedStructuralEffectsBacked: appliedStructuralEffectsBackedForToolResult(
            trackedStepResults?.() ?? [],
            toolName,
            payload,
          ),
        });
    });
  };
}

function hasAcceptedTerminalReceiptInStepResults(
  requirement: NonNullable<GmRead["runtimeRequirement"]> | null,
  stepResults: readonly GmToolStepResult[],
): boolean {
  const requiredTool = requiredTerminalToolForRuntimeRequirement(requirement);
  if (!requiredTool) return false;
  return stepResults.some((step, index) =>
    step.toolName === requiredTool
    && isAcceptedTerminalToolResult({
      toolName: step.toolName,
      result: step.result,
      requirement,
      appliedStructuralEffectsBacked: appliedStructuralEffectsBackedByPriorReceipts(
        stepResults,
        index,
      ),
    }));
}

function hasRequiredTerminalToolCallInStepResults(
  requirement: NonNullable<GmRead["runtimeRequirement"]> | null,
  stepResults: readonly GmToolStepResult[],
): boolean {
  const requiredTool = requiredTerminalToolForRuntimeRequirement(requirement);
  if (!requiredTool) return false;
  return stepResults.some((step) => step.toolName === requiredTool);
}

function modelFacingPriorToolSteps(
  stepResults: readonly GmToolStepResult[],
  safety: ModelFacingPromptSafety,
): unknown[] {
  return stepResults.map((step) => ({
    stepId: step.stepId,
    toolName: step.toolName,
    status: step.status,
    input: redactModelFacingJson(step.candidateInput ?? {}, safety),
    result: step.result ? toModelVisibleToolResult(step.result) : null,
    validationError: step.validationError
      ? redactModelFacingJson(step.validationError, safety)
      : null,
  }));
}

function buildTerminalClosurePrompt(input: {
  args: RunGmToolLoopArgs;
  profile: GmToolLoopProfile;
  requiredTool: RequiredTerminalToolName;
  priorStepResults: readonly GmToolStepResult[];
}): string {
  const scenePacket = buildModelFacingScenePacket(input.args.frame);
  const requirement = gmReadRuntimeRequirement(input.args);
  const terminalInstruction = input.requiredTool === "record_dialogue_outcome"
    ? [
        "Close the conversational runtime contract now.",
        "Call record_dialogue_outcome exactly for the NPC/source answer, refusal, warning, silence, redirect, unavailable role, or no-current-answer result.",
        "If a previous create_scene_extra produced the responder, use that visible name/model-safe result as speakerRef.",
        "If the already-observed facts do not support a concrete answer or applied state, record a typed non-application outcome such as refused, redirected, unavailable, or no_current_answer; do not invent a structural success.",
      ]
    : [
        "Close the world_fact runtime contract now.",
        "Call record_world_fact exactly for the future-usable player-known fact, gap, contradiction, warning, route, office, procedure, or status fact.",
        "Use legal refs from the model-facing scene or prior tool observations; put concepts without legal refs in subjectText/summary fields.",
      ];

  return [
    "GM RUNTIME TERMINAL CLOSURE TASK",
    "The previous GM tool pass made backend observations or preparatory changes but did not produce the required terminal receipt.",
    "This is a protocol-closure phase, not a new exploratory phase.",
    `Original profile: ${input.profile.name}.`,
    `You have only one terminal owner available: ${input.requiredTool}.`,
    "Do not call helper, lookup, creation, movement, item, relationship, tag, or log tools in this closure phase.",
    "Do not write final player-facing narration.",
    "A helper result, created support NPC, known-fact lookup, object lookup, or scene scan cannot close this turn.",
    ...terminalInstruction,
    "",
    "PLAYER ACTION RAW TEXT (SANITIZED PLAYER-AUTHORED PROSE; NOT LEGAL REFS)",
    formatModelFacingPlayerActionText(input.args.playerAction, {
      safety: scenePacket.safety,
      extraForbiddenTerms: input.args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    }),
    "",
    "GM READ",
    JSON.stringify(
      redactModelFacingJson(
        buildGmReadForToolLoopPrompt(input.args.gmRead, scenePacket.view),
        scenePacket.safety,
      ),
      null,
      2,
    ),
    "",
    "RUNTIME REQUIREMENT",
    JSON.stringify(redactModelFacingJson(requirement ?? { kind: "none" }, scenePacket.safety), null, 2),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(buildGmToolLoopSceneViewForPrompt(scenePacket.view), null, 2),
    "",
    "CANDIDATE REFS FROM MODEL-FACING VIEW ONLY",
    JSON.stringify(buildCandidateRefsForPrompt(scenePacket.view), null, 2),
    "",
    "PRIOR TOOL RESULTS FROM THIS SAME TURN",
    JSON.stringify(modelFacingPriorToolSteps(input.priorStepResults, scenePacket.safety), null, 2),
    "",
    "ALLOWED TOOL",
    `- ${input.requiredTool}`,
    "",
    "CLOSURE RULE",
    "Stop as soon as the required terminal receipt succeeds. If the exact requested outcome cannot be applied, record the typed refusal/unavailable/no-current-answer/gap instead of continuing to probe.",
  ].join("\n");
}

type ToolLoopStepForCollection = Parameters<typeof collectToolCalls>[0][number];

function isSettledObservationOnlyToolResult(result: ToolResult): boolean {
  return result.kind !== "mutation"
    && isObservationToolResult(result)
    && result.authority === undefined;
}

function isSettledObservationOnlyToolCall(call: CollectedToolCall): boolean {
  return isToolResult(call.result)
    && isSettledObservationOnlyToolResult(call.result);
}

function firstUnsafeMultiToolStepIndex(
  steps: unknown[],
  activeTools: readonly RuntimeToolName[],
): number | null {
  const activeToolNames = new Set<string>(activeTools);
  const allCollectedCalls = collectToolCalls(steps as ToolLoopStepForCollection[]);
  const callsById = new Map<string, CollectedToolCall>();
  for (const call of allCollectedCalls) {
    if (call.toolCallId) callsById.set(call.toolCallId, call);
  }

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!isRecord(step)) continue;
    const toolCalls = step.toolCalls;
    if (!Array.isArray(toolCalls) || toolCalls.length <= 1) continue;
    if (!toolCalls.every(isRecord)) {
      return index;
    }

    const collectedCalls = toolCalls
      .map((call, callIndex) => {
        const rawCall = call as Record<string, unknown>;
        const toolCallId = stringField(rawCall, "toolCallId");
        if (toolCallId) return callsById.get(toolCallId) ?? null;
        return collectToolCalls([{
          ...(step as ToolLoopStepForCollection),
          toolCalls: [call as NonNullable<ToolLoopStepForCollection["toolCalls"]>[number]],
          toolResults: Array.isArray(step.toolResults)
            ? [step.toolResults[callIndex]]
            : [],
        }])[0] ?? null;
      });
    if (collectedCalls.some((call) => call === null)) {
      return index;
    }
    if (collectedCalls.length !== toolCalls.length) {
      return index;
    }

    const allCallsAreSafeObservations = collectedCalls.every((call) =>
      call !== null
      && activeToolNames.has(call.tool)
      && isSettledObservationOnlyToolCall(call)
    );
    if (!allCallsAreSafeObservations) {
      return index;
    }
  }
  return null;
}

function assertStatusReadCompletionText(text: string): void {
  const trimmed = text.trim();
  if (trimmed === "" || trimmed === GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL) {
    return;
  }

  throw new Error(
    `GM status-read tool loop emitted prose instead of ${GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL}.`,
  );
}

function labelFromRecord(record: Record<string, unknown>): string | null {
  for (const key of ["label", "name", "summary"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      const sanitized = sanitizeModelFacingConversationText(value, { maxChars: 120 });
      return sanitized && sanitized !== "[backend ref hidden]" ? sanitized : null;
    }
  }
  return null;
}

function labelsFromArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) return [];
  const labels: string[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const label = labelFromRecord(entry);
    if (label) labels.push(label);
    if (labels.length >= limit) break;
  }
  return labels;
}

function summarizeObservationPayload(toolName: RuntimeToolName, payload: unknown): string | null {
  if (!isRecord(payload)) return null;
  const parts: string[] = [];
  const visibleActors = labelsFromArray(payload.visibleActors, 3);
  const legalTargets = labelsFromArray(payload.legalTargets, 3);
  const legalMovement = labelsFromArray(payload.legalMovement, 3);
  const candidates = labelsFromArray(payload.candidates, 4);
  const affordances = labelsFromArray(payload.affordances, 4);
  if (visibleActors.length > 0) parts.push(`actors ${visibleActors.join(", ")}`);
  if (legalTargets.length > 0) parts.push(`visible options ${legalTargets.join(", ")}`);
  if (legalMovement.length > 0) parts.push(`routes ${legalMovement.join(", ")}`);
  if (candidates.length > 0) parts.push(`matches ${candidates.join(", ")}`);
  if (affordances.length > 0) parts.push(`scene options ${affordances.join(", ")}`);
  if (parts.length === 0) {
    const count = typeof payload.count === "number" ? payload.count : null;
    if (count === null) return null;
    return count > 0
      ? `${observationToolPublicLabel(toolName)} confirms ${count} visible option${count === 1 ? "" : "s"}.`
      : `${observationToolPublicLabel(toolName)} confirms no matching visible option.`;
  }
  return `${observationToolPublicLabel(toolName)}: ${parts.join("; ")}`;
}

function observationToolPublicLabel(toolName: RuntimeToolName): string {
  switch (toolName) {
    case "list_visible_affordances":
      return "Scene scan";
    case "list_navigation_options":
    case "check_route":
      return "Route check";
    case "find_location_candidates":
      return "Location check";
    case "find_object_candidates":
      return "Object check";
    case "find_actor_candidates":
      return "People check";
    case "find_poi_candidates":
      return "Local point check";
    case "inspect_known_fact":
      return "Known information check";
    default:
      return "Scene observation";
  }
}

function buildStatusReadObservationSummary(
  stepResults: readonly GmToolStepResult[],
): string | undefined {
  const summaries = stepResults
    .filter((step) => step.result?.success === true && step.result && isObservationToolResult(step.result))
    .map((step) => step.toolName
      ? summarizeObservationPayload(step.toolName, step.result?.result)
      : null)
    .filter((entry): entry is string => Boolean(entry));
  if (summaries.length === 0) return undefined;
  return summaries.join(" | ").slice(0, 420);
}

function isSuccessfulObservationStep(step: GmToolStepResult): boolean {
  return step.result?.success === true
    && Boolean(step.result)
    && isObservationToolResult(step.result);
}

function isConversationalToolLoop(args: RunGmToolLoopArgs): boolean {
  if (args.gmRead.path !== "tool_plan") return false;
  const requirement = gmReadRuntimeRequirement(args);
  if (requirement?.kind === "dialogue_outcome") return true;
  return false;
}

function dialogueOutcomePayload(step: GmToolStepResult): Record<string, unknown> | null {
  if (step.toolName !== "record_dialogue_outcome") return null;
  if (step.result?.success !== true) return null;
  const resultPayload = isRecord(step.result.result) ? step.result.result : null;
  return resultPayload
    && stringField(resultPayload, "outcomeKind")
    && stringField(resultPayload, "topicKind")
    && stringField(resultPayload, "authorityKind")
    && stringField(resultPayload, "truthStatus")
    ? resultPayload
    : null;
}

function isDialogueOutcomeStep(
  step: GmToolStepResult,
  stepResults?: readonly GmToolStepResult[],
  stepIndex?: number,
): boolean {
  if (!isAcceptedTerminalToolResult({
    toolName: step.toolName,
    result: step.result,
    requirement: { kind: "dialogue_outcome" },
    appliedStructuralEffectsBacked:
      typeof stepIndex === "number" && stepResults
        ? appliedStructuralEffectsBackedByPriorReceipts(stepResults, stepIndex)
        : false,
  })) {
    return false;
  }
  const payload = dialogueOutcomePayload(step);
  return Boolean(
    payload
    && stringField(payload, "outcomeKind")
    && stringField(payload, "topicKind")
    && stringField(payload, "authorityKind")
    && stringField(payload, "truthStatus"),
  );
}

function isDurableDialogueOutcomeStep(
  step: GmToolStepResult,
  stepResults?: readonly GmToolStepResult[],
  stepIndex?: number,
): boolean {
  const payload = dialogueOutcomePayload(step);
  if (!payload) return false;
  return isDialogueOutcomeStep(step, stepResults, stepIndex)
    && stringField(payload, "durability") === "durable"
    && Boolean(stringField(payload, "futureUseKind"))
    && Boolean(stringField(payload, "futureRelevance"));
}

function dialogueOutcomeSettlesStructuralRequirementWithoutMutation(
  step: GmToolStepResult,
): boolean {
  const payload = dialogueOutcomePayload(step);
  if (!payload) return false;
  if (appliedStateEffectsFromDialoguePayload(payload).length > 0) return false;
  return dialogueOutcomeSatisfiesStructuralRequirement(payload);
}

function effectHasPriorReceipt(
  stepResults: readonly GmToolStepResult[],
  dialogueStepIndex: number,
  effect: Record<string, unknown>,
): boolean {
  if (!stringField(effect, "stateReceipt")) {
    return false;
  }
  return stepResults
    .slice(0, dialogueStepIndex)
    .some((step) => {
      const receipt = structuralStateReceiptFromToolCall({
        toolName: step.toolName,
        candidateInput: step.candidateInput,
        result: step.result,
      });
      return Boolean(receipt && receiptBacksAppliedStateEffect(receipt, effect));
    });
}

function toolResultAuthorityId(result: ToolResult | null | undefined): string | null {
  const id = result?.authority?.toolResultId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function stepMatchesToolResult(
  step: GmToolStepResult,
  toolName: RuntimeToolName,
  result: ToolResult,
): boolean {
  if (step.toolName !== toolName) return false;
  if (step.result === result) return true;
  const leftAuthorityId = toolResultAuthorityId(step.result);
  const rightAuthorityId = toolResultAuthorityId(result);
  return Boolean(leftAuthorityId && rightAuthorityId && leftAuthorityId === rightAuthorityId);
}

function appliedStructuralEffectsBackedByPriorReceipts(
  stepResults: readonly GmToolStepResult[],
  dialogueStepIndex: number,
): boolean {
  const step = stepResults[dialogueStepIndex];
  if (!step || step.toolName !== "record_dialogue_outcome" || step.result?.success !== true) {
    return false;
  }
  const payload = isRecord(step.result.result) ? step.result.result : null;
  const appliedEffects = appliedStateEffectsFromDialoguePayload(payload);
  return appliedEffects.length > 0
    && appliedEffects.every((effect) =>
      effectHasPriorReceipt(stepResults, dialogueStepIndex, effect));
}

function appliedStructuralEffectsBackedForToolResult(
  stepResults: readonly GmToolStepResult[],
  toolName: RuntimeToolName,
  result: ToolResult,
): boolean {
  let dialogueStepIndex = -1;
  for (let index = stepResults.length - 1; index >= 0; index -= 1) {
    if (!stepMatchesToolResult(stepResults[index]!, toolName, result)) continue;
    dialogueStepIndex = index;
    break;
  }
  return dialogueStepIndex >= 0
    && appliedStructuralEffectsBackedByPriorReceipts(stepResults, dialogueStepIndex);
}

function missingAppliedStateEffectsWithoutPriorReceipts(
  priorStepResults: readonly GmToolStepResult[],
  dialoguePayload: Record<string, unknown> | null,
): Record<string, unknown>[] {
  return appliedStateEffectsFromDialoguePayload(dialoguePayload)
    .filter((effect) =>
      !priorStepResults.some((step) => {
        const receipt = structuralStateReceiptFromToolCall({
          toolName: step.toolName,
          candidateInput: step.candidateInput,
          result: step.result,
        });
        return Boolean(receipt && stringField(effect, "stateReceipt")
          && resolveAppliedStateEffectFromReceipt(receipt, effect));
      }));
}

function missingAppliedStateEffectReceiptError(effect: Record<string, unknown>): string {
  const structuralTool = stringField(effect, "structuralTool") ?? "missing";
  const targetRef = stringField(effect, "targetRef") ?? "missing";
  const stateKey = stringField(effect, "stateKey") ?? "missing";
  const stateValue = stringField(effect, "stateValue") ?? "missing";
  return [
    "dialogue_state_effect_missing_prior_receipt",
    "record_dialogue_outcome declared an applied_now stateEffect before the matching structural tool succeeded.",
    `Effect: structuralTool=${structuralTool}; targetRef=${targetRef}; stateKey=${stateKey}; stateValue=${stateValue}.`,
    "Call the required structural tool first, then cite the stateReceipt alias returned by that tool, or record the outcome without this applied_now stateEffect if the state did not change.",
  ].join(" ");
}

function resolveAppliedStateEffectFromPriorReceipts(
  priorStepResults: readonly GmToolStepResult[],
  effect: Record<string, unknown>,
): Record<string, unknown> | null {
  const stateReceipt = stringField(effect, "stateReceipt");
  if (!stateReceipt) return null;
  for (const step of priorStepResults) {
    const receipt = structuralStateReceiptFromToolCall({
      toolName: step.toolName,
      candidateInput: step.candidateInput,
      result: step.result,
    });
    if (!receipt) continue;
    const resolved = resolveAppliedStateEffectFromReceipt(receipt, effect);
    if (resolved) return resolved;
  }
  return null;
}

function normalizeDialogueOutcomeStateEffectsFromReceipts(
  input: Record<string, unknown>,
  priorStepResults: readonly GmToolStepResult[],
): Record<string, unknown> {
  if (!Array.isArray(input.stateEffects)) return input;
  let changed = false;
  const stateEffects = input.stateEffects.map((effect) => {
    if (!isRecord(effect) || stringField(effect, "status") !== "applied_now") {
      return effect;
    }
    const resolved = resolveAppliedStateEffectFromPriorReceipts(priorStepResults, effect);
    if (!resolved) return effect;
    changed = true;
    return resolved;
  });
  return changed ? { ...input, stateEffects } : input;
}

function withDialogueStateReceiptHandshake(
  tools: Partial<StorytellerToolSet>,
  priorStepResults: () => readonly GmToolStepResult[],
): Partial<StorytellerToolSet> {
  const dialogueToolDef = tools.record_dialogue_outcome;
  if (!dialogueToolDef || typeof dialogueToolDef.execute !== "function") return tools;

  const guardedTools: Partial<StorytellerToolSet> = {
    ...tools,
  };
  const originalExecute = dialogueToolDef.execute.bind(dialogueToolDef) as (...args: unknown[]) => unknown;
  guardedTools.record_dialogue_outcome = {
    ...dialogueToolDef,
    async execute(input: unknown, ...rest: unknown[]): Promise<ToolResult> {
      const candidateInput = isRecord(input) ? input : {};
      const normalizedInput = normalizeDialogueOutcomeStateEffectsFromReceipts(
        candidateInput,
        priorStepResults(),
      );
      const missingEffects = missingAppliedStateEffectsWithoutPriorReceipts(
        priorStepResults(),
        normalizedInput,
      );
      if (missingEffects.length > 0) {
        const error = missingAppliedStateEffectReceiptError(missingEffects[0]);
        return {
          success: false,
          status: "failure",
          error,
          contractFailure: {
            code: "dialogue_state_effect_missing_prior_receipt",
            path: "input.stateEffects",
            toolName: "record_dialogue_outcome",
            terminalKind: "dialogue_outcome",
            retryable: true,
            message: error,
          },
        };
      }

      const result = await originalExecute(normalizedInput, ...rest);
      return isToolResult(result)
        ? result
        : malformedToolResult(
            "Tool result was not returned by the dialogue state receipt handshake.",
            "record_dialogue_outcome",
          );
    },
  } as typeof dialogueToolDef;

  return guardedTools;
}

function assertAppliedNowDialogueEffectsBackedByPriorStructuralReceipts(
  stepResults: readonly GmToolStepResult[],
): void {
  for (const [dialogueIndex, step] of stepResults.entries()) {
    if (step.toolName !== "record_dialogue_outcome" || step.result?.success !== true) continue;
    const appliedEffects = appliedStateEffectsFromDialoguePayload(dialogueOutcomePayload(step));
    for (const effect of appliedEffects) {
      if (effectHasPriorReceipt(stepResults, dialogueIndex, effect)) continue;
      throw new Error(
        "record_dialogue_outcome declared applied_now stateEffect without a prior matching structural state tool result.",
      );
    }
  }
}

function addIdentityAliases(
  aliases: Set<string>,
  value: unknown,
  typeHint?: string | null,
): void {
  dialogueStateTokenAliases(value, typeHint).forEach((alias) => aliases.add(alias));
}

function createdSceneExtraIdentityAliasesFromStep(step: GmToolStepResult): Set<string> {
  const aliases = new Set<string>();
  if (step.toolName !== "create_scene_extra") return aliases;
  const payload = isRecord(step.result?.result) ? step.result.result : {};

  addIdentityAliases(aliases, payload.id, "npc");
  addIdentityAliases(aliases, payload.id, "actor");
  addIdentityAliases(aliases, payload.npcId, "npc");
  addIdentityAliases(aliases, payload.npcId, "actor");
  addIdentityAliases(aliases, payload.actorId, "npc");
  addIdentityAliases(aliases, payload.actorId, "actor");
  addIdentityAliases(aliases, payload.name, "npc");
  addIdentityAliases(aliases, payload.name, "actor");

  if (Array.isArray(payload.modelSafeRefs)) {
    payload.modelSafeRefs.forEach((ref) => addIdentityAliases(aliases, ref));
  }

  [
    ...(step.result?.authority?.stateDeltaRefs ?? []),
    ...(step.result?.authority?.eventRefs ?? []),
  ]
    .filter((ref) => /^actor:|^npc:/i.test(ref))
    .forEach((ref) => addIdentityAliases(aliases, ref));

  return aliases;
}

function dialoguePayloadUsesCreatedSceneExtraStep(
  step: GmToolStepResult,
  dialoguePayload: Record<string, unknown> | null,
): boolean {
  if (step.toolName !== "create_scene_extra" || !dialoguePayload) return false;
  const aliases = createdSceneExtraIdentityAliasesFromStep(step);
  return [
    dialoguePayload.speakerRef,
    dialoguePayload.addresseeRefs,
    dialoguePayload.sourceRefs,
  ].some((value) => {
    if (Array.isArray(value)) {
      return value.some((entry) =>
        dialogueStateTokenAliases(entry).some((alias) => aliases.has(alias)));
    }
    return dialogueStateTokenAliases(value).some((alias) => aliases.has(alias));
  });
}

function hasIdentityAliasIntersection(
  left: ReadonlySet<string>,
  right: ReadonlySet<string>,
): boolean {
  for (const alias of left) {
    if (right.has(alias)) return true;
  }
  return false;
}

function createdItemIdentityAliasesFromStep(step: GmToolStepResult): Set<string> {
  const aliases = new Set<string>();
  if (step.toolName !== "spawn_item" || step.result?.success !== true) return aliases;
  const payload = isRecord(step.result?.result) ? step.result.result : {};

  addIdentityAliases(aliases, payload.id, "item");
  addIdentityAliases(aliases, payload.name, "item");

  if (Array.isArray(payload.modelSafeRefs)) {
    payload.modelSafeRefs.forEach((ref) => addIdentityAliases(aliases, ref));
  }

  return aliases;
}

function addTagTargetIdentityAliasesFromStep(step: GmToolStepResult): Set<string> {
  const aliases = new Set<string>();
  if (step.toolName !== "add_tag" || step.result?.success !== true) return aliases;
  const payload = isRecord(step.result?.result) ? step.result.result : {};
  const input = isRecord(step.candidateInput) ? step.candidateInput : {};
  const entityType = stringField(input, "entityType");

  addIdentityAliases(aliases, payload.entity, entityType);
  addIdentityAliases(aliases, input.entityName, entityType);
  addIdentityAliases(aliases, input.entityRef, entityType);

  return aliases;
}

function metadataStepTargetsAcceptedSameTurnCreatedItem(input: {
  step: GmToolStepResult;
  stepIndex: number;
  stepResults: readonly GmToolStepResult[];
  accepted: ReadonlySet<number>;
}): boolean {
  const targetAliases = addTagTargetIdentityAliasesFromStep(input.step);
  if (targetAliases.size === 0) return false;

  return input.stepResults
    .slice(0, input.stepIndex)
    .some((candidate, index) =>
      input.accepted.has(index)
      && hasIdentityAliasIntersection(
        targetAliases,
        createdItemIdentityAliasesFromStep(candidate),
      ));
}

function acceptedGmToolStepIndexesBeforeCommit(
  args: RunGmToolLoopArgs,
  stepResults: readonly GmToolStepResult[],
): Set<number> {
  const requirement = gmReadRuntimeRequirement(args);
  const receiptPlan = buildRuntimeReceiptPlan(requirement);
  const accepted = new Set<number>();

  stepResults.forEach((step, index) => {
    if (!requirement) return;
    if (isAcceptedRuntimeReceiptForPlan({
      toolName: step.toolName,
      result: step.result,
      plan: receiptPlan,
      appliedStructuralEffectsBacked: appliedStructuralEffectsBackedByPriorReceipts(
        stepResults,
        index,
      ),
    })) {
      accepted.add(index);
    }
  });

  if (requirement?.kind === "dialogue_outcome") {
    stepResults.forEach((dialogueStep, dialogueIndex) => {
      if (!accepted.has(dialogueIndex) || dialogueStep.toolName !== "record_dialogue_outcome") {
        return;
      }
      const dialoguePayload = dialogueOutcomePayload(dialogueStep);
      const appliedEffects = appliedStateEffectsFromDialoguePayload(dialoguePayload);
      stepResults.slice(0, dialogueIndex).forEach((step, offset) => {
        const stepIndex = offset;
        if (accepted.has(stepIndex)) return;
        if (dialoguePayloadUsesCreatedSceneExtraStep(step, dialoguePayload)) {
          accepted.add(stepIndex);
          return;
        }
        const receipt = structuralStateReceiptFromToolCall({
          toolName: step.toolName,
          candidateInput: step.candidateInput,
          result: step.result,
        });
        if (
          receipt
          && appliedEffects.some((effect) => receiptBacksAppliedStateEffect(receipt, effect))
        ) {
          accepted.add(stepIndex);
          return;
        }
        if (metadataStepTargetsAcceptedSameTurnCreatedItem({
          step,
          stepIndex,
          stepResults,
          accepted,
        })) {
          accepted.add(stepIndex);
        }
      });
    });
  }

  const preparatoryTools = new Set(runtimeRequirementPreparatoryTools(requirement));
  stepResults.forEach((step, index) => {
    if (accepted.has(index) || !isRuntimeToolName(step.toolName)) return;
    if (!preparatoryTools.has(step.toolName)) return;
    const hasLaterAcceptedReceipt = stepResults
      .slice(index + 1)
      .some((laterStep, offset) => {
        const laterIndex = index + 1 + offset;
        return accepted.has(laterIndex)
          && isRuntimeToolName(laterStep.toolName)
          && canRuntimeToolSatisfyRequirement(laterStep.toolName, requirement);
      });
    if (hasLaterAcceptedReceipt) {
      accepted.add(index);
    }
  });

  return accepted;
}

function isSuccessfulSideEffectingStep(step: GmToolStepResult): boolean {
  if (step.result?.success !== true || step.result.status === "failure") {
    return false;
  }
  if (!isRuntimeToolName(step.toolName)) {
    return false;
  }
  if (typeof step.result.authority?.resultWorldVersion === "number") {
    return true;
  }
  if (isObservationToolResult(step.result)) {
    return false;
  }
  return runtimeToolIsSideEffecting(step.toolName);
}

function stableStepComparisonValue(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function authorityToolResultId(step: GmToolStepResult): string | null {
  const id = step.result?.authority?.toolResultId;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

function stepResultsRepresentSameExecution(
  left: GmToolStepResult,
  right: GmToolStepResult,
): boolean {
  if (left.toolName !== right.toolName) return false;
  if (left.result && left.result === right.result) return true;

  const leftAuthorityId = authorityToolResultId(left);
  const rightAuthorityId = authorityToolResultId(right);
  if (leftAuthorityId && rightAuthorityId && leftAuthorityId === rightAuthorityId) {
    return true;
  }

  return stableStepComparisonValue(left.candidateInput) === stableStepComparisonValue(right.candidateInput)
    && stableStepComparisonValue(left.result) === stableStepComparisonValue(right.result);
}

function missingRepresentedExecutions(input: {
  source: readonly GmToolStepResult[];
  target: readonly GmToolStepResult[];
  sourceFilter?: (step: GmToolStepResult) => boolean;
}): GmToolStepResult[] {
  const usedTargetIndexes = new Set<number>();
  return input.source
    .filter(isSuccessfulSideEffectingStep)
    .filter((step) => input.sourceFilter?.(step) ?? true)
    .filter((sourceStep) => {
    const matchIndex = input.target.findIndex((targetStep, index) =>
      !usedTargetIndexes.has(index) && stepResultsRepresentSameExecution(sourceStep, targetStep));
    if (matchIndex === -1) return true;
    usedTargetIndexes.add(matchIndex);
    return false;
  });
}

function assertTrackedSideEffectsRepresentedBeforeCommit(
  parsedStepResults: readonly GmToolStepResult[],
  trackedStepResults: readonly GmToolStepResult[],
): void {
  const missingParsed = missingRepresentedExecutions({
    source: trackedStepResults,
    target: parsedStepResults,
  });
  if (missingParsed.length > 0) {
    throw new Error(
      [
        "GM tool loop mutation boundary tracked successful side-effecting execution(s) missing from parsed SDK steps before commit.",
        missingParsed.map((step) => `${step.toolName ?? "unknown"}:${step.stepId}`).join(", "),
      ].join(" "),
    );
  }

  const missingTracked = missingRepresentedExecutions({
    source: parsedStepResults,
    target: trackedStepResults,
  });
  if (missingTracked.length > 0) {
    throw new Error(
      [
        "GM tool loop parsed successful side-effecting result(s) missing from the mutation boundary execution log before commit.",
        missingTracked.map((step) => `${step.toolName ?? "unknown"}:${step.stepId}`).join(", "),
      ].join(" "),
    );
  }
}

function assertNoUnacceptedSideEffectingStepsBeforeCommit(
  args: RunGmToolLoopArgs,
  stepResults: readonly GmToolStepResult[],
  trackedStepResults: readonly GmToolStepResult[] = [],
): Set<number> {
  assertTrackedSideEffectsRepresentedBeforeCommit(stepResults, trackedStepResults);
  const accepted = acceptedGmToolStepIndexesBeforeCommit(args, stepResults);
  const offenders = stepResults.filter((step, index) =>
    isSuccessfulSideEffectingStep(step) && !accepted.has(index));
  if (offenders.length === 0) return accepted;
  throw new Error(
    [
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt before transaction commit.",
      offenders.map((step) => `${step.toolName ?? "unknown"}:${step.stepId}`).join(", "),
    ].join(" "),
  );
}

function worldFactPayload(step: GmToolStepResult): Record<string, unknown> | null {
  if (step.toolName !== "record_world_fact") return null;
  if (step.result?.success !== true) return null;
  const resultPayload = isRecord(step.result.result) ? step.result.result : null;
  const inputPayload = isRecord(step.candidateInput) ? step.candidateInput : null;
  return resultPayload
    && stringField(resultPayload, "factKind")
    && stringField(resultPayload, "topicKind")
    && stringField(resultPayload, "truthStatus")
    ? resultPayload
    : inputPayload ?? resultPayload;
}

function isWorldFactStep(
  step: GmToolStepResult,
  requirement: RuntimeRequirementLike,
): boolean {
  if (!isAcceptedTerminalToolResult({
    toolName: step.toolName,
    result: step.result,
    requirement,
  })) {
    return false;
  }
  const payload = worldFactPayload(step);
  return Boolean(
    payload
    && stringField(payload, "factKind")
    && stringField(payload, "topicKind")
    && stringField(payload, "truthStatus"),
  );
}

function matchesRequiredTopicKind(
  payload: Record<string, unknown> | null,
  requiredTopicKind: string | undefined,
): boolean {
  if (!requiredTopicKind) return true;
  return stringField(payload ?? {}, "topicKind") === requiredTopicKind;
}

function isReusableProceduralInformationTurn(args: RunGmToolLoopArgs): boolean {
  const requirement = gmReadRuntimeRequirement(args);
  if (requirement?.kind === "dialogue_outcome") {
    return true;
  }
  return false;
}

function assertConversationalToolLoopResolved(
  args: RunGmToolLoopArgs,
  stepResults: readonly GmToolStepResult[],
): void {
  const requirement = gmReadRuntimeRequirement(args);
  if (args.gmRead.path === "tool_plan" && !requirement) {
    throw new Error(
      "GM tool loop requires a typed non-none runtimeRequirement for tool_plan. Downstream regex/prose inference is disabled.",
    );
  }
  if (requirement?.kind === "world_fact") {
    const worldFactSteps = stepResults.filter((step) =>
      isWorldFactStep(step, { kind: "world_fact" }));
    const acceptedWorldFactSteps = worldFactSteps.filter((step) =>
      isAcceptedTerminalToolResult({
        toolName: step.toolName,
        result: step.result,
        requirement,
      }));
    const hasWorldFact = worldFactSteps.length > 0;
    if (!hasWorldFact) {
      throw new Error(
        "GM tool loop ended a world_fact turn without a structural record_world_fact result.",
      );
    }
    if (
      requirement.topicKind
      && !acceptedWorldFactSteps.some((step) =>
        matchesRequiredTopicKind(worldFactPayload(step), requirement.topicKind))
    ) {
      throw new Error(
        `GM tool loop ended a world_fact turn without a structural record_world_fact matching topicKind ${requirement.topicKind}.`,
      );
    }
    if (requirement.durability && acceptedWorldFactSteps.length === 0) {
      throw new Error(
        `GM tool loop ended a world_fact turn without a ${requirement.durability} accepted record_world_fact receipt.`,
      );
    }
    return;
  }
  if (requirement?.kind === "state_mutation") {
    const hasMutationReceipt = stepResults.some((step) =>
      isAcceptedRuntimeReceipt({
        toolName: step.toolName,
        result: step.result,
        requirement,
      }));
    if (!hasMutationReceipt) {
      throw new Error(
        "GM tool loop ended a state_mutation turn without an accepted state mutation receipt.",
      );
    }
    return;
  }
  if (requirement?.kind === "scene_beat") {
    const hasSceneBeatReceipt = stepResults.some((step) =>
      isAcceptedRuntimeReceipt({
        toolName: step.toolName,
        result: step.result,
        requirement,
      }));
    if (!hasSceneBeatReceipt) {
      throw new Error(
        "GM tool loop ended a scene_beat turn without an accepted scene beat or state mutation receipt.",
      );
    }
    return;
  }
  if (requirement?.kind !== "dialogue_outcome") return;
  const dialogueOutcomeSteps = stepResults.filter((step, index) =>
    isDialogueOutcomeStep(step, stepResults, index));
  const hasDialogueOutcome = dialogueOutcomeSteps.length > 0;
  if (!hasDialogueOutcome) {
    throw new Error(
      "GM tool loop ended a conversational turn without a structural record_dialogue_outcome for the NPC answer, refusal, silence, gesture, warning, redirect, or unavailable-role result.",
    );
  }
  if (
    requirement.topicKind
    && !dialogueOutcomeSteps.some((step) =>
      matchesRequiredTopicKind(dialogueOutcomePayload(step), requirement.topicKind))
  ) {
    throw new Error(
      `GM tool loop ended a conversational turn without a structural record_dialogue_outcome matching topicKind ${requirement.topicKind}.`,
    );
  }
  if (
    requirement.durability === "durable"
    && !stepResults.some((step, index) =>
      isDurableDialogueOutcomeStep(step, stepResults, index)
      && matchesRequiredTopicKind(dialogueOutcomePayload(step), requirement.topicKind))
  ) {
    throw new Error(
      "GM tool loop ended a reusable procedural conversation without a durable future-relevant record_dialogue_outcome.",
    );
  }

  for (const [index, step] of stepResults.entries()) {
    if (!isDialogueOutcomeStep(step, stepResults, index)) continue;
    for (const effect of appliedStateEffectsFromDialoguePayload(dialogueOutcomePayload(step))) {
      if (effectHasPriorReceipt(stepResults, index, effect)) continue;
      throw new Error(
        "record_dialogue_outcome declared applied_now stateEffect without a prior matching structural state tool result.",
      );
    }
  }

  if (!requirement.requiresStructuralEffect) return;
  const hasBackedAppliedEffect = stepResults.some((step, index) => {
    if (!isDialogueOutcomeStep(step, stepResults, index)) return false;
    if (!matchesRequiredTopicKind(dialogueOutcomePayload(step), requirement.topicKind)) return false;
    return appliedStateEffectsFromDialoguePayload(dialogueOutcomePayload(step))
      .some((effect) => effectHasPriorReceipt(stepResults, index, effect));
  });
  const hasTypedNonApplicationOutcome = stepResults.some((step, index) => {
    if (!isDialogueOutcomeStep(step, stepResults, index)) return false;
    if (!matchesRequiredTopicKind(dialogueOutcomePayload(step), requirement.topicKind)) return false;
    if (
      requirement.durability === "durable"
      && !isDurableDialogueOutcomeStep(step, stepResults, index)
    ) {
      return false;
    }
    return dialogueOutcomeSettlesStructuralRequirementWithoutMutation(step);
  });
  if (!hasBackedAppliedEffect && !hasTypedNonApplicationOutcome) {
    throw new Error(
      "GM tool loop ended a dialogue_outcome turn requiring structural effect without a backed applied_now stateEffect or typed non-application outcome.",
    );
  }
}

async function retractDurableMemoryForRejectedToolLoop(input: {
  campaignId: string;
  stepResults: readonly GmToolStepResult[];
  reason: unknown;
}): Promise<void> {
  await retractDurableMemoryForRejectedSteps({
    ...input,
    source: "rejected_gm_tool_loop",
  });
}

function rejectedToolLoopStepDedupKey(step: GmToolStepResult): string {
  const authorityId = authorityToolResultId(step);
  if (authorityId) return `authority:${authorityId}`;
  const details = durableMemoryDetailsFromRejectedStep(step);
  if (details?.eventId) return `event:${details.eventId}`;
  if (details?.knowledgeId) return `knowledge:${details.knowledgeId}`;
  if (details?.factRef) return `knowledge:${details.factRef.replace(/^knowledge:/i, "")}`;
  return [
    step.toolName ?? "unknown",
    stableStepComparisonValue(step.candidateInput),
    stableStepComparisonValue(step.result),
  ].join(":");
}

function rejectedToolLoopStepUnion(
  parsedStepResults: readonly GmToolStepResult[],
  trackedStepResults: readonly GmToolStepResult[],
): GmToolStepResult[] {
  const seen = new Set<string>();
  const merged: GmToolStepResult[] = [];
  for (const step of [...parsedStepResults, ...trackedStepResults]) {
    const key = rejectedToolLoopStepDedupKey(step);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(step);
  }
  return merged;
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

function toToolStepResult(
  call: CollectedToolCall,
  index: number,
  tick: number,
  forbiddenPrivateTerms: readonly string[],
  indexOffset = 0,
): GmToolStepResult {
  const toolResult = isToolResult(call.result)
    ? call.result
    : malformedToolResult("Tool result was not returned by the runtime tool loop.", call.tool);
  const input = (
    call.args && typeof call.args === "object" && !Array.isArray(call.args)
      ? call.args
      : {}
  ) as Record<string, unknown>;
  const toolName = call.tool as RuntimeToolName;

  return {
    stepId: `tool-call-${indexOffset + index + 1}`,
    attempt: 1,
    status: toolResult.success ? "done" : "skipped",
    toolName,
    candidateInput: input,
    validationError: toolResult.success
      ? null
      : {
          code: "tool_failed",
          message: toolResult.error ?? `${call.tool} failed.`,
          toolName,
        },
    visibleEffect: toolResult.success
      ? `${call.tool} settled through backend observation.`
      : "",
    privateGuardTerms: [...forbiddenPrivateTerms],
    mutationRefs: toolResult.success ? mutationRefsFromToolResult(toolResult) : [],
    settledAtTick: tick,
    result: toolResult,
  };
}

function gmToolLoopIntent(
  gmRead: RunGmToolLoopArgs["gmRead"],
): string {
  if (gmRead.path === "tool_plan") return gmRead.turnIntent;
  if (gmRead.path === "combat_transition") return gmRead.combatFraming;
  return gmRead.rollRequest.question;
}

export async function runGmToolLoop(
  args: RunGmToolLoopArgs,
): Promise<GmToolLoopResult> {
  if (args.frame.allowedTools.length === 0) {
    throw new Error("GM tool loop cannot run: SceneFrame exposes no allowed runtime tools.");
  }

  assertSupportedGmToolRuntimeRequirement(args);
  const profile = selectGmToolLoopProfile(args);
  if (profile.activeTools.length === 0) {
    throw new Error(
      `GM tool loop cannot run: profile ${profile.name} exposes no allowed runtime tools.`,
    );
  }
  const runtimeRequirement = gmReadRuntimeRequirement(args);
  assertRuntimeRequirementCanBeSatisfied(runtimeRequirement, profile);
  const runtimeRequirementSource = runtimeRequirement ? "typed" : "none";

  const model = createModel(args.provider, { role: "judge", reasoningMode: "bypass" });
  const addressedTarget = dialogueAddressedTargetFromGmRead(args);
  const executionContext = addressedTarget
    ? createPlayerTurnToolExecutionContext({ frame: args.frame, addressedTarget })
    : createPlayerTurnToolExecutionContext(args.frame);
  const allTools = createStorytellerTools(
    args.campaignId,
    args.tick,
    args.oracleResult?.outcome,
    executionContext,
  );
  const accessGuardedTools = withUnconfirmedAccessClaimGuard(
    filterToolsToAllowed(allTools, profile.activeTools),
    args.playerAction,
  );
  const sourceBoundaryGuardedTools = withPrivateSourceBoundaryGuard(
    accessGuardedTools,
    args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
  );
  const proceduralOutcomeGuardedTools = profile.name === "procedural_conversation_outcome"
    ? withProceduralConversationOutcomeGuard(sourceBoundaryGuardedTools, args)
    : sourceBoundaryGuardedTools;
  const requirementGuardedTools = profile.name === "world_fact_recording"
    ? withWorldFactRequirementGuard(proceduralOutcomeGuardedTools, args)
    : proceduralOutcomeGuardedTools;
  const receiptGuardedTools = withRuntimeRequirementReceiptGuard(
    requirementGuardedTools,
    args,
  );
  const mutationBoundary = createGmToolLoopMutationBoundary(args.campaignId);
  const boundaryTools = withGmToolLoopMutationBoundary(
    withDynamicCreationBudget(
    receiptGuardedTools,
    executionContext,
    ),
    mutationBoundary,
    args.tick,
  );
  const tools = withDialogueStateReceiptHandshake(
    boundaryTools,
    () => mutationBoundary.trackedStepResults,
  );
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const prompt = buildGmToolLoopPrompt(args, profile);
  const requiredTerminalTool = profile.requiredTerminalTool
    ?? (requiredTerminalToolForRuntimeRequirement(runtimeRequirement) as RequiredTerminalToolName | null);
  const stopWhen = profile.name === "broad_status_read_observation"
    ? [
        stepCountIs(profile.maxSteps),
        hasSuccessfulStatusReadObservation(profile.activeTools),
      ]
    : requiredTerminalTool
      ? [
          stepCountIs(profile.maxSteps),
          hasAcceptedRuntimeTerminalReceipt(
            runtimeRequirement,
            () => mutationBoundary.trackedStepResults,
          ),
        ]
      : stepCountIs(profile.maxSteps);
  const terminalClosureStopWhen = requiredTerminalTool
    ? [
        stepCountIs(GM_TOOL_LOOP_TERMINAL_CLOSURE_MAX_STEPS),
        hasAcceptedRuntimeTerminalReceipt(
          runtimeRequirement,
          () => mutationBoundary.trackedStepResults,
        ),
      ]
    : stepCountIs(GM_TOOL_LOOP_TERMINAL_CLOSURE_MAX_STEPS);
  const startMs = Date.now();

  log.event("model-facing.scene-packet", {
    source: "gm-tool-loop",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

  let rawToolCalls: CollectedToolCall[] = [];
  let stepResults: GmToolStepResult[] = [];
  let toolLoopText = "";
  let observationSummary: string | undefined;
  let reasoningText: string | undefined;
  let acceptedStepIds: string[] = [];
  let acceptedToolResultIds: string[] = [];
  const executeModelToolLoop = async (): Promise<void> => {
    try {
    const result = await withRole("judge", () =>
      generateText({
        model,
        tools,
        activeTools: profile.activeTools,
        temperature: 0,
        maxOutputTokens: profile.maxOutputTokens,
        timeout: { totalMs: profile.timeoutMs },
        providerOptions: GM_TOOL_LOOP_SEQUENTIAL_TOOL_PROVIDER_OPTIONS,
        maxRetries: GM_TOOL_LOOP_TRANSPORT_MAX_RETRIES,
        stopWhen,
        system: [
          "You are the GM/Judge runtime tool agent.",
          "Your job is to make needed backend mutations through tools, one observed tool result at a time.",
          "Do not narrate to the player in this pass.",
        ].join(" "),
        prompt,
        experimental_onToolCallStart(event) {
          const toolCall = event.toolCall;
          if (!toolCall) return;
          log.event("gm-tool-loop.tool-call.start", {
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
          });
        },
        experimental_onToolCallFinish(event) {
          const toolCall = event.toolCall;
          if (!toolCall) return;
          log.event("gm-tool-loop.tool-call.finish", {
            transportSuccess: event.success,
            toolName: toolCall.toolName,
            toolCallId: toolCall.toolCallId,
            durationMs: event.durationMs,
          });
        },
      }),
    );

    rawToolCalls = collectToolCalls(
      (result.steps ?? []) as unknown as Parameters<typeof collectToolCalls>[0],
    );
    const unsafeMultiToolStepIndex = firstUnsafeMultiToolStepIndex(
      result.steps ?? [],
      profile.activeTools,
    );
    stepResults = rawToolCalls.map((call, index) =>
      toToolStepResult(
        call,
        index,
        args.tick,
        args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
      ));
    const successCount = stepResults.filter((step) => step.result?.success === true).length;
    const failureCount = stepResults.length - successCount;
    reasoningText = extractReasoningText(result);
    const isStatusReadProfile = profile.name === "broad_status_read_observation";
    const statusReadObservationSucceeded = isStatusReadProfile
      && stepResults.some(isSuccessfulObservationStep);
    if (isStatusReadProfile && !statusReadObservationSucceeded) {
      assertStatusReadCompletionText(result.text);
    }
    toolLoopText = statusReadObservationSucceeded ? "" : result.text;
    observationSummary = isStatusReadProfile
      ? buildStatusReadObservationSummary(stepResults)
      : undefined;

    log.event("judge.gm-tool-loop", {
      profile: profile.name,
      activeTools: profile.activeTools,
      gmReadPath: args.gmRead.path,
      runtimeRequirementKind: runtimeRequirement?.kind ?? "none",
      runtimeRequirementSource,
      finishReason: result.finishReason,
      responseModel: result.response?.modelId ?? null,
      usage: result.usage ?? null,
      textLen: toolLoopText.length,
      rawTextLen: result.text.length,
      discardedTextLen: result.text.length - toolLoopText.length,
      observationSummaryLen: observationSummary?.length ?? 0,
      reasoningLen: reasoningText?.length ?? 0,
      stepCount: result.steps?.length ?? 0,
      toolCallCount: rawToolCalls.length,
      successCount,
      failureCount,
      toolCallNames: rawToolCalls.map((call) => call.tool),
      durationMs: Date.now() - startMs,
    });

    if (reasoningText) {
      log.event("judge.reasoning", {
        source: "gm-tool-loop",
        reasoningText,
        responseModel: result.response?.modelId ?? null,
        usage: result.usage ?? null,
      });
    }

    if (unsafeMultiToolStepIndex !== null) {
      throw new Error(
        `GM tool loop emitted multiple runtime tool calls in assistant step ${unsafeMultiToolStepIndex + 1}; only settled observation-only runtime tool results may share a step. State-bearing, malformed, or unpaired tool calls must be observed one at a time.`,
      );
    }
    if (rawToolCalls.length === 0) {
      throw new Error("GM tool loop produced no runtime tool calls for a tool-backed GM path.");
    }
    if (successCount === 0) {
      throw new Error("GM tool loop produced no successful backend observations.");
    }
    if (
      requiredTerminalTool
      && !hasAcceptedTerminalReceiptInStepResults(runtimeRequirement, stepResults)
      && !hasRequiredTerminalToolCallInStepResults(runtimeRequirement, stepResults)
    ) {
      const closurePrompt = buildTerminalClosurePrompt({
        args,
        profile,
        requiredTool: requiredTerminalTool,
        priorStepResults: stepResults,
      });
      const closureTools = filterToolsToAllowed(
        tools as ReturnType<typeof createStorytellerTools>,
        [requiredTerminalTool],
      );
      const closureStartMs = Date.now();
      const closureResult = await withRole("judge", () =>
        generateText({
          model,
          tools: closureTools,
          activeTools: [requiredTerminalTool],
          temperature: 0,
          maxOutputTokens: profile.maxOutputTokens,
          timeout: { totalMs: profile.timeoutMs },
          providerOptions: GM_TOOL_LOOP_SEQUENTIAL_TOOL_PROVIDER_OPTIONS,
          maxRetries: GM_TOOL_LOOP_TRANSPORT_MAX_RETRIES,
          stopWhen: terminalClosureStopWhen,
          system: [
            "You are the GM/Judge runtime terminal-closure agent.",
            "Your only job is to close the already-started runtime contract with the required terminal tool.",
            "Do not narrate to the player in this pass.",
          ].join(" "),
          prompt: closurePrompt,
          experimental_onToolCallStart(event) {
            const toolCall = event.toolCall;
            if (!toolCall) return;
            log.event("gm-tool-loop.terminal-closure.tool-call.start", {
              toolName: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
            });
          },
          experimental_onToolCallFinish(event) {
            const toolCall = event.toolCall;
            if (!toolCall) return;
            log.event("gm-tool-loop.terminal-closure.tool-call.finish", {
              transportSuccess: event.success,
              toolName: toolCall.toolName,
              toolCallId: toolCall.toolCallId,
              durationMs: event.durationMs,
            });
          },
        }),
      );

      const closureResultRecord: Record<string, unknown> = isRecord(closureResult)
        ? closureResult
        : {};
      const closureSteps = Array.isArray(closureResultRecord.steps)
        ? closureResultRecord.steps
        : [];
      const closureRawToolCalls = collectToolCalls(
        closureSteps as unknown as Parameters<typeof collectToolCalls>[0],
      );
      const closureStepResults = closureRawToolCalls.map((call, index) =>
        toToolStepResult(
          call,
          index,
          args.tick,
          args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
          stepResults.length,
        ));
      rawToolCalls = [...rawToolCalls, ...closureRawToolCalls];
      stepResults = [...stepResults, ...closureStepResults];
      const closureReasoningText = isRecord(closureResult)
        ? extractReasoningText(closureResult)
        : undefined;
      const closureResponseModel = isRecord(closureResultRecord.response)
        && typeof closureResultRecord.response.modelId === "string"
        ? closureResultRecord.response.modelId
        : null;
      if (closureReasoningText) {
        reasoningText = reasoningText
          ? `${reasoningText}\n\n${closureReasoningText}`
          : closureReasoningText;
        log.event("judge.reasoning", {
          source: "gm-tool-loop.terminal-closure",
          reasoningText: closureReasoningText,
          responseModel: closureResponseModel,
          usage: closureResultRecord.usage ?? null,
        });
      }
      log.event("judge.gm-tool-loop.terminal-closure", {
        profile: profile.name,
        requiredTerminalTool,
        runtimeRequirementKind: runtimeRequirement?.kind ?? "none",
        finishReason: closureResultRecord.finishReason ?? null,
        responseModel: closureResponseModel,
        usage: closureResultRecord.usage ?? null,
        rawTextLen: typeof closureResultRecord.text === "string"
          ? closureResultRecord.text.length
          : 0,
        reasoningLen: closureReasoningText?.length ?? 0,
        stepCount: closureSteps.length,
        toolCallCount: closureRawToolCalls.length,
        successCount: closureStepResults.filter((step) => step.result?.success === true).length,
        failureCount: closureStepResults.filter((step) => step.result?.success !== true).length,
        toolCallNames: closureRawToolCalls.map((call) => call.tool),
        durationMs: Date.now() - closureStartMs,
      });
    }
    assertAppliedNowDialogueEffectsBackedByPriorStructuralReceipts(stepResults);
    assertConversationalToolLoopResolved(args, stepResults);
    const acceptedStepIndexes = assertNoUnacceptedSideEffectingStepsBeforeCommit(
      args,
      stepResults,
      mutationBoundary.trackedStepResults,
    );
    acceptedStepIds = stepResults
      .filter((_step, index) => acceptedStepIndexes.has(index))
      .map((step) => step.stepId);
    acceptedToolResultIds = stepResults
      .filter((_step, index) => acceptedStepIndexes.has(index))
      .map(authorityToolResultId)
      .filter((id): id is string => Boolean(id));
    mutationBoundary.commit();
    } catch (error) {
      try {
        mutationBoundary.rollback();
      } catch (rollbackError) {
        log.warn("Failed to rollback GM tool loop mutation boundary", {
          campaignId: args.campaignId,
          error: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        });
      }
      await retractDurableMemoryForRejectedToolLoop({
        campaignId: args.campaignId,
        stepResults: rejectedToolLoopStepUnion(
          stepResults,
          mutationBoundary.trackedStepResults,
        ),
        reason: error,
      });
      throw error;
    }
  };

  if (profile.activeTools.some(shouldUseGmToolLoopMutationBoundary)) {
    await withSqliteWriteLock(`gm-tool-loop:${args.campaignId}`, executeModelToolLoop);
  } else {
    await executeModelToolLoop();
  }

  return {
    intent: gmToolLoopIntent(args.gmRead),
    text: toolLoopText,
    observationSummary,
    reasoningText,
    stepResults,
    acceptedStepIds,
    acceptedToolResultIds,
    rawToolCalls,
  };
}
