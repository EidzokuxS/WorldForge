PRAGMA writable_schema=ON;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'initialize_pressure_state'||char(39)||char(10)||'      ))',
  char(39)||'initialize_pressure_state'||char(39)||','||char(10)||'        '||char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, char(39)||'initialize_pressure_state'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'initialize_pressure_state'||char(39)||char(10)||'      ) AND',
  char(39)||'initialize_pressure_state'||char(39)||','||char(10)||'        '||char(39)||'adjust_actor_possession'||char(39)||char(10)||'      ) AND'
) WHERE type='table' AND name='campaign_play_receipts'
  AND instr(sql, char(39)||'initialize_pressure_state'||char(39)||char(10)||'      ) AND')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'scene_recorded'||char(39)||char(10)||'      ))',
  char(39)||'scene_recorded'||char(39)||','||char(10)||'        '||char(39)||'actor_possession_adjusted'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_events'
  AND instr(sql, char(39)||'scene_recorded'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10),
  '    (NEW.event_kind = '||char(39)||'actor_possession_adjusted'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'adjust_actor_possession'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10))>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'pressure'||char(39)||', '||char(39)||'world_event'||char(39),
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'world_event'||char(39)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, char(39)||'pressure'||char(39)||', '||char(39)||'world_event'||char(39))>0;
--> statement-breakpoint
PRAGMA writable_schema=RESET;
--> statement-breakpoint
CREATE TABLE `__campaign_play_0035_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0035_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_commands'
        AND instr(sql, char(39)||'adjust_actor_possession'||char(39))>0
        AND instr(sql, char(39)||'initialize_pressure_state'||char(39)||char(10)||'      ))')=0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_receipts'
        AND instr(sql, char(39)||'adjust_actor_possession'||char(39))>0
        AND instr(sql, char(39)||'initialize_pressure_state'||char(39)||char(10)||'      ) AND')=0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='table' AND name='campaign_play_events'
        AND instr(sql, char(39)||'actor_possession_adjusted'||char(39))>0
        AND instr(sql, char(39)||'scene_recorded'||char(39)||char(10)||'      ))')=0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger' AND name='campaign_play_events_insert_guard'
        AND instr(sql, char(39)||'actor_possession_adjusted'||char(39))>0
        AND instr(sql, char(39)||'adjust_actor_possession'||char(39))>0
        AND instr(sql, char(39)||'possession'||char(39))>0
        AND instr(sql, char(39)||'pressure'||char(39)||', '||char(39)||'world_event'||char(39))=0) = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0035_schema_guard`;
--> statement-breakpoint
CREATE TABLE `campaign_play_actor_possessions` (
  `possession_id` text PRIMARY KEY NOT NULL,
  `campaign_id` text NOT NULL,
  `actor_id` text NOT NULL,
  `possession_key` text NOT NULL,
  `name` text NOT NULL,
  `quantity` integer DEFAULT 0 NOT NULL,
  `causal_receipt_id` text NOT NULL,
  `world_version` integer NOT NULL,
  `updated_at` integer NOT NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE cascade,
  FOREIGN KEY (`causal_receipt_id`) REFERENCES `campaign_play_receipts`(`receipt_id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT "campaign_play_actor_possessions_valid" CHECK(length("campaign_play_actor_possessions"."possession_id") BETWEEN 1 AND 128
    AND length("campaign_play_actor_possessions"."campaign_id") BETWEEN 1 AND 128
    AND length("campaign_play_actor_possessions"."actor_id") BETWEEN 1 AND 128
    AND length("campaign_play_actor_possessions"."possession_key") BETWEEN 1 AND 240
    AND length("campaign_play_actor_possessions"."name") BETWEEN 1 AND 120
    AND "campaign_play_actor_possessions"."quantity" BETWEEN 0 AND 1000000
    AND "campaign_play_actor_possessions"."world_version" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_possessions_actor_key_unique` ON `campaign_play_actor_possessions` (`actor_id`,`possession_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_actor_possessions_receipt_unique` ON `campaign_play_actor_possessions` (`causal_receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_possessions_campaign_actor` ON `campaign_play_actor_possessions` (`campaign_id`,`actor_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_actor_possessions_campaign_version` ON `campaign_play_actor_possessions` (`campaign_id`,`world_version`);--> statement-breakpoint
CREATE TRIGGER campaign_play_events_possession_ref_guard
BEFORE INSERT ON campaign_play_events
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.affected_refs_json)
  WHERE json_extract(value, '$.kind') = 'possession'
    AND NOT EXISTS (
      SELECT 1 FROM campaign_play_actor_possessions
      WHERE possession_id = json_extract(value, '$.id')
        AND campaign_id = NEW.campaign_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch');
END;
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
      AND receipt.command_kind = 'adjust_actor_possession'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.possessionId') = NEW.possession_id
      AND json_extract(command.protected_payload_json, '$.possessionKey') = NEW.possession_key
      AND json_extract(command.protected_payload_json, '$.name') = NEW.name
      AND json_extract(command.protected_payload_json, '$.quantityDelta') = NEW.quantity
      AND NEW.quantity > 0
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_receipt_invalid') END;
END;
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
      AND receipt.command_kind = 'adjust_actor_possession'
      AND receipt.result_world_version = NEW.world_version
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.possessionId') = NEW.possession_id
      AND json_extract(command.protected_payload_json, '$.possessionKey') = NEW.possession_key
      AND json_extract(command.protected_payload_json, '$.name') = NEW.name
      AND NEW.quantity = OLD.quantity
        + json_extract(command.protected_payload_json, '$.quantityDelta')
  ) THEN RAISE(ABORT, 'campaign_play_actor_possession_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_possessions_delete_immutable
BEFORE DELETE ON campaign_play_actor_possessions
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_actor_possession_immutable');
END;
