import { setTimeout as waitForTimer } from "node:timers/promises";
import type { CampaignPlayPublicProgress } from "@worldforge/shared";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import { hashCampaignPlayProjection } from "./campaign-play-projection.js";
import {
  CampaignPlayTurnRepositoryError,
  createCampaignPlayTurnRepository,
  type CampaignPlayAcceptedModelArtifact,
  type CampaignPlayClaimableTurnStage,
  type CampaignPlayExternalInterruptionEvidence,
  type CampaignPlayRecoveryState,
  type CampaignPlayTurnModelStageKind,
  type CampaignPlayWorkerLeaseToken,
  type LoadedCampaignPlayTurn,
} from "./campaign-play-turn-repository.js";

export type CampaignPlayTurnServiceErrorCode =
  | "turn_service_invalid"
  | "turn_handler_missing"
  | "turn_stage_stalled";

export class CampaignPlayTurnServiceError extends Error {
  constructor(
    readonly code: CampaignPlayTurnServiceErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayTurnServiceError";
  }
}

export interface CampaignPlayTurnServiceClock {
  now(): number;
  wait(delayMs: number, signal: AbortSignal): Promise<void>;
}

export interface CampaignPlayTurnServiceArtifactReader {
  load(kind: CampaignPlayTurnModelStageKind): CampaignPlayAcceptedModelArtifact | null;
}

export interface CampaignPlayExternalStageCompletion {
  commit(input: {
    token: CampaignPlayWorkerLeaseToken;
    completedAt: number;
  }): undefined;
}

export interface CampaignPlayExternalStageContext {
  turn: LoadedCampaignPlayTurn;
  token: CampaignPlayWorkerLeaseToken;
  attempt: number;
  signal: AbortSignal;
}

export interface CampaignPlayDeterministicStageContext {
  turn: LoadedCampaignPlayTurn;
  token: CampaignPlayWorkerLeaseToken;
  artifacts: CampaignPlayTurnServiceArtifactReader;
  signal: AbortSignal;
}

export interface CampaignPlayExternalStageHandler {
  kind: "external";
  externalOperationDeadlineMs?: number;
  execute(
    context: CampaignPlayExternalStageContext,
  ): Promise<CampaignPlayExternalStageCompletion>;
}

export interface CampaignPlayDeterministicStageHandler {
  kind: "deterministic";
  ready(input: {
    turn: LoadedCampaignPlayTurn;
    artifacts: CampaignPlayTurnServiceArtifactReader;
  }): boolean;
  execute(context: CampaignPlayDeterministicStageContext): void | Promise<void>;
}

export type CampaignPlayTurnStageHandler =
  | CampaignPlayExternalStageHandler
  | CampaignPlayDeterministicStageHandler;

export type CampaignPlayTurnStageResolver = (input: {
  turn: LoadedCampaignPlayTurn;
  stage: CampaignPlayClaimableTurnStage;
  artifacts: CampaignPlayTurnServiceArtifactReader;
}) => CampaignPlayTurnStageHandler | null;

export type CampaignPlayStageTelemetryOutcome =
  | "advanced"
  | "interrupted"
  | "stale";

export interface CampaignPlayStageTelemetry {
  turnId: string;
  stage: CampaignPlayClaimableTurnStage;
  progress: CampaignPlayPublicProgress;
  workerEpoch: number;
  attempt: number | null;
  queueTimeMs: number;
  stageTimeMs: number;
  leaseRenewals: number;
  outcome: CampaignPlayStageTelemetryOutcome;
}

export interface CampaignPlayTurnServiceResult {
  turn: LoadedCampaignPlayTurn;
  recovery: CampaignPlayRecoveryState;
  telemetry: CampaignPlayStageTelemetry | null;
}

export interface ResumeCampaignPlayTurnInput {
  turnId: string;
  interruptedStage: CampaignPlayClaimableTurnStage;
  observedEpoch: number;
}

export interface CampaignPlayTurnService {
  runNextStage(turnId: string): Promise<CampaignPlayTurnServiceResult>;
  recoverActiveTurn(): Promise<CampaignPlayTurnServiceResult | null>;
  resumeInterruptedStage(input: ResumeCampaignPlayTurnInput): Promise<CampaignPlayTurnServiceResult>;
}

export interface CreateCampaignPlayTurnServiceInput {
  handle: CampaignPlayDatabaseHandle;
  owner: string;
  leaseDurationMs: number;
  heartbeatIntervalMs: number;
  /**
   * A hard deadline for one provider-backed stage. The durable lease may be
   * renewed while a healthy call is in progress, but it must not turn a
   * single operation into an unbounded wait for the player.
   */
  externalOperationDeadlineMs?: number;
  resolveStage: CampaignPlayTurnStageResolver;
  clock?: CampaignPlayTurnServiceClock;
}

export class CampaignPlayExternalStageInterruption extends Error {
  constructor(
    readonly evidence: CampaignPlayExternalInterruptionEvidence,
    message = "Campaign Play external stage was interrupted.",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayExternalStageInterruption";
  }
}

const defaultClock: CampaignPlayTurnServiceClock = {
  now: () => Date.now(),
  async wait(delayMs, signal) {
    await waitForTimer(delayMs, undefined, { signal });
  },
};

function isSafeNonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isSafePositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function progressForStage(
  turn: LoadedCampaignPlayTurn,
  stage: CampaignPlayClaimableTurnStage,
): CampaignPlayPublicProgress {
  if (stage === "planned") return "settling";
  if (stage === "primary_settled") return "world_acting";
  if (stage === "actors_settled") return "revealing";
  if (stage === "visibility_projected") return "narrating";
  if (stage === "admitted" || (turn.turnKind === "player_action" && stage === "judged")) {
    return "interpreting";
  }
  throw new CampaignPlayTurnServiceError(
    "turn_service_invalid",
    `Campaign Play ${turn.turnKind} stage ${stage} has no worker progress contract.`,
  );
}

function mutationId(input: {
  campaignId: string;
  turnId: string;
  stage: CampaignPlayClaimableTurnStage;
  owner: string;
  epoch: number;
  kind: "claim" | "renew" | "interrupt" | "resume";
  occurredAt: number;
  ordinal: number;
}): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_turn_service_mutation",
    ...input,
  });
}

function recoveryUsesToken(
  recovery: CampaignPlayRecoveryState,
  token: CampaignPlayWorkerLeaseToken,
): boolean {
  return (
    (recovery.kind === "external_in_flight" ||
      recovery.kind === "external_interruption_required" ||
      recovery.kind === "deterministic_in_flight") &&
    recovery.token.turnId === token.turnId &&
    recovery.token.stage === token.stage &&
    recovery.token.owner === token.owner &&
    recovery.token.epoch === token.epoch
  );
}

function isFenceRace(error: unknown): boolean {
  return error instanceof CampaignPlayTurnRepositoryError &&
    error.code === "turn_fence_lost";
}

function interruptionEvidence(
  errorCode: CampaignPlayExternalInterruptionEvidence["errorCode"],
  durationMs: number,
): CampaignPlayExternalInterruptionEvidence {
  return {
    actualProviderId: null,
    actualModel: null,
    actualStrategy: null,
    inputTokens: null,
    outputTokens: null,
    durationMs,
    finishReason: null,
    schemaOutcome: "transport_error",
    errorCode,
  };
}

export function createCampaignPlayTurnService(
  input: CreateCampaignPlayTurnServiceInput,
): CampaignPlayTurnService {
  if (
    input.owner.length === 0 ||
    !isSafePositiveInteger(input.leaseDurationMs) ||
    !isSafePositiveInteger(input.heartbeatIntervalMs) ||
    input.heartbeatIntervalMs >= input.leaseDurationMs ||
    (input.externalOperationDeadlineMs !== undefined &&
      !isSafePositiveInteger(input.externalOperationDeadlineMs))
  ) {
    throw new CampaignPlayTurnServiceError(
      "turn_service_invalid",
      "Campaign Play turn service requires a worker owner, a heartbeat shorter than its lease, and a positive external deadline when configured.",
    );
  }
  const repository = createCampaignPlayTurnRepository(input.handle);
  const clock = input.clock ?? defaultClock;

  const now = (): number => {
    const value = clock.now();
    if (!isSafeNonnegativeInteger(value)) {
      throw new CampaignPlayTurnServiceError(
        "turn_service_invalid",
        "Campaign Play turn service clock returned an invalid timestamp.",
      );
    }
    return value;
  };

  const leaseExpiry = (startedAt: number): number => {
    const value = startedAt + input.leaseDurationMs;
    if (!Number.isSafeInteger(value)) {
      throw new CampaignPlayTurnServiceError(
        "turn_service_invalid",
        "Campaign Play worker lease exceeds the safe timestamp range.",
      );
    }
    return value;
  };

  const requireAtOrAfter = (value: number, baseline: number, label: string): void => {
    if (value < baseline) {
      throw new CampaignPlayTurnServiceError(
        "turn_service_invalid",
        `Campaign Play ${label} timestamp precedes its durable stage boundary.`,
      );
    }
  };

  const artifactReader = (turnId: string): CampaignPlayTurnServiceArtifactReader => ({
    load: (kind) => repository.loadAcceptedModelArtifact(turnId, kind),
  });

  const snapshot = (
    turnId: string,
    telemetry: CampaignPlayStageTelemetry | null = null,
  ): CampaignPlayTurnServiceResult => {
    const observedAt = now();
    const turn = repository.loadTurn(turnId);
    if (!turn) {
      throw new CampaignPlayTurnRepositoryError(
        "turn_not_found",
        "Campaign Play turn was not found.",
      );
    }
    return {
      turn,
      recovery: repository.loadRecoveryState(turnId, observedAt),
      telemetry,
    };
  };

  const interrupt = (
    token: CampaignPlayWorkerLeaseToken,
    attemptStartedAt: number,
    evidence: CampaignPlayExternalInterruptionEvidence,
    queueTimeMs = 0,
    leaseRenewals = 0,
    attemptNumber: number | null = null,
  ): CampaignPlayTurnServiceResult => {
    const interruptedAt = now();
    requireAtOrAfter(interruptedAt, attemptStartedAt, "interruption");
    try {
      if (interruptedAt >= token.expiresAt) {
        repository.interruptExpiredExternal({
          turnId: token.turnId,
          stage: token.stage,
          owner: token.owner,
          observedEpoch: token.epoch,
          observedLeaseExpiresAt: token.expiresAt,
          evidence,
          observedAt: interruptedAt,
          mutationId: mutationId({
            campaignId: input.handle.campaignId,
            turnId: token.turnId,
            stage: token.stage,
            owner: token.owner,
            epoch: token.epoch,
            kind: "interrupt",
            occurredAt: interruptedAt,
            ordinal: 0,
          }),
        });
      } else {
        repository.interruptExternal({
          token,
          evidence,
          interruptedAt,
          mutationId: mutationId({
            campaignId: input.handle.campaignId,
            turnId: token.turnId,
            stage: token.stage,
            owner: token.owner,
            epoch: token.epoch,
            kind: "interrupt",
            occurredAt: interruptedAt,
            ordinal: 0,
          }),
        });
      }
    } catch (error) {
      if (!isFenceRace(error)) throw error;
      return snapshot(token.turnId);
    }
    const turn = repository.loadTurn(token.turnId)!;
    const recovery = repository.loadRecoveryState(token.turnId, interruptedAt);
    const telemetry: CampaignPlayStageTelemetry = {
      turnId: token.turnId,
      stage: token.stage,
      progress: progressForStage(turn, token.stage),
      workerEpoch: token.epoch,
      attempt: recovery.kind === "explicit_resume_required"
        ? recovery.attempt
        : attemptNumber,
      queueTimeMs,
      stageTimeMs: interruptedAt - attemptStartedAt,
      leaseRenewals,
      outcome: "interrupted",
    };
    return snapshot(token.turnId, telemetry);
  };

  const runExternal = async (
    turn: LoadedCampaignPlayTurn,
    initialToken: CampaignPlayWorkerLeaseToken,
    attempt: number,
    attemptStartedAt: number,
    queueTimeMs: number,
    handler: CampaignPlayExternalStageHandler,
  ): Promise<CampaignPlayTurnServiceResult> => {
    let token = initialToken;
    let renewalCount = 0;
    let lastObservedAt = attemptStartedAt;
    const staleResult = (): CampaignPlayTurnServiceResult => {
      const finishedAt = now();
      requireAtOrAfter(finishedAt, attemptStartedAt, "stale completion");
      return snapshot(initialToken.turnId, {
        turnId: initialToken.turnId,
        stage: initialToken.stage,
        progress: progressForStage(turn, initialToken.stage),
        workerEpoch: initialToken.epoch,
        attempt,
        queueTimeMs,
        stageTimeMs: finishedAt - attemptStartedAt,
        leaseRenewals: renewalCount,
        outcome: "stale",
      });
    };
    const configuredExternalOperationDeadlineMs = handler.externalOperationDeadlineMs
      ?? input.externalOperationDeadlineMs;
    const controlTargetAt = turn.turnKind === "player_action"
      ? turn.submittedAt + 115_000
      : null;
    const remainingControlBudgetMs = controlTargetAt === null
      ? null
      : controlTargetAt - attemptStartedAt;
    const externalOperationDeadlineMs = remainingControlBudgetMs === null
      ? configuredExternalOperationDeadlineMs
      : configuredExternalOperationDeadlineMs === undefined
        ? remainingControlBudgetMs
        : Math.min(configuredExternalOperationDeadlineMs, remainingControlBudgetMs);
    const deadlineLimitedByControl = controlTargetAt !== null &&
      (configuredExternalOperationDeadlineMs === undefined ||
        (externalOperationDeadlineMs !== undefined &&
          externalOperationDeadlineMs < configuredExternalOperationDeadlineMs));
    if (
      configuredExternalOperationDeadlineMs !== undefined &&
      !isSafePositiveInteger(configuredExternalOperationDeadlineMs)
    ) {
      throw new CampaignPlayTurnServiceError(
        "turn_service_invalid",
        "Campaign Play external stage handler requires a positive deadline when configured.",
      );
    }
    if (externalOperationDeadlineMs !== undefined && externalOperationDeadlineMs <= 0) {
      return interrupt(
        token,
        attemptStartedAt,
        interruptionEvidence("stage_budget_exceeded", Math.max(0, now() - attemptStartedAt)),
        queueTimeMs,
        renewalCount,
        attempt,
      );
    }
    const controller = new AbortController();
    let heartbeatStopped = false;
    const heartbeat = (async () => {
      while (!heartbeatStopped) {
        try {
          await clock.wait(input.heartbeatIntervalMs, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return;
          throw error;
        }
        if (heartbeatStopped) return;
        const renewedAt = now();
        requireAtOrAfter(renewedAt, lastObservedAt, "heartbeat");
        if (renewedAt >= token.expiresAt) {
          throw new CampaignPlayTurnRepositoryError(
            "turn_fence_lost",
            "Campaign Play external heartbeat reached an expired lease.",
          );
        }
        token = repository.renewLease({
          token,
          renewedAt,
          leaseExpiresAt: leaseExpiry(renewedAt),
          mutationId: mutationId({
            campaignId: input.handle.campaignId,
            turnId: token.turnId,
            stage: token.stage,
            owner: token.owner,
            epoch: token.epoch,
            kind: "renew",
            occurredAt: renewedAt,
            ordinal: renewalCount + 1,
          }),
        });
        lastObservedAt = renewedAt;
        renewalCount += 1;
      }
    })();
    const heartbeatFailure = new Promise<never>((_resolve, reject) => {
      void heartbeat.catch(reject);
    });
    const deadline = externalOperationDeadlineMs === undefined
      ? null
      : clock.wait(externalOperationDeadlineMs, controller.signal)
        .then(() => ({ kind: "deadline" as const }))
        .catch((error) => {
          if (controller.signal.aborted) return { kind: "cancelled" as const };
          throw error;
        });
    const execution = Promise.resolve().then(() => handler.execute({
      turn,
      token: initialToken,
      attempt,
      signal: controller.signal,
    }));
    void execution.catch(() => undefined);

    let race: { kind: "completion"; completion: CampaignPlayExternalStageCompletion }
      | { kind: "deadline" }
      | { kind: "cancelled" };
    try {
      race = await Promise.race([
        execution.then((completion) => ({ kind: "completion" as const, completion })),
        heartbeatFailure,
        ...(deadline === null ? [] : [deadline]),
      ]);
    } catch (error) {
      heartbeatStopped = true;
      controller.abort();
      await heartbeat.catch(() => undefined);
      if (isFenceRace(error)) return staleResult();
      if (error instanceof CampaignPlayTurnServiceError) throw error;
      if (error instanceof CampaignPlayExternalStageInterruption) {
        return interrupt(
          token,
          attemptStartedAt,
          error.evidence,
          queueTimeMs,
          renewalCount,
          attempt,
        );
      }
      throw error;
    }

    if (race.kind === "deadline") {
      heartbeatStopped = true;
      controller.abort();
      await heartbeat.catch(() => undefined);
      return interrupt(
        token,
        attemptStartedAt,
        interruptionEvidence(
          deadlineLimitedByControl ? "stage_budget_exceeded" : "stage_timeout",
          now() - attemptStartedAt,
        ),
        queueTimeMs,
        renewalCount,
        attempt,
      );
    }
    if (race.kind === "cancelled") {
      throw new CampaignPlayTurnServiceError(
        "turn_service_invalid",
        "Campaign Play external deadline was cancelled before the stage settled.",
      );
    }
    const completion = race.completion;

    heartbeatStopped = true;
    controller.abort();
    await heartbeat.catch(() => undefined);
    const completedAt = now();
    requireAtOrAfter(completedAt, lastObservedAt, "external completion");
    try {
      const commitResult: unknown = completion.commit({ token, completedAt });
      if (commitResult !== undefined) {
        throw new CampaignPlayTurnServiceError(
          "turn_service_invalid",
          "Campaign Play external completion must settle SQLite synchronously.",
        );
      }
    } catch (error) {
      if (isFenceRace(error)) return staleResult();
      if (error instanceof CampaignPlayExternalStageInterruption) {
        return interrupt(
          token,
          attemptStartedAt,
          error.evidence,
          queueTimeMs,
          renewalCount,
          attempt,
        );
      }
      throw error;
    }
    const after = repository.loadRecoveryState(initialToken.turnId, completedAt);
    if (recoveryUsesToken(after, token)) {
      throw new CampaignPlayTurnServiceError(
        "turn_stage_stalled",
        "Campaign Play external handler returned without settling its exact lease.",
      );
    }
    const telemetry: CampaignPlayStageTelemetry = {
      turnId: token.turnId,
      stage: token.stage,
      progress: progressForStage(turn, token.stage),
      workerEpoch: token.epoch,
      attempt,
      queueTimeMs,
      stageTimeMs: completedAt - attemptStartedAt,
      leaseRenewals: renewalCount,
      outcome: "advanced",
    };
    return snapshot(token.turnId, telemetry);
  };

  const resolve = (
    turn: LoadedCampaignPlayTurn,
    stage: CampaignPlayClaimableTurnStage,
  ): CampaignPlayTurnStageHandler | null => input.resolveStage({
    turn,
    stage,
    artifacts: artifactReader(turn.turnId),
  });

  const claim = (
    turn: LoadedCampaignPlayTurn,
    stage: CampaignPlayClaimableTurnStage,
    observedEpoch: number,
  ): { token: CampaignPlayWorkerLeaseToken; claimedAt: number } => {
    const claimedAt = now();
    requireAtOrAfter(claimedAt, turn.updatedAt, "claim");
    const token = repository.claimStage({
      turnId: turn.turnId,
      expectedStage: stage,
      observedEpoch,
      owner: input.owner,
      claimedAt,
      leaseExpiresAt: leaseExpiry(claimedAt),
      mutationId: mutationId({
        campaignId: input.handle.campaignId,
        turnId: turn.turnId,
        stage,
        owner: input.owner,
        epoch: observedEpoch + 1,
        kind: "claim",
        occurredAt: claimedAt,
        ordinal: 0,
      }),
    });
    return { token, claimedAt };
  };

  const runClaimedExternal = async (
    turn: LoadedCampaignPlayTurn,
    token: CampaignPlayWorkerLeaseToken,
    queueTimeMs: number,
    handler: CampaignPlayExternalStageHandler,
  ): Promise<CampaignPlayTurnServiceResult> => {
    const recovery = repository.loadRecoveryState(turn.turnId, now());
    if (recovery.kind !== "external_in_flight" || !recoveryUsesToken(recovery, token)) {
      return snapshot(turn.turnId);
    }
    return runExternal(
      turn,
      token,
      recovery.attempt,
      recovery.attemptStartedAt,
      queueTimeMs,
      handler,
    );
  };

  const runDeterministic = async (
    turn: LoadedCampaignPlayTurn,
    initialToken: CampaignPlayWorkerLeaseToken,
    claimedAt: number,
    queueTimeMs: number,
    handler: CampaignPlayDeterministicStageHandler,
  ): Promise<CampaignPlayTurnServiceResult> => {
    const token = { ...initialToken };
    let renewalCount = 0;
    let lastObservedAt = claimedAt;
    const controller = new AbortController();
    let heartbeatStopped = false;
    const heartbeat = (async () => {
      while (!heartbeatStopped) {
        try {
          await clock.wait(input.heartbeatIntervalMs, controller.signal);
        } catch (error) {
          if (controller.signal.aborted) return;
          throw error;
        }
        if (heartbeatStopped) return;
        const renewedAt = now();
        requireAtOrAfter(renewedAt, lastObservedAt, "heartbeat");
        if (renewedAt >= token.expiresAt) {
          throw new CampaignPlayTurnRepositoryError(
            "turn_fence_lost",
            "Campaign Play deterministic heartbeat reached an expired lease.",
          );
        }
        const renewed = repository.renewLease({
          token,
          renewedAt,
          leaseExpiresAt: leaseExpiry(renewedAt),
          mutationId: mutationId({
            campaignId: input.handle.campaignId,
            turnId: token.turnId,
            stage: token.stage,
            owner: token.owner,
            epoch: token.epoch,
            kind: "renew",
            occurredAt: renewedAt,
            ordinal: renewalCount + 1,
          }),
        });
        token.expiresAt = renewed.expiresAt;
        lastObservedAt = renewedAt;
        renewalCount += 1;
      }
    })();
    const heartbeatFailure = new Promise<never>((_resolve, reject) => {
      void heartbeat.catch(reject);
    });
    const execution = Promise.resolve().then(() => handler.execute({
      turn,
      token,
      artifacts: artifactReader(turn.turnId),
      signal: controller.signal,
    }));
    void execution.catch(() => undefined);
    try {
      await Promise.race([execution, heartbeatFailure]);
    } catch (error) {
      heartbeatStopped = true;
      controller.abort();
      await heartbeat.catch(() => undefined);
      if (isFenceRace(error)) return snapshot(initialToken.turnId);
      throw error;
    }
    heartbeatStopped = true;
    controller.abort();
    await heartbeat.catch(() => undefined);
    const finishedAt = now();
    requireAtOrAfter(finishedAt, lastObservedAt, "deterministic completion");
    const after = repository.loadRecoveryState(turn.turnId, finishedAt);
    if (recoveryUsesToken(after, token)) {
      throw new CampaignPlayTurnServiceError(
        "turn_stage_stalled",
        "Campaign Play deterministic handler returned without settling its exact lease.",
      );
    }
    const telemetry: CampaignPlayStageTelemetry = {
      turnId: token.turnId,
      stage: token.stage,
      progress: progressForStage(turn, token.stage),
      workerEpoch: token.epoch,
      attempt: null,
      queueTimeMs,
      stageTimeMs: finishedAt - claimedAt,
      leaseRenewals: renewalCount,
      outcome: "advanced",
    };
    return snapshot(turn.turnId, telemetry);
  };

  const dispatchReady = async (
    recovery: Extract<
      CampaignPlayRecoveryState,
      { kind: "external_ready" | "deterministic_ready" | "deterministic_in_flight" }
    >,
    recoveryMode: boolean,
  ): Promise<CampaignPlayTurnServiceResult> => {
    const turn = repository.loadTurn(recovery.turnId);
    if (!turn) {
      throw new CampaignPlayTurnRepositoryError(
        "turn_not_found",
        "Campaign Play turn was not found.",
      );
    }
    if (recovery.kind === "deterministic_in_flight" && now() < recovery.token.expiresAt) {
      return snapshot(turn.turnId);
    }
    if (recovery.kind === "external_ready" && recoveryMode) return snapshot(turn.turnId);
    const handler = resolve(turn, recovery.kind === "deterministic_in_flight"
      ? recovery.token.stage
      : recovery.stage);
    if (handler === null) {
      if (recoveryMode) return snapshot(turn.turnId);
      throw new CampaignPlayTurnServiceError(
        "turn_handler_missing",
        "Campaign Play turn stage has no registered handler.",
      );
    }
    const stage = recovery.kind === "deterministic_in_flight"
      ? recovery.token.stage
      : recovery.stage;
    if (recovery.kind !== "external_ready") {
      if (handler.kind !== "deterministic") {
        throw new CampaignPlayTurnServiceError(
          "turn_handler_missing",
          "Campaign Play deterministic stage resolved to an external handler.",
        );
      }
      const artifacts = artifactReader(turn.turnId);
      if (!handler.ready({ turn, artifacts })) return snapshot(turn.turnId);
    } else if (handler.kind !== "external") {
      throw new CampaignPlayTurnServiceError(
        "turn_handler_missing",
        "Campaign Play external stage resolved to a deterministic handler.",
      );
    }
    const observedEpoch = recovery.kind === "deterministic_in_flight"
      ? recovery.token.epoch
      : recovery.workerEpoch;
    let claimed: { token: CampaignPlayWorkerLeaseToken; claimedAt: number };
    try {
      claimed = claim(
        turn,
        stage,
        observedEpoch,
      );
    } catch (error) {
      if (isFenceRace(error)) return snapshot(turn.turnId);
      if (
        error instanceof CampaignPlayTurnRepositoryError &&
        error.code === "turn_stage_invalid"
      ) {
        const current = repository.loadTurn(turn.turnId);
        if (
          current !== null &&
          (current.stage !== stage || current.workerEpoch !== observedEpoch)
        ) {
          return snapshot(turn.turnId);
        }
      }
      throw error;
    }
    const queueTimeMs = claimed.claimedAt - turn.updatedAt;
    return handler.kind === "external"
      ? runClaimedExternal(turn, claimed.token, queueTimeMs, handler)
      : runDeterministic(turn, claimed.token, claimed.claimedAt, queueTimeMs, handler);
  };

  const recoverExpiredExternal = (
    recovery: Extract<CampaignPlayRecoveryState, { kind: "external_interruption_required" }>,
  ): CampaignPlayTurnServiceResult => {
    const timing = repository.loadWorkerStageTiming(
      recovery.turnId,
      recovery.token.epoch,
    );
    if (timing.claimedAt !== recovery.attemptStartedAt) {
      throw new CampaignPlayTurnServiceError(
        "turn_service_invalid",
        "Campaign Play external attempt disagrees with its durable claim boundary.",
      );
    }
    return interrupt(
      recovery.token,
      recovery.attemptStartedAt,
      interruptionEvidence("worker_lease_lost", now() - recovery.attemptStartedAt),
      timing.queueTimeMs,
      timing.leaseRenewals,
      recovery.attempt,
    );
  };

  const runNextStage = async (turnId: string): Promise<CampaignPlayTurnServiceResult> => {
    const recovery = repository.loadRecoveryState(turnId, now());
    if (recovery.kind === "external_interruption_required") {
      return recoverExpiredExternal(recovery);
    }
    if (
      recovery.kind === "external_ready" || recovery.kind === "deterministic_ready" ||
      recovery.kind === "deterministic_in_flight"
    ) {
      return dispatchReady(recovery, false);
    }
    return snapshot(turnId);
  };

  return {
    runNextStage,
    async recoverActiveTurn() {
      const active = repository.loadActiveTurn();
      if (!active) return null;
      const recovery = repository.loadRecoveryState(active.turnId, now());
      if (recovery.kind === "external_interruption_required") {
        return recoverExpiredExternal(recovery);
      }
      if (recovery.kind === "deterministic_ready" || recovery.kind === "deterministic_in_flight") {
        return dispatchReady(recovery, true);
      }
      return snapshot(active.turnId);
    },
    async resumeInterruptedStage(resumeInput) {
      const before = repository.loadTurn(resumeInput.turnId);
      if (!before) {
        throw new CampaignPlayTurnRepositoryError(
          "turn_not_found",
          "Campaign Play turn was not found.",
        );
      }
      const handler = resolve(before, resumeInput.interruptedStage);
      if (!handler || handler.kind !== "external") {
        throw new CampaignPlayTurnServiceError(
          "turn_handler_missing",
          "Campaign Play resumed stage has no external handler.",
        );
      }
      const resumedAt = now();
      requireAtOrAfter(resumedAt, before.updatedAt, "resume");
      let token: CampaignPlayWorkerLeaseToken;
      try {
        token = repository.resumeExternal({
          turnId: resumeInput.turnId,
          interruptedStage: resumeInput.interruptedStage,
          observedEpoch: resumeInput.observedEpoch,
          owner: input.owner,
          resumedAt,
          leaseExpiresAt: leaseExpiry(resumedAt),
          mutationId: mutationId({
            campaignId: input.handle.campaignId,
            turnId: resumeInput.turnId,
            stage: resumeInput.interruptedStage,
            owner: input.owner,
            epoch: resumeInput.observedEpoch + 1,
            kind: "resume",
            occurredAt: resumedAt,
            ordinal: 0,
          }),
        });
      } catch (error) {
        if (isFenceRace(error)) return snapshot(resumeInput.turnId);
        throw error;
      }
      const turn = repository.loadTurn(resumeInput.turnId)!;
      return runClaimedExternal(
        turn,
        token,
        resumedAt - before.updatedAt,
        handler,
      );
    },
  };
}
