PRAGMA foreign_keys=OFF;--> statement-breakpoint
PRAGMA legacy_alter_table=ON;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_commands` (
	`command_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text,
	`batch_id` text NOT NULL,
	`command_order` integer NOT NULL,
	`command_kind` text NOT NULL,
	`causal_parent_json` text NOT NULL,
	`source_json` text NOT NULL,
	`expected_world_version` integer NOT NULL,
	`read_scope_json` text NOT NULL,
	`write_scope_json` text NOT NULL,
	`exposure_policy_json` text NOT NULL,
	`arguments_hash` text NOT NULL,
	`protected_payload_json` text NOT NULL,
	`protected_payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_play_commands_kind_valid" CHECK("command_kind" IN (
        'advance_world_time',
        'move_actor',
        'set_route_state',
        'set_actor_condition',
        'update_actor_relation',
        'update_actor_goal',
        'advance_pressure',
        'record_world_event',
        'create_player_actor',
        'initialize_player_placement',
        'initialize_world_time',
        'initialize_pressure_state',
        'adjust_actor_possession',
        'incur_actor_obligation',
        'pay_actor_obligation',
        'materialize_support_actor'
      )),
	CONSTRAINT "campaign_play_commands_identity_valid" CHECK(length("batch_id") > 0
        AND "command_order" BETWEEN 0 AND 20
        AND "expected_world_version" >= 1),
	CONSTRAINT "campaign_play_commands_json_valid" CHECK(json_valid("causal_parent_json")
        AND json_type("causal_parent_json") = 'object'
        AND json_valid("source_json")
        AND json_type("source_json") = 'object'
        AND json_valid("read_scope_json")
        AND json_type("read_scope_json") = 'array'
        AND json_array_length("read_scope_json") <= 16
        AND json_valid("write_scope_json")
        AND json_type("write_scope_json") = 'array'
        AND json_array_length("write_scope_json") <= 16
        AND json_valid("exposure_policy_json")
        AND json_type("exposure_policy_json") = 'object'
        AND json_valid("protected_payload_json")
        AND json_type("protected_payload_json") = 'object'),
	CONSTRAINT "campaign_play_commands_hashes_valid" CHECK(length("arguments_hash") = 64
        AND length("protected_payload_hash") = 64)
);--> statement-breakpoint
INSERT INTO `__new_campaign_play_commands`(`command_id`, `campaign_id`, `turn_id`, `batch_id`, `command_order`, `command_kind`, `causal_parent_json`, `source_json`, `expected_world_version`, `read_scope_json`, `write_scope_json`, `exposure_policy_json`, `arguments_hash`, `protected_payload_json`, `protected_payload_hash`, `created_at`) SELECT `command_id`, `campaign_id`, `turn_id`, `batch_id`, `command_order`, `command_kind`, `causal_parent_json`, `source_json`, `expected_world_version`, `read_scope_json`, `write_scope_json`, `exposure_policy_json`, `arguments_hash`, `protected_payload_json`, `protected_payload_hash`, `created_at` FROM `campaign_play_commands`;--> statement-breakpoint
DROP TABLE `campaign_play_commands`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_commands` RENAME TO `campaign_play_commands`;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_commands_campaign_batch_order_unique` ON `campaign_play_commands` (`campaign_id`,`batch_id`,`command_order`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_commands_campaign_causal_parent` ON `campaign_play_commands` (
  `campaign_id`,
  json_extract(`causal_parent_json`, '$.kind')
);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_commands_campaign_expected_version` ON `campaign_play_commands` (`campaign_id`,`expected_world_version`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_commands_campaign_turn_order` ON `campaign_play_commands` (`campaign_id`,`turn_id`,`command_order`);--> statement-breakpoint
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
CREATE TRIGGER campaign_play_commands_delete_immutable
BEFORE DELETE ON campaign_play_commands
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_command_immutable');
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_commands_insert_guard
BEFORE INSERT ON campaign_play_commands
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.command_order <> (
    SELECT COUNT(*) FROM campaign_play_commands
    WHERE campaign_id = NEW.campaign_id AND batch_id = NEW.batch_id
  ) THEN RAISE(ABORT, 'campaign_play_command_order_invalid') END;

  SELECT CASE WHEN NEW.expected_world_version <> (
    SELECT world_version FROM campaign_play_states
    WHERE campaign_id = NEW.campaign_id
  ) + (
    SELECT COUNT(*) FROM campaign_play_commands
    WHERE campaign_id = NEW.campaign_id
      AND batch_id = NEW.batch_id
      AND command_kind <> 'record_world_event'
  ) THEN RAISE(ABORT, 'campaign_play_command_version_invalid') END;

  SELECT CASE WHEN (
    (NEW.command_kind = 'create_player_actor' AND NEW.turn_id IS NOT NULL)
    OR (
      NEW.command_kind = 'adjust_actor_possession'
      AND json_extract(NEW.source_json, '$.kind') = 'system'
      AND json_extract(NEW.source_json, '$.system') = 'character_bootstrap'
      AND NEW.turn_id IS NOT NULL
    )
    OR (
      NEW.turn_id IS NULL
      AND NEW.command_kind <> 'create_player_actor'
      AND NOT (
        NEW.command_kind = 'adjust_actor_possession'
        AND json_extract(NEW.source_json, '$.kind') = 'system'
        AND json_extract(NEW.source_json, '$.system') = 'character_bootstrap'
      )
    )
  ) THEN RAISE(ABORT, 'campaign_play_command_turn_required') END;

  SELECT CASE WHEN NEW.turn_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM campaign_play_turns
    WHERE id = NEW.turn_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_command_campaign_mismatch') END;

  SELECT CASE WHEN json_extract(NEW.source_json, '$.kind') = 'actor' AND NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = json_extract(NEW.source_json, '$.actorId')
      AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_command_source_invalid') END;

  SELECT CASE WHEN json_extract(NEW.source_json, '$.kind') = 'system' AND (
    json_extract(NEW.source_json, '$.system') IS NULL
    OR json_extract(NEW.source_json, '$.system') NOT IN (
      'character_bootstrap', 'opening_bootstrap', 'game_master', 'actor_scheduler'
    )
  ) THEN RAISE(ABORT, 'campaign_play_command_source_invalid') END;

  SELECT CASE WHEN json_extract(NEW.source_json, '$.kind') IS NULL
    OR json_extract(NEW.source_json, '$.kind') NOT IN ('actor', 'system')
    THEN RAISE(ABORT, 'campaign_play_command_source_invalid') END;

  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') = 'accepted_world' AND (
    NEW.command_kind <> 'create_player_actor'
    OR json_extract(NEW.source_json, '$.kind') <> 'system'
    OR json_extract(NEW.source_json, '$.system') <> 'character_bootstrap'
    OR json_extract(NEW.causal_parent_json, '$.campaignId') IS NOT NEW.campaign_id
    OR NOT EXISTS (
      SELECT 1 FROM campaign_play_states
      WHERE campaign_id = NEW.campaign_id
        AND accepted_world_version = json_extract(
          NEW.causal_parent_json,
          '$.acceptedWorldVersion'
        )
        AND accepted_content_hash = json_extract(
          NEW.causal_parent_json,
          '$.acceptedContentHash'
        )
    )
  ) THEN RAISE(ABORT, 'campaign_play_command_accepted_root_invalid') END;

  SELECT CASE WHEN NEW.command_kind = 'create_player_actor'
    AND json_extract(NEW.causal_parent_json, '$.kind') IS NOT 'accepted_world'
    THEN RAISE(ABORT, 'campaign_play_command_accepted_root_required') END;

  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') = 'turn' AND NOT EXISTS (
    SELECT 1 FROM campaign_play_turns
    WHERE id = json_extract(NEW.causal_parent_json, '$.turnId')
      AND campaign_id = NEW.campaign_id
      AND id = NEW.turn_id
  ) THEN RAISE(ABORT, 'campaign_play_command_parent_invalid') END;

  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') = 'command' AND NOT EXISTS (
    SELECT 1 FROM campaign_play_commands
    WHERE command_id = json_extract(NEW.causal_parent_json, '$.commandId')
      AND campaign_id = NEW.campaign_id
      AND (
        batch_id <> NEW.batch_id
        OR command_order < NEW.command_order
      )
  ) THEN RAISE(ABORT, 'campaign_play_command_parent_invalid') END;

  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') = 'world_event' AND NOT EXISTS (
    SELECT 1 FROM campaign_play_events
    WHERE event_id = json_extract(NEW.causal_parent_json, '$.eventId')
      AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_command_parent_invalid') END;

  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') = 'actor_job' AND (
    json_extract(NEW.causal_parent_json, '$.jobId') IS NULL
    OR length(json_extract(NEW.causal_parent_json, '$.jobId')) = 0
  ) THEN RAISE(ABORT, 'campaign_play_command_parent_invalid') END;

  SELECT CASE WHEN json_extract(NEW.causal_parent_json, '$.kind') IS NULL
    OR json_extract(NEW.causal_parent_json, '$.kind') NOT IN (
      'accepted_world', 'turn', 'command', 'world_event', 'actor_job'
    ) THEN RAISE(ABORT, 'campaign_play_command_parent_invalid') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.exposure_policy_json, '$.predicates') AS predicate
    JOIN json_each(
      json_extract(predicate.value, '$.triggers')
    ) AS declared_trigger
    WHERE json_extract(predicate.value, '$.channel') = 'route_state'
      AND (
        declared_trigger.type <> 'text'
        OR declared_trigger.value NOT IN ('inspect', 'attempt', 'traverse')
      )
  ) THEN RAISE(ABORT, 'campaign_play_command_exposure_trigger_invalid') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.exposure_policy_json, '$.predicates') AS predicate
    JOIN json_each(
      json_extract(predicate.value, '$.triggers')
    ) AS left_trigger
    JOIN json_each(
      json_extract(predicate.value, '$.triggers')
    ) AS right_trigger
      ON left_trigger.value IS right_trigger.value
      AND left_trigger.key < right_trigger.key
    WHERE json_extract(predicate.value, '$.channel') = 'route_state'
  ) THEN RAISE(ABORT, 'campaign_play_command_exposure_trigger_duplicate') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_commands_update_immutable
BEFORE UPDATE ON campaign_play_commands
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_command_immutable');
END;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_receipts` (
	`receipt_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text,
	`command_id` text NOT NULL,
	`command_kind` text NOT NULL,
	`outcome` text NOT NULL,
	`applied_world_mutation` integer NOT NULL,
	`prior_world_version` integer NOT NULL,
	`result_world_version` integer NOT NULL,
	`prior_world_hash` text NOT NULL,
	`result_world_hash` text NOT NULL,
	`causal_event_ids_json` text NOT NULL,
	`protected_payload_json` text NOT NULL,
	`protected_payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`command_id`) REFERENCES `campaign_play_commands`(`command_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_receipts_kind_valid" CHECK("command_kind" IN (
        'advance_world_time',
        'move_actor',
        'set_route_state',
        'set_actor_condition',
        'update_actor_relation',
        'update_actor_goal',
        'advance_pressure',
        'record_world_event',
        'create_player_actor',
        'initialize_player_placement',
        'initialize_world_time',
        'initialize_pressure_state',
        'adjust_actor_possession',
        'incur_actor_obligation',
        'pay_actor_obligation',
        'materialize_support_actor'
      ) AND "outcome" = 'applied'),
	CONSTRAINT "campaign_play_receipts_payload_valid" CHECK(json_valid("causal_event_ids_json")
        AND json_type("causal_event_ids_json") = 'array'
        AND json_array_length("causal_event_ids_json") BETWEEN 1 AND 8
        AND json_valid("protected_payload_json")
        AND json_type("protected_payload_json") = 'object'),
	CONSTRAINT "campaign_play_receipts_hashes_valid" CHECK(length("prior_world_hash") = 64
        AND length("result_world_hash") = 64
        AND length("protected_payload_hash") = 64),
	CONSTRAINT "campaign_play_receipts_mutation_valid" CHECK((
          "command_kind" = 'record_world_event'
          AND "applied_world_mutation" = 0
          AND "result_world_version" = "prior_world_version"
          AND "result_world_hash" = "prior_world_hash"
        ) OR (
          "command_kind" <> 'record_world_event'
          AND "applied_world_mutation" = 1
          AND "result_world_version" = "prior_world_version" + 1
          AND "result_world_hash" <> "prior_world_hash"
        ))
);--> statement-breakpoint
INSERT INTO `__new_campaign_play_receipts`(`receipt_id`, `campaign_id`, `turn_id`, `command_id`, `command_kind`, `outcome`, `applied_world_mutation`, `prior_world_version`, `result_world_version`, `prior_world_hash`, `result_world_hash`, `causal_event_ids_json`, `protected_payload_json`, `protected_payload_hash`, `created_at`) SELECT `receipt_id`, `campaign_id`, `turn_id`, `command_id`, `command_kind`, `outcome`, `applied_world_mutation`, `prior_world_version`, `result_world_version`, `prior_world_hash`, `result_world_hash`, `causal_event_ids_json`, `protected_payload_json`, `protected_payload_hash`, `created_at` FROM `campaign_play_receipts`;--> statement-breakpoint
DROP TABLE `campaign_play_receipts`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_receipts` RENAME TO `campaign_play_receipts`;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_receipts_campaign_mutation_version_unique` ON `campaign_play_receipts` (`campaign_id`,`result_world_version`) WHERE "campaign_play_receipts"."applied_world_mutation" = 1;--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_receipts_command_unique` ON `campaign_play_receipts` (`command_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_receipts_campaign_prior_version` ON `campaign_play_receipts` (`campaign_id`,`prior_world_version`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_receipts_campaign_turn_version` ON `campaign_play_receipts` (`campaign_id`,`turn_id`,`result_world_version`);--> statement-breakpoint
CREATE TRIGGER campaign_play_receipts_delete_immutable
BEFORE DELETE ON campaign_play_receipts
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_receipt_immutable');
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_receipts_insert_guard
BEFORE INSERT ON campaign_play_receipts
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_commands
    WHERE command_id = NEW.command_id
      AND campaign_id = NEW.campaign_id
      AND command_kind = NEW.command_kind
      AND turn_id IS NEW.turn_id
      AND expected_world_version = NEW.prior_world_version
  ) THEN RAISE(ABORT, 'campaign_play_receipt_command_mismatch') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.causal_event_ids_json) AS left_id
    JOIN json_each(NEW.causal_event_ids_json) AS right_id
      ON left_id.value = right_id.value AND left_id.key < right_id.key
  ) THEN RAISE(ABORT, 'campaign_play_receipt_event_ids_duplicate') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.causal_event_ids_json)
    WHERE type <> 'text' OR length(value) = 0
  ) THEN RAISE(ABORT, 'campaign_play_receipt_event_id_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_receipts_update_immutable
BEFORE UPDATE ON campaign_play_receipts
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_receipt_immutable');
END;--> statement-breakpoint
CREATE TABLE `__new_campaign_play_events` (
	`event_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`turn_id` text,
	`command_id` text NOT NULL,
	`receipt_id` text NOT NULL,
	`parent_event_id` text,
	`event_kind` text NOT NULL,
	`source_json` text NOT NULL,
	`world_time_minutes` integer NOT NULL,
	`world_version` integer NOT NULL,
	`affected_refs_json` text NOT NULL,
	`before_payload_json` text,
	`after_payload_json` text,
	`payload_hash` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`command_id`) REFERENCES `campaign_play_commands`(`command_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`receipt_id`) REFERENCES `campaign_play_receipts`(`receipt_id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`parent_event_id`) REFERENCES `campaign_play_events`(`event_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_events_kind_valid" CHECK("event_kind" IN (
        'player_actor_created',
        'player_placement_initialized',
        'world_time_initialized',
        'pressure_initialized',
        'world_time_advanced',
        'actor_moved',
        'route_state_changed',
        'actor_condition_changed',
        'actor_relation_changed',
        'actor_goal_changed',
        'pressure_advanced',
        'scene_recorded',
        'actor_possession_adjusted',
        'actor_obligation_incurred',
        'actor_obligation_payment_applied',
        'support_actor_materialized'
      )),
	CONSTRAINT "campaign_play_events_payload_valid" CHECK("world_time_minutes" BETWEEN 0 AND 2147483647
        AND "world_version" >= 1
        AND json_valid("source_json")
        AND json_type("source_json") = 'object'
        AND json_valid("affected_refs_json")
        AND json_type("affected_refs_json") = 'array'
        AND json_array_length("affected_refs_json") BETWEEN 1 AND 16
        AND (
          "before_payload_json" IS NULL
          OR (
            json_valid("before_payload_json")
            AND json_type("before_payload_json") = 'object'
          )
        )
        AND (
          "after_payload_json" IS NULL
          OR (
            json_valid("after_payload_json")
            AND json_type("after_payload_json") = 'object'
          )
        )
        AND ("before_payload_json" IS NOT NULL OR "after_payload_json" IS NOT NULL)
        AND length("payload_hash") = 64)
);--> statement-breakpoint
INSERT INTO `__new_campaign_play_events`(`event_id`, `campaign_id`, `turn_id`, `command_id`, `receipt_id`, `parent_event_id`, `event_kind`, `source_json`, `world_time_minutes`, `world_version`, `affected_refs_json`, `before_payload_json`, `after_payload_json`, `payload_hash`, `created_at`) SELECT `event_id`, `campaign_id`, `turn_id`, `command_id`, `receipt_id`, `parent_event_id`, `event_kind`, `source_json`, `world_time_minutes`, `world_version`, `affected_refs_json`, `before_payload_json`, `after_payload_json`, `payload_hash`, `created_at` FROM `campaign_play_events`;--> statement-breakpoint
DROP TABLE `campaign_play_events`;--> statement-breakpoint
ALTER TABLE `__new_campaign_play_events` RENAME TO `campaign_play_events`;--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_campaign_parent` ON `campaign_play_events` (`campaign_id`,`parent_event_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_campaign_turn_created` ON `campaign_play_events` (`campaign_id`,`turn_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_campaign_world_version` ON `campaign_play_events` (`campaign_id`,`world_version`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_command` ON `campaign_play_events` (`command_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_receipt` ON `campaign_play_events` (`receipt_id`);--> statement-breakpoint
CREATE TRIGGER campaign_play_events_delete_immutable
BEFORE DELETE ON campaign_play_events
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_immutable');
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_events_insert_guard
BEFORE INSERT ON campaign_play_events
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.turn_id IS NEW.turn_id
      AND receipt.command_id = NEW.command_id
      AND receipt.result_world_version = NEW.world_version
      AND command.source_json = NEW.source_json
      AND EXISTS (
        SELECT 1 FROM json_each(receipt.causal_event_ids_json)
        WHERE value = NEW.event_id
      )
  ) THEN RAISE(ABORT, 'campaign_play_event_receipt_mismatch') END;

  SELECT CASE WHEN NOT (
    (NEW.event_kind = 'player_actor_created' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'create_player_actor'
    )) OR
    (NEW.event_kind = 'player_placement_initialized' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'initialize_player_placement'
    )) OR
    (NEW.event_kind = 'world_time_initialized' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'initialize_world_time'
    )) OR
    (NEW.event_kind = 'pressure_initialized' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'initialize_pressure_state'
    )) OR
    (NEW.event_kind = 'world_time_advanced' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'advance_world_time'
    )) OR
    (NEW.event_kind = 'actor_moved' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'move_actor'
    )) OR
    (NEW.event_kind = 'route_state_changed' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'set_route_state'
    )) OR
    (NEW.event_kind = 'actor_condition_changed' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'set_actor_condition'
    )) OR
    (NEW.event_kind = 'actor_relation_changed' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'update_actor_relation'
    )) OR
    (NEW.event_kind = 'actor_goal_changed' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'update_actor_goal'
    )) OR
    (NEW.event_kind = 'pressure_advanced' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'advance_pressure'
    )) OR
    (NEW.event_kind = 'actor_possession_adjusted' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'adjust_actor_possession'
    )) OR
    (NEW.event_kind = 'actor_obligation_incurred' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'incur_actor_obligation'
    )) OR
    (NEW.event_kind = 'actor_obligation_payment_applied' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'pay_actor_obligation'
    )) OR
    (NEW.event_kind = 'support_actor_materialized' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'materialize_support_actor'
    )) OR
    (NEW.event_kind = 'scene_recorded' AND EXISTS (
      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id
        AND command_kind = 'record_world_event'
    ))
  ) THEN RAISE(ABORT, 'campaign_play_event_kind_mismatch') END;

  SELECT CASE WHEN NEW.parent_event_id = NEW.event_id OR (
    NEW.parent_event_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM campaign_play_events
      WHERE event_id = NEW.parent_event_id
        AND campaign_id = NEW.campaign_id
        AND world_version <= NEW.world_version
        AND world_time_minutes <= NEW.world_time_minutes
    )
  ) THEN RAISE(ABORT, 'campaign_play_event_parent_invalid') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1
    FROM json_each(NEW.affected_refs_json) AS left_ref
    JOIN json_each(NEW.affected_refs_json) AS right_ref
      ON json_extract(left_ref.value, '$.kind') = json_extract(right_ref.value, '$.kind')
      AND json_extract(left_ref.value, '$.id') = json_extract(right_ref.value, '$.id')
      AND left_ref.key < right_ref.key
  ) THEN RAISE(ABORT, 'campaign_play_event_refs_duplicate') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.affected_refs_json)
    WHERE json_type(value) <> 'object'
      OR json_extract(value, '$.kind') IS NULL
      OR json_extract(value, '$.kind') NOT IN (
        'actor', 'location', 'route', 'relation', 'goal', 'pressure', 'possession', 'obligation', 'world_event'
      )
      OR json_extract(value, '$.id') IS NULL
  ) THEN RAISE(ABORT, 'campaign_play_event_ref_invalid') END;

  SELECT CASE WHEN EXISTS (
    SELECT 1 FROM json_each(NEW.affected_refs_json)
    WHERE (
      json_extract(value, '$.kind') = 'actor'
      AND NOT EXISTS (
        SELECT 1 FROM actors
        WHERE id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    ) OR (
      json_extract(value, '$.kind') = 'location'
      AND NOT EXISTS (
        SELECT 1 FROM locations
        WHERE id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    ) OR (
      json_extract(value, '$.kind') = 'route'
      AND NOT EXISTS (
        SELECT 1 FROM location_edges
        WHERE id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    ) OR (
      json_extract(value, '$.kind') = 'relation'
      AND NOT EXISTS (
        SELECT 1 FROM actor_relations
        WHERE id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    ) OR (
      json_extract(value, '$.kind') = 'goal'
      AND NOT EXISTS (
        SELECT 1 FROM actor_goals
        WHERE id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    ) OR (
      json_extract(value, '$.kind') = 'pressure'
      AND NOT EXISTS (
        SELECT 1 FROM world_pressures
        WHERE id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    ) OR (
      json_extract(value, '$.kind') = 'world_event'
      AND NOT EXISTS (
        SELECT 1 FROM campaign_play_events
        WHERE event_id = json_extract(value, '$.id') AND campaign_id = NEW.campaign_id
      )
    )
  ) THEN RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_events_obligation_ref_guard
BEFORE INSERT ON campaign_play_events
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.affected_refs_json)
  WHERE json_extract(value, '$.kind') = 'obligation'
    AND NOT EXISTS (
      SELECT 1 FROM campaign_play_actor_obligations
      WHERE obligation_id = json_extract(value, '$.id')
        AND campaign_id = NEW.campaign_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_events_possession_ref_guard
BEFORE INSERT ON campaign_play_events
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.affected_refs_json)
  WHERE json_extract(value, '$.kind') = 'possession'
    AND NOT EXISTS (
      SELECT 1 FROM campaign_play_actor_possessions
      WHERE possession_id = json_extract(value, '$.id')
        AND campaign_id = NEW.campaign_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch');
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_events_update_immutable
BEFORE UPDATE ON campaign_play_events
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_immutable');
END;--> statement-breakpoint
PRAGMA legacy_alter_table=OFF;--> statement-breakpoint
PRAGMA foreign_keys=ON;
