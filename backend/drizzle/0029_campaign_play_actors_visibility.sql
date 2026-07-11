CREATE TABLE `campaign_play_actor_jobs` (
	`job_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`due_reason` text NOT NULL,
	`frozen_base_world_version` integer NOT NULL,
	`worker_epoch` integer NOT NULL,
	`stage` text NOT NULL,
	`proposal_id` text,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `campaign_play_actor_plans`(`plan_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_actor_jobs_valid" CHECK("campaign_play_actor_jobs"."due_reason" IN ('scheduled', 'agency_debt', 'plan_retry')
      AND "campaign_play_actor_jobs"."frozen_base_world_version" > 0
      AND "campaign_play_actor_jobs"."worker_epoch" >= 0
      AND "campaign_play_actor_jobs"."stage" IN ('queued', 'claimed', 'proposed', 'settled', 'rejected', 'deferred')
      AND (("campaign_play_actor_jobs"."stage" IN ('settled', 'rejected', 'deferred') AND "campaign_play_actor_jobs"."completed_at" IS NOT NULL)
        OR ("campaign_play_actor_jobs"."stage" NOT IN ('settled', 'rejected', 'deferred') AND "campaign_play_actor_jobs"."completed_at" IS NULL))
      AND ("campaign_play_actor_jobs"."stage" NOT IN ('proposed', 'settled') OR "campaign_play_actor_jobs"."proposal_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_turn_actor_unique` ON `campaign_play_actor_jobs` (`turn_id`,`actor_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_jobs_actor_pending_unique` ON `campaign_play_actor_jobs` (`actor_id`) WHERE "campaign_play_actor_jobs"."stage" IN ('queued', 'claimed', 'proposed');--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_jobs_campaign_stage_created` ON `campaign_play_actor_jobs` (`campaign_id`,`stage`,`created_at`);--> statement-breakpoint
CREATE TABLE `campaign_play_actor_knowledge` (
	`knowledge_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`event_id` text NOT NULL,
	`exposure_id` text NOT NULL,
	`channel` text NOT NULL,
	`source_location_id` text,
	`source_route_id` text,
	`source_trigger` text,
	`source_witness_actor_id` text,
	`perceived_actor_id` text,
	`source_json` text NOT NULL,
	`source_hash` text NOT NULL,
	`learned_at_world_time_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `campaign_play_events`(`event_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exposure_id`) REFERENCES `campaign_play_event_exposures`(`exposure_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_route_id`) REFERENCES `location_edges`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_witness_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`perceived_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_actor_knowledge_valid" CHECK("campaign_play_actor_knowledge"."channel" IN ('direct_perception', 'local_aftermath', 'route_state', 'witness_report')
      AND ("campaign_play_actor_knowledge"."source_trigger" IS NULL OR "campaign_play_actor_knowledge"."source_trigger" IN ('inspect', 'attempt', 'traverse'))
      AND json_valid("campaign_play_actor_knowledge"."source_json")
      AND json_type("campaign_play_actor_knowledge"."source_json") = 'object'
      AND length("campaign_play_actor_knowledge"."source_hash") = 64
      AND "campaign_play_actor_knowledge"."learned_at_world_time_minutes" BETWEEN 0 AND 2147483647)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_knowledge_provenance_unique` ON `campaign_play_actor_knowledge` (`actor_id`,`event_id`,`channel`,`source_hash`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_knowledge_campaign_exposure` ON `campaign_play_actor_knowledge` (`campaign_id`,`exposure_id`);--> statement-breakpoint
CREATE TABLE `campaign_play_actor_plans` (
	`plan_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`goal_id` text NOT NULL,
	`plan_version` integer NOT NULL,
	`intent_json` text NOT NULL,
	`preconditions_json` text NOT NULL,
	`cadence_minutes` integer NOT NULL,
	`priority` integer NOT NULL,
	`steps_json` text NOT NULL,
	`status` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`goal_id`) REFERENCES `actor_goals`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_actor_plans_valid" CHECK("campaign_play_actor_plans"."plan_version" > 0
      AND "campaign_play_actor_plans"."cadence_minutes" BETWEEN 1 AND 10080
      AND "campaign_play_actor_plans"."priority" BETWEEN 1 AND 5
      AND "campaign_play_actor_plans"."status" IN ('active', 'completed', 'blocked')
      AND json_valid("campaign_play_actor_plans"."intent_json") AND json_type("campaign_play_actor_plans"."intent_json") = 'object'
      AND json_valid("campaign_play_actor_plans"."preconditions_json") AND json_type("campaign_play_actor_plans"."preconditions_json") = 'array'
      AND json_array_length("campaign_play_actor_plans"."preconditions_json") <= 8
      AND json_valid("campaign_play_actor_plans"."steps_json") AND json_type("campaign_play_actor_plans"."steps_json") = 'array'
      AND json_array_length("campaign_play_actor_plans"."steps_json") BETWEEN 1 AND 8)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_plans_actor_version_unique` ON `campaign_play_actor_plans` (`actor_id`,`plan_version`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_plans_actor_active_unique` ON `campaign_play_actor_plans` (`actor_id`) WHERE "campaign_play_actor_plans"."status" = 'active';--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_plans_campaign_status` ON `campaign_play_actor_plans` (`campaign_id`,`status`);--> statement-breakpoint
CREATE TABLE `campaign_play_actor_proposals` (
	`proposal_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`batch_id` text NOT NULL,
	`job_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`causal_parent_json` text NOT NULL,
	`base_world_version` integer NOT NULL,
	`read_scope_json` text NOT NULL,
	`write_scope_json` text NOT NULL,
	`expires_at_world_time_minutes` integer NOT NULL,
	`commands_json` text NOT NULL,
	`commands_hash` text NOT NULL,
	`status` text NOT NULL,
	`result_json` text NOT NULL,
	`result_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `campaign_play_actor_jobs`(`job_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_actor_proposals_valid" CHECK(length("campaign_play_actor_proposals"."batch_id") > 0
      AND "campaign_play_actor_proposals"."base_world_version" > 0
      AND "campaign_play_actor_proposals"."expires_at_world_time_minutes" BETWEEN 0 AND 2147483647
      AND "campaign_play_actor_proposals"."status" IN ('pending', 'accepted', 'rejected')
      AND json_valid("campaign_play_actor_proposals"."causal_parent_json") AND json_type("campaign_play_actor_proposals"."causal_parent_json") = 'object'
      AND json_valid("campaign_play_actor_proposals"."read_scope_json") AND json_type("campaign_play_actor_proposals"."read_scope_json") = 'array'
      AND json_array_length("campaign_play_actor_proposals"."read_scope_json") <= 16
      AND json_valid("campaign_play_actor_proposals"."write_scope_json") AND json_type("campaign_play_actor_proposals"."write_scope_json") = 'array'
      AND json_array_length("campaign_play_actor_proposals"."write_scope_json") <= 16
      AND json_valid("campaign_play_actor_proposals"."commands_json") AND json_type("campaign_play_actor_proposals"."commands_json") = 'array'
      AND json_array_length("campaign_play_actor_proposals"."commands_json") BETWEEN 1 AND 8
      AND json_valid("campaign_play_actor_proposals"."result_json") AND json_type("campaign_play_actor_proposals"."result_json") = 'object'
      AND length("campaign_play_actor_proposals"."commands_hash") = 64 AND length("campaign_play_actor_proposals"."result_hash") = 64
      AND (("campaign_play_actor_proposals"."status" = 'pending' AND "campaign_play_actor_proposals"."completed_at" IS NULL)
        OR ("campaign_play_actor_proposals"."status" IN ('accepted', 'rejected') AND "campaign_play_actor_proposals"."completed_at" IS NOT NULL)))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_proposals_job_unique` ON `campaign_play_actor_proposals` (`job_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_proposals_campaign_batch_unique` ON `campaign_play_actor_proposals` (`campaign_id`,`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_proposals_campaign_status_expiry` ON `campaign_play_actor_proposals` (`campaign_id`,`status`,`expires_at_world_time_minutes`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_proposals_campaign_base_version` ON `campaign_play_actor_proposals` (`campaign_id`,`base_world_version`);--> statement-breakpoint
CREATE TABLE `campaign_play_actor_schedules` (
	`schedule_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`plan_id` text NOT NULL,
	`next_act_at_world_time_minutes` integer NOT NULL,
	`last_act_at_world_time_minutes` integer,
	`priority` integer NOT NULL,
	`agency_debt` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`plan_id`) REFERENCES `campaign_play_actor_plans`(`plan_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_actor_schedules_valid" CHECK("campaign_play_actor_schedules"."next_act_at_world_time_minutes" BETWEEN 0 AND 2147483647
      AND ("campaign_play_actor_schedules"."last_act_at_world_time_minutes" IS NULL OR "campaign_play_actor_schedules"."last_act_at_world_time_minutes" BETWEEN 0 AND 2147483647)
      AND "campaign_play_actor_schedules"."priority" BETWEEN 1 AND 5
      AND "campaign_play_actor_schedules"."agency_debt" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_schedules_actor_unique` ON `campaign_play_actor_schedules` (`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_schedules_campaign_due` ON `campaign_play_actor_schedules` (`campaign_id`,`next_act_at_world_time_minutes`,`priority`,`actor_id`);--> statement-breakpoint
CREATE TABLE `campaign_play_observations` (
	`observation_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`human_actor_id` text NOT NULL,
	`event_id` text NOT NULL,
	`exposure_id` text NOT NULL,
	`channel` text NOT NULL,
	`source_location_id` text,
	`source_route_id` text,
	`source_trigger` text,
	`source_witness_actor_id` text,
	`perceived_actor_id` text,
	`source_json` text NOT NULL,
	`source_hash` text NOT NULL,
	`public_entry_json` text NOT NULL,
	`public_entry_hash` text NOT NULL,
	`world_time_minutes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`human_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `campaign_play_events`(`event_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`exposure_id`) REFERENCES `campaign_play_event_exposures`(`exposure_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source_location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_route_id`) REFERENCES `location_edges`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_witness_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`perceived_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_observations_valid" CHECK("campaign_play_observations"."channel" IN ('direct_perception', 'local_aftermath', 'route_state', 'witness_report')
      AND ("campaign_play_observations"."source_trigger" IS NULL OR "campaign_play_observations"."source_trigger" IN ('inspect', 'attempt', 'traverse'))
      AND json_valid("campaign_play_observations"."source_json")
      AND json_type("campaign_play_observations"."source_json") = 'object'
      AND json_valid("campaign_play_observations"."public_entry_json")
      AND json_type("campaign_play_observations"."public_entry_json") = 'object'
      AND length("campaign_play_observations"."source_hash") = 64
      AND length("campaign_play_observations"."public_entry_hash") = 64
      AND "campaign_play_observations"."world_time_minutes" BETWEEN 0 AND 2147483647)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_observations_provenance_unique` ON `campaign_play_observations` (`human_actor_id`,`event_id`,`exposure_id`,`channel`,`source_hash`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_observations_campaign_time` ON `campaign_play_observations` (`campaign_id`,`world_time_minutes`);
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_plans_insert_guard BEFORE INSERT ON campaign_play_actor_plans
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM actor_goals g JOIN actors a ON a.id = g.actor_id
    WHERE g.id = NEW.goal_id AND g.actor_id = NEW.actor_id
      AND g.campaign_id = NEW.campaign_id AND a.campaign_id = NEW.campaign_id
      AND a.controller = 'agent'
  ) THEN RAISE(ABORT, 'campaign_play_actor_plan_owner_invalid') END;
  SELECT CASE WHEN NEW.plan_version <> COALESCE((
    SELECT MAX(plan_version) + 1 FROM campaign_play_actor_plans WHERE actor_id = NEW.actor_id
  ), 1) THEN RAISE(ABORT, 'campaign_play_actor_plan_version_invalid') END;
  SELECT CASE WHEN NEW.status <> 'active' OR NEW.created_at <> NEW.updated_at
    THEN RAISE(ABORT, 'campaign_play_actor_plan_initial_state_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_plans_update_guard BEFORE UPDATE ON campaign_play_actor_plans
BEGIN
  SELECT CASE WHEN NEW.plan_id <> OLD.plan_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.actor_id <> OLD.actor_id OR NEW.goal_id <> OLD.goal_id
    OR NEW.plan_version <> OLD.plan_version OR NEW.intent_json <> OLD.intent_json
    OR NEW.preconditions_json <> OLD.preconditions_json OR NEW.cadence_minutes <> OLD.cadence_minutes
    OR NEW.priority <> OLD.priority OR NEW.steps_json <> OLD.steps_json
    OR OLD.status <> 'active' OR NEW.status NOT IN ('completed', 'blocked')
    OR NEW.updated_at <= OLD.updated_at
    THEN RAISE(ABORT, 'campaign_play_actor_plan_transition_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_plans_delete_immutable BEFORE DELETE ON campaign_play_actor_plans
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_plan_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_schedules_insert_guard BEFORE INSERT ON campaign_play_actor_schedules
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_plans
    WHERE plan_id = NEW.plan_id AND campaign_id = NEW.campaign_id
      AND actor_id = NEW.actor_id AND status = 'active'
  ) THEN RAISE(ABORT, 'campaign_play_actor_schedule_plan_invalid') END;
  SELECT CASE WHEN NEW.last_act_at_world_time_minutes IS NOT NULL
    AND NEW.last_act_at_world_time_minutes > NEW.next_act_at_world_time_minutes
    THEN RAISE(ABORT, 'campaign_play_actor_schedule_time_invalid') END;
END;
--> statement-breakpoint
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
  ) THEN RAISE(ABORT, 'campaign_play_actor_schedule_plan_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_schedules_delete_immutable BEFORE DELETE ON campaign_play_actor_schedules
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_schedule_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_insert_guard BEFORE INSERT ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    JOIN campaign_play_actor_plans p ON p.plan_id = NEW.plan_id
    JOIN actors a ON a.id = NEW.actor_id
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND p.campaign_id = NEW.campaign_id AND p.actor_id = NEW.actor_id
      AND a.campaign_id = NEW.campaign_id AND a.controller = 'agent'
  ) THEN RAISE(ABORT, 'campaign_play_actor_job_owner_invalid') END;
  SELECT CASE WHEN NEW.stage <> 'queued' OR NEW.worker_epoch <> 0 OR NEW.proposal_id IS NOT NULL
    THEN RAISE(ABORT, 'campaign_play_actor_job_initial_state_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_update_guard BEFORE UPDATE ON campaign_play_actor_jobs
BEGIN
  SELECT CASE WHEN NEW.job_id <> OLD.job_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.turn_id <> OLD.turn_id OR NEW.actor_id <> OLD.actor_id
    OR NEW.plan_id <> OLD.plan_id OR NEW.due_reason <> OLD.due_reason
    OR NEW.frozen_base_world_version <> OLD.frozen_base_world_version
    OR NEW.created_at <> OLD.created_at OR NEW.worker_epoch < OLD.worker_epoch
    OR (NEW.stage IN ('claimed', 'proposed') AND NEW.worker_epoch <= 0)
    OR (OLD.stage = 'proposed' AND NEW.proposal_id IS NOT OLD.proposal_id)
    OR NOT ((OLD.stage = 'queued' AND NEW.stage IN ('claimed', 'deferred'))
      OR (OLD.stage = 'claimed' AND NEW.stage IN ('proposed', 'rejected', 'deferred'))
      OR (OLD.stage = 'proposed' AND NEW.stage IN ('settled', 'rejected')))
    THEN RAISE(ABORT, 'campaign_play_actor_job_transition_invalid') END;
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
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_jobs_delete_immutable BEFORE DELETE ON campaign_play_actor_jobs
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_job_immutable'); END;
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
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
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
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_proposals_delete_immutable BEFORE DELETE ON campaign_play_actor_proposals
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_proposal_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_knowledge_insert_guard BEFORE INSERT ON campaign_play_actor_knowledge
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM actors a JOIN campaign_play_events e ON e.event_id = NEW.event_id
    JOIN campaign_play_event_exposures x ON x.exposure_id = NEW.exposure_id AND x.event_id = e.event_id
    WHERE a.id = NEW.actor_id AND a.campaign_id = NEW.campaign_id
      AND e.campaign_id = NEW.campaign_id AND x.campaign_id = NEW.campaign_id AND x.channel = NEW.channel
  ) THEN RAISE(ABORT, 'campaign_play_actor_knowledge_owner_invalid') END;
  SELECT CASE WHEN NOT (
    (NEW.channel = 'direct_perception' AND NEW.source_location_id IS NOT NULL
      AND NEW.source_route_id IS NULL AND NEW.source_trigger IS NULL AND NEW.source_witness_actor_id IS NULL
      AND json_extract(NEW.source_json, '$.channel') = NEW.channel
      AND json_extract(NEW.source_json, '$.locationId') = NEW.source_location_id
      AND json_extract(NEW.source_json, '$.perceivedActorId') IS NEW.perceived_actor_id
      AND (NEW.perceived_actor_id IS NULL OR EXISTS (
        SELECT 1 FROM actors WHERE id = NEW.perceived_actor_id AND campaign_id = NEW.campaign_id
      ))
      AND EXISTS (SELECT 1 FROM campaign_play_event_exposures WHERE exposure_id = NEW.exposure_id AND location_id = NEW.source_location_id))
    OR (NEW.channel = 'local_aftermath' AND NEW.source_location_id IS NOT NULL
      AND NEW.source_route_id IS NULL AND NEW.source_trigger IS NULL AND NEW.source_witness_actor_id IS NULL
      AND NEW.perceived_actor_id IS NULL
      AND json_extract(NEW.source_json, '$.channel') = NEW.channel
      AND json_extract(NEW.source_json, '$.locationId') = NEW.source_location_id
      AND EXISTS (SELECT 1 FROM campaign_play_event_exposures WHERE exposure_id = NEW.exposure_id
        AND location_id = NEW.source_location_id AND valid_until_world_time_minutes >= NEW.learned_at_world_time_minutes))
    OR (NEW.channel = 'route_state' AND NEW.source_location_id IS NULL AND NEW.source_route_id IS NOT NULL
      AND NEW.source_trigger IS NOT NULL AND NEW.source_witness_actor_id IS NULL AND NEW.perceived_actor_id IS NULL
      AND json_extract(NEW.source_json, '$.channel') = NEW.channel
      AND json_extract(NEW.source_json, '$.routeId') = NEW.source_route_id
      AND json_extract(NEW.source_json, '$.trigger') = NEW.source_trigger
      AND EXISTS (SELECT 1 FROM campaign_play_event_exposures x, json_each(x.route_triggers_json) t
        WHERE x.exposure_id = NEW.exposure_id AND x.route_id = NEW.source_route_id AND t.value = NEW.source_trigger))
    OR (NEW.channel = 'witness_report' AND NEW.source_location_id IS NULL AND NEW.source_route_id IS NULL
      AND NEW.source_trigger IS NULL AND NEW.source_witness_actor_id IS NOT NULL AND NEW.perceived_actor_id IS NULL
      AND json_extract(NEW.source_json, '$.channel') = NEW.channel
      AND json_extract(NEW.source_json, '$.witnessActorId') = NEW.source_witness_actor_id
      AND EXISTS (SELECT 1 FROM campaign_play_event_exposures WHERE exposure_id = NEW.exposure_id
        AND witness_actor_id = NEW.source_witness_actor_id)
      AND EXISTS (SELECT 1 FROM campaign_play_actor_knowledge WHERE actor_id = NEW.source_witness_actor_id
        AND event_id = NEW.event_id AND campaign_id = NEW.campaign_id))
  ) THEN RAISE(ABORT, 'campaign_play_actor_knowledge_source_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_knowledge_update_immutable BEFORE UPDATE ON campaign_play_actor_knowledge
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_knowledge_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_knowledge_delete_immutable BEFORE DELETE ON campaign_play_actor_knowledge
BEGIN SELECT RAISE(ABORT, 'campaign_play_actor_knowledge_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_observations_insert_guard BEFORE INSERT ON campaign_play_observations
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM actors a JOIN campaign_play_characters c ON c.actor_id = a.id
    JOIN campaign_play_events e ON e.event_id = NEW.event_id
    JOIN campaign_play_event_exposures x ON x.exposure_id = NEW.exposure_id AND x.event_id = e.event_id
    WHERE a.id = NEW.human_actor_id AND a.campaign_id = NEW.campaign_id
      AND a.kind = 'person' AND a.controller = 'human' AND a.role = 'player'
      AND c.campaign_id = NEW.campaign_id AND e.campaign_id = NEW.campaign_id
      AND x.campaign_id = NEW.campaign_id AND x.channel = NEW.channel
  ) THEN RAISE(ABORT, 'campaign_play_observation_owner_invalid') END;
  SELECT CASE WHEN json_extract(NEW.public_entry_json, '$.observationHandle') IS NULL
    OR (json_extract(NEW.public_entry_json, '$.consequence') IS NOT NULL
      AND json_extract(NEW.public_entry_json, '$.consequence.observationHandle')
        IS NOT json_extract(NEW.public_entry_json, '$.observationHandle'))
    THEN RAISE(ABORT, 'campaign_play_observation_public_entry_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_knowledge
    WHERE campaign_id = NEW.campaign_id AND actor_id = NEW.human_actor_id
      AND event_id = NEW.event_id AND exposure_id = NEW.exposure_id
      AND channel = NEW.channel AND source_hash = NEW.source_hash
      AND source_location_id IS NEW.source_location_id
      AND source_route_id IS NEW.source_route_id
      AND source_trigger IS NEW.source_trigger
      AND source_witness_actor_id IS NEW.source_witness_actor_id
      AND perceived_actor_id IS NEW.perceived_actor_id
      AND source_json = NEW.source_json
  ) THEN RAISE(ABORT, 'campaign_play_observation_knowledge_required') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_observations_update_immutable BEFORE UPDATE ON campaign_play_observations
BEGIN SELECT RAISE(ABORT, 'campaign_play_observation_immutable'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_observations_delete_immutable BEFORE DELETE ON campaign_play_observations
BEGIN SELECT RAISE(ABORT, 'campaign_play_observation_immutable'); END;
