import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  buildModelFacingScenePromptView,
  collectModelFacingScenePromptRefs,
  isUnsafeModelFacingRef,
  oracleContextForModelPrompt,
  type ModelFacingPromptSafety,
  type ModelFacingSceneView,
} from "./model-facing-scene.js";
import {
  formatModelFacingPlayerActionText,
  formatModelFacingRecentConversation,
  sanitizeModelFacingJson,
} from "./model-facing-conversation.js";
import {
  buildPlayerActionEpistemicNotes,
  isClaimedProofOracleExistenceQuestion,
  isUnconfirmedAccessProofClaim,
} from "./player-action-epistemics.js";
import { buildGmReadPromptContract } from "./prompt-contracts.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  scopedForecastForModelPrompt,
  type ScopedForecastExcerpt,
} from "./world-forecast.js";
import { isCombatPressureAction } from "./combat-envelope.js";
import {
  formatSessionLanguageContract,
  inferSessionResponseLanguage,
  type SessionResponseLanguage,
} from "./session-language.js";
import { playerBlockingStageLimit, readRuntimeLimitMs } from "./runtime-limits.js";
import {
  RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS,
  canRuntimeToolSatisfyRequirement,
} from "./tool-contracts.js";

const log = createLogger("gm-turn-read");

export const GM_READ_VERSION = "gm-read.v1";
export const GM_READ_SITUATION_SUMMARY_MAX = 800;
export const GM_READ_SCENE_QUESTION_MAX = 320;
export const GM_READ_TEXT_MAX = 1000;
export const GM_READ_REF_MAX = 160;
export const GM_READ_EVIDENCE_MAX = 8;
export const GM_READ_FOCAL_ACTOR_MAX = 3;
export const GM_READ_BACKGROUND_ACTOR_MAX = 4;
export const GM_READ_TARGET_REF_MAX = 4;
export const GM_READ_GUARDRAIL_MAX = 8;
export const GM_READ_GUARDRAIL_TEXT_MAX = 500;
export const GM_READ_TIMEOUT_MS = playerBlockingStageLimit("WORLDFORGE_GM_READ_TIMEOUT_MS");
export const GM_READ_DEFAULT_MAX_OUTPUT_TOKENS = 1_200;
export type GmReadStructuredOutputMode = "native_json" | "tool_mode";
export const GM_READ_STRUCTURED_OUTPUT_RETRIES = readRuntimeLimitMs(
  [
    "WORLDFORGE_GM_READ_STRUCTURED_OUTPUT_RETRIES",
    "WF_GM_READ_STRUCTURED_OUTPUT_RETRIES",
  ],
  2,
);
const GM_READ_RECENT_CONVERSATION_LIMIT = 4;
const GM_READ_RECENT_CONVERSATION_MAX_CHARS = 500;
const GM_READ_PROMPT_TEXT_MAX_CHARS = 320;
const GM_READ_NO_MUTATION_ADMISSIBILITY_MAX_OUTPUT_TOKENS = 500;

const gmReadText = (max = GM_READ_TEXT_MAX) => z.string().trim().min(1).max(max);
const gmReadRef = z.string().trim().min(1).max(GM_READ_REF_MAX);
const evidenceRefsSchema = z.array(gmReadRef).min(1).max(GM_READ_EVIDENCE_MAX);

const forbiddenGmReadKeys = new Set([
  "actionids",
  "actions",
  "conditiondelta",
  "durableevent",
  "eventid",
  "hpdelta",
  "input",
  "inventoryadd",
  "inventoryremove",
  "narratorfacts",
  "payload",
  "persistedfacts",
  "plannedactions",
  "plannedtools",
  "responseids",
  "statedelta",
  "toolinput",
  "toolname",
  "toolresultrefs",
  "worlddelta",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value.trim() || null : null;
}

function normalizeGmReadKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

export function readGmReadStructuredOutputMode(provider?: ProviderConfig): GmReadStructuredOutputMode {
  void provider;
  const raw =
    process.env.WORLDFORGE_GM_READ_STRUCTURED_OUTPUT_MODE
    ?? process.env.WF_GM_READ_STRUCTURED_OUTPUT_MODE;
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) return "native_json";
  if (normalized === "native_json" || normalized === "json") return "native_json";
  if (normalized === "tool_mode" || normalized === "tool") return "tool_mode";
  throw new Error(
    `WORLDFORGE_GM_READ_STRUCTURED_OUTPUT_MODE must be native_json or tool_mode, got "${raw}".`,
  );
}

function addForbiddenGmReadPayloadIssues(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => addForbiddenGmReadPayloadIssues(entry, ctx, [...path, index]));
    return;
  }

  if (!isRecord(value)) return;

  const hasToolCallShape = Object.hasOwn(value, "toolName")
    && (Object.hasOwn(value, "input") || Object.hasOwn(value, "payload"));
  if (hasToolCallShape) {
    ctx.addIssue({
      code: "custom",
      message: "GM Read cannot contain nested runtime tool calls.",
      path,
    });
  }

  for (const [key, entry] of Object.entries(value)) {
    if (forbiddenGmReadKeys.has(normalizeGmReadKey(key))) {
      ctx.addIssue({
        code: "custom",
        message: `GM Read cannot contain backend-owned field "${key}".`,
        path: [...path, key],
      });
    }
    addForbiddenGmReadPayloadIssues(entry, ctx, [...path, key]);
  }
}

const actionInterpretationSchema = z
  .object({
    intent: gmReadText(240),
    method: gmReadText(240).optional(),
    targetRefs: z.array(gmReadRef).max(GM_READ_TARGET_REF_MAX).default([]),
  })
  .strict();

const rollRequestSchema = z
  .object({
    actorRef: gmReadRef,
    targetRef: gmReadRef.optional(),
    question: gmReadText(240),
    stakes: gmReadText(500),
    evidenceRefs: evidenceRefsSchema,
  })
  .strict();

const runtimeRequirementTopicSchema = z.enum([
  "social",
  "procedure",
  "permission",
  "proof",
  "route",
  "safety",
  "trade",
  "status",
  "other",
]);

const runtimeRequirementDurabilitySchema = z.enum(["scene_local", "durable"]);
export const GM_READ_RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS = [
  ...RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS.filter((effectKind) =>
    effectKind !== "chronicle_entry"),
] as const;
const runtimeRequirementStateEffectKindSchema = z.enum(GM_READ_RUNTIME_REQUIREMENT_STATE_EFFECT_KINDS);
const runtimeRequirementSceneBeatKindSchema = z.enum([
  "event_log",
  "time_passage",
]);

const turnGroundingIntentKindSchema = z.enum([
  "ordinary_local_response",
  "passive_status_read",
  "procedural_information",
  "posted_proof_applicability",
  "document_state_assumption",
  "concrete_state_change",
  "combat_pressure",
  "clarification_needed",
  "other",
]);

const turnGroundingKindSchema = z.enum([
  "none",
  "observation_read",
  "dialogue_outcome",
  "world_fact",
  "scene_beat",
  "state_mutation",
  "roll_oracle",
  "combat_transition",
]);

const noMutationSafeKinds = [
  "local_greeting",
  "sensory_color",
  "bounded_clarification",
  "pure_ooc_system",
  "no_state_claim",
] as const;
const noMutationBlockedClaimKinds = [
  "procedure",
  "permission_access",
  "proof_document",
  "route",
  "status_read_change",
  "actor_creation",
  "movement",
  "possession_inventory",
  "durable_social_fact",
  "world_fact",
  "combat_threat",
] as const;
const noMutationRequiredGroundingKinds = [
  "observation_read",
  "dialogue_outcome",
  "world_fact",
  "scene_beat",
  "state_mutation",
  "roll_oracle",
  "combat_transition",
] as const;
const noMutationAdmissibilitySchema = z.object({
  decision: z.enum(["admissible", "runtime_required"]),
  safeKind: z.enum(noMutationSafeKinds).optional(),
  blockedClaimKinds: z.array(z.enum(noMutationBlockedClaimKinds)).default([]),
  requiredGroundingKind: z.enum(noMutationRequiredGroundingKinds).optional(),
  topicKind: runtimeRequirementTopicSchema.optional(),
  durability: runtimeRequirementDurabilitySchema.optional(),
  reason: gmReadText(240),
}).strict();
type NoMutationAdmissibility = z.infer<typeof noMutationAdmissibilitySchema>;

const turnGroundingSchema = z.object({
  intentKind: turnGroundingIntentKindSchema,
  requiresGrounding: z.boolean(),
  groundingKind: turnGroundingKindSchema,
  topicKind: runtimeRequirementTopicSchema.optional(),
  durability: runtimeRequirementDurabilitySchema.optional(),
  reason: gmReadText(240),
}).strict();

const dialogueSpeakerBindingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("visible_actor"),
    speakerRef: gmReadRef,
  }).strict(),
  z.object({
    kind: z.literal("prose_role"),
    requestedRoleText: gmReadText(160),
    allowCreateSceneExtra: z.boolean().default(true),
  }).strict(),
  z.object({
    kind: z.literal("no_visible_authority"),
    requestedRoleText: gmReadText(160),
  }).strict(),
]);

const runtimeRequirementSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({
    kind: z.literal("observation_read"),
    categories: z
      .array(z.enum([
        "visible_actors",
        "visible_objects",
        "routes",
        "hazards",
        "crowd",
        "public_records",
        "procedure",
        "local_status",
        "other",
      ]))
      .min(1)
      .max(6),
  }).strict(),
  z.object({
    kind: z.literal("dialogue_outcome"),
    durability: runtimeRequirementDurabilitySchema,
    topicKind: runtimeRequirementTopicSchema.optional(),
    speakerBinding: dialogueSpeakerBindingSchema.optional(),
    requiresStructuralEffect: z
      .boolean()
      .optional()
      .describe("True only when this turn should actually apply durable world/entity state now, not merely discuss a rule, requirement, warning, or hypothetical permission."),
    effectKind: runtimeRequirementStateEffectKindSchema
      .optional()
      .describe("Single structural state owner. Use effectKinds instead when the dialogue outcome needs multiple structural owner classes."),
    effectKinds: z
      .array(runtimeRequirementStateEffectKindSchema)
      .min(1)
      .max(4)
      .optional()
      .describe("Required when requiresStructuralEffect=true if multiple structural owner classes are needed before record_dialogue_outcome."),
  }).strict().superRefine((value, ctx) => {
    const hasEffectKinds = Boolean(value.effectKind || value.effectKinds?.length);
    if (value.requiresStructuralEffect === true && !hasEffectKinds) {
      ctx.addIssue({
        code: "custom",
        message: "dialogue_outcome with requiresStructuralEffect=true requires effectKind/effectKinds so the runtime exposes exactly the needed structural owner classes.",
        path: ["effectKind"],
      });
    }
    if (hasEffectKinds && value.requiresStructuralEffect !== true) {
      ctx.addIssue({
        code: "custom",
        message: "dialogue_outcome effectKind/effectKinds are only valid when requiresStructuralEffect=true.",
        path: ["effectKind"],
      });
    }
  }),
  z.object({
    kind: z.literal("world_fact"),
    durability: z.literal("durable"),
    topicKind: runtimeRequirementTopicSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("scene_beat"),
    durability: runtimeRequirementDurabilitySchema,
    effectKind: runtimeRequirementStateEffectKindSchema.optional(),
    beatKind: runtimeRequirementSceneBeatKindSchema.optional(),
  }).strict().superRefine((value, ctx) => {
    if (!value.effectKind && !value.beatKind) {
      ctx.addIssue({
        code: "custom",
        message: "scene_beat requires either effectKind for state-backed beats or beatKind for event/time beats.",
        path: ["effectKind"],
      });
    }
    if (value.effectKind && value.beatKind) {
      ctx.addIssue({
        code: "custom",
        message: "scene_beat must use effectKind or beatKind, not both.",
        path: ["beatKind"],
      });
    }
  }),
  z.object({
    kind: z.literal("state_mutation"),
    effectKind: runtimeRequirementStateEffectKindSchema,
  }).strict(),
]);

const gmReadBaseSchema = z
  .object({
    version: z.literal(GM_READ_VERSION).default(GM_READ_VERSION),
    situationSummary: gmReadText(GM_READ_SITUATION_SUMMARY_MAX),
    sceneQuestion: gmReadText(GM_READ_SCENE_QUESTION_MAX),
    focalActorRefs: z.array(gmReadRef).min(1).max(GM_READ_FOCAL_ACTOR_MAX),
    backgroundActorRefs: z.array(gmReadRef).max(GM_READ_BACKGROUND_ACTOR_MAX).default([]),
    actionInterpretation: actionInterpretationSchema,
    rationale: gmReadText(),
    evidenceRefs: evidenceRefsSchema,
    turnGrounding: turnGroundingSchema,
    narrationGuardrails: z
      .array(gmReadText(GM_READ_GUARDRAIL_TEXT_MAX))
      .max(GM_READ_GUARDRAIL_MAX)
      .default([]),
    runtimeRequirement: runtimeRequirementSchema.optional(),
  })
  .strict();

const gmReadUnionSchema = z.discriminatedUnion("path", [
  gmReadBaseSchema
    .extend({
      path: z.literal("direct"),
      directResolutionNotes: gmReadText(500),
    })
    .strict(),
  gmReadBaseSchema
    .extend({
      path: z.literal("roll_oracle"),
      rollRequest: rollRequestSchema,
    })
    .strict(),
  gmReadBaseSchema
    .extend({
      path: z.literal("tool_plan"),
      turnIntent: gmReadText(500),
    })
    .strict(),
  gmReadBaseSchema
    .extend({
      path: z.literal("combat_transition"),
      actorRef: gmReadRef,
      targetRef: gmReadRef,
      combatFraming: gmReadText(500),
      stakes: gmReadText(500),
    })
    .strict(),
  gmReadBaseSchema
    .extend({
      path: z.literal("clarification"),
      clarificationPrompt: gmReadText(500),
    })
    .strict(),
  gmReadBaseSchema
    .extend({
      path: z.literal("continue"),
      continuationGuidance: gmReadText(500),
    })
    .strict(),
]);

function normalizeGmReadInput(value: unknown): unknown {
  if (!isRecord(value)) return value;
  const runtimeRequirement = isRecord(value.runtimeRequirement)
    ? normalizeRuntimeRequirementInput(value.runtimeRequirement)
    : value.runtimeRequirement;
  return {
    version: value.version ?? GM_READ_VERSION,
    ...value,
    runtimeRequirement,
  };
}

function normalizeRuntimeRequirementInput(value: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(value.speakerBinding)) return value;
  return {
    ...value,
    speakerBinding: normalizeDialogueSpeakerBindingInput(value.speakerBinding),
  };
}

function normalizeDialogueSpeakerBindingInput(value: Record<string, unknown>): Record<string, unknown> {
  if (value.requestedRoleText !== undefined || value.proseRole === undefined) return value;
  const { proseRole, ...rest } = value;
  return {
    ...rest,
    requestedRoleText: proseRole,
  };
}

export const gmReadSchema = z
  .unknown()
  .superRefine(addForbiddenGmReadPayloadIssues)
  .pipe(z.preprocess(normalizeGmReadInput, gmReadUnionSchema));

export type GmRead = z.infer<typeof gmReadSchema>;

export interface RunGmReadArgs {
  provider: ProviderConfig;
  playerAction: string;
  frame: SceneFrame;
  scopedForecastExcerpt?: ScopedForecastExcerpt | null;
  recentConversation?: Array<{ role: string; content: string }>;
  responseLanguage?: SessionResponseLanguage;
  maxOutputTokens?: number;
}

export type GmReadValidationIssue = {
  path: string;
  message: string;
};

const TURN_GROUNDING_CONSISTENCY_ISSUE_CODE = "turn-grounding-runtime-contract-mismatch";
const PASSIVE_STATUS_READ_ISSUE_CODE = "passive-status-read-requires-grounded-consequence-path";
const POSTED_PROOF_REQUIREMENT_ISSUE_CODE = "posted-proof-request-requires-dialogue-outcome";
const DOCUMENT_STATE_ISSUE_CODE = "document-state-requires-tool-path";
const DOCUMENT_PREMISE_ISSUE_CODE = "document-premise-requires-backed-state";
const REUSABLE_DIALOGUE_DURABILITY_ISSUE_CODE = "reusable-dialogue-requires-durable-requirement";
const NO_MUTATION_ADMISSIBILITY_ISSUE_CODE = "no-mutation-admissibility-requires-runtime";
const DOCUMENT_STATE_TAG_KEYS = new Set([
  "officially-unsealed",
  "unsealed",
  "reviewed",
  "stamped",
  "validated",
  "authorized",
  "authorised",
  "docketed",
  "filed",
  "registered",
  "accepted",
  "cleared",
  "sealed",
  "receipt",
  "review-receipt",
  "docket-receipt",
  "warning-rider",
  "red-ink-validation",
]);

function normalizeRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function addRef(refs: Set<string>, value?: string | null): void {
  if (value?.trim()) refs.add(normalizeRef(value));
}

function addTypedRef(refs: Set<string>, type: string, value?: string | null): void {
  if (!value?.trim()) return;
  addRef(refs, `${type}:${value}`);
}

function buildAllowedRefSet(frame: SceneFrame): Set<string> {
  const packet = buildModelFacingScenePacket(frame);
  const promptView = buildModelFacingScenePromptView(packet.view);
  return new Set(collectModelFacingScenePromptRefs(promptView).map(normalizeRef));
}

function buildForbiddenRefSet(frame: SceneFrame): Set<string> {
  const refs = new Set<string>();

  for (const ref of frame.perception.forbiddenActorIds ?? []) addRef(refs, ref);
  for (const ref of frame.perception.forbiddenActorIds ?? []) addTypedRef(refs, "actor", ref);
  for (const ref of frame.perception.forbiddenActorLabels ?? []) addRef(refs, ref);
  for (const actor of frame.roster.background) {
    addRef(refs, actor.id);
    addTypedRef(refs, "actor", actor.id);
    addRef(refs, actor.actorId);
    addTypedRef(refs, "actor", actor.actorId);
    addRef(refs, actor.label);
  }
  for (const actor of frame.roster.support.filter((entry) => entry.awareness !== "clear")) {
    addRef(refs, actor.id);
    addTypedRef(refs, "actor", actor.id);
    addRef(refs, actor.actorId);
    addTypedRef(refs, "actor", actor.actorId);
    addRef(refs, actor.label);
  }

  return refs;
}

function validateRefs(
  refs: readonly string[],
  frame: SceneFrame,
  path: string,
): GmReadValidationIssue[] {
  const allowedRefs = buildAllowedRefSet(frame);
  const forbiddenRefs = buildForbiddenRefSet(frame);
  const issues: GmReadValidationIssue[] = [];

  refs.forEach((ref, index) => {
    const normalized = normalizeRef(ref);
    if (isUnsafeModelFacingRef(ref)) {
      issues.push({
        path: `${path}.${index}`,
        message: `${path}.${index} uses a backend-only ref "${ref}". Use a visible label, Player, current_scene/current_location, or a short prompt alias.`,
      });
      return;
    }
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

export function validateGmReadForFrame(
  read: GmRead,
  frame: SceneFrame,
  playerAction?: string,
): GmReadValidationIssue[] {
  const issues: GmReadValidationIssue[] = [];

  issues.push(...validateRefs(read.focalActorRefs, frame, "focalActorRefs"));
  issues.push(...validateRefs(read.backgroundActorRefs, frame, "backgroundActorRefs"));
  issues.push(
    ...validateRefs(read.actionInterpretation.targetRefs, frame, "actionInterpretation.targetRefs"),
  );
  issues.push(...validateRefs(read.evidenceRefs, frame, "evidenceRefs"));

  if (read.path === "roll_oracle") {
    issues.push(...validateRefs([read.rollRequest.actorRef], frame, "rollRequest.actorRef"));
    if (read.rollRequest.targetRef) {
      issues.push(...validateRefs([read.rollRequest.targetRef], frame, "rollRequest.targetRef"));
    }
    issues.push(...validateRefs(read.rollRequest.evidenceRefs, frame, "rollRequest.evidenceRefs"));

    if (
      playerAction
      && isUnconfirmedAccessProofClaim(playerAction)
      && isClaimedProofOracleExistenceQuestion(
        `${read.rollRequest.question}\n${read.rollRequest.stakes}`,
      )
    ) {
      issues.push({
        path: "rollRequest.question",
        message:
          "GM Read cannot ask Oracle to decide whether an unconfirmed claimed key/permit/pass/credential exists, is owned, fits, or works. Reframe as social credibility, witness reaction, suspicion/alarm, or a visible physical attempt without creating the claimed proof.",
      });
    }
  }

  if (read.path === "combat_transition") {
    issues.push(...validateRefs([read.actorRef], frame, "actorRef"));
    issues.push(...validateRefs([read.targetRef], frame, "targetRef"));
  }

  issues.push(...validateTurnGroundingConsistency(read));
  issues.push(...validateNoMutationDocumentState(read));
  issues.push(...validateDocumentPremiseRequiresBackedState(read, frame));
  issues.push(...validatePassiveStatusReadNoMutation(read, frame));
  issues.push(...validateRuntimeRequirementPath(read));
  issues.push(...validateRuntimeRequirementSatisfiable(read, frame));
  issues.push(...validateDialogueRuntimeRequirementSpeakerBinding(read, frame));
  issues.push(...validatePostedProofRuntimeRequirement(read));
  issues.push(...validateReusableDialogueDurability(read));

  return issues;
}

function validateDialogueRuntimeRequirementSpeakerBinding(
  read: GmRead,
  frame: SceneFrame,
): GmReadValidationIssue[] {
  const requirement = read.runtimeRequirement;
  if (requirement?.kind !== "dialogue_outcome") return [];
  const binding = requirement.speakerBinding;
  if (!binding) {
    return [{
      path: "runtimeRequirement.speakerBinding",
      message:
        "GM Read dialogue_outcome requires speakerBinding: visible_actor for an existing visible speaker, prose_role for a role/office described only in player prose, or no_visible_authority when no current speaker exists.",
    }];
  }
  if (binding.kind === "visible_actor") {
    return validateRefs([binding.speakerRef], frame, "runtimeRequirement.speakerBinding.speakerRef");
  }
  return [];
}

function validateRuntimeRequirementSatisfiable(
  read: GmRead,
  frame: SceneFrame,
): GmReadValidationIssue[] {
  const requirement = read.runtimeRequirement;
  if (!requirement || requirement.kind === "none" || requirement.kind === "observation_read") {
    return [];
  }
  if (
    read.path !== "tool_plan"
    && read.path !== "roll_oracle"
    && read.path !== "combat_transition"
  ) {
    return [];
  }
  if (frame.allowedTools.some((toolName) => canRuntimeToolSatisfyRequirement(toolName, requirement))) {
    return [];
  }
  return [{
    path: "runtimeRequirement",
    message:
      `GM Read runtimeRequirement.kind=${requirement.kind} cannot be satisfied by the current model-facing tool surface. Choose the nearest available runtimeRequirement supported by allowed tools, or use observation_read/direct prose when no state receipt is needed.`,
  }];
}

function isNoMutationReadPath(
  read: GmRead,
): read is Extract<GmRead, { path: "direct" | "continue" | "clarification" }> {
  return read.path === "direct" || read.path === "continue" || read.path === "clarification";
}

type RuntimeRequirementKind = NonNullable<GmRead["runtimeRequirement"]>["kind"];

function expectedRuntimeRequirementKindForGrounding(
  groundingKind: GmRead["turnGrounding"]["groundingKind"],
): RuntimeRequirementKind | null {
  switch (groundingKind) {
    case "observation_read":
      return "observation_read";
    case "dialogue_outcome":
      return "dialogue_outcome";
    case "world_fact":
      return "world_fact";
    case "scene_beat":
      return "scene_beat";
    case "state_mutation":
      return "state_mutation";
    case "none":
    case "roll_oracle":
    case "combat_transition":
      return null;
  }
}

function runtimeRequirementTopicKind(
  requirement: NonNullable<GmRead["runtimeRequirement"]>,
): string | null {
  return "topicKind" in requirement ? requirement.topicKind ?? null : null;
}

function runtimeRequirementDurability(
  requirement: NonNullable<GmRead["runtimeRequirement"]>,
): string | null {
  return "durability" in requirement ? requirement.durability ?? null : null;
}

function validateTurnGroundingConsistency(read: GmRead): GmReadValidationIssue[] {
  const issues: GmReadValidationIssue[] = [];
  const grounding = getTurnGrounding(read);
  if (!grounding) {
    return [{
      path: "turnGrounding",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: turnGrounding is required for every GM Read object.`,
    }];
  }
  const requirement = read.runtimeRequirement;
  const requirementKind = requirement?.kind ?? "none";

  if (grounding.groundingKind === "none") {
    if (grounding.requiresGrounding) {
      issues.push({
        path: "turnGrounding.requiresGrounding",
        message:
          `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: requiresGrounding=true must name a non-none groundingKind.`,
      });
    }
    if (requirementKind !== "none") {
      issues.push({
        path: "turnGrounding.groundingKind",
        message:
          `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: non-none runtimeRequirement requires a matching non-none turnGrounding.groundingKind.`,
      });
    }
    if (read.path === "roll_oracle" || read.path === "combat_transition") {
      issues.push({
        path: "turnGrounding.groundingKind",
        message:
          `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: ${read.path} requires a matching non-none turnGrounding.groundingKind.`,
      });
    }
    return issues;
  }

  if (!grounding.requiresGrounding) {
    issues.push({
      path: "turnGrounding.requiresGrounding",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: non-none groundingKind requires requiresGrounding=true.`,
    });
  }

  if (grounding.groundingKind === "roll_oracle") {
    if (read.path !== "roll_oracle") {
      issues.push({
        path: "path",
        message:
          `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: groundingKind=roll_oracle requires path=roll_oracle.`,
      });
    }
    return issues;
  }

  if (grounding.groundingKind === "combat_transition") {
    if (read.path !== "combat_transition") {
      issues.push({
        path: "path",
        message:
          `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: groundingKind=combat_transition requires path=combat_transition.`,
      });
    }
    return issues;
  }

  if (isNoMutationReadPath(read)) {
    issues.push({
      path: "path",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: turnGrounding requires backend grounding, so path must be tool_plan, roll_oracle, or combat_transition.`,
    });
    return issues;
  }

  const expectedRequirementKind = expectedRuntimeRequirementKindForGrounding(grounding.groundingKind);
  if (expectedRequirementKind && requirementKind !== expectedRequirementKind) {
    issues.push({
      path: "runtimeRequirement",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: groundingKind=${grounding.groundingKind} requires runtimeRequirement.kind=${expectedRequirementKind}.`,
    });
    return issues;
  }

  if (!requirement || requirement.kind === "none") {
    issues.push({
      path: "runtimeRequirement",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: non-none turnGrounding requires a non-none runtimeRequirement on grounded paths.`,
    });
    return issues;
  }

  const requirementTopic = runtimeRequirementTopicKind(requirement);
  if (grounding.topicKind && requirementTopic && grounding.topicKind !== requirementTopic) {
    issues.push({
      path: "runtimeRequirement.topicKind",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: runtimeRequirement.topicKind must match turnGrounding.topicKind when both are present.`,
    });
  }

  const requirementDurability = runtimeRequirementDurability(requirement);
  if (
    grounding.durability === "durable"
    && requirementDurability
    && requirementDurability !== "durable"
  ) {
    issues.push({
      path: "runtimeRequirement.durability",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: durable turnGrounding requires a durable runtimeRequirement.`,
    });
  }

  if (
    grounding.intentKind === "concrete_state_change"
    && requirement.kind === "dialogue_outcome"
    && requirement.requiresStructuralEffect !== true
  ) {
    issues.push({
      path: "runtimeRequirement.requiresStructuralEffect",
      message:
        `${TURN_GROUNDING_CONSISTENCY_ISSUE_CODE}: concrete_state_change via dialogue_outcome must set requiresStructuralEffect=true.`,
    });
  }

  return issues;
}

function validateNoMutationDocumentState(read: GmRead): GmReadValidationIssue[] {
  if (!isNoMutationReadPath(read)) return [];
  const grounding = getTurnGrounding(read);
  if (!grounding) return [];
  if (!turnGroundingClaimsDocumentStateChange(grounding)) return [];

  return [{
    path: "turnGrounding",
    message:
      `${DOCUMENT_STATE_ISSUE_CODE}: document, receipt, docket, stamp, warning-rider, proof, or permit state changes cannot be introduced by direct/continue/clarification. Choose tool_plan and use item state tools such as spawn_item, add_tag, remove_tag, or transfer_item so later turns can cite typed inventory state.`,
  }];
}

function turnGroundingClaimsDocumentStateChange(
  grounding: GmRead["turnGrounding"],
): boolean {
  return grounding.intentKind === "concrete_state_change"
    && (
      grounding.groundingKind === "state_mutation"
      || grounding.groundingKind === "scene_beat"
    )
    && (
      grounding.topicKind === "proof"
      || grounding.topicKind === "permission"
      || grounding.topicKind === "procedure"
      || grounding.topicKind === "route"
    );
}

function normalizeDocumentStateTag(tag: string): string {
  return tag.trim().toLowerCase().replaceAll("_", "-").replaceAll(" ", "-");
}

function tagBacksDocumentState(tag: string): boolean {
  return DOCUMENT_STATE_TAG_KEYS.has(normalizeDocumentStateTag(tag));
}

function frameHasBackedDocumentState(frame: SceneFrame): boolean {
  const inventoryTags = (frame.playerInventory ?? []).flatMap((item) => item.tags);
  const visibleItemTags = frame.targetCandidates
    .filter((candidate) => candidate.type === "item")
    .flatMap((candidate) => candidate.tags ?? []);
  return [...inventoryTags, ...visibleItemTags].some(tagBacksDocumentState);
}

function validateDocumentPremiseRequiresBackedState(
  read: GmRead,
  frame: SceneFrame,
): GmReadValidationIssue[] {
  const grounding = getTurnGrounding(read);
  if (!grounding || grounding.intentKind !== "document_state_assumption") return [];
  if (frameHasBackedDocumentState(frame)) return [];
  if (read.path === "tool_plan") return [];

  return [{
    path: "path",
    message:
      `${DOCUMENT_PREMISE_ISSUE_CODE}: the player action assumes a document/proof/receipt/stamp state that is not backed by current item tags. Choose tool_plan to create, tag, verify, reject, or clarify that document state before narration treats it as true.`,
  }];
}

function validateRuntimeRequirementPath(read: GmRead): GmReadValidationIssue[] {
  const requirement = read.runtimeRequirement;
  if (read.path === "tool_plan" && (!requirement || requirement.kind === "none")) {
    return [
      {
        path: "runtimeRequirement",
        message:
          "GM Read tool_plan requires an explicit non-none runtimeRequirement. Do not rely on downstream inference from playerAction, turnIntent, or prose.",
      },
    ];
  }
  if (!requirement || requirement.kind === "none") return [];
  if (
    read.path === "tool_plan"
    || read.path === "roll_oracle"
    || read.path === "combat_transition"
  ) {
    return [];
  }

  return [
    {
      path: "runtimeRequirement",
      message:
        "GM Read runtimeRequirement can be non-none only for tool_plan, roll_oracle, or combat_transition paths. Use runtimeRequirement { kind: \"none\" } or omit it for direct, continue, and clarification.",
    },
  ];
}

function getTurnGrounding(read: GmRead): GmRead["turnGrounding"] | null {
  return (read as Partial<GmRead>).turnGrounding ?? null;
}

function turnGroundingRequiresRuntime(read: GmRead): boolean {
  const grounding = getTurnGrounding(read);
  if (!grounding) return false;
  return grounding.requiresGrounding
    && grounding.groundingKind !== "none";
}

function validatePostedProofRuntimeRequirement(
  read: GmRead,
): GmReadValidationIssue[] {
  const grounding = getTurnGrounding(read);
  if (!grounding || grounding.intentKind !== "posted_proof_applicability") return [];
  if (read.path !== "tool_plan") {
    return [{
      path: "path",
      message:
        `${POSTED_PROOF_REQUIREMENT_ISSUE_CODE}: posted-item/notice/rule applicability for a document, message, case, proof, permit, seal, or credential must choose tool_plan so the clerk/source answer is grounded before narration uses it.`,
    }];
  }
  const requirement = read.runtimeRequirement;
  if (
    requirement?.kind === "dialogue_outcome"
    && requirement.durability === "durable"
    && requirement.topicKind === "proof"
  ) {
    return [];
  }
  return [{
    path: "runtimeRequirement",
    message:
      `${POSTED_PROOF_REQUIREMENT_ISSUE_CODE}: posted applicability questions require runtimeRequirement { kind: "dialogue_outcome", durability: "durable", topicKind: "proof" }.`,
  }];
}

function validateReusableDialogueDurability(
  read: GmRead,
): GmReadValidationIssue[] {
  const grounding = getTurnGrounding(read);
  if (!grounding) return [];
  if (
    grounding.intentKind !== "procedural_information"
    && grounding.intentKind !== "posted_proof_applicability"
  ) {
    return [];
  }
  if (read.path !== "tool_plan") return [];
  const requirement = read.runtimeRequirement;
  if (requirement?.kind !== "dialogue_outcome") return [];
  if (requirement.durability !== "scene_local") return [];

  return [{
    path: "runtimeRequirement.durability",
    message:
      `${REUSABLE_DIALOGUE_DURABILITY_ISSUE_CODE}: reusable procedural, proof, permission, route, safety, status, or public-service dialogue answers must use runtimeRequirement { kind: "dialogue_outcome", durability: "durable" }. Use scene_local only for non-reusable immediate color.`,
  }];
}

function hardenReusableDialogueRuntimeRequirement(
  read: GmRead,
): GmRead {
  const grounding = getTurnGrounding(read);
  if (!grounding) return read;
  if (
    grounding.intentKind !== "procedural_information"
    && grounding.intentKind !== "posted_proof_applicability"
  ) {
    return read;
  }
  if (read.path !== "tool_plan") return read;
  const requirement = read.runtimeRequirement;
  if (requirement?.kind !== "dialogue_outcome") return read;
  if (requirement.durability !== "scene_local") return read;

  return {
    ...read,
    runtimeRequirement: {
      ...requirement,
      durability: "durable",
    },
  };
}

function sceneHasPlayableStatusReadContext(frame: SceneFrame): boolean {
  const visibleNonPlayerActors = [...frame.roster.active, ...frame.roster.support].filter(
    (actor) => actor.type !== "player" && actor.awareness === "clear",
  ).length;
  return visibleNonPlayerActors > 0
    || frame.targetCandidates.length > 0
    || frame.movementCandidates.length > 0
    || frame.recentEvents.some((event) => event.perceivableByPlayer)
    || frame.deferredHooks.length > 0
    || frame.combatEnvelope !== null;
}

function validatePassiveStatusReadNoMutation(
  read: GmRead,
  frame: SceneFrame,
): GmReadValidationIssue[] {
  if (!isNoMutationReadPath(read)) return [];
  if (!turnGroundingRequiresRuntime(read)) return [];
  if (!sceneHasPlayableStatusReadContext(frame)) return [];

  return [
    {
      path: "path",
      message:
        `${PASSIVE_STATUS_READ_ISSUE_CODE}: broad observe/take-stock/status-read or reusable procedural information turns in a playable scene cannot end as direct/continue/clarification with only clock advance, sensory color, or reiterated tension. Choose tool_plan to ground a concrete situational read, lead, local record, NPC answer, procedure, permission boundary, or quick-action affordance before narration uses it, or roll_oracle for uncertain visible reaction.`,
    },
  ];
}

function formatRecentConversation(
  recentConversation?: readonly { role: string; content: string }[],
  safety?: ModelFacingPromptSafety,
  extraForbiddenTerms: readonly string[] = [],
): string {
  return formatModelFacingRecentConversation(recentConversation, {
    safety,
    extraForbiddenTerms,
    maxEntries: GM_READ_RECENT_CONVERSATION_LIMIT,
    maxChars: GM_READ_RECENT_CONVERSATION_MAX_CHARS,
  });
}

function compactPromptText(value: string | null | undefined, maxChars = GM_READ_PROMPT_TEXT_MAX_CHARS): string | undefined {
  const normalized = value?.replace(/\s+/g, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function uniqueRefs(values: Array<string | null | undefined>): string[] {
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const ref = value?.trim();
    if (!ref || seen.has(ref)) continue;
    seen.add(ref);
    refs.push(ref);
  }
  return refs;
}

function actorPreferredRef(
  view: ModelFacingSceneView,
  actor: ModelFacingSceneView["visibleActors"][number],
  index = 0,
): string {
  if (actor.id === view.localScene.playerActorId || actor.actorId === view.localScene.playerActorId) {
    return "Player";
  }
  return actor.label || `person_${index + 1}`;
}

function buildActorPromptRefLookup(view: ModelFacingSceneView): Map<string, string> {
  const refs = new Map<string, string>();
  view.visibleActors.forEach((actor, index) => {
    const promptRef = actorPreferredRef(view, actor, index);
    for (const rawRef of [actor.id, actor.actorId, actor.label, promptRef]) {
      const normalized = rawRef ? normalizeRef(rawRef) : "";
      if (normalized) refs.set(normalized, promptRef);
    }
  });
  return refs;
}

function eventActorRefsForPrompt(
  event: ModelFacingSceneView["localRecentEvents"][number],
  actorRefLookup: ReadonlyMap<string, string>,
): string[] {
  return uniqueRefs(
    event.actorIds.map((actorId) => actorRefLookup.get(normalizeRef(actorId)) ?? null),
  ).slice(0, 4);
}

function buildGmReadSceneViewForPrompt(view: ModelFacingSceneView): unknown {
  const actorRefLookup = buildActorPromptRefLookup(view);
  return {
    localScene: {
      tick: view.localScene.tick,
      currentLocationRef: "current_location",
      currentSceneRef: "current_scene",
      currentLocationName: view.localScene.currentLocationName ?? null,
      currentSceneScopeName: view.localScene.currentSceneScopeName ?? null,
    },
    visibleActors: view.visibleActors.map((actor, index) => ({
      ref: actorPreferredRef(view, actor, index),
      type: actor.type,
      tags: actor.tags?.slice(0, 6),
      summary: compactPromptText(actor.summary),
    })),
    awarenessHints: view.awarenessHints.map((hint) => compactPromptText(hint, 180)).filter(Boolean),
    privateContext: view.privateContext,
    localRecentEvents: view.localRecentEvents.map((event) => ({
      tick: event.tick,
      source: event.source,
      summary: compactPromptText(event.summary),
      actorRefs: eventActorRefsForPrompt(event, actorRefLookup),
    })),
    legalTargetCount: view.legalTargets.length,
    legalMovementCount: view.legalMovement.length,
    oracle: view.oracle,
    oracleContext: oracleContextForModelPrompt(view.oracleContext),
    combatEnvelope: view.combatEnvelope ? { present: true } : undefined,
  };
}

function buildCandidateRefsForPrompt(view: ModelFacingSceneView): unknown {
  return {
    current: {
      currentLocation: {
        ref: "current_location",
        label: view.localScene.currentLocationName ?? null,
      },
      currentScene: {
        ref: "current_scene",
        label: view.localScene.currentSceneScopeName ?? null,
      },
    },
    actors: view.visibleActors.map((actor, index) => ({
      preferredRef: actorPreferredRef(view, actor, index),
      type: actor.type,
      awareness: actor.awareness,
    })),
    targets: view.legalTargets.map((candidate, index) => ({
      preferredRef: candidate.label || `target_${index + 1}`,
      type: candidate.type,
      tags: candidate.tags?.slice(0, 6),
    })),
    movements: view.legalMovement.map((candidate, index) => ({
      preferredRef: candidate.label || `move_${index + 1}`,
      connected: candidate.connected,
      travelCost: candidate.travelCost,
    })),
  };
}

function buildCitableRefBudgetForPrompt(view: ModelFacingSceneView): string[] {
  const playerRefs = ["Player"];
  const visibleActorRefs = view.visibleActors
    .map((actor, index) => actorPreferredRef(view, actor, index))
    .filter((ref) => ref !== "Player")
    .slice(0, 3);
  const targetRefs = view.legalTargets
    .map((candidate, index) => candidate.label || `target_${index + 1}`)
    .slice(0, 3);
  const movementRefs = view.legalMovement
    .map((candidate, index) => candidate.label || `move_${index + 1}`)
    .slice(0, 2);

  return uniqueRefs([
    ...playerRefs,
    ...visibleActorRefs,
    ...targetRefs,
    ...movementRefs,
  ]).slice(0, GM_READ_EVIDENCE_MAX);
}

function buildCombatPressureNotes(playerAction: string): string {
  if (!isCombatPressureAction({ actionText: playerAction })) {
    return "No combat-pressure trigger detected.";
  }

  return [
    "Combat-pressure relevant action detected.",
    "Combat pressure includes explicit attacks, defensive posture, threat probing, risky environmental moves, violence aftermath, and power-gap questions.",
    "Do not ask backend-style specificity questions when the SceneFrame already supplies a clear visible target, threat, route, or local pressure.",
    "If no combat actually exists, choose a non-combat path that answers with fiction-facing social, sensory, or exploration pressure instead of pretending the turn is unrelated.",
  ].join("\n");
}

function buildNoMutationAdmissibilityPrompt(input: {
  playerAction: string;
  read: GmRead;
  sceneView: ModelFacingSceneView;
  safety: ModelFacingPromptSafety;
  extraForbiddenTerms: readonly string[];
}): string {
  return [
    "NO-MUTATION ADMISSIBILITY CHECK",
    "Classify whether the proposed GM Read no-mutation path can be answered without any runtime receipt.",
    "Return one JSON object only.",
    "",
    "Decision rule:",
    "- admissible only for local greetings, pure sensory color, bounded clarification, pure out-of-character/system housekeeping, or text that makes no reusable state claim.",
    "- runtime_required for any route, proof, document, permission, access, procedure, public-service answer, status read/change, movement, actor creation, possession/inventory, world fact, combat/threat, or durable social fact the player may rely on later.",
    "- Do not trust the previous turnGrounding label; judge the player request, scene context, and proposed no-mutation output together.",
    "- Do not propose tool payloads. Only classify the required grounding kind.",
    "",
    `Allowed safeKind values: ${noMutationSafeKinds.join(", ")}.`,
    `Blocked claim kinds: ${noMutationBlockedClaimKinds.join(", ")}.`,
    `requiredGroundingKind values when runtime_required: ${noMutationRequiredGroundingKinds.join(", ")}.`,
    "",
    "PLAYER ACTION RAW TEXT (SANITIZED PLAYER-AUTHORED PROSE; NOT LEGAL REFS)",
    formatModelFacingPlayerActionText(input.playerAction, {
      safety: input.safety,
      extraForbiddenTerms: input.extraForbiddenTerms,
    }),
    "",
    "MODEL-FACING SCENE SUMMARY",
    JSON.stringify(buildGmReadSceneViewForPrompt(input.sceneView), null, 2),
    "",
    "PROPOSED GM READ JSON",
    JSON.stringify(
      sanitizeModelFacingJson(input.read, {
        safety: input.safety,
        extraForbiddenTerms: input.extraForbiddenTerms,
      }),
      null,
      2,
    ),
  ].join("\n");
}

function noMutationAdmissibilityIssue(
  admissibility: NoMutationAdmissibility | null,
): GmReadValidationIssue | null {
  if (!admissibility) {
    return {
      path: "path",
      message:
        `${NO_MUTATION_ADMISSIBILITY_ISSUE_CODE}: no-mutation admissibility classifier did not return a valid result, so direct/continue/clarification fails closed into a grounded path.`,
    };
  }

  if (
    admissibility.decision === "admissible"
    && admissibility.safeKind
    && admissibility.blockedClaimKinds.length === 0
    && !admissibility.requiredGroundingKind
  ) {
    return null;
  }

  const blockedClaimKinds = admissibility.blockedClaimKinds.length > 0
    ? admissibility.blockedClaimKinds.join(", ")
    : "none";
  const requiredGroundingKind = admissibility.requiredGroundingKind ?? "unspecified";
  return {
    path: "path",
    message:
      `${NO_MUTATION_ADMISSIBILITY_ISSUE_CODE}: proposed no-mutation response is not admissible without a runtime receipt. decision=${admissibility.decision}; safeKind=${admissibility.safeKind ?? "none"}; blockedClaimKinds=${blockedClaimKinds}; requiredGroundingKind=${requiredGroundingKind}; topicKind=${admissibility.topicKind ?? "none"}; durability=${admissibility.durability ?? "none"}.`,
  };
}

async function validateNoMutationAdmissibility(input: {
  model: ReturnType<typeof createModel>;
  provider: ProviderConfig;
  playerAction: string;
  read: GmRead;
  sceneView: ModelFacingSceneView;
  safety: ModelFacingPromptSafety;
  extraForbiddenTerms: readonly string[];
}): Promise<GmReadValidationIssue[]> {
  if (!isNoMutationReadPath(input.read)) return [];

  try {
    const result = await withRole("judge", () =>
      safeGenerateObject({
        model: input.model,
        schema: noMutationAdmissibilitySchema,
        system:
          "You are a strict no-mutation admissibility classifier for one GM Read. Return one JSON object only.",
        prompt: buildNoMutationAdmissibilityPrompt(input),
        temperature: 0,
        maxOutputTokens: GM_READ_NO_MUTATION_ADMISSIBILITY_MAX_OUTPUT_TOKENS,
        timeout: { totalMs: GM_READ_TIMEOUT_MS },
        retries: GM_READ_STRUCTURED_OUTPUT_RETRIES,
        mode: readGmReadStructuredOutputMode(input.provider),
        allowTextFallback: false,
        allowRepair: false,
      }),
    );
    const issue = noMutationAdmissibilityIssue(result.object);
    log.event("judge.gm-read.no-mutation-admissibility", {
      path: input.read.path,
      decision: result.object?.decision ?? null,
      safeKind: result.object?.safeKind ?? null,
      blockedClaimKinds: result.object?.blockedClaimKinds ?? [],
      requiredGroundingKind: result.object?.requiredGroundingKind ?? null,
      success: issue === null,
    });
    return issue ? [issue] : [];
  } catch (error) {
    log.warn("GM Read no-mutation admissibility classifier failed; failing closed.", {
      error: error instanceof Error ? error.message : String(error),
    });
    return [noMutationAdmissibilityIssue(null)!];
  }
}

async function validateGeneratedGmRead(input: {
  model: ReturnType<typeof createModel>;
  provider: ProviderConfig;
  read: GmRead;
  frame: SceneFrame;
  playerAction: string;
  sceneView: ModelFacingSceneView;
  safety: ModelFacingPromptSafety;
  extraForbiddenTerms: readonly string[];
}): Promise<GmReadValidationIssue[]> {
  const issues = validateGmReadForFrame(input.read, input.frame, input.playerAction);
  if (issues.length > 0) return issues;
  return validateNoMutationAdmissibility(input);
}

function formatGmReadValidationIssues(issues: readonly GmReadValidationIssue[]): string {
  return issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");
}

function isRepairableGmReadValidationIssue(issue: GmReadValidationIssue): boolean {
  return (
    issue.message.includes(TURN_GROUNDING_CONSISTENCY_ISSUE_CODE)
    || issue.message.includes(PASSIVE_STATUS_READ_ISSUE_CODE)
    || issue.message.includes(POSTED_PROOF_REQUIREMENT_ISSUE_CODE)
    || issue.message.includes(DOCUMENT_STATE_ISSUE_CODE)
    || issue.message.includes(REUSABLE_DIALOGUE_DURABILITY_ISSUE_CODE)
    || issue.message.includes(NO_MUTATION_ADMISSIBILITY_ISSUE_CODE)
  );
}

function shouldAttemptGmReadValidationRepair(
  issues: readonly GmReadValidationIssue[],
): boolean {
  return issues.length > 0 && issues.every(isRepairableGmReadValidationIssue);
}

function buildGmReadValidationRepairPrompt(input: {
  originalPrompt: string;
  previousRead: GmRead;
  issues: readonly GmReadValidationIssue[];
  safety: ModelFacingPromptSafety;
  extraForbiddenTerms?: readonly string[];
}): string {
  return [
    input.originalPrompt,
    "",
    "VALIDATION REPAIR REQUIRED",
    "The previous GM Read JSON passed schema validation but failed backend semantic validation.",
    "Return one corrected GM Read JSON object only.",
    "Do not add new refs, hidden actors, player inventory, completed movement, or concrete tool payloads.",
    "Prefer the lightest valid path. If the issue says a reusable answer or pressure must be grounded, use tool_plan with the narrowest runtimeRequirement.",
    "If the previous direct/continue/clarification text made pressure sound durable but the turn should stay local, you may instead keep the same no-mutation path and remove future-relevant pressure.",
    "",
    "BACKEND VALIDATION ISSUES",
    formatGmReadValidationIssues(input.issues),
    "",
    "PREVIOUS GM READ JSON",
    JSON.stringify(
      sanitizeModelFacingJson(input.previousRead, {
        safety: input.safety,
        extraForbiddenTerms: input.extraForbiddenTerms,
      }),
      null,
      2,
    ),
  ].join("\n");
}

export function buildGmReadPrompt(args: RunGmReadArgs): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const responseLanguage =
    args.responseLanguage
    ?? inferSessionResponseLanguage({
      playerAction: args.playerAction,
      recentConversation: args.recentConversation,
    });
  return [
    "MODEL-FACING GM READ CONTRACT",
    buildGmReadPromptContract({ allowedTools: args.frame.allowedTools }),
    "",
    formatSessionLanguageContract(responseLanguage),
    "",
    "PLAYER ACTION RAW TEXT (SANITIZED PLAYER-AUTHORED PROSE; NOT LEGAL REFS)",
    formatModelFacingPlayerActionText(args.playerAction, {
      safety: scenePacket.safety,
      extraForbiddenTerms: args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    }),
    "",
    "PLAYER ACTION EPISTEMIC NOTES",
    buildPlayerActionEpistemicNotes(args.playerAction),
    "",
    "COMBAT PRESSURE NOTES",
    buildCombatPressureNotes(args.playerAction),
    "",
    "MODEL-FACING SCENE VIEW",
    JSON.stringify(buildGmReadSceneViewForPrompt(scenePacket.view), null, 2),
    "",
    "GM READ CITABLE REF BUDGET",
    JSON.stringify(
      {
        evidenceRefsMax: GM_READ_EVIDENCE_MAX,
        focalActorRefsMax: GM_READ_FOCAL_ACTOR_MAX,
        targetRefsMax: GM_READ_TARGET_REF_MAX,
        refs: buildCitableRefBudgetForPrompt(scenePacket.view),
        rule:
          "Use only these refs in evidenceRefs. For broad take-stock/status-read, pick the smallest useful subset instead of listing every visible candidate.",
      },
      null,
      2,
    ),
    "",
    "CANDIDATE REFS FROM MODEL-FACING VIEW ONLY",
    JSON.stringify(buildCandidateRefsForPrompt(scenePacket.view), null, 2),
    "",
    "PLAYFEEL AND STATE GROUNDING",
    "Before choosing path, fill turnGrounding from your semantic read of the player request and current SceneFrame. This replaces backend keyword routing: the harness validates consistency between turnGrounding, path, and runtimeRequirement.",
    'turnGrounding intentKind values: ordinary_local_response, passive_status_read, procedural_information, posted_proof_applicability, document_state_assumption, concrete_state_change, combat_pressure, clarification_needed, other.',
    'turnGrounding groundingKind values: none, observation_read, dialogue_outcome, world_fact, scene_beat, state_mutation, roll_oracle, combat_transition. If requiresGrounding=true, direct/continue/clarification are invalid.',
    "This is a game: reward clever, tone-appropriate player plans when the scene supports a check, bluff, social read, power move, or risky trick.",
    "Do not turn every access/proof/permission beat into paperwork. Use bureaucracy only when it is actually interesting for this world's tone.",
    "If the turn only asks what would be sufficient, what a source believes, or what rule applies, use dialogue_outcome with requiresStructuralEffect=false.",
    "If the turn should actually apply durable state now (access granted, guard convinced, suspicion attached, stamp/mark added, relationship changed, possession transferred, route opened, wound/condition set), use tool_plan and set runtimeRequirement.requiresStructuralEffect=true plus runtimeRequirement.effectKind or effectKinds so runtime exposes exactly the matching structural owner classes before record_dialogue_outcome.",
    "For every dialogue_outcome runtimeRequirement, set speakerBinding. Use visible_actor only when the player addressed an existing visible actor ref. Use prose_role when the player addressed a role/office/source in prose, even if some other visible NPC is present. Use no_visible_authority only when the scene has no current speaker who can answer.",
    "Exact speakerBinding keys: visible_actor uses speakerRef; prose_role and no_visible_authority use requestedRoleText. Do not write proseRole or roleText in GM Read speakerBinding.",
    "speakerBinding is a binding contract for runtime, not narration. A prose_role target may be answered only by a same-turn created matching support actor or by unavailable/no_current_answer; it must not be silently rebound to a different visible NPC.",
    "",
    "REFERENCE SELECTION RULES",
    "Use preferredRef values exactly whenever present.",
    "For the player, use Player. For the current place, use current_scene/current_location.",
    "For visible NPCs, locations, items, and factions, prefer human-readable labels from preferredRef.",
    "Do not copy backend IDs, typed backend refs, or UUID-like strings into GM Read refs. If no preferredRef identifies a candidate, omit that candidate from the ref field and describe the concept in prose.",
    "",
    "ALLOWED TOOLS FROM frame.allowedTools",
    args.frame.allowedTools.length > 0
      ? args.frame.allowedTools.map((toolName) => `- ${toolName}`).join("\n")
      : "- none",
    "",
    "SCOPED FORECAST EXCERPT ONLY",
    JSON.stringify(scopedForecastForModelPrompt(args.scopedForecastExcerpt), null, 2),
    "",
    "RECENT CONVERSATION",
    formatRecentConversation(
      args.recentConversation,
      scenePacket.safety,
      args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [],
    ),
  ].join("\n");
}

export async function runGmRead(args: RunGmReadArgs): Promise<GmRead> {
  const model = createModel(args.provider, { role: "judge", reasoningMode: "bypass" });
  const system = [
    "You are the GM/Judge for one player turn.",
    "Return one GM Read JSON object only. Do not write prose, dialogue, markdown, or runtime tool calls.",
    "Interpret the raw playerAction against the model-facing scene view, candidate refs, allowed tools, and scoped forecast excerpt.",
    "For refs, use candidate preferredRef values, Player, current_scene, or current_location exactly. Do not output raw backend IDs or typed backend refs.",
    "For evidenceRefs, use only the GM READ CITABLE REF BUDGET and keep the array at or below its max. Select top refs; do not enumerate every visible candidate.",
    "Write every GM Read free-text field in the session response language.",
    "Choose the next path and explain why, but do not create concrete tool payloads or mutate world state.",
    "Backend owns execution, validation, persistence, randomness, and final truth.",
  ].join(" ");
  const scenePacket = buildModelFacingScenePacket(args.frame);
  const prompt = buildGmReadPrompt(args);
  const startMs = Date.now();

  log.event("model-facing.scene-packet", {
    source: "gm-read",
    ...buildModelFacingSceneDiagnostics(scenePacket),
  });

  const generateRead = (promptText: string) =>
    safeGenerateObject({
      model,
      schema: gmReadSchema,
      system,
      prompt: promptText,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? GM_READ_DEFAULT_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: GM_READ_TIMEOUT_MS },
      retries: GM_READ_STRUCTURED_OUTPUT_RETRIES,
      mode: readGmReadStructuredOutputMode(args.provider),
      allowTextFallback: false,
      allowRepair: false,
    });

  let result = await withRole("judge", () => generateRead(prompt));
  let read = hardenReusableDialogueRuntimeRequirement(result.object);
  if (read !== result.object) {
    log.event("judge.gm-read.runtime-requirement-hardened", {
      reason: REUSABLE_DIALOGUE_DURABILITY_ISSUE_CODE,
      path: read.path,
    });
  }
  const extraForbiddenTerms = args.scopedForecastExcerpt?.forbiddenPrivateTerms ?? [];
  let issues = await validateGeneratedGmRead({
    model,
    provider: args.provider,
    read,
    frame: args.frame,
    playerAction: args.playerAction,
    sceneView: scenePacket.view,
    safety: scenePacket.safety,
    extraForbiddenTerms,
  });
  let trace = result.trace;
  let validationRepairAttempted = false;

  log.event("judge.gm-read", {
    path: read.path,
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

  if (shouldAttemptGmReadValidationRepair(issues)) {
    validationRepairAttempted = true;
    log.event("judge.gm-read.rejected", {
      reason: "validation_failed",
      repairAttempted: true,
      issueCount: issues.length,
      issues: formatGmReadValidationIssues(issues),
    });

    const repairPrompt = buildGmReadValidationRepairPrompt({
      originalPrompt: prompt,
      previousRead: read,
      issues,
      safety: scenePacket.safety,
      extraForbiddenTerms,
    });
    let repairResult: typeof result | undefined;
    try {
      repairResult = await withRole("judge", () => generateRead(repairPrompt));
    } catch (error) {
      log.warn("GM Read validation repair generation failed; preserving original validation failure.", {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    if (repairResult?.object) {
      result = repairResult;
      read = hardenReusableDialogueRuntimeRequirement(result.object);
      if (read !== result.object) {
        log.event("judge.gm-read.runtime-requirement-hardened", {
          reason: REUSABLE_DIALOGUE_DURABILITY_ISSUE_CODE,
          path: read.path,
          validationRepair: true,
        });
      }
      issues = await validateGeneratedGmRead({
        model,
        provider: args.provider,
        read,
        frame: args.frame,
        playerAction: args.playerAction,
        sceneView: scenePacket.view,
        safety: scenePacket.safety,
        extraForbiddenTerms,
      });
      trace = result.trace;

      log.event("judge.gm-read", {
        path: read.path,
        success: issues.length === 0,
        issueCount: issues.length,
        validationRepair: true,
        strategy: trace?.strategy ?? null,
        primaryStrategy: trace?.primaryStrategy ?? null,
        fallbackStrategy: trace?.fallbackStrategy ?? null,
        fallbackReason: trace?.fallbackReason ?? null,
        capability: trace?.capability ?? null,
        usage: trace?.usage ?? null,
        responseModel: trace?.response?.modelId ?? null,
        latencyMs: Date.now() - startMs,
      });
    } else {
      log.warn("GM Read validation repair returned no object; preserving original validation failure.");
    }
  }

  if (issues.length > 0) {
    log.event("judge.gm-read.rejected", {
      reason: "validation_failed",
      repairAttempted: validationRepairAttempted,
      issueCount: issues.length,
      issues: formatGmReadValidationIssues(issues),
    });

    throw new Error(
      `GM Read validation failed:\n${formatGmReadValidationIssues(issues)}`,
    );
  }

  return read;
}
