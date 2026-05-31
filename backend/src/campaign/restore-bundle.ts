import fs from "node:fs";
import path from "node:path";
import {
  getCampaignConfigPath,
  getCampaignDir,
  getChatHistoryPath,
} from "./paths.js";
import { closeDb, getSqliteConnection } from "../db/index.js";
import { closeVectorDb } from "../vectors/connection.js";
import {
  clearPendingCommittedEvents,
  rebuildEpisodicEventsFromLocationRecentEvents,
} from "../vectors/episodic-events.js";
import {
  invalidateAuthorityAfterRestore,
  readWorldClock,
} from "../engine/living-world-authority.js";
import {
  createCampaignStoreBundleManifest,
  writeCampaignStoreBundleManifest,
  assertCampaignStoreBundleRestorableWithEvidence,
  STORE_BUNDLE_MANIFEST_FILENAME,
  type CampaignStoreBundlePurpose,
} from "./store-manifest.js";
import { planCampaignStoreManifestOperation } from "./store-manifest-executor.js";

type BundleOptions = {
  includeVectors: boolean;
  purpose?: CampaignStoreBundlePurpose;
  restoreReason?: string;
};

const RESTORE_STAGING_DIRNAME = ".restore-staging";
const RESTORE_STAGING_CURRENT_DIRNAME = "current";
const RESTORE_JOURNAL_FILENAME = "restore-journal.json";

type RestoreJournalPhase =
  | "prepared"
  | "handles_closed"
  | "db_applied"
  | "config_applied"
  | "chat_applied"
  | "vectors_applied"
  | "awaiting_load"
  | "finalizing"
  | "complete";

type RestoreJournal = {
  schemaVersion: 1;
  campaignId: string;
  bundleDir: string;
  includeVectors: boolean;
  stagedDir: string;
  restoreReason: string;
  requiresEpisodicRebuild: boolean;
  phase: RestoreJournalPhase;
  createdAt: number;
  updatedAt: number;
};

function resolveBundlePaths(bundleDir: string) {
  return {
    dbPath: path.join(bundleDir, "state.db"),
    configPath: path.join(bundleDir, "config.json"),
    chatPath: path.join(bundleDir, "chat_history.json"),
    vectorsPath: path.join(bundleDir, "vectors"),
    manifestPath: path.join(bundleDir, STORE_BUNDLE_MANIFEST_FILENAME),
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

function restoreJournalPath(campaignDir: string): string {
  return path.join(restoreStagingRoot(campaignDir), RESTORE_JOURNAL_FILENAME);
}

function clearRestoreStaging(campaignDir: string): void {
  fs.rmSync(restoreStagingRoot(campaignDir), { recursive: true, force: true });
}

function writeRestoreJournal(campaignDir: string, journal: RestoreJournal): void {
  const journalPath = restoreJournalPath(campaignDir);
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const nextJournal = {
    ...journal,
    updatedAt: Date.now(),
  };
  const tempJournalPath = `${journalPath}.tmp`;
  fs.writeFileSync(tempJournalPath, JSON.stringify(nextJournal, null, 2), "utf-8");
  fs.renameSync(tempJournalPath, journalPath);
}

function readRestoreJournal(campaignDir: string): RestoreJournal | null {
  const journalPath = restoreJournalPath(campaignDir);
  if (!fs.existsSync(journalPath)) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(journalPath, "utf-8")) as unknown;
  } catch (error) {
    throw new Error(
      `Pending restore journal at ${journalPath} is unreadable: ${String(error)}`,
    );
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as RestoreJournal).schemaVersion !== 1 ||
    typeof (parsed as RestoreJournal).campaignId !== "string" ||
    typeof (parsed as RestoreJournal).bundleDir !== "string" ||
    typeof (parsed as RestoreJournal).stagedDir !== "string" ||
    typeof (parsed as RestoreJournal).includeVectors !== "boolean" ||
    typeof (parsed as RestoreJournal).requiresEpisodicRebuild !== "boolean" ||
    typeof (parsed as RestoreJournal).restoreReason !== "string" ||
    typeof (parsed as RestoreJournal).phase !== "string"
  ) {
    throw new Error(`Pending restore journal at ${journalPath} is invalid.`);
  }

  return parsed as RestoreJournal;
}

function requireJournalForCampaign(campaignDir: string, campaignId: string): RestoreJournal | null {
  const journal = readRestoreJournal(campaignDir);
  if (!journal) {
    return null;
  }
  if (journal.campaignId !== campaignId) {
    throw new Error(
      `Pending restore journal belongs to ${journal.campaignId}, not ${campaignId}.`,
    );
  }
  const stagingRoot = path.resolve(restoreStagingRoot(campaignDir));
  const stagedDir = path.resolve(journal.stagedDir);
  if (stagedDir !== stagingRoot && !stagedDir.startsWith(`${stagingRoot}${path.sep}`)) {
    throw new Error(
      `Pending restore journal stagedDir is outside restore staging: ${journal.stagedDir}`,
    );
  }
  return journal;
}

function updateRestoreJournalPhase(
  campaignDir: string,
  journal: RestoreJournal,
  phase: RestoreJournalPhase,
): RestoreJournal {
  const nextJournal = { ...journal, phase, updatedAt: Date.now() };
  writeRestoreJournal(campaignDir, nextJournal);
  return nextJournal;
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
  fs.copyFileSync(input.bundlePaths.manifestPath, stagedPaths.manifestPath);
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
      fs.rmSync(vectorTableDirForStore(campaignVectorsPath, step.store), {
        recursive: true,
        force: true,
      });
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

async function assertStagedRestoreFiles(journal: RestoreJournal): Promise<ReturnType<typeof resolveBundlePaths>> {
  const stagedPaths = resolveBundlePaths(journal.stagedDir);
  for (const requiredPath of [
    stagedPaths.dbPath,
    stagedPaths.configPath,
    stagedPaths.chatPath,
    stagedPaths.manifestPath,
  ]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(
        `Pending restore journal cannot be repaired because staged file is missing: ${requiredPath}`,
      );
    }
  }
  if (journal.includeVectors && !fs.existsSync(stagedPaths.vectorsPath)) {
    throw new Error(
      `Pending checkpoint restore journal cannot be repaired because staged vectors are missing: ${stagedPaths.vectorsPath}`,
    );
  }
  await assertCampaignStoreBundleRestorableWithEvidence({
    bundleDir: journal.stagedDir,
    includeVectors: journal.includeVectors,
  });
  return stagedPaths;
}

async function applyStagedRestore(input: {
  campaignId: string;
  campaignDir: string;
  journal: RestoreJournal;
}): Promise<RestoreJournal> {
  const stagedPaths = await assertStagedRestoreFiles(input.journal);
  const campaignDbPath = path.join(input.campaignDir, "state.db");
  const campaignConfigPath = getCampaignConfigPath(input.campaignId);
  const campaignChatPath = getChatHistoryPath(input.campaignId);
  const campaignVectorsPath = path.join(input.campaignDir, "vectors");
  let journal = input.journal;

  closeDb();
  closeVectorDb();
  journal = updateRestoreJournalPhase(input.campaignDir, journal, "handles_closed");

  removeSqliteSidecarFiles(campaignDbPath);
  fs.copyFileSync(stagedPaths.dbPath, campaignDbPath);
  removeSqliteSidecarFiles(campaignDbPath);
  journal = updateRestoreJournalPhase(input.campaignDir, journal, "db_applied");

  fs.copyFileSync(stagedPaths.configPath, campaignConfigPath);
  journal = updateRestoreJournalPhase(input.campaignDir, journal, "config_applied");

  if (fs.existsSync(stagedPaths.chatPath)) {
    fs.copyFileSync(stagedPaths.chatPath, campaignChatPath);
  } else {
    fs.writeFileSync(campaignChatPath, "[]", "utf-8");
  }
  journal = updateRestoreJournalPhase(input.campaignDir, journal, "chat_applied");

  if (journal.includeVectors && fs.existsSync(stagedPaths.vectorsPath)) {
    const replacementVectorsPath = path.join(
      restoreStagingRoot(input.campaignDir),
      "vectors-replacement",
    );
    fs.rmSync(replacementVectorsPath, { recursive: true, force: true });
    fs.cpSync(stagedPaths.vectorsPath, replacementVectorsPath, { recursive: true });
    fs.rmSync(campaignVectorsPath, { recursive: true, force: true });
    fs.cpSync(replacementVectorsPath, campaignVectorsPath, { recursive: true });
  } else if (!journal.includeVectors) {
    applyTurnRollbackVectorPolicies(campaignVectorsPath);
  }
  journal = updateRestoreJournalPhase(input.campaignDir, journal, "vectors_applied");

  return updateRestoreJournalPhase(input.campaignDir, journal, "awaiting_load");
}

export async function repairPendingCampaignRestoreBeforeLoad(
  campaignId: string,
): Promise<boolean> {
  const campaignDir = getCampaignDir(campaignId);
  const journal = requireJournalForCampaign(campaignDir, campaignId);
  if (!journal) {
    return false;
  }

  await applyStagedRestore({
    campaignId,
    campaignDir,
    journal,
  });
  return true;
}

export async function finalizePendingCampaignRestoreAfterLoad(
  campaignId: string,
): Promise<boolean> {
  const campaignDir = getCampaignDir(campaignId);
  let journal = requireJournalForCampaign(campaignDir, campaignId);
  if (!journal) {
    return false;
  }

  journal = updateRestoreJournalPhase(campaignDir, journal, "finalizing");
  clearPendingCommittedEvents(campaignId);
  const restoredClock = readWorldClock(campaignId);
  invalidateAuthorityAfterRestore({
    campaignId,
    restoredWorldVersion: restoredClock.worldVersion,
    restoredWorldTimeMinutes: restoredClock.worldTimeMinutes,
    restoredCurrentTick: restoredClock.currentTick,
    reason: journal.restoreReason,
  });
  if (journal.requiresEpisodicRebuild) {
    await rebuildEpisodicEventsFromLocationRecentEvents(campaignId);
  }
  updateRestoreJournalPhase(campaignDir, journal, "complete");
  clearRestoreStaging(campaignDir);
  return true;
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

  if (await repairPendingCampaignRestoreBeforeLoad(campaignId)) {
    throw new Error(
      `Campaign ${campaignId} has a repaired pending restore; load the campaign before starting another restore.`,
    );
  }
  await assertCampaignStoreBundleRestorableWithEvidence({
    bundleDir,
    includeVectors: options.includeVectors,
  });
  const stagedPaths = prepareRestoreStaging({
    campaignDir,
    bundlePaths,
    includeVectors: options.includeVectors,
  });
  const journal: RestoreJournal = {
    schemaVersion: 1,
    campaignId,
    bundleDir,
    includeVectors: options.includeVectors,
    stagedDir: path.dirname(stagedPaths.dbPath),
    restoreReason:
      options.restoreReason ??
      (options.includeVectors ? "checkpoint restored" : "turn snapshot restored"),
    requiresEpisodicRebuild: !options.includeVectors,
    phase: "prepared",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  writeRestoreJournal(campaignDir, journal);

  await applyStagedRestore({
    campaignId,
    campaignDir,
    journal,
  });
}
