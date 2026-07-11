CREATE TABLE `campaign_play_actor_due_sets` (
	`turn_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`settled_world_time_minutes` integer NOT NULL,
	`base_world_version` integer NOT NULL,
	`base_runtime_revision` integer NOT NULL,
	`decisions_json` text NOT NULL,
	`due_set_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_actor_due_sets_valid" CHECK("campaign_play_actor_due_sets"."settled_world_time_minutes" BETWEEN 0 AND 2147483647
        AND "campaign_play_actor_due_sets"."base_world_version" > 0
        AND "campaign_play_actor_due_sets"."base_runtime_revision" > 0
        AND json_valid("campaign_play_actor_due_sets"."decisions_json")
        AND json_type("campaign_play_actor_due_sets"."decisions_json") = 'array'
        AND length("campaign_play_actor_due_sets"."due_set_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_due_sets_campaign_created` ON `campaign_play_actor_due_sets` (`campaign_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaign_play_turn_results` (
	`turn_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`terminal_reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_turn_results_reason_valid" CHECK("campaign_play_turn_results"."terminal_reason" IN (
        'opening_completed',
        'action_resolved',
        'action_impossible',
        'clarification_requested',
        'terminal_failure'
      ))
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_play_turn_results_campaign_reason` ON `campaign_play_turn_results` (`campaign_id`,`terminal_reason`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_actor_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`due_reason` text NOT NULL,
	`frozen_base_world_version` integer NOT NULL,
	`worker_epoch` integer NOT NULL,
	`claim_turn_worker_epoch` integer,
	`stage` text NOT NULL,
	`proposal_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `campaign_play_actor_plans`(`plan_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_actor_jobs_valid" CHECK("__new_campaign_play_actor_jobs"."due_reason" IN ('scheduled', 'agency_debt', 'plan_retry')
      AND "__new_campaign_play_actor_jobs"."frozen_base_world_version" > 0
      AND "__new_campaign_play_actor_jobs"."worker_epoch" >= 0
      AND ("__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" IS NULL OR "__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" > 0)
      AND "__new_campaign_play_actor_jobs"."stage" IN ('queued', 'claimed', 'interrupted', 'proposed', 'settled', 'rejected', 'deferred')
      AND ("__new_campaign_play_actor_jobs"."stage" NOT IN ('claimed', 'interrupted', 'proposed') OR "__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" IS NOT NULL)
      AND ("__new_campaign_play_actor_jobs"."stage" <> 'queued' OR ("__new_campaign_play_actor_jobs"."worker_epoch" = 0 AND "__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" IS NULL))
      AND (("__new_campaign_play_actor_jobs"."stage" IN ('settled', 'rejected', 'deferred') AND "__new_campaign_play_actor_jobs"."completed_at" IS NOT NULL)
        OR ("__new_campaign_play_actor_jobs"."stage" NOT IN ('settled', 'rejected', 'deferred') AND "__new_campaign_play_actor_jobs"."completed_at" IS NULL))
      AND ("__new_campaign_play_actor_jobs"."stage" NOT IN ('proposed', 'settled') OR "__new_campaign_play_actor_jobs"."proposal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TEMP TABLE `__campaign_play_0031_actor_job_guard` (
  `in_flight_count` integer NOT NULL CHECK (`in_flight_count` = 0)
);--> statement-breakpoint
INSERT INTO `__campaign_play_0031_actor_job_guard` (`in_flight_count`)
SELECT count(*) FROM `campaign_play_actor_jobs` WHERE `stage` IN ('claimed', 'proposed');--> statement-breakpoint
DROP TABLE `__campaign_play_0031_actor_job_guard`;--> statement-breakpoint
INSERT INTO `__new_campaign_play_actor_jobs`("job_id", "campaign_id", "turn_id", "actor_id", "plan_id", "due_reason", "frozen_base_world_version", "worker_epoch", "claim_turn_worker_epoch", "stage", "proposal_id", "created_at", "completed_at") SELECT "job_id", "campaign_id", "turn_id", "actor_id", "plan_id", "due_reason", "frozen_base_world_version", "worker_epoch", NULL, "stage", "proposal_id", "created_at", "completed_at" FROM `campaign_play_actor_jobs`;--> statement-breakpoint
DROP TRIGGER campaign_play_commands_actor_job_parent_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_proposals_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_proposals_update_guard;--> statement-breakpoint
DROP TABLE `campaign_play_actor_jobs`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_actor_jobs` RENAME TO `campaign_play_actor_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_turn_actor_unique` ON `campaign_play_actor_jobs` (`turn_id`,`actor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_actor_pending_unique` ON `campaign_play_actor_jobs` (`actor_id`) WHERE "campaign_play_actor_jobs"."stage" IN ('queued', 'claimed', 'interrupted', 'proposed');--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_jobs_campaign_stage_created` ON `campaign_play_actor_jobs` (`campaign_id`,`stage`,`created_at`);--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_due_sets_insert_guard BEFORE INSERT ON campaign_play_actor_due_sets
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    JOIN campaign_play_states s ON s.campaign_id = t.campaign_id
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND t.stage = 'primary_settled'
      AND s.world_time_minutes = NEW.settled_world_time_minutes
      AND s.world_version = NEW.base_world_version
      AND s.runtime_revision = NEW.base_runtime_revision
  ) THEN RAISE(ABORT, 'campaign_play_actor_due_set_owner_invalid') END;
  SELECT CASE WHEN NEW.decisions_json <> json(NEW.decisions_json)
    THEN RAISE(ABORT, 'campaign_play_actor_due_set_json_invalid') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.decisions_json) decision
    WHERE json_type(decision.value) <> 'object'
      OR json_extract(decision.value, '$.dueOrder') <> decision.key
  ) THEN RAISE(ABORT, 'campaign_play_actor_due_set_decision_invalid') END;
  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.decisions_json) left_decision
    JOIN json_each(NEW.decisions_json) right_decision
      ON left_decision.key < right_decision.key
     AND (
       json_extract(left_decision.value, '$.actorId') = json_extract(right_decision.value, '$.actorId')
       OR json_extract(left_decision.value, '$.scheduleId') = json_extract(right_decision.value, '$.scheduleId')
     )
  ) THEN RAISE(ABORT, 'campaign_play_actor_due_set_duplicate_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_due_sets_update_immutable BEFORE UPDATE ON campaign_play_actor_due_sets
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_due_set_immutable'); END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_due_sets_delete_immutable BEFORE DELETE ON campaign_play_actor_due_sets
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_due_set_immutable'); END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_insert_guard BEFORE INSERT ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    JOIN campaign_play_actor_plans p ON p.plan_id = NEW.plan_id
    JOIN actors a ON a.id = NEW.actor_id
    JOIN campaign_play_actor_due_sets due_set ON due_set.turn_id = NEW.turn_id
    JOIN json_each(due_set.decisions_json) decision
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND p.campaign_id = NEW.campaign_id AND p.actor_id = NEW.actor_id
      AND a.campaign_id = NEW.campaign_id AND a.controller = 'agent'
      AND due_set.campaign_id = NEW.campaign_id
      AND due_set.base_world_version = NEW.frozen_base_world_version
      AND json_extract(decision.value, '$.jobId') = NEW.job_id
      AND json_extract(decision.value, '$.actorId') = NEW.actor_id
      AND json_extract(decision.value, '$.planId') = NEW.plan_id
      AND json_extract(decision.value, '$.dueReason') = NEW.due_reason
      AND json_extract(decision.value, '$.disposition') IN ('wake', 'defer')
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_owner_invalid') END;
  SELECT CASE WHEN NEW.stage <> 'queued' OR NEW.worker_epoch <> 0
    OR NEW.claim_turn_worker_epoch IS NOT NULL OR NEW.proposal_id IS NOT NULL
    THEN RAISE(ABORT, 'campaign_play_actor_job_initial_state_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_update_guard BEFORE UPDATE ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NEW.job_id <> OLD.job_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.turn_id <> OLD.turn_id OR NEW.actor_id <> OLD.actor_id
    OR NEW.plan_id <> OLD.plan_id OR NEW.due_reason <> OLD.due_reason
    OR NEW.frozen_base_world_version <> OLD.frozen_base_world_version
    OR NEW.created_at <> OLD.created_at
    OR (OLD.stage = 'proposed' AND NEW.proposal_id IS NOT OLD.proposal_id)
    OR NOT (
      (OLD.stage = 'queued' AND NEW.stage = 'claimed'
        AND NEW.worker_epoch = OLD.worker_epoch + 1
        AND OLD.claim_turn_worker_epoch IS NULL
        AND NEW.claim_turn_worker_epoch IS NOT NULL)
      OR (OLD.stage = 'queued' AND NEW.stage = 'deferred'
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS NULL)
      OR (OLD.stage = 'claimed' AND NEW.stage IN ('interrupted', 'proposed', 'rejected', 'deferred')
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch)
      OR (OLD.stage = 'interrupted' AND NEW.stage = 'claimed'
        AND NEW.worker_epoch = OLD.worker_epoch + 1
        AND NEW.claim_turn_worker_epoch IS NOT NULL
        AND NEW.claim_turn_worker_epoch <> OLD.claim_turn_worker_epoch)
      OR (OLD.stage = 'proposed' AND NEW.stage IN ('settled', 'rejected')
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch)
    )
    THEN RAISE(ABORT, 'campaign_play_actor_job_transition_invalid') END;
  SELECT CASE WHEN NEW.stage = 'claimed' AND NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND t.stage = 'primary_settled'
      AND t.worker_epoch = NEW.claim_turn_worker_epoch
      AND t.worker_lease_owner IS NOT NULL
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_turn_claim_invalid') END;
  SELECT CASE WHEN NEW.proposal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_proposals
    WHERE proposal_id = NEW.proposal_id AND job_id = NEW.job_id
      AND campaign_id = NEW.campaign_id AND actor_id = NEW.actor_id
      AND status = CASE NEW.stage
        WHEN 'proposed' THEN 'pending'
        WHEN 'settled' THEN 'accepted'
        WHEN 'rejected' THEN 'rejected'
        ELSE status
      END
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_proposal_invalid') END;
  SELECT CASE WHEN NEW.stage IN ('rejected', 'deferred')
    AND NEW.proposal_id IS NULL
    AND EXISTS (
      SELECT 1 FROM campaign_play_actor_proposals
      WHERE job_id = NEW.job_id AND campaign_id = NEW.campaign_id
    )
    THEN RAISE(ABORT, 'campaign_play_actor_job_pending_proposal_orphaned') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_delete_immutable BEFORE DELETE ON campaign_play_actor_jobs
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_job_immutable'); END;--> statement-breakpoint
CREATE TRIGGER campaign_play_commands_actor_job_parent_guard BEFORE INSERT ON campaign_play_commands
WHEN json_extract(NEW.causal_parent_json, '$.kind') = 'actor_job'
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_jobs job
    JOIN campaign_play_actor_proposals proposal
      ON proposal.proposal_id = job.proposal_id AND proposal.job_id = job.job_id
    JOIN json_each(proposal.commands_json) command
      ON json_extract(command.value, '$.commandId') = NEW.command_id
    WHERE job.job_id = json_extract(NEW.causal_parent_json, '$.jobId')
      AND job.campaign_id = NEW.campaign_id AND job.turn_id = NEW.turn_id
      AND job.actor_id = json_extract(NEW.source_json, '$.actorId')
      AND job.stage = 'proposed' AND proposal.status = 'pending'
      AND proposal.campaign_id = NEW.campaign_id AND proposal.actor_id = job.actor_id
      AND proposal.batch_id = NEW.batch_id
      AND json_extract(NEW.source_json, '$.kind') = 'actor'
      AND json_extract(command.value, '$.batchId') = NEW.batch_id
      AND json_extract(command.value, '$.order') = NEW.command_order
      AND json_extract(command.value, '$.kind') = NEW.command_kind
      AND json_extract(command.value, '$.causalParent.kind') = 'actor_job'
      AND json_extract(command.value, '$.causalParent.jobId') = job.job_id
      AND json_extract(command.value, '$.source.kind') = 'actor'
      AND json_extract(command.value, '$.source.actorId') = job.actor_id
      AND json_extract(command.value, '$.expectedWorldVersion') = NEW.expected_world_version
      AND json(json_extract(command.value, '$.readScope')) = json(NEW.read_scope_json)
      AND json(json_extract(command.value, '$.writeScope')) = json(NEW.write_scope_json)
      AND json(json_extract(command.value, '$.exposure')) = json(NEW.exposure_policy_json)
  ) THEN RAISE(ABORT, 'campaign_play_command_actor_job_parent_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_proposals_insert_guard BEFORE INSERT ON campaign_play_actor_proposals
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_jobs job
    JOIN campaign_play_states state ON state.campaign_id = job.campaign_id
    WHERE job.job_id = NEW.job_id AND job.campaign_id = NEW.campaign_id
      AND job.actor_id = NEW.actor_id
      AND job.frozen_base_world_version <= NEW.base_world_version
      AND state.world_version = NEW.base_world_version
      AND job.stage = 'claimed'
  ) THEN RAISE(ABORT, 'campaign_play_actor_proposal_job_invalid') END;
  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') IS NOT 'actor_job'
    OR json_extract(NEW.causal_parent_json, '$.jobId') IS NOT NEW.job_id
    OR NEW.status <> 'pending' OR json_extract(NEW.result_json, '$.status') IS NOT 'pending'
    THEN RAISE(ABORT, 'campaign_play_actor_proposal_initial_state_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_proposals_update_guard BEFORE UPDATE ON campaign_play_actor_proposals
BEGIN
  SELECT CASE WHEN NEW.proposal_id <> OLD.proposal_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.batch_id <> OLD.batch_id OR NEW.job_id <> OLD.job_id OR NEW.actor_id <> OLD.actor_id
    OR NEW.causal_parent_json <> OLD.causal_parent_json OR NEW.base_world_version <> OLD.base_world_version
    OR NEW.read_scope_json <> OLD.read_scope_json OR NEW.write_scope_json <> OLD.write_scope_json
    OR NEW.expires_at_world_time_minutes <> OLD.expires_at_world_time_minutes
    OR NEW.commands_json <> OLD.commands_json OR NEW.commands_hash <> OLD.commands_hash
    OR NEW.created_at <> OLD.created_at OR OLD.status <> 'pending'
    OR NEW.status NOT IN ('accepted', 'rejected')
    OR json_extract(NEW.result_json, '$.status') IS NOT NEW.status
    THEN RAISE(ABORT, 'campaign_play_actor_proposal_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_jobs
    WHERE job_id = NEW.job_id AND proposal_id = NEW.proposal_id
      AND campaign_id = NEW.campaign_id AND actor_id = NEW.actor_id
      AND stage = 'proposed'
  ) THEN RAISE(ABORT, 'campaign_play_actor_proposal_job_stage_invalid') END;
  SELECT CASE WHEN NEW.status = 'accepted' AND (
    json_type(NEW.result_json, '$.receiptIds') <> 'array'
    OR json_array_length(json_extract(NEW.result_json, '$.receiptIds')) <> json_array_length(NEW.commands_json)
    OR EXISTS (SELECT 1 FROM json_each(NEW.result_json, '$.receiptIds') r
      WHERE NOT EXISTS (SELECT 1 FROM campaign_play_receipts WHERE receipt_id = r.value AND campaign_id = NEW.campaign_id))
    OR EXISTS (
      SELECT 1 FROM json_each(NEW.commands_json) command
      LEFT JOIN json_each(NEW.result_json, '$.receiptIds') receipt_id
        ON receipt_id.key = command.key
      LEFT JOIN campaign_play_commands stored_command
        ON stored_command.command_id = json_extract(command.value, '$.commandId')
        AND stored_command.campaign_id = NEW.campaign_id
        AND stored_command.batch_id = NEW.batch_id
        AND stored_command.command_order = command.key
        AND stored_command.command_kind = json_extract(command.value, '$.kind')
        AND json_extract(stored_command.causal_parent_json, '$.kind') = 'actor_job'
        AND json_extract(stored_command.causal_parent_json, '$.jobId') = NEW.job_id
        AND json_extract(stored_command.source_json, '$.kind') = 'actor'
        AND json_extract(stored_command.source_json, '$.actorId') = NEW.actor_id
        AND stored_command.expected_world_version = json_extract(command.value, '$.expectedWorldVersion')
        AND json(stored_command.read_scope_json) = json(json_extract(command.value, '$.readScope'))
        AND json(stored_command.write_scope_json) = json(json_extract(command.value, '$.writeScope'))
        AND json(stored_command.exposure_policy_json) = json(json_extract(command.value, '$.exposure'))
      LEFT JOIN campaign_play_receipts receipt
        ON receipt.receipt_id = receipt_id.value
        AND receipt.command_id = stored_command.command_id
        AND receipt.campaign_id = NEW.campaign_id
      WHERE stored_command.command_id IS NULL OR receipt.receipt_id IS NULL
    )
    OR EXISTS (SELECT 1 FROM json_each(NEW.result_json, '$.receiptIds') l
      JOIN json_each(NEW.result_json, '$.receiptIds') r
        ON l.value IS r.value AND l.key < r.key)
    OR (SELECT world_time_minutes FROM campaign_play_states WHERE campaign_id = NEW.campaign_id) IS NULL
    OR (SELECT world_time_minutes FROM campaign_play_states WHERE campaign_id = NEW.campaign_id) >= NEW.expires_at_world_time_minutes
  ) THEN RAISE(ABORT, 'campaign_play_actor_proposal_acceptance_invalid') END;
  SELECT CASE WHEN NEW.status = 'rejected' AND (
    json_extract(NEW.result_json, '$.reason') IS NULL
    OR json_extract(NEW.result_json, '$.reason') NOT IN (
      'stale_world_version', 'precondition_failed', 'scope_denied', 'command_denied', 'expired'
    )
    OR (json_extract(NEW.result_json, '$.reason') = 'expired'
      AND (COALESCE((SELECT world_time_minutes FROM campaign_play_states
        WHERE campaign_id = NEW.campaign_id), -1) < NEW.expires_at_world_time_minutes))
  ) THEN RAISE(ABORT, 'campaign_play_actor_proposal_rejection_invalid') END;
END;--> statement-breakpoint
CREATE TEMP TABLE `__campaign_play_0031_turn_result_guard` (
  `completed_player_action_count` integer NOT NULL CHECK (`completed_player_action_count` = 0)
);--> statement-breakpoint
INSERT INTO `__campaign_play_0031_turn_result_guard` (`completed_player_action_count`)
SELECT count(*) FROM campaign_play_turns
WHERE stage = 'completed' AND turn_kind = 'player_action';--> statement-breakpoint
DROP TABLE `__campaign_play_0031_turn_result_guard`;--> statement-breakpoint
INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
SELECT id, campaign_id,
  CASE WHEN stage = 'failed' THEN 'terminal_failure' ELSE 'opening_completed' END,
  completed_at
FROM campaign_play_turns
WHERE stage = 'failed' OR (stage = 'completed' AND turn_kind = 'opening');--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_results_insert_guard BEFORE INSERT ON campaign_play_turn_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND t.stage IN ('completed', 'failed') AND t.completed_at = NEW.created_at
      AND NEW.terminal_reason = CASE
        WHEN t.stage = 'failed' THEN 'terminal_failure'
        WHEN t.turn_kind = 'opening' THEN 'opening_completed'
        WHEN EXISTS (
          SELECT 1 FROM campaign_play_model_stages j
          WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted'
            AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible'
        ) THEN 'action_impossible'
        WHEN EXISTS (
          SELECT 1 FROM campaign_play_model_stages j
          WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted'
            AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required'
        ) THEN 'clarification_requested'
        WHEN EXISTS (
          SELECT 1 FROM campaign_play_model_stages j
          WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted'
            AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')
        ) THEN 'action_resolved'
        ELSE 'invalid'
      END
  ) THEN RAISE(ABORT, 'campaign_play_turn_result_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_results_update_immutable BEFORE UPDATE ON campaign_play_turn_results
BEGIN SELECT RAISE(ABORT, 'campaign_play_turn_result_immutable'); END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_results_delete_immutable BEFORE DELETE ON campaign_play_turn_results
BEGIN SELECT RAISE(ABORT, 'campaign_play_turn_result_immutable'); END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_terminal_result AFTER UPDATE OF stage ON campaign_play_turns
WHEN NEW.stage IN ('completed', 'failed') AND OLD.stage NOT IN ('completed', 'failed')
BEGIN
  INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
  VALUES (
    NEW.id,
    NEW.campaign_id,
    CASE
      WHEN NEW.stage = 'failed' THEN 'terminal_failure'
      WHEN NEW.turn_kind = 'opening' THEN 'opening_completed'
      WHEN EXISTS (
        SELECT 1 FROM campaign_play_model_stages j
        WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted'
          AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible'
      ) THEN 'action_impossible'
      WHEN EXISTS (
        SELECT 1 FROM campaign_play_model_stages j
        WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted'
          AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required'
      ) THEN 'clarification_requested'
      WHEN EXISTS (
        SELECT 1 FROM campaign_play_model_stages j
        WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted'
          AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')
      ) THEN 'action_resolved'
      ELSE 'invalid'
    END,
    NEW.completed_at
  );
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_terminal_result_insert AFTER INSERT ON campaign_play_turns
WHEN NEW.stage IN ('completed', 'failed')
BEGIN
  INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
  VALUES (
    NEW.id,
    NEW.campaign_id,
    CASE
      WHEN NEW.stage = 'failed' THEN 'terminal_failure'
      WHEN NEW.turn_kind = 'opening' THEN 'opening_completed'
      WHEN EXISTS (
        SELECT 1 FROM campaign_play_model_stages j
        WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted'
          AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible'
      ) THEN 'action_impossible'
      WHEN EXISTS (
        SELECT 1 FROM campaign_play_model_stages j
        WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted'
          AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required'
      ) THEN 'clarification_requested'
      WHEN EXISTS (
        SELECT 1 FROM campaign_play_model_stages j
        WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted'
          AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')
      ) THEN 'action_resolved'
      ELSE 'invalid'
    END,
    NEW.completed_at
  );
END;
