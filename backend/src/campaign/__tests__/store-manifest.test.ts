import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as lancedb from "@lancedb/lancedb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns } from "../../db/schema.js";
import {
  PHASE95_REQUIRED_STORE_KEYS,
  PHASE95_SQLITE_STORE_TABLES,
} from "../../engine/gameplay-control-plane-contract.js";
import { captureCampaignBundle } from "../restore-bundle.js";
import {
  assertCampaignStoreBundleRestorable,
  readCampaignStoreBundleManifest,
} from "../store-manifest.js";

const CAMPAIGN_ID = "manifest-campaign";

let tempRoot = "";
let previousCampaignsRoot: string | undefined;

function campaignDir(): string {
  return path.join(tempRoot, CAMPAIGN_ID);
}

function seedCampaign(): void {
  const now = Date.now();
  fs.mkdirSync(path.join(campaignDir(), "vectors"), { recursive: true });
  fs.writeFileSync(
    path.join(campaignDir(), "config.json"),
    JSON.stringify({
      name: "Manifest Campaign",
      premise: "A manifest test campaign.",
      generationComplete: true,
      createdAt: now,
      updatedAt: now,
    }),
    "utf-8",
  );
  fs.writeFileSync(
    path.join(campaignDir(), "chat_history.json"),
    JSON.stringify([{ role: "assistant", content: "Opening beat." }]),
    "utf-8",
  );
  connectDb(path.join(campaignDir(), "state.db"));
  runMigrations();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Manifest Campaign",
    premise: "A manifest test campaign.",
    createdAt: now,
    updatedAt: now,
  }).run();
}

async function seedVectorTables(): Promise<void> {
  const db = await lancedb.connect(path.join(campaignDir(), "vectors"));
  await db.createTable("episodic_events", [
    {
      id: "event-1",
      campaignId: CAMPAIGN_ID,
      text: "First memory.",
      tick: 1,
      vector: [0.1, 0.2, 0.3],
    },
    {
      id: "event-2",
      campaignId: CAMPAIGN_ID,
      text: "Second memory.",
      tick: 2,
      vector: [0.2, 0.3, 0.4],
    },
  ]);
  await db.createTable("lore_cards", [
    {
      id: "lore-1",
      term: "Lantern Law",
      definition: "A compact rule of the road.",
      category: "concept",
      vector: [0.4, 0.5, 0.6],
    },
  ]);
}

describe("campaign store bundle manifest", () => {
  beforeEach(() => {
    previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wf-store-manifest-"));
    process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
    fs.mkdirSync(campaignDir(), { recursive: true });
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    if (previousCampaignsRoot === undefined) {
      delete process.env.GSD_CAMPAIGNS_ROOT;
    } else {
      process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
    }
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("writes a fail-closed manifest for turn rollback bundles without vectors", async () => {
    const bundleDir = path.join(campaignDir(), ".turn-boundaries", "last-turn-boundary");

    await captureCampaignBundle(CAMPAIGN_ID, bundleDir, {
      includeVectors: false,
      purpose: "turn_snapshot",
    });

    const manifest = readCampaignStoreBundleManifest(bundleDir);

    expect(manifest).toMatchObject({
      campaignId: CAMPAIGN_ID,
      purpose: "turn_snapshot",
      includeVectors: false,
    });
    expect(manifest.stores.map((entry) => entry.store).sort())
      .toEqual([...PHASE95_REQUIRED_STORE_KEYS].sort());
    expect(manifest.stores.find((entry) => entry.store === "vectors:lore_cards"))
      .toMatchObject({
        captureStatus: "excluded_by_policy",
        bundlePath: null,
      });
    expect(manifest.stores.find((entry) => entry.store === "artifact:images"))
      .toMatchObject({
        captureStatus: "external",
        bundlePath: null,
      });
    expect(manifest.stores.find((entry) => entry.store === "artifact:turn_boundaries"))
      .toMatchObject({
        captureStatus: "external",
        bundlePath: null,
      });
    for (const table of PHASE95_SQLITE_STORE_TABLES) {
      expect(manifest.stores.find((entry) => entry.store === `sqlite:${table}`))
        .toMatchObject({
          captureStatus: "captured",
          bundlePath: "state.db",
          rowCount: expect.any(Number),
          evidenceHash: expect.any(String),
        });
    }
    expect(manifest.stores.find((entry) => entry.store === "vectors:episodic_events"))
      .toMatchObject({
        captureStatus: "excluded_by_policy",
        bundlePath: null,
      });
    expect(() => assertCampaignStoreBundleRestorable({
      bundleDir,
      includeVectors: false,
    })).not.toThrow();
    expect(() => assertCampaignStoreBundleRestorable({
      bundleDir,
      includeVectors: true,
    })).toThrow(/vectors/i);
  });

  it("covers every migrated gameplay SQLite table in the Phase 95 store manifest", () => {
    const migratedTables = (
      getSqliteConnection()
        .prepare(`
          SELECT name
          FROM sqlite_master
          WHERE type = 'table'
            AND name NOT LIKE 'sqlite_%'
            AND name != '__drizzle_migrations'
          ORDER BY name
        `)
        .all() as Array<{ name: string }>
    ).map((row) => row.name);

    expect([...PHASE95_SQLITE_STORE_TABLES].sort()).toEqual(migratedTables);
    for (const table of migratedTables) {
      expect(PHASE95_REQUIRED_STORE_KEYS).toContain(`sqlite:${table}`);
    }
  });

  it("records vector capture when checkpoint bundles include vectors", async () => {
    await seedVectorTables();
    const bundleDir = path.join(campaignDir(), "checkpoints", "checkpoint-1");

    await captureCampaignBundle(CAMPAIGN_ID, bundleDir, {
      includeVectors: true,
      purpose: "checkpoint",
    });

    const manifest = readCampaignStoreBundleManifest(bundleDir);

    expect(manifest.stores.find((entry) => entry.store === "vectors:episodic_events"))
      .toMatchObject({
        captureStatus: "captured",
        bundlePath: "vectors/episodic_events.lance",
        rowCount: 2,
        evidenceHash: expect.any(String),
      });
    expect(manifest.stores.find((entry) => entry.store === "vectors:lore_cards"))
      .toMatchObject({
        captureStatus: "captured",
        bundlePath: "vectors/lore_cards.lance",
        rowCount: 1,
        evidenceHash: expect.any(String),
      });
    expect(() => assertCampaignStoreBundleRestorable({
      bundleDir,
      includeVectors: true,
    })).not.toThrow();
  });

  it("refuses to restore a bundle without a manifest", () => {
    const bundleDir = path.join(tempRoot, "manual-bundle-without-manifest");
    fs.mkdirSync(bundleDir, { recursive: true });
    fs.copyFileSync(path.join(campaignDir(), "state.db"), path.join(bundleDir, "state.db"));
    fs.copyFileSync(path.join(campaignDir(), "config.json"), path.join(bundleDir, "config.json"));
    fs.copyFileSync(
      path.join(campaignDir(), "chat_history.json"),
      path.join(bundleDir, "chat_history.json"),
    );

    expect(() => assertCampaignStoreBundleRestorable({
      bundleDir,
      includeVectors: false,
    })).toThrow(/manifest is missing/i);
  });
});
