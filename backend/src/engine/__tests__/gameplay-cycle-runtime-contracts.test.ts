import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
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
  cleanNarrationCandidateSchema,
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
  cleanStage4DialogueRequestEffectSchema,
  cleanStage4SupportActorCreateEffectSchema,
  cleanStage4LocalConditionSetEffectSchema,
  cleanStage4ItemTransferEffectSchema,
  cleanStage4LocalObservationEffectSchema,
  cleanStage4DeviceSurfaceObservationEffectSchema,
  cleanStage4MinorPoiCreateEffectSchema,
} from "../gameplay-cycle-runtime/contracts.js";
import {
  buildGameplayRuntimeTurnInput,
  CleanGameplayRuntimeInvariantError,
  type CleanGameplayRuntimeEvent,
  isCleanGameplayRuntimeEnabled,
  processCleanGameplayTurnFromInput,
} from "../gameplay-cycle-runtime/runtime.js";
import {
  buildGmReadPrompt,
  buildGmReadSystemPrompt,
  CleanGmReadGenerationError,
  CleanGmReadValidationError,
  gmReadModelGenerationSchema,
  runCleanGmRead,
  validateGmReadCandidate,
} from "../gameplay-cycle-runtime/gm-read.js";
import {
  buildJudgeUncertaintyPrompt,
  buildJudgeUncertaintySystemPrompt,
  CleanJudgeUncertaintyValidationError,
  judgeUncertaintyGenerationSchema,
  runCleanJudgeUncertainty,
  validateJudgeUncertaintyCandidate,
} from "../gameplay-cycle-runtime/judge-uncertainty.js";
import {
  buildOraclePayloadV1,
  CleanOracleSettlementAdapterError,
  runCleanOracleSettlement,
  validateOracleSettlement,
} from "../gameplay-cycle-runtime/oracle-settlement.js";
import {
  CleanGmActionChecklistValidationError,
  runCleanGmActionChecklist,
  validateGmActionChecklistCandidate,
} from "../gameplay-cycle-runtime/action-checklist.js";
import {
  buildStage4DialogueRequestPrompt,
  buildStage4DialogueRequestSystemPrompt,
  validateSupportActorRequestEffectCandidate,
  type Stage4ExecutionEvent,
} from "../gameplay-cycle-runtime/stage4-execution.js";
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
      "support_actor.create.v2",
      "actor.condition_set.v2",
      "condition_set.v2",
      "create_scene_extra",
      "spawn_npc",
      "runtime-executor",
      "db-handlers",
      "receipt-ledger",
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

  it("allows Stage 6 direct-scene sentences to cite a dense scene-frame evidence set", () => {
    const evidenceRefs = Array.from({ length: 12 }, (_, index) => `e${index + 1}`);
    const parsed = cleanNarrationCandidateSchema.parse({
      version: "gameplay-runtime.clean-narration-candidate.v1",
      packetId: "cgpacket_test",
      turnId: "clean-turn-1",
      language: "en",
      sentences: [{
        kind: "accepted_evidence",
        text: "At Lowwater Bazaar, Guide is here, Courier satchel is with you, and Brass Tube is visible.",
        evidenceRefs,
        backendFactRefs: evidenceRefs.map((ref) => `${ref}.f1`),
        claimKinds: ["current_scene", "visible_actor", "inventory_status", "visible_target", "movement_option"],
        auditStepIds: [],
      }],
      finalText: "At Lowwater Bazaar, Guide is here, Courier satchel is with you, and Brass Tube is visible.",
    });

    expect(parsed.sentences[0]?.evidenceRefs).toHaveLength(12);
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
    const inputFrame = {
      ...frame,
      campaignId: turn.campaignId,
      turnId: turn.turnId,
    };
    const ids = buildCleanPublicTurnIds(turn);
    const settledPacket = buildCleanSettledTurnPacket({
      turn,
      publicPacketId: ids.publicPacketId,
      frame: inputFrame,
      gmRead: validGmRead(inputFrame),
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
      interactionKind: "current_scene_observation",
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
      { capabilityId: "local_observation", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "route_options", evidenceAuthority: "observation_only", allowed: true },
      { capabilityId: "route_check", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "movement", evidenceAuthority: "terminal_receipt_required", allowed: true },
      { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      { capabilityId: "support_actor_create", evidenceAuthority: "terminal_receipt_required", allowed: true },
      { capabilityId: "time_advance", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "scene_beat_record", evidenceAuthority: "observation_only", allowed: true },
    ],
    ...overrides,
  });
}

function itemTransferActionPlanFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  const base = actionPlanFrame();
  return actionPlanFrame({
    playerAction: "I hand the Brass Tube to Guide.",
    actors: [{
      ref: "Guide",
      label: "Guide",
      role: "support",
      visibleStatus: { hp: null, conditions: [] },
    }],
    targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
    inventory: [{
      ref: "Brass Tube",
      label: "Brass Tube",
      equipState: "carried",
      tags: [],
    }],
    capabilities: [
      ...base.capabilities,
      { capabilityId: "item_transfer", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "condition_set", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "Guide", "North Hall", "Brass Tube"],
    ...overrides,
  });
}

function minorPoiActionPlanFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  const base = actionPlanFrame();
  return actionPlanFrame({
    playerAction: "I mark the tea stall as a place to meet.",
    currentScenePlaceHandleSurface: {
      surfaceVersion: "scene_frame_current_place_handle_surface.v1",
      anchorRef: "Market",
      anchorLabel: "Market",
      allowedPlaceKinds: ["stall", "counter", "bench", "landmark", "signage", "cover", "doorway", "alcove", "workstation", "notice_board", "other_place"],
      existingPlaceHandleRefs: [],
      maxCreatesPerTurn: 1,
      creationAuthority: "ordinary_public_visible_current_scene_handle_only",
    },
    capabilities: [
      ...base.capabilities,
      { capabilityId: "minor_poi_create", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "Guide", "North Hall"],
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
      interactionKind: "movement_intent",
    },
    interpretationRationale: "The action requests a world-state consequence.",
  };
}

function itemTransferGmRead(frame = itemTransferActionPlanFrame()): GmRead {
  return {
    ...actionPlanGmRead(frame),
    focalRefs: ["Player", "Guide", "Brass Tube"],
    evidenceRefs: ["Player", "Market", "Guide", "Brass Tube"],
    liveSceneQuestion: "Which bounded item custody transition must Stage 4 settle?",
    actionInterpretation: {
      summary: "The player hands Brass Tube to visible Guide.",
      playerIntent: "Hand Brass Tube to Guide.",
      method: "hand",
      targetRefs: ["Brass Tube", "Guide"],
      interactionKind: "item_transfer",
      itemTransferNeed: {
        actorRef: "Player",
        operation: "give_to_visible_actor",
        itemRef: "Brass Tube",
        sourceKind: "player_inventory",
        targetKind: "visible_actor",
        targetRef: "Guide",
        equipSlot: null,
        requestedItemText: "Brass Tube",
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    },
    interpretationRationale: "Giving a carried item to a visible actor needs item-state receipt authority.",
  };
}

function minorPoiGmRead(frame = minorPoiActionPlanFrame()): GmRead {
  return {
    ...actionPlanGmRead(frame),
    focalRefs: ["Player", "Market"],
    evidenceRefs: ["Player", "Market"],
    liveSceneQuestion: "Which visible current-scene place handle must Stage 4 settle?",
    actionInterpretation: {
      summary: "The player establishes Tea Stall as a visible current-scene place handle.",
      playerIntent: "Mark Tea Stall as a current-scene place handle.",
      method: "point out",
      targetRefs: ["Market"],
      interactionKind: "minor_poi_create",
      minorPoiNeed: {
        actorRef: "Player",
        placeLabel: "Tea Stall",
        placeKind: "stall",
        anchorRef: "Market",
        evidenceRefs: ["Player", "Market"],
      },
    },
    interpretationRationale: "The action creates a visible current-scene target handle, not a route or location.",
  };
}

function localObservationFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  return actionPlanFrame({
    playerAction: "Do I see Guide here?",
    actors: [{
      ref: "Guide",
      label: "Guide",
      role: "support",
      visibleStatus: { hp: null, conditions: [] },
    }],
    targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
    citableRefs: ["Player", "Market", "Guide", "North Hall"],
    ...overrides,
  });
}

function localObservationGmRead(frame = localObservationFrame()): GmRead {
  return {
    ...actionPlanGmRead(frame),
    focalRefs: ["Player", "Guide"],
    evidenceRefs: ["Player", "Market", "Guide"],
    liveSceneQuestion: "Which exposed current-scene observation surface should Stage 4 query?",
    actionInterpretation: {
      summary: "The player asks whether Guide is visible here.",
      playerIntent: "Check whether Guide is visible here.",
      method: "look",
      targetRefs: ["Guide"],
      interactionKind: "current_scene_observation",
      localObservationNeed: {
        actorRef: "Player",
        mode: "target_match",
        queryText: "Guide",
        targetRef: "Guide",
        surfaceKinds: ["visible_actor", "visible_target"],
        allowBoundedNegative: true,
        evidenceRefs: ["Player", "Market", "Guide"],
      },
    },
    interpretationRationale: "Targeted visible observation needs a bounded local observation receipt.",
  };
}

function deviceSurfaceFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  const base = actionPlanFrame();
  return actionPlanFrame({
    playerAction: "I check the Burner phone screen and signal indicator.",
    inventory: [{
      ref: "Burner phone",
      label: "Burner phone",
      equipState: "equipped",
      tags: ["phone"],
    }],
    deviceStatusSurfaces: [{
      surfaceVersion: "scene_frame_device_status_surface.v1",
      deviceRef: "Burner phone",
      deviceLabel: "Burner phone",
      deviceKind: "phone",
      holderScope: "player_equipped",
      anchorRef: "Market",
      availableFacetKinds: ["screen_state", "signal_indicator"],
      facets: [
        {
          facetKind: "screen_state",
          displayLabel: "Screen",
          valueText: "lit",
          valueClass: "indicator_state",
          publicSafe: true,
        },
        {
          facetKind: "signal_indicator",
          displayLabel: "Signal indicator",
          valueText: "two visible bars",
          valueClass: "meter_value",
          publicSafe: true,
        },
      ],
    }],
    capabilities: [
      ...base.capabilities,
      { capabilityId: "device_surface_observation", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "North Hall", "Burner phone"],
    ...overrides,
  });
}

function deviceSurfaceGmRead(frame = deviceSurfaceFrame()): GmRead {
  return {
    ...actionPlanGmRead(frame),
    focalRefs: ["Player", "Burner phone"],
    evidenceRefs: ["Player", "Market", "Burner phone"],
    liveSceneQuestion: "Which modeled public device surface facet should Stage 4 read?",
    actionInterpretation: {
      summary: "The player checks the modeled public Burner phone surface indicators.",
      playerIntent: "Check Burner phone screen and signal indicator.",
      method: "look",
      targetRefs: ["Burner phone"],
      interactionKind: "device_status_observation",
      deviceObservationNeed: {
        actorRef: "Player",
        deviceRef: "Burner phone",
        requestedDeviceText: "Burner phone",
        requestedFacetText: "screen and signal indicator",
        facetKinds: ["screen_state", "signal_indicator"],
        allowNoSurface: true,
        evidenceRefs: ["Player", "Market", "Burner phone"],
      },
    },
    interpretationRationale: "Modeled device surfaces need a dedicated device_surface_observation receipt.",
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

const runtimeClockCampaignId = "runtime-clock-campaign";

function withRuntimeClockFixture(input: {
  clock?: { tick: number; worldVersion: number; worldTimeMinutes: number };
}, run: () => void): void {
  const tempRoot = mkdtempSync(join(tmpdir(), "worldforge-clean-runtime-clock-"));
  const previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
  process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
  connectDb(join(tempRoot, "state.db"));
  try {
    runMigrations();
    const campaignDir = join(tempRoot, runtimeClockCampaignId);
    mkdirSync(campaignDir, { recursive: true });
    writeFileSync(join(campaignDir, "chat_history.json"), "[]", "utf-8");
    const now = Date.now();
    getSqliteConnection()
      .prepare("INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(runtimeClockCampaignId, "Runtime clock campaign", "Clock authority fixture.", now, now);
    if (input.clock) {
      getSqliteConnection()
        .prepare("INSERT INTO world_clocks (campaign_id, world_version, world_time_minutes, current_tick, updated_at) VALUES (?, ?, ?, ?, ?)")
        .run(runtimeClockCampaignId, input.clock.worldVersion, input.clock.worldTimeMinutes, input.clock.tick, now);
    }
    run();
  } finally {
    closeDb();
    if (previousCampaignRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
    else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

describe("gameplay-cycle-runtime authoritative clock boundary", () => {
  it("builds turn input base from the required world_clocks row", () => {
    withRuntimeClockFixture({
      clock: { tick: 9, worldVersion: 7, worldTimeMinutes: 42 },
    }, () => {
      const turn = buildGameplayRuntimeTurnInput({
        campaignId: runtimeClockCampaignId,
        submittedPlayerAction: "I look around.",
        normalizedPlayerAction: "I look around.",
        judgeProvider: provider,
        storytellerProvider: provider,
        preTurnSnapshot: { bundleDir: "snapshot-dir", capturedAt: 1 },
      });

      expect(turn.base).toMatchObject({
        tick: 9,
        worldVersion: 7,
        worldTimeMinutes: 42,
        chatHistoryLengthBeforeTurn: 0,
      });
      expect(turn.idempotencyKey).toContain(`${runtimeClockCampaignId}:9:7:`);
    });
  });

  it("requires a world_clocks row before building player-facing turn input", () => {
    withRuntimeClockFixture({}, () => {
      expect(() => buildGameplayRuntimeTurnInput({
        campaignId: runtimeClockCampaignId,
        submittedPlayerAction: "I look around.",
        normalizedPlayerAction: "I look around.",
        judgeProvider: provider,
        storytellerProvider: provider,
        preTurnSnapshot: { bundleDir: "snapshot-dir", capturedAt: 1 },
      })).toThrow(CleanGameplayRuntimeInvariantError);
    });
  });
});

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
      dialogue: null,
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
      dialogue: receipt.publicResult.dialogue,
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

  it("canonicalizes terse model uncertainty absence before strict GM Read validation", () => {
    const frame = minimalFrame();
    const candidate = {
      ...validGmRead(frame),
      uncertainty: { present: false },
    };

    expect(gmReadSchema.safeParse(candidate).success).toBe(false);
    expect(gmReadModelGenerationSchema.safeParse(candidate).success).toBe(true);

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status === "accepted") {
      expect(result.read.uncertainty).toEqual({
        present: false,
        question: null,
        basis: null,
      });
    }
  });

  it("canonicalizes omitted model uncertainty to explicit absence before strict GM Read validation", () => {
    const frame = minimalFrame();
    const candidate = {
      ...validGmRead(frame),
      uncertainty: undefined,
    };

    expect(gmReadSchema.safeParse(candidate).success).toBe(false);
    expect(gmReadModelGenerationSchema.safeParse(candidate).success).toBe(true);
    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.uncertainty).toEqual({
      present: false,
      question: null,
      basis: null,
    });
  });

  it("requires GM Read candidates to choose an explicit primitive interaction kind", () => {
    const candidate = {
      ...validGmRead(),
      actionInterpretation: {
        ...validGmRead().actionInterpretation,
      },
    };
    delete (candidate.actionInterpretation as Partial<typeof candidate.actionInterpretation>).interactionKind;

    const parsed = gmReadSchema.safeParse(candidate);

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues.some((issue) =>
        issue.path.join(".") === "actionInterpretation.interactionKind"
      )).toBe(true);
    }
  });

  it("requires visible_actor_dialogue to target exactly one visible non-player actor", () => {
    const frame = minimalFrame({
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      citableRefs: ["Player", "Market", "Guide"],
    });
    const accepted = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player asks Guide a question.",
          playerIntent: "Ask Guide what happened.",
          method: "ask",
          targetRefs: ["Guide"],
          interactionKind: "visible_actor_dialogue",
        },
      },
    });
    expect(accepted.status).toBe("accepted");

    const rejected = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player asks an unseen guard a question.",
          playerIntent: "Ask a guard what happened.",
          method: "ask",
          targetRefs: ["Market"],
          interactionKind: "visible_actor_dialogue",
        },
      },
    });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) => issue.code === "interaction_invalid")).toBe(true);
  });

  it("binds explicit walk-back travel to one exposed movement option before Judge or Checklist", () => {
    const frame = actionPlanFrame({
      playerAction: "I walk back to Jujutsu Headquarters.",
      scene: {
        currentLocation: { ref: "Mission Assignment Office", label: "Mission Assignment Office", description: null },
        currentScene: { ref: "Mission Assignment Office", label: "Mission Assignment Office", description: null },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      actors: [{
        ref: "Shimura Rei",
        label: "Shimura Rei",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      movementOptions: [{
        ref: "Jujutsu Headquarters",
        label: "Jujutsu Headquarters",
        connected: true,
        travelCost: 1,
      }],
      targets: [
        { ref: "Shimura Rei", label: "Shimura Rei", kind: "actor" },
        { ref: "Jujutsu Headquarters", label: "Jujutsu Headquarters", kind: "location" },
      ],
      citableRefs: ["Player", "Mission Assignment Office", "Shimura Rei", "Jujutsu Headquarters"],
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "uncertain",
      situationSummary: "The player is in Mission Assignment Office with a visible route to Jujutsu Headquarters.",
      liveSceneQuestion: "Which movement destination must be resolved?",
      focalRefs: ["Player", "Jujutsu Headquarters"],
      evidenceRefs: ["Player", "Mission Assignment Office", "Jujutsu Headquarters"],
      actionInterpretation: {
        summary: "The player intends to walk back to Jujutsu Headquarters.",
        playerIntent: "Travel to Jujutsu Headquarters.",
        method: "walk back",
        targetRefs: ["Jujutsu Headquarters"],
        interactionKind: "movement_intent",
      },
      interpretationRationale: "The action names one exposed movement option as a destination.",
    };

    const accepted = validateGmReadCandidate({ frame, candidate });

    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") throw new Error("expected accepted");
    expect(accepted.read.actionInterpretation).toMatchObject({
      interactionKind: "movement_intent",
      targetRefs: ["Jujutsu Headquarters"],
    });

    const noMovementOption = validateGmReadCandidate({
      frame: { ...frame, movementOptions: [] },
      candidate,
    });
    expect(noMovementOption.status).toBe("rejected");
    if (noMovementOption.status !== "rejected") throw new Error("expected rejected");
    expect(noMovementOption.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
      }),
    ]));
  });

  it("accepts route_inquiry for a visible route while preserving the no-movement distinction", () => {
    const frame = actionPlanFrame({
      playerAction: "I check whether the route to Jujutsu Headquarters is open, without moving.",
      movementOptions: [{
        ref: "Jujutsu Headquarters",
        label: "Jujutsu Headquarters",
        connected: true,
        travelCost: 1,
      }],
      citableRefs: ["Player", "Market", "Guide", "Jujutsu Headquarters"],
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      liveSceneQuestion: "Which visible route status must be checked?",
      focalRefs: ["Player", "Jujutsu Headquarters"],
      evidenceRefs: ["Player", "Market", "Jujutsu Headquarters"],
      actionInterpretation: {
        summary: "The player asks whether the visible route is open without moving.",
        playerIntent: "Check route status without moving.",
        method: "check route",
        targetRefs: ["Jujutsu Headquarters"],
        interactionKind: "route_inquiry",
      },
      interpretationRationale: "The wording asks for route status and explicitly excludes movement.",
    };

    expect(validateGmReadCandidate({ frame, candidate }).status).toBe("accepted");
    expect(validateGmReadCandidate({
      frame,
      candidate: {
        ...candidate,
        actionInterpretation: {
          ...candidate.actionInterpretation,
          targetRefs: ["Guide"],
        },
      },
    }).status).toBe("rejected");
  });

  it("accepts broad route_inquiry anchored on the current scene ref", () => {
    const frame = actionPlanFrame({
      playerAction: "I list the routes I can take from Market now.",
      citableRefs: ["Player", "Market", "Guide", "North Hall"],
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      liveSceneQuestion: "Which current-scene routes can be listed?",
      focalRefs: ["Player", "Market"],
      evidenceRefs: ["Player", "Market"],
      actionInterpretation: {
        summary: "The player asks for the current route options from the scene.",
        playerIntent: "List available routes from Market.",
        method: "list routes",
        targetRefs: ["Market"],
        interactionKind: "route_inquiry",
      },
      interpretationRationale: "The current scene ref anchors a broad route-options list.",
    };

    const accepted = validateGmReadCandidate({ frame, candidate });

    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") throw new Error("expected accepted");
    expect(accepted.read.actionInterpretation).toMatchObject({
      interactionKind: "route_inquiry",
      targetRefs: ["Market"],
    });
  });

  it("canonicalizes broad movement-option surface lists to route_inquiry before Judge or Checklist", () => {
    const frame = actionPlanFrame({
      playerAction: "I list the routes I can take from Slip Twelve Berth.",
      scene: {
        currentLocation: { ref: "Slip Twelve Berth", label: "Slip Twelve Berth", description: null },
        currentScene: { ref: "Slip Twelve Berth", label: "Slip Twelve Berth", description: null },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      movementOptions: [
        { ref: "Lowwater Bazaar", label: "Lowwater Bazaar", connected: true, travelCost: 1 },
        { ref: "Silt Warrens", label: "Silt Warrens", connected: true, travelCost: 1 },
        { ref: "The Copper Tap", label: "The Copper Tap", connected: true, travelCost: 1 },
      ],
      citableRefs: ["Player", "Slip Twelve Berth", "Lowwater Bazaar", "Silt Warrens", "The Copper Tap"],
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      liveSceneQuestion: "Which route surface should be listed?",
      focalRefs: ["Player", "Slip Twelve Berth"],
      evidenceRefs: ["Player", "Slip Twelve Berth"],
      actionInterpretation: {
        summary: "The player asks for the available routes from the current scene.",
        playerIntent: "List available routes.",
        method: "list",
        targetRefs: ["Slip Twelve Berth"],
        interactionKind: "current_scene_observation",
        localObservationNeed: {
          actorRef: "Player",
          mode: "list_surface",
          queryText: "routes I can take",
          targetRef: null,
          surfaceKinds: ["movement_option", "current_scene"],
          allowBoundedNegative: false,
          evidenceRefs: ["Player", "Slip Twelve Berth"],
        },
      },
      interpretationRationale: "The model used the exposed movement-option surface for a broad route list.",
    };

    const accepted = validateGmReadCandidate({ frame, candidate });

    expect(accepted.status).toBe("accepted");
    if (accepted.status !== "accepted") throw new Error("expected accepted");
    expect(accepted.read.path).toBe("procedural");
    expect(accepted.read.actionInterpretation).toMatchObject({
      interactionKind: "route_inquiry",
      targetRefs: [],
      localObservationNeed: null,
    });
  });

  it("requires time_passage to carry a typed elapsed-minute need before checklist planning", () => {
    const frame = minimalFrame({
      playerAction: "I wait here for 3 minutes.",
      citableRefs: ["Player", "Market"],
    });
    const missingNeed = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player waits in place.",
          playerIntent: "Wait here for 3 minutes.",
          method: "wait",
          targetRefs: ["Market"],
          interactionKind: "time_passage",
        },
      },
    });
    expect(missingNeed.status).toBe("rejected");
    if (missingNeed.status !== "rejected") throw new Error("expected rejected");
    expect(missingNeed.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "interaction_invalid",
        path: "actionInterpretation.timePassageNeed",
      }),
    ]));

    const accepted = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player waits in place.",
          playerIntent: "Wait here for 3 minutes.",
          method: "wait",
          targetRefs: ["Market"],
          interactionKind: "time_passage",
          timePassageNeed: {
            actorRef: "Player",
            elapsedMinutes: 3,
            reasonKind: "wait",
            requestedDurationText: "3 minutes",
            evidenceRefs: ["Player", "Market"],
          },
        },
      },
    });
    expect(accepted.status).toBe("accepted");
  });

  it.each([
    ["hand", "I hand the Brass Tube to Guide."],
    ["give", "I give the Brass Tube to Guide."],
  ])("accepts %s as bounded item_transfer from Player inventory to a visible actor", (_verb, playerAction) => {
    const frame = itemTransferActionPlanFrame({ playerAction });
    const candidate = itemTransferGmRead(frame);

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation).toMatchObject({
      interactionKind: "item_transfer",
      targetRefs: ["Brass Tube", "Guide"],
      itemTransferNeed: {
        actorRef: "Player",
        operation: "give_to_visible_actor",
        itemRef: "Brass Tube",
        sourceKind: "player_inventory",
        targetKind: "visible_actor",
        targetRef: "Guide",
        equipSlot: null,
      },
    });
  });

  it("rejects a supported inventory-to-visible-actor target pair when GM Read labels it unsupported", () => {
    const frame = itemTransferActionPlanFrame();
    const base = itemTransferGmRead(frame);
    const wrongKind: GmRead = {
      ...base,
      actionInterpretation: {
        ...base.actionInterpretation,
        interactionKind: "unsupported_or_unclear",
        itemTransferNeed: undefined,
      },
    };

    const result = validateGmReadCandidate({ frame, candidate: wrongKind });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "interaction_invalid",
        path: "actionInterpretation.interactionKind",
      }),
    ]));
  });

  it("requires typed itemTransferNeed for an exact current-frame handoff even when targetRefs omit the item", () => {
    const frame = itemTransferActionPlanFrame();
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      focalRefs: ["Player", "Guide"],
      evidenceRefs: ["Player", "Guide", "Market"],
      liveSceneQuestion: "Which current-scene consequence should be resolved?",
      actionInterpretation: {
        summary: "The player gives a carried item to Guide.",
        playerIntent: "Give the Brass Tube to Guide.",
        method: "give",
        targetRefs: ["Guide"],
        interactionKind: "unsupported_or_unclear",
      },
      interpretationRationale: "The action names a current visible actor but omits the item-state contract.",
    };

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "interaction_invalid",
        path: "actionInterpretation.interactionKind",
      }),
      expect.objectContaining({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
      }),
    ]));
  });

  it("keeps carried equipSlot as a model-generation near-miss, not an accepted item_transfer contract", () => {
    const frame = itemTransferActionPlanFrame();
    const nearMiss = {
      ...itemTransferGmRead(frame),
      actionInterpretation: {
        ...itemTransferGmRead(frame).actionInterpretation,
        itemTransferNeed: {
          ...itemTransferGmRead(frame).actionInterpretation.itemTransferNeed!,
          equipSlot: "carried",
        },
      },
    };

    expect(gmReadModelGenerationSchema.safeParse(nearMiss).success).toBe(true);
    expect(gmReadSchema.safeParse(nearMiss).success).toBe(false);
    const result = validateGmReadCandidate({ frame, candidate: nearMiss });
    expect(result.status).toBe("rejected");
  });

  it("classifies slinging a carried item onto the shoulder as equip item_transfer", () => {
    const frame = itemTransferActionPlanFrame({
      playerAction: "I sling the Brass Tube back onto my shoulder.",
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "carried",
        tags: [],
      }],
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      situationSummary: "The player is changing a carried inventory item's equip state.",
      liveSceneQuestion: "Which bounded item equip-state transition must Stage 4 settle?",
      focalRefs: ["Player", "Brass Tube"],
      evidenceRefs: ["Player", "Brass Tube", "Market"],
      actionInterpretation: {
        summary: "The player equips Brass Tube onto their shoulder.",
        playerIntent: "Equip Brass Tube.",
        method: "sling onto shoulder",
        targetRefs: ["Brass Tube", "Player"],
        interactionKind: "item_transfer",
        itemTransferNeed: {
          actorRef: "Player",
          operation: "equip_inventory_item",
          itemRef: "Brass Tube",
          sourceKind: "player_inventory",
          targetKind: "player_equipment",
          targetRef: "Player",
          equipSlot: "equipped",
          requestedItemText: "Brass Tube",
          evidenceRefs: ["Player", "Brass Tube", "Market"],
        },
      },
      interpretationRationale: "Moving a carried item onto the body changes equip state; this belongs to item_transfer authority.",
    };

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation).toMatchObject({
      interactionKind: "item_transfer",
      itemTransferNeed: {
        operation: "equip_inventory_item",
        itemRef: "Brass Tube",
        targetRef: "Player",
        equipSlot: "equipped",
      },
    });
    expect(result.read.actionInterpretation.localConditionNeed).toBeUndefined();
  });

  it("classifies removing an equipped item from its worn slot as unequip item_transfer even when the player will carry it", () => {
    const frame = itemTransferActionPlanFrame({
      playerAction: "I unfasten the Brass Tube from my shoulder and carry it in one hand.",
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "equipped",
        tags: [],
      }],
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      situationSummary: "The player is changing an equipped inventory item's equip state.",
      liveSceneQuestion: "Which bounded item equip-state transition must Stage 4 settle?",
      focalRefs: ["Player", "Brass Tube"],
      evidenceRefs: ["Player", "Brass Tube", "Market"],
      actionInterpretation: {
        summary: "The player removes Brass Tube from an equipped shoulder position and carries it.",
        playerIntent: "Unequip Brass Tube and carry it.",
        method: "unfasten and carry",
        targetRefs: ["Brass Tube", "Player"],
        interactionKind: "item_transfer",
        itemTransferNeed: {
          actorRef: "Player",
          operation: "unequip_inventory_item",
          itemRef: "Brass Tube",
          sourceKind: "player_inventory",
          targetKind: "player_inventory",
          targetRef: "Player",
          equipSlot: null,
          requestedItemText: "Brass Tube",
          evidenceRefs: ["Player", "Brass Tube", "Market"],
        },
      },
      interpretationRationale: "Removing an equipped item from its worn slot changes item equip state; the later hand-carry wording is the target item state, not a grip-only condition.",
    };

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation).toMatchObject({
      interactionKind: "item_transfer",
      itemTransferNeed: {
        operation: "unequip_inventory_item",
        itemRef: "Brass Tube",
        targetRef: "Player",
        equipSlot: null,
      },
    });
    expect(result.read.actionInterpretation.localConditionNeed).toBeUndefined();
  });

  it("normalizes operation-owned item_transfer source and target kind drift before validation", () => {
    const unequipFrame = itemTransferActionPlanFrame({
      playerAction: "I unfasten the Brass Tube from my shoulder and carry it in one hand.",
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "equipped",
        tags: [],
      }],
    });
    const unequipCandidate: GmRead = {
      ...validGmRead(unequipFrame),
      path: "procedural",
      situationSummary: "The player is changing an equipped inventory item's equip state.",
      liveSceneQuestion: "Which bounded item equip-state transition must Stage 4 settle?",
      focalRefs: ["Player", "Brass Tube"],
      evidenceRefs: ["Player", "Brass Tube", "Market"],
      actionInterpretation: {
        summary: "The player removes Brass Tube from an equipped shoulder position and carries it.",
        playerIntent: "Unequip Brass Tube and carry it.",
        method: "unfasten and carry",
        targetRefs: ["Brass Tube", "Player"],
        interactionKind: "item_transfer",
        itemTransferNeed: {
          actorRef: "Player",
          operation: "unequip_inventory_item",
          itemRef: "Brass Tube",
          sourceKind: "player_inventory",
          targetKind: "player_inventory",
          targetRef: "Player",
          equipSlot: null,
          requestedItemText: "Brass Tube",
          evidenceRefs: ["Player", "Brass Tube", "Market"],
        },
      },
      interpretationRationale: "Removing an equipped item from its worn slot changes item equip state.",
    };
    const unequipNearMiss = {
      ...unequipCandidate,
      actionInterpretation: {
        ...unequipCandidate.actionInterpretation,
        itemTransferNeed: {
          ...unequipCandidate.actionInterpretation.itemTransferNeed!,
          sourceKind: "player_equipment",
          targetKind: "Player",
        },
      },
    };

    expect(gmReadModelGenerationSchema.safeParse(unequipNearMiss).success).toBe(true);
    expect(gmReadSchema.safeParse(unequipNearMiss).success).toBe(false);
    const result = validateGmReadCandidate({ frame: unequipFrame, candidate: unequipNearMiss });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation.itemTransferNeed).toMatchObject({
      operation: "unequip_inventory_item",
      sourceKind: "player_inventory",
      targetKind: "player_inventory",
      equipSlot: null,
    });

    const equipFrame = itemTransferActionPlanFrame({
      playerAction: "I sling the Brass Tube back onto my shoulder.",
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "carried",
        tags: [],
      }],
    });
    const equipCandidate: GmRead = {
      ...validGmRead(equipFrame),
      path: "procedural",
      situationSummary: "The player is changing a carried inventory item's equip state.",
      liveSceneQuestion: "Which bounded item equip-state transition must Stage 4 settle?",
      focalRefs: ["Player", "Brass Tube"],
      evidenceRefs: ["Player", "Brass Tube", "Market"],
      actionInterpretation: {
        summary: "The player equips Brass Tube onto their shoulder.",
        playerIntent: "Equip Brass Tube.",
        method: "sling onto shoulder",
        targetRefs: ["Brass Tube", "Player"],
        interactionKind: "item_transfer",
        itemTransferNeed: {
          actorRef: "Player",
          operation: "equip_inventory_item",
          itemRef: "Brass Tube",
          sourceKind: "player_inventory",
          targetKind: "player_equipment",
          targetRef: "Player",
          equipSlot: "equipped",
          requestedItemText: "Brass Tube",
          evidenceRefs: ["Player", "Brass Tube", "Market"],
        },
      },
      interpretationRationale: "Moving a carried item onto the body changes equip state.",
    };
    const equipNearMiss = {
      ...equipCandidate,
      actionInterpretation: {
        ...equipCandidate.actionInterpretation,
        itemTransferNeed: {
          ...equipCandidate.actionInterpretation.itemTransferNeed!,
          targetKind: "Player",
        },
      },
    };

    expect(gmReadModelGenerationSchema.safeParse(equipNearMiss).success).toBe(true);
    expect(gmReadSchema.safeParse(equipNearMiss).success).toBe(false);
    const equipResult = validateGmReadCandidate({ frame: equipFrame, candidate: equipNearMiss });

    expect(equipResult.status).toBe("accepted");
    if (equipResult.status !== "accepted") throw new Error("expected accepted");
    expect(equipResult.read.actionInterpretation.itemTransferNeed).toMatchObject({
      operation: "equip_inventory_item",
      sourceKind: "player_inventory",
      targetKind: "player_equipment",
      equipSlot: "equipped",
    });
  });

  it("keeps overlong GM Read rationale as a model-generation near-miss for repair only", () => {
    const frame = deviceSurfaceFrame();
    const nearMiss = {
      ...deviceSurfaceGmRead(frame),
      interpretationRationale: "Device surface observation requires backend receipt authority. ".repeat(20),
    };

    expect(gmReadModelGenerationSchema.safeParse(nearMiss).success).toBe(true);
    expect(gmReadSchema.safeParse(nearMiss).success).toBe(false);
    const result = validateGmReadCandidate({ frame, candidate: nearMiss });
    expect(result.status).toBe("rejected");
  });

  it("canonicalizes omitted GM Read targetRefs to an empty broad-observation list", () => {
    const frame = minimalFrame();
    const candidate = {
      ...validGmRead(frame),
      actionInterpretation: {
        ...validGmRead(frame).actionInterpretation,
        targetRefs: undefined,
      },
    };

    expect(gmReadModelGenerationSchema.safeParse(candidate).success).toBe(true);
    expect(gmReadSchema.safeParse(candidate).success).toBe(false);
    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation.targetRefs).toEqual([]);
  });

  it("keeps gripping an already-held item in player_local_condition instead of item_transfer", () => {
    const frame = itemTransferActionPlanFrame({
      playerAction: "I grip the Brass Tube.",
    });
    const candidate: GmRead = {
      ...validGmRead(frame),
      path: "procedural",
      situationSummary: "The player is holding an inventory item in the current scene.",
      liveSceneQuestion: "Which local Player readiness condition should Stage 4 settle?",
      focalRefs: ["Player", "Brass Tube"],
      evidenceRefs: ["Player", "Brass Tube", "Market"],
      actionInterpretation: {
        summary: "The player grips an already-held item without changing item custody.",
        playerIntent: "Grip Brass Tube.",
        method: "grip",
        targetRefs: ["Brass Tube"],
        interactionKind: "player_local_condition",
        localConditionNeed: {
          actorRef: "Player",
          operation: "apply",
          conditionKey: "gripping_held_item",
          requestedPostureText: "grip Brass Tube",
          targetKind: "inventory_item_readiness",
          targetRef: "Brass Tube",
          evidenceRefs: ["Player", "Brass Tube", "Market"],
        },
      },
      interpretationRationale: "Grip/readiness changes are Player local condition state, not item custody.",
    };

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation.interactionKind).toBe("player_local_condition");
    expect(result.read.actionInterpretation.itemTransferNeed).toBeUndefined();
  });

  it("canonicalizes nullable GM Read liveSceneQuestion before player_local_condition validation", async () => {
    const frame = itemTransferActionPlanFrame({
      playerAction: "I keep both hands visible while staying in place.",
    });
    const candidate = {
      ...validGmRead(frame),
      path: "procedural",
      situationSummary: "The player is setting a local visible posture in the current scene.",
      liveSceneQuestion: null,
      focalRefs: ["Player"],
      evidenceRefs: ["Player", "Market"],
      actionInterpretation: {
        summary: "The player keeps both hands visible without moving.",
        playerIntent: "Keep both hands visible.",
        method: "hands_visible",
        targetRefs: ["Player"],
        interactionKind: "player_local_condition",
        localConditionNeed: {
          actorRef: "Player",
          operation: "apply",
          conditionKey: "hands_visible",
          requestedPostureText: "both hands visible",
          targetKind: "visible_scene_anchor",
          targetRef: "Market",
          evidenceRefs: ["Player", "Market"],
        },
      },
      interpretationRationale: "Visible local posture requires a bounded Player condition receipt.",
    };

    expect(gmReadModelGenerationSchema.safeParse(candidate).success).toBe(true);

    const result = await runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => candidate,
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.liveSceneQuestion).toBe("Which current-scene consequence should be resolved?");
    expect(result.read.actionInterpretation.interactionKind).toBe("player_local_condition");
    expect(result.read.actionInterpretation.localConditionNeed?.conditionKey).toBe("hands_visible");
    expect(result.repairAttempted).toBe(false);
  });

  it("accepts targeted current-scene local observation without turning it into item, movement, or scene beat authority", () => {
    const frame = localObservationFrame();
    const candidate = localObservationGmRead(frame);

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation).toMatchObject({
      interactionKind: "current_scene_observation",
      targetRefs: ["Guide"],
      localObservationNeed: {
        actorRef: "Player",
        mode: "target_match",
        queryText: "Guide",
        targetRef: "Guide",
        surfaceKinds: ["visible_actor", "visible_target"],
        allowBoundedNegative: true,
      },
    });
    expect(result.read.actionInterpretation.itemTransferNeed).toBeUndefined();
    expect(result.read.actionInterpretation.localConditionNeed).toBeUndefined();
  });

  it("rejects generic visible-actor observation when GM Read models it as target matching", () => {
    const frame = localObservationFrame({
      playerAction: "I look to see whether any people are visibly nearby.",
    });
    const candidate: GmRead = {
      ...localObservationGmRead(frame),
      actionInterpretation: {
        ...localObservationGmRead(frame).actionInterpretation,
        summary: "The player asks who is visibly nearby.",
        playerIntent: "List visible people nearby.",
        targetRefs: ["Market"],
        localObservationNeed: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "people visibly nearby",
          targetRef: null,
          surfaceKinds: ["visible_actor"],
          allowBoundedNegative: true,
          evidenceRefs: ["Player", "Market"],
        },
      },
    };

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed.mode",
      }),
    ]));
  });

  it("accepts device_status_observation only from exposed SceneFrame device surfaces", () => {
    const frame = deviceSurfaceFrame();
    const candidate = deviceSurfaceGmRead(frame);

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.read.actionInterpretation).toMatchObject({
      interactionKind: "device_status_observation",
      targetRefs: ["Burner phone"],
      deviceObservationNeed: {
        actorRef: "Player",
        deviceRef: "Burner phone",
        facetKinds: ["screen_state", "signal_indicator"],
        allowNoSurface: true,
      },
    });

    const smuggledLocalObservation: GmRead = {
      ...candidate,
      actionInterpretation: {
        ...candidate.actionInterpretation,
        interactionKind: "current_scene_observation",
        localObservationNeed: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "Burner phone signal",
          targetRef: "Burner phone",
          surfaceKinds: ["inventory_item"],
          allowBoundedNegative: true,
          evidenceRefs: ["Player", "Market", "Burner phone"],
        },
      },
    };
    const rejected = validateGmReadCandidate({ frame, candidate: smuggledLocalObservation });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues.some((issue) => issue.code === "interaction_invalid")).toBe(true);
  });

  it("canonicalizes empty modeled device surfaces to bounded no-surface admission", async () => {
    const base = deviceSurfaceFrame();
    const frame = deviceSurfaceFrame({
      playerAction: "I check the Burner phone's visible screen indicators for signal bars, message notifications, and missed-call indicators, without moving.",
      deviceStatusSurfaces: [{
        ...base.deviceStatusSurfaces![0]!,
        availableFacetKinds: [],
        facets: [],
      }],
    });
    const candidate: GmRead = {
      ...deviceSurfaceGmRead(frame),
      actionInterpretation: {
        ...deviceSurfaceGmRead(frame).actionInterpretation,
        playerIntent: "Check Burner phone visible screen indicators.",
        deviceObservationNeed: {
          ...deviceSurfaceGmRead(frame).actionInterpretation.deviceObservationNeed!,
          requestedFacetText: "signal bars, message notifications, and missed-call indicators",
          facetKinds: ["signal_indicator", "notification_indicator", "call_indicator"],
          allowNoSurface: false,
        },
      },
    };

    const readResult = validateGmReadCandidate({ frame, candidate });

    expect(readResult.status).toBe("accepted");
    if (readResult.status !== "accepted") throw new Error("expected accepted");
    expect(readResult.read.actionInterpretation.deviceObservationNeed?.allowNoSurface).toBe(true);

    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, readResult.read),
      actorRefs: ["Player"],
      targetRefs: ["Burner phone"],
      evidenceRefs: ["Player", "Market", "Burner phone"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Device surface observation needs a clean device_surface_observation receipt before narration.",
        evidenceRefs: ["Player", "Burner phone", "Market"],
      },
    };

    const checklist = await runCleanGmActionChecklist({
      frame,
      gmRead: readResult.read,
      judgment,
      checklistId: "gm-action-checklist-device-nosurface",
    });

    expect(checklist.status).toBe("accepted");
    if (checklist.status !== "accepted") throw new Error("expected accepted");
    expect(checklist.checklist.steps[0]?.intended.deviceObservationPlan).toMatchObject({
      facetKinds: ["signal_indicator", "notification_indicator", "call_indicator"],
      allowNoSurface: true,
    });
  });

  it("rejects localObservationNeed when the target ref is outside the requested exposed surface", () => {
    const frame = localObservationFrame();
    const candidate: GmRead = {
      ...localObservationGmRead(frame),
      actionInterpretation: {
        ...localObservationGmRead(frame).actionInterpretation,
        targetRefs: ["North Hall"],
        localObservationNeed: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "North Hall",
          targetRef: "North Hall",
          surfaceKinds: ["visible_actor"],
          allowBoundedNegative: true,
          evidenceRefs: ["Player", "Market", "North Hall"],
        },
      },
    };

    const result = validateGmReadCandidate({ frame, candidate });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "interaction_invalid",
          path: "actionInterpretation.localObservationNeed.targetRef",
        }),
      ]),
    );
  });

  it("accepts ordinary_support_actor_needed only with bounded supportActorNeed and no visible actor target", () => {
    const frame = minimalFrame({
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      citableRefs: ["Player", "Market", "Guide"],
    });
    const accepted = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player looks for an ordinary local vendor.",
          playerIntent: "Find a local vendor.",
          method: "look for",
          targetRefs: ["Market"],
          interactionKind: "ordinary_support_actor_needed",
          supportActorNeed: {
            roleKind: "vendor",
            requestedRoleText: "local vendor",
            currentScenePlausibility: "ordinary_local_role",
            intendedUse: "presence_only",
            evidenceRefs: ["Player", "Market"],
          },
        },
      },
    });
    expect(accepted.status).toBe("accepted");

    const visibleTarget = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player asks Guide to become a vendor.",
          playerIntent: "Use visible Guide as support actor.",
          method: "ask",
          targetRefs: ["Guide"],
          interactionKind: "ordinary_support_actor_needed",
          supportActorNeed: {
            roleKind: "vendor",
            requestedRoleText: "vendor",
            currentScenePlausibility: "ordinary_local_role",
            intendedUse: "presence_only",
            evidenceRefs: ["Player", "Market"],
          },
        },
      },
    });
    expect(visibleTarget.status).toBe("rejected");
    expect(visibleTarget.issues.some((issue) => issue.code === "interaction_invalid")).toBe(true);

    const missingNeed = validateGmReadCandidate({
      frame,
      candidate: {
        ...validGmRead(frame),
        path: "procedural",
        actionInterpretation: {
          summary: "The player looks for an ordinary local vendor.",
          playerIntent: "Find a local vendor.",
          method: "look for",
          targetRefs: ["Market"],
          interactionKind: "ordinary_support_actor_needed",
        },
      },
    });
    expect(missingNeed.status).toBe("rejected");
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
    expect(prompt).toContain("Naming a visible actor as an item-transfer recipient is not visible_actor_dialogue by itself.");
    expect(prompt).toContain("procedural does not authorize");
    expect(prompt).toContain("uncertain does not authorize");
    expect(prompt).toContain("Do not copy the inventory item's current equipState into equipSlot.");
  });

  it("exposes a current-frame cue for visible actor inventory handoffs", () => {
    const prompt = buildGmReadPrompt(minimalFrame({
      playerAction: "I hand the Brass Tube to Guide.",
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "carried",
        tags: [],
      }],
      citableRefs: ["Player", "Market", "Guide", "North Hall", "Brass Tube"],
    }));

    expect(prompt).toContain("Current-frame item_transfer cue");
    expect(prompt).toContain("choose interactionKind=item_transfer");
    expect(prompt).toContain("\"itemRef\": \"Brass Tube\"");
    expect(prompt).toContain("\"targetRef\": \"Guide\"");
    expect(prompt).toContain("\"equipSlot\": null");
  });

  it("keeps operational inventory tags out of GM Read and Judge prompt frames", () => {
    const frame = itemTransferActionPlanFrame({
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "carried",
        tags: ["fixture-item", "transfer-proof"],
      }],
    });
    const gmRead = itemTransferGmRead(frame);
    const gmReadPrompt = buildGmReadPrompt(frame);
    const judgePrompt = buildJudgeUncertaintyPrompt({ frame, gmRead });

    expect(gmReadPrompt).toContain("\"label\": \"Brass Tube\"");
    expect(judgePrompt).toContain("\"label\": \"Brass Tube\"");
    expect(gmReadPrompt).toContain("\"equipState\": \"carried\"");
    expect(judgePrompt).toContain("\"equipState\": \"carried\"");
    expect(gmReadPrompt).not.toContain("transfer-proof");
    expect(judgePrompt).not.toContain("transfer-proof");
    expect(gmReadPrompt).not.toContain("\"tags\"");
    expect(judgePrompt).not.toContain("\"tags\"");
  });

  it("exposes a current-frame cue for compound handoff plus spoken confirmation", () => {
    const prompt = buildGmReadPrompt(minimalFrame({
      playerAction: 'I hand the Brass Tube to Guide, then ask, "Do you have it now?"',
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "carried",
        tags: [],
      }],
      citableRefs: ["Player", "Market", "Guide", "North Hall", "Brass Tube"],
    }));

    expect(buildGmReadSystemPrompt()).toContain("Spoken confirmation after transfer");
    expect(prompt).toContain("choose interactionKind=visible_actor_dialogue");
    expect(prompt).toContain("valid compound handoff plus confirmation example shape");
    expect(prompt).toContain("\"interactionKind\": \"visible_actor_dialogue\"");
    expect(prompt).toContain("\"playerIntent\": \"Hand Brass Tube to Guide, then ask for spoken confirmation.\"");
    expect(prompt).toContain("\"targetRefs\": [\n      \"Guide\"\n    ]");
    expect(prompt).toContain("\"interactionKind\": \"item_transfer\"");
    expect(prompt).toContain("\"itemRef\": \"Brass Tube\"");
    expect(prompt).toContain("\"targetRef\": \"Guide\"");
    expect(prompt).toContain("\"equipSlot\": null");
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

  it("repairs an exact current-frame handoff into typed item_transfer admission", async () => {
    const frame = itemTransferActionPlanFrame();
    const calls: string[] = [];
    const prompts: string[] = [];
    const result = await runCleanGmRead({
      frame,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        prompts.push(request.prompt);
        if (!request.repairOf) {
          return {
            ...validGmRead(frame),
            path: "procedural",
            focalRefs: ["Player", "Guide"],
            evidenceRefs: ["Player", "Guide", "Market"],
            actionInterpretation: {
              summary: "The player gives a carried item to Guide.",
              playerIntent: "Give the Brass Tube to Guide.",
              method: "give",
              targetRefs: ["Guide"],
              interactionKind: "unsupported_or_unclear",
            },
            interpretationRationale: "The action names a visible actor but omits the item-state contract.",
          };
        }
        return itemTransferGmRead(frame);
      },
    });

    expect(calls).toEqual(["initial", "repair"]);
    expect(prompts[1]).toContain("Current-frame item_transfer admission card");
    expect(prompts[1]).toContain("\"itemRef\": \"Brass Tube\"");
    expect(prompts[1]).toContain("\"targetRef\": \"Guide\"");
    expect(result.repairAttempted).toBe(true);
    expect(result.read.actionInterpretation).toMatchObject({
      interactionKind: "item_transfer",
      itemTransferNeed: {
        operation: "give_to_visible_actor",
        itemRef: "Brass Tube",
        targetRef: "Guide",
      },
    });
  });

  it("surfaces GM Read generation transport errors before settled clarification", async () => {
    const frame = minimalFrame();

    await expect(runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => {
        throw new Error("provider unavailable");
      },
    })).rejects.toThrow(CleanGmReadGenerationError);
    await expect(runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => {
        throw new Error("provider unavailable");
      },
    })).rejects.toThrow("Clean GM Read generation failed before validation");
  });

  it("surfaces GM Read repair generation transport errors before settled clarification", async () => {
    const frame = minimalFrame();
    const calls: string[] = [];

    await expect(runCleanGmRead({
      frame,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        if (request.repairOf) {
          throw new Error("repair provider unavailable");
        }
        return {
          ...validGmRead(frame),
          payload: { toolId: "movement" },
        };
      },
    })).rejects.toThrow("Clean GM Read repair generation failed");
    expect(calls).toEqual(["initial", "repair"]);
  });

  it("rejects GM Read validation exhaustion before settled gameplay semantics", async () => {
    const frame = minimalFrame();
    await expect(runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => ({
        ...validGmRead(frame),
        toolInput: { effect: "smuggled" },
      }),
    })).rejects.toThrow(CleanGmReadValidationError);

    await expect(runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => ({
        ...validGmRead(frame),
        toolInput: { effect: "smuggled" },
      }),
    })).rejects.toThrow("Clean GM Read validation failed after repair.");
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

  it("keeps overlong Judge rationale repairable during model generation while final packets stay strict", () => {
    const frame = itemTransferActionPlanFrame();
    const gmRead = itemTransferGmRead(frame);
    const longRationale = [
      "The player is asking for a backend-owned item custody transition involving a visible actor and a visible item.",
      "The runtime must not narrate this from scene-frame evidence alone because the item owner and holder state require an item_transfer receipt before player-facing narration may claim completion.",
      "This text is intentionally verbose enough to exceed the final shortText contract so generation can pass it to validation and repair before settled clarification.",
      "The repaired candidate should preserve the action_plan branch and shorten the prose.",
    ].join(" ");
    const candidate: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      checkRationale: longRationale,
      noRollReason: {
        code: "backend_receipt_required",
        explanation: longRationale,
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    };

    expect(longRationale.length).toBeGreaterThan(500);
    expect(judgeUncertaintyGenerationSchema.safeParse(candidate).success).toBe(true);
    expect(judgeUncertaintySchema.safeParse(candidate).success).toBe(false);
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate }).status).toBe("rejected");
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

  it("requires exposed movement_intent to use action_plan even when GM Read path is uncertain", () => {
    const frame = actionPlanFrame({
      playerAction: "I walk back to Jujutsu Headquarters.",
      scene: {
        currentLocation: { ref: "Mission Assignment Office", label: "Mission Assignment Office", description: null },
        currentScene: { ref: "Mission Assignment Office", label: "Mission Assignment Office", description: null },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      movementOptions: [{
        ref: "Jujutsu Headquarters",
        label: "Jujutsu Headquarters",
        connected: true,
        travelCost: 1,
      }],
      targets: [{ ref: "Jujutsu Headquarters", label: "Jujutsu Headquarters", kind: "location" }],
      citableRefs: ["Player", "Mission Assignment Office", "Jujutsu Headquarters"],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      path: "uncertain",
      situationSummary: "The player names a visible route destination.",
      liveSceneQuestion: "Which movement destination must be resolved?",
      focalRefs: ["Player", "Jujutsu Headquarters"],
      evidenceRefs: ["Player", "Mission Assignment Office", "Jujutsu Headquarters"],
      actionInterpretation: {
        summary: "The player intends to walk back to Jujutsu Headquarters.",
        playerIntent: "Travel to Jujutsu Headquarters.",
        method: "walk back",
        targetRefs: ["Jujutsu Headquarters"],
        interactionKind: "movement_intent",
      },
      interpretationRationale: "The target is one exposed SceneFrame movement option.",
    };
    const clarification: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "uncertain",
      },
      physicalPossibility: "underspecified",
      checkNeed: "clarification_needed",
      nextStep: "ask_clarification",
      actorRefs: ["Player"],
      targetRefs: ["Jujutsu Headquarters"],
      evidenceRefs: ["Player", "Mission Assignment Office", "Jujutsu Headquarters"],
      possibilityRationale: "The target is visible but the candidate asks for clarification.",
      checkRationale: "The candidate asks for clarification instead of admitting the backend movement receipt.",
      noRollReason: {
        code: "insufficient_specificity",
        explanation: "The movement target was treated as insufficiently specific.",
        evidenceRefs: ["Player", "Jujutsu Headquarters"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    const rejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: clarification });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "branch_invalid",
        path: "checkNeed",
      }),
    ]));

    const accepted: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "uncertain",
      },
      actorRefs: ["Player"],
      targetRefs: ["Jujutsu Headquarters"],
      evidenceRefs: ["Player", "Mission Assignment Office", "Jujutsu Headquarters"],
      checkRationale: "Movement to an exposed destination needs backend movement receipt authority.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Stage 4 must issue the terminal movement receipt before narration can claim arrival.",
        evidenceRefs: ["Player", "Jujutsu Headquarters"],
      },
    };
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: accepted }).status).toBe("accepted");
  });

  it("rejects ordinary support actor materialization as no-roll narration", () => {
    const frame = actionPlanFrame({
      playerAction: "I look for a local vendor in the market.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      evidenceRefs: ["Player", "Market"],
      actionInterpretation: {
        summary: "The player looks for an ordinary local vendor.",
        playerIntent: "Find a local vendor.",
        method: "look for",
        targetRefs: ["Market"],
        interactionKind: "ordinary_support_actor_needed",
        supportActorNeed: {
          roleKind: "vendor",
          requestedRoleText: "local vendor",
          currentScenePlausibility: "ordinary_local_role",
          intendedUse: "presence_only",
          evidenceRefs: ["Player", "Market"],
        },
      },
    };
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

  it("requires item_transfer to use the backend action-plan branch instead of no-roll narration", () => {
    const frame = itemTransferActionPlanFrame();
    const gmRead = itemTransferGmRead(frame);
    const noRoll = validJudgeUncertainty(frame, gmRead);

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    const rejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: noRoll });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "branch_invalid",
          path: "checkNeed",
        }),
      ]),
    );

    const blockedUnsupported: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      physicalPossibility: "unsupported_by_runtime",
      checkNeed: "blocked_unsupported",
      nextStep: "block_no_mutation",
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      possibilityRationale: "The candidate treated a supported item transfer primitive as unsupported.",
      checkRationale: "The candidate blocked instead of admitting the backend receipt.",
      noRollReason: {
        code: "unsupported_runtime_scope",
        explanation: "The candidate treated the item transfer as unsupported.",
        evidenceRefs: ["Player", "Brass Tube", "Guide"],
      },
    };
    const blockedRejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: blockedUnsupported });
    expect(blockedRejected.status).toBe("rejected");
    expect(blockedRejected.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "branch_invalid",
          path: "checkNeed",
        }),
      ]),
    );

    const accepted: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      checkRationale: "Uncontested item custody still needs backend item-transfer receipt authority.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Item transfer needs a clean item_transfer receipt before narration.",
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    };
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: accepted }).status).toBe("accepted");
  });

  it("requires compound visible dialogue plus item transfer to use backend action-plan admission", () => {
    const frame = itemTransferActionPlanFrame({
      playerAction: 'I hand the Brass Tube to Guide, then ask, "Do you have it now?"',
    });
    const gmRead: GmRead = {
      ...itemTransferGmRead(frame),
      liveSceneQuestion: "Which item state must settle before Guide can visibly answer?",
      actionInterpretation: {
        ...itemTransferGmRead(frame).actionInterpretation,
        summary: "The player hands Brass Tube to Guide and asks for spoken confirmation.",
        playerIntent: "Hand Brass Tube to Guide, then ask for spoken confirmation.",
        method: "hand and ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
      },
    };
    const blockedUnsupported: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      physicalPossibility: "unsupported_by_runtime",
      checkNeed: "blocked_unsupported",
      nextStep: "block_no_mutation",
      actorRefs: ["Player"],
      targetRefs: ["Guide", "Brass Tube"],
      evidenceRefs: ["Player", "Market", "Guide", "Brass Tube"],
      possibilityRationale: "The candidate treated the supported compound primitive as unsupported.",
      checkRationale: "The candidate blocked instead of admitting backend receipts.",
      noRollReason: {
        code: "unsupported_runtime_scope",
        explanation: "The candidate treated compound transfer plus dialogue as unsupported.",
        evidenceRefs: ["Player", "Guide", "Brass Tube"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    const rejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: blockedUnsupported });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "branch_invalid",
        path: "checkNeed",
      }),
    ]));

    const accepted: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      checkRationale: "Compound item transfer plus visible dialogue needs backend receipts with refreshed frame binding.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Stage 4 must settle item transfer before recording Guide's visible response.",
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    };
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: accepted }).status).toBe("accepted");
  });

  it("requires targeted local_observation to use the backend action-plan branch instead of no-roll narration", () => {
    const frame = localObservationFrame();
    const gmRead = localObservationGmRead(frame);
    const noRoll = validJudgeUncertainty(frame, gmRead);

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    const rejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: noRoll });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "branch_invalid",
          path: "checkNeed",
        }),
      ]),
    );

    const accepted: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      checkRationale: "Targeted local observation needs backend local-observation receipt authority.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Local observation needs a clean local_observation receipt before narration.",
        evidenceRefs: ["Player", "Guide", "Market"],
      },
    };
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: accepted }).status).toBe("accepted");
  });

  it("requires supported visible-actor list observations to use backend receipt admission", () => {
    const frame = localObservationFrame({
      playerAction: "I look for visible people here without moving.",
    });
    const gmRead: GmRead = {
      ...localObservationGmRead(frame),
      focalRefs: ["Player", "Market"],
      evidenceRefs: ["Player", "Market"],
      liveSceneQuestion: "Which visible actor surface should Stage 4 list?",
      actionInterpretation: {
        summary: "The player asks which people are visible here.",
        playerIntent: "List visible people here.",
        method: "look",
        targetRefs: ["Market"],
        interactionKind: "current_scene_observation",
        localObservationNeed: {
          actorRef: "Player",
          mode: "list_surface",
          queryText: "visible people here",
          targetRef: null,
          surfaceKinds: ["visible_actor"],
          allowBoundedNegative: true,
          evidenceRefs: ["Player", "Market"],
        },
      },
      interpretationRationale: "Visible people are exposed through the current SceneFrame actor surface.",
    };
    const blockedUnsupported: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      physicalPossibility: "unsupported_by_runtime",
      checkNeed: "blocked_unsupported",
      nextStep: "block_no_mutation",
      actorRefs: ["Player"],
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      possibilityRationale: "The candidate treated a supported visible-actor list observation as unsupported.",
      checkRationale: "The candidate blocked instead of admitting the backend receipt.",
      noRollReason: {
        code: "unsupported_runtime_scope",
        explanation: "The candidate treated visible-actor surface listing as unsupported.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    const rejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: blockedUnsupported });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "branch_invalid",
        path: "checkNeed",
      }),
    ]));

    const accepted: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      checkRationale: "Visible-actor list observation needs backend local-observation receipt authority.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Stage 4 must issue the local_observation receipt before narration lists visible actors.",
        evidenceRefs: ["Player", "Market"],
      },
    };
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: accepted }).status).toBe("accepted");
  });

  it("requires device_status_observation to use the backend action-plan branch instead of no-roll narration", () => {
    const frame = deviceSurfaceFrame();
    const gmRead = deviceSurfaceGmRead(frame);
    const noRoll = validJudgeUncertainty(frame, gmRead);

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    const rejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: noRoll });
    expect(rejected.status).toBe("rejected");
    expect(rejected.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "branch_invalid",
          path: "checkNeed",
        }),
      ]),
    );

    const blockedUnsupported: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      physicalPossibility: "unsupported_by_runtime",
      checkNeed: "blocked_unsupported",
      nextStep: "block_no_mutation",
      actorRefs: ["Player"],
      targetRefs: ["Burner phone"],
      evidenceRefs: ["Player", "Market", "Burner phone"],
      possibilityRationale: "The candidate treated a supported device surface observation as unsupported.",
      checkRationale: "The candidate blocked instead of admitting the backend receipt.",
      noRollReason: {
        code: "unsupported_runtime_scope",
        explanation: "The candidate treated device surface observation as unsupported.",
        evidenceRefs: ["Player", "Burner phone", "Market"],
      },
    };
    const blockedRejected = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: blockedUnsupported });
    expect(blockedRejected.status).toBe("rejected");
    expect(blockedRejected.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "branch_invalid",
        path: "checkNeed",
      }),
    ]));

    const accepted: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Burner phone"],
      evidenceRefs: ["Player", "Market", "Burner phone"],
      checkRationale: "Device surface observation needs backend device_surface_observation receipt authority.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Device surface observation needs a clean device_surface_observation receipt before narration.",
        evidenceRefs: ["Player", "Burner phone", "Market"],
      },
    };
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: accepted }).status).toBe("accepted");
  });

  it("admits movement intent through the backend movement receipt contract before model generation", async () => {
    const frame = actionPlanFrame();
    const gmRead = actionPlanGmRead(frame);
    let modelCalled = false;
    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => {
        modelCalled = true;
        throw new Error("movement admission should be deterministic");
      },
    });

    expect(modelCalled).toBe(false);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(false);
    expect(result.judgment.nextStep).toBe("action_plan");
    expect(result.judgment.checkNeed).toBe("backend_action_plan_needed");
    expect(result.judgment.noRollReason?.code).toBe("backend_receipt_required");
  });

  it("admits visible route inquiries through the backend route receipt contract before model generation", async () => {
    const frame = actionPlanFrame({
      playerAction: "I check whether the route to North Hall is open, without moving.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      liveSceneQuestion: "Which visible route status must be checked?",
      evidenceRefs: ["Player", "Market", "North Hall"],
      actionInterpretation: {
        summary: "The player asks whether the visible route to North Hall is open without moving.",
        playerIntent: "Check route status to North Hall without moving.",
        method: "check route",
        targetRefs: ["North Hall"],
        interactionKind: "route_inquiry",
      },
      interpretationRationale: "The accepted read identifies a visible route inquiry.",
    };
    let modelCalled = false;

    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => {
        modelCalled = true;
        throw new Error("route inquiry admission should be deterministic");
      },
    });

    expect(modelCalled).toBe(false);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(false);
    expect(result.judgment).toMatchObject({
      nextStep: "action_plan",
      checkNeed: "backend_action_plan_needed",
      physicalPossibility: "possible",
      targetRefs: ["North Hall"],
    });
    expect(result.judgment.noRollReason?.code).toBe("backend_receipt_required");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: result.judgment }).status)
      .toBe("accepted");
  });

  it("admits visible actor dialogue through the backend dialogue receipt contract before model generation", async () => {
    const frame = actionPlanFrame({
      playerAction: "I ask Guide whether they carry the Brass Tube.",
    });
    const gmRead: GmRead = {
      ...validGmRead(frame),
      path: "direct",
      liveSceneQuestion: "What does the visible speaker say?",
      focalRefs: ["Player", "Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      actionInterpretation: {
        summary: "The player asks visible Guide a question.",
        playerIntent: "Ask Guide about the Brass Tube.",
        method: "ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
      },
      interpretationRationale: "The action addresses one already-visible speaker.",
    };
    let modelCalled = false;

    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => {
        modelCalled = true;
        throw new Error("visible dialogue admission should be deterministic");
      },
    });

    expect(modelCalled).toBe(false);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(false);
    expect(result.judgment).toMatchObject({
      nextStep: "action_plan",
      checkNeed: "backend_action_plan_needed",
      physicalPossibility: "possible",
      targetRefs: ["Guide"],
    });
    expect(result.judgment.noRollReason?.code).toBe("backend_receipt_required");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: result.judgment }).status)
      .toBe("accepted");
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
    expect(prompt).toContain("Accepted GM Read is the typed player-intent");
    expect(prompt).toContain("must not narrate");
    expect(prompt).toContain("mutate state");
    expect(prompt).toContain("roll dice");
    expect(prompt).toContain("gm-read uncertain is a signal");
    expect(prompt).toContain("backend-owned consequences");
  });

  it("builds Judge/Uncertainty prompts from accepted GM Read without raw player action", async () => {
    const rawMarker = "RAW_JUDGE_MARKER_NEVER_PROMPT";
    const frame = minimalFrame({ playerAction: `I ask while saying ${rawMarker}.` });
    const gmRead = validGmRead(frame);
    const prompts: string[] = [];

    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async (request) => {
        prompts.push(request.prompt);
        return validJudgeUncertainty(frame, gmRead);
      },
    });

    expect(result.status).toBe("accepted");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Accepted GM Read");
    expect(prompts[0]).toContain(gmRead.actionInterpretation.playerIntent);
    expect(prompts[0]).not.toContain(rawMarker);
    expect(prompts[0]).not.toContain('"playerAction"');
  });

  it("keeps Judge/Uncertainty repair prompts on accepted GM Read instead of raw player action", async () => {
    const rawMarker = "RAW_JUDGE_REPAIR_MARKER_NEVER_PROMPT";
    const frame = minimalFrame({ playerAction: `I ask while saying ${rawMarker}.` });
    const gmRead = validGmRead(frame);
    const prompts: string[] = [];
    let callCount = 0;

    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async (request) => {
        prompts.push(request.prompt);
        callCount += 1;
        if (callCount === 1) {
          return {
            ...validJudgeUncertainty(frame, gmRead),
            toolInput: { effect: "smuggled" },
          };
        }
        return validJudgeUncertainty(frame, gmRead);
      },
    });

    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(true);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("Accepted GM Read");
    expect(prompts[1]).toContain(gmRead.actionInterpretation.playerIntent);
    for (const prompt of prompts) {
      expect(prompt).not.toContain(rawMarker);
      expect(prompt).not.toContain('"playerAction"');
    }
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

  it("rejects Judge/Uncertainty validation exhaustion before settled gameplay semantics", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    await expect(runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => ({
        ...validJudgeUncertainty(frame, gmRead),
        oracleResult: { tier: "strong_hit" },
      }),
    })).rejects.toThrow(CleanJudgeUncertaintyValidationError);

    await expect(runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => ({
        ...validJudgeUncertainty(frame, gmRead),
        oracleResult: { tier: "strong_hit" },
      }),
    })).rejects.toThrow("Clean Judge/Uncertainty validation failed after repair.");
  });

  it("stops before Judge/Uncertainty when GM Read validation is exhausted", async () => {
    const order: string[] = [];
    const frame = minimalFrame();
    const events: CleanGameplayRuntimeEvent[] = [];

    await expect((async () => {
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
        events.push(event);
        if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
          const stage = (event.data as { stage?: unknown }).stage;
          if (typeof stage === "string") order.push(stage);
        }
      }
    })()).rejects.toThrow(CleanGmReadValidationError);

    expect(order).toEqual(["scene-frame", "gm-read"]);
    expect(order).not.toContain("judge-called");
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });

  it("stops before settled packet, narration, and commit when GM Read generation throws", async () => {
    const frame = minimalFrame();
    const events: CleanGameplayRuntimeEvent[] = [];
    const commits: Parameters<typeof fakeCommitTurn>[0][] = [];

    await expect((async () => {
      for await (const event of processCleanGameplayTurnFromInput({
        turn: validTurnInput(),
        judgeProvider: provider,
        buildFrame: async () => frame,
        gmReadCandidateGenerator: async () => {
          throw new Error("provider unavailable");
        },
        judgeUncertaintyCandidateGenerator: async () => validJudgeUncertainty(frame),
        runNarration: fakeRunNarration,
        commitTurn: async (input) => {
          commits.push(input);
          return fakeCommitTurn(input);
        },
      })) {
        events.push(event);
      }
    })()).rejects.toThrow(CleanGmReadGenerationError);

    expect(events.map((event) => event.type)).toEqual(["scene-settling", "scene-settling"]);
    expect(events.map((event) =>
      typeof event.data === "object" && event.data ? (event.data as { stage?: unknown }).stage : null
    )).toEqual(["scene-frame", "gm-read"]);
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(commits).toEqual([]);
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

  it("requires typed checklist plans for every receipt-owned primitive kind", () => {
    const planCases = [
      {
        kind: "condition_set" as const,
        capabilityId: "condition_set" as const,
        stateOrEvidence: "state" as const,
        planKey: "localConditionPlan" as const,
        targetRefs: ["Market"],
        evidenceRefs: ["Player", "Market"],
        plan: {
          actorRef: "Player" as const,
          operation: "apply" as const,
          conditionKey: "kneeling" as const,
          conditionScope: "current_scene" as const,
          anchorRef: "Market",
          targetKind: "current_scene" as const,
          targetRef: "Market",
          replacementPolicy: "replace_same_condition_group" as const,
        },
      },
      {
        kind: "item_transfer" as const,
        capabilityId: "item_transfer" as const,
        stateOrEvidence: "state" as const,
        planKey: "itemTransferPlan" as const,
        targetRefs: ["Brass Tube", "Guide", "Market"],
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
        plan: {
          actorRef: "Player" as const,
          operation: "give_to_visible_actor" as const,
          itemRef: "Brass Tube",
          sourceKind: "player_inventory" as const,
          targetKind: "visible_actor" as const,
          targetRef: "Guide",
          targetEquipState: "carried" as const,
          targetEquippedSlot: null,
          anchorRef: "Market",
        },
      },
      {
        kind: "minor_poi_create" as const,
        capabilityId: "minor_poi_create" as const,
        stateOrEvidence: "state" as const,
        planKey: "minorPoiPlan" as const,
        targetRefs: ["Market"],
        evidenceRefs: ["Player", "Market"],
        plan: {
          actorRef: "Player" as const,
          placeLabel: "Tea Stall",
          placeKind: "stall" as const,
          anchorRef: "Market",
          reusePolicy: "reuse_matching_current_scene_place_handle_or_create" as const,
        },
      },
      {
        kind: "local_observation" as const,
        capabilityId: "local_observation" as const,
        stateOrEvidence: "evidence" as const,
        planKey: "localObservationPlan" as const,
        targetRefs: ["Guide", "Market"],
        evidenceRefs: ["Player", "Guide", "Market"],
        plan: {
          actorRef: "Player" as const,
          mode: "target_match" as const,
          queryText: "Guide",
          targetRef: "Guide",
          surfaceKinds: ["visible_actor"] as const,
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
      {
        kind: "device_surface_observation" as const,
        capabilityId: "device_surface_observation" as const,
        stateOrEvidence: "evidence" as const,
        planKey: "deviceObservationPlan" as const,
        targetRefs: ["Burner phone", "Market"],
        evidenceRefs: ["Player", "Burner phone", "Market"],
        plan: {
          actorRef: "Player" as const,
          deviceRef: "Burner phone",
          requestedDeviceText: "Burner phone",
          requestedFacetText: "screen and signal indicator",
          facetKinds: ["screen_state", "signal_indicator"] as const,
          allowNoSurface: true,
          anchorRef: "Market",
        },
      },
    ];

    function checklistForCase(input: {
      kind: GmActionChecklist["steps"][number]["intended"]["kind"];
      capabilityId: GmActionChecklist["steps"][number]["intended"]["requiredCapabilityId"];
      stateOrEvidence: GmActionChecklist["steps"][number]["intended"]["stateOrEvidence"];
      targetRefs: string[];
      evidenceRefs: string[];
      planKey?: (typeof planCases)[number]["planKey"];
      plan?: unknown;
    }): GmActionChecklist {
      const base = validActionChecklist();
      const step = base.steps[0]!;
      const intended: GmActionChecklist["steps"][number]["intended"] = {
        kind: input.kind,
        stateOrEvidence: input.stateOrEvidence,
        requiredCapabilityId: input.capabilityId,
        summary: `Plan ${input.kind} through typed checklist contract.`,
      };
      if (input.planKey && input.plan) {
        Object.assign(intended, { [input.planKey]: input.plan });
      }
      return {
        ...base,
        steps: [{
          ...step,
          targetRefs: input.targetRefs,
          evidenceRefs: input.evidenceRefs,
          intended,
        }],
      };
    }

    for (const testCase of planCases) {
      expect(gmActionChecklistSchema.safeParse(checklistForCase({
        kind: testCase.kind,
        capabilityId: testCase.capabilityId,
        stateOrEvidence: testCase.stateOrEvidence,
        targetRefs: testCase.targetRefs,
        evidenceRefs: testCase.evidenceRefs,
        planKey: testCase.planKey,
        plan: testCase.plan,
      })).success).toBe(true);

      const missing = gmActionChecklistSchema.safeParse(checklistForCase({
        kind: testCase.kind,
        capabilityId: testCase.capabilityId,
        stateOrEvidence: testCase.stateOrEvidence,
        targetRefs: testCase.targetRefs,
        evidenceRefs: testCase.evidenceRefs,
      }));
      expect(missing.success).toBe(false);
      expect(JSON.stringify(missing.error?.issues ?? [])).toContain(
        `${testCase.kind} checklist steps require a typed ${testCase.planKey}.`,
      );

      const foreign = gmActionChecklistSchema.safeParse(checklistForCase({
        kind: "movement",
        capabilityId: "movement",
        stateOrEvidence: "state",
        targetRefs: ["North Hall"],
        evidenceRefs: ["Player", "North Hall"],
        planKey: testCase.planKey,
        plan: testCase.plan,
      }));
      expect(foreign.success).toBe(false);
      expect(JSON.stringify(foreign.error?.issues ?? [])).toContain(
        `${testCase.planKey} is allowed only for ${testCase.kind} checklist steps.`,
      );
    }
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

  it("deterministically checks a visible route without compiling movement when the player asks not to move", async () => {
    const frame = actionPlanFrame({
      playerAction: "I check whether the visible route to North Hall is open and legal, without moving.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      liveSceneQuestion: "Can route status be checked without moving the Player?",
      evidenceRefs: ["Player", "Market", "North Hall"],
      actionInterpretation: {
        summary: "The player asks whether the visible route to North Hall is open and legal without moving.",
        playerIntent: "Check route status to North Hall without moving.",
        method: "check route",
        targetRefs: ["North Hall"],
        interactionKind: "route_inquiry",
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      targetRefs: ["North Hall"],
      evidenceRefs: ["Player", "Market", "North Hall"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Route status needs a route_check receipt before narration may answer.",
        evidenceRefs: ["Player", "North Hall"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-route-inquiry-no-move",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual(["route_check"]);
    expect(result.checklist.steps.map((step) => step.intended.kind)).not.toContain("movement");
    expect(result.checklist.steps[0]).toMatchObject({
      intended: {
        kind: "route_check",
        requiredCapabilityId: "route_check",
        stateOrEvidence: "evidence",
      },
      targetRefs: ["North Hall"],
      dependsOnStepIds: [],
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically produces time_advance checklist when no admitted movement target exists", async () => {
    const frame = actionPlanFrame({
      playerAction: "I let the moment breathe for ten minutes.",
      movementOptions: [],
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
        { capabilityId: "time_advance", evidenceAuthority: "receipt_required", allowed: true },
      ],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      evidenceRefs: ["Player", "Market"],
      liveSceneQuestion: "How much current-scene time should elapse?",
      actionInterpretation: {
        summary: "The player lets ten current-scene minutes elapse.",
        playerIntent: "Let ten current-scene minutes elapse.",
        method: null,
        targetRefs: ["Market"],
        interactionKind: "time_passage",
        timePassageNeed: {
          actorRef: "Player",
          elapsedMinutes: 10,
          reasonKind: "wait",
          requestedDurationText: "ten minutes",
          evidenceRefs: ["Player", "Market"],
        },
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
        timeAdvancePlan: {
          actorRef: "Player",
          sceneRef: "Market",
          elapsedMinutes: 10,
          reasonKind: "wait",
          requestedDurationText: "ten minutes",
        },
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
      playerAction: "I ask for the current choices from here.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      liveSceneQuestion: "Which current-scene choices can be listed?",
      actionInterpretation: {
        summary: "The player asks which current-scene choices can be listed.",
        playerIntent: "List current-scene choices.",
        method: null,
        targetRefs: ["Market"],
        interactionKind: "route_inquiry",
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
      playerAction: "I take in the current market.",
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      liveSceneQuestion: "Which current-scene details are present?",
      actionInterpretation: {
        summary: "The player requests current-scene surface details.",
        playerIntent: "Get current-scene surface details.",
        method: null,
        targetRefs: ["Market"],
        interactionKind: "current_scene_observation",
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

  it("deterministically produces local_observation checklist for targeted visible-surface questions", async () => {
    const frame = localObservationFrame();
    const gmRead = localObservationGmRead(frame);
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Targeted local observation needs a clean local_observation receipt before narration.",
        evidenceRefs: ["Player", "Guide", "Market"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-local-observation",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      actorRef: "Player",
      targetRefs: ["Guide", "Market"],
      intended: {
        kind: "local_observation",
        requiredCapabilityId: "local_observation",
        stateOrEvidence: "evidence",
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "Guide",
          targetRef: "Guide",
          surfaceKinds: ["visible_actor", "visible_target"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
  });

  it("deterministically produces device_surface_observation checklist for modeled device surface checks", async () => {
    const frame = deviceSurfaceFrame();
    const gmRead = deviceSurfaceGmRead(frame);
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Burner phone"],
      evidenceRefs: ["Player", "Market", "Burner phone"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Device surface observation needs a clean device_surface_observation receipt before narration.",
        evidenceRefs: ["Player", "Burner phone", "Market"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-device-surface",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      actorRef: "Player",
      targetRefs: ["Burner phone", "Market"],
      intended: {
        kind: "device_surface_observation",
        requiredCapabilityId: "device_surface_observation",
        stateOrEvidence: "evidence",
        deviceObservationPlan: {
          actorRef: "Player",
          deviceRef: "Burner phone",
          requestedDeviceText: "Burner phone",
          requestedFacetText: "screen and signal indicator",
          facetKinds: ["screen_state", "signal_indicator"],
          allowNoSurface: true,
          anchorRef: "Market",
        },
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically produces dialogue_record checklist only for accepted visible actor dialogue", async () => {
    const frame = actionPlanFrame({
      playerAction: "I ask Guide what happened.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      focalRefs: ["Player", "Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      liveSceneQuestion: "How does Guide visibly respond?",
      actionInterpretation: {
        summary: "The player asks Guide a question.",
        playerIntent: "Ask Guide what happened.",
        method: "ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Visible dialogue needs a terminal dialogue receipt before narration.",
        evidenceRefs: ["Player", "Guide"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-dialogue",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      actorRef: "Player",
      targetRefs: ["Guide"],
      intended: {
        kind: "dialogue_record",
        requiredCapabilityId: "dialogue_record",
        stateOrEvidence: "terminal_player_visible",
        dialoguePlan: {
          actorRef: "Player",
          speakerSource: "existing_visible_actor",
          speakerRef: "Guide",
          materializedSpeakerBindingId: null,
          addresseeRef: "Player",
          playerIntent: "Ask Guide what happened",
          responseScope: "visible_speaker_response_only",
        },
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
  });

  it("bounds dialogue checklist evidence refs when route advice names many visible routes", async () => {
    const routeRefs = [
      "Anchor Chain Pylon",
      "Auditor Spire",
      "Charter Gallery",
      "Resonance Tower",
      "Silt Warrens",
      "Slip Twelve Berth",
      "The Copper Tap",
      "Upper Dam Ruins",
    ];
    const frame = actionPlanFrame({
      playerAction: "I ask Guide which route from the bazaar looks safest right now.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [
        { ref: "Guide", label: "Guide", kind: "actor" },
        ...routeRefs.map((ref) => ({ ref, label: ref, kind: "location" as const })),
      ],
      movementOptions: routeRefs.map((ref) => ({
        ref,
        label: ref,
        connected: true,
        travelCost: 1,
      })),
      citableRefs: ["Player", "Market", "Guide", ...routeRefs],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      focalRefs: ["Guide", ...routeRefs],
      evidenceRefs: ["Player", "Market", "Guide", ...routeRefs],
      liveSceneQuestion: "Which route does Guide say looks safest?",
      actionInterpretation: {
        summary: "The player asks Guide for a route safety recommendation.",
        playerIntent: "Ask Guide which bazaar route looks safest right now.",
        method: "ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Market", "Guide", ...routeRefs],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Visible dialogue needs a terminal dialogue receipt before narration.",
        evidenceRefs: ["Player", "Guide", ...routeRefs],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-dialogue-route-advice",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    const [step] = result.checklist.steps;
    expect(step.evidenceRefs).toHaveLength(8);
    expect(step.evidenceRefs.slice(0, 3)).toEqual(["Player", "Guide", "Market"]);
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically produces item_transfer checklist for an uncontested visible-actor handoff", async () => {
    const frame = itemTransferActionPlanFrame();
    const gmRead = itemTransferGmRead(frame);
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Item transfer needs a clean item_transfer receipt before narration.",
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-item-transfer",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      actorRef: "Player",
      targetRefs: ["Brass Tube", "Guide", "Market"],
      intended: {
        kind: "item_transfer",
        requiredCapabilityId: "item_transfer",
        stateOrEvidence: "state",
        itemTransferPlan: {
          actorRef: "Player",
          operation: "give_to_visible_actor",
          itemRef: "Brass Tube",
          sourceKind: "player_inventory",
          targetKind: "visible_actor",
          targetRef: "Guide",
          targetEquipState: "carried",
          targetEquippedSlot: null,
          anchorRef: "Market",
        },
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("requires item_transfer checklist plans to carry operation-owned equip fields", async () => {
    const frame = itemTransferActionPlanFrame();
    const gmRead = itemTransferGmRead(frame);
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Item transfer needs a clean item_transfer receipt before narration.",
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    };
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-item-transfer-operation-fields",
    });
    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    const step = result.checklist.steps[0]!;
    const plan = step.intended.itemTransferPlan!;

    expect(gmActionChecklistSchema.safeParse({
      ...result.checklist,
      steps: [{
        ...step,
        intended: {
          ...step.intended,
          itemTransferPlan: {
            ...plan,
            targetEquippedSlot: "equipped",
          },
        },
      }],
    }).success).toBe(false);

    const equipPlan = {
      ...plan,
      operation: "equip_inventory_item" as const,
      targetKind: "player_equipment" as const,
      targetRef: "Player",
      targetEquipState: "equipped" as const,
      targetEquippedSlot: "equipped" as const,
    };
    expect(gmActionChecklistSchema.safeParse({
      ...result.checklist,
      steps: [{
        ...step,
        targetRefs: ["Player", "Brass Tube", "Market"],
        intended: {
          ...step.intended,
          itemTransferPlan: equipPlan,
        },
      }],
    }).success).toBe(true);
    expect(gmActionChecklistSchema.safeParse({
      ...result.checklist,
      steps: [{
        ...step,
        targetRefs: ["Player", "Brass Tube", "Market"],
        intended: {
          ...step.intended,
          itemTransferPlan: {
            ...equipPlan,
            targetEquippedSlot: null,
          },
        },
      }],
    }).success).toBe(false);
  });

  it("uses the current SceneFrame scene as item_transfer anchor even when GM Read omits the scene ref", async () => {
    const frame = itemTransferActionPlanFrame();
    const gmRead: GmRead = {
      ...itemTransferGmRead(frame),
      evidenceRefs: ["Player", "Brass Tube", "Guide"],
      actionInterpretation: {
        ...itemTransferGmRead(frame).actionInterpretation,
        targetRefs: ["Brass Tube", "Guide"],
        itemTransferNeed: {
          ...itemTransferGmRead(frame).actionInterpretation.itemTransferNeed!,
          evidenceRefs: ["Player", "Brass Tube", "Guide"],
        },
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Brass Tube", "Guide"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Item transfer needs a clean item_transfer receipt before narration.",
        evidenceRefs: ["Player", "Brass Tube", "Guide"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("accepted");
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-item-transfer-implicit-scene",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]?.targetRefs).toEqual(["Brass Tube", "Guide", "Market"]);
    expect(result.checklist.steps[0]?.intended.itemTransferPlan?.anchorRef).toBe("Market");
    expect(result.checklist.steps[0]?.intended.itemTransferPlan?.anchorRef).not.toBe("Brass Tube");
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically splits compound item transfer plus visible dialogue with item_transfer_state refresh binding", async () => {
    const frame = itemTransferActionPlanFrame({
      playerAction: "I hand the Brass Tube to Guide and ask what it is.",
    });
    const gmRead: GmRead = {
      ...itemTransferGmRead(frame),
      liveSceneQuestion: "Which item state must settle before Guide can visibly answer?",
      actionInterpretation: {
        ...itemTransferGmRead(frame).actionInterpretation,
        summary: "The player hands Brass Tube to Guide and asks a question.",
        playerIntent: "Hand Brass Tube to Guide, then ask what it is.",
        method: "hand and ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Brass Tube", "Guide"],
      evidenceRefs: ["Player", "Market", "Brass Tube", "Guide"],
      checkRationale: "The item state must settle before dependent visible dialogue can be recorded.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Compound item transfer and dialogue need backend receipts with refreshed frame binding.",
        evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("accepted");
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-item-transfer-dialogue",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual([
      "item_transfer",
      "dialogue_record",
    ]);
    expect(result.checklist.steps[0]).toMatchObject({
      stepId: "step-1",
      intended: {
        kind: "item_transfer",
        requiredCapabilityId: "item_transfer",
        itemTransferPlan: {
          operation: "give_to_visible_actor",
          itemRef: "Brass Tube",
          targetRef: "Guide",
        },
      },
    });
    expect(result.checklist.steps[1]).toMatchObject({
      stepId: "step-2",
      purpose: "Record Guide's direct visible response to Player intent after prior state-bearing steps settle: Hand Brass Tube to Guide, then ask what it is.",
      targetRefs: ["Guide"],
      dependsOnStepIds: ["step-1"],
      dependencyBindings: [{
        bindingId: "item_transfer_state",
        fromStepId: "step-1",
        requiredCapabilityId: "item_transfer",
        requiredReceiptAuthority: "item_transfer_receipt",
        sourcePath: "publicResult.itemTransfer",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "item_state_reconciled",
      }],
      intended: {
        kind: "dialogue_record",
        requiredCapabilityId: "dialogue_record",
        stateOrEvidence: "terminal_player_visible",
        summary: "Stage 4 must request one dialogue_record for Guide's direct response after the post-dependency authoritative SceneFrame reflects accepted Player local condition, item state, or minor place-handle requirements. The accepted receipt proves visible response content only.",
        dialoguePlan: {
          speakerSource: "existing_visible_actor",
          speakerRef: "Guide",
          playerIntent: "Hand Brass Tube to Guide, then ask what it is",
          responseScope: "visible_speaker_response_only",
        },
      },
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically produces minor_poi_create checklist for a current-scene place handle", async () => {
    const frame = minorPoiActionPlanFrame();
    const gmRead = minorPoiGmRead(frame);
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Minor POI handle creation needs a clean minor_poi_create receipt before narration.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("accepted");
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-minor-poi",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      intended: {
        kind: "minor_poi_create",
        requiredCapabilityId: "minor_poi_create",
        stateOrEvidence: "state",
        minorPoiPlan: {
          actorRef: "Player",
          placeLabel: "Tea Stall",
          placeKind: "stall",
          anchorRef: "Market",
          reusePolicy: "reuse_matching_current_scene_place_handle_or_create",
        },
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("blocks minor_poi_create action-plan admission when the SceneFrame lacks the place-handle surface", () => {
    const frame = minorPoiActionPlanFrame({
      currentScenePlaceHandleSurface: undefined,
    });
    const gmRead = minorPoiGmRead(frame);
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "This should not admit without a current place-handle surface.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("rejected");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("rejected");
  });

  it("deterministically splits minor_poi_create plus visible dialogue with minor_poi_handle refresh binding", async () => {
    const frame = minorPoiActionPlanFrame({
      playerAction: "I point out the tea stall and ask Guide to watch it.",
    });
    const gmRead: GmRead = {
      ...minorPoiGmRead(frame),
      liveSceneQuestion: "Which visible place handle must settle before Guide can visibly answer?",
      actionInterpretation: {
        ...minorPoiGmRead(frame).actionInterpretation,
        summary: "The player points out Tea Stall and asks Guide to watch it.",
        playerIntent: "Point out Tea Stall, then ask Guide to watch it.",
        method: "point and ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Guide", "Market"],
      evidenceRefs: ["Player", "Guide", "Market"],
      checkRationale: "The place handle must settle before dependent visible dialogue can be recorded.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Compound minor POI handle and dialogue need backend receipts with refreshed frame binding.",
        evidenceRefs: ["Player", "Guide", "Market"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("accepted");
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-minor-poi-dialogue",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual([
      "minor_poi_create",
      "dialogue_record",
    ]);
    expect(result.checklist.steps[1]).toMatchObject({
      dependsOnStepIds: ["step-1"],
      dependencyBindings: [{
        bindingId: "minor_poi_handle",
        fromStepId: "step-1",
        requiredCapabilityId: "minor_poi_create",
        requiredReceiptAuthority: "minor_poi_handle_receipt",
        sourcePath: "publicResult.minorPoi",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "targets_and_citableRefs",
      }],
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically produces only support_actor_create for ordinary support actor needs", async () => {
    const frame = actionPlanFrame({
      playerAction: "I look for a local vendor in the market.",
      citableRefs: ["Player", "Market", "North Hall"],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      focalRefs: ["Player"],
      evidenceRefs: ["Player", "Market"],
      liveSceneQuestion: "Can one ordinary local vendor be materialized in the current scene?",
      actionInterpretation: {
        summary: "The player looks for an ordinary local vendor.",
        playerIntent: "Find a local vendor.",
        method: "look for",
        targetRefs: ["Market"],
        interactionKind: "ordinary_support_actor_needed",
        supportActorNeed: {
          roleKind: "vendor",
          requestedRoleText: "local vendor",
          currentScenePlausibility: "ordinary_local_role",
          intendedUse: "presence_only",
          evidenceRefs: ["Player", "Market"],
        },
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Ordinary support actor materialization needs a receipt before narration.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-support-actor",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps).toHaveLength(1);
    expect(result.checklist.steps[0]).toMatchObject({
      actorRef: "Player",
      targetRefs: ["Market"],
      intended: {
        kind: "support_actor_create",
        requiredCapabilityId: "support_actor_create",
        stateOrEvidence: "state",
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
      },
    });
    expect(result.checklist.steps.map((step) => step.intended.kind)).not.toContain("dialogue_record");
    expect(result.checklist.steps[0]?.intended.summary).toContain("roleKind=vendor");
  });

  it("deterministically composes support actor materialization into refreshed dependent dialogue planning", async () => {
    const frame = actionPlanFrame({
      playerAction: "I ask a local vendor what changed today.",
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
        { capabilityId: "support_actor_create", evidenceAuthority: "terminal_receipt_required", allowed: true },
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      focalRefs: ["Player"],
      evidenceRefs: ["Player", "Market"],
      liveSceneQuestion: "Can one ordinary local vendor be materialized, then answer after refresh?",
      actionInterpretation: {
        summary: "The player asks an ordinary local vendor a question, but no vendor is visible yet.",
        playerIntent: "Ask a local vendor what changed today.",
        method: "ask",
        targetRefs: ["Market"],
        interactionKind: "ordinary_support_actor_needed",
        supportActorNeed: {
          roleKind: "vendor",
          requestedRoleText: "local vendor",
          currentScenePlausibility: "ordinary_local_role",
          intendedUse: "dialogue_requested_but_not_yet_recorded",
          evidenceRefs: ["Player", "Market"],
        },
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Support actor materialization and dependent dialogue require backend receipts.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-support-dialogue",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual([
      "support_actor_create",
      "dialogue_record",
    ]);
    expect(result.checklist.steps[1]).toMatchObject({
      stepId: "step-2",
      actorRef: "Player",
      targetRefs: ["Market"],
      dependsOnStepIds: ["step-1"],
      dependencyBindings: [{
        bindingId: "materialized_speaker",
        fromStepId: "step-1",
        requiredCapabilityId: "support_actor_create",
        requiredReceiptAuthority: "support_actor_materialization_receipt",
        sourcePath: "publicResult.supportActor.actorRef",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "actors_and_citableRefs",
      }],
      intended: {
        kind: "dialogue_record",
        requiredCapabilityId: "dialogue_record",
        stateOrEvidence: "terminal_player_visible",
        dialoguePlan: {
          speakerSource: "materialized_support_actor",
          speakerRef: null,
          materializedSpeakerBindingId: "materialized_speaker",
          playerIntent: "Ask a local vendor what changed today",
          responseScope: "visible_speaker_response_only",
        },
      },
    });
    expect(result.checklist.steps[1]?.targetRefs).not.toContain("Local Vendor");
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("prioritizes ordinary support actor planning over wait-like wording in a support request", async () => {
    const frame = actionPlanFrame({
      playerAction: "I call over a local market guide and say, \"Please watch the small tea stall while I sort my courier tube.\"",
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
        { capabilityId: "support_actor_create", evidenceAuthority: "terminal_receipt_required", allowed: true },
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
        { capabilityId: "time_advance", evidenceAuthority: "receipt_required", allowed: true },
      ],
      targets: [{ ref: "small_tea_stall", label: "small tea stall", kind: "place_handle" }],
      citableRefs: ["Player", "Market", "North Hall", "small_tea_stall"],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      focalRefs: ["Player", "small_tea_stall"],
      evidenceRefs: ["Player", "Market", "small_tea_stall"],
      liveSceneQuestion: "Can one ordinary local guide be materialized, then respond after refresh?",
      actionInterpretation: {
        summary: "The player calls over an ordinary local guide and asks them to watch a visible current-scene place handle.",
        playerIntent: "Call over a local market guide and ask them to watch the small tea stall.",
        method: "call over and ask",
        targetRefs: ["Market", "small_tea_stall"],
        interactionKind: "ordinary_support_actor_needed",
        supportActorNeed: {
          roleKind: "guide",
          requestedRoleText: "local market guide",
          currentScenePlausibility: "ordinary_local_role",
          intendedUse: "dialogue_requested_but_not_yet_recorded",
          evidenceRefs: ["Player", "Market", "small_tea_stall"],
        },
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Market", "small_tea_stall"],
      evidenceRefs: ["Player", "Market", "small_tea_stall"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Support actor materialization and dependent dialogue require backend receipts.",
        evidenceRefs: ["Player", "Market", "small_tea_stall"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("accepted");
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-support-watch-dialogue",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual([
      "support_actor_create",
      "dialogue_record",
    ]);
    expect(result.checklist.steps.map((step) => step.intended.kind)).not.toContain("time_advance");
    expect(result.checklist.steps[1]).toMatchObject({
      dependsOnStepIds: ["step-1"],
      dependencyBindings: [{
        bindingId: "materialized_speaker",
        fromStepId: "step-1",
        requiredCapabilityId: "support_actor_create",
        requiredReceiptAuthority: "support_actor_materialization_receipt",
        sourcePath: "publicResult.supportActor.actorRef",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "actors_and_citableRefs",
      }],
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("deterministically splits Player local condition before visible dialogue with post-condition SceneFrame refresh binding", async () => {
    const frame = actionPlanFrame({
      playerAction: "I kneel and ask Guide what they see.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      capabilities: [
        { capabilityId: "condition_set", evidenceAuthority: "receipt_required", allowed: true },
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "Guide"],
    });
    const gmRead: GmRead = {
      ...actionPlanGmRead(frame),
      focalRefs: ["Player", "Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      liveSceneQuestion: "What backend-owned Player local condition must settle before visible dialogue?",
      actionInterpretation: {
        summary: "The player kneels, then asks the visible Guide a question.",
        playerIntent: "Kneel and ask Guide what they see.",
        method: "kneel and ask",
        targetRefs: ["Guide"],
        interactionKind: "visible_actor_dialogue",
        supportActorNeed: null,
        localConditionNeed: {
          actorRef: "Player",
          operation: "apply",
          conditionKey: "kneeling",
          requestedPostureText: "kneel",
          targetKind: "current_scene",
          targetRef: "Market",
          evidenceRefs: ["Player", "Market"],
        },
      },
    };
    const judgment: JudgeUncertainty = {
      ...actionPlanJudge(frame, gmRead),
      actorRefs: ["Player"],
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Market", "Guide"],
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "The posture change needs a condition receipt before dialogue runs.",
        evidenceRefs: ["Player", "Market", "Guide"],
      },
    };

    expect(validateGmReadCandidate({ frame, candidate: gmRead }).status).toBe("accepted");
    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate: judgment }).status).toBe("accepted");
    const result = await runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-condition-dialogue",
    });

    expect(result.status).toBe("accepted");
    if (result.status !== "accepted") throw new Error("expected accepted");
    expect(result.checklist.steps.map((step) => step.intended.kind)).toEqual([
      "condition_set",
      "dialogue_record",
    ]);
    expect(result.checklist.steps[0]).toMatchObject({
      stepId: "step-1",
      intended: {
        kind: "condition_set",
        requiredCapabilityId: "condition_set",
        stateOrEvidence: "state",
        localConditionPlan: {
          actorRef: "Player",
          operation: "apply",
          conditionKey: "kneeling",
          conditionScope: "current_scene",
          anchorRef: "Market",
          targetKind: "current_scene",
          targetRef: "Market",
          replacementPolicy: "replace_same_condition_group",
        },
      },
    });
    expect(result.checklist.steps[1]).toMatchObject({
      stepId: "step-2",
      targetRefs: ["Guide"],
      dependsOnStepIds: ["step-1"],
      dependencyBindings: [{
        bindingId: "player_local_condition",
        fromStepId: "step-1",
        requiredCapabilityId: "condition_set",
        requiredReceiptAuthority: "player_local_condition_receipt",
        sourcePath: "publicResult.condition.conditionKey",
        resolveIn: "post_dependency_scene_frame",
        requiredFramePresence: "player_visibleStatus.conditions",
      }],
      intended: {
        kind: "dialogue_record",
        requiredCapabilityId: "dialogue_record",
        stateOrEvidence: "terminal_player_visible",
        dialoguePlan: {
          speakerSource: "existing_visible_actor",
          speakerRef: "Guide",
          playerIntent: "Kneel and ask Guide what they see",
          responseScope: "visible_speaker_response_only",
        },
      },
    });
    expect(validateGmActionChecklistCandidate({ frame, gmRead, judgment, candidate: result.checklist }).status)
      .toBe("accepted");
  });

  it("rejects deterministic checklist compile when backend capability is missing", async () => {
    const frame = actionPlanFrame({
      playerAction: "I move toward North Hall.",
      capabilities: [
        { capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true },
      ],
    });
    const gmRead = actionPlanGmRead(frame);
    const judgment = actionPlanJudge(frame, gmRead);
    await expect(runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-generated",
    })).rejects.toThrow(CleanGmActionChecklistValidationError);

    await expect(runCleanGmActionChecklist({
      frame,
      gmRead,
      judgment,
      checklistId: "gm-action-checklist-generated",
    })).rejects.toThrow("Clean GM Action Checklist deterministic compile failed validation.");
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
  it("requires P65 dialogue effects to record visible response content exactly", () => {
    const base = {
      kind: "dialogue_record" as const,
      authorityKind: "existing_visible_actor" as const,
      speakerRef: "Guide",
      addresseeRefs: ["Player"],
      outcomeKind: "answer" as const,
      response: {
        kind: "speech" as const,
        quotedSpeech: "The north stairs are flooded.",
        summary: "Guide says the north stairs are flooded.",
      },
      languageBasis: {
        responseLanguage: "match_player_action" as const,
        source: "turn_language_profile" as const,
      },
      evidenceRefs: ["Player", "Guide"],
      stateEffects: { appliesState: false as const },
    };

    expect(cleanStage4DialogueRequestEffectSchema.safeParse(base).success).toBe(true);
    expect(cleanStage4DialogueRequestEffectSchema.safeParse({
      ...base,
      response: { ...base.response, quotedSpeech: null },
    }).success).toBe(false);
    expect(cleanStage4DialogueRequestEffectSchema.safeParse({
      ...base,
      outcomeKind: "silence",
      response: { kind: "silence", quotedSpeech: "No.", summary: "Guide stays silent." },
    }).success).toBe(false);
  });

  it("requires P66 support actor effects to stay bounded to ordinary current-scene materialization", () => {
    const frame = actionPlanFrame({
      playerAction: "I look for a local vendor in the market.",
      citableRefs: ["Player", "Market", "North Hall"],
      privateGuards: {
        forbiddenActorLabels: ["Hidden Patron"],
        forbiddenPrivateTerms: [],
      },
    });
    const supportStep: GmActionChecklist["steps"][number] = {
      ...validActionChecklist(frame).steps[0],
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        ...validActionChecklist(frame).steps[0].intended,
        kind: "support_actor_create",
        requiredCapabilityId: "support_actor_create",
        stateOrEvidence: "state",
        supportActorPlan: {
          actorRef: "Player",
          roleKind: "vendor",
          requestedRoleText: "local vendor",
          anchorRef: "Market",
          intendedUse: "presence_only",
          reusePolicy: "reuse_matching_temporary_current_scene_or_create",
        },
      },
    };
    const base = {
      kind: "support_actor_create" as const,
      authorityKind: "ordinary_current_scene_support_actor" as const,
      anchorScope: "current_scene" as const,
      anchorRef: "Market",
      roleKind: "vendor" as const,
      roleLabel: "vendor",
      publicPresentation: {
        publicSummary: "An ordinary local vendor is available in the market.",
        visibleCue: "The local vendor is close enough to be visible.",
        voiceHint: null,
      },
      identityBounds: {
        tier: "temporary" as const,
        persistence: "current_scene" as const,
        significance: "minor_support" as const,
        agency: "reactive_only" as const,
        mayBecomePersistentHere: false as const,
      },
      reusePolicy: "reuse_matching_temporary_current_scene_or_create" as const,
      reason: "The player requested an ordinary local vendor.",
      evidenceRefs: ["Player", "Market"],
      forbiddenPayloads: {
        dialogueContent: false as const,
        worldFact: false as const,
        relationship: false as const,
        itemState: false as const,
        routeTruth: false as const,
        futureRelevance: false as const,
        privateKnowledge: false as const,
      },
    };

    expect(cleanStage4SupportActorCreateEffectSchema.safeParse(base).success).toBe(true);
    expect(validateSupportActorRequestEffectCandidate({
      frame,
      step: supportStep,
      candidate: base,
    }).status).toBe("accepted");
    expect(cleanStage4SupportActorCreateEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, dialogueContent: true },
    }).success).toBe(false);
    expect(validateSupportActorRequestEffectCandidate({
      frame,
      step: supportStep,
      candidate: { ...base, anchorRef: "North Hall" },
    }).status).toBe("rejected");
    expect(validateSupportActorRequestEffectCandidate({
      frame,
      step: supportStep,
      candidate: {
        ...base,
        publicPresentation: {
          ...base.publicPresentation,
          publicSummary: "Hidden Patron is available.",
        },
      },
    }).status).toBe("rejected");
  });

  it("requires P68 condition_set effects to stay bounded to Player current-scene local posture/readiness", () => {
    const base = {
      kind: "condition_set" as const,
      authorityKind: "current_scene_player_local_condition" as const,
      actorRef: "Player" as const,
      conditionScope: "current_scene" as const,
      anchorRef: "Market",
      operation: "apply" as const,
      conditionKey: "kneeling" as const,
      target: {
        targetKind: "current_scene" as const,
        targetRef: "Market",
      },
      replacementPolicy: "replace_same_condition_group" as const,
      evidenceRefs: ["Player", "Market"],
      forbiddenPayloads: {
        hpDelta: false as const,
        damage: false as const,
        healing: false as const,
        combatModifier: false as const,
        stealthSuccess: false as const,
        coverEffectiveness: false as const,
        itemCustody: false as const,
        itemLocation: false as const,
        itemEquipState: false as const,
        itemMutation: false as const,
        movement: false as const,
        routeTruth: false as const,
        worldFact: false as const,
        relationship: false as const,
        dialogueContent: false as const,
        npcCondition: false as const,
        privateKnowledge: false as const,
        absenceOrNoChange: false as const,
      },
    };

    expect(cleanStage4LocalConditionSetEffectSchema.safeParse(base).success).toBe(true);
    expect(cleanStage4LocalConditionSetEffectSchema.safeParse({
      ...base,
      toolId: "actor.condition_set.v2",
    }).success).toBe(false);
    expect(cleanStage4LocalConditionSetEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, hpDelta: true },
    }).success).toBe(false);
    expect(cleanStage4LocalConditionSetEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, dialogueContent: true },
    }).success).toBe(false);
    expect(cleanStage4LocalConditionSetEffectSchema.safeParse({
      ...base,
      actorRef: "Guide",
    }).success).toBe(false);
    expect(cleanStage4LocalConditionSetEffectSchema.safeParse({
      ...base,
      conditionKey: "poisoned",
    }).success).toBe(false);
  });

  it("requires P69 item_transfer effects to stay bounded to Player current-scene item state", () => {
    const base = {
      kind: "item_transfer" as const,
      authorityKind: "player_current_scene_item_state_transition" as const,
      actorRef: "Player" as const,
      operation: "give_to_visible_actor" as const,
      itemRef: "Brass Tube",
      source: {
        sourceKind: "player_inventory" as const,
        requiredOwner: "Player" as const,
        requiredLocation: "none" as const,
        requiredEquipState: null,
      },
      target: {
        targetKind: "visible_actor" as const,
        targetRef: "Guide",
        targetEquipState: "carried" as const,
        targetEquippedSlot: null,
      },
      anchorRef: "Market",
      evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      forbiddenPayloads: {
        itemCreation: false as const,
        itemDiscovery: false as const,
        itemInspection: false as const,
        itemUseOrActivation: false as const,
        itemDamageOrRepair: false as const,
        containerContents: false as const,
        currencyOrBarter: false as const,
        npcConsentOrReaction: false as const,
        relationship: false as const,
        worldFact: false as const,
        routeTruth: false as const,
        locationReveal: false as const,
        hpOrCondition: false as const,
        dialogueContent: false as const,
        privateKnowledge: false as const,
        absenceOrNoChange: false as const,
      },
    };

    expect(cleanStage4ItemTransferEffectSchema.safeParse(base).success).toBe(true);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...base,
      toolId: "item.transfer.v2",
    }).success).toBe(false);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...base,
      actorRef: "Guide",
    }).success).toBe(false);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, npcConsentOrReaction: true },
    }).success).toBe(false);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, itemDiscovery: true },
    }).success).toBe(false);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...base,
      target: { ...base.target, targetEquippedSlot: "backpack" },
    }).success).toBe(false);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...base,
      target: { ...base.target, targetEquippedSlot: "equipped" },
    }).success).toBe(false);
    const equipBase = {
      ...base,
      operation: "equip_inventory_item" as const,
      target: {
        ...base.target,
        targetKind: "player_equipment" as const,
        targetRef: "Player",
        targetEquipState: "equipped" as const,
        targetEquippedSlot: "equipped" as const,
      },
    };
    expect(cleanStage4ItemTransferEffectSchema.safeParse(equipBase).success).toBe(true);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...equipBase,
      target: { ...equipBase.target, targetEquippedSlot: null },
    }).success).toBe(false);
    expect(cleanStage4ItemTransferEffectSchema.safeParse({
      ...equipBase,
      target: { ...equipBase.target, targetEquipState: "carried" },
    }).success).toBe(false);
  });

  it("requires P70 local_observation effects to stay bounded to exposed current SceneFrame surfaces", () => {
    const base = {
      kind: "local_observation" as const,
      authorityKind: "current_scene_observation_surface" as const,
      actorRef: "Player" as const,
      anchorRef: "Market",
      mode: "target_match" as const,
      queryText: "Guide",
      targetRef: "Guide",
      surfaceKinds: ["visible_actor", "visible_target"] as const,
      allowBoundedNegative: true,
      evidenceRefs: ["Player", "Market", "Guide"],
      forbiddenPayloads: {
        hiddenDiscovery: false as const,
        concealedSearch: false as const,
        broadAbsence: false as const,
        itemUseOrActivation: false as const,
        itemStateChange: false as const,
        phoneOrDeviceStatus: false as const,
        routeTruth: false as const,
        locationReveal: false as const,
        worldFact: false as const,
        dialogueContent: false as const,
        privateKnowledge: false as const,
        mutation: false as const,
      },
    };

    expect(cleanStage4LocalObservationEffectSchema.safeParse(base).success).toBe(true);
    expect(cleanStage4LocalObservationEffectSchema.safeParse({
      ...base,
      toolId: "search_area.v2",
    }).success).toBe(false);
    expect(cleanStage4LocalObservationEffectSchema.safeParse({
      ...base,
      actorRef: "Guide",
    }).success).toBe(false);
    expect(cleanStage4LocalObservationEffectSchema.safeParse({
      ...base,
      surfaceKinds: ["hidden_clue"],
    }).success).toBe(false);
    expect(cleanStage4LocalObservationEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, broadAbsence: true },
    }).success).toBe(false);
    expect(cleanStage4LocalObservationEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, phoneOrDeviceStatus: true },
    }).success).toBe(false);
  });

  it("requires P71 device_surface_observation effects to stay bounded to modeled public device surfaces", () => {
    const base = {
      kind: "device_surface_observation" as const,
      authorityKind: "current_frame_device_status_surface" as const,
      actorRef: "Player" as const,
      anchorRef: "Market",
      deviceRef: "Burner phone",
      requestedDeviceText: "Burner phone",
      requestedFacetText: "screen and signal indicator",
      facetKinds: ["screen_state", "signal_indicator"] as const,
      allowNoSurface: true,
      evidenceRefs: ["Player", "Market", "Burner phone"],
      forbiddenPayloads: {
        privateMessageContents: false as const,
        messageOrCallGeneration: false as const,
        networkSimulation: false as const,
        hackingOrDecryption: false as const,
        itemUseOrActivation: false as const,
        itemStateChange: false as const,
        routeTruth: false as const,
        locationReveal: false as const,
        worldFact: false as const,
        dialogueContent: false as const,
        privateKnowledge: false as const,
        mutation: false as const,
        absenceOrNoChange: false as const,
      },
    };

    expect(cleanStage4DeviceSurfaceObservationEffectSchema.safeParse(base).success).toBe(true);
    expect(cleanStage4DeviceSurfaceObservationEffectSchema.safeParse({
      ...base,
      actorRef: "Guide",
    }).success).toBe(false);
    expect(cleanStage4DeviceSurfaceObservationEffectSchema.safeParse({
      ...base,
      facetKinds: ["private_message_body"],
    }).success).toBe(false);
    expect(cleanStage4DeviceSurfaceObservationEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, privateMessageContents: true },
    }).success).toBe(false);
    expect(cleanStage4DeviceSurfaceObservationEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, networkSimulation: true },
    }).success).toBe(false);
    expect(cleanStage4DeviceSurfaceObservationEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, absenceOrNoChange: true },
    }).success).toBe(false);
  });

  it("requires P72 minor_poi_create effects to stay bounded to current-scene visible place handles", () => {
    const base = {
      kind: "minor_poi_create" as const,
      authorityKind: "current_scene_visible_place_handle_create" as const,
      actorRef: "Player" as const,
      anchorRef: "Market",
      placeLabel: "Tea Stall",
      placeKind: "stall" as const,
      reusePolicy: "reuse_matching_current_scene_place_handle_or_create" as const,
      evidenceRefs: ["Player", "Market"],
      forbiddenPayloads: {
        actorCreation: false as const,
        servicesOrInventory: false as const,
        routeTruth: false as const,
        locationReveal: false as const,
        movementDestination: false as const,
        businessFact: false as const,
        readableText: false as const,
        hiddenDiscovery: false as const,
        absenceOrNoChange: false as const,
        dialogueContent: false as const,
        worldFact: false as const,
        privateKnowledge: false as const,
      },
    };

    expect(cleanStage4MinorPoiCreateEffectSchema.safeParse(base).success).toBe(true);
    expect(cleanStage4MinorPoiCreateEffectSchema.safeParse({
      ...base,
      actorRef: "Guide",
    }).success).toBe(false);
    expect(cleanStage4MinorPoiCreateEffectSchema.safeParse({
      ...base,
      authorityKind: "location_reveal",
    }).success).toBe(false);
    expect(cleanStage4MinorPoiCreateEffectSchema.safeParse({
      ...base,
      placeKind: "district",
    }).success).toBe(false);
    expect(cleanStage4MinorPoiCreateEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, routeTruth: true },
    }).success).toBe(false);
    expect(cleanStage4MinorPoiCreateEffectSchema.safeParse({
      ...base,
      forbiddenPayloads: { ...base.forbiddenPayloads, readableText: true },
    }).success).toBe(false);
  });

  it("accepts non-mutating terminal dialogue receipts with quote-only authority", () => {
    const frame = actionPlanFrame({
      playerAction: "RAW_CONTRACT_DIALOGUE_MARKER_NEVER_PROMPT",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      citableRefs: ["Player", "Market", "Guide", "North Hall"],
    });
    const checklist = {
      ...validActionChecklist(frame),
      steps: [{
        ...validActionChecklist(frame).steps[0],
        targetRefs: ["Guide"],
        evidenceRefs: ["Player", "Guide"],
        intended: {
          ...validActionChecklist(frame).steps[0].intended,
          kind: "dialogue_record" as const,
          requiredCapabilityId: "dialogue_record" as const,
          stateOrEvidence: "terminal_player_visible" as const,
          dialoguePlan: {
            actorRef: "Player" as const,
            speakerSource: "existing_visible_actor" as const,
            speakerRef: "Guide",
            materializedSpeakerBindingId: null,
            addresseeRef: "Player" as const,
            playerIntent: "Ask Guide about the Courier satchel",
            responseScope: "visible_speaker_response_only" as const,
          },
        },
      }],
    };
    const receipt = cleanStage4ReceiptSchema.parse({
      ...acceptedMovementReceipt(frame, checklist),
      receiptId: "stage4-receipt-dialogue",
      requestId: "stage4-request-dialogue",
      capabilityId: "dialogue_record",
      result: { ...frame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "terminal_dialogue_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_quote_visible_dialogue_response",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "Guide dialogue response (answer): Guide says the north stairs are flooded. Quote: The north stairs are flooded.",
        visibleRefs: ["Player", "Guide"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: {
          type: "dialogue_response",
          authorityKind: "existing_visible_actor",
          speakerLabel: "Guide",
          addresseeLabels: ["Mira Voss"],
          outcomeKind: "answer",
          quotedSpeech: "The north stairs are flooded.",
          summary: "Guide says the north stairs are flooded.",
          responseLanguage: "match_player_action",
          claimStatus: "visible_speaker_response_only",
        },
      },
      privateResult: {
        playerId: null,
        fromLocationId: null,
        destinationLocationId: null,
        edgeIds: [],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
      failure: null,
    });

    expect(receipt.authority.evidenceAuthority).toBe("terminal_dialogue_receipt");
    expect(receipt.result).toMatchObject({ ...frame.base, mutationApplied: false });
    expect(receipt.publicResult.dialogue?.claimStatus).toBe("visible_speaker_response_only");
  });

  it("keeps item-custody dialogue prompts holder-grounded without rich scene prose", () => {
    const frame = actionPlanFrame({
      playerAction: 'I ask Guide, "Do you have the Courier satchel now?"',
      scene: {
        currentLocation: {
          ref: "Market",
          label: "Market",
          description: "A checkpoint where guards seize brass courier gear and log contents.",
        },
        currentScene: {
          ref: "Market",
          label: "Market",
          description: "A checkpoint where guards seize brass courier gear and log contents.",
        },
        visibleFacts: [{
          factId: "visible-fact-1",
          summary: "Guards log contents before releasing courier gear.",
          source: "test",
          tick: null,
        }],
        recentLocalFacts: [{
          factId: "recent-fact-1",
          summary: "A guard seized a satchel here earlier.",
          source: "test",
          tick: null,
        }],
      },
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [
        { ref: "Guide", label: "Guide", kind: "actor" },
        {
          ref: "Courier satchel",
          label: "Courier satchel",
          kind: "item",
          holder: {
            holderKind: "visible_actor",
            holderLabel: "Guide",
            equipState: "carried",
          },
        },
      ],
      citableRefs: ["Player", "Market", "Guide", "Courier satchel"],
    });
    const checklist = {
      ...validActionChecklist(frame),
      steps: [{
        ...validActionChecklist(frame).steps[0],
        targetRefs: ["Guide", "Courier satchel"],
        evidenceRefs: ["Player", "Guide", "Courier satchel"],
        intended: {
          ...validActionChecklist(frame).steps[0].intended,
          kind: "dialogue_record" as const,
          requiredCapabilityId: "dialogue_record" as const,
          stateOrEvidence: "terminal_player_visible" as const,
          dialoguePlan: {
            actorRef: "Player" as const,
            speakerSource: "existing_visible_actor" as const,
            speakerRef: "Guide",
            materializedSpeakerBindingId: null,
            addresseeRef: "Player" as const,
            playerIntent: "Ask Guide about the Courier satchel",
            responseScope: "visible_speaker_response_only" as const,
          },
        },
      }],
    };

    const prompt = buildStage4DialogueRequestPrompt({
      frame,
      step: checklist.steps[0],
    });
    const system = buildStage4DialogueRequestSystemPrompt();

    expect(prompt).toContain("Dialogue task card:");
    expect(prompt).toContain('"dialoguePlan"');
    expect(prompt).toContain('"playerIntent": "Ask Guide about the Courier satchel"');
    expect(prompt).not.toContain("RAW_CONTRACT_DIALOGUE_MARKER_NEVER_PROMPT");
    expect(prompt).not.toContain('"playerRequest"');
    expect(prompt).toContain('"currentItemHolders"');
    expect(prompt).toContain('"currentHolderKind": "visible_actor"');
    expect(prompt).toContain('"currentHolderLabel": "Guide"');
    expect(prompt).toContain('"currentEquipState": "carried"');
    expect(prompt).not.toContain("guards seize brass courier gear");
    expect(prompt).not.toContain("Guards log contents before releasing courier gear.");
    expect(prompt).not.toContain("A guard seized a satchel here earlier.");
    expect(system).toContain("Dialogue task card as the job contract");
    expect(system).toContain("dialoguePlan");
    expect(system).toContain("currentItemHolders is the complete evidence basis");
    expect(system).toContain("dialogue stores visible response content");
  });

  it("accepts support actor materialization receipts with created/reused mutation authority split", () => {
    const frame = actionPlanFrame();
    const checklist = {
      ...validActionChecklist(frame),
      steps: [{
        ...validActionChecklist(frame).steps[0],
        targetRefs: ["Market"],
        evidenceRefs: ["Player", "Market"],
        intended: {
          ...validActionChecklist(frame).steps[0].intended,
          kind: "support_actor_create" as const,
          requiredCapabilityId: "support_actor_create" as const,
          stateOrEvidence: "state" as const,
        },
      }],
    };
    const baseReceipt = {
      ...acceptedMovementReceipt(frame, checklist),
      receiptId: "stage4-receipt-support-actor",
      requestId: "stage4-request-support-actor",
      capabilityId: "support_actor_create",
      result: { ...frame.base, worldVersion: frame.base.worldVersion + 1, mutationApplied: true },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "current_scene_support_actor",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: true,
      },
      publicResult: {
        summary: "Local Vendor is materialized as a vendor in Market.",
        visibleRefs: ["Player", "Market", "Local Vendor"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
        supportActor: {
          type: "support_actor_materialization",
          resultKind: "created",
          actorRef: "Local Vendor",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
          roleLabel: "vendor",
          anchorSceneLabel: "Market",
          anchorLocationLabel: "Market",
          publicSummary: "An ordinary local vendor is available in the market.",
          visibleCue: null,
          identityBounds: {
            tier: "temporary",
            persistence: "current_scene",
            significance: "minor_support",
            agency: "reactive_only",
          },
          claimStatus: "visible_support_actor_materialization_only",
        },
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: null,
        destinationLocationId: null,
        supportActorId: "npc-local-vendor",
        supportActorOperation: "inserted",
        anchorLocationId: "loc-market",
        anchorSceneLocationId: "loc-market",
        edgeIds: [],
        authorityTraceId: "stage4-authority-support",
        clockReceiptId: null,
        stateDeltaRefs: ["npc:npc-local-vendor:created", "scene:loc-market:support_actors"],
      },
      failure: null,
    };

    const created = cleanStage4ReceiptSchema.parse(baseReceipt);
    expect(created.publicResult.supportActor?.resultKind).toBe("created");
    expect(created.authority.mutationAuthority).toBe("current_scene_support_actor");

    const reused = cleanStage4ReceiptSchema.parse({
      ...baseReceipt,
      receiptId: "stage4-receipt-support-actor-reuse",
      result: { ...frame.base, mutationApplied: false },
      authority: {
        ...baseReceipt.authority,
        mutationAuthority: "none",
        mayAuthorizeMutation: false,
      },
      publicResult: {
        ...baseReceipt.publicResult,
        supportActor: {
          ...baseReceipt.publicResult.supportActor,
          resultKind: "reused",
        },
      },
      privateResult: {
        ...baseReceipt.privateResult,
        supportActorOperation: "reused",
        authorityTraceId: null,
        stateDeltaRefs: [],
      },
    });
    expect(reused.publicResult.supportActor?.resultKind).toBe("reused");
    expect(reused.result.worldVersion).toBe(frame.base.worldVersion);

    expect(cleanStage4ReceiptSchema.safeParse({
      ...baseReceipt,
      authority: { ...baseReceipt.authority, mutationAuthority: "none" },
    }).success).toBe(false);
  });

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
        dialogue: null,
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

  it("rejects Oracle adapter generation failure before settlement", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    await expect(runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-adapter-error",
      adapter: async () => {
        throw new Error("adapter offline");
      },
    })).rejects.toThrow(CleanOracleSettlementAdapterError);

    await expect(runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-adapter-error",
      adapter: async () => {
        throw new Error("adapter offline");
      },
    })).rejects.toThrow("Clean Oracle adapter failed before settlement");
  });

  it("rejects invalid Oracle adapter output before settlement", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    await expect(runCleanOracleSettlement({
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
    })).rejects.toThrow(CleanOracleSettlementAdapterError);

    await expect(runCleanOracleSettlement({
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
    })).rejects.toThrow("Clean Oracle adapter returned invalid output");
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

  it("stops before settled packet when admitted Oracle settlement is rejected", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const admitted = validOracleJudgeUncertainty(frame, gmRead);
    const judgment: JudgeUncertainty = {
      ...admitted,
      oracleAdmission: {
        ...admitted.oracleAdmission!,
        outcomeMeanings: {
          strong_hit: "The player arrives at Guide's hidden room.",
          weak_hit: "Guide visibly notices something.",
          miss: "Guide visibly reacts immediately.",
        },
      },
    };
    const events: CleanGameplayRuntimeEvent[] = [];
    const commits: Parameters<typeof fakeCommitTurn>[0][] = [];

    await expect((async () => {
      for await (const event of processCleanGameplayTurnFromInput({
        turn: validTurnInput(),
        judgeProvider: provider,
        buildFrame: async () => frame,
        gmReadCandidateGenerator: async () => gmRead,
        judgeUncertaintyCandidateGenerator: async () => judgment,
        oracleAdapter: async () => ({
          chance: 65,
          roll: 10,
          outcome: "strong_hit",
          reasoning: "Adapter resolved the admitted visible uncertainty.",
        }),
        runNarration: fakeRunNarration,
        commitTurn: async (input) => {
          commits.push(input);
          return fakeCommitTurn(input);
        },
      })) {
        events.push(event);
      }
    })()).rejects.toThrow(CleanGameplayRuntimeInvariantError);

    expect(events.map((event) =>
      event.type === "scene-settling" && typeof event.data === "object" && event.data
        ? (event.data as { stage?: unknown }).stage
        : event.type
    )).toEqual([
      "scene-frame",
      "gm-read",
      "judge-uncertainty",
      "oracle-roll",
    ]);
    expect(events.some((event) => event.type === "oracle_result")).toBe(false);
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(commits).toEqual([]);
  });
});
