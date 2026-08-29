import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { actorKnowledgeRecords, campaigns } from "../../db/schema.js";
import {
  listActorKnowledge,
  recordActorKnowledge,
  retractActorKnowledgeRecord,
  toActorFrameExternalFact,
} from "../knowledge-model.js";
import {
  commitAuthorityTrace,
  ensureWorldClock,
  invalidateAuthorityAfterRestore,
} from "../living-world-authority.js";

const CAMPAIGN_ID = "knowledge-model-campaign";

let tempDir = "";

function seedCampaign() {
  const timestamp = Date.now();
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Knowledge Model",
    premise: "A test campaign.",
    createdAt: timestamp,
    updatedAt: timestamp,
  }).run();
  ensureWorldClock({ campaignId: CAMPAIGN_ID, currentTick: 1, worldTimeMinutes: 10 });
}

describe("knowledge model", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-knowledge-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("records false claims as actor beliefs rather than backend truth", () => {
    const claim = recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-guard",
      route: "claim",
      truthStatus: "claimed",
      statement: "Visitor claims they have a red permit.",
      subjectRefs: ["player-1", "permit:red"],
      sourceEventIds: ["event-claim-1"],
      confidence: 35,
      reliability: 20,
      metadata: { verification: "unverified" },
    });

    expect(claim.truthStatus).toBe("claimed");
    expect(claim.sourceEventIds).toEqual(["event-claim-1"]);
    expect(getDb().select().from(actorKnowledgeRecords).all()).toHaveLength(1);
    expect(toActorFrameExternalFact(claim)).toMatchObject({
      route: "belief",
      sourceEventIds: ["event-claim-1"],
      sourceKnowledgeIds: [claim.id],
      reliability: 0.2,
    });
  });

  it("retrieves exact names and subject refs with provenance", () => {
    recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      route: "report_message",
      truthStatus: "reported",
      statement: "Mira reported that the bridge key is in Depot Seven.",
      subjectRefs: ["Mira", "bridge-key", "Depot Seven"],
      sourceActorId: "npc-mira",
      sourceEventIds: ["event-report"],
      authorityTraceIds: ["trace-1"],
      confidence: 80,
      reliability: 75,
    });

    const bySubject = listActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      subjectRefs: ["bridge-key"],
    });
    const byLexical = listActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      query: "Where is Depot Seven?",
    });

    expect(bySubject).toHaveLength(1);
    expect(byLexical).toHaveLength(1);
    expect(toActorFrameExternalFact(byLexical[0])).toMatchObject({
      route: "report_message",
      authorityTraceIds: ["trace-1"],
      sourceEventIds: ["event-report"],
    });
  });

  it("orders equal-score knowledge with equal timestamps by canonical id", () => {
    const records = ["first", "second", "third"].map((label) =>
      recordActorKnowledge({
        campaignId: CAMPAIGN_ID,
        actorId: "npc-scout",
        route: "memory",
        statement: `Shared ${label} memory.`,
        subjectRefs: ["shared-ref"],
      }),
    );
    const createdAt = 1_700_000_000_000;
    for (const record of records) {
      getDb()
        .update(actorKnowledgeRecords)
        .set({ createdAt })
        .where(eq(actorKnowledgeRecords.id, record.id))
        .run();
    }

    const expectedIds = records.map((record) => record.id).sort();
    const firstRead = listActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      subjectRefs: ["shared-ref"],
    }).map((record) => record.id);
    const secondRead = listActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      subjectRefs: ["shared-ref"],
    }).map((record) => record.id);

    expect(firstRead).toEqual(expectedIds);
    expect(secondRead).toEqual(expectedIds);
  });

  it("invalidates future knowledge after rollback restore", () => {
    commitAuthorityTrace({
      campaignId: CAMPAIGN_ID,
      operation: "test:advance",
      baseWorldVersion: 0,
      sourceEntity: { type: "system", id: "test" },
      elapsedWorldTimeMinutes: 1,
    });
    const future = recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      route: "memory",
      statement: "Scout remembers a future-only event.",
      subjectRefs: ["future"],
    });

    invalidateAuthorityAfterRestore({
      campaignId: CAMPAIGN_ID,
      restoredWorldVersion: 0,
      restoredWorldTimeMinutes: 10,
      restoredCurrentTick: 10,
      reason: "test rollback",
    });

    expect(
      getDb()
        .select({ invalidatedAtWorldVersion: actorKnowledgeRecords.invalidatedAtWorldVersion })
        .from(actorKnowledgeRecords)
        .where(eq(actorKnowledgeRecords.id, future.id))
        .get(),
    ).toEqual({ invalidatedAtWorldVersion: 0 });
    expect(listActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      worldVersion: 0,
    })).toEqual([]);
  });

  it("retracts actor knowledge by factRef for rejected durable facts", () => {
    const record = recordActorKnowledge({
      campaignId: CAMPAIGN_ID,
      actorId: "npc-scout",
      route: "claim",
      statement: "The office route contradicts the public notice.",
      subjectRefs: ["office-route"],
    });

    expect(retractActorKnowledgeRecord({
      campaignId: CAMPAIGN_ID,
      factRef: `knowledge:${record.id}`,
      reason: "rejected durable record_world_fact",
    })).toBe(true);
    expect(
      getDb()
        .select()
        .from(actorKnowledgeRecords)
        .where(eq(actorKnowledgeRecords.id, record.id))
        .get(),
    ).toBeUndefined();
  });
});
