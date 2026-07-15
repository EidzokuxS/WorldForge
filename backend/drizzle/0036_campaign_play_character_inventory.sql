PRAGMA writable_schema=ON;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '"command_order" BETWEEN 0 AND 15',
  '"command_order" BETWEEN 0 AND 20'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, '"command_order" BETWEEN 0 AND 15')>0;
--> statement-breakpoint
PRAGMA writable_schema=RESET;
--> statement-breakpoint
CREATE TABLE `__campaign_play_0036_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0036_schema_guard` (`valid`) VALUES (
  CASE WHEN (
    SELECT count(*) FROM sqlite_schema
    WHERE type='table' AND name='campaign_play_commands'
      AND instr(sql, '"command_order" BETWEEN 0 AND 20')>0
      AND instr(sql, '"command_order" BETWEEN 0 AND 15')=0
  ) = 1 THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0036_schema_guard`;
--> statement-breakpoint
DROP TRIGGER campaign_play_commands_insert_guard;
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
END;
