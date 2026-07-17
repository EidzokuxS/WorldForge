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
  createCampaignPlayActorProposalService,
  type CampaignPlayActorProposalOutcome,
  type CampaignPlayActorProposalService,
  type ProcessCampaignPlayActorProposalsInput,
} from "./actor-proposal-service.js";
import { createCampaignPlayActorScheduler } from "./actor-scheduler.js";
import { openCampaignPlayDatabase, type CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import { canonicalizeCampaignPlayProjection, hashCampaignPlayProjection,
  deriveCampaignPlayPossessionId, deriveCampaignPlayPossessionKey,
  type CampaignPlayProjectionRecord } from "./campaign-play-projection.js";
import type { CampaignPlayOpeningExposureSeed } from "./opening-planner.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import { createCampaignPlayTurnRepository } from "./campaign-play-turn-repository.js";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
const TEST_EXPOSURE_SEED: CampaignPlayOpeningExposureSeed = {
  sourceActorId: "actor-b",
  sourceGoalId: "goal-b",
  sourceLocationId: "location-a",
  summary: "The courier changes which route ledger reaches the reef.",
  observableTrace: "Fresh sealing wax and torn binding thread mark a ledger removed in haste.",
  predicate: {
    channel: "local_aftermath",
    locationId: "location-a",
    validUntilWorldTimeMinutes: 4,
  },
  discoverableWithinPlayerActions: 2,
};
let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-actor-proposals-"));
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

function countForCampaign(handle: CampaignPlayDatabaseHandle, table: string): number {
  return (handle.sqlite.prepare(`SELECT count(*) AS count FROM ${table}
    WHERE campaign_id = ?`).get(CAMPAIGN_ID) as { count: number }).count;
}

function buildAcceptedCampaign(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "build-actor-proposals",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-actor-proposals");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b" ? { ...placement, locationId: "location-a" } : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-actor-proposals",
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

function planJson(
  actorId: string,
  goalId: string,
  actorBRouteId = "route-a",
  actorBIntent: "move" | "wait" | "remote_wait" = "move",
  actorAAcquire = false,
) {
  const move = actorId === "actor-b" && actorBIntent === "move";
  const wait = actorId === "actor-b" &&
    (actorBIntent === "wait" || actorBIntent === "remote_wait");
  const intent = move
    ? {
        kind: "move" as const,
        targets: [
          { kind: "route" as const, id: actorBRouteId },
          { kind: "goal" as const, id: goalId },
        ],
        method: "Carry the sealed route ledger to Glass Reef",
        stakes: "The reef passage may close",
      }
    : wait
      ? {
          kind: "wait" as const,
          targets: [
            { kind: "location" as const, id: actorBIntent === "remote_wait" ? "location-b" : "location-a" },
            { kind: "goal" as const, id: goalId },
          ],
          method: "Wait beside the reef ledger office for the clerk to return",
          stakes: "The current route answer is still unknown",
        }
      : {
        kind: "attempt" as const,
        targets: [{ kind: "goal" as const, id: goalId }],
        method: "Advance the active goal",
        stakes: "The actor's current objective",
      };
  return {
    intentJson: canonicalizeCampaignPlayProjection(intent),
    preconditionsJson: canonicalizeCampaignPlayProjection([]),
    stepsJson: canonicalizeCampaignPlayProjection([
      { stepId: `step-${actorId}-one`, order: 0, intent,
        observableTrace: move
          ? "Fresh wet wheel tracks end beside the reef ledger office."
          : wait
            ? "A fresh pacing track marks the stones outside the ledger office."
            : "Fresh work marks show that the objective advanced here.",
        possessionOutcome: actorId === "actor-a" && actorAAcquire
          ? { kind: "acquire", name: "Brass tally", quantity: 2 }
          : { kind: "none" },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 } },
      { stepId: `step-${actorId}-two`, order: 1,
        intent: { ...intent, method: move ? "Return with the route answer" : "Continue the active goal" },
        observableTrace: move
          ? "New wheel ruts turn back from the ledger office."
          : "A second set of fresh marks continues the same work.",
        possessionOutcome: { kind: "none" },
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 8 } },
    ]),
  };
}

function createReadyFixture(
  playerLocationId = "location-c",
  actorBRouteId = "route-a",
  actorBPlanVersion = 1,
  actorBIntent: "move" | "wait" | "remote_wait" = "move",
  actorAAcquire = false,
) {
  buildAcceptedCampaign();
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  states.createState({ eventId: "state-created", createdAt: 1_300 });
  const settledClock = 0;
  states.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: {
      eventId: "proposal-fixture-ready",
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
      ) VALUES ('live-player', ?, 'actor-player', ?, 'present')`)
        .run(context.campaignId, playerLocationId);
      const schedules = [
        {
          actorId: "actor-a",
          goalId: "goal-a",
          nextAt: 0,
          priority: actorAAcquire ? 5 : 3,
          cadence: 20,
        },
        { actorId: "actor-b", goalId: "goal-b", nextAt: 0, priority: 5, cadence: 30 },
        { actorId: "actor-d", goalId: "goal-d", nextAt: 0, priority: 4, cadence: 40 },
        { actorId: "actor-c", goalId: "goal-c", nextAt: 1, priority: 5, cadence: 25 },
      ];
      for (const schedule of schedules) {
        const planId = `plan-${schedule.actorId}`;
        const json = planJson(
          schedule.actorId,
          schedule.goalId,
          actorBRouteId,
          actorBIntent,
          actorAAcquire,
        );
        const planVersion = schedule.actorId === "actor-b" ? actorBPlanVersion : 1;
        if (planVersion > 1) {
          const prior = planJson(schedule.actorId, schedule.goalId, actorBRouteId);
          context.sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
            plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
            preconditions_json, cadence_minutes, priority, steps_json, status, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, 'active', 1399, 1399)`).run(
            `${planId}-prior`, context.campaignId, schedule.actorId, schedule.goalId,
            prior.intentJson, prior.preconditionsJson, schedule.cadence, schedule.priority,
            prior.stepsJson,
          );
          context.sqlite.prepare(`UPDATE campaign_play_actor_plans
            SET status = 'completed', updated_at = 1400
            WHERE campaign_id = ? AND plan_id = ?`).run(
              context.campaignId,
              `${planId}-prior`,
            );
        }
        context.sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
          plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
          preconditions_json, cadence_minutes, priority, steps_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 1400, 1400)`).run(
          planId, context.campaignId, schedule.actorId, schedule.goalId,
          planVersion, json.intentJson, json.preconditionsJson, schedule.cadence, schedule.priority,
          json.stepsJson,
        );
        context.sqlite.prepare(`INSERT INTO campaign_play_actor_schedules (
          schedule_id, campaign_id, actor_id, plan_id, next_act_at_world_time_minutes,
          last_act_at_world_time_minutes, priority, agency_debt, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, NULL, ?, 0, 1400, 1400)`).run(
          `schedule-${schedule.actorId}`, context.campaignId, schedule.actorId, planId,
          schedule.nextAt, schedule.priority,
        );
      }
      context.sqlite.prepare(`UPDATE campaign_play_states SET
        setup_phase = 'ready', world_time_minutes = 0, opened_at = 1400
        WHERE campaign_id = ?`).run(context.campaignId);
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
    owner: "proposal-worker", claimedAt: 1_510, leaseExpiresAt: 2_000,
    mutationId: "judge-claimed",
  });
  turns.acceptModelArtifact({
    token: judge,
    artifact: {
      ruling: {
        disposition: "clarification_required",
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
        requiredPossessionEffect: { kind: "none" },
        citedVisibleFactHandles: [],
        resultBounds: { minimum: "no_effect", maximum: "no_effect" },
        elapsedBounds: { minimumMinutes: 0, maximumMinutes: 0 },
        uncertainty: { kind: "none" },
        reason: "The fixture keeps primary settlement mechanical state unchanged.",
        clarificationQuestion: "How long do you wait?",
      },
      resolution: { kind: "deterministic", result: "no_effect" },
      uncertaintyAuthority: null,
      publicResult: {
        intentKind: "wait",
        disposition: "clarification_required",
        result: "no_effect",
        clarificationQuestion: "How long do you wait?",
      },
      primaryPlan: {
        kind: "no_effect",
        reason: "clarification_required",
        commands: [],
      },
    },
    evidence: modelEvidence("judge"),
    mutationDomain: "runtime", acceptedAt: 1_520, mutationId: "judge-accepted",
  });
  const primary = turns.claimStage({
    turnId: "turn-player", expectedStage: "planned", observedEpoch: 1,
    owner: "proposal-worker", claimedAt: 1_550, leaseExpiresAt: 2_000,
    mutationId: "primary-claimed",
  });
  turns.commitDeterministic({
    token: primary,
    transition: "primary_settled",
    worldVersionAdvance: 0,
    committedAt: 1_560,
    mutationId: "primary-settled",
  });
  const primarySettled = turns.loadTurn("turn-player");
  if (!primarySettled || primarySettled.stage !== "primary_settled") {
    throw new Error("Actor proposal fixture could not load its primary-settled turn.");
  }
  const token = turns.claimStage({
    turnId: "turn-player",
    expectedStage: "primary_settled",
    observedEpoch: primarySettled.workerEpoch,
    owner: "actor-settlement-worker",
    claimedAt: 1_590,
    leaseExpiresAt: 3_000,
    mutationId: "actor-settlement-claimed",
  });
  const state = states.loadState()!;
  const scheduler = createCampaignPlayActorScheduler(handle);
  const dueSet = scheduler.freezeDueSet({
    turnId: token.turnId,
    expectedWorldVersion: state.authority.worldVersion,
    expectedRuntimeRevision: state.authority.runtimeRevision,
  });
  turns.commitActorTransition({
    token,
    leaseMode: "live",
    worldVersionAdvance: 0,
    mutationId: "jobs-admitted",
    protectedPayloadHash: hashCampaignPlayProjection(dueSet),
    committedAt: 1_600,
    mutate(context) {
      scheduler.admitDueSet({ dueSet, context, createdAt: 1_600 });
    },
  });
  return {
    handle,
    states,
    token,
    settledClock,
    baseWorldVersion: states.loadState()!.authority.worldVersion,
  };
}

function processDueActors(
  service: CampaignPlayActorProposalService,
  input: ProcessCampaignPlayActorProposalsInput,
): CampaignPlayActorProposalOutcome[] {
  const outcomes: CampaignPlayActorProposalOutcome[] = [];
  while (true) {
    const outcome = service.processNext(input);
    if (outcome === null) return outcomes;
    outcomes.push(outcome);
    if (outcome.kind === "replan_required") return outcomes;
  }
}

describe("Campaign Play actor proposal service", () => {
  it("projects a co-located actor action through direct perception", () => {
    const { handle, token } = createReadyFixture("location-a");
    let actorMoveCommand: unknown = null;
    let unrelatedActorSummary: string | null = null;

    processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
        openingExposureSeed: TEST_EXPOSURE_SEED,
      beforeSettlement(proposal) {
        if (proposal.actorId === "actor-b") {
          actorMoveCommand = proposal.commands[0];
        }
        if (proposal.actorId === "actor-a" && proposal.commands[0]?.kind === "record_world_event") {
          unrelatedActorSummary = proposal.commands[0].summary;
        }
      },
    });

    expect(actorMoveCommand).toMatchObject({
      kind: "move_actor",
      observableTrace: "Fresh wet wheel tracks end beside the reef ledger office.",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-a" }],
      },
    });
    expect(unrelatedActorSummary).not.toBe(TEST_EXPOSURE_SEED.summary);
    expect(unrelatedActorSummary).toContain("Advance the active goal");
  });

  it("does not reuse the opening consequence after an actor replan", () => {
    const { handle, token } = createReadyFixture("location-c", "route-a", 2, "wait");
    let actorCommand: unknown = null;

    processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
      beforeSettlement(proposal) {
        if (proposal.actorId === "actor-b") actorCommand = proposal.commands[0];
      },
    });

    expect(actorCommand).toMatchObject({
      kind: "record_world_event",
      summary: expect.stringContaining("Wait beside the reef ledger office"),
      exposure: {
        mode: "projectable",
        predicates: [{
          channel: "local_aftermath",
          locationId: "location-a",
          validUntilWorldTimeMinutes: 1_440,
        }],
      },
    });
    expect(actorCommand).not.toMatchObject({ summary: TEST_EXPOSURE_SEED.summary });
  });

  it("rejects an unresolved move instead of recording travel prose", () => {
    const { handle, token } = createReadyFixture("location-a", "route-b");

    const outcomes = processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
    });
    expect(outcomes).toContainEqual(expect.objectContaining({
      kind: "rejected",
      proposalId: null,
      reason: "invalid_step",
    }));
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_actor_proposals
      WHERE campaign_id = ? AND actor_id = 'actor-b'`).get(CAMPAIGN_ID)).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`SELECT stage, proposal_id AS proposalId
      FROM campaign_play_actor_jobs WHERE campaign_id = ? AND actor_id = 'actor-b'`).get(
        CAMPAIGN_ID,
      )).toEqual({ stage: "rejected", proposalId: null });
    expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_actor_plans
      WHERE campaign_id = ? AND actor_id = 'actor-b' AND plan_version = 1`).get(
        CAMPAIGN_ID,
      )).toEqual({ status: "blocked" });
    expect(() => createCampaignPlayActorScheduler(handle).validateTurnSettlement(token.turnId))
      .not.toThrow();
  });

  it("rejects a non-move step aimed at a location outside the actor's scene", () => {
    const { handle, token } = createReadyFixture("location-c", "route-a", 1, "remote_wait");

    const outcomes = processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
    });

    expect(outcomes).toContainEqual(expect.objectContaining({
      kind: "rejected",
      proposalId: null,
      reason: "invalid_step",
    }));
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_actor_proposals
      WHERE campaign_id = ? AND actor_id = 'actor-b'`).get(CAMPAIGN_ID)).toEqual({ count: 0 });
    expect(handle.sqlite.prepare(`SELECT stage FROM campaign_play_actor_jobs
      WHERE campaign_id = ? AND actor_id = 'actor-b'`).get(CAMPAIGN_ID))
      .toEqual({ stage: "rejected" });
    expect(handle.sqlite.prepare(`SELECT status FROM campaign_play_actor_plans
      WHERE campaign_id = ? AND actor_id = 'actor-b' AND plan_version = 1`).get(CAMPAIGN_ID))
      .toEqual({ status: "blocked" });
    expect(() => createCampaignPlayActorScheduler(handle).validateTurnSettlement(token.turnId))
      .not.toThrow();
  });

  it("leaves a finite sensory aftermath for an offscreen autonomous action", () => {
    const { handle, token } = createReadyFixture();
    let actorCommand: unknown = null;

    processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
      beforeSettlement(proposal) {
        if (proposal.actorId === "actor-a") actorCommand = proposal.commands[0];
      },
    });

    expect(actorCommand).toMatchObject({
      kind: "record_world_event",
      performingActorId: "actor-a",
      observableTrace: "Fresh work marks show that the objective advanced here.",
      exposure: {
        mode: "projectable",
        predicates: [{
          channel: "local_aftermath",
          locationId: "location-a",
          validUntilWorldTimeMinutes: 1_440,
        }],
      },
    });
  });

  it("compiles an actor acquisition as one possession command", () => {
    const { handle, token } = createReadyFixture("location-a", "route-a", 1, "move", true);

    let acquisitionCommand: Record<string, unknown> | null = null;
    processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
      beforeSettlement(proposal) {
        if (proposal.actorId === "actor-a") {
          acquisitionCommand = proposal.commands[0] as Record<string, unknown>;
        }
      },
    });

    const possessionKey = deriveCampaignPlayPossessionKey("Brass tally");
    const possessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, "actor-a", possessionKey);
    expect(acquisitionCommand).toMatchObject({
      kind: "adjust_actor_possession",
      actorId: "actor-a",
      possessionId,
      possessionKey,
      name: "Brass tally",
      quantityDelta: 2,
      summary: "Fresh work marks show that the objective advanced here.",
      affectedRefs: [
        { kind: "actor", id: "actor-a" },
        { kind: "goal", id: "goal-a" },
      ],
      readScope: [
        { kind: "actor", id: "actor-a" },
        { kind: "possession", id: possessionId },
        { kind: "goal", id: "goal-a" },
      ],
      writeScope: [{ kind: "possession", id: possessionId }],
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-a" }],
      },
    });
  });

  it("rejects detached stale work with zero proposal mutation and one debt-bearing retry", () => {
    const { handle, states, token, settledClock, baseWorldVersion } = createReadyFixture();
    let injected = false;
    const outcomes = processDueActors(createCampaignPlayActorProposalService(handle, {
      now: () => 1_700,
    }), {
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
      beforeSettlement(proposal) {
        if (injected || proposal.actorId !== "actor-b") return;
        injected = true;
        states.commitMechanical({
          updatedAt: 1_702,
          worldVersionAdvance: 1,
          mutate(context) {
            context.sqlite.prepare(`UPDATE actor_placements SET location_id = 'location-b'
              WHERE campaign_id = ? AND actor_id = 'actor-a' AND placement_kind = 'present'`)
              .run(context.campaignId);
          },
        });
      },
    });

    expect(outcomes[0]).toMatchObject({ kind: "rejected", reason: "stale_world_version" });
    expect(handle.sqlite.prepare(`SELECT location_id AS locationId FROM actor_placements
      WHERE actor_id = 'actor-b' AND placement_kind = 'present'`).get()).toEqual({ locationId: "location-a" });
    expect(handle.sqlite.prepare(`SELECT agency_debt AS agencyDebt,
      next_act_at_world_time_minutes AS nextAt FROM campaign_play_actor_schedules
      WHERE actor_id = 'actor-b'`).get()).toEqual({ agencyDebt: 1, nextAt: settledClock + 30 });
    expect(handle.sqlite.prepare(`SELECT status, result_json AS resultJson
      FROM campaign_play_actor_proposals WHERE actor_id = 'actor-b'`).get()).toEqual({
      status: "rejected",
      resultJson: canonicalizeCampaignPlayProjection({ status: "rejected", reason: "stale_world_version" }),
    });
    expect(states.loadState()!.authority.worldVersion).toBe(baseWorldVersion + 1);
  });

  it("leaves a stored proposal byte-identical when its main-turn lease expires before terminalization", () => {
    const { handle, token } = createReadyFixture();
    let currentTime = 1_700;
    const service = createCampaignPlayActorProposalService(handle, { now: () => currentTime });
    currentTime = token.expiresAt;
    expect(() => service.processNext({
      turnId: token.turnId,
      token,
      createdAt: 1_700,
      openingExposureSeed: TEST_EXPOSURE_SEED,
      injectFault(point) {
        if (point === "before_proposal_commit") throw new Error("stop before terminalization");
      },
    })).toThrow("stop before terminalization");
    const before = {
      proposal: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_proposals
        WHERE campaign_id = ?`).get(CAMPAIGN_ID),
      job: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_jobs
        WHERE campaign_id = ? AND stage = 'proposed'`).get(CAMPAIGN_ID),
      schedule: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_schedules
        WHERE campaign_id = ? ORDER BY actor_id`).all(CAMPAIGN_ID),
      commands: countForCampaign(handle, "campaign_play_commands"),
      receipts: countForCampaign(handle, "campaign_play_receipts"),
      events: countForCampaign(handle, "campaign_play_events"),
      runtimeEvents: countForCampaign(handle, "campaign_play_runtime_events"),
      authority: createCampaignPlayStateRepository(handle).loadState()!.authority,
    };

    expect(() => service.processNext({
      turnId: token.turnId,
      token,
      createdAt: token.expiresAt,
      openingExposureSeed: TEST_EXPOSURE_SEED,
    })).toThrow("proposal_state_invalid");
    expect({
      proposal: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_proposals
        WHERE campaign_id = ?`).get(CAMPAIGN_ID),
      job: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_jobs
        WHERE campaign_id = ? AND stage = 'proposed'`).get(CAMPAIGN_ID),
      schedule: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_schedules
        WHERE campaign_id = ? ORDER BY actor_id`).all(CAMPAIGN_ID),
      commands: countForCampaign(handle, "campaign_play_commands"),
      receipts: countForCampaign(handle, "campaign_play_receipts"),
      events: countForCampaign(handle, "campaign_play_events"),
      runtimeEvents: countForCampaign(handle, "campaign_play_runtime_events"),
      authority: createCampaignPlayStateRepository(handle).loadState()!.authority,
    }).toEqual(before);
  });

  it("rejects terminalization when proposal work crosses the main lease deadline", () => {
    const { handle, token } = createReadyFixture();
    let currentTime = 1_700;
    let persisted: unknown;
    const snapshot = () => ({
      proposal: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_proposals
        WHERE campaign_id = ?`).get(CAMPAIGN_ID),
      job: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_jobs
        WHERE campaign_id = ? AND stage = 'proposed'`).get(CAMPAIGN_ID),
      schedule: handle.sqlite.prepare(`SELECT * FROM campaign_play_actor_schedules
        WHERE campaign_id = ? ORDER BY actor_id`).all(CAMPAIGN_ID),
      commands: countForCampaign(handle, "campaign_play_commands"),
      receipts: countForCampaign(handle, "campaign_play_receipts"),
      events: countForCampaign(handle, "campaign_play_events"),
      runtimeEvents: countForCampaign(handle, "campaign_play_runtime_events"),
      authority: createCampaignPlayStateRepository(handle).loadState()!.authority,
    });
    const service = createCampaignPlayActorProposalService(handle, { now: () => currentTime });

    expect(() => service.processNext({
      turnId: token.turnId,
      token,
      createdAt: currentTime,
      openingExposureSeed: TEST_EXPOSURE_SEED,
      injectFault(point) {
        if (point === "after_proposal_persisted") persisted = snapshot();
      },
      beforeSettlement() {
        currentTime = token.expiresAt;
      },
    })).toThrow("proposal_state_invalid");

    expect(persisted).toBeDefined();
    expect(snapshot()).toEqual(persisted);
  });

});
