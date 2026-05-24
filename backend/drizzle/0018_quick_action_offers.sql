CREATE TABLE `quick_action_offers` (
  `id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `offer_id` text NOT NULL,
  `action_id` text NOT NULL,
  `capability` text NOT NULL,
  `label` text NOT NULL,
  `action` text NOT NULL,
  `source_refs_json` text DEFAULT '[]' NOT NULL,
  `source_evidence_digest` text NOT NULL,
  `base_world_version` integer NOT NULL,
  `world_time_minutes` integer NOT NULL,
  `created_tick` integer NOT NULL,
  `expires_at_tick` integer NOT NULL,
  `consumed_at` integer,
  `consumed_tick` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `quick_action_offers_base_version_non_negative` CHECK(`base_world_version` >= 0),
  CONSTRAINT `quick_action_offers_world_time_non_negative` CHECK(`world_time_minutes` >= 0),
  CONSTRAINT `quick_action_offers_created_tick_non_negative` CHECK(`created_tick` >= 0),
  CONSTRAINT `quick_action_offers_expires_at_tick_non_negative` CHECK(`expires_at_tick` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `quick_action_offers_capability_unique` ON `quick_action_offers` (`capability`);
--> statement-breakpoint
CREATE UNIQUE INDEX `quick_action_offers_campaign_offer_action_unique` ON `quick_action_offers` (`campaign_id`, `offer_id`, `action_id`);
--> statement-breakpoint
CREATE INDEX `idx_quick_action_offers_campaign_offer` ON `quick_action_offers` (`campaign_id`, `offer_id`);
--> statement-breakpoint
CREATE INDEX `idx_quick_action_offers_campaign_expiry` ON `quick_action_offers` (`campaign_id`, `expires_at_tick`);
