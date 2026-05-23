import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createHash } from "node:crypto";

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
  getCampaignConfigPath: vi.fn((campaignId: string) => `/campaigns/${campaignId}/config.json`),
  getChatHistoryPath: vi.fn((campaignId: string) => `/campaigns/${campaignId}/chat_history.json`),
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    cpSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdtempSync: vi.fn(() => "/campaigns/test-campaign-123/.turn-boundaries/bundle-001"),
    readdirSync: vi.fn(() => []),
    readFileSync: vi.fn((filePath: string) => {
      if (filePath.endsWith("snapshot.json")) {
        return JSON.stringify({
          version: 1,
          snapshot: {
            campaignId: CAMPAIGN_ID,
            snapshotId: "snapshot-001",
            fileHashes: {
              stateDb: "fad8686a9710f46d87296dbc959a46b88c5683be10e9210764511de890f9b08a",
              config: "1af4e7cf3a6368adcce1912bd2b0be2b3055ceb4a508d560d5f42ea0acaa4ded",
              chatHistory: "222f4668df358a1b96c603c4b45a50d296147d58a3905873672d93d38250fa92",
            },
          },
        });
      }
      return Buffer.from(filePath);
    }),
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

function hashTestContent(value: string): string {
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

describe("state snapshot rollback bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getCampaignDir as Mock).mockReturnValue(`/campaigns/${CAMPAIGN_ID}`);
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readdirSync).mockReturnValue([]);
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      const normalized = String(filePath);
      if (normalized.endsWith("snapshot.json")) {
        return JSON.stringify({
          version: 1,
          snapshot: {
            campaignId: CAMPAIGN_ID,
            snapshotId: "snapshot-001",
            fileHashes: {
              stateDb: "fad8686a9710f46d87296dbc959a46b88c5683be10e9210764511de890f9b08a",
              config: "1af4e7cf3a6368adcce1912bd2b0be2b3055ceb4a508d560d5f42ea0acaa4ded",
              chatHistory: "222f4668df358a1b96c603c4b45a50d296147d58a3905873672d93d38250fa92",
            },
          },
        });
      }
      return Buffer.from(normalized);
    });
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
    expect(fs.cpSync).toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.any(String),
      { recursive: true },
    );

    expect(snapshot).toEqual(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        snapshotId: expect.any(String),
        bundleDir: expect.stringContaining(".turn-boundaries"),
        capturedWorldVersion: 0,
        capturedWorldTimeMinutes: 0,
        fileHashes: {
          stateDb: expect.any(String),
          config: expect.any(String),
          chatHistory: expect.any(String),
          vectors: expect.any(String),
        },
      }),
    );
  });

  it("captures immutable turn snapshot bundles instead of overwriting a singleton boundary", async () => {
    const first = await captureSnapshot(CAMPAIGN_ID);
    const second = await captureSnapshot(CAMPAIGN_ID);

    expect(first.snapshotId).not.toBe(second.snapshotId);
    expect(first.bundleDir).not.toBe(second.bundleDir);
    expect(first.bundleDir).toContain(".turn-boundaries");
    expect(first.bundleDir).toContain("snapshots");
    expect(second.bundleDir).toContain("snapshots");
    expect(first.bundleDir).not.toContain("last-turn-boundary");
    expect(second.bundleDir).not.toContain("last-turn-boundary");
  });

  it("D-10/D-16 restores state.db, config.json, chat_history.json, and vectors from the same bundle", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-001",
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/snapshots/snapshot-001",
      capturedAt: Date.now(),
      capturedWorldVersion: 0,
      capturedWorldTimeMinutes: 0,
      fileHashes: null,
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("snapshots\\snapshot-001\\state.db"),
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("snapshots\\snapshot-001\\config.json"),
      expect.stringContaining(`${CAMPAIGN_ID}/config.json`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("snapshots\\snapshot-001\\chat_history.json"),
      expect.stringContaining(`${CAMPAIGN_ID}/chat_history.json`),
    );
    expect(fs.cpSync).toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.any(String),
      { recursive: true },
    );
  });

  it("removes live vectors when the restored snapshot had no vector directory", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-empty-vectors",
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/snapshots/snapshot-empty-vectors",
      capturedAt: Date.now(),
      capturedWorldVersion: 0,
      capturedWorldTimeMinutes: 0,
      fileHashes: {
        stateDb: hashTestContent("state"),
        config: hashTestContent("config"),
        chatHistory: hashTestContent("chat"),
        vectors: null,
      },
    } as Awaited<ReturnType<typeof captureSnapshot>>;
    vi.mocked(fs.existsSync).mockImplementation((filePath) => {
      const normalized = String(filePath).replaceAll("\\", "/");
      return !normalized.endsWith("snapshots/snapshot-empty-vectors/vectors");
    });
    vi.mocked(fs.readFileSync).mockImplementation((filePath) => {
      const normalized = String(filePath).replaceAll("\\", "/");
      if (normalized.endsWith("snapshot.json")) {
        return JSON.stringify({
          version: 1,
          snapshot: {
            campaignId: CAMPAIGN_ID,
            snapshotId: "snapshot-empty-vectors",
            fileHashes: snapshot.fileHashes,
          },
        });
      }
      if (normalized.endsWith("/state.db")) return Buffer.from("state");
      if (normalized.endsWith("/config.json")) return Buffer.from("config");
      if (normalized.endsWith("/chat_history.json")) return Buffer.from("chat");
      return Buffer.from(String(filePath));
    });
    vi.mocked(fs.cpSync).mockClear();

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining(`${CAMPAIGN_ID}\\vectors`),
      { recursive: true, force: true },
    );
    expect(fs.cpSync).not.toHaveBeenCalledWith(
      expect.stringContaining("snapshot-empty-vectors"),
      expect.any(String),
      expect.anything(),
    );
  });

  it("rejects a swapped or corrupted snapshot bundle before restore mutates campaign files", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-001",
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/snapshots/snapshot-001",
      capturedAt: Date.now(),
      capturedWorldVersion: 0,
      capturedWorldTimeMinutes: 0,
      fileHashes: {
        stateDb: "not-the-current-state-db-hash",
        config: "not-the-current-config-hash",
        chatHistory: "not-the-current-chat-hash",
      },
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    vi.mocked(fs.copyFileSync).mockClear();

    await expect(restoreSnapshot(CAMPAIGN_ID, snapshot)).rejects.toThrow(
      "bundle hash mismatch",
    );

    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it("rejects restore when neither runtime provenance nor the bundle manifest carries hashes", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-001",
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/snapshots/snapshot-001",
      capturedAt: Date.now(),
      capturedWorldVersion: 0,
      capturedWorldTimeMinutes: 0,
      fileHashes: null,
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    vi.mocked(fs.readFileSync).mockImplementationOnce(() => JSON.stringify({
      version: 1,
      snapshot: {
        campaignId: CAMPAIGN_ID,
        snapshotId: "snapshot-001",
      },
    }));
    vi.mocked(fs.copyFileSync).mockClear();

    await expect(restoreSnapshot(CAMPAIGN_ID, snapshot)).rejects.toThrow(
      "no bundle hash manifest",
    );

    expect(fs.copyFileSync).not.toHaveBeenCalled();
  });

  it("D-04/D-05 invalidates stale runtime state before later gameplay reads by closing and reloading the campaign", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-001",
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/snapshots/snapshot-001",
      capturedAt: Date.now(),
      capturedWorldVersion: 0,
      capturedWorldTimeMinutes: 0,
      fileHashes: null,
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(closeDb).toHaveBeenCalledTimes(1);
    expect(loadCampaign).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect((closeDb as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (loadCampaign as Mock).mock.invocationCallOrder[0],
    );
  });

  it("removes stale SQLite sidecars before reopening a restored turn snapshot", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      snapshotId: "snapshot-001",
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/snapshots/snapshot-001",
      capturedAt: Date.now(),
      capturedWorldVersion: 0,
      capturedWorldTimeMinutes: 0,
      fileHashes: null,
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db-wal`),
      { force: true },
    );
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db-shm`),
      { force: true },
    );
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db-journal`),
      { force: true },
    );
    expect((fs.rmSync as Mock).mock.invocationCallOrder[0]).toBeLessThan(
      (fs.copyFileSync as Mock).mock.invocationCallOrder[0],
    );
    expect((fs.rmSync as Mock).mock.invocationCallOrder.at(-1)!).toBeLessThan(
      (loadCampaign as Mock).mock.invocationCallOrder[0],
    );
  });
});
