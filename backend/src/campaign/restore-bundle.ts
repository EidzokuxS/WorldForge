import fs from "node:fs";
import path from "node:path";
import { loadCampaign } from "./manager.js";
import {
  getCampaignConfigPath,
  getCampaignDir,
  getChatHistoryPath,
} from "./paths.js";
import { closeDb, getSqliteConnection } from "../db/index.js";
import { closeVectorDb } from "../vectors/connection.js";

type BundleOptions = {
  includeVectors: boolean;
};

function resolveBundlePaths(bundleDir: string) {
  return {
    dbPath: path.join(bundleDir, "state.db"),
    configPath: path.join(bundleDir, "config.json"),
    chatPath: path.join(bundleDir, "chat_history.json"),
    vectorsPath: path.join(bundleDir, "vectors"),
  };
}

export async function captureCampaignBundle(
  campaignId: string,
  bundleDir: string,
  options: BundleOptions,
): Promise<void> {
  const campaignDir = getCampaignDir(campaignId);
  const { dbPath, configPath, chatPath, vectorsPath } = resolveBundlePaths(bundleDir);
  const campaignConfigPath = getCampaignConfigPath(campaignId);
  const campaignChatPath = getChatHistoryPath(campaignId);
  const campaignVectorsPath = path.join(campaignDir, "vectors");

  fs.rmSync(bundleDir, { recursive: true, force: true });
  fs.mkdirSync(bundleDir, { recursive: true });

  try {
    await getSqliteConnection().backup(dbPath);
    fs.copyFileSync(campaignConfigPath, configPath);

    if (fs.existsSync(campaignChatPath)) {
      fs.copyFileSync(campaignChatPath, chatPath);
    } else {
      fs.writeFileSync(chatPath, "[]", "utf-8");
    }

    if (options.includeVectors && fs.existsSync(campaignVectorsPath)) {
      fs.cpSync(campaignVectorsPath, vectorsPath, { recursive: true });
    }
  } catch (error) {
    fs.rmSync(bundleDir, { recursive: true, force: true });
    throw error;
  }
}

export async function restoreCampaignBundle(
  campaignId: string,
  bundleDir: string,
  options: BundleOptions,
): Promise<void> {
  const campaignDir = getCampaignDir(campaignId);
  const { dbPath, configPath, chatPath, vectorsPath } = resolveBundlePaths(bundleDir);
  const campaignDbPath = path.join(campaignDir, "state.db");
  const campaignConfigPath = getCampaignConfigPath(campaignId);
  const campaignChatPath = getChatHistoryPath(campaignId);
  const campaignVectorsPath = path.join(campaignDir, "vectors");

  closeDb();
  closeVectorDb();

  fs.copyFileSync(dbPath, campaignDbPath);
  fs.copyFileSync(configPath, campaignConfigPath);

  if (fs.existsSync(chatPath)) {
    fs.copyFileSync(chatPath, campaignChatPath);
  } else {
    fs.writeFileSync(campaignChatPath, "[]", "utf-8");
  }

  if (options.includeVectors && fs.existsSync(vectorsPath)) {
    fs.rmSync(campaignVectorsPath, { recursive: true, force: true });
    fs.cpSync(vectorsPath, campaignVectorsPath, { recursive: true });
  }

  await loadCampaign(campaignId);
}
