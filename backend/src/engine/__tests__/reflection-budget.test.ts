import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";

import { closeDb, connectDb, getDb, getSqliteConnection } from "../../db/index.js";
import { npcs } from "../../db/schema.js";

const CAMPAIGN_ID = "campaign-live";
const OTHER_CAMPAIGN_ID = "campaign-other";

let tempDir = "";
let dbPath = "";

function createSchema() {
  const sqlite = getSqliteConnection();
  sqlite.exec(`
    CREATE TABLE campaigns (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      premise TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE players (
      id TEXT PRIMARY KEY NOT NULL,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      race TEXT NOT NULL DEFAULT '',
      gender TEXT NOT NULL DEFAULT '',
      age TEXT NOT NULL DEFAULT '',
      appearance TEXT NOT NULL DEFAULT '',
      hp INTEGER NOT NULL DEFAULT 5,
      character_record TEXT NOT NULL DEFAULT '{}',
      derived_tags TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      equipped_items TEXT NOT NULL DEFAULT '[]',
      current_location_id TEXT,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );

    CREATE TABLE npcs (
      id TEXT PRIMARY KEY NOT NULL,
      campaign_id TEXT NOT NULL,
      name TEXT NOT NULL,
      persona TEXT NOT NULL,
      character_record TEXT NOT NULL DEFAULT '{}',
      derived_tags TEXT NOT NULL DEFAULT '[]',
      tags TEXT NOT NULL DEFAULT '[]',
      tier TEXT NOT NULL,
      current_location_id TEXT,
      goals TEXT NOT NULL DEFAULT '{"short_term":[],"long_term":[]}',
      beliefs TEXT NOT NULL DEFAULT '[]',
      unprocessed_importance INTEGER NOT NULL DEFAULT 0,
      inactive_ticks INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
    );
  `);
}

function seedCampaignRows() {
  const sqlite = getSqliteConnection();
  const now = Date.now();

  sqlite
    .prepare(
      "INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(CAMPAIGN_ID, "Live", "Premise", now, now);
  sqlite
    .prepare(
      "INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(OTHER_CAMPAIGN_ID, "Other", "Premise", now, now);

  sqlite
    .prepare(
      "INSERT INTO players (id, campaign_id, name) VALUES (?, ?, ?)",
    )
    .run("player-1", CAMPAIGN_ID, "Hero");

  sqlite
    .prepare(
      "INSERT INTO npcs (id, campaign_id, name, persona, tier, unprocessed_importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("npc-greta-live", CAMPAIGN_ID, "Greta", "Merchant", "key", 0, now);
  sqlite
    .prepare(
      "INSERT INTO npcs (id, campaign_id, name, persona, tier, unprocessed_importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("npc-boris-live", CAMPAIGN_ID, "Boris", "Guard", "key", 1, now);
  sqlite
    .prepare(
      "INSERT INTO npcs (id, campaign_id, name, persona, tier, unprocessed_importance, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("npc-greta-other", OTHER_CAMPAIGN_ID, "Greta", "Scholar", "key", 7, now);
}

describe("accumulateReflectionBudget", () => {
  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "wf-reflection-budget-"));
    dbPath = path.join(tempDir, "state.db");
    connectDb(dbPath);
    createSchema();
    seedCampaignRows();
  });

  afterEach(async () => {
    closeDb();
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("accumulates reflection budget for matched NPC participants once each within the campaign", async () => {
    const { accumulateReflectionBudget } = await import("../reflection-budget.js");

    await accumulateReflectionBudget(CAMPAIGN_ID, ["GRETA", "Greta", "boris", "Hero"], 4);

    const db = getDb();
    const greta = db
      .select({ unprocessedImportance: npcs.unprocessedImportance })
      .from(npcs)
      .where(eq(npcs.id, "npc-greta-live"))
      .get();
    const boris = db
      .select({ unprocessedImportance: npcs.unprocessedImportance })
      .from(npcs)
      .where(eq(npcs.id, "npc-boris-live"))
      .get();
    const otherCampaignGreta = db
      .select({ unprocessedImportance: npcs.unprocessedImportance })
      .from(npcs)
      .where(eq(npcs.id, "npc-greta-other"))
      .get();

    expect(greta?.unprocessedImportance).toBe(4);
    expect(boris?.unprocessedImportance).toBe(5);
    expect(otherCampaignGreta?.unprocessedImportance).toBe(7);
  });

  it("ignores unmatched participants and leaves reflection budget untouched when no NPC matches", async () => {
    const { accumulateReflectionBudget } = await import("../reflection-budget.js");

    await accumulateReflectionBudget(CAMPAIGN_ID, ["Hero", "Unknown Stranger"], 6);

    const db = getDb();
    const greta = db
      .select({ unprocessedImportance: npcs.unprocessedImportance })
      .from(npcs)
      .where(eq(npcs.id, "npc-greta-live"))
      .get();
    const boris = db
      .select({ unprocessedImportance: npcs.unprocessedImportance })
      .from(npcs)
      .where(eq(npcs.id, "npc-boris-live"))
      .get();

    expect(greta?.unprocessedImportance).toBe(0);
    expect(boris?.unprocessedImportance).toBe(1);
  });
});
