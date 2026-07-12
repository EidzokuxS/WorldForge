import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { cloneCampaignCleanStart } from "../../backend/src/campaign/clone.js";
import { closeDb } from "../../backend/src/db/index.js";
import { openCampaignWorldDatabase } from "../../backend/src/campaign-world/world-database.js";
import {
  createSeededAcceptedCampaign,
  runAcceptedCampaignPlayReplay,
} from "./seeded-replay.js";

const PARENT_ID = "d16a0000-0000-4000-8000-000000000010";
const CHILD_ID = "d16a0000-0000-4000-8000-000000000011";
const CLONE_OPERATION_ID = "d16a0000-0000-4000-8000-000000000012";

let root = "";
let previousRoot: string | undefined;

beforeEach(() => {
  previousRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-provenance-replay-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
});

afterEach(() => {
  closeDb();
  if (previousRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function fileHash(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function acceptedSnapshot(campaignId: string): {
  bytes: string;
  contentHash: string;
} {
  const handle = openCampaignWorldDatabase(campaignId);
  try {
    const row = handle.sqlite.prepare(`SELECT accepted_snapshot_json AS bytes,
      accepted_content_hash AS contentHash FROM campaign_worlds WHERE campaign_id = ?`).get(
        campaignId,
      ) as { bytes: string; contentHash: string };
    return row;
  } finally {
    handle.close();
  }
}

function playTableCounts(campaignId: string): Record<string, number> {
  const handle = openCampaignWorldDatabase(campaignId);
  try {
    const tables = handle.sqlite.prepare(`SELECT name FROM sqlite_master
      WHERE type = 'table' AND name LIKE 'campaign_play_%' ORDER BY name`).all() as Array<{
        name: string;
      }>;
    return Object.fromEntries(tables.map(({ name }) => {
      const count = handle.sqlite.prepare(
        `SELECT count(*) AS count FROM "${name}" WHERE campaign_id = ?`,
      ).get(campaignId) as { count: number };
      return [name, count.count];
    }));
  } finally {
    handle.close();
  }
}

describe("Campaign Play clone provenance replay", () => {
  it("keeps the parent pristine while the child survives restart and a second action", async () => {
    createSeededAcceptedCampaign(root, PARENT_ID);
    const parentDirectory = path.join(root, PARENT_ID);
    const parentStatePath = path.join(parentDirectory, "state.db");
    const parentConfigPath = path.join(parentDirectory, "config.json");
    const parentAcceptedBefore = acceptedSnapshot(PARENT_ID);
    const parentStateHashBefore = fileHash(parentStatePath);
    const parentConfigHashBefore = fileHash(parentConfigPath);
    expect(Object.values(playTableCounts(PARENT_ID)).every((count) => count === 0)).toBe(true);

    closeDb();
    const clone = await cloneCampaignCleanStart({
      sourceCampaignId: PARENT_ID,
      targetCampaignId: CHILD_ID,
      cloneOperationId: CLONE_OPERATION_ID,
      now: 1_250,
    });
    const expectedParentSnapshotHash = crypto.createHash("sha256")
      .update(parentAcceptedBefore.bytes)
      .digest("hex");
    expect(clone.lineage).toMatchObject({
      cloneOperationId: CLONE_OPERATION_ID,
      parentCampaignId: PARENT_ID,
      childCampaignId: CHILD_ID,
      parentAcceptedSnapshotHash: expectedParentSnapshotHash,
    });
    expect(Object.values(playTableCounts(CHILD_ID)).every((count) => count === 0)).toBe(true);
    const childAcceptedBefore = acceptedSnapshot(CHILD_ID);
    expect(childAcceptedBefore.contentHash).toBe(parentAcceptedBefore.contentHash);

    const childRun = await runAcceptedCampaignPlayReplay(CHILD_ID, {
      playerActions: 2,
      policy: "peripheral",
      restartAfterPlayerActions: [1],
    });
    expect(childRun).toMatchObject({
      campaignId: CHILD_ID,
      openingTurns: 1,
      completedPlayerActions: 2,
      restartProjectionMatches: true,
      integrity: "ok",
      foreignKeyViolations: 0,
    });

    const childAcceptedAfter = acceptedSnapshot(CHILD_ID);
    expect(childAcceptedAfter).toEqual(childAcceptedBefore);
    const childHandle = openCampaignWorldDatabase(CHILD_ID);
    try {
      expect(childHandle.sqlite.prepare(`SELECT count(*) AS count FROM actors
        WHERE campaign_id = ? AND kind = 'person' AND controller = 'human' AND role = 'player'`).get(
          CHILD_ID,
        )).toEqual({ count: 1 });
      expect(childHandle.sqlite.prepare(`SELECT world_version AS worldVersion,
          runtime_revision AS runtimeRevision FROM campaign_play_states WHERE campaign_id = ?`).get(
            CHILD_ID,
          )).toMatchObject({
            worldVersion: expect.any(Number),
            runtimeRevision: expect.any(Number),
          });
      expect(childHandle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_turns
        WHERE campaign_id = ? AND stage = 'completed'`).get(CHILD_ID)).toEqual({ count: 3 });
      expect(childHandle.sqlite.prepare(`SELECT count(*) AS count FROM campaign_play_observations
        WHERE campaign_id = ?`).get(CHILD_ID)).toEqual({ count: childRun.observationCount });
    } finally {
      childHandle.close();
    }

    expect(acceptedSnapshot(PARENT_ID)).toEqual(parentAcceptedBefore);
    expect(fileHash(parentStatePath)).toBe(parentStateHashBefore);
    expect(fileHash(parentConfigPath)).toBe(parentConfigHashBefore);
    expect(Object.values(playTableCounts(PARENT_ID)).every((count) => count === 0)).toBe(true);
  }, 60_000);
});
