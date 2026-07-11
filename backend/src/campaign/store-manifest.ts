import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import * as lancedb from "@lancedb/lancedb";
import { getSqliteConnection } from "../db/index.js";
import {
  CAMPAIGN_STATE_SQLITE_TABLES,
  CAMPAIGN_STATE_STORE_MANIFEST,
  assertStoreManifestCoverage,
  type StoreManifestEntry,
} from "../engine/gameplay-control-plane-contract.js";

export { CAMPAIGN_PLAY_SQLITE_TABLES } from "../engine/gameplay-control-plane-contract.js";

export const STORE_BUNDLE_MANIFEST_FILENAME = "store-manifest.json";
const STORE_BUNDLE_MANIFEST_SCHEMA_VERSION = 1;

export type CampaignStoreBundlePurpose = "checkpoint" | "turn_snapshot";
export type CampaignStoreCaptureStatus = "captured" | "excluded_by_policy" | "external";

export interface CampaignStoreBundleEntry extends StoreManifestEntry {
  captureStatus: CampaignStoreCaptureStatus;
  bundlePath: string | null;
  rowCount: number | null;
  evidenceHash: string;
  note: string | null;
}

export interface CampaignStoreBundleManifest {
  schemaVersion: typeof STORE_BUNDLE_MANIFEST_SCHEMA_VERSION;
  campaignId: string;
  purpose: CampaignStoreBundlePurpose;
  includeVectors: boolean;
  capturedAt: number;
  stores: CampaignStoreBundleEntry[];
}

const SQLITE_TABLES = new Set<string>(CAMPAIGN_STATE_SQLITE_TABLES);
export const CAMPAIGN_OPTIONAL_SQLITE_TABLES = ["gameplay_cycle_v2_packets"] as const;
const OPTIONAL_SQLITE_TABLES = new Set<string>(CAMPAIGN_OPTIONAL_SQLITE_TABLES);

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function digest(value: unknown): string {
  return crypto.createHash("sha256").update(stableJson(value)).digest("hex");
}

function fileDigest(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function directoryDigest(dirPath: string): string {
  if (!fs.existsSync(dirPath)) {
    return digest({ missing: true });
  }
  const entries: Array<{ path: string; hash: string; size: number }> = [];
  const visit = (currentDir: string): void => {
    const dirEntries = fs
      .readdirSync(currentDir, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of dirEntries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        visit(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(dirPath, absolutePath).replace(/\\/gu, "/");
      entries.push({
        path: relativePath,
        hash: fileDigest(absolutePath),
        size: fs.statSync(absolutePath).size,
      });
    }
  };
  visit(dirPath);
  return digest(entries);
}

function quoteSqlIdentifier(value: string): string {
  if (!/^[a-z0-9_]+$/u.test(value)) {
    throw new Error(`Unsafe sqlite table name in store manifest: ${value}`);
  }
  return `"${value.replace(/"/gu, '""')}"`;
}

function readSqliteRowCountFromConnection(db: Database.Database, tableName: string): number {
  if (!SQLITE_TABLES.has(tableName)) {
    throw new Error(`Store manifest does not recognize sqlite table: ${tableName}`);
  }
  const table = db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(tableName) as { name?: string } | undefined;
  if (!table?.name && OPTIONAL_SQLITE_TABLES.has(tableName)) {
    return 0;
  }
  const row = db
    .prepare(`SELECT COUNT(*) AS count FROM ${quoteSqlIdentifier(tableName)}`)
    .get() as { count?: number } | undefined;
  if (!row || typeof row.count !== "number" || !Number.isFinite(row.count)) {
    throw new Error(`Could not read sqlite row count for store manifest table: ${tableName}`);
  }
  return row.count;
}

function readSqliteRowCount(tableName: string): number {
  return readSqliteRowCountFromConnection(getSqliteConnection(), tableName);
}

function readJsonArrayCount(filePath: string): number {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

function vectorTableNameForStore(store: string): string {
  if (store === "vectors:episodic_events") return "episodic_events";
  if (store === "vectors:lore_cards") return "lore_cards";
  throw new Error(`Store manifest does not recognize vector store: ${store}`);
}

async function readVectorRowCount(input: {
  vectorsDir: string;
  tableName: string;
}): Promise<number> {
  if (!fs.existsSync(input.vectorsDir)) {
    return 0;
  }
  const db = await lancedb.connect(input.vectorsDir);
  const tableNames = await db.tableNames();
  if (!tableNames.includes(input.tableName)) {
    return 0;
  }
  const table = await db.openTable(input.tableName);
  return table.countRows();
}

function evidenceHashFor(input: Omit<CampaignStoreBundleEntry, "evidenceHash">): string {
  return digest({
    store: input.store,
    authorityLevel: input.authorityLevel,
    clonePolicy: input.clonePolicy,
    rollbackPolicy: input.rollbackPolicy,
    restorePolicies: input.restorePolicies,
    replayPolicy: input.replayPolicy,
    sourceCampaignIdPolicy: input.sourceCampaignIdPolicy,
    requiresHash: input.requiresHash,
    requiresRowCount: input.requiresRowCount,
    captureStatus: input.captureStatus,
    bundlePath: input.bundlePath,
    rowCount: input.rowCount,
    note: input.note,
  });
}

function withEvidenceHash(
  input: Omit<CampaignStoreBundleEntry, "evidenceHash">,
  physicalHash?: string,
): CampaignStoreBundleEntry {
  return {
    ...input,
    evidenceHash: physicalHash ?? evidenceHashFor(input),
  };
}

async function bundleEntryForStore(input: {
  entry: StoreManifestEntry;
  bundleDir: string;
  includeVectors: boolean;
}): Promise<CampaignStoreBundleEntry> {
  const { entry, bundleDir, includeVectors } = input;
  if (entry.store.startsWith("sqlite:")) {
    const tableName = entry.store.slice("sqlite:".length);
    return withEvidenceHash({
      ...entry,
      captureStatus: "captured",
      bundlePath: "state.db",
      rowCount: readSqliteRowCount(tableName),
      note: "Captured by sqlite backup in state.db.",
    }, fileDigest(path.join(bundleDir, "state.db")));
  }

  if (entry.store === "json:config") {
    return withEvidenceHash({
      ...entry,
      captureStatus: "captured",
      bundlePath: "config.json",
      rowCount: null,
      note: "Captured as campaign config JSON.",
    }, fileDigest(path.join(bundleDir, "config.json")));
  }

  if (entry.store === "json:chat_history") {
    return withEvidenceHash({
      ...entry,
      captureStatus: "captured",
      bundlePath: "chat_history.json",
      rowCount: readJsonArrayCount(path.join(bundleDir, "chat_history.json")),
      note: "Captured as player-visible chat evidence JSON.",
    }, fileDigest(path.join(bundleDir, "chat_history.json")));
  }

  if (entry.store === "vectors:episodic_events" || entry.store === "vectors:lore_cards") {
    const tableName = vectorTableNameForStore(entry.store);
    const relativeTablePath = `vectors/${tableName}.lance`;
    const tablePath = path.join(bundleDir, relativeTablePath);
    const rowCount = includeVectors
      ? await readVectorRowCount({
        vectorsDir: path.join(bundleDir, "vectors"),
        tableName,
      })
      : null;
    const physicalHash = includeVectors ? directoryDigest(tablePath) : undefined;
    return withEvidenceHash({
      ...entry,
      captureStatus: includeVectors ? "captured" : "excluded_by_policy",
      bundlePath: includeVectors && fs.existsSync(tablePath) ? relativeTablePath : null,
      rowCount,
      note: includeVectors
        ? "Captured as vector table evidence for checkpoint restore."
        : "Excluded from turn rollback bundles; vectors are rebuilt or purged by policy.",
    }, physicalHash);
  }

  if (entry.store === "artifact:images") {
    return withEvidenceHash({
      ...entry,
      captureStatus: "external",
      bundlePath: null,
      rowCount: null,
      note: "Image artifacts are not part of checkpoint or turn-rollback bundles.",
    });
  }

  if (entry.store === "artifact:turn_boundaries") {
    return withEvidenceHash({
      ...entry,
      captureStatus: "external",
      bundlePath: null,
      rowCount: null,
      note: "Turn-boundary bundles are the restore mechanism, not recursively bundled state.",
    });
  }

  return withEvidenceHash({
    ...entry,
    captureStatus: "external",
    bundlePath: null,
    rowCount: null,
    note: "Not a physical campaign bundle store; governed by manifest policy.",
  });
}

export async function createCampaignStoreBundleManifest(input: {
  campaignId: string;
  bundleDir: string;
  includeVectors: boolean;
  purpose: CampaignStoreBundlePurpose;
  capturedAt?: number;
}): Promise<CampaignStoreBundleManifest> {
  const contractEntries = assertStoreManifestCoverage(CAMPAIGN_STATE_STORE_MANIFEST);
  const manifest: CampaignStoreBundleManifest = {
    schemaVersion: STORE_BUNDLE_MANIFEST_SCHEMA_VERSION,
    campaignId: input.campaignId,
    purpose: input.purpose,
    includeVectors: input.includeVectors,
    capturedAt: input.capturedAt ?? Date.now(),
    stores: await Promise.all(contractEntries.map((entry) =>
      bundleEntryForStore({
        entry,
        bundleDir: input.bundleDir,
        includeVectors: input.includeVectors,
      })
    )),
  };
  assertCampaignStoreBundleManifest(manifest);
  return manifest;
}

export function assertCampaignStoreBundleManifest(
  manifest: CampaignStoreBundleManifest,
): CampaignStoreBundleManifest {
  if (manifest.schemaVersion !== STORE_BUNDLE_MANIFEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported store bundle manifest schema version: ${manifest.schemaVersion}`);
  }
  assertStoreManifestCoverage(manifest.stores);
  for (const entry of manifest.stores) {
    if (entry.requiresHash && !entry.evidenceHash) {
      throw new Error(`Store manifest entry is missing evidence hash: ${entry.store}`);
    }
    if (entry.requiresRowCount && entry.captureStatus === "captured") {
      if (typeof entry.rowCount !== "number" || entry.rowCount < 0) {
        throw new Error(`Store manifest entry is missing row count: ${entry.store}`);
      }
    }
  }
  return manifest;
}

export function writeCampaignStoreBundleManifest(manifest: CampaignStoreBundleManifest, bundleDir: string): void {
  assertCampaignStoreBundleManifest(manifest);
  fs.writeFileSync(
    path.join(bundleDir, STORE_BUNDLE_MANIFEST_FILENAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf-8",
  );
}

export function readCampaignStoreBundleManifest(bundleDir: string): CampaignStoreBundleManifest {
  const manifestPath = path.join(bundleDir, STORE_BUNDLE_MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Campaign store bundle manifest is missing: ${manifestPath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8")) as CampaignStoreBundleManifest;
  return assertCampaignStoreBundleManifest(parsed);
}

export function readCampaignStoreBundleManifestDigest(bundleDir: string): string {
  const manifestPath = path.join(bundleDir, STORE_BUNDLE_MANIFEST_FILENAME);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Campaign store bundle manifest is missing: ${manifestPath}`);
  }
  return fileDigest(manifestPath);
}

function findStore(
  manifest: CampaignStoreBundleManifest,
  store: string,
): CampaignStoreBundleEntry {
  const entry = manifest.stores.find((candidate) => candidate.store === store);
  if (!entry) {
    throw new Error(`Campaign store bundle manifest is missing store: ${store}`);
  }
  return entry;
}

function assertCapturedFile(input: {
  manifest: CampaignStoreBundleManifest;
  bundleDir: string;
  store: string;
  relativePath: string;
}): void {
  const entry = findStore(input.manifest, input.store);
  if (entry.captureStatus !== "captured" || entry.bundlePath !== input.relativePath) {
    throw new Error(`Campaign store bundle did not capture required store: ${input.store}`);
  }
  if (!fs.existsSync(path.join(input.bundleDir, input.relativePath))) {
    throw new Error(`Campaign store bundle file is missing for ${input.store}: ${input.relativePath}`);
  }
}

function entryWithoutEvidenceHash(
  entry: CampaignStoreBundleEntry,
): Omit<CampaignStoreBundleEntry, "evidenceHash"> {
  const { evidenceHash: _evidenceHash, ...withoutEvidenceHash } = entry;
  return withoutEvidenceHash;
}

function assertEntryEvidenceHash(entry: CampaignStoreBundleEntry, actualHash: string): void {
  if (!entry.requiresHash) return;
  if (entry.evidenceHash !== actualHash) {
    throw new Error(`Campaign store bundle evidence hash mismatch for ${entry.store}.`);
  }
}

function assertCapturedRowCount(entry: CampaignStoreBundleEntry, actualRowCount: number): void {
  if (!entry.requiresRowCount || entry.captureStatus !== "captured") return;
  if (entry.rowCount !== actualRowCount) {
    throw new Error(
      `Campaign store bundle row count mismatch for ${entry.store}: expected ${entry.rowCount}, got ${actualRowCount}.`,
    );
  }
}

function assertMetadataEvidenceHash(entry: CampaignStoreBundleEntry): void {
  assertEntryEvidenceHash(entry, evidenceHashFor(entryWithoutEvidenceHash(entry)));
}

function verifySqliteBundleEvidence(manifest: CampaignStoreBundleManifest, bundleDir: string): void {
  const dbPath = path.join(bundleDir, "state.db");
  const stateDbHash = fileDigest(dbPath);
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    for (const entry of manifest.stores.filter((candidate) => candidate.store.startsWith("sqlite:"))) {
      if (entry.captureStatus !== "captured" || entry.bundlePath !== "state.db") {
        continue;
      }
      const tableName = entry.store.slice("sqlite:".length);
      assertEntryEvidenceHash(entry, stateDbHash);
      assertCapturedRowCount(entry, readSqliteRowCountFromConnection(db, tableName));
    }
  } finally {
    db.close();
  }
}

function verifyJsonBundleEvidence(manifest: CampaignStoreBundleManifest, bundleDir: string): void {
  const configEntry = findStore(manifest, "json:config");
  if (configEntry.captureStatus === "captured") {
    assertEntryEvidenceHash(configEntry, fileDigest(path.join(bundleDir, "config.json")));
  }

  const chatEntry = findStore(manifest, "json:chat_history");
  const chatPath = path.join(bundleDir, "chat_history.json");
  if (chatEntry.captureStatus === "captured") {
    assertEntryEvidenceHash(chatEntry, fileDigest(chatPath));
    assertCapturedRowCount(chatEntry, readJsonArrayCount(chatPath));
  }
}

async function verifyVectorBundleEvidence(input: {
  manifest: CampaignStoreBundleManifest;
  bundleDir: string;
  includeVectors: boolean;
}): Promise<void> {
  const vectorsDir = path.join(input.bundleDir, "vectors");
  for (const store of ["vectors:episodic_events", "vectors:lore_cards"]) {
    const entry = findStore(input.manifest, store);
    if (entry.captureStatus !== "captured") {
      assertMetadataEvidenceHash(entry);
      continue;
    }
    if (!input.includeVectors) {
      throw new Error(`Campaign store bundle unexpectedly captured vectors for ${store}.`);
    }
    const tableName = vectorTableNameForStore(store);
    const tablePath = path.join(vectorsDir, `${tableName}.lance`);
    assertEntryEvidenceHash(entry, directoryDigest(tablePath));
    assertCapturedRowCount(entry, await readVectorRowCount({ vectorsDir, tableName }));
  }
}

function verifyMetadataOnlyEvidence(manifest: CampaignStoreBundleManifest): void {
  for (const entry of manifest.stores) {
    if (entry.captureStatus === "captured") continue;
    if (entry.store.startsWith("vectors:")) continue;
    assertMetadataEvidenceHash(entry);
  }
}

export function assertCampaignStoreBundleRestorable(input: {
  bundleDir: string;
  includeVectors: boolean;
}): CampaignStoreBundleManifest {
  const manifest = readCampaignStoreBundleManifest(input.bundleDir);
  return assertCampaignStoreBundleRestorableAgainstManifest({
    manifest,
    evidenceDir: input.bundleDir,
    includeVectors: input.includeVectors,
  });
}

function assertCampaignStoreBundleRestorableAgainstManifest(input: {
  manifest: CampaignStoreBundleManifest;
  evidenceDir: string;
  includeVectors: boolean;
}): CampaignStoreBundleManifest {
  const { manifest, evidenceDir, includeVectors } = input;
  if (manifest.includeVectors !== includeVectors) {
    throw new Error(
      `Campaign store bundle manifest includeVectors mismatch: expected ${includeVectors}, got ${manifest.includeVectors}.`,
    );
  }
  assertCapturedFile({
    manifest,
    bundleDir: evidenceDir,
    store: "sqlite:campaigns",
    relativePath: "state.db",
  });
  assertCapturedFile({
    manifest,
    bundleDir: evidenceDir,
    store: "json:config",
    relativePath: "config.json",
  });
  assertCapturedFile({
    manifest,
    bundleDir: evidenceDir,
    store: "json:chat_history",
    relativePath: "chat_history.json",
  });

  const vectorEntries = [
    findStore(manifest, "vectors:episodic_events"),
    findStore(manifest, "vectors:lore_cards"),
  ];
  if (includeVectors) {
    if (!fs.existsSync(path.join(evidenceDir, "vectors"))) {
      throw new Error("Campaign store bundle vectors directory is missing.");
    }
    for (const vectorEntry of vectorEntries) {
      if (vectorEntry.captureStatus !== "captured") {
        throw new Error("Campaign store bundle cannot restore vectors because they were not captured.");
      }
      if (typeof vectorEntry.rowCount !== "number" || vectorEntry.rowCount < 0) {
        throw new Error(`Campaign store bundle vector row count is missing for ${vectorEntry.store}.`);
      }
      if (vectorEntry.bundlePath !== null && !fs.existsSync(path.join(evidenceDir, vectorEntry.bundlePath))) {
        throw new Error(`Campaign store bundle vector table directory is missing for ${vectorEntry.store}.`);
      }
    }
  }

  return manifest;
}

export async function assertCampaignStoreBundleRestorableWithEvidence(input: {
  bundleDir: string;
  includeVectors: boolean;
}): Promise<CampaignStoreBundleManifest> {
  const manifest = assertCampaignStoreBundleRestorable(input);
  verifySqliteBundleEvidence(manifest, input.bundleDir);
  verifyJsonBundleEvidence(manifest, input.bundleDir);
  await verifyVectorBundleEvidence({
    manifest,
    bundleDir: input.bundleDir,
    includeVectors: input.includeVectors,
  });
  verifyMetadataOnlyEvidence(manifest);
  return manifest;
}

export async function assertCampaignStoreBundleEvidenceMatchesManifest(input: {
  manifestDir: string;
  evidenceDir: string;
  includeVectors: boolean;
}): Promise<CampaignStoreBundleManifest> {
  const manifest = readCampaignStoreBundleManifest(input.manifestDir);
  assertCampaignStoreBundleRestorableAgainstManifest({
    manifest,
    evidenceDir: input.evidenceDir,
    includeVectors: input.includeVectors,
  });
  verifySqliteBundleEvidence(manifest, input.evidenceDir);
  verifyJsonBundleEvidence(manifest, input.evidenceDir);
  await verifyVectorBundleEvidence({
    manifest,
    bundleDir: input.evidenceDir,
    includeVectors: input.includeVectors,
  });
  verifyMetadataOnlyEvidence(manifest);
  return manifest;
}
