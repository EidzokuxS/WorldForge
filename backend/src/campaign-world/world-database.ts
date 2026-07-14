import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import { runForeignKeySafeMigrations } from "../db/migrate.js";
import { getCampaignDir } from "../campaign/index.js";

const CAMPAIGN_MIGRATIONS_FOLDER = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

const REQUIRED_CAMPAIGN_WORLD_TABLES = [
  "campaign_worlds",
  "campaign_world_builds",
  "campaign_world_build_events",
  "campaign_world_build_stages",
  "actors",
  "actor_goals",
  "actor_relations",
  "actor_placements",
  "world_pressures",
  "world_pressure_actors",
  "world_pressure_locations",
] as const;

export type CampaignWorldDatabaseErrorCode =
  | "campaign_database_unavailable"
  | "campaign_schema_outdated"
  | "campaign_record_missing";

export class CampaignWorldDatabaseError extends Error {
  constructor(
    readonly code: CampaignWorldDatabaseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "CampaignWorldDatabaseError";
  }
}

export interface CampaignWorldDatabaseHandle {
  campaignId: string;
  databasePath: string;
  sqlite: Database.Database;
  db: BetterSQLite3Database<typeof schema>;
  close(): void;
}

export function openCampaignWorldDatabase(
  campaignId: string,
): CampaignWorldDatabaseHandle {
  const databasePath = path.join(getCampaignDir(campaignId), "state.db");
  let sqlite: Database.Database;
  try {
    sqlite = new Database(databasePath, { fileMustExist: true });
  } catch (error) {
    throw new CampaignWorldDatabaseError(
      "campaign_database_unavailable",
      "Campaign state database is unavailable.",
      { cause: error },
    );
  }

  try {
    sqlite.pragma("journal_mode = WAL");
    sqlite.pragma("foreign_keys = ON");
    sqlite.pragma("busy_timeout = 5000");

    const db = drizzle(sqlite, { schema });
    const managedSchema = sqlite.prepare(`SELECT 1 AS found FROM sqlite_master
      WHERE type = 'table' AND name = '__drizzle_migrations'`).get() as {
        found: number;
    } | undefined;
    if (managedSchema) {
      runForeignKeySafeMigrations(db, sqlite, CAMPAIGN_MIGRATIONS_FOLDER);
    }

    const tableRows = sqlite
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all() as Array<{ name: string }>;
    const tableNames = new Set(tableRows.map((row) => row.name));
    const missingTables = REQUIRED_CAMPAIGN_WORLD_TABLES.filter(
      (tableName) => !tableNames.has(tableName),
    );
    if (missingTables.length > 0) {
      throw new CampaignWorldDatabaseError(
        "campaign_schema_outdated",
        `Campaign state database is missing required tables: ${missingTables.join(", ")}.`,
      );
    }

    const campaign = sqlite
      .prepare("SELECT id FROM campaigns WHERE id = ?")
      .get(campaignId) as { id: string } | undefined;
    if (!campaign) {
      throw new CampaignWorldDatabaseError(
        "campaign_record_missing",
        "Campaign state database has no matching campaign record.",
      );
    }

    let closed = false;
    return {
      campaignId,
      databasePath,
      sqlite,
      db,
      close() {
        if (closed) return;
        closed = true;
        sqlite.close();
      },
    };
  } catch (error) {
    sqlite.close();
    if (error instanceof CampaignWorldDatabaseError) {
      throw error;
    }
    throw new CampaignWorldDatabaseError(
      "campaign_schema_outdated",
      "Campaign state database could not be verified.",
      { cause: error },
    );
  }
}
