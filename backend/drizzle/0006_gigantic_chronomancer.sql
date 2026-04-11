ALTER TABLE `location_recent_events` ADD `source_event_id` text;--> statement-breakpoint
CREATE INDEX `idx_location_recent_events_source_event` ON `location_recent_events` (`source_event_id`);