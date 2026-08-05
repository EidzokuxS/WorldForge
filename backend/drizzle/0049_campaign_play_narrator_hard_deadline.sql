ALTER TABLE `campaign_play_narration_operations`
  ADD `automatic_deadline_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `campaign_play_narration_operations`
  ADD `active_deadline_at` integer NOT NULL DEFAULT 0;--> statement-breakpoint
UPDATE `campaign_play_narration_operations`
SET `automatic_deadline_at` = MIN(
      `created_at` + 90000,
      COALESCE(
        (SELECT `submitted_at` + 115000
         FROM `campaign_play_turns`
         WHERE `campaign_play_turns`.`id` = `campaign_play_narration_operations`.`turn_id`
           AND `campaign_play_turns`.`campaign_id` = `campaign_play_narration_operations`.`campaign_id`),
        `created_at` + 90000
      )
    ),
    `active_deadline_at` = MIN(
      `created_at` + 90000,
      COALESCE(
        (SELECT `submitted_at` + 115000
         FROM `campaign_play_turns`
         WHERE `campaign_play_turns`.`id` = `campaign_play_narration_operations`.`turn_id`
           AND `campaign_play_turns`.`campaign_id` = `campaign_play_narration_operations`.`campaign_id`),
        `created_at` + 90000
      )
    )
WHERE `automatic_deadline_at` = 0 OR `active_deadline_at` = 0;--> statement-breakpoint
CREATE INDEX `idx_campaign_play_narration_operations_active_deadline`
  ON `campaign_play_narration_operations` (`campaign_id`, `status`, `active_deadline_at`);
