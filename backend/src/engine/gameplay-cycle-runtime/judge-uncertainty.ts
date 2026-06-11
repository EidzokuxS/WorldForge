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

const judgeUncertaintyGenerationSchema = judgeUncertaintySchema
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

export interface JudgeUncertaintyFallback {
  status: "fallback_clarification";
  judgment: JudgeUncertainty;
  issues: JudgeUncertaintyValidationIssue[];
  repairAttempted: boolean;
}

export type JudgeUncertaintyRunResult = JudgeUncertaintyAccepted | JudgeUncertaintyFallback;

export interface JudgeUncertaintyCandidateRequest {
  system: string;
  prompt: string;
  repairOf?: {
    candidate: unknown;
    issues: JudgeUncertaintyValidationIssue[];
  };
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
    && ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
    && judgment.checkNeed === "no_roll_needed"
  ) {
    add(
      "checkNeed",
      "Visible actor dialogue requires backend_action_plan_needed so Stage 4 can record the speaker response before narration.",
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
    && ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
    && judgment.checkNeed === "no_roll_needed"
  ) {
    add(
      "checkNeed",
      "Player item custody/location/equip-state transitions require backend_action_plan_needed so Stage 4 can issue an item transfer receipt before narration.",
    );
  }
  if (
    gmRead.actionInterpretation.interactionKind === "current_scene_observation"
    && gmRead.actionInterpretation.localObservationNeed != null
    && ["possible", "possible_but_uncertain"].includes(judgment.physicalPossibility)
    && judgment.checkNeed === "no_roll_needed"
  ) {
    add(
      "checkNeed",
      "Targeted local observations require backend_action_plan_needed so Stage 4 can issue a local observation receipt before narration.",
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

export function buildFallbackJudgeUncertainty(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  reason: string;
}): JudgeUncertainty {
  const sceneRef = input.frame.scene.currentScene.ref;
  return assertJudgeUncertainty({
    version: "judge-uncertainty.v1",
    judgmentId: `judge-${input.frame.turnId}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: input.gmRead.path,
    },
    physicalPossibility: "underspecified",
    checkNeed: "clarification_needed",
    nextStep: "ask_clarification",
    actorRefs: ["Player"],
    targetRefs: [],
    evidenceRefs: uniqueStrings(["Player", sceneRef]),
    possibilityRationale: "The clean Judge/Uncertainty result could not be validated.",
    checkRationale: "No roll or mutation is admitted without a valid Judge/Uncertainty packet.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "insufficient_specificity",
      explanation: input.reason,
      evidenceRefs: uniqueStrings(["Player", sceneRef]),
    },
  });
}

function promptFrame(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    base: frame.base,
    playerAction: frame.playerAction,
    player: frame.player,
    scene: frame.scene,
    actors: frame.actors,
    movementOptions: frame.movementOptions,
    targets: frame.targets,
    inventory: frame.inventory,
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
    "GM Read is interpretation context only. gm-read uncertain is a signal, not permission to roll.",
    "Use nextStep=oracle_roll only for true visible uncertainty that needs a random outcome before downstream consequences.",
    "Use nextStep=action_plan for backend-owned consequences; do not include effect kinds, tool names, checklist steps, or payloads.",
    "When GM Read path is procedural and SceneFrame shows allowed receipt-required backend capabilities, do not use settle_no_roll; admit backend_action_plan_needed with noRollReason.code=backend_receipt_required unless a true Oracle roll or combat boundary is required.",
    "When GM Read actionInterpretation.interactionKind is visible_actor_dialogue, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the visible speaker response receipt.",
    "When GM Read actionInterpretation.interactionKind is ordinary_support_actor_needed, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the support actor materialization receipt. Do not call Oracle for ordinary support actor availability.",
    "When GM Read actionInterpretation.interactionKind is player_local_condition, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the Player local condition receipt. Do not call Oracle for uncontested posture/readiness.",
    "When GM Read actionInterpretation.interactionKind is item_transfer, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the item transfer receipt. Do not call Oracle for ordinary uncontested give/drop/pickup/equip/unequip.",
    "When GM Read actionInterpretation.interactionKind is current_scene_observation with localObservationNeed, use backend_action_plan_needed with noRollReason.code=backend_receipt_required; Stage 4 owns the local observation receipt. Do not call Oracle for targeted visible SceneFrame surface observations or bounded no-match over enumerated current-scene surfaces.",
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
    "Judge the player action against this authoritative SceneFrame and accepted GM Read.",
    "Return judge-uncertainty.v1 JSON. Do not add extra fields.",
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrame(input.frame), null, 2),
    "Accepted GM Read:",
    JSON.stringify(input.gmRead, null, 2),
  ].join("\n\n");
}

function buildJudgeUncertaintyRepairPrompt(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  candidate: unknown;
  issues: JudgeUncertaintyValidationIssue[];
}): string {
  return [
    "Repair the Judge/Uncertainty candidate so it satisfies judge-uncertainty.v1.",
    "Do not add tool, checklist, mutation, receipt, narration, roll, chance, Oracle result, or state-delta fields.",
    "Use only refs from SceneFrame.citableRefs.",
    "Validation issues:",
    JSON.stringify(input.issues, null, 2),
    "Original candidate:",
    JSON.stringify(input.candidate, null, 2),
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
    return {
      status: "fallback_clarification",
      judgment: buildFallbackJudgeUncertainty({
        frame: input.frame,
        gmRead: input.gmRead,
        reason: `Judge/Uncertainty generation failed before validation: ${message.slice(0, 300)}`,
      }),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message,
      }],
      repairAttempted: false,
    };
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

  try {
    const repairCandidate = await generateCandidate({
      system,
      prompt: buildJudgeUncertaintyRepairPrompt({
        frame: input.frame,
        gmRead: input.gmRead,
        candidate: firstCandidateForValidation,
        issues: firstValidation.issues,
      }),
      repairOf: {
        candidate: firstCandidateForValidation,
        issues: firstValidation.issues,
      },
    });
    const repairCandidateForValidation = normalizeNullableBranchFields(repairCandidate);
    const repairValidation = validateJudgeUncertaintyCandidate({
      frame: input.frame,
      gmRead: input.gmRead,
      candidate: repairCandidateForValidation,
    });
    if (repairValidation.status === "accepted") {
      return {
        status: "accepted",
        judgment: repairValidation.judgment,
        issues: [],
        repairAttempted: true,
      };
    }
    return {
      status: "fallback_clarification",
      judgment: buildFallbackJudgeUncertainty({
        frame: input.frame,
        gmRead: input.gmRead,
        reason: "Judge/Uncertainty repair did not satisfy the clean admission contract.",
      }),
      issues: [...firstValidation.issues, ...repairValidation.issues],
      repairAttempted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "fallback_clarification",
      judgment: buildFallbackJudgeUncertainty({
        frame: input.frame,
        gmRead: input.gmRead,
        reason: `Judge/Uncertainty repair generation failed: ${message.slice(0, 300)}`,
      }),
      issues: [
        ...firstValidation.issues,
        {
          code: "schema_invalid",
          path: "<repair>",
          message,
        },
      ],
      repairAttempted: true,
    };
  }
}
