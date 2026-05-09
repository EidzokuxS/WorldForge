import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import type { OracleResult } from "./oracle.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  shouldDropModelFacingText,
  type ModelFacingPromptSafety,
  type ModelFacingSceneView,
} from "./model-facing-scene.js";
import { buildGmActionChecklistPromptContract } from "./prompt-contracts.js";
import type { GmRead } from "./gm-turn-read.js";
import {
  buildPlayerActionEpistemicNotes,
  grantsClaimedAccessFromUnconfirmedProof,
  isClaimedProofAccessOrExistenceOutcome,
  isUnconfirmedAccessProofClaim,
} from "./player-action-epistemics.js";
import type { SceneFrame } from "./scene-frame.js";
import { runtimeToolInputSchemas, type RuntimeToolName } from "./tool-schemas.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";

const log = createLogger("gm-action-checklist");

export const GM_ACTION_CHECKLIST_VERSION = "gm-action-checklist.v1";
export const GM_ACTION_CHECKLIST_MAX_STEPS = 6;
const CHECKLIST_TEXT_MAX = 500;
const CHECKLIST_REF_MAX = 160;
const CHECKLIST_EVIDENCE_MAX = 8;
const CHECKLIST_TARGET_REF_MAX = 4;

const runtimeToolNames = Object.keys(runtimeToolInputSchemas) as [
  RuntimeToolName,
  ...RuntimeToolName[],
];

const checklistText = (max = CHECKLIST_TEXT_MAX) => z.string().trim().min(1).max(max);
const checklistRef = z.string().trim().min(1).max(CHECKLIST_REF_MAX);
const evidenceRefsSchema = z.array(checklistRef).min(1).max(CHECKLIST_EVIDENCE_MAX);
const stepIdSchema = z.enum(["step-1", "step-2", "step-3", "step-4", "step-5", "step-6"]);

const forbiddenChecklistKeys = new Set([
  "actionid",
  "actionids",
  "conditiondelta",
  "durableevent",
  "eventid",
  "hpdelta",
  "inventoryadd",
  "inventoryremove",
  "narratorfacts",
  "payload",
  "persistedfacts",
  "plannedactions",
  "plannedtools",
  "responseid",
  "responseids",
  "statedelta",
  "toolinput",
  "toolresultrefs",
  "worlddelta",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeChecklistKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function pathEndsWithCandidateToolRequest(path: readonly (string | number)[]): boolean {
  return path[path.length - 1] === "candidateToolRequest";
}

function isInsideCandidateToolRequest(path: readonly (string | number)[]): boolean {
  return path.includes("candidateToolRequest");
}

function addForbiddenChecklistPayloadIssues(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      addForbiddenChecklistPayloadIssues(entry, ctx, [...path, index]));
    return;
  }

  if (!isRecord(value)) return;

  const insideCandidate = isInsideCandidateToolRequest(path);
  const hasToolCallShape = Object.hasOwn(value, "toolName")
    && (Object.hasOwn(value, "input") || Object.hasOwn(value, "payload"));
  if (hasToolCallShape && !pathEndsWithCandidateToolRequest(path)) {
    ctx.addIssue({
      code: "custom",
      message: "GM Action Checklist may contain toolName/input only inside candidateToolRequest.",
      path,
    });
  }

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = normalizeChecklistKey(key);
    if (forbiddenChecklistKeys.has(normalizedKey)) {
      ctx.addIssue({
        code: "custom",
        message: `GM Action Checklist cannot contain backend-owned field "${key}".`,
        path: [...path, key],
      });
    }
    if (!insideCandidate && (normalizedKey === "toolname" || normalizedKey === "input")) {
      ctx.addIssue({
        code: "custom",
        message: `GM Action Checklist may contain "${key}" only inside candidateToolRequest.`,
        path: [...path, key],
      });
    }
    addForbiddenChecklistPayloadIssues(entry, ctx, [...path, key]);
  }
}

const candidateToolRequestSchema = z
  .object({
    toolName: z.enum(runtimeToolNames),
    actorRef: checklistRef.optional(),
    targetRefs: z.array(checklistRef).max(CHECKLIST_TARGET_REF_MAX).default([]),
    input: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()
  .superRefine((request, ctx) => {
    const schema = runtimeToolInputSchemas[request.toolName];
    const parsed = schema.safeParse(request.input);
    if (!parsed.success) {
      ctx.addIssue({
        code: "custom",
        message: `candidateToolRequest.input does not satisfy ${request.toolName} runtime schema.`,
        path: ["input"],
      });
    }
  });

const checklistStepSchema = z
  .object({
    stepId: stepIdSchema,
    purpose: checklistText(),
    evidenceRefs: evidenceRefsSchema,
    dependsOnStepIds: z.array(stepIdSchema).max(GM_ACTION_CHECKLIST_MAX_STEPS - 1).default([]),
    expectedVisibleEffect: checklistText(),
    requiredAction: z.enum([
      "runtime_tool",
      "combat_transition",
      "oracle",
      "narration_constraint",
      "skip",
    ]),
    status: z.literal("pending"),
    candidateRefs: z.array(checklistRef).max(CHECKLIST_TARGET_REF_MAX).default([]),
    candidateToolRequest: candidateToolRequestSchema.optional(),
  })
  .strict()
  .superRefine((step, ctx) => {
    const stepIndex = Number(step.stepId.replace("step-", ""));
    for (const dependencyId of step.dependsOnStepIds) {
      const dependencyIndex = Number(dependencyId.replace("step-", ""));
      if (dependencyIndex >= stepIndex) {
        ctx.addIssue({
          code: "custom",
          message: "dependsOnStepIds may reference only earlier checklist steps.",
          path: ["dependsOnStepIds"],
        });
      }
    }
    if (step.requiredAction === "runtime_tool" && !step.candidateToolRequest) {
      ctx.addIssue({
        code: "custom",
        message: "runtime_tool steps must include candidateToolRequest.",
        path: ["candidateToolRequest"],
      });
    }
    if (step.requiredAction !== "runtime_tool" && step.candidateToolRequest) {
      ctx.addIssue({
        code: "custom",
        message: "candidateToolRequest is allowed only for runtime_tool steps.",
        path: ["candidateToolRequest"],
      });
    }
  });

const gmActionChecklistObjectSchema = z
  .object({
    version: z.literal(GM_ACTION_CHECKLIST_VERSION).default(GM_ACTION_CHECKLIST_VERSION),
    turnPath: z.enum(["tool_plan", "roll_oracle", "combat_transition"]),
    turnIntent: checklistText(),
    steps: z.array(checklistStepSchema).min(1).max(GM_ACTION_CHECKLIST_MAX_STEPS),
  })
  .strict()
  .superRefine((checklist, ctx) => {
    const seen = new Set<string>();
    checklist.steps.forEach((step, index) => {
      const expectedStepId = `step-${index + 1}`;
      if (step.stepId !== expectedStepId) {
        ctx.addIssue({
          code: "custom",
          message: `stepId must be sequential: expected ${expectedStepId}.`,
          path: ["steps", index, "stepId"],
        });
      }
      if (seen.has(step.stepId)) {
        ctx.addIssue({
          code: "custom",
          message: `duplicate stepId ${step.stepId}.`,
          path: ["steps", index, "stepId"],
        });
      }
      seen.add(step.stepId);
    });
  });

function normalizeChecklistInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    version: value.version ?? GM_ACTION_CHECKLIST_VERSION,
    ...value,
  };
}

export const gmActionChecklistSchema = z
  .unknown()
  .superRefine(addForbiddenChecklistPayloadIssues)
  .pipe(z.preprocess(normalizeChecklistInput, gmActionChecklistObjectSchema));

export type GmActionChecklist = z.infer<typeof gmActionChecklistSchema>;

export interface RunGmActionChecklistArgs {
  provider: ProviderConfig;
  playerAction: string;
  frame: SceneFrame;
  gmRead: Extract<GmRead, { path: "tool_plan" | "roll_oracle" | "combat_transition" }>;
  oracleResult?: OracleResult | null;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  recentConversation?: Array<{ role: string; content: string }>;
  maxOutputTokens?: number;
}

export type GmActionChecklistValidationIssue = {
  path: string;
  message: string;
};

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function addRef(refs: Set<string>, value?: string | null): void {
  if (value?.trim()) refs.add(normalizeRef(value));
}

function buildAllowedRefSet(frame: SceneFrame): Set<string> {
  const refs = new Set<string>();
  addRef(refs, "Player");
  addRef(refs, `actor:Player`);
  addRef(refs, frame.playerActorId);
  for (const actor of [...frame.roster.active, ...frame.roster.support]) {
    addRef(refs, actor.id);
    addRef(refs, actor.actorId);
    addRef(refs, actor.label);
  }
  for (const candidate of frame.targetCandidates) {
    addRef(refs, candidate.id);
    addRef(refs, candidate.actorId);
    addRef(refs, candidate.itemId);
    addRef(refs, candidate.locationId);
    addRef(refs, candidate.factionId);
    addRef(refs, candidate.label);
  }
  for (const candidate of frame.movementCandidates) {
    addRef(refs, candidate.id);
    addRef(refs, candidate.locationId);
    addRef(refs, candidate.label);
  }
  return refs;
}

function buildForbiddenRefSet(frame: SceneFrame): Set<string> {
  const refs = new Set<string>();
  for (const ref of frame.perception.forbiddenActorIds ?? []) addRef(refs, ref);
  for (const ref of frame.perception.forbiddenActorLabels ?? []) addRef(refs, ref);
  for (const actor of frame.roster.background) {
    addRef(refs, actor.id);
    addRef(refs, actor.actorId);
    addRef(refs, actor.label);
  }
  for (const actor of frame.roster.support.filter((entry) => entry.awareness !== "clear")) {
    addRef(refs, actor.id);
    addRef(refs, actor.actorId);
    addRef(refs, actor.label);
  }
  return refs;
}

function validateRefs(
  refs: readonly string[],
  frame: SceneFrame,
  path: string,
): GmActionChecklistValidationIssue[] {
  const allowedRefs = buildAllowedRefSet(frame);
  const forbiddenRefs = buildForbiddenRefSet(frame);
  const issues: GmActionChecklistValidationIssue[] = [];

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

export function validateGmActionChecklistForFrame(
  checklist: GmActionChecklist,
  frame: SceneFrame,
  playerAction?: string,
): GmActionChecklistValidationIssue[] {
  const issues: GmActionChecklistValidationIssue[] = [];
  const unconfirmedAccessClaim = playerAction
    ? isUnconfirmedAccessProofClaim(playerAction)
    : false;

  checklist.steps.forEach((step, index) => {
    issues.push(...validateRefs(step.evidenceRefs, frame, `steps.${index}.evidenceRefs`));
    issues.push(...validateRefs(step.candidateRefs, frame, `steps.${index}.candidateRefs`));
    if (step.candidateToolRequest?.actorRef) {
      issues.push(
        ...validateRefs(
          [step.candidateToolRequest.actorRef],
          frame,
          `steps.${index}.candidateToolRequest.actorRef`,
        ),
      );
    }
    if (step.candidateToolRequest) {
      issues.push(
        ...validateRefs(
          step.candidateToolRequest.targetRefs,
          frame,
          `steps.${index}.candidateToolRequest.targetRefs`,
        ),
      );
      if (!frame.allowedTools.includes(step.candidateToolRequest.toolName)) {
        issues.push({
          path: `steps.${index}.candidateToolRequest.toolName`,
          message: "candidateToolRequest.toolName must be one of frame.allowedTools.",
        });
      }
      if (unconfirmedAccessClaim) {
        if (
          grantsClaimedAccessFromUnconfirmedProof(
            step.candidateToolRequest.toolName,
            step.candidateToolRequest.input,
          )
        ) {
          issues.push({
            path: `steps.${index}.candidateToolRequest.toolName`,
            message:
              "unconfirmed access proof claims cannot be planned as access-granting reveal_location, move_to, spawn_item, or durable access log_event. Plan refusal, suspicion, alarm, request for proof, or scene-local attempted/failed beat instead.",
          });
        }
      }
    }
    if (
      unconfirmedAccessClaim
      && step.requiredAction === "oracle"
      && isClaimedProofAccessOrExistenceOutcome(`${step.purpose}\n${step.expectedVisibleEffect}`)
    ) {
      issues.push({
        path: `steps.${index}.requiredAction`,
        message:
          "unconfirmed access proof claims cannot use checklist Oracle steps to establish the claimed proof, access, or movement. Oracle uncertainty must stay social/visible and non-mutating.",
      });
    }
  });

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

export function buildGmActionChecklistPrompt(args: RunGmActionChecklistArgs): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  return [
    "MODEL-FACING GM ACTION CHECKLIST CONTRACT",
    buildGmActionChecklistPromptContract({ allowedTools: args.frame.allowedTools }),
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "PLAYER ACTION EPISTEMIC NOTES",
    buildPlayerActionEpistemicNotes(args.playerAction),
    "",
    "GM READ",
    JSON.stringify(args.gmRead, null, 2),
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
    "ORACLE RESULT",
    args.oracleResult ? JSON.stringify(args.oracleResult, null, 2) : "- none",
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

export async function runGmActionChecklist(
  args: RunGmActionChecklistArgs,
): Promise<GmActionChecklist> {
  const model = createModel(args.provider, { role: "judge" });
  const system = [
    "You are the GM/Judge planning mutating consequences for one player turn.",
    "Return one GM Action Checklist JSON object only. Do not write final narration or markdown.",
    "Checklist steps are auditable intent and untrusted candidate tool requests. Backend validates each later step before execution.",
    "Use only model-facing refs and allowed tools. Do not invent backend IDs, private facts, or state deltas.",
  ].join(" ");
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const prompt = buildGmActionChecklistPrompt(args);
  const startMs = Date.now();

  log.event("model-facing.scene-packet", {
    source: "gm-action-checklist",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: gmActionChecklistSchema,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 1800,
      retries: 1,
    }),
  );
  const issues = validateGmActionChecklistForFrame(result.object, args.frame, args.playerAction);
  const trace = result.trace;

  log.event("judge.gm-action-checklist", {
    turnPath: result.object.turnPath,
    stepCount: result.object.steps.length,
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
      `GM Action Checklist validation failed:\n${issues
        .map((issue) => `- ${issue.path}: ${issue.message}`)
        .join("\n")}`,
    );
  }

  return result.object;
}
