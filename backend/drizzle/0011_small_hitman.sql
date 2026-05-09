CREATE TABLE `faction_command_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`faction_id` text NOT NULL,
	`label` text NOT NULL,
	`location_id` text,
	`authority_actor_id` text,
	`status` text DEFAULT 'active' NOT NULL,
	`standing_orders` text DEFAULT '[]' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `factions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`authority_actor_id`) REFERENCES `npcs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_faction_command_nodes_campaign` ON `faction_command_nodes` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_faction_command_nodes_faction` ON `faction_command_nodes` (`campaign_id`,`faction_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `faction_command_nodes_default_unique` ON `faction_command_nodes` (`campaign_id`,`faction_id`,`label`);--> statement-breakpoint
CREATE TABLE `faction_operations` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`faction_id` text NOT NULL,
	`command_node_id` text NOT NULL,
	`status` text DEFAULT 'proposed' NOT NULL,
	`operation_kind` text NOT NULL,
	`summary` text NOT NULL,
	`required_report_ids` text DEFAULT '[]' NOT NULL,
	`resource_costs` text DEFAULT '{}' NOT NULL,
	`target_location_id` text,
	`base_world_version` integer NOT NULL,
	`committed_world_version` integer,
	`authority_trace_id` text,
	`blocked_reason` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `factions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`command_node_id`) REFERENCES `faction_command_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`target_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_faction_operations_campaign_status` ON `faction_operations` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_faction_operations_command_node` ON `faction_operations` (`campaign_id`,`command_node_id`);--> statement-breakpoint
CREATE INDEX `idx_faction_operations_base_version` ON `faction_operations` (`campaign_id`,`base_world_version`);--> statement-breakpoint
CREATE TABLE `faction_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`faction_id` text NOT NULL,
	`command_node_id` text NOT NULL,
	`source_actor_id` text,
	`source_location_id` text,
	`route` text NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`summary` text NOT NULL,
	`source_event_ids` text DEFAULT '[]' NOT NULL,
	`source_knowledge_ids` text DEFAULT '[]' NOT NULL,
	`hidden_cause_terms` text DEFAULT '[]' NOT NULL,
	`base_world_version` integer NOT NULL,
	`created_world_time_minutes` integer NOT NULL,
	`deliver_at_world_time_minutes` integer NOT NULL,
	`delivered_world_time_minutes` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `factions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`command_node_id`) REFERENCES `faction_command_nodes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_actor_id`) REFERENCES `npcs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`source_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_faction_reports_campaign_node_status` ON `faction_reports` (`campaign_id`,`command_node_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_faction_reports_delivery` ON `faction_reports` (`campaign_id`,`deliver_at_world_time_minutes`);--> statement-breakpoint
CREATE INDEX `idx_faction_reports_base_version` ON `faction_reports` (`campaign_id`,`base_world_version`);--> statement-breakpoint
CREATE TABLE `faction_resource_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`faction_id` text NOT NULL,
	`operation_id` text,
	`resource_key` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`base_world_version` integer NOT NULL,
	`result_world_version` integer,
	`created_world_time_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `factions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`operation_id`) REFERENCES `faction_operations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_faction_resource_ledger_campaign` ON `faction_resource_ledger` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `idx_faction_resource_ledger_operation` ON `faction_resource_ledger` (`operation_id`);--> statement-breakpoint
CREATE TABLE `faction_resources` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`faction_id` text NOT NULL,
	`resource_key` text NOT NULL,
	`label` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`reserved_quantity` integer DEFAULT 0 NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`faction_id`) REFERENCES `factions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_faction_resources_campaign` ON `faction_resources` (`campaign_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `faction_resources_key_unique` ON `faction_resources` (`campaign_id`,`faction_id`,`resource_key`);--> statement-breakpoint
CREATE TABLE `world_thread_events` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`thread_id` text NOT NULL,
	`event_type` text NOT NULL,
	`summary` text NOT NULL,
	`visibility` text DEFAULT 'signal_only' NOT NULL,
	`surface_route` text,
	`location_id` text,
	`source_event_ids` text DEFAULT '[]' NOT NULL,
	`source_authority_trace_ids` text DEFAULT '[]' NOT NULL,
	`world_version` integer NOT NULL,
	`world_time_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `world_threads`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_world_thread_events_thread` ON `world_thread_events` (`thread_id`);--> statement-breakpoint
CREATE INDEX `idx_world_thread_events_campaign_time` ON `world_thread_events` (`campaign_id`,`world_time_minutes`);--> statement-breakpoint
CREATE TABLE `world_threads` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`stage` text NOT NULL,
	`visibility` text DEFAULT 'signal_only' NOT NULL,
	`pressure` integer DEFAULT 0 NOT NULL,
	`hidden_cause` text,
	`hidden_cause_terms` text DEFAULT '[]' NOT NULL,
	`involved_actor_ids` text DEFAULT '[]' NOT NULL,
	`involved_faction_ids` text DEFAULT '[]' NOT NULL,
	`source_event_ids` text DEFAULT '[]' NOT NULL,
	`source_authority_trace_ids` text DEFAULT '[]' NOT NULL,
	`surface_routes` text DEFAULT '[]' NOT NULL,
	`current_location_id` text,
	`next_due_world_time_minutes` integer,
	`base_world_version` integer NOT NULL,
	`last_advanced_world_version` integer NOT NULL,
	`created_world_time_minutes` integer NOT NULL,
	`updated_world_time_minutes` integer NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`current_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_world_threads_campaign_status` ON `world_threads` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_world_threads_due` ON `world_threads` (`campaign_id`,`next_due_world_time_minutes`);--> statement-breakpoint
CREATE INDEX `idx_world_threads_location` ON `world_threads` (`campaign_id`,`current_location_id`);--> statement-breakpoint
CREATE INDEX `idx_world_threads_base_version` ON `world_threads` (`campaign_id`,`base_world_version`);--> statement-breakpoint
ALTER TABLE `location_recent_events` ADD `thread_id` text;--> statement-breakpoint
ALTER TABLE `location_recent_events` ADD `surface_route` text;--> statement-breakpoint
ALTER TABLE `location_recent_events` ADD `visibility` text DEFAULT 'player_perceivable' NOT NULL;--> statement-breakpoint
ALTER TABLE `location_recent_events` ADD `knowledge_route` text;--> statement-breakpoint
ALTER TABLE `location_recent_events` ADD `hidden_cause_terms` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_thread` ON `location_recent_events` (`thread_id`);