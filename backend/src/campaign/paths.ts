import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../lib/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CAMPAIGNS_ROOT = path.resolve(__dirname, "../../../campaigns");

/**
 * Returns the campaigns root directory. Reads GSD_CAMPAIGNS_ROOT at CALL TIME
 * (not module load time) so route-level integration tests can sandbox
 * `app.request("/api/chat/action", ...)` per-test by setting the env in beforeEach.
 *
 * Phase 58 BLOCKER-1 fix — the previous module-level export constant was
 * captured at module load, invisible to env overrides set in test setup.
 */
export function getCampaignsDir(): string {
  return process.env.GSD_CAMPAIGNS_ROOT || DEFAULT_CAMPAIGNS_ROOT;
}

export function assertSafeId(id: string): void {
  if (!/^[\w-]{1,128}$/.test(id)) {
    throw new AppError("Invalid campaign ID", 400);
  }
}

export function getCampaignDir(campaignId: string): string {
  assertSafeId(campaignId);
  return path.join(getCampaignsDir(), campaignId);
}

export function getCampaignConfigPath(campaignId: string): string {
  return path.join(getCampaignDir(campaignId), "config.json");
}

export function getChatHistoryPath(campaignId: string): string {
  return path.join(getCampaignDir(campaignId), "chat_history.json");
}

export function getCheckpointsDir(campaignId: string): string {
  return path.join(getCampaignDir(campaignId), "checkpoints");
}

export function getCheckpointDir(campaignId: string, checkpointId: string): string {
  assertSafeId(checkpointId);
  return path.join(getCheckpointsDir(campaignId), checkpointId);
}

export function getImagesDir(campaignId: string): string {
  return path.join(getCampaignDir(campaignId), "images");
}
