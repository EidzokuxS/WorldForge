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
  getCampaignConfigPath: vi.fn((campaignId: string) => `/campaigns/${campaignId}/config.json`),
  getChatHistoryPath: vi.fn((campaignId: string) => `/campaigns/${campaignId}/chat_history.json`),
}));

vi.mock("../../campaign/store-manifest.js", () => ({
  STORE_BUNDLE_MANIFEST_FILENAME: "store-manifest.json",
  createCampaignStoreBundleManifest: vi.fn((input) => ({
    schemaVersion: 1,
    campaignId: input.campaignId,
    purpose: input.purpose ?? "checkpoint",
    includeVectors: input.includeVectors,
    capturedAt: 1,
    stores: [],
  })),
  writeCampaignStoreBundleManifest: vi.fn(),
  assertCampaignStoreBundleRestorable: vi.fn(),
  assertCampaignStoreBundleRestorableWithEvidence: vi.fn(async () => ({
    schemaVersion: 1,
    stores: [],
  })),
  assertCampaignStoreBundleEvidenceMatchesManifest: vi.fn(async () => ({
    schemaVersion: 1,
    stores: [],
  })),
  readCampaignStoreBundleManifestDigest: vi.fn(() => "source-manifest-digest"),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  clearPendingCommittedEvents: vi.fn(),
  rebuildEpisodicEventsFromLocationRecentEvents: vi.fn(async () => ({ rebuiltCount: 0 })),
}));

vi.mock("../living-world-authority.js", () => ({
  invalidateAuthorityAfterRestore: vi.fn(),
  readWorldClock: vi.fn(() => ({
    worldVersion: 7,
    worldTimeMinutes: 90,
    currentTick: 7,
  })),
}));

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    copyFileSync: vi.fn(),
    cpSync: vi.fn(),
    existsSync: vi.fn(() => true),
    mkdtempSync: vi.fn(() => "/campaigns/test-campaign-123/.turn-boundaries/bundle-001"),
    readFileSync: vi.fn(),
    renameSync: vi.fn(),
    rmSync: vi.fn(),
    writeFileSync: vi.fn(),
  },
}));

import { captureSnapshot, restoreSnapshot } from "../state-snapshot.js";
import { getDb, getSqliteConnection, closeDb } from "../../db/index.js";
import { loadCampaign, readCampaignConfig } from "../../campaign/manager.js";
import { getCampaignDir } from "../../campaign/paths.js";
import { assertCampaignStoreBundleRestorableWithEvidence } from "../../campaign/store-manifest.js";
import {
  finalizePendingCampaignRestoreAfterLoad,
  repairPendingCampaignRestoreBeforeLoad,
} from "../../campaign/restore-bundle.js";

import {
  clearPendingCommittedEvents,
  rebuildEpisodicEventsFromLocationRecentEvents,
} from "../../vectors/episodic-events.js";
import fs from "node:fs";

const CAMPAIGN_ID = "test-campaign-123";
const writtenFileContents = new Map<string, string>();

describe("state snapshot rollback bundle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    writtenFileContents.clear();
    (getCampaignDir as Mock).mockReturnValue(`/campaigns/${CAMPAIGN_ID}`);
    (fs.existsSync as Mock).mockImplementation(
      (targetPath: string) => {
        const normalizedPath = String(targetPath);
        if (normalizedPath.endsWith("restore-journal.json")) {
          return writtenFileContents.has(normalizedPath);
        }
        return true;
      },
    );
    (fs.writeFileSync as Mock).mockImplementation(
      (targetPath: string, contents: string) => {
        writtenFileContents.set(String(targetPath), String(contents));
      },
    );
    (fs.renameSync as Mock).mockImplementation((from: string, to: string) => {
      const contents = writtenFileContents.get(String(from));
      if (contents !== undefined) {
        writtenFileContents.set(String(to), contents);
        writtenFileContents.delete(String(from));
      }
    });
    (fs.readFileSync as Mock).mockImplementation((targetPath: string) => {
      const normalizedPath = String(targetPath);
      if (writtenFileContents.has(normalizedPath)) {
        return writtenFileContents.get(normalizedPath);
      }
      throw new Error(`Unexpected readFileSync(${normalizedPath})`);
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
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({ run: vi.fn() }),
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

  it("D-10/D-16 restores state.db, config.json, and chat_history.json while purging rebuild-only vectors", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      capturedAt: Date.now(),
    } as Awaited<ReturnType<typeof captureSnapshot>>;

    await restoreSnapshot(CAMPAIGN_ID, snapshot);

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("bundle-001\\state.db"),
      expect.stringContaining(".restore-staging\\current\\state.db"),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".restore-staging\\current\\state.db"),
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("bundle-001\\config.json"),
      expect.stringContaining(".restore-staging\\current\\config.json"),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".restore-staging\\current\\config.json"),
      expect.stringContaining(`${CAMPAIGN_ID}/config.json`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining("bundle-001\\chat_history.json"),
      expect.stringContaining(".restore-staging\\current\\chat_history.json"),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".restore-staging\\current\\chat_history.json"),
      expect.stringContaining(`${CAMPAIGN_ID}/chat_history.json`),
    );
    expect(fs.cpSync).not.toHaveBeenCalledWith(
      expect.stringContaining("vectors"),
      expect.any(String),
      expect.anything(),
    );
    expect(fs.rmSync).toHaveBeenCalledWith(
      expect.stringContaining("vectors\\episodic_events.lance"),
      expect.anything(),
    );
    expect(fs.rmSync).not.toHaveBeenCalledWith(
      expect.stringContaining("vectors\\lore_cards.lance"),
      expect.anything(),
    );
    expect(rebuildEpisodicEventsFromLocationRecentEvents).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(clearPendingCommittedEvents).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("D-04/D-05 invalidates stale runtime state before later gameplay reads by closing and reloading the campaign", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      capturedAt: Date.now(),
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
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      capturedAt: Date.now(),
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
    const sidecarRemovalOrders = (fs.rmSync as Mock).mock.calls
      .map((call, index) => ({
        target: String(call[0]),
        order: (fs.rmSync as Mock).mock.invocationCallOrder[index],
      }))
      .filter((call) => call.target.includes(`${CAMPAIGN_ID}\\state.db-`))
      .map((call) => call.order);
    expect(Math.max(...sidecarRemovalOrders)).toBeLessThan(
      (loadCampaign as Mock).mock.invocationCallOrder[0],
    );
  });

  it("rolls a pending restore journal forward after a crash leaves DB copied before config/chat", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      capturedAt: Date.now(),
    } as Awaited<ReturnType<typeof captureSnapshot>>;
    let failedOnce = false;
    (fs.copyFileSync as Mock).mockImplementation((from: string, to: string) => {
      if (
        !failedOnce &&
        String(from).includes(".restore-staging\\current\\config.json") &&
        String(to).endsWith("config.json")
      ) {
        failedOnce = true;
        throw new Error("simulated crash after DB copy");
      }
    });

    await expect(restoreSnapshot(CAMPAIGN_ID, snapshot)).rejects.toThrow(
      "simulated crash after DB copy",
    );
    expect([...writtenFileContents.keys()].some((filePath) =>
      filePath.endsWith("restore-journal.json"),
    )).toBe(true);

    (fs.copyFileSync as Mock).mockImplementation(() => undefined);

    await repairPendingCampaignRestoreBeforeLoad(CAMPAIGN_ID);
    await loadCampaign(CAMPAIGN_ID);
    await finalizePendingCampaignRestoreAfterLoad(CAMPAIGN_ID);

    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".restore-staging\\current\\state.db"),
      expect.stringContaining(`${CAMPAIGN_ID}\\state.db`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".restore-staging\\current\\config.json"),
      expect.stringContaining(`${CAMPAIGN_ID}/config.json`),
    );
    expect(fs.copyFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".restore-staging\\current\\chat_history.json"),
      expect.stringContaining(`${CAMPAIGN_ID}/chat_history.json`),
    );
    expect(clearPendingCommittedEvents).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(rebuildEpisodicEventsFromLocationRecentEvents).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("refuses to repair a pending turn snapshot restore when staged evidence is tampered", async () => {
    const snapshot = {
      campaignId: CAMPAIGN_ID,
      bundleDir: "/campaigns/test-campaign-123/.turn-boundaries/bundle-001",
      capturedAt: Date.now(),
    } as Awaited<ReturnType<typeof captureSnapshot>>;
    (closeDb as Mock).mockImplementationOnce(() => {
      throw new Error("simulated crash before live apply");
    });

    await expect(restoreSnapshot(CAMPAIGN_ID, snapshot)).rejects.toThrow(
      "simulated crash before live apply",
    );
    expect([...writtenFileContents.keys()].some((filePath) =>
      filePath.endsWith("restore-journal.json"),
    )).toBe(true);

    (fs.copyFileSync as Mock).mockClear();
    (loadCampaign as Mock).mockClear();
    (clearPendingCommittedEvents as Mock).mockClear();
    (rebuildEpisodicEventsFromLocationRecentEvents as Mock).mockClear();
    (assertCampaignStoreBundleRestorableWithEvidence as Mock).mockImplementation(
      async ({ bundleDir }: { bundleDir: string }) => {
        if (String(bundleDir).includes(".restore-staging")) {
          throw new Error("Campaign store bundle evidence hash mismatch for state.db.");
        }
        return { schemaVersion: 1, stores: [] };
      },
    );

    await expect(repairPendingCampaignRestoreBeforeLoad(CAMPAIGN_ID)).rejects.toThrow(
      /evidence hash mismatch.*state\.db/i,
    );
    expect(assertCampaignStoreBundleRestorableWithEvidence).toHaveBeenCalledWith(
      expect.objectContaining({
        bundleDir: expect.stringContaining(".restore-staging\\current"),
        includeVectors: false,
      }),
    );
    expect((fs.copyFileSync as Mock).mock.calls.some((call) =>
      String(call[0]).includes(".restore-staging\\current\\state.db")
      && String(call[1]).includes(`${CAMPAIGN_ID}\\state.db`)
    )).toBe(false);
    expect(loadCampaign).not.toHaveBeenCalled();
    expect(clearPendingCommittedEvents).not.toHaveBeenCalled();
    expect(rebuildEpisodicEventsFromLocationRecentEvents).not.toHaveBeenCalled();
  });
});
