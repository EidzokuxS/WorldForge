PRAGMA writable_schema=ON;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ))',
  char(39)||'adjust_actor_possession'||char(39)||','||char(10)||'        '||char(39)||'incur_actor_obligation'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ) AND',
  char(39)||'adjust_actor_possession'||char(39)||','||char(10)||'        '||char(39)||'incur_actor_obligation'||char(39)||char(10)||'      ) AND'
) WHERE type='table' AND name='campaign_play_receipts'
  AND instr(sql, char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ) AND')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'actor_possession_adjusted'||char(39)||char(10)||'      ))',
  char(39)||'actor_possession_adjusted'||char(39)||','||char(10)||'        '||char(39)||'actor_obligation_incurred'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_events'
  AND instr(sql, char(39)||'actor_possession_adjusted'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10),
  '    (NEW.event_kind = '||char(39)||'actor_obligation_incurred'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'incur_actor_obligation'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10))>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'world_event'||char(39),
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'world_event'||char(39)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'world_event'||char(39))>0;
--> statement-breakpoint
PRAGMA writable_schema=RESET;
--> statement-breakpoint
CREATE TABLE `__campaign_play_0037_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0037_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_commands'
        AND instr(sql, char(39)||'incur_actor_obligation'||char(39))>0
        AND instr(sql, char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ))')=0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_receipts'
        AND instr(sql, char(39)||'incur_actor_obligation'||char(39))>0
        AND instr(sql, char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ) AND')=0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_events'
        AND instr(sql, char(39)||'actor_obligation_incurred'||char(39))>0
        AND instr(sql, char(39)||'actor_possession_adjusted'||char(39)||char(10)||'      ))')=0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger' AND name='campaign_play_events_insert_guard'
        AND instr(sql, char(39)||'actor_obligation_incurred'||char(39))>0
        AND instr(sql, char(39)||'incur_actor_obligation'||char(39))>0
        AND instr(sql, char(39)||'obligation'||char(39))>0
        AND instr(sql, char(39)||'possession'||char(39)||', '||char(39)||'world_event'||char(39))=0) = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0037_schema_guard`;
--> statement-breakpoint
CREATE TABLE `campaign_play_actor_obligations` (
  `obligation_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `debtor_actor_id` text NOT NULL,
  `creditor_actor_id` text NOT NULL,
  `unit_key` text NOT NULL,
  `principal_amount` integer NOT NULL,
  `outstanding_amount` integer NOT NULL,
  `causal_receipt_id` text NOT NULL,
  `world_version` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`debtor_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`creditor_actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`causal_receipt_id`) REFERENCES `campaign_play_receipts`(`receipt_id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "campaign_play_actor_obligations_valid" CHECK(length("campaign_play_actor_obligations"."obligation_id") BETWEEN 1 AND 128
    AND length("campaign_play_actor_obligations"."campaign_id") BETWEEN 1 AND 128
    AND length("campaign_play_actor_obligations"."debtor_actor_id") BETWEEN 1 AND 128
    AND length("campaign_play_actor_obligations"."creditor_actor_id") BETWEEN 1 AND 128
    AND "campaign_play_actor_obligations"."debtor_actor_id" <> "campaign_play_actor_obligations"."creditor_actor_id"
    AND "campaign_play_actor_obligations"."unit_key" = 'copper'
    AND "campaign_play_actor_obligations"."principal_amount" BETWEEN 1 AND 1000000
    AND "campaign_play_actor_obligations"."outstanding_amount" BETWEEN 1 AND "campaign_play_actor_obligations"."principal_amount"
    AND "campaign_play_actor_obligations"."world_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_obligations_debtor_creditor_unit_unique` ON `campaign_play_actor_obligations` (`debtor_actor_id`,`creditor_actor_id`,`unit_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_obligations_receipt_unique` ON `campaign_play_actor_obligations` (`causal_receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_obligations_campaign_debtor` ON `campaign_play_actor_obligations` (`campaign_id`,`debtor_actor_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_obligations_campaign_creditor` ON `campaign_play_actor_obligations` (`campaign_id`,`creditor_actor_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_obligations_campaign_version` ON `campaign_play_actor_obligations` (`campaign_id`,`world_version`);--> statement-breakpoint
CREATE TRIGGER campaign_play_events_obligation_ref_guard
BEFORE INSERT ON campaign_play_events
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.affected_refs_json)
  WHERE json_extract(value, '$.kind') = 'obligation'
    AND NOT EXISTS (
      SELECT 1 FROM campaign_play_actor_obligations
      WHERE obligation_id = json_extract(value, '$.id')
        AND campaign_id = NEW.campaign_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_obligations_insert_guard
BEFORE INSERT ON campaign_play_actor_obligations
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.debtor_actor_id = NEW.creditor_actor_id
    OR NOT EXISTS (
      SELECT 1 FROM actors WHERE id = NEW.debtor_actor_id AND campaign_id = NEW.campaign_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM actors WHERE id = NEW.creditor_actor_id AND campaign_id = NEW.campaign_id
    ) THEN RAISE(ABORT, 'campaign_play_actor_obligation_campaign_mismatch') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
      ON command.command_id = receipt.command_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.command_kind = 'incur_actor_obligation'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.debtorActorId') = NEW.debtor_actor_id
      AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.creditor_actor_id
      AND json_extract(command.protected_payload_json, '$.obligationId') = NEW.obligation_id
      AND json_extract(command.protected_payload_json, '$.unitKey') = NEW.unit_key
      AND json_extract(command.protected_payload_json, '$.amount') = NEW.principal_amount
      AND NEW.principal_amount = NEW.outstanding_amount
  ) THEN RAISE(ABORT, 'campaign_play_actor_obligation_receipt_invalid') END;
END;
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
      AND receipt.command_kind = 'incur_actor_obligation'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.debtorActorId') = NEW.debtor_actor_id
      AND json_extract(command.protected_payload_json, '$.creditorActorId') = NEW.creditor_actor_id
      AND json_extract(command.protected_payload_json, '$.obligationId') = NEW.obligation_id
      AND json_extract(command.protected_payload_json, '$.unitKey') = NEW.unit_key
      AND NEW.principal_amount = OLD.principal_amount
        + json_extract(command.protected_payload_json, '$.amount')
      AND NEW.outstanding_amount = OLD.outstanding_amount
        + json_extract(command.protected_payload_json, '$.amount')
  ) THEN RAISE(ABORT, 'campaign_play_actor_obligation_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_obligations_delete_immutable
BEFORE DELETE ON campaign_play_actor_obligations
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_actor_obligation_immutable');
END;
