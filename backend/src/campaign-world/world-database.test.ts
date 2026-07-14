import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/index.js";
import {
  CampaignWorldDatabaseError,
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "./world-database.js";
import {
  CAMPAIGN_A,
  CAMPAIGN_B,
  createMigratedCampaign,
} from "./world-repository.test-support.js";

let root = "";
let previousCampaignsRoot: string | undefined;
let handles: CampaignWorldDatabaseHandle[] = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-world-database-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  handles = [];
});

afterEach(() => {
  for (const handle of handles) handle.close();
  closeDb();
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

function open(campaignId: string): CampaignWorldDatabaseHandle {
  const handle = openCampaignWorldDatabase(campaignId);
  handles.push(handle);
  return handle;
}

describe("Campaign World database handle", () => {
  it("opens a migrated campaign with enforced connection settings", () => {
    createMigratedCampaign(root, CAMPAIGN_A);

    const handle = open(CAMPAIGN_A);

    expect(handle.campaignId).toBe(CAMPAIGN_A);
    expect(handle.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(handle.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(handle.sqlite.pragma("busy_timeout", { simple: true })).toBe(5_000);
    expect(handle.sqlite.prepare(
      "SELECT id FROM campaigns WHERE id = ?",
    ).get(CAMPAIGN_A)).toEqual({ id: CAMPAIGN_A });

    handle.close();
    handle.close();
  });

  it("keeps campaign A bound while the process-global connection switches to B", () => {
    createMigratedCampaign(root, CAMPAIGN_A);
    const campaignA = open(CAMPAIGN_A);

    createMigratedCampaign(root, CAMPAIGN_B);
    const campaignB = open(CAMPAIGN_B);

    expect(campaignA.sqlite.prepare(
      "SELECT id FROM campaigns WHERE id = ?",
    ).get(CAMPAIGN_A)).toEqual({ id: CAMPAIGN_A });
    expect(campaignA.sqlite.prepare(
      "SELECT id FROM campaigns WHERE id = ?",
    ).get(CAMPAIGN_B)).toBeUndefined();
    expect(campaignB.sqlite.prepare(
      "SELECT id FROM campaigns WHERE id = ?",
    ).get(CAMPAIGN_B)).toEqual({ id: CAMPAIGN_B });
  });

  it("enforces live player identity and unique present placement", () => {
    createMigratedCampaign(root, CAMPAIGN_A);
    const campaign = open(CAMPAIGN_A);
    const insertActor = campaign.sqlite.prepare(`
      INSERT INTO actors (
        id, campaign_id, kind, controller, role, name, summary
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const actor of [
      ["human-key", "person", "human", "key"],
      ["human-collective", "collective", "human", "player"],
      ["agent-player", "person", "agent", "player"],
      ["unknown-controller", "person", "remote", "key"],
      ["unknown-kind", "spirit", "agent", "key"],
      ["unknown-role", "person", "agent", "wanderer"],
    ] as const) {
      expect(() => insertActor.run(
        actor[0],
        CAMPAIGN_A,
        actor[1],
        actor[2],
        actor[3],
        actor[0],
        "Invalid actor fixture.",
      )).toThrow();
    }

    insertActor.run(
      "actor-player",
      CAMPAIGN_A,
      "person",
      "human",
      "player",
      "Player",
      "The human-controlled campaign actor.",
    );
    expect(() => insertActor.run(
      "actor-player-second",
      CAMPAIGN_A,
      "person",
      "human",
      "player",
      "Second Player",
      "A duplicate human actor.",
    )).toThrow();

    campaign.sqlite.prepare(`
      INSERT INTO campaigns (id, name, premise, created_at, updated_at)
      VALUES (?, 'Campaign B', 'Premise B', 1, 1)
    `).run(CAMPAIGN_B);
    insertActor.run(
      "actor-player-b",
      CAMPAIGN_B,
      "person",
      "human",
      "player",
      "Player B",
      "The other campaign human actor.",
    );
    insertActor.run(
      "actor-agent",
      CAMPAIGN_A,
      "person",
      "agent",
      "support",
      "Agent",
      "An agent-controlled person.",
    );
    expect(() => campaign.sqlite.prepare(`
      UPDATE actors SET role = 'key' WHERE id = 'actor-player'
    `).run()).toThrow();
    expect(() => campaign.sqlite.prepare(`
      UPDATE actors SET role = 'player' WHERE id = 'actor-agent'
    `).run()).toThrow();

    campaign.sqlite.prepare(`
      INSERT INTO locations (id, campaign_id, name, description)
      VALUES (?, ?, ?, ?)
    `).run("location-a", CAMPAIGN_A, "A", "First location.");
    campaign.sqlite.prepare(`
      INSERT INTO locations (id, campaign_id, name, description)
      VALUES (?, ?, ?, ?)
    `).run("location-b", CAMPAIGN_A, "B", "Second location.");
    const insertPlacement = campaign.sqlite.prepare(`
      INSERT INTO actor_placements (
        id, campaign_id, actor_id, location_id, placement_kind
      ) VALUES (?, ?, ?, ?, ?)
    `);
    insertPlacement.run(
      "placement-present",
      CAMPAIGN_A,
      "actor-agent",
      "location-a",
      "present",
    );
    insertPlacement.run(
      "placement-home",
      CAMPAIGN_A,
      "actor-agent",
      "location-b",
      "home",
    );
    expect(() => insertPlacement.run(
      "placement-present-second",
      CAMPAIGN_A,
      "actor-agent",
      "location-b",
      "present",
    )).toThrow();

    expect(campaign.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(campaign.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("enforces the 0032 person and placement trigger contract", () => {
    createMigratedCampaign(root, CAMPAIGN_A);
    const campaign = open(CAMPAIGN_A);
    const insertActor = campaign.sqlite.prepare(`
      INSERT INTO actors (id, campaign_id, kind, controller, role, name, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertPlacement = campaign.sqlite.prepare(`
      INSERT INTO actor_placements (id, campaign_id, actor_id, location_id, placement_kind)
      VALUES (?, ?, ?, ?, ?)
    `);

    insertActor.run("agent-person", CAMPAIGN_A, "person", "agent", "support", "Oren Tide", "A person fixture.");
    expect(() => insertActor.run(
      "agent-collective", CAMPAIGN_A, "collective", "agent", "support", "Harbor Council", "An invalid collective fixture.",
    )).toThrow("actors_controller_kind_role_inconsistent");
    campaign.sqlite.prepare(`
      INSERT INTO locations (id, campaign_id, name, description)
      VALUES ('location-0032', ?, 'Trigger Pier', 'A migration contract location.')
    `).run(CAMPAIGN_A);

    insertPlacement.run("placement-present-0032", CAMPAIGN_A, "agent-person", "location-0032", "present");
    insertPlacement.run("placement-home-0032", CAMPAIGN_A, "agent-person", "location-0032", "home");
    expect(() => insertPlacement.run(
      "placement-base-0032", CAMPAIGN_A, "agent-person", "location-0032", "base",
    )).toThrow("actor_placements_kind_invalid");
    expect(() => insertPlacement.run(
      "placement-influence-0032", CAMPAIGN_A, "agent-person", "location-0032", "influence",
    )).toThrow("actor_placements_kind_invalid");
  });

  it("reports an unavailable campaign database", () => {
    expect(() => openCampaignWorldDatabase(CAMPAIGN_A)).toThrowError(
      expect.objectContaining<Partial<CampaignWorldDatabaseError>>({
        code: "campaign_database_unavailable",
      }),
    );
  });

  it("reports a campaign database without Campaign World migrations", () => {
    const directory = path.join(root, CAMPAIGN_A);
    fs.mkdirSync(directory, { recursive: true });
    const sqlite = new Database(path.join(directory, "state.db"));
    sqlite.exec(`
      CREATE TABLE campaigns (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        premise TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    sqlite.prepare(`
      INSERT INTO campaigns (id, name, premise, created_at, updated_at)
      VALUES (?, 'Campaign', 'Premise', 1, 1)
    `).run(CAMPAIGN_A);
    sqlite.close();

    expect(() => openCampaignWorldDatabase(CAMPAIGN_A)).toThrowError(
      expect.objectContaining<Partial<CampaignWorldDatabaseError>>({
        code: "campaign_schema_outdated",
      }),
    );
  });

  it("requires the requested campaign record inside its database", () => {
    const databasePath = createMigratedCampaign(root, CAMPAIGN_A);
    const sqlite = new Database(databasePath);
    sqlite.pragma("foreign_keys = OFF");
    sqlite.prepare("DELETE FROM campaigns WHERE id = ?").run(CAMPAIGN_A);
    sqlite.close();

    expect(() => openCampaignWorldDatabase(CAMPAIGN_A)).toThrowError(
      expect.objectContaining<Partial<CampaignWorldDatabaseError>>({
        code: "campaign_record_missing",
      }),
    );
  });
});
