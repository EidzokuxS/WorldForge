DROP TRIGGER `actors_controller_kind_role_insert`;--> statement-breakpoint
DROP TRIGGER `actors_controller_kind_role_update`;--> statement-breakpoint
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
    AND NEW.`kind` = 'person'
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
    AND NEW.`kind` = 'person'
    AND NEW.`role` IN ('key', 'support', 'background')
  )
)
BEGIN
  SELECT RAISE(ABORT, 'actors_controller_kind_role_inconsistent');
END;--> statement-breakpoint
CREATE TRIGGER `actor_placements_kind_insert`
BEFORE INSERT ON `actor_placements`
FOR EACH ROW
WHEN NEW.`placement_kind` NOT IN ('present', 'home')
BEGIN
  SELECT RAISE(ABORT, 'actor_placements_kind_invalid');
END;--> statement-breakpoint
CREATE TRIGGER `actor_placements_kind_update`
BEFORE UPDATE OF `placement_kind` ON `actor_placements`
FOR EACH ROW
WHEN NEW.`placement_kind` NOT IN ('present', 'home')
BEGIN
  SELECT RAISE(ABORT, 'actor_placements_kind_invalid');
END;
