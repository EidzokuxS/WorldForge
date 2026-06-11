CREATE TABLE IF NOT EXISTS `clean_gameplay_actor_conditions` (
  `condition_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `actor_type` text NOT NULL,
  `player_id` text NOT NULL,
  `condition_key` text NOT NULL,
  `condition_label` text NOT NULL,
  `condition_group` text NOT NULL,
  `condition_scope` text NOT NULL,
  `anchor_location_id` text NOT NULL,
  `anchor_scene_location_id` text NOT NULL,
  `target_kind` text NOT NULL,
  `target_ref` text,
  `target_label` text,
  `active` integer NOT NULL,
  `applied_receipt_id` text,
  `cleared_receipt_id` text,
  `base_world_version` integer NOT NULL,
  `result_world_version` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`player_id`) REFERENCES `players`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`anchor_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`anchor_scene_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`actor_type` = 'player'),
  CHECK (`condition_scope` = 'current_scene'),
  CHECK (`active` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_clean_actor_conditions_campaign_player_active` ON `clean_gameplay_actor_conditions` (`campaign_id`, `player_id`, `active`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_clean_actor_conditions_campaign_scene_active` ON `clean_gameplay_actor_conditions` (`campaign_id`, `anchor_scene_location_id`, `active`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `clean_actor_conditions_active_key_unique` ON `clean_gameplay_actor_conditions` (`campaign_id`, `player_id`, `condition_key`, `condition_scope`, `anchor_scene_location_id`) WHERE `active` = 1;
