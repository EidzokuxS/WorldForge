import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { AppError } from "../lib/index.js";
import { assertSafeId, getCampaignConfigPath, getCampaignDir } from "./paths.js";
import { hasAnyActiveTurn } from "./runtime-state.js";
import {
  planCampaignStoreManifestOperation,
  type CampaignStoreManifestOperationPlan,
  type CampaignStoreManifestOperationStep,
} from "./store-manifest-executor.js";

export const CAMPAIGN_CLONE_MANIFEST_FILENAME = "clone-manifest.json";

export interface CleanStartCampaignCloneOptions {
  sourceCampaignId: string;
  targetCampaignId?: string;
  name?: string;
  nameSuffix?: string;
  now?: number;
  mode?: "clean_start" | "replay_preserving";
}

export interface CleanStartCampaignCloneResult {
  mode: "clean_start";
  sourceCampaignId: string;
  targetCampaignId: string;
  sourceDir: string;
  targetDir: string;
  cloneManifestPath: string;
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
  schemaVersion: 1;
  clonedAt: number;
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

function requireCampaignIdColumn(columns: readonly TableColumn[], tableName: string): void {
  if (!columns.some((column) => column.name === "campaign_id")) {
    throw new Error(`Manifest clone table is missing campaign_id: ${tableName}`);
  }
}

function textColumns(columns: readonly TableColumn[]): string[] {
  return columns
    .filter((column) => column.type.toLocaleUpperCase("en-US").includes("TEXT"))
    .map((column) => column.name);
}

async function backupSqliteDatabase(sourceDbPath: string, targetDbPath: string): Promise<void> {
  const sourceDb = new Database(sourceDbPath, { readonly: true, fileMustExist: true });
  try {
    await sourceDb.backup(targetDbPath);
  } finally {
    sourceDb.close();
  }
}

function rewriteCampaignIdInValue(value: unknown, sourceCampaignId: string, targetCampaignId: string): unknown {
  if (typeof value === "string") {
    return value.includes(sourceCampaignId)
      ? value.replaceAll(sourceCampaignId, targetCampaignId)
      : value;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => rewriteCampaignIdInValue(entry, sourceCampaignId, targetCampaignId));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key.includes(sourceCampaignId) ? key.replaceAll(sourceCampaignId, targetCampaignId) : key,
        rewriteCampaignIdInValue(entry, sourceCampaignId, targetCampaignId),
      ]),
    );
  }
  return value;
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
  const rewritten = rewriteCampaignIdInValue(
    sourceConfig,
    input.sourceCampaignId,
    input.targetCampaignId,
  ) as Record<string, unknown>;
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

function ensureGameplayCycleV2PacketCloneTable(db: Database.Database): void {
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
    CREATE INDEX IF NOT EXISTS idx_gameplay_cycle_v2_packets_campaign_turn
      ON gameplay_cycle_v2_packets (campaign_id, turn_id);
    CREATE INDEX IF NOT EXISTS idx_gameplay_cycle_v2_packets_status
      ON gameplay_cycle_v2_packets (campaign_id, status, narrator_attempt_status);
  `);
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

function applySqliteClonePlan(input: {
  dbPath: string;
  plan: CampaignStoreManifestOperationPlan;
  sourceCampaignId: string;
  targetCampaignId: string;
  cloneName: string;
  now: number;
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

  try {
    db.pragma("foreign_keys = OFF");
    ensureGameplayCycleV2PacketCloneTable(db);
    ensureCleanGameplayTurnRecordsCloneTable(db);
    const applyPlan = db.transaction(() => {
      for (const { step, tableName } of sqliteSteps) {
        if (!tableExists(db, tableName)) {
          throw new Error(`Manifest clone source database is missing table: ${tableName}`);
        }
        const table = quoteSqlIdentifier(tableName);
        const columns = readTableColumns(db, tableName);

        if (step.action === "purge") {
          requireCampaignIdColumn(columns, tableName);
          const result = db.prepare(`DELETE FROM ${table} WHERE campaign_id = ?`).run(input.sourceCampaignId);
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

        for (const columnName of textColumns(columns)) {
          const column = quoteSqlIdentifier(columnName);
          const result = db
            .prepare(`UPDATE ${table} SET ${column} = replace(${column}, ?, ?) WHERE ${column} LIKE ?`)
            .run(input.sourceCampaignId, input.targetCampaignId, `%${input.sourceCampaignId}%`);
          if (result.changes > 0) {
            scrubbedTextColumns.push(`${tableName}.${columnName}`);
          }
        }
      }
    });

    applyPlan();

    const sourceResidue = findSourceCampaignIdResidue(db, sqliteSteps, input.sourceCampaignId);
    if (sourceResidue) {
      throw new Error(`Clean-start clone left source campaign id in ${sourceResidue}.`);
    }

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

function findSourceCampaignIdResidue(
  db: Database.Database,
  sqliteSteps: readonly { step: CampaignStoreManifestOperationStep; tableName: string }[],
  sourceCampaignId: string,
): string | null {
  for (const { tableName } of sqliteSteps) {
    const table = quoteSqlIdentifier(tableName);
    for (const columnName of textColumns(readTableColumns(db, tableName))) {
      const column = quoteSqlIdentifier(columnName);
      const row = db
        .prepare(`SELECT 1 AS found FROM ${table} WHERE ${column} LIKE ? LIMIT 1`)
        .get(`%${sourceCampaignId}%`) as { found?: number } | undefined;
      if (row?.found) {
        return `${tableName}.${columnName}`;
      }
    }
  }
  return null;
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
        note: "Config JSON was recursively rewritten before filesystem plan execution.",
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
    throw new Error("Replay-preserving clone is not implemented for Phase 95 clean-start clone.");
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
  if (fs.existsSync(targetDir)) {
    throw new Error(`Clone target already exists: ${targetDir}`);
  }

  fs.mkdirSync(targetDir, { recursive: true });
  try {
    await backupSqliteDatabase(sourceDbPath, targetDbPath);
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
    });

    const result: CleanStartCampaignCloneResult = {
      mode: "clean_start",
      sourceCampaignId: options.sourceCampaignId,
      targetCampaignId,
      sourceDir,
      targetDir,
      cloneManifestPath: path.join(targetDir, CAMPAIGN_CLONE_MANIFEST_FILENAME),
      plan,
      ...sqliteResult,
      filesystemActions,
    };
    writeCleanStartCloneManifest(targetDir, {
      schemaVersion: 1,
      clonedAt: now,
      ...result,
    });
    return result;
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}
