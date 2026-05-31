import { describe, it, expect, expectTypeOf, vi, beforeEach, type Mock } from "vitest";

// -- Mocks --------------------------------------------------------------------

const {
  logEventMock,
  logInfoMock,
  logWarnMock,
  logErrorMock,
  resolveDueWorldWorkForScopeMock,
  resolveDueWorldThreadWorkForScopeMock,
  runRequiredActorDecisionPassMock,
  readWorldClockMock,
  syncWorldClockTurnBoundaryMock,
  assertNoPendingNarrationBeforeNewTurnMock,
  claimTurnSagaWorkerMock,
  createTurnSagaMock,
  getSettledTurnPacketMock,
  getTurnSagaMock,
  findLatestSuccessfulNarratorAttemptMock,
  hasPreparedSettledTurnPacketRecoveryMock,
  heartbeatTurnSagaWorkerMock,
  assertTurnAuthorityStagesCompleteMock,
  markTurnSagaFinalizedMock,
  markTurnSagaFinalizedIfNeededMock,
  mergeTurnSagaProvenanceMock,
  persistOracleDecisionMock,
  persistSettledTurnPacketMock,
  recordPreparedSettledTurnPacketMock,
  recordTurnAuthorityStageMock,
  retractActorKnowledgeRecordMock,
  recordNarratorAttemptMock,
  releaseTurnSagaWorkerMock,
  retractReflectionBudgetMock,
  retractStoredEpisodicEventMock,
  transitionTurnSagaStatusMock,
  updateNarratorAttemptOutcomeMock,
  recoverSettledTurnPacketFromPreparedEventMock,
} = vi.hoisted(() => ({
  logEventMock: vi.fn(),
  logInfoMock: vi.fn(),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn(),
  resolveDueWorldWorkForScopeMock: vi.fn(),
  resolveDueWorldThreadWorkForScopeMock: vi.fn(),
  runRequiredActorDecisionPassMock: vi.fn(),
  readWorldClockMock: vi.fn(),
  syncWorldClockTurnBoundaryMock: vi.fn(),
  assertNoPendingNarrationBeforeNewTurnMock: vi.fn(),
  claimTurnSagaWorkerMock: vi.fn(),
  createTurnSagaMock: vi.fn(),
  getSettledTurnPacketMock: vi.fn(),
  getTurnSagaMock: vi.fn(),
  findLatestSuccessfulNarratorAttemptMock: vi.fn(),
  hasPreparedSettledTurnPacketRecoveryMock: vi.fn(),
  heartbeatTurnSagaWorkerMock: vi.fn(),
  assertTurnAuthorityStagesCompleteMock: vi.fn(),
  markTurnSagaFinalizedMock: vi.fn(),
  markTurnSagaFinalizedIfNeededMock: vi.fn(),
  mergeTurnSagaProvenanceMock: vi.fn(),
  persistOracleDecisionMock: vi.fn(),
  persistSettledTurnPacketMock: vi.fn(),
  recordPreparedSettledTurnPacketMock: vi.fn(),
  recordTurnAuthorityStageMock: vi.fn(),
  retractActorKnowledgeRecordMock: vi.fn(),
  recordNarratorAttemptMock: vi.fn(),
  releaseTurnSagaWorkerMock: vi.fn(),
  retractReflectionBudgetMock: vi.fn(),
  retractStoredEpisodicEventMock: vi.fn(),
  transitionTurnSagaStatusMock: vi.fn(),
  updateNarratorAttemptOutcomeMock: vi.fn(),
  recoverSettledTurnPacketFromPreparedEventMock: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

vi.mock("../oracle.js", () => ({
  callOracle: vi.fn(),
}));

vi.mock("../prompt-assembler.js", () => ({
  assembleJudgeAdjudicationPrompt: vi.fn(),
  assembleFinalNarrationPrompt: vi.fn(),
}));

vi.mock("../scene-assembly.js", () => ({
  assembleAuthoritativeScene: vi.fn().mockImplementation((args?: { sceneDirection?: unknown }) => ({
    openingScene: false,
    openingState: null,
    currentScene: {
      id: "loc-1",
      name: "Town Square",
      description: "A bustling square",
      tags: ["urban"],
    },
    presentNpcNames: [],
    sceneDirection: args?.sceneDirection ?? null,
    playerPerceivableSceneDirection: args?.sceneDirection ?? null,
    awareness: {
      contract: {
        clear: "Full present-scene actor context. Identity and direct interaction are justified.",
        hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
        none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
      },
      byNpcName: {},
      clearNpcNames: [],
      hintSignals: [],
    },
    recentContext: [],
    sceneEffects: [],
    playerPerceivableConsequences: [],
  })),
  buildSceneDirectionSeed: vi.fn(
    (
      sceneAssembly: {
        currentScene?: { name?: string | null; description?: string | null; tags?: string[] };
        openingState?: {
          immediateSituation?: string | null;
          entryPressure?: string[];
          promptLines?: string[];
          sceneContextLines?: string[];
        } | null;
        presentNpcNames?: string[];
        awareness?: { hintSignals?: string[] };
        recentContext?: Array<{ summary: string }>;
        sceneEffects?: Array<{ summary: string }>;
        playerPerceivableConsequences?: string[];
      },
      options: {
        runSource: "player-turn" | "opening-scene";
        playerLabel: string;
        playerAction?: string;
        intent?: string;
        method?: string;
        oracleOutcome?: string;
        targetLabel?: string | null;
      },
    ) => ({
      runSource: options.runSource,
      playerLabel: options.playerLabel,
      sceneName: sceneAssembly.currentScene?.name ?? null,
      sceneDescription: sceneAssembly.currentScene?.description ?? null,
      sceneTags: sceneAssembly.currentScene?.tags ?? [],
      immediateSituation: sceneAssembly.openingState?.immediateSituation ?? null,
      entryPressure: sceneAssembly.openingState?.entryPressure ?? [],
      openingPromptLines: sceneAssembly.openingState?.promptLines ?? [],
      sceneContextLines: sceneAssembly.openingState?.sceneContextLines ?? [],
      clearActorNames: sceneAssembly.presentNpcNames ?? [],
      hintSignals: sceneAssembly.awareness?.hintSignals ?? [],
      recentContextSummaries: (sceneAssembly.recentContext ?? []).map((entry) => entry.summary),
      sceneEffectSummaries: (sceneAssembly.sceneEffects ?? []).map((effect) => effect.summary),
      playerPerceivableConsequences: sceneAssembly.playerPerceivableConsequences ?? [],
      playerAction: options.playerAction,
      intent: options.intent,
      method: options.method,
      oracleOutcome: options.oracleOutcome,
      targetLabel: options.targetLabel ?? null,
    }),
  ),
  collapseRepeatedNarrationBlocks: vi.fn((text: string) =>
    text
      .split(/\n\s*\n/g)
      .filter((block, index, blocks) => {
        const normalized = block.trim().toLowerCase();
        const previous = blocks[index - 1]?.trim().toLowerCase();
        return Boolean(normalized) && normalized !== previous;
      })
      .join("\n\n")
      .trim(),
  ),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: vi.fn(),
  advanceCampaignTick: vi.fn(),
  getChatHistory: vi.fn(() => []),
  incrementTick: vi.fn(),
  readCampaignConfig: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  AppError: class AppError extends Error {
    constructor(message: string, public readonly statusCode = 500) {
      super(message);
      this.name = "AppError";
    }
  },
  createLogger: vi.fn(() => ({
    event: logEventMock,
    info: logInfoMock,
    warn: logWarnMock,
    error: logErrorMock,
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => await fn()),
}));

vi.mock("../hidden-adjudication.js", () => ({
  runHiddenAdjudicationPlan: vi.fn(),
  executeAdjudicationPlan: vi.fn(),
  buildJudgeAdjudicationContract: vi.fn(() => "Judge adjudication contract"),
}));

vi.mock("../world-brain.js", () => ({
  runWorldBrainSceneDirection: vi.fn().mockResolvedValue({
    situationSummary: "A tense contact forms around the player.",
    sceneQuestion: "Do these strangers challenge or study the player?",
    focalActorNames: ["Hero", "Goblin Raider"],
    backgroundActorNames: [],
    presenceReasons: [
      { actorName: "Hero", reason: "The player action created the local pivot.", perceivable: true },
      { actorName: "Goblin Raider", reason: "The raider is already in the player-facing scene pocket.", perceivable: true },
    ],
    causalBeats: [
      { summary: "The action forces an immediate read of intent between the player and the raider.", perceivable: true },
    ],
    narrationGuardrails: ["Keep the scene grounded in the immediate exchange."],
  }),
}));

vi.mock("../world-thread-runner.js", () => ({
  resolveDueWorldThreadWorkForScope: resolveDueWorldThreadWorkForScopeMock,
}));

vi.mock("../due-world-work.js", () => ({
  resolveDueWorldWorkForScopeWithProposalWatchdog: resolveDueWorldWorkForScopeMock,
}));

vi.mock("../scene-frame.js", () => ({
  buildSceneFrame: vi.fn(),
}));

vi.mock("../scene-planner.js", () => ({
  runScenePlanner: vi.fn(),
}));

vi.mock("../gm-tool-loop.js", () => ({
  runGmToolLoop: vi.fn(),
}));

vi.mock("../actor-tools.js", () => ({
  runRequiredActorDecisionPass: runRequiredActorDecisionPassMock,
}));

vi.mock("../living-world-authority.js", () => ({
  readWorldClock: readWorldClockMock,
  syncWorldClockTurnBoundary: syncWorldClockTurnBoundaryMock,
}));

vi.mock("../turn-saga.js", () => ({
  PENDING_NARRATION_STATUSES: [
    "resolved_pending_narration",
    "narrator_rendering",
    "narrator_repairing",
  ],
  PendingSettledTurnNarrationError: class PendingSettledTurnNarrationError extends Error {
    pendingSaga: unknown;
    causeError: unknown;

    constructor(pendingSaga: unknown, causeError?: unknown) {
      super("Pending settled turn narration.");
      this.name = "PendingSettledTurnNarrationError";
      this.pendingSaga = pendingSaga;
      this.causeError = causeError;
    }
  },
  assertNoPendingNarrationBeforeNewTurn: assertNoPendingNarrationBeforeNewTurnMock,
  assertTurnAuthorityStagesComplete: assertTurnAuthorityStagesCompleteMock,
  claimTurnSagaWorker: claimTurnSagaWorkerMock,
  createTurnSaga: createTurnSagaMock,
  findLatestSuccessfulNarratorAttempt: findLatestSuccessfulNarratorAttemptMock,
  getSettledTurnPacket: getSettledTurnPacketMock,
  getTurnSaga: getTurnSagaMock,
  hasPreparedSettledTurnPacketRecovery: hasPreparedSettledTurnPacketRecoveryMock,
  markTurnSagaFinalized: markTurnSagaFinalizedMock,
  heartbeatTurnSagaWorker: heartbeatTurnSagaWorkerMock,
  markTurnSagaFinalizedIfNeeded: markTurnSagaFinalizedIfNeededMock,
  mergeTurnSagaProvenance: mergeTurnSagaProvenanceMock,
  persistOracleDecision: persistOracleDecisionMock,
  persistSettledTurnPacket: persistSettledTurnPacketMock,
  recordPreparedSettledTurnPacket: recordPreparedSettledTurnPacketMock,
  recordTurnAuthorityStage: recordTurnAuthorityStageMock,
  recordNarratorAttempt: recordNarratorAttemptMock,
  releaseTurnSagaWorker: releaseTurnSagaWorkerMock,
  recoverSettledTurnPacketFromPreparedEvent: recoverSettledTurnPacketFromPreparedEventMock,
  transitionTurnSagaStatus: transitionTurnSagaStatusMock,
  updateNarratorAttemptOutcome: updateNarratorAttemptOutcomeMock,
}));

vi.mock("../scene-plan-validator.js", () => {
  class ScenePlanValidationError extends Error {
    constructor(public readonly issues: Array<{ code: string; message: string; path: string }>) {
      super(issues.map((issue) => issue.message).join("; "));
      this.name = "ScenePlanValidationError";
    }
  }

  return {
    ScenePlanValidationError,
    validateScenePlan: vi.fn(),
  };
});

vi.mock("../scene-plan-executor.js", () => ({
  executeScenePlan: vi.fn(),
}));

vi.mock("../narrator-packet.js", () => ({
  buildNarratorPacket: vi.fn(),
  repairModelGuidancePerceivableResponses: vi.fn((packet: unknown) => packet),
  repairPromptUnsafePerceivableEffects: vi.fn((packet: unknown) => packet),
  repairStalePerceivableObservations: vi.fn((packet: unknown) => packet),
  summarizeRuntimeToolResultForNarrator: vi.fn((input: { toolInput?: Record<string, unknown> }) =>
    String(input.toolInput?.text ?? input.toolInput?.summary ?? "Scene consequence settles."),
  ),
}));

vi.mock("../visible-narration-output-guard.js", () => {
  class VisibleNarrationPacketGuardError extends Error {
    constructor(
      message: string,
      public readonly violations: Array<{ kind: string; term: string }> = [],
      public readonly attempts = 1,
      public readonly validation: unknown = null,
    ) {
      super(message);
      this.name = "VisibleNarrationPacketGuardError";
    }
  }

  return {
    runVisibleNarrationWithPacketGuard: vi.fn(),
    VisibleNarrationPacketGuardError,
  };
});
vi.mock("../../vectors/episodic-events.js", () => ({
  retractStoredEpisodicEvent: retractStoredEpisodicEventMock,
}));

vi.mock("../reflection-budget.js", () => ({
  retractReflectionBudget: retractReflectionBudgetMock,
}));

vi.mock("../knowledge-model.js", () => ({
  listActorKnowledge: vi.fn(() => []),
  retractActorKnowledgeRecord: retractActorKnowledgeRecordMock,
}));

// Mock the ai module
vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  getSafeGenerateObjectErrorCode: vi.fn((error: unknown) =>
    error && typeof error === "object" && "safeGenerateCode" in error
      ? (error as { safeGenerateCode?: string }).safeGenerateCode ?? null
      : null,
  ),
  safeGenerateObject: vi.fn(async (opts?: { prompt?: unknown }) => {
    const prompt = String(opts?.prompt ?? "");
    if (prompt.includes("Final narration prompt") || prompt.includes("[FINAL NARRATION TASK]")) {
      return {
        object: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The goblin falls.",
              evidenceRefs: ["e1"],
            },
          ],
        },
        trace: {
          text: "",
          cleanedText: "",
          strategy: "native_json",
          primaryStrategy: "native_json",
          finishReason: "stop",
          response: { modelId: "mock-model" },
        },
      };
    }

    return { object: { isMovement: false, destination: null }, trace: {} };
  }),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import {
  detectMovement,
  detectVisibleNarrationFailures,
  NarrationRepairExhaustedError,
  processTurn,
  processOpeningScene,
  resumePendingTurnNarration,
  type HiddenTurnSummary,
  type TurnEvent,
} from "../turn-processor.js";
import { PendingSettledTurnNarrationError } from "../turn-saga.js";
import { buildMovementDetectionPromptContract } from "../prompt-contracts.js";
import { callOracle } from "../oracle.js";
import {
  assembleFinalNarrationPrompt,
  assembleJudgeAdjudicationPrompt,
} from "../prompt-assembler.js";
import {
  appendChatMessages,
  advanceCampaignTick,
  getChatHistory,
  incrementTick,
  readCampaignConfig,
} from "../../campaign/index.js";
import { executeAdjudicationPlan, runHiddenAdjudicationPlan } from "../hidden-adjudication.js";
import { runWorldBrainSceneDirection } from "../world-brain.js";
import { buildSceneFrame } from "../scene-frame.js";
import { runScenePlanner } from "../scene-planner.js";
import { runGmToolLoop } from "../gm-tool-loop.js";
import { validateScenePlan } from "../scene-plan-validator.js";
import { executeScenePlan } from "../scene-plan-executor.js";
import { assembleAuthoritativeScene } from "../scene-assembly.js";
import {
  buildNarratorPacket,
  repairModelGuidancePerceivableResponses,
  repairStalePerceivableObservations,
  type CanonicalTurnPacketResponse,
  type NarratorPacket,
} from "../narrator-packet.js";
import {
  runVisibleNarrationWithPacketGuard,
  VisibleNarrationPacketGuardError,
  type VisibleNarrationPacketValidationResult,
} from "../visible-narration-output-guard.js";
import { DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS } from "../runtime-limits.js";
import { generateText } from "ai";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/provider-registry.js";
import { getDb } from "../../db/index.js";
import { players, locations, locationEdges, npcs, items } from "../../db/schema.js";

const mockedCreateModel = vi.mocked(createModel);

describe("movement prompt contract helper", () => {
  it("exposes exact movement classifier shape, nullability, examples, and no-invention policy", () => {
    const contract = buildMovementDetectionPromptContract();

    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: movement-detection.v1");
    expect(contract).toContain('{ "isMovement": boolean, "destination": string|null }');
    expect(contract).toContain("destination must be null when isMovement is false");
    expect(contract).toContain("destination must be copied from explicit player wording");
    expect(contract).toContain("Compact valid example:");
    expect(contract).toContain("Minimal valid output:");
    expect(contract).toContain('{ "isMovement": false, "destination": null }');
    expect(contract).toContain("Invalid examples:");
    expect(contract).toContain("invented destination");
    expect(contract).toContain("missing nullable destination");
    expect(contract).toContain("Backend authority:");
    expect(contract).toContain("backend owns movement execution and destination validation");
    expect(contract).toContain("must not invent movement intent or destination");
  });

  it("places the movement structured-output contract before classifier data", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: { isMovement: false, destination: null },
    } as never);

    const result = await detectMovement("Inspect the old statue", {
      id: "test",
      name: "Test",
      baseUrl: "http://localhost",
      apiKey: "key",
      model: "test-model",
    });

    const prompt = String(vi.mocked(safeGenerateObject).mock.calls[0]?.[0]?.prompt ?? "");
    const contractIndex = prompt.indexOf("STRUCTURED_OUTPUT_CONTRACT: movement-detection.v1");
    const questionIndex = prompt.indexOf("Is this player action a movement/travel command?");

    expect(result).toBeNull();
    expect(contractIndex).toBeGreaterThanOrEqual(0);
    expect(contractIndex).toBeLessThan(questionIndex);
    expect(prompt).toContain('{ "isMovement": boolean, "destination": string|null }');
    expect(prompt).toContain("destination must be null when isMovement is false");
    expect(prompt).toContain("Minimal valid output:");
    expect(prompt).toContain("Invalid examples:");
    expect(prompt).toContain("Backend authority:");
    expect(prompt).toContain("must not invent movement intent or destination");
  });
});
// -- Helpers ------------------------------------------------------------------

const CAMPAIGN_ID = "test-campaign-123";

function createTestOptions(overrides = {}) {
  return {
    campaignId: CAMPAIGN_ID,
    playerAction: "I attack the goblin",
    intent: "Attack the goblin",
    method: "sword swing",
    judgeProvider: {
      id: "test",
      name: "Test",
      baseUrl: "http://localhost",
      apiKey: "key",
      model: "test-model",
    },
    storytellerProvider: {
      id: "test",
      name: "Test",
      baseUrl: "http://localhost",
      apiKey: "key",
      model: "test-model",
    },
    storytellerTemperature: 0.8,
    storytellerMaxTokens: 2000,
    ...overrides,
  };
}

function mockOracleResult() {
  return {
    chance: 65,
    roll: 30,
    outcome: "strong_hit" as const,
    reasoning: "Skilled warrior vs weak goblin",
  };
}

function mockAssembledPrompt() {
  return {
    formatted: "System prompt with world context",
    sections: [],
    totalTokens: 100,
    budgetUsed: 10,
  };
}

function setupMocks(options: {
  streamParts?: Array<{ type: string; [key: string]: unknown }>;
  oracleResult?: { chance: number; roll: number; outcome: string; reasoning: string };
} = {}) {
  const oracleResult = options.oracleResult ?? mockOracleResult();
  const streamParts = options.streamParts ?? [
    { type: "text-delta", text: "The goblin " },
    { type: "text-delta", text: "falls." },
  ];

  // Mock DB
  const mockDb = createEntityLookupDb({});
  (getDb as Mock).mockReturnValue(mockDb);
  setupTurnSagaMocks();
  resolveDueWorldWorkForScopeMock.mockReturnValue({
    phase: "pre_scene_frame",
    executed: [],
    deferred: [],
    skipped: [],
    worldThreads: {
      executed: [],
      deferred: [],
      skipped: [],
    },
    proposalPrepTrace: [],
    proposals: {
      selected: [],
      executed: [],
      skipped: [],
      blockedWriteScopes: [],
    },
  });
  resolveDueWorldThreadWorkForScopeMock.mockReturnValue({
    executed: [],
    deferred: [],
    skipped: [],
  });
  runRequiredActorDecisionPassMock.mockReturnValue({
    actionResults: [],
    schedule: { decisions: [] },
    decisions: [],
    parallelFrameRetrievalTrace: [],
    parallelPrepTrace: [],
  });

  (advanceCampaignTick as Mock).mockReturnValue(6);
  // Mock Oracle
  (callOracle as Mock).mockResolvedValue(oracleResult);

  // Mock judge adjudication prompt
  (assembleJudgeAdjudicationPrompt as Mock).mockImplementation(async (args?: {
    actionResult?: { outcome?: string };
    outcomeBounds?: { summary?: string };
  }) => ({
    system: [
      "[ACTION RESULT]",
      `Outcome: ${args?.actionResult?.outcome ?? "strong_hit"}`,
      args?.outcomeBounds?.summary
        ? `[OUTCOME BOUNDS]\n${args.outcomeBounds.summary}`
        : null,
    ]
      .filter((section): section is string => Boolean(section))
      .join("\n\n"),
    messages: [
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Welcome, adventurer." },
      { role: "user", content: "I attack the goblin" },
    ],
    assembledBase: mockAssembledPrompt(),
  }));
  (assembleFinalNarrationPrompt as Mock).mockResolvedValue({
    system: "Final narration system",
    prompt: "Final narration prompt",
    assembledBase: mockAssembledPrompt(),
  });

  // Mock readCampaignConfig
  (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
  (getChatHistory as Mock).mockReturnValue([]);
  vi.mocked(buildSceneFrame).mockResolvedValue(createScenePlanFrameMock() as never);

  // Mock incrementTick
  (incrementTick as Mock).mockReturnValue(6);

  const toolCallResults = streamParts
    .filter((part) => part.type === "tool-result")
    .map((part) => ({
      tool: String(part.toolName ?? ""),
      args: (part.input ?? {}) as Record<string, unknown>,
      result: (part.output ?? {}) as Record<string, unknown>,
    }));
  const emittedEvents = streamParts.flatMap((part) => {
    if (part.type !== "tool-result") return [];

    if (part.toolName === "offer_quick_actions") {
      return [{ type: "quick_actions", data: part.output }];
    }

    if (
      part.toolName === "move_to" &&
      part.output &&
      typeof part.output === "object"
    ) {
      const toolOutput = part.output as Record<string, unknown>;
      const inner = (toolOutput.result ?? null) as Record<string, unknown> | null;
      if (
        toolOutput.success === true &&
        inner &&
        typeof inner.locationId === "string" &&
        typeof inner.locationName === "string" &&
        typeof inner.travelCost === "number" &&
        Array.isArray(inner.path)
      ) {
        return [{
          type: "state_update",
          data: {
            type: "location_change",
            locationId: inner.locationId,
            locationName: inner.locationName,
            travelCost: inner.travelCost,
            tickAdvance: inner.travelCost,
            path: inner.path,
          },
        }];
      }
    }

    return [];
  });

  (runHiddenAdjudicationPlan as Mock).mockResolvedValue({
    rationale: "Hidden adjudication stays judge-owned in Phase 69.",
    actions: toolCallResults.map((call) => ({
      toolName: call.tool,
      input: call.args,
    })),
  });
  (executeAdjudicationPlan as Mock).mockResolvedValue({
    toolCallResults,
    emittedEvents,
    quickActionsEmitted: emittedEvents.some((event) => event.type === "quick_actions"),
    successfulTravel: null,
  });
  (generateText as Mock).mockResolvedValue({
    text: streamParts
      .filter((part) => part.type === "text-delta")
      .map((part) => String(part.text ?? ""))
      .join(""),
  });

  return { oracleResult, mockDb, toolCallResults, emittedEvents };
}

const SCENE_PLAN_EVENT_ID = "10000000-0000-4000-8000-000000000001";
const SCENE_PLAN_RESPONSE_ID = "10000000-0000-4000-8000-000000000002";
const SCENE_PLAN_ACTION_ID = "10000000-0000-4000-8000-000000000003";
const SCENE_PLAN_PLAYER_ID = "10000000-0000-4000-8000-000000000010";
const PLAYER_TURN_ALLOWED_TOOLS_FOR_TEST = [
  "list_visible_affordances",
  "list_navigation_options",
  "find_location_candidates",
  "find_object_candidates",
  "find_actor_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "check_route",
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "advance_time",
  "record_dialogue_outcome",
  "record_world_fact",
  "add_tag",
  "remove_tag",
  "set_relationship",
  "log_event",
  "offer_quick_actions",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "set_condition",
  "transfer_item",
] as const;

function createScenePlanFrameMock() {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 5,
    worldVersion: 7,
    playerActorId: SCENE_PLAN_PLAYER_ID,
    currentLocationId: "loc-1",
    currentSceneScopeId: "loc-1",
    playerAction: "I attack the goblin",
    roster: {
      active: [
        {
          id: SCENE_PLAN_PLAYER_ID,
          actorId: SCENE_PLAN_PLAYER_ID,
          type: "player",
          label: "Hero",
          locationId: "loc-1",
          sceneScopeId: "loc-1",
          awareness: "clear",
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
      forbiddenActorIds: [],
      forbiddenActorLabels: [],
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: [...PLAYER_TURN_ALLOWED_TOOLS_FOR_TEST],
    oracleContext: {
      targetLabel: null,
      targetType: "none",
      targetTags: [],
      source: "scene_frame",
      fallbackReason: "No deterministic target.",
    },
    combatEnvelope: null,
    oracle: null,
  };
}

function createScenePlanMock() {
  return {
    actionInterpretation: {
      actorId: SCENE_PLAN_PLAYER_ID,
      intent: "Attack the goblin",
      method: "sword swing",
      targetIds: [],
    },
    anchorEvent: {
      id: SCENE_PLAN_EVENT_ID,
      actorId: SCENE_PLAN_PLAYER_ID,
      subjectIds: [SCENE_PLAN_PLAYER_ID],
      kind: "player_action",
    },
    primaryResponse: {
      id: SCENE_PLAN_RESPONSE_ID,
      actorId: SCENE_PLAN_PLAYER_ID,
      responseKind: "system",
      eventId: SCENE_PLAN_EVENT_ID,
      visibleToPlayer: true,
    },
    supportResponses: [],
    plannedActions: [
      {
        id: SCENE_PLAN_ACTION_ID,
        actorId: SCENE_PLAN_PLAYER_ID,
        toolName: "log_event",
        input: {
          text: "The scene records the player action.",
          importance: 3,
          participants: ["Hero"],
          durability: "scene_local",
        },
      },
    ],
    deferredHooks: [],
    narratorFacts: {
      anchorEventId: SCENE_PLAN_EVENT_ID,
      eventIds: [SCENE_PLAN_EVENT_ID],
      responseIds: [SCENE_PLAN_RESPONSE_ID],
      actionIds: [SCENE_PLAN_ACTION_ID],
      toolResultRefs: [{ actionId: SCENE_PLAN_ACTION_ID, toolName: "log_event" }],
    },
    hiddenRationale: "Bounded local response.",
  };
}

function createExecutedScenePlanMock(scenePlan = createScenePlanMock()) {
  const action = scenePlan.plannedActions[0]!;
  const actionResult = {
    order: 0,
    actionId: action.id,
    actionRef: action.id,
    actorId: action.actorId,
    toolName: action.toolName,
    input: action.input,
    args: action.input,
    result: {
      success: true,
      result: { committed: true },
    },
  };

  return {
    plan: { frame: createScenePlanFrameMock(), plan: scenePlan, issues: [] },
    validatedPlan: { frame: createScenePlanFrameMock(), plan: scenePlan, issues: [] },
    toolCallResults: [actionResult],
    actionResults: [actionResult],
    emittedEvents: [],
    quickActionsEmitted: false,
    successfulTravel: null,
    canonicalEvents: [
      {
        id: action.id,
        actionId: action.id,
        actorId: action.actorId,
        toolName: action.toolName,
        result: { committed: true },
      },
    ],
  };
}

function createNarratorPacketMock() {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 5,
    postNarrationTargetTick: 6,
    playerAction: "I attack the goblin",
    oracleOutcome: "strong_hit",
    anchorEvent: {
      id: SCENE_PLAN_EVENT_ID,
      actorId: SCENE_PLAN_PLAYER_ID,
      kind: "player_action",
      summary: "Player action request.",
      perceivableByPlayer: true,
    },
    perceivableEvents: [],
    perceivableResponses: [],
    perceivableEffects: [
      {
        id: "effect-goblin-falls",
        actionId: "action-goblin-falls",
        actorId: "goblin-raider",
        toolName: "log_event",
        summary: "The goblin falls.",
        perceivableByPlayer: true,
        toolResult: { success: true, result: { eventId: "event-goblin-falls" } },
      },
    ],
    visibleActors: [{ id: SCENE_PLAN_PLAYER_ID, label: "Hero", type: "player" }],
    hintSignals: [],
    evidenceLedger: [
      {
        id: "perceivable_effect:effect-goblin-falls",
        category: "perceivable_effect",
        summary: "The goblin falls.",
      },
      {
        id: "control_return:scene-complete",
        category: "control_return",
        summary: "Scene complete.",
      },
    ],
    guardrails: [],
    controlReturnReason: "Scene complete.",
    allowedVisibleActorNames: ["Hero"],
    forbiddenActorNames: ["Hidden Watcher"],
    forbiddenFactMarkers: ["hidden-actor:hidden-watcher"],
    forbiddenPrivateTerms: [],
    canonicalTurnPacket: {},
  };
}

function setPrimaryNarratorFactText(
  narratorPacket: {
    evidenceLedger: Array<{ summary: string }>;
    perceivableEffects: Array<{ summary: string }>;
  },
  text: string,
) {
  narratorPacket.evidenceLedger[0]!.summary = text;
  narratorPacket.perceivableEffects[0]!.summary = text;
}

function createNarrationDraftForTest(prose: string) {
  return {
    prose,
    claims: [
      {
        id: "claim-playable",
        kind: "playable_beat" as const,
        summary: "The generated narration returns control on a playable beat.",
        requiresEvidence: false,
        evidenceRefs: [],
      },
    ],
    claimSpans: [
      {
        id: "span-playable",
        spanText: prose,
        claimIds: ["claim-playable"],
        requiresEvidence: false,
      },
    ],
  };
}

function createGroundedSentenceDraftForTest(_prose: string) {
  return {
    version: "grounded-sentence-draft.v2" as const,
    sentences: [
      {
        factRefs: ["e1.s1"],
        evidenceRefs: ["e1"],
      },
    ],
  };
}

function acceptedGroundedNarrationResult() {
  return {
    ok: true,
    narrationDraftAccepted: true,
    narrationContractVersion: "grounded-sentence-draft.v2",
    groundedSentenceDraft: createGroundedSentenceDraftForTest(""),
    structuredTrace: {
      strategy: "native_json",
      primaryStrategy: "native_json",
      fallbackReason: null,
      repairedFromStrategy: null,
      repair: null,
    },
    attempts: 1,
    retried: false,
    guardAddendum: null,
  };
}

function normalizeGeneratedNarrationForTest(generated: unknown) {
  if (generated && typeof generated === "object" && "prose" in generated) {
    const draft = generated as ReturnType<typeof createNarrationDraftForTest>;
    return { text: draft.prose, draft };
  }

  if (typeof generated === "string") {
    throw new Error(
      "Turn-processor packet narration tests must return a native NarrationDraft object, not prose text.",
    );
  }

  return { text: "", draft: createNarrationDraftForTest("") };
}

function installSafeGenerateObjectDefaultMock() {
  vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
    const prompt = String(opts?.prompt ?? "");
    if (prompt.includes("Final narration prompt") || prompt.includes("[FINAL NARRATION TASK]")) {
      return {
        object: createGroundedSentenceDraftForTest("The goblin falls."),
        trace: {
          text: "",
          cleanedText: "",
          strategy: "native_json",
          primaryStrategy: "native_json",
          finishReason: "stop",
          response: { modelId: "mock-model" },
        },
      } as never;
    }
    if (prompt.includes("NO-MUTATION ADMISSIBILITY CHECK")) {
      return {
        object: {
          decision: "admissible",
          safeKind: "no_state_claim",
          blockedClaimKinds: [],
          reason: "The mocked no-mutation response makes no reusable state claim.",
        },
        trace: {},
      } as never;
    }
    if (prompt.includes("MODEL-FACING GM READ CONTRACT")) {
      return { object: createGmReadMock(), trace: {} } as never;
    }

    return { object: { isMovement: false, destination: null }, trace: {} } as never;
  });
}

function createGmReadMock(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const read: Record<string, unknown> = {
    version: "gm-read.v1",
    situationSummary: "The player creates the next local beat.",
    sceneQuestion: "What changes in the immediate scene?",
    focalActorRefs: ["Player"],
    backgroundActorRefs: [],
    actionInterpretation: {
      intent: "Attack the goblin",
      method: "sword swing",
      targetRefs: [],
    },
    path: "tool_plan",
    turnIntent: "Plan a concrete local scene mutation.",
    rationale: "The GM selected a concrete tool-backed scene mutation.",
    evidenceRefs: ["Player"],
    ...overrides,
  };

  if (read.path === "tool_plan" && !("runtimeRequirement" in overrides)) {
    read.runtimeRequirement = {
      kind: "scene_beat",
      durability: "durable",
      beatKind: "event_log",
    };
  }
  const runtimeRequirement = read.runtimeRequirement as Record<string, unknown> | undefined;
  if (
    runtimeRequirement?.kind === "dialogue_outcome"
    && !("speakerBinding" in runtimeRequirement)
  ) {
    runtimeRequirement.speakerBinding = {
      kind: "prose_role",
      requestedRoleText: "local speaker",
      allowCreateSceneExtra: true,
    };
  }
  if (!("turnGrounding" in overrides)) {
    if (read.path === "tool_plan") {
      const requirement = read.runtimeRequirement as { kind?: string; topicKind?: string; durability?: string } | undefined;
      const requirementKind = requirement?.kind ?? "scene_beat";
      read.turnGrounding = {
        intentKind: requirementKind === "state_mutation" ? "concrete_state_change" : "ordinary_local_response",
        requiresGrounding: true,
        groundingKind: requirementKind,
        topicKind: requirement?.topicKind,
        durability: requirement?.durability,
        reason: "The test GM Read uses a backend-grounded tool path.",
      };
    } else if (read.path === "roll_oracle") {
      read.turnGrounding = {
        intentKind: "combat_pressure",
        requiresGrounding: true,
        groundingKind: "roll_oracle",
        reason: "The test GM Read uses an Oracle roll.",
      };
    } else if (read.path === "combat_transition") {
      read.turnGrounding = {
        intentKind: "combat_pressure",
        requiresGrounding: true,
        groundingKind: "combat_transition",
        reason: "The test GM Read enters combat.",
      };
    } else {
      read.turnGrounding = {
        intentKind: "ordinary_local_response",
        requiresGrounding: false,
        groundingKind: "none",
        reason: "The test GM Read uses a no-mutation path.",
      };
    }
  }
  if (!("narrationGuardrails" in overrides)) {
    read.narrationGuardrails = ["Stay inside the visible scene."];
  }

  return Object.fromEntries(
    Object.entries(read).filter(([, value]) => value !== undefined),
  );
}

function setupScenePlanMocks(options: {
  gmRead?: Record<string, unknown>;
} = {}) {
  const scenePlan = createScenePlanMock();
  const frame = createScenePlanFrameMock();
  const executedPlan = createExecutedScenePlanMock(scenePlan);
  const narratorPacket = createNarratorPacketMock();
  const action = scenePlan.plannedActions[0]!;

  vi.mocked(buildSceneFrame).mockResolvedValue(frame as never);
  vi.mocked(safeGenerateObject).mockResolvedValueOnce({
    object: options.gmRead ?? createGmReadMock(),
    trace: {},
  } as never);
  vi.mocked(runGmToolLoop).mockResolvedValue({
    intent: "Plan a concrete local scene mutation.",
    text: "",
    rawToolCalls: [
      {
        tool: action.toolName,
        args: action.input,
        result: { success: true, result: { committed: true } },
      },
    ],
    stepResults: [
      {
        stepId: "tool-call-1",
        attempt: 1,
        status: "done",
        toolName: action.toolName,
        candidateInput: action.input,
        validationError: null,
        visibleEffect: "The scene records the local consequence.",
        privateGuardTerms: [],
        mutationRefs: ["committed"],
        settledAtTick: frame.tick,
        result: {
          success: true,
          result: { committed: true },
        },
      },
    ],
    acceptedStepIds: ["tool-call-1"],
    acceptedToolResultIds: [],
  } as never);
  vi.mocked(runScenePlanner).mockResolvedValue(scenePlan as never);
  vi.mocked(validateScenePlan).mockReturnValue({
    ok: true,
    plan: { frame, plan: scenePlan, issues: [] },
  } as never);
  vi.mocked(executeScenePlan).mockResolvedValue(executedPlan as never);
  vi.mocked(buildNarratorPacket).mockReturnValue(narratorPacket as never);
  vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
    const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
    const { text, draft } = normalizeGeneratedNarrationForTest(generated);
    return {
      text,
      draft,
      attempts: 1,
      retried: false,
      validation: { ok: true, violations: [] },
      guardAddendum: null,
    };
  });

  return { frame, scenePlan, executedPlan, narratorPacket };
}

function setupTurnSagaMocks(overrides: {
  status?: string;
  turnId?: string;
  provenance?: Record<string, unknown>;
  settledPacket?: Record<string, unknown>;
} = {}) {
  type MockSagaRecord = {
    id: string;
    campaignId: string;
    turnId: string;
    playerId: string | null;
    actionId: string | null;
    actionText: string | null;
    sourceAction: unknown;
    status: string;
    statusReason: string | null;
    statusUpdatedAt: number;
    activeLockToken: string | null;
    activeWorkerId: string | null;
    activeStartedAt: number | null;
    requiresNarration: boolean;
    baseWorldVersion: number;
    resultWorldVersion: number | null;
    oracleDecisionId: string | null;
    settledTurnPacketId: string | null;
    latestNarratorAttemptId: string | null;
    provenance: Record<string, unknown>;
    createdAt: number;
    updatedAt: number;
  };
  let saga: MockSagaRecord = {
    id: "saga-1",
    campaignId: CAMPAIGN_ID,
    turnId: overrides.turnId ?? "turn-1",
    playerId: null,
    actionId: null,
    actionText: "I attack the goblin",
    sourceAction: {},
    status: overrides.status ?? "created",
    statusReason: null,
    statusUpdatedAt: 0,
    activeLockToken: null,
    activeWorkerId: null,
    activeStartedAt: null,
    requiresNarration: overrides.status !== undefined
      ? ["resolved_pending_narration", "narrator_rendering", "narrator_repairing"].includes(overrides.status)
      : false,
    baseWorldVersion: 7,
    resultWorldVersion: null,
    oracleDecisionId: null,
    settledTurnPacketId: null,
    latestNarratorAttemptId: null,
    provenance: overrides.provenance ?? {},
    createdAt: 0,
    updatedAt: 0,
  };
  const settledPacket = overrides.settledPacket ?? {
    id: "packet-1",
    campaignId: CAMPAIGN_ID,
    sagaId: "saga-1",
    turnId: saga.turnId,
    oracleDecisionId: "oracle-decision-1",
    canonicalTurnPacket: {},
    narratorPacket: createNarratorPacketMock(),
    sourceRefs: [],
    acceptedToolResultRefs: [],
    acceptedActorResultRefs: [],
    dueWorldRefs: [],
    acceptedDurableEventIds: [],
    producedDurableEventIds: [],
    requiresNarration: true,
    baseWorldVersion: 7,
    resultWorldVersion: 8,
    createdAt: 0,
    updatedAt: 0,
  };

  readWorldClockMock.mockReturnValue({
    campaignId: CAMPAIGN_ID,
    worldVersion: 7,
    worldTimeMinutes: 5,
    currentTick: 5,
    updatedAt: 0,
  });
  assertNoPendingNarrationBeforeNewTurnMock.mockImplementation(() => undefined);
  createTurnSagaMock.mockImplementation((input: { turnId?: string; baseWorldVersion?: number }) => {
    saga = {
      ...saga,
      turnId: input.turnId ?? saga.turnId,
      baseWorldVersion: input.baseWorldVersion ?? saga.baseWorldVersion,
      status: "created",
      activeLockToken: (input as { activeLockToken?: string | null }).activeLockToken ?? null,
      activeWorkerId: (input as { activeWorkerId?: string | null }).activeWorkerId ?? null,
      activeStartedAt: (input as { activeWorkerId?: string | null }).activeWorkerId ? 1 : null,
    };
    return saga;
  });
  transitionTurnSagaStatusMock.mockImplementation((input: { toStatus: string; resultWorldVersion?: number | null }) => {
    saga = {
      ...saga,
      status: input.toStatus,
      resultWorldVersion: input.resultWorldVersion ?? saga.resultWorldVersion,
    };
    return saga;
  });
  persistOracleDecisionMock.mockImplementation(() => {
    saga = { ...saga, oracleDecisionId: "oracle-decision-1" };
    return { id: "oracle-decision-1", sagaId: saga.id };
  });
  persistSettledTurnPacketMock.mockImplementation(() => {
    saga = {
      ...saga,
      status: "resolved_pending_narration",
      requiresNarration: true,
      settledTurnPacketId: "packet-1",
      resultWorldVersion: 8,
    };
    return settledPacket;
  });
  getTurnSagaMock.mockImplementation(() => saga);
  getSettledTurnPacketMock.mockImplementation(() => settledPacket);
  hasPreparedSettledTurnPacketRecoveryMock.mockReturnValue(false);
  recordPreparedSettledTurnPacketMock.mockImplementation(() => ({
    id: "prepared-event-1",
    sagaId: saga.id,
    eventType: "settled_packet_prepared",
  }));
  recordTurnAuthorityStageMock.mockImplementation((input: {
    sagaId: string;
    stage: string;
    baseWorldVersion?: number | null;
    resultWorldVersion?: number | null;
    settledTurnPacketId?: string | null;
    payload?: Record<string, unknown>;
  }) => ({
    id: `authority-stage-${input.stage}`,
    campaignId: CAMPAIGN_ID,
    sagaId: input.sagaId,
    turnId: saga.turnId,
    eventType: "authority_stage_committed",
    idempotencyKey: `authority-stage:${input.stage}`,
    baseWorldVersion: input.baseWorldVersion ?? saga.baseWorldVersion,
    resultWorldVersion: input.resultWorldVersion ?? saga.resultWorldVersion,
    settledTurnPacketId: input.settledTurnPacketId ?? saga.settledTurnPacketId,
    payload: {
      stage: input.stage,
      ...(input.payload ?? {}),
    },
    createdAt: 0,
  }));
  assertTurnAuthorityStagesCompleteMock.mockReturnValue([]);
  recoverSettledTurnPacketFromPreparedEventMock.mockImplementation(() => {
    saga = {
      ...saga,
      status: "resolved_pending_narration",
      requiresNarration: true,
      settledTurnPacketId: "packet-1",
      resultWorldVersion: 8,
    };
    return settledPacket;
  });
  claimTurnSagaWorkerMock.mockImplementation((input: { workerId: string; lockToken?: string }) => {
    const lockToken = input.lockToken ?? "lock-token";
    saga = {
      ...saga,
      activeLockToken: lockToken,
      activeWorkerId: input.workerId,
      activeStartedAt: 1,
    };
    return { saga, lockToken, workerId: input.workerId };
  });
  releaseTurnSagaWorkerMock.mockImplementation((input: { lockToken: string }) => {
    if (saga.activeLockToken !== input.lockToken) {
      throw new Error("lock conflict");
    }
    saga = {
      ...saga,
      activeLockToken: null,
      activeWorkerId: null,
      activeStartedAt: null,
    };
    return saga;
  });
  heartbeatTurnSagaWorkerMock.mockImplementation((input: { lockToken: string }) => {
    if (saga.activeLockToken !== input.lockToken) {
      throw new Error("lock conflict");
    }
    saga = { ...saga, activeStartedAt: Date.now() };
    return saga;
  });
  findLatestSuccessfulNarratorAttemptMock.mockReturnValue(null);
  mergeTurnSagaProvenanceMock.mockImplementation((input: { patch: Record<string, unknown> }) => {
    const merge = (
      base: Record<string, unknown>,
      patch: Record<string, unknown>,
    ): Record<string, unknown> => {
      const merged = { ...base };
      for (const [key, value] of Object.entries(patch)) {
        const existing = merged[key];
        merged[key] =
          existing
          && typeof existing === "object"
          && !Array.isArray(existing)
          && value
          && typeof value === "object"
          && !Array.isArray(value)
            ? merge(existing as Record<string, unknown>, value as Record<string, unknown>)
            : value;
      }
      return merged;
    };
    saga = { ...saga, provenance: merge(saga.provenance, input.patch) };
    return saga;
  });
  let narratorAttemptSequence = 0;
  recordNarratorAttemptMock.mockImplementation((input: { status: string }) => {
    narratorAttemptSequence += 1;
    const id = `attempt-${narratorAttemptSequence}`;
    saga = { ...saga, latestNarratorAttemptId: id };
    return { id, sagaId: saga.id, status: input.status };
  });
  updateNarratorAttemptOutcomeMock.mockImplementation((input: { id: string; status: string }) => {
    saga = { ...saga, latestNarratorAttemptId: input.id };
    return { id: input.id, sagaId: saga.id, status: input.status };
  });
  markTurnSagaFinalizedMock.mockImplementation(() => {
    saga = { ...saga, status: "finalized" };
    return saga;
  });
  markTurnSagaFinalizedIfNeededMock.mockImplementation((input: { narratorAttemptId?: string }) => {
    saga = {
      ...saga,
      status: "finalized",
      latestNarratorAttemptId: input.narratorAttemptId ?? saga.latestNarratorAttemptId,
    };
    return saga;
  });

  return { get saga() { return saga; }, settledPacket };
}

function sagaStatusTransitions(): string[] {
  return transitionTurnSagaStatusMock.mock.calls.map(
    ([input]) => (input as { toStatus: string }).toStatus,
  );
}

function createEntityLookupDb(options: {
  playerRow?: Record<string, unknown>;
  locationRows?: Array<Record<string, unknown>>;
  edgeRows?: Array<Record<string, unknown>>;
  npcRows?: Array<Record<string, unknown>>;
  itemRows?: Array<Record<string, unknown>>;
}) {
  const playerRow = options.playerRow ?? {
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Hero",
    hp: 5,
    tags: '["legacy-only"]',
    equippedItems: "[]",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    currentLocationId: "loc-1",
    characterRecord: JSON.stringify({
      identity: {
        id: "player-1",
        campaignId: CAMPAIGN_ID,
        role: "player",
        tier: "key",
        displayName: "Hero",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-1",
        currentLocationName: "Town Square",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "resident",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: ["Determined"],
        frictions: [],
      },
      capabilities: {
        traits: ["Brave"],
        skills: [{ name: "Swordsman", tier: "Skilled" }],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      state: {
        hp: 5,
        conditions: [],
        statusFlags: [],
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {},
      provenance: {
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: [],
      },
    }),
    derivedTags: "[]",
  };
  const locationRows = options.locationRows ?? [
    {
      id: "loc-1",
      campaignId: CAMPAIGN_ID,
      name: "Town Square",
      description: "A bustling square",
      tags: '["urban", "crowded"]',
      connectedTo: "[]",
      isStarting: false,
    },
  ];
  const edgeRows =
    options.edgeRows ??
    locationRows.flatMap((location) => {
      const connectedTo = (() => {
        try {
          return JSON.parse(String(location.connectedTo ?? "[]")) as string[];
        } catch {
          return [];
        }
      })();

      return connectedTo.map((targetId, index) => ({
        id: `edge-${String(location.id)}-${targetId}-${index}`,
        campaignId: CAMPAIGN_ID,
        fromLocationId: String(location.id),
        toLocationId: targetId,
        travelCost: 1,
        discovered: true,
      }));
    });
  const npcRows = options.npcRows ?? [];
  const itemRows = options.itemRows ?? [];
  let lastFromTable: unknown = null;
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockImplementation((table: unknown) => {
      lastFromTable = table;
      return mockDb;
    }),
    where: vi.fn().mockImplementation(() => {
      if (lastFromTable === (players as unknown)) {
        return {
          get: vi.fn().mockReturnValue(playerRow),
          all: vi.fn().mockReturnValue([playerRow]),
        };
      }
      if (lastFromTable === (locations as unknown)) {
        return {
          get: vi.fn().mockReturnValue(locationRows[0] ?? null),
          all: vi.fn().mockReturnValue(locationRows),
        };
      }
      if (lastFromTable === (locationEdges as unknown)) {
        return {
          get: vi.fn().mockReturnValue(edgeRows[0] ?? null),
          all: vi.fn().mockReturnValue(edgeRows),
        };
      }
      if (lastFromTable === (npcs as unknown)) {
        return {
          get: vi.fn().mockReturnValue(npcRows[0] ?? null),
          all: vi.fn().mockReturnValue(npcRows),
        };
      }
      if (lastFromTable === (items as unknown)) {
        return {
          get: vi.fn().mockReturnValue(itemRows[0] ?? null),
          all: vi.fn().mockReturnValue(itemRows),
        };
      }
      return {
        get: vi.fn().mockReturnValue(null),
        all: vi.fn().mockReturnValue([]),
      };
    }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockImplementation(() => ({
        where: vi.fn().mockImplementation(() => ({
          run: vi.fn(),
        })),
      })),
    })),
  };

  return mockDb;
}

function createOpeningPlayerRow(overrides: {
  currentTick?: number;
  currentLocationId?: string;
  startLocationId?: string;
  statusFlags?: string[];
  immediateSituation?: string;
  entryPressure?: string[];
  companions?: string[];
  startingVisibility?: string;
  arrivalMode?: string;
} = {}) {
  const currentLocationId = overrides.currentLocationId ?? "loc-1";
  const startLocationId = overrides.startLocationId ?? "loc-1";

  return {
    id: "player-1",
    campaignId: CAMPAIGN_ID,
    name: "Hero",
    hp: 5,
    tags: '["legacy-only"]',
    equippedItems: "[]",
    race: "Human",
    gender: "",
    age: "",
    appearance: "",
    currentLocationId,
    characterRecord: JSON.stringify({
      identity: {
        id: "player-1",
        campaignId: CAMPAIGN_ID,
        role: "player",
        tier: "key",
        displayName: "Hero",
        canonicalStatus: "original",
      },
      profile: {
        species: "Human",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId,
        currentLocationName: "Town Square",
        relationshipRefs: [],
        socialStatus: [],
        originMode: "outsider",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: [],
        frictions: [],
      },
      capabilities: {
        traits: ["Brave"],
        skills: [{ name: "Swordsman", tier: "Skilled" }],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      state: {
        hp: 5,
        conditions: [],
        statusFlags: overrides.statusFlags ?? [],
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {
        startLocationId,
        arrivalMode: overrides.arrivalMode ?? "on-foot",
        immediateSituation:
          overrides.immediateSituation
          ?? "A tail is closing in as you push through the market crowd.",
        entryPressure: overrides.entryPressure ?? ["under watch", "clock running out"],
        companions: overrides.companions ?? ["Mira"],
        startingVisibility: overrides.startingVisibility ?? "noticed",
      },
      provenance: {
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: [],
      },
    }),
    derivedTags: "[]",
  };
}

function createPoweredPlayerRow(overrides: Record<string, unknown> = {}) {
  const base = createOpeningPlayerRow();
  const characterRecord = JSON.parse(String(base.characterRecord));
  return {
    ...base,
    characterRecord: JSON.stringify({
      ...characterRecord,
      powerStats: {
        attackPotency: { tier: "Town", rank: 6 },
        speed: { tier: "Hypersonic", rank: 5 },
        durability: { tier: "Town", rank: 5 },
        intelligence: { tier: "Genius", rank: 6 },
        hax: [],
        vulnerabilities: [],
      },
    }),
    ...overrides,
  };
}

function createPoweredNpcRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "npc-1",
    campaignId: CAMPAIGN_ID,
    name: "Goblin Raider",
    persona: "Hostile scout",
    tags: '["legacy-only"]',
    tier: "persistent",
    currentLocationId: "loc-1",
    goals: '{"short_term":[],"long_term":[]}',
    beliefs: "[]",
    unprocessedImportance: 0,
    inactiveTicks: 0,
    createdAt: 0,
    characterRecord: JSON.stringify({
      identity: {
        id: "npc-1",
        campaignId: CAMPAIGN_ID,
        role: "npc",
        tier: "persistent",
        displayName: "Goblin Raider",
        canonicalStatus: "original",
      },
      profile: {
        species: "Goblin",
        gender: "",
        ageText: "",
        appearance: "",
        backgroundSummary: "",
        personaSummary: "Hostile scout",
      },
      socialContext: {
        factionId: null,
        factionName: null,
        homeLocationId: null,
        homeLocationName: null,
        currentLocationId: "loc-1",
        currentLocationName: "Town Square",
        relationshipRefs: [],
        socialStatus: ["Raider"],
        originMode: "unknown",
      },
      motivations: {
        shortTermGoals: [],
        longTermGoals: [],
        beliefs: [],
        drives: ["Cruel"],
        frictions: [],
      },
      capabilities: {
        traits: ["Agile"],
        skills: [{ name: "Dagger Fighting", tier: "Skilled" }],
        flaws: [],
        specialties: [],
        wealthTier: null,
      },
      state: {
        hp: 5,
        conditions: ["Hidden"],
        statusFlags: [],
        activityState: "active",
      },
      loadout: {
        inventorySeed: [],
        equippedItemRefs: [],
        currencyNotes: "",
        signatureItems: [],
      },
      startConditions: {},
      provenance: {
        sourceKind: "generator",
        importMode: null,
        templateId: null,
        archetypePrompt: null,
        worldgenOrigin: null,
        legacyTags: [],
      },
      powerStats: {
        attackPotency: { tier: "Building", rank: 5 },
        speed: { tier: "Subsonic", rank: 4 },
        durability: { tier: "Building", rank: 4 },
        intelligence: { tier: "Gifted", rank: 4 },
        hax: [],
        vulnerabilities: [],
      },
    }),
    derivedTags: "[]",
    ...overrides,
  };
}

async function collectEvents(generator: AsyncGenerator<TurnEvent>): Promise<TurnEvent[]> {
  const events: TurnEvent[] = [];
  for await (const event of generator) {
    events.push(event);
  }
  return events;
}

// -- Tests --------------------------------------------------------------------

describe("processTurn", () => {
  beforeEach(() => {
    process.env.SCENE_PLAN_ENABLED = "false";
    delete process.env.EXPOSE_LLM_REASONING;
    vi.clearAllMocks();
    logEventMock.mockClear();
    logInfoMock.mockClear();
    logWarnMock.mockClear();
    logErrorMock.mockClear();
    vi.mocked(runWorldBrainSceneDirection).mockClear();
    resolveDueWorldWorkForScopeMock.mockReturnValue({
      phase: "pre_scene_frame",
      executed: [],
      deferred: [],
      skipped: [],
      worldThreads: {
        executed: [],
        deferred: [],
        skipped: [],
      },
      proposalPrepTrace: [],
      proposals: {
        selected: [],
        executed: [],
        skipped: [],
        blockedWriteScopes: [],
      },
    });
    resolveDueWorldThreadWorkForScopeMock.mockReturnValue({
      executed: [],
      deferred: [],
      skipped: [],
    });
    runRequiredActorDecisionPassMock.mockReturnValue({
      actionResults: [],
      schedule: { decisions: [] },
      decisions: [],
      parallelFrameRetrievalTrace: [],
      parallelPrepTrace: [],
    });
    vi.mocked(safeGenerateObject).mockReset();
    // Default: no movement detected; final packet narration returns a native JSON draft.
    installSafeGenerateObjectDefaultMock();
  });

  it("yields oracle_result event first", async () => {
    const { oracleResult } = setupMocks();
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    expect(events[0]).toEqual({
      type: "oracle_result",
      data: {
        chance: oracleResult.chance,
        roll: oracleResult.roll,
        outcome: oracleResult.outcome,
      },
    });
    expect(JSON.stringify(events[0])).not.toContain(oracleResult.reasoning);
  });

  it("yields one final visible narration event after the hidden pass completes", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The goblin " },
        { type: "text-delta", text: "falls." },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const narrativeEvents = events.filter((e) => e.type === "narrative");
    expect(narrativeEvents).toHaveLength(1);
    expect(narrativeEvents[0]!.data).toEqual({ text: "The goblin falls." });
  });

  it("locks the installed ai generateText seam to reasoningText and suppresses reasoning SSE by default", async () => {
    expectTypeOf<Awaited<ReturnType<typeof generateText>>>().toHaveProperty("reasoningText");
    expectTypeOf<Awaited<ReturnType<typeof generateText>>["reasoningText"]>().toEqualTypeOf<
      string | undefined
    >();

    setupMocks({
      streamParts: [{ type: "text-delta", text: "The goblin falls." }],
    });
    (generateText as Mock).mockResolvedValue({
      text: "The goblin falls.",
      reasoningText: "The storyteller kept the visible prose separate from internal chain-of-thought.",
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The goblin falls." } },
      ]),
    );
    expect(events.some((event) => event.type === "reasoning")).toBe(false);
  });

  it("keeps reasoning off player SSE even when debug exposure env is set", async () => {
    process.env.EXPOSE_LLM_REASONING = "true";
    setupMocks({
      streamParts: [{ type: "text-delta", text: "The goblin falls." }],
    });
    (generateText as Mock).mockResolvedValue({
      text: "The goblin falls.",
      reasoningText: "Debug-only reasoning stays on the private diagnostic lane.",
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The goblin falls." } },
      ]),
    );
    expect(events.some((event) => event.type === "reasoning")).toBe(false);
  });

  it("does not emit a reasoning event when generateText returns no separate reasoningText", async () => {
    setupMocks({
      streamParts: [{ type: "text-delta", text: "The goblin falls." }],
    });
    (generateText as Mock).mockResolvedValue({
      text: "The goblin falls.",
      reasoningText: undefined,
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events.some((event) => event.type === "reasoning")).toBe(false);
  });

  it("keeps Z.AI reasoning_content off player SSE even when debug exposure env is set", async () => {
    process.env.EXPOSE_LLM_REASONING = "true";
    setupMocks({
      streamParts: [{ type: "text-delta", text: "The goblin falls." }],
    });
    (generateText as Mock).mockResolvedValue({
      text: "The goblin falls.",
      reasoningText: undefined,
      response: {
        modelId: "glm-5.1",
        body: {
          choices: [
            {
              message: {
                content: "The goblin falls.",
                reasoning_content: "Narrate only the committed consequence and do not invent extra beats.",
                role: "assistant",
              },
            },
          ],
        },
      },
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The goblin falls." } },
      ]),
    );
    expect(events.some((event) => event.type === "reasoning")).toBe(false);
  });

  it("logs judge and storyteller reasoning metadata when those traces are available", async () => {
    setupMocks({
      streamParts: [{ type: "text-delta", text: "The goblin falls." }],
    });
    (runHiddenAdjudicationPlan as Mock).mockResolvedValueOnce({
      rationale: "The strike lands cleanly and should commit the scene state immediately.",
      actions: [
        {
          toolName: "log_event",
          input: {
            text: "The goblin falls.",
          },
        },
      ],
      trace: {
        text: "{\"rationale\":\"The strike lands cleanly and should commit the scene state immediately.\",\"actions\":[{\"toolName\":\"log_event\",\"input\":{\"text\":\"The goblin falls.\"}}]}",
        cleanedText: "{\"rationale\":\"The strike lands cleanly and should commit the scene state immediately.\",\"actions\":[{\"toolName\":\"log_event\",\"input\":{\"text\":\"The goblin falls.\"}}]}",
        reasoningText: "A clean strong hit should create one authoritative scene mutation, not extra flourish.",
        response: {
          modelId: "glm-5.1",
        },
        usage: {
          inputTokens: 420,
          outputTokens: 84,
          totalTokens: 504,
        },
      },
    });
    (generateText as Mock).mockResolvedValueOnce({
      text: "The goblin falls.",
      reasoningText: "Narrate only the committed outcome and avoid inventing extra escalation.",
      response: {
        modelId: "glm-5.1-thinking",
      },
      usage: {
        inputTokens: 300,
        outputTokens: 51,
        totalTokens: 351,
      },
      finishReason: "stop",
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(logEventMock).toHaveBeenCalledWith(
      "judge.hidden.plan",
      expect.objectContaining({
        rationale: "The strike lands cleanly and should commit the scene state immediately.",
        actionTools: ["log_event"],
        providerReasoningLen:
          "A clean strong hit should create one authoritative scene mutation, not extra flourish.".length,
        responseModel: "glm-5.1",
        usage: {
          inputTokens: 420,
          outputTokens: 84,
          totalTokens: 504,
        },
      }),
    );
    expect(logEventMock).toHaveBeenCalledWith(
      "judge.reasoning",
      expect.objectContaining({
        source: "hidden-adjudication",
        reasoningText: "A clean strong hit should create one authoritative scene mutation, not extra flourish.",
        responseModel: "glm-5.1",
      }),
    );
    expect(logEventMock).toHaveBeenCalledWith(
      "storyteller.reasoning",
      expect.objectContaining({
        label: "final",
        reasoningText: "Narrate only the committed outcome and avoid inventing extra escalation.",
        responseModel: "glm-5.1-thinking",
        usage: {
          inputTokens: 300,
          outputTokens: 51,
          totalTokens: 351,
        },
      }),
    );
  });

  it("uses storyteller model role without explicit reasoning bypass for visible prose narration", async () => {
    setupMocks({
      streamParts: [{ type: "text-delta", text: "A blade cuts the air." }],
    });

    await collectEvents(processTurn(createTestOptions()));

    const storytellerCalls = mockedCreateModel.mock.calls.filter(
      ([, options]) => options?.role === "storyteller" && options?.familyHint == null && options?.reasoningMode == null,
    );

    expect(storytellerCalls).toHaveLength(1);

    for (const [providerArg] of storytellerCalls) {
      expect(providerArg).toMatchObject({ id: "test", name: "Test", model: "test-model" });
    }
  });

  it("defers visible narration until authoritative scene settlement", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "Steel rings out in the square. " },
        { type: "text-delta", text: "The crowd recoils." },
      ],
    });

    let resolveSceneSettlement: (() => void) | null = null;
    const generator = processTurn(
      createTestOptions({
        onBeforeVisibleNarration: () =>
          new Promise<void>((resolve) => {
            resolveSceneSettlement = resolve;
          }),
      }),
    );
    const observedTypesBeforeNarrative: string[] = [];

    for (let i = 0; i < 6; i += 1) {
      const step = await generator.next();
      if (step.done) {
        break;
      }
      observedTypesBeforeNarrative.push(step.value.type);
      if (
        step.value.type === "scene-settling"
        && (step.value.data as { phase?: string }).phase === "local-present-scene"
      ) {
        break;
      }
    }

    expect(observedTypesBeforeNarrative).not.toContain("narrative");
    expect(observedTypesBeforeNarrative).toContain("scene-settling");

    let narrativeResolved = false;
    const pendingNarrative = generator.next().then((result) => {
      narrativeResolved = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(narrativeResolved).toBe(false);

    const finishSceneSettlement = resolveSceneSettlement as (() => void) | null;
    if (finishSceneSettlement) {
      finishSceneSettlement();
    }

    const narrationPhaseStep = await pendingNarrative;
    expect(narrationPhaseStep.done).toBe(false);
    expect(narrationPhaseStep.value.type).toBe("scene-settling");

    const narrativeStep = await generator.next();
    expect(narrativeStep.done).toBe(false);
    expect(narrativeStep.value.type).toBe("narrative");
  });

  it("does not promote a broad location into local scene scope when legacy campaigns lack a narrower scene field", async () => {
    setupMocks();
    const playerRow = {
      ...createOpeningPlayerRow({ currentLocationId: "loc-1" }),
      currentSceneLocationId: null,
    } as Record<string, unknown>;
    const mockDb = createEntityLookupDb({ playerRow });
    (getDb as Mock).mockReturnValue(mockDb);

    let capturedSummary: { currentLocationId: string | null; currentSceneScopeId: string | null } | null = null;

    await collectEvents(
      processTurn(
        createTestOptions({
          onBeforeVisibleNarration: (summary: HiddenTurnSummary) => {
            capturedSummary = {
              currentLocationId: summary.currentLocationId,
              currentSceneScopeId: summary.currentSceneScopeId,
            };
          },
        }),
      ),
    );

    expect(capturedSummary).toEqual({
      currentLocationId: "loc-1",
      currentSceneScopeId: null,
    });
    expect(mockDb.update).not.toHaveBeenCalled();
  });

  it("sets local scene scope to the destination on authoritative player movement", async () => {
    setupMocks();
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: true, destination: "Signal Tower" },
    } as never);

    const playerRow = {
      ...createOpeningPlayerRow({ currentLocationId: "loc-1" }),
      currentSceneLocationId: null,
    };
    const mockDb = createEntityLookupDb({
      playerRow,
      locationRows: [
        {
          id: "loc-1",
          campaignId: CAMPAIGN_ID,
          name: "Town Square",
          description: "A bustling square",
          tags: '["urban"]',
          connectedTo: '["loc-2"]',
          isStarting: false,
        },
        {
          id: "loc-2",
          campaignId: CAMPAIGN_ID,
          name: "Signal Tower",
          description: "An old relay station",
          tags: '["elevated"]',
          connectedTo: '["loc-1"]',
          isStarting: false,
        },
      ],
    });
    (getDb as Mock).mockReturnValue(mockDb);

    let capturedSummary: { currentLocationId: string | null; currentSceneScopeId: string | null } | null = null;

    await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Go to the Signal Tower",
          intent: "Travel to the Signal Tower",
          method: "walking to Signal Tower",
          onBeforeVisibleNarration: (summary: HiddenTurnSummary) => {
            capturedSummary = {
              currentLocationId: summary.currentLocationId,
              currentSceneScopeId: summary.currentSceneScopeId,
            };
          },
        }),
      ),
    );

    expect(capturedSummary).toEqual({
      currentLocationId: "loc-2",
      currentSceneScopeId: "loc-2",
    });
  });

  it("does not yield raw generic state_update events for non-location tool results", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The goblin is wounded." },
        {
          type: "tool-result",
          toolName: "add_tag",
          input: { entityName: "Goblin", entityType: "npc", tag: "wounded" },
          output: { success: true, result: { entity: "Goblin", tags: ["wounded"] } },
        },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const stateUpdates = events.filter((e) => e.type === "state_update");
    expect(stateUpdates).toEqual([]);
  });

  it("yields quick_actions event when offer_quick_actions tool is called", async () => {
    const actions = [
      { label: "Loot", action: "Search the body" },
      { label: "Move", action: "Continue down the corridor" },
      { label: "Rest", action: "Take a short rest" },
    ];
    const issuedActions = [
      { ...actions[0]!, handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
      { ...actions[1]!, handle: "qac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" },
      { ...actions[2]!, handle: "qac_cccccccccccccccccccccccccccccccc" },
    ];
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "Victory!" },
        {
          type: "tool-result",
          toolName: "offer_quick_actions",
          input: { actions },
          output: { success: true, result: { actions: issuedActions } },
        },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const quickActions = events.filter((e) => e.type === "quick_actions");
    expect(quickActions).toHaveLength(1);
    expect(quickActions[0]!.data).toEqual({
      actions: issuedActions,
    });
  });

  it("does not invent quick actions when storyteller omits the tool call", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The signal room falls quiet." },
      ],
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events.some((event) => event.type === "quick_actions")).toBe(false);
  });

  it("yields done event as last event with tick", async () => {
    setupMocks();
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const lastEvent = events[events.length - 1];
    expect(lastEvent?.type).toBe("done");
    expect(lastEvent?.data).toHaveProperty("tick");
  });

  it("calls assembleJudgeAdjudicationPrompt with actionResult from Oracle", async () => {
    const { oracleResult } = setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(assembleJudgeAdjudicationPrompt).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        actionResult: oracleResult,
      })
    );
  });

  it("runs hidden adjudication with the judge prompt and executes the returned plan", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(runHiddenAdjudicationPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining("[ACTION RESULT]"),
        messages: expect.any(Array),
      })
    );
    expect(executeAdjudicationPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        tick: expect.any(Number),
        outcomeTier: expect.any(String),
        plan: expect.objectContaining({
          rationale: expect.any(String),
          actions: expect.any(Array),
        }),
      }),
    );
  });

  it("keeps hidden adjudication on the judge lane and visible prose on the storyteller lane", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(runHiddenAdjudicationPlan).toHaveBeenCalled();
    expect(generateText).toHaveBeenCalled();
  });

  it("persists user and assistant messages to chat history", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    // User message persisted
    expect(appendChatMessages).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: "user", content: "I attack the goblin" }),
      ])
    );

    // Assistant message persisted (after stream completes)
    expect(appendChatMessages).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      expect.arrayContaining([
        expect.objectContaining({ role: "assistant" }),
      ])
    );
  });

  it("preserves repeated narration blocks when retry does not produce a better candidate", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The market square falls silent.\n\n" },
        { type: "text-delta", text: "The market square falls silent.\n\n" },
        { type: "text-delta", text: "A bell tolls somewhere beyond the smoke." },
      ],
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(appendChatMessages).toHaveBeenLastCalledWith(
      CAMPAIGN_ID,
      [
        {
          role: "assistant",
          content:
            "The market square falls silent.\n\nThe market square falls silent.\n\nA bell tolls somewhere beyond the smoke.",
          metadata: {
            presentation: {
              authority: "visible_prose_non_authority",
              source: "legacy_final_narration",
            },
          },
        },
      ],
    );
  });

  it("retries the final visible pass once when the model echoes narrator instructions", async () => {
    setupMocks();
    (assembleFinalNarrationPrompt as Mock).mockResolvedValue({
      system: "Visible system",
      prompt: [
        "Advance the scene every paragraph.",
        "Do not repeat an emotional realization once it has landed.",
      ].join("\n"),
      assembledBase: mockAssembledPrompt(),
    });
    (generateText as Mock)
      .mockResolvedValueOnce({
        text: "Advance the scene every paragraph. Do not repeat an emotional realization once it has landed.",
      })
      .mockResolvedValueOnce({
        text: "Steel rang once.\n\nNanami stepped aside and let the warning stand.",
      });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect((generateText as Mock).mock.calls[1]?.[0]?.prompt).toContain(
      "[FINAL VISIBLE PASS CORRECTION]",
    );
    expect(events.filter((event) => event.type === "narrative")).toEqual([
      {
        type: "narrative",
        data: { text: "Steel rang once.\n\nNanami stepped aside and let the warning stand." },
      },
    ]);
  });

  it("retries the same final visible storyteller pass after a transient transport error", async () => {
    setupMocks();
    (generateText as Mock)
      .mockRejectedValueOnce(new Error("network error"))
      .mockResolvedValueOnce({
        text: "The warning came as a hand on the doorframe.\n\nNo one stepped through.",
      });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect((generateText as Mock).mock.calls[1]?.[0]?.prompt).not.toContain(
      "[FINAL VISIBLE PASS CORRECTION]",
    );
    expect(events.filter((event) => event.type === "narrative")).toEqual([
      {
        type: "narrative",
        data: {
          text: "The warning came as a hand on the doorframe.\n\nNo one stepped through.",
        },
      },
    ]);
  });

  it("retries the final visible storyteller pass after a provider timeout", async () => {
    setupMocks();
    (generateText as Mock)
      .mockRejectedValueOnce(new Error("AI SDK timeout after 60000ms"))
      .mockResolvedValueOnce({
        text: "The warden lets the silence stretch, then taps the ledger for an answer.",
      });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect((generateText as Mock).mock.calls[1]?.[0]?.prompt).not.toContain(
      "[FINAL VISIBLE PASS CORRECTION]",
    );
    expect(events.filter((event) => event.type === "narrative")).toEqual([
      {
        type: "narrative",
        data: {
          text: "The warden lets the silence stretch, then taps the ledger for an answer.",
        },
      },
    ]);
  });

  it("bounds final visible storyteller calls with a timeout and output cap", async () => {
    setupMocks();

    await collectEvents(processTurn(createTestOptions({ storytellerMaxTokens: 32_000 })));

    const call = (generateText as Mock).mock.calls[0]?.[0];
    expect(call).toMatchObject({
      maxOutputTokens: 4096,
      timeout: { totalMs: DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS },
    });
  });

  it("retries the final visible pass once when the opening lead restarts in a later paragraph", async () => {
    setupMocks();
    (generateText as Mock)
      .mockResolvedValueOnce({
        text: [
          "The tunnel held its breath.",
          "The tunnel held its breath. Water clicked somewhere deeper in the dark.",
        ].join("\n\n"),
      })
      .mockResolvedValueOnce({
        text: [
          "The tunnel held its breath.",
          "Water clicked somewhere deeper in the dark.",
        ].join("\n\n"),
      });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(events.filter((event) => event.type === "narrative")).toEqual([
      {
        type: "narrative",
        data: { text: "The tunnel held its breath.\n\nWater clicked somewhere deeper in the dark." },
      },
    ]);
  });

  it("retries the final visible pass once for a high-signal slop cluster", async () => {
    setupMocks();
    (generateText as Mock)
      .mockResolvedValueOnce({
        text: "Here's the thing: The answer isn't force. It's patience.",
      })
      .mockResolvedValueOnce({
        text: "Force would only wake the nest. Patience kept the passage quiet.",
      });

    await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    const retryPrompt = (generateText as Mock).mock.calls[1]?.[0]?.prompt as string;
    expect(retryPrompt).toContain("Replace generic tension with one local action");
    expect(retryPrompt).toContain("concrete change first");
    expect(appendChatMessages).toHaveBeenLastCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "Force would only wake the nest. Patience kept the passage quiet.",
        metadata: {
          presentation: {
            authority: "visible_prose_non_authority",
            source: "legacy_final_narration",
          },
        },
      },
    ]);
  });

  it("does not slice leaked [NPC STATES] into misleading partial narration", async () => {
    setupMocks();
    (generateText as Mock)
      .mockResolvedValueOnce({
        text: [
          "The market square falls silent.",
          "[NPC STATES]",
          "Hidden state that should never reach the player.",
        ].join("\n\n"),
      })
      .mockResolvedValueOnce({
        text: "A cart wheel creaks once. The crowd parts around the spilled apples.",
      });

    await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect((generateText as Mock).mock.calls[1]?.[0]?.prompt).toContain(
      "Do not include headers, bracketed sections, or tool-call syntax",
    );
    expect(appendChatMessages).toHaveBeenLastCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "A cart wheel creaks once. The crowd parts around the spilled apples.",
        metadata: {
          presentation: {
            authority: "visible_prose_non_authority",
            source: "legacy_final_narration",
          },
        },
      },
    ]);
    expect(appendChatMessages).not.toHaveBeenCalledWith(CAMPAIGN_ID, [
      { role: "assistant", content: "The market square falls silent." },
    ]);
  });

  it("retries regex-only residual leaks but does not abort when retry still matches", async () => {
    setupMocks();
    const initialText = [
      "The market square falls silent.",
      "[NPC STATES]",
      "Hidden state that should never reach the player.",
    ].join("\n\n");
    const retryText = [
      "A cart wheel creaks once beside the spilled apples.",
      "[NPC STATES]",
      "The crowd keeps its distance from the shuttered stall.",
    ].join("\n\n");
    (generateText as Mock)
      .mockResolvedValueOnce({ text: initialText })
      .mockResolvedValueOnce({ text: retryText });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(2);
    expect((generateText as Mock).mock.calls[1]?.[0]?.prompt).toContain(
      "Do not include headers, bracketed sections, or tool-call syntax",
    );
    expect(events.filter((event) => event.type === "narrative")).toEqual([
      {
        type: "narrative",
        data: { text: retryText },
      },
    ]);
    expect(appendChatMessages).toHaveBeenLastCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: retryText,
        metadata: {
          presentation: {
            authority: "visible_prose_non_authority",
            source: "legacy_final_narration",
          },
        },
      },
    ]);
  });

  it("increments tick after completion", async () => {
    setupMocks();
    const options = createTestOptions();

    await collectEvents(processTurn(options));

    expect(incrementTick).toHaveBeenCalledWith(CAMPAIGN_ID);
  });

  it("calls post-turn callback with summary if provided", async () => {
    setupMocks();
    const onPostTurn = vi.fn();
    const options = createTestOptions({ onPostTurn });

    await collectEvents(processTurn(options));

    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: expect.any(Number),
        oracleResult: expect.any(Object),
        toolCalls: expect.any(Array),
        narrativeText: expect.any(String),
      })
    );
  });

  it("D-02/D-03 emits finalizing_turn and waits for rollback-critical post-turn work before done", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The goblin falls." },
        {
          type: "tool-result",
          toolName: "offer_quick_actions",
          input: {
            actions: [
              { label: "Loot", action: "Loot the goblin" },
              { label: "Watch", action: "Watch for movement" },
              { label: "Leave", action: "Leave the room" },
            ],
          },
          output: {
            success: true,
            result: {
              actions: [
                {
                  label: "Loot",
                  action: "Loot the goblin",
                  handle: "qac_dddddddddddddddddddddddddddddddd",
                },
                {
                  label: "Watch",
                  action: "Watch for movement",
                  handle: "qac_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
                },
                {
                  label: "Leave",
                  action: "Leave the room",
                  handle: "qac_ffffffffffffffffffffffffffffffff",
                },
              ],
            },
          },
        },
      ],
    });

    let resolvePostTurn: (() => void) | null = null;
    const onPostTurn = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolvePostTurn = resolve;
        }),
    );

    const generator = processTurn(createTestOptions({ onPostTurn }));
    const observedTypes: string[] = [];

    for (let i = 0; i < 8; i += 1) {
      const step = await generator.next();
      if (step.done) break;
      observedTypes.push(step.value.type);
      if (step.value.type === "finalizing_turn") {
        break;
      }
    }

    expect(observedTypes).toContain("finalizing_turn");

    let doneResolved = false;
    const pendingDone = generator.next().then((result) => {
      doneResolved = true;
      return result;
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(onPostTurn).toHaveBeenCalledTimes(1);
    expect(doneResolved).toBe(false);

    const finishPostTurn = resolvePostTurn as (() => void) | null;
    if (finishPostTurn) {
      finishPostTurn();
    }

    const doneStep = await pendingDone;
    expect(doneStep.done).toBe(false);
    expect(doneStep.value).toEqual({
      type: "done",
      data: expect.objectContaining({ tick: 6 }),
    });
  });

  it("does not fail rollback-critical finalization after the old finalization ceiling", async () => {
    vi.useFakeTimers();

    try {
      setupMocks({
        streamParts: [
          { type: "text-delta", text: "The goblin falls." },
          {
            type: "tool-result",
            toolName: "offer_quick_actions",
              input: {
                actions: [
                  { label: "Loot", action: "Loot the goblin" },
                  { label: "Watch", action: "Watch for movement" },
                  { label: "Leave", action: "Leave the room" },
                ],
              },
              output: {
                success: true,
                result: {
                  actions: [
                    {
                      label: "Loot",
                      action: "Loot the goblin",
                      handle: "qac_11111111111111111111111111111111",
                    },
                    {
                      label: "Watch",
                      action: "Watch for movement",
                      handle: "qac_22222222222222222222222222222222",
                    },
                    {
                      label: "Leave",
                      action: "Leave the room",
                      handle: "qac_33333333333333333333333333333333",
                    },
                  ],
                },
              },
          },
        ],
      });

      let resolvePostTurn: (() => void) | null = null;
      const generator = processTurn(
        createTestOptions({
          onPostTurn: () =>
            new Promise<void>((resolve) => {
              resolvePostTurn = resolve;
            }),
        }),
      );

      let sawFinalizing = false;
      for (let i = 0; i < 8; i += 1) {
        const step = await generator.next();
        if (step.done) break;
        if (step.value.type === "finalizing_turn") {
          sawFinalizing = true;
          break;
        }
      }

      expect(sawFinalizing).toBe(true);

      let settled = false;
      const pendingDone = generator.next().then((result) => {
        settled = true;
        return result;
      });
      await vi.advanceTimersByTimeAsync(20 * 60_000 + 1);

      expect(settled).toBe(false);

      const finishPostTurn = resolvePostTurn as (() => void) | null;
      if (finishPostTurn) {
        finishPostTurn();
      }
      const doneStep = await pendingDone;
      expect(doneStep.done).toBe(false);
      expect(doneStep.value).toEqual({
        type: "done",
        data: expect.objectContaining({ tick: 6 }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  describe("movement in turn processing", () => {
    it("yields location_change state_update when moving to connected location", async () => {
      vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isMovement: true, destination: "the tavern" } } as never);

      const playerRow = {
        id: "player-1",
        name: "Hero",
        tags: '["warrior"]',
        currentLocationId: "loc-1",
      };
      const currentLocation = {
        id: "loc-1",
        name: "Town Square",
        description: "A bustling square",
        tags: '["urban"]',
        connectedTo: '["loc-2","loc-3"]',
      };
      const destLocation = {
        id: "loc-2",
        name: "The Tavern",
        description: "A cozy tavern",
        tags: '["indoor"]',
        connectedTo: '["loc-1"]',
      };

      const allLocations = [currentLocation, destLocation];
      const edgeRows = [
        {
          id: "edge-1",
          campaignId: CAMPAIGN_ID,
          fromLocationId: "loc-1",
          toLocationId: "loc-2",
          travelCost: 1,
          discovered: true,
        },
        {
          id: "edge-2",
          campaignId: CAMPAIGN_ID,
          fromLocationId: "loc-2",
          toLocationId: "loc-1",
          travelCost: 1,
          discovered: true,
        },
      ];

      // Track which table is being queried via from()
      let lastFromTable: unknown = null;
      const mockRun = vi.fn();

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation((table: unknown) => {
          lastFromTable = table;
          return mockDb;
        }),
        where: vi.fn().mockImplementation(() => {
          // Return different results based on which table was last queried
          if (lastFromTable === (players as unknown)) {
            return {
              get: vi.fn().mockReturnValue(playerRow),
              all: vi.fn().mockReturnValue([playerRow]),
            };
          }
          if (lastFromTable === (locations as unknown)) {
            return {
              get: vi.fn().mockReturnValue(currentLocation),
              all: vi.fn().mockReturnValue(allLocations),
            };
          }
          if (lastFromTable === (locationEdges as unknown)) {
            return {
              get: vi.fn().mockReturnValue(edgeRows[0]),
              all: vi.fn().mockReturnValue(edgeRows),
            };
          }
          return {
            get: vi.fn().mockReturnValue(null),
            all: vi.fn().mockReturnValue([]),
          };
        }),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              run: mockRun,
            })),
          })),
        })),
      };

      (getDb as Mock).mockReturnValue(mockDb);
      (callOracle as Mock).mockResolvedValue(mockOracleResult());
      (assembleJudgeAdjudicationPrompt as Mock).mockResolvedValue({
        system: "Judge adjudication system",
        messages: [{ role: "user", content: "go to the tavern" }],
        assembledBase: mockAssembledPrompt(),
      });
      (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
      (advanceCampaignTick as Mock).mockReturnValue(6);
      (incrementTick as Mock).mockReturnValue(6);
      (runHiddenAdjudicationPlan as Mock).mockResolvedValue({
        rationale: "Movement was already resolved before hidden adjudication.",
        actions: [],
      });
      (executeAdjudicationPlan as Mock).mockResolvedValue({
        toolCallResults: [],
        emittedEvents: [],
        quickActionsEmitted: false,
        successfulTravel: null,
      });

      const options = createTestOptions({
        playerAction: "go to the tavern",
        intent: "Travel to the tavern",
        method: "walking",
      });

      const events = await collectEvents(processTurn(options));

      const locationChanges = events.filter(
        (e) => e.type === "state_update" && (e.data as Record<string, unknown>).type === "location_change"
      );
      expect(locationChanges).toHaveLength(1);
      expect(locationChanges[0]!.data).toEqual({
        type: "location_change",
        locationId: "loc-2",
        locationName: "The Tavern",
        travelCost: 1,
        tickAdvance: 1,
        path: ["Town Square", "The Tavern"],
      });
      expect(advanceCampaignTick).toHaveBeenCalledWith(CAMPAIGN_ID, 1);
    });

    it("treats travel to the current location as a deterministic no-op", async () => {
      vi.mocked(safeGenerateObject).mockResolvedValue({
        object: { isMovement: true, destination: "Town Square" },
      } as never);

      const playerRow = {
        id: "player-1",
        campaignId: CAMPAIGN_ID,
        name: "Hero",
        tags: '["warrior"]',
        equippedItems: "[]",
        race: "Human",
        gender: "",
        age: "",
        appearance: "",
        currentLocationId: "loc-1",
        characterRecord: JSON.stringify({
          identity: {
            id: "player-1",
            campaignId: CAMPAIGN_ID,
            role: "player",
            tier: "key",
            displayName: "Hero",
            canonicalStatus: "original",
          },
          profile: {
            species: "Human",
            gender: "",
            ageText: "",
            appearance: "",
            backgroundSummary: "",
            personaSummary: "",
          },
          socialContext: {
            factionId: null,
            factionName: null,
            homeLocationId: null,
            homeLocationName: null,
            currentLocationId: "loc-1",
            currentLocationName: "Town Square",
            relationshipRefs: [],
            socialStatus: [],
            originMode: "resident",
          },
          motivations: {
            shortTermGoals: [],
            longTermGoals: [],
            beliefs: [],
            drives: [],
            frictions: [],
          },
          capabilities: {
            traits: [],
            skills: [],
            flaws: [],
            specialties: [],
            wealthTier: null,
          },
          state: {
            hp: 5,
            conditions: [],
            statusFlags: [],
            activityState: "active",
          },
          loadout: {
            inventorySeed: [],
            equippedItemRefs: [],
            currencyNotes: "",
            signatureItems: [],
          },
          startConditions: {},
          provenance: {
            sourceKind: "generator",
            importMode: null,
            templateId: null,
            archetypePrompt: null,
            worldgenOrigin: null,
            legacyTags: [],
          },
        }),
        derivedTags: "[]",
      };
      const currentLocation = {
        id: "loc-1",
        campaignId: CAMPAIGN_ID,
        name: "Town Square",
        description: "A bustling square",
        tags: '["urban"]',
        connectedTo: '["loc-2"]',
        isStarting: true,
      };
      const edgeRows = [
        {
          id: "edge-1",
          campaignId: CAMPAIGN_ID,
          fromLocationId: "loc-1",
          toLocationId: "loc-2",
          travelCost: 1,
          discovered: true,
        },
      ];

      const mockDb = createEntityLookupDb({
        playerRow,
        locationRows: [currentLocation],
        edgeRows,
      });

      (getDb as Mock).mockReturnValue(mockDb);
      (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });

      const events = await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "go to Town Square",
            intent: "Travel to Town Square",
            method: "walking back to the square",
          }),
        ),
      );

      expect(events).toEqual([
        { type: "narrative", data: { text: "You remain at Town Square." } },
        { type: "done", data: { tick: 5 } },
      ]);
      expect(events).not.toContainEqual(
        expect.objectContaining({
          type: "state_update",
          data: expect.objectContaining({ type: "location_change" }),
        }),
      );
      expect(appendChatMessages).toHaveBeenNthCalledWith(1, CAMPAIGN_ID, [
        { role: "user", content: "go to Town Square" },
      ]);
      expect(appendChatMessages).toHaveBeenNthCalledWith(2, CAMPAIGN_ID, [
        {
          role: "assistant",
          content: "You remain at Town Square.",
          metadata: {
            presentation: {
              authority: "visible_prose_non_authority",
              source: "deterministic_noop",
            },
          },
        },
      ]);
      expect(callOracle).not.toHaveBeenCalled();
      expect(runHiddenAdjudicationPlan).not.toHaveBeenCalled();
      expect(advanceCampaignTick).not.toHaveBeenCalled();
      expect(incrementTick).not.toHaveBeenCalled();
    });

    it("does not block movement to non-connected location, passes through to Oracle", async () => {
      vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isMovement: true, destination: "the tavern" } } as never);

      const playerRow = {
        id: "player-1",
        name: "Hero",
        tags: '["warrior"]',
        currentLocationId: "loc-1",
      };
      const currentLocation = {
        id: "loc-1",
        name: "Town Square",
        description: "A bustling square",
        tags: '["urban"]',
        connectedTo: '["loc-3"]', // loc-2 NOT connected
      };
      const destLocation = {
        id: "loc-2",
        name: "The Tavern",
        description: "A cozy tavern",
        tags: '["indoor"]',
        connectedTo: '["loc-1"]',
      };

      const allLocations = [currentLocation, destLocation];
      let lastFromTable: unknown = null;

      const mockDb = {
        select: vi.fn().mockReturnThis(),
        from: vi.fn().mockImplementation((table: unknown) => {
          lastFromTable = table;
          return mockDb;
        }),
        where: vi.fn().mockImplementation(() => {
          if (lastFromTable === (players as unknown)) {
            return {
              get: vi.fn().mockReturnValue(playerRow),
              all: vi.fn().mockReturnValue([playerRow]),
            };
          }
          if (lastFromTable === (locations as unknown)) {
            return {
              get: vi.fn().mockReturnValue(currentLocation),
              all: vi.fn().mockReturnValue(allLocations),
            };
          }
          return {
            get: vi.fn().mockReturnValue(null),
            all: vi.fn().mockReturnValue([]),
          };
        }),
        update: vi.fn().mockImplementation(() => ({
          set: vi.fn().mockImplementation(() => ({
            where: vi.fn().mockImplementation(() => ({
              run: vi.fn(),
            })),
          })),
        })),
      };

      (getDb as Mock).mockReturnValue(mockDb);
      (callOracle as Mock).mockResolvedValue(mockOracleResult());
      (assembleJudgeAdjudicationPrompt as Mock).mockResolvedValue({
        system: "Judge adjudication system",
        messages: [{ role: "user", content: "go to the tavern" }],
        assembledBase: mockAssembledPrompt(),
      });
      (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
      (incrementTick as Mock).mockReturnValue(6);
      (runHiddenAdjudicationPlan as Mock).mockResolvedValue({
        rationale: "No hidden action is needed when movement does not resolve locally.",
        actions: [],
      });
      (executeAdjudicationPlan as Mock).mockResolvedValue({
        toolCallResults: [],
        emittedEvents: [],
        quickActionsEmitted: false,
        successfulTravel: null,
      });

      const options = createTestOptions({
        playerAction: "go to the tavern",
        intent: "Travel to the tavern",
        method: "walking",
      });

      const events = await collectEvents(processTurn(options));

      // Should NOT have a location_change event (not connected)
      const locationChanges = events.filter(
        (e) => e.type === "state_update" && (e.data as Record<string, unknown>).type === "location_change"
      );
      expect(locationChanges).toHaveLength(0);

      // Oracle should still be called (action proceeds normally)
      expect(callOracle).toHaveBeenCalled();
    });
  });

  it("yields whatever oracle result the oracle layer returns without adding turn-level fallback behavior", async () => {
    const oracleResult = {
      chance: 50,
      roll: 42,
      outcome: "weak_hit" as const,
      reasoning: "Tight opening, partial success.",
    };
    setupMocks({ oracleResult });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    expect(events[0]).toEqual({
      type: "oracle_result",
      data: {
        chance: oracleResult.chance,
        roll: oracleResult.roll,
        outcome: oracleResult.outcome,
      },
    });
    expect(JSON.stringify(events[0])).not.toContain(oracleResult.reasoning);
  });

  it("derives Oracle actor tags from canonical player records instead of raw stored tags", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: false, destination: null },
    } as never);

    const playerRow = {
      id: "player-1",
      name: "Hero",
      hp: 4,
      tags: '["legacy-only"]',
      characterRecord: JSON.stringify({
        identity: {
          id: "player-1",
          campaignId: CAMPAIGN_ID,
          role: "player",
          tier: "key",
          displayName: "Hero",
          canonicalStatus: "original",
        },
        profile: {
          species: "Human",
          gender: "",
          ageText: "",
          appearance: "",
          backgroundSummary: "",
          personaSummary: "",
        },
        socialContext: {
          factionId: null,
          factionName: null,
          homeLocationId: null,
          homeLocationName: null,
          currentLocationId: "loc-1",
          currentLocationName: "Town Square",
          relationshipRefs: [],
          socialStatus: ["Wanted"],
          originMode: "resident",
        },
        motivations: {
          shortTermGoals: [],
          longTermGoals: [],
          beliefs: [],
          drives: ["Curious"],
          frictions: [],
        },
        capabilities: {
          traits: ["Brave"],
          skills: [{ name: "Swordsman", tier: "Skilled" }],
          flaws: [],
          specialties: [],
          wealthTier: "Poor",
        },
        state: {
          hp: 4,
          conditions: ["Wounded"],
          statusFlags: [],
          activityState: "active",
        },
        loadout: {
          inventorySeed: [],
          equippedItemRefs: [],
          currencyNotes: "",
          signatureItems: [],
        },
        startConditions: {},
        provenance: {
          sourceKind: "generator",
          importMode: null,
          templateId: null,
          archetypePrompt: null,
          worldgenOrigin: null,
          legacyTags: ["legacy-only"],
        },
      }),
      derivedTags: '["legacy-only"]',
      currentLocationId: "loc-1",
    };
    const locationRow = {
      id: "loc-1",
      name: "Town Square",
      description: "A busy square",
      tags: '["urban"]',
      connectedTo: "[]",
    };

    let lastFromTable: unknown = null;
    const mockDb = {
      select: vi.fn().mockReturnThis(),
      from: vi.fn().mockImplementation((table: unknown) => {
        lastFromTable = table;
        return mockDb;
      }),
      where: vi.fn().mockImplementation(() => {
        if (lastFromTable === (players as unknown)) {
          return {
            get: vi.fn().mockReturnValue(playerRow),
            all: vi.fn().mockReturnValue([playerRow]),
          };
        }
        if (lastFromTable === (locations as unknown)) {
          return {
            get: vi.fn().mockReturnValue(locationRow),
            all: vi.fn().mockReturnValue([locationRow]),
          };
        }
        return {
          get: vi.fn().mockReturnValue(null),
          all: vi.fn().mockReturnValue([]),
        };
      }),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => ({
            run: vi.fn(),
          })),
        })),
      })),
    };

    (getDb as Mock).mockReturnValue(mockDb);
    (callOracle as Mock).mockResolvedValue(mockOracleResult());
    (assembleJudgeAdjudicationPrompt as Mock).mockResolvedValue({
      system: "Judge adjudication system",
      messages: [{ role: "user", content: "I attack the goblin" }],
      assembledBase: mockAssembledPrompt(),
    });
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (incrementTick as Mock).mockReturnValue(6);
    (runHiddenAdjudicationPlan as Mock).mockResolvedValue({
      rationale: "No extra hidden action is required for this assertion.",
      actions: [],
    });
    (executeAdjudicationPlan as Mock).mockResolvedValue({
      toolCallResults: [],
      emittedEvents: [],
      quickActionsEmitted: false,
      successfulTravel: null,
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(callOracle).toHaveBeenCalledWith(
      expect.objectContaining({
        actorTags: [
          "Brave",
          "Skilled Swordsman",
          "Poor",
          "Wounded",
          "Wanted",
          "Curious",
        ],
      }),
      expect.anything(),
    );
  });

  it("translates structured start conditions into opening-scene Oracle modifiers and companion context", async () => {
    setupMocks();
    const playerRow = createOpeningPlayerRow();
    const mockDb = createEntityLookupDb({
      playerRow,
      locationRows: [
        {
          id: "loc-1",
          campaignId: CAMPAIGN_ID,
          name: "Town Square",
          description: "A busy square ringed by food stalls.",
          tags: '["urban", "crowded"]',
          connectedTo: "[]",
          isStarting: true,
        },
      ],
    });

    (getDb as Mock).mockReturnValue(mockDb);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 0 });

    await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Slip between the stalls and keep moving",
          intent: "Escape the tail in the market",
          method: "quick evasive movement",
        }),
      ),
    );

    expect(callOracle).toHaveBeenCalledWith(
      expect.objectContaining({
        actorTags: expect.arrayContaining([
          "Opening: Arrival - On Foot",
          "Opening: Visibility - Noticed",
          "Opening: Pressure - Under Watch",
          "Opening: Pressure - Clock Running Out",
          "Opening: Companion Present",
          "Opening: Situation - Pursued",
        ]),
        sceneContext: expect.stringContaining("Opening Companions: Mira"),
      }),
      expect.anything(),
    );

    expect(callOracle).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneContext: expect.stringContaining("Opening Constraints:"),
      }),
      expect.anything(),
    );
  });

  it("expires opening-state flags after the early-turn ceiling for the next persisted turn boundary", async () => {
    setupMocks();
    const playerRow = createOpeningPlayerRow({
      statusFlags: [
        "Opening: Arrival - On Foot",
        "Opening: Visibility - Noticed",
        "Opening: Pressure - Under Watch",
        "Opening: Companion Present",
        "Opening: Situation - Pursued",
      ],
    });
    const mockDb = createEntityLookupDb({ playerRow });

    (getDb as Mock).mockReturnValue(mockDb);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 2 });
    (incrementTick as Mock).mockReturnValue(3);

    await collectEvents(processTurn(createTestOptions()));

    expect(mockDb.update).toHaveBeenCalled();
  });

  it("clears opening-state flags for persisted player state after a connected location change", async () => {
    setupMocks();
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: true, destination: "Safehouse" },
    } as never);

    const playerRow = createOpeningPlayerRow({
      currentLocationId: "loc-1",
      startLocationId: "loc-1",
      statusFlags: [
        "Opening: Arrival - On Foot",
        "Opening: Visibility - Noticed",
        "Opening: Pressure - Under Watch",
        "Opening: Companion Present",
        "Opening: Situation - Pursued",
      ],
    });
    const mockDb = createEntityLookupDb({
      playerRow,
      locationRows: [
        {
          id: "loc-1",
          campaignId: CAMPAIGN_ID,
          name: "Town Square",
          description: "A busy square ringed by food stalls.",
          tags: '["urban", "crowded"]',
          connectedTo: '["loc-2"]',
          isStarting: true,
        },
        {
          id: "loc-2",
          campaignId: CAMPAIGN_ID,
          name: "Safehouse",
          description: "A shuttered safehouse down a side alley.",
          tags: '["hidden", "indoors"]',
          connectedTo: '["loc-1"]',
          isStarting: false,
        },
      ],
    });
    (getDb as Mock).mockReturnValue(mockDb);
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 1 });

    await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Go to the Safehouse",
          intent: "Travel to the Safehouse",
          method: "moving quickly toward the Safehouse",
        }),
      ),
    );

    expect(mockDb.update).toHaveBeenCalled();
  });

  it("keeps judge adjudication prompt outcome-specific and free of storyteller tool policy", async () => {
    setupMocks({
      oracleResult: {
        chance: 55,
        roll: 42,
        outcome: "weak_hit",
        reasoning: "The action works, but the situation stays unstable.",
      },
    });

    await collectEvents(processTurn(createTestOptions()));

    const adjudicationArgs = (runHiddenAdjudicationPlan as Mock).mock.calls[0]![0] as {
      system: string;
    };

    expect(adjudicationArgs.system).toContain("[ACTION RESULT]");
    expect(adjudicationArgs.system).toContain("Outcome: weak_hit");
    expect(adjudicationArgs.system).not.toContain("After narration, you MUST call offer_quick_actions");
    expect(adjudicationArgs.system).not.toContain("light hit = -1");
  });

  it("injects OUTCOME BOUNDS into hidden and final narration flows for eligible hostile combat", async () => {
    setupMocks();
    const mockDb = createEntityLookupDb({
      playerRow: createPoweredPlayerRow(),
      npcRows: [createPoweredNpcRow()],
    });
    (getDb as Mock).mockReturnValue(mockDb);
    (assembleFinalNarrationPrompt as Mock).mockImplementation(async (options) => ({
      system: "Final narration system",
      prompt: options.outcomeBounds
        ? `Final narration prompt\n\n[OUTCOME BOUNDS]\nSummary: ${options.outcomeBounds.summary}`
        : "Final narration prompt",
      assembledBase: mockAssembledPrompt(),
    }));

    await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Strike the Goblin Raider with my sword",
          intent: "Strike the Goblin Raider",
          method: "Skilled sword slash at Goblin Raider",
        }),
      ),
    );

    const hiddenArgs = (runHiddenAdjudicationPlan as Mock).mock.calls[0]?.[0] as { system: string };
    expect(hiddenArgs.system).toContain("[OUTCOME BOUNDS]");
    expect(hiddenArgs.system).toContain("Truthful read:");

    const finalArgs = (assembleFinalNarrationPrompt as Mock).mock.calls.at(-1)?.[0] as
      | { outcomeBounds?: { summary: string } }
      | undefined;
    expect(finalArgs?.outcomeBounds?.summary).toContain("Truthful read:");
    expect((generateText as Mock).mock.calls.at(-1)?.[0]?.prompt).toContain("[OUTCOME BOUNDS]");
    expect(logEventMock).toHaveBeenCalledWith(
      "combat.bounds.derived",
      expect.objectContaining({
        source: "player",
        outcome: "strong_hit",
        matchup: expect.any(String),
      }),
    );
  });

  it("runs world-brain after Oracle and before judge hidden adjudication on normal turns", async () => {
    setupMocks();

    await collectEvents(processTurn(createTestOptions()));

    expect(callOracle).toHaveBeenCalled();
    expect(runWorldBrainSceneDirection).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: expect.objectContaining({
          runSource: "player-turn",
          oracleOutcome: "strong_hit",
        }),
      }),
    );
    expect(
      vi.mocked(callOracle).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(runWorldBrainSceneDirection).mock.invocationCallOrder[0]);
    expect(
      vi.mocked(runWorldBrainSceneDirection).mock.invocationCallOrder[0],
    ).toBeLessThan((runHiddenAdjudicationPlan as Mock).mock.invocationCallOrder[0]);

    const hiddenPromptArgs = (assembleJudgeAdjudicationPrompt as Mock).mock.calls[0]?.[0] as
      | { worldBrainDirection?: { sceneQuestion?: string } }
      | undefined;
    expect(hiddenPromptArgs?.worldBrainDirection).toEqual(
      expect.objectContaining({
        sceneQuestion: expect.any(String),
      }),
    );
  });

  it("threads world-brain through SceneAssembly so final narration reads the authoritative packet", async () => {
    setupMocks();

    await collectEvents(processTurn(createTestOptions()));

    const finalArgs = (assembleFinalNarrationPrompt as Mock).mock.calls.at(-1)?.[0] as
      | { sceneAssembly?: { sceneDirection?: unknown; playerPerceivableSceneDirection?: unknown }; worldBrainDirection?: unknown }
      | undefined;

    expect(finalArgs?.sceneAssembly?.sceneDirection).toEqual(
      expect.objectContaining({
        situationSummary: expect.any(String),
        sceneQuestion: expect.any(String),
      }),
    );
    expect(finalArgs?.sceneAssembly?.playerPerceivableSceneDirection).toEqual(
      expect.objectContaining({
        situationSummary: expect.any(String),
        sceneQuestion: expect.any(String),
      }),
    );
    expect(finalArgs?.worldBrainDirection).toBeUndefined();
  });

  it("keeps no-envelope prompt parity by omitting OUTCOME BOUNDS on the pre-phase path", async () => {
    setupMocks();
    (assembleFinalNarrationPrompt as Mock).mockImplementation(async (options) => ({
      system: "Final narration system",
      prompt: options.outcomeBounds
        ? `Final narration prompt\n\n[OUTCOME BOUNDS]\nSummary: ${options.outcomeBounds.summary}`
        : "Final narration prompt",
      assembledBase: mockAssembledPrompt(),
    }));

    await collectEvents(processTurn(createTestOptions()));

    const hiddenArgs = (runHiddenAdjudicationPlan as Mock).mock.calls[0]?.[0] as { system: string };
    expect(hiddenArgs.system).not.toContain("[OUTCOME BOUNDS]");

    const finalArgs = (assembleFinalNarrationPrompt as Mock).mock.calls.at(-1)?.[0] as
      | { outcomeBounds?: unknown }
      | undefined;
    expect(finalArgs?.outcomeBounds).toBeUndefined();
    expect((generateText as Mock).mock.calls.at(-1)?.[0]?.prompt).toBe("Final narration prompt");
    expect(logEventMock).not.toHaveBeenCalledWith(
      "combat.bounds.derived",
      expect.anything(),
    );
  });

  it("detectVisibleNarrationFailures accepts factual OUTCOME BOUNDS blocks without echo false-positives", () => {
    const prompt = [
      "Town Square state.",
      "[OUTCOME BOUNDS]",
      "Summary: Truthful read: contested strong hit wins a meaningful beat, not the whole fight at once.",
      "Ceiling: The beat can win a short exchange, mark the body, or expose a weakness.",
      "Floor: A real cost lands on the target.",
      "Constraint: An effortless rout or total shutout is outside this envelope.",
    ].join("\n");

    expect(
      detectVisibleNarrationFailures(
        "Steel flashed once. The raider gave ground and lost the gate line.",
        {
          system: "Visible system",
          prompt,
        },
      ),
    ).toEqual([]);
  });

  it("uses resolveTravelPath travel cost for multi-edge movement instead of adjacency-only teleport movement", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValue({
      object: { isMovement: true, destination: "Tokyo Jujutsu High" },
    } as never);

    const mockDb = createEntityLookupDb({
      playerRow: createOpeningPlayerRow({ currentLocationId: "loc-shibuya" }),
      locationRows: [
        {
          id: "loc-shibuya",
          campaignId: CAMPAIGN_ID,
          name: "Shibuya Crossing",
          description: "A packed district of neon and pedestrian flow.",
          tags: '["macro"]',
          connectedTo: '["loc-station"]',
          isStarting: true,
        },
        {
          id: "loc-station",
          campaignId: CAMPAIGN_ID,
          name: "Hidden Station Platform",
          description: "A persistent sublocation below the district.",
          tags: '["persistent_sublocation"]',
          connectedTo: '["loc-shibuya","loc-school"]',
          isStarting: false,
        },
        {
          id: "loc-school",
          campaignId: CAMPAIGN_ID,
          name: "Tokyo Jujutsu High",
          description: "A hilltop academy beyond the city rail lines.",
          tags: '["macro"]',
          connectedTo: '["loc-station"]',
          isStarting: false,
        },
      ],
    });

    (getDb as Mock).mockReturnValue(mockDb);
    (callOracle as Mock).mockResolvedValue(mockOracleResult());
    (assembleJudgeAdjudicationPrompt as Mock).mockResolvedValue({
      system: "Judge adjudication system",
      messages: [{ role: "user", content: "Travel to Tokyo Jujutsu High" }],
      assembledBase: mockAssembledPrompt(),
    });
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 12 });
    (advanceCampaignTick as Mock).mockReturnValue(14);
    (incrementTick as Mock).mockReturnValue(13);
    (runHiddenAdjudicationPlan as Mock).mockResolvedValue({
      rationale: "Resolved travel already moved the player before hidden adjudication.",
      actions: [],
    });
    (executeAdjudicationPlan as Mock).mockResolvedValue({
      toolCallResults: [],
      emittedEvents: [],
      quickActionsEmitted: false,
      successfulTravel: null,
    });

    const events = await collectEvents(
      processTurn(
        createTestOptions({
          playerAction: "Travel to Tokyo Jujutsu High",
          intent: "Travel to Tokyo Jujutsu High",
          method: "taking the fastest believable route",
        }),
      ),
    );

    expect(events).toContainEqual({
      type: "state_update",
      data: {
        type: "location_change",
        locationId: "loc-school",
        locationName: "Tokyo Jujutsu High",
        travelCost: 2,
        tickAdvance: 2,
        path: ["Shibuya Crossing", "Hidden Station Platform", "Tokyo Jujutsu High"],
      },
    });
    expect(advanceCampaignTick).toHaveBeenCalledWith(CAMPAIGN_ID, 2);
    expect(incrementTick).not.toHaveBeenCalled();
  });

  describe("target-aware oracle", () => {
    it("passes combatEnvelope for hostile character-target actions when both sides have power stats", async () => {
      setupMocks();
      const mockDb = createEntityLookupDb({
        playerRow: createPoweredPlayerRow(),
        npcRows: [createPoweredNpcRow()],
      });

      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Strike the Goblin Raider with my sword",
            intent: "Strike the Goblin Raider",
            method: "Skilled sword slash at Goblin Raider",
          }),
        ),
      );

      const oraclePayload = (callOracle as Mock).mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;

      expect(oraclePayload?.combatEnvelope).toMatchObject({
        matchup: expect.any(String),
        durabilityTierGap: expect.any(Number),
        actorBypassesTarget: expect.any(Boolean),
      });
    });

    it("omits combatEnvelope for non-hostile actions even when a target resolves", async () => {
      setupMocks();
      const mockDb = createEntityLookupDb({
        playerRow: createPoweredPlayerRow(),
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A bustling square",
            tags: '["urban", "crowded"]',
            connectedTo: "[]",
            isStarting: false,
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Signal Tower",
            description: "An old relay station",
            tags: '["elevated", "exposed", "arcane-device"]',
            connectedTo: "[]",
            isStarting: false,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Inspect the Signal Tower for weak points",
            intent: "Inspect the Signal Tower",
            method: "Careful survey of Signal Tower",
          }),
        ),
      );

      const oraclePayload = (callOracle as Mock).mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      expect("combatEnvelope" in (oraclePayload ?? {})).toBe(false);
    });

    it("omits combatEnvelope cleanly when the resolved character target has no powerStats", async () => {
      setupMocks();
      const powerlessNpc = createPoweredNpcRow({
        characterRecord: JSON.stringify({
          ...JSON.parse(String(createPoweredNpcRow().characterRecord)),
          powerStats: undefined,
        }),
      });
      const mockDb = createEntityLookupDb({
        playerRow: createPoweredPlayerRow(),
        npcRows: [powerlessNpc],
      });

      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Strike the Goblin Raider with my sword",
            intent: "Strike the Goblin Raider",
            method: "Skilled sword slash at Goblin Raider",
          }),
        ),
      );

      const oraclePayload = (callOracle as Mock).mock.calls.at(-1)?.[0] as
        | Record<string, unknown>
        | undefined;
      expect("combatEnvelope" in (oraclePayload ?? {})).toBe(false);
    });

    it("passes non-empty targetTags for supported character targets instead of the old empty-target seam", async () => {
      setupMocks();
      const mockDb = createEntityLookupDb({
        npcRows: [
          {
            id: "npc-1",
            campaignId: CAMPAIGN_ID,
            name: "Goblin Raider",
            persona: "Hostile scout",
            tags: '["legacy-only"]',
            tier: "persistent",
            currentLocationId: "loc-1",
            goals: '{"short_term":[],"long_term":[]}',
            beliefs: "[]",
            unprocessedImportance: 0,
            inactiveTicks: 0,
            createdAt: 0,
            characterRecord: JSON.stringify({
              identity: {
                id: "npc-1",
                campaignId: CAMPAIGN_ID,
                role: "npc",
                tier: "persistent",
                displayName: "Goblin Raider",
                canonicalStatus: "original",
              },
              profile: {
                species: "Goblin",
                gender: "",
                ageText: "",
                appearance: "",
                backgroundSummary: "",
                personaSummary: "Hostile scout",
              },
              socialContext: {
                factionId: null,
                factionName: null,
                homeLocationId: null,
                homeLocationName: null,
                currentLocationId: "loc-1",
                currentLocationName: "Town Square",
                relationshipRefs: [],
                socialStatus: ["Raider"],
                originMode: "unknown",
              },
              motivations: {
                shortTermGoals: [],
                longTermGoals: [],
                beliefs: [],
                drives: ["Cruel"],
                frictions: [],
              },
              capabilities: {
                traits: ["Agile"],
                skills: [{ name: "Dagger Fighting", tier: "Skilled" }],
                flaws: [],
                specialties: [],
                wealthTier: null,
              },
              state: {
                hp: 5,
                conditions: ["Hidden"],
                statusFlags: [],
                activityState: "active",
              },
              loadout: {
                inventorySeed: [],
                equippedItemRefs: [],
                currencyNotes: "",
                signatureItems: [],
              },
              startConditions: {},
              provenance: {
                sourceKind: "generator",
                importMode: null,
                templateId: null,
                archetypePrompt: null,
                worldgenOrigin: null,
                legacyTags: [],
              },
            }),
            derivedTags: "[]",
          },
        ],
      });

      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Strike the Goblin Raider with my sword",
            intent: "Strike the Goblin Raider",
            method: "Skilled sword slash at Goblin Raider",
          }),
        ),
      );

      expect(callOracle).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTags: expect.arrayContaining([
            "Agile",
            "Skilled Dagger Fighting",
            "Hidden",
            "Raider",
            "Cruel",
          ]),
        }),
        expect.anything(),
      );
    });

    it("passes normalized stored tags for supported item and location/object targets", async () => {
      setupMocks();

      const itemDb = createEntityLookupDb({
        itemRows: [
          {
            id: "item-1",
            campaignId: CAMPAIGN_ID,
            name: "Moon Key",
            tags: '["Ancient", "Silver", "Locked-Door Key"]',
            ownerId: null,
            locationId: "loc-1",
          },
        ],
      });
      (getDb as Mock).mockReturnValue(itemDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Use the Moon Key on the sealed gate",
            intent: "Use the Moon Key",
            method: "Press the Moon Key into the lock",
          }),
        ),
      );

      expect(callOracle).toHaveBeenLastCalledWith(
        expect.objectContaining({
          targetTags: ["Ancient", "Silver", "Locked-Door Key"],
        }),
        expect.anything(),
      );

      const locationDb = createEntityLookupDb({
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A bustling square",
            tags: '["urban", "crowded"]',
            connectedTo: "[]",
            isStarting: false,
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Signal Tower",
            description: "An old relay station",
            tags: '["elevated", "exposed", "arcane-device"]',
            connectedTo: "[]",
            isStarting: false,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(locationDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Inspect the Signal Tower for weak points",
            intent: "Inspect the Signal Tower",
            method: "Careful survey of Signal Tower",
          }),
        ),
      );

      expect(callOracle).toHaveBeenLastCalledWith(
        expect.objectContaining({
          targetTags: ["elevated", "exposed", "arcane-device"],
        }),
        expect.anything(),
      );
    });

    it("keeps unsupported target fallback honest with targetTags: []", async () => {
      setupMocks();
      const mockDb = createEntityLookupDb({});
      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Attack the impossible shimmer",
            intent: "Attack the impossible shimmer",
            method: "Wild swing at the impossible shimmer",
          }),
        ),
      );

      expect(callOracle).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTags: [],
        }),
        expect.anything(),
      );
    });

    it("does not run a second target parser when movement already resolved the destination target candidate", async () => {
      setupMocks();
      vi.mocked(safeGenerateObject).mockResolvedValue({
        object: { isMovement: true, destination: "Signal Tower" },
      } as never);

      const mockDb = createEntityLookupDb({
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A bustling square",
            tags: '["urban", "crowded"]',
            connectedTo: '["loc-2"]',
            isStarting: false,
          },
          {
            id: "loc-2",
            campaignId: CAMPAIGN_ID,
            name: "Signal Tower",
            description: "An old relay station",
            tags: '["elevated", "exposed"]',
            connectedTo: '["loc-1"]',
            isStarting: false,
          },
        ],
      });
      (getDb as Mock).mockReturnValue(mockDb);

      await collectEvents(
        processTurn(
          createTestOptions({
            playerAction: "Go to the Signal Tower",
            intent: "Travel to the Signal Tower",
            method: "walking to Signal Tower",
          }),
        ),
      );

      expect(safeGenerateObject).toHaveBeenCalledTimes(1);
      expect(callOracle).toHaveBeenCalledWith(
        expect.objectContaining({
          targetTags: ["elevated", "exposed"],
        }),
        expect.anything(),
      );
    });
  });
});

describe("processTurn ScenePlan path", () => {
  beforeEach(() => {
    delete process.env.SCENE_PLAN_ENABLED;
    delete process.env.EXPOSE_LLM_REASONING;
    vi.clearAllMocks();
    logEventMock.mockClear();
    logInfoMock.mockClear();
    logWarnMock.mockClear();
    logErrorMock.mockClear();
    vi.mocked(safeGenerateObject).mockReset();
    installSafeGenerateObjectDefaultMock();
  });

  function assistantAppendCallOrder(): number | undefined {
    const appendMock = vi.mocked(appendChatMessages);
    const callIndex = appendMock.mock.calls.findIndex(([, messages]) =>
      Array.isArray(messages)
      && messages.some((message) => message.role === "assistant"),
    );

    return callIndex >= 0 ? appendMock.mock.invocationCallOrder[callIndex] : undefined;
  }

  function successfulNarratorAttemptId(): string {
    const result = updateNarratorAttemptOutcomeMock.mock.results.find((entry, index) => {
      const input = updateNarratorAttemptOutcomeMock.mock.calls[index]?.[0] as
        | { status?: string }
        | undefined;
      return input?.status === "succeeded" && entry.type === "return";
    })?.value as { id?: string } | undefined;

    expect(result?.id).toEqual(expect.any(String));
    return result!.id!;
  }

  it("defaults to the GM tool loop and preserves execution/guard ordering before narrative SSE", async () => {
    setupMocks();
    setupScenePlanMocks();

    const milestones: string[] = [];
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementationOnce(async (args) => {
      milestones.push("runVisibleNarrationWithPacketGuard before narrative SSE");
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });

    const events: TurnEvent[] = [];
    for await (const event of processTurn(createTestOptions())) {
      if (event.type === "narrative") {
        milestones.push("narrative SSE");
      }
      events.push(event);
    }

    expect(buildSceneFrame).toHaveBeenCalled();
    expect(runGmToolLoop).toHaveBeenCalled();
    expect(runScenePlanner).not.toHaveBeenCalled();
    expect(validateScenePlan).not.toHaveBeenCalled();
    expect(executeScenePlan).not.toHaveBeenCalled();
    expect(buildNarratorPacket).toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalled();
    expect(runHiddenAdjudicationPlan).not.toHaveBeenCalled();
    expect(executeAdjudicationPlan).not.toHaveBeenCalled();
    expect(runWorldBrainSceneDirection).not.toHaveBeenCalled();
    expect(callOracle).not.toHaveBeenCalled();

    expect(vi.mocked(buildSceneFrame).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runGmToolLoop).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(runGmToolLoop).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(buildNarratorPacket).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(buildNarratorPacket).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(assembleFinalNarrationPrompt).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(assembleFinalNarrationPrompt).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runVisibleNarrationWithPacketGuard).mock.invocationCallOrder[0]!,
    );
    expect(vi.mocked(runVisibleNarrationWithPacketGuard).mock.invocationCallOrder[0]).toBeLessThan(
      assistantAppendCallOrder()!,
    );
    expect(milestones).toEqual([
      "runVisibleNarrationWithPacketGuard before narrative SSE",
      "narrative SSE",
    ]);

    expect(events.findIndex((event) => event.type === "narrative")).toBeGreaterThan(
      events.findIndex((event) => event.type === "scene-settling"),
    );
    expect(sagaStatusTransitions()).toEqual([
      "collecting_context",
      "pre_turn_catchup",
      "gm_reading",
      "oracle_adjudicating",
      "tool_loop_running",
      "local_reaction_running",
      "world_consequence_running",
      "narrator_rendering",
    ]);
  });

  it("runs due simulation proposals through the live turn watchdog and refreshes narrator frame after committed proposal effects", async () => {
    setupMocks();
    setupScenePlanMocks();

    resolveDueWorldWorkForScopeMock.mockImplementation((input: { phase: string }) => ({
      phase: input.phase,
      executed: [],
      deferred: [],
      skipped: [],
      worldThreads: {
        executed: [],
        deferred: [],
        skipped: [],
      },
      proposalPrepTrace: [],
      proposals: input.phase === "pre_narrator_packet"
        ? {
            selected: ["proposal-due-1"],
            executed: [{
              status: "committed",
              proposalId: "proposal-due-1",
              proposalType: "key_actor_due_decision",
              disposition: "committed",
              committedWorldVersion: 9,
              toolResults: [{
                toolName: "add_chronicle_entry",
                result: {
                  success: true,
                  authority: {
                    toolResultId: "proposal-tool-result-1",
                    resultWorldVersion: 9,
                  },
                },
              }],
              authorityTraceIds: ["proposal-trace-1"],
              sourceJobId: null,
            }],
            skipped: [],
            blockedWriteScopes: [],
          }
        : {
            selected: [],
            executed: [],
            skipped: [],
            blockedWriteScopes: [],
          },
    }));

    await collectEvents(processTurn(createTestOptions()));

    expect(resolveDueWorldWorkForScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "pre_scene_frame" }),
    );
    expect(resolveDueWorldWorkForScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "pre_narrator_packet" }),
    );
    expect(buildSceneFrame).toHaveBeenCalledTimes(3);

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      dueWorldRefs?: string[];
    };
    expect(persistedPacket.dueWorldRefs).toEqual(
      expect.arrayContaining([
        "proposal-due-1",
        "proposal-due-1:committed",
        "proposal-trace-1",
        "proposal-tool-result-1",
      ]),
    );
  });

  it("uses pre-frame due time authority before building GM Read and tool-loop frames", async () => {
    setupMocks();
    setupScenePlanMocks();
    const baseClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 5,
      currentTick: 5,
      updatedAt: 0,
    };
    const postDueClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 8,
      worldTimeMinutes: 125,
      currentTick: 125,
      updatedAt: 0,
    };
    let currentClock = baseClock;
    readWorldClockMock.mockImplementation(() => currentClock);
    const advancedFrame = {
      ...createScenePlanFrameMock(),
      tick: 125,
      worldVersion: 8,
    };
    vi.mocked(buildSceneFrame).mockReset();
    vi.mocked(buildSceneFrame).mockResolvedValue(advancedFrame as never);
    resolveDueWorldWorkForScopeMock.mockImplementation((input: { phase: string }) => {
      if (input.phase === "pre_scene_frame") {
        currentClock = postDueClock;
        return {
          phase: input.phase,
          executed: [],
          deferred: [],
          skipped: [],
          worldThreads: { executed: [], deferred: [], skipped: [] },
          proposalPrepTrace: [],
          proposals: {
            selected: ["proposal-pre-frame-time"],
            executed: [{
              status: "committed",
              proposalId: "proposal-pre-frame-time",
              proposalType: "key_actor_due_decision",
              disposition: "committed",
              committedWorldVersion: 8,
              toolResults: [{
                toolName: "advance_time",
                result: {
                  success: true,
                  status: "success",
                  result: { minutes: 120, clockAdvanced: true },
                  authority: {
                    toolResultId: "proposal-tool-result-pre-frame-time",
                    resultWorldVersion: 8,
                    worldTimeMinutes: 125,
                    elapsedWorldTimeMinutes: 120,
                  },
                },
              }],
              authorityTraceIds: ["proposal-trace-pre-frame-time"],
              sourceJobId: null,
            }],
            skipped: [],
            blockedWriteScopes: [],
          },
        };
      }
      return {
        phase: input.phase,
        executed: [],
        deferred: [],
        skipped: [],
        worldThreads: { executed: [], deferred: [], skipped: [] },
        proposalPrepTrace: [],
        proposals: { selected: [], executed: [], skipped: [], blockedWriteScopes: [] },
      };
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(buildSceneFrame).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tick: 125,
        elapsedWorldTimeMinutes: 120,
      }),
    );
    expect(runGmToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 125,
        frame: expect.objectContaining({ tick: 125 }),
      }),
    );
  });

  it("uses SceneFrame post-catchup tick for GM tool-loop execution", async () => {
    setupMocks();
    setupScenePlanMocks();
    const baseClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 5,
      currentTick: 5,
      updatedAt: 0,
    };
    const postCatchupClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 8,
      worldTimeMinutes: 40,
      currentTick: 40,
      updatedAt: 0,
    };
    let currentClock = baseClock;
    readWorldClockMock.mockImplementation(() => currentClock);
    const catchupFrame = {
      ...createScenePlanFrameMock(),
      tick: 40,
      worldVersion: 8,
    };
    vi.mocked(buildSceneFrame).mockReset();
    vi.mocked(buildSceneFrame).mockImplementation(async () => {
      currentClock = postCatchupClock;
      return catchupFrame as never;
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(runGmToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 40,
        frame: expect.objectContaining({
          tick: 40,
          worldVersion: 8,
        }),
      }),
    );
  });

  it("uses pre-narrator due time authority and narrator-frame catchup for packet and scene assembly ticks", async () => {
    setupMocks();
    setupScenePlanMocks();
    const baseClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 5,
      currentTick: 5,
      updatedAt: 0,
    };
    const postDueClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 9,
      worldTimeMinutes: 205,
      currentTick: 205,
      updatedAt: 0,
    };
    const postNarratorFrameCatchupClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 10,
      worldTimeMinutes: 240,
      currentTick: 240,
      updatedAt: 0,
    };
    let currentClock = baseClock;
    readWorldClockMock.mockImplementation(() => currentClock);
    const baseFrame = createScenePlanFrameMock();
    const settledFrame = {
      ...baseFrame,
      tick: 6,
      worldVersion: 8,
    };
    const narratorFrame = {
      ...baseFrame,
      tick: 240,
      worldVersion: 10,
    };
    vi.mocked(buildSceneFrame).mockReset();
    vi.mocked(buildSceneFrame)
      .mockResolvedValueOnce(baseFrame as never)
      .mockResolvedValueOnce(settledFrame as never)
      .mockImplementationOnce(async () => {
        currentClock = postNarratorFrameCatchupClock;
        return narratorFrame as never;
      });
    resolveDueWorldWorkForScopeMock.mockImplementation((input: { phase: string }) => {
      if (input.phase === "pre_narrator_packet") {
        currentClock = postDueClock;
        return {
          phase: input.phase,
          executed: [],
          deferred: [],
          skipped: [],
          worldThreads: { executed: [], deferred: [], skipped: [] },
          proposalPrepTrace: [],
          proposals: {
            selected: ["proposal-pre-narrator-time"],
            executed: [{
              status: "committed",
              proposalId: "proposal-pre-narrator-time",
              proposalType: "key_actor_due_decision",
              disposition: "committed",
              committedWorldVersion: 9,
              toolResults: [{
                toolName: "advance_time",
                result: {
                  success: true,
                  status: "success",
                  result: { minutes: 200, clockAdvanced: true },
                  authority: {
                    toolResultId: "proposal-tool-result-pre-narrator-time",
                    resultWorldVersion: 9,
                    worldTimeMinutes: 205,
                    elapsedWorldTimeMinutes: 200,
                  },
                },
              }],
              authorityTraceIds: ["proposal-trace-pre-narrator-time"],
              sourceJobId: null,
            }],
            skipped: [],
            blockedWriteScopes: [],
          },
        };
      }
      return {
        phase: input.phase,
        executed: [],
        deferred: [],
        skipped: [],
        worldThreads: { executed: [], deferred: [], skipped: [] },
        proposalPrepTrace: [],
        proposals: { selected: [], executed: [], skipped: [], blockedWriteScopes: [] },
      };
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(buildSceneFrame).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        tick: 205,
        elapsedWorldTimeMinutes: 200,
      }),
    );
    expect(buildNarratorPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({ tick: 240 }),
        canonicalTurnPacket: expect.objectContaining({ tick: 240 }),
      }),
    );
    expect(assembleAuthoritativeScene).toHaveBeenCalledWith(
      expect.objectContaining({
        pendingEventTicks: [5, 6, 205, 240],
      }),
    );
    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      canonicalTurnPacket?: { tick?: number };
      resultWorldVersion?: number;
    };
    expect(persistedPacket.canonicalTurnPacket?.tick).toBe(240);
    expect(persistedPacket.resultWorldVersion).toBe(10);
  });

  it("refreshes the actor-reaction frame after GM authority writes before required actor decisions", async () => {
    setupMocks();
    const { frame, scenePlan } = setupScenePlanMocks();
    const actorReactionFrame = {
      ...frame,
      worldVersion: 8,
      currentLocationId: "loc-after-gm",
      currentSceneScopeId: "loc-after-gm",
    };
    const preNarratorFrame = {
      ...frame,
      worldVersion: 8,
      currentLocationId: "loc-after-gm",
      currentSceneScopeId: "loc-after-gm",
    };
    const gmAuthorityResult = {
      success: true,
      result: {
        committed: true,
        eventId: "event-gm-authority",
        durability: "durable",
        persisted: true,
      },
      authority: {
        toolResultId: "gm-tool-result-1",
        resultWorldVersion: 8,
        stateDeltaRefs: ["world:event"],
        eventRefs: ["event-gm-authority"],
      },
    } as {
      success: true;
      result: { committed: boolean; eventId: string; durability: string; persisted: boolean };
      authority: { toolResultId: string; resultWorldVersion: number; stateDeltaRefs: string[]; eventRefs: string[] };
    };
    const action = scenePlan.plannedActions[0]!;
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Plan a concrete local scene mutation.",
      text: "",
      rawToolCalls: [{
        tool: action.toolName,
        args: action.input,
        result: gmAuthorityResult,
      }],
      stepResults: [{
        stepId: "tool-call-1",
        attempt: 1,
        status: "done",
        toolName: action.toolName,
        candidateInput: action.input,
        validationError: null,
        visibleEffect: "The scene records the local consequence.",
        privateGuardTerms: [],
        mutationRefs: ["gm-tool-result-1"],
        settledAtTick: frame.tick,
          result: gmAuthorityResult,
        }],
      acceptedStepIds: ["tool-call-1"],
      acceptedToolResultIds: ["gm-tool-result-1"],
    } as never);
    vi.mocked(buildSceneFrame).mockReset();
    vi.mocked(buildSceneFrame)
      .mockResolvedValueOnce(frame as never)
      .mockResolvedValueOnce(actorReactionFrame as never)
      .mockResolvedValueOnce(preNarratorFrame as never);

    await collectEvents(processTurn(createTestOptions()));

    expect(buildSceneFrame).toHaveBeenCalledTimes(3);
    expect(vi.mocked(buildSceneFrame).mock.invocationCallOrder[1]).toBeLessThan(
      runRequiredActorDecisionPassMock.mock.invocationCallOrder[0]!,
    );
    expect(runRequiredActorDecisionPassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sceneFrame: expect.objectContaining({
          worldVersion: 8,
          currentLocationId: "loc-after-gm",
          currentSceneScopeId: "loc-after-gm",
        }),
        playerLocationId: "loc-after-gm",
        playerSceneScopeId: "loc-after-gm",
      }),
    );
  });

  it("projects move_actor GM-loop movement as legacy location_change state", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Move the player along a legal public route.",
      text: "",
      rawToolCalls: [
        {
          tool: "move_actor",
          args: {
            actorRef: "Hero",
            destinationRef: "Tea Row",
            evidenceRefs: ["route-tea-row"],
          },
          result: {
            success: true,
            result: {
              kind: "move_actor",
              locationId: "loc-tea-row",
              locationName: "Tea Row",
              travelCost: 3,
              path: ["Market", "Tea Row"],
            },
          },
        },
      ],
      stepResults: [
        {
          stepId: "move-actor-step",
          attempt: 1,
          status: "done",
          toolName: "move_actor",
          candidateInput: {
            actorRef: "Hero",
            destinationRef: "Tea Row",
            evidenceRefs: ["route-tea-row"],
          },
          validationError: null,
          visibleEffect: "Hero moves to Tea Row.",
          privateGuardTerms: [],
          mutationRefs: ["loc-tea-row"],
          settledAtTick: 5,
          result: {
            success: true,
            result: {
              kind: "move_actor",
              locationId: "loc-tea-row",
              locationName: "Tea Row",
              travelCost: 3,
              path: ["Market", "Tea Row"],
            },
          },
        },
      ],
      acceptedStepIds: ["move-actor-step"],
      acceptedToolResultIds: [],
    } as never);

    const events = await collectEvents(processTurn(createTestOptions()));
    const locationChange = events.find(
      (event) =>
        event.type === "state_update"
        && (event.data as Record<string, unknown>).type === "location_change",
    );

    expect(locationChange).toMatchObject({
      type: "state_update",
      data: {
        type: "location_change",
        locationId: "loc-tea-row",
        locationName: "Tea Row",
        travelCost: 3,
        tickAdvance: 3,
        path: ["Market", "Tea Row"],
      },
    });
    expect(advanceCampaignTick).toHaveBeenCalledWith(CAMPAIGN_ID, 3);
  });

  it("accepts advance_time as contextual setup before a later GM-loop state mutation", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        sceneQuestion: "Does waiting create enough cover to move into the back room?",
        turnIntent: "Wait briefly, then apply the concrete location change.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      }),
    });
    const advanceInput = {
      minutes: 5,
      reason: "Hero waits for the queue to shift.",
    };
    const moveInput = {
      actorRef: "Hero",
      destinationRef: "Back Room",
      evidenceRefs: ["waited-for-cover"],
    };
    const advanceResult = {
      success: true,
      status: "success",
      result: {
        minutes: 5,
        reason: "Hero waits for the queue to shift.",
        clockAdvanced: true,
      },
      authority: {
        toolResultId: "tool-result-advance-time",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 5,
        stateDeltaRefs: ["world_time", "elapsed:5"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    const moveResult = {
      success: true,
      status: "success",
      result: {
        kind: "move_actor",
        actorRef: "Hero",
        destinationRef: "Back Room",
        locationId: "loc-back-room",
        locationName: "Back Room",
      },
      authority: {
        toolResultId: "tool-result-move-actor",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 8,
        resultWorldVersion: 9,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["actor:hero", "location:loc-back-room"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Wait for cover, then move into the back room.",
      text: "",
      rawToolCalls: [
        { tool: "advance_time", args: advanceInput, result: advanceResult },
        { tool: "move_actor", args: moveInput, result: moveResult },
      ],
      stepResults: [
        {
          stepId: "advance-time-step",
          attempt: 1,
          status: "done",
          toolName: "advance_time",
          candidateInput: advanceInput,
          validationError: null,
          visibleEffect: "Hero waits for five minutes.",
          privateGuardTerms: [],
          mutationRefs: ["world_time", "elapsed:5"],
          settledAtTick: 5,
          result: advanceResult,
        },
        {
          stepId: "move-actor-step",
          attempt: 1,
          status: "done",
          toolName: "move_actor",
          candidateInput: moveInput,
          validationError: null,
          visibleEffect: "Hero moves to the back room.",
          privateGuardTerms: [],
          mutationRefs: ["actor:hero", "location:loc-back-room"],
          settledAtTick: 5,
          result: moveResult,
        },
      ],
      acceptedStepIds: ["advance-time-step", "move-actor-step"],
      acceptedToolResultIds: ["tool-result-advance-time", "tool-result-move-actor"],
    } as never);

    await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      canonicalTurnPacket?: {
        effects?: Array<{ toolName?: string }>;
        turnResolution?: {
          kind?: string;
          consequenceIds?: string[];
          toolNames?: string[];
        };
      };
    } | undefined;
    expect(persistSettledTurnPacketMock).toHaveBeenCalled();
    expect(persistedPacket?.canonicalTurnPacket?.effects?.map((effect) => effect.toolName)).toEqual(
      expect.arrayContaining(["advance_time", "move_actor"]),
    );
    expect(persistedPacket?.canonicalTurnPacket?.turnResolution).toMatchObject({
      kind: "state_mutation",
      toolNames: expect.arrayContaining(["advance_time", "move_actor"]),
    });
    expect(persistedPacket?.canonicalTurnPacket?.turnResolution?.consequenceIds).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^action-result:/),
      ]),
    );
  });

  it("uses accepted advance_time authority as the settled clock before actor and narrator frames", async () => {
    setupMocks();
    const { frame } = setupScenePlanMocks({
      gmRead: createGmReadMock({
        sceneQuestion: "What changes after the player waits for the full tide cycle?",
        turnIntent: "Advance the lawful wait until the tide cycle is reached.",
        runtimeRequirement: {
          kind: "scene_beat",
          durability: "scene_local",
          beatKind: "time_passage",
        },
      }),
    });
    const baseClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 5,
      currentTick: 5,
      updatedAt: 0,
    };
    const postAdvanceClock = {
      campaignId: CAMPAIGN_ID,
      worldVersion: 8,
      worldTimeMinutes: 4325,
      currentTick: 4325,
      updatedAt: 0,
    };
    let currentClock = baseClock;
    readWorldClockMock.mockImplementation(() => currentClock);
    const advanceInput = {
      minutes: 4320,
      reason: "Hero waits until the full moon tide cycle begins.",
    };
    const advanceResult = {
      success: true,
      status: "success",
      result: {
        minutes: 4320,
        reason: "Hero waits until the full moon tide cycle begins.",
        clockAdvanced: true,
      },
      authority: {
        toolResultId: "tool-result-advance-time",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        worldTimeMinutes: 4325,
        elapsedWorldTimeMinutes: 4320,
        stateDeltaRefs: ["world_time", "elapsed:4320"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    vi.mocked(runGmToolLoop).mockImplementationOnce(async () => {
      currentClock = postAdvanceClock;
      return {
        intent: "The full waiting interval elapses.",
        text: "",
        rawToolCalls: [
          { tool: "advance_time", args: advanceInput, result: advanceResult },
        ],
        stepResults: [
          {
            stepId: "advance-time-step",
            attempt: 1,
            status: "done",
            toolName: "advance_time",
            candidateInput: advanceInput,
            validationError: null,
            visibleEffect: "Hero waits until the tide cycle begins.",
            privateGuardTerms: [],
            mutationRefs: ["world_time", "elapsed:4320"],
            settledAtTick: frame.tick,
            result: advanceResult,
          },
        ],
        acceptedStepIds: ["advance-time-step"],
        acceptedToolResultIds: ["tool-result-advance-time"],
      } as never;
    });
    const settledFrame = {
      ...frame,
      tick: 4325,
      worldVersion: 8,
    };
    vi.mocked(buildSceneFrame).mockReset();
    vi.mocked(buildSceneFrame)
      .mockResolvedValueOnce(frame as never)
      .mockResolvedValue(settledFrame as never);

    await collectEvents(processTurn(createTestOptions()));

    expect(runRequiredActorDecisionPassMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 4325,
        elapsedWorldTimeMinutes: 4320,
        sceneFrame: expect.objectContaining({ tick: 4325 }),
      }),
    );
    expect(resolveDueWorldWorkForScopeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "pre_narrator_packet",
        tick: 4325,
        elapsedWorldTimeMinutes: 4320,
      }),
    );
    expect(buildNarratorPacket).toHaveBeenCalledWith(
      expect.objectContaining({
        frame: expect.objectContaining({ tick: 4325 }),
        canonicalTurnPacket: expect.objectContaining({
          tick: 4325,
          effects: expect.arrayContaining([
            expect.objectContaining({ toolName: "advance_time" }),
          ]),
          turnResolution: expect.objectContaining({
            kind: "scene_beat",
            toolNames: expect.arrayContaining(["advance_time"]),
          }),
        }),
      }),
    );
    const settledPacketInput = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      canonicalTurnPacket?: { tick?: number };
    } | undefined;
    expect(settledPacketInput?.canonicalTurnPacket?.tick).toBe(4325);
  });

  it("keeps observation-only GM-loop lookups as packet evidence without emitting state updates", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Look up the public route before deciding whether to mutate.",
      text: "",
      observationSummary: "list_navigation_options observed candidates Tea Row",
      rawToolCalls: [
        {
          tool: "list_navigation_options",
          args: {},
          result: {
            success: true,
            kind: "observation",
            observationOnly: true,
            result: {
              visibleActors: [
                { label: "Mira" },
                { label: "Dol the Docksman" },
                { label: "Gondolier" },
                { label: "Lead Warden" },
                { label: "Second Warden" },
              ],
              legalTargets: [
                { label: "Mira" },
                { label: "Dol the Docksman" },
                { label: "Gondolier" },
                { label: "Lead Warden" },
                { label: "Second Warden" },
              ],
              legalMovement: [
                { label: "Canal Market District" },
                { label: "Gondola Dispatch Alcove" },
                { label: "Tea Row" },
              ],
              candidates: [{ label: "Tea Row" }],
              visibleFacts: [
                {
                  id: "current-location-description",
                  summary: "Station CCTV watches the rope barrier beside Tea Row.",
                },
              ],
              categories: {
                cameras: {
                  targets: [{ label: "Station CCTV Camera" }],
                  facts: [],
                  absence: null,
                },
                barriers: {
                  targets: [],
                  facts: [
                    {
                      id: "current-location-description",
                      summary: "A rope barrier controls the queue.",
                    },
                  ],
                  absence: null,
                },
                personnel: {
                  actors: [
                    { label: "Dol the Docksman" },
                    { label: "Lead Warden" },
                    { label: "Second Warden" },
                  ],
                  facts: [
                    {
                      id: "warden-ready",
                      summary: "The Second Warden is ready to detain anyone who ignores the proof demand.",
                    },
                  ],
                  absence: null,
                },
              },
            },
          },
        },
      ],
      stepResults: [
        {
          stepId: "lookup-step",
          attempt: 1,
          status: "done",
          toolName: "list_navigation_options",
          candidateInput: {},
          validationError: null,
          visibleEffect: "Tea Row is a possible route.",
          privateGuardTerms: [],
          mutationRefs: [],
          settledAtTick: 5,
          result: {
            success: true,
            kind: "observation",
            observationOnly: true,
            result: {
              visibleActors: [
                { label: "Mira" },
                { label: "Dol the Docksman" },
                { label: "Gondolier" },
                { label: "Lead Warden" },
                { label: "Second Warden" },
              ],
              legalTargets: [
                { label: "Mira" },
                { label: "Dol the Docksman" },
                { label: "Gondolier" },
                { label: "Lead Warden" },
                { label: "Second Warden" },
              ],
              legalMovement: [
                { label: "Canal Market District" },
                { label: "Gondola Dispatch Alcove" },
                { label: "Tea Row" },
              ],
              candidates: [{ label: "Tea Row" }],
              visibleFacts: [
                {
                  id: "current-location-description",
                  summary: "Station CCTV watches the rope barrier beside Tea Row.",
                },
              ],
              categories: {
                cameras: {
                  targets: [{ label: "Station CCTV Camera" }],
                  facts: [],
                  absence: null,
                },
                barriers: {
                  targets: [],
                  facts: [
                    {
                      id: "current-location-description",
                      summary: "A rope barrier controls the queue.",
                    },
                  ],
                  absence: null,
                },
                personnel: {
                  actors: [
                    { label: "Dol the Docksman" },
                    { label: "Lead Warden" },
                    { label: "Second Warden" },
                  ],
                  facts: [
                    {
                      id: "warden-ready",
                      summary: "The Second Warden is ready to detain anyone who ignores the proof demand.",
                    },
                  ],
                  absence: null,
                },
              },
            },
          },
        },
      ],
      acceptedStepIds: [],
      acceptedToolResultIds: [],
    } as never);

    const events = await collectEvents(processTurn(createTestOptions()));
    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      canonicalTurnPacket?: {
        actionResults?: Array<{
          toolName?: string;
          result?: { success?: boolean; kind?: string; observationOnly?: boolean };
        }>;
        effects?: Array<{
          toolName?: string;
          summary?: string;
          toolResult?: { success?: boolean; kind?: string; observationOnly?: boolean };
        }>;
        responses?: Array<{ summary?: string }>;
        narratorFacts?: { actionIds?: string[]; toolResultRefs?: unknown[] };
        turnResolution?: {
          kind?: string;
          resolutionState?: string;
          combatIntent?: boolean;
          evidenceIds?: string[];
          consequenceIds?: string[];
          explicitNoCombatEvidenceIds?: string[];
          toolNames?: string[];
        };
      };
    } | undefined;

    expect(events.filter((event) => event.type === "state_update")).toEqual([]);
    expect(events.find((event) => event.type === "turn_resolution")?.data).toMatchObject({
      kind: "status_read",
      resolutionState: "observation_grounded",
      combatIntent: false,
      toolNames: ["list_navigation_options"],
    });
    expect(persistedPacket?.canonicalTurnPacket?.actionResults).toHaveLength(1);
    expect(persistedPacket?.canonicalTurnPacket?.turnResolution).toMatchObject({
      kind: "status_read",
      resolutionState: "observation_grounded",
      combatIntent: false,
      consequenceIds: [],
      explicitNoCombatEvidenceIds: expect.arrayContaining([
        expect.stringMatching(/^action-result:/),
      ]),
      toolNames: ["list_navigation_options"],
    });
    expect(persistedPacket?.canonicalTurnPacket?.actionResults?.[0]).toMatchObject({
      toolName: "list_navigation_options",
      result: {
        success: true,
        kind: "observation",
        observationOnly: true,
      },
    });
    expect(persistedPacket?.canonicalTurnPacket?.effects).toEqual([]);
    expect(persistedPacket?.canonicalTurnPacket?.responses?.[0]?.summary).not.toContain(
      "GM no-mutation direction",
    );
    expect(persistedPacket?.canonicalTurnPacket?.narratorFacts?.actionIds).toHaveLength(0);
    expect(persistedPacket?.canonicalTurnPacket?.narratorFacts?.toolResultRefs).toHaveLength(0);
  });

  it("rejects successful intent-marker GM-loop tools as side-effect boundaries, not receipts", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Record the player's unverified claim without applying state.",
      text: "",
      rawToolCalls: [
        {
          tool: "record_player_intent",
          args: {
            actorRef: "Hero",
            intentType: "claim",
            targetHint: "I already paid the toll",
          },
          result: {
            success: true,
            status: "success",
            result: {
              kind: "player_intent_recorded",
              actorRef: "Hero",
              intentType: "claim",
              targetHint: "I already paid the toll",
              claimTruth: "unconfirmed",
              proofCreated: false,
            },
          },
        },
      ],
      stepResults: [
        {
          stepId: "intent-marker-step",
          attempt: 1,
          status: "done",
          toolName: "record_player_intent",
          candidateInput: {
            actorRef: "Hero",
            intentType: "claim",
            targetHint: "I already paid the toll",
          },
          validationError: null,
          visibleEffect: "The claim is noted as unverified.",
          privateGuardTerms: [],
          mutationRefs: [],
          settledAtTick: 5,
          result: {
            success: true,
            status: "success",
            result: {
              kind: "player_intent_recorded",
              actorRef: "Hero",
              intentType: "claim",
              targetHint: "I already paid the toll",
              claimTruth: "unconfirmed",
              proofCreated: false,
            },
          },
        },
      ],
      acceptedStepIds: [],
      acceptedToolResultIds: [],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(runRequiredActorDecisionPassMock).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
  });

  it("does not accept a mismatched terminal receipt through the generic fallback", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the durable procedure answer.",
        runtimeRequirement: {
          kind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Accidentally record a route fact instead of the required procedure fact.",
      text: "",
      rawToolCalls: [
        {
          tool: "record_world_fact",
          args: {
            factKind: "rule",
            topicKind: "route",
            summary: "The ferry route closes after dusk.",
            truthStatus: "established",
            durability: "durable",
          },
          result: {
            success: true,
            status: "success",
            result: {
              factKind: "rule",
              topicKind: "route",
              summary: "The ferry route closes after dusk.",
              truthStatus: "established",
              durability: "durable",
              persisted: true,
            },
          },
        },
      ],
      stepResults: [
        {
          stepId: "wrong-topic-world-fact-step",
          attempt: 1,
          status: "done",
          toolName: "record_world_fact",
          candidateInput: {
            factKind: "rule",
            topicKind: "route",
            summary: "The ferry route closes after dusk.",
            truthStatus: "established",
            durability: "durable",
          },
          validationError: null,
          visibleEffect: "A route fact is recorded.",
          privateGuardTerms: [],
          mutationRefs: [],
          settledAtTick: 5,
          result: {
            success: true,
            status: "success",
            result: {
              factKind: "rule",
              topicKind: "route",
              summary: "The ferry route closes after dusk.",
              truthStatus: "established",
              durability: "durable",
              persisted: true,
            },
          },
        },
      ],
      acceptedStepIds: [],
      acceptedToolResultIds: [],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );

    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(runRequiredActorDecisionPassMock).not.toHaveBeenCalled();
    expect(appendChatMessages).toHaveBeenCalledTimes(1);
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      { role: "user", content: "I attack the goblin" },
    ]);
  });

  it("trusts GM-loop acceptedStepIds over a broad turn-processor receipt match", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the durable procedure fact.",
        runtimeRequirement: {
          kind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    const worldFactInput = {
      sourceKind: "public_record",
      truthStatus: "verified",
      factKind: "procedure",
      topicKind: "procedure",
      summary: "The permit office requires a stamped copy.",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance: "The stamped-copy rule gates later permit attempts.",
      claims: [{
        claimKind: "requirement",
        polarity: "requires",
        subjectText: "Permit office stamped-copy rule",
        summary: "The permit office requires a stamped copy.",
      }],
      subjectRefs: ["permit-office"],
      sourceRefs: ["clerk"],
    };
    const worldFactResult = {
      success: true,
      status: "success",
      result: {
        ...worldFactInput,
        factRef: "Knowledge:world-fact-unaccepted",
        persisted: true,
      },
      authority: {
        toolResultId: "tool-result-world-fact-unaccepted",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["knowledge:world-fact-unaccepted"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: ["Knowledge:world-fact-unaccepted"],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Record the procedure fact.",
      text: "",
      rawToolCalls: [{ tool: "record_world_fact", args: worldFactInput, result: worldFactResult }],
      stepResults: [
        {
          stepId: "unaccepted-world-fact-step",
          attempt: 1,
          status: "done",
          toolName: "record_world_fact",
          candidateInput: worldFactInput,
          validationError: null,
          visibleEffect: "The procedure fact is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["Knowledge:world-fact-unaccepted"],
          settledAtTick: 5,
          result: worldFactResult,
        },
      ],
      acceptedStepIds: [],
      acceptedToolResultIds: [],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );
    expect(retractActorKnowledgeRecordMock).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      factRef: "Knowledge:world-fact-unaccepted",
      reason: "unaccepted_turn_durable_memory",
    });
    expect(retractStoredEpisodicEventMock).not.toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      eventId: "event-world-fact-unaccepted",
    });
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
  });

  it("persists GM-loop acceptedStepIds and acceptedToolResultIds as accepted receipt refs", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the durable procedure fact.",
        runtimeRequirement: {
          kind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    const worldFactInput = {
      sourceKind: "public_record",
      truthStatus: "verified",
      factKind: "procedure",
      topicKind: "procedure",
      summary: "The permit office requires a stamped copy.",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance: "The stamped-copy rule gates later permit attempts.",
      claims: [{
        claimKind: "requirement",
        polarity: "requires",
        subjectText: "Permit office stamped-copy rule",
        summary: "The permit office requires a stamped copy.",
      }],
      subjectRefs: ["permit-office"],
      sourceRefs: ["clerk"],
    };
    const worldFactResult = {
      success: true,
      status: "success",
      result: {
        ...worldFactInput,
        eventId: "event-world-fact-accepted",
        persisted: true,
      },
      authority: {
        toolResultId: "tool-result-world-fact-accepted",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-world-fact-accepted"],
        eventRefs: ["event-world-fact-accepted"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Record the procedure fact.",
      text: "",
      rawToolCalls: [{ tool: "record_world_fact", args: worldFactInput, result: worldFactResult }],
      stepResults: [
        {
          stepId: "accepted-world-fact-step",
          attempt: 1,
          status: "done",
          toolName: "record_world_fact",
          candidateInput: worldFactInput,
          validationError: null,
          visibleEffect: "The procedure fact is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-world-fact-accepted"],
          settledAtTick: 5,
          result: worldFactResult,
        },
      ],
      acceptedStepIds: ["accepted-world-fact-step"],
      acceptedToolResultIds: ["tool-result-world-fact-accepted"],
    } as never);

    await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      acceptedToolResultRefs?: string[];
      acceptedDurableEventIds?: string[];
      canonicalTurnPacket?: { effects?: Array<{ toolName?: string }> };
    };
    expect(persistedPacket.acceptedToolResultRefs).toEqual(
      expect.arrayContaining([
        "accepted-world-fact-step",
        "tool-result-world-fact-accepted",
      ]),
    );
    expect(persistedPacket.acceptedDurableEventIds).toEqual(["event-world-fact-accepted"]);
    expect(persistedPacket.canonicalTurnPacket?.effects).toEqual(
      expect.arrayContaining([expect.objectContaining({ toolName: "record_world_fact" })]),
    );
  });

  it("rejects applied_now dialogue stateEffects without prior structural action under any runtime requirement", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the current scene beat.",
        runtimeRequirement: {
          kind: "scene_beat",
          durability: "durable",
          beatKind: "event_log",
        },
      }),
    });
    const dialogueInput = {
      speakerRef: "Clerk",
      addresseeRefs: ["Hero"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      summary: "The clerk says Hero is now cleared.",
      quote: "Hero is now cleared for this route.",
      sourceRefs: ["Clerk"],
      futureUseKind: "permission_check",
      futureRelevance: "The claimed clearance would control later route checks.",
      claims: [{
        claimKind: "permission",
        polarity: "allows",
        subjectText: "Hero's route clearance",
        summary: "The clerk says Hero is cleared for the route.",
      }],
      stateEffects: [{
        effectId: "effect-cleared-by-clerk",
        status: "applied_now",
        stateReceipt: "state_receipt_1_1",
        structuralTool: "add_tag",
        targetRef: "Hero",
        stateKey: "tag",
        stateValue: "cleared-by-clerk",
        summary: "Hero is marked as cleared by the clerk.",
      }],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        ...dialogueInput,
        eventId: "event-dialogue-unbacked-applied-now",
        persisted: true,
      },
      authority: {
        toolResultId: "tool-result-dialogue-unbacked-applied-now",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-dialogue-unbacked-applied-now"],
        eventRefs: ["event-dialogue-unbacked-applied-now"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Record an unbacked applied dialogue effect.",
      text: "",
      rawToolCalls: [{ tool: "record_dialogue_outcome", args: dialogueInput, result: dialogueResult }],
      stepResults: [
        {
          stepId: "dialogue-unbacked-applied-now-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: dialogueInput,
          validationError: null,
          visibleEffect: "The clerk's answer is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-dialogue-unbacked-applied-now"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["dialogue-unbacked-applied-now-step"],
      acceptedToolResultIds: ["tool-result-dialogue-unbacked-applied-now"],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "record_dialogue_outcome declared applied_now stateEffect without a prior matching structural state tool result",
    );
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
  });

  it("retracts produced durable memory when the result is evidence-only for the required receipt", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the durable procedure answer.",
        runtimeRequirement: {
          kind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "The tool loop logged supporting evidence but did not create the required world fact.",
      observationSummary: "A witness says the stamp might matter later.",
      text: "",
      rawToolCalls: [
        {
          tool: "log_event",
          args: {
            text: "A witness mentions the stamp.",
            importance: 6,
            participants: ["Hero", "Witness"],
            durability: "durable",
            futureRelevance: "The witness statement may matter later.",
          },
          result: {
            success: true,
            status: "success",
            result: {
              eventId: "event-evidence-only",
              durability: "durable",
              persisted: true,
            },
          },
        },
      ],
      stepResults: [
        {
          stepId: "evidence-only-log-event-step",
          attempt: 1,
          status: "done",
          toolName: "log_event",
          candidateInput: {
            text: "A witness mentions the stamp.",
            importance: 6,
            participants: ["Hero", "Witness"],
            durability: "durable",
            futureRelevance: "The witness statement may matter later.",
          },
          validationError: null,
          visibleEffect: "The witness statement is heard.",
          privateGuardTerms: [],
          mutationRefs: ["event-evidence-only"],
          settledAtTick: 5,
          result: {
            success: true,
            status: "success",
            result: {
              eventId: "event-evidence-only",
              durability: "durable",
              persisted: true,
            },
          },
        },
      ],
      acceptedStepIds: [],
      acceptedToolResultIds: [],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );

    expect(retractStoredEpisodicEventMock).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      eventId: "event-evidence-only",
    });
    expect(retractReflectionBudgetMock).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      ["Hero", "Witness"],
      6,
    );
    expect(retractStoredEpisodicEventMock.mock.invocationCallOrder[0]).toBeLessThan(
      retractReflectionBudgetMock.mock.invocationCallOrder[0]!,
    );
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(runRequiredActorDecisionPassMock).not.toHaveBeenCalled();
  });

  it.each([
    {
      toolName: "log_event",
      args: {
        text: "A witness mentions the stamp.",
        importance: 6,
        participants: ["Hero", "Witness"],
        durability: "durable",
        futureRelevance: "The witness statement may matter later.",
      },
      payload: {
        eventId: "event-wrong-log-receipt",
        durability: "durable",
        persisted: true,
      },
    },
    {
      toolName: "record_dialogue_outcome",
      args: {
        speakerRef: "Witness",
        addresseeRefs: ["Hero"],
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "witness_claim",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "lead",
        futureRelevance: "The witness answer may matter later.",
      },
      payload: {
        eventId: "event-wrong-dialogue-receipt",
        topicKind: "procedure",
        outcomeKind: "answered",
        durability: "durable",
        persisted: true,
      },
    },
  ])("fails closed when committed durable $toolName is not the required receipt", async ({ toolName, args, payload }) => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the durable procedure fact.",
        runtimeRequirement: {
          kind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });

    const result = {
      success: true,
      status: "success",
      result: payload,
      authority: {
        toolResultId: `tool-result-${toolName}`,
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: [`tool:${toolName}:wrong-receipt`],
        eventRefs: [payload.eventId],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: `Wrongly used ${toolName} instead of record_world_fact.`,
      observationSummary: "The wrong durable receipt committed authority.",
      text: "",
      rawToolCalls: [{ tool: toolName, args, result }],
      stepResults: [
        {
          stepId: `wrong-${toolName}-step`,
          attempt: 1,
          status: "done",
          toolName,
          candidateInput: args,
          validationError: null,
          visibleEffect: "The wrong durable record is visible.",
          privateGuardTerms: [],
          mutationRefs: [`tool:${toolName}:wrong-receipt`],
          settledAtTick: 5,
          result,
        },
      ],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );

    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(runRequiredActorDecisionPassMock).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
  });

  it("accepts a structural-effect dialogue refusal when no state was applied", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record that the clerk refused the requested route permission.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "permission",
          durability: "durable",
          requiresStructuralEffect: true,
          effectKind: "entity_tag",
        },
      }),
    });
    const dialogueInput = {
      speakerRef: "Clerk",
      addresseeRefs: ["Hero"],
      outcomeKind: "refused",
      topicKind: "permission",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance: "The clerk's refusal controls later route attempts until the player brings proof.",
      summary: "The clerk refuses to mark Hero as cleared without the missing seal.",
      sourceRefs: ["Clerk"],
      claims: [
        {
          claimKind: "permission",
          polarity: "denies",
          subjectText: "Hero's route trust status",
          summary: "Hero is not cleared for this route without the missing seal.",
        },
      ],
      stateEffects: [],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-dialogue-refusal",
        ...dialogueInput,
        persisted: true,
      },
      authority: {
        toolResultId: "tool-result-dialogue-refusal",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-dialogue-refusal"],
        eventRefs: ["event-dialogue-refusal"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Record the clerk's refusal.",
      text: "",
      rawToolCalls: [
        { tool: "record_dialogue_outcome", args: dialogueInput, result: dialogueResult },
      ],
      stepResults: [
        {
          stepId: "accepted-dialogue-refusal-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: dialogueInput,
          validationError: null,
          visibleEffect: "The clerk's refusal is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-dialogue-refusal"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["accepted-dialogue-refusal-step"],
      acceptedToolResultIds: ["tool-result-dialogue-refusal"],
    } as never);

    await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      acceptedToolResultRefs?: string[];
      acceptedDurableEventIds?: string[];
      canonicalTurnPacket?: { effects?: Array<{ toolName?: string }> };
    };
    expect(persistedPacket.acceptedToolResultRefs).toEqual(
      expect.arrayContaining(["accepted-dialogue-refusal-step"]),
    );
    expect(persistedPacket.acceptedDurableEventIds).toEqual(["event-dialogue-refusal"]);
    expect(persistedPacket.canonicalTurnPacket?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "record_dialogue_outcome" }),
      ]),
    );
    expect(buildNarratorPacket).toHaveBeenCalled();
  });

  it("accepts create_scene_extra only when dialogue cites the returned model-safe actor identity", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Create a current-scene clerk and record the clerk's answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    const sceneExtraResult = {
      success: true,
      status: "success",
      result: {
        id: "npc-disputes-clerk",
        name: "Concourse Disputes Clerk",
        kind: "scene_extra",
        role: "clerk",
        temporary: true,
        modelSafeRefs: ["Concourse Disputes Clerk"],
      },
      authority: {
        toolResultId: "tool-result-scene-extra",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["npc:npc-disputes-clerk", "Concourse Disputes Clerk"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    const dialogueInput = {
      speakerRef: "Concourse Disputes Clerk",
      addresseeRefs: ["Hero"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The clerk's answer tells Hero which queue to use later.",
      summary: "The disputes clerk points Hero to the stamped-copy queue.",
      quote: "Stamped-copy disputes go through the north queue.",
      sourceRefs: ["Concourse Disputes Clerk"],
      claims: [
        {
          claimKind: "requirement",
          polarity: "states",
          subjectText: "Stamped-copy queue",
          summary: "Stamped-copy disputes go through the north queue.",
        },
      ],
      stateEffects: [],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-clerk-answer",
        ...dialogueInput,
        persisted: true,
      },
      authority: {
        toolResultId: "tool-result-clerk-answer",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 8,
        resultWorldVersion: 9,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-clerk-answer"],
        eventRefs: ["event-clerk-answer"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Create the clerk and record their answer.",
      text: "",
      rawToolCalls: [],
      stepResults: [
        {
          stepId: "scene-extra-step",
          attempt: 1,
          status: "done",
          toolName: "create_scene_extra",
          candidateInput: {
            locationRef: "current_scene",
            role: "clerk",
            name: "Concourse Disputes Clerk",
            reason: "A local support responder is needed.",
          },
          validationError: null,
          visibleEffect: "A disputes clerk is available.",
          privateGuardTerms: [],
          mutationRefs: ["npc-disputes-clerk"],
          settledAtTick: 5,
          result: sceneExtraResult,
        },
        {
          stepId: "dialogue-uses-scene-extra-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: dialogueInput,
          validationError: null,
          visibleEffect: "The clerk's answer is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-clerk-answer"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["scene-extra-step", "dialogue-uses-scene-extra-step"],
      acceptedToolResultIds: ["tool-result-scene-extra", "tool-result-clerk-answer"],
    } as never);

    await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      acceptedToolResultRefs?: string[];
    };
    expect(persistedPacket.acceptedToolResultRefs).toEqual(
      expect.arrayContaining([
        "scene-extra-step",
        "dialogue-uses-scene-extra-step",
      ]),
    );
  });

  it("keeps observation-only scene-extra reuse evidence-only before an accepted dialogue outcome", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Use the local clerk already in scene and record the clerk's answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    const sceneExtraInput = {
      locationRef: "current_scene",
      role: "clerk",
      name: "Concourse Disputes Clerk",
      reason: "Reuse the visible local clerk for the answer.",
    };
    const sceneExtraReuseResult = {
      success: true,
      kind: "observation",
      observationOnly: true,
      result: {
        id: "npc-existing-local-clerk",
        name: "Concourse Disputes Clerk",
        locationId: "loc-concourse",
        locationName: "Concourse",
        tier: "temporary",
        temporary: true,
        reusedExisting: true,
        delegateTool: "existing_npc",
      },
    };
    const dialogueInput = {
      speakerRef: "npc-existing-local-clerk",
      addresseeRefs: ["Hero"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The clerk's answer tells Hero which queue to use later.",
      summary: "The existing disputes clerk points Hero to the stamped-copy queue.",
      quote: "Stamped-copy disputes go through the north queue.",
      sourceRefs: ["npc-existing-local-clerk"],
      claims: [
        {
          claimKind: "requirement",
          polarity: "states",
          subjectText: "Stamped-copy queue",
          summary: "Stamped-copy disputes go through the north queue.",
        },
      ],
      stateEffects: [],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-existing-clerk-answer",
        ...dialogueInput,
        persisted: true,
      },
      authority: {
        toolResultId: "tool-result-existing-clerk-answer",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-existing-clerk-answer"],
        eventRefs: ["event-existing-clerk-answer"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Reuse the local clerk and record their answer.",
      text: "",
      rawToolCalls: [],
      stepResults: [
        {
          stepId: "scene-extra-reuse-step",
          attempt: 1,
          status: "done",
          toolName: "create_scene_extra",
          candidateInput: sceneExtraInput,
          validationError: null,
          visibleEffect: "An existing disputes clerk is already available.",
          privateGuardTerms: [],
          mutationRefs: [],
          settledAtTick: 5,
          result: sceneExtraReuseResult,
        },
        {
          stepId: "dialogue-existing-clerk-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: dialogueInput,
          validationError: null,
          visibleEffect: "The clerk's answer is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-existing-clerk-answer"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["scene-extra-reuse-step", "dialogue-existing-clerk-step"],
      acceptedToolResultIds: [
        "tool-result-scene-extra-reuse",
        "tool-result-existing-clerk-answer",
      ],
    } as never);

    const events = await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      acceptedToolResultRefs?: string[];
      acceptedDurableEventIds?: string[];
      canonicalTurnPacket?: {
        actionResults?: Array<{
          actionRef?: string;
          acceptedReceipt?: boolean;
          toolName?: string;
          input?: unknown;
          args?: unknown;
        }>;
        effects?: Array<{ toolName?: string }>;
        narratorFacts?: { toolResultRefs?: Array<{ toolName?: string }> };
      };
    };
    const stateUpdates = events.filter((event) => event.type === "state_update");
    expect(stateUpdates).toEqual([]);
    expect(persistedPacket.acceptedToolResultRefs).toContain("dialogue-existing-clerk-step");
    expect(persistedPacket.acceptedToolResultRefs).not.toContain("scene-extra-reuse-step");
    expect(persistedPacket.acceptedDurableEventIds).toEqual(["event-existing-clerk-answer"]);
    expect(persistedPacket.canonicalTurnPacket?.effects).toEqual([
      expect.objectContaining({ toolName: "record_dialogue_outcome" }),
    ]);
    expect(persistedPacket.canonicalTurnPacket?.narratorFacts?.toolResultRefs).toEqual([
      expect.objectContaining({ toolName: "record_dialogue_outcome" }),
    ]);
    expect(persistedPacket.canonicalTurnPacket?.actionResults).toEqual([
      expect.objectContaining({
        actionRef: "dialogue-existing-clerk-step",
        acceptedReceipt: true,
        toolName: "record_dialogue_outcome",
        input: dialogueInput,
        args: dialogueInput,
      }),
    ]);
  });

  it("rejects create_scene_extra acceptance through role-only dialogue refs", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Create a current-scene clerk and record the clerk's answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    const sceneExtraResult = {
      success: true,
      status: "success",
      result: {
        id: "npc-disputes-clerk",
        name: "Concourse Disputes Clerk",
        kind: "scene_extra",
        role: "clerk",
        temporary: true,
      },
      authority: {
        toolResultId: "tool-result-scene-extra",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["npc:npc-disputes-clerk", "Concourse Disputes Clerk"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    const dialogueInput = {
      speakerRef: "clerk",
      addresseeRefs: ["Hero"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The clerk's answer tells Hero which queue to use later.",
      summary: "A clerk points Hero to the stamped-copy queue.",
      quote: "Stamped-copy disputes go through the north queue.",
      sourceRefs: ["clerk"],
      claims: [
        {
          claimKind: "requirement",
          polarity: "states",
          subjectText: "Stamped-copy queue",
          summary: "Stamped-copy disputes go through the north queue.",
        },
      ],
      stateEffects: [],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-clerk-answer",
        ...dialogueInput,
        persisted: true,
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Create the clerk and record their answer with a role label.",
      text: "",
      rawToolCalls: [],
      stepResults: [
        {
          stepId: "scene-extra-role-only-step",
          attempt: 1,
          status: "done",
          toolName: "create_scene_extra",
          candidateInput: {
            locationRef: "current_scene",
            role: "clerk",
            name: "Concourse Disputes Clerk",
            reason: "A local support responder is needed.",
          },
          validationError: null,
          visibleEffect: "A disputes clerk is available.",
          privateGuardTerms: [],
          mutationRefs: ["npc-disputes-clerk"],
          settledAtTick: 5,
          result: sceneExtraResult,
        },
        {
          stepId: "dialogue-role-only-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: dialogueInput,
          validationError: null,
          visibleEffect: "The clerk's answer is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-clerk-answer"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["dialogue-role-only-step"],
      acceptedToolResultIds: [],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
  });

  it("rejects create_scene_extra acceptance through raw backend dialogue refs", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Create a current-scene clerk and record the clerk's answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    const sceneExtraResult = {
      success: true,
      status: "success",
      result: {
        id: "npc-disputes-clerk",
        name: "Concourse Disputes Clerk",
        kind: "scene_extra",
        role: "clerk",
        temporary: true,
        modelSafeRefs: ["Concourse Disputes Clerk"],
      },
      authority: {
        toolResultId: "tool-result-scene-extra",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["npc:npc-disputes-clerk", "Concourse Disputes Clerk"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    const dialogueInput = {
      speakerRef: "npc-disputes-clerk",
      addresseeRefs: ["Hero"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The clerk's answer tells Hero which queue to use later.",
      summary: "The disputes clerk points Hero to the stamped-copy queue.",
      quote: "Stamped-copy disputes go through the north queue.",
      sourceRefs: ["npc:npc-disputes-clerk"],
      claims: [
        {
          claimKind: "requirement",
          polarity: "states",
          subjectText: "Stamped-copy queue",
          summary: "Stamped-copy disputes go through the north queue.",
        },
      ],
      stateEffects: [],
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Create the clerk and record their answer with a raw backend ref.",
      text: "",
      rawToolCalls: [],
      stepResults: [
        {
          stepId: "scene-extra-raw-ref-step",
          attempt: 1,
          status: "done",
          toolName: "create_scene_extra",
          candidateInput: {
            locationRef: "current_scene",
            role: "clerk",
            name: "Concourse Disputes Clerk",
            reason: "A local support responder is needed.",
          },
          validationError: null,
          visibleEffect: "A disputes clerk is available.",
          privateGuardTerms: [],
          mutationRefs: ["npc-disputes-clerk"],
          settledAtTick: 5,
          result: sceneExtraResult,
        },
        {
          stepId: "dialogue-raw-ref-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: dialogueInput,
          validationError: null,
          visibleEffect: "The clerk's answer is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-clerk-answer"],
          settledAtTick: 5,
          result: {
            success: true,
            status: "success",
            result: {
              eventId: "event-clerk-answer",
              ...dialogueInput,
              persisted: true,
            },
          },
        },
      ],
      acceptedStepIds: ["dialogue-raw-ref-step"],
      acceptedToolResultIds: [],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
  });

  it("accepts a dialogue structural pre-tool when the accepted dialogue receipt backs it", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Apply the clerk's permission mark and record the answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "permission",
          durability: "durable",
          requiresStructuralEffect: true,
          effectKind: "entity_tag",
        },
      }),
    });
    const stateEffect = {
      effectId: "effect-trusted-by-clerk",
      status: "applied_now",
      stateReceipt: "state_receipt_1_1",
      structuralTool: "add_tag",
      targetRef: "Hero",
      stateKey: "tag",
      stateValue: "trusted-by-clerk",
      summary: "Hero is marked as trusted by the clerk.",
    };
    const addTagResult = {
      success: true,
      status: "success",
      result: {
        entity: "Hero",
        appliedTag: "trusted-by-clerk",
        tags: ["trusted-by-clerk"],
      },
      authority: {
        toolResultId: "tool-result-add-tag",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["actor:hero", "trusted-by-clerk"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
      stateReceipts: [{
        stateReceipt: "state_receipt_1_1",
        tool: "add_tag",
        target: "Hero",
        key: "tag",
        value: "trusted-by-clerk",
      }],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-dialogue-structural",
        topicKind: "permission",
        outcomeKind: "answered",
        authorityKind: "role_authority",
        truthStatus: "settled_by_backend",
        durability: "durable",
        persisted: true,
        futureUseKind: "permission_check",
        futureRelevance: "The clerk's trust mark can affect later route checks.",
        summary: "The clerk accepts Hero as trusted for this route.",
        claims: [
          {
            claimKind: "permission",
            polarity: "allows",
            subjectText: "Hero's route trust status",
            summary: "Hero is trusted by the clerk for this route.",
          },
        ],
        stateEffects: [stateEffect],
      },
      authority: {
        toolResultId: "tool-result-dialogue",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 8,
        resultWorldVersion: 9,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-dialogue-structural"],
        eventRefs: ["event-dialogue-structural"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Apply the permission mark and record the clerk's answer.",
      text: "",
      rawToolCalls: [
        {
          tool: "add_tag",
          args: { entityName: "Hero", entityType: "player", tag: "trusted-by-clerk" },
          result: addTagResult,
        },
        {
          tool: "record_dialogue_outcome",
          args: {
            speakerRef: "Clerk",
            addresseeRefs: ["Hero"],
            outcomeKind: "answered",
            topicKind: "permission",
            authorityKind: "role_authority",
            truthStatus: "settled_by_backend",
            durability: "durable",
            futureUseKind: "permission_check",
            futureRelevance: "The clerk's trust mark can affect later route checks.",
            summary: "The clerk accepts Hero as trusted for this route.",
            quote: "I accept Hero as trusted for this route.",
            sourceRefs: ["Clerk"],
            claims: [
              {
                claimKind: "permission",
                polarity: "allows",
                subjectText: "Hero's route trust status",
                summary: "Hero is trusted by the clerk for this route.",
              },
            ],
            stateEffects: [stateEffect],
          },
          result: dialogueResult,
        },
      ],
      stepResults: [
        {
          stepId: "backing-add-tag-step",
          attempt: 1,
          status: "done",
          toolName: "add_tag",
          candidateInput: { entityName: "Hero", entityType: "player", tag: "trusted-by-clerk" },
          validationError: null,
          visibleEffect: "Hero is marked as trusted by the clerk.",
          privateGuardTerms: [],
          mutationRefs: ["actor:hero", "trusted-by-clerk"],
          settledAtTick: 5,
          result: addTagResult,
        },
        {
          stepId: "accepted-dialogue-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: {
            speakerRef: "Clerk",
            addresseeRefs: ["Hero"],
            outcomeKind: "answered",
            topicKind: "permission",
            authorityKind: "role_authority",
            truthStatus: "settled_by_backend",
            durability: "durable",
            futureUseKind: "permission_check",
            futureRelevance: "The clerk's trust mark can affect later route checks.",
            summary: "The clerk accepts Hero as trusted for this route.",
            quote: "I accept Hero as trusted for this route.",
            sourceRefs: ["Clerk"],
            claims: [
              {
                claimKind: "permission",
                polarity: "allows",
                subjectText: "Hero's route trust status",
                summary: "Hero is trusted by the clerk for this route.",
              },
            ],
            stateEffects: [stateEffect],
          },
          validationError: null,
          visibleEffect: "The clerk's permission is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-dialogue-structural"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["backing-add-tag-step", "accepted-dialogue-step"],
      acceptedToolResultIds: ["tool-result-add-tag", "tool-result-dialogue"],
    } as never);

    await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      canonicalTurnPacket?: { effects?: Array<{ toolName?: string }> };
      acceptedToolResultRefs?: string[];
      acceptedDurableEventIds?: string[];
    };
    expect(persistedPacket.canonicalTurnPacket?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "add_tag" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome" }),
      ]),
    );
    expect(persistedPacket.acceptedToolResultRefs).toEqual(
      expect.arrayContaining(["backing-add-tag-step", "accepted-dialogue-step"]),
    );
    expect(persistedPacket.acceptedDurableEventIds).toEqual(["event-dialogue-structural"]);
    expect(buildNarratorPacket).toHaveBeenCalled();
  });

  it("accepts spawned carried receipt stateEffects after GM tool loop action conversion", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Issue a delay-report receipt and record its dialogue answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "proof",
          durability: "durable",
          requiresStructuralEffect: true,
          effectKind: "item_created",
        },
      }),
    });
    const stateEffect = {
      effectId: "receipt-issued",
      status: "applied_now",
      stateReceipt: "state_receipt_1_1",
      structuralTool: "spawn_item",
      targetRef: "Stamped Delay-Report Receipt",
      stateKey: "possession",
      stateValue: "carried",
      summary: "Mira receives the stamped delay-report receipt.",
    };
    const spawnItemResult = {
      success: true,
      status: "success",
      result: {
        id: "item-stamped-delay-report-receipt",
        name: "Stamped Delay-Report Receipt",
        owner: "Mira Voss",
        ownerType: "character",
      },
      authority: {
        toolResultId: "tool-result-spawn-receipt",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["item:stamped-delay-report-receipt", "actor:mira-voss"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
      stateReceipts: [{
        stateReceipt: "state_receipt_1_1",
        tool: "spawn_item",
        target: "Stamped Delay-Report Receipt",
        key: "possession",
        value: "carried",
      }],
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-delay-report-receipt-issued",
        topicKind: "proof",
        outcomeKind: "answered",
        authorityKind: "role_authority",
        truthStatus: "settled_by_backend",
        durability: "durable",
        persisted: true,
        futureUseKind: "evidence",
        futureRelevance: "The stamped receipt proves Mira reported the delay.",
        summary: "Courier-Marshal Ten issues Mira a stamped delay-report receipt.",
        claims: [
          {
            claimKind: "document_status",
            polarity: "states",
            subjectRef: "Stamped Delay-Report Receipt",
            summary: "The receipt documents the reported delay.",
          },
        ],
        stateEffects: [stateEffect],
      },
      authority: {
        toolResultId: "tool-result-dialogue-receipt",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 8,
        resultWorldVersion: 9,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["event-delay-report-receipt-issued"],
        eventRefs: ["event-delay-report-receipt-issued"],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Issue the receipt and record the answer.",
      text: "",
      rawToolCalls: [
        {
          tool: "spawn_item",
          args: {
            name: "Stamped Delay-Report Receipt",
            tags: ["document", "receipt", "proof"],
            ownerName: "Mira Voss",
            ownerType: "character",
          },
          result: spawnItemResult,
        },
        {
          tool: "record_dialogue_outcome",
          args: {
            speakerRef: "Courier-Marshal Ten",
            addresseeRefs: ["Mira Voss"],
            outcomeKind: "answered",
            topicKind: "proof",
            authorityKind: "role_authority",
            truthStatus: "settled_by_backend",
            durability: "durable",
            futureUseKind: "evidence",
            futureRelevance: "The stamped receipt proves Mira reported the delay.",
            summary: "Courier-Marshal Ten issues Mira a stamped delay-report receipt.",
            quote: "This stamped receipt records your delay report.",
            sourceRefs: ["Courier-Marshal Ten", "Mira Voss"],
            claims: [
              {
                claimKind: "document_status",
                polarity: "states",
                subjectRef: "Stamped Delay-Report Receipt",
                summary: "The receipt documents the reported delay.",
              },
            ],
            stateEffects: [stateEffect],
          },
          result: dialogueResult,
        },
      ],
      stepResults: [
        {
          stepId: "spawn-receipt-step",
          attempt: 1,
          status: "done",
          toolName: "spawn_item",
          candidateInput: {
            name: "Stamped Delay-Report Receipt",
            tags: ["document", "receipt", "proof"],
            ownerName: "Mira Voss",
            ownerType: "character",
          },
          validationError: null,
          visibleEffect: "Mira receives the stamped delay-report receipt.",
          privateGuardTerms: [],
          mutationRefs: ["item:stamped-delay-report-receipt"],
          settledAtTick: 5,
          result: spawnItemResult,
        },
        {
          stepId: "dialogue-receipt-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: {
            speakerRef: "Courier-Marshal Ten",
            addresseeRefs: ["Mira Voss"],
            outcomeKind: "answered",
            topicKind: "proof",
            authorityKind: "role_authority",
            truthStatus: "settled_by_backend",
            durability: "durable",
            futureUseKind: "evidence",
            futureRelevance: "The stamped receipt proves Mira reported the delay.",
            summary: "Courier-Marshal Ten issues Mira a stamped delay-report receipt.",
            quote: "This stamped receipt records your delay report.",
            sourceRefs: ["Courier-Marshal Ten", "Mira Voss"],
            claims: [
              {
                claimKind: "document_status",
                polarity: "states",
                subjectRef: "Stamped Delay-Report Receipt",
                summary: "The receipt documents the reported delay.",
              },
            ],
            stateEffects: [stateEffect],
          },
          validationError: null,
          visibleEffect: "The receipt issuance is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-delay-report-receipt-issued"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
      acceptedStepIds: ["spawn-receipt-step", "dialogue-receipt-step"],
      acceptedToolResultIds: ["tool-result-spawn-receipt", "tool-result-dialogue-receipt"],
    } as never);

    await collectEvents(processTurn(createTestOptions()));

    const persistedPacket = persistSettledTurnPacketMock.mock.calls[0]?.[0] as {
      canonicalTurnPacket?: { effects?: Array<{ toolName?: string }> };
      acceptedToolResultRefs?: string[];
      acceptedDurableEventIds?: string[];
    };
    expect(persistedPacket.canonicalTurnPacket?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ toolName: "spawn_item" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome" }),
      ]),
    );
    expect(persistedPacket.acceptedToolResultRefs).toEqual(
      expect.arrayContaining(["spawn-receipt-step", "dialogue-receipt-step"]),
    );
    expect(persistedPacket.acceptedDurableEventIds).toEqual(["event-delay-report-receipt-issued"]);
    expect(buildNarratorPacket).toHaveBeenCalled();
  });

  it("fails closed when a dialogue receipt does not actually back its prior structural mutation", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Apply the clerk's permission mark and record the answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          topicKind: "permission",
          durability: "durable",
          requiresStructuralEffect: true,
          effectKind: "entity_tag",
        },
      }),
    });
    const wrongStateEffect = {
      effectId: "effect-wrong-tag",
      status: "applied_now",
      structuralTool: "add_tag",
      targetRef: "Hero",
      stateKey: "tag",
      stateValue: "wrong-tag",
      summary: "Hero is marked with the wrong tag.",
    };
    const addTagResult = {
      success: true,
      status: "success",
      result: {
        entity: "Hero",
        appliedTag: "trusted-by-clerk",
        tags: ["trusted-by-clerk"],
      },
      authority: {
        toolResultId: "tool-result-add-tag",
        campaignId: CAMPAIGN_ID,
        sourceEntity: { type: "player", id: SCENE_PLAN_PLAYER_ID },
        baseWorldVersion: 7,
        resultWorldVersion: 8,
        elapsedWorldTimeMinutes: 0,
        stateDeltaRefs: ["actor:hero", "trusted-by-clerk"],
        eventRefs: [],
        witnesses: [],
        knowledgeOutputs: [],
        visibilityOutputs: [],
        resources: [],
      },
    };
    const dialogueResult = {
      success: true,
      status: "success",
      result: {
        eventId: "event-dialogue-unbacked",
        topicKind: "permission",
        outcomeKind: "answered",
        authorityKind: "role_authority",
        truthStatus: "settled_by_backend",
        durability: "durable",
        persisted: true,
        futureUseKind: "permission_check",
        futureRelevance: "The clerk's trust mark can affect later route checks.",
        summary: "The clerk accepts Hero as trusted for this route.",
        claims: [
          {
            claimKind: "permission",
            polarity: "allows",
            subjectText: "Hero's route trust status",
            summary: "Hero is trusted by the clerk for this route.",
          },
        ],
        stateEffects: [wrongStateEffect],
      },
    };

    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Record a mismatched dialogue state effect.",
      text: "",
      rawToolCalls: [],
      stepResults: [
        {
          stepId: "unbacked-add-tag-step",
          attempt: 1,
          status: "done",
          toolName: "add_tag",
          candidateInput: { entityName: "Hero", entityType: "player", tag: "trusted-by-clerk" },
          validationError: null,
          visibleEffect: "Hero is marked as trusted by the clerk.",
          privateGuardTerms: [],
          mutationRefs: ["actor:hero", "trusted-by-clerk"],
          settledAtTick: 5,
          result: addTagResult,
        },
        {
          stepId: "unbacked-dialogue-step",
          attempt: 1,
          status: "done",
          toolName: "record_dialogue_outcome",
          candidateInput: {
            speakerRef: "Clerk",
            addresseeRefs: ["Hero"],
            outcomeKind: "answered",
            topicKind: "permission",
            authorityKind: "role_authority",
            truthStatus: "settled_by_backend",
            durability: "durable",
            futureUseKind: "permission_check",
            futureRelevance: "The clerk's trust mark can affect later route checks.",
            summary: "The clerk accepts Hero as trusted for this route.",
            sourceRefs: ["Clerk"],
            claims: [
              {
                claimKind: "permission",
                polarity: "allows",
                subjectText: "Hero's route trust status",
                summary: "Hero is trusted by the clerk for this route.",
              },
            ],
            stateEffects: [wrongStateEffect],
          },
          validationError: null,
          visibleEffect: "The clerk's permission is recorded.",
          privateGuardTerms: [],
          mutationRefs: ["event-dialogue-unbacked"],
          settledAtTick: 5,
          result: dialogueResult,
        },
      ],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "record_dialogue_outcome declared applied_now stateEffect without a prior matching structural state tool result",
    );
    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
  });

  it("fails closed before actor reactions when a successful state mutation is not the accepted receipt", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        turnIntent: "Record the durable procedure answer.",
        runtimeRequirement: {
          kind: "world_fact",
          topicKind: "procedure",
          durability: "durable",
        },
      }),
    });
    vi.mocked(runGmToolLoop).mockResolvedValueOnce({
      intent: "Accidentally tag the wrong actor instead of recording the required fact.",
      text: "",
      rawToolCalls: [
        {
          tool: "add_tag",
          args: { entityName: "Witness", entityType: "npc", tag: "stamp-rumor-source" },
          result: {
            success: true,
            status: "success",
            result: { entity: "Witness", tags: ["stamp-rumor-source"] },
          },
        },
      ],
      stepResults: [
        {
          stepId: "unaccepted-add-tag-step",
          attempt: 1,
          status: "done",
          toolName: "add_tag",
          candidateInput: {
            entityName: "Witness",
            entityType: "npc",
            tag: "stamp-rumor-source",
          },
          validationError: null,
          visibleEffect: "Witness is tagged as a rumor source.",
          privateGuardTerms: [],
          mutationRefs: ["npc:witness:tag:stamp-rumor-source"],
          settledAtTick: 5,
          result: {
            success: true,
            status: "success",
            result: { entity: "Witness", tags: ["stamp-rumor-source"] },
          },
        },
      ],
    } as never);

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop produced successful side-effecting result(s) that do not satisfy the accepted turn receipt",
    );

    expect(persistSettledTurnPacketMock).not.toHaveBeenCalled();
    expect(runRequiredActorDecisionPassMock).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
  });

  it("refuses to start a new ScenePlan turn while narration is pending", async () => {
    setupMocks();
    assertNoPendingNarrationBeforeNewTurnMock.mockImplementationOnce(() => {
      throw new Error("Campaign has pending narration.");
    });

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "Campaign has pending narration.",
    );

    expect(assertNoPendingNarrationBeforeNewTurnMock).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
    });
    expect(createTurnSagaMock).not.toHaveBeenCalled();
    expect(buildSceneFrame).not.toHaveBeenCalled();
  });

  it("persists OracleDecision immediately after Oracle acceptance before tool loop and narration", async () => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        path: "roll_oracle",
        rollRequest: {
          actorRef: "Player",
          question: "Can the hero force the gate?",
          stakes: "Noise may draw attention.",
          evidenceRefs: ["Player"],
        },
      }),
    });

    const milestones: string[] = [];
    vi.mocked(callOracle).mockImplementationOnce(async () => {
      milestones.push("oracle accepted");
      return mockOracleResult();
    });
    persistOracleDecisionMock.mockImplementationOnce(() => {
      milestones.push("oracle decision persisted");
      return { id: "oracle-decision-1", sagaId: "saga-1" };
    });
    vi.mocked(runGmToolLoop).mockImplementationOnce(async () => {
      milestones.push("gm tool loop");
      return {
        intent: "Plan a concrete local scene mutation.",
        text: "",
        rawToolCalls: [],
        stepResults: [],
      } as never;
    });

    const events: TurnEvent[] = [];
    for await (const event of processTurn(createTestOptions())) {
      if (event.type === "oracle_result") {
        milestones.push("oracle_result event");
      }
      events.push(event);
    }

    expect(persistOracleDecisionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Can the hero force the gate?",
        stakes: "Noise may draw attention.",
        outcome: "strong_hit",
        baseWorldVersion: 7,
        acceptedWorldVersion: 7,
      }),
    );
    expect(milestones).toEqual([
      "oracle accepted",
      "oracle decision persisted",
      "oracle_result event",
      "gm tool loop",
    ]);
    expect(persistOracleDecisionMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runVisibleNarrationWithPacketGuard).mock.invocationCallOrder[0]!,
    );
  });

  it("persists SettledTurnPacket after packet construction and before final prompt/narration", async () => {
    setupMocks();
    setupScenePlanMocks();

    await collectEvents(processTurn(createTestOptions()));

    expect(claimTurnSagaWorkerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        workerId: expect.stringContaining("live-turn-narration:"),
        allowStaleReclaim: false,
      }),
    );
    expect(persistSettledTurnPacketMock).toHaveBeenCalledWith(
      expect.objectContaining({
        lockToken: "lock-token",
        canonicalTurnPacket: expect.any(Object),
        narratorPacket: expect.any(Object),
        requiresNarration: true,
        baseWorldVersion: 7,
        resultWorldVersion: 7,
      }),
    );
    expect(vi.mocked(buildNarratorPacket).mock.invocationCallOrder[0]).toBeLessThan(
      persistSettledTurnPacketMock.mock.invocationCallOrder[0]!,
    );
    expect(persistSettledTurnPacketMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(assembleFinalNarrationPrompt).mock.invocationCallOrder[0]!,
    );
    expect(persistSettledTurnPacketMock.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(runVisibleNarrationWithPacketGuard).mock.invocationCallOrder[0]!,
    );
    expect(heartbeatTurnSagaWorkerMock).toHaveBeenCalledWith({
      sagaId: "saga-1",
      lockToken: "lock-token",
    });
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", lockToken: "lock-token" }),
    );
    expect(recordTurnAuthorityStageMock.mock.calls.map(([input]) =>
      (input as { stage: string }).stage,
    )).toEqual([
      "intent_created",
      "lease_acquired",
      "snapshot_taken",
      "effects_staged",
      "receipts_accepted",
      "canonical_state_committed",
      "settled_packet_persisted",
      "narration_accepted",
      "public_projection_committed",
      "turn_finalized",
    ]);
    expect(recordTurnAuthorityStageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: "snapshot_taken",
        payload: expect.objectContaining({
          provided: false,
        }),
      }),
    );
    expect(assertTurnAuthorityStagesCompleteMock).toHaveBeenCalledWith({ sagaId: "saga-1" });
    expect(assertTurnAuthorityStagesCompleteMock.mock.invocationCallOrder[0]).toBeLessThan(
      markTurnSagaFinalizedMock.mock.invocationCallOrder[0]!,
    );
    expect(markTurnSagaFinalizedMock).toHaveBeenCalledWith(
      expect.objectContaining({ lockToken: "lock-token" }),
    );
  });

  it("uses closed structured grounded sentence draft generation and emits only compiled prose", async () => {
    setupMocks();
    setupScenePlanMocks();

    const events = await collectEvents(processTurn(createTestOptions({ storytellerMaxTokens: 32_000 })));
    const finalNarrationCall = vi.mocked(safeGenerateObject).mock.calls.find(([call]) =>
      String((call as { prompt?: unknown } | undefined)?.prompt ?? "").includes("Final narration prompt"),
    )?.[0] as {
      model?: unknown;
      mode?: string;
      retries?: number;
      timeout?: unknown;
      maxOutputTokens?: number;
    } | undefined;

    const finalNarrationModelCall = mockedCreateModel.mock.calls.find(
      ([, options]) => options?.role === "storyteller" && options?.reasoningMode === "bypass",
    );
    expect(finalNarrationCall).toMatchObject({
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
      timeout: { totalMs: DEFAULT_PLAYER_BLOCKING_STAGE_TIMEOUT_MS },
      maxOutputTokens: 2048,
    });
    expect(finalNarrationModelCall).toBeTruthy();
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The goblin falls." } },
      ]),
    );
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({
        role: "assistant",
        content: "The goblin falls.",
      }),
    ]);
    expect(JSON.stringify(vi.mocked(appendChatMessages).mock.calls)).not.toContain('"prose"');
  });

  it("emits a dense closed structured grounded sentence without draft-contract failure", async () => {
    setupMocks();
    const { narratorPacket } = setupScenePlanMocks();
    const denseText = [
      "The scene consequence lands in one continuous visible beat, with the fallen threat no longer driving the exchange,",
      "the nearby space opening just enough for the player to choose whether to press forward, check the body,",
      "or turn attention back to whoever else can see the result before the room has time to settle into a safer rhythm.",
      "Nothing in the line adds a new item, route, promise, injury, or authority; it only renders the existing perceivable effect as a playable moment.",
    ].join(" ");
    expect(denseText.length).toBeGreaterThan(360);
    setPrimaryNarratorFactText(narratorPacket, denseText);

    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (
        prompt.includes("Final narration prompt")
        || prompt.includes("[FINAL NARRATION TASK]")
        || prompt.includes("Opening visible prompt")
      ) {
        return {
          object: {
            version: "grounded-sentence-draft.v2",
            sentences: [
              {
                factRefs: ["e1.s1"],
                evidenceRefs: ["e1"],
              },
            ],
          },
          trace: {
            text: "",
            cleanedText: "",
            strategy: "native_json",
            primaryStrategy: "native_json",
            finishReason: "stop",
            response: { modelId: "mock-model" },
          },
        } as never;
      }

      return { object: createGmReadMock(), trace: {} } as never;
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: denseText } },
      ]),
    );
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    );
  });

  it("retries and emits final narration when the grounded sentence draft over-cites valid refs", async () => {
    setupMocks();
    const { narratorPacket } = setupScenePlanMocks();
    narratorPacket.evidenceLedger = Array.from({ length: 6 }, (_, index) => ({
      id: `perceivable_effect:effect-${index + 1}`,
      category: "perceivable_effect" as const,
      summary: `Visible settled effect ${index + 1}.`,
      sourceId: `effect-${index + 1}`,
      claimSupport: ["playable_beat"],
    }));
    const visibleText = "The visible effects stack into one playable beat.";
    narratorPacket.evidenceLedger[0]!.summary = visibleText;
    let finalNarrationCalls = 0;

    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (
        prompt.includes("Final narration prompt")
        || prompt.includes("[FINAL NARRATION TASK]")
        || prompt.includes("Opening visible prompt")
      ) {
        finalNarrationCalls += 1;
        return {
          object: {
            version: "grounded-sentence-draft.v2",
            sentences: [
              {
                factRefs: ["e1.s1"],
                evidenceRefs: finalNarrationCalls === 1
                  ? ["e1", "e2", "e2", "e3", "e4", "e5", "e6"]
                  : ["e1", "e2", "e3", "e4"],
              },
            ],
          },
          trace: {
            text: "",
            cleanedText: "",
            strategy: "native_json",
            primaryStrategy: "native_json",
            finishReason: "stop",
            response: { modelId: "mock-model" },
          },
        } as never;
      }

      return { object: createGmReadMock(), trace: {} } as never;
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: visibleText } },
      ]),
    );
    expect(finalNarrationCalls).toBe(2);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    );
    expect(markTurnSagaFinalizedMock).toHaveBeenCalled();
  });

  it("retries the same closed structured final narration contract after structured output channel misses", async () => {
    setupMocks();
    const { narratorPacket } = setupScenePlanMocks();
    setPrimaryNarratorFactText(narratorPacket, "The goblin falls after the channel holds.");
    let finalNarrationCalls = 0;
    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (
        prompt.includes("Final narration prompt")
        || prompt.includes("[FINAL NARRATION TASK]")
        || prompt.includes("Opening visible prompt")
      ) {
        finalNarrationCalls += 1;
        if (finalNarrationCalls < 3) {
          throw Object.assign(
            new Error("safeGenerateObject native_json: text fallback is disabled. native_json failed: No output generated"),
            { safeGenerateCode: "native_output_unavailable" },
          );
        }
        return {
          object: createGroundedSentenceDraftForTest("The goblin falls after the channel holds."),
          trace: {
            text: "",
            cleanedText: "",
            strategy: "native_json",
            primaryStrategy: "native_json",
            finishReason: "tool-calls",
            response: { modelId: "mock-model" },
          },
        } as never;
      }

      return { object: { isMovement: false, destination: null }, trace: {} } as never;
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(finalNarrationCalls).toBe(3);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The goblin falls after the channel holds." } },
      ]),
    );
    expect(String(vi.mocked(safeGenerateObject).mock.calls.at(-1)?.[0]?.prompt)).not.toContain(
      "[PACKET VISIBILITY RECOVERY]",
    );
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded" }),
    );
    const channelRetryWarnings = logWarnMock.mock.calls.filter(([message]) =>
      String(message).includes("Visible structured narration channel error; retrying same contract pass"),
    );
    expect(channelRetryWarnings).toHaveLength(2);
  });

  it("fails closed when final grounded sentence draft generation leaves the closed structured strategy", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (prompt.includes("Final narration prompt")) {
        return {
          object: createNarrationDraftForTest("Extracted JSON should not become visible."),
          trace: {
            text: "{\"prose\":\"Extracted JSON should not become visible.\"}",
            cleanedText: "{\"prose\":\"Extracted JSON should not become visible.\"}",
            strategy: "text_fallback",
            primaryStrategy: "native_json",
            fallbackReason: "native_json failed",
          },
        } as never;
      }

      return { object: { isMovement: false, destination: null }, trace: {} } as never;
    });

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      NarrationRepairExhaustedError,
    );

    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(assistantAppendCallOrder()).toBeUndefined();
    expect(JSON.stringify(vi.mocked(appendChatMessages).mock.calls)).not.toContain(
      "Extracted JSON should not become visible.",
    );
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("fails closed before chat or SSE when live final narration returns legacy text with private prose", async () => {
    setupMocks();
    setupScenePlanMocks();
    const leakedText =
      "Forest Outpost unlocks the hidden npc:secret_captain route even though no accepted fact granted it.";
    let finalNarrationCalls = 0;
    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (
        prompt.includes("Final narration prompt")
        || prompt.includes("[FINAL NARRATION TASK]")
        || prompt.includes("Opening visible prompt")
      ) {
        finalNarrationCalls += 1;
        return {
          object: {
            version: "grounded-sentence-draft.v2",
            sentences: [
              {
                text: leakedText,
                evidenceRefs: ["e1"],
              },
            ],
          },
          trace: {
            text: "",
            cleanedText: "",
            strategy: "native_json",
            primaryStrategy: "native_json",
            finishReason: "stop",
            response: { modelId: "mock-model" },
          },
        } as never;
      }

      return { object: { isMovement: false, destination: null }, trace: {} } as never;
    });

    const events: TurnEvent[] = [];
    await expect((async () => {
      for await (const event of processTurn(createTestOptions())) {
        events.push(event);
      }
    })()).rejects.toThrow(NarrationRepairExhaustedError);

    expect(finalNarrationCalls).toBe(2);
    for (const [call] of vi.mocked(safeGenerateObject).mock.calls.filter(([call]) =>
      String(call?.prompt ?? "").includes("Final narration prompt"),
    )) {
      expect(call).toMatchObject({
        allowTextFallback: false,
        allowRepair: false,
        strictSchema: true,
        mode: "native_json",
      });
    }
    expect(JSON.stringify(events)).not.toContain(leakedText);
    expect(JSON.stringify(events)).not.toContain("npc:secret_captain");
    expect(assistantAppendCallOrder()).toBeUndefined();
    expect(JSON.stringify(vi.mocked(appendChatMessages).mock.calls)).not.toContain(leakedText);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalled();
  });

  it("does not run packet recovery regeneration after grounded sentence draft transport timeout", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (prompt.includes("Final narration prompt")) {
        throw new Error("AI SDK timeout after 60000ms");
      }

      return { object: { isMovement: false, destination: null }, trace: {} } as never;
    });

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      NarrationRepairExhaustedError,
    );

    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(String(vi.mocked(safeGenerateObject).mock.calls.at(-1)?.[0]?.prompt)).not.toContain(
      "[PACKET VISIBILITY RECOVERY]",
    );
    expect(assistantAppendCallOrder()).toBeUndefined();
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalled();
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledTimes(1);
    expect(logEventMock).toHaveBeenCalledWith(
      "visible-narration.packet-guard",
      expect.objectContaining({ stage: "transport-exhausted" }),
    );
  });

  it.each([
    [
      "direct",
      {
        path: "direct",
        directResolutionNotes: "Answer from settled local facts without mutation.",
      },
    ],
    [
      "continue",
      {
        path: "continue",
        continuationGuidance: "Let the current scene breathe without mutation.",
      },
    ],
    [
      "clarification",
      {
        path: "clarification",
        clarificationPrompt: "Which door are you opening?",
      },
    ],
  ])("skips planner, validation, and execution for %s GM Read paths", async (_path, pathFields) => {
    setupMocks();
    setupScenePlanMocks({
      gmRead: createGmReadMock({
        ...pathFields,
        turnIntent: undefined,
      }),
    });

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(runScenePlanner).not.toHaveBeenCalled();
    expect(validateScenePlan).not.toHaveBeenCalled();
    expect(executeScenePlan).not.toHaveBeenCalled();
    expect(callOracle).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "done")).toBe(true);

    const packetArgs = vi.mocked(buildNarratorPacket).mock.calls.at(-1)?.[0] as
      | {
        canonicalTurnPacket?: {
          anchorEvent?: { summary?: string };
          responses?: Array<{ summary: string; evidenceAuthority?: string }>;
        };
      }
      | undefined;
    const expectedGuidance =
      "directResolutionNotes" in pathFields
        ? pathFields.directResolutionNotes
        : "continuationGuidance" in pathFields
          ? pathFields.continuationGuidance
          : "clarificationPrompt" in pathFields
            ? pathFields.clarificationPrompt
            : null;

    expect(packetArgs?.canonicalTurnPacket?.anchorEvent?.summary).toContain(
      "Player action request:",
    );
    expect(typeof expectedGuidance).toBe("string");
    expect(packetArgs?.canonicalTurnPacket?.responses?.[0]?.summary).toContain(
      expectedGuidance as string,
    );
    expect(packetArgs?.canonicalTurnPacket?.responses?.[0]?.evidenceAuthority).toBe(
      "model_guidance",
    );
    expect(persistSettledTurnPacketMock).toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalled();
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "Clarification returned without settled narration packet.",
      }),
    );
    expect(sagaStatusTransitions()).toEqual([
      "collecting_context",
      "pre_turn_catchup",
      "gm_reading",
      "oracle_adjudicating",
      "tool_loop_running",
      "local_reaction_running",
      "world_consequence_running",
      "narrator_rendering",
    ]);
  });

  it("throws GM tool-loop failures before final narration, assistant persistence, and done", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runGmToolLoop).mockRejectedValueOnce(new Error("GM tool loop failed: unknown actor"));

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      "GM tool loop failed: unknown actor",
    );

    expect(assembleFinalNarrationPrompt).not.toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
    expect(assistantAppendCallOrder()).toBeUndefined();
  });

  it("excludes hidden actor-turn log_event memory from the canonical narrator packet", async () => {
    setupMocks();
    const { frame } = setupScenePlanMocks();
    frame.roster.active.push({
      id: "npc-renn",
      actorId: "npc-renn",
      type: "npc",
      label: "Renn",
      locationId: "loc-1",
      sceneScopeId: "loc-1",
      awareness: "clear",
    });
    runRequiredActorDecisionPassMock.mockReturnValue({
      actionResults: [
        {
          order: 1,
          actionId: "actor-hidden-memory-action",
          actionRef: "actor-tool:npc-renn:log_event:1",
          actorId: "npc-renn",
          toolName: "log_event",
          input: {
            text: "Renn privately recognizes the sealed proof pattern.",
            importance: 6,
            participants: ["Renn"],
            durability: "durable",
            futureRelevance: "Renn can use this private recognition later.",
          },
          args: {
            text: "Renn privately recognizes the sealed proof pattern.",
            importance: 6,
            participants: ["Renn"],
            durability: "durable",
            futureRelevance: "Renn can use this private recognition later.",
          },
          result: {
            success: true,
            result: {
              eventId: "event-private-memory",
              durability: "durable",
              persisted: true,
              visibility: "hidden",
              surfaceRoute: "actor_private_log_event",
            },
            authority: {
              toolResultId: "tool-result-private-memory",
              resultWorldVersion: 8,
              eventRefs: ["event-private-memory"],
              stateDeltaRefs: [],
              witnesses: [],
              knowledgeOutputs: [],
              visibilityOutputs: [],
              resources: [],
            },
          },
        },
      ],
      schedule: { decisions: [] },
      decisions: [],
      parallelFrameRetrievalTrace: [],
      parallelPrepTrace: [],
    });

    await collectEvents(processTurn(createTestOptions()));

    const packetArgs = vi.mocked(buildNarratorPacket).mock.calls.at(-1)?.[0] as
      | {
          canonicalTurnPacket?: {
            narratorFacts?: {
              actionIds?: string[];
              toolResultRefs?: Array<{ actionId: string; toolName: string }>;
            };
            effects?: Array<{ actionId?: string; summary?: string }>;
            actionResults?: Array<{ actionId?: string }>;
          };
        }
      | undefined;
    const canonicalTurnPacket = packetArgs?.canonicalTurnPacket;

    expect(canonicalTurnPacket?.narratorFacts?.actionIds).not.toContain(
      "actor-hidden-memory-action",
    );
    expect(canonicalTurnPacket?.narratorFacts?.toolResultRefs).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "actor-hidden-memory-action" }),
      ]),
    );
    expect(canonicalTurnPacket?.effects).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ actionId: "actor-hidden-memory-action" }),
      ]),
    );
    expect(JSON.stringify(canonicalTurnPacket)).not.toContain("sealed proof pattern");
  });

  it("keeps explicitly player-perceivable actor-turn log_event results narratable", async () => {
    setupMocks();
    const { frame } = setupScenePlanMocks();
    frame.roster.active.push({
      id: "npc-renn",
      actorId: "npc-renn",
      type: "npc",
      label: "Renn",
      locationId: "loc-1",
      sceneScopeId: "loc-1",
      awareness: "clear",
    });
    runRequiredActorDecisionPassMock.mockReturnValue({
      actionResults: [
        {
          order: 1,
          actionId: "actor-visible-log-action",
          actionRef: "actor-tool:npc-renn:log_event:1",
          actorId: "npc-renn",
          toolName: "log_event",
          input: {
            text: "Renn visibly stamps the proof as accepted.",
            importance: 6,
            participants: ["Renn"],
            durability: "durable",
            futureRelevance: "The visible stamp can be cited later.",
          },
          args: {
            text: "Renn visibly stamps the proof as accepted.",
            importance: 6,
            participants: ["Renn"],
            durability: "durable",
            futureRelevance: "The visible stamp can be cited later.",
          },
          result: {
            success: true,
            result: {
              eventId: "event-visible-log",
              durability: "durable",
              persisted: true,
              visibility: "player_perceivable",
              surfaceRoute: "public_actor_log_event",
            },
            authority: {
              toolResultId: "tool-result-visible-log",
              resultWorldVersion: 8,
              eventRefs: ["event-visible-log"],
              stateDeltaRefs: [],
              witnesses: [],
              knowledgeOutputs: [],
              visibilityOutputs: [],
              resources: [],
            },
          },
        },
      ],
      schedule: { decisions: [] },
      decisions: [],
      parallelFrameRetrievalTrace: [],
      parallelPrepTrace: [],
    });

    await collectEvents(processTurn(createTestOptions()));

    const packetArgs = vi.mocked(buildNarratorPacket).mock.calls.at(-1)?.[0] as
      | {
          canonicalTurnPacket?: {
            narratorFacts?: {
              actionIds?: string[];
              toolResultRefs?: Array<{ actionId: string; toolName: string }>;
            };
            effects?: Array<{ actionId?: string; summary?: string }>;
          };
        }
      | undefined;
    const canonicalTurnPacket = packetArgs?.canonicalTurnPacket;

    expect(canonicalTurnPacket?.narratorFacts?.actionIds).toContain(
      "actor-visible-log-action",
    );
    expect(canonicalTurnPacket?.narratorFacts?.toolResultRefs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "actor-visible-log-action",
          toolName: "log_event",
        }),
      ]),
    );
    expect(canonicalTurnPacket?.effects).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actionId: "actor-visible-log-action",
          summary: "Renn visibly stamps the proof as accepted.",
        }),
      ]),
    );
  });

  it("fails closed after packet-guard failure without recovery regeneration", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runVisibleNarrationWithPacketGuard).mockRejectedValueOnce(
      new VisibleNarrationPacketGuardError(
        "Visible narration failed NarrationDraft or packet validation after retry.",
        [{ kind: "grounding", term: "narration grounding" }],
        1,
        {
          ok: false,
          violations: [{ kind: "grounding", term: "narration grounding" }],
        },
      ),
    );

    const events: TurnEvent[] = [];
    await expect((async () => {
      for await (const event of processTurn(createTestOptions())) {
        events.push(event);
      }
    })()).rejects.toThrow(NarrationRepairExhaustedError);

    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(updateNarratorAttemptOutcomeMock.mock.calls).not.toEqual(
      expect.arrayContaining([
        [expect.objectContaining({ status: "succeeded" })],
      ]),
    );
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalled();
    expect(JSON.stringify(vi.mocked(safeGenerateObject).mock.calls)).not.toContain(
      "[PACKET VISIBILITY RECOVERY]",
    );
    expect(assistantAppendCallOrder()).toBeUndefined();
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });

  it("persists sanitized grounding subtype diagnostics on failed narrator attempts", async () => {
    setupMocks();
    setupScenePlanMocks();
    const validation: VisibleNarrationPacketValidationResult = {
      ok: false,
      violations: [{ kind: "grounding", term: "narration grounding" }],
      grounding: {
        ok: false,
        violations: [
          {
            kind: "unknown_evidence_ref",
            claimKind: "future_pressure",
            evidenceRefs: ["private-Forest-Outpost-ref"],
            missingEvidenceRefs: ["private-Forest-Outpost-ref"],
            requiredEvidenceCategories: ["perceivable_response"],
          },
        ],
        warnings: [],
        coverage: [
          {
            spanId: "span-Forest-Outpost-private",
            claimIds: ["claim-Forest-Outpost-private"],
            covered: false,
            requiresEvidence: true,
          },
        ],
        repairAddendum: null,
      },
      diagnostics: {
        violationKinds: ["grounding"],
        grounding: {
          violationKinds: ["unknown_evidence_ref"],
          warningKinds: [],
          coverage: {
            total: 1,
            covered: 0,
            unsupported: 1,
            evidenceRequired: 1,
            missingClaim: 0,
          },
        },
        redactionAudit: {
          hiddenEventCount: 0,
          hiddenResponseCount: 0,
          failedEffectCount: 0,
          unreferencedEffectCount: 0,
          hiddenEffectCount: 0,
          privateActorNameCount: 0,
          forbiddenFactMarkerCount: 0,
          forbiddenPrivateTermCount: 1,
          uncommittedProposalCount: 0,
        },
      },
    };
    vi.mocked(runVisibleNarrationWithPacketGuard).mockRejectedValueOnce(
      new VisibleNarrationPacketGuardError(
        "Visible narration failed NarrationDraft or packet validation after retry.",
        [{ kind: "grounding", term: "narration grounding" }],
        1,
        validation,
      ),
    );

    await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
      NarrationRepairExhaustedError,
    );

    const failedCall = updateNarratorAttemptOutcomeMock.mock.calls.find(([input]) =>
      (input as { status?: string }).status === "failed",
    )?.[0] as { groundingResult?: unknown } | undefined;

    expect(failedCall?.groundingResult).toMatchObject({
      ok: false,
      stage: "packet_guard",
      recovered: false,
      attempts: 1,
      violationKinds: ["grounding"],
      validationDiagnostics: {
        groundingViolationKinds: ["unknown_evidence_ref"],
        groundingViolations: [
          {
            kind: "unknown_evidence_ref",
            claimKind: "future_pressure",
            evidenceRefCount: 1,
            missingEvidenceRefCount: 1,
            requiredEvidenceCategories: ["perceivable_response"],
          },
        ],
        groundingCoverage: {
          total: 1,
          covered: 0,
          unsupported: 1,
          evidenceRequired: 1,
          missingClaim: 0,
        },
      },
    });
    const persistedDiagnostics = JSON.stringify(failedCall?.groundingResult);
    expect(persistedDiagnostics).not.toContain("Forest Outpost");
    expect(persistedDiagnostics).not.toContain("span-Forest-Outpost-private");
    expect(persistedDiagnostics).not.toContain("claim-Forest-Outpost-private");
  });

  it("finalizes saga only after assistant append and normal post-narration tail", async () => {
    setupMocks();
    setupScenePlanMocks();
    const onPostTurn = vi.fn();

    await collectEvents(processTurn(createTestOptions({ onPostTurn })));

    const markOrder = markTurnSagaFinalizedMock.mock.invocationCallOrder[0]!;
    expect(assistantAppendCallOrder()).toBeLessThan(markOrder);
    expect(vi.mocked(incrementTick).mock.invocationCallOrder[0]).toBeLessThan(markOrder);
    expect(onPostTurn.mock.invocationCallOrder[0]).toBeLessThan(markOrder);
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        narratorAttemptId: successfulNarratorAttemptId(),
        idempotencyKey: expect.stringContaining("post-turn:"),
      }),
    );
    expect(markTurnSagaFinalizedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        narratorAttemptId: successfulNarratorAttemptId(),
        reason: "Final narration completed from settled packet.",
      }),
    );
  });

  it("records a durable assistant append checkpoint on the live path", async () => {
    setupMocks();
    setupScenePlanMocks();

    await collectEvents(processTurn(createTestOptions()));

    const narratorAttemptId = successfulNarratorAttemptId();
    expect(mergeTurnSagaProvenanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        lockToken: "lock-token",
        patch: expect.objectContaining({
          pendingNarrationResume: expect.objectContaining({
            assistantAppend: expect.objectContaining({
              narratorAttemptId,
              deduped: false,
            }),
          }),
        }),
      }),
    );
    expect(assistantAppendCallOrder()).toBeLessThan(
      mergeTurnSagaProvenanceMock.mock.invocationCallOrder[0]!,
    );
    expect(mergeTurnSagaProvenanceMock.mock.invocationCallOrder[0]!).toBeLessThan(
      markTurnSagaFinalizedMock.mock.invocationCallOrder[0]!,
    );
  });

  it("aborts post-narration tail side effects when the live narration lock is lost", async () => {
    setupMocks();
    setupScenePlanMocks();
    const sagaState = setupTurnSagaMocks();
    const onPostTurn = vi.fn();
    let heartbeatCount = 0;
    heartbeatTurnSagaWorkerMock.mockImplementation((input: { lockToken: string }) => {
      heartbeatCount += 1;
      if (heartbeatCount >= 4) {
        throw new Error("lock conflict");
      }
      return sagaState.saga;
    });

    await expect(collectEvents(processTurn(createTestOptions({ onPostTurn })))).rejects.toThrow(
      PendingSettledTurnNarrationError,
    );

    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({ role: "assistant", content: expect.any(String) }),
    ]);
    expect(incrementTick).not.toHaveBeenCalled();
    expect(advanceCampaignTick).not.toHaveBeenCalled();
    expect(onPostTurn).not.toHaveBeenCalled();
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalled();
  });

  it("surfaces generic post-settled live failures as typed pending narration", async () => {
    setupMocks();
    setupScenePlanMocks();
    const onPostTurn = vi.fn(() => {
      throw new Error("post-tail crashed after settled packet");
    });

    await expect(collectEvents(processTurn(createTestOptions({ onPostTurn })))).rejects.toThrow(
      PendingSettledTurnNarrationError,
    );

    expect(persistSettledTurnPacketMock).toHaveBeenCalled();
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({ role: "assistant", content: expect.any(String) }),
    ]);
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalled();
  });

  it("throws Storyteller output guard failures without recovery regeneration", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runVisibleNarrationWithPacketGuard).mockRejectedValueOnce(
      new VisibleNarrationPacketGuardError(
        "Visible narration failed NarrationDraft or packet validation after retry.",
        [{ kind: "grounding", term: "narration grounding" }],
        1,
        {
          ok: false,
          violations: [{ kind: "grounding", term: "narration grounding" }],
        },
      ),
    );

    const events: TurnEvent[] = [];
    await expect((async () => {
      for await (const event of processTurn(createTestOptions())) {
        events.push(event);
      }
    })()).rejects.toThrow(NarrationRepairExhaustedError);

    expect(assistantAppendCallOrder()).toBeUndefined();
    expect(persistSettledTurnPacketMock).toHaveBeenCalled();
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(safeGenerateObject).mock.calls)).not.toContain(
      "[PACKET VISIBILITY RECOVERY]",
    );
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
  });

  it("surfaces pre-settled world consequence blockers without starting paid or narration work", async () => {
    setupMocks();
    setupTurnSagaMocks({ status: "world_consequence_running", turnId: "pending-turn" });
    getSettledTurnPacketMock.mockReturnValue(null);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(events).toEqual([
      {
        type: "error",
        data: expect.objectContaining({
          pendingNarration: true,
          pendingSettledTurnPacket: true,
          resumable: false,
          sagaId: "saga-1",
          turnId: "pending-turn",
          status: "world_consequence_running",
        }),
      },
    ]);
    expect(claimTurnSagaWorkerMock).not.toHaveBeenCalled();
    expect(assembleFinalNarrationPrompt).not.toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(callOracle).not.toHaveBeenCalled();
    expect(runGmToolLoop).not.toHaveBeenCalled();
  });

  it("recovers a prepared settled packet before pending narration resume", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "world_consequence_running", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The recovered prepared packet narrates cleanly.",
    );
    getSettledTurnPacketMock.mockReturnValue(null);
    hasPreparedSettledTurnPacketRecoveryMock.mockReturnValue(true);
    recoverSettledTurnPacketFromPreparedEventMock.mockReturnValue(settledPacket);
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("The recovered prepared packet narrates cleanly."),
      trace: {
        text: "",
        cleanedText: "",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(claimTurnSagaWorkerMock).toHaveBeenCalled();
    expect(recoverSettledTurnPacketFromPreparedEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        lockToken: "lock-token",
      }),
    );
    expect(sagaStatusTransitions()).toEqual([
      "resolved_pending_narration",
      "narrator_rendering",
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The recovered prepared packet narrates cleanly." } },
        {
          type: "done",
          data: expect.objectContaining({ tick: 6, resumed: true }),
        },
      ]),
    );
    expect(callOracle).not.toHaveBeenCalled();
    expect(runGmToolLoop).not.toHaveBeenCalled();
  });

  it("repairs a world consequence saga that already has a settled packet before narration", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "world_consequence_running", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The recovered packet narrates cleanly.",
    );
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("The recovered packet narrates cleanly."),
      trace: {
        text: "",
        cleanedText: "",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(sagaStatusTransitions()).toEqual([
      "resolved_pending_narration",
      "narrator_rendering",
    ]);
    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", lockToken: "lock-token" }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The recovered packet narrates cleanly." } },
        {
          type: "done",
          data: expect.objectContaining({ tick: 6, resumed: true }),
        },
      ]),
    );
    expect(callOracle).not.toHaveBeenCalled();
    expect(runGmToolLoop).not.toHaveBeenCalled();
  });

  it("resumes pending narration from settled artifacts without paid resolution work", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "resolved_pending_narration", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The settled scene resolves cleanly.",
    );
    const onPostTurn = vi.fn();
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("The settled scene resolves cleanly."),
      trace: {
        text: "",
        cleanedText: "",
        reasoningText: "Resume reasoning stays private by default.",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
        onPostTurn,
      }),
    );

    expect(getTurnSagaMock).toHaveBeenCalledWith({ campaignId: CAMPAIGN_ID, turnId: "pending-turn" });
    expect(getSettledTurnPacketMock).toHaveBeenCalledWith({ campaignId: CAMPAIGN_ID, turnId: "pending-turn" });
    expect(claimTurnSagaWorkerMock).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        allowStaleReclaim: true,
        staleAfterMs: 300_000,
      }),
    );
    expect(heartbeatTurnSagaWorkerMock).toHaveBeenCalledWith({
      sagaId: "saga-1",
      lockToken: "lock-token",
    });
    expect(releaseTurnSagaWorkerMock).toHaveBeenCalledWith({
      sagaId: "saga-1",
      lockToken: "lock-token",
    });
    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "succeeded", lockToken: "lock-token" }),
    );
    expect(callOracle).not.toHaveBeenCalled();
    expect(runGmToolLoop).not.toHaveBeenCalled();
    expect(runRequiredActorDecisionPassMock).not.toHaveBeenCalled();
    expect(resolveDueWorldWorkForScopeMock).not.toHaveBeenCalled();
    expect(incrementTick).toHaveBeenCalledWith(CAMPAIGN_ID);
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 6,
        narrativeText: "The settled scene resolves cleanly.",
        sagaId: "saga-1",
        narratorAttemptId: successfulNarratorAttemptId(),
        idempotencyKey: expect.stringMatching(
          /^post-turn:test-campaign-123:pending-turn:saga-1:attempt-\d+:6$/,
        ),
      }),
    );
    const markOrder = markTurnSagaFinalizedIfNeededMock.mock.invocationCallOrder[0]!;
    expect(assistantAppendCallOrder()).toBeLessThan(markOrder);
    expect(vi.mocked(incrementTick).mock.invocationCallOrder[0]).toBeLessThan(markOrder);
    expect(onPostTurn.mock.invocationCallOrder[0]).toBeLessThan(markOrder);
    expect(markTurnSagaFinalizedIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        narratorAttemptId: successfulNarratorAttemptId(),
        reason: "Final narration completed from settled packet.",
        lockToken: "lock-token",
      }),
    );
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({
        role: "assistant",
        content: "The settled scene resolves cleanly.",
      }),
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The settled scene resolves cleanly." } },
        { type: "finalizing_turn", data: { tick: 6, stage: "rollback_critical" } },
        {
          type: "scene-settling",
          data: { stage: "scene-settling", phase: "cleaning-transient-scene", tick: 6 },
        },
        {
          type: "done",
          data: expect.objectContaining({ tick: 6, resumed: true }),
        },
      ]),
    );
  });

  it("repairs stale model-guidance response evidence before resumed narration", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "resolved_pending_narration", turnId: "pending-turn" });
    const narratorPacket = settledPacket.narratorPacket as unknown as NarratorPacket;
    const staleResponse: CanonicalTurnPacketResponse = {
      id: "response-legacy-guidance",
      actorId: "guide-clerk",
      responseKind: "gesture",
      eventId: "player-action",
      summary: "Legacy GM no-mutation direction: the clerk accepts the seal.",
      visibleToPlayer: true,
    };
    const staleEvidenceId = `perceivable_response:${staleResponse.id}`;
    setPrimaryNarratorFactText(
      narratorPacket as unknown as ReturnType<typeof createNarratorPacketMock>,
      "The settled scene resolves cleanly.",
    );
    narratorPacket.perceivableResponses = [staleResponse];
    narratorPacket.evidenceLedger = [
      ...(narratorPacket.evidenceLedger ?? []),
      {
        id: staleEvidenceId,
        category: "perceivable_response",
        summary: staleResponse.summary,
        sourceId: staleResponse.id,
      },
    ];
    narratorPacket.sourceLinkedSummaries = [{
      id: "source-linked-legacy-guidance",
      summary: staleResponse.summary,
      sourceIds: [staleResponse.id],
      summarizedItemCount: 1,
    }];
    narratorPacket.canonicalTurnPacket = {
      actionResults: [],
      effects: [],
      narratorFacts: {
        actionIds: [],
        toolResultRefs: [],
      },
    } as unknown as NarratorPacket["canonicalTurnPacket"];
    vi.mocked(repairModelGuidancePerceivableResponses).mockImplementationOnce((packet) => {
      const input = packet as NarratorPacket;
      return {
        ...input,
        perceivableResponses: [],
        evidenceLedger: (input.evidenceLedger ?? []).filter((entry) => entry.id !== staleEvidenceId),
        sourceLinkedSummaries: [],
        contextBudgetTrace: undefined,
      };
    });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("The settled scene resolves cleanly."),
      trace: {
        text: "",
        cleanedText: "",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(repairModelGuidancePerceivableResponses).toHaveBeenCalledWith(
      expect.objectContaining({
        perceivableResponses: [staleResponse],
      }),
    );
    const packetArg = vi.mocked(runVisibleNarrationWithPacketGuard).mock.calls[0]?.[0]?.packet as NarratorPacket;
    expect(packetArg.perceivableResponses).toEqual([]);
    expect(packetArg.evidenceLedger?.map((entry) => entry.id)).not.toContain(staleEvidenceId);
    expect(packetArg.sourceLinkedSummaries).toEqual([]);
    expect(assembleFinalNarrationPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ narratorPacket: packetArg }),
    );
    expect(callOracle).not.toHaveBeenCalled();
    expect(runGmToolLoop).not.toHaveBeenCalled();
  });

  it("repairs stale observation wording before resumed narration", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "resolved_pending_narration", turnId: "pending-turn" });
    const narratorPacket = settledPacket.narratorPacket as unknown as NarratorPacket;
    const staleObservation = {
      id: "observation-result:action-observe",
      actionId: "action-observe",
      toolName: "list_visible_affordances",
      summary: "Scene scan: personnel Mira; barriers No visible barrier refs are present.",
      atoms: [
        {
          id: "a1",
          actionId: "action-observe",
          toolName: "list_visible_affordances",
          kind: "actor",
          summary: "Mira",
          claimSupport: ["actor_presence"],
          sourcePath: "result.visibleActors.1.label",
        },
      ],
    } satisfies NonNullable<NarratorPacket["perceivableObservations"]>[number];
    const repairedPacket: NarratorPacket = {
      ...narratorPacket,
      perceivableObservations: [{
        ...staleObservation,
        summary: "Scene scan: personnel Mira; barriers No obvious visible barriers are apparent from here.",
        atoms: [{
          ...staleObservation.atoms[0]!,
          summary: "Mira is visible here.",
        }],
      }],
      evidenceLedger: [{
        id: "observation_result:action-observe:a1",
        category: "observation_result",
        summary: "Mira is visible here.",
        sourceId: "action-observe",
        claimSupport: ["actor_presence"],
      }],
      sourceLinkedSummaries: [],
      contextBudgetTrace: undefined,
    };
    narratorPacket.perceivableObservations = [staleObservation];
    narratorPacket.evidenceLedger = [{
      id: "observation_result:action-observe:a1",
      category: "observation_result",
      summary: "Mira",
      sourceId: "action-observe",
      claimSupport: ["actor_presence"],
    }];
    narratorPacket.sourceLinkedSummaries = [{
      id: "source-linked-stale-observation",
      summary: "Mira; No visible barrier refs are present.",
      sourceIds: ["action-observe"],
      summarizedItemCount: 2,
    }];
    setPrimaryNarratorFactText(
      narratorPacket as unknown as ReturnType<typeof createNarratorPacketMock>,
      "Mira is visible here.",
    );
    vi.mocked(repairStalePerceivableObservations).mockImplementationOnce(() => repairedPacket);
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("Mira is visible here."),
      trace: {
        text: "",
        cleanedText: "",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(repairStalePerceivableObservations).toHaveBeenCalledWith(
      expect.objectContaining({
        perceivableObservations: [staleObservation],
      }),
    );
    const packetArg = vi.mocked(runVisibleNarrationWithPacketGuard).mock.calls[0]?.[0]?.packet as NarratorPacket;
    expect(packetArg).toBe(repairedPacket);
    expect(packetArg.perceivableObservations?.[0]?.atoms[0]?.summary).toBe("Mira is visible here.");
    expect(packetArg.evidenceLedger?.map((entry) => entry.summary)).toEqual(["Mira is visible here."]);
    expect(packetArg.sourceLinkedSummaries).toEqual([]);
    expect(assembleFinalNarrationPrompt).toHaveBeenCalledWith(
      expect.objectContaining({ narratorPacket: repairedPacket }),
    );
    expect(callOracle).not.toHaveBeenCalled();
    expect(runGmToolLoop).not.toHaveBeenCalled();
  });

  it("fails closed after a grounded sentence citation contract failure after bounded same-contract retry", async () => {
    setupMocks();
    setupTurnSagaMocks({ status: "resolved_pending_narration", turnId: "pending-turn" });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject)
      .mockImplementation(async () => ({
        object: {
          version: "grounded-sentence-draft.v2",
          sentences: [
            {
              text: "The scene is complete.",
              evidenceRefs: ["control_return:scene-complete"],
            },
          ],
        },
        trace: {
          text: "",
          cleanedText: "",
          strategy: "native_json",
          primaryStrategy: "native_json",
          finishReason: "stop",
        },
      } as never));

    await expect(collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    )).rejects.toThrow(NarrationRepairExhaustedError);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    for (const [call] of vi.mocked(safeGenerateObject).mock.calls) {
      expect(call).toMatchObject({
        allowTextFallback: false,
        allowRepair: false,
        strictSchema: true,
        mode: "native_json",
      });
    }
    expect(String(vi.mocked(safeGenerateObject).mock.calls[0]?.[0]?.prompt ?? "")).not.toContain(
      "[GROUNDING DRAFT CORRECTION]",
    );
    expect(assistantAppendCallOrder()).toBeUndefined();
  });

  it("refuses a locked pending narration before calling Storyteller", async () => {
    setupMocks();
    setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    claimTurnSagaWorkerMock.mockImplementationOnce(() => {
      throw new Error("Turn saga saga-1 is already claimed by worker worker-1.");
    });

    await expect(collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    )).rejects.toThrow(/already claimed/);

    expect(findLatestSuccessfulNarratorAttemptMock).not.toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(releaseTurnSagaWorkerMock).not.toHaveBeenCalled();
  });

  it("releases the resume lock when claimed work fails before finalization", async () => {
    setupMocks();
    setupTurnSagaMocks({ status: "resolved_pending_narration", turnId: "pending-turn" });
    getSettledTurnPacketMock.mockReturnValueOnce(null);

    await expect(collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    )).rejects.toThrow("SettledTurnPacket not found");

    expect(heartbeatTurnSagaWorkerMock).toHaveBeenCalledWith({
      sagaId: "saga-1",
      lockToken: "lock-token",
    });
    expect(releaseTurnSagaWorkerMock).toHaveBeenCalledWith({
      sagaId: "saga-1",
      lockToken: "lock-token",
    });
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
  });

  it("reuses an existing successful narrator attempt on resume without calling Storyteller", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The already rendered narration lands cleanly.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 2,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The already rendered narration lands cleanly.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(assembleFinalNarrationPrompt).not.toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
    expect(generateText).not.toHaveBeenCalled();
    expect(recordNarratorAttemptMock).not.toHaveBeenCalled();
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "The already rendered narration lands cleanly.",
        metadata: {
          presentation: {
            authority: "settled_packet_presentation",
            source: "settled_turn_packet",
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
          resumeNarration: {
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
        },
      },
    ]);
    expect(markTurnSagaFinalizedIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        narratorAttemptId: "attempt-existing",
        reason: "Final narration resumed from successful narrator attempt.",
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The already rendered narration lands cleanly." } },
        {
          type: "done",
          data: expect.objectContaining({ tick: 6, resumed: true }),
        },
      ]),
    );
  });

  it("does not reuse pre-contract successful narrator attempts without draft acceptance marker", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "Fresh draft-backed narration replaces the old fallback.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-old-fallback",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 2,
      status: "succeeded",
      groundingResult: { ok: true },
      finalText: "The immediate scene settles into a playable next moment.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("Fresh draft-backed narration replaces the old fallback."),
      trace: {
        text: "",
        cleanedText: "",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "Fresh draft-backed narration replaces the old fallback.",
        metadata: {
          presentation: {
            authority: "settled_packet_presentation",
            source: "settled_turn_packet",
            sagaId: "saga-1",
            narratorAttemptId: expect.any(String),
          },
          resumeNarration: {
            sagaId: "saga-1",
            narratorAttemptId: expect.any(String),
          },
        },
      },
    ]);
    expect(appendChatMessages).not.toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({
        content: "The immediate scene settles into a playable next moment.",
      }),
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "narrative",
          data: { text: "Fresh draft-backed narration replaces the old fallback." },
        },
      ]),
    );
  });

  it("does not reuse accepted narrator attempts whose final text diverges from the backend-owned draft", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The sealed lantern flares once.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-diverged",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 2,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The sealed lantern breaks instead.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: createGroundedSentenceDraftForTest("The sealed lantern flares once."),
      trace: {
        text: "",
        cleanedText: "",
        strategy: "native_json",
        primaryStrategy: "native_json",
        finishReason: "stop",
      },
    } as never);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(1);
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({
        role: "assistant",
        content: "The sealed lantern flares once.",
      }),
    ]);
    expect(appendChatMessages).not.toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({
        content: "The sealed lantern breaks instead.",
      }),
    ]);
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "narrative", data: { text: "The sealed lantern flares once." } },
      ]),
    );
  });

  it("appends current resume narration when older identical assistant text has no resume key", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The assistant line is already in chat.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The assistant line is already in chat.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "user", content: "I wait." },
      { role: "assistant", content: "The assistant line is already in chat." },
    ]);

    await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "The assistant line is already in chat.",
        metadata: {
          presentation: {
            authority: "settled_packet_presentation",
            source: "settled_turn_packet",
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
          resumeNarration: {
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
        },
      },
    ]);
    expect(mergeTurnSagaProvenanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          pendingNarrationResume: expect.objectContaining({
            assistantAppend: expect.objectContaining({
              narratorAttemptId: "attempt-existing",
              deduped: false,
            }),
          }),
        }),
      }),
    );
    expect(markTurnSagaFinalizedIfNeededMock).toHaveBeenCalled();
  });

  it("suppresses duplicate resume narration when same saga and narrator attempt key exists", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "The assistant line is already in chat.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The assistant line is already in chat.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(getChatHistory).mockReturnValue([
      { role: "user", content: "I wait." },
      {
        role: "assistant",
        content: "Different stored wording still owns this exact append key.",
        metadata: {
          resumeNarration: {
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
        },
      },
    ]);

    await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(appendChatMessages).not.toHaveBeenCalledWith(CAMPAIGN_ID, [
      expect.objectContaining({
        role: "assistant",
        content: "The assistant line is already in chat.",
      }),
    ]);
    expect(mergeTurnSagaProvenanceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: expect.objectContaining({
          pendingNarrationResume: expect.objectContaining({
            assistantAppend: expect.objectContaining({
              narratorAttemptId: "attempt-existing",
              deduped: true,
            }),
          }),
        }),
      }),
    );
    expect(markTurnSagaFinalizedIfNeededMock).toHaveBeenCalled();
  });

  it("writes saga and narrator attempt metadata on successful resume append", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "Metadata lands with the stored assistant line.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "Metadata lands with the stored assistant line.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });

    await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
      }),
    );

    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "Metadata lands with the stored assistant line.",
        metadata: {
          presentation: {
            authority: "settled_packet_presentation",
            source: "settled_turn_packet",
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
          resumeNarration: {
            sagaId: "saga-1",
            narratorAttemptId: "attempt-existing",
          },
        },
      },
    ]);
  });

  it("skips post-narration tail when resume checkpoint already completed it", async () => {
    setupMocks();
    const onPostTurn = vi.fn();
    const { settledPacket } = setupTurnSagaMocks({
      status: "narrator_rendering",
      turnId: "pending-turn",
      provenance: {
        pendingNarrationResume: {
          assistantAppend: { narratorAttemptId: "attempt-existing", completedAt: 10 },
          postNarrationTail: { narratorAttemptId: "attempt-existing", tick: 9, completedAt: 11 },
        },
      },
    });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "Tail already ran once.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "Tail already ran once.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
        onPostTurn,
      }),
    );

    expect(onPostTurn).not.toHaveBeenCalled();
    expect(incrementTick).not.toHaveBeenCalled();
    expect(events.some((event) => event.type === "finalizing_turn")).toBe(false);
    expect(events).toEqual(
      expect.arrayContaining([
        {
          type: "done",
          data: expect.objectContaining({ tick: 9, resumed: true }),
        },
      ]),
    );
    expect(markTurnSagaFinalizedIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        narratorAttemptId: "attempt-existing",
      }),
    );
  });

  it("resumes after normal tail crash without advancing tick again and keeps post-turn idempotency key", async () => {
    setupMocks();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    setPrimaryNarratorFactText(
      settledPacket.narratorPacket as ReturnType<typeof createNarratorPacketMock>,
      "Tail ran before finalization.",
    );
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "Tail ran before finalization.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(readCampaignConfig).mockReturnValue({ currentTick: 6 } as never);
    const onPostTurn = vi.fn();

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
        onPostTurn,
      }),
    );

    expect(incrementTick).not.toHaveBeenCalled();
    expect(advanceCampaignTick).not.toHaveBeenCalled();
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 6,
        sagaId: "saga-1",
        narratorAttemptId: "attempt-existing",
        idempotencyKey: "post-turn:test-campaign-123:pending-turn:saga-1:attempt-existing:6",
      }),
    );
    expect(markTurnSagaFinalizedIfNeededMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        narratorAttemptId: "attempt-existing",
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "finalizing_turn", data: { tick: 6, stage: "rollback_critical" } },
        {
          type: "done",
          data: expect.objectContaining({ tick: 6, resumed: true }),
        },
      ]),
    );
  });

  it("does not advance a resumed settled packet whose stored target tick already landed", async () => {
    setupMocks();
    const onPostTurn = vi.fn();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    const narratorPacket = settledPacket.narratorPacket as Omit<
      ReturnType<typeof createNarratorPacketMock>,
      "postNarrationTargetTick"
    > & {
      postNarrationTargetTick?: number;
    };
    narratorPacket.tick = 6;
    narratorPacket.postNarrationTargetTick = 6;
    setPrimaryNarratorFactText(narratorPacket, "The lantern remains settled.");
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The lantern remains settled.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(readCampaignConfig).mockReturnValue({ currentTick: 6 } as never);
    readWorldClockMock.mockReturnValue({
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 6,
      currentTick: 6,
      updatedAt: 0,
    });

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
        onPostTurn,
      }),
    );

    expect(incrementTick).not.toHaveBeenCalled();
    expect(advanceCampaignTick).not.toHaveBeenCalled();
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 6,
        idempotencyKey: "post-turn:test-campaign-123:pending-turn:saga-1:attempt-existing:6",
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "done", data: expect.objectContaining({ tick: 6, resumed: true }) },
      ]),
    );
  });

  it("uses move_actor travel from an older settled packet when no target tick was persisted", async () => {
    setupMocks();
    const onPostTurn = vi.fn();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    const narratorPacket = settledPacket.narratorPacket as Omit<
      ReturnType<typeof createNarratorPacketMock>,
      "postNarrationTargetTick"
    > & {
      postNarrationTargetTick?: number;
    };
    delete narratorPacket.postNarrationTargetTick;
    narratorPacket.canonicalTurnPacket = {
      actionResults: [{
        actionId: "move-action-1",
        toolName: "move_actor",
        args: { actorRef: "Hero", destinationRef: "Inspection Dock" },
        result: {
          success: true,
          result: {
            locationId: "loc-dock",
            locationName: "Inspection Dock",
            travelCost: 3,
            tickAdvance: 3,
            path: ["Hall", "Inspection Dock"],
          },
        },
      }],
    };
    setPrimaryNarratorFactText(narratorPacket, "The hero reaches the inspection dock.");
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The hero reaches the inspection dock.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(advanceCampaignTick).mockReturnValue(8);

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
        onPostTurn,
      }),
    );

    expect(incrementTick).not.toHaveBeenCalled();
    expect(advanceCampaignTick).toHaveBeenCalledWith(CAMPAIGN_ID, 3);
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 8,
        toolCalls: [
          expect.objectContaining({ tool: "move_actor" }),
        ],
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "done", data: expect.objectContaining({ tick: 8, resumed: true }) },
      ]),
    );
  });

  it("does not double-advance an older settled packet after the fallback target already landed", async () => {
    setupMocks();
    const onPostTurn = vi.fn();
    const { settledPacket } = setupTurnSagaMocks({ status: "narrator_rendering", turnId: "pending-turn" });
    const narratorPacket = settledPacket.narratorPacket as Omit<
      ReturnType<typeof createNarratorPacketMock>,
      "postNarrationTargetTick"
    > & {
      postNarrationTargetTick?: number;
    };
    delete narratorPacket.postNarrationTargetTick;
    narratorPacket.tick = 5;
    narratorPacket.canonicalTurnPacket = {
      actionResults: [{
        actionId: "move-action-1",
        toolName: "move_actor",
        args: { actorRef: "Hero", destinationRef: "Inspection Dock" },
        result: {
          success: true,
          result: {
            locationId: "loc-dock",
            locationName: "Inspection Dock",
            travelCost: 3,
            tickAdvance: 3,
            path: ["Hall", "Inspection Dock"],
          },
        },
      }],
    };
    setPrimaryNarratorFactText(narratorPacket, "The hero reaches the inspection dock.");
    findLatestSuccessfulNarratorAttemptMock.mockReturnValue({
      id: "attempt-existing",
      campaignId: CAMPAIGN_ID,
      sagaId: "saga-1",
      settledTurnPacketId: "packet-1",
      turnId: "pending-turn",
      attemptIndex: 1,
      status: "succeeded",
      groundingResult: acceptedGroundedNarrationResult(),
      finalText: "The hero reaches the inspection dock.",
      failureReason: null,
      createdAt: 10,
      updatedAt: 10,
    });
    vi.mocked(readCampaignConfig).mockReturnValue({ currentTick: 8 } as never);
    readWorldClockMock.mockReturnValue({
      campaignId: CAMPAIGN_ID,
      worldVersion: 9,
      worldTimeMinutes: 8,
      currentTick: 8,
      updatedAt: 0,
    });

    const events = await collectEvents(
      resumePendingTurnNarration({
        campaignId: CAMPAIGN_ID,
        turnId: "pending-turn",
        storytellerProvider: createTestOptions().storytellerProvider,
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 2000,
        onPostTurn,
      }),
    );

    expect(incrementTick).not.toHaveBeenCalled();
    expect(advanceCampaignTick).not.toHaveBeenCalled();
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 8,
        idempotencyKey: "post-turn:test-campaign-123:pending-turn:saga-1:attempt-existing:8",
      }),
    );
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "done", data: expect.objectContaining({ tick: 8, resumed: true }) },
      ]),
    );
  });

  it("keeps tick advance and onPostTurn after guarded visible narration", async () => {
    setupMocks();
    setupScenePlanMocks();
    const onPostTurn = vi.fn();

    const events = await collectEvents(processTurn(createTestOptions({ onPostTurn })));
    const narrativeIndex = events.findIndex((event) => event.type === "narrative");
    const finalizingIndex = events.findIndex((event) => event.type === "finalizing_turn");
    const doneIndex = events.findIndex((event) => event.type === "done");

    expect(narrativeIndex).toBeGreaterThan(-1);
    expect(finalizingIndex).toBeGreaterThan(narrativeIndex);
    expect(doneIndex).toBeGreaterThan(finalizingIndex);
    expect(vi.mocked(runVisibleNarrationWithPacketGuard).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(incrementTick).mock.invocationCallOrder[0]!,
    );
    expect(onPostTurn).toHaveBeenCalled();
  });

  it("advances passive finalization from the world clock when tool commits moved it ahead of campaign tick", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(readCampaignConfig).mockReturnValue({ currentTick: 18 } as never);
    readWorldClockMock.mockReturnValue({
      campaignId: CAMPAIGN_ID,
      worldVersion: 7,
      worldTimeMinutes: 21,
      currentTick: 21,
      updatedAt: 0,
    });
    vi.mocked(advanceCampaignTick).mockReturnValue(22);
    const onPostTurn = vi.fn();

    const events = await collectEvents(processTurn(createTestOptions({ onPostTurn })));

    expect(advanceCampaignTick).toHaveBeenCalledWith(CAMPAIGN_ID, 4);
    expect(incrementTick).not.toHaveBeenCalled();
    expect(syncWorldClockTurnBoundaryMock).toHaveBeenCalledWith({
      campaignId: CAMPAIGN_ID,
      currentTick: 22,
    });
    expect(events).toEqual(
      expect.arrayContaining([
        { type: "done", data: expect.objectContaining({ tick: 22 }) },
      ]),
    );
    expect(onPostTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        tick: 22,
      }),
    );
  });

  it("isolates the legacy path when SCENE_PLAN_ENABLED=false", async () => {
    process.env.SCENE_PLAN_ENABLED = "false";
    setupMocks();
    setupScenePlanMocks();

    await collectEvents(processTurn(createTestOptions()));

    expect(buildSceneFrame).toHaveBeenCalledTimes(1);
    expect(runScenePlanner).not.toHaveBeenCalled();
    expect(validateScenePlan).not.toHaveBeenCalled();
    expect(executeScenePlan).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
    expect(runHiddenAdjudicationPlan).toHaveBeenCalled();
  });

  it("fails closed outside tests when SCENE_PLAN_ENABLED=false would select legacy runtime", async () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    process.env.SCENE_PLAN_ENABLED = "false";
    setupMocks();
    setupScenePlanMocks();

    try {
      await expect(collectEvents(processTurn(createTestOptions()))).rejects.toThrow(
        "SCENE_PLAN_ENABLED=false legacy player-turn path is disabled",
      );
    } finally {
      process.env.NODE_ENV = previousNodeEnv;
    }

    expect(buildSceneFrame).not.toHaveBeenCalled();
    expect(runHiddenAdjudicationPlan).not.toHaveBeenCalled();
  });
});

describe("processOpeningScene", () => {
  beforeEach(() => {
    delete process.env.EXPOSE_LLM_REASONING;
    vi.clearAllMocks();
    logEventMock.mockClear();
    logInfoMock.mockClear();
    logWarnMock.mockClear();
    logErrorMock.mockClear();
    setupTurnSagaMocks();
    vi.mocked(safeGenerateObject).mockReset();
    vi.mocked(safeGenerateObject).mockImplementation(async (opts?: { prompt?: unknown }) => {
      const prompt = String(opts?.prompt ?? "");
      if (
        prompt.includes("Final narration prompt")
        || prompt.includes("[FINAL NARRATION TASK]")
        || prompt.includes("Opening visible prompt")
      ) {
        return {
          object: {
            version: "grounded-sentence-draft.v2",
            sentences: [{
              factRefs: ["e1.s1"],
              evidenceRefs: ["e1"],
            }],
          },
          trace: {
            text: "",
            cleanedText: "",
            strategy: "native_json",
            primaryStrategy: "native_json",
            finishReason: "stop",
            response: { modelId: "mock-model" },
          },
        } as never;
      }
      return { object: { isMovement: false, destination: null }, trace: {} } as never;
    });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
      const generated = await args.generateNarration({ attempt: 1, guardAddendum: null });
      const { text, draft } = normalizeGeneratedNarrationForTest(generated);
      return {
        text,
        draft,
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });
  });

  it("uses explicit storyteller reasoning bypass for opening narration", async () => {
    const playerRow = createOpeningPlayerRow();
    (getDb as Mock).mockReturnValue(
      createEntityLookupDb({
        playerRow,
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A welcoming square with low conversation.",
            tags: '["urban"]',
            connectedTo: "[]",
          },
        ],
      }),
    );
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (assembleFinalNarrationPrompt as Mock).mockResolvedValue({
      system: "Opening visible system",
      prompt: "Opening visible prompt",
      assembledBase: { formatted: "Opening prompt", sections: [], totalTokens: 42, budgetUsed: 4 },
    });
    (generateText as Mock).mockResolvedValue({
      text: "Lanternlight spills into the market.",
      reasoningText: "Opening-scene hidden reasoning stays private by default.",
    });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementationOnce(async (args) => {
      await args.generateNarration({ attempt: 1, guardAddendum: null });
      return {
        text: "Lanternlight spills into the market.",
        draft: createNarrationDraftForTest("Lanternlight spills into the market."),
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });

    const events = await collectEvents(
      processOpeningScene({
        campaignId: CAMPAIGN_ID,
        storytellerProvider: {
          id: "test",
          name: "Test",
          baseUrl: "http://localhost",
          apiKey: "key",
          model: "test-model",
        },
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 1600,
      }),
    );

    expect(mockedCreateModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "test", name: "Test", model: "test-model" }),
      { role: "storyteller", reasoningMode: "bypass" },
    );
    expect(events).toEqual(
      expect.arrayContaining([{ type: "narrative", data: { text: "Lanternlight spills into the market." } }]),
    );
    expect(appendChatMessages).toHaveBeenCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "Lanternlight spills into the market.",
        metadata: {
          presentation: {
            authority: "settled_packet_presentation",
            source: "opening_scene",
            sagaId: "saga-1",
            narratorAttemptId: "attempt-1",
          },
          resumeNarration: {
            sagaId: "saga-1",
            narratorAttemptId: "attempt-1",
          },
        },
      },
    ]);
    expect(persistSettledTurnPacketMock).toHaveBeenCalled();
    expect(recordNarratorAttemptMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        settledTurnPacketId: "packet-1",
        status: "started",
      }),
    );
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "attempt-1",
        status: "succeeded",
        finalText: "Lanternlight spills into the market.",
      }),
    );
    expect(markTurnSagaFinalizedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sagaId: "saga-1",
        narratorAttemptId: "attempt-1",
      }),
    );
    expect(events.some((event) => event.type === "reasoning")).toBe(false);
  });

  it("does not mark opening complete when visible narration is empty", async () => {
    const playerRow = createOpeningPlayerRow();
    (getDb as Mock).mockReturnValue(
      createEntityLookupDb({
        playerRow,
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A welcoming square with low conversation.",
            tags: '["urban"]',
            connectedTo: "[]",
          },
        ],
      }),
    );
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (assembleFinalNarrationPrompt as Mock).mockResolvedValue({
      system: "Opening visible system",
      prompt: "Opening visible prompt",
      assembledBase: { formatted: "Opening prompt", sections: [], totalTokens: 42, budgetUsed: 4 },
    });
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementationOnce(async (args) => {
      await args.generateNarration({ attempt: 1, guardAddendum: null });
      return {
        text: "   ",
        draft: createNarrationDraftForTest("   "),
        attempts: 1,
        retried: false,
        validation: { ok: true, violations: [] },
        guardAddendum: null,
      };
    });

    await expect(
      collectEvents(
        processOpeningScene({
          campaignId: CAMPAIGN_ID,
          storytellerProvider: {
            id: "test",
            name: "Test",
            baseUrl: "http://localhost",
            apiKey: "key",
            model: "test-model",
          },
          storytellerTemperature: 0.8,
          storytellerMaxTokens: 1600,
        }),
      ),
    ).rejects.toThrow("Pending settled turn narration");

    expect(appendChatMessages).not.toHaveBeenCalledWith(CAMPAIGN_ID, [
      { role: "assistant", content: "   " },
    ]);
    expect(updateNarratorAttemptOutcomeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "attempt-1",
        status: "failed",
      }),
    );
    expect(markTurnSagaFinalizedMock).not.toHaveBeenCalled();
  });

  it("runs world-brain before opening visible narration and hands it through scene assembly", async () => {
    const playerRow = createOpeningPlayerRow();
    (getDb as Mock).mockReturnValue(
      createEntityLookupDb({
        playerRow,
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A welcoming square with low conversation.",
            tags: '["urban"]',
            connectedTo: "[]",
          },
        ],
      }),
    );
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (assembleFinalNarrationPrompt as Mock).mockResolvedValue({
      system: "Opening visible system",
      prompt: "Opening visible prompt",
      assembledBase: { formatted: "Opening prompt", sections: [], totalTokens: 42, budgetUsed: 4 },
    });
    (generateText as Mock).mockResolvedValue({ text: "Lanternlight spills into the market." });

    await collectEvents(
      processOpeningScene({
        campaignId: CAMPAIGN_ID,
        storytellerProvider: {
          id: "test",
          name: "Test",
          baseUrl: "http://localhost",
          apiKey: "key",
          model: "test-model",
        },
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 1600,
      }),
    );

    expect(runWorldBrainSceneDirection).toHaveBeenCalledWith(
      expect.objectContaining({
        seed: expect.objectContaining({
          runSource: "opening-scene",
        }),
      }),
    );

    const finalArgs = (assembleFinalNarrationPrompt as Mock).mock.calls.at(-1)?.[0] as
      | { sceneAssembly?: { sceneDirection?: unknown; playerPerceivableSceneDirection?: unknown } }
      | undefined;
    expect(finalArgs?.sceneAssembly?.sceneDirection).toEqual(expect.any(Object));
    expect(finalArgs?.sceneAssembly?.playerPerceivableSceneDirection).toEqual(expect.any(Object));
  });

  it("builds opening narrator packets from player-visible world-brain direction", async () => {
    const playerRow = createOpeningPlayerRow();
    const rawOpeningDirection = {
      situationSummary: "Hidden Watcher privately frames the opening ambush.",
      sceneQuestion: "Does the public pressure reveal the private ambush?",
      focalActorNames: ["Hero", "Goblin Raider", "Hidden Watcher"],
      backgroundActorNames: [],
      presenceReasons: [
        { actorName: "Hero", reason: "The player is the public pivot.", perceivable: true },
        { actorName: "Goblin Raider", reason: "The raider is visible in the crowd.", perceivable: true },
        {
          actorName: "Hidden Watcher",
          reason: "private ambush signal waits overhead",
          perceivable: false,
        },
      ],
      causalBeats: [
        { summary: "private ambush signal waits overhead", perceivable: false },
        { summary: "Boots scrape close enough to hear.", perceivable: true },
      ],
      narrationGuardrails: ["Do not reveal Hidden Watcher", "Keep boots audible."],
    };
    const visibleOpeningDirection = {
      ...rawOpeningDirection,
      situationSummary: "Hero faces a visible raider while something concealed presses nearby.",
      sceneQuestion: "Does Hero answer the visible challenge?",
      focalActorNames: ["Hero", "Goblin Raider"],
      presenceReasons: rawOpeningDirection.presenceReasons.filter((reason) => reason.perceivable),
      causalBeats: rawOpeningDirection.causalBeats.filter((beat) => beat.perceivable),
      narrationGuardrails: ["Keep boots audible."],
    };
    vi.mocked(runWorldBrainSceneDirection).mockResolvedValueOnce(rawOpeningDirection);
    vi.mocked(assembleAuthoritativeScene).mockImplementation((args?: { sceneDirection?: unknown }) => ({
      openingScene: true,
      openingState: null,
      currentScene: {
        id: "loc-1",
        name: "Town Square",
        description: "A crowded square with one clear confrontation.",
        tags: ["urban"],
      },
      presentNpcNames: ["Goblin Raider"],
      sceneDirection: args?.sceneDirection ? rawOpeningDirection : null,
      playerPerceivableSceneDirection: args?.sceneDirection ? visibleOpeningDirection : null,
      awareness: {
        contract: {
          clear: "Full present-scene actor context. Identity and direct interaction are justified.",
          hint: "Bounded indirect presence signal only. No identity leakage in player-facing surfaces.",
          none: "Outside encounter scope for this consumer. Omit from player-facing prompt surfaces.",
        },
        byNpcName: {
          "Goblin Raider": "clear",
          "Hidden Watcher": "hint",
        },
        clearNpcNames: ["Goblin Raider"],
        hintSignals: ["Something concealed is nearby."],
      },
      recentContext: [],
      sceneEffects: [],
      playerPerceivableConsequences: [
        "Hero can hear boots scraping nearby.",
        "Something concealed is nearby.",
      ],
    }));
    (getDb as Mock).mockReturnValue(
      createEntityLookupDb({
        playerRow,
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A crowded square with one clear confrontation.",
            tags: '["urban"]',
            connectedTo: "[]",
          },
        ],
      }),
    );
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    (assembleFinalNarrationPrompt as Mock).mockResolvedValue({
      system: "Opening visible system",
      prompt: "Opening visible prompt",
      assembledBase: { formatted: "Opening prompt", sections: [], totalTokens: 42, budgetUsed: 4 },
    });
    (generateText as Mock).mockResolvedValue({ text: "Boots scrape near the square." });

    await collectEvents(
      processOpeningScene({
        campaignId: CAMPAIGN_ID,
        storytellerProvider: {
          id: "test",
          name: "Test",
          baseUrl: "http://localhost",
          apiKey: "key",
          model: "test-model",
        },
        storytellerTemperature: 0.8,
        storytellerMaxTokens: 1600,
      }),
    );

    const finalArgs = (assembleFinalNarrationPrompt as Mock).mock.calls.at(-1)?.[0] as
      | { narratorPacket?: NarratorPacket }
      | undefined;
    const packet = finalArgs?.narratorPacket;
    expect(packet?.forbiddenActorNames).toContain("Hidden Watcher");
    expect(packet?.forbiddenPrivateTerms).toEqual(
      expect.arrayContaining(["Hidden Watcher", "private ambush signal waits overhead"]),
    );
    const visibleOpeningPayload = JSON.stringify({
      anchor: packet?.anchorEvent.summary,
      effects: packet?.perceivableEffects.map((effect) => effect.summary),
      hints: packet?.hintSignals,
      guardrails: packet?.guardrails,
      evidence: packet?.evidenceLedger?.map((entry) => entry.summary),
      visibleActors: packet?.visibleActors.map((actor) => actor.label),
      sourceSummaries: packet?.sourceLinkedSummaries?.map((entry) => entry.summary),
    });
    expect(visibleOpeningPayload).toContain("Hero faces a visible raider");
    expect(visibleOpeningPayload).toContain("Something concealed is nearby.");
    expect(visibleOpeningPayload).not.toContain("Hidden Watcher");
    expect(visibleOpeningPayload).not.toContain("private ambush signal");
  });

  it("fails explicitly when opening world-brain returns no focal actors", async () => {
    const playerRow = createOpeningPlayerRow();
    (getDb as Mock).mockReturnValue(
      createEntityLookupDb({
        playerRow,
        locationRows: [
          {
            id: "loc-1",
            campaignId: CAMPAIGN_ID,
            name: "Town Square",
            description: "A welcoming square with low conversation.",
            tags: '["urban"]',
            connectedTo: "[]",
          },
        ],
      }),
    );
    (readCampaignConfig as Mock).mockReturnValue({ currentTick: 5 });
    vi.mocked(runWorldBrainSceneDirection).mockResolvedValueOnce({
      situationSummary: "Nobody has clear footing in the opening beat.",
      sceneQuestion: "Who moves first?",
      focalActorNames: [],
      backgroundActorNames: [],
      presenceReasons: [],
      causalBeats: [],
      narrationGuardrails: [],
    });

    await expect(
      collectEvents(
        processOpeningScene({
          campaignId: CAMPAIGN_ID,
          storytellerProvider: {
            id: "test",
            name: "Test",
            baseUrl: "http://localhost",
            apiKey: "key",
            model: "test-model",
          },
          storytellerTemperature: 0.8,
          storytellerMaxTokens: 1600,
        }),
      ),
    ).rejects.toThrow("Opening world-brain pass returned no valid focal actors.");
  });
});
