import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type AuthoritativeSceneFrame,
  authoritativeSceneFrameSchema,
  type GameplayRuntimeTurnInput,
  type GmRead,
  gmReadSchema,
  type GmActionChecklist,
  gmActionChecklistSchema,
  gameplayRuntimeTurnInputSchema,
  type JudgeUncertainty,
  judgeUncertaintySchema,
  cleanPlayerFacingTurnRecordSchema,
  cleanNarratorViewSchema,
  cleanSettledTurnPacketSchema,
  cleanStage4ExecutionResultSchema,
  cleanStage4ReceiptSchema,
  type CleanStage4ExecutionResult,
  type CleanStage4Receipt,
  type CleanPlayerFacingTurnRecord,
  type CleanNarratorView,
  oracleSettlementSchema,
  scopedForecastEnvelopeSchema,
} from "../gameplay-cycle-runtime/contracts.js";
import {
  isCleanGameplayRuntimeEnabled,
  processCleanGameplayTurnFromInput,
} from "../gameplay-cycle-runtime/runtime.js";
import {
  buildGmReadSystemPrompt,
  runCleanGmRead,
  validateGmReadCandidate,
} from "../gameplay-cycle-runtime/gm-read.js";
import {
  buildJudgeUncertaintySystemPrompt,
  runCleanJudgeUncertainty,
  validateJudgeUncertaintyCandidate,
} from "../gameplay-cycle-runtime/judge-uncertainty.js";
import {
  buildOraclePayloadV1,
  runCleanOracleSettlement,
  validateOracleSettlement,
} from "../gameplay-cycle-runtime/oracle-settlement.js";
import {
  runCleanGmActionChecklist,
  validateGmActionChecklistCandidate,
} from "../gameplay-cycle-runtime/action-checklist.js";
import type { Stage4ExecutionEvent } from "../gameplay-cycle-runtime/stage4-execution.js";
import {
  buildCleanPublicTurnIds,
  commitCleanPlayerFacingTurn,
  type CleanPlayerFacingTurnRecordStore,
} from "../gameplay-cycle-runtime/turn-persistence.js";
import {
  buildCleanNarratorView,
  buildCleanSettledTurnPacket,
} from "../gameplay-cycle-runtime/settlement.js";
import type { CleanNarrationRunResult } from "../gameplay-cycle-runtime/narration.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";

const runtimeDir = join(process.cwd(), "src", "engine", "gameplay-cycle-runtime");

function runtimeSources(): Array<{ path: string; text: string }> {
  return readdirSync(runtimeDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => {
      const path = join(runtimeDir, file);
      return { path, text: readFileSync(path, "utf8") };
    });
}

describe("gameplay-cycle-runtime primitive 0/1 contracts", () => {
  it("keeps the clean runtime import graph fenced from v1/v2 and old tool-loop owners", () => {
    const forbidden = [
      "gameplay-cycle-v2",
      "gameplay-turn-cycle-v1",
      "gm-turn-decision",
      "gm-turn-read",
      "turn-processor",
      "world-brain",
      "../gm-action-checklist",
      "gm-tool-loop",
      "gm-tool-step",
      "tool-executor",
      "tool-contracts",
      "tool-schemas",
      "runtime-tool-input-schemas",
      "runtime-tool-descriptors",
      "narrator-packet",
      "narration-grounding-guard",
      "visible-narration-output-guard",
      "settled_turn_packets",
      "narrator_attempts",
      "turn_sagas",
    ];

    for (const source of runtimeSources()) {
      for (const token of forbidden) {
        expect(source.text, `${source.path} must not import or cite ${token}`).not.toContain(token);
      }
    }
  });

  it("uses a clean-runtime flag independent from the old gameplay-cycle-v2 flag", () => {
    const previousClean = process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN;
    const previousV2 = process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2;
    try {
      delete process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN;
      process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2 = "true";
      expect(isCleanGameplayRuntimeEnabled()).toBe(false);

      process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN = "true";
      process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2 = "false";
      expect(isCleanGameplayRuntimeEnabled()).toBe(true);
    } finally {
      if (previousClean === undefined) delete process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN;
      else process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN = previousClean;
      if (previousV2 === undefined) delete process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2;
      else process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2 = previousV2;
    }
  });

  it("accepts a Primitive 0 turn input without legacy intent/method or tool payloads", () => {
    const parsed = gameplayRuntimeTurnInputSchema.parse({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: "campaign-1",
      turnId: "clean-turn-1",
      playerAction: {
        submitted: "I look around.",
        normalized: "I look around.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: "snapshot-dir",
          capturedAt: 1,
        },
      },
      providers: {
        judge: { id: "openai", model: "gpt-test", baseUrl: null },
        storyteller: { id: "openai", model: "gpt-test", baseUrl: null },
      },
      idempotencyKey: "campaign-1:0:0:clean-turn-1",
    });

    expect(parsed).not.toHaveProperty("intent");
    expect(parsed).not.toHaveProperty("method");
    expect(JSON.stringify(parsed)).not.toContain("toolId");
  });

  it("makes scoped forecast advisory and non-authoritative by schema", () => {
    const parsed = scopedForecastEnvelopeSchema.parse({
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    });

    expect(parsed.advisoryOnly).toBe(true);
    expect(parsed.mayAuthorizeMutation).toBe(false);
    expect(parsed.maySupportNarrationClaim).toBe(false);
  });

  it("requires SceneFrame refs and capabilities to live in the authoritative frame contract", () => {
    const parsed = authoritativeSceneFrameSchema.parse({
      version: "scene-frame.v1",
      frameId: "frame-1",
      campaignId: "campaign-1",
      turnId: "clean-turn-1",
      base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
      playerAction: "I look around.",
      player: {
        ref: "Player",
        label: "Player",
        visibleStatus: { hp: null, conditions: [] },
      },
      scene: {
        currentLocation: { ref: "Market", label: "Market", description: null },
        currentScene: { ref: "Market", label: "Market", description: null },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      actors: [],
      movementOptions: [],
      targets: [],
      inventory: [],
      capabilities: [
        {
          capabilityId: "observe_visible",
          evidenceAuthority: "observation_only",
          allowed: true,
        },
      ],
      citableRefs: ["Player", "Market"],
      privateGuards: {
        forbiddenActorLabels: [],
        forbiddenPrivateTerms: [],
      },
      forecast: {
        version: "scoped-forecast.v1",
        advisoryOnly: true,
        sourceStatus: "empty_missing",
        mayAuthorizeMutation: false,
        maySupportNarrationClaim: false,
        entries: [],
        forbiddenPrivateTerms: [],
      },
    });

    expect(parsed.citableRefs).toContain("Player");
    expect(parsed.capabilities[0]?.capabilityId).toBe("observe_visible");
  });

  it("rejects SceneFrame private terms that duplicate public citable refs", () => {
    const frame = minimalFrame({
      privateGuards: {
        forbiddenActorLabels: ["Guide"],
        forbiddenPrivateTerms: ["Market"],
      },
      forecast: {
        ...minimalFrame().forecast,
        forbiddenPrivateTerms: ["North Hall"],
      },
    });

    const result = authoritativeSceneFrameSchema.safeParse(frame);

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("privateGuards.forbiddenActorLabels.0");
      expect(paths).toContain("privateGuards.forbiddenPrivateTerms.0");
      expect(paths).toContain("forecast.forbiddenPrivateTerms.0");
    }
  });
});

describe("gameplay-cycle-runtime primitive 5 player-facing turn persistence contracts", () => {
  function memoryStore(initial: CleanPlayerFacingTurnRecord[] = []): {
    store: CleanPlayerFacingTurnRecordStore;
    records: CleanPlayerFacingTurnRecord[];
  } {
    const records = [...initial];
    return {
      records,
      store: {
        findByIdempotencyKey: (campaignId, idempotencyKey) =>
          records.find((record) =>
            record.campaignId === campaignId && record.idempotencyKey === idempotencyKey
          ) ?? null,
        findByInternalTurnId: (campaignId, internalTurnId) =>
          records.find((record) =>
            record.campaignId === campaignId && record.internalTurnId === internalTurnId
          ) ?? null,
        insert: (record) => {
          records.push(record);
        },
      },
    };
  }

  function memoryChat(seed: Array<{ role: "user" | "assistant"; content: string }> = []) {
    const history = [...seed];
    return {
      history,
      adapter: {
        getHistory: () => [...history],
        append: (_campaignId: string, messages: Array<{ role: "user" | "assistant"; content: string }>) => {
          history.push(...messages);
        },
      },
    };
  }

  function projectionFor(turn = validTurnInput()) {
    return {
      version: "gameplay-runtime.frozen-api-projection.v1" as const,
      runtime: "gameplay-cycle-runtime" as const,
      campaignId: turn.campaignId,
      turnId: turn.turnId,
      frameId: "frame-1",
      narrativeText: "Текущая сцена: Market.",
      mutationApplied: false as const,
      settled: true as const,
    };
  }

  function settlementFor(turn = validTurnInput(), frame = minimalFrame()) {
    const ids = buildCleanPublicTurnIds(turn);
    const settledPacket = buildCleanSettledTurnPacket({
      turn,
      publicPacketId: ids.publicPacketId,
      frame: {
        ...frame,
        campaignId: turn.campaignId,
        turnId: turn.turnId,
      },
      gmRead: null,
      judgment: null,
      oracleSettlement: null,
      actionChecklist: null,
      stage4Execution: null,
    });
    return {
      settledPacket,
      narratorView: buildCleanNarratorView(settledPacket),
    };
  }

  const evidenceRefs = [{
    kind: "scene_frame" as const,
    ref: "frame-1",
    authority: "snapshot" as const,
  }];

  it("accepts a minimal committed direct clean player-facing record", async () => {
    const turn = validTurnInput();
    const store = memoryStore();
    const chat = memoryChat();

    const result = await commitCleanPlayerFacingTurn({
      turn,
      projection: projectionFor(turn),
      settlement: settlementFor(turn),
      evidenceRefs,
      now: 42,
      chat: chat.adapter,
      store: store.store,
    });

    expect(cleanPlayerFacingTurnRecordSchema.safeParse(result.record).success).toBe(true);
    expect(result.record.version).toBe("gameplay-runtime.player-facing-turn-record.v1");
    expect(result.record.doneBoundary.turnId).toMatch(/^cgturn_/u);
    expect(result.record.doneBoundary.packetId).toMatch(/^cgpacket_/u);
    expect(chat.history).toEqual([
      { role: "user", content: "I look around." },
      { role: "assistant", content: "Текущая сцена: Market." },
    ]);
  });

  it("accepts a minimal committed Oracle clean record with only evidence refs, not adapter internals", async () => {
    const turn = validTurnInput();
    const store = memoryStore();
    const chat = memoryChat();
    const result = await commitCleanPlayerFacingTurn({
      turn,
      projection: projectionFor(turn),
      settlement: settlementFor(turn),
      evidenceRefs: [
        ...evidenceRefs,
        {
          kind: "oracle_settlement",
          ref: "oracle-settlement-1",
          authority: "visible_uncertainty_outcome",
        },
      ],
      now: 42,
      chat: chat.adapter,
      store: store.store,
    });

    expect(result.record.evidenceRefs.map((ref) => ref.kind)).toEqual([
      "scene_frame",
      "oracle_settlement",
    ]);
    expect(JSON.stringify(result.record)).not.toContain("roll");
    expect(JSON.stringify(result.record)).not.toContain("chance");
    expect(JSON.stringify(result.record)).not.toContain("reasoning");
  });

  it("rejects old v2, saga, narrator, and receipt-ledger surfaces in clean records", async () => {
    const turn = validTurnInput();
    const store = memoryStore();
    const chat = memoryChat();
    const { record } = await commitCleanPlayerFacingTurn({
      turn,
      projection: projectionFor(turn),
      settlement: settlementFor(turn),
      evidenceRefs,
      now: 42,
      chat: chat.adapter,
      store: store.store,
    });

    for (const forbidden of [
      { gameplay_cycle_v2_packet_id: "v2packet-1" },
      { turn_saga_id: "saga-1" },
      { narrator_attempt_id: "narrator-1" },
      { receipt_ledger_json: "{}" },
    ]) {
      expect(cleanPlayerFacingTurnRecordSchema.safeParse({ ...record, ...forbidden }).success)
        .toBe(false);
    }
  });

  it("appends exactly two chat messages only when the base history length matches", async () => {
    const turn = validTurnInput();
    const store = memoryStore();
    const chat = memoryChat([{ role: "assistant", content: "prior drift" }]);

    await expect(commitCleanPlayerFacingTurn({
      turn,
      projection: projectionFor(turn),
      settlement: settlementFor(turn),
      evidenceRefs,
      now: 42,
      chat: chat.adapter,
      store: store.store,
    })).rejects.toThrow(/history drifted/u);

    expect(chat.history).toEqual([{ role: "assistant", content: "prior drift" }]);
    expect(store.records).toEqual([]);
  });

  it("validates the committed tail and reuses an existing idempotency record without duplication", async () => {
    const turn = validTurnInput();
    const store = memoryStore();
    const chat = memoryChat();
    const first = await commitCleanPlayerFacingTurn({
      turn,
      projection: projectionFor(turn),
      settlement: settlementFor(turn),
      evidenceRefs,
      now: 42,
      chat: chat.adapter,
      store: store.store,
    });
    const second = await commitCleanPlayerFacingTurn({
      turn,
      projection: projectionFor(turn),
      settlement: settlementFor(turn),
      evidenceRefs,
      now: 43,
      chat: chat.adapter,
      store: store.store,
    });

    expect(first.record.recordId).toBe(second.record.recordId);
    expect(chat.history).toHaveLength(2);
    expect(store.records).toHaveLength(1);
  });

  it("makes runtime done wait for the injected commit adapter and uses public-safe done ids", async () => {
    const order: string[] = [];
    const frame = minimalFrame();
    const events = [];
    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => frame,
      gmReadCandidateGenerator: async () => validGmRead(frame),
      judgeUncertaintyCandidateGenerator: async () => validJudgeUncertainty(frame),
      runNarration: fakeRunNarration,
      commitTurn: async (input) => {
        order.push(`commit:${input.projection.narrativeText}`);
        return fakeCommitTurn(input);
      },
    })) {
      if (event.type === "done") order.push("done");
      events.push(event);
    }

    expect(order).toEqual(["commit:Current scene is Market.", "done"]);
    const done = events.at(-1);
    expect(done?.type).toBe("done");
    expect(done?.data).toMatchObject({
      runtime: "gameplay-cycle-runtime",
      turnId: "cgturn_fakecommit0000000000",
    });
    expect((done?.data as { packetId?: string }).packetId).toMatch(/^cgpacket_/u);
    expect(JSON.stringify(done?.data)).not.toContain("clean-turn-1");
    expect(JSON.stringify(done?.data)).not.toContain("frame-1");
  });
});

const provider: ProviderConfig = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-key",
  model: "test-model",
};

function minimalFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  const frame: AuthoritativeSceneFrame = {
    version: "scene-frame.v1",
    frameId: "frame-1",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
    playerAction: "I look around.",
    player: {
      ref: "Player",
      label: "Player",
      visibleStatus: { hp: null, conditions: [] },
    },
    scene: {
      currentLocation: { ref: "Market", label: "Market", description: null },
      currentScene: { ref: "Market", label: "Market", description: null },
      visibleFacts: [],
      recentLocalFacts: [],
    },
    actors: [{
      ref: "Guide",
      label: "Guide",
      role: "support",
      visibleStatus: { hp: null, conditions: [] },
    }],
    movementOptions: [{
      ref: "North Hall",
      label: "North Hall",
      connected: true,
      travelCost: 1,
    }],
    targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
    inventory: [],
    capabilities: [
      {
        capabilityId: "observe_visible",
        evidenceAuthority: "observation_only",
        allowed: true,
      },
    ],
    citableRefs: ["Player", "Market", "Guide", "North Hall"],
    privateGuards: {
      forbiddenActorLabels: [],
      forbiddenPrivateTerms: [],
    },
    forecast: {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    },
  };
  return { ...frame, ...overrides };
}

function validGmRead(frame = minimalFrame()): GmRead {
  return {
    version: "gm-read.v1",
    frameId: frame.frameId,
    turnId: frame.turnId,
    path: "direct",
    situationSummary: "The player is in the current visible scene.",
    liveSceneQuestion: "What does the player observe from here?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", "Market"],
    actionInterpretation: {
      summary: "The player is observing the current scene without changing it.",
      playerIntent: "Observe the scene.",
      method: null,
      targetRefs: ["Market"],
    },
    uncertainty: {
      present: false,
      question: null,
      basis: null,
    },
    interpretationRationale: "The action only asks for current visible context.",
  };
}

function validJudgeUncertainty(
  frame = minimalFrame(),
  gmRead = validGmRead(frame),
): JudgeUncertainty {
  return {
    version: "judge-uncertainty.v1",
    judgmentId: "judge-1",
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    frameId: frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: gmRead.path,
    },
    physicalPossibility: "possible",
    checkNeed: "no_roll_needed",
    nextStep: "settle_no_roll",
    actorRefs: ["Player"],
    targetRefs: ["Market"],
    evidenceRefs: ["Player", "Market"],
    possibilityRationale: "The player can observe the current scene.",
    checkRationale: "Current visible observation does not require a random outcome.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "deterministic_scene_truth",
      explanation: "The action asks for current visible scene truth.",
      evidenceRefs: ["Player", "Market"],
    },
  };
}

function validOracleJudgeUncertainty(
  frame = minimalFrame(),
  gmRead = validGmRead(frame),
): JudgeUncertainty {
  return {
    ...validJudgeUncertainty(frame, gmRead),
    physicalPossibility: "possible_but_uncertain",
    checkNeed: "oracle_roll_needed",
    nextStep: "oracle_roll",
    actorRefs: ["Player"],
    targetRefs: ["Guide"],
    evidenceRefs: ["Player", "Guide", "Market"],
    possibilityRationale: "The player can attempt the risky read.",
    checkRationale: "The visible actor's reaction under pressure is genuinely uncertain.",
    difficulty: {
      tier: "standard",
      basis: "The player is reading a visible actor under pressure.",
      evidenceRefs: ["Player", "Guide"],
    },
    oracleAdmission: {
      admissionId: "oracle-admission-1",
      question: "Does Guide notice the player's subtle action?",
      uncertaintyKind: "perception_under_pressure",
      actorRef: "Player",
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Guide"],
      stakes: "The response determines whether the visible actor reacts now.",
      difficultyTier: "standard",
      outcomeMeanings: {
        strong_hit: "The player acts without Guide noticing.",
        weak_hit: "Guide notices something but does not fully understand it.",
        miss: "Guide notices and reacts immediately.",
      },
      settlementScope: "visible_outcome_only",
      requiresFollowupMutation: false,
    },
    noRollReason: null,
  };
}

function actionPlanFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  return minimalFrame({
    capabilities: [
      { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
      { capabilityId: "route_options", evidenceAuthority: "observation_only", allowed: true },
      { capabilityId: "route_check", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "movement", evidenceAuthority: "terminal_receipt_required", allowed: true },
      { capabilityId: "time_advance", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "scene_beat_record", evidenceAuthority: "observation_only", allowed: true },
    ],
    ...overrides,
  });
}

function actionPlanGmRead(frame = actionPlanFrame()): GmRead {
  return {
    ...validGmRead(frame),
    path: "procedural",
    liveSceneQuestion: "Which backend consequences are needed for the action?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", "Market", "North Hall"],
    actionInterpretation: {
      summary: "The player intends to move toward a visible connected destination.",
      playerIntent: "Move toward North Hall.",
      method: "walk",
      targetRefs: ["North Hall"],
    },
    interpretationRationale: "The action requests a world-state consequence.",
  };
}

function actionPlanJudge(frame = actionPlanFrame(), gmRead = actionPlanGmRead(frame)): JudgeUncertainty {
  return {
    ...validJudgeUncertainty(frame, gmRead),
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: gmRead.path,
    },
    checkNeed: "backend_action_plan_needed",
    nextStep: "action_plan",
    targetRefs: ["North Hall"],
    evidenceRefs: ["Player", "Market", "North Hall"],
    checkRationale: "Moving to a destination needs later backend-owned consequence resolution.",
    noRollReason: {
      code: "backend_receipt_required",
      explanation: "Movement needs later backend receipt authority.",
      evidenceRefs: ["Player", "North Hall"],
    },
  };
}

function validActionChecklist(
  frame = actionPlanFrame(),
  gmRead = actionPlanGmRead(frame),
  judgment = actionPlanJudge(frame, gmRead),
): GmActionChecklist {
  return {
    version: "gm-action-checklist.v1",
    checklistId: "gm-action-checklist-1",
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    frameId: frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      gmReadPath: gmRead.path,
      judgmentId: judgment.judgmentId,
      judgeCheckNeed: "backend_action_plan_needed",
      judgeNextStep: "action_plan",
      judgeNoRollReasonCode: "backend_receipt_required",
    },
    base: frame.base,
    turnIntent: {
      playerIntent: gmRead.actionInterpretation.playerIntent,
      admittedConsequenceNeed: judgment.noRollReason?.explanation ?? judgment.checkRationale,
    },
    steps: [{
      stepId: "step-1",
      purpose: "Resolve the intended movement with later backend authority.",
      actorRef: "Player",
      targetRefs: ["North Hall"],
      evidenceRefs: ["Player", "North Hall"],
      intended: {
        kind: "movement",
        stateOrEvidence: "state",
        requiredCapabilityId: "movement",
        summary: "Plan movement toward North Hall for later Stage 4 resolution.",
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
        reason: "Movement needs a later terminal backend receipt.",
      },
      dependsOnStepIds: [],
      expectedVisibleEffect: {
        summary: "The player may visibly move toward North Hall if later execution accepts it.",
        visibleRefs: ["Player", "North Hall"],
      },
    }],
    authority: {
      evidenceAuthority: "planning_only",
      mutationAuthority: "none",
      mayAuthorizeMutation: false,
      mayGenerateExecutableRequest: false,
      maySupportNarrationClaim: false,
      settledTruth: false,
      publicExposure: "stage_summary_only",
    },
  };
}

function validTurnInput(): GameplayRuntimeTurnInput {
  return gameplayRuntimeTurnInputSchema.parse({
    version: "gameplay-runtime.turn-input.v1",
    route: "/api/chat/action",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    playerAction: {
      submitted: "I look around.",
      normalized: "I look around.",
      source: "typed",
    },
    base: {
      tick: 0,
      worldVersion: 0,
      worldTimeMinutes: 0,
      chatHistoryLengthBeforeTurn: 0,
      preTurnSnapshot: {
        bundleDir: "snapshot-dir",
        capturedAt: 1,
      },
    },
    providers: {
      judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
    },
    idempotencyKey: "campaign-1:0:0:clean-turn-1",
  });
}

async function fakeCommitTurn(input: Parameters<typeof commitCleanPlayerFacingTurn>[0]) {
  const userMessageSha256 = "a".repeat(64);
  const assistantMessageSha256 = "b".repeat(64);
  return {
    record: cleanPlayerFacingTurnRecordSchema.parse({
      version: "gameplay-runtime.player-facing-turn-record.v1",
      runtime: "gameplay-cycle-runtime",
      route: "/api/chat/action",
      campaignId: input.turn.campaignId,
      recordId: "cgtr_fakecommit000000000000",
      publicTurnId: "cgturn_fakecommit0000000000",
      publicPacketId: input.settlement.settledPacket.packetId,
      internalTurnId: input.turn.turnId,
      internalFrameId: input.projection.frameId,
      idempotencyKey: input.turn.idempotencyKey,
      committedAt: 1,
      input: {
        submittedPlayerAction: input.turn.playerAction.submitted,
        normalizedPlayerAction: input.turn.playerAction.normalized,
        source: input.turn.playerAction.source,
      },
      base: {
        tick: input.turn.base.tick,
        worldVersion: input.turn.base.worldVersion,
        worldTimeMinutes: input.turn.base.worldTimeMinutes ?? 0,
        chatHistoryLengthBeforeTurn: input.turn.base.chatHistoryLengthBeforeTurn,
      },
      chat: {
        userMessageIndex: 0,
        assistantMessageIndex: 1,
        userMessageSha256,
        assistantMessageSha256,
      },
      terminalProjection: input.projection,
      settlement: input.settlement,
      evidenceRefs: input.evidenceRefs,
      durableEventIds: { accepted: [], produced: [] },
      doneBoundary: {
        runtime: "gameplay-cycle-runtime",
        recordId: "cgtr_fakecommit000000000000",
        turnId: "cgturn_fakecommit0000000000",
        packetId: input.settlement.settledPacket.packetId,
        mutationApplied: input.projection.mutationApplied,
        settled: true,
        chatHistoryLengthBeforeTurn: 0,
        chatHistoryLengthAfterTurn: 2,
        userMessageSha256,
        assistantMessageSha256,
      },
    }),
    doneBoundary: {
      runtime: "gameplay-cycle-runtime" as const,
      recordId: "cgtr_fakecommit000000000000",
      turnId: "cgturn_fakecommit0000000000",
      packetId: input.settlement.settledPacket.packetId,
      mutationApplied: input.projection.mutationApplied,
      settled: true as const,
      chatHistoryLengthBeforeTurn: 0,
      chatHistoryLengthAfterTurn: 2,
      userMessageSha256,
      assistantMessageSha256,
    },
  };
}

async function fakeRunNarration(input: {
  narratorView: CleanNarratorView;
  provider: ProviderConfig;
}): Promise<CleanNarrationRunResult> {
  void input.provider;
  const text = input.narratorView.acceptedEvidence[0]?.backendFacts[0]?.text
    ?? "Current scene is Market.";
  return {
    version: "gameplay-runtime.clean-narration-result.v1",
    packetId: input.narratorView.packetId,
    turnId: input.narratorView.turnId,
    text,
    source: "model",
    validationIssues: [],
  };
}

function acceptedMovementReceipt(
  frame = actionPlanFrame(),
  checklist = validActionChecklist(frame),
): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: "stage4-receipt-accepted-move",
    requestId: "stage4-request-accepted-move",
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    frameId: frame.frameId,
    checklistId: checklist.checklistId,
    stepId: "step-1",
    capabilityId: "movement",
    status: "accepted",
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: checklist.checklistId,
      checklistStepId: "step-1",
    },
    base: frame.base,
    result: {
      tick: 1,
      worldVersion: frame.base.worldVersion + 1,
      worldTimeMinutes: frame.base.worldTimeMinutes + 1,
      mutationApplied: true,
    },
    authority: {
      evidenceAuthority: "terminal_mutation_receipt",
      mutationAuthority: "player_location_and_world_clock",
      visibleResultAuthority: "may_claim_player_location_change",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: true,
    },
    publicResult: {
      summary: "You move to North Hall.",
      visibleRefs: ["Player", "North Hall"],
      routeStatus: null,
      locationChange: {
        type: "location_change",
        locationName: "North Hall",
        travelCost: 1,
        path: ["Market", "North Hall"],
      },
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
    },
    privateResult: {
      playerId: "player-1",
      fromLocationId: "loc-market",
      destinationLocationId: "loc-north-hall",
      edgeIds: ["edge-market-north-hall"],
      authorityTraceId: "stage4-authority-1",
      clockReceiptId: "stage4-clock-1",
      stateDeltaRefs: ["player-location-stage4-receipt-accepted-move"],
    },
    failure: null,
  });
}

function acceptedMovementExecution(
  frame = actionPlanFrame(),
  checklist = validActionChecklist(frame),
): CleanStage4ExecutionResult {
  const receipt = acceptedMovementReceipt(frame, checklist);
  return cleanStage4ExecutionResultSchema.parse({
    version: "gameplay-runtime.stage4-execution-result.v1",
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    frameId: frame.frameId,
    checklistId: checklist.checklistId,
    base: frame.base,
    receipts: [receipt],
    acceptedReceiptIds: [receipt.receiptId],
    skippedStepIds: [],
    failedStepIds: [],
    mutationApplied: true,
    resultWorldVersion: frame.base.worldVersion + 1,
    visibleResults: [{
      receiptId: receipt.receiptId,
      authority: "terminal_mutation_receipt",
      summary: receipt.publicResult.summary,
      visibleRefs: receipt.publicResult.visibleRefs,
      locationChange: receipt.publicResult.locationChange,
      timeAdvance: receipt.publicResult.timeAdvance,
    }],
  });
}

describe("gameplay-cycle-runtime primitive 2 GM Read contracts", () => {
  it("accepts a strict interpretation without admission, executable, mutation, receipt, or narration authority", () => {
    const parsed = gmReadSchema.parse(validGmRead());

    expect(parsed.version).toBe("gm-read.v1");
    expect(JSON.stringify(parsed)).not.toContain("toolName");
    expect(JSON.stringify(parsed)).not.toContain("requiredEffectKinds");
    expect(JSON.stringify(parsed)).not.toContain("oracleRequest");
    expect(JSON.stringify(parsed)).not.toContain("mutation");
    expect(JSON.stringify(parsed)).not.toContain("receiptId");
    expect(JSON.stringify(parsed)).not.toContain("receipts");
    expect(JSON.stringify(parsed)).not.toContain("receipt_ledger");
    expect(JSON.stringify(parsed)).not.toContain("narrativeText");
  });

  it("rejects unknown root fields in Primitive 2 GM Read candidates", () => {
    const candidate = {
      ...validGmRead(),
      hiddenPlan: "smuggled",
    };

    expect(gmReadSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "toolId",
    "toolName",
    "toolInput",
    "input",
    "payload",
    "args",
    "toolCall",
    "plannedTools",
    "candidateToolRequest",
    "requiredEffectKinds",
    "checklist",
    "oracleAdmission",
    "stateDelta",
    "mutation",
    "receipt",
    "resultWorldVersion",
  ])("rejects recursive executable and admission key %s before accepting GM Read", (key) => {
    const candidate = {
      ...validGmRead(),
      actionInterpretation: {
        ...validGmRead().actionInterpretation,
        extra: [{ [key]: "smuggled" }],
      },
    };

    const result = validateGmReadCandidate({
      frame: minimalFrame(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "execution_payload")).toBe(true);
  });

  it("allows GM Read refs only from SceneFrame.citableRefs and rejects backend refs", () => {
    const candidate = {
      ...validGmRead(),
      focalRefs: ["Hidden Watcher"],
      evidenceRefs: ["actor:abc"],
      actionInterpretation: {
        ...validGmRead().actionInterpretation,
        targetRefs: ["invented gate"],
      },
    };

    const result = validateGmReadCandidate({
      frame: minimalFrame(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "uncited_ref")).toHaveLength(3);
    expect(result.issues.some((issue) => issue.code === "backend_ref")).toBe(true);
  });

  it.each([
    ["situationSummary", (read: GmRead) => ({ ...read, situationSummary: "Hidden Watcher is here." })],
    ["liveSceneQuestion", (read: GmRead) => ({ ...read, liveSceneQuestion: "Is the sealed patron visible?" })],
    ["actionInterpretation.summary", (read: GmRead) => ({
      ...read,
      actionInterpretation: {
        ...read.actionInterpretation,
        summary: "The player notices Hidden Watcher.",
      },
    })],
    ["uncertainty.basis", (read: GmRead) => ({
      ...read,
      uncertainty: {
        present: true,
        question: "Is there pressure?",
        basis: "sealed patron pressure",
      },
    })],
    ["interpretationRationale", (read: GmRead) => ({
      ...read,
      interpretationRationale: "Hidden Watcher would know.",
    })],
  ])("rejects private guard terms in %s", (_name, mutate) => {
    const frame = minimalFrame({
      privateGuards: {
        forbiddenActorLabels: ["Hidden Watcher"],
        forbiddenPrivateTerms: ["sealed patron"],
      },
    });
    const result = validateGmReadCandidate({
      frame,
      candidate: mutate(validGmRead(frame)),
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "private_term")).toBe(true);
  });

  it("keeps the GM Read prompt interpretive instead of admission-oriented", () => {
    const prompt = buildGmReadSystemPrompt();

    expect(prompt).toContain("interpretation only");
    expect(prompt).toContain("must not narrate");
    expect(prompt).toContain("must not");
    expect(prompt).toContain("call tools");
    expect(prompt).toContain("procedural does not authorize");
    expect(prompt).toContain("uncertain does not authorize");
  });

  it("repairs once locally, then accepts only a validated GM Read", async () => {
    const frame = minimalFrame();
    const calls: string[] = [];
    const result = await runCleanGmRead({
      frame,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        if (!request.repairOf) {
          return {
            ...validGmRead(frame),
            payload: { toolId: "movement" },
          };
        }
        return validGmRead(frame);
      },
    });

    expect(calls).toEqual(["initial", "repair"]);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(true);
  });

  it("falls back to a no-mutation clarification read when generation and repair stay invalid", async () => {
    const frame = minimalFrame();
    const result = await runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => ({
        ...validGmRead(frame),
        toolInput: { effect: "smuggled" },
      }),
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.read.path).toBe("clarification");
    expect(result.read.frameId).toBe(frame.frameId);
  });

  it("runs GM Read after SceneFrame and before Judge/Uncertainty events", async () => {
    const order: string[] = [];
    const frame = minimalFrame();
    const events = [];

    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => {
        order.push("frame");
        return frame;
      },
      gmReadCandidateGenerator: async () => {
        order.push("gm-read");
        return validGmRead(frame);
      },
      judgeUncertaintyCandidateGenerator: async () => {
        order.push("judge-uncertainty");
        return validJudgeUncertainty(frame);
      },
      runNarration: fakeRunNarration,
      commitTurn: fakeCommitTurn,
    })) {
      events.push(event);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (stage === "scene-frame") order.push("scene-frame-progress");
        if (stage === "gm-read") order.push("gm-read-progress");
        if (stage === "judge-uncertainty") order.push("judge-uncertainty-progress");
        if (stage === "settled-turn-packet") order.push("settled-turn-packet-progress");
      }
    }

    expect(order).toEqual([
      "scene-frame-progress",
      "frame",
      "gm-read-progress",
      "gm-read",
      "judge-uncertainty-progress",
      "judge-uncertainty",
      "settled-turn-packet-progress",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
  });
});

describe("gameplay-cycle-runtime primitive 3 Judge/Uncertainty contracts", () => {
  it("accepts a strict no-roll admission without tools, checklist, receipts, mutation, narration, or Oracle result", () => {
    const parsed = judgeUncertaintySchema.parse(validJudgeUncertainty());

    expect(parsed.version).toBe("judge-uncertainty.v1");
    expect(parsed.nextStep).toBe("settle_no_roll");
    expect(parsed.oracleAdmission).toBeNull();
    expect(parsed.noRollReason?.code).toBe("deterministic_scene_truth");
    expect(JSON.stringify(parsed)).not.toContain("toolName");
    expect(JSON.stringify(parsed)).not.toContain("requiredEffectKinds");
    expect(JSON.stringify(parsed)).not.toContain("oracleResult");
    expect(JSON.stringify(parsed)).not.toContain("mutation");
    expect(JSON.stringify(parsed)).not.toContain("receipt");
    expect(JSON.stringify(parsed)).not.toContain("narrativeText");
  });

  it("accepts backend action-plan admission without importing effect or tool payload ownership", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "procedural" as const,
    };
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "procedural",
      },
      checkNeed: "backend_action_plan_needed",
      nextStep: "action_plan",
      checkRationale: "The action needs backend-owned receipts later, not a roll.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Consequences need later action planning.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("accepted");
    expect(JSON.stringify(candidate)).not.toContain("toolId");
    expect(JSON.stringify(candidate)).not.toContain("effectKind");
  });

  it("rejects procedural GM Read that tries to settle backend consequences as no-roll narration", () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const candidate = validJudgeUncertainty(frame, gmRead);

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "branch_invalid",
          path: "checkNeed",
        }),
      ]),
    );
  });

  it("repairs procedural no-roll drift into backend action-plan admission", async () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const calls: string[] = [];
    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        if (!request.repairOf) {
          return validJudgeUncertainty(frame, gmRead);
        }
        return actionPlanJudge(frame, gmRead);
      },
    });

    expect(calls).toEqual(["initial", "repair"]);
    expect(result.status).toBe("accepted");
    expect(result.judgment.nextStep).toBe("action_plan");
    expect(result.judgment.checkNeed).toBe("backend_action_plan_needed");
    expect(result.judgment.noRollReason?.code).toBe("backend_receipt_required");
  });

  it("accepts a true Oracle admission but does not include a roll or selected outcome", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const candidate = validOracleJudgeUncertainty(frame, gmRead);

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("accepted");
    expect(candidate.oracleAdmission?.outcomeMeanings.strong_hit).toContain("without Guide noticing");
    expect(JSON.stringify(candidate)).not.toContain("selectedOutcome");
    expect(JSON.stringify(candidate)).not.toContain("outcomeTier");
  });

  it("accepts gm-read uncertain as a signal without forcing an Oracle admission", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
      uncertainty: {
        present: true,
        question: "Is anything uncertain?",
        basis: "The interpreter was not certain.",
      },
    };
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "uncertain",
      },
      noRollReason: {
        code: "gm_read_uncertain_signal_only",
        explanation: "The Judge found no true rollable uncertainty in the current frame.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate }).status).toBe("accepted");
  });

  it("rejects unknown root fields in Primitive 3 Judge/Uncertainty candidates", () => {
    const candidate = {
      ...validJudgeUncertainty(),
      hiddenPlan: "smuggled",
    };

    expect(judgeUncertaintySchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "toolId",
    "toolName",
    "toolInput",
    "payload",
    "args",
    "toolCall",
    "plannedTools",
    "candidateToolRequest",
    "requiredEffectKinds",
    "checklist",
    "checklistAdmission",
    "lane",
    "stateDelta",
    "mutation",
    "receipt",
    "narrativeText",
    "oracleResult",
    "roll",
    "chance",
    "selectedOutcome",
  ])("rejects recursive settlement/executable key %s before accepting Judge/Uncertainty", (key) => {
    const candidate = {
      ...validJudgeUncertainty(),
      noRollReason: {
        ...validJudgeUncertainty().noRollReason,
        extra: [{ [key]: "smuggled" }],
      },
    };

    const result = validateJudgeUncertaintyCandidate({
      frame: minimalFrame(),
      gmRead: validGmRead(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "settlement_payload")).toBe(true);
  });

  it("allows Judge/Uncertainty refs only from SceneFrame.citableRefs and rejects backend refs", () => {
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(),
      actorRefs: ["actor:abc"],
      targetRefs: ["invented gate"],
      evidenceRefs: ["Hidden Watcher"],
    };

    const result = validateJudgeUncertaintyCandidate({
      frame: minimalFrame(),
      gmRead: validGmRead(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "uncited_ref")).toHaveLength(3);
    expect(result.issues.some((issue) => issue.code === "backend_ref")).toBe(true);
  });

  it("rejects private guard terms in public Judge/Uncertainty fields", () => {
    const frame = minimalFrame({
      privateGuards: {
        forbiddenActorLabels: ["Hidden Watcher"],
        forbiddenPrivateTerms: ["sealed patron"],
      },
    });
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame),
      possibilityRationale: "Hidden Watcher is relevant.",
      checkRationale: "The sealed patron would know.",
    };

    const result = validateJudgeUncertaintyCandidate({
      frame,
      gmRead: validGmRead(frame),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "private_term")).toBe(true);
  });

  it("rejects frame, turn, and GM Read linkage mismatches", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      frameId: "other-frame",
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "procedural",
      },
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "frame_mismatch").length).toBeGreaterThanOrEqual(2);
  });

  it("rejects Oracle branch without full Oracle admission and difficulty invariants", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      checkNeed: "oracle_roll_needed",
      nextStep: "oracle_roll",
      physicalPossibility: "possible_but_uncertain",
      noRollReason: null,
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.path === "difficulty")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "oracleAdmission")).toBe(true);
  });

  it("normalizes omitted nullable branch fields before validating Oracle admission", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const { noRollReason: _omitted, ...oracleCandidate } = validOracleJudgeUncertainty(frame, gmRead);

    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => oracleCandidate,
    });

    expect(result.status).toBe("accepted");
    expect(result.judgment.nextStep).toBe("oracle_roll");
    expect(result.judgment.noRollReason).toBeNull();
  });

  it("rejects non-Oracle branches that smuggle Oracle admission or difficulty", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const oracle = validOracleJudgeUncertainty(frame, gmRead);
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      oracleAdmission: oracle.oracleAdmission,
      difficulty: oracle.difficulty,
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.path === "oracleAdmission")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "difficulty")).toBe(true);
  });

  it("rejects impossible actions that try to roll or action-plan", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const candidate: JudgeUncertainty = {
      ...validOracleJudgeUncertainty(frame, gmRead),
      physicalPossibility: "impossible",
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "branch_invalid")).toBe(true);
  });

  it("keeps the Judge/Uncertainty prompt admission-only and non-settling", () => {
    const prompt = buildJudgeUncertaintySystemPrompt();

    expect(prompt).toContain("admission layer");
    expect(prompt).toContain("must not narrate");
    expect(prompt).toContain("mutate state");
    expect(prompt).toContain("roll dice");
    expect(prompt).toContain("gm-read uncertain is a signal");
    expect(prompt).toContain("backend-owned consequences");
  });

  it("repairs once locally, then accepts only a validated Judge/Uncertainty packet", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const calls: string[] = [];
    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        if (!request.repairOf) {
          return {
            ...validJudgeUncertainty(frame, gmRead),
            toolInput: { effect: "smuggled" },
          };
        }
        return validJudgeUncertainty(frame, gmRead);
      },
    });

    expect(calls).toEqual(["initial", "repair"]);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(true);
  });

  it("falls back to a no-mutation clarification when generation and repair stay invalid", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => ({
        ...validJudgeUncertainty(frame, gmRead),
        oracleResult: { tier: "strong_hit" },
      }),
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.judgment.nextStep).toBe("ask_clarification");
    expect(result.judgment.oracleAdmission).toBeNull();
  });

  it("skips Judge/Uncertainty when GM Read falls back before admission", async () => {
    const order: string[] = [];
    const frame = minimalFrame();

    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => frame,
      gmReadCandidateGenerator: async () => ({
        ...validGmRead(frame),
        toolInput: { effect: "invalid" },
      }),
      judgeUncertaintyCandidateGenerator: async () => {
        order.push("judge-called");
        return validJudgeUncertainty(frame);
      },
      runNarration: fakeRunNarration,
      commitTurn: fakeCommitTurn,
    })) {
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") order.push(stage);
      }
    }

    expect(order).toEqual(["scene-frame", "gm-read", "settled-turn-packet"]);
    expect(order).not.toContain("judge-called");
  });
});

describe("gameplay-cycle-runtime primitive 6 GM Action Checklist contracts", () => {
  it("accepts a strict planning-only checklist for an accepted action-plan Judge branch", () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const checklist = validActionChecklist(frame, gmRead, judgment);

    const parsed = gmActionChecklistSchema.parse(checklist);
    const result = validateGmActionChecklistCandidate({
      frame,
      gmRead,
      judgment,
      candidate: checklist,
    });

    expect(result.status).toBe("accepted");
    expect(parsed.authority.evidenceAuthority).toBe("planning_only");
    expect(parsed.authority.mutationAuthority).toBe("none");
    expect(parsed.authority.mayGenerateExecutableRequest).toBe(false);
    expect(JSON.stringify(parsed)).not.toContain("candidateToolRequest");
    expect(JSON.stringify(parsed)).not.toContain("toolInput");
    expect(JSON.stringify(parsed)).not.toContain("receiptId");
    expect(JSON.stringify(parsed)).not.toContain("receipts");
    expect(JSON.stringify(parsed)).not.toContain("receipt_ledger");
    expect(JSON.stringify(parsed)).not.toContain("narrativeText");
    expect(JSON.stringify(parsed)).not.toContain("oracleResult");
  });

  it("keeps P60 production source free of LLM generation and repair ownership", () => {
    const source = readFileSync(join(runtimeDir, "action-checklist.ts"), "utf8");

    for (const forbidden of [
      "safeGenerateObject",
      "createModel",
      "buildGmActionChecklistSystemPrompt",
      "buildGmActionChecklistPrompt",
      "buildRepairPrompt",
      "GmActionChecklistCandidateGenerator",
      "generateCandidate",
      "repairOf",
    ]) {
      expect(source).not.toContain(forbidden);
    }
  });

  it("rejects checklist generation outside the accepted action-plan branch", () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const directJudgment = validJudgeUncertainty(frame, {
      ...gmRead,
      path: "direct",
    });

    const result = validateGmActionChecklistCandidate({
      frame,
      gmRead: { ...gmRead, path: "direct" },
      judgment: directJudgment,
      candidate: validActionChecklist(frame, gmRead, actionPlanJudge(frame, gmRead)),
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "branch_mismatch")).toBe(true);
  });

  it.each([
    "toolId",
    "toolName",
    "toolInput",
    "toolCall",
    "args",
    "input",
    "payload",
    "candidateToolRequest",
    "plannedTools",
    "stateDelta",
    "statePatch",
    "worldDelta",
    "receipt",
    "receipts",
    "narration",
    "narrativeText",
    "oracleResult",
    "chance",
    "roll",
    "selectedOutcome",
    "settledTurnPacket",
    "resultWorldVersion",
  ])("rejects recursive Stage 4 or settled-truth surface %s", (key) => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const candidate = {
      ...validActionChecklist(frame, gmRead, judgment),
      steps: [{
        ...validActionChecklist(frame, gmRead, judgment).steps[0],
        expectedVisibleEffect: {
          ...validActionChecklist(frame, gmRead, judgment).steps[0]?.expectedVisibleEffect,
          extra: { [key]: "smuggled" },
        },
      }],
    };

    const result = validateGmActionChecklistCandidate({
      frame,
      gmRead,
      judgment,
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "executable_payload")).toBe(true);
  });

  it("rejects refs outside SceneFrame and GM Read/Judge admission plus backend refs", () => {
    const frame = actionPlanFrame({
      citableRefs: ["Player", "Market", "Guide", "North Hall"],
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const candidate: GmActionChecklist = {
      ...validActionChecklist(frame, gmRead, judgment),
      steps: [{
        ...validActionChecklist(frame, gmRead, judgment).steps[0],
        actorRef: "actor:raw",
        targetRefs: ["Guide"],
        evidenceRefs: ["invented"],
      }],
    };

    const result = validateGmActionChecklistCandidate({
      frame,
      gmRead,
      judgment,
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "backend_ref")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "uncited_ref")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "unadmitted_ref")).toBe(true);
  });

  it("rejects private guard terms in checklist prose", () => {
    const frame = actionPlanFrame({
      privateGuards: {
        forbiddenActorLabels: ["Hidden Watcher"],
        forbiddenPrivateTerms: ["sealed patron"],
      },
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const candidate: GmActionChecklist = {
      ...validActionChecklist(frame, gmRead, judgment),
      steps: [{
        ...validActionChecklist(frame, gmRead, judgment).steps[0],
        purpose: "Resolve what the Hidden Watcher sees.",
      }],
    };

    const result = validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "private_term")).toBe(true);
  });

  it("rejects effect/capability mismatches and unavailable capabilities", () => {
    const frame = actionPlanFrame({
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
        { capabilityId: "route_check", evidenceAuthority: "receipt_required", allowed: true },
      ],
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const candidate: GmActionChecklist = {
      ...validActionChecklist(frame, gmRead, judgment),
      steps: [{
        ...validActionChecklist(frame, gmRead, judgment).steps[0],
        intended: {
          ...validActionChecklist(frame, gmRead, judgment).steps[0]!.intended,
          requiredCapabilityId: "route_check",
        },
      }],
    };

    const result = validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "capability_mismatch").length).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid step ids, duplicate effects, and future dependencies", () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const base = validActionChecklist(frame, gmRead, judgment);
    const candidate: GmActionChecklist = {
      ...base,
      steps: [
        {
          ...base.steps[0]!,
          stepId: "step-2",
          dependsOnStepIds: ["step-2"],
        },
        {
          ...base.steps[0]!,
          stepId: "step-2",
        },
      ],
    };

    const result = validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "step_invalid")).toBe(true);
    expect(result.issues.some((issue) => issue.code === "dependency_invalid")).toBe(true);
  });

  it("requires movement to a disconnected option to depend on a route_check for that target", () => {
    const frame = actionPlanFrame({
      movementOptions: [{
        ref: "North Hall",
        label: "North Hall",
        connected: false,
        travelCost: 1,
      }],
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const result = validateGmActionChecklistCandidate({
      frame,
      gmRead,
      judgment,
      candidate: validActionChecklist(frame, gmRead, judgment),
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "dependency_invalid")).toBe(true);
  });

  it("builds P60 deterministically without model generation or repair", async () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-generated",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.repairAttempted).toBe(false);
    expect(result.checklist.checklistId).toBe("gm-action-checklist-generated");
    expect(gmActionChecklistSchema.safeParse(result.checklist).success).toBe(true);
  });

  it("deterministically inserts route_check before disconnected movement", async () => {
    const frame = actionPlanFrame({
      movementOptions: [{
        ref: "North Hall",
        label: "North Hall",
        connected: false,
        travelCost: 1,
      }],
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-route",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual(["route_check", "movement"]);
    expect(result.checklist.steps[1]?.dependsOnStepIds).toEqual(["step-1"]);
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically produces time_advance checklist when no admitted movement target exists", async () => {
    const frame = actionPlanFrame({
      movementOptions: [],
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
        { capabilityId: "time_advance", evidenceAuthority: "receipt_required", allowed: true },
      ],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      evidenceRefs: ["Player", "Market"],
      actionInterpretation: {
        summary: "The player waits in the current scene.",
        playerIntent: "Wait in the current scene for ten minutes.",
        method: null,
        targetRefs: ["Market"],
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Advancing time needs later backend receipt authority.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-wait",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      stepId: "step-1",
      actorRef: "Player",
      targetRefs: ["Market"],
      intended: {
        kind: "time_advance",
        requiredCapabilityId: "time_advance",
        stateOrEvidence: "state",
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
    expect(result.checklist.authority).toMatchObject({
      evidenceAuthority: "planning_only",
      mutationAuthority: "none",
      mayAuthorizeMutation: false,
      mayGenerateExecutableRequest: false,
      maySupportNarrationClaim: false,
      settledTruth: false,
    });
  });

  it("deterministically produces route_options checklist from implemented clean capability only", async () => {
    const frame = actionPlanFrame({
      playerAction: "I check the available routes from here.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      liveSceneQuestion: "Which visible route options can the player inspect?",
      actionInterpretation: {
        summary: "The player asks which routes are available from the current scene.",
        playerIntent: "Check visible route options.",
        method: null,
        targetRefs: ["Market"],
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-routes",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]?.intended).toMatchObject({
      kind: "route_options",
      requiredCapabilityId: "route_options",
      stateOrEvidence: "evidence",
    });
    expect(result.checklist.steps[0]?.disposition.kind).toBe("stage4_backend_resolution_required");
  });

  it("deterministically produces observe_visible checklist without mutation authority", async () => {
    const frame = actionPlanFrame({
      playerAction: "I look around the current market.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      liveSceneQuestion: "What can the player see in the current scene?",
      actionInterpretation: {
        summary: "The player asks to observe the current visible scene.",
        playerIntent: "Look around the current scene.",
        method: null,
        targetRefs: ["Market"],
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-observe",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]?.intended).toMatchObject({
      kind: "observe_visible",
      requiredCapabilityId: "observe_visible",
      stateOrEvidence: "evidence",
    });
    expect(result.checklist.authority).toMatchObject({
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
    });
  });

  it("falls back without repair when deterministic compile lacks a backend capability", async () => {
    const frame = actionPlanFrame({
      playerAction: "I move toward North Hall.",
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
      ],
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-generated",
    });

    expect(result.status).toBe("fallback_no_mutation");
    expect(result.checklist).toBeNull();
    expect(result.repairAttempted).toBe(false);
  });

  it("is stable for identical inputs except backend-owned checklist id", async () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const first = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-a",
    });
    const second = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-b",
    });

    expect(first.status).toBe("accepted");
    expect(second.status).toBe("accepted");
    if (first.status !== "accepted" || second.status !== "accepted") throw new Error("expected accepted");
    const normalize = (checklist: GmActionChecklist) => ({ ...checklist, checklistId: "<id>" });
    expect(normalize(first.checklist)).toEqual(normalize(second.checklist));
  });

  it("composes action-plan branch through runtime with Stage 4 receipt authority", async () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    const stages: string[] = [];
    const eventTypes: string[] = [];
    const commits: Parameters<typeof fakeCommitTurn>[0][] = [];

    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => frame,
      gmReadCandidateGenerator: async () => gmRead,
      judgeUncertaintyCandidateGenerator: async () => judgment,
      oracleAdapter: async () => {
        throw new Error("Oracle must not run for action-plan branch");
      },
      runStage4Execution: async ({ checklist }) => {
        const execution = acceptedMovementExecution(frame, checklist);
        const stateUpdate: Stage4ExecutionEvent = {
          type: "state_update",
          data: {
            type: "location_change",
            locationName: "North Hall",
            travelCost: 1,
            path: ["Market", "North Hall"],
          },
        };
        return {
          status: "executed",
          execution,
          publicEvents: [stateUpdate],
        };
      },
      runNarration: fakeRunNarration,
      commitTurn: async (input) => {
        commits.push(input);
        return fakeCommitTurn(input);
      },
    })) {
      eventTypes.push(event.type);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") stages.push(stage);
      }
      if (event.type === "oracle_result") {
        throw new Error("oracle_result must not be emitted for action-plan branch");
      }
    }

    expect(stages).toEqual([
      "scene-frame",
      "gm-read",
      "judge-uncertainty",
      "gm-action-checklist",
      "stage4-execution",
      "settled-turn-packet",
    ]);
    expect(eventTypes).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "state_update",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
    expect(commits).toHaveLength(1);
    expect(commits[0]?.projection.mutationApplied).toBe(true);
    expect(commits[0]?.projection.narrativeText).toContain("North Hall");
    const checklistEvidence = commits[0]?.evidenceRefs.find((ref) => ref.kind === "gm_action_checklist");
    expect(checklistEvidence).toMatchObject({
      kind: "gm_action_checklist",
      authority: "planning_only",
    });
    expect(checklistEvidence?.ref).toMatch(/^gm-action-checklist-/u);
    expect(commits[0]?.evidenceRefs).toContainEqual({
      kind: "stage4_execution",
      ref: checklistEvidence?.ref,
      authority: "stage4_execution_result",
    });
    expect(commits[0]?.evidenceRefs).toContainEqual({
      kind: "settled_packet",
      ref: commits[0]?.settlement.settledPacket.packetId,
      authority: "settled_truth_packet",
    });
    expect(commits[0]?.settlement.settledPacket.version).toBe("gameplay-runtime.settled-turn-packet.v1");
    expect(commits[0]?.settlement.narratorView.version).toBe("gameplay-runtime.narrator-view.v1");
  });
});

describe("gameplay-cycle-runtime primitive 7 Stage 4 execution contracts", () => {
  it("accepts a terminal movement receipt that owns player location and clock mutation", () => {
    const receipt = acceptedMovementReceipt();

    expect(receipt.status).toBe("accepted");
    expect(receipt.capabilityId).toBe("movement");
    expect(receipt.result.mutationApplied).toBe(true);
    expect(receipt.result.worldVersion).toBe(receipt.base.worldVersion + 1);
    expect(receipt.authority).toMatchObject({
      evidenceAuthority: "terminal_mutation_receipt",
      mutationAuthority: "player_location_and_world_clock",
      visibleResultAuthority: "may_claim_player_location_change",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: true,
    });
    expect(receipt.publicResult.locationChange).toMatchObject({
      type: "location_change",
      locationName: "North Hall",
    });
  });

  it("rejects accepted movement receipts without mutation authority", () => {
    const candidate = {
      ...acceptedMovementReceipt(),
      result: {
        ...acceptedMovementReceipt().result,
        mutationApplied: false,
      },
      authority: {
        ...acceptedMovementReceipt().authority,
        mutationAuthority: "none",
      },
    };

    expect(cleanStage4ReceiptSchema.safeParse(candidate).success).toBe(false);
  });

  it("accepts route-check evidence only as non-mutating receipt authority", () => {
    const frame = actionPlanFrame();
    const checklist = {
      ...validActionChecklist(frame),
      steps: [{
        ...validActionChecklist(frame).steps[0],
        intended: {
          ...validActionChecklist(frame).steps[0].intended,
          kind: "route_check" as const,
          requiredCapabilityId: "route_check" as const,
        },
      }],
    };
    const routeReceipt = cleanStage4ReceiptSchema.parse({
      ...acceptedMovementReceipt(frame, checklist),
      receiptId: "stage4-receipt-route-check",
      capabilityId: "route_check",
      result: {
        tick: frame.base.tick,
        worldVersion: frame.base.worldVersion,
        worldTimeMinutes: frame.base.worldTimeMinutes,
        mutationApplied: false,
      },
      authority: {
        evidenceAuthority: "route_check_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_explain_route_status",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "North Hall is reachable from the current scene.",
        visibleRefs: ["Player", "North Hall"],
        routeStatus: "connected",
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: "loc-market",
        destinationLocationId: "loc-north-hall",
        edgeIds: ["edge-market-north-hall"],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
      failure: null,
    });

    expect(routeReceipt.result.mutationApplied).toBe(false);
    expect(routeReceipt.authority.evidenceAuthority).toBe("route_check_receipt");
  });

  it("rejects failed receipts that advance world state", () => {
    const candidate = {
      ...acceptedMovementReceipt(),
      status: "failed",
      result: {
        ...acceptedMovementReceipt().result,
        mutationApplied: false,
      },
      authority: {
        evidenceAuthority: "failure_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "failure_only",
        maySupportNarrationClaim: false,
        mayAuthorizeMutation: false,
      },
      failure: {
        kind: "mutation_apply_failed",
        message: "Movement did not apply.",
        hiddenMutationApplied: false,
      },
    };

    expect(cleanStage4ReceiptSchema.safeParse(candidate).success).toBe(false);
  });

  it("rejects backend-looking refs in public receipt results", () => {
    const candidate = {
      ...acceptedMovementReceipt(),
      publicResult: {
        ...acceptedMovementReceipt().publicResult,
        summary: "You move to location:secret.",
      },
    };

    expect(cleanStage4ReceiptSchema.safeParse(candidate).success).toBe(false);
  });
});

describe("gameplay-cycle-runtime primitive 4 Oracle Roll/Settlement contracts", () => {
  it.each([
    ["strong_hit", "The player acts without Guide noticing."],
    ["weak_hit", "Guide notices something but does not fully understand it."],
    ["miss", "Guide notices and reacts immediately."],
  ] as const)("settles %s by selecting the predeclared admission meaning", async (outcome, expectedMeaning) => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: `oracle-${outcome}`,
      adapter: async () => ({
        chance: 65,
        roll: outcome === "strong_hit" ? 10 : outcome === "weak_hit" ? 50 : 90,
        outcome,
        reasoning: "Adapter resolved the admitted visible uncertainty.",
      }),
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") throw new Error("expected settled");
    expect(result.settlement.version).toBe("oracle-settlement.v1");
    expect(result.settlement.authority.evidenceAuthority).toBe("oracle_settlement");
    expect(result.settlement.authority.mutationAuthority).toBe("none");
    expect(result.settlement.selectedMeaning.text).toBe(expectedMeaning);
    expect(result.settlement.visibleOutcome.selectedMeaning).toBe(expectedMeaning);
    expect(result.publicEvent).toEqual({
      type: "oracle_result",
      data: { outcome },
    });
    expect(JSON.stringify(result.publicEvent)).not.toContain("chance");
    expect(JSON.stringify(result.publicEvent)).not.toContain("roll");
  });

  it("builds OraclePayload from SceneFrame, GM Read, and P57 admission without old packet coupling", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);

    const payload = buildOraclePayloadV1({ frame, gmRead, judgment });

    expect(payload.intent).toBe(judgment.oracleAdmission?.question);
    expect(payload.actorTags).toContain("Player");
    expect(payload.targetTags).toContain("Guide");
    expect(payload.environmentTags.some((tag) => tag.includes("current-scene:Market"))).toBe(true);
    expect(payload.sceneContext).toContain("Strong hit means:");
    expect(payload.sceneContext).toContain("Evidence refs:");
    expect(JSON.stringify(payload)).not.toContain("ModelFacingTurnPacketV2");
    expect(JSON.stringify(payload)).not.toContain("receipt");
    expect(JSON.stringify(payload)).not.toContain("toolId");
  });

  it("refuses to run when P57 did not admit an Oracle roll", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    let adapterCalls = 0;

    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment: validJudgeUncertainty(frame, gmRead),
      provider,
      settlementId: "oracle-not-applicable",
      adapter: async () => {
        adapterCalls += 1;
        return {
          chance: 50,
          roll: 50,
          outcome: "weak_hit",
          reasoning: "should not happen",
        };
      },
    });

    expect(result.status).toBe("not_applicable");
    expect(adapterCalls).toBe(0);
  });

  it("falls back to conservative miss after adapter generation failure without fake chance or roll", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-fallback",
      adapter: async () => {
        throw new Error("adapter offline");
      },
    });

    expect(result.status).toBe("settled_with_fallback");
    if (result.status !== "settled_with_fallback") throw new Error("expected fallback");
    expect(result.settlement.adapter.result.status).toBe("fallback");
    expect(result.settlement.visibleOutcome.outcome).toBe("miss");
    expect(result.settlement.selectedMeaning.text).toBe(judgment.oracleAdmission?.outcomeMeanings.miss);
    expect(JSON.stringify(result.settlement.adapter.result)).not.toContain("chance");
    expect(JSON.stringify(result.settlement.adapter.result)).not.toContain("roll");
    expect(result.settlement.failure?.hiddenMutationApplied).toBe(false);
  });

  it("falls back to conservative miss after invalid adapter output", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-invalid-output",
      adapter: async () => ({
        chance: 0,
        roll: 101,
        outcome: "weak_hit",
        reasoning: "invalid",
      }),
    });

    expect(result.status).toBe("settled_with_fallback");
    if (result.status !== "settled_with_fallback") throw new Error("expected fallback");
    expect(result.settlement.failure?.kind).toBe("invalid_adapter_output");
    expect(result.settlement.visibleOutcome.outcome).toBe("miss");
  });

  it("rejects settlement selected meaning mismatches and forbidden materialization claims", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = {
      ...validOracleJudgeUncertainty(frame, gmRead),
      oracleAdmission: {
        ...validOracleJudgeUncertainty(frame, gmRead).oracleAdmission!,
        outcomeMeanings: {
          strong_hit: "The player arrives at Guide's hidden room.",
          weak_hit: "Guide visibly notices something.",
          miss: "Guide visibly reacts immediately.",
        },
      },
    };
    const run = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-forbidden-claim",
      adapter: async () => ({
        chance: 50,
        roll: 10,
        outcome: "strong_hit",
        reasoning: "valid adapter result",
      }),
    });

    expect(run.status).toBe("not_applicable");
    if (run.status !== "not_applicable") throw new Error("expected rejection");
    expect(run.issues.some((issue) => issue.code === "forbidden_claim")).toBe(true);
  });

  it("validates oracle-settlement.v1 schema and selected meaning equality", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-schema",
      adapter: async () => ({
        chance: 50,
        roll: 10,
        outcome: "strong_hit",
        reasoning: "valid adapter result",
      }),
    });
    if (result.status !== "settled") throw new Error("expected settled");
    const settlement = {
      ...result.settlement,
      selectedMeaning: {
        ...result.settlement.selectedMeaning,
        text: "wrong meaning",
      },
    };

    expect(oracleSettlementSchema.safeParse(result.settlement).success).toBe(true);
    const validation = validateOracleSettlement({ frame, gmRead, judgment, settlement });
    expect(validation.status).toBe("rejected");
    expect(validation.issues.some((issue) => issue.code === "selected_meaning_mismatch")).toBe(true);
  });

  it("composes Oracle settlement after Judge admission and before frozen projection events", async () => {
    const order: string[] = [];
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const events = [];

    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => {
        order.push("frame");
        return frame;
      },
      gmReadCandidateGenerator: async () => {
        order.push("gm-read");
        return gmRead;
      },
      judgeUncertaintyCandidateGenerator: async () => {
        order.push("judge-uncertainty");
        return judgment;
      },
      oracleAdapter: async () => {
        order.push("oracle-adapter");
        return {
          chance: 65,
          roll: 10,
          outcome: "strong_hit",
          reasoning: "Adapter resolved the admitted visible uncertainty.",
        };
      },
      runNarration: fakeRunNarration,
      commitTurn: fakeCommitTurn,
    })) {
      events.push(event);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") order.push(`${stage}-progress`);
      }
      if (event.type === "oracle_result") order.push("oracle_result");
    }

    expect(order).toEqual([
      "scene-frame-progress",
      "frame",
      "gm-read-progress",
      "gm-read",
      "judge-uncertainty-progress",
      "judge-uncertainty",
      "oracle-roll-progress",
      "oracle-adapter",
      "oracle_result",
      "oracle-settlement-progress",
      "settled-turn-packet-progress",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "oracle_result",
      "scene-settling",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
    const oracleEvent = events.find((event) => event.type === "oracle_result");
    expect(oracleEvent?.data).toEqual({ outcome: "strong_hit" });
  });
});
