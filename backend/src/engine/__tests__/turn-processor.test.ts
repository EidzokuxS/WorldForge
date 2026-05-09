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
} = vi.hoisted(() => ({
  logEventMock: vi.fn(),
  logInfoMock: vi.fn(),
  logWarnMock: vi.fn(),
  logErrorMock: vi.fn(),
  resolveDueWorldWorkForScopeMock: vi.fn(),
  resolveDueWorldThreadWorkForScopeMock: vi.fn(),
  runRequiredActorDecisionPassMock: vi.fn(),
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
  resolveDueWorldWorkForScope: resolveDueWorldWorkForScopeMock,
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
  summarizeRuntimeToolResultForNarrator: vi.fn((input: { toolInput?: Record<string, unknown> }) =>
    String(input.toolInput?.text ?? input.toolInput?.summary ?? "Scene consequence settles."),
  ),
}));

vi.mock("../visible-narration-output-guard.js", () => ({
  runVisibleNarrationWithPacketGuard: vi.fn(),
}));

// Mock the ai module
vi.mock("ai", () => ({
  generateText: vi.fn(),
  tool: vi.fn((def: unknown) => def),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn().mockResolvedValue({ object: { isMovement: false, destination: null } }),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn().mockReturnValue("mock-model"),
}));

import {
  detectMovement,
  detectVisibleNarrationFailures,
  processTurn,
  processOpeningScene,
  type HiddenTurnSummary,
  type TurnEvent,
} from "../turn-processor.js";
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
import { buildNarratorPacket } from "../narrator-packet.js";
import { runVisibleNarrationWithPacketGuard } from "../visible-narration-output-guard.js";
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

    return [{
      type: "state_update",
      data: {
        tool: String(part.toolName ?? ""),
        args: part.input,
        result: part.output,
      },
    }];
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

function createScenePlanFrameMock() {
  return {
    campaignId: CAMPAIGN_ID,
    tick: 5,
    playerActorId: "player-1",
    currentLocationId: "loc-1",
    currentSceneScopeId: "loc-1",
    playerAction: "I attack the goblin",
    roster: {
      active: [
        {
          id: "player-1",
          actorId: "player-1",
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
    allowedTools: ["log_event"],
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
      actorId: "player-1",
      intent: "Attack the goblin",
      method: "sword swing",
      targetIds: [],
    },
    anchorEvent: {
      id: SCENE_PLAN_EVENT_ID,
      actorId: "player-1",
      subjectIds: ["player-1"],
      kind: "player_action",
    },
    primaryResponse: {
      id: SCENE_PLAN_RESPONSE_ID,
      actorId: "player-1",
      responseKind: "system",
      eventId: SCENE_PLAN_EVENT_ID,
      visibleToPlayer: true,
    },
    supportResponses: [],
    plannedActions: [
      {
        id: SCENE_PLAN_ACTION_ID,
        actorId: "player-1",
        toolName: "log_event",
        input: { summary: "The scene records the player action." },
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
    playerAction: "I attack the goblin",
    oracleOutcome: "strong_hit",
    anchorEvent: {
      id: SCENE_PLAN_EVENT_ID,
      actorId: "player-1",
      kind: "player_action",
      summary: "Player action request.",
      perceivableByPlayer: true,
    },
    perceivableEvents: [],
    perceivableResponses: [],
    perceivableEffects: [],
    visibleActors: [{ id: "player-1", label: "Hero", type: "player" }],
    hintSignals: [],
    guardrails: [],
    controlReturnReason: "Scene complete.",
    allowedVisibleActorNames: ["Hero"],
    forbiddenActorNames: ["Hidden Watcher"],
    forbiddenFactMarkers: ["hidden-actor:hidden-watcher"],
    canonicalTurnPacket: {},
  };
}

function createGmReadMock(
  overrides: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const read = {
    version: "gm-read.v1",
    situationSummary: "The player creates the next local beat.",
    sceneQuestion: "What changes in the immediate scene?",
    focalActorRefs: ["player-1"],
    backgroundActorRefs: [],
    actionInterpretation: {
      intent: "Attack the goblin",
      method: "sword swing",
      targetRefs: [],
    },
    path: "tool_plan",
    turnIntent: "Plan a concrete local scene mutation.",
    rationale: "The GM selected a concrete tool-backed scene mutation.",
    evidenceRefs: ["player-1"],
    narrationGuardrails: ["Stay inside the visible scene."],
    ...overrides,
  };

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
  } as never);
  vi.mocked(runScenePlanner).mockResolvedValue(scenePlan as never);
  vi.mocked(validateScenePlan).mockReturnValue({
    ok: true,
    plan: { frame, plan: scenePlan, issues: [] },
  } as never);
  vi.mocked(executeScenePlan).mockResolvedValue(executedPlan as never);
  vi.mocked(buildNarratorPacket).mockReturnValue(narratorPacket as never);
  vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementation(async (args) => {
    const text = await args.generateNarration({ attempt: 1, guardAddendum: null });
    return {
      text,
      attempts: 1,
      retried: false,
      validation: { ok: true, violations: [] },
      guardAddendum: null,
    };
  });

  return { frame, scenePlan, executedPlan, narratorPacket };
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
    });
    // Default: no movement detected
    vi.mocked(safeGenerateObject).mockResolvedValue({ object: { isMovement: false, destination: null } } as never);
  });

  it("yields oracle_result event first", async () => {
    const { oracleResult } = setupMocks();
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    expect(events[0]).toEqual({
      type: "oracle_result",
      data: oracleResult,
    });
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

  it("emits reasoning SSE only when explicit non-production exposure is enabled", async () => {
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
        {
          type: "reasoning",
          data: {
            text: "Debug-only reasoning stays on the private diagnostic lane.",
          },
        },
      ]),
    );

    const narrativeIndex = events.findIndex((event) => event.type === "narrative");
    const reasoningIndex = events.findIndex((event) => event.type === "reasoning");
    const doneIndex = events.findIndex((event) => event.type === "done");

    expect(narrativeIndex).toBeGreaterThan(-1);
    expect(reasoningIndex).toBeGreaterThan(narrativeIndex);
    expect(doneIndex).toBeGreaterThan(reasoningIndex);
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

  it("emits reasoning when Z.AI chat body carries reasoning_content even if reasoningText is empty", async () => {
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
        {
          type: "reasoning",
          data: {
            text: "Narrate only the committed consequence and do not invent extra beats.",
          },
        },
      ]),
    );
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

  it("uses storyteller model role with reasoning-enabled baseline family for visible narration", async () => {
    setupMocks({
      streamParts: [{ type: "text-delta", text: "A blade cuts the air." }],
    });

    await collectEvents(processTurn(createTestOptions()));

    const storytellerCalls = mockedCreateModel.mock.calls.filter(
      ([, options]) => options?.role === "storyteller" && options?.familyHint === "baseline",
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

  it("yields state_update events for tool results", async () => {
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
    expect(stateUpdates).toHaveLength(1);
    expect(stateUpdates[0]!.data).toEqual({
      tool: "add_tag",
      args: { entityName: "Goblin", entityType: "npc", tag: "wounded" },
      result: { success: true, result: { entity: "Goblin", tags: ["wounded"] } },
    });
  });

  it("yields quick_actions event when offer_quick_actions tool is called", async () => {
    const actions = [
      { label: "Loot", action: "Search the body" },
      { label: "Move", action: "Continue down the corridor" },
      { label: "Rest", action: "Take a short rest" },
    ];
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "Victory!" },
        {
          type: "tool-result",
          toolName: "offer_quick_actions",
          input: { actions },
          output: { success: true, result: { actions } },
        },
      ],
    });
    const options = createTestOptions();

    const events = await collectEvents(processTurn(options));

    const quickActions = events.filter((e) => e.type === "quick_actions");
    expect(quickActions).toHaveLength(1);
    expect(quickActions[0]!.data).toEqual({
      success: true,
      result: { actions },
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

  it("suppresses repeated narration blocks in the final visible narration", async () => {
    setupMocks({
      streamParts: [
        { type: "text-delta", text: "The market square falls silent.\n\n" },
        { type: "text-delta", text: "The market square falls silent.\n\n" },
        { type: "text-delta", text: "A bell tolls somewhere beyond the smoke." },
      ],
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(appendChatMessages).toHaveBeenLastCalledWith(
      CAMPAIGN_ID,
      [
        {
          role: "assistant",
          content:
            "The market square falls silent.\n\nA bell tolls somewhere beyond the smoke.",
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
      },
    ]);
  });

  it("does not add a retry when sanitizeNarrative and duplicate collapse already fix the output", async () => {
    setupMocks();
    (generateText as Mock).mockResolvedValueOnce({
      text: [
        "The market square falls silent.",
        "The market square falls silent.",
        "[NPC STATES]",
        "Hidden state that should never reach the player.",
      ].join("\n\n"),
    });

    await collectEvents(processTurn(createTestOptions()));

    expect(generateText).toHaveBeenCalledTimes(1);
    expect(appendChatMessages).toHaveBeenLastCalledWith(CAMPAIGN_ID, [
      {
        role: "assistant",
        content: "The market square falls silent.",
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
            actions: [{ label: "Loot", action: "Loot the goblin" }],
          },
          output: {
            success: true,
            result: {
              actions: [{ label: "Loot", action: "Loot the goblin" }],
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
      data: { tick: 6 },
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
              actions: [{ label: "Loot", action: "Loot the goblin" }],
            },
            output: {
              success: true,
              result: {
                actions: [{ label: "Loot", action: "Loot the goblin" }],
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
        data: { tick: 6 },
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
        { role: "assistant", content: "You remain at Town Square." },
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
      data: oracleResult,
    });
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
  });

  function assistantAppendCallOrder(): number | undefined {
    const appendMock = vi.mocked(appendChatMessages);
    const callIndex = appendMock.mock.calls.findIndex(([, messages]) =>
      Array.isArray(messages)
      && messages.some((message) => message.role === "assistant"),
    );

    return callIndex >= 0 ? appendMock.mock.invocationCallOrder[callIndex] : undefined;
  }

  it("defaults to the GM tool loop and preserves execution/guard ordering before narrative SSE", async () => {
    setupMocks();
    setupScenePlanMocks();

    const milestones: string[] = [];
    vi.mocked(runVisibleNarrationWithPacketGuard).mockImplementationOnce(async (args) => {
      milestones.push("runVisibleNarrationWithPacketGuard before narrative SSE");
      const text = await args.generateNarration({ attempt: 1, guardAddendum: null });
      return {
        text,
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

    if (_path !== "clarification") {
      const packetArgs = vi.mocked(buildNarratorPacket).mock.calls.at(-1)?.[0] as
        | { canonicalTurnPacket?: { anchorEvent?: { summary?: string }; responses?: Array<{ summary: string }> } }
        | undefined;
      const expectedGuidance =
        "directResolutionNotes" in pathFields
          ? pathFields.directResolutionNotes
          : "continuationGuidance" in pathFields
            ? pathFields.continuationGuidance
            : null;

      expect(packetArgs?.canonicalTurnPacket?.anchorEvent?.summary).toContain(
        "Player action request:",
      );
      expect(typeof expectedGuidance).toBe("string");
      expect(packetArgs?.canonicalTurnPacket?.responses?.[0]?.summary).toContain(
        expectedGuidance as string,
      );
    }
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

  it("regenerates Storyteller output once more after packet-guard failure before rollback", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runVisibleNarrationWithPacketGuard).mockRejectedValueOnce(
      new Error("Visible narration violated packet visibility constraints after retry."),
    );

    const events = await collectEvents(processTurn(createTestOptions()));

    expect(runVisibleNarrationWithPacketGuard).toHaveBeenCalledTimes(2);
    expect(String(vi.mocked(generateText).mock.calls.at(-1)?.[0]?.prompt)).toContain(
      "[PACKET VISIBILITY RECOVERY]",
    );
    expect(assistantAppendCallOrder()).toBeDefined();
    expect(events.some((event) => event.type === "narrative")).toBe(true);
    expect(events.some((event) => event.type === "done")).toBe(true);
  });

  it("throws Storyteller output guard failures only after recovery regeneration also fails", async () => {
    setupMocks();
    setupScenePlanMocks();
    vi.mocked(runVisibleNarrationWithPacketGuard)
      .mockRejectedValueOnce(new Error("Visible narration violated packet visibility constraints after retry."))
      .mockRejectedValueOnce(new Error("Visible narration violated packet visibility constraints after recovery."));

    const events: TurnEvent[] = [];
    await expect((async () => {
      for await (const event of processTurn(createTestOptions())) {
        events.push(event);
      }
    })()).rejects.toThrow("Visible narration violated packet visibility constraints after recovery.");

    expect(assistantAppendCallOrder()).toBeUndefined();
    expect(events.some((event) => event.type === "narrative")).toBe(false);
    expect(events.some((event) => event.type === "done")).toBe(false);
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

  it("isolates the legacy path when SCENE_PLAN_ENABLED=false", async () => {
    process.env.SCENE_PLAN_ENABLED = "false";
    setupMocks();
    setupScenePlanMocks();

    await collectEvents(processTurn(createTestOptions()));

    expect(buildSceneFrame).not.toHaveBeenCalled();
    expect(runScenePlanner).not.toHaveBeenCalled();
    expect(validateScenePlan).not.toHaveBeenCalled();
    expect(executeScenePlan).not.toHaveBeenCalled();
    expect(buildNarratorPacket).not.toHaveBeenCalled();
    expect(runVisibleNarrationWithPacketGuard).not.toHaveBeenCalled();
    expect(runHiddenAdjudicationPlan).toHaveBeenCalled();
  });
});

describe("processOpeningScene", () => {
  it("uses storyteller model role with reasoning-enabled baseline family for opening narration", async () => {
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
      { role: "storyteller", familyHint: "baseline" },
    );
    expect(events).toEqual(
      expect.arrayContaining([{ type: "narrative", data: { text: "Lanternlight spills into the market." } }]),
    );
    expect(events.some((event) => event.type === "reasoning")).toBe(false);
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
