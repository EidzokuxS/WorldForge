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

type EvidenceRefSanitization = {
  refs: string[];
  droppedRefs: Array<{ path: string; ref: string }>;
};

function sanitizeEvidenceRefsForFrame(
  refs: readonly string[],
  frame: SceneFrame,
  path: string,
): EvidenceRefSanitization {
  const allowedRefs = buildAllowedRefSet(frame);
  const forbiddenRefs = buildForbiddenRefSet(frame);
  const droppedRefs: Array<{ path: string; ref: string }> = [];
  const sanitizedRefs: string[] = [];

  refs.forEach((ref, index) => {
    const normalized = normalizeRef(ref);
    if (forbiddenRefs.has(normalized)) {
      sanitizedRefs.push(ref);
      return;
    }
    if (!allowedRefs.has(normalized)) {
      droppedRefs.push({ path: `${path}.${index}`, ref });
      return;
    }
    sanitizedRefs.push(ref);
  });

  if (sanitizedRefs.length === 0 && allowedRefs.has(normalizeRef(frame.playerActorId))) {
    sanitizedRefs.push(frame.playerActorId);
  }

  return { refs: sanitizedRefs, droppedRefs };
}

function sanitizeGmReadEvidenceRefsForFrame(
  read: GmRead,
  frame: SceneFrame,
): { read: GmRead; droppedRefs: Array<{ path: string; ref: string }> } {
  const topLevel = sanitizeEvidenceRefsForFrame(read.evidenceRefs, frame, "evidenceRefs");
  const droppedRefs = [...topLevel.droppedRefs];

  if (read.path === "roll_oracle") {
    const rollRequest = sanitizeEvidenceRefsForFrame(
      read.rollRequest.evidenceRefs,
      frame,
      "rollRequest.evidenceRefs",
    );
    droppedRefs.push(...rollRequest.droppedRefs);
    return {
      read: {
        ...read,
        evidenceRefs: topLevel.refs,
        rollRequest: {
          ...read.rollRequest,
          evidenceRefs: rollRequest.refs,
        },
      },
      droppedRefs,
    };
  }

  return {
    read: {
      ...read,
      evidenceRefs: topLevel.refs,
    },
    droppedRefs,
  };
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
      backendIds: {
        id: actor.id,
        actorId: actor.actorId,
      },
      label: actor.label,
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
      backendIds: {
        id: candidate.id,
        actorId: candidate.actorId,
        itemId: candidate.itemId,
        locationId: candidate.locationId,
        factionId: candidate.factionId,
      },
      label: candidate.label,
      type: candidate.type,
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
      backendIds: {
        id: candidate.id,
        locationId: candidate.locationId,
      },
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

function isOutsideFrameCandidateIssue(issue: GmReadValidationIssue): boolean {
  return issue.message.includes("references a ref outside SceneFrame candidates");
}

function isNoMutationFuturePressureIssue(issue: GmReadValidationIssue): boolean {
  return issue.message.includes(NO_MUTATION_PRESSURE_ISSUE_CODE);
}

function shouldRepairGmReadFrameRefs(
  issues: readonly GmReadValidationIssue[],
  playerAction: string,
): boolean {
  if (issues.length === 0) return false;
  const frameRefOrPathIssuesAreRepairable = issues.every(
    (issue) => isOutsideFrameCandidateIssue(issue) || isNoMutationFuturePressureIssue(issue),
  );
  const accessClaimRefsAreRepairable =
    isUnconfirmedAccessProofClaim(playerAction)
    && frameRefOrPathIssuesAreRepairable;
  const noMutationPressureIsRepairable = issues.every(isNoMutationFuturePressureIssue);
  return frameRefOrPathIssuesAreRepairable || accessClaimRefsAreRepairable || noMutationPressureIsRepairable;
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
    JSON.stringify(scenePacket.view, null, 2),
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

function buildGmReadFrameRefRepairPrompt(
  args: RunGmReadArgs,
  invalidRead: GmRead,
  issues: readonly GmReadValidationIssue[],
): string {
  const scenePacket = buildModelFacingScenePacket(args.frame);
  return [
    "MODEL-FACING GM READ FRAME-REF REPAIR",
    buildGmReadPromptContract({ allowedTools: args.frame.allowedTools }),
    "",
    "FRAME VALIDATION FAILED",
    formatGmReadValidationIssues(issues),
    "",
    "REPAIR TASK",
    "Return one corrected GM Read JSON object.",
    "Do not invent source truth, new world facts, new backend IDs, or new refs.",
    "Keep the same player action meaning and same beat anchor unless the invalid refs made that impossible.",
    "Use preferredRef values exactly whenever present in CANDIDATE REFS FROM MODEL-FACING VIEW ONLY.",
    "For the player, use Player. Do not repair by copying raw UUID-like backend actor IDs.",
    "Use only refs listed in CANDIDATE REFS FROM MODEL-FACING VIEW ONLY.",
    "PATH SWITCH REPAIR RULE",
    "When validation includes future-relevant-pressure-requires-tool-path, the previous path choice is invalid. Do not keep direct, continue, or clarification unless you remove every future-relevant actor, prop, route, door, obligation, defensive posture, danger change, and aftermath phrase from sceneQuestion, the path field, and narrationGuardrails.",
    "If any future-relevant pressure remains, switch the GM Read path yourself: use roll_oracle for uncertain visible social/physical reaction, tool_plan when backend must accept an observation or affordance before narration can use it later, and combat_transition for committed violence or concrete combat pressure.",
    "For passive/tourist/probing actions, do not make the player important by default. If the world pressure should continue despite low player agency, choose the smallest path that proves that pressure; otherwise keep it local sensory color and non-durable.",
    "For an unconfirmed claimed key, credential, office, door, route, room, lock, proof, or authority, do not ask Oracle whether the claimed proof exists. Use visible NPC belief, witness reaction, alarm, or physical resistance with listed refs only.",
    "For an unconfirmed claimed key, credential, office, door, route, room, lock, or authority, remove that unlisted thing from targetRefs and rollRequest.targetRef.",
    "If the beat still needs uncertainty, ask about visible NPC belief, witness reaction, alarm, or visible physical resistance using a listed NPC/current-scene candidate.",
    "If no listed target fits, use actionInterpretation.targetRefs: [] and omit rollRequest.targetRef.",
    "",
    "PLAYER ACTION RAW TEXT",
    args.playerAction,
    "",
    "PLAYER ACTION EPISTEMIC NOTES",
    buildPlayerActionEpistemicNotes(args.playerAction),
    "",
    "CANDIDATE REFS FROM MODEL-FACING VIEW ONLY",
    JSON.stringify(buildCandidateRefsForPrompt(scenePacket.view), null, 2),
    "",
    "INVALID GM READ JSON",
    JSON.stringify(invalidRead, null, 2),
  ].join("\n");
}

async function repairGmReadFrameRefs(
  args: RunGmReadArgs,
  invalidRead: GmRead,
  issues: readonly GmReadValidationIssue[],
): Promise<GmRead | null> {
  if (!shouldRepairGmReadFrameRefs(issues, args.playerAction)) return null;

  const model = createModel(args.provider, { role: "judge" });
  const prompt = buildGmReadFrameRefRepairPrompt(args, invalidRead, issues);
  const startMs = Date.now();

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: gmReadSchema,
      system: [
        "You repair one GM Read JSON object after frame-reference validation.",
        "Return JSON only.",
        "Use preferredRef candidate refs exactly when present, especially Player for the player.",
        "Use only listed candidate refs or omit target refs.",
        "Do not invent world facts, backend IDs, runtime tool calls, or narrator prose.",
      ].join(" "),
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? 1500,
      retries: 1,
    }),
  );

  const sanitized = sanitizeGmReadEvidenceRefsForFrame(result.object, args.frame);
  const repairedIssues = validateGmReadForFrame(sanitized.read, args.frame, args.playerAction);

  log.event("judge.gm-read.frame-ref-repair", {
    success: repairedIssues.length === 0,
    originalIssueCount: issues.length,
    repairedIssueCount: repairedIssues.length,
    droppedInvalidEvidenceRefCount: sanitized.droppedRefs.length,
    strategy: result.trace?.strategy ?? null,
    primaryStrategy: result.trace?.primaryStrategy ?? null,
    fallbackStrategy: result.trace?.fallbackStrategy ?? null,
    fallbackReason: result.trace?.fallbackReason ?? null,
    responseModel: result.trace?.response?.modelId ?? null,
    usage: result.trace?.usage ?? null,
    latencyMs: Date.now() - startMs,
  });

  if (repairedIssues.length > 0) {
    throw new Error(
      `GM Read validation failed after frame-ref repair:\n${formatGmReadValidationIssues(
        repairedIssues,
      )}`,
    );
  }

  if (sanitized.droppedRefs.length > 0) {
    log.warn("Dropped invalid GM Read repair evidence refs outside SceneFrame candidates", {
      droppedRefs: sanitized.droppedRefs,
    });
  }

  return sanitized.read;
}

export async function runGmRead(args: RunGmReadArgs): Promise<GmRead> {
  const model = createModel(args.provider, { role: "judge" });
  const system = [
    "You are the GM/Judge for one player turn.",
    "Return one GM Read JSON object only. Do not write prose, dialogue, markdown, or runtime tool calls.",
    "Interpret the raw playerAction against the model-facing scene view, candidate refs, allowed tools, and scoped forecast excerpt.",
    "For refs, use candidate preferredRef values exactly whenever present. Use Player for the player instead of raw UUID-like backend IDs.",
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
      maxOutputTokens: args.maxOutputTokens ?? 1500,
      retries: 1,
    }),
  );
  const sanitized = sanitizeGmReadEvidenceRefsForFrame(result.object, args.frame);
  const issues = validateGmReadForFrame(sanitized.read, args.frame, args.playerAction);
  const trace = result.trace;

  log.event("judge.gm-read", {
    path: sanitized.read.path,
    success: issues.length === 0,
    issueCount: issues.length,
    droppedInvalidEvidenceRefCount: sanitized.droppedRefs.length,
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
    const repaired = await repairGmReadFrameRefs(args, sanitized.read, issues);
    if (repaired) return repaired;

    throw new Error(
      `GM Read validation failed:\n${formatGmReadValidationIssues(issues)}`,
    );
  }

  if (sanitized.droppedRefs.length > 0) {
    log.warn("Dropped invalid GM Read evidence refs outside SceneFrame candidates", {
      refs: sanitized.droppedRefs,
    });
  }

  return sanitized.read;
}
