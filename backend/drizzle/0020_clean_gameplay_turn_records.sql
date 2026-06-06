CREATE TABLE `clean_gameplay_turn_records` (
  `record_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `internal_turn_id` text NOT NULL,
  `public_turn_id` text NOT NULL,
  `public_packet_id` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `frame_id` text NOT NULL,
  `user_message_index` integer NOT NULL,
  `assistant_message_index` integer NOT NULL,
  `user_message_sha256` text NOT NULL,
  `assistant_message_sha256` text NOT NULL,
  `record_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `clean_gameplay_turn_records_campaign_turn_unique` ON `clean_gameplay_turn_records` (`campaign_id`, `internal_turn_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `clean_gameplay_turn_records_campaign_idempotency_unique` ON `clean_gameplay_turn_records` (`campaign_id`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_clean_gameplay_turn_records_campaign_public` ON `clean_gameplay_turn_records` (`campaign_id`, `public_turn_id`, `public_packet_id`);
