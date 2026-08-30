DROP TRIGGER IF EXISTS `campaign_play_actor_replan_attempts_insert_guard`;--> statement-breakpoint
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
          AND NEW.deadline_at >= prior.deadline_at)
        OR (prior_model.schema_outcome = 'transport_error'
          AND prior_model.error_code = 'provider_unavailable'
          AND NEW.created_at < prior.deadline_at
          AND NEW.deadline_at > NEW.created_at
          AND NEW.deadline_at >= prior.deadline_at)
        OR (prior_model.schema_outcome = 'transport_error'
          AND prior_model.error_code = 'stage_timeout'
          AND NEW.created_at >= prior.deadline_at
          AND NEW.deadline_at > NEW.created_at
          AND NEW.deadline_at > prior.deadline_at)
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_replan_retry_not_authorized') END;
END;
