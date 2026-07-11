CREATE UNIQUE INDEX `actor_placements_actor_present_unique` ON `actor_placements` (`actor_id`) WHERE "actor_placements"."placement_kind" = 'present';--> statement-breakpoint
CREATE UNIQUE INDEX `actors_campaign_human_unique` ON `actors` (`campaign_id`) WHERE "actors"."controller" = 'human';--> statement-breakpoint
CREATE TRIGGER `actors_controller_kind_role_insert`
BEFORE INSERT ON `actors`
FOR EACH ROW
WHEN NOT (
  (
    NEW.`controller` = 'human'
    AND NEW.`kind` = 'person'
    AND NEW.`role` = 'player'
  ) OR (
    NEW.`controller` = 'agent'
    AND NEW.`kind` IN ('person', 'collective')
    AND NEW.`role` IN ('key', 'support', 'background')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'actors_controller_kind_role_inconsistent');
END;--> statement-breakpoint
CREATE TRIGGER `actors_controller_kind_role_update`
BEFORE UPDATE OF `controller`, `kind`, `role` ON `actors`
FOR EACH ROW
WHEN NOT (
  (
    NEW.`controller` = 'human'
    AND NEW.`kind` = 'person'
    AND NEW.`role` = 'player'
  ) OR (
    NEW.`controller` = 'agent'
    AND NEW.`kind` IN ('person', 'collective')
    AND NEW.`role` IN ('key', 'support', 'background')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'actors_controller_kind_role_inconsistent');
END;
