PRAGMA foreign_keys=ON;
--> statement-breakpoint

DROP TRIGGER campaign_play_commitments_update_guard;
--> statement-breakpoint

CREATE TRIGGER campaign_play_commitments_update_guard
BEFORE UPDATE ON campaign_play_commitments
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.commitment_id <> OLD.commitment_id
    OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.performer_actor_id <> OLD.performer_actor_id
    OR NEW.counterparty_actor_id <> OLD.counterparty_actor_id
    OR NEW.kind <> OLD.kind
    OR NEW.title <> OLD.title
    OR NEW.subject_name <> OLD.subject_name
    OR NEW.destination_handle <> OLD.destination_handle
    OR NEW.fee_unit IS NOT OLD.fee_unit
    OR NEW.fee_amount IS NOT OLD.fee_amount
    OR NEW.payment_timing IS NOT OLD.payment_timing
    OR NEW.accepted_world_time_minutes <> OLD.accepted_world_time_minutes
    OR NEW.due_world_time_minutes IS NOT OLD.due_world_time_minutes
    OR NEW.source_decision_key <> OLD.source_decision_key
    OR NEW.source_turn_id <> OLD.source_turn_id
    OR NEW.source_receipt_id <> OLD.source_receipt_id
    OR NEW.created_at <> OLD.created_at
    OR NEW.status <> 'completed'
    OR OLD.status <> 'active'
    OR NEW.completion_turn_id IS NULL
    OR NEW.completion_receipt_id IS NULL
    OR NEW.world_version <= OLD.world_version
    OR NEW.updated_at <= OLD.updated_at
    THEN RAISE(ABORT, 'campaign_play_commitment_transition_invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS completion_receipt
    JOIN campaign_play_commands AS completion_command
      ON completion_command.command_id = completion_receipt.command_id
    JOIN campaign_play_events AS completion_event
      ON completion_event.receipt_id = completion_receipt.receipt_id
      AND completion_event.command_id = completion_command.command_id
      AND completion_event.event_kind = 'player_commitment_completed'
      AND completion_event.campaign_id = NEW.campaign_id
      AND completion_event.turn_id IS NEW.completion_turn_id
      AND completion_event.world_version = NEW.world_version
      AND EXISTS (
        SELECT 1 FROM json_each(completion_event.affected_refs_json) AS affected_ref
        WHERE json_extract(affected_ref.value, '$.kind') = 'commitment'
          AND json_extract(affected_ref.value, '$.id') = NEW.commitment_id
      )
    WHERE completion_receipt.receipt_id = NEW.completion_receipt_id
      AND completion_receipt.campaign_id = NEW.campaign_id
      AND completion_receipt.turn_id IS NEW.completion_turn_id
      AND completion_receipt.outcome = 'applied'
      AND completion_receipt.applied_world_mutation = 1
      AND completion_receipt.command_kind = 'complete_player_commitment'
      AND completion_receipt.prior_world_version = NEW.world_version - 1
      AND completion_receipt.result_world_version = NEW.world_version
      AND completion_receipt.created_at = NEW.updated_at
      AND completion_command.campaign_id = NEW.campaign_id
      AND completion_command.batch_id IS NOT NULL
      AND completion_command.command_order >= 1
      AND completion_command.command_kind = 'complete_player_commitment'
      AND json_extract(completion_command.protected_payload_json, '$.commitmentId') = NEW.commitment_id
      AND json_extract(completion_command.protected_payload_json, '$.performerActorId') = NEW.performer_actor_id
      AND json_extract(completion_command.protected_payload_json, '$.counterpartyActorId') = NEW.counterparty_actor_id
      AND json_extract(completion_command.protected_payload_json, '$.deliveryPossessionId') = (
        SELECT possession.possession_id
        FROM campaign_play_actor_possessions AS possession
        WHERE possession.campaign_id = NEW.campaign_id
          AND possession.possession_id = json_extract(completion_command.protected_payload_json, '$.deliveryPossessionId')
          AND possession.actor_id = NEW.performer_actor_id
          AND possession.possession_key = (
            SELECT json_extract(spend_command.protected_payload_json, '$.possessionKey')
            FROM campaign_play_commands AS spend_command
            WHERE spend_command.campaign_id = NEW.campaign_id
              AND spend_command.batch_id = completion_command.batch_id
              AND spend_command.command_kind = 'adjust_actor_possession'
              AND spend_command.command_order = 0
              AND json_extract(spend_command.protected_payload_json, '$.possessionId') = json_extract(completion_command.protected_payload_json, '$.deliveryPossessionId')
          )
          AND possession.name = NEW.subject_name
      )
      AND (completion_event.affected_refs_json IS NOT NULL)
      AND (SELECT count(*) FROM json_each(completion_event.affected_refs_json)
        WHERE json_extract(value, '$.kind') = 'location') = 1
      AND (SELECT count(*) FROM campaign_play_receipts AS batch_receipt
        JOIN campaign_play_commands AS batch_command
          ON batch_command.command_id = batch_receipt.command_id
        WHERE batch_command.campaign_id = NEW.campaign_id
          AND batch_command.batch_id = completion_command.batch_id
          AND batch_receipt.campaign_id = NEW.campaign_id
          AND batch_receipt.turn_id IS NEW.completion_turn_id
          AND batch_receipt.outcome = 'applied') = CASE
            WHEN NEW.kind = 'paid_delivery' THEN 3
            ELSE 2
          END
      AND (SELECT count(*) FROM campaign_play_events AS batch_event
        JOIN campaign_play_commands AS batch_command
          ON batch_command.command_id = batch_event.command_id
        WHERE batch_command.campaign_id = NEW.campaign_id
          AND batch_command.batch_id = completion_command.batch_id
          AND batch_event.campaign_id = NEW.campaign_id
          AND batch_event.turn_id IS NEW.completion_turn_id) = CASE
            WHEN NEW.kind = 'paid_delivery' THEN 3
            ELSE 2
          END
      AND (
        (NEW.kind = 'paid_delivery'
          AND NEW.fee_unit = 'copper'
          AND NEW.fee_amount BETWEEN 1 AND 1000000
          AND NEW.payment_timing = 'on_completion'
          AND completion_command.command_order = 2
          AND NOT EXISTS (
            SELECT 1
            FROM campaign_play_commands AS incur_command
            WHERE incur_command.campaign_id = NEW.campaign_id
              AND incur_command.batch_id = completion_command.batch_id
              AND incur_command.command_kind = 'incur_actor_obligation'
          )
          AND EXISTS (
            SELECT 1
            FROM campaign_play_commands AS spend_command
            JOIN campaign_play_receipts AS spend_receipt
              ON spend_receipt.command_id = spend_command.command_id
            JOIN campaign_play_events AS spend_event
              ON spend_event.command_id = spend_command.command_id
              AND spend_event.receipt_id = spend_receipt.receipt_id
              AND spend_event.event_kind = 'actor_possession_adjusted'
            JOIN campaign_play_actor_possessions AS cargo
              ON cargo.campaign_id = NEW.campaign_id
              AND cargo.possession_id = json_extract(spend_command.protected_payload_json, '$.possessionId')
              AND cargo.actor_id = NEW.performer_actor_id
              AND cargo.name = NEW.subject_name
              AND cargo.causal_receipt_id = spend_receipt.receipt_id
              AND cargo.world_version = spend_receipt.result_world_version
            WHERE spend_command.campaign_id = NEW.campaign_id
              AND spend_command.batch_id = completion_command.batch_id
              AND spend_command.command_order = 0
              AND spend_command.command_kind = 'adjust_actor_possession'
              AND json_extract(spend_command.protected_payload_json, '$.actorId') = NEW.performer_actor_id
              AND json_extract(spend_command.protected_payload_json, '$.possessionId') = json_extract(completion_command.protected_payload_json, '$.deliveryPossessionId')
              AND json_extract(spend_command.protected_payload_json, '$.possessionKey') = cargo.possession_key
              AND json_extract(spend_command.protected_payload_json, '$.name') = NEW.subject_name
              AND json_extract(spend_command.protected_payload_json, '$.quantityDelta') = -1
              AND spend_receipt.campaign_id = NEW.campaign_id
              AND spend_receipt.turn_id IS NEW.completion_turn_id
              AND spend_receipt.outcome = 'applied'
              AND spend_receipt.applied_world_mutation = 1
              AND spend_receipt.command_kind = 'adjust_actor_possession'
              AND spend_receipt.prior_world_version = NEW.world_version - 3
              AND spend_receipt.result_world_version = NEW.world_version - 2
              AND spend_event.campaign_id = NEW.campaign_id
              AND spend_event.turn_id IS NEW.completion_turn_id
              AND spend_event.world_version = spend_receipt.result_world_version
              AND EXISTS (
                SELECT 1 FROM json_each(spend_event.affected_refs_json) AS spend_ref
                WHERE json_extract(spend_ref.value, '$.kind') = 'actor'
                  AND json_extract(spend_ref.value, '$.id') = NEW.performer_actor_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(spend_event.affected_refs_json) AS spend_ref
                WHERE json_extract(spend_ref.value, '$.kind') = 'possession'
                  AND json_extract(spend_ref.value, '$.id') = cargo.possession_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(spend_event.affected_refs_json) AS spend_ref
                WHERE json_extract(spend_ref.value, '$.kind') = 'location'
                  AND EXISTS (
                    SELECT 1 FROM json_each(completion_event.affected_refs_json) AS destination_ref
                    WHERE json_extract(destination_ref.value, '$.kind') = 'location'
                      AND json_extract(destination_ref.value, '$.id') = json_extract(spend_ref.value, '$.id')
                  )
              )
          )
          AND EXISTS (
            SELECT 1
            FROM campaign_play_commands AS payment_command
            JOIN campaign_play_receipts AS payment_receipt
              ON payment_receipt.command_id = payment_command.command_id
            JOIN campaign_play_events AS payment_event
              ON payment_event.command_id = payment_command.command_id
              AND payment_event.receipt_id = payment_receipt.receipt_id
              AND payment_event.event_kind = 'actor_possession_adjusted'
            JOIN campaign_play_actor_possessions AS payment_possession
              ON payment_possession.campaign_id = NEW.campaign_id
              AND payment_possession.possession_id = json_extract(payment_command.protected_payload_json, '$.possessionId')
              AND payment_possession.actor_id = NEW.performer_actor_id
              AND payment_possession.possession_key = 'copper'
              AND payment_possession.name = 'Copper'
              AND payment_possession.causal_receipt_id = payment_receipt.receipt_id
              AND payment_possession.world_version = payment_receipt.result_world_version
            WHERE payment_command.campaign_id = NEW.campaign_id
              AND payment_command.batch_id = completion_command.batch_id
              AND payment_command.command_order = 1
              AND payment_command.command_kind = 'adjust_actor_possession'
              AND json_extract(payment_command.protected_payload_json, '$.actorId') = NEW.performer_actor_id
              AND json_extract(payment_command.protected_payload_json, '$.possessionId') = payment_possession.possession_id
              AND json_extract(payment_command.protected_payload_json, '$.possessionKey') = 'copper'
              AND json_extract(payment_command.protected_payload_json, '$.name') = 'Copper'
              AND json_extract(payment_command.protected_payload_json, '$.quantityDelta') = NEW.fee_amount
              AND json_extract(payment_command.exposure_policy_json, '$.mode') = 'projectable'
              AND json_array_length(payment_command.exposure_policy_json, '$.predicates') = 1
              AND json_extract(payment_command.exposure_policy_json, '$.predicates[0].channel') = 'direct_perception'
              AND payment_receipt.campaign_id = NEW.campaign_id
              AND payment_receipt.turn_id IS NEW.completion_turn_id
              AND payment_receipt.outcome = 'applied'
              AND payment_receipt.applied_world_mutation = 1
              AND payment_receipt.command_kind = 'adjust_actor_possession'
              AND payment_receipt.prior_world_version = NEW.world_version - 2
              AND payment_receipt.result_world_version = NEW.world_version - 1
              AND payment_event.campaign_id = NEW.campaign_id
              AND payment_event.turn_id IS NEW.completion_turn_id
              AND payment_event.world_version = payment_receipt.result_world_version
              AND EXISTS (
                SELECT 1 FROM json_each(payment_event.affected_refs_json) AS payment_ref
                WHERE json_extract(payment_ref.value, '$.kind') = 'actor'
                  AND json_extract(payment_ref.value, '$.id') = NEW.performer_actor_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(payment_event.affected_refs_json) AS payment_ref
                WHERE json_extract(payment_ref.value, '$.kind') = 'possession'
                  AND json_extract(payment_ref.value, '$.id') = payment_possession.possession_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(payment_event.affected_refs_json) AS payment_ref
                WHERE json_extract(payment_ref.value, '$.kind') = 'commitment'
                  AND json_extract(payment_ref.value, '$.id') = NEW.commitment_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(payment_event.affected_refs_json) AS payment_ref
                WHERE json_extract(payment_ref.value, '$.kind') = 'location'
                  AND json_extract(payment_ref.value, '$.id') = (
                    SELECT json_extract(destination_ref.value, '$.id')
                    FROM json_each(completion_event.affected_refs_json) AS destination_ref
                    WHERE json_extract(destination_ref.value, '$.kind') = 'location'
                  )
              )
              AND EXISTS (
                SELECT 1
                FROM campaign_play_event_exposures AS payment_exposure
                WHERE payment_exposure.campaign_id = NEW.campaign_id
                  AND payment_exposure.event_id = payment_event.event_id
                  AND payment_exposure.channel = 'direct_perception'
                  AND payment_exposure.location_id = (
                    SELECT json_extract(destination_ref.value, '$.id')
                    FROM json_each(completion_event.affected_refs_json) AS destination_ref
                    WHERE json_extract(destination_ref.value, '$.kind') = 'location'
                  )
              )
              AND (SELECT count(*) FROM campaign_play_event_exposures AS payment_exposure
                WHERE payment_exposure.campaign_id = NEW.campaign_id
                  AND payment_exposure.event_id = payment_event.event_id) = 1
              AND json_extract(payment_command.exposure_policy_json, '$.predicates[0].locationId') = (
                SELECT json_extract(destination_ref.value, '$.id')
                FROM json_each(completion_event.affected_refs_json) AS destination_ref
                WHERE json_extract(destination_ref.value, '$.kind') = 'location'
              )
          )
        )
        OR (NEW.kind = 'unpaid_delivery'
          AND NEW.fee_unit IS NULL
          AND NEW.fee_amount IS NULL
          AND NEW.payment_timing IS NULL
          AND completion_command.command_order = 1
          AND NOT EXISTS (
            SELECT 1 FROM campaign_play_commands AS incur_command
            WHERE incur_command.campaign_id = NEW.campaign_id
              AND incur_command.batch_id = completion_command.batch_id
              AND incur_command.command_kind = 'incur_actor_obligation'
          )
          AND EXISTS (
            SELECT 1
            FROM campaign_play_commands AS spend_command
            JOIN campaign_play_receipts AS spend_receipt
              ON spend_receipt.command_id = spend_command.command_id
            JOIN campaign_play_events AS spend_event
              ON spend_event.command_id = spend_command.command_id
              AND spend_event.receipt_id = spend_receipt.receipt_id
              AND spend_event.event_kind = 'actor_possession_adjusted'
            JOIN campaign_play_actor_possessions AS cargo
              ON cargo.campaign_id = NEW.campaign_id
              AND cargo.possession_id = json_extract(spend_command.protected_payload_json, '$.possessionId')
              AND cargo.actor_id = NEW.performer_actor_id
              AND cargo.name = NEW.subject_name
              AND cargo.causal_receipt_id = spend_receipt.receipt_id
              AND cargo.world_version = spend_receipt.result_world_version
            WHERE spend_command.campaign_id = NEW.campaign_id
              AND spend_command.batch_id = completion_command.batch_id
              AND spend_command.command_order = 0
              AND spend_command.command_kind = 'adjust_actor_possession'
              AND json_extract(spend_command.protected_payload_json, '$.actorId') = NEW.performer_actor_id
              AND json_extract(spend_command.protected_payload_json, '$.possessionId') = json_extract(completion_command.protected_payload_json, '$.deliveryPossessionId')
              AND json_extract(spend_command.protected_payload_json, '$.possessionKey') = cargo.possession_key
              AND json_extract(spend_command.protected_payload_json, '$.name') = NEW.subject_name
              AND json_extract(spend_command.protected_payload_json, '$.quantityDelta') = -1
              AND spend_receipt.campaign_id = NEW.campaign_id
              AND spend_receipt.turn_id IS NEW.completion_turn_id
              AND spend_receipt.outcome = 'applied'
              AND spend_receipt.applied_world_mutation = 1
              AND spend_receipt.command_kind = 'adjust_actor_possession'
              AND spend_receipt.prior_world_version = NEW.world_version - 2
              AND spend_receipt.result_world_version = NEW.world_version - 1
              AND spend_event.campaign_id = NEW.campaign_id
              AND spend_event.turn_id IS NEW.completion_turn_id
              AND spend_event.world_version = spend_receipt.result_world_version
              AND EXISTS (
                SELECT 1 FROM json_each(spend_event.affected_refs_json) AS spend_ref
                WHERE json_extract(spend_ref.value, '$.kind') = 'actor'
                  AND json_extract(spend_ref.value, '$.id') = NEW.performer_actor_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(spend_event.affected_refs_json) AS spend_ref
                WHERE json_extract(spend_ref.value, '$.kind') = 'possession'
                  AND json_extract(spend_ref.value, '$.id') = cargo.possession_id
              )
              AND EXISTS (
                SELECT 1 FROM json_each(spend_event.affected_refs_json) AS spend_ref
                WHERE json_extract(spend_ref.value, '$.kind') = 'location'
                  AND EXISTS (
                    SELECT 1 FROM json_each(completion_event.affected_refs_json) AS destination_ref
                    WHERE json_extract(destination_ref.value, '$.kind') = 'location'
                      AND json_extract(destination_ref.value, '$.id') = json_extract(spend_ref.value, '$.id')
                  )
              )
          )
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_commitment_completion_receipt_invalid') END;
END;
--> statement-breakpoint

CREATE TABLE `__campaign_play_0065_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0065_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema
      WHERE type = 'trigger'
        AND name = 'campaign_play_commitments_update_guard'
        AND instr(sql, char(39)||'paid_delivery'||char(39)) > 0
        AND instr(sql, char(39)||'on_completion'||char(39)) > 0
        AND instr(sql, char(39)||'adjust_actor_possession'||char(39)) > 0
        AND instr(sql, char(39)||'actor_possession_adjusted'||char(39)) > 0
        AND instr(sql, 'campaign_play_event_exposures') > 0
        AND instr(sql, char(39)||'direct_perception'||char(39)) > 0
        AND instr(sql, char(39)||'incur_actor_obligation'||char(39)) > 0
        AND instr(sql, 'NOT EXISTS') > 0
        AND instr(sql, 'incur_command.batch_id = completion_command.batch_id') > 0) = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0065_schema_guard`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
