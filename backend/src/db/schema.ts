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
    eventType: text("event_type").notNull(),
    summary: text("summary").notNull(),
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
