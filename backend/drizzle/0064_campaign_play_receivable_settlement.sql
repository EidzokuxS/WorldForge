PRAGMA foreign_keys=OFF;
--> statement-breakpoint
PRAGMA writable_schema=ON;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'complete_player_commitment'||char(39)||char(10)||'      ))',
  char(39)||'complete_player_commitment'||char(39)||','||char(10)||
    '        '||char(39)||'settle_player_receivable'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, char(39)||'complete_player_commitment'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'complete_player_commitment'||char(39)||char(10)||'      ) AND',
  char(39)||'complete_player_commitment'||char(39)||','||char(10)||
    '        '||char(39)||'settle_player_receivable'||char(39)||char(10)||'      ) AND'
) WHERE type='table' AND name='campaign_play_receipts'
  AND instr(sql, char(39)||'complete_player_commitment'||char(39)||char(10)||'      ) AND')>0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'player_commitment_completed'||char(39)||char(10)||'      ))',
  char(39)||'player_commitment_completed'||char(39)||','||char(10)||
    '        '||char(39)||'player_receivable_settled'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_events'
  AND instr(sql, char(39)||'player_commitment_completed'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  '    (NEW.event_kind = '||char(39)||'player_commitment_completed'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'complete_player_commitment'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10),
  '    (NEW.event_kind = '||char(39)||'player_commitment_completed'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'complete_player_commitment'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'player_receivable_settled'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'settle_player_receivable'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, '    (NEW.event_kind = '||char(39)||'player_commitment_completed'||char(39)||' AND EXISTS ('||char(10))>0
  AND instr(sql, char(39)||'player_receivable_settled'||char(39))=0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'certified_observe'||char(39)||', '||char(39)||'certified_decision'||char(39)||', '||char(39)||'certified_commitment'||char(39),
  char(39)||'certified_observe'||char(39)||', '||char(39)||'certified_decision'||char(39)||', '||char(39)||'certified_commitment'||char(39)||', '||char(39)||'certified_obligation'||char(39)
) WHERE type='trigger'
  AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
  AND instr(sql, char(39)||'certified_commitment'||char(39))>0
  AND instr(sql, char(39)||'certified_obligation'||char(39))=0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
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
  '        ) THEN '||char(39)||'action_resolved'||char(39),
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
  '        ) OR ('||char(10)||
  '          json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_obligation'||char(39)||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.actionSchemaVersion'||char(39)||') = 1'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.resolver'||char(39)||') = '||char(39)||'code_owned'||char(39)||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.campaignId'||char(39)||') = t.campaign_id'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificate.turnId'||char(39)||') = t.id'||char(10)||
  '          AND json_type(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') = '||char(39)||'text'||char(39)||char(10)||
  '          AND length(json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||')) = 64'||char(10)||
  '          AND json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') NOT GLOB '||char(39)||'*[^0-9a-fA-F]*'||char(39)||char(10)||
  '          AND json_extract(t.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '        ) THEN '||char(39)||'action_resolved'||char(39)
) WHERE type='trigger' AND name='campaign_play_turn_results_insert_guard'
  AND instr(sql, char(39)||'certified_commitment'||char(39))>0
  AND instr(sql, char(39)||'certified_obligation'||char(39))>0
  AND instr(sql, '          json_extract(t.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_obligation'||char(39))=0;
--> statement-breakpoint

UPDATE sqlite_schema SET sql=replace(
  sql,
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
  '    ) THEN '||char(39)||'action_resolved'||char(39),
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
  '    ) OR ('||char(10)||
  '      json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_obligation'||char(39)||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.actionSchemaVersion'||char(39)||') = 1'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.resolver'||char(39)||') = '||char(39)||'code_owned'||char(39)||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.campaignId'||char(39)||') = NEW.campaign_id'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificate.turnId'||char(39)||') = NEW.id'||char(10)||
  '      AND json_type(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') = '||char(39)||'text'||char(39)||char(10)||
  '      AND length(json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||')) = 64'||char(10)||
  '      AND json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.certificateHash'||char(39)||') NOT GLOB '||char(39)||'*[^0-9a-fA-F]*'||char(39)||char(10)||
  '      AND json_extract(NEW.model_selection_json, '||char(39)||'$.routeKind'||char(39)||') = json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||')'||char(10)||
  '    ) THEN '||char(39)||'action_resolved'||char(39)
) WHERE type='trigger'
  AND name IN ('campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
  AND instr(sql, char(39)||'certified_commitment'||char(39))>0
  AND instr(sql, char(39)||'certified_obligation'||char(39))>0
  AND instr(sql, '      json_extract(NEW.input_json, '||char(39)||'$.frame.executionRoute.kind'||char(39)||') = '||char(39)||'certified_obligation'||char(39))=0;
--> statement-breakpoint

PRAGMA writable_schema=RESET;
--> statement-breakpoint

DROP TRIGGER campaign_play_actor_possessions_insert_guard;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_possessions_insert_guard
BEFORE INSERT ON campaign_play_actor_possessions
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM actors
    WHERE id = NEW.actor_id AND campaign_id = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_campaign_mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.result_world_version = NEW.world_version
      AND (
        (
          receipt.command_kind = 'adjust_actor_possession'
          AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
          AND json_extract(command.protected_payload_json, '$.possessionId') = NEW.possession_id
          AND json_extract(command.protected_payload_json, '$.possessionKey') = NEW.possession_key
          AND json_extract(command.protected_payload_json, '$.name') = NEW.name
          AND json_extract(command.protected_payload_json, '$.quantityDelta') = NEW.quantity
          AND NEW.quantity > 0
        ) OR (
          receipt.command_kind = 'pay_actor_obligation'
          AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.actor_id
          AND NEW.quantity = json_extract(command.protected_payload_json, '$.amount')
          AND EXISTS (
            SELECT 1
            FROM campaign_play_actor_possessions AS payment
            WHERE payment.possession_id = json_extract(command.protected_payload_json, '$.paymentPossessionId')
              AND payment.campaign_id = NEW.campaign_id
              AND payment.actor_id = json_extract(command.protected_payload_json, '$.debtorActorId')
              AND payment.possession_key = NEW.possession_key
              AND payment.name = NEW.name
          )
        ) OR (
          receipt.command_kind = 'settle_player_receivable'
          AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.actor_id
          AND json_extract(command.protected_payload_json, '$.creditorPossessionId') = NEW.possession_id
          AND json_extract(command.protected_payload_json, '$.creditorPossessionKey') = NEW.possession_key
          AND json_extract(command.protected_payload_json, '$.creditorPossessionName') = NEW.name
          AND json_extract(command.protected_payload_json, '$.amount') = NEW.quantity
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_receipt_invalid') END;
END;
--> statement-breakpoint

DROP TRIGGER campaign_play_actor_possessions_update_guard;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_possessions_update_guard
BEFORE UPDATE ON campaign_play_actor_possessions
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.possession_id <> OLD.possession_id
    OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.actor_id <> OLD.actor_id
    OR NEW.possession_key <> OLD.possession_key
    OR NEW.name <> OLD.name
    THEN RAISE(ABORT, 'campaign_play_actor_possession_identity_immutable') END;
  SELECT CASE WHEN NEW.world_version <= OLD.world_version
    OR NEW.causal_receipt_id = OLD.causal_receipt_id
    THEN RAISE(ABORT, 'campaign_play_actor_possession_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.result_world_version = NEW.world_version
      AND (
        (
          receipt.command_kind = 'adjust_actor_possession'
          AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
          AND json_extract(command.protected_payload_json, '$.possessionId') = NEW.possession_id
          AND json_extract(command.protected_payload_json, '$.possessionKey') = NEW.possession_key
          AND json_extract(command.protected_payload_json, '$.name') = NEW.name
          AND NEW.quantity = OLD.quantity
            + json_extract(command.protected_payload_json, '$.quantityDelta')
        ) OR (
          receipt.command_kind = 'pay_actor_obligation'
          AND (
            (
              NEW.actor_id = json_extract(command.protected_payload_json, '$.debtorActorId')
              AND NEW.possession_id = json_extract(command.protected_payload_json, '$.paymentPossessionId')
              AND NEW.quantity = OLD.quantity - json_extract(command.protected_payload_json, '$.amount')
            ) OR (
              NEW.actor_id = json_extract(command.protected_payload_json, '$.creditorActorId')
              AND NEW.possession_key = (
                SELECT payment.possession_key
                FROM campaign_play_actor_possessions AS payment
                WHERE payment.possession_id = json_extract(command.protected_payload_json, '$.paymentPossessionId')
                  AND payment.campaign_id = NEW.campaign_id
              )
              AND NEW.name = (
                SELECT payment.name
                FROM campaign_play_actor_possessions AS payment
                WHERE payment.possession_id = json_extract(command.protected_payload_json, '$.paymentPossessionId')
                  AND payment.campaign_id = NEW.campaign_id
              )
              AND NEW.quantity = OLD.quantity + json_extract(command.protected_payload_json, '$.amount')
            )
          )
        ) OR (
          receipt.command_kind = 'settle_player_receivable'
          AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.actor_id
          AND json_extract(command.protected_payload_json, '$.creditorPossessionId') = NEW.possession_id
          AND json_extract(command.protected_payload_json, '$.creditorPossessionKey') = NEW.possession_key
          AND json_extract(command.protected_payload_json, '$.creditorPossessionName') = NEW.name
          AND NEW.quantity = OLD.quantity + json_extract(command.protected_payload_json, '$.amount')
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_receipt_invalid') END;
END;
--> statement-breakpoint

DROP TRIGGER campaign_play_actor_obligations_update_guard;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_obligations_update_guard
BEFORE UPDATE ON campaign_play_actor_obligations
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.obligation_id <> OLD.obligation_id
    OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.debtor_actor_id <> OLD.debtor_actor_id
    OR NEW.creditor_actor_id <> OLD.creditor_actor_id
    OR NEW.unit_key <> OLD.unit_key
    THEN RAISE(ABORT, 'campaign_play_actor_obligation_identity_immutable') END;
  SELECT CASE WHEN NEW.world_version <= OLD.world_version
    OR NEW.causal_receipt_id = OLD.causal_receipt_id
    THEN RAISE(ABORT, 'campaign_play_actor_obligation_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.result_world_version = NEW.world_version
      AND (
        (
          receipt.command_kind = 'incur_actor_obligation'
          AND json_extract(command.protected_payload_json, '$.debtorActorId') = NEW.debtor_actor_id
          AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.creditor_actor_id
          AND json_extract(command.protected_payload_json, '$.obligationId') = NEW.obligation_id
          AND json_extract(command.protected_payload_json, '$.unitKey') = NEW.unit_key
          AND NEW.principal_amount = OLD.principal_amount
            + json_extract(command.protected_payload_json, '$.amount')
          AND NEW.outstanding_amount = OLD.outstanding_amount
            + json_extract(command.protected_payload_json, '$.amount')
        ) OR (
          receipt.command_kind = 'pay_actor_obligation'
          AND json_extract(command.protected_payload_json, '$.debtorActorId') = NEW.debtor_actor_id
          AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.creditor_actor_id
          AND json_extract(command.protected_payload_json, '$.obligationId') = NEW.obligation_id
          AND json_extract(command.protected_payload_json, '$.unitKey') = NEW.unit_key
          AND NEW.principal_amount = OLD.principal_amount
          AND NEW.outstanding_amount = OLD.outstanding_amount
            - json_extract(command.protected_payload_json, '$.amount')
          AND (SELECT count(*)
            FROM campaign_play_actor_possessions AS possession
            WHERE possession.campaign_id = NEW.campaign_id
              AND possession.causal_receipt_id = NEW.causal_receipt_id) = 2
          AND EXISTS (
            SELECT 1
            FROM campaign_play_actor_possessions AS payment
            WHERE payment.campaign_id = NEW.campaign_id
              AND payment.causal_receipt_id = NEW.causal_receipt_id
              AND payment.possession_id = json_extract(command.protected_payload_json, '$.paymentPossessionId')
              AND payment.actor_id = NEW.debtor_actor_id
          )
          AND EXISTS (
            SELECT 1
            FROM campaign_play_actor_possessions AS payment
            JOIN campaign_play_actor_possessions AS creditor
              ON creditor.campaign_id = payment.campaign_id
              AND creditor.causal_receipt_id = payment.causal_receipt_id
              AND creditor.actor_id = NEW.creditor_actor_id
              AND creditor.possession_key = payment.possession_key
              AND creditor.name = payment.name
            WHERE payment.campaign_id = NEW.campaign_id
              AND payment.causal_receipt_id = NEW.causal_receipt_id
              AND payment.possession_id = json_extract(command.protected_payload_json, '$.paymentPossessionId')
          )
        ) OR (
          receipt.command_kind = 'settle_player_receivable'
          AND json_extract(command.protected_payload_json, '$.debtorActorId') = NEW.debtor_actor_id
          AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.creditor_actor_id
          AND json_extract(command.protected_payload_json, '$.obligationId') = NEW.obligation_id
          AND json_extract(command.protected_payload_json, '$.unitKey') = NEW.unit_key
          AND json_extract(command.protected_payload_json, '$.amount') = OLD.outstanding_amount
          AND NEW.principal_amount = OLD.principal_amount
          AND NEW.outstanding_amount = OLD.outstanding_amount
            - json_extract(command.protected_payload_json, '$.amount')
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_obligation_receipt_invalid') END;
END;
--> statement-breakpoint

CREATE TABLE `__campaign_play_0064_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0064_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_commands'
        AND instr(sql, char(39)||'settle_player_receivable'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_receipts'
        AND instr(sql, char(39)||'settle_player_receivable'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_events'
        AND instr(sql, char(39)||'player_receivable_settled'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger' AND name='campaign_play_events_insert_guard'
        AND instr(sql, char(39)||'player_receivable_settled'||char(39))>0
        AND instr(sql, char(39)||'settle_player_receivable'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
        AND instr(sql, char(39)||'certified_obligation'||char(39))>0) = 3
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name IN ('campaign_play_actor_possessions_insert_guard', 'campaign_play_actor_possessions_update_guard', 'campaign_play_actor_obligations_update_guard')
        AND instr(sql, char(39)||'settle_player_receivable'||char(39))>0) = 3
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0064_schema_guard`;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
