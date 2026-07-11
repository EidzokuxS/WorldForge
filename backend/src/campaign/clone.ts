import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  calculateCampaignWorldContentHash,
  parseAcceptedCampaignWorldReview,
  serializeAcceptedCampaignWorldReview,
} from "../campaign-world/world-snapshot.js";
import { calculateCampaignWorldSourceDigest } from "../campaign-world/world-source.js";
import { AppError } from "../lib/errors.js";
import { assertSafeId, getCampaignConfigPath, getCampaignDir } from "./paths.js";
import { hasAnyActiveTurn } from "./runtime-state.js";
import {
  planCampaignStoreManifestOperation,
  type CampaignStoreManifestOperationPlan,
  type CampaignStoreManifestOperationStep,
} from "./store-manifest-executor.js";
import {
  CAMPAIGN_OPTIONAL_SQLITE_TABLES,
  CAMPAIGN_PLAY_SQLITE_TABLES,
} from "./store-manifest.js";

export const CAMPAIGN_CLONE_MANIFEST_FILENAME = "clone-manifest.json";

export interface CleanStartCampaignCloneOptions {
  sourceCampaignId: string;
  targetCampaignId?: string;
  name?: string;
  nameSuffix?: string;
  now?: number;
  cloneOperationId?: string;
  mode?: "clean_start" | "replay_preserving";
}

export interface CampaignCloneLineage {
  cloneOperationId: string;
  parentCampaignId: string;
  parentAcceptedSnapshotHash: string;
  sourceDigest: string;
  childCampaignId: string;
}

export interface CleanStartCampaignCloneResult {
  mode: "clean_start";
  sourceCampaignId: string;
  targetCampaignId: string;
  sourceDir: string;
  targetDir: string;
  cloneManifestPath: string;
  lineage: CampaignCloneLineage;
  plan: CampaignStoreManifestOperationPlan;
  rewrittenTables: string[];
  purgedTables: string[];
  scrubbedTextColumns: string[];
  filesystemActions: CampaignFilesystemCloneAction[];
}

export interface CampaignFilesystemCloneAction {
  store: string;
  action: string;
  targetPath: string | null;
  note: string;
}

export interface CleanStartCampaignCloneManifest extends CleanStartCampaignCloneResult {
  schemaVersion: 2;
  clonedAt: number;
}

export class CampaignCloneError extends AppError {
  constructor(
    readonly code: "campaign_play_clone_requires_zero_turn",
    message: string,
  ) {
    super(message, 409);
    this.name = "CampaignCloneError";
  }
}

interface AcceptedCloneSource {
  acceptedSnapshotJson: string;
  review: CampaignWorldReview;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  acceptedAt: number;
}

interface TableColumn {
  name: string;
  type: string;
}

function quoteSqlIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/u.test(value)) {
    throw new Error(`Unsafe sqlite identifier in campaign clone: ${value}`);
  }
  return `"${value.replace(/"/gu, '""')}"`;
}

function readTableColumns(db: Database.Database, tableName: string): TableColumn[] {
  return db.prepare(`PRAGMA table_info(${quoteSqlIdentifier(tableName)})`).all() as TableColumn[];
}

function tableExists(db: Database.Database, tableName: string): boolean {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  return row?.name === tableName;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function readAcceptedCloneSource(
  db: Database.Database,
  campaignId: string,
): AcceptedCloneSource {
  const row = db.prepare(`
    SELECT status,
      accepted_at AS acceptedAt,
      accepted_snapshot_json AS acceptedSnapshotJson,
      accepted_world_version AS acceptedWorldVersion,
      accepted_content_hash AS acceptedContentHash
    FROM campaign_worlds
    WHERE campaign_id = ?
  `).get(campaignId) as {
    status: string;
    acceptedAt: number | null;
    acceptedSnapshotJson: string | null;
    acceptedWorldVersion: number | null;
    acceptedContentHash: string | null;
  } | undefined;
  if (
    !row || row.status !== "accepted" || row.acceptedAt === null ||
    row.acceptedSnapshotJson === null || row.acceptedWorldVersion === null ||
    row.acceptedContentHash === null
  ) {
    throw new AppError("You can clone this campaign once your Campaign World is accepted.", 409);
  }
  const review = parseAcceptedCampaignWorldReview(row.acceptedSnapshotJson, {
    campaignId,
    acceptedWorldVersion: row.acceptedWorldVersion,
    acceptedContentHash: row.acceptedContentHash,
    acceptedAt: row.acceptedAt,
  });
  return {
    acceptedSnapshotJson: row.acceptedSnapshotJson,
    review,
    acceptedWorldVersion: row.acceptedWorldVersion,
    acceptedContentHash: row.acceptedContentHash,
    acceptedAt: row.acceptedAt,
  };
}

function hasCampaignRow(
  db: Database.Database,
  tableName: string,
  campaignId: string,
): boolean {
  const table = quoteSqlIdentifier(tableName);
  return Boolean(db.prepare(`SELECT 1 FROM ${table} WHERE campaign_id = ? LIMIT 1`).get(campaignId));
}

function assertCloneBeforeCharacterBootstrap(
  db: Database.Database,
  campaignId: string,
): void {
  const state = db.prepare(`
    SELECT setup_phase AS setupPhase
    FROM campaign_play_states
    WHERE campaign_id = ?
  `).get(campaignId) as { setupPhase: string } | undefined;
  const playerActor = db.prepare(`
    SELECT 1
    FROM actors
    WHERE campaign_id = ? AND kind = 'person'
      AND controller = 'human' AND role = 'player'
    LIMIT 1
  `).get(campaignId);
  const playerCommand = db.prepare(`
    SELECT 1
    FROM campaign_play_commands
    WHERE campaign_id = ? AND command_kind = 'create_player_actor'
    LIMIT 1
  `).get(campaignId);
  const hasBootstrapEvidence =
    hasCampaignRow(db, "campaign_play_characters", campaignId) ||
    hasCampaignRow(db, "campaign_play_turns", campaignId) ||
    Boolean(playerActor) || Boolean(playerCommand) ||
    (state !== undefined && state.setupPhase !== "character_required");
  if (hasBootstrapEvidence) {
    throw new CampaignCloneError(
      "campaign_play_clone_requires_zero_turn",
      "You can only clone a fresh campaign before adding a character or starting play.",
    );
  }
}

function assertSingleCampaignDatabase(
  db: Database.Database,
  expectedCampaignId: string,
): void {
  const campaigns = db.prepare("SELECT id FROM campaigns ORDER BY id").all() as Array<{ id: string }>;
  if (campaigns.length !== 1 || campaigns[0]?.id !== expectedCampaignId) {
    throw new Error("Campaign clone requires a single-campaign source database.");
  }
  const violations = db.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(`Campaign clone source has ${violations.length} foreign-key violation(s).`);
  }
}

function readCampaignPlayTriggerDefinitions(db: Database.Database): string[] {
  const tableNames = new Set<string>([
    ...CAMPAIGN_PLAY_SQLITE_TABLES,
    "campaign_worlds",
  ]);
  return (db.prepare(`
    SELECT tbl_name AS tableName, sql
    FROM sqlite_master
    WHERE type = 'trigger' AND sql IS NOT NULL
    ORDER BY name
  `).all() as Array<{ tableName: string; sql: string }>)
    .filter((entry) => tableNames.has(entry.tableName))
    .map((entry) => entry.sql);
}

function dropCampaignPlayTriggers(
  db: Database.Database,
  triggerDefinitions: readonly string[],
): void {
  const triggerNames = db.prepare(`
    SELECT name, tbl_name AS tableName
    FROM sqlite_master
    WHERE type = 'trigger'
    ORDER BY name
  `).all() as Array<{ name: string; tableName: string }>;
  const tableNames = new Set<string>([
    ...CAMPAIGN_PLAY_SQLITE_TABLES,
    "campaign_worlds",
  ]);
  for (const trigger of triggerNames) {
    if (tableNames.has(trigger.tableName)) {
      db.exec(`DROP TRIGGER ${quoteSqlIdentifier(trigger.name)}`);
    }
  }
  if (triggerDefinitions.length === 0) {
    throw new Error("Campaign Play clone purge requires registered database triggers.");
  }
}

function requireCampaignIdColumn(columns: readonly TableColumn[], tableName: string): void {
  if (!columns.some((column) => column.name === "campaign_id")) {
    throw new Error(`Manifest clone table is missing campaign_id: ${tableName}`);
  }
}

async function backupSqliteDatabase(sourceDbPath: string, targetDbPath: string): Promise<void> {
  const sourceDb = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    await sourceDb.backup(targetDbPath);
  } finally {
    sourceDb.close();
  }
}

function cloneCampaignConfig(input: {
  sourceCampaignId: string;
  targetCampaignId: string;
  sourceConfigPath: string;
  targetConfigPath: string;
  name?: string;
  nameSuffix?: string;
  now: number;
}): string {
  const sourceConfig = JSON.parse(fs.readFileSync(input.sourceConfigPath, "utf-8")) as Record<string, unknown>;
  const rewritten = { ...sourceConfig };
  if (rewritten.id === input.sourceCampaignId) {
    rewritten.id = input.targetCampaignId;
  }
  const baseName = String(rewritten.name ?? "Campaign");
  rewritten.name = input.name?.trim() || (
    input.nameSuffix ? `${baseName} ${input.nameSuffix}` : `${baseName} [clean clone]`
  );
  rewritten.currentTick = 0;
  rewritten.createdAt = input.now;
  rewritten.updatedAt = input.now;
  fs.writeFileSync(input.targetConfigPath, `${JSON.stringify(rewritten, null, 2)}\n`, "utf-8");
  return String(rewritten.name);
}

function sqliteStoreTable(step: CampaignStoreManifestOperationStep): string | null {
  return step.store.startsWith("sqlite:") ? step.store.slice("sqlite:".length) : null;
}

function ensureCleanGameplayTurnRecordsCloneTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clean_gameplay_turn_records (
      record_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      internal_turn_id TEXT NOT NULL,
      public_turn_id TEXT NOT NULL,
      public_packet_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      frame_id TEXT NOT NULL,
      user_message_index INTEGER NOT NULL,
      assistant_message_index INTEGER NOT NULL,
      user_message_sha256 TEXT NOT NULL,
      assistant_message_sha256 TEXT NOT NULL,
      record_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS clean_gameplay_turn_records_campaign_turn_unique
      ON clean_gameplay_turn_records (campaign_id, internal_turn_id);
    CREATE UNIQUE INDEX IF NOT EXISTS clean_gameplay_turn_records_campaign_idempotency_unique
      ON clean_gameplay_turn_records (campaign_id, idempotency_key);
    CREATE INDEX IF NOT EXISTS idx_clean_gameplay_turn_records_campaign_public
      ON clean_gameplay_turn_records (campaign_id, public_turn_id, public_packet_id);
  `);
}

function ensureCleanGameplayStage4ReceiptsCloneTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clean_gameplay_stage4_receipts (
      receipt_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      frame_id TEXT NOT NULL,
      checklist_id TEXT NOT NULL,
      step_id TEXT NOT NULL,
      capability_id TEXT NOT NULL,
      status TEXT NOT NULL,
      base_world_version INTEGER NOT NULL,
      result_world_version INTEGER NOT NULL,
      mutation_applied INTEGER NOT NULL,
      receipt_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS clean_gameplay_stage4_receipts_campaign_step_unique
      ON clean_gameplay_stage4_receipts (campaign_id, turn_id, checklist_id, step_id);
    CREATE INDEX IF NOT EXISTS idx_clean_gameplay_stage4_receipts_campaign_turn
      ON clean_gameplay_stage4_receipts (campaign_id, turn_id);
    CREATE INDEX IF NOT EXISTS idx_clean_gameplay_stage4_receipts_campaign_result_version
      ON clean_gameplay_stage4_receipts (campaign_id, result_world_version);
  `);
}

function ensureCleanGameplayActorConditionsCloneTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clean_gameplay_actor_conditions (
      condition_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      actor_type TEXT NOT NULL,
      player_id TEXT NOT NULL,
      condition_key TEXT NOT NULL,
      condition_label TEXT NOT NULL,
      condition_group TEXT NOT NULL,
      condition_scope TEXT NOT NULL,
      anchor_location_id TEXT NOT NULL,
      anchor_scene_location_id TEXT NOT NULL,
      target_kind TEXT NOT NULL,
      target_ref TEXT,
      target_label TEXT,
      active INTEGER NOT NULL,
      applied_receipt_id TEXT,
      cleared_receipt_id TEXT,
      base_world_version INTEGER NOT NULL,
      result_world_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (actor_type = 'player'),
      CHECK (condition_scope = 'current_scene'),
      CHECK (active IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS idx_clean_actor_conditions_campaign_player_active
      ON clean_gameplay_actor_conditions (campaign_id, player_id, active);
    CREATE INDEX IF NOT EXISTS idx_clean_actor_conditions_campaign_scene_active
      ON clean_gameplay_actor_conditions (campaign_id, anchor_scene_location_id, active);
    CREATE UNIQUE INDEX IF NOT EXISTS clean_actor_conditions_active_key_unique
      ON clean_gameplay_actor_conditions (campaign_id, player_id, condition_key, condition_scope, anchor_scene_location_id)
      WHERE active = 1;
  `);
}

function ensureCleanGameplayMinorPoisCloneTable(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS clean_gameplay_minor_pois (
      poi_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      poi_ref TEXT NOT NULL,
      poi_label TEXT NOT NULL,
      poi_kind TEXT NOT NULL,
      anchor_location_id TEXT NOT NULL,
      anchor_scene_location_id TEXT NOT NULL,
      active INTEGER NOT NULL,
      applied_receipt_id TEXT,
      base_world_version INTEGER NOT NULL,
      result_world_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      CHECK (active IN (0, 1))
    );
    CREATE INDEX IF NOT EXISTS idx_clean_minor_pois_campaign_scene_active
      ON clean_gameplay_minor_pois (campaign_id, anchor_scene_location_id, active);
    CREATE UNIQUE INDEX IF NOT EXISTS clean_minor_pois_active_ref_unique
      ON clean_gameplay_minor_pois (campaign_id, anchor_scene_location_id, poi_ref)
      WHERE active = 1;
  `);
}

function applySqliteClonePlan(input: {
  dbPath: string;
  plan: CampaignStoreManifestOperationPlan;
  sourceCampaignId: string;
  targetCampaignId: string;
  cloneName: string;
  now: number;
  acceptedCloneSource: AcceptedCloneSource;
}): Pick<CleanStartCampaignCloneResult, "rewrittenTables" | "purgedTables" | "scrubbedTextColumns"> {
  const db = new Database(input.dbPath);
  const rewrittenTables: string[] = [];
  const purgedTables: string[] = [];
  const scrubbedTextColumns: string[] = [];
  const sqliteSteps = input.plan.steps
    .map((step) => ({ step, tableName: sqliteStoreTable(step) }))
    .filter((entry): entry is { step: CampaignStoreManifestOperationStep; tableName: string } =>
      entry.tableName !== null,
    );
  const optionalTables = new Set<string>(CAMPAIGN_OPTIONAL_SQLITE_TABLES);
  const campaignPlayTriggerDefinitions = readCampaignPlayTriggerDefinitions(db);

  try {
    db.pragma("foreign_keys = OFF");
    ensureCleanGameplayTurnRecordsCloneTable(db);
    ensureCleanGameplayStage4ReceiptsCloneTable(db);
    ensureCleanGameplayActorConditionsCloneTable(db);
    ensureCleanGameplayMinorPoisCloneTable(db);
    const applyPlan = db.transaction(() => {
      dropCampaignPlayTriggers(db, campaignPlayTriggerDefinitions);
      for (const { step, tableName } of sqliteSteps) {
        if (!tableExists(db, tableName)) {
          if (optionalTables.has(tableName)) continue;
          throw new Error(`Manifest clone source database is missing table: ${tableName}`);
        }
        const table = quoteSqlIdentifier(tableName);
        const columns = readTableColumns(db, tableName);

        if (step.action === "purge") {
          const result = db.prepare(`DELETE FROM ${table}`).run();
          if (result.changes > 0) purgedTables.push(tableName);
          continue;
        }

        if (step.action !== "rewrite") {
          throw new Error(`Unsupported sqlite clone action ${step.action} for ${step.store}.`);
        }

        if (tableName === "campaigns") {
          const result = db
            .prepare("UPDATE campaigns SET id = ?, name = ?, created_at = ?, updated_at = ? WHERE id = ?")
            .run(
              input.targetCampaignId,
              input.cloneName,
              input.now,
              input.now,
              input.sourceCampaignId,
            );
          if (result.changes > 0) rewrittenTables.push(tableName);
        } else if (tableName === "world_clocks") {
          const result = db
            .prepare(`
              UPDATE world_clocks
              SET campaign_id = ?, world_version = 0, world_time_minutes = 0, current_tick = 0, updated_at = ?
              WHERE campaign_id = ?
            `)
            .run(input.targetCampaignId, input.now, input.sourceCampaignId);
          if (result.changes > 0) rewrittenTables.push(tableName);
        } else {
          requireCampaignIdColumn(columns, tableName);
          const result = db
            .prepare(`UPDATE ${table} SET campaign_id = ? WHERE campaign_id = ?`)
            .run(input.targetCampaignId, input.sourceCampaignId);
          if (result.changes > 0) rewrittenTables.push(tableName);
        }

      }
      const childSourceSnapshotJson = JSON.stringify({
        campaignId: input.targetCampaignId,
        ...input.acceptedCloneSource.review.source,
        sourceDigest: input.acceptedCloneSource.review.sourceDigest,
      });
      const childAcceptedSnapshotJson = serializeAcceptedCampaignWorldReview({
        ...input.acceptedCloneSource.review,
        campaignId: input.targetCampaignId,
      });
      const acceptedSnapshotUpdate = db.prepare(`
        UPDATE campaign_worlds
        SET source_snapshot_json = ?, accepted_snapshot_json = ?
        WHERE campaign_id = ?
      `).run(childSourceSnapshotJson, childAcceptedSnapshotJson, input.targetCampaignId);
      if (acceptedSnapshotUpdate.changes !== 1) {
        throw new Error("Clean-start clone could not rewrite accepted Campaign World provenance.");
      }
      scrubbedTextColumns.push("campaign_worlds.source_snapshot_json");
      for (const triggerDefinition of campaignPlayTriggerDefinitions) {
        db.exec(triggerDefinition);
      }
    });

    applyPlan();

    assertSingleCampaignDatabase(db, input.targetCampaignId);

    const violations = db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`Clean-start clone created ${violations.length} foreign-key violation(s).`);
    }
    db.pragma("wal_checkpoint(TRUNCATE)");
    return { rewrittenTables, purgedTables, scrubbedTextColumns };
  } finally {
    db.pragma("foreign_keys = ON");
    db.close();
  }
}

function requireCloneStepAction(
  step: CampaignStoreManifestOperationStep,
  expectedAction: string,
): void {
  if (step.action !== expectedAction) {
    throw new Error(
      `Unsupported clean-start clone action ${step.action} for ${step.store}; expected ${expectedAction}.`,
    );
  }
}

function targetPathForArtifactStore(targetDir: string, store: string): string | null {
  switch (store) {
    case "artifact:checkpoints":
      return path.join(targetDir, "checkpoints");
    case "artifact:images":
      return path.join(targetDir, "images");
    case "artifact:turn_boundaries":
      return path.join(targetDir, ".turn-boundaries");
    default:
      return null;
  }
}

export function executeCampaignFilesystemClonePlan(input: {
  targetDir: string;
  plan: CampaignStoreManifestOperationPlan;
  configAlreadyRewritten: boolean;
}): CampaignFilesystemCloneAction[] {
  if (input.plan.mode !== "clean_start_clone") {
    throw new Error(`Filesystem clone execution only supports clean_start_clone, got ${input.plan.mode}.`);
  }

  const actions: CampaignFilesystemCloneAction[] = [];
  const nonSqlSteps = input.plan.steps.filter((step) => !step.store.startsWith("sqlite:"));
  for (const step of nonSqlSteps) {
    if (step.store === "json:config") {
      requireCloneStepAction(step, "rewrite");
      if (!input.configAlreadyRewritten) {
        throw new Error("Clean-start clone config step was not executed before filesystem plan.");
      }
      actions.push({
        store: step.store,
        action: step.action,
        targetPath: path.join(input.targetDir, "config.json"),
        note: "Config ownership and clean-start fields were rewritten before filesystem plan execution.",
      });
      continue;
    }

    if (step.store === "json:chat_history") {
      requireCloneStepAction(step, "purge");
      const chatPath = path.join(input.targetDir, "chat_history.json");
      fs.writeFileSync(chatPath, "[]\n", "utf-8");
      actions.push({
        store: step.store,
        action: step.action,
        targetPath: chatPath,
        note: "Chat history is reset for clean-start clone.",
      });
      continue;
    }

    if (step.store === "vectors:episodic_events" || step.store === "vectors:lore_cards") {
      requireCloneStepAction(step, "rebuild");
      const vectorsDir = path.join(input.targetDir, "vectors");
      const tableName = step.store === "vectors:episodic_events" ? "episodic_events" : "lore_cards";
      fs.mkdirSync(vectorsDir, { recursive: true });
      fs.rmSync(path.join(vectorsDir, `${tableName}.lance`), { recursive: true, force: true });
      actions.push({
        store: step.store,
        action: step.action,
        targetPath: path.join(vectorsDir, `${tableName}.lance`),
        note: "Vector table is rebuilt from an empty clean-start clone state.",
      });
      continue;
    }

    if (step.store === "artifact:checkpoints"
      || step.store === "artifact:images"
      || step.store === "artifact:turn_boundaries") {
      requireCloneStepAction(step, "reject");
      const targetPath = targetPathForArtifactStore(input.targetDir, step.store);
      if (!targetPath) {
        throw new Error(`No target path mapped for clone artifact store ${step.store}.`);
      }
      fs.rmSync(targetPath, { recursive: true, force: true });
      actions.push({
        store: step.store,
        action: step.action,
        targetPath,
        note: "Source artifact store is rejected for clean-start clone.",
      });
      continue;
    }

    if (step.store === "projection:public_dtos") {
      requireCloneStepAction(step, "rebuild");
      actions.push({
        store: step.store,
        action: step.action,
        targetPath: null,
        note: "Public DTO projection is derived and rebuilt on demand.",
      });
      continue;
    }

    if (step.store === "evidence:playtest_reports") {
      requireCloneStepAction(step, "reject");
      actions.push({
        store: step.store,
        action: step.action,
        targetPath: null,
        note: "Playtest evidence is not copied into gameplay clone state.",
      });
      continue;
    }

    throw new Error(`Unsupported non-SQL clean-start clone store: ${step.store}.`);
  }

  return actions;
}

function writeCleanStartCloneManifest(
  targetDir: string,
  manifest: CleanStartCampaignCloneManifest,
): void {
  fs.writeFileSync(
    path.join(targetDir, CAMPAIGN_CLONE_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8",
  );
}

export async function cloneCampaignCleanStart(
  options: CleanStartCampaignCloneOptions,
): Promise<CleanStartCampaignCloneResult> {
  assertSafeId(options.sourceCampaignId);
  const targetCampaignId = options.targetCampaignId ?? randomUUID();
  assertSafeId(targetCampaignId);
  const mode = options.mode ?? "clean_start";

  if (mode === "replay_preserving") {
    planCampaignStoreManifestOperation({ mode: "replay_preserving_clone" });
    throw new Error("Replay-preserving campaign clone is unavailable.");
  }

  if (hasAnyActiveTurn()) {
    throw new AppError("Cannot clone a campaign while a turn is active.", 409);
  }

  const sourceDir = getCampaignDir(options.sourceCampaignId);
  const targetDir = getCampaignDir(targetCampaignId);
  const sourceDbPath = path.join(sourceDir, "state.db");
  const targetDbPath = path.join(targetDir, "state.db");
  const sourceConfigPath = getCampaignConfigPath(options.sourceCampaignId);
  const targetConfigPath = path.join(targetDir, "config.json");
  const plan = planCampaignStoreManifestOperation({ mode: "clean_start_clone" });

  if (!fs.existsSync(sourceDir)) {
    throw new AppError("Source campaign not found.", 404);
  }
  if (!fs.existsSync(sourceDbPath)) {
    throw new Error(`Source campaign state database is missing: ${sourceDbPath}`);
  }
  if (!fs.existsSync(sourceConfigPath)) {
    throw new Error(`Source campaign config is missing: ${sourceConfigPath}`);
  }
  let acceptedCloneSource: AcceptedCloneSource;
  const sourceDb = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    assertSingleCampaignDatabase(sourceDb, options.sourceCampaignId);
    acceptedCloneSource = readAcceptedCloneSource(sourceDb, options.sourceCampaignId);
    assertCloneBeforeCharacterBootstrap(sourceDb, options.sourceCampaignId);
  } finally {
    sourceDb.close();
  }
  const cloneOperationId = options.cloneOperationId ?? randomUUID();
  assertSafeId(cloneOperationId);
  const lineage: CampaignCloneLineage = {
    cloneOperationId,
    parentCampaignId: options.sourceCampaignId,
    parentAcceptedSnapshotHash: sha256(acceptedCloneSource.acceptedSnapshotJson),
    sourceDigest: acceptedCloneSource.review.sourceDigest,
    childCampaignId: targetCampaignId,
  };

  let ownsTargetDirectory = false;
  try {
    fs.mkdirSync(targetDir);
    ownsTargetDirectory = true;
  } catch (error) {
    if (
      typeof error === "object" && error !== null && "code" in error &&
      (error as NodeJS.ErrnoException).code === "EEXIST"
    ) {
      throw new Error(`Clone target already exists: ${targetDir}`);
    }
    throw error;
  }
  try {
    await backupSqliteDatabase(sourceDbPath, targetDbPath);
    const targetBackupDb = new Database(targetDbPath, { readonly: true, fileMustExist: true });
    try {
      assertSingleCampaignDatabase(targetBackupDb, options.sourceCampaignId);
      const targetBackupSource = readAcceptedCloneSource(
        targetBackupDb,
        options.sourceCampaignId,
      );
      assertCloneBeforeCharacterBootstrap(targetBackupDb, options.sourceCampaignId);
      if (
        targetBackupSource.acceptedSnapshotJson !== acceptedCloneSource.acceptedSnapshotJson ||
        targetBackupSource.review.sourceDigest !== acceptedCloneSource.review.sourceDigest
      ) {
        throw new Error("Campaign clone backup provenance changed during capture.");
      }
    } finally {
      targetBackupDb.close();
    }
    const now = options.now ?? Date.now();
    const cloneName = cloneCampaignConfig({
      sourceCampaignId: options.sourceCampaignId,
      targetCampaignId,
      sourceConfigPath,
      targetConfigPath,
      name: options.name,
      nameSuffix: options.nameSuffix,
      now,
    });
    const filesystemActions = executeCampaignFilesystemClonePlan({
      targetDir,
      plan,
      configAlreadyRewritten: true,
    });
    const sqliteResult = applySqliteClonePlan({
      dbPath: targetDbPath,
      plan,
      sourceCampaignId: options.sourceCampaignId,
      targetCampaignId,
      cloneName,
      now,
      acceptedCloneSource,
    });

    const childDb = new Database(targetDbPath, { readonly: true, fileMustExist: true });
    try {
      assertSingleCampaignDatabase(childDb, targetCampaignId);
      const childAccepted = readAcceptedCloneSource(childDb, targetCampaignId);
      if (
        childAccepted.review.sourceDigest !== acceptedCloneSource.review.sourceDigest ||
        childAccepted.acceptedWorldVersion !== acceptedCloneSource.acceptedWorldVersion ||
        childAccepted.acceptedContentHash !== acceptedCloneSource.acceptedContentHash
      ) {
        throw new Error("Campaign clone child accepted provenance does not match its parent.");
      }
      const currentWorld = childDb.prepare(`
        SELECT source_digest AS sourceDigest, source_snapshot_json AS sourceSnapshotJson,
          content_hash AS contentHash
        FROM campaign_worlds
        WHERE campaign_id = ?
      `).get(targetCampaignId) as {
        sourceDigest: string;
        sourceSnapshotJson: string;
        contentHash: string;
      };
      const expectedSourceSnapshotJson = JSON.stringify({
        campaignId: targetCampaignId,
        ...childAccepted.review.source,
        sourceDigest: childAccepted.review.sourceDigest,
      });
      const calculatedSourceDigest = calculateCampaignWorldSourceDigest(childAccepted.review.source);
      const calculatedContentHash = calculateCampaignWorldContentHash(
        calculatedSourceDigest,
        childAccepted.review,
      );
      if (
        currentWorld.sourceSnapshotJson !== expectedSourceSnapshotJson ||
        currentWorld.sourceDigest !== calculatedSourceDigest ||
        currentWorld.contentHash !== calculatedContentHash
      ) {
        throw new Error("Campaign clone child current World provenance does not match its accepted snapshot.");
      }
      for (const tableName of CAMPAIGN_PLAY_SQLITE_TABLES) {
        const table = quoteSqlIdentifier(tableName);
        const row = childDb.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number };
        if (row.count !== 0) {
          throw new Error(`Campaign clone child retained Campaign Play rows in ${tableName}.`);
        }
      }
    } finally {
      childDb.close();
    }

    const result: CleanStartCampaignCloneResult = {
      mode: "clean_start",
      sourceCampaignId: options.sourceCampaignId,
      targetCampaignId,
      sourceDir,
      targetDir,
      cloneManifestPath: path.join(targetDir, CAMPAIGN_CLONE_MANIFEST_FILENAME),
      lineage,
      plan,
      ...sqliteResult,
      filesystemActions,
    };
    writeCleanStartCloneManifest(targetDir, {
      schemaVersion: 2,
      clonedAt: now,
      ...result,
    });
    return result;
  } catch (error) {
    if (ownsTargetDirectory) {
      fs.rmSync(targetDir, { recursive: true, force: true });
    }
    throw error;
  }
}
