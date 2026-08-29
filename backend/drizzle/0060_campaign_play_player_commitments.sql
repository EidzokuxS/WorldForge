PRAGMA foreign_keys=ON;
--> statement-breakpoint
PRAGMA writable_schema=ON;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'decision_resolve'||char(39)||char(10)||'      ))',
  char(39)||'decision_resolve'||char(39)||','||char(10)||
    '        '||char(39)||'create_player_commitment'||char(39)||','||char(10)||
    '        '||char(39)||'complete_player_commitment'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_commands'
  AND instr(sql, char(39)||'decision_resolve'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'decision_resolve'||char(39)||char(10)||'      ) AND',
  char(39)||'decision_resolve'||char(39)||','||char(10)||
    '        '||char(39)||'create_player_commitment'||char(39)||','||char(10)||
    '        '||char(39)||'complete_player_commitment'||char(39)||char(10)||'      ) AND'
) WHERE type='table' AND name='campaign_play_receipts'
  AND instr(sql, char(39)||'decision_resolve'||char(39)||char(10)||'      ) AND')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'decision_declined'||char(39)||char(10)||'      ))',
  char(39)||'decision_declined'||char(39)||','||char(10)||
    '        '||char(39)||'player_commitment_created'||char(39)||','||char(10)||
    '        '||char(39)||'player_commitment_completed'||char(39)||char(10)||'      ))'
) WHERE type='table' AND name='campaign_play_events'
  AND instr(sql, char(39)||'decision_declined'||char(39)||char(10)||'      ))')>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  '    (NEW.event_kind = '||char(39)||'decision_declined'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'decision_resolve'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10),
  '    (NEW.event_kind = '||char(39)||'decision_declined'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'decision_resolve'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'player_commitment_created'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'create_player_commitment'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'player_commitment_completed'||char(39)||' AND EXISTS ('||char(10)||
  '      SELECT 1 FROM campaign_play_commands WHERE command_id = NEW.command_id'||char(10)||
  '        AND command_kind = '||char(39)||'complete_player_commitment'||char(39)||char(10)||
  '    )) OR'||char(10)||
  '    (NEW.event_kind = '||char(39)||'scene_recorded'||char(39)||' AND EXISTS ('||char(10)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, '    (NEW.event_kind = '||char(39)||'decision_declined'||char(39)||' AND EXISTS ('||char(10))>0;
--> statement-breakpoint
UPDATE sqlite_schema SET sql=replace(
  sql,
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'decision'||char(39)||', '||char(39)||'world_event'||char(39),
  char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'decision'||char(39)||', '||char(39)||'commitment'||char(39)||', '||char(39)||'world_event'||char(39)
) WHERE type='trigger' AND name='campaign_play_events_insert_guard'
  AND instr(sql, char(39)||'pressure'||char(39)||', '||char(39)||'possession'||char(39)||', '||char(39)||'obligation'||char(39)||', '||char(39)||'decision'||char(39)||', '||char(39)||'world_event'||char(39))>0;
--> statement-breakpoint
PRAGMA writable_schema=RESET;
--> statement-breakpoint
DROP TRIGGER campaign_play_decisions_accept_effect_insert_guard;
--> statement-breakpoint
CREATE TRIGGER campaign_play_decisions_accept_effect_insert_guard
BEFORE INSERT ON campaign_play_decisions
FOR EACH ROW
WHEN NEW.accept_effect_json IS NOT NULL
BEGIN
  SELECT CASE WHEN NOT (
    json_valid(NEW.accept_effect_json)
    AND json_type(NEW.accept_effect_json) = 'object'
    AND (
      (
        json_extract(NEW.accept_effect_json, '$.kind') = 'grant_player_possession'
        AND (SELECT count(*) FROM json_each(NEW.accept_effect_json)) = 2
        AND json_type(NEW.accept_effect_json, '$.name') = 'text'
        AND length(json_extract(NEW.accept_effect_json, '$.name')) BETWEEN 1 AND 120
      ) OR (
        json_extract(NEW.accept_effect_json, '$.kind') = 'paid_delivery'
        AND (SELECT count(*) FROM json_each(NEW.accept_effect_json)) IN (7, 8)
        AND json_type(NEW.accept_effect_json, '$.title') = 'text'
        AND length(json_extract(NEW.accept_effect_json, '$.title')) BETWEEN 1 AND 240
        AND json_type(NEW.accept_effect_json, '$.subjectName') = 'text'
        AND length(json_extract(NEW.accept_effect_json, '$.subjectName')) BETWEEN 1 AND 120
        AND json_type(NEW.accept_effect_json, '$.destinationHandle') = 'text'
        AND length(json_extract(NEW.accept_effect_json, '$.destinationHandle')) BETWEEN 1 AND 128
        AND json_extract(NEW.accept_effect_json, '$.feeUnit') = 'copper'
        AND json_type(NEW.accept_effect_json, '$.feeAmount') = 'integer'
        AND json_extract(NEW.accept_effect_json, '$.feeAmount') BETWEEN 1 AND 1000000
        AND json_extract(NEW.accept_effect_json, '$.paymentTiming') = 'on_completion'
        AND (
          json_type(NEW.accept_effect_json, '$.dueInMinutes') IS NULL
          OR (
            json_type(NEW.accept_effect_json, '$.dueInMinutes') = 'integer'
            AND json_extract(NEW.accept_effect_json, '$.dueInMinutes') BETWEEN 1 AND 10080
          )
        )
      )
    )
  ) THEN RAISE(ABORT, 'campaign_play_decision_accept_effect_invalid') END;

  SELECT CASE WHEN NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts AS receipt
    JOIN campaign_play_commands AS command
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
CREATE TABLE campaign_play_commitments (
  commitment_id TEXT PRIMARY KEY NOT NULL,
  campaign_id TEXT NOT NULL REFERENCES campaign_play_states(campaign_id) ON DELETE CASCADE,
  performer_actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  counterparty_actor_id TEXT NOT NULL REFERENCES actors(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  title TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  destination_handle TEXT NOT NULL,
  fee_unit TEXT NOT NULL,
  fee_amount INTEGER NOT NULL,
  payment_timing TEXT NOT NULL,
  accepted_world_time_minutes INTEGER NOT NULL,
  due_world_time_minutes INTEGER,
  source_decision_key TEXT NOT NULL REFERENCES campaign_play_decisions(decision_key) ON DELETE RESTRICT,
  source_turn_id TEXT NOT NULL REFERENCES campaign_play_turns(id) ON DELETE RESTRICT,
  source_receipt_id TEXT NOT NULL REFERENCES campaign_play_receipts(receipt_id) ON DELETE RESTRICT,
  completion_turn_id TEXT REFERENCES campaign_play_turns(id) ON DELETE RESTRICT,
  completion_receipt_id TEXT REFERENCES campaign_play_receipts(receipt_id) ON DELETE RESTRICT,
  world_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CONSTRAINT campaign_play_commitments_payload_valid CHECK (
    length(commitment_id) BETWEEN 1 AND 128
    AND length(campaign_id) BETWEEN 1 AND 128
    AND length(performer_actor_id) BETWEEN 1 AND 128
    AND length(counterparty_actor_id) BETWEEN 1 AND 128
    AND performer_actor_id <> counterparty_actor_id
    AND kind = 'paid_delivery'
    AND status IN ('active', 'completed')
    AND length(title) BETWEEN 1 AND 240
    AND length(subject_name) BETWEEN 1 AND 120
    AND length(destination_handle) BETWEEN 1 AND 128
    AND fee_unit = 'copper'
    AND fee_amount BETWEEN 1 AND 1000000
    AND payment_timing = 'on_completion'
    AND accepted_world_time_minutes BETWEEN 0 AND 2147483647
    AND (due_world_time_minutes IS NULL OR due_world_time_minutes BETWEEN 1 AND 2147483647)
    AND length(source_decision_key) BETWEEN 1 AND 256
    AND length(source_turn_id) BETWEEN 1 AND 256
    AND length(source_receipt_id) BETWEEN 1 AND 256
    AND (completion_turn_id IS NULL OR length(completion_turn_id) BETWEEN 1 AND 256)
    AND (completion_receipt_id IS NULL OR length(completion_receipt_id) BETWEEN 1 AND 256)
    AND world_version >= 1
    AND created_at >= 0
    AND updated_at >= created_at
  ),
  CONSTRAINT campaign_play_commitments_state_consistent CHECK (
    (status = 'active' AND completion_turn_id IS NULL AND completion_receipt_id IS NULL)
    OR (status = 'completed' AND completion_turn_id IS NOT NULL AND completion_receipt_id IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX campaign_play_commitments_campaign_source_decision_unique
  ON campaign_play_commitments(campaign_id, source_decision_key);
--> statement-breakpoint
CREATE UNIQUE INDEX campaign_play_commitments_source_receipt_unique
  ON campaign_play_commitments(source_receipt_id);
--> statement-breakpoint
CREATE UNIQUE INDEX campaign_play_commitments_completion_receipt_unique
  ON campaign_play_commitments(completion_receipt_id)
  WHERE completion_receipt_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX idx_campaign_play_commitments_campaign_status
  ON campaign_play_commitments(campaign_id, status);
--> statement-breakpoint
CREATE INDEX idx_campaign_play_commitments_campaign_performer
  ON campaign_play_commitments(campaign_id, performer_actor_id);
--> statement-breakpoint
CREATE INDEX idx_campaign_play_commitments_campaign_counterparty
  ON campaign_play_commitments(campaign_id, counterparty_actor_id);
--> statement-breakpoint
CREATE INDEX idx_campaign_play_commitments_campaign_due
  ON campaign_play_commitments(campaign_id, status, due_world_time_minutes);
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
      AND json_extract(decision.accept_effect_json, '$.kind') = 'paid_delivery'
      AND json_extract(decision.accept_effect_json, '$.title') = NEW.title
      AND json_extract(decision.accept_effect_json, '$.subjectName') = NEW.subject_name
      AND json_extract(decision.accept_effect_json, '$.destinationHandle') = NEW.destination_handle
      AND json_extract(decision.accept_effect_json, '$.feeUnit') = NEW.fee_unit
      AND json_extract(decision.accept_effect_json, '$.feeAmount') = NEW.fee_amount
      AND json_extract(decision.accept_effect_json, '$.paymentTiming') = NEW.payment_timing
      AND (
        (json_type(decision.accept_effect_json, '$.dueInMinutes') IS NULL AND NEW.due_world_time_minutes IS NULL)
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
      AND json_extract(command.protected_payload_json, '$.feeUnit') = NEW.fee_unit
      AND json_extract(command.protected_payload_json, '$.feeAmount') = NEW.fee_amount
      AND json_extract(command.protected_payload_json, '$.paymentTiming') = NEW.payment_timing
      AND json_extract(command.protected_payload_json, '$.acceptedWorldTimeMinutes') = NEW.accepted_world_time_minutes
      AND (
        (json_type(command.protected_payload_json, '$.dueWorldTimeMinutes') IS NULL AND NEW.due_world_time_minutes IS NULL)
        OR json_extract(command.protected_payload_json, '$.dueWorldTimeMinutes') = NEW.due_world_time_minutes
      )
  ) THEN RAISE(ABORT, 'campaign_play_commitment_create_receipt_invalid') END;
END;
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
  ) THEN RAISE(ABORT, 'campaign_play_commitment_completion_receipt_invalid') END;
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_commitments_delete_immutable
BEFORE DELETE ON campaign_play_commitments
FOR EACH ROW
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_commitment_immutable');
END;
--> statement-breakpoint
CREATE TRIGGER campaign_play_events_commitment_ref_guard
BEFORE INSERT ON campaign_play_events
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.affected_refs_json)
  WHERE json_extract(value, '$.kind') = 'commitment'
    AND NOT EXISTS (
      SELECT 1 FROM campaign_play_commitments
      WHERE commitment_id = json_extract(value, '$.id')
        AND campaign_id = NEW.campaign_id
    )
)
BEGIN
  SELECT RAISE(ABORT, 'campaign_play_event_ref_campaign_mismatch');
END;
--> statement-breakpoint
CREATE TABLE `__campaign_play_0060_schema_guard` (
  `valid` integer NOT NULL CHECK (`valid` = 1)
);
--> statement-breakpoint
INSERT INTO `__campaign_play_0060_schema_guard` (`valid`) VALUES (
  CASE WHEN
    (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_commands'
      AND instr(sql, char(39)||'create_player_commitment'||char(39))>0
      AND instr(sql, char(39)||'complete_player_commitment'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_receipts'
      AND instr(sql, char(39)||'create_player_commitment'||char(39))>0
      AND instr(sql, char(39)||'complete_player_commitment'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_events'
      AND instr(sql, char(39)||'player_commitment_created'||char(39))>0
      AND instr(sql, char(39)||'player_commitment_completed'||char(39))>0) = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='table' AND name='campaign_play_commitments') = 1
    AND (SELECT count(*) FROM sqlite_schema WHERE type='trigger' AND name='campaign_play_events_insert_guard'
      AND instr(sql, char(39)||'player_commitment_created'||char(39))>0
      AND instr(sql, char(39)||'player_commitment_completed'||char(39))>0
      AND instr(sql, char(39)||'commitment'||char(39))>0) = 1
  THEN 1 ELSE 0 END
);
--> statement-breakpoint
DROP TABLE `__campaign_play_0060_schema_guard`;
