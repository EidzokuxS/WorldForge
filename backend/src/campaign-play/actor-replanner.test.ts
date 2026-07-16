import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "../db/index.js";
import {
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../campaign-world/world-repository.test-support.js";
import { calculateCampaignWorldContentHash } from "../campaign-world/world-snapshot.js";
import { safeGenerateObject, type SafeGenerateTrace } from "../ai/generate-object-safe.js";
import { createCampaignPlayActorReplanner } from "./actor-replanner.js";
import { createCampaignPlayActorScheduler } from "./actor-scheduler.js";
import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import {
  createCampaignPlayTurnRepository,
  type CampaignPlayWorkerLeaseToken,
} from "./campaign-play-turn-repository.js";

const CAMPAIGN_ID = "12121212-1212-4212-8212-121212121212";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const TEST_MODEL_PRICING = {
  known: true,
  currency: "USD",
  tokenUnit: 1_000_000,
  inputCostMicros: 1_000,
  outputCostMicros: 2_000,
  rounding: "ceil",
} as const;

let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-actor-replanner-"));
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

function acceptWorld(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "build-actor-replanner",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-actor-replanner");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-actor-replanner",
      candidate: {
        ...candidate,
        draft,
        contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft),
      },
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

function replanProposalFromPrompt(prompt: string) {
  const startMarker = "ACTOR_FRAME\n";
  const endMarker = "\nEND_ACTOR_FRAME";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker);
  if (start < 0 || end < 0) throw new Error("Actor frame markers are missing.");
  const frame = JSON.parse(prompt.slice(start + startMarker.length, end)) as {
    entities: Array<{ handle: string; kind: string; state: string | null }>;
  };
  const goal = frame.entities.find((entity) => entity.kind === "goal" && entity.state === "active");
  if (!goal) throw new Error("Actor replan frame requires one active goal.");
  const intent = {
    kind: "attempt" as const,
    targetHandles: [goal.handle],
    method: "Check the sealed route ledger",
    stakes: "The harbor route remains uncertain",
  };
  return {
    goalHandle: goal.handle,
    cadenceMinutes: 15,
    priority: 4,
    intent,
    steps: [{
      intent,
      observableTrace: "Fresh sealing wax flakes lie beside the open ledger case.",
      elapsedBounds: { minimumMinutes: 2, maximumMinutes: 10 },
    }],
  };
}

function acceptedTrace(outputTokens = 25, reasoningTokens = 0): SafeGenerateTrace {
  return {
    text: "private actor plan",
    cleanedText: "private actor plan",
    requestedMode: "auto",
    strategy: "native_schema",
    primaryStrategy: "native_schema",
    capability: {
      requestedMode: "auto",
      primaryStrategy: "native_schema",
      fallbackStrategy: "text_fallback",
      actualMode: "native_schema",
      reason: "test capability",
      providerId: "test-provider",
      model: "actor-replanner",
    },
    usage: { inputTokens: 40, outputTokens, reasoningTokens, totalTokens: 40 + outputTokens },
    response: { modelId: "actor-replanner" },
    finishReason: "stop",
  };
}

function createReplanFixture(): {
  handle: CampaignPlayDatabaseHandle;
  token: CampaignPlayWorkerLeaseToken;
  jobId: string;
} {
  acceptWorld();
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  states.createState({ eventId: "actor-replanner-state-created", createdAt: 1_300 });
  states.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: {
      eventId: "actor-replanner-fixture-ready",
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
      ) VALUES ('actor-replanner-player-placement', ?, 'actor-player', 'location-c', 'present')`)
        .run(context.campaignId);
      const intent = {
        kind: "attempt",
        targets: [{ kind: "goal", id: "goal-b" }],
        method: "Carry the sealed route ledger",
        stakes: "The reef passage may close",
      };
      context.sqlite.prepare(`INSERT INTO campaign_play_actor_plans (
        plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
        preconditions_json, cadence_minutes, priority, steps_json, status, created_at, updated_at
      ) VALUES ('actor-replanner-plan', ?, 'actor-b', 'goal-b', 1, ?, '[]', 15, 5, ?,
        'active', 1400, 1400)`).run(
          context.campaignId,
          canonicalizeCampaignPlayProjection(intent),
          canonicalizeCampaignPlayProjection([{
            stepId: "actor-replanner-step",
            order: 0,
            intent,
            observableTrace: "A ledger case stands open with fresh wax flakes beside it.",
            elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 },
          }]),
        );
      context.sqlite.prepare(`INSERT INTO campaign_play_actor_schedules (
        schedule_id, campaign_id, actor_id, plan_id, next_act_at_world_time_minutes,
        last_act_at_world_time_minutes, priority, agency_debt, created_at, updated_at
      ) VALUES ('actor-replanner-schedule', ?, 'actor-b', 'actor-replanner-plan',
        0, NULL, 5, 0, 1400, 1400)`).run(context.campaignId);
      context.sqlite.prepare(`UPDATE campaign_play_states SET
        setup_phase = 'ready', world_time_minutes = 0, opened_at = 1400
        WHERE campaign_id = ?`).run(context.campaignId);
    },
  });

  const repository = createCampaignPlayTurnRepository(handle);
  const ready = states.loadState()!;
  repository.admitTurn({
    turnId: "turn-player",
    supersedesTurnId: null,
    mutationId: "actor-replanner-turn-admitted",
    submittedAt: 1_500,
    document: {
      turnKind: "player_action",
      request: {
        source: "freeform",
        idempotencyKey: "actor-replanner-action",
        text: "I wait and listen.",
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
  const judge = repository.claimStage({
    turnId: "turn-player",
    expectedStage: "admitted",
    observedEpoch: 0,
    owner: "actor-replanner-worker",
    claimedAt: 1_510,
    leaseExpiresAt: 2_000,
    mutationId: "actor-replanner-judge-claimed",
  });
  repository.acceptModelArtifact({
    token: judge,
    artifact: {
      ruling: {
        disposition: "clarification_required",
        normalizedIntent: {
          originalText: "I wait and listen.",
          source: "freeform",
          choiceHandle: null,
          kind: "wait",
          targets: [],
          method: null,
          stakes: null,
        },
        movementRouteHandle: null,
        citedVisibleFactHandles: [],
        resultBounds: { minimum: "no_effect", maximum: "no_effect" },
        elapsedBounds: { minimumMinutes: 0, maximumMinutes: 0 },
        uncertainty: { kind: "none" },
        requiredPossessionEffect: { kind: "none" },
        reason: "The fixture keeps primary settlement unchanged.",
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
    mutationDomain: "runtime",
    acceptedAt: 1_520,
    mutationId: "actor-replanner-judge-accepted",
  });
  const primary = repository.claimStage({
    turnId: "turn-player",
    expectedStage: "planned",
    observedEpoch: 1,
    owner: "actor-replanner-worker",
    claimedAt: 1_530,
    leaseExpiresAt: 2_000,
    mutationId: "actor-replanner-primary-claimed",
  });
  repository.commitDeterministic({
    token: primary,
    transition: "primary_settled",
    worldVersionAdvance: 0,
    committedAt: 1_540,
    mutationId: "actor-replanner-primary-settled",
  });
  persistKnownScene(
    handle,
    "Magda promised to stay through second bell and change the patients' dressings.",
  );
  const settled = repository.loadTurn("turn-player")!;
  const token = repository.claimStage({
    turnId: "turn-player",
    expectedStage: "primary_settled",
    observedEpoch: settled.workerEpoch,
    owner: "actor-replanner-worker",
    claimedAt: 1_550,
    leaseExpiresAt: 4_000,
    mutationId: "actor-replanner-actors-claimed",
  });
  const scheduler = createCampaignPlayActorScheduler(handle);
  const state = states.loadState()!;
  const dueSet = scheduler.freezeDueSet({
    turnId: "turn-player",
    expectedWorldVersion: state.authority.worldVersion,
    expectedRuntimeRevision: state.authority.runtimeRevision,
  });
  repository.commitActorTransition({
    token,
    leaseMode: "live",
    worldVersionAdvance: 0,
    mutationId: "actor-replanner-due-set-admitted",
    protectedPayloadHash: hashCampaignPlayProjection(dueSet),
    committedAt: 1_560,
    mutate(context) {
      scheduler.admitDueSet({ dueSet, context, createdAt: 1_560 });
    },
  });
  const job = scheduler.listTurnJobs("turn-player")[0];
  if (!job) throw new Error("Actor replanner fixture requires one due job.");
  repository.commitActorTransition({
    token,
    leaseMode: "live",
    worldVersionAdvance: 0,
    mutationId: "actor-replanner-plan-boundary",
    protectedPayloadHash: HASH_A,
    committedAt: 1_570,
    mutate(context) {
      const changed = context.sqlite.prepare(`UPDATE campaign_play_actor_plans
        SET status = 'completed', updated_at = 1570
        WHERE campaign_id = ? AND plan_id = ? AND status = 'active'`).run(
          context.campaignId,
          job.planId,
        );
      if (changed.changes !== 1) throw new Error("Actor replanner fixture lost its plan boundary.");
    },
  });
  return { handle, token, jobId: job.jobId };
}

function persistKnownScene(
  handle: CampaignPlayDatabaseHandle,
  summary: string,
): void {
  const state = handle.sqlite.prepare(`SELECT world_version AS worldVersion,
    world_hash AS worldHash, world_time_minutes AS worldTimeMinutes
    FROM campaign_play_states WHERE campaign_id = ?`).get(handle.campaignId) as {
    worldVersion: number;
    worldHash: string;
    worldTimeMinutes: number;
  };
  const source = { kind: "system", system: "game_master" };
  const affectedRefs = [
    { kind: "actor", id: "actor-b" },
    { kind: "location", id: "location-a" },
  ];
  const payload = { eventClass: "scene", performingActorId: null, summary };
  const sourceJson = canonicalizeCampaignPlayProjection(source);
  const affectedRefsJson = canonicalizeCampaignPlayProjection(affectedRefs);
  const payloadJson = canonicalizeCampaignPlayProjection(payload);
  const payloadHash = hashCampaignPlayProjection(payload);
  const eventSnapshotJson = canonicalizeCampaignPlayProjection({
    placements: [{
      actorId: "actor-b",
      locationId: "location-a",
      placementKind: "present",
    }],
    worldTimeMinutes: state.worldTimeMinutes,
    worldVersion: state.worldVersion,
  });

  createCampaignPlayStateRepository(handle).commitRuntime({
    event: {
      eventId: "known-scene-runtime-event",
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: payloadHash,
      createdAt: 1_571,
    },
    mutate(context) {
      context.sqlite.prepare(`INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version, read_scope_json,
        write_scope_json, exposure_policy_json, arguments_hash,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES ('known-scene-command', ?, 'turn-player', 'known-scene-batch', 0,
        'record_world_event', '{"kind":"turn","turnId":"turn-player"}', ?, ?, ?,
        '[]', ?, ?, ?, ?, 1571)`).run(
        context.campaignId,
        sourceJson,
        state.worldVersion,
        affectedRefsJson,
        canonicalizeCampaignPlayProjection({
          mode: "projectable",
          predicates: [{ channel: "direct_perception", locationId: "location-a" }],
        }),
        payloadHash,
        payloadJson,
        payloadHash,
      );
      context.sqlite.prepare(`INSERT INTO campaign_play_receipts (
        receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES ('known-scene-receipt', ?, 'turn-player', 'known-scene-command',
        'record_world_event', 'applied', 0, ?, ?, ?, ?, '["known-scene-event"]',
        ?, ?, 1572)`).run(
        context.campaignId,
        state.worldVersion,
        state.worldVersion,
        state.worldHash,
        state.worldHash,
        payloadJson,
        payloadHash,
      );
      context.sqlite.prepare(`INSERT INTO campaign_play_events (
        event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
        event_kind, source_json, world_time_minutes, world_version,
        affected_refs_json, before_payload_json, after_payload_json,
        payload_hash, created_at
      ) VALUES ('known-scene-event', ?, 'turn-player', 'known-scene-command',
        'known-scene-receipt', NULL, 'scene_recorded', ?, ?, ?, ?, '{}', ?, ?, 1573)`)
        .run(
          context.campaignId,
          sourceJson,
          state.worldTimeMinutes,
          state.worldVersion,
          affectedRefsJson,
          eventSnapshotJson,
          payloadHash,
        );
      context.sqlite.prepare(`INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id, route_id,
        witness_actor_id, valid_until_world_time_minutes, route_triggers_json, created_at
      ) VALUES ('known-scene-exposure', ?, 'known-scene-event', 'direct_perception',
        'location-a', NULL, NULL, NULL, NULL, 1574)`).run(context.campaignId);
    },
  });
}

describe("Campaign Play actor replanner", () => {
  it("accepts one strict job-owned attempt and atomically replaces its completed plan", async () => {
    const { handle, token, jobId } = createReplanFixture();
    const knownScene = "Magda promised to stay through second bell and change the patients' dressings.";
    expect(handle.sqlite.prepare(`SELECT count(*) AS count
      FROM campaign_play_actor_knowledge
      WHERE campaign_id = ? AND event_id = 'known-scene-event'`).get(handle.campaignId))
      .toEqual({ count: 0 });
    let now = 1_600;
    const generateObject = vi.fn(async (request: {
      prompt: string;
      abortSignal?: AbortSignal;
      schema: { safeParse(value: unknown): { success: boolean } };
    }) => ({
      object: replanProposalFromPrompt(request.prompt),
      trace: acceptedTrace(1_025, 1_000),
    }));
    const replanner = createCampaignPlayActorReplanner(handle, {
      now: () => now,
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });
    const controller = new AbortController();

    const outcome = await replanner.replan({
      jobId,
      token,
      model: {} as LanguageModel,
      temperature: 0.2,
      maxOutputTokens: 100,
      maximumInputTokens: 1_000,
      maximumOutputTokens: 100,
      maximumTotalTokens: 2_000,
      maximumCostMicros: 10_000,
      signal: controller.signal,
      createdAt: 1_590,
    });
    now += 1;

    expect(outcome).toMatchObject({ kind: "replanned", jobId, workerEpoch: 1 });
    expect(generateObject).toHaveBeenCalledTimes(1);
    expect(generateObject.mock.calls[0]![0].prompt).toContain(knownScene);
    expect(generateObject.mock.calls[0]![0].prompt).toContain(
      "occurred at world time 0; learned at world time 0",
    );
    const submitted = replanProposalFromPrompt(generateObject.mock.calls[0]![0].prompt);
    const submittedSchema = generateObject.mock.calls[0]![0].schema;
    expect(submittedSchema.safeParse(submitted).success).toBe(true);
    expect(submittedSchema.safeParse({
      ...submitted,
      goalHandle: "goal:foreign",
    }).success).toBe(false);
    expect(submittedSchema.safeParse({
      ...submitted,
      intent: { ...submitted.intent, targetHandles: ["location:foreign"] },
    }).success).toBe(false);
    expect(submittedSchema.safeParse({
      ...submitted,
      steps: [{
        ...submitted.steps[0],
        intent: { ...submitted.steps[0]!.intent, targetHandles: ["location:foreign"] },
      }],
    }).success).toBe(false);
    expect(generateObject.mock.calls[0]![0]).toMatchObject({
      allowRepair: false,
      allowTextFallback: false,
      retries: 1,
      strictSchema: true,
    });
    expect("timeout" in generateObject.mock.calls[0]![0]).toBe(false);
    expect(generateObject.mock.calls[0]![0].abortSignal).toBe(controller.signal);
    expect(createCampaignPlayActorScheduler(handle).listTurnJobs("turn-player")[0])
      .toMatchObject({
        stage: "claimed",
        workerEpoch: 1,
        admittedPlanId: "actor-replanner-plan",
        planId: outcome.kind === "replanned" ? outcome.plan.planId : "unreachable",
      });
    expect(createCampaignPlayActorScheduler(handle).buildActorFrame(jobId).selection.kind)
      .toBe("step");
    expect(handle.sqlite.prepare(`SELECT status, worker_epoch AS workerEpoch,
        requested_provider_id AS requestedProviderId, requested_model AS requestedModel,
        actual_provider_id AS actualProviderId, actual_model AS actualModel,
        schema_outcome AS schemaOutcome
      FROM campaign_play_model_stages
      WHERE campaign_id = ? AND turn_id = 'turn-player' AND kind = 'actor_replanner'`).get(
        CAMPAIGN_ID,
      )).toEqual({
        status: "accepted",
        workerEpoch: 1,
        requestedProviderId: "test-provider",
        requestedModel: "actor-replanner",
        actualProviderId: "test-provider",
        actualModel: "actor-replanner",
        schemaOutcome: "valid",
      });
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_actor_plans
      WHERE campaign_id = ? AND actor_id = 'actor-b' AND status = 'active'`).get(CAMPAIGN_ID))
      .toEqual({ count: 1 });
  });

});
