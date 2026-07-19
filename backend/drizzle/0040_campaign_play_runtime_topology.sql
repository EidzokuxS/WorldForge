ALTER TABLE `locations` ADD `definition_authority` text NOT NULL DEFAULT 'accepted_world';--> statement-breakpoint
ALTER TABLE `locations` ADD `causal_receipt_id` text;--> statement-breakpoint
ALTER TABLE `locations` ADD `world_version` integer;--> statement-breakpoint
ALTER TABLE `location_edges` ADD `definition_authority` text NOT NULL DEFAULT 'accepted_world';--> statement-breakpoint
ALTER TABLE `location_edges` ADD `causal_receipt_id` text;--> statement-breakpoint
ALTER TABLE `location_edges` ADD `world_version` integer;--> statement-breakpoint
CREATE INDEX `idx_locations_campaign_definition_authority` ON `locations` (`campaign_id`,`definition_authority`);--> statement-breakpoint
CREATE INDEX `idx_locations_campaign_receipt` ON `locations` (`campaign_id`,`causal_receipt_id`);--> statement-breakpoint
CREATE INDEX `idx_location_edges_campaign_definition_authority` ON `location_edges` (`campaign_id`,`definition_authority`);--> statement-breakpoint
CREATE INDEX `idx_location_edges_campaign_receipt` ON `location_edges` (`campaign_id`,`causal_receipt_id`);--> statement-breakpoint

CREATE TRIGGER locations_definition_authority_insert_guard BEFORE INSERT ON locations
BEGIN
  SELECT CASE WHEN NEW.definition_authority NOT IN ('accepted_world', 'campaign_play')
    THEN RAISE(ABORT, 'location_definition_authority_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'accepted_world' AND (
    NEW.causal_receipt_id IS NOT NULL OR NEW.world_version IS NOT NULL
  ) THEN RAISE(ABORT, 'accepted_location_provenance_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'campaign_play' AND (
    NEW.kind <> 'persistent_sublocation'
    OR NEW.persistence <> 'persistent'
    OR NEW.parent_location_id IS NULL
    OR NEW.anchor_location_id IS NULL
    OR NEW.causal_receipt_id IS NULL
    OR NEW.world_version IS NULL
    OR NEW.is_starting <> 0
    OR NEW.tags <> '[]'
    OR NEW.connected_to <> '[]'
  ) THEN RAISE(ABORT, 'campaign_play_runtime_location_shape_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'campaign_play' AND NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts receipt
    JOIN campaign_play_commands command
      ON command.command_id = receipt.command_id
      AND command.campaign_id = receipt.campaign_id
    JOIN locations anchor
      ON anchor.id = NEW.anchor_location_id
      AND anchor.campaign_id = NEW.campaign_id
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'move_actor'
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.result_world_version = NEW.world_version
      AND command.command_kind = 'move_actor'
      AND command.protected_payload_json = receipt.protected_payload_json
      AND command.expected_world_version = receipt.prior_world_version
      AND json_extract(receipt.protected_payload_json, '$.kind') = 'move_actor'
      AND json_extract(receipt.protected_payload_json, '$.fromLocationId') = NEW.anchor_location_id
      AND json_extract(receipt.protected_payload_json, '$.toLocationId') = NEW.id
      AND json_extract(receipt.protected_payload_json, '$.routeId') = json_extract(
        receipt.protected_payload_json, '$.materializedLocalScene.outboundRouteId'
      )
      AND json_extract(receipt.protected_payload_json, '$.materializedLocalScene.locationId') = NEW.id
      AND json_extract(receipt.protected_payload_json, '$.materializedLocalScene.anchorLocationId') = NEW.anchor_location_id
      AND json_extract(receipt.protected_payload_json, '$.materializedLocalScene.name') = NEW.name
      AND json_extract(receipt.protected_payload_json, '$.materializedLocalScene.description') = NEW.description
      AND NEW.parent_location_id = anchor.parent_location_id
      AND anchor.kind = 'persistent_sublocation'
  ) THEN RAISE(ABORT, 'campaign_play_runtime_location_receipt_invalid') END;
END;--> statement-breakpoint

CREATE TRIGGER location_edges_definition_authority_insert_guard BEFORE INSERT ON location_edges
BEGIN
  SELECT CASE WHEN NEW.definition_authority NOT IN ('accepted_world', 'campaign_play')
    THEN RAISE(ABORT, 'location_edge_definition_authority_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'accepted_world' AND (
    NEW.causal_receipt_id IS NOT NULL OR NEW.world_version IS NOT NULL
  ) THEN RAISE(ABORT, 'accepted_location_edge_provenance_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'campaign_play' AND (
    NEW.causal_receipt_id IS NULL
    OR NEW.world_version IS NULL
    OR NEW.discovered <> 1
  ) THEN RAISE(ABORT, 'campaign_play_runtime_route_shape_invalid') END;
  SELECT CASE WHEN NEW.definition_authority = 'campaign_play' AND NOT EXISTS (
    SELECT 1
    FROM campaign_play_receipts receipt
    JOIN campaign_play_commands command
      ON command.command_id = receipt.command_id
      AND command.campaign_id = receipt.campaign_id
    JOIN locations scene
      ON scene.id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.locationId')
      AND scene.campaign_id = NEW.campaign_id
      AND scene.definition_authority = 'campaign_play'
      AND scene.causal_receipt_id = receipt.receipt_id
      AND scene.world_version = receipt.result_world_version
    WHERE receipt.receipt_id = NEW.causal_receipt_id
      AND receipt.campaign_id = NEW.campaign_id
      AND receipt.command_kind = 'move_actor'
      AND receipt.outcome = 'applied'
      AND receipt.applied_world_mutation = 1
      AND receipt.result_world_version = NEW.world_version
      AND command.command_kind = 'move_actor'
      AND command.protected_payload_json = receipt.protected_payload_json
      AND command.expected_world_version = receipt.prior_world_version
      AND json_extract(receipt.protected_payload_json, '$.kind') = 'move_actor'
      AND (
        (
          NEW.id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.outboundRouteId')
          AND NEW.from_location_id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.anchorLocationId')
          AND NEW.to_location_id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.locationId')
          AND NEW.id = json_extract(receipt.protected_payload_json, '$.routeId')
        ) OR (
          NEW.id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.returnRouteId')
          AND NEW.from_location_id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.locationId')
          AND NEW.to_location_id = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.anchorLocationId')
        )
      )
      AND NEW.travel_cost = json_extract(receipt.protected_payload_json, '$.materializedLocalScene.travelCost')
  ) THEN RAISE(ABORT, 'campaign_play_runtime_route_receipt_invalid') END;
END;--> statement-breakpoint

CREATE TRIGGER locations_campaign_play_runtime_update_immutable BEFORE UPDATE ON locations
WHEN OLD.definition_authority = 'campaign_play'
BEGIN SELECT RAISE(ABORT, 'campaign_play_runtime_location_immutable'); END;--> statement-breakpoint
CREATE TRIGGER locations_campaign_play_runtime_delete_immutable BEFORE DELETE ON locations
WHEN OLD.definition_authority = 'campaign_play'
BEGIN SELECT RAISE(ABORT, 'campaign_play_runtime_location_immutable'); END;--> statement-breakpoint
CREATE TRIGGER location_edges_campaign_play_runtime_update_immutable BEFORE UPDATE ON location_edges
WHEN OLD.definition_authority = 'campaign_play'
BEGIN SELECT RAISE(ABORT, 'campaign_play_runtime_route_immutable'); END;--> statement-breakpoint
CREATE TRIGGER location_edges_campaign_play_runtime_delete_immutable BEFORE DELETE ON location_edges
WHEN OLD.definition_authority = 'campaign_play'
BEGIN SELECT RAISE(ABORT, 'campaign_play_runtime_route_immutable'); END;
