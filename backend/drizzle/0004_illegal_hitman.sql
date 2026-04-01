ALTER TABLE `npcs` ADD `character_record` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `npcs` ADD `derived_tags` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `character_record` text DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE `players` ADD `derived_tags` text DEFAULT '[]' NOT NULL;