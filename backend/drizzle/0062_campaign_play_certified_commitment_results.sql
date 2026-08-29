PRAGMA writable_schema=ON;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'certified_observe'||char(39)||', '||char(39)||'certified_decision'||char(39),
  char(39)||'certified_observe'||char(39)||', '||char(39)||'certified_decision'||char(39)||', '||char(39)||'certified_commitment'||char(39)
) WHERE type='trigger'
  AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
  AND instr(sql, char(39)||'certified_decision'||char(39))>0
  AND instr(sql, char(39)||'certified_commitment'||char(39))=0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  '          AND json_extract(t.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '        ) THEN '||char(39)||'action_resolved'||char(39),
  '          AND json_extract(t.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '        ) OR ('||char(10)||
  '          json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_commitment'||char(39)||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.actionSchemaVersion'||char(39)||') = 1'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.resolver'||char(39)||') = '||char(39)||'code_owned'||char(39)||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.campaignId'||char(39)||') = t.campaign_id'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.turnId'||char(39)||') = t.id'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.action'||char(39)||') IN ('||char(39)||'collect'||char(39)||', '||char(39)||'deliver'||char(39)||')'||char(10)||
  '          AND json_type(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') = '||char(39)||'text'||char(39)||char(10)||
  '          AND length(json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||')) = 64'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') NOT GLOB '||char(39)||'*[^0-9a-fA-F]*'||char(39)||char(10)||
  '          AND json_extract(t.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '        ) THEN '||char(39)||'action_resolved'||char(39)
) WHERE type='trigger'
  AND name='campaign_play_turn_results_insert_guard'
  AND instr(sql, char(39)||'certified_commitment'||char(39))>0
  AND instr(sql, '          json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_commitment'||char(39)||char(10)||
    '          AND json_extract(t.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')')=0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  '      AND json_extract(NEW.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '    ) THEN '||char(39)||'action_resolved'||char(39),
  '      AND json_extract(NEW.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '    ) OR ('||char(10)||
  '      json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_commitment'||char(39)||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.actionSchemaVersion'||char(39)||') = 1'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.resolver'||char(39)||') = '||char(39)||'code_owned'||char(39)||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.campaignId'||char(39)||') = NEW.campaign_id'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.turnId'||char(39)||') = NEW.id'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.action'||char(39)||') IN ('||char(39)||'collect'||char(39)||', '||char(39)||'deliver'||char(39)||')'||char(10)||
  '      AND json_type(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') = '||char(39)||'text'||char(39)||char(10)||
  '      AND length(json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||')) = 64'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') NOT GLOB '||char(39)||'*[^0-9a-fA-F]*'||char(39)||char(10)||
  '      AND json_extract(NEW.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '    ) THEN '||char(39)||'action_resolved'||char(39)
) WHERE type='trigger'
  AND name IN ('campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
  AND instr(sql, char(39)||'certified_commitment'||char(39))>0
  AND instr(sql, '      json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_commitment'||char(39)||char(10)||
    '      AND json_extract(NEW.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')')=0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'character_bootstrap'||char(39)||', '||char(39)||'opening_bootstrap'||char(39)||', '||char(39)||'game_master'||char(39)||', '||char(39)||'actor_scheduler'||char(39),
  char(39)||'character_bootstrap'||char(39)||', '||char(39)||'opening_bootstrap'||char(39)||', '||char(39)||'game_master'||char(39)||', '||char(39)||'actor_scheduler'||char(39)||', '||char(39)||'commitment_executor'||char(39)
) WHERE type='trigger'
  AND name='campaign_play_commands_insert_guard'
  AND instr(sql, char(39)||'actor_scheduler'||char(39))>0
  AND instr(sql, char(39)||'commitment_executor'||char(39))=0;
--> statement-breakpoint

PRAGMA writable_schema=RESET;
--> statement-breakpoint

CREATE TABLE `__campaign_play_0062_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint

INSERT INTO `__campaign_play_0062_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')) = 3
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
        AND instr(sql, char(39)||'certified_move'||char(39))>0
        AND instr(sql, char(39)||'certified_wait'||char(39))>0
        AND instr(sql, char(39)||'certified_contact'||char(39))>0
        AND instr(sql, char(39)||'certified_observe'||char(39))>0
        AND instr(sql, char(39)||'certified_decision'||char(39))>0
        AND instr(sql, char(39)||'certified_commitment'||char(39))>0) = 3
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name='campaign_play_turn_results_insert_guard'
        AND instr(sql, '          json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_commitment'||char(39)||char(10)||
          '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.actionSchemaVersion'||char(39)||') = 1'||char(10)||
          '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.resolver'||char(39)||') = '||char(39)||'code_owned'||char(39)||char(10)||
          '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.campaignId'||char(39)||') = t.campaign_id'||char(10)||
          '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.turnId'||char(39)||') = t.id'||char(10)||
          '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.action'||char(39)||') IN ('||char(39)||'collect'||char(39)||', '||char(39)||'deliver'||char(39)||')'||char(10)||
          '          AND json_type(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') = '||char(39)||'text'||char(39)||char(10)||
          '          AND length(json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||')) = 64'||char(10)||
          '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') NOT GLOB '||char(39)||'*[^0-9a-fA-F]*'||char(39)||char(10)||
          '          AND json_extract(t.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')')>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name IN ('campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
        AND instr(sql, '      json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_commitment'||char(39)||char(10)||
          '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.actionSchemaVersion'||char(39)||') = 1'||char(10)||
          '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.resolver'||char(39)||') = '||char(39)||'code_owned'||char(39)||char(10)||
          '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.campaignId'||char(39)||') = NEW.campaign_id'||char(10)||
          '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.turnId'||char(39)||') = NEW.id'||char(10)||
          '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.action'||char(39)||') IN ('||char(39)||'collect'||char(39)||', '||char(39)||'deliver'||char(39)||')'||char(10)||
          '      AND json_type(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') = '||char(39)||'text'||char(39)||char(10)||
          '      AND length(json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||')) = 64'||char(10)||
          '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') NOT GLOB '||char(39)||'*[^0-9a-fA-F]*'||char(39)||char(10)||
          '      AND json_extract(NEW.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')')>0) = 2
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name='campaign_play_commands_insert_guard'
        AND instr(sql, char(39)||'character_bootstrap'||char(39))>0
        AND instr(sql, char(39)||'opening_bootstrap'||char(39))>0
        AND instr(sql, char(39)||'game_master'||char(39))>0
        AND instr(sql, char(39)||'actor_scheduler'||char(39))>0
        AND instr(sql, char(39)||'commitment_executor'||char(39))>0) = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint

DROP TABLE `__campaign_play_0062_schema_guard`;
