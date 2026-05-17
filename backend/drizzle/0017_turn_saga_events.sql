CREATE TABLE `turn_saga_events` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `saga_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `event_type` text NOT NULL,
  `idempotency_key` text NOT NULL,
  `base_world_version` integer,
  `result_world_version` integer,
  `settled_turn_packet_id` text,
  `payload_json` text DEFAULT '{}' NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`saga_id`) REFERENCES `turn_sagas`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_saga_events_saga_type_key_unique` ON `turn_saga_events` (`saga_id`, `event_type`, `idempotency_key`);
--> statement-breakpoint
CREATE INDEX `idx_turn_saga_events_campaign_turn_type` ON `turn_saga_events` (`campaign_id`, `turn_id`, `event_type`);
--> statement-breakpoint
CREATE INDEX `idx_turn_saga_events_packet` ON `turn_saga_events` (`settled_turn_packet_id`);
