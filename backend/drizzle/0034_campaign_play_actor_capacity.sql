DROP TRIGGER campaign_play_actor_schedules_update_guard;--> statement-breakpoint
CREATE TRIGGER campaign_play_actor_schedules_update_guard BEFORE UPDATE ON campaign_play_actor_schedules
BEGIN
  SELECT CASE WHEN NEW.schedule_id <> OLD.schedule_id OR NEW.campaign_id <> OLD.campaign_id
    OR NEW.actor_id <> OLD.actor_id OR NEW.created_at <> OLD.created_at
    OR NEW.updated_at <= OLD.updated_at
    OR (OLD.last_act_at_world_time_minutes IS NOT NULL AND (
      NEW.last_act_at_world_time_minutes IS NULL
      OR NEW.last_act_at_world_time_minutes < OLD.last_act_at_world_time_minutes
    ))
    OR (NEW.last_act_at_world_time_minutes IS NOT NULL
      AND NEW.last_act_at_world_time_minutes > NEW.next_act_at_world_time_minutes)
    THEN RAISE(ABORT, 'campaign_play_actor_schedule_transition_invalid') END;
  SELECT CASE WHEN NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_plans
    WHERE plan_id = NEW.plan_id AND campaign_id = NEW.campaign_id
      AND actor_id = NEW.actor_id AND status = 'active'
  ) AND NOT EXISTS (
    SELECT 1 FROM campaign_play_actor_jobs job
    WHERE job.campaign_id = NEW.campaign_id AND job.actor_id = NEW.actor_id
      AND job.plan_id = NEW.plan_id AND job.stage = 'deferred'
      AND (
        job.defer_reason = 'replan_capacity'
        OR (job.defer_reason = 'actor_capacity' AND job.due_reason = 'plan_retry')
      )
      AND job.completed_at = NEW.updated_at
      AND NEW.plan_id = OLD.plan_id
      AND NEW.agency_debt = MIN(100, OLD.agency_debt + 1)
      AND NEW.next_act_at_world_time_minutes > OLD.next_act_at_world_time_minutes
  ) THEN RAISE(ABORT, 'campaign_play_actor_schedule_plan_invalid') END;
END;
