DROP TRIGGER campaign_play_events_insert_guard;--> statement-breakpoint
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
END;
