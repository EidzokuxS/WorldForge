import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "../lib/errors.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const CAMPAIGNS_DIR = path.resolve(__dirname, "../../../campaigns");

export function assertSafeId(id: string): void {
  if (!/^[\w-]{1,128}$/.test(id)) {
    throw new AppError("Invalid campaign ID", 400);
  }
}

export function getCampaignDir(campaignId: string): string {
  assertSafeId(campaignId);
  return path.join(CAMPAIGNS_DIR, campaignId);
}

export function getCampaignConfigPath(campaignId: string): string {
  return path.join(getCampaignDir(campaignId), "config.json");
}

export function getChatHistoryPath(campaignId: string): string {
  return path.join(getCampaignDir(campaignId), "chat_history.json");
}
