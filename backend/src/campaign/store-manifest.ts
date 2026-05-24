import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { getSqliteConnection } from "../db/index.js";
import {
  PHASE95_SQLITE_STORE_TABLES,
  PHASE95_STORE_MANIFEST,
  assertStoreManifestCoverage,
  type StoreManifestEntry,
} from "../engine/gameplay-control-plane-contract.js";

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

const SQLITE_TABLES = new Set<string>(PHASE95_SQLITE_STORE_TABLES);

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

function readSqliteRowCount(tableName: string): number {
  if (!SQLITE_TABLES.has(tableName)) {
    throw new Error(`Store manifest does not recognize sqlite table: ${tableName}`);
  }
  const row = getSqliteConnection()
    .prepare(`SELECT COUNT(*) AS count FROM ${quoteSqlIdentifier(tableName)}`)
    .get() as { count?: number } | undefined;
  if (!row || typeof row.count !== "number" || !Number.isFinite(row.count)) {
    throw new Error(`Could not read sqlite row count for store manifest table: ${tableName}`);
  }
  return row.count;
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
  const contractEntries = assertStoreManifestCoverage(PHASE95_STORE_MANIFEST);
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

export function assertCampaignStoreBundleRestorable(input: {
  bundleDir: string;
  includeVectors: boolean;
}): CampaignStoreBundleManifest {
  const manifest = readCampaignStoreBundleManifest(input.bundleDir);
  assertCapturedFile({
    manifest,
    bundleDir: input.bundleDir,
    store: "sqlite:campaigns",
    relativePath: "state.db",
  });
  assertCapturedFile({
    manifest,
    bundleDir: input.bundleDir,
    store: "json:config",
    relativePath: "config.json",
  });
  assertCapturedFile({
    manifest,
    bundleDir: input.bundleDir,
    store: "json:chat_history",
    relativePath: "chat_history.json",
  });

  const vectorEntries = [
    findStore(manifest, "vectors:episodic_events"),
    findStore(manifest, "vectors:lore_cards"),
  ];
  if (input.includeVectors) {
    if (!fs.existsSync(path.join(input.bundleDir, "vectors"))) {
      throw new Error("Campaign store bundle vectors directory is missing.");
    }
    for (const vectorEntry of vectorEntries) {
      if (vectorEntry.captureStatus !== "captured") {
        throw new Error("Campaign store bundle cannot restore vectors because they were not captured.");
      }
      if (typeof vectorEntry.rowCount !== "number" || vectorEntry.rowCount < 0) {
        throw new Error(`Campaign store bundle vector row count is missing for ${vectorEntry.store}.`);
      }
      if (vectorEntry.bundlePath !== null && !fs.existsSync(path.join(input.bundleDir, vectorEntry.bundlePath))) {
        throw new Error(`Campaign store bundle vector table directory is missing for ${vectorEntry.store}.`);
      }
    }
  }

  return manifest;
}
