import { executeToolCall, type ToolResult } from "./tool-executor.js";
import { createLogger } from "../lib/index.js";
import type { SuccessfulTravelLike } from "./hidden-adjudication.js";
import type { ScenePlanAction } from "./scene-plan-schema.js";
import type { ValidatedScenePlan } from "./scene-plan-validator.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  createScenePlanActionToolExecutionContext,
  createPlayerTurnToolExecutionContext,
  validateToolPlanGrounding,
  type ToolExecutionContext,
} from "./tool-execution-context.js";

const log = createLogger("scene-plan-executor");

export interface ExecutedScenePlanActionResult {
  order: number;
  actionId: string;
  actionRef: string;
  actorId: string;
  toolName: ScenePlanAction["toolName"];
  input: ScenePlanAction["input"];
  args: Record<string, unknown>;
  result: ToolResult;
}

export interface ExecutedScenePlanCanonicalEvent {
  id: string;
  actionId: string;
  actorId: string;
  toolName: ScenePlanAction["toolName"];
  result: ToolResult["result"];
}

export interface ExecutedScenePlan {
  plan: ValidatedScenePlan;
  validatedPlan: ValidatedScenePlan;
  toolCallResults: ExecutedScenePlanActionResult[];
  actionResults: ExecutedScenePlanActionResult[];
  emittedEvents: Array<
    | { type: "quick_actions"; data: ToolResult }
    | { type: "state_update"; data: unknown }
  >;
  quickActionsEmitted: boolean;
  successfulTravel: SuccessfulTravelLike | null;
  canonicalEvents: ExecutedScenePlanCanonicalEvent[];
}

interface ExecuteScenePlanBaseArgs {
  campaignId: string;
  tick: number;
  outcomeTier?: string;
  executionContext?: ToolExecutionContext;
}

export type ExecuteScenePlanArgs = ExecuteScenePlanBaseArgs & (
  | { plan: ValidatedScenePlan; validatedPlan?: never }
  | { validatedPlan: ValidatedScenePlan; plan?: never }
);

export class ScenePlanExecutionError extends Error {
  constructor(
    message: string,
    public readonly partial: ExecutedScenePlan,
  ) {
    super(message);
    this.name = "ScenePlanExecutionError";
  }
}

function getSuccessfulMoveToolResult(result: ToolResult): SuccessfulTravelLike | null {
  const payload = result.result;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const moveResult = payload as Record<string, unknown>;
  if (
    typeof moveResult.locationId !== "string"
    || typeof moveResult.locationName !== "string"
    || typeof moveResult.travelCost !== "number"
    || !Array.isArray(moveResult.path)
  ) {
    return null;
  }

  const tickAdvance = typeof moveResult.tickAdvance === "number"
    ? moveResult.tickAdvance
    : moveResult.travelCost;

  return {
    locationId: moveResult.locationId,
    locationName: moveResult.locationName,
    travelCost: moveResult.travelCost,
    tickAdvance,
    path: moveResult.path.filter((entry): entry is string => typeof entry === "string"),
  };
}

function buildExecutedScenePlanSnapshot(input: {
  validatedPlan: ValidatedScenePlan;
  toolCallResults: ExecutedScenePlanActionResult[];
  emittedEvents: ExecutedScenePlan["emittedEvents"];
  quickActionsEmitted: boolean;
  successfulTravel: SuccessfulTravelLike | null;
  canonicalEvents: ExecutedScenePlanCanonicalEvent[];
}): ExecutedScenePlan {
  return {
    plan: input.validatedPlan,
    validatedPlan: input.validatedPlan,
    toolCallResults: input.toolCallResults,
    actionResults: input.toolCallResults,
    emittedEvents: input.emittedEvents,
    quickActionsEmitted: input.quickActionsEmitted,
    successfulTravel: input.successfulTravel,
    canonicalEvents: input.canonicalEvents,
  };
}

export async function executeScenePlan(
  args: ExecuteScenePlanArgs,
): Promise<ExecutedScenePlan> {
  const validatedPlan = args.plan ?? args.validatedPlan;
  const toolCallResults: ExecutedScenePlanActionResult[] = [];
  const emittedEvents: ExecutedScenePlan["emittedEvents"] = [];
  let quickActionsEmitted = false;
  let successfulTravel: SuccessfulTravelLike | null = null;
  const canonicalEvents: ExecutedScenePlanCanonicalEvent[] = [];
  const executionContext =
    args.executionContext ?? createPlayerTurnToolExecutionContext(validatedPlan.frame);
  const contextForAction = (action: { actorId?: string }) =>
    createScenePlanActionToolExecutionContext({
      context: executionContext,
      frame: validatedPlan.frame,
      actorId: action.actorId ?? executionContext.subjectActorId ?? validatedPlan.frame.playerActorId,
    });
  const groundingIssues = validateToolPlanGrounding({
    actions: validatedPlan.plan.plannedActions,
    context: executionContext,
    contextForAction,
  });
  if (groundingIssues.length > 0) {
    const firstIssue = groundingIssues[0]!;
    log.event("tool.grounding.rejected", {
      toolName: firstIssue.toolName ?? null,
      reasonCode: firstIssue.code,
      path: firstIssue.path,
      scope: executionContext.scope,
      visibleActorCount:
        validatedPlan.frame.roster.active.length
        + validatedPlan.frame.roster.support.filter((actor) => actor.awareness === "clear").length,
      hiddenActorCount:
        validatedPlan.frame.roster.background.length
        + validatedPlan.frame.roster.support.filter((actor) => actor.awareness !== "clear").length,
      localRecentEventCount: validatedPlan.frame.recentEvents.filter(
        (event) => event.perceivableByPlayer,
      ).length,
      allowedToolCount: validatedPlan.frame.allowedTools.length,
      issueCount: groundingIssues.length,
    });
    throw new ScenePlanExecutionError(
      `ScenePlan grounding failed before execution: [${firstIssue.code}] ${firstIssue.message}`,
      buildExecutedScenePlanSnapshot({
        validatedPlan,
        toolCallResults,
        emittedEvents,
        quickActionsEmitted,
        successfulTravel,
        canonicalEvents,
      }),
    );
  }

  for (const [order, action] of validatedPlan.plan.plannedActions.entries()) {
    const toolArgs = action.input as Record<string, unknown>;
    const actionExecutionContext = contextForAction(action);
    const result = await executeToolCall(
      args.campaignId,
      action.toolName,
      toolArgs,
      args.tick,
      args.outcomeTier,
      actionExecutionContext,
    );
    const actionResult: ExecutedScenePlanActionResult = {
      order,
      actionId: action.id,
      actionRef: action.id,
      actorId: action.actorId,
      toolName: action.toolName,
      input: action.input,
      args: toolArgs,
      result,
    };

    toolCallResults.push(actionResult);

    if (!result.success) {
      throw new ScenePlanExecutionError(
        `ScenePlan action failed: ${action.toolName}${result.error ? ` - ${result.error}` : ""}`,
        buildExecutedScenePlanSnapshot({
          validatedPlan,
          toolCallResults,
          emittedEvents,
          quickActionsEmitted,
          successfulTravel,
          canonicalEvents,
        }),
      );
    }

    applySuccessfulToolObservationToExecutionContext({
      toolName: action.toolName,
      result,
      context: executionContext,
    });

    canonicalEvents.push({
      id: action.id,
      actionId: action.id,
      actorId: action.actorId,
      toolName: action.toolName,
      result: result.result,
    });

    if (action.toolName === "offer_quick_actions") {
      quickActionsEmitted = true;
      emittedEvents.push({ type: "quick_actions", data: result });
      continue;
    }

    if (action.toolName === "move_to") {
      const moveResult = getSuccessfulMoveToolResult(result);
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

    emittedEvents.push({ type: "state_update", data: actionResult });
  }

  return buildExecutedScenePlanSnapshot({
    validatedPlan,
    toolCallResults,
    emittedEvents,
    quickActionsEmitted,
    successfulTravel,
    canonicalEvents,
  });
}
