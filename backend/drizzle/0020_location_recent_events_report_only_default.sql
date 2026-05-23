PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_location_recent_events` (
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
	`source_event_id` text,
	`thread_id` text,
	`surface_route` text,
	`visibility` text DEFAULT 'report_only' NOT NULL,
	`knowledge_route` text,
	`hidden_cause_terms` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`anchor_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_location_recent_events` (
	`id`,
	`campaign_id`,
	`location_id`,
	`source_location_id`,
	`anchor_location_id`,
	`event_type`,
	`summary`,
	`tick`,
	`importance`,
	`archived_at_tick`,
	`created_at`,
	`source_event_id`,
	`thread_id`,
	`surface_route`,
	`visibility`,
	`knowledge_route`,
	`hidden_cause_terms`
)
SELECT
	`id`,
	`campaign_id`,
	`location_id`,
	`source_location_id`,
	`anchor_location_id`,
	`event_type`,
	`summary`,
	`tick`,
	`importance`,
	`archived_at_tick`,
	`created_at`,
	`source_event_id`,
	`thread_id`,
	`surface_route`,
	`visibility`,
	`knowledge_route`,
	`hidden_cause_terms`
FROM `location_recent_events`;
--> statement-breakpoint
DROP TABLE `location_recent_events`;
--> statement-breakpoint
ALTER TABLE `__new_location_recent_events` RENAME TO `location_recent_events`;
--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_campaign` ON `location_recent_events` (`campaign_id`);
--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_location_tick` ON `location_recent_events` (`campaign_id`,`location_id`,`tick`);
--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_source_location_tick` ON `location_recent_events` (`campaign_id`,`source_location_id`,`tick`);
--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_source_event` ON `location_recent_events` (`source_event_id`);
--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_thread` ON `location_recent_events` (`thread_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
