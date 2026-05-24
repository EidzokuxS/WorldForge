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
import {
  createCampaignStoreBundleManifest,
  writeCampaignStoreBundleManifest,
  assertCampaignStoreBundleRestorable,
  type CampaignStoreBundlePurpose,
} from "./store-manifest.js";
import { planCampaignStoreManifestOperation } from "./store-manifest-executor.js";

type BundleOptions = {
  includeVectors: boolean;
  purpose?: CampaignStoreBundlePurpose;
};

function resolveBundlePaths(bundleDir: string) {
  return {
    dbPath: path.join(bundleDir, "state.db"),
    configPath: path.join(bundleDir, "config.json"),
    chatPath: path.join(bundleDir, "chat_history.json"),
    vectorsPath: path.join(bundleDir, "vectors"),
  };
}

function removeSqliteSidecarFiles(dbPath: string): void {
  for (const suffix of ["-wal", "-shm", "-journal"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

function vectorTableDirForStore(campaignVectorsPath: string, store: string): string {
  if (store === "vectors:episodic_events") {
    return path.join(campaignVectorsPath, "episodic_events.lance");
  }
  if (store === "vectors:lore_cards") {
    return path.join(campaignVectorsPath, "lore_cards.lance");
  }
  throw new Error(`Unknown vector store in manifest restore plan: ${store}`);
}

function applyTurnRollbackVectorPolicies(campaignVectorsPath: string): void {
  const plan = planCampaignStoreManifestOperation({ mode: "turn_rollback_restore" });
  fs.mkdirSync(campaignVectorsPath, { recursive: true });

  for (const step of plan.steps.filter((candidate) => candidate.store.startsWith("vectors:"))) {
    if (step.action === "purge_rebuild" || step.action === "purge") {
      fs.rmSync(vectorTableDirForStore(campaignVectorsPath, step.store), {
        recursive: true,
        force: true,
      });
      continue;
    }
    if (step.action === "preserve_verified") {
      continue;
    }
    throw new Error(
      `Turn rollback cannot apply vector restore action ${step.action} for ${step.store}.`,
    );
  }
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

    writeCampaignStoreBundleManifest(
      await createCampaignStoreBundleManifest({
        campaignId,
        bundleDir,
        includeVectors: options.includeVectors,
        purpose: options.purpose ?? "checkpoint",
      }),
      bundleDir,
    );
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

  assertCampaignStoreBundleRestorable({
    bundleDir,
    includeVectors: options.includeVectors,
  });

  closeDb();
  closeVectorDb();

  removeSqliteSidecarFiles(campaignDbPath);
  fs.copyFileSync(dbPath, campaignDbPath);
  removeSqliteSidecarFiles(campaignDbPath);
  fs.copyFileSync(configPath, campaignConfigPath);

  if (fs.existsSync(chatPath)) {
    fs.copyFileSync(chatPath, campaignChatPath);
  } else {
    fs.writeFileSync(campaignChatPath, "[]", "utf-8");
  }

  if (options.includeVectors && fs.existsSync(vectorsPath)) {
    fs.rmSync(campaignVectorsPath, { recursive: true, force: true });
    fs.cpSync(vectorsPath, campaignVectorsPath, { recursive: true });
  } else if (!options.includeVectors) {
    applyTurnRollbackVectorPolicies(campaignVectorsPath);
  }

  await loadCampaign(campaignId);
}
