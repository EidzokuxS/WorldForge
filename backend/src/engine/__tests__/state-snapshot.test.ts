import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
  getSqliteConnection: vi.fn(),
  closeDb: vi.fn(),
}));

vi.mock("../../campaign/manager.js", () => ({
  readCampaignConfig: vi.fn(() => ({ currentTick: 7 })),
  loadCampaign: vi.fn(),
}));

vi.mock("../../campaign/paths.js", () => ({
  getCampaignDir: vi.fn(),
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    cpSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdtempSync: vi.fn(() => "/campaigns/test-campaign-123/.turn-boundaries/bundle-001"),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import { captureSnapshot, restoreSnapshot } from "../state-snapshot.js";
import { getDb, getSqliteConnection, closeDb } from "../../db/index.js";
import { loadCampaign, readCampaignConfig } from "../../campaign/manager.js";
import { getCampaignDir } from "../../campaign/paths.js";
import fs from "node:fs";

const CAMPAIGN_ID = "test-campaign-123";

describe("state snapshot rollback bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCampaignDir as Mock).mockReturnValue(`/campaigns/${CAMPAIGN_ID}`);
    (getDb as Mock).mockReturnValue({
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue({
        get: vi.fn().mockReturnValue({
          hp: 4,
          tags: '["brave"]',
          currentLocationId: "loc-1",
          equippedItems: '["blade"]',
          characterRecord: "{}",
          derivedTags: '["brave"]',
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({ run: vi.fn() }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({ run: vi.fn() }),
      }),
    });
    (getSqliteConnection as Mock).mockReturnValue({
      backup: vi.fn().mockResolvedValue(undefined),
    });
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 7 });
  });

  it("D-04/D-05 captures the authoritative pre-turn bundle with SQLite backup instead of live fs.copyFile", async () => {
    const snapshot = await captureSnapshot(CAMPAIGN_ID);

    expect(getSqliteConnection).toHaveBeenCalledTimes(1);
    const sqlite = (getSqliteConnection as Mock).mock.results[0]!.value as {
      backup: Mock;
    };
    expect(sqlite.backup).toHaveBeenCalledTimes(1);
    expect(sqlite.backup).toHaveBeenCalledWith(
      expect.stringContaining("state.db"),
    );

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("config.json"),
      expect.stringContaining("config.json"),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("chat_history.json"),
      expect.stringContaining("chat_history.json"),
    );
    expect(fs.copyFileSync).not.toHaveBeenCalledWith(
      expect.stringContaining("state.db"),
      expect.any(String),
    );
    expect(fs.cpSync).not.toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.any(String),
      expect.anything(),
    );

    expect(snapshot).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        bundleDir: expect.stringContaining(".turn-boundaries"),
      }),
    );
  });

  it("D-10/D-16 restores state.db, config.json, and chat_history.json from the same bundle while excluding vectors", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("bundle-001\\state.db"),
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("bundle-001\\config.json"),
      expect.stringContaining(`${CAMPAIGN_ID}\\config.json`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("bundle-001\\chat_history.json"),
      expect.stringContaining(`${CAMPAIGN_ID}\\chat_history.json`),
    );
    expect(fs.cpSync).not.toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.any(String),
      expect.anything(),
    );
  });

  it("D-04/D-05 invalidates stale runtime state before later gameplay reads by closing and reloading the campaign", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      spawnedNpcIds: [],
      spawnedItemIds: [],
      revealedLocationIds: [],
      createdRelationshipIds: [],
      createdChronicleIds: [],
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(loadCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect((closeDb as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (loadCampaign as Mock).mock.invocationCallOrder[0],
    );
  });
});
