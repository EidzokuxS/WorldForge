CREATE TABLE `quick_action_offers` (
	`action_id` text NOT NULL,
	`offer_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`label` text NOT NULL,
	`action` text NOT NULL,
	`source_refs` text DEFAULT '[]' NOT NULL,
	`source_evidence_digest` text NOT NULL,
	`tick` integer NOT NULL,
	`expires_at_tick` integer NOT NULL,
	`base_world_version` integer NOT NULL,
	`consumed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY(`campaign_id`, `offer_id`, `action_id`),
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_quick_action_offers_campaign_offer` ON `quick_action_offers` (`campaign_id`,`offer_id`);
--> statement-breakpoint
CREATE INDEX `idx_quick_action_offers_campaign_expiry` ON `quick_action_offers` (`campaign_id`,`expires_at_tick`);
