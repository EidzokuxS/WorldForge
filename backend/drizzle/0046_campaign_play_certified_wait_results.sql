DROP TRIGGER campaign_play_turn_results_insert_guard;--> statement-breakpoint
DROP TRIGGER campaign_play_turn_terminal_result;--> statement-breakpoint
DROP TRIGGER campaign_play_turn_terminal_result_insert;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_results_insert_guard BEFORE INSERT ON campaign_play_turn_results
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_turns t
    WHERE t.id = NEW.turn_id AND t.campaign_id = NEW.campaign_id
      AND t.stage IN ('completed', 'failed') AND t.completed_at = NEW.created_at
      AND NEW.terminal_reason = CASE
        WHEN t.stage = 'failed' THEN 'terminal_failure'
        WHEN t.turn_kind = 'opening' THEN 'opening_completed'
        WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible') THEN 'action_impossible'
        WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required') THEN 'clarification_requested'
        WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = t.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')) OR (
          json_extract(t.input_json, '$.frame.executionRoute.kind') IN ('certified_move', 'certified_wait')
          AND json_extract(t.input_json, '$.frame.executionRoute.certificate.publicResult.disposition') = 'deterministic'
          AND json_extract(t.model_selection_json, '$.routeKind') = json_extract(t.input_json, '$.frame.executionRoute.kind')
        ) THEN 'action_resolved'
        ELSE 'invalid'
      END
  ) THEN RAISE(ABORT, 'campaign_play_turn_result_invalid') END;
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_terminal_result AFTER UPDATE OF stage ON campaign_play_turns
WHEN NEW.stage IN ('completed', 'failed') AND OLD.stage NOT IN ('completed', 'failed')
BEGIN
  INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
  VALUES (NEW.id, NEW.campaign_id, CASE
    WHEN NEW.stage = 'failed' THEN 'terminal_failure'
    WHEN NEW.turn_kind = 'opening' THEN 'opening_completed'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible') THEN 'action_impossible'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required') THEN 'clarification_requested'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')) OR (
      json_extract(NEW.input_json, '$.frame.executionRoute.kind') IN ('certified_move', 'certified_wait')
      AND json_extract(NEW.input_json, '$.frame.executionRoute.certificate.publicResult.disposition') = 'deterministic'
      AND json_extract(NEW.model_selection_json, '$.routeKind') = json_extract(NEW.input_json, '$.frame.executionRoute.kind')
    ) THEN 'action_resolved'
    ELSE 'invalid'
  END, NEW.completed_at);
END;--> statement-breakpoint
CREATE TRIGGER campaign_play_turn_terminal_result_insert AFTER INSERT ON campaign_play_turns
WHEN NEW.stage IN ('completed', 'failed')
BEGIN
  INSERT INTO campaign_play_turn_results (turn_id, campaign_id, terminal_reason, created_at)
  VALUES (NEW.id, NEW.campaign_id, CASE
    WHEN NEW.stage = 'failed' THEN 'terminal_failure'
    WHEN NEW.turn_kind = 'opening' THEN 'opening_completed'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'impossible') THEN 'action_impossible'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') = 'clarification_required') THEN 'clarification_requested'
    WHEN EXISTS (SELECT 1 FROM campaign_play_model_stages j WHERE j.turn_id = NEW.id AND j.kind = 'judge' AND j.status = 'accepted' AND json_extract(j.artifact_json, '$.publicResult.disposition') IN ('deterministic', 'uncertain')) OR (
      json_extract(NEW.input_json, '$.frame.executionRoute.kind') IN ('certified_move', 'certified_wait')
      AND json_extract(NEW.input_json, '$.frame.executionRoute.certificate.publicResult.disposition') = 'deterministic'
      AND json_extract(NEW.model_selection_json, '$.routeKind') = json_extract(NEW.input_json, '$.frame.executionRoute.kind')
    ) THEN 'action_resolved'
    ELSE 'invalid'
  END, NEW.completed_at);
END;
