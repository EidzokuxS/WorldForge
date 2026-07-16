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
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPublicHandle,
  hashCampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import { createCampaignPlayTurnRepository } from "./campaign-play-turn-repository.js";
import {
  createCampaignPlayOpeningPlanner,
  deriveCampaignPlayOpeningSceneCandidateId,
  type CampaignPlayOpeningExposureSeed,
  type CampaignPlayOpeningProposal,
} from "./opening-planner.js";
import {
  deriveCampaignPlayCommandId,
  executeCampaignPlayRulebookBatch,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookFrame,
} from "./rulebook.js";
import {
  availableIntents,
  createCampaignPlayVisibilityService,
  renderCampaignPlayVisibleActorEvent,
  resolveCampaignPlayOpeningObservableTrace,
} from "./visibility-service.js";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const HASH_A = "a".repeat(64);
const TEST_MODEL_PRICING = { known: true, currency: "USD", tokenUnit: 1_000_000,
  inputCostMicros: 1_000, outputCostMicros: 2_000, rounding: "ceil" } as const;
const HASH_B = "b".repeat(64);
let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignWorldDatabaseHandle | CampaignPlayDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-visibility-"));
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

function acceptPlayableWorld(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "build-visibility",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "build-visibility");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b"
          ? { ...placement, locationId: "location-a" }
          : placement.id === "placement-d"
            ? { ...placement, locationId: "location-c" }
            : placement),
    };
    const review = repository.completeBuild({
      buildId: "build-visibility",
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

function modelEvidence() {
  return {
    actualProviderId: "test-provider",
    actualModel: "planner",
    actualStrategy: "strict_object" as const,
    inputTokens: 10,
    outputTokens: 10,
    durationMs: 20,
    finishReason: "stop",
  };
}

function openingProposal(): CampaignPlayOpeningProposal {
  const actorPlans = ["a", "b", "c", "d", "e", "f"].map((suffix) => {
    const actorId = `actor-${suffix}`;
    const goalId = `goal-${suffix}`;
    const targets = suffix === "b"
      ? [
          { kind: "location" as const, id: "location-b" },
          { kind: "location" as const, id: "location-a" },
          { kind: "goal" as const, id: goalId },
        ]
      : suffix === "c"
        ? [
            { kind: "location" as const, id: "location-c" },
            { kind: "goal" as const, id: goalId },
          ]
        : [{ kind: "goal" as const, id: goalId }];
    const intent = {
      kind: "attempt" as const,
      targets,
      method: `Advance ${goalId} from the current situation`,
      stakes: "The actor's own objective",
    };
    return {
      actorId,
      primaryGoalId: goalId,
      cadenceMinutes: 15,
      steps: [{
        intent,
        observableTrace: suffix === "b"
          ? "Fresh sealing wax and torn binding thread mark a ledger removed in haste."
          : "Fresh work marks show that someone acted here recently.",
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 },
      }],
    };
  });
  return {
    start: {
      role: "A visitor on Bell Island",
      arrivalMode: "On foot",
      immediateSituation: "Signal keepers prepare for another route closure.",
    },
    scene: {
      candidateId: deriveCampaignPlayOpeningSceneCandidateId({
        sceneLocationId: "location-c",
        openingActorId: "actor-c",
        supportActorId: "actor-c",
        pressureId: "pressure-b",
        routeId: "route-c",
      }),
    },
    playerPremise: {
      motivationIndex: 0,
      anchor: "openingActor",
      eventClass: "dialogue",
      summary: "The signal keeper asks the player what brought them to the failing route.",
    },
    actorPlans,
    hiddenConsequence: {
      actorId: "actor-b",
      summary: "A courier changes which ledger reaches the reef.",
      exposure: {
        channel: "local_aftermath",
        validUntilWorldTimeMinutes: 4,
      },
    },
  };
}

function rulebookFrame(handle: CampaignPlayDatabaseHandle): CampaignPlayRulebookFrame {
  const states = createCampaignPlayStateRepository(handle);
  const loaded = states.loadState()!;
  const authority = loaded.authority;
  const routeStates = handle.sqlite.prepare(`SELECT route_id AS routeId, state
    FROM campaign_play_route_states WHERE campaign_id = ? ORDER BY route_id`)
    .all(CAMPAIGN_ID) as CampaignPlayRulebookFrame["routeStates"];
  const actorConditions = handle.sqlite.prepare(`SELECT actor_id AS actorId, condition,
      present, summary FROM campaign_play_actor_conditions
    WHERE campaign_id = ? ORDER BY actor_id, condition`).all(CAMPAIGN_ID)
    .map((row) => ({
      ...(row as Omit<CampaignPlayRulebookFrame["actorConditions"][number], "present">),
      present: Boolean((row as { present: number }).present),
    }));
  const pressureStates = handle.sqlite.prepare(`SELECT pressure_id AS pressureId,
      progress, status, last_advanced_world_time_minutes AS lastAdvancedWorldTimeMinutes
    FROM campaign_play_pressure_states WHERE campaign_id = ? ORDER BY pressure_id`)
    .all(CAMPAIGN_ID) as CampaignPlayRulebookFrame["pressureStates"];
  const placements = (handle.sqlite.prepare(`SELECT id AS placementId, actor_id AS actorId,
      location_id AS locationId, placement_kind AS placementKind
    FROM actor_placements WHERE campaign_id = ? ORDER BY id`).all(CAMPAIGN_ID)) as
    CampaignPlayRulebookFrame["placements"];
  const relations = (handle.sqlite.prepare(`SELECT id AS relationId,
      source_actor_id AS sourceActorId, target_actor_id AS targetActorId,
      relation_type AS relationType, intensity, summary
    FROM actor_relations WHERE campaign_id = ? ORDER BY id`).all(CAMPAIGN_ID)) as
    CampaignPlayRulebookFrame["relations"];
  const goals = (handle.sqlite.prepare(`SELECT id AS goalId, actor_id AS actorId,
      status, priority, objective, motivation
    FROM actor_goals WHERE campaign_id = ? ORDER BY id`).all(CAMPAIGN_ID)) as
    CampaignPlayRulebookFrame["goals"];
  return {
    campaignId: CAMPAIGN_ID,
    acceptedWorldVersion: authority.acceptedWorldVersion,
    acceptedContentHash: authority.acceptedContentHash,
    setupPhase: authority.setupPhase,
    worldVersion: authority.worldVersion,
    worldTimeMinutes: authority.worldTimeMinutes,
    human: { actorId: "actor-player", recordHash: HASH_A },
    acceptedWorld: loaded.acceptedReview,
    routeStates,
    actorConditions,
    possessions: [],
    pressureStates,
    placements,
    relations,
    goals,
  };
}

function createVisibilityFixture(
  routeTriggers: Array<"inspect" | "attempt" | "traverse"> = ["inspect"],
) {
  acceptPlayableWorld();
  const handle = track(openCampaignPlayDatabase(CAMPAIGN_ID));
  const states = createCampaignPlayStateRepository(handle);
  states.createState({ eventId: "state-created", createdAt: 1_300 });
  states.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: {
      eventId: "character-created",
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: HASH_A,
      createdAt: 1_400,
    },
    mutate(context) {
      context.sqlite.prepare(`INSERT INTO actors
        (id, campaign_id, kind, controller, role, name, summary, traits, tags)
        VALUES ('actor-player', ?, 'person', 'human', 'player', 'Player',
          'A human visitor.', '[]', '[]')`).run(context.campaignId);
      context.sqlite.prepare(`INSERT INTO campaign_play_characters
        (actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at)
        VALUES ('actor-player', ?, '{"name":"Player"}', ?, 'created', ?, 1400)`)
        .run(context.campaignId, HASH_A, HASH_B);
      context.sqlite.prepare(`UPDATE campaign_play_states SET setup_phase = 'opening_required'
        WHERE campaign_id = ?`).run(context.campaignId);
    },
  });
  const turns = createCampaignPlayTurnRepository(handle);
  const beforeOpening = states.loadState()!;
  turns.admitTurn({
    turnId: "turn-opening",
    supersedesTurnId: null,
    mutationId: "turn-admitted",
    submittedAt: 1_500,
    document: {
      turnKind: "opening",
      request: {
        idempotencyKey: "opening-one",
        expectedWorldVersion: beforeOpening.authority.worldVersion,
        expectedRuntimeRevision: beforeOpening.authority.runtimeRevision,
        startingConditions: { mode: "delegate" },
      },
      frame: beforeOpening.publicState.projection as CampaignPlayProjectionRecord,
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
    owner: "visibility-worker",
    claimedAt: 1_510,
    leaseExpiresAt: 3_000,
    mutationId: "planner-claimed",
  });
  const openingCandidate = createCampaignPlayOpeningPlanner().compile({
    campaignId: CAMPAIGN_ID,
    turnId: "turn-opening",
    acceptedWorldVersion: beforeOpening.authority.acceptedWorldVersion,
    acceptedContentHash: beforeOpening.authority.acceptedContentHash,
    baseWorldVersion: beforeOpening.authority.worldVersion,
    player: {
      actorId: "actor-player",
      profileDigest: HASH_A,
      name: "Player",
      summary: "A human visitor.",
      traits: [],
      tags: [],
      motivations: ["Understand why the routes are failing"],
    },
    acceptedWorld: beforeOpening.acceptedReview,
  }, { mode: "delegate" }, openingProposal());
  turns.acceptModelArtifact({
    token: plannerToken,
    artifact: openingCandidate.artifact,
    evidence: modelEvidence(),
    mutationDomain: "runtime",
    acceptedAt: 1_520,
    mutationId: "planner-accepted",
  });
  const primaryToken = turns.claimStage({
    turnId: "turn-opening",
    expectedStage: "planned",
    observedEpoch: 1,
    owner: "visibility-worker",
    claimedAt: 1_530,
    leaseExpiresAt: 3_000,
    mutationId: "primary-claimed",
  });
  const openingFrame = rulebookFrame(handle);
  const bootstrapCommands = openingCandidate.artifact.bootstrapCommands;
  const openingAccepted = preflightCampaignPlayRulebook({
    frame: openingFrame,
    authority: {
      purpose: "opening",
      turnId: "turn-opening",
      actorId: "actor-player",
      rootParent: { kind: "turn", turnId: "turn-opening" },
      authorizedRefs: [
        { kind: "actor", id: "actor-player" },
        { kind: "actor", id: "actor-c" },
        { kind: "location", id: "location-c" },
        ...openingFrame.acceptedWorld.pressures.map((pressure) => ({
          kind: "pressure" as const,
          id: pressure.id,
        })),
      ],
      witnessActorIds: [],
      knownWorldEventIds: [],
    },
    batch: {
      batchId: bootstrapCommands[0]!.batchId,
      baseWorldVersion: openingFrame.worldVersion,
      commands: bootstrapCommands,
    },
  });
  if (!openingAccepted.accepted) {
    throw new Error(`Opening denied: ${JSON.stringify(openingAccepted.denial)}`);
  }
  turns.commitDeterministic({
    token: primaryToken,
    transition: "primary_settled",
    worldVersionAdvance: bootstrapCommands.filter((command) =>
      command.kind !== "record_world_event").length,
    committedAt: 1_550,
    mutationId: "primary-settled",
    mutate(context) {
      executeCampaignPlayRulebookBatch({
        frame: openingFrame,
        accepted: openingAccepted,
        context,
        turnId: "turn-opening",
        createdAt: 1_550,
      });
    },
  });
  // The bootstrap rulebook batch owns the zero-time initialization. This fixture's
  // downstream player-action evidence begins after terminal opening narration.
  states.commitRuntime({
    event: {
      eventId: "opening-narration-completed",
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: HASH_B,
      createdAt: 1_560,
    },
    mutate(context) {
      const terminalNarration = context.sqlite.prepare(`UPDATE campaign_play_states
        SET setup_phase = 'ready', opened_at = 1560
        WHERE campaign_id = ? AND setup_phase = 'opening_required' AND opened_at IS NULL`)
        .run(context.campaignId);
      if (terminalNarration.changes !== 1) {
        throw new Error("Visibility fixture could not complete terminal opening narration.");
      }
    },
  });

  const frame = rulebookFrame(handle);
  const batchId = "visibility-evidence";
  const firstId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 0);
  const secondId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 1);
  const thirdId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 2);
  const fourthId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 3);
  const fifthId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 4);
  const sixthId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 5);
  const seventhId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 6);
  const eighthId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 7);
  const ninthId = deriveCampaignPlayCommandId(CAMPAIGN_ID, "turn-opening", batchId, 8);
  const evidenceAccepted = preflightCampaignPlayRulebook({
    frame,
    authority: {
      purpose: "player_action",
      turnId: "turn-opening",
      actorId: "actor-player",
      rootParent: { kind: "turn", turnId: "turn-opening" },
      authorizedRefs: [
        { kind: "actor", id: "actor-player" },
        { kind: "actor", id: "actor-a" },
        { kind: "actor", id: "actor-c" },
        { kind: "location", id: "location-a" },
        { kind: "location", id: "location-b" },
        { kind: "location", id: "location-c" },
        { kind: "location", id: "location-a-office" },
        { kind: "route", id: "route-a" },
        { kind: "route", id: "route-c" },
      ],
      witnessActorIds: ["actor-c"],
      knownWorldEventIds: [],
    },
    batch: {
      batchId,
      baseWorldVersion: frame.worldVersion,
      commands: [
        {
          commandId: firstId,
          batchId,
          order: 0,
          kind: "record_world_event",
          causalParent: { kind: "turn", turnId: "turn-opening" },
          source: { kind: "actor", actorId: "actor-player" },
          expectedWorldVersion: frame.worldVersion,
          readScope: [
            { kind: "actor", id: "actor-player" },
            { kind: "actor", id: "actor-c" },
            { kind: "location", id: "location-c" },
            { kind: "route", id: "route-c" },
          ],
          writeScope: [],
          exposure: {
            mode: "projectable",
            predicates: [
              { channel: "direct_perception", locationId: "location-c" },
              {
                channel: "local_aftermath",
                locationId: "location-a",
                validUntilWorldTimeMinutes: 20,
              },
              {
                channel: "route_state",
                routeId: "route-c",
                triggers: routeTriggers,
              },
              { channel: "witness_report", witnessActorId: "actor-c" },
            ],
          },
          eventClass: "discovery",
          performingActorId: null,
          summary: "Protected summary with hidden-cause-token.",
          observableTrace: "Fresh scuff marks and a snapped seal remain beside the route board.",
          affectedRefs: [
            { kind: "actor", id: "actor-player" },
            { kind: "actor", id: "actor-c" },
            { kind: "location", id: "location-c" },
            { kind: "route", id: "route-c" },
          ],
        },
        {
          commandId: secondId,
          batchId,
          order: 1,
          kind: "record_world_event",
          causalParent: { kind: "command", commandId: firstId },
          source: { kind: "actor", actorId: "actor-player" },
          expectedWorldVersion: frame.worldVersion,
          readScope: [
            { kind: "actor", id: "actor-player" },
            { kind: "actor", id: "actor-c" },
          ],
          writeScope: [],
          exposure: { mode: "protected" },
          eventClass: "dialogue",
          performingActorId: "actor-c",
          summary: "The player asks the nearby witness about hidden-cause-token and hidden-goal-token.",
          observableTrace: null,
          affectedRefs: [
            { kind: "actor", id: "actor-player" },
            { kind: "actor", id: "actor-c" },
          ],
        },
        {
          commandId: thirdId,
          batchId,
          order: 2,
          kind: "move_actor",
          causalParent: { kind: "command", commandId: secondId },
          source: { kind: "actor", actorId: "actor-player" },
          expectedWorldVersion: frame.worldVersion,
          readScope: [
            { kind: "actor", id: "actor-player" },
            { kind: "route", id: "route-c" },
            { kind: "location", id: "location-c" },
            { kind: "location", id: "location-a" },
          ],
          writeScope: [
            { kind: "actor", id: "actor-player" },
            { kind: "location", id: "location-c" },
            { kind: "location", id: "location-a" },
          ],
          exposure: { mode: "protected" },
          actorId: "actor-player",
          routeId: "route-c",
          fromLocationId: "location-c",
          toLocationId: "location-a",
        },
        {
          commandId: fourthId,
          batchId,
          order: 3,
          kind: "record_world_event",
          causalParent: { kind: "command", commandId: thirdId },
          source: { kind: "system", system: "game_master" },
          expectedWorldVersion: frame.worldVersion + 1,
          readScope: [
            { kind: "actor", id: "actor-player" },
            { kind: "actor", id: "actor-a" },
            { kind: "location", id: "location-a" },
          ],
          writeScope: [],
          exposure: {
            mode: "projectable",
            predicates: [
              { channel: "direct_perception", locationId: "location-a" },
            ],
          },
          eventClass: "dialogue",
          performingActorId: "actor-a",
          summary: "Mara Venn says the signal lantern has failed.",
          observableTrace: null,
          affectedRefs: [
            { kind: "actor", id: "actor-player" },
            { kind: "actor", id: "actor-a" },
            { kind: "location", id: "location-a" },
          ],
        },
        {
          commandId: fifthId,
          batchId,
          order: 4,
          kind: "record_world_event",
          causalParent: { kind: "command", commandId: fourthId },
          source: { kind: "system", system: "game_master" },
          expectedWorldVersion: frame.worldVersion + 1,
          readScope: [
            { kind: "actor", id: "actor-c" },
            { kind: "location", id: "location-c" },
            { kind: "route", id: "route-c" },
          ],
          writeScope: [],
          exposure: {
            mode: "projectable",
            predicates: [
              { channel: "direct_perception", locationId: "location-c" },
              { channel: "route_state", routeId: "route-c", triggers: ["inspect"] },
              { channel: "witness_report", witnessActorId: "actor-c" },
            ],
          },
          eventClass: "scene",
          performingActorId: null,
          summary: "Protected distant activity with hidden-distant-token.",
          observableTrace: null,
          affectedRefs: [
            { kind: "actor", id: "actor-c" },
            { kind: "location", id: "location-c" },
            { kind: "route", id: "route-c" },
          ],
        },
        {
          commandId: sixthId,
          batchId,
          order: 5,
          kind: "record_world_event",
          causalParent: { kind: "command", commandId: fifthId },
          source: { kind: "system", system: "game_master" },
          expectedWorldVersion: frame.worldVersion + 1,
          readScope: [
            { kind: "actor", id: "actor-a" },
            { kind: "location", id: "location-a" },
          ],
          writeScope: [],
          exposure: {
            mode: "projectable",
            predicates: [{
              channel: "local_aftermath",
              locationId: "location-a",
              validUntilWorldTimeMinutes: 0,
            }],
          },
          eventClass: "scene",
          performingActorId: null,
          summary: "Protected expired trace with hidden-expired-token.",
          observableTrace: null,
          affectedRefs: [
            { kind: "actor", id: "actor-a" },
            { kind: "location", id: "location-a" },
          ],
        },
        {
          commandId: seventhId,
          batchId,
          order: 6,
          kind: "advance_world_time",
          causalParent: { kind: "command", commandId: sixthId },
          source: { kind: "system", system: "game_master" },
          expectedWorldVersion: frame.worldVersion + 1,
          readScope: [],
          writeScope: [],
          exposure: { mode: "protected" },
          elapsedMinutes: 1,
        },
        {
          commandId: eighthId,
          batchId,
          order: 7,
          kind: "move_actor",
          causalParent: { kind: "command", commandId: seventhId },
          source: { kind: "system", system: "game_master" },
          expectedWorldVersion: frame.worldVersion + 2,
          readScope: [
            { kind: "actor", id: "actor-a" },
            { kind: "route", id: "route-a" },
            { kind: "location", id: "location-a" },
            { kind: "location", id: "location-b" },
          ],
          writeScope: [
            { kind: "actor", id: "actor-a" },
            { kind: "location", id: "location-a" },
            { kind: "location", id: "location-b" },
          ],
          exposure: {
            mode: "projectable",
            predicates: [{ channel: "direct_perception", locationId: "location-a" }],
          },
          actorId: "actor-a",
          routeId: "route-a",
          fromLocationId: "location-a",
          toLocationId: "location-b",
        },
        {
          commandId: ninthId,
          batchId,
          order: 8,
          kind: "record_world_event",
          causalParent: { kind: "command", commandId: eighthId },
          source: { kind: "system", system: "game_master" },
          expectedWorldVersion: frame.worldVersion + 3,
          readScope: [{ kind: "location", id: "location-a-office" }],
          writeScope: [],
          exposure: {
            mode: "projectable",
            predicates: [
              { channel: "direct_perception", locationId: "location-a-office" },
              {
                channel: "local_aftermath",
                locationId: "location-a-office",
                validUntilWorldTimeMinutes: 20,
              },
            ],
          },
          eventClass: "scene",
          performingActorId: null,
          summary: "Sealed writs were handled at the sibling office counter.",
          observableTrace: "Wet seals and a fresh thumbprint mark the office counter.",
          affectedRefs: [{ kind: "location", id: "location-a-office" }],
        },
      ],
    },
  });
  if (!evidenceAccepted.accepted) {
    throw new Error(`Visibility evidence denied: ${JSON.stringify(evidenceAccepted.denial)}`);
  }
  states.commitMechanical({
    updatedAt: 1_600,
    worldVersionAdvance: 3,
    mutate(context) {
      executeCampaignPlayRulebookBatch({
        frame,
        accepted: evidenceAccepted,
        context,
        turnId: "turn-opening",
        createdAt: 1_600,
      });
    },
  });
  const sourceEvent = handle.sqlite.prepare(`SELECT event_id AS eventId
    FROM campaign_play_events WHERE campaign_id = ? AND command_id = ?`)
    .get(CAMPAIGN_ID, firstId) as { eventId: string };
  const sourceExposures = handle.sqlite.prepare(`SELECT exposure_id AS exposureId, channel,
      location_id AS locationId, witness_actor_id AS witnessActorId
    FROM campaign_play_event_exposures
    WHERE campaign_id = ? AND event_id = ? AND channel IN ('direct_perception', 'witness_report')
    ORDER BY channel`).all(CAMPAIGN_ID, sourceEvent.eventId) as Array<{
      exposureId: string;
      channel: "direct_perception" | "witness_report";
      locationId: string | null;
      witnessActorId: string | null;
    }>;
  const directExposure = sourceExposures.find((row) => row.channel === "direct_perception")!;
  const witnessExposure = sourceExposures.find((row) => row.channel === "witness_report")!;
  const directSource = {
    channel: "direct_perception",
    locationId: directExposure.locationId!,
    perceivedActorId: "actor-player",
  };
  const witnessSource = {
    channel: "witness_report",
    witnessActorId: witnessExposure.witnessActorId!,
  };
  states.commitRuntime({
    event: {
      eventId: "witness-knowledge-seeded",
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: HASH_B,
      createdAt: 1_605,
    },
    mutate(context) {
      const insert = context.sqlite.prepare(`INSERT INTO campaign_play_actor_knowledge
        (knowledge_id, campaign_id, actor_id, event_id, exposure_id, channel,
          source_location_id, source_route_id, source_trigger,
          source_witness_actor_id, perceived_actor_id, source_json, source_hash,
          learned_at_world_time_minutes, created_at)
        VALUES (?, ?, 'actor-c', ?, ?, ?, ?, NULL, NULL, ?, ?, ?, ?, 0, ?)`);
      insert.run(
        "knowledge-witness-early",
        context.campaignId,
        sourceEvent.eventId,
        directExposure.exposureId,
        directExposure.channel,
        directExposure.locationId,
        null,
        "actor-player",
        canonicalizeCampaignPlayProjection(directSource),
        hashCampaignPlayProjection(directSource),
        1_590,
      );
      insert.run(
        "knowledge-witness-late",
        context.campaignId,
        sourceEvent.eventId,
        witnessExposure.exposureId,
        witnessExposure.channel,
        null,
        witnessExposure.witnessActorId,
        null,
        canonicalizeCampaignPlayProjection(witnessSource),
        hashCampaignPlayProjection(witnessSource),
        1_700,
      );
    },
  });
  const actorsToken = turns.claimStage({
    turnId: "turn-opening",
    expectedStage: "primary_settled",
    observedEpoch: 2,
    owner: "visibility-worker",
    claimedAt: 1_610,
    leaseExpiresAt: 3_000,
    mutationId: "actors-claimed",
  });
  turns.commitDeterministic({
    token: actorsToken,
    transition: "actors_settled",
    worldVersionAdvance: 0,
    committedAt: 1_620,
    mutationId: "actors-settled",
  });
  const visibilityToken = turns.claimStage({
    turnId: "turn-opening",
    expectedStage: "actors_settled",
    observedEpoch: 3,
    owner: "visibility-worker",
    claimedAt: 1_630,
    leaseExpiresAt: 3_000,
    mutationId: "visibility-claimed",
  });
  return { handle, states, turns, visibilityToken };
}

describe("Campaign Play visibility service", () => {
  it("renders directly perceived actor activity from its public-safe observable trace", () => {
    expect(renderCampaignPlayVisibleActorEvent({
      observableTrace: "Grease-pencil measurements cover the frozen coupling housing.",
    })).toBe("Grease-pencil measurements cover the frozen coupling housing.");
    expect(() => renderCampaignPlayVisibleActorEvent({ observableTrace: null }))
      .toThrow("A directly perceived autonomous actor event requires its persisted observable trace.");
  });

  it("earns valid channels while keeping sibling-scene perception and aftermath hidden", () => {
    const fixture = createVisibilityFixture();
    expect(fixture.handle.sqlite.prepare(`SELECT location_id AS locationId
      FROM actor_placements WHERE campaign_id = ? AND actor_id = 'actor-d'`)
      .get(CAMPAIGN_ID)).toEqual({ locationId: "location-c" });
    const before = fixture.states.loadState()!;
    const result = createCampaignPlayVisibilityService(fixture.handle).projectTurn({
      token: fixture.visibilityToken,
      actionContext: null,
      sourceMoment: null,
      committedAt: 1_650,
      mutationId: "visibility-projected",
    });

    expect(result.turn.stage).toBe("visibility_projected");
    expect(result.turn.finalWorldVersion).toBeNull();
    expect(result.packet.sourceMoment).toBeNull();
    expect(result.packet.runtimeRevision).toBe(before.authority.runtimeRevision + 1);
    expect(result.packet.newObservations.map((entry) => entry.title).sort()).toEqual([
      "Along the route",
      "At the start",
      "Seen nearby",
      "Mara Venn moved",
      "Signs of change",
      "Sel Bell's account",
      "Your action",
    ].sort());
    expect(result.packet.newObservations).toHaveLength(7);
    expect(result.packet.consequences).toHaveLength(7);
    expect(result.packet.newObservations.map((entry) => entry.text)).toContain(
      "The signal keeper asks the player what brought them to the failing route.",
    );
    expect(result.packet.newObservations.map((entry) => entry.text)).toContain(
      "Mara Venn says the signal lantern has failed.",
    );
    expect(result.packet.newObservations.map((entry) => entry.text)).toContain(
      "Mara Venn left for Glass Reef Quay.",
    );
    expect(result.packet.newObservations.map((entry) => entry.text)).toContain(
      "Fresh scuff marks and a snapped seal remain beside the route board.",
    );
    const chronologicalTexts = result.packet.newObservations.map((entry) => entry.text);
    expect(chronologicalTexts.indexOf(
      "Fresh scuff marks and a snapped seal remain beside the route board.",
    )).toBeLessThan(chronologicalTexts.indexOf(
      "Mara Venn says the signal lantern has failed.",
    ));
    expect(chronologicalTexts.indexOf(
      "Mara Venn says the signal lantern has failed.",
    )).toBeLessThan(chronologicalTexts.indexOf(
      "Mara Venn left for Glass Reef Quay.",
    ));
    expect(result.packet.newObservations.map((entry) => entry.text))
      .not.toContain("Something changed here before you arrived.");
    expect(JSON.stringify(result.packet)).not.toContain(
      "Wet seals and a fresh thumbprint mark the office counter.",
    );
    expect(result.packet.currentLocation.name).toBe("North Harbor Docks");
    expect(result.packet.visibleActors.map((actor) => actor.name)).not.toContain("Sel Bell");
    expect(result.packet.visiblePressures).toEqual([]);
    expect(result.packet.availableIntents.some((intent) => intent.kind === "attempt"))
      .toBe(false);
    expect(result.packet.consequences.filter((entry) => entry.causalCue === "your_action"))
      .toHaveLength(5);
    expect(result.packet.consequences.filter((entry) => entry.causalCue === "direct_perception"))
      .toHaveLength(2);
    const performed = result.packet.consequences.find((entry) =>
      entry.whatChanged === "Mara Venn says the signal lantern has failed.");
    expect(performed).toMatchObject({
      performingActorHandle: deriveCampaignPlayPublicHandle("actor", CAMPAIGN_ID, "actor-a"),
      performingActorName: "Mara Venn",
    });
    const premise = result.packet.consequences.find((entry) =>
      entry.whatChanged === "The signal keeper asks the player what brought them to the failing route.");
    expect(premise).toMatchObject({
      performingActorHandle: deriveCampaignPlayPublicHandle("actor", CAMPAIGN_ID, "actor-c"),
    });
    expect(result.packet.consequences.filter((entry) =>
      entry !== performed && entry !== premise).every((entry) =>
      entry.performingActorHandle === null && entry.performingActorName === null)).toBe(true);
    expect(result.knowledgeInserted).toBeGreaterThanOrEqual(8);
    expect(result.observationsInserted).toBe(7);

    const premiseKnowledge = fixture.handle.sqlite.prepare(`SELECT knowledge.actor_id AS actorId
      FROM campaign_play_actor_knowledge knowledge
      JOIN campaign_play_commands command ON command.command_id = (
        SELECT event.command_id FROM campaign_play_events event
        WHERE event.event_id = knowledge.event_id AND event.campaign_id = knowledge.campaign_id
      )
      WHERE knowledge.campaign_id = ?
        AND command.command_kind = 'record_world_event'
        AND json_extract(command.source_json, '$.system') = 'opening_bootstrap'
      ORDER BY knowledge.actor_id`).all(CAMPAIGN_ID);
    expect(premiseKnowledge).toEqual([
      { actorId: "actor-c" },
      { actorId: "actor-player" },
    ]);

    const after = fixture.states.loadState()!;
    expect(after.authority.worldVersion).toBe(before.authority.worldVersion);
    expect(after.authority.runtimeRevision).toBe(before.authority.runtimeRevision + 1);
    const packetBytes = canonicalizeCampaignPlayProjection(result.packet);
    for (const protectedToken of [
      "actor-player",
      "actor-c",
      "location-c",
      "route-c",
      "hidden-cause-token",
      "hidden-goal-token",
      "hidden-distant-token",
      "hidden-expired-token",
      "Safe sea lanes close earlier after every eclipse.",
      "North Harbor loses supply access within two route cycles.",
      "goal-a",
      "goal-b",
      "goal-c",
      "goal-d",
      "relation-a",
      "providerId",
      "requestedModel",
      "characterDigest",
      "recordHash",
      "sourceHash",
      "exposureId",
      "eventId",
      "commandId",
      "receiptId",
      "trajectory",
    ]) expect(packetBytes).not.toContain(protectedToken);

    const stored = fixture.handle.sqlite.prepare(`SELECT status, packet_hash AS packetHash,
        packet_json AS packetJson FROM campaign_play_narrations
      WHERE campaign_id = ? AND turn_id = 'turn-opening'`).get(CAMPAIGN_ID) as {
        status: string;
        packetHash: string;
        packetJson: string;
      };
    expect(stored.status).toBe("pending");
    expect(stored.packetHash).toBe(result.turn.publicPacketHash);
    expect(stored.packetJson).toBe(packetBytes);
    expect(after.publicState.canonicalBytes).not.toContain("actor-player");
    expect(after.publicState.canonicalBytes).not.toContain("location-c");
    expect(after.protectedAudit.canonicalBytes).toContain("direct_perception");
    expect(hashCampaignPlayProjection(after.publicState.projection)).toBe(after.publicState.hash);

    const countsBeforeRetry = fixture.handle.sqlite.prepare(`SELECT
        (SELECT count(*) FROM campaign_play_actor_knowledge WHERE campaign_id = ?) AS knowledge,
        (SELECT count(*) FROM campaign_play_observations WHERE campaign_id = ?) AS observations,
        (SELECT count(*) FROM campaign_play_narrations WHERE campaign_id = ?) AS narrations`)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID);
    expect(() => createCampaignPlayVisibilityService(fixture.handle).projectTurn({
      token: fixture.visibilityToken,
      actionContext: null,
      sourceMoment: null,
      committedAt: 1_660,
      mutationId: "visibility-projected-retry",
    })).toThrowError(expect.objectContaining({ code: "visibility_turn_invalid" }));
    expect(fixture.handle.sqlite.prepare(`SELECT
        (SELECT count(*) FROM campaign_play_actor_knowledge WHERE campaign_id = ?) AS knowledge,
        (SELECT count(*) FROM campaign_play_observations WHERE campaign_id = ?) AS observations,
        (SELECT count(*) FROM campaign_play_narrations WHERE campaign_id = ?) AS narrations`)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID)).toEqual(countsBeforeRetry);
  });

  it("releases the opening observable trace only for its exact actor and earned predicate", () => {
    const proposal = openingProposal();
    const sourcePlan = proposal.actorPlans.find((plan) =>
      plan.actorId === proposal.hiddenConsequence.actorId)!;
    const seed: CampaignPlayOpeningExposureSeed = {
      sourceActorId: proposal.hiddenConsequence.actorId,
      sourceGoalId: sourcePlan.primaryGoalId,
      sourceLocationId: "location-a",
      summary: proposal.hiddenConsequence.summary,
      observableTrace: sourcePlan.steps[0]!.observableTrace,
      predicate: {
        channel: "local_aftermath",
        locationId: "location-a",
        validUntilWorldTimeMinutes: proposal.hiddenConsequence.exposure.channel === "local_aftermath"
          ? proposal.hiddenConsequence.exposure.validUntilWorldTimeMinutes
          : 4,
      },
      discoverableWithinPlayerActions: 2,
    };
    const matching = {
      openingTurnId: "opening-turn",
      eventTurnId: "opening-turn",
      sourceActorId: seed.sourceActorId,
      channel: seed.predicate.channel,
      locationId: seed.predicate.channel === "local_aftermath" ? seed.predicate.locationId : null,
      routeId: null,
      witnessActorId: null,
      commandKind: "record_world_event",
      observableTrace: seed.observableTrace,
    } as const;
    expect(resolveCampaignPlayOpeningObservableTrace(seed, matching)).toBe(
      "Fresh sealing wax and torn binding thread mark a ledger removed in haste.",
    );
    expect(resolveCampaignPlayOpeningObservableTrace(seed, {
      ...matching,
      eventTurnId: "later-player-turn",
    })).toBeNull();
    expect(resolveCampaignPlayOpeningObservableTrace(seed, {
      ...matching,
      sourceActorId: "actor-a",
    })).toBeNull();
    expect(resolveCampaignPlayOpeningObservableTrace(seed, {
      ...matching,
      locationId: "location-b",
    })).toBeNull();
    expect(resolveCampaignPlayOpeningObservableTrace(seed, {
      ...matching,
      observableTrace: "Fresh muster sheets lie open beside a capped ink pot.",
    })).toBeNull();
  });

  it("suggests the shortest open route toward a pending opening aftermath", () => {
    const fixture = createVisibilityFixture();
    fixture.handle.sqlite.prepare(`UPDATE actor_placements SET location_id = 'location-c'
      WHERE campaign_id = ? AND actor_id = 'actor-player' AND placement_kind = 'present'`)
      .run(CAMPAIGN_ID);
    fixture.handle.sqlite.prepare(`INSERT INTO locations
      (id, campaign_id, name, description, tags, connected_to, is_starting, kind, persistence)
      VALUES ('location-detour', ?, 'Aardvark Detour', 'A plausible wrong turn.',
        '[]', '[]', 0, 'macro', 'persistent')`).run(CAMPAIGN_ID);
    fixture.handle.sqlite.prepare(`INSERT INTO location_edges
      (id, campaign_id, from_location_id, to_location_id, travel_cost, discovered)
      VALUES ('route-detour', ?, 'location-c', 'location-detour', 1, 1)`).run(CAMPAIGN_ID);
    const currentLocation = fixture.handle.sqlite.prepare(`SELECT id, name, description
      FROM locations WHERE campaign_id = ? AND id = 'location-c'`).get(CAMPAIGN_ID) as {
        id: string;
        name: string;
        description: string;
      };
    const routeRows = fixture.handle.sqlite.prepare(`SELECT edge.id,
        edge.to_location_id AS destinationId, destination.name AS destinationName,
        edge.travel_cost AS travelCost
      FROM location_edges edge JOIN locations destination ON destination.id = edge.to_location_id
      WHERE edge.campaign_id = ? AND edge.from_location_id = 'location-c'
      ORDER BY destination.name`).all(CAMPAIGN_ID) as Array<{
        id: string;
        destinationId: string;
        destinationName: string;
        travelCost: number;
      }>;
    const scene = {
      currentLocation: {
        handle: deriveCampaignPlayPublicHandle("location", CAMPAIGN_ID, currentLocation.id),
        name: currentLocation.name,
        description: currentLocation.description,
      },
      visibleActors: [],
      visibleRoutes: routeRows.map((route) => ({
        handle: deriveCampaignPlayPublicHandle("route", CAMPAIGN_ID, route.id),
        destinationHandle: deriveCampaignPlayPublicHandle(
          "location",
          CAMPAIGN_ID,
          route.destinationId,
        ),
        destinationName: route.destinationName,
        state: "open" as const,
        travelTimeLabel: `${route.travelCost} travel units`,
      })),
      visiblePressures: [],
      possessions: [],
    };

    const syntheticOpeningSeed: CampaignPlayOpeningExposureSeed = {
      sourceActorId: "actor-player",
      sourceGoalId: "goal-player",
      sourceLocationId: "location-a",
      summary: "The player's earlier action leaves a durable trace.",
      observableTrace: "Fresh sealing wax marks the missing ledger.",
      predicate: {
        channel: "local_aftermath",
        locationId: "location-a",
        validUntilWorldTimeMinutes: 20,
      },
      discoverableWithinPlayerActions: 2,
    };
    const intents = availableIntents(
      fixture.handle,
      "turn-route-guidance",
      null,
      scene,
      "actor-player",
      syntheticOpeningSeed,
      1,
    );
    const move = intents.find((intent) => intent.kind === "move");
    const destination = scene.visibleRoutes.find((route) =>
      route.handle === move?.targets[0]?.handle)?.destinationName;
    expect(destination).toBe("North Harbor Docks");
    expect(destination).not.toBe("Aardvark Detour");

    const actionContext = {
      submittedText: "I follow the immediate work.",
      intentKind: "attempt" as const,
      disposition: "deterministic" as const,
      result: "success" as const,
      clarificationQuestion: null,
    };
    const continuation = availableIntents(
      fixture.handle,
      "turn-commitment-continuation",
      actionContext,
      scene,
      "actor-player",
      syntheticOpeningSeed,
      1,
    );
    expect(continuation.map((intent) => intent.kind)).toEqual([
      "observe",
      "attempt",
      "move",
      "wait",
    ]);
    expect(continuation.find((intent) => intent.kind === "attempt")?.targets).toEqual([{
      handle: scene.currentLocation.handle,
      kind: "location",
    }]);

    const withActor = availableIntents(
      fixture.handle,
      "turn-commitment-with-actor",
      actionContext,
      {
        ...scene,
        visibleActors: [{
          handle: deriveCampaignPlayPublicHandle("actor", CAMPAIGN_ID, "actor-c"),
          name: "Mara Venn",
          monogram: "MV",
          descriptor: "Person nearby",
          accent: "slate",
        }],
      },
      "actor-player",
      syntheticOpeningSeed,
      1,
    );
    expect(withActor).toHaveLength(4);
    expect(withActor.map((intent) => intent.kind)).toEqual([
      "observe",
      "attempt",
      "move",
      "contact",
    ]);

    const clarification = availableIntents(
      fixture.handle,
      "turn-clarification",
      { ...actionContext, disposition: "clarification_required", result: "no_effect",
        clarificationQuestion: "Which lashing do you mean?" },
      scene,
      "actor-player",
      syntheticOpeningSeed,
      1,
    );
    expect(clarification.some((intent) => intent.kind === "attempt")).toBe(false);
  });

  it("keeps route state protected when the committed interaction misses its trigger", () => {
    const fixture = createVisibilityFixture(["attempt"]);
    const result = createCampaignPlayVisibilityService(fixture.handle).projectTurn({
      token: fixture.visibilityToken,
      actionContext: null,
      sourceMoment: null,
      committedAt: 1_650,
      mutationId: "visibility-projected",
    });

    expect(result.packet.newObservations.map((entry) => entry.title))
      .not.toContain("Along the route");
    expect(result.packet.newObservations.map((entry) => entry.title)).toContain("At the start");
    expect(result.packet.newObservations).toHaveLength(6);
    expect(result.packet.visibleRoutes[0]?.state).toBe("open");
    expect(fixture.states.loadState()!.protectedAudit.canonicalBytes)
      .toContain('"routeTriggersJson":"[\\"attempt\\"]"');
  });
});
