import fs from "node:fs";
import path from "node:path";
import { AppError } from "../lib/index.js";
import {
  assertSafeId,
  getCheckpointsDir,
  getCheckpointDir,
} from "./paths.js";
import {
  captureCampaignBundle,
  restoreCampaignBundle,
} from "./restore-bundle.js";

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
    await captureCampaignBundle(campaignId, checkpointDir, { includeVectors: true });

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
  await restoreCampaignBundle(campaignId, checkpointDir, { includeVectors: true });

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

export function pruneAutoCheckpoints(
  campaignId: string,
  keepCount = 3
): void {
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
