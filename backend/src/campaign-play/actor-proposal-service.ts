import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";
import {
  CAMPAIGN_PLAY_COMMAND_METADATA,
  campaignPlayActorProposalSchema,
  type CampaignPlayActorJob,
  type CampaignPlayActorProposal,
  type CampaignPlayEntityRef,
  type CampaignPlayExposurePolicy,
  type RulebookBatchCommand,
} from "./contracts.js";
import {
  calculateCampaignPlayActorNextDueTime,
  createCampaignPlayActorScheduler,
  type CampaignPlayActorFrame,
} from "./actor-scheduler.js";
import type { CampaignPlayOpeningExposureSeed } from "./opening-planner.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  type CampaignPlayHumanMechanicalIdentity,
  type CampaignPlayLiveActorCondition,
  type CampaignPlayLiveActorPossession,
  type CampaignPlayLiveGoal,
  type CampaignPlayLivePlacement,
  type CampaignPlayLivePressureState,
  type CampaignPlayLiveRelation,
  type CampaignPlayLiveRouteState,
} from "./campaign-play-projection.js";
import {
  createCampaignPlayStateRepository,
  type CampaignPlayMutationContext,
} from "./campaign-play-state-repository.js";
import {
  createCampaignPlayTurnRepository,
  type CampaignPlayWorkerLeaseToken,
} from "./campaign-play-turn-repository.js";
import {
  deriveCampaignPlayCommandId,
  executeCampaignPlayRulebookBatch,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookAuthority,
  type CampaignPlayRulebookDenialCode,
  type CampaignPlayRulebookFaultPoint,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";

const MAX_WORLD_TIME_MINUTES = CAMPAIGN_PLAY_LIMITS.worldTimeMinutes;
const ACTOR_AFTERMATH_VISIBILITY_MINUTES = 1_440;

export type CampaignPlayActorProposalOutcome =
  | { kind: "settled"; jobId: string; proposalId: string; receiptIds: string[]; resultWorldVersion: number }
  | { kind: "rejected"; jobId: string; proposalId: string; reason: CampaignPlayActorProposalRejectionReason }
  | { kind: "deferred"; jobId: string; reason: "replan_capacity" }
  | { kind: "replan_required"; jobId: string; reason: "plan_inactive" | "plan_exhausted" | "precondition_failed"; failedPreconditionIndexes: number[] };

type CampaignPlayActorProposalRejectionReason =
  | "stale_world_version"
  | "precondition_failed"
  | "scope_denied"
  | "command_denied"
  | "expired";

export interface ProcessCampaignPlayActorProposalsInput {
  turnId: string;
  token: CampaignPlayWorkerLeaseToken;
  createdAt: number;
  openingExposureSeed: CampaignPlayOpeningExposureSeed;
  beforeSettlement?: (proposal: CampaignPlayActorProposal) => void;
  injectFault?: (
    point: "after_job_claim" | "after_proposal_persisted" | "before_proposal_commit",
    jobId: string,
  ) => void;
  injectRulebookFault?: (point: CampaignPlayRulebookFaultPoint) => void;
}

export interface CampaignPlayActorProposalService {
  processNext(
    input: ProcessCampaignPlayActorProposalsInput,
  ): CampaignPlayActorProposalOutcome | null;
  deferReplan(input: {
    jobId: string;
    token: CampaignPlayWorkerLeaseToken;
    createdAt: number;
  }): Extract<CampaignPlayActorProposalOutcome, { kind: "deferred" }>;
}

export class CampaignPlayActorProposalServiceError extends Error {
  constructor(
    readonly code: "proposal_input_invalid" | "proposal_state_invalid" | "proposal_rulebook_denied",
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = "CampaignPlayActorProposalServiceError";
  }
}

interface CampaignPlayActorProposalServiceDependencies {
  now: () => number;
}

interface ScheduleRow {
  scheduleId: string;
  planId: string;
  nextActAtWorldTimeMinutes: number;
  lastActAtWorldTimeMinutes: number | null;
  priority: number;
  agencyDebt: number;
  cadenceMinutes: number;
}

function requireTurnLease(
  handle: CampaignPlayDatabaseHandle,
  token: CampaignPlayWorkerLeaseToken,
  observedAt: number,
): void {
  const owned = handle.sqlite.prepare(`
    SELECT 1 AS owned FROM campaign_play_turns
    WHERE id = ? AND campaign_id = ? AND stage = 'primary_settled'
      AND worker_lease_owner = ? AND worker_epoch = ?
      AND worker_lease_expires_at = ?
  `).get(
    token.turnId,
    handle.campaignId,
    token.owner,
    token.epoch,
    token.expiresAt,
  ) as { owned: number } | undefined;
  if (!owned || token.stage !== "primary_settled" || observedAt >= token.expiresAt) {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  }
}

function requireTurnLeaseInContext(
  context: CampaignPlayMutationContext,
  token: CampaignPlayWorkerLeaseToken,
  observedAt: number,
): void {
  const owned = context.sqlite.prepare(`SELECT 1 AS owned FROM campaign_play_turns
    WHERE id = ? AND campaign_id = ? AND stage = 'primary_settled'
      AND worker_lease_owner = ? AND worker_epoch = ?
      AND worker_lease_expires_at = ?`).get(
    token.turnId,
    context.campaignId,
    token.owner,
    token.epoch,
    token.expiresAt,
  );
  if (!owned || observedAt >= token.expiresAt) {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  }
}

function stableId(prefix: string, value: unknown): string {
  return `${prefix}:${hashCampaignPlayProjection(value).slice(0, 32)}`;
}

function uniqueRefs(references: CampaignPlayEntityRef[]): CampaignPlayEntityRef[] {
  const rows = new Map<string, CampaignPlayEntityRef>();
  for (const reference of references) {
    const key = `${reference.kind}\u0000${reference.id}`;
    if (!rows.has(key)) rows.set(key, reference);
  }
  return [...rows.values()];
}

function exposureRefs(exposure: CampaignPlayExposurePolicy): CampaignPlayEntityRef[] {
  if (exposure.mode === "protected") return [];
  return exposure.predicates.map((predicate): CampaignPlayEntityRef => {
    switch (predicate.channel) {
      case "direct_perception":
      case "local_aftermath": return { kind: "location", id: predicate.locationId };
      case "route_state": return { kind: "route", id: predicate.routeId };
      case "witness_report": return { kind: "actor", id: predicate.witnessActorId };
    }
  });
}

function projectableExposure(
  frame: CampaignPlayActorFrame,
  seed: CampaignPlayOpeningExposureSeed,
  humanLocationId: string | null,
  directLocationIds: readonly string[],
  aftermathLocationId: string | null,
): CampaignPlayExposurePolicy {
  if (humanLocationId !== null && directLocationIds.includes(humanLocationId)) {
    return {
      mode: "projectable",
      predicates: [{ channel: "direct_perception", locationId: humanLocationId }],
    };
  }
  if (seed.sourceActorId === frame.actorId && seed.sourceGoalId === frame.plan.goalId
    && frame.selection.kind === "step" && frame.selection.settledStepCount === 0) {
    return { mode: "projectable", predicates: [structuredClone(seed.predicate)] };
  }
  if (aftermathLocationId !== null) {
    return {
      mode: "projectable",
      predicates: [{
        channel: "local_aftermath",
        locationId: aftermathLocationId,
        validUntilWorldTimeMinutes: Math.min(
          MAX_WORLD_TIME_MINUTES,
          frame.worldTimeMinutes + ACTOR_AFTERMATH_VISIBILITY_MINUTES,
        ),
      }],
    };
  }
  return { mode: "protected" };
}

function eventClass(intent: CampaignPlayActorFrame["plan"]["intent"]): "dialogue" | "interaction" | "discovery" | "scene" {
  switch (intent.kind) {
    case "observe": return "discovery";
    case "contact": return "dialogue";
    case "move":
    case "attempt": return "interaction";
    case "wait": return "scene";
  }
}

function compileProposal(
  frame: CampaignPlayActorFrame,
  seed: CampaignPlayOpeningExposureSeed,
  humanLocationId: string | null,
): CampaignPlayActorProposal {
  if (frame.selection.kind !== "step") {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  }
  const batchId = stableId("actor-batch", {
    jobId: frame.jobId,
    worldVersion: frame.baseWorldVersion,
    stepId: frame.selection.step.stepId,
  });
  const proposalId = stableId("actor-proposal", { batchId, actorId: frame.actorId });
  const source = { kind: "actor" as const, actorId: frame.actorId };
  const causalParent = { kind: "actor_job" as const, jobId: frame.jobId };
  const intent = frame.selection.step.intent;
  const present = frame.placements.find((placement) => placement.placementKind === "present");
  const targetLocation = intent.targets.find((target) => target.kind === "location");
  const route = present && targetLocation
    ? frame.localRoutes.find((candidate) => candidate.state !== "blocked"
      && candidate.fromLocationId === present.locationId
      && candidate.toLocationId === targetLocation.id)
    : undefined;
  const movesActor = intent.kind === "move" && present !== undefined
    && targetLocation !== undefined && route !== undefined;
  const exposure = projectableExposure(
    frame,
    seed,
    humanLocationId,
    movesActor ? [present.locationId, targetLocation.id] : present ? [present.locationId] : [],
    movesActor ? null : present?.locationId ?? null,
  );
  let command: RulebookBatchCommand;
  if (movesActor) {
    const readScope = uniqueRefs([
      { kind: "actor", id: frame.actorId },
      { kind: "route", id: route.id },
      { kind: "location", id: present.locationId },
      { kind: "location", id: targetLocation.id },
    ]);
    const writeScope = uniqueRefs([
      { kind: "actor", id: frame.actorId },
      { kind: "location", id: present.locationId },
      { kind: "location", id: targetLocation.id },
    ]);
    command = {
      commandId: deriveCampaignPlayCommandId(frame.campaignId, frame.turnId, batchId, 0),
      batchId,
      order: 0,
      causalParent,
      source,
      expectedWorldVersion: frame.baseWorldVersion,
      readScope,
      writeScope,
      exposure,
      kind: "move_actor",
      actorId: frame.actorId,
      routeId: route.id,
      fromLocationId: present.locationId,
      toLocationId: targetLocation.id,
    };
  } else {
    const affectedRefs = uniqueRefs([{ kind: "actor", id: frame.actorId }, ...intent.targets]);
    const readScope = affectedRefs;
    const ownsOpeningConsequence = seed.sourceActorId === frame.actorId
      && seed.sourceGoalId === frame.plan.goalId
      && frame.selection.settledStepCount === 0;
    const summary = ownsOpeningConsequence && exposure.mode === "projectable"
      ? seed.summary
      : `${frame.actor.name}: ${intent.method ?? intent.kind}${intent.stakes ? `. ${intent.stakes}` : ""}`;
    const recordedEventClass = eventClass(intent);
    command = {
      commandId: deriveCampaignPlayCommandId(frame.campaignId, frame.turnId, batchId, 0),
      batchId,
      order: 0,
      causalParent,
      source,
      expectedWorldVersion: frame.baseWorldVersion,
      readScope,
      writeScope: [],
      exposure,
      kind: "record_world_event",
      eventClass: recordedEventClass,
      performingActorId: recordedEventClass === "dialogue" || recordedEventClass === "interaction"
        ? frame.actorId
        : null,
      summary,
      observableTrace: frame.selection.step.observableTrace,
      affectedRefs,
    };
  }
  const expiryDelta = Math.max(1, frame.selection.step.elapsedBounds.maximumMinutes);
  const proposal = {
    proposalId,
    batchId,
    jobId: frame.jobId,
    actorId: frame.actorId,
    causalParent,
    baseWorldVersion: frame.baseWorldVersion,
    readScope: command.readScope,
    writeScope: command.writeScope,
    expiresAtWorldTimeMinutes: Math.min(MAX_WORLD_TIME_MINUTES, frame.worldTimeMinutes + expiryDelta),
    commands: [command],
    result: { status: "pending" as const },
  };
  return campaignPlayActorProposalSchema.parse(proposal);
}

function humanLocation(handle: CampaignPlayDatabaseHandle): string | null {
  const row = handle.sqlite.prepare(`SELECT human_placement.location_id AS locationId
    FROM actors human_actor
    JOIN actor_placements human_placement ON human_placement.actor_id = human_actor.id
      AND human_placement.campaign_id = human_actor.campaign_id
      AND human_placement.placement_kind = 'present'
    WHERE human_actor.campaign_id = ? AND human_actor.controller = 'human'
      AND human_actor.kind = 'person'
    LIMIT 1`).get(handle.campaignId) as { locationId: string } | undefined;
  return row?.locationId ?? null;
}

function loadRulebookFrame(handle: CampaignPlayDatabaseHandle): CampaignPlayRulebookFrame {
  const state = createCampaignPlayStateRepository(handle).loadState();
  if (!state || state.authority.worldTimeMinutes === null) {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  }
  const sqlite = handle.sqlite;
  const campaignId = handle.campaignId;
  const human = sqlite.prepare(`SELECT a.id AS actorId, c.record_hash AS recordHash
    FROM actors a JOIN campaign_play_characters c ON c.actor_id = a.id AND c.campaign_id = a.campaign_id
    WHERE a.campaign_id = ? AND a.controller = 'human'`).get(campaignId) as CampaignPlayHumanMechanicalIdentity | undefined;
  const routeStates = sqlite.prepare(`SELECT route_id AS routeId, state FROM campaign_play_route_states
    WHERE campaign_id = ? ORDER BY route_id`).all(campaignId) as CampaignPlayLiveRouteState[];
  const actorConditions = (sqlite.prepare(`SELECT actor_id AS actorId, condition, present, summary
    FROM campaign_play_actor_conditions WHERE campaign_id = ? ORDER BY actor_id, condition`).all(campaignId) as Array<Omit<CampaignPlayLiveActorCondition, "present"> & { present: number }>)
    .map((row) => ({ ...row, present: row.present === 1 }));
  const possessions = sqlite.prepare(`SELECT possession_id AS possessionId,
    actor_id AS actorId, possession_key AS possessionKey, name, quantity
    FROM campaign_play_actor_possessions WHERE campaign_id = ?
    ORDER BY possession_id`).all(campaignId) as CampaignPlayLiveActorPossession[];
  const pressureStates = sqlite.prepare(`SELECT pressure_id AS pressureId, progress, status,
    last_advanced_world_time_minutes AS lastAdvancedWorldTimeMinutes
    FROM campaign_play_pressure_states WHERE campaign_id = ? ORDER BY pressure_id`).all(campaignId) as CampaignPlayLivePressureState[];
  const placements = sqlite.prepare(`SELECT id AS placementId, actor_id AS actorId,
    location_id AS locationId, placement_kind AS placementKind
    FROM actor_placements WHERE campaign_id = ? ORDER BY id`).all(campaignId) as CampaignPlayLivePlacement[];
  const relations = sqlite.prepare(`SELECT id AS relationId, source_actor_id AS sourceActorId,
    target_actor_id AS targetActorId, relation_type AS relationType, intensity, summary
    FROM actor_relations WHERE campaign_id = ? ORDER BY id`).all(campaignId) as CampaignPlayLiveRelation[];
  const goals = sqlite.prepare(`SELECT id AS goalId, actor_id AS actorId, status, priority,
    objective, motivation FROM actor_goals WHERE campaign_id = ? ORDER BY id`).all(campaignId) as CampaignPlayLiveGoal[];
  return {
    campaignId,
    acceptedWorldVersion: state.authority.acceptedWorldVersion,
    acceptedContentHash: state.authority.acceptedContentHash,
    setupPhase: state.authority.setupPhase,
    worldVersion: state.authority.worldVersion,
    worldTimeMinutes: state.authority.worldTimeMinutes,
    human: human ?? null,
    acceptedWorld: state.acceptedReview,
    routeStates,
    actorConditions,
    possessions,
    pressureStates,
    placements,
    relations,
    goals,
  };
}

function persistPendingProposal(context: CampaignPlayMutationContext, proposal: CampaignPlayActorProposal, createdAt: number): void {
  const commandsJson = canonicalizeCampaignPlayProjection(proposal.commands);
  const resultJson = canonicalizeCampaignPlayProjection(proposal.result);
  context.sqlite.prepare(`INSERT INTO campaign_play_actor_proposals (
    proposal_id, campaign_id, batch_id, job_id, actor_id, causal_parent_json,
    base_world_version, read_scope_json, write_scope_json,
    expires_at_world_time_minutes, commands_json, commands_hash, status,
    result_json, result_hash, created_at, completed_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, NULL)`).run(
    proposal.proposalId,
    context.campaignId,
    proposal.batchId,
    proposal.jobId,
    proposal.actorId,
    canonicalizeCampaignPlayProjection(proposal.causalParent),
    proposal.baseWorldVersion,
    canonicalizeCampaignPlayProjection(proposal.readScope),
    canonicalizeCampaignPlayProjection(proposal.writeScope),
    proposal.expiresAtWorldTimeMinutes,
    commandsJson,
    hashCampaignPlayProjection(proposal.commands),
    resultJson,
    hashCampaignPlayProjection(proposal.result),
    createdAt,
  );
  const updated = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
    SET stage = 'proposed', proposal_id = ?
    WHERE job_id = ? AND campaign_id = ? AND actor_id = ? AND stage = 'claimed'`).run(
    proposal.proposalId,
    proposal.jobId,
    context.campaignId,
    proposal.actorId,
  );
  if (updated.changes !== 1) throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
}

function parseStoredJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch (cause) {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid", {
      cause: new TypeError(`${label} is not valid JSON.`, { cause }),
    });
  }
}

function loadPendingProposal(
  handle: CampaignPlayDatabaseHandle,
  job: CampaignPlayActorJob,
): CampaignPlayActorProposal {
  const row = handle.sqlite.prepare(`SELECT proposal_id AS proposalId, batch_id AS batchId,
    job_id AS jobId, actor_id AS actorId, causal_parent_json AS causalParentJson,
    base_world_version AS baseWorldVersion, read_scope_json AS readScopeJson,
    write_scope_json AS writeScopeJson,
    expires_at_world_time_minutes AS expiresAtWorldTimeMinutes,
    commands_json AS commandsJson, commands_hash AS commandsHash,
    result_json AS resultJson, result_hash AS resultHash, status
    FROM campaign_play_actor_proposals
    WHERE campaign_id = ? AND job_id = ? AND proposal_id = ?`).get(
    handle.campaignId,
    job.jobId,
    job.proposalId,
  ) as {
    proposalId: string;
    batchId: string;
    jobId: string;
    actorId: string;
    causalParentJson: string;
    baseWorldVersion: number;
    readScopeJson: string;
    writeScopeJson: string;
    expiresAtWorldTimeMinutes: number;
    commandsJson: string;
    commandsHash: string;
    resultJson: string;
    resultHash: string;
    status: string;
  } | undefined;
  if (!row || row.status !== "pending") {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  }
  const proposal = campaignPlayActorProposalSchema.parse({
    proposalId: row.proposalId,
    batchId: row.batchId,
    jobId: row.jobId,
    actorId: row.actorId,
    causalParent: parseStoredJson(row.causalParentJson, "Actor proposal causal parent"),
    baseWorldVersion: row.baseWorldVersion,
    readScope: parseStoredJson(row.readScopeJson, "Actor proposal read scope"),
    writeScope: parseStoredJson(row.writeScopeJson, "Actor proposal write scope"),
    expiresAtWorldTimeMinutes: row.expiresAtWorldTimeMinutes,
    commands: parseStoredJson(row.commandsJson, "Actor proposal commands"),
    result: parseStoredJson(row.resultJson, "Actor proposal result"),
  });
  if (
    canonicalizeCampaignPlayProjection(proposal.commands) !== row.commandsJson ||
    hashCampaignPlayProjection(proposal.commands) !== row.commandsHash ||
    canonicalizeCampaignPlayProjection(proposal.result) !== row.resultJson ||
    hashCampaignPlayProjection(proposal.result) !== row.resultHash ||
    proposal.result.status !== "pending"
  ) {
    throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  }
  return proposal;
}

function scheduleRow(handle: CampaignPlayDatabaseHandle, actorId: string): ScheduleRow {
  const row = handle.sqlite.prepare(`SELECT s.schedule_id AS scheduleId, s.plan_id AS planId,
    s.next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
    s.last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes, s.priority,
    s.agency_debt AS agencyDebt, p.cadence_minutes AS cadenceMinutes
    FROM campaign_play_actor_schedules s JOIN campaign_play_actor_plans p ON p.plan_id = s.plan_id
    WHERE s.campaign_id = ? AND s.actor_id = ?`).get(handle.campaignId, actorId) as ScheduleRow | undefined;
  if (!row) throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
  return row;
}

function transitionSchedule(
  context: CampaignPlayMutationContext,
  row: ScheduleRow,
  actorId: string,
  worldTimeMinutes: number,
  outcome: "settled" | "deferred",
  updatedAt: number,
): void {
  const transition = calculateCampaignPlayActorNextDueTime({
    settledWorldTimeMinutes: worldTimeMinutes,
    cadenceMinutes: row.cadenceMinutes,
    lastActAtWorldTimeMinutes: row.lastActAtWorldTimeMinutes,
    agencyDebt: row.agencyDebt,
    outcome,
  });
  const updated = context.sqlite.prepare(`UPDATE campaign_play_actor_schedules SET
    next_act_at_world_time_minutes = ?, last_act_at_world_time_minutes = ?, agency_debt = ?, updated_at = ?
    WHERE schedule_id = ? AND campaign_id = ? AND actor_id = ? AND plan_id = ?`).run(
    transition.nextActAtWorldTimeMinutes,
    transition.lastActAtWorldTimeMinutes,
    transition.agencyDebt,
    updatedAt,
    row.scheduleId,
    context.campaignId,
    actorId,
    row.planId,
  );
  if (updated.changes !== 1) throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
}

function rejectionForDenial(code: CampaignPlayRulebookDenialCode): CampaignPlayActorProposalRejectionReason {
  switch (code) {
    case "stale_world_version": return "stale_world_version";
    case "precondition_failed": return "precondition_failed";
    case "unauthorized_reference":
    case "invalid_read_scope":
    case "invalid_write_scope": return "scope_denied";
    default: return "command_denied";
  }
}

export function createCampaignPlayActorProposalService(
  handle: CampaignPlayDatabaseHandle,
  dependencies: CampaignPlayActorProposalServiceDependencies,
): CampaignPlayActorProposalService {
  const stateRepository = createCampaignPlayStateRepository(handle);
  const turnRepository = createCampaignPlayTurnRepository(handle);
  const scheduler = createCampaignPlayActorScheduler(handle);
  const now = (): number => {
    const value = dependencies.now();
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
    }
    return value;
  };

  function rejectProposal(
    job: CampaignPlayActorJob,
    proposal: CampaignPlayActorProposal,
    reason: CampaignPlayActorProposalRejectionReason,
    token: CampaignPlayWorkerLeaseToken,
    createdAt: number,
  ): CampaignPlayActorProposalOutcome {
    const state = stateRepository.loadState();
    if (!state || state.authority.worldTimeMinutes === null) {
      throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
    }
    const schedule = scheduleRow(handle, proposal.actorId);
    const result = { status: "rejected" as const, reason };
    const mutationId = stableId("actor-job-event", {
      jobId: proposal.jobId,
      stage: "rejected",
      reason,
    });
    turnRepository.commitActorTransition({
      token,
      leaseMode: "live",
      worldVersionAdvance: 0,
      mutationId,
      protectedPayloadHash: hashCampaignPlayProjection({
        proposalId: proposal.proposalId,
        result,
        actorWorkerEpoch: job.workerEpoch,
      }),
      committedAt: createdAt,
      mutate(context) {
        requireTurnLeaseInContext(context, token, createdAt);
        const resultJson = canonicalizeCampaignPlayProjection(result);
        const proposalUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_proposals SET status = 'rejected',
          result_json = ?, result_hash = ?, completed_at = ?
          WHERE proposal_id = ? AND campaign_id = ? AND status = 'pending'`).run(
          resultJson, hashCampaignPlayProjection(result), createdAt,
          proposal.proposalId, context.campaignId,
        );
        const jobUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs SET stage = 'rejected', completed_at = ?
          WHERE job_id = ? AND campaign_id = ? AND stage = 'proposed' AND proposal_id = ?
            AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).run(
          createdAt, proposal.jobId, context.campaignId, proposal.proposalId,
          job.workerEpoch, job.claimTurnWorkerEpoch,
        );
        if (proposalUpdate.changes !== 1 || jobUpdate.changes !== 1) {
          throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
        }
        transitionSchedule(context, schedule, proposal.actorId, state.authority.worldTimeMinutes!, "deferred", createdAt);
      },
    });
    return { kind: "rejected", jobId: proposal.jobId, proposalId: proposal.proposalId, reason };
  }

  const processNext = (
    input: ProcessCampaignPlayActorProposalsInput,
  ): CampaignPlayActorProposalOutcome | null => {
      if (!input.turnId.trim() || input.token.turnId !== input.turnId
        || !Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
        throw new CampaignPlayActorProposalServiceError("proposal_input_invalid");
      }
      requireTurnLease(handle, input.token, input.createdAt);
      let job = scheduler.listTurnJobs(input.turnId).find((candidate) =>
        ["queued", "claimed", "interrupted", "proposed"].includes(candidate.stage)
      );
      if (!job || job.stage === "interrupted") return null;
      let latestFrame = scheduler.buildActorFrame(job.jobId);
      if (job.stage === "queued") {
        const frame = latestFrame;
        if (frame.selection.kind === "replan_required") {
          return {
            kind: "replan_required",
            jobId: job.jobId,
            reason: frame.selection.reason,
            failedPreconditionIndexes: [...frame.selection.failedPreconditionIndexes],
          };
        }
        const workerEpoch = job.workerEpoch + 1;
        const jobId = job.jobId;
        const priorWorkerEpoch = job.workerEpoch;
        turnRepository.commitActorTransition({
          token: input.token,
          leaseMode: "live",
          worldVersionAdvance: 0,
          mutationId: stableId("actor-job-event", { jobId: job.jobId, stage: "claimed", workerEpoch }),
          protectedPayloadHash: hashCampaignPlayProjection({
            jobId,
            actorWorkerEpoch: workerEpoch,
          }),
          committedAt: input.createdAt,
          mutate(context) {
            const updated = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
              SET stage = 'claimed', worker_epoch = ?, claim_turn_worker_epoch = ?
              WHERE job_id = ? AND campaign_id = ? AND stage = 'queued' AND worker_epoch = ?`).run(
              workerEpoch, input.token.epoch, jobId, context.campaignId, priorWorkerEpoch,
            );
            if (updated.changes !== 1) throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
          },
        });
        input.injectFault?.("after_job_claim", jobId);
        job = scheduler.listTurnJobs(input.turnId).find((candidate) => candidate.jobId === jobId)!;
        latestFrame = scheduler.buildActorFrame(job.jobId);
      }
      let proposal: CampaignPlayActorProposal;
      if (job.stage === "proposed") {
        proposal = loadPendingProposal(handle, job);
      } else {
        if (job.stage !== "claimed" || latestFrame.selection.kind !== "step") {
          throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
        }
        proposal = compileProposal(
          latestFrame,
          input.openingExposureSeed,
          humanLocation(handle),
        );
        turnRepository.commitActorTransition({
          token: input.token,
          leaseMode: "live",
          worldVersionAdvance: 0,
          mutationId: stableId("actor-job-event", {
            jobId: job.jobId,
            stage: "proposed",
            workerEpoch: job.workerEpoch,
          }),
          protectedPayloadHash: hashCampaignPlayProjection({
            proposal,
            actorWorkerEpoch: job.workerEpoch,
          }),
          committedAt: input.createdAt,
          mutate(context) {
            persistPendingProposal(context, proposal, input.createdAt);
          },
        });
        input.injectFault?.("after_proposal_persisted", job.jobId);
        job = scheduler.listTurnJobs(input.turnId).find((candidate) => candidate.jobId === job!.jobId)!;
      }
      input.beforeSettlement?.(proposal);
      input.injectFault?.("before_proposal_commit", job.jobId);
      const current = stateRepository.loadState();
      if (!current || current.authority.worldTimeMinutes === null) {
        throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
      }
      if (current.authority.worldVersion !== proposal.baseWorldVersion) {
        const rejectedAt = now();
        requireTurnLease(handle, input.token, rejectedAt);
        return rejectProposal(job, proposal, "stale_world_version", input.token, rejectedAt);
      }
      if (current.authority.worldTimeMinutes >= proposal.expiresAtWorldTimeMinutes) {
        const rejectedAt = now();
        requireTurnLease(handle, input.token, rejectedAt);
        return rejectProposal(job, proposal, "expired", input.token, rejectedAt);
      }
      const rulebookFrame = loadRulebookFrame(handle);
      const witnessActorIds = proposal.commands.flatMap((command) => command.exposure.mode === "projectable"
        ? command.exposure.predicates.flatMap((predicate) => predicate.channel === "witness_report" ? [predicate.witnessActorId] : [])
        : []);
      const authority: CampaignPlayRulebookAuthority = {
        purpose: "actor_job",
        turnId: job.turnId,
        actorId: job.actorId,
        rootParent: { kind: "actor_job", jobId: job.jobId },
        authorizedRefs: uniqueRefs([...latestFrame.authorizedRefs, ...proposal.commands.flatMap((command) => exposureRefs(command.exposure))]),
        witnessActorIds: [...new Set(witnessActorIds)],
        knownWorldEventIds: latestFrame.knownEvents.map((event) => event.eventId),
      };
      const accepted = preflightCampaignPlayRulebook({
        frame: rulebookFrame,
        authority,
        batch: { batchId: proposal.batchId, baseWorldVersion: proposal.baseWorldVersion, commands: proposal.commands },
      });
      if (!accepted.accepted) {
        const rejectedAt = now();
        requireTurnLease(handle, input.token, rejectedAt);
        return rejectProposal(
          job,
          proposal,
          rejectionForDenial(accepted.denial.code),
          input.token,
          rejectedAt,
        );
      }
      const committedAt = now();
      requireTurnLease(handle, input.token, committedAt);
      const mutationCount = accepted.batch.commands.filter((command) =>
        CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation).length;
      const schedule = scheduleRow(handle, job.actorId);
      let receiptIds: string[] = [];
      turnRepository.commitActorTransition({
        token: input.token,
        leaseMode: "live",
        worldVersionAdvance: mutationCount,
        mutationId: stableId("actor-job-event", {
          jobId: job.jobId,
          stage: "settled",
          workerEpoch: job.workerEpoch,
        }),
        protectedPayloadHash: hashCampaignPlayProjection({
          proposalId: proposal.proposalId,
          status: "accepted",
          actorWorkerEpoch: job.workerEpoch,
        }),
        committedAt,
        mutate(context: CampaignPlayMutationContext) {
          const execution = executeCampaignPlayRulebookBatch({
            frame: rulebookFrame,
            accepted,
            context,
            turnId: job.turnId,
            createdAt: committedAt,
            injectFault: input.injectRulebookFault,
          });
          receiptIds = execution.receiptIds;
          const result = { status: "accepted" as const, receiptIds };
          const resultJson = canonicalizeCampaignPlayProjection(result);
          const proposalUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_proposals SET status = 'accepted',
            result_json = ?, result_hash = ?, completed_at = ?
            WHERE proposal_id = ? AND campaign_id = ? AND status = 'pending'`).run(
            resultJson, hashCampaignPlayProjection(result), committedAt,
            proposal.proposalId, context.campaignId,
          );
          const jobUpdate = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs SET stage = 'settled', completed_at = ?
            WHERE job_id = ? AND campaign_id = ? AND stage = 'proposed'
              AND proposal_id = ? AND worker_epoch = ? AND claim_turn_worker_epoch = ?`).run(
            committedAt, job.jobId, context.campaignId, proposal.proposalId,
            job.workerEpoch, job.claimTurnWorkerEpoch,
          );
          if (proposalUpdate.changes !== 1 || jobUpdate.changes !== 1) {
            throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
          }
          transitionSchedule(context, schedule, job.actorId, current.authority.worldTimeMinutes!, "settled", committedAt);
          if (latestFrame.selection.kind === "step"
            && latestFrame.selection.settledStepCount + 1 >= latestFrame.plan.steps.length) {
            context.sqlite.prepare(`UPDATE campaign_play_actor_plans SET status = 'completed', updated_at = ?
              WHERE plan_id = ? AND campaign_id = ? AND status = 'active'`).run(
              committedAt, latestFrame.plan.planId, context.campaignId,
            );
          }
        },
      });
      return {
        kind: "settled",
        jobId: job.jobId,
        proposalId: proposal.proposalId,
        receiptIds,
        resultWorldVersion: stateRepository.loadState()!.authority.worldVersion,
      };
  };

  return {
    processNext,
    deferReplan(input) {
      if (!input.jobId.trim() || !Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
        throw new CampaignPlayActorProposalServiceError("proposal_input_invalid");
      }
      requireTurnLease(handle, input.token, input.createdAt);
      const job = scheduler.listTurnJobs(input.token.turnId).find((candidate) =>
        candidate.jobId === input.jobId);
      if (!job || job.stage !== "queued" ||
        scheduler.buildActorFrame(job.jobId).selection.kind !== "replan_required") {
        throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
      }
      const state = stateRepository.loadState();
      if (!state || state.authority.worldTimeMinutes === null) {
        throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
      }
      const schedule = scheduleRow(handle, job.actorId);
      turnRepository.commitActorTransition({
        token: input.token,
        leaseMode: "live",
        worldVersionAdvance: 0,
        mutationId: stableId("actor-job-event", {
          jobId: job.jobId,
          stage: "deferred",
          reason: "replan_capacity",
        }),
        protectedPayloadHash: hashCampaignPlayProjection({
          jobId: job.jobId,
          reason: "replan_capacity",
        }),
        committedAt: input.createdAt,
        mutate(context) {
          requireTurnLeaseInContext(context, input.token, input.createdAt);
          const updated = context.sqlite.prepare(`UPDATE campaign_play_actor_jobs
            SET stage = 'deferred', defer_reason = 'replan_capacity', completed_at = ?
            WHERE job_id = ? AND campaign_id = ? AND stage = 'queued'
              AND worker_epoch = 0 AND claim_turn_worker_epoch IS NULL`).run(
                input.createdAt,
                job.jobId,
                context.campaignId,
              );
          if (updated.changes !== 1) {
            throw new CampaignPlayActorProposalServiceError("proposal_state_invalid");
          }
          transitionSchedule(
            context,
            schedule,
            job.actorId,
            state.authority.worldTimeMinutes!,
            "deferred",
            input.createdAt,
          );
        },
      });
      return { kind: "deferred", jobId: job.jobId, reason: "replan_capacity" };
    },
  };
}
