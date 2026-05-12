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
import {
  buildPlayerActionEpistemicNotes,
  isClaimedProofOracleExistenceQuestion,
  isUnconfirmedAccessProofClaim,
} from "./player-action-epistemics.js";
import { buildGmReadPromptContract } from "./prompt-contracts.js";
import type { SceneFrame } from "./scene-frame.js";
import type { ScopedForecastExcerpt } from "./world-forecast.js";
import { hasFutureRelevantConcretePressure } from "./future-relevant-pressure.js";
import { isCombatPressureAction } from "./combat-envelope.js";
import {
  formatSessionLanguageContract,
  inferSessionResponseLanguage,
  type SessionResponseLanguage,
} from "./session-language.js";
import { playerBlockingStageLimit, readRuntimeLimitMs } from "./runtime-limits.js";

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
  }).strict(),
  z.object({
    kind: z.literal("world_fact"),
    durability: z.literal("durable"),
    topicKind: runtimeRequirementTopicSchema.optional(),
  }).strict(),
  z.object({
    kind: z.literal("scene_beat"),
    durability: runtimeRequirementDurabilitySchema,
  }).strict(),
  z.object({
    kind: z.literal("state_mutation"),
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
  return {
    version: value.version ?? GM_READ_VERSION,
    ...value,
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

const NO_MUTATION_PRESSURE_ISSUE_CODE = "future-relevant-pressure-requires-tool-path";
const PASSIVE_STATUS_READ_ISSUE_CODE = "passive-status-read-requires-grounded-consequence-path";
const POSTED_PROOF_REQUIREMENT_ISSUE_CODE = "posted-proof-request-requires-dialogue-outcome";

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
  const refs = new Set<string>();

  addRef(refs, "Player");
  addTypedRef(refs, "actor", "Player");
  addRef(refs, frame.playerActorId);
  addTypedRef(refs, "actor", frame.playerActorId);
  addRef(refs, frame.currentLocationId);
  addTypedRef(refs, "location", frame.currentLocationId);
  addRef(refs, frame.currentSceneScopeId);
  addTypedRef(refs, "location", frame.currentSceneScopeId);
  for (const actor of [...frame.roster.active, ...frame.roster.support]) {
    addRef(refs, actor.id);
    addTypedRef(refs, "actor", actor.id);
    addRef(refs, actor.actorId);
    addTypedRef(refs, "actor", actor.actorId);
    addRef(refs, actor.label);
  }
  for (const candidate of frame.targetCandidates) {
    addRef(refs, candidate.id);
    addRef(refs, candidate.actorId);
    addTypedRef(refs, "actor", candidate.actorId);
    addRef(refs, candidate.itemId);
    addTypedRef(refs, "item", candidate.itemId);
    addRef(refs, candidate.locationId);
    addTypedRef(refs, "location", candidate.locationId);
    addRef(refs, candidate.factionId);
    addTypedRef(refs, "faction", candidate.factionId);
    addRef(refs, candidate.label);
  }
  for (const candidate of frame.movementCandidates) {
    addRef(refs, candidate.id);
    addTypedRef(refs, "location", candidate.id);
    addRef(refs, candidate.locationId);
    addTypedRef(refs, "location", candidate.locationId);
    addRef(refs, candidate.label);
  }

  return refs;
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

  issues.push(...validateNoMutationFutureRelevantPressure(read));
  issues.push(...validatePassiveStatusReadNoMutation(read, frame, playerAction));
  issues.push(...validateRuntimeRequirementPath(read));
  issues.push(...validatePostedProofRuntimeRequirement(read, playerAction));

  return issues;
}

function validateNoMutationFutureRelevantPressure(read: GmRead): GmReadValidationIssue[] {
  const fields: Array<{ path: string; text: string }> = [
    { path: "sceneQuestion", text: read.sceneQuestion },
    ...read.narrationGuardrails.map((text, index) => ({
      path: `narrationGuardrails.${index}`,
      text,
    })),
  ];

  switch (read.path) {
    case "direct":
      fields.push({ path: "directResolutionNotes", text: read.directResolutionNotes });
      break;
    case "continue":
      fields.push({ path: "continuationGuidance", text: read.continuationGuidance });
      break;
    case "clarification":
      fields.push({ path: "clarificationPrompt", text: read.clarificationPrompt });
      break;
    default:
      return [];
  }

  return fields
    .filter((field) => hasFutureRelevantConcretePressure(field.text))
    .map((field) => ({
      path: field.path,
      message:
        `${NO_MUTATION_PRESSURE_ISSUE_CODE}: direct/continue/clarification cannot introduce future-relevant concrete pressure. Choose tool_plan, roll_oracle, or combat_transition if the pressure should matter later; otherwise keep this field sensory, local, and non-durable.`,
    }));
}

function isNoMutationReadPath(
  read: GmRead,
): read is Extract<GmRead, { path: "direct" | "continue" | "clarification" }> {
  return read.path === "direct" || read.path === "continue" || read.path === "clarification";
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
  if (read.path === "tool_plan") return [];

  return [
    {
      path: "runtimeRequirement",
      message:
        "GM Read runtimeRequirement can be non-none only for tool_plan paths. Use runtimeRequirement { kind: \"none\" } or omit it for direct, continue, clarification, roll_oracle, and combat_transition.",
    },
  ];
}

function validatePostedProofRuntimeRequirement(
  read: GmRead,
  playerAction?: string,
): GmReadValidationIssue[] {
  if (!playerAction || !isPostedApplicableProofRequest(playerAction)) return [];
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

function isPassiveStatusReadAction(playerAction: string): boolean {
  return /\b(take stock|read the room|look around|look over|scan|survey|observe|watch|inspect|study|listen|assess|describe|identify|note|check|compare|reconcile|audit|summari[sz]e|contradict(?:ion|ions)?|uncertain(?:ty)?|wait|linger|tour)\b/i.test(playerAction);
}

function isProceduralInformationRequest(playerAction: string): boolean {
  const conversational = /\b(ask|question|inquire|request|tell me|what|which|where|who|how|whether)\b/i
    .test(playerAction);
  if (!conversational) return false;
  if (isPostedApplicableProofRequest(playerAction)) return true;
  return /\b(proof|credential|credentials|permit|pass|permission|authori[sz]ation|waiver|chit|stamp(?:ed)?|seal[- ]?verified|require(?:ment|ments|s|d)?|need(?:ed)?|document|documents|valid|invalid|sufficient|fail|fails|failed|rule|law|procedure|protocol|jurisdiction|route|lead|witness|dispatch|office|contact|send|public service|communication|stay(?:ing)? in place|wait(?:ing)? in place|report|unsafe|danger|risk|restricted|forbidden|allowed|access|entry|classify|classification|changed today|notice[- ]?board|public postings?|postings?|posted\s+(?:item|notice|rule|entry|sign)|amend(?:ed|ment|ments)?)\b/i
    .test(playerAction);
}

function isPostedApplicableProofRequest(playerAction: string): boolean {
  const conversational = /\b(ask|question|inquire|request|tell me|what|which|whether|identify)\b/i
    .test(playerAction);
  if (!conversational) return false;
  const hasPostedSignal =
    /\b(posted\s+(?:item|notice|rule|entry|sign)|notice[- ]?board|public postings?|postings?)\b/i
      .test(playerAction);
  const asksApplicability = /\b(appl(?:y|ies|ied|icable)|identify|which)\b/i.test(playerAction);
  const hasProofSubject =
    /\b(document|documents|message|case|proof|permit|pass|seal(?:ed)?|credential|credentials|authority|requirement|requirements|chit|waiver)\b/i
      .test(playerAction);
  return hasPostedSignal && asksApplicability && hasProofSubject;
}

function requestsBroadStatusRead(playerAction: string): boolean {
  const normalized = playerAction.toLowerCase();
  const categorySignals = [
    /\bvisible\b/,
    /\bofficials?\b|\bguards?\b|\bclerks?\b|\bwitness(?:es)?\b|\bcrowd\b/,
    /\broutes?\b|\bexits?\b|\bpaths?\b|\bdoors?\b|\bwhere\b/,
    /\brisks?\b|\bthreats?\b|\bchallengers?\b|\bpressure\b|\bdanger\b/,
    /\bpublic\b|\blegal\b|\brules?\b|\bprocedure\b|\bauthorit(?:y|ies)\b/,
    /\bobjects?\b|\bitems?\b|\bevidence\b|\bsigns?\b|\btraces?\b|\bresidue\b/,
    /\bmovement\b|\breaction\b|\bbehavior\b|\balarm\b|\bbells?\b|\bfog\b|\bengines?\b/,
  ];
  const matchedCategories = categorySignals.filter((pattern) => pattern.test(normalized)).length;
  const listLike = (playerAction.match(/[,;:]/g)?.length ?? 0) >= 2;
  return matchedCategories >= 2 || listLike;
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
  playerAction?: string,
): GmReadValidationIssue[] {
  if (!playerAction || !isNoMutationReadPath(read)) return [];
  const statusReadLike =
    isPassiveStatusReadAction(playerAction)
    || isProceduralInformationRequest(playerAction);
  if (!statusReadLike) return [];
  if (!requestsBroadStatusRead(playerAction) && !sceneHasPlayableStatusReadContext(frame)) return [];

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
    .slice(-GM_READ_RECENT_CONVERSATION_LIMIT)
    .map((entry) => `- ${entry.role}: ${compactPromptText(entry.content, GM_READ_RECENT_CONVERSATION_MAX_CHARS)}`)
    .join("\n");

  return lines || "- none";
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
): string {
  if (actor.id === view.localScene.playerActorId || actor.actorId === view.localScene.playerActorId) {
    return "Player";
  }
  return actor.label || actor.actorId || actor.id;
}

function buildGmReadSceneViewForPrompt(view: ModelFacingSceneView): unknown {
  return {
    localScene: {
      tick: view.localScene.tick,
      currentLocationId: view.localScene.currentLocationId,
      currentSceneScopeId: view.localScene.currentSceneScopeId,
    },
    visibleActors: view.visibleActors.map((actor) => ({
      ref: actorPreferredRef(view, actor),
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
      actorRefs: event.actorIds.slice(0, 4),
    })),
    legalTargetCount: view.legalTargets.length,
    legalMovementCount: view.legalMovement.length,
    oracle: view.oracle,
    oracleContext: view.oracleContext,
    combatEnvelope: view.combatEnvelope ? { present: true } : undefined,
  };
}

function buildCandidateRefsForPrompt(view: ModelFacingSceneView): unknown {
  return {
    actors: view.visibleActors.map((actor) => ({
      preferredRef: actorPreferredRef(view, actor),
      usableRefs: uniqueRefs([
        actorPreferredRef(view, actor),
        actor.label,
        actor.actorId,
        actor.actorId ? `actor:${actor.actorId}` : null,
        actor.id,
        `actor:${actor.id}`,
      ]),
      type: actor.type,
      awareness: actor.awareness,
    })),
    targets: view.legalTargets.map((candidate) => ({
      preferredRef: candidate.label || candidate.id,
      usableRefs: uniqueRefs([
        candidate.label,
        candidate.id,
        candidate.actorId,
        candidate.actorId ? `actor:${candidate.actorId}` : null,
        candidate.itemId,
        candidate.itemId ? `item:${candidate.itemId}` : null,
        candidate.locationId,
        candidate.locationId ? `location:${candidate.locationId}` : null,
        candidate.factionId,
        candidate.factionId ? `faction:${candidate.factionId}` : null,
      ]),
      type: candidate.type,
      tags: candidate.tags?.slice(0, 6),
    })),
    movements: view.legalMovement.map((candidate) => ({
      preferredRef: candidate.label || candidate.locationId || candidate.id,
      usableRefs: uniqueRefs([
        candidate.label,
        candidate.locationId,
        candidate.locationId ? `location:${candidate.locationId}` : null,
        candidate.id,
        `location:${candidate.id}`,
      ]),
      connected: candidate.connected,
      travelCost: candidate.travelCost,
    })),
  };
}

function buildCitableRefBudgetForPrompt(view: ModelFacingSceneView): string[] {
  const playerRefs = ["Player"];
  const visibleActorRefs = view.visibleActors
    .map((actor) => actorPreferredRef(view, actor))
    .filter((ref) => ref !== "Player")
    .slice(0, 3);
  const targetRefs = view.legalTargets
    .map((candidate) => candidate.label || candidate.id)
    .slice(0, 3);
  const movementRefs = view.legalMovement
    .map((candidate) => candidate.label || candidate.locationId || candidate.id)
    .slice(0, 2);

  return uniqueRefs([
    ...playerRefs,
    ...visibleActorRefs,
    ...targetRefs,
    ...movementRefs,
  ]).slice(0, GM_READ_EVIDENCE_MAX);
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

function formatGmReadValidationIssues(issues: readonly GmReadValidationIssue[]): string {
  return issues.map((issue) => `- ${issue.path}: ${issue.message}`).join("\n");
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
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
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
    "REFERENCE SELECTION RULES",
    "Use preferredRef values exactly whenever present.",
    "For the player, use Player. Do not copy raw UUID-like backend actor IDs for the player.",
    "For visible NPCs, locations, items, and factions, prefer human-readable labels from preferredRef.",
    "Only use a backendId or typed backend ref when no preferredRef can identify the listed candidate.",
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

export async function runGmRead(args: RunGmReadArgs): Promise<GmRead> {
  const model = createModel(args.provider, { role: "judge", reasoningMode: "bypass" });
  const system = [
    "You are the GM/Judge for one player turn.",
    "Return one GM Read JSON object only. Do not write prose, dialogue, markdown, or runtime tool calls.",
    "Interpret the raw playerAction against the model-facing scene view, candidate refs, allowed tools, and scoped forecast excerpt.",
    "For refs, use candidate preferredRef values exactly whenever present. Use Player for the player instead of raw UUID-like backend IDs.",
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

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: gmReadSchema,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? GM_READ_DEFAULT_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: GM_READ_TIMEOUT_MS },
      retries: GM_READ_STRUCTURED_OUTPUT_RETRIES,
      mode: readGmReadStructuredOutputMode(args.provider),
      allowTextFallback: false,
      allowRepair: false,
    }),
  );
  const read = result.object;
  const issues = validateGmReadForFrame(read, args.frame, args.playerAction);
  const trace = result.trace;

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

  if (issues.length > 0) {
    log.event("judge.gm-read.rejected", {
      reason: "validation_failed",
      repairAttempted: false,
      issueCount: issues.length,
      issues: formatGmReadValidationIssues(issues),
    });

    throw new Error(
      `GM Read validation failed:\n${formatGmReadValidationIssues(issues)}`,
    );
  }

  return read;
}
