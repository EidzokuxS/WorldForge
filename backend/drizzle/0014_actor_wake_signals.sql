CREATE TABLE `actor_wake_signals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`signal_type` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text,
	`summary` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`required_before_done` integer DEFAULT false NOT NULL,
	`due_world_time_minutes` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_actor_wake_signals_campaign_status_due` ON `actor_wake_signals` (`campaign_id`,`status`,`due_world_time_minutes`,`priority`);--> statement-breakpoint
CREATE INDEX `idx_actor_wake_signals_actor` ON `actor_wake_signals` (`campaign_id`,`actor_type`,`actor_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_actor_wake_signals_source` ON `actor_wake_signals` (`campaign_id`,`source_type`,`source_id`,`signal_type`);
