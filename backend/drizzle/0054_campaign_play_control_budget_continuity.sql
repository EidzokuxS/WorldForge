PRAGMA foreign_keys=OFF;--> statement-breakpoint
DROP TRIGGER campaign_play_commands_actor_job_parent_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_proposals_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_proposals_update_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_replan_attempts_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_replan_attempts_update_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_schedules_update_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_jobs_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_jobs_update_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_jobs_delete_immutable;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_actor_jobs` (
  `job_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `turn_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `admitted_plan_id` text,
  `plan_id` text,
  `due_reason` text NOT NULL,
  `frozen_base_world_version` integer NOT NULL,
  `worker_epoch` integer NOT NULL,
  `claim_turn_worker_epoch` integer,
  `stage` text NOT NULL,
  `proposal_id` text,
  `defer_reason` text,
  `created_at` integer NOT NULL,
  `completed_at` integer,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`admitted_plan_id`) REFERENCES `campaign_play_actor_plans`(`plan_id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`plan_id`) REFERENCES `campaign_play_actor_plans`(`plan_id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "campaign_play_actor_jobs_valid" CHECK(
    "__new_campaign_play_actor_jobs"."due_reason" IN ('scheduled', 'agency_debt', 'plan_retry')
    AND "__new_campaign_play_actor_jobs"."frozen_base_world_version" > 0
    AND "__new_campaign_play_actor_jobs"."worker_epoch" >= 0
    AND ("__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" IS NULL OR "__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" > 0)
    AND "__new_campaign_play_actor_jobs"."stage" IN ('queued', 'claimed', 'interrupted', 'proposed', 'settled', 'rejected', 'deferred')
    AND ("__new_campaign_play_actor_jobs"."stage" NOT IN ('claimed', 'interrupted', 'proposed') OR "__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" IS NOT NULL)
    AND ("__new_campaign_play_actor_jobs"."stage" <> 'queued' OR ("__new_campaign_play_actor_jobs"."worker_epoch" = 0 AND "__new_campaign_play_actor_jobs"."claim_turn_worker_epoch" IS NULL))
    AND (("__new_campaign_play_actor_jobs"."stage" IN ('settled', 'rejected', 'deferred') AND "__new_campaign_play_actor_jobs"."completed_at" IS NOT NULL)
      OR ("__new_campaign_play_actor_jobs"."stage" NOT IN ('settled', 'rejected', 'deferred') AND "__new_campaign_play_actor_jobs"."completed_at" IS NULL))
    AND (("__new_campaign_play_actor_jobs"."stage" = 'deferred'
        AND "__new_campaign_play_actor_jobs"."defer_reason" IS NOT NULL
        AND "__new_campaign_play_actor_jobs"."defer_reason" IN ('incapacitated', 'actor_capacity', 'replan_capacity', 'replan_invalid', 'control_budget'))
      OR ("__new_campaign_play_actor_jobs"."stage" <> 'deferred' AND "__new_campaign_play_actor_jobs"."defer_reason" IS NULL))
    AND ("__new_campaign_play_actor_jobs"."stage" NOT IN ('proposed', 'settled') OR "__new_campaign_play_actor_jobs"."proposal_id" IS NOT NULL)
  )
);--> statement-breakpoint
INSERT INTO `__new_campaign_play_actor_jobs`(
  `job_id`, `campaign_id`, `turn_id`, `actor_id`, `admitted_plan_id`, `plan_id`,
  `due_reason`, `frozen_base_world_version`, `worker_epoch`, `claim_turn_worker_epoch`,
  `stage`, `proposal_id`, `defer_reason`, `created_at`, `completed_at`
) SELECT
  `job_id`, `campaign_id`, `turn_id`, `actor_id`, `admitted_plan_id`, `plan_id`,
  `due_reason`, `frozen_base_world_version`, `worker_epoch`, `claim_turn_worker_epoch`,
  `stage`, `proposal_id`, `defer_reason`, `created_at`, `completed_at`
FROM `campaign_play_actor_jobs`;--> statement-breakpoint
DROP TABLE `campaign_play_actor_jobs`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_actor_jobs` RENAME TO `campaign_play_actor_jobs`;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_turn_actor_unique` ON `campaign_play_actor_jobs` (`turn_id`,`actor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_actor_pending_unique` ON `campaign_play_actor_jobs` (`actor_id`) WHERE `campaign_play_actor_jobs`.`stage` IN ('queued', 'claimed', 'interrupted', 'proposed');--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_jobs_campaign_stage_created` ON `campaign_play_actor_jobs` (`campaign_id`,`stage`,`created_at`);--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_schedules_update_guard BEFORE UPDATE ON campaign_play_actor_schedules
BEGIN
  SELECT CASE WHEN NEW.schedule_id <> OLD.schedule_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.actor_id <> OLD.actor_id OR NEW.created_at <> OLD.created_at
    OR NEW.updated_at <= OLD.updated_at
    OR (OLD.last_act_at_world_time_minutes IS NOT NULL AND (
      NEW.last_act_at_world_time_minutes IS NULL
      OR NEW.last_act_at_world_time_minutes < OLD.last_act_at_world_time_minutes
    ))
    OR (NEW.last_act_at_world_time_minutes IS NOT NULL
      AND NEW.last_act_at_world_time_minutes > NEW.next_act_at_world_time_minutes)
    THEN RAISE(ABORT, 'campaign_play_actor_schedule_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_plans
    WHERE plan_id = NEW.plan_id AND campaign_id = NEW.campaign_id
      AND actor_id = NEW.actor_id AND status = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_jobs job
    WHERE job.campaign_id = NEW.campaign_id AND job.actor_id = NEW.actor_id
      AND job.plan_id IS NEW.plan_id AND job.stage = 'deferred'
      AND (
        job.defer_reason IN ('replan_capacity', 'replan_invalid', 'control_budget')
        OR (job.defer_reason = 'actor_capacity' AND job.due_reason = 'plan_retry')
      )
      AND job.completed_at = NEW.updated_at
      AND NEW.plan_id IS OLD.plan_id
      AND NEW.agency_debt = MIN(100, OLD.agency_debt + 1)
    AND NEW.next_act_at_world_time_minutes > OLD.next_act_at_world_time_minutes
  ) THEN RAISE(ABORT, 'campaign_play_actor_schedule_plan_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_insert_guard BEFORE INSERT ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns turn_row
    JOIN actors actor ON actor.id = NEW.actor_id
    JOIN campaign_play_actor_schedules schedule
      ON schedule.campaign_id = NEW.campaign_id AND schedule.actor_id = NEW.actor_id
      AND schedule.plan_id IS NEW.admitted_plan_id
    JOIN campaign_play_actor_due_sets due_set ON due_set.turn_id = NEW.turn_id
    JOIN json_each(due_set.decisions_json) decision
    WHERE turn_row.id = NEW.turn_id AND turn_row.campaign_id = NEW.campaign_id
      AND actor.campaign_id = NEW.campaign_id AND actor.controller = 'agent' AND actor.kind = 'person'
      AND due_set.campaign_id = NEW.campaign_id
      AND due_set.base_world_version = NEW.frozen_base_world_version
      AND json_extract(decision.value, '$.jobId') = NEW.job_id
      AND json_extract(decision.value, '$.actorId') = NEW.actor_id
      AND json_extract(decision.value, '$.planId') IS NEW.admitted_plan_id
      AND json_extract(decision.value, '$.dueReason') = NEW.due_reason
      AND json_extract(decision.value, '$.disposition') IN ('wake', 'defer')
      AND (NEW.admitted_plan_id IS NULL OR EXISTS (
        SELECT 1 FROM campaign_play_actor_plans plan
        WHERE plan.plan_id = NEW.admitted_plan_id AND plan.campaign_id = NEW.campaign_id
          AND plan.actor_id = NEW.actor_id
      ))
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_owner_invalid') END;
  SELECT CASE WHEN NEW.plan_id IS NOT NEW.admitted_plan_id
    OR NEW.stage <> 'queued' OR NEW.worker_epoch <> 0
    OR NEW.claim_turn_worker_epoch IS NOT NULL OR NEW.proposal_id IS NOT NULL
    OR NEW.defer_reason IS NOT NULL
    THEN RAISE(ABORT, 'campaign_play_actor_job_initial_state_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_update_guard BEFORE UPDATE ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NEW.job_id <> OLD.job_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.turn_id <> OLD.turn_id OR NEW.actor_id <> OLD.actor_id
    OR NEW.admitted_plan_id IS NOT OLD.admitted_plan_id OR NEW.due_reason <> OLD.due_reason
    OR NEW.frozen_base_world_version <> OLD.frozen_base_world_version
    OR NEW.created_at <> OLD.created_at
    OR (OLD.stage = 'proposed' AND NEW.proposal_id IS NOT OLD.proposal_id)
    OR NOT (
      (OLD.stage = 'queued' AND NEW.stage = 'claimed'
        AND NEW.plan_id IS OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch + 1
        AND OLD.claim_turn_worker_epoch IS NULL
        AND NEW.claim_turn_worker_epoch IS NOT NULL
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'queued' AND NEW.stage = 'deferred'
        AND NEW.plan_id IS OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS NULL
        AND NEW.defer_reason IS NOT NULL
        AND NEW.defer_reason IN ('incapacitated', 'actor_capacity', 'replan_capacity', 'control_budget'))
      OR (OLD.stage = 'claimed' AND NEW.stage IN ('interrupted', 'proposed', 'rejected')
        AND NEW.plan_id IS OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'claimed' AND NEW.stage = 'deferred'
        AND NEW.plan_id IS OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.proposal_id IS NULL AND OLD.proposal_id IS NULL
        AND NEW.defer_reason IN ('replan_invalid', 'control_budget'))
      OR (OLD.stage = 'claimed' AND NEW.stage = 'claimed'
        AND NEW.plan_id IS NOT OLD.plan_id AND NEW.plan_id IS NOT NULL
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.proposal_id IS NULL AND OLD.proposal_id IS NULL
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'interrupted' AND NEW.stage = 'claimed'
        AND NEW.plan_id IS OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch + 1
        AND NEW.claim_turn_worker_epoch IS NOT NULL
        AND NEW.claim_turn_worker_epoch <> OLD.claim_turn_worker_epoch
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'proposed' AND NEW.stage IN ('settled', 'rejected')
        AND NEW.plan_id IS OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.defer_reason IS NULL)
    )
    THEN RAISE(ABORT, 'campaign_play_actor_job_transition_invalid') END;
  SELECT CASE WHEN NEW.stage = 'claimed' AND NOT EXISTS (
    SELECT 1 FROM campaign_play_turns turn_row
    WHERE turn_row.id = NEW.turn_id AND turn_row.campaign_id = NEW.campaign_id
      AND turn_row.stage = 'primary_settled'
      AND turn_row.worker_epoch = NEW.claim_turn_worker_epoch
      AND turn_row.worker_lease_owner IS NOT NULL
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_turn_claim_invalid') END;
  SELECT CASE WHEN OLD.stage = 'claimed' AND NEW.stage = 'claimed'
    AND NEW.plan_id IS NOT OLD.plan_id AND NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_plans plan
    JOIN campaign_play_actor_schedules schedule
      ON schedule.campaign_id = plan.campaign_id AND schedule.actor_id = plan.actor_id AND schedule.plan_id = plan.plan_id
    JOIN campaign_play_model_stages model
      ON model.campaign_id = plan.campaign_id AND model.turn_id = NEW.turn_id
      AND model.kind = 'actor_replanner' AND model.worker_epoch = NEW.worker_epoch
      AND model.status = 'accepted'
    WHERE plan.plan_id = NEW.plan_id AND plan.campaign_id = NEW.campaign_id
      AND plan.actor_id = NEW.actor_id AND plan.status = 'active'
      AND json_extract(model.artifact_json, '$.planId') = NEW.plan_id
      AND json_extract(model.artifact_json, '$.actorId') = NEW.actor_id
      AND (SELECT count(*) FROM campaign_play_model_stages accepted
        WHERE accepted.campaign_id = NEW.campaign_id AND accepted.turn_id = NEW.turn_id
          AND accepted.kind = 'actor_replanner' AND accepted.status = 'accepted') = 1
    UNION ALL
    SELECT 1 FROM campaign_play_actor_replan_attempts attempt
    JOIN campaign_play_model_stages model ON model.id = attempt.model_stage_row_id
    JOIN campaign_play_actor_plans plan ON plan.plan_id = NEW.plan_id
    JOIN campaign_play_actor_schedules schedule
      ON schedule.campaign_id = plan.campaign_id AND schedule.actor_id = plan.actor_id AND schedule.plan_id = plan.plan_id
    JOIN campaign_play_turns turn_row
      ON turn_row.id = NEW.turn_id AND turn_row.campaign_id = NEW.campaign_id
    WHERE attempt.job_id = NEW.job_id AND attempt.campaign_id = NEW.campaign_id
      AND attempt.turn_id = NEW.turn_id AND attempt.actor_id = NEW.actor_id
      AND attempt.actor_job_worker_epoch = NEW.worker_epoch
      AND attempt.claim_turn_worker_epoch = NEW.claim_turn_worker_epoch
      AND attempt.frozen_base_world_version = NEW.frozen_base_world_version
      AND attempt.frame_hash = turn_row.frame_hash
      AND model.id = attempt.model_stage_row_id
      AND model.stage_id = attempt.stage_id
      AND model.kind = 'actor_replanner' AND model.status = 'accepted'
      AND model.worker_epoch = attempt.model_worker_epoch
      AND model.completed_at IS NOT NULL
      AND model.completed_at < attempt.deadline_at
      AND model.requested_provider_id = attempt.requested_provider_id
      AND model.requested_model = attempt.requested_model
      AND model.requested_strategy = attempt.requested_strategy
      AND plan.campaign_id = NEW.campaign_id AND plan.actor_id = NEW.actor_id
      AND plan.status = 'active'
      AND json_extract(model.artifact_json, '$.planId') = NEW.plan_id
      AND json_extract(model.artifact_json, '$.actorId') = NEW.actor_id
      AND (SELECT count(*) FROM campaign_play_actor_replan_attempts accepted_attempt
        JOIN campaign_play_model_stages accepted_model ON accepted_model.id = accepted_attempt.model_stage_row_id
        WHERE accepted_attempt.job_id = NEW.job_id
          AND accepted_model.status = 'accepted') = 1
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_replan_invalid') END;
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
  SELECT CASE WHEN NEW.stage = 'rejected' AND NEW.proposal_id IS NULL
    AND EXISTS (
      SELECT 1 FROM campaign_play_actor_proposals
      WHERE job_id = NEW.job_id AND campaign_id = NEW.campaign_id
    ) THEN RAISE(ABORT, 'campaign_play_actor_job_pending_proposal_orphaned') END;
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
    OR EXISTS (SELECT 1 FROM json_each(NEW.result_json, '$.receiptIds') result_receipt
      WHERE NOT EXISTS (SELECT 1 FROM campaign_play_receipts
        WHERE campaign_play_receipts.receipt_id = result_receipt.value
          AND campaign_id = NEW.campaign_id))
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
    OR EXISTS (SELECT 1 FROM json_each(NEW.result_json, '$.receiptIds') left_id
      JOIN json_each(NEW.result_json, '$.receiptIds') right_id
        ON left_id.value IS right_id.value AND left_id.key < right_id.key)
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
DROP TRIGGER campaign_play_turn_results_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_turn_terminal_result;--> statement-breakpoint
DROP TRIGGER campaign_play_turn_terminal_result_insert;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_results_insert_guard BEFORE INSERT ON campaign_play_turn_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND t.stage IN ('completed', 'failed') AND t.completed_at = NEW.created_at
      AND NEW.terminal_reason = CASE
        WHEN t.stage = 'failed' THEN 'terminal_failure'
        WHEN t.turn_kind = 'opening' THEN 'opening_completed'
        WHEN json_extract(t.mutation_audit_json, '$.kind') = 'control_budget_continuity' THEN 'action_resolved'
        WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible') THEN 'action_impossible'
        WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required') THEN 'clarification_requested'
        WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')) OR (
          json_extract(t.input_json, '$.frame.executionRoute.kind') IN ('certified_move', 'certified_wait', 'certified_contact', 'certified_observe')
          AND json_extract(t.input_json, '$.frame.executionRoute.certificate.publicResult.disposition') = 'deterministic'
          AND json_extract(t.model_selection_json, '$.routeKind') = json_extract(t.input_json, '$.frame.executionRoute.kind')
        ) THEN 'action_resolved'
        ELSE 'invalid'
      END
  ) THEN RAISE(ABORT, 'campaign_play_turn_result_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_terminal_result AFTER UPDATE OF stage ON campaign_play_turns
WHEN NEW.stage IN ('completed', 'failed') AND OLD.stage NOT IN ('completed', 'failed')
BEGIN
  INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
  VALUES (NEW.id, NEW.campaign_id, CASE
    WHEN NEW.stage = 'failed' THEN 'terminal_failure'
    WHEN NEW.turn_kind = 'opening' THEN 'opening_completed'
    WHEN json_extract(NEW.mutation_audit_json, '$.kind') = 'control_budget_continuity' THEN 'action_resolved'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible') THEN 'action_impossible'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required') THEN 'clarification_requested'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')) OR (
      json_extract(NEW.input_json, '$.frame.executionRoute.kind') IN ('certified_move', 'certified_wait', 'certified_contact', 'certified_observe')
      AND json_extract(NEW.input_json, '$.frame.executionRoute.certificate.publicResult.disposition') = 'deterministic'
      AND json_extract(NEW.model_selection_json, '$.routeKind') = json_extract(NEW.input_json, '$.frame.executionRoute.kind')
    ) THEN 'action_resolved'
    ELSE 'invalid'
  END, NEW.completed_at);
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_terminal_result_insert AFTER INSERT ON campaign_play_turns
WHEN NEW.stage IN ('completed', 'failed')
BEGIN
  INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
  VALUES (NEW.id, NEW.campaign_id, CASE
    WHEN NEW.stage = 'failed' THEN 'terminal_failure'
    WHEN NEW.turn_kind = 'opening' THEN 'opening_completed'
    WHEN json_extract(NEW.mutation_audit_json, '$.kind') = 'control_budget_continuity' THEN 'action_resolved'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible') THEN 'action_impossible'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required') THEN 'clarification_requested'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')) OR (
      json_extract(NEW.input_json, '$.frame.executionRoute.kind') IN ('certified_move', 'certified_wait', 'certified_contact', 'certified_observe')
      AND json_extract(NEW.input_json, '$.frame.executionRoute.certificate.publicResult.disposition') = 'deterministic'
      AND json_extract(NEW.model_selection_json, '$.routeKind') = json_extract(NEW.input_json, '$.frame.executionRoute.kind')
    ) THEN 'action_resolved'
    ELSE 'invalid'
  END, NEW.completed_at);
END;--> statement-breakpoint
ALTER TABLE `campaign_play_narration_operations`
  ADD `source_kind` text NOT NULL DEFAULT 'model_accepted';--> statement-breakpoint
CREATE TRIGGER `campaign_play_narration_operations_source_kind_guard`
BEFORE UPDATE OF `source_kind`, `status`, `current_attempt`, `current_attempt_id`, `error_code`,
  `lease_owner`, `lease_expires_at`, `completed_at`
ON `campaign_play_narration_operations`
BEGIN
  SELECT CASE WHEN NEW.source_kind NOT IN ('model_accepted', 'deterministic_continuity')
    THEN RAISE(ABORT, 'campaign_play_narration_operation_source_kind_invalid') END;
  SELECT CASE WHEN NEW.source_kind = 'deterministic_continuity'
    AND (NEW.status <> 'complete' OR NEW.current_attempt <= 0 OR NEW.current_attempt_id IS NULL
      OR NEW.error_code IS NOT NULL OR NEW.lease_owner IS NOT NULL OR NEW.lease_expires_at IS NOT NULL
      OR NEW.completed_at IS NULL)
    THEN RAISE(ABORT, 'campaign_play_narration_operation_continuity_state_invalid') END;
  SELECT CASE WHEN OLD.source_kind = 'deterministic_continuity' AND NEW.source_kind <> OLD.source_kind
    THEN RAISE(ABORT, 'campaign_play_narration_operation_source_kind_immutable') END;
END;--> statement-breakpoint
CREATE TRIGGER `campaign_play_narration_operations_source_kind_insert_guard`
BEFORE INSERT ON `campaign_play_narration_operations`
BEGIN
  SELECT CASE WHEN NEW.source_kind NOT IN ('model_accepted', 'deterministic_continuity')
    OR NEW.source_kind <> 'model_accepted'
    THEN RAISE(ABORT, 'campaign_play_narration_operation_source_kind_invalid') END;
END;--> statement-breakpoint
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
    JOIN campaign_play_model_stages model
      ON model.id = NEW.model_stage_row_id
    WHERE job.job_id = NEW.job_id
      AND job.campaign_id = NEW.campaign_id
      AND job.turn_id = NEW.turn_id
      AND job.actor_id = NEW.actor_id
      AND job.frozen_base_world_version = NEW.frozen_base_world_version
      AND NEW.deadline_at > NEW.created_at
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
  SELECT CASE WHEN NEW.attempt_number = 2 AND NOT EXISTS (
    SELECT 1
    FROM campaign_play_actor_replan_attempts prior
    JOIN campaign_play_model_stages prior_model ON prior_model.id = prior.model_stage_row_id
    WHERE prior.job_id = NEW.job_id
      AND prior.attempt_number = 1
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
      AND (
        (prior_model.schema_outcome = 'invalid'
          AND prior_model.error_code = 'model_contract_invalid'
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
    OR OLD.attempt_number <> 1
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
          OR (model.schema_outcome = 'transport_error' AND model.error_code = 'stage_timeout'
            AND NEW.retry_consumed_at >= OLD.deadline_at)
        )
    )
    OR EXISTS (SELECT 1 FROM campaign_play_actor_replan_attempts later
      WHERE later.job_id = OLD.job_id AND later.attempt_number = 2)
    THEN RAISE(ABORT, 'campaign_play_actor_replan_attempt_identity_immutable') END;
END;
