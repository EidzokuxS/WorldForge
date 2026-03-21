import {
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
    tags: text("tags").notNull().default("[]"),
    isStarting: integer("is_starting", { mode: "boolean" })
      .notNull()
      .default(false),
    connectedTo: text("connected_to").notNull().default("[]"),
  },
  (table) => [index("idx_locations_campaign").on(table.campaignId)]
);

export const players = sqliteTable(
  "players",
  {
    id: text("id").primaryKey(),
    campaignId: text("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    hp: integer("hp").notNull().default(5),
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
