import type { ProviderConfig } from "../../ai/provider-registry.js";
import { callOracle, type OraclePayload, type OracleResult } from "../oracle.js";
import {
  assertOracleSettlement,
  oracleAdapterOkResultSchema,
  oracleSettlementSchema,
  type AuthoritativeSceneFrame,
  type GmRead,
  type JudgeUncertainty,
  type OracleAdapterSettlementResult,
  type OracleOutcomeTier,
  type OracleSettlement,
} from "./contracts.js";

const FORBIDDEN_CLAIM_KINDS = [
  "movement",
  "arrival",
  "route_state",
  "discovery",
  "location_reveal",
  "item_state",
  "npc_private_knowledge",
  "actor_creation",
  "world_fact",
  "absence_or_no_change",
  "condition_or_hp_change",
] as const;

const OUTCOME_FORBIDDEN_TERMS: Record<typeof FORBIDDEN_CLAIM_KINDS[number], readonly string[]> = {
  movement: ["move", "moved", "moves", "travel", "travels", "walks", "goes", "идет", "идёт", "уходит"],
  arrival: ["arrive", "arrives", "reaches", "arrived", "приходит", "добирается", "оказывается"],
  route_state: ["route opens", "route closes", "route is open", "route is closed", "маршрут открыт", "маршрут закрыт"],
  discovery: ["discovers", "finds", "found", "находит", "обнаруживает"],
  location_reveal: ["reveals a location", "new location", "новая локация", "открывает место"],
  item_state: ["has the item", "takes", "drops", "gives", "получает", "берет", "берёт", "роняет", "передает"],
  npc_private_knowledge: ["knows secretly", "private knowledge", "тайно знает", "скрыто знает"],
  actor_creation: ["new npc", "appears from nowhere", "создается", "создаётся", "появляется новый"],
  world_fact: ["becomes true", "world fact", "canon fact", "становится фактом"],
  absence_or_no_change: ["nothing happens", "no one is there", "none are present", "ничего не происходит", "никого нет"],
  condition_or_hp_change: ["takes damage", "heals", "condition applied", "получает урон", "исцеляется"],
};

export interface OracleSettlementValidationIssue {
  code:
    | "branch_invalid"
    | "forbidden_claim"
    | "frame_mismatch"
    | "private_term"
    | "schema_invalid"
    | "selected_meaning_mismatch"
    | "uncited_ref";
  path: string;
  message: string;
}

export interface OracleSettlementSettled {
  status: "settled";
  settlement: OracleSettlement;
  publicEvent: {
    type: "oracle_result";
    data: {
      outcome: OracleOutcomeTier;
    };
  };
}

export interface OracleSettlementSettledWithFallback {
  status: "settled_with_fallback";
  settlement: OracleSettlement;
  publicEvent: {
    type: "oracle_result";
    data: {
      outcome: "miss";
    };
  };
}

export interface OracleSettlementNotApplicable {
  status: "not_applicable";
  issues: OracleSettlementValidationIssue[];
}

export type OracleSettlementRunResult =
  | OracleSettlementSettled
  | OracleSettlementSettledWithFallback
  | OracleSettlementNotApplicable;

export type OracleAdapter = (payload: OraclePayload, provider: ProviderConfig) => Promise<OracleResult>;

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => value?.trim()).filter(Boolean) as string[])];
}

function labelsByRef(frame: AuthoritativeSceneFrame): Map<string, string> {
  const labels = new Map<string, string>();
  labels.set(frame.player.ref.toLowerCase(), frame.player.label);
  labels.set(frame.scene.currentLocation.ref.toLowerCase(), frame.scene.currentLocation.label);
  labels.set(frame.scene.currentScene.ref.toLowerCase(), frame.scene.currentScene.label);
  for (const actor of frame.actors) labels.set(actor.ref.toLowerCase(), actor.label);
  for (const target of frame.targets) labels.set(target.ref.toLowerCase(), target.label);
  for (const item of frame.inventory) labels.set(item.ref.toLowerCase(), item.label);
  for (const movement of frame.movementOptions) labels.set(movement.ref.toLowerCase(), movement.label);
  return labels;
}

function labelsForRefs(frame: AuthoritativeSceneFrame, refs: readonly string[]): string[] {
  const labels = labelsByRef(frame);
  return uniqueStrings(refs.map((ref) => labels.get(ref.toLowerCase()) ?? ref));
}

function sceneEnvironmentTags(frame: AuthoritativeSceneFrame, judgment: JudgeUncertainty): string[] {
  return uniqueStrings([
    `current-location:${frame.scene.currentLocation.label}`,
    `current-scene:${frame.scene.currentScene.label}`,
    judgment.oracleAdmission ? `uncertainty-kind:${judgment.oracleAdmission.uncertaintyKind}` : null,
    judgment.difficulty ? `difficulty:${judgment.difficulty.tier}` : null,
    ...frame.scene.visibleFacts.slice(0, 4).map((fact) => fact.summary),
    ...frame.scene.recentLocalFacts.slice(0, 4).map((fact) => fact.summary),
  ]).slice(0, 16);
}

export function buildOraclePayloadV1(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
}): OraclePayload {
  const admission = input.judgment.oracleAdmission;
  if (!admission) {
    throw new Error("Oracle payload requires P57 oracleAdmission.");
  }
  return {
    intent: admission.question,
    method: input.gmRead.actionInterpretation.method ?? admission.uncertaintyKind,
    actorTags: labelsForRefs(input.frame, [admission.actorRef]),
    targetTags: labelsForRefs(input.frame, admission.targetRefs),
    environmentTags: sceneEnvironmentTags(input.frame, input.judgment),
    sceneContext: [
      `Question: ${admission.question}`,
      `Stakes: ${admission.stakes}`,
      `Strong hit means: ${admission.outcomeMeanings.strong_hit}`,
      `Weak hit means: ${admission.outcomeMeanings.weak_hit}`,
      `Miss means: ${admission.outcomeMeanings.miss}`,
      `Difficulty: ${admission.difficultyTier}`,
      `Difficulty basis: ${input.judgment.difficulty?.basis ?? "n/a"}`,
      `Scene: ${input.frame.scene.currentScene.label}`,
      `Evidence refs: ${admission.evidenceRefs.join(", ")}`,
    ].join("\n"),
  };
}

function branchIssues(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
}): OracleSettlementValidationIssue[] {
  const issues: OracleSettlementValidationIssue[] = [];

  function add(path: string, message: string): void {
    issues.push({ code: "branch_invalid", path, message });
  }

  if (input.judgment.campaignId !== input.frame.campaignId) add("campaignId", "Judgment campaignId must match SceneFrame.");
  if (input.judgment.frameId !== input.frame.frameId || input.judgment.frameId !== input.gmRead.frameId) {
    add("frameId", "Judgment frameId must match SceneFrame and GM Read.");
  }
  if (input.judgment.turnId !== input.frame.turnId || input.judgment.turnId !== input.gmRead.turnId) {
    add("turnId", "Judgment turnId must match SceneFrame and GM Read.");
  }
  if (input.judgment.nextStep !== "oracle_roll") add("nextStep", "P58 only runs on nextStep=oracle_roll.");
  if (input.judgment.checkNeed !== "oracle_roll_needed") add("checkNeed", "P58 requires checkNeed=oracle_roll_needed.");
  if (!input.judgment.oracleAdmission) add("oracleAdmission", "P58 requires P57 oracleAdmission.");
  if (!input.judgment.difficulty) add("difficulty", "P58 requires P57 difficulty.");
  if (input.judgment.noRollReason) add("noRollReason", "P58 Oracle branch must not carry noRollReason.");
  if (input.judgment.oracleAdmission?.settlementScope !== "visible_outcome_only") {
    add("oracleAdmission.settlementScope", "P58 only settles visible outcome uncertainty.");
  }
  if (input.judgment.oracleAdmission?.requiresFollowupMutation !== false) {
    add("oracleAdmission.requiresFollowupMutation", "P58 cannot settle admissions requiring follow-up mutation.");
  }

  return issues;
}

function refIssues(input: {
  frame: AuthoritativeSceneFrame;
  settlement: OracleSettlement;
}): OracleSettlementValidationIssue[] {
  const legal = new Set(input.frame.citableRefs.map((ref) => ref.toLowerCase()));
  const refs = uniqueStrings([
    input.settlement.admission.actorRef,
    ...input.settlement.admission.targetRefs,
    ...input.settlement.admission.evidenceRefs,
    ...input.settlement.authority.evidenceRefs,
  ]);
  return refs
    .filter((ref) => !legal.has(ref.toLowerCase()))
    .map((ref) => ({
      code: "uncited_ref" as const,
      path: "refs",
      message: `Oracle settlement cited ref "${ref}" outside SceneFrame.citableRefs.`,
    }));
}

function privateTermIssues(input: {
  frame: AuthoritativeSceneFrame;
  settlement: OracleSettlement;
}): OracleSettlementValidationIssue[] {
  const terms = uniqueStrings([
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ]).map((term) => term.toLowerCase());
  if (terms.length === 0) return [];
  const text = JSON.stringify(input.settlement).toLowerCase();
  return terms
    .filter((term) => text.includes(term))
    .map((term) => ({
      code: "private_term" as const,
      path: "<settlement>",
      message: `Oracle settlement public fields leaked private term "${term}".`,
    }));
}

function forbiddenClaimIssues(settlement: OracleSettlement): OracleSettlementValidationIssue[] {
  const meanings = settlement.admission.outcomeMeanings;
  const textByPath = {
    "admission.outcomeMeanings.strong_hit": meanings.strong_hit,
    "admission.outcomeMeanings.weak_hit": meanings.weak_hit,
    "admission.outcomeMeanings.miss": meanings.miss,
    "selectedMeaning.text": settlement.selectedMeaning.text,
    "visibleOutcome.selectedMeaning": settlement.visibleOutcome.selectedMeaning,
  };
  const issues: OracleSettlementValidationIssue[] = [];
  for (const [path, value] of Object.entries(textByPath)) {
    const lower = value.toLowerCase();
    for (const [kind, terms] of Object.entries(OUTCOME_FORBIDDEN_TERMS)) {
      if (terms.some((term) => lower.includes(term.toLowerCase()))) {
        issues.push({
          code: "forbidden_claim",
          path,
          message: `Oracle outcome meaning claims ${kind}; P58 may settle visible uncertainty only.`,
        });
      }
    }
  }
  return issues;
}

export function validateOracleSettlement(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  settlement: unknown;
}): { status: "accepted"; settlement: OracleSettlement; issues: [] } | {
  status: "rejected";
  issues: OracleSettlementValidationIssue[];
} {
  const parsed = oracleSettlementSchema.safeParse(input.settlement);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: parsed.error.issues.map((issue) => ({
        code: "schema_invalid",
        path: issue.path.join(".") || "<root>",
        message: issue.message,
      })),
    };
  }

  const settlement = parsed.data;
  const issues: OracleSettlementValidationIssue[] = [
    ...branchIssues(input),
    ...refIssues({ frame: input.frame, settlement }),
    ...privateTermIssues({ frame: input.frame, settlement }),
    ...forbiddenClaimIssues(settlement),
  ];

  if (settlement.campaignId !== input.frame.campaignId) {
    issues.push({ code: "frame_mismatch", path: "campaignId", message: "Settlement campaignId must match SceneFrame." });
  }
  if (settlement.frameId !== input.frame.frameId || settlement.frameId !== input.gmRead.frameId) {
    issues.push({ code: "frame_mismatch", path: "frameId", message: "Settlement frameId must match SceneFrame and GM Read." });
  }
  if (settlement.turnId !== input.frame.turnId || settlement.turnId !== input.gmRead.turnId) {
    issues.push({ code: "frame_mismatch", path: "turnId", message: "Settlement turnId must match SceneFrame and GM Read." });
  }
  if (settlement.source.judgmentId !== input.judgment.judgmentId) {
    issues.push({ code: "frame_mismatch", path: "source.judgmentId", message: "Settlement must link to accepted judgment." });
  }
  if (settlement.source.oracleAdmissionId !== input.judgment.oracleAdmission?.admissionId) {
    issues.push({ code: "frame_mismatch", path: "source.oracleAdmissionId", message: "Settlement must link to accepted Oracle admission." });
  }
  if (settlement.visibleOutcome.outcome !== settlement.selectedMeaning.outcome) {
    issues.push({ code: "selected_meaning_mismatch", path: "visibleOutcome.outcome", message: "Visible outcome must match selected meaning outcome." });
  }
  if (settlement.visibleOutcome.question !== settlement.admission.question) {
    issues.push({ code: "selected_meaning_mismatch", path: "visibleOutcome.question", message: "Visible question must match admission." });
  }
  if (settlement.visibleOutcome.stakes !== settlement.admission.stakes) {
    issues.push({ code: "selected_meaning_mismatch", path: "visibleOutcome.stakes", message: "Visible stakes must match admission." });
  }
  const outcome = settlement.adapter.result.outcome;
  const expectedMeaning = settlement.admission.outcomeMeanings[outcome];
  if (settlement.selectedMeaning.outcome !== outcome || settlement.selectedMeaning.text !== expectedMeaning) {
    issues.push({
      code: "selected_meaning_mismatch",
      path: "selectedMeaning",
      message: "Selected meaning must equal admission.outcomeMeanings[result.outcome].",
    });
  }
  if (settlement.visibleOutcome.selectedMeaning !== expectedMeaning) {
    issues.push({
      code: "selected_meaning_mismatch",
      path: "visibleOutcome.selectedMeaning",
      message: "Visible selected meaning must equal accepted selected meaning.",
    });
  }
  if (settlement.adapter.result.status === "fallback" && settlement.failure?.kind !== settlement.adapter.result.reason.kind) {
    issues.push({
      code: "selected_meaning_mismatch",
      path: "failure.kind",
      message: "Fallback settlement failure kind must match adapter fallback reason.",
    });
  }
  if (settlement.adapter.result.status === "ok" && settlement.failure !== null) {
    issues.push({
      code: "selected_meaning_mismatch",
      path: "failure",
      message: "Normal adapter settlement must not include failure.",
    });
  }

  if (issues.length > 0) return { status: "rejected", issues };
  return { status: "accepted", settlement, issues: [] };
}

function buildSettlement(input: {
  settlementId: string;
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  payload: OraclePayload;
  adapterResult: OracleAdapterSettlementResult;
}): OracleSettlement {
  const admission = input.judgment.oracleAdmission;
  if (!admission) throw new Error("Oracle settlement requires P57 oracleAdmission.");
  const outcome = input.adapterResult.outcome;
  const selectedMeaning = admission.outcomeMeanings[outcome];
  return assertOracleSettlement({
    version: "oracle-settlement.v1",
    settlementId: input.settlementId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      gmReadPath: input.gmRead.path,
      judgmentId: input.judgment.judgmentId,
      oracleAdmissionId: admission.admissionId,
    },
    admission,
    adapter: {
      adapterId: "callOracle",
      payload: input.payload,
      result: input.adapterResult,
    },
    selectedMeaning: {
      outcome,
      text: selectedMeaning,
      source: "admission.outcomeMeanings[result.outcome]",
    },
    visibleOutcome: {
      outcome,
      question: admission.question,
      stakes: admission.stakes,
      selectedMeaning,
    },
    authority: {
      evidenceAuthority: "oracle_settlement",
      mutationAuthority: "none",
      evidenceRefs: admission.evidenceRefs,
      mayAuthorizeMutation: false,
      claimScope: "visible_uncertainty_outcome_only",
      forbiddenClaimKinds: FORBIDDEN_CLAIM_KINDS,
    },
    failure: input.adapterResult.status === "fallback"
      ? {
          kind: input.adapterResult.reason.kind,
          fallbackPolicy: "conservative_miss",
          hiddenMutationApplied: false,
        }
      : null,
  });
}

function fallbackResult(input: {
  kind: "adapter_generation_failed" | "invalid_adapter_output";
  message: string;
}): OracleAdapterSettlementResult {
  return {
    status: "fallback",
    fallbackPolicy: "conservative_miss",
    outcome: "miss",
    reason: {
      kind: input.kind,
      message: input.message.slice(0, 500) || input.kind,
    },
  };
}

export async function runCleanOracleSettlement(input: {
  frame: AuthoritativeSceneFrame;
  gmRead: GmRead;
  judgment: JudgeUncertainty;
  provider: ProviderConfig;
  settlementId: string;
  adapter?: OracleAdapter;
}): Promise<OracleSettlementRunResult> {
  const branch = branchIssues(input);
  if (branch.length > 0) {
    return { status: "not_applicable", issues: branch };
  }

  const payload = buildOraclePayloadV1(input);
  const adapter = input.adapter ?? callOracle;

  let adapterResult: OracleAdapterSettlementResult;
  try {
    const raw = await adapter(payload, input.provider);
    const parsed = oracleAdapterOkResultSchema.safeParse({
      status: "ok",
      chance: raw.chance,
      roll: raw.roll,
      outcome: raw.outcome,
      reasoning: raw.reasoning,
    });
    adapterResult = parsed.success
      ? parsed.data
      : fallbackResult({
          kind: "invalid_adapter_output",
          message: parsed.error.issues.map((issue) => issue.message).join("; "),
        });
  } catch (error) {
    adapterResult = fallbackResult({
      kind: "adapter_generation_failed",
      message: error instanceof Error ? error.message : String(error),
    });
  }

  const settlement = buildSettlement({
    settlementId: input.settlementId,
    frame: input.frame,
    gmRead: input.gmRead,
    judgment: input.judgment,
    payload,
    adapterResult,
  });
  const validation = validateOracleSettlement({
    frame: input.frame,
    gmRead: input.gmRead,
    judgment: input.judgment,
    settlement,
  });
  if (validation.status === "rejected") {
    return { status: "not_applicable", issues: validation.issues };
  }

  if (adapterResult.status === "fallback") {
    return {
      status: "settled_with_fallback",
      settlement: validation.settlement,
      publicEvent: {
        type: "oracle_result",
        data: {
          outcome: "miss",
        },
      },
    };
  }

  return {
    status: "settled",
    settlement: validation.settlement,
    publicEvent: {
      type: "oracle_result",
      data: {
        outcome: validation.settlement.visibleOutcome.outcome,
      },
    },
  };
}
