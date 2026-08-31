DROP TRIGGER campaign_play_commitments_insert_guard;
--> statement-breakpoint

CREATE TRIGGER campaign_play_commitments_insert_guard
BEFORE INSERT ON campaign_play_commitments
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.performer_actor_id AND campaign_id = NEW.campaign_id
      AND kind = 'person' AND controller = 'human' AND role = 'player'
  ) OR NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.counterparty_actor_id AND campaign_id = NEW.campaign_id
      AND kind = 'person' AND controller = 'agent'
  ) THEN RAISE(ABORT, 'campaign_play_commitment_party_invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_decisions AS decision
    WHERE decision.decision_key = NEW.source_decision_key
      AND decision.campaign_id = NEW.campaign_id
      AND decision.actor_id = NEW.counterparty_actor_id
      AND decision.status = 'accepted'
      AND decision.source_turn_id = NEW.source_turn_id
      AND json_extract(decision.accept_effect_json, '$.kind') = NEW.kind
      AND json_extract(decision.accept_effect_json, '$.title') = NEW.title
      AND json_extract(decision.accept_effect_json, '$.subjectName') = NEW.subject_name
      AND json_extract(decision.accept_effect_json, '$.destinationHandle') = NEW.destination_handle
      AND (
        (NEW.kind = 'paid_delivery'
          AND json_extract(decision.accept_effect_json, '$.feeUnit') = NEW.fee_unit
          AND json_extract(decision.accept_effect_json, '$.feeAmount') = NEW.fee_amount
          AND json_extract(decision.accept_effect_json, '$.paymentTiming') = NEW.payment_timing)
        OR (NEW.kind = 'unpaid_delivery'
          AND NEW.fee_unit IS NULL AND NEW.fee_amount IS NULL AND NEW.payment_timing IS NULL
          AND json_type(decision.accept_effect_json, '$.feeUnit') IS NULL
          AND json_type(decision.accept_effect_json, '$.feeAmount') IS NULL
          AND json_type(decision.accept_effect_json, '$.paymentTiming') IS NULL)
      )
      AND (
        ((json_type(decision.accept_effect_json, '$.dueInMinutes') IS NULL OR json_type(decision.accept_effect_json, '$.dueInMinutes') = 'null') AND NEW.due_world_time_minutes IS NULL)
        OR json_extract(decision.accept_effect_json, '$.dueInMinutes') = NEW.due_world_time_minutes - NEW.accepted_world_time_minutes
      )
  ) THEN RAISE(ABORT, 'campaign_play_commitment_source_invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.source_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.command_kind = 'create_player_commitment'
      AND receipt.result_world_version = NEW.world_version
      AND receipt.created_at = NEW.created_at
      AND receipt.created_at = NEW.updated_at
      AND command.command_kind = 'create_player_commitment'
      AND json_extract(command.protected_payload_json, '$.commitmentId') = NEW.commitment_id
      AND json_extract(command.protected_payload_json, '$.sourceDecisionKey') = NEW.source_decision_key
      AND json_extract(command.protected_payload_json, '$.sourceTurnId') = NEW.source_turn_id
      AND json_extract(command.protected_payload_json, '$.performerActorId') = NEW.performer_actor_id
      AND json_extract(command.protected_payload_json, '$.counterpartyActorId') = NEW.counterparty_actor_id
      AND json_extract(command.protected_payload_json, '$.commitmentKind') = NEW.kind
      AND json_extract(command.protected_payload_json, '$.title') = NEW.title
      AND json_extract(command.protected_payload_json, '$.subjectName') = NEW.subject_name
      AND json_extract(command.protected_payload_json, '$.destinationHandle') = NEW.destination_handle
      AND (
        (NEW.kind = 'paid_delivery'
          AND json_extract(command.protected_payload_json, '$.feeUnit') = NEW.fee_unit
          AND json_extract(command.protected_payload_json, '$.feeAmount') = NEW.fee_amount
          AND json_extract(command.protected_payload_json, '$.paymentTiming') = NEW.payment_timing)
        OR (NEW.kind = 'unpaid_delivery'
          AND json_type(command.protected_payload_json, '$.feeUnit') IS NULL
          AND json_type(command.protected_payload_json, '$.feeAmount') IS NULL
          AND json_type(command.protected_payload_json, '$.paymentTiming') IS NULL)
      )
      AND json_extract(command.protected_payload_json, '$.acceptedWorldTimeMinutes') = NEW.accepted_world_time_minutes
      AND (
        ((json_type(command.protected_payload_json, '$.dueWorldTimeMinutes') IS NULL OR json_type(command.protected_payload_json, '$.dueWorldTimeMinutes') = 'null') AND NEW.due_world_time_minutes IS NULL)
        OR json_extract(command.protected_payload_json, '$.dueWorldTimeMinutes') = NEW.due_world_time_minutes
      )
  ) THEN RAISE(ABORT, 'campaign_play_commitment_create_receipt_invalid') END;
END;
