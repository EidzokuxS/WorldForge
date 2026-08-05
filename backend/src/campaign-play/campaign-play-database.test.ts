import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import { closeDb, connectDb } from "../db/index.js";
import { runForeignKeySafeMigrations } from "../db/migrate.js";
import {
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../campaign-world/world-repository.test-support.js";
import {
  CampaignPlayDatabaseError,
  openCampaignPlayDatabase,
  type CampaignPlayDatabaseHandle,
} from "./campaign-play-database.js";

const CAMPAIGN_A = "11111111-1111-4111-8111-111111111111";
const CAMPAIGN_B = "22222222-2222-4222-8222-222222222222";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const HASH_C = "c".repeat(64);
const drizzleSource = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

interface MigrationJournal {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
}

interface TurnFixture {
  id: string;
  campaignId: string;
  turnKind: "opening" | "player_action";
  supersedesTurnId: string | null;
  idempotencyKey: string;
  finalWorldVersion: number | null;
  stage:
    | "admitted"
    | "judged"
    | "planned"
    | "primary_settled"
    | "actors_settled"
    | "visibility_projected"
    | "interrupted"
    | "completed"
    | "failed";
  publicPacketHash: string | null;
  interruptedStage: string | null;
  errorCode: string | null;
  resumeEligible: number;
  completedAt: number | null;
}

let root = "";
let previousCampaignsRoot: string | undefined;
let handles: Array<CampaignPlayDatabaseHandle | CampaignWorldDatabaseHandle> = [];

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-campaign-play-db-"));
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

function track<T extends CampaignPlayDatabaseHandle | CampaignWorldDatabaseHandle>(
  handle: T,
): T {
  handles.push(handle);
  return handle;
}

function createAcceptedCampaign(campaignId: string): string {
  const databasePath = createMigratedCampaign(root, campaignId);
  const handle = openCampaignWorldDatabase(campaignId);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(campaignId);
    const buildId = `build-${campaignId}`;
    repository.acquireBuild({
      buildId,
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test-provider",
      model: "test-model",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, buildId);
    const review = repository.completeBuild({
      buildId,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    repository.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: 1_200,
    });
  } finally {
    handle.close();
  }
  return databasePath;
}

function migrationFolderThrough(lastIndex: number): string {
  const target = path.join(root, `migrations-through-${lastIndex}`);
  const targetMeta = path.join(target, "meta");
  fs.mkdirSync(targetMeta, { recursive: true });
  const journal = JSON.parse(fs.readFileSync(
    path.join(drizzleSource, "meta", "_journal.json"),
    "utf-8",
  )) as MigrationJournal;
  const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
  for (const entry of entries) {
    fs.copyFileSync(
      path.join(drizzleSource, `${entry.tag}.sql`),
      path.join(target, `${entry.tag}.sql`),
    );
  }
  fs.writeFileSync(
    path.join(targetMeta, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    "utf-8",
  );
  return target;
}

function openPlay(campaignId: string): CampaignPlayDatabaseHandle {
  return track(openCampaignPlayDatabase(campaignId));
}

function insertPlayState(handle: CampaignPlayDatabaseHandle): void {
  const accepted = handle.sqlite.prepare(`
    SELECT accepted_world_version AS acceptedWorldVersion,
      accepted_content_hash AS acceptedContentHash
    FROM campaign_worlds
    WHERE campaign_id = ?
  `).get(handle.campaignId) as {
    acceptedWorldVersion: number;
    acceptedContentHash: string;
  };
  handle.sqlite.prepare(`
    INSERT INTO campaign_play_states (
      campaign_id,
      accepted_world_version,
      accepted_content_hash,
      world_version,
      world_hash,
      runtime_revision,
      runtime_hash,
      next_runtime_event_sequence,
      world_time_minutes,
      setup_phase,
      opened_at,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 1, ?, 2, NULL, 'character_required', NULL, 1300, 1300)
  `).run(
    handle.campaignId,
    accepted.acceptedWorldVersion,
    accepted.acceptedContentHash,
    accepted.acceptedWorldVersion,
    accepted.acceptedContentHash,
    HASH_A,
  );
  handle.sqlite.prepare(`
    INSERT INTO campaign_play_runtime_events (
      event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
      world_version, prior_runtime_revision, result_runtime_revision,
      prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
    ) VALUES (?, ?, 1, NULL, 'play_state_created', NULL, ?, 0, 1, ?, ?, ?, 1300)
  `).run(
    `event-state-${handle.campaignId}`,
    handle.campaignId,
    accepted.acceptedWorldVersion,
    HASH_B,
    HASH_A,
    HASH_C,
  );
}

function insertTurn(
  handle: CampaignPlayDatabaseHandle,
  overrides: Partial<TurnFixture> = {},
): TurnFixture {
  const turn: TurnFixture = {
    id: "turn-one",
    campaignId: handle.campaignId,
    turnKind: "player_action",
    supersedesTurnId: null,
    idempotencyKey: "action-one",
    finalWorldVersion: null,
    stage: "admitted",
    publicPacketHash: null,
    interruptedStage: null,
    errorCode: null,
    resumeEligible: 0,
    completedAt: null,
    ...overrides,
  };
  const state = handle.sqlite.prepare(`
    SELECT world_version AS worldVersion, runtime_revision AS runtimeRevision
    FROM campaign_play_states WHERE campaign_id = ?
  `).get(turn.campaignId) as { worldVersion: number; runtimeRevision: number };
  handle.sqlite.prepare(`
    INSERT INTO campaign_play_turns (
      id, campaign_id, turn_kind, supersedes_turn_id, input_json, input_hash,
      idempotency_key, expected_world_version, expected_runtime_revision,
      base_world_version, final_world_version, stage, frame_hash,
      next_event_sequence, worker_lease_owner, worker_epoch,
      worker_lease_expires_at, model_selection_json, public_packet_hash,
      interrupted_stage, error_code, resume_eligible, mutation_audit_json,
      submitted_at, updated_at, completed_at
    ) VALUES (
      @id, @campaignId, @turnKind, @supersedesTurnId, '{}', @inputHash,
      @idempotencyKey, @worldVersion, @runtimeRevision, @worldVersion,
      @finalWorldVersion, @stage, @frameHash, 1, NULL, 0, NULL, '{}',
      @publicPacketHash, @interruptedStage, @errorCode, @resumeEligible, '{}',
      1400, 1400, @completedAt
    )
  `).run({
    ...turn,
    inputHash: HASH_B,
    frameHash: HASH_C,
    worldVersion: state.worldVersion,
    runtimeRevision: state.runtimeRevision,
  });
  return turn;
}

function insertPlayerActor(
  handle: CampaignPlayDatabaseHandle,
  actorId = "actor-player",
): void {
  handle.sqlite.prepare(`
    INSERT INTO actors (
      id, campaign_id, kind, controller, role, name, summary
    ) VALUES (?, ?, 'person', 'human', 'player', 'Player', 'The player actor.')
  `).run(actorId, handle.campaignId);
}

interface RulebookSettlementFixture {
  commandId: string;
  receiptId: string;
  eventId: string;
  priorWorldVersion: number;
  resultWorldVersion: number;
  resultWorldHash: string;
}

function settleRulebookCommand(
  handle: CampaignPlayDatabaseHandle,
  input: {
    id: string;
    commandKind:
      | "set_route_state"
      | "set_actor_condition"
      | "initialize_pressure_state"
      | "advance_pressure"
      | "record_world_event";
    eventKind:
      | "route_state_changed"
      | "actor_condition_changed"
      | "pressure_initialized"
      | "pressure_advanced"
      | "scene_recorded";
    payload: Record<string, unknown>;
    affectedRef: { kind: string; id: string };
    exposureMode?: "protected" | "projectable";
    exposurePredicates?: Array<Record<string, unknown>>;
    worldTimeMinutes?: number;
  },
): RulebookSettlementFixture {
  const state = handle.sqlite.prepare(`
    SELECT world_version AS worldVersion, world_hash AS worldHash
    FROM campaign_play_states WHERE campaign_id = ?
  `).get(handle.campaignId) as { worldVersion: number; worldHash: string };
  const commandId = `command-${input.id}`;
  const receiptId = `receipt-${input.id}`;
  const eventId = `world-event-${input.id}`;
  const sourceJson = JSON.stringify({ kind: "system", system: "game_master" });
  const exposurePolicyJson = input.exposureMode === "projectable"
    ? JSON.stringify({
      mode: "projectable",
      predicates: input.exposurePredicates ?? [{
        channel: "direct_perception",
        locationId: input.affectedRef.id,
      }],
    })
    : JSON.stringify({ mode: "protected" });
  const payloadJson = JSON.stringify(input.payload);
  const mutates = input.commandKind !== "record_world_event";
  const resultWorldVersion = state.worldVersion + (mutates ? 1 : 0);
  const resultWorldHash = mutates
    ? (state.worldHash === HASH_A ? HASH_B : HASH_A)
    : state.worldHash;

  handle.sqlite.prepare(`
    INSERT INTO campaign_play_commands (
      command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
      causal_parent_json, source_json, expected_world_version,
      read_scope_json, write_scope_json, exposure_policy_json,
      arguments_hash, protected_payload_json, protected_payload_hash, created_at
    ) VALUES (?, ?, 'turn-one', ?, 0, ?, ?, ?, ?, '[]', '[]', ?, ?, ?, ?, 1700)
  `).run(
    commandId,
    handle.campaignId,
    `batch-${input.id}`,
    input.commandKind,
    JSON.stringify({ kind: "turn", turnId: "turn-one" }),
    sourceJson,
    state.worldVersion,
    exposurePolicyJson,
    HASH_B,
    payloadJson,
    HASH_C,
  );
  handle.sqlite.prepare(`
    INSERT INTO campaign_play_receipts (
      receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
      applied_world_mutation, prior_world_version, result_world_version,
      prior_world_hash, result_world_hash, causal_event_ids_json,
      protected_payload_json, protected_payload_hash, created_at
    ) VALUES (?, ?, 'turn-one', ?, ?, 'applied', ?, ?, ?, ?, ?, ?, '{}', ?, 1710)
  `).run(
    receiptId,
    handle.campaignId,
    commandId,
    input.commandKind,
    mutates ? 1 : 0,
    state.worldVersion,
    resultWorldVersion,
    state.worldHash,
    resultWorldHash,
    JSON.stringify([eventId]),
    HASH_B,
  );
  handle.sqlite.prepare(`
    INSERT INTO campaign_play_events (
      event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
      event_kind, source_json, world_time_minutes, world_version,
      affected_refs_json, before_payload_json, after_payload_json,
      payload_hash, created_at
    ) VALUES (?, ?, 'turn-one', ?, ?, NULL, ?, ?, ?, ?, ?, '{}', ?, ?, 1720)
  `).run(
    eventId,
    handle.campaignId,
    commandId,
    receiptId,
    input.eventKind,
    sourceJson,
    input.worldTimeMinutes ?? 0,
    resultWorldVersion,
    JSON.stringify([input.affectedRef]),
    payloadJson,
    HASH_A,
  );
  if (mutates) {
    handle.sqlite.prepare(`
      UPDATE campaign_play_states
      SET world_version = ?, world_hash = ?, updated_at = 1720
      WHERE campaign_id = ?
    `).run(resultWorldVersion, resultWorldHash, handle.campaignId);
  }
  return {
    commandId,
    receiptId,
    eventId,
    priorWorldVersion: state.worldVersion,
    resultWorldVersion,
    resultWorldHash,
  };
}

describe("Campaign Play core and Rulebook storage", () => {
  it("migrates fresh campaign databases with the twenty-seven Campaign Play tables", () => {
    const databasePath = createMigratedCampaign(root, CAMPAIGN_A);
    const sqlite = new Database(databasePath);
    try {
      const tables = sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'table' AND name LIKE 'campaign_play_%'
        ORDER BY name
      `).all();
      expect(tables).toEqual([
        { name: "campaign_play_actor_conditions" },
        { name: "campaign_play_actor_due_sets" },
        { name: "campaign_play_actor_jobs" },
        { name: "campaign_play_actor_knowledge" },
        { name: "campaign_play_actor_obligations" },
        { name: "campaign_play_actor_plans" },
        { name: "campaign_play_actor_possessions" },
        { name: "campaign_play_actor_proposals" },
        { name: "campaign_play_actor_schedules" },
        { name: "campaign_play_characters" },
        { name: "campaign_play_commands" },
        { name: "campaign_play_event_exposures" },
        { name: "campaign_play_events" },
        { name: "campaign_play_model_stages" },
        { name: "campaign_play_narration_attempts" },
        { name: "campaign_play_narration_operations" },
        { name: "campaign_play_narrations" },
        { name: "campaign_play_observations" },
        { name: "campaign_play_pressure_states" },
        { name: "campaign_play_proper_scenes" },
        { name: "campaign_play_receipts" },
        { name: "campaign_play_route_states" },
        { name: "campaign_play_runtime_events" },
        { name: "campaign_play_states" },
        { name: "campaign_play_turn_events" },
        { name: "campaign_play_turn_results" },
        { name: "campaign_play_turns" },
      ]);
      const rulebookIndexes = sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name IN (
          'idx_campaign_play_commands_campaign_causal_parent',
          'idx_campaign_play_commands_campaign_expected_version',
          'idx_campaign_play_events_campaign_world_version',
          'idx_campaign_play_events_campaign_parent',
          'campaign_play_receipts_campaign_mutation_version_unique'
        )
        ORDER BY name
      `).all();
      expect(rulebookIndexes).toEqual([
        { name: "campaign_play_receipts_campaign_mutation_version_unique" },
        { name: "idx_campaign_play_commands_campaign_causal_parent" },
        { name: "idx_campaign_play_commands_campaign_expected_version" },
        { name: "idx_campaign_play_events_campaign_parent" },
        { name: "idx_campaign_play_events_campaign_world_version" },
      ]);
      const possessionIndexes = sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name IN (
          'campaign_play_actor_possessions_actor_key_unique',
          'idx_campaign_play_actor_possessions_receipt',
          'idx_campaign_play_actor_possessions_campaign_actor',
          'idx_campaign_play_actor_possessions_campaign_version'
        )
        ORDER BY name
      `).all();
      expect(possessionIndexes).toEqual([
        { name: "campaign_play_actor_possessions_actor_key_unique" },
        { name: "idx_campaign_play_actor_possessions_campaign_actor" },
        { name: "idx_campaign_play_actor_possessions_campaign_version" },
        { name: "idx_campaign_play_actor_possessions_receipt" },
      ]);
      const obligationIndexes = sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'index' AND name IN (
          'campaign_play_actor_obligations_debtor_creditor_unit_unique',
          'campaign_play_actor_obligations_receipt_unique',
          'idx_campaign_play_actor_obligations_campaign_debtor',
          'idx_campaign_play_actor_obligations_campaign_creditor',
          'idx_campaign_play_actor_obligations_campaign_version'
        )
        ORDER BY name
      `).all();
      expect(obligationIndexes).toEqual([
        { name: "campaign_play_actor_obligations_debtor_creditor_unit_unique" },
        { name: "campaign_play_actor_obligations_receipt_unique" },
        { name: "idx_campaign_play_actor_obligations_campaign_creditor" },
        { name: "idx_campaign_play_actor_obligations_campaign_debtor" },
        { name: "idx_campaign_play_actor_obligations_campaign_version" },
      ]);
      expect(sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND name LIKE 'campaign_play_actor_possessions_%'
        ORDER BY name
      `).all()).toEqual([
        { name: "campaign_play_actor_possessions_delete_immutable" },
        { name: "campaign_play_actor_possessions_insert_guard" },
        { name: "campaign_play_actor_possessions_update_guard" },
      ]);
      expect(sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND name LIKE 'campaign_play_actor_obligations_%'
        ORDER BY name
      `).all()).toEqual([
        { name: "campaign_play_actor_obligations_delete_immutable" },
        { name: "campaign_play_actor_obligations_insert_guard" },
        { name: "campaign_play_actor_obligations_update_guard" },
      ]);
      const paymentStorage = sqlite.prepare(`SELECT name, sql FROM sqlite_schema
        WHERE name IN (
          'campaign_play_actor_obligations',
          'campaign_play_events',
          'campaign_play_events_insert_guard'
        ) ORDER BY name`).all() as Array<{ name: string; sql: string }>;
      expect(paymentStorage.find((row) => row.name === "campaign_play_actor_obligations")?.sql)
        .toContain('"outstanding_amount" BETWEEN 0 AND "campaign_play_actor_obligations"."principal_amount"');
      expect(paymentStorage.find((row) => row.name === "campaign_play_events")?.sql)
        .toContain("'actor_obligation_payment_applied'");
      expect(paymentStorage.find((row) => row.name === "campaign_play_events_insert_guard")?.sql)
        .toContain("'pay_actor_obligation'");
      const runtimeTriggers = sqlite.prepare(`SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND (
          name LIKE 'campaign_play_actor_due_sets_%'
          OR name LIKE 'campaign_play_actor_jobs_%'
          OR name LIKE 'campaign_play_turn_results_%'
          OR name LIKE 'campaign_play_turn_terminal_result%'
        ) ORDER BY name`).all();
      expect(runtimeTriggers).toEqual([
        { name: "campaign_play_actor_due_sets_capacity_guard" },
        { name: "campaign_play_actor_due_sets_delete_immutable" },
        { name: "campaign_play_actor_due_sets_insert_guard" },
        { name: "campaign_play_actor_due_sets_update_immutable" },
        { name: "campaign_play_actor_jobs_delete_immutable" },
        { name: "campaign_play_actor_jobs_insert_guard" },
        { name: "campaign_play_actor_jobs_update_guard" },
        { name: "campaign_play_turn_results_delete_immutable" },
        { name: "campaign_play_turn_results_insert_guard" },
        { name: "campaign_play_turn_results_update_immutable" },
        { name: "campaign_play_turn_terminal_result" },
        { name: "campaign_play_turn_terminal_result_insert" },
      ]);
      expect((sqlite.pragma("foreign_key_list('campaign_play_actor_due_sets')") as Array<{ table: string }>)
        .map((foreignKey) => foreignKey.table).sort()).toEqual([
        "campaign_play_states",
        "campaign_play_turns",
      ]);
      expect((sqlite.pragma("foreign_key_list('campaign_play_turn_results')") as Array<{ table: string }>)
        .map((foreignKey) => foreignKey.table).sort()).toEqual([
        "campaign_play_states",
        "campaign_play_turns",
      ]);
      expect((sqlite.pragma("foreign_key_list('campaign_play_actor_possessions')") as Array<{ table: string }>)
        .map((foreignKey) => foreignKey.table).sort()).toEqual([
        "actors",
        "campaign_play_receipts",
        "campaigns",
      ]);
      expect((sqlite.pragma("foreign_key_list('campaign_play_actor_obligations')") as Array<{ table: string }>)
        .map((foreignKey) => foreignKey.table).sort()).toEqual([
        "actors",
        "actors",
        "campaign_play_receipts",
        "campaigns",
      ]);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("rejects local scenes without a matching Rulebook receipt", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    try {
      insertPlayState(handle);
      const anchor = handle.sqlite.prepare(`SELECT id,
        parent_location_id AS parentLocationId
        FROM locations
        WHERE campaign_id = ? AND kind = 'persistent_sublocation'
          AND parent_location_id IS NOT NULL
        ORDER BY id LIMIT 1`).get(CAMPAIGN_A) as {
          id: string;
          parentLocationId: string;
        };
      expect(() => handle.sqlite.prepare(`INSERT INTO locations (
        id, campaign_id, name, description, kind, parent_location_id,
        anchor_location_id, persistence, tags, is_starting, definition_authority,
        causal_receipt_id, world_version
      ) VALUES ('scene-without-receipt', ?, 'Unfounded Passage',
        'A passage without an authoritative origin.', 'persistent_sublocation', ?, ?,
        'persistent', '[]', 0, 'campaign_play', 'receipt-without-command', 2)`).run(
          CAMPAIGN_A,
          anchor.parentLocationId,
          anchor.id,
        )).toThrow(/campaign_play_runtime_location_receipt_invalid/);
      expect(handle.sqlite.prepare(`SELECT name FROM sqlite_master
        WHERE type = 'trigger' AND name IN (
          'locations_definition_authority_insert_guard',
          'location_edges_definition_authority_insert_guard',
          'locations_campaign_play_runtime_update_immutable',
          'location_edges_campaign_play_runtime_update_immutable'
        ) ORDER BY name`).all()).toEqual([
        { name: "location_edges_campaign_play_runtime_update_immutable" },
        { name: "location_edges_definition_authority_insert_guard" },
        { name: "locations_campaign_play_runtime_update_immutable" },
        { name: "locations_definition_authority_insert_guard" },
      ]);
      expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      handle.close();
    }
  });

  it("widens a populated Rulebook ledger without rewriting its evidence", () => {
    const databasePath = path.join(root, "populated-before-possessions.db");
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema });
      migrate(db, { migrationsFolder: migrationFolderThrough(34) });
      sqlite.prepare(`INSERT INTO campaigns (id, name, premise, created_at, updated_at)
        VALUES (?, 'Before Possessions', 'Premise', 1, 1)`).run(CAMPAIGN_A);
      const repository = createCampaignWorldRepository({
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      });
      const source = sourceFixture(CAMPAIGN_A);
      repository.acquireBuild({
        buildId: "build-before-possessions",
        source,
        expectedSourceDigest: source.sourceDigest,
        providerId: "test-provider",
        model: "test-model",
        startedAt: 1_000,
      });
      advanceBuildToPersistence(repository, "build-before-possessions");
      const review = repository.completeBuild({
        buildId: "build-before-possessions",
        candidate: candidateFixture(source),
        completedAt: 1_100,
      });
      repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: review.contentHash,
        acceptedAt: 1_200,
      });
      const handle = {
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      } satisfies CampaignPlayDatabaseHandle;
      insertPlayState(handle);
      insertPlayerActor(handle);
      insertTurn(handle);
      const locationId = review.locations[0]!.id;
      const settlement = settleRulebookCommand(handle, {
        id: "before-possessions",
        commandKind: "record_world_event",
        eventKind: "scene_recorded",
        payload: {
          eventClass: "discovery",
          performingActorId: null,
          summary: "Rain beads on the harbor rail.",
          affectedRefs: [{ kind: "location", id: locationId }],
        },
        affectedRef: { kind: "location", id: locationId },
        exposureMode: "projectable",
        exposurePredicates: [{ channel: "direct_perception", locationId }],
      });
      sqlite.prepare(`INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id, route_id,
        witness_actor_id, valid_until_world_time_minutes, route_triggers_json, created_at
      ) VALUES ('exposure-before-possessions', ?, ?, 'direct_perception', ?,
        NULL, NULL, NULL, NULL, 1800)`).run(CAMPAIGN_A, settlement.eventId, locationId);
      const ledgerBefore = JSON.stringify({
        commands: sqlite.prepare(`SELECT * FROM campaign_play_commands ORDER BY command_id`).all(),
        receipts: sqlite.prepare(`SELECT * FROM campaign_play_receipts ORDER BY receipt_id`).all(),
        events: sqlite.prepare(`SELECT * FROM campaign_play_events ORDER BY event_id`).all(),
        exposures: sqlite.prepare(`SELECT * FROM campaign_play_event_exposures ORDER BY exposure_id`).all(),
      });

      runForeignKeySafeMigrations(db, sqlite, migrationFolderThrough(35));

      expect(JSON.stringify({
        commands: sqlite.prepare(`SELECT * FROM campaign_play_commands ORDER BY command_id`).all(),
        receipts: sqlite.prepare(`SELECT * FROM campaign_play_receipts ORDER BY receipt_id`).all(),
        events: sqlite.prepare(`SELECT * FROM campaign_play_events ORDER BY event_id`).all(),
        exposures: sqlite.prepare(`SELECT * FROM campaign_play_event_exposures ORDER BY exposure_id`).all(),
      })).toBe(ledgerBefore);
      const definitions = sqlite.prepare(`SELECT name, sql FROM sqlite_schema
        WHERE type='table' AND name IN (
          'campaign_play_commands', 'campaign_play_receipts', 'campaign_play_events'
        ) ORDER BY name`).all() as Array<{ name: string; sql: string }>;
      expect(definitions.find((row) => row.name === "campaign_play_commands")?.sql)
        .toContain("'adjust_actor_possession'");
      expect(definitions.find((row) => row.name === "campaign_play_receipts")?.sql)
        .toContain("'adjust_actor_possession'");
      expect(definitions.find((row) => row.name === "campaign_play_events")?.sql)
        .toContain("'actor_possession_adjusted'");
      expect(() => sqlite.prepare(`INSERT INTO campaign_play_commands
        SELECT 'command-invalid-kind', campaign_id, turn_id, 'batch-invalid-kind', 0,
          'invalid_kind', causal_parent_json, source_json, expected_world_version,
          read_scope_json, write_scope_json, exposure_policy_json, arguments_hash,
          protected_payload_json, protected_payload_hash, created_at
        FROM campaign_play_commands LIMIT 1`).run()).toThrow();
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
      expect(sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    } finally {
      sqlite.close();
    }
  });

  it("applies pending migrations when a managed campaign database opens directly", () => {
    const directory = path.join(root, CAMPAIGN_A);
    const databasePath = path.join(directory, "state.db");
    fs.mkdirSync(directory, { recursive: true });
    const sqlite = new Database(databasePath);
    try {
      migrate(drizzle(sqlite, { schema }), { migrationsFolder: migrationFolderThrough(33) });
      sqlite.prepare(`INSERT INTO campaigns (
        id, name, premise, created_at, updated_at
      ) VALUES (?, 'Pending Migration', 'Premise', 1, 1)`).run(CAMPAIGN_A);
      const before = sqlite.prepare(`SELECT sql FROM sqlite_master
        WHERE type = 'trigger' AND name = 'campaign_play_actor_schedules_update_guard'`)
        .get() as { sql: string };
      expect(before.sql).not.toContain("job.defer_reason = 'actor_capacity'");
    } finally {
      sqlite.close();
    }

    const opened = track(openCampaignWorldDatabase(CAMPAIGN_A));
    const after = opened.sqlite.prepare(`SELECT sql FROM sqlite_master
      WHERE type = 'trigger' AND name = 'campaign_play_actor_schedules_update_guard'`)
      .get() as { sql: string };
    expect(after.sql).toContain("job.defer_reason = 'actor_capacity'");
    expect(opened.sqlite.prepare(`SELECT max(created_at) AS latest
      FROM __drizzle_migrations`).get()).toEqual({ latest: 1_785_816_000_000 });
    expect((opened.sqlite.pragma("table_info('campaign_play_actor_schedules')") as Array<{
      name: string;
      notnull: number;
    }>).find((column) => column.name === "plan_id")).toMatchObject({ notnull: 0 });
    expect((opened.sqlite.pragma("table_info('campaign_play_actor_jobs')") as Array<{
      name: string;
      notnull: number;
    }>).filter((column) => ["admitted_plan_id", "plan_id"].includes(column.name)))
      .toEqual([
        expect.objectContaining({ name: "admitted_plan_id", notnull: 0 }),
        expect.objectContaining({ name: "plan_id", notnull: 0 }),
      ]);
  });

  it("backfills narration deadlines for an operation created before the hard-deadline migration", () => {
    const databasePath = path.join(root, "narration-before-hard-deadline.db");
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema });
      runForeignKeySafeMigrations(db, sqlite, migrationFolderThrough(48));
      sqlite.prepare(`INSERT INTO campaigns (
        id, name, premise, created_at, updated_at
      ) VALUES (?, 'Before Narrator Deadline', 'Premise', 1, 1)`).run(CAMPAIGN_A);
      const repository = createCampaignWorldRepository({
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      });
      const source = sourceFixture(CAMPAIGN_A);
      repository.acquireBuild({
        buildId: "build-before-narrator-deadline",
        source,
        expectedSourceDigest: source.sourceDigest,
        providerId: "test-provider",
        model: "test-model",
        startedAt: 1_000,
      });
      advanceBuildToPersistence(repository, "build-before-narrator-deadline");
      const review = repository.completeBuild({
        buildId: "build-before-narrator-deadline",
        candidate: candidateFixture(source),
        completedAt: 1_100,
      });
      repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: review.contentHash,
        acceptedAt: 1_200,
      });
      const handle = {
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      } satisfies CampaignPlayDatabaseHandle;
      insertPlayState(handle);
      insertTurn(handle, {
        stage: "visibility_projected",
        publicPacketHash: HASH_A,
      });
      sqlite.prepare(`INSERT INTO campaign_play_narrations (
        narration_id, campaign_id, turn_id, status, packet_hash, packet_json, created_at
      ) VALUES ('narration-before-hard-deadline', ?, 'turn-one', 'pending', ?, '{}', 1450)`)
        .run(CAMPAIGN_A, HASH_A);
      sqlite.prepare(`INSERT INTO campaign_play_narration_operations (
        operation_id, campaign_id, turn_id, result_id, narration_id, packet_hash,
        receipt_ids_json, concise_display_text, concise_suggested_actions_json,
        status, current_attempt, lease_epoch, created_at, updated_at
      ) VALUES ('narration-operation:before-hard-deadline', ?, 'turn-one',
        'result:before-hard-deadline', 'narration-before-hard-deadline', ?, '[]',
        'A concise result.', '[]', 'pending', 0, 0, 1500, 1500)`)
        .run(CAMPAIGN_A, HASH_A);

      runForeignKeySafeMigrations(db, sqlite, migrationFolderThrough(49));

      expect(sqlite.prepare(`SELECT operation_id AS operationId,
          automatic_deadline_at AS automaticDeadlineAt,
          active_deadline_at AS activeDeadlineAt, status, created_at AS createdAt
        FROM campaign_play_narration_operations`).get()).toEqual({
        operationId: "narration-operation:before-hard-deadline",
        automaticDeadlineAt: 91_500,
        activeDeadlineAt: 91_500,
        status: "pending",
        createdAt: 1_500,
      });
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("adds core play storage to an accepted Campaign World without changing provenance", () => {
    const databasePath = path.join(root, "accepted-before-play.db");
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema });
      migrate(db, { migrationsFolder: migrationFolderThrough(26) });
      sqlite.prepare(`
        INSERT INTO campaigns (id, name, premise, created_at, updated_at)
        VALUES (?, 'Accepted Before Play', 'Premise', 1, 1)
      `).run(CAMPAIGN_A);
      const repository = createCampaignWorldRepository({
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      });
      const source = sourceFixture(CAMPAIGN_A);
      repository.acquireBuild({
        buildId: "build-before-play-storage",
        source,
        expectedSourceDigest: source.sourceDigest,
        providerId: "test-provider",
        model: "test-model",
        startedAt: 1_000,
      });
      advanceBuildToPersistence(repository, "build-before-play-storage");
      const review = repository.completeBuild({
        buildId: "build-before-play-storage",
        candidate: candidateFixture(source),
        completedAt: 1_100,
      });
      repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: review.contentHash,
        acceptedAt: 1_200,
      });
      const acceptedBefore = sqlite.prepare(`
        SELECT accepted_snapshot_json AS acceptedSnapshotJson,
          accepted_world_version AS acceptedWorldVersion,
          accepted_content_hash AS acceptedContentHash
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(CAMPAIGN_A);
      const actorsBefore = sqlite.prepare(
        "SELECT * FROM actors ORDER BY id",
      ).all();

      migrate(db, { migrationsFolder: migrationFolderThrough(27) });

      expect(sqlite.prepare(`
        SELECT accepted_snapshot_json AS acceptedSnapshotJson,
          accepted_world_version AS acceptedWorldVersion,
          accepted_content_hash AS acceptedContentHash
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(CAMPAIGN_A)).toEqual(acceptedBefore);
      expect(sqlite.prepare("SELECT * FROM actors ORDER BY id").all()).toEqual(
        actorsBefore,
      );
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count FROM campaign_play_states
      `).get()).toEqual({ count: 0 });
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("migrates 0029 runtime and unfinished model-stage data into recovery storage", () => {
    const databasePath = path.join(root, "campaign-play-before-recovery.db");
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema });
      migrate(db, { migrationsFolder: migrationFolderThrough(29) });
      sqlite.prepare(`
        INSERT INTO campaigns (id, name, premise, created_at, updated_at)
        VALUES (?, 'Before Recovery', 'Premise', 1, 1)
      `).run(CAMPAIGN_A);
      const repository = createCampaignWorldRepository({
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      });
      const source = sourceFixture(CAMPAIGN_A);
      repository.acquireBuild({
        buildId: "build-before-recovery",
        source,
        expectedSourceDigest: source.sourceDigest,
        providerId: "test-provider",
        model: "test-model",
        startedAt: 1_000,
      });
      advanceBuildToPersistence(repository, "build-before-recovery");
      const review = repository.completeBuild({
        buildId: "build-before-recovery",
        candidate: candidateFixture(source),
        completedAt: 1_100,
      });
      repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: review.contentHash,
        acceptedAt: 1_200,
      });
      const handle = {
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      } satisfies CampaignPlayDatabaseHandle;
      insertPlayState(handle);
      insertTurn(handle);
      sqlite.prepare(`
        INSERT INTO campaign_play_model_stages (
          id, stage_id, attempt, campaign_id, turn_id, kind, status,
          worker_epoch, requested_provider_id, requested_model,
          requested_strategy, schema_outcome, created_at
        ) VALUES (
          'model-before-recovery', 'judge-before-recovery', 1, ?, 'turn-one',
          'judge', 'started', 1, 'provider', 'model', 'strict_object',
          'pending', 1500
        )
      `).run(CAMPAIGN_A);
      const stateBefore = sqlite.prepare(
        "SELECT * FROM campaign_play_states WHERE campaign_id = ?",
      ).get(CAMPAIGN_A);
      const turnBefore = sqlite.prepare(
        "SELECT * FROM campaign_play_turns WHERE id = 'turn-one'",
      ).get();
      const eventBefore = sqlite.prepare(
        "SELECT * FROM campaign_play_runtime_events WHERE campaign_id = ?",
      ).all(CAMPAIGN_A);

      migrate(db, { migrationsFolder: migrationFolderThrough(30) });

      expect(sqlite.prepare(
        "SELECT * FROM campaign_play_states WHERE campaign_id = ?",
      ).get(CAMPAIGN_A)).toEqual(stateBefore);
      expect(sqlite.prepare(
        "SELECT * FROM campaign_play_turns WHERE id = 'turn-one'",
      ).get()).toEqual(turnBefore);
      expect(sqlite.prepare(
        "SELECT * FROM campaign_play_runtime_events WHERE campaign_id = ?",
      ).all(CAMPAIGN_A)).toEqual(eventBefore);
      expect(sqlite.prepare(`
        SELECT id, stage_id AS stageId, status, artifact_json AS artifactJson,
          artifact_hash AS artifactHash
        FROM campaign_play_model_stages WHERE id = 'model-before-recovery'
      `).get()).toEqual({
        id: "model-before-recovery",
        stageId: "judge-before-recovery",
        status: "started",
        artifactJson: null,
        artifactHash: null,
      });
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("opens only accepted campaigns and stays bound while the global database switches", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const campaignA = openPlay(CAMPAIGN_A);
    createAcceptedCampaign(CAMPAIGN_B);
    connectDb(path.join(root, CAMPAIGN_B, "state.db"));

    expect(campaignA.campaignId).toBe(CAMPAIGN_A);
    expect(campaignA.sqlite.prepare(
      "SELECT id FROM campaigns WHERE id = ?",
    ).get(CAMPAIGN_A)).toEqual({ id: CAMPAIGN_A });
    expect(campaignA.sqlite.prepare(
      "SELECT id FROM campaigns WHERE id = ?",
    ).get(CAMPAIGN_B)).toBeUndefined();
    expect(campaignA.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(campaignA.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(campaignA.sqlite.pragma("busy_timeout", { simple: true })).toBe(5_000);
  });

  it("rejects review worlds and incomplete Campaign Play schemas", () => {
    createMigratedCampaign(root, CAMPAIGN_A);
    expect(() => openCampaignPlayDatabase(CAMPAIGN_A)).toThrowError(
      expect.objectContaining<Partial<CampaignPlayDatabaseError>>({
        code: "campaign_world_not_accepted",
      }),
    );

    const databasePath = createAcceptedCampaign(CAMPAIGN_B);
    const sqlite = new Database(databasePath);
    sqlite.exec("DROP TABLE campaign_play_observations");
    sqlite.close();
    expect(() => openCampaignPlayDatabase(CAMPAIGN_B)).toThrowError(
      expect.objectContaining<Partial<CampaignPlayDatabaseError>>({
        code: "campaign_schema_outdated",
      }),
    );
  });

  it("binds play state to immutable accepted provenance and the campaign player", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    insertPlayerActor(handle);
    handle.sqlite.prepare(`
      INSERT INTO actors (
        id, campaign_id, kind, controller, role, name, summary
      ) VALUES ('actor-agent', ?, 'person', 'agent', 'support', 'Agent', 'A support actor.')
    `).run(CAMPAIGN_A);

    handle.sqlite.prepare(`
      INSERT INTO campaign_play_characters (
        actor_id, campaign_id, record_json, record_hash,
        source_kind, source_digest, created_at
      ) VALUES (?, ?, '{}', ?, 'created', ?, 1500)
    `).run("actor-player", CAMPAIGN_A, HASH_B, HASH_C);

    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_states SET accepted_content_hash = ?
      WHERE campaign_id = ?
    `).run(HASH_B, CAMPAIGN_A)).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_characters SET record_json = '{"changed":true}'
      WHERE actor_id = 'actor-player'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_characters WHERE actor_id = 'actor-player'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE actors SET controller = 'agent', role = 'support'
      WHERE id = 'actor-player'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM actors WHERE id = 'actor-player'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_characters (
        actor_id, campaign_id, record_json, record_hash,
        source_kind, source_digest, created_at
      ) VALUES ('actor-agent', ?, '{}', ?, 'created', ?, 1500)
    `).run(CAMPAIGN_A, HASH_B, HASH_C)).toThrow();
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("enforces idempotency and one active turn including interruptions", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    insertTurn(handle);

    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET idempotency_key = 'rewritten-action'
      WHERE id = 'turn-one'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET id = 'rewritten-turn'
      WHERE id = 'turn-one'
    `).run()).toThrow();

    expect(() => insertTurn(handle, {
      id: "turn-same-key",
    })).toThrow();
    expect(() => insertTurn(handle, {
      id: "turn-competing",
      idempotencyKey: "action-two",
    })).toThrow();

    handle.sqlite.prepare(`
      UPDATE campaign_play_turns
      SET stage = 'interrupted', interrupted_stage = 'admitted',
        error_code = 'provider_unavailable', resume_eligible = 1
      WHERE id = 'turn-one'
    `).run();
    expect(() => insertTurn(handle, {
      id: "turn-during-interruption",
      idempotencyKey: "action-three",
    })).toThrow();
  });

  it("supersedes only a zero-mutation failed opening exactly once", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    const state = handle.sqlite.prepare(`
      SELECT world_version AS worldVersion FROM campaign_play_states
      WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as { worldVersion: number };
    insertTurn(handle, {
      id: "opening-failed",
      turnKind: "opening",
      idempotencyKey: "opening-one",
      finalWorldVersion: state.worldVersion,
      stage: "failed",
      errorCode: "persistence_failed",
      completedAt: 1500,
    });

    expect(() => insertTurn(handle, {
      id: "opening-without-predecessor",
      turnKind: "opening",
      idempotencyKey: "opening-two",
    })).toThrow();
    insertTurn(handle, {
      id: "opening-successor",
      turnKind: "opening",
      supersedesTurnId: "opening-failed",
      idempotencyKey: "opening-three",
    });
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_turns
      SELECT 'opening-successor-two', campaign_id, turn_kind, 'opening-failed',
        input_json, input_hash, 'opening-four', expected_world_version,
        expected_runtime_revision, base_world_version, NULL, 'admitted',
        frame_hash, 1, NULL, 0, NULL, model_selection_json, NULL,
        NULL, NULL, 0, '{}', 1600, 1600, NULL
      FROM campaign_play_turns WHERE id = 'opening-failed'
    `).run()).toThrow();
  });

  it("blocks a successor after a failed opening mutated mechanical truth", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    const state = handle.sqlite.prepare(`
      SELECT world_version AS worldVersion FROM campaign_play_states
      WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as { worldVersion: number };
    insertTurn(handle, {
      id: "opening-mutated",
      turnKind: "opening",
      idempotencyKey: "opening-mutated",
      finalWorldVersion: state.worldVersion + 1,
      stage: "failed",
      errorCode: "persistence_failed",
      completedAt: 1500,
    });
    expect(() => insertTurn(handle, {
      id: "opening-after-mutation",
      turnKind: "opening",
      supersedesTurnId: "opening-mutated",
      idempotencyKey: "opening-after-mutation",
    })).toThrow();
  });

  it("fences runtime ownership, turn events, model attempts, and narration packets", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    insertTurn(handle);

    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_runtime_events (
        event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
        world_version, prior_runtime_revision, result_runtime_revision,
        prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
      ) VALUES ('bad-event', ?, 2, NULL, 'turn_admitted', NULL, 1, 1, 2, ?, ?, ?, 1500)
    `).run(CAMPAIGN_A, HASH_A, HASH_B, HASH_C)).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_runtime_events SET protected_payload_hash = ?
      WHERE event_id = ?
    `).run(HASH_A, `event-state-${CAMPAIGN_A}`)).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_runtime_events WHERE event_id = ?
    `).run(`event-state-${CAMPAIGN_A}`)).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_runtime_events (
        event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
        world_version, prior_runtime_revision, result_runtime_revision,
        prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
      ) VALUES ('bad-fence', ?, 2, 'turn-one', 'worker_claimed', NULL, 1, 1, 2, ?, ?, ?, 1500)
    `).run(CAMPAIGN_A, HASH_A, HASH_B, HASH_C)).toThrow();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_runtime_events (
        event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
        world_version, prior_runtime_revision, result_runtime_revision,
        prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
      ) VALUES ('lease-renewed', ?, 2, 'turn-one', 'worker_lease_renewed', 1, 1, 1, 2, ?, ?, ?, 1500)
    `).run(CAMPAIGN_A, HASH_A, HASH_B, HASH_C);
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_runtime_events (
        event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
        world_version, prior_runtime_revision, result_runtime_revision,
        prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
      ) VALUES ('lease-renewed-unfenced', ?, 3, 'turn-one', 'worker_lease_renewed', NULL, 1, 2, 3, ?, ?, ?, 1500)
    `).run(CAMPAIGN_A, HASH_B, HASH_C, HASH_A)).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_runtime_events (
        event_id, campaign_id, sequence, turn_id, kind, worker_epoch,
        world_version, prior_runtime_revision, result_runtime_revision,
        prior_runtime_hash, result_runtime_hash, protected_payload_hash, created_at
      ) VALUES ('lease-renewed-unowned', ?, 4, NULL, 'worker_lease_renewed', 1, 1, 3, 4, ?, ?, ?, 1500)
    `).run(CAMPAIGN_A, HASH_C, HASH_A, HASH_B)).toThrow();

    handle.sqlite.prepare(`
      INSERT INTO campaign_play_turn_events (
        event_id, campaign_id, turn_id, sequence, event_type,
        payload_json, sse_cursor, created_at
      ) VALUES ('turn-event-one', ?, 'turn-one', 1, 'turn.accepted', '{}', 'turn-one:1', 1500)
    `).run(CAMPAIGN_A);
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_turn_events (
        event_id, campaign_id, turn_id, sequence, event_type,
        payload_json, sse_cursor, created_at
      ) VALUES ('turn-event-bad', ?, 'turn-one', 2, 'hidden.trace', '{}', 'turn-one:2', 1500)
    `).run(CAMPAIGN_A)).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_turn_events SET payload_json = '{"rewritten":true}'
      WHERE event_id = 'turn-event-one'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_turn_events WHERE event_id = 'turn-event-one'
    `).run()).toThrow();

    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, schema_outcome, artifact_json, artifact_hash, created_at
      ) VALUES (
        'model-started-with-artifact', 'judge-started-with-artifact', 1, ?,
        'turn-one', 'judge', 'started', 1, 'provider', 'model',
        'strict_object', 'pending', '{}', ?, 1500
      )
    `).run(CAMPAIGN_A, HASH_A)).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, actual_provider_id, actual_model, actual_strategy,
        input_tokens, output_tokens, duration_ms, finish_reason, schema_outcome,
        artifact_json, artifact_hash, created_at, completed_at
      ) VALUES (
        'model-accepted-invalid-json', 'judge-accepted-invalid-json', 1, ?,
        'turn-one', 'judge', 'accepted', 1, 'provider', 'model',
        'strict_object', 'provider', 'model', 'strict_object', 10, 5, 20,
        'stop', 'valid', 'not-json', ?, 1500, 1520
      )
    `).run(CAMPAIGN_A, HASH_A)).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, actual_provider_id, actual_model, actual_strategy,
        input_tokens, output_tokens, duration_ms, finish_reason, schema_outcome,
        artifact_hash, created_at, completed_at
      ) VALUES (
        'model-accepted-without-json', 'judge-accepted-without-json', 1, ?,
        'turn-one', 'judge', 'accepted', 1, 'provider', 'model',
        'strict_object', 'provider', 'model', 'strict_object', 10, 5, 20,
        'stop', 'valid', ?, 1500, 1520
      )
    `).run(CAMPAIGN_A, HASH_A)).toThrow();

    handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, schema_outcome, created_at
      ) VALUES (
        'model-row-one', 'judge-turn-one', 1, ?, 'turn-one', 'judge',
        'started', 1, 'provider', 'model', 'strict_object', 'pending', 1500
      )
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE campaign_play_model_stages
      SET status = 'interrupted', schema_outcome = 'transport_error',
        duration_ms = 10, error_code = 'provider_unavailable', completed_at = 1510
      WHERE id = 'model-row-one'
    `).run();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, schema_outcome, created_at
      ) VALUES (
        'model-row-two', 'judge-turn-one', 2, ?, 'turn-one', 'judge',
        'started', 2, 'provider', 'model', 'strict_object', 'pending', 1520
      )
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE campaign_play_model_stages
      SET status = 'interrupted', schema_outcome = 'transport_error',
        duration_ms = 10, error_code = 'provider_unavailable', completed_at = 1530
      WHERE id = 'model-row-two'
    `).run();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, schema_outcome, created_at
      ) VALUES (
        'model-row-stale', 'judge-turn-one', 3, ?, 'turn-one', 'judge',
        'started', 1, 'provider', 'model', 'strict_object', 'pending', 1530
      )
    `).run(CAMPAIGN_A)).toThrow();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, schema_outcome, created_at
      ) VALUES (
        'model-row-three', 'judge-turn-one', 3, ?, 'turn-one', 'judge',
        'started', 3, 'provider', 'model', 'strict_object', 'pending', 1540
      )
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE campaign_play_model_stages
      SET status = 'accepted', schema_outcome = 'valid',
        actual_provider_id = 'provider', actual_model = 'model',
        actual_strategy = 'strict_object', input_tokens = 10, output_tokens = 5,
        duration_ms = 20, finish_reason = 'stop', artifact_json = '{"result":"accepted"}',
        artifact_hash = ?,
        completed_at = 1560
      WHERE id = 'model-row-three'
    `).run(HASH_B);
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_model_stages (
        id, stage_id, attempt, campaign_id, turn_id, kind, status,
        worker_epoch, requested_provider_id, requested_model,
        requested_strategy, schema_outcome, created_at
      ) VALUES (
        'model-row-after-accepted', 'judge-turn-one', 4, ?, 'turn-one', 'judge',
        'started', 4, 'provider', 'model', 'strict_object', 'pending', 1570
      )
    `).run(CAMPAIGN_A)).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_model_stages SET artifact_hash = ?
      WHERE id = 'model-row-three'
    `).run(HASH_C)).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_model_stages WHERE id = 'model-row-three'
    `).run()).toThrow();

    handle.sqlite.prepare(`
      UPDATE campaign_play_turns
      SET stage = 'visibility_projected', public_packet_hash = ?
      WHERE id = 'turn-one'
    `).run(HASH_A);
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET public_packet_hash = ?
      WHERE id = 'turn-one'
    `).run(HASH_B)).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_turns
      SET stage = 'interrupted', interrupted_stage = 'visibility_projected',
        error_code = 'provider_unavailable', resume_eligible = 1
      WHERE id = 'turn-one'
    `).run();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_turns SET public_packet_hash = ?
      WHERE id = 'turn-one'
    `).run(HASH_C)).toThrow();

    handle.sqlite.prepare(`
      INSERT INTO campaign_play_narrations (
        narration_id, campaign_id, turn_id, status, packet_hash,
        packet_json, created_at
      ) VALUES ('narration-one', ?, 'turn-one', 'pending', ?, '{}', 1600)
    `).run(CAMPAIGN_A, HASH_A);
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_narrations SET narration_id = 'rewritten-narration'
      WHERE narration_id = 'narration-one'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_narrations SET packet_json = '{"changed":true}'
      WHERE narration_id = 'narration-one'
    `).run()).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_narrations
      SET status = 'complete', beats_json = '[]', display_text = 'A moment.',
        suggested_actions_json = '[]', effects_json = '[]', completed_at = 1610
      WHERE narration_id = 'narration-one'
    `).run();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_narrations SET display_text = 'Rewritten.'
      WHERE narration_id = 'narration-one'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_narrations WHERE narration_id = 'narration-one'
    `).run()).toThrow();

    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("roots the first character bootstrap in immutable accepted-world provenance", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    const state = handle.sqlite.prepare(`
      SELECT accepted_world_version AS acceptedWorldVersion,
        accepted_content_hash AS acceptedContentHash,
        world_version AS worldVersion,
        world_hash AS worldHash
      FROM campaign_play_states WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as {
      acceptedWorldVersion: number;
      acceptedContentHash: string;
      worldVersion: number;
      worldHash: string;
    };
    const resultHash = state.worldHash === HASH_A ? HASH_B : HASH_A;
    const sourceJson = JSON.stringify({
      kind: "system",
      system: "character_bootstrap",
    });
    const commandJson = JSON.stringify({
      actorId: "actor-player",
      characterDigest: HASH_B,
      name: "Player",
      summary: "A newly arrived traveler.",
      traits: [],
      tags: [],
    });

    handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-character-bootstrap', ?, NULL, 'batch-character-bootstrap', 0,
        'create_player_actor', ?, ?, ?, '[]', '[]', '{"mode":"protected"}',
        ?, ?, ?, 1650
      )
    `).run(
      CAMPAIGN_A,
      JSON.stringify({
        kind: "accepted_world",
        campaignId: CAMPAIGN_A,
        acceptedWorldVersion: state.acceptedWorldVersion,
        acceptedContentHash: state.acceptedContentHash,
      }),
      sourceJson,
      state.worldVersion,
      HASH_A,
      commandJson,
      HASH_B,
    );
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_receipts (
        receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'receipt-character-bootstrap', ?, NULL, 'command-character-bootstrap',
        'create_player_actor', 'applied', 1, ?, ?, ?, ?,
        '["world-event-character-bootstrap"]', '{}', ?, 1660
      )
    `).run(
      CAMPAIGN_A,
      state.worldVersion,
      state.worldVersion + 1,
      state.worldHash,
      resultHash,
      HASH_C,
    );
    insertPlayerActor(handle);
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_characters (
        actor_id, campaign_id, record_json, record_hash,
        source_kind, source_digest, created_at
      ) VALUES ('actor-player', ?, '{}', ?, 'created', ?, 1665)
    `).run(CAMPAIGN_A, HASH_A, HASH_B);
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_events (
        event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
        event_kind, source_json, world_time_minutes, world_version,
        affected_refs_json, before_payload_json, after_payload_json,
        payload_hash, created_at
      ) VALUES (
        'world-event-character-bootstrap', ?, NULL,
        'command-character-bootstrap', 'receipt-character-bootstrap', NULL,
        'player_actor_created', ?, 0, ?,
        '[{"kind":"actor","id":"actor-player"}]', NULL, ?, ?, 1670
      )
    `).run(
      CAMPAIGN_A,
      sourceJson,
      state.worldVersion + 1,
      commandJson,
      HASH_C,
    );
    handle.sqlite.prepare(`
      UPDATE campaign_play_states
      SET world_version = ?, world_hash = ?, setup_phase = 'opening_required',
        updated_at = 1670
      WHERE campaign_id = ?
    `).run(state.worldVersion + 1, resultHash, CAMPAIGN_A);

    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-character-bad-root', ?, NULL, 'batch-character-bad-root', 0,
        'create_player_actor', ?, ?, ?, '[]', '[]', '{"mode":"protected"}',
        ?, ?, ?, 1680
      )
    `).run(
      CAMPAIGN_A,
      JSON.stringify({
        kind: "accepted_world",
        campaignId: CAMPAIGN_A,
        acceptedWorldVersion: state.acceptedWorldVersion,
        acceptedContentHash: HASH_C,
      }),
      sourceJson,
      state.worldVersion + 1,
      HASH_A,
      commandJson,
      HASH_B,
    )).toThrow();
    const insertMalformedBootstrap = handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        ?, ?, NULL, ?, 0, 'create_player_actor', ?, ?, ?, '[]', '[]',
        '{"mode":"protected"}', ?, ?, ?, 1681
      )
    `);
    expect(() => insertMalformedBootstrap.run(
      "command-character-rootless",
      CAMPAIGN_A,
      "batch-character-rootless",
      "{}",
      sourceJson,
      state.worldVersion + 1,
      HASH_A,
      commandJson,
      HASH_B,
    )).toThrow();
    expect(() => insertMalformedBootstrap.run(
      "command-character-sourceless",
      CAMPAIGN_A,
      "batch-character-sourceless",
      JSON.stringify({
        kind: "accepted_world",
        campaignId: CAMPAIGN_A,
        acceptedWorldVersion: state.acceptedWorldVersion,
        acceptedContentHash: state.acceptedContentHash,
      }),
      "{}",
      state.worldVersion + 1,
      HASH_A,
      commandJson,
      HASH_B,
    )).toThrow();
    expect(() => insertMalformedBootstrap.run(
      "command-character-missing-campaign",
      CAMPAIGN_A,
      "batch-character-missing-campaign",
      JSON.stringify({
        kind: "accepted_world",
        acceptedWorldVersion: state.acceptedWorldVersion,
        acceptedContentHash: state.acceptedContentHash,
      }),
      sourceJson,
      state.worldVersion + 1,
      HASH_A,
      commandJson,
      HASH_B,
    )).toThrow();
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("stores immutable Rulebook evidence and executable exposure predicates", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    insertTurn(handle);
    const location = handle.sqlite.prepare(`
      SELECT id FROM locations WHERE campaign_id = ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string };
    const otherLocation = handle.sqlite.prepare(`
      SELECT id FROM locations
      WHERE campaign_id = ? AND id <> ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A, location.id) as { id: string };
    const route = handle.sqlite.prepare(`
      SELECT id FROM location_edges WHERE campaign_id = ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string };

    const visible = settleRulebookCommand(handle, {
      id: "visible-scene",
      commandKind: "record_world_event",
      eventKind: "scene_recorded",
      payload: {
        eventClass: "discovery",
        performingActorId: null,
        summary: "Fresh marks cross the paving stones.",
      },
      affectedRef: { kind: "location", id: location.id },
      exposureMode: "projectable",
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id,
        route_id, witness_actor_id, valid_until_world_time_minutes,
        route_triggers_json, created_at
      ) VALUES ('exposure-visible', ?, ?, 'direct_perception', ?, NULL, NULL, NULL, NULL, 1730)
    `).run(CAMPAIGN_A, visible.eventId, location.id);

    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id,
        route_id, witness_actor_id, valid_until_world_time_minutes,
        route_triggers_json, created_at
      ) VALUES ('exposure-duplicate-anchor', ?, ?, 'direct_perception', ?, NULL, NULL, NULL, NULL, 1730)
    `).run(CAMPAIGN_A, visible.eventId, location.id)).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id,
        route_id, witness_actor_id, valid_until_world_time_minutes,
        route_triggers_json, created_at
      ) VALUES ('exposure-undeclared-anchor', ?, ?, 'direct_perception', ?, NULL, NULL, NULL, NULL, 1730)
    `).run(CAMPAIGN_A, visible.eventId, otherLocation.id)).toThrow();

    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id,
        route_id, witness_actor_id, valid_until_world_time_minutes,
        route_triggers_json, created_at
      ) VALUES ('exposure-duplicate-trigger', ?, ?, 'route_state', NULL, ?, NULL, NULL, '["inspect","inspect"]', 1731)
    `).run(CAMPAIGN_A, visible.eventId, route.id)).toThrow();

    const protectedEvent = settleRulebookCommand(handle, {
      id: "protected-scene",
      commandKind: "record_world_event",
      eventKind: "scene_recorded",
      payload: {
        eventClass: "scene",
        performingActorId: null,
        summary: "A distant private decision is made.",
      },
      affectedRef: { kind: "location", id: location.id },
    });
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id,
        route_id, witness_actor_id, valid_until_world_time_minutes,
        route_triggers_json, created_at
      ) VALUES ('exposure-private', ?, ?, 'direct_perception', ?, NULL, NULL, NULL, NULL, 1732)
    `).run(CAMPAIGN_A, protectedEvent.eventId, location.id)).toThrow();

    const state = handle.sqlite.prepare(`
      SELECT world_version AS worldVersion FROM campaign_play_states
      WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as { worldVersion: number };
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-malformed-route-policy', ?, 'turn-one',
        'batch-malformed-route-policy', 0, 'record_world_event',
        '{"kind":"turn","turnId":"turn-one"}',
        '{"kind":"system","system":"game_master"}', ?, '[]', '[]', ?,
        ?, '{}', ?, 1737
      )
    `).run(
      CAMPAIGN_A,
      state.worldVersion,
      JSON.stringify({
        mode: "projectable",
        predicates: [{
          channel: "route_state",
          routeId: route.id,
          triggers: ["inspect", null],
        }],
      }),
      HASH_A,
      HASH_B,
    )).toThrow();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-kindless-ref', ?, 'turn-one', 'batch-kindless-ref', 0,
        'record_world_event', '{"kind":"turn","turnId":"turn-one"}',
        '{"kind":"system","system":"game_master"}', ?, '[]', '[]',
        '{"mode":"protected"}', ?, '{}', ?, 1738
      )
    `).run(CAMPAIGN_A, state.worldVersion, HASH_A, HASH_B);
    const stateHash = handle.sqlite.prepare(`
      SELECT world_hash AS worldHash FROM campaign_play_states
      WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as { worldHash: string };
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_receipts (
        receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'receipt-kindless-ref', ?, 'turn-one', 'command-kindless-ref',
        'record_world_event', 'applied', 0, ?, ?, ?, ?,
        '["world-event-kindless-ref"]', '{}', ?, 1739
      )
    `).run(
      CAMPAIGN_A,
      state.worldVersion,
      state.worldVersion,
      stateHash.worldHash,
      stateHash.worldHash,
      HASH_C,
    );
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_events (
        event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
        event_kind, source_json, world_time_minutes, world_version,
        affected_refs_json, before_payload_json, after_payload_json,
        payload_hash, created_at
      ) VALUES (
        'world-event-kindless-ref', ?, 'turn-one', 'command-kindless-ref',
        'receipt-kindless-ref', NULL, 'scene_recorded',
        '{"kind":"system","system":"game_master"}', 0, ?, ?, NULL, '{}', ?, 1740
      )
    `).run(
      CAMPAIGN_A,
      state.worldVersion,
      JSON.stringify([{ id: location.id }]),
      HASH_A,
    )).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-bad-parent', ?, 'turn-one', 'batch-bad-parent', 0,
        'record_world_event', '{"kind":"turn","turnId":"missing-turn"}',
        '{"kind":"system","system":"game_master"}', ?, '[]', '[]',
        '{"mode":"protected"}', ?, '{}', ?, 1740
      )
    `).run(CAMPAIGN_A, state.worldVersion, HASH_A, HASH_B)).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-bad-version', ?, 'turn-one', 'batch-bad-version', 0,
        'record_world_event', '{"kind":"turn","turnId":"turn-one"}',
        '{"kind":"system","system":"game_master"}', ?, '[]', '[]',
        '{"mode":"protected"}', ?, '{}', ?, 1741
      )
    `).run(CAMPAIGN_A, state.worldVersion + 1, HASH_A, HASH_B)).toThrow();

    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_commands SET protected_payload_hash = ?
      WHERE command_id = ?
    `).run(HASH_A, visible.commandId)).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_receipts WHERE receipt_id = ?
    `).run(visible.receiptId)).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_events SET payload_hash = ? WHERE event_id = ?
    `).run(HASH_B, visible.eventId)).toThrow();
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("advances route, actor-condition, and pressure state only through matching receipts", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    insertTurn(handle);
    const route = handle.sqlite.prepare(`
      SELECT id FROM location_edges WHERE campaign_id = ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string };
    const actor = handle.sqlite.prepare(`
      SELECT id FROM actors WHERE campaign_id = ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string };
    const pressure = handle.sqlite.prepare(`
      SELECT id FROM world_pressures WHERE campaign_id = ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string };

    const routeSettlement = settleRulebookCommand(handle, {
      id: "route-blocked",
      commandKind: "set_route_state",
      eventKind: "route_state_changed",
      payload: { routeId: route.id, state: "blocked", reason: "Floodwater" },
      affectedRef: { kind: "route", id: route.id },
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_route_states (
        route_id, campaign_id, state, causal_receipt_id, world_version, updated_at
      ) VALUES (?, ?, 'blocked', ?, ?, 1800)
    `).run(
      route.id,
      CAMPAIGN_A,
      routeSettlement.receiptId,
      routeSettlement.resultWorldVersion,
    );
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_route_states SET updated_at = 1801 WHERE route_id = ?
    `).run(route.id)).toThrow();

    const conditionSet = settleRulebookCommand(handle, {
      id: "actor-strained-set",
      commandKind: "set_actor_condition",
      eventKind: "actor_condition_changed",
      payload: {
        actorId: actor.id,
        condition: "strained",
        operation: "set",
        summary: "Exhausted after the climb.",
      },
      affectedRef: { kind: "actor", id: actor.id },
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_conditions (
        actor_id, campaign_id, condition, present, summary,
        causal_receipt_id, world_version, updated_at
      ) VALUES (?, ?, 'strained', 1, 'Exhausted after the climb.', ?, ?, 1810)
    `).run(
      actor.id,
      CAMPAIGN_A,
      conditionSet.receiptId,
      conditionSet.resultWorldVersion,
    );
    const conditionClear = settleRulebookCommand(handle, {
      id: "actor-strained-clear",
      commandKind: "set_actor_condition",
      eventKind: "actor_condition_changed",
      payload: {
        actorId: actor.id,
        condition: "strained",
        operation: "clear",
        summary: "Recovered after resting.",
      },
      affectedRef: { kind: "actor", id: actor.id },
    });
    handle.sqlite.prepare(`
      UPDATE campaign_play_actor_conditions
      SET present = 0, summary = 'Recovered after resting.',
        causal_receipt_id = ?, world_version = ?, updated_at = 1820
      WHERE actor_id = ? AND condition = 'strained'
    `).run(
      conditionClear.receiptId,
      conditionClear.resultWorldVersion,
      actor.id,
    );

    const pressureInit = settleRulebookCommand(handle, {
      id: "pressure-initialize",
      commandKind: "initialize_pressure_state",
      eventKind: "pressure_initialized",
      payload: { pressureId: pressure.id, progress: 10, status: "active" },
      affectedRef: { kind: "pressure", id: pressure.id },
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_pressure_states (
        pressure_id, campaign_id, progress, status,
        last_advanced_world_time_minutes, causal_receipt_id,
        world_version, updated_at
      ) VALUES (?, ?, 10, 'active', 0, ?, ?, 1830)
    `).run(
      pressure.id,
      CAMPAIGN_A,
      pressureInit.receiptId,
      pressureInit.resultWorldVersion,
    );
    const pressureAdvance = settleRulebookCommand(handle, {
      id: "pressure-advance",
      commandKind: "advance_pressure",
      eventKind: "pressure_advanced",
      payload: { pressureId: pressure.id, amount: 5, resultStatus: "active" },
      affectedRef: { kind: "pressure", id: pressure.id },
      worldTimeMinutes: 5,
    });
    handle.sqlite.prepare(`
      UPDATE campaign_play_pressure_states
      SET progress = 15, last_advanced_world_time_minutes = 5,
        causal_receipt_id = ?, world_version = ?, updated_at = 1840
      WHERE pressure_id = ?
    `).run(
      pressureAdvance.receiptId,
      pressureAdvance.resultWorldVersion,
      pressure.id,
    );
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_pressure_states SET progress = 14 WHERE pressure_id = ?
    `).run(pressure.id)).toThrow();
    const pressureBounded = settleRulebookCommand(handle, {
      id: "pressure-bounded",
      commandKind: "advance_pressure",
      eventKind: "pressure_advanced",
      payload: { pressureId: pressure.id, amount: 1, resultStatus: "active" },
      affectedRef: { kind: "pressure", id: pressure.id },
      worldTimeMinutes: 10,
    });
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_pressure_states
      SET progress = 100, last_advanced_world_time_minutes = 10,
        causal_receipt_id = ?, world_version = ?, updated_at = 1850
      WHERE pressure_id = ?
    `).run(
      pressureBounded.receiptId,
      pressureBounded.resultWorldVersion,
      pressure.id,
    )).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_pressure_states
      SET progress = 16, last_advanced_world_time_minutes = 10,
        causal_receipt_id = ?, world_version = ?, updated_at = 1851
      WHERE pressure_id = ?
    `).run(
      pressureBounded.receiptId,
      pressureBounded.resultWorldVersion,
      pressure.id,
    );
    const pressureTimed = settleRulebookCommand(handle, {
      id: "pressure-timed",
      commandKind: "advance_pressure",
      eventKind: "pressure_advanced",
      payload: { pressureId: pressure.id, amount: 1, resultStatus: "active" },
      affectedRef: { kind: "pressure", id: pressure.id },
      worldTimeMinutes: 15,
    });
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_pressure_states
      SET progress = 17, last_advanced_world_time_minutes = 999,
        causal_receipt_id = ?, world_version = ?, updated_at = 1860
      WHERE pressure_id = ?
    `).run(
      pressureTimed.receiptId,
      pressureTimed.resultWorldVersion,
      pressure.id,
    )).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_pressure_states
      SET progress = 17, last_advanced_world_time_minutes = 15,
        causal_receipt_id = ?, world_version = ?, updated_at = 1861
      WHERE pressure_id = ?
    `).run(
      pressureTimed.receiptId,
      pressureTimed.resultWorldVersion,
      pressure.id,
    );
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_actor_conditions
      WHERE actor_id = ? AND condition = 'strained'
    `).run(actor.id)).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_pressure_states WHERE pressure_id = ?
    `).run(pressure.id)).toThrow();
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("persists one actor job and idempotent visibility evidence", () => {
    createAcceptedCampaign(CAMPAIGN_A);
    const handle = openPlay(CAMPAIGN_A);
    insertPlayState(handle);
    insertTurn(handle);
    const actorGoal = handle.sqlite.prepare(`
      SELECT a.id AS actorId, g.id AS goalId
      FROM actors a JOIN actor_goals g ON g.actor_id = a.id
      WHERE a.campaign_id = ? AND a.controller = 'agent'
      ORDER BY a.id LIMIT 1
    `).get(CAMPAIGN_A) as { actorId: string; goalId: string };
    const location = handle.sqlite.prepare(`
      SELECT id FROM locations WHERE campaign_id = ? ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string };
    const state = handle.sqlite.prepare(`
      SELECT world_version AS worldVersion FROM campaign_play_states
      WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as { worldVersion: number };
    const frozenBaseSettlement = settleRulebookCommand(handle, {
      id: "actor-job-frozen-base",
      commandKind: "set_actor_condition",
      eventKind: "actor_condition_changed",
      payload: {
        actorId: actorGoal.actorId,
        condition: "alert",
        operation: "set",
        summary: "The actor prepares to act.",
      },
      affectedRef: { kind: "actor", id: actorGoal.actorId },
    });

    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_plans (
        plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
        preconditions_json, cadence_minutes, priority, steps_json,
        status, created_at, updated_at
      ) VALUES (
        'plan-agent-terminal', ?, ?, ?, 1,
        '{"kind":"wait","targets":[],"method":null,"stakes":null}',
        '[]', 30, 3,
        '[{"stepId":"step-terminal","order":0,"intent":{"kind":"wait","targets":[],"method":null,"stakes":null},"elapsedBounds":{"minimumMinutes":0,"maximumMinutes":30}}]',
        'completed', 1899, 1899
      )
    `).run(CAMPAIGN_A, actorGoal.actorId, actorGoal.goalId)).toThrow();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_plans (
        plan_id, campaign_id, actor_id, goal_id, plan_version, intent_json,
        preconditions_json, cadence_minutes, priority, steps_json,
        status, created_at, updated_at
      ) VALUES (
        'plan-agent-one', ?, ?, ?, 1, '{"kind":"wait","targets":[],"method":null,"stakes":null}',
        '[]', 30, 3,
        '[{"stepId":"step-one","order":0,"intent":{"kind":"wait","targets":[],"method":null,"stakes":null},"elapsedBounds":{"minimumMinutes":0,"maximumMinutes":30}}]',
        'active', 1900, 1900
      )
    `).run(CAMPAIGN_A, actorGoal.actorId, actorGoal.goalId);
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_schedules (
        schedule_id, campaign_id, actor_id, plan_id,
        next_act_at_world_time_minutes, last_act_at_world_time_minutes,
        priority, agency_debt, created_at, updated_at
      ) VALUES ('schedule-agent-one', ?, ?, 'plan-agent-one', 30, NULL, 3, 0, 1900, 1900)
    `).run(CAMPAIGN_A, actorGoal.actorId);
    handle.sqlite.prepare(`
      UPDATE campaign_play_states
      SET world_time_minutes = 30
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE campaign_play_turns
      SET stage = 'primary_settled', final_world_version = ?, updated_at = 1909
      WHERE id = 'turn-one' AND campaign_id = ?
    `).run(frozenBaseSettlement.resultWorldVersion, CAMPAIGN_A);
    const dueAuthority = handle.sqlite.prepare(`
      SELECT world_version AS worldVersion, runtime_revision AS runtimeRevision
      FROM campaign_play_states WHERE campaign_id = ?
    `).get(CAMPAIGN_A) as { worldVersion: number; runtimeRevision: number };
    const dueDecisions = JSON.stringify([{
      dueOrder: 0,
      actorId: actorGoal.actorId,
      scheduleId: "schedule-agent-one",
      planId: "plan-agent-one",
      nextActAtWorldTimeMinutes: 30,
      priority: 3,
      agencyDebt: 0,
      cadenceMinutes: 30,
      disposition: "wake",
      dueReason: "scheduled",
      jobId: "job-agent-one",
    }]);
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_due_sets (
        turn_id, campaign_id, settled_world_time_minutes, base_world_version,
        base_runtime_revision, decisions_json, due_set_hash, created_at
      ) VALUES ('turn-one', ?, 30, ?, ?, ?, ?, 1909)
    `).run(
      CAMPAIGN_A,
      dueAuthority.worldVersion,
      dueAuthority.runtimeRevision,
      dueDecisions,
      HASH_A,
    );
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_jobs (
        job_id, campaign_id, turn_id, actor_id, admitted_plan_id, plan_id, due_reason,
        frozen_base_world_version, worker_epoch, stage, proposal_id,
        defer_reason, created_at, completed_at
      ) VALUES ('job-agent-one', ?, 'turn-one', ?, 'plan-agent-one', 'plan-agent-one',
        'scheduled', ?, 0, 'queued', NULL, NULL, 1910, NULL)
    `).run(
      CAMPAIGN_A,
      actorGoal.actorId,
      frozenBaseSettlement.resultWorldVersion,
    );
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_jobs (
        job_id, campaign_id, turn_id, actor_id, admitted_plan_id, plan_id, due_reason,
        frozen_base_world_version, worker_epoch, stage, proposal_id,
        defer_reason, created_at, completed_at
      ) VALUES ('job-agent-duplicate', ?, 'turn-one', ?, 'plan-agent-one', 'plan-agent-one',
        'scheduled', ?, 0, 'queued', NULL, NULL, 1911, NULL)
    `).run(
      CAMPAIGN_A,
      actorGoal.actorId,
      frozenBaseSettlement.resultWorldVersion,
    )).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-missing-actor-job', ?, 'turn-one', 'batch-missing-actor-job', 0,
        'record_world_event', '{"kind":"actor_job","jobId":"job-missing"}',
        ?, ?, '[]', '[]', '{"mode":"protected"}', ?, '{}', ?, 1912
      )
    `).run(
      CAMPAIGN_A,
      JSON.stringify({ kind: "actor", actorId: actorGoal.actorId }),
      frozenBaseSettlement.resultWorldVersion,
      HASH_A,
      HASH_B,
    )).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_turns
      SET worker_lease_owner = 'worker-one', worker_epoch = 1,
        worker_lease_expires_at = 3000, updated_at = 1912
      WHERE id = 'turn-one' AND campaign_id = ?
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE campaign_play_actor_jobs SET stage = 'claimed', worker_epoch = 1,
        claim_turn_worker_epoch = 1
      WHERE job_id = 'job-agent-one'
    `).run();
    const currentBaseSettlement = settleRulebookCommand(handle, {
      id: "actor-proposal-current-base",
      commandKind: "set_actor_condition",
      eventKind: "actor_condition_changed",
      payload: {
        actorId: actorGoal.actorId,
        condition: "watchful",
        operation: "set",
        summary: "The actor reacts to the settled world.",
      },
      affectedRef: { kind: "actor", id: actorGoal.actorId },
    });
    const proposalCommand = {
      commandId: "command-agent-one",
      batchId: "batch-agent-one",
      order: 0,
      causalParent: { kind: "actor_job", jobId: "job-agent-one" },
      source: { kind: "actor", actorId: actorGoal.actorId },
      expectedWorldVersion: currentBaseSettlement.resultWorldVersion,
      readScope: [],
      writeScope: [],
      exposure: { mode: "protected" },
      kind: "record_world_event",
      eventClass: "scene",
      performingActorId: null,
      summary: "The actor waits and watches.",
      affectedRefs: [{ kind: "location", id: location.id }],
    };
    for (const invalidBaseWorldVersion of [
      frozenBaseSettlement.resultWorldVersion,
      currentBaseSettlement.resultWorldVersion + 1,
      frozenBaseSettlement.resultWorldVersion - 1,
    ]) {
      expect(() => handle.sqlite.prepare(`
        INSERT INTO campaign_play_actor_proposals (
          proposal_id, campaign_id, batch_id, job_id, actor_id,
          causal_parent_json, base_world_version, read_scope_json,
          write_scope_json, expires_at_world_time_minutes, commands_json,
          commands_hash, status, result_json, result_hash, created_at, completed_at
        ) VALUES (
          ?, ?, ?, 'job-agent-one', ?,
          '{"kind":"actor_job","jobId":"job-agent-one"}', ?, '[]', '[]',
          60, ?, ?, 'pending', '{"status":"pending"}', ?, 1919, NULL
        )
      `).run(
        `proposal-agent-invalid-${invalidBaseWorldVersion}`,
        CAMPAIGN_A,
        `batch-agent-invalid-${invalidBaseWorldVersion}`,
        actorGoal.actorId,
        invalidBaseWorldVersion,
        JSON.stringify([proposalCommand]),
        HASH_A,
        HASH_B,
      )).toThrow();
    }
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_proposals (
        proposal_id, campaign_id, batch_id, job_id, actor_id,
        causal_parent_json, base_world_version, read_scope_json,
        write_scope_json, expires_at_world_time_minutes, commands_json,
        commands_hash, status, result_json, result_hash, created_at, completed_at
      ) VALUES (
        'proposal-agent-one', ?, 'batch-agent-one', 'job-agent-one', ?,
        '{"kind":"actor_job","jobId":"job-agent-one"}', ?, '[]', '[]',
        60, ?, ?, 'pending', '{"status":"pending"}', ?, 1920, NULL
      )
    `).run(
      CAMPAIGN_A,
      actorGoal.actorId,
      currentBaseSettlement.resultWorldVersion,
      JSON.stringify([proposalCommand]),
      HASH_A,
      HASH_B,
    );
    for (const terminalStage of ["rejected", "deferred"] as const) {
      expect(() => handle.sqlite.prepare(`
        UPDATE campaign_play_actor_jobs
        SET stage = ?, completed_at = 1924
        WHERE job_id = 'job-agent-one'
      `).run(terminalStage), terminalStage).toThrow();
    }
    handle.sqlite.prepare(`
      UPDATE campaign_play_actor_jobs
      SET stage = 'proposed', proposal_id = 'proposal-agent-one'
      WHERE job_id = 'job-agent-one'
    `).run();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_actor_jobs
      SET stage = 'settled', completed_at = 1925
      WHERE job_id = 'job-agent-one'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_actor_jobs
      SET stage = 'rejected', proposal_id = NULL, completed_at = 1925
      WHERE job_id = 'job-agent-one'
    `).run()).toThrow();
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_commands (
        command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version,
        read_scope_json, write_scope_json, exposure_policy_json,
        arguments_hash, protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'command-agent-one', ?, 'turn-one', 'foreign-batch', 0, 'record_world_event',
        '{"kind":"turn","turnId":"turn-one"}',
        '{"kind":"system","system":"game_master"}', ?,
        '[]', '[]', '{"mode":"protected"}', ?, '{}', ?, 1926
      )
    `).run(
      CAMPAIGN_A,
      currentBaseSettlement.resultWorldVersion,
      HASH_A,
      HASH_B,
    );
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_receipts (
        receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at
      ) VALUES (
        'receipt-agent-one', ?, 'turn-one', 'command-agent-one',
        'record_world_event', 'applied', 0, ?, ?, ?, ?,
        '["event-agent-one"]', '{}', ?, 1927
      )
    `).run(
      CAMPAIGN_A,
      currentBaseSettlement.resultWorldVersion,
      currentBaseSettlement.resultWorldVersion,
      HASH_A,
      HASH_A,
      HASH_C,
    );
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_actor_proposals
      SET status = 'accepted',
        result_json = '{"status":"accepted","receiptIds":["receipt-agent-one"]}',
        result_hash = ?, completed_at = 1928
      WHERE proposal_id = 'proposal-agent-one'
    `).run(HASH_C)).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_actor_proposals
      SET status = 'rejected', result_json = '{"status":"rejected","reason":"precondition_failed"}',
        result_hash = ?, completed_at = 1930
      WHERE proposal_id = 'proposal-agent-one'
    `).run(HASH_C);
    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_play_actor_jobs
      SET stage = 'settled', completed_at = 1930
      WHERE job_id = 'job-agent-one'
    `).run()).toThrow();
    handle.sqlite.prepare(`
      UPDATE campaign_play_actor_jobs
      SET stage = 'rejected', completed_at = 1930
      WHERE job_id = 'job-agent-one'
    `).run();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_actor_proposals WHERE proposal_id = 'proposal-agent-one'
    `).run()).toThrow();

    insertPlayerActor(handle);
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_characters (
        actor_id, campaign_id, record_json, record_hash,
        source_kind, source_digest, created_at
      ) VALUES ('actor-player', ?, '{}', ?, 'created', ?, 1940)
    `).run(CAMPAIGN_A, HASH_A, HASH_B);
    const visible = settleRulebookCommand(handle, {
      id: "knowledge-visible",
      commandKind: "record_world_event",
      eventKind: "scene_recorded",
      payload: { eventClass: "discovery", summary: "A visible trace." },
      affectedRef: { kind: "location", id: location.id },
      exposureMode: "projectable",
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_event_exposures (
        exposure_id, campaign_id, event_id, channel, location_id,
        route_id, witness_actor_id, valid_until_world_time_minutes,
        route_triggers_json, created_at
      ) VALUES ('exposure-knowledge', ?, ?, 'direct_perception', ?, NULL, NULL, NULL, NULL, 1950)
    `).run(CAMPAIGN_A, visible.eventId, location.id);
    const sourceJson = JSON.stringify({
      channel: "direct_perception",
      locationId: location.id,
      perceivedActorId: null,
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_knowledge (
        knowledge_id, campaign_id, actor_id, event_id, exposure_id, channel,
        source_location_id, source_route_id, source_trigger,
        source_witness_actor_id, perceived_actor_id, source_json, source_hash,
        learned_at_world_time_minutes, created_at
      ) VALUES ('knowledge-player', ?, 'actor-player', ?, 'exposure-knowledge',
        'direct_perception', ?, NULL, NULL, NULL, NULL, ?, ?, 0, 1960)
    `).run(CAMPAIGN_A, visible.eventId, location.id, sourceJson, HASH_A);
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_actor_knowledge
      SELECT 'knowledge-player-duplicate', campaign_id, actor_id, event_id,
        exposure_id, channel, source_location_id, source_route_id, source_trigger,
        source_witness_actor_id, perceived_actor_id, source_json, source_hash,
        learned_at_world_time_minutes, created_at
      FROM campaign_play_actor_knowledge WHERE knowledge_id = 'knowledge-player'
    `).run()).toThrow();
    const publicEntryJson = JSON.stringify({
      observationHandle: "observation-visible",
      title: "Fresh tracks",
      text: "Fresh tracks cross the paving stones.",
      whereOrRoute: "Old Square",
      worldTimeLabel: "Now",
      consequence: null,
    });
    handle.sqlite.prepare(`
      INSERT INTO campaign_play_observations (
        observation_id, campaign_id, human_actor_id, event_id, exposure_id,
        channel, source_location_id, source_route_id, source_trigger,
        source_witness_actor_id, perceived_actor_id, source_json, source_hash,
        public_entry_json, public_entry_hash, world_time_minutes, created_at
      ) VALUES ('observation-player', ?, 'actor-player', ?, 'exposure-knowledge',
        'direct_perception', ?, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 0, 1970)
    `).run(
      CAMPAIGN_A, visible.eventId, location.id, sourceJson, HASH_A,
      publicEntryJson, HASH_B,
    );
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_observations (
        observation_id, campaign_id, human_actor_id, event_id, exposure_id,
        channel, source_location_id, source_route_id, source_trigger,
        source_witness_actor_id, perceived_actor_id, source_json, source_hash,
        public_entry_json, public_entry_hash, world_time_minutes, created_at
      ) VALUES ('observation-source-mismatch', ?, 'actor-player', ?, 'exposure-knowledge',
        'direct_perception', NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, 0, 1971)
    `).run(
      CAMPAIGN_A, visible.eventId, sourceJson, HASH_A, publicEntryJson, HASH_B,
    )).toThrow();
    expect(() => handle.sqlite.prepare(`
      INSERT INTO campaign_play_observations
      SELECT 'observation-player-duplicate', campaign_id, human_actor_id,
        event_id, exposure_id, channel, source_location_id, source_route_id,
        source_trigger, source_witness_actor_id, perceived_actor_id, source_json,
        source_hash, public_entry_json, public_entry_hash, world_time_minutes, created_at
      FROM campaign_play_observations WHERE observation_id = 'observation-player'
    `).run()).toThrow();
    expect(() => handle.sqlite.prepare(`
      DELETE FROM campaign_play_actor_knowledge WHERE knowledge_id = 'knowledge-player'
    `).run()).toThrow();
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });
});
