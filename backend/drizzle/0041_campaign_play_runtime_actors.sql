ALTER TABLE `actors` ADD `definition_authority` text NOT NULL DEFAULT 'accepted_world';--> statement-breakpoint
ALTER TABLE `actors` ADD `causal_receipt_id` text;--> statement-breakpoint
ALTER TABLE `actors` ADD `world_version` integer;--> statement-breakpoint
CREATE INDEX `idx_actors_campaign_definition_authority` ON `actors` (`campaign_id`,`definition_authority`);--> statement-breakpoint
CREATE INDEX `idx_actors_campaign_receipt` ON `actors` (`campaign_id`,`causal_receipt_id`);--> statement-breakpoint

CREATE TRIGGER actors_definition_authority_insert_guard BEFORE INSERT ON actors
BEGIN
  SELECT CASE WHEN NEW.definition_authority NOT IN ('accepted_world', 'campaign_play')
    THEN RAISE(ABORT, 'actor_definition_authority_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'accepted_world' AND (
    NEW.causal_receipt_id IS NOT NULL OR NEW.world_version IS NOT NULL
  ) THEN RAISE(ABORT, 'accepted_actor_provenance_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'campaign_play' AND (
    NEW.kind <> 'person'
    OR NEW.controller <> 'agent'
    OR NEW.role <> 'support'
    OR NEW.causal_receipt_id IS NULL
    OR NEW.world_version IS NULL
  ) THEN RAISE(ABORT, 'campaign_play_runtime_actor_shape_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'campaign_play' AND NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts receipt
    JOIN campaign_play_commands command
      ON command.command_id = receipt.command_id
      AND command.campaign_id = receipt.campaign_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'materialize_support_actor'
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.result_world_version = NEW.world_version
      AND command.command_kind = 'materialize_support_actor'
      AND command.protected_payload_json = receipt.protected_payload_json
      AND command.expected_world_version = receipt.prior_world_version
      AND json_extract(receipt.protected_payload_json, '$.kind') = 'materialize_support_actor'
      AND json_extract(receipt.protected_payload_json, '$.actorId') = NEW.id
      AND json_extract(receipt.protected_payload_json, '$.name') = NEW.name
      AND json_extract(receipt.protected_payload_json, '$.summary') = NEW.summary
  ) THEN RAISE(ABORT, 'campaign_play_runtime_actor_receipt_invalid') END;
END;--> statement-breakpoint

CREATE TRIGGER actors_campaign_play_runtime_identity_immutable
BEFORE UPDATE OF kind, controller, role, name, summary, traits, tags,
  definition_authority, causal_receipt_id, world_version ON actors
WHEN OLD.definition_authority = 'campaign_play'
BEGIN SELECT RAISE(ABORT, 'campaign_play_runtime_actor_identity_immutable'); END;
