import type { LanguageModel } from "ai";
import {
  getSafeGenerateObjectTrace,
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import {
  campaignPlayActorPlanSchema,
  type CampaignPlayActorIntent,
  type CampaignPlayActorPlan,
  type CampaignPlayEntityRef,
} from "./contracts.js";
import {
  calculateCampaignPlayActorNextDueTime,
  createCampaignPlayActorScheduler,
  type CampaignPlayActorFrame,
} from "./actor-scheduler.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayActorReplanStageId,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import {
  createCampaignPlayTurnRepository,
  type CampaignPlayWorkerLeaseToken,
} from "./campaign-play-turn-repository.js";
import {
  buildCampaignPlayActorPlanGroundingReviewPrompt,
  buildCampaignPlayActorReplanPrompt,
  campaignPlayActorPlanGroundingReviewSchema,
  campaignPlayActorReplanProposalSchema,
  campaignPlayActorReplanProposalSchemaForFrame,
  type CampaignPlayActorReplanPromptEntity,
  type CampaignPlayActorReplanPromptFrame,
  type CampaignPlayActorReplanProposal,
} from "./actor-replan-prompts.js";

export interface CampaignPlayActorReplanRequest {
  jobId: string;
  token: CampaignPlayWorkerLeaseToken;
  model: LanguageModel;
  temperature: number;
  maxOutputTokens: number;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  maximumTotalTokens: number;
  maximumCostMicros: number;
  signal?: AbortSignal;
  createdAt: number;
  injectFault?: (
    point: "after_provider_return" | "before_acceptance_commit",
  ) => void;
}

export interface InterruptExpiredCampaignPlayActorReplanRequest {
  jobId: string;
  observedWorkerEpoch: number;
  observedTurnWorkerEpoch: number;
  observedTurnOwner: string;
  observedTurnLeaseExpiresAt: number;
  observedAt: number;
}

export type CampaignPlayActorReplanOutcome =
  | { kind: "replanned"; jobId: string; plan: CampaignPlayActorPlan; workerEpoch: number }
  | {
      kind: "deferred";
      jobId: string;
      reason: "replan_invalid";
      errorCode: "model_contract_invalid";
      workerEpoch: number;
    }
  | {
      kind: "interrupted";
      jobId: string;
      errorCode:
        | "model_contract_invalid"
        | "provider_unavailable"
        | "stage_budget_exceeded"
        | "stage_timeout"
        | "persistence_failed"
        | "worker_lease_lost";
      workerEpoch: number;
    };

export interface CampaignPlayActorReplanner {
  replan(request: CampaignPlayActorReplanRequest): Promise<CampaignPlayActorReplanOutcome>;
  interruptExpired(
    request: InterruptExpiredCampaignPlayActorReplanRequest,
  ): { kind: "interrupted"; jobId: string; workerEpoch: number; turnWorkerEpoch: number };
}

interface CampaignPlayActorReplannerDependencies {
  generateObject: typeof safeGenerateObject;
  now: () => number;
}

export class CampaignPlayActorReplannerError extends Error {
  constructor(
    readonly code:
      | "replan_input_invalid"
      | "replan_state_invalid"
      | "replan_epoch_lost"
      | "replan_budget_exceeded"
      | "replan_persistence_failed",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignPlayActorReplannerError";
  }
}

interface ReplanCompilationFrame {
  promptFrame: CampaignPlayActorReplanPromptFrame;
  refsByHandle: Map<string, CampaignPlayEntityRef>;
}

interface ScheduleRow {
  scheduleId: string;
  planId: string;
  nextActAtWorldTimeMinutes: number;
  lastActAtWorldTimeMinutes: number | null;
  cadenceMinutes: number;
  agencyDebt: number;
}

function requireTurnLease(
  handle: CampaignPlayDatabaseHandle,
  token: CampaignPlayWorkerLeaseToken,
  observedAt: number,
): void {
  const owned = handle.sqlite.prepare(`SELECT 1 AS owned FROM campaign_play_turns
    WHERE id = ? AND campaign_id = ? AND stage = 'primary_settled'
      AND worker_lease_owner = ? AND worker_epoch = ?
      AND worker_lease_expires_at = ?`).get(
    token.turnId,
    handle.campaignId,
    token.owner,
    token.epoch,
    token.expiresAt,
  ) as { owned: number } | undefined;
  if (!owned || token.stage !== "primary_settled" || observedAt >= token.expiresAt) {
    throw new CampaignPlayActorReplannerError("replan_epoch_lost");
  }
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}:${hashCampaignPlayProjection(value).slice(0, 32)}`;
}

function estimatedCostMicros(
  inputTokens: number,
  outputTokens: number,
  requested: { pricing: { tokenUnit: number; inputCostMicros: number; outputCostMicros: number } },
): number {
  return Math.ceil(inputTokens * requested.pricing.inputCostMicros / requested.pricing.tokenUnit) +
    Math.ceil(outputTokens * requested.pricing.outputCostMicros / requested.pricing.tokenUnit);
}

function entityHandle(jobId: string, reference: CampaignPlayEntityRef): string {
  return `${reference.kind}:${hashCampaignPlayProjection({ jobId, reference }).slice(0, 20)}`;
}

function refKey(reference: CampaignPlayEntityRef): string {
  return `${reference.kind}\u0000${reference.id}`;
}

function compilationFrame(
  handle: CampaignPlayDatabaseHandle,
  frame: CampaignPlayActorFrame,
): ReplanCompilationFrame {
  if (frame.selection.kind !== "replan_required") {
    throw new CampaignPlayActorReplannerError("replan_state_invalid");
  }
  const refsByHandle = new Map<string, CampaignPlayEntityRef>();
  const handleByRef = new Map<string, string>();
  const bind = (reference: CampaignPlayEntityRef): string => {
    const key = refKey(reference);
    const existing = handleByRef.get(key);
    if (existing) return existing;
    const opaque = entityHandle(frame.jobId, reference);
    handleByRef.set(key, opaque);
    refsByHandle.set(opaque, reference);
    return opaque;
  };
  frame.authorizedRefs.forEach(bind);
  const entities: CampaignPlayActorReplanPromptEntity[] = [];
  entities.push({
    handle: bind({ kind: "actor", id: frame.actorId }),
    kind: "actor",
    name: frame.actor.name,
    summary: frame.actor.summary,
    state: frame.conditions.map((condition) => condition.condition).join(", ") || null,
  });
  const relatedActorIds = new Set(frame.authorizedRefs
    .filter((reference) => reference.kind === "actor" && reference.id !== frame.actorId)
    .map((reference) => reference.id));
  if (relatedActorIds.size > 0) {
    const actors = handle.sqlite.prepare(`SELECT id, name, summary FROM actors
      WHERE campaign_id = ? ORDER BY id`).all(handle.campaignId) as Array<{
      id: string; name: string; summary: string;
    }>;
    for (const actor of actors) if (relatedActorIds.has(actor.id)) entities.push({
      handle: bind({ kind: "actor", id: actor.id }),
      kind: "actor",
      name: actor.name,
      summary: actor.summary,
      state: null,
    });
  }
  for (const goal of frame.goals) entities.push({
    handle: bind({ kind: "goal", id: goal.id }),
    kind: "goal",
    name: goal.objective,
    summary: goal.motivation,
    state: goal.status,
  });
  const locationIds = new Set(frame.authorizedRefs
    .filter((reference) => reference.kind === "location")
    .map((reference) => reference.id));
  for (const route of frame.localRoutes) {
    locationIds.add(route.fromLocationId);
    locationIds.add(route.toLocationId);
  }
  if (locationIds.size > 0) {
    const rows = handle.sqlite.prepare(`SELECT id, name, description FROM locations
      WHERE campaign_id = ? ORDER BY id`).all(handle.campaignId) as Array<{
      id: string; name: string; description: string;
    }>;
    for (const row of rows) if (locationIds.has(row.id)) entities.push({
      handle: bind({ kind: "location", id: row.id }),
      kind: "location",
      name: row.name,
      summary: row.description,
      state: frame.placements.some((placement) => placement.locationId === row.id) ? "occupied" : null,
    });
  }
  for (const route of frame.localRoutes) entities.push({
    handle: bind({ kind: "route", id: route.id }),
    kind: "route",
    name: `Route from ${bind({ kind: "location", id: route.fromLocationId })} to ${bind({ kind: "location", id: route.toLocationId })}`,
    summary: `Travel cost ${route.travelCost}`,
    state: route.state,
  });
  for (const relation of frame.relations) entities.push({
    handle: bind({ kind: "relation", id: relation.id }),
    kind: "relation",
    name: `${bind({ kind: "actor", id: relation.sourceActorId })} ${relation.relationType} ${bind({ kind: "actor", id: relation.targetActorId })}`,
    summary: relation.summary,
    state: `intensity ${relation.intensity}`,
  });
  for (const pressure of frame.knownPressures) entities.push({
    handle: bind({ kind: "pressure", id: pressure.id }),
    kind: "pressure",
    name: pressure.name,
    summary: pressure.trajectory,
    state: `${pressure.status}, progress ${pressure.progress}`,
  });
  for (const known of frame.knownEvents) entities.push({
    handle: bind({ kind: "world_event", id: known.eventId }),
    kind: "world_event",
    name: known.event.kind,
    summary: known.summary ?? `Known ${known.event.kind}`,
    state: `occurred at world time ${known.event.worldTimeMinutes}; learned at world time ${known.learnedAtWorldTimeMinutes}`,
  });
  const toPromptIntent = (intent: CampaignPlayActorIntent) => ({
    kind: intent.kind,
    targetHandles: intent.targets.map(bind),
    method: intent.method,
    stakes: intent.stakes,
  });
  const settledStepCount = (handle.sqlite.prepare(`SELECT count(*) AS count
    FROM campaign_play_actor_jobs WHERE campaign_id = ? AND actor_id = ?
      AND plan_id = ? AND stage = 'settled'`).get(
    handle.campaignId,
    frame.actorId,
    frame.plan.planId,
  ) as { count: number }).count;
  return {
    refsByHandle,
    promptFrame: {
      actorHandle: bind({ kind: "actor", id: frame.actorId }),
      worldTimeMinutes: frame.worldTimeMinutes,
      reason: frame.selection.reason,
      failedPreconditionIndexes: [...frame.selection.failedPreconditionIndexes],
      priorPlan: {
        goalHandle: bind({ kind: "goal", id: frame.plan.goalId }),
        intent: toPromptIntent(frame.plan.intent),
        completedStepCount: settledStepCount,
        stepCount: frame.plan.steps.length,
      },
      entities,
    },
  };
}

function compilePlan(
  handle: CampaignPlayDatabaseHandle,
  frame: CampaignPlayActorFrame,
  compilation: ReplanCompilationFrame,
  proposal: CampaignPlayActorReplanProposal,
): CampaignPlayActorPlan {
  const goalRef = compilation.refsByHandle.get(proposal.goalHandle);
  const goal = goalRef?.kind === "goal"
    ? frame.goals.find((candidate) => candidate.id === goalRef.id && candidate.status === "active")
    : undefined;
  if (!goal) throw new CampaignPlayActorReplannerError("replan_state_invalid");
  const actorName = frame.actor.name.toLowerCase();
  const operative = frame.placements.find((placement) =>
    placement.placementKind === "present");
  const resolveIntent = (
    intent: CampaignPlayActorReplanProposal["intent"],
    originLocationId: string | null,
    enforceStepLocation = true,
  ): { intent: CampaignPlayActorIntent; destinationLocationId: string | null } => {
    const targets = intent.targetHandles.map((targetHandle) => {
      const reference = compilation.refsByHandle.get(targetHandle);
      if (!reference) throw new CampaignPlayActorReplannerError("replan_state_invalid");
      return { ...reference };
    });
    let destinationLocationId: string | null = originLocationId;
    if (intent.kind === "move") {
      const routeTargets = targets.filter((target) => target.kind === "route");
      const locationTargets = targets.filter((target) => target.kind === "location");
      const route = routeTargets.length === 1
        ? frame.localRoutes.find((candidate) => candidate.id === routeTargets[0]!.id)
        : undefined;
      if (
        originLocationId === null || !route || route.state !== "open" ||
        route.fromLocationId !== originLocationId || locationTargets.length > 1 ||
        (locationTargets[0] !== undefined && locationTargets[0].id !== route.toLocationId)
      ) {
        throw new CampaignPlayActorReplannerError("replan_state_invalid");
      }
      destinationLocationId = route.toLocationId;
    } else if (
      enforceStepLocation &&
      targets.some((target) => target.kind === "location" && target.id !== originLocationId)
    ) {
      throw new CampaignPlayActorReplannerError("replan_state_invalid");
    }
    return {
      intent: {
        kind: intent.kind,
        targets,
        method: intent.method,
        stakes: intent.stakes,
      },
      destinationLocationId,
    };
  };
  const version = (handle.sqlite.prepare(`SELECT COALESCE(MAX(plan_version), 0) + 1 AS version
    FROM campaign_play_actor_plans WHERE actor_id = ?`).get(frame.actorId) as { version: number }).version;
  const planId = stableId("actor-plan", {
    actorId: frame.actorId,
    version,
    jobId: frame.jobId,
    proposal,
  });
  const preconditions: CampaignPlayActorPlan["preconditions"] = [
    { kind: "goal_status", goalId: goal.id, status: "active" },
    { kind: "actor_condition", actorId: frame.actorId, condition: "incapacitated", present: false },
  ];
  if (operative) preconditions.push({
    kind: "actor_at_location",
    actorId: frame.actorId,
    locationId: operative.locationId,
  });
  const planIntent = resolveIntent(
    proposal.intent,
    operative?.locationId ?? null,
    false,
  ).intent;
  let stepLocationId = operative?.locationId ?? null;
  const steps = proposal.steps.map((step, order) => {
    const resolved = resolveIntent(step.intent, stepLocationId);
    stepLocationId = resolved.destinationLocationId;
    return {
      stepId: stableId("actor-step", { planId, order }),
      order,
      intent: resolved.intent,
      observableTrace: (() => {
        if (step.observableTrace.toLowerCase().includes(actorName)) {
          throw new CampaignPlayActorReplannerError("replan_state_invalid");
        }
        return step.observableTrace;
      })(),
      possessionOutcome: structuredClone(step.possessionOutcome),
      elapsedBounds: { ...step.elapsedBounds },
    };
  });
  return campaignPlayActorPlanSchema.parse({
    planId,
    campaignId: frame.campaignId,
    actorId: frame.actorId,
    goalId: goal.id,
    planVersion: version,
    intent: planIntent,
    preconditions,
    cadenceMinutes: proposal.cadenceMinutes,
    priority: proposal.priority,
    steps,
    status: "active",
  });
}

function acceptedTrace(trace: Readonly<SafeGenerateTrace>, providerId: string, modelName: string): {
  actualProviderId: string;
  actualModel: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  finishReason: string;
} {
  const primary = trace.primaryStrategy ?? trace.capability?.primaryStrategy;
  const actual = trace.strategy ?? trace.capability?.actualMode;
  const provider = trace.capability?.providerId;
  const model = trace.response?.modelId ?? trace.capability?.model;
  const strategies = new Set(["native_schema", "native_json", "tool_mode"]);
  const requestedContractAccepted = trace.requestedMode === "auto"
    || ((trace.requestedMode === "tool" || trace.requestedMode === "tool_mode")
      && primary === "tool_mode");
  if (!requestedContractAccepted || !primary || !strategies.has(primary)
    || actual !== primary || trace.repair !== undefined || trace.strategy === "repair"
    || trace.strategy === "full_retry" || trace.strategy === "text_fallback"
    || provider !== providerId || model !== modelName
    || trace.usage?.inputTokens === undefined || trace.usage.outputTokens === undefined
    || !trace.finishReason) {
    throw new CampaignPlayActorReplannerError("replan_state_invalid");
  }
  return {
    actualProviderId: provider,
    actualModel: model,
    inputTokens: trace.usage.inputTokens,
    outputTokens: trace.usage.outputTokens,
    reasoningTokens: Number.isSafeInteger(trace.usage.reasoningTokens)
      && (trace.usage.reasoningTokens ?? 0) > 0
      ? trace.usage.reasoningTokens!
      : 0,
    finishReason: trace.finishReason,
  };
}

function combineAcceptedEvidence(
  proposer: ReturnType<typeof acceptedTrace>,
  reviewer: ReturnType<typeof acceptedTrace>,
): ReturnType<typeof acceptedTrace> {
  if (
    proposer.actualProviderId !== reviewer.actualProviderId ||
    proposer.actualModel !== reviewer.actualModel
  ) {
    throw new CampaignPlayActorReplannerError("replan_state_invalid");
  }
  return {
    actualProviderId: proposer.actualProviderId,
    actualModel: proposer.actualModel,
    inputTokens: proposer.inputTokens + reviewer.inputTokens,
    outputTokens: proposer.outputTokens + reviewer.outputTokens,
    reasoningTokens: proposer.reasoningTokens + reviewer.reasoningTokens,
    finishReason: reviewer.finishReason,
  };
}

function evidenceExceedsBudget(
  evidence: ReturnType<typeof acceptedTrace>,
  request: Pick<CampaignPlayActorReplanRequest,
    | "maximumInputTokens"
    | "maximumOutputTokens"
    | "maximumTotalTokens"
    | "maximumCostMicros">,
  requestedModel: {
    pricing: {
      tokenUnit: number;
      inputCostMicros: number;
      outputCostMicros: number;
    };
  },
): boolean {
  const contentOutputTokens = Math.max(
    0,
    evidence.outputTokens - evidence.reasoningTokens,
  );
  return evidence.inputTokens > request.maximumInputTokens ||
    contentOutputTokens > request.maximumOutputTokens ||
    evidence.inputTokens + contentOutputTokens > request.maximumTotalTokens ||
    estimatedCostMicros(evidence.inputTokens, evidence.outputTokens, requestedModel) >
      request.maximumCostMicros;
}

export function createCampaignPlayActorReplanner(
  handle: CampaignPlayDatabaseHandle,
  overrides: Partial<CampaignPlayActorReplannerDependencies> = {},
): CampaignPlayActorReplanner {
  const dependencies = { generateObject: safeGenerateObject, now: Date.now, ...overrides };
  const scheduler = createCampaignPlayActorScheduler(handle);
  const turnRepository = createCampaignPlayTurnRepository(handle);

  return {
    interruptExpired(request) {
      if (!request.jobId.trim() || !request.observedTurnOwner.trim()
        || !Number.isSafeInteger(request.observedWorkerEpoch) || request.observedWorkerEpoch < 1
        || !Number.isSafeInteger(request.observedTurnWorkerEpoch) || request.observedTurnWorkerEpoch < 1
        || !Number.isSafeInteger(request.observedTurnLeaseExpiresAt) || request.observedTurnLeaseExpiresAt < 0
        || !Number.isSafeInteger(request.observedAt)
        || request.observedAt < request.observedTurnLeaseExpiresAt) {
        throw new CampaignPlayActorReplannerError("replan_input_invalid");
      }
      const job = handle.sqlite.prepare(`SELECT turn_id AS turnId
        FROM campaign_play_actor_jobs
        WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
          AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).get(
        request.jobId,
        handle.campaignId,
        request.observedWorkerEpoch,
        request.observedTurnWorkerEpoch,
      ) as { turnId: string } | undefined;
      if (!job) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
      const turn = handle.sqlite.prepare(`SELECT 1 AS owned FROM campaign_play_turns
        WHERE id = ? AND campaign_id = ? AND stage = 'primary_settled'
          AND worker_lease_owner = ? AND worker_epoch = ?
          AND worker_lease_expires_at = ?`).get(
        job.turnId,
        handle.campaignId,
        request.observedTurnOwner,
        request.observedTurnWorkerEpoch,
        request.observedTurnLeaseExpiresAt,
      ) as { owned: number } | undefined;
      if (!turn) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
      const stageId = deriveCampaignPlayActorReplanStageId(request.jobId);
      const started = handle.sqlite.prepare(`SELECT created_at AS createdAt
        FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
          AND kind = 'actor_replanner' AND worker_epoch = ? AND status = 'started'`).get(
        handle.campaignId,
        job.turnId,
        stageId,
        request.observedWorkerEpoch,
      ) as { createdAt: number } | undefined;
      if (!started) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
      turnRepository.commitActorTransition({
        token: {
          turnId: job.turnId,
          owner: request.observedTurnOwner,
          epoch: request.observedTurnWorkerEpoch,
          expiresAt: request.observedTurnLeaseExpiresAt,
          stage: "primary_settled",
        },
        leaseMode: "expired",
        publicInterruption: true,
        worldVersionAdvance: 0,
        mutationId: stableId("actor-job-event", {
          jobId: request.jobId,
          stage: "replan_interrupted",
          workerEpoch: request.observedWorkerEpoch,
        }),
        protectedPayloadHash: hashCampaignPlayProjection({
          jobId: request.jobId,
          workerEpoch: request.observedWorkerEpoch,
          errorCode: "worker_lease_lost",
        }),
        committedAt: request.observedAt,
        mutate(context) {
          const model = context.sqlite.prepare(`UPDATE campaign_play_model_stages SET
            status = 'interrupted', duration_ms = ?, schema_outcome = 'transport_error',
            error_code = 'worker_lease_lost', completed_at = ?
            WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
              AND kind = 'actor_replanner' AND worker_epoch = ? AND status = 'started'`).run(
            Math.max(0, request.observedAt - started.createdAt),
            request.observedAt,
            context.campaignId,
            job.turnId,
            stageId,
            request.observedWorkerEpoch,
          );
          const actorJob = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
            SET stage = 'interrupted'
            WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
              AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).run(
            request.jobId,
            context.campaignId,
            request.observedWorkerEpoch,
            request.observedTurnWorkerEpoch,
          );
          if (model.changes !== 1 || actorJob.changes !== 1) {
            throw new CampaignPlayActorReplannerError("replan_epoch_lost");
          }
        },
      });
      return {
        kind: "interrupted",
        jobId: request.jobId,
        workerEpoch: request.observedWorkerEpoch,
        turnWorkerEpoch: request.observedTurnWorkerEpoch,
      };
    },

    async replan(request) {
      if (!request.jobId.trim() || !Number.isSafeInteger(request.createdAt) || request.createdAt < 0
        || !Number.isSafeInteger(request.maxOutputTokens) || request.maxOutputTokens < 1
        || !Number.isSafeInteger(request.maximumInputTokens) || request.maximumInputTokens < 1
        || !Number.isSafeInteger(request.maximumOutputTokens) || request.maximumOutputTokens < 1
        || !Number.isSafeInteger(request.maximumTotalTokens) || request.maximumTotalTokens < 1
        || !Number.isSafeInteger(request.maximumCostMicros) || request.maximumCostMicros < 0) {
        throw new CampaignPlayActorReplannerError("replan_input_invalid");
      }
      const frame = scheduler.buildActorFrame(request.jobId);
      if (request.token.turnId !== frame.turnId) {
        throw new CampaignPlayActorReplannerError("replan_input_invalid");
      }
      const turn = turnRepository.loadTurn(frame.turnId);
      if (!turn || turn.modelSelection.turnKind !== "player_action") {
        throw new CampaignPlayActorReplannerError("replan_state_invalid");
      }
      const requestedModel = turn.modelSelection.actorReplanner;
      requireTurnLease(handle, request.token, request.createdAt);
      if (frame.selection.kind !== "replan_required") {
        throw new CampaignPlayActorReplannerError("replan_state_invalid");
      }
      const job = handle.sqlite.prepare(`SELECT worker_epoch AS workerEpoch,
        claim_turn_worker_epoch AS claimTurnWorkerEpoch, stage
        FROM campaign_play_actor_jobs WHERE job_id = ? AND campaign_id = ?`).get(
        request.jobId,
        handle.campaignId,
      ) as { workerEpoch: number; claimTurnWorkerEpoch: number | null; stage: string } | undefined;
      if (!job || (job.stage !== "queued" && job.stage !== "interrupted")) {
        throw new CampaignPlayActorReplannerError("replan_state_invalid");
      }
      if (job.stage === "interrupted" && job.claimTurnWorkerEpoch === request.token.epoch) {
        throw new CampaignPlayActorReplannerError("replan_epoch_lost");
      }
      const compilation = compilationFrame(handle, frame);
      const proposalSchema = campaignPlayActorReplanProposalSchemaForFrame(
        compilation.promptFrame,
      );
      if (!proposalSchema) {
        throw new CampaignPlayActorReplannerError("replan_state_invalid");
      }
      const workerEpoch = job.workerEpoch + 1;
      const stageId = deriveCampaignPlayActorReplanStageId(request.jobId);
      const attempt = (handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_model_stages WHERE campaign_id = ? AND stage_id = ?`).get(
        handle.campaignId,
        stageId,
      ) as { count: number }).count + 1;
      turnRepository.commitActorTransition({
        token: request.token,
        leaseMode: "live",
        worldVersionAdvance: 0,
        mutationId: stableId("actor-job-event", { jobId: request.jobId, stage: "replan_claimed", workerEpoch }),
        protectedPayloadHash: hashCampaignPlayProjection({ stageId, workerEpoch }),
        committedAt: request.createdAt,
        mutate(context) {
          const claimed = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
            SET stage = 'claimed', worker_epoch = ?, claim_turn_worker_epoch = ?
            WHERE job_id = ? AND campaign_id = ? AND stage = ? AND worker_epoch = ?`).run(
            workerEpoch, request.token.epoch, request.jobId, context.campaignId,
            job.stage, job.workerEpoch,
          );
          if (claimed.changes !== 1) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
          context.sqlite.prepare(`INSERT INTO campaign_play_model_stages (
            id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
            requested_provider_id, requested_model, requested_strategy,
            actual_provider_id, actual_model, actual_strategy, input_tokens, output_tokens,
            duration_ms, finish_reason, schema_outcome, artifact_json, artifact_hash,
            error_code, created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, 'actor_replanner', 'started', ?, ?, ?, 'strict_object',
            NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, NULL, ?, NULL)`).run(
            stableId("model-stage-row", { stageId, workerEpoch }),
            stageId,
            attempt,
            context.campaignId,
            frame.turnId,
            workerEpoch,
            requestedModel.providerId,
            requestedModel.model,
            request.createdAt,
          );
        },
      });
      const startedAt = dependencies.now();
      requireTurnLease(handle, request.token, startedAt);
      let observedTrace: Readonly<SafeGenerateTrace> | undefined;
      let stageEvidence: ReturnType<typeof acceptedTrace> | undefined;
      let processStoppedAfterProviderReturn = false;
      try {
        const generated = await dependencies.generateObject({
          model: request.model,
          schema: proposalSchema,
          prompt: buildCampaignPlayActorReplanPrompt(compilation.promptFrame),
          temperature: request.temperature,
          maxOutputTokens: request.maxOutputTokens,
          mode: "auto",
          strictSchema: true,
          allowRepair: false,
          allowTextFallback: false,
          retries: 1,
          abortSignal: request.signal,
        });
        observedTrace = generated.trace;
        try {
          request.injectFault?.("after_provider_return");
        } catch (cause) {
          processStoppedAfterProviderReturn = true;
          throw cause;
        }
        const proposerCompletedAt = dependencies.now();
        if (proposerCompletedAt >= request.token.expiresAt) {
          throw new CampaignPlayActorReplannerError("replan_epoch_lost");
        }
        const proposerEvidence = acceptedTrace(
          generated.trace,
          requestedModel.providerId,
          requestedModel.model,
        );
        stageEvidence = proposerEvidence;
        if (evidenceExceedsBudget(proposerEvidence, request, requestedModel)) {
          throw new CampaignPlayActorReplannerError("replan_budget_exceeded");
        }
        const proposal = campaignPlayActorReplanProposalSchema.parse(generated.object);
        const latestFrame = scheduler.buildActorFrame(request.jobId);
        const plan = compilePlan(handle, latestFrame, compilation, proposal);
        stageEvidence = undefined;
        const reviewed = await dependencies.generateObject({
          model: request.model,
          schema: campaignPlayActorPlanGroundingReviewSchema,
          prompt: buildCampaignPlayActorPlanGroundingReviewPrompt(
            compilation.promptFrame,
            proposal,
          ),
          temperature: 0,
          maxOutputTokens: request.maxOutputTokens,
          mode: "tool",
          strictSchema: true,
          allowRepair: false,
          allowTextFallback: false,
          retries: 1,
          abortSignal: request.signal,
        });
        observedTrace = reviewed.trace;
        const reviewerCompletedAt = dependencies.now();
        if (reviewerCompletedAt >= request.token.expiresAt) {
          throw new CampaignPlayActorReplannerError("replan_epoch_lost");
        }
        const reviewerEvidence = acceptedTrace(
          reviewed.trace,
          requestedModel.providerId,
          requestedModel.model,
        );
        const evidence = combineAcceptedEvidence(proposerEvidence, reviewerEvidence);
        stageEvidence = evidence;
        if (evidenceExceedsBudget(evidence, request, requestedModel)) {
          throw new CampaignPlayActorReplannerError("replan_budget_exceeded");
        }
        if (reviewed.object.verdict !== "accepted") {
          throw new CampaignPlayActorReplannerError("replan_state_invalid");
        }
        const artifactJson = canonicalizeCampaignPlayProjection(plan);
        const artifactHash = hashCampaignPlayProjection({
          domain: "campaign_play_model_artifact",
          stageId,
          kind: "actor_replanner",
          artifact: plan,
        });
        const durationMs = Math.max(0, reviewerCompletedAt - startedAt);
        const schedule = handle.sqlite.prepare(`SELECT schedule_id AS scheduleId,
          next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
          last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes, agency_debt AS agencyDebt
          FROM campaign_play_actor_schedules WHERE campaign_id = ? AND actor_id = ?`).get(
          handle.campaignId,
          frame.actorId,
        ) as ScheduleRow | undefined;
        if (!schedule) throw new CampaignPlayActorReplannerError("replan_state_invalid");
        try {
          request.injectFault?.("before_acceptance_commit");
        } catch (cause) {
          throw new CampaignPlayActorReplannerError("replan_persistence_failed", { cause });
        }
        const acceptedAt = dependencies.now();
        requireTurnLease(handle, request.token, acceptedAt);
        const stillOwned = handle.sqlite.prepare(`SELECT 1 AS found FROM campaign_play_actor_jobs
          WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
            AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).get(
          request.jobId,
          handle.campaignId,
          workerEpoch,
          request.token.epoch,
        );
        if (!stillOwned) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
        try {
          turnRepository.commitActorTransition({
            token: request.token,
            leaseMode: "live",
            worldVersionAdvance: 0,
            mutationId: stableId("actor-job-event", { jobId: request.jobId, stage: "replanned", workerEpoch }),
            protectedPayloadHash: hashCampaignPlayProjection({ artifactHash, actorWorkerEpoch: workerEpoch }),
            committedAt: acceptedAt,
            mutate(context) {
            const fenced = context.sqlite.prepare(`SELECT 1 AS found FROM campaign_play_actor_jobs j
              JOIN campaign_play_model_stages m ON m.stage_id = ? AND m.worker_epoch = ?
                AND m.status = 'started' AND m.kind = 'actor_replanner'
              WHERE j.job_id = ? AND j.campaign_id = ? AND j.stage = 'claimed'
                AND j.worker_epoch = ? AND j.claim_turn_worker_epoch = ?
                AND EXISTS (
                  SELECT 1 FROM campaign_play_turns t
                  WHERE t.id = j.turn_id AND t.campaign_id = j.campaign_id
                    AND t.stage = 'primary_settled' AND t.worker_lease_owner = ?
                    AND t.worker_epoch = ? AND t.worker_lease_expires_at = ?
                )`).get(
              stageId, workerEpoch, request.jobId, context.campaignId, workerEpoch,
              request.token.epoch, request.token.owner, request.token.epoch,
              request.token.expiresAt,
            );
            if (!fenced) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
            if (latestFrame.plan.status === "active") {
              const priorPlan = context.sqlite.prepare(`UPDATE campaign_play_actor_plans SET status = ?, updated_at = ?
                WHERE plan_id = ? AND campaign_id = ? AND status = 'active'`).run(
                latestFrame.selection.kind === "replan_required"
                  && latestFrame.selection.reason === "precondition_failed" ? "blocked" : "completed",
                acceptedAt,
                latestFrame.plan.planId,
                context.campaignId,
              );
              if (priorPlan.changes !== 1) {
                throw new CampaignPlayActorReplannerError("replan_epoch_lost");
              }
            }
            context.sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
              plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
              preconditions_json, cadence_minutes, priority, steps_json, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`).run(
              plan.planId, context.campaignId, plan.actorId, plan.goalId, plan.planVersion,
              canonicalizeCampaignPlayProjection(plan.intent),
              canonicalizeCampaignPlayProjection(plan.preconditions),
              plan.cadenceMinutes, plan.priority,
              canonicalizeCampaignPlayProjection(plan.steps),
              acceptedAt, acceptedAt,
            );
            const scheduleUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_schedules SET plan_id = ?,
              priority = ?, updated_at = ?
              WHERE schedule_id = ? AND campaign_id = ? AND actor_id = ?`).run(
              plan.planId,
              plan.priority,
              acceptedAt,
              schedule.scheduleId,
              context.campaignId,
              frame.actorId,
            );
            const modelUpdate = context.sqlite.prepare(`UPDATE campaign_play_model_stages SET status = 'accepted',
              actual_provider_id = ?, actual_model = ?, actual_strategy = 'strict_object',
              input_tokens = ?, output_tokens = ?, duration_ms = ?, finish_reason = ?,
              schema_outcome = 'valid', artifact_json = ?, artifact_hash = ?, completed_at = ?
              WHERE stage_id = ? AND worker_epoch = ? AND status = 'started'`).run(
              evidence.actualProviderId, evidence.actualModel, evidence.inputTokens,
              evidence.outputTokens, durationMs, evidence.finishReason,
              artifactJson, artifactHash, acceptedAt, stageId, workerEpoch,
            );
            const jobUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs SET plan_id = ?
              WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
                AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).run(
              plan.planId, request.jobId, context.campaignId,
              workerEpoch, request.token.epoch,
            );
            if (scheduleUpdate.changes !== 1 || modelUpdate.changes !== 1 || jobUpdate.changes !== 1) {
              throw new CampaignPlayActorReplannerError("replan_epoch_lost");
            }
            },
          });
        } catch (cause) {
          if (cause instanceof CampaignPlayActorReplannerError
            && cause.code === "replan_epoch_lost") {
            throw cause;
          }
          throw new CampaignPlayActorReplannerError("replan_persistence_failed", { cause });
        }
        return { kind: "replanned", jobId: request.jobId, plan, workerEpoch };
      } catch (error) {
        if (processStoppedAfterProviderReturn) throw error;
        const interruptedAt = dependencies.now();
        const durationMs = Math.max(0, interruptedAt - startedAt);
        const trace = getSafeGenerateObjectTrace(error) ?? observedTrace ?? undefined;
        const epochLost = (error instanceof CampaignPlayActorReplannerError
          && error.code === "replan_epoch_lost") || request.signal?.aborted === true;
        const budgetExceeded = error instanceof CampaignPlayActorReplannerError
          && error.code === "replan_budget_exceeded";
        const persistenceFailed = error instanceof CampaignPlayActorReplannerError
          && error.code === "replan_persistence_failed";
        const errorCode = epochLost ? "worker_lease_lost" as const
          : budgetExceeded ? "stage_budget_exceeded" as const
          : persistenceFailed ? "persistence_failed" as const
          : trace === undefined ? "provider_unavailable" as const
          : "model_contract_invalid" as const;
        const schemaOutcome = errorCode === "model_contract_invalid" || errorCode === "stage_budget_exceeded"
          ? "invalid" as const
          : "transport_error" as const;
        const rejectedSchedule = errorCode === "model_contract_invalid"
          ? (() => {
              const row = handle.sqlite.prepare(`SELECT s.schedule_id AS scheduleId,
                s.plan_id AS planId,
                s.next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
                s.last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes,
                s.agency_debt AS agencyDebt, p.cadence_minutes AS cadenceMinutes
                FROM campaign_play_actor_schedules s
                JOIN campaign_play_actor_plans p
                  ON p.campaign_id = s.campaign_id AND p.plan_id = s.plan_id
                WHERE s.campaign_id = ? AND s.actor_id = ?`).get(
                  handle.campaignId,
                  frame.actorId,
                ) as ScheduleRow | undefined;
              if (!row || row.planId !== frame.plan.planId) return null;
              return {
                row,
                transition: calculateCampaignPlayActorNextDueTime({
                  settledWorldTimeMinutes: frame.worldTimeMinutes,
                  cadenceMinutes: row.cadenceMinutes,
                  lastActAtWorldTimeMinutes: row.lastActAtWorldTimeMinutes,
                  agencyDebt: row.agencyDebt,
                  outcome: "deferred",
                }),
              };
            })()
          : null;
        const deferInvalidReplan = rejectedSchedule !== null;
        try {
          requireTurnLease(handle, request.token, interruptedAt);
        } catch {
          return { kind: "interrupted", jobId: request.jobId, errorCode: "worker_lease_lost", workerEpoch };
        }
        turnRepository.commitActorTransition({
          token: request.token,
          leaseMode: "live",
          publicInterruption: !deferInvalidReplan,
          worldVersionAdvance: 0,
          mutationId: stableId("actor-job-event", {
            jobId: request.jobId,
            stage: deferInvalidReplan ? "replan_deferred" : "replan_interrupted",
            workerEpoch,
          }),
          protectedPayloadHash: hashCampaignPlayProjection({
            errorCode,
            actorWorkerEpoch: workerEpoch,
            outcome: deferInvalidReplan ? "deferred" : "interrupted",
          }),
          committedAt: interruptedAt,
          mutate(context) {
            const stage = context.sqlite.prepare(`SELECT status FROM campaign_play_model_stages
              WHERE stage_id = ? AND worker_epoch = ?`).get(stageId, workerEpoch) as { status: string } | undefined;
            if (stage?.status !== "started") throw new CampaignPlayActorReplannerError("replan_epoch_lost");
            const hasActual = stageEvidence !== undefined || (
              !!trace?.capability?.providerId &&
              !!(trace.response?.modelId ?? trace.capability.model)
            );
            const modelUpdate = context.sqlite.prepare(`UPDATE campaign_play_model_stages SET status = 'interrupted',
              actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
              input_tokens = ?, output_tokens = ?, finish_reason = ?,
              duration_ms = ?, schema_outcome = ?, error_code = ?,
              completed_at = ? WHERE stage_id = ? AND worker_epoch = ? AND status = 'started'`).run(
              stageEvidence?.actualProviderId ?? (hasActual ? trace!.capability!.providerId : null),
              stageEvidence?.actualModel ?? (hasActual ? (trace!.response?.modelId ?? trace!.capability!.model) : null),
              hasActual ? "strict_object" : null,
              stageEvidence?.inputTokens ?? trace?.usage?.inputTokens ?? null,
              stageEvidence?.outputTokens ?? trace?.usage?.outputTokens ?? null,
              stageEvidence?.finishReason ?? trace?.finishReason ?? null,
              durationMs,
              schemaOutcome,
              errorCode,
              interruptedAt,
              stageId,
              workerEpoch,
            );
            let terminalChanges: number;
            if (deferInvalidReplan) {
              const terminal = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
                SET stage = 'deferred', defer_reason = 'replan_invalid', completed_at = ?
                WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
                  AND proposal_id IS NULL AND worker_epoch = ?
                  AND claim_turn_worker_epoch = ?`).run(
                  interruptedAt,
                  request.jobId,
                  context.campaignId,
                  workerEpoch,
                  request.token.epoch,
                );
              terminalChanges = terminal.changes;
              const scheduleUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_schedules SET
                next_act_at_world_time_minutes = ?, last_act_at_world_time_minutes = ?,
                agency_debt = ?, updated_at = ?
                WHERE schedule_id = ? AND campaign_id = ? AND actor_id = ? AND plan_id = ?`).run(
                  rejectedSchedule.transition.nextActAtWorldTimeMinutes,
                  rejectedSchedule.transition.lastActAtWorldTimeMinutes,
                  rejectedSchedule.transition.agencyDebt,
                  interruptedAt,
                  rejectedSchedule.row.scheduleId,
                  context.campaignId,
                  frame.actorId,
                  rejectedSchedule.row.planId,
                );
              if (scheduleUpdate.changes !== 1) {
                throw new CampaignPlayActorReplannerError("replan_state_invalid");
              }
            } else {
              terminalChanges = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
                SET stage = 'interrupted'
                WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
                  AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).run(
                  request.jobId,
                  context.campaignId,
                  workerEpoch,
                  request.token.epoch,
                ).changes;
            }
            if (modelUpdate.changes !== 1 || terminalChanges !== 1) {
              throw new CampaignPlayActorReplannerError("replan_epoch_lost");
            }
          },
        });
        return deferInvalidReplan
          ? {
              kind: "deferred",
              jobId: request.jobId,
              reason: "replan_invalid",
              errorCode: "model_contract_invalid",
              workerEpoch,
            }
          : { kind: "interrupted", jobId: request.jobId, errorCode, workerEpoch };
      }
    },
  };
}
