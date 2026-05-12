import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  appendChatMessagesMock,
  advanceCampaignTickMock,
  callOracleMock,
  generateTextMock,
  getDbMock,
  incrementTickMock,
  readCampaignConfigMock,
  resolveDueWorldWorkForScopeMock,
  runGmReadMock,
  runVisibleNarrationWithPacketGuardMock,
  safeGenerateObjectMock,
  assertNoPendingNarrationBeforeNewTurnMock,
  claimTurnSagaWorkerMock,
  createTurnSagaMock,
  getTurnSagaMock,
  markTurnSagaFinalizedMock,
  persistSettledTurnPacketMock,
  recordNarratorAttemptMock,
  releaseTurnSagaWorkerMock,
  transitionTurnSagaStatusMock,
  updateNarratorAttemptOutcomeMock,
} = vi.hoisted(() => ({
  appendChatMessagesMock: vi.fn(),
  advanceCampaignTickMock: vi.fn(),
  callOracleMock: vi.fn(),
  generateTextMock: vi.fn(),
  getDbMock: vi.fn(),
  incrementTickMock: vi.fn(),
  readCampaignConfigMock: vi.fn(),
  resolveDueWorldWorkForScopeMock: vi.fn(),
  runGmReadMock: vi.fn(),
  runVisibleNarrationWithPacketGuardMock: vi.fn(),
  safeGenerateObjectMock: vi.fn(),
  assertNoPendingNarrationBeforeNewTurnMock: vi.fn(),
  claimTurnSagaWorkerMock: vi.fn(),
  createTurnSagaMock: vi.fn(),
  getTurnSagaMock: vi.fn(),
  markTurnSagaFinalizedMock: vi.fn(),
  persistSettledTurnPacketMock: vi.fn(),
  recordNarratorAttemptMock: vi.fn(),
  releaseTurnSagaWorkerMock: vi.fn(),
  transitionTurnSagaStatusMock: vi.fn(),
  updateNarratorAttemptOutcomeMock: vi.fn(),
}));

vi.mock("ai", () => ({
  generateText: generateTextMock,
  tool: vi.fn((definition: unknown) => definition),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: safeGenerateObjectMock,
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => "mock-model"),
}));

vi.mock("../../campaign/index.js", () => ({
  appendChatMessages: appendChatMessagesMock,
  advanceCampaignTick: advanceCampaignTickMock,
  getChatHistory: vi.fn(() => []),
  incrementTick: incrementTickMock,
  readCampaignConfig: readCampaignConfigMock,
}));

vi.mock("../../db/index.js", () => ({
  getDb: getDbMock,
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => fn()),
}));

vi.mock("../oracle.js", () => ({
  callOracle: callOracleMock,
}));

vi.mock("../due-world-work.js", () => ({
  resolveDueWorldWorkForScope: resolveDueWorldWorkForScopeMock,
}));

vi.mock("../prompt-assembler.js", () => ({
  assembleJudgeAdjudicationPrompt: vi.fn(async () => ({
    system: "judge system",
    messages: [{ role: "user", content: "act" }],
    assembledBase: { formatted: "", sections: [], totalTokens: 0, budgetUsed: 0 },
  })),
  assembleFinalNarrationPrompt: vi.fn(async () => ({
    system: "final system",
    prompt: "final prompt",
    assembledBase: { formatted: "", sections: [], totalTokens: 0, budgetUsed: 0 },
  })),
}));

vi.mock("../target-context.js", () => ({
  resolveActionTargetContext: vi.fn(async () => ({
    targetTags: [],
    targetLabel: null,
    targetType: "none",
    fallbackReason: "test",
    source: "test",
  })),
}));

vi.mock("../world-brain.js", () => ({
  runWorldBrainSceneDirection: vi.fn(async () => ({
    situationSummary: "The scene holds.",
    sceneQuestion: "What changes now?",
    focalActorNames: ["Hero"],
    backgroundActorNames: [],
    presenceReasons: [],
    causalBeats: [],
    narrationGuardrails: [],
  })),
}));

vi.mock("../scene-assembly.js", () => ({
  assembleAuthoritativeScene: vi.fn(() => ({
    openingScene: false,
    openingState: null,
    currentScene: null,
    presentNpcNames: [],
    awareness: {
      hintSignals: [],
      clearNpcNames: [],
      byNpcName: {},
      contract: { clear: "", hint: "", none: "" },
    },
    recentContext: [],
    sceneEffects: [],
    playerPerceivableConsequences: [],
  })),
  buildSceneDirectionSeed: vi.fn(() => ({})),
  collapseRepeatedNarrationBlocks: vi.fn((text: string) => text.trim()),
}));

vi.mock("../hidden-adjudication.js", () => ({
  runHiddenAdjudicationPlan: vi.fn(async () => ({
    rationale: "No hidden mutation.",
    actions: [],
  })),
  executeAdjudicationPlan: vi.fn(async () => ({
    toolCallResults: [],
    emittedEvents: [],
    quickActionsEmitted: false,
    successfulTravel: null,
  })),
}));

vi.mock("../scene-frame.js", () => ({
  buildSceneFrame: vi.fn(async () => createSceneFrame()),
  buildSceneFrameCombatEnvelopeForConcreteTarget: vi.fn(() => null),
  buildSceneFrameOracleContextForCandidate: vi.fn(() => null),
}));

vi.mock("../gm-turn-read.js", () => ({
  runGmRead: runGmReadMock,
}));

vi.mock("../gm-tool-loop.js", () => ({
  runGmToolLoop: vi.fn(),
}));

vi.mock("../actor-tools.js", () => ({
  runRequiredActorDecisionPass: vi.fn(async () => ({
    schedule: { decisions: [] },
    decisions: [],
    actionResults: [],
    parallelFrameRetrievalTrace: [],
    parallelPrepTrace: [],
  })),
}));

vi.mock("../narrator-packet.js", () => ({
  buildNarratorPacket: vi.fn(() => ({
    campaignId: "campaign-empty-narration",
    tick: 5,
    playerAction: "I wait.",
    oracleOutcome: null,
    anchorEvent: null,
    perceivableEvents: [],
    perceivableResponses: [],
    perceivableEffects: [],
    visibleActors: [{ id: "player-1", label: "Hero", type: "player" }],
    hintSignals: [],
    guardrails: [],
    controlReturnReason: "Return control.",
    allowedVisibleActorNames: ["Hero"],
    forbiddenActorNames: [],
    forbiddenFactMarkers: [],
    forbiddenPrivateTerms: [],
    canonicalTurnPacket: {},
  })),
  summarizeRuntimeToolResultForNarrator: vi.fn(() => "A local result settles."),
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
    runVisibleNarrationWithPacketGuard: runVisibleNarrationWithPacketGuardMock,
    VisibleNarrationPacketGuardError,
  };
});

vi.mock("../living-world-authority.js", () => ({
  readWorldClock: vi.fn(() => ({
    campaignId: "campaign-empty-narration",
    worldVersion: 0,
    worldTimeMinutes: 0,
    currentTick: 5,
    updatedAt: 0,
  })),
  syncWorldClockTurnBoundary: vi.fn(),
}));

vi.mock("../turn-saga.js", () => ({
  assertNoPendingNarrationBeforeNewTurn: assertNoPendingNarrationBeforeNewTurnMock,
  claimTurnSagaWorker: claimTurnSagaWorkerMock,
  createTurnSaga: createTurnSagaMock,
  findLatestSuccessfulNarratorAttempt: vi.fn(() => null),
  getSettledTurnPacket: vi.fn(),
  getTurnSaga: getTurnSagaMock,
  heartbeatTurnSagaWorker: vi.fn(),
  markTurnSagaFinalized: markTurnSagaFinalizedMock,
  markTurnSagaFinalizedIfNeeded: vi.fn(),
  mergeTurnSagaProvenance: vi.fn(),
  PendingSettledTurnNarrationError: class PendingSettledTurnNarrationError extends Error {
    constructor(
      public readonly pendingSaga: MockTurnSagaRecord,
      public readonly causeError?: unknown,
    ) {
      super(`Campaign ${pendingSaga.campaignId} has pending narration for turn ${pendingSaga.turnId}.`);
      this.name = "PendingSettledTurnNarrationError";
    }
  },
  PENDING_NARRATION_STATUSES: [
    "resolved_pending_narration",
    "narrator_rendering",
    "narrator_repairing",
  ],
  persistOracleDecision: vi.fn(() => ({ id: "oracle-empty-narration" })),
  persistSettledTurnPacket: persistSettledTurnPacketMock,
  recordNarratorAttempt: recordNarratorAttemptMock,
  releaseTurnSagaWorker: releaseTurnSagaWorkerMock,
  transitionTurnSagaStatus: transitionTurnSagaStatusMock,
  updateNarratorAttemptOutcome: updateNarratorAttemptOutcomeMock,
}));

vi.mock("../world-forecast.js", () => ({
  buildScopedForecastExcerpt: vi.fn(() => ({
    entries: [],
    forbiddenPrivateTerms: [],
    baseTick: 5,
  })),
  loadWorldTrajectoryForecast: vi.fn(() => null),
  shouldRefreshWorldTrajectoryForecast: vi.fn(() => false),
  stageWorldTrajectoryForecast: vi.fn(() => null),
  writeStagedWorldTrajectoryForecast: vi.fn(),
}));

vi.mock("../world-forecast-builder.js", () => ({
  runWorldForecastBuilder: vi.fn(),
}));

vi.mock("../transient-scene-lifecycle.js", () => ({
  cleanupTransientSceneObjects: vi.fn(),
}));

import { processTurn, type TurnEvent } from "../turn-processor.js";

const provider = {
  id: "test",
  name: "Test",
  baseUrl: "http://localhost",
  apiKey: "key",
  model: "test-model",
};

function createOptions(overrides = {}) {
  return {
    campaignId: "campaign-empty-narration",
    playerAction: "I wait and watch what changes.",
    intent: "Observe changes",
    method: "Wait",
    judgeProvider: provider,
    storytellerProvider: provider,
    storytellerTemperature: 0.2,
    storytellerMaxTokens: 512,
    ...overrides,
  };
}

function createQuery(getValue: unknown = undefined) {
  const query = {
    from: vi.fn(() => query),
    where: vi.fn(() => query),
    get: vi.fn(() => getValue),
    all: vi.fn(() => []),
  };
  return query;
}

function createDb() {
  return {
    select: vi.fn(() => createQuery()),
  };
}

function createSceneFrame() {
  return {
    campaignId: "campaign-empty-narration",
    tick: 5,
    playerActorId: "player-1",
    currentLocationId: null,
    currentSceneScopeId: null,
    playerAction: "I wait and watch what changes.",
    roster: {
      active: [
        {
          id: "player-1",
          actorId: "player-1",
          type: "player",
          label: "Hero",
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
    allowedTools: [],
    oracleContext: {
      targetLabel: null,
      targetType: "none",
      targetTags: [],
      source: "test",
      fallbackReason: "No deterministic target.",
    },
    combatEnvelope: null,
    oracle: null,
  };
}

async function collectEventsUntilError(generator: AsyncGenerator<TurnEvent>) {
  const events: TurnEvent[] = [];
  let thrown: unknown;

  try {
    for await (const event of generator) {
      events.push(event);
    }
  } catch (error) {
    thrown = error;
  }

  return { events, thrown };
}

function errorMessages(error: unknown): string[] {
  const messages: string[] = [];
  let current = error;
  while (current && typeof current === "object") {
    const message = current instanceof Error
      ? current.message
      : String((current as { message?: unknown }).message ?? "");
    if (message) {
      messages.push(message);
    }
    current = (current as { causeError?: unknown; cause?: unknown }).causeError
      ?? (current as { cause?: unknown }).cause;
  }
  return messages;
}

type MockTurnSagaRecord = {
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

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.EXPOSE_LLM_REASONING;
  delete process.env.SCENE_PLAN_ENABLED;
  getDbMock.mockReturnValue(createDb());
  readCampaignConfigMock.mockReturnValue({ currentTick: 5 });
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
  });
  incrementTickMock.mockReturnValue(6);
  advanceCampaignTickMock.mockReturnValue(6);
  let saga: MockTurnSagaRecord = {
    id: "saga-empty-narration",
    campaignId: "campaign-empty-narration",
    turnId: "turn-empty-narration",
    playerId: null,
    actionId: null,
    actionText: "I wait and watch what changes.",
    sourceAction: {},
    status: "created",
    statusReason: null,
    statusUpdatedAt: 0,
    activeLockToken: null,
    activeWorkerId: null,
    activeStartedAt: null,
    requiresNarration: false,
    baseWorldVersion: 0,
    resultWorldVersion: null,
    oracleDecisionId: null,
    settledTurnPacketId: null,
    latestNarratorAttemptId: null,
    provenance: {},
    createdAt: 0,
    updatedAt: 0,
  };
  assertNoPendingNarrationBeforeNewTurnMock.mockImplementation(() => undefined);
  claimTurnSagaWorkerMock.mockImplementation((input: { workerId: string; lockToken?: string }) => {
    const lockToken = input.lockToken ?? "lock-empty-narration";
    saga = {
      ...saga,
      activeLockToken: lockToken,
      activeWorkerId: input.workerId,
      activeStartedAt: 1,
    };
    return { saga, lockToken, workerId: input.workerId };
  });
  releaseTurnSagaWorkerMock.mockImplementation(() => {
    saga = {
      ...saga,
      activeLockToken: null,
      activeWorkerId: null,
      activeStartedAt: null,
    };
    return saga;
  });
  createTurnSagaMock.mockImplementation(() => saga);
  transitionTurnSagaStatusMock.mockImplementation((input: { toStatus: string }) => {
    saga = { ...saga, status: input.toStatus };
    return saga;
  });
  persistSettledTurnPacketMock.mockImplementation(() => {
    saga = {
      ...saga,
      status: "resolved_pending_narration",
      requiresNarration: true,
      settledTurnPacketId: "packet-empty-narration",
      resultWorldVersion: 0,
    };
    return {
      id: "packet-empty-narration",
      campaignId: "campaign-empty-narration",
      sagaId: saga.id,
      turnId: saga.turnId,
      oracleDecisionId: null,
      canonicalTurnPacket: {},
      narratorPacket: {},
      sourceRefs: [],
      acceptedToolResultRefs: [],
      acceptedActorResultRefs: [],
      dueWorldRefs: [],
      requiresNarration: true,
      baseWorldVersion: 0,
      resultWorldVersion: 0,
      createdAt: 0,
      updatedAt: 0,
    };
  });
  getTurnSagaMock.mockImplementation(() => saga);
  recordNarratorAttemptMock.mockImplementation((input: { status: string }) => {
    const attempt = {
      id: `attempt-empty-${recordNarratorAttemptMock.mock.calls.length + 1}`,
      sagaId: saga.id,
      status: input.status,
    };
    saga = { ...saga, latestNarratorAttemptId: attempt.id };
    return attempt;
  });
  updateNarratorAttemptOutcomeMock.mockImplementation((input: { id: string; status: string }) => {
    const attempt = {
      id: input.id,
      sagaId: saga.id,
      status: input.status,
    };
    saga = { ...saga, latestNarratorAttemptId: attempt.id };
    return attempt;
  });
  markTurnSagaFinalizedMock.mockImplementation(() => {
    saga = { ...saga, status: "finalized" };
    return saga;
  });
  callOracleMock.mockResolvedValue({
    chance: 50,
    roll: 50,
    outcome: "weak_hit",
    reasoning: "The action can resolve locally.",
  });
  safeGenerateObjectMock.mockResolvedValue({
    object: { isMovement: false, destination: null },
    trace: {},
  });
  runGmReadMock.mockResolvedValue({
    version: "gm-read.v1",
    situationSummary: "The player watches the scene.",
    sceneQuestion: "What visible change answers the action?",
    focalActorRefs: ["player-1"],
    backgroundActorRefs: [],
    actionInterpretation: {
      intent: "Observe changes",
      method: "Wait",
      targetRefs: [],
    },
    path: "direct",
    directResolutionNotes: "Resolve the observation from visible context.",
    rationale: "No mutation is required.",
    evidenceRefs: ["player-1"],
    narrationGuardrails: ["Keep it visible."],
  });
});

describe("processTurn empty final narration", () => {
  it("does not finalize the scene-plan path when packet-guarded narration is blank", async () => {
    const onPostTurn = vi.fn();
    runVisibleNarrationWithPacketGuardMock.mockResolvedValue({
      text: "   ",
      draft: { prose: "   ", claims: [], claimSpans: [] },
      attempts: 2,
      retried: true,
      validation: { ok: true, violations: [] },
      guardAddendum: null,
    });

    const { events, thrown } = await collectEventsUntilError(
      processTurn(createOptions({ onPostTurn })),
    );

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).name).toBe("PendingSettledTurnNarrationError");
    expect(errorMessages(thrown).some((message) =>
      message.includes("Final visible narration was empty")
    )).toBe(true);
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "finalizing_turn")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(appendChatMessagesMock).toHaveBeenCalledWith("campaign-empty-narration", [
      { role: "user", content: "I wait and watch what changes." },
    ]);
    expect(appendChatMessagesMock).not.toHaveBeenCalledWith(
      "campaign-empty-narration",
      [{ role: "assistant", content: "   " }],
    );
    expect(incrementTickMock).not.toHaveBeenCalled();
    expect(onPostTurn).not.toHaveBeenCalled();
  });

  it("does not finalize the legacy path when final narration stays blank after retry", async () => {
    const onPostTurn = vi.fn();
    process.env.SCENE_PLAN_ENABLED = "false";
    generateTextMock
      .mockResolvedValueOnce({
        text: "",
        reasoningText: undefined,
      })
      .mockResolvedValueOnce({
        text: "   ",
        reasoningText: undefined,
      });

    const { events, thrown } = await collectEventsUntilError(
      processTurn(createOptions({ onPostTurn })),
    );

    expect(generateTextMock).toHaveBeenCalledTimes(2);
    expect(thrown).toBeInstanceOf(Error);
    expect(String((thrown as Error).message)).toContain("Final visible narration was empty");
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "finalizing_turn")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
    expect(appendChatMessagesMock).toHaveBeenCalledWith("campaign-empty-narration", [
      { role: "user", content: "I wait and watch what changes." },
    ]);
    expect(appendChatMessagesMock).not.toHaveBeenCalledWith(
      "campaign-empty-narration",
      [{ role: "assistant", content: "   " }],
    );
    expect(incrementTickMock).not.toHaveBeenCalled();
    expect(onPostTurn).not.toHaveBeenCalled();
  });
});
