PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_chronicle` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`tick` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_chronicle`("id", "campaign_id", "tick", "text", "created_at") SELECT "id", "campaign_id", "tick", "text", "created_at" FROM `chronicle`;--> statement-breakpoint
DROP TABLE `chronicle`;--> statement-breakpoint
ALTER TABLE `__new_chronicle` RENAME TO `chronicle`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_chronicle_campaign` ON `chronicle` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_chronicle_tick` ON `chronicle` (`tick`);--> statement-breakpoint
CREATE TABLE `__new_factions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`goals` text DEFAULT '[]' NOT NULL,
	`assets` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_factions`("id", "campaign_id", "name", "tags", "goals", "assets") SELECT "id", "campaign_id", "name", "tags", "goals", "assets" FROM `factions`;--> statement-breakpoint
DROP TABLE `factions`;--> statement-breakpoint
ALTER TABLE `__new_factions` RENAME TO `factions`;--> statement-breakpoint
CREATE INDEX `idx_factions_campaign` ON `factions` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `__new_items` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`owner_id` text,
	`location_id` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_items`("id", "campaign_id", "name", "tags", "owner_id", "location_id") SELECT "id", "campaign_id", "name", "tags", "owner_id", "location_id" FROM `items`;--> statement-breakpoint
DROP TABLE `items`;--> statement-breakpoint
ALTER TABLE `__new_items` RENAME TO `items`;--> statement-breakpoint
CREATE INDEX `idx_items_campaign` ON `items` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `__new_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`connected_to` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_locations`("id", "campaign_id", "name", "description", "tags", "connected_to") SELECT "id", "campaign_id", "name", "description", "tags", "connected_to" FROM `locations`;--> statement-breakpoint
DROP TABLE `locations`;--> statement-breakpoint
ALTER TABLE `__new_locations` RENAME TO `locations`;--> statement-breakpoint
CREATE INDEX `idx_locations_campaign` ON `locations` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `__new_npcs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`persona` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`tier` text NOT NULL,
	`current_location_id` text,
	`goals` text DEFAULT '{"short_term":[],"long_term":[]}' NOT NULL,
	`beliefs` text DEFAULT '[]' NOT NULL,
	`unprocessed_importance` integer DEFAULT 0 NOT NULL,
	`inactive_ticks` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_npcs`("id", "campaign_id", "name", "persona", "tags", "tier", "current_location_id", "goals", "beliefs", "unprocessed_importance", "inactive_ticks", "created_at") SELECT "id", "campaign_id", "name", "persona", "tags", "tier", "current_location_id", "goals", "beliefs", "unprocessed_importance", "inactive_ticks", "created_at" FROM `npcs`;--> statement-breakpoint
DROP TABLE `npcs`;--> statement-breakpoint
ALTER TABLE `__new_npcs` RENAME TO `npcs`;--> statement-breakpoint
CREATE INDEX `idx_npcs_campaign` ON `npcs` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `__new_players` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`hp` integer DEFAULT 5 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`equipped_items` text DEFAULT '[]' NOT NULL,
	`current_location_id` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "players_hp_range_check" CHECK("__new_players"."hp" >= 0 AND "__new_players"."hp" <= 5)
);
--> statement-breakpoint
INSERT INTO `__new_players`("id", "campaign_id", "name", "hp", "tags", "equipped_items", "current_location_id") SELECT "id", "campaign_id", "name", "hp", "tags", "equipped_items", "current_location_id" FROM `players`;--> statement-breakpoint
DROP TABLE `players`;--> statement-breakpoint
ALTER TABLE `__new_players` RENAME TO `players`;--> statement-breakpoint
CREATE INDEX `idx_players_campaign` ON `players` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `__new_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`entity_a` text NOT NULL,
	`entity_b` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`reason` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_relationships`("id", "campaign_id", "entity_a", "entity_b", "tags", "reason") SELECT "id", "campaign_id", "entity_a", "entity_b", "tags", "reason" FROM `relationships`;--> statement-breakpoint
DROP TABLE `relationships`;--> statement-breakpoint
ALTER TABLE `__new_relationships` RENAME TO `relationships`;--> statement-breakpoint
CREATE INDEX `idx_relationships_campaign` ON `relationships` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_campaign_entity_unique` ON `relationships` (`campaign_id`,`entity_a`,`entity_b`);