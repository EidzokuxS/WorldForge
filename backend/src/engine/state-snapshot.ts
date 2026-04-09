import fs from "node:fs";
import path from "node:path";
import { loadCampaign } from "../campaign/manager.js";
import { getCampaignDir, getChatHistoryPath } from "../campaign/paths.js";
import { getSqliteConnection, closeDb } from "../db/index.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("state-snapshot");

const TURN_BOUNDARY_DIRNAME = ".turn-boundaries";
const LAST_TURN_BOUNDARY_DIRNAME = "last-turn-boundary";

export interface TurnSnapshot {
  campaignId: string;
  bundleDir: string;
  capturedAt: number;
}

export async function captureSnapshot(campaignId: string): Promise<TurnSnapshot> {
  const campaignDir = getCampaignDir(campaignId);
  const bundleDir = path.join(
    campaignDir,
    TURN_BOUNDARY_DIRNAME,
    LAST_TURN_BOUNDARY_DIRNAME,
  );
  const bundleDbPath = path.join(bundleDir, "state.db");
  const bundleConfigPath = path.join(bundleDir, "config.json");
  const bundleChatPath = path.join(bundleDir, "chat_history.json");
  const campaignConfigPath = path.join(campaignDir, "config.json");
  const campaignChatPath = getChatHistoryPath(campaignId);

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });

  try {
    await getSqliteConnection().backup(bundleDbPath);
    fs.copyFileSync(campaignConfigPath, bundleConfigPath);

    if (fs.existsSync(campaignChatPath)) {
      fs.copyFileSync(campaignChatPath, bundleChatPath);
    } else {
      fs.writeFileSync(bundleChatPath, "[]", "utf-8");
    }

    return {
      campaignId,
      bundleDir,
      capturedAt: Date.now(),
    };
  } catch (error) {
    fs.rmSync(bundleDir, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot,
): Promise<void> {
  const campaignDir = getCampaignDir(campaignId);
  const campaignDbPath = path.join(campaignDir, "state.db");
  const campaignConfigPath = path.join(campaignDir, "config.json");
  const campaignChatPath = getChatHistoryPath(campaignId);
  const snapshotDbPath = path.join(snapshot.bundleDir, "state.db");
  const snapshotConfigPath = path.join(snapshot.bundleDir, "config.json");
  const snapshotChatPath = path.join(snapshot.bundleDir, "chat_history.json");

  closeDb();

  fs.copyFileSync(snapshotDbPath, campaignDbPath);
  fs.copyFileSync(snapshotConfigPath, campaignConfigPath);
  if (fs.existsSync(snapshotChatPath)) {
    fs.copyFileSync(snapshotChatPath, campaignChatPath);
  } else {
    fs.writeFileSync(campaignChatPath, "[]", "utf-8");
  }

  await loadCampaign(campaignId);
  log.info(
    `Snapshot restored for campaign ${campaignId} from ${snapshot.bundleDir}`,
  );
}
