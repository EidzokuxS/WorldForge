import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { PHASE95_SQLITE_STORE_TABLES } from "../../engine/gameplay-control-plane-contract.js";
import {
  CAMPAIGN_CLONE_MANIFEST_FILENAME,
  cloneCampaignCleanStart,
  executeCampaignFilesystemClonePlan,
} from "../clone.js";
import { planCampaignStoreManifestOperation } from "../store-manifest-executor.js";

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
        keyedByCampaign: { [SOURCE_CAMPAIGN_ID]: { marker: SOURCE_CAMPAIGN_ID } },
        generationComplete: true,
        currentTick: 3,
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
  db.prepare(
    "INSERT INTO locations (id, campaign_id, name, description, tags, connected_to) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    "loc-source-2",
    SOURCE_CAMPAIGN_ID,
    "Source Dock",
    `Second location ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    "[]",
  );
  db.prepare(
    "INSERT INTO location_edges (id, campaign_id, from_location_id, to_location_id, travel_cost) VALUES (?, ?, ?, ?, ?)",
  ).run("edge-source", SOURCE_CAMPAIGN_ID, "loc-source", "loc-source-2", 1);
  db.prepare(
    `INSERT INTO location_recent_events (
      id, campaign_id, location_id, event_type, summary, hidden_cause_terms, tick, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "event-source",
    SOURCE_CAMPAIGN_ID,
    "loc-source",
    "rumor",
    `Event summary ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    1,
    NOW - 1000,
  );
  db.prepare(
    "INSERT INTO players (id, campaign_id, name, character_record, tags, current_location_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    "player-source",
    SOURCE_CAMPAIGN_ID,
    "Hero",
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID, nested: { value: SOURCE_CAMPAIGN_ID } }),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    "loc-source",
  );
  db.prepare(
    `INSERT INTO npcs (
      id, campaign_id, name, persona, character_record, tags, tier, current_location_id, goals,
      beliefs, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "npc-source",
    SOURCE_CAMPAIGN_ID,
    "Guard",
    `Persona ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    "persistent",
    "loc-source",
    JSON.stringify({ short_term: [SOURCE_CAMPAIGN_ID], long_term: [] }),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    NOW - 1000,
  );
  db.prepare(
    "INSERT INTO items (id, campaign_id, name, tags, owner_id, location_id) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    "item-source",
    SOURCE_CAMPAIGN_ID,
    "Lantern",
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    "player-source",
    "loc-source",
  );
  db.prepare(
    "INSERT INTO factions (id, campaign_id, name, tags, goals, assets) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    "faction-source",
    SOURCE_CAMPAIGN_ID,
    "Harbor Guild",
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
  );
  db.prepare(
    `INSERT INTO faction_command_nodes (
      id, campaign_id, faction_id, label, standing_orders, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "command-source",
    SOURCE_CAMPAIGN_ID,
    "faction-source",
    `Command ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO faction_resources (
      id, campaign_id, faction_id, resource_key, label, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "resource-source",
    SOURCE_CAMPAIGN_ID,
    "faction-source",
    "coin",
    `Resource ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO faction_reports (
      id, campaign_id, faction_id, command_node_id, route, summary, source_event_ids,
      source_knowledge_ids, hidden_cause_terms, base_world_version, created_world_time_minutes,
      deliver_at_world_time_minutes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "report-source",
    SOURCE_CAMPAIGN_ID,
    "faction-source",
    "command-source",
    "direct_observation",
    `Report ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    1,
    1,
    2,
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO faction_operations (
      id, campaign_id, faction_id, command_node_id, operation_kind, summary, required_report_ids,
      resource_costs, base_world_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "operation-source",
    SOURCE_CAMPAIGN_ID,
    "faction-source",
    "command-source",
    "patrol",
    `Operation ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify(["report-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify({ coin: 1, campaign: SOURCE_CAMPAIGN_ID }),
    1,
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO faction_resource_ledger (
      id, campaign_id, faction_id, operation_id, resource_key, delta, reason, base_world_version,
      created_world_time_minutes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "ledger-source",
    SOURCE_CAMPAIGN_ID,
    "faction-source",
    "operation-source",
    "coin",
    -1,
    `Ledger ${SOURCE_CAMPAIGN_ID}`,
    1,
    1,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO world_threads (
      id, campaign_id, name, stage, hidden_cause_terms, involved_actor_ids, involved_faction_ids,
      source_event_ids, source_authority_trace_ids, base_world_version, last_advanced_world_version,
      created_world_time_minutes, updated_world_time_minutes, metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "thread-source",
    SOURCE_CAMPAIGN_ID,
    "Dock Pressure",
    `Stage ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify(["npc-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify(["faction-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify(["event-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    1,
    1,
    1,
    1,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO world_thread_events (
      id, campaign_id, thread_id, event_type, summary, source_event_ids, source_authority_trace_ids,
      world_version, world_time_minutes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "thread-event-source",
    SOURCE_CAMPAIGN_ID,
    "thread-source",
    "signal",
    `Thread event ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify(["event-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    1,
    1,
    NOW - 1000,
  );
  db.prepare(
    "INSERT INTO relationships (id, campaign_id, entity_a, entity_b, tags, reason) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(
    "relationship-source",
    SOURCE_CAMPAIGN_ID,
    "player-source",
    "npc-source",
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    `Reason ${SOURCE_CAMPAIGN_ID}`,
  );
  db.prepare(
    "INSERT INTO chronicle (id, campaign_id, tick, text, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run("chronicle-source", SOURCE_CAMPAIGN_ID, 1, `Chronicle ${SOURCE_CAMPAIGN_ID}`, NOW - 1000);
  db.prepare(
    "INSERT INTO world_clocks (campaign_id, world_version, world_time_minutes, current_tick, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(SOURCE_CAMPAIGN_ID, 3, 30, 3, NOW - 1000);
  db.prepare(
    `INSERT INTO turn_clock_ledger (
      clock_receipt_id, campaign_id, turn_id, ui_turn_ordinal, base_world_version,
      result_world_version, delta_minutes, reason_kind, source_receipt_ref,
      result_world_time_minutes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "clock-source",
    SOURCE_CAMPAIGN_ID,
    "turn-source",
    1,
    1,
    2,
    1,
    "wait",
    `receipt-${SOURCE_CAMPAIGN_ID}`,
    31,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO simulation_jobs (
      id, campaign_id, job_type, base_world_version, scheduled_world_time_minutes,
      created_world_time_minutes, source_entity_type, source_entity_id, payload, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "job-source",
    SOURCE_CAMPAIGN_ID,
    `job-${SOURCE_CAMPAIGN_ID}`,
    1,
    1,
    1,
    "npc",
    "npc-source",
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO simulation_proposals (
      id, campaign_id, job_id, proposal_type, idempotency_key, base_world_version,
      source_entity_type, source_entity_id, payload, created_world_time_minutes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "proposal-source",
    SOURCE_CAMPAIGN_ID,
    "job-source",
    `proposal-${SOURCE_CAMPAIGN_ID}`,
    `proposal-key-${SOURCE_CAMPAIGN_ID}`,
    1,
    "npc",
    "npc-source",
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    1,
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO actor_process_states (
      id, campaign_id, actor_type, actor_id, process_state, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "actor-process-source",
    SOURCE_CAMPAIGN_ID,
    "npc",
    "npc-source",
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO actor_wake_signals (
      id, campaign_id, actor_type, actor_id, signal_type, source_type, source_id, summary,
      payload, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "wake-source",
    SOURCE_CAMPAIGN_ID,
    "npc",
    "npc-source",
    "direct_observation",
    "event",
    "event-source",
    `Wake ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO actor_knowledge_records (
      id, campaign_id, actor_id, route, statement, subject_refs, source_event_ids,
      source_knowledge_ids, authority_trace_ids, source_actor_id, recipient_actor_ids,
      base_world_version, valid_from_world_version, created_world_time_minutes,
      metadata, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "knowledge-source",
    SOURCE_CAMPAIGN_ID,
    "npc-source",
    "claim",
    `Knowledge ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify(["event-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    "npc-source",
    JSON.stringify(["player-source", SOURCE_CAMPAIGN_ID]),
    1,
    1,
    1,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO authority_traces (
      id, campaign_id, operation, source_entity_type, source_entity_id, base_world_version,
      result_world_version, world_time_minutes, event_ids, state_delta_refs, witnesses,
      metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "trace-source",
    SOURCE_CAMPAIGN_ID,
    `operation-${SOURCE_CAMPAIGN_ID}`,
    "npc",
    "npc-source",
    1,
    2,
    30,
    JSON.stringify(["event-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO turn_sagas (
      id, campaign_id, turn_id, action_text, source_action_json, status_updated_at,
      base_world_version, provenance_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "saga-source",
    SOURCE_CAMPAIGN_ID,
    "turn-source",
    `Action ${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    1,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO turn_saga_events (
      id, campaign_id, saga_id, turn_id, event_type, idempotency_key, payload_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "saga-event-source",
    SOURCE_CAMPAIGN_ID,
    "saga-source",
    "turn-source",
    "authority_stage_committed",
    `saga-event-${SOURCE_CAMPAIGN_ID}`,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO oracle_decisions (
      id, campaign_id, saga_id, turn_id, question, stakes, outcome, reasoning,
      base_world_version, source_refs, decision_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "oracle-source",
    SOURCE_CAMPAIGN_ID,
    "saga-source",
    "turn-source",
    `Question ${SOURCE_CAMPAIGN_ID}`,
    `Stakes ${SOURCE_CAMPAIGN_ID}`,
    `Outcome ${SOURCE_CAMPAIGN_ID}`,
    `Reasoning ${SOURCE_CAMPAIGN_ID}`,
    1,
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO settled_turn_packets (
      id, campaign_id, saga_id, turn_id, oracle_decision_id, canonical_turn_packet_json,
      narrator_packet_json, source_refs, accepted_tool_result_refs, accepted_actor_result_refs,
      accepted_durable_event_ids, produced_durable_event_ids, due_world_refs,
      base_world_version, result_world_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "packet-source",
    SOURCE_CAMPAIGN_ID,
    "saga-source",
    "turn-source",
    "oracle-source",
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    JSON.stringify(["event-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify(["event-source", SOURCE_CAMPAIGN_ID]),
    JSON.stringify([SOURCE_CAMPAIGN_ID]),
    1,
    2,
    NOW - 1000,
    NOW - 1000,
  );
  db.prepare(
    `INSERT INTO narrator_attempts (
      id, campaign_id, saga_id, settled_turn_packet_id, turn_id, attempt_index,
      grounding_result_json, final_text, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "narrator-source",
    SOURCE_CAMPAIGN_ID,
    "saga-source",
    "packet-source",
    "turn-source",
    0,
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    `Final ${SOURCE_CAMPAIGN_ID}`,
    NOW - 1000,
    NOW - 1000,
  );
  db.exec(`
    CREATE TABLE IF NOT EXISTS gameplay_cycle_v2_packets (
      packet_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      status TEXT NOT NULL,
      narrator_attempt_status TEXT NOT NULL,
      packet_json TEXT NOT NULL,
      persistence_json TEXT NOT NULL,
      checklist_json TEXT,
      gm_read_json TEXT,
      receipt_ledger_json TEXT,
      narrator_view_json TEXT,
      api_projection_json TEXT,
      base_world_version INTEGER NOT NULL,
      result_world_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);
  db.prepare(
    `INSERT INTO gameplay_cycle_v2_packets (
      packet_id, campaign_id, turn_id, status, narrator_attempt_status, packet_json,
      persistence_json, checklist_json, gm_read_json, receipt_ledger_json,
      narrator_view_json, api_projection_json, base_world_version, result_world_version,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    "v2packet-source",
    SOURCE_CAMPAIGN_ID,
    "v2turn-source",
    "finalized",
    "succeeded_projected",
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    JSON.stringify({ campaign: SOURCE_CAMPAIGN_ID }),
    1,
    2,
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
    expect(result.mode).toBe("clean_start");
    expect(result.rewrittenTables).toContain("campaigns");
    expect(result.rewrittenTables).toContain("locations");
    expect(result.purgedTables).toContain("quick_action_offers");
    expect(result.purgedTables).toContain("turn_sagas");
    expect(result.purgedTables).toContain("turn_clock_ledger");
    expect(result.purgedTables).toContain("authority_traces");
    expect(result.purgedTables).toContain("gameplay_cycle_v2_packets");
    expect(result.purgedTables).toContain("simulation_jobs");
    expect(result.scrubbedTextColumns).toContain("locations.description");
    expect(result.filesystemActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ store: "json:chat_history", action: "purge" }),
        expect.objectContaining({ store: "vectors:episodic_events", action: "rebuild" }),
        expect.objectContaining({ store: "artifact:checkpoints", action: "reject" }),
      ]),
    );

    const targetConfig = JSON.parse(
      fs.readFileSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), "config.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(targetConfig).toMatchObject({
      id: TARGET_CAMPAIGN_ID,
      name: "Source Campaign [route-a]",
      premise: `Premise names ${TARGET_CAMPAIGN_ID}`,
      createdAt: NOW,
      updatedAt: NOW,
      currentTick: 0,
    });
    expect(JSON.stringify(targetConfig)).not.toContain(SOURCE_CAMPAIGN_ID);
    expect(targetConfig.keyedByCampaign).toHaveProperty(TARGET_CAMPAIGN_ID);
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
      expect(db.prepare("SELECT campaign_id, world_version, world_time_minutes, current_tick FROM world_clocks").get())
        .toEqual({
          campaign_id: TARGET_CAMPAIGN_ID,
          world_version: 0,
          world_time_minutes: 0,
          current_tick: 0,
        });
      expect(db.prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger").get())
        .toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM authority_traces").get())
        .toEqual({ count: 0 });
      expect(db.prepare("SELECT COUNT(*) AS count FROM gameplay_cycle_v2_packets").get())
        .toEqual({ count: 0 });
      expect(db.pragma("foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }

    expect(findSourceResidue(path.join(campaignDir(TARGET_CAMPAIGN_ID), "state.db"))).toEqual([]);
    expect(JSON.stringify(targetConfig)).not.toContain(SOURCE_CAMPAIGN_ID);
    const cloneManifest = JSON.parse(
      fs.readFileSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), CAMPAIGN_CLONE_MANIFEST_FILENAME), "utf-8"),
    ) as Record<string, unknown>;
    expect(cloneManifest).toMatchObject({
      schemaVersion: 1,
      mode: "clean_start",
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      clonedAt: NOW,
    });
    expect(cloneManifest).toHaveProperty("plan.steps");
    expect(cloneManifest).toHaveProperty("filesystemActions");
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

  it("rejects replay-preserving clone semantics before creating a target", async () => {
    await expect(cloneCampaignCleanStart({
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      mode: "replay_preserving",
      now: NOW,
    })).rejects.toThrow(/Replay-preserving clone is not supported/i);

    expect(fs.existsSync(campaignDir(TARGET_CAMPAIGN_ID))).toBe(false);
  });

  it("fails closed when a non-SQL manifest clone policy is unsupported", () => {
    const plan = planCampaignStoreManifestOperation({ mode: "clean_start_clone" });
    const mutatedPlan = {
      ...plan,
      steps: plan.steps.map((step) => (
        step.store === "json:chat_history"
          ? { ...step, action: "rewrite" as const }
          : step
      )),
    };

    expect(() => executeCampaignFilesystemClonePlan({
      targetDir: campaignDir(SOURCE_CAMPAIGN_ID),
      plan: mutatedPlan,
      configAlreadyRewritten: true,
    })).toThrow(/Unsupported clean-start clone action rewrite for json:chat_history/i);
  });
});
