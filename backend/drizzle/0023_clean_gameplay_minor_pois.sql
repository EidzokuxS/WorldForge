CREATE TABLE IF NOT EXISTS `clean_gameplay_minor_pois` (
  `poi_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `poi_ref` text NOT NULL,
  `poi_label` text NOT NULL,
  `poi_kind` text NOT NULL,
  `anchor_location_id` text NOT NULL,
  `anchor_scene_location_id` text NOT NULL,
  `active` integer NOT NULL,
  `applied_receipt_id` text,
  `base_world_version` integer NOT NULL,
  `result_world_version` integer NOT NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`anchor_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`anchor_scene_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE cascade,
  CHECK (`active` IN (0, 1))
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_clean_minor_pois_campaign_scene_active` ON `clean_gameplay_minor_pois` (`campaign_id`, `anchor_scene_location_id`, `active`);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `clean_minor_pois_active_ref_unique` ON `clean_gameplay_minor_pois` (`campaign_id`, `anchor_scene_location_id`, `poi_ref`) WHERE `active` = 1;
