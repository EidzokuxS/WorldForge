import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb } from "../db/index.js";
import { openCampaignWorldDatabase } from "../campaign-world/world-database.js";
import { createCampaignWorldRepository } from "../campaign-world/world-repository.js";
import {
  advanceBuildToPersistence,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "../campaign-world/world-repository.test-support.js";
import { calculateCampaignWorldContentHash } from "../campaign-world/world-snapshot.js";
import { openCampaignPlayDatabase } from "./campaign-play-database.js";
import { createCampaignPlayReadModel } from "./campaign-play-read-model.js";
import { createCampaignPlayStateRepository } from "./campaign-play-state-repository.js";
import { CampaignPlayTurnRepositoryError } from "./campaign-play-turn-repository.js";
import { campaignPlayJournalPageSchema, campaignPlayStateSchema } from "./contracts.js";

const CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111";
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
let root = "";
let previousCampaignsRoot: string | undefined;

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-play-read-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
});

afterEach(() => {
  closeDb();
  if (previousCampaignsRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
  else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  fs.rmSync(root, { recursive: true, force: true });
});

function createAcceptedCampaign(): void {
  createMigratedCampaign(root, CAMPAIGN_ID);
  const handle = openCampaignWorldDatabase(CAMPAIGN_ID);
  try {
    const repository = createCampaignWorldRepository(handle);
    const source = sourceFixture(CAMPAIGN_ID);
    repository.acquireBuild({
      buildId: "read-model-build",
      source,
      expectedSourceDigest: source.sourceDigest,
      providerId: "test",
      model: "test",
      startedAt: 1_000,
    });
    advanceBuildToPersistence(repository, "read-model-build");
    const candidate = candidateFixture(source);
    const draft = {
      ...candidate.draft,
      placements: candidate.draft.placements.map((placement) =>
        placement.id === "placement-b" ? { ...placement, locationId: "location-a-office" } : placement),
    };
    const review = repository.completeBuild({
      buildId: "read-model-build",
      candidate: { ...candidate, draft, contentHash: calculateCampaignWorldContentHash(source.sourceDigest, draft) },
      completedAt: 1_100,
    });
    repository.acceptWorld({ expectedVersion: review.version, expectedContentHash: review.contentHash, acceptedAt: 1_200 });
  } finally {
    handle.close();
  }
}

function createCampaignWithPlayerSummary(summary: string): void {
  createAcceptedCampaign();
  const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
  try {
    const states = createCampaignPlayStateRepository(handle);
    states.createState({ eventId: "read-model-state", createdAt: 1_300 });
    states.commitMechanicalAndRuntime({
      worldVersionAdvance: 1,
      event: {
        eventId: "character-created",
        turnId: null,
        kind: "character_created",
        workerEpoch: null,
        protectedPayloadHash: HASH_A,
        createdAt: 1_400,
      },
      mutate(context) {
        context.sqlite.prepare(`
          INSERT INTO actors (id, campaign_id, kind, controller, role, name, summary, traits, tags)
          VALUES ('actor-player', ?, 'person', 'human', 'player', 'Player', ?, '[]', '[]')
        `).run(context.campaignId, summary);
        context.sqlite.prepare(`
          INSERT INTO campaign_play_characters (
            actor_id, campaign_id, record_json, record_hash, source_kind, source_digest, created_at
          ) VALUES ('actor-player', ?, '{"name":"Player"}', ?, 'created', ?, 1400)
        `).run(context.campaignId, HASH_A, HASH_B);
        context.sqlite.prepare(
          "UPDATE campaign_play_states SET setup_phase = 'opening_required' WHERE campaign_id = ?",
        ).run(context.campaignId);
      },
    });
  } finally {
    handle.close();
  }
}

describe("CampaignPlayReadModel", () => {
  it("returns byte-stable strict public state and journal pages after reopening", () => {
    createAcceptedCampaign();
    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    createCampaignPlayStateRepository(handle).createState({ eventId: "read-model-state", createdAt: 1_300 });
    const reader = createCampaignPlayReadModel(handle);
    const before = reader.loadState();
    const journal = reader.loadJournal(0, 1);
    expect(before).not.toBeNull();
    expect(campaignPlayStateSchema.parse(before)).toEqual(before);
    expect(before).toMatchObject({ phase: "character_required", character: null, activeTurn: null, journalCursor: 0 });
    expect(campaignPlayJournalPageSchema.parse(journal)).toEqual(journal);
    expect(() => reader.loadTurn("missing-turn")).toThrow(
      expect.objectContaining<Partial<CampaignPlayTurnRepositoryError>>({
        code: "turn_not_found",
      }),
    );
    handle.close();

    const reopened = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      expect(JSON.stringify(createCampaignPlayReadModel(reopened).loadState())).toBe(JSON.stringify(before));
    } finally {
      reopened.close();
    }
  });

  it("clips the public descriptor without changing the stored source summary", () => {
    const summary = `${"O".repeat(239)} ${"f"}${".".repeat(3)}`;
    expect([...summary]).toHaveLength(244);
    expect([...summary][239]).toBe(" ");
    expect([...summary][240]).toBe("f");
    createCampaignWithPlayerSummary(summary);

    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      const before = handle.sqlite.prepare(
        "SELECT summary FROM actors WHERE campaign_id = ? AND id = 'actor-player'",
      ).get(CAMPAIGN_ID) as { summary: string };
      const state = createCampaignPlayReadModel(handle).loadState();
      const after = handle.sqlite.prepare(
        "SELECT summary FROM actors WHERE campaign_id = ? AND id = 'actor-player'",
      ).get(CAMPAIGN_ID) as { summary: string };

      expect(state.character?.descriptor).toBe("O".repeat(239));
      expect(state.character?.descriptor.length).toBeLessThanOrEqual(240);
      expect(state.character?.descriptor.trim()).toBe(state.character?.descriptor);
      expect(after.summary).toBe(before.summary);
      expect(after.summary).toBe(summary);
    } finally {
      handle.close();
    }
  });

  it.each([
    ["short summary", "A concise visitor."],
    ["exact boundary", "N".repeat(240)],
  ])("keeps %s descriptors unchanged", (_label, summary) => {
    createCampaignWithPlayerSummary(summary);
    const handle = openCampaignPlayDatabase(CAMPAIGN_ID);
    try {
      expect(createCampaignPlayReadModel(handle).loadState().character?.descriptor).toBe(summary);
    } finally {
      handle.close();
    }
  });
});
