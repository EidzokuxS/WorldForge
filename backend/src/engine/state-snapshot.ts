import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { getCampaignDir } from "../campaign/paths.js";
import { captureCampaignBundle, restoreCampaignBundle } from "../campaign/restore-bundle.js";
import { createLogger } from "../lib/index.js";
import {
  invalidateAuthorityAfterRestore,
  readWorldClock,
} from "./living-world-authority.js";

const log = createLogger("state-snapshot");

const TURN_BOUNDARY_DIRNAME = ".turn-boundaries";
const SNAPSHOT_BUNDLES_DIRNAME = "snapshots";
const SNAPSHOT_MANIFEST_FILENAME = "snapshot.json";

export interface TurnSnapshotFileHashes {
  stateDb: string;
  config: string;
  chatHistory: string;
  vectors?: string | null;
}

export interface TurnSnapshot {
  campaignId: string;
  snapshotId: string;
  bundleDir: string;
  capturedAt: number;
  capturedWorldVersion: number | null;
  capturedWorldTimeMinutes: number | null;
  fileHashes: TurnSnapshotFileHashes | null;
}

function hashFile(filePath: string): string {
  return crypto
    .createHash("sha256")
    .update(fs.readFileSync(filePath))
    .digest("hex");
}

function hashDirectoryTree(dirPath: string): string {
  const hash = crypto.createHash("sha256");
  const visit = (currentPath: string, relativePrefix: string): void => {
    const entries = fs
      .readdirSync(currentPath, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);
      const relativePath = path.join(relativePrefix, entry.name).replaceAll(path.sep, "/");
      if (entry.isDirectory()) {
        hash.update(`dir:${relativePath}\n`);
        visit(entryPath, relativePath);
        continue;
      }
      if (entry.isFile()) {
        hash.update(`file:${relativePath}\n`);
        hash.update(fs.readFileSync(entryPath));
        hash.update("\n");
      }
    }
  };
  visit(dirPath, "");
  return hash.digest("hex");
}

function hashBundleFiles(bundleDir: string): TurnSnapshotFileHashes {
  const vectorsPath = path.join(bundleDir, "vectors");
  return {
    stateDb: hashFile(path.join(bundleDir, "state.db")),
    config: hashFile(path.join(bundleDir, "config.json")),
    chatHistory: hashFile(path.join(bundleDir, "chat_history.json")),
    vectors: fs.existsSync(vectorsPath) ? hashDirectoryTree(vectorsPath) : null,
  };
}

function snapshotManifestPath(bundleDir: string): string {
  return path.join(bundleDir, SNAPSHOT_MANIFEST_FILENAME);
}

function assertBundleInsideCampaign(campaignId: string, bundleDir: string): void {
  const snapshotsRoot = path.resolve(
    getCampaignDir(campaignId),
    TURN_BOUNDARY_DIRNAME,
    SNAPSHOT_BUNDLES_DIRNAME,
  );
  const resolvedBundle = path.resolve(bundleDir);
  const relative = path.relative(snapshotsRoot, resolvedBundle);
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(
      `Turn snapshot bundle ${bundleDir} is outside the campaign snapshot root.`,
    );
  }
}

function writeSnapshotManifest(snapshot: TurnSnapshot): void {
  fs.writeFileSync(
    snapshotManifestPath(snapshot.bundleDir),
    JSON.stringify({
      version: 1,
      snapshot,
    }, null, 2),
    "utf8",
  );
}

function fileHashesFromRecord(value: unknown): TurnSnapshotFileHashes | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.stateDb !== "string"
    || typeof record.config !== "string"
    || typeof record.chatHistory !== "string"
  ) {
    return null;
  }
  return {
    stateDb: record.stateDb,
    config: record.config,
    chatHistory: record.chatHistory,
    vectors: typeof record.vectors === "string" ? record.vectors : record.vectors === null ? null : undefined,
  };
}

function assertSnapshotManifestMatches(snapshot: TurnSnapshot): TurnSnapshotFileHashes | null {
  const manifestPath = snapshotManifestPath(snapshot.bundleDir);
  if (!fs.existsSync(manifestPath)) {
    if (snapshot.snapshotId) {
      throw new Error(`Turn snapshot ${snapshot.snapshotId} is missing its bundle manifest.`);
    }
    return null;
  }

  const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Turn snapshot manifest ${manifestPath} is invalid.`);
  }
  const record = parsed as Record<string, unknown>;
  const manifestSnapshot = record.snapshot;
  if (!manifestSnapshot || typeof manifestSnapshot !== "object" || Array.isArray(manifestSnapshot)) {
    throw new Error(`Turn snapshot manifest ${manifestPath} has no snapshot payload.`);
  }
  const manifestRecord = manifestSnapshot as Record<string, unknown>;
  if (
    manifestRecord.campaignId !== snapshot.campaignId
    || manifestRecord.snapshotId !== snapshot.snapshotId
  ) {
    throw new Error(`Turn snapshot ${snapshot.snapshotId} manifest identity mismatch.`);
  }
  return fileHashesFromRecord(manifestRecord.fileHashes);
}

function assertSnapshotHashesMatch(
  snapshot: TurnSnapshot,
  manifestFileHashes: TurnSnapshotFileHashes | null,
): void {
  const expectedHashes = snapshot.fileHashes ?? manifestFileHashes;
  if (!expectedHashes) {
    throw new Error(`Turn snapshot ${snapshot.snapshotId} has no bundle hash manifest.`);
  }
  const actual = hashBundleFiles(snapshot.bundleDir);
  if (
    actual.stateDb !== expectedHashes.stateDb
    || actual.config !== expectedHashes.config
    || actual.chatHistory !== expectedHashes.chatHistory
    || (expectedHashes.vectors !== undefined && actual.vectors !== expectedHashes.vectors)
  ) {
    throw new Error(`Turn snapshot ${snapshot.snapshotId} bundle hash mismatch.`);
  }
}

export async function captureSnapshot(campaignId: string): Promise<TurnSnapshot> {
  const campaignDir = getCampaignDir(campaignId);
  const snapshotId = crypto.randomUUID();
  const bundleDir = path.join(
    campaignDir,
    TURN_BOUNDARY_DIRNAME,
    SNAPSHOT_BUNDLES_DIRNAME,
    snapshotId,
  );
  await captureCampaignBundle(campaignId, bundleDir, { includeVectors: true });
  const capturedClock = readWorldClock(campaignId);
  const snapshot: TurnSnapshot = {
    campaignId,
    snapshotId,
    bundleDir,
    capturedAt: Date.now(),
    capturedWorldVersion: capturedClock.worldVersion,
    capturedWorldTimeMinutes: capturedClock.worldTimeMinutes,
    fileHashes: hashBundleFiles(bundleDir),
  };
  writeSnapshotManifest(snapshot);

  return snapshot;
}

export async function restoreSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot,
): Promise<void> {
  if (snapshot.campaignId !== campaignId) {
    throw new Error(`Turn snapshot ${snapshot.snapshotId} belongs to a different campaign.`);
  }
  assertBundleInsideCampaign(campaignId, snapshot.bundleDir);
  const manifestFileHashes = assertSnapshotManifestMatches(snapshot);
  assertSnapshotHashesMatch(snapshot, manifestFileHashes);
  await restoreCampaignBundle(campaignId, snapshot.bundleDir, {
    includeVectors: true,
  });
  const restoredClock = readWorldClock(campaignId);
  invalidateAuthorityAfterRestore({
    campaignId,
    restoredWorldVersion: restoredClock.worldVersion,
    restoredWorldTimeMinutes: restoredClock.worldTimeMinutes,
    restoredCurrentTick: restoredClock.currentTick,
    reason: "turn snapshot restored",
  });
  log.info(
    `Snapshot restored for campaign ${campaignId} from ${snapshot.bundleDir}`,
  );
}
