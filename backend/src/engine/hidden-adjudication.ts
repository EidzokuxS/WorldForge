import { z } from "zod";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { executeToolCall, type ToolResult } from "./tool-executor.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";
import {
  buildHiddenAdjudicationPromptContract,
  HIDDEN_ADJUDICATION_TOOL_NAMES,
} from "./prompt-contracts.js";
import {
  toPlayerFacingQuickActions,
  type PlayerFacingQuickActionsEvent,
} from "./player-facing-events.js";

export const ADJUDICATION_PLAN_ACTION_LIMIT = 8;
export const ADJUDICATION_PLAN_RATIONALE_MAX = 280;
const HIDDEN_ADJUDICATION_ALLOWED_TOOL_SET = new Set<RuntimeToolName>(
  HIDDEN_ADJUDICATION_TOOL_NAMES,
);

export const adjudicationActionSchema = z.object({
  toolName: z.literal("offer_quick_actions"),
  input: runtimeToolInputSchemas.offer_quick_actions,
});

export const adjudicationPlanSchema = z.object({
  rationale: z
    .string()
    .max(ADJUDICATION_PLAN_RATIONALE_MAX)
    .describe("Short hidden rationale for audit/debug only. Do not write prose."),
  actions: z
    .array(adjudicationActionSchema)
    .max(ADJUDICATION_PLAN_ACTION_LIMIT)
    .describe("Ordered backend actions to execute for this turn."),
});

export type AdjudicationAction = z.infer<typeof adjudicationActionSchema>;
export type AdjudicationPlan = z.infer<typeof adjudicationPlanSchema>;

export interface HiddenAdjudicationPlanResult extends AdjudicationPlan {
  trace?: SafeGenerateTrace;
}

export interface SuccessfulTravelLike {
  locationId: string;
  locationName: string;
  travelCost: number;
  tickAdvance: number;
  path: string[];
}

export interface ExecutedAdjudication {
  toolCallResults: Array<{
    tool: RuntimeToolName;
    args: Record<string, unknown>;
    result: ToolResult;
  }>;
  emittedEvents: Array<
    | { type: "quick_actions"; data: PlayerFacingQuickActionsEvent }
    | { type: "state_update"; data: unknown }
  >;
  quickActionsEmitted: boolean;
  successfulTravel: SuccessfulTravelLike | null;
}

export function buildJudgeAdjudicationContract(): string {
  return [
    "This is the hidden judge adjudication pass.",
    buildHiddenAdjudicationPromptContract(),
    "Decide backend actions as structured data only. Do not write narrative prose.",
    "Oracle result, world-brain direction, and authoritative scene facts are binding constraints.",
    "Plan only actions the backend can execute right now.",
    "Order actions exactly as they should execute.",
    "Gameplay mutations belong to the scene-plan/GM tool-loop pipeline; return an empty actions list rather than inventing one.",
    "Keep quick actions grounded in the settled immediate scene and only include them through offer_quick_actions.",
  ].join("\n");
}

export async function runHiddenAdjudicationPlan(args: {
  provider: ProviderConfig;
  system: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens?: number;
}): Promise<HiddenAdjudicationPlanResult> {
  const result = await safeGenerateObject({
    model: createModel(args.provider, { role: "judge" }),
    system: args.system,
    messages: args.messages,
    schema: adjudicationPlanSchema,
    temperature: 0.1,
    maxOutputTokens: args.maxOutputTokens ?? 1400,
    retries: 2,
  });
  return {
    ...result.object,
    trace: result.trace,
  };
}

export async function executeAdjudicationPlan(args: {
  campaignId: string;
  tick: number;
  outcomeTier?: string;
  plan: AdjudicationPlan;
  executionContext: ToolExecutionContext;
}): Promise<ExecutedAdjudication> {
  const toolCallResults: ExecutedAdjudication["toolCallResults"] = [];
  const emittedEvents: ExecutedAdjudication["emittedEvents"] = [];
  let quickActionsEmitted = false;

  for (const action of args.plan.actions) {
    if (!HIDDEN_ADJUDICATION_ALLOWED_TOOL_SET.has(action.toolName)) {
      throw new Error(
        `Adjudication plan rejected before execution: hidden adjudication cannot execute ${action.toolName}. Use the scene-plan/GM tool-loop pipeline for gameplay mutations.`,
      );
    }
    const toolInput = action.input as Record<string, unknown>;
    const toolResult = await executeToolCall(
      args.campaignId,
      action.toolName,
      toolInput,
      args.tick,
      args.outcomeTier,
      args.executionContext,
    );

    const toolCall = {
      tool: action.toolName,
      args: toolInput,
      result: toolResult,
    } satisfies ExecutedAdjudication["toolCallResults"][number];

    toolCallResults.push(toolCall);

    if (!toolResult.success) {
      throw new Error(
        `Adjudication action failed: ${action.toolName}${toolResult.error ? ` — ${toolResult.error}` : ""}`,
      );
    }
    applySuccessfulToolObservationToExecutionContext({
      toolName: action.toolName,
      context: args.executionContext,
      result: toolResult,
    });

    if (action.toolName === "offer_quick_actions") {
      const quickActions = toPlayerFacingQuickActions(toolResult);
      if (quickActions) {
        quickActionsEmitted = true;
        emittedEvents.push({ type: "quick_actions", data: quickActions });
      }
      continue;
    }
  }

  return {
    toolCallResults,
    emittedEvents,
    quickActionsEmitted,
    successfulTravel: null,
  };
}
