import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { closeDb, connectDb, getDb } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import {
  campaigns,
  narratorAttempts,
  settledTurnPackets,
  turnSagaEvents,
  turnSagas,
} from "../../db/schema.js";
import {
  acceptedActorResultRefsFromPacketV1,
  durableEventIdsFromPacketV1,
  persistSettledTurnPacketV1,
  readSettledTurnPacketV1,
  recordNarrationAttemptFailedV1,
  recordNarrationAttemptStartedV1,
  recordNarrationAttemptSucceededV1,
  markSettledTurnProjectedV1,
} from "../settled-turn-packet-v1-store.js";
import type { SettledTurnPacketV1 } from "../gameplay-turn-cycle-v1.js";

const CAMPAIGN_ID = "settled-turn-packet-v1-store-campaign";

let tempDir = "";

function seedCampaign() {
  getDb().insert(campaigns).values({
    id: CAMPAIGN_ID,
    name: "Settled Packet V1 Store",
    premise: "Durable packet contract test.",
    createdAt: 100,
    updatedAt: 100,
  }).run();
}

function json<T>(value: string): T {
  return JSON.parse(value) as T;
}

function makePacket(overrides: Partial<SettledTurnPacketV1> = {}): SettledTurnPacketV1 {
  return {
    version: "settled-turn-packet.v1",
    packetId: "packet-v1-1",
    turnId: "turn-v1-1",
    campaignId: CAMPAIGN_ID,
    baseWorldVersion: 7,
    resultWorldVersion: 8,
    tick: 12,
    playerAction: "Я ставлю срочную отметку на отчет.",
    gmRead: {
      path: "tool_plan",
      situationSummary: "Player marks a visible report.",
      sceneQuestion: "Does the mark land on the report?",
      actionInterpretation: {
        intent: "mark report urgent",
        targetRefs: ["item:report-1"],
      },
      rationale: "The action mutates visible item tags.",
      evidenceRefs: ["item:report-1"],
      narrationGuardrails: [],
    },
    oracleResult: null,
    visibleFacts: ["The report now carries an urgent mark."],
    skippedSteps: [],
    failedSteps: [],
    checklist: {
      version: "gm-action-checklist.v1",
      turnPath: "mutating",
      steps: [{
        stepId: "step-tag-1",
        purpose: "Apply urgent tag to the visible report.",
        evidenceRefs: ["item:report-1"],
        dependsOnStepIds: [],
        expectedVisibleEffect: "The report is visibly urgent.",
        requiredAction: "backend_tool",
        settlementPolicy: "required",
        toolNeed: "state_change",
      }],
    },
    stepSettlements: [{
      stepId: "step-tag-1",
      purpose: "Apply urgent tag to the visible report.",
      status: "accepted",
      toolName: "add_tag",
      input: { targetId: "item:report-1", tag: "urgent" },
      result: {
        success: true,
        status: "success",
        kind: "mutation",
        result: { eventId: "event-result-1", changed: true },
        authority: {
          toolResultId: "tool-result-1",
          campaignId: CAMPAIGN_ID,
          sourceEntity: { type: "item", id: "item:report-1" },
          baseWorldVersion: 7,
          resultWorldVersion: 8,
          elapsedWorldTimeMinutes: 0,
          stateDeltaRefs: ["item:report-1:tags"],
          eventRefs: ["event-authority-1"],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
        },
        modelSafeRefs: ["item:report-1"],
      },
    }],
    acceptedToolResults: [{
      stepId: "step-tag-1",
      toolName: "add_tag",
      input: { targetId: "item:report-1", tag: "urgent" },
      result: {
        success: true,
        status: "success",
        kind: "mutation",
        result: { eventId: "event-result-1", changed: true },
        authority: {
          toolResultId: "tool-result-1",
          campaignId: CAMPAIGN_ID,
          sourceEntity: { type: "item", id: "item:report-1" },
          baseWorldVersion: 7,
          resultWorldVersion: 8,
          elapsedWorldTimeMinutes: 0,
          stateDeltaRefs: ["item:report-1:tags"],
          eventRefs: ["event-authority-1"],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
        },
        modelSafeRefs: ["item:report-1"],
      },
    }],
    localConsequenceResult: null,
    acceptedActorResults: [],
    acceptedDurableEventIds: ["event-authority-1", "event-result-1"],
    producedDurableEventIds: ["event-authority-1", "event-result-1"],
    privateGuardTerms: [],
    ...overrides,
  };
}

describe("SettledTurnPacketV1 durable store", () => {
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "wf-settled-packet-v1-"));
    connectDb(path.join(tempDir, "state.db"));
    runMigrations();
    seedCampaign();
  });

  afterEach(() => {
    closeDb();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("persists canonical packet truth through a storage-only saga anchor", () => {
    const packet = makePacket();
    const persisted = persistSettledTurnPacketV1({ packet, nowMs: 1_000 });

    expect(readSettledTurnPacketV1({ campaignId: CAMPAIGN_ID, packetId: packet.packetId })).toEqual(packet);
    expect(readSettledTurnPacketV1({ campaignId: CAMPAIGN_ID, turnId: packet.turnId })).toEqual(packet);
    expect(durableEventIdsFromPacketV1(packet)).toEqual(["event-authority-1", "event-result-1"]);

    const [storedPacket] = getDb().select().from(settledTurnPackets).all();
    expect(storedPacket).toMatchObject({
      id: packet.packetId,
      campaignId: CAMPAIGN_ID,
      sagaId: persisted.sagaId,
      turnId: packet.turnId,
      requiresNarration: true,
      baseWorldVersion: 7,
      resultWorldVersion: 8,
    });
    expect(json(storedPacket!.canonicalTurnPacketJson)).toEqual(packet);
    expect(json(storedPacket!.narratorPacketJson)).toEqual({
      version: "settled-turn-packet-v1.narrator-source",
      packetId: packet.packetId,
      source: "canonicalTurnPacketJson",
    });
    expect(json(storedPacket!.acceptedToolResultRefs)).toEqual([
      "tool-result-1",
      "step-tag-1:add_tag",
    ]);
    expect(json(storedPacket!.acceptedActorResultRefs)).toEqual([]);
    expect(json(storedPacket!.acceptedDurableEventIds)).toEqual([
      "event-authority-1",
      "event-result-1",
    ]);

    const [saga] = getDb().select().from(turnSagas).all();
    expect(saga).toMatchObject({
      id: persisted.sagaId,
      campaignId: CAMPAIGN_ID,
      turnId: packet.turnId,
      status: "resolved_pending_narration",
      requiresNarration: true,
      settledTurnPacketId: packet.packetId,
    });
    expect(json(saga!.provenanceJson)).toEqual({
      processor: "gameplay-turn-cycle-v1",
      role: "settled-packet-anchor",
    });
    expect(getDb().select().from(turnSagaEvents).all()).toHaveLength(0);
  });

  it("persists accepted actor result refs and durable event ids inside the settled packet boundary", () => {
    const packet = makePacket({
      packetId: "packet-v1-actor",
      turnId: "turn-v1-actor",
      localConsequenceResult: {
        version: "local-consequence-result.v1",
        runId: "local-run-1",
        stage: "local_actor_reactions",
        trigger: {
          gmReadPath: "tool_plan",
          acceptedGmStepIds: ["step-tag-1"],
          acceptedToolResultRefs: ["tool-result-1"],
        },
        baseWorldVersion: 7,
        frameWorldVersion: 8,
        resultWorldVersion: 9,
        route: "required_before_packet",
        actorSettlements: [],
        queuedSimulationProposalRefs: [],
        skipped: [],
        failed: [],
      },
      acceptedActorResults: [{
        settlementId: "local-actor:npc-clerk:1",
        actorId: "npc-clerk",
        actorLabel: "Desk Clerk",
        toolName: "record_dialogue_outcome",
        input: { targetActorName: "Desk Clerk", summary: "The clerk logs the urgent mark." },
        result: {
          success: true,
          status: "success",
          kind: "mutation",
          result: { eventId: "event-actor-result-1", text: "The clerk logs the urgent mark." },
          authority: {
            toolResultId: "actor-tool-result-1",
            campaignId: CAMPAIGN_ID,
            sourceEntity: { type: "npc", id: "npc-clerk" },
            baseWorldVersion: 8,
            resultWorldVersion: 9,
            elapsedWorldTimeMinutes: 0,
            stateDeltaRefs: ["npc:npc-clerk:state"],
            eventRefs: ["event-actor-authority-1"],
            witnesses: [],
            knowledgeOutputs: [],
            visibilityOutputs: [],
            resources: [],
          },
          modelSafeRefs: ["npc-clerk"],
        },
        visibleFact: "The clerk logs the urgent mark.",
      }],
      acceptedDurableEventIds: [
        "event-authority-1",
        "event-result-1",
        "event-actor-authority-1",
        "event-actor-result-1",
      ],
      producedDurableEventIds: [
        "event-authority-1",
        "event-result-1",
        "event-actor-authority-1",
        "event-actor-result-1",
      ],
    });

    persistSettledTurnPacketV1({ packet, nowMs: 2_000 });

    const [storedPacket] = getDb().select().from(settledTurnPackets).all();
    expect(acceptedActorResultRefsFromPacketV1(packet)).toEqual([
      "actor-tool-result-1",
      "local-actor:npc-clerk:1:npc-clerk:record_dialogue_outcome",
    ]);
    expect(json(storedPacket!.acceptedActorResultRefs)).toEqual([
      "actor-tool-result-1",
      "local-actor:npc-clerk:1:npc-clerk:record_dialogue_outcome",
    ]);
    expect(json(storedPacket!.acceptedDurableEventIds)).toEqual([
      "event-authority-1",
      "event-result-1",
      "event-actor-authority-1",
      "event-actor-result-1",
    ]);
    expect(json(storedPacket!.sourceRefs)).toEqual(["item:report-1", "npc-clerk"]);
    expect(durableEventIdsFromPacketV1(packet)).toEqual([
      "event-authority-1",
      "event-result-1",
      "event-actor-authority-1",
      "event-actor-result-1",
    ]);
  });

  it("records successful narration and finalizes only after projection", () => {
    const packet = makePacket();
    const persisted = persistSettledTurnPacketV1({ packet, nowMs: 1_000 });
    const attempt = recordNarrationAttemptStartedV1({
      campaignId: CAMPAIGN_ID,
      packetId: packet.packetId,
      nowMs: 1_100,
    });

    expect(attempt).toMatchObject({
      sagaId: persisted.sagaId,
      packetId: packet.packetId,
      attemptIndex: 1,
    });
    expect(getDb().select().from(turnSagas).where(eq(turnSagas.id, persisted.sagaId)).get())
      .toMatchObject({
        status: "narrator_rendering",
        latestNarratorAttemptId: attempt.attemptId,
      });

    recordNarrationAttemptSucceededV1({
      attemptId: attempt.attemptId,
      finalText: "Отчет теперь помечен как срочный.",
      groundingResult: { ok: true },
      nowMs: 1_200,
    });
    markSettledTurnProjectedV1({
      campaignId: CAMPAIGN_ID,
      packetId: packet.packetId,
      narratorAttemptId: attempt.attemptId,
      nowMs: 1_300,
    });

    expect(getDb().select().from(narratorAttempts).where(eq(narratorAttempts.id, attempt.attemptId)).get())
      .toMatchObject({
        status: "succeeded",
        finalText: "Отчет теперь помечен как срочный.",
      });
    expect(getDb().select().from(turnSagas).where(eq(turnSagas.id, persisted.sagaId)).get())
      .toMatchObject({
        status: "finalized",
        latestNarratorAttemptId: attempt.attemptId,
      });
  });

  it("keeps canonical packet pending after narrator failure", () => {
    const packet = makePacket();
    const persisted = persistSettledTurnPacketV1({ packet, nowMs: 1_000 });
    const attempt = recordNarrationAttemptStartedV1({
      campaignId: CAMPAIGN_ID,
      packetId: packet.packetId,
      nowMs: 1_100,
    });

    recordNarrationAttemptFailedV1({
      attemptId: attempt.attemptId,
      reason: "Narration leaked private material.",
      nowMs: 1_200,
    });

    expect(readSettledTurnPacketV1({ campaignId: CAMPAIGN_ID, packetId: packet.packetId })).toEqual(packet);
    expect(getDb().select().from(narratorAttempts).where(eq(narratorAttempts.id, attempt.attemptId)).get())
      .toMatchObject({
        status: "failed",
        failureReason: "Narration leaked private material.",
        finalText: null,
      });
    expect(getDb().select().from(turnSagas).where(eq(turnSagas.id, persisted.sagaId)).get())
      .toMatchObject({
        status: "resolved_pending_narration",
        latestNarratorAttemptId: attempt.attemptId,
      });
  });

  it("does not import the old saga driver into the v1 critical path", () => {
    const engineDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const storeSource = fs.readFileSync(
      path.join(engineDir, "settled-turn-packet-v1-store.ts"),
      "utf8",
    );
    const cycleSource = fs.readFileSync(
      path.join(engineDir, "gameplay-turn-cycle-v1.ts"),
      "utf8",
    );

    expect(storeSource).not.toMatch(/from\s+["']\.\/turn-saga\.js["']/u);
    expect(cycleSource).not.toMatch(/from\s+["']\.\/turn-saga\.js["']/u);
    expect(cycleSource).not.toMatch(/recordPreparedSettledTurnPacket|persistSettledTurnPacket\(/u);
  });
});
