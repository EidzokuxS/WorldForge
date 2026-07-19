import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
import {
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "./campaign-play-database.js";
import {
  CampaignPlayStateRepositoryError,
  createCampaignPlayStateRepository,
  loadCampaignPlayRulebookFrame,
  type LoadedCampaignPlayState,
} from "./campaign-play-state-repository.js";
import {
  deriveCampaignPlayCommandId,
  executeCampaignPlayRulebookBatch,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";
import { createCampaignPlayTurnRepository } from "./campaign-play-turn-repository.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayObligationId,
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
  deriveCampaignPlayPublicHandle,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";

const CAMPAIGN_A = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_B = "22222222-2222-4222-8222-222222222222";
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);

let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-play-state-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.close();
  closeDb();
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

function track<T extends CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle>(handle: T): T {
  handles.push(handle);
  return handle;
}

function buildCampaign(
  campaignId: string,
  input: { accepted: boolean; eligible: boolean; extraDistantRoute?: boolean },
): void {
  createMigratedCampaign(root, campaignId);
  const handle = openCampaignWorldDatabase(campaignId);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(campaignId);
    const buildId = `build-${campaignId}`;
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
      placements: input.eligible
        ? candidate.draft.placements.map((placement) =>
          placement.id === "placement-b"
            ? { ...placement, locationId: "location-a" }
            : placement
        )
        : candidate.draft.placements,
      pressures: input.eligible
        ? candidate.draft.pressures
        : candidate.draft.pressures.map((pressure) =>
          pressure.id === "pressure-a"
            ? { ...pressure, locationIds: ["location-b"] }
            : pressure
        ),
      routes: input.extraDistantRoute
        ? [
          ...candidate.draft.routes,
          {
            id: "route-distant-hidden",
            fromLocationId: "location-c",
            toLocationId: "location-b",
            travelCost: 2 as const,
          },
        ]
        : candidate.draft.routes,
    };
    const review = repository.completeBuild({
      buildId,
      candidate: {
        ...candidate,
        draft,
        contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft),
      },
      completedAt: 1_100,
    });
    if (input.accepted) {
      repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: review.contentHash,
        acceptedAt: 1_200,
      });
    }
  } finally {
    handle.close();
  }
}

function openPlay(campaignId = CAMPAIGN_A): CampaignPlayDatabaseHandle {
  return track(openCampaignPlayDatabase(campaignId));
}

function createEligibleState(campaignId = CAMPAIGN_A) {
  buildCampaign(campaignId, { accepted: true, eligible: true });
  const handle = openPlay(campaignId);
  const repository = createCampaignPlayStateRepository(handle);
  const state = repository.createState({ eventId: `state-created-${campaignId}`, createdAt: 1_300 });
  return { handle, repository, state };
}

function insertHumanCharacter(
  context: { sqlite: CampaignPlayDatabaseHandle["sqlite"]; campaignId: string },
  recordHash = HASH_A,
): void {
  context.sqlite.prepare(`
    INSERT INTO actors (id, campaign_id, kind, controller, role, name, summary, traits, tags)
    VALUES ('actor-player', ?, 'person', 'human', 'player', 'Player',
      'A human-controlled visitor.', '[]', '[]')
  `).run(context.campaignId);
  context.sqlite.prepare(`
    INSERT INTO campaign_play_characters (
      actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at
    ) VALUES ('actor-player', ?, '{"name":"Player"}', ?, 'created', ?, 1400)
  `).run(context.campaignId, recordHash, HASH_B);
}

function insertAdmittedTurn(
  context: {
    sqlite: CampaignPlayDatabaseHandle["sqlite"];
    campaignId: string;
    priorWorldVersion: number;
    priorRuntimeRevision: number;
  },
): void {
  context.sqlite.prepare(`
    INSERT INTO campaign_play_turns (
      id, campaign_id, turn_kind, supersedes_turn_id, input_json, input_hash,
      idempotency_key, expected_world_version, expected_runtime_revision,
      base_world_version, final_world_version, stage, frame_hash,
      next_event_sequence, worker_lease_owner, worker_epoch, worker_lease_expires_at,
      model_selection_json, public_packet_hash, interrupted_stage, error_code,
      resume_eligible, mutation_audit_json, submitted_at, updated_at, completed_at
    ) VALUES (
      'turn-opening', ?, 'opening', NULL, '{}', ?, 'opening-one', ?, ?, ?, NULL,
      'admitted', ?, 1, NULL, 0, NULL, '{}', NULL, NULL, NULL, 0, '{}', 1600, 1600, NULL
    )
  `).run(
    context.campaignId,
    HASH_A,
    context.priorWorldVersion,
    context.priorRuntimeRevision,
    context.priorWorldVersion,
    HASH_B,
  );
}

function characterBootstrapFrame(
  state: LoadedCampaignPlayState,
): CampaignPlayRulebookFrame {
  const world = state.acceptedReview;
  return {
    campaignId: world.campaignId,
    acceptedWorldVersion: world.version,
    acceptedContentHash: world.contentHash,
    setupPhase: "character_required",
    worldVersion: state.authority.worldVersion,
    worldTimeMinutes: null,
    human: null,
    acceptedWorld: world,
    runtimeLocations: [],
    runtimeRoutes: [],
    routeStates: [],
    actorConditions: [],
    possessions: [],
    obligations: [],
    pressureStates: [],
    placements: world.placements.map((row) => ({
      placementId: row.id,
      actorId: row.actorId,
      locationId: row.locationId,
      placementKind: row.placementKind,
    })),
    relations: world.relations.map((row) => ({
      relationId: row.id,
      sourceActorId: row.sourceActorId,
      targetActorId: row.targetActorId,
      relationType: row.relationType,
      intensity: row.intensity,
      summary: row.summary,
    })),
    goals: world.goals.map((row) => ({
      goalId: row.id,
      actorId: row.actorId,
      status: row.status,
      priority: row.priority,
      objective: row.objective,
      motivation: row.motivation,
    })),
  };
}

function openingBootstrapFrame(state: LoadedCampaignPlayState): CampaignPlayRulebookFrame {
  return {
    ...characterBootstrapFrame(state),
    setupPhase: "opening_required",
    worldVersion: state.authority.worldVersion,
    human: { actorId: "actor-player", recordHash: HASH_A },
  };
}

function readyFrame(state: LoadedCampaignPlayState): CampaignPlayRulebookFrame {
  const startingMacroId = state.acceptedReview.locations.find((row) => row.isStarting)!.id;
  const startLocationId = state.acceptedReview.locations.find((row) =>
    row.kind === "persistent_sublocation" && row.parentLocationId === startingMacroId)!.id;
  return {
    ...openingBootstrapFrame(state),
    setupPhase: "ready",
    worldVersion: state.authority.worldVersion,
    worldTimeMinutes: state.authority.worldTimeMinutes,
    pressureStates: state.acceptedReview.pressures.map((pressure) => ({
      pressureId: pressure.id,
      progress: 0,
      status: "active" as const,
      lastAdvancedWorldTimeMinutes: 0,
    })),
    placements: [
      ...openingBootstrapFrame(state).placements,
      {
        placementId: "opening-placement:actor-player",
        actorId: "actor-player",
        locationId: startLocationId,
        placementKind: "present",
      },
    ],
  };
}

describe("Campaign Play state repository bootstrap", () => {
  it("commits an eligible accepted world, exact eligibility event, and accepted mechanical hash", () => {
    const { handle, state } = createEligibleState();
    const event = handle.sqlite.prepare(`
      SELECT sequence, kind, turn_id AS turnId, worker_epoch AS workerEpoch,
        world_version AS worldVersion, prior_runtime_revision AS priorRuntimeRevision,
        result_runtime_revision AS resultRuntimeRevision,
        result_runtime_hash AS resultRuntimeHash,
        protected_payload_hash AS protectedPayloadHash
      FROM campaign_play_runtime_events WHERE campaign_id = ?
    `).get(CAMPAIGN_A);

    expect(state.eligibility.projection).toMatchObject({ eligible: true, unmetRequirements: [] });
    expect(state.authority).toMatchObject({
      worldVersion: state.acceptedReview.version,
      worldHash: state.acceptedReview.contentHash,
      runtimeRevision: 1,
      nextRuntimeEventSequence: 2,
      setupPhase: "character_required",
    });
    expect(event).toEqual({
      sequence: 1,
      kind: "play_state_created",
      turnId: null,
      workerEpoch: null,
      worldVersion: state.acceptedReview.version,
      priorRuntimeRevision: 0,
      resultRuntimeRevision: 1,
      resultRuntimeHash: state.runtime.hash,
      protectedPayloadHash: state.eligibility.hash,
    });
  });

  it("persists the typed ineligible topology boundary for downstream character rejection", () => {
    buildCampaign(CAMPAIGN_A, { accepted: true, eligible: false });
    const repository = createCampaignPlayStateRepository(openPlay());
    const state = repository.createState({ eventId: "state-ineligible", createdAt: 1_300 });

    expect(state.eligibility.projection.eligible).toBe(false);
    expect(state.eligibility.projection.unmetRequirements).toContain("opening_scene_unavailable");
    expect(state.authority.setupPhase).toBe("character_required");
  });

  it("rejects review worlds and corrupt accepted snapshots", () => {
    buildCampaign(CAMPAIGN_A, { accepted: false, eligible: true });
    const reviewHandle = track(openCampaignWorldDatabase(CAMPAIGN_A));
    const reviewRepository = createCampaignPlayStateRepository(
      reviewHandle as CampaignPlayDatabaseHandle,
    );
    expect(() => reviewRepository.createState({ eventId: "review", createdAt: 1_300 }))
      .toThrowError(expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
        code: "campaign_world_not_accepted",
      }));

    buildCampaign(CAMPAIGN_B, { accepted: true, eligible: true });
    const corruptHandle = openPlay(CAMPAIGN_B);
    corruptHandle.sqlite.exec("DROP TRIGGER campaign_worlds_accepted_provenance_immutable");
    corruptHandle.sqlite.prepare(`
      UPDATE campaign_worlds SET accepted_snapshot_json = '{'
      WHERE campaign_id = ?
    `).run(CAMPAIGN_B);
    const corruptRepository = createCampaignPlayStateRepository(corruptHandle);
    expect(() => corruptRepository.createState({ eventId: "corrupt", createdAt: 1_300 }))
      .toThrowError(expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
        code: "play_state_corrupt",
      }));
  });

  it("rejects location drift from the accepted world before creating play state", () => {
    buildCampaign(CAMPAIGN_A, { accepted: true, eligible: true });
    const handle = openPlay();
    handle.sqlite.prepare(`
      UPDATE locations SET description = 'A silently replaced location.'
      WHERE campaign_id = ? AND id = 'location-a'
    `).run(CAMPAIGN_A);

    expect(() => createCampaignPlayStateRepository(handle).createState({
      eventId: "location-drift",
      createdAt: 1_300,
    })).toThrowError(expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
      code: "play_state_corrupt",
    }));
    expect(handle.sqlite.prepare(`SELECT COUNT(*) AS count FROM campaign_play_states`).get())
      .toEqual({ count: 0 });

    handle.sqlite.prepare(`
      UPDATE locations SET description = 'A fortified harbor governed by signal keepers.'
      WHERE campaign_id = ? AND id = 'location-a'
    `).run(CAMPAIGN_A);
    const repository = createCampaignPlayStateRepository(handle);
    repository.createState({ eventId: "location-restored", createdAt: 1_301 });
    handle.sqlite.prepare(`
      UPDATE locations SET description = 'A second silent replacement.'
      WHERE campaign_id = ? AND id = 'location-a'
    `).run(CAMPAIGN_A);
    expect(() => repository.loadState()).toThrowError(
      expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
        code: "play_state_corrupt",
      }),
    );
  });

  it("rejects route, non-human actor, and pressure definition drift", () => {
    buildCampaign(CAMPAIGN_A, { accepted: true, eligible: true });
    const handle = openPlay();
    const repository = createCampaignPlayStateRepository(handle);
    const cases = [
      {
        drift: `UPDATE location_edges SET travel_cost = 5 WHERE id = 'route-a'`,
        restore: `UPDATE location_edges SET travel_cost = 2 WHERE id = 'route-a'`,
      },
      {
        drift: `UPDATE actors SET summary = 'Replaced actor definition.' WHERE id = 'actor-a'`,
        restore: `UPDATE actors SET summary = 'A signal keeper tracking the broken route pattern.' WHERE id = 'actor-a'`,
      },
      {
        drift: `UPDATE world_pressures SET trajectory = 'Replaced pressure definition.' WHERE id = 'pressure-a'`,
        restore: `UPDATE world_pressures SET trajectory = 'North Harbor loses supply access within two route cycles.' WHERE id = 'pressure-a'`,
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      handle.sqlite.exec(testCase.drift);
      expect(() => repository.createState({
        eventId: `foundation-drift-${index}`,
        createdAt: 1_300 + index,
      })).toThrowError(expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
        code: "play_state_corrupt",
      }));
      handle.sqlite.exec(testCase.restore);
    }
    expect(repository.createState({ eventId: "foundation-restored", createdAt: 1_400 }))
      .toMatchObject({ authority: { runtimeRevision: 1 } });
  });
});

describe("Campaign Play atomic Rulebook execution", () => {
  function prepareCharacterBatch(state: LoadedCampaignPlayState) {
    const frame = characterBootstrapFrame(state);
    const rootParent = {
      kind: "accepted_world" as const,
      campaignId: frame.campaignId,
      acceptedWorldVersion: frame.acceptedWorldVersion,
      acceptedContentHash: frame.acceptedContentHash,
    };
    const batchId = "batch-character-bootstrap";
    const command = {
      commandId: deriveCampaignPlayCommandId(frame.campaignId, null, batchId, 0),
      batchId,
      order: 0,
      kind: "create_player_actor" as const,
      causalParent: rootParent,
      source: { kind: "system" as const, system: "character_bootstrap" as const },
      expectedWorldVersion: frame.worldVersion,
      readScope: [],
      writeScope: [{ kind: "actor" as const, id: "actor-player" }],
      exposure: { mode: "protected" as const },
      actorId: "actor-player",
      characterDigest: HASH_A,
      name: "Player",
      summary: "A human-controlled visitor.",
      traits: ["observant"],
      tags: ["outsider"],
    };
    const preflight = preflightCampaignPlayRulebook({
      frame,
      authority: {
        purpose: "character_bootstrap",
        turnId: null,
        actorId: null,
        rootParent,
        authorizedRefs: [{ kind: "actor", id: command.actorId }],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: { batchId, baseWorldVersion: frame.worldVersion, commands: [command] },
    });
    if (!preflight.accepted) throw new Error(`Fixture preflight failed: ${preflight.denial.code}`);
    return { frame, accepted: preflight };
  }

  function persistCharacter(
    context: Parameters<NonNullable<Parameters<typeof executeCampaignPlayRulebookBatch>[0]["persistPlayerCharacter"]>>[0],
    command: Parameters<NonNullable<Parameters<typeof executeCampaignPlayRulebookBatch>[0]["persistPlayerCharacter"]>>[1],
  ): void {
    context.sqlite.prepare(`INSERT INTO campaign_play_characters
      (actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at)
      VALUES (?, ?, ?, ?, 'created', ?, 1400)`)
      .run(command.actorId, context.campaignId, '{"name":"Player"}', command.characterDigest, HASH_B);
  }

  it("commits the first human, protected ledger, logical version, and runtime authority together", () => {
    const { handle, repository, state } = createEligibleState();
    const prepared = prepareCharacterBatch(state);
    let execution: ReturnType<typeof executeCampaignPlayRulebookBatch> | null = null;

    const committed = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-character-bootstrap",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_C,
        createdAt: 1_400,
      },
      mutate(context) {
        execution = executeCampaignPlayRulebookBatch({
          ...prepared,
          context,
          turnId: null,
          createdAt: 1_400,
          persistPlayerCharacter: persistCharacter,
        });
      },
    });

    expect(execution).toMatchObject({
      batchId: "batch-character-bootstrap",
      priorWorldVersion: state.authority.worldVersion,
      resultWorldVersion: state.authority.worldVersion + 1,
    });
    expect(committed.authority).toMatchObject({
      worldVersion: state.authority.worldVersion + 1,
      runtimeRevision: state.authority.runtimeRevision + 1,
      setupPhase: "opening_required",
    });
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
      (SELECT count(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts,
      (SELECT count(*) FROM campaign_play_events WHERE campaign_id = ?) AS events,
      (SELECT count(*) FROM actors WHERE campaign_id = ? AND controller = 'human') AS humans,
      (SELECT count(*) FROM campaign_play_characters WHERE campaign_id = ?) AS characters`
    ).get(CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A)).toEqual({
      commands: 1,
      receipts: 1,
      events: 1,
      humans: 1,
      characters: 1,
    });
  });

  it("settles placement, clock, pressure state, receipts, and the fenced opening stage in one batch", () => {
    const { handle, repository, state } = createEligibleState();
    const character = prepareCharacterBatch(state);
    const characterState = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-character-for-opening",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_C,
        createdAt: 1_400,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          ...character,
          context,
          turnId: null,
          createdAt: 1_400,
          persistPlayerCharacter: persistCharacter,
        });
      },
    });

    const turns = createCampaignPlayTurnRepository(handle);
    turns.admitTurn({
      turnId: "turn-opening",
      supersedesTurnId: null,
      mutationId: "runtime-opening-admitted",
      submittedAt: 1_500,
      document: {
        turnKind: "opening",
        request: {
          idempotencyKey: "opening-rulebook",
          expectedWorldVersion: characterState.authority.worldVersion,
          expectedRuntimeRevision: characterState.authority.runtimeRevision,
          startingConditions: { mode: "delegate" },
        },
        frame: characterState.publicState.projection as CampaignPlayProjectionRecord,
      },
      modelSelection: {
        turnKind: "opening",
        openingPlanner: { providerId: "test-provider", model: "planner", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
        narrator: { providerId: "test-provider", model: "narrator", strategy: "strict_object", pricing: TEST_MODEL_PRICING },
      },
    });
    const plannerToken = turns.claimStage({
      turnId: "turn-opening",
      expectedStage: "admitted",
      observedEpoch: 0,
      owner: "worker-opening",
      claimedAt: 1_510,
      leaseExpiresAt: 1_900,
      mutationId: "runtime-opening-planner-claimed",
    });
    turns.acceptModelArtifact({
      token: plannerToken,
      artifact: { plan: "accepted opening fixture" },
      evidence: {
        actualProviderId: "test-provider",
        actualModel: "planner",
        actualStrategy: "strict_object",
        inputTokens: 10,
        outputTokens: 20,
        durationMs: 30,
        finishReason: "stop",
      },
      mutationDomain: "runtime",
      acceptedAt: 1_520,
      mutationId: "runtime-opening-plan-accepted",
    });
    const settlementToken = turns.claimStage({
      turnId: "turn-opening",
      expectedStage: "planned",
      observedEpoch: 1,
      owner: "worker-opening",
      claimedAt: 1_530,
      leaseExpiresAt: 1_900,
      mutationId: "runtime-opening-settlement-claimed",
    });

    const frame = openingBootstrapFrame(characterState);
    const batchId = "batch-opening-bootstrap";
    const rootParent = { kind: "turn" as const, turnId: "turn-opening" };
    const startingMacroId = frame.acceptedWorld.locations.find((row) => row.isStarting)!.id;
    const startLocationId = frame.acceptedWorld.locations.find((row) =>
      row.kind === "persistent_sublocation" && row.parentLocationId === startingMacroId)!.id;
    const commandInputs = [
      {
        kind: "initialize_player_placement" as const,
        actorId: "actor-player",
        locationId: startLocationId,
        readScope: [] as Array<{ kind: "actor" | "location" | "pressure"; id: string }>,
        writeScope: [] as Array<{ kind: "actor" | "location" | "pressure"; id: string }>,
      },
      {
        kind: "initialize_world_time" as const,
        worldTimeMinutes: 0,
        readScope: [] as Array<{ kind: "actor" | "location" | "pressure"; id: string }>,
        writeScope: [] as Array<{ kind: "actor" | "location" | "pressure"; id: string }>,
      },
      ...frame.acceptedWorld.pressures.map((pressure) => ({
        kind: "initialize_pressure_state" as const,
        pressureId: pressure.id,
        progress: 0,
        status: "active" as const,
        readScope: [{ kind: "pressure" as const, id: pressure.id }],
        writeScope: [{ kind: "pressure" as const, id: pressure.id }],
      })),
    ];
    commandInputs[0]!.readScope = [
      { kind: "actor", id: "actor-player" },
      { kind: "location", id: startLocationId },
    ];
    commandInputs[0]!.writeScope = [...commandInputs[0]!.readScope];
    const commands = commandInputs.map((commandInput, order) => {
      const causalParent = order === 0
        ? rootParent
        : { kind: "command" as const, commandId: deriveCampaignPlayCommandId(
          frame.campaignId, "turn-opening", batchId, order - 1,
        ) };
      return {
        ...commandInput,
        commandId: deriveCampaignPlayCommandId(frame.campaignId, "turn-opening", batchId, order),
        batchId,
        order,
        causalParent,
        source: { kind: "system" as const, system: "opening_bootstrap" as const },
        expectedWorldVersion: frame.worldVersion + order,
        exposure: { mode: "protected" as const },
      };
    });
    const preflight = preflightCampaignPlayRulebook({
      frame,
      authority: {
        purpose: "opening",
        turnId: "turn-opening",
        actorId: "actor-player",
        rootParent,
        authorizedRefs: [
          { kind: "actor", id: "actor-player" },
          ...frame.acceptedWorld.locations.map((row) => ({ kind: "location" as const, id: row.id })),
          ...frame.acceptedWorld.pressures.map((row) => ({ kind: "pressure" as const, id: row.id })),
        ],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: { batchId, baseWorldVersion: frame.worldVersion, commands },
    });
    if (!preflight.accepted) throw new Error(`Opening preflight failed: ${preflight.denial.code}`);

    const openingFaults = [
      ...commands.flatMap((_, commandIndex) => [
        { kind: "before_command" as const, commandIndex },
        { kind: "after_command" as const, commandIndex },
      ]),
      { kind: "before_commit" as const, commandIndex: null },
    ];
    for (const [faultIndex, requestedFault] of openingFaults.entries()) {
      expect(() => turns.commitDeterministic({
        token: settlementToken,
        transition: "primary_settled",
        worldVersionAdvance: commands.length,
        committedAt: 1_550 + faultIndex,
        mutationId: `runtime-opening-fault-${faultIndex}`,
        mutate(context) {
          executeCampaignPlayRulebookBatch({
            frame,
            accepted: preflight,
            context,
            turnId: "turn-opening",
            createdAt: 1_550 + faultIndex,
            injectFault(point) {
              if (point.kind === requestedFault.kind && point.commandIndex === requestedFault.commandIndex) {
                throw new Error(`opening-fault:${faultIndex}`);
              }
            },
          });
        },
      })).toThrow(`opening-fault:${faultIndex}`);
      expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_commands
        WHERE campaign_id = ?`).get(CAMPAIGN_A)).toEqual({ count: 1 });
      expect(turns.loadTurn("turn-opening")?.stage).toBe("planned");
    }

    const settled = turns.commitDeterministic({
      token: settlementToken,
      transition: "primary_settled",
      worldVersionAdvance: commands.length,
      committedAt: 1_600,
      mutationId: "runtime-opening-primary-settled",
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame,
          accepted: preflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_600,
        });
      },
    });
    const loaded = repository.loadState()!;
    expect(settled.stage).toBe("primary_settled");
    expect(loaded.authority).toMatchObject({
      setupPhase: "opening_required",
      openedAt: null,
      worldTimeMinutes: 0,
      worldVersion: characterState.authority.worldVersion + commands.length,
    });
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM actor_placements WHERE campaign_id = ? AND actor_id = 'actor-player' AND placement_kind = 'present') AS placements,
      (SELECT count(*) FROM campaign_play_pressure_states WHERE campaign_id = ?) AS pressures,
      (SELECT count(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts`
    ).get(CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A)).toEqual({
      placements: 1,
      pressures: frame.acceptedWorld.pressures.length,
      receipts: 1 + commands.length,
    });

    const ordinaryFrame = readyFrame(loaded);
    const route = ordinaryFrame.acceptedWorld.routes.find((candidate) =>
      candidate.fromLocationId === ordinaryFrame.placements.find((placement) =>
        placement.actorId === "actor-player")!.locationId)!;
    const relation = ordinaryFrame.relations[0]!;
    const goal = ordinaryFrame.goals.find((candidate) => candidate.status === "active")!;
    const pressure = ordinaryFrame.pressureStates[0]!;
    const ordinaryBatchId = "batch-ordinary-command-matrix";
    const ordinaryRoot = { kind: "turn" as const, turnId: "turn-opening" };
    const possessionKey = deriveCampaignPlayPossessionKey("Copper chit");
    const possessionId = deriveCampaignPlayPossessionId(
      ordinaryFrame.campaignId,
      "actor-player",
      possessionKey,
    );
    const ordinaryInputs = [
      {
        kind: "advance_world_time" as const,
        elapsedMinutes: 5,
        readScope: [],
        writeScope: [],
      },
      {
        kind: "move_actor" as const,
        actorId: "actor-player",
        routeId: route.id,
        fromLocationId: route.fromLocationId,
        toLocationId: route.toLocationId,
        readScope: [
          { kind: "actor" as const, id: "actor-player" },
          { kind: "route" as const, id: route.id },
          { kind: "location" as const, id: route.fromLocationId },
          { kind: "location" as const, id: route.toLocationId },
        ],
        writeScope: [
          { kind: "actor" as const, id: "actor-player" },
          { kind: "location" as const, id: route.fromLocationId },
          { kind: "location" as const, id: route.toLocationId },
        ],
      },
      {
        kind: "set_route_state" as const,
        routeId: route.id,
        state: "restricted" as const,
        reason: "Passage control tightens after the crossing.",
        readScope: [{ kind: "route" as const, id: route.id }],
        writeScope: [{ kind: "route" as const, id: route.id }],
      },
      {
        kind: "set_actor_condition" as const,
        actorId: "actor-player",
        condition: "strained" as const,
        operation: "set" as const,
        summary: "The hurried crossing leaves the traveler strained.",
        readScope: [{ kind: "actor" as const, id: "actor-player" }],
        writeScope: [{ kind: "actor" as const, id: "actor-player" }],
      },
      {
        kind: "update_actor_relation" as const,
        relationId: relation.relationId,
        intensity: relation.intensity === 5 ? 4 : relation.intensity + 1,
        summary: "The route incident sharpens their mutual attention.",
        readScope: [
          { kind: "relation" as const, id: relation.relationId },
          { kind: "actor" as const, id: relation.sourceActorId },
          { kind: "actor" as const, id: relation.targetActorId },
        ],
        writeScope: [{ kind: "relation" as const, id: relation.relationId }],
      },
      {
        kind: "update_actor_goal" as const,
        goalId: goal.goalId,
        status: "blocked" as const,
        summary: "The restricted passage blocks immediate progress.",
        readScope: [
          { kind: "goal" as const, id: goal.goalId },
          { kind: "actor" as const, id: goal.actorId },
        ],
        writeScope: [{ kind: "goal" as const, id: goal.goalId }],
      },
      {
        kind: "advance_pressure" as const,
        pressureId: pressure.pressureId,
        amount: 10,
        resultStatus: "active" as const,
        readScope: [{ kind: "pressure" as const, id: pressure.pressureId }],
        writeScope: [{ kind: "pressure" as const, id: pressure.pressureId }],
      },
      {
        kind: "adjust_actor_possession" as const,
        actorId: "actor-player",
        possessionId,
        possessionKey,
        name: "Copper chit",
        quantityDelta: 2,
        summary: "The harbor clerk pays the traveler two copper chits.",
        affectedRefs: [{ kind: "actor" as const, id: "actor-player" }],
        readScope: [
          { kind: "actor" as const, id: "actor-player" },
          { kind: "possession" as const, id: possessionId },
        ],
        writeScope: [{ kind: "possession" as const, id: possessionId }],
      },
      {
        kind: "record_world_event" as const,
        eventClass: "scene" as const,
        performingActorId: null,
        summary: "The traveler crosses as passage controls tighten.",
        observableTrace: null,
        affectedRefs: [{ kind: "actor" as const, id: "actor-player" }],
        readScope: [{ kind: "actor" as const, id: "actor-player" }],
        writeScope: [],
      },
    ];
    let nextExpectedVersion = ordinaryFrame.worldVersion;
    const ordinaryCommands = ordinaryInputs.map((commandInput, order) => {
      const commandId = deriveCampaignPlayCommandId(
        ordinaryFrame.campaignId,
        "turn-opening",
        ordinaryBatchId,
        order,
      );
      const command = {
        ...commandInput,
        commandId,
        batchId: ordinaryBatchId,
        order,
        causalParent: order === 0
          ? ordinaryRoot
          : { kind: "command" as const, commandId: deriveCampaignPlayCommandId(
            ordinaryFrame.campaignId, "turn-opening", ordinaryBatchId, order - 1,
          ) },
        source: { kind: "actor" as const, actorId: "actor-player" },
        expectedWorldVersion: nextExpectedVersion,
        exposure: commandInput.kind === "record_world_event"
          || commandInput.kind === "adjust_actor_possession"
          ? {
            mode: "projectable" as const,
            predicates: [{ channel: "direct_perception" as const, locationId: route.toLocationId }],
          }
          : { mode: "protected" as const },
      };
      if (commandInput.kind !== "record_world_event") nextExpectedVersion += 1;
      return command;
    });
    const ordinaryPreflight = preflightCampaignPlayRulebook({
      frame: ordinaryFrame,
      authority: {
        purpose: "player_action",
        turnId: "turn-opening",
        actorId: "actor-player",
        rootParent: ordinaryRoot,
        authorizedRefs: [
          { kind: "actor", id: "actor-player" },
          ...ordinaryFrame.acceptedWorld.actors.map((row) => ({ kind: "actor" as const, id: row.id })),
          ...ordinaryFrame.acceptedWorld.locations.map((row) => ({ kind: "location" as const, id: row.id })),
          ...ordinaryFrame.acceptedWorld.routes.map((row) => ({ kind: "route" as const, id: row.id })),
          ...ordinaryFrame.relations.map((row) => ({ kind: "relation" as const, id: row.relationId })),
          ...ordinaryFrame.goals.map((row) => ({ kind: "goal" as const, id: row.goalId })),
          ...ordinaryFrame.pressureStates.map((row) => ({ kind: "pressure" as const, id: row.pressureId })),
        ],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: {
        batchId: ordinaryBatchId,
        baseWorldVersion: ordinaryFrame.worldVersion,
        commands: ordinaryCommands,
      },
    });
    if (!ordinaryPreflight.accepted) {
      throw new Error(`Ordinary preflight failed: ${ordinaryPreflight.denial.code}`);
    }
    const ordinaryMutationCount = ordinaryCommands.length - 1;
    const ordinaryState = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: ordinaryMutationCount,
      event: {
        eventId: "runtime-ordinary-matrix",
        turnId: "turn-opening",
        kind: "actor_job_transitioned",
        workerEpoch: settlementToken.epoch,
        protectedPayloadHash: HASH_B,
        createdAt: 1_700,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: ordinaryFrame,
          accepted: ordinaryPreflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_700,
        });
      },
    });
    expect(ordinaryState.authority.worldVersion).toBe(
      ordinaryFrame.worldVersion + ordinaryMutationCount,
    );
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
      (SELECT count(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts,
      (SELECT count(*) FROM campaign_play_events WHERE campaign_id = ?) AS events,
      (SELECT count(*) FROM campaign_play_route_states WHERE campaign_id = ?) AS routeStates,
      (SELECT count(*) FROM campaign_play_actor_conditions WHERE campaign_id = ?) AS conditions,
      (SELECT count(*) FROM campaign_play_actor_possessions WHERE campaign_id = ?) AS possessions,
      (SELECT count(*) FROM campaign_play_event_exposures WHERE campaign_id = ?) AS exposures`
    ).get(CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A, CAMPAIGN_A)).toEqual({
      commands: 1 + commands.length + ordinaryCommands.length,
      receipts: 1 + commands.length + ordinaryCommands.length,
      events: 1 + commands.length + ordinaryCommands.length,
      routeStates: 1,
      conditions: 1,
      possessions: 1,
      exposures: 2,
    });
    expect(handle.sqlite.prepare(`SELECT name, quantity FROM campaign_play_actor_possessions
      WHERE campaign_id = ? AND actor_id = ?`).get(CAMPAIGN_A, "actor-player"))
      .toEqual({ name: "Copper chit", quantity: 2 });

    const completedCommandCount = 1 + commands.length + ordinaryCommands.length;
    expect(() => repository.commitMechanicalAndRuntime({
      worldVersionAdvance: ordinaryMutationCount,
      event: {
        eventId: "runtime-stale-ordinary",
        turnId: "turn-opening",
        kind: "actor_job_transitioned",
        workerEpoch: settlementToken.epoch,
        protectedPayloadHash: HASH_C,
        createdAt: 1_710,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: ordinaryFrame,
          accepted: ordinaryPreflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_710,
        });
      },
    })).toThrowError(expect.objectContaining({ code: "execution_contract_invalid" }));
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_commands
      WHERE campaign_id = ?`).get(CAMPAIGN_A)).toEqual({ count: completedCommandCount });

    const currentSimulation = ordinaryPreflight.simulation;
    const duplicateFrame: CampaignPlayRulebookFrame = {
      ...ordinaryFrame,
      ...currentSimulation,
      setupPhase: "ready",
      acceptedWorld: ordinaryFrame.acceptedWorld,
    };
    const duplicateCommand = {
      commandId: deriveCampaignPlayCommandId(
        duplicateFrame.campaignId, "turn-opening", ordinaryBatchId, 0,
      ),
      batchId: ordinaryBatchId,
      order: 0,
      kind: "record_world_event" as const,
      causalParent: ordinaryRoot,
      source: { kind: "actor" as const, actorId: "actor-player" },
      expectedWorldVersion: duplicateFrame.worldVersion,
      readScope: [{ kind: "actor" as const, id: "actor-player" }],
      writeScope: [],
      exposure: { mode: "protected" as const },
      eventClass: "scene" as const,
      performingActorId: null,
      summary: "A duplicate batch must never append a second ledger.",
      observableTrace: null,
      affectedRefs: [{ kind: "actor" as const, id: "actor-player" }],
    };
    const duplicatePreflight = preflightCampaignPlayRulebook({
      frame: duplicateFrame,
      authority: {
        purpose: "player_action",
        turnId: "turn-opening",
        actorId: "actor-player",
        rootParent: ordinaryRoot,
        authorizedRefs: [{ kind: "actor", id: "actor-player" }],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: {
        batchId: ordinaryBatchId,
        baseWorldVersion: duplicateFrame.worldVersion,
        commands: [duplicateCommand],
      },
    });
    if (!duplicatePreflight.accepted) {
      throw new Error(`Duplicate fixture preflight failed: ${duplicatePreflight.denial.code}`);
    }
    expect(() => repository.commitRuntime({
      event: {
        eventId: "runtime-duplicate-batch",
        turnId: "turn-opening",
        kind: "actor_job_transitioned",
        workerEpoch: settlementToken.epoch,
        protectedPayloadHash: HASH_C,
        createdAt: 1_720,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: duplicateFrame,
          accepted: duplicatePreflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_720,
        });
      },
    })).toThrow();
    expect(handle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_commands
      WHERE campaign_id = ?`).get(CAMPAIGN_A)).toEqual({ count: completedCommandCount });

    const spendFrame = {
      ...loadCampaignPlayRulebookFrame(handle),
      setupPhase: "ready" as const,
    };
    expect(spendFrame).toEqual(duplicateFrame);
    const spendBatchId = "batch-spend-possession";
    const spendCommand = {
      commandId: deriveCampaignPlayCommandId(
        spendFrame.campaignId, "turn-opening", spendBatchId, 0,
      ),
      batchId: spendBatchId,
      order: 0,
      kind: "adjust_actor_possession" as const,
      causalParent: ordinaryRoot,
      source: { kind: "actor" as const, actorId: "actor-player" },
      expectedWorldVersion: spendFrame.worldVersion,
      readScope: [
        { kind: "actor" as const, id: "actor-player" },
        { kind: "possession" as const, id: possessionId },
      ],
      writeScope: [{ kind: "possession" as const, id: possessionId }],
      exposure: {
        mode: "projectable" as const,
        predicates: [{ channel: "direct_perception" as const, locationId: route.toLocationId }],
      },
      actorId: "actor-player",
      possessionId,
      possessionKey,
      name: "Copper chit",
      quantityDelta: -1,
      summary: "The traveler pays one copper chit for a dry cot.",
      affectedRefs: [{ kind: "actor" as const, id: "actor-player" }],
    };
    const spendPreflight = preflightCampaignPlayRulebook({
      frame: spendFrame,
      authority: {
        purpose: "player_action",
        turnId: "turn-opening",
        actorId: "actor-player",
        rootParent: ordinaryRoot,
        authorizedRefs: [
          { kind: "actor", id: "actor-player" },
          { kind: "possession", id: possessionId },
          { kind: "location", id: route.toLocationId },
        ],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: { batchId: spendBatchId, baseWorldVersion: spendFrame.worldVersion, commands: [spendCommand] },
    });
    if (!spendPreflight.accepted) {
      throw new Error(`Spend preflight failed: ${spendPreflight.denial.code}`);
    }
    repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-spend-possession",
        turnId: "turn-opening",
        kind: "actor_job_transitioned",
        workerEpoch: settlementToken.epoch,
        protectedPayloadHash: HASH_C,
        createdAt: 1_730,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: spendFrame,
          accepted: spendPreflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_730,
        });
      },
    });
    expect(handle.sqlite.prepare(`SELECT quantity FROM campaign_play_actor_possessions
      WHERE possession_id = ? AND campaign_id = ?`).get(possessionId, CAMPAIGN_A))
      .toEqual({ quantity: 1 });
    expect(handle.sqlite.prepare(`SELECT affected_refs_json FROM campaign_play_events
      WHERE command_id = ?`).get(spendCommand.commandId)).toEqual({
      affected_refs_json: canonicalizeCampaignPlayProjection([
        { kind: "actor", id: "actor-player" },
        { kind: "possession", id: possessionId },
      ]),
    });

    const obligationFrame = {
      ...loadCampaignPlayRulebookFrame(handle),
      setupPhase: "ready" as const,
    };
    const obligationId = deriveCampaignPlayObligationId(
      obligationFrame.campaignId,
      "actor-player",
      obligationFrame.acceptedWorld.actors[0]!.id,
      "copper",
    );
    const obligationBatchId = "batch-incur-obligation";
    const obligationCommand = {
      commandId: deriveCampaignPlayCommandId(
        obligationFrame.campaignId, "turn-opening", obligationBatchId, 0,
      ),
      batchId: obligationBatchId,
      order: 0,
      kind: "incur_actor_obligation" as const,
      causalParent: ordinaryRoot,
      source: { kind: "actor" as const, actorId: "actor-player" },
      expectedWorldVersion: obligationFrame.worldVersion,
      readScope: [
        { kind: "actor" as const, id: "actor-player" },
        { kind: "actor" as const, id: obligationFrame.acceptedWorld.actors[0]!.id },
        { kind: "obligation" as const, id: obligationId },
      ],
      writeScope: [{ kind: "obligation" as const, id: obligationId }],
      exposure: { mode: "protected" as const },
      debtorActorId: "actor-player",
      creditorActorId: obligationFrame.acceptedWorld.actors[0]!.id,
      obligationId,
      unitKey: "copper" as const,
      amount: 1,
      summary: "The traveler owes one copper for passage.",
      affectedRefs: [
        { kind: "actor" as const, id: "actor-player" },
        { kind: "actor" as const, id: obligationFrame.acceptedWorld.actors[0]!.id },
      ],
    };
    const obligationPreflight = preflightCampaignPlayRulebook({
      frame: obligationFrame,
      authority: {
        purpose: "player_action",
        turnId: "turn-opening",
        actorId: "actor-player",
        rootParent: ordinaryRoot,
        authorizedRefs: [
          { kind: "actor", id: "actor-player" },
          { kind: "actor", id: obligationFrame.acceptedWorld.actors[0]!.id },
        ],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: {
        batchId: obligationBatchId,
        baseWorldVersion: obligationFrame.worldVersion,
        commands: [obligationCommand],
      },
    });
    if (!obligationPreflight.accepted) {
      throw new Error(`Obligation preflight failed: ${obligationPreflight.denial.code}`);
    }
    const priorObligationHash = repository.loadState()!.authority.worldHash;
    const obligationState = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-incur-obligation",
        turnId: "turn-opening",
        kind: "actor_job_transitioned",
        workerEpoch: settlementToken.epoch,
        protectedPayloadHash: HASH_C,
        createdAt: 1_740,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: obligationFrame,
          accepted: obligationPreflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_740,
        });
      },
    });
    expect(obligationState.authority.worldVersion).toBe(obligationFrame.worldVersion + 1);
    expect(obligationState.authority.worldHash).not.toBe(priorObligationHash);
    expect(handle.sqlite.prepare(`SELECT principal_amount AS principalAmount,
      outstanding_amount AS outstandingAmount FROM campaign_play_actor_obligations
      WHERE obligation_id = ? AND campaign_id = ?`).get(obligationId, CAMPAIGN_A))
      .toEqual({ principalAmount: 1, outstandingAmount: 1 });
    expect(loadCampaignPlayRulebookFrame(handle).obligations).toEqual([{
      obligationId,
      debtorActorId: "actor-player",
      creditorActorId: obligationFrame.acceptedWorld.actors[0]!.id,
      unitKey: "copper",
      principalAmount: 1,
      outstandingAmount: 1,
    }]);
    const reloadedPublicState = repository.loadState()!.publicState.projection as {
      obligations: Array<{
        handle: string;
        creditorHandle: string;
        creditorName: string;
        unitKey: string;
        outstandingAmount: number;
      }>;
    };
    expect(reloadedPublicState.obligations).toEqual([{
      handle: deriveCampaignPlayPublicHandle("obligation", CAMPAIGN_A, obligationId),
      creditorHandle: deriveCampaignPlayPublicHandle(
        "actor", CAMPAIGN_A, obligationFrame.acceptedWorld.actors[0]!.id,
      ),
      creditorName: obligationFrame.acceptedWorld.actors[0]!.name,
      unitKey: "copper",
      outstandingAmount: 1,
    }]);
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_receipts WHERE command_id = ?) AS receipts,
      (SELECT count(*) FROM campaign_play_events
        WHERE command_id = ? AND event_kind = 'actor_obligation_incurred') AS events`
    ).get(obligationCommand.commandId, obligationCommand.commandId))
      .toEqual({ receipts: 1, events: 1 });

    const paymentFrame = {
      ...loadCampaignPlayRulebookFrame(handle),
      setupPhase: "ready" as const,
    };
    const creditorPossessionId = deriveCampaignPlayPossessionId(
      paymentFrame.campaignId,
      obligationFrame.acceptedWorld.actors[0]!.id,
      possessionKey,
    );
    const paymentBatchId = "batch-pay-obligation";
    const paymentCommand = {
      commandId: deriveCampaignPlayCommandId(
        paymentFrame.campaignId, "turn-opening", paymentBatchId, 0,
      ),
      batchId: paymentBatchId,
      order: 0,
      kind: "pay_actor_obligation" as const,
      causalParent: ordinaryRoot,
      source: { kind: "actor" as const, actorId: "actor-player" },
      expectedWorldVersion: paymentFrame.worldVersion,
      readScope: [
        { kind: "actor" as const, id: "actor-player" },
        { kind: "actor" as const, id: obligationFrame.acceptedWorld.actors[0]!.id },
        { kind: "possession" as const, id: possessionId },
        { kind: "possession" as const, id: creditorPossessionId },
        { kind: "obligation" as const, id: obligationId },
      ],
      writeScope: [
        { kind: "possession" as const, id: possessionId },
        { kind: "possession" as const, id: creditorPossessionId },
        { kind: "obligation" as const, id: obligationId },
      ],
      exposure: { mode: "protected" as const },
      debtorActorId: "actor-player",
      creditorActorId: obligationFrame.acceptedWorld.actors[0]!.id,
      obligationId,
      paymentPossessionId: possessionId,
      unitKey: "copper" as const,
      amount: 1,
      summary: "The traveler pays one copper toward the passage debt.",
      affectedRefs: [
        { kind: "actor" as const, id: "actor-player" },
        { kind: "actor" as const, id: obligationFrame.acceptedWorld.actors[0]!.id },
      ],
    };
    const paymentPreflight = preflightCampaignPlayRulebook({
      frame: paymentFrame,
      authority: {
        purpose: "player_action",
        turnId: "turn-opening",
        actorId: "actor-player",
        rootParent: ordinaryRoot,
        authorizedRefs: [
          { kind: "actor", id: "actor-player" },
          { kind: "actor", id: obligationFrame.acceptedWorld.actors[0]!.id },
          { kind: "possession", id: possessionId },
          { kind: "obligation", id: obligationId },
        ],
        witnessActorIds: [],
        knownWorldEventIds: [],
      },
      batch: {
        batchId: paymentBatchId,
        baseWorldVersion: paymentFrame.worldVersion,
        commands: [paymentCommand],
      },
    });
    if (!paymentPreflight.accepted) {
      throw new Error(`Payment fixture preflight failed: ${paymentPreflight.denial.code}`);
    }
    const priorPaymentHash = repository.loadState()!.authority.worldHash;
    const paymentState = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-pay-obligation",
        turnId: "turn-opening",
        kind: "actor_job_transitioned",
        workerEpoch: settlementToken.epoch,
        protectedPayloadHash: HASH_C,
        createdAt: 1_750,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: paymentFrame,
          accepted: paymentPreflight,
          context,
          turnId: "turn-opening",
          createdAt: 1_750,
        });
      },
    });
    expect(paymentState.authority.worldVersion).toBe(paymentFrame.worldVersion + 1);
    expect(paymentState.authority.worldHash).not.toBe(priorPaymentHash);
    expect(handle.sqlite.prepare(`SELECT principal_amount AS principalAmount,
      outstanding_amount AS outstandingAmount FROM campaign_play_actor_obligations
      WHERE obligation_id = ? AND campaign_id = ?`).get(obligationId, CAMPAIGN_A))
      .toEqual({ principalAmount: 1, outstandingAmount: 0 });
    expect(handle.sqlite.prepare(`SELECT possession_id AS possessionId, actor_id AS actorId,
      quantity FROM campaign_play_actor_possessions
      WHERE possession_id IN (?, ?) ORDER BY actor_id`).all(possessionId, creditorPossessionId))
      .toEqual([
        { possessionId: creditorPossessionId, actorId: obligationFrame.acceptedWorld.actors[0]!.id, quantity: 1 },
        { possessionId, actorId: "actor-player", quantity: 0 },
      ]);
    expect(loadCampaignPlayRulebookFrame(handle).obligations).toEqual([{
      obligationId,
      debtorActorId: "actor-player",
      creditorActorId: obligationFrame.acceptedWorld.actors[0]!.id,
      unitKey: "copper",
      principalAmount: 1,
      outstandingAmount: 0,
    }]);
    expect(repository.loadState()!.publicState.projection).toMatchObject({ obligations: [] });
    const reloadedRepository = createCampaignPlayStateRepository(openPlay(CAMPAIGN_A));
    const reloadedPaymentState = reloadedRepository.loadState()!;
    expect(reloadedPaymentState.authority.worldHash).toBe(paymentState.authority.worldHash);
    expect(reloadedPaymentState.publicState.projection).toMatchObject({ obligations: [] });
    expect(loadCampaignPlayRulebookFrame(openPlay(CAMPAIGN_A)).obligations).toEqual([{
      obligationId,
      debtorActorId: "actor-player",
      creditorActorId: obligationFrame.acceptedWorld.actors[0]!.id,
      unitKey: "copper",
      principalAmount: 1,
      outstandingAmount: 0,
    }]);
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_receipts WHERE command_id = ?) AS receipts,
      (SELECT count(*) FROM campaign_play_events
        WHERE command_id = ? AND event_kind = 'actor_obligation_payment_applied') AS events`
    ).get(paymentCommand.commandId, paymentCommand.commandId))
      .toEqual({ receipts: 1, events: 1 });
  });

  it("rolls back every ledger and authority write at each injected transaction boundary", () => {
    const { handle, repository, state } = createEligibleState(CAMPAIGN_B);
    const prepared = prepareCharacterBatch(state);
    const faultPoints = [
      { kind: "before_command" as const, commandIndex: 0 },
      { kind: "after_command" as const, commandIndex: 0 },
      { kind: "before_commit" as const, commandIndex: null },
    ];

    for (const requestedFault of faultPoints) {
      expect(() => repository.commitMechanicalAndRuntime({
        worldVersionAdvance: 1,
        event: {
          eventId: `runtime-fault-${requestedFault.kind}`,
          turnId: null,
          kind: "character_created",
          workerEpoch: null,
          protectedPayloadHash: HASH_C,
          createdAt: 1_400,
        },
        mutate(context) {
          executeCampaignPlayRulebookBatch({
            ...prepared,
            context,
            turnId: null,
            createdAt: 1_400,
            persistPlayerCharacter: persistCharacter,
            injectFault(point) {
              if (point.kind === requestedFault.kind && point.commandIndex === requestedFault.commandIndex) {
                throw new Error(`fault:${point.kind}`);
              }
            },
          });
        },
      })).toThrow(`fault:${requestedFault.kind}`);

      expect(handle.sqlite.prepare(`SELECT
        (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
        (SELECT count(*) FROM campaign_play_receipts WHERE campaign_id = ?) AS receipts,
        (SELECT count(*) FROM campaign_play_events WHERE campaign_id = ?) AS events,
        (SELECT count(*) FROM actors WHERE campaign_id = ? AND controller = 'human') AS humans`
      ).get(CAMPAIGN_B, CAMPAIGN_B, CAMPAIGN_B, CAMPAIGN_B)).toEqual({
        commands: 0,
        receipts: 0,
        events: 0,
        humans: 0,
      });
      expect(repository.loadState()?.authority).toMatchObject({
        worldVersion: state.authority.worldVersion,
        runtimeRevision: state.authority.runtimeRevision,
        setupPhase: "character_required",
      });
    }

    const forged = structuredClone(prepared.accepted);
    forged.batch.commands[0]!.source = {
      kind: "system",
      system: "opening_bootstrap",
    };
    expect(() => repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-forged-preflight",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_C,
        createdAt: 1_400,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          frame: prepared.frame,
          accepted: forged,
          context,
          turnId: null,
          createdAt: 1_400,
          persistPlayerCharacter: persistCharacter,
        });
      },
    })).toThrowError(expect.objectContaining({ code: "execution_contract_invalid" }));

    expect(() => repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "runtime-character-constraint",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_C,
        createdAt: 1_400,
      },
      mutate(context) {
        executeCampaignPlayRulebookBatch({
          ...prepared,
          context,
          turnId: null,
          createdAt: 1_400,
          persistPlayerCharacter(characterContext, command) {
            characterContext.sqlite.prepare(`INSERT INTO actors
              (id, campaign_id, kind, controller, role, name, summary, traits, tags)
              VALUES (?, ?, 'person', 'human', 'player', 'Duplicate', 'Constraint fault.', '[]', '[]')`)
              .run(command.actorId, characterContext.campaignId);
          },
        });
      },
    })).toThrow();

    const competingHandle = openPlay(CAMPAIGN_B);
    competingHandle.sqlite.pragma("busy_timeout = 0");
    const competingRepository = createCampaignPlayStateRepository(competingHandle);
    handle.sqlite.exec("BEGIN IMMEDIATE");
    try {
      expect(() => competingRepository.commitMechanicalAndRuntime({
        worldVersionAdvance: 1,
        event: {
          eventId: "runtime-character-contended",
          turnId: null,
          kind: "character_created",
          workerEpoch: null,
          protectedPayloadHash: HASH_C,
          createdAt: 1_400,
        },
        mutate(context) {
          executeCampaignPlayRulebookBatch({
            ...prepared,
            context,
            turnId: null,
            createdAt: 1_400,
            persistPlayerCharacter: persistCharacter,
          });
        },
      })).toThrow();
    } finally {
      handle.sqlite.exec("ROLLBACK");
    }
    expect(handle.sqlite.prepare(`SELECT
      (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ?) AS commands,
      (SELECT count(*) FROM actors WHERE campaign_id = ? AND controller = 'human') AS humans`
    ).get(CAMPAIGN_B, CAMPAIGN_B)).toEqual({ commands: 0, humans: 0 });
  });
});

describe("Campaign Play state repository transactions", () => {
  it("advances declared mechanical, runtime, both, and ledger domains exactly", () => {
    const { handle, repository, state: initial } = createEligibleState();

    const both = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "event-character",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_C,
        createdAt: 1_400,
      },
      mutate(context) {
        insertHumanCharacter(context, HASH_A);
        context.sqlite.prepare(`
          UPDATE campaign_play_states SET setup_phase = 'opening_required'
          WHERE campaign_id = ?
        `).run(context.campaignId);
      },
    });
    expect(both.authority).toMatchObject({
      worldVersion: initial.authority.worldVersion + 1,
      runtimeRevision: initial.authority.runtimeRevision + 1,
      nextRuntimeEventSequence: initial.authority.nextRuntimeEventSequence + 1,
    });
    expect(both.mechanical.hash).not.toBe(initial.mechanical.hash);
    expect(both.runtime.hash).not.toBe(initial.runtime.hash);
    expect(both.mechanical.canonicalBytes).toContain(HASH_A);

    const mechanical = repository.commitMechanical({
      worldVersionAdvance: 1,
      updatedAt: 1_500,
      mutate(context) {
        context.sqlite.prepare(`
          UPDATE actor_goals SET objective = 'Map every route change.'
          WHERE campaign_id = ? AND id = 'goal-a'
        `).run(context.campaignId);
      },
    });
    expect(mechanical.authority.worldVersion).toBe(both.authority.worldVersion + 1);
    expect(mechanical.authority.runtimeRevision).toBe(both.authority.runtimeRevision);
    expect(mechanical.runtime.hash).toBe(both.runtime.hash);

    const runtime = repository.commitRuntime({
      event: {
        eventId: "event-turn-admitted",
        turnId: "turn-opening",
        kind: "turn_admitted",
        workerEpoch: null,
        protectedPayloadHash: HASH_B,
        createdAt: 1_600,
      },
      mutate(context) {
        insertAdmittedTurn(context);
      },
    });
    expect(runtime.authority.worldVersion).toBe(mechanical.authority.worldVersion);
    expect(runtime.mechanical.hash).toBe(mechanical.mechanical.hash);
    expect(runtime.authority.runtimeRevision).toBe(mechanical.authority.runtimeRevision + 1);
    expect(runtime.authority.nextRuntimeEventSequence)
      .toBe(mechanical.authority.nextRuntimeEventSequence + 1);

    const ledger = repository.commitLedger({
      updatedAt: 1_700,
      mutate(context) {
        context.sqlite.prepare(`
          INSERT INTO campaign_play_commands (
            command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
            causal_parent_json, source_json, expected_world_version,
            read_scope_json, write_scope_json, exposure_policy_json,
            arguments_hash, protected_payload_json, protected_payload_hash, created_at
          ) VALUES (
            'command-secret', ?, 'turn-opening', 'batch-secret', 0, 'record_world_event',
            '{"kind":"turn","turnId":"turn-opening"}',
            '{"kind":"system","system":"game_master"}', ?, '[]', '[]',
            '{"mode":"protected"}', ?, '{"secret":"hidden route"}', ?, 1700
          )
        `).run(context.campaignId, context.priorWorldVersion, HASH_A, HASH_C);
      },
    });
    expect(ledger.authority.worldVersion).toBe(runtime.authority.worldVersion);
    expect(ledger.authority.runtimeRevision).toBe(runtime.authority.runtimeRevision);
    expect(ledger.mechanical.hash).toBe(runtime.mechanical.hash);
    expect(ledger.runtime.hash).toBe(runtime.runtime.hash);
    expect(ledger.protectedAudit.canonicalBytes).toContain("hidden route");
    expect(ledger.publicState.canonicalBytes).not.toContain("hidden route");
    expect(handle.sqlite.prepare(`
      SELECT sequence FROM campaign_play_runtime_events
      WHERE campaign_id = ? ORDER BY sequence
    `).all(CAMPAIGN_A)).toEqual([{ sequence: 1 }, { sequence: 2 }, { sequence: 3 }]);
  });

  it("rolls back a mutation that changes an undeclared projection domain", () => {
    const { handle, repository } = createEligibleState();
    expect(() => repository.commitMechanical({
      worldVersionAdvance: 1,
      updatedAt: 1_400,
      mutate(context) {
        context.sqlite.prepare(`
          UPDATE campaign_play_states SET setup_phase = 'opening_required'
          WHERE campaign_id = ?
        `).run(context.campaignId);
      },
    })).toThrowError(expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
      code: "play_transaction_class_mismatch",
    }));
    expect(handle.sqlite.prepare(`
      SELECT setup_phase AS setupPhase FROM campaign_play_states WHERE campaign_id = ?
    `).get(CAMPAIGN_A)).toEqual({ setupPhase: "character_required" });
  });

  it("reloads identical canonical bytes after close and reopen", () => {
    const { handle, repository } = createEligibleState();
    const before = repository.loadState();
    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    const after = createCampaignPlayStateRepository(reopened).loadState();

    expect(after?.mechanical).toEqual(before?.mechanical);
    expect(after?.runtime).toEqual(before?.runtime);
    expect(after?.protectedAudit).toEqual(before?.protectedAudit);
    expect(after?.publicState).toEqual(before?.publicState);
  });

  it("persists receipt-authorized local scenes across reload", () => {
    const { handle, repository, state } = createEligibleState();
    const anchor = state.acceptedReview.locations.find((location) =>
      location.kind === "persistent_sublocation" && location.parentLocationId !== null,
    );
    if (!anchor || anchor.parentLocationId === null) {
      throw new Error("Fixture requires an accepted persistent local scene.");
    }
    const admitted = repository.commitRuntime({
      event: {
        eventId: "runtime-local-scene-turn",
        turnId: "turn-opening",
        kind: "turn_admitted",
        workerEpoch: null,
        protectedPayloadHash: HASH_A,
        createdAt: 1_390,
      },
      mutate(context) {
        insertAdmittedTurn({
          sqlite: context.sqlite,
          campaignId: context.campaignId,
          priorWorldVersion: context.priorWorldVersion,
          priorRuntimeRevision: context.priorRuntimeRevision,
        });
      },
    });
    const payload = JSON.stringify({
      kind: "move_actor",
      actorId: "actor-player",
      routeId: "route-runtime-reload-outbound",
      fromLocationId: anchor.id,
      toLocationId: "scene-runtime-reload",
      materializedLocalScene: {
        locationId: "scene-runtime-reload",
        anchorLocationId: anchor.id,
        name: "Flooded Bell Passage",
        description: "A low side passage where a cracked bell chimes under the waterline.",
        outboundRouteId: "route-runtime-reload-outbound",
        returnRouteId: "route-runtime-reload-return",
        travelCost: 2,
      },
    });
    const committed = repository.commitMechanical({
      worldVersionAdvance: 1,
      updatedAt: 1_400,
      mutate(context) {
        context.sqlite.prepare(`INSERT INTO campaign_play_commands (
          command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
          causal_parent_json, source_json, expected_world_version,
          read_scope_json, write_scope_json, exposure_policy_json,
          arguments_hash, protected_payload_json, protected_payload_hash, created_at
        ) VALUES (?, ?, 'turn-opening', 'batch-runtime-reload', 0, 'move_actor',
          '{"kind":"turn","turnId":"turn-opening"}', '{"kind":"system","system":"game_master"}', ?,
          '[]', '[]', '{"mode":"protected"}', ?, ?, ?, 1400)`).run(
          "command-runtime-reload",
          context.campaignId,
          context.priorWorldVersion,
          HASH_A,
          payload,
          HASH_B,
        );
        context.sqlite.prepare(`INSERT INTO campaign_play_receipts (
          receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
          applied_world_mutation, prior_world_version, result_world_version,
          prior_world_hash, result_world_hash, causal_event_ids_json,
          protected_payload_json, protected_payload_hash, created_at
        ) VALUES (?, ?, 'turn-opening', 'command-runtime-reload', 'move_actor', 'applied',
          1, ?, ?, ?, ?, '["event-runtime-reload"]', ?, ?, 1400)`).run(
          "receipt-runtime-reload",
          context.campaignId,
          context.priorWorldVersion,
          context.targetWorldVersion,
          admitted.authority.worldHash,
          HASH_C,
          payload,
          HASH_B,
        );
        context.sqlite.prepare(`INSERT INTO locations (
          id, campaign_id, name, description, kind, parent_location_id,
          anchor_location_id, persistence, tags, is_starting, definition_authority,
          causal_receipt_id, world_version
        ) VALUES (?, ?, 'Flooded Bell Passage',
          'A low side passage where a cracked bell chimes under the waterline.',
          'persistent_sublocation', ?, ?, 'persistent', '[]', 0, 'campaign_play', ?, ?)`).run(
          "scene-runtime-reload",
          context.campaignId,
          anchor.parentLocationId,
          anchor.id,
          "receipt-runtime-reload",
          context.targetWorldVersion,
        );
        const insertRoute = context.sqlite.prepare(`INSERT INTO location_edges (
          id, campaign_id, from_location_id, to_location_id, travel_cost, discovered,
          definition_authority, causal_receipt_id, world_version
        ) VALUES (?, ?, ?, ?, 2, 1, 'campaign_play', ?, ?)`);
        insertRoute.run(
          "route-runtime-reload-outbound",
          context.campaignId,
          anchor.id,
          "scene-runtime-reload",
          "receipt-runtime-reload",
          context.targetWorldVersion,
        );
        insertRoute.run(
          "route-runtime-reload-return",
          context.campaignId,
          "scene-runtime-reload",
          anchor.id,
          "receipt-runtime-reload",
          context.targetWorldVersion,
        );
      },
    });

    expect(committed.mechanical.projection).toMatchObject({
      runtimeLocations: [{
        id: "scene-runtime-reload",
        anchorLocationId: anchor.id,
        causalReceiptId: "receipt-runtime-reload",
        worldVersion: admitted.authority.worldVersion + 1,
      }],
      runtimeRoutes: expect.arrayContaining([
        expect.objectContaining({ id: "route-runtime-reload-outbound" }),
        expect.objectContaining({ id: "route-runtime-reload-return" }),
      ]),
    });
    expect(() => handle.sqlite.prepare(`UPDATE locations
      SET description = 'Mutated.' WHERE id = 'scene-runtime-reload'`).run()).toThrow();
    handle.close();
    handles = handles.filter((candidate) => candidate !== handle);
    const reopened = openPlay();
    const reloaded = createCampaignPlayStateRepository(reopened).loadState();
    expect(reloaded?.mechanical).toEqual(committed.mechanical);
    expect(loadCampaignPlayRulebookFrame(reopened)).toMatchObject({
      runtimeLocations: [{ id: "scene-runtime-reload", anchorLocationId: anchor.id }],
      runtimeRoutes: expect.arrayContaining([
        expect.objectContaining({ id: "route-runtime-reload-outbound" }),
        expect.objectContaining({ id: "route-runtime-reload-return" }),
      ]),
    });
  });

  it("rejects stored authority hash drift and runtime event gaps", () => {
    const { handle, repository, state } = createEligibleState();
    handle.sqlite.prepare(`
      UPDATE campaign_play_states SET world_hash = ? WHERE campaign_id = ?
    `).run(HASH_C, CAMPAIGN_A);
    expect(() => repository.loadState()).toThrowError(
      expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({ code: "play_state_corrupt" }),
    );
    handle.sqlite.prepare(`
      UPDATE campaign_play_states SET world_hash = ? WHERE campaign_id = ?
    `).run(state.authority.worldHash, CAMPAIGN_A);

    handle.sqlite.prepare(`
      UPDATE campaign_play_states SET runtime_revision = runtime_revision + 1
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A);
    expect(() => repository.loadState()).toThrowError(
      expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({ code: "play_state_corrupt" }),
    );
    handle.sqlite.prepare(`
      UPDATE campaign_play_states SET runtime_revision = ? WHERE campaign_id = ?
    `).run(state.authority.runtimeRevision, CAMPAIGN_A);

    handle.sqlite.prepare(`
      UPDATE campaign_play_states SET runtime_hash = ? WHERE campaign_id = ?
    `).run(HASH_C, CAMPAIGN_A);
    expect(() => repository.loadState()).toThrowError(
      expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({ code: "play_state_corrupt" }),
    );
    handle.sqlite.prepare(`
      UPDATE campaign_play_states SET runtime_hash = ? WHERE campaign_id = ?
    `).run(state.authority.runtimeHash, CAMPAIGN_A);

    handle.sqlite.exec("DROP TRIGGER campaign_play_runtime_events_immutable_delete");
    handle.sqlite.prepare(`
      DELETE FROM campaign_play_runtime_events WHERE campaign_id = ? AND sequence = 1
    `).run(CAMPAIGN_A);
    expect(() => repository.loadState()).toThrowError(
      expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({ code: "play_state_corrupt" }),
    );
  });

  it("rolls back callback writes when final runtime-chain validation fails", () => {
    const { handle, repository, state } = createEligibleState();
    expect(() => repository.commitRuntime({
      event: {
        eventId: "repository-event-two",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_C,
        createdAt: 1_400,
      },
      mutate(context) {
        context.sqlite.prepare(`
          INSERT INTO campaign_play_runtime_events (
            event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
            world_version, prior_runtime_revision, result_runtime_revision,
            prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
          ) VALUES (
            'injected-future-event', ?, 3, NULL, 'character_created', NULL,
            ?, 2, 3, ?, ?, ?, 1399
          )
        `).run(context.campaignId, context.priorWorldVersion, HASH_A, HASH_B, HASH_C);
      },
    })).toThrowError(expect.objectContaining<Partial<CampaignPlayStateRepositoryError>>({
      code: "play_state_corrupt",
    }));

    expect(handle.sqlite.prepare(`
      SELECT event_id AS eventId, sequence FROM campaign_play_runtime_events
      WHERE campaign_id = ? ORDER BY sequence
    `).all(CAMPAIGN_A)).toEqual([{ eventId: `state-created-${CAMPAIGN_A}`, sequence: 1 }]);
    expect(handle.sqlite.prepare(`
      SELECT world_version AS worldVersion, runtime_revision AS runtimeRevision,
        next_runtime_event_sequence AS nextRuntimeEventSequence
      FROM campaign_play_states WHERE campaign_id = ?
    `).get(CAMPAIGN_A)).toEqual({
      worldVersion: state.authority.worldVersion,
      runtimeRevision: state.authority.runtimeRevision,
      nextRuntimeEventSequence: state.authority.nextRuntimeEventSequence,
    });
  });

  it("selects the newest narrator packet by runtime revision when write times disagree", () => {
    const { handle, repository, state } = createEligibleState();
    const narratorPacket = (runtimeRevision: number, locationName: string) => ({
      campaignId: CAMPAIGN_A,
      turnId: `turn-${runtimeRevision}`,
      turnKind: "player_action" as const,
      acceptedWorldVersion: state.authority.acceptedWorldVersion,
      worldVersion: state.authority.worldVersion,
      runtimeRevision,
      currentLocation: {
        handle: `location_${runtimeRevision}`,
        name: locationName,
        description: `${locationName} remains within view.`,
      },
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      possessions: [],
      obligations: [],
      newObservations: [],
      consequences: [],
      continuity: [],
      elapsedMinutes: 0,
      availableIntents: [],
      openingContext: null,
      sourceMoment: "Rain threads across the bridge while the guards take position.",
      playerHistory: [],
      actionContext: {
        submittedText: "I wait and observe.",
        intentKind: "wait" as const,
        disposition: "deterministic" as const,
        result: "success" as const,
        clarificationQuestion: null,
      },
    });
    const olderPacket = narratorPacket(state.authority.runtimeRevision, "Older scene");
    const newerPacket = narratorPacket(state.authority.runtimeRevision + 1, "Newer scene");

    handle.sqlite.pragma("foreign_keys = OFF");
    handle.sqlite.exec("DROP TRIGGER campaign_play_narrations_campaign_turn_insert");
    const committed = repository.commitRuntime({
      event: {
        eventId: "runtime-narrator-packet-order",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_A,
        createdAt: 1_400,
      },
      mutate(context) {
        const insert = context.sqlite.prepare(`INSERT INTO campaign_play_narrations
          (narration_id, campaign_id, turn_id, status, packet_hash, packet_json, created_at)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)`);
        insert.run(
          "narration-older-write",
          context.campaignId,
          olderPacket.turnId,
          HASH_A,
          canonicalizeCampaignPlayProjection(olderPacket),
          2_000,
        );
        insert.run(
          "narration-newer-revision",
          context.campaignId,
          newerPacket.turnId,
          HASH_B,
          canonicalizeCampaignPlayProjection(newerPacket),
          1_000,
        );
      },
    });
    handle.sqlite.pragma("foreign_keys = ON");

    const publicState = committed.publicState.projection as {
      currentLocation: { name: string };
    };
    expect(publicState.currentLocation.name).toBe("Newer scene");
    expect(committed.runtime.canonicalBytes).toContain("narration-newer-revision");
    expect(committed.runtime.canonicalBytes).not.toContain("narration-older-write");
  });

  it("publishes local and observation-earned route state while hiding distant state", () => {
    buildCampaign(CAMPAIGN_A, {
      accepted: true,
      eligible: true,
      extraDistantRoute: true,
    });
    const handle = openPlay();
    const repository = createCampaignPlayStateRepository(handle);
    repository.createState({ eventId: "state-visible-routes", createdAt: 1_300 });
    repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "event-visible-player",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_A,
        createdAt: 1_400,
      },
      mutate(context) {
        insertHumanCharacter(context);
        context.sqlite.prepare(`
          INSERT INTO actor_placements (
            id, campaign_id, actor_id, location_id, placement_kind
          ) VALUES ('placement-player', ?, 'actor-player', 'location-a', 'present')
        `).run(context.campaignId);
        context.sqlite.prepare(`
          UPDATE campaign_play_states SET setup_phase = 'opening_required'
          WHERE campaign_id = ?
        `).run(context.campaignId);
      },
    });

    handle.sqlite.pragma("foreign_keys = OFF");
    handle.sqlite.exec("DROP TRIGGER campaign_play_route_states_insert_guard");
    handle.sqlite.exec("DROP TRIGGER campaign_play_observations_insert_guard");
    const visible = repository.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "event-visible-route-state",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_B,
        createdAt: 1_500,
      },
      mutate(context) {
        const insertRouteState = context.sqlite.prepare(`
          INSERT INTO campaign_play_route_states (
            route_id, campaign_id, state, causal_receipt_id, world_version, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1500)
        `);
        insertRouteState.run(
          "route-a",
          context.campaignId,
          "restricted",
          "fixture-receipt-route-a",
          context.targetWorldVersion,
        );
        insertRouteState.run(
          "route-b",
          context.campaignId,
          "blocked",
          "fixture-receipt-route-b",
          context.targetWorldVersion,
        );
        insertRouteState.run(
          "route-distant-hidden",
          context.campaignId,
          "blocked",
          "fixture-receipt-route-hidden",
          context.targetWorldVersion,
        );
        context.sqlite.prepare(`
          INSERT INTO campaign_play_observations (
            observation_id, campaign_id, human_actor_id, event_id, exposure_id,
            channel, source_location_id, source_route_id, source_trigger,
            source_witness_actor_id, perceived_actor_id, source_json, source_hash,
            public_entry_json, public_entry_hash, world_time_minutes, created_at
          ) VALUES (
            'observation-route-b', ?, 'actor-player', 'fixture-event', 'fixture-exposure',
            'route_state', NULL, 'route-b', 'inspect', NULL, NULL,
            '{"channel":"route_state","routeId":"route-b"}', ?,
            '{"observationHandle":"journal_route_report","title":"Route report","text":"The route is blocked.","whereOrRoute":"Glass Reef","worldTimeLabel":"Day 1, 00:12","consequence":null}', ?, 12, 1500
          )
        `).run(context.campaignId, HASH_A, HASH_B);
      },
    });
    handle.sqlite.pragma("foreign_keys = ON");

    expect(visible.publicState.canonicalBytes).not.toContain('"routeId":"route-a"');
    expect(visible.publicState.canonicalBytes).not.toContain('"routeId":"route-b"');
    expect(visible.publicState.canonicalBytes).toContain("Route report");
    expect(visible.publicState.canonicalBytes).not.toContain("route-distant-hidden");
    expect(visible.publicState.canonicalBytes).not.toContain("observation-route-b");
    expect(visible.publicState.canonicalBytes).not.toContain('"worldTimeMinutes":12');
  });
});
