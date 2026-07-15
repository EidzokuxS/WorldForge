import { z } from "zod";
import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";

const RECENT_OWN_ACTION_LIMIT = 12;
const RECENT_EVENT_SCAN_LIMIT = 24;

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

interface StoredActorEventRow {
  payloadJson: string;
}

const actorEventPayloadSchema = z.object({
  summary: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.text),
  observableTrace: z.string().min(1).max(CAMPAIGN_PLAY_LIMITS.text).nullable(),
}).passthrough();

function ownActionsFromRows(
  rows: StoredActorEventRow[],
): CampaignPlayActorOwnAction[] {
  const newestFirst = rows.map((row) => {
    const payload = actorEventPayloadSchema.parse(JSON.parse(row.payloadJson) as unknown);
    return {
      summary: payload.summary,
      observableTrace: payload.observableTrace,
    };
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

  const loadRows = handle.sqlite.prepare(`SELECT c.protected_payload_json AS payloadJson
    FROM campaign_play_commands c
    JOIN campaign_play_receipts r
      ON r.command_id = c.command_id AND r.campaign_id = c.campaign_id
    WHERE c.campaign_id = ? AND c.command_kind = 'record_world_event'
      AND r.outcome = 'applied' AND r.result_world_version <= ?
      AND (
        json_extract(c.protected_payload_json, '$.performingActorId') = ?
        OR (
          json_extract(c.source_json, '$.kind') = 'actor'
          AND json_extract(c.source_json, '$.actorId') = ?
        )
      )
    ORDER BY r.created_at DESC, c.command_id DESC
    LIMIT ?`);

  return campaignPlayActorContinuitySchema.array().parse([...uniqueBindings.values()]
    .sort((left, right) => left.actorHandle.localeCompare(right.actorHandle))
    .flatMap((binding) => {
      const recentOwnActions = ownActionsFromRows(
        loadRows.all(
          handle.campaignId,
          maximumWorldVersion,
          binding.actorId,
          binding.actorId,
          RECENT_EVENT_SCAN_LIMIT,
        ) as StoredActorEventRow[],
      );
      return recentOwnActions.length === 0
        ? []
        : [{ actorHandle: binding.actorHandle, recentOwnActions }];
    }));
}
