import { z } from "zod";
import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";
import { rulebookBatchCommandSchema } from "./contracts.js";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";

const RECENT_OWN_ACTION_LIMIT = 12;
const RECENT_PROPOSAL_SCAN_LIMIT = 24;

export interface CampaignPlayActorContinuityBinding {
  actorHandle: string;
  actorId: string;
}

export const campaignPlayActorContinuitySchema = z.object({
  actorHandle: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.handle),
  recentOwnActions: z.array(z.object({
    summary: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.text),
    observableTrace: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.text).nullable(),
  }).strict()).min(1).max(RECENT_OWN_ACTION_LIMIT),
}).strict();

export type CampaignPlayActorOwnAction = z.infer<
  typeof campaignPlayActorContinuitySchema
>["recentOwnActions"][number];
export type CampaignPlayActorContinuity = z.infer<
  typeof campaignPlayActorContinuitySchema
>;

interface StoredActorProposalRow {
  commandsJson: string;
}

function ownActionsFromRows(
  rows: StoredActorProposalRow[],
  actorId: string,
  maximumWorldVersion: number,
): CampaignPlayActorOwnAction[] {
  const newestFirst = rows.flatMap((row) => {
    const commands = rulebookBatchCommandSchema.array().parse(
      JSON.parse(row.commandsJson) as unknown,
    );
    return commands.flatMap((command) => {
      if (
        command.kind !== "record_world_event"
        || command.source.kind !== "actor"
        || command.source.actorId !== actorId
        || command.expectedWorldVersion > maximumWorldVersion
      ) {
        return [];
      }
      return [{
        summary: command.summary,
        observableTrace: command.observableTrace,
      }];
    });
  }).slice(0, RECENT_OWN_ACTION_LIMIT);
  return newestFirst.reverse();
}

export function loadCampaignPlayActorContinuity(
  handle: CampaignPlayDatabaseHandle,
  bindings: CampaignPlayActorContinuityBinding[],
  maximumWorldVersion: number,
): CampaignPlayActorContinuity[] {
  const uniqueBindings = new Map<string, CampaignPlayActorContinuityBinding>();
  for (const binding of bindings) {
    if (!uniqueBindings.has(binding.actorHandle)) {
      uniqueBindings.set(binding.actorHandle, binding);
    }
  }

  const loadRows = handle.sqlite.prepare(`SELECT p.commands_json AS commandsJson
    FROM campaign_play_actor_jobs j
    JOIN campaign_play_actor_proposals p ON p.job_id = j.job_id
    WHERE j.campaign_id = ? AND j.actor_id = ?
      AND j.stage = 'settled' AND p.status = 'accepted'
    ORDER BY j.completed_at DESC, j.job_id DESC
    LIMIT ?`);

  return campaignPlayActorContinuitySchema.array().parse([...uniqueBindings.values()]
    .sort((left, right) => left.actorHandle.localeCompare(right.actorHandle))
    .flatMap((binding) => {
      const recentOwnActions = ownActionsFromRows(
        loadRows.all(
          handle.campaignId,
          binding.actorId,
          RECENT_PROPOSAL_SCAN_LIMIT,
        ) as StoredActorProposalRow[],
        binding.actorId,
        maximumWorldVersion,
      );
      return recentOwnActions.length === 0
        ? []
        : [{ actorHandle: binding.actorHandle, recentOwnActions }];
    }));
}
