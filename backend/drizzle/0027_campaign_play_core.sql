CREATE TABLE `campaign_play_characters` (
	`actor_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`record_json` text NOT NULL,
	`record_hash` text NOT NULL,
	`source_kind` text NOT NULL,
	`source_digest` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_characters_source_kind_valid" CHECK("campaign_play_characters"."source_kind" IN ('created', 'generated', 'character_card', 'research')),
	CONSTRAINT "campaign_play_characters_record_valid" CHECK(json_valid("campaign_play_characters"."record_json") AND json_type("campaign_play_characters"."record_json") = 'object'),
	CONSTRAINT "campaign_play_characters_hashes_valid" CHECK(length("campaign_play_characters"."record_hash") = 64 AND length("campaign_play_characters"."source_digest") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_characters_campaign_unique` ON `campaign_play_characters` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `campaign_play_model_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`attempt` integer NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text,
	`kind` text NOT NULL,
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
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_model_stages_enums_valid" CHECK("campaign_play_model_stages"."kind" IN (
          'judge',
          'game_master',
          'opening_planner',
          'actor_replanner',
          'narrator'
        )
        AND "campaign_play_model_stages"."status" IN ('started', 'accepted', 'interrupted', 'failed')
        AND "campaign_play_model_stages"."schema_outcome" IN (
          'pending',
          'valid',
          'invalid',
          'transport_error'
        )
        AND (
          "campaign_play_model_stages"."error_code" IS NULL
          OR "campaign_play_model_stages"."error_code" IN (
            'invalid_input',
            'worker_lease_lost',
            'stale_artifact',
            'model_contract_invalid',
            'stage_budget_exceeded',
            'stage_timeout',
            'rulebook_denied',
            'persistence_failed',
            'provider_unavailable',
            'narration_invalid'
          )
        )),
	CONSTRAINT "campaign_play_model_stages_identity_valid" CHECK(length("campaign_play_model_stages"."stage_id") > 0
        AND "campaign_play_model_stages"."attempt" > 0
        AND "campaign_play_model_stages"."worker_epoch" > 0
        AND length("campaign_play_model_stages"."requested_provider_id") > 0
        AND length("campaign_play_model_stages"."requested_model") > 0
        AND "campaign_play_model_stages"."requested_strategy" = 'strict_object'
        AND ("campaign_play_model_stages"."actual_strategy" IS NULL OR "campaign_play_model_stages"."actual_strategy" = 'strict_object')),
	CONSTRAINT "campaign_play_model_stages_actual_evidence_consistent" CHECK((
          "campaign_play_model_stages"."actual_provider_id" IS NULL
          AND "campaign_play_model_stages"."actual_model" IS NULL
          AND "campaign_play_model_stages"."actual_strategy" IS NULL
        ) OR (
          "campaign_play_model_stages"."actual_provider_id" IS NOT NULL
          AND "campaign_play_model_stages"."actual_model" IS NOT NULL
          AND "campaign_play_model_stages"."actual_strategy" = 'strict_object'
        )),
	CONSTRAINT "campaign_play_model_stages_usage_valid" CHECK(("campaign_play_model_stages"."input_tokens" IS NULL OR "campaign_play_model_stages"."input_tokens" >= 0)
        AND ("campaign_play_model_stages"."output_tokens" IS NULL OR "campaign_play_model_stages"."output_tokens" >= 0)
        AND ("campaign_play_model_stages"."duration_ms" IS NULL OR "campaign_play_model_stages"."duration_ms" >= 0)
        AND ("campaign_play_model_stages"."artifact_hash" IS NULL OR length("campaign_play_model_stages"."artifact_hash") = 64)),
	CONSTRAINT "campaign_play_model_stages_status_consistent" CHECK((
          "campaign_play_model_stages"."status" = 'started'
          AND "campaign_play_model_stages"."schema_outcome" = 'pending'
          AND "campaign_play_model_stages"."actual_provider_id" IS NULL
          AND "campaign_play_model_stages"."input_tokens" IS NULL
          AND "campaign_play_model_stages"."output_tokens" IS NULL
          AND "campaign_play_model_stages"."duration_ms" IS NULL
          AND "campaign_play_model_stages"."finish_reason" IS NULL
          AND "campaign_play_model_stages"."artifact_hash" IS NULL
          AND "campaign_play_model_stages"."error_code" IS NULL
          AND "campaign_play_model_stages"."completed_at" IS NULL
        ) OR (
          "campaign_play_model_stages"."status" = 'accepted'
          AND "campaign_play_model_stages"."schema_outcome" = 'valid'
          AND "campaign_play_model_stages"."actual_provider_id" IS NOT NULL
          AND "campaign_play_model_stages"."input_tokens" IS NOT NULL
          AND "campaign_play_model_stages"."output_tokens" IS NOT NULL
          AND "campaign_play_model_stages"."duration_ms" IS NOT NULL
          AND "campaign_play_model_stages"."finish_reason" IS NOT NULL
          AND "campaign_play_model_stages"."artifact_hash" IS NOT NULL
          AND "campaign_play_model_stages"."error_code" IS NULL
          AND "campaign_play_model_stages"."completed_at" IS NOT NULL
        ) OR (
          "campaign_play_model_stages"."status" = 'interrupted'
          AND "campaign_play_model_stages"."schema_outcome" = 'transport_error'
          AND "campaign_play_model_stages"."duration_ms" IS NOT NULL
          AND "campaign_play_model_stages"."artifact_hash" IS NULL
          AND "campaign_play_model_stages"."error_code" IS NOT NULL
          AND "campaign_play_model_stages"."completed_at" IS NOT NULL
        ) OR (
          "campaign_play_model_stages"."status" = 'failed'
          AND "campaign_play_model_stages"."schema_outcome" IN ('invalid', 'transport_error')
          AND "campaign_play_model_stages"."duration_ms" IS NOT NULL
          AND "campaign_play_model_stages"."artifact_hash" IS NULL
          AND "campaign_play_model_stages"."error_code" IS NOT NULL
          AND "campaign_play_model_stages"."completed_at" IS NOT NULL
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_attempt_unique` ON `campaign_play_model_stages` (`stage_id`,`attempt`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_epoch_unique` ON `campaign_play_model_stages` (`stage_id`,`worker_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_started_unique` ON `campaign_play_model_stages` (`stage_id`) WHERE "campaign_play_model_stages"."status" = 'started';--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_accepted_unique` ON `campaign_play_model_stages` (`stage_id`) WHERE "campaign_play_model_stages"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX `idx_campaign_play_model_stages_campaign_turn_kind_attempt` ON `campaign_play_model_stages` (`campaign_id`,`turn_id`,`kind`,`attempt`);--> statement-breakpoint
CREATE TABLE `campaign_play_narrations` (
	`narration_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`status` text NOT NULL,
	`packet_hash` text NOT NULL,
	`packet_json` text NOT NULL,
	`beats_json` text,
	`display_text` text,
	`suggested_actions_json` text,
	`effects_json` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_narrations_status_valid" CHECK("campaign_play_narrations"."status" IN ('pending', 'complete', 'invalid')
        AND ("campaign_play_narrations"."error_code" IS NULL OR "campaign_play_narrations"."error_code" = 'narration_invalid')),
	CONSTRAINT "campaign_play_narrations_packet_valid" CHECK(length("campaign_play_narrations"."packet_hash") = 64
        AND json_valid("campaign_play_narrations"."packet_json")
        AND json_type("campaign_play_narrations"."packet_json") = 'object'),
	CONSTRAINT "campaign_play_narrations_status_consistent" CHECK((
          "campaign_play_narrations"."status" = 'pending'
          AND "campaign_play_narrations"."beats_json" IS NULL
          AND "campaign_play_narrations"."display_text" IS NULL
          AND "campaign_play_narrations"."suggested_actions_json" IS NULL
          AND "campaign_play_narrations"."effects_json" IS NULL
          AND "campaign_play_narrations"."error_code" IS NULL
          AND "campaign_play_narrations"."completed_at" IS NULL
        ) OR (
          "campaign_play_narrations"."status" = 'complete'
          AND json_valid("campaign_play_narrations"."beats_json")
          AND "campaign_play_narrations"."display_text" IS NOT NULL
          AND json_valid("campaign_play_narrations"."suggested_actions_json")
          AND json_valid("campaign_play_narrations"."effects_json")
          AND "campaign_play_narrations"."error_code" IS NULL
          AND "campaign_play_narrations"."completed_at" IS NOT NULL
        ) OR (
          "campaign_play_narrations"."status" = 'invalid'
          AND "campaign_play_narrations"."beats_json" IS NULL
          AND "campaign_play_narrations"."display_text" IS NULL
          AND "campaign_play_narrations"."suggested_actions_json" IS NULL
          AND "campaign_play_narrations"."effects_json" IS NULL
          AND "campaign_play_narrations"."error_code" = 'narration_invalid'
          AND "campaign_play_narrations"."completed_at" IS NOT NULL
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_narrations_turn_unique` ON `campaign_play_narrations` (`turn_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_narrations_campaign_status` ON `campaign_play_narrations` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaign_play_runtime_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`turn_id` text,
	`kind` text NOT NULL,
	`worker_epoch` integer,
	`world_version` integer NOT NULL,
	`prior_runtime_revision` integer NOT NULL,
	`result_runtime_revision` integer NOT NULL,
	`prior_runtime_hash` text NOT NULL,
	`result_runtime_hash` text NOT NULL,
	`protected_payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_runtime_events_kind_valid" CHECK("campaign_play_runtime_events"."kind" IN (
        'play_state_created',
        'character_created',
        'turn_admitted',
        'worker_claimed',
        'stage_accepted',
        'primary_settled',
        'actor_job_transitioned',
        'visibility_projected',
        'turn_interrupted',
        'turn_resumed',
        'turn_completed',
        'turn_failed'
      )),
	CONSTRAINT "campaign_play_runtime_events_versions_valid" CHECK("campaign_play_runtime_events"."sequence" > 0
        AND "campaign_play_runtime_events"."world_version" >= 1
        AND "campaign_play_runtime_events"."prior_runtime_revision" >= 0
        AND "campaign_play_runtime_events"."result_runtime_revision" = "campaign_play_runtime_events"."prior_runtime_revision" + 1),
	CONSTRAINT "campaign_play_runtime_events_hashes_valid" CHECK(length("campaign_play_runtime_events"."prior_runtime_hash") = 64
        AND length("campaign_play_runtime_events"."result_runtime_hash") = 64
        AND length("campaign_play_runtime_events"."protected_payload_hash") = 64
        AND "campaign_play_runtime_events"."prior_runtime_hash" <> "campaign_play_runtime_events"."result_runtime_hash"),
	CONSTRAINT "campaign_play_runtime_events_turn_ownership" CHECK((
          "campaign_play_runtime_events"."kind" IN ('play_state_created', 'character_created')
          AND "campaign_play_runtime_events"."turn_id" IS NULL
        ) OR (
          "campaign_play_runtime_events"."kind" NOT IN ('play_state_created', 'character_created')
          AND "campaign_play_runtime_events"."turn_id" IS NOT NULL
        )),
	CONSTRAINT "campaign_play_runtime_events_worker_fencing" CHECK((
          "campaign_play_runtime_events"."kind" IN (
            'worker_claimed',
            'stage_accepted',
            'primary_settled',
            'actor_job_transitioned',
            'visibility_projected',
            'turn_interrupted',
            'turn_resumed',
            'turn_completed',
            'turn_failed'
          )
          AND "campaign_play_runtime_events"."worker_epoch" IS NOT NULL
          AND "campaign_play_runtime_events"."worker_epoch" > 0
        ) OR (
          "campaign_play_runtime_events"."kind" NOT IN (
            'worker_claimed',
            'stage_accepted',
            'primary_settled',
            'actor_job_transitioned',
            'visibility_projected',
            'turn_interrupted',
            'turn_resumed',
            'turn_completed',
            'turn_failed'
          )
          AND "campaign_play_runtime_events"."worker_epoch" IS NULL
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_runtime_events_campaign_sequence_unique` ON `campaign_play_runtime_events` (`campaign_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_runtime_events_campaign_revision_unique` ON `campaign_play_runtime_events` (`campaign_id`,`result_runtime_revision`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_runtime_events_campaign_turn_sequence` ON `campaign_play_runtime_events` (`campaign_id`,`turn_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `campaign_play_states` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`accepted_world_version` integer NOT NULL,
	`accepted_content_hash` text NOT NULL,
	`world_version` integer NOT NULL,
	`world_hash` text NOT NULL,
	`runtime_revision` integer NOT NULL,
	`runtime_hash` text NOT NULL,
	`next_runtime_event_sequence` integer DEFAULT 1 NOT NULL,
	`world_time_minutes` integer,
	`setup_phase` text NOT NULL,
	`opened_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_worlds`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_states_setup_phase_valid" CHECK("campaign_play_states"."setup_phase" IN ('character_required', 'opening_required', 'ready')),
	CONSTRAINT "campaign_play_states_versions_valid" CHECK("campaign_play_states"."accepted_world_version" >= 1
        AND "campaign_play_states"."world_version" >= "campaign_play_states"."accepted_world_version"
        AND "campaign_play_states"."runtime_revision" >= 1),
	CONSTRAINT "campaign_play_states_hashes_valid" CHECK(length("campaign_play_states"."accepted_content_hash") = 64
        AND length("campaign_play_states"."world_hash") = 64
        AND length("campaign_play_states"."runtime_hash") = 64),
	CONSTRAINT "campaign_play_states_sequences_valid" CHECK("campaign_play_states"."next_runtime_event_sequence" > 0),
	CONSTRAINT "campaign_play_states_world_time_valid" CHECK("campaign_play_states"."world_time_minutes" IS NULL OR "campaign_play_states"."world_time_minutes" BETWEEN 0 AND 2147483647),
	CONSTRAINT "campaign_play_states_opening_consistent" CHECK((
          "campaign_play_states"."setup_phase" = 'ready'
          AND "campaign_play_states"."world_time_minutes" IS NOT NULL
          AND "campaign_play_states"."opened_at" IS NOT NULL
        ) OR (
          "campaign_play_states"."setup_phase" <> 'ready'
          AND "campaign_play_states"."opened_at" IS NULL
        ))
);
--> statement-breakpoint
CREATE TABLE `campaign_play_turn_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`sequence` integer NOT NULL,
	`event_type` text NOT NULL,
	`payload_json` text NOT NULL,
	`sse_cursor` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_turn_events_type_valid" CHECK("campaign_play_turn_events"."event_type" IN (
        'turn.accepted',
        'turn.progressed',
        'turn.interrupted',
        'turn.completed',
        'turn.failed'
      )),
	CONSTRAINT "campaign_play_turn_events_payload_valid" CHECK("campaign_play_turn_events"."sequence" > 0
        AND json_valid("campaign_play_turn_events"."payload_json")
        AND length("campaign_play_turn_events"."sse_cursor") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_turn_events_turn_sequence_unique` ON `campaign_play_turn_events` (`turn_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_turn_events_campaign_cursor_unique` ON `campaign_play_turn_events` (`campaign_id`,`sse_cursor`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_turn_events_campaign_turn_sequence` ON `campaign_play_turn_events` (`campaign_id`,`turn_id`,`sequence`);--> statement-breakpoint
CREATE TABLE `campaign_play_turns` (
	`id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_kind` text NOT NULL,
	`supersedes_turn_id` text,
	`input_json` text NOT NULL,
	`input_hash` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`expected_world_version` integer NOT NULL,
	`expected_runtime_revision` integer NOT NULL,
	`base_world_version` integer NOT NULL,
	`final_world_version` integer,
	`stage` text DEFAULT 'admitted' NOT NULL,
	`frame_hash` text NOT NULL,
	`next_event_sequence` integer DEFAULT 1 NOT NULL,
	`worker_lease_owner` text,
	`worker_epoch` integer DEFAULT 0 NOT NULL,
	`worker_lease_expires_at` integer,
	`model_selection_json` text NOT NULL,
	`public_packet_hash` text,
	`interrupted_stage` text,
	`error_code` text,
	`resume_eligible` integer DEFAULT false NOT NULL,
	`mutation_audit_json` text DEFAULT '{}' NOT NULL,
	`submitted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`supersedes_turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_turns_enums_valid" CHECK("campaign_play_turns"."turn_kind" IN ('opening', 'player_action')
        AND "campaign_play_turns"."stage" IN (
          'admitted',
          'judged',
          'planned',
          'primary_settled',
          'actors_settled',
          'visibility_projected',
          'interrupted',
          'completed',
          'failed'
        )
        AND (
          "campaign_play_turns"."interrupted_stage" IS NULL
          OR "campaign_play_turns"."interrupted_stage" IN (
            'admitted',
            'judged',
            'planned',
            'primary_settled',
            'actors_settled',
            'visibility_projected'
          )
        )
        AND (
          "campaign_play_turns"."error_code" IS NULL
          OR "campaign_play_turns"."error_code" IN (
            'invalid_input',
            'worker_lease_lost',
            'stale_artifact',
            'model_contract_invalid',
            'stage_budget_exceeded',
            'stage_timeout',
            'rulebook_denied',
            'persistence_failed',
            'provider_unavailable',
            'narration_invalid'
          )
        )),
	CONSTRAINT "campaign_play_turns_input_valid" CHECK(json_valid("campaign_play_turns"."input_json")
        AND json_valid("campaign_play_turns"."model_selection_json")
        AND json_valid("campaign_play_turns"."mutation_audit_json")
        AND length("campaign_play_turns"."input_hash") = 64
        AND length("campaign_play_turns"."frame_hash") = 64
        AND length("campaign_play_turns"."idempotency_key") BETWEEN 1 AND 128),
	CONSTRAINT "campaign_play_turns_versions_valid" CHECK("campaign_play_turns"."expected_world_version" >= 1
        AND "campaign_play_turns"."expected_runtime_revision" >= 1
        AND "campaign_play_turns"."base_world_version" = "campaign_play_turns"."expected_world_version"
        AND (
          "campaign_play_turns"."final_world_version" IS NULL
          OR "campaign_play_turns"."final_world_version" >= "campaign_play_turns"."base_world_version"
        )),
	CONSTRAINT "campaign_play_turns_sequence_epoch_valid" CHECK("campaign_play_turns"."next_event_sequence" > 0 AND "campaign_play_turns"."worker_epoch" >= 0),
	CONSTRAINT "campaign_play_turns_lease_consistent" CHECK((
          "campaign_play_turns"."worker_lease_owner" IS NULL
          AND "campaign_play_turns"."worker_lease_expires_at" IS NULL
        ) OR (
          "campaign_play_turns"."worker_lease_owner" IS NOT NULL
          AND length("campaign_play_turns"."worker_lease_owner") > 0
          AND "campaign_play_turns"."worker_lease_expires_at" IS NOT NULL
          AND "campaign_play_turns"."worker_epoch" > 0
        )),
	CONSTRAINT "campaign_play_turns_packet_hash_valid" CHECK("campaign_play_turns"."public_packet_hash" IS NULL OR length("campaign_play_turns"."public_packet_hash") = 64),
	CONSTRAINT "campaign_play_turns_supersession_kind" CHECK("campaign_play_turns"."supersedes_turn_id" IS NULL OR "campaign_play_turns"."turn_kind" = 'opening'),
	CONSTRAINT "campaign_play_turns_terminal_consistent" CHECK((
          "campaign_play_turns"."stage" = 'interrupted'
          AND "campaign_play_turns"."interrupted_stage" IS NOT NULL
          AND "campaign_play_turns"."error_code" IS NOT NULL
          AND "campaign_play_turns"."resume_eligible" = 1
          AND "campaign_play_turns"."completed_at" IS NULL
          AND "campaign_play_turns"."worker_lease_owner" IS NULL
        ) OR (
          "campaign_play_turns"."stage" = 'completed'
          AND "campaign_play_turns"."final_world_version" IS NOT NULL
          AND "campaign_play_turns"."public_packet_hash" IS NOT NULL
          AND "campaign_play_turns"."interrupted_stage" IS NULL
          AND "campaign_play_turns"."error_code" IS NULL
          AND "campaign_play_turns"."resume_eligible" = 0
          AND "campaign_play_turns"."completed_at" IS NOT NULL
          AND "campaign_play_turns"."worker_lease_owner" IS NULL
        ) OR (
          "campaign_play_turns"."stage" = 'failed'
          AND "campaign_play_turns"."final_world_version" IS NOT NULL
          AND "campaign_play_turns"."interrupted_stage" IS NULL
          AND "campaign_play_turns"."error_code" IS NOT NULL
          AND "campaign_play_turns"."resume_eligible" = 0
          AND "campaign_play_turns"."completed_at" IS NOT NULL
          AND "campaign_play_turns"."worker_lease_owner" IS NULL
        ) OR (
          "campaign_play_turns"."stage" NOT IN ('interrupted', 'completed', 'failed')
          AND "campaign_play_turns"."interrupted_stage" IS NULL
          AND "campaign_play_turns"."error_code" IS NULL
          AND "campaign_play_turns"."resume_eligible" = 0
          AND "campaign_play_turns"."completed_at" IS NULL
        )),
	CONSTRAINT "campaign_play_turns_visibility_packet_present" CHECK("campaign_play_turns"."stage" <> 'visibility_projected' OR "campaign_play_turns"."public_packet_hash" IS NOT NULL)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_turns_campaign_idempotency_unique` ON `campaign_play_turns` (`campaign_id`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_turns_campaign_active_unique` ON `campaign_play_turns` (`campaign_id`) WHERE "campaign_play_turns"."stage" NOT IN ('completed', 'failed');--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_turns_campaign_opening_unique` ON `campaign_play_turns` (`campaign_id`) WHERE "campaign_play_turns"."turn_kind" = 'opening'
        AND (
          "campaign_play_turns"."stage" <> 'failed'
          OR "campaign_play_turns"."final_world_version" <> "campaign_play_turns"."base_world_version"
        );--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_turns_superseded_unique` ON `campaign_play_turns` (`supersedes_turn_id`) WHERE "campaign_play_turns"."supersedes_turn_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_campaign_play_turns_campaign_stage` ON `campaign_play_turns` (`campaign_id`,`stage`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_turns_campaign_kind_submitted` ON `campaign_play_turns` (`campaign_id`,`turn_kind`,`submitted_at`);
--> statement-breakpoint
CREATE TRIGGER `campaign_play_states_accepted_world_insert`
BEFORE INSERT ON `campaign_play_states`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `campaign_worlds`
  WHERE `campaign_id` = NEW.`campaign_id`
    AND `status` = 'accepted'
    AND `accepted_world_version` = NEW.`accepted_world_version`
    AND `accepted_content_hash` = NEW.`accepted_content_hash`
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_state_requires_accepted_world');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_states_accepted_base_immutable`
BEFORE UPDATE OF `campaign_id`, `accepted_world_version`, `accepted_content_hash`
ON `campaign_play_states`
FOR EACH ROW
WHEN NEW.`campaign_id` IS NOT OLD.`campaign_id`
  OR NEW.`accepted_world_version` IS NOT OLD.`accepted_world_version`
  OR NEW.`accepted_content_hash` IS NOT OLD.`accepted_content_hash`
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_accepted_base_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_characters_actor_insert`
BEFORE INSERT ON `campaign_play_characters`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `actors`
  WHERE `id` = NEW.`actor_id`
    AND `campaign_id` = NEW.`campaign_id`
    AND `kind` = 'person'
    AND `controller` = 'human'
    AND `role` = 'player'
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_character_requires_campaign_player');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_characters_actor_update`
BEFORE UPDATE OF `actor_id`, `campaign_id` ON `campaign_play_characters`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1
  FROM `actors`
  WHERE `id` = NEW.`actor_id`
    AND `campaign_id` = NEW.`campaign_id`
    AND `kind` = 'person'
    AND `controller` = 'human'
    AND `role` = 'player'
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_character_requires_campaign_player');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turns_opening_supersession_insert`
BEFORE INSERT ON `campaign_play_turns`
FOR EACH ROW
WHEN NEW.`turn_kind` = 'opening'
  AND (
    (
      NOT EXISTS (
        SELECT 1 FROM `campaign_play_turns`
        WHERE `campaign_id` = NEW.`campaign_id`
          AND `turn_kind` = 'opening'
      )
      AND NEW.`supersedes_turn_id` IS NOT NULL
    )
    OR (
      EXISTS (
        SELECT 1 FROM `campaign_play_turns`
        WHERE `campaign_id` = NEW.`campaign_id`
          AND `turn_kind` = 'opening'
      )
      AND NEW.`supersedes_turn_id` IS NULL
    )
    OR (
      NEW.`supersedes_turn_id` IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM `campaign_play_turns` AS `prior`
        WHERE `prior`.`id` = NEW.`supersedes_turn_id`
          AND `prior`.`campaign_id` = NEW.`campaign_id`
          AND `prior`.`turn_kind` = 'opening'
          AND `prior`.`stage` = 'failed'
          AND `prior`.`final_world_version` = `prior`.`base_world_version`
          AND `prior`.`worker_lease_owner` IS NULL
          AND `prior`.`worker_lease_expires_at` IS NULL
          AND NOT EXISTS (
            SELECT 1
            FROM `campaign_play_turns` AS `successor`
            WHERE `successor`.`supersedes_turn_id` = `prior`.`id`
          )
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_opening_supersession_ineligible');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turns_terminal_immutable`
BEFORE UPDATE ON `campaign_play_turns`
FOR EACH ROW
WHEN OLD.`stage` IN ('completed', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_terminal_turn_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_runtime_events_campaign_turn_insert`
BEFORE INSERT ON `campaign_play_runtime_events`
FOR EACH ROW
WHEN NEW.`turn_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `campaign_play_turns`
    WHERE `id` = NEW.`turn_id`
      AND `campaign_id` = NEW.`campaign_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_runtime_event_turn_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_runtime_events_campaign_turn_update`
BEFORE UPDATE OF `campaign_id`, `turn_id` ON `campaign_play_runtime_events`
FOR EACH ROW
WHEN NEW.`turn_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `campaign_play_turns`
    WHERE `id` = NEW.`turn_id`
      AND `campaign_id` = NEW.`campaign_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_runtime_event_turn_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turn_events_campaign_turn_insert`
BEFORE INSERT ON `campaign_play_turn_events`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `campaign_play_turns`
  WHERE `id` = NEW.`turn_id`
    AND `campaign_id` = NEW.`campaign_id`
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_turn_event_turn_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turn_events_campaign_turn_update`
BEFORE UPDATE OF `campaign_id`, `turn_id` ON `campaign_play_turn_events`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `campaign_play_turns`
  WHERE `id` = NEW.`turn_id`
    AND `campaign_id` = NEW.`campaign_id`
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_turn_event_turn_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_claim_insert`
BEFORE INSERT ON `campaign_play_model_stages`
FOR EACH ROW
WHEN (
    NEW.`turn_id` IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM `campaign_play_turns`
      WHERE `id` = NEW.`turn_id`
        AND `campaign_id` = NEW.`campaign_id`
    )
  )
  OR (
    NOT EXISTS (
      SELECT 1 FROM `campaign_play_model_stages`
      WHERE `stage_id` = NEW.`stage_id`
    )
    AND NEW.`attempt` <> 1
  )
  OR (
    EXISTS (
      SELECT 1 FROM `campaign_play_model_stages`
      WHERE `stage_id` = NEW.`stage_id`
    )
    AND (
      NEW.`attempt` <> (
        SELECT MAX(`attempt`) + 1
        FROM `campaign_play_model_stages`
        WHERE `stage_id` = NEW.`stage_id`
      )
      OR NEW.`worker_epoch` <= (
        SELECT MAX(`worker_epoch`)
        FROM `campaign_play_model_stages`
        WHERE `stage_id` = NEW.`stage_id`
      )
      OR EXISTS (
        SELECT 1
        FROM `campaign_play_model_stages`
        WHERE `stage_id` = NEW.`stage_id`
          AND (
            `campaign_id` <> NEW.`campaign_id`
            OR `turn_id` IS NOT NEW.`turn_id`
            OR `kind` <> NEW.`kind`
            OR `status` = 'accepted'
          )
      )
    )
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_claim_inconsistent');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_identity_immutable`
BEFORE UPDATE OF `stage_id`, `attempt`, `campaign_id`, `turn_id`, `kind`, `worker_epoch`
ON `campaign_play_model_stages`
FOR EACH ROW
WHEN NEW.`stage_id` IS NOT OLD.`stage_id`
  OR NEW.`attempt` IS NOT OLD.`attempt`
  OR NEW.`campaign_id` IS NOT OLD.`campaign_id`
  OR NEW.`turn_id` IS NOT OLD.`turn_id`
  OR NEW.`kind` IS NOT OLD.`kind`
  OR NEW.`worker_epoch` IS NOT OLD.`worker_epoch`
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_identity_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_narrations_campaign_turn_insert`
BEFORE INSERT ON `campaign_play_narrations`
FOR EACH ROW
WHEN NOT EXISTS (
  SELECT 1 FROM `campaign_play_turns`
  WHERE `id` = NEW.`turn_id`
    AND `campaign_id` = NEW.`campaign_id`
    AND `public_packet_hash` = NEW.`packet_hash`
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_narration_turn_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_narrations_identity_update`
BEFORE UPDATE OF `narration_id`, `campaign_id`, `turn_id`, `packet_hash`, `packet_json`
ON `campaign_play_narrations`
FOR EACH ROW
WHEN NEW.`narration_id` IS NOT OLD.`narration_id`
  OR NEW.`campaign_id` IS NOT OLD.`campaign_id`
  OR NEW.`turn_id` IS NOT OLD.`turn_id`
  OR NEW.`packet_hash` IS NOT OLD.`packet_hash`
  OR NEW.`packet_json` IS NOT OLD.`packet_json`
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_narration_packet_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turns_admission_immutable`
BEFORE UPDATE OF
  `id`,
  `campaign_id`,
  `turn_kind`,
  `supersedes_turn_id`,
  `input_json`,
  `input_hash`,
  `idempotency_key`,
  `expected_world_version`,
  `expected_runtime_revision`,
  `base_world_version`,
  `frame_hash`,
  `model_selection_json`,
  `submitted_at`
ON `campaign_play_turns`
FOR EACH ROW
WHEN NEW.`id` IS NOT OLD.`id`
  OR NEW.`campaign_id` IS NOT OLD.`campaign_id`
  OR NEW.`turn_kind` IS NOT OLD.`turn_kind`
  OR NEW.`supersedes_turn_id` IS NOT OLD.`supersedes_turn_id`
  OR NEW.`input_json` IS NOT OLD.`input_json`
  OR NEW.`input_hash` IS NOT OLD.`input_hash`
  OR NEW.`idempotency_key` IS NOT OLD.`idempotency_key`
  OR NEW.`expected_world_version` IS NOT OLD.`expected_world_version`
  OR NEW.`expected_runtime_revision` IS NOT OLD.`expected_runtime_revision`
  OR NEW.`base_world_version` IS NOT OLD.`base_world_version`
  OR NEW.`frame_hash` IS NOT OLD.`frame_hash`
  OR NEW.`model_selection_json` IS NOT OLD.`model_selection_json`
  OR NEW.`submitted_at` IS NOT OLD.`submitted_at`
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_turn_admission_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turns_public_packet_write_once`
BEFORE UPDATE OF `public_packet_hash` ON `campaign_play_turns`
FOR EACH ROW
WHEN OLD.`public_packet_hash` IS NOT NULL
  AND NEW.`public_packet_hash` IS NOT OLD.`public_packet_hash`
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_turn_public_packet_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_runtime_events_immutable_update`
BEFORE UPDATE ON `campaign_play_runtime_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_runtime_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_runtime_events_immutable_delete`
BEFORE DELETE ON `campaign_play_runtime_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_runtime_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turn_events_immutable_update`
BEFORE UPDATE ON `campaign_play_turn_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_turn_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_turn_events_immutable_delete`
BEFORE DELETE ON `campaign_play_turn_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_turn_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_requested_evidence_immutable`
BEFORE UPDATE OF
  `requested_provider_id`,
  `requested_model`,
  `requested_strategy`,
  `created_at`
ON `campaign_play_model_stages`
FOR EACH ROW
WHEN NEW.`requested_provider_id` IS NOT OLD.`requested_provider_id`
  OR NEW.`requested_model` IS NOT OLD.`requested_model`
  OR NEW.`requested_strategy` IS NOT OLD.`requested_strategy`
  OR NEW.`created_at` IS NOT OLD.`created_at`
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_request_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_terminal_immutable`
BEFORE UPDATE ON `campaign_play_model_stages`
FOR EACH ROW
WHEN OLD.`status` IN ('accepted', 'interrupted', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_terminal_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_transition_update`
BEFORE UPDATE OF `status` ON `campaign_play_model_stages`
FOR EACH ROW
WHEN OLD.`status` = 'started'
  AND NEW.`status` NOT IN ('accepted', 'interrupted', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_transition_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_immutable_delete`
BEFORE DELETE ON `campaign_play_model_stages`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_narrations_transition_update`
BEFORE UPDATE OF `status` ON `campaign_play_narrations`
FOR EACH ROW
WHEN OLD.`status` = 'pending'
  AND NEW.`status` NOT IN ('complete', 'invalid')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_narration_transition_invalid');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_narrations_terminal_immutable`
BEFORE UPDATE ON `campaign_play_narrations`
FOR EACH ROW
WHEN OLD.`status` IN ('complete', 'invalid')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_narration_terminal_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_narrations_immutable_delete`
BEFORE DELETE ON `campaign_play_narrations`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_narration_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_characters_immutable_update`
BEFORE UPDATE ON `campaign_play_characters`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_character_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_characters_immutable_delete`
BEFORE DELETE ON `campaign_play_characters`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_character_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_character_actor_binding_update`
BEFORE UPDATE OF `campaign_id`, `kind`, `controller`, `role` ON `actors`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM `campaign_play_characters`
  WHERE `actor_id` = OLD.`id`
)
  AND NOT (
    NEW.`campaign_id` = OLD.`campaign_id`
    AND NEW.`kind` = 'person'
    AND NEW.`controller` = 'human'
    AND NEW.`role` = 'player'
  )
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_character_actor_binding_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_character_actor_binding_delete`
BEFORE DELETE ON `actors`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM `campaign_play_characters`
  WHERE `actor_id` = OLD.`id`
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_character_actor_binding_immutable');
END;
