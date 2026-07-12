import crypto from "node:crypto";
import type { CampaignPlayNarratorPacket } from "@worldforge/shared";

import type { CampaignPlayDatabaseHandle } from "../../backend/src/campaign-play/campaign-play-database.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPublicHandle,
  hashCampaignPlayProjection,
} from "../../backend/src/campaign-play/campaign-play-projection.js";
import { createCampaignPlayStateRepository } from "../../backend/src/campaign-play/campaign-play-state-repository.js";

const CAMPAIGN_PLAY_REPORT_TABLES = {
  runtimeEvents: "campaign_play_runtime_events",
  turns: "campaign_play_turns",
  turnResults: "campaign_play_turn_results",
  turnEvents: "campaign_play_turn_events",
  modelStages: "campaign_play_model_stages",
  narrations: "campaign_play_narrations",
  commands: "campaign_play_commands",
  receipts: "campaign_play_receipts",
  worldEvents: "campaign_play_events",
  exposures: "campaign_play_event_exposures",
  routeStates: "campaign_play_route_states",
  actorConditions: "campaign_play_actor_conditions",
  pressureStates: "campaign_play_pressure_states",
  plans: "campaign_play_actor_plans",
  schedules: "campaign_play_actor_schedules",
  dueSets: "campaign_play_actor_due_sets",
  jobs: "campaign_play_actor_jobs",
  proposals: "campaign_play_actor_proposals",
  knowledge: "campaign_play_actor_knowledge",
  observations: "campaign_play_observations",
} as const;

function tableRows(
  handle: CampaignPlayDatabaseHandle,
  tableName: (typeof CAMPAIGN_PLAY_REPORT_TABLES)[keyof typeof CAMPAIGN_PLAY_REPORT_TABLES],
): Array<Record<string, unknown>> {
  return handle.sqlite.prepare(
    `SELECT * FROM "${tableName}" WHERE campaign_id = ? ORDER BY rowid`,
  ).all(handle.campaignId) as Array<Record<string, unknown>>;
}

export function findUnboundCampaignPlayPublicHandles(
  handle: CampaignPlayDatabaseHandle,
): string[] {
  const narration = handle.sqlite.prepare(`SELECT packet_json AS packetJson
    FROM campaign_play_narrations WHERE campaign_id = ? AND status = 'complete'
    ORDER BY created_at DESC, narration_id DESC LIMIT 1`).get(handle.campaignId) as
    | { packetJson: string }
    | undefined;
  if (!narration) return [];
  const packet = JSON.parse(narration.packetJson) as CampaignPlayNarratorPacket;
  const candidates = new Set<string>();
  const addRows = (tableName: string, idColumn: string, publicKind: string) => {
    const rows = handle.sqlite.prepare(
      `SELECT "${idColumn}" AS id FROM "${tableName}" WHERE campaign_id = ? ORDER BY "${idColumn}"`,
    ).all(handle.campaignId) as Array<{ id: string }>;
    rows.forEach((row) => candidates.add(
      deriveCampaignPlayPublicHandle(publicKind, handle.campaignId, row.id),
    ));
  };
  addRows("actors", "id", "actor");
  addRows("locations", "id", "location");
  addRows("location_edges", "id", "route");
  addRows("world_pressures", "id", "pressure");
  const observations = handle.sqlite.prepare(`SELECT public_entry_json AS publicEntryJson
    FROM campaign_play_observations WHERE campaign_id = ? ORDER BY observation_id`).all(
      handle.campaignId,
    ) as Array<{ publicEntryJson: string }>;
  observations.forEach((row) => {
    const publicEntry = JSON.parse(row.publicEntryJson) as { observationHandle: string };
    candidates.add(publicEntry.observationHandle);
  });
  const handles = [
    packet.currentLocation.handle,
    ...packet.visibleActors.map((actor) => actor.handle),
    ...packet.visibleRoutes.flatMap((route) => [route.handle, route.destinationHandle]),
    ...packet.visiblePressures.map((pressure) => pressure.handle),
    ...packet.newObservations.map((observation) => observation.observationHandle),
    ...packet.continuity.map((observation) => observation.observationHandle),
  ];
  return [...new Set(handles.filter((handleValue) => !candidates.has(handleValue)))];
}

export function captureCampaignPlayReplay(handle: CampaignPlayDatabaseHandle) {
  const state = createCampaignPlayStateRepository(handle).loadState();
  if (!state) throw new Error("Campaign Play evidence requires initialized play state.");
  const accepted = handle.sqlite.prepare(`
    SELECT accepted_snapshot_json AS acceptedSnapshotJson,
      accepted_content_hash AS acceptedContentHash
    FROM campaign_worlds WHERE campaign_id = ?
  `).get(handle.campaignId) as {
    acceptedSnapshotJson: string;
    acceptedContentHash: string;
  };
  const integrityRow = handle.sqlite.prepare("PRAGMA integrity_check").get() as Record<string, string>;
  const integrity = Object.values(integrityRow)[0] ?? "missing";
  const foreignKeys = handle.sqlite.prepare("PRAGMA foreign_key_check").all();
  const tables = Object.fromEntries(
    Object.entries(CAMPAIGN_PLAY_REPORT_TABLES).map(([key, tableName]) => [
      key,
      tableRows(handle, tableName),
    ]),
  ) as {
    [Key in keyof typeof CAMPAIGN_PLAY_REPORT_TABLES]: Array<Record<string, unknown>>;
  };
  const report = {
    campaignId: handle.campaignId,
    acceptedSnapshotJson: accepted.acceptedSnapshotJson,
    acceptedSnapshotHash: crypto.createHash("sha256").update(accepted.acceptedSnapshotJson).digest("hex"),
    acceptedContentHash: accepted.acceptedContentHash,
    authority: state.authority,
    eligibility: state.eligibility,
    mechanical: state.mechanical,
    runtime: state.runtime,
    protectedAudit: state.protectedAudit,
    publicState: state.publicState,
    tables,
    integrity,
    foreignKeyViolations: foreignKeys.length,
    donorCalls: 0,
  };
  return {
    report,
    canonicalBytes: canonicalizeCampaignPlayProjection(report),
    replayHash: hashCampaignPlayProjection(report),
    unboundObservationHandles: findUnboundCampaignPlayPublicHandles(handle),
  };
}

export type CampaignPlayCanonicalReport = ReturnType<typeof captureCampaignPlayReplay>["report"];
export type CampaignPlayReplayCapture = ReturnType<typeof captureCampaignPlayReplay>;
