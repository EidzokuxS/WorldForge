CREATE TABLE `location_edges` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`from_location_id` text NOT NULL,
	`to_location_id` text NOT NULL,
	`travel_cost` integer DEFAULT 1 NOT NULL,
	`discovered` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`from_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`to_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_location_edges_campaign` ON `location_edges` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_location_edges_from` ON `location_edges` (`campaign_id`,`from_location_id`);--> statement-breakpoint
CREATE INDEX `idx_location_edges_to` ON `location_edges` (`campaign_id`,`to_location_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `location_edges_campaign_from_to_unique` ON `location_edges` (`campaign_id`,`from_location_id`,`to_location_id`);--> statement-breakpoint
CREATE TABLE `location_recent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`location_id` text NOT NULL,
	`source_location_id` text,
	`anchor_location_id` text,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`tick` integer NOT NULL,
	`importance` integer DEFAULT 1 NOT NULL,
	`archived_at_tick` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`anchor_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_campaign` ON `location_recent_events` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_location_tick` ON `location_recent_events` (`campaign_id`,`location_id`,`tick`);--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_source_location_tick` ON `location_recent_events` (`campaign_id`,`source_location_id`,`tick`);--> statement-breakpoint
ALTER TABLE `locations` ADD `kind` text DEFAULT 'macro' NOT NULL;--> statement-breakpoint
ALTER TABLE `locations` ADD `parent_location_id` text REFERENCES locations(id);--> statement-breakpoint
ALTER TABLE `locations` ADD `anchor_location_id` text REFERENCES locations(id);--> statement-breakpoint
ALTER TABLE `locations` ADD `persistence` text DEFAULT 'persistent' NOT NULL;--> statement-breakpoint
ALTER TABLE `locations` ADD `expires_at_tick` integer;--> statement-breakpoint
ALTER TABLE `locations` ADD `archived_at_tick` integer;--> statement-breakpoint
CREATE INDEX `idx_locations_campaign_kind` ON `locations` (`campaign_id`,`kind`);--> statement-breakpoint
CREATE INDEX `idx_locations_parent_location` ON `locations` (`parent_location_id`);--> statement-breakpoint
CREATE INDEX `idx_locations_anchor_location` ON `locations` (`anchor_location_id`);