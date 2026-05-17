ALTER TABLE `settled_turn_packets` ADD `accepted_durable_event_ids` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `settled_turn_packets` ADD `produced_durable_event_ids` text DEFAULT '[]' NOT NULL;
