CREATE TABLE `actor_process_states` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text NOT NULL,
	`status` text DEFAULT 'dormant' NOT NULL,
	`last_world_version` integer DEFAULT 0 NOT NULL,
	`last_wake_world_time_minutes` integer,
	`next_wake_world_time_minutes` integer,
	`memory_cursor` text,
	`process_state` text DEFAULT '{}' NOT NULL,
	`disabled_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actor_process_states_actor_unique` ON `actor_process_states` (`campaign_id`,`actor_type`,`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_actor_process_states_wake` ON `actor_process_states` (`campaign_id`,`next_wake_world_time_minutes`);--> statement-breakpoint
CREATE TABLE `authority_traces` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`operation` text NOT NULL,
	`source_entity_type` text NOT NULL,
	`source_entity_id` text,
	`base_world_version` integer NOT NULL,
	`result_world_version` integer NOT NULL,
	`world_time_minutes` integer NOT NULL,
	`elapsed_world_time_minutes` integer DEFAULT 0 NOT NULL,
	`tool_result_id` text,
	`event_ids` text DEFAULT '[]' NOT NULL,
	`state_delta_refs` text DEFAULT '[]' NOT NULL,
	`witnesses` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `authority_traces_campaign_version_unique` ON `authority_traces` (`campaign_id`,`result_world_version`);--> statement-breakpoint
CREATE INDEX `idx_authority_traces_campaign_version` ON `authority_traces` (`campaign_id`,`result_world_version`);--> statement-breakpoint
CREATE INDEX `idx_authority_traces_tool_result` ON `authority_traces` (`tool_result_id`);--> statement-breakpoint
CREATE TABLE `simulation_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`job_type` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`base_world_version` integer NOT NULL,
	`result_world_version` integer,
	`scheduled_world_time_minutes` integer NOT NULL,
	`created_world_time_minutes` integer NOT NULL,
	`source_entity_type` text NOT NULL,
	`source_entity_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`canceled_reason` text,
	`superseded_by_job_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_jobs_campaign_status` ON `simulation_jobs` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_simulation_jobs_schedule` ON `simulation_jobs` (`campaign_id`,`scheduled_world_time_minutes`);--> statement-breakpoint
CREATE INDEX `idx_simulation_jobs_base_version` ON `simulation_jobs` (`campaign_id`,`base_world_version`);--> statement-breakpoint
CREATE TABLE `simulation_proposals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`job_id` text,
	`proposal_type` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`base_world_version` integer NOT NULL,
	`proposed_world_version` integer,
	`committed_world_version` integer,
	`source_entity_type` text NOT NULL,
	`source_entity_id` text,
	`payload` text DEFAULT '{}' NOT NULL,
	`tool_result_id` text,
	`rejection_reason` text,
	`created_world_time_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `simulation_jobs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_simulation_proposals_campaign_status` ON `simulation_proposals` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_simulation_proposals_job` ON `simulation_proposals` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_simulation_proposals_base_version` ON `simulation_proposals` (`campaign_id`,`base_world_version`);--> statement-breakpoint
CREATE TABLE `world_clocks` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`world_version` integer DEFAULT 0 NOT NULL,
	`world_time_minutes` integer DEFAULT 0 NOT NULL,
	`current_tick` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "world_clocks_version_non_negative" CHECK("world_clocks"."world_version" >= 0),
	CONSTRAINT "world_clocks_time_non_negative" CHECK("world_clocks"."world_time_minutes" >= 0)
);
