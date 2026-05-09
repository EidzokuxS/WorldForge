import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  shouldDropModelFacingText,
  type ModelFacingPromptSafety,
  type ModelFacingSceneView,
} from "./model-facing-scene.js";
import { buildGmTurnDecisionPromptContract } from "./prompt-contracts.js";
import type { SceneFrame } from "./scene-frame.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";

const log = createLogger("gm-turn-decision");

const GM_DECISION_TEXT_MAX = 1000;
const GM_DECISION_REF_MAX = 160;
const GM_DECISION_EVIDENCE_MAX = 8;
const GM_DECISION_TOOL_PLAN_MAX = 6;

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];

const decisionText = (max = GM_DECISION_TEXT_MAX) => z.string().trim().min(1).max(max);
const decisionRef = z.string().trim().min(1).max(GM_DECISION_REF_MAX);
const evidenceRefsSchema = z.array(decisionRef).min(1).max(GM_DECISION_EVIDENCE_MAX);
const schemaShapedInput = z.record(z.string(), z.unknown()).default({});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function clippedDecisionText(
  value: unknown,
  fallback: string,
  max = GM_DECISION_TEXT_MAX,
): string {
  const text = asString(value) ?? fallback;
  return text.length > max ? text.slice(0, max).trim() : text;
}

function refArray(value: unknown, maxItems = GM_DECISION_EVIDENCE_MAX): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => asString(entry))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, maxItems)
    .map((entry) => clippedDecisionText(entry, entry, GM_DECISION_REF_MAX));
}

const gmTurnDecisionPaths = new Set([
  "direct",
  "roll_oracle",
  "tool_plan",
  "combat_transition",
  "clarification",
  "continue",
]);

const forbiddenDecisionKeys = new Set([
  "actioncategory",
  "conditiondelta",
  "durableevent",
  "hpdelta",
  "inventoryadd",
  "inventoryremove",
  "narratorfacts",
  "payload",
  "statedelta",
  "toolinput",
  "worlddelta",
]);

function normalizeDecisionKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function addDecisionPayloadIssues(value: unknown, ctx: z.RefinementCtx): void {
  if (!isRecord(value)) return;

  for (const key of Object.keys(value)) {
    if (forbiddenDecisionKeys.has(normalizeDecisionKey(key))) {
      ctx.addIssue({
        code: "custom",
        message: `GmTurnDecision cannot contain backend-owned field "${key}".`,
        path: [key],
      });
    }
  }

  const path = asString(value.path);
  if (path && path !== "roll_oracle" && Object.hasOwn(value, "rollRequest")) {
    ctx.addIssue({
      code: "custom",
      message: "Only roll_oracle decisions may include rollRequest.",
      path: ["rollRequest"],
    });
  }
}

const gmTurnDecisionBaseSchema = z
  .object({
    rationale: decisionText().optional(),
    evidenceRefs: evidenceRefsSchema.default([]),
  })
  .strict();

const rollRequestSchema = z
  .object({
    actorRef: decisionRef,
    targetRef: decisionRef.optional(),
    question: decisionText(),
    stakes: decisionText(),
    evidenceRefs: evidenceRefsSchema,
  })
  .strict();

const plannedToolSchema = z
  .object({
    toolName: z.enum(runtimeToolNames),
    actorRef: decisionRef,
    targetRefs: z.array(decisionRef).max(4).default([]),
    input: schemaShapedInput,
    evidenceRefs: evidenceRefsSchema,
  })
  .strict();

const gmTurnDecisionUnionSchema = z.discriminatedUnion("path", [
  gmTurnDecisionBaseSchema
    .extend({
      path: z.literal("direct"),
      directResolutionNotes: decisionText(),
      narrationGuidance: decisionText().optional(),
    })
    .strict(),
  gmTurnDecisionBaseSchema
    .extend({
      path: z.literal("roll_oracle"),
      rollRequest: rollRequestSchema,
    })
    .strict(),
  gmTurnDecisionBaseSchema
    .extend({
      path: z.literal("tool_plan"),
      plannedTools: z.array(plannedToolSchema).min(1).max(GM_DECISION_TOOL_PLAN_MAX),
    })
    .strict(),
  gmTurnDecisionBaseSchema
    .extend({
      path: z.literal("combat_transition"),
      actorRef: decisionRef,
      targetRef: decisionRef,
      combatFraming: decisionText(),
      stakes: decisionText(),
      evidenceRefs: evidenceRefsSchema,
    })
    .strict(),
  gmTurnDecisionBaseSchema
    .extend({
      path: z.literal("clarification"),
      clarificationPrompt: decisionText(),
    })
    .strict(),
  gmTurnDecisionBaseSchema
    .extend({
      path: z.literal("continue"),
      continuationGuidance: decisionText(),
    })
    .strict(),
]);

function decideNormalizedPath(value: Record<string, unknown>): unknown {
  const path = asString(value.path);
  const hasDirectNotes =
    asString(value.directResolutionNotes)
    || asString(value.narrationGuidance)
    || asString(value.rationale);

  if (
    path === "tool_plan"
    && !Array.isArray(value.plannedTools)
    && hasDirectNotes
  ) {
    return "direct";
  }

  if (path && gmTurnDecisionPaths.has(path)) return path;
  if (path) return path;
  if (Object.hasOwn(value, "plannedTools")) return "tool_plan";
  if (Object.hasOwn(value, "rollRequest")) return "roll_oracle";
  if (Object.hasOwn(value, "combatFraming")) return "combat_transition";
  if (Object.hasOwn(value, "clarificationPrompt")) return "clarification";
  if (Object.hasOwn(value, "continuationGuidance")) return "continue";
  if (hasDirectNotes) return "direct";
  return path;
}

function normalizeGmTurnDecisionInput(value: unknown): unknown {
  if (!isRecord(value)) return value;

  const path = decideNormalizedPath(value);
  const evidenceRefs = Object.hasOwn(value, "evidenceRefs")
    ? refArray(value.evidenceRefs)
    : undefined;
  const base = {
    rationale: asString(value.rationale)
      ? value.rationale
      : undefined,
    evidenceRefs,
  };

  switch (path) {
    case "direct":
      return {
        ...base,
        path: "direct",
        directResolutionNotes:
          asString(value.directResolutionNotes)
          ?? asString(value.narrationGuidance)
          ?? asString(value.rationale)
          ?? undefined,
        narrationGuidance: asString(value.narrationGuidance)
          ? value.narrationGuidance
          : undefined,
      };
    case "roll_oracle":
      return {
        ...base,
        path: "roll_oracle",
        rollRequest: value.rollRequest,
      };
    case "tool_plan":
      return {
        ...base,
        path: "tool_plan",
        plannedTools: value.plannedTools,
      };
    case "combat_transition":
      return {
        ...base,
        path: "combat_transition",
        actorRef: value.actorRef,
        targetRef: value.targetRef,
        combatFraming: value.combatFraming,
        stakes: value.stakes,
      };
    case "clarification":
      return {
        ...base,
        path: "clarification",
        clarificationPrompt: value.clarificationPrompt,
      };
    case "continue":
      return {
        ...base,
        path: "continue",
        continuationGuidance: value.continuationGuidance,
      };
    default:
      return value;
  }
}

export const gmTurnDecisionSchema = z
  .unknown()
  .superRefine(addDecisionPayloadIssues)
  .pipe(z.preprocess(normalizeGmTurnDecisionInput, gmTurnDecisionUnionSchema));

export type GmTurnDecision = z.infer<typeof gmTurnDecisionSchema>;

export interface RunGmTurnDecisionArgs {
  provider: ProviderConfig;
  playerAction: string;
  frame: SceneFrame;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  recentConversation?: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}

type DecisionValidationIssue = {
  path: string;
  message: string;
};

const toolsRequiringTargets = new Set<RuntimeToolName>([
  "add_tag",
  "remove_tag",
  "set_relationship",
  "set_condition",
  "move_to",
  "transfer_item",
  "promote_npc",
]);

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function buildAllowedRefSet(frame: SceneFrame): Set<string> {
  const refs = new Set<string>();
  const add = (value?: string | null) => {
    if (value?.trim()) refs.add(normalizeRef(value));
  };

  add(frame.playerActorId);
  for (const actor of [...frame.roster.active, ...frame.roster.support]) {
    add(actor.id);
    add(actor.actorId);
    add(actor.label);
  }
  for (const candidate of frame.targetCandidates) {
    add(candidate.id);
    add(candidate.label);
  }
  for (const candidate of frame.movementCandidates) {
    add(candidate.id);
    add(candidate.label);
  }

  return refs;
}

function buildForbiddenRefSet(frame: SceneFrame): Set<string> {
  const refs = new Set<string>();
  const add = (value?: string | null) => {
    if (value?.trim()) refs.add(normalizeRef(value));
  };

  for (const ref of frame.perception.forbiddenActorIds ?? []) add(ref);
  for (const ref of frame.perception.forbiddenActorLabels ?? []) add(ref);
  for (const actor of frame.roster.background) {
    add(actor.id);
    add(actor.actorId);
    add(actor.label);
  }
  for (const actor of frame.roster.support.filter((entry) => entry.awareness !== "clear")) {
    add(actor.id);
    add(actor.actorId);
    add(actor.label);
  }

  return refs;
}

function validateRefs(
  refs: readonly string[],
  frame: SceneFrame,
  path: string,
): DecisionValidationIssue[] {
  const allowedRefs = buildAllowedRefSet(frame);
  const forbiddenRefs = buildForbiddenRefSet(frame);
  const issues: DecisionValidationIssue[] = [];

  refs.forEach((ref, index) => {
    const normalized = normalizeRef(ref);
    if (forbiddenRefs.has(normalized)) {
      issues.push({
        path: `${path}.${index}`,
        message: `${path}.${index} references forbidden SceneFrame ref "${ref}".`,
      });
      return;
    }
    if (!allowedRefs.has(normalized)) {
      issues.push({
        path: `${path}.${index}`,
        message: `${path}.${index} references a ref outside SceneFrame candidates: "${ref}".`,
      });
    }
  });

  return issues;
}

export function validateGmTurnDecisionForFrame(
  decision: GmTurnDecision,
  frame: SceneFrame,
): DecisionValidationIssue[] {
  const issues: DecisionValidationIssue[] = [];

  if (decision.path !== "roll_oracle" && "rollRequest" in decision) {
    issues.push({
      path: "rollRequest",
      message: "Only roll_oracle decisions may request backend randomness or Oracle.",
    });
  }

  if (decision.path === "roll_oracle") {
    issues.push(
      ...validateRefs([decision.rollRequest.actorRef], frame, "rollRequest.actorRef"),
    );
    if (decision.rollRequest.targetRef) {
      issues.push(
        ...validateRefs([decision.rollRequest.targetRef], frame, "rollRequest.targetRef"),
      );
    }
  }

  if (decision.path === "tool_plan") {
    decision.plannedTools.forEach((tool, index) => {
      if (!frame.allowedTools.includes(tool.toolName)) {
        issues.push({
          path: `plannedTools.${index}.toolName`,
          message: `plannedTools.${index}.toolName must be one of frame.allowedTools.`,
        });
      }
      if (toolsRequiringTargets.has(tool.toolName) && tool.targetRefs.length === 0) {
        issues.push({
          path: `plannedTools.${index}.targetRefs`,
          message: `${tool.toolName} requires concrete targetRefs from the SceneFrame.`,
        });
      }
      issues.push(...validateRefs([tool.actorRef], frame, `plannedTools.${index}.actorRef`));
      issues.push(...validateRefs(tool.targetRefs, frame, `plannedTools.${index}.targetRefs`));
    });
  }

  if (decision.path === "combat_transition") {
    issues.push(...validateRefs([decision.actorRef], frame, "actorRef"));
    issues.push(...validateRefs([decision.targetRef], frame, "targetRef"));
  }

  return issues;
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  safety?: ModelFacingPromptSafety,
  extraForbiddenTerms: readonly string[] = [],
): string {
  if (!recentConversation || recentConversation.length === 0) {
    return "- none";
  }

  const forbiddenTerms = extraForbiddenTerms
    .map((term) => term.trim().toLowerCase())
    .filter((term) => term.length > 0);
  const lines = recentConversation
    .slice(-8)
    .filter((entry) => {
      if (safety && shouldDropModelFacingText(entry.content, safety)) return false;
      const content = entry.content.toLowerCase();
      return !forbiddenTerms.some((term) => content.includes(term));
    })
    .map((entry) => `- ${entry.role}: ${entry.content}`)
    .join("\n");

  return lines || "- none";
}

function buildCandidateRefsForPrompt(view: ModelFacingSceneView): unknown {
  return {
    actors: view.visibleActors.map((actor) => ({
      id: actor.id,
      actorId: actor.actorId,
      label: actor.label,
      awareness: actor.awareness,
    })),
    targets: view.legalTargets.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
      type: candidate.type,
    })),
    movements: view.legalMovement.map((candidate) => ({
      id: candidate.id,
      label: candidate.label,
    })),
  };
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

function buildGmTurnDecisionPrompt(args: RunGmTurnDecisionArgs): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  return [
    "MODEL-FACING GM TURN DECISION CONTRACT",
    buildGmTurnDecisionPromptContract({ allowedTools: args.frame.allowedTools }),
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(scenePacket.view, null, 2),
    "",
    "CANDIDATE REFS FROM MODEL-FACING VIEW ONLY",
    JSON.stringify(buildCandidateRefsForPrompt(scenePacket.view), null, 2),
    "",
    "ALLOWED TOOLS FROM frame.allowedTools",
    args.frame.allowedTools.length > 0
      ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
      : "- none",
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(scopedForecastForPrompt(args.scopedForecastExcerpt), null, 2),
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation,
      scenePacket.safety,
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    ),
  ].join("\n");
}

export async function runGmTurnDecision(
  args: RunGmTurnDecisionArgs,
): Promise<GmTurnDecision> {
  const model = createModel(args.provider, { role: "judge" });
  const system = [
    "You are the GM/Judge semantic interpreter for one player turn.",
    "Return one GmTurnDecision JSON object only. Do not write prose, dialogue, or markdown.",
    "Use the raw playerAction text, model-facing scene view, candidate refs from the view, and allowed tools from frame.allowedTools.",
    "Use scoped forecast excerpts only as local advisory pressure; they do not expand legal refs, reveal private facts, or authorize tools.",
    "Do not require Act/Speak/Observe command modes.",
    "Do not invent backend-owned target, tool, time, stat, inventory, location, relationship, HP, condition, or persistence semantics.",
  ].join(" ");
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const prompt = buildGmTurnDecisionPrompt(args);
  const startMs = Date.now();
  log.event("model-facing.scene-packet", {
    source: "gm-turn-decision",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });
  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: gmTurnDecisionSchema,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 1200,
      retries: 1,
    }),
  );
  const issues = validateGmTurnDecisionForFrame(result.object, args.frame);
  const trace = result.trace;
  log.event("judge.gm-turn-decision", {
    path: result.object.path,
    success: issues.length === 0,
    issueCount: issues.length,
    strategy: trace?.strategy ?? null,
    primaryStrategy: trace?.primaryStrategy ?? null,
    fallbackStrategy: trace?.fallbackStrategy ?? null,
    fallbackReason: trace?.fallbackReason ?? null,
    capability: trace?.capability ?? null,
    usage: trace?.usage ?? null,
    responseModel: trace?.response?.modelId ?? null,
    latencyMs: Date.now() - startMs,
  });
  if (issues.length > 0) {
    throw new Error(
      `GmTurnDecision validation failed:\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  return result.object;
}
