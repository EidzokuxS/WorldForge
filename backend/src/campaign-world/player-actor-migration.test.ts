import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as schema from "../db/schema.js";
import type { CampaignWorldDatabaseHandle } from "./world-database.js";
import {
  createCampaignWorldRepository,
  type CampaignWorldRepository,
} from "./world-repository.js";
import {
  advanceBuildToPersistence,
  CAMPAIGN_A,
  candidateFixture,
  sourceFixture,
} from "./world-repository.test-support.js";

interface MigrationJournal {
  version: string;
  dialect: string;
  entries: Array<{
    idx: number;
    version: string;
    when: number;
    tag: string;
    breakpoints: boolean;
  }>;
}

const drizzleSource = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle",
);

let root = "";

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-player-actor-migration-"));
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

function migrationFolderThrough(lastIndex: number): string {
  const target = path.join(root, `migrations-through-${lastIndex}`);
  const targetMeta = path.join(target, "meta");
  fs.mkdirSync(targetMeta, { recursive: true });
  const journal = JSON.parse(fs.readFileSync(
    path.join(drizzleSource, "meta", "_journal.json"),
    "utf-8",
  )) as MigrationJournal;
  const entries = journal.entries.filter((entry) => entry.idx <= lastIndex);
  for (const entry of entries) {
    fs.copyFileSync(
      path.join(drizzleSource, `${entry.tag}.sql`),
      path.join(target, `${entry.tag}.sql`),
    );
  }
  fs.writeFileSync(
    path.join(targetMeta, "_journal.json"),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
    "utf-8",
  );
  return target;
}

function completeReviewWorld(
  repository: CampaignWorldRepository,
  buildId: string,
) {
  const source = sourceFixture();
  repository.acquireBuild({
    buildId,
    source,
    expectedSourceDigest: source.sourceDigest,
    providerId: "test-provider",
    model: "test-model",
    startedAt: 1_000,
  });
  advanceBuildToPersistence(repository, buildId);
  return repository.completeBuild({
    buildId,
    candidate: candidateFixture(source),
    completedAt: 1_100,
  });
}

function completeAcceptedWorld(repository: CampaignWorldRepository) {
  const review = completeReviewWorld(repository, "build-before-player-actor");
  repository.acceptWorld({
    expectedVersion: review.version,
    expectedContentHash: review.contentHash,
    acceptedAt: 1_200,
  });
  return repository.loadWorld();
}

function snapshotHash(snapshot: string): string {
  return createHash("sha256").update(snapshot, "utf-8").digest("hex");
}

function actorDependentRows(sqlite: Database.Database) {
  return {
    actors: sqlite.prepare(`
      SELECT * FROM actors ORDER BY id
    `).all(),
    goals: sqlite.prepare(`
      SELECT * FROM actor_goals ORDER BY id
    `).all(),
    relations: sqlite.prepare(`
      SELECT * FROM actor_relations ORDER BY id
    `).all(),
    placements: sqlite.prepare(`
      SELECT * FROM actor_placements ORDER BY id
    `).all(),
    pressureActors: sqlite.prepare(`
      SELECT * FROM world_pressure_actors ORDER BY id
    `).all(),
  };
}

describe("Campaign World player actor migration", () => {
  it("preserves the accepted generated cast and its foreign keys", () => {
    const databasePath = path.join(root, "state.db");
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema });
      migrate(db, { migrationsFolder: migrationFolderThrough(25) });
      sqlite.prepare(`
        INSERT INTO campaigns (id, name, premise, created_at, updated_at)
        VALUES (?, 'Migration Campaign', 'Premise', 1, 1)
      `).run(CAMPAIGN_A);
      const handle: CampaignWorldDatabaseHandle = {
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      };
      const repository = createCampaignWorldRepository(handle);
      const acceptedBefore = completeAcceptedWorld(repository);
      const acceptedSnapshotBefore = sqlite.prepare(`
        SELECT accepted_snapshot_json AS acceptedSnapshotJson
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(CAMPAIGN_A) as { acceptedSnapshotJson: string };
      const acceptedSnapshotHashBefore = snapshotHash(
        acceptedSnapshotBefore.acceptedSnapshotJson,
      );
      expect(acceptedSnapshotBefore.acceptedSnapshotJson).toHaveLength(4_277);
      expect(acceptedSnapshotHashBefore).toBe(
        "146e21381a48bd36907a219068586708949d6ed73c49f5ea7dadbf4cf9c1693c",
      );
      const dependentRowsBefore = actorDependentRows(sqlite);

      migrate(db, { migrationsFolder: migrationFolderThrough(26) });

      expect(actorDependentRows(sqlite)).toEqual(dependentRowsBefore);
      const acceptedSnapshotAfter = sqlite.prepare(`
        SELECT accepted_snapshot_json AS acceptedSnapshotJson
        FROM campaign_worlds WHERE campaign_id = ?
      `).get(CAMPAIGN_A) as { acceptedSnapshotJson: string };
      expect(acceptedSnapshotAfter.acceptedSnapshotJson).toBe(
        acceptedSnapshotBefore.acceptedSnapshotJson,
      );
      expect(snapshotHash(acceptedSnapshotAfter.acceptedSnapshotJson)).toBe(
        acceptedSnapshotHashBefore,
      );
      expect(sqlite.prepare(`
        SELECT COUNT(*) AS count
        FROM actors WHERE campaign_id = ? AND role = 'player'
      `).get(CAMPAIGN_A)).toEqual({ count: 0 });
      expect(repository.loadWorld()).toEqual(acceptedBefore);
      expect(sqlite.prepare(`
        SELECT name FROM sqlite_master
        WHERE type = 'trigger'
          AND name IN (
            'campaign_worlds_accepted_provenance_immutable',
            'actors_controller_kind_role_insert',
            'actors_controller_kind_role_update'
          )
        ORDER BY name
      `).all()).toEqual([
        { name: "actors_controller_kind_role_insert" },
        { name: "actors_controller_kind_role_update" },
        { name: "campaign_worlds_accepted_provenance_immutable" },
      ]);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });

  it("preserves review-stage rows used by the live Review projection", () => {
    const databasePath = path.join(root, "review-state.db");
    const sqlite = new Database(databasePath);
    try {
      sqlite.pragma("foreign_keys = ON");
      const db = drizzle(sqlite, { schema });
      migrate(db, { migrationsFolder: migrationFolderThrough(25) });
      sqlite.prepare(`
        INSERT INTO campaigns (id, name, premise, created_at, updated_at)
        VALUES (?, 'Review Migration Campaign', 'Premise', 1, 1)
      `).run(CAMPAIGN_A);
      const repository = createCampaignWorldRepository({
        campaignId: CAMPAIGN_A,
        databasePath,
        sqlite,
        db,
        close() {},
      });
      completeReviewWorld(repository, "review-build-before-player-actor");
      const reviewBefore = repository.loadWorld();
      const dependentRowsBefore = actorDependentRows(sqlite);

      migrate(db, { migrationsFolder: migrationFolderThrough(26) });

      expect(actorDependentRows(sqlite)).toEqual(dependentRowsBefore);
      expect(repository.loadWorld()).toEqual(reviewBefore);
      expect(sqlite.pragma("integrity_check", { simple: true })).toBe("ok");
      expect(sqlite.pragma("foreign_key_check")).toEqual([]);
    } finally {
      sqlite.close();
    }
  });
});
