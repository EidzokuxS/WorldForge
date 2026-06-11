import { z } from "zod";
import {
  assertGmActionChecklist,
  gmActionChecklistSchema,
  type AuthoritativeSceneFrame,
  type GameplayRuntimeCapabilityId,
  type GmActionChecklist,
  type GmActionChecklistEffectKind,
  type GmRead,
  type JudgeUncertainty,
} from "./contracts.js";

const FORBIDDEN_CHECKLIST_KEYS = new Set([
  "args",
  "candidateToolRequest",
  "chance",
  "input",
  "mutation",
  "narration",
  "narrativeText",
  "oracleResult",
  "payload",
  "plannedTools",
  "receipt",
  "receiptId",
  "receipts",
  "resultWorldVersion",
  "roll",
  "selectedOutcome",
  "settledTurnPacket",
  "stateDelta",
  "statePatch",
  "tool",
  "toolCall",
  "toolId",
  "toolInput",
  "toolName",
  "worldDelta",
]);

const NORMALIZED_FORBIDDEN_CHECKLIST_KEYS = new Set(
  [...FORBIDDEN_CHECKLIST_KEYS].map(normalizedKey),
);

const UUID_LIKE_REF = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const BACKEND_REF_PREFIX = /^(actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|receipt|route|scene|turn|world)[_:]/i;

export const EFFECT_TO_CAPABILITY: Record<GmActionChecklistEffectKind, GameplayRuntimeCapabilityId> = {
  observe_visible: "observe_visible",
  local_observation: "local_observation",
  route_options: "route_options",
  route_check: "route_check",
  movement: "movement",
  dialogue_record: "dialogue_record",
  world_fact_record: "world_fact_record",
  support_actor_create: "support_actor_create",
  entity_tag: "entity_tag",
  item_transfer: "item_transfer",
  condition_set: "condition_set",
  time_advance: "time_advance",
  quick_action_offer: "quick_action_offer",
  scene_beat_record: "scene_beat_record",
  location_reveal: "location_reveal",
  minor_poi_create: "minor_poi_create",
};

const CHECKLIST_STEP_IDS = ["step-1", "step-2", "step-3", "step-4", "step-5", "step-6"] as const;
type GmActionChecklistStepId = GmActionChecklist["steps"][number]["stepId"];

export interface GmActionChecklistValidationIssue {
  code:
    | "backend_ref"
    | "branch_mismatch"
    | "capability_mismatch"
    | "dependency_invalid"
    | "executable_payload"
    | "frame_mismatch"
    | "private_term"
    | "schema_invalid"
    | "step_invalid"
    | "uncited_ref"
    | "unadmitted_ref";
  path: string;
  message: string;
}

export interface GmActionChecklistAccepted {
  status: "accepted";
  checklist: GmActionChecklist;
  issues: [];
  repairAttempted: boolean;
}

export interface GmActionChecklistFallback {
  status: "fallback_no_mutation";
  checklist: null;
  issues: GmActionChecklistValidationIssue[];
  repairAttempted: boolean;
  fallbackReason: string;
}

export type GmActionChecklistRunResult =
  | GmActionChecklistAccepted
  | GmActionChecklistFallback;

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function lowerSet(values: readonly string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean));
}

function zodIssue(issue: z.core.$ZodIssue): GmActionChecklistValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

function collectForbiddenSurfaceIssues(value: unknown): GmActionChecklistValidationIssue[] {
  const issues: GmActionChecklistValidationIssue[] = [];

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;

    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      if (
        FORBIDDEN_CHECKLIST_KEYS.has(key)
        || NORMALIZED_FORBIDDEN_CHECKLIST_KEYS.has(normalizedKey(key))
      ) {
        issues.push({
          code: "executable_payload",
          path: childPath,
          message: "GM Action Checklist cannot carry executable, receipt, mutation, Oracle result, or narration fields.",
        });
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return issues;
}

function collectPrivateTermIssues(value: unknown, terms: readonly string[]): GmActionChecklistValidationIssue[] {
  const loweredTerms = uniqueStrings(terms)
    .map((term) => term.toLowerCase())
    .filter((term) => term.length > 0);
  if (loweredTerms.length === 0) return [];

  const issues: GmActionChecklistValidationIssue[] = [];

  function visit(node: unknown, path: string): void {
    if (typeof node === "string") {
      const lowered = node.toLowerCase();
      if (loweredTerms.some((term) => lowered.includes(term))) {
        issues.push({
          code: "private_term",
          path: path || "<root>",
          message: "GM Action Checklist public fields cannot leak private frame guard terms.",
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((entry, index) => visit(entry, `${path}[${index}]`));
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

function eligibleBranchIssues(input: {
  gmRead: GmRead;
  judgment: JudgeUncertainty;
}): GmActionChecklistValidationIssue[] {
  const issues: GmActionChecklistValidationIssue[] = [];
  if (input.judgment.nextStep !== "action_plan") {
    issues.push({
      code: "branch_mismatch",
      path: "judgment.nextStep",
      message: "GM Action Checklist requires Judge nextStep=action_plan.",
    });
  }
  if (input.judgment.checkNeed !== "backend_action_plan_needed") {
    issues.push({
      code: "branch_mismatch",
      path: "judgment.checkNeed",
      message: "GM Action Checklist requires Judge checkNeed=backend_action_plan_needed.",
    });
  }
  if (input.judgment.noRollReason?.code !== "backend_receipt_required") {
    issues.push({
      code: "branch_mismatch",
      path: "judgment.noRollReason.code",
      message: "GM Action Checklist requires Judge noRollReason.code=backend_receipt_required.",
    });
  }
  if (input.judgment.oracleAdmission !== null) {
    issues.push({
      code: "branch_mismatch",
      path: "judgment.oracleAdmission",
      message: "GM Action Checklist v1 does not run after Oracle admission.",
    });
  }
  if (input.judgment.source.gmReadPath !== input.gmRead.path) {
    issues.push({
      code: "branch_mismatch",
      path: "judgment.source.gmReadPath",
      message: "Judge source GM Read path must match the accepted GM Read.",
    });
  }
  return issues;
}

function linkageIssues(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  checklist: GmActionChecklist;
}): GmActionChecklistValidationIssue[] {
  const issues: GmActionChecklistValidationIssue[] = [];
  const { frame, gmRead, judgment, checklist } = input;
  if (checklist.campaignId !== frame.campaignId) {
    issues.push({ code: "frame_mismatch", path: "campaignId", message: "Checklist campaignId must match SceneFrame." });
  }
  if (checklist.turnId !== frame.turnId) {
    issues.push({ code: "frame_mismatch", path: "turnId", message: "Checklist turnId must match SceneFrame." });
  }
  if (checklist.frameId !== frame.frameId) {
    issues.push({ code: "frame_mismatch", path: "frameId", message: "Checklist frameId must match SceneFrame." });
  }
  if (
    checklist.base.tick !== frame.base.tick
    || checklist.base.worldVersion !== frame.base.worldVersion
    || checklist.base.worldTimeMinutes !== frame.base.worldTimeMinutes
  ) {
    issues.push({ code: "frame_mismatch", path: "base", message: "Checklist base clock must match SceneFrame." });
  }
  if (checklist.source.gmReadPath !== gmRead.path || checklist.source.gmReadPath !== judgment.source.gmReadPath) {
    issues.push({ code: "branch_mismatch", path: "source.gmReadPath", message: "Checklist source GM Read path must match GM Read and Judge." });
  }
  if (checklist.source.judgmentId !== judgment.judgmentId) {
    issues.push({ code: "branch_mismatch", path: "source.judgmentId", message: "Checklist judgmentId must match Judge." });
  }
  return issues;
}

function refIssues(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  checklist: GmActionChecklist;
}): GmActionChecklistValidationIssue[] {
  const citable = lowerSet(input.frame.citableRefs);
  const admitted = admittedRefSet(input);
  const issues: GmActionChecklistValidationIssue[] = [];
  const refs = uniqueStrings(input.checklist.steps.flatMap((step) => [
    step.actorRef,
    ...step.targetRefs,
    ...step.evidenceRefs,
    ...step.expectedVisibleEffect.visibleRefs,
    ...(step.intended.localConditionPlan
      ? [
          step.intended.localConditionPlan.anchorRef,
          ...(step.intended.localConditionPlan.targetRef ? [step.intended.localConditionPlan.targetRef] : []),
        ]
      : []),
  ]));

  for (const ref of refs) {
    const lowered = ref.toLowerCase();
    if (!citable.has(lowered)) {
      issues.push({
        code: "uncited_ref",
        path: "steps.refs",
        message: `Checklist cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (!admitted.has(lowered)) {
      issues.push({
        code: "unadmitted_ref",
        path: "steps.refs",
        message: `Checklist cited ref "${ref}" outside GM Read/Judge admitted refs.`,
      });
    }
    if (UUID_LIKE_REF.test(ref) || BACKEND_REF_PREFIX.test(ref)) {
      issues.push({
        code: "backend_ref",
        path: "steps.refs",
        message: `Checklist cited backend-only ref "${ref}" instead of a model-safe citable ref.`,
      });
    }
  }

  return issues;
}

function capabilityIssues(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
}): GmActionChecklistValidationIssue[] {
  const allowed = new Set(
    input.frame.capabilities
      .filter((capability) => capability.allowed)
      .map((capability) => capability.capabilityId),
  );
  const issues: GmActionChecklistValidationIssue[] = [];
  input.checklist.steps.forEach((step, index) => {
    const expected = EFFECT_TO_CAPABILITY[step.intended.kind];
    if (step.intended.requiredCapabilityId !== expected) {
      issues.push({
        code: "capability_mismatch",
        path: `steps.${index}.intended.requiredCapabilityId`,
        message: `Effect kind ${step.intended.kind} requires capability ${expected}.`,
      });
    }
    if (!allowed.has(step.intended.requiredCapabilityId)) {
      issues.push({
        code: "capability_mismatch",
        path: `steps.${index}.intended.requiredCapabilityId`,
        message: `Capability ${step.intended.requiredCapabilityId} is not allowed in the SceneFrame.`,
      });
    }
  });
  return issues;
}

function stepShapeIssues(checklist: GmActionChecklist, frame: AuthoritativeSceneFrame): GmActionChecklistValidationIssue[] {
  const issues: GmActionChecklistValidationIssue[] = [];
  const seenIds = new Set<string>();
  const seenEffects = new Set<string>();
  let stage4RequiredCount = 0;

  checklist.steps.forEach((step, index) => {
    const expectedId = `step-${index + 1}`;
    if (step.stepId !== expectedId) {
      issues.push({
        code: "step_invalid",
        path: `steps.${index}.stepId`,
        message: `Checklist step ids must be contiguous; expected ${expectedId}.`,
      });
    }
    if (seenIds.has(step.stepId)) {
      issues.push({
        code: "step_invalid",
        path: `steps.${index}.stepId`,
        message: "Checklist step ids cannot repeat.",
      });
    }
    seenIds.add(step.stepId);
    if (seenEffects.has(step.intended.kind)) {
      issues.push({
        code: "step_invalid",
        path: `steps.${index}.intended.kind`,
        message: "Checklist cannot duplicate intended effect kinds.",
      });
    }
    seenEffects.add(step.intended.kind);
    if (step.intended.kind === "condition_set") {
      if (!step.intended.localConditionPlan) {
        issues.push({
          code: "step_invalid",
          path: `steps.${index}.intended.localConditionPlan`,
          message: "condition_set steps require a typed localConditionPlan.",
        });
      }
      const planTargetRef = step.intended.localConditionPlan?.targetRef ?? null;
      if (planTargetRef && !step.targetRefs.some((ref) => ref.toLowerCase() === planTargetRef.toLowerCase())) {
        issues.push({
          code: "step_invalid",
          path: `steps.${index}.intended.localConditionPlan.targetRef`,
          message: "condition_set localConditionPlan.targetRef must be included in step.targetRefs.",
        });
      }
    } else if (step.intended.localConditionPlan) {
      issues.push({
        code: "step_invalid",
        path: `steps.${index}.intended.localConditionPlan`,
        message: "localConditionPlan is allowed only on condition_set steps.",
      });
    }
    if (step.intended.kind === "item_transfer") {
      if (!step.intended.itemTransferPlan) {
        issues.push({
          code: "step_invalid",
          path: `steps.${index}.intended.itemTransferPlan`,
          message: "item_transfer steps require a typed itemTransferPlan.",
        });
      }
      const plan = step.intended.itemTransferPlan;
      if (plan) {
        const plannedRefs = [plan.itemRef, plan.targetRef, plan.anchorRef].map((ref) => ref.toLowerCase());
        const stepRefs = [...step.targetRefs, ...step.evidenceRefs].map((ref) => ref.toLowerCase());
        for (const ref of plannedRefs) {
          if (!stepRefs.includes(ref)) {
            issues.push({
              code: "step_invalid",
              path: `steps.${index}.intended.itemTransferPlan`,
              message: "itemTransferPlan refs must be included in step target/evidence refs.",
            });
            break;
          }
        }
      }
    } else if (step.intended.itemTransferPlan) {
      issues.push({
        code: "step_invalid",
        path: `steps.${index}.intended.itemTransferPlan`,
        message: "itemTransferPlan is allowed only on item_transfer steps.",
      });
    }
    if (step.intended.kind === "local_observation") {
      if (!step.intended.localObservationPlan) {
        issues.push({
          code: "step_invalid",
          path: `steps.${index}.intended.localObservationPlan`,
          message: "local_observation steps require a typed localObservationPlan.",
        });
      }
      const plan = step.intended.localObservationPlan;
      if (plan) {
        const plannedRefs = [plan.targetRef, plan.anchorRef]
          .filter((ref): ref is string => Boolean(ref))
          .map((ref) => ref.toLowerCase());
        const stepRefs = [...step.targetRefs, ...step.evidenceRefs].map((ref) => ref.toLowerCase());
        for (const ref of plannedRefs) {
          if (!stepRefs.includes(ref)) {
            issues.push({
              code: "step_invalid",
              path: `steps.${index}.intended.localObservationPlan`,
              message: "localObservationPlan refs must be included in step target/evidence refs.",
            });
            break;
          }
        }
      }
    } else if (step.intended.localObservationPlan) {
      issues.push({
        code: "step_invalid",
        path: `steps.${index}.intended.localObservationPlan`,
        message: "localObservationPlan is allowed only on local_observation steps.",
      });
    }
    if (step.disposition.kind === "stage4_backend_resolution_required") {
      stage4RequiredCount += 1;
    }
    const dependencySet = new Set<string>();
    for (const dependency of step.dependsOnStepIds) {
      const dependencyNumber = Number(dependency.replace("step-", ""));
      if (dependencyNumber >= index + 1) {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependsOnStepIds`,
          message: "Checklist dependencies may reference only earlier steps.",
        });
      }
      if (dependencySet.has(dependency)) {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependsOnStepIds`,
          message: "Checklist dependencies cannot repeat.",
        });
      }
      dependencySet.add(dependency);
      const dependencyStep = checklist.steps.find((candidate) => candidate.stepId === dependency);
      if (dependencyStep?.disposition.kind !== "stage4_backend_resolution_required") {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependsOnStepIds`,
          message: "Checklist dependencies must point to non-skipped earlier steps.",
        });
      }
    }
    const bindingIds = new Set<string>();
    for (const binding of step.dependencyBindings ?? []) {
      if (step.intended.kind !== "dialogue_record") {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependencyBindings`,
          message: "Only dialogue_record steps may bind post-dependency SceneFrame requirements.",
        });
      }
      if (bindingIds.has(binding.bindingId)) {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependencyBindings`,
          message: "Checklist dependency binding ids cannot repeat on one step.",
        });
      }
      bindingIds.add(binding.bindingId);
      if (!step.dependsOnStepIds.includes(binding.fromStepId)) {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependencyBindings`,
          message: "Dependency bindings must cite a step listed in dependsOnStepIds.",
        });
      }
      const dependencyNumber = Number(binding.fromStepId.replace("step-", ""));
      if (dependencyNumber >= index + 1) {
        issues.push({
          code: "dependency_invalid",
          path: `steps.${index}.dependencyBindings`,
          message: "Dependency bindings may reference only earlier steps.",
        });
      }
      const dependencyStep = checklist.steps.find((candidate) => candidate.stepId === binding.fromStepId);
      if (binding.bindingId === "materialized_speaker") {
        if (
          dependencyStep?.intended.kind !== "support_actor_create"
          || dependencyStep.intended.requiredCapabilityId !== "support_actor_create"
        ) {
          issues.push({
            code: "dependency_invalid",
            path: `steps.${index}.dependencyBindings`,
            message: "materialized_speaker bindings must depend on an earlier support_actor_create step.",
          });
        }
      } else if (binding.bindingId === "player_local_condition") {
        if (
          dependencyStep?.intended.kind !== "condition_set"
          || dependencyStep.intended.requiredCapabilityId !== "condition_set"
        ) {
          issues.push({
            code: "dependency_invalid",
            path: `steps.${index}.dependencyBindings`,
            message: "player_local_condition bindings must depend on an earlier condition_set step.",
          });
        }
      } else if (binding.bindingId === "item_transfer_state") {
        if (
          dependencyStep?.intended.kind !== "item_transfer"
          || dependencyStep.intended.requiredCapabilityId !== "item_transfer"
        ) {
          issues.push({
            code: "dependency_invalid",
            path: `steps.${index}.dependencyBindings`,
            message: "item_transfer_state bindings must depend on an earlier item_transfer step.",
          });
        }
      }
    }
  });

  if (stage4RequiredCount === 0) {
    issues.push({
      code: "step_invalid",
      path: "steps",
      message: "Checklist must include at least one Stage 4 backend resolution step.",
    });
  }

  checklist.steps.forEach((step, index) => {
    if (step.intended.kind !== "movement") return;
    const disconnectedTargets = step.targetRefs.filter((targetRef) => {
      const option = frame.movementOptions.find((candidate) =>
        candidate.ref.toLowerCase() === targetRef.toLowerCase()
      );
      return option && !option.connected;
    });
    if (disconnectedTargets.length === 0) return;
    const priorRouteCheck = step.dependsOnStepIds
      .map((dependency) => checklist.steps.find((candidate) => candidate.stepId === dependency))
      .some((dependencyStep) =>
        dependencyStep?.intended.kind === "route_check"
        && dependencyStep.targetRefs.some((targetRef) =>
          disconnectedTargets.some((disconnected) =>
            disconnected.toLowerCase() === targetRef.toLowerCase()
          )
        )
      );
    if (!priorRouteCheck) {
      issues.push({
        code: "dependency_invalid",
        path: `steps.${index}.dependsOnStepIds`,
        message: "Movement to a disconnected movement option must depend on an earlier route_check for the same target.",
      });
    }
  });

  return issues;
}

export function validateGmActionChecklistCandidate(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  candidate: unknown;
}): { status: "accepted"; checklist: GmActionChecklist; issues: [] } | {
  status: "rejected";
  issues: GmActionChecklistValidationIssue[];
} {
  const privateTerms = [
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ];
  const issues = [
    ...eligibleBranchIssues(input),
    ...collectForbiddenSurfaceIssues(input.candidate),
    ...collectPrivateTermIssues(input.candidate, privateTerms),
  ];
  const parsed = gmActionChecklistSchema.safeParse(input.candidate);
  let checklist: GmActionChecklist | null = null;
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(zodIssue));
  } else {
    checklist = parsed.data;
    issues.push(...linkageIssues({ ...input, checklist }));
    issues.push(...refIssues({ ...input, checklist }));
    issues.push(...capabilityIssues({ frame: input.frame, checklist }));
    issues.push(...stepShapeIssues(checklist, input.frame));
  }

  if (issues.length > 0 || !checklist) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", checklist, issues: [] };
}

function implicitFrameAnchorRefs(frame: AuthoritativeSceneFrame): string[] {
  return uniqueStrings([
    frame.player.ref,
    frame.scene.currentScene.ref,
    frame.scene.currentLocation.ref,
  ]);
}

function admittedRefSet(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
}): Set<string> {
  return lowerSet([
    ...implicitFrameAnchorRefs(input.frame),
    ...input.gmRead.focalRefs,
    ...input.gmRead.evidenceRefs,
    ...input.gmRead.actionInterpretation.targetRefs,
    ...(input.gmRead.actionInterpretation.localConditionNeed?.evidenceRefs ?? []),
    ...(input.gmRead.actionInterpretation.localConditionNeed?.targetRef
      ? [input.gmRead.actionInterpretation.localConditionNeed.targetRef]
      : []),
    ...(input.gmRead.actionInterpretation.itemTransferNeed
      ? [
        input.gmRead.actionInterpretation.itemTransferNeed.itemRef,
        input.gmRead.actionInterpretation.itemTransferNeed.targetRef,
        ...input.gmRead.actionInterpretation.itemTransferNeed.evidenceRefs,
      ]
      : []),
    ...(input.gmRead.actionInterpretation.localObservationNeed
      ? [
        ...(input.gmRead.actionInterpretation.localObservationNeed.targetRef
          ? [input.gmRead.actionInterpretation.localObservationNeed.targetRef]
          : []),
        ...input.gmRead.actionInterpretation.localObservationNeed.evidenceRefs,
      ]
      : []),
    ...input.judgment.actorRefs,
    ...input.judgment.targetRefs,
    ...input.judgment.evidenceRefs,
    ...(input.judgment.noRollReason?.evidenceRefs ?? []),
  ]);
}

function firstUsableRef(input: {
  candidates: readonly string[];
  citable: Set<string>;
  admitted: Set<string>;
}): string | null {
  for (const ref of input.candidates) {
    const lowered = ref.toLowerCase();
    if (input.citable.has(lowered) && input.admitted.has(lowered)) {
      return ref;
    }
  }
  return null;
}

function allowedCapabilities(frame: AuthoritativeSceneFrame): Set<GameplayRuntimeCapabilityId> {
  return new Set(
    frame.capabilities
      .filter((capability) => capability.allowed)
      .map((capability) => capability.capabilityId),
  );
}

function playerActionText(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
}): string {
  return [
    input.frame.playerAction,
    input.gmRead.actionInterpretation.playerIntent,
    input.gmRead.actionInterpretation.summary,
    input.gmRead.liveSceneQuestion,
  ].join(" ").toLowerCase();
}

function wantsRouteOptions(text: string): boolean {
  return /\b(where can i go|where to go|available routes|route options|exits|paths|ways out|directions)\b/u.test(text)
    || /(?:куда|выход|выходы|маршрут|маршруты|пути|дорог[аи])/.test(text);
}

function wantsVisibleObservation(text: string): boolean {
  return /\b(look around|look|observe|scan|inspect|examine|listen|take stock|what do i see|who is here|what is visible)\b/u.test(text)
    || /(?:осмотр|осмотреть|смотрю|огляд|оглядеться|наблюда|слуша|кто здесь|что видно)/.test(text);
}

function wantsExplicitWait(text: string): boolean {
  return /\b(wait|rest|watch|pass time|stand by|stay here|pause)\b/u.test(text)
    || /(?:жду|подожд|отдых|стою|остаюсь|пауза)/.test(text);
}

function stepFor(input: {
  index: number;
  kind: GmActionChecklistEffectKind;
  actorRef: string;
  targetRefs: readonly string[];
  evidenceRefs: readonly string[];
  dependsOnStepIds?: readonly GmActionChecklistStepId[];
  dependencyBindings?: ReadonlyArray<NonNullable<GmActionChecklist["steps"][number]["dependencyBindings"]>[number]>;
  localConditionPlan?: NonNullable<GmActionChecklist["steps"][number]["intended"]["localConditionPlan"]>;
  itemTransferPlan?: NonNullable<GmActionChecklist["steps"][number]["intended"]["itemTransferPlan"]>;
  localObservationPlan?: NonNullable<GmActionChecklist["steps"][number]["intended"]["localObservationPlan"]>;
  purpose?: string;
  intendedSummary?: string;
  expectedVisibleSummary?: string;
}): GmActionChecklist["steps"][number] {
  const visibleRefs = uniqueStrings([input.actorRef, ...input.targetRefs]);
  const capability = EFFECT_TO_CAPABILITY[input.kind];
  const intended: GmActionChecklist["steps"][number]["intended"] = {
    kind: input.kind,
    stateOrEvidence: input.kind === "movement"
      || input.kind === "time_advance"
      || input.kind === "support_actor_create"
      || input.kind === "condition_set"
      || input.kind === "item_transfer"
      ? "state"
      : input.kind === "dialogue_record"
        ? "terminal_player_visible"
        : "evidence",
    requiredCapabilityId: capability,
    summary: input.intendedSummary ?? `Stage 4 must resolve ${input.kind} before any world-state claim is accepted.`,
  };
  if (input.localConditionPlan) {
    intended.localConditionPlan = input.localConditionPlan;
  }
  if (input.itemTransferPlan) {
    intended.itemTransferPlan = input.itemTransferPlan;
  }
  if (input.localObservationPlan) {
    intended.localObservationPlan = input.localObservationPlan;
  }
  const step: GmActionChecklist["steps"][number] = {
    stepId: CHECKLIST_STEP_IDS[input.index - 1] ?? "step-6",
    purpose: input.purpose ?? `Plan ${input.kind} for later backend resolution.`,
    actorRef: input.actorRef,
    targetRefs: uniqueStrings(input.targetRefs),
    evidenceRefs: uniqueStrings(input.evidenceRefs),
    intended,
    disposition: {
      kind: "stage4_backend_resolution_required",
      reason: `${capability} requires later backend receipt authority.`,
    },
    dependsOnStepIds: [...(input.dependsOnStepIds ?? [])],
    expectedVisibleEffect: {
      summary: input.expectedVisibleSummary ?? `${input.kind} may become visible only if later execution accepts it.`,
      visibleRefs,
    },
  };
  if (input.dependencyBindings && input.dependencyBindings.length > 0) {
    step.dependencyBindings = [...input.dependencyBindings];
  }
  return step;
}

export function buildDeterministicGmActionChecklist(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  checklistId: string;
}): GmActionChecklist {
  const citable = lowerSet(input.frame.citableRefs);
  const admitted = admittedRefSet(input);
  const allowed = allowedCapabilities(input.frame);
  const actorRef = firstUsableRef({
    candidates: [input.frame.player.ref, ...input.judgment.actorRefs, ...input.gmRead.focalRefs],
    citable,
    admitted,
  }) ?? input.frame.player.ref;
  const evidenceRefs = uniqueStrings([
    actorRef,
    ...input.gmRead.evidenceRefs,
    ...input.judgment.evidenceRefs,
    ...(input.judgment.noRollReason?.evidenceRefs ?? []),
  ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
  const sceneRef = firstUsableRef({
    candidates: [
      input.frame.scene.currentScene.ref,
      input.frame.scene.currentLocation.ref,
    ],
    citable,
    admitted,
  });
  const steps: GmActionChecklist["steps"] = [];
  const movementTarget = input.gmRead.actionInterpretation.targetRefs
    .map((targetRef) => input.frame.movementOptions.find((option) =>
      option.ref.toLowerCase() === targetRef.toLowerCase()
    ))
    .find((option) => option && citable.has(option.ref.toLowerCase()) && admitted.has(option.ref.toLowerCase()));
  const dialogueSpeaker = input.gmRead.actionInterpretation.interactionKind === "visible_actor_dialogue"
    ? input.gmRead.actionInterpretation.targetRefs
      .map((targetRef) => input.frame.actors.find((actor) =>
        actor.role !== "player"
        && actor.ref.toLowerCase() === targetRef.toLowerCase()
        && citable.has(actor.ref.toLowerCase())
        && admitted.has(actor.ref.toLowerCase())
      ))
      .find((actor) => Boolean(actor)) ?? null
    : null;
  const supportActorNeed = input.gmRead.actionInterpretation.interactionKind === "ordinary_support_actor_needed"
    ? input.gmRead.actionInterpretation.supportActorNeed
    : null;
  const localConditionNeed = input.gmRead.actionInterpretation.localConditionNeed ?? null;
  const itemTransferNeed = input.gmRead.actionInterpretation.itemTransferNeed ?? null;
  const localObservationNeed = input.gmRead.actionInterpretation.interactionKind === "current_scene_observation"
    ? input.gmRead.actionInterpretation.localObservationNeed ?? null
    : null;
  const actionText = playerActionText(input);

  let localConditionStepId: GmActionChecklistStepId | null = null;
  let itemTransferStepId: GmActionChecklistStepId | null = null;
  if (allowed.has("condition_set") && sceneRef && localConditionNeed) {
    const targetRefs = uniqueStrings([
      localConditionNeed.targetRef ?? sceneRef,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    const conditionEvidenceRefs = uniqueStrings([
      actorRef,
      sceneRef,
      input.frame.scene.currentLocation.ref,
      ...(localConditionNeed.targetRef ? [localConditionNeed.targetRef] : []),
      ...localConditionNeed.evidenceRefs,
      ...evidenceRefs,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    steps.push(stepFor({
      index: steps.length + 1,
      kind: "condition_set",
      actorRef,
      targetRefs: targetRefs.length > 0 ? targetRefs : [sceneRef],
      evidenceRefs: conditionEvidenceRefs,
      localConditionPlan: {
        actorRef: "Player",
        operation: localConditionNeed.operation,
        conditionKey: localConditionNeed.conditionKey,
        conditionScope: "current_scene",
        anchorRef: sceneRef,
        targetKind: localConditionNeed.targetKind,
        targetRef: localConditionNeed.targetRef,
        replacementPolicy: localConditionNeed.operation === "apply"
          ? "replace_same_condition_group"
          : "no_replacement",
      },
      purpose: `Plan Player current-scene local condition ${localConditionNeed.operation}:${localConditionNeed.conditionKey}.`,
      intendedSummary: `Stage 4 must settle the Player's current-scene local posture/readiness condition ${localConditionNeed.conditionKey} before narration may state it as completed. This does not authorize HP, movement, item transfer/equip, cover effectiveness, stealth, world facts, or NPC reactions.`,
      expectedVisibleSummary: `If accepted, Player local condition ${localConditionNeed.conditionKey} may be visible in the current scene only.`,
    }));
    localConditionStepId = steps[steps.length - 1]?.stepId ?? null;
  }

  if (allowed.has("item_transfer") && sceneRef && itemTransferNeed) {
    const targetRefs = uniqueStrings([
      itemTransferNeed.itemRef,
      itemTransferNeed.targetRef,
      sceneRef,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    const itemEvidenceRefs = uniqueStrings([
      actorRef,
      itemTransferNeed.itemRef,
      itemTransferNeed.targetRef,
      sceneRef,
      input.frame.scene.currentLocation.ref,
      ...itemTransferNeed.evidenceRefs,
      ...evidenceRefs,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    const targetEquipState = itemTransferNeed.operation === "equip_inventory_item" ? "equipped" : "carried";
    const targetEquippedSlot = itemTransferNeed.operation === "equip_inventory_item" ? "equipped" : null;
    steps.push(stepFor({
      index: steps.length + 1,
      kind: "item_transfer",
      actorRef,
      targetRefs: targetRefs.length > 0 ? targetRefs : [itemTransferNeed.itemRef, itemTransferNeed.targetRef],
      evidenceRefs: itemEvidenceRefs,
      itemTransferPlan: {
        actorRef: "Player",
        operation: itemTransferNeed.operation,
        itemRef: itemTransferNeed.itemRef,
        sourceKind: itemTransferNeed.sourceKind,
        targetKind: itemTransferNeed.targetKind,
        targetRef: itemTransferNeed.targetRef,
        targetEquipState,
        targetEquippedSlot,
        anchorRef: sceneRef,
      },
      purpose: `Plan Player item transition ${itemTransferNeed.operation} for ${itemTransferNeed.requestedItemText}.`,
      intendedSummary: `Stage 4 must settle one Player item custody/location/equip-state transition (${itemTransferNeed.operation}) before narration may claim item state changed. This does not authorize item discovery, inspection, use, consent, dialogue, world facts, routes, HP/conditions, absence, or no-change.`,
      expectedVisibleSummary: `If accepted, final item custody/location/equip state for ${itemTransferNeed.itemRef} may be visible only through the item_transfer receipt.`,
    }));
    itemTransferStepId = steps[steps.length - 1]?.stepId ?? null;
  }

  if (allowed.has("local_observation") && sceneRef && localObservationNeed) {
    const localTargetRefs = uniqueStrings([
      localObservationNeed.targetRef ?? sceneRef,
      sceneRef,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    const localEvidenceRefs = uniqueStrings([
      actorRef,
      sceneRef,
      input.frame.scene.currentLocation.ref,
      ...(localObservationNeed.targetRef ? [localObservationNeed.targetRef] : []),
      ...localObservationNeed.evidenceRefs,
      ...evidenceRefs,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    steps.push(stepFor({
      index: steps.length + 1,
      kind: "local_observation",
      actorRef,
      targetRefs: localTargetRefs.length > 0 ? localTargetRefs : [sceneRef],
      evidenceRefs: localEvidenceRefs,
      localObservationPlan: {
        actorRef: "Player",
        mode: localObservationNeed.mode,
        queryText: localObservationNeed.queryText,
        targetRef: localObservationNeed.targetRef,
        surfaceKinds: localObservationNeed.surfaceKinds,
        allowBoundedNegative: localObservationNeed.allowBoundedNegative,
        anchorRef: sceneRef,
      },
      purpose: `Plan bounded current-scene local observation for ${localObservationNeed.queryText}.`,
      intendedSummary: `Stage 4 must settle a read-only local observation over enumerated current SceneFrame surfaces before narration may claim the result. This does not authorize hidden discovery, broad absence, item use, device status, route truth, world facts, mutation, or dialogue.`,
      expectedVisibleSummary: `If accepted, local observation may describe only matching exposed current-scene surface entries for ${localObservationNeed.queryText}.`,
    }));
  }

  if (movementTarget && allowed.has("movement")) {
    if (!movementTarget.connected && allowed.has("route_check")) {
      steps.push(stepFor({
        index: steps.length + 1,
        kind: "route_check",
        actorRef,
        targetRefs: [movementTarget.ref],
        evidenceRefs: uniqueStrings([actorRef, movementTarget.ref, ...evidenceRefs]),
      }));
    }
    steps.push(stepFor({
      index: steps.length + 1,
      kind: "movement",
      actorRef,
      targetRefs: [movementTarget.ref],
      evidenceRefs: uniqueStrings([actorRef, movementTarget.ref, ...evidenceRefs]),
      dependsOnStepIds: movementTarget.connected ? [] : steps.map((step) => step.stepId),
    }));
  } else if (allowed.has("route_options") && sceneRef && wantsRouteOptions(actionText)) {
    steps.push(stepFor({
      index: 1,
      kind: "route_options",
      actorRef,
      targetRefs: [sceneRef],
      evidenceRefs: uniqueStrings([actorRef, sceneRef, ...evidenceRefs]),
    }));
  } else if (allowed.has("time_advance") && sceneRef && wantsExplicitWait(actionText)) {
    steps.push(stepFor({
      index: 1,
      kind: "time_advance",
      actorRef,
      targetRefs: [sceneRef],
      evidenceRefs: uniqueStrings([actorRef, sceneRef, ...evidenceRefs]),
    }));
  } else if (allowed.has("dialogue_record") && dialogueSpeaker) {
    const dialogueStepInput: Parameters<typeof stepFor>[0] = {
      index: steps.length + 1,
      kind: "dialogue_record",
      actorRef,
      targetRefs: [dialogueSpeaker.ref],
      evidenceRefs: uniqueStrings([actorRef, dialogueSpeaker.ref, sceneRef ?? input.frame.scene.currentScene.ref, ...evidenceRefs]),
    };
    const dependsOnStepIds: GmActionChecklistStepId[] = [];
    const dependencyBindings: NonNullable<GmActionChecklist["steps"][number]["dependencyBindings"]> = [];
    if (localConditionStepId) {
      dependsOnStepIds.push(localConditionStepId);
      dependencyBindings.push({
        bindingId: "player_local_condition",
        fromStepId: localConditionStepId,
        requiredCapabilityId: "condition_set",
        requiredReceiptAuthority: "player_local_condition_receipt",
        sourcePath: "publicResult.condition.conditionKey",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "player_visibleStatus.conditions",
      });
    }
    if (itemTransferStepId) {
      dependsOnStepIds.push(itemTransferStepId);
      dependencyBindings.push({
        bindingId: "item_transfer_state",
        fromStepId: itemTransferStepId,
        requiredCapabilityId: "item_transfer",
        requiredReceiptAuthority: "item_transfer_receipt",
        sourcePath: "publicResult.itemTransfer",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "item_state_reconciled",
      });
    }
    if (dependencyBindings.length > 0) {
      dialogueStepInput.dependsOnStepIds = dependsOnStepIds;
      dialogueStepInput.dependencyBindings = dependencyBindings;
      dialogueStepInput.purpose = "Record one visible response only after prior state-bearing steps are settled and the SceneFrame is refreshed.";
      dialogueStepInput.intendedSummary = "Stage 4 may record dialogue only after post-dependency authoritative SceneFrame refresh reflects accepted Player local condition or item state requirements.";
    }
    steps.push(stepFor(dialogueStepInput));
  } else if (allowed.has("support_actor_create") && sceneRef && supportActorNeed) {
    const supportEvidenceRefs = uniqueStrings([
      actorRef,
      sceneRef,
      input.frame.scene.currentLocation.ref,
      ...supportActorNeed.evidenceRefs,
      ...evidenceRefs,
    ]).filter((ref) => citable.has(ref.toLowerCase()) && admitted.has(ref.toLowerCase()));
    steps.push(stepFor({
      index: 1,
      kind: "support_actor_create",
      actorRef,
      targetRefs: [sceneRef],
      evidenceRefs: supportEvidenceRefs,
      purpose: `Plan ordinary current-scene support actor materialization for ${supportActorNeed.roleKind}.`,
      intendedSummary: `Stage 4 may materialize one ordinary temporary current-scene support actor with roleKind=${supportActorNeed.roleKind}; requested role text: ${supportActorNeed.requestedRoleText}. This step must not record dialogue or other consequences.`,
      expectedVisibleSummary: `If accepted, one visible temporary ${supportActorNeed.roleKind} may be materialized in the current scene only.`,
    }));
    if (supportActorNeed.intendedUse === "dialogue_requested_but_not_yet_recorded" && allowed.has("dialogue_record")) {
      const supportStepId = steps[steps.length - 1]?.stepId ?? "step-1";
      steps.push(stepFor({
        index: 2,
        kind: "dialogue_record",
        actorRef,
        targetRefs: [sceneRef],
        evidenceRefs: supportEvidenceRefs,
        dependsOnStepIds: [supportStepId],
        dependencyBindings: [{
          bindingId: "materialized_speaker",
          fromStepId: supportStepId,
          requiredCapabilityId: "support_actor_create",
          requiredReceiptAuthority: "support_actor_materialization_receipt",
          sourcePath: "publicResult.supportActor.actorRef",
          resolveIn: "post_dependency_scene_frame",
          requiredFramePresence: "actors_and_citableRefs",
        }],
        purpose: `Record one visible response only after the ${supportActorNeed.roleKind} is materialized and the SceneFrame is refreshed.`,
        intendedSummary: "Stage 4 may record dialogue only from the freshly materialized support actor after a post-dependency authoritative SceneFrame contains that actor.",
        expectedVisibleSummary: "If support materialization is accepted and refreshed into SceneFrame actors/citableRefs, one visible support actor response may be recorded; the response does not prove world facts.",
      }));
    }
  } else if (steps.length > 0) {
    // A standalone state/evidence primitive has already produced the complete step set.
  } else if (allowed.has("observe_visible") && sceneRef && wantsVisibleObservation(actionText)) {
    steps.push(stepFor({
      index: 1,
      kind: "observe_visible",
      actorRef,
      targetRefs: [sceneRef],
      evidenceRefs: uniqueStrings([actorRef, sceneRef, ...evidenceRefs]),
    }));
  } else if (allowed.has("scene_beat_record") && sceneRef) {
    steps.push(stepFor({
      index: 1,
      kind: "scene_beat_record",
      actorRef,
      targetRefs: input.gmRead.actionInterpretation.targetRefs
        .filter((ref) => citable.has(ref.toLowerCase()))
        .slice(0, 4),
      evidenceRefs: uniqueStrings([actorRef, sceneRef, ...evidenceRefs]),
    }));
  }

  return {
    version: "gm-action-checklist.v1",
    checklistId: input.checklistId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      gmReadPath: input.gmRead.path,
      judgmentId: input.judgment.judgmentId,
      judgeCheckNeed: "backend_action_plan_needed",
      judgeNextStep: "action_plan",
      judgeNoRollReasonCode: "backend_receipt_required",
    },
    base: input.frame.base,
    turnIntent: {
      playerIntent: input.gmRead.actionInterpretation.playerIntent,
      admittedConsequenceNeed: input.judgment.noRollReason?.explanation ?? input.judgment.checkRationale,
    },
    steps,
    authority: {
      evidenceAuthority: "planning_only",
      mutationAuthority: "none",
      mayAuthorizeMutation: false,
      mayGenerateExecutableRequest: false,
      maySupportNarrationClaim: false,
      settledTruth: false,
      publicExposure: "stage_summary_only",
    },
  };
}

export async function runCleanGmActionChecklist(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  checklistId: string;
}): Promise<GmActionChecklistRunResult> {
  const branchIssues = eligibleBranchIssues(input);
  if (branchIssues.length > 0) {
    return {
      status: "fallback_no_mutation",
      checklist: null,
      issues: branchIssues,
      repairAttempted: false,
      fallbackReason: "GM Action Checklist was requested outside the accepted action-plan branch.",
    };
  }

  const candidate = buildDeterministicGmActionChecklist(input);
  const validation = validateGmActionChecklistCandidate({
    frame: input.frame,
    gmRead: input.gmRead,
    judgment: input.judgment,
    candidate,
  });
  if (validation.status === "accepted") {
    return {
      status: "accepted",
      checklist: assertGmActionChecklist({
        ...validation.checklist,
        checklistId: input.checklistId,
      }),
      issues: [],
      repairAttempted: false,
    };
  }

  return {
    status: "fallback_no_mutation",
    checklist: null,
    issues: validation.issues,
    repairAttempted: false,
    fallbackReason: "Deterministic GM Action Checklist could not be compiled from accepted clean-runtime evidence.",
  };
}
