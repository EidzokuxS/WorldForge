import * as crypto from "node:crypto";
import { z } from "zod";

import type { SceneFrame, SceneActor } from "./scene-frame.js";
import {
  SCENE_PLAN_ACTION_LIMIT,
  SCENE_PLAN_DEFERRED_HOOK_LIMIT,
  SCENE_PLAN_HIDDEN_RATIONALE_MAX,
  SCENE_PLAN_SUPPORT_RESPONSE_LIMIT,
  scenePlanSchema,
  type ScenePlan,
} from "./scene-plan-schema.js";
import { validateScenePlan } from "./scene-plan-validator.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

const semanticText = (max: number) => z.string().trim().min(1).max(max);
const boundedHiddenRationale = z.preprocess(
  (value) =>
    typeof value === "string"
      ? value.trim().slice(0, SCENE_PLAN_HIDDEN_RATIONALE_MAX)
      : value,
  z.string().max(SCENE_PLAN_HIDDEN_RATIONALE_MAX),
);
const DROP_SEMANTIC_TOOL_ACTION = Symbol("DROP_SEMANTIC_TOOL_ACTION");
const semanticActorRef = semanticText(160);
const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];
const runtimeToolNameSet = new Set<string>(runtimeToolNames);

const semanticActionInterpretationSchema = z
  .object({
    actorRef: semanticActorRef,
    intent: semanticText(160),
    method: semanticText(160).optional(),
    targetRefs: z.array(semanticActorRef).max(4).default([]),
  })
  .strict();

const semanticSceneResponseSchema = z
  .object({
    actorRef: semanticActorRef,
    responseKind: z.enum([
      "spoken",
      "gesture",
      "movement",
      "environment",
      "silence",
      "system",
    ]),
    visibleToPlayer: z.boolean(),
    targetRefs: z.array(semanticActorRef).max(4).default([]),
  })
  .strict();

const semanticPlannedActionSchema = z
  .object({
    actorRef: semanticActorRef.optional(),
    toolName: z.string().trim().min(1).max(80).optional(),
    input: z.unknown().optional(),
    payload: z.unknown().optional(),
  })
  .strict();

const semanticDeferredHookSchema = z
  .object({
    hookType: z.enum(["offscreen", "reflection", "faction", "memory", "custom"]),
    subjectRefs: z.array(semanticActorRef).max(6),
    reason: semanticText(180),
  })
  .strict();

export const semanticScenePlanSchema = z
  .object({
    actionInterpretation: semanticActionInterpretationSchema,
    primaryResponse: semanticSceneResponseSchema,
    supportResponses: z
      .array(semanticSceneResponseSchema)
      .max(SCENE_PLAN_SUPPORT_RESPONSE_LIMIT)
      .default([]),
    plannedActions: z
      .array(semanticPlannedActionSchema)
      .max(SCENE_PLAN_ACTION_LIMIT)
      .default([]),
    deferredHooks: z
      .array(semanticDeferredHookSchema)
      .max(SCENE_PLAN_DEFERRED_HOOK_LIMIT)
      .default([]),
    hiddenRationale: boundedHiddenRationale,
  })
  .strict();

export type SemanticScenePlan = z.infer<typeof semanticScenePlanSchema>;

export type SemanticScenePlanMappingIssueCode =
  | "invalid_semantic_scene_plan"
  | "unknown_actor_ref"
  | "forbidden_actor_ref"
  | "missing_toolName"
  | "unsupported_tool"
  | "invalid_strict_scene_plan"
  | "invalid_validated_scene_plan";

export interface SemanticScenePlanMappingIssue {
  code: SemanticScenePlanMappingIssueCode;
  path: string;
  message: string;
}

export class SemanticScenePlanMappingError extends Error {
  constructor(public readonly issues: SemanticScenePlanMappingIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "SemanticScenePlanMappingError";
  }
}

export interface SemanticScenePlanToStrictPlanOptions {
  idFactory?: () => string;
}

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function actorRefs(actor: SceneActor): string[] {
  return [actor.id, actor.actorId, actor.label].filter(
    (value): value is string => Boolean(value && value.trim()),
  );
}

function buildActorResolver(frame: SceneFrame): {
  resolve: (ref: string, path: string) => string;
} {
  const allowed = [
    ...frame.roster.active,
    ...frame.roster.support.filter((actor) => actor.awareness === "clear"),
  ];
  const forbiddenRefs = new Set(
    [
      ...(frame.perception.forbiddenActorIds ?? []),
      ...(frame.perception.forbiddenActorLabels ?? []),
      ...frame.roster.background.flatMap(actorRefs),
      ...frame.roster.support
        .filter((actor) => actor.awareness !== "clear")
        .flatMap(actorRefs),
    ].map(normalizeRef),
  );
  const byRef = new Map<string, string>();

  for (const actor of allowed) {
    for (const ref of actorRefs(actor)) {
      const normalized = normalizeRef(ref);
      if (!forbiddenRefs.has(normalized) && !byRef.has(normalized)) {
        byRef.set(normalized, actor.id);
      }
    }
  }

  return {
    resolve(ref, path) {
      const normalized = normalizeRef(ref);
      if (forbiddenRefs.has(normalized)) {
        throw new SemanticScenePlanMappingError([
          {
            code: "forbidden_actor_ref",
            path,
            message: `${path} references forbidden SceneFrame actor "${ref}".`,
          },
        ]);
      }

      const actorId = byRef.get(normalized);
      if (!actorId) {
        throw new SemanticScenePlanMappingError([
          {
            code: "unknown_actor_ref",
            path,
            message: `${path} references actor "${ref}" outside active/support SceneFrame actors.`,
          },
        ]);
      }

      return actorId;
    },
  };
}

function mapZodIssues(code: SemanticScenePlanMappingIssueCode, error: z.ZodError): SemanticScenePlanMappingIssue[] {
  return error.issues.map((issue) => ({
    code,
    path: issue.path.length > 0 ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}

function resolveRefs(
  refs: readonly string[],
  path: string,
  resolve: (ref: string, path: string) => string,
): string[] {
  return refs.map((ref, index) => resolve(ref, `${path}.${index}`));
}

function resolveToolName(
  value: string | undefined,
  frame: SceneFrame,
  path: string,
): RuntimeToolName {
  if (!value) {
    throw new SemanticScenePlanMappingError([
      {
        code: "missing_toolName",
        path,
        message: `${path} is required so backend can choose a validated runtime tool.`,
      },
    ]);
  }

  if (!runtimeToolNameSet.has(value) || !frame.allowedTools.includes(value as RuntimeToolName)) {
    throw new SemanticScenePlanMappingError([
      {
        code: "unsupported_tool",
        path,
        message: `${path} must be one of the SceneFrame ALLOWED TOOLS; got "${value}".`,
      },
    ]);
  }

  return value as RuntimeToolName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }

  return null;
}

function actionArrayCandidate(input: unknown): unknown[] | null {
  if (Array.isArray(input)) return input;
  if (!isRecord(input)) return null;

  for (const key of [
    "actions",
    "options",
    "choices",
    "quickActions",
    "quick_actions",
    "suggestions",
  ]) {
    const candidate = input[key];
    if (Array.isArray(candidate)) return candidate;
  }

  return null;
}

function normalizeQuickActionEntry(entry: unknown): { label: string; action: string } | null {
  if (typeof entry === "string") {
    const action = entry.trim();
    if (!action) return null;
    return { label: action.slice(0, 80), action };
  }

  if (!isRecord(entry)) return null;

  const label = firstText(
    entry.label,
    entry.title,
    entry.name,
    entry.text,
    entry.action,
    entry.description,
    entry.choice,
    entry.content,
  );
  const action = firstText(
    entry.action,
    entry.command,
    entry.fullAction,
    entry.full_action,
    entry.input,
    entry.text,
    entry.description,
    entry.intent,
    label,
  );

  if (!label || !action) return null;
  return { label: label.slice(0, 80), action };
}

function normalizeOfferQuickActionsInput(input: unknown): unknown | typeof DROP_SEMANTIC_TOOL_ACTION {
  const candidates = actionArrayCandidate(input);
  if (!candidates) return DROP_SEMANTIC_TOOL_ACTION;

  const actions = candidates
    .map(normalizeQuickActionEntry)
    .filter((entry): entry is { label: string; action: string } => Boolean(entry))
    .slice(0, 5);

  if (actions.length < 3) return DROP_SEMANTIC_TOOL_ACTION;
  return { actions };
}

function normalizeSemanticToolInput(toolName: RuntimeToolName, input: unknown): unknown {
  if (toolName === "offer_quick_actions") {
    return normalizeOfferQuickActionsInput(input);
  }

  return input;
}

function mapSemanticPlan(
  semanticPlan: SemanticScenePlan,
  frame: SceneFrame,
  idFactory: () => string,
): unknown {
  const resolver = buildActorResolver(frame);
  const actionActorId = resolver.resolve(
    semanticPlan.actionInterpretation.actorRef,
    "actionInterpretation.actorRef",
  );
  const targetIds = resolveRefs(
    semanticPlan.actionInterpretation.targetRefs,
    "actionInterpretation.targetRefs",
    resolver.resolve,
  );
  const anchorEventId = idFactory();
  const primaryResponseId = idFactory();
  const supportResponses = semanticPlan.supportResponses.map((response, index) => ({
    id: idFactory(),
    actorId: resolver.resolve(response.actorRef, `supportResponses.${index}.actorRef`),
    responseKind: response.responseKind,
    eventId: anchorEventId,
    visibleToPlayer: response.visibleToPlayer,
    targetIds: resolveRefs(
      response.targetRefs,
      `supportResponses.${index}.targetRefs`,
      resolver.resolve,
    ),
  }));
  const plannedActions = semanticPlan.plannedActions.flatMap((action, index) => {
    const toolName = resolveToolName(
      action.toolName,
      frame,
      `plannedActions.${index}.toolName`,
    );
    const input = action.input ?? action.payload ?? {};
    const normalizedInput = normalizeSemanticToolInput(toolName, input);
    if (normalizedInput === DROP_SEMANTIC_TOOL_ACTION) {
      return [];
    }

    return [{
      id: idFactory(),
      actorId: resolver.resolve(
        action.actorRef ?? semanticPlan.actionInterpretation.actorRef,
        `plannedActions.${index}.actorRef`,
      ),
      toolName,
      input: normalizedInput,
    }];
  });
  const deferredHooks = semanticPlan.deferredHooks.map((hook, index) => ({
    id: idFactory(),
    hookType: hook.hookType,
    subjectIds: resolveRefs(
      hook.subjectRefs,
      `deferredHooks.${index}.subjectRefs`,
      resolver.resolve,
    ),
    reason: hook.reason,
  }));

  return {
    actionInterpretation: {
      actorId: actionActorId,
      intent: semanticPlan.actionInterpretation.intent,
      method: semanticPlan.actionInterpretation.method,
      targetIds,
    },
    anchorEvent: {
      id: anchorEventId,
      actorId: actionActorId,
      subjectIds: targetIds,
      kind: "player_action",
    },
    primaryResponse: {
      id: primaryResponseId,
      actorId: resolver.resolve(semanticPlan.primaryResponse.actorRef, "primaryResponse.actorRef"),
      responseKind: semanticPlan.primaryResponse.responseKind,
      eventId: anchorEventId,
      visibleToPlayer: semanticPlan.primaryResponse.visibleToPlayer,
      targetIds: resolveRefs(
        semanticPlan.primaryResponse.targetRefs,
        "primaryResponse.targetRefs",
        resolver.resolve,
      ),
    },
    supportResponses,
    plannedActions,
    deferredHooks,
    narratorFacts: {
      anchorEventId,
      eventIds: [anchorEventId],
      responseIds: [primaryResponseId, ...supportResponses.map((response) => response.id)],
      actionIds: plannedActions.map((action) => action.id),
      toolResultRefs: plannedActions.map((action) => ({
        actionId: action.id,
        toolName: action.toolName,
      })),
    },
    hiddenRationale: semanticPlan.hiddenRationale,
  };
}

export function semanticScenePlanToStrictPlan(
  input: unknown,
  frame: SceneFrame,
  opts: SemanticScenePlanToStrictPlanOptions = {},
): ScenePlan {
  const semanticParsed = semanticScenePlanSchema.safeParse(input);
  if (!semanticParsed.success) {
    throw new SemanticScenePlanMappingError(
      mapZodIssues("invalid_semantic_scene_plan", semanticParsed.error),
    );
  }

  const mapped = mapSemanticPlan(
    semanticParsed.data,
    frame,
    opts.idFactory ?? (() => crypto.randomUUID()),
  );
  const strictParsed = scenePlanSchema.safeParse(mapped);
  if (!strictParsed.success) {
    throw new SemanticScenePlanMappingError(
      mapZodIssues("invalid_strict_scene_plan", strictParsed.error),
    );
  }

  const validated = validateScenePlan({ frame, plan: strictParsed.data });
  if (!validated.ok) {
    throw new SemanticScenePlanMappingError(
      validated.issues.map((issue) => ({
        code: "invalid_validated_scene_plan",
        path: issue.path,
        message: issue.message,
      })),
    );
  }

  return strictParsed.data;
}
