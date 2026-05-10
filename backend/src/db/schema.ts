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

export const simulationProposalDispositionValues = [
  "pending",
  "committed",
  "rejected_invalid",
  "expired_stale_version",
  "deferred_not_due",
  "superseded_by_new_event",
  "needs_rebase",
  "needs_actor_retry",
] as const;

export const simulationProposalExpiryPolicyValues = [
  "reject_when_expired",
  "ignore_expiry",
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
  },
  (table) => [
    index("idx_locations_campaign").on(table.campaignId),
    index("idx_locations_campaign_kind").on(table.campaignId, table.kind),
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
  },
  (table) => [
    index("idx_location_edges_campaign").on(table.campaignId),
    index("idx_location_edges_from").on(table.campaignId, table.fromLocationId),
    index("idx_location_edges_to").on(table.campaignId, table.toLocationId),
    uniqueIndex("location_edges_campaign_from_to_unique").on(
      table.campaignId,
      table.fromLocationId,
      table.toLocationId
    ),
  ]
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
      enum: ["pending", "committed", "rejected", "canceled", "superseded"],
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
