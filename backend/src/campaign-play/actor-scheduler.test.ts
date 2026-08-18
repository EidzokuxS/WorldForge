import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/index.js";
import { openCampaignWorldDatabase, type CampaignWorldDatabaseHandle } from "../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../campaign-world/world-repository.test-support.js";
import { calculateCampaignWorldContentHash } from "../campaign-world/world-snapshot.js";
import {
  calculateCampaignPlayActorNextDueTime,
  createCampaignPlayActorScheduler,
  selectCampaignPlayActorPlanStep,
  type CampaignPlayActorDueSet,
} from "./actor-scheduler.js";
import { openCampaignPlayDatabase, type CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import { canonicalizeCampaignPlayProjection, deriveCampaignPlayActorReplanStageId, hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord } from "./campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import type { CampaignPlayMutationContext } from "./campaign-play-state-repository.js";
import { createCampaignPlayTurnRepository } from "./campaign-play-turn-repository.js";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-actor-scheduler-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.close();
  closeDb();
  if (previousCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function track<T extends CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle>(handle: T): T {
  handles.push(handle);
  return handle;
}

function buildAcceptedCampaign(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    const buildId = "build-scheduler";
    repository.acquireBuild({
      buildId,
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, buildId);
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b" ? { ...placement, locationId: "location-a-office" } : placement),
    };
    const review = repository.completeBuild({
      buildId,
      candidate: { ...candidate, draft, contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft) },
      completedAt: 1_100,
    });
    repository.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: 1_200,
    });
  } finally {
    handle.close();
  }
}

function modelEvidence(actualModel: string) {
  return {
    actualProviderId: "test-provider",
    actualModel,
    actualStrategy: "strict_object" as const,
    inputTokens: 10,
    outputTokens: 10,
    durationMs: 20,
    finishReason: "stop",
  };
}

function planJson(actorId: string, goalId: string, withLocationPrecondition: boolean) {
  const intent = {
    kind: "attempt" as const,
    targets: [{ kind: "goal" as const, id: goalId }],
    method: "Advance the active goal",
    stakes: "The actor's current objective",
  };
  return {
    intentJson: canonicalizeCampaignPlayProjection(intent),
    preconditionsJson: canonicalizeCampaignPlayProjection(withLocationPrecondition
      ? [{ kind: "actor_at_location", actorId, locationId: "location-a-office" }]
      : []),
    stepsJson: canonicalizeCampaignPlayProjection([
      { stepId: `step-${actorId}-one`, order: 0, intent,
        observableTrace: "Fresh work marks show that the objective advanced here.",
        possessionOutcome: { kind: "none" as const },
        obligationOutcome: { kind: "none" as const },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 } },
      { stepId: `step-${actorId}-two`, order: 1,
        intent: { ...intent, method: "Continue the active goal" },
        observableTrace: "A second set of fresh marks continues the same work.",
        possessionOutcome: { kind: "none" as const },
        obligationOutcome: { kind: "none" as const },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 8 } },
    ]),
  };
}

function createReadyFixture(completedActions: 30 | 60 = 30) {
  buildAcceptedCampaign();
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  states.createState({ eventId: "state-created", createdAt: 1_300 });
  const settledClock = completedActions * 10;
  states.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: {
      eventId: "scheduler-fixture-ready",
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: HASH_A,
      createdAt: 1_400,
    },
    mutate(context) {
      context.sqlite.prepare(`INSERT INTO actors (
        id, campaign_id, kind, controller, role, name, summary, traits, tags
      ) VALUES ('actor-player', ?, 'person', 'human', 'player', 'Player',
        'A human visitor.', '[]', '[]')`).run(context.campaignId);
      context.sqlite.prepare(`INSERT INTO campaign_play_characters (
        actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at
      ) VALUES ('actor-player', ?, '{"name":"Player"}', ?, 'created', ?, 1400)`)
        .run(context.campaignId, HASH_A, HASH_B);
      context.sqlite.prepare(`INSERT INTO actor_placements (
        id, campaign_id, actor_id, location_id, placement_kind
      ) VALUES ('placement-player', ?, 'actor-player', 'location-a', 'present')`)
        .run(context.campaignId);

      const schedules = [
        { actorId: "actor-a", goalId: "goal-a", nextAt: settledClock - 10, priority: 3, debt: 0, cadence: 20 },
        { actorId: "actor-b", goalId: "goal-b", nextAt: settledClock - 10, priority: 5, debt: 0, cadence: 30 },
        { actorId: "actor-d", goalId: "goal-d", nextAt: settledClock - 5, priority: 4, debt: 2, cadence: 40 },
        { actorId: "actor-c", goalId: "goal-c", nextAt: settledClock + 1, priority: 5, debt: 0, cadence: 25 },
      ];
      for (const schedule of schedules) {
        const planId = `plan-${schedule.actorId}`;
        const json = planJson(schedule.actorId, schedule.goalId, schedule.actorId === "actor-b");
        context.sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
          plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
          preconditions_json, cadence_minutes, priority, steps_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active', 1400, 1400)`).run(
          planId, context.campaignId, schedule.actorId, schedule.goalId,
          json.intentJson, json.preconditionsJson, schedule.cadence, schedule.priority, json.stepsJson,
        );
        context.sqlite.prepare(`INSERT INTO campaign_play_actor_schedules (
          schedule_id, campaign_id, actor_id, plan_id, next_act_at_world_time_minutes,
          last_act_at_world_time_minutes, priority, agency_debt, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, 1400, 1400)`).run(
          `schedule-${schedule.actorId}`, context.campaignId, schedule.actorId, planId,
          schedule.nextAt, schedule.priority, schedule.debt,
        );
      }
      context.sqlite.prepare(`UPDATE campaign_play_states SET
        setup_phase = 'ready', world_time_minutes = ?, opened_at = 1400
        WHERE campaign_id = ?`).run(settledClock, context.campaignId);
    },
  });
  const turns = createCampaignPlayTurnRepository(handle);
  const ready = states.loadState()!;
  turns.admitTurn({
    turnId: "turn-player",
    supersedesTurnId: null,
    mutationId: "turn-admitted",
    submittedAt: 1_500,
    document: {
      turnKind: "player_action",
      request: {
        source: "freeform",
        idempotencyKey: "player-action-one",
        text: "I wait and watch the harbor.",
        expectedWorldVersion: ready.authority.worldVersion,
        expectedRuntimeRevision: ready.authority.runtimeRevision,
      },
      frame: ready.publicState.projection as CampaignPlayProjectionRecord,
    },
    modelSelection: {
      turnKind: "player_action",
      judge: { providerId: "test-provider", model: "judge", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      gameMaster: { providerId: "test-provider", model: "game-master", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      actorReplanner: { providerId: "test-provider", model: "actor-replanner", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      narrator: { providerId: "test-provider", model: "narrator", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
    },
  });
  const judge = turns.claimStage({
    turnId: "turn-player", expectedStage: "admitted", observedEpoch: 0,
    owner: "scheduler-worker", claimedAt: 1_510, leaseExpiresAt: 2_000,
    mutationId: "judge-claimed",
  });
  turns.acceptModelArtifact({
    token: judge,
    artifact: {
      ruling: {
        disposition: "deterministic",
        normalizedIntent: {
          originalText: "I wait and watch the harbor.",
          source: "freeform",
          choiceHandle: null,
          kind: "wait",
          targets: [],
          method: null,
          stakes: null,
        },
        movementRouteHandle: null,
        citedVisibleFactHandles: [],
        resultBounds: { minimum: "success", maximum: "success" },
        elapsedBounds: { minimumMinutes: 10, maximumMinutes: 10 },
        uncertainty: { kind: "none" },
        possessionEffectAuthority: { kind: "none" },
        requiredObligationEffect: { kind: "none" },
        reason: "Waiting and watching is directly possible.",
        clarificationQuestion: null,
      },
      resolution: { kind: "deterministic", result: "success" },
      uncertaintyAuthority: null,
      publicResult: {
        intentKind: "wait",
        disposition: "deterministic",
        result: "success",
        clarificationQuestion: null,
      },
      primaryPlan: { kind: "game_master_required" },
    },
    evidence: modelEvidence("judge"),
    mutationDomain: "runtime", acceptedAt: 1_520, mutationId: "judge-accepted",
  });
  const gameMaster = turns.claimStage({
    turnId: "turn-player", expectedStage: "judged", observedEpoch: 1,
    owner: "scheduler-worker", claimedAt: 1_530, leaseExpiresAt: 2_000,
    mutationId: "game-master-claimed",
  });
  const judgeArtifactHash = turns.loadAcceptedModelArtifact("turn-player", "judge")?.artifactHash;
  if (!judgeArtifactHash) throw new Error("Accepted Judge fixture artifact disappeared.");
  const gameMasterBatch = {
    batchId: "batch-scheduler-fixture",
    baseWorldVersion: ready.authority.worldVersion,
    commands: [{
      kind: "record_world_event" as const,
      commandId: "command-scheduler-fixture",
      batchId: "batch-scheduler-fixture",
      order: 0,
      causalParent: { kind: "turn" as const, turnId: "turn-player" },
      source: { kind: "system" as const, system: "game_master" as const },
      expectedWorldVersion: ready.authority.worldVersion,
      eventClass: "scene" as const,
      performingActorId: null,
      summary: "The player watches the harbor.",
      observableTrace: null,
      affectedRefs: [{ kind: "actor" as const, id: "actor-player" }],
      readScope: [{ kind: "actor" as const, id: "actor-player" }],
      writeScope: [],
      exposure: { mode: "protected" as const },
    }],
  };
  turns.acceptModelArtifact({
    token: gameMaster,
    artifact: {
      judgeArtifactHash,
      batch: gameMasterBatch,
      batchHash: hashCampaignPlayProjection(gameMasterBatch),
      semanticReview: { kind: "not_required" },
    },
    evidence: modelEvidence("game-master"),
    mutationDomain: "runtime", acceptedAt: 1_540, mutationId: "game-master-accepted",
  });
  const primary = turns.claimStage({
    turnId: "turn-player", expectedStage: "planned", observedEpoch: 2,
    owner: "scheduler-worker", claimedAt: 1_550, leaseExpiresAt: 2_000,
    mutationId: "primary-claimed",
  });
  turns.commitDeterministic({
    token: primary,
    transition: "primary_settled",
    worldVersionAdvance: 0,
    committedAt: 1_560,
    mutationId: "primary-settled",
  });
  return { handle, states, turns, settledClock };
}

function freezeCurrent(handle: CampaignPlayDatabaseHandle): CampaignPlayActorDueSet {
  const state = createCampaignPlayStateRepository(handle).loadState()!;
  return createCampaignPlayActorScheduler(handle).freezeDueSet({
    turnId: "turn-player",
    expectedWorldVersion: state.authority.worldVersion,
    expectedRuntimeRevision: state.authority.runtimeRevision,
  });
}

type DeferredModelError = "model_contract_invalid" | "provider_unavailable"
  | "stage_timeout" | "stage_budget_exceeded";

function createDeferredModelValidationFixture(
  errorCode: DeferredModelError | null,
  deferReason: string,
) {
  const fixture = createReadyFixture();
  const scheduler = createCampaignPlayActorScheduler(fixture.handle);
  const dueSet = freezeCurrent(fixture.handle);
  let jobs = scheduler.listTurnJobs("turn-player");
  fixture.states.commitRuntime({
    event: {
      eventId: `scheduler-validation-jobs-${errorCode ?? "none"}-${deferReason}`,
      turnId: "turn-player",
      kind: "actor_job_transitioned",
      workerEpoch: 3,
      protectedPayloadHash: hashCampaignPlayProjection(dueSet),
      createdAt: 1_600,
    },
    mutate(context) {
      jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 });
    },
  });
  const target = jobs.find((job) => job.actorId === "actor-b");
  if (!target) throw new Error("Scheduler validation fixture requires actor-b.");
  if (deferReason === "replan_invalid") {
    fixture.handle.sqlite.prepare(`UPDATE campaign_play_turns SET
        worker_lease_owner = 'scheduler-validation', worker_lease_expires_at = 2_000
      WHERE id = 'turn-player' AND stage = 'primary_settled' AND worker_epoch = 3
        AND worker_lease_owner IS NULL`).run();
    fixture.handle.sqlite.prepare(`UPDATE campaign_play_actor_jobs SET
        stage = 'claimed', worker_epoch = 1, claim_turn_worker_epoch = 3
      WHERE job_id = ? AND stage = 'queued'`).run(target.jobId);
  }
  if (errorCode !== null) {
    const stageId = deriveCampaignPlayActorReplanStageId(target.jobId);
    fixture.handle.sqlite.prepare(`INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
        requested_provider_id, requested_model, requested_strategy,
        schema_outcome, created_at
      ) VALUES (?, ?, 1, ?, 'turn-player', 'actor_replanner', 'started', 1,
        'test-provider', 'actor-replanner', 'strict_object', 'pending', 1_600)`).run(
      `scheduler-validation-model-${errorCode}`, stageId, CAMPAIGN_ID,
    );
    fixture.handle.sqlite.prepare(`UPDATE campaign_play_model_stages SET
        status = 'interrupted', duration_ms = 20, schema_outcome = ?,
        error_code = ?, completed_at = 1_620
      WHERE id = ? AND status = 'started'`).run(
      errorCode === "model_contract_invalid" ? "invalid" : "transport_error",
      errorCode,
      `scheduler-validation-model-${errorCode}`,
    );
  }
  for (const job of jobs) {
    const reason = job.jobId === target.jobId ? deferReason : "replan_capacity";
    fixture.handle.sqlite.prepare(`UPDATE campaign_play_actor_jobs SET
        stage = 'deferred', defer_reason = ?, completed_at = 1_600
      WHERE job_id = ? AND stage IN ('queued', 'claimed')`).run(reason, job.jobId);
  }
  return { ...fixture, scheduler, dueSet, targetJobId: target.jobId };
}

function validationContext(
  fixture: ReturnType<typeof createDeferredModelValidationFixture>,
  dueSet: CampaignPlayActorDueSet,
): CampaignPlayMutationContext {
  return {
    sqlite: fixture.handle.sqlite,
    campaignId: fixture.handle.campaignId,
    priorWorldVersion: dueSet.baseWorldVersion,
    targetWorldVersion: dueSet.baseWorldVersion,
    priorRuntimeRevision: dueSet.baseRuntimeRevision,
    targetRuntimeRevision: dueSet.baseRuntimeRevision,
    runtimeEventSequence: null,
    mechanicalHash: () => "",
  };
}

function persistIncapacitatedCondition(
  handle: CampaignPlayDatabaseHandle,
  actorId: string,
  createdAt: number,
  perceivedByActorId?: string,
): void {
  const states = createCampaignPlayStateRepository(handle);
  const state = states.loadState()!;
  const projection = state.mechanical.projection as CampaignPlayProjectionRecord;
  const actorConditions = projection.actorConditions as CampaignPlayProjectionRecord[];
  const resultWorldHash = hashCampaignPlayProjection({
    ...projection,
    actorConditions: [...actorConditions, {
      actorId,
      condition: "incapacitated",
      present: true,
      summary: "The actor cannot take an action during this cadence.",
    }].sort((left, right) => String(left.actorId).localeCompare(String(right.actorId))),
  });
  const exposureSource = perceivedByActorId === undefined ? null : {
    channel: "direct_perception" as const,
    locationId: "location-a",
    perceivedActorId: null,
  };
  const exposurePolicy = exposureSource === null
    ? { mode: "protected" as const }
    : { mode: "projectable" as const, predicates: [{
      channel: "direct_perception" as const,
      locationId: "location-a",
    }] };
  states.commitMechanical({
    updatedAt: createdAt,
    worldVersionAdvance: 1,
    mutate(context) {
      const commandId = `fixture-command-incapacitate-${actorId}`;
      const receiptId = `fixture-receipt-incapacitate-${actorId}`;
      const eventId = `fixture-event-incapacitate-${actorId}`;
      const payload = canonicalizeCampaignPlayProjection({
        actorId, condition: "incapacitated", operation: "set",
        summary: "The actor cannot take an action during this cadence.",
      });
      context.sqlite.prepare(`INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version, read_scope_json,
        write_scope_json, exposure_policy_json, arguments_hash,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES (?, ?, 'turn-player', ?, 0, 'set_actor_condition',
        '{"kind":"turn","turnId":"turn-player"}',
        '{"kind":"system","system":"game_master"}', ?, ?, ?,
        ?, ?, ?, ?, ?)`).run(
        commandId, context.campaignId, `fixture-batch-incapacitate-${actorId}`,
        context.priorWorldVersion,
        canonicalizeCampaignPlayProjection([{ kind: "actor", id: actorId }]),
        canonicalizeCampaignPlayProjection([{ kind: "actor", id: actorId }]),
        canonicalizeCampaignPlayProjection(exposurePolicy),
        HASH_A, payload, hashCampaignPlayProjection(payload), createdAt,
      );
      context.sqlite.prepare(`INSERT INTO campaign_play_receipts (
        receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES (?, ?, 'turn-player', ?, 'set_actor_condition', 'applied', 1,
        ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        receiptId, context.campaignId, commandId, context.priorWorldVersion,
        context.targetWorldVersion, state.authority.worldHash, resultWorldHash,
        canonicalizeCampaignPlayProjection([eventId]), payload,
        hashCampaignPlayProjection(payload), createdAt,
      );
      context.sqlite.prepare(`INSERT INTO campaign_play_events (
        event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
        event_kind, source_json, world_time_minutes, world_version,
        affected_refs_json, before_payload_json, after_payload_json,
        payload_hash, created_at
      ) VALUES (?, ?, 'turn-player', ?, ?, NULL, 'actor_condition_changed',
        '{"kind":"system","system":"game_master"}', ?, ?, ?, '{}', ?, ?, ?)`)
        .run(eventId, context.campaignId, commandId, receiptId,
          state.authority.worldTimeMinutes, context.targetWorldVersion,
          canonicalizeCampaignPlayProjection([{ kind: "actor", id: actorId }]),
          payload, hashCampaignPlayProjection(payload), createdAt);
      context.sqlite.prepare(`INSERT INTO campaign_play_actor_conditions (
        actor_id, campaign_id, condition, present, summary, causal_receipt_id,
        world_version, updated_at
      ) VALUES (?, ?, 'incapacitated', 1,
        'The actor cannot take an action during this cadence.', ?, ?, ?)`)
        .run(actorId, context.campaignId, receiptId, context.targetWorldVersion, createdAt);
    },
  });
  if (exposureSource !== null && perceivedByActorId !== undefined) {
    const eventId = `fixture-event-incapacitate-${actorId}`;
    const exposureId = `fixture-exposure-incapacitate-${actorId}`;
    const sourceJson = canonicalizeCampaignPlayProjection(exposureSource);
    const sourceHash = hashCampaignPlayProjection(exposureSource);
    states.commitRuntime({
      event: {
        eventId: `fixture-knowledge-event-${actorId}`,
        turnId: "turn-player",
        kind: "visibility_projected",
        workerEpoch: 3,
        protectedPayloadHash: sourceHash,
        createdAt: createdAt + 10,
      },
      mutate(context) {
        context.sqlite.prepare(`INSERT INTO campaign_play_event_exposures (
          exposure_id, campaign_id, event_id, channel, location_id, route_id,
          witness_actor_id, valid_until_world_time_minutes, route_triggers_json, created_at
        ) VALUES (?, ?, ?, 'direct_perception', 'location-a', NULL, NULL, NULL, NULL, ?)`)
          .run(exposureId, context.campaignId, eventId, createdAt);
        context.sqlite.prepare(`INSERT INTO campaign_play_actor_knowledge (
          knowledge_id, campaign_id, actor_id, event_id, exposure_id, channel,
          source_location_id, source_route_id, source_trigger, source_witness_actor_id,
          perceived_actor_id, source_json, source_hash, learned_at_world_time_minutes, created_at
        ) VALUES (?, ?, ?, ?, ?, 'direct_perception', 'location-a', NULL, NULL, NULL,
          NULL, ?, ?, ?, ?)`)
          .run(`fixture-knowledge-incapacitate-${actorId}`, context.campaignId,
            perceivedByActorId, eventId, exposureId, sourceJson, sourceHash,
            state.authority.worldTimeMinutes, createdAt + 10);
      },
    });
  }
}

describe("Campaign Play actor scheduler", () => {
  it.each([30, 60] as const)(
    "freezes the seeded %s-action due set by debt, time, priority, and actor ID without a cast sweep",
    (completedActions) => {
      const { handle } = createReadyFixture(completedActions);
      const dueSet = freezeCurrent(handle);
      expect(dueSet.decisions.map((decision) => decision.actorId)).toEqual([
        "actor-d", "actor-b", "actor-a",
      ]);
      expect(dueSet.decisions.map((decision) => decision.disposition)).toEqual([
        "wake", "wake", "wake",
      ]);
      expect(dueSet.decisions.some((decision) => decision.actorId === "actor-c")).toBe(false);
      expect(dueSet.decisions.some((decision) =>
        decision.actorId === "actor-d" && decision.disposition === "wake")).toBe(true);
    },
  );

  it("repays agency debt before current-turn and earlier debt-free actors consume capacity", () => {
    const { handle, states, settledClock } = createReadyFixture();
    const current = states.loadState()!;
    const affectedRefs = [
      { kind: "actor", id: "actor-c" },
      { kind: "actor", id: "actor-player" },
    ] as const;
    const protectedPayload = canonicalizeCampaignPlayProjection({
      kind: "record_world_event",
      eventClass: "dialogue",
      performingActorId: "actor-c",
      summary: "Actor C answers the player before the scheduler resolves due work.",
      observableTrace: null,
      affectedRefs,
    });
    states.commitRuntime({
      event: {
        eventId: "agency-debt-capacity-fixture",
        turnId: "turn-player",
        kind: "actor_job_transitioned",
        workerEpoch: 3,
        protectedPayloadHash: HASH_A,
        createdAt: 1_570,
      },
      mutate(context) {
        context.sqlite.prepare(`UPDATE campaign_play_actor_schedules
          SET next_act_at_world_time_minutes = ?, updated_at = 1570
          WHERE campaign_id = ? AND actor_id = 'actor-c'`)
          .run(settledClock - 9, context.campaignId);
        context.sqlite.prepare(`INSERT INTO campaign_play_commands (
          command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
          causal_parent_json, source_json, expected_world_version, read_scope_json,
          write_scope_json, exposure_policy_json, arguments_hash,
          protected_payload_json, protected_payload_hash, created_at
        ) VALUES ('debt-contact-command', ?, 'turn-player', 'debt-contact-batch', 0,
          'record_world_event', '{"kind":"turn","turnId":"turn-player"}',
          '{"kind":"system","system":"game_master"}', ?, ?, '[]',
          '{"mode":"protected"}', ?, ?, ?, 1570)`).run(
          context.campaignId,
          current.authority.worldVersion,
          canonicalizeCampaignPlayProjection(affectedRefs),
          hashCampaignPlayProjection(protectedPayload),
          protectedPayload,
          hashCampaignPlayProjection(protectedPayload),
        );
        context.sqlite.prepare(`INSERT INTO campaign_play_receipts (
          receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
          applied_world_mutation, prior_world_version, result_world_version,
          prior_world_hash, result_world_hash, causal_event_ids_json,
          protected_payload_json, protected_payload_hash, created_at
        ) VALUES ('debt-contact-receipt', ?, 'turn-player', 'debt-contact-command',
          'record_world_event', 'applied', 0, ?, ?, ?, ?,
          '["debt-contact-world-event"]', ?, ?, 1570)`).run(
          context.campaignId,
          current.authority.worldVersion,
          current.authority.worldVersion,
          current.authority.worldHash,
          current.authority.worldHash,
          protectedPayload,
          hashCampaignPlayProjection(protectedPayload),
        );
      },
    });

    const dueSet = freezeCurrent(handle);
    expect(dueSet.decisions.map((decision) => [
      decision.actorId,
      decision.disposition,
      decision.agencyDebt,
    ])).toEqual([
      ["actor-d", "wake", 2],
      ["actor-c", "wake", 0],
      ["actor-b", "wake", 0],
      ["actor-a", "defer", 0],
    ]);
    expect(dueSet.decisions[3]).toMatchObject({
      reason: "actor_capacity",
      resultAgencyDebt: 1,
    });
  });

  it("does not grant an unscheduled extra action to a contacted actor with a completed plan", () => {
    const { handle, states, settledClock } = createReadyFixture();
    const current = states.loadState()!;
    const affectedRefs = [
      { kind: "actor", id: "actor-c" },
      { kind: "actor", id: "actor-player" },
    ] as const;
    const protectedPayload = canonicalizeCampaignPlayProjection({
      kind: "record_world_event",
      eventClass: "dialogue",
      performingActorId: "actor-c",
      summary: "Actor C accepts the new information and states a next step.",
      observableTrace: null,
      affectedRefs,
    });
    states.commitRuntime({
      event: {
        eventId: "contact-performer-recorded",
        turnId: "turn-player",
        kind: "actor_job_transitioned",
        workerEpoch: 3,
        protectedPayloadHash: hashCampaignPlayProjection(protectedPayload),
        createdAt: 1_570,
      },
      mutate(context) {
        context.sqlite.prepare(`UPDATE campaign_play_actor_plans
          SET status = 'completed', updated_at = 1570
          WHERE campaign_id = ? AND actor_id = 'actor-c'`).run(context.campaignId);
        context.sqlite.prepare(`INSERT INTO campaign_play_commands (
          command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
          causal_parent_json, source_json, expected_world_version, read_scope_json,
          write_scope_json, exposure_policy_json, arguments_hash,
          protected_payload_json, protected_payload_hash, created_at
        ) VALUES ('contact-command', ?, 'turn-player', 'contact-batch', 0,
          'record_world_event', '{"kind":"turn","turnId":"turn-player"}',
          '{"kind":"system","system":"game_master"}', ?, ?, '[]',
          '{"mode":"protected"}', ?, ?, ?, 1570)`).run(
          context.campaignId,
          current.authority.worldVersion,
          canonicalizeCampaignPlayProjection(affectedRefs),
          hashCampaignPlayProjection(protectedPayload),
          protectedPayload,
          hashCampaignPlayProjection(protectedPayload),
        );
        context.sqlite.prepare(`INSERT INTO campaign_play_receipts (
          receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
          applied_world_mutation, prior_world_version, result_world_version,
          prior_world_hash, result_world_hash, causal_event_ids_json,
          protected_payload_json, protected_payload_hash, created_at
        ) VALUES ('contact-receipt', ?, 'turn-player', 'contact-command',
          'record_world_event', 'applied', 0, ?, ?, ?, ?,
          '["contact-world-event"]', ?, ?, 1570)`).run(
          context.campaignId,
          current.authority.worldVersion,
          current.authority.worldVersion,
          current.authority.worldHash,
          current.authority.worldHash,
          protectedPayload,
          hashCampaignPlayProjection(protectedPayload),
        );
      },
    });

    const dueSet = freezeCurrent(handle);
    expect(dueSet.decisions.some((decision) => decision.actorId === "actor-c")).toBe(false);
    expect(dueSet.decisions.some((decision) =>
      decision.disposition === "wake" && decision.nextActAtWorldTimeMinutes <= settledClock))
      .toBe(true);
  });

  it("admits one queued job per due actor and reopens with identical deterministic job state", () => {
    const { handle, states } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    let admitted = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "jobs-admitted", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: hashCampaignPlayProjection(dueSet), createdAt: 1_600,
      },
      mutate(context) {
        admitted = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 });
      },
    });
    expect(admitted.map((job) => job.actorId)).toEqual(["actor-d", "actor-b", "actor-a"]);
    expect(new Set(admitted.map((job) => job.jobId)).size).toBe(3);
    expect(admitted.every((job) => job.stage === "queued" && job.workerEpoch === 0)).toBe(true);
    expect(scheduler.loadDueSet("turn-player")).toEqual(dueSet);
    expect(() => handle.sqlite.prepare(`UPDATE campaign_play_actor_due_sets
      SET created_at = created_at + 1 WHERE turn_id = 'turn-player'`).run()).toThrow();
    expect(() => handle.sqlite.prepare(`DELETE FROM campaign_play_actor_due_sets
      WHERE turn_id = 'turn-player'`).run()).toThrow();
    expect(freezeCurrent(handle).decisions.map((decision) =>
      [decision.actorId, decision.disposition,
        "reason" in decision ? decision.reason : null])).toEqual([
      ["actor-d", "skip", "already_considered_this_turn"],
      ["actor-b", "skip", "already_considered_this_turn"],
      ["actor-a", "skip", "already_considered_this_turn"],
    ]);

    const before = structuredClone(admitted);
    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = track(openCampaignPlayDatabase(CAMPAIGN_ID));
    const reopenedScheduler = createCampaignPlayActorScheduler(reopened);
    expect(reopenedScheduler.listTurnJobs("turn-player")).toEqual(before);
    expect(reopenedScheduler.loadDueSet("turn-player")).toEqual(dueSet);
  });

  it("rejects a due-set decision ledger when its required actor jobs are absent", () => {
    const { handle } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    handle.sqlite.prepare(`INSERT INTO campaign_play_actor_due_sets (
      turn_id, campaign_id, settled_world_time_minutes,
      base_world_version, base_runtime_revision, decisions_json,
      due_set_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)` ).run(
      dueSet.turnId,
      dueSet.campaignId,
      dueSet.settledWorldTimeMinutes,
      dueSet.baseWorldVersion,
      dueSet.baseRuntimeRevision,
      canonicalizeCampaignPlayProjection(dueSet.decisions),
      hashCampaignPlayProjection({ domain: "campaign_play_actor_due_set", value: dueSet }),
      1_600,
    );

    expect(() => scheduler.validateTurnSettlement(dueSet.turnId))
      .toThrow("scheduler_job_invalid");
  });

  it.each([
    ["model_contract_invalid", "replan_invalid"],
    ["model_contract_invalid", "control_budget"],
    ["provider_unavailable", "control_budget"],
    ["stage_timeout", "control_budget"],
    ["stage_budget_exceeded", "control_budget"],
  ] as const)("accepts %s with deferred reason %s", (errorCode, deferReason) => {
    const fixture = createDeferredModelValidationFixture(errorCode, deferReason);
    expect(() => fixture.scheduler.validateTurnSettlement(
      "turn-player", validationContext(fixture, fixture.dueSet),
    )).not.toThrow();
    expect(fixture.scheduler.listTurnJobs("turn-player").find((job) => job.jobId === fixture.targetJobId))
      .toMatchObject({ stage: "deferred", deferReason });
  });

  it.each([
    ["provider_unavailable", "replan_invalid"],
    ["stage_timeout", "replan_invalid"],
    ["stage_budget_exceeded", "replan_invalid"],
    ["model_contract_invalid", "replan_capacity"],
    ["model_contract_invalid", "actor_capacity"],
  ] as const)("rejects incompatible %s with deferred reason %s", (errorCode, deferReason) => {
    const fixture = createDeferredModelValidationFixture(errorCode, deferReason);
    expect(() => fixture.scheduler.validateTurnSettlement(
      "turn-player", validationContext(fixture, fixture.dueSet),
    ))
      .toThrow("scheduler_job_invalid");
  });

  it("accepts three direct control-budget deferrals without an actor model outcome", () => {
    const { handle, states } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    let jobs = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "scheduler-direct-control-budget-jobs",
        turnId: "turn-player",
        kind: "actor_job_transitioned",
        workerEpoch: 3,
        protectedPayloadHash: hashCampaignPlayProjection(dueSet),
        createdAt: 1_600,
      },
      mutate(context) {
        jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 });
      },
    });
    expect(jobs).toHaveLength(3);
    for (const job of jobs) {
      handle.sqlite.prepare(`UPDATE campaign_play_actor_jobs SET
          stage = 'deferred', defer_reason = 'control_budget', completed_at = 1_620
        WHERE job_id = ? AND stage = 'queued'`).run(job.jobId);
    }

    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = ? AND kind = 'actor_replanner'`).get(
      CAMPAIGN_ID,
      dueSet.turnId,
    )).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count
      FROM campaign_play_actor_replan_attempts
      WHERE campaign_id = ? AND turn_id = ?`).get(
      CAMPAIGN_ID,
      dueSet.turnId,
    )).toEqual({ count: 0 });
    expect(jobs.every((job) => job.proposalId === null)).toBe(true);
    expect(() => scheduler.validateTurnSettlement(
      dueSet.turnId,
      {
        sqlite: handle.sqlite,
        campaignId: handle.campaignId,
        priorWorldVersion: dueSet.baseWorldVersion,
        targetWorldVersion: dueSet.baseWorldVersion,
        priorRuntimeRevision: dueSet.baseRuntimeRevision,
        targetRuntimeRevision: dueSet.baseRuntimeRevision,
        runtimeEventSequence: null,
        mechanicalHash: () => "",
      },
    )).not.toThrow();
  });

  it("rejects a deferred actor job while its latest model stage is still started", () => {
    const fixture = createDeferredModelValidationFixture(null, "replan_capacity");
    const scheduler = fixture.scheduler;
    const stageId = deriveCampaignPlayActorReplanStageId(fixture.targetJobId);
    fixture.handle.sqlite.prepare(`INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status, worker_epoch,
        requested_provider_id, requested_model, requested_strategy,
        schema_outcome, created_at
      ) VALUES ('scheduler-validation-started', ?, 1, ?, 'turn-player',
        'actor_replanner', 'started', 1, 'test-provider', 'actor-replanner',
        'strict_object', 'pending', 1_600)`).run(stageId, CAMPAIGN_ID);
    expect(() => scheduler.validateTurnSettlement(
      "turn-player", validationContext(fixture, fixture.dueSet),
    ))
      .toThrow("scheduler_job_invalid");
  });

  it("builds a due actor frame from the latest mechanical version and only actor-scoped truth", () => {
    const { handle, states } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    let jobs = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "jobs-for-frame", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: hashCampaignPlayProjection(dueSet), createdAt: 1_600,
      },
      mutate(context) { jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 }); },
    });
    const actorAJob = jobs.find((job) => job.actorId === "actor-a")!;
    const before = scheduler.buildActorFrame(actorAJob.jobId);
    states.commitMechanical({
      updatedAt: 1_610,
      worldVersionAdvance: 1,
      mutate(context) {
        context.sqlite.prepare(`UPDATE actor_placements SET location_id = 'location-c'
          WHERE campaign_id = ? AND actor_id = 'actor-a' AND placement_kind = 'present'`)
          .run(context.campaignId);
      },
    });
    const after = scheduler.buildActorFrame(actorAJob.jobId);
    expect(after.baseWorldVersion).toBe(before.baseWorldVersion + 1);
    expect(after.placements).toMatchObject([{ actorId: "actor-a", locationId: "location-c" }]);
    expect(after.goals.map((goal) => goal.actorId)).toEqual(["actor-a"]);
    expect(after.relations.every((relation) =>
      relation.sourceActorId === "actor-a" || relation.targetActorId === "actor-a")).toBe(true);
    expect(after.localRoutes.map((route) => route.id)).toEqual([
      "route-archive-c",
      "route-b",
      "route-c",
      "route-c-archive",
    ]);
    expect(after.knownPressures.map((pressure) => pressure.id)).toEqual(["pressure-a", "pressure-b"]);
    expect(after.knownEvents).toEqual([]);
    expect(after.authorizedRefs.some((reference) => reference.kind === "actor" && reference.id === "actor-c"))
      .toBe(false);
    expect(after.selection).toMatchObject({ kind: "step", step: { stepId: "step-actor-a-one" } });
  });

  it("turns a failed persisted precondition into an explicit replan boundary", () => {
    const { handle, states } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    let jobs = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "jobs-for-precondition", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: hashCampaignPlayProjection(dueSet), createdAt: 1_600,
      },
      mutate(context) { jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 }); },
    });
    const actorBJob = jobs.find((job) => job.actorId === "actor-b")!;
    expect(scheduler.buildActorFrame(actorBJob.jobId).selection).toMatchObject({ kind: "step" });
    states.commitMechanical({
      updatedAt: 1_610,
      worldVersionAdvance: 1,
      mutate(context) {
        context.sqlite.prepare(`UPDATE actor_placements SET location_id = 'location-c'
          WHERE campaign_id = ? AND actor_id = 'actor-b' AND placement_kind = 'present'`)
          .run(context.campaignId);
      },
    });
    expect(scheduler.buildActorFrame(actorBJob.jobId).selection).toEqual({
      kind: "replan_required",
      reason: "precondition_failed",
      failedPreconditionIndexes: [0],
    });
  });

  it("replans before a stale next step when the actor learned a later external event", () => {
    const { handle, states } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    let jobs = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "jobs-for-world-advance", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: hashCampaignPlayProjection(dueSet), createdAt: 1_600,
      },
      mutate(context) { jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 }); },
    });
    const actorAJob = jobs.find((job) => job.actorId === "actor-a")!;
    expect(scheduler.buildActorFrame(actorAJob.jobId).selection).toMatchObject({ kind: "step" });

    persistIncapacitatedCondition(handle, "actor-d", 1_610, "actor-a");

    expect(scheduler.buildActorFrame(actorAJob.jobId).selection).toEqual({
      kind: "replan_required",
      reason: "world_advanced",
      failedPreconditionIndexes: [],
    });
  });

  it("returns a replan boundary after the final persisted plan step settles", () => {
    const plan = {
      planId: "plan-actor-a",
      campaignId: CAMPAIGN_ID,
      actorId: "actor-a",
      goalId: "goal-a",
      planVersion: 1,
      intent: {
        kind: "attempt" as const,
        targets: [{ kind: "goal" as const, id: "goal-a" }],
        method: "Advance the active goal",
        stakes: "The actor's current objective",
      },
      preconditions: [],
      cadenceMinutes: 20,
      priority: 3,
      steps: [
        { stepId: "step-a-one", order: 0, intent: {
          kind: "attempt" as const, targets: [{ kind: "goal" as const, id: "goal-a" }],
          method: "Begin the active goal", stakes: "The actor's current objective",
        }, observableTrace: "Fresh preparation marks the start of the work.",
        possessionOutcome: { kind: "none" as const },
        obligationOutcome: { kind: "none" as const },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 } },
        { stepId: "step-a-two", order: 1, intent: {
          kind: "attempt" as const, targets: [{ kind: "goal" as const, id: "goal-a" }],
          method: "Finish the active goal", stakes: "The actor's current objective",
        }, observableTrace: "The completed work leaves fresh tool marks behind.",
        possessionOutcome: { kind: "none" as const },
        obligationOutcome: { kind: "none" as const },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 } },
      ],
      status: "active" as const,
    };
    expect(selectCampaignPlayActorPlanStep({
      plan,
      settledStepCount: 2,
      failedPreconditionIndexes: [],
    })).toEqual({
      kind: "replan_required",
      reason: "plan_exhausted",
      failedPreconditionIndexes: [],
    });
  });

  it("selects an explicit replan boundary when accepted external world state advanced", () => {
    const plan = {
      planId: "plan-actor-a",
      campaignId: CAMPAIGN_ID,
      actorId: "actor-a",
      goalId: "goal-a",
      planVersion: 1,
      intent: { kind: "attempt" as const, targets: [], method: null, stakes: null },
      preconditions: [],
      cadenceMinutes: 20,
      priority: 3,
      steps: [{
        stepId: "step-a-one", order: 0,
        intent: { kind: "attempt" as const, targets: [], method: null, stakes: null },
        observableTrace: "Fresh work remains visible.",
        possessionOutcome: { kind: "none" as const },
        obligationOutcome: { kind: "none" as const },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 },
      }],
      status: "active" as const,
    };
    expect(selectCampaignPlayActorPlanStep({
      plan,
      settledStepCount: 0,
      failedPreconditionIndexes: [],
      worldAdvanced: true,
    })).toEqual({
      kind: "replan_required",
      reason: "world_advanced",
      failedPreconditionIndexes: [],
    });
  });

  it("calculates settled and deferred cadence from the settled clock without catch-up", () => {
    expect(calculateCampaignPlayActorNextDueTime({
      settledWorldTimeMinutes: 600,
      cadenceMinutes: 30,
      lastActAtWorldTimeMinutes: 10,
      agencyDebt: 7,
      outcome: "settled",
    })).toEqual({ nextActAtWorldTimeMinutes: 630, lastActAtWorldTimeMinutes: 600, agencyDebt: 0 });
    expect(calculateCampaignPlayActorNextDueTime({
      settledWorldTimeMinutes: 600,
      cadenceMinutes: 30,
      lastActAtWorldTimeMinutes: 10,
      agencyDebt: 7,
      outcome: "deferred",
    })).toEqual({ nextActAtWorldTimeMinutes: 630, lastActAtWorldTimeMinutes: 10, agencyDebt: 8 });
  });

  it.each([30, 60] as const)(
    "keeps actor cadence bounded across % consecutive settled-clock advances and a restart",
    (completedActions) => {
      let schedule = {
        nextActAtWorldTimeMinutes: 0,
        lastActAtWorldTimeMinutes: null as number | null,
        agencyDebt: 0,
      };
      let opportunities = 0;
      let deferred = 0;
      for (let action = 1; action <= completedActions; action += 1) {
        const settledWorldTimeMinutes = action * 10;
        if (schedule.nextActAtWorldTimeMinutes <= settledWorldTimeMinutes) {
          opportunities += 1;
          const outcome = opportunities % 4 === 0 ? "deferred" as const : "settled" as const;
          if (outcome === "deferred") deferred += 1;
          schedule = calculateCampaignPlayActorNextDueTime({
            settledWorldTimeMinutes,
            cadenceMinutes: 20,
            lastActAtWorldTimeMinutes: schedule.lastActAtWorldTimeMinutes,
            agencyDebt: schedule.agencyDebt,
            outcome,
          });
          expect(schedule.nextActAtWorldTimeMinutes).toBe(settledWorldTimeMinutes + 20);
        }
        if (action === Math.floor(completedActions / 2)) {
          schedule = JSON.parse(JSON.stringify(schedule)) as typeof schedule;
        }
      }
      expect(opportunities).toBe(Math.ceil(completedActions / 2));
      expect(deferred).toBe(Math.floor(opportunities / 4));
      expect(schedule.agencyDebt).toBe(opportunities % 4 === 0 ? 1 : 0);
    },
  );

  it("records an incapacitated due actor as deferred and advances debt and cadence durably", () => {
    const { handle, states, settledClock } = createReadyFixture();
    persistIncapacitatedCondition(handle, "actor-a", 1_580);
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    expect(dueSet.decisions.find((decision) => decision.actorId === "actor-a")).toMatchObject({
      disposition: "defer",
      reason: "incapacitated",
      nextDueAtWorldTimeMinutes: settledClock + 20,
      resultAgencyDebt: 1,
    });
    let jobs = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "deferred-job-admitted", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: hashCampaignPlayProjection(dueSet), createdAt: 1_600,
      },
      mutate(context) { jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 }); },
    });
    expect(jobs.map((job) => [job.actorId, job.stage])).toEqual([
      ["actor-d", "queued"], ["actor-b", "queued"], ["actor-a", "deferred"],
    ]);
    expect(jobs.find((job) => job.actorId === "actor-a")?.completedAt).toBe(1_600);
    expect(handle.sqlite.prepare(`SELECT next_act_at_world_time_minutes AS nextAt,
      agency_debt AS agencyDebt FROM campaign_play_actor_schedules
      WHERE campaign_id = ? AND actor_id = 'actor-a'`).get(handle.campaignId)).toEqual({
      nextAt: settledClock + 20,
      agencyDebt: 1,
    });
  });

  it("defers an inactive plan beyond actor capacity and advances its retry schedule", () => {
    const { handle, states, settledClock } = createReadyFixture();
    states.commitRuntime({
      event: {
        eventId: "inactive-capacity-fixture",
        turnId: "turn-player",
        kind: "actor_job_transitioned",
        workerEpoch: 3,
        protectedPayloadHash: HASH_A,
        createdAt: 1_570,
      },
      mutate(context) {
        context.sqlite.prepare(`UPDATE campaign_play_actor_schedules
          SET next_act_at_world_time_minutes = ?, updated_at = 1570
          WHERE campaign_id = ? AND actor_id = 'actor-c' AND plan_id = 'plan-actor-c'`)
          .run(settledClock - 4, context.campaignId);
        context.sqlite.prepare(`UPDATE campaign_play_actor_plans
          SET status = 'blocked', updated_at = 1571
          WHERE campaign_id = ? AND actor_id = 'actor-c' AND plan_id = 'plan-actor-c'`)
          .run(context.campaignId);
      },
    });

    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    expect(dueSet.decisions.find((decision) => decision.actorId === "actor-c"))
      .toMatchObject({
        disposition: "defer",
        dueReason: "plan_retry",
        reason: "actor_capacity",
        nextDueAtWorldTimeMinutes: settledClock + 25,
        resultAgencyDebt: 1,
      });

    let jobs = scheduler.listTurnJobs("turn-player");
    states.commitRuntime({
      event: {
        eventId: "inactive-capacity-admitted",
        turnId: "turn-player",
        kind: "actor_job_transitioned",
        workerEpoch: 3,
        protectedPayloadHash: hashCampaignPlayProjection(dueSet),
        createdAt: 1_580,
      },
      mutate(context) {
        jobs = scheduler.admitDueSet({ dueSet, context, createdAt: 1_580 });
      },
    });

    expect(jobs.find((job) => job.actorId === "actor-c")).toMatchObject({
      stage: "deferred",
      dueReason: "plan_retry",
      deferReason: "actor_capacity",
      completedAt: 1_580,
    });
    expect(handle.sqlite.prepare(`SELECT next_act_at_world_time_minutes AS nextAt,
      agency_debt AS agencyDebt FROM campaign_play_actor_schedules
      WHERE campaign_id = ? AND actor_id = 'actor-c'`).get(handle.campaignId)).toEqual({
      nextAt: settledClock + 25,
      agencyDebt: 1,
    });
  });

  it("rejects cloned and stale due sets with zero admitted jobs", () => {
    const { handle, states } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    expect(() => states.commitRuntime({
      event: {
        eventId: "forged-due-set", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: HASH_A, createdAt: 1_600,
      },
      mutate(context) {
        scheduler.admitDueSet({ dueSet: structuredClone(dueSet), context, createdAt: 1_600 });
      },
    })).toThrowError(expect.objectContaining({ code: "scheduler_due_set_invalid" }));
    expect(scheduler.listTurnJobs("turn-player")).toEqual([]);

    states.commitRuntime({
      event: {
        eventId: "scheduler-state-advanced", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: HASH_B, createdAt: 1_610,
      },
      mutate(context) {
        context.sqlite.prepare(`UPDATE campaign_play_actor_schedules
          SET agency_debt = agency_debt + 1, updated_at = 1610
          WHERE campaign_id = ? AND actor_id = 'actor-c'`).run(context.campaignId);
      },
    });
    expect(() => states.commitRuntime({
      event: {
        eventId: "stale-due-set", turnId: "turn-player", kind: "actor_job_transitioned",
        workerEpoch: 3, protectedPayloadHash: HASH_A, createdAt: 1_620,
      },
      mutate(context) { scheduler.admitDueSet({ dueSet, context, createdAt: 1_620 }); },
    })).toThrowError(expect.objectContaining({ code: "scheduler_due_set_stale" }));
    expect(scheduler.listTurnJobs("turn-player")).toEqual([]);
  });

  it("rejects a stored due set whose durable hash disagrees with its canonical decisions", () => {
    const { handle } = createReadyFixture();
    const scheduler = createCampaignPlayActorScheduler(handle);
    const dueSet = freezeCurrent(handle);
    handle.sqlite.prepare(`INSERT INTO campaign_play_actor_due_sets (
      turn_id, campaign_id, settled_world_time_minutes, base_world_version,
      base_runtime_revision, decisions_json, due_set_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1600)`).run(
      dueSet.turnId,
      dueSet.campaignId,
      dueSet.settledWorldTimeMinutes,
      dueSet.baseWorldVersion,
      dueSet.baseRuntimeRevision,
      canonicalizeCampaignPlayProjection(dueSet.decisions),
      HASH_A,
    );
    expect(() => scheduler.loadDueSet("turn-player"))
      .toThrowError(expect.objectContaining({ code: "scheduler_due_set_invalid" }));
  });
});
