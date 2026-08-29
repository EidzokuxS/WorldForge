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
    OR NEW.fee_unit <> OLD.fee_unit
    OR NEW.fee_amount <> OLD.fee_amount
    OR NEW.payment_timing <> OLD.payment_timing
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
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command ON command.command_id = receipt.command_id
    JOIN campaign_play_events AS event
      ON event.receipt_id = receipt.receipt_id
      AND event.command_id = command.command_id
      AND event.event_kind = 'player_commitment_completed'
      AND event.campaign_id = NEW.campaign_id
      AND event.turn_id IS NEW.completion_turn_id
      AND event.world_version = NEW.world_version
      AND EXISTS (
        SELECT 1 FROM json_each(event.affected_refs_json) AS affected_ref
        WHERE json_extract(affected_ref.value, '$.kind') = 'commitment'
          AND json_extract(affected_ref.value, '$.id') = NEW.commitment_id
      )
    WHERE receipt.receipt_id = NEW.completion_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.turn_id IS NEW.completion_turn_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.command_kind = 'complete_player_commitment'
      AND receipt.result_world_version = NEW.world_version
      AND receipt.created_at = NEW.updated_at
      AND command.command_kind = 'complete_player_commitment'
      AND json_extract(command.protected_payload_json, '$.commitmentId') = NEW.commitment_id
      AND json_extract(command.protected_payload_json, '$.performerActorId') = NEW.performer_actor_id
      AND json_extract(command.protected_payload_json, '$.counterpartyActorId') = NEW.counterparty_actor_id
      AND json_extract(command.protected_payload_json, '$.deliveryPossessionId') = (
        SELECT possession.possession_id
        FROM campaign_play_actor_possessions AS possession
        WHERE possession.campaign_id = NEW.campaign_id
          AND possession.possession_id = json_extract(command.protected_payload_json, '$.deliveryPossessionId')
          AND possession.actor_id = NEW.performer_actor_id
          AND possession.name = NEW.subject_name
      )
      AND EXISTS (
        SELECT 1
        FROM campaign_play_commands AS spend
        WHERE spend.campaign_id = NEW.campaign_id
          AND spend.batch_id = command.batch_id
          AND spend.command_kind = 'adjust_actor_possession'
          AND json_extract(spend.protected_payload_json, '$.actorId') = NEW.performer_actor_id
          AND json_extract(spend.protected_payload_json, '$.possessionId') = json_extract(command.protected_payload_json, '$.deliveryPossessionId')
          AND json_extract(spend.protected_payload_json, '$.possessionKey') = (
            SELECT possession_key FROM campaign_play_actor_possessions
            WHERE campaign_id = NEW.campaign_id
              AND possession_id = json_extract(command.protected_payload_json, '$.deliveryPossessionId')
          )
          AND json_extract(spend.protected_payload_json, '$.name') = NEW.subject_name
          AND json_extract(spend.protected_payload_json, '$.quantityDelta') = -1
      )
      AND EXISTS (
        SELECT 1
        FROM campaign_play_commands AS incur
        JOIN campaign_play_actor_obligations AS obligation
          ON obligation.campaign_id = NEW.campaign_id
          AND obligation.obligation_id = json_extract(incur.protected_payload_json, '$.obligationId')
          AND obligation.debtor_actor_id = NEW.counterparty_actor_id
          AND obligation.creditor_actor_id = NEW.performer_actor_id
          AND obligation.unit_key = 'copper'
          AND obligation.principal_amount = NEW.fee_amount
          AND obligation.outstanding_amount = NEW.fee_amount
        WHERE incur.campaign_id = NEW.campaign_id
          AND incur.batch_id = command.batch_id
          AND incur.command_kind = 'incur_actor_obligation'
          AND json_extract(incur.protected_payload_json, '$.debtorActorId') = NEW.counterparty_actor_id
          AND json_extract(incur.protected_payload_json, '$.creditorActorId') = NEW.performer_actor_id
          AND json_extract(incur.protected_payload_json, '$.unitKey') = 'copper'
          AND json_extract(incur.protected_payload_json, '$.amount') = NEW.fee_amount
      )
  ) THEN RAISE(ABORT, 'campaign_play_commitment_completion_receipt_invalid') END;
END;
--> statement-breakpoint

CREATE TABLE `__campaign_play_0061_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint

INSERT INTO `__campaign_play_0061_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema WHERE type='trigger'
      AND name='campaign_play_commitments_update_guard'
      AND instr(sql, 'deliveryPossessionId') > 0
      AND instr(sql, 'adjust_actor_possession') > 0
      AND instr(sql, 'incur_actor_obligation') > 0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_commitments') = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint

DROP TABLE `__campaign_play_0061_schema_guard`;
