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

export interface CleanStartCampaignCloneOptions {
  sourceCampaignId: string;
  targetCampaignId?: string;
  name?: string;
  nameSuffix?: string;
  now?: number;
}

export interface CleanStartCampaignCloneResult {
  sourceCampaignId: string;
  targetCampaignId: string;
  sourceDir: string;
  targetDir: string;
  plan: CampaignStoreManifestOperationPlan;
  rewrittenTables: string[];
  purgedTables: string[];
  scrubbedTextColumns: string[];
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
        key,
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
  rewritten.createdAt = input.now;
  rewritten.updatedAt = input.now;
  fs.writeFileSync(input.targetConfigPath, `${JSON.stringify(rewritten, null, 2)}\n`, "utf-8");
  return String(rewritten.name);
}

function sqliteStoreTable(step: CampaignStoreManifestOperationStep): string | null {
  return step.store.startsWith("sqlite:") ? step.store.slice("sqlite:".length) : null;
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

function applyFilesystemClonePlan(targetDir: string): void {
  fs.writeFileSync(path.join(targetDir, "chat_history.json"), "[]\n", "utf-8");
  fs.mkdirSync(path.join(targetDir, "vectors"), { recursive: true });
  for (const rejectedPath of ["checkpoints", ".turn-boundaries", "images"]) {
    fs.rmSync(path.join(targetDir, rejectedPath), { recursive: true, force: true });
  }
}

export async function cloneCampaignCleanStart(
  options: CleanStartCampaignCloneOptions,
): Promise<CleanStartCampaignCloneResult> {
  assertSafeId(options.sourceCampaignId);
  const targetCampaignId = options.targetCampaignId ?? randomUUID();
  assertSafeId(targetCampaignId);

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
    applyFilesystemClonePlan(targetDir);
    const sqliteResult = applySqliteClonePlan({
      dbPath: targetDbPath,
      plan,
      sourceCampaignId: options.sourceCampaignId,
      targetCampaignId,
      cloneName,
      now,
    });

    return {
      sourceCampaignId: options.sourceCampaignId,
      targetCampaignId,
      sourceDir,
      targetDir,
      plan,
      ...sqliteResult,
    };
  } catch (error) {
    fs.rmSync(targetDir, { recursive: true, force: true });
    throw error;
  }
}
