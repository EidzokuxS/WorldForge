import fs from "node:fs";
import path from "node:path";
import { getCampaignDir } from "../campaign/paths.js";
import { captureCampaignBundle, restoreCampaignBundle } from "../campaign/restore-bundle.js";
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
  await captureCampaignBundle(campaignId, bundleDir, { includeVectors: false });

  return {
    campaignId,
    bundleDir,
    capturedAt: Date.now(),
  };
}

export async function restoreSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot,
): Promise<void> {
  await restoreCampaignBundle(campaignId, snapshot.bundleDir, {
    includeVectors: false,
  });
  log.info(
    `Snapshot restored for campaign ${campaignId} from ${snapshot.bundleDir}`,
  );
}
