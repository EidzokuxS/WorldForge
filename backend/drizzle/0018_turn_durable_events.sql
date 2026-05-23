CREATE TABLE `turn_durable_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`status` text DEFAULT 'produced' NOT NULL,
	`tick` integer NOT NULL,
	`accepted_at` integer,
	`projected_at` integer,
	`retracted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_turn_durable_events_campaign_turn` ON `turn_durable_events` (`campaign_id`,`turn_id`);
--> statement-breakpoint
CREATE INDEX `idx_turn_durable_events_campaign_status` ON `turn_durable_events` (`campaign_id`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_turn_durable_events_turn_status` ON `turn_durable_events` (`turn_id`,`status`);
