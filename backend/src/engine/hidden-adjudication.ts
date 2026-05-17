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
import { buildHiddenAdjudicationPromptContract } from "./prompt-contracts.js";
import {
  toPlayerFacingQuickActions,
  type PlayerFacingQuickActionsEvent,
} from "./player-facing-events.js";

export const ADJUDICATION_PLAN_ACTION_LIMIT = 8;
export const ADJUDICATION_PLAN_RATIONALE_MAX = 280;
const ADJUDICATION_STATE_MUTATION_TOOLS = new Set<RuntimeToolName>([
  "add_tag",
  "remove_tag",
  "set_relationship",
  "log_event",
  "advance_time",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "set_condition",
  "move_to",
  "transfer_item",
]);

export const adjudicationActionSchema = z.discriminatedUnion("toolName", [
  z.object({ toolName: z.literal("add_tag"), input: runtimeToolInputSchemas.add_tag }),
  z.object({ toolName: z.literal("remove_tag"), input: runtimeToolInputSchemas.remove_tag }),
  z.object({ toolName: z.literal("set_relationship"), input: runtimeToolInputSchemas.set_relationship }),
  z.object({ toolName: z.literal("log_event"), input: runtimeToolInputSchemas.log_event }),
  z.object({ toolName: z.literal("advance_time"), input: runtimeToolInputSchemas.advance_time }),
  z.object({ toolName: z.literal("offer_quick_actions"), input: runtimeToolInputSchemas.offer_quick_actions }),
  z.object({ toolName: z.literal("promote_npc"), input: runtimeToolInputSchemas.promote_npc }),
  z.object({ toolName: z.literal("spawn_item"), input: runtimeToolInputSchemas.spawn_item }),
  z.object({ toolName: z.literal("reveal_location"), input: runtimeToolInputSchemas.reveal_location }),
  z.object({ toolName: z.literal("set_condition"), input: runtimeToolInputSchemas.set_condition }),
  z.object({ toolName: z.literal("move_to"), input: runtimeToolInputSchemas.move_to }),
  z.object({ toolName: z.literal("transfer_item"), input: runtimeToolInputSchemas.transfer_item }),
]);

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
    "If no state mutation is justified, return an empty actions list rather than inventing one.",
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

function getSuccessfulMoveToolResult(result: ToolResult): SuccessfulTravelLike | null {
  const payload = result.result;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const moveResult = payload as Record<string, unknown>;
  if (
    typeof moveResult.locationId !== "string" ||
    typeof moveResult.locationName !== "string" ||
    typeof moveResult.travelCost !== "number" ||
    typeof moveResult.tickAdvance !== "number" ||
    !Array.isArray(moveResult.path)
  ) {
    return null;
  }

  return {
    locationId: moveResult.locationId,
    locationName: moveResult.locationName,
    travelCost: moveResult.travelCost,
    tickAdvance: moveResult.tickAdvance,
    path: moveResult.path.filter((entry): entry is string => typeof entry === "string"),
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
  let successfulTravel: SuccessfulTravelLike | null = null;
  const stateMutationActions = args.plan.actions.filter((action) =>
    ADJUDICATION_STATE_MUTATION_TOOLS.has(action.toolName),
  );

  if (stateMutationActions.length > 1) {
    throw new Error(
      "Adjudication plan rejected before execution: legacy hidden adjudication may execute at most one state-bearing action. Use the GM tool loop/scene-plan pipeline for multi-step mutations.",
    );
  }

  for (const action of args.plan.actions) {
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

    if (action.toolName === "move_to") {
      const moveResult = getSuccessfulMoveToolResult(toolResult);
      successfulTravel = moveResult ?? successfulTravel;
      if (moveResult) {
        emittedEvents.push({
          type: "state_update",
          data: {
            type: "location_change",
            locationId: moveResult.locationId,
            locationName: moveResult.locationName,
            travelCost: moveResult.travelCost,
            tickAdvance: moveResult.tickAdvance,
            path: moveResult.path,
          },
        });
        continue;
      }
    }

  }

  return {
    toolCallResults,
    emittedEvents,
    quickActionsEmitted,
    successfulTravel,
  };
}
