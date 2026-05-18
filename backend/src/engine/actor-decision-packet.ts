import { z } from "zod";

import {
  BRIDGE_LOOKUP_TOOL_NAMES,
  type BridgeLookupToolName,
} from "./bridge-candidate-tools.js";
import {
  BRIDGE_STATE_TOOL_NAMES,
  type BridgeStateToolName,
} from "./bridge-state-tools.js";
import {
  runtimeToolInputSchemas,
  type RuntimeToolName,
} from "./tool-schemas.js";

export const ACTOR_DECISION_MAX_FACTS = 16;
export const ACTOR_DECISION_MAX_TOOLS = 3;

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];
type ActorDecisionRuntimeToolName = Exclude<
  RuntimeToolName,
  BridgeLookupToolName | BridgeStateToolName
>;
const actorDecisionExcludedToolNameSet = new Set<string>([
  ...BRIDGE_LOOKUP_TOOL_NAMES,
  ...BRIDGE_STATE_TOOL_NAMES,
]);
const actorDecisionRuntimeToolNames = runtimeToolNames.filter(
  (toolName) => !actorDecisionExcludedToolNameSet.has(toolName),
) as [ActorDecisionRuntimeToolName, ...ActorDecisionRuntimeToolName[]];
const actorDecisionRuntimeToolNameSet = new Set<string>(actorDecisionRuntimeToolNames);

const actorDecisionToolRequestSchemas = actorDecisionRuntimeToolNames.map((toolName) =>
  z
    .object({
      toolName: z.literal(toolName).describe(`Exact actor tool name: ${toolName}.`),
      purpose: z
        .string()
        .trim()
        .min(1)
        .max(300)
        .describe("Why this actor is requesting this tool now."),
      input: runtimeToolInputSchemas[toolName].describe(
        `All ${toolName} runtime arguments must be nested inside this input object. Never put tool args beside input.`,
      ),
    })
    .strict()
    .describe(
      `Actor tool request for ${toolName}. Shape must be exactly { toolName, purpose, input }; runtime args belong only inside input.`,
    ),
);
const actorDecisionToolRequestSchemaByName = new Map(
  actorDecisionRuntimeToolNames.map((toolName, index) => [
    toolName,
    actorDecisionToolRequestSchemas[index] as z.ZodType<ActorDecisionToolRequest>,
  ]),
);

export interface ActorDecisionToolRequest {
  toolName: ActorDecisionRuntimeToolName;
  purpose: string;
  input: Record<string, unknown>;
}

export type ActorDecisionPlanUpdateStatus =
  | "planned"
  | "continued"
  | "completed"
  | "blocked";

export interface ActorDecisionPlanUpdate {
  summary: string;
  status: ActorDecisionPlanUpdateStatus;
  writeScopes?: string[];
}

export interface ActorDecisionTrigger {
  reason: string;
  delayWorldTimeMinutes?: number;
}

export interface ActorDecisionPacket {
  actorId: string;
  decisionSummary?: string;
  citedFactIds: string[];
  selectedGoal?: string | null;
  intent: string;
  requestedTools?: ActorDecisionToolRequest[];
  beliefUpdates?: string[];
  planUpdates?: ActorDecisionPlanUpdate[];
  nextDecisionTrigger?: ActorDecisionTrigger;
  noActionReason?: string | null;
  /**
   * Legacy citation-only tests used this before Wave 4B. Keep it as a
   * compatibility alias while new execution uses requestedTools.
   */
  proposedToolNames?: ActorDecisionRuntimeToolName[];
}

export interface ActorDecisionPacketDraft {
  decisionSummary?: string;
  citedFactIds: string[];
  selectedGoal?: string | null;
  intent: string;
  requestedTools: ActorDecisionToolRequest[];
  beliefUpdates: string[];
  planUpdates: ActorDecisionPlanUpdate[];
  nextDecisionTrigger?: ActorDecisionTrigger;
  noActionReason?: string | null;
  proposedToolNames?: ActorDecisionRuntimeToolName[];
}

export type ParsedActorDecisionPacket = ActorDecisionPacketDraft & { actorId: string };

export interface ActorDecisionPacketFrameLike {
  observer?: {
    actorId?: string;
    id?: string;
  };
  facts: readonly { id: string }[];
  legalTools: readonly RuntimeToolName[];
}

export interface ActorDecisionPacketValidationIssue {
  code:
    | "actor_mismatch"
    | "invalid_fact_ref"
    | "missing_fact"
    | "unsupported_tool"
    | "empty_no_action_reason"
    | "invalid_shape";
  path: string;
  message: string;
}

export interface ActorDecisionPacketValidation {
  ok: boolean;
  issues: ActorDecisionPacketValidationIssue[];
}

export class ActorDecisionPacketValidationError extends Error {
  constructor(public readonly issues: readonly ActorDecisionPacketValidationIssue[]) {
    super(
      `ActorDecisionPacket validation failed: ${issues
        .map((issue) => `${issue.path} ${issue.message}`)
        .join("; ")}`,
    );
    this.name = "ActorDecisionPacketValidationError";
  }
}

const actorDecisionPlanUpdateStatuses = [
  "planned",
  "continued",
  "completed",
  "blocked",
] as const satisfies readonly ActorDecisionPlanUpdateStatus[];
const planUpdateStatusSchema = z.enum(actorDecisionPlanUpdateStatuses);
const planUpdateWriteScopesSchema = z.array(z.string().trim().min(1).max(160)).max(8).optional();

function formatCategorizedActorUpdate(input: {
  category?: string | null;
  update: string;
}): string {
  const category = input.category?.trim();
  const update = input.update.trim();
  return category ? `${category}: ${update}` : update;
}

function statusFromPlanUpdateCategory(
  category: string | null | undefined,
): ActorDecisionPlanUpdateStatus {
  switch (category?.trim().toLowerCase()) {
    case "planned":
    case "plan":
    case "new_plan":
      return "planned";
    case "completed":
    case "complete":
    case "done":
      return "completed";
    case "blocked":
    case "block":
    case "stuck":
      return "blocked";
    case "continued":
    case "continue":
    case "maintain":
    default:
      return "continued";
  }
}

const beliefUpdateSchema = z
  .union([
    z.string().trim().min(1).max(400),
    z
      .object({
        category: z.string().trim().min(1).max(80).optional(),
        update: z.string().trim().min(1).max(400),
      })
      .strict(),
  ])
  .transform((value) =>
    typeof value === "string"
      ? value
      : formatCategorizedActorUpdate(value),
  );

const canonicalPlanUpdateSchema = z
  .object({
    summary: z.string().trim().min(1).max(400),
    status: planUpdateStatusSchema,
    writeScopes: planUpdateWriteScopesSchema,
  })
  .strict();

const naturalPlanUpdateSchema = z
  .object({
    category: z.string().trim().min(1).max(80).optional(),
    update: z.string().trim().min(1).max(400),
    status: planUpdateStatusSchema.optional(),
    writeScopes: planUpdateWriteScopesSchema,
  })
  .strict();

const planUpdateSchema = z
  .union([canonicalPlanUpdateSchema, naturalPlanUpdateSchema])
  .transform((value): ActorDecisionPlanUpdate => {
    if ("summary" in value) {
      return {
        summary: value.summary,
        status: value.status,
      };
    }
    return {
      summary: value.update,
      status: value.status ?? statusFromPlanUpdateCategory(value.category),
    };
  });

const nextDecisionTriggerSchema = z
  .object({
    reason: z.string().trim().min(1).max(400),
    delayWorldTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  })
  .strict();

function legalActorDecisionToolNames(
  legalTools?: readonly RuntimeToolName[],
): ActorDecisionRuntimeToolName[] {
  const source = legalTools ?? actorDecisionRuntimeToolNames;
  return source.filter((toolName): toolName is ActorDecisionRuntimeToolName =>
    actorDecisionRuntimeToolNameSet.has(toolName));
}

function buildRequestedToolsSchema(
  legalTools?: readonly RuntimeToolName[],
): z.ZodType<ActorDecisionToolRequest[]> {
  const schemas = legalActorDecisionToolNames(legalTools)
    .map((toolName) => actorDecisionToolRequestSchemaByName.get(toolName))
    .filter((schema): schema is z.ZodType<ActorDecisionToolRequest> => Boolean(schema));
  if (schemas.length === 0) {
    return z
      .array(z.object({}).strict() as unknown as z.ZodType<ActorDecisionToolRequest>)
      .max(0)
      .default([])
      .describe("No actor tools are legal for this ActorFrame. Return requestedTools: [] only.");
  }
  const requestSchema = schemas.length === 1
    ? schemas[0]
    : z.discriminatedUnion(
        "toolName",
        schemas as unknown as Parameters<typeof z.discriminatedUnion>[1],
      ) as z.ZodType<ActorDecisionToolRequest>;
  return z
    .array(requestSchema)
    .max(ACTOR_DECISION_MAX_TOOLS)
    .default([])
    .describe(
      "Actor tool requests. Each entry must be exactly { toolName, purpose, input }. Never flatten input fields such as text, importance, participants, durability, or futureRelevance onto the request object.",
    );
}

export function buildActorDecisionPacketSchema(args: {
  legalTools?: readonly RuntimeToolName[];
  allowProposedToolNames?: boolean;
} = {}): z.ZodType<ActorDecisionPacketDraft> {
  const shape = {
    decisionSummary: z.string().trim().min(1).max(800).optional(),
    citedFactIds: z
      .array(z.string().trim().min(1).max(200))
      .min(1)
      .max(ACTOR_DECISION_MAX_FACTS)
      .describe("Short fact refs such as f1/f2 from the ActorFrame prompt. Do not copy backend fact ids."),
    selectedGoal: z.string().trim().min(1).max(500).nullable().optional(),
    intent: z.string().trim().min(1).max(800),
    requestedTools: buildRequestedToolsSchema(args.legalTools),
    beliefUpdates: z
      .array(beliefUpdateSchema)
      .max(6)
      .default([])
      .describe(
        "Private actor notes only. Entries may be strings or { category, update }; they do not mutate public world state.",
      ),
    planUpdates: z
      .array(planUpdateSchema)
      .max(6)
      .default([])
      .describe(
        "Actor process plan updates. Prefer { summary, status }; { category, update } is accepted and normalized to the actor process plan.",
      ),
    nextDecisionTrigger: nextDecisionTriggerSchema.optional(),
    noActionReason: z.string().trim().min(1).max(500).nullable().optional(),
    ...((args.allowProposedToolNames ?? true)
      ? {
          proposedToolNames: z.array(z.enum(actorDecisionRuntimeToolNames))
            .max(ACTOR_DECISION_MAX_TOOLS)
            .optional(),
        }
      : {}),
  };
  return z
    .object(shape)
    .strict()
    .superRefine((packet, ctx) => {
      const draft = packet as ActorDecisionPacketDraft;
      if (draft.requestedTools.length === 0 && !draft.noActionReason?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["noActionReason"],
          message: "noActionReason is required when the actor requests no tools",
        });
      }
    }) as z.ZodType<ActorDecisionPacketDraft>;
}

export const actorDecisionPacketSchema = buildActorDecisionPacketSchema();

export function parseActorDecisionPacket(input: unknown): ActorDecisionPacketDraft {
  return actorDecisionPacketSchema.parse(input);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function observerActorId(frame: ActorDecisionPacketFrameLike): string | null {
  return frame.observer?.actorId ?? frame.observer?.id ?? null;
}

function buildFactAliasMap(frame: ActorDecisionPacketFrameLike): Map<string, string> {
  const aliases = new Map<string, string>();
  frame.facts.forEach((fact, index) => {
    const ref = `f${index + 1}`;
    aliases.set(ref, fact.id);
  });
  return aliases;
}

function normalizePromptFactRef(value: string): string {
  return value.trim().toLowerCase();
}

function isPromptFactRef(value: string): boolean {
  return /^f[1-9]\d*$/u.test(normalizePromptFactRef(value));
}

function resolveFactRefs(
  values: readonly string[],
  factAliases: ReadonlyMap<string, string>,
): string[] {
  const result: string[] = [];
  for (const value of values) {
    const trimmed = normalizePromptFactRef(value);
    if (!trimmed) continue;
    const resolved = factAliases.get(trimmed) ?? trimmed;
    if (!result.includes(resolved)) {
      result.push(resolved);
    }
  }
  return result;
}

function normalizeToolRequestFactRefs<T extends ActorDecisionToolRequest>(
  request: T,
  factAliases: ReadonlyMap<string, string>,
): T {
  if (request.toolName !== "request_contested_outcome") {
    return request;
  }
  const input = request.input;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return request;
  }
  const evidenceRefs = (input as Record<string, unknown>).evidenceRefs;
  if (!Array.isArray(evidenceRefs)) {
    return request;
  }
  return {
    ...request,
    input: {
      ...input,
      evidenceRefs: resolveFactRefs(
        evidenceRefs.filter((value): value is string => typeof value === "string"),
        factAliases,
      ),
    },
  };
}

function normalizeActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: ActorDecisionPacketDraft;
}): ParsedActorDecisionPacket {
  const factAliases = buildFactAliasMap(input.frame);
  return {
    ...input.packet,
    actorId: observerActorId(input.frame) || "",
    citedFactIds: resolveFactRefs(input.packet.citedFactIds, factAliases),
    requestedTools: input.packet.requestedTools.map((request) =>
      normalizeToolRequestFactRefs(request, factAliases),
    ),
  };
}

function validatePromptFactRefs(input: {
  refs: readonly string[];
  path: string;
  issues: ActorDecisionPacketValidationIssue[];
}): void {
  for (const [index, ref] of input.refs.entries()) {
    if (!isPromptFactRef(ref)) {
      input.issues.push({
        code: "invalid_fact_ref",
        path: `${input.path}.${index}`,
        message: "Use short ActorFrame fact refs such as f1/f2; backend fact ids are not model-facing.",
      });
    }
  }
}

function validateToolPromptFactRefs(
  request: ActorDecisionToolRequest,
  requestIndex: number,
  issues: ActorDecisionPacketValidationIssue[],
): void {
  if (request.toolName !== "request_contested_outcome") {
    return;
  }
  const evidenceRefs = request.input.evidenceRefs;
  if (!Array.isArray(evidenceRefs)) {
    return;
  }
  validatePromptFactRefs({
    refs: evidenceRefs.filter((value): value is string => typeof value === "string"),
    path: `requestedTools.${requestIndex}.input.evidenceRefs`,
    issues,
  });
}

export function validateActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: unknown;
}): ActorDecisionPacketValidation {
  const issues: ActorDecisionPacketValidationIssue[] = [];
  const parsed = actorDecisionPacketSchema.safeParse(input.packet);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: "invalid_shape",
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      });
    }
    return { ok: false, issues };
  }

  const observerId = observerActorId(input.frame);
  if (!observerId) {
    issues.push({
      code: "actor_mismatch",
      path: "actorId",
      message: "ActorFrame observer is required; the model must not provide actorId.",
    });
  }

  validatePromptFactRefs({
    refs: parsed.data.citedFactIds,
    path: "citedFactIds",
    issues,
  });
  parsed.data.requestedTools.forEach((request, index) =>
    validateToolPromptFactRefs(request, index, issues),
  );

  const normalized = normalizeActorDecisionPacket({
    frame: input.frame,
    packet: parsed.data,
  });

  const factIds = new Set(input.frame.facts.map((fact) => fact.id));
  for (const [index, factId] of normalized.citedFactIds.entries()) {
    if (!factIds.has(factId)) {
      issues.push({
        code: "missing_fact",
        path: `citedFactIds.${index}`,
        message: `cited fact is not present in ActorFrame: ${factId}`,
      });
    }
  }

  const legalTools = new Set(input.frame.legalTools);
  for (const [index, request] of normalized.requestedTools.entries()) {
    if (!legalTools.has(request.toolName)) {
      issues.push({
        code: "unsupported_tool",
        path: `requestedTools.${index}.toolName`,
        message: `tool is not legal for this ActorFrame: ${request.toolName}`,
      });
    }
  }

  if (normalized.requestedTools.length === 0 && !normalized.noActionReason?.trim()) {
    issues.push({
      code: "empty_no_action_reason",
      path: "noActionReason",
      message: "actor chose no tool but did not explain why",
    });
  }

  return { ok: issues.length === 0, issues };
}

export function assertActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: unknown;
}): ParsedActorDecisionPacket {
  const parsed = parseActorDecisionPacket(input.packet);
  const validation = validateActorDecisionPacket({
    frame: input.frame,
    packet: parsed,
  });
  if (!validation.ok) {
    throw new ActorDecisionPacketValidationError(validation.issues);
  }
  return normalizeActorDecisionPacket({
    frame: input.frame,
    packet: parsed,
  });
}

export function validateBoundActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: unknown;
}): ActorDecisionPacketValidation {
  const issues: ActorDecisionPacketValidationIssue[] = [];
  if (!isRecord(input.packet)) {
    return {
      ok: false,
      issues: [{
        code: "invalid_shape",
        path: "(root)",
        message: "Expected bound ActorDecisionPacket object.",
      }],
    };
  }

  const { actorId: actorIdValue, ...draft } = input.packet;
  const actorId = typeof actorIdValue === "string" ? actorIdValue.trim() : "";
  const parsed = actorDecisionPacketSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        code: "invalid_shape",
        path: issue.path.join(".") || "(root)",
        message: issue.message,
      });
    }
    return { ok: false, issues };
  }

  const observerId = observerActorId(input.frame);
  if (!observerId || actorId !== observerId) {
    issues.push({
      code: "actor_mismatch",
      path: "actorId",
      message: `bound actorId must match ActorFrame observer: ${observerId ?? "(missing observer)"}`,
    });
  }

  const factIds = new Set(input.frame.facts.map((fact) => fact.id));
  for (const [index, factId] of parsed.data.citedFactIds.entries()) {
    if (!factIds.has(factId)) {
      issues.push({
        code: "missing_fact",
        path: `citedFactIds.${index}`,
        message: `cited fact is not present in ActorFrame: ${factId}`,
      });
    }
  }

  const legalTools = new Set(input.frame.legalTools);
  for (const [index, request] of parsed.data.requestedTools.entries()) {
    if (!legalTools.has(request.toolName)) {
      issues.push({
        code: "unsupported_tool",
        path: `requestedTools.${index}.toolName`,
        message: `tool is not legal for this ActorFrame: ${request.toolName}`,
      });
    }
  }

  if (parsed.data.requestedTools.length === 0 && !parsed.data.noActionReason?.trim()) {
    issues.push({
      code: "empty_no_action_reason",
      path: "noActionReason",
      message: "actor chose no tool but did not explain why",
    });
  }

  return { ok: issues.length === 0, issues };
}

export function assertBoundActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: unknown;
}): ParsedActorDecisionPacket {
  const validation = validateBoundActorDecisionPacket(input);
  if (!validation.ok) {
    throw new ActorDecisionPacketValidationError(validation.issues);
  }
  const record = input.packet as Record<string, unknown>;
  const { actorId, ...draft } = record;
  const parsed = parseActorDecisionPacket(draft);
  return {
    ...parsed,
    actorId: String(actorId).trim(),
  };
}
