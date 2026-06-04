import { describe, expect, it } from "vitest";

import {
  addLivingWorldProposalMetricsToTrace,
  addTurnLatencyProposalEffects,
  classifyTurnLatencyStage,
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
      criticality: "L0",
      blocksPlayerResponse: true,
      criticalPath: true,
      sourceStageId: "scene_frame",
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

  it("records L0-L4 criticality, blocking status, and critical path metadata", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-crit",
      campaignId: "campaign-1",
      tick: 10,
      startedAt: 0,
    });

    recordTurnLatencyStage(trace, {
      stage: "scene_frame",
      startedAt: 1,
      endedAt: 2,
    });
    recordTurnLatencyStage(trace, {
      stage: "actor_reactions",
      startedAt: 2,
      endedAt: 3,
    });
    recordTurnLatencyStage(trace, {
      stage: "pre_narrator_due_work",
      startedAt: 3,
      endedAt: 4,
    });
    recordTurnLatencyStage(trace, {
      stage: "offscreen_actor_proposal",
      startedAt: 4,
      endedAt: 5,
      sourceStageId: "actor-proposal:background",
    });
    recordTurnLatencyStage(trace, {
      stage: "transient_cleanup",
      startedAt: 5,
      endedAt: 6,
    });

    expect(trace.stages.map((stage) => stage.criticality)).toEqual([
      "L0",
      "L1",
      "L2",
      "L3",
      "L4",
    ]);
    expect(trace.stages.map((stage) => stage.blocksPlayerResponse)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(trace.stages.map((stage) => stage.criticalPath)).toEqual([
      true,
      true,
      true,
      false,
      false,
    ]);
    expect(trace.stages[3]).toMatchObject({
      sourceStageId: "actor-proposal:background",
      classificationReason: "Unmapped work defaults to non-blocking offscreen diagnostics.",
    });
    expect(classifyTurnLatencyStage("transient_cleanup")).toMatchObject({
      criticality: "L4",
      blocksPlayerResponse: false,
      criticalPath: false,
    });
  });

  it("diagnoses required stage classification mismatches and noncritical blocking work", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-classification-warning",
      campaignId: "campaign-1",
      tick: 11,
      startedAt: 0,
    });

    recordTurnLatencyStage(trace, {
      stage: "actor_reactions",
      startedAt: 1,
      endedAt: 2,
      criticality: "L3",
      blocksPlayerResponse: true,
      criticalPath: false,
    });

    finalizeTurnLatencyTrace(trace, {
      endedAt: 10,
      diagnosticOptions: {
        requiredStageDefinitions: [
          {
            stage: "actor_reactions",
            criticality: "L1",
            blocksPlayerResponse: true,
            criticalPath: true,
          },
        ],
      },
    });

    expect(trace.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "stage_classification_mismatch",
      "noncritical_blocking_stage",
    ]);
    expect(trace.diagnostics[0]?.metadata).toMatchObject({
      stage: "actor_reactions",
      mismatches: {
        criticality: { expected: "L1", actual: "L3" },
        criticalPath: { expected: true, actual: false },
      },
    });
  });

  it("rejects output clipping as an invalid latency-control strategy", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-clip",
      campaignId: "campaign-1",
      tick: 12,
      startedAt: 0,
    });
    trace.didClipModelOutput = true;

    finalizeTurnLatencyTrace(trace, { endedAt: 10 });

    expect(trace.diagnostics).toEqual([
      expect.objectContaining({
        code: "output_clip_attempt",
        severity: "error",
      }),
    ]);
  });

  it("warns on heavy serialized pressure without aborting or clipping output", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-heavy",
      campaignId: "campaign-1",
      tick: 13,
      turnClass: "heavy",
      startedAt: 0,
    });

    for (const kind of [
      "world_forecast",
      "gm_read",
      "oracle",
      "gm_tool_loop",
      "actor_decision",
      "storyteller",
    ] as const) {
      recordSerializedLlmGroup(trace, {
        kind,
        startedAt: 1,
        endedAt: 2,
      });
    }

    finalizeTurnLatencyTrace(trace, {
      endedAt: 20,
      diagnosticOptions: { heavySerializedGroupLimit: 5 },
    });

    expect(trace.didClipModelOutput).toBe(false);
    expect(trace.totalDurationMs).toBe(20);
    expect(trace.diagnostics).toEqual([
      expect.objectContaining({
        code: "serialized_group_budget_exceeded",
        severity: "warning",
      }),
    ]);
  });

  it("merges living-world proposal metrics into proposal effects without changing latency semantics", () => {
    const trace = createTurnLatencyTrace({
      turnId: "turn-3",
      campaignId: "campaign-1",
      tick: 9,
      startedAt: 10,
    });

    addLivingWorldProposalMetricsToTrace(trace, {
      counts: {
        totalProposals: 8,
        pending: 2,
        committed: 3,
        rejected: 1,
        canceled: 0,
        expired: 1,
        deferred: 2,
        superseded: 1,
        needsRebase: 1,
        needsActorRetry: 0,
        meaningfulCommitted: 3,
        discoverableSurface: 2,
        explicitNoSurface: 1,
        missingSurface: 0,
        worldThreadEvents: 2,
        locationRecentEvents: 2,
        staleJobs: 1,
      },
    });

    expect(trace.proposalEffects).toMatchObject({
      queued: 2,
      committed: 3,
      rejected: 1,
      deferred: 2,
    });
    expect(trace.totalDurationMs).toBeUndefined();
    expect(trace.stages).toEqual([]);
    expect(trace.didClipModelOutput).toBe(false);
  });
});
