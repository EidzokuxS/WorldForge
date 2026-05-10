CREATE TABLE `turn_sagas` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `player_id` text,
  `action_id` text,
  `action_text` text,
  `source_action_json` text DEFAULT '{}' NOT NULL,
  `status` text DEFAULT 'created' NOT NULL,
  `status_reason` text,
  `status_updated_at` integer NOT NULL,
  `active_lock_token` text,
  `active_worker_id` text,
  `active_started_at` integer,
  `requires_narration` integer DEFAULT true NOT NULL,
  `base_world_version` integer NOT NULL,
  `result_world_version` integer,
  `oracle_decision_id` text,
  `settled_turn_packet_id` text,
  `latest_narrator_attempt_id` text,
  `provenance_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_sagas_campaign_turn_unique` ON `turn_sagas` (`campaign_id`, `turn_id`);
--> statement-breakpoint
CREATE INDEX `idx_turn_sagas_campaign_status` ON `turn_sagas` (`campaign_id`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_turn_sagas_pending_narration` ON `turn_sagas` (`campaign_id`, `requires_narration`, `status`);
--> statement-breakpoint
CREATE INDEX `idx_turn_sagas_base_version` ON `turn_sagas` (`campaign_id`, `base_world_version`);
--> statement-breakpoint
CREATE TABLE `oracle_decisions` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `saga_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `question` text NOT NULL,
  `stakes` text NOT NULL,
  `outcome` text NOT NULL,
  `reasoning` text DEFAULT '' NOT NULL,
  `mechanical_implications_json` text DEFAULT '[]' NOT NULL,
  `visibility_implications_json` text DEFAULT '[]' NOT NULL,
  `confidence` integer,
  `chance` integer,
  `requires_tool_commit` integer DEFAULT false NOT NULL,
  `base_world_version` integer NOT NULL,
  `accepted_world_version` integer,
  `source_refs` text DEFAULT '[]' NOT NULL,
  `decision_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`saga_id`) REFERENCES `turn_sagas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_oracle_decisions_campaign_turn` ON `oracle_decisions` (`campaign_id`, `turn_id`);
--> statement-breakpoint
CREATE INDEX `idx_oracle_decisions_saga` ON `oracle_decisions` (`saga_id`);
--> statement-breakpoint
CREATE INDEX `idx_oracle_decisions_base_version` ON `oracle_decisions` (`campaign_id`, `base_world_version`);
--> statement-breakpoint
CREATE TABLE `settled_turn_packets` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `saga_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `oracle_decision_id` text,
  `canonical_turn_packet_json` text DEFAULT '{}' NOT NULL,
  `narrator_packet_json` text DEFAULT '{}' NOT NULL,
  `source_refs` text DEFAULT '[]' NOT NULL,
  `accepted_tool_result_refs` text DEFAULT '[]' NOT NULL,
  `accepted_actor_result_refs` text DEFAULT '[]' NOT NULL,
  `due_world_refs` text DEFAULT '[]' NOT NULL,
  `requires_narration` integer DEFAULT true NOT NULL,
  `base_world_version` integer NOT NULL,
  `result_world_version` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`saga_id`) REFERENCES `turn_sagas`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`oracle_decision_id`) REFERENCES `oracle_decisions`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `settled_turn_packets_saga_unique` ON `settled_turn_packets` (`saga_id`);
--> statement-breakpoint
CREATE INDEX `idx_settled_turn_packets_campaign_turn` ON `settled_turn_packets` (`campaign_id`, `turn_id`);
--> statement-breakpoint
CREATE INDEX `idx_settled_turn_packets_oracle` ON `settled_turn_packets` (`oracle_decision_id`);
--> statement-breakpoint
CREATE INDEX `idx_settled_turn_packets_result_version` ON `settled_turn_packets` (`campaign_id`, `result_world_version`);
--> statement-breakpoint
CREATE TABLE `narrator_attempts` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `saga_id` text NOT NULL,
  `settled_turn_packet_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `attempt_index` integer NOT NULL,
  `status` text DEFAULT 'started' NOT NULL,
  `grounding_result_json` text DEFAULT '{}' NOT NULL,
  `final_text` text,
  `failure_reason` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`saga_id`) REFERENCES `turn_sagas`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`settled_turn_packet_id`) REFERENCES `settled_turn_packets`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `narrator_attempts_saga_attempt_unique` ON `narrator_attempts` (`saga_id`, `attempt_index`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_attempts_packet` ON `narrator_attempts` (`settled_turn_packet_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_attempts_campaign_turn` ON `narrator_attempts` (`campaign_id`, `turn_id`);
--> statement-breakpoint
CREATE INDEX `idx_narrator_attempts_campaign_status` ON `narrator_attempts` (`campaign_id`, `status`);
--> statement-breakpoint
ALTER TABLE `simulation_jobs` ADD `idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `simulation_jobs_campaign_idempotency_unique` ON `simulation_jobs` (`campaign_id`, `idempotency_key`);
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `idempotency_key` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `simulation_proposals_campaign_idempotency_unique` ON `simulation_proposals` (`campaign_id`, `idempotency_key`);
