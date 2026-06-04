CREATE TABLE `turn_clock_ledger` (
  `clock_receipt_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `ui_turn_ordinal` integer NOT NULL,
  `base_world_version` integer NOT NULL,
  `result_world_version` integer NOT NULL,
  `delta_minutes` integer DEFAULT 0 NOT NULL,
  `reason_kind` text NOT NULL,
  `source_receipt_ref` text,
  `result_world_time_minutes` integer NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `turn_clock_ledger_ui_turn_non_negative` CHECK(`ui_turn_ordinal` >= 0),
  CONSTRAINT `turn_clock_ledger_base_version_non_negative` CHECK(`base_world_version` >= 0),
  CONSTRAINT `turn_clock_ledger_result_version_non_negative` CHECK(`result_world_version` >= 0),
  CONSTRAINT `turn_clock_ledger_delta_non_negative` CHECK(`delta_minutes` >= 0),
  CONSTRAINT `turn_clock_ledger_time_non_negative` CHECK(`result_world_time_minutes` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `turn_clock_ledger_campaign_source_unique` ON `turn_clock_ledger` (`campaign_id`, `source_receipt_ref`);
--> statement-breakpoint
CREATE INDEX `idx_turn_clock_ledger_campaign_turn` ON `turn_clock_ledger` (`campaign_id`, `turn_id`, `ui_turn_ordinal`);
--> statement-breakpoint
CREATE INDEX `idx_turn_clock_ledger_campaign_version` ON `turn_clock_ledger` (`campaign_id`, `result_world_version`);
