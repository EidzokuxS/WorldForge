CREATE TABLE IF NOT EXISTS `clean_gameplay_stage4_receipts` (
  `receipt_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `frame_id` text NOT NULL,
  `checklist_id` text NOT NULL,
  `step_id` text NOT NULL,
  `capability_id` text NOT NULL,
  `status` text NOT NULL,
  `base_world_version` integer NOT NULL,
  `result_world_version` integer NOT NULL,
  `mutation_applied` integer NOT NULL,
  `receipt_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `clean_gameplay_stage4_receipts_campaign_step_unique` ON `clean_gameplay_stage4_receipts` (`campaign_id`, `turn_id`, `checklist_id`, `step_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_clean_gameplay_stage4_receipts_campaign_turn` ON `clean_gameplay_stage4_receipts` (`campaign_id`, `turn_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_clean_gameplay_stage4_receipts_campaign_result_version` ON `clean_gameplay_stage4_receipts` (`campaign_id`, `result_world_version`);
