import { generateText, stepCountIs, type StopCondition } from "ai";

import { extractReasoningText } from "../ai/extract-reasoning-text.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import type { OracleResult } from "./oracle.js";
import { collectToolCalls, type CollectedToolCall } from "./parse-helpers.js";
import type { GmRead } from "./gm-turn-read.js";
import {
  grantsClaimedAccessFromUnconfirmedProof,
  isUnconfirmedAccessProofClaim,
  UNCONFIRMED_ACCESS_CLAIM_TOOL_ERROR,
} from "./player-action-epistemics.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  type ModelFacingSceneView,
  redactModelFacingJson,
  shouldDropModelFacingText,
} from "./model-facing-scene.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createPlayerTurnToolExecutionContext,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { createStorytellerTools, type RuntimeToolName } from "./tool-schemas.js";
import type { ToolResult } from "./tool-executor.js";
import { isObservationToolResult } from "./tool-result.js";
import type { GmToolStepResult } from "./gm-tool-step.js";
import {
  dynamicCreationBudgetExceededError,
  dynamicCreationBudgetKey,
} from "./gm-tool-budget.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";
import { hasFutureRelevantConcretePressure } from "./future-relevant-pressure.js";
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

interface GmToolLoopProfile {
  name: GmToolLoopProfileName;
  activeTools: RuntimeToolName[];
  maxSteps: number;
  timeoutMs: number;
  maxOutputTokens: number;
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
            : {
                success: false,
                error: "Tool result was not returned by the runtime source-boundary guard.",
              };
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

        const result = await originalExecute(input, ...rest);
        return isToolResult(result)
          ? result
          : {
              success: false,
              error: "Tool result was not returned by the procedural dialogue outcome guard.",
            };
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
        : {
            success: false,
            error: "Tool result was not returned by the world fact requirement guard.",
          };
    },
  } as typeof worldFactToolDef;

  return guardedTools;
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
            return {
              success: false,
              error: "Tool result was not returned by the runtime tool loop.",
            };
          }
          if (budgetKey && result.success) {
            dynamicCreationKeys.add(budgetKey);
          }
          applySuccessfulToolObservationToExecutionContext({
            toolName: runtimeToolName,
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
            : {
                success: false,
                error: "Tool result was not returned by the runtime access-claim guard.",
              };
        },
      } as StorytellerToolDef;

      return [toolName, wrappedTool];
    }),
  ) as Partial<StorytellerToolSet>;
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  forbiddenPrivateTerms: readonly string[] = [],
): string {
  if (!recentConversation || recentConversation.length === 0) {
    return "- none";
  }

  const forbiddenTerms = forbiddenPrivateTerms
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);

  const lines = recentConversation
    .slice(-8)
    .filter((entry) => {
      const content = entry.content.toLowerCase();
      return !forbiddenTerms.some((term) => content.includes(term));
    })
    .map((entry) => `- ${entry.role}: ${entry.content}`)
    .join("\n");

  return lines || "- none";
}

function scopedForecastForPrompt(
  scopedForecastExcerpt?: ScopedForecastExcerpt | null,
): Pick<ScopedForecastExcerpt, "version" | "baseTick" | "promptReady" | "entries"> | null {
  if (!scopedForecastExcerpt) return null;
  return {
    version: scopedForecastExcerpt.version,
    baseTick: scopedForecastExcerpt.baseTick,
    promptReady: scopedForecastExcerpt.promptReady,
    entries: scopedForecastExcerpt.entries,
  };
}

function buildCandidateRefsForPrompt(view: ModelFacingSceneView): unknown {
  const locationRef = (id: string | null | undefined): string | null => {
    const trimmed = id?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("location:") ? trimmed : `location:${trimmed}`;
  };
  const actorRef = (id: string | null | undefined): string | null => {
    const trimmed = id?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("actor:") ? trimmed : `actor:${trimmed}`;
  };
  const itemRef = (id: string | null | undefined): string | null => {
    const trimmed = id?.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("item:") ? trimmed : `item:${trimmed}`;
  };

  return {
    current: {
      currentLocation: {
        alias: "current_location",
        id: view.localScene.currentLocationId,
        ref: locationRef(view.localScene.currentLocationId),
        label: view.localScene.currentLocationName ?? null,
      },
      currentScene: {
        alias: "current_scene",
        id: view.localScene.currentSceneScopeId,
        ref: locationRef(view.localScene.currentSceneScopeId),
        label: view.localScene.currentSceneScopeName ?? null,
      },
    },
    actors: view.visibleActors.map((actor) => ({
      id: actor.id,
      actorId: actor.actorId,
      ref: actor.id.startsWith("actor:") ? actor.id : `actor:${actor.id}`,
      label: actor.label,
      awareness: actor.awareness,
    })),
    targets: view.legalTargets.map((candidate) => ({
      id: candidate.id,
      ref:
        candidate.type === "location"
          ? locationRef(candidate.locationId ?? candidate.id)
          : candidate.type === "actor"
            ? actorRef(candidate.actorId ?? candidate.id)
            : candidate.type === "item"
              ? itemRef(candidate.itemId ?? candidate.id)
              : candidate.id,
      label: candidate.label,
      type: candidate.type,
    })),
    movements: view.legalMovement.map((candidate) => ({
      id: candidate.id,
      ref: locationRef(candidate.locationId ?? candidate.id),
      label: candidate.label,
    })),
  };
}

function gmReadRuntimeRequirement(args: RunGmToolLoopArgs): NonNullable<GmRead["runtimeRequirement"]> | null {
  if (args.gmRead.path !== "tool_plan") return null;
  const requirement = args.gmRead.runtimeRequirement;
  return requirement && requirement.kind !== "none" ? requirement : null;
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

function selectGmToolLoopProfile(args: RunGmToolLoopArgs): GmToolLoopProfile {
  const requestedMaxOutputTokens = args.maxOutputTokens ?? GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS;
  if (isReusableProceduralInformationTurn(args)) {
    const requestedProceduralMaxOutputTokens =
      args.maxOutputTokens ?? GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS;
    return {
      name: "procedural_conversation_outcome",
      activeTools: args.frame.allowedTools.filter((toolName) =>
        PROCEDURAL_CONVERSATION_TOOLS.has(toolName),
      ),
      maxSteps: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
      timeoutMs: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
      maxOutputTokens: Math.min(
        requestedProceduralMaxOutputTokens,
        GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS,
      ),
    };
  }
  if (isBroadStatusReadToolLoop(args)) {
    return {
      name: "broad_status_read_observation",
      activeTools: args.frame.allowedTools.filter((toolName) =>
        STATUS_READ_OBSERVATION_TOOLS.has(toolName),
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
      activeTools: args.frame.allowedTools.filter((toolName) =>
        WORLD_FACT_RECORDING_TOOLS.has(toolName),
      ),
      maxSteps: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
      timeoutMs: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
      maxOutputTokens: Math.min(
        requestedWorldFactMaxOutputTokens,
        GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS,
      ),
    };
  }

  return {
    name: "default_runtime_execution",
    activeTools: [...args.frame.allowedTools],
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
      "Use only the listed conversation/procedure tools. Do not create locations, items, movement, access, possession, combat, relationships, or persistent/key actors in this profile.",
      "Use a lookup only when needed to verify visible people, carried/visible documents, or current/known facts before recording the dialogue outcome.",
      "If no legal non-player speakerRef is visible but the current scene plausibly contains an ordinary responder, create one temporary current-scene responder first with create_scene_extra using role clerk/service/support/witness/vendor/courier/porter. Then use the returned id/name as speakerRef in record_dialogue_outcome.",
      "Create at most one temporary responder in this profile, and only when that responder is needed to answer, refuse, redirect, witness, or make the current public/service scene playable.",
      "If the player states a question, reports a block, or shows documents, do not spend a step recording the player's intent here. The player action is already the intent; call record_dialogue_outcome for the NPC/source answer, refusal, silence, gesture, warning, redirect, unavailable role, or no-current-answer result.",
      "For record_dialogue_outcome, semantics live in outcomeKind/topicKind/authorityKind/truthStatus/futureUseKind and claims. quote and summary may be any language and are display/evidence only.",
      "Legal refs for speakerRef, addresseeRefs, and sourceRefs must be copied exactly from CANDIDATE REFS or from a successful tool result in this loop.",
      "Role or office words from the player action are not refs. Put them in requestedRoleText; never use a role label like dispatcher/clerk/office/warden as speakerRef or sourceRefs unless it appears as a legal ref or was returned by create_scene_extra.",
      "If the requested role or authority is not currently visible and the scene does not plausibly support a temporary responder, use record_dialogue_outcome with outcomeKind unavailable or no_current_answer, authorityKind no_visible_authority, requestedRoleText, and no speakerRef.",
      "For unavailable/no_current_answer, sourceRefs should cite an existing legal ref such as Player, current_scene, current_location, the visible place/object/document the player used, or a player-known fact. Do not cite the unavailable role as a source ref.",
      "For reusable procedure questions, no-answer/unavailable-role outcomes are still procedural outcomes. Record them as durable record_dialogue_outcome with futureUseKind and futureRelevance when they constrain the player's next route, office, evidence, safety choice, or later attempt.",
      "Use durable record_dialogue_outcome with futureRelevance for reusable procedural answers, document failures, named offices, citations, permissions, prohibitions, route facts, warnings, or obligations. Do not stop after only advance_time, lookup, record_player_intent, or log_event.",
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
      "For the current place, prefer CANDIDATE REFS current.currentScene.ref/current.currentLocation.ref or aliases current_scene/current_location. Do not invent location:<id>; copy it.",
      "If a concept like a notice board, date gap, route-log mismatch, office name, permit, or procedure is not an exact legal ref, put it in claims[].subjectText/summary, not in claims[].subjectRef, subjectRefs, or sourceRefs.",
      "Do not use log_event, record_dialogue_outcome, or final assistant prose to satisfy world_fact.",
      "Stop as soon as record_world_fact succeeds; do not keep probing tools to improve prose.",
    ].join("\n");
  }

  return [
    "PROFILE: broad_status_read_observation",
    "This turn is a broad observe/take-stock/status-read request. Answer by reading existing visible/legal state, not by materializing a bespoke scene.",
    "Use observation-only lookup tools only. Do not call start_search, create_minor_poi, create_scene_extra, spawn_npc, spawn_item, reveal_location, move_to, log_event, record_player_intent, or advance_time for this profile.",
    "One broad lookup is usually enough; use at most one targeted follow-up lookup when the first observation leaves the requested visible category unanswered.",
    "If a lookup returns success:false, read the error and try a different allowed observation lookup instead of stopping.",
    "Stop as soon as observations give the final narrator enough existing visible affordances, routes, people, objects, or local status to describe the next playable choice.",
    `After the last tool observation, output exactly ${GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL} and no other text. Do not summarize the status in assistant text here; this profile records tool observations only.`,
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
    "Do not write final player-facing narration here. The visible narrator runs after backend observations settle.",
    "Use observation-only lookup tools for fuzzy low-risk intent before asking exact-ID questions. Read their observations, then choose a legal state tool or stop only if observation is enough.",
    "Lookup observations never mutate world state and never reveal hidden/private/offscreen names; do not treat lookup candidates as completed movement or created facts.",
    "Do not satisfy future-relevant concrete pressure in assistant prose. If this pass introduces actors, props, obligations, routes, combat posture, danger changes, or aftermath that should matter later, it must be represented by successful existing runtime tools.",
    "If a tool returns success:false, do not restate the same invalid call. Correct it only if the model-facing scene refs make a legal correction obvious.",
    "Use only model-facing refs, visible actors, legal targets, legal movement, and allowed tools.",
    "Do not invent backend IDs, offscreen actors, remote locations, hidden private facts, or state deltas.",
    "Recent transcript is continuity, not legal refs. Tool participants/targets must be clear local/current refs in the model-facing view or a successful observation from this loop.",
    "Scoped forecast pressure is advisory only. It may explain why a local signal matters, but it never expands legal refs or scripts an outcome.",
    "Do not copy hidden/private forecast wording into tool inputs. Translate pressure into visible/public language; if a private-source-boundary guard rejects a tool, rewrite the tool input without repeating the forbidden wording.",
    "When the player intentionally waits, travels, rests, shops, observes, trains, researches, or names elapsed time, call advance_time with the GM-estimated in-world minutes before later state tools for that same beat.",
    "",
    formatGmToolLoopProfilePrompt(profile),
    "",
    "LOCALITY AND CREATION ORDER",
    "- If the turn needs a specific newly discovered/entered place (back room, booth, alley mouth, office, hatch, service door area) and it is not already in legal movement/location refs, call reveal_location first, anchored to current_scene or current_location.",
    "- For reveal_location.connectedToName, prefer the literal alias current_scene/current_location. Only use a location label if you copy an exact legal ref from the model-facing view; never shorten or paraphrase it.",
    "- If the player actually enters that new place, call move_to after reveal_location succeeds, then use the move_to observation as the current scene for later tools.",
    "- Do not use spawn_npc, spawn_item, log_event, or final text to imply an unrevealed local place exists before the backend has accepted reveal_location.",
    "- Support NPCs are allowed when the scene needs someone concrete to answer, oppose, guide, trade, witness, or make the place playable. They should be spawned into the current scene/current location or a just-revealed observed location, not a guessed remote place.",
    "- Items are allowed when a tangible thing becomes persistent, transferable, inspectable, usable, owned, or likely to matter later. Do not spawn incidental set dressing, implied props, or generic scenery; describe those later in narration instead.",
    "- Use durable log_event only for a new future-relevant fact that is not a possession/access/item-use/movement claim. Successful spawn_item, transfer_item, move_to, and reveal_location results already carry those concrete facts.",
    "- Use scene_local log_event for attempted, refused, witnessed, conversational, or bluff beats; if an NPC's suspicion should persist, prefer a concrete NPC/location consequence tool when one is justified by legal refs.",
    "- Future-relevant pressure checklist: raised voices tied to an inspection dispute, named/role actors who continue acting, waxed cloth or manifests that create an obligation, recessed doors/stairs/routes, defensive posture, danger changes, or aftermath after violence require state-bearing tool observations. Do not leave them only in text.",
    "- Low-stakes sensory color is allowed for final narration later when it creates no durable actor, prop, route, obligation, combat state, danger change, or aftermath.",
    "- Locked/restricted access: do not call reveal_location or move_to to let a player through a false or unconfirmed key/permit/authority claim by inventing another method. No sudden lockpicks, seal-breaking tools, hidden credentials, or unlisted specialty skills.",
    "- A player's claim that they already have a key, permit, pass, credential, or authority is not backend proof. Even on an Oracle hit, do not create the claimed item, open restricted access, or move through it unless current model-facing refs already confirm the proof exists.",
    "- If an unconfirmed access claim cannot be proven from backend state, legal outcomes are refusal, suspicion, alarm, a request for proof, or a visible failed attempt. Use scene_local log_event/add_tag/offer_quick_actions rather than access-granting tools.",
    "- Names can be private facts too. If the player names a person, faction, place, or authority that is not present in model-facing refs, treat that exact name as raw player claim text only: do not record it as confirmed identity, location, consent, or authority. Prefer phrasing tool inputs as the named authority/person from the player's claim unless a visible/current ref already exposes the exact name.",
    "",
    "CONVERSATION COMPLETION",
    "- If the player asks, speaks to, negotiates with, or questions a visible/current-scene NPC or a support NPC you create, do not stop after only create_scene_extra, spawn_npc, record_player_intent, advance_time, or a log_event that only repeats the player's request.",
    "- Before stopping a conversational turn, create at least one successful record_dialogue_outcome that structurally records the NPC/source answer, refusal, warning, silence, gesture, redirect, unavailable role, or no-current-answer result.",
    "- Use scene_local record_dialogue_outcome for an immediate non-durable exchange; use durable record_dialogue_outcome with futureUseKind/futureRelevance for reusable leads, names, procedures, warnings, permissions, obligations, route facts, or promises.",
    "- Do not use log_event text to satisfy an NPC answer/refusal/silence/warning. log_event is legacy memory/fact logging, not a dialogue outcome contract.",
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "GM READ",
    JSON.stringify(redactModelFacingJson(args.gmRead, scenePacket.safety), null, 2),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(scenePacket.view, null, 2),
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
      ? JSON.stringify(redactModelFacingJson(args.oracleResult, scenePacket.safety), null, 2)
      : "- none",
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(scopedForecastForPrompt(args.scopedForecastExcerpt), null, 2),
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation?.filter(
        (entry) => !shouldDropModelFacingText(entry.content, scenePacket.safety),
      ),
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
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
  if ("output" in result) return result.output;
  if ("result" in result) return result.result;
  return result;
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

type ToolLoopStepForCollection = Parameters<typeof collectToolCalls>[0][number];

function isSuccessfulObservationOnlyToolResult(result: ToolResult): boolean {
  return result.success === true
    && result.kind !== "mutation"
    && isObservationToolResult(result)
    && (result.authority?.stateDeltaRefs.length ?? 0) === 0;
}

function isSuccessfulObservationOnlyToolCall(call: CollectedToolCall): boolean {
  return isToolResult(call.result)
    && isSuccessfulObservationOnlyToolResult(call.result);
}

function firstUnsafeMultiToolStepIndex(
  steps: unknown[],
  activeTools: readonly RuntimeToolName[],
): number | null {
  const activeToolNames = new Set<string>(activeTools);
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    if (!isRecord(step)) continue;
    const toolCalls = step.toolCalls;
    if (!Array.isArray(toolCalls) || toolCalls.length <= 1) continue;
    if (!toolCalls.every(isRecord)) {
      return index;
    }

    const collectedCalls = collectToolCalls([step as ToolLoopStepForCollection]);
    if (collectedCalls.length !== toolCalls.length) {
      return index;
    }

    const allCallsAreSafeObservations = collectedCalls.every((call) =>
      activeToolNames.has(call.tool)
      && isSuccessfulObservationOnlyToolCall(call)
    );
    if (!allCallsAreSafeObservations) {
      return index;
    }
  }
  return null;
}

const STATE_BEARING_RUNTIME_TOOLS = new Set<RuntimeToolName>([
  "add_chronicle_entry",
  "add_tag",
  "create_minor_poi",
  "create_scene_extra",
  "move_to",
  "move_actor",
  "promote_npc",
  "record_player_intent",
  "record_dialogue_outcome",
  "record_world_fact",
  "remove_tag",
  "reveal_location",
  "set_condition",
  "set_relationship",
  "spawn_item",
  "spawn_npc",
  "start_search",
  "transfer_item",
]);

function isSceneLocalLogEvent(step: GmToolStepResult): boolean {
  if (step.toolName !== "log_event") return false;
  const durabilityFromInput = isRecord(step.candidateInput)
    ? stringField(step.candidateInput, "durability")
    : null;
  const result = step.result?.result;
  const resultRecord = isRecord(result) ? result : null;
  const durabilityFromResult = resultRecord ? stringField(resultRecord, "durability") : null;
  if (durabilityFromInput === "durable" || durabilityFromResult === "durable") return false;
  if (resultRecord?.persisted === true) return false;
  return true;
}

function isAcceptedStateBearingObservation(step: GmToolStepResult): boolean {
  if (step.result?.success !== true) return false;
  if (!step.toolName) return false;
  if (STATE_BEARING_RUNTIME_TOOLS.has(step.toolName)) return true;
  if (step.toolName === "log_event") {
    return !isSceneLocalLogEvent(step);
  }
  return false;
}

function toolLoopTextHasFutureRelevantPressure(text: string): boolean {
  return hasFutureRelevantConcretePressure(text);
}

function assertToolLoopTextGroundedByStateBearingObservation(
  text: string,
  stepResults: readonly GmToolStepResult[],
): void {
  if (!toolLoopTextHasFutureRelevantPressure(text)) return;
  if (stepResults.some(isAcceptedStateBearingObservation)) return;
  throw new Error(
    "GM tool loop emitted future-relevant concrete pressure in prose without an accepted state-bearing backend observation.",
  );
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
  for (const key of ["label", "name", "ref", "id"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
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
  const inputPayload = isRecord(step.candidateInput) ? step.candidateInput : null;
  return resultPayload
    && stringField(resultPayload, "outcomeKind")
    && stringField(resultPayload, "topicKind")
    && stringField(resultPayload, "authorityKind")
    && stringField(resultPayload, "truthStatus")
    ? resultPayload
    : inputPayload ?? resultPayload;
}

function isDialogueOutcomeStep(step: GmToolStepResult): boolean {
  const payload = dialogueOutcomePayload(step);
  return Boolean(
    payload
    && stringField(payload, "outcomeKind")
    && stringField(payload, "topicKind")
    && stringField(payload, "authorityKind")
    && stringField(payload, "truthStatus"),
  );
}

function isDurableDialogueOutcomeStep(step: GmToolStepResult): boolean {
  const payload = dialogueOutcomePayload(step);
  if (!payload) return false;
  return isDialogueOutcomeStep(step)
    && stringField(payload, "durability") === "durable"
    && Boolean(stringField(payload, "futureUseKind"))
    && Boolean(stringField(payload, "futureRelevance"));
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

function isWorldFactStep(step: GmToolStepResult): boolean {
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
    const worldFactSteps = stepResults.filter(isWorldFactStep);
    const hasWorldFact = worldFactSteps.length > 0;
    if (!hasWorldFact) {
      throw new Error(
        "GM tool loop ended a world_fact turn without a structural record_world_fact result.",
      );
    }
    if (
      requirement.topicKind
      && !worldFactSteps.some((step) =>
        matchesRequiredTopicKind(worldFactPayload(step), requirement.topicKind))
    ) {
      throw new Error(
        `GM tool loop ended a world_fact turn without a structural record_world_fact matching topicKind ${requirement.topicKind}.`,
      );
    }
    return;
  }
  if (requirement?.kind !== "dialogue_outcome") return;
  const dialogueOutcomeSteps = stepResults.filter(isDialogueOutcomeStep);
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
    && !dialogueOutcomeSteps.some((step) =>
      isDurableDialogueOutcomeStep(step)
      && matchesRequiredTopicKind(dialogueOutcomePayload(step), requirement.topicKind))
  ) {
    throw new Error(
      "GM tool loop ended a reusable procedural conversation without a durable future-relevant record_dialogue_outcome.",
    );
  }
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
): GmToolStepResult {
  const toolResult = isToolResult(call.result)
    ? call.result
    : {
        success: false,
        error: "Tool result was not returned by the runtime tool loop.",
      };
  const input = (
    call.args && typeof call.args === "object" && !Array.isArray(call.args)
      ? call.args
      : {}
  ) as Record<string, unknown>;
  const toolName = call.tool as RuntimeToolName;

  return {
    stepId: `tool-call-${index + 1}`,
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
  const runtimeRequirementSource = runtimeRequirement ? "typed" : "none";

  const model = createModel(args.provider, { role: "judge", reasoningMode: "bypass" });
  const executionContext = createPlayerTurnToolExecutionContext(args.frame);
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
  const tools = withDynamicCreationBudget(
    requirementGuardedTools,
    executionContext,
  );
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const prompt = buildGmToolLoopPrompt(args, profile);
  const stopWhen = profile.name === "broad_status_read_observation"
    ? [
        stepCountIs(profile.maxSteps),
        hasSuccessfulStatusReadObservation(profile.activeTools),
      ]
    : stepCountIs(profile.maxSteps);
  const startMs = Date.now();

  log.event("model-facing.scene-packet", {
    source: "gm-tool-loop",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

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
          success: event.success,
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          durationMs: event.durationMs,
        });
      },
    }),
  );

  const rawToolCalls = collectToolCalls(
    (result.steps ?? []) as unknown as Parameters<typeof collectToolCalls>[0],
  );
  const unsafeMultiToolStepIndex = firstUnsafeMultiToolStepIndex(
    result.steps ?? [],
    profile.activeTools,
  );
  if (unsafeMultiToolStepIndex !== null) {
    throw new Error(
      `GM tool loop emitted multiple runtime tool calls in assistant step ${unsafeMultiToolStepIndex + 1}; only successful observation-only runtime tool results may share a step. State-bearing, failed, malformed, or unpaired tool calls must be observed one at a time.`,
    );
  }
  const stepResults = rawToolCalls.map((call, index) =>
    toToolStepResult(
      call,
      index,
      args.tick,
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    ));
  const successCount = stepResults.filter((step) => step.result?.success === true).length;
  const failureCount = stepResults.length - successCount;
  const reasoningText = extractReasoningText(result);
  const isStatusReadProfile = profile.name === "broad_status_read_observation";
  const statusReadObservationSucceeded = isStatusReadProfile
    && stepResults.some(isSuccessfulObservationStep);
  if (isStatusReadProfile && !statusReadObservationSucceeded) {
    assertStatusReadCompletionText(result.text);
  }
  const toolLoopText = statusReadObservationSucceeded ? "" : result.text;
  const observationSummary = isStatusReadProfile
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

  assertToolLoopTextGroundedByStateBearingObservation(toolLoopText, stepResults);

  if (rawToolCalls.length === 0) {
    throw new Error("GM tool loop produced no runtime tool calls for a tool-backed GM path.");
  }
  if (successCount === 0) {
    throw new Error("GM tool loop produced no successful backend observations.");
  }
  assertConversationalToolLoopResolved(args, stepResults);

  return {
    intent: gmToolLoopIntent(args.gmRead),
    text: toolLoopText,
    observationSummary,
    reasoningText,
    stepResults,
    rawToolCalls,
  };
}
