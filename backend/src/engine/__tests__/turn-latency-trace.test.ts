import { describe, expect, it } from "vitest";

import {
  addTurnLatencyProposalEffects,
  createTurnLatencyTrace,
  finalizeTurnLatencyTrace,
  recordParallelGroup,
  recordSerializedLlmGroup,
  recordTurnLatencyStage,
} from "../turn-latency-trace.js";

describe("turn latency trace", () => {
  it("accounts for stages, serialized LLM groups, parallel groups, retries, usage, and proposal effects", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-1",
      campaignId: "campaign-1",
      tick: 7,
      startedAt: 1000,
    });

    recordTurnLatencyStage(trace, {
      stage: "scene_frame",
      startedAt: 1010,
      endedAt: 1035,
      metadata: { actorCount: 3 },
    });
    recordSerializedLlmGroup(trace, {
      kind: "gm_read",
      startedAt: 1040,
      endedAt: 1110,
      usage: {
        promptTokens: 120,
        completionTokens: 40,
        reasoningTokens: 12,
      },
      outputChars: 640,
    });
    recordSerializedLlmGroup(trace, {
      kind: "storyteller",
      startedAt: 1120,
      endedAt: 1220,
      llmCallCount: 2,
      retryCount: 1,
      usage: {
        inputTokens: 200,
        outputTokens: 90,
        totalTokens: 290,
      },
      outputChars: 1200,
    });
    recordParallelGroup(trace, {
      label: "actor prep",
      startedAt: 1230,
      endedAt: 1265,
      jobCount: 2,
      writeScopes: ["actor:a", "actor:b", "actor:a"],
      serializedFallbackCount: 0,
    });
    addTurnLatencyProposalEffects(trace, {
      deferred: 2,
      cacheHits: 1,
      cacheMisses: 1,
    });

    finalizeTurnLatencyTrace(trace, {
      endedAt: 1300,
      diagnosticOptions: {
        requiredStages: ["scene_frame"],
        normalSerializedGroupLimit: 2,
        retryLimit: 1,
      },
    });

    expect(trace.totalDurationMs).toBe(300);
    expect(trace.stages[0]).toMatchObject({
      stage: "scene_frame",
      durationMs: 25,
      metadata: { actorCount: 3 },
    });
    expect(trace.llmCallCount).toBe(3);
    expect(trace.retryCount).toBe(1);
    expect(trace.usage).toEqual({
      inputTokens: 320,
      outputTokens: 130,
      totalTokens: 450,
      reasoningTokens: 12,
    });
    expect(trace.outputChars).toBe(1840);
    expect(trace.narratorWaitMs).toBe(100);
    expect(trace.parallelGroups[0]?.writeScopes).toEqual(["actor:a", "actor:b"]);
    expect(trace.proposalEffects).toMatchObject({
      deferred: 2,
      cacheHits: 1,
      cacheMisses: 1,
    });
    expect(trace.diagnostics).toEqual([]);
  });

  it("diagnoses missing required stages and serialized group pressure without timing out the turn", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-2",
      campaignId: "campaign-1",
      tick: 8,
      startedAt: 0,
    });

    for (const kind of ["gm_read", "oracle", "gm_tool_loop"] as const) {
      recordSerializedLlmGroup(trace, {
        kind,
        startedAt: 1,
        endedAt: 2,
      });
    }

    finalizeTurnLatencyTrace(trace, {
      endedAt: 10,
      diagnosticOptions: {
        requiredStages: ["scene_frame"],
        normalSerializedGroupLimit: 2,
      },
    });

    expect(trace.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "serialized_group_budget_exceeded",
      "missing_stage",
    ]);
  });
});
