import { CAMPAIGN_PLAY_LIMITS, type CampaignWorldReview } from "@worldforge/shared";
import {
  campaignPlayActorJobSchema,
  campaignPlayActorDueSetSchema,
  campaignPlayActorPlanSchema,
  campaignPlayActorScheduleSchema,
  type CampaignPlayActorIntent,
  type CampaignPlayActorDueDecision,
  type CampaignPlayActorDueSet,
  type CampaignPlayActorJob,
  type CampaignPlayActorPlan,
  type CampaignPlayActorPlanStep,
  type CampaignPlayActorSchedule,
  type CampaignPlayEntityRef,
  type CampaignPlayEpistemicSource,
} from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayActorReplanStageId,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import {
  createCampaignPlayStateRepository,
  type CampaignPlayMutationContext,
} from "./campaign-play-state-repository.js";

const MAX_WORLD_TIME_MINUTES = CAMPAIGN_PLAY_LIMITS.worldTimeMinutes;

export type CampaignPlayActorSchedulerErrorCode =
  | "scheduler_state_invalid"
  | "scheduler_turn_invalid"
  | "scheduler_due_set_invalid"
  | "scheduler_due_set_stale"
  | "scheduler_opening_invalid"
  | "scheduler_job_invalid"
  | "scheduler_frame_invalid";

export class CampaignPlayActorSchedulerError extends Error {
  constructor(
    readonly code: CampaignPlayActorSchedulerErrorCode,
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignPlayActorSchedulerError";
  }
}

export type CampaignPlayActorDueReason = "scheduled" | "agency_debt" | "plan_retry";
export type CampaignPlayActorSkipReason =
  | "already_considered_this_turn"
  | "pending_job"
  | "actor_ineligible";
export type CampaignPlayActorDeferReason = "incapacitated" | "actor_capacity" | "replan_capacity";

interface CampaignPlayActorDueDecisionBase {
  dueOrder: number;
  actorId: string;
  scheduleId: string;
  planId: string;
  nextActAtWorldTimeMinutes: number;
  priority: number;
  agencyDebt: number;
  cadenceMinutes: number;
}

export type { CampaignPlayActorDueDecision, CampaignPlayActorDueSet } from "./contracts.js";

export interface FreezeCampaignPlayActorDueSetInput {
  turnId: string;
  expectedWorldVersion: number;
  expectedRuntimeRevision: number;
}

export interface AdmitCampaignPlayActorDueSetInput {
  dueSet: CampaignPlayActorDueSet;
  context: CampaignPlayMutationContext;
  createdAt: number;
}

export interface InitializeCampaignPlayOpeningActorsInput {
  plans: CampaignPlayActorPlan[];
  schedules: CampaignPlayActorSchedule[];
  context: CampaignPlayMutationContext;
  createdAt: number;
}

export interface CampaignPlayOpeningActorRuntime {
  plans: CampaignPlayActorPlan[];
  schedules: CampaignPlayActorSchedule[];
}

export interface ValidateCampaignPlayOpeningActorsInput {
  plans: CampaignPlayActorPlan[];
  schedules: CampaignPlayActorSchedule[];
  turnId: string;
  context: CampaignPlayMutationContext;
}

export interface CampaignPlayActorScheduleTransition {
  nextActAtWorldTimeMinutes: number;
  lastActAtWorldTimeMinutes: number | null;
  agencyDebt: number;
}

export interface CampaignPlayActorKnownEvent {
  knowledgeId: string;
  eventId: string;
  exposureId: string;
  source: CampaignPlayEpistemicSource;
  learnedAtWorldTimeMinutes: number;
  summary: string | null;
  event: {
    kind: string;
    worldTimeMinutes: number;
    worldVersion: number;
    affectedRefs: CampaignPlayEntityRef[];
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  };
}

export type CampaignPlayActorStepSelection =
  | {
      kind: "step";
      step: CampaignPlayActorPlanStep;
      intent: CampaignPlayActorIntent;
      settledStepCount: number;
    }
  | {
      kind: "replan_required";
      reason: "plan_inactive" | "plan_exhausted" | "precondition_failed";
      failedPreconditionIndexes: number[];
    };

export interface CampaignPlayActorFrame {
  campaignId: string;
  turnId: string;
  jobId: string;
  actorId: string;
  baseWorldVersion: number;
  worldTimeMinutes: number;
  actor: CampaignWorldReview["actors"][number];
  plan: CampaignPlayActorPlan;
  selection: CampaignPlayActorStepSelection;
  placements: CampaignWorldReview["placements"];
  goals: CampaignWorldReview["goals"];
  relations: CampaignWorldReview["relations"];
  conditions: Array<{ condition: "occupied" | "strained" | "incapacitated"; summary: string }>;
  localRoutes: Array<CampaignWorldReview["routes"][number] & { state: "open" | "restricted" | "blocked" }>;
  knownPressures: Array<CampaignWorldReview["pressures"][number] & {
    progress: number;
    status: "active" | "resolved";
  }>;
  knownEvents: CampaignPlayActorKnownEvent[];
  authorizedRefs: CampaignPlayEntityRef[];
}

export interface CampaignPlayActorScheduler {
  initializeOpeningActors(
    input: InitializeCampaignPlayOpeningActorsInput,
  ): CampaignPlayOpeningActorRuntime;
  validateOpeningActors(
    input: ValidateCampaignPlayOpeningActorsInput,
  ): CampaignPlayOpeningActorRuntime;
  freezeOpeningDueSet(input: FreezeCampaignPlayActorDueSetInput): CampaignPlayActorDueSet;
  freezeDueSet(input: FreezeCampaignPlayActorDueSetInput): CampaignPlayActorDueSet;
  admitDueSet(input: AdmitCampaignPlayActorDueSetInput): CampaignPlayActorJob[];
  loadDueSet(turnId: string): CampaignPlayActorDueSet | null;
  listTurnJobs(turnId: string): CampaignPlayActorJob[];
  validateTurnSettlement(
    turnId: string,
    context?: CampaignPlayMutationContext,
  ): CampaignPlayActorJob[];
  buildActorFrame(jobId: string): CampaignPlayActorFrame;
}

interface DueRow {
  scheduleId: string;
  actorId: string;
  planId: string;
  nextActAtWorldTimeMinutes: number;
  priority: number;
  agencyDebt: number;
  cadenceMinutes: number;
  planStatus: string;
  actorController: string;
  actorKind: string;
  incapacitated: number;
  currentTurnJob: number;
  pendingJob: number;
}

interface JobRow {
  jobId: string;
  campaignId: string;
  turnId: string;
  actorId: string;
  admittedPlanId: string;
  planId: string;
  dueReason: CampaignPlayActorDueReason;
  frozenBaseWorldVersion: number;
  workerEpoch: number;
  claimTurnWorkerEpoch: number | null;
  stage: CampaignPlayActorJob["stage"];
  proposalId: string | null;
  deferReason: CampaignPlayActorJob["deferReason"];
  createdAt: number;
  completedAt: number | null;
}

const dueSetSeals = new WeakMap<object, string>();

function freeze<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) freeze(child, seen);
  return Object.freeze(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validTime(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_WORLD_TIME_MINUTES;
}

function boundedWorldTime(base: number, delta: number): number {
  if (!validTime(base) || !Number.isSafeInteger(delta) || delta < 1) {
    throw new CampaignPlayActorSchedulerError("scheduler_state_invalid");
  }
  return Math.min(MAX_WORLD_TIME_MINUTES, base + delta);
}

export function calculateCampaignPlayActorNextDueTime(input: {
  settledWorldTimeMinutes: number;
  cadenceMinutes: number;
  lastActAtWorldTimeMinutes: number | null;
  agencyDebt: number;
  outcome: "settled" | "deferred";
}): CampaignPlayActorScheduleTransition {
  if (!validTime(input.settledWorldTimeMinutes)
    || !Number.isSafeInteger(input.cadenceMinutes) || input.cadenceMinutes < 1
    || input.cadenceMinutes > CAMPAIGN_PLAY_LIMITS.elapsedMinutes
    || (input.lastActAtWorldTimeMinutes !== null && !validTime(input.lastActAtWorldTimeMinutes))
    || !Number.isSafeInteger(input.agencyDebt) || input.agencyDebt < 0
    || input.agencyDebt > CAMPAIGN_PLAY_LIMITS.agencyDebt) {
    throw new CampaignPlayActorSchedulerError("scheduler_state_invalid");
  }
  return freeze({
    nextActAtWorldTimeMinutes: boundedWorldTime(
      input.settledWorldTimeMinutes,
      input.cadenceMinutes,
    ),
    lastActAtWorldTimeMinutes: input.outcome === "settled"
      ? input.settledWorldTimeMinutes
      : input.lastActAtWorldTimeMinutes,
    agencyDebt: input.outcome === "settled"
      ? 0
      : Math.min(CAMPAIGN_PLAY_LIMITS.agencyDebt, input.agencyDebt + 1),
  });
}

function parseJson(value: string, label: string): unknown {
  try {
    const parsed = JSON.parse(value) as unknown;
    canonicalizeCampaignPlayProjection(parsed);
    return parsed;
  } catch (cause) {
    throw new CampaignPlayActorSchedulerError("scheduler_frame_invalid", { cause: new Error(label, { cause }) });
  }
}

function knownEventSummary(row: Record<string, unknown>): string | null {
  if (row.commandKind !== "record_world_event") return null;
  const payload = parseJson(
    row.protectedPayloadJson as string,
    "Known event protected payload",
  ) as Record<string, unknown>;
  const summary = payload.summary;
  if (
    typeof summary !== "string"
    || summary.length === 0
    || summary !== summary.trim()
    || summary.length > CAMPAIGN_PLAY_LIMITS.text
  ) {
    throw new CampaignPlayActorSchedulerError("scheduler_frame_invalid");
  }
  return summary;
}

function refKey(reference: CampaignPlayEntityRef): string {
  return `${reference.kind}\u0000${reference.id}`;
}

function uniqueRefs(references: CampaignPlayEntityRef[]): CampaignPlayEntityRef[] {
  const byKey = new Map(references.map((reference) => [refKey(reference), reference]));
  return [...byKey.values()].sort((left, right) => compareText(refKey(left), refKey(right)));
}

function rowToJob(row: JobRow): CampaignPlayActorJob {
  return campaignPlayActorJobSchema.parse(row);
}

function dueRows(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  settledWorldTimeMinutes: number,
): DueRow[] {
  return handle.sqlite.prepare(`
    SELECT s.schedule_id AS scheduleId, s.actor_id AS actorId, s.plan_id AS planId,
      s.next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
      s.priority, s.agency_debt AS agencyDebt, p.cadence_minutes AS cadenceMinutes,
      p.status AS planStatus, a.controller AS actorController, a.kind AS actorKind,
      EXISTS (
        SELECT 1 FROM campaign_play_actor_conditions c
        WHERE c.campaign_id = s.campaign_id AND c.actor_id = s.actor_id
          AND c.condition = 'incapacitated' AND c.present = 1
      ) AS incapacitated,
      EXISTS (
        SELECT 1 FROM campaign_play_actor_jobs j
        WHERE j.turn_id = ? AND j.actor_id = s.actor_id
      ) AS currentTurnJob,
      EXISTS (
        SELECT 1 FROM campaign_play_actor_jobs j
        WHERE j.actor_id = s.actor_id
          AND j.stage IN ('queued', 'claimed', 'interrupted', 'proposed')
      ) AS pendingJob
    FROM campaign_play_actor_schedules s
    JOIN campaign_play_actor_plans p ON p.plan_id = s.plan_id
    JOIN actors a ON a.id = s.actor_id
    WHERE s.campaign_id = ? AND s.next_act_at_world_time_minutes <= ?
    ORDER BY s.next_act_at_world_time_minutes ASC, s.agency_debt DESC,
      s.priority DESC, s.actor_id ASC
  `).all(turnId, handle.campaignId, settledWorldTimeMinutes) as DueRow[];
}

function makeDecision(
  campaignId: string,
  turnId: string,
  settledWorldTimeMinutes: number,
  row: DueRow,
  dueOrder: number,
  actorOpportunityAvailable: boolean,
): CampaignPlayActorDueDecision {
  const base: CampaignPlayActorDueDecisionBase = {
    dueOrder,
    actorId: row.actorId,
    scheduleId: row.scheduleId,
    planId: row.planId,
    nextActAtWorldTimeMinutes: row.nextActAtWorldTimeMinutes,
    priority: row.priority,
    agencyDebt: row.agencyDebt,
    cadenceMinutes: row.cadenceMinutes,
  };
  if (row.currentTurnJob === 1) {
    return { ...base, disposition: "skip", reason: "already_considered_this_turn" };
  }
  if (row.pendingJob === 1) {
    return { ...base, disposition: "skip", reason: "pending_job" };
  }
  if (row.actorController !== "agent" || row.actorKind !== "person") {
    return { ...base, disposition: "skip", reason: "actor_ineligible" };
  }
  const dueReason: CampaignPlayActorDueReason = row.planStatus !== "active"
    ? "plan_retry"
    : row.agencyDebt > 0 ? "agency_debt" : "scheduled";
  const jobHash = hashCampaignPlayProjection({
    campaignId,
    turnId,
    actorId: row.actorId,
    planId: row.planId,
  });
  const jobId = `actor-job:${String(dueOrder).padStart(4, "0")}:${jobHash.slice(0, 24)}`;
  if (row.incapacitated === 1 && row.planStatus === "active") {
    const transition = calculateCampaignPlayActorNextDueTime({
      settledWorldTimeMinutes,
      cadenceMinutes: row.cadenceMinutes,
      lastActAtWorldTimeMinutes: null,
      agencyDebt: row.agencyDebt,
      outcome: "deferred",
    });
    return {
      ...base,
      disposition: "defer",
      dueReason: row.agencyDebt > 0 ? "agency_debt" : "scheduled",
      reason: "incapacitated",
      jobId,
      nextDueAtWorldTimeMinutes: transition.nextActAtWorldTimeMinutes,
      resultAgencyDebt: transition.agencyDebt,
    };
  }
  if (!actorOpportunityAvailable) {
    const transition = calculateCampaignPlayActorNextDueTime({
      settledWorldTimeMinutes,
      cadenceMinutes: row.cadenceMinutes,
      lastActAtWorldTimeMinutes: null,
      agencyDebt: row.agencyDebt,
      outcome: "deferred",
    });
    return {
      ...base,
      disposition: "defer",
      dueReason,
      reason: "actor_capacity",
      jobId,
      nextDueAtWorldTimeMinutes: transition.nextActAtWorldTimeMinutes,
      resultAgencyDebt: transition.agencyDebt,
    };
  }
  return { ...base, disposition: "wake", dueReason, jobId };
}

function dueSetSeal(value: CampaignPlayActorDueSet): string {
  return hashCampaignPlayProjection({ domain: "campaign_play_actor_due_set", value });
}

function parseStoredDueSet(row: {
  campaignId: string;
  turnId: string;
  settledWorldTimeMinutes: number;
  baseWorldVersion: number;
  baseRuntimeRevision: number;
  decisionsJson: string;
  dueSetHash: string;
}): CampaignPlayActorDueSet {
  const value = campaignPlayActorDueSetSchema.parse({
    campaignId: row.campaignId,
    turnId: row.turnId,
    settledWorldTimeMinutes: row.settledWorldTimeMinutes,
    baseWorldVersion: row.baseWorldVersion,
    baseRuntimeRevision: row.baseRuntimeRevision,
    decisions: JSON.parse(row.decisionsJson) as unknown,
  });
  if (
    canonicalizeCampaignPlayProjection(value.decisions) !== row.decisionsJson ||
    dueSetSeal(value) !== row.dueSetHash
  ) {
    throw new CampaignPlayActorSchedulerError("scheduler_due_set_invalid");
  }
  dueSetSeals.set(value, row.dueSetHash);
  return freeze(value);
}

function requireSealedDueSet(value: CampaignPlayActorDueSet): void {
  const seal = dueSetSeals.get(value);
  if (seal === undefined || seal !== dueSetSeal(value)) {
    throw new CampaignPlayActorSchedulerError("scheduler_due_set_invalid");
  }
}

function planFromRow(row: {
  planId: string;
  campaignId: string;
  actorId: string;
  goalId: string;
  planVersion: number;
  intentJson: string;
  preconditionsJson: string;
  cadenceMinutes: number;
  priority: number;
  stepsJson: string;
  status: CampaignPlayActorPlan["status"];
}): CampaignPlayActorPlan {
  return campaignPlayActorPlanSchema.parse({
    planId: row.planId,
    campaignId: row.campaignId,
    actorId: row.actorId,
    goalId: row.goalId,
    planVersion: row.planVersion,
    intent: parseJson(row.intentJson, "Actor plan intent"),
    preconditions: parseJson(row.preconditionsJson, "Actor plan preconditions"),
    cadenceMinutes: row.cadenceMinutes,
    priority: row.priority,
    steps: parseJson(row.stepsJson, "Actor plan steps"),
    status: row.status,
  });
}

function preconditionSatisfied(
  handle: CampaignPlayDatabaseHandle,
  precondition: CampaignPlayActorPlan["preconditions"][number],
): boolean {
  switch (precondition.kind) {
    case "actor_at_location": return !!handle.sqlite.prepare(`
      SELECT 1 FROM actor_placements
      WHERE campaign_id = ? AND actor_id = ? AND location_id = ? LIMIT 1
    `).get(handle.campaignId, precondition.actorId, precondition.locationId);
    case "route_state": {
      const row = handle.sqlite.prepare(`SELECT state FROM campaign_play_route_states
        WHERE campaign_id = ? AND route_id = ?`).get(
        handle.campaignId,
        precondition.routeId,
      ) as { state: string } | undefined;
      return (row?.state ?? "open") === precondition.state;
    }
    case "goal_status": {
      const row = handle.sqlite.prepare(`SELECT status FROM actor_goals
        WHERE campaign_id = ? AND id = ?`).get(
        handle.campaignId,
        precondition.goalId,
      ) as { status: string } | undefined;
      return row?.status === precondition.status;
    }
    case "pressure_status": {
      const row = handle.sqlite.prepare(`SELECT status FROM campaign_play_pressure_states
        WHERE campaign_id = ? AND pressure_id = ?`).get(
        handle.campaignId,
        precondition.pressureId,
      ) as { status: string } | undefined;
      return row?.status === precondition.status;
    }
    case "actor_condition": {
      const row = handle.sqlite.prepare(`SELECT present FROM campaign_play_actor_conditions
        WHERE campaign_id = ? AND actor_id = ? AND condition = ?`).get(
        handle.campaignId,
        precondition.actorId,
        precondition.condition,
      ) as { present: number } | undefined;
      return (row?.present === 1) === precondition.present;
    }
  }
}

export function selectCampaignPlayActorPlanStep(input: {
  plan: CampaignPlayActorPlan;
  settledStepCount: number;
  failedPreconditionIndexes: number[];
}): CampaignPlayActorStepSelection {
  if (!Number.isSafeInteger(input.settledStepCount) || input.settledStepCount < 0
    || input.failedPreconditionIndexes.some((index) =>
      !Number.isSafeInteger(index) || index < 0 || index >= input.plan.preconditions.length)) {
    throw new CampaignPlayActorSchedulerError("scheduler_frame_invalid");
  }
  if (input.plan.status !== "active") {
    return freeze({ kind: "replan_required", reason: "plan_inactive", failedPreconditionIndexes: [] });
  }
  if (input.failedPreconditionIndexes.length > 0) {
    return freeze({
      kind: "replan_required",
      reason: "precondition_failed",
      failedPreconditionIndexes: [...input.failedPreconditionIndexes],
    });
  }
  if (input.settledStepCount >= input.plan.steps.length) {
    return freeze({ kind: "replan_required", reason: "plan_exhausted", failedPreconditionIndexes: [] });
  }
  const step = input.plan.steps[input.settledStepCount]!;
  return freeze({ kind: "step", step, intent: step.intent, settledStepCount: input.settledStepCount });
}

function parseKnowledgeSource(row: Record<string, unknown>): CampaignPlayEpistemicSource {
  return parseJson(row.sourceJson as string, "Actor knowledge source") as CampaignPlayEpistemicSource;
}

function actorLocationFromEventSnapshot(
  afterPayloadJson: string,
  actorId: string,
): string | null {
  const snapshot = parseJson(afterPayloadJson, "Actor-visible event after-payload") as Record<string, unknown>;
  if (!Array.isArray(snapshot.placements)) return null;
  for (const placement of snapshot.placements) {
    if (!placement || typeof placement !== "object" || Array.isArray(placement)) continue;
    const row = placement as Record<string, unknown>;
    if (
      row.actorId === actorId && row.placementKind === "present" &&
      typeof row.locationId === "string"
    ) return row.locationId;
  }
  return null;
}

function currentTurnDirectPerceptionRows(
  handle: CampaignPlayDatabaseHandle,
  turnId: string,
  actorId: string,
): Array<Record<string, unknown>> {
  const rows = handle.sqlite.prepare(`
    SELECT e.event_id AS eventId, x.exposure_id AS exposureId,
      x.location_id AS exposureLocationId, e.source_json AS eventSourceJson,
      e.event_kind AS eventKind, e.world_time_minutes AS eventWorldTimeMinutes,
      e.world_version AS eventWorldVersion, e.affected_refs_json AS affectedRefsJson,
      e.before_payload_json AS beforePayloadJson, e.after_payload_json AS afterPayloadJson,
      c.command_kind AS commandKind, c.protected_payload_json AS protectedPayloadJson
    FROM campaign_play_events e
    JOIN campaign_play_turns t ON t.id = e.turn_id AND t.campaign_id = e.campaign_id
      AND t.turn_kind = 'player_action'
    JOIN campaign_play_commands c ON c.command_id = e.command_id
      AND c.campaign_id = e.campaign_id
    JOIN campaign_play_receipts r ON r.receipt_id = e.receipt_id
      AND r.campaign_id = e.campaign_id AND r.outcome = 'applied'
    JOIN campaign_play_event_exposures x ON x.event_id = e.event_id
      AND x.campaign_id = e.campaign_id AND x.channel = 'direct_perception'
    WHERE e.campaign_id = ? AND e.turn_id = ?
      AND NOT EXISTS (
        SELECT 1 FROM campaign_play_actor_knowledge k
        WHERE k.campaign_id = e.campaign_id AND k.actor_id = ?
          AND k.event_id = e.event_id AND k.exposure_id = x.exposure_id
      )
    ORDER BY e.rowid, x.exposure_id
  `).all(handle.campaignId, turnId, actorId) as Array<Record<string, unknown>>;
  return rows.flatMap((row): Array<Record<string, unknown>> => {
    const locationId = row.exposureLocationId;
    if (
      typeof locationId !== "string" ||
      actorLocationFromEventSnapshot(row.afterPayloadJson as string, actorId) !== locationId
    ) return [];
    const eventSource = parseJson(
      row.eventSourceJson as string,
      "Actor-visible event source",
    ) as Record<string, unknown>;
    const source: CampaignPlayEpistemicSource = {
      channel: "direct_perception",
      locationId,
      perceivedActorId: eventSource.kind === "actor" && typeof eventSource.actorId === "string"
        ? eventSource.actorId
        : null,
    };
    return [{
      ...row,
      knowledgeId: `turn-knowledge:${hashCampaignPlayProjection({
        campaignId: handle.campaignId,
        actorId,
        eventId: row.eventId,
        exposureId: row.exposureId,
        source,
      }).slice(0, 32)}`,
      sourceJson: canonicalizeCampaignPlayProjection(source),
      learnedAtWorldTimeMinutes: row.eventWorldTimeMinutes,
    }];
  });
}

export function createCampaignPlayActorScheduler(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayActorScheduler {
  const stateRepository = createCampaignPlayStateRepository(handle);
  const freezeActorDueSet = (
    input: FreezeCampaignPlayActorDueSetInput,
    requiredTurnKind: "opening" | "player_action",
  ): CampaignPlayActorDueSet => {
    const state = stateRepository.loadState();
    if (!state || state.authority.setupPhase !== "ready"
      || state.authority.worldTimeMinutes === null) {
      throw new CampaignPlayActorSchedulerError("scheduler_state_invalid");
    }
    if (state.authority.worldVersion !== input.expectedWorldVersion
      || state.authority.runtimeRevision !== input.expectedRuntimeRevision) {
      throw new CampaignPlayActorSchedulerError("scheduler_due_set_stale");
    }
    const turn = handle.sqlite.prepare(`SELECT stage, turn_kind AS turnKind
      FROM campaign_play_turns WHERE id = ? AND campaign_id = ?`).get(
        input.turnId,
        handle.campaignId,
      ) as { stage: string; turnKind: string } | undefined;
    if (turn?.stage !== "primary_settled" || turn.turnKind !== requiredTurnKind) {
      throw new CampaignPlayActorSchedulerError("scheduler_turn_invalid");
    }
    let actorOpportunities = 0;
    const decisions = dueRows(
      handle,
      input.turnId,
      state.authority.worldTimeMinutes,
    ).map((row, dueOrder) => {
      const decision = makeDecision(
        handle.campaignId,
        input.turnId,
        state.authority.worldTimeMinutes!,
        row,
        dueOrder,
        actorOpportunities < CAMPAIGN_PLAY_LIMITS.actorOpportunitiesPerTurn,
      );
      if (decision.disposition === "wake") actorOpportunities += 1;
      return decision;
    });
    const dueSet = campaignPlayActorDueSetSchema.parse({
      campaignId: handle.campaignId,
      turnId: input.turnId,
      settledWorldTimeMinutes: state.authority.worldTimeMinutes,
      baseWorldVersion: state.authority.worldVersion,
      baseRuntimeRevision: state.authority.runtimeRevision,
      decisions,
    });
    dueSetSeals.set(dueSet, dueSetSeal(dueSet));
    return freeze(dueSet);
  };

  return {
    initializeOpeningActors(input) {
      if (
        !Number.isSafeInteger(input.createdAt) || input.createdAt < 0 ||
        input.context.campaignId !== handle.campaignId ||
        input.context.sqlite !== handle.sqlite
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
      }
      const plans = input.plans.map((plan) => campaignPlayActorPlanSchema.parse(plan))
        .sort((left, right) => compareText(left.actorId, right.actorId));
      const schedules = input.schedules
        .map((schedule) => campaignPlayActorScheduleSchema.parse(schedule))
        .sort((left, right) => compareText(left.actorId, right.actorId));
      const planActorIds = plans.map((plan) => plan.actorId);
      const scheduleActorIds = schedules.map((schedule) => schedule.actorId);
      const eligibleActorIds = (handle.sqlite.prepare(`SELECT id FROM actors
        WHERE campaign_id = ? AND controller = 'agent' AND kind = 'person'
        ORDER BY id`).all(handle.campaignId) as Array<{ id: string }>).map((row) => row.id);
      if (
        plans.length === 0 || plans.length !== schedules.length ||
        new Set(planActorIds).size !== plans.length ||
        new Set(scheduleActorIds).size !== schedules.length ||
        canonicalizeCampaignPlayProjection(planActorIds) !==
          canonicalizeCampaignPlayProjection(eligibleActorIds) ||
        canonicalizeCampaignPlayProjection(scheduleActorIds) !==
          canonicalizeCampaignPlayProjection(eligibleActorIds)
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
      }
      const planByActor = new Map(plans.map((plan) => [plan.actorId, plan]));
      for (const plan of plans) {
        if (
          plan.campaignId !== handle.campaignId || plan.planVersion !== 1 ||
          plan.status !== "active"
        ) {
          throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
        }
      }
      for (const schedule of schedules) {
        const plan = planByActor.get(schedule.actorId);
        if (
          schedule.campaignId !== handle.campaignId || !plan ||
          schedule.planId !== plan.planId || schedule.priority !== plan.priority ||
          schedule.lastActAtWorldTimeMinutes !== null || schedule.agencyDebt !== 0
        ) {
          throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
        }
      }
      const existing = handle.sqlite.prepare(`SELECT
        (SELECT count(*) FROM campaign_play_actor_plans WHERE campaign_id = ?) AS plans,
        (SELECT count(*) FROM campaign_play_actor_schedules WHERE campaign_id = ?) AS schedules
      `).get(handle.campaignId, handle.campaignId) as { plans: number; schedules: number };
      if (existing.plans !== 0 || existing.schedules !== 0) {
        throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
      }
      for (const plan of plans) {
        handle.sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
          plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
          preconditions_json, cadence_minutes, priority, steps_json, status,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            plan.planId, handle.campaignId, plan.actorId, plan.goalId, plan.planVersion,
            canonicalizeCampaignPlayProjection(plan.intent),
            canonicalizeCampaignPlayProjection(plan.preconditions), plan.cadenceMinutes,
            plan.priority, canonicalizeCampaignPlayProjection(plan.steps), plan.status,
            input.createdAt, input.createdAt,
          );
      }
      for (const schedule of schedules) {
        handle.sqlite.prepare(`INSERT INTO campaign_play_actor_schedules (
          schedule_id, campaign_id, actor_id, plan_id,
          next_act_at_world_time_minutes, last_act_at_world_time_minutes,
          priority, agency_debt, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(
            schedule.scheduleId, handle.campaignId, schedule.actorId, schedule.planId,
            schedule.nextActAtWorldTimeMinutes, schedule.lastActAtWorldTimeMinutes,
            schedule.priority, schedule.agencyDebt, input.createdAt, input.createdAt,
          );
      }
      const storedPlans = (handle.sqlite.prepare(`SELECT
        plan_id AS planId, campaign_id AS campaignId, actor_id AS actorId,
        goal_id AS goalId, plan_version AS planVersion, intent_json AS intentJson,
        preconditions_json AS preconditionsJson, cadence_minutes AS cadenceMinutes,
        priority, steps_json AS stepsJson, status
        FROM campaign_play_actor_plans WHERE campaign_id = ? ORDER BY actor_id`)
        .all(handle.campaignId) as Parameters<typeof planFromRow>[0][]).map(planFromRow);
      const storedSchedules = (handle.sqlite.prepare(`SELECT
        schedule_id AS scheduleId, campaign_id AS campaignId, actor_id AS actorId,
        plan_id AS planId, next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
        last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes,
        priority, agency_debt AS agencyDebt
        FROM campaign_play_actor_schedules WHERE campaign_id = ? ORDER BY actor_id`)
        .all(handle.campaignId) as CampaignPlayActorSchedule[])
        .map((schedule) => campaignPlayActorScheduleSchema.parse(schedule));
      if (
        canonicalizeCampaignPlayProjection(storedPlans) !==
          canonicalizeCampaignPlayProjection(plans) ||
        canonicalizeCampaignPlayProjection(storedSchedules) !==
          canonicalizeCampaignPlayProjection(schedules)
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
      }
      return freeze({ plans: storedPlans, schedules: storedSchedules });
    },

    validateOpeningActors(input) {
      if (
        input.turnId.length === 0 || input.context.campaignId !== handle.campaignId ||
        input.context.sqlite !== handle.sqlite
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
      }
      const expectedPlans = input.plans.map((plan) => campaignPlayActorPlanSchema.parse(plan))
        .sort((left, right) => compareText(left.actorId, right.actorId));
      const expectedSchedules = input.schedules
        .map((schedule) => campaignPlayActorScheduleSchema.parse(schedule))
        .sort((left, right) => compareText(left.actorId, right.actorId));
      const storedPlans = (handle.sqlite.prepare(`SELECT
        plan_id AS planId, campaign_id AS campaignId, actor_id AS actorId,
        goal_id AS goalId, plan_version AS planVersion, intent_json AS intentJson,
        preconditions_json AS preconditionsJson, cadence_minutes AS cadenceMinutes,
        priority, steps_json AS stepsJson, status
        FROM campaign_play_actor_plans WHERE campaign_id = ? ORDER BY actor_id`)
        .all(handle.campaignId) as Parameters<typeof planFromRow>[0][]).map(planFromRow);
      const storedSchedules = (handle.sqlite.prepare(`SELECT
        schedule_id AS scheduleId, campaign_id AS campaignId, actor_id AS actorId,
        plan_id AS planId, next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
        last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes,
        priority, agency_debt AS agencyDebt
        FROM campaign_play_actor_schedules WHERE campaign_id = ? ORDER BY actor_id`)
        .all(handle.campaignId) as CampaignPlayActorSchedule[])
        .map((schedule) => campaignPlayActorScheduleSchema.parse(schedule));
      const activity = handle.sqlite.prepare(`SELECT
        (SELECT count(*) FROM campaign_play_actor_jobs
          WHERE campaign_id = ? AND turn_id = ?) AS jobs,
        (SELECT count(*) FROM campaign_play_actor_proposals proposal
          JOIN campaign_play_actor_jobs job ON job.job_id = proposal.job_id
          WHERE proposal.campaign_id = ? AND job.turn_id = ?) AS proposals,
        (SELECT count(*) FROM campaign_play_commands
          WHERE campaign_id = ? AND turn_id = ?
            AND json_extract(causal_parent_json, '$.kind') = 'actor_job') AS actorCommands
      `).get(
        handle.campaignId, input.turnId,
        handle.campaignId, input.turnId,
        handle.campaignId, input.turnId,
      ) as { jobs: number; proposals: number; actorCommands: number };
      if (
        canonicalizeCampaignPlayProjection(storedPlans) !==
          canonicalizeCampaignPlayProjection(expectedPlans) ||
        canonicalizeCampaignPlayProjection(storedSchedules) !==
          canonicalizeCampaignPlayProjection(expectedSchedules) ||
        activity.jobs !== 0 || activity.proposals !== 0 || activity.actorCommands !== 0
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_opening_invalid");
      }
      return freeze({ plans: storedPlans, schedules: storedSchedules });
    },

    freezeOpeningDueSet(input) {
      return freezeActorDueSet(input, "opening");
    },

    freezeDueSet(input) {
      return freezeActorDueSet(input, "player_action");
    },

    admitDueSet(input) {
      requireSealedDueSet(input.dueSet);
      if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0
        || input.context.campaignId !== handle.campaignId
        || input.dueSet.campaignId !== handle.campaignId) {
        throw new CampaignPlayActorSchedulerError("scheduler_due_set_invalid");
      }
      if (input.context.priorWorldVersion !== input.dueSet.baseWorldVersion
        || input.context.priorRuntimeRevision !== input.dueSet.baseRuntimeRevision) {
        throw new CampaignPlayActorSchedulerError("scheduler_due_set_stale");
      }
      const authority = handle.sqlite.prepare(`SELECT world_time_minutes AS worldTimeMinutes
        FROM campaign_play_states WHERE campaign_id = ?`).get(handle.campaignId) as {
        worldTimeMinutes: number | null;
      } | undefined;
      const turn = handle.sqlite.prepare(`SELECT stage FROM campaign_play_turns
        WHERE id = ? AND campaign_id = ?`).get(
        input.dueSet.turnId,
        handle.campaignId,
      ) as { stage: string } | undefined;
      if (authority?.worldTimeMinutes !== input.dueSet.settledWorldTimeMinutes
        || turn?.stage !== "primary_settled") {
        throw new CampaignPlayActorSchedulerError("scheduler_due_set_stale");
      }
      const decisionsJson = canonicalizeCampaignPlayProjection(input.dueSet.decisions);
      try {
        handle.sqlite.prepare(`
          INSERT INTO campaign_play_actor_due_sets (
            turn_id, campaign_id, settled_world_time_minutes,
            base_world_version, base_runtime_revision, decisions_json,
            due_set_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          input.dueSet.turnId,
          handle.campaignId,
          input.dueSet.settledWorldTimeMinutes,
          input.dueSet.baseWorldVersion,
          input.dueSet.baseRuntimeRevision,
          decisionsJson,
          dueSetSeal(input.dueSet),
          input.createdAt,
        );
      } catch (cause) {
        throw new CampaignPlayActorSchedulerError("scheduler_due_set_invalid", { cause });
      }
      for (const decision of input.dueSet.decisions) {
        if (decision.disposition === "skip") continue;
        handle.sqlite.prepare(`
          INSERT INTO campaign_play_actor_jobs (
            job_id, campaign_id, turn_id, actor_id, admitted_plan_id, plan_id, due_reason,
            frozen_base_world_version, worker_epoch, claim_turn_worker_epoch,
            stage, proposal_id,
            defer_reason, created_at, completed_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, NULL, NULL, ?, ?)
        `).run(
          decision.jobId,
          handle.campaignId,
          input.dueSet.turnId,
          decision.actorId,
          decision.planId,
          decision.planId,
          decision.dueReason,
          input.dueSet.baseWorldVersion,
          "queued",
          input.createdAt,
          null,
        );
        if (decision.disposition === "defer") {
          handle.sqlite.prepare(`UPDATE campaign_play_actor_jobs
            SET stage = 'deferred', defer_reason = ?, completed_at = ?
            WHERE job_id = ? AND campaign_id = ? AND stage = 'queued'`).run(
              decision.reason,
              input.createdAt,
            decision.jobId,
            handle.campaignId,
          );
          const update = handle.sqlite.prepare(`
            UPDATE campaign_play_actor_schedules SET
              next_act_at_world_time_minutes = ?, agency_debt = ?, updated_at = ?
            WHERE schedule_id = ? AND campaign_id = ? AND actor_id = ?
              AND plan_id = ? AND next_act_at_world_time_minutes = ?
              AND priority = ? AND agency_debt = ?
          `).run(
            decision.nextDueAtWorldTimeMinutes,
            decision.resultAgencyDebt,
            input.createdAt,
            decision.scheduleId,
            handle.campaignId,
            decision.actorId,
            decision.planId,
            decision.nextActAtWorldTimeMinutes,
            decision.priority,
            decision.agencyDebt,
          );
          if (update.changes !== 1) {
            throw new CampaignPlayActorSchedulerError("scheduler_due_set_stale");
          }
        }
      }
      return this.listTurnJobs(input.dueSet.turnId);
    },

    loadDueSet(turnId) {
      const row = handle.sqlite.prepare(`
        SELECT campaign_id AS campaignId, turn_id AS turnId,
          settled_world_time_minutes AS settledWorldTimeMinutes,
          base_world_version AS baseWorldVersion,
          base_runtime_revision AS baseRuntimeRevision,
          decisions_json AS decisionsJson, due_set_hash AS dueSetHash
        FROM campaign_play_actor_due_sets
        WHERE campaign_id = ? AND turn_id = ?
      `).get(handle.campaignId, turnId) as Parameters<typeof parseStoredDueSet>[0] | undefined;
      if (!row) return null;
      try {
        return parseStoredDueSet(row);
      } catch (cause) {
        if (cause instanceof CampaignPlayActorSchedulerError) throw cause;
        throw new CampaignPlayActorSchedulerError("scheduler_due_set_invalid", { cause });
      }
    },

    listTurnJobs(turnId) {
      const rows = handle.sqlite.prepare(`
        SELECT j.job_id AS jobId, j.campaign_id AS campaignId, j.turn_id AS turnId,
          j.actor_id AS actorId, j.admitted_plan_id AS admittedPlanId,
          j.plan_id AS planId, j.due_reason AS dueReason,
          j.frozen_base_world_version AS frozenBaseWorldVersion,
          j.worker_epoch AS workerEpoch,
          j.claim_turn_worker_epoch AS claimTurnWorkerEpoch,
          j.stage, j.proposal_id AS proposalId,
          j.defer_reason AS deferReason,
          j.created_at AS createdAt, j.completed_at AS completedAt
        FROM campaign_play_actor_jobs j
        JOIN campaign_play_actor_schedules s ON s.actor_id = j.actor_id
        WHERE j.campaign_id = ? AND j.turn_id = ?
        ORDER BY j.created_at ASC, j.job_id ASC
      `).all(handle.campaignId, turnId) as JobRow[];
      const jobs = rows.map(rowToJob);
      const dueSet = this.loadDueSet(turnId);
      if (!dueSet) return freeze(jobs);
      const order = new Map(dueSet.decisions.flatMap((decision) =>
        decision.disposition === "skip" ? [] : [[decision.jobId, decision.dueOrder] as const]));
      if (jobs.some((job) => !order.has(job.jobId))) {
        throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
      }
      jobs.sort((left, right) => order.get(left.jobId)! - order.get(right.jobId)!);
      return freeze(jobs);
    },

    validateTurnSettlement(turnId, context) {
      const dueSet = this.loadDueSet(turnId);
      if (!dueSet) throw new CampaignPlayActorSchedulerError("scheduler_due_set_invalid");
      const jobs = this.listTurnJobs(turnId);
      const jobsById = new Map(jobs.map((job) => [job.jobId, job]));
      const expectedJobIds = dueSet.decisions.flatMap((decision) =>
        decision.disposition === "skip" ? [] : [decision.jobId]);
      if (
        jobs.length !== expectedJobIds.length ||
        new Set(expectedJobIds).size !== expectedJobIds.length ||
        expectedJobIds.some((jobId) => !jobsById.has(jobId))
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
      }
      let expectedWorldVersion = dueSet.baseWorldVersion;
      for (const decision of dueSet.decisions) {
        if (decision.disposition === "skip") continue;
        const job = jobsById.get(decision.jobId)!;
        if (
          job.actorId !== decision.actorId || job.admittedPlanId !== decision.planId ||
          job.dueReason !== decision.dueReason ||
          job.frozenBaseWorldVersion !== dueSet.baseWorldVersion ||
          !["settled", "rejected", "deferred"].includes(job.stage)
        ) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        const schedulePair = handle.sqlite.prepare(`SELECT
            schedule.plan_id AS planId, plan.actor_id AS planActorId
          FROM campaign_play_actor_schedules schedule
          JOIN campaign_play_actor_plans plan
            ON plan.campaign_id = schedule.campaign_id AND plan.plan_id = schedule.plan_id
          WHERE schedule.campaign_id = ? AND schedule.actor_id = ?`).get(
            handle.campaignId,
            job.actorId,
          ) as { planId: string; planActorId: string } | undefined;
        if (!schedulePair || schedulePair.planActorId !== job.actorId) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        const acceptedReplan = handle.sqlite.prepare(`SELECT artifact_json AS artifactJson
          FROM campaign_play_model_stages
          WHERE campaign_id = ? AND turn_id = ? AND stage_id = ?
            AND kind = 'actor_replanner' AND status = 'accepted'`).get(
            handle.campaignId,
            turnId,
            deriveCampaignPlayActorReplanStageId(job.jobId),
          ) as { artifactJson: string } | undefined;
        let replanned: CampaignPlayActorPlan | null = null;
        if (acceptedReplan) {
          try {
            replanned = campaignPlayActorPlanSchema.parse(
              JSON.parse(acceptedReplan.artifactJson),
            );
          } catch (cause) {
            throw new CampaignPlayActorSchedulerError("scheduler_job_invalid", { cause });
          }
        }
        if (job.planId !== decision.planId) {
          if (
            !replanned || replanned.actorId !== job.actorId ||
            replanned.planId !== job.planId || schedulePair.planId !== replanned.planId
          ) {
            throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
          }
        } else if (replanned !== null) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        const proposalRows = handle.sqlite.prepare(`SELECT proposal_id AS proposalId, status,
            result_json AS resultJson, result_hash AS resultHash,
            commands_json AS commandsJson, commands_hash AS commandsHash, batch_id AS batchId,
            base_world_version AS baseWorldVersion
          FROM campaign_play_actor_proposals
          WHERE campaign_id = ? AND job_id = ? ORDER BY proposal_id`).all(
            handle.campaignId,
            job.jobId,
          ) as Array<{
            proposalId: string;
            status: string;
            resultJson: string;
            resultHash: string;
            commandsJson: string;
            commandsHash: string;
            batchId: string;
            baseWorldVersion: number;
          }>;
        if (job.stage === "deferred") {
          const expectedDeferReason = decision.disposition === "defer"
            ? decision.reason
            : "replan_capacity";
          if (
            proposalRows.length !== 0 || job.proposalId !== null ||
            job.deferReason !== expectedDeferReason || replanned !== null ||
            job.planId !== decision.planId
          ) {
            throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
          }
          continue;
        }
        if (job.deferReason !== null || decision.disposition !== "wake") {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        const proposal = proposalRows[0];
        if (
          proposalRows.length !== 1 || !proposal || proposal.proposalId !== job.proposalId ||
          proposal.status !== (job.stage === "settled" ? "accepted" : "rejected")
        ) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        if (proposal.baseWorldVersion !== expectedWorldVersion) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        let result: unknown;
        let commands: unknown;
        try {
          result = JSON.parse(proposal.resultJson) as unknown;
          commands = JSON.parse(proposal.commandsJson) as unknown;
        } catch (cause) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid", { cause });
        }
        if (
          canonicalizeCampaignPlayProjection(result) !== proposal.resultJson ||
          canonicalizeCampaignPlayProjection(commands) !== proposal.commandsJson ||
          hashCampaignPlayProjection(result) !== proposal.resultHash ||
          hashCampaignPlayProjection(commands) !== proposal.commandsHash ||
          !Array.isArray(commands)
        ) {
          throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
        }
        if (job.stage === "settled") {
          const receiptIds = typeof result === "object" && result !== null &&
              "receiptIds" in result && Array.isArray(result.receiptIds)
            ? result.receiptIds
            : null;
          if (
            receiptIds === null || receiptIds.length !== commands.length ||
            receiptIds.some((receiptId) => typeof receiptId !== "string") ||
            new Set(receiptIds).size !== receiptIds.length
          ) {
            throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
          }
          const ledger = handle.sqlite.prepare(`SELECT
              (SELECT count(*) FROM campaign_play_commands
                WHERE campaign_id = ? AND batch_id = ?) AS commandCount,
              (SELECT count(*) FROM campaign_play_receipts receipt
                JOIN campaign_play_commands command ON command.command_id = receipt.command_id
                WHERE receipt.campaign_id = ? AND command.batch_id = ?) AS receiptCount
            `).get(
              handle.campaignId, proposal.batchId,
              handle.campaignId, proposal.batchId,
            ) as { commandCount: number; receiptCount: number };
          if (ledger.commandCount !== commands.length || ledger.receiptCount !== receiptIds.length) {
            throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
          }
          for (const receiptId of receiptIds) {
            const receipt = handle.sqlite.prepare(`SELECT
                prior_world_version AS priorWorldVersion,
                result_world_version AS resultWorldVersion
              FROM campaign_play_receipts
              WHERE campaign_id = ? AND receipt_id = ?`).get(
                handle.campaignId,
                receiptId,
              ) as { priorWorldVersion: number; resultWorldVersion: number } | undefined;
            if (
              !receipt || receipt.priorWorldVersion !== expectedWorldVersion ||
              receipt.resultWorldVersion < receipt.priorWorldVersion ||
              receipt.resultWorldVersion > receipt.priorWorldVersion + 1
            ) {
              throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
            }
            expectedWorldVersion = receipt.resultWorldVersion;
          }
        }
      }
      const authorityWorldVersion = context
        ? (handle.sqlite.prepare(`SELECT world_version AS worldVersion
            FROM campaign_play_states WHERE campaign_id = ?`).get(
              handle.campaignId,
            ) as { worldVersion: number } | undefined)?.worldVersion
        : stateRepository.loadState()?.authority.worldVersion;
      if (
        authorityWorldVersion !== expectedWorldVersion ||
        (context !== undefined && (
          context.campaignId !== handle.campaignId ||
          context.priorWorldVersion !== expectedWorldVersion ||
          context.targetWorldVersion !== expectedWorldVersion
        ))
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
      }
      const unsettledModels = handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner' AND status = 'started'`).get(
          handle.campaignId,
          turnId,
        ) as { count: number };
      const pendingProposals = handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_actor_proposals proposal
        JOIN campaign_play_actor_jobs job ON job.job_id = proposal.job_id
        WHERE proposal.campaign_id = ? AND job.turn_id = ? AND proposal.status = 'pending'`).get(
          handle.campaignId,
          turnId,
        ) as { count: number };
      const acceptedReplans = handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_model_stages
        WHERE campaign_id = ? AND turn_id = ?
          AND kind = 'actor_replanner' AND status = 'accepted'`).get(
            handle.campaignId,
            turnId,
          ) as { count: number };
      if (
        unsettledModels.count !== 0 || pendingProposals.count !== 0 ||
        acceptedReplans.count > 1
      ) {
        throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
      }
      return jobs;
    },

    buildActorFrame(jobId) {
      const state = stateRepository.loadState();
      if (!state || state.authority.setupPhase !== "ready"
        || state.authority.worldTimeMinutes === null) {
        throw new CampaignPlayActorSchedulerError("scheduler_state_invalid");
      }
      const job = handle.sqlite.prepare(`
        SELECT job_id AS jobId, campaign_id AS campaignId, turn_id AS turnId,
          actor_id AS actorId, admitted_plan_id AS admittedPlanId,
          plan_id AS planId, due_reason AS dueReason,
          frozen_base_world_version AS frozenBaseWorldVersion,
          worker_epoch AS workerEpoch,
          claim_turn_worker_epoch AS claimTurnWorkerEpoch,
          stage, proposal_id AS proposalId,
          defer_reason AS deferReason,
          created_at AS createdAt, completed_at AS completedAt
        FROM campaign_play_actor_jobs WHERE job_id = ? AND campaign_id = ?
      `).get(jobId, handle.campaignId) as JobRow | undefined;
      if (!job || !["queued", "claimed", "interrupted", "proposed"].includes(job.stage)) {
        throw new CampaignPlayActorSchedulerError("scheduler_job_invalid");
      }
      const planRow = handle.sqlite.prepare(`
        SELECT plan_id AS planId, campaign_id AS campaignId, actor_id AS actorId,
          goal_id AS goalId, plan_version AS planVersion, intent_json AS intentJson,
          preconditions_json AS preconditionsJson, cadence_minutes AS cadenceMinutes,
          priority, steps_json AS stepsJson, status
        FROM campaign_play_actor_plans WHERE plan_id = ? AND campaign_id = ?
      `).get(job.planId, handle.campaignId) as Parameters<typeof planFromRow>[0] | undefined;
      if (!planRow || planRow.actorId !== job.actorId) {
        throw new CampaignPlayActorSchedulerError("scheduler_frame_invalid");
      }
      const plan = planFromRow(planRow);
      const actor = state.acceptedReview.actors.find((candidate) => candidate.id === job.actorId);
      if (!actor || actor.controller !== "agent") {
        throw new CampaignPlayActorSchedulerError("scheduler_frame_invalid");
      }
      const placements = handle.sqlite.prepare(`SELECT id, actor_id AS actorId,
        location_id AS locationId, placement_kind AS placementKind
        FROM actor_placements WHERE campaign_id = ? AND actor_id = ? ORDER BY id`).all(
        handle.campaignId,
        actor.id,
      ) as CampaignWorldReview["placements"];
      const operativeLocations = new Set(
        placements.filter((placement) => placement.placementKind === "present")
          .map((placement) => placement.locationId),
      );
      const goals = state.acceptedReview.goals.filter((goal) => goal.actorId === actor.id)
        .map((goal) => {
          const live = handle.sqlite.prepare(`SELECT status, priority, objective, motivation
            FROM actor_goals WHERE campaign_id = ? AND id = ?`).get(
            handle.campaignId,
            goal.id,
          ) as Pick<typeof goal, "status" | "priority" | "objective" | "motivation"> | undefined;
          return live ? { ...goal, ...live } : goal;
        }).sort((left, right) => compareText(left.id, right.id));
      const relations = state.acceptedReview.relations.filter((relation) =>
        relation.sourceActorId === actor.id || relation.targetActorId === actor.id)
        .map((relation) => {
          const live = handle.sqlite.prepare(`SELECT intensity, summary FROM actor_relations
            WHERE campaign_id = ? AND id = ?`).get(
            handle.campaignId,
            relation.id,
          ) as Pick<typeof relation, "intensity" | "summary"> | undefined;
          return live ? { ...relation, ...live } : relation;
        }).sort((left, right) => compareText(left.id, right.id));
      const conditions = handle.sqlite.prepare(`SELECT condition, summary
        FROM campaign_play_actor_conditions
        WHERE campaign_id = ? AND actor_id = ? AND present = 1 ORDER BY condition`).all(
        handle.campaignId,
        actor.id,
      ) as CampaignPlayActorFrame["conditions"];
      const localRoutes = state.acceptedReview.routes.filter((route) =>
        operativeLocations.has(route.fromLocationId) || operativeLocations.has(route.toLocationId))
        .map((route) => {
          const live = handle.sqlite.prepare(`SELECT state FROM campaign_play_route_states
            WHERE campaign_id = ? AND route_id = ?`).get(
            handle.campaignId,
            route.id,
          ) as { state: "open" | "restricted" | "blocked" } | undefined;
          return { ...route, state: live?.state ?? "open" };
        }).sort((left, right) => compareText(left.id, right.id));
      const knownPressures = state.acceptedReview.pressures.filter((pressure) =>
        pressure.actorIds.includes(actor.id)
        || pressure.locationIds.some((locationId) => operativeLocations.has(locationId)))
        .map((pressure) => {
          const live = handle.sqlite.prepare(`SELECT progress, status
            FROM campaign_play_pressure_states WHERE campaign_id = ? AND pressure_id = ?`).get(
            handle.campaignId,
            pressure.id,
          ) as { progress: number; status: "active" | "resolved" } | undefined;
          return { ...pressure, progress: live?.progress ?? 0, status: live?.status ?? "active" };
        }).sort((left, right) => compareText(left.id, right.id));
      const knowledgeRows = handle.sqlite.prepare(`
        SELECT k.knowledge_id AS knowledgeId, k.event_id AS eventId,
          k.exposure_id AS exposureId, k.source_json AS sourceJson,
          k.learned_at_world_time_minutes AS learnedAtWorldTimeMinutes,
          e.event_kind AS eventKind, e.world_time_minutes AS eventWorldTimeMinutes,
          e.world_version AS eventWorldVersion, e.affected_refs_json AS affectedRefsJson,
          e.before_payload_json AS beforePayloadJson, e.after_payload_json AS afterPayloadJson,
          c.command_kind AS commandKind, c.protected_payload_json AS protectedPayloadJson
        FROM campaign_play_actor_knowledge k
        JOIN campaign_play_events e ON e.event_id = k.event_id
        JOIN campaign_play_commands c ON c.command_id = e.command_id
        WHERE k.campaign_id = ? AND k.actor_id = ?
        ORDER BY k.learned_at_world_time_minutes DESC, k.knowledge_id DESC
        LIMIT ?
      `).all(
        handle.campaignId,
        actor.id,
        CAMPAIGN_PLAY_LIMITS.continuityEntries,
      ).reverse() as Array<Record<string, unknown>>;
      const knownEventRows = [
        ...knowledgeRows,
        ...currentTurnDirectPerceptionRows(handle, job.turnId, actor.id),
      ].sort((left, right) => {
        const time = (left.learnedAtWorldTimeMinutes as number) -
          (right.learnedAtWorldTimeMinutes as number);
        return time !== 0
          ? time
          : compareText(left.knowledgeId as string, right.knowledgeId as string);
      }).slice(-CAMPAIGN_PLAY_LIMITS.continuityEntries);
      const knownEvents = knownEventRows.map((row): CampaignPlayActorKnownEvent => ({
        knowledgeId: row.knowledgeId as string,
        eventId: row.eventId as string,
        exposureId: row.exposureId as string,
        source: parseKnowledgeSource(row),
        learnedAtWorldTimeMinutes: row.learnedAtWorldTimeMinutes as number,
        summary: knownEventSummary(row),
        event: {
          kind: row.eventKind as string,
          worldTimeMinutes: row.eventWorldTimeMinutes as number,
          worldVersion: row.eventWorldVersion as number,
          affectedRefs: parseJson(row.affectedRefsJson as string, "Known event affected refs") as CampaignPlayEntityRef[],
          before: parseJson(row.beforePayloadJson as string, "Known event prior payload") as Record<string, unknown>,
          after: parseJson(row.afterPayloadJson as string, "Known event result payload") as Record<string, unknown>,
        },
      }));
      const failedPreconditionIndexes = plan.preconditions.flatMap((precondition, index) =>
        preconditionSatisfied(handle, precondition) ? [] : [index]);
      const settledStepCount = (handle.sqlite.prepare(`SELECT count(*) AS count
        FROM campaign_play_actor_jobs WHERE campaign_id = ? AND actor_id = ?
          AND plan_id = ? AND stage = 'settled'`).get(
        handle.campaignId,
        actor.id,
        plan.planId,
      ) as { count: number }).count;
      const selection = selectCampaignPlayActorPlanStep({
        plan,
        settledStepCount,
        failedPreconditionIndexes,
      });
      const authorizedRefs = uniqueRefs([
        { kind: "actor", id: actor.id },
        ...placements.map((placement) => ({ kind: "location" as const, id: placement.locationId })),
        ...goals.map((goal) => ({ kind: "goal" as const, id: goal.id })),
        ...relations.flatMap((relation) => [
          { kind: "relation" as const, id: relation.id },
          { kind: "actor" as const, id: relation.sourceActorId },
          { kind: "actor" as const, id: relation.targetActorId },
        ]),
        ...localRoutes.map((route) => ({ kind: "route" as const, id: route.id })),
        ...knownPressures.map((pressure) => ({ kind: "pressure" as const, id: pressure.id })),
        ...knownEvents.map((event) => ({ kind: "world_event" as const, id: event.eventId })),
        ...plan.intent.targets,
        ...plan.steps.flatMap((step) => step.intent.targets),
      ]);
      return freeze({
        campaignId: handle.campaignId,
        turnId: job.turnId,
        jobId: job.jobId,
        actorId: actor.id,
        baseWorldVersion: state.authority.worldVersion,
        worldTimeMinutes: state.authority.worldTimeMinutes,
        actor,
        plan,
        selection,
        placements,
        goals,
        relations,
        conditions,
        localRoutes,
        knownPressures,
        knownEvents,
        authorizedRefs,
      });
    },
  };
}
