PRAGMA writable_schema=ON;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'incur_actor_obligation'||char(39)||char(10)||'      ))',
  char(39)||'incur_actor_obligation'||char(39)||','||char(10)||'        '||char(39)||'pay_actor_obligation'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, char(39)||'incur_actor_obligation'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'incur_actor_obligation'||char(39)||char(10)||'      ) AND',
  char(39)||'incur_actor_obligation'||char(39)||','||char(10)||'        '||char(39)||'pay_actor_obligation'||char(39)||char(10)||'      ) AND'
) WHERE type='table' AND name='campaign_play_receipts'
  AND instr(sql, char(39)||'incur_actor_obligation'||char(39)||char(10)||'      ) AND')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'actor_obligation_incurred'||char(39)||char(10)||'      ))',
  char(39)||'actor_obligation_incurred'||char(39)||','||char(10)||'        '||char(39)||'actor_obligation_payment_applied'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_events'
  AND instr(sql, char(39)||'actor_obligation_incurred'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '    (NEW.event_kind = '||char(39)||'actor_obligation_incurred'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'incur_actor_obligation'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10),
  '    (NEW.event_kind = '||char(39)||'actor_obligation_incurred'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'incur_actor_obligation'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'actor_obligation_payment_applied'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'pay_actor_obligation'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, '    (NEW.event_kind = '||char(39)||'actor_obligation_incurred'||char(39)||' AND EXISTS ('||char(10))>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '"campaign_play_actor_obligations"."outstanding_amount" BETWEEN 1 AND "campaign_play_actor_obligations"."principal_amount"',
  '"campaign_play_actor_obligations"."outstanding_amount" BETWEEN 0 AND "campaign_play_actor_obligations"."principal_amount"'
) WHERE type='table' AND name='campaign_play_actor_obligations'
  AND instr(sql, '"campaign_play_actor_obligations"."outstanding_amount" BETWEEN 1 AND "campaign_play_actor_obligations"."principal_amount"')>0;
--> statement-breakpoint
PRAGMA writable_schema=RESET;
--> statement-breakpoint
CREATE TABLE `__campaign_play_0038_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0038_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_commands'
        AND instr(sql, char(39)||'pay_actor_obligation'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_receipts'
        AND instr(sql, char(39)||'pay_actor_obligation'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_events'
        AND instr(sql, char(39)||'actor_obligation_payment_applied'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger' AND name='campaign_play_events_insert_guard'
        AND instr(sql, char(39)||'actor_obligation_payment_applied'||char(39))>0
        AND instr(sql, char(39)||'pay_actor_obligation'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_actor_obligations'
        AND instr(sql, '"campaign_play_actor_obligations"."outstanding_amount" BETWEEN 0 AND "campaign_play_actor_obligations"."principal_amount"')>0) = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0038_schema_guard`;
--> statement-breakpoint
DROP INDEX `campaign_play_actor_possessions_receipt_unique`;
--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_possessions_receipt`
  ON `campaign_play_actor_possessions` (`causal_receipt_id`);
--> statement-breakpoint
DROP TRIGGER `campaign_play_actor_possessions_insert_guard`;
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
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_receipt_invalid') END;
END;
--> statement-breakpoint
DROP TRIGGER `campaign_play_actor_possessions_update_guard`;
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
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_receipt_invalid') END;
END;
--> statement-breakpoint
DROP TRIGGER `campaign_play_actor_obligations_update_guard`;
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
        )
      )
  ) THEN RAISE(ABORT, 'campaign_play_actor_obligation_receipt_invalid') END;
END;
