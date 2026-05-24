import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { PHASE95_SQLITE_STORE_TABLES } from "../../engine/gameplay-control-plane-contract.js";
import { cloneCampaignCleanStart } from "../clone.js";

const SOURCE_CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const NOW = 1_779_609_000_000;

let tempRoot = "";
let previousCampaignsRoot: string | undefined;

function campaignDir(campaignId: string): string {
  return path.join(tempRoot, campaignId);
}

function seedSourceCampaign(options: { writeConfig?: boolean } = {}): void {
  const writeConfig = options.writeConfig ?? true;
  const dir = campaignDir(SOURCE_CAMPAIGN_ID);
  fs.mkdirSync(path.join(dir, "vectors", "episodic_events.lance"), { recursive: true });
  fs.mkdirSync(path.join(dir, "vectors", "lore_cards.lance"), { recursive: true });
  fs.mkdirSync(path.join(dir, "checkpoints", "old-checkpoint"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".turn-boundaries", "old-turn"), { recursive: true });
  fs.mkdirSync(path.join(dir, "images"), { recursive: true });
  fs.writeFileSync(path.join(dir, "vectors", "episodic_events.lance", "data"), SOURCE_CAMPAIGN_ID, "utf-8");
  fs.writeFileSync(path.join(dir, "vectors", "lore_cards.lance", "data"), SOURCE_CAMPAIGN_ID, "utf-8");

  if (writeConfig) {
    fs.writeFileSync(
      path.join(dir, "config.json"),
      JSON.stringify({
        id: SOURCE_CAMPAIGN_ID,
        name: "Source Campaign",
        premise: `Premise names ${SOURCE_CAMPAIGN_ID}`,
        nested: { sourceCampaignId: SOURCE_CAMPAIGN_ID },
        generationComplete: true,
        createdAt: NOW - 1000,
        updatedAt: NOW - 1000,
      }),
      "utf-8",
    );
  }
  fs.writeFileSync(
    path.join(dir, "chat_history.json"),
    JSON.stringify([{ role: "assistant", content: SOURCE_CAMPAIGN_ID }]),
    "utf-8",
  );

  connectDb(path.join(dir, "state.db"));
  runMigrations();
  const db = getSqliteConnection();
  db.prepare(
    "INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(SOURCE_CAMPAIGN_ID, "Source Campaign", `Premise ${SOURCE_CAMPAIGN_ID}`, NOW - 1000, NOW - 1000);
  db.prepare(
    "INSERT INTO locations (id, campaign_id, name, description, tags, connected_to) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    "loc-source",
    SOURCE_CAMPAIGN_ID,
    "Source Plaza",
    `Description contains ${SOURCE_CAMPAIGN_ID}`,
    "[]",
    "[]",
  );
  db.prepare(
    `INSERT INTO quick_action_offers (
      id, campaign_id, offer_id, action_id, capability, label, action, source_refs_json,
      source_evidence_digest, base_world_version, world_time_minutes, created_tick,
      expires_at_tick, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "offer-row",
    SOURCE_CAMPAIGN_ID,
    "offer-1",
    "action-1",
    "cap-source",
    "Ask",
    "Ask",
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    "digest",
    0,
    0,
    0,
    1,
    NOW - 1000,
    NOW - 1000,
  );
  closeDb();
}

function textColumns(db: Database.Database, tableName: string): string[] {
  return (db.prepare(`PRAGMA table_info("${tableName}")`).all() as Array<{ name: string; type: string }>)
    .filter((column) => column.type.toLocaleUpperCase("en-US").includes("TEXT"))
    .map((column) => column.name);
}

function findSourceResidue(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const residue: string[] = [];
    for (const tableName of PHASE95_SQLITE_STORE_TABLES) {
      for (const columnName of textColumns(db, tableName)) {
        const row = db
          .prepare(`SELECT 1 AS found FROM "${tableName}" WHERE "${columnName}" LIKE ? LIMIT 1`)
          .get(`%${SOURCE_CAMPAIGN_ID}%`) as { found?: number } | undefined;
        if (row?.found) residue.push(`${tableName}.${columnName}`);
      }
    }
    return residue;
  } finally {
    db.close();
  }
}

describe("clean-start campaign clone", () => {
  beforeEach(() => {
    previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wf-clean-clone-"));
    process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
    seedSourceCampaign();
  });

  afterEach(() => {
    closeDb();
    if (previousCampaignsRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("applies the manifest clean-start clone plan to SQLite, JSON, vectors, and rejected artifacts", async () => {
    const result = await cloneCampaignCleanStart({
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      nameSuffix: "[route-a]",
      now: NOW,
    });

    expect(result.plan.steps.find((step) => step.store === "vectors:episodic_events"))
      .toMatchObject({ action: "rebuild" });
    expect(result.plan.steps.find((step) => step.store === "sqlite:quick_action_offers"))
      .toMatchObject({ action: "purge" });
    expect(result.rewrittenTables).toContain("campaigns");
    expect(result.rewrittenTables).toContain("locations");
    expect(result.purgedTables).toContain("quick_action_offers");
    expect(result.scrubbedTextColumns).toContain("locations.description");

    const targetConfig = JSON.parse(
      fs.readFileSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "config.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(targetConfig).toMatchObject({
      id: TARGET_CAMPAIGN_ID,
      name: "Source Campaign [route-a]",
      premise: `Premise names ${TARGET_CAMPAIGN_ID}`,
      createdAt: NOW,
      updatedAt: NOW,
    });
    expect(JSON.stringify(targetConfig)).not.toContain(SOURCE_CAMPAIGN_ID);
    expect(fs.readFileSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "chat_history.json"), "utf-8").trim())
      .toBe("[]");
    expect(fs.existsSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "vectors"))).toBe(true);
    expect(fs.existsSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "vectors", "episodic_events.lance"))).toBe(false);
    expect(fs.existsSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "vectors", "lore_cards.lance"))).toBe(false);
    expect(fs.existsSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "checkpoints"))).toBe(false);
    expect(fs.existsSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), ".turn-boundaries"))).toBe(false);
    expect(fs.existsSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "images"))).toBe(false);

    const db = new Database(path.join(campaignDir(TARGET_CAMPAIGN_ID), "state.db"), {
      readonly: true,
      fileMustExist: true,
    });
    try {
      expect(db.prepare("SELECT id, name, created_at, updated_at FROM campaigns").get())
        .toEqual({
          id: TARGET_CAMPAIGN_ID,
          name: "Source Campaign [route-a]",
          created_at: NOW,
          updated_at: NOW,
        });
      expect(db.prepare("SELECT campaign_id, description FROM locations WHERE id = 'loc-source'").get())
        .toEqual({
          campaign_id: TARGET_CAMPAIGN_ID,
          description: `Description contains ${TARGET_CAMPAIGN_ID}`,
        });
      expect(db.prepare("SELECT COUNT(*) AS count FROM quick_action_offers").get())
        .toEqual({ count: 0 });
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }

    expect(findSourceResidue(path.join(campaignDir(TARGET_CAMPAIGN_ID), "state.db"))).toEqual([]);
    expect(JSON.stringify(targetConfig)).not.toContain(SOURCE_CAMPAIGN_ID);
  });

  it("removes a partial clone directory when clone execution fails", async () => {
    fs.writeFileSync(path.join(campaignDir(SOURCE_CAMPAIGN_ID), "config.json"), "{", "utf-8");

    await expect(cloneCampaignCleanStart({
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      now: NOW,
    })).rejects.toThrow();

    expect(fs.existsSync(campaignDir(TARGET_CAMPAIGN_ID))).toBe(false);
  });
});
