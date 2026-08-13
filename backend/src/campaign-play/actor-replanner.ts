import type { LanguageModel } from "ai";
import type { ZodType } from "zod";
import {
  getSafeGenerateObjectErrorCode,
  getSafeGenerateObjectTrace,
  isSafeGenerateObjectContractErrorCode,
  safeGenerateObject,
  type SafeGenerateErrorCode,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import { createLogger } from "../lib/index.js";
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
  buildCampaignPlayActorReplanGenerationRecoveryPrompt,
  buildCampaignPlayActorReplanRecoveryPrompt,
  buildCampaignPlayActorReplanPrompt,
  campaignPlayActorPlanGroundingReviewSchema,
  campaignPlayActorReplanProposalSchema,
  campaignPlayActorReplanGenerationRecoveryProposalSchemaForFrame,
  campaignPlayActorReplanProposalSchemaForFrame,
  type CampaignPlayActorReplanRecoveryFeedback,
  type CampaignPlayActorReplanPromptEntity,
  type CampaignPlayActorReplanPromptFrame,
  type CampaignPlayActorReplanProposal,
} from "./actor-replan-prompts.js";

const log = createLogger("campaign-play-actor-replanner");

export interface CampaignPlayActorReplanRequest {
  jobId: string;
  token: CampaignPlayWorkerLeaseToken;
  model: LanguageModel;
  recoveryModel?: LanguageModel;
  temperature: number;
  maxOutputTokens: number;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  maximumTotalTokens: number;
  maximumCostMicros: number;
  externalOperationDeadlineMs: number;
  /** Absolute internal completion target for this optional stage. */
  controlDeadlineAt?: number;
  /** When the optional stage exhausts its control budget, defer it silently. */
  deferOnControlBudgetExhaustion?: boolean;
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
      reason: "replan_invalid" | "control_budget";
      errorCode: "model_contract_invalid" | "provider_unavailable" | "stage_budget_exceeded" | "stage_timeout";
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
  setTimer: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  clearTimer: (timer: ReturnType<typeof setTimeout>) => void;
}

export class CampaignPlayActorReplannerError extends Error {
  constructor(
    readonly code:
      | "replan_input_invalid"
      | "replan_state_invalid"
      | "replan_epoch_lost"
      | "replan_budget_exceeded"
      | "replan_persistence_failed"
      | "replan_deadline_exceeded",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignPlayActorReplannerError";
  }
}

class CampaignPlayActorReplanDeadlineError extends Error {
  constructor() {
    super("actor_replan_deadline_exceeded");
    this.name = "CampaignPlayActorReplanDeadlineError";
  }
}

type CampaignPlayActorPlanRejectionReason =
  | "active_goal_unavailable"
  | "target_unavailable"
  | "route_not_traversable_from_step_location"
  | "target_outside_step_location"
  | "obligation_transition_invalid"
  | "observable_trace_names_actor"
  | "compiled_plan_invalid";

class CampaignPlayActorPlanRejectionError extends Error {
  constructor(readonly reason: CampaignPlayActorPlanRejectionReason, options?: ErrorOptions) {
    super(reason, options);
    this.name = "CampaignPlayActorPlanRejectionError";
  }
}

interface CampaignPlayActorPlanRejectionArtifact {
  kind: "actor_plan_rejection";
  phase: "compilation" | "grounding_review";
  reason: CampaignPlayActorPlanRejectionReason | "grounding_review_rejected";
  proposal: CampaignPlayActorReplanProposal;
  review?: {
    verdict: "rejected";
    violations: Array<{
      stepIndex: number;
      kind:
        | "other_actor_action_not_established"
        | "outcome_not_established"
        | "contradicts_accepted_frame";
      fieldPath:
        | "intent.kind"
        | "intent.targetHandles"
        | "intent.method"
        | "intent.stakes"
        | "observableTrace"
        | "possessionOutcome"
        | "obligationOutcome"
        | "elapsedBounds";
    }>;
  };
}

interface ReplanCompilationFrame {
  promptFrame: CampaignPlayActorReplanPromptFrame;
  refsByHandle: Map<string, CampaignPlayEntityRef>;
}

interface ScheduleRow {
  scheduleId: string;
  planId: string | null;
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
  const locationNames = new Map<string, string>();
  for (const route of frame.localRoutes) {
    locationIds.add(route.fromLocationId);
    locationIds.add(route.toLocationId);
  }
  if (locationIds.size > 0) {
    const rows = handle.sqlite.prepare(`SELECT id, name, description FROM locations
      WHERE campaign_id = ? ORDER BY id`).all(handle.campaignId) as Array<{
      id: string; name: string; description: string;
    }>;
    for (const row of rows) if (locationIds.has(row.id)) {
      locationNames.set(row.id, row.name);
      entities.push({
        handle: bind({ kind: "location", id: row.id }),
        kind: "location",
        name: row.name,
        summary: row.description,
        state: frame.placements.some((placement) => placement.locationId === row.id) ? "occupied" : null,
      });
    }
  }
  for (const route of frame.localRoutes) entities.push({
    handle: bind({ kind: "route", id: route.id }),
    kind: "route",
    name: `Route from ${locationNames.get(route.fromLocationId) ?? route.fromLocationId} ` +
      `to ${locationNames.get(route.toLocationId) ?? route.toLocationId}`,
    summary: `From ${bind({ kind: "location", id: route.fromLocationId })} to ${bind({ kind: "location", id: route.toLocationId })}; travel cost ${route.travelCost}`,
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
  for (const possession of frame.possessions) entities.push({
    handle: bind({ kind: "possession", id: possession.possessionId }),
    kind: "possession",
    name: possession.name,
    summary: `Owned by ${bind({ kind: "actor", id: frame.actorId })}`,
    state: `quantity ${possession.quantity}`,
  });
  for (const obligation of frame.obligations) {
    const actorIsDebtor = obligation.debtorActorId === frame.actorId;
    const counterpartyId = actorIsDebtor
      ? obligation.creditorActorId
      : obligation.debtorActorId;
    entities.push({
      handle: bind({ kind: "obligation", id: obligation.obligationId }),
      kind: "obligation",
      name: actorIsDebtor
        ? `Debt owed to ${bind({ kind: "actor", id: counterpartyId })}`
        : `Debt owed by ${bind({ kind: "actor", id: counterpartyId })}`,
      summary: `${obligation.outstandingAmount} ${obligation.unitKey} outstanding`,
      state: actorIsDebtor ? "payable" : "receivable",
    });
  }
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
  const settledStepCount = frame.plan === null
    ? 0
    : (handle.sqlite.prepare(`SELECT count(*) AS count
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
      priorPlan: frame.plan === null
        ? null
        : {
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
  if (!goal) throw new CampaignPlayActorPlanRejectionError("active_goal_unavailable");
  const actorName = frame.actor.name.toLowerCase();
  const operative = frame.placements.find((placement) =>
    placement.placementKind === "present");
  const resolveIntent = (
    intent: CampaignPlayActorReplanProposal["intent"],
    originLocationId: string | null,
    enforceStepLocation = true,
  ): { intent: CampaignPlayActorIntent; destinationLocationId: string | null } => {
    let targets = intent.targetHandles.map((targetHandle) => {
      const reference = compilation.refsByHandle.get(targetHandle);
      if (!reference) throw new CampaignPlayActorPlanRejectionError("target_unavailable");
      return { ...reference };
    });
    let destinationLocationId: string | null = originLocationId;
    if (intent.kind === "move") {
      const routeTargets = targets.filter((target) => target.kind === "route");
      const locationTargets = targets.filter((target) => target.kind === "location");
      const destination = locationTargets.length === 1 ? locationTargets[0] : undefined;
      const matchingRoutes = destination === undefined || originLocationId === null
        ? []
        : frame.localRoutes.filter((candidate) =>
            candidate.state === "open"
            && candidate.fromLocationId === originLocationId
            && candidate.toLocationId === destination.id);
      if (
        routeTargets.length !== 0 || targets.length !== 1 || !destination
        || matchingRoutes.length !== 1
      ) {
        throw new CampaignPlayActorPlanRejectionError("route_not_traversable_from_step_location");
      }
      const route = matchingRoutes[0]!;
      destinationLocationId = destination.id;
      targets = [
        { kind: "route", id: route.id },
        { kind: "location", id: destination.id },
      ];
    } else if (
      enforceStepLocation &&
      targets.some((target) => target.kind === "location" && target.id !== originLocationId)
    ) {
      throw new CampaignPlayActorPlanRejectionError("target_outside_step_location");
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
    const obligationOutcome = (() => {
      if (step.obligationOutcome.kind === "none") return { kind: "none" as const };
      const creditor = compilation.refsByHandle.get(step.obligationOutcome.creditorActorHandle);
      const targetsCreditor = resolved.intent.targets.some((target) =>
        target.kind === "actor" && target.id === creditor?.id);
      if (creditor?.kind !== "actor" || creditor.id === frame.actorId || !targetsCreditor) {
        throw new CampaignPlayActorPlanRejectionError("obligation_transition_invalid");
      }
      if (step.obligationOutcome.kind === "incur") return {
        kind: "incur" as const,
        creditorActorId: creditor.id,
        unitKey: step.obligationOutcome.unitKey,
        amount: step.obligationOutcome.amount,
      };
      const obligation = compilation.refsByHandle.get(step.obligationOutcome.obligationHandle);
      const paymentPossession = compilation.refsByHandle.get(
        step.obligationOutcome.paymentPossessionHandle,
      );
      const obligationRow = obligation?.kind === "obligation"
        ? frame.obligations.find((row) => row.obligationId === obligation.id)
        : undefined;
      const paymentRow = paymentPossession?.kind === "possession"
        ? frame.possessions.find((row) => row.possessionId === paymentPossession.id)
        : undefined;
      if (
        obligation?.kind !== "obligation"
        || paymentPossession?.kind !== "possession"
        || obligationRow?.debtorActorId !== frame.actorId
        || obligationRow.creditorActorId !== creditor.id
        || obligationRow.unitKey !== step.obligationOutcome.unitKey
        || obligationRow.outstandingAmount < step.obligationOutcome.amount
        || paymentRow?.actorId !== frame.actorId
        || paymentRow.quantity < step.obligationOutcome.amount
      ) {
        throw new CampaignPlayActorPlanRejectionError("obligation_transition_invalid");
      }
      return {
        kind: "pay" as const,
        creditorActorId: creditor.id,
        obligationId: obligation.id,
        paymentPossessionId: paymentPossession.id,
        unitKey: step.obligationOutcome.unitKey,
        amount: step.obligationOutcome.amount,
      };
    })();
    return {
      stepId: stableId("actor-step", { planId, order }),
      order,
      intent: resolved.intent,
      observableTrace: (() => {
        if (step.observableTrace.toLowerCase().includes(actorName)) {
          throw new CampaignPlayActorPlanRejectionError("observable_trace_names_actor");
        }
        return step.observableTrace;
      })(),
      possessionOutcome: structuredClone(step.possessionOutcome),
      obligationOutcome,
      elapsedBounds: { ...step.elapsedBounds },
    };
  });
  try {
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
  } catch (cause) {
    throw new CampaignPlayActorPlanRejectionError("compiled_plan_invalid", { cause });
  }
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
  const dependencies = {
    generateObject: safeGenerateObject,
    now: Date.now,
    setTimer: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
    clearTimer: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
    ...overrides,
  };
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
      const job = handle.sqlite.prepare(`SELECT turn_id AS turnId,
          worker_epoch AS workerEpoch, claim_turn_worker_epoch AS claimTurnWorkerEpoch
        FROM campaign_play_actor_jobs
        WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
          AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).get(
        request.jobId,
        handle.campaignId,
        request.observedWorkerEpoch,
        request.observedTurnWorkerEpoch,
      ) as { turnId: string; workerEpoch: number; claimTurnWorkerEpoch: number } | undefined;
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
      const linkedStarted = handle.sqlite.prepare(`SELECT attempt.model_stage_row_id AS modelStageRowId,
          attempt.model_worker_epoch AS modelWorkerEpoch,
          model.created_at AS createdAt
        FROM campaign_play_actor_replan_attempts attempt
        JOIN campaign_play_model_stages model ON model.id = attempt.model_stage_row_id
        WHERE attempt.campaign_id = ? AND attempt.job_id = ?
          AND attempt.actor_job_worker_epoch = ? AND attempt.claim_turn_worker_epoch = ?
          AND model.status = 'started'
        ORDER BY attempt.attempt_number DESC LIMIT 1`).get(
        handle.campaignId,
        request.jobId,
        request.observedWorkerEpoch,
        request.observedTurnWorkerEpoch,
      ) as { modelStageRowId: string; modelWorkerEpoch: number; createdAt: number } | undefined;
      const started = linkedStarted ?? handle.sqlite.prepare(`SELECT id AS modelStageRowId,
          worker_epoch AS modelWorkerEpoch, created_at AS createdAt
        FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
          AND kind = 'actor_replanner' AND worker_epoch = ? AND status = 'started'`).get(
        handle.campaignId,
        job.turnId,
        stageId,
        request.observedWorkerEpoch,
      ) as { modelStageRowId: string; modelWorkerEpoch: number; createdAt: number } | undefined;
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
            WHERE id = ? AND campaign_id = ? AND turn_id = ?
              AND stage_id = ? AND kind = 'actor_replanner'
              AND worker_epoch = ? AND status = 'started'`).run(
            Math.max(0, request.observedAt - started.createdAt),
            request.observedAt,
            started.modelStageRowId,
            context.campaignId,
            job.turnId,
            stageId,
            started.modelWorkerEpoch,
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
        || !Number.isSafeInteger(request.maximumCostMicros) || request.maximumCostMicros < 0
        || !Number.isSafeInteger(request.externalOperationDeadlineMs)
        || request.externalOperationDeadlineMs <= 0
        || (request.controlDeadlineAt !== undefined &&
          (!Number.isSafeInteger(request.controlDeadlineAt) || request.controlDeadlineAt <= request.createdAt))) {
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
        claim_turn_worker_epoch AS claimTurnWorkerEpoch, stage,
        frozen_base_world_version AS frozenBaseWorldVersion
        FROM campaign_play_actor_jobs WHERE job_id = ? AND campaign_id = ?`).get(
        request.jobId,
        handle.campaignId,
      ) as {
        workerEpoch: number;
        claimTurnWorkerEpoch: number | null;
        stage: string;
        frozenBaseWorldVersion: number;
      } | undefined;
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
      const generationRecoveryProposalSchema =
        campaignPlayActorReplanGenerationRecoveryProposalSchemaForFrame(
          compilation.promptFrame,
        );
      if (!generationRecoveryProposalSchema) {
        throw new CampaignPlayActorReplannerError("replan_state_invalid");
      }
      const proposalPrompt = buildCampaignPlayActorReplanPrompt(compilation.promptFrame);
      const stageId = deriveCampaignPlayActorReplanStageId(request.jobId);
      const previousStageCount = (handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_model_stages WHERE campaign_id = ? AND stage_id = ?`).get(
        handle.campaignId,
        stageId,
      ) as { count: number }).count;
      const existingLinkedAttemptCount = (handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_actor_replan_attempts WHERE campaign_id = ? AND job_id = ?`).get(
        handle.campaignId,
        request.jobId,
      ) as { count: number }).count;
      const linkedCall = previousStageCount === 0 && existingLinkedAttemptCount === 0;
      const firstAttemptNumber = previousStageCount + 1;
      const workerEpoch = job.workerEpoch + 1;
      const firstModelWorkerEpoch = workerEpoch;
      const firstModelStageRowId = stableId("model-stage-row", {
        stageId,
        workerEpoch: firstModelWorkerEpoch,
      });
      const firstAttemptId = stableId("actor-replan-attempt", {
        stageId,
        attemptNumber: firstAttemptNumber,
        modelWorkerEpoch: firstModelWorkerEpoch,
      });
      const providerStartedAt = dependencies.now();
      const deadlineAt = Math.min(
        providerStartedAt + request.externalOperationDeadlineMs,
        request.controlDeadlineAt ?? Number.MAX_SAFE_INTEGER,
      );
      if (!Number.isSafeInteger(deadlineAt) || deadlineAt <= providerStartedAt) {
        throw new CampaignPlayActorReplannerError("replan_input_invalid");
      }
      let upstreamAbortSettled = false;
      let resolveUpstreamAbort!: () => void;
      const upstreamAbortSignal = new Promise<void>((resolve) => {
        resolveUpstreamAbort = resolve;
      });
      type AttemptOperation = {
        startedAt: number;
        deadlineAt: number;
        signal: AbortSignal;
        abort: () => void;
        isDeadlineReached: () => boolean;
        assertLive: () => void;
        runProvider: <T>(work: () => Promise<T>) => Promise<T>;
        dispose: () => void;
      };
      let activeAttemptOperation: AttemptOperation | undefined;
      const onUpstreamAbort = (): void => {
        activeAttemptOperation?.abort();
        if (!upstreamAbortSettled) {
          upstreamAbortSettled = true;
          resolveUpstreamAbort();
        }
      };
      if (request.signal?.aborted) onUpstreamAbort();
      else request.signal?.addEventListener("abort", onUpstreamAbort, { once: true });
      const createAttemptOperation = (startedAt: number, attemptDeadlineAt: number): AttemptOperation => {
        const controller = new AbortController();
        let deadlineReached = false;
        let deadlineSettled = false;
        let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
        let resolveDeadline!: () => void;
        const deadlineSignal = new Promise<void>((resolve) => {
          resolveDeadline = resolve;
        });
        const markDeadline = (): void => {
          if (deadlineReached) return;
          deadlineReached = true;
          controller.abort();
          if (!deadlineSettled) {
            deadlineSettled = true;
            resolveDeadline();
          }
        };
        const markDeadlineIfExpired = (): void => {
          if (dependencies.now() >= attemptDeadlineAt) markDeadline();
        };
        const operation: AttemptOperation = {
          startedAt,
          deadlineAt: attemptDeadlineAt,
          signal: controller.signal,
          abort: () => controller.abort(),
          isDeadlineReached: () => {
            markDeadlineIfExpired();
            return deadlineReached;
          },
          assertLive: () => {
            if (request.signal?.aborted) {
              throw new CampaignPlayActorReplannerError("replan_epoch_lost");
            }
            markDeadlineIfExpired();
            if (deadlineReached || controller.signal.aborted) {
              throw new CampaignPlayActorReplanDeadlineError();
            }
          },
          runProvider: async <T>(work: () => Promise<T>): Promise<T> => {
            operation.assertLive();
            const provider = Promise.resolve().then(work);
            void provider.catch(() => undefined);
            try {
              return await Promise.race([
                provider,
                deadlineSignal.then(() => {
                  throw new CampaignPlayActorReplanDeadlineError();
                }),
                upstreamAbortSignal.then(() => {
                  throw new CampaignPlayActorReplannerError("replan_epoch_lost");
                }),
              ]);
            } catch (error) {
              if (request.signal?.aborted) {
                throw new CampaignPlayActorReplannerError("replan_epoch_lost");
              }
              if (deadlineReached || dependencies.now() >= attemptDeadlineAt) {
                markDeadline();
                throw new CampaignPlayActorReplanDeadlineError();
              }
              throw error;
            }
          },
          dispose: () => {
            if (deadlineTimer !== undefined) {
              dependencies.clearTimer(deadlineTimer);
              deadlineTimer = undefined;
            }
            if (activeAttemptOperation === operation) activeAttemptOperation = undefined;
          },
        };
        const deadlineDelay = Math.max(0, attemptDeadlineAt - dependencies.now());
        deadlineTimer = dependencies.setTimer(markDeadline, deadlineDelay);
        activeAttemptOperation = operation;
        if (request.signal?.aborted) controller.abort();
        return operation;
      };
      const clearDeadline = (): void => {
        activeAttemptOperation?.dispose();
        request.signal?.removeEventListener("abort", onUpstreamAbort);
      };
      const firstAttemptOperation = createAttemptOperation(providerStartedAt, deadlineAt);
      try {
      turnRepository.commitActorTransition({
        token: request.token,
        leaseMode: "live",
        worldVersionAdvance: 0,
        mutationId: stableId("actor-job-event", { jobId: request.jobId, stage: "replan_claimed", workerEpoch }),
        protectedPayloadHash: hashCampaignPlayProjection({ stageId, workerEpoch }),
        committedAt: providerStartedAt,
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
            firstModelStageRowId,
            stageId,
            firstAttemptNumber,
            context.campaignId,
            frame.turnId,
            firstModelWorkerEpoch,
              requestedModel.providerId,
              requestedModel.model,
            providerStartedAt,
          );
          if (linkedCall) {
            const attemptRow = context.sqlite.prepare(`INSERT INTO campaign_play_actor_replan_attempts (
              attempt_id, campaign_id, job_id, stage_id, model_stage_row_id,
              turn_id, actor_id, attempt_number, model_worker_epoch,
              actor_job_worker_epoch, claim_turn_worker_epoch, frame_hash,
              frozen_base_world_version, deadline_at, requested_provider_id, requested_model,
              requested_strategy, retry_consumed_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'strict_object', NULL, ?)`).run(
              firstAttemptId,
              context.campaignId,
              request.jobId,
              stageId,
              firstModelStageRowId,
              frame.turnId,
              frame.actorId,
              firstAttemptNumber,
              firstModelWorkerEpoch,
              workerEpoch,
              request.token.epoch,
              turn.frameHash,
              job.frozenBaseWorldVersion,
              deadlineAt,
              requestedModel.providerId,
              requestedModel.model,
              providerStartedAt,
            );
            if (attemptRow.changes !== 1) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
          }
        },
      });

      type ActorReplanContractRejectionPhase = "generation" | "evidence" | "compilation" | "review";
      type AttemptFailure = {
        kind: "failed";
        modelWorkerEpoch: number;
        attemptNumber: number;
        modelStageRowId: string;
        attemptId: string | null;
        errorCode:
          | "model_contract_invalid"
          | "provider_unavailable"
          | "stage_budget_exceeded"
          | "stage_timeout"
          | "persistence_failed"
          | "worker_lease_lost";
        schemaOutcome: "invalid" | "transport_error";
        durationMs: number;
        trace?: Readonly<SafeGenerateTrace>;
        stageEvidence?: ReturnType<typeof acceptedTrace>;
        rejectionArtifact?: CampaignPlayActorPlanRejectionArtifact;
        contractInvalid: boolean;
        contractRejectionPhase: ActorReplanContractRejectionPhase;
        safeGenerationCode: SafeGenerateErrorCode | null;
        proposalGenerationStarted: boolean;
        /** The authorized retry was skipped because its full window cannot fit. */
        controlBudgetDeferral?: boolean;
      };
      type AttemptResult =
        | { kind: "replanned"; plan: CampaignPlayActorPlan; modelWorkerEpoch: number; attemptNumber: number }
        | AttemptFailure;
      const loggedRejectionAttempts = new Set<string>();
      const recoveryFeedbackFromArtifact = (
        artifact: CampaignPlayActorPlanRejectionArtifact,
      ): CampaignPlayActorReplanRecoveryFeedback => ({
        phase: artifact.phase,
        reason: artifact.reason,
        goalHandle: artifact.proposal.goalHandle,
        stepCount: artifact.proposal.steps.length,
        moveTargets: artifact.proposal.steps
          .map((step, index) => step.intent.kind === "move"
            ? `${index}:${step.intent.targetHandles.join(",")}`
            : null)
          .filter((value): value is string => value !== null)
          .join("|"),
        reviewViolations: artifact.review?.violations
          .map((violation) => `${violation.stepIndex}:${violation.kind}`)
          .join("|") ?? "",
        reviewViolationFields: artifact.review?.violations
          .map((violation) => `${violation.stepIndex}:${violation.fieldPath}`)
          .join("|") ?? "",
      });
      const emitRejectionDiagnostic = (failure: AttemptFailure): void => {
        const artifact = failure.rejectionArtifact;
        if (artifact === undefined) return;
        const attemptKey = `${failure.attemptNumber}:${failure.modelWorkerEpoch}`;
        if (loggedRejectionAttempts.has(attemptKey)) return;
        loggedRejectionAttempts.add(attemptKey);
        log.event("actor_replan.rejected", {
          campaignId: handle.campaignId,
          turnId: frame.turnId,
          jobId: request.jobId,
          actorId: frame.actorId,
          attemptNumber: failure.attemptNumber,
          modelWorkerEpoch: failure.modelWorkerEpoch,
          ...recoveryFeedbackFromArtifact(artifact),
        });
      };
      const loggedContractRejectionAttempts = new Set<string>();
      const emitContractRejectionDiagnostic = (failure: AttemptFailure): void => {
        if (!failure.proposalGenerationStarted
          || !["model_contract_invalid", "provider_unavailable", "stage_timeout"].includes(failure.errorCode)) {
          return;
        }
        const attemptKey = `${failure.attemptNumber}:${failure.modelWorkerEpoch}`;
        if (loggedContractRejectionAttempts.has(attemptKey)) return;
        loggedContractRejectionAttempts.add(attemptKey);
        const recovery = failure.rejectionArtifact === undefined
          ? null
          : recoveryFeedbackFromArtifact(failure.rejectionArtifact);
        const phase = failure.contractRejectionPhase;
        try {
          log.event("actor_replan.contract_rejected", {
            campaignId: handle.campaignId,
            turnId: frame.turnId,
            jobId: request.jobId,
            stageId,
            modelStageRowId: failure.modelStageRowId,
            attemptId: failure.attemptId,
            actorId: frame.actorId,
            attemptNumber: failure.attemptNumber,
            modelWorkerEpoch: failure.modelWorkerEpoch,
            phase,
            errorCode: failure.errorCode,
            safeGenerationCode: phase === "generation" || phase === "review"
              ? failure.safeGenerationCode
              : null,
            recoveryPhase: recovery?.phase ?? null,
            recoveryReason: recovery?.reason ?? null,
            goalHandle: recovery?.goalHandle ?? null,
            stepCount: recovery?.stepCount ?? null,
            moveTargets: recovery?.moveTargets ?? "",
            reviewViolations: recovery?.reviewViolations ?? "",
            reviewViolationFields: recovery?.reviewViolationFields ?? "",
          });
        } catch {
          // Diagnostics must never alter the Actor Replanner outcome.
        }
      };
      const isContractGenerationFailure = (error: unknown): boolean => {
        const code = getSafeGenerateObjectErrorCode(error);
        return isSafeGenerateObjectContractErrorCode(code);
      };
      const runAttempt = async (
        proposalModel: LanguageModel,
        reviewModel: LanguageModel,
        modelWorkerEpoch: number,
        attemptNumber: number,
        modelStageRowId: string,
        attemptId: string | null,
        proposalSchemaForAttempt: ZodType<CampaignPlayActorReplanProposal>,
        proposalMode: "auto" | "tool",
        prompt: string,
        operation: AttemptOperation,
      ): Promise<AttemptResult> => {
        const startedAt = operation.startedAt;
        const attemptDeadlineAt = operation.deadlineAt;
        // A recovery may advance its logical start by one millisecond when the
        // wall clock samples the same value as attempt 1. Keep every durable
        // timestamp in that attempt at or after the operation start so the
        // turn boundary cannot move backwards in that case.
        const operationNow = (): number => Math.max(dependencies.now(), startedAt);
        const assertOperationLive = operation.assertLive;
        const runProvider = operation.runProvider;
        let observedTrace: Readonly<SafeGenerateTrace> | undefined;
        let stageEvidence: ReturnType<typeof acceptedTrace> | undefined;
        let rejectionArtifact: CampaignPlayActorPlanRejectionArtifact | undefined;
        let contractInvalid = false;
        let contractRejectionPhase: ActorReplanContractRejectionPhase = "generation";
        let safeGenerationCode: SafeGenerateErrorCode | null = null;
        let proposalGenerationStarted = false;
        let processStoppedAfterProviderReturn = false;
        try {
          requireTurnLease(handle, request.token, startedAt);
          assertOperationLive();
          let generated: Awaited<ReturnType<typeof safeGenerateObject>>;
          try {
            proposalGenerationStarted = true;
            generated = await runProvider(() => dependencies.generateObject<CampaignPlayActorReplanProposal>({
              model: proposalModel,
              schema: proposalSchemaForAttempt,
              prompt,
              temperature: request.temperature,
              maxOutputTokens: request.maxOutputTokens,
              mode: proposalMode,
              strictSchema: true,
              allowRepair: false,
              allowTextFallback: false,
              retries: 1,
              abortSignal: operation.signal,
            }));
          } catch (cause) {
            safeGenerationCode = getSafeGenerateObjectErrorCode(cause);
            if (isContractGenerationFailure(cause)) contractInvalid = true;
            throw cause;
          }
          observedTrace = generated.trace;
          contractRejectionPhase = "evidence";
          assertOperationLive();
          try {
            request.injectFault?.("after_provider_return");
          } catch (cause) {
            processStoppedAfterProviderReturn = true;
            throw cause;
          }
          const proposerCompletedAt = operationNow();
          assertOperationLive();
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
          let proposal: CampaignPlayActorReplanProposal;
          try {
            proposal = campaignPlayActorReplanProposalSchema.parse(generated.object);
          } catch (cause) {
            contractInvalid = true;
            throw cause;
          }
          assertOperationLive();
          contractRejectionPhase = "compilation";
          let plan: CampaignPlayActorPlan;
          try {
            plan = compilePlan(handle, frame, compilation, proposal);
          } catch (cause) {
            if (cause instanceof CampaignPlayActorPlanRejectionError) {
              rejectionArtifact = {
                kind: "actor_plan_rejection",
                phase: "compilation",
                reason: cause.reason,
                proposal,
              };
            }
            contractInvalid = true;
            throw cause;
          }
          assertOperationLive();
          stageEvidence = undefined;
          type GroundingReview = {
            verdict: "accepted" | "rejected";
            violations: Array<{
              stepIndex: number;
              kind: "other_actor_action_not_established" | "outcome_not_established" | "contradicts_accepted_frame";
              fieldPath:
                | "intent.kind"
                | "intent.targetHandles"
                | "intent.method"
                | "intent.stakes"
                | "observableTrace"
                | "possessionOutcome"
                | "obligationOutcome"
                | "elapsedBounds";
            }>;
          };
          let reviewed: { object: GroundingReview; trace: SafeGenerateTrace };
          try {
            contractRejectionPhase = "review";
            reviewed = await runProvider(() => dependencies.generateObject<GroundingReview>({
              model: reviewModel,
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
              abortSignal: operation.signal,
            }));
          } catch (cause) {
            safeGenerationCode = getSafeGenerateObjectErrorCode(cause);
            if (isContractGenerationFailure(cause)) contractInvalid = true;
            throw cause;
          }
          observedTrace = reviewed.trace;
          assertOperationLive();
          const reviewerCompletedAt = operationNow();
          assertOperationLive();
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
            rejectionArtifact = {
              kind: "actor_plan_rejection",
              phase: "grounding_review",
              reason: "grounding_review_rejected",
              proposal,
              review: {
                verdict: "rejected",
                violations: reviewed.object.violations,
              },
            };
            contractInvalid = true;
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
          assertOperationLive();
          const acceptedAt = operationNow();
          assertOperationLive();
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
              mutationId: stableId("actor-job-event", {
                jobId: request.jobId,
                stage: "replanned",
                workerEpoch,
                modelWorkerEpoch,
                attemptNumber,
              }),
              protectedPayloadHash: hashCampaignPlayProjection({
                artifactHash,
                actorWorkerEpoch: workerEpoch,
                modelWorkerEpoch,
                attemptNumber,
              }),
              committedAt: acceptedAt,
              mutate(context) {
                const fenced = linkedCall && attemptId !== null
                  ? context.sqlite.prepare(`SELECT 1 AS found
                    FROM campaign_play_actor_replan_attempts attempt
                    JOIN campaign_play_model_stages model ON model.id = attempt.model_stage_row_id
                    JOIN campaign_play_actor_jobs job ON job.job_id = attempt.job_id
                    JOIN campaign_play_turns turn_row ON turn_row.id = job.turn_id
                    WHERE attempt.attempt_id = ? AND attempt.job_id = ?
                      AND attempt.attempt_number IN (1, 2) AND attempt.attempt_number = ?
                      AND attempt.model_worker_epoch = ?
                      AND attempt.actor_job_worker_epoch = ?
                      AND attempt.claim_turn_worker_epoch = ?
                      AND attempt.frame_hash = ?
                      AND attempt.frozen_base_world_version = ?
                      AND attempt.deadline_at = ?
                      AND ? < attempt.deadline_at
                      AND attempt.requested_provider_id = ?
                      AND attempt.requested_model = ?
                      AND attempt.requested_strategy = 'strict_object'
                       AND (attempt.attempt_number = 1 OR EXISTS (
                         SELECT 1 FROM campaign_play_actor_replan_attempts prior_attempt
                         JOIN campaign_play_model_stages prior_model
                           ON prior_model.id = prior_attempt.model_stage_row_id
                         WHERE prior_attempt.job_id = attempt.job_id
                           AND prior_attempt.stage_id = attempt.stage_id
                           AND prior_attempt.turn_id = attempt.turn_id
                           AND prior_attempt.actor_id = attempt.actor_id
                           AND prior_attempt.attempt_number = 1
                           AND prior_attempt.retry_consumed_at = attempt.created_at
                           AND prior_attempt.frame_hash = attempt.frame_hash
                           AND prior_attempt.frozen_base_world_version = attempt.frozen_base_world_version
                           AND prior_attempt.requested_provider_id = attempt.requested_provider_id
                           AND prior_attempt.requested_model = attempt.requested_model
                           AND ((prior_model.schema_outcome = 'invalid'
                                 AND prior_model.error_code = 'model_contract_invalid'
                                 AND attempt.created_at < prior_attempt.deadline_at
                                 AND attempt.deadline_at > attempt.created_at
                                 AND attempt.deadline_at > prior_attempt.deadline_at)
                                 OR (prior_model.schema_outcome = 'transport_error'
                                 AND prior_model.error_code = 'stage_timeout'
                                 AND attempt.created_at >= prior_attempt.deadline_at
                                 AND attempt.deadline_at > attempt.created_at
                                 AND attempt.deadline_at > prior_attempt.deadline_at))
                       ))
                      AND model.status = 'started' AND model.id = attempt.model_stage_row_id
                      AND model.stage_id = attempt.stage_id
                      AND model.worker_epoch = attempt.model_worker_epoch
                      AND job.campaign_id = ? AND job.turn_id = ? AND job.stage = 'claimed'
                      AND job.worker_epoch = attempt.actor_job_worker_epoch
                      AND job.claim_turn_worker_epoch = attempt.claim_turn_worker_epoch
                      AND turn_row.campaign_id = job.campaign_id
                      AND turn_row.stage = 'primary_settled'
                      AND turn_row.frame_hash = attempt.frame_hash
                      AND turn_row.worker_lease_owner = ?
                      AND turn_row.worker_epoch = attempt.claim_turn_worker_epoch
                      AND turn_row.worker_lease_expires_at = ?`).get(
                    attemptId,
                    request.jobId,
                    attemptNumber,
                    modelWorkerEpoch,
                    workerEpoch,
                    request.token.epoch,
                    turn.frameHash,
                    frame.baseWorldVersion,
                    attemptDeadlineAt,
                    acceptedAt,
                    requestedModel.providerId,
                    requestedModel.model,
                    context.campaignId,
                    frame.turnId,
                    request.token.owner,
                    request.token.expiresAt,
                  )
                  : context.sqlite.prepare(`SELECT 1 AS found
                    FROM campaign_play_actor_jobs job
                    JOIN campaign_play_model_stages model
                      ON model.stage_id = ? AND model.worker_epoch = ?
                      AND model.status = 'started' AND model.kind = 'actor_replanner'
                    JOIN campaign_play_turns turn_row
                      ON turn_row.id = job.turn_id AND turn_row.campaign_id = job.campaign_id
                    WHERE job.job_id = ? AND job.campaign_id = ? AND job.turn_id = ?
                      AND job.stage = 'claimed' AND job.worker_epoch = ?
                      AND job.claim_turn_worker_epoch = ?
                      AND turn_row.stage = 'primary_settled'
                      AND turn_row.frame_hash = ?
                      AND turn_row.worker_lease_owner = ?
                      AND turn_row.worker_epoch = ?
                      AND turn_row.worker_lease_expires_at = ?`).get(
                    stageId,
                    modelWorkerEpoch,
                    request.jobId,
                    context.campaignId,
                    frame.turnId,
                    workerEpoch,
                    request.token.epoch,
                    turn.frameHash,
                    request.token.owner,
                    request.token.epoch,
                    request.token.expiresAt,
                  );
                if (!fenced) throw new CampaignPlayActorReplannerError("replan_epoch_lost");
                if (frame.plan?.status === "active") {
                  const priorPlan = context.sqlite.prepare(`UPDATE campaign_play_actor_plans SET status = ?, updated_at = ?
                    WHERE plan_id = ? AND campaign_id = ? AND status = 'active'`).run(
                    frame.selection.kind === "replan_required"
                      && frame.selection.reason === "precondition_failed" ? "blocked" : "completed",
                    acceptedAt,
                    frame.plan.planId,
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
                  WHERE id = ? AND stage_id = ? AND kind = 'actor_replanner'
                    AND worker_epoch = ? AND status = 'started'`).run(
                  evidence.actualProviderId, evidence.actualModel, evidence.inputTokens,
                  evidence.outputTokens, durationMs, evidence.finishReason,
                  artifactJson, artifactHash, acceptedAt, modelStageRowId, stageId, modelWorkerEpoch,
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
          return { kind: "replanned", plan, modelWorkerEpoch, attemptNumber };
        } catch (error) {
          if (processStoppedAfterProviderReturn) throw error;
          const interruptedAt = operationNow();
          const durationMs = Math.max(0, interruptedAt - startedAt);
          const trace = getSafeGenerateObjectTrace(error) ?? observedTrace ?? undefined;
          const epochLost = (error instanceof CampaignPlayActorReplannerError
            && error.code === "replan_epoch_lost") || request.signal?.aborted === true;
          const deadlineExceeded = error instanceof CampaignPlayActorReplanDeadlineError
            || (operation.isDeadlineReached() && !request.signal?.aborted);
          const budgetExceeded = error instanceof CampaignPlayActorReplannerError
            && error.code === "replan_budget_exceeded";
          const persistenceFailed = error instanceof CampaignPlayActorReplannerError
            && error.code === "replan_persistence_failed";
          const errorCode = epochLost ? "worker_lease_lost" as const
            : deadlineExceeded ? "stage_timeout" as const
            : budgetExceeded ? "stage_budget_exceeded" as const
            : persistenceFailed ? "persistence_failed" as const
            : contractInvalid ? "model_contract_invalid" as const
            : trace === undefined ? "provider_unavailable" as const
            : "model_contract_invalid" as const;
          const schemaOutcome = errorCode === "model_contract_invalid" || errorCode === "stage_budget_exceeded"
            ? "invalid" as const
            : "transport_error" as const;
          return {
            kind: "failed",
            modelWorkerEpoch,
            attemptNumber,
            modelStageRowId,
            attemptId,
            errorCode,
            schemaOutcome,
            durationMs,
            trace,
            stageEvidence,
            rejectionArtifact,
            contractInvalid: contractInvalid && errorCode === "model_contract_invalid",
            contractRejectionPhase,
            safeGenerationCode,
            proposalGenerationStarted,
          };
        }
      };

      const finalizeFailure = (failure: AttemptFailure): CampaignPlayActorReplanOutcome => {
        const interruptedAt = Math.max(
          dependencies.now(),
          activeAttemptOperation?.startedAt ?? providerStartedAt,
        );
        // Player-action replanning is optional.  Once the authorized chain has
        // no accepted plan left, keep the turn moving by deferring the actor
        // job, while preserving the existing interrupted behavior for lease
        // and persistence faults that cannot be safely fenced as a plan
        // outcome.
        const controlBudgetFailure = request.deferOnControlBudgetExhaustion === true &&
          (failure.controlBudgetDeferral === true ||
            failure.errorCode === "provider_unavailable" ||
            failure.errorCode === "stage_budget_exceeded" ||
            failure.errorCode === "stage_timeout" ||
            (failure.errorCode === "model_contract_invalid" && failure.attemptNumber >= 2));
        const rejectedSchedule = (failure.errorCode === "model_contract_invalid" || controlBudgetFailure)
          ? (() => {
              const row = handle.sqlite.prepare(`SELECT s.schedule_id AS scheduleId,
                s.plan_id AS planId,
                s.next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
                s.last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes,
                s.agency_debt AS agencyDebt,
                COALESCE(p.cadence_minutes, (6 - s.priority) * 5) AS cadenceMinutes
                FROM campaign_play_actor_schedules s
                LEFT JOIN campaign_play_actor_plans p
                  ON p.campaign_id = s.campaign_id AND p.plan_id = s.plan_id
                WHERE s.campaign_id = ? AND s.actor_id = ?`).get(
                handle.campaignId,
                frame.actorId,
              ) as ScheduleRow | undefined;
              if (!row || row.planId !== (frame.plan?.planId ?? null)) return null;
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
        const deferReason = controlBudgetFailure ? "control_budget" : "replan_invalid";
        emitContractRejectionDiagnostic(failure);
        emitRejectionDiagnostic(failure);
        try {
          requireTurnLease(handle, request.token, interruptedAt);
        } catch {
          return { kind: "interrupted", jobId: request.jobId, errorCode: "worker_lease_lost", workerEpoch };
        }
        const trace = failure.trace;
        const actualProviderId = failure.stageEvidence?.actualProviderId
          ?? trace?.capability?.providerId ?? null;
        const actualModel = failure.stageEvidence?.actualModel
          ?? trace?.response?.modelId ?? trace?.capability?.model ?? null;
        const hasActual = actualProviderId !== null && actualModel !== null;
        turnRepository.commitActorTransition({
          token: request.token,
          leaseMode: "live",
          publicInterruption: !deferInvalidReplan,
          worldVersionAdvance: 0,
          mutationId: stableId("actor-job-event", {
            jobId: request.jobId,
            stage: deferInvalidReplan ? "replan_deferred" : "replan_interrupted",
            workerEpoch,
            modelWorkerEpoch: failure.modelWorkerEpoch,
            attemptNumber: failure.attemptNumber,
          }),
          protectedPayloadHash: hashCampaignPlayProjection({
            errorCode: failure.errorCode,
            actorWorkerEpoch: workerEpoch,
            modelWorkerEpoch: failure.modelWorkerEpoch,
            attemptNumber: failure.attemptNumber,
            outcome: deferInvalidReplan ? deferReason : "interrupted",
          }),
          committedAt: interruptedAt,
          mutate(context) {
            const modelUpdate = context.sqlite.prepare(`UPDATE campaign_play_model_stages SET status = 'interrupted',
              actual_provider_id = ?, actual_model = ?, actual_strategy = ?,
              input_tokens = ?, output_tokens = ?, finish_reason = ?,
              duration_ms = ?, schema_outcome = ?, error_code = ?,
              completed_at = ? WHERE id = ? AND stage_id = ? AND kind = 'actor_replanner'
                AND worker_epoch = ? AND status = 'started'`).run(
              hasActual ? actualProviderId : null,
              hasActual ? actualModel : null,
              hasActual ? "strict_object" : null,
              failure.stageEvidence?.inputTokens ?? trace?.usage?.inputTokens ?? null,
              failure.stageEvidence?.outputTokens ?? trace?.usage?.outputTokens ?? null,
              failure.stageEvidence?.finishReason ?? trace?.finishReason ?? null,
              failure.durationMs,
              failure.schemaOutcome,
              failure.errorCode,
              interruptedAt,
              failure.kind === "failed" ? stableId("model-stage-row", {
                stageId,
                workerEpoch: failure.modelWorkerEpoch,
              }) : "",
              stageId,
              failure.modelWorkerEpoch,
            );
            let terminalChanges: number;
            if (deferInvalidReplan) {
              const terminal = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
                SET stage = 'deferred', defer_reason = ?, completed_at = ?
                WHERE job_id = ? AND campaign_id = ? AND stage = 'claimed'
                  AND proposal_id IS NULL AND worker_epoch = ?
                  AND claim_turn_worker_epoch = ?`).run(
                deferReason,
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
                WHERE schedule_id = ? AND campaign_id = ? AND actor_id = ? AND plan_id IS ?`).run(
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
              reason: deferReason,
              errorCode: controlBudgetFailure
                ? (failure.errorCode as
                    | "model_contract_invalid"
                    | "provider_unavailable"
                    | "stage_budget_exceeded"
                    | "stage_timeout")
                : "model_contract_invalid",
              workerEpoch,
            }
          : { kind: "interrupted", jobId: request.jobId, errorCode: failure.errorCode, workerEpoch };
      };

      let firstResult = await runAttempt(
        request.model,
        request.model,
        firstModelWorkerEpoch,
        firstAttemptNumber,
        firstModelStageRowId,
        linkedCall ? firstAttemptId : null,
        proposalSchema,
        "auto",
        proposalPrompt,
        firstAttemptOperation,
      );
      if (firstResult.kind === "replanned") {
        return { kind: "replanned", jobId: request.jobId, plan: firstResult.plan, workerEpoch };
      }
      emitRejectionDiagnostic(firstResult);
      if (request.signal?.aborted === true) {
        return finalizeFailure({
          ...firstResult,
          errorCode: "worker_lease_lost",
          schemaOutcome: "transport_error",
          contractInvalid: false,
        });
      }
      const firstAttemptTimedOut = firstAttemptOperation.isDeadlineReached() || dependencies.now() >= deadlineAt;
      if (firstAttemptTimedOut) {
        firstResult = {
          ...firstResult,
          errorCode: "stage_timeout",
          schemaOutcome: "transport_error",
          contractInvalid: false,
        };
        if (!linkedCall) return finalizeFailure(firstResult);
      }
      const recoveryModel = request.recoveryModel;
      const stageTimeoutRecovery = linkedCall !== undefined && firstResult.errorCode === "stage_timeout";
      const contractRecovery = linkedCall !== undefined && firstResult.contractInvalid &&
        recoveryModel !== undefined &&
        dependencies.now() < request.token.expiresAt && dependencies.now() < deadlineAt;
      const recoveryAuthorized = contractRecovery || stageTimeoutRecovery;
      // Attempt 2 is authorized only when its complete external-operation
      // window fits inside the player-action actor budget. A shortened retry
      // would violate the fresh-deadline contract and be rejected by SQLite,
      // so defer the optional job before opening that transaction instead.
      const retryStartedAt = Math.max(dependencies.now(), providerStartedAt + 1);
      const fullRetryDeadlineAt = retryStartedAt + request.externalOperationDeadlineMs;
      if (recoveryAuthorized && request.deferOnControlBudgetExhaustion === true &&
        request.controlDeadlineAt !== undefined &&
        Number.isSafeInteger(fullRetryDeadlineAt) &&
        fullRetryDeadlineAt > request.controlDeadlineAt) {
        return finalizeFailure({
          ...firstResult,
          controlBudgetDeferral: true,
        });
      }
      const mayEscalate = (contractRecovery || stageTimeoutRecovery) &&
        !request.signal?.aborted && dependencies.now() < request.token.expiresAt &&
        dependencies.now() < (request.controlDeadlineAt ?? Number.MAX_SAFE_INTEGER);
      if (mayEscalate) {
        emitContractRejectionDiagnostic(firstResult);
        // SQLite rejects a shared numeric deadline for new attempt-2 rows.  A
        // same-millisecond clock sample is still a new operation, so advance
        // the retry start by the smallest representable unit in that case.
        const retryDeadlineAt = fullRetryDeadlineAt;
        if (!Number.isSafeInteger(retryDeadlineAt) || retryDeadlineAt <= retryStartedAt) {
          return finalizeFailure({
            ...firstResult,
            errorCode: "persistence_failed",
            schemaOutcome: "transport_error",
            contractInvalid: false,
          });
        }
        const secondModelWorkerEpoch = firstModelWorkerEpoch + 1;
        const secondAttemptNumber = firstAttemptNumber + 1;
        const secondModelStageRowId = stableId("model-stage-row", {
          stageId,
          workerEpoch: secondModelWorkerEpoch,
        });
        const secondAttemptId = stableId("actor-replan-attempt", {
          stageId,
          attemptNumber: secondAttemptNumber,
          modelWorkerEpoch: secondModelWorkerEpoch,
        });
        try {
          if (stageTimeoutRecovery) {
            if (request.signal?.aborted) {
              throw new CampaignPlayActorReplannerError("replan_epoch_lost");
            }
          } else {
            firstAttemptOperation.assertLive();
          }
          requireTurnLease(handle, request.token, retryStartedAt);
          turnRepository.commitActorTransition({
            token: request.token,
            leaseMode: "live",
            worldVersionAdvance: 0,
            mutationId: stableId("actor-job-event", {
              jobId: request.jobId,
              stage: "replan_reasoning_escalated",
              workerEpoch,
            }),
            protectedPayloadHash: hashCampaignPlayProjection({
              jobId: request.jobId,
              stageId,
              frameHash: turn.frameHash,
              workerEpoch,
              firstAttemptId,
              secondAttemptId,
            }),
            committedAt: retryStartedAt,
            mutate(context) {
              const firstStage = context.sqlite.prepare(`SELECT model.status AS status,
                  model.error_code AS errorCode, model.schema_outcome AS schemaOutcome,
                  attempt.deadline_at AS deadlineAt,
                  attempt.frame_hash AS frameHash,
                  attempt.frozen_base_world_version AS frozenBaseWorldVersion,
                  attempt.requested_provider_id AS requestedProviderId,
                  attempt.requested_model AS requestedModel
                FROM campaign_play_model_stages model
                JOIN campaign_play_actor_replan_attempts attempt
                  ON attempt.model_stage_row_id = model.id
                WHERE model.id = ? AND model.stage_id = ? AND model.attempt = ?
                  AND model.kind = 'actor_replanner' AND model.worker_epoch = ?
                  AND attempt.attempt_id = ? AND attempt.job_id = ?
                  AND attempt.attempt_number = 1`).get(
                firstModelStageRowId,
                stageId,
                firstAttemptNumber,
                firstModelWorkerEpoch,
                firstAttemptId,
                request.jobId,
              ) as {
                status: string;
                errorCode: string | null;
                schemaOutcome: string;
                deadlineAt: number;
                frameHash: string;
                frozenBaseWorldVersion: number;
                requestedProviderId: string;
                requestedModel: string;
              } | undefined;
              const retryErrorCode = stageTimeoutRecovery ? "stage_timeout" : "model_contract_invalid";
              const retryStartsInAllowedWindow = stageTimeoutRecovery
                ? retryStartedAt >= deadlineAt
                : retryStartedAt < deadlineAt;
              if (firstStage?.status !== "started"
                || firstStage.errorCode !== null
                || firstStage.deadlineAt !== deadlineAt
                || firstStage.frameHash !== turn.frameHash
                || firstStage.frozenBaseWorldVersion !== frame.baseWorldVersion
                || firstStage.requestedProviderId !== requestedModel.providerId
                || firstStage.requestedModel !== requestedModel.model
                || !retryStartsInAllowedWindow) {
                throw new CampaignPlayActorReplannerError("replan_epoch_lost");
              }
              const firstTrace = firstResult.trace;
              const actualProviderId = firstResult.stageEvidence?.actualProviderId
                ?? firstTrace?.capability?.providerId ?? null;
              const actualModel = firstResult.stageEvidence?.actualModel
                ?? firstTrace?.response?.modelId ?? firstTrace?.capability?.model ?? null;
              const hasActual = actualProviderId !== null && actualModel !== null;
              const modelUpdate = context.sqlite.prepare(`UPDATE campaign_play_model_stages SET
                status = 'interrupted', actual_provider_id = ?, actual_model = ?,
                actual_strategy = ?, input_tokens = ?, output_tokens = ?, finish_reason = ?,
                duration_ms = ?, schema_outcome = ?, error_code = ?,
                completed_at = ? WHERE id = ? AND stage_id = ? AND attempt = ?
                  AND worker_epoch = ? AND status = 'started'`).run(
                hasActual ? actualProviderId : null,
                hasActual ? actualModel : null,
                hasActual ? "strict_object" : null,
                firstResult.stageEvidence?.inputTokens ?? firstTrace?.usage?.inputTokens ?? null,
                 firstResult.stageEvidence?.outputTokens ?? firstTrace?.usage?.outputTokens ?? null,
                 firstResult.stageEvidence?.finishReason ?? firstTrace?.finishReason ?? null,
                 firstResult.durationMs,
                 stageTimeoutRecovery ? "transport_error" : "invalid",
                 retryErrorCode,
                 retryStartedAt,
                firstModelStageRowId,
                stageId,
                firstAttemptNumber,
                firstModelWorkerEpoch,
              );
              const retryMarker = context.sqlite.prepare(`UPDATE campaign_play_actor_replan_attempts
                SET retry_consumed_at = ?
                WHERE attempt_id = ? AND campaign_id = ? AND job_id = ?
                  AND attempt_number = 1 AND retry_consumed_at IS NULL
                  AND model_stage_row_id = ? AND actor_job_worker_epoch = ?
                  AND claim_turn_worker_epoch = ? AND frame_hash = ?
                   AND frozen_base_world_version = ? AND deadline_at = ?
                   AND ((? = 'model_contract_invalid' AND ? < deadline_at)
                     OR (? = 'stage_timeout' AND ? >= deadline_at))
                   AND requested_provider_id = ?
                  AND requested_model = ? AND requested_strategy = 'strict_object'`).run(
                retryStartedAt,
                firstAttemptId,
                context.campaignId,
                request.jobId,
                firstModelStageRowId,
                workerEpoch,
                request.token.epoch,
                turn.frameHash,
                frame.baseWorldVersion,
                 deadlineAt,
                 retryErrorCode,
                 retryStartedAt,
                 retryErrorCode,
                 retryStartedAt,
                requestedModel.providerId,
                requestedModel.model,
              );
              context.sqlite.prepare(`INSERT INTO campaign_play_model_stages (
                id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
                requested_provider_id, requested_model, requested_strategy,
                actual_provider_id, actual_model, actual_strategy, input_tokens, output_tokens,
                duration_ms, finish_reason, schema_outcome, artifact_json, artifact_hash,
                error_code, created_at, completed_at
              ) VALUES (?, ?, ?, ?, ?, 'actor_replanner', 'started', ?, ?, ?, 'strict_object',
                NULL, NULL, NULL, NULL, NULL, NULL, NULL, 'pending', NULL, NULL, NULL, ?, NULL)`).run(
                secondModelStageRowId,
                stageId,
                secondAttemptNumber,
                context.campaignId,
                frame.turnId,
                secondModelWorkerEpoch,
                requestedModel.providerId,
                requestedModel.model,
                retryStartedAt,
              );
              const secondAttempt = context.sqlite.prepare(`INSERT INTO campaign_play_actor_replan_attempts (
                attempt_id, campaign_id, job_id, stage_id, model_stage_row_id,
                turn_id, actor_id, attempt_number, model_worker_epoch,
                actor_job_worker_epoch, claim_turn_worker_epoch, frame_hash,
                frozen_base_world_version, deadline_at, requested_provider_id, requested_model,
                requested_strategy, retry_consumed_at, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'strict_object', NULL, ?)`).run(
                secondAttemptId,
                context.campaignId,
                request.jobId,
                stageId,
                secondModelStageRowId,
                frame.turnId,
                frame.actorId,
                secondAttemptNumber,
                secondModelWorkerEpoch,
                workerEpoch,
                request.token.epoch,
                turn.frameHash,
                 frame.baseWorldVersion,
                 retryDeadlineAt,
                 requestedModel.providerId,
                requestedModel.model,
                retryStartedAt,
              );
              if (modelUpdate.changes !== 1 || retryMarker.changes !== 1 || secondAttempt.changes !== 1) {
                throw new CampaignPlayActorReplannerError("replan_epoch_lost");
              }
            },
          });
        } catch (cause) {
          if (cause instanceof CampaignPlayActorReplannerError
            && cause.code === "replan_epoch_lost") {
            return {
              kind: "interrupted",
              jobId: request.jobId,
              errorCode: "worker_lease_lost",
              workerEpoch,
            };
          }
          return finalizeFailure({
            ...firstResult,
            errorCode: "persistence_failed",
            schemaOutcome: "transport_error",
            contractInvalid: false,
          });
        }
        firstAttemptOperation.dispose();
        const secondAttemptOperation = createAttemptOperation(retryStartedAt, retryDeadlineAt);
        const useGenerationRecoverySchema = firstResult.rejectionArtifact === undefined
          || (
            firstResult.rejectionArtifact.phase === "compilation"
            && (
              firstResult.rejectionArtifact.reason === "target_outside_step_location"
              || firstResult.rejectionArtifact.reason === "route_not_traversable_from_step_location"
            )
          );
        const useRouteRecoveryAutoMode = firstResult.rejectionArtifact?.phase === "compilation"
          && firstResult.rejectionArtifact.reason === "route_not_traversable_from_step_location";
        const useTimeoutRecoveryNormalPath = stageTimeoutRecovery;
        const secondResult = await runAttempt(
          useTimeoutRecoveryNormalPath || useRouteRecoveryAutoMode ? request.model : recoveryModel!,
          request.model,
          secondModelWorkerEpoch,
          secondAttemptNumber,
          secondModelStageRowId,
          secondAttemptId,
          useTimeoutRecoveryNormalPath
            ? proposalSchema
            : useGenerationRecoverySchema
            ? generationRecoveryProposalSchema
            : proposalSchema,
          useTimeoutRecoveryNormalPath || useRouteRecoveryAutoMode ? "auto" : "tool",
          useTimeoutRecoveryNormalPath
            ? proposalPrompt
            : firstResult.rejectionArtifact === undefined
            ? buildCampaignPlayActorReplanGenerationRecoveryPrompt(proposalPrompt)
            : buildCampaignPlayActorReplanRecoveryPrompt(
                proposalPrompt,
                recoveryFeedbackFromArtifact(firstResult.rejectionArtifact),
              ),
          secondAttemptOperation,
        );
        if (secondResult.kind === "replanned") {
          return { kind: "replanned", jobId: request.jobId, plan: secondResult.plan, workerEpoch };
        }
        return finalizeFailure(secondResult);
      }
      return finalizeFailure(firstResult);
      } finally {
        clearDeadline();
      }
    },
  };
}
