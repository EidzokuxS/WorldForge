ALTER TABLE `simulation_proposals` ADD `proposal_disposition` text DEFAULT 'pending' NOT NULL;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `disposition_reason` text;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `due_at_world_time_minutes` integer;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `expiry_policy` text DEFAULT 'reject_when_expired' NOT NULL;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `priority` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `intended_tools` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `superseded_by_proposal_id` text;
--> statement-breakpoint
ALTER TABLE `simulation_proposals` ADD `lifecycle_metadata` text DEFAULT '{}' NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_simulation_proposals_disposition` ON `simulation_proposals` (`campaign_id`, `proposal_disposition`);
--> statement-breakpoint
CREATE INDEX `idx_simulation_proposals_due_priority` ON `simulation_proposals` (`campaign_id`, `due_at_world_time_minutes`, `priority`);
