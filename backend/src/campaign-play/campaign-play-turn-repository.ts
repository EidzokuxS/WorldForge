import type {
  CampaignPlayOpeningAdmissionRequest,
  CampaignPlayPublicErrorCode,
  CampaignPlayPublicProgress,
  CampaignPlaySseEvent,
  CampaignPlayTurnAdmissionRequest,
  CampaignPlayTurnAdmissionResponse,
} from "@worldforge/shared";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  campaignPlayActorPlanSchema,
  campaignPlayActionExecutionRouteSchema,
  campaignPlayGameMasterArtifactSchema,
  campaignPlayJudgeArtifactSchema,
  campaignPlayOpeningAdmissionRequestSchema,
  campaignPlayModelStageSchema,
  campaignPlayNarrationSchema,
  campaignPlayNarratorPacketSchema,
  campaignPlaySseEventSchema,
  campaignPlayTurnAdmissionRequestSchema,
  CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES,
  type CampaignPlayActionExecutionRoute,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayActorReplanStageId,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import type { CampaignPlayMutationContext } from "./campaign-play-state-repository.js";
import { campaignPlayResponseModelMatches } from "./model-identity.js";

export type CampaignPlayTurnRepositoryErrorCode =
  | "turn_not_found"
  | "turn_idempotency_mismatch"
  | "turn_in_progress"
  | "turn_phase_invalid"
  | "turn_version_conflict"
  | "turn_topology_ineligible"
  | "turn_fence_lost"
  | "turn_stage_invalid"
  | "turn_corrupt";

type CampaignPlayActionExecutionRouteKind = CampaignPlayActionExecutionRoute["kind"];

export class CampaignPlayTurnRepositoryError extends Error {
  constructor(
    readonly code: CampaignPlayTurnRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayTurnRepositoryError";
  }
}

export interface CampaignPlayRequestedModel {
  providerId: string;
  model: string;
  strategy: "strict_object";
  pricing: CampaignPlayModelPricing;
}

export interface CampaignPlayModelPricing {
  known: boolean;
  currency: "USD";
  tokenUnit: 1_000_000;
  inputCostMicros: number;
  outputCostMicros: number;
  rounding: "ceil";
}

export type CampaignPlayTurnModelSelection =
  | {
      turnKind: "opening";
      openingPlanner: CampaignPlayRequestedModel;
      narrator: CampaignPlayRequestedModel;
    }
  | {
      turnKind: "player_action";
      judge: CampaignPlayRequestedModel;
      gameMaster: CampaignPlayRequestedModel;
      actorReplanner: CampaignPlayRequestedModel;
      narrator: CampaignPlayRequestedModel;
      routeKind?: CampaignPlayActionExecutionRouteKind;
    };

export type CampaignPlayTurnAdmissionDocument =
  | {
      turnKind: "opening";
      request: CampaignPlayOpeningAdmissionRequest;
      frame: CampaignPlayProjectionRecord;
    }
  | {
      turnKind: "player_action";
      request: CampaignPlayTurnAdmissionRequest;
      frame: CampaignPlayProjectionRecord;
    };

export interface AdmitCampaignPlayTurnInput {
  turnId: string;
  supersedesTurnId: string | null;
  document: CampaignPlayTurnAdmissionDocument;
  modelSelection: CampaignPlayTurnModelSelection;
  mutationId: string;
  submittedAt: number;
}

export type CampaignPlayTurnStage =
  | "admitted"
  | "judged"
  | "planned"
  | "primary_settled"
  | "actors_settled"
  | "visibility_projected"
  | "interrupted"
  | "completed"
  | "failed";

export type CampaignPlayClaimableTurnStage = Exclude<
  CampaignPlayTurnStage,
  "interrupted" | "completed" | "failed"
>;

export interface CampaignPlayWorkerLeaseToken {
  turnId: string;
  stage: CampaignPlayClaimableTurnStage;
  owner: string;
  epoch: number;
  expiresAt: number;
}

export interface ClaimCampaignPlayStageInput {
  turnId: string;
  expectedStage: CampaignPlayClaimableTurnStage;
  observedEpoch: number;
  owner: string;
  claimedAt: number;
  leaseExpiresAt: number;
  mutationId: string;
}

export interface RenewCampaignPlayLeaseInput {
  token: CampaignPlayWorkerLeaseToken;
  renewedAt: number;
  leaseExpiresAt: number;
  mutationId: string;
}

export interface CampaignPlayModelExecutionEvidence {
  actualProviderId: string;
  actualModel: string;
  actualStrategy: "strict_object";
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
  finishReason: string;
}

interface AcceptCampaignPlayModelArtifactBase {
  token: CampaignPlayWorkerLeaseToken;
  artifact: unknown;
  evidence: CampaignPlayModelExecutionEvidence;
  acceptedAt: number;
  mutationId: string;
}

export type AcceptCampaignPlayModelArtifactInput =
  | (AcceptCampaignPlayModelArtifactBase & {
      mutationDomain: "runtime";
      mutate?: (context: CampaignPlayMutationContext) => void;
    })
  | (AcceptCampaignPlayModelArtifactBase & {
      mutationDomain: "both";
      mutate: (context: CampaignPlayMutationContext) => void;
    })
  | (AcceptCampaignPlayModelArtifactBase & {
      mutationDomain: "narration";
      publicPacketHash: string;
      mutate: (context: CampaignPlayMutationContext) => void;
    });

export type CampaignPlayDeterministicTransition =
  | "primary_settled"
  | "actor_job_transitioned"
  | "actors_settled"
  | "visibility_projected";

export interface CommitCampaignPlayDeterministicInput {
  token: CampaignPlayWorkerLeaseToken;
  transition: CampaignPlayDeterministicTransition;
  worldVersionAdvance: number;
  publicPacketHash?: string;
  mutate?: (context: CampaignPlayMutationContext) => void;
  committedAt: number;
  mutationId: string;
}

export interface CommitCampaignPlayActorTransitionInput {
  token: CampaignPlayWorkerLeaseToken;
  leaseMode: "live" | "expired";
  publicInterruption?: boolean;
  worldVersionAdvance: number;
  protectedPayloadHash: string;
  committedAt: number;
  mutationId: string;
  mutate(context: CampaignPlayMutationContext): void;
}

export type CampaignPlayInternalErrorCode =
  (typeof CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES)[number];

export interface CampaignPlayModelFailureEvidence {
  actualProviderId: string | null;
  actualModel: string | null;
  actualStrategy: "strict_object" | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  finishReason: string | null;
  schemaOutcome: "invalid" | "transport_error";
}

export interface FailCampaignPlayTurnInput {
  token: CampaignPlayWorkerLeaseToken;
  errorCode: CampaignPlayInternalErrorCode;
  publicErrorCode: CampaignPlayPublicErrorCode;
  mutationAudit: CampaignPlayProjectionRecord;
  modelEvidence: CampaignPlayModelFailureEvidence | null;
  failedAt: number;
  mutationId: string;
}

export interface CampaignPlayExternalInterruptionEvidence {
  actualProviderId: string | null;
  actualModel: string | null;
  actualStrategy: "strict_object" | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number;
  finishReason: string | null;
  schemaOutcome: "invalid" | "transport_error";
  errorCode:
    | "provider_unavailable"
    | "worker_lease_lost"
    | "persistence_failed"
    | "model_contract_invalid"
    | "stage_budget_exceeded"
    | "stage_timeout"
    | "rulebook_denied"
    | "narration_invalid";
}

export interface InterruptCampaignPlayExternalInput {
  token: CampaignPlayWorkerLeaseToken;
  evidence: CampaignPlayExternalInterruptionEvidence;
  interruptedAt: number;
  mutationId: string;
}

export interface InterruptExpiredCampaignPlayExternalInput {
  turnId: string;
  stage: CampaignPlayClaimableTurnStage;
  owner: string;
  observedEpoch: number;
  observedLeaseExpiresAt: number;
  evidence: CampaignPlayExternalInterruptionEvidence;
  observedAt: number;
  mutationId: string;
}

export interface ResumeCampaignPlayExternalInput {
  turnId: string;
  interruptedStage: CampaignPlayClaimableTurnStage;
  observedEpoch: number;
  owner: string;
  resumedAt: number;
  leaseExpiresAt: number;
  mutationId: string;
}

export type CampaignPlayTurnModelStageKind =
  | "judge"
  | "game_master"
  | "opening_planner"
  | "actor_replanner"
  | "narrator";

export interface CampaignPlayAcceptedModelArtifact {
  kind: CampaignPlayTurnModelStageKind;
  attempt: number;
  workerEpoch: number;
  artifact: unknown;
  artifactHash: string;
  requested: CampaignPlayRequestedModel;
  evidence: CampaignPlayModelExecutionEvidence;
  startedAt: number;
  completedAt: number;
}

export interface CampaignPlayWorkerStageTiming {
  claimedAt: number;
  queueTimeMs: number;
  leaseRenewals: number;
}

export interface CampaignPlayStageExecutionTelemetry {
  stage: CampaignPlayClaimableTurnStage;
  workerEpoch: number;
  claimedAt: number;
  completedAt: number | null;
  queueTimeMs: number;
  latencyMs: number | null;
  leaseRenewals: number;
  outcome: "advanced" | "interrupted" | "failed" | "superseded" | "in_flight";
}

export interface CampaignPlayModelAttemptTelemetry {
  stageId: string;
  kind: CampaignPlayTurnModelStageKind;
  attempt: number;
  workerEpoch: number;
  status: CampaignPlayModelStageStatus;
  requestedProviderId: string;
  requestedModel: string;
  actualProviderId: string | null;
  actualModel: string | null;
  startedAt: number;
  completedAt: number | null;
  durationMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  estimatedCostMicros: number | null;
  costComplete: boolean;
  errorCode: string | null;
}

export interface CampaignPlayTurnTelemetry {
  turnId: string;
  routeKind: CampaignPlayActionExecutionRouteKind;
  submittedAt: number;
  completedAt: number | null;
  totalLatencyMs: number | null;
  queueTimeMs: number;
  stageLatencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  estimatedCostMicros: number | null;
  costComplete: boolean;
  terminalReason: LoadedCampaignPlayTurn["terminalReason"];
  modelCallCounts: {
    openingPlanner: number;
    judge: number;
    gameMaster: number;
    actorReplanner: number;
    narrator: number;
  };
  stageExecutions: CampaignPlayStageExecutionTelemetry[];
  modelAttempts: CampaignPlayModelAttemptTelemetry[];
}

export type CampaignPlayRecoveryState =
  | { kind: "external_ready"; turnId: string; stage: CampaignPlayClaimableTurnStage; workerEpoch: number }
  | { kind: "external_in_flight"; turnId: string; token: CampaignPlayWorkerLeaseToken; attempt: number; attemptStartedAt: number }
  | { kind: "external_interruption_required"; turnId: string; token: CampaignPlayWorkerLeaseToken; attempt: number; attemptStartedAt: number }
  | { kind: "explicit_resume_required"; turnId: string; interruptedStage: CampaignPlayClaimableTurnStage; workerEpoch: number; attempt: number; attemptStartedAt: number; errorCode: string }
  | { kind: "deterministic_ready"; turnId: string; stage: CampaignPlayClaimableTurnStage; workerEpoch: number }
  | { kind: "deterministic_in_flight"; turnId: string; token: CampaignPlayWorkerLeaseToken }
  | { kind: "completed"; turnId: string; finalWorldVersion: number; completedAt: number }
  | { kind: "terminal_failure"; turnId: string; finalWorldVersion: number; completedAt: number; errorCode: string; mutationAudit: CampaignPlayProjectionRecord };

export interface LoadedCampaignPlayTurn {
  turnId: string;
  campaignId: string;
  turnKind: "opening" | "player_action";
  supersedesTurnId: string | null;
  document: CampaignPlayTurnAdmissionDocument;
  inputHash: string;
  idempotencyKey: string;
  expectedWorldVersion: number;
  expectedRuntimeRevision: number;
  baseWorldVersion: number;
  finalWorldVersion: number | null;
  stage: CampaignPlayTurnStage;
  frameHash: string;
  nextEventSequence: number;
  workerLeaseOwner: string | null;
  workerEpoch: number;
  workerLeaseExpiresAt: number | null;
  modelSelection: CampaignPlayTurnModelSelection;
  publicPacketHash: string | null;
  interruptedStage: Exclude<CampaignPlayTurnStage, "interrupted" | "completed" | "failed"> | null;
  errorCode: string | null;
  resumeEligible: boolean;
  mutationAudit: CampaignPlayProjectionRecord;
  submittedAt: number;
  updatedAt: number;
  completedAt: number | null;
  terminalReason:
    | "opening_completed"
    | "action_resolved"
    | "action_impossible"
    | "clarification_requested"
    | "terminal_failure"
    | null;
  events: CampaignPlaySseEvent[];
}

export interface CampaignPlayTurnRepository {
  admitTurn(input: AdmitCampaignPlayTurnInput): CampaignPlayTurnAdmissionResponse;
  claimStage(input: ClaimCampaignPlayStageInput): CampaignPlayWorkerLeaseToken;
  renewLease(input: RenewCampaignPlayLeaseInput): CampaignPlayWorkerLeaseToken;
  acceptModelArtifact(input: AcceptCampaignPlayModelArtifactInput): LoadedCampaignPlayTurn;
  commitDeterministic(input: CommitCampaignPlayDeterministicInput): LoadedCampaignPlayTurn;
  commitActorTransition(input: CommitCampaignPlayActorTransitionInput): LoadedCampaignPlayTurn;
  interruptExternal(input: InterruptCampaignPlayExternalInput): LoadedCampaignPlayTurn;
  interruptExpiredExternal(input: InterruptExpiredCampaignPlayExternalInput): LoadedCampaignPlayTurn;
  resumeExternal(input: ResumeCampaignPlayExternalInput): CampaignPlayWorkerLeaseToken;
  failTurn(input: FailCampaignPlayTurnInput): LoadedCampaignPlayTurn;
  loadRecoveryState(turnId: string, observedAt: number): CampaignPlayRecoveryState;
  loadAcceptedModelArtifact(
    turnId: string,
    kind: CampaignPlayTurnModelStageKind,
  ): CampaignPlayAcceptedModelArtifact | null;
  loadWorkerStageTiming(turnId: string, workerEpoch: number): CampaignPlayWorkerStageTiming;
  loadTurnTelemetry(turnId: string): CampaignPlayTurnTelemetry;
  loadTurn(turnId: string): LoadedCampaignPlayTurn | null;
  loadTurnByIdempotencyKey(idempotencyKey: string): LoadedCampaignPlayTurn | null;
  loadActiveTurn(): LoadedCampaignPlayTurn | null;
  loadSupersedableOpening(): LoadedCampaignPlayTurn | null;
  listTurnEvents(turnId: string, afterSequence?: number): CampaignPlaySseEvent[];
}

interface TurnRow {
  turnId: string;
  campaignId: string;
  turnKind: "opening" | "player_action";
  supersedesTurnId: string | null;
  inputJson: string;
  inputHash: string;
  idempotencyKey: string;
  expectedWorldVersion: number;
  expectedRuntimeRevision: number;
  baseWorldVersion: number;
  finalWorldVersion: number | null;
  stage: CampaignPlayTurnStage;
  frameHash: string;
  nextEventSequence: number;
  workerLeaseOwner: string | null;
  workerEpoch: number;
  workerLeaseExpiresAt: number | null;
  modelSelectionJson: string;
  publicPacketHash: string | null;
  interruptedStage: LoadedCampaignPlayTurn["interruptedStage"];
  errorCode: string | null;
  resumeEligible: number;
  mutationAuditJson: string;
  submittedAt: number;
  updatedAt: number;
  completedAt: number | null;
}

interface TurnEventRow {
  eventId: string;
  sequence: number;
  eventType: CampaignPlaySseEvent["type"];
  payloadJson: string;
  sseCursor: string;
  createdAt: number;
}

export type CampaignPlayModelStageStatus = "started" | "accepted" | "interrupted" | "failed";

interface ModelStageRow {
  id: string;
  stageId: string;
  campaignId: string;
  turnId: string | null;
  kind: CampaignPlayTurnModelStageKind;
  attempt: number;
  status: CampaignPlayModelStageStatus;
  workerEpoch: number;
  requestedProviderId: string;
  requestedModel: string;
  requestedStrategy: "strict_object";
  actualProviderId: string | null;
  actualModel: string | null;
  actualStrategy: "strict_object" | null;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  finishReason: string | null;
  schemaOutcome: "pending" | "valid" | "invalid" | "transport_error";
  artifactJson: string | null;
  artifactHash: string | null;
  errorCode: string | null;
  createdAt: number;
  completedAt: number | null;
}

interface StageClaimRoute {
  progress: "interpreting" | "settling" | "world_acting" | "revealing" | "narrating";
  model: {
    kind: CampaignPlayTurnModelStageKind;
    requested: CampaignPlayRequestedModel;
  } | null;
}

function corrupt(message: string, cause?: unknown): CampaignPlayTurnRepositoryError {
  return new CampaignPlayTurnRepositoryError(
    "turn_corrupt",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function parseRecord(value: string, label: string): CampaignPlayProjectionRecord {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new TypeError(`${label} must contain an object.`);
    }
    canonicalizeCampaignPlayProjection(parsed);
    return parsed as CampaignPlayProjectionRecord;
  } catch (error) {
    throw corrupt(`${label} contains invalid canonical JSON.`, error);
  }
}

function isRequestedModel(value: unknown): value is CampaignPlayRequestedModel {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join("|") === "model|pricing|providerId|strategy" &&
    typeof record.providerId === "string" && record.providerId.length > 0 &&
    typeof record.model === "string" && record.model.length > 0 &&
    record.strategy === "strict_object" && isModelPricing(record.pricing);
}

function isModelPricing(value: unknown): value is CampaignPlayModelPricing {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().join("|") ===
      "currency|inputCostMicros|known|outputCostMicros|rounding|tokenUnit" &&
    typeof record.known === "boolean" &&
    record.currency === "USD" && record.tokenUnit === 1_000_000 &&
    isNonnegativeInteger(record.inputCostMicros) &&
    isNonnegativeInteger(record.outputCostMicros) &&
    (record.known ||
      (record.inputCostMicros === 0 && record.outputCostMicros === 0)) &&
    record.rounding === "ceil";
}

function parseModelSelection(value: string, turnKind: TurnRow["turnKind"]): CampaignPlayTurnModelSelection {
  const record = parseRecord(value, "Campaign Play model selection");
  if (canonicalizeCampaignPlayProjection(record) !== value) {
    throw corrupt("Campaign Play model selection is not stored in canonical form.");
  }
  const keys = Object.keys(record).sort().join("|");
  if (
    turnKind === "opening" && keys === "narrator|openingPlanner|turnKind" &&
    record.turnKind === "opening" && isRequestedModel(record.openingPlanner) &&
    isRequestedModel(record.narrator)
  ) {
    return record as unknown as CampaignPlayTurnModelSelection;
  }
  if (
    turnKind === "player_action" &&
    (keys === "actorReplanner|gameMaster|judge|narrator|turnKind" ||
      keys === "actorReplanner|gameMaster|judge|narrator|routeKind|turnKind") &&
    record.turnKind === "player_action" && isRequestedModel(record.judge) &&
    isRequestedModel(record.gameMaster) && isRequestedModel(record.actorReplanner) &&
    isRequestedModel(record.narrator) &&
    (record.routeKind === undefined || record.routeKind === "full_authority" ||
      record.routeKind === "certified_move" || record.routeKind === "certified_wait" ||
      record.routeKind === "certified_contact" || record.routeKind === "certified_observe")
  ) {
    return record as unknown as CampaignPlayTurnModelSelection;
  }
  throw corrupt("Campaign Play model selection does not match the turn kind.");
}

function validateAdmissionDocument(document: CampaignPlayTurnAdmissionDocument): void {
  canonicalizeCampaignPlayProjection(document.frame);
  if (document.turnKind === "opening") {
    campaignPlayOpeningAdmissionRequestSchema.parse(document.request);
  } else {
    campaignPlayTurnAdmissionRequestSchema.parse(document.request);
  }
}

function resolveActionExecutionRoute(
  document: CampaignPlayTurnAdmissionDocument,
  selection: CampaignPlayTurnModelSelection,
): CampaignPlayActionExecutionRouteKind {
  if (document.turnKind !== "player_action" || selection.turnKind !== "player_action") {
    return "full_authority";
  }
  const raw = document.frame.executionRoute;
  if (raw === undefined) {
    if (selection.routeKind !== undefined && selection.routeKind !== "full_authority") {
      throw new Error("certified route selection has no admission authority");
    }
    return "full_authority";
  }
  const route = campaignPlayActionExecutionRouteSchema.parse(raw);
  const selectedKind = selection.routeKind ?? "full_authority";
  if (route.kind !== selectedKind) {
    throw new Error("route selection disagrees with admission authority");
  }
  if (route.kind !== "full_authority") {
    const domain = route.kind === "certified_move"
      ? "campaign_play_certified_move"
      : route.kind === "certified_wait"
        ? "campaign_play_certified_wait"
        : route.kind === "certified_contact"
          ? "campaign_play_certified_contact"
          : "campaign_play_certified_observe";
    if (route.certificateHash !== hashCampaignPlayProjection({ domain, certificate: route.certificate })) {
      throw new Error("certified route hash is invalid");
    }
  }
  return route.kind;
}

function validateModelSelection(selection: CampaignPlayTurnModelSelection, turnKind: TurnRow["turnKind"]): void {
  try {
    parseModelSelection(canonicalizeCampaignPlayProjection(selection), turnKind);
  } catch (error) {
    throw new CampaignPlayTurnRepositoryError(
      "turn_stage_invalid",
      "Campaign Play admission model selection is invalid.",
      { cause: error },
    );
  }
}

function stageInvalid(message: string): CampaignPlayTurnRepositoryError {
  return new CampaignPlayTurnRepositoryError("turn_stage_invalid", message);
}

function fenceLost(message: string): CampaignPlayTurnRepositoryError {
  return new CampaignPlayTurnRepositoryError("turn_fence_lost", message);
}

function assertChronologicalBoundary(
  turn: LoadedCampaignPlayTurn,
  boundaryAt: number,
  boundary: string,
): void {
  if (boundaryAt < turn.updatedAt) {
    throw fenceLost(`Campaign Play ${boundary} precedes the durable turn boundary.`);
  }
}

function isNonemptyText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function resolveStageClaimRoute(
  turnKind: TurnRow["turnKind"],
  stage: CampaignPlayTurnStage,
  selection: CampaignPlayTurnModelSelection,
): StageClaimRoute {
  if (
    turnKind === "player_action" && selection.turnKind === "player_action" &&
    (selection.routeKind === "certified_move" || selection.routeKind === "certified_wait" ||
      selection.routeKind === "certified_contact" || selection.routeKind === "certified_observe") &&
    stage === "admitted"
  ) {
    return {
      progress: "interpreting",
      model: { kind: "game_master", requested: selection.gameMaster },
    };
  }
  if (stage === "planned") return { progress: "settling", model: null };
  if (stage === "primary_settled") return { progress: "world_acting", model: null };
  if (stage === "actors_settled") return { progress: "revealing", model: null };
  if (stage === "visibility_projected") {
    return {
      progress: "narrating",
      model: { kind: "narrator", requested: selection.narrator },
    };
  }
  if (
    turnKind === "opening" &&
    selection.turnKind === "opening" &&
    stage === "admitted"
  ) {
    return {
      progress: "interpreting",
      model: { kind: "opening_planner", requested: selection.openingPlanner },
    };
  }
  if (
    turnKind === "player_action" &&
    selection.turnKind === "player_action" &&
    stage === "admitted"
  ) {
    return {
      progress: "interpreting",
      model: { kind: "judge", requested: selection.judge },
    };
  }
  if (
    turnKind === "player_action" &&
    selection.turnKind === "player_action" &&
    stage === "judged"
  ) {
    return {
      progress: "interpreting",
      model: { kind: "game_master", requested: selection.gameMaster },
    };
  }
  throw stageInvalid(`Campaign Play ${turnKind} turn cannot claim ${stage}.`);
}

function requestedModelForStageKind(
  selection: CampaignPlayTurnModelSelection,
  kind: CampaignPlayTurnModelStageKind,
): CampaignPlayRequestedModel | null {
  if (kind === "narrator") return selection.narrator;
  if (selection.turnKind === "opening" && kind === "opening_planner") {
    return selection.openingPlanner;
  }
  if (selection.turnKind === "player_action" && kind === "judge") return selection.judge;
  if (selection.turnKind === "player_action" && kind === "game_master") {
    return selection.gameMaster;
  }
  if (selection.turnKind === "player_action" && kind === "actor_replanner") {
    return selection.actorReplanner;
  }
  return null;
}

function modelStageId(turnId: string, kind: CampaignPlayTurnModelStageKind): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_turn_model_stage",
    turnId,
    kind,
  });
}

function modelStageAttemptId(stageId: string, attempt: number): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_turn_model_stage_attempt",
    stageId,
    attempt,
  });
}

function assertMutationIdUnused(
  handle: CampaignPlayDatabaseHandle,
  mutationId: string,
): void {
  if (!isNonemptyText(mutationId)) {
    throw stageInvalid("Campaign Play worker mutation requires a nonempty identity.");
  }
  const existing = handle.sqlite.prepare(`
    SELECT 1 AS found FROM campaign_play_runtime_events WHERE event_id = ?
    UNION ALL
    SELECT 1 AS found FROM campaign_play_turn_events WHERE event_id = ?
    LIMIT 1
  `).get(mutationId, mutationId) as { found: number } | undefined;
  if (existing) {
    throw fenceLost("Campaign Play worker mutation identity has already been consumed.");
  }
}

function validateClaimInput(input: ClaimCampaignPlayStageInput): void {
  if (
    !isNonemptyText(input.turnId) ||
    !isNonemptyText(input.owner) ||
    !isNonnegativeInteger(input.observedEpoch) ||
    !isNonnegativeInteger(input.claimedAt) ||
    !isNonnegativeInteger(input.leaseExpiresAt) ||
    input.leaseExpiresAt <= input.claimedAt
  ) {
    throw stageInvalid("Campaign Play worker claim has invalid fencing fields.");
  }
}

function validateRenewalInput(input: RenewCampaignPlayLeaseInput): void {
  const { token } = input;
  if (
    !isNonemptyText(token.turnId) ||
    !isNonemptyText(token.owner) ||
    !isPositiveInteger(token.epoch) ||
    !isNonnegativeInteger(token.expiresAt) ||
    !isNonnegativeInteger(input.renewedAt) ||
    !isNonnegativeInteger(input.leaseExpiresAt)
  ) {
    throw stageInvalid("Campaign Play worker lease renewal has invalid fencing fields.");
  }
}

function validateLeaseToken(token: CampaignPlayWorkerLeaseToken): void {
  if (
    !isNonemptyText(token.turnId) ||
    !isNonemptyText(token.owner) ||
    !isPositiveInteger(token.epoch) ||
    !isNonnegativeInteger(token.expiresAt)
  ) {
    throw stageInvalid("Campaign Play external transition has an invalid fencing token.");
  }
}

function validateExecutionEvidence(evidence: CampaignPlayModelExecutionEvidence): void {
  if (
    !isNonemptyText(evidence.actualProviderId) ||
    !isNonemptyText(evidence.actualModel) ||
    evidence.actualStrategy !== "strict_object" ||
    !isNonnegativeInteger(evidence.inputTokens) ||
    !isNonnegativeInteger(evidence.outputTokens) ||
    !isNonnegativeInteger(evidence.durationMs) ||
    !isNonemptyText(evidence.finishReason)
  ) {
    throw stageInvalid("Campaign Play accepted model artifact lacks complete execution evidence.");
  }
}

function validateInterruptionEvidence(evidence: CampaignPlayExternalInterruptionEvidence): void {
  const allActual = evidence.actualProviderId !== null && evidence.actualModel !== null &&
    evidence.actualStrategy !== null;
  const noActual = evidence.actualProviderId === null && evidence.actualModel === null &&
    evidence.actualStrategy === null;
  if (
    (!allActual && !noActual) ||
    (allActual && (
      !isNonemptyText(evidence.actualProviderId) ||
      !isNonemptyText(evidence.actualModel) ||
      evidence.actualStrategy !== "strict_object"
    )) ||
    (evidence.inputTokens !== null && !isNonnegativeInteger(evidence.inputTokens)) ||
    (evidence.outputTokens !== null && !isNonnegativeInteger(evidence.outputTokens)) ||
    !isNonnegativeInteger(evidence.durationMs) ||
    (evidence.finishReason !== null && !isNonemptyText(evidence.finishReason)) ||
    (evidence.schemaOutcome !== "invalid" && evidence.schemaOutcome !== "transport_error")
  ) {
    throw stageInvalid("Campaign Play external interruption has invalid execution evidence.");
  }
}

function isCanonicalHash(value: unknown): value is string {
  if (typeof value !== "string" || value.length !== 64) return false;
  for (const character of value) {
    if (!(character >= "0" && character <= "9") && !(character >= "a" && character <= "f")) {
      return false;
    }
  }
  return true;
}

export function hashCampaignPlayNarratorPacket(
  turnId: string,
  packet: CampaignPlayProjectionRecord,
): string {
  if (!isNonemptyText(turnId)) {
    throw stageInvalid("Campaign Play narrator packet requires a durable turn identity.");
  }
  canonicalizeCampaignPlayProjection(packet);
  return hashCampaignPlayProjection({
    domain: "campaign_play_narrator_packet",
    turnId,
    packet,
  });
}

function validateModelFailureEvidence(evidence: CampaignPlayModelFailureEvidence): void {
  const allActual = evidence.actualProviderId !== null && evidence.actualModel !== null &&
    evidence.actualStrategy !== null;
  const noActual = evidence.actualProviderId === null && evidence.actualModel === null &&
    evidence.actualStrategy === null;
  if (
    (!allActual && !noActual) ||
    (allActual && (
      !isNonemptyText(evidence.actualProviderId) ||
      !isNonemptyText(evidence.actualModel) ||
      evidence.actualStrategy !== "strict_object"
    )) ||
    (evidence.inputTokens !== null && !isNonnegativeInteger(evidence.inputTokens)) ||
    (evidence.outputTokens !== null && !isNonnegativeInteger(evidence.outputTokens)) ||
    !isNonnegativeInteger(evidence.durationMs) ||
    (evidence.finishReason !== null && !isNonemptyText(evidence.finishReason))
  ) {
    throw stageInvalid("Campaign Play terminal model failure has invalid execution evidence.");
  }
}

interface DeterministicTransitionRoute {
  expectedStage: "planned" | "primary_settled" | "actors_settled";
  nextStage: "primary_settled" | "actors_settled" | "visibility_projected";
  eventKind: "primary_settled" | "actor_job_transitioned" | "visibility_projected";
}

function resolveDeterministicTransition(
  transition: CampaignPlayDeterministicTransition,
): DeterministicTransitionRoute {
  if (transition === "primary_settled") {
    return { expectedStage: "planned", nextStage: "primary_settled", eventKind: "primary_settled" };
  }
  if (transition === "actor_job_transitioned") {
    return { expectedStage: "primary_settled", nextStage: "primary_settled", eventKind: "actor_job_transitioned" };
  }
  if (transition === "actors_settled") {
    return { expectedStage: "primary_settled", nextStage: "actors_settled", eventKind: "actor_job_transitioned" };
  }
  return { expectedStage: "actors_settled", nextStage: "visibility_projected", eventKind: "visibility_projected" };
}

function validateDeterministicTransitionInput(input: CommitCampaignPlayDeterministicInput): void {
  validateLeaseToken(input.token);
  if (!isNonnegativeInteger(input.committedAt) || input.committedAt >= input.token.expiresAt) {
    throw fenceLost("Campaign Play deterministic transition arrived after its worker lease expired.");
  }
  const route = resolveDeterministicTransition(input.transition);
  if (input.token.stage !== route.expectedStage) {
    throw stageInvalid("Campaign Play deterministic transition does not match its claimed stage.");
  }
  if (!Number.isSafeInteger(input.worldVersionAdvance) || input.worldVersionAdvance < 0) {
    throw stageInvalid("Campaign Play deterministic transition has an invalid world-version advance.");
  }
  if (
    (input.transition === "actors_settled" || input.transition === "visibility_projected") &&
    input.worldVersionAdvance > 0
  ) {
    throw stageInvalid("Campaign Play runtime-only deterministic boundary cannot advance mechanical authority.");
  }
  if (input.transition === "visibility_projected") {
    if (!isCanonicalHash(input.publicPacketHash)) {
      throw stageInvalid("Campaign Play visibility projection requires a canonical public packet hash.");
    }
  } else if (input.publicPacketHash !== undefined) {
    throw stageInvalid("Campaign Play public packet hash belongs only to visibility projection.");
  }
}

function nextStageAfterAcceptedModel(
  turnKind: TurnRow["turnKind"],
  stage: CampaignPlayClaimableTurnStage,
  kind: CampaignPlayTurnModelStageKind,
  artifact: unknown,
  authorityKind: CampaignPlayActionExecutionRouteKind,
  acceptedAuthorityHash: string | null,
): CampaignPlayClaimableTurnStage {
  if (turnKind === "opening" && stage === "admitted" && kind === "opening_planner") {
    return "planned";
  }
  if (turnKind === "player_action" && stage === "admitted" && kind === "judge") {
    const judge = campaignPlayJudgeArtifactSchema.safeParse(artifact);
    if (!judge.success) {
      throw stageInvalid("Campaign Play Judge artifact is invalid.");
    }
    return judge.data.primaryPlan.kind === "no_effect" ? "planned" : "judged";
  }
  if (
    turnKind === "player_action" && kind === "game_master" &&
    ((authorityKind === "full_authority" && stage === "judged") ||
      ((authorityKind === "certified_move" || authorityKind === "certified_wait" ||
        authorityKind === "certified_contact" || authorityKind === "certified_observe") &&
        stage === "admitted"))
  ) {
    const gameMaster = campaignPlayGameMasterArtifactSchema.safeParse(artifact);
    if (!gameMaster.success) {
      throw stageInvalid("Campaign Play Game Master artifact is invalid.");
    }
    if (acceptedAuthorityHash === null) {
      throw stageInvalid("Campaign Play Game Master artifact has no immutable authority.");
    }
    if (authorityKind !== "full_authority") {
      const authorityMatches = authorityKind === "certified_move"
        ? "certifiedMoveHash" in gameMaster.data &&
          gameMaster.data.certifiedMoveHash === acceptedAuthorityHash
        : authorityKind === "certified_wait"
          ? "certifiedWaitHash" in gameMaster.data &&
            gameMaster.data.certifiedWaitHash === acceptedAuthorityHash
          : authorityKind === "certified_contact"
            ? "certifiedContactHash" in gameMaster.data &&
              gameMaster.data.certifiedContactHash === acceptedAuthorityHash
            : "certifiedObserveHash" in gameMaster.data &&
              gameMaster.data.certifiedObserveHash === acceptedAuthorityHash;
      if (!authorityMatches) {
        throw stageInvalid("Campaign Play Game Master artifact references another certified route.");
      }
    } else if (
      !("judgeArtifactHash" in gameMaster.data) ||
      gameMaster.data.judgeArtifactHash !== acceptedAuthorityHash
    ) {
      throw stageInvalid("Campaign Play Game Master artifact references another Judge artifact.");
    }
    if (hashCampaignPlayProjection(gameMaster.data.batch) !== gameMaster.data.batchHash) {
      throw stageInvalid("Campaign Play Game Master artifact batch hash is invalid.");
    }
    return "planned";
  }
  throw stageInvalid("Campaign Play model artifact does not match the active stage.");
}

function selectExactStartedAttempt(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  stageId: string,
  workerEpoch: number,
): ModelStageRow {
  const attempts = selectModelStages(handle, turnId).filter((attempt) =>
    attempt.stageId === stageId &&
    attempt.workerEpoch === workerEpoch &&
    attempt.status === "started"
  );
  if (attempts.length !== 1) {
    throw fenceLost("Campaign Play external result has no exact started attempt for its worker epoch.");
  }
  return attempts[0];
}

function createInterruptedEvent(input: {
  turnId: string;
  sequence: number;
  acceptedWorldVersion: number;
  worldVersion: number;
  runtimeRevision: number;
  createdAt: number;
}): CampaignPlaySseEvent {
  return campaignPlaySseEventSchema.parse({
    type: "turn.interrupted",
    retryEligible: true,
    sequence: input.sequence,
    turnId: input.turnId,
    acceptedWorldVersion: input.acceptedWorldVersion,
    worldVersion: input.worldVersion,
    runtimeRevision: input.runtimeRevision,
    createdAt: input.createdAt,
  });
}

function createTerminalEvent(input: {
  type: "turn.completed" | "turn.failed";
  turnId: string;
  sequence: number;
  acceptedWorldVersion: number;
  worldVersion: number;
  runtimeRevision: number;
  createdAt: number;
  publicErrorCode?: CampaignPlayPublicErrorCode;
}): CampaignPlaySseEvent {
  return campaignPlaySseEventSchema.parse(input.type === "turn.completed" ? {
    type: input.type,
    retryEligible: false,
    sequence: input.sequence,
    turnId: input.turnId,
    acceptedWorldVersion: input.acceptedWorldVersion,
    worldVersion: input.worldVersion,
    runtimeRevision: input.runtimeRevision,
    createdAt: input.createdAt,
  } : {
    type: input.type,
    retryEligible: false,
    errorCode: input.publicErrorCode,
    sequence: input.sequence,
    turnId: input.turnId,
    acceptedWorldVersion: input.acceptedWorldVersion,
    worldVersion: input.worldVersion,
    runtimeRevision: input.runtimeRevision,
    createdAt: input.createdAt,
  });
}

function claimLeaseIsAvailable(
  row: Pick<
    TurnRow,
    "stage" | "workerEpoch" | "workerLeaseOwner" | "workerLeaseExpiresAt"
  >,
  route: StageClaimRoute,
  input: ClaimCampaignPlayStageInput,
): void {
  if (row.stage !== input.expectedStage) {
    throw stageInvalid("Campaign Play worker claim does not match the active turn stage.");
  }
  if (row.workerEpoch !== input.observedEpoch) {
    throw fenceLost("Campaign Play worker epoch has advanced.");
  }
  if (row.workerLeaseOwner === null && row.workerLeaseExpiresAt === null) return;
  if (row.workerLeaseOwner === null || row.workerLeaseExpiresAt === null) {
    throw corrupt("Campaign Play worker lease is incomplete.");
  }
  if (row.workerLeaseExpiresAt > input.claimedAt) {
    throw fenceLost("Campaign Play worker lease is still active.");
  }
  if (route.model !== null) {
    throw fenceLost("Campaign Play external worker lease requires explicit interruption before retry.");
  }
}

function createWorkerProgressEvent(
  input: {
    turnId: string;
    sequence: number;
    acceptedWorldVersion: number;
    worldVersion: number;
    runtimeRevision: number;
    createdAt: number;
    progress: StageClaimRoute["progress"];
  },
): CampaignPlaySseEvent {
  return campaignPlaySseEventSchema.parse({
    type: "turn.progressed",
    sequence: input.sequence,
    turnId: input.turnId,
    acceptedWorldVersion: input.acceptedWorldVersion,
    worldVersion: input.worldVersion,
    runtimeRevision: input.runtimeRevision,
    createdAt: input.createdAt,
    progress: input.progress,
  });
}

function insertTurnEvent(
  handle: CampaignPlayDatabaseHandle,
  eventId: string,
  event: CampaignPlaySseEvent,
): void {
  handle.sqlite.prepare(`
    INSERT INTO campaign_play_turn_events (
      event_id, campaign_id, turn_id, sequence, event_type,
      payload_json, sse_cursor, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    eventId,
    handle.campaignId,
    event.turnId,
    event.sequence,
    event.type,
    canonicalizeCampaignPlayProjection(event),
    `${event.turnId}:${event.sequence}`,
    event.createdAt,
  );
}

function readAcceptedWorldVersion(handle: CampaignPlayDatabaseHandle): number {
  const state = handle.sqlite.prepare(`
    SELECT accepted_world_version AS acceptedWorldVersion
    FROM campaign_play_states WHERE campaign_id = ?
  `).get(handle.campaignId) as { acceptedWorldVersion: number } | undefined;
  if (!state || !isPositiveInteger(state.acceptedWorldVersion)) {
    throw corrupt("Campaign Play state has no accepted-world authority.");
  }
  return state.acceptedWorldVersion;
}

function selectModelStages(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
): ModelStageRow[] {
  return handle.sqlite.prepare(`
    SELECT id, stage_id AS stageId, campaign_id AS campaignId, turn_id AS turnId,
      kind, attempt, status, worker_epoch AS workerEpoch,
      requested_provider_id AS requestedProviderId, requested_model AS requestedModel,
      requested_strategy AS requestedStrategy, actual_provider_id AS actualProviderId,
      actual_model AS actualModel, actual_strategy AS actualStrategy,
      input_tokens AS inputTokens, output_tokens AS outputTokens,
      duration_ms AS durationMs, finish_reason AS finishReason,
      schema_outcome AS schemaOutcome, artifact_json AS artifactJson,
      artifact_hash AS artifactHash, error_code AS errorCode,
      created_at AS createdAt, completed_at AS completedAt
    FROM campaign_play_model_stages
    WHERE campaign_id = ? AND turn_id = ?
    ORDER BY stage_id, attempt
  `).all(handle.campaignId, turnId) as ModelStageRow[];
}

function telemetryStageForProgress(
  progress: CampaignPlayPublicProgress,
  workerEpoch: number,
  modelStages: readonly ModelStageRow[],
  routeKind: CampaignPlayActionExecutionRouteKind,
): CampaignPlayClaimableTurnStage {
  if (progress === "settling") return "planned";
  if (progress === "world_acting") return "primary_settled";
  if (progress === "revealing") return "actors_settled";
  if (progress === "narrating") return "visibility_projected";
  const interpreting = modelStages.filter((attempt) =>
    attempt.workerEpoch === workerEpoch &&
    (attempt.kind === "opening_planner" || attempt.kind === "judge" || attempt.kind === "game_master")
  );
  if (interpreting.length !== 1) {
    throw corrupt("Campaign Play interpreting telemetry lacks one durable model-stage owner.");
  }
  return interpreting[0]!.kind === "game_master" && routeKind === "full_authority"
    ? "judged"
    : "admitted";
}

function telemetryCost(
  inputTokens: number | null,
  outputTokens: number | null,
  pricing: CampaignPlayModelPricing,
): number | null {
  if (!pricing.known) return null;
  if (inputTokens === null || outputTokens === null) return null;
  const unit = BigInt(pricing.tokenUnit);
  const ceilComponent = (tokens: number, rate: number): bigint => {
    const numerator = BigInt(tokens) * BigInt(rate);
    return (numerator + unit - 1n) / unit;
  };
  const value = ceilComponent(inputTokens, pricing.inputCostMicros) +
    ceilComponent(outputTokens, pricing.outputCostMicros);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw corrupt("Campaign Play model telemetry cost exceeds the safe integer range.");
  }
  return Number(value);
}

function telemetrySum(values: readonly number[], label: string): number {
  const value = values.reduce((total, current) => total + BigInt(current), 0n);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw corrupt(`Campaign Play ${label} telemetry exceeds the safe integer range.`);
  }
  return Number(value);
}

function validateModelStages(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  selection: CampaignPlayTurnModelSelection,
): ModelStageRow[] {
  const stages = selectModelStages(handle, row.turnId);
  const stageById = new Map(stages.map((stage) => [stage.id, stage]));
  const grouped = new Map<string, ModelStageRow[]>();
  const actorReplannerStages = new Map(
    (handle.sqlite.prepare(`SELECT job_id AS jobId, worker_epoch AS workerEpoch
      FROM campaign_play_actor_jobs WHERE campaign_id = ? AND turn_id = ?`)
      .all(handle.campaignId, row.turnId) as Array<{ jobId: string; workerEpoch: number }>)
      .map((job) => [deriveCampaignPlayActorReplanStageId(job.jobId), job]),
  );
  type LinkedActorReplanAttempt = {
    modelStageRowId: string; stageId: string; jobId: string;
    campaignId: string; turnId: string; actorId: string; attemptNumber: number;
    modelWorkerEpoch: number; actorJobWorkerEpoch: number;
    claimTurnWorkerEpoch: number; frameHash: string;
    frozenBaseWorldVersion: number; deadlineAt: number;
    requestedProviderId: string; requestedModel: string; requestedStrategy: string;
    retryConsumedAt: number | null; createdAt: number;
    jobCampaignId: string; jobTurnId: string;
    jobActorId: string; jobFrozenBaseWorldVersion: number;
    jobWorkerEpoch: number; jobClaimTurnWorkerEpoch: number | null;
    turnCampaignId: string; turnFrameHash: string;
  };
  const linkedAttemptRows = (handle.sqlite.prepare(`SELECT attempt.model_stage_row_id AS modelStageRowId,
        attempt.stage_id AS stageId, attempt.job_id AS jobId,
        attempt.campaign_id AS campaignId, attempt.turn_id AS turnId,
        attempt.actor_id AS actorId, attempt.attempt_number AS attemptNumber,
        attempt.model_worker_epoch AS modelWorkerEpoch,
        attempt.actor_job_worker_epoch AS actorJobWorkerEpoch,
        attempt.claim_turn_worker_epoch AS claimTurnWorkerEpoch,
        attempt.frame_hash AS frameHash,
        attempt.frozen_base_world_version AS frozenBaseWorldVersion,
        attempt.deadline_at AS deadlineAt,
        attempt.requested_provider_id AS requestedProviderId,
        attempt.requested_model AS requestedModel,
        attempt.requested_strategy AS requestedStrategy,
        attempt.retry_consumed_at AS retryConsumedAt,
        attempt.created_at AS createdAt,
        job.campaign_id AS jobCampaignId, job.turn_id AS jobTurnId, job.actor_id AS jobActorId,
        job.frozen_base_world_version AS jobFrozenBaseWorldVersion,
        job.worker_epoch AS jobWorkerEpoch,
        job.claim_turn_worker_epoch AS jobClaimTurnWorkerEpoch,
        turn_row.campaign_id AS turnCampaignId, turn_row.frame_hash AS turnFrameHash
      FROM campaign_play_actor_replan_attempts attempt
      JOIN campaign_play_actor_jobs job ON job.job_id = attempt.job_id
      JOIN campaign_play_turns turn_row ON turn_row.id = attempt.turn_id
      WHERE attempt.campaign_id = ? AND attempt.turn_id = ?`)
      .all(handle.campaignId, row.turnId) as LinkedActorReplanAttempt[]);
  const linkedAttempts = new Map(
    linkedAttemptRows.map((attempt) => [attempt.modelStageRowId, attempt]),
  );
  const linkedAttemptChains = new Map<string, Map<number, LinkedActorReplanAttempt>>();
  for (const attempt of linkedAttemptRows) {
    const chain = linkedAttemptChains.get(attempt.jobId) ?? new Map<number, LinkedActorReplanAttempt>();
    chain.set(attempt.attemptNumber, attempt);
    linkedAttemptChains.set(attempt.jobId, chain);
  }
  const retryChainDeadlineValid = (
    priorAttempt: LinkedActorReplanAttempt,
    laterAttempt: LinkedActorReplanAttempt,
  ): boolean => {
    const priorStage = stageById.get(priorAttempt.modelStageRowId);
    if (priorStage?.status !== "interrupted") return false;
    const modelContractInvalid = priorStage.schemaOutcome === "invalid"
      && priorStage.errorCode === "model_contract_invalid"
      && laterAttempt.createdAt < priorAttempt.deadlineAt
      && (
        // Keep immutable Task 213 chains readable after the guard migration.
        (priorAttempt.attemptNumber === 1 && laterAttempt.attemptNumber === 2 &&
          laterAttempt.deadlineAt === priorAttempt.deadlineAt)
        || (
          laterAttempt.deadlineAt > laterAttempt.createdAt
          && laterAttempt.deadlineAt > priorAttempt.deadlineAt
        )
      );
    const providerUnavailable = priorStage.schemaOutcome === "transport_error"
      && priorStage.errorCode === "provider_unavailable"
      && laterAttempt.createdAt < priorAttempt.deadlineAt
      && laterAttempt.deadlineAt > laterAttempt.createdAt
      && laterAttempt.deadlineAt > priorAttempt.deadlineAt;
    const stageTimeout = priorStage.schemaOutcome === "transport_error"
      && priorStage.errorCode === "stage_timeout"
      && laterAttempt.createdAt >= priorAttempt.deadlineAt
      && laterAttempt.deadlineAt > laterAttempt.createdAt
      && laterAttempt.deadlineAt > priorAttempt.deadlineAt;
    return modelContractInvalid || providerUnavailable || stageTimeout;
  };
  const retryChainLinkValid = (
    priorAttempt: LinkedActorReplanAttempt,
    laterAttempt: LinkedActorReplanAttempt,
  ): boolean => retryChainDeadlineValid(priorAttempt, laterAttempt) &&
    laterAttempt.attemptNumber === priorAttempt.attemptNumber + 1 &&
    laterAttempt.frameHash === priorAttempt.frameHash &&
    laterAttempt.frozenBaseWorldVersion === priorAttempt.frozenBaseWorldVersion &&
    laterAttempt.requestedProviderId === priorAttempt.requestedProviderId &&
    laterAttempt.requestedModel === priorAttempt.requestedModel &&
    laterAttempt.actorJobWorkerEpoch === priorAttempt.actorJobWorkerEpoch &&
    laterAttempt.claimTurnWorkerEpoch === priorAttempt.claimTurnWorkerEpoch &&
    laterAttempt.modelWorkerEpoch === priorAttempt.modelWorkerEpoch + 1 &&
    priorAttempt.retryConsumedAt === laterAttempt.createdAt;
  for (const stage of stages) {
    try {
      campaignPlayModelStageSchema.parse({
        stageId: stage.stageId,
        campaignId: stage.campaignId,
        turnId: stage.turnId,
        kind: stage.kind,
        attempt: stage.attempt,
        status: stage.status,
        workerEpoch: stage.workerEpoch,
        requestedProviderId: stage.requestedProviderId,
        requestedModel: stage.requestedModel,
        requestedStrategy: stage.requestedStrategy,
        actualProviderId: stage.actualProviderId,
        actualModel: stage.actualModel,
        actualStrategy: stage.actualStrategy,
        inputTokens: stage.inputTokens,
        outputTokens: stage.outputTokens,
        durationMs: stage.durationMs,
        finishReason: stage.finishReason,
        schemaOutcome: stage.schemaOutcome,
        artifactJson: stage.artifactJson,
        artifactHash: stage.artifactHash,
        errorCode: stage.errorCode,
      });
    } catch (error) {
      throw corrupt("Campaign Play model stage violates its storage contract.", error);
    }
    const requested = requestedModelForStageKind(selection, stage.kind);
    const actorJob = stage.kind === "actor_replanner"
      ? actorReplannerStages.get(stage.stageId)
      : undefined;
    const linkedAttempt = stage.kind === "actor_replanner"
      ? linkedAttempts.get(stage.id)
      : undefined;
    const linkedAttemptChain = linkedAttempt === undefined
      ? undefined
      : linkedAttemptChains.get(linkedAttempt.jobId);
    const priorLinkedAttempt = linkedAttempt === undefined
      ? undefined
      : linkedAttemptChain?.get(linkedAttempt.attemptNumber - 1);
    const laterLinkedAttempt = linkedAttempt === undefined
      ? undefined
      : linkedAttemptChain?.get(linkedAttempt.attemptNumber + 1);
    const linkedAttemptChainValid = linkedAttempt === undefined
      ? false
      : linkedAttempt.attemptNumber >= 1 && linkedAttempt.attemptNumber <= 3 &&
        (linkedAttempt.attemptNumber === 1 || (
          priorLinkedAttempt !== undefined && retryChainLinkValid(priorLinkedAttempt, linkedAttempt)
        )) &&
        (laterLinkedAttempt === undefined || retryChainLinkValid(linkedAttempt, laterLinkedAttempt));
    const linkedStoredIdentityValid = linkedAttempt !== undefined &&
      linkedAttempt.stageId === stage.stageId &&
      linkedAttempt.stageId === deriveCampaignPlayActorReplanStageId(linkedAttempt.jobId) &&
      linkedAttempt.campaignId === stage.campaignId &&
      linkedAttempt.jobCampaignId === stage.campaignId &&
      linkedAttempt.turnCampaignId === stage.campaignId &&
      linkedAttempt.turnId === row.turnId &&
      linkedAttempt.jobTurnId === row.turnId &&
      linkedAttempt.actorId === linkedAttempt.jobActorId &&
      linkedAttempt.attemptNumber === stage.attempt &&
      linkedAttempt.modelWorkerEpoch === stage.workerEpoch &&
      linkedAttempt.frameHash === row.frameHash &&
      linkedAttempt.frameHash === linkedAttempt.turnFrameHash &&
      linkedAttempt.frozenBaseWorldVersion === linkedAttempt.jobFrozenBaseWorldVersion &&
      linkedAttempt.deadlineAt > linkedAttempt.createdAt &&
      linkedAttemptChainValid &&
      linkedAttempt.requestedProviderId === stage.requestedProviderId &&
      linkedAttempt.requestedModel === stage.requestedModel &&
      linkedAttempt.requestedStrategy === stage.requestedStrategy;
    const linkedLeaseStillOwnsJob = linkedAttempt !== undefined &&
      linkedAttempt.actorJobWorkerEpoch === linkedAttempt.jobWorkerEpoch &&
      linkedAttempt.claimTurnWorkerEpoch === linkedAttempt.jobClaimTurnWorkerEpoch;
    // A linked attempt is immutable evidence.  Once its stage is terminal, a
    // later explicit turn resume may advance the actor-job/turn lease epoch;
    // that must not make the original attempt row look corrupt.  Started
    // attempts still have to be owned by the current claim so stale work is
    // fenced before any new settlement.
    const linkedIdentityValid = linkedStoredIdentityValid &&
      (linkedLeaseStillOwnsJob || stage.status !== "started");
    const identityMatchesOwner = stage.kind === "actor_replanner"
      ? linkedIdentityValid || (linkedAttempt === undefined && actorJob !== undefined && stage.workerEpoch <= actorJob.workerEpoch)
      : stage.stageId === modelStageId(row.turnId, stage.kind);
    if (
      stage.campaignId !== handle.campaignId ||
      stage.turnId !== row.turnId ||
      requested === null ||
      !identityMatchesOwner ||
      stage.requestedProviderId !== requested.providerId ||
      stage.requestedModel !== requested.model ||
      stage.requestedStrategy !== requested.strategy
    ) {
      throw corrupt("Campaign Play model stage identity or requested model has drifted.");
    }
    if (stage.status === "accepted") {
      if (linkedAttempt !== undefined && (stage.completedAt === null
        || stage.completedAt >= linkedAttempt.deadlineAt)) {
        throw corrupt("Campaign Play actor replan acceptance is at or after its hard deadline.");
      }
      try {
        const artifact = JSON.parse(stage.artifactJson ?? "") as unknown;
        if (
          canonicalizeCampaignPlayProjection(artifact) !== stage.artifactJson ||
          hashCampaignPlayProjection({
            domain: "campaign_play_model_artifact",
            stageId: stage.stageId,
            kind: stage.kind,
            artifact,
          }) !== stage.artifactHash
        ) {
          throw new TypeError("artifact bytes or hash have drifted");
        }
        if (stage.kind === "judge") campaignPlayJudgeArtifactSchema.parse(artifact);
        if (stage.kind === "game_master") campaignPlayGameMasterArtifactSchema.parse(artifact);
        if (stage.kind === "actor_replanner") campaignPlayActorPlanSchema.parse(artifact);
      } catch (error) {
        throw corrupt("Campaign Play accepted model artifact is invalid.", error);
      }
    }
    const entries = grouped.get(stage.stageId) ?? [];
    entries.push(stage);
    grouped.set(stage.stageId, entries);
  }
  for (const entries of grouped.values()) {
    let previousEpoch = 0;
    for (let index = 0; index < entries.length; index += 1) {
      const stage = entries[index];
      if (stage.attempt !== index + 1 || stage.workerEpoch <= previousEpoch) {
        throw corrupt("Campaign Play model stage attempts are not contiguous and fenced.");
      }
      previousEpoch = stage.workerEpoch;
    }
  }
  return stages;
}

function selectExactInterruptedAttemptForStage(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  selection: CampaignPlayTurnModelSelection,
  interruptedStage: CampaignPlayClaimableTurnStage,
  workerEpoch: number,
  stages = selectModelStages(handle, row.turnId),
): ModelStageRow {
  let route: StageClaimRoute;
  try {
    route = resolveStageClaimRoute(row.turnKind, interruptedStage, selection);
  } catch (error) {
    throw corrupt("Campaign Play interrupted stage has no external recovery route.", error);
  }
  if (route.model === null) {
    throw corrupt("Campaign Play interrupted stage is deterministic.");
  }
  const stageId = modelStageId(row.turnId, route.model.kind);
  const matching = stages.filter((attempt) =>
    attempt.stageId === stageId &&
    attempt.kind === route.model?.kind &&
    attempt.workerEpoch === workerEpoch &&
    attempt.status === "interrupted"
  );
  if (matching.length !== 1) {
    throw corrupt("Campaign Play interrupted turn lacks exact stage and epoch evidence.");
  }
  return matching[0];
}

interface NarrationStorageRow {
  narrationId: string;
  turnId: string;
  status: string;
  packetHash: string;
  packetJson: string;
  beatsJson: string | null;
  displayText: string | null;
  suggestedActionsJson: string | null;
  effectsJson: string | null;
  errorCode: string | null;
  createdAt: number;
  completedAt: number | null;
}

function validateNarratorPacket(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  expectedStatus: "pending" | "complete",
): NarrationStorageRow {
  if (row.publicPacketHash === null) {
    throw corrupt("Campaign Play visible turn lacks its public narrator packet hash.");
  }
  const stored = handle.sqlite.prepare(`
    SELECT narration_id AS narrationId, turn_id AS turnId, status,
      packet_hash AS packetHash, packet_json AS packetJson,
      beats_json AS beatsJson, display_text AS displayText,
      suggested_actions_json AS suggestedActionsJson, effects_json AS effectsJson,
      error_code AS errorCode, created_at AS createdAt, completed_at AS completedAt
    FROM campaign_play_narrations WHERE campaign_id = ? AND turn_id = ?
  `).get(handle.campaignId, row.turnId) as NarrationStorageRow | undefined;
  if (
    !stored || stored.turnId !== row.turnId ||
    stored.packetHash !== row.publicPacketHash || stored.status !== expectedStatus
  ) {
    throw corrupt("Campaign Play narrator packet identity disagrees with its turn.");
  }
  if (
    expectedStatus === "pending" && (
      stored.beatsJson !== null || stored.displayText !== null ||
      stored.suggestedActionsJson !== null || stored.effectsJson !== null ||
      stored.errorCode !== null || stored.completedAt !== null
    )
  ) {
    throw corrupt("Campaign Play active narrator packet carries premature terminal fields.");
  }
  try {
    const packet = JSON.parse(stored.packetJson) as unknown;
    if (
      packet === null || typeof packet !== "object" || Array.isArray(packet) ||
      canonicalizeCampaignPlayProjection(packet) !== stored.packetJson ||
      hashCampaignPlayNarratorPacket(
        row.turnId,
        packet as CampaignPlayProjectionRecord,
      ) !== row.publicPacketHash
    ) {
      throw new TypeError("narrator packet bytes or domain hash have drifted");
    }
  } catch (error) {
    throw corrupt("Campaign Play narrator packet is invalid.", error);
  }
  return stored;
}

function validateCompletedNarration(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  stages: ModelStageRow[],
): void {
  const narratorAttempts = stages.filter((stage) =>
    stage.kind === "narrator" && stage.status === "accepted"
  );
  if (narratorAttempts.length !== 1) {
    throw corrupt("Campaign Play completed turn lacks one accepted narrator artifact.");
  }
  let narration: ReturnType<typeof campaignPlayNarrationSchema.parse>;
  try {
    narration = campaignPlayNarrationSchema.parse(
      JSON.parse(narratorAttempts[0].artifactJson ?? ""),
    );
  } catch (error) {
    throw corrupt("Campaign Play accepted narrator artifact violates its contract.", error);
  }
  const stored = validateNarratorPacket(handle, row, "complete");
  if (
    stored.status !== "complete" || stored.errorCode !== null ||
    stored.narrationId !== narration.narrationId || stored.turnId !== narration.turnId ||
    stored.turnId !== row.turnId || stored.packetHash !== row.publicPacketHash ||
    stored.beatsJson !== canonicalizeCampaignPlayProjection(narration.beats) ||
    stored.displayText !== narration.displayText ||
    stored.suggestedActionsJson !== canonicalizeCampaignPlayProjection(narration.suggestedActions) ||
    stored.effectsJson !== canonicalizeCampaignPlayProjection(narration.effects) ||
    stored.createdAt !== narration.createdAt || stored.completedAt !== row.completedAt
  ) {
    throw corrupt("Campaign Play completed narration disagrees with its accepted artifact.");
  }
}

function validateSeparateNarrationOperation(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  controlBudgetContinuity = false,
): void {
  const packet = validateNarratorPacket(handle, row, "pending");
  const operations = handle.sqlite.prepare(`SELECT operation_id AS operationId,
      result_id AS resultId, narration_id AS narrationId, packet_hash AS packetHash,
      source_kind AS sourceKind, status
    FROM campaign_play_narration_operations
    WHERE campaign_id = ? AND turn_id = ?`).all(
      handle.campaignId,
      row.turnId,
    ) as Array<{
      operationId: string;
      resultId: string;
      narrationId: string;
      packetHash: string;
      sourceKind: string;
      status: string;
    }>;
  if (
    operations.length !== 1 || operations[0]!.operationId.length === 0 ||
    operations[0]!.resultId.length === 0 ||
    operations[0]!.narrationId !== packet.narrationId ||
    operations[0]!.packetHash !== packet.packetHash ||
    !["pending", "running", "failed", "complete"].includes(operations[0]!.status)
  ) {
    throw corrupt("Campaign Play completed result lacks one exact narration operation.");
  }
  if (controlBudgetContinuity && operations[0]!.sourceKind !== "deterministic_continuity") {
    throw corrupt("Campaign Play continuity turn lacks its deterministic narration operation.");
  }
  const sceneCount = handle.sqlite.prepare(`SELECT COUNT(*) AS count
    FROM campaign_play_proper_scenes
    WHERE campaign_id = ? AND operation_id = ?`).get(
      handle.campaignId,
      operations[0]!.operationId,
    ) as { count: number };
  if ((operations[0]!.status === "complete") !== (sceneCount.count === 1)) {
    throw corrupt("Campaign Play narration operation disagrees with proper-scene persistence.");
  }
}

function stageProgressRank(stage: CampaignPlayTurnStage): number {
  switch (stage) {
    case "admitted": return 0;
    case "judged": return 1;
    case "planned": return 2;
    case "primary_settled": return 3;
    case "actors_settled": return 4;
    case "visibility_projected": return 5;
    case "completed": return 6;
    case "interrupted":
    case "failed":
      return -1;
  }
}

function validateAcceptedStageProgress(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  stages: ModelStageRow[],
  document: CampaignPlayTurnAdmissionDocument,
  selection: CampaignPlayTurnModelSelection,
  controlBudgetContinuity = false,
): void {
  if (row.turnKind === "opening" && row.stage === "judged") {
    throw corrupt("Campaign Play opening turn cannot enter the judged stage.");
  }
  const acceptedKinds = new Set(
    stages.filter((stage) => stage.status === "accepted").map((stage) => stage.kind),
  );
  if (row.stage === "failed") {
    if (controlBudgetContinuity) {
      throw corrupt("Campaign Play continuity turn has an invalid visible boundary.");
    }
    if (acceptedKinds.has("narrator")) {
      throw corrupt("Campaign Play failed turn cannot retain an accepted narrator result.");
    }
    return;
  }
  const effectiveStage = row.stage === "interrupted" ? row.interruptedStage : row.stage;
  if (effectiveStage === null) {
    throw corrupt("Campaign Play turn has no valid effective stage for model evidence.");
  }
  if (controlBudgetContinuity) {
    if (
      row.turnKind !== "player_action" ||
      (row.stage !== "visibility_projected" && row.stage !== "completed") ||
      effectiveStage !== row.stage
    ) {
      throw corrupt("Campaign Play continuity turn has an invalid visible boundary.");
    }
    if (stages.some((stage) => stage.status === "accepted" && stage.kind === "narrator")) {
      throw corrupt("Campaign Play continuity turn cannot retain an accepted narrator result.");
    }
    return;
  }
  const rank = stageProgressRank(effectiveStage);
  const acceptedJudge = stages.find((stage) =>
    stage.kind === "judge" && stage.status === "accepted"
  );
  const judgeRequiresGameMaster = acceptedJudge === undefined
    ? true
    : campaignPlayJudgeArtifactSchema.parse(
        JSON.parse(acceptedJudge.artifactJson ?? ""),
      ).primaryPlan.kind === "game_master_required";
  const routeKind = resolveActionExecutionRoute(document, selection);
  const hasSeparateNarrationOperation = row.turnKind === "player_action" &&
    handle.sqlite.prepare(`SELECT 1 FROM campaign_play_narration_operations
      WHERE campaign_id = ? AND turn_id = ? LIMIT 1`).get(
        handle.campaignId,
        row.turnId,
      ) !== undefined;
  const required = row.turnKind === "opening"
    ? [
        { kind: "opening_planner" as const, rank: 2 },
        { kind: "narrator" as const, rank: 6 },
      ]
    : [
        { kind: "judge" as const, rank: routeKind === "full_authority" ? 1 : 7 },
        { kind: "game_master" as const, rank: routeKind !== "full_authority"
          ? 2
          : judgeRequiresGameMaster ? 2 : 7 },
        { kind: "narrator" as const, rank: hasSeparateNarrationOperation ? 7 : 6 },
      ];
  for (const evidence of required) {
    if (acceptedKinds.has(evidence.kind) !== (rank >= evidence.rank)) {
      throw corrupt("Campaign Play accepted model evidence disagrees with turn progress.");
    }
  }
}

function validateAcceptedStageEvents(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  stages: ModelStageRow[],
): void {
  const acceptedAttempts = stages.filter((stage) =>
    stage.status === "accepted" && stage.kind !== "narrator" && stage.kind !== "actor_replanner"
  );
  const stageEvents = handle.sqlite.prepare(`
    SELECT worker_epoch AS workerEpoch
    FROM campaign_play_runtime_events
    WHERE campaign_id = ? AND turn_id = ? AND kind = 'stage_accepted'
    ORDER BY sequence
  `).all(handle.campaignId, row.turnId) as Array<{ workerEpoch: number | null }>;
  if (
    acceptedAttempts.length !== stageEvents.length ||
    acceptedAttempts.some((attempt) =>
      !stageEvents.some((event) => event.workerEpoch === attempt.workerEpoch)
    )
  ) {
    throw corrupt("Campaign Play accepted model evidence has no matching stage event.");
  }
}

function inputHash(document: CampaignPlayTurnAdmissionDocument): string {
  return hashCampaignPlayProjection({ domain: "campaign_play_turn_input", document });
}

function frameHash(frame: CampaignPlayProjectionRecord): string {
  return hashCampaignPlayProjection({ domain: "campaign_play_turn_frame", frame });
}

function selectTurn(
  handle: CampaignPlayDatabaseHandle,
  predicate: "id" | "idempotency" | "active",
  value?: string,
): TurnRow | undefined {
  const where = predicate === "id"
    ? "id = ?"
    : predicate === "idempotency"
      ? "campaign_id = ? AND idempotency_key = ?"
      : "campaign_id = ? AND stage NOT IN ('completed', 'failed')";
  const parameters = predicate === "id"
    ? [value]
    : predicate === "idempotency"
      ? [handle.campaignId, value]
      : [handle.campaignId];
  return handle.sqlite.prepare(`
    SELECT id AS turnId, campaign_id AS campaignId, turn_kind AS turnKind,
      supersedes_turn_id AS supersedesTurnId, input_json AS inputJson,
      input_hash AS inputHash, idempotency_key AS idempotencyKey,
      expected_world_version AS expectedWorldVersion,
      expected_runtime_revision AS expectedRuntimeRevision,
      base_world_version AS baseWorldVersion, final_world_version AS finalWorldVersion,
      stage, frame_hash AS frameHash, next_event_sequence AS nextEventSequence,
      worker_lease_owner AS workerLeaseOwner, worker_epoch AS workerEpoch,
      worker_lease_expires_at AS workerLeaseExpiresAt,
      model_selection_json AS modelSelectionJson, public_packet_hash AS publicPacketHash,
      interrupted_stage AS interruptedStage, error_code AS errorCode,
      resume_eligible AS resumeEligible, mutation_audit_json AS mutationAuditJson,
      submitted_at AS submittedAt, updated_at AS updatedAt, completed_at AS completedAt
    FROM campaign_play_turns WHERE ${where}
    ORDER BY submitted_at DESC, id DESC LIMIT 1
  `).get(...parameters) as TurnRow | undefined;
}

function parseDocument(row: TurnRow): CampaignPlayTurnAdmissionDocument {
  const record = parseRecord(row.inputJson, "Campaign Play turn input");
  if (record.turnKind !== row.turnKind) throw corrupt("Campaign Play turn kind disagrees with its input.");
  const document = record as unknown as CampaignPlayTurnAdmissionDocument;
  try {
    validateAdmissionDocument(document);
  } catch (error) {
    throw corrupt("Campaign Play turn input violates its admission contract.", error);
  }
  if (canonicalizeCampaignPlayProjection(document) !== row.inputJson) {
    throw corrupt("Campaign Play turn input is not stored in canonical form.");
  }
  if (inputHash(document) !== row.inputHash || frameHash(document.frame) !== row.frameHash) {
    throw corrupt("Campaign Play turn input or frame hash has drifted.");
  }
  return document;
}

function publicProgressForStage(
  stage: Exclude<CampaignPlayTurnStage, "interrupted" | "completed" | "failed">,
): "interpreting" | "settling" | "world_acting" | "revealing" | "narrating" {
  switch (stage) {
    case "admitted":
    case "judged":
      return "interpreting";
    case "planned":
      return "settling";
    case "primary_settled":
      return "world_acting";
    case "actors_settled":
      return "revealing";
    case "visibility_projected":
      return "narrating";
  }
}

function advanceReplayStageForAcceptedModel(
  handle: CampaignPlayDatabaseHandle,
  row: TurnRow,
  currentStage: Exclude<CampaignPlayTurnStage, "interrupted" | "completed" | "failed">,
  workerEpoch: number,
): Exclude<CampaignPlayTurnStage, "interrupted" | "completed" | "failed"> {
  const accepted = handle.sqlite.prepare(`
    SELECT kind, artifact_json AS artifactJson FROM campaign_play_model_stages
    WHERE campaign_id = ? AND turn_id = ? AND worker_epoch = ? AND status = 'accepted'
      AND kind <> 'actor_replanner'
  `).all(handle.campaignId, row.turnId, workerEpoch) as Array<{
    kind: CampaignPlayTurnModelStageKind;
    artifactJson: string | null;
  }>;
  if (accepted.length !== 1) {
    throw corrupt("Campaign Play accepted stage event has no unique model result.");
  }
  const kind = accepted[0].kind;
  const document = parseDocument(row);
  const selection = parseModelSelection(row.modelSelectionJson, row.turnKind);
  const routeKind = resolveActionExecutionRoute(document, selection);
  if (row.turnKind === "opening" && currentStage === "admitted" && kind === "opening_planner") {
    return "planned";
  }
  if (row.turnKind === "player_action" && currentStage === "admitted" && kind === "judge") {
    const artifact = campaignPlayJudgeArtifactSchema.parse(
      JSON.parse(accepted[0].artifactJson ?? ""),
    );
    return artifact.primaryPlan.kind === "no_effect" ? "planned" : "judged";
  }
  if (
    row.turnKind === "player_action" && kind === "game_master" &&
    ((routeKind === "full_authority" && currentStage === "judged") ||
      (routeKind !== "full_authority" && currentStage === "admitted"))
  ) {
    try {
      const artifact = campaignPlayGameMasterArtifactSchema.parse(
        JSON.parse(accepted[0].artifactJson ?? ""),
      );
      if (hashCampaignPlayProjection(artifact.batch) !== artifact.batchHash) {
        throw new Error("game master batch hash");
      }
      if (routeKind !== "full_authority") {
        const route = campaignPlayActionExecutionRouteSchema.parse(document.frame.executionRoute);
        if (
          route.kind !== routeKind ||
          (routeKind === "certified_move"
            ? !("certifiedMoveHash" in artifact) || artifact.certifiedMoveHash !== route.certificateHash
            : routeKind === "certified_wait"
              ? !("certifiedWaitHash" in artifact) || artifact.certifiedWaitHash !== route.certificateHash
              : routeKind === "certified_contact"
                ? !("certifiedContactHash" in artifact) || artifact.certifiedContactHash !== route.certificateHash
                : !("certifiedObserveHash" in artifact) || artifact.certifiedObserveHash !== route.certificateHash)
        ) {
          throw new Error("game master certified route authority");
        }
      } else if (!("judgeArtifactHash" in artifact)) {
        throw new Error("game master judge authority");
      }
    } catch (error) {
      throw corrupt("Campaign Play accepted Game Master artifact is invalid.", error);
    }
    return "planned";
  }
  throw corrupt("Campaign Play accepted model result is illegal at its replayed stage.");
}

function loadEvents(handle: CampaignPlayDatabaseHandle, row: TurnRow): CampaignPlaySseEvent[] {
  const eventRows = handle.sqlite.prepare(`
    SELECT event_id AS eventId, sequence, event_type AS eventType,
      payload_json AS payloadJson, sse_cursor AS sseCursor, created_at AS createdAt
    FROM campaign_play_turn_events WHERE campaign_id = ? AND turn_id = ?
    ORDER BY sequence
  `).all(handle.campaignId, row.turnId) as TurnEventRow[];
  if (eventRows.length !== row.nextEventSequence - 1) {
    throw corrupt("Campaign Play turn event count does not match its cursor.");
  }
  let observedWorkerEpoch = 0;
  let replayStage: Exclude<CampaignPlayTurnStage, "interrupted" | "completed" | "failed"> = "admitted";
  let replayInterrupted = false;
  let replayTerminal: "completed" | "failed" | null = null;
  let continuityMarker = false;
  try {
    const audit = JSON.parse(row.mutationAuditJson) as { kind?: unknown };
    continuityMarker = row.turnKind === "player_action" && audit.kind === "control_budget_continuity";
  } catch {
    continuityMarker = false;
  }
  const progressByEpoch = new Map<number, ReturnType<typeof publicProgressForStage>>();
  const events = eventRows.map((eventRow, index) => {
    const expectedSequence = index + 1;
    const priorCreatedAt = index === 0 ? row.submittedAt : eventRows[index - 1]!.createdAt;
    if (
      eventRow.sequence !== expectedSequence ||
      eventRow.sseCursor !== `${row.turnId}:${expectedSequence}` ||
      eventRow.createdAt < priorCreatedAt ||
      (index === 0 && eventRow.createdAt !== row.submittedAt)
    ) {
      throw corrupt("Campaign Play turn events are not contiguous or chronological.");
    }
    let event: CampaignPlaySseEvent;
    try {
      event = campaignPlaySseEventSchema.parse(JSON.parse(eventRow.payloadJson));
    } catch (error) {
      throw corrupt("Campaign Play turn event payload is invalid.", error);
    }
    if (
      canonicalizeCampaignPlayProjection(event) !== eventRow.payloadJson ||
      event.turnId !== row.turnId || event.sequence !== eventRow.sequence ||
      event.type !== eventRow.eventType || event.createdAt !== eventRow.createdAt
    ) {
      throw corrupt("Campaign Play turn event row disagrees with its payload.");
    }
    const runtimeEvent = handle.sqlite.prepare(`
      SELECT turn_id AS turnId, kind, worker_epoch AS workerEpoch,
        world_version AS worldVersion,
        result_runtime_revision AS resultRuntimeRevision, created_at AS createdAt
      FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND event_id = ?
    `).get(handle.campaignId, eventRow.eventId) as {
      turnId: string | null;
      kind: string;
      workerEpoch: number | null;
      worldVersion: number;
      resultRuntimeRevision: number;
      createdAt: number;
    } | undefined;
    if (
      !runtimeEvent || runtimeEvent.turnId !== row.turnId ||
      runtimeEvent.worldVersion !== event.worldVersion ||
      runtimeEvent.resultRuntimeRevision !== event.runtimeRevision ||
      runtimeEvent.createdAt !== eventRow.createdAt
    ) {
      throw corrupt("Campaign Play turn event has no matching runtime event.");
    }
    if (expectedSequence === 1 && runtimeEvent.kind !== "turn_admitted") {
      throw corrupt("Campaign Play turn event 1 is not its admission boundary.");
    }
    if (expectedSequence === 1 && runtimeEvent.workerEpoch !== null) {
      throw corrupt("Campaign Play turn admission cannot carry a worker epoch.");
    }
    if (expectedSequence > 1) {
      if (replayTerminal !== null) {
        throw corrupt("Campaign Play turn event follows a terminal boundary.");
      }
      if (runtimeEvent.kind === "worker_claimed") {
        const resumesActorReplan = replayInterrupted && replayStage === "primary_settled";
        if (event.type !== "turn.progressed" || (replayInterrupted && !resumesActorReplan)) {
          throw corrupt("Campaign Play worker claim must expose progress from an active stage.");
        }
        if (runtimeEvent.workerEpoch !== observedWorkerEpoch + 1) {
          throw corrupt("Campaign Play worker claim epoch is not contiguous.");
        }
        observedWorkerEpoch = runtimeEvent.workerEpoch;
        replayInterrupted = false;
        const expectedProgress = publicProgressForStage(replayStage);
        if (event.progress !== expectedProgress) {
          throw corrupt("Campaign Play worker claim exposes false public progress.");
        }
        progressByEpoch.set(observedWorkerEpoch, expectedProgress);
      } else if (runtimeEvent.kind === "worker_lease_renewed") {
        if (event.type !== "turn.progressed" || replayInterrupted) {
          throw corrupt("Campaign Play worker renewal must expose progress from an active stage.");
        }
        if (observedWorkerEpoch === 0 || runtimeEvent.workerEpoch !== observedWorkerEpoch) {
          throw corrupt("Campaign Play worker renewal does not match its claim epoch.");
        }
        if (event.progress !== progressByEpoch.get(observedWorkerEpoch)) {
          throw corrupt("Campaign Play worker renewal exposes false public progress.");
        }
      } else if (runtimeEvent.kind === "stage_accepted") {
        if (event.type !== "turn.progressed" || replayInterrupted) {
          throw corrupt("Campaign Play accepted stage must expose progress from an active stage.");
        }
        if (observedWorkerEpoch === 0 || runtimeEvent.workerEpoch !== observedWorkerEpoch) {
          throw corrupt("Campaign Play accepted stage does not match its claim epoch.");
        }
        replayStage = advanceReplayStageForAcceptedModel(
          handle,
          row,
          replayStage,
          observedWorkerEpoch,
        );
        if (event.progress !== publicProgressForStage(replayStage)) {
          throw corrupt("Campaign Play accepted stage exposes false public progress.");
        }
      } else if (runtimeEvent.kind === "turn_interrupted") {
        if (
          event.type !== "turn.interrupted" || replayInterrupted ||
          observedWorkerEpoch === 0 || runtimeEvent.workerEpoch !== observedWorkerEpoch
        ) {
          throw corrupt("Campaign Play interruption does not match its active external attempt.");
        }
        replayInterrupted = true;
      } else if (runtimeEvent.kind === "turn_resumed") {
        if (
          event.type !== "turn.progressed" || !replayInterrupted ||
          runtimeEvent.workerEpoch !== observedWorkerEpoch + 1
        ) {
          throw corrupt("Campaign Play resume does not advance its interrupted worker epoch.");
        }
        observedWorkerEpoch = runtimeEvent.workerEpoch;
        replayInterrupted = false;
        const expectedProgress = publicProgressForStage(replayStage);
        if (event.progress !== expectedProgress) {
          throw corrupt("Campaign Play resume exposes false public progress.");
        }
        progressByEpoch.set(observedWorkerEpoch, expectedProgress);
      } else if (runtimeEvent.kind === "primary_settled") {
        if (
          event.type !== "turn.progressed" || replayInterrupted ||
          replayStage !== "planned" || observedWorkerEpoch === 0 ||
          runtimeEvent.workerEpoch !== observedWorkerEpoch
        ) {
          throw corrupt("Campaign Play primary settlement is illegal at its replayed stage.");
        }
        replayStage = "primary_settled";
        if (event.progress !== publicProgressForStage(replayStage)) {
          throw corrupt("Campaign Play primary settlement exposes false public progress.");
        }
      } else if (runtimeEvent.kind === "actor_job_transitioned") {
        if (
          (event.type !== "turn.progressed" && event.type !== "turn.interrupted") ||
          replayInterrupted ||
          replayStage !== "primary_settled" || observedWorkerEpoch === 0 ||
          runtimeEvent.workerEpoch !== observedWorkerEpoch
        ) {
          throw corrupt("Campaign Play actor settlement is illegal at its replayed stage.");
        }
        if (event.type === "turn.interrupted") replayInterrupted = true;
        else if (event.progress === "revealing") replayStage = "actors_settled";
        else if (event.progress !== "world_acting") {
          throw corrupt("Campaign Play actor settlement exposes false public progress.");
        }
      } else if (runtimeEvent.kind === "visibility_projected") {
        if (
          event.type !== "turn.progressed" ||
          (!continuityMarker && replayInterrupted) ||
          (!continuityMarker && replayStage !== "actors_settled") || observedWorkerEpoch === 0 ||
          runtimeEvent.workerEpoch !== observedWorkerEpoch
        ) {
          throw corrupt("Campaign Play visibility projection is illegal at its replayed stage.");
        }
        if (continuityMarker) replayInterrupted = false;
        replayStage = "visibility_projected";
        if (event.progress !== publicProgressForStage(replayStage)) {
          throw corrupt("Campaign Play visibility projection exposes false public progress.");
        }
      } else if (runtimeEvent.kind === "turn_completed") {
        if (
          event.type !== "turn.completed" || replayInterrupted ||
          replayStage !== "visibility_projected" || observedWorkerEpoch === 0 ||
          runtimeEvent.workerEpoch !== observedWorkerEpoch
        ) {
          throw corrupt("Campaign Play completion is illegal at its replayed stage.");
        }
        const acceptedNarrator = handle.sqlite.prepare(`
          SELECT COUNT(*) AS count FROM campaign_play_model_stages
          WHERE campaign_id = ? AND turn_id = ? AND kind = 'narrator'
            AND worker_epoch = ? AND status = 'accepted'
        `).get(handle.campaignId, row.turnId, observedWorkerEpoch) as { count: number };
        const separateNarration = handle.sqlite.prepare(`SELECT COUNT(*) AS count
          FROM campaign_play_narration_operations
          WHERE campaign_id = ? AND turn_id = ?`).get(
            handle.campaignId,
            row.turnId,
          ) as { count: number };
        if (
          (acceptedNarrator.count === 1 ? 1 : 0) +
            (separateNarration.count === 1 ? 1 : 0) !== 1
        ) {
          throw corrupt("Campaign Play completion has no exact narration authority.");
        }
        replayTerminal = "completed";
      } else if (runtimeEvent.kind === "turn_failed") {
        if (
          event.type !== "turn.failed" || replayInterrupted ||
          stageProgressRank(replayStage) >= stageProgressRank("primary_settled") ||
          observedWorkerEpoch === 0 || runtimeEvent.workerEpoch !== observedWorkerEpoch
        ) {
          throw corrupt("Campaign Play terminal failure is illegal at its replayed stage.");
        }
        replayTerminal = "failed";
      } else {
        throw corrupt("Campaign Play turn event kind is invalid for its replayed stage.");
      }
    }
    return event;
  });
  if (events[0]?.type !== "turn.accepted") {
    throw corrupt("Campaign Play turn event 1 must be the accepted event.");
  }
  const unmatched = handle.sqlite.prepare(`
    SELECT COUNT(*) AS count FROM campaign_play_runtime_events r
    LEFT JOIN campaign_play_turn_events t
      ON t.campaign_id = r.campaign_id AND t.event_id = r.event_id
    WHERE r.campaign_id = ? AND r.turn_id = ? AND t.event_id IS NULL
  `).get(handle.campaignId, row.turnId) as { count: number };
  if (unmatched.count !== 0) {
    throw corrupt("Campaign Play runtime event has no matching turn event.");
  }
  if (observedWorkerEpoch !== row.workerEpoch) {
    throw corrupt("Campaign Play turn worker epoch disagrees with its event ledger.");
  }
  const nestedActorInterruption = replayInterrupted && row.stage === "primary_settled" &&
    row.interruptedStage === null && row.workerLeaseOwner === null &&
    row.workerLeaseExpiresAt === null &&
    (handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_actor_jobs
      WHERE campaign_id = ? AND turn_id = ? AND stage = 'interrupted'`).get(
        handle.campaignId,
        row.turnId,
      ) as { count: number }).count === 1;
  if (
    (replayTerminal !== null && row.stage !== replayTerminal) ||
    (replayTerminal === null && replayInterrupted &&
      !nestedActorInterruption &&
      (row.stage !== "interrupted" || row.interruptedStage !== replayStage)) ||
    (replayTerminal === null && !replayInterrupted && row.stage !== replayStage)
  ) {
    throw corrupt("Campaign Play turn stage disagrees with its replayed event ledger.");
  }
  return events;
}

function loadRow(handle: CampaignPlayDatabaseHandle, row: TurnRow): LoadedCampaignPlayTurn {
  const document = parseDocument(row);
  const modelSelection = parseModelSelection(row.modelSelectionJson, row.turnKind);
  try {
    resolveActionExecutionRoute(document, modelSelection);
  } catch (error) {
    throw corrupt("Campaign Play route selection violates its admission authority.", error);
  }
  if (document.request.idempotencyKey !== row.idempotencyKey) {
    throw corrupt("Campaign Play idempotency identity has drifted.");
  }
  if (
    document.request.expectedWorldVersion !== row.expectedWorldVersion ||
    document.request.expectedRuntimeRevision !== row.expectedRuntimeRevision ||
    row.baseWorldVersion !== row.expectedWorldVersion
  ) {
    throw corrupt("Campaign Play admission versions have drifted.");
  }
  if ((row.workerLeaseOwner === null) !== (row.workerLeaseExpiresAt === null)) {
    throw corrupt("Campaign Play worker lease is incomplete.");
  }
  if (!isNonnegativeInteger(row.workerEpoch)) {
    throw corrupt("Campaign Play worker epoch is invalid.");
  }
  if (
    row.workerLeaseExpiresAt !== null &&
    !isNonnegativeInteger(row.workerLeaseExpiresAt)
  ) {
    throw corrupt("Campaign Play worker lease expiry is invalid.");
  }
  const mutationAudit = parseRecord(row.mutationAuditJson, "Campaign Play mutation audit");
  if (canonicalizeCampaignPlayProjection(mutationAudit) !== row.mutationAuditJson) {
    throw corrupt("Campaign Play mutation audit is not stored in canonical form.");
  }
  const hasControlBudgetContinuityMarker = mutationAudit.kind === "control_budget_continuity";
  if (hasControlBudgetContinuityMarker && row.turnKind !== "player_action") {
    throw corrupt("Campaign Play control-budget continuity marker belongs only to player actions.");
  }
  const controlBudgetContinuity = hasControlBudgetContinuityMarker;
  const modelStages = validateModelStages(handle, row, modelSelection);
  validateAcceptedStageProgress(
    handle,
    row,
    modelStages,
    document,
    modelSelection,
    controlBudgetContinuity,
  );
  validateAcceptedStageEvents(handle, row, modelStages);
  const startedAttempts = modelStages.filter((attempt) => attempt.status === "started");
  if (row.stage === "interrupted") {
    if (
      row.interruptedStage === null || row.errorCode === null || row.resumeEligible !== 1 ||
      row.workerLeaseOwner !== null || row.workerLeaseExpiresAt !== null ||
      startedAttempts.length !== 0
    ) {
      throw corrupt("Campaign Play interrupted turn has inconsistent recovery authority.");
    }
    selectExactInterruptedAttemptForStage(
      handle,
      row,
      modelSelection,
      row.interruptedStage,
      row.workerEpoch,
      modelStages,
    );
  } else if (
    row.stage !== "failed" && row.stage !== "completed" && (
      row.interruptedStage !== null || row.errorCode !== null || row.resumeEligible !== 0
    )
  ) {
    throw corrupt("Campaign Play active turn retains interruption fields.");
  }
  if (row.workerLeaseOwner !== null) {
    if (row.workerEpoch <= 0) {
      throw corrupt("Campaign Play owned worker lease has no positive epoch.");
    }
    let route: StageClaimRoute;
    try {
      route = resolveStageClaimRoute(row.turnKind, row.stage, modelSelection);
    } catch (error) {
      throw corrupt("Campaign Play owned worker lease targets an invalid stage.", error);
    }
    if (route.model !== null) {
      const modelKind = route.model.kind;
      const activeAttempts = modelStages.filter((attempt) =>
        attempt.stageId === modelStageId(row.turnId, modelKind) &&
        attempt.kind === modelKind &&
        attempt.workerEpoch === row.workerEpoch &&
        attempt.status === "started"
      );
      if (activeAttempts.length !== 1) {
        throw corrupt("Campaign Play external worker lease lacks its exact started model attempt.");
      }
      if (startedAttempts.length !== 1) {
        throw corrupt("Campaign Play external worker lease has an orphan started model attempt.");
      }
    } else if (startedAttempts.length !== 0) {
      const actorAttempts = row.stage === "primary_settled"
        ? startedAttempts.filter((attempt) => attempt.kind === "actor_replanner")
        : [];
      const actorAttempt = actorAttempts[0];
      const linkedActorAttempt = actorAttempt && actorAttempts.length === 1 && startedAttempts.length === 1
        ? handle.sqlite.prepare(`SELECT attempt.job_id AS jobId,
              attempt.stage_id AS stageId,
              attempt.actor_job_worker_epoch AS actorJobWorkerEpoch,
              attempt.claim_turn_worker_epoch AS claimTurnWorkerEpoch
            FROM campaign_play_actor_replan_attempts attempt
            WHERE attempt.model_stage_row_id = ? AND attempt.attempt_number IN (1, 2, 3)`).get(
              actorAttempt.id,
            ) as {
              jobId: string; stageId: string; actorJobWorkerEpoch: number; claimTurnWorkerEpoch: number;
            } | undefined
        : undefined;
      const actorJob = linkedActorAttempt
        ? handle.sqlite.prepare(`SELECT job_id AS jobId
            FROM campaign_play_actor_jobs
            WHERE job_id = ? AND campaign_id = ? AND turn_id = ? AND stage = 'claimed'
              AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).get(
              linkedActorAttempt.jobId,
              handle.campaignId,
              row.turnId,
              linkedActorAttempt.actorJobWorkerEpoch,
              linkedActorAttempt.claimTurnWorkerEpoch,
            ) as { jobId: string } | undefined
        : actorAttempt && actorAttempts.length === 1 && startedAttempts.length === 1
          ? handle.sqlite.prepare(`SELECT job_id AS jobId
              FROM campaign_play_actor_jobs
              WHERE campaign_id = ? AND turn_id = ? AND stage = 'claimed'
                AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).get(
                handle.campaignId,
                row.turnId,
                actorAttempt.workerEpoch,
                row.workerEpoch,
              ) as { jobId: string } | undefined
          : undefined;
      const ownedActorAttempt = actorAttempt !== undefined && actorJob !== undefined &&
        actorAttempt.stageId === deriveCampaignPlayActorReplanStageId(actorJob.jobId) &&
        (linkedActorAttempt === undefined || (
          linkedActorAttempt.stageId === actorAttempt.stageId &&
          linkedActorAttempt.claimTurnWorkerEpoch === row.workerEpoch
        ));
      if (!ownedActorAttempt) {
        throw corrupt("Campaign Play deterministic worker lease has an unowned model attempt.");
      }
    }
  } else if (startedAttempts.length !== 0) {
    throw corrupt("Campaign Play started model attempt has no owning worker lease.");
  }
  if (
    row.stage === "visibility_projected" ||
    (row.stage === "interrupted" && row.interruptedStage === "visibility_projected")
  ) {
    validateNarratorPacket(handle, row, "pending");
  }
  const events = loadEvents(handle, row);
  const resultRows = handle.sqlite.prepare(`
    SELECT campaign_id AS campaignId, terminal_reason AS terminalReason,
      created_at AS createdAt
    FROM campaign_play_turn_results
    WHERE turn_id = ?
  `).all(row.turnId) as Array<{
    campaignId: string;
    terminalReason: LoadedCampaignPlayTurn["terminalReason"];
    createdAt: number;
  }>;
  let terminalReason: LoadedCampaignPlayTurn["terminalReason"] = null;
  if (row.stage === "completed" || row.stage === "failed") {
    const terminalKind = row.stage === "completed" ? "turn_completed" : "turn_failed";
    const terminal = handle.sqlite.prepare(`
      SELECT world_version AS worldVersion, worker_epoch AS workerEpoch, created_at AS createdAt
      FROM campaign_play_runtime_events
      WHERE campaign_id = ? AND turn_id = ? AND kind = ?
    `).all(handle.campaignId, row.turnId, terminalKind) as Array<{
      worldVersion: number;
      workerEpoch: number | null;
      createdAt: number;
    }>;
    if (
      terminal.length !== 1 || terminal[0].worldVersion !== row.finalWorldVersion ||
      terminal[0].workerEpoch !== row.workerEpoch || terminal[0].createdAt !== row.completedAt ||
      row.workerLeaseOwner !== null || row.workerLeaseExpiresAt !== null ||
      row.interruptedStage !== null || row.resumeEligible !== 0 || row.completedAt === null ||
      row.finalWorldVersion === null
    ) {
      throw corrupt("Campaign Play terminal turn disagrees with its fenced runtime boundary.");
    }
    let expectedTerminalReason: Exclude<LoadedCampaignPlayTurn["terminalReason"], null>;
    if (row.stage === "failed") {
      expectedTerminalReason = "terminal_failure";
    } else if (row.turnKind === "opening") {
      expectedTerminalReason = "opening_completed";
    } else if (controlBudgetContinuity) {
      expectedTerminalReason = "action_resolved";
    } else {
      const routeKind = resolveActionExecutionRoute(document, modelSelection);
      if (routeKind !== "full_authority") {
        const route = campaignPlayActionExecutionRouteSchema.parse(document.frame.executionRoute);
        if (
          route.kind !== routeKind ||
          route.certificate.publicResult.disposition !== "deterministic"
        ) {
          throw corrupt("Campaign Play terminal certified route authority is invalid.");
        }
        expectedTerminalReason = "action_resolved";
      } else {
      const judge = modelStages.filter((stage) => stage.kind === "judge" && stage.status === "accepted");
      if (judge.length !== 1) {
        throw corrupt("Campaign Play terminal player action has no exact Judge artifact.");
      }
      let artifact;
      try {
        artifact = campaignPlayJudgeArtifactSchema.parse(JSON.parse(judge[0].artifactJson ?? ""));
      } catch (error) {
        throw corrupt("Campaign Play terminal player action Judge artifact is invalid.", error);
      }
      expectedTerminalReason = artifact.publicResult.disposition === "impossible"
        ? "action_impossible"
        : artifact.publicResult.disposition === "clarification_required"
          ? "clarification_requested"
          : "action_resolved";
      }
    }
    if (
      resultRows.length !== 1 || resultRows[0].campaignId !== row.campaignId ||
      resultRows[0].terminalReason !== expectedTerminalReason ||
      resultRows[0].createdAt !== row.completedAt
    ) {
      throw corrupt("Campaign Play terminal result disagrees with its terminal authority.");
    }
    terminalReason = expectedTerminalReason;
    if (row.stage === "completed") {
      if (row.errorCode !== null || row.publicPacketHash === null) {
        throw corrupt("Campaign Play completed turn lacks terminal narration authority.");
      }
      const hasSeparateNarrationOperation = handle.sqlite.prepare(`SELECT 1
        FROM campaign_play_narration_operations
        WHERE campaign_id = ? AND turn_id = ? LIMIT 1`).get(
          handle.campaignId,
          row.turnId,
        ) !== undefined;
      if (hasSeparateNarrationOperation) {
        validateSeparateNarrationOperation(handle, row, controlBudgetContinuity);
      } else {
        validateCompletedNarration(handle, row, modelStages);
      }
    } else if (row.errorCode === null) {
      throw corrupt("Campaign Play failed turn lacks its internal error authority.");
    }
  } else if (resultRows.length !== 0) {
    throw corrupt("Campaign Play active turn has a terminal result.");
  }
  const authority = handle.sqlite.prepare(`
    SELECT accepted_world_version AS acceptedWorldVersion
    FROM campaign_play_states WHERE campaign_id = ?
  `).get(handle.campaignId) as { acceptedWorldVersion: number } | undefined;
  if (
    !authority ||
    events.some((event) => event.acceptedWorldVersion !== authority.acceptedWorldVersion)
  ) {
    throw corrupt("Campaign Play turn events disagree with accepted-world provenance.");
  }
  return {
    ...row,
    document,
    modelSelection,
    resumeEligible: row.resumeEligible === 1,
    mutationAudit,
    terminalReason,
    events,
  };
}

function replayMatches(row: TurnRow, input: AdmitCampaignPlayTurnInput): boolean {
  return row.turnKind === input.document.turnKind &&
    row.supersedesTurnId === input.supersedesTurnId &&
    row.inputJson === canonicalizeCampaignPlayProjection(input.document) &&
    row.inputHash === inputHash(input.document) &&
    row.frameHash === frameHash(input.document.frame) &&
    row.modelSelectionJson === canonicalizeCampaignPlayProjection(input.modelSelection) &&
    row.expectedWorldVersion === input.document.request.expectedWorldVersion &&
    row.expectedRuntimeRevision === input.document.request.expectedRuntimeRevision;
}

export function createCampaignPlayTurnRepository(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayTurnRepository {
  const stateRepository = createCampaignPlayStateRepository(handle);

  const loadTurn = (turnId: string): LoadedCampaignPlayTurn | null => {
    const row = selectTurn(handle, "id", turnId);
    if (!row || row.campaignId !== handle.campaignId) return null;
    return loadRow(handle, row);
  };

  const loadTurnByIdempotencyKey = (idempotencyKey: string): LoadedCampaignPlayTurn | null => {
    const row = selectTurn(handle, "idempotency", idempotencyKey);
    if (!row || row.campaignId !== handle.campaignId) return null;
    return loadRow(handle, row);
  };

  const interruptExternalAttempt = (
    input: {
      turnId: string;
      stage: CampaignPlayClaimableTurnStage;
      owner: string;
      epoch: number;
      leaseExpiresAt: number;
      occurredAt: number;
      mutationId: string;
      evidence: CampaignPlayExternalInterruptionEvidence;
      expiryMode: "live" | "expired";
    },
  ): LoadedCampaignPlayTurn => {
    validateInterruptionEvidence(input.evidence);
    if (
      !isNonemptyText(input.turnId) || !isNonemptyText(input.owner) ||
      !isPositiveInteger(input.epoch) || !isNonnegativeInteger(input.leaseExpiresAt) ||
      !isNonnegativeInteger(input.occurredAt) ||
      (input.expiryMode === "live" && input.occurredAt >= input.leaseExpiresAt) ||
      (input.expiryMode === "expired" && input.occurredAt < input.leaseExpiresAt)
    ) {
      throw stageInvalid("Campaign Play external interruption has invalid fencing fields.");
    }
    const preflight = loadTurn(input.turnId);
    if (!preflight) {
      throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
    }
    assertChronologicalBoundary(preflight, input.occurredAt, "external interruption");
    const route = resolveStageClaimRoute(preflight.turnKind, input.stage, preflight.modelSelection);
    if (route.model === null) {
      throw stageInvalid("Campaign Play interruption requires an external model stage.");
    }
    if (
      preflight.stage !== input.stage || preflight.workerLeaseOwner !== input.owner ||
      preflight.workerEpoch !== input.epoch ||
      preflight.workerLeaseExpiresAt !== input.leaseExpiresAt
    ) {
      throw fenceLost("Campaign Play interruption lost its exact worker lease.");
    }
    const stageId = modelStageId(input.turnId, route.model.kind);
    selectExactStartedAttempt(handle, input.turnId, stageId, input.epoch);
    assertMutationIdUnused(handle, input.mutationId);
    const protectedPayloadHash = hashCampaignPlayProjection({
      domain: "campaign_play_external_interruption",
      turnId: input.turnId,
      stage: input.stage,
      stageId,
      workerEpoch: input.epoch,
      evidence: input.evidence,
      occurredAt: input.occurredAt,
      mutationId: input.mutationId,
    });
    stateRepository.commitRuntime({
      event: {
        eventId: input.mutationId,
        turnId: input.turnId,
        kind: "turn_interrupted",
        workerEpoch: input.epoch,
        protectedPayloadHash,
        createdAt: input.occurredAt,
      },
      mutate(context) {
        const current = selectTurn(handle, "id", input.turnId);
        if (!current || current.campaignId !== handle.campaignId) {
          throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
        }
        const loaded = loadRow(handle, current);
        assertChronologicalBoundary(loaded, input.occurredAt, "external interruption");
        const currentRoute = resolveStageClaimRoute(loaded.turnKind, input.stage, loaded.modelSelection);
        if (
          currentRoute.model === null || loaded.stage !== input.stage ||
          loaded.workerLeaseOwner !== input.owner || loaded.workerEpoch !== input.epoch ||
          loaded.workerLeaseExpiresAt !== input.leaseExpiresAt
        ) {
          throw fenceLost("Campaign Play interruption lost its exact worker lease.");
        }
        if (
          (input.expiryMode === "live" && input.occurredAt >= input.leaseExpiresAt) ||
          (input.expiryMode === "expired" && input.occurredAt < input.leaseExpiresAt)
        ) {
          throw fenceLost("Campaign Play interruption no longer matches the observed lease lifetime.");
        }
        selectExactStartedAttempt(handle, input.turnId, stageId, input.epoch);
        assertMutationIdUnused(handle, input.mutationId);
        const attemptUpdate = handle.sqlite.prepare(`
          UPDATE campaign_play_model_stages SET
            status = 'interrupted', actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
            input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
            schema_outcome = ?, error_code = ?, completed_at = ?
          WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
            AND worker_epoch = ? AND status = 'started'
        `).run(
          input.evidence.actualProviderId, input.evidence.actualModel, input.evidence.actualStrategy,
          input.evidence.inputTokens, input.evidence.outputTokens, input.evidence.durationMs,
          input.evidence.finishReason, input.evidence.schemaOutcome,
          input.evidence.errorCode, input.occurredAt,
          handle.campaignId, input.turnId, stageId, input.epoch,
        );
        if (attemptUpdate.changes !== 1) {
          throw fenceLost("Campaign Play interruption lost its started attempt.");
        }
        const turnUpdate = handle.sqlite.prepare(`
          UPDATE campaign_play_turns SET stage = 'interrupted', interrupted_stage = ?,
            error_code = ?, resume_eligible = 1, worker_lease_owner = NULL,
            worker_lease_expires_at = NULL, next_event_sequence = ?, updated_at = ?
          WHERE id = ? AND campaign_id = ? AND stage = ? AND worker_lease_owner = ?
            AND worker_epoch = ? AND worker_lease_expires_at = ?
        `).run(
          input.stage, input.evidence.errorCode, loaded.nextEventSequence + 1, input.occurredAt,
          input.turnId, handle.campaignId, input.stage, input.owner, input.epoch,
          input.leaseExpiresAt,
        );
        if (turnUpdate.changes !== 1) {
          throw fenceLost("Campaign Play interruption lost its turn compare-and-swap.");
        }
        insertTurnEvent(handle, input.mutationId, createInterruptedEvent({
          turnId: input.turnId,
          sequence: loaded.nextEventSequence,
          acceptedWorldVersion: readAcceptedWorldVersion(handle),
          worldVersion: context.priorWorldVersion,
          runtimeRevision: context.targetRuntimeRevision,
          createdAt: input.occurredAt,
        }));
      },
    });
    const interrupted = loadTurn(input.turnId);
    if (!interrupted) throw corrupt("Campaign Play interrupted turn disappeared.");
    return interrupted;
  };

  const executeTurnWrite = <Result>(
    turnId: string,
    action: () => Result,
    verify: (turn: LoadedCampaignPlayTurn, result: Result) => Result,
  ): Result => handle.sqlite.transaction(() => {
    const result = action();
    if (!stateRepository.loadState()) {
      throw corrupt("Campaign Play durable mutation lost its state authority.");
    }
    const turn = loadTurn(turnId);
    if (!turn) throw corrupt("Campaign Play durable mutation lost its turn authority.");
    return verify(turn, result);
  }).immediate();

  const operations: CampaignPlayTurnRepository = {
    admitTurn(input) {
      return handle.sqlite.transaction(() => {
        validateAdmissionDocument(input.document);
        validateModelSelection(input.modelSelection, input.document.turnKind);
        try {
          resolveActionExecutionRoute(input.document, input.modelSelection);
        } catch (error) {
          throw stageInvalid(`Campaign Play admission route authority is invalid: ${String(error)}`);
        }
        const idempotencyKey = input.document.request.idempotencyKey;
        const replay = selectTurn(handle, "idempotency", idempotencyKey);
        if (replay) {
          if (!replayMatches(replay, input)) {
            throw new CampaignPlayTurnRepositoryError(
              "turn_idempotency_mismatch",
              "Campaign Play idempotency key belongs to a different turn request.",
            );
          }
          loadRow(handle, replay);
          return { turnId: replay.turnId, sequence: 1 };
        }
        if (selectTurn(handle, "active")) {
          throw new CampaignPlayTurnRepositoryError(
            "turn_in_progress",
            "Campaign Play already has an active turn.",
          );
        }
        const state = stateRepository.loadState();
        if (!state) {
          throw new CampaignPlayTurnRepositoryError("turn_phase_invalid", "Campaign Play state is missing.");
        }
        if (!state.eligibility.projection.eligible) {
          throw new CampaignPlayTurnRepositoryError(
            "turn_topology_ineligible",
            "Campaign Play accepted topology is not eligible for play.",
          );
        }
        const requiredPhase = input.document.turnKind === "opening" ? "opening_required" : "ready";
        if (state.authority.setupPhase !== requiredPhase) {
          throw new CampaignPlayTurnRepositoryError(
            "turn_phase_invalid",
            `Campaign Play ${input.document.turnKind} admission requires ${requiredPhase}.`,
          );
        }
        if (
          input.document.request.expectedWorldVersion !== state.authority.worldVersion ||
          input.document.request.expectedRuntimeRevision !== state.authority.runtimeRevision
        ) {
          throw new CampaignPlayTurnRepositoryError(
            "turn_version_conflict",
            "Campaign Play admission versions do not match current authority.",
          );
        }
        const storedInput = canonicalizeCampaignPlayProjection(input.document);
        const storedModelSelection = canonicalizeCampaignPlayProjection(input.modelSelection);
        const storedInputHash = inputHash(input.document);
        const storedFrameHash = frameHash(input.document.frame);
        const protectedPayloadHash = hashCampaignPlayProjection({
          domain: "campaign_play_turn_admission",
          turnId: input.turnId,
          inputHash: storedInputHash,
          frameHash: storedFrameHash,
          modelSelection: input.modelSelection,
        });
        stateRepository.commitRuntime({
        event: {
          eventId: input.mutationId,
          turnId: input.turnId,
          kind: "turn_admitted",
          workerEpoch: null,
          protectedPayloadHash,
          createdAt: input.submittedAt,
        },
        mutate(context) {
          if (
            context.priorWorldVersion !== input.document.request.expectedWorldVersion ||
            context.priorRuntimeRevision !== input.document.request.expectedRuntimeRevision
          ) {
            throw new CampaignPlayTurnRepositoryError(
              "turn_version_conflict",
              "Campaign Play authority changed during admission.",
            );
          }
          handle.sqlite.prepare(`
            INSERT INTO campaign_play_turns (
              id, campaign_id, turn_kind, supersedes_turn_id, input_json, input_hash,
              idempotency_key, expected_world_version, expected_runtime_revision,
              base_world_version, final_world_version, stage, frame_hash,
              next_event_sequence, worker_lease_owner, worker_epoch, worker_lease_expires_at,
              model_selection_json, public_packet_hash, interrupted_stage, error_code,
              resume_eligible, mutation_audit_json, submitted_at, updated_at, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 'admitted', ?, 2,
              NULL, 0, NULL, ?, NULL, NULL, NULL, 0, '{}', ?, ?, NULL)
          `).run(
            input.turnId, handle.campaignId, input.document.turnKind, input.supersedesTurnId,
            storedInput, storedInputHash, idempotencyKey,
            context.priorWorldVersion, context.priorRuntimeRevision,
            context.priorWorldVersion, storedFrameHash, storedModelSelection,
            input.submittedAt, input.submittedAt,
          );
          const event = campaignPlaySseEventSchema.parse({
            type: "turn.accepted",
            status: "processing",
            sequence: 1,
            turnId: input.turnId,
            acceptedWorldVersion: state.authority.acceptedWorldVersion,
            worldVersion: context.priorWorldVersion,
            runtimeRevision: context.targetRuntimeRevision,
            createdAt: input.submittedAt,
          });
          handle.sqlite.prepare(`
            INSERT INTO campaign_play_turn_events (
              event_id, campaign_id, turn_id, sequence, event_type,
              payload_json, sse_cursor, created_at
            ) VALUES (?, ?, ?, 1, 'turn.accepted', ?, ?, ?)
          `).run(
            input.mutationId, handle.campaignId, input.turnId,
            canonicalizeCampaignPlayProjection(event), `${input.turnId}:1`, input.submittedAt,
          );
        },
        });
        const admitted = loadTurn(input.turnId);
        if (!admitted) throw corrupt("Campaign Play admitted turn disappeared.");
        return { turnId: admitted.turnId, sequence: 1 };
      }).immediate();
    },
    claimStage(input) {
      validateClaimInput(input);
      if (input.observedEpoch === Number.MAX_SAFE_INTEGER) {
        throw stageInvalid("Campaign Play worker epoch cannot advance further.");
      }
      const preflight = loadTurn(input.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.claimedAt, "worker claim");
      const route = resolveStageClaimRoute(
        preflight.turnKind,
        input.expectedStage,
        preflight.modelSelection,
      );
      claimLeaseIsAvailable(preflight, route, input);
      assertMutationIdUnused(handle, input.mutationId);
      const nextEpoch = input.observedEpoch + 1;
      const protectedPayloadHash = hashCampaignPlayProjection({
        domain: "campaign_play_worker_claim",
        turnId: input.turnId,
        stage: input.expectedStage,
        owner: input.owner,
        workerEpoch: nextEpoch,
        claimedAt: input.claimedAt,
        leaseExpiresAt: input.leaseExpiresAt,
        mutationId: input.mutationId,
      });
      stateRepository.commitRuntime({
        event: {
          eventId: input.mutationId,
          turnId: input.turnId,
          kind: "worker_claimed",
          workerEpoch: nextEpoch,
          protectedPayloadHash,
          createdAt: input.claimedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError(
              "turn_not_found",
              "Campaign Play turn was not found.",
            );
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.claimedAt, "worker claim");
          const currentRoute = resolveStageClaimRoute(
            loaded.turnKind,
            input.expectedStage,
            loaded.modelSelection,
          );
          claimLeaseIsAvailable(loaded, currentRoute, input);
          assertMutationIdUnused(handle, input.mutationId);
          const leasePredicate = loaded.workerLeaseOwner === null
            ? "AND worker_lease_owner IS NULL AND worker_lease_expires_at IS NULL"
            : "AND worker_lease_owner = ? AND worker_lease_expires_at = ?";
          const leaseParameters = loaded.workerLeaseOwner === null
            ? []
            : [loaded.workerLeaseOwner, loaded.workerLeaseExpiresAt];
          const updated = handle.sqlite.prepare(`
            UPDATE campaign_play_turns
            SET worker_lease_owner = ?, worker_epoch = ?, worker_lease_expires_at = ?,
              next_event_sequence = ?, updated_at = ?
            WHERE id = ? AND campaign_id = ? AND stage = ? AND worker_epoch = ?
              ${leasePredicate}
          `).run(
            input.owner,
            nextEpoch,
            input.leaseExpiresAt,
            loaded.nextEventSequence + 1,
            input.claimedAt,
            input.turnId,
            handle.campaignId,
            input.expectedStage,
            input.observedEpoch,
            ...leaseParameters,
          );
          if (updated.changes !== 1) {
            throw fenceLost("Campaign Play worker claim lost its compare-and-swap race.");
          }
          if (currentRoute.model !== null) {
            const stageId = modelStageId(input.turnId, currentRoute.model.kind);
            const attempts = selectModelStages(handle, input.turnId)
              .filter((attempt) => attempt.stageId === stageId);
            if (attempts.some((attempt) => attempt.status === "started")) {
              throw corrupt("Campaign Play external stage already has a started attempt.");
            }
            const attempt = attempts.length + 1;
            handle.sqlite.prepare(`
              INSERT INTO campaign_play_model_stages (
                id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
                requested_provider_id, requested_model, requested_strategy,
                schema_outcome, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?, ?, 'pending', ?)
            `).run(
              modelStageAttemptId(stageId, attempt),
              stageId,
              attempt,
              handle.campaignId,
              input.turnId,
              currentRoute.model.kind,
              nextEpoch,
              currentRoute.model.requested.providerId,
              currentRoute.model.requested.model,
              currentRoute.model.requested.strategy,
              input.claimedAt,
            );
          }
          insertTurnEvent(handle, input.mutationId, createWorkerProgressEvent({
            turnId: input.turnId,
            sequence: loaded.nextEventSequence,
            acceptedWorldVersion: readAcceptedWorldVersion(handle),
            worldVersion: context.priorWorldVersion,
            runtimeRevision: context.targetRuntimeRevision,
            createdAt: input.claimedAt,
            progress: currentRoute.progress,
          }));
        },
      });
      return {
        turnId: input.turnId,
        stage: input.expectedStage,
        owner: input.owner,
        epoch: nextEpoch,
        expiresAt: input.leaseExpiresAt,
      };
    },
    renewLease(input) {
      validateRenewalInput(input);
      const preflight = loadTurn(input.token.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.renewedAt, "lease renewal");
      resolveStageClaimRoute(
        preflight.turnKind,
        input.token.stage,
        preflight.modelSelection,
      );
      if (
        preflight.stage !== input.token.stage ||
        preflight.workerLeaseOwner !== input.token.owner ||
        preflight.workerEpoch !== input.token.epoch ||
        preflight.workerLeaseExpiresAt !== input.token.expiresAt ||
        input.token.expiresAt <= input.renewedAt ||
        input.leaseExpiresAt <= input.token.expiresAt
      ) {
        throw fenceLost("Campaign Play worker lease renewal lost its fencing token.");
      }
      assertMutationIdUnused(handle, input.mutationId);
      const protectedPayloadHash = hashCampaignPlayProjection({
        domain: "campaign_play_worker_lease_renewal",
        turnId: input.token.turnId,
        stage: input.token.stage,
        owner: input.token.owner,
        workerEpoch: input.token.epoch,
        previousLeaseExpiresAt: input.token.expiresAt,
        renewedAt: input.renewedAt,
        leaseExpiresAt: input.leaseExpiresAt,
        mutationId: input.mutationId,
      });
      stateRepository.commitRuntime({
        event: {
          eventId: input.mutationId,
          turnId: input.token.turnId,
          kind: "worker_lease_renewed",
          workerEpoch: input.token.epoch,
          protectedPayloadHash,
          createdAt: input.renewedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.token.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError(
              "turn_not_found",
              "Campaign Play turn was not found.",
            );
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.renewedAt, "lease renewal");
          const currentRoute = resolveStageClaimRoute(
            loaded.turnKind,
            input.token.stage,
            loaded.modelSelection,
          );
          if (
            loaded.stage !== input.token.stage ||
            loaded.workerLeaseOwner !== input.token.owner ||
            loaded.workerEpoch !== input.token.epoch ||
            loaded.workerLeaseExpiresAt !== input.token.expiresAt ||
            input.token.expiresAt <= input.renewedAt ||
            input.leaseExpiresAt <= input.token.expiresAt
          ) {
            throw fenceLost("Campaign Play worker lease renewal lost its fencing token.");
          }
          assertMutationIdUnused(handle, input.mutationId);
          const updated = handle.sqlite.prepare(`
            UPDATE campaign_play_turns
            SET worker_lease_expires_at = ?, next_event_sequence = ?, updated_at = ?
            WHERE id = ? AND campaign_id = ? AND stage = ? AND worker_lease_owner = ?
              AND worker_epoch = ? AND worker_lease_expires_at = ?
          `).run(
            input.leaseExpiresAt,
            loaded.nextEventSequence + 1,
            input.renewedAt,
            input.token.turnId,
            handle.campaignId,
            input.token.stage,
            input.token.owner,
            input.token.epoch,
            input.token.expiresAt,
          );
          if (updated.changes !== 1) {
            throw fenceLost("Campaign Play worker lease renewal lost its compare-and-swap race.");
          }
          insertTurnEvent(handle, input.mutationId, createWorkerProgressEvent({
            turnId: input.token.turnId,
            sequence: loaded.nextEventSequence,
            acceptedWorldVersion: readAcceptedWorldVersion(handle),
            worldVersion: context.priorWorldVersion,
            runtimeRevision: context.targetRuntimeRevision,
            createdAt: input.renewedAt,
            progress: currentRoute.progress,
          }));
        },
      });
      return {
        ...input.token,
        expiresAt: input.leaseExpiresAt,
      };
    },
    acceptModelArtifact(input) {
      validateLeaseToken(input.token);
      validateExecutionEvidence(input.evidence);
      if (!isNonnegativeInteger(input.acceptedAt) || input.acceptedAt >= input.token.expiresAt) {
        throw fenceLost("Campaign Play model artifact arrived after its worker lease expired.");
      }
      const artifactJson = canonicalizeCampaignPlayProjection(input.artifact);
      const preflight = loadTurn(input.token.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.acceptedAt, "model acceptance");
      const route = resolveStageClaimRoute(preflight.turnKind, input.token.stage, preflight.modelSelection);
      if (route.model === null) {
        throw stageInvalid("Campaign Play artifact acceptance requires an external model stage.");
      }
      const modelKind = route.model.kind;
      if (
        input.evidence.actualProviderId !== route.model.requested.providerId ||
        !campaignPlayResponseModelMatches({
          providerId: route.model.requested.providerId,
          requestedModel: route.model.requested.model,
          responseModel: input.evidence.actualModel,
        })
      ) {
        throw stageInvalid("Campaign Play accepted model evidence must match the frozen provider and model.");
      }
      const completesTurn = modelKind === "narrator";
      if (completesTurn !== (input.mutationDomain === "narration")) {
        throw stageInvalid("Campaign Play model artifact mutation domain does not match its stage.");
      }
      if (completesTurn) {
        let narration: ReturnType<typeof campaignPlayNarrationSchema.parse>;
        try {
          narration = campaignPlayNarrationSchema.parse(input.artifact);
        } catch (error) {
          throw stageInvalid(`Campaign Play narrator artifact is invalid: ${String(error)}`);
        }
        if (
          narration.turnId !== input.token.turnId ||
          preflight.publicPacketHash === null ||
          input.mutationDomain !== "narration" ||
          input.publicPacketHash !== preflight.publicPacketHash ||
          !isCanonicalHash(input.publicPacketHash)
        ) {
          throw stageInvalid("Campaign Play narrator artifact does not match its immutable public packet.");
        }
      }
      if (
        preflight.stage !== input.token.stage || preflight.workerLeaseOwner !== input.token.owner ||
        preflight.workerEpoch !== input.token.epoch ||
        preflight.workerLeaseExpiresAt !== input.token.expiresAt
      ) {
        throw fenceLost("Campaign Play model artifact lost its exact worker lease.");
      }
      const authorityKind = resolveActionExecutionRoute(
        preflight.document,
        preflight.modelSelection,
      );
      let acceptedAuthorityHash: string | null = null;
      if (modelKind === "game_master") {
        const acceptedJudges = selectModelStages(handle, input.token.turnId).filter(
          (attempt) => attempt.kind === "judge" && attempt.status === "accepted",
        );
        if (authorityKind !== "full_authority") {
          if (acceptedJudges.length !== 0) {
            throw stageInvalid("Campaign Play certified route cannot retain Judge evidence.");
          }
          const executionRoute = campaignPlayActionExecutionRouteSchema.parse(
            preflight.document.frame.executionRoute,
          );
          if (executionRoute.kind !== authorityKind) {
            throw stageInvalid("Campaign Play certified route authority is missing.");
          }
          acceptedAuthorityHash = executionRoute.certificateHash;
        } else {
          if (acceptedJudges.length !== 1 || acceptedJudges[0]!.artifactHash === null) {
            throw stageInvalid(
              "Campaign Play Game Master acceptance requires one exact Judge artifact.",
            );
          }
          acceptedAuthorityHash = acceptedJudges[0]!.artifactHash;
        }
      }
      const nextPlanningStage = completesTurn
        ? null
        : nextStageAfterAcceptedModel(
            preflight.turnKind,
            input.token.stage,
            modelKind,
            input.artifact,
            authorityKind,
            acceptedAuthorityHash,
          );
      const nextStage = nextPlanningStage ?? "completed";
      const stageId = modelStageId(input.token.turnId, modelKind);
      selectExactStartedAttempt(handle, input.token.turnId, stageId, input.token.epoch);
      assertMutationIdUnused(handle, input.mutationId);
      const artifactHash = hashCampaignPlayProjection({
        domain: "campaign_play_model_artifact",
        stageId,
        kind: modelKind,
        artifact: input.artifact,
      });
      const protectedPayloadHash = hashCampaignPlayProjection({
        domain: completesTurn
          ? "campaign_play_narration_completion"
          : "campaign_play_model_artifact_acceptance",
        turnId: input.token.turnId,
        stageId,
        kind: modelKind,
        workerEpoch: input.token.epoch,
        artifactHash,
        publicPacketHash: input.mutationDomain === "narration"
          ? input.publicPacketHash
          : null,
        evidence: input.evidence,
        mutationId: input.mutationId,
      });
      const commit = input.mutationDomain === "both"
        ? stateRepository.commitMechanicalAndRuntime.bind(stateRepository)
        : stateRepository.commitRuntime.bind(stateRepository);
      commit({
        ...(input.mutationDomain === "both" ? { worldVersionAdvance: 1 } : {}),
        event: {
          eventId: input.mutationId,
          turnId: input.token.turnId,
          kind: completesTurn ? "turn_completed" : "stage_accepted",
          workerEpoch: input.token.epoch,
          protectedPayloadHash,
          createdAt: input.acceptedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.token.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.acceptedAt, "model acceptance");
          const currentRoute = resolveStageClaimRoute(
            loaded.turnKind,
            input.token.stage,
            loaded.modelSelection,
          );
          if (
            currentRoute.model === null || currentRoute.model.kind !== modelKind ||
            loaded.stage !== input.token.stage || loaded.workerLeaseOwner !== input.token.owner ||
            loaded.workerEpoch !== input.token.epoch ||
            loaded.workerLeaseExpiresAt !== input.token.expiresAt ||
            input.acceptedAt >= input.token.expiresAt
          ) {
            throw fenceLost("Campaign Play model artifact lost its exact worker lease.");
          }
          selectExactStartedAttempt(handle, input.token.turnId, stageId, input.token.epoch);
          assertMutationIdUnused(handle, input.mutationId);
          input.mutate?.(context);
          const attemptUpdate = handle.sqlite.prepare(`
            UPDATE campaign_play_model_stages SET
              status = 'accepted', actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
              input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
              schema_outcome = 'valid', artifact_json = ?, artifact_hash = ?, completed_at = ?
            WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
              AND worker_epoch = ? AND status = 'started'
          `).run(
            input.evidence.actualProviderId, input.evidence.actualModel,
            input.evidence.actualStrategy, input.evidence.inputTokens,
            input.evidence.outputTokens, input.evidence.durationMs, input.evidence.finishReason,
            artifactJson, artifactHash, input.acceptedAt, handle.campaignId,
            input.token.turnId, stageId, input.token.epoch,
          );
          if (attemptUpdate.changes !== 1) {
            throw fenceLost("Campaign Play model artifact lost its started attempt.");
          }
          const turnUpdate = completesTurn
            ? handle.sqlite.prepare(`
                UPDATE campaign_play_turns SET stage = 'completed',
                  final_world_version = ?, worker_lease_owner = NULL,
                  worker_lease_expires_at = NULL, next_event_sequence = ?,
                  updated_at = ?, completed_at = ?
                WHERE id = ? AND campaign_id = ? AND stage = 'visibility_projected'
                  AND public_packet_hash = ? AND worker_lease_owner = ?
                  AND worker_epoch = ? AND worker_lease_expires_at = ?
              `).run(
                context.targetWorldVersion, loaded.nextEventSequence + 1,
                input.acceptedAt, input.acceptedAt, input.token.turnId,
                handle.campaignId,
                input.mutationDomain === "narration" ? input.publicPacketHash : "",
                input.token.owner, input.token.epoch, input.token.expiresAt,
              )
            : handle.sqlite.prepare(`
                UPDATE campaign_play_turns SET stage = ?, worker_lease_owner = NULL,
                  worker_lease_expires_at = NULL, next_event_sequence = ?, updated_at = ?
                WHERE id = ? AND campaign_id = ? AND stage = ? AND worker_lease_owner = ?
                  AND worker_epoch = ? AND worker_lease_expires_at = ?
              `).run(
                nextStage, loaded.nextEventSequence + 1, input.acceptedAt,
                input.token.turnId, handle.campaignId, input.token.stage,
                input.token.owner, input.token.epoch, input.token.expiresAt,
              );
          if (turnUpdate.changes !== 1) {
            throw fenceLost("Campaign Play model artifact lost its turn compare-and-swap.");
          }
          insertTurnEvent(handle, input.mutationId, completesTurn
            ? createTerminalEvent({
                type: "turn.completed",
                turnId: input.token.turnId,
                sequence: loaded.nextEventSequence,
                acceptedWorldVersion: readAcceptedWorldVersion(handle),
                worldVersion: context.targetWorldVersion,
                runtimeRevision: context.targetRuntimeRevision,
                createdAt: input.acceptedAt,
              })
            : createWorkerProgressEvent({
                turnId: input.token.turnId,
                sequence: loaded.nextEventSequence,
                acceptedWorldVersion: readAcceptedWorldVersion(handle),
                worldVersion: context.targetWorldVersion,
                runtimeRevision: context.targetRuntimeRevision,
                createdAt: input.acceptedAt,
                progress: publicProgressForStage(nextPlanningStage!),
              }));
        },
      });
      const accepted = loadTurn(input.token.turnId);
      if (!accepted) throw corrupt("Campaign Play accepted artifact turn disappeared.");
      return accepted;
    },
    commitActorTransition(input) {
      validateLeaseToken(input.token);
      if (
        input.token.stage !== "primary_settled" ||
        !Number.isSafeInteger(input.committedAt) || input.committedAt < 0 ||
        !Number.isSafeInteger(input.worldVersionAdvance) || input.worldVersionAdvance < 0 ||
        !isCanonicalHash(input.protectedPayloadHash) ||
        (input.leaseMode === "live" && input.committedAt >= input.token.expiresAt) ||
        (input.leaseMode === "expired" && input.committedAt < input.token.expiresAt) ||
        (input.publicInterruption === true && input.worldVersionAdvance !== 0)
      ) {
        throw stageInvalid("Campaign Play actor transition has an invalid lease or payload contract.");
      }
      const preflight = loadTurn(input.token.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.committedAt, "actor transition");
      if (
        preflight.stage !== "primary_settled" ||
        preflight.workerLeaseOwner !== input.token.owner ||
        preflight.workerEpoch !== input.token.epoch ||
        preflight.workerLeaseExpiresAt !== input.token.expiresAt
      ) {
        throw fenceLost("Campaign Play actor transition lost its exact main-turn lease.");
      }
      assertMutationIdUnused(handle, input.mutationId);
      const commit = input.worldVersionAdvance > 0
        ? stateRepository.commitMechanicalAndRuntime.bind(stateRepository)
        : stateRepository.commitRuntime.bind(stateRepository);
      commit({
        ...(input.worldVersionAdvance > 0
          ? { worldVersionAdvance: input.worldVersionAdvance }
          : {}),
        event: {
          eventId: input.mutationId,
          turnId: input.token.turnId,
          kind: "actor_job_transitioned",
          workerEpoch: input.token.epoch,
          protectedPayloadHash: input.protectedPayloadHash,
          createdAt: input.committedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.token.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.committedAt, "actor transition");
          if (
            loaded.stage !== "primary_settled" ||
            loaded.workerLeaseOwner !== input.token.owner ||
            loaded.workerEpoch !== input.token.epoch ||
            loaded.workerLeaseExpiresAt !== input.token.expiresAt ||
            (input.leaseMode === "live" && input.committedAt >= input.token.expiresAt) ||
            (input.leaseMode === "expired" && input.committedAt < input.token.expiresAt)
          ) {
            throw fenceLost("Campaign Play actor transition lost its in-transaction main-turn fence.");
          }
          assertMutationIdUnused(handle, input.mutationId);
          const turnUpdate = input.publicInterruption === true
            ? handle.sqlite.prepare(`UPDATE campaign_play_turns
                SET worker_lease_owner = NULL, worker_lease_expires_at = NULL,
                  next_event_sequence = ?, updated_at = ?
                WHERE id = ? AND campaign_id = ? AND stage = 'primary_settled'
                  AND worker_lease_owner = ? AND worker_epoch = ? AND worker_lease_expires_at = ?
                  AND next_event_sequence = ?`).run(
                loaded.nextEventSequence + 1,
                input.committedAt,
                input.token.turnId,
                handle.campaignId,
                input.token.owner,
                input.token.epoch,
                input.token.expiresAt,
                loaded.nextEventSequence,
              )
            : handle.sqlite.prepare(`UPDATE campaign_play_turns
                SET next_event_sequence = ?, updated_at = ?
                WHERE id = ? AND campaign_id = ? AND stage = 'primary_settled'
                  AND worker_lease_owner = ? AND worker_epoch = ? AND worker_lease_expires_at = ?
                  AND next_event_sequence = ?`).run(
                loaded.nextEventSequence + 1,
                input.committedAt,
                input.token.turnId,
                handle.campaignId,
                input.token.owner,
                input.token.epoch,
                input.token.expiresAt,
                loaded.nextEventSequence,
              );
          if (turnUpdate.changes !== 1) {
            throw fenceLost("Campaign Play actor transition lost its turn-event compare-and-swap.");
          }
          input.mutate(context);
          insertTurnEvent(handle, input.mutationId, input.publicInterruption === true
            ? createInterruptedEvent({
                turnId: input.token.turnId,
                sequence: loaded.nextEventSequence,
                acceptedWorldVersion: readAcceptedWorldVersion(handle),
                worldVersion: context.targetWorldVersion,
                runtimeRevision: context.targetRuntimeRevision,
                createdAt: input.committedAt,
              })
            : createWorkerProgressEvent({
                turnId: input.token.turnId,
                sequence: loaded.nextEventSequence,
                acceptedWorldVersion: readAcceptedWorldVersion(handle),
                worldVersion: context.targetWorldVersion,
                runtimeRevision: context.targetRuntimeRevision,
                createdAt: input.committedAt,
                progress: "world_acting",
              }));
        },
      });
      const committed = loadTurn(input.token.turnId);
      if (!committed) throw corrupt("Campaign Play actor transition turn disappeared.");
      return committed;
    },

    commitDeterministic(input) {
      validateDeterministicTransitionInput(input);
      const transitionRoute = resolveDeterministicTransition(input.transition);
      const preflight = loadTurn(input.token.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.committedAt, "deterministic commit");
      const claimRoute = resolveStageClaimRoute(
        preflight.turnKind,
        input.token.stage,
        preflight.modelSelection,
      );
      if (claimRoute.model !== null) {
        throw stageInvalid("Campaign Play deterministic commit requires a deterministic stage lease.");
      }
      if (
        preflight.stage !== transitionRoute.expectedStage ||
        preflight.workerLeaseOwner !== input.token.owner ||
        preflight.workerEpoch !== input.token.epoch ||
        preflight.workerLeaseExpiresAt !== input.token.expiresAt
      ) {
        throw fenceLost("Campaign Play deterministic commit lost its exact worker lease.");
      }
      if (input.transition === "visibility_projected" && preflight.publicPacketHash !== null) {
        throw fenceLost("Campaign Play visibility packet authority is already frozen.");
      }
      assertMutationIdUnused(handle, input.mutationId);
      const protectedPayloadHash = hashCampaignPlayProjection({
        domain: "campaign_play_deterministic_transition",
        turnId: input.token.turnId,
        transition: input.transition,
        expectedStage: transitionRoute.expectedStage,
        nextStage: transitionRoute.nextStage,
        worldVersionAdvance: input.worldVersionAdvance,
        publicPacketHash: input.publicPacketHash ?? null,
        workerEpoch: input.token.epoch,
        mutationId: input.mutationId,
      });
      const commit = input.worldVersionAdvance > 0
        ? stateRepository.commitMechanicalAndRuntime.bind(stateRepository)
        : stateRepository.commitRuntime.bind(stateRepository);
      commit({
        ...(input.worldVersionAdvance > 0
          ? { worldVersionAdvance: input.worldVersionAdvance }
          : {}),
        event: {
          eventId: input.mutationId,
          turnId: input.token.turnId,
          kind: transitionRoute.eventKind,
          workerEpoch: input.token.epoch,
          protectedPayloadHash,
          createdAt: input.committedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.token.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.committedAt, "deterministic commit");
          const currentRoute = resolveStageClaimRoute(
            loaded.turnKind,
            input.token.stage,
            loaded.modelSelection,
          );
          if (
            currentRoute.model !== null || loaded.stage !== transitionRoute.expectedStage ||
            loaded.workerLeaseOwner !== input.token.owner ||
            loaded.workerEpoch !== input.token.epoch ||
            loaded.workerLeaseExpiresAt !== input.token.expiresAt ||
            input.committedAt >= input.token.expiresAt ||
            (input.transition === "visibility_projected" && loaded.publicPacketHash !== null)
          ) {
            throw fenceLost("Campaign Play deterministic commit lost its exact worker lease.");
          }
          assertMutationIdUnused(handle, input.mutationId);
          const turnUpdate = handle.sqlite.prepare(`
            UPDATE campaign_play_turns SET stage = ?, public_packet_hash = ?,
              worker_lease_owner = NULL, worker_lease_expires_at = NULL,
              next_event_sequence = ?, updated_at = ?
            WHERE id = ? AND campaign_id = ? AND stage = ? AND worker_lease_owner = ?
              AND worker_epoch = ? AND worker_lease_expires_at = ?
              AND public_packet_hash IS ?
          `).run(
            transitionRoute.nextStage,
            input.transition === "visibility_projected" ? input.publicPacketHash : loaded.publicPacketHash,
            loaded.nextEventSequence + 1,
            input.committedAt,
            input.token.turnId,
            handle.campaignId,
            transitionRoute.expectedStage,
            input.token.owner,
            input.token.epoch,
            input.token.expiresAt,
            loaded.publicPacketHash,
          );
          if (turnUpdate.changes !== 1) {
            throw fenceLost("Campaign Play deterministic commit lost its turn compare-and-swap.");
          }
          input.mutate?.(context);
          insertTurnEvent(handle, input.mutationId, createWorkerProgressEvent({
            turnId: input.token.turnId,
            sequence: loaded.nextEventSequence,
            acceptedWorldVersion: readAcceptedWorldVersion(handle),
            worldVersion: context.targetWorldVersion,
            runtimeRevision: context.targetRuntimeRevision,
            createdAt: input.committedAt,
            progress: publicProgressForStage(transitionRoute.nextStage),
          }));
        },
      });
      const committed = loadTurn(input.token.turnId);
      if (!committed) throw corrupt("Campaign Play deterministic turn disappeared.");
      return committed;
    },
    interruptExternal(input) {
      validateLeaseToken(input.token);
      return interruptExternalAttempt({
        turnId: input.token.turnId,
        stage: input.token.stage,
        owner: input.token.owner,
        epoch: input.token.epoch,
        leaseExpiresAt: input.token.expiresAt,
        occurredAt: input.interruptedAt,
        mutationId: input.mutationId,
        evidence: input.evidence,
        expiryMode: "live",
      });
    },
    interruptExpiredExternal(input) {
      return interruptExternalAttempt({
        turnId: input.turnId,
        stage: input.stage,
        owner: input.owner,
        epoch: input.observedEpoch,
        leaseExpiresAt: input.observedLeaseExpiresAt,
        occurredAt: input.observedAt,
        mutationId: input.mutationId,
        evidence: input.evidence,
        expiryMode: "expired",
      });
    },
    resumeExternal(input) {
      if (
        !isNonemptyText(input.turnId) || !isNonemptyText(input.owner) ||
        !isPositiveInteger(input.observedEpoch) || !isNonnegativeInteger(input.resumedAt) ||
        !isNonnegativeInteger(input.leaseExpiresAt) || input.leaseExpiresAt <= input.resumedAt ||
        input.observedEpoch === Number.MAX_SAFE_INTEGER
      ) {
        throw stageInvalid("Campaign Play external resume has invalid fencing fields.");
      }
      const preflight = loadTurn(input.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.resumedAt, "external resume");
      if (
        preflight.stage !== "interrupted" || !preflight.resumeEligible ||
        preflight.interruptedStage !== input.interruptedStage ||
        preflight.workerEpoch !== input.observedEpoch
      ) {
        throw fenceLost("Campaign Play external resume does not match the interrupted turn.");
      }
      const route = resolveStageClaimRoute(
        preflight.turnKind,
        input.interruptedStage,
        preflight.modelSelection,
      );
      if (route.model === null) {
        throw stageInvalid("Campaign Play external resume requires an external model stage.");
      }
      const modelKind = route.model.kind;
      assertMutationIdUnused(handle, input.mutationId);
      const nextEpoch = input.observedEpoch + 1;
      const stageId = modelStageId(input.turnId, modelKind);
      const priorAttempts = selectModelStages(handle, input.turnId)
        .filter((attempt) => attempt.stageId === stageId);
      const prior = priorAttempts.at(-1);
      if (!prior || prior.status !== "interrupted" || prior.workerEpoch !== input.observedEpoch) {
        throw corrupt("Campaign Play external resume lacks its interrupted predecessor.");
      }
      const protectedPayloadHash = hashCampaignPlayProjection({
        domain: "campaign_play_external_resume",
        turnId: input.turnId,
        stage: input.interruptedStage,
        stageId,
        workerEpoch: nextEpoch,
        owner: input.owner,
        resumedAt: input.resumedAt,
        leaseExpiresAt: input.leaseExpiresAt,
        mutationId: input.mutationId,
      });
      stateRepository.commitRuntime({
        event: {
          eventId: input.mutationId,
          turnId: input.turnId,
          kind: "turn_resumed",
          workerEpoch: nextEpoch,
          protectedPayloadHash,
          createdAt: input.resumedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.resumedAt, "external resume");
          if (
            loaded.stage !== "interrupted" || !loaded.resumeEligible ||
            loaded.interruptedStage !== input.interruptedStage ||
            loaded.workerEpoch !== input.observedEpoch
          ) {
            throw fenceLost("Campaign Play external resume lost its interrupted turn.");
          }
          const currentRoute = resolveStageClaimRoute(
            loaded.turnKind,
            input.interruptedStage,
            loaded.modelSelection,
          );
          if (currentRoute.model === null || currentRoute.model.kind !== modelKind) {
            throw stageInvalid("Campaign Play interrupted stage is no longer externally resumable.");
          }
          assertMutationIdUnused(handle, input.mutationId);
          const attempts = selectModelStages(handle, input.turnId)
            .filter((attempt) => attempt.stageId === stageId);
          const latest = attempts.at(-1);
          if (!latest || latest.status !== "interrupted" || latest.workerEpoch !== input.observedEpoch) {
            throw fenceLost("Campaign Play external resume lost its interrupted attempt.");
          }
          const turnUpdate = handle.sqlite.prepare(`
            UPDATE campaign_play_turns SET stage = ?, interrupted_stage = NULL,
              error_code = NULL, resume_eligible = 0, worker_lease_owner = ?,
              worker_epoch = ?, worker_lease_expires_at = ?, next_event_sequence = ?, updated_at = ?
            WHERE id = ? AND campaign_id = ? AND stage = 'interrupted'
              AND interrupted_stage = ? AND worker_epoch = ? AND resume_eligible = 1
              AND worker_lease_owner IS NULL AND worker_lease_expires_at IS NULL
          `).run(
            input.interruptedStage, input.owner, nextEpoch, input.leaseExpiresAt,
            loaded.nextEventSequence + 1, input.resumedAt, input.turnId, handle.campaignId,
            input.interruptedStage, input.observedEpoch,
          );
          if (turnUpdate.changes !== 1) {
            throw fenceLost("Campaign Play external resume lost its turn compare-and-swap.");
          }
          handle.sqlite.prepare(`
            INSERT INTO campaign_play_model_stages (
              id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
              requested_provider_id, requested_model, requested_strategy,
              schema_outcome, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'started', ?, ?, ?, ?, 'pending', ?)
          `).run(
            modelStageAttemptId(stageId, latest.attempt + 1), stageId, latest.attempt + 1,
            handle.campaignId, input.turnId, currentRoute.model.kind, nextEpoch,
            latest.requestedProviderId, latest.requestedModel, latest.requestedStrategy,
            input.resumedAt,
          );
          insertTurnEvent(handle, input.mutationId, createWorkerProgressEvent({
            turnId: input.turnId,
            sequence: loaded.nextEventSequence,
            acceptedWorldVersion: readAcceptedWorldVersion(handle),
            worldVersion: context.priorWorldVersion,
            runtimeRevision: context.targetRuntimeRevision,
            createdAt: input.resumedAt,
            progress: currentRoute.progress,
          }));
        },
      });
      return {
        turnId: input.turnId,
        stage: input.interruptedStage,
        owner: input.owner,
        epoch: nextEpoch,
        expiresAt: input.leaseExpiresAt,
      };
    },
    failTurn(input) {
      validateLeaseToken(input.token);
      if (!isNonnegativeInteger(input.failedAt) || input.failedAt >= input.token.expiresAt) {
        throw fenceLost("Campaign Play terminal failure arrived after its worker lease expired.");
      }
      if (!CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES.includes(input.errorCode)) {
        throw stageInvalid("Campaign Play terminal failure has an invalid internal error code.");
      }
      const mutationAuditJson = canonicalizeCampaignPlayProjection(input.mutationAudit);
      const preflight = loadTurn(input.token.turnId);
      if (!preflight) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      assertChronologicalBoundary(preflight, input.failedAt, "terminal failure");
      if (stageProgressRank(input.token.stage) >= stageProgressRank("primary_settled")) {
        throw stageInvalid("Campaign Play terminal failure is limited to pre-settlement authority.");
      }
      const route = resolveStageClaimRoute(
        preflight.turnKind,
        input.token.stage,
        preflight.modelSelection,
      );
      if (
        preflight.stage !== input.token.stage ||
        preflight.workerLeaseOwner !== input.token.owner ||
        preflight.workerEpoch !== input.token.epoch ||
        preflight.workerLeaseExpiresAt !== input.token.expiresAt
      ) {
        throw fenceLost("Campaign Play terminal failure lost its exact worker lease.");
      }
      if ((route.model !== null) !== (input.modelEvidence !== null)) {
        throw stageInvalid("Campaign Play terminal failure evidence does not match its stage kind.");
      }
      if (input.modelEvidence !== null) validateModelFailureEvidence(input.modelEvidence);
      const stageId = route.model === null
        ? null
        : modelStageId(input.token.turnId, route.model.kind);
      if (stageId !== null) {
        selectExactStartedAttempt(handle, input.token.turnId, stageId, input.token.epoch);
      }
      assertMutationIdUnused(handle, input.mutationId);
      const protectedPayloadHash = hashCampaignPlayProjection({
        domain: "campaign_play_terminal_failure",
        turnId: input.token.turnId,
        stage: input.token.stage,
        workerEpoch: input.token.epoch,
        errorCode: input.errorCode,
        publicErrorCode: input.publicErrorCode,
        mutationAudit: input.mutationAudit,
        modelEvidence: input.modelEvidence,
        mutationId: input.mutationId,
      });
      stateRepository.commitRuntime({
        event: {
          eventId: input.mutationId,
          turnId: input.token.turnId,
          kind: "turn_failed",
          workerEpoch: input.token.epoch,
          protectedPayloadHash,
          createdAt: input.failedAt,
        },
        mutate(context) {
          const current = selectTurn(handle, "id", input.token.turnId);
          if (!current || current.campaignId !== handle.campaignId) {
            throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
          }
          const loaded = loadRow(handle, current);
          assertChronologicalBoundary(loaded, input.failedAt, "terminal failure");
          const currentRoute = resolveStageClaimRoute(
            loaded.turnKind,
            input.token.stage,
            loaded.modelSelection,
          );
          if (
            loaded.stage !== input.token.stage ||
            loaded.workerLeaseOwner !== input.token.owner ||
            loaded.workerEpoch !== input.token.epoch ||
            loaded.workerLeaseExpiresAt !== input.token.expiresAt ||
            input.failedAt >= input.token.expiresAt ||
            (currentRoute.model !== null) !== (input.modelEvidence !== null)
          ) {
            throw fenceLost("Campaign Play terminal failure lost its exact worker lease.");
          }
          assertMutationIdUnused(handle, input.mutationId);
          if (currentRoute.model !== null && input.modelEvidence !== null) {
            const currentStageId = modelStageId(input.token.turnId, currentRoute.model.kind);
            if (currentStageId !== stageId) {
              throw fenceLost("Campaign Play terminal failure model stage has advanced.");
            }
            selectExactStartedAttempt(handle, input.token.turnId, currentStageId, input.token.epoch);
            const attemptUpdate = handle.sqlite.prepare(`
              UPDATE campaign_play_model_stages SET status = 'failed',
                actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
                input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
                schema_outcome = ?, error_code = ?, completed_at = ?
              WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
                AND worker_epoch = ? AND status = 'started'
            `).run(
              input.modelEvidence.actualProviderId, input.modelEvidence.actualModel,
              input.modelEvidence.actualStrategy, input.modelEvidence.inputTokens,
              input.modelEvidence.outputTokens, input.modelEvidence.durationMs,
              input.modelEvidence.finishReason, input.modelEvidence.schemaOutcome,
              input.errorCode, input.failedAt, handle.campaignId,
              input.token.turnId, currentStageId, input.token.epoch,
            );
            if (attemptUpdate.changes !== 1) {
              throw fenceLost("Campaign Play terminal failure lost its model attempt.");
            }
          }
          const turnUpdate = handle.sqlite.prepare(`
            UPDATE campaign_play_turns SET stage = 'failed', final_world_version = ?,
              error_code = ?, mutation_audit_json = ?, worker_lease_owner = NULL,
              worker_lease_expires_at = NULL, next_event_sequence = ?,
              updated_at = ?, completed_at = ?
            WHERE id = ? AND campaign_id = ? AND stage = ? AND worker_lease_owner = ?
              AND worker_epoch = ? AND worker_lease_expires_at = ?
          `).run(
            context.targetWorldVersion, input.errorCode, mutationAuditJson,
            loaded.nextEventSequence + 1, input.failedAt, input.failedAt,
            input.token.turnId, handle.campaignId, input.token.stage,
            input.token.owner, input.token.epoch, input.token.expiresAt,
          );
          if (turnUpdate.changes !== 1) {
            throw fenceLost("Campaign Play terminal failure lost its turn compare-and-swap.");
          }
          insertTurnEvent(handle, input.mutationId, createTerminalEvent({
            type: "turn.failed",
            publicErrorCode: input.publicErrorCode,
            turnId: input.token.turnId,
            sequence: loaded.nextEventSequence,
            acceptedWorldVersion: readAcceptedWorldVersion(handle),
            worldVersion: context.targetWorldVersion,
            runtimeRevision: context.targetRuntimeRevision,
            createdAt: input.failedAt,
          }));
        },
      });
      const failed = loadTurn(input.token.turnId);
      if (!failed) throw corrupt("Campaign Play failed turn disappeared.");
      return failed;
    },
    loadRecoveryState(turnId, observedAt) {
      if (!isNonnegativeInteger(observedAt)) {
        throw stageInvalid("Campaign Play recovery observation time is invalid.");
      }
      const turn = loadTurn(turnId);
      if (!turn) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      if (turn.stage === "completed") {
        return {
          kind: "completed",
          turnId,
          finalWorldVersion: turn.finalWorldVersion!,
          completedAt: turn.completedAt!,
        };
      }
      if (turn.stage === "failed") {
        return {
          kind: "terminal_failure",
          turnId,
          finalWorldVersion: turn.finalWorldVersion!,
          completedAt: turn.completedAt!,
          errorCode: turn.errorCode!,
          mutationAudit: turn.mutationAudit,
        };
      }
      const stages = selectModelStages(handle, turnId);
      if (turn.stage === "interrupted") {
        if (turn.interruptedStage === null || turn.errorCode === null) {
          throw corrupt("Campaign Play interrupted recovery state lacks its attempt evidence.");
        }
        const row = selectTurn(handle, "id", turnId);
        if (!row) throw corrupt("Campaign Play interrupted recovery row disappeared.");
        const latest = selectExactInterruptedAttemptForStage(
          handle,
          row,
          turn.modelSelection,
          turn.interruptedStage,
          turn.workerEpoch,
          stages,
        );
        return {
          kind: "explicit_resume_required",
          turnId,
          interruptedStage: turn.interruptedStage,
          workerEpoch: turn.workerEpoch,
          attempt: latest.attempt,
          attemptStartedAt: latest.createdAt,
          errorCode: turn.errorCode,
        };
      }
      const route = resolveStageClaimRoute(turn.turnKind, turn.stage, turn.modelSelection);
      if (route.model === null) {
        if (turn.workerLeaseOwner === null) {
          return { kind: "deterministic_ready", turnId, stage: turn.stage, workerEpoch: turn.workerEpoch };
        }
        return {
          kind: "deterministic_in_flight",
          turnId,
          token: {
            turnId, stage: turn.stage, owner: turn.workerLeaseOwner,
            epoch: turn.workerEpoch, expiresAt: turn.workerLeaseExpiresAt!,
          },
        };
      }
      if (turn.workerLeaseOwner === null) {
        return { kind: "external_ready", turnId, stage: turn.stage, workerEpoch: turn.workerEpoch };
      }
      const stageId = modelStageId(turnId, route.model.kind);
      const attempt = selectExactStartedAttempt(handle, turnId, stageId, turn.workerEpoch);
      const token: CampaignPlayWorkerLeaseToken = {
        turnId,
        stage: turn.stage,
        owner: turn.workerLeaseOwner,
        epoch: turn.workerEpoch,
        expiresAt: turn.workerLeaseExpiresAt!,
      };
      return observedAt >= token.expiresAt
        ? {
            kind: "external_interruption_required",
            turnId,
            token,
            attempt: attempt.attempt,
            attemptStartedAt: attempt.createdAt,
          }
        : {
            kind: "external_in_flight",
            turnId,
            token,
            attempt: attempt.attempt,
            attemptStartedAt: attempt.createdAt,
          };
    },
    loadAcceptedModelArtifact(turnId, kind) {
      const turn = loadTurn(turnId);
      if (!turn) {
        throw new CampaignPlayTurnRepositoryError(
          "turn_not_found",
          "Campaign Play turn was not found.",
        );
      }
      if (kind === "actor_replanner") {
        throw stageInvalid(
          "Campaign Play actor replanner artifacts are owned by individual actor jobs.",
        );
      }
      const requested = requestedModelForStageKind(turn.modelSelection, kind);
      if (requested === null) {
        throw stageInvalid("Campaign Play model artifact kind does not belong to this turn.");
      }
      const accepted = selectModelStages(handle, turnId).filter((stage) =>
        stage.kind === kind && stage.status === "accepted"
      );
      if (accepted.length === 0) return null;
      if (accepted.length !== 1) {
        throw corrupt("Campaign Play model stage has multiple accepted artifacts.");
      }
      const stage = accepted[0];
      if (
        stage.actualProviderId === null || stage.actualModel === null ||
        stage.actualStrategy === null || stage.inputTokens === null ||
        stage.outputTokens === null || stage.durationMs === null ||
        stage.finishReason === null || stage.artifactJson === null ||
        stage.artifactHash === null || stage.completedAt === null
      ) {
        throw corrupt("Campaign Play accepted model artifact lacks execution evidence.");
      }
      let artifact: unknown;
      try {
        artifact = JSON.parse(stage.artifactJson) as unknown;
      } catch (error) {
        throw corrupt("Campaign Play accepted model artifact cannot be parsed.", error);
      }
      return {
        kind: stage.kind,
        attempt: stage.attempt,
        workerEpoch: stage.workerEpoch,
        artifact,
        artifactHash: stage.artifactHash,
        requested,
        evidence: {
          actualProviderId: stage.actualProviderId,
          actualModel: stage.actualModel,
          actualStrategy: stage.actualStrategy,
          inputTokens: stage.inputTokens,
          outputTokens: stage.outputTokens,
          durationMs: stage.durationMs,
          finishReason: stage.finishReason,
        },
        startedAt: stage.createdAt,
        completedAt: stage.completedAt,
      };
    },
    loadWorkerStageTiming(turnId, workerEpoch) {
      const turn = loadTurn(turnId);
      if (!turn) {
        throw new CampaignPlayTurnRepositoryError(
          "turn_not_found",
          "Campaign Play turn was not found.",
        );
      }
      if (!isPositiveInteger(workerEpoch)) {
        throw stageInvalid("Campaign Play worker timing requires a positive epoch.");
      }
      const rows = handle.sqlite.prepare(`
        SELECT runtime.created_at AS claimedAt,
          current_event.sequence AS claimedSequence,
          previous_event.created_at AS queuedAt,
          (
            SELECT COUNT(*) FROM campaign_play_runtime_events AS renewal
            WHERE renewal.campaign_id = runtime.campaign_id
              AND renewal.turn_id = runtime.turn_id
              AND renewal.worker_epoch = runtime.worker_epoch
              AND renewal.kind = 'worker_lease_renewed'
          ) AS leaseRenewals
        FROM campaign_play_runtime_events AS runtime
        JOIN campaign_play_turn_events AS current_event
          ON current_event.campaign_id = runtime.campaign_id
          AND current_event.turn_id = runtime.turn_id
          AND current_event.event_id = runtime.event_id
        JOIN campaign_play_turn_events AS previous_event
          ON previous_event.campaign_id = current_event.campaign_id
          AND previous_event.turn_id = current_event.turn_id
          AND previous_event.sequence = current_event.sequence - 1
        WHERE runtime.campaign_id = ? AND runtime.turn_id = ?
          AND runtime.worker_epoch = ?
          AND runtime.kind IN ('worker_claimed', 'turn_resumed')
      `).all(handle.campaignId, turn.turnId, workerEpoch) as Array<{
        claimedAt: number;
        claimedSequence: number;
        queuedAt: number;
        leaseRenewals: number;
      }>;
      if (rows.length !== 1) {
        throw corrupt("Campaign Play worker epoch lacks one durable claim boundary.");
      }
      const timing = rows[0];
      if (
        !isNonnegativeInteger(timing.claimedAt) ||
        !isPositiveInteger(timing.claimedSequence) || timing.claimedSequence <= 1 ||
        !isNonnegativeInteger(timing.queuedAt) || timing.queuedAt > timing.claimedAt ||
        !isNonnegativeInteger(timing.leaseRenewals)
      ) {
        throw corrupt("Campaign Play worker timing ledger is invalid.");
      }
      return {
        claimedAt: timing.claimedAt,
        queueTimeMs: timing.claimedAt - timing.queuedAt,
        leaseRenewals: timing.leaseRenewals,
      };
    },
    loadTurnTelemetry(turnId) {
      const turn = loadTurn(turnId);
      if (!turn) {
        throw new CampaignPlayTurnRepositoryError(
          "turn_not_found",
          "Campaign Play turn was not found.",
        );
      }
      const modelStages = selectModelStages(handle, turnId);
      const eventRows = handle.sqlite.prepare(`SELECT
          runtime.event_id AS eventId, runtime.kind,
          runtime.worker_epoch AS workerEpoch, runtime.created_at AS createdAt,
          turn_event.sequence, turn_event.payload_json AS payloadJson
        FROM campaign_play_runtime_events runtime
        JOIN campaign_play_turn_events turn_event
          ON turn_event.campaign_id = runtime.campaign_id
          AND turn_event.turn_id = runtime.turn_id
          AND turn_event.event_id = runtime.event_id
        WHERE runtime.campaign_id = ? AND runtime.turn_id = ?
        ORDER BY turn_event.sequence`).all(handle.campaignId, turnId) as Array<{
          eventId: string;
          kind: string;
          workerEpoch: number | null;
          createdAt: number;
          sequence: number;
          payloadJson: string;
        }>;
      const stageExecutions: CampaignPlayStageExecutionTelemetry[] = [];
      for (let index = 0; index < eventRows.length; index += 1) {
        const claim = eventRows[index]!;
        if (claim.kind !== "worker_claimed" && claim.kind !== "turn_resumed") continue;
        if (claim.workerEpoch === null) {
          throw corrupt("Campaign Play telemetry claim lacks its worker epoch.");
        }
        const publicEvent = campaignPlaySseEventSchema.parse(JSON.parse(claim.payloadJson));
        if (publicEvent.type !== "turn.progressed") {
          throw corrupt("Campaign Play telemetry claim lacks its public progress event.");
        }
        const queued = eventRows.find((event) => event.sequence === claim.sequence - 1);
        if (!queued || queued.createdAt > claim.createdAt) {
          throw corrupt("Campaign Play telemetry claim lacks its durable queue boundary.");
        }
        const nextClaimIndex = eventRows.findIndex((event, candidateIndex) =>
          candidateIndex > index &&
          (event.kind === "worker_claimed" || event.kind === "turn_resumed")
        );
        const boundaryIndex = nextClaimIndex === -1 ? eventRows.length : nextClaimIndex;
        const ownedEvents = eventRows.slice(index + 1, boundaryIndex).filter((event) =>
          event.workerEpoch === claim.workerEpoch
        );
        const completed = ownedEvents.filter((event) =>
          event.kind !== "worker_lease_renewed"
        ).at(-1);
        const supersededAt = completed || nextClaimIndex === -1
          ? null
          : eventRows[nextClaimIndex]!.createdAt;
        const renewals = ownedEvents.filter((event) =>
            event.workerEpoch === claim.workerEpoch && event.kind === "worker_lease_renewed"
          ).length;
        const outcome = completed?.kind === "turn_interrupted"
          ? "interrupted"
          : completed?.kind === "turn_failed"
            ? "failed"
            : completed
              ? "advanced"
              : supersededAt !== null
                ? "superseded"
                : "in_flight";
        const completedAt = completed?.createdAt ?? supersededAt;
        stageExecutions.push({
          stage: telemetryStageForProgress(
            publicEvent.progress,
            claim.workerEpoch,
            modelStages,
            resolveActionExecutionRoute(turn.document, turn.modelSelection),
          ),
          workerEpoch: claim.workerEpoch,
          claimedAt: claim.createdAt,
          completedAt,
          queueTimeMs: claim.createdAt - queued.createdAt,
          latencyMs: completedAt === null ? null : completedAt - claim.createdAt,
          leaseRenewals: renewals,
          outcome,
        });
      }
      const modelAttempts = modelStages.map((attempt): CampaignPlayModelAttemptTelemetry => {
        const requested = requestedModelForStageKind(turn.modelSelection, attempt.kind);
        if (!requested) {
          throw corrupt("Campaign Play model telemetry lacks frozen pricing authority.");
        }
        const estimatedCostMicros = telemetryCost(
          attempt.inputTokens,
          attempt.outputTokens,
          requested.pricing,
        );
        return {
          stageId: attempt.stageId,
          kind: attempt.kind,
          attempt: attempt.attempt,
          workerEpoch: attempt.workerEpoch,
          status: attempt.status,
          requestedProviderId: attempt.requestedProviderId,
          requestedModel: attempt.requestedModel,
          actualProviderId: attempt.actualProviderId,
          actualModel: attempt.actualModel,
          startedAt: attempt.createdAt,
          completedAt: attempt.completedAt,
          durationMs: attempt.durationMs,
          inputTokens: attempt.inputTokens,
          outputTokens: attempt.outputTokens,
          estimatedCostMicros,
          costComplete: estimatedCostMicros !== null,
          errorCode: attempt.errorCode,
        };
      });
      const narrationAttemptCount = (handle.sqlite.prepare(`SELECT COUNT(*) AS count
        FROM campaign_play_narration_attempts WHERE campaign_id = ? AND turn_id = ?`).get(
          handle.campaignId,
          turnId,
        ) as { count: number }).count;
      const modelCallCounts = {
        openingPlanner: modelAttempts.filter((attempt) => attempt.kind === "opening_planner").length,
        judge: modelAttempts.filter((attempt) => attempt.kind === "judge").length,
        gameMaster: modelAttempts.filter((attempt) => attempt.kind === "game_master").length,
        actorReplanner: modelAttempts.filter((attempt) => attempt.kind === "actor_replanner").length,
        narrator: modelAttempts.filter((attempt) => attempt.kind === "narrator").length +
          narrationAttemptCount,
      };
      const costComplete = modelAttempts.every((attempt) => attempt.costComplete);
      const stageLatencyComplete = stageExecutions.every((stage) => stage.latencyMs !== null);
      const inputComplete = modelAttempts.every((attempt) => attempt.inputTokens !== null);
      const outputComplete = modelAttempts.every((attempt) => attempt.outputTokens !== null);
      const queueTimeMs = telemetrySum(
        stageExecutions.map((stage) => stage.queueTimeMs),
        "queue-time",
      );
      const stageLatencyMs = stageLatencyComplete
        ? telemetrySum(stageExecutions.map((stage) => stage.latencyMs!), "stage-latency")
        : null;
      const inputTokens = inputComplete
        ? telemetrySum(modelAttempts.map((attempt) => attempt.inputTokens!), "input-token")
        : null;
      const outputTokens = outputComplete
        ? telemetrySum(modelAttempts.map((attempt) => attempt.outputTokens!), "output-token")
        : null;
      return {
        turnId,
        routeKind: resolveActionExecutionRoute(turn.document, turn.modelSelection),
        submittedAt: turn.submittedAt,
        completedAt: turn.completedAt,
        totalLatencyMs: turn.completedAt === null ? null : turn.completedAt - turn.submittedAt,
        queueTimeMs,
        stageLatencyMs,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens === null || outputTokens === null
          ? null
          : telemetrySum([inputTokens, outputTokens], "total-token"),
        estimatedCostMicros: costComplete
          ? telemetrySum(
              modelAttempts.map((attempt) => attempt.estimatedCostMicros!),
              "estimated-cost",
            )
          : null,
        costComplete,
        terminalReason: turn.terminalReason,
        modelCallCounts,
        stageExecutions,
        modelAttempts,
      };
    },
    loadTurn,
    loadTurnByIdempotencyKey,
    loadActiveTurn() {
      const row = selectTurn(handle, "active");
      return row ? loadRow(handle, row) : null;
    },
    loadSupersedableOpening() {
      const row = handle.sqlite.prepare(`SELECT
          id AS turnId, campaign_id AS campaignId, turn_kind AS turnKind,
          supersedes_turn_id AS supersedesTurnId, input_json AS inputJson,
          input_hash AS inputHash, idempotency_key AS idempotencyKey,
          expected_world_version AS expectedWorldVersion,
          expected_runtime_revision AS expectedRuntimeRevision,
          base_world_version AS baseWorldVersion,
          final_world_version AS finalWorldVersion, stage, frame_hash AS frameHash,
          next_event_sequence AS nextEventSequence,
          worker_lease_owner AS workerLeaseOwner, worker_epoch AS workerEpoch,
          worker_lease_expires_at AS workerLeaseExpiresAt,
          model_selection_json AS modelSelectionJson,
          public_packet_hash AS publicPacketHash,
          interrupted_stage AS interruptedStage, error_code AS errorCode,
          resume_eligible AS resumeEligible, mutation_audit_json AS mutationAuditJson,
          submitted_at AS submittedAt, updated_at AS updatedAt,
          completed_at AS completedAt
        FROM campaign_play_turns failed
        WHERE failed.campaign_id = ? AND failed.turn_kind = 'opening'
          AND failed.stage = 'failed'
          AND failed.final_world_version = failed.base_world_version
          AND NOT EXISTS (
            SELECT 1 FROM campaign_play_turns successor
            WHERE successor.campaign_id = failed.campaign_id
              AND successor.supersedes_turn_id = failed.id
          )
        ORDER BY failed.completed_at DESC, failed.id DESC LIMIT 1`).get(
          handle.campaignId,
        ) as TurnRow | undefined;
      return row ? loadRow(handle, row) : null;
    },
    listTurnEvents(turnId, afterSequence = 0) {
      const turn = loadTurn(turnId);
      if (!turn) {
        throw new CampaignPlayTurnRepositoryError("turn_not_found", "Campaign Play turn was not found.");
      }
      return turn.events.filter((event) => event.sequence > afterSequence);
    },
  };

  return {
    ...operations,
    claimStage(input) {
      return executeTurnWrite(input.turnId, () => operations.claimStage(input), (turn, token) => {
        if (
          turn.stage !== token.stage || turn.workerLeaseOwner !== token.owner ||
          turn.workerEpoch !== token.epoch || turn.workerLeaseExpiresAt !== token.expiresAt
        ) {
          throw corrupt("Campaign Play claimed lease failed its final durable verification.");
        }
        return token;
      });
    },
    renewLease(input) {
      return executeTurnWrite(input.token.turnId, () => operations.renewLease(input), (turn, token) => {
        if (
          turn.stage !== token.stage || turn.workerLeaseOwner !== token.owner ||
          turn.workerEpoch !== token.epoch || turn.workerLeaseExpiresAt !== token.expiresAt
        ) {
          throw corrupt("Campaign Play renewed lease failed its final durable verification.");
        }
        return token;
      });
    },
    acceptModelArtifact(input) {
      return executeTurnWrite(
        input.token.turnId,
        () => operations.acceptModelArtifact(input),
        (turn) => turn,
      );
    },
    commitDeterministic(input) {
      return executeTurnWrite(
        input.token.turnId,
        () => operations.commitDeterministic(input),
        (turn) => turn,
      );
    },
    interruptExternal(input) {
      return executeTurnWrite(
        input.token.turnId,
        () => operations.interruptExternal(input),
        (turn) => turn,
      );
    },
    interruptExpiredExternal(input) {
      return executeTurnWrite(
        input.turnId,
        () => operations.interruptExpiredExternal(input),
        (turn) => turn,
      );
    },
    resumeExternal(input) {
      return executeTurnWrite(input.turnId, () => operations.resumeExternal(input), (turn, token) => {
        if (
          turn.stage !== token.stage || turn.workerLeaseOwner !== token.owner ||
          turn.workerEpoch !== token.epoch || turn.workerLeaseExpiresAt !== token.expiresAt
        ) {
          throw corrupt("Campaign Play resumed lease failed its final durable verification.");
        }
        return token;
      });
    },
    failTurn(input) {
      return executeTurnWrite(
        input.token.turnId,
        () => operations.failTurn(input),
        (turn) => turn,
      );
    },
  };
}
