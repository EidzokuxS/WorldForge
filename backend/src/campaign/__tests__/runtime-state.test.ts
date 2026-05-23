import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertActiveTurnLease,
  clearCampaignRuntimeState,
  clearPendingRollbackIntent,
  endTurn,
  getPendingRollbackIntent,
  hasActiveTurn,
  setPendingRollbackIntent,
  tryBeginTurn,
} from "../runtime-state.js";

const CAMPAIGN_ID = "runtime-state-test";

let tempRoot: string;
let previousCampaignRoot: string | undefined;

function campaignDir(): string {
  return path.join(tempRoot, CAMPAIGN_ID);
}

function activeLeasePath(): string {
  return path.join(campaignDir(), ".turn-boundaries", "active-turn-lease.json");
}

function reclaimLockPath(): string {
  return path.join(campaignDir(), ".turn-boundaries", "active-turn-lease.reclaim-lock.json");
}

function pendingRollbackIntentPath(): string {
  return path.join(campaignDir(), ".turn-boundaries", "pending-rollback-intent.json");
}

function readLease(): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(activeLeasePath(), "utf8")) as Record<string, unknown>;
}

beforeEach(() => {
  previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wf-runtime-state-"));
  process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
  fs.mkdirSync(campaignDir(), { recursive: true });
  clearCampaignRuntimeState(CAMPAIGN_ID);
});

afterEach(() => {
  vi.restoreAllMocks();
  clearCampaignRuntimeState(CAMPAIGN_ID);
  if (previousCampaignRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("campaign runtime active turn lease", () => {
  it("blocks a second turn through the durable lease until the owner releases it", () => {
    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(true);
    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(true);
    expect(fs.existsSync(activeLeasePath())).toBe(true);

    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(false);

    endTurn(CAMPAIGN_ID);

    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(false);
    expect(fs.existsSync(activeLeasePath())).toBe(false);
    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(true);
  });

  it("does not release a durable lease that was stolen by a newer owner", () => {
    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(true);
    const firstLease = readLease();
    const stolenLease = {
      ...firstLease,
      token: "newer-owner-token",
      owner: "pid:newer",
      heartbeatAt: Date.now(),
    };
    fs.writeFileSync(activeLeasePath(), JSON.stringify(stolenLease, null, 2), "utf8");

    expect(() => assertActiveTurnLease(CAMPAIGN_ID)).toThrow("was lost");
    endTurn(CAMPAIGN_ID);

    expect(readLease()).toEqual(stolenLease);
  });

  it("does not claim a turn when another process creates the lease during acquisition", () => {
    const realOpenSync = fs.openSync.bind(fs);
    let injectedRace = false;
    vi.spyOn(fs, "openSync").mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      if (!injectedRace && String(file) === activeLeasePath() && flags === "wx") {
        injectedRace = true;
        fs.writeFileSync(
          activeLeasePath(),
          JSON.stringify({
            campaignId: CAMPAIGN_ID,
            token: "competitor-token",
            owner: "pid:competitor",
            startedAt: Date.now(),
            heartbeatAt: Date.now(),
          }, null, 2),
          "utf8",
        );
        const error = new Error("lease exists") as NodeJS.ErrnoException;
        error.code = "EEXIST";
        throw error;
      }
      return realOpenSync(file, flags, mode);
    }) as typeof fs.openSync);

    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(false);
    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(true);
    expect(readLease()).toEqual(
      expect.objectContaining({
        token: "competitor-token",
        owner: "pid:competitor",
      }),
    );
  });

  it("reclaims a stale valid lease under the same fence used for malformed reclaim", () => {
    fs.mkdirSync(path.dirname(activeLeasePath()), { recursive: true });
    fs.writeFileSync(
      activeLeasePath(),
      JSON.stringify({
        campaignId: CAMPAIGN_ID,
        token: "stale-token",
        owner: "pid:stale",
        startedAt: Date.now() - 3 * 60 * 60 * 1000,
        heartbeatAt: Date.now() - 3 * 60 * 60 * 1000,
      }, null, 2),
      "utf8",
    );

    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(false);
    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(true);
    const reclaimedLease = readLease();
    expect(reclaimedLease).toEqual(expect.objectContaining({ campaignId: CAMPAIGN_ID }));
    expect(reclaimedLease.token).not.toBe("stale-token");
  });

  it("does not delete a valid lease created by another stale-valid reclaimer", () => {
    fs.mkdirSync(path.dirname(activeLeasePath()), { recursive: true });
    fs.writeFileSync(
      activeLeasePath(),
      JSON.stringify({
        campaignId: CAMPAIGN_ID,
        token: "expired-token",
        owner: "pid:expired",
        startedAt: Date.now() - 3 * 60 * 60 * 1000,
        heartbeatAt: Date.now() - 3 * 60 * 60 * 1000,
      }, null, 2),
      "utf8",
    );
    const competitorLease = {
      campaignId: CAMPAIGN_ID,
      token: "competitor-valid-token",
      owner: "pid:competitor",
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
    };
    const realOpenSync = fs.openSync.bind(fs);
    let injectedCompetitorLease = false;
    vi.spyOn(fs, "openSync").mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const fd = realOpenSync(file, flags, mode);
      if (!injectedCompetitorLease && String(file) === reclaimLockPath() && flags === "wx") {
        injectedCompetitorLease = true;
        fs.writeFileSync(activeLeasePath(), JSON.stringify(competitorLease, null, 2), "utf8");
      }
      return fd;
    }) as typeof fs.openSync);

    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(false);
    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(true);
    expect(readLease()).toEqual(competitorLease);
  });

  it("does not steal a fresh malformed lease that may still be a writer in progress", () => {
    fs.mkdirSync(path.dirname(activeLeasePath()), { recursive: true });
    fs.writeFileSync(activeLeasePath(), "{", "utf8");

    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(true);
    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(false);
    expect(fs.readFileSync(activeLeasePath(), "utf8")).toBe("{");
  });

  it("reclaims a stale malformed lease instead of wedging the campaign forever", () => {
    fs.mkdirSync(path.dirname(activeLeasePath()), { recursive: true });
    fs.writeFileSync(activeLeasePath(), "", "utf8");
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(activeLeasePath(), staleTime, staleTime);

    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(false);
    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(true);
    expect(readLease()).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        token: expect.any(String),
      }),
    );
  });

  it("does not delete a valid lease created by another stale-malformed reclaimer", () => {
    fs.mkdirSync(path.dirname(activeLeasePath()), { recursive: true });
    fs.writeFileSync(activeLeasePath(), "{", "utf8");
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(activeLeasePath(), staleTime, staleTime);
    const competitorLease = {
      campaignId: CAMPAIGN_ID,
      token: "competitor-token",
      owner: "pid:competitor",
      startedAt: Date.now(),
      heartbeatAt: Date.now(),
    };
    const realOpenSync = fs.openSync.bind(fs);
    let injectedCompetitorLease = false;
    vi.spyOn(fs, "openSync").mockImplementation(((file: fs.PathLike, flags: fs.OpenMode, mode?: fs.Mode) => {
      const fd = realOpenSync(file, flags, mode);
      if (!injectedCompetitorLease && String(file) === reclaimLockPath() && flags === "wx") {
        injectedCompetitorLease = true;
        fs.writeFileSync(activeLeasePath(), JSON.stringify(competitorLease, null, 2), "utf8");
      }
      return fd;
    }) as typeof fs.openSync);

    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(false);
    expect(hasActiveTurn(CAMPAIGN_ID)).toBe(true);
    expect(readLease()).toEqual(competitorLease);
  });

  it("recovers a stale malformed reclaim lock left by a crashed reclaimer", () => {
    fs.mkdirSync(path.dirname(activeLeasePath()), { recursive: true });
    fs.writeFileSync(activeLeasePath(), "{", "utf8");
    fs.writeFileSync(reclaimLockPath(), "{", "utf8");
    const staleTime = new Date(Date.now() - 60_000);
    fs.utimesSync(activeLeasePath(), staleTime, staleTime);
    fs.utimesSync(reclaimLockPath(), staleTime, staleTime);

    expect(tryBeginTurn(CAMPAIGN_ID)).toBe(true);
    expect(readLease()).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        token: expect.any(String),
      }),
    );
  });
});

describe("campaign runtime rollback intent", () => {
  it("persists rollback intent outside restored SQLite state until cleanup succeeds", () => {
    setPendingRollbackIntent({
      campaignId: CAMPAIGN_ID,
      route: "/action",
      turnId: "turn-rollback",
      snapshot: {
        campaignId: CAMPAIGN_ID,
        snapshotId: "snapshot-rollback",
        bundleDir: path.join(campaignDir(), ".turn-boundaries", "snapshots", "snapshot-rollback"),
        capturedAt: Date.now(),
        capturedWorldVersion: 7,
        capturedWorldTimeMinutes: 42,
        fileHashes: {
          stateDb: "state-hash",
          config: "config-hash",
          chatHistory: "chat-hash",
          vectors: null,
        },
      },
      eventIds: ["evt-1", "evt-1", " ", "evt-2"],
    });

    expect(fs.existsSync(pendingRollbackIntentPath())).toBe(true);
    expect(getPendingRollbackIntent(CAMPAIGN_ID)).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        route: "/action",
        turnId: "turn-rollback",
        eventIds: ["evt-1", "evt-2"],
        snapshot: expect.objectContaining({
          snapshotId: "snapshot-rollback",
          fileHashes: expect.objectContaining({ vectors: null }),
        }),
      }),
    );

    clearPendingRollbackIntent(CAMPAIGN_ID);
    expect(getPendingRollbackIntent(CAMPAIGN_ID)).toBeNull();
  });

  it("fails closed on malformed rollback intent instead of treating it as absent", () => {
    fs.mkdirSync(path.dirname(pendingRollbackIntentPath()), { recursive: true });
    fs.writeFileSync(pendingRollbackIntentPath(), "{", "utf8");

    expect(() => getPendingRollbackIntent(CAMPAIGN_ID)).toThrow(
      "Pending rollback intent",
    );
  });
});
