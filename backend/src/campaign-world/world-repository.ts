import crypto from "node:crypto";
import { z } from "zod";
import type {
  ActorGoalHorizon,
  ActorPlacementKind,
  ActorRelationType,
  CampaignWorldAcceptanceReceipt,
  CampaignWorldBuildEvent,
  CampaignWorldBuildStage,
  CampaignWorldReview,
  CampaignWorldSource,
  CampaignWorldStatus,
  GeneratedWorldActorRole,
  WorldActorKind,
} from "@worldforge/shared";
import type { CampaignWorldBuildCandidate, CampaignWorldStageEvidence } from "./world-builder.js";
import type { CampaignWorldDatabaseHandle } from "./world-database.js";
import { calculateCampaignWorldSourceDigest } from "./world-source.js";
import {
  calculateCampaignWorldContentHash,
  parseAcceptedCampaignWorldReview,
  serializeAcceptedCampaignWorldReview,
} from "./world-snapshot.js";
import {
  validateCampaignWorldDraft,
  type CampaignWorldDraft,
} from "./world-validator.js";

const buildStages = [
  "world_frame",
  "world_cast",
  "world_connections",
  "validation",
  "persistence",
] as const;
const modelStages = new Set([
  "world_frame",
  "world_cast",
  "world_connections",
]);

const forbiddenCampaignTables = [
  "locations",
  "location_edges",
  "location_recent_events",
  "npcs",
  "factions",
  "relationships",
  "players",
  "items",
  "faction_command_nodes",
  "faction_resources",
  "faction_reports",
  "faction_operations",
  "faction_resource_ledger",
  "world_threads",
  "world_thread_events",
  "chronicle",
  "quick_action_offers",
  "world_clocks",
  "turn_clock_ledger",
  "simulation_jobs",
  "simulation_proposals",
  "actor_process_states",
  "actor_wake_signals",
  "actor_knowledge_records",
  "authority_traces",
  "turn_sagas",
  "turn_saga_events",
  "oracle_decisions",
  "settled_turn_packets",
  "narrator_attempts",
  "clean_gameplay_turn_records",
  "clean_gameplay_stage4_receipts",
  "clean_gameplay_actor_conditions",
  "clean_gameplay_minor_pois",
  "actors",
  "actor_goals",
  "actor_relations",
  "actor_placements",
  "world_pressures",
  "world_pressure_actors",
  "world_pressure_locations",
] as const;

const dnaSchema = z.object({
  geography: z.string().min(1),
  politicalStructure: z.string().min(1),
  centralConflict: z.string().min(1),
  culturalFlavor: z.string().min(1),
  environment: z.string().min(1),
  wildcard: z.string().min(1),
}).strict();

const sourceSchema = z.object({
  campaignId: z.string().min(1),
  premise: z.string(),
  dna: dnaSchema.nullable(),
  researchSummary: z.string().min(1).nullable(),
  sourceReferences: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    sourceType: z.string().min(1),
  }).strict()),
  sourceDigest: z.string().min(1),
}).strict();

export type CampaignWorldRepositoryErrorCode =
  | "campaign_recreation_required"
  | "world_build_running"
  | "campaign_world_exists"
  | "source_changed"
  | "build_not_found"
  | "build_not_running"
  | "invalid_build_transition"
  | "world_not_found"
  | "world_not_in_review"
  | "world_version_conflict"
  | "world_state_corrupt";

export class CampaignWorldRepositoryError extends Error {
  constructor(
    readonly code: CampaignWorldRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignWorldRepositoryError";
  }
}

export interface StoredCampaignWorldBuild {
  buildId: string;
  status: "running" | "completed" | "failed";
  stage: CampaignWorldBuildStage;
  sourceDigest: string;
  providerId: string;
  model: string;
  errorCode: string | null;
  startedAt: number;
  completedAt: number | null;
  lastEventSequence: number;
}

export interface FrozenCampaignWorldBuildContext extends StoredCampaignWorldBuild {
  source: CampaignWorldSource;
}

export interface AcquireCampaignWorldBuildInput {
  buildId: string;
  source: CampaignWorldSource;
  expectedSourceDigest: string;
  providerId: string;
  model: string;
  startedAt: number;
}

export interface RecordCampaignWorldStageInput {
  buildId: string;
  stage: CampaignWorldBuildStage;
  createdAt: number;
}

export interface CompleteCampaignWorldStageInput
  extends RecordCampaignWorldStageInput {
  evidence?: CampaignWorldStageEvidence;
}

export interface CompleteCampaignWorldBuildInput {
  buildId: string;
  candidate: CampaignWorldBuildCandidate;
  completedAt: number;
}

export interface FailCampaignWorldBuildInput {
  buildId: string;
  errorCode: string;
  message: string;
  completedAt: number;
  evidence?: CampaignWorldStageEvidence;
}

export interface AcceptCampaignWorldInput {
  expectedVersion: number;
  expectedContentHash: string;
  acceptedAt: number;
}

interface CampaignWorldRepositoryDependencies {
  idFactory: () => string;
  beforeWorldCommit: () => void;
}

export interface CampaignWorldRepository {
  loadSourceStatus(): CampaignWorldStatus;
  loadLatestBuild(): StoredCampaignWorldBuild | null;
  acquireBuild(input: AcquireCampaignWorldBuildInput): StoredCampaignWorldBuild;
  loadBuildContext(buildId: string): FrozenCampaignWorldBuildContext;
  recordStageStarted(input: RecordCampaignWorldStageInput): CampaignWorldBuildEvent;
  recordStageCompleted(input: CompleteCampaignWorldStageInput): CampaignWorldBuildEvent;
  loadBuildEvents(buildId: string, afterSequence?: number): CampaignWorldBuildEvent[];
  completeBuild(input: CompleteCampaignWorldBuildInput): CampaignWorldReview;
  failBuild(input: FailCampaignWorldBuildInput): CampaignWorldBuildEvent;
  loadWorld(): CampaignWorldReview | null;
  acceptWorld(input: AcceptCampaignWorldInput): CampaignWorldAcceptanceReceipt;
}

type BuildRow = {
  buildId: string;
  status: string;
  stage: string;
  sourceDigest: string;
  sourceSnapshotJson: string;
  providerId: string;
  model: string;
  errorCode: string | null;
  startedAt: number;
  completedAt: number | null;
  lastEventSequence: number;
};

type EventRow = {
  buildId: string;
  sequence: number;
  eventType: string;
  stage: string | null;
  payloadJson: string;
  createdAt: number;
};

function isBuildStage(value: string | null): value is CampaignWorldBuildStage {
  return value !== null && buildStages.includes(value as CampaignWorldBuildStage);
}

function repositoryError(
  code: CampaignWorldRepositoryErrorCode,
  message: string,
  cause?: unknown,
): CampaignWorldRepositoryError {
  return new CampaignWorldRepositoryError(
    code,
    message,
    cause === undefined ? undefined : { cause },
  );
}

function parseSource(
  sourceSnapshotJson: string,
  campaignId: string,
  sourceDigest: string,
): CampaignWorldSource {
  let value: unknown;
  try {
    value = JSON.parse(sourceSnapshotJson);
  } catch (error) {
    throw repositoryError(
      "world_state_corrupt",
      "Stored Campaign World source is invalid JSON.",
      error,
    );
  }
  const result = sourceSchema.safeParse(value);
  const calculatedDigest = result.success
    ? calculateCampaignWorldSourceDigest({
        premise: result.data.premise,
        dna: result.data.dna,
        researchSummary: result.data.researchSummary,
        sourceReferences: result.data.sourceReferences,
      })
    : null;
  if (
    !result.success ||
    result.data.campaignId !== campaignId ||
    result.data.sourceDigest !== sourceDigest ||
    calculatedDigest !== sourceDigest
  ) {
    throw repositoryError(
      "world_state_corrupt",
      "Stored Campaign World source does not match its campaign or digest.",
    );
  }
  return result.data;
}

function parseStringArray(value: string, label: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    throw repositoryError(
      "world_state_corrupt",
      `Stored ${label} is invalid JSON.`,
      error,
    );
  }
  if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string")) {
    throw repositoryError(
      "world_state_corrupt",
      `Stored ${label} must be a string array.`,
    );
  }
  return parsed;
}

function parseBuildRow(row: BuildRow | undefined): StoredCampaignWorldBuild | null {
  if (!row) return null;
  if (
    (row.status !== "running" && row.status !== "completed" && row.status !== "failed") ||
    !isBuildStage(row.stage)
  ) {
    throw repositoryError(
      "world_state_corrupt",
      `Campaign World build ${row.buildId} has invalid lifecycle fields.`,
    );
  }
  return {
    buildId: row.buildId,
    status: row.status,
    stage: row.stage,
    sourceDigest: row.sourceDigest,
    providerId: row.providerId,
    model: row.model,
    errorCode: row.errorCode,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    lastEventSequence: row.lastEventSequence,
  };
}

function eventFromRow(row: EventRow): CampaignWorldBuildEvent {
  let payload: unknown;
  try {
    payload = JSON.parse(row.payloadJson);
  } catch (error) {
    throw repositoryError(
      "world_state_corrupt",
      `Campaign World event ${row.sequence} has invalid JSON.`,
      error,
    );
  }
  const record = payload && typeof payload === "object" && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : {};
  if (row.eventType === "build_started") {
    return {
      sequence: row.sequence,
      buildId: row.buildId,
      type: "build_started",
      createdAt: row.createdAt,
    };
  }
  if (row.eventType === "stage_started" || row.eventType === "stage_completed") {
    if (!isBuildStage(row.stage)) {
      throw repositoryError(
        "world_state_corrupt",
        `Campaign World event ${row.sequence} has an invalid stage.`,
      );
    }
    return {
      sequence: row.sequence,
      buildId: row.buildId,
      type: row.eventType,
      stage: row.stage,
      createdAt: row.createdAt,
    };
  }
  if (
    row.eventType === "build_completed" &&
    typeof record.worldVersion === "number" &&
    typeof record.contentHash === "string"
  ) {
    return {
      sequence: row.sequence,
      buildId: row.buildId,
      type: "build_completed",
      worldVersion: record.worldVersion,
      contentHash: record.contentHash,
      createdAt: row.createdAt,
    };
  }
  if (
    row.eventType === "build_failed" &&
    typeof record.errorCode === "string" &&
    typeof record.message === "string"
  ) {
    return {
      sequence: row.sequence,
      buildId: row.buildId,
      type: "build_failed",
      errorCode: record.errorCode,
      message: record.message,
      createdAt: row.createdAt,
    };
  }
  throw repositoryError(
    "world_state_corrupt",
    `Campaign World event ${row.sequence} has an invalid payload.`,
  );
}

export function createCampaignWorldRepository(
  handle: CampaignWorldDatabaseHandle,
  overrides: Partial<CampaignWorldRepositoryDependencies> = {},
): CampaignWorldRepository {
  const sqlite = handle.sqlite;
  const campaignId = handle.campaignId;
  const dependencies: CampaignWorldRepositoryDependencies = {
    idFactory: crypto.randomUUID,
    beforeWorldCommit: () => {},
    ...overrides,
  };

  const loadBuildRow = (buildId: string): BuildRow | undefined =>
    sqlite.prepare(`
      SELECT
        id AS buildId,
        status,
        stage,
        source_digest AS sourceDigest,
        source_snapshot_json AS sourceSnapshotJson,
        provider_id AS providerId,
        model,
        error_code AS errorCode,
        started_at AS startedAt,
        completed_at AS completedAt,
        COALESCE((
          SELECT MAX(sequence)
          FROM campaign_world_build_events events
          WHERE events.build_id = campaign_world_builds.id
        ), 0) AS lastEventSequence
      FROM campaign_world_builds
      WHERE id = ? AND campaign_id = ?
    `).get(buildId, campaignId) as BuildRow | undefined;

  const requireRunningBuild = (buildId: string): BuildRow => {
    const row = loadBuildRow(buildId);
    if (!row) {
      throw repositoryError("build_not_found", "Campaign World build was not found.");
    }
    if (row.status !== "running") {
      throw repositoryError(
        "build_not_running",
        "Campaign World build is no longer running.",
      );
    }
    if (!isBuildStage(row.stage)) {
      throw repositoryError("world_state_corrupt", "Campaign World build stage is invalid.");
    }
    return row;
  };

  const nextEventSequence = (buildId: string): number => {
    const row = sqlite.prepare(`
      SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
      FROM campaign_world_build_events
      WHERE build_id = ? AND campaign_id = ?
    `).get(buildId, campaignId) as { sequence: number };
    return row.sequence;
  };

  const appendEvent = (
    buildId: string,
    eventType: "build_started" | "stage_started" | "stage_completed" | "build_completed" | "build_failed",
    stage: CampaignWorldBuildStage | null,
    payload: Record<string, unknown>,
    createdAt: number,
  ): CampaignWorldBuildEvent => {
    const sequence = nextEventSequence(buildId);
    sqlite.prepare(`
      INSERT INTO campaign_world_build_events (
        id, campaign_id, build_id, sequence, event_type, stage, payload_json, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dependencies.idFactory(),
      campaignId,
      buildId,
      sequence,
      eventType,
      stage,
      JSON.stringify(payload),
      createdAt,
    );
    return eventFromRow({
      buildId,
      sequence,
      eventType,
      stage,
      payloadJson: JSON.stringify(payload),
      createdAt,
    });
  };

  const hasEvent = (
    buildId: string,
    eventType: "stage_started" | "stage_completed",
    stage: CampaignWorldBuildStage,
  ): boolean => Boolean(sqlite.prepare(`
    SELECT 1
    FROM campaign_world_build_events
    WHERE campaign_id = ? AND build_id = ? AND event_type = ? AND stage = ?
    LIMIT 1
  `).get(campaignId, buildId, eventType, stage));

  const assertStageCanStart = (
    buildId: string,
    stage: CampaignWorldBuildStage,
  ): void => {
    if (hasEvent(buildId, "stage_started", stage)) {
      throw repositoryError(
        "invalid_build_transition",
        `Campaign World stage ${stage} already started.`,
      );
    }
    const stageIndex = buildStages.indexOf(stage);
    const previousStage = stageIndex > 0 ? buildStages[stageIndex - 1] : null;
    if (previousStage && !hasEvent(buildId, "stage_completed", previousStage)) {
      throw repositoryError(
        "invalid_build_transition",
        `Campaign World stage ${stage} requires completed ${previousStage}.`,
      );
    }
  };

  const assertStageCanComplete = (
    buildId: string,
    stage: CampaignWorldBuildStage,
  ): void => {
    if (
      !hasEvent(buildId, "stage_started", stage) ||
      hasEvent(buildId, "stage_completed", stage)
    ) {
      throw repositoryError(
        "invalid_build_transition",
        `Campaign World stage ${stage} is not ready to complete.`,
      );
    }
  };

  const insertEvidence = (
    buildId: string,
    evidence: CampaignWorldStageEvidence,
    createdAt: number,
  ): void => {
    if (!modelStages.has(evidence.stage)) {
      throw repositoryError(
        "invalid_build_transition",
        "Model-contract evidence belongs only to model stages.",
      );
    }
    if (evidence.primaryStrategy === null) {
      throw repositoryError(
        "invalid_build_transition",
        "Model-contract evidence requires the provider primary strategy.",
      );
    }
    sqlite.prepare(`
      INSERT INTO campaign_world_build_stages (
        id, campaign_id, build_id, stage,
        requested_mode, primary_strategy, actual_strategy, total_attempts,
        repair_used, retry_used, text_fallback_used,
        response_model, finish_reason, error_code,
        input_tokens, output_tokens, total_tokens, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      dependencies.idFactory(),
      campaignId,
      buildId,
      evidence.stage,
      evidence.requestedMode,
      evidence.primaryStrategy,
      evidence.actualStrategy,
      evidence.totalAttempts,
      evidence.repairUsed ? 1 : 0,
      evidence.retryUsed ? 1 : 0,
      evidence.textFallbackUsed ? 1 : 0,
      evidence.responseModel,
      evidence.finishReason,
      evidence.errorCode,
      evidence.inputTokens,
      evidence.outputTokens,
      evidence.totalTokens,
      createdAt,
    );
  };

  const assertCleanCampaign = (): void => {
    for (const tableName of forbiddenCampaignTables) {
      const found = sqlite
        .prepare(`SELECT 1 FROM ${tableName} WHERE campaign_id = ? LIMIT 1`)
        .get(campaignId);
      if (found) {
        throw repositoryError(
          "campaign_recreation_required",
          `Campaign contains existing state in ${tableName}.`,
        );
      }
    }
    const completedBuild = sqlite.prepare(`
      SELECT 1
      FROM campaign_world_builds
      WHERE campaign_id = ? AND status = 'completed'
      LIMIT 1
    `).get(campaignId);
    if (completedBuild) {
      throw repositoryError(
        "campaign_recreation_required",
        "Campaign contains a completed build without a world record.",
      );
    }
  };

  const loadWorldInternal = (): CampaignWorldReview | null => {
    const worldRow = sqlite.prepare(`
      SELECT
        status,
        world_version AS worldVersion,
        content_hash AS contentHash,
        source_digest AS sourceDigest,
        source_snapshot_json AS sourceSnapshotJson,
        world_summary AS worldSummary,
        built_at AS builtAt,
        accepted_at AS acceptedAt,
        accepted_snapshot_json AS acceptedSnapshotJson,
        accepted_world_version AS acceptedWorldVersion,
        accepted_content_hash AS acceptedContentHash
      FROM campaign_worlds
      WHERE campaign_id = ?
    `).get(campaignId) as {
      status: string;
      worldVersion: number;
      contentHash: string;
      sourceDigest: string;
      sourceSnapshotJson: string;
      worldSummary: string;
      builtAt: number;
      acceptedAt: number | null;
      acceptedSnapshotJson: string | null;
      acceptedWorldVersion: number | null;
      acceptedContentHash: string | null;
    } | undefined;
    if (!worldRow) return null;
    const reviewMetadataIsValid =
      worldRow.status === "review" &&
      worldRow.acceptedAt === null &&
      worldRow.acceptedSnapshotJson === null &&
      worldRow.acceptedWorldVersion === null &&
      worldRow.acceptedContentHash === null;
    const acceptedMetadataIsValid =
      worldRow.status === "accepted" &&
      worldRow.acceptedAt !== null &&
      worldRow.acceptedSnapshotJson !== null &&
      Number.isInteger(worldRow.acceptedWorldVersion) &&
      worldRow.acceptedWorldVersion === worldRow.worldVersion &&
      worldRow.acceptedContentHash === worldRow.contentHash;
    if (
      !Number.isInteger(worldRow.worldVersion) ||
      worldRow.worldVersion < 1 ||
      (!reviewMetadataIsValid && !acceptedMetadataIsValid)
    ) {
      throw repositoryError("world_state_corrupt", "Campaign World metadata is invalid.");
    }

    if (
      worldRow.status === "accepted" &&
      worldRow.acceptedAt !== null &&
      worldRow.acceptedSnapshotJson !== null &&
      worldRow.acceptedWorldVersion !== null &&
      worldRow.acceptedContentHash !== null
    ) {
      try {
        return parseAcceptedCampaignWorldReview(
          worldRow.acceptedSnapshotJson,
          {
            campaignId,
            acceptedWorldVersion: worldRow.acceptedWorldVersion,
            acceptedContentHash: worldRow.acceptedContentHash,
            acceptedAt: worldRow.acceptedAt,
          },
        );
      } catch (error) {
        throw repositoryError(
          "world_state_corrupt",
          "Accepted Campaign World snapshot is invalid.",
          error,
        );
      }
    }

    const source = parseSource(
      worldRow.sourceSnapshotJson,
      campaignId,
      worldRow.sourceDigest,
    );
    const locations = (sqlite.prepare(`
      SELECT id, name, description, kind, parent_location_id AS parentLocationId,
             tags, is_starting AS isStarting
      FROM locations WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      kind: row.kind as "macro" | "persistent_sublocation",
      parentLocationId: row.parentLocationId as string | null,
      tags: parseStringArray(row.tags as string, `location ${row.id as string} tags`),
      isStarting: Boolean(row.isStarting),
    }));
    const routes = (sqlite.prepare(`
      SELECT id, from_location_id AS fromLocationId, to_location_id AS toLocationId,
             travel_cost AS travelCost
      FROM location_edges WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      fromLocationId: row.fromLocationId as string,
      toLocationId: row.toLocationId as string,
      travelCost: row.travelCost as 1,
    }));
    const actors = (sqlite.prepare(`
      SELECT id, kind, controller, role, name, summary, traits, tags
      FROM actors WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      kind: row.kind as WorldActorKind,
      controller: row.controller as "agent",
      role: row.role as GeneratedWorldActorRole,
      name: row.name as string,
      summary: row.summary as string,
      traits: parseStringArray(row.traits as string, `actor ${row.id as string} traits`),
      tags: parseStringArray(row.tags as string, `actor ${row.id as string} tags`),
    }));
    const goals = (sqlite.prepare(`
      SELECT id, actor_id AS actorId, objective, motivation, horizon, priority, status
      FROM actor_goals WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      actorId: row.actorId as string,
      objective: row.objective as string,
      motivation: row.motivation as string,
      horizon: row.horizon as ActorGoalHorizon,
      priority: row.priority as 1,
      status: row.status as "active",
    }));
    const relations = (sqlite.prepare(`
      SELECT id, source_actor_id AS sourceActorId, target_actor_id AS targetActorId,
             relation_type AS relationType, summary, intensity
      FROM actor_relations WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      sourceActorId: row.sourceActorId as string,
      targetActorId: row.targetActorId as string,
      relationType: row.relationType as ActorRelationType,
      summary: row.summary as string,
      intensity: row.intensity as 1,
    }));
    const placements = (sqlite.prepare(`
      SELECT id, actor_id AS actorId, location_id AS locationId,
             placement_kind AS placementKind
      FROM actor_placements WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      actorId: row.actorId as string,
      locationId: row.locationId as string,
      placementKind: row.placementKind as ActorPlacementKind,
    }));
    const pressureActorRows = sqlite.prepare(`
      SELECT pressure_id AS pressureId, actor_id AS actorId
      FROM world_pressure_actors WHERE campaign_id = ? ORDER BY actor_id
    `).all(campaignId) as Array<{ pressureId: string; actorId: string }>;
    const pressureLocationRows = sqlite.prepare(`
      SELECT pressure_id AS pressureId, location_id AS locationId
      FROM world_pressure_locations WHERE campaign_id = ? ORDER BY location_id
    `).all(campaignId) as Array<{ pressureId: string; locationId: string }>;
    const pressures = (sqlite.prepare(`
      SELECT id, name, description, trajectory, urgency
      FROM world_pressures WHERE campaign_id = ? ORDER BY id
    `).all(campaignId) as Array<Record<string, unknown>>).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      trajectory: row.trajectory as string,
      urgency: row.urgency as 1,
      actorIds: pressureActorRows
        .filter((anchor) => anchor.pressureId === row.id)
        .map((anchor) => anchor.actorId),
      locationIds: pressureLocationRows
        .filter((anchor) => anchor.pressureId === row.id)
        .map((anchor) => anchor.locationId),
    }));

    const draft = validateCampaignWorldDraft({
      worldSummary: worldRow.worldSummary,
      locations,
      routes,
      actors,
      goals,
      relations,
      placements,
      pressures,
    });
    const calculatedHash = calculateCampaignWorldContentHash(
      worldRow.sourceDigest,
      draft,
    );
    if (calculatedHash !== worldRow.contentHash) {
      throw repositoryError(
        "world_state_corrupt",
        "Campaign World content hash does not match stored rows.",
      );
    }

    return {
      campaignId,
      status: "review",
      version: worldRow.worldVersion,
      contentHash: worldRow.contentHash,
      sourceDigest: worldRow.sourceDigest,
      worldSummary: worldRow.worldSummary,
      locations,
      routes,
      actors,
      goals,
      relations,
      placements,
      pressures,
      builtAt: worldRow.builtAt,
      acceptedAt: worldRow.acceptedAt,
      source: {
        premise: source.premise,
        dna: source.dna,
        researchSummary: source.researchSummary,
        sourceReferences: source.sourceReferences,
      },
    };
  };

  const insertDraft = (draft: CampaignWorldDraft): void => {
    const insertLocation = sqlite.prepare(`
      INSERT INTO locations (
        id, campaign_id, name, description, kind, parent_location_id, tags, is_starting
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const pendingLocations = [...draft.locations];
    const insertedLocationIds = new Set<string>();
    while (pendingLocations.length > 0) {
      const nextIndex = pendingLocations.findIndex((location) =>
        location.parentLocationId === null ||
        insertedLocationIds.has(location.parentLocationId)
      );
      if (nextIndex < 0) {
        throw repositoryError(
          "world_state_corrupt",
          "Campaign World locations cannot be ordered parent before child.",
        );
      }
      const [location] = pendingLocations.splice(nextIndex, 1);
      if (!location) {
        throw repositoryError(
          "world_state_corrupt",
          "Campaign World location ordering lost an entry.",
        );
      }
      insertLocation.run(
        location.id,
        campaignId,
        location.name,
        location.description,
        location.kind,
        location.parentLocationId,
        JSON.stringify(location.tags),
        location.isStarting ? 1 : 0,
      );
      insertedLocationIds.add(location.id);
    }
    const insertRoute = sqlite.prepare(`
      INSERT INTO location_edges (
        id, campaign_id, from_location_id, to_location_id, travel_cost
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const route of draft.routes) {
      insertRoute.run(
        route.id,
        campaignId,
        route.fromLocationId,
        route.toLocationId,
        route.travelCost,
      );
    }
    const insertActor = sqlite.prepare(`
      INSERT INTO actors (
        id, campaign_id, kind, controller, role, name, summary, traits, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const actor of draft.actors) {
      insertActor.run(
        actor.id,
        campaignId,
        actor.kind,
        actor.controller,
        actor.role,
        actor.name,
        actor.summary,
        JSON.stringify(actor.traits),
        JSON.stringify(actor.tags),
      );
    }
    const insertGoal = sqlite.prepare(`
      INSERT INTO actor_goals (
        id, campaign_id, actor_id, objective, motivation, horizon, priority, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const goal of draft.goals) {
      insertGoal.run(
        goal.id,
        campaignId,
        goal.actorId,
        goal.objective,
        goal.motivation,
        goal.horizon,
        goal.priority,
        goal.status,
      );
    }
    const insertRelation = sqlite.prepare(`
      INSERT INTO actor_relations (
        id, campaign_id, source_actor_id, target_actor_id, relation_type, summary, intensity
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const relation of draft.relations) {
      insertRelation.run(
        relation.id,
        campaignId,
        relation.sourceActorId,
        relation.targetActorId,
        relation.relationType,
        relation.summary,
        relation.intensity,
      );
    }
    const insertPlacement = sqlite.prepare(`
      INSERT INTO actor_placements (
        id, campaign_id, actor_id, location_id, placement_kind
      ) VALUES (?, ?, ?, ?, ?)
    `);
    for (const placement of draft.placements) {
      insertPlacement.run(
        placement.id,
        campaignId,
        placement.actorId,
        placement.locationId,
        placement.placementKind,
      );
    }
    const insertPressure = sqlite.prepare(`
      INSERT INTO world_pressures (
        id, campaign_id, name, description, trajectory, urgency
      ) VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertPressureActor = sqlite.prepare(`
      INSERT INTO world_pressure_actors (
        id, campaign_id, pressure_id, actor_id
      ) VALUES (?, ?, ?, ?)
    `);
    const insertPressureLocation = sqlite.prepare(`
      INSERT INTO world_pressure_locations (
        id, campaign_id, pressure_id, location_id
      ) VALUES (?, ?, ?, ?)
    `);
    for (const pressure of draft.pressures) {
      insertPressure.run(
        pressure.id,
        campaignId,
        pressure.name,
        pressure.description,
        pressure.trajectory,
        pressure.urgency,
      );
      for (const actorId of pressure.actorIds) {
        insertPressureActor.run(
          dependencies.idFactory(),
          campaignId,
          pressure.id,
          actorId,
        );
      }
      for (const locationId of pressure.locationIds) {
        insertPressureLocation.run(
          dependencies.idFactory(),
          campaignId,
          pressure.id,
          locationId,
        );
      }
    }
  };

  const loadLatestBuildInternal = (): StoredCampaignWorldBuild | null => {
    const row = sqlite.prepare(`
      SELECT
        id AS buildId,
        status,
        stage,
        source_digest AS sourceDigest,
        source_snapshot_json AS sourceSnapshotJson,
        provider_id AS providerId,
        model,
        error_code AS errorCode,
        started_at AS startedAt,
        completed_at AS completedAt,
        COALESCE((
          SELECT MAX(sequence)
          FROM campaign_world_build_events events
          WHERE events.build_id = campaign_world_builds.id
        ), 0) AS lastEventSequence
      FROM campaign_world_builds
      WHERE campaign_id = ?
      ORDER BY started_at DESC, rowid DESC
      LIMIT 1
    `).get(campaignId) as BuildRow | undefined;
    return parseBuildRow(row);
  };

  return {
    loadSourceStatus() {
      const world = sqlite.prepare(
        "SELECT status FROM campaign_worlds WHERE campaign_id = ?",
      ).get(campaignId) as { status: string } | undefined;
      if (world) {
        if (world.status === "review" || world.status === "accepted") {
          return world.status;
        }
        throw repositoryError("world_state_corrupt", "Campaign World status is invalid.");
      }
      const latest = loadLatestBuildInternal();
      if (!latest) return "unbuilt";
      if (latest.status === "running") return "building";
      if (latest.status === "failed") return "failed";
      throw repositoryError(
        "world_state_corrupt",
        "Completed Campaign World build has no world record.",
      );
    },

    loadLatestBuild() {
      return loadLatestBuildInternal();
    },

    acquireBuild(input) {
      const transaction = sqlite.transaction(() => {
        if (input.source.campaignId !== campaignId) {
          throw repositoryError("source_changed", "Campaign source belongs to another campaign.");
        }
        const world = sqlite.prepare(
          "SELECT 1 FROM campaign_worlds WHERE campaign_id = ?",
        ).get(campaignId);
        if (world) {
          throw repositoryError("campaign_world_exists", "Campaign already has a built world.");
        }
        const running = sqlite.prepare(`
          SELECT 1 FROM campaign_world_builds
          WHERE campaign_id = ? AND status = 'running' LIMIT 1
        `).get(campaignId);
        if (running) {
          throw repositoryError("world_build_running", "Campaign World build is already running.");
        }
        if (input.expectedSourceDigest !== input.source.sourceDigest) {
          throw repositoryError("source_changed", "Campaign source changed before build acquisition.");
        }
        assertCleanCampaign();
        sqlite.prepare(`
          INSERT INTO campaign_world_builds (
            id, campaign_id, status, stage, source_digest, source_snapshot_json,
            provider_id, model, started_at
          ) VALUES (?, ?, 'running', 'world_frame', ?, ?, ?, ?, ?)
        `).run(
          input.buildId,
          campaignId,
          input.source.sourceDigest,
          JSON.stringify(input.source),
          input.providerId,
          input.model,
          input.startedAt,
        );
        appendEvent(input.buildId, "build_started", null, {}, input.startedAt);
        return parseBuildRow(loadBuildRow(input.buildId));
      });
      try {
        const build = transaction();
        if (!build) {
          throw repositoryError("world_state_corrupt", "Build acquisition returned no build.");
        }
        return build;
      } catch (error) {
        if (error instanceof CampaignWorldRepositoryError) throw error;
        if (
          error instanceof Error &&
          error.message.includes("UNIQUE constraint failed") &&
          error.message.includes("campaign_world_builds.campaign_id")
        ) {
          throw repositoryError(
            "world_build_running",
            "Campaign World build is already running.",
            error,
          );
        }
        throw error;
      }
    },

    loadBuildContext(buildId) {
      const row = loadBuildRow(buildId);
      const build = parseBuildRow(row);
      if (!row || !build) {
        throw repositoryError("build_not_found", "Campaign World build was not found.");
      }
      return {
        ...build,
        source: parseSource(row.sourceSnapshotJson, campaignId, row.sourceDigest),
      };
    },

    recordStageStarted(input) {
      return sqlite.transaction(() => {
        requireRunningBuild(input.buildId);
        assertStageCanStart(input.buildId, input.stage);
        sqlite.prepare(`
          UPDATE campaign_world_builds SET stage = ?
          WHERE id = ? AND campaign_id = ? AND status = 'running'
        `).run(input.stage, input.buildId, campaignId);
        return appendEvent(
          input.buildId,
          "stage_started",
          input.stage,
          {},
          input.createdAt,
        );
      })();
    },

    recordStageCompleted(input) {
      return sqlite.transaction(() => {
        const build = requireRunningBuild(input.buildId);
        if (input.stage === "persistence") {
          throw repositoryError(
            "invalid_build_transition",
            "Persistence completion belongs to the terminal success transaction.",
          );
        }
        if (build.stage !== input.stage) {
          throw repositoryError(
            "invalid_build_transition",
            `Campaign World build is currently at ${build.stage}.`,
          );
        }
        assertStageCanComplete(input.buildId, input.stage);
        if (modelStages.has(input.stage)) {
          if (!input.evidence || input.evidence.stage !== input.stage) {
            throw repositoryError(
              "invalid_build_transition",
              `Campaign World stage ${input.stage} requires matching model evidence.`,
            );
          }
          insertEvidence(input.buildId, input.evidence, input.createdAt);
        } else if (input.evidence) {
          throw repositoryError(
            "invalid_build_transition",
            "Code-only stages do not accept model evidence.",
          );
        }
        return appendEvent(
          input.buildId,
          "stage_completed",
          input.stage,
          {},
          input.createdAt,
        );
      })();
    },

    loadBuildEvents(buildId, afterSequence = 0) {
      if (!loadBuildRow(buildId)) {
        throw repositoryError("build_not_found", "Campaign World build was not found.");
      }
      const rows = sqlite.prepare(`
        SELECT build_id AS buildId, sequence, event_type AS eventType,
               stage, payload_json AS payloadJson, created_at AS createdAt
        FROM campaign_world_build_events
        WHERE campaign_id = ? AND build_id = ? AND sequence > ?
        ORDER BY sequence
      `).all(campaignId, buildId, afterSequence) as EventRow[];
      return rows.map(eventFromRow);
    },

    completeBuild(input) {
      return sqlite.transaction(() => {
        const build = requireRunningBuild(input.buildId);
        if (build.stage !== "persistence") {
          throw repositoryError(
            "invalid_build_transition",
            "Campaign World build must enter persistence before completion.",
          );
        }
        assertStageCanComplete(input.buildId, "persistence");
        const recalculatedHash = calculateCampaignWorldContentHash(
          build.sourceDigest,
          input.candidate.draft,
        );
        if (recalculatedHash !== input.candidate.contentHash) {
          throw repositoryError(
            "world_state_corrupt",
            "Campaign World candidate hash does not match its canonical draft.",
          );
        }
        validateCampaignWorldDraft(input.candidate.draft);
        insertDraft(input.candidate.draft);
        dependencies.beforeWorldCommit();
        sqlite.prepare(`
          INSERT INTO campaign_worlds (
            campaign_id, status, world_version, content_hash, source_digest,
            source_snapshot_json, world_summary, built_at, accepted_at
          ) VALUES (?, 'review', 1, ?, ?, ?, ?, ?, NULL)
        `).run(
          campaignId,
          input.candidate.contentHash,
          build.sourceDigest,
          build.sourceSnapshotJson,
          input.candidate.draft.worldSummary,
          input.completedAt,
        );
        const update = sqlite.prepare(`
          UPDATE campaign_world_builds
          SET status = 'completed', stage = 'persistence', error_code = NULL, completed_at = ?
          WHERE id = ? AND campaign_id = ? AND status = 'running'
        `).run(input.completedAt, input.buildId, campaignId);
        if (update.changes !== 1) {
          throw repositoryError("build_not_running", "Campaign World build lost its running lock.");
        }
        appendEvent(
          input.buildId,
          "stage_completed",
          "persistence",
          {},
          input.completedAt,
        );
        appendEvent(
          input.buildId,
          "build_completed",
          null,
          { worldVersion: 1, contentHash: input.candidate.contentHash },
          input.completedAt,
        );
        const world = loadWorldInternal();
        if (!world) {
          throw repositoryError("world_state_corrupt", "Completed Campaign World is missing.");
        }
        return world;
      })();
    },

    failBuild(input) {
      return sqlite.transaction(() => {
        const row = loadBuildRow(input.buildId);
        if (!row) {
          throw repositoryError("build_not_found", "Campaign World build was not found.");
        }
        if (row.status === "failed") {
          const existing = sqlite.prepare(`
            SELECT build_id AS buildId, sequence, event_type AS eventType,
                   stage, payload_json AS payloadJson, created_at AS createdAt
            FROM campaign_world_build_events
            WHERE campaign_id = ? AND build_id = ? AND event_type = 'build_failed'
            ORDER BY sequence DESC LIMIT 1
          `).get(campaignId, input.buildId) as EventRow | undefined;
          if (!existing) {
            throw repositoryError("world_state_corrupt", "Failed build has no terminal event.");
          }
          return eventFromRow(existing);
        }
        if (row.status !== "running") {
          throw repositoryError("build_not_running", "Completed build cannot be failed.");
        }
        if (input.evidence) {
          insertEvidence(input.buildId, input.evidence, input.completedAt);
        }
        const update = sqlite.prepare(`
          UPDATE campaign_world_builds
          SET status = 'failed', error_code = ?, completed_at = ?
          WHERE id = ? AND campaign_id = ? AND status = 'running'
        `).run(input.errorCode, input.completedAt, input.buildId, campaignId);
        if (update.changes !== 1) {
          throw repositoryError("build_not_running", "Campaign World build lost its running lock.");
        }
        return appendEvent(
          input.buildId,
          "build_failed",
          null,
          { errorCode: input.errorCode, message: input.message },
          input.completedAt,
        );
      })();
    },

    loadWorld() {
      return loadWorldInternal();
    },

    acceptWorld(input) {
      return sqlite.transaction(() => {
        const world = loadWorldInternal();
        if (!world) {
          throw repositoryError("world_not_found", "Campaign World was not found.");
        }
        if (world.status !== "review") {
          throw repositoryError("world_not_in_review", "Campaign World is not awaiting review.");
        }
        if (
          world.version !== input.expectedVersion ||
          world.contentHash !== input.expectedContentHash
        ) {
          throw repositoryError(
            "world_version_conflict",
            "Campaign World changed after this review loaded.",
          );
        }
        const acceptedWorld: CampaignWorldReview = {
          ...world,
          status: "accepted",
          acceptedAt: input.acceptedAt,
        };
        const acceptedSnapshotJson = serializeAcceptedCampaignWorldReview(
          acceptedWorld,
        );
        const update = sqlite.prepare(`
          UPDATE campaign_worlds
          SET status = 'accepted',
              accepted_at = ?,
              accepted_snapshot_json = ?,
              accepted_world_version = ?,
              accepted_content_hash = ?
          WHERE campaign_id = ? AND status = 'review'
            AND world_version = ? AND content_hash = ?
        `).run(
          input.acceptedAt,
          acceptedSnapshotJson,
          world.version,
          world.contentHash,
          campaignId,
          input.expectedVersion,
          input.expectedContentHash,
        );
        if (update.changes !== 1) {
          throw repositoryError(
            "world_version_conflict",
            "Campaign World changed before acceptance committed.",
          );
        }
        return {
          campaignId,
          worldVersion: input.expectedVersion,
          contentHash: input.expectedContentHash,
          acceptedAt: input.acceptedAt,
        };
      })();
    },
  };
}
