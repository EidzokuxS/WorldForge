ALTER TABLE `campaign_play_decisions`
  ADD COLUMN `accept_effect_json` text;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_decisions_accept_effect_insert_guard`
BEFORE INSERT ON `campaign_play_decisions`
FOR EACH ROW
WHEN NEW.accept_effect_json IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT (
    json_valid(NEW.accept_effect_json)
    AND json_type(NEW.accept_effect_json) = 'object'
    AND (SELECT count(*) FROM json_each(NEW.accept_effect_json)) = 2
    AND json_type(NEW.accept_effect_json, '$.kind') = 'text'
    AND json_extract(NEW.accept_effect_json, '$.kind') = 'grant_player_possession'
    AND json_type(NEW.accept_effect_json, '$.name') = 'text'
    AND length(json_extract(NEW.accept_effect_json, '$.name')) BETWEEN 1 AND 120
  ) THEN RAISE(ABORT, 'campaign_play_decision_accept_effect_invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `campaign_play_receipts` AS receipt
    JOIN `campaign_play_commands` AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.command_kind = 'decision_open'
      AND receipt.turn_id IS NEW.source_turn_id
      AND receipt.result_world_version = NEW.world_version
      AND receipt.created_at = NEW.opened_at
      AND json_extract(command.protected_payload_json, '$.decisionKey') = NEW.decision_key
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.acceptEffect') IS NEW.accept_effect_json
  ) THEN RAISE(ABORT, 'campaign_play_decision_accept_effect_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_decisions_accept_effect_update_guard`
BEFORE UPDATE ON `campaign_play_decisions`
FOR EACH ROW
WHEN NOT (NEW.accept_effect_json IS OLD.accept_effect_json)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_decision_accept_effect_immutable');
END;
