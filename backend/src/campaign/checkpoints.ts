import fs from "node:fs";
import path from "node:path";
import { connectDb, closeDb, getSqliteConnection } from "../db/index.js";
import { runMigrations } from "../db/migrate.js";
import { openVectorDb, closeVectorDb } from "../vectors/connection.js";
import { AppError } from "../lib/index.js";
import {
  assertSafeId,
  getCampaignDir,
  getChatHistoryPath,
  getCheckpointsDir,
  getCheckpointDir,
} from "./paths.js";

export type CheckpointMeta = {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  auto: boolean;
};

function sanitizeName(raw: string): string {
  return raw
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .toLowerCase();
}

export async function createCheckpoint(
  campaignId: string,
  opts?: { name?: string; description?: string; auto?: boolean }
): Promise<CheckpointMeta> {
  assertSafeId(campaignId);

  const label = opts?.name ? sanitizeName(opts.name) : "manual";
  const checkpointId = `${Date.now()}-${label}`;
  const checkpointDir = getCheckpointDir(campaignId, checkpointId);

  fs.mkdirSync(checkpointDir, { recursive: true });

  try {
    // SQLite safe backup via better-sqlite3
    const backupDest = path.join(checkpointDir, "state.db");
    await getSqliteConnection().backup(backupDest);

    // Copy vectors directory
    const campaignDir = getCampaignDir(campaignId);
    const vectorsSource = path.join(campaignDir, "vectors");
    const vectorsDest = path.join(checkpointDir, "vectors");
    if (fs.existsSync(vectorsSource)) {
      fs.cpSync(vectorsSource, vectorsDest, { recursive: true });
    }

    // Copy chat history
    const chatSource = getChatHistoryPath(campaignId);
    const chatDest = path.join(checkpointDir, "chat_history.json");
    if (fs.existsSync(chatSource)) {
      fs.copyFileSync(chatSource, chatDest);
    }

    // Write metadata
    const meta: CheckpointMeta = {
      id: checkpointId,
      name: opts?.name ?? "Manual Checkpoint",
      description: opts?.description ?? "",
      createdAt: Date.now(),
      auto: opts?.auto ?? false,
    };

    fs.writeFileSync(
      path.join(checkpointDir, "meta.json"),
      JSON.stringify(meta, null, 2),
      "utf-8"
    );

    return meta;
  } catch (error) {
    // Clean up partial checkpoint on failure
    fs.rmSync(checkpointDir, { recursive: true, force: true });
    throw error;
  }
}

export function listCheckpoints(campaignId: string): CheckpointMeta[] {
  assertSafeId(campaignId);

  const dir = getCheckpointsDir(campaignId);
  if (!fs.existsSync(dir)) {
    return [];
  }

  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory());

  const results: CheckpointMeta[] = [];

  for (const entry of entries) {
    const metaPath = path.join(dir, entry.name, "meta.json");
    if (!fs.existsSync(metaPath)) continue;

    try {
      const raw = fs.readFileSync(metaPath, "utf-8");
      const meta = JSON.parse(raw) as CheckpointMeta;
      results.push(meta);
    } catch {
      // Skip corrupt checkpoint metadata
    }
  }

  return results.sort((a, b) => b.createdAt - a.createdAt);
}

export async function loadCheckpoint(
  campaignId: string,
  checkpointId: string
): Promise<CheckpointMeta> {
  assertSafeId(campaignId);
  assertSafeId(checkpointId);

  const checkpointDir = getCheckpointDir(campaignId, checkpointId);
  const metaPath = path.join(checkpointDir, "meta.json");

  if (!fs.existsSync(checkpointDir) || !fs.existsSync(metaPath)) {
    throw new AppError("Checkpoint not found", 404);
  }

  const meta = JSON.parse(
    fs.readFileSync(metaPath, "utf-8")
  ) as CheckpointMeta;

  // Disconnect current connections
  closeDb();
  closeVectorDb();

  const campaignDir = getCampaignDir(campaignId);
  const dbPath = path.join(campaignDir, "state.db");

  // Restore state.db
  const checkpointDb = path.join(checkpointDir, "state.db");
  if (fs.existsSync(checkpointDb)) {
    fs.copyFileSync(checkpointDb, dbPath);
  }

  // Restore vectors
  const checkpointVectors = path.join(checkpointDir, "vectors");
  const campaignVectors = path.join(campaignDir, "vectors");
  if (fs.existsSync(checkpointVectors)) {
    fs.rmSync(campaignVectors, { recursive: true, force: true });
    fs.cpSync(checkpointVectors, campaignVectors, { recursive: true });
  }

  // Restore chat history
  const checkpointChat = path.join(checkpointDir, "chat_history.json");
  const campaignChat = getChatHistoryPath(campaignId);
  if (fs.existsSync(checkpointChat)) {
    fs.copyFileSync(checkpointChat, campaignChat);
  }

  // Reconnect
  connectDb(dbPath);
  runMigrations();
  await openVectorDb(campaignId);

  return meta;
}

export function deleteCheckpoint(
  campaignId: string,
  checkpointId: string
): void {
  assertSafeId(campaignId);
  assertSafeId(checkpointId);

  const checkpointDir = getCheckpointDir(campaignId, checkpointId);
  if (!fs.existsSync(checkpointDir)) {
    throw new AppError("Checkpoint not found", 404);
  }

  fs.rmSync(checkpointDir, { recursive: true, force: true });
}

export async function pruneAutoCheckpoints(
  campaignId: string,
  keepCount = 3
): Promise<void> {
  const all = listCheckpoints(campaignId);
  const autoCheckpoints = all
    .filter((cp) => cp.auto)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (autoCheckpoints.length <= keepCount) return;

  const toDelete = autoCheckpoints.slice(
    0,
    autoCheckpoints.length - keepCount
  );

  for (const cp of toDelete) {
    deleteCheckpoint(campaignId, cp.id);
  }
}
