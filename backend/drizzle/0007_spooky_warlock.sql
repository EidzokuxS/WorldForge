ALTER TABLE `items` ADD `equip_state` text DEFAULT 'carried' NOT NULL;--> statement-breakpoint
ALTER TABLE `items` ADD `equipped_slot` text;--> statement-breakpoint
ALTER TABLE `items` ADD `is_signature` integer DEFAULT false NOT NULL;