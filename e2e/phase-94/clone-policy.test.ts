import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { applyCleanStartClonePolicy } from "./clone-policy.js";

const SOURCE_CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";

let tempRoot: string | null = null;

afterEach(async () => {
  if (tempRoot) {
    await rm(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  }
});

function createStateDb(targetDir: string): void {
  const db = new Database(join(targetDir, "state.db"));
  try {
    db.exec(`
      CREATE TABLE campaigns (id TEXT PRIMARY KEY, updated_at INTEGER);
      CREATE TABLE players (id TEXT PRIMARY KEY, campaign_id TEXT, name TEXT, character_record TEXT);
      CREATE TABLE location_recent_events (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE chronicle (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE simulation_jobs (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE simulation_proposals (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE actor_process_states (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE actor_wake_signals (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE authority_traces (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE turn_sagas (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE turn_saga_events (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE oracle_decisions (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE settled_turn_packets (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE turn_durable_events (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE quick_action_offers (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
      CREATE TABLE narrator_attempts (id TEXT PRIMARY KEY, campaign_id TEXT, payload_json TEXT);
    `);
    db.prepare("INSERT INTO campaigns (id, updated_at) VALUES (?, ?)").run(SOURCE_CAMPAIGN_ID, 1);
    db.prepare("INSERT INTO players (id, campaign_id, name, character_record) VALUES (?, ?, ?, ?)")
      .run("player-1", SOURCE_CAMPAIGN_ID, "Vera", JSON.stringify({ campaignId: SOURCE_CAMPAIGN_ID }));
    for (const table of [
      "location_recent_events",
      "chronicle",
      "simulation_jobs",
      "simulation_proposals",
      "actor_process_states",
      "actor_wake_signals",
      "authority_traces",
      "turn_sagas",
      "turn_saga_events",
      "oracle_decisions",
      "settled_turn_packets",
      "turn_durable_events",
      "quick_action_offers",
      "narrator_attempts",
    ]) {
      db.prepare(`INSERT INTO ${table} (id, campaign_id, payload_json) VALUES (?, ?, ?)`)
        .run(`${table}-1`, SOURCE_CAMPAIGN_ID, `{"campaignId":"${SOURCE_CAMPAIGN_ID}"}`);
    }
  } finally {
    db.close();
  }
}

describe("Phase 94 clean-start clone policy", () => {
  it("rewrites clone-owned campaign ids and purges runtime turn tails", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "wf-clone-policy-"));
    const targetDir = join(tempRoot, TARGET_CAMPAIGN_ID);
    mkdirSync(join(targetDir, "checkpoints"), { recursive: true });
    mkdirSync(join(targetDir, ".turn-boundaries"), { recursive: true });
    mkdirSync(join(targetDir, "vectors"), { recursive: true });
    writeFileSync(join(targetDir, "config.json"), JSON.stringify({
      id: SOURCE_CAMPAIGN_ID,
      name: "Source campaign",
      nested: { campaignId: SOURCE_CAMPAIGN_ID },
    }));
    writeFileSync(join(targetDir, "chat_history.json"), JSON.stringify([{ role: "assistant", content: "stale" }]));
    createStateDb(targetDir);

    const manifest = applyCleanStartClonePolicy({
      targetDir,
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      routeId: "typed-movement",
    });

    expect(manifest).toMatchObject({
      version: 1,
      kind: "clean-start",
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      routeId: "typed-movement",
    });
    expect(manifest.droppedDirs).toEqual(["checkpoints", ".turn-boundaries", "vectors"]);
    expect([...manifest.clearedRuntimeTables].sort()).toEqual([
      "actor_process_states",
      "actor_wake_signals",
      "authority_traces",
      "chronicle",
      "location_recent_events",
      "narrator_attempts",
      "oracle_decisions",
      "quick_action_offers",
      "settled_turn_packets",
      "simulation_jobs",
      "simulation_proposals",
      "turn_durable_events",
      "turn_saga_events",
      "turn_sagas",
    ].sort());
    expect(manifest.scrubbedTextColumns).toEqual(["players.character_record"]);
    expect(existsSync(join(targetDir, "checkpoints"))).toBe(false);
    expect(existsSync(join(targetDir, ".turn-boundaries"))).toBe(false);
    expect(existsSync(join(targetDir, "vectors"))).toBe(false);
    expect(JSON.parse(readFileSync(join(targetDir, "config.json"), "utf-8"))).toEqual({
      id: TARGET_CAMPAIGN_ID,
      name: "Source campaign",
      nested: { campaignId: TARGET_CAMPAIGN_ID },
    });
    expect(JSON.parse(readFileSync(join(targetDir, "chat_history.json"), "utf-8"))).toEqual([]);
    expect(JSON.parse(readFileSync(join(targetDir, "clone_policy.json"), "utf-8"))).toEqual(manifest);

    const db = new Database(join(targetDir, "state.db"));
    try {
      expect(db.prepare("SELECT id FROM campaigns").get()).toEqual({ id: TARGET_CAMPAIGN_ID });
      expect(db.prepare("SELECT campaign_id FROM players").get()).toEqual({ campaign_id: TARGET_CAMPAIGN_ID });
      expect(db.prepare("SELECT character_record FROM players").get()).toEqual({
        character_record: JSON.stringify({ campaignId: TARGET_CAMPAIGN_ID }),
      });
      for (const table of manifest.clearedRuntimeTables) {
        expect(db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get()).toEqual({ count: 0 });
      }
    } finally {
      db.close();
    }
  });

  it("fails closed when a preserved text blob keeps the source campaign id outside JSON structure", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "wf-clone-policy-"));
    const targetDir = join(tempRoot, TARGET_CAMPAIGN_ID);
    mkdirSync(targetDir, { recursive: true });
    const db = new Database(join(targetDir, "state.db"));
    try {
      db.exec(`
        CREATE TABLE campaigns (id TEXT PRIMARY KEY, updated_at INTEGER);
        CREATE TABLE players (id TEXT PRIMARY KEY, campaign_id TEXT, name TEXT, character_record TEXT);
      `);
      db.prepare("INSERT INTO campaigns (id, updated_at) VALUES (?, ?)").run(SOURCE_CAMPAIGN_ID, 1);
      db.prepare("INSERT INTO players (id, campaign_id, name, character_record) VALUES (?, ?, ?, ?)")
        .run("player-1", SOURCE_CAMPAIGN_ID, "Vera", `raw:${SOURCE_CAMPAIGN_ID}`);
    } finally {
      db.close();
    }

    expect(() => applyCleanStartClonePolicy({
      targetDir,
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      routeId: "typed-movement",
    })).toThrow("unresolved source campaign id references");
  });

  it("fails closed when config.json keeps a non-target campaign identity", async () => {
    tempRoot = await mkdtemp(join(tmpdir(), "wf-clone-policy-"));
    const targetDir = join(tempRoot, TARGET_CAMPAIGN_ID);
    mkdirSync(targetDir, { recursive: true });
    writeFileSync(join(targetDir, "config.json"), JSON.stringify({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Wrong identity",
    }));
    createStateDb(targetDir);

    expect(() => applyCleanStartClonePolicy({
      targetDir,
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      routeId: "typed-movement",
    })).toThrow("config identity mismatch");
  });
});
