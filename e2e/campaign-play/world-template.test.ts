import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import {
  materializeCampaignWorldTemplate,
  snapshotCampaignWorldTemplate,
  verifyCampaignWorldTemplatePackage,
} from "./world-template.js";

const roots: string[] = [];
const CAMPAIGN_ID = "campaign-template-source";

function fixture(characterCount = 0): {
  root: string;
  campaignsRoot: string;
  templatesRoot: string;
  runsRoot: string;
} {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "campaign-world-template-"));
  roots.push(root);
  const campaignsRoot = path.join(root, "campaigns");
  const campaignDirectory = path.join(campaignsRoot, CAMPAIGN_ID);
  const templatesRoot = path.join(root, "templates");
  const runsRoot = path.join(root, "runs");
  fs.mkdirSync(campaignDirectory, { recursive: true });
  fs.writeFileSync(path.join(campaignDirectory, "config.json"), '{"name":"Reusable World"}\n');
  fs.writeFileSync(path.join(campaignDirectory, "chat_history.json"), "[]\n");
  const sqlite = new Database(path.join(campaignDirectory, "state.db"));
  sqlite.exec(`
    CREATE TABLE campaign_play_states (
      campaign_id TEXT PRIMARY KEY,
      setup_phase TEXT NOT NULL,
      world_version INTEGER NOT NULL,
      runtime_revision INTEGER NOT NULL
    );
    CREATE TABLE campaign_worlds (
      campaign_id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      accepted_world_version INTEGER,
      accepted_content_hash TEXT
    );
    CREATE TABLE campaign_play_characters (campaign_id TEXT NOT NULL);
    CREATE TABLE campaign_play_turns (campaign_id TEXT NOT NULL);
  `);
  sqlite.prepare(`INSERT INTO campaign_play_states VALUES (?, 'character_required', 1, 1)`)
    .run(CAMPAIGN_ID);
  sqlite.prepare(`INSERT INTO campaign_worlds VALUES (?, 'accepted', 1, ?)`)
    .run(CAMPAIGN_ID, "a".repeat(64));
  for (let index = 0; index < characterCount; index += 1) {
    sqlite.prepare(`INSERT INTO campaign_play_characters VALUES (?)`).run(CAMPAIGN_ID);
  }
  sqlite.close();
  return { root, campaignsRoot, templatesRoot, runsRoot };
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("Campaign world templates", () => {
  it("snapshots one accepted world and materializes an isolated campaigns root", async () => {
    const paths = fixture();
    const snapshot = await snapshotCampaignWorldTemplate({
      campaignId: CAMPAIGN_ID,
      templateId: "reusable-world",
      campaignsRoot: paths.campaignsRoot,
      templatesRoot: paths.templatesRoot,
      sourceCommit: "test-commit",
    });

    expect(snapshot.manifest).toMatchObject({
      sourceCampaignId: CAMPAIGN_ID,
      sourceCommit: "test-commit",
      setupPhase: "character_required",
      characterCount: 0,
      turnCount: 0,
    });
    expect(snapshot.manifest.packageId).toBe(snapshot.manifest.templateId);
    expect(snapshot.manifest.manifestPath).toBe(path.join(snapshot.templateDirectory, "template.json"));
    expect(snapshot.manifest.packagePath).toBe(snapshot.templateDirectory);
    const packageBytesBefore = {
      manifest: fs.readFileSync(snapshot.manifestPath),
      state: fs.readFileSync(path.join(snapshot.templateDirectory, "state.db")),
      config: fs.readFileSync(path.join(snapshot.templateDirectory, "config.json")),
    };
    const other = fixture();
    const otherDb = new Database(path.join(other.campaignsRoot, CAMPAIGN_ID, "state.db"));
    otherDb.prepare("UPDATE campaign_worlds SET accepted_content_hash = ? WHERE campaign_id = ?")
      .run("b".repeat(64), CAMPAIGN_ID);
    otherDb.close();
    expect(verifyCampaignWorldTemplatePackage(snapshot.templateDirectory).manifest.acceptedContentHash)
      .toBe("a".repeat(64));
    expect(() => verifyCampaignWorldTemplatePackage(path.join(other.campaignsRoot, CAMPAIGN_ID)))
      .toThrow();
    const materialized = materializeCampaignWorldTemplate({
      templateDirectory: snapshot.templateDirectory,
      runId: "run-one",
      runsRoot: paths.runsRoot,
    });
    expect(materialized.campaignDirectory).toBe(
      path.join(paths.runsRoot, "run-one", "campaigns", CAMPAIGN_ID),
    );
    expect(fs.existsSync(path.join(materialized.campaignDirectory, "state.db"))).toBe(true);
    expect(fs.existsSync(path.join(materialized.campaignDirectory, "state.db-wal"))).toBe(false);
    fs.appendFileSync(path.join(materialized.campaignDirectory, "config.json"), "copy-only\n");
    expect(Buffer.compare(fs.readFileSync(snapshot.manifestPath), packageBytesBefore.manifest)).toBe(0);
    expect(Buffer.compare(fs.readFileSync(path.join(snapshot.templateDirectory, "state.db")), packageBytesBefore.state)).toBe(0);
    expect(Buffer.compare(fs.readFileSync(path.join(snapshot.templateDirectory, "config.json")), packageBytesBefore.config)).toBe(0);
    expect(verifyCampaignWorldTemplatePackage(snapshot.templateDirectory).manifest.packageSha256)
      .toBe(snapshot.manifest.packageSha256);
  });

  it("rejects a world after character creation", async () => {
    const paths = fixture(1);
    await expect(snapshotCampaignWorldTemplate({
      campaignId: CAMPAIGN_ID,
      templateId: "contaminated-world",
      campaignsRoot: paths.campaignsRoot,
      templatesRoot: paths.templatesRoot,
      sourceCommit: "test-commit",
    })).rejects.toThrow("zero characters and turns");
  });
});
