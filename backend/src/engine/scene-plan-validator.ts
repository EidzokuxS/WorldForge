import { runtimeToolInputSchemas } from "./tool-schemas.js";
import type { SceneFrame } from "./scene-frame.js";
import type { ScenePlan, ScenePlanAction } from "./scene-plan-schema.js";
import type { NarrativeOutcomeBounds } from "./combat-envelope.js";
import {
  createScenePlanActionToolExecutionContext,
  createPlayerTurnToolExecutionContext,
  validateToolInputGrounding,
  type ToolExecutionContext,
} from "./tool-execution-context.js";

export type ScenePlanValidationIssueCode =
  | "unknown_actor"
  | "display_name_actor_reference"
  | "inactive_primary_actor"
  | "background_actor_action"
  | "hidden_actor_visible_fact"
  | "narrator_fact_prose"
  | "unsupported_tool"
  | "invalid_tool_input"
  | "tool_input_scope"
  | "remote_location_ref"
  | "ambiguous_entity_ref"
  | "hidden_actor_ref"
  | "unexposed_item_ref"
  | "unsupported_action_claim"
  | "outcome_contradiction"
  | "too_many_primary_scene_changers";

export interface ScenePlanValidationIssue {
  code: ScenePlanValidationIssueCode;
  path: string;
  message: string;
}

export interface ValidatedScenePlan {
  frame: SceneFrame;
  plan: ScenePlan;
  issues: ScenePlanValidationIssue[];
}

export type ValidatedScenePlanResult =
  | { ok: true; plan: ValidatedScenePlan }
  | { ok: false; issues: ScenePlanValidationIssue[] };

export class ScenePlanValidationError extends Error {
  constructor(public readonly issues: ScenePlanValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "ScenePlanValidationError";
  }
}

export interface ValidateScenePlanArgs {
  frame: SceneFrame;
  plan: ScenePlan;
  oracleResult?: { outcome?: string | null } | null;
  outcomeBounds?: NarrativeOutcomeBounds | null;
  oracleOutcome?: string;
}

function collectRosterIds(frame: SceneFrame): {
  all: Set<string>;
  active: Set<string>;
  support: Set<string>;
  background: Set<string>;
  displayNameToId: Map<string, string>;
  forbiddenVisibleFacts: Set<string>;
  forbiddenToolTargets: Set<string>;
  clearActorTargets: Set<string>;
  clearNpcTargets: Set<string>;
  playerTargets: Set<string>;
  connectedMovementTargets: Set<string>;
} {
  const actors = [
    ...frame.roster.active,
    ...frame.roster.support,
    ...frame.roster.background,
  ];
  const actorRefs = (actor: (typeof actors)[number]) =>
    [actor.id, actor.actorId, actor.label].filter(
      (value): value is string => Boolean(value),
    );
  const normalizedRefs = (values: string[]) =>
    new Set(
      values
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean),
    );
  const actorIds = actors.flatMap((actor) => [actor.id, actor.actorId]).filter(
    (value): value is string => Boolean(value),
  );
  const forbiddenActorRefs = [
    ...(frame.perception.forbiddenActorIds ?? []),
    ...(frame.perception.forbiddenActorLabels ?? []),
    ...frame.roster.background.flatMap(actorRefs),
    ...frame.roster.support
      .filter((actor) => actor.awareness !== "clear")
      .flatMap(actorRefs),
  ].filter((value): value is string => Boolean(value));
  const clearActors = [
    ...frame.roster.active,
    ...frame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  const playerActors = actors.filter(
    (actor) =>
      actor.type === "player"
      || actor.id === frame.playerActorId
      || actor.actorId === frame.playerActorId,
  );
  const displayNameToId = new Map(
    actors.map((actor) => [actor.label.trim().toLowerCase(), actor.id]),
  );

  return {
    all: new Set(actorIds),
    active: new Set(frame.roster.active.flatMap((actor) => [actor.id, actor.actorId]).filter(
      (value): value is string => Boolean(value),
    )),
    support: new Set(frame.roster.support.flatMap((actor) => [actor.id, actor.actorId]).filter(
      (value): value is string => Boolean(value),
    )),
    background: new Set(frame.roster.background.flatMap((actor) => [actor.id, actor.actorId]).filter(
      (value): value is string => Boolean(value),
    )),
    displayNameToId,
    forbiddenVisibleFacts: new Set(
      forbiddenActorRefs.flatMap((value) => [value, value.trim().toLowerCase()]),
    ),
    forbiddenToolTargets: normalizedRefs(forbiddenActorRefs),
    clearActorTargets: normalizedRefs(clearActors.flatMap(actorRefs)),
    clearNpcTargets: normalizedRefs(
      clearActors
        .filter((actor) => actor.type === "npc")
        .flatMap(actorRefs),
    ),
    playerTargets: normalizedRefs(playerActors.flatMap(actorRefs)),
    connectedMovementTargets: normalizedRefs(
      frame.movementCandidates
        .filter((candidate) => candidate.connected)
        .flatMap((candidate) => [candidate.id, candidate.locationId, candidate.label]),
    ),
  };
}

function pushActorIssue(
  issues: ScenePlanValidationIssue[],
  path: string,
  actorId: unknown,
  rosterIds: ReturnType<typeof collectRosterIds>,
  options: {
    requireActive?: boolean;
    requireSceneActionOwner?: boolean;
  } = {},
) {
  if (typeof actorId !== "string") {
    issues.push({
      code: "unknown_actor",
      path,
      message: `${path} must reference a SceneFrame actor ID.`,
    });
    return;
  }

  const normalized = actorId.trim().toLowerCase();
  if (rosterIds.displayNameToId.has(normalized)) {
    issues.push({
      code: "display_name_actor_reference",
      path,
      message: `${path} uses display name "${actorId}" instead of a SceneFrame actor ID.`,
    });
    return;
  }

  if (!rosterIds.all.has(actorId)) {
    issues.push({
      code: "unknown_actor",
      path,
      message: `unknown actor: ${path} references actor ID ${actorId} outside the SceneFrame roster.`,
    });
    return;
  }

  if (options.requireActive && !rosterIds.active.has(actorId)) {
    issues.push({
      code: "inactive_primary_actor",
      path,
      message: `inactive primary actor: ${path} must be owned by an active SceneFrame actor.`,
    });
    return;
  }

  if (options.requireSceneActionOwner && rosterIds.background.has(actorId)) {
    issues.push({
      code: "background_actor_action",
      path,
      message: `background actor action: actor ID ${actorId} cannot own scene-changing actions.`,
    });
  }
}

function validateToolInput(action: ScenePlanAction): ScenePlanValidationIssue | null {
  const schema = runtimeToolInputSchemas[action.toolName];
  if (!schema) {
    return {
      code: "unsupported_tool",
      path: `plannedActions.${action.id}.toolName`,
      message: `unsupported tool: ${String(action.toolName)} is not a runtime tool schema.`,
    };
  }

  const parsed = schema.safeParse(action.input);
  if (parsed.success && JSON.stringify(parsed.data) === JSON.stringify(action.input)) {
    return null;
  }

  return {
    code: "invalid_tool_input",
    path: `plannedActions.${action.id}.input`,
    message: parsed.success
      ? `invalid tool input for ${action.toolName}: input contains fields outside the runtime tool schema.`
      : `invalid tool input for ${action.toolName}: ${parsed.error.message}`,
  };
}

function normalizeToolTarget(value: string): string {
  return value.trim().toLowerCase();
}

function matchesToolTarget(value: unknown, allowedTargets: Set<string>): boolean {
  return typeof value === "string" && allowedTargets.has(normalizeToolTarget(value));
}

function findForbiddenToolTarget(
  value: string,
  rosterIds: ReturnType<typeof collectRosterIds>,
): string | null {
  const normalized = normalizeToolTarget(value);
  if (!normalized) return null;

  for (const forbidden of rosterIds.forbiddenToolTargets) {
    if (forbidden.length >= 3 && (normalized === forbidden || normalized.includes(forbidden))) {
      return forbidden;
    }
  }

  return null;
}

function createToolInputScopeIssue(
  action: ScenePlanAction,
  path: string,
  message: string,
): ScenePlanValidationIssue {
  return {
    code: "tool_input_scope",
    path: `plannedActions.${action.id}.input.${path}`,
    message,
  };
}

function requireScopedToolTarget(
  action: ScenePlanAction,
  path: string,
  value: unknown,
  allowedTargets: Set<string>,
  description: string,
): ScenePlanValidationIssue | null {
  if (typeof value !== "string") return null;
  if (matchesToolTarget(value, allowedTargets)) return null;

  return createToolInputScopeIssue(
    action,
    path,
    `${path} must reference ${description}; got "${value}".`,
  );
}

function validateToolInputScope(
  action: ScenePlanAction,
  rosterIds: ReturnType<typeof collectRosterIds>,
  executionContext: ToolExecutionContext,
): ScenePlanValidationIssue | null {
  for (const value of flattenStrings(action.input)) {
    const forbidden = findForbiddenToolTarget(value, rosterIds);
    if (forbidden) {
      return createToolInputScopeIssue(
        action,
        "input",
        "tool input scope violation: input references a hidden or out-of-frame actor.",
      );
    }
  }

  switch (action.toolName) {
    case "set_condition": {
      const input = action.input as { targetName?: unknown };
      return requireScopedToolTarget(
        action,
        "targetName",
        input.targetName,
        rosterIds.playerTargets,
        "the player character",
      );
    }
    case "add_tag":
    case "remove_tag": {
      const input = action.input as { entityName?: unknown; entityType?: unknown };
      if (input.entityType === "player") {
        return requireScopedToolTarget(
          action,
          "entityName",
          input.entityName,
          rosterIds.playerTargets,
          "the player character",
        );
      }
      if (input.entityType === "npc") {
        return requireScopedToolTarget(
          action,
          "entityName",
          input.entityName,
          rosterIds.clearNpcTargets,
          "a clear active/support NPC in the SceneFrame",
        );
      }
      break;
    }
    case "spawn_item": {
      const input = action.input as { ownerName?: unknown; ownerType?: unknown };
      if (input.ownerType !== "character") break;
      return requireScopedToolTarget(
        action,
        "ownerName",
        input.ownerName,
        rosterIds.clearActorTargets,
        "a clear active/support actor in the SceneFrame",
      );
    }
    case "transfer_item": {
      const input = action.input as { targetName?: unknown; targetType?: unknown };
      if (input.targetType !== "character") break;
      return requireScopedToolTarget(
        action,
        "targetName",
        input.targetName,
        rosterIds.clearActorTargets,
        "a clear active/support actor in the SceneFrame",
      );
    }
    case "promote_npc": {
      const input = action.input as { npcRef?: unknown };
      return requireScopedToolTarget(
        action,
        "npcRef",
        input.npcRef,
        rosterIds.clearNpcTargets,
        "a clear active/support NPC in the SceneFrame",
      );
    }
    case "move_to": {
      const input = action.input as { targetLocationName?: unknown };
      return requireScopedToolTarget(
        action,
        "targetLocationName",
        input.targetLocationName,
        rosterIds.connectedMovementTargets,
        "a connected movement candidate in the SceneFrame",
      );
    }
    default:
      break;
  }

  const groundingIssue = validateToolInputGrounding({
    toolName: action.toolName,
    toolInput: action.input as Record<string, unknown>,
    context: executionContext,
    pathPrefix: `plannedActions.${action.id}.input`,
  });
  if (!groundingIssue) return null;

  return {
    code: groundingIssue.code,
    path: groundingIssue.path,
    message: groundingIssue.message,
  };
}

const NARRATOR_FACT_KEYS = new Set([
  "anchorEventId",
  "eventIds",
  "responseIds",
  "actionIds",
  "toolResultRefs",
]);

const UUIDISH_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function flattenStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenStrings(entry));
  }
  if (value && typeof value === "object") {
    return Object.values(value).flatMap((entry) => flattenStrings(entry));
  }
  return [];
}

function pushNarratorFactIssue(
  issues: ScenePlanValidationIssue[],
  path: string,
  value: string,
  rosterIds: ReturnType<typeof collectRosterIds>,
) {
  const normalized = value.trim().toLowerCase();
  if (
    rosterIds.forbiddenVisibleFacts.has(value)
    || rosterIds.forbiddenVisibleFacts.has(normalized)
  ) {
    issues.push({
      code: "hidden_actor_visible_fact",
      path,
      message: `hidden actor visible fact: narratorFacts cannot expose ${value}.`,
    });
    return;
  }

  if (!UUIDISH_PATTERN.test(value)) {
    issues.push({
      code: "narrator_fact_prose",
      path,
      message: `narrator fact prose: ${path} contains "${value}" instead of a backend reference ID.`,
    });
  }
}

function collectNarratorFactIssues(
  plan: ScenePlan,
  rosterIds: ReturnType<typeof collectRosterIds>,
): ScenePlanValidationIssue[] {
  const issues: ScenePlanValidationIssue[] = [];
  const eventIds = new Set([plan.anchorEvent.id]);
  const responseIds = new Set([
    plan.primaryResponse.id,
    ...plan.supportResponses.map((response) => response.id),
  ]);
  const actionIds = new Set(plan.plannedActions.map((action) => action.id));
  const rawNarratorFacts = plan.narratorFacts as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(rawNarratorFacts)) {
    if (!NARRATOR_FACT_KEYS.has(key)) {
      issues.push({
        code: "narrator_fact_prose",
        path: `narratorFacts.${key}`,
        message: `narrator fact prose: unsupported field "${key}" is not a backend reference channel.`,
      });
    }

    if (key === "toolResultRefs" && Array.isArray(value)) {
      for (const [index, ref] of value.entries()) {
        if (ref && typeof ref === "object" && "actionId" in ref) {
          pushNarratorFactIssue(
            issues,
            `narratorFacts.toolResultRefs.${index}.actionId`,
            String((ref as { actionId: unknown }).actionId),
            rosterIds,
          );
        }
      }
      continue;
    }

    for (const stringValue of flattenStrings(value)) {
      pushNarratorFactIssue(issues, `narratorFacts.${key}`, stringValue, rosterIds);
    }
  }

  for (const eventId of plan.narratorFacts.eventIds) {
    if (!eventIds.has(eventId)) {
      issues.push({
        code: "narrator_fact_prose",
        path: "narratorFacts.eventIds",
        message: `narratorFacts event reference ${eventId} does not resolve to a backend event reference.`,
      });
    }
  }

  for (const responseId of plan.narratorFacts.responseIds) {
    if (!responseIds.has(responseId)) {
      issues.push({
        code: "narrator_fact_prose",
        path: "narratorFacts.responseIds",
        message: `narratorFacts response reference ${responseId} does not resolve to a ScenePlan response.`,
      });
    }
  }

  for (const actionId of plan.narratorFacts.actionIds) {
    if (!actionIds.has(actionId)) {
      issues.push({
        code: "narrator_fact_prose",
        path: "narratorFacts.actionIds",
        message: `narratorFacts action reference ${actionId} does not resolve to a planned action.`,
      });
    }
  }

  for (const ref of plan.narratorFacts.toolResultRefs) {
    if (!actionIds.has(ref.actionId)) {
      issues.push({
        code: "narrator_fact_prose",
        path: "narratorFacts.toolResultRefs",
        message: `narratorFacts tool result reference ${ref.actionId} does not resolve to a planned action.`,
      });
    }
  }

  return issues;
}

function collectOutcomeIssues(
  plan: ScenePlan,
  oracleOutcome: string | undefined,
  outcomeBounds: NarrativeOutcomeBounds | null | undefined,
): ScenePlanValidationIssue[] {
  const prohibitsPlayerHpLoss = outcomeBounds
    ? [...outcomeBounds.prohibitions, outcomeBounds.summary]
        .some((line) => /no damage|cannot decrease hp|no hp loss|without injury/i.test(line))
    : false;

  if (oracleOutcome !== "strong_hit" && !prohibitsPlayerHpLoss) {
    return [];
  }

  return plan.plannedActions.flatMap((action): ScenePlanValidationIssue[] => {
    if (action.toolName !== "set_condition") {
      return [];
    }

    const input = action.input as { delta?: number };
    if (typeof input.delta === "number" && input.delta < 0) {
      return [
        {
          code: "outcome_contradiction",
          path: `plannedActions.${action.id}`,
          message: "outcome contradiction: Oracle/outcome bounds cannot reduce player HP.",
        },
      ];
    }

    return [];
  });
}

export function validateScenePlan(
  args: ValidateScenePlanArgs,
): ValidatedScenePlanResult {
  const { frame, plan } = args;
  const issues: ScenePlanValidationIssue[] = [];
  const rosterIds = collectRosterIds(frame);
  const allowedTools = new Set(frame.allowedTools);
  const executionContext = createPlayerTurnToolExecutionContext(frame);

  pushActorIssue(issues, "actionInterpretation.actorId", plan.actionInterpretation.actorId, rosterIds);
  for (const [index, actorId] of plan.actionInterpretation.targetIds.entries()) {
    pushActorIssue(issues, `actionInterpretation.targetIds.${index}`, actorId, rosterIds);
  }
  pushActorIssue(issues, "anchorEvent.actorId", plan.anchorEvent.actorId, rosterIds);
  for (const [index, actorId] of plan.anchorEvent.subjectIds.entries()) {
    pushActorIssue(issues, `anchorEvent.subjectIds.${index}`, actorId, rosterIds);
  }
  pushActorIssue(issues, "primaryResponse.actorId", plan.primaryResponse.actorId, rosterIds, {
    requireActive: true,
  });
  for (const [index, response] of plan.supportResponses.entries()) {
    pushActorIssue(issues, `supportResponses.${index}.actorId`, response.actorId, rosterIds);
    for (const [targetIndex, actorId] of (response.targetIds ?? []).entries()) {
      pushActorIssue(
        issues,
        `supportResponses.${index}.targetIds.${targetIndex}`,
        actorId,
        rosterIds,
      );
    }
  }

  for (const [index, action] of plan.plannedActions.entries()) {
    pushActorIssue(issues, `plannedActions.${index}.actorId`, action.actorId, rosterIds, {
      requireSceneActionOwner: true,
    });

    if (!allowedTools.has(action.toolName)) {
      issues.push({
        code: "unsupported_tool",
        path: `plannedActions.${index}.toolName`,
        message: `unsupported tool: ${action.toolName} is not allowed by the SceneFrame.`,
      });
    }

    const toolInputIssue = validateToolInput(action);
    if (toolInputIssue) {
      issues.push(toolInputIssue);
    } else {
      const actionExecutionContext = createScenePlanActionToolExecutionContext({
        context: executionContext,
        frame,
        actorId: action.actorId,
      });
      const toolInputScopeIssue = validateToolInputScope(
        action,
        rosterIds,
        actionExecutionContext,
      );
      if (toolInputScopeIssue) {
        issues.push(toolInputScopeIssue);
      }
    }
  }

  for (const [index, hook] of plan.deferredHooks.entries()) {
    for (const [subjectIndex, actorId] of hook.subjectIds.entries()) {
      pushActorIssue(
        issues,
        `deferredHooks.${index}.subjectIds.${subjectIndex}`,
        actorId,
        rosterIds,
      );
    }
  }

  const sceneChangingOwners = new Set(
    plan.plannedActions
      .map((action) => action.actorId)
      .filter((actorId) => actorId !== frame.playerActorId)
      .filter((actorId) => rosterIds.active.has(actorId) || rosterIds.support.has(actorId)),
  );
  if (sceneChangingOwners.size > 1) {
    issues.push({
      code: "too_many_primary_scene_changers",
      path: "plannedActions",
      message: "too many primary scene changers: plannedActions must have one primary non-player mutation owner.",
    });
  }

  issues.push(...collectNarratorFactIssues(plan, rosterIds));
  issues.push(
    ...collectOutcomeIssues(
      plan,
      args.oracleResult?.outcome ?? args.oracleOutcome ?? frame.oracle?.outcome,
      args.outcomeBounds,
    ),
  );

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    plan: {
      frame,
      plan,
      issues: [],
    },
  };
}
