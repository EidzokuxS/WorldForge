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
import { rebuildEpisodicEventsFromLocationRecentEvents } from "../vectors/episodic-events.js";
import {
  createCampaignStoreBundleManifest,
  writeCampaignStoreBundleManifest,
  assertCampaignStoreBundleRestorableWithEvidence,
  type CampaignStoreBundlePurpose,
} from "./store-manifest.js";
import { planCampaignStoreManifestOperation } from "./store-manifest-executor.js";

type BundleOptions = {
  includeVectors: boolean;
  purpose?: CampaignStoreBundlePurpose;
};

const RESTORE_STAGING_DIRNAME = ".restore-staging";
const RESTORE_STAGING_CURRENT_DIRNAME = "current";

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

function restoreStagingRoot(campaignDir: string): string {
  return path.join(campaignDir, RESTORE_STAGING_DIRNAME);
}

function clearRestoreStaging(campaignDir: string): void {
  fs.rmSync(restoreStagingRoot(campaignDir), { recursive: true, force: true });
}

function prepareRestoreStaging(input: {
  campaignDir: string;
  bundlePaths: ReturnType<typeof resolveBundlePaths>;
  includeVectors: boolean;
}): ReturnType<typeof resolveBundlePaths> {
  const stagingRoot = restoreStagingRoot(input.campaignDir);
  const stagingDir = path.join(stagingRoot, RESTORE_STAGING_CURRENT_DIRNAME);
  clearRestoreStaging(input.campaignDir);
  fs.mkdirSync(stagingDir, { recursive: true });

  const stagedPaths = resolveBundlePaths(stagingDir);
  fs.copyFileSync(input.bundlePaths.dbPath, stagedPaths.dbPath);
  fs.copyFileSync(input.bundlePaths.configPath, stagedPaths.configPath);
  if (fs.existsSync(input.bundlePaths.chatPath)) {
    fs.copyFileSync(input.bundlePaths.chatPath, stagedPaths.chatPath);
  } else {
    fs.writeFileSync(stagedPaths.chatPath, "[]", "utf-8");
  }
  if (input.includeVectors && fs.existsSync(input.bundlePaths.vectorsPath)) {
    fs.cpSync(input.bundlePaths.vectorsPath, stagedPaths.vectorsPath, { recursive: true });
  }
  return stagedPaths;
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
    if (step.action === "purge_rebuild") {
      continue;
    }
    if (step.action === "purge") {
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
  const bundlePaths = resolveBundlePaths(bundleDir);
  const campaignDbPath = path.join(campaignDir, "state.db");
  const campaignConfigPath = getCampaignConfigPath(campaignId);
  const campaignChatPath = getChatHistoryPath(campaignId);
  const campaignVectorsPath = path.join(campaignDir, "vectors");

  await assertCampaignStoreBundleRestorableWithEvidence({
    bundleDir,
    includeVectors: options.includeVectors,
  });
  const stagedPaths = prepareRestoreStaging({
    campaignDir,
    bundlePaths,
    includeVectors: options.includeVectors,
  });

  try {
    closeDb();
    closeVectorDb();

    removeSqliteSidecarFiles(campaignDbPath);
    fs.copyFileSync(stagedPaths.dbPath, campaignDbPath);
    removeSqliteSidecarFiles(campaignDbPath);
    fs.copyFileSync(stagedPaths.configPath, campaignConfigPath);

    if (fs.existsSync(stagedPaths.chatPath)) {
      fs.copyFileSync(stagedPaths.chatPath, campaignChatPath);
    } else {
      fs.writeFileSync(campaignChatPath, "[]", "utf-8");
    }

    if (options.includeVectors && fs.existsSync(stagedPaths.vectorsPath)) {
      fs.rmSync(campaignVectorsPath, { recursive: true, force: true });
      fs.cpSync(stagedPaths.vectorsPath, campaignVectorsPath, { recursive: true });
    } else if (!options.includeVectors) {
      applyTurnRollbackVectorPolicies(campaignVectorsPath);
    }

    clearRestoreStaging(campaignDir);
    await loadCampaign(campaignId);
    if (!options.includeVectors) {
      await rebuildEpisodicEventsFromLocationRecentEvents(campaignId);
    }
  } catch (error) {
    clearRestoreStaging(campaignDir);
    throw error;
  }
}
