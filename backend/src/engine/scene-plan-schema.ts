import { z } from "zod";

import type { SceneFrame } from "./scene-frame.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";

export const SCENE_PLAN_ACTION_LIMIT = 8;
export const SCENE_PLAN_HIDDEN_RATIONALE_MAX = 280;
export const SCENE_PLAN_SUPPORT_RESPONSE_LIMIT = 2;
export const SCENE_PLAN_DEFERRED_HOOK_LIMIT = 4;

const backendIdSchema = z.string().uuid();
const boundedText = (max: number) => z.string().trim().min(1).max(max);
const looseReferenceSchema = z.string().trim().min(1).max(160);

const runtimeToolNames = [
  "add_tag",
  "remove_tag",
  "set_relationship",
  "add_chronicle_entry",
  "log_event",
  "advance_time",
  "offer_quick_actions",
  "spawn_npc",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "request_contested_outcome",
  "set_condition",
  "move_to",
  "transfer_item",
] as const satisfies readonly RuntimeToolName[];
const runtimeToolNameSet = new Set<string>(runtimeToolNames);

const actionInterpretationSchema = z
  .object({
    actorId: backendIdSchema,
    intent: boundedText(160),
    method: boundedText(160).optional(),
    targetIds: z.array(backendIdSchema).max(4),
  })
  .strict();

const anchorEventSchema = z
  .object({
    id: backendIdSchema,
    actorId: backendIdSchema,
    subjectIds: z.array(backendIdSchema).max(6),
    kind: z.enum([
      "player_action",
      "oracle_outcome",
      "scene_response",
      "tool_result",
      "environment",
    ]),
  })
  .strict();

export const sceneResponseSchema = z
  .object({
    id: backendIdSchema,
    actorId: backendIdSchema,
    responseKind: z.enum([
      "spoken",
      "gesture",
      "movement",
      "environment",
      "silence",
      "system",
    ]),
    eventId: backendIdSchema,
    visibleToPlayer: z.boolean(),
    targetIds: z.array(backendIdSchema).max(4).optional(),
  })
  .strict();

export const scenePlanActionSchema = z.discriminatedUnion("toolName", [
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("add_tag"),
      input: runtimeToolInputSchemas.add_tag,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("remove_tag"),
      input: runtimeToolInputSchemas.remove_tag,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("set_relationship"),
      input: runtimeToolInputSchemas.set_relationship,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("add_chronicle_entry"),
      input: runtimeToolInputSchemas.add_chronicle_entry,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("log_event"),
      input: runtimeToolInputSchemas.log_event,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("advance_time"),
      input: runtimeToolInputSchemas.advance_time,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("offer_quick_actions"),
      input: runtimeToolInputSchemas.offer_quick_actions,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("spawn_npc"),
      input: runtimeToolInputSchemas.spawn_npc,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("promote_npc"),
      input: runtimeToolInputSchemas.promote_npc,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("spawn_item"),
      input: runtimeToolInputSchemas.spawn_item,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("reveal_location"),
      input: runtimeToolInputSchemas.reveal_location,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("request_contested_outcome"),
      input: runtimeToolInputSchemas.request_contested_outcome,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("set_condition"),
      input: runtimeToolInputSchemas.set_condition,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("move_to"),
      input: runtimeToolInputSchemas.move_to,
    })
    .strict(),
  z
    .object({
      id: backendIdSchema,
      actorId: backendIdSchema,
      toolName: z.literal("transfer_item"),
      input: runtimeToolInputSchemas.transfer_item,
    })
    .strict(),
]);

const deferredHookSchema = z
  .object({
    id: backendIdSchema,
    hookType: z.enum(["offscreen", "reflection", "faction", "memory", "custom"]),
    subjectIds: z.array(backendIdSchema).max(6),
    reason: boundedText(180),
  })
  .strict();

const toolResultRefSchema = z
  .object({
    actionId: backendIdSchema,
    toolName: z.enum(runtimeToolNames),
  })
  .strict();

const narratorFactsSchema = z
  .object({
    anchorEventId: backendIdSchema,
    eventIds: z.array(backendIdSchema).max(12),
    responseIds: z.array(backendIdSchema).max(
      1 + SCENE_PLAN_SUPPORT_RESPONSE_LIMIT,
    ),
    actionIds: z.array(backendIdSchema).max(SCENE_PLAN_ACTION_LIMIT),
    toolResultRefs: z.array(toolResultRefSchema).max(SCENE_PLAN_ACTION_LIMIT),
  })
  .strict();

export const scenePlanSchema = z
  .object({
    actionInterpretation: actionInterpretationSchema,
    anchorEvent: anchorEventSchema,
    primaryResponse: sceneResponseSchema,
    supportResponses: z.array(sceneResponseSchema).max(
      SCENE_PLAN_SUPPORT_RESPONSE_LIMIT,
    ),
    plannedActions: z.array(scenePlanActionSchema).max(SCENE_PLAN_ACTION_LIMIT),
    deferredHooks: z.array(deferredHookSchema).max(SCENE_PLAN_DEFERRED_HOOK_LIMIT),
    narratorFacts: narratorFactsSchema,
    hiddenRationale: z.string().max(SCENE_PLAN_HIDDEN_RATIONALE_MAX),
  })
  .strict();

const looseActionInterpretationSchema = z
  .object({
    actorId: looseReferenceSchema,
    intent: boundedText(160),
    method: boundedText(160).optional(),
    targetIds: z.array(looseReferenceSchema).max(4).default([]),
  })
  .strict();

const looseAnchorEventSchema = z
  .object({
    id: looseReferenceSchema,
    actorId: looseReferenceSchema,
    subjectIds: z.array(looseReferenceSchema).max(6).default([]),
    kind: z.enum([
      "player_action",
      "oracle_outcome",
      "scene_response",
      "tool_result",
      "environment",
    ]),
  })
  .strict();

const looseSceneResponseSchema = z
  .object({
    id: looseReferenceSchema,
    actorId: looseReferenceSchema,
    responseKind: z.enum([
      "spoken",
      "gesture",
      "movement",
      "environment",
      "silence",
      "system",
    ]),
    eventId: looseReferenceSchema,
    visibleToPlayer: z.boolean(),
    targetIds: z.array(looseReferenceSchema).max(4).optional(),
  })
  .strict();

const looseScenePlanActionSchema = z
  .object({
    id: looseReferenceSchema.optional(),
    actionId: looseReferenceSchema.optional(),
    actorId: looseReferenceSchema.optional(),
    toolName: z.string().trim().min(1).max(80).optional(),
    tool: z.string().trim().min(1).max(80).optional(),
    tool_name: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    type: z.string().trim().min(1).max(80).optional(),
    actionType: z.string().trim().min(1).max(80).optional(),
    input: z.unknown().optional(),
    payload: z.unknown().optional(),
    args: z.unknown().optional(),
    arguments: z.unknown().optional(),
    parameters: z.unknown().optional(),
    toolInput: z.unknown().optional(),
  })
  .passthrough();

const looseDeferredHookSchema = z
  .object({
    id: looseReferenceSchema,
    hookType: z.enum(["offscreen", "reflection", "faction", "memory", "custom"]),
    subjectIds: z.array(looseReferenceSchema).max(6).default([]),
    reason: boundedText(180),
  })
  .strict();

const looseToolResultRefSchema = z
  .object({
    id: looseReferenceSchema.optional(),
    actionId: looseReferenceSchema.optional(),
    action_id: looseReferenceSchema.optional(),
    toolName: z.string().trim().min(1).max(80).optional(),
    tool: z.string().trim().min(1).max(80).optional(),
    tool_name: z.string().trim().min(1).max(80).optional(),
    name: z.string().trim().min(1).max(80).optional(),
    type: z.string().trim().min(1).max(80).optional(),
  })
  .passthrough();

const narratorFactProseKeys = [
  "summary",
  "description",
  "text",
  "prose",
  "body",
  "content",
  "fact",
  "facts",
  "detail",
  "details",
];

const looseNarratorFactsSchema = z
  .object({
    anchorEventId: looseReferenceSchema,
    eventIds: z.array(looseReferenceSchema).max(12).default([]),
    responseIds: z
      .array(looseReferenceSchema)
      .max(1 + SCENE_PLAN_SUPPORT_RESPONSE_LIMIT)
      .default([]),
    actionIds: z.array(looseReferenceSchema).max(SCENE_PLAN_ACTION_LIMIT).default([]),
    toolResultRefs: z.array(looseToolResultRefSchema).max(SCENE_PLAN_ACTION_LIMIT).default([]),
  })
  .strict();

export const scenePlanLooseSchema = z
  .object({
    actionInterpretation: looseActionInterpretationSchema,
    anchorEvent: looseAnchorEventSchema,
    primaryResponse: looseSceneResponseSchema,
    supportResponses: z.array(looseSceneResponseSchema).default([]),
    plannedActions: z.array(looseScenePlanActionSchema).default([]),
    deferredHooks: z.array(looseDeferredHookSchema).default([]),
    narratorFacts: looseNarratorFactsSchema,
    hiddenRationale: z.string().trim().max(SCENE_PLAN_HIDDEN_RATIONALE_MAX),
  })
  .strict();

type LooseScenePlan = z.infer<typeof scenePlanLooseSchema>;

function trimUnknown(value: unknown): unknown {
  if (typeof value === "string") {
    return value.trim();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => trimUnknown(entry));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, trimUnknown(entry)]),
    );
  }
  return value;
}

function filterRefs(
  refs: readonly string[],
  allowedRefs: ReadonlySet<string>,
  forbiddenRefs: ReadonlySet<string>,
): string[] {
  return refs.filter((ref) => allowedRefs.has(ref) && !forbiddenRefs.has(ref));
}

function normalizeRuntimeToolName(value: string): RuntimeToolName | null {
  const normalized = value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();

  if (runtimeToolNameSet.has(normalized)) {
    return normalized as RuntimeToolName;
  }

  const compact = normalized.replace(/_/g, "");
  const aliases: Record<string, RuntimeToolName> = {
    addtag: "add_tag",
    removetag: "remove_tag",
    setrelationship: "set_relationship",
    relationship: "set_relationship",
    addchronicleentry: "add_chronicle_entry",
    chronicleentry: "add_chronicle_entry",
    log: "log_event",
    logevent: "log_event",
    eventlog: "log_event",
    offeractions: "offer_quick_actions",
    quickactions: "offer_quick_actions",
    offerquickactions: "offer_quick_actions",
    spawnnpc: "spawn_npc",
    spawncharacter: "spawn_npc",
    promotenpc: "promote_npc",
    promotecharacter: "promote_npc",
    spawnitem: "spawn_item",
    revealplace: "reveal_location",
    reveallocation: "reveal_location",
    setcondition: "set_condition",
    condition: "set_condition",
    moveto: "move_to",
    move: "move_to",
    travel: "move_to",
    transferitem: "transfer_item",
  };

  return aliases[compact] ?? null;
}

function actionToolName(action: z.infer<typeof looseScenePlanActionSchema>): RuntimeToolName | null {
  const rawToolName =
    action.toolName
    ?? action.tool
    ?? action.tool_name
    ?? action.name
    ?? action.type
    ?? action.actionType;

  return rawToolName ? normalizeRuntimeToolName(rawToolName) : null;
}

function actionReferenceId(action: z.infer<typeof looseScenePlanActionSchema>): string | undefined {
  return action.id ?? action.actionId;
}

function actionInput(action: z.infer<typeof looseScenePlanActionSchema>): unknown {
  return action.input
    ?? action.payload
    ?? action.args
    ?? action.arguments
    ?? action.parameters
    ?? action.toolInput
    ?? {};
}

function toolResultRefActionId(ref: z.infer<typeof looseToolResultRefSchema>): string | undefined {
  return ref.actionId ?? ref.action_id ?? ref.id;
}

function toolResultRefToolName(ref: z.infer<typeof looseToolResultRefSchema>): RuntimeToolName | null {
  const rawToolName =
    ref.toolName
    ?? ref.tool
    ?? ref.tool_name
    ?? ref.name
    ?? ref.type;

  return rawToolName ? normalizeRuntimeToolName(rawToolName) : null;
}

function isBackendId(value: unknown): value is string {
  return backendIdSchema.safeParse(value).success;
}

function makeSyntheticActionId(index: number): string {
  return `55555555-5555-4555-8555-${String(index + 1).padStart(12, "0")}`;
}

function makeUniqueSyntheticActionId(index: number, usedIds: ReadonlySet<string>): string {
  let offset = 0;
  while (true) {
    const candidate = makeSyntheticActionId(index + offset);
    if (!usedIds.has(candidate)) {
      return candidate;
    }
    offset += SCENE_PLAN_ACTION_LIMIT;
  }
}

function buildForbiddenReferenceSet(frame: SceneFrame): Set<string> {
  return new Set([
    ...(frame.perception.forbiddenActorIds ?? []),
    ...(frame.perception.forbiddenActorLabels ?? []),
    ...frame.roster.background.flatMap((actor) => [actor.id, actor.actorId, actor.label]),
    ...frame.roster.support
      .filter((actor) => actor.awareness !== "clear")
      .flatMap((actor) => [actor.id, actor.actorId, actor.label]),
  ].filter((value): value is string => Boolean(value)));
}

export function sanitizeScenePlanCandidate(
  candidate: unknown,
  frame: SceneFrame,
): LooseScenePlan {
  const loose = scenePlanLooseSchema.parse(trimUnknown(candidate));
  const forbiddenRefs = buildForbiddenReferenceSet(frame);
  const usedActionIds = new Set(
    loose.plannedActions
      .map(actionReferenceId)
      .filter(isBackendId),
  );
  const actionReferenceRewrites = new Map<string, string>();
  const plannedActions = loose.plannedActions.flatMap((action, index) => {
    const toolName = actionToolName(action);
    if (!toolName) {
      return [];
    }

    const rawActionId = actionReferenceId(action);
    const id = isBackendId(rawActionId)
      ? rawActionId
      : makeUniqueSyntheticActionId(index, usedActionIds);
    usedActionIds.add(id);
    if (rawActionId && rawActionId !== id) {
      actionReferenceRewrites.set(rawActionId, id);
    }

    return [{
      id,
      actorId: action.actorId ?? loose.actionInterpretation.actorId,
      toolName,
      input: actionInput(action),
    }];
  });
  const eventIds = new Set([
    loose.anchorEvent.id,
    loose.primaryResponse.eventId,
    ...loose.supportResponses.map((response) => response.eventId),
    ...frame.recentEvents.map((event) => event.id),
  ]);
  const responseIds = new Set([
    loose.primaryResponse.id,
    ...loose.supportResponses.map((response) => response.id),
  ]);
  const actionById = new Map(plannedActions.map((action) => [action.id, action]));
  const actionIds = new Set(actionById.keys());
  const rewriteActionRef = (ref: string) => actionReferenceRewrites.get(ref) ?? ref;

  return {
    ...loose,
    plannedActions,
    narratorFacts: {
      anchorEventId: loose.narratorFacts.anchorEventId,
      eventIds: filterRefs(loose.narratorFacts.eventIds, eventIds, forbiddenRefs),
      responseIds: filterRefs(loose.narratorFacts.responseIds, responseIds, forbiddenRefs),
      actionIds: filterRefs(
        loose.narratorFacts.actionIds.map(rewriteActionRef),
        actionIds,
        forbiddenRefs,
      ),
      toolResultRefs: loose.narratorFacts.toolResultRefs.flatMap((ref) => {
        const rawActionId = toolResultRefActionId(ref);
        const refToolName = toolResultRefToolName(ref);
        if (!rawActionId || !refToolName) {
          return [];
        }
        const rewrittenActionId = rewriteActionRef(rawActionId);
        const action = actionById.get(rewrittenActionId);
        if (
          action?.toolName !== refToolName
          || forbiddenRefs.has(rawActionId)
          || forbiddenRefs.has(refToolName)
        ) {
          return [];
        }

        return [{
          actionId: rewrittenActionId,
          toolName: action.toolName,
        }];
      }),
    },
  };
}

export function formatScenePlanValidationIssues(
  issues: readonly z.ZodIssue[],
): string {
  if (issues.length === 0) {
    return "No validation issues.";
  }

  return issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");
}

export function buildScenePlanContract(): string {
  return [
    "Return exactly one strict ScenePlan JSON object.",
    `plannedActions max ${SCENE_PLAN_ACTION_LIMIT}.`,
    `supportResponses max ${SCENE_PLAN_SUPPORT_RESPONSE_LIMIT}.`,
    `deferredHooks max ${SCENE_PLAN_DEFERRED_HOOK_LIMIT}.`,
    `hiddenRationale max ${SCENE_PLAN_HIDDEN_RATIONALE_MAX} characters.`,
    "Use actor IDs from SceneFrame roster fields, never display names.",
    `Allowed tools: ${runtimeToolNames.join(", ")}.`,
    "narratorFacts must contain reference IDs only: anchorEventId, eventIds, responseIds, actionIds, toolResultRefs.",
    `Do not include narratorFacts prose fields: ${narratorFactProseKeys.join(", ")}.`,
  ].join("\n");
}

export type ScenePlanAction = z.infer<typeof scenePlanActionSchema>;
export type SceneResponse = z.infer<typeof sceneResponseSchema>;
export type ScenePlan = z.infer<typeof scenePlanSchema>;
