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

vi.mock("../visible-narration-output-guard.js", () => ({
  runVisibleNarrationWithPacketGuard: runVisibleNarrationWithPacketGuardMock,
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
  });
  incrementTickMock.mockReturnValue(6);
  advanceCampaignTickMock.mockReturnValue(6);
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
      attempts: 2,
      retried: true,
      validation: { ok: true, violations: [] },
      guardAddendum: null,
    });

    const { events, thrown } = await collectEventsUntilError(
      processTurn(createOptions({ onPostTurn })),
    );

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

  it("does not finalize the legacy path when final narration stays blank after retry", async () => {
    const onPostTurn = vi.fn();
    process.env.SCENE_PLAN_ENABLED = "false";
    generateTextMock.mockResolvedValue({
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
