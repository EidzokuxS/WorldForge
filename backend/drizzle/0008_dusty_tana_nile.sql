ALTER TABLE `npcs` ADD `current_scene_location_id` text REFERENCES locations(id);--> statement-breakpoint
ALTER TABLE `players` ADD `current_scene_location_id` text REFERENCES locations(id);