ALTER TABLE `campaign_play_turns`
  ADD `explicit_resume_consumed` integer DEFAULT false NOT NULL;
--> statement-breakpoint

UPDATE `campaign_play_turns`
SET `explicit_resume_consumed` = 1
WHERE EXISTS (
  SELECT 1
  FROM `campaign_play_model_stages` AS `model`
  WHERE `model`.`campaign_id` = `campaign_play_turns`.`campaign_id`
    AND `model`.`turn_id` = `campaign_play_turns`.`id`
    AND `model`.`attempt` > 3
);
