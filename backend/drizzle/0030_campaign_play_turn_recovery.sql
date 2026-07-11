PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_model_stages` (
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
	`artifact_json` text,
	`artifact_hash` text,
	`error_code` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_model_stages_enums_valid" CHECK("__new_campaign_play_model_stages"."kind" IN (
          'judge',
          'game_master',
          'opening_planner',
          'actor_replanner',
          'narrator'
        )
        AND "__new_campaign_play_model_stages"."status" IN ('started', 'accepted', 'interrupted', 'failed')
        AND "__new_campaign_play_model_stages"."schema_outcome" IN (
          'pending',
          'valid',
          'invalid',
          'transport_error'
        )
        AND (
          "__new_campaign_play_model_stages"."error_code" IS NULL
          OR "__new_campaign_play_model_stages"."error_code" IN (
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
	CONSTRAINT "campaign_play_model_stages_identity_valid" CHECK(length("__new_campaign_play_model_stages"."stage_id") > 0
        AND "__new_campaign_play_model_stages"."attempt" > 0
        AND "__new_campaign_play_model_stages"."worker_epoch" > 0
        AND length("__new_campaign_play_model_stages"."requested_provider_id") > 0
        AND length("__new_campaign_play_model_stages"."requested_model") > 0
        AND "__new_campaign_play_model_stages"."requested_strategy" = 'strict_object'
        AND ("__new_campaign_play_model_stages"."actual_strategy" IS NULL OR "__new_campaign_play_model_stages"."actual_strategy" = 'strict_object')),
	CONSTRAINT "campaign_play_model_stages_actual_evidence_consistent" CHECK((
          "__new_campaign_play_model_stages"."actual_provider_id" IS NULL
          AND "__new_campaign_play_model_stages"."actual_model" IS NULL
          AND "__new_campaign_play_model_stages"."actual_strategy" IS NULL
        ) OR (
          "__new_campaign_play_model_stages"."actual_provider_id" IS NOT NULL
          AND "__new_campaign_play_model_stages"."actual_model" IS NOT NULL
          AND "__new_campaign_play_model_stages"."actual_strategy" = 'strict_object'
        )),
	CONSTRAINT "campaign_play_model_stages_usage_valid" CHECK(("__new_campaign_play_model_stages"."input_tokens" IS NULL OR "__new_campaign_play_model_stages"."input_tokens" >= 0)
        AND ("__new_campaign_play_model_stages"."output_tokens" IS NULL OR "__new_campaign_play_model_stages"."output_tokens" >= 0)
        AND ("__new_campaign_play_model_stages"."duration_ms" IS NULL OR "__new_campaign_play_model_stages"."duration_ms" >= 0)
        AND ("__new_campaign_play_model_stages"."artifact_json" IS NULL OR json_valid("__new_campaign_play_model_stages"."artifact_json"))
        AND ("__new_campaign_play_model_stages"."artifact_hash" IS NULL OR length("__new_campaign_play_model_stages"."artifact_hash") = 64)),
	CONSTRAINT "campaign_play_model_stages_status_consistent" CHECK((
          "__new_campaign_play_model_stages"."status" = 'started'
          AND "__new_campaign_play_model_stages"."schema_outcome" = 'pending'
          AND "__new_campaign_play_model_stages"."actual_provider_id" IS NULL
          AND "__new_campaign_play_model_stages"."input_tokens" IS NULL
          AND "__new_campaign_play_model_stages"."output_tokens" IS NULL
          AND "__new_campaign_play_model_stages"."duration_ms" IS NULL
          AND "__new_campaign_play_model_stages"."finish_reason" IS NULL
          AND "__new_campaign_play_model_stages"."artifact_json" IS NULL
          AND "__new_campaign_play_model_stages"."artifact_hash" IS NULL
          AND "__new_campaign_play_model_stages"."error_code" IS NULL
          AND "__new_campaign_play_model_stages"."completed_at" IS NULL
        ) OR (
          "__new_campaign_play_model_stages"."status" = 'accepted'
          AND "__new_campaign_play_model_stages"."schema_outcome" = 'valid'
          AND "__new_campaign_play_model_stages"."actual_provider_id" IS NOT NULL
          AND "__new_campaign_play_model_stages"."input_tokens" IS NOT NULL
          AND "__new_campaign_play_model_stages"."output_tokens" IS NOT NULL
          AND "__new_campaign_play_model_stages"."duration_ms" IS NOT NULL
          AND "__new_campaign_play_model_stages"."finish_reason" IS NOT NULL
          AND "__new_campaign_play_model_stages"."artifact_json" IS NOT NULL
          AND "__new_campaign_play_model_stages"."artifact_hash" IS NOT NULL
          AND "__new_campaign_play_model_stages"."error_code" IS NULL
          AND "__new_campaign_play_model_stages"."completed_at" IS NOT NULL
        ) OR (
          "__new_campaign_play_model_stages"."status" = 'interrupted'
          AND "__new_campaign_play_model_stages"."schema_outcome" IN ('invalid', 'transport_error')
          AND "__new_campaign_play_model_stages"."duration_ms" IS NOT NULL
          AND "__new_campaign_play_model_stages"."artifact_json" IS NULL
          AND "__new_campaign_play_model_stages"."artifact_hash" IS NULL
          AND "__new_campaign_play_model_stages"."error_code" IS NOT NULL
          AND "__new_campaign_play_model_stages"."completed_at" IS NOT NULL
        ) OR (
          "__new_campaign_play_model_stages"."status" = 'failed'
          AND "__new_campaign_play_model_stages"."schema_outcome" IN ('invalid', 'transport_error')
          AND "__new_campaign_play_model_stages"."duration_ms" IS NOT NULL
          AND "__new_campaign_play_model_stages"."artifact_json" IS NULL
          AND "__new_campaign_play_model_stages"."artifact_hash" IS NULL
          AND "__new_campaign_play_model_stages"."error_code" IS NOT NULL
          AND "__new_campaign_play_model_stages"."completed_at" IS NOT NULL
        ))
);
--> statement-breakpoint
-- Accepted rows require their original artifact bytes and must be absent before this migration.
INSERT INTO `__new_campaign_play_model_stages`("id", "stage_id", "attempt", "campaign_id", "turn_id", "kind", "status", "worker_epoch", "requested_provider_id", "requested_model", "requested_strategy", "actual_provider_id", "actual_model", "actual_strategy", "input_tokens", "output_tokens", "duration_ms", "finish_reason", "schema_outcome", "artifact_json", "artifact_hash", "error_code", "created_at", "completed_at") SELECT "id", "stage_id", "attempt", "campaign_id", "turn_id", "kind", "status", "worker_epoch", "requested_provider_id", "requested_model", "requested_strategy", "actual_provider_id", "actual_model", "actual_strategy", "input_tokens", "output_tokens", "duration_ms", "finish_reason", "schema_outcome", NULL, "artifact_hash", "error_code", "created_at", "completed_at" FROM `campaign_play_model_stages`;--> statement-breakpoint
DROP TABLE `campaign_play_model_stages`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_model_stages` RENAME TO `campaign_play_model_stages`;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_attempt_unique` ON `campaign_play_model_stages` (`stage_id`,`attempt`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_epoch_unique` ON `campaign_play_model_stages` (`stage_id`,`worker_epoch`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_started_unique` ON `campaign_play_model_stages` (`stage_id`) WHERE "campaign_play_model_stages"."status" = 'started';--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_model_stages_invocation_accepted_unique` ON `campaign_play_model_stages` (`stage_id`) WHERE "campaign_play_model_stages"."status" = 'accepted';--> statement-breakpoint
CREATE INDEX `idx_campaign_play_model_stages_campaign_turn_kind_attempt` ON `campaign_play_model_stages` (`campaign_id`,`turn_id`,`kind`,`attempt`);--> statement-breakpoint
CREATE TABLE `__new_campaign_play_runtime_events` (
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
	CONSTRAINT "campaign_play_runtime_events_kind_valid" CHECK("__new_campaign_play_runtime_events"."kind" IN (
        'play_state_created',
        'character_created',
        'turn_admitted',
        'worker_claimed',
        'worker_lease_renewed',
        'stage_accepted',
        'primary_settled',
        'actor_job_transitioned',
        'visibility_projected',
        'turn_interrupted',
        'turn_resumed',
        'turn_completed',
        'turn_failed'
      )),
	CONSTRAINT "campaign_play_runtime_events_versions_valid" CHECK("__new_campaign_play_runtime_events"."sequence" > 0
        AND "__new_campaign_play_runtime_events"."world_version" >= 1
        AND "__new_campaign_play_runtime_events"."prior_runtime_revision" >= 0
        AND "__new_campaign_play_runtime_events"."result_runtime_revision" = "__new_campaign_play_runtime_events"."prior_runtime_revision" + 1),
	CONSTRAINT "campaign_play_runtime_events_hashes_valid" CHECK(length("__new_campaign_play_runtime_events"."prior_runtime_hash") = 64
        AND length("__new_campaign_play_runtime_events"."result_runtime_hash") = 64
        AND length("__new_campaign_play_runtime_events"."protected_payload_hash") = 64
        AND "__new_campaign_play_runtime_events"."prior_runtime_hash" <> "__new_campaign_play_runtime_events"."result_runtime_hash"),
	CONSTRAINT "campaign_play_runtime_events_turn_ownership" CHECK((
          "__new_campaign_play_runtime_events"."kind" IN ('play_state_created', 'character_created')
          AND "__new_campaign_play_runtime_events"."turn_id" IS NULL
        ) OR (
          "__new_campaign_play_runtime_events"."kind" NOT IN ('play_state_created', 'character_created')
          AND "__new_campaign_play_runtime_events"."turn_id" IS NOT NULL
        )),
	CONSTRAINT "campaign_play_runtime_events_worker_fencing" CHECK((
          "__new_campaign_play_runtime_events"."kind" IN (
            'worker_claimed',
            'worker_lease_renewed',
            'stage_accepted',
            'primary_settled',
            'actor_job_transitioned',
            'visibility_projected',
            'turn_interrupted',
            'turn_resumed',
            'turn_completed',
            'turn_failed'
          )
          AND "__new_campaign_play_runtime_events"."worker_epoch" IS NOT NULL
          AND "__new_campaign_play_runtime_events"."worker_epoch" > 0
        ) OR (
          "__new_campaign_play_runtime_events"."kind" NOT IN (
            'worker_claimed',
            'worker_lease_renewed',
            'stage_accepted',
            'primary_settled',
            'actor_job_transitioned',
            'visibility_projected',
            'turn_interrupted',
            'turn_resumed',
            'turn_completed',
            'turn_failed'
          )
          AND "__new_campaign_play_runtime_events"."worker_epoch" IS NULL
        ))
);
--> statement-breakpoint
INSERT INTO `__new_campaign_play_runtime_events`("event_id", "campaign_id", "sequence", "turn_id", "kind", "worker_epoch", "world_version", "prior_runtime_revision", "result_runtime_revision", "prior_runtime_hash", "result_runtime_hash", "protected_payload_hash", "created_at") SELECT "event_id", "campaign_id", "sequence", "turn_id", "kind", "worker_epoch", "world_version", "prior_runtime_revision", "result_runtime_revision", "prior_runtime_hash", "result_runtime_hash", "protected_payload_hash", "created_at" FROM `campaign_play_runtime_events`;--> statement-breakpoint
DROP TABLE `campaign_play_runtime_events`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_runtime_events` RENAME TO `campaign_play_runtime_events`;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_runtime_events_campaign_sequence_unique` ON `campaign_play_runtime_events` (`campaign_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_runtime_events_campaign_revision_unique` ON `campaign_play_runtime_events` (`campaign_id`,`result_runtime_revision`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_runtime_events_campaign_turn_sequence` ON `campaign_play_runtime_events` (`campaign_id`,`turn_id`,`sequence`);--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_runtime_events_immutable_update`
BEFORE UPDATE ON `campaign_play_runtime_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_runtime_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_runtime_events_immutable_delete`
BEFORE DELETE ON `campaign_play_runtime_events`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_runtime_event_immutable');
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
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
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_terminal_immutable`
BEFORE UPDATE ON `campaign_play_model_stages`
FOR EACH ROW
WHEN OLD.`status` IN ('accepted', 'interrupted', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_terminal_immutable');
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_transition_update`
BEFORE UPDATE OF `status` ON `campaign_play_model_stages`
FOR EACH ROW
WHEN OLD.`status` = 'started'
  AND NEW.`status` NOT IN ('accepted', 'interrupted', 'failed')
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_transition_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_model_stages_immutable_delete`
BEFORE DELETE ON `campaign_play_model_stages`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_model_stage_immutable');
END;--> statement-breakpoint
PRAGMA foreign_keys=ON;
