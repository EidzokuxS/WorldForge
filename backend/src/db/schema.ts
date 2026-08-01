import {
  type AnySQLiteColumn,
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const turnSagaStatusValues = [
  "created",
  "collecting_context",
  "pre_turn_catchup",
  "gm_reading",
  "oracle_adjudicating",
  "tool_loop_running",
  "local_reaction_running",
  "world_consequence_running",
  "resolved_pending_narration",
  "narrator_rendering",
  "narrator_repairing",
  "finalized",
  "failed_state_corruption",
] as const;

export const narratorAttemptStatusValues = [
  "started",
  "failed",
  "succeeded",
] as const;

export const turnSagaEventTypeValues = [
  "authority_stage_committed",
  "settled_packet_prepared",
  "settled_packet_persisted",
] as const;

export const turnClockLedgerReasonValues = [
  "zero_time_status",
  "wait",
  "watch",
  "rest",
  "work",
  "other_elapsed_time",
  "travel",
  "tool_time_effect",
  "due_world_elapsed",
  "replay_restore",
] as const;

export const simulationProposalDispositionValues = [
  "pending",
  "committed",
  "rejected_invalid",
  "expired_stale_version",
  "deferred_not_due",
  "superseded_by_new_event",
  "needs_rebase",
  "needs_actor_retry",
  "execution_abandoned",
] as const;

export const simulationProposalExpiryPolicyValues = [
  "reject_when_expired",
  "ignore_expiry",
] as const;

export const actorWakeSignalTypeValues = [
  "due_time",
  "direct_observation",
  "report",
  "rumor",
  "urgency",
  "exposed_scope_catch_up",
  "deadline",
  "agency_debt",
  "inbox",
] as const;

export const actorWakeSignalStatusValues = [
  "pending",
  "consumed",
  "expired",
] as const;

export const campaignWorldStatusValues = ["review", "accepted"] as const;

export const campaignWorldBuildStatusValues = [
  "running",
  "completed",
  "failed",
] as const;

export const campaignWorldBuildStageValues = [
  "world_frame",
  "world_cast",
  "world_connections",
  "validation",
  "persistence",
] as const;

export const campaignWorldModelStageValues = [
  "world_frame",
  "world_cast",
  "world_connections",
] as const;

export const campaignWorldBuildEventTypeValues = [
  "build_started",
  "stage_started",
  "stage_completed",
  "build_completed",
  "build_failed",
] as const;

export const worldActorKindValues = ["person"] as const;
export const worldActorControllerValues = ["human", "agent"] as const;
export const worldActorRoleValues = [
  "key",
  "support",
  "background",
  "player",
] as const;
export const actorGoalHorizonValues = ["immediate", "ongoing"] as const;
export const actorGoalStatusValues = ["active"] as const;
export const actorRelationTypeValues = [
  "alliance",
  "rivalry",
  "authority",
  "dependency",
  "kinship",
  "association",
  "hostility",
] as const;
export const actorPlacementKindValues = [
  "present",
  "home",
] as const;

export const campaignPlaySetupPhaseValues = [
  "character_required",
  "opening_required",
  "ready",
] as const;

export const campaignPlayCharacterSourceValues = [
  "created",
  "generated",
  "character_card",
  "research",
] as const;

export const campaignPlayTurnKindValues = ["opening", "player_action"] as const;

export const campaignPlayTurnStageValues = [
  "admitted",
  "judged",
  "planned",
  "primary_settled",
  "actors_settled",
  "visibility_projected",
  "interrupted",
  "completed",
  "failed",
] as const;

export const campaignPlayInterruptibleTurnStageValues = [
  "admitted",
  "judged",
  "planned",
  "primary_settled",
  "actors_settled",
  "visibility_projected",
] as const;

export const campaignPlayRuntimeEventKindValues = [
  "play_state_created",
  "character_created",
  "turn_admitted",
  "worker_claimed",
  "worker_lease_renewed",
  "stage_accepted",
  "primary_settled",
  "actor_job_transitioned",
  "visibility_projected",
  "turn_interrupted",
  "turn_resumed",
  "turn_completed",
  "turn_failed",
] as const;

export const campaignPlayTurnEventTypeValues = [
  "turn.accepted",
  "turn.progressed",
  "turn.interrupted",
  "turn.completed",
  "turn.failed",
] as const;

export const campaignPlayModelStageKindValues = [
  "judge",
  "game_master",
  "opening_planner",
  "actor_replanner",
  "narrator",
] as const;

export const campaignPlayModelStageStatusValues = [
  "started",
  "accepted",
  "interrupted",
  "failed",
] as const;

export const campaignPlayModelSchemaOutcomeValues = [
  "pending",
  "valid",
  "invalid",
  "transport_error",
] as const;

export const campaignPlayInternalErrorCodeValues = [
  "invalid_input",
  "worker_lease_lost",
  "stale_artifact",
  "model_contract_invalid",
  "rulebook_denied",
  "persistence_failed",
  "provider_unavailable",
  "narration_invalid",
] as const;

export const campaignPlayNarrationStatusValues = [
  "pending",
  "complete",
  "invalid",
] as const;

export const campaignPlayNarrationOperationStatusValues = [
  "pending",
  "running",
  "failed",
  "complete",
] as const;

export const campaignPlayNarrationAttemptStatusValues = [
  "running",
  "failed",
  "accepted",
  "stale",
] as const;

export const campaignPlayCommandKindValues = [
  "advance_world_time",
  "move_actor",
  "set_route_state",
  "set_actor_condition",
  "update_actor_relation",
  "update_actor_goal",
  "advance_pressure",
  "adjust_actor_possession",
  "incur_actor_obligation",
  "pay_actor_obligation",
  "record_world_event",
  "create_player_actor",
  "initialize_player_placement",
  "initialize_world_time",
  "initialize_pressure_state",
] as const;

export const campaignPlayWorldEventKindValues = [
  "player_actor_created",
  "player_placement_initialized",
  "world_time_initialized",
  "pressure_initialized",
  "world_time_advanced",
  "actor_moved",
  "route_state_changed",
  "actor_condition_changed",
  "actor_relation_changed",
  "actor_goal_changed",
  "pressure_advanced",
  "actor_possession_adjusted",
  "actor_obligation_incurred",
  "actor_obligation_payment_applied",
  "scene_recorded",
] as const;

export const campaignPlayExposureChannelValues = [
  "direct_perception",
  "local_aftermath",
  "route_state",
  "witness_report",
] as const;

export const campaignPlayRouteStateValues = [
  "open",
  "restricted",
  "blocked",
] as const;

export const campaignPlayActorConditionValues = [
  "occupied",
  "strained",
  "incapacitated",
] as const;

export const campaignPlayPressureStatusValues = [
  "active",
  "resolved",
] as const;

export const campaignPlayActorPlanStatusValues = [
  "active",
  "completed",
  "blocked",
] as const;

export const campaignPlayActorJobStageValues = [
  "queued",
  "claimed",
  "interrupted",
  "proposed",
  "settled",
  "rejected",
  "deferred",
] as const;

export const campaignPlayTurnTerminalReasonValues = [
  "opening_completed",
  "action_resolved",
  "action_impossible",
  "clarification_requested",
  "terminal_failure",
] as const;

export const campaignPlayActorJobDueReasonValues = [
  "scheduled",
  "agency_debt",
  "plan_retry",
] as const;

export const campaignPlayActorJobDeferReasonValues = [
  "incapacitated",
  "actor_capacity",
  "replan_capacity",
  "replan_invalid",
] as const;

export const campaignPlayProposalStatusValues = [
  "pending",
  "accepted",
  "rejected",
] as const;

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  premise: text("premise").notNull(),
  createdAt: integer("created_at", { mode: "number" }).notNull(),
  updatedAt: integer("updated_at", { mode: "number" }).notNull(),
});

export const locations = sqliteTable(
  "locations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    kind: text("kind", {
      enum: ["macro", "persistent_sublocation", "ephemeral_scene"],
    })
      .notNull()
      .default("macro"),
    // Hierarchical containment for macro -> sublocation relationships.
    parentLocationId: text("parent_location_id").references(
      (): AnySQLiteColumn => locations.id,
      { onDelete: "set null" }
    ),
    // Spillover anchor for ephemeral scenes whose consequences persist nearby.
    anchorLocationId: text("anchor_location_id").references(
      (): AnySQLiteColumn => locations.id,
      { onDelete: "set null" }
    ),
    persistence: text("persistence", { enum: ["persistent", "ephemeral"] })
      .notNull()
      .default("persistent"),
    expiresAtTick: integer("expires_at_tick"),
    archivedAtTick: integer("archived_at_tick"),
    tags: text("tags").notNull().default("[]"),
    isStarting: integer("is_starting", { mode: "boolean" })
      .notNull()
      .default(false),
    // Compatibility projection during the Phase 43 reader migration.
    connectedTo: text("connected_to").notNull().default("[]"),
    definitionAuthority: text("definition_authority", {
      enum: ["accepted_world", "campaign_play"],
    }).notNull().default("accepted_world"),
    causalReceiptId: text("causal_receipt_id"),
    worldVersion: integer("world_version"),
  },
  (table) => [
    index("idx_locations_campaign").on(table.campaignId),
    index("idx_locations_campaign_kind").on(table.campaignId, table.kind),
    index("idx_locations_campaign_definition_authority")
      .on(table.campaignId, table.definitionAuthority),
    index("idx_locations_campaign_receipt")
      .on(table.campaignId, table.causalReceiptId),
    index("idx_locations_parent_location").on(table.parentLocationId),
    index("idx_locations_anchor_location").on(table.anchorLocationId),
  ]
);

export const locationEdges = sqliteTable(
  "location_edges",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    fromLocationId: text("from_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    toLocationId: text("to_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    travelCost: integer("travel_cost").notNull().default(1),
    discovered: integer("discovered", { mode: "boolean" })
      .notNull()
      .default(true),
    definitionAuthority: text("definition_authority", {
      enum: ["accepted_world", "campaign_play"],
    }).notNull().default("accepted_world"),
    causalReceiptId: text("causal_receipt_id"),
    worldVersion: integer("world_version"),
  },
  (table) => [
    index("idx_location_edges_campaign").on(table.campaignId),
    index("idx_location_edges_from").on(table.campaignId, table.fromLocationId),
    index("idx_location_edges_to").on(table.campaignId, table.toLocationId),
    index("idx_location_edges_campaign_definition_authority")
      .on(table.campaignId, table.definitionAuthority),
    index("idx_location_edges_campaign_receipt")
      .on(table.campaignId, table.causalReceiptId),
    uniqueIndex("location_edges_campaign_from_to_unique").on(
      table.campaignId,
      table.fromLocationId,
      table.toLocationId
    ),
  ]
);

export const campaignWorlds = sqliteTable(
  "campaign_worlds",
  {
    campaignId: text("campaign_id")
      .primaryKey()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    status: text("status", { enum: campaignWorldStatusValues }).notNull(),
    worldVersion: integer("world_version").notNull(),
    contentHash: text("content_hash").notNull(),
    sourceDigest: text("source_digest").notNull(),
    sourceSnapshotJson: text("source_snapshot_json").notNull(),
    worldSummary: text("world_summary").notNull(),
    builtAt: integer("built_at", { mode: "number" }).notNull(),
    acceptedAt: integer("accepted_at", { mode: "number" }),
    acceptedSnapshotJson: text("accepted_snapshot_json"),
    acceptedWorldVersion: integer("accepted_world_version"),
    acceptedContentHash: text("accepted_content_hash"),
  },
  (table) => [
    check("campaign_worlds_version_positive", sql`${table.worldVersion} >= 1`),
    check(
      "campaign_worlds_acceptance_consistent",
      sql`(
        ${table.status} = 'review'
        AND ${table.acceptedAt} IS NULL
        AND ${table.acceptedSnapshotJson} IS NULL
        AND ${table.acceptedWorldVersion} IS NULL
        AND ${table.acceptedContentHash} IS NULL
      ) OR (
        ${table.status} = 'accepted'
        AND ${table.acceptedAt} IS NOT NULL
        AND ${table.acceptedSnapshotJson} IS NOT NULL
        AND length(${table.acceptedSnapshotJson}) > 0
        AND ${table.acceptedWorldVersion} = ${table.worldVersion}
        AND ${table.acceptedWorldVersion} >= 1
        AND ${table.acceptedContentHash} = ${table.contentHash}
        AND length(${table.acceptedContentHash}) = 64
      )`,
    ),
  ],
);

export const campaignWorldBuilds = sqliteTable(
  "campaign_world_builds",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    status: text("status", { enum: campaignWorldBuildStatusValues })
      .notNull()
      .default("running"),
    stage: text("stage", { enum: campaignWorldBuildStageValues })
      .notNull()
      .default("world_frame"),
    sourceDigest: text("source_digest").notNull(),
    sourceSnapshotJson: text("source_snapshot_json").notNull(),
    providerId: text("provider_id").notNull(),
    model: text("model").notNull(),
    errorCode: text("error_code"),
    startedAt: integer("started_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_world_builds_running_unique")
      .on(table.campaignId)
      .where(sql`${table.status} = 'running'`),
    index("idx_campaign_world_builds_campaign_status").on(
      table.campaignId,
      table.status,
    ),
    index("idx_campaign_world_builds_campaign_started").on(
      table.campaignId,
      table.startedAt,
    ),
  ],
);

export const campaignWorldBuildEvents = sqliteTable(
  "campaign_world_build_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    buildId: text("build_id")
      .notNull()
      .references(() => campaignWorldBuilds.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type", {
      enum: campaignWorldBuildEventTypeValues,
    }).notNull(),
    stage: text("stage", { enum: campaignWorldBuildStageValues }),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("campaign_world_build_events_sequence_positive", sql`${table.sequence} > 0`),
    uniqueIndex("campaign_world_build_events_build_sequence_unique").on(
      table.buildId,
      table.sequence,
    ),
    index("idx_campaign_world_build_events_campaign").on(table.campaignId),
    index("idx_campaign_world_build_events_build").on(table.buildId),
  ],
);

export const campaignWorldBuildStages = sqliteTable(
  "campaign_world_build_stages",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    buildId: text("build_id")
      .notNull()
      .references(() => campaignWorldBuilds.id, { onDelete: "cascade" }),
    stage: text("stage", { enum: campaignWorldModelStageValues }).notNull(),
    requestedMode: text("requested_mode").notNull(),
    primaryStrategy: text("primary_strategy").notNull(),
    actualStrategy: text("actual_strategy"),
    totalAttempts: integer("total_attempts").notNull(),
    repairUsed: integer("repair_used", { mode: "boolean" })
      .notNull()
      .default(false),
    retryUsed: integer("retry_used", { mode: "boolean" })
      .notNull()
      .default(false),
    textFallbackUsed: integer("text_fallback_used", { mode: "boolean" })
      .notNull()
      .default(false),
    responseModel: text("response_model"),
    finishReason: text("finish_reason"),
    errorCode: text("error_code"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("campaign_world_build_stages_attempts_positive", sql`${table.totalAttempts} > 0`),
    check(
      "campaign_world_build_stages_strategy_flags_boolean",
      sql`${table.repairUsed} IN (0, 1) AND ${table.retryUsed} IN (0, 1) AND ${table.textFallbackUsed} IN (0, 1)`,
    ),
    uniqueIndex("campaign_world_build_stages_build_stage_unique").on(
      table.buildId,
      table.stage,
    ),
    index("idx_campaign_world_build_stages_campaign").on(table.campaignId),
    index("idx_campaign_world_build_stages_build").on(table.buildId),
  ],
);

export const actors = sqliteTable(
  "actors",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: worldActorKindValues }).notNull(),
    controller: text("controller", {
      enum: worldActorControllerValues,
    }).notNull(),
    role: text("role", { enum: worldActorRoleValues }).notNull(),
    name: text("name").notNull(),
    summary: text("summary").notNull(),
    traits: text("traits").notNull().default("[]"),
    tags: text("tags").notNull().default("[]"),
    definitionAuthority: text("definition_authority", {
      enum: ["accepted_world", "campaign_play"],
    }).notNull().default("accepted_world"),
    causalReceiptId: text("causal_receipt_id"),
    worldVersion: integer("world_version"),
  },
  (table) => [
    // Migration-owned SQLite triggers guard the controller/kind/role tuple
    // without rebuilding this referenced table.
    index("idx_actors_campaign").on(table.campaignId),
    index("idx_actors_campaign_kind_role").on(
      table.campaignId,
      table.kind,
      table.role,
    ),
    index("idx_actors_campaign_definition_authority").on(
      table.campaignId,
      table.definitionAuthority,
    ),
    index("idx_actors_campaign_receipt").on(
      table.campaignId,
      table.causalReceiptId,
    ),
    uniqueIndex("actors_campaign_human_unique")
      .on(table.campaignId)
      .where(sql`${table.controller} = 'human'`),
  ],
);

export const actorGoals = sqliteTable(
  "actor_goals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    objective: text("objective").notNull(),
    motivation: text("motivation").notNull(),
    horizon: text("horizon", { enum: actorGoalHorizonValues }).notNull(),
    priority: integer("priority").notNull(),
    status: text("status", { enum: actorGoalStatusValues })
      .notNull()
      .default("active"),
  },
  (table) => [
    check("actor_goals_priority_range", sql`${table.priority} BETWEEN 1 AND 5`),
    index("idx_actor_goals_campaign").on(table.campaignId),
    index("idx_actor_goals_actor").on(table.actorId),
  ],
);

export const actorRelations = sqliteTable(
  "actor_relations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sourceActorId: text("source_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    targetActorId: text("target_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    relationType: text("relation_type", {
      enum: actorRelationTypeValues,
    }).notNull(),
    summary: text("summary").notNull(),
    intensity: integer("intensity").notNull(),
  },
  (table) => [
    check("actor_relations_distinct_endpoints", sql`${table.sourceActorId} <> ${table.targetActorId}`),
    check("actor_relations_intensity_range", sql`${table.intensity} BETWEEN 1 AND 5`),
    index("idx_actor_relations_campaign").on(table.campaignId),
    index("idx_actor_relations_source").on(table.sourceActorId),
    index("idx_actor_relations_target").on(table.targetActorId),
  ],
);

export const actorPlacements = sqliteTable(
  "actor_placements",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    placementKind: text("placement_kind", {
      enum: actorPlacementKindValues,
    }).notNull(),
  },
  (table) => [
    uniqueIndex("actor_placements_actor_location_kind_unique").on(
      table.actorId,
      table.locationId,
      table.placementKind,
    ),
    uniqueIndex("actor_placements_actor_present_unique")
      .on(table.actorId)
      .where(sql`${table.placementKind} = 'present'`),
    index("idx_actor_placements_campaign").on(table.campaignId),
    index("idx_actor_placements_actor").on(table.actorId),
    index("idx_actor_placements_location").on(table.locationId),
  ],
);

export const worldPressures = sqliteTable(
  "world_pressures",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    trajectory: text("trajectory").notNull(),
    urgency: integer("urgency").notNull(),
  },
  (table) => [
    check("world_pressures_urgency_range", sql`${table.urgency} BETWEEN 1 AND 5`),
    index("idx_world_pressures_campaign").on(table.campaignId),
  ],
);

export const worldPressureActors = sqliteTable(
  "world_pressure_actors",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    pressureId: text("pressure_id")
      .notNull()
      .references(() => worldPressures.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("world_pressure_actors_pressure_actor_unique").on(
      table.pressureId,
      table.actorId,
    ),
    index("idx_world_pressure_actors_campaign").on(table.campaignId),
    index("idx_world_pressure_actors_actor").on(table.actorId),
  ],
);

export const worldPressureLocations = sqliteTable(
  "world_pressure_locations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    pressureId: text("pressure_id")
      .notNull()
      .references(() => worldPressures.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
  },
  (table) => [
    uniqueIndex("world_pressure_locations_pressure_location_unique").on(
      table.pressureId,
      table.locationId,
    ),
    index("idx_world_pressure_locations_campaign").on(table.campaignId),
    index("idx_world_pressure_locations_location").on(table.locationId),
  ],
);

export const locationRecentEvents = sqliteTable(
  "location_recent_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    locationId: text("location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    sourceLocationId: text("source_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    anchorLocationId: text("anchor_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    sourceEventId: text("source_event_id"),
    threadId: text("thread_id"),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    surfaceRoute: text("surface_route"),
    visibility: text("visibility", {
      enum: ["player_perceivable", "local_signal", "report_only", "hidden"],
    }).notNull().default("player_perceivable"),
    knowledgeRoute: text("knowledge_route"),
    hiddenCauseTerms: text("hidden_cause_terms").notNull().default("[]"),
    tick: integer("tick").notNull(),
    importance: integer("importance").notNull().default(1),
    archivedAtTick: integer("archived_at_tick"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_location_recent_events_campaign").on(table.campaignId),
    index("idx_location_recent_events_location_tick").on(
      table.campaignId,
      table.locationId,
      table.tick
    ),
    index("idx_location_recent_events_source_location_tick").on(
      table.campaignId,
      table.sourceLocationId,
      table.tick
    ),
    index("idx_location_recent_events_source_event").on(table.sourceEventId),
    index("idx_location_recent_events_thread").on(table.threadId),
  ]
);

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    race: text("race").notNull().default(""),
    gender: text("gender").notNull().default(""),
    age: text("age").notNull().default(""),
    appearance: text("appearance").notNull().default(""),
    hp: integer("hp").notNull().default(5),
    characterRecord: text("character_record").notNull().default("{}"),
    derivedTags: text("derived_tags").notNull().default("[]"),
    tags: text("tags").notNull().default("[]"),
    equippedItems: text("equipped_items").notNull().default("[]"),
    currentLocationId: text("current_location_id").references(() => locations.id),
    currentSceneLocationId: text("current_scene_location_id").references(() => locations.id),
  },
  (table) => [
    check("players_hp_range_check", sql`${table.hp} >= 0 AND ${table.hp} <= 5`),
    index("idx_players_campaign").on(table.campaignId),
  ]
);

export const npcs = sqliteTable(
  "npcs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    persona: text("persona").notNull(),
    characterRecord: text("character_record").notNull().default("{}"),
    derivedTags: text("derived_tags").notNull().default("[]"),
    tags: text("tags").notNull().default("[]"),
    tier: text("tier", {
      enum: ["temporary", "persistent", "key"],
    }).notNull(),
    currentLocationId: text("current_location_id").references(() => locations.id),
    currentSceneLocationId: text("current_scene_location_id").references(() => locations.id),
    goals: text("goals").notNull().default('{"short_term":[],"long_term":[]}'),
    beliefs: text("beliefs").notNull().default("[]"),
    unprocessedImportance: integer("unprocessed_importance").notNull().default(0),
    inactiveTicks: integer("inactive_ticks").notNull().default(0),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [index("idx_npcs_campaign").on(table.campaignId)]
);

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tags: text("tags").notNull().default("[]"),
    ownerId: text("owner_id"),
    locationId: text("location_id").references(() => locations.id),
    equipState: text("equip_state", {
      enum: ["carried", "equipped"],
    }).notNull().default("carried"),
    equippedSlot: text("equipped_slot"),
    isSignature: integer("is_signature", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [index("idx_items_campaign").on(table.campaignId)]
);

export const factions = sqliteTable(
  "factions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tags: text("tags").notNull().default("[]"),
    goals: text("goals").notNull().default("[]"),
    assets: text("assets").notNull().default("[]"),
  },
  (table) => [index("idx_factions_campaign").on(table.campaignId)]
);

export const factionCommandNodes = sqliteTable(
  "faction_command_nodes",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    factionId: text("faction_id")
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    locationId: text("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    authorityActorId: text("authority_actor_id").references(() => npcs.id, {
      onDelete: "set null",
    }),
    status: text("status", {
      enum: ["active", "paused", "disabled"],
    }).notNull().default("active"),
    standingOrders: text("standing_orders").notNull().default("[]"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_faction_command_nodes_campaign").on(table.campaignId),
    index("idx_faction_command_nodes_faction").on(table.campaignId, table.factionId),
    uniqueIndex("faction_command_nodes_default_unique").on(
      table.campaignId,
      table.factionId,
      table.label,
    ),
  ]
);

export const factionResources = sqliteTable(
  "faction_resources",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    factionId: text("faction_id")
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    resourceKey: text("resource_key").notNull(),
    label: text("label").notNull(),
    quantity: integer("quantity").notNull().default(0),
    reservedQuantity: integer("reserved_quantity").notNull().default(0),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_faction_resources_campaign").on(table.campaignId),
    uniqueIndex("faction_resources_key_unique").on(
      table.campaignId,
      table.factionId,
      table.resourceKey,
    ),
  ]
);

export const factionReports = sqliteTable(
  "faction_reports",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    factionId: text("faction_id")
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    commandNodeId: text("command_node_id")
      .notNull()
      .references(() => factionCommandNodes.id, { onDelete: "cascade" }),
    sourceActorId: text("source_actor_id").references(() => npcs.id, {
      onDelete: "set null",
    }),
    sourceLocationId: text("source_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    route: text("route", {
      enum: ["direct_observation", "report_message", "rumor", "public_record"],
    }).notNull(),
    status: text("status", {
      enum: ["in_transit", "available", "consumed", "invalidated"],
    }).notNull().default("available"),
    summary: text("summary").notNull(),
    sourceEventIds: text("source_event_ids").notNull().default("[]"),
    sourceKnowledgeIds: text("source_knowledge_ids").notNull().default("[]"),
    hiddenCauseTerms: text("hidden_cause_terms").notNull().default("[]"),
    baseWorldVersion: integer("base_world_version").notNull(),
    createdWorldTimeMinutes: integer("created_world_time_minutes").notNull(),
    deliverAtWorldTimeMinutes: integer("deliver_at_world_time_minutes").notNull(),
    deliveredWorldTimeMinutes: integer("delivered_world_time_minutes"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_faction_reports_campaign_node_status").on(
      table.campaignId,
      table.commandNodeId,
      table.status,
    ),
    index("idx_faction_reports_delivery").on(
      table.campaignId,
      table.deliverAtWorldTimeMinutes,
    ),
    index("idx_faction_reports_base_version").on(table.campaignId, table.baseWorldVersion),
  ]
);

export const factionOperations = sqliteTable(
  "faction_operations",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    factionId: text("faction_id")
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    commandNodeId: text("command_node_id")
      .notNull()
      .references(() => factionCommandNodes.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["proposed", "committed", "blocked", "canceled"],
    }).notNull().default("proposed"),
    operationKind: text("operation_kind").notNull(),
    summary: text("summary").notNull(),
    requiredReportIds: text("required_report_ids").notNull().default("[]"),
    resourceCosts: text("resource_costs").notNull().default("{}"),
    targetLocationId: text("target_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    baseWorldVersion: integer("base_world_version").notNull(),
    committedWorldVersion: integer("committed_world_version"),
    authorityTraceId: text("authority_trace_id"),
    blockedReason: text("blocked_reason"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_faction_operations_campaign_status").on(table.campaignId, table.status),
    index("idx_faction_operations_command_node").on(table.campaignId, table.commandNodeId),
    index("idx_faction_operations_base_version").on(table.campaignId, table.baseWorldVersion),
  ]
);

export const factionResourceLedger = sqliteTable(
  "faction_resource_ledger",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    factionId: text("faction_id")
      .notNull()
      .references(() => factions.id, { onDelete: "cascade" }),
    operationId: text("operation_id").references(() => factionOperations.id, {
      onDelete: "set null",
    }),
    resourceKey: text("resource_key").notNull(),
    delta: integer("delta").notNull(),
    reason: text("reason").notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version"),
    createdWorldTimeMinutes: integer("created_world_time_minutes").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_faction_resource_ledger_campaign").on(table.campaignId),
    index("idx_faction_resource_ledger_operation").on(table.operationId),
  ]
);

export const worldThreads = sqliteTable(
  "world_threads",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: text("status", {
      enum: ["active", "paused", "resolved", "canceled", "invalidated"],
    }).notNull().default("active"),
    stage: text("stage").notNull(),
    visibility: text("visibility", {
      enum: ["hidden", "signal_only", "public"],
    }).notNull().default("signal_only"),
    pressure: integer("pressure").notNull().default(0),
    hiddenCause: text("hidden_cause"),
    hiddenCauseTerms: text("hidden_cause_terms").notNull().default("[]"),
    involvedActorIds: text("involved_actor_ids").notNull().default("[]"),
    involvedFactionIds: text("involved_faction_ids").notNull().default("[]"),
    sourceEventIds: text("source_event_ids").notNull().default("[]"),
    sourceAuthorityTraceIds: text("source_authority_trace_ids").notNull().default("[]"),
    surfaceRoutes: text("surface_routes").notNull().default("[]"),
    currentLocationId: text("current_location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    nextDueWorldTimeMinutes: integer("next_due_world_time_minutes"),
    baseWorldVersion: integer("base_world_version").notNull(),
    lastAdvancedWorldVersion: integer("last_advanced_world_version").notNull(),
    createdWorldTimeMinutes: integer("created_world_time_minutes").notNull(),
    updatedWorldTimeMinutes: integer("updated_world_time_minutes").notNull(),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_world_threads_campaign_status").on(table.campaignId, table.status),
    index("idx_world_threads_due").on(table.campaignId, table.nextDueWorldTimeMinutes),
    index("idx_world_threads_location").on(table.campaignId, table.currentLocationId),
    index("idx_world_threads_base_version").on(table.campaignId, table.baseWorldVersion),
  ]
);

export const worldThreadEvents = sqliteTable(
  "world_thread_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    threadId: text("thread_id")
      .notNull()
      .references(() => worldThreads.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
    visibility: text("visibility", {
      enum: ["hidden", "signal_only", "public"],
    }).notNull().default("signal_only"),
    surfaceRoute: text("surface_route"),
    locationId: text("location_id").references(() => locations.id, {
      onDelete: "set null",
    }),
    sourceEventIds: text("source_event_ids").notNull().default("[]"),
    sourceAuthorityTraceIds: text("source_authority_trace_ids").notNull().default("[]"),
    worldVersion: integer("world_version").notNull(),
    worldTimeMinutes: integer("world_time_minutes").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_world_thread_events_thread").on(table.threadId),
    index("idx_world_thread_events_campaign_time").on(
      table.campaignId,
      table.worldTimeMinutes,
    ),
  ]
);

export const relationships = sqliteTable(
  "relationships",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    entityA: text("entity_a").notNull(),
    entityB: text("entity_b").notNull(),
    tags: text("tags").notNull().default("[]"),
    reason: text("reason"),
  },
  (table) => [
    index("idx_relationships_campaign").on(table.campaignId),
    uniqueIndex("relationships_campaign_entity_unique").on(
      table.campaignId,
      table.entityA,
      table.entityB
    ),
  ]
);

export const chronicle = sqliteTable(
  "chronicle",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    tick: integer("tick").notNull(),
    text: text("text").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_chronicle_campaign").on(table.campaignId),
    index("idx_chronicle_tick").on(table.tick),
  ]
);

export const quickActionOffers = sqliteTable(
  "quick_action_offers",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    offerId: text("offer_id").notNull(),
    actionId: text("action_id").notNull(),
    capability: text("capability").notNull(),
    label: text("label").notNull(),
    action: text("action").notNull(),
    sourceRefsJson: text("source_refs_json").notNull().default("[]"),
    sourceEvidenceDigest: text("source_evidence_digest").notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    worldTimeMinutes: integer("world_time_minutes").notNull(),
    createdTick: integer("created_tick").notNull(),
    expiresAtTick: integer("expires_at_tick").notNull(),
    consumedAt: integer("consumed_at", { mode: "number" }),
    consumedTick: integer("consumed_tick"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("quick_action_offers_capability_unique").on(table.capability),
    uniqueIndex("quick_action_offers_campaign_offer_action_unique").on(
      table.campaignId,
      table.offerId,
      table.actionId,
    ),
    index("idx_quick_action_offers_campaign_offer").on(
      table.campaignId,
      table.offerId,
    ),
    index("idx_quick_action_offers_campaign_expiry").on(
      table.campaignId,
      table.expiresAtTick,
    ),
    check("quick_action_offers_base_version_non_negative", sql`${table.baseWorldVersion} >= 0`),
    check("quick_action_offers_world_time_non_negative", sql`${table.worldTimeMinutes} >= 0`),
    check("quick_action_offers_created_tick_non_negative", sql`${table.createdTick} >= 0`),
    check("quick_action_offers_expires_at_tick_non_negative", sql`${table.expiresAtTick} >= 0`),
  ]
);

export const worldClocks = sqliteTable(
  "world_clocks",
  {
    campaignId: text("campaign_id")
      .primaryKey()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    worldVersion: integer("world_version").notNull().default(0),
    worldTimeMinutes: integer("world_time_minutes").notNull().default(0),
    currentTick: integer("current_tick").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("world_clocks_version_non_negative", sql`${table.worldVersion} >= 0`),
    check("world_clocks_time_non_negative", sql`${table.worldTimeMinutes} >= 0`),
  ]
);

export const turnClockLedger = sqliteTable(
  "turn_clock_ledger",
  {
    clockReceiptId: text("clock_receipt_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    uiTurnOrdinal: integer("ui_turn_ordinal").notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    deltaMinutes: integer("delta_minutes").notNull().default(0),
    reasonKind: text("reason_kind", { enum: turnClockLedgerReasonValues }).notNull(),
    sourceReceiptRef: text("source_receipt_ref"),
    resultWorldTimeMinutes: integer("result_world_time_minutes").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("turn_clock_ledger_campaign_source_unique").on(
      table.campaignId,
      table.sourceReceiptRef,
    ),
    index("idx_turn_clock_ledger_campaign_turn").on(
      table.campaignId,
      table.turnId,
      table.uiTurnOrdinal,
    ),
    index("idx_turn_clock_ledger_campaign_version").on(
      table.campaignId,
      table.resultWorldVersion,
    ),
    check("turn_clock_ledger_ui_turn_non_negative", sql`${table.uiTurnOrdinal} >= 0`),
    check("turn_clock_ledger_base_version_non_negative", sql`${table.baseWorldVersion} >= 0`),
    check("turn_clock_ledger_result_version_non_negative", sql`${table.resultWorldVersion} >= 0`),
    check("turn_clock_ledger_delta_non_negative", sql`${table.deltaMinutes} >= 0`),
    check("turn_clock_ledger_time_non_negative", sql`${table.resultWorldTimeMinutes} >= 0`),
  ],
);

export const simulationJobs = sqliteTable(
  "simulation_jobs",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    jobType: text("job_type").notNull(),
    status: text("status", {
      enum: ["queued", "running", "completed", "failed", "canceled", "superseded"],
    }).notNull().default("queued"),
    priority: integer("priority").notNull().default(0),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version"),
    idempotencyKey: text("idempotency_key"),
    scheduledWorldTimeMinutes: integer("scheduled_world_time_minutes").notNull(),
    createdWorldTimeMinutes: integer("created_world_time_minutes").notNull(),
    sourceEntityType: text("source_entity_type").notNull(),
    sourceEntityId: text("source_entity_id"),
    payload: text("payload").notNull().default("{}"),
    canceledReason: text("canceled_reason"),
    supersededByJobId: text("superseded_by_job_id"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_simulation_jobs_campaign_status").on(table.campaignId, table.status),
    index("idx_simulation_jobs_schedule").on(
      table.campaignId,
      table.scheduledWorldTimeMinutes,
    ),
    index("idx_simulation_jobs_base_version").on(table.campaignId, table.baseWorldVersion),
    uniqueIndex("simulation_jobs_campaign_idempotency_unique").on(
      table.campaignId,
      table.idempotencyKey,
    ),
  ]
);

export const simulationProposals = sqliteTable(
  "simulation_proposals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    jobId: text("job_id").references(() => simulationJobs.id, { onDelete: "set null" }),
    proposalType: text("proposal_type").notNull(),
    idempotencyKey: text("idempotency_key"),
    status: text("status", {
      enum: ["pending", "executing", "committed", "rejected", "canceled", "superseded"],
    }).notNull().default("pending"),
    proposalDisposition: text("proposal_disposition", {
      enum: simulationProposalDispositionValues,
    }).notNull().default("pending"),
    dispositionReason: text("disposition_reason"),
    baseWorldVersion: integer("base_world_version").notNull(),
    proposedWorldVersion: integer("proposed_world_version"),
    committedWorldVersion: integer("committed_world_version"),
    dueAtWorldTimeMinutes: integer("due_at_world_time_minutes"),
    expiryPolicy: text("expiry_policy", {
      enum: simulationProposalExpiryPolicyValues,
    }).notNull().default("reject_when_expired"),
    priority: integer("priority").notNull().default(0),
    intendedTools: text("intended_tools").notNull().default("[]"),
    supersededByProposalId: text("superseded_by_proposal_id"),
    lifecycleMetadata: text("lifecycle_metadata").notNull().default("{}"),
    sourceEntityType: text("source_entity_type").notNull(),
    sourceEntityId: text("source_entity_id"),
    payload: text("payload").notNull().default("{}"),
    toolResultId: text("tool_result_id"),
    rejectionReason: text("rejection_reason"),
    createdWorldTimeMinutes: integer("created_world_time_minutes").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_simulation_proposals_campaign_status").on(table.campaignId, table.status),
    index("idx_simulation_proposals_job").on(table.jobId),
    index("idx_simulation_proposals_base_version").on(
      table.campaignId,
      table.baseWorldVersion,
    ),
    index("idx_simulation_proposals_disposition").on(
      table.campaignId,
      table.proposalDisposition,
    ),
    index("idx_simulation_proposals_due_priority").on(
      table.campaignId,
      table.dueAtWorldTimeMinutes,
      table.priority,
    ),
    uniqueIndex("simulation_proposals_campaign_idempotency_unique").on(
      table.campaignId,
      table.idempotencyKey,
    ),
  ]
);

export const actorProcessStates = sqliteTable(
  "actor_process_states",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    status: text("status", {
      enum: ["dormant", "queued", "running", "waiting", "disabled"],
    }).notNull().default("dormant"),
    lastWorldVersion: integer("last_world_version").notNull().default(0),
    lastWakeWorldTimeMinutes: integer("last_wake_world_time_minutes"),
    nextWakeWorldTimeMinutes: integer("next_wake_world_time_minutes"),
    memoryCursor: text("memory_cursor"),
    processState: text("process_state").notNull().default("{}"),
    disabledReason: text("disabled_reason"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("actor_process_states_actor_unique").on(
      table.campaignId,
      table.actorType,
      table.actorId,
    ),
    index("idx_actor_process_states_wake").on(
      table.campaignId,
      table.nextWakeWorldTimeMinutes,
    ),
  ]
);

export const actorWakeSignals = sqliteTable(
  "actor_wake_signals",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    actorId: text("actor_id").notNull(),
    signalType: text("signal_type", {
      enum: actorWakeSignalTypeValues,
    }).notNull(),
    sourceType: text("source_type").notNull(),
    sourceId: text("source_id"),
    summary: text("summary").notNull(),
    priority: integer("priority").notNull().default(0),
    requiredBeforeDone: integer("required_before_done", { mode: "boolean" })
      .notNull()
      .default(false),
    dueWorldTimeMinutes: integer("due_world_time_minutes"),
    status: text("status", {
      enum: actorWakeSignalStatusValues,
    }).notNull().default("pending"),
    payload: text("payload").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_actor_wake_signals_campaign_status_due").on(
      table.campaignId,
      table.status,
      table.dueWorldTimeMinutes,
      table.priority,
    ),
    index("idx_actor_wake_signals_actor").on(
      table.campaignId,
      table.actorType,
      table.actorId,
      table.status,
    ),
    index("idx_actor_wake_signals_source").on(
      table.campaignId,
      table.sourceType,
      table.sourceId,
      table.signalType,
    ),
  ],
);

export const actorKnowledgeRecords = sqliteTable(
  "actor_knowledge_records",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull(),
    route: text("route", {
      enum: [
        "direct_observation",
        "report_message",
        "rumor",
        "belief",
        "memory",
        "public_record",
        "claim",
      ],
    }).notNull(),
    truthStatus: text("truth_status", {
      enum: ["observed", "reported", "rumored", "believed", "claimed", "verified", "disputed"],
    }).notNull().default("claimed"),
    statement: text("statement").notNull(),
    subjectRefs: text("subject_refs").notNull().default("[]"),
    sourceEventIds: text("source_event_ids").notNull().default("[]"),
    sourceKnowledgeIds: text("source_knowledge_ids").notNull().default("[]"),
    authorityTraceIds: text("authority_trace_ids").notNull().default("[]"),
    sourceActorId: text("source_actor_id"),
    recipientActorIds: text("recipient_actor_ids").notNull().default("[]"),
    confidence: integer("confidence").notNull().default(70),
    reliability: integer("reliability").notNull().default(70),
    privacy: text("privacy", {
      enum: ["private", "shared", "public"],
    }).notNull().default("private"),
    baseWorldVersion: integer("base_world_version").notNull(),
    validFromWorldVersion: integer("valid_from_world_version").notNull(),
    observedAtWorldVersion: integer("observed_at_world_version"),
    invalidatedAtWorldVersion: integer("invalidated_at_world_version"),
    createdWorldTimeMinutes: integer("created_world_time_minutes").notNull(),
    deliveredWorldTimeMinutes: integer("delivered_world_time_minutes"),
    expiresWorldTimeMinutes: integer("expires_world_time_minutes"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_actor_knowledge_campaign_actor_route").on(
      table.campaignId,
      table.actorId,
      table.route,
    ),
    index("idx_actor_knowledge_campaign_validity").on(
      table.campaignId,
      table.validFromWorldVersion,
      table.invalidatedAtWorldVersion,
    ),
    index("idx_actor_knowledge_source_actor").on(
      table.campaignId,
      table.sourceActorId,
    ),
  ]
);

export const authorityTraces = sqliteTable(
  "authority_traces",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    operation: text("operation").notNull(),
    sourceEntityType: text("source_entity_type").notNull(),
    sourceEntityId: text("source_entity_id"),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    worldTimeMinutes: integer("world_time_minutes").notNull(),
    elapsedWorldTimeMinutes: integer("elapsed_world_time_minutes").notNull().default(0),
    toolResultId: text("tool_result_id"),
    eventIds: text("event_ids").notNull().default("[]"),
    stateDeltaRefs: text("state_delta_refs").notNull().default("[]"),
    witnesses: text("witnesses").notNull().default("[]"),
    metadata: text("metadata").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("authority_traces_campaign_version_unique").on(
      table.campaignId,
      table.resultWorldVersion,
    ),
    uniqueIndex("authority_traces_campaign_tool_result_unique").on(
      table.campaignId,
      table.toolResultId,
    ),
    index("idx_authority_traces_campaign_version").on(
      table.campaignId,
      table.resultWorldVersion,
    ),
    index("idx_authority_traces_tool_result").on(table.toolResultId),
  ]
);

export const turnSagas = sqliteTable(
  "turn_sagas",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    playerId: text("player_id"),
    actionId: text("action_id"),
    actionText: text("action_text"),
    sourceActionJson: text("source_action_json").notNull().default("{}"),
    status: text("status", { enum: turnSagaStatusValues })
      .notNull()
      .default("created"),
    statusReason: text("status_reason"),
    statusUpdatedAt: integer("status_updated_at", { mode: "number" }).notNull(),
    activeLockToken: text("active_lock_token"),
    activeWorkerId: text("active_worker_id"),
    activeStartedAt: integer("active_started_at", { mode: "number" }),
    requiresNarration: integer("requires_narration", { mode: "boolean" })
      .notNull()
      .default(true),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version"),
    oracleDecisionId: text("oracle_decision_id"),
    settledTurnPacketId: text("settled_turn_packet_id"),
    latestNarratorAttemptId: text("latest_narrator_attempt_id"),
    provenanceJson: text("provenance_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("turn_sagas_campaign_turn_unique").on(table.campaignId, table.turnId),
    index("idx_turn_sagas_campaign_status").on(table.campaignId, table.status),
    index("idx_turn_sagas_pending_narration").on(
      table.campaignId,
      table.requiresNarration,
      table.status,
    ),
    index("idx_turn_sagas_base_version").on(table.campaignId, table.baseWorldVersion),
  ]
);

export const turnSagaEvents = sqliteTable(
  "turn_saga_events",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sagaId: text("saga_id")
      .notNull()
      .references(() => turnSagas.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    eventType: text("event_type", { enum: turnSagaEventTypeValues }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    baseWorldVersion: integer("base_world_version"),
    resultWorldVersion: integer("result_world_version"),
    settledTurnPacketId: text("settled_turn_packet_id"),
    payloadJson: text("payload_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("turn_saga_events_saga_type_key_unique").on(
      table.sagaId,
      table.eventType,
      table.idempotencyKey,
    ),
    index("idx_turn_saga_events_campaign_turn_type").on(
      table.campaignId,
      table.turnId,
      table.eventType,
    ),
    index("idx_turn_saga_events_packet").on(table.settledTurnPacketId),
  ]
);

export const oracleDecisions = sqliteTable(
  "oracle_decisions",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sagaId: text("saga_id")
      .notNull()
      .references(() => turnSagas.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    question: text("question").notNull(),
    stakes: text("stakes").notNull(),
    outcome: text("outcome").notNull(),
    reasoning: text("reasoning").notNull().default(""),
    mechanicalImplicationsJson: text("mechanical_implications_json")
      .notNull()
      .default("[]"),
    visibilityImplicationsJson: text("visibility_implications_json")
      .notNull()
      .default("[]"),
    confidence: integer("confidence"),
    chance: integer("chance"),
    requiresToolCommit: integer("requires_tool_commit", { mode: "boolean" })
      .notNull()
      .default(false),
    baseWorldVersion: integer("base_world_version").notNull(),
    acceptedWorldVersion: integer("accepted_world_version"),
    sourceRefs: text("source_refs").notNull().default("[]"),
    decisionJson: text("decision_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_oracle_decisions_campaign_turn").on(table.campaignId, table.turnId),
    index("idx_oracle_decisions_saga").on(table.sagaId),
    index("idx_oracle_decisions_base_version").on(
      table.campaignId,
      table.baseWorldVersion,
    ),
  ]
);

export const settledTurnPackets = sqliteTable(
  "settled_turn_packets",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sagaId: text("saga_id")
      .notNull()
      .references(() => turnSagas.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    oracleDecisionId: text("oracle_decision_id").references(
      () => oracleDecisions.id,
      { onDelete: "set null" },
    ),
    canonicalTurnPacketJson: text("canonical_turn_packet_json")
      .notNull()
      .default("{}"),
    narratorPacketJson: text("narrator_packet_json").notNull().default("{}"),
    sourceRefs: text("source_refs").notNull().default("[]"),
    acceptedToolResultRefs: text("accepted_tool_result_refs")
      .notNull()
      .default("[]"),
    acceptedActorResultRefs: text("accepted_actor_result_refs")
      .notNull()
      .default("[]"),
    acceptedDurableEventIds: text("accepted_durable_event_ids")
      .notNull()
      .default("[]"),
    producedDurableEventIds: text("produced_durable_event_ids")
      .notNull()
      .default("[]"),
    dueWorldRefs: text("due_world_refs").notNull().default("[]"),
    requiresNarration: integer("requires_narration", { mode: "boolean" })
      .notNull()
      .default(true),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("settled_turn_packets_saga_unique").on(table.sagaId),
    index("idx_settled_turn_packets_campaign_turn").on(table.campaignId, table.turnId),
    index("idx_settled_turn_packets_oracle").on(table.oracleDecisionId),
    index("idx_settled_turn_packets_result_version").on(
      table.campaignId,
      table.resultWorldVersion,
    ),
  ]
);

export const narratorAttempts = sqliteTable(
  "narrator_attempts",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    sagaId: text("saga_id")
      .notNull()
      .references(() => turnSagas.id, { onDelete: "cascade" }),
    settledTurnPacketId: text("settled_turn_packet_id")
      .notNull()
      .references(() => settledTurnPackets.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    attemptIndex: integer("attempt_index").notNull(),
    status: text("status", { enum: narratorAttemptStatusValues })
      .notNull()
      .default("started"),
    groundingResultJson: text("grounding_result_json").notNull().default("{}"),
    finalText: text("final_text"),
    failureReason: text("failure_reason"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("narrator_attempts_saga_attempt_unique").on(
      table.sagaId,
      table.attemptIndex,
    ),
    index("idx_narrator_attempts_packet").on(table.settledTurnPacketId),
    index("idx_narrator_attempts_campaign_turn").on(table.campaignId, table.turnId),
    index("idx_narrator_attempts_campaign_status").on(
      table.campaignId,
      table.status,
    ),
  ]
);

export const cleanGameplayTurnRecords = sqliteTable(
  "clean_gameplay_turn_records",
  {
    recordId: text("record_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    internalTurnId: text("internal_turn_id").notNull(),
    publicTurnId: text("public_turn_id").notNull(),
    publicPacketId: text("public_packet_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    frameId: text("frame_id").notNull(),
    userMessageIndex: integer("user_message_index").notNull(),
    assistantMessageIndex: integer("assistant_message_index").notNull(),
    userMessageSha256: text("user_message_sha256").notNull(),
    assistantMessageSha256: text("assistant_message_sha256").notNull(),
    recordJson: text("record_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("clean_gameplay_turn_records_campaign_turn_unique")
      .on(table.campaignId, table.internalTurnId),
    uniqueIndex("clean_gameplay_turn_records_campaign_idempotency_unique")
      .on(table.campaignId, table.idempotencyKey),
    index("idx_clean_gameplay_turn_records_campaign_public")
      .on(table.campaignId, table.publicTurnId, table.publicPacketId),
  ],
);

export const cleanGameplayStage4Receipts = sqliteTable(
  "clean_gameplay_stage4_receipts",
  {
    receiptId: text("receipt_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull(),
    frameId: text("frame_id").notNull(),
    checklistId: text("checklist_id").notNull(),
    stepId: text("step_id").notNull(),
    capabilityId: text("capability_id").notNull(),
    status: text("status", { enum: ["accepted", "skipped", "failed"] }).notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    mutationApplied: integer("mutation_applied", { mode: "boolean" }).notNull(),
    receiptJson: text("receipt_json").notNull().default("{}"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("clean_gameplay_stage4_receipts_campaign_step_unique")
      .on(table.campaignId, table.turnId, table.checklistId, table.stepId),
    index("idx_clean_gameplay_stage4_receipts_campaign_turn")
      .on(table.campaignId, table.turnId),
    index("idx_clean_gameplay_stage4_receipts_campaign_result_version")
      .on(table.campaignId, table.resultWorldVersion),
  ],
);

export const cleanGameplayActorConditions = sqliteTable(
  "clean_gameplay_actor_conditions",
  {
    conditionId: text("condition_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorType: text("actor_type").notNull(),
    playerId: text("player_id")
      .notNull()
      .references(() => players.id, { onDelete: "cascade" }),
    conditionKey: text("condition_key").notNull(),
    conditionLabel: text("condition_label").notNull(),
    conditionGroup: text("condition_group").notNull(),
    conditionScope: text("condition_scope").notNull(),
    anchorLocationId: text("anchor_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    anchorSceneLocationId: text("anchor_scene_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    targetKind: text("target_kind").notNull(),
    targetRef: text("target_ref"),
    targetLabel: text("target_label"),
    active: integer("active", { mode: "boolean" }).notNull(),
    appliedReceiptId: text("applied_receipt_id"),
    clearedReceiptId: text("cleared_receipt_id"),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("clean_actor_conditions_player_only", sql`${table.actorType} = 'player'`),
    check("clean_actor_conditions_current_scene_only", sql`${table.conditionScope} = 'current_scene'`),
    check("clean_actor_conditions_active_bool", sql`${table.active} IN (0, 1)`),
    index("idx_clean_actor_conditions_campaign_player_active")
      .on(table.campaignId, table.playerId, table.active),
    index("idx_clean_actor_conditions_campaign_scene_active")
      .on(table.campaignId, table.anchorSceneLocationId, table.active),
    uniqueIndex("clean_actor_conditions_active_key_unique")
      .on(
        table.campaignId,
        table.playerId,
        table.conditionKey,
        table.conditionScope,
        table.anchorSceneLocationId,
      )
      .where(sql`${table.active} = 1`),
  ],
);

export const cleanGameplayMinorPois = sqliteTable(
  "clean_gameplay_minor_pois",
  {
    poiId: text("poi_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    poiRef: text("poi_ref").notNull(),
    poiLabel: text("poi_label").notNull(),
    poiKind: text("poi_kind").notNull(),
    anchorLocationId: text("anchor_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    anchorSceneLocationId: text("anchor_scene_location_id")
      .notNull()
      .references(() => locations.id, { onDelete: "cascade" }),
    active: integer("active", { mode: "boolean" }).notNull(),
    appliedReceiptId: text("applied_receipt_id"),
    baseWorldVersion: integer("base_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check("clean_minor_pois_active_bool", sql`${table.active} IN (0, 1)`),
    index("idx_clean_minor_pois_campaign_scene_active")
      .on(table.campaignId, table.anchorSceneLocationId, table.active),
    uniqueIndex("clean_minor_pois_active_ref_unique")
      .on(table.campaignId, table.anchorSceneLocationId, table.poiRef)
      .where(sql`${table.active} = 1`),
  ],
);

export const campaignPlayStates = sqliteTable(
  "campaign_play_states",
  {
    campaignId: text("campaign_id")
      .primaryKey()
      .references(() => campaignWorlds.campaignId, { onDelete: "cascade" }),
    acceptedWorldVersion: integer("accepted_world_version").notNull(),
    acceptedContentHash: text("accepted_content_hash").notNull(),
    worldVersion: integer("world_version").notNull(),
    worldHash: text("world_hash").notNull(),
    runtimeRevision: integer("runtime_revision").notNull(),
    runtimeHash: text("runtime_hash").notNull(),
    nextRuntimeEventSequence: integer("next_runtime_event_sequence")
      .notNull()
      .default(1),
    worldTimeMinutes: integer("world_time_minutes"),
    setupPhase: text("setup_phase", {
      enum: campaignPlaySetupPhaseValues,
    }).notNull(),
    openedAt: integer("opened_at", { mode: "number" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    check(
      "campaign_play_states_setup_phase_valid",
      sql`${table.setupPhase} IN ('character_required', 'opening_required', 'ready')`,
    ),
    check(
      "campaign_play_states_versions_valid",
      sql`${table.acceptedWorldVersion} >= 1
        AND ${table.worldVersion} >= ${table.acceptedWorldVersion}
        AND ${table.runtimeRevision} >= 1`,
    ),
    check(
      "campaign_play_states_hashes_valid",
      sql`length(${table.acceptedContentHash}) = 64
        AND length(${table.worldHash}) = 64
        AND length(${table.runtimeHash}) = 64`,
    ),
    check(
      "campaign_play_states_sequences_valid",
      sql`${table.nextRuntimeEventSequence} > 0`,
    ),
    check(
      "campaign_play_states_world_time_valid",
      sql`${table.worldTimeMinutes} IS NULL OR ${table.worldTimeMinutes} BETWEEN 0 AND 2147483647`,
    ),
    check(
      "campaign_play_states_opening_consistent",
      sql`(
          ${table.setupPhase} = 'ready'
          AND ${table.worldTimeMinutes} IS NOT NULL
          AND ${table.openedAt} IS NOT NULL
        ) OR (
          ${table.setupPhase} <> 'ready'
          AND ${table.openedAt} IS NULL
        )`,
    ),
  ],
);

export const campaignPlayCharacters = sqliteTable(
  "campaign_play_characters",
  {
    actorId: text("actor_id")
      .primaryKey()
      .references(() => actors.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    recordJson: text("record_json").notNull(),
    recordHash: text("record_hash").notNull(),
    sourceKind: text("source_kind", {
      enum: campaignPlayCharacterSourceValues,
    }).notNull(),
    sourceDigest: text("source_digest").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_characters_campaign_unique").on(table.campaignId),
    check(
      "campaign_play_characters_source_kind_valid",
      sql`${table.sourceKind} IN ('created', 'generated', 'character_card', 'research')`,
    ),
    check(
      "campaign_play_characters_record_valid",
      sql`json_valid(${table.recordJson}) AND json_type(${table.recordJson}) = 'object'`,
    ),
    check(
      "campaign_play_characters_hashes_valid",
      sql`length(${table.recordHash}) = 64 AND length(${table.sourceDigest}) = 64`,
    ),
  ],
);

export const campaignPlayTurns = sqliteTable(
  "campaign_play_turns",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnKind: text("turn_kind", { enum: campaignPlayTurnKindValues }).notNull(),
    supersedesTurnId: text("supersedes_turn_id").references(
      (): AnySQLiteColumn => campaignPlayTurns.id,
      { onDelete: "restrict" },
    ),
    inputJson: text("input_json").notNull(),
    inputHash: text("input_hash").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    expectedWorldVersion: integer("expected_world_version").notNull(),
    expectedRuntimeRevision: integer("expected_runtime_revision").notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    finalWorldVersion: integer("final_world_version"),
    stage: text("stage", { enum: campaignPlayTurnStageValues })
      .notNull()
      .default("admitted"),
    frameHash: text("frame_hash").notNull(),
    nextEventSequence: integer("next_event_sequence").notNull().default(1),
    workerLeaseOwner: text("worker_lease_owner"),
    workerEpoch: integer("worker_epoch").notNull().default(0),
    workerLeaseExpiresAt: integer("worker_lease_expires_at", { mode: "number" }),
    modelSelectionJson: text("model_selection_json").notNull(),
    publicPacketHash: text("public_packet_hash"),
    interruptedStage: text("interrupted_stage", {
      enum: campaignPlayInterruptibleTurnStageValues,
    }),
    errorCode: text("error_code", {
      enum: campaignPlayInternalErrorCodeValues,
    }),
    resumeEligible: integer("resume_eligible", { mode: "boolean" })
      .notNull()
      .default(false),
    mutationAuditJson: text("mutation_audit_json").notNull().default("{}"),
    submittedAt: integer("submitted_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_turns_campaign_idempotency_unique").on(
      table.campaignId,
      table.idempotencyKey,
    ),
    uniqueIndex("campaign_play_turns_campaign_active_unique")
      .on(table.campaignId)
      .where(sql`${table.stage} NOT IN ('completed', 'failed')`),
    uniqueIndex("campaign_play_turns_campaign_opening_unique")
      .on(table.campaignId)
      .where(sql`${table.turnKind} = 'opening'
        AND (
          ${table.stage} <> 'failed'
          OR ${table.finalWorldVersion} <> ${table.baseWorldVersion}
        )`),
    uniqueIndex("campaign_play_turns_superseded_unique")
      .on(table.supersedesTurnId)
      .where(sql`${table.supersedesTurnId} IS NOT NULL`),
    index("idx_campaign_play_turns_campaign_stage").on(
      table.campaignId,
      table.stage,
    ),
    index("idx_campaign_play_turns_campaign_kind_submitted").on(
      table.campaignId,
      table.turnKind,
      table.submittedAt,
    ),
    check(
      "campaign_play_turns_enums_valid",
      sql`${table.turnKind} IN ('opening', 'player_action')
        AND ${table.stage} IN (
          'admitted',
          'judged',
          'planned',
          'primary_settled',
          'actors_settled',
          'visibility_projected',
          'interrupted',
          'completed',
          'failed'
        )
        AND (
          ${table.interruptedStage} IS NULL
          OR ${table.interruptedStage} IN (
            'admitted',
            'judged',
            'planned',
            'primary_settled',
            'actors_settled',
            'visibility_projected'
          )
        )
        AND (
          ${table.errorCode} IS NULL
          OR ${table.errorCode} IN (
            'invalid_input',
            'worker_lease_lost',
            'stale_artifact',
            'model_contract_invalid',
            'stage_budget_exceeded',
            'stage_timeout',
            'rulebook_denied',
            'persistence_failed',
            'provider_unavailable',
            'narration_invalid'
          )
        )`,
    ),
    check(
      "campaign_play_turns_input_valid",
      sql`json_valid(${table.inputJson})
        AND json_valid(${table.modelSelectionJson})
        AND json_valid(${table.mutationAuditJson})
        AND length(${table.inputHash}) = 64
        AND length(${table.frameHash}) = 64
        AND length(${table.idempotencyKey}) BETWEEN 1 AND 128`,
    ),
    check(
      "campaign_play_turns_versions_valid",
      sql`${table.expectedWorldVersion} >= 1
        AND ${table.expectedRuntimeRevision} >= 1
        AND ${table.baseWorldVersion} = ${table.expectedWorldVersion}
        AND (
          ${table.finalWorldVersion} IS NULL
          OR ${table.finalWorldVersion} >= ${table.baseWorldVersion}
        )`,
    ),
    check(
      "campaign_play_turns_sequence_epoch_valid",
      sql`${table.nextEventSequence} > 0 AND ${table.workerEpoch} >= 0`,
    ),
    check(
      "campaign_play_turns_lease_consistent",
      sql`(
          ${table.workerLeaseOwner} IS NULL
          AND ${table.workerLeaseExpiresAt} IS NULL
        ) OR (
          ${table.workerLeaseOwner} IS NOT NULL
          AND length(${table.workerLeaseOwner}) > 0
          AND ${table.workerLeaseExpiresAt} IS NOT NULL
          AND ${table.workerEpoch} > 0
        )`,
    ),
    check(
      "campaign_play_turns_packet_hash_valid",
      sql`${table.publicPacketHash} IS NULL OR length(${table.publicPacketHash}) = 64`,
    ),
    check(
      "campaign_play_turns_supersession_kind",
      sql`${table.supersedesTurnId} IS NULL OR ${table.turnKind} = 'opening'`,
    ),
    check(
      "campaign_play_turns_terminal_consistent",
      sql`(
          ${table.stage} = 'interrupted'
          AND ${table.interruptedStage} IS NOT NULL
          AND ${table.errorCode} IS NOT NULL
          AND ${table.resumeEligible} = 1
          AND ${table.completedAt} IS NULL
          AND ${table.workerLeaseOwner} IS NULL
        ) OR (
          ${table.stage} = 'completed'
          AND ${table.finalWorldVersion} IS NOT NULL
          AND ${table.publicPacketHash} IS NOT NULL
          AND ${table.interruptedStage} IS NULL
          AND ${table.errorCode} IS NULL
          AND ${table.resumeEligible} = 0
          AND ${table.completedAt} IS NOT NULL
          AND ${table.workerLeaseOwner} IS NULL
        ) OR (
          ${table.stage} = 'failed'
          AND ${table.finalWorldVersion} IS NOT NULL
          AND ${table.interruptedStage} IS NULL
          AND ${table.errorCode} IS NOT NULL
          AND ${table.resumeEligible} = 0
          AND ${table.completedAt} IS NOT NULL
          AND ${table.workerLeaseOwner} IS NULL
        ) OR (
          ${table.stage} NOT IN ('interrupted', 'completed', 'failed')
          AND ${table.interruptedStage} IS NULL
          AND ${table.errorCode} IS NULL
          AND ${table.resumeEligible} = 0
          AND ${table.completedAt} IS NULL
        )`,
    ),
    check(
      "campaign_play_turns_visibility_packet_present",
      sql`${table.stage} <> 'visibility_projected' OR ${table.publicPacketHash} IS NOT NULL`,
    ),
  ],
);

export const campaignPlayTurnResults = sqliteTable(
  "campaign_play_turn_results",
  {
    turnId: text("turn_id").primaryKey()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    terminalReason: text("terminal_reason", {
      enum: campaignPlayTurnTerminalReasonValues,
    }).notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_campaign_play_turn_results_campaign_reason").on(
      table.campaignId,
      table.terminalReason,
    ),
    check(
      "campaign_play_turn_results_reason_valid",
      sql`${table.terminalReason} IN (
        'opening_completed',
        'action_resolved',
        'action_impossible',
        'clarification_requested',
        'terminal_failure'
      )`,
    ),
  ],
);

export const campaignPlayRuntimeEvents = sqliteTable(
  "campaign_play_runtime_events",
  {
    eventId: text("event_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    turnId: text("turn_id").references(() => campaignPlayTurns.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: campaignPlayRuntimeEventKindValues }).notNull(),
    workerEpoch: integer("worker_epoch"),
    worldVersion: integer("world_version").notNull(),
    priorRuntimeRevision: integer("prior_runtime_revision").notNull(),
    resultRuntimeRevision: integer("result_runtime_revision").notNull(),
    priorRuntimeHash: text("prior_runtime_hash").notNull(),
    resultRuntimeHash: text("result_runtime_hash").notNull(),
    protectedPayloadHash: text("protected_payload_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_runtime_events_campaign_sequence_unique").on(
      table.campaignId,
      table.sequence,
    ),
    uniqueIndex("campaign_play_runtime_events_campaign_revision_unique").on(
      table.campaignId,
      table.resultRuntimeRevision,
    ),
    index("idx_campaign_play_runtime_events_campaign_turn_sequence").on(
      table.campaignId,
      table.turnId,
      table.sequence,
    ),
    check(
      "campaign_play_runtime_events_kind_valid",
      sql`${table.kind} IN (
        'play_state_created',
        'character_created',
        'turn_admitted',
        'worker_claimed',
        'worker_lease_renewed',
        'stage_accepted',
        'primary_settled',
        'actor_job_transitioned',
        'visibility_projected',
        'turn_interrupted',
        'turn_resumed',
        'turn_completed',
        'turn_failed'
      )`,
    ),
    check(
      "campaign_play_runtime_events_versions_valid",
      sql`${table.sequence} > 0
        AND ${table.worldVersion} >= 1
        AND ${table.priorRuntimeRevision} >= 0
        AND ${table.resultRuntimeRevision} = ${table.priorRuntimeRevision} + 1`,
    ),
    check(
      "campaign_play_runtime_events_hashes_valid",
      sql`length(${table.priorRuntimeHash}) = 64
        AND length(${table.resultRuntimeHash}) = 64
        AND length(${table.protectedPayloadHash}) = 64
        AND ${table.priorRuntimeHash} <> ${table.resultRuntimeHash}`,
    ),
    check(
      "campaign_play_runtime_events_turn_ownership",
      sql`(
          ${table.kind} IN ('play_state_created', 'character_created')
          AND ${table.turnId} IS NULL
        ) OR (
          ${table.kind} NOT IN ('play_state_created', 'character_created')
          AND ${table.turnId} IS NOT NULL
        )`,
    ),
    check(
      "campaign_play_runtime_events_worker_fencing",
      sql`(
          ${table.kind} IN (
            'worker_claimed',
            'worker_lease_renewed',
            'stage_accepted',
            'primary_settled',
            'actor_job_transitioned',
            'visibility_projected',
            'turn_interrupted',
            'turn_resumed',
            'turn_completed',
            'turn_failed'
          )
          AND ${table.workerEpoch} IS NOT NULL
          AND ${table.workerEpoch} > 0
        ) OR (
          ${table.kind} NOT IN (
            'worker_claimed',
            'worker_lease_renewed',
            'stage_accepted',
            'primary_settled',
            'actor_job_transitioned',
            'visibility_projected',
            'turn_interrupted',
            'turn_resumed',
            'turn_completed',
            'turn_failed'
          )
          AND ${table.workerEpoch} IS NULL
        )`,
    ),
  ],
);

export const campaignPlayTurnEvents = sqliteTable(
  "campaign_play_turn_events",
  {
    eventId: text("event_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id")
      .notNull()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    sequence: integer("sequence").notNull(),
    eventType: text("event_type", {
      enum: campaignPlayTurnEventTypeValues,
    }).notNull(),
    payloadJson: text("payload_json").notNull(),
    sseCursor: text("sse_cursor").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_turn_events_turn_sequence_unique").on(
      table.turnId,
      table.sequence,
    ),
    uniqueIndex("campaign_play_turn_events_campaign_cursor_unique").on(
      table.campaignId,
      table.sseCursor,
    ),
    index("idx_campaign_play_turn_events_campaign_turn_sequence").on(
      table.campaignId,
      table.turnId,
      table.sequence,
    ),
    check(
      "campaign_play_turn_events_type_valid",
      sql`${table.eventType} IN (
        'turn.accepted',
        'turn.progressed',
        'turn.interrupted',
        'turn.completed',
        'turn.failed'
      )`,
    ),
    check(
      "campaign_play_turn_events_payload_valid",
      sql`${table.sequence} > 0
        AND json_valid(${table.payloadJson})
        AND length(${table.sseCursor}) > 0`,
    ),
  ],
);

export const campaignPlayModelStages = sqliteTable(
  "campaign_play_model_stages",
  {
    id: text("id").primaryKey(),
    stageId: text("stage_id").notNull(),
    attempt: integer("attempt").notNull(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => campaignPlayTurns.id, {
      onDelete: "cascade",
    }),
    kind: text("kind", { enum: campaignPlayModelStageKindValues }).notNull(),
    status: text("status", {
      enum: campaignPlayModelStageStatusValues,
    }).notNull(),
    workerEpoch: integer("worker_epoch").notNull(),
    requestedProviderId: text("requested_provider_id").notNull(),
    requestedModel: text("requested_model").notNull(),
    requestedStrategy: text("requested_strategy").notNull(),
    actualProviderId: text("actual_provider_id"),
    actualModel: text("actual_model"),
    actualStrategy: text("actual_strategy"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    finishReason: text("finish_reason"),
    schemaOutcome: text("schema_outcome", {
      enum: campaignPlayModelSchemaOutcomeValues,
    }).notNull(),
    artifactJson: text("artifact_json"),
    artifactHash: text("artifact_hash"),
    errorCode: text("error_code", {
      enum: campaignPlayInternalErrorCodeValues,
    }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_model_stages_invocation_attempt_unique").on(
      table.stageId,
      table.attempt,
    ),
    uniqueIndex("campaign_play_model_stages_invocation_epoch_unique").on(
      table.stageId,
      table.workerEpoch,
    ),
    uniqueIndex("campaign_play_model_stages_invocation_started_unique")
      .on(table.stageId)
      .where(sql`${table.status} = 'started'`),
    uniqueIndex("campaign_play_model_stages_invocation_accepted_unique")
      .on(table.stageId)
      .where(sql`${table.status} = 'accepted'`),
    index("idx_campaign_play_model_stages_campaign_turn_kind_attempt").on(
      table.campaignId,
      table.turnId,
      table.kind,
      table.attempt,
    ),
    check(
      "campaign_play_model_stages_enums_valid",
      sql`${table.kind} IN (
          'judge',
          'game_master',
          'opening_planner',
          'actor_replanner',
          'narrator'
        )
        AND ${table.status} IN ('started', 'accepted', 'interrupted', 'failed')
        AND ${table.schemaOutcome} IN (
          'pending',
          'valid',
          'invalid',
          'transport_error'
        )
        AND (
          ${table.errorCode} IS NULL
          OR ${table.errorCode} IN (
            'invalid_input',
            'worker_lease_lost',
            'stale_artifact',
            'model_contract_invalid',
            'stage_budget_exceeded',
            'stage_timeout',
            'rulebook_denied',
            'persistence_failed',
            'provider_unavailable',
            'narration_invalid'
          )
        )`,
    ),
    check(
      "campaign_play_model_stages_identity_valid",
      sql`length(${table.stageId}) > 0
        AND ${table.attempt} > 0
        AND ${table.workerEpoch} > 0
        AND length(${table.requestedProviderId}) > 0
        AND length(${table.requestedModel}) > 0
        AND ${table.requestedStrategy} = 'strict_object'
        AND (${table.actualStrategy} IS NULL OR ${table.actualStrategy} = 'strict_object')`,
    ),
    check(
      "campaign_play_model_stages_actual_evidence_consistent",
      sql`(
          ${table.actualProviderId} IS NULL
          AND ${table.actualModel} IS NULL
          AND ${table.actualStrategy} IS NULL
        ) OR (
          ${table.actualProviderId} IS NOT NULL
          AND ${table.actualModel} IS NOT NULL
          AND ${table.actualStrategy} = 'strict_object'
        )`,
    ),
    check(
      "campaign_play_model_stages_usage_valid",
      sql`(${table.inputTokens} IS NULL OR ${table.inputTokens} >= 0)
        AND (${table.outputTokens} IS NULL OR ${table.outputTokens} >= 0)
        AND (${table.durationMs} IS NULL OR ${table.durationMs} >= 0)
        AND (${table.artifactJson} IS NULL OR json_valid(${table.artifactJson}))
        AND (${table.artifactHash} IS NULL OR length(${table.artifactHash}) = 64)`,
    ),
    check(
      "campaign_play_model_stages_status_consistent",
      sql`(
          ${table.status} = 'started'
          AND ${table.schemaOutcome} = 'pending'
          AND ${table.actualProviderId} IS NULL
          AND ${table.inputTokens} IS NULL
          AND ${table.outputTokens} IS NULL
          AND ${table.durationMs} IS NULL
          AND ${table.finishReason} IS NULL
          AND ${table.artifactJson} IS NULL
          AND ${table.artifactHash} IS NULL
          AND ${table.errorCode} IS NULL
          AND ${table.completedAt} IS NULL
        ) OR (
          ${table.status} = 'accepted'
          AND ${table.schemaOutcome} = 'valid'
          AND ${table.actualProviderId} IS NOT NULL
          AND ${table.inputTokens} IS NOT NULL
          AND ${table.outputTokens} IS NOT NULL
          AND ${table.durationMs} IS NOT NULL
          AND ${table.finishReason} IS NOT NULL
          AND ${table.artifactJson} IS NOT NULL
          AND ${table.artifactHash} IS NOT NULL
          AND ${table.errorCode} IS NULL
          AND ${table.completedAt} IS NOT NULL
        ) OR (
          ${table.status} = 'interrupted'
          AND ${table.schemaOutcome} IN ('invalid', 'transport_error')
          AND ${table.durationMs} IS NOT NULL
          AND ${table.artifactJson} IS NULL
          AND ${table.artifactHash} IS NULL
          AND ${table.errorCode} IS NOT NULL
          AND ${table.completedAt} IS NOT NULL
        ) OR (
          ${table.status} = 'failed'
          AND ${table.schemaOutcome} IN ('invalid', 'transport_error')
          AND ${table.durationMs} IS NOT NULL
          AND ${table.artifactJson} IS NULL
          AND ${table.artifactHash} IS NULL
          AND ${table.errorCode} IS NOT NULL
          AND ${table.completedAt} IS NOT NULL
        )`,
    ),
  ],
);

export const campaignPlayNarrations = sqliteTable(
  "campaign_play_narrations",
  {
    narrationId: text("narration_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id")
      .notNull()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: campaignPlayNarrationStatusValues,
    }).notNull(),
    packetHash: text("packet_hash").notNull(),
    packetJson: text("packet_json").notNull(),
    beatsJson: text("beats_json"),
    displayText: text("display_text"),
    suggestedActionsJson: text("suggested_actions_json"),
    effectsJson: text("effects_json"),
    errorCode: text("error_code", {
      enum: campaignPlayInternalErrorCodeValues,
    }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_narrations_turn_unique").on(table.turnId),
    index("idx_campaign_play_narrations_campaign_status").on(
      table.campaignId,
      table.status,
    ),
    check(
      "campaign_play_narrations_status_valid",
      sql`${table.status} IN ('pending', 'complete', 'invalid')
        AND (${table.errorCode} IS NULL OR ${table.errorCode} = 'narration_invalid')`,
    ),
    check(
      "campaign_play_narrations_packet_valid",
      sql`length(${table.packetHash}) = 64
        AND json_valid(${table.packetJson})
        AND json_type(${table.packetJson}) = 'object'`,
    ),
    check(
      "campaign_play_narrations_status_consistent",
      sql`(
          ${table.status} = 'pending'
          AND ${table.beatsJson} IS NULL
          AND ${table.displayText} IS NULL
          AND ${table.suggestedActionsJson} IS NULL
          AND ${table.effectsJson} IS NULL
          AND ${table.errorCode} IS NULL
          AND ${table.completedAt} IS NULL
        ) OR (
          ${table.status} = 'complete'
          AND json_valid(${table.beatsJson})
          AND ${table.displayText} IS NOT NULL
          AND json_valid(${table.suggestedActionsJson})
          AND json_valid(${table.effectsJson})
          AND ${table.errorCode} IS NULL
          AND ${table.completedAt} IS NOT NULL
        ) OR (
          ${table.status} = 'invalid'
          AND ${table.beatsJson} IS NULL
          AND ${table.displayText} IS NULL
          AND ${table.suggestedActionsJson} IS NULL
          AND ${table.effectsJson} IS NULL
          AND ${table.errorCode} = 'narration_invalid'
          AND ${table.completedAt} IS NOT NULL
        )`,
    ),
  ],
);

export const campaignPlayNarrationOperations = sqliteTable(
  "campaign_play_narration_operations",
  {
    operationId: text("operation_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    resultId: text("result_id").notNull(),
    narrationId: text("narration_id").notNull()
      .references(() => campaignPlayNarrations.narrationId, { onDelete: "cascade" }),
    packetHash: text("packet_hash").notNull(),
    receiptIdsJson: text("receipt_ids_json").notNull(),
    conciseDisplayText: text("concise_display_text").notNull(),
    conciseSuggestedActionsJson: text("concise_suggested_actions_json").notNull(),
    status: text("status", { enum: campaignPlayNarrationOperationStatusValues }).notNull(),
    currentAttempt: integer("current_attempt").notNull().default(0),
    currentAttemptId: text("current_attempt_id"),
    errorCode: text("error_code"),
    leaseOwner: text("lease_owner"),
    leaseEpoch: integer("lease_epoch").notNull().default(0),
    leaseExpiresAt: integer("lease_expires_at", { mode: "number" }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_narration_operations_turn_unique").on(table.turnId),
    uniqueIndex("campaign_play_narration_operations_result_unique").on(table.resultId),
    uniqueIndex("campaign_play_narration_operations_narration_unique").on(table.narrationId),
    index("idx_campaign_play_narration_operations_campaign_status").on(
      table.campaignId,
      table.status,
    ),
    check(
      "campaign_play_narration_operations_payload_valid",
      sql`length(${table.operationId}) > 0
        AND length(${table.resultId}) > 0
        AND length(${table.packetHash}) = 64
        AND json_valid(${table.receiptIdsJson})
        AND json_type(${table.receiptIdsJson}) = 'array'
        AND length(${table.conciseDisplayText}) > 0
        AND json_valid(${table.conciseSuggestedActionsJson})
        AND json_type(${table.conciseSuggestedActionsJson}) = 'array'
        AND ${table.currentAttempt} >= 0
        AND ${table.leaseEpoch} >= 0`,
    ),
    check(
      "campaign_play_narration_operations_status_valid",
      sql`${table.status} IN ('pending', 'running', 'failed', 'complete')`,
    ),
    check(
      "campaign_play_narration_operations_state_consistent",
      sql`(
          ${table.status} = 'pending'
          AND ${table.currentAttemptId} IS NULL
          AND ${table.errorCode} IS NULL
          AND ${table.leaseOwner} IS NULL
          AND ${table.leaseExpiresAt} IS NULL
          AND ${table.completedAt} IS NULL
        ) OR (
          ${table.status} = 'running'
          AND ${table.currentAttempt} > 0
          AND ${table.currentAttemptId} IS NOT NULL
          AND ${table.errorCode} IS NULL
          AND ${table.leaseOwner} IS NOT NULL
          AND ${table.leaseEpoch} > 0
          AND ${table.leaseExpiresAt} IS NOT NULL
          AND ${table.completedAt} IS NULL
        ) OR (
          ${table.status} = 'failed'
          AND ${table.currentAttempt} > 0
          AND ${table.currentAttemptId} IS NOT NULL
          AND ${table.errorCode} IS NOT NULL
          AND ${table.leaseOwner} IS NULL
          AND ${table.leaseExpiresAt} IS NULL
          AND ${table.completedAt} IS NULL
        ) OR (
          ${table.status} = 'complete'
          AND ${table.currentAttempt} > 0
          AND ${table.currentAttemptId} IS NOT NULL
          AND ${table.errorCode} IS NULL
          AND ${table.leaseOwner} IS NULL
          AND ${table.leaseExpiresAt} IS NULL
          AND ${table.completedAt} IS NOT NULL
        )`,
    ),
  ],
);

export const campaignPlayNarrationAttempts = sqliteTable(
  "campaign_play_narration_attempts",
  {
    attemptId: text("attempt_id").primaryKey(),
    operationId: text("operation_id").notNull()
      .references(() => campaignPlayNarrationOperations.operationId, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    attempt: integer("attempt").notNull(),
    status: text("status", { enum: campaignPlayNarrationAttemptStatusValues }).notNull(),
    workerEpoch: integer("worker_epoch").notNull(),
    requestedProviderId: text("requested_provider_id").notNull(),
    requestedModel: text("requested_model").notNull(),
    requestedStrategy: text("requested_strategy").notNull(),
    actualProviderId: text("actual_provider_id"),
    actualModel: text("actual_model"),
    actualStrategy: text("actual_strategy"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    durationMs: integer("duration_ms"),
    finishReason: text("finish_reason"),
    schemaOutcome: text("schema_outcome").notNull(),
    artifactHash: text("artifact_hash"),
    errorCode: text("error_code"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_narration_attempts_operation_attempt_unique").on(
      table.operationId,
      table.attempt,
    ),
    uniqueIndex("campaign_play_narration_attempts_operation_epoch_unique").on(
      table.operationId,
      table.workerEpoch,
    ),
    uniqueIndex("campaign_play_narration_attempts_running_unique")
      .on(table.operationId)
      .where(sql`${table.status} = 'running'`),
    uniqueIndex("campaign_play_narration_attempts_accepted_unique")
      .on(table.operationId)
      .where(sql`${table.status} = 'accepted'`),
    index("idx_campaign_play_narration_attempts_campaign_turn").on(
      table.campaignId,
      table.turnId,
      table.attempt,
    ),
    check(
      "campaign_play_narration_attempts_identity_valid",
      sql`${table.attempt} > 0
        AND ${table.workerEpoch} > 0
        AND length(${table.requestedProviderId}) > 0
        AND length(${table.requestedModel}) > 0
        AND ${table.requestedStrategy} = 'strict_object'
        AND (${table.actualStrategy} IS NULL OR ${table.actualStrategy} = 'strict_object')`,
    ),
    check(
      "campaign_play_narration_attempts_status_valid",
      sql`${table.status} IN ('running', 'failed', 'accepted', 'stale')
        AND ${table.schemaOutcome} IN ('pending', 'valid', 'invalid', 'transport_error')`,
    ),
    check(
      "campaign_play_narration_attempts_state_consistent",
      sql`(
          ${table.status} = 'running'
          AND ${table.schemaOutcome} = 'pending'
          AND ${table.actualProviderId} IS NULL
          AND ${table.durationMs} IS NULL
          AND ${table.artifactHash} IS NULL
          AND ${table.errorCode} IS NULL
          AND ${table.completedAt} IS NULL
        ) OR (
          ${table.status} = 'accepted'
          AND ${table.schemaOutcome} = 'valid'
          AND ${table.actualProviderId} IS NOT NULL
          AND ${table.actualModel} IS NOT NULL
          AND ${table.actualStrategy} = 'strict_object'
          AND ${table.inputTokens} IS NOT NULL
          AND ${table.outputTokens} IS NOT NULL
          AND ${table.durationMs} IS NOT NULL
          AND ${table.finishReason} IS NOT NULL
          AND length(${table.artifactHash}) = 64
          AND ${table.errorCode} IS NULL
          AND ${table.completedAt} IS NOT NULL
        ) OR (
          ${table.status} IN ('failed', 'stale')
          AND ${table.schemaOutcome} IN ('invalid', 'transport_error')
          AND ${table.durationMs} IS NOT NULL
          AND ${table.artifactHash} IS NULL
          AND ${table.errorCode} IS NOT NULL
          AND ${table.completedAt} IS NOT NULL
        )`,
    ),
  ],
);

export const campaignPlayProperScenes = sqliteTable(
  "campaign_play_proper_scenes",
  {
    narrationId: text("narration_id").primaryKey(),
    operationId: text("operation_id").notNull()
      .references(() => campaignPlayNarrationOperations.operationId, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    packetHash: text("packet_hash").notNull(),
    attemptId: text("attempt_id").notNull()
      .references(() => campaignPlayNarrationAttempts.attemptId, { onDelete: "restrict" }),
    beatsJson: text("beats_json").notNull(),
    displayText: text("display_text").notNull(),
    suggestedActionsJson: text("suggested_actions_json").notNull(),
    effectsJson: text("effects_json").notNull(),
    artifactHash: text("artifact_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_proper_scenes_operation_unique").on(table.operationId),
    uniqueIndex("campaign_play_proper_scenes_turn_unique").on(table.turnId),
    check(
      "campaign_play_proper_scenes_payload_valid",
      sql`length(${table.packetHash}) = 64
        AND json_valid(${table.beatsJson})
        AND length(${table.displayText}) > 0
        AND json_valid(${table.suggestedActionsJson})
        AND json_valid(${table.effectsJson})
        AND length(${table.artifactHash}) = 64`,
    ),
  ],
);

export const campaignPlayCommands = sqliteTable(
  "campaign_play_commands",
  {
    commandId: text("command_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => campaignPlayTurns.id, {
      onDelete: "cascade",
    }),
    batchId: text("batch_id").notNull(),
    order: integer("command_order").notNull(),
    commandKind: text("command_kind", {
      enum: campaignPlayCommandKindValues,
    }).notNull(),
    causalParentJson: text("causal_parent_json").notNull(),
    sourceJson: text("source_json").notNull(),
    expectedWorldVersion: integer("expected_world_version").notNull(),
    readScopeJson: text("read_scope_json").notNull(),
    writeScopeJson: text("write_scope_json").notNull(),
    exposurePolicyJson: text("exposure_policy_json").notNull(),
    argumentsHash: text("arguments_hash").notNull(),
    protectedPayloadJson: text("protected_payload_json").notNull(),
    protectedPayloadHash: text("protected_payload_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_commands_campaign_batch_order_unique").on(
      table.campaignId,
      table.batchId,
      table.order,
    ),
    index("idx_campaign_play_commands_campaign_turn_order").on(
      table.campaignId,
      table.turnId,
      table.order,
    ),
    index("idx_campaign_play_commands_campaign_expected_version").on(
      table.campaignId,
      table.expectedWorldVersion,
    ),
    check(
      "campaign_play_commands_kind_valid",
      sql`${table.commandKind} IN (
        'advance_world_time',
        'move_actor',
        'set_route_state',
        'set_actor_condition',
        'update_actor_relation',
        'update_actor_goal',
        'advance_pressure',
        'record_world_event',
        'create_player_actor',
        'initialize_player_placement',
        'initialize_world_time',
        'initialize_pressure_state'
      )`,
    ),
    check(
      "campaign_play_commands_identity_valid",
      sql`length(${table.batchId}) > 0
        AND ${table.order} BETWEEN 0 AND 20
        AND ${table.expectedWorldVersion} >= 1`,
    ),
    check(
      "campaign_play_commands_json_valid",
      sql`json_valid(${table.causalParentJson})
        AND json_type(${table.causalParentJson}) = 'object'
        AND json_valid(${table.sourceJson})
        AND json_type(${table.sourceJson}) = 'object'
        AND json_valid(${table.readScopeJson})
        AND json_type(${table.readScopeJson}) = 'array'
        AND json_array_length(${table.readScopeJson}) <= 16
        AND json_valid(${table.writeScopeJson})
        AND json_type(${table.writeScopeJson}) = 'array'
        AND json_array_length(${table.writeScopeJson}) <= 16
        AND json_valid(${table.exposurePolicyJson})
        AND json_type(${table.exposurePolicyJson}) = 'object'
        AND json_valid(${table.protectedPayloadJson})
        AND json_type(${table.protectedPayloadJson}) = 'object'`,
    ),
    check(
      "campaign_play_commands_hashes_valid",
      sql`length(${table.argumentsHash}) = 64
        AND length(${table.protectedPayloadHash}) = 64`,
    ),
  ],
);

export const campaignPlayReceipts = sqliteTable(
  "campaign_play_receipts",
  {
    receiptId: text("receipt_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => campaignPlayTurns.id, {
      onDelete: "cascade",
    }),
    commandId: text("command_id")
      .notNull()
      .references(() => campaignPlayCommands.commandId, { onDelete: "restrict" }),
    commandKind: text("command_kind", {
      enum: campaignPlayCommandKindValues,
    }).notNull(),
    outcome: text("outcome", { enum: ["applied"] }).notNull(),
    appliedWorldMutation: integer("applied_world_mutation", {
      mode: "boolean",
    }).notNull(),
    priorWorldVersion: integer("prior_world_version").notNull(),
    resultWorldVersion: integer("result_world_version").notNull(),
    priorWorldHash: text("prior_world_hash").notNull(),
    resultWorldHash: text("result_world_hash").notNull(),
    causalEventIdsJson: text("causal_event_ids_json").notNull(),
    protectedPayloadJson: text("protected_payload_json").notNull(),
    protectedPayloadHash: text("protected_payload_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_receipts_command_unique").on(table.commandId),
    uniqueIndex("campaign_play_receipts_campaign_mutation_version_unique")
      .on(table.campaignId, table.resultWorldVersion)
      .where(sql`${table.appliedWorldMutation} = 1`),
    index("idx_campaign_play_receipts_campaign_turn_version").on(
      table.campaignId,
      table.turnId,
      table.resultWorldVersion,
    ),
    index("idx_campaign_play_receipts_campaign_prior_version").on(
      table.campaignId,
      table.priorWorldVersion,
    ),
    check(
      "campaign_play_receipts_kind_valid",
      sql`${table.commandKind} IN (
        'advance_world_time',
        'move_actor',
        'set_route_state',
        'set_actor_condition',
        'update_actor_relation',
        'update_actor_goal',
        'advance_pressure',
        'record_world_event',
        'create_player_actor',
        'initialize_player_placement',
        'initialize_world_time',
        'initialize_pressure_state'
      ) AND ${table.outcome} = 'applied'`,
    ),
    check(
      "campaign_play_receipts_payload_valid",
      sql`json_valid(${table.causalEventIdsJson})
        AND json_type(${table.causalEventIdsJson}) = 'array'
        AND json_array_length(${table.causalEventIdsJson}) BETWEEN 1 AND 8
        AND json_valid(${table.protectedPayloadJson})
        AND json_type(${table.protectedPayloadJson}) = 'object'`,
    ),
    check(
      "campaign_play_receipts_hashes_valid",
      sql`length(${table.priorWorldHash}) = 64
        AND length(${table.resultWorldHash}) = 64
        AND length(${table.protectedPayloadHash}) = 64`,
    ),
    check(
      "campaign_play_receipts_mutation_valid",
      sql`(
          ${table.commandKind} = 'record_world_event'
          AND ${table.appliedWorldMutation} = 0
          AND ${table.resultWorldVersion} = ${table.priorWorldVersion}
          AND ${table.resultWorldHash} = ${table.priorWorldHash}
        ) OR (
          ${table.commandKind} <> 'record_world_event'
          AND ${table.appliedWorldMutation} = 1
          AND ${table.resultWorldVersion} = ${table.priorWorldVersion} + 1
          AND ${table.resultWorldHash} <> ${table.priorWorldHash}
        )`,
    ),
  ],
);

export const campaignPlayEvents = sqliteTable(
  "campaign_play_events",
  {
    eventId: text("event_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").references(() => campaignPlayTurns.id, {
      onDelete: "cascade",
    }),
    commandId: text("command_id")
      .notNull()
      .references(() => campaignPlayCommands.commandId, { onDelete: "restrict" }),
    receiptId: text("receipt_id")
      .notNull()
      .references(() => campaignPlayReceipts.receiptId, { onDelete: "restrict" }),
    parentEventId: text("parent_event_id").references(
      (): AnySQLiteColumn => campaignPlayEvents.eventId,
      { onDelete: "restrict" },
    ),
    eventKind: text("event_kind", {
      enum: campaignPlayWorldEventKindValues,
    }).notNull(),
    sourceJson: text("source_json").notNull(),
    worldTimeMinutes: integer("world_time_minutes").notNull(),
    worldVersion: integer("world_version").notNull(),
    affectedRefsJson: text("affected_refs_json").notNull(),
    beforePayloadJson: text("before_payload_json"),
    afterPayloadJson: text("after_payload_json"),
    payloadHash: text("payload_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_campaign_play_events_campaign_world_version").on(
      table.campaignId,
      table.worldVersion,
    ),
    index("idx_campaign_play_events_campaign_turn_created").on(
      table.campaignId,
      table.turnId,
      table.createdAt,
    ),
    index("idx_campaign_play_events_campaign_parent").on(
      table.campaignId,
      table.parentEventId,
    ),
    index("idx_campaign_play_events_receipt").on(table.receiptId),
    index("idx_campaign_play_events_command").on(table.commandId),
    check(
      "campaign_play_events_kind_valid",
      sql`${table.eventKind} IN (
        'player_actor_created',
        'player_placement_initialized',
        'world_time_initialized',
        'pressure_initialized',
        'world_time_advanced',
        'actor_moved',
        'route_state_changed',
        'actor_condition_changed',
        'actor_relation_changed',
        'actor_goal_changed',
        'pressure_advanced',
        'scene_recorded'
      )`,
    ),
    check(
      "campaign_play_events_payload_valid",
      sql`${table.worldTimeMinutes} BETWEEN 0 AND 2147483647
        AND ${table.worldVersion} >= 1
        AND json_valid(${table.sourceJson})
        AND json_type(${table.sourceJson}) = 'object'
        AND json_valid(${table.affectedRefsJson})
        AND json_type(${table.affectedRefsJson}) = 'array'
        AND json_array_length(${table.affectedRefsJson}) BETWEEN 1 AND 16
        AND (
          ${table.beforePayloadJson} IS NULL
          OR (
            json_valid(${table.beforePayloadJson})
            AND json_type(${table.beforePayloadJson}) = 'object'
          )
        )
        AND (
          ${table.afterPayloadJson} IS NULL
          OR (
            json_valid(${table.afterPayloadJson})
            AND json_type(${table.afterPayloadJson}) = 'object'
          )
        )
        AND (${table.beforePayloadJson} IS NOT NULL OR ${table.afterPayloadJson} IS NOT NULL)
        AND length(${table.payloadHash}) = 64`,
    ),
  ],
);

export const campaignPlayEventExposures = sqliteTable(
  "campaign_play_event_exposures",
  {
    exposureId: text("exposure_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    eventId: text("event_id")
      .notNull()
      .references(() => campaignPlayEvents.eventId, { onDelete: "cascade" }),
    channel: text("channel", {
      enum: campaignPlayExposureChannelValues,
    }).notNull(),
    locationId: text("location_id").references(() => locations.id, {
      onDelete: "restrict",
    }),
    routeId: text("route_id").references(() => locationEdges.id, {
      onDelete: "restrict",
    }),
    witnessActorId: text("witness_actor_id").references(() => actors.id, {
      onDelete: "restrict",
    }),
    validUntilWorldTimeMinutes: integer("valid_until_world_time_minutes"),
    routeTriggersJson: text("route_triggers_json"),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_event_exposures_event_channel_anchor_unique").on(
      table.eventId,
      table.channel,
      table.locationId,
      table.routeId,
      table.witnessActorId,
    ),
    index("idx_campaign_play_event_exposures_campaign_event").on(
      table.campaignId,
      table.eventId,
    ),
    index("idx_campaign_play_event_exposures_location_channel").on(
      table.campaignId,
      table.locationId,
      table.channel,
    ),
    index("idx_campaign_play_event_exposures_route_channel").on(
      table.campaignId,
      table.routeId,
      table.channel,
    ),
    index("idx_campaign_play_event_exposures_witness_channel").on(
      table.campaignId,
      table.witnessActorId,
      table.channel,
    ),
    check(
      "campaign_play_event_exposures_channel_valid",
      sql`${table.channel} IN (
        'direct_perception',
        'local_aftermath',
        'route_state',
        'witness_report'
      )`,
    ),
    check(
      "campaign_play_event_exposures_shape_valid",
      sql`(
          ${table.channel} = 'direct_perception'
          AND ${table.locationId} IS NOT NULL
          AND ${table.routeId} IS NULL
          AND ${table.witnessActorId} IS NULL
          AND ${table.validUntilWorldTimeMinutes} IS NULL
          AND ${table.routeTriggersJson} IS NULL
        ) OR (
          ${table.channel} = 'local_aftermath'
          AND ${table.locationId} IS NOT NULL
          AND ${table.routeId} IS NULL
          AND ${table.witnessActorId} IS NULL
          AND ${table.validUntilWorldTimeMinutes} BETWEEN 0 AND 2147483647
          AND ${table.routeTriggersJson} IS NULL
        ) OR (
          ${table.channel} = 'route_state'
          AND ${table.locationId} IS NULL
          AND ${table.routeId} IS NOT NULL
          AND ${table.witnessActorId} IS NULL
          AND ${table.validUntilWorldTimeMinutes} IS NULL
          AND json_valid(${table.routeTriggersJson})
          AND json_type(${table.routeTriggersJson}) = 'array'
          AND json_array_length(${table.routeTriggersJson}) BETWEEN 1 AND 3
        ) OR (
          ${table.channel} = 'witness_report'
          AND ${table.locationId} IS NULL
          AND ${table.routeId} IS NULL
          AND ${table.witnessActorId} IS NOT NULL
          AND ${table.validUntilWorldTimeMinutes} IS NULL
          AND ${table.routeTriggersJson} IS NULL
        )`,
    ),
  ],
);

export const campaignPlayRouteStates = sqliteTable(
  "campaign_play_route_states",
  {
    routeId: text("route_id")
      .primaryKey()
      .references(() => locationEdges.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    state: text("state", { enum: campaignPlayRouteStateValues }).notNull(),
    causalReceiptId: text("causal_receipt_id")
      .notNull()
      .references(() => campaignPlayReceipts.receiptId, { onDelete: "restrict" }),
    worldVersion: integer("world_version").notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_route_states_receipt_unique").on(
      table.causalReceiptId,
    ),
    index("idx_campaign_play_route_states_campaign_state").on(
      table.campaignId,
      table.state,
    ),
    index("idx_campaign_play_route_states_campaign_version").on(
      table.campaignId,
      table.worldVersion,
    ),
    check(
      "campaign_play_route_states_valid",
      sql`${table.state} IN ('open', 'restricted', 'blocked')
        AND ${table.worldVersion} >= 1`,
    ),
  ],
);

export const campaignPlayActorConditions = sqliteTable(
  "campaign_play_actor_conditions",
  {
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    condition: text("condition", {
      enum: campaignPlayActorConditionValues,
    }).notNull(),
    present: integer("present", { mode: "boolean" }).notNull(),
    summary: text("summary").notNull(),
    causalReceiptId: text("causal_receipt_id")
      .notNull()
      .references(() => campaignPlayReceipts.receiptId, { onDelete: "restrict" }),
    worldVersion: integer("world_version").notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_conditions_actor_condition_unique").on(
      table.actorId,
      table.condition,
    ),
    uniqueIndex("campaign_play_actor_conditions_receipt_unique").on(
      table.causalReceiptId,
    ),
    index("idx_campaign_play_actor_conditions_campaign_present").on(
      table.campaignId,
      table.present,
    ),
    index("idx_campaign_play_actor_conditions_campaign_version").on(
      table.campaignId,
      table.worldVersion,
    ),
    check(
      "campaign_play_actor_conditions_valid",
      sql`${table.condition} IN ('occupied', 'strained', 'incapacitated')
        AND ${table.present} IN (0, 1)
        AND length(${table.summary}) > 0
        AND ${table.worldVersion} >= 1`,
    ),
  ],
);

export const campaignPlayActorPossessions = sqliteTable(
  "campaign_play_actor_possessions",
  {
    possessionId: text("possession_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    possessionKey: text("possession_key").notNull(),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull().default(0),
    causalReceiptId: text("causal_receipt_id")
      .notNull()
      .references(() => campaignPlayReceipts.receiptId, { onDelete: "restrict" }),
    worldVersion: integer("world_version").notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_possessions_actor_key_unique").on(
      table.actorId,
      table.possessionKey,
    ),
    index("idx_campaign_play_actor_possessions_receipt").on(
      table.causalReceiptId,
    ),
    index("idx_campaign_play_actor_possessions_campaign_actor").on(
      table.campaignId,
      table.actorId,
    ),
    index("idx_campaign_play_actor_possessions_campaign_version").on(
      table.campaignId,
      table.worldVersion,
    ),
    check(
      "campaign_play_actor_possessions_valid",
      sql`length(${table.possessionId}) BETWEEN 1 AND 128
        AND length(${table.campaignId}) BETWEEN 1 AND 128
        AND length(${table.actorId}) BETWEEN 1 AND 128
        AND length(${table.possessionKey}) BETWEEN 1 AND 240
        AND length(${table.name}) BETWEEN 1 AND 120
        AND ${table.quantity} BETWEEN 0 AND 1000000
        AND ${table.worldVersion} >= 1`,
    ),
  ],
);

export const campaignPlayActorObligations = sqliteTable(
  "campaign_play_actor_obligations",
  {
    obligationId: text("obligation_id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    debtorActorId: text("debtor_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    creditorActorId: text("creditor_actor_id")
      .notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    unitKey: text("unit_key", { enum: ["copper"] }).notNull(),
    principalAmount: integer("principal_amount").notNull(),
    outstandingAmount: integer("outstanding_amount").notNull(),
    causalReceiptId: text("causal_receipt_id")
      .notNull()
      .references(() => campaignPlayReceipts.receiptId, { onDelete: "restrict" }),
    worldVersion: integer("world_version").notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_obligations_debtor_creditor_unit_unique").on(
      table.debtorActorId,
      table.creditorActorId,
      table.unitKey,
    ),
    uniqueIndex("campaign_play_actor_obligations_receipt_unique").on(
      table.causalReceiptId,
    ),
    index("idx_campaign_play_actor_obligations_campaign_debtor").on(
      table.campaignId,
      table.debtorActorId,
    ),
    index("idx_campaign_play_actor_obligations_campaign_creditor").on(
      table.campaignId,
      table.creditorActorId,
    ),
    index("idx_campaign_play_actor_obligations_campaign_version").on(
      table.campaignId,
      table.worldVersion,
    ),
    check(
      "campaign_play_actor_obligations_valid",
      sql`length(${table.obligationId}) BETWEEN 1 AND 128
        AND length(${table.campaignId}) BETWEEN 1 AND 128
        AND length(${table.debtorActorId}) BETWEEN 1 AND 128
        AND length(${table.creditorActorId}) BETWEEN 1 AND 128
        AND ${table.debtorActorId} <> ${table.creditorActorId}
        AND ${table.unitKey} = 'copper'
        AND ${table.principalAmount} BETWEEN 1 AND 1000000
        AND ${table.outstandingAmount} BETWEEN 0 AND ${table.principalAmount}
        AND ${table.worldVersion} >= 1`,
    ),
  ],
);

export const campaignPlayPressureStates = sqliteTable(
  "campaign_play_pressure_states",
  {
    pressureId: text("pressure_id")
      .primaryKey()
      .references(() => worldPressures.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    progress: integer("progress").notNull(),
    status: text("status", {
      enum: campaignPlayPressureStatusValues,
    }).notNull(),
    lastAdvancedWorldTimeMinutes: integer("last_advanced_world_time_minutes")
      .notNull(),
    causalReceiptId: text("causal_receipt_id")
      .notNull()
      .references(() => campaignPlayReceipts.receiptId, { onDelete: "restrict" }),
    worldVersion: integer("world_version").notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_pressure_states_receipt_unique").on(
      table.causalReceiptId,
    ),
    index("idx_campaign_play_pressure_states_campaign_status").on(
      table.campaignId,
      table.status,
    ),
    index("idx_campaign_play_pressure_states_campaign_version").on(
      table.campaignId,
      table.worldVersion,
    ),
    check(
      "campaign_play_pressure_states_valid",
      sql`${table.progress} BETWEEN 0 AND 100
        AND ${table.status} IN ('active', 'resolved')
        AND ${table.lastAdvancedWorldTimeMinutes} BETWEEN 0 AND 2147483647
        AND ${table.worldVersion} >= 1`,
    ),
  ],
);

export const campaignPlayActorPlans = sqliteTable(
  "campaign_play_actor_plans",
  {
    planId: text("plan_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    goalId: text("goal_id").notNull()
      .references(() => actorGoals.id, { onDelete: "restrict" }),
    planVersion: integer("plan_version").notNull(),
    intentJson: text("intent_json").notNull(),
    preconditionsJson: text("preconditions_json").notNull(),
    cadenceMinutes: integer("cadence_minutes").notNull(),
    priority: integer("priority").notNull(),
    stepsJson: text("steps_json").notNull(),
    status: text("status", { enum: campaignPlayActorPlanStatusValues }).notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_plans_actor_version_unique").on(
      table.actorId, table.planVersion,
    ),
    uniqueIndex("campaign_play_actor_plans_actor_active_unique")
      .on(table.actorId).where(sql`${table.status} = 'active'`),
    index("idx_campaign_play_actor_plans_campaign_status").on(
      table.campaignId, table.status,
    ),
    check("campaign_play_actor_plans_valid", sql`${table.planVersion} > 0
      AND ${table.cadenceMinutes} BETWEEN 1 AND 10080
      AND ${table.priority} BETWEEN 1 AND 5
      AND ${table.status} IN ('active', 'completed', 'blocked')
      AND json_valid(${table.intentJson}) AND json_type(${table.intentJson}) = 'object'
      AND json_valid(${table.preconditionsJson}) AND json_type(${table.preconditionsJson}) = 'array'
      AND json_array_length(${table.preconditionsJson}) <= 8
      AND json_valid(${table.stepsJson}) AND json_type(${table.stepsJson}) = 'array'
      AND json_array_length(${table.stepsJson}) BETWEEN 1 AND 8`),
  ],
);

export const campaignPlayActorSchedules = sqliteTable(
  "campaign_play_actor_schedules",
  {
    scheduleId: text("schedule_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .references(() => campaignPlayActorPlans.planId, { onDelete: "restrict" }),
    nextActAtWorldTimeMinutes: integer("next_act_at_world_time_minutes").notNull(),
    lastActAtWorldTimeMinutes: integer("last_act_at_world_time_minutes"),
    priority: integer("priority").notNull(),
    agencyDebt: integer("agency_debt").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    updatedAt: integer("updated_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_schedules_actor_unique").on(table.actorId),
    index("idx_campaign_play_actor_schedules_campaign_due").on(
      table.campaignId, table.nextActAtWorldTimeMinutes, table.priority, table.actorId,
    ),
    check("campaign_play_actor_schedules_valid", sql`${table.nextActAtWorldTimeMinutes} BETWEEN 0 AND 2147483647
      AND (${table.lastActAtWorldTimeMinutes} IS NULL OR ${table.lastActAtWorldTimeMinutes} BETWEEN 0 AND 2147483647)
      AND ${table.priority} BETWEEN 1 AND 5
      AND ${table.agencyDebt} BETWEEN 0 AND 100`),
  ],
);

export const campaignPlayActorDueSets = sqliteTable(
  "campaign_play_actor_due_sets",
  {
    turnId: text("turn_id").primaryKey()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    settledWorldTimeMinutes: integer("settled_world_time_minutes").notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    baseRuntimeRevision: integer("base_runtime_revision").notNull(),
    decisionsJson: text("decisions_json").notNull(),
    dueSetHash: text("due_set_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    index("idx_campaign_play_actor_due_sets_campaign_created").on(
      table.campaignId,
      table.createdAt,
    ),
    check(
      "campaign_play_actor_due_sets_valid",
      sql`${table.settledWorldTimeMinutes} BETWEEN 0 AND 2147483647
        AND ${table.baseWorldVersion} > 0
        AND ${table.baseRuntimeRevision} > 0
        AND json_valid(${table.decisionsJson})
        AND json_type(${table.decisionsJson}) = 'array'
        AND length(${table.dueSetHash}) = 64`,
    ),
  ],
);

export const campaignPlayActorJobs = sqliteTable(
  "campaign_play_actor_jobs",
  {
    jobId: text("job_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    turnId: text("turn_id").notNull()
      .references(() => campaignPlayTurns.id, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    admittedPlanId: text("admitted_plan_id")
      .references(() => campaignPlayActorPlans.planId, { onDelete: "restrict" }),
    planId: text("plan_id")
      .references(() => campaignPlayActorPlans.planId, { onDelete: "restrict" }),
    dueReason: text("due_reason", { enum: campaignPlayActorJobDueReasonValues }).notNull(),
    frozenBaseWorldVersion: integer("frozen_base_world_version").notNull(),
    workerEpoch: integer("worker_epoch").notNull(),
    claimTurnWorkerEpoch: integer("claim_turn_worker_epoch"),
    stage: text("stage", { enum: campaignPlayActorJobStageValues }).notNull(),
    proposalId: text("proposal_id"),
    deferReason: text("defer_reason", { enum: campaignPlayActorJobDeferReasonValues }),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_jobs_turn_actor_unique").on(table.turnId, table.actorId),
    uniqueIndex("campaign_play_actor_jobs_actor_pending_unique")
      .on(table.actorId).where(sql`${table.stage} IN ('queued', 'claimed', 'interrupted', 'proposed')`),
    index("idx_campaign_play_actor_jobs_campaign_stage_created").on(
      table.campaignId, table.stage, table.createdAt,
    ),
    check("campaign_play_actor_jobs_valid", sql`${table.dueReason} IN ('scheduled', 'agency_debt', 'plan_retry')
      AND ${table.frozenBaseWorldVersion} > 0
      AND ${table.workerEpoch} >= 0
      AND (${table.claimTurnWorkerEpoch} IS NULL OR ${table.claimTurnWorkerEpoch} > 0)
      AND ${table.stage} IN ('queued', 'claimed', 'interrupted', 'proposed', 'settled', 'rejected', 'deferred')
      AND (${table.stage} NOT IN ('claimed', 'interrupted', 'proposed') OR ${table.claimTurnWorkerEpoch} IS NOT NULL)
      AND (${table.stage} <> 'queued' OR (${table.workerEpoch} = 0 AND ${table.claimTurnWorkerEpoch} IS NULL))
      AND ((${table.stage} IN ('settled', 'rejected', 'deferred') AND ${table.completedAt} IS NOT NULL)
        OR (${table.stage} NOT IN ('settled', 'rejected', 'deferred') AND ${table.completedAt} IS NULL))
      AND ((${table.stage} = 'deferred' AND ${table.deferReason} IS NOT NULL
          AND ${table.deferReason} IN ('incapacitated', 'actor_capacity', 'replan_capacity', 'replan_invalid'))
        OR (${table.stage} <> 'deferred' AND ${table.deferReason} IS NULL))
      AND (${table.stage} NOT IN ('proposed', 'settled') OR ${table.proposalId} IS NOT NULL)`),
  ],
);

export const campaignPlayActorProposals = sqliteTable(
  "campaign_play_actor_proposals",
  {
    proposalId: text("proposal_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    batchId: text("batch_id").notNull(),
    jobId: text("job_id").notNull()
      .references(() => campaignPlayActorJobs.jobId, { onDelete: "restrict" }),
    actorId: text("actor_id").notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    causalParentJson: text("causal_parent_json").notNull(),
    baseWorldVersion: integer("base_world_version").notNull(),
    readScopeJson: text("read_scope_json").notNull(),
    writeScopeJson: text("write_scope_json").notNull(),
    expiresAtWorldTimeMinutes: integer("expires_at_world_time_minutes").notNull(),
    commandsJson: text("commands_json").notNull(),
    commandsHash: text("commands_hash").notNull(),
    status: text("status", { enum: campaignPlayProposalStatusValues }).notNull(),
    resultJson: text("result_json").notNull(),
    resultHash: text("result_hash").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
    completedAt: integer("completed_at", { mode: "number" }),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_proposals_job_unique").on(table.jobId),
    uniqueIndex("campaign_play_actor_proposals_campaign_batch_unique").on(table.campaignId, table.batchId),
    index("idx_campaign_play_actor_proposals_campaign_status_expiry").on(
      table.campaignId, table.status, table.expiresAtWorldTimeMinutes,
    ),
    index("idx_campaign_play_actor_proposals_campaign_base_version").on(
      table.campaignId, table.baseWorldVersion,
    ),
    check("campaign_play_actor_proposals_valid", sql`length(${table.batchId}) > 0
      AND ${table.baseWorldVersion} > 0
      AND ${table.expiresAtWorldTimeMinutes} BETWEEN 0 AND 2147483647
      AND ${table.status} IN ('pending', 'accepted', 'rejected')
      AND json_valid(${table.causalParentJson}) AND json_type(${table.causalParentJson}) = 'object'
      AND json_valid(${table.readScopeJson}) AND json_type(${table.readScopeJson}) = 'array'
      AND json_array_length(${table.readScopeJson}) <= 16
      AND json_valid(${table.writeScopeJson}) AND json_type(${table.writeScopeJson}) = 'array'
      AND json_array_length(${table.writeScopeJson}) <= 16
      AND json_valid(${table.commandsJson}) AND json_type(${table.commandsJson}) = 'array'
      AND json_array_length(${table.commandsJson}) BETWEEN 1 AND 8
      AND json_valid(${table.resultJson}) AND json_type(${table.resultJson}) = 'object'
      AND length(${table.commandsHash}) = 64 AND length(${table.resultHash}) = 64
      AND ((${table.status} = 'pending' AND ${table.completedAt} IS NULL)
        OR (${table.status} IN ('accepted', 'rejected') AND ${table.completedAt} IS NOT NULL))`),
  ],
);

export const campaignPlayActorKnowledge = sqliteTable(
  "campaign_play_actor_knowledge",
  {
    knowledgeId: text("knowledge_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    actorId: text("actor_id").notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull()
      .references(() => campaignPlayEvents.eventId, { onDelete: "cascade" }),
    exposureId: text("exposure_id").notNull()
      .references(() => campaignPlayEventExposures.exposureId, { onDelete: "cascade" }),
    channel: text("channel", { enum: campaignPlayExposureChannelValues }).notNull(),
    sourceLocationId: text("source_location_id").references(() => locations.id, { onDelete: "restrict" }),
    sourceRouteId: text("source_route_id").references(() => locationEdges.id, { onDelete: "restrict" }),
    sourceTrigger: text("source_trigger", { enum: ["inspect", "attempt", "traverse"] }),
    sourceWitnessActorId: text("source_witness_actor_id").references(() => actors.id, { onDelete: "restrict" }),
    perceivedActorId: text("perceived_actor_id").references(() => actors.id, { onDelete: "restrict" }),
    sourceJson: text("source_json").notNull(),
    sourceHash: text("source_hash").notNull(),
    learnedAtWorldTimeMinutes: integer("learned_at_world_time_minutes").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_actor_knowledge_provenance_unique").on(
      table.actorId, table.eventId, table.channel, table.sourceHash,
    ),
    index("idx_campaign_play_actor_knowledge_campaign_exposure").on(table.campaignId, table.exposureId),
    check("campaign_play_actor_knowledge_valid", sql`${table.channel} IN ('direct_perception', 'local_aftermath', 'route_state', 'witness_report')
      AND (${table.sourceTrigger} IS NULL OR ${table.sourceTrigger} IN ('inspect', 'attempt', 'traverse'))
      AND json_valid(${table.sourceJson})
      AND json_type(${table.sourceJson}) = 'object'
      AND length(${table.sourceHash}) = 64
      AND ${table.learnedAtWorldTimeMinutes} BETWEEN 0 AND 2147483647`),
  ],
);

export const campaignPlayObservations = sqliteTable(
  "campaign_play_observations",
  {
    observationId: text("observation_id").primaryKey(),
    campaignId: text("campaign_id").notNull()
      .references(() => campaignPlayStates.campaignId, { onDelete: "cascade" }),
    humanActorId: text("human_actor_id").notNull()
      .references(() => actors.id, { onDelete: "cascade" }),
    eventId: text("event_id").notNull()
      .references(() => campaignPlayEvents.eventId, { onDelete: "cascade" }),
    exposureId: text("exposure_id").notNull()
      .references(() => campaignPlayEventExposures.exposureId, { onDelete: "cascade" }),
    channel: text("channel", { enum: campaignPlayExposureChannelValues }).notNull(),
    sourceLocationId: text("source_location_id").references(() => locations.id, { onDelete: "restrict" }),
    sourceRouteId: text("source_route_id").references(() => locationEdges.id, { onDelete: "restrict" }),
    sourceTrigger: text("source_trigger", { enum: ["inspect", "attempt", "traverse"] }),
    sourceWitnessActorId: text("source_witness_actor_id").references(() => actors.id, { onDelete: "restrict" }),
    perceivedActorId: text("perceived_actor_id").references(() => actors.id, { onDelete: "restrict" }),
    sourceJson: text("source_json").notNull(),
    sourceHash: text("source_hash").notNull(),
    publicEntryJson: text("public_entry_json").notNull(),
    publicEntryHash: text("public_entry_hash").notNull(),
    worldTimeMinutes: integer("world_time_minutes").notNull(),
    createdAt: integer("created_at", { mode: "number" }).notNull(),
  },
  (table) => [
    uniqueIndex("campaign_play_observations_provenance_unique").on(
      table.humanActorId, table.eventId, table.exposureId, table.channel, table.sourceHash,
    ),
    index("idx_campaign_play_observations_campaign_time").on(table.campaignId, table.worldTimeMinutes),
    check("campaign_play_observations_valid", sql`${table.channel} IN ('direct_perception', 'local_aftermath', 'route_state', 'witness_report')
      AND (${table.sourceTrigger} IS NULL OR ${table.sourceTrigger} IN ('inspect', 'attempt', 'traverse'))
      AND json_valid(${table.sourceJson})
      AND json_type(${table.sourceJson}) = 'object'
      AND json_valid(${table.publicEntryJson})
      AND json_type(${table.publicEntryJson}) = 'object'
      AND length(${table.sourceHash}) = 64
      AND length(${table.publicEntryHash}) = 64
      AND ${table.worldTimeMinutes} BETWEEN 0 AND 2147483647`),
  ],
);
