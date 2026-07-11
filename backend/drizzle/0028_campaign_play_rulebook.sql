CREATE TABLE `campaign_play_actor_conditions` (
	`actor_id` text NOT NULL,
	`campaign_id` text NOT NULL,
	`condition` text NOT NULL,
	`present` integer NOT NULL,
	`summary` text NOT NULL,
	`causal_receipt_id` text NOT NULL,
	`world_version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`causal_receipt_id`) REFERENCES `campaign_play_receipts`(`receipt_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_actor_conditions_valid" CHECK("campaign_play_actor_conditions"."condition" IN ('occupied', 'strained', 'incapacitated')
        AND "campaign_play_actor_conditions"."present" IN (0, 1)
        AND length("campaign_play_actor_conditions"."summary") > 0
        AND "campaign_play_actor_conditions"."world_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_conditions_actor_condition_unique` ON `campaign_play_actor_conditions` (`actor_id`,`condition`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_conditions_receipt_unique` ON `campaign_play_actor_conditions` (`causal_receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_conditions_campaign_present` ON `campaign_play_actor_conditions` (`campaign_id`,`present`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_conditions_campaign_version` ON `campaign_play_actor_conditions` (`campaign_id`,`world_version`);--> statement-breakpoint
CREATE TABLE `campaign_play_commands` (
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
	CONSTRAINT "campaign_play_commands_kind_valid" CHECK("campaign_play_commands"."command_kind" IN (
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
        'initialize_pressure_state'
      )),
	CONSTRAINT "campaign_play_commands_identity_valid" CHECK(length("campaign_play_commands"."batch_id") > 0
        AND "campaign_play_commands"."command_order" BETWEEN 0 AND 15
        AND "campaign_play_commands"."expected_world_version" >= 1),
	CONSTRAINT "campaign_play_commands_json_valid" CHECK(json_valid("campaign_play_commands"."causal_parent_json")
        AND json_type("campaign_play_commands"."causal_parent_json") = 'object'
        AND json_valid("campaign_play_commands"."source_json")
        AND json_type("campaign_play_commands"."source_json") = 'object'
        AND json_valid("campaign_play_commands"."read_scope_json")
        AND json_type("campaign_play_commands"."read_scope_json") = 'array'
        AND json_array_length("campaign_play_commands"."read_scope_json") <= 16
        AND json_valid("campaign_play_commands"."write_scope_json")
        AND json_type("campaign_play_commands"."write_scope_json") = 'array'
        AND json_array_length("campaign_play_commands"."write_scope_json") <= 16
        AND json_valid("campaign_play_commands"."exposure_policy_json")
        AND json_type("campaign_play_commands"."exposure_policy_json") = 'object'
        AND json_valid("campaign_play_commands"."protected_payload_json")
        AND json_type("campaign_play_commands"."protected_payload_json") = 'object'),
	CONSTRAINT "campaign_play_commands_hashes_valid" CHECK(length("campaign_play_commands"."arguments_hash") = 64
        AND length("campaign_play_commands"."protected_payload_hash") = 64)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_commands_campaign_batch_order_unique` ON `campaign_play_commands` (`campaign_id`,`batch_id`,`command_order`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_commands_campaign_turn_order` ON `campaign_play_commands` (`campaign_id`,`turn_id`,`command_order`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_commands_campaign_expected_version` ON `campaign_play_commands` (`campaign_id`,`expected_world_version`);--> statement-breakpoint
CREATE TABLE `campaign_play_event_exposures` (
	`exposure_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`event_id` text NOT NULL,
	`channel` text NOT NULL,
	`location_id` text,
	`route_id` text,
	`witness_actor_id` text,
	`valid_until_world_time_minutes` integer,
	`route_triggers_json` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `campaign_play_events`(`event_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`route_id`) REFERENCES `location_edges`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`witness_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_event_exposures_channel_valid" CHECK("campaign_play_event_exposures"."channel" IN (
        'direct_perception',
        'local_aftermath',
        'route_state',
        'witness_report'
      )),
	CONSTRAINT "campaign_play_event_exposures_shape_valid" CHECK((
          "campaign_play_event_exposures"."channel" = 'direct_perception'
          AND "campaign_play_event_exposures"."location_id" IS NOT NULL
          AND "campaign_play_event_exposures"."route_id" IS NULL
          AND "campaign_play_event_exposures"."witness_actor_id" IS NULL
          AND "campaign_play_event_exposures"."valid_until_world_time_minutes" IS NULL
          AND "campaign_play_event_exposures"."route_triggers_json" IS NULL
        ) OR (
          "campaign_play_event_exposures"."channel" = 'local_aftermath'
          AND "campaign_play_event_exposures"."location_id" IS NOT NULL
          AND "campaign_play_event_exposures"."route_id" IS NULL
          AND "campaign_play_event_exposures"."witness_actor_id" IS NULL
          AND "campaign_play_event_exposures"."valid_until_world_time_minutes" BETWEEN 0 AND 2147483647
          AND "campaign_play_event_exposures"."route_triggers_json" IS NULL
        ) OR (
          "campaign_play_event_exposures"."channel" = 'route_state'
          AND "campaign_play_event_exposures"."location_id" IS NULL
          AND "campaign_play_event_exposures"."route_id" IS NOT NULL
          AND "campaign_play_event_exposures"."witness_actor_id" IS NULL
          AND "campaign_play_event_exposures"."valid_until_world_time_minutes" IS NULL
          AND json_valid("campaign_play_event_exposures"."route_triggers_json")
          AND json_type("campaign_play_event_exposures"."route_triggers_json") = 'array'
          AND json_array_length("campaign_play_event_exposures"."route_triggers_json") BETWEEN 1 AND 3
        ) OR (
          "campaign_play_event_exposures"."channel" = 'witness_report'
          AND "campaign_play_event_exposures"."location_id" IS NULL
          AND "campaign_play_event_exposures"."route_id" IS NULL
          AND "campaign_play_event_exposures"."witness_actor_id" IS NOT NULL
          AND "campaign_play_event_exposures"."valid_until_world_time_minutes" IS NULL
          AND "campaign_play_event_exposures"."route_triggers_json" IS NULL
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_event_exposures_event_channel_anchor_unique` ON `campaign_play_event_exposures` (`event_id`,`channel`,`location_id`,`route_id`,`witness_actor_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_event_exposures_campaign_event` ON `campaign_play_event_exposures` (`campaign_id`,`event_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_event_exposures_location_channel` ON `campaign_play_event_exposures` (`campaign_id`,`location_id`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_event_exposures_route_channel` ON `campaign_play_event_exposures` (`campaign_id`,`route_id`,`channel`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_event_exposures_witness_channel` ON `campaign_play_event_exposures` (`campaign_id`,`witness_actor_id`,`channel`);--> statement-breakpoint
CREATE TABLE `campaign_play_events` (
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
	CONSTRAINT "campaign_play_events_kind_valid" CHECK("campaign_play_events"."event_kind" IN (
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
        'scene_recorded'
      )),
	CONSTRAINT "campaign_play_events_payload_valid" CHECK("campaign_play_events"."world_time_minutes" BETWEEN 0 AND 2147483647
        AND "campaign_play_events"."world_version" >= 1
        AND json_valid("campaign_play_events"."source_json")
        AND json_type("campaign_play_events"."source_json") = 'object'
        AND json_valid("campaign_play_events"."affected_refs_json")
        AND json_type("campaign_play_events"."affected_refs_json") = 'array'
        AND json_array_length("campaign_play_events"."affected_refs_json") BETWEEN 1 AND 16
        AND (
          "campaign_play_events"."before_payload_json" IS NULL
          OR (
            json_valid("campaign_play_events"."before_payload_json")
            AND json_type("campaign_play_events"."before_payload_json") = 'object'
          )
        )
        AND (
          "campaign_play_events"."after_payload_json" IS NULL
          OR (
            json_valid("campaign_play_events"."after_payload_json")
            AND json_type("campaign_play_events"."after_payload_json") = 'object'
          )
        )
        AND ("campaign_play_events"."before_payload_json" IS NOT NULL OR "campaign_play_events"."after_payload_json" IS NOT NULL)
        AND length("campaign_play_events"."payload_hash") = 64)
);
--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_campaign_world_version` ON `campaign_play_events` (`campaign_id`,`world_version`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_campaign_turn_created` ON `campaign_play_events` (`campaign_id`,`turn_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_campaign_parent` ON `campaign_play_events` (`campaign_id`,`parent_event_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_receipt` ON `campaign_play_events` (`receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_events_command` ON `campaign_play_events` (`command_id`);--> statement-breakpoint
CREATE TABLE `campaign_play_pressure_states` (
	`pressure_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`progress` integer NOT NULL,
	`status` text NOT NULL,
	`last_advanced_world_time_minutes` integer NOT NULL,
	`causal_receipt_id` text NOT NULL,
	`world_version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pressure_id`) REFERENCES `world_pressures`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`causal_receipt_id`) REFERENCES `campaign_play_receipts`(`receipt_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_pressure_states_valid" CHECK("campaign_play_pressure_states"."progress" BETWEEN 0 AND 100
        AND "campaign_play_pressure_states"."status" IN ('active', 'resolved')
        AND "campaign_play_pressure_states"."last_advanced_world_time_minutes" BETWEEN 0 AND 2147483647
        AND "campaign_play_pressure_states"."world_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_pressure_states_receipt_unique` ON `campaign_play_pressure_states` (`causal_receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_pressure_states_campaign_status` ON `campaign_play_pressure_states` (`campaign_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_pressure_states_campaign_version` ON `campaign_play_pressure_states` (`campaign_id`,`world_version`);--> statement-breakpoint
CREATE TABLE `campaign_play_receipts` (
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
	CONSTRAINT "campaign_play_receipts_kind_valid" CHECK("campaign_play_receipts"."command_kind" IN (
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
        'initialize_pressure_state'
      ) AND "campaign_play_receipts"."outcome" = 'applied'),
	CONSTRAINT "campaign_play_receipts_payload_valid" CHECK(json_valid("campaign_play_receipts"."causal_event_ids_json")
        AND json_type("campaign_play_receipts"."causal_event_ids_json") = 'array'
        AND json_array_length("campaign_play_receipts"."causal_event_ids_json") BETWEEN 1 AND 8
        AND json_valid("campaign_play_receipts"."protected_payload_json")
        AND json_type("campaign_play_receipts"."protected_payload_json") = 'object'),
	CONSTRAINT "campaign_play_receipts_hashes_valid" CHECK(length("campaign_play_receipts"."prior_world_hash") = 64
        AND length("campaign_play_receipts"."result_world_hash") = 64
        AND length("campaign_play_receipts"."protected_payload_hash") = 64),
	CONSTRAINT "campaign_play_receipts_mutation_valid" CHECK((
          "campaign_play_receipts"."command_kind" = 'record_world_event'
          AND "campaign_play_receipts"."applied_world_mutation" = 0
          AND "campaign_play_receipts"."result_world_version" = "campaign_play_receipts"."prior_world_version"
          AND "campaign_play_receipts"."result_world_hash" = "campaign_play_receipts"."prior_world_hash"
        ) OR (
          "campaign_play_receipts"."command_kind" <> 'record_world_event'
          AND "campaign_play_receipts"."applied_world_mutation" = 1
          AND "campaign_play_receipts"."result_world_version" = "campaign_play_receipts"."prior_world_version" + 1
          AND "campaign_play_receipts"."result_world_hash" <> "campaign_play_receipts"."prior_world_hash"
        ))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_receipts_command_unique` ON `campaign_play_receipts` (`command_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_receipts_campaign_mutation_version_unique` ON `campaign_play_receipts` (`campaign_id`,`result_world_version`) WHERE "campaign_play_receipts"."applied_world_mutation" = 1;--> statement-breakpoint
CREATE INDEX `idx_campaign_play_receipts_campaign_turn_version` ON `campaign_play_receipts` (`campaign_id`,`turn_id`,`result_world_version`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_receipts_campaign_prior_version` ON `campaign_play_receipts` (`campaign_id`,`prior_world_version`);--> statement-breakpoint
CREATE TABLE `campaign_play_route_states` (
	`route_id` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`state` text NOT NULL,
	`causal_receipt_id` text NOT NULL,
	`world_version` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`route_id`) REFERENCES `location_edges`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`causal_receipt_id`) REFERENCES `campaign_play_receipts`(`receipt_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "campaign_play_route_states_valid" CHECK("campaign_play_route_states"."state" IN ('open', 'restricted', 'blocked')
        AND "campaign_play_route_states"."world_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_route_states_receipt_unique` ON `campaign_play_route_states` (`causal_receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_route_states_campaign_state` ON `campaign_play_route_states` (`campaign_id`,`state`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_route_states_campaign_version` ON `campaign_play_route_states` (`campaign_id`,`world_version`);
--> statement-breakpoint
CREATE INDEX `idx_campaign_play_commands_campaign_causal_parent` ON `campaign_play_commands` (
  `campaign_id`,
  json_extract(`causal_parent_json`, '$.kind')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_exposures_direct_anchor_unique`
ON `campaign_play_event_exposures` (`event_id`, `location_id`)
WHERE `channel` = 'direct_perception';
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_exposures_aftermath_anchor_unique`
ON `campaign_play_event_exposures` (`event_id`, `location_id`)
WHERE `channel` = 'local_aftermath';
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_exposures_route_anchor_unique`
ON `campaign_play_event_exposures` (`event_id`, `route_id`)
WHERE `channel` = 'route_state';
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_exposures_witness_anchor_unique`
ON `campaign_play_event_exposures` (`event_id`, `witness_actor_id`)
WHERE `channel` = 'witness_report';
--> statement-breakpoint
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
    OR (NEW.command_kind <> 'create_player_actor' AND NEW.turn_id IS NULL)
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
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_commands_update_immutable
BEFORE UPDATE ON campaign_play_commands
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_command_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_commands_delete_immutable
BEFORE DELETE ON campaign_play_commands
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_command_immutable');
END;
--> statement-breakpoint
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
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_receipts_update_immutable
BEFORE UPDATE ON campaign_play_receipts
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_receipt_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_receipts_delete_immutable
BEFORE DELETE ON campaign_play_receipts
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_receipt_immutable');
END;
--> statement-breakpoint
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
        'actor', 'location', 'route', 'relation', 'goal', 'pressure', 'world_event'
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
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_events_update_immutable
BEFORE UPDATE ON campaign_play_events
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_events_delete_immutable
BEFORE DELETE ON campaign_play_events
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_event_exposures_insert_guard
BEFORE INSERT ON campaign_play_event_exposures
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_events AS event
    JOIN campaign_play_commands AS command
      ON command.command_id = event.command_id
    WHERE event.event_id = NEW.event_id
      AND event.campaign_id = NEW.campaign_id
      AND json_extract(command.exposure_policy_json, '$.mode') = 'projectable'
      AND EXISTS (
        SELECT 1
        FROM json_each(command.exposure_policy_json, '$.predicates') AS predicate
        WHERE json_extract(predicate.value, '$.channel') = NEW.channel
          AND (
            (
              NEW.channel = 'direct_perception'
              AND json_extract(predicate.value, '$.locationId') = NEW.location_id
            ) OR (
              NEW.channel = 'local_aftermath'
              AND json_extract(predicate.value, '$.locationId') = NEW.location_id
              AND json_extract(
                predicate.value,
                '$.validUntilWorldTimeMinutes'
              ) = NEW.valid_until_world_time_minutes
            ) OR (
              NEW.channel = 'route_state'
              AND json_extract(predicate.value, '$.routeId') = NEW.route_id
              AND json_array_length(
                json_extract(predicate.value, '$.triggers')
              ) = json_array_length(NEW.route_triggers_json)
              AND NOT EXISTS (
                SELECT 1 FROM json_each(NEW.route_triggers_json) AS actual_trigger
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM json_each(
                    json_extract(predicate.value, '$.triggers')
                  ) AS declared_trigger
                  WHERE declared_trigger.value IS actual_trigger.value
                )
              )
              AND NOT EXISTS (
                SELECT 1
                FROM json_each(
                  json_extract(predicate.value, '$.triggers')
                ) AS declared_trigger
                WHERE NOT EXISTS (
                  SELECT 1
                  FROM json_each(NEW.route_triggers_json) AS actual_trigger
                  WHERE actual_trigger.value IS declared_trigger.value
                )
              )
            ) OR (
              NEW.channel = 'witness_report'
              AND json_extract(
                predicate.value,
                '$.witnessActorId'
              ) = NEW.witness_actor_id
            )
          )
      )
  ) THEN RAISE(ABORT, 'campaign_play_exposure_event_invalid') END;

  SELECT CASE WHEN (
    SELECT COUNT(*) FROM campaign_play_event_exposures
    WHERE event_id = NEW.event_id
  ) >= 4 THEN RAISE(ABORT, 'campaign_play_exposure_limit') END;

  SELECT CASE WHEN NEW.location_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM locations
    WHERE id = NEW.location_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_exposure_campaign_mismatch') END;

  SELECT CASE WHEN NEW.route_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM location_edges
    WHERE id = NEW.route_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_exposure_campaign_mismatch') END;

  SELECT CASE WHEN NEW.witness_actor_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.witness_actor_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_exposure_campaign_mismatch') END;

  SELECT CASE WHEN NEW.channel = 'route_state' AND EXISTS (
    SELECT 1 FROM json_each(NEW.route_triggers_json)
    WHERE type <> 'text' OR value NOT IN ('inspect', 'attempt', 'traverse')
  ) THEN RAISE(ABORT, 'campaign_play_exposure_trigger_invalid') END;

  SELECT CASE WHEN NEW.channel = 'route_state' AND EXISTS (
    SELECT 1
    FROM json_each(NEW.route_triggers_json) AS left_trigger
    JOIN json_each(NEW.route_triggers_json) AS right_trigger
      ON left_trigger.value = right_trigger.value
      AND left_trigger.key < right_trigger.key
  ) THEN RAISE(ABORT, 'campaign_play_exposure_trigger_duplicate') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_event_exposures_update_immutable
BEFORE UPDATE ON campaign_play_event_exposures
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_exposure_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_event_exposures_delete_immutable
BEFORE DELETE ON campaign_play_event_exposures
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_exposure_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_route_states_insert_guard
BEFORE INSERT ON campaign_play_route_states
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM location_edges
    WHERE id = NEW.route_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_route_state_campaign_mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'set_route_state'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.routeId') = NEW.route_id
      AND json_extract(command.protected_payload_json, '$.state') = NEW.state
  ) THEN RAISE(ABORT, 'campaign_play_route_state_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_route_states_update_guard
BEFORE UPDATE ON campaign_play_route_states
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.route_id <> OLD.route_id OR NEW.campaign_id <> OLD.campaign_id
    THEN RAISE(ABORT, 'campaign_play_route_state_identity_immutable') END;
  SELECT CASE WHEN NEW.state = OLD.state
    OR NEW.world_version <= OLD.world_version
    OR NEW.causal_receipt_id = OLD.causal_receipt_id
    THEN RAISE(ABORT, 'campaign_play_route_state_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'set_route_state'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.routeId') = NEW.route_id
      AND json_extract(command.protected_payload_json, '$.state') = NEW.state
  ) THEN RAISE(ABORT, 'campaign_play_route_state_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_route_states_delete_immutable
BEFORE DELETE ON campaign_play_route_states
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_route_state_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_conditions_insert_guard
BEFORE INSERT ON campaign_play_actor_conditions
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.actor_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_actor_condition_campaign_mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'set_actor_condition'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.condition') = NEW.condition
      AND json_extract(command.protected_payload_json, '$.operation') = 'set'
      AND json_extract(command.protected_payload_json, '$.summary') = NEW.summary
      AND NEW.present = 1
  ) THEN RAISE(ABORT, 'campaign_play_actor_condition_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_conditions_update_guard
BEFORE UPDATE ON campaign_play_actor_conditions
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.actor_id <> OLD.actor_id
    OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.condition <> OLD.condition
    THEN RAISE(ABORT, 'campaign_play_actor_condition_identity_immutable') END;
  SELECT CASE WHEN NEW.present = OLD.present
    OR NEW.world_version <= OLD.world_version
    OR NEW.causal_receipt_id = OLD.causal_receipt_id
    THEN RAISE(ABORT, 'campaign_play_actor_condition_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'set_actor_condition'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.condition') = NEW.condition
      AND json_extract(command.protected_payload_json, '$.summary') = NEW.summary
      AND (
        (json_extract(command.protected_payload_json, '$.operation') = 'set' AND NEW.present = 1)
        OR
        (json_extract(command.protected_payload_json, '$.operation') = 'clear' AND NEW.present = 0)
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_condition_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_conditions_delete_immutable
BEFORE DELETE ON campaign_play_actor_conditions
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_actor_condition_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_pressure_states_insert_guard
BEFORE INSERT ON campaign_play_pressure_states
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM world_pressures
    WHERE id = NEW.pressure_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_pressure_state_campaign_mismatch') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'initialize_pressure_state'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.pressureId') = NEW.pressure_id
      AND json_extract(command.protected_payload_json, '$.progress') = NEW.progress
      AND json_extract(command.protected_payload_json, '$.status') = NEW.status
      AND EXISTS (
        SELECT 1 FROM campaign_play_events
        WHERE receipt_id = receipt.receipt_id
          AND event_kind = 'pressure_initialized'
          AND world_time_minutes = NEW.last_advanced_world_time_minutes
      )
  ) THEN RAISE(ABORT, 'campaign_play_pressure_state_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_pressure_states_update_guard
BEFORE UPDATE ON campaign_play_pressure_states
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.pressure_id <> OLD.pressure_id OR NEW.campaign_id <> OLD.campaign_id
    THEN RAISE(ABORT, 'campaign_play_pressure_state_identity_immutable') END;
  SELECT CASE WHEN NEW.world_version <= OLD.world_version
    OR NEW.causal_receipt_id = OLD.causal_receipt_id
    OR NEW.progress < OLD.progress
    OR (NEW.progress = OLD.progress AND NEW.status = OLD.status)
    OR (OLD.status = 'resolved' AND NEW.status <> 'resolved')
    OR NEW.last_advanced_world_time_minutes < OLD.last_advanced_world_time_minutes
    THEN RAISE(ABORT, 'campaign_play_pressure_state_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'advance_pressure'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.pressureId') = NEW.pressure_id
      AND json_extract(command.protected_payload_json, '$.resultStatus') = NEW.status
      AND NEW.progress = min(
        100,
        OLD.progress + json_extract(command.protected_payload_json, '$.amount')
      )
      AND EXISTS (
        SELECT 1 FROM campaign_play_events
        WHERE receipt_id = receipt.receipt_id
          AND event_kind = 'pressure_advanced'
          AND world_time_minutes = NEW.last_advanced_world_time_minutes
      )
  ) THEN RAISE(ABORT, 'campaign_play_pressure_state_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_pressure_states_delete_immutable
BEFORE DELETE ON campaign_play_pressure_states
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_pressure_state_immutable');
END;
