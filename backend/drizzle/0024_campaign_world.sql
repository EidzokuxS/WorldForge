CREATE TABLE `actor_goals` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`objective` text NOT NULL,
	`motivation` text NOT NULL,
	`horizon` text NOT NULL,
	`priority` integer NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "actor_goals_priority_range" CHECK("actor_goals"."priority" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `idx_actor_goals_campaign` ON `actor_goals` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_actor_goals_actor` ON `actor_goals` (`actor_id`);--> statement-breakpoint
CREATE TABLE `actor_placements` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`location_id` text NOT NULL,
	`placement_kind` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `actor_placements_actor_location_kind_unique` ON `actor_placements` (`actor_id`,`location_id`,`placement_kind`);--> statement-breakpoint
CREATE INDEX `idx_actor_placements_campaign` ON `actor_placements` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_actor_placements_actor` ON `actor_placements` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_actor_placements_location` ON `actor_placements` (`location_id`);--> statement-breakpoint
CREATE TABLE `actor_relations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`source_actor_id` text NOT NULL,
	`target_actor_id` text NOT NULL,
	`relation_type` text NOT NULL,
	`summary` text NOT NULL,
	`intensity` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "actor_relations_distinct_endpoints" CHECK("actor_relations"."source_actor_id" <> "actor_relations"."target_actor_id"),
	CONSTRAINT "actor_relations_intensity_range" CHECK("actor_relations"."intensity" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `idx_actor_relations_campaign` ON `actor_relations` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_actor_relations_source` ON `actor_relations` (`source_actor_id`);--> statement-breakpoint
CREATE INDEX `idx_actor_relations_target` ON `actor_relations` (`target_actor_id`);--> statement-breakpoint
CREATE TABLE `actors` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`kind` text NOT NULL,
	`controller` text NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`summary` text NOT NULL,
	`traits` text DEFAULT '[]' NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_actors_campaign` ON `actors` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_actors_campaign_kind_role` ON `actors` (`campaign_id`,`kind`,`role`);--> statement-breakpoint
CREATE TABLE `campaign_world_build_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`build_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`stage` text,
	`payload_json` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`build_id`) REFERENCES `campaign_world_builds`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_world_build_events_sequence_positive" CHECK("campaign_world_build_events"."sequence" > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_world_build_events_build_sequence_unique` ON `campaign_world_build_events` (`build_id`,`sequence`);--> statement-breakpoint
CREATE INDEX `idx_campaign_world_build_events_campaign` ON `campaign_world_build_events` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_world_build_events_build` ON `campaign_world_build_events` (`build_id`);--> statement-breakpoint
CREATE TABLE `campaign_world_build_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`build_id` text NOT NULL,
	`stage` text NOT NULL,
	`requested_mode` text NOT NULL,
	`primary_strategy` text NOT NULL,
	`actual_strategy` text,
	`total_attempts` integer NOT NULL,
	`repair_used` integer DEFAULT false NOT NULL,
	`retry_used` integer DEFAULT false NOT NULL,
	`text_fallback_used` integer DEFAULT false NOT NULL,
	`response_model` text,
	`finish_reason` text,
	`error_code` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`total_tokens` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`build_id`) REFERENCES `campaign_world_builds`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_world_build_stages_attempts_positive" CHECK("campaign_world_build_stages"."total_attempts" > 0),
	CONSTRAINT "campaign_world_build_stages_strategy_flags_boolean" CHECK("campaign_world_build_stages"."repair_used" IN (0, 1) AND "campaign_world_build_stages"."retry_used" IN (0, 1) AND "campaign_world_build_stages"."text_fallback_used" IN (0, 1))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_world_build_stages_build_stage_unique` ON `campaign_world_build_stages` (`build_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_campaign_world_build_stages_campaign` ON `campaign_world_build_stages` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_world_build_stages_build` ON `campaign_world_build_stages` (`build_id`);--> statement-breakpoint
CREATE TABLE `campaign_world_builds` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`stage` text DEFAULT 'world_frame' NOT NULL,
	`source_digest` text NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`provider_id` text NOT NULL,
	`model` text NOT NULL,
	`error_code` text,
	`started_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_world_builds_running_unique` ON `campaign_world_builds` (`campaign_id`) WHERE "campaign_world_builds"."status" = 'running';--> statement-breakpoint
CREATE INDEX `idx_campaign_world_builds_campaign_status` ON `campaign_world_builds` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_campaign_world_builds_campaign_started` ON `campaign_world_builds` (`campaign_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `campaign_worlds` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`world_version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`source_digest` text NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`world_summary` text NOT NULL,
	`built_at` integer NOT NULL,
	`accepted_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_worlds_version_positive" CHECK("campaign_worlds"."world_version" >= 1),
	CONSTRAINT "campaign_worlds_acceptance_consistent" CHECK(("campaign_worlds"."status" = 'review' AND "campaign_worlds"."accepted_at" IS NULL) OR ("campaign_worlds"."status" = 'accepted' AND "campaign_worlds"."accepted_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE `world_pressure_actors` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`pressure_id` text NOT NULL,
	`actor_id` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pressure_id`) REFERENCES `world_pressures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_pressure_actors_pressure_actor_unique` ON `world_pressure_actors` (`pressure_id`,`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_world_pressure_actors_campaign` ON `world_pressure_actors` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_world_pressure_actors_actor` ON `world_pressure_actors` (`actor_id`);--> statement-breakpoint
CREATE TABLE `world_pressure_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`pressure_id` text NOT NULL,
	`location_id` text NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pressure_id`) REFERENCES `world_pressures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `world_pressure_locations_pressure_location_unique` ON `world_pressure_locations` (`pressure_id`,`location_id`);--> statement-breakpoint
CREATE INDEX `idx_world_pressure_locations_campaign` ON `world_pressure_locations` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_world_pressure_locations_location` ON `world_pressure_locations` (`location_id`);--> statement-breakpoint
CREATE TABLE `world_pressures` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`trajectory` text NOT NULL,
	`urgency` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "world_pressures_urgency_range" CHECK("world_pressures"."urgency" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE INDEX `idx_world_pressures_campaign` ON `world_pressures` (`campaign_id`);