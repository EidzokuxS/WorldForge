import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
} from "./campaign-play-projection.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  createCampaignPlayStateRepository,
  type LoadedCampaignPlayState,
} from "./campaign-play-state-repository.js";
import {
  isPreparedCampaignPlayCharacter,
  type PreparedCampaignPlayCharacter,
} from "./character-service.js";
import {
  deriveCampaignPlayCommandId,
  executeCampaignPlayRulebookBatch,
  preflightCampaignPlayRulebook,
  type CampaignPlayRulebookFrame,
  type ExecutedCampaignPlayRulebookBatch,
} from "./rulebook.js";

export type CampaignPlayPlayerBootstrapErrorCode =
  | "bootstrap_state_invalid"
  | "bootstrap_stale"
  | "bootstrap_profile_invalid";

export class CampaignPlayPlayerBootstrapError extends Error {
  constructor(
    readonly code: CampaignPlayPlayerBootstrapErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CampaignPlayPlayerBootstrapError";
  }
}

export interface BootstrapCampaignPlayPlayerInput {
  character: PreparedCampaignPlayCharacter;
  expectedAcceptedWorldVersion: number;
  expectedAcceptedContentHash: string;
  expectedWorldVersion: number;
  expectedRuntimeRevision: number;
  createdAt: number;
}

export interface BootstrappedCampaignPlayPlayer {
  state: LoadedCampaignPlayState;
  execution: ExecutedCampaignPlayRulebookBatch;
}

function bootstrapFrame(state: LoadedCampaignPlayState): CampaignPlayRulebookFrame {
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
    routeStates: [],
    actorConditions: [],
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

function validatePreparedCharacter(
  campaignId: string,
  character: PreparedCampaignPlayCharacter,
): void {
  const recordJson = canonicalizeCampaignPlayProjection(character.record);
  const profileDigest = hashCampaignPlayProjection({
    domain: "campaign_play_character_profile",
    record: character.record,
  });
  if (
    character.campaignId !== campaignId
    || !isPreparedCampaignPlayCharacter(character)
    || character.actorId !== character.record.identity.id
    || character.campaignId !== character.record.identity.campaignId
    || character.record.identity.role !== "player"
    || character.recordJson !== recordJson
    || character.profileDigest !== profileDigest
    || character.sourceDigest.length !== 64
  ) {
    throw new CampaignPlayPlayerBootstrapError(
      "bootstrap_profile_invalid",
      "Prepared Campaign Play character does not match its canonical profile authority.",
    );
  }
}

export function bootstrapCampaignPlayPlayer(
  handle: CampaignPlayDatabaseHandle,
  input: BootstrapCampaignPlayPlayerInput,
): BootstrappedCampaignPlayPlayer {
  if (!Number.isSafeInteger(input.createdAt) || input.createdAt < 0) {
    throw new CampaignPlayPlayerBootstrapError(
      "bootstrap_profile_invalid",
      "Campaign Play player bootstrap requires a valid creation timestamp.",
    );
  }
  const repository = createCampaignPlayStateRepository(handle);
  const before = repository.loadState();
  if (
    !before
    || before.authority.setupPhase !== "character_required"
    || before.authority.worldTimeMinutes !== null
    || before.authority.openedAt !== null
    || before.eligibility.projection.eligible !== true
  ) {
    throw new CampaignPlayPlayerBootstrapError(
      "bootstrap_state_invalid",
      "Campaign Play is not eligible for player bootstrap.",
    );
  }
  if (
    before.authority.acceptedWorldVersion !== input.expectedAcceptedWorldVersion
    || before.authority.acceptedContentHash !== input.expectedAcceptedContentHash
    || before.authority.worldVersion !== input.expectedWorldVersion
    || before.authority.runtimeRevision !== input.expectedRuntimeRevision
  ) {
    throw new CampaignPlayPlayerBootstrapError(
      "bootstrap_stale",
      "Campaign Play player bootstrap authority is stale.",
    );
  }
  validatePreparedCharacter(handle.campaignId, input.character);

  const frame = bootstrapFrame(before);
  const rootParent = {
    kind: "accepted_world" as const,
    campaignId: frame.campaignId,
    acceptedWorldVersion: frame.acceptedWorldVersion,
    acceptedContentHash: frame.acceptedContentHash,
  };
  const batchId = `batch:${hashCampaignPlayProjection({
    domain: "campaign_play_player_bootstrap_batch",
    campaignId: frame.campaignId,
    actorId: input.character.actorId,
    profileDigest: input.character.profileDigest,
  }).slice(0, 32)}`;
  const command = {
    commandId: deriveCampaignPlayCommandId(frame.campaignId, null, batchId, 0),
    batchId,
    order: 0,
    kind: "create_player_actor" as const,
    causalParent: rootParent,
    source: { kind: "system" as const, system: "character_bootstrap" as const },
    expectedWorldVersion: frame.worldVersion,
    readScope: [],
    writeScope: [{ kind: "actor" as const, id: input.character.actorId }],
    exposure: { mode: "protected" as const },
    actorId: input.character.actorId,
    characterDigest: input.character.profileDigest,
    name: input.character.record.identity.displayName,
    summary: input.character.record.profile.personaSummary,
    traits: input.character.record.capabilities.traits ?? [],
    tags: [input.character.sourceKind],
  };
  const accepted = preflightCampaignPlayRulebook({
    frame,
    authority: {
      purpose: "character_bootstrap",
      turnId: null,
      actorId: null,
      rootParent,
      authorizedRefs: [{ kind: "actor", id: input.character.actorId }],
      witnessActorIds: [],
      knownWorldEventIds: [],
    },
    batch: { batchId, baseWorldVersion: frame.worldVersion, commands: [command] },
  });
  if (!accepted.accepted) {
    throw new CampaignPlayPlayerBootstrapError(
      "bootstrap_state_invalid",
      `Campaign Play rejected player bootstrap: ${accepted.denial.code}.`,
    );
  }

  let execution: ExecutedCampaignPlayRulebookBatch | null = null;
  const state = repository.commitMechanicalAndRuntime({
    worldVersionAdvance: 1,
    event: {
      eventId: `runtime:${hashCampaignPlayProjection({ batchId, kind: "character_created" }).slice(0, 32)}`,
      turnId: null,
      kind: "character_created",
      workerEpoch: null,
      protectedPayloadHash: input.character.profileDigest,
      createdAt: input.createdAt,
    },
    mutate(context) {
      if (
        context.priorWorldVersion !== input.expectedWorldVersion
        || context.priorRuntimeRevision !== input.expectedRuntimeRevision
      ) {
        throw new CampaignPlayPlayerBootstrapError(
          "bootstrap_stale",
          "Campaign Play player bootstrap lost its expected state authority.",
        );
      }
      execution = executeCampaignPlayRulebookBatch({
        frame,
        accepted,
        context,
        turnId: null,
        createdAt: input.createdAt,
        persistPlayerCharacter(characterContext) {
          characterContext.sqlite.prepare(`INSERT INTO campaign_play_characters
            (actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`)
            .run(
              input.character.actorId,
              characterContext.campaignId,
              input.character.recordJson,
              input.character.profileDigest,
              input.character.sourceKind,
              input.character.sourceDigest,
              input.createdAt,
            );
        },
      });
    },
  });
  if (execution === null) {
    throw new CampaignPlayPlayerBootstrapError(
      "bootstrap_state_invalid",
      "Campaign Play player bootstrap completed without a Rulebook execution result.",
    );
  }
  return { state, execution };
}
