PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA legacy_alter_table=ON;--> statement-breakpoint
DROP TRIGGER IF EXISTS `campaign_play_actor_replan_attempts_insert_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `campaign_play_actor_replan_attempts_update_guard`;--> statement-breakpoint
DROP TRIGGER IF EXISTS `campaign_play_actor_replan_attempts_delete_immutable`;--> statement-breakpoint
ALTER TABLE `campaign_play_actor_replan_attempts` RENAME TO `__old_campaign_play_actor_replan_attempts`;--> statement-breakpoint
CREATE TABLE `campaign_play_actor_replan_attempts` (
  `attempt_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `job_id` text NOT NULL,
  `stage_id` text NOT NULL,
  `model_stage_row_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `attempt_number` integer NOT NULL,
  `model_worker_epoch` integer NOT NULL,
  `actor_job_worker_epoch` integer NOT NULL,
  `claim_turn_worker_epoch` integer NOT NULL,
  `frame_hash` text NOT NULL,
  `frozen_base_world_version` integer NOT NULL,
  `deadline_at` integer NOT NULL,
  `requested_provider_id` text NOT NULL,
  `requested_model` text NOT NULL,
  `requested_strategy` text NOT NULL,
  `retry_consumed_at` integer,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`job_id`) REFERENCES `campaign_play_actor_jobs`(`job_id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`model_stage_row_id`) REFERENCES `campaign_play_model_stages`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
  CONSTRAINT `campaign_play_actor_replan_attempts_identity_valid` CHECK (
    `attempt_number` IN (1, 2, 3)
    AND `model_worker_epoch` > 0
    AND `actor_job_worker_epoch` > 0
    AND `claim_turn_worker_epoch` > 0
    AND `frozen_base_world_version` > 0
    AND `deadline_at` > `created_at`
    AND length(`stage_id`) > 0
    AND length(`frame_hash`) > 0
    AND length(`requested_provider_id`) > 0
    AND length(`requested_model`) > 0
    AND `requested_strategy` = 'strict_object'
    AND (`retry_consumed_at` IS NULL OR `retry_consumed_at` >= `created_at`)
  ),
  CONSTRAINT `campaign_play_actor_replan_attempts_retry_marker_valid` CHECK (
    `attempt_number` IN (1, 2) OR `retry_consumed_at` IS NULL
  )
);--> statement-breakpoint
INSERT INTO `campaign_play_actor_replan_attempts` (
  `attempt_id`, `campaign_id`, `job_id`, `stage_id`, `model_stage_row_id`,
  `turn_id`, `actor_id`, `attempt_number`, `model_worker_epoch`,
  `actor_job_worker_epoch`, `claim_turn_worker_epoch`, `frame_hash`,
  `frozen_base_world_version`, `deadline_at`, `requested_provider_id`, `requested_model`,
  `requested_strategy`, `retry_consumed_at`, `created_at`
)
SELECT `attempt_id`, `campaign_id`, `job_id`, `stage_id`, `model_stage_row_id`,
  `turn_id`, `actor_id`, `attempt_number`, `model_worker_epoch`,
  `actor_job_worker_epoch`, `claim_turn_worker_epoch`, `frame_hash`,
  `frozen_base_world_version`, `deadline_at`, `requested_provider_id`, `requested_model`,
  `requested_strategy`, `retry_consumed_at`, `created_at`
FROM `__old_campaign_play_actor_replan_attempts`;--> statement-breakpoint
DROP TABLE `__old_campaign_play_actor_replan_attempts`;--> statement-breakpoint
PRAGMA legacy_alter_table=OFF;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_replan_attempts_job_attempt_unique`
  ON `campaign_play_actor_replan_attempts` (`job_id`, `attempt_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_replan_attempts_model_stage_unique`
  ON `campaign_play_actor_replan_attempts` (`model_stage_row_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_replan_attempts_job_order`
  ON `campaign_play_actor_replan_attempts` (`campaign_id`, `job_id`, `attempt_number`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_replan_attempts_job_stage`
  ON `campaign_play_actor_replan_attempts` (`job_id`, `stage_id`, `attempt_number`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_replan_attempts_model_stage`
  ON `campaign_play_actor_replan_attempts` (`campaign_id`, `model_stage_row_id`);--> statement-breakpoint
CREATE TRIGGER `campaign_play_actor_replan_attempts_insert_guard`
BEFORE INSERT ON `campaign_play_actor_replan_attempts`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_actor_jobs job
    JOIN campaign_play_turns turn_row
      ON turn_row.id = job.turn_id AND turn_row.campaign_id = job.campaign_id
    JOIN actors actor
      ON actor.id = job.actor_id AND actor.campaign_id = job.campaign_id
    JOIN campaign_play_model_stages model ON model.id = NEW.model_stage_row_id
    WHERE job.job_id = NEW.job_id
      AND job.campaign_id = NEW.campaign_id
      AND job.turn_id = NEW.turn_id
      AND job.actor_id = NEW.actor_id
      AND job.frozen_base_world_version = NEW.frozen_base_world_version
      AND job.worker_epoch = NEW.actor_job_worker_epoch
      AND job.claim_turn_worker_epoch = NEW.claim_turn_worker_epoch
      AND job.stage = 'claimed'
      AND actor.kind = 'person' AND actor.controller = 'agent'
      AND turn_row.stage = 'primary_settled'
      AND turn_row.worker_epoch = NEW.claim_turn_worker_epoch
      AND turn_row.frame_hash = NEW.frame_hash
      AND model.campaign_id = NEW.campaign_id
      AND model.turn_id = NEW.turn_id
      AND model.stage_id = NEW.stage_id
      AND model.kind = 'actor_replanner'
      AND model.attempt = NEW.attempt_number
      AND model.worker_epoch = NEW.model_worker_epoch
      AND model.status = 'started'
      AND model.requested_provider_id = NEW.requested_provider_id
      AND model.requested_model = NEW.requested_model
      AND model.requested_strategy = NEW.requested_strategy
  ) THEN RAISE(ABORT, 'campaign_play_actor_replan_attempt_identity_invalid') END;
  SELECT CASE WHEN NEW.attempt_number = 1 AND (
    NEW.model_worker_epoch <> NEW.actor_job_worker_epoch
    OR NEW.retry_consumed_at IS NOT NULL
    OR EXISTS (SELECT 1 FROM campaign_play_actor_replan_attempts prior WHERE prior.job_id = NEW.job_id)
  ) THEN RAISE(ABORT, 'campaign_play_actor_replan_attempt_initial_invalid') END;
  SELECT CASE WHEN NEW.attempt_number IN (2, 3) AND NOT EXISTS (
    SELECT 1
    FROM campaign_play_actor_replan_attempts prior
    JOIN campaign_play_model_stages prior_model ON prior_model.id = prior.model_stage_row_id
    WHERE prior.job_id = NEW.job_id
      AND prior.attempt_number = NEW.attempt_number - 1
      AND prior.campaign_id = NEW.campaign_id
      AND prior.turn_id = NEW.turn_id
      AND prior.actor_id = NEW.actor_id
      AND prior.stage_id = NEW.stage_id
      AND prior.actor_job_worker_epoch = NEW.actor_job_worker_epoch
      AND prior.claim_turn_worker_epoch = NEW.claim_turn_worker_epoch
      AND prior.frame_hash = NEW.frame_hash
      AND prior.frozen_base_world_version = NEW.frozen_base_world_version
      AND prior.requested_provider_id = NEW.requested_provider_id
      AND prior.requested_model = NEW.requested_model
      AND prior.requested_strategy = NEW.requested_strategy
      AND prior.retry_consumed_at = NEW.created_at
      AND NEW.model_worker_epoch = prior.model_worker_epoch + 1
      AND prior_model.status = 'interrupted'
      AND (
        (prior_model.schema_outcome = 'invalid'
          AND prior_model.error_code = 'model_contract_invalid'
          AND NEW.created_at < prior.deadline_at
          AND NEW.deadline_at > NEW.created_at
          AND NEW.deadline_at > prior.deadline_at)
        OR (prior_model.schema_outcome = 'transport_error'
          AND prior_model.error_code = 'provider_unavailable'
          AND NEW.created_at < prior.deadline_at
          AND NEW.deadline_at > NEW.created_at
          AND NEW.deadline_at > prior.deadline_at)
        OR (prior_model.schema_outcome = 'transport_error'
          AND prior_model.error_code = 'stage_timeout'
          AND NEW.created_at >= prior.deadline_at
          AND NEW.deadline_at > NEW.created_at
          AND NEW.deadline_at > prior.deadline_at)
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_replan_retry_not_authorized') END;
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_actor_replan_attempts_update_guard`
BEFORE UPDATE ON `campaign_play_actor_replan_attempts`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.attempt_id IS NOT OLD.attempt_id
    OR NEW.campaign_id IS NOT OLD.campaign_id
    OR NEW.job_id IS NOT OLD.job_id
    OR NEW.stage_id IS NOT OLD.stage_id
    OR NEW.model_stage_row_id IS NOT OLD.model_stage_row_id
    OR NEW.turn_id IS NOT OLD.turn_id
    OR NEW.actor_id IS NOT OLD.actor_id
    OR NEW.attempt_number IS NOT OLD.attempt_number
    OR NEW.model_worker_epoch IS NOT OLD.model_worker_epoch
    OR NEW.actor_job_worker_epoch IS NOT OLD.actor_job_worker_epoch
    OR NEW.claim_turn_worker_epoch IS NOT OLD.claim_turn_worker_epoch
    OR NEW.frame_hash IS NOT OLD.frame_hash
    OR NEW.frozen_base_world_version IS NOT OLD.frozen_base_world_version
    OR NEW.deadline_at IS NOT OLD.deadline_at
    OR NEW.requested_provider_id IS NOT OLD.requested_provider_id
    OR NEW.requested_model IS NOT OLD.requested_model
    OR NEW.requested_strategy IS NOT OLD.requested_strategy
    OR NEW.created_at IS NOT OLD.created_at
    OR OLD.attempt_number NOT IN (1, 2)
    OR OLD.retry_consumed_at IS NOT NULL
    OR NEW.retry_consumed_at IS NULL
    OR NEW.retry_consumed_at < OLD.created_at
    OR NOT EXISTS (
      SELECT 1 FROM campaign_play_model_stages model
      WHERE model.id = OLD.model_stage_row_id
        AND model.status = 'interrupted'
        AND (
          (model.schema_outcome = 'invalid' AND model.error_code = 'model_contract_invalid'
            AND NEW.retry_consumed_at < OLD.deadline_at)
          OR (model.schema_outcome = 'transport_error' AND model.error_code = 'provider_unavailable'
            AND NEW.retry_consumed_at < OLD.deadline_at)
          OR (model.schema_outcome = 'transport_error' AND model.error_code = 'stage_timeout'
            AND NEW.retry_consumed_at >= OLD.deadline_at)
        )
    )
    OR EXISTS (SELECT 1 FROM campaign_play_actor_replan_attempts later
      WHERE later.job_id = OLD.job_id AND later.attempt_number = OLD.attempt_number + 1)
    THEN RAISE(ABORT, 'campaign_play_actor_replan_attempt_identity_immutable') END;
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_actor_replan_attempts_delete_immutable`
BEFORE DELETE ON `campaign_play_actor_replan_attempts`
FOR EACH ROW
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_replan_attempt_immutable'); END;--> statement-breakpoint
PRAGMA foreign_keys=ON;
