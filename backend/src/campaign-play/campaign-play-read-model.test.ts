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
        placement.id === "placement-b" ? { ...placement, locationId: "location-a" } : placement),
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
});
