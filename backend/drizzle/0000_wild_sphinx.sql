CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`premise` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chronicle` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`tick` integer NOT NULL,
	`text` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `factions` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`goals` text DEFAULT '[]' NOT NULL,
	`assets` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `items` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`owner_id` text,
	`location_id` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`connected_to` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `npcs` (
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
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `players` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`hp` integer DEFAULT 5 NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`equipped_items` text DEFAULT '[]' NOT NULL,
	`current_location_id` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "players_hp_range_check" CHECK("players"."hp" >= 0 AND "players"."hp" <= 5)
);
--> statement-breakpoint
CREATE TABLE `relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`entity_a` text NOT NULL,
	`entity_b` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`reason` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `relationships_campaign_entity_unique` ON `relationships` (`campaign_id`,`entity_a`,`entity_b`);