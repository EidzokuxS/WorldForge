CREATE TABLE `campaign_play_narration_operations` (
	`operation_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`result_id` text NOT NULL,
	`narration_id` text NOT NULL,
	`packet_hash` text NOT NULL,
	`receipt_ids_json` text NOT NULL,
	`concise_display_text` text NOT NULL,
	`concise_suggested_actions_json` text NOT NULL,
	`status` text NOT NULL,
	`current_attempt` integer DEFAULT 0 NOT NULL,
	`current_attempt_id` text,
	`error_code` text,
	`lease_owner` text,
	`lease_epoch` integer DEFAULT 0 NOT NULL,
	`lease_expires_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`narration_id`) REFERENCES `campaign_play_narrations`(`narration_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `campaign_play_narration_operations_payload_valid` CHECK(length(`operation_id`) > 0
		AND length(`result_id`) > 0
		AND length(`packet_hash`) = 64
		AND json_valid(`receipt_ids_json`)
		AND json_type(`receipt_ids_json`) = 'array'
		AND length(`concise_display_text`) > 0
		AND json_valid(`concise_suggested_actions_json`)
		AND json_type(`concise_suggested_actions_json`) = 'array'
		AND `current_attempt` >= 0
		AND `lease_epoch` >= 0),
	CONSTRAINT `campaign_play_narration_operations_status_valid` CHECK(`status` IN ('pending', 'running', 'failed', 'complete')),
	CONSTRAINT `campaign_play_narration_operations_state_consistent` CHECK((
		`status` = 'pending' AND `current_attempt_id` IS NULL AND `error_code` IS NULL
		AND `lease_owner` IS NULL AND `lease_expires_at` IS NULL AND `completed_at` IS NULL
	) OR (
		`status` = 'running' AND `current_attempt` > 0 AND `current_attempt_id` IS NOT NULL
		AND `error_code` IS NULL AND `lease_owner` IS NOT NULL AND `lease_epoch` > 0
		AND `lease_expires_at` IS NOT NULL AND `completed_at` IS NULL
	) OR (
		`status` = 'failed' AND `current_attempt` > 0 AND `current_attempt_id` IS NOT NULL
		AND `error_code` IS NOT NULL AND `lease_owner` IS NULL AND `lease_expires_at` IS NULL
		AND `completed_at` IS NULL
	) OR (
		`status` = 'complete' AND `current_attempt` > 0 AND `current_attempt_id` IS NOT NULL
		AND `error_code` IS NULL AND `lease_owner` IS NULL AND `lease_expires_at` IS NULL
		AND `completed_at` IS NOT NULL
	))
);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_operations_turn_unique` ON `campaign_play_narration_operations` (`turn_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_operations_result_unique` ON `campaign_play_narration_operations` (`result_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_operations_narration_unique` ON `campaign_play_narration_operations` (`narration_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_narration_operations_campaign_status` ON `campaign_play_narration_operations` (`campaign_id`,`status`);--> statement-breakpoint

CREATE TABLE `campaign_play_narration_attempts` (
	`attempt_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`status` text NOT NULL,
	`worker_epoch` integer NOT NULL,
	`requested_provider_id` text NOT NULL,
	`requested_model` text NOT NULL,
	`requested_strategy` text NOT NULL,
	`actual_provider_id` text,
	`actual_model` text,
	`actual_strategy` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`duration_ms` integer,
	`finish_reason` text,
	`schema_outcome` text NOT NULL,
	`artifact_hash` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`operation_id`) REFERENCES `campaign_play_narration_operations`(`operation_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `campaign_play_narration_attempts_identity_valid` CHECK(`attempt` > 0 AND `worker_epoch` > 0
		AND length(`requested_provider_id`) > 0 AND length(`requested_model`) > 0
		AND `requested_strategy` = 'strict_object' AND (`actual_strategy` IS NULL OR `actual_strategy` = 'strict_object')),
	CONSTRAINT `campaign_play_narration_attempts_status_valid` CHECK(`status` IN ('running', 'failed', 'accepted', 'stale')
		AND `schema_outcome` IN ('pending', 'valid', 'invalid', 'transport_error')),
	CONSTRAINT `campaign_play_narration_attempts_state_consistent` CHECK((
		`status` = 'running' AND `schema_outcome` = 'pending' AND `actual_provider_id` IS NULL
		AND `duration_ms` IS NULL AND `artifact_hash` IS NULL AND `error_code` IS NULL AND `completed_at` IS NULL
	) OR (
		`status` = 'accepted' AND `schema_outcome` = 'valid' AND `actual_provider_id` IS NOT NULL
		AND `actual_model` IS NOT NULL AND `actual_strategy` = 'strict_object'
		AND `input_tokens` IS NOT NULL AND `output_tokens` IS NOT NULL AND `duration_ms` IS NOT NULL
		AND `finish_reason` IS NOT NULL AND length(`artifact_hash`) = 64
		AND `error_code` IS NULL AND `completed_at` IS NOT NULL
	) OR (
		`status` IN ('failed', 'stale') AND `schema_outcome` IN ('invalid', 'transport_error')
		AND `duration_ms` IS NOT NULL AND `artifact_hash` IS NULL
		AND `error_code` IS NOT NULL AND `completed_at` IS NOT NULL
	))
);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_attempts_operation_attempt_unique` ON `campaign_play_narration_attempts` (`operation_id`,`attempt`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_attempts_operation_epoch_unique` ON `campaign_play_narration_attempts` (`operation_id`,`worker_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_attempts_running_unique` ON `campaign_play_narration_attempts` (`operation_id`) WHERE `status` = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narration_attempts_accepted_unique` ON `campaign_play_narration_attempts` (`operation_id`) WHERE `status` = 'accepted';--> statement-breakpoint
CREATE INDEX `idx_campaign_play_narration_attempts_campaign_turn` ON `campaign_play_narration_attempts` (`campaign_id`,`turn_id`,`attempt`);--> statement-breakpoint

CREATE TABLE `campaign_play_proper_scenes` (
	`narration_id` text PRIMARY KEY NOT NULL,
	`operation_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`packet_hash` text NOT NULL,
	`attempt_id` text NOT NULL,
	`beats_json` text NOT NULL,
	`display_text` text NOT NULL,
	`suggested_actions_json` text NOT NULL,
	`effects_json` text NOT NULL,
	`artifact_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`operation_id`) REFERENCES `campaign_play_narration_operations`(`operation_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`attempt_id`) REFERENCES `campaign_play_narration_attempts`(`attempt_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `campaign_play_proper_scenes_payload_valid` CHECK(length(`packet_hash`) = 64
		AND json_valid(`beats_json`) AND length(`display_text`) > 0
		AND json_valid(`suggested_actions_json`) AND json_valid(`effects_json`)
		AND length(`artifact_hash`) = 64)
);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_proper_scenes_operation_unique` ON `campaign_play_proper_scenes` (`operation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_proper_scenes_turn_unique` ON `campaign_play_proper_scenes` (`turn_id`);--> statement-breakpoint

CREATE TRIGGER `campaign_play_narration_operations_identity_immutable`
BEFORE UPDATE OF `operation_id`, `campaign_id`, `turn_id`, `result_id`, `narration_id`, `packet_hash`,
  `receipt_ids_json`, `concise_display_text`, `concise_suggested_actions_json`, `created_at`
ON `campaign_play_narration_operations`
BEGIN SELECT RAISE(ABORT, 'campaign_play_narration_operation_identity_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_narration_operations_delete_immutable`
BEFORE DELETE ON `campaign_play_narration_operations`
BEGIN SELECT RAISE(ABORT, 'campaign_play_narration_operation_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_narration_attempts_identity_immutable`
BEFORE UPDATE OF `attempt_id`, `operation_id`, `campaign_id`, `turn_id`, `attempt`, `worker_epoch`,
  `requested_provider_id`, `requested_model`, `requested_strategy`, `created_at`
ON `campaign_play_narration_attempts`
BEGIN SELECT RAISE(ABORT, 'campaign_play_narration_attempt_identity_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_narration_attempts_terminal_immutable`
BEFORE UPDATE ON `campaign_play_narration_attempts`
WHEN OLD.status IN ('failed', 'accepted', 'stale')
BEGIN SELECT RAISE(ABORT, 'campaign_play_narration_attempt_terminal_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_narration_attempts_delete_immutable`
BEFORE DELETE ON `campaign_play_narration_attempts`
BEGIN SELECT RAISE(ABORT, 'campaign_play_narration_attempt_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_proper_scenes_update_immutable`
BEFORE UPDATE ON `campaign_play_proper_scenes`
BEGIN SELECT RAISE(ABORT, 'campaign_play_proper_scene_immutable'); END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_proper_scenes_delete_immutable`
BEFORE DELETE ON `campaign_play_proper_scenes`
BEGIN SELECT RAISE(ABORT, 'campaign_play_proper_scene_immutable'); END;
