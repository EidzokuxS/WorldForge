import fs from "node:fs";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import { closeDb } from "../db/index.js";
import {
  openCampaignWorldDatabase,
  type CampaignWorldDatabaseHandle,
} from "./world-database.js";
import {
  CampaignWorldRepositoryError,
  createCampaignWorldRepository,
  type CampaignWorldRepository,
} from "./world-repository.js";
import { serializeAcceptedCampaignWorldReview } from "./world-snapshot.js";
import { calculateCampaignWorldSourceDigest } from "./world-source.js";
import {
  advanceBuildToPersistence,
  CAMPAIGN_A,
  CAMPAIGN_B,
  candidateFixture,
  createMigratedCampaign,
  sourceFixture,
} from "./world-repository.test-support.js";

const BUILD_ID = "build-a";
const ACCEPTED_SNAPSHOT_SHA256 =
  "146e21381a48bd36907a219068586708949d6ed73c49f5ea7dadbf4cf9c1693c";

let root = "";
let previousCampaignsRoot: string | undefined;
let handle: CampaignWorldDatabaseHandle;
let repository: CampaignWorldRepository;

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-world-repository-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  createMigratedCampaign(root, CAMPAIGN_A);
  handle = openCampaignWorldDatabase(CAMPAIGN_A);
  repository = createCampaignWorldRepository(handle);
});

afterEach(() => {
  handle.close();
  closeDb();
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

function acquire(
  target = repository,
  buildId = BUILD_ID,
  source = sourceFixture(),
): void {
  target.acquireBuild({
    buildId,
    source,
    expectedSourceDigest: source.sourceDigest,
    providerId: "test-provider",
    model: "test-model",
    startedAt: 1_000,
  });
}

function expectRepositoryError(
  action: () => unknown,
  code: CampaignWorldRepositoryError["code"],
): void {
  let captured: unknown;
  try {
    action();
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(CampaignWorldRepositoryError);
  expect(captured).toMatchObject({ code });
}

function completeAndAcceptWorld(): CampaignWorldReview {
  const source = sourceFixture();
  acquire(repository, BUILD_ID, source);
  advanceBuildToPersistence(repository, BUILD_ID);
  const review = repository.completeBuild({
    buildId: BUILD_ID,
    candidate: candidateFixture(source),
    completedAt: 1_100,
  });
  repository.acceptWorld({
    expectedVersion: review.version,
    expectedContentHash: review.contentHash,
    acceptedAt: 1_200,
  });
  const accepted = repository.loadWorld();
  if (!accepted) throw new Error("Accepted Campaign World fixture is missing.");
  return accepted;
}

describe("Campaign World repository", () => {
  it("persists one replayable build and accepts the reviewed world", () => {
    const source = sourceFixture();
    expect(repository.loadSourceStatus()).toBe("unbuilt");

    acquire(repository, BUILD_ID, source);
    expect(repository.loadSourceStatus()).toBe("building");
    expect(repository.loadBuildContext(BUILD_ID).source).toEqual(source);
    expectRepositoryError(
      () => acquire(repository, "build-concurrent", source),
      "world_build_running",
    );

    advanceBuildToPersistence(repository, BUILD_ID);
    const candidate = candidateFixture(source);
    const review = repository.completeBuild({
      buildId: BUILD_ID,
      candidate,
      completedAt: 1_100,
    });

    expect(review).toMatchObject({
      campaignId: CAMPAIGN_A,
      status: "review",
      version: 1,
      contentHash: candidate.contentHash,
      sourceDigest: source.sourceDigest,
      builtAt: 1_100,
      acceptedAt: null,
    });
    expect(review.locations.map((location) => location.id)).toEqual([
      "location-a",
      "location-b",
      "location-c",
    ]);
    expect(repository.loadSourceStatus()).toBe("review");
    expect(repository.loadWorld()).toEqual(review);

    const events = repository.loadBuildEvents(BUILD_ID);
    expect(events).toHaveLength(12);
    expect(events.map((event) => event.sequence)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "build_started",
      "stage_started",
      "stage_completed",
      "stage_started",
      "stage_completed",
      "stage_started",
      "stage_completed",
      "stage_started",
      "stage_completed",
      "stage_started",
      "stage_completed",
      "build_completed",
    ]);
    expect(repository.loadBuildEvents(BUILD_ID, 10)).toEqual(events.slice(10));

    const stageRows = handle.sqlite.prepare(`
      SELECT stage, requested_mode AS requestedMode,
             primary_strategy AS primaryStrategy,
             actual_strategy AS actualStrategy,
             total_attempts AS totalAttempts
      FROM campaign_world_build_stages
      WHERE campaign_id = ? ORDER BY created_at
    `).all(CAMPAIGN_A);
    expect(stageRows).toEqual([
      {
        stage: "world_frame",
        requestedMode: "auto",
        primaryStrategy: "native_schema",
        actualStrategy: "native_schema",
        totalAttempts: 1,
      },
      {
        stage: "world_cast",
        requestedMode: "auto",
        primaryStrategy: "native_schema",
        actualStrategy: "native_schema",
        totalAttempts: 1,
      },
      {
        stage: "world_connections",
        requestedMode: "auto",
        primaryStrategy: "native_schema",
        actualStrategy: "native_schema",
        totalAttempts: 1,
      },
    ]);

    expectRepositoryError(
      () => repository.acceptWorld({
        expectedVersion: 2,
        expectedContentHash: review.contentHash,
        acceptedAt: 1_200,
      }),
      "world_version_conflict",
    );
    expectRepositoryError(
      () => repository.acceptWorld({
        expectedVersion: review.version,
        expectedContentHash: "0".repeat(64),
        acceptedAt: 1_200,
      }),
      "world_version_conflict",
    );

    const receipt = repository.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: 1_200,
    });
    expect(receipt).toEqual({
      campaignId: CAMPAIGN_A,
      worldVersion: 1,
      contentHash: review.contentHash,
      acceptedAt: 1_200,
    });
    const expectedAccepted = {
      ...review,
      status: "accepted" as const,
      acceptedAt: 1_200,
    };
    const expectedAcceptedBytes = serializeAcceptedCampaignWorldReview(
      expectedAccepted,
    );
    const acceptedRow = handle.sqlite.prepare(`
      SELECT accepted_snapshot_json AS acceptedSnapshotJson,
             accepted_world_version AS acceptedWorldVersion,
             accepted_content_hash AS acceptedContentHash
      FROM campaign_worlds WHERE campaign_id = ?
    `).get(CAMPAIGN_A);
    expect(acceptedRow).toEqual({
      acceptedSnapshotJson: expectedAcceptedBytes,
      acceptedWorldVersion: review.version,
      acceptedContentHash: review.contentHash,
    });
    expect(crypto.createHash("sha256").update(expectedAcceptedBytes).digest("hex"))
      .toBe(ACCEPTED_SNAPSHOT_SHA256);
    expect(repository.loadSourceStatus()).toBe("accepted");
    expect(repository.loadWorld()).toEqual(expectedAccepted);
    expectRepositoryError(
      () => acquire(repository, "build-after-accept", source),
      "campaign_world_exists",
    );
  });

  it("freezes the acquired source independently of later caller mutation", () => {
    const source = sourceFixture();
    const acquiredPremise = source.premise;
    acquire(repository, BUILD_ID, source);
    source.premise = "A caller mutation after acquisition.";

    expect(repository.loadBuildContext(BUILD_ID).source.premise).toBe(acquiredPremise);
    advanceBuildToPersistence(repository, BUILD_ID);
    const review = repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(sourceFixture()),
      completedAt: 1_100,
    });

    expect(review.source.premise).toBe(acquiredPremise);
  });

  it("serves accepted Review from immutable provenance after live rows mutate", () => {
    const accepted = completeAndAcceptWorld();
    const beforeBytes = serializeAcceptedCampaignWorldReview(accepted);
    const beforeDigest = crypto
      .createHash("sha256")
      .update(beforeBytes)
      .digest("hex");
    expect(beforeDigest).toBe(ACCEPTED_SNAPSHOT_SHA256);
    const beforeIds = {
      locations: accepted.locations.map((location) => location.id),
      actors: accepted.actors.map((actor) => actor.id),
      placements: accepted.placements.map((placement) => placement.id),
      relations: accepted.relations.map((relation) => relation.id),
      goals: accepted.goals.map((goal) => goal.id),
      pressures: accepted.pressures.map((pressure) => pressure.id),
    };

    const placement = handle.sqlite.prepare(`
      SELECT id, location_id AS locationId
      FROM actor_placements
      WHERE campaign_id = ? AND placement_kind = 'present'
      ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A) as { id: string; locationId: string };
    const targetLocation = handle.sqlite.prepare(`
      SELECT id FROM locations
      WHERE campaign_id = ? AND id <> ?
      ORDER BY id LIMIT 1
    `).get(CAMPAIGN_A, placement.locationId) as { id: string };
    handle.sqlite.prepare(
      "UPDATE actor_placements SET location_id = ? WHERE id = ?",
    ).run(targetLocation.id, placement.id);
    handle.sqlite.prepare(`
      UPDATE actor_relations
      SET summary = 'Live relation state changed.', intensity = 1
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE actor_goals SET status = 'completed' WHERE campaign_id = ?
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE world_pressures
      SET trajectory = 'Live pressure trajectory changed.'
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE campaign_worlds
      SET source_digest = ?, source_snapshot_json = '{}'
      WHERE campaign_id = ?
    `).run("0".repeat(64), CAMPAIGN_A);

    const reloaded = repository.loadWorld();
    expect(reloaded).toEqual(accepted);
    expect(reloaded && serializeAcceptedCampaignWorldReview(reloaded)).toBe(
      beforeBytes,
    );
    expect(crypto.createHash("sha256").update(beforeBytes).digest("hex")).toBe(
      beforeDigest,
    );
    expect(reloaded).toMatchObject({
      version: accepted.version,
      contentHash: accepted.contentHash,
    });
    expect(reloaded && {
      locations: reloaded.locations.map((location) => location.id),
      actors: reloaded.actors.map((actor) => actor.id),
      placements: reloaded.placements.map((item) => item.id),
      relations: reloaded.relations.map((relation) => relation.id),
      goals: reloaded.goals.map((goal) => goal.id),
      pressures: reloaded.pressures.map((pressure) => pressure.id),
    }).toEqual(beforeIds);
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
    expect(handle.sqlite.pragma("foreign_key_check")).toEqual([]);
  });

  it("migrates an accepted 0024 world into exact frozen provenance", () => {
    const sourceInput = {
      premise: "A stormbound archipelago faces a failing sea route.",
      dna: {
        geography: "A ring of stormbound islands",
        politicalStructure: "Independent harbor councils",
        centralConflict: "The sea routes are failing",
        culturalFlavor: "Salt-worn ritual and signal songs",
        environment: "Cold ocean winds and luminous reefs",
        wildcard: "Maps change after every eclipse",
      },
      researchSummary: "Historic signal networks shaped trade between the islands.",
      sourceReferences: [
        { id: "reference-b", label: "Signal archives", sourceType: "research" },
        { id: "reference-a", label: "Harbor records", sourceType: "worldbook" },
      ],
    };
    const source = {
      campaignId: CAMPAIGN_A,
      ...sourceInput,
      sourceDigest: calculateCampaignWorldSourceDigest(sourceInput),
    };
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);
    const review = repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    const expectedAccepted: CampaignWorldReview = {
      ...review,
      status: "accepted",
      acceptedAt: 1_200,
    };
    const expectedBytes = serializeAcceptedCampaignWorldReview(expectedAccepted);
    const legacyPath = path.join(root, "accepted-0024.db");
    const legacy = new Database(legacyPath);
    try {
      legacy.pragma("foreign_keys = ON");
      legacy.prepare("ATTACH DATABASE ? AS source_db").run(handle.databasePath);
      legacy.exec(`
        CREATE TABLE campaigns (
          id TEXT PRIMARY KEY NOT NULL,
          name TEXT NOT NULL,
          premise TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        INSERT INTO campaigns SELECT * FROM source_db.campaigns;

        CREATE TABLE locations AS
          SELECT id, campaign_id, name, description, kind, parent_location_id,
                 tags, is_starting
          FROM source_db.locations;
        CREATE TABLE location_edges AS
          SELECT id, campaign_id, from_location_id, to_location_id, travel_cost
          FROM source_db.location_edges;
        CREATE TABLE actors AS
          SELECT id, campaign_id, kind, controller, role, name, summary, traits, tags
          FROM source_db.actors;
        CREATE TABLE actor_goals AS
          SELECT id, campaign_id, actor_id, objective, motivation, horizon, priority, status
          FROM source_db.actor_goals;
        CREATE TABLE actor_relations AS
          SELECT id, campaign_id, source_actor_id, target_actor_id,
                 relation_type, summary, intensity
          FROM source_db.actor_relations;
        CREATE TABLE actor_placements AS
          SELECT id, campaign_id, actor_id, location_id, placement_kind
          FROM source_db.actor_placements;
        CREATE TABLE world_pressures AS
          SELECT id, campaign_id, name, description, trajectory, urgency
          FROM source_db.world_pressures;
        CREATE TABLE world_pressure_actors AS
          SELECT id, campaign_id, pressure_id, actor_id
          FROM source_db.world_pressure_actors;
        CREATE TABLE world_pressure_locations AS
          SELECT id, campaign_id, pressure_id, location_id
          FROM source_db.world_pressure_locations;

        CREATE TABLE campaign_worlds (
          campaign_id TEXT PRIMARY KEY NOT NULL,
          status TEXT NOT NULL,
          world_version INTEGER NOT NULL,
          content_hash TEXT NOT NULL,
          source_digest TEXT NOT NULL,
          source_snapshot_json TEXT NOT NULL,
          world_summary TEXT NOT NULL,
          built_at INTEGER NOT NULL,
          accepted_at INTEGER,
          FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
          CONSTRAINT campaign_worlds_version_positive CHECK(world_version >= 1),
          CONSTRAINT campaign_worlds_acceptance_consistent CHECK(
            (status = 'review' AND accepted_at IS NULL)
            OR (status = 'accepted' AND accepted_at IS NOT NULL)
          )
        );
        INSERT INTO campaign_worlds (
          campaign_id, status, world_version, content_hash, source_digest,
          source_snapshot_json, world_summary, built_at, accepted_at
        )
        SELECT campaign_id, 'accepted', world_version, content_hash, source_digest,
               source_snapshot_json, world_summary, built_at, 1200
        FROM source_db.campaign_worlds;
        DETACH DATABASE source_db;
      `);

      const migrationPath = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        "../../drizzle/0025_campaign_world_acceptance_snapshot.sql",
      );
      const migration = fs.readFileSync(migrationPath, "utf-8");
      for (const statement of migration.split("--> statement-breakpoint")) {
        const sql = statement.trim();
        if (sql.length > 0) legacy.exec(sql);
      }

      expect(legacy.prepare(`
        SELECT status, accepted_at AS acceptedAt,
               accepted_snapshot_json AS acceptedSnapshotJson,
               accepted_world_version AS acceptedWorldVersion,
               accepted_content_hash AS acceptedContentHash
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(CAMPAIGN_A)).toEqual({
        status: "accepted",
        acceptedAt: 1_200,
        acceptedSnapshotJson: expectedBytes,
        acceptedWorldVersion: review.version,
        acceptedContentHash: review.contentHash,
      });

      const migratedRepository = createCampaignWorldRepository({
        campaignId: CAMPAIGN_A,
        databasePath: legacyPath,
        sqlite: legacy,
      } as unknown as CampaignWorldDatabaseHandle);
      expect(migratedRepository.loadWorld()).toEqual(expectedAccepted);
      expect(legacy.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(legacy.pragma("foreign_key_check")).toEqual([]);
    } finally {
      legacy.close();
    }
  });

  it("rejects accepted provenance updates at the SQLite boundary", () => {
    completeAndAcceptWorld();

    expect(() => handle.sqlite.prepare(`
      UPDATE campaign_worlds
      SET accepted_snapshot_json = '{}'
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A)).toThrow("Accepted Campaign World provenance is immutable.");
  });

  it("rolls back acceptance when its atomic provenance write is rejected", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);
    const review = repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    handle.sqlite.exec(`
      CREATE TRIGGER reject_campaign_world_acceptance
      BEFORE UPDATE OF status ON campaign_worlds
      WHEN NEW.status = 'accepted'
      BEGIN
        SELECT RAISE(ABORT, 'Injected acceptance failure.');
      END;
    `);

    expect(() => repository.acceptWorld({
      expectedVersion: review.version,
      expectedContentHash: review.contentHash,
      acceptedAt: 1_200,
    })).toThrow("Injected acceptance failure.");
    expect(handle.sqlite.prepare(`
      SELECT status, accepted_at AS acceptedAt,
             accepted_snapshot_json AS acceptedSnapshotJson,
             accepted_world_version AS acceptedWorldVersion,
             accepted_content_hash AS acceptedContentHash
      FROM campaign_worlds WHERE campaign_id = ?
    `).get(CAMPAIGN_A)).toEqual({
      status: "review",
      acceptedAt: null,
      acceptedSnapshotJson: null,
      acceptedWorldVersion: null,
      acceptedContentHash: null,
    });
    expect(repository.loadWorld()).toEqual(review);
  });

  it("fails closed when accepted snapshot bytes are corrupt", () => {
    completeAndAcceptWorld();
    handle.sqlite.exec("DROP TRIGGER campaign_worlds_accepted_provenance_immutable");
    handle.sqlite.prepare(`
      UPDATE campaign_worlds
      SET accepted_snapshot_json = '{}'
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A);

    expectRepositoryError(() => repository.loadWorld(), "world_state_corrupt");
  });

  it("fails closed when canonical accepted source bytes miss their digest", () => {
    const accepted = completeAndAcceptWorld();
    handle.sqlite.exec("DROP TRIGGER campaign_worlds_accepted_provenance_immutable");
    const corrupted = serializeAcceptedCampaignWorldReview({
      ...accepted,
      source: {
        ...accepted.source,
        premise: "A corrupted accepted premise.",
      },
    });
    handle.sqlite.prepare(`
      UPDATE campaign_worlds
      SET accepted_snapshot_json = ?
      WHERE campaign_id = ?
    `).run(corrupted, CAMPAIGN_A);

    expectRepositoryError(() => repository.loadWorld(), "world_state_corrupt");
  });

  it("rejects a tampered frozen build source when its stored digest text is unchanged", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    handle.sqlite.prepare(`
      UPDATE campaign_world_builds
      SET source_snapshot_json = ?
      WHERE id = ?
    `).run(JSON.stringify({
      ...source,
      premise: "A tampered premise hidden behind the original digest.",
    }), BUILD_ID);

    expectRepositoryError(
      () => repository.loadBuildContext(BUILD_ID),
      "world_state_corrupt",
    );
  });

  it("rejects a tampered world source when its stored digest text is unchanged", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);
    repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    handle.sqlite.prepare(`
      UPDATE campaign_worlds
      SET source_snapshot_json = ?
      WHERE campaign_id = ?
    `).run(JSON.stringify({
      ...source,
      researchSummary: "Tampered research hidden behind the original digest.",
    }), CAMPAIGN_A);

    expectRepositoryError(
      () => repository.loadWorld(),
      "world_state_corrupt",
    );
  });

  it("finishes campaign A after the process-global database switches to B", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);

    createMigratedCampaign(root, CAMPAIGN_B);
    const review = repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    const campaignB = openCampaignWorldDatabase(CAMPAIGN_B);
    try {
      const worldRowsA = handle.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM campaign_worlds WHERE campaign_id = ?",
      ).get(CAMPAIGN_A) as { count: number };
      const worldRowsB = campaignB.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM campaign_worlds WHERE campaign_id = ?",
      ).get(CAMPAIGN_B) as { count: number };
      const locationRowsB = campaignB.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM locations WHERE campaign_id = ?",
      ).get(CAMPAIGN_B) as { count: number };

      expect(review.campaignId).toBe(CAMPAIGN_A);
      expect(worldRowsA.count).toBe(1);
      expect(worldRowsB.count).toBe(0);
      expect(locationRowsB.count).toBe(0);
    } finally {
      campaignB.close();
    }
  });

  it("reloads stable IDs and hashes after closing the dedicated handle", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);
    const original = repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    expect(handle.sqlite.pragma("integrity_check", { simple: true })).toBe("ok");

    handle.close();
    handle = openCampaignWorldDatabase(CAMPAIGN_A);
    repository = createCampaignWorldRepository(handle);
    const reloaded = repository.loadWorld();

    expect(reloaded).toEqual(original);
    expect(reloaded?.locations.map((location) => location.id)).toEqual(
      original.locations.map((location) => location.id),
    );
    expect(reloaded?.actors.map((actor) => actor.id)).toEqual(
      original.actors.map((actor) => actor.id),
    );
    expect(reloaded?.contentHash).toBe(original.contentHash);
  });

  it("rolls back every world row when the success transaction is interrupted", () => {
    repository = createCampaignWorldRepository(handle, {
      beforeWorldCommit: () => {
        throw new Error("injected commit interruption");
      },
    });
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);

    expect(() => repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    })).toThrow("injected commit interruption");

    for (const table of [
      "campaign_worlds",
      "locations",
      "location_edges",
      "actors",
      "actor_goals",
      "actor_relations",
      "actor_placements",
      "world_pressures",
      "world_pressure_actors",
      "world_pressure_locations",
    ]) {
      const row = handle.sqlite.prepare(
        `SELECT COUNT(*) AS count FROM ${table} WHERE campaign_id = ?`,
      ).get(CAMPAIGN_A) as { count: number };
      expect(row.count, table).toBe(0);
    }
    expect(repository.loadLatestBuild()).toMatchObject({
      status: "running",
      stage: "persistence",
    });

    const failed = repository.failBuild({
      buildId: BUILD_ID,
      errorCode: "persistence_failed",
      message: "World persistence did not commit.",
      completedAt: 1_110,
    });
    expect(failed).toMatchObject({
      type: "build_failed",
      sequence: 11,
      errorCode: "persistence_failed",
    });
    expect(repository.failBuild({
      buildId: BUILD_ID,
      errorCode: "ignored_second_failure",
      message: "Repeated failure report.",
      completedAt: 1_120,
    })).toEqual(failed);
    expect(repository.loadBuildEvents(BUILD_ID).filter(
      (event) => event.type === "build_failed",
    )).toHaveLength(1);
    expect(repository.loadSourceStatus()).toBe("failed");

    acquire(repository, "build-after-failure", source);
    expect(repository.loadSourceStatus()).toBe("building");
  });

  it("excludes engine-era location and route columns from canonical review content", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);
    const original = repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });

    handle.sqlite.prepare(`
      UPDATE locations
      SET connected_to = '["engine-only"]',
          persistence = 'ephemeral',
          anchor_location_id = id,
          expires_at_tick = 8,
          archived_at_tick = 9
      WHERE campaign_id = ?
    `).run(CAMPAIGN_A);
    handle.sqlite.prepare(`
      UPDATE location_edges SET discovered = 0 WHERE campaign_id = ?
    `).run(CAMPAIGN_A);

    expect(repository.loadWorld()).toEqual(original);
  });

  it("detects canonical row changes through the content hash", () => {
    const source = sourceFixture();
    acquire(repository, BUILD_ID, source);
    advanceBuildToPersistence(repository, BUILD_ID);
    repository.completeBuild({
      buildId: BUILD_ID,
      candidate: candidateFixture(source),
      completedAt: 1_100,
    });
    handle.sqlite.prepare(
      "UPDATE actors SET summary = 'Tampered summary.' WHERE id = 'actor-a'",
    ).run();

    expectRepositoryError(
      () => repository.loadWorld(),
      "world_state_corrupt",
    );
  });

  it("rejects model evidence without a primary provider strategy", () => {
    acquire();
    repository.recordStageStarted({
      buildId: BUILD_ID,
      stage: "world_frame",
      createdAt: 1_010,
    });

    expectRepositoryError(
      () => repository.recordStageCompleted({
        buildId: BUILD_ID,
        stage: "world_frame",
        createdAt: 1_011,
        evidence: {
          stage: "world_frame",
          requestedMode: "auto",
          primaryStrategy: null,
          actualStrategy: null,
          totalAttempts: 1,
          repairUsed: false,
          retryUsed: false,
          textFallbackUsed: false,
          responseModel: null,
          finishReason: null,
          errorCode: "model_contract_failed",
          inputTokens: null,
          outputTokens: null,
          totalTokens: null,
        },
      }),
      "invalid_build_transition",
    );
  });

  it.each([
    [
      "world graph",
      "INSERT INTO locations (id, campaign_id, name, description) VALUES ('occupied-location', ?, 'Occupied', 'Existing graph row')",
    ],
    [
      "player state",
      "INSERT INTO players (id, campaign_id, name) VALUES ('occupied-player', ?, 'Existing player')",
    ],
    [
      "world runtime",
      "INSERT INTO world_threads (id, campaign_id, name, stage, base_world_version, last_advanced_world_version, created_world_time_minutes, updated_world_time_minutes, created_at, updated_at) VALUES ('occupied-thread', ?, 'Existing thread', 'forming', 1, 1, 0, 0, 1, 1)",
    ],
    [
      "actor runtime",
      "INSERT INTO actor_process_states (id, campaign_id, actor_type, actor_id, created_at, updated_at) VALUES ('occupied-process', ?, 'npc', 'actor-existing', 1, 1)",
    ],
    [
      "turn runtime",
      "INSERT INTO turn_sagas (id, campaign_id, turn_id, status_updated_at, base_world_version, created_at, updated_at) VALUES ('occupied-turn', ?, 'turn-existing', 1, 1, 1, 1)",
    ],
    [
      "partial Campaign World domain",
      "INSERT INTO actors (id, campaign_id, kind, controller, role, name, summary) VALUES ('occupied-actor', ?, 'person', 'agent', 'key', 'Existing actor', 'Partial domain row')",
    ],
  ])("requires campaign recreation for existing %s rows", (_label, sql) => {
    handle.sqlite.prepare(sql).run(CAMPAIGN_A);

    expectRepositoryError(
      () => acquire(),
      "campaign_recreation_required",
    );
    expect(repository.loadLatestBuild()).toBeNull();
  });
});
