CREATE TABLE `actor_knowledge_records` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `route` text NOT NULL,
  `truth_status` text DEFAULT 'claimed' NOT NULL,
  `statement` text NOT NULL,
  `subject_refs` text DEFAULT '[]' NOT NULL,
  `source_event_ids` text DEFAULT '[]' NOT NULL,
  `source_knowledge_ids` text DEFAULT '[]' NOT NULL,
  `authority_trace_ids` text DEFAULT '[]' NOT NULL,
  `source_actor_id` text,
  `recipient_actor_ids` text DEFAULT '[]' NOT NULL,
  `confidence` integer DEFAULT 70 NOT NULL,
  `reliability` integer DEFAULT 70 NOT NULL,
  `privacy` text DEFAULT 'private' NOT NULL,
  `base_world_version` integer NOT NULL,
  `valid_from_world_version` integer NOT NULL,
  `observed_at_world_version` integer,
  `invalidated_at_world_version` integer,
  `created_world_time_minutes` integer NOT NULL,
  `delivered_world_time_minutes` integer,
  `expires_world_time_minutes` integer,
  `metadata` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_actor_knowledge_campaign_actor_route` ON `actor_knowledge_records` (`campaign_id`, `actor_id`, `route`);
--> statement-breakpoint
CREATE INDEX `idx_actor_knowledge_campaign_validity` ON `actor_knowledge_records` (`campaign_id`, `valid_from_world_version`, `invalidated_at_world_version`);
--> statement-breakpoint
CREATE INDEX `idx_actor_knowledge_source_actor` ON `actor_knowledge_records` (`campaign_id`, `source_actor_id`);
