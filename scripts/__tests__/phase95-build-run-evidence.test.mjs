import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildRunEvidence } from "../phase95-build-run-evidence.mjs";
import { validateAdaptiveRun } from "../phase95-verify-adaptive-run.mjs";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

function makeRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "wf-phase95-evidence-"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function createDb(dbPath) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    create table turn_sagas (
      id text primary key,
      campaign_id text not null,
      turn_id text not null,
      action_text text,
      status text not null,
      status_reason text,
      base_world_version integer not null,
      result_world_version integer,
      settled_turn_packet_id text,
      created_at integer not null
    );
    create table settled_turn_packets (
      id text primary key,
      campaign_id text not null,
      saga_id text not null,
      turn_id text not null,
      accepted_tool_result_refs text not null default '[]',
      accepted_actor_result_refs text not null default '[]',
      accepted_durable_event_ids text not null default '[]',
      due_world_refs text not null default '[]',
      base_world_version integer not null,
      result_world_version integer not null,
      created_at integer not null
    );
    create table turn_saga_events (
      id text primary key,
      campaign_id text not null,
      saga_id text not null,
      turn_id text not null,
      event_type text not null,
      payload_json text not null default '{}',
      created_at integer not null
    );
    create table actor_wake_signals (
      id text primary key,
      campaign_id text not null,
      status text not null
    );
  `);
  return db;
}

function insertTurnRows(db, input) {
  db.prepare(`
    insert into turn_sagas (
      id, campaign_id, turn_id, action_text, status, status_reason,
      base_world_version, result_world_version, settled_turn_packet_id, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.sagaId,
    "clone-campaign",
    input.turnId,
    input.action,
    "finalized",
    null,
    input.baseWorldVersion,
    input.resultWorldVersion,
    input.packetId,
    input.createdAt,
  );
  db.prepare(`
    insert into settled_turn_packets (
      id, campaign_id, saga_id, turn_id, accepted_tool_result_refs,
      accepted_actor_result_refs, accepted_durable_event_ids, due_world_refs,
      base_world_version, result_world_version, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    input.packetId,
    "clone-campaign",
    input.sagaId,
    input.turnId,
    JSON.stringify(input.toolRefs ?? []),
    JSON.stringify(input.actorRefs ?? []),
    JSON.stringify(input.eventIds ?? []),
    JSON.stringify(input.dueWorldRefs ?? []),
    input.baseWorldVersion,
    input.resultWorldVersion,
    input.createdAt + 10,
  );
  db.prepare(`
    insert into turn_saga_events (
      id, campaign_id, saga_id, turn_id, event_type, payload_json, created_at
    ) values (?, ?, ?, ?, ?, ?, ?)
  `).run(
    `${input.sagaId}-persisted`,
    "clone-campaign",
    input.sagaId,
    input.turnId,
    "settled_packet_persisted",
    "{}",
    input.createdAt + 20,
  );
  for (const [index, eventType] of (input.extraEvents ?? []).entries()) {
    db.prepare(`
      insert into turn_saga_events (
        id, campaign_id, saga_id, turn_id, event_type, payload_json, created_at
      ) values (?, ?, ?, ?, ?, ?, ?)
    `).run(
      `${input.sagaId}-extra-${index}`,
      "clone-campaign",
      input.sagaId,
      input.turnId,
      eventType,
      "{}",
      input.createdAt + 30 + index,
    );
  }
}

function writeCloneRun(root, campaignPath) {
  writeJson(path.join(campaignPath, "clone-manifest.json"), {
    sourceCampaignId: "source-campaign",
    targetCampaignId: "clone-campaign",
  });
  const turns = [
    {
      index: 1,
      action: "I inspect the safe route.",
      status: "done",
      mode: "route-probe",
      before: { tick: 1, worldVersion: 4, worldTimeMinutes: 10 },
      after: { tick: 2, worldVersion: 4, worldTimeMinutes: 10 },
      done: { tick: 2, worldVersion: 4, worldTimeMinutes: 10 },
      visibleText:
        "The safe route remains clear and public markers are visible, giving the player a concrete grounded route choice without exposing backend refs.",
      quickActions: [],
      eventTypes: ["narrative", "done"],
    },
    {
      index: 2,
      action: "I ask the clerk to verify my papers.",
      status: "done",
      mode: "npc-engagement",
      before: { tick: 2, worldVersion: 4, worldTimeMinutes: 10 },
      after: { tick: 3, worldVersion: 5, worldTimeMinutes: 11 },
      done: { tick: 3, worldVersion: 5, worldTimeMinutes: 11 },
      visibleText:
        "The clerk checks the papers and marks one contradiction for follow-up, leaving a specific public procedure for the player to pursue next.",
      quickActions: [],
      eventTypes: ["turn_resolution", "narrative", "done"],
    },
  ];
  writeJson(path.join(root, "state.json"), {
    setupMode: "clone",
    campaignId: "clone-campaign",
    sourceCampaignId: "source-campaign",
    cloneCampaignPath: campaignPath,
    turns,
  });
  writeJson(path.join(root, "clone-provenance.json"), {
    sourceCampaignId: "source-campaign",
    cloneCampaignId: "clone-campaign",
    cloneCampaignPath: campaignPath,
  });
  writeJson(path.join(root, "world-after-clone-load.json"), {
    campaign: { id: "clone-campaign" },
  });
  writeJson(path.join(root, "baseline-pool.json"), { ok: true });
  for (const turn of turns) {
    writeJson(path.join(root, `turn-${String(turn.index).padStart(2, "0")}.json`), {
      turn,
      world: { campaign: { id: "clone-campaign" } },
      history: { messages: [] },
    });
  }
  fs.writeFileSync(path.join(root, "transcript.md"), "# transcript\n", "utf8");
  fs.writeFileSync(
    path.join(root, "clean-adaptive-progress.jsonl"),
    `${JSON.stringify({ type: "turn", index: 1, status: "done" })}\n${JSON.stringify({ type: "turn", index: 2, status: "done" })}\n${JSON.stringify({ type: "complete", doneCount: 2 })}\n`,
    "utf8",
  );
  return turns;
}

describe("phase95 run evidence builder", () => {
  it("writes verifier-compatible clone evidence from saga packets", async () => {
    const root = makeRoot();
    const campaignPath = path.join(root, "campaign");
    const turns = writeCloneRun(root, campaignPath);
    const db = createDb(path.join(campaignPath, "state.db"));
    try {
      insertTurnRows(db, {
        sagaId: "saga-1",
        packetId: "packet-1",
        turnId: "turn-1",
        action: turns[0].action,
        baseWorldVersion: 4,
        resultWorldVersion: 4,
        createdAt: 1000,
      });
      insertTurnRows(db, {
        sagaId: "saga-2",
        packetId: "packet-2",
        turnId: "turn-2",
        action: turns[1].action,
        baseWorldVersion: 4,
        resultWorldVersion: 5,
        toolRefs: ["tool-call-2", "move_actor:abc"],
        eventIds: ["event-2"],
        dueWorldRefs: ["proposal:due-2"],
        extraEvents: ["tool_retry"],
        createdAt: 2000,
      });
      db.prepare("insert into actor_wake_signals (id, campaign_id, status) values (?, ?, ?)")
        .run("wake-1", "clone-campaign", "pending");
    } finally {
      db.close();
    }

    const { evidence } = await buildRunEvidence({ root });

    expect(evidence.cloneLineage).toMatchObject({
      sourceCampaignId: "source-campaign",
      cloneCampaignId: "clone-campaign",
    });
    expect(evidence.cloneLineage.manifestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(evidence.turns[0].acceptedReceiptRefs).toEqual([
      "turn-saga:saga-1",
      "settled-packet:packet-1",
    ]);
    expect(evidence.turns[0].dueWorldReasons).toEqual(["none"]);
    expect(evidence.turns[1].acceptedReceiptRefs).toEqual(expect.arrayContaining([
      "settled-packet:packet-2",
      "move_actor:abc",
      "durable-event:event-2",
    ]));
    expect(evidence.turns[1]).toMatchObject({
      retryCount: 1,
      actorBacklogCount: 1,
      dueWorldReasons: ["proposal:due-2"],
      vectorCounts: { episodicEvents: 0, loreCards: 0 },
    });

    const result = validateAdaptiveRun({ root, targetTurns: 2, minModeDiversity: 2 });
    expect(result.ok).toBe(true);
    expect(result.hasRunEvidence).toBe(true);
  });

  it("fails instead of fabricating evidence when a turn lacks a settled packet", async () => {
    const root = makeRoot();
    const campaignPath = path.join(root, "campaign");
    const turns = writeCloneRun(root, campaignPath);
    const db = createDb(path.join(campaignPath, "state.db"));
    try {
      insertTurnRows(db, {
        sagaId: "saga-1",
        packetId: "packet-1",
        turnId: "turn-1",
        action: turns[0].action,
        baseWorldVersion: 4,
        resultWorldVersion: 4,
        createdAt: 1000,
      });
    } finally {
      db.close();
    }

    await expect(buildRunEvidence({ root })).rejects.toThrow("No turn_sagas row matches state turn 2");
  });
});
