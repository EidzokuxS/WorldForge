import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import type { CampaignPlayDatabaseHandle } from "./campaign-play-database.js";
import { loadCampaignPlayActorContinuity } from "./actor-continuity.js";

const databases: Database.Database[] = [];

afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
});

function handle(): CampaignPlayDatabaseHandle {
  const sqlite = new Database(":memory:");
  databases.push(sqlite);
  sqlite.exec(`CREATE TABLE campaign_play_commands (
      command_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      command_kind TEXT NOT NULL,
      source_json TEXT NOT NULL,
      protected_payload_json TEXT NOT NULL
    );
    CREATE TABLE campaign_play_receipts (
      receipt_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      command_id TEXT NOT NULL,
      outcome TEXT NOT NULL,
      result_world_version INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );`);
  return {
    campaignId: "campaign-continuity",
    databasePath: ":memory:",
    sqlite,
    db: null as never,
    close: () => sqlite.close(),
  };
}

function insertEvent(input: {
  handle: CampaignPlayDatabaseHandle;
  commandId: string;
  source: { kind: "actor"; actorId: string } | { kind: "system"; system: string };
  performingActorId: string | null;
  resultWorldVersion: number;
  createdAt: number;
  summary: string;
  observableTrace?: string | null;
  committed?: boolean;
}) {
  input.handle.sqlite.prepare(`INSERT INTO campaign_play_commands
    (command_id, campaign_id, command_kind, source_json, protected_payload_json)
    VALUES (?, ?, 'record_world_event', ?, ?)`).run(
    input.commandId,
    input.handle.campaignId,
    JSON.stringify(input.source),
    JSON.stringify({
      eventClass: input.performingActorId === null ? "discovery" : "dialogue",
      performingActorId: input.performingActorId,
      summary: input.summary,
      observableTrace: input.observableTrace === undefined
        ? "Fresh work remains at the site."
        : input.observableTrace,
      affectedRefs: [],
    }),
  );
  if (input.committed === false) return;
  input.handle.sqlite.prepare(`INSERT INTO campaign_play_receipts
    (receipt_id, campaign_id, command_id, outcome, result_world_version, created_at)
    VALUES (?, ?, ?, 'applied', ?, ?)`).run(
    `receipt-${input.commandId}`,
    input.handle.campaignId,
    input.commandId,
    input.resultWorldVersion,
    input.createdAt,
  );
}

describe("Campaign Play actor continuity", () => {
  it("loads receipt-backed performed events in causal order for only their owning actor", () => {
    const database = handle();
    const actorId = "actor-tibbs";
    insertEvent({
      handle: database,
      commandId: "command-actor-4",
      source: { kind: "actor", actorId },
      performingActorId: actorId,
      resultWorldVersion: 4,
      createdAt: 4,
      summary: "Tibbs salvaged viable seed.",
    });
    insertEvent({
      handle: database,
      commandId: "command-source-only-4",
      source: { kind: "actor", actorId },
      performingActorId: null,
      resultWorldVersion: 4,
      createdAt: 5,
      summary: "Tibbs checks the seed beds for new blight.",
    });
    insertEvent({
      handle: database,
      commandId: "command-opening-5",
      source: { kind: "system", system: "opening_bootstrap" },
      performingActorId: actorId,
      resultWorldVersion: 5,
      createdAt: 6,
      summary: "Tibbs asks the newcomer why the blight brought them here.",
      observableTrace: null,
    });
    insertEvent({
      handle: database,
      commandId: "command-dialogue-7",
      source: { kind: "system", system: "game_master" },
      performingActorId: actorId,
      resultWorldVersion: 7,
      createdAt: 7,
      summary: "Tibbs refuses to name the seed buyer.",
      observableTrace: null,
    });
    insertEvent({
      handle: database,
      commandId: "command-future-9",
      source: { kind: "actor", actorId },
      performingActorId: actorId,
      resultWorldVersion: 9,
      createdAt: 9,
      summary: "A future action.",
    });
    insertEvent({
      handle: database,
      commandId: "command-uncommitted-6",
      source: { kind: "actor", actorId },
      performingActorId: actorId,
      resultWorldVersion: 6,
      createdAt: 6,
      summary: "An uncommitted action.",
      committed: false,
    });
    insertEvent({
      handle: database,
      commandId: "command-other-6",
      source: { kind: "system", system: "game_master" },
      performingActorId: "actor-other",
      resultWorldVersion: 6,
      createdAt: 6,
      summary: "Another actor speaks.",
    });

    expect(loadCampaignPlayActorContinuity(
      database,
      [
        { actorHandle: "tibbs", actorId },
        { actorHandle: "other", actorId: "actor-other" },
      ],
      7,
    )).toEqual([
      {
        actorHandle: "other",
        recentOwnActions: [{ summary: "Another actor speaks.", observableTrace: "Fresh work remains at the site." }],
      },
      {
        actorHandle: "tibbs",
        recentOwnActions: [
          { summary: "Tibbs salvaged viable seed.", observableTrace: "Fresh work remains at the site." },
          { summary: "Tibbs checks the seed beds for new blight.", observableTrace: "Fresh work remains at the site." },
          { summary: "Tibbs asks the newcomer why the blight brought them here.", observableTrace: null },
          { summary: "Tibbs refuses to name the seed buyer.", observableTrace: null },
        ],
      },
    ]);
  });
});
