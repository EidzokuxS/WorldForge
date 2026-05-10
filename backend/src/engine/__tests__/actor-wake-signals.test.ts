import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns } from "../../db/schema.js";
import {
  actorWakeSignalToWakeSignal,
  consumeActorWakeSignals,
  enqueueActorWakeSignal,
  expireActorWakeSignals,
  listCriticalActorWakeCandidates,
  listPendingWakeSignalsForActors,
} from "../actor-wake-signals.js";

const CAMPAIGN_ID = "actor-wake-signals-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Actor Wake Signals",
    premise: "A wake signal test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
}

describe("actor wake signals", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-actor-wake-signals-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists due critical wake rows in priority order", () => {
    enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-later",
      signalType: "report",
      sourceType: "faction_report",
      sourceId: "report-later",
      summary: "A later report arrives.",
      priority: 10,
      dueWorldTimeMinutes: 20,
    });
    const due = enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-now",
      signalType: "report",
      sourceType: "faction_report",
      sourceId: "report-now",
      summary: "A relevant report arrives.",
      priority: 6,
      dueWorldTimeMinutes: 5,
    });
    const urgent = enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-urgent",
      signalType: "urgency",
      sourceType: "authority_trace",
      sourceId: "trace-urgent",
      summary: "A visible interruption needs attention.",
      priority: 9,
      requiredBeforeDone: true,
      dueWorldTimeMinutes: null,
    });

    const candidates = listCriticalActorWakeCandidates({
      campaignId: CAMPAIGN_ID,
      worldTimeMinutes: 10,
    });

    expect(candidates.map((candidate) => candidate.id)).toEqual([urgent.id, due.id]);
    expect(actorWakeSignalToWakeSignal(urgent)).toMatchObject({
      type: "urgency",
      requiredBeforeDone: true,
      sourceId: "trace-urgent",
    });
  });

  it("coalesces duplicate pending sources instead of creating noisy wake rows", () => {
    const first = enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-report",
      signalType: "report",
      sourceType: "faction_report",
      sourceId: "report-1",
      summary: "Initial summary.",
      priority: 4,
      payload: { version: 1 },
    });
    const second = enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-report",
      signalType: "report",
      sourceType: "faction_report",
      sourceId: "report-1",
      summary: "Updated summary.",
      priority: 8,
      requiredBeforeDone: true,
      payload: { version: 2 },
    });

    expect(second.id).toBe(first.id);
    expect(second).toMatchObject({
      summary: "Updated summary.",
      priority: 8,
      requiredBeforeDone: true,
      payload: { version: 2 },
    });
    expect(
      listPendingWakeSignalsForActors({
        campaignId: CAMPAIGN_ID,
        actorIds: ["npc-report"],
        worldTimeMinutes: 0,
      }),
    ).toHaveLength(1);
  });

  it("consumes and expires pending wake signals", () => {
    const consumed = enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-consumed",
      signalType: "report",
      sourceType: "report",
      sourceId: "report-consumed",
      summary: "Consumed report.",
      priority: 4,
    });
    enqueueActorWakeSignal({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-expired",
      signalType: "deadline",
      sourceType: "deadline",
      sourceId: "deadline-expired",
      summary: "Expired deadline.",
      priority: 2,
      dueWorldTimeMinutes: 3,
    });

    expect(consumeActorWakeSignals({
      campaignId: CAMPAIGN_ID,
      signalIds: [consumed.id],
    })).toBe(1);
    expect(expireActorWakeSignals({
      campaignId: CAMPAIGN_ID,
      beforeWorldTimeMinutes: 5,
    })).toBe(1);
    expect(listCriticalActorWakeCandidates({
      campaignId: CAMPAIGN_ID,
      worldTimeMinutes: 10,
    })).toHaveLength(0);
  });
});
