import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import type { CampaignWorldReview } from "@worldforge/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { openCampaignWorldDatabase } from "../../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../../campaign-world/world-repository.js";
import { serializeAcceptedCampaignWorldReview } from "../../campaign-world/world-snapshot.js";
import { calculateCampaignWorldSourceDigest } from "../../campaign-world/world-source.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../../campaign-world/world-repository.test-support.js";
import {
  CAMPAIGN_PLAY_SQLITE_TABLES,
} from "../../engine/gameplay-control-plane-contract.js";
import {
  CAMPAIGN_CLONE_MANIFEST_FILENAME,
  cloneCampaignCleanStart,
  executeCampaignFilesystemClonePlan,
} from "../clone.js";
import { planCampaignStoreManifestOperation } from "../store-manifest-executor.js";

const SOURCE_CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_CAMPAIGN_ID = "22222222-2222-4222-8222-222222222222";
const WORLD_SOURCE_CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";
const WORLD_TARGET_CAMPAIGN_ID = "44444444-4444-4444-8444-444444444444";
const REVIEW_SOURCE_CAMPAIGN_ID = "66666666-6666-4666-8666-666666666666";
const REVIEW_TARGET_CAMPAIGN_ID = "77777777-7777-4777-8777-777777777777";
const NOW = 1_779_609_000_000;
const CLONE_OPERATION_ID = "55555555-5555-4555-8555-555555555555";

let tempRoot = "";
let previousCampaignsRoot: string | undefined;

function campaignDir(campaignId: string): string {
  return path.join(tempRoot, campaignId);
}

interface FileByteEvidence {
  path: string;
  size: number;
  sha256: string;
}

function directoryByteInventory(root: string): FileByteEvidence[] {
  const evidence: FileByteEvidence[] = [];
  const visit = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
      } else if (entry.isFile()) {
        const bytes = fs.readFileSync(absolutePath);
        evidence.push({
          path: path.relative(root, absolutePath).split(path.sep).join("/"),
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  };
  visit(root);
  return evidence.sort((left, right) => left.path.localeCompare(right.path));
}

function expectExistingDirectoryBytesUnchanged(
  before: readonly FileByteEvidence[],
  after: readonly FileByteEvidence[],
): void {
  const existingPaths = new Set(before.map((entry) => entry.path));
  expect(after.filter((entry) => existingPaths.has(entry.path))).toEqual(before);
  expect(after.filter((entry) => !existingPaths.has(entry.path)).every((entry) =>
    entry.path === "state.db-shm" || entry.path === "state.db-wal"
  )).toBe(true);
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
  let db = getSqliteConnection();
  db.prepare(
    "INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
  ).run(SOURCE_CAMPAIGN_ID, "Source Campaign", `Premise ${SOURCE_CAMPAIGN_ID}`, NOW - 1000, NOW - 1000);
  closeDb();
  acceptSourceCampaignWorld(SOURCE_CAMPAIGN_ID);
  connectDb(path.join(dir, "state.db"));
  db = getSqliteConnection();
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

function acceptSourceCampaignWorld(campaignId: string): CampaignWorldReview {
  const source = sourceFixture(campaignId);
  const handle = openCampaignWorldDatabase(campaignId);
  try {
    const repository = createCampaignWorldRepository(handle);
    const buildId = `accepted-clone-${campaignId}`;
    repository.acquireBuild({
      buildId,
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: NOW - 500,
    });
    advanceBuildToPersistence(repository, buildId);
    const review = repository.completeBuild({
      buildId,
      candidate: candidateFixture(source),
      completedAt: NOW - 250,
    });
    repository.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: NOW - 100,
    });
    const accepted = repository.loadWorld();
    if (!accepted || accepted.status !== "accepted") {
      throw new Error("Accepted clone fixture was not persisted.");
    }
    return accepted;
  } finally {
    handle.close();
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
      cloneOperationId: CLONE_OPERATION_ID,
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
    expect(result.scrubbedTextColumns).toEqual(["campaign_worlds.source_snapshot_json"]);
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
      premise: `Premise names ${SOURCE_CAMPAIGN_ID}`,
      createdAt: NOW,
      updatedAt: NOW,
      currentTick: 0,
    });
    expect(targetConfig.nested).toEqual({ sourceCampaignId: SOURCE_CAMPAIGN_ID });
    expect(targetConfig.keyedByCampaign).toHaveProperty(SOURCE_CAMPAIGN_ID);
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
          description: `Description contains ${SOURCE_CAMPAIGN_ID}`,
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

    const cloneManifest = JSON.parse(
      fs.readFileSync(path.join(campaignDir(TARGET_CAMPAIGN_ID), CAMPAIGN_CLONE_MANIFEST_FILENAME), "utf-8"),
    ) as Record<string, unknown>;
    expect(cloneManifest).toMatchObject({
      schemaVersion: 2,
      mode: "clean_start",
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      clonedAt: NOW,
      lineage: {
        cloneOperationId: CLONE_OPERATION_ID,
        parentCampaignId: SOURCE_CAMPAIGN_ID,
        childCampaignId: TARGET_CAMPAIGN_ID,
      },
    });
    expect(cloneManifest).toHaveProperty("plan.steps");
    expect(cloneManifest).toHaveProperty("filesystemActions");
  });

  it("clones an accepted Campaign World with stable content and target ownership", async () => {
    createMigratedCampaign(tempRoot, WORLD_SOURCE_CAMPAIGN_ID);
    fs.writeFileSync(
      path.join(campaignDir(WORLD_SOURCE_CAMPAIGN_ID), "config.json"),
      JSON.stringify({
        id: WORLD_SOURCE_CAMPAIGN_ID,
        name: "Accepted World Source",
        premise: "A stormbound archipelago faces a failing sea route.",
        createdAt: NOW - 1000,
        updatedAt: NOW - 1000,
      }),
      "utf-8",
    );

    const source = {
      ...sourceFixture(WORLD_SOURCE_CAMPAIGN_ID),
      premise: `The archive names its parent campaign as ${WORLD_SOURCE_CAMPAIGN_ID}.`,
    };
    source.sourceDigest = calculateCampaignWorldSourceDigest({
      premise: source.premise,
      dna: source.dna,
      researchSummary: source.researchSummary,
      sourceReferences: source.sourceReferences,
    });
    const sourceHandle = openCampaignWorldDatabase(WORLD_SOURCE_CAMPAIGN_ID);
    let acceptedSource: CampaignWorldReview | null = null;
    try {
      const repository = createCampaignWorldRepository(sourceHandle);
      repository.acquireBuild({
        buildId: "accepted-world-build",
        source,
        expectedSourceDigest: source.sourceDigest,
        providerId: "test-provider",
        model: "test-model",
        startedAt: NOW - 500,
      });
      advanceBuildToPersistence(repository, "accepted-world-build");
      const review = repository.completeBuild({
        buildId: "accepted-world-build",
        candidate: candidateFixture(source),
        completedAt: NOW - 250,
      });
      repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: review.contentHash,
        acceptedAt: NOW - 100,
      });
      acceptedSource = repository.loadWorld();
    } finally {
      sourceHandle.close();
    }

    expect(acceptedSource?.status).toBe("accepted");
    const sourceDbPath = path.join(campaignDir(WORLD_SOURCE_CAMPAIGN_ID), "state.db");
    const sourceDb = new Database(sourceDbPath);
    let parentAcceptedSnapshotJson = "";
    try {
      const acceptedRow = sourceDb.prepare(`
        SELECT accepted_snapshot_json AS acceptedSnapshotJson
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(WORLD_SOURCE_CAMPAIGN_ID) as { acceptedSnapshotJson: string };
      parentAcceptedSnapshotJson = acceptedRow.acceptedSnapshotJson;
      sourceDb.prepare(`
        INSERT INTO campaign_play_states (
          campaign_id, accepted_world_version, accepted_content_hash,
          world_version, world_hash, runtime_revision, runtime_hash,
          next_runtime_event_sequence, world_time_minutes, setup_phase,
          opened_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, NULL, 'character_required', NULL, ?, ?)
      `).run(
        WORLD_SOURCE_CAMPAIGN_ID,
        acceptedSource!.version,
        acceptedSource!.contentHash,
        acceptedSource!.version,
        acceptedSource!.contentHash,
        "a".repeat(64),
        NOW - 50,
        NOW - 50,
      );
    } finally {
      sourceDb.close();
    }
    const parentBytesBefore = directoryByteInventory(campaignDir(WORLD_SOURCE_CAMPAIGN_ID));
    const result = await cloneCampaignCleanStart({
      sourceCampaignId: WORLD_SOURCE_CAMPAIGN_ID,
      targetCampaignId: WORLD_TARGET_CAMPAIGN_ID,
      now: NOW,
      cloneOperationId: CLONE_OPERATION_ID,
    });
    expectExistingDirectoryBytesUnchanged(
      parentBytesBefore,
      directoryByteInventory(campaignDir(WORLD_SOURCE_CAMPAIGN_ID)),
    );
    expect(result.lineage).toEqual({
      cloneOperationId: CLONE_OPERATION_ID,
      parentCampaignId: WORLD_SOURCE_CAMPAIGN_ID,
      childCampaignId: WORLD_TARGET_CAMPAIGN_ID,
      parentAcceptedSnapshotHash: createHash("sha256")
        .update(parentAcceptedSnapshotJson)
        .digest("hex"),
      sourceDigest: acceptedSource!.sourceDigest,
    });

    const targetHandle = openCampaignWorldDatabase(WORLD_TARGET_CAMPAIGN_ID);
    try {
      const repository = createCampaignWorldRepository(targetHandle);
      const clonedWorld = repository.loadWorld();
      expect(clonedWorld).not.toBeNull();
      expect(clonedWorld).toMatchObject({
        campaignId: WORLD_TARGET_CAMPAIGN_ID,
        status: "accepted",
        version: acceptedSource?.version,
        contentHash: acceptedSource?.contentHash,
        sourceDigest: acceptedSource?.sourceDigest,
      });
      expect(clonedWorld?.source).toEqual({
        premise: acceptedSource?.source.premise,
        dna: acceptedSource?.source.dna,
        researchSummary: acceptedSource?.source.researchSummary,
        sourceReferences: acceptedSource?.source.sourceReferences,
      });
      expect(clonedWorld?.locations.map((location) => location.id)).toEqual(
        acceptedSource?.locations.map((location) => location.id),
      );
      expect(clonedWorld?.actors.map((actor) => actor.id)).toEqual(
        acceptedSource?.actors.map((actor) => actor.id),
      );
      expect(repository.loadLatestBuild()).toBeNull();
      const childSnapshot = targetHandle.sqlite.prepare(`
        SELECT accepted_snapshot_json AS acceptedSnapshotJson,
          source_snapshot_json AS sourceSnapshotJson
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(WORLD_TARGET_CAMPAIGN_ID) as {
        acceptedSnapshotJson: string;
        sourceSnapshotJson: string;
      };
      expect(childSnapshot.acceptedSnapshotJson).toBe(
        serializeAcceptedCampaignWorldReview({
          ...acceptedSource!,
          campaignId: WORLD_TARGET_CAMPAIGN_ID,
        }),
      );
      expect(JSON.parse(childSnapshot.sourceSnapshotJson)).toMatchObject({
        campaignId: WORLD_TARGET_CAMPAIGN_ID,
        premise: `The archive names its parent campaign as ${WORLD_SOURCE_CAMPAIGN_ID}.`,
        sourceDigest: acceptedSource?.sourceDigest,
      });
      for (const tableName of CAMPAIGN_PLAY_SQLITE_TABLES) {
        expect(targetHandle.sqlite.prepare(
          `SELECT COUNT(*) AS count FROM "${tableName}"`,
        ).get()).toEqual({ count: 0 });
      }
    } finally {
      targetHandle.close();
    }
    const parentAfter = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
    try {
      expect(parentAfter.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_states WHERE campaign_id = ?
      `).get(WORLD_SOURCE_CAMPAIGN_ID)).toEqual({ count: 1 });
    } finally {
      parentAfter.close();
    }
  });

  it("rejects provenance cloning after player character bootstrap", async () => {
    const sourceDbPath = path.join(campaignDir(SOURCE_CAMPAIGN_ID), "state.db");
    const sourceDb = new Database(sourceDbPath);
    try {
      const accepted = sourceDb.prepare(`
        SELECT accepted_world_version AS acceptedWorldVersion,
          accepted_content_hash AS acceptedContentHash
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(SOURCE_CAMPAIGN_ID) as {
        acceptedWorldVersion: number;
        acceptedContentHash: string;
      };
      sourceDb.prepare(`
        INSERT INTO campaign_play_states (
          campaign_id, accepted_world_version, accepted_content_hash,
          world_version, world_hash, runtime_revision, runtime_hash,
          next_runtime_event_sequence, world_time_minutes, setup_phase,
          opened_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, NULL, 'character_required', NULL, ?, ?)
      `).run(
        SOURCE_CAMPAIGN_ID,
        accepted.acceptedWorldVersion,
        accepted.acceptedContentHash,
        accepted.acceptedWorldVersion,
        accepted.acceptedContentHash,
        "b".repeat(64),
        NOW - 20,
        NOW - 20,
      );
      sourceDb.prepare(`
        INSERT INTO actors (
          id, campaign_id, kind, controller, role, name, summary, traits, tags
        ) VALUES (
          'actor-human-clone-guard', ?, 'person', 'human', 'player',
          'Player', 'The human player.', '[]', '[]'
        )
      `).run(SOURCE_CAMPAIGN_ID);
      sourceDb.prepare(`
        INSERT INTO campaign_play_characters (
          actor_id, campaign_id, record_json, record_hash,
          source_kind, source_digest, created_at
        ) VALUES (
          'actor-human-clone-guard', ?, '{}', ?, 'created', ?, ?
        )
      `).run(SOURCE_CAMPAIGN_ID, "c".repeat(64), "d".repeat(64), NOW - 10);
    } finally {
      sourceDb.close();
    }
    const parentBytesBefore = directoryByteInventory(campaignDir(SOURCE_CAMPAIGN_ID));

    await expect(cloneCampaignCleanStart({
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      now: NOW,
    })).rejects.toMatchObject({
      code: "campaign_play_clone_requires_zero_turn",
      statusCode: 409,
    });

    expect(fs.existsSync(campaignDir(TARGET_CAMPAIGN_ID))).toBe(false);
    expectExistingDirectoryBytesUnchanged(
      parentBytesBefore,
      directoryByteInventory(campaignDir(SOURCE_CAMPAIGN_ID)),
    );
  });

  it("rejects a Campaign World that has not been accepted", async () => {
    createMigratedCampaign(tempRoot, REVIEW_SOURCE_CAMPAIGN_ID);
    fs.writeFileSync(
      path.join(campaignDir(REVIEW_SOURCE_CAMPAIGN_ID), "config.json"),
      JSON.stringify({
        id: REVIEW_SOURCE_CAMPAIGN_ID,
        name: "Review World",
        premise: "A world still awaiting acceptance.",
        createdAt: NOW - 100,
        updatedAt: NOW - 100,
      }),
      "utf-8",
    );

    await expect(cloneCampaignCleanStart({
      sourceCampaignId: REVIEW_SOURCE_CAMPAIGN_ID,
      targetCampaignId: REVIEW_TARGET_CAMPAIGN_ID,
      now: NOW,
    })).rejects.toThrow("You can clone this campaign once your Campaign World is accepted.");
    expect(fs.existsSync(campaignDir(REVIEW_TARGET_CAMPAIGN_ID))).toBe(false);
  });

  it("rejects a source database containing another campaign and its play state", async () => {
    const sourceDb = new Database(path.join(campaignDir(SOURCE_CAMPAIGN_ID), "state.db"));
    const otherCampaignId = "88888888-8888-4888-8888-888888888888";
    try {
      sourceDb.prepare(`
        INSERT INTO campaigns (id, name, premise, created_at, updated_at)
        VALUES (?, 'Other Campaign', 'Other premise', ?, ?)
      `).run(otherCampaignId, NOW - 1000, NOW - 1000);
      sourceDb.prepare(`
        INSERT INTO campaign_worlds (
          campaign_id, status, world_version, content_hash, source_digest,
          source_snapshot_json, world_summary, built_at, accepted_at,
          accepted_snapshot_json, accepted_world_version, accepted_content_hash
        )
        SELECT ?, status, world_version, content_hash, source_digest,
          source_snapshot_json, world_summary, built_at, accepted_at,
          accepted_snapshot_json, accepted_world_version, accepted_content_hash
        FROM campaign_worlds WHERE campaign_id = ?
      `).run(otherCampaignId, SOURCE_CAMPAIGN_ID);
      const accepted = sourceDb.prepare(`
        SELECT accepted_world_version AS version, accepted_content_hash AS contentHash
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(otherCampaignId) as { version: number; contentHash: string };
      sourceDb.prepare(`
        INSERT INTO campaign_play_states (
          campaign_id, accepted_world_version, accepted_content_hash,
          world_version, world_hash, runtime_revision, runtime_hash,
          next_runtime_event_sequence, world_time_minutes, setup_phase,
          opened_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 1, ?, 1, NULL, 'character_required', NULL, ?, ?)
      `).run(
        otherCampaignId,
        accepted.version,
        accepted.contentHash,
        accepted.version,
        accepted.contentHash,
        "e".repeat(64),
        NOW - 10,
        NOW - 10,
      );
      expect(sourceDb.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sourceDb.close();
    }

    await expect(cloneCampaignCleanStart({
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      now: NOW,
    })).rejects.toThrow("Campaign clone requires a single-campaign source database.");
    expect(fs.existsSync(campaignDir(TARGET_CAMPAIGN_ID))).toBe(false);
  });

  it("preserves a target directory reserved by another clone operation", async () => {
    const targetDir = campaignDir(TARGET_CAMPAIGN_ID);
    const sentinelPath = path.join(targetDir, "owner.txt");
    fs.mkdirSync(targetDir);
    fs.writeFileSync(sentinelPath, "reserved", "utf-8");

    await expect(cloneCampaignCleanStart({
      sourceCampaignId: SOURCE_CAMPAIGN_ID,
      targetCampaignId: TARGET_CAMPAIGN_ID,
      now: NOW,
    })).rejects.toThrow(`Clone target already exists: ${targetDir}`);

    expect(fs.readFileSync(sentinelPath, "utf-8")).toBe("reserved");
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
