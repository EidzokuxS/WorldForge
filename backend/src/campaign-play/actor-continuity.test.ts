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
  sqlite.exec(`CREATE TABLE campaign_play_actor_jobs (
      job_id TEXT PRIMARY KEY,
      campaign_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      completed_at INTEGER
    );
    CREATE TABLE campaign_play_actor_proposals (
      proposal_id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      status TEXT NOT NULL,
      commands_json TEXT NOT NULL
    );`);
  return {
    campaignId: "campaign-continuity",
    databasePath: ":memory:",
    sqlite,
    db: null as never,
    close: () => sqlite.close(),
  };
}

function actorEvent(input: {
  actorId: string;
  expectedWorldVersion: number;
  summary: string;
}) {
  return {
    commandId: `command-${input.expectedWorldVersion}`,
    batchId: `batch-${input.expectedWorldVersion}`,
    order: 0,
    causalParent: { kind: "actor_job" as const, jobId: `job-${input.expectedWorldVersion}` },
    source: { kind: "actor" as const, actorId: input.actorId },
    expectedWorldVersion: input.expectedWorldVersion,
    readScope: [{ kind: "actor" as const, id: input.actorId }],
    writeScope: [],
    exposure: { mode: "protected" as const },
    kind: "record_world_event" as const,
    eventClass: "interaction" as const,
    summary: input.summary,
    observableTrace: "Fresh work remains at the site.",
    affectedRefs: [{ kind: "actor" as const, id: input.actorId }],
  };
}

function insertProposal(input: {
  handle: CampaignPlayDatabaseHandle;
  actorId: string;
  jobId: string;
  completedAt: number;
  status: "accepted" | "rejected";
  command: ReturnType<typeof actorEvent>;
}) {
  input.handle.sqlite.prepare(`INSERT INTO campaign_play_actor_jobs
    (job_id, campaign_id, actor_id, stage, completed_at)
    VALUES (?, ?, ?, 'settled', ?)`).run(
    input.jobId,
    input.handle.campaignId,
    input.actorId,
    input.completedAt,
  );
  input.handle.sqlite.prepare(`INSERT INTO campaign_play_actor_proposals
    (proposal_id, job_id, status, commands_json) VALUES (?, ?, ?, ?)`).run(
    `proposal-${input.jobId}`,
    input.jobId,
    input.status,
    JSON.stringify([input.command]),
  );
}

describe("Campaign Play actor continuity", () => {
  it("loads accepted completed actions in causal order without future or rejected proposals", () => {
    const database = handle();
    const actorId = "actor-tibbs";
    insertProposal({
      handle: database,
      actorId,
      jobId: "job-4",
      completedAt: 4,
      status: "accepted",
      command: actorEvent({ actorId, expectedWorldVersion: 4, summary: "Tibbs salvaged viable seed." }),
    });
    insertProposal({
      handle: database,
      actorId,
      jobId: "job-7",
      completedAt: 7,
      status: "accepted",
      command: actorEvent({ actorId, expectedWorldVersion: 7, summary: "Tibbs marked the new blight line." }),
    });
    insertProposal({
      handle: database,
      actorId,
      jobId: "job-9",
      completedAt: 9,
      status: "accepted",
      command: actorEvent({ actorId, expectedWorldVersion: 9, summary: "A future action." }),
    });
    insertProposal({
      handle: database,
      actorId,
      jobId: "job-6",
      completedAt: 6,
      status: "rejected",
      command: actorEvent({ actorId, expectedWorldVersion: 6, summary: "A rejected action." }),
    });

    expect(loadCampaignPlayActorContinuity(
      database,
      [{ actorHandle: "tibbs", actorId }],
      7,
    )).toEqual([{
      actorHandle: "tibbs",
      recentOwnActions: [
        { summary: "Tibbs salvaged viable seed.", observableTrace: "Fresh work remains at the site." },
        { summary: "Tibbs marked the new blight line.", observableTrace: "Fresh work remains at the site." },
      ],
    }]);
  });
});
