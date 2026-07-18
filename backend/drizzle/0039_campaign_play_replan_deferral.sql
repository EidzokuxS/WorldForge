PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_actor_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`admitted_plan_id` text NOT NULL,
	`plan_id` text NOT NULL,
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
	CONSTRAINT "campaign_play_actor_jobs_valid" CHECK("__new_campaign_play_actor_jobs"."due_reason" IN ('scheduled', 'agency_debt', 'plan_retry')
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
          AND "__new_campaign_play_actor_jobs"."defer_reason" IN ('incapacitated', 'actor_capacity', 'replan_capacity', 'replan_invalid'))
        OR ("__new_campaign_play_actor_jobs"."stage" <> 'deferred' AND "__new_campaign_play_actor_jobs"."defer_reason" IS NULL))
      AND ("__new_campaign_play_actor_jobs"."stage" NOT IN ('proposed', 'settled') OR "__new_campaign_play_actor_jobs"."proposal_id" IS NOT NULL))
);--> statement-breakpoint
INSERT INTO `__new_campaign_play_actor_jobs`(
  "job_id", "campaign_id", "turn_id", "actor_id", "admitted_plan_id", "plan_id",
  "due_reason", "frozen_base_world_version", "worker_epoch", "claim_turn_worker_epoch",
  "stage", "proposal_id", "defer_reason", "created_at", "completed_at"
) SELECT
  "job_id", "campaign_id", "turn_id", "actor_id", "admitted_plan_id", "plan_id",
  "due_reason", "frozen_base_world_version", "worker_epoch", "claim_turn_worker_epoch",
  "stage", "proposal_id", "defer_reason", "created_at", "completed_at"
FROM `campaign_play_actor_jobs`;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_schedules_update_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_commands_actor_job_parent_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_proposals_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_actor_proposals_update_guard;--> statement-breakpoint
DROP TABLE `campaign_play_actor_jobs`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_actor_jobs` RENAME TO `campaign_play_actor_jobs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_turn_actor_unique` ON `campaign_play_actor_jobs` (`turn_id`,`actor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_actor_pending_unique` ON `campaign_play_actor_jobs` (`actor_id`) WHERE "campaign_play_actor_jobs"."stage" IN ('queued', 'claimed', 'interrupted', 'proposed');--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_jobs_campaign_stage_created` ON `campaign_play_actor_jobs` (`campaign_id`,`stage`,`created_at`);--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_insert_guard BEFORE INSERT ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    JOIN campaign_play_actor_plans p ON p.plan_id = NEW.admitted_plan_id
    JOIN actors a ON a.id = NEW.actor_id
    JOIN campaign_play_actor_due_sets due_set ON due_set.turn_id = NEW.turn_id
    JOIN json_each(due_set.decisions_json) decision
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND p.campaign_id = NEW.campaign_id AND p.actor_id = NEW.actor_id
      AND a.campaign_id = NEW.campaign_id AND a.controller = 'agent' AND a.kind = 'person'
      AND due_set.campaign_id = NEW.campaign_id
      AND due_set.base_world_version = NEW.frozen_base_world_version
      AND json_extract(decision.value, '$.jobId') = NEW.job_id
      AND json_extract(decision.value, '$.actorId') = NEW.actor_id
      AND json_extract(decision.value, '$.planId') = NEW.admitted_plan_id
      AND json_extract(decision.value, '$.dueReason') = NEW.due_reason
      AND json_extract(decision.value, '$.disposition') IN ('wake', 'defer')
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_owner_invalid') END;
  SELECT CASE WHEN NEW.plan_id <> NEW.admitted_plan_id
    OR NEW.stage <> 'queued' OR NEW.worker_epoch <> 0
    OR NEW.claim_turn_worker_epoch IS NOT NULL OR NEW.proposal_id IS NOT NULL
    OR NEW.defer_reason IS NOT NULL
    THEN RAISE(ABORT, 'campaign_play_actor_job_initial_state_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_update_guard BEFORE UPDATE ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NEW.job_id <> OLD.job_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.turn_id <> OLD.turn_id OR NEW.actor_id <> OLD.actor_id
    OR NEW.admitted_plan_id <> OLD.admitted_plan_id OR NEW.due_reason <> OLD.due_reason
    OR NEW.frozen_base_world_version <> OLD.frozen_base_world_version
    OR NEW.created_at <> OLD.created_at
    OR (OLD.stage = 'proposed' AND NEW.proposal_id IS NOT OLD.proposal_id)
    OR NOT (
      (OLD.stage = 'queued' AND NEW.stage = 'claimed'
        AND NEW.plan_id = OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch + 1
        AND OLD.claim_turn_worker_epoch IS NULL
        AND NEW.claim_turn_worker_epoch IS NOT NULL
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'queued' AND NEW.stage = 'deferred'
        AND NEW.plan_id = OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS NULL
        AND NEW.defer_reason IS NOT NULL
        AND NEW.defer_reason IN ('incapacitated', 'actor_capacity', 'replan_capacity'))
      OR (OLD.stage = 'claimed' AND NEW.stage IN ('interrupted', 'proposed', 'rejected')
        AND NEW.plan_id = OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'claimed' AND NEW.stage = 'deferred'
        AND NEW.plan_id = OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.proposal_id IS NULL AND OLD.proposal_id IS NULL
        AND NEW.defer_reason IS 'replan_invalid')
      OR (OLD.stage = 'claimed' AND NEW.stage = 'claimed'
        AND NEW.plan_id <> OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.proposal_id IS NULL AND OLD.proposal_id IS NULL
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'interrupted' AND NEW.stage = 'claimed'
        AND NEW.plan_id = OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch + 1
        AND NEW.claim_turn_worker_epoch IS NOT NULL
        AND NEW.claim_turn_worker_epoch <> OLD.claim_turn_worker_epoch
        AND NEW.defer_reason IS NULL)
      OR (OLD.stage = 'proposed' AND NEW.stage IN ('settled', 'rejected')
        AND NEW.plan_id = OLD.plan_id
        AND NEW.worker_epoch = OLD.worker_epoch
        AND NEW.claim_turn_worker_epoch IS OLD.claim_turn_worker_epoch
        AND NEW.defer_reason IS NULL)
    )
    THEN RAISE(ABORT, 'campaign_play_actor_job_transition_invalid') END;
  SELECT CASE WHEN NEW.stage = 'claimed' AND NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND t.stage = 'primary_settled'
      AND t.worker_epoch = NEW.claim_turn_worker_epoch
      AND t.worker_lease_owner IS NOT NULL
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_turn_claim_invalid') END;
  SELECT CASE WHEN OLD.stage = 'claimed' AND NEW.stage = 'claimed'
    AND NEW.plan_id <> OLD.plan_id AND NOT EXISTS (
      SELECT 1 FROM campaign_play_actor_plans p
      JOIN campaign_play_actor_schedules s
        ON s.campaign_id = p.campaign_id AND s.actor_id = p.actor_id AND s.plan_id = p.plan_id
      JOIN campaign_play_model_stages m
        ON m.campaign_id = p.campaign_id AND m.turn_id = NEW.turn_id
        AND m.kind = 'actor_replanner' AND m.worker_epoch = NEW.worker_epoch
        AND m.status = 'accepted'
      WHERE p.plan_id = NEW.plan_id AND p.campaign_id = NEW.campaign_id
        AND p.actor_id = NEW.actor_id AND p.status = 'active'
        AND json_extract(m.artifact_json, '$.planId') = NEW.plan_id
        AND json_extract(m.artifact_json, '$.actorId') = NEW.actor_id
        AND (SELECT count(*) FROM campaign_play_model_stages accepted
          WHERE accepted.campaign_id = NEW.campaign_id AND accepted.turn_id = NEW.turn_id
            AND accepted.kind = 'actor_replanner' AND accepted.status = 'accepted') = 1
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
    )
    THEN RAISE(ABORT, 'campaign_play_actor_job_pending_proposal_orphaned') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_delete_immutable BEFORE DELETE ON campaign_play_actor_jobs
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_job_immutable'); END;--> statement-breakpoint
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
      AND job.plan_id = NEW.plan_id AND job.stage = 'deferred'
      AND (
        job.defer_reason IN ('replan_capacity', 'replan_invalid')
        OR (job.defer_reason = 'actor_capacity' AND job.due_reason = 'plan_retry')
      )
      AND job.completed_at = NEW.updated_at
      AND NEW.plan_id = OLD.plan_id
      AND NEW.agency_debt = MIN(100, OLD.agency_debt + 1)
      AND NEW.next_act_at_world_time_minutes > OLD.next_act_at_world_time_minutes
  ) THEN RAISE(ABORT, 'campaign_play_actor_schedule_plan_invalid') END;
END;
--> statement-breakpoint
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
END;
