import type Database from "better-sqlite3";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import {
  CampaignWorldDatabaseError,
  openCampaignWorldDatabase,
} from "../campaign-world/world-database.js";

const REQUIRED_CAMPAIGN_PLAY_TABLES = [
  "campaign_play_states",
  "campaign_play_characters",
  "campaign_play_runtime_events",
  "campaign_play_turns",
  "campaign_play_turn_results",
  "campaign_play_turn_events",
  "campaign_play_model_stages",
  "campaign_play_narrations",
  "campaign_play_commands",
  "campaign_play_receipts",
  "campaign_play_events",
  "campaign_play_event_exposures",
  "campaign_play_route_states",
  "campaign_play_actor_conditions",
  "campaign_play_pressure_states",
  "campaign_play_actor_plans",
  "campaign_play_actor_schedules",
  "campaign_play_actor_due_sets",
  "campaign_play_actor_jobs",
  "campaign_play_actor_proposals",
  "campaign_play_actor_knowledge",
  "campaign_play_observations",
] as const;

export type CampaignPlayDatabaseErrorCode =
  | "campaign_database_unavailable"
  | "campaign_schema_outdated"
  | "campaign_record_missing"
  | "campaign_world_not_accepted";

export class CampaignPlayDatabaseError extends Error {
  constructor(
    readonly code: CampaignPlayDatabaseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignPlayDatabaseError";
  }
}

export interface CampaignPlayDatabaseHandle {
  campaignId: string;
  databasePath: string;
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  close(): void;
}

function translateCampaignWorldDatabaseError(
  error: CampaignWorldDatabaseError,
): CampaignPlayDatabaseError {
  return new CampaignPlayDatabaseError(error.code, error.message, {
    cause: error,
  });
}

export function openCampaignPlayDatabase(
  campaignId: string,
): CampaignPlayDatabaseHandle {
  let handle: CampaignPlayDatabaseHandle;
  try {
    handle = openCampaignWorldDatabase(campaignId);
  } catch (error) {
    if (error instanceof CampaignWorldDatabaseError) {
      throw translateCampaignWorldDatabaseError(error);
    }
    throw error;
  }

  try {
    const tableRows = handle.sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tableRows.map((row) => row.name));
    const missingTables = REQUIRED_CAMPAIGN_PLAY_TABLES.filter(
      (tableName) => !tableNames.has(tableName),
    );
    if (missingTables.length > 0) {
      throw new CampaignPlayDatabaseError(
        "campaign_schema_outdated",
        `Campaign state database is missing required Campaign Play tables: ${missingTables.join(", ")}.`,
      );
    }

    const acceptedWorld = handle.sqlite.prepare(`
      SELECT status, accepted_world_version AS acceptedWorldVersion,
        accepted_content_hash AS acceptedContentHash
      FROM campaign_worlds
      WHERE campaign_id = ?
    `).get(campaignId) as {
      status: string;
      acceptedWorldVersion: number | null;
      acceptedContentHash: string | null;
    } | undefined;
    if (
      acceptedWorld?.status !== "accepted" ||
      acceptedWorld.acceptedWorldVersion === null ||
      acceptedWorld.acceptedContentHash === null
    ) {
      throw new CampaignPlayDatabaseError(
        "campaign_world_not_accepted",
        "Campaign Play requires an accepted Campaign World.",
      );
    }

    return handle;
  } catch (error) {
    handle.close();
    if (error instanceof CampaignPlayDatabaseError) {
      throw error;
    }
    throw new CampaignPlayDatabaseError(
      "campaign_schema_outdated",
      "Campaign Play storage could not be verified.",
      { cause: error },
    );
  }
}
