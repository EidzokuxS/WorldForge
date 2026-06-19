import { z } from "zod";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  assertJudgeUncertainty,
  judgeUncertaintySchema,
  type AuthoritativeSceneFrame,
  type GmRead,
  type JudgeUncertainty,
} from "./contracts.js";
import { oracleOutcomeMeaningIssues } from "./oracle-settlement.js";

const FORBIDDEN_SETTLEMENT_KEYS = new Set([
  "args",
  "candidateToolRequest",
  "check",
  "checklist",
  "checklistAdmission",
  "checklistStep",
  "chance",
  "delta",
  "effect",
  "effectKind",
  "effects",
  "input",
  "lane",
  "mutation",
  "narration",
  "narrativeText",
  "oracleResult",
  "outcomeTier",
  "payload",
  "plannedTools",
  "receipt",
  "receiptId",
  "receipts",
  "requiredEffectKinds",
  "resultWorldVersion",
  "roll",
  "selectedOutcome",
  "stateDelta",
  "step",
  "stepId",
  "steps",
  "tool",
  "toolCall",
  "toolId",
  "toolInput",
  "toolName",
  "toolRequest",
  "worldVersionDelta",
]);

const NORMALIZED_FORBIDDEN_SETTLEMENT_KEYS = new Set(
  [...FORBIDDEN_SETTLEMENT_KEYS].map(normalizedKey),
);

const UUID_LIKE_REF = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const BACKEND_REF_PREFIX = /^(actor|campaign|edge|fact|frame|item|location|npc|packet|receipt|route|scene|turn|world)[_:]/i;
const judgeGenerationText = z.string().trim().min(1).max(500);

const judgeDifficultyGenerationSchema = judgeUncertaintySchema.shape.difficulty.unwrap().extend({
  basis: judgeGenerationText,
});

const judgeOracleAdmissionGenerationSchema = judgeUncertaintySchema.shape.oracleAdmission.unwrap().extend({
  question: judgeGenerationText,
  stakes: judgeGenerationText,
  outcomeMeanings: judgeUncertaintySchema.shape.oracleAdmission.unwrap().shape.outcomeMeanings.extend({
    strong_hit: judgeGenerationText,
    weak_hit: judgeGenerationText,
    miss: judgeGenerationText,
  }),
});

const judgeNoRollReasonGenerationSchema = judgeUncertaintySchema.shape.noRollReason.unwrap().extend({
  explanation: judgeGenerationText,
});

export const judgeUncertaintyGenerationSchema = judgeUncertaintySchema
  .extend({
    possibilityRationale: judgeGenerationText,
    checkRationale: judgeGenerationText,
    difficulty: judgeDifficultyGenerationSchema.nullable(),
    oracleAdmission: judgeOracleAdmissionGenerationSchema.nullable(),
    noRollReason: judgeNoRollReasonGenerationSchema.nullable(),
  })
  .partial({
    difficulty: true,
    oracleAdmission: true,
    noRollReason: true,
  })
  .passthrough();

export interface JudgeUncertaintyValidationIssue {
  code:
    | "backend_ref"
    | "branch_invalid"
    | "forbidden_claim"
    | "frame_mismatch"
    | "private_term"
    | "schema_invalid"
    | "settlement_payload"
    | "uncited_ref";
  path: string;
  message: string;
}

export interface JudgeUncertaintyAccepted {
  status: "accepted";
  judgment: JudgeUncertainty;
  issues: [];
  repairAttempted: boolean;
}

export type JudgeUncertaintyRunResult = JudgeUncertaintyAccepted;

export class CleanJudgeUncertaintyGenerationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "CleanJudgeUncertaintyGenerationError";
  }
}

export class CleanJudgeUncertaintyValidationError extends Error {
  readonly issues: JudgeUncertaintyValidationIssue[];

  constructor(message: string, issues: JudgeUncertaintyValidationIssue[]) {
    super(message);
    this.name = "CleanJudgeUncertaintyValidationError";
    this.issues = issues;
  }
}

function judgeUncertaintyIssueSummary(issues: readonly JudgeUncertaintyValidationIssue[]): string {
  return issues
    .slice(0, 4)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
}

export interface JudgeUncertaintyCandidateRequest {
  system: string;
  prompt: string;
}

export type JudgeUncertaintyCandidateGenerator =
  (request: JudgeUncertaintyCandidateRequest) => Promise<unknown>;

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeNullableBranchFields(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  return {
    ...candidate,
    difficulty: Object.hasOwn(candidate, "difficulty") ? candidate.difficulty : null,
    oracleAdmission: Object.hasOwn(candidate, "oracleAdmission") ? candidate.oracleAdmission : null,
    noRollReason: Object.hasOwn(candidate, "noRollReason") ? candidate.noRollReason : null,
  };
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function zodIssue(issue: z.core.$ZodIssue): JudgeUncertaintyValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

function collectSettlementPayloadIssues(value: unknown): JudgeUncertaintyValidationIssue[] {
  const issues: JudgeUncertaintyValidationIssue[] = [];

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;

    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      const normalized = normalizedKey(key);
      if (FORBIDDEN_SETTLEMENT_KEYS.has(key) || NORMALIZED_FORBIDDEN_SETTLEMENT_KEYS.has(normalized)) {
        issues.push({
          code: "settlement_payload",
          path: childPath,
          message: "Judge/Uncertainty cannot carry tool, checklist, mutation, receipt, narration, roll, or settlement fields.",
        });
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return issues;
}

function collectPrivateTermIssues(
  value: unknown,
  terms: readonly string[],
): JudgeUncertaintyValidationIssue[] {
  const loweredTerms = uniqueStrings(terms)
    .map((term) => term.toLowerCase())
    .filter((term) => term.length > 0);
  if (loweredTerms.length === 0) return [];

  const issues: JudgeUncertaintyValidationIssue[] = [];

  function visit(node: unknown, path: string): void {
    if (typeof node === "string") {
      const lowered = node.toLowerCase();
      if (loweredTerms.some((term) => lowered.includes(term))) {
        issues.push({
          code: "private_term",
          path: path || "<root>",
          message: "Judge/Uncertainty public fields cannot leak private frame guard terms.",
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  }

  visit(value, "");
  return issues;
}

function allJudgmentRefs(judgment: JudgeUncertainty): string[] {
  return uniqueStrings([
    ...judgment.actorRefs,
    ...judgment.targetRefs,
    ...judgment.evidenceRefs,
    ...(judgment.difficulty?.evidenceRefs ?? []),
    ...(judgment.noRollReason?.evidenceRefs ?? []),
    ...(judgment.oracleAdmission ? [
      judgment.oracleAdmission.actorRef,
      ...judgment.oracleAdmission.targetRefs,
      ...judgment.oracleAdmission.evidenceRefs,
    ] : []),
  ]);
}

function refValidationIssues(
  judgment: JudgeUncertainty,
  frame: AuthoritativeSceneFrame,
): JudgeUncertaintyValidationIssue[] {
  const legalRefs = new Set(frame.citableRefs.map((ref) => ref.trim().toLowerCase()));
  const issues: JudgeUncertaintyValidationIssue[] = [];

  for (const ref of allJudgmentRefs(judgment)) {
    if (!legalRefs.has(ref.toLowerCase())) {
      issues.push({
        code: "uncited_ref",
        path: "refs",
        message: `Judge/Uncertainty cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (UUID_LIKE_REF.test(ref) || BACKEND_REF_PREFIX.test(ref)) {
      issues.push({
        code: "backend_ref",
        path: "refs",
        message: `Judge/Uncertainty cited backend-only ref "${ref}" instead of a model-safe citable ref.`,
      });
    }
  }

  return issues;
}

function linkageIssues(input: {
  judgment: JudgeUncertainty;
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): JudgeUncertaintyValidationIssue[] {
  const issues: JudgeUncertaintyValidationIssue[] = [];
  if (input.judgment.campaignId !== input.frame.campaignId) {
    issues.push({
      code: "frame_mismatch",
      path: "campaignId",
      message: "Judge/Uncertainty campaignId must match the current SceneFrame.",
    });
  }
  if (input.judgment.frameId !== input.frame.frameId || input.judgment.frameId !== input.gmRead.frameId) {
    issues.push({
      code: "frame_mismatch",
      path: "frameId",
      message: "Judge/Uncertainty frameId must match SceneFrame and GM Read.",
    });
  }
  if (input.judgment.turnId !== input.frame.turnId || input.judgment.turnId !== input.gmRead.turnId) {
    issues.push({
      code: "frame_mismatch",
      path: "turnId",
      message: "Judge/Uncertainty turnId must match SceneFrame and GM Read.",
    });
  }
  if (input.judgment.source.gmReadPath !== input.gmRead.path) {
    issues.push({
      code: "frame_mismatch",
      path: "source.gmReadPath",
      message: "Judge/Uncertainty source.gmReadPath must copy the accepted GM Read path.",
    });
  }
  return issues;
}

function subsetIssue(input: {
  parent: readonly string[];
  child: readonly string[];
  path: string;
  message: string;
}): JudgeUncertaintyValidationIssue[] {
  const parent = new Set(input.parent.map((ref) => ref.toLowerCase()));
  const missing = input.child.filter((ref) => !parent.has(ref.toLowerCase()));
  if (missing.length === 0) return [];
  return [{
    code: "branch_invalid",
    path: input.path,
    message: `${input.message}: ${missing.join(", ")}`,
  }];
}

function hasAvailableBackendConsequenceCapability(frame: AuthoritativeSceneFrame): boolean {
  return frame.capabilities.some((capability) =>
    capability.allowed && capability.evidenceAuthority !== "observation_only"
  );
}

function hasAllowedCapability(frame: AuthoritativeSceneFrame, capabilityId: string): boolean {
  return frame.capabilities.some((capability) =>
    capability.allowed && capability.capabilityId === capabilityId
  );
}

function lowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.toLowerCase()));
}

function frameCitableRefs(frame: AuthoritativeSceneFrame, refs: readonly string[]): string[] {
  const citable = lowerSet(frame.citableRefs);
  return uniqueStrings(refs).filter((ref) => citable.has(ref.toLowerCase()));
}

function visibleActorDialogueNeedsBackendReceipt(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): boolean {
  const { frame, gmRead } = input;
  if (gmRead.actionInterpretation.interactionKind !== "visible_actor_dialogue") return false;
  if (!hasAllowedCapability(frame, "dialogue_record")) return false;
  if (gmRead.actionInterpretation.itemTransferNeed != null && !hasAllowedCapability(frame, "item_transfer")) return false;
  return gmRead.actionInterpretation.targetRefs.some((targetRef) =>
    frame.actors.some((actor) =>
      actor.role !== "player" && actor.ref.toLowerCase() === targetRef.toLowerCase()
    )
  );
}

function movementNeedsBackendReceipt(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): boolean {
  const { frame, gmRead } = input;
  if (gmRead.actionInterpretation.interactionKind !== "movement_intent") return false;
  if (!hasAllowedCapability(frame, "movement")) return false;
  return gmRead.actionInterpretation.targetRefs.some((targetRef) =>
    frame.movementOptions.some((option) => option.ref.toLowerCase() === targetRef.toLowerCase())
  );
}

function routeInquiryNeedsBackendReceipt(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): boolean {
  const { frame, gmRead } = input;
  if (gmRead.actionInterpretation.interactionKind !== "route_inquiry") return false;
  const targetRefs = gmRead.actionInterpretation.targetRefs;
  const hasMovementTarget = targetRefs.some((targetRef) =>
    frame.movementOptions.some((option) => option.ref.toLowerCase() === targetRef.toLowerCase())
  );
  if (hasMovementTarget) return hasAllowedCapability(frame, "route_check");

  const sceneRefs = lowerSet([frame.scene.currentScene.ref, frame.scene.currentLocation.ref]);
  const asksForCurrentSceneRoutes =
    targetRefs.length === 0
    || targetRefs.some((targetRef) => sceneRefs.has(targetRef.toLowerCase()));
  return asksForCurrentSceneRoutes && hasAllowedCapability(frame, "route_options");
}

function typedPrimitiveNeedsBackendReceipt(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): boolean {
  const { frame, gmRead } = input;
  switch (gmRead.actionInterpretation.interactionKind) {
    case "visible_actor_dialogue":
      return visibleActorDialogueNeedsBackendReceipt(input);
    case "movement_intent":
      return movementNeedsBackendReceipt(input);
    case "route_inquiry":
      return routeInquiryNeedsBackendReceipt(input);
    case "ordinary_support_actor_needed":
      return hasAllowedCapability(frame, "support_actor_create")
        && gmRead.actionInterpretation.supportActorNeed != null;
    case "player_local_condition":
      return hasAllowedCapability(frame, "condition_set")
        && gmRead.actionInterpretation.localConditionNeed != null;
    case "item_transfer":
      return hasAllowedCapability(frame, "item_transfer")
        && gmRead.actionInterpretation.itemTransferNeed != null;
    case "minor_poi_create": {
      const placeKind = gmRead.actionInterpretation.minorPoiNeed?.placeKind ?? null;
      return hasAllowedCapability(frame, "minor_poi_create")
        && Boolean(
          frame.currentScenePlaceHandleSurface
          && placeKind
          && frame.currentScenePlaceHandleSurface.allowedPlaceKinds.includes(placeKind),
        );
    }
    case "current_scene_observation":
      return hasAllowedCapability(frame, "local_observation")
        && gmRead.actionInterpretation.localObservationNeed != null;
    case "device_status_observation":
      return hasAllowedCapability(frame, "device_surface_observation")
        && gmRead.actionInterpretation.deviceObservationNeed != null;
    case "time_passage":
      return hasAllowedCapability(frame, "time_advance")
        && gmRead.actionInterpretation.timePassageNeed != null;
    case "scene_local_beat":
      return hasAllowedCapability(frame, "scene_beat_record");
    default:
      return false;
  }
}

function typedPrimitiveEvidenceRefs(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): string[] {
  const { gmRead } = input;
  const localConditionNeed = gmRead.actionInterpretation.localConditionNeed ?? null;
  const itemTransferNeed = gmRead.actionInterpretation.itemTransferNeed ?? null;
  const minorPoiNeed = gmRead.actionInterpretation.minorPoiNeed ?? null;
  const timePassageNeed = gmRead.actionInterpretation.timePassageNeed ?? null;
  const localObservationNeed = gmRead.actionInterpretation.localObservationNeed ?? null;
  const deviceObservationNeed = gmRead.actionInterpretation.deviceObservationNeed ?? null;
  const supportActorNeed = gmRead.actionInterpretation.supportActorNeed ?? null;
  return [
    ...(localConditionNeed ? [
      ...(localConditionNeed.targetRef ? [localConditionNeed.targetRef] : []),
      ...localConditionNeed.evidenceRefs,
    ] : []),
    ...(itemTransferNeed ? [
      itemTransferNeed.itemRef,
      itemTransferNeed.targetRef,
      ...itemTransferNeed.evidenceRefs,
    ] : []),
    ...(minorPoiNeed ? [
      minorPoiNeed.anchorRef,
      ...minorPoiNeed.evidenceRefs,
    ] : []),
    ...(timePassageNeed ? timePassageNeed.evidenceRefs : []),
    ...(localObservationNeed ? [
      ...(localObservationNeed.targetRef ? [localObservationNeed.targetRef] : []),
      ...localObservationNeed.evidenceRefs,
    ] : []),
    ...(deviceObservationNeed ? [
      deviceObservationNeed.deviceRef,
      ...deviceObservationNeed.evidenceRefs,
    ] : []),
    ...(supportActorNeed ? supportActorNeed.evidenceRefs : []),
  ];
}

function deterministicBackendReceiptJudgment(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): JudgeUncertainty | null {
  const { frame, gmRead } = input;
  if (!typedPrimitiveNeedsBackendReceipt(input)) return null;

  const targetRefs = frameCitableRefs(frame, gmRead.actionInterpretation.targetRefs).slice(0, 16);
  const evidenceRefs = frameCitableRefs(frame, [
    frame.player.ref,
    frame.scene.currentScene.ref,
    frame.scene.currentLocation.ref,
    ...gmRead.focalRefs,
    ...gmRead.evidenceRefs,
    ...typedPrimitiveEvidenceRefs(input),
    ...targetRefs,
  ]).slice(0, 16);

  return {
    version: "judge-uncertainty.v1",
    judgmentId: `${gmRead.turnId}-backend-receipt-admission`,
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    frameId: frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: gmRead.path,
    },
    physicalPossibility: "possible",
    checkNeed: "backend_action_plan_needed",
    nextStep: "action_plan",
    actorRefs: frameCitableRefs(frame, [frame.player.ref]).slice(0, 16),
    targetRefs,
    evidenceRefs,
    possibilityRationale: "The accepted GM Read maps the player action to a supported backend-owned primitive.",
    checkRationale: "The primitive must be settled by backend receipt authority before narration.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "backend_receipt_required",
      explanation: "The accepted primitive needs a clean backend receipt before narration may answer.",
      evidenceRefs,
    },
  };
}

function branchIssues(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
}): JudgeUncertaintyValidationIssue[] {
  const issues: JudgeUncertaintyValidationIssue[] = [];
  const { frame, gmRead, judgment } = input;

  function add(path: string, message: string): void {
    issues.push({ code: "branch_invalid", path, message });
  }

  if (judgment.nextStep === "oracle_roll") {
    if (judgment.checkNeed !== "oracle_roll_needed") {
      add("checkNeed", "Oracle branch requires checkNeed=oracle_roll_needed.");
    }
    if (!["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)) {
      add("physicalPossibility", "Oracle branch requires a possible physical action.");
    }
    if (!judgment.difficulty) {
      add("difficulty", "Oracle branch requires difficulty.");
    }
    if (!judgment.oracleAdmission) {
      add("oracleAdmission", "Oracle branch requires oracleAdmission.");
    }
    if (judgment.noRollReason) {
      add("noRollReason", "Oracle branch must not include noRollReason.");
    }
    if (judgment.oracleAdmission) {
      issues.push(...subsetIssue({
        parent: judgment.actorRefs,
        child: [judgment.oracleAdmission.actorRef],
        path: "oracleAdmission.actorRef",
        message: "Oracle actorRef must be included in top-level actorRefs",
      }));
      issues.push(...subsetIssue({
        parent: judgment.targetRefs,
        child: judgment.oracleAdmission.targetRefs,
        path: "oracleAdmission.targetRefs",
        message: "Oracle targetRefs must be included in top-level targetRefs",
      }));
      issues.push(...subsetIssue({
        parent: judgment.evidenceRefs,
        child: judgment.oracleAdmission.evidenceRefs,
        path: "oracleAdmission.evidenceRefs",
        message: "Oracle evidenceRefs must be included in top-level evidenceRefs",
      }));
      issues.push(...oracleOutcomeMeaningIssues(judgment.oracleAdmission.outcomeMeanings).map((issue) => ({
        code: "forbidden_claim" as const,
        path: issue.path,
        message: issue.message,
      })));
    }
  } else {
    if (judgment.oracleAdmission) {
      add("oracleAdmission", "Non-Oracle branches must not include oracleAdmission.");
    }
    if (judgment.difficulty) {
      add("difficulty", "Non-Oracle branches must not include difficulty.");
    }
    if (!judgment.noRollReason) {
      add("noRollReason", "Non-Oracle branches require noRollReason.");
    }
  }

  if (judgment.physicalPossibility === "impossible") {
    if (judgment.nextStep !== "block_no_mutation" || judgment.checkNeed !== "blocked_impossible") {
      add("physicalPossibility", "Impossible actions must block with no mutation.");
    }
  }
  if (judgment.physicalPossibility === "underspecified") {
    if (judgment.nextStep !== "ask_clarification" || judgment.checkNeed !== "clarification_needed") {
      add("physicalPossibility", "Underspecified actions must ask clarification.");
    }
  }
  if (judgment.physicalPossibility === "unsupported_by_runtime") {
    const allowed =
      (judgment.nextStep === "block_no_mutation" && judgment.checkNeed === "blocked_unsupported")
      || (judgment.nextStep === "ask_clarification" && judgment.checkNeed === "clarification_needed");
    if (!allowed) {
      add("physicalPossibility", "Unsupported actions must block or ask clarification.");
    }
  }
  if (judgment.checkNeed === "backend_action_plan_needed" && judgment.nextStep !== "action_plan") {
    add("nextStep", "Backend action-plan need requires nextStep=action_plan.");
  }
  if (judgment.checkNeed === "no_roll_needed" && judgment.nextStep !== "settle_no_roll") {
    add("nextStep", "No-roll need requires nextStep=settle_no_roll.");
  }
  if (judgment.checkNeed === "combat_judge_needed" && judgment.nextStep !== "combat_boundary") {
    add("nextStep", "Combat need requires nextStep=combat_boundary.");
  }
  if (
    gmRead.path === "procedural"
    && hasAvailableBackendConsequenceCapability(frame)
    && ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
    && judgment.checkNeed === "no_roll_needed"
  ) {
    add(
      "checkNeed",
      "Procedural GM Read with available backend consequence capability requires backend_action_plan_needed unless a true Oracle or combat boundary is admitted.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "visible_actor_dialogue"
    && hasAllowedCapability(frame, "dialogue_record")
    && (
      gmRead.actionInterpretation.itemTransferNeed == null
      || hasAllowedCapability(frame, "item_transfer")
    )
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Visible actor dialogue requires backend_action_plan_needed so Stage 4 can record the speaker response before narration.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "movement_intent"
    && gmRead.actionInterpretation.targetRefs.some((targetRef) =>
      frame.movementOptions.some((option) => option.ref.toLowerCase() === targetRef.toLowerCase())
    )
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Movement to an exposed SceneFrame movement option requires backend_action_plan_needed so Stage 4 can issue the terminal movement receipt.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "route_inquiry"
    && gmRead.actionInterpretation.targetRefs.some((targetRef) =>
      frame.movementOptions.some((option) => option.ref.toLowerCase() === targetRef.toLowerCase())
    )
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Route inquiry for an exposed SceneFrame movement option requires backend_action_plan_needed so Stage 4 can issue the route-check receipt.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "ordinary_support_actor_needed"
    && ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
    && judgment.checkNeed === "no_roll_needed"
  ) {
    add(
      "checkNeed",
      "Ordinary support actor materialization requires backend_action_plan_needed so Stage 4 can issue a support actor receipt before narration.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "player_local_condition"
    && ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
    && judgment.checkNeed === "no_roll_needed"
  ) {
    add(
      "checkNeed",
      "Player local condition changes require backend_action_plan_needed so Stage 4 can issue a player local condition receipt before narration.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "item_transfer"
    && hasAllowedCapability(frame, "item_transfer")
    && gmRead.actionInterpretation.itemTransferNeed != null
    && !["impossible", "underspecified"].includes(judgment.physicalPossibility)
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Player item custody/location/equip-state transitions require backend_action_plan_needed so Stage 4 can issue an item transfer receipt before narration.",
    );
  }
  if (gmRead.actionInterpretation.interactionKind === "minor_poi_create") {
    const minorPoiCapability = frame.capabilities.some((capability) =>
      capability.capabilityId === "minor_poi_create" && capability.allowed
    );
    const minorPoiSurface = frame.currentScenePlaceHandleSurface ?? null;
    const placeKind = gmRead.actionInterpretation.minorPoiNeed?.placeKind ?? null;
    const surfaceAllowsKind = Boolean(
      minorPoiSurface
      && placeKind
      && minorPoiSurface.allowedPlaceKinds.includes(placeKind),
    );
    if (judgment.nextStep === "action_plan" && (!minorPoiCapability || !surfaceAllowsKind)) {
      add(
        "checkNeed",
        "Minor POI handle creation can be admitted only when the current SceneFrame exposes minor_poi_create and an allowed current-scene place-handle surface.",
      );
    }
    if (
      ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
      && judgment.checkNeed === "no_roll_needed"
    ) {
      add(
        "checkNeed",
        "Current-scene minor POI handle creation requires backend_action_plan_needed so Stage 4 can issue a minor POI handle receipt before narration.",
      );
    }
  }
  if (
    gmRead.actionInterpretation.interactionKind === "current_scene_observation"
    && gmRead.actionInterpretation.localObservationNeed != null
    && hasAllowedCapability(frame, "local_observation")
    && !["impossible", "underspecified"].includes(judgment.physicalPossibility)
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Targeted local observations require backend_action_plan_needed so Stage 4 can issue a local observation receipt before narration.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "device_status_observation"
    && gmRead.actionInterpretation.deviceObservationNeed != null
    && hasAllowedCapability(frame, "device_surface_observation")
    && !["impossible", "underspecified"].includes(judgment.physicalPossibility)
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Device surface observations require backend_action_plan_needed so Stage 4 can issue a device surface observation receipt before narration.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "scene_local_beat"
    && hasAllowedCapability(frame, "scene_beat_record")
    && !["impossible", "underspecified"].includes(judgment.physicalPossibility)
    && (judgment.nextStep !== "action_plan" || judgment.checkNeed !== "backend_action_plan_needed")
  ) {
    add(
      "checkNeed",
      "Current-scene local beats require backend_action_plan_needed so Stage 4 can issue a non-mutating scene beat receipt before narration.",
    );
  }
  if (
    judgment.checkNeed === "backend_action_plan_needed"
    && judgment.noRollReason?.code !== "backend_receipt_required"
  ) {
    add("noRollReason.code", "Backend action-plan admission requires noRollReason.code=backend_receipt_required.");
  }

  return issues;
}

export function validateJudgeUncertaintyCandidate(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  candidate: unknown;
}): { status: "accepted"; judgment: JudgeUncertainty; issues: [] } | {
  status: "rejected";
  issues: JudgeUncertaintyValidationIssue[];
} {
  const privateTerms = [
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ];
  const issues = [
    ...collectSettlementPayloadIssues(input.candidate),
    ...collectPrivateTermIssues(input.candidate, privateTerms),
  ];

  const parsed = judgeUncertaintySchema.safeParse(input.candidate);
  let parsedJudgment: JudgeUncertainty | null = null;
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(zodIssue));
  } else {
    parsedJudgment = parsed.data;
    issues.push(...linkageIssues({
      judgment: parsed.data,
      frame: input.frame,
      gmRead: input.gmRead,
    }));
    issues.push(...refValidationIssues(parsed.data, input.frame));
    issues.push(...branchIssues({
      frame: input.frame,
      gmRead: input.gmRead,
      judgment: parsed.data,
    }));
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  if (!parsedJudgment) {
    return {
      status: "rejected",
      issues: [{
        code: "schema_invalid",
        path: "<root>",
        message: "Judge/Uncertainty candidate did not parse.",
      }],
    };
  }
  return { status: "accepted", judgment: parsedJudgment, issues: [] };
}

function promptFrame(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    base: frame.base,
    player: frame.player,
    scene: frame.scene,
    actors: frame.actors,
    movementOptions: frame.movementOptions,
    targets: frame.targets,
    inventory: frame.inventory.map((item) => ({
      ref: item.ref,
      label: item.label,
      equipState: item.equipState,
    })),
    currentScenePlaceHandleSurface: frame.currentScenePlaceHandleSurface ?? null,
    capabilities: frame.capabilities,
    citableRefs: frame.citableRefs,
    forecast: {
      version: frame.forecast.version,
      advisoryOnly: frame.forecast.advisoryOnly,
      sourceStatus: frame.forecast.sourceStatus,
      mayAuthorizeMutation: frame.forecast.mayAuthorizeMutation,
      maySupportNarrationClaim: frame.forecast.maySupportNarrationClaim,
      entries: frame.forecast.entries.map((entry) => ({
        ref: entry.ref,
        horizonTicks: entry.horizonTicks,
        pressure: entry.pressure,
        confidence: entry.confidence,
        localRelevanceRefs: entry.localRelevanceRefs,
      })),
    },
    privateGuardSummary: {
      forbiddenActorLabelCount: frame.privateGuards.forbiddenActorLabels.length,
      forbiddenPrivateTermCount:
        frame.privateGuards.forbiddenPrivateTerms.length + frame.forecast.forbiddenPrivateTerms.length,
    },
  };
}

export function buildJudgeUncertaintySystemPrompt(): string {
  return [
    "You are the clean WorldForge Judge/Uncertainty admission layer.",
    "Return only a JSON object matching judge-uncertainty.v1.",
    "This layer decides physical possibility, check need, difficulty, stakes, and optional Oracle admission only.",
    "It must not narrate, mutate state, call tools, create checklist steps, emit receipts, roll dice, calculate chance, or choose an Oracle result.",
    "Accepted GM Read is the typed player-intent and interaction contract for this layer. Use it with SceneFrame capabilities and refs to choose admission.",
    "Keep possibilityRationale, checkRationale, noRollReason.explanation, difficulty.basis, and Oracle outcome meanings concise; each field must fit the final <=500 character packet contract.",
    "GM Read is interpretation context only. gm-read uncertain is a signal, not permission to roll.",
    "Use nextStep=oracle_roll only for true visible uncertainty that needs a random outcome before downstream consequences.",
    "Oracle outcome meanings may describe only the immediate visible attempt quality or visible reaction; they must not claim movement, arrival, discovery, item custody, condition changes, world facts, private knowledge, actor creation, or broad no-change.",
    "Use nextStep=action_plan for backend-owned consequences; do not include effect kinds, tool names, checklist steps, or payloads.",
    "When GM Read path is procedural and SceneFrame shows allowed receipt-required backend capabilities, do not use settle_no_roll; admit backend_action_plan_needed with noRollReason.code=backend_receipt_required unless a true Oracle roll or combat boundary is required.",
    "When GM Read actionInterpretation.interactionKind is visible_actor_dialogue, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the visible speaker response receipt.",
    "A visible_actor_dialogue with an allowed dialogue_record capability is runtime-supported; when it also carries itemTransferNeed and item_transfer is allowed, Stage 4 owns both receipts through action_plan.",
    "When GM Read actionInterpretation.interactionKind is movement_intent and targetRefs includes a SceneFrame.movementOptions ref, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns movement and clock mutation through a terminal movement receipt.",
    "When GM Read actionInterpretation.interactionKind is route_inquiry and targetRefs includes a SceneFrame.movementOptions ref, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the route-check receipt.",
    "When GM Read actionInterpretation.interactionKind is ordinary_support_actor_needed, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the support actor materialization receipt. Do not call Oracle for ordinary support actor availability.",
    "When GM Read actionInterpretation.interactionKind is player_local_condition, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the Player local condition receipt. Do not call Oracle for uncontested posture/readiness.",
    "When GM Read actionInterpretation.interactionKind is item_transfer, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the item transfer receipt. Do not call Oracle for ordinary uncontested give/drop/pickup/equip/unequip.",
    "When GM Read actionInterpretation.interactionKind is minor_poi_create and the SceneFrame exposes minor_poi_create plus currentScenePlaceHandleSurface for the requested kind, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the visible current-scene place-handle receipt. Do not call Oracle for ordinary public current-scene handle creation.",
    "If minor_poi_create is missing from SceneFrame.capabilities, currentScenePlaceHandleSurface is absent, or the requested placeKind is not allowed, block or ask clarification; do not admit action_plan.",
    "When GM Read actionInterpretation.interactionKind is current_scene_observation with localObservationNeed, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the local observation receipt. Do not call Oracle for targeted visible SceneFrame surface observations or bounded no-match over enumerated current-scene surfaces.",
    "When the observation asks whether harmless visible surface details matter as a clue, still use backend_action_plan_needed for the local observation receipt; do not call Oracle to create discovery/finds/hidden-meaning outcome text.",
    "When GM Read actionInterpretation.interactionKind is device_status_observation with deviceObservationNeed, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the device surface observation receipt. Do not call Oracle for checking modeled public device surface indicators or bounded no-surface results.",
    "When GM Read actionInterpretation.interactionKind is scene_local_beat, use backend_action_plan_needed with noRollReason.code=backend_receipt_required for possible current-scene low-stakes interactions; Stage 4 owns a non-mutating scene beat receipt.",
    "Every actorRefs, targetRefs, evidenceRefs, difficulty evidence ref, noRollReason evidence ref, and oracleAdmission ref must be copied exactly from SceneFrame.citableRefs.",
    "For non-Oracle branches, oracleAdmission and difficulty must be null and noRollReason must be present.",
    "For Oracle branches, include difficulty plus oracleAdmission with strong_hit, weak_hit, and miss meanings; do not include noRollReason.",
    "Forecast is advisory only. It cannot prove an outcome, authorize mutation, or authorize narration.",
    "Keep arrays short and omit all fields not defined by the schema.",
  ].join("\n");
}

export function buildJudgeUncertaintyPrompt(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): string {
  return [
    "Judge the accepted GM Read against this authoritative SceneFrame.",
    "Return judge-uncertainty.v1 JSON. Do not add extra fields.",
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrame(input.frame), null, 2),
    "Accepted GM Read:",
    JSON.stringify(input.gmRead, null, 2),
  ].join("\n\n");
}

async function generateJudgeUncertaintyCandidate(input: {
  provider: ProviderConfig;
  request: JudgeUncertaintyCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "judge", reasoningMode: "bypass" }),
    schema: judgeUncertaintyGenerationSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.1,
    maxOutputTokens: 1600,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

export async function runCleanJudgeUncertainty(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  provider: ProviderConfig;
  generateCandidate?: JudgeUncertaintyCandidateGenerator;
}): Promise<JudgeUncertaintyRunResult> {
  const deterministicJudgment = deterministicBackendReceiptJudgment({
    frame: input.frame,
    gmRead: input.gmRead,
  });
  if (deterministicJudgment) {
    const validation = validateJudgeUncertaintyCandidate({
      frame: input.frame,
      gmRead: input.gmRead,
      candidate: deterministicJudgment,
    });
    if (validation.status === "accepted") {
      return {
        status: "accepted",
        judgment: validation.judgment,
        issues: [],
        repairAttempted: false,
      };
    }
    throw new CleanJudgeUncertaintyValidationError(
      "Clean Judge/Uncertainty deterministic backend receipt admission failed validation.",
      validation.issues,
    );
  }

  const system = buildJudgeUncertaintySystemPrompt();
  const prompt = buildJudgeUncertaintyPrompt({
    frame: input.frame,
    gmRead: input.gmRead,
  });
  const generateCandidate =
    input.generateCandidate
    ?? ((request: JudgeUncertaintyCandidateRequest) => generateJudgeUncertaintyCandidate({
      provider: input.provider,
      request,
    }));

  let firstCandidate: unknown;
  try {
    firstCandidate = await generateCandidate({ system, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CleanJudgeUncertaintyGenerationError(
      `Clean Judge/Uncertainty generation failed before validation: ${message.slice(0, 300)}`,
      error,
    );
  }

  const firstCandidateForValidation = normalizeNullableBranchFields(firstCandidate);
  const firstValidation = validateJudgeUncertaintyCandidate({
    frame: input.frame,
    gmRead: input.gmRead,
    candidate: firstCandidateForValidation,
  });
  if (firstValidation.status === "accepted") {
    return {
      status: "accepted",
      judgment: firstValidation.judgment,
      issues: [],
      repairAttempted: false,
    };
  }

  throw new CleanJudgeUncertaintyValidationError(
    `Clean Judge/Uncertainty validation failed. ${judgeUncertaintyIssueSummary(firstValidation.issues)}`,
    firstValidation.issues,
  );
}
