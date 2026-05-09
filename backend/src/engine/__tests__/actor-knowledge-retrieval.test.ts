import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { campaigns } from "../../db/schema.js";
import { buildActorFrame } from "../actor-frame.js";
import { recordActorKnowledge } from "../knowledge-model.js";
import { retrieveActorKnowledgeForFrame } from "../knowledge-retrieval.js";
import { ensureWorldClock } from "../living-world-authority.js";
import type { SceneFrame } from "../scene-frame.js";

const CAMPAIGN_ID = "actor-knowledge-retrieval-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Actor Knowledge Retrieval",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 4, worldTimeMinutes: 40 });
}

function createSceneFrame(): SceneFrame {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 4,
    playerActorId: "player-1",
    currentLocationId: "loc-depot",
    currentSceneScopeId: "loc-depot",
    currentLocationName: "Depot Seven",
    currentSceneScopeName: "Depot Seven",
    playerAction: "I ask Mira about the bridge key.",
    roster: {
      active: [
        {
          id: "npc-key",
          actorId: "npc-key",
          type: "npc",
          label: "Watcher",
          locationId: "loc-depot",
          sceneScopeId: "loc-depot",
          awareness: "clear",
        },
      ],
      support: [],
      background: [],
    },
    perception: { playerAwarenessHints: [], actorAwareness: {} },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event"],
    oracle: null,
  };
}

describe("actor knowledge retrieval", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-actor-knowledge-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("adds source-backed beliefs and reports into ActorFrame without full-history dump", () => {
    const report = recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-key",
      route: "report_message",
      truthStatus: "reported",
      statement: "Mira reported that the bridge key is in Depot Seven.",
      subjectRefs: ["Mira", "bridge-key", "loc-depot"],
      sourceEventIds: ["event-report"],
      authorityTraceIds: ["trace-report"],
    });
    recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-key",
      route: "memory",
      statement: "Watcher remembers yesterday's unrelated rainstorm.",
      subjectRefs: ["weather"],
    });

    const retrieval = retrieveActorKnowledgeForFrame({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-key",
      frame: createSceneFrame(),
      worldVersion: 0,
      maxFacts: 4,
    });
    const frame = buildActorFrame({
      frame: createSceneFrame(),
      actorId: "npc-key",
      worldVersion: 0,
      reports: retrieval.reports,
      memories: retrieval.memories,
      beliefs: retrieval.beliefs,
      publicRecords: retrieval.publicRecords,
    });

    expect(frame.facts.some((fact) => fact.text.includes("bridge key"))).toBe(true);
    expect(frame.facts.find((fact) => fact.id === `knowledge:${report.id}`)).toMatchObject({
      sourceEventIds: ["event-report"],
      sourceKnowledgeIds: [report.id],
      authorityTraceIds: ["trace-report"],
    });
    expect(frame.contextBudgetTrace.visibleItemCount).toBeLessThanOrEqual(6);
  });
});
