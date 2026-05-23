import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";

export const CLEAN_START_CLONE_DROPPED_DIRS = ["checkpoints", ".turn-boundaries", "vectors"] as const;

const CLEAN_START_CLONE_IGNORED_TABLES = new Set([
  "__drizzle_migrations",
  "sqlite_sequence",
]);

const CLEAN_START_CLONE_PRESERVED_WORLD_TABLES = new Set([
  "campaigns",
  "locations",
  "location_edges",
  "players",
  "npcs",
  "items",
  "factions",
  "faction_command_nodes",
  "faction_resources",
  "faction_reports",
  "faction_operations",
  "faction_resource_ledger",
  "world_threads",
  "world_thread_events",
  "relationships",
  "actor_knowledge_records",
  "world_clocks",
]);

const CLEAN_START_CLONE_CLEARED_RUNTIME_TABLES = [
  "location_recent_events",
  "chronicle",
  "simulation_jobs",
  "simulation_proposals",
  "actor_process_states",
  "actor_wake_signals",
  "authority_traces",
  "turn_saga_events",
  "turn_sagas",
  "oracle_decisions",
  "settled_turn_packets",
  "turn_durable_events",
  "quick_action_offers",
  "narrator_attempts",
] as const;

interface SqliteTableInfo {
  name: string;
}

interface SqliteColumnInfo {
  name: string;
  type: string;
}

interface SourceReferenceIssue {
  table: string;
  column: string;
  rowid: number | string;
}

export interface CleanStartClonePolicyManifest {
  version: 1;
  kind: "clean-start";
  sourceCampaignId: string;
  targetCampaignId: string;
  routeId?: string | null;
  droppedDirs: readonly string[];
  clearedRuntimeTables: string[];
  updatedTables: string[];
  scrubbedTextColumns: string[];
}

export interface ApplyCleanStartClonePolicyInput {
  targetDir: string;
  sourceCampaignId: string;
  targetCampaignId: string;
  routeId?: string | null;
}

function writeJson(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}

function quoteSqlIdentifier(value: string): string {
  return `"${value.split('"').join('""')}"`;
}

function tableExists(tables: readonly SqliteTableInfo[], tableName: string): boolean {
  return tables.some((table) => table.name === tableName);
}

function classifyTables(tables: readonly SqliteTableInfo[]): void {
  const clearedRuntimeTables = new Set<string>(CLEAN_START_CLONE_CLEARED_RUNTIME_TABLES);
  const unknownTables = tables
    .map((table) => table.name)
    .filter((tableName) => !CLEAN_START_CLONE_IGNORED_TABLES.has(tableName))
    .filter((tableName) => !CLEAN_START_CLONE_PRESERVED_WORLD_TABLES.has(tableName))
    .filter((tableName) => !clearedRuntimeTables.has(tableName));
  if (unknownTables.length > 0) {
    throw new Error(
      `Clean-start clone policy has no table classification for: ${unknownTables.join(", ")}.`,
    );
  }
}

function isTextColumn(column: SqliteColumnInfo): boolean {
  return column.type.toUpperCase().includes("TEXT");
}

function jsonCandidate(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function rewriteJsonValue(
  value: unknown,
  sourceCampaignId: string,
  targetCampaignId: string,
): { value: unknown; changed: boolean; unresolved: boolean } {
  if (typeof value === "string") {
    if (value === sourceCampaignId) {
      return { value: targetCampaignId, changed: true, unresolved: false };
    }
    return {
      value,
      changed: false,
      unresolved: value.includes(sourceCampaignId),
    };
  }
  if (Array.isArray(value)) {
    let changed = false;
    let unresolved = false;
    const next = value.map((item) => {
      const result = rewriteJsonValue(item, sourceCampaignId, targetCampaignId);
      changed = changed || result.changed;
      unresolved = unresolved || result.unresolved;
      return result.value;
    });
    return { value: next, changed, unresolved };
  }
  if (value && typeof value === "object") {
    let changed = false;
    let unresolved = false;
    const next: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      const nextKey = key === sourceCampaignId ? targetCampaignId : key;
      if (key !== sourceCampaignId && key.includes(sourceCampaignId)) {
        unresolved = true;
      }
      const childResult = rewriteJsonValue(child, sourceCampaignId, targetCampaignId);
      changed = changed || childResult.changed || nextKey !== key;
      unresolved = unresolved || childResult.unresolved;
      next[nextKey] = childResult.value;
    }
    return { value: next, changed, unresolved };
  }
  return { value, changed: false, unresolved: false };
}

function rewriteTextValue(
  value: string,
  sourceCampaignId: string,
  targetCampaignId: string,
): { value: string; changed: boolean; unresolved: boolean } {
  if (value === sourceCampaignId) {
    return { value: targetCampaignId, changed: true, unresolved: false };
  }
  if (!value.includes(sourceCampaignId)) {
    return { value, changed: false, unresolved: false };
  }
  if (!jsonCandidate(value)) {
    return { value, changed: false, unresolved: true };
  }
  try {
    const parsed = JSON.parse(value) as unknown;
    const result = rewriteJsonValue(parsed, sourceCampaignId, targetCampaignId);
    if (result.unresolved) {
      return { value, changed: false, unresolved: true };
    }
    return {
      value: result.changed ? JSON.stringify(result.value) : value,
      changed: result.changed,
      unresolved: false,
    };
  } catch {
    return { value, changed: false, unresolved: true };
  }
}

function rewriteConfigJson(input: {
  targetDir: string;
  sourceCampaignId: string;
  targetCampaignId: string;
}): void {
  const configPath = join(input.targetDir, "config.json");
  if (!existsSync(configPath)) return;
  const config = JSON.parse(readFileSync(configPath, "utf-8")) as unknown;
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`Clean-start clone policy found invalid config.json in ${input.targetDir}.`);
  }

  const rewritten = rewriteJsonValue(
    config,
    input.sourceCampaignId,
    input.targetCampaignId,
  );
  if (rewritten.unresolved) {
    throw new Error("Clean-start clone policy found unresolved source campaign id references in config.json.");
  }
  const nextConfig = rewritten.value as Record<string, unknown>;
  if (nextConfig.id === undefined || nextConfig.id === null) {
    nextConfig.id = input.targetCampaignId;
  }
  if (nextConfig.id !== input.targetCampaignId) {
    throw new Error(
      `Clean-start clone config identity mismatch: expected ${input.targetCampaignId}, got ${String(nextConfig.id)}.`,
    );
  }
  if (rewritten.changed || (config as Record<string, unknown>).id !== nextConfig.id) {
    writeJson(configPath, nextConfig);
  }
}

function clearCloneRuntimeTables(
  db: Database.Database,
  tables: readonly SqliteTableInfo[],
): string[] {
  const clearedTables: string[] = [];
  for (const table of CLEAN_START_CLONE_CLEARED_RUNTIME_TABLES) {
    if (!tableExists(tables, table)) continue;
    db.prepare(`DELETE FROM ${quoteSqlIdentifier(table)}`).run();
    clearedTables.push(table);
  }
  return clearedTables;
}

function scrubSourceCampaignIdFromPreservedTables(input: {
  db: Database.Database;
  tables: readonly SqliteTableInfo[];
  sourceCampaignId: string;
  targetCampaignId: string;
}): string[] {
  const scrubbedColumns = new Set<string>();
  const issues: SourceReferenceIssue[] = [];

  for (const table of input.tables) {
    if (!CLEAN_START_CLONE_PRESERVED_WORLD_TABLES.has(table.name)) continue;
    const tableName = quoteSqlIdentifier(table.name);
    const columns = input.db.prepare(`PRAGMA table_info(${tableName})`).all() as SqliteColumnInfo[];
    const textColumns = columns.filter(isTextColumn);
    if (textColumns.length === 0) continue;
    const selectColumns = textColumns
      .map((column) => quoteSqlIdentifier(column.name))
      .join(", ");
    const rows = input.db
      .prepare(`SELECT rowid as __rowid, ${selectColumns} FROM ${tableName}`)
      .all() as Array<Record<string, unknown>>;

    for (const row of rows) {
      const rowid = row.__rowid as number | string;
      for (const column of textColumns) {
        const value = row[column.name];
        if (typeof value !== "string" || !value.includes(input.sourceCampaignId)) {
          continue;
        }
        const rewrite = rewriteTextValue(
          value,
          input.sourceCampaignId,
          input.targetCampaignId,
        );
        if (rewrite.unresolved) {
          issues.push({ table: table.name, column: column.name, rowid });
          continue;
        }
        if (!rewrite.changed) continue;
        input.db
          .prepare(`UPDATE ${tableName} SET ${quoteSqlIdentifier(column.name)} = ? WHERE rowid = ?`)
          .run(rewrite.value, rowid);
        scrubbedColumns.add(`${table.name}.${column.name}`);
      }
    }
  }

  if (issues.length > 0) {
    throw new Error(
      `Clean-start clone policy found unresolved source campaign id references: ${
        issues.map((issue) => `${issue.table}.${issue.column}#${issue.rowid}`).join(", ")
      }.`,
    );
  }

  return [...scrubbedColumns].sort();
}

function assertNoSourceCampaignIdReferences(input: {
  db: Database.Database;
  tables: readonly SqliteTableInfo[];
  sourceCampaignId: string;
}): void {
  const issues: SourceReferenceIssue[] = [];
  for (const table of input.tables) {
    if (CLEAN_START_CLONE_IGNORED_TABLES.has(table.name)) continue;
    const tableName = quoteSqlIdentifier(table.name);
    const columns = input.db.prepare(`PRAGMA table_info(${tableName})`).all() as SqliteColumnInfo[];
    const textColumns = columns.filter(isTextColumn);
    if (textColumns.length === 0) continue;
    const selectColumns = textColumns
      .map((column) => quoteSqlIdentifier(column.name))
      .join(", ");
    const rows = input.db
      .prepare(`SELECT rowid as __rowid, ${selectColumns} FROM ${tableName}`)
      .all() as Array<Record<string, unknown>>;
    for (const row of rows) {
      const rowid = row.__rowid as number | string;
      for (const column of textColumns) {
        const value = row[column.name];
        if (typeof value === "string" && value.includes(input.sourceCampaignId)) {
          issues.push({ table: table.name, column: column.name, rowid });
        }
      }
    }
  }
  if (issues.length > 0) {
    throw new Error(
      `Clean-start clone policy left source campaign id references: ${
        issues.map((issue) => `${issue.table}.${issue.column}#${issue.rowid}`).join(", ")
      }.`,
    );
  }
}

function rewriteCampaignIdInDatabase(input: {
  stateDbPath: string;
  sourceCampaignId: string;
  targetCampaignId: string;
}): Pick<CleanStartClonePolicyManifest, "updatedTables" | "clearedRuntimeTables" | "scrubbedTextColumns"> {
  const db = new Database(input.stateDbPath);
  const updatedTables = new Set<string>();
  let clearedRuntimeTables: string[] = [];
  let scrubbedTextColumns: string[] = [];
  try {
    db.pragma("foreign_keys = OFF");
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as SqliteTableInfo[];
    classifyTables(tables);
    const rewrite = db.transaction(() => {
      if (tableExists(tables, "campaigns")) {
        const result = db.prepare("UPDATE campaigns SET id = ?, updated_at = ? WHERE id = ?")
          .run(input.targetCampaignId, Date.now(), input.sourceCampaignId);
        if (result.changes > 0) updatedTables.add("campaigns");
      }
      for (const table of tables) {
        const tableName = quoteSqlIdentifier(table.name);
        const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as SqliteColumnInfo[];
        if (!columns.some((column) => column.name === "campaign_id")) continue;
        const result = db.prepare(`UPDATE ${tableName} SET campaign_id = ? WHERE campaign_id = ?`)
          .run(input.targetCampaignId, input.sourceCampaignId);
        if (result.changes > 0) updatedTables.add(table.name);
      }
      clearedRuntimeTables = clearCloneRuntimeTables(db, tables);
      scrubbedTextColumns = scrubSourceCampaignIdFromPreservedTables({
        db,
        tables,
        sourceCampaignId: input.sourceCampaignId,
        targetCampaignId: input.targetCampaignId,
      });
      assertNoSourceCampaignIdReferences({
        db,
        tables,
        sourceCampaignId: input.sourceCampaignId,
      });
    });
    rewrite();
    const violations = db.pragma("foreign_key_check") as unknown[];
    if (violations.length > 0) {
      throw new Error(`Campaign clone created ${violations.length} foreign-key violation(s).`);
    }
    db.pragma("wal_checkpoint(TRUNCATE)");
    return {
      updatedTables: [...updatedTables].sort(),
      clearedRuntimeTables,
      scrubbedTextColumns,
    };
  } finally {
    db.pragma("foreign_keys = ON");
    db.close();
  }
}

export function applyCleanStartClonePolicy(
  input: ApplyCleanStartClonePolicyInput,
): CleanStartClonePolicyManifest {
  for (const dirName of CLEAN_START_CLONE_DROPPED_DIRS) {
    rmSync(join(input.targetDir, dirName), { recursive: true, force: true });
  }
  rewriteConfigJson(input);
  writeJson(join(input.targetDir, "chat_history.json"), []);

  const rewriteResult = rewriteCampaignIdInDatabase({
    stateDbPath: join(input.targetDir, "state.db"),
    sourceCampaignId: input.sourceCampaignId,
    targetCampaignId: input.targetCampaignId,
  });
  const manifest: CleanStartClonePolicyManifest = {
    version: 1,
    kind: "clean-start",
    sourceCampaignId: input.sourceCampaignId,
    targetCampaignId: input.targetCampaignId,
    routeId: input.routeId ?? null,
    droppedDirs: CLEAN_START_CLONE_DROPPED_DIRS,
    clearedRuntimeTables: rewriteResult.clearedRuntimeTables,
    updatedTables: rewriteResult.updatedTables,
    scrubbedTextColumns: rewriteResult.scrubbedTextColumns,
  };
  writeJson(join(input.targetDir, "clone_policy.json"), manifest);
  if (!existsSync(join(input.targetDir, "state.db"))) {
    throw new Error(`Clean-start clone policy lost state.db in ${input.targetDir}.`);
  }
  return manifest;
}
