PRAGMA writable_schema=ON;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'materialize_support_actor'||char(39)||char(10)||'      ))',
  char(39)||'materialize_support_actor'||char(39)||','||char(10)||'        '||char(39)||'decision_open'||char(39)||','||char(10)||'        '||char(39)||'decision_resolve'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, char(39)||'materialize_support_actor'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'materialize_support_actor'||char(39)||char(10)||'      ) AND',
  char(39)||'materialize_support_actor'||char(39)||','||char(10)||'        '||char(39)||'decision_open'||char(39)||','||char(10)||'        '||char(39)||'decision_resolve'||char(39)||char(10)||'      ) AND'
) WHERE type='table' AND name='campaign_play_receipts'
  AND instr(sql, char(39)||'materialize_support_actor'||char(39)||char(10)||'      ) AND')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'support_actor_materialized'||char(39)||char(10)||'      ))',
  char(39)||'support_actor_materialized'||char(39)||','||char(10)||'        '||char(39)||'decision_opened'||char(39)||','||char(10)||'        '||char(39)||'decision_accepted'||char(39)||','||char(10)||'        '||char(39)||'decision_declined'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_events'
  AND instr(sql, char(39)||'support_actor_materialized'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '    (NEW.event_kind = '||char(39)||'support_actor_materialized'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'materialize_support_actor'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10),
  '    (NEW.event_kind = '||char(39)||'support_actor_materialized'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'materialize_support_actor'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'decision_opened'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'decision_open'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'decision_accepted'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'decision_resolve'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'decision_declined'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'decision_resolve'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, '    (NEW.event_kind = '||char(39)||'support_actor_materialized'||char(39)||' AND EXISTS ('||char(10))>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'world_event'||char(39),
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'decision'||char(39)||', '||char(39)||'world_event'||char(39)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'world_event'||char(39))>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'certified_move'||char(39)||', '||char(39)||'certified_wait'||char(39)||', '||char(39)||'certified_contact'||char(39)||', '||char(39)||'certified_observe'||char(39),
  char(39)||'certified_move'||char(39)||', '||char(39)||'certified_wait'||char(39)||', '||char(39)||'certified_contact'||char(39)||', '||char(39)||'certified_observe'||char(39)||', '||char(39)||'certified_decision'||char(39)
) WHERE type='trigger'
  AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
  AND instr(sql, char(39)||'certified_decision'||char(39))=0;
--> statement-breakpoint
PRAGMA writable_schema=RESET;
--> statement-breakpoint
CREATE TABLE `__campaign_play_0058_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0058_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_commands'
      AND instr(sql, char(39)||'decision_open'||char(39))>0
      AND instr(sql, char(39)||'decision_resolve'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_receipts'
      AND instr(sql, char(39)||'decision_open'||char(39))>0
      AND instr(sql, char(39)||'decision_resolve'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_events'
      AND instr(sql, char(39)||'decision_opened'||char(39))>0
      AND instr(sql, char(39)||'decision_accepted'||char(39))>0
      AND instr(sql, char(39)||'decision_declined'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name='campaign_play_events_insert_guard'
      AND instr(sql, char(39)||'decision_opened'||char(39))>0
      AND instr(sql, char(39)||'decision_accepted'||char(39))>0
      AND instr(sql, char(39)||'decision_declined'||char(39))>0
      AND instr(sql, char(39)||'decision'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema
      WHERE type='trigger'
        AND name IN ('campaign_play_turn_results_insert_guard', 'campaign_play_turn_terminal_result', 'campaign_play_turn_terminal_result_insert')
        AND instr(sql, char(39)||'certified_decision'||char(39))>0) = 3
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0058_schema_guard`;
--> statement-breakpoint
CREATE TABLE `campaign_play_decisions` (
	`decision_key` text PRIMARY KEY NOT NULL,
	`campaign_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`actor_handle` text NOT NULL,
	`decision_kind` text NOT NULL,
	`source_turn_id` text NOT NULL,
	`status` text NOT NULL,
	`summary` text NOT NULL,
	`accept_label` text NOT NULL,
	`decline_label` text NOT NULL,
	`opened_at` integer NOT NULL,
	`resolved_at` integer,
	`resolution_turn_id` text,
	`resolution_event_id` text,
	`world_version` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaign_play_states`(`campaign_id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `actors`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_turn_id`) REFERENCES `campaign_play_turns`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`resolution_event_id`) REFERENCES `campaign_play_events`(`event_id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `campaign_play_decisions_payload_valid` CHECK (
		length(`decision_key`) BETWEEN 1 AND 256
		AND length(`campaign_id`) BETWEEN 1 AND 128
		AND length(`actor_id`) BETWEEN 1 AND 128
		AND length(`actor_handle`) BETWEEN 1 AND 128
		AND `decision_kind` IN ('offer', 'yes_no', 'demand')
		AND length(`source_turn_id`) BETWEEN 1 AND 256
		AND `status` IN ('open', 'accepted', 'declined')
		AND length(`summary`) BETWEEN 1 AND 4000
		AND length(`accept_label`) BETWEEN 1 AND 256
		AND length(`decline_label`) BETWEEN 1 AND 256
		AND `opened_at` >= 0
		AND (`resolved_at` IS NULL OR `resolved_at` >= `opened_at`)
		AND (`resolution_turn_id` IS NULL OR length(`resolution_turn_id`) BETWEEN 1 AND 256)
		AND (`resolution_event_id` IS NULL OR length(`resolution_event_id`) BETWEEN 1 AND 256)
		AND `world_version` >= 1
		AND `created_at` >= 0
		AND `updated_at` >= `created_at`
	),
	CONSTRAINT `campaign_play_decisions_state_consistent` CHECK ((
			`status` = 'open'
			AND `resolved_at` IS NULL
			AND `resolution_turn_id` IS NULL
			AND `resolution_event_id` IS NULL
		) OR (
			`status` IN ('accepted', 'declined')
			AND `resolved_at` IS NOT NULL
			AND `resolution_turn_id` IS NOT NULL
			AND `resolution_event_id` IS NOT NULL
		))
);--> statement-breakpoint
CREATE UNIQUE INDEX `campaign_play_decisions_identity_unique`
	ON `campaign_play_decisions` (`campaign_id`, `source_turn_id`, `actor_id`, `decision_kind`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_decisions_campaign_status`
	ON `campaign_play_decisions` (`campaign_id`, `status`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_decisions_campaign_source`
	ON `campaign_play_decisions` (`campaign_id`, `source_turn_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_decisions_campaign_actor`
	ON `campaign_play_decisions` (`campaign_id`, `actor_id`);--> statement-breakpoint
CREATE INDEX `idx_campaign_play_decisions_resolution_event`
	ON `campaign_play_decisions` (`resolution_event_id`);
--> statement-breakpoint
CREATE TRIGGER `campaign_play_decisions_insert_guard`
BEFORE INSERT ON `campaign_play_decisions`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM `actors`
    WHERE `id` = NEW.actor_id AND `campaign_id` = NEW.campaign_id
  ) THEN RAISE(ABORT, 'campaign_play_decision_campaign_mismatch') END;

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
      AND receipt.created_at = NEW.created_at
      AND receipt.created_at = NEW.updated_at
      AND command.command_kind = 'decision_open'
      AND json_extract(command.protected_payload_json, '$.decisionKey') = NEW.decision_key
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.actorHandle') = NEW.actor_handle
      AND json_extract(command.protected_payload_json, '$.decisionKind') = NEW.decision_kind
      AND json_extract(command.protected_payload_json, '$.sourceTurnId') = NEW.source_turn_id
      AND json_extract(command.protected_payload_json, '$.summary') = NEW.summary
      AND json_extract(command.protected_payload_json, '$.acceptLabel') = NEW.accept_label
      AND json_extract(command.protected_payload_json, '$.declineLabel') = NEW.decline_label
  ) THEN RAISE(ABORT, 'campaign_play_decision_open_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_decisions_update_guard`
BEFORE UPDATE ON `campaign_play_decisions`
FOR EACH ROW
BEGIN
  SELECT CASE WHEN NEW.decision_key <> OLD.decision_key
    OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.actor_id <> OLD.actor_id
    OR NEW.actor_handle <> OLD.actor_handle
    OR NEW.decision_kind <> OLD.decision_kind
    OR NEW.source_turn_id <> OLD.source_turn_id
    OR NEW.summary <> OLD.summary
    OR NEW.accept_label <> OLD.accept_label
    OR NEW.decline_label <> OLD.decline_label
    OR NEW.opened_at <> OLD.opened_at
    OR NEW.created_at <> OLD.created_at
    THEN RAISE(ABORT, 'campaign_play_decision_identity_immutable') END;

  SELECT CASE WHEN OLD.status <> 'open'
    OR NEW.status NOT IN ('accepted', 'declined')
    OR NEW.world_version <= OLD.world_version
    OR NEW.resolved_at IS NULL
    OR NEW.resolution_turn_id IS NULL
    OR NEW.resolution_event_id IS NULL
    OR NEW.updated_at <= OLD.updated_at
    THEN RAISE(ABORT, 'campaign_play_decision_transition_invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM `campaign_play_receipts` AS receipt
    JOIN `campaign_play_commands` AS command
      ON command.command_id = receipt.command_id
    JOIN `campaign_play_events` AS event
      ON event.event_id = NEW.resolution_event_id
      AND event.receipt_id = receipt.receipt_id
      AND event.command_id = command.command_id
    WHERE receipt.campaign_id = NEW.campaign_id
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.command_kind = 'decision_resolve'
      AND receipt.turn_id IS NEW.resolution_turn_id
      AND receipt.result_world_version = NEW.world_version
      AND receipt.created_at = NEW.resolved_at
      AND receipt.created_at = NEW.updated_at
      AND command.command_kind = 'decision_resolve'
      AND json_extract(command.protected_payload_json, '$.decisionKey') = NEW.decision_key
      AND json_extract(command.protected_payload_json, '$.actorId') = NEW.actor_id
      AND json_extract(command.protected_payload_json, '$.actorHandle') = NEW.actor_handle
      AND json_extract(command.protected_payload_json, '$.decisionKind') = NEW.decision_kind
      AND json_extract(command.protected_payload_json, '$.sourceTurnId') = NEW.source_turn_id
      AND json_extract(command.protected_payload_json, '$.summary') = OLD.summary
      AND json_extract(command.protected_payload_json, '$.selectedLabel') = CASE NEW.status
        WHEN 'accepted' THEN OLD.accept_label
        WHEN 'declined' THEN OLD.decline_label
      END
      AND json_extract(command.protected_payload_json, '$.disposition') = CASE NEW.status
        WHEN 'accepted' THEN 'accept'
        WHEN 'declined' THEN 'decline'
      END
      AND EXISTS (
        SELECT 1 FROM json_each(receipt.causal_event_ids_json)
        WHERE value = NEW.resolution_event_id
      )
      AND event.campaign_id = NEW.campaign_id
      AND event.turn_id IS NEW.resolution_turn_id
      AND event.world_version = NEW.world_version
      AND event.event_kind = CASE NEW.status
        WHEN 'accepted' THEN 'decision_accepted'
        WHEN 'declined' THEN 'decision_declined'
      END
      AND EXISTS (
        SELECT 1
        FROM json_each(event.affected_refs_json) AS affected_ref
        WHERE json_extract(affected_ref.value, '$.kind') = 'decision'
          AND json_extract(affected_ref.value, '$.id') = OLD.decision_key
      )
  ) THEN RAISE(ABORT, 'campaign_play_decision_resolve_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_decisions_delete_immutable`
BEFORE DELETE ON `campaign_play_decisions`
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_decision_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `campaign_play_events_decision_ref_guard`
BEFORE INSERT ON `campaign_play_events`
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.affected_refs_json)
  WHERE json_extract(value, '$.kind') = 'decision'
    AND NOT EXISTS (
      SELECT 1 FROM `campaign_play_decisions`
      WHERE `decision_key` = json_extract(value, '$.id')
        AND `campaign_id` = NEW.campaign_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch');
END;
