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

export interface ActorDecisionToolRequest {
  toolName: ActorDecisionRuntimeToolName;
  purpose: string;
  input: Record<string, unknown>;
}

export interface ActorDecisionPlanUpdate {
  summary: string;
  status: "planned" | "continued" | "completed" | "blocked";
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

const toolRequestSchema = z
  .object({
    toolName: z.enum(actorDecisionRuntimeToolNames),
    purpose: z.string().trim().min(1).max(300),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((request, ctx) => {
    const toolSchema = runtimeToolInputSchemas[request.toolName];
    const parsed = toolSchema.safeParse(request.input);
    if (parsed.success) {
      return;
    }
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["input", ...issue.path],
        message: issue.message,
      });
    }
  });

const planUpdateSchema = z
  .object({
    summary: z.string().trim().min(1).max(400),
    status: z.enum(["planned", "continued", "completed", "blocked"]),
    writeScopes: z.array(z.string().trim().min(1).max(160)).max(8).optional(),
  })
  .strict();

const nextDecisionTriggerSchema = z
  .object({
    reason: z.string().trim().min(1).max(400),
    delayWorldTimeMinutes: z.number().int().min(0).max(24 * 60).optional(),
  })
  .strict();

export const actorDecisionPacketSchema = z
  .object({
    actorId: z.string().trim().min(1).max(160),
    decisionSummary: z.string().trim().min(1).max(800).optional(),
    citedFactIds: z
      .array(z.string().trim().min(1).max(200))
      .min(1)
      .max(ACTOR_DECISION_MAX_FACTS),
    selectedGoal: z.string().trim().min(1).max(500).nullable().optional(),
    intent: z.string().trim().min(1).max(800),
    requestedTools: z.array(toolRequestSchema).max(ACTOR_DECISION_MAX_TOOLS).default([]),
    beliefUpdates: z.array(z.string().trim().min(1).max(400)).max(6).default([]),
    planUpdates: z.array(planUpdateSchema).max(6).default([]),
    nextDecisionTrigger: nextDecisionTriggerSchema.optional(),
    noActionReason: z.string().trim().min(1).max(500).nullable().optional(),
    proposedToolNames: z.array(z.enum(actorDecisionRuntimeToolNames)).max(ACTOR_DECISION_MAX_TOOLS).optional(),
  })
  .strict()
  .superRefine((packet, ctx) => {
    if ((packet.requestedTools?.length ?? 0) === 0 && !packet.noActionReason?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["noActionReason"],
        message: "noActionReason is required when the actor requests no tools",
      });
    }
  });

export type ParsedActorDecisionPacket = z.infer<typeof actorDecisionPacketSchema>;

export function parseActorDecisionPacket(input: unknown): ParsedActorDecisionPacket {
  return actorDecisionPacketSchema.parse(input);
}

export function validateActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: ActorDecisionPacket;
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

  const observerId =
    input.frame.observer?.actorId ?? input.frame.observer?.id ?? null;
  if (observerId && parsed.data.actorId !== observerId) {
    issues.push({
      code: "actor_mismatch",
      path: "actorId",
      message: `packet actorId must match ActorFrame observer ${observerId}`,
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

export function assertActorDecisionPacket(input: {
  frame: ActorDecisionPacketFrameLike;
  packet: ActorDecisionPacket;
}): ParsedActorDecisionPacket {
  const parsed = parseActorDecisionPacket(input.packet);
  const validation = validateActorDecisionPacket({
    frame: input.frame,
    packet: parsed,
  });
  if (!validation.ok) {
    throw new ActorDecisionPacketValidationError(validation.issues);
  }
  return parsed;
}
