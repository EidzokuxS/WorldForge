import crypto from "node:crypto";
import type Database from "better-sqlite3";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  campaignPlayJournalEntrySchema,
  campaignPlayNarratorPacketSchema,
} from "./contracts.js";
import {
  CampaignWorldRepositoryError,
  createCampaignWorldRepository,
} from "../campaign-world/world-repository.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  hashCampaignPlayProjection,
  deriveCampaignPlayUtilityActions,
  projectAcceptedTopologyEligibility,
  projectCampaignPlayMechanicalTruth,
  projectCampaignPlayProtectedAudit,
  projectCampaignPlayPublicState,
  projectCampaignPlayRuntimeTruth,
  deriveCampaignPlayPublicHandle,
  type CampaignPlayHumanMechanicalIdentity,
  type CampaignPlayLiveActorCondition,
  type CampaignPlayLiveGoal,
  type CampaignPlayLivePlacement,
  type CampaignPlayLiveActorObligation,
  type CampaignPlayLiveActorPossession,
  type CampaignPlayLivePressureState,
  type CampaignPlayLiveRelation,
  type CampaignPlayLiveRouteState,
  type CampaignPlayRuntimeLocation,
  type CampaignPlayRuntimeRoute,
  type CampaignPlayRuntimeActor,
  type CampaignPlayEligibilitySemanticProjection,
  type CampaignPlayProjection,
  type CampaignPlayProjectionRecord,
} from "./campaign-play-projection.js";
import type { CampaignPlayRulebookFrame } from "./rulebook.js";

export type CampaignPlayStateRepositoryErrorCode =
  | "campaign_world_not_accepted"
  | "play_state_exists"
  | "play_state_missing"
  | "play_state_corrupt"
  | "play_transaction_class_mismatch";

export class CampaignPlayStateRepositoryError extends Error {
  constructor(
    readonly code: CampaignPlayStateRepositoryErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayStateRepositoryError";
  }
}

export interface CampaignPlayStateAuthority {
  campaignId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  worldVersion: number;
  worldHash: string;
  runtimeRevision: number;
  runtimeHash: string;
  nextRuntimeEventSequence: number;
  worldTimeMinutes: number | null;
  setupPhase: "character_required" | "opening_required" | "ready";
  openedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface LoadedCampaignPlayState {
  authority: CampaignPlayStateAuthority;
  acceptedReview: CampaignWorldReview;
  eligibility: CampaignPlayProjection<CampaignPlayEligibilitySemanticProjection>;
  mechanical: CampaignPlayProjection<object>;
  runtime: CampaignPlayProjection<object>;
  protectedAudit: CampaignPlayProjection<object>;
  publicState: CampaignPlayProjection<object>;
}

export interface CampaignPlayMutationContext {
  sqlite: Database.Database;
  campaignId: string;
  priorWorldVersion: number;
  targetWorldVersion: number;
  priorRuntimeRevision: number;
  targetRuntimeRevision: number;
  runtimeEventSequence: number | null;
  mechanicalHash(): string;
}

export interface CampaignPlayRuntimeEventInput {
  eventId: string;
  turnId: string | null;
  kind:
    | "character_created"
    | "turn_admitted"
    | "worker_claimed"
    | "worker_lease_renewed"
    | "stage_accepted"
    | "primary_settled"
    | "actor_job_transitioned"
    | "visibility_projected"
    | "turn_interrupted"
    | "turn_resumed"
    | "turn_completed"
    | "turn_failed";
  workerEpoch: number | null;
  protectedPayloadHash: string;
  createdAt: number;
}

export interface CampaignPlayRuntimeMutationInput {
  event: CampaignPlayRuntimeEventInput;
  mutate(context: CampaignPlayMutationContext): void;
}

export interface CampaignPlayMechanicalMutationInput {
  updatedAt: number;
  worldVersionAdvance: number;
  mutate(context: CampaignPlayMutationContext): void;
}

export interface CampaignPlayMechanicalRuntimeMutationInput
  extends CampaignPlayRuntimeMutationInput {
  worldVersionAdvance: number;
}

export interface CampaignPlayLedgerMutationInput {
  updatedAt: number;
  mutate(context: CampaignPlayMutationContext): void;
}

export interface CreateCampaignPlayStateInput {
  eventId: string;
  createdAt: number;
}

export interface CampaignPlayStateRepository {
  createState(input: CreateCampaignPlayStateInput): LoadedCampaignPlayState;
  loadState(): LoadedCampaignPlayState | null;
  commitMechanical(input: CampaignPlayMechanicalMutationInput): LoadedCampaignPlayState;
  commitRuntime(input: CampaignPlayRuntimeMutationInput): LoadedCampaignPlayState;
  commitMechanicalAndRuntime(input: CampaignPlayMechanicalRuntimeMutationInput): LoadedCampaignPlayState;
  commitLedger(input: CampaignPlayLedgerMutationInput): LoadedCampaignPlayState;
}

interface StateRow {
  campaignId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  worldVersion: number;
  worldHash: string;
  runtimeRevision: number;
  runtimeHash: string;
  nextRuntimeEventSequence: number;
  worldTimeMinutes: number | null;
  setupPhase: CampaignPlayStateAuthority["setupPhase"];
  openedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

interface RuntimeEventRow {
  eventId: string;
  sequence: number;
  turnId: string | null;
  kind: string;
  workerEpoch: number | null;
  worldVersion: number;
  priorRuntimeRevision: number;
  resultRuntimeRevision: number;
  priorRuntimeHash: string;
  resultRuntimeHash: string;
  protectedPayloadHash: string;
  createdAt: number;
}

type MutationClass = "mechanical" | "runtime" | "both" | "ledger";

function corrupt(message: string, cause?: unknown): CampaignPlayStateRepositoryError {
  return new CampaignPlayStateRepositoryError(
    "play_state_corrupt",
    message,
    cause === undefined ? undefined : { cause },
  );
}

function parseJson(value: string, label: string): CampaignPlayProjectionRecord | CampaignPlayProjectionRecord[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    canonicalizeCampaignPlayProjection(parsed);
    if (parsed === null || typeof parsed !== "object") {
      throw new TypeError(`${label} must contain an object or array.`);
    }
    return parsed as CampaignPlayProjectionRecord | CampaignPlayProjectionRecord[];
  } catch (error) {
    throw corrupt(`${label} contains invalid canonical JSON.`, error);
  }
}

function parseRecord(value: string, label: string): CampaignPlayProjectionRecord {
  const parsed = parseJson(value, label);
  if (Array.isArray(parsed)) throw corrupt(`${label} must contain an object.`);
  return parsed;
}

function parseRecordArray(value: string, label: string): CampaignPlayProjectionRecord[] {
  const parsed = parseJson(value, label);
  if (!Array.isArray(parsed)) throw corrupt(`${label} must contain an array.`);
  return parsed;
}

function loadAcceptedReview(handle: CampaignPlayDatabaseHandle): CampaignWorldReview {
  try {
    const review = createCampaignWorldRepository(handle).loadWorld();
    if (!review || review.status !== "accepted") {
      throw new CampaignPlayStateRepositoryError(
        "campaign_world_not_accepted",
        "Campaign Play requires an accepted Campaign World.",
      );
    }
    return review;
  } catch (error) {
    if (error instanceof CampaignPlayStateRepositoryError) throw error;
    if (error instanceof CampaignWorldRepositoryError) {
      if (error.code === "world_state_corrupt") {
        throw corrupt("The accepted Campaign World snapshot is corrupt.", error);
      }
      throw new CampaignPlayStateRepositoryError(
        "campaign_world_not_accepted",
        "Campaign Play requires an accepted Campaign World.",
        { cause: error },
      );
    }
    throw error;
  }
}

function selectState(sqlite: Database.Database, campaignId: string): StateRow | undefined {
  return sqlite.prepare(`
    SELECT campaign_id AS campaignId,
      accepted_world_version AS acceptedWorldVersion,
      accepted_content_hash AS acceptedContentHash,
      world_version AS worldVersion,
      world_hash AS worldHash,
      runtime_revision AS runtimeRevision,
      runtime_hash AS runtimeHash,
      next_runtime_event_sequence AS nextRuntimeEventSequence,
      world_time_minutes AS worldTimeMinutes,
      setup_phase AS setupPhase,
      opened_at AS openedAt,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM campaign_play_states WHERE campaign_id = ?
  `).get(campaignId) as StateRow | undefined;
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalizeCampaignPlayProjection(left) === canonicalizeCampaignPlayProjection(right);
}

function assertAcceptedFoundation(
  sqlite: Database.Database,
  campaignId: string,
  review: CampaignWorldReview,
): void {
  const locations = sqlite.prepare(`
    SELECT id, name, description, kind, parent_location_id AS parentLocationId,
      tags, is_starting AS isStarting
    FROM locations
    WHERE campaign_id = ? AND definition_authority = 'accepted_world'
    ORDER BY id
  `).all(campaignId) as Array<Record<string, unknown>>;
  const normalizedLocations = locations.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    kind: row.kind,
    parentLocationId: row.parentLocationId,
    tags: JSON.parse(row.tags as string) as unknown,
    isStarting: row.isStarting === 1,
  }));
  const acceptedLocations = [...review.locations]
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!sameJson(normalizedLocations, acceptedLocations)) {
    throw corrupt("Campaign Play location definitions drifted from the accepted Campaign World.");
  }

  const routes = sqlite.prepare(`
    SELECT id, from_location_id AS fromLocationId, to_location_id AS toLocationId,
      travel_cost AS travelCost
    FROM location_edges
    WHERE campaign_id = ? AND definition_authority = 'accepted_world'
    ORDER BY id
  `).all(campaignId);
  const acceptedRoutes = [...review.routes]
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!sameJson(routes, acceptedRoutes)) {
    throw corrupt("Campaign Play route definitions drifted from the accepted Campaign World.");
  }

  const actors = sqlite.prepare(`
    SELECT id, kind, controller, role, name, summary, traits, tags
    FROM actors
    WHERE campaign_id = ? AND controller <> 'human'
      AND definition_authority = 'accepted_world'
    ORDER BY id
  `).all(campaignId) as Array<Record<string, unknown>>;
  const normalizedActors = actors.map((row) => ({
    id: row.id,
    kind: row.kind,
    controller: row.controller,
    role: row.role,
    name: row.name,
    summary: row.summary,
    traits: JSON.parse(row.traits as string) as unknown,
    tags: JSON.parse(row.tags as string) as unknown,
  }));
  const acceptedActors = [...review.actors]
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!sameJson(normalizedActors, acceptedActors)) {
    throw corrupt("Campaign Play actor definitions drifted from the accepted Campaign World.");
  }

  const pressureRows = sqlite.prepare(`
    SELECT id, name, description, trajectory, urgency
    FROM world_pressures WHERE campaign_id = ? ORDER BY id
  `).all(campaignId) as Array<Record<string, unknown>>;
  const actorAnchors = sqlite.prepare(`
    SELECT pressure_id AS pressureId, actor_id AS actorId
    FROM world_pressure_actors WHERE campaign_id = ? ORDER BY pressure_id, actor_id
  `).all(campaignId) as Array<{ pressureId: string; actorId: string }>;
  const locationAnchors = sqlite.prepare(`
    SELECT pressure_id AS pressureId, location_id AS locationId
    FROM world_pressure_locations WHERE campaign_id = ? ORDER BY pressure_id, location_id
  `).all(campaignId) as Array<{ pressureId: string; locationId: string }>;
  const normalizedPressures = pressureRows.map((row) => ({
    ...row,
    actorIds: actorAnchors
      .filter((anchor) => anchor.pressureId === row.id)
      .map((anchor) => anchor.actorId),
    locationIds: locationAnchors
      .filter((anchor) => anchor.pressureId === row.id)
      .map((anchor) => anchor.locationId),
  }));
  const acceptedPressures = [...review.pressures]
    .map((pressure) => ({
      ...pressure,
      actorIds: [...pressure.actorIds].sort(),
      locationIds: [...pressure.locationIds].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));
  if (!sameJson(normalizedPressures, acceptedPressures)) {
    throw corrupt("Campaign Play pressure definitions drifted from the accepted Campaign World.");
  }
}

interface CampaignPlayRuntimeTopology {
  runtimeLocations: CampaignPlayRuntimeLocation[];
  runtimeRoutes: CampaignPlayRuntimeRoute[];
}

function selectRuntimeActors(
  sqlite: Database.Database,
  campaignId: string,
): CampaignPlayRuntimeActor[] {
  const rows = sqlite.prepare(`SELECT id, kind, controller, role, name, summary,
      traits, tags, causal_receipt_id AS causalReceiptId, world_version AS worldVersion
    FROM actors
    WHERE campaign_id = ? AND definition_authority = 'campaign_play'
    ORDER BY id`).all(campaignId) as Array<Record<string, unknown>>;
  return rows.map((row) => {
    if (
      row.kind !== "person" || row.controller !== "agent" || row.role !== "support"
      || typeof row.causalReceiptId !== "string" || !Number.isInteger(row.worldVersion)
    ) {
      throw corrupt("Campaign Play runtime actor provenance is invalid.");
    }
    return {
      id: row.id as string,
      kind: "person",
      controller: "agent",
      role: "support",
      name: row.name as string,
      summary: row.summary as string,
      traits: JSON.parse(row.traits as string) as string[],
      tags: JSON.parse(row.tags as string) as string[],
      causalReceiptId: row.causalReceiptId,
      worldVersion: row.worldVersion as number,
    };
  });
}

function selectRuntimeTopology(
  sqlite: Database.Database,
  campaignId: string,
): CampaignPlayRuntimeTopology {
  const locationRows = sqlite.prepare(`
    SELECT id, name, description, kind,
      parent_location_id AS parentLocationId,
      anchor_location_id AS anchorLocationId,
      tags,
      causal_receipt_id AS causalReceiptId,
      world_version AS worldVersion
    FROM locations
    WHERE campaign_id = ? AND definition_authority = 'campaign_play'
    ORDER BY id
  `).all(campaignId) as Array<{
    id: string;
    name: string;
    description: string;
    kind: string;
    parentLocationId: string | null;
    anchorLocationId: string | null;
    tags: string;
    causalReceiptId: string | null;
    worldVersion: number | null;
  }>;
  const runtimeLocations = locationRows.map((row) => {
    let tags: unknown;
    try {
      tags = JSON.parse(row.tags) as unknown;
    } catch (error) {
      throw corrupt("Campaign Play runtime location tags are invalid.", error);
    }
    if (
      row.kind !== "persistent_sublocation" ||
      row.parentLocationId === null ||
      row.anchorLocationId === null ||
      row.causalReceiptId === null ||
      row.worldVersion === null ||
      !Array.isArray(tags) ||
      !tags.every((tag) => typeof tag === "string")
    ) {
      throw corrupt("Campaign Play runtime location provenance is invalid.");
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      kind: "persistent_sublocation" as const,
      parentLocationId: row.parentLocationId,
      anchorLocationId: row.anchorLocationId,
      tags,
      causalReceiptId: row.causalReceiptId,
      worldVersion: row.worldVersion,
    };
  });
  const routeRows = sqlite.prepare(`
    SELECT id,
      from_location_id AS fromLocationId,
      to_location_id AS toLocationId,
      travel_cost AS travelCost,
      causal_receipt_id AS causalReceiptId,
      world_version AS worldVersion
    FROM location_edges
    WHERE campaign_id = ? AND definition_authority = 'campaign_play'
    ORDER BY id
  `).all(campaignId) as Array<{
    id: string;
    fromLocationId: string;
    toLocationId: string;
    travelCost: number;
    causalReceiptId: string | null;
    worldVersion: number | null;
  }>;
  const runtimeRoutes = routeRows.map((row) => {
    if (row.causalReceiptId === null || row.worldVersion === null) {
      throw corrupt("Campaign Play runtime route provenance is invalid.");
    }
    return {
      ...row,
      causalReceiptId: row.causalReceiptId,
      worldVersion: row.worldVersion,
    };
  });
  return { runtimeLocations, runtimeRoutes };
}

function selectMechanicalProjection(
  sqlite: Database.Database,
  campaignId: string,
  state: StateRow,
  review: CampaignWorldReview,
): CampaignPlayProjection<object> {
  assertAcceptedFoundation(sqlite, campaignId, review);
  const { runtimeLocations, runtimeRoutes } = selectRuntimeTopology(sqlite, campaignId);
  const runtimeActors = selectRuntimeActors(sqlite, campaignId);
  const humanRows = sqlite.prepare(`
    SELECT a.id AS actorId, c.record_hash AS recordHash
    FROM actors a
    LEFT JOIN campaign_play_characters c
      ON c.actor_id = a.id AND c.campaign_id = a.campaign_id
    WHERE a.campaign_id = ? AND a.controller = 'human'
    ORDER BY a.id
  `).all(campaignId) as Array<{ actorId: string; recordHash: string | null }>;
  if (humanRows.length > 1 || (humanRows.length === 1 && humanRows[0].recordHash === null)) {
    throw corrupt("Campaign Play human actor and CharacterRecord are inconsistent.");
  }
  const orphanCharacter = sqlite.prepare(`
    SELECT 1 AS found FROM campaign_play_characters c
    LEFT JOIN actors a ON a.id = c.actor_id
    WHERE c.campaign_id = ? AND (a.id IS NULL OR a.controller <> 'human') LIMIT 1
  `).get(campaignId);
  if (orphanCharacter) throw corrupt("Campaign Play CharacterRecord owner is invalid.");

  const routeStates = sqlite.prepare(`
    SELECT route_id AS routeId, state
    FROM campaign_play_route_states WHERE campaign_id = ? ORDER BY route_id
  `).all(campaignId) as Array<{ routeId: string; state: "open" | "restricted" | "blocked" }>;
  const actorConditions = sqlite.prepare(`
    SELECT actor_id AS actorId, condition, present, summary
    FROM campaign_play_actor_conditions
    WHERE campaign_id = ? ORDER BY actor_id, condition
  `).all(campaignId) as Array<{
    actorId: string;
    condition: "occupied" | "strained" | "incapacitated";
    present: number;
    summary: string;
  }>;
  const pressureStates = sqlite.prepare(`
    SELECT pressure_id AS pressureId, progress, status,
      last_advanced_world_time_minutes AS lastAdvancedWorldTimeMinutes
    FROM campaign_play_pressure_states WHERE campaign_id = ? ORDER BY pressure_id
  `).all(campaignId) as Array<{
    pressureId: string;
    progress: number;
    status: "active" | "resolved";
    lastAdvancedWorldTimeMinutes: number;
  }>;
  const placements = sqlite.prepare(`
    SELECT id AS placementId, actor_id AS actorId, location_id AS locationId,
      placement_kind AS placementKind
    FROM actor_placements WHERE campaign_id = ? ORDER BY id
  `).all(campaignId) as Array<{
    placementId: string;
    actorId: string;
    locationId: string;
    placementKind: "present" | "home";
  }>;
  const relations = sqlite.prepare(`
    SELECT id AS relationId, source_actor_id AS sourceActorId,
      target_actor_id AS targetActorId, relation_type AS relationType,
      intensity, summary
    FROM actor_relations WHERE campaign_id = ? ORDER BY id
  `).all(campaignId) as Array<{
    relationId: string;
    sourceActorId: string;
    targetActorId: string;
    relationType: string;
    intensity: number;
    summary: string;
  }>;
  const goals = sqlite.prepare(`
    SELECT id AS goalId, actor_id AS actorId, status, priority, objective, motivation
    FROM actor_goals WHERE campaign_id = ? ORDER BY id
  `).all(campaignId) as Array<{
    goalId: string;
    actorId: string;
    status: "active" | "completed" | "blocked";
    priority: number;
    objective: string;
    motivation: string;
  }>;
  const possessions = sqlite.prepare(`
    SELECT possession_id AS possessionId, actor_id AS actorId,
      possession_key AS possessionKey, name, quantity
    FROM campaign_play_actor_possessions
    WHERE campaign_id = ?
    ORDER BY actor_id, possession_key, possession_id
  `).all(campaignId) as CampaignPlayLiveActorPossession[];
  const obligations = sqlite.prepare(`
    SELECT obligation_id AS obligationId, debtor_actor_id AS debtorActorId,
      creditor_actor_id AS creditorActorId, unit_key AS unitKey,
      principal_amount AS principalAmount, outstanding_amount AS outstandingAmount
    FROM campaign_play_actor_obligations
    WHERE campaign_id = ?
    ORDER BY debtor_actor_id, creditor_actor_id, unit_key, obligation_id
  `).all(campaignId) as CampaignPlayLiveActorObligation[];

  const acceptedPlacements = review.placements.map((row) => ({
    placementId: row.id,
    actorId: row.actorId,
    locationId: row.locationId,
    placementKind: row.placementKind,
  }));
  const acceptedRelations = review.relations.map((row) => ({
    relationId: row.id,
    sourceActorId: row.sourceActorId,
    targetActorId: row.targetActorId,
    relationType: row.relationType,
    intensity: row.intensity,
    summary: row.summary,
  }));
  const acceptedGoals = review.goals.map((row) => ({
    goalId: row.id,
    actorId: row.actorId,
    status: row.status,
    priority: row.priority,
    objective: row.objective,
    motivation: row.motivation,
  }));
  const baseRowsUnchanged = sameJson(placements, acceptedPlacements) &&
    sameJson(relations, acceptedRelations) && sameJson(goals, acceptedGoals);

  return projectCampaignPlayMechanicalTruth({
    acceptedReview: review,
    worldTimeMinutes: state.worldTimeMinutes,
    human: humanRows.length === 0
      ? null
      : { actorId: humanRows[0].actorId, recordHash: humanRows[0].recordHash as string },
    runtimeActors,
    runtimeLocations,
    runtimeRoutes,
    routeStates,
    actorConditions: actorConditions.map((row) => ({ ...row, present: row.present === 1 })),
    pressureStates,
    placements: baseRowsUnchanged ? [] : placements,
    relations: baseRowsUnchanged ? [] : relations,
    goals: baseRowsUnchanged ? [] : goals,
    possessions,
    obligations,
  });
}

function activeTurn(sqlite: Database.Database, campaignId: string): CampaignPlayProjectionRecord | null {
  const row = sqlite.prepare(`
    SELECT id, turn_kind AS turnKind, stage, expected_world_version AS expectedWorldVersion,
      expected_runtime_revision AS expectedRuntimeRevision,
      base_world_version AS baseWorldVersion, final_world_version AS finalWorldVersion,
      next_event_sequence AS nextEventSequence, worker_lease_owner AS workerLeaseOwner,
      worker_epoch AS workerEpoch, worker_lease_expires_at AS workerLeaseExpiresAt,
      public_packet_hash AS publicPacketHash, interrupted_stage AS interruptedStage,
      error_code AS errorCode, resume_eligible AS resumeEligible
    FROM campaign_play_turns
    WHERE campaign_id = ? AND stage NOT IN ('completed', 'failed')
    ORDER BY submitted_at DESC, id DESC LIMIT 1
  `).get(campaignId) as CampaignPlayProjectionRecord | undefined;
  return row ?? null;
}

function selectRuntimeProjection(
  sqlite: Database.Database,
  campaignId: string,
  state: StateRow,
  eligibility: CampaignPlayProjection<CampaignPlayEligibilitySemanticProjection>,
  nextRuntimeEventSequence = state.nextRuntimeEventSequence,
): CampaignPlayProjection<object> {
  const turn = activeTurn(sqlite, campaignId);
  const plans = sqlite.prepare(`
    SELECT plan_id AS planId, actor_id AS actorId, goal_id AS goalId,
      plan_version AS planVersion, intent_json AS intentJson,
      preconditions_json AS preconditionsJson, cadence_minutes AS cadenceMinutes,
      priority, steps_json AS stepsJson, status
    FROM campaign_play_actor_plans
    WHERE campaign_id = ? AND status = 'active' ORDER BY plan_id
  `).all(campaignId) as Array<Record<string, unknown>>;
  const schedules = sqlite.prepare(`
    SELECT schedule_id AS scheduleId, actor_id AS actorId, plan_id AS planId,
      next_act_at_world_time_minutes AS nextActAtWorldTimeMinutes,
      last_act_at_world_time_minutes AS lastActAtWorldTimeMinutes,
      priority, agency_debt AS agencyDebt
    FROM campaign_play_actor_schedules WHERE campaign_id = ? ORDER BY schedule_id
  `).all(campaignId) as CampaignPlayProjectionRecord[];
  const jobs = sqlite.prepare(`
    SELECT job_id AS jobId, turn_id AS turnId, actor_id AS actorId, plan_id AS planId,
      due_reason AS dueReason, frozen_base_world_version AS frozenBaseWorldVersion,
      worker_epoch AS workerEpoch, stage, proposal_id AS proposalId
    FROM campaign_play_actor_jobs
    WHERE campaign_id = ? AND stage IN ('queued', 'claimed', 'proposed') ORDER BY job_id
  `).all(campaignId) as CampaignPlayProjectionRecord[];
  const proposals = sqlite.prepare(`
    SELECT proposal_id AS proposalId, batch_id AS batchId, job_id AS jobId,
      actor_id AS actorId, causal_parent_json AS causalParentJson,
      base_world_version AS baseWorldVersion, read_scope_json AS readScopeJson,
      write_scope_json AS writeScopeJson,
      expires_at_world_time_minutes AS expiresAtWorldTimeMinutes,
      commands_hash AS commandsHash, status, result_hash AS resultHash
    FROM campaign_play_actor_proposals
    WHERE campaign_id = ? AND status = 'pending' ORDER BY proposal_id
  `).all(campaignId) as Array<Record<string, unknown>>;
  const knowledge = sqlite.prepare(`
    SELECT knowledge_id AS knowledgeId, actor_id AS actorId, event_id AS eventId,
      exposure_id AS exposureId, channel, source_location_id AS sourceLocationId,
      source_route_id AS sourceRouteId, source_trigger AS sourceTrigger,
      source_witness_actor_id AS sourceWitnessActorId,
      perceived_actor_id AS perceivedActorId, source_json AS sourceJson,
      source_hash AS sourceHash,
      learned_at_world_time_minutes AS learnedAtWorldTimeMinutes
    FROM campaign_play_actor_knowledge WHERE campaign_id = ? ORDER BY knowledge_id
  `).all(campaignId) as Array<Record<string, unknown>>;
  const observations = sqlite.prepare(`
    SELECT observation_id AS observationId, human_actor_id AS humanActorId,
      event_id AS eventId, exposure_id AS exposureId, channel,
      source_location_id AS sourceLocationId, source_route_id AS sourceRouteId,
      source_trigger AS sourceTrigger, source_witness_actor_id AS sourceWitnessActorId,
      perceived_actor_id AS perceivedActorId, source_hash AS sourceHash,
      public_entry_hash AS publicEntryHash, world_time_minutes AS worldTimeMinutes
    FROM campaign_play_observations WHERE campaign_id = ? ORDER BY observation_id
  `).all(campaignId) as CampaignPlayProjectionRecord[];
  const narration = sqlite.prepare(`
    SELECT narration_id AS narrationId, turn_id AS turnId, status,
      packet_hash AS packetHash, error_code AS errorCode, completed_at AS completedAt
    FROM campaign_play_narrations WHERE campaign_id = ?
    ORDER BY CAST(json_extract(packet_json, '$.runtimeRevision') AS INTEGER) DESC,
      turn_id DESC, narration_id DESC LIMIT 1
  `).get(campaignId) as CampaignPlayProjectionRecord | undefined;

  return projectCampaignPlayRuntimeTruth({
    campaignId,
    setupPhase: state.setupPhase,
    eligibility: eligibility.projection,
    eligibilityHash: eligibility.hash,
    activeTurn: turn,
    actorPlans: plans.map((row) => cleanUndefined({
      ...row,
      intent: parseRecord(row.intentJson as string, "Actor plan intent"),
      preconditions: parseRecordArray(row.preconditionsJson as string, "Actor plan preconditions"),
      steps: parseRecordArray(row.stepsJson as string, "Actor plan steps"),
      intentJson: undefined,
      preconditionsJson: undefined,
      stepsJson: undefined,
    })),
    actorSchedules: schedules,
    pendingJobs: jobs,
    pendingProposals: proposals.map((row) => cleanUndefined({
      ...row,
      causalParent: parseRecord(row.causalParentJson as string, "Actor proposal causal parent"),
      readScope: parseRecordArray(row.readScopeJson as string, "Actor proposal read scope"),
      writeScope: parseRecordArray(row.writeScopeJson as string, "Actor proposal write scope"),
      causalParentJson: undefined,
      readScopeJson: undefined,
      writeScopeJson: undefined,
    })),
    actorKnowledge: knowledge.map((row) => cleanUndefined({
      ...row,
      source: parseRecord(row.sourceJson as string, "Actor knowledge source"),
      sourceJson: undefined,
    })),
    playerObservations: observations,
    narratorState: narration ?? null,
    workerLeaseEpoch: typeof turn?.workerEpoch === "number" ? turn.workerEpoch : 0,
    nextRuntimeEventSequence,
    nextTurnEventSequence: typeof turn?.nextEventSequence === "number"
      ? turn.nextEventSequence
      : null,
  });
}

function cleanUndefined(record: Record<string, unknown>): CampaignPlayProjectionRecord {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined),
  ) as CampaignPlayProjectionRecord;
}

function rows(sqlite: Database.Database, sql: string, campaignId: string): CampaignPlayProjectionRecord[] {
  return (sqlite.prepare(sql).all(campaignId) as Array<Record<string, unknown>>).map(cleanUndefined);
}

function selectProtectedAudit(
  sqlite: Database.Database,
  campaignId: string,
  state: StateRow,
): CampaignPlayProjection<object> {
  return projectCampaignPlayProtectedAudit({
    campaignId,
    worldVersion: state.worldVersion,
    runtimeRevision: state.runtimeRevision,
    commands: rows(sqlite, `SELECT command_id AS commandId, turn_id AS turnId,
      batch_id AS batchId, command_order AS commandOrder, command_kind AS commandKind,
      causal_parent_json AS causalParentJson, source_json AS sourceJson,
      expected_world_version AS expectedWorldVersion, read_scope_json AS readScopeJson,
      write_scope_json AS writeScopeJson, exposure_policy_json AS exposurePolicyJson,
      arguments_hash AS argumentsHash, protected_payload_json AS protectedPayloadJson,
      protected_payload_hash AS protectedPayloadHash, created_at AS createdAt
      FROM campaign_play_commands WHERE campaign_id = ? ORDER BY command_id`, campaignId),
    receipts: rows(sqlite, `SELECT receipt_id AS receiptId, turn_id AS turnId,
      command_id AS commandId, command_kind AS commandKind,
      applied_world_mutation AS appliedWorldMutation,
      prior_world_version AS priorWorldVersion, result_world_version AS resultWorldVersion,
      prior_world_hash AS priorWorldHash, result_world_hash AS resultWorldHash,
      causal_event_ids_json AS causalEventIdsJson,
      protected_payload_json AS protectedPayloadJson,
      protected_payload_hash AS protectedPayloadHash, created_at AS createdAt
      FROM campaign_play_receipts WHERE campaign_id = ? ORDER BY receipt_id`, campaignId),
    worldEvents: rows(sqlite, `SELECT event_id AS eventId, turn_id AS turnId,
      command_id AS commandId, receipt_id AS receiptId, parent_event_id AS parentEventId,
      event_kind AS eventKind, source_json AS sourceJson,
      world_time_minutes AS worldTimeMinutes, world_version AS worldVersion,
      affected_refs_json AS affectedRefsJson, before_payload_json AS beforePayloadJson,
      after_payload_json AS afterPayloadJson, payload_hash AS payloadHash,
      created_at AS createdAt FROM campaign_play_events
      WHERE campaign_id = ? ORDER BY event_id`, campaignId),
    eventExposures: rows(sqlite, `SELECT exposure_id AS exposureId,
      event_id AS eventId, channel, location_id AS locationId,
      route_id AS routeId, witness_actor_id AS witnessActorId,
      valid_until_world_time_minutes AS validUntilWorldTimeMinutes,
      route_triggers_json AS routeTriggersJson, created_at AS createdAt
      FROM campaign_play_event_exposures
      WHERE campaign_id = ? ORDER BY exposure_id`, campaignId),
    runtimeEvents: rows(sqlite, `SELECT event_id AS eventId, sequence, turn_id AS turnId,
      kind, worker_epoch AS workerEpoch, world_version AS worldVersion,
      prior_runtime_revision AS priorRuntimeRevision,
      result_runtime_revision AS resultRuntimeRevision,
      prior_runtime_hash AS priorRuntimeHash, result_runtime_hash AS resultRuntimeHash,
      protected_payload_hash AS protectedPayloadHash, created_at AS createdAt
      FROM campaign_play_runtime_events WHERE campaign_id = ? ORDER BY sequence`, campaignId),
    turnEvents: rows(sqlite, `SELECT event_id AS eventId, turn_id AS turnId, sequence,
      event_type AS eventType, payload_json AS payloadJson, sse_cursor AS sseCursor,
      created_at AS createdAt FROM campaign_play_turn_events
      WHERE campaign_id = ? ORDER BY turn_id, sequence`, campaignId),
    modelStages: rows(sqlite, `SELECT id, stage_id AS stageId, turn_id AS turnId,
      kind, attempt, status, worker_epoch AS workerEpoch,
      requested_provider_id AS requestedProviderId, requested_model AS requestedModel,
      requested_strategy AS requestedStrategy, actual_provider_id AS actualProviderId,
      actual_model AS actualModel, actual_strategy AS actualStrategy,
      schema_outcome AS schemaOutcome, artifact_json AS artifactJson,
      artifact_hash AS artifactHash,
      error_code AS errorCode, created_at AS createdAt, completed_at AS completedAt
      FROM campaign_play_model_stages WHERE campaign_id = ? ORDER BY stage_id`, campaignId),
  });
}

function selectPublicState(
  sqlite: Database.Database,
  campaignId: string,
  state: StateRow,
): CampaignPlayProjection<object> {
  const packetRow = sqlite.prepare(`
    SELECT packet_json AS packetJson FROM campaign_play_narrations
    WHERE campaign_id = ?
    ORDER BY CAST(json_extract(packet_json, '$.runtimeRevision') AS INTEGER) DESC,
      turn_id DESC, narration_id DESC LIMIT 1
  `).get(campaignId) as { packetJson: string } | undefined;
  const packet = packetRow
    ? campaignPlayNarratorPacketSchema.parse(
      JSON.parse(packetRow.packetJson) as unknown,
    )
    : null;
  const utilityActions = deriveCampaignPlayUtilityActions(
    packet,
    state.setupPhase === "ready" && activeTurn(sqlite, campaignId) === null,
  );
  const journalRows = sqlite.prepare(`
    SELECT observation_id AS observationId, world_time_minutes AS worldTimeMinutes,
      public_entry_json AS publicEntryJson
    FROM campaign_play_observations WHERE campaign_id = ?
    ORDER BY world_time_minutes, observation_id
  `).all(campaignId) as Array<{
    observationId: string;
    worldTimeMinutes: number;
    publicEntryJson: string;
  }>;
  const narrationOperation = sqlite.prepare(`
    SELECT operation.operation_id AS operationId, operation.result_id AS resultId,
      operation.turn_id AS turnId, operation.narration_id AS narrationId,
      operation.packet_hash AS packetHash, operation.receipt_ids_json AS receiptIdsJson,
      operation.concise_display_text AS conciseDisplayText,
      operation.concise_suggested_actions_json AS conciseSuggestedActionsJson,
      operation.status, operation.current_attempt AS currentAttempt,
      operation.current_attempt_id AS currentAttemptId,
      operation.created_at AS createdAt, operation.completed_at AS completedAt
    FROM campaign_play_narration_operations operation
    JOIN campaign_play_runtime_events event
      ON event.campaign_id = operation.campaign_id AND event.turn_id = operation.turn_id
      AND event.kind = 'turn_completed'
    WHERE operation.campaign_id = ?
    ORDER BY event.sequence DESC LIMIT 1
  `).get(campaignId) as Record<string, unknown> | undefined;
  const properScene = narrationOperation?.status === "complete"
    ? sqlite.prepare(`SELECT narration_id AS narrationId, turn_id AS turnId,
        display_text AS displayText, beats_json AS beatsJson,
        suggested_actions_json AS suggestedActionsJson, effects_json AS effectsJson,
        created_at AS createdAt
      FROM campaign_play_proper_scenes
      WHERE campaign_id = ? AND operation_id = ? AND turn_id = ?`).get(
        campaignId,
        narrationOperation.operationId,
        narrationOperation.turnId,
      ) as Record<string, unknown> | undefined
    : undefined;
  const legacyNarration = narrationOperation === undefined ? sqlite.prepare(`
    SELECT narration_id AS narrationId, turn_id AS turnId, display_text AS displayText,
      beats_json AS beatsJson, suggested_actions_json AS suggestedActionsJson,
      effects_json AS effectsJson, created_at AS createdAt
    FROM campaign_play_narrations
    WHERE campaign_id = ? AND status = 'complete'
    ORDER BY completed_at DESC, narration_id DESC LIMIT 1
  `).get(campaignId) as Record<string, unknown> | undefined : undefined;
  const narration = properScene ?? legacyNarration;
  const publicNarration = narration
    ? cleanUndefined({
      narrationId: narration.narrationId,
      turnId: narration.turnId,
      displayText: narration.displayText,
      beats: parseRecordArray(narration.beatsJson as string, "Narration beats"),
      suggestedActions: parseRecordArray(
        narration.suggestedActionsJson as string,
        "Narration suggested actions",
      ),
      effects: parseJson(narration.effectsJson as string, "Narration effects"),
      createdAt: narration.createdAt,
    })
    : null;
  const publicNarrationOperation = narrationOperation
    ? cleanUndefined({
      operationId: narrationOperation.operationId,
      resultId: narrationOperation.resultId,
      turnId: narrationOperation.turnId,
      narrationId: narrationOperation.narrationId,
      packetHash: narrationOperation.packetHash,
      receiptIds: parseJson(
        narrationOperation.receiptIdsJson as string,
        "Narration operation receipt ids",
      ),
      status: narrationOperation.status,
      attemptId: narrationOperation.currentAttemptId,
      attempt: narrationOperation.currentAttempt,
      conciseResult: {
        displayText: narrationOperation.conciseDisplayText,
        suggestedActions: parseRecordArray(
          narrationOperation.conciseSuggestedActionsJson as string,
          "Narration operation concise actions",
        ),
      },
      createdAt: narrationOperation.createdAt,
      completedAt: narrationOperation.completedAt,
    })
    : null;
  const possessions = sqlite.prepare(`
    SELECT p.possession_id AS possessionId, p.name AS name, p.quantity AS quantity
    FROM campaign_play_actor_possessions p
    JOIN actors a ON a.id = p.actor_id AND a.campaign_id = p.campaign_id
    WHERE p.campaign_id = ? AND a.controller = 'human' AND p.quantity > 0
    ORDER BY p.name, p.possession_id
  `).all(campaignId) as Array<{ possessionId: string; name: string; quantity: number }>;
  const obligations = sqlite.prepare(`
    SELECT obligation.obligation_id AS obligationId,
      obligation.debtor_actor_id AS debtorActorId,
      debtor.name AS debtorName, debtor.controller AS debtorController,
      obligation.creditor_actor_id AS creditorActorId,
      creditor.name AS creditorName, obligation.unit_key AS unitKey,
      obligation.outstanding_amount AS outstandingAmount
    FROM campaign_play_actor_obligations obligation
    JOIN actors debtor ON debtor.id = obligation.debtor_actor_id
      AND debtor.campaign_id = obligation.campaign_id
    JOIN actors creditor ON creditor.id = obligation.creditor_actor_id
      AND creditor.campaign_id = obligation.campaign_id
    WHERE obligation.campaign_id = ?
      AND (debtor.controller = 'human' OR creditor.controller = 'human')
      AND obligation.outstanding_amount > 0
    ORDER BY creditor.name, obligation.unit_key, obligation.obligation_id
  `).all(campaignId) as Array<{
    obligationId: string;
    debtorActorId: string;
    debtorName: string;
    debtorController: "human" | "agent";
    creditorActorId: string;
    creditorName: string;
    unitKey: "copper";
    outstandingAmount: number;
  }>;
  return projectCampaignPlayPublicState({
    campaignId,
    acceptedWorldVersion: state.acceptedWorldVersion,
    worldVersion: state.worldVersion,
    runtimeRevision: state.runtimeRevision,
    phase: state.setupPhase,
    worldTimeMinutes: state.worldTimeMinutes,
    currentLocation: packet?.currentLocation ?? null,
    visibleActors: packet?.visibleActors ?? [],
    visibleRoutes: packet?.visibleRoutes ?? [],
    visiblePressures: packet?.visiblePressures ?? [],
    possessions: possessions.map((possession) => ({
      handle: deriveCampaignPlayPublicHandle("possession", campaignId, possession.possessionId),
      name: possession.name,
      quantity: possession.quantity,
    })),
    obligations: obligations.map((obligation) => ({
      handle: deriveCampaignPlayPublicHandle("obligation", campaignId, obligation.obligationId),
      direction: obligation.debtorController === "human" ? "payable" as const : "receivable" as const,
      counterpartyHandle: deriveCampaignPlayPublicHandle(
        "actor",
        campaignId,
        obligation.debtorController === "human"
          ? obligation.creditorActorId
          : obligation.debtorActorId,
      ),
      counterpartyName: obligation.debtorController === "human"
        ? obligation.creditorName
        : obligation.debtorName,
      unitKey: obligation.unitKey,
      outstandingAmount: obligation.outstandingAmount,
    })),
    consequences: packet?.consequences ?? [],
    journal: journalRows.map((row) => ({
      observationId: row.observationId,
      worldTimeMinutes: row.worldTimeMinutes,
      entry: campaignPlayJournalEntrySchema.parse(JSON.parse(row.publicEntryJson) as unknown),
    })),
    narration: publicNarration,
    narrationOperation: publicNarrationOperation,
    utilityActions,
  });
}

function preStateRuntimeHash(campaignId: string): string {
  return hashCampaignPlayProjection({
    domain: "campaign_play_runtime_pre_state",
    campaignId,
  });
}

function validateRuntimeEvents(
  sqlite: Database.Database,
  campaignId: string,
  state: StateRow,
  eligibilityHash: string,
): RuntimeEventRow[] {
  const events = sqlite.prepare(`
    SELECT event_id AS eventId, sequence, turn_id AS turnId, kind,
      worker_epoch AS workerEpoch, world_version AS worldVersion,
      prior_runtime_revision AS priorRuntimeRevision,
      result_runtime_revision AS resultRuntimeRevision,
      prior_runtime_hash AS priorRuntimeHash, result_runtime_hash AS resultRuntimeHash,
      protected_payload_hash AS protectedPayloadHash, created_at AS createdAt
    FROM campaign_play_runtime_events WHERE campaign_id = ? ORDER BY sequence
  `).all(campaignId) as RuntimeEventRow[];
  if (events.length !== state.nextRuntimeEventSequence - 1 || events.length !== state.runtimeRevision) {
    throw corrupt("Campaign Play runtime event count does not match its authority cursors.");
  }
  let priorHash = preStateRuntimeHash(campaignId);
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const sequence = index + 1;
    if (
      event.sequence !== sequence ||
      event.priorRuntimeRevision !== sequence - 1 ||
      event.resultRuntimeRevision !== sequence ||
      event.priorRuntimeHash !== priorHash ||
      event.worldVersion > state.worldVersion
    ) {
      throw corrupt(`Campaign Play runtime event ${sequence} breaks the contiguous event chain.`);
    }
    priorHash = event.resultRuntimeHash;
  }
  const first = events[0];
  if (
    !first || first.kind !== "play_state_created" || first.turnId !== null ||
    first.workerEpoch !== null || first.protectedPayloadHash !== eligibilityHash
  ) {
    throw corrupt("Campaign Play runtime event 1 does not commit the accepted-world eligibility boundary.");
  }
  if (priorHash !== state.runtimeHash) {
    throw corrupt("Campaign Play runtime event chain does not end at the stored runtime hash.");
  }
  return events;
}

function authorityFieldsUnchanged(before: StateRow, after: StateRow): boolean {
  return before.campaignId === after.campaignId &&
    before.acceptedWorldVersion === after.acceptedWorldVersion &&
    before.acceptedContentHash === after.acceptedContentHash &&
    before.worldVersion === after.worldVersion && before.worldHash === after.worldHash &&
    before.runtimeRevision === after.runtimeRevision && before.runtimeHash === after.runtimeHash &&
    before.nextRuntimeEventSequence === after.nextRuntimeEventSequence &&
    before.createdAt === after.createdAt;
}

export function createCampaignPlayStateRepository(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayStateRepository {
  const { sqlite, campaignId } = handle;

  const load = (): LoadedCampaignPlayState | null => {
    const state = selectState(sqlite, campaignId);
    if (!state) return null;
    const review = loadAcceptedReview(handle);
    if (
      state.acceptedWorldVersion !== review.version ||
      state.acceptedContentHash !== review.contentHash ||
      state.worldVersion < state.acceptedWorldVersion
    ) {
      throw corrupt("Campaign Play state does not match its immutable accepted-world provenance.");
    }
    const eligibility = projectAcceptedTopologyEligibility(review);
    const mechanical = selectMechanicalProjection(sqlite, campaignId, state, review);
    const runtime = selectRuntimeProjection(sqlite, campaignId, state, eligibility);
    if (mechanical.hash !== state.worldHash) {
      throw corrupt("Campaign Play mechanical projection does not match its stored hash.");
    }
    if (runtime.hash !== state.runtimeHash) {
      throw corrupt("Campaign Play runtime projection does not match its stored hash.");
    }
    validateRuntimeEvents(sqlite, campaignId, state, eligibility.hash);
    return {
      authority: state,
      acceptedReview: review,
      eligibility,
      mechanical,
      runtime,
      protectedAudit: selectProtectedAudit(sqlite, campaignId, state),
      publicState: selectPublicState(sqlite, campaignId, state),
    };
  };

  const requireState = (): LoadedCampaignPlayState => {
    const state = load();
    if (!state) {
      throw new CampaignPlayStateRepositoryError(
        "play_state_missing",
        "Campaign Play state has not been created.",
      );
    }
    return state;
  };

  const commit = (
    mutationClass: MutationClass,
    input:
      | CampaignPlayMechanicalMutationInput
      | CampaignPlayRuntimeMutationInput
      | CampaignPlayMechanicalRuntimeMutationInput
      | CampaignPlayLedgerMutationInput,
  ): LoadedCampaignPlayState => {
    return sqlite.transaction(() => {
      const before = requireState();
      const prior = before.authority;
      const advancesMechanical = mutationClass === "mechanical" || mutationClass === "both";
      const advancesRuntime = mutationClass === "runtime" || mutationClass === "both";
      const worldVersionAdvance = advancesMechanical
        ? (input as CampaignPlayMechanicalMutationInput).worldVersionAdvance
        : 0;
      if (
        !Number.isSafeInteger(worldVersionAdvance) ||
        (advancesMechanical ? worldVersionAdvance < 1 : worldVersionAdvance !== 0)
      ) {
        throw new CampaignPlayStateRepositoryError(
          "play_transaction_class_mismatch",
          "Campaign Play mechanical transaction requires a positive logical version advance.",
        );
      }
      const targetWorldVersion = prior.worldVersion + worldVersionAdvance;
      const targetRuntimeRevision = prior.runtimeRevision + (advancesRuntime ? 1 : 0);
      const runtimeEventSequence = advancesRuntime ? prior.nextRuntimeEventSequence : null;
      const review = before.acceptedReview;
      const mechanicalHash = (): string => {
        const current = selectState(sqlite, campaignId);
        if (!current) {
          throw new CampaignPlayStateRepositoryError(
            "play_state_missing",
            "Campaign Play state disappeared during its transaction.",
          );
        }
        return selectMechanicalProjection(sqlite, campaignId, current, review).hash;
      };
      input.mutate({
        sqlite,
        campaignId,
        priorWorldVersion: prior.worldVersion,
        targetWorldVersion,
        priorRuntimeRevision: prior.runtimeRevision,
        targetRuntimeRevision,
        runtimeEventSequence,
        mechanicalHash,
      });
      const observed = selectState(sqlite, campaignId);
      if (!observed || !authorityFieldsUnchanged(prior, observed)) {
        throw new CampaignPlayStateRepositoryError(
          "play_transaction_class_mismatch",
          "Campaign Play transaction callback changed repository-owned authority fields.",
        );
      }
      const eligibility = projectAcceptedTopologyEligibility(review);
      const mechanical = selectMechanicalProjection(sqlite, campaignId, observed, review);
      const runtime = selectRuntimeProjection(
        sqlite,
        campaignId,
        observed,
        eligibility,
        prior.nextRuntimeEventSequence + (advancesRuntime ? 1 : 0),
      );
      const mechanicalChanged = mechanical.hash !== before.mechanical.hash;
      const runtimeChanged = runtime.hash !== before.runtime.hash;
      if (mechanicalChanged !== advancesMechanical || runtimeChanged !== advancesRuntime) {
        throw new CampaignPlayStateRepositoryError(
          "play_transaction_class_mismatch",
          `Campaign Play ${mutationClass} transaction changed an undeclared projection domain.`,
        );
      }

      if (advancesRuntime) {
        const runtimeInput = input as CampaignPlayRuntimeMutationInput;
        sqlite.prepare(`
          INSERT INTO campaign_play_runtime_events (
            event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
            world_version, prior_runtime_revision, result_runtime_revision,
            prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          runtimeInput.event.eventId,
          campaignId,
          runtimeEventSequence,
          runtimeInput.event.turnId,
          runtimeInput.event.kind,
          runtimeInput.event.workerEpoch,
          targetWorldVersion,
          prior.runtimeRevision,
          targetRuntimeRevision,
          prior.runtimeHash,
          runtime.hash,
          runtimeInput.event.protectedPayloadHash,
          runtimeInput.event.createdAt,
        );
      }
      sqlite.prepare(`
        UPDATE campaign_play_states SET
          world_version = ?, world_hash = ?, runtime_revision = ?, runtime_hash = ?,
          next_runtime_event_sequence = ?, updated_at = ?
        WHERE campaign_id = ?
      `).run(
        targetWorldVersion,
        mechanical.hash,
        targetRuntimeRevision,
        runtime.hash,
        prior.nextRuntimeEventSequence + (advancesRuntime ? 1 : 0),
        "updatedAt" in input ? input.updatedAt : input.event.createdAt,
        campaignId,
      );
      return requireState();
    }).immediate();
  };

  return {
    createState(input) {
      sqlite.transaction(() => {
        if (selectState(sqlite, campaignId)) {
          throw new CampaignPlayStateRepositoryError(
            "play_state_exists",
            "Campaign Play state already exists.",
          );
        }
        const review = loadAcceptedReview(handle);
        const eligibility = projectAcceptedTopologyEligibility(review);
        const provisional: StateRow = {
          campaignId,
          acceptedWorldVersion: review.version,
          acceptedContentHash: review.contentHash,
          worldVersion: review.version,
          worldHash: review.contentHash,
          runtimeRevision: 1,
          runtimeHash: "",
          nextRuntimeEventSequence: 2,
          worldTimeMinutes: null,
          setupPhase: "character_required",
          openedAt: null,
          createdAt: input.createdAt,
          updatedAt: input.createdAt,
        };
        const mechanical = selectMechanicalProjection(sqlite, campaignId, provisional, review);
        if (mechanical.hash !== review.contentHash) {
          throw corrupt("Accepted Campaign World rows do not match their canonical content hash.");
        }
        const runtime = selectRuntimeProjection(sqlite, campaignId, provisional, eligibility, 2);
        sqlite.prepare(`
          INSERT INTO campaign_play_states (
            campaign_id, accepted_world_version, accepted_content_hash,
            world_version, world_hash, runtime_revision, runtime_hash,
            next_runtime_event_sequence, world_time_minutes, setup_phase,
            opened_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, 2, NULL, 'character_required', NULL, ?, ?)
        `).run(
          campaignId,
          review.version,
          review.contentHash,
          review.version,
          review.contentHash,
          runtime.hash,
          input.createdAt,
          input.createdAt,
        );
        sqlite.prepare(`
          INSERT INTO campaign_play_runtime_events (
            event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
            world_version, prior_runtime_revision, result_runtime_revision,
            prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
          ) VALUES (?, ?, 1, NULL, 'play_state_created', NULL, ?, 0, 1, ?, ?, ?, ?)
        `).run(
          input.eventId,
          campaignId,
          review.version,
          preStateRuntimeHash(campaignId),
          runtime.hash,
          eligibility.hash,
          input.createdAt,
        );
      }).immediate();
      return requireState();
    },
    loadState: load,
    commitMechanical(input) {
      return commit("mechanical", input);
    },
    commitRuntime(input) {
      return commit("runtime", input);
    },
    commitMechanicalAndRuntime(input) {
      return commit("both", input);
    },
    commitLedger(input) {
      return commit("ledger", input);
    },
  };
}

export function loadCampaignPlayRulebookFrame(
  handle: CampaignPlayDatabaseHandle,
): CampaignPlayRulebookFrame {
  const state = createCampaignPlayStateRepository(handle).loadState();
  if (!state) {
    throw new CampaignPlayStateRepositoryError(
      "play_state_missing",
      "Campaign Play Rulebook frame requires durable state.",
    );
  }
  const sqlite = handle.sqlite;
  const campaignId = handle.campaignId;
  const human = sqlite.prepare(`SELECT a.id AS actorId, c.record_hash AS recordHash
    FROM actors a
    JOIN campaign_play_characters c
      ON c.actor_id = a.id AND c.campaign_id = a.campaign_id
    WHERE a.campaign_id = ? AND a.controller = 'human'`).get(
      campaignId,
    ) as CampaignPlayHumanMechanicalIdentity | undefined;
  const routeStates = sqlite.prepare(`SELECT route_id AS routeId, state
    FROM campaign_play_route_states WHERE campaign_id = ? ORDER BY route_id`).all(
      campaignId,
    ) as CampaignPlayLiveRouteState[];
  const actorConditions = (sqlite.prepare(`SELECT actor_id AS actorId,
      condition, present, summary FROM campaign_play_actor_conditions
    WHERE campaign_id = ? ORDER BY actor_id, condition`).all(campaignId) as Array<
      Omit<CampaignPlayLiveActorCondition, "present"> & { present: number }
    >).map((row) => ({ ...row, present: row.present === 1 }));
  const pressureStates = sqlite.prepare(`SELECT pressure_id AS pressureId,
      progress, status, last_advanced_world_time_minutes AS lastAdvancedWorldTimeMinutes
    FROM campaign_play_pressure_states WHERE campaign_id = ? ORDER BY pressure_id`).all(
      campaignId,
    ) as CampaignPlayLivePressureState[];
  const placements = sqlite.prepare(`SELECT id AS placementId, actor_id AS actorId,
      location_id AS locationId, placement_kind AS placementKind
    FROM actor_placements WHERE campaign_id = ? ORDER BY id`).all(
      campaignId,
    ) as CampaignPlayLivePlacement[];
  const relations = sqlite.prepare(`SELECT id AS relationId,
      source_actor_id AS sourceActorId, target_actor_id AS targetActorId,
      relation_type AS relationType, intensity, summary
    FROM actor_relations WHERE campaign_id = ? ORDER BY id`).all(
      campaignId,
    ) as CampaignPlayLiveRelation[];
  const goals = sqlite.prepare(`SELECT id AS goalId, actor_id AS actorId,
      status, priority, objective, motivation
    FROM actor_goals WHERE campaign_id = ? ORDER BY id`).all(
      campaignId,
    ) as CampaignPlayLiveGoal[];
  const possessions = sqlite.prepare(`SELECT possession_id AS possessionId,
      actor_id AS actorId, possession_key AS possessionKey, name, quantity
    FROM campaign_play_actor_possessions
    WHERE campaign_id = ? ORDER BY actor_id, possession_key, possession_id`).all(
      campaignId,
    ) as CampaignPlayLiveActorPossession[];
  const obligations = sqlite.prepare(`SELECT obligation_id AS obligationId,
      debtor_actor_id AS debtorActorId, creditor_actor_id AS creditorActorId,
      unit_key AS unitKey, principal_amount AS principalAmount,
      outstanding_amount AS outstandingAmount
    FROM campaign_play_actor_obligations
    WHERE campaign_id = ?
    ORDER BY debtor_actor_id, creditor_actor_id, unit_key, obligation_id`).all(
      campaignId,
    ) as CampaignPlayLiveActorObligation[];
  const { runtimeLocations, runtimeRoutes } = selectRuntimeTopology(sqlite, campaignId);
  const runtimeActors = selectRuntimeActors(sqlite, campaignId);
  return {
    campaignId,
    acceptedWorldVersion: state.authority.acceptedWorldVersion,
    acceptedContentHash: state.authority.acceptedContentHash,
    setupPhase: state.authority.setupPhase,
    worldVersion: state.authority.worldVersion,
    worldTimeMinutes: state.authority.worldTimeMinutes,
    human: human ?? null,
    acceptedWorld: state.acceptedReview,
    runtimeActors,
    runtimeLocations,
    runtimeRoutes,
    routeStates,
    actorConditions,
    pressureStates,
    placements,
    relations,
    goals,
    possessions,
    obligations,
  };
}
