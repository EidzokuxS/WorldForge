PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_campaign_worlds` (
	`campaign_id` text PRIMARY KEY NOT NULL,
	`status` text NOT NULL,
	`world_version` integer NOT NULL,
	`content_hash` text NOT NULL,
	`source_digest` text NOT NULL,
	`source_snapshot_json` text NOT NULL,
	`world_summary` text NOT NULL,
	`built_at` integer NOT NULL,
	`accepted_at` integer,
	`accepted_snapshot_json` text,
	`accepted_world_version` integer,
	`accepted_content_hash` text,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "campaign_worlds_version_positive" CHECK("__new_campaign_worlds"."world_version" >= 1),
	CONSTRAINT "campaign_worlds_acceptance_consistent" CHECK((
        "__new_campaign_worlds"."status" = 'review'
        AND "__new_campaign_worlds"."accepted_at" IS NULL
        AND "__new_campaign_worlds"."accepted_snapshot_json" IS NULL
        AND "__new_campaign_worlds"."accepted_world_version" IS NULL
        AND "__new_campaign_worlds"."accepted_content_hash" IS NULL
      ) OR (
        "__new_campaign_worlds"."status" = 'accepted'
        AND "__new_campaign_worlds"."accepted_at" IS NOT NULL
        AND "__new_campaign_worlds"."accepted_snapshot_json" IS NOT NULL
        AND length("__new_campaign_worlds"."accepted_snapshot_json") > 0
        AND "__new_campaign_worlds"."accepted_world_version" = "__new_campaign_worlds"."world_version"
        AND "__new_campaign_worlds"."accepted_world_version" >= 1
        AND "__new_campaign_worlds"."accepted_content_hash" = "__new_campaign_worlds"."content_hash"
        AND length("__new_campaign_worlds"."accepted_content_hash") = 64
      ))
);
--> statement-breakpoint
INSERT INTO `__new_campaign_worlds`(
	"campaign_id", "status", "world_version", "content_hash",
	"source_digest", "source_snapshot_json", "world_summary", "built_at",
	"accepted_at", "accepted_snapshot_json", "accepted_world_version", "accepted_content_hash"
)
SELECT
	cw.`campaign_id`, cw.`status`, cw.`world_version`, cw.`content_hash`,
	cw.`source_digest`, cw.`source_snapshot_json`, cw.`world_summary`, cw.`built_at`,
	cw.`accepted_at`,
	CASE WHEN cw.`status` = 'accepted' THEN
		'{' ||
		'"acceptedAt":' || CAST(cw.`accepted_at` AS TEXT) || ',' ||
		'"actors":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"controller":' || json_quote(actor.`controller`) ||
					',"id":' || json_quote(actor.`id`) ||
					',"kind":' || json_quote(actor.`kind`) ||
					',"name":' || json_quote(actor.`name`) ||
					',"role":' || json_quote(actor.`role`) ||
					',"summary":' || json_quote(actor.`summary`) ||
					',"tags":' || json(actor.`tags`) ||
					',"traits":' || json(actor.`traits`) || '}' AS entry_json
				FROM `actors` actor
				WHERE actor.`campaign_id` = cw.`campaign_id`
				ORDER BY actor.`id`
			)
		), '') || '],' ||
		'"builtAt":' || CAST(cw.`built_at` AS TEXT) || ',' ||
		'"campaignId":' || json_quote(cw.`campaign_id`) || ',' ||
		'"contentHash":' || json_quote(cw.`content_hash`) || ',' ||
		'"goals":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"actorId":' || json_quote(goal.`actor_id`) ||
					',"horizon":' || json_quote(goal.`horizon`) ||
					',"id":' || json_quote(goal.`id`) ||
					',"motivation":' || json_quote(goal.`motivation`) ||
					',"objective":' || json_quote(goal.`objective`) ||
					',"priority":' || CAST(goal.`priority` AS TEXT) ||
					',"status":' || json_quote(goal.`status`) || '}' AS entry_json
				FROM `actor_goals` goal
				WHERE goal.`campaign_id` = cw.`campaign_id`
				ORDER BY goal.`id`
			)
		), '') || '],' ||
		'"locations":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"description":' || json_quote(location.`description`) ||
					',"id":' || json_quote(location.`id`) ||
					',"isStarting":' || CASE WHEN location.`is_starting` <> 0 THEN 'true' ELSE 'false' END ||
					',"kind":' || json_quote(location.`kind`) ||
					',"name":' || json_quote(location.`name`) ||
					',"parentLocationId":' || json_quote(location.`parent_location_id`) ||
					',"tags":' || json(location.`tags`) || '}' AS entry_json
				FROM `locations` location
				WHERE location.`campaign_id` = cw.`campaign_id`
				ORDER BY location.`id`
			)
		), '') || '],' ||
		'"placements":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"actorId":' || json_quote(placement.`actor_id`) ||
					',"id":' || json_quote(placement.`id`) ||
					',"locationId":' || json_quote(placement.`location_id`) ||
					',"placementKind":' || json_quote(placement.`placement_kind`) || '}' AS entry_json
				FROM `actor_placements` placement
				WHERE placement.`campaign_id` = cw.`campaign_id`
				ORDER BY placement.`id`
			)
		), '') || '],' ||
		'"pressures":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"actorIds":[' || COALESCE((
						SELECT group_concat(anchor_json, ',') FROM (
							SELECT json_quote(actor_anchor.`actor_id`) AS anchor_json
							FROM `world_pressure_actors` actor_anchor
							WHERE actor_anchor.`campaign_id` = cw.`campaign_id`
								AND actor_anchor.`pressure_id` = pressure.`id`
							ORDER BY actor_anchor.`actor_id`
						)
					), '') || ']' ||
					',"description":' || json_quote(pressure.`description`) ||
					',"id":' || json_quote(pressure.`id`) ||
					',"locationIds":[' || COALESCE((
						SELECT group_concat(anchor_json, ',') FROM (
							SELECT json_quote(location_anchor.`location_id`) AS anchor_json
							FROM `world_pressure_locations` location_anchor
							WHERE location_anchor.`campaign_id` = cw.`campaign_id`
								AND location_anchor.`pressure_id` = pressure.`id`
							ORDER BY location_anchor.`location_id`
						)
					), '') || ']' ||
					',"name":' || json_quote(pressure.`name`) ||
					',"trajectory":' || json_quote(pressure.`trajectory`) ||
					',"urgency":' || CAST(pressure.`urgency` AS TEXT) || '}' AS entry_json
				FROM `world_pressures` pressure
				WHERE pressure.`campaign_id` = cw.`campaign_id`
				ORDER BY pressure.`id`
			)
		), '') || '],' ||
		'"relations":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"id":' || json_quote(relation.`id`) ||
					',"intensity":' || CAST(relation.`intensity` AS TEXT) ||
					',"relationType":' || json_quote(relation.`relation_type`) ||
					',"sourceActorId":' || json_quote(relation.`source_actor_id`) ||
					',"summary":' || json_quote(relation.`summary`) ||
					',"targetActorId":' || json_quote(relation.`target_actor_id`) || '}' AS entry_json
				FROM `actor_relations` relation
				WHERE relation.`campaign_id` = cw.`campaign_id`
				ORDER BY relation.`id`
			)
		), '') || '],' ||
		'"routes":[' || COALESCE((
			SELECT group_concat(entry_json, ',') FROM (
				SELECT
					'{"fromLocationId":' || json_quote(route.`from_location_id`) ||
					',"id":' || json_quote(route.`id`) ||
					',"toLocationId":' || json_quote(route.`to_location_id`) ||
					',"travelCost":' || CAST(route.`travel_cost` AS TEXT) || '}' AS entry_json
				FROM `location_edges` route
				WHERE route.`campaign_id` = cw.`campaign_id`
				ORDER BY route.`id`
			)
		), '') || '],' ||
		'"source":{' ||
			'"dna":' || CASE
				WHEN json_type(cw.`source_snapshot_json`, '$.dna') = 'null' THEN 'null'
				ELSE
					'{"centralConflict":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.dna.centralConflict')) ||
					',"culturalFlavor":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.dna.culturalFlavor')) ||
					',"environment":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.dna.environment')) ||
					',"geography":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.dna.geography')) ||
					',"politicalStructure":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.dna.politicalStructure')) ||
					',"wildcard":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.dna.wildcard')) || '}'
			END ||
			',"premise":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.premise')) ||
			',"researchSummary":' || json_quote(json_extract(cw.`source_snapshot_json`, '$.researchSummary')) ||
			',"sourceReferences":[' || COALESCE((
				SELECT group_concat(entry_json, ',') FROM (
					SELECT
						'{"id":' || json_quote(json_extract(reference.value, '$.id')) ||
						',"label":' || json_quote(json_extract(reference.value, '$.label')) ||
						',"sourceType":' || json_quote(json_extract(reference.value, '$.sourceType')) || '}' AS entry_json
					FROM json_each(cw.`source_snapshot_json`, '$.sourceReferences') reference
					ORDER BY CAST(reference.key AS INTEGER)
				)
			), '') || ']},' ||
		'"sourceDigest":' || json_quote(cw.`source_digest`) || ',' ||
		'"status":"accepted",' ||
		'"version":' || CAST(cw.`world_version` AS TEXT) || ',' ||
		'"worldSummary":' || json_quote(cw.`world_summary`) ||
		'}'
	ELSE NULL END,
	CASE WHEN cw.`status` = 'accepted' THEN cw.`world_version` ELSE NULL END,
	CASE WHEN cw.`status` = 'accepted' THEN cw.`content_hash` ELSE NULL END
FROM `campaign_worlds` cw;--> statement-breakpoint
DROP TABLE `campaign_worlds`;--> statement-breakpoint
ALTER TABLE `__new_campaign_worlds` RENAME TO `campaign_worlds`;--> statement-breakpoint
CREATE TRIGGER `campaign_worlds_accepted_provenance_immutable`
BEFORE UPDATE OF `status`, `accepted_at`, `accepted_snapshot_json`, `accepted_world_version`, `accepted_content_hash`
ON `campaign_worlds`
WHEN OLD.`status` = 'accepted'
BEGIN
	SELECT RAISE(ABORT, 'Accepted Campaign World provenance is immutable.');
END;--> statement-breakpoint
PRAGMA foreign_keys=ON;
