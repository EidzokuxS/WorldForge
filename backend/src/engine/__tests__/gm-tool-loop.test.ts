import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const {
  logEventMock,
  logEventExecuteMock,
  addChronicleEntryExecuteMock,
  addTagExecuteMock,
  setConditionExecuteMock,
  setRelationshipExecuteMock,
  transferItemExecuteMock,
  recordDialogueOutcomeExecuteMock,
  recordWorldFactExecuteMock,
  createMinorPoiExecuteMock,
  createSceneExtraExecuteMock,
  revealLocationExecuteMock,
  moveToExecuteMock,
  moveActorExecuteMock,
  spawnNpcExecuteMock,
  spawnItemExecuteMock,
  advanceTimeExecuteMock,
  offerQuickActionsExecuteMock,
  listVisibleAffordancesExecuteMock,
  findPoiCandidatesExecuteMock,
  inspectKnownFactExecuteMock,
  sqliteExecMock,
  executionContextMock,
  retractStoredEpisodicEventMock,
  retractReflectionBudgetMock,
  retractActorKnowledgeRecordMock,
} = vi.hoisted(() => ({
  logEventMock: vi.fn(),
  logEventExecuteMock: vi.fn(),
  addChronicleEntryExecuteMock: vi.fn(),
  addTagExecuteMock: vi.fn(),
  setConditionExecuteMock: vi.fn(),
  setRelationshipExecuteMock: vi.fn(),
  transferItemExecuteMock: vi.fn(),
  recordDialogueOutcomeExecuteMock: vi.fn(),
  recordWorldFactExecuteMock: vi.fn(),
  createMinorPoiExecuteMock: vi.fn(),
  createSceneExtraExecuteMock: vi.fn(),
  revealLocationExecuteMock: vi.fn(),
  moveToExecuteMock: vi.fn(),
  moveActorExecuteMock: vi.fn(),
  spawnNpcExecuteMock: vi.fn(),
  spawnItemExecuteMock: vi.fn(),
  advanceTimeExecuteMock: vi.fn(),
  offerQuickActionsExecuteMock: vi.fn(),
  listVisibleAffordancesExecuteMock: vi.fn(),
  findPoiCandidatesExecuteMock: vi.fn(),
  inspectKnownFactExecuteMock: vi.fn(),
  sqliteExecMock: vi.fn(),
  retractStoredEpisodicEventMock: vi.fn(),
  retractReflectionBudgetMock: vi.fn(),
  retractActorKnowledgeRecordMock: vi.fn(),
  executionContextMock: {
    scope: "player_turn",
    subjectActorId: "actor-player",
    subjectActorRefs: new Set(["actor-player", "player"]),
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-market",
    legalLocationRefs: new Set(["current_location", "current_scene", "loc-market", "scene-market"]),
    legalActorRefs: new Set(["actor-player", "player"]),
    legalItemRefs: new Set(),
    legalFactionRefs: new Set(),
    currentLocationRefs: new Set(["current_location", "loc-market", "market"]),
    currentSceneRefs: new Set(["current_scene", "scene-market", "market counter"]),
    legalMovementRefs: new Set(),
    sameTurnResultRefs: new Set(),
    sameTurnModelSafeRefs: [],
  },
}));

vi.mock("../../db/index.js", () => ({
  getSqliteConnection: vi.fn(() => ({
    exec: sqliteExecMock,
  })),
}));

vi.mock("../../vectors/episodic-events.js", () => ({
  retractStoredEpisodicEvent: retractStoredEpisodicEventMock,
}));

vi.mock("../reflection-budget.js", () => ({
  retractReflectionBudget: retractReflectionBudgetMock,
}));

vi.mock("../knowledge-model.js", () => ({
  retractActorKnowledgeRecord: retractActorKnowledgeRecordMock,
}));

vi.mock("ai", () => ({
  generateText: vi.fn(),
  hasToolCall: vi.fn((toolName: string) => ({ type: "has-tool-call", toolName })),
  stepCountIs: vi.fn((count: number) => ({ type: "step-count", count })),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => "judge-model"),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: logEventMock,
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => await fn()),
  }));

vi.mock("../model-facing-scene.js", () => ({
  buildModelFacingScenePacket: vi.fn(() => ({
    view: {
      localScene: {
        campaignId: "campaign-1",
        tick: 7,
        playerActorId: "actor-player",
        currentLocationId: "loc-market",
        currentSceneScopeId: "scene-market",
        currentLocationName: "Market",
        currentSceneScopeName: "Market Counter",
      },
      visibleActors: [],
      legalTargets: [],
      legalMovement: [],
    },
    safety: {},
  })),
  buildModelFacingSceneDiagnostics: vi.fn(() => ({ redacted: 0 })),
  oracleContextForModelPrompt: vi.fn(() => null),
  oracleResultForModelPrompt: vi.fn((value: unknown) => value
    && typeof value === "object"
    && !Array.isArray(value)
    ? {
        outcome: (value as { outcome?: unknown }).outcome ?? null,
        chance: (value as { chance?: unknown }).chance ?? null,
        roll: (value as { roll?: unknown }).roll ?? null,
        confidence: (value as { confidence?: unknown }).confidence ?? null,
      }
    : null),
  redactModelFacingJson: vi.fn((value: unknown) => value),
  redactModelFacingText: vi.fn((value: string) => value),
  shouldDropModelFacingText: vi.fn(() => false),
  isUnsafeModelFacingRef: vi.fn((ref: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(ref)
    || /^(?:actor|campaign|edge|faction|item|loc|location|npc|player|scene|event|knowledge|authority|route|movement|tool|forecast|world)[-:]/i.test(ref),
  ),
}));

vi.mock("../tool-execution-context.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../tool-execution-context.js")>();
  return {
    ...actual,
    createPlayerTurnToolExecutionContext: vi.fn(() => executionContextMock),
    normalizeToolRef: vi.fn((value: string) => value.trim().toLowerCase()),
  };
});

vi.mock("../tool-schemas.js", () => ({
  runtimeToolInputSchemas: {
    list_visible_affordances: {},
    list_navigation_options: {},
    find_location_candidates: {},
    find_object_candidates: {},
    find_actor_candidates: {},
    find_poi_candidates: {},
    inspect_known_fact: {},
    check_route: {},
    move_actor: {},
    create_minor_poi: {},
    create_scene_extra: {},
    start_search: {},
    record_player_intent: {},
    record_dialogue_outcome: {},
    record_world_fact: {},
    add_tag: {},
    remove_tag: {},
    set_relationship: {},
    add_chronicle_entry: {},
    log_event: {},
    advance_time: {},
    offer_quick_actions: {},
    spawn_npc: {},
    promote_npc: {},
    spawn_item: {},
    reveal_location: {},
    request_contested_outcome: {},
    set_condition: {},
    move_to: {},
    transfer_item: {},
  },
  createStorytellerTools: vi.fn(() => ({
    list_visible_affordances: { description: "List visible affordances tool", execute: listVisibleAffordancesExecuteMock },
    find_poi_candidates: { description: "Find POI candidates tool", execute: findPoiCandidatesExecuteMock },
    inspect_known_fact: { description: "Inspect known fact tool", execute: inspectKnownFactExecuteMock },
    add_chronicle_entry: { description: "Add chronicle entry tool", execute: addChronicleEntryExecuteMock },
    log_event: { description: "Log event tool", execute: logEventExecuteMock },
    add_tag: { description: "Add tag tool", execute: addTagExecuteMock },
    set_condition: { description: "Set condition tool", execute: setConditionExecuteMock },
    set_relationship: { description: "Set relationship tool", execute: setRelationshipExecuteMock },
    transfer_item: { description: "Transfer item tool", execute: transferItemExecuteMock },
    record_dialogue_outcome: { description: "Record dialogue outcome tool", execute: recordDialogueOutcomeExecuteMock },
    record_world_fact: { description: "Record world fact tool", execute: recordWorldFactExecuteMock },
    create_minor_poi: { description: "Create minor POI tool", execute: createMinorPoiExecuteMock },
    create_scene_extra: { description: "Create scene extra tool", execute: createSceneExtraExecuteMock },
    reveal_location: { description: "Reveal location tool", execute: revealLocationExecuteMock },
    move_to: { description: "Move to tool", execute: moveToExecuteMock },
    move_actor: { description: "Move actor tool", execute: moveActorExecuteMock },
    spawn_npc: { description: "Spawn NPC tool", execute: spawnNpcExecuteMock },
    spawn_item: { description: "Spawn Item tool", execute: spawnItemExecuteMock },
    advance_time: { description: "Advance time tool", execute: advanceTimeExecuteMock },
    offer_quick_actions: { description: "Offer quick actions tool", execute: offerQuickActionsExecuteMock },
  })),
}));

import { generateText, stepCountIs } from "ai";
import { createPlayerTurnToolExecutionContext } from "../tool-execution-context.js";
import { createStorytellerTools } from "../tool-schemas.js";
import {
  GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS,
  buildGmToolLoopPrompt,
  GM_TOOL_LOOP_MAX_STEPS,
  GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS,
  GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
  GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
  GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
  GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS,
  GM_TOOL_LOOP_STATUS_READ_MAX_STEPS,
  GM_TOOL_LOOP_STATUS_READ_TIMEOUT_MS,
  GM_TOOL_LOOP_TERMINAL_CLOSURE_MAX_STEPS,
  GM_TOOL_LOOP_TIMEOUT_MS,
  GM_TOOL_LOOP_TRANSPORT_MAX_RETRIES,
  runGmToolLoop,
} from "../gm-tool-loop.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import type { GmRead } from "../gm-turn-read.js";
import type { SceneFrame } from "../scene-frame.js";
import type { RuntimeRequirementLike } from "../tool-contracts.js";

const provider = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
} as ProviderConfig;

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 7,
    playerActorId: "actor-player",
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-market",
    playerAction: "I promise to meet the dock worker at dawn.",
    roster: {
      active: [
        {
          id: "actor-player",
          actorId: "actor-player",
          type: "player",
          label: "Player",
          locationId: "loc-market",
          sceneScopeId: "scene-market",
          awareness: "clear",
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    allowedTools: ["log_event"],
  } as unknown as SceneFrame;
}

const gmRead: Extract<GmRead, { path: "tool_plan" }> = {
  version: "gm-read.v1",
  path: "tool_plan",
  situationSummary: "The player makes a future-relevant promise.",
  sceneQuestion: "Will the promise become remembered world state?",
  focalActorRefs: ["actor-player"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "Make a future appointment.",
    targetRefs: [],
  },
  turnGrounding: {
    intentKind: "concrete_state_change",
    requiresGrounding: true,
    groundingKind: "scene_beat",
    topicKind: "social",
    durability: "durable",
    reason: "A future appointment should be remembered.",
  },
  rationale: "A promise should persist for future continuity.",
  evidenceRefs: ["actor-player"],
  narrationGuardrails: [],
  turnIntent: "Record the promise as future-relevant memory.",
  runtimeRequirement: {
    kind: "scene_beat",
    durability: "durable",
    beatKind: "event_log",
  },
};

function generateTextMock(): Mock {
  return generateText as unknown as Mock;
}

function toolAuthority(
  stateDeltaRefs: string[] = ["state:delta"],
  toolResultId = "tool-result-test",
  eventRefs: string[] = [],
): Record<string, unknown> {
  return {
    toolResultId,
    campaignId: "campaign-1",
    sourceEntity: { type: "system", id: "gm-tool-loop-test" },
    baseWorldVersion: 7,
    resultWorldVersion: 8,
    elapsedWorldTimeMinutes: 0,
    stateDeltaRefs,
    eventRefs,
    witnesses: [],
    knowledgeOutputs: [],
    visibilityOutputs: [],
    resources: [],
  };
}

function testLogEventAuthority(output: Record<string, unknown>): Record<string, unknown> {
  const payload = output.result && typeof output.result === "object" && !Array.isArray(output.result)
    ? output.result as Record<string, unknown>
    : {};
  const eventId = typeof payload.eventId === "string" && payload.eventId.trim()
    ? payload.eventId.trim()
    : null;
  const durability = typeof payload.durability === "string" ? payload.durability : null;
  if (durability === "durable") {
    const ref = eventId ?? "event:test-log-event";
    return toolAuthority([ref], `tool-result-${ref}`, [ref]);
  }
  return toolAuthority(["scene_local_observation"], "tool-result-scene-local-log-event");
}

function withTerminalTestAuthority(toolName: string, output: unknown): unknown {
  const authoritativeToolNames = new Set([
    "record_dialogue_outcome",
    "record_world_fact",
    "log_event",
    "add_tag",
    "remove_tag",
    "set_relationship",
    "set_condition",
    "transfer_item",
    "move_actor",
    "reveal_location",
    "spawn_item",
    "promote_npc",
    "create_minor_poi",
  ]);
  if (
    !authoritativeToolNames.has(toolName)
    || !output
    || typeof output !== "object"
    || Array.isArray(output)
    || (output as { success?: unknown }).success !== true
    || (output as { authority?: unknown }).authority
  ) {
    return output;
  }

  if (toolName === "log_event") {
    return {
      ...output,
      authority: testLogEventAuthority(output as Record<string, unknown>),
    };
  }

  if (toolName !== "record_dialogue_outcome" && toolName !== "record_world_fact") {
    return {
      ...output,
      authority: toolAuthority([`tool:${toolName}:state`], `tool-result-${toolName}`),
    };
  }

  return {
    ...output,
    authority: toolAuthority(
      toolName === "record_world_fact"
        ? ["knowledge:world-fact"]
        : ["event:dialogue-outcome"],
    ),
  };
}

type ExecutedToolCall = {
  toolName: string;
  input: Record<string, unknown>;
  toolCallId?: string;
  output?: unknown;
};

type ExecutedToolStep = ExecutedToolCall | ExecutedToolCall[];

function toolExecuteMockFor(toolName: string): Mock | null {
  switch (toolName) {
    case "log_event":
      return logEventExecuteMock;
    case "add_tag":
      return addTagExecuteMock;
    case "set_condition":
      return setConditionExecuteMock;
    case "set_relationship":
      return setRelationshipExecuteMock;
    case "transfer_item":
      return transferItemExecuteMock;
    case "record_dialogue_outcome":
      return recordDialogueOutcomeExecuteMock;
    case "record_world_fact":
      return recordWorldFactExecuteMock;
    case "create_minor_poi":
      return createMinorPoiExecuteMock;
    case "create_scene_extra":
      return createSceneExtraExecuteMock;
    case "reveal_location":
      return revealLocationExecuteMock;
    case "move_to":
      return moveToExecuteMock;
    case "move_actor":
      return moveActorExecuteMock;
    case "spawn_npc":
      return spawnNpcExecuteMock;
    case "spawn_item":
      return spawnItemExecuteMock;
    case "advance_time":
      return advanceTimeExecuteMock;
    case "offer_quick_actions":
      return offerQuickActionsExecuteMock;
    case "list_visible_affordances":
      return listVisibleAffordancesExecuteMock;
    case "find_poi_candidates":
      return findPoiCandidatesExecuteMock;
    case "inspect_known_fact":
      return inspectKnownFactExecuteMock;
    default:
      return null;
  }
}

function mockGenerateTextExecutingToolCalls(
  steps: ExecutedToolStep[],
  options: {
    text?: string;
    response?: { modelId: string } | null;
  } = {},
): void {
  for (const step of steps) {
    const calls = Array.isArray(step) ? step : [step];
    for (const call of calls) {
      if (call.output !== undefined) {
        toolExecuteMockFor(call.toolName)?.mockResolvedValueOnce(
          withTerminalTestAuthority(call.toolName, call.output),
        );
      }
    }
  }

  generateTextMock().mockImplementationOnce(async (generateOptions: {
    tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
  }) => {
    const sdkSteps = [];
    for (const step of steps) {
      const calls = Array.isArray(step) ? step : [step];
      const toolCalls = [];
      const toolResults = [];
      for (const call of calls) {
        const output = await generateOptions.tools[call.toolName]?.execute?.(call.input);
        toolCalls.push({
          ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
          toolName: call.toolName,
          input: call.input,
        });
        toolResults.push({
          ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
          output,
        });
      }
      sdkSteps.push({ toolCalls, toolResults });
    }
    return {
      text: options.text ?? "",
      finishReason: "stop",
      response: options.response === undefined ? { modelId: "judge-model" } : options.response,
      usage: null,
      steps: sdkSteps,
    };
  });
}

function mockGenerateTextExecutingParsedSteps(result: {
  text: string;
  finishReason: string;
  response: { modelId: string } | null;
  usage: unknown;
  steps: Array<{
    toolCalls?: Array<{
      toolName: string;
      input?: Record<string, unknown>;
      args?: Record<string, unknown>;
      toolCallId?: string;
    }>;
    toolResults?: Array<{
      output?: unknown;
      toolCallId?: string;
    }>;
  }>;
}): void {
  result.steps.forEach((step) => {
    step.toolCalls?.forEach((call, index) => {
      const output = step.toolResults?.[index]?.output;
      if (output !== undefined) {
        toolExecuteMockFor(call.toolName)?.mockResolvedValueOnce(
          withTerminalTestAuthority(call.toolName, output),
        );
      }
    });
  });

  generateTextMock().mockImplementationOnce(async (generateOptions: {
    tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
  }) => {
    const steps = [];
    for (const step of result.steps) {
      const toolCalls = step.toolCalls ?? [];
      const toolResults = [];
      for (const call of toolCalls) {
        const input = call.input ?? call.args ?? {};
        const output = await generateOptions.tools[call.toolName]?.execute?.(input);
        toolResults.push({
          ...(call.toolCallId ? { toolCallId: call.toolCallId } : {}),
          output,
        });
      }
      steps.push({
        ...step,
        toolResults,
      });
    }
    return {
      ...result,
      steps,
    };
  });
}

describe("runGmToolLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generateTextMock().mockReset();
    logEventExecuteMock.mockReset();
    addChronicleEntryExecuteMock.mockReset();
    addTagExecuteMock.mockReset();
    setConditionExecuteMock.mockReset();
    setRelationshipExecuteMock.mockReset();
    transferItemExecuteMock.mockReset();
    recordDialogueOutcomeExecuteMock.mockReset();
    recordWorldFactExecuteMock.mockReset();
    createSceneExtraExecuteMock.mockReset();
    revealLocationExecuteMock.mockReset();
    moveToExecuteMock.mockReset();
    moveActorExecuteMock.mockReset();
    spawnNpcExecuteMock.mockReset();
    spawnItemExecuteMock.mockReset();
    advanceTimeExecuteMock.mockReset();
    offerQuickActionsExecuteMock.mockReset();
    listVisibleAffordancesExecuteMock.mockReset();
    findPoiCandidatesExecuteMock.mockReset();
    inspectKnownFactExecuteMock.mockReset();
    sqliteExecMock.mockReset();
    executionContextMock.currentLocationId = "loc-market";
    executionContextMock.currentSceneScopeId = "scene-market";
    executionContextMock.legalLocationRefs = new Set(["current_location", "current_scene", "loc-market", "scene-market"]);
    executionContextMock.legalActorRefs = new Set(["actor-player", "player"]);
    executionContextMock.legalItemRefs = new Set();
    executionContextMock.legalFactionRefs = new Set();
    executionContextMock.currentLocationRefs = new Set(["current_location", "loc-market", "market"]);
    executionContextMock.currentSceneRefs = new Set(["current_scene", "scene-market", "market counter"]);
    executionContextMock.legalMovementRefs = new Set();
    executionContextMock.sameTurnResultRefs = new Set();
    logEventExecuteMock.mockResolvedValue({ success: true, result: {} });
    addChronicleEntryExecuteMock.mockResolvedValue({
      success: true,
      result: { entryId: "chronicle-entry-1", persisted: true },
      authority: toolAuthority(["chronicle:chronicle-entry-1"]),
    });
    addTagExecuteMock.mockResolvedValue({
      success: true,
      result: { tags: ["stamped"] },
      authority: toolAuthority(["actor:actor-player:tags"]),
    });
    setConditionExecuteMock.mockResolvedValue({
      success: true,
      result: { entity: "Player", condition: "winded" },
      authority: toolAuthority(["actor:actor-player:conditions"]),
    });
    setRelationshipExecuteMock.mockResolvedValue({
      success: true,
      result: { entityA: "Player", entityB: "Gate Guard" },
      authority: toolAuthority(["relationship:actor-player:gate-guard"]),
    });
    transferItemExecuteMock.mockResolvedValue({
      success: true,
      result: { item: "Gate Key", target: "Player" },
      authority: toolAuthority(["item:gate-key:holder"]),
    });
    recordDialogueOutcomeExecuteMock.mockResolvedValue(
      withTerminalTestAuthority("record_dialogue_outcome", { success: true, result: {} }),
    );
    createSceneExtraExecuteMock.mockResolvedValue({
      success: true,
      result: { id: "actor-scene-extra-1", name: "Local Clerk", role: "clerk" },
      authority: toolAuthority(["actor:actor-scene-extra-1:presence"]),
    });
    revealLocationExecuteMock.mockResolvedValue({
      success: true,
      result: { id: "loc-back-room", name: "Back Room" },
      authority: toolAuthority(["location:loc-back-room:revealed"]),
    });
    moveToExecuteMock.mockResolvedValue({
      success: true,
      result: { locationId: "loc-back-room", locationName: "Back Room" },
      authority: toolAuthority(["actor:actor-player:location"]),
    });
    moveActorExecuteMock.mockResolvedValue({
      success: true,
      result: { locationId: "loc-back-room", locationName: "Back Room" },
      authority: toolAuthority(["actor:actor-player:location"]),
    });
    spawnNpcExecuteMock.mockResolvedValue({
      success: true,
      result: { id: "npc-1" },
      authority: toolAuthority(["actor:npc-1:presence"]),
    });
    spawnItemExecuteMock.mockResolvedValue({
      success: true,
      result: { id: "item-1" },
      authority: toolAuthority(["item:item-1:location"]),
    });
    advanceTimeExecuteMock.mockResolvedValue({
      success: true,
      result: { minutes: 60, clockAdvanced: true },
      authority: toolAuthority(["world:time"]),
    });
    offerQuickActionsExecuteMock.mockResolvedValue({
      success: true,
      result: {
        actions: [
          {
            label: "Ask",
            action: "Ask what changed.",
            handle: "qac_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          },
          {
            label: "Watch",
            action: "Watch for a reaction.",
            handle: "qac_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          },
          {
            label: "Move",
            action: "Move toward the open path.",
            handle: "qac_cccccccccccccccccccccccccccccccc",
          },
        ],
      },
    });
    listVisibleAffordancesExecuteMock.mockResolvedValue({
      success: true,
      kind: "observation",
      observationOnly: true,
      result: {
        observationOnly: true,
        affordances: [
          { ref: "route:market-gate", label: "Market Gate" },
          { ref: "actor:ledger-clerk", label: "Ledger Clerk" },
        ],
      },
    });
    findPoiCandidatesExecuteMock.mockResolvedValue({
      success: true,
      kind: "observation",
      observationOnly: true,
      result: {
        observationOnly: true,
        candidates: [{ ref: "location:tea-lane", label: "Tea Lane" }],
      },
    });
    inspectKnownFactExecuteMock.mockResolvedValue({
      success: true,
      kind: "observation",
      observationOnly: true,
      result: {
        observationOnly: true,
        count: 1,
        facts: [{ ref: "fact:market-ledger", label: "Market Ledger" }],
      },
    });
  });

  it("keeps profile output budgets large enough for reasoning models to reach tool calls", () => {
    expect(GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(
      GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS,
    );
    expect(GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(
      GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS,
    );
    expect(GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(1_200);
    expect(GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS).toBeGreaterThanOrEqual(4_096);
  });

  it("runs an AI SDK tool loop with only SceneFrame-allowed runtime tools", async () => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "log_event",
        input: {
          text: "The dawn appointment is promised.",
          durability: "durable",
          futureRelevance: "The appointment should be remembered on later turns.",
        },
        output: {
          success: true,
          result: {
            eventId: "event-1",
            text: "The dawn appointment is promised.",
            durability: "durable",
            persisted: true,
          },
        },
      },
    ]);

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I promise to meet the dock worker at dawn.",
      frame: createFrame(),
      gmRead,
    });

    expect(createPlayerTurnToolExecutionContext).toHaveBeenCalledWith(expect.objectContaining({
      allowedTools: ["log_event"],
    }));
    expect(createStorytellerTools).toHaveBeenCalledWith(
      "campaign-1",
      7,
      undefined,
      expect.objectContaining({ scope: "player_turn" }),
    );
    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      tools: {
        log_event: expect.objectContaining({
          description: "Log event tool",
          execute: expect.any(Function),
        }),
      },
      activeTools: ["log_event"],
      maxOutputTokens: GM_TOOL_LOOP_DEFAULT_MAX_OUTPUT_TOKENS,
      timeout: { totalMs: GM_TOOL_LOOP_TIMEOUT_MS },
      providerOptions: {
        openai: { parallelToolCalls: false },
        anthropic: { disableParallelToolUse: true },
      },
      maxRetries: GM_TOOL_LOOP_TRANSPORT_MAX_RETRIES,
      stopWhen: { type: "step-count", count: GM_TOOL_LOOP_MAX_STEPS },
    }));
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge", reasoningMode: "bypass" });
    expect(stepCountIs).toHaveBeenCalledWith(GM_TOOL_LOOP_MAX_STEPS);
    expect(result.intent).toBe("Record the promise as future-relevant memory.");
    expect(result.rawToolCalls).toHaveLength(1);
    expect(result.stepResults).toMatchObject([
      {
        status: "done",
        toolName: "log_event",
        mutationRefs: expect.arrayContaining(["event-1"]),
      },
    ]);
  });

  it("keeps quick-action capability rows inside the GM receipt boundary", async () => {
    const quickActionInput = {
      actions: [
        { label: "Ask", action: "Ask what changed." },
        { label: "Watch", action: "Watch for a reaction." },
        { label: "Move", action: "Move toward the open path." },
      ],
    };
    generateTextMock().mockImplementationOnce(async (options: {
      activeTools: string[];
      tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
    }) => {
      expect(options.activeTools).toContain("offer_quick_actions");
      expect(options.tools.offer_quick_actions).toBeDefined();
      const output = await options.tools.offer_quick_actions!.execute!(quickActionInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "offer_quick_actions", input: quickActionInput }],
            toolResults: [{ output }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask for options instead of resolving the promised appointment.",
      frame: {
        ...createFrame(),
        allowedTools: ["log_event", "offer_quick_actions"],
      } as SceneFrame,
      gmRead,
    })).rejects.toThrow(/accepted scene beat|accepted turn receipt/);

    expect(offerQuickActionsExecuteMock).toHaveBeenCalledTimes(1);
    expect(sqliteExecMock).toHaveBeenCalledWith(expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/u));
    expect(sqliteExecMock).toHaveBeenCalledWith(expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/u));
    expect(sqliteExecMock).toHaveBeenCalledWith(expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/u));
  });

  it("accepts quick-action capabilities only alongside an accepted turn receipt", async () => {
    const logInput = {
      text: "The dawn appointment is promised.",
      durability: "durable",
      futureRelevance: "The appointment should be remembered on later turns.",
    };
    const quickActionInput = {
      actions: [
        { label: "Ask", action: "Ask what changed." },
        { label: "Watch", action: "Watch for a reaction." },
        { label: "Move", action: "Move toward the open path." },
      ],
    };
    logEventExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority("log_event", {
      success: true,
      result: {
        eventId: "event-quick-action-anchor",
        text: "The dawn appointment is promised.",
        durability: "durable",
        persisted: true,
      },
    }));
    generateTextMock().mockImplementationOnce(async (options: {
      activeTools: string[];
      tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
    }) => {
      expect(options.activeTools).toEqual(["log_event", "offer_quick_actions"]);
      const logOutput = await options.tools.log_event!.execute!(logInput);
      const quickOutput = await options.tools.offer_quick_actions!.execute!(quickActionInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "log_event", input: logInput }],
            toolResults: [{ output: logOutput }],
          },
          {
            toolCalls: [{ toolName: "offer_quick_actions", input: quickActionInput }],
            toolResults: [{ output: quickOutput }],
          },
        ],
      };
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I promise to meet the dock worker at dawn.",
      frame: {
        ...createFrame(),
        allowedTools: ["log_event", "offer_quick_actions"],
      } as SceneFrame,
      gmRead,
    });

    expect(result.acceptedStepIds).toEqual([
      expect.stringMatching(/^tool-call-/u),
      expect.stringMatching(/^tool-call-/u),
    ]);
    expect(result.stepResults.map((step) => step.toolName)).toEqual([
      "log_event",
      "offer_quick_actions",
    ]);
    expect(sqliteExecMock).toHaveBeenCalledWith(expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/u));
    expect(sqliteExecMock).not.toHaveBeenCalledWith(expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/u));
    expect(sqliteExecMock).toHaveBeenCalledWith(expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/u));
  });

  it("blocks incompatible side-effect tools before execution when a typed runtime receipt is required", async () => {
    logEventExecuteMock.mockResolvedValueOnce({
      success: true,
      result: {
        eventId: "event-should-not-commit",
        durability: "durable",
        persisted: true,
      },
    });
    generateTextMock().mockImplementationOnce(async (options: {
      activeTools: string[];
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      expect(options.activeTools).toEqual(["add_tag"]);
      expect(options.tools.log_event).toBeUndefined();
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I force a durable state change.",
      frame: {
        ...createFrame(),
        allowedTools: ["log_event", "add_tag"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Apply a concrete state mutation.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "entity_tag" },
      },
    })).rejects.toThrow("produced no runtime tool calls");

    expect(logEventExecuteMock).not.toHaveBeenCalled();
  });

  it("blocks advance_time before executing it when a terminal world_fact receipt is required", async () => {
    advanceTimeExecuteMock.mockResolvedValueOnce({
      success: true,
      status: "success",
      result: { elapsedMinutes: 10 },
    });
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const input = { minutes: 10, reason: "The player waits before deciding what is true." };
      const output = await options.tools.advance_time!.execute(input);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "advance_time", input }],
            toolResults: [{ output }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 27,
      playerAction: "I wait a bit and compare the posted route notices.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "record_world_fact"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Record the durable route-notice fact.",
        runtimeRequirement: {
          kind: "world_fact",
          durability: "durable",
          topicKind: "route",
        },
      },
    })).rejects.toThrow("GM tool loop produced no successful backend observations");

    expect(advanceTimeExecuteMock).not.toHaveBeenCalled();
  });

  it("accepts advance_time as a scene beat receipt for wait turns", async () => {
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const input = { minutes: 10, reason: "The player waits and lets the scene breathe." };
      const output = await options.tools.advance_time!.execute(input);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "advance_time", input }],
            toolResults: [{ output }],
          },
        ],
      };
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I wait ten minutes and watch the room.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Advance local time for the player's wait.",
        runtimeRequirement: { kind: "scene_beat", durability: "scene_local", beatKind: "time_passage" },
      },
    });

    expect(result.stepResults[0]?.toolName).toBe("advance_time");
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("does not accept advance_time as an event-log scene beat receipt", async () => {
    logEventExecuteMock.mockResolvedValueOnce({
      success: true,
      result: { durability: "scene_local" },
      authority: toolAuthority(["scene_local_observation"], "tool-result-scene-local-log-event"),
    });
    generateTextMock().mockImplementationOnce(async (options: {
      activeTools: string[];
      tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
    }) => {
      const logInput = { text: "The room pressure changes.", durability: "scene_local" };
      expect(options.activeTools).toEqual(["log_event"]);
      expect(options.tools.advance_time).toBeUndefined();
      const logOutput = await options.tools.log_event?.execute?.(logInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "log_event", input: logInput }],
            toolResults: [{ output: logOutput }],
          },
        ],
      };
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I wait and let the room tension change.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Record a scene-local event log, not time passage.",
        runtimeRequirement: { kind: "scene_beat", durability: "scene_local", beatKind: "event_log" },
      },
    });

    expect(advanceTimeExecuteMock).not.toHaveBeenCalled();
    expect(logEventExecuteMock).toHaveBeenCalledTimes(1);
    expect(result.stepResults).toEqual([
      expect.objectContaining({
        toolName: "log_event",
        status: "done",
      }),
    ]);
  });

  it("rejects a synthetic successful side effect under a null runtime requirement", async () => {
    generateTextMock().mockImplementationOnce(async () => ({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "add_tag",
              input: { entityName: "Player", entityType: "player", tag: "oracle-winded" },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { tags: ["oracle-winded"] },
                authority: toolAuthority(["actor:actor-player:tags"], "tool-result-null-side-effect"),
              },
            },
          ],
        },
      ],
    }));

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I shove past the bruiser and turn it into a fight.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "list_visible_affordances"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        path: "combat_transition",
        actorRef: "actor-player",
        targetRef: "actor-player",
        combatFraming: "The shove turns into a close-quarters scuffle.",
        stakes: "Whether the opening exchange leaves the player winded.",
        runtimeRequirement: { kind: "none" },
      } as Extract<GmRead, { path: "combat_transition" }>,
    })).rejects.toThrow("successful authority-bearing result");

    expect(addTagExecuteMock).not.toHaveBeenCalled();
  });

  it("accepts advance_time as a contextual pre-tool before a state mutation receipt", async () => {
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const timeInput = { minutes: 5, reason: "The player waits for the patrol gap." };
      const moveInput = { actorRef: "actor-player", destinationRef: "loc-back-room" };
      const timeOutput = await options.tools.advance_time!.execute(timeInput);
      const moveOutput = await options.tools.move_actor!.execute(moveInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "advance_time", input: timeInput }],
            toolResults: [{ output: timeOutput }],
          },
          {
            toolCalls: [{ toolName: "move_actor", input: moveInput }],
            toolResults: [{ output: moveOutput }],
          },
        ],
      };
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I wait for the patrol to pass, then slip into the back room.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "move_actor"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Move the player after the wait.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      },
    });

    expect(result.stepResults.map((step) => step.toolName)).toEqual(["advance_time", "move_actor"]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("runs state-mutation closure when the first pass only performs contextual time", async () => {
    generateTextMock()
      .mockImplementationOnce(async (options: {
        tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      }) => {
        const timeInput = { minutes: 5, reason: "The player crosses the public corridor." };
        const timeOutput = await options.tools.advance_time!.execute(timeInput);
        return {
          text: "",
          finishReason: "stop",
          response: { modelId: "judge-model" },
          usage: null,
          steps: [
            {
              toolCalls: [{ toolName: "advance_time", input: timeInput }],
              toolResults: [{ output: timeOutput }],
            },
          ],
        };
      })
      .mockImplementationOnce(async (options: {
        activeTools: string[];
        tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
      }) => {
        expect(options.activeTools).toEqual(["move_actor"]);
        const moveInput = { actorRef: "Player", destinationRef: "Receiving Desk" };
        const moveOutput = await options.tools.move_actor!.execute(moveInput);
        return {
          text: "",
          finishReason: "stop",
          response: { modelId: "judge-model" },
          usage: null,
          steps: [
            {
              toolCalls: [{ toolName: "move_actor", input: moveInput }],
              toolResults: [{ output: moveOutput }],
            },
          ],
        };
      });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I walk through the public corridor to the receiving desk.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "move_actor"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Move the player after the corridor traversal.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      },
    });

    expect(result.stepResults.map((step) => step.toolName)).toEqual(["advance_time", "move_actor"]);
    expect(result.acceptedStepIds).toHaveLength(2);
    expect(generateTextMock()).toHaveBeenCalledTimes(2);
  });

  it("accepts advance_time as a contextual post-tool after a state mutation receipt", async () => {
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const moveInput = { actorRef: "actor-player", destinationRef: "loc-overlook" };
      const timeInput = { minutes: 10, reason: "The walk to the overlook takes time." };
      const moveOutput = await options.tools.move_actor!.execute(moveInput);
      const timeOutput = await options.tools.advance_time!.execute(timeInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "move_actor", input: moveInput }],
            toolResults: [{ output: moveOutput }],
          },
          {
            toolCalls: [{ toolName: "advance_time", input: timeInput }],
            toolResults: [{ output: timeOutput }],
          },
        ],
      };
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I walk to the overlook.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "move_actor"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Move the player and account for travel time.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      },
    });

    expect(result.stepResults.map((step) => step.toolName)).toEqual(["move_actor", "advance_time"]);
    expect(result.acceptedStepIds).toHaveLength(2);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("blocks undeclared event-log side effects during a movement receipt plan", async () => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "move_actor",
        input: { actorRef: "actor-player", destinationRef: "loc-overlook" },
      },
      {
        toolName: "log_event",
        input: { text: "The player walks to the overlook.", durability: "scene_local" },
      },
    ]);

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I walk to the overlook.",
      frame: {
        ...createFrame(),
        allowedTools: ["move_actor", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Move the player without recording an extra event-log receipt.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      },
    });

    expect(result.stepResults.map((step) => step.toolName)).toEqual(["move_actor", "log_event"]);
    expect(result.stepResults[1]?.result?.success).toBe(false);
    expect(result.stepResults[1]?.result?.contractFailure?.code).toBe("malformed_tool_result");
    expect(result.acceptedStepIds).toHaveLength(1);
    expect(logEventExecuteMock).not.toHaveBeenCalled();
  });

  it("does not expose roll_oracle side-effect tools under a null runtime requirement", async () => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "list_visible_affordances",
        input: { scope: "visible", maxResults: 6 },
        output: {
          success: true,
          kind: "observation",
          observationOnly: true,
          result: {
            observationOnly: true,
            affordances: [{ ref: "route:market-gate", label: "Market Gate" }],
          },
        },
      },
    ]);

    await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I dive through the service window before the guard can grab me.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "list_visible_affordances"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        path: "roll_oracle",
        rollRequest: {
          actorRef: "actor-player",
          question: "Does the player scramble through the window?",
          stakes: "Whether the escape leaves a concrete local consequence.",
          evidenceRefs: ["actor-player"],
        },
        runtimeRequirement: { kind: "none" },
      } as Extract<GmRead, { path: "roll_oracle" }>,
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as { activeTools: string[] };
    expect(generateArgs.activeTools).toContain("list_visible_affordances");
    expect(generateArgs.activeTools).not.toContain("add_tag");
    expect(addTagExecuteMock).not.toHaveBeenCalled();
  });

  it("does not execute combat_transition advance_time under a null runtime requirement", async () => {
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute?: (input: unknown) => Promise<unknown> }>;
    }) => {
      const output = await options.tools.advance_time?.execute?.({
        minutes: 10,
        reason: "Wrong generic side effect.",
      });
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [
              {
                toolName: "advance_time",
                input: { minutes: 10, reason: "Wrong generic side effect." },
              },
            ],
            toolResults: [{ output }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I shove past the bruiser and turn it into a fight.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "list_visible_affordances"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        path: "combat_transition",
        actorRef: "actor-player",
        targetRef: "actor-player",
        combatFraming: "The shove turns into a close-quarters scuffle.",
        stakes: "Whether the opening exchange leaves the player winded.",
        runtimeRequirement: { kind: "none" },
      } as Extract<GmRead, { path: "combat_transition" }>,
    })).rejects.toThrow("produced no successful backend observations");

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as { activeTools: string[] };
    expect(generateArgs.activeTools).not.toContain("advance_time");
    expect(advanceTimeExecuteMock).not.toHaveBeenCalled();
  });

  it("accepts a typed roll_oracle state mutation receipt", async () => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "add_tag",
        input: { entityName: "Player", entityType: "player", tag: "scrambled-through-window" },
        output: {
          success: true,
          result: { entity: "Player", tags: ["scrambled-through-window"] },
          authority: toolAuthority(["actor:actor-player:tags"], "tool-result-roll-tag"),
        },
      },
    ]);

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I dive through the service window before the guard can grab me.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        path: "roll_oracle",
        rollRequest: {
          actorRef: "actor-player",
          question: "Does the player scramble through the window?",
          stakes: "Whether the escape leaves a concrete local consequence.",
          evidenceRefs: ["actor-player"],
        },
        runtimeRequirement: { kind: "state_mutation", effectKind: "entity_tag" },
      } as Extract<GmRead, { path: "roll_oracle" }>,
    });

    expect(result.stepResults[0]?.toolName).toBe("add_tag");
    expect(result.acceptedToolResultIds).toEqual(["tool-result-roll-tag"]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it.each([
    {
      label: "roll_oracle",
      toolName: "add_tag",
      gmReadOverride: {
        ...gmRead,
        path: "roll_oracle",
        rollRequest: {
          actorRef: "actor-player",
          question: "Does the player scramble through the window?",
          stakes: "Whether the escape leaves a concrete local consequence.",
          evidenceRefs: ["actor-player"],
        },
        runtimeRequirement: { kind: "none" },
      } as Extract<GmRead, { path: "roll_oracle" }>,
    },
    {
      label: "combat_transition",
      toolName: "set_condition",
      gmReadOverride: {
        ...gmRead,
        path: "combat_transition",
        actorRef: "actor-player",
        targetRef: "actor-player",
        combatFraming: "The shove turns into a close-quarters scuffle.",
        stakes: "Whether the opening exchange leaves the player winded.",
        runtimeRequirement: { kind: "none" },
      } as Extract<GmRead, { path: "combat_transition" }>,
    },
  ])("keeps side-effect and terminal receipt tools out of null-requirement default profile for $label", async ({
    toolName,
    gmReadOverride,
  }) => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "list_visible_affordances",
        input: { scope: "visible", maxResults: 6 },
        output: {
          success: true,
          kind: "observation",
          observationOnly: true,
          result: {
            observationOnly: true,
            affordances: [{ ref: "route:market-gate", label: "Market Gate" }],
          },
        },
      },
    ]);

    await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I test the immediate pressure.",
      frame: {
        ...createFrame(),
        allowedTools: [
          toolName,
          "list_visible_affordances",
          "log_event",
          "record_dialogue_outcome",
          "record_world_fact",
        ],
      } as SceneFrame,
      gmRead: gmReadOverride,
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as { activeTools: string[] };
    expect(generateArgs.activeTools).toContain("list_visible_affordances");
    expect(generateArgs.activeTools).not.toContain(toolName);
    expect(generateArgs.activeTools).not.toContain("log_event");
    expect(generateArgs.activeTools).not.toContain("record_dialogue_outcome");
    expect(generateArgs.activeTools).not.toContain("record_world_fact");
  });

  it("uses an observation-only short profile for broad status-read turns and discards assistant prose", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "The market gate and ledger clerk are visible from here.",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "route:market-gate", label: "Market Gate" },
                    { ref: "actor:ledger-clerk", label: "Ledger Clerk" },
                    { ref: "actor:private-handler" },
                  ],
                  candidates: [
                    { id: "loc-secret-vault" },
                    { summary: "Known safe label" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const statusRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player wants a broad visible status read.",
      sceneQuestion: "What visible people, routes, objects, and options can the player act on?",
      actionInterpretation: {
        intent: "Take stock of visible people, routes, objects, and useful options.",
        targetRefs: [],
      },
      turnIntent: "Take stock of existing visible affordances without creating new scene state.",
      runtimeRequirement: {
        kind: "observation_read",
        categories: ["visible_actors", "visible_objects", "routes", "local_status"],
      },
      narrationGuardrails: ["Narrate only existing visible status and next affordances."],
    };

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I take stock of visible people, routes, objects, and anything useful.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "list_visible_affordances",
          "find_poi_candidates",
          "start_search",
          "create_minor_poi",
          "create_scene_extra",
          "log_event",
        ],
      } as SceneFrame,
      gmRead: statusRead,
      maxOutputTokens: 4_000,
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as {
      tools: Record<string, unknown>;
      activeTools: string[];
      maxOutputTokens: number;
      timeout: { totalMs: number };
      stopWhen: unknown;
      prompt: string;
    };
    expect(Object.keys(generateArgs.tools).sort()).toEqual([
      "find_poi_candidates",
      "list_visible_affordances",
    ]);
    expect(generateArgs.activeTools).toEqual([
      "list_visible_affordances",
      "find_poi_candidates",
    ]);
    expect(generateArgs.maxOutputTokens).toBe(GM_TOOL_LOOP_STATUS_READ_MAX_OUTPUT_TOKENS);
    expect(generateArgs.timeout).toEqual({ totalMs: GM_TOOL_LOOP_STATUS_READ_TIMEOUT_MS });
    expect(Array.isArray(generateArgs.stopWhen)).toBe(true);
    const statusStopWhen = generateArgs.stopWhen as unknown[];
    expect(statusStopWhen[0]).toEqual({ type: "step-count", count: GM_TOOL_LOOP_STATUS_READ_MAX_STEPS });
    expect(statusStopWhen).toHaveLength(2);
    expect(typeof statusStopWhen[1]).toBe("function");
    const successfulObservationStop = statusStopWhen[1] as (input: { steps: unknown[] }) => boolean | PromiseLike<boolean>;
    expect(await Promise.resolve(successfulObservationStop({
      steps: [
        {
          toolCalls: [{ toolName: "list_visible_affordances" }],
          toolResults: [{ output: { success: false, error: "lookup denied" } }],
        },
      ],
    }))).toBe(false);
    expect(await Promise.resolve(successfulObservationStop({
      steps: [
        {
          toolCalls: [{ toolName: "list_visible_affordances" }],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: { affordances: [{ ref: "route:market-gate", label: "Market Gate" }] },
              },
            },
          ],
        },
      ],
    }))).toBe(true);
    expect(generateArgs.prompt).toContain("PROFILE: broad_status_read_observation");
    expect(generateArgs.prompt).toContain("observation-only lookup tools only");
    expect(generateArgs.prompt).toContain("not by materializing a bespoke scene");
    expect(generateArgs.prompt).toContain("try a different allowed observation lookup");
    expect(generateArgs.prompt).toContain(`output exactly ${GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL}`);
    expect(stepCountIs).toHaveBeenCalledWith(GM_TOOL_LOOP_STATUS_READ_MAX_STEPS);
    expect(result.text).toBe("");
    expect(result.observationSummary).toContain("Scene scan:");
    expect(result.observationSummary).toContain("Market Gate");
    expect(result.observationSummary).toContain("Known safe label");
    expect(result.observationSummary).not.toContain("actor:private-handler");
    expect(result.observationSummary).not.toContain("loc-secret-vault");
    expect(result.observationSummary).not.toContain("list_visible_affordances");
    expect(result.observationSummary).not.toContain("affordances");
    expect(result.stepResults).toEqual([
      expect.objectContaining({
        status: "done",
        toolName: "list_visible_affordances",
        mutationRefs: [],
        result: expect.objectContaining({
          kind: "observation",
          observationOnly: true,
        }),
      }),
    ]);
  });

  it("does not require NPC outcome logs for non-conversational status reads with service wording", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "actor:warden", label: "Warden at the pier" },
                    { ref: "item:satchel", label: "Courier satchel" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I take stock of where I am, who is blocking me, what I am carrying, and what ordinary legal options are visible.",
      frame: {
        ...createFrame(),
        allowedTools: ["list_visible_affordances", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary:
          "A visible warden blocks the pier while the final narrator must tell the player what can be seen.",
        sceneQuestion:
          "What visible people, objects, and ordinary legal options can answer the player's status read?",
        actionInterpretation: {
          intent: "Take stock of visible people, objects, and ordinary legal options.",
          targetRefs: [],
        },
        turnIntent:
          "Tell the player which existing visible affordances matter without creating new scene state.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["visible_actors", "visible_objects", "routes", "procedure"],
        },
        narrationGuardrails: [
          "Answer with existing visible status only; do not invent a new NPC reaction.",
        ],
      },
    });

    expect(result.text).toBe("");
    expect(result.observationSummary).toContain("Warden at the pier");
    expect(result.stepResults).toHaveLength(1);
  });

  it("uses typed GM Read runtimeRequirement for observation reads without English regex cues", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [{ toolName: "list_visible_affordances", input: { scope: "visible", maxResults: 6 } }],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [{ ref: "route:market-gate", label: "Market Gate" }],
                },
              },
            },
          ],
        },
      ],
    });

    await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "Я спокойно осматриваюсь и отмечаю, кто рядом и какие пути видны.",
      frame: {
        ...createFrame(),
        allowedTools: ["list_visible_affordances", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player wants a visible local status read.",
        sceneQuestion: "What visible routes and actors are available?",
        actionInterpretation: {
          intent: "observe visible local status",
          targetRefs: [],
        },
        turnIntent: "Read existing visible affordances without creating state.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["visible_actors", "routes"],
        },
      },
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as {
      activeTools: string[];
      prompt: string;
    };
    expect(generateArgs.activeTools).toEqual(["list_visible_affordances"]);
    expect(generateArgs.prompt).toContain("PROFILE: broad_status_read_observation");
    expect(logEventMock).toHaveBeenCalledWith(
      "judge.gm-tool-loop",
      expect.objectContaining({
        profile: "broad_status_read_observation",
        runtimeRequirementKind: "observation_read",
        runtimeRequirementSource: "typed",
      }),
    );
  });

  it("uses a narrow procedural conversation profile for reusable authority answers", async () => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "record_dialogue_outcome",
        input: {
          speakerRef: "Road Warden",
          addresseeRefs: ["Player"],
          outcomeKind: "answered",
          topicKind: "proof",
          authorityKind: "role_authority",
          truthStatus: "speaker_asserted",
          durability: "durable",
          futureUseKind: "permission_check",
          futureRelevance:
            "The named bridge office and failed logbook requirement should guide later permit attempts.",
          summary:
            "The road warden says the courier logbook is not a valid permit and names the bridge office as the place to resolve it.",
          claims: [
            {
              claimKind: "document_status",
              polarity: "denies",
              subjectText: "courier logbook",
              summary: "The courier logbook is not a valid permit.",
            },
            {
              claimKind: "office",
              polarity: "redirects",
              subjectText: "bridge office",
              summary: "The bridge office is the named place to resolve the permit block.",
            },
          ],
          sourceRefs: ["Road Warden", "Player"],
        },
        output: {
          success: true,
          result: {
            eventId: "event-1",
            outcomeKind: "answered",
            topicKind: "proof",
            authorityKind: "role_authority",
            truthStatus: "speaker_asserted",
            speakerRef: "Road Warden",
            durability: "durable",
            persisted: true,
            futureUseKind: "permission_check",
            futureRelevance:
              "The named bridge office and failed logbook requirement should guide later permit attempts.",
          },
        },
      },
    ]);

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I show only the documents I actually have and ask which one fails their permit requirement.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "list_visible_affordances",
          "find_object_candidates",
          "find_actor_candidates",
          "inspect_known_fact",
          "create_scene_extra",
          "add_tag",
          "spawn_npc",
          "record_player_intent",
          "record_dialogue_outcome",
          "log_event",
          "advance_time",
          "offer_quick_actions",
          "reveal_location",
          "move_to",
          "transfer_item",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player asks a visible warden which carried document fails the permit requirement.",
        sceneQuestion: "Which actual document fails the stated proof requirement?",
        actionInterpretation: {
          intent: "Ask the warden to inspect the actual documents against the permit requirement.",
          targetRefs: ["Road Warden"],
        },
        turnIntent:
          "Record the warden's reusable procedural answer about which document fails the requirement.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "proof",
        },
        narrationGuardrails: ["Do not invent player credentials or grant passage."],
      },
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as {
      activeTools: string[];
      maxOutputTokens: number;
      timeout: { totalMs: number };
      stopWhen: unknown;
      prompt: string;
      tools: Record<string, unknown>;
    };
    expect(generateArgs.prompt).toContain("PROFILE: procedural_conversation_outcome");
    expect(generateArgs.prompt).toContain("requested role or authority is not currently visible");
    expect(generateArgs.prompt).toContain("Legal refs for speakerRef, addresseeRefs, and sourceRefs must be copied exactly");
    expect(generateArgs.prompt).toContain("Role or office words from the player action are not refs");
    expect(generateArgs.prompt).toContain("sourceRefs should cite an existing legal ref");
    expect(generateArgs.prompt).toContain("no-answer/unavailable-role outcomes are still procedural outcomes");
    expect(generateArgs.prompt).toContain("Do not mark a reusable procedural outcome scene_local");
    expect(generateArgs.prompt).toContain("do not spend a step recording the player's intent");
    expect(generateArgs.prompt).toContain("Quick actions are not a substitute");
    expect(generateArgs.activeTools).toEqual([
      "list_visible_affordances",
      "find_object_candidates",
      "find_actor_candidates",
      "inspect_known_fact",
      "create_scene_extra",
      "record_dialogue_outcome",
      "advance_time",
    ]);
    expect(Object.keys(generateArgs.tools)).not.toContain("record_player_intent");
    expect(Object.keys(generateArgs.tools)).not.toContain("offer_quick_actions");
    expect(Object.keys(generateArgs.tools)).toContain("create_scene_extra");
    expect(Object.keys(generateArgs.tools)).not.toContain("add_tag");
    expect(Object.keys(generateArgs.tools)).not.toContain("spawn_npc");
    expect(Object.keys(generateArgs.tools)).not.toContain("reveal_location");
    expect(Object.keys(generateArgs.tools)).not.toContain("move_to");
    expect(Object.keys(generateArgs.tools)).not.toContain("transfer_item");
    expect(generateArgs.maxOutputTokens).toBe(GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS);
    expect(generateArgs.timeout).toEqual({
      totalMs: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
    });
    expect(generateArgs.stopWhen).toEqual([
      {
        type: "step-count",
        count: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
      },
      expect.any(Function),
    ]);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.toolName).toBe("record_dialogue_outcome");
  });

  it("opens structural effect tools only when a dialogue outcome requires applied state", async () => {
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "add_tag",
        input: {
          entityName: "Gate Guard",
          entityType: "npc",
          tag: "convinced-by-bluff",
        },
        output: {
          success: true,
          result: {
            entity: "Gate Guard",
            appliedTag: "convinced-by-bluff",
            tags: ["convinced-by-bluff"],
          },
        },
      },
      {
        toolName: "record_dialogue_outcome",
        input: {
          speakerRef: "Gate Guard",
          addresseeRefs: ["Player"],
          outcomeKind: "answered",
          topicKind: "permission",
          authorityKind: "role_authority",
          truthStatus: "settled_by_backend",
          durability: "durable",
          futureUseKind: "permission_check",
          futureRelevance:
            "The guard has accepted the player's bluff and may allow this route attempt.",
          summary: "The guard buys the player's bluff and stops blocking the passage.",
          claims: [
            {
              claimKind: "permission",
              polarity: "allows",
              subjectRef: "Gate Guard",
              summary: "The guard currently treats the player as cleared by the bluff.",
            },
          ],
          stateEffects: [
            {
              effectId: "guard-convinced-by-bluff",
              status: "applied_now",
              stateReceipt: "state_receipt_1_1",
              summary: "The guard now has the convinced-by-bluff state.",
            },
          ],
          sourceRefs: ["Gate Guard", "Player"],
        },
        output: {
          success: true,
          result: {
            eventId: "event-bluff",
            outcomeKind: "answered",
            topicKind: "permission",
            authorityKind: "role_authority",
            truthStatus: "settled_by_backend",
            durability: "durable",
            futureUseKind: "permission_check",
            futureRelevance:
              "The guard has accepted the player's bluff and may allow this route attempt.",
            stateEffects: [
              {
                effectId: "guard-convinced-by-bluff",
                status: "applied_now",
                stateReceipt: "state_receipt_1_1",
                structuralTool: "add_tag",
                targetRef: "Gate Guard",
                stateKey: "tag",
                stateValue: "convinced-by-bluff",
                summary: "The guard now has the convinced-by-bluff state.",
              },
            ],
            persisted: true,
          },
        },
      },
    ]);

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I bluff the guard with a confident fake inspection phrase.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "add_tag",
          "set_relationship",
          "transfer_item",
          "record_dialogue_outcome",
          "log_event",
          "advance_time",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player tries a tone-appropriate bluff on a visible guard.",
        sceneQuestion: "Does the bluff change the guard's immediate permission stance?",
        actionInterpretation: {
          intent: "Bluff the guard into treating the player as cleared.",
          targetRefs: ["Gate Guard"],
        },
        turnIntent: "Record the bluff consequence without making extra paperwork.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "permission",
          requiresStructuralEffect: true,
          effectKinds: ["entity_tag", "relationship_change", "item_transfer"],
        },
      },
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as {
      activeTools: string[];
      tools: Record<string, unknown>;
      prompt: string;
    };
    expect(generateArgs.prompt).toContain("creative or tone-appropriate success");
    expect(generateArgs.activeTools).toEqual([
      "add_tag",
      "set_relationship",
      "transfer_item",
      "record_dialogue_outcome",
      "advance_time",
    ]);
    expect(Object.keys(generateArgs.tools)).toContain("add_tag");
    expect(Object.keys(generateArgs.tools)).toContain("set_relationship");
    expect(Object.keys(generateArgs.tools)).toContain("transfer_item");
    expect(result.stepResults.map((step) => step.toolName)).toEqual([
      "add_tag",
      "record_dialogue_outcome",
    ]);
  });

  it("can create one temporary support responder before recording a structural dialogue outcome", async () => {
    const sceneExtraInput = {
      locationRef: "current_scene",
      role: "clerk",
      name: "Concourse Disputes Clerk",
      tags: ["temporary", "support"],
      reason: "The public holding point plausibly has a clerk who can answer the next-step procedure.",
    };
    const dialogueInput = {
      speakerRef: "support_responder_1",
      addresseeRefs: ["Player"],
      outcomeKind: "redirected",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "next_step",
      futureRelevance:
        "The clerk's next-step redirect constrains where the courier should take the sealed message next.",
      summary: "The disputes clerk redirects the courier to the registry intake desk before the message can move.",
      claims: [
        {
          claimKind: "office",
          polarity: "redirects",
          subjectText: "registry intake desk",
          summary: "The registry intake desk is the official next step for the sealed message.",
        },
      ],
      sourceRefs: ["support_responder_1"],
    };
    createSceneExtraExecuteMock.mockResolvedValueOnce({
      success: true,
      result: {
        id: "actor-concourse-disputes-clerk",
        name: "Concourse Disputes Clerk",
        role: "clerk",
        modelSafeRefs: ["support_responder_1"],
      },
      authority: toolAuthority(["actor:actor-concourse-disputes-clerk:presence"]),
    });
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
      success: true,
        result: {
          eventId: "event-support-responder-dialogue",
        speakerRef: "support_responder_1",
        outcomeKind: "redirected",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        persisted: true,
        futureUseKind: "next_step",
        futureRelevance:
          "The clerk's next-step redirect constrains where the courier should take the sealed message next.",
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      activeTools: string[];
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      expect(options.activeTools).toContain("create_scene_extra");
      const sceneExtraResult = await options.tools.create_scene_extra!.execute(sceneExtraInput);
      const dialogueResult = await options.tools.record_dialogue_outcome!.execute(dialogueInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "create_scene_extra", input: sceneExtraInput }],
            toolResults: [{ output: sceneExtraResult }],
          },
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: dialogueInput }],
            toolResults: [{ output: dialogueResult }],
          },
        ],
      };
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "At the office or holding point, I report the block and ask for the official next step for my sealed message.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "list_visible_affordances",
          "find_actor_candidates",
          "inspect_known_fact",
          "create_scene_extra",
          "spawn_npc",
          "record_dialogue_outcome",
          "advance_time",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The courier asks for an official next step at a public holding point.",
        sceneQuestion: "Which ordinary current-scene responder can give the next procedural step?",
        actionInterpretation: {
          intent: "report the block and ask for the next official step",
          targetRefs: [],
        },
        turnIntent:
          "Resolve a plausible current-scene support responder and record their next-step answer or redirect.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "procedure",
        },
      },
    });

    expect(createSceneExtraExecuteMock).toHaveBeenCalledWith(sceneExtraInput);
    expect(recordDialogueOutcomeExecuteMock).toHaveBeenCalledWith(dialogueInput);
    expect(result.stepResults.map((step) => step.toolName)).toEqual([
      "create_scene_extra",
      "record_dialogue_outcome",
    ]);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("rolls back the GM mutation boundary when a structural pre-tool is not backed by a terminal receipt", async () => {
    const addTagInput = {
      entityName: "Gate Guard",
      entityType: "npc",
      tag: "convinced-by-bluff",
    };
    addTagExecuteMock.mockResolvedValueOnce({
      success: true,
      result: { entity: "Gate Guard", tags: ["convinced-by-bluff"] },
    });
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const addTagResult = await options.tools.add_tag!.execute(addTagInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "add_tag", input: addTagInput }],
            toolResults: [{ output: addTagResult }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I bluff the guard and wait for their response.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player bluffs a visible guard.",
        sceneQuestion: "Does the bluff change the guard's state?",
        actionInterpretation: {
          intent: "Bluff the guard into treating the player as cleared.",
          targetRefs: ["Gate Guard"],
        },
        turnIntent: "Record the bluff result.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "permission",
          requiresStructuralEffect: true,
          effectKind: "entity_tag",
        },
      },
    })).rejects.toThrow("without a structural record_dialogue_outcome");

    expect(addTagExecuteMock).toHaveBeenCalledWith(addTagInput);
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("rolls back role-only create_scene_extra refs before leaving the GM tool loop", async () => {
    const sceneExtraInput = {
      locationRef: "current_scene",
      role: "clerk",
      name: "Concourse Disputes Clerk",
      tags: ["temporary", "support"],
      reason: "A local support responder is needed.",
    };
    const dialogueInput = {
      speakerRef: "clerk",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The answer controls the next route choice.",
      summary: "A clerk points the player toward the north queue.",
      claims: [
        {
          claimKind: "requirement",
          polarity: "states",
          subjectText: "north queue",
          summary: "The north queue handles stamped-copy disputes.",
        },
      ],
      sourceRefs: ["clerk"],
    };
    createSceneExtraExecuteMock.mockResolvedValueOnce({
      success: true,
      result: {
        id: "actor-concourse-disputes-clerk",
        name: "Concourse Disputes Clerk",
        role: "clerk",
      },
      authority: toolAuthority(["actor:actor-concourse-disputes-clerk:presence"]),
    });
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
      success: true,
      result: {
        eventId: "event-role-only-clerk",
        speakerRef: "clerk",
        outcomeKind: "answered",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "route_choice",
        futureRelevance: "The answer controls the next route choice.",
        persisted: true,
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const sceneExtraResult = await options.tools.create_scene_extra!.execute(sceneExtraInput);
      const dialogueResult = await options.tools.record_dialogue_outcome!.execute(dialogueInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "create_scene_extra", input: sceneExtraInput }],
            toolResults: [{ output: sceneExtraResult }],
          },
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: dialogueInput }],
            toolResults: [{ output: dialogueResult }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask whether someone here can tell me the correct queue.",
      frame: {
        ...createFrame(),
        allowedTools: ["create_scene_extra", "record_dialogue_outcome"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player asks for an ordinary support responder.",
        sceneQuestion: "Who can answer the queue procedure?",
        actionInterpretation: { intent: "ask for the correct queue", targetRefs: [] },
        turnIntent: "Create a support responder and record the answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "procedure",
        },
      },
    })).rejects.toThrow("before transaction commit");

    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("rolls back structural mutations followed only by a typed refusal", async () => {
    const addTagInput = {
      entityName: "Gate Guard",
      entityType: "npc",
      tag: "convinced-by-bluff",
    };
    const refusalInput = {
      speakerRef: "Gate Guard",
      addresseeRefs: ["Player"],
      outcomeKind: "refused",
      topicKind: "permission",
      authorityKind: "role_authority",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance: "The refusal means the player still needs proof before passing.",
      summary: "The guard refuses the bluff and still requires proof.",
      claims: [
        {
          claimKind: "permission",
          polarity: "denies",
          subjectText: "Player passage",
          summary: "The player is not cleared to pass.",
        },
      ],
      stateEffects: [],
      sourceRefs: ["Gate Guard"],
    };
    addTagExecuteMock.mockResolvedValueOnce({
      success: true,
      result: { entity: "Gate Guard", tags: ["convinced-by-bluff"] },
      authority: toolAuthority(["actor:gate-guard:tags"]),
    });
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
      success: true,
      result: {
        eventId: "event-refused-after-tag",
        outcomeKind: "refused",
        topicKind: "permission",
        authorityKind: "role_authority",
        truthStatus: "settled_by_backend",
        durability: "durable",
        futureUseKind: "permission_check",
        futureRelevance: "The refusal means the player still needs proof before passing.",
        stateEffects: [],
        persisted: true,
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const addTagResult = await options.tools.add_tag!.execute(addTagInput);
      const dialogueResult = await options.tools.record_dialogue_outcome!.execute(refusalInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "add_tag", input: addTagInput }],
            toolResults: [{ output: addTagResult }],
          },
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: refusalInput }],
            toolResults: [{ output: dialogueResult }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I bluff the guard.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player bluffs a visible guard.",
        sceneQuestion: "Does the bluff change the guard's immediate permission stance?",
        actionInterpretation: { intent: "bluff the guard", targetRefs: ["Gate Guard"] },
        turnIntent: "Record the guard's answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "permission",
          requiresStructuralEffect: true,
          effectKind: "entity_tag",
        },
      },
    })).rejects.toThrow("before transaction commit");

    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("rolls back when the mutation boundary tracked a side effect missing from parsed SDK steps", async () => {
    const trackedInput = { entityName: "Gate Guard", entityType: "npc", tag: "tracked-only" };
    const parsedInput = { entityName: "Gate Guard", entityType: "npc", tag: "parsed-only" };
    addTagExecuteMock.mockResolvedValueOnce({
      success: true,
      result: { entity: "Gate Guard", tags: ["tracked-only"] },
      authority: toolAuthority(["actor:gate-guard:tags"], "tool-result-tracked"),
    });
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      await options.tools.add_tag!.execute(trackedInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "add_tag", input: parsedInput }],
            toolResults: [{
              output: {
                success: true,
                result: { entity: "Gate Guard", tags: ["parsed-only"] },
                authority: toolAuthority(["actor:gate-guard:tags"], "tool-result-parsed"),
              },
            }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I change the guard's local state.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Apply a concrete state mutation.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "entity_tag" },
      },
    })).rejects.toThrow("tracked successful authority-bearing execution");

    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("rejects parsed successful authority-bearing SDK steps that never executed inside the mutation boundary", async () => {
    const parsedInput = { entityName: "Gate Guard", entityType: "npc", tag: "parsed-only" };
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [{ toolName: "add_tag", input: parsedInput }],
          toolResults: [{
            output: {
              success: true,
              result: { entity: "Gate Guard", tags: ["parsed-only"] },
              authority: toolAuthority(["actor:gate-guard:tags"]),
            },
          }],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I change the guard's local state.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Apply a concrete state mutation.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "entity_tag" },
      },
    })).rejects.toThrow("parsed successful authority-bearing result");

    expect(addTagExecuteMock).not.toHaveBeenCalled();
    expect(sqliteExecMock).not.toHaveBeenCalled();
  });

  it("retracts durable tracked memory even when parsed SDK steps omit it from a nonempty step list", async () => {
    const dialogueInput = {
      speakerRef: "Gate Guard",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "permission",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "permission_check",
      futureRelevance: "The answer should be retracted if the tool loop cannot commit.",
      summary: "The guard gives a permission answer.",
      sourceRefs: ["Gate Guard"],
    };
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
      success: true,
      status: "success",
      result: {
        eventId: "event-tracked-durable-omitted",
        outcomeKind: "answered",
        topicKind: "permission",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        persisted: true,
        futureUseKind: "permission_check",
        futureRelevance: "The answer should be retracted if the tool loop cannot commit.",
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      await options.tools.record_dialogue_outcome!.execute(dialogueInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [
              {
                toolName: "add_tag",
                input: { entityName: "Gate Guard", entityType: "npc", tag: "parsed-only" },
              },
            ],
            toolResults: [{
              output: {
                success: true,
                result: { entity: "Gate Guard", tags: ["parsed-only"] },
              },
            }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the guard whether my permit works.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player asks a visible guard about permission.",
        sceneQuestion: "Does the guard's answer become durable permission context?",
        actionInterpretation: { intent: "ask about permit", targetRefs: ["Gate Guard"] },
        turnIntent: "Record the guard's durable answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "permission",
        },
      },
    })).rejects.toThrow("without a structural record_dialogue_outcome");

    expect(retractStoredEpisodicEventMock).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      eventId: "event-tracked-durable-omitted",
    });
    expect(retractReflectionBudgetMock).toHaveBeenCalledWith(
      "campaign-1",
      ["Gate Guard", "Player"],
      5,
    );
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("retracts durable record_world_fact memory when the tool loop is rejected", async () => {
    const worldFactInput = {
      sourceKind: "comparison",
      truthStatus: "disputed",
      factKind: "contradiction",
      topicKind: "procedure",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The disputed office-route mismatch should be retracted if the loop fails.",
      summary: "The route notice and office instruction disagree.",
      subjectRefs: ["Player"],
      sourceRefs: ["Player", "Market Notice"],
    };
    recordWorldFactExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_world_fact",
      {
      success: true,
      status: "success",
      result: {
        eventId: "event-world-fact-rejected",
        factRef: "Knowledge:knowledge-rejected",
        factKind: "contradiction",
        topicKind: "procedure",
        truthStatus: "disputed",
        durability: "durable",
        persisted: true,
        subjectRefs: ["Player"],
        sourceRefs: ["Player", "Market Notice"],
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const worldFactOutput = await options.tools.record_world_fact!.execute(worldFactInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [
              {
                toolName: "record_world_fact",
                input: worldFactInput,
              },
            ],
            toolResults: [{
              output: worldFactOutput,
            }],
          },
          {
            toolCalls: [
              {
                toolName: "add_tag",
                input: { entityName: "Player", entityType: "player", tag: "parsed-only-world-fact-rejection" },
              },
            ],
            toolResults: [{
              output: {
                success: true,
                result: { entity: "Player", tags: ["parsed-only-world-fact-rejection"] },
              },
            }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I compare the route notice against the office instruction.",
      frame: {
        ...createFrame(),
        allowedTools: ["inspect_known_fact", "record_world_fact"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player compares a route notice with prior office guidance.",
        sceneQuestion: "What disputed procedure fact should future choices remember?",
        actionInterpretation: { intent: "compare route procedure sources", targetRefs: [] },
        turnIntent: "Record the disputed procedure fact.",
        runtimeRequirement: {
          kind: "world_fact",
          durability: "durable",
          topicKind: "procedure",
        },
      },
    })).rejects.toThrow("parsed successful authority-bearing result");

    expect(retractActorKnowledgeRecordMock).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      factRef: "Knowledge:knowledge-rejected",
      reason: "rejected_gm_tool_loop",
    });
    expect(retractStoredEpisodicEventMock).not.toHaveBeenCalledWith({
      campaignId: "campaign-1",
      eventId: "event-world-fact-rejected",
    });
    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("rolls back when a side-effecting tool returns a malformed non-ToolResult inside the boundary", async () => {
    addTagExecuteMock.mockResolvedValueOnce("not-a-tool-result");
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
      success: true,
      result: {
        eventId: "event-after-malformed-tool",
        outcomeKind: "refused",
        topicKind: "permission",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        persisted: true,
        futureUseKind: "permission_check",
        futureRelevance: "The refusal should not commit after malformed prior tool execution.",
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const addTagInput = { entityName: "Gate Guard", entityType: "npc", tag: "malformed" };
      const dialogueInput = {
        speakerRef: "Gate Guard",
        addresseeRefs: ["Player"],
        outcomeKind: "refused",
        topicKind: "permission",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "permission_check",
        futureRelevance: "The refusal should not commit after malformed prior tool execution.",
        summary: "The guard refuses after the attempted state change malforms.",
        sourceRefs: ["Gate Guard"],
      };
      const addTagResult = await options.tools.add_tag!.execute(addTagInput);
      const dialogueResult = await options.tools.record_dialogue_outcome!.execute(dialogueInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "add_tag", input: addTagInput }],
            toolResults: [{ output: addTagResult }],
          },
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: dialogueInput }],
            toolResults: [{ output: dialogueResult }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I try a risky bluff at the gate.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player tries a risky bluff at the gate.",
        sceneQuestion: "Does the bluff settle anything?",
        actionInterpretation: { intent: "try a risky bluff", targetRefs: ["Gate Guard"] },
        turnIntent: "Record the guard's answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "permission",
          requiresStructuralEffect: true,
          effectKind: "entity_tag",
        },
      },
    })).rejects.toThrow("mutation boundary cannot commit after malformed");

    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("taints the mutation boundary when an inner source-boundary guard converts a malformed tool result", async () => {
    advanceTimeExecuteMock.mockResolvedValueOnce("not-a-tool-result");
    moveActorExecuteMock.mockResolvedValueOnce({
      success: true,
      status: "success",
      result: {
        kind: "move_actor",
        actorRef: "Player",
        destinationRef: "Back Room",
        locationId: "loc-back-room",
        locationName: "Back Room",
      },
      authority: toolAuthority(["actor:actor-player:location"]),
    });
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const timeInput = { minutes: 1, reason: "The bluff creates a brief opening." };
      const moveInput = { actorRef: "Player", destinationRef: "Back Room" };
      const timeResult = await options.tools.advance_time!.execute(timeInput);
      const moveResult = await options.tools.move_actor!.execute(moveInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "advance_time", input: timeInput }],
            toolResults: [{ output: timeResult }],
          },
          {
            toolCalls: [{ toolName: "move_actor", input: moveInput }],
            toolResults: [{ output: moveResult }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I bluff and then slip into the back room.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time", "move_actor"],
      } as SceneFrame,
      scopedForecastExcerpt: {
        version: "scoped-forecast-excerpt.v1",
        baseTick: 7,
        promptReady: true,
        entries: [],
        forbiddenPrivateTerms: ["sealed-order"],
      } as never,
      gmRead: {
        ...gmRead,
        situationSummary: "The player uses a visible bluff to move to the back room.",
        sceneQuestion: "Does the player change location?",
        actionInterpretation: { intent: "move after bluff", targetRefs: ["Back Room"] },
        turnIntent: "Apply the location change.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      },
    })).rejects.toThrow("mutation boundary cannot commit after malformed");

    expect(sqliteExecMock.mock.calls.map(([statement]) => statement)).toEqual([
      expect.stringMatching(/^SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^ROLLBACK TO SAVEPOINT gm_tool_loop_receipt_/),
      expect.stringMatching(/^RELEASE SAVEPOINT gm_tool_loop_receipt_/),
    ]);
  });

  it("uses typed GM Read runtimeRequirement for dialogue outcomes without English regex cues", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Road Warden",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "permission",
                authorityKind: "role_authority",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "permission_check",
                futureRelevance: "The answer constrains later attempts to send a dispatch message.",
                summary: "The road warden refuses permission to send a dispatch message from the checkpoint.",
                claims: [
                  {
                    claimKind: "permission",
                    polarity: "denies",
                    subjectText: "dispatch message",
                    summary: "The player may not send a dispatch message from here.",
                  },
                ],
                sourceRefs: ["Road Warden"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-typed-dialogue",
                  outcomeKind: "answered",
                  topicKind: "permission",
                  authorityKind: "role_authority",
                  truthStatus: "speaker_asserted",
                  durability: "durable",
                  persisted: true,
                  futureUseKind: "permission_check",
                  futureRelevance: "The answer constrains later attempts to send a dispatch message.",
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "Я вежливо уточняю, можно ли отправить сообщение диспетчеру, оставаясь на месте.",
      frame: {
        ...createFrame(),
        allowedTools: ["list_visible_affordances", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player asks a visible authority about dispatch permission.",
        sceneQuestion: "What permission boundary does the authority state?",
        actionInterpretation: {
          intent: "ask whether a dispatch message is allowed",
          targetRefs: ["Road Warden"],
        },
        turnIntent: "Record the authority's permission answer as reusable procedure.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "permission",
        },
      },
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as { activeTools: string[]; prompt: string };
    expect(generateArgs.prompt).toContain("PROFILE: procedural_conversation_outcome");
    expect(generateArgs.activeTools).toEqual([
      "list_visible_affordances",
      "record_dialogue_outcome",
    ]);
    expect(result.stepResults[0]?.toolName).toBe("record_dialogue_outcome");
    expect(logEventMock).toHaveBeenCalledWith(
      "judge.gm-tool-loop",
      expect.objectContaining({
        profile: "procedural_conversation_outcome",
        runtimeRequirementKind: "dialogue_outcome",
        runtimeRequirementSource: "typed",
      }),
    );
  });

  it("uses a narrow world-fact profile and requires structural record_world_fact", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_world_fact",
              input: {
                sourceKind: "comparison",
                truthStatus: "disputed",
                factKind: "contradiction",
                topicKind: "procedure",
                durability: "durable",
                futureUseKind: "route_choice",
                futureRelevance:
                  "The unresolved mismatch should guide which office the player asks before choosing a route.",
                summary:
                  "The posted date and the route log do not currently agree; treat the mismatch as unresolved.",
                claims: [
                  {
                    claimKind: "contradiction",
                    polarity: "unknown",
                    subjectText: "posted date vs route log",
                    summary: "The date mismatch is unresolved.",
                  },
                ],
                subjectRefs: ["Player"],
                sourceRefs: ["Player"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  knowledgeId: "knowledge-1",
                  factRef: "knowledge:knowledge-1",
                  factKind: "contradiction",
                  topicKind: "procedure",
                  truthStatus: "disputed",
                  durability: "durable",
                  persisted: true,
                  futureUseKind: "route_choice",
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 27,
      playerAction:
        "I compare the engineer's warning with what the debt clerk said, marking contradictions as uncertainty rather than conspiracy.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "inspect_known_fact",
          "list_visible_affordances",
          "find_object_candidates",
          "find_actor_candidates",
          "find_location_candidates",
          "record_player_intent",
          "record_world_fact",
          "log_event",
          "advance_time",
          "offer_quick_actions",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player compares two prior procedural claims before choosing a route.",
        sceneQuestion:
          "What grounded contradiction or uncertainty should future route choices remember?",
        actionInterpretation: {
          intent: "compare prior procedural warnings and clerk statements",
          targetRefs: [],
        },
        turnIntent:
          "Ground and record the comparison or uncertainty between prior official warnings so future route choices can use it.",
        runtimeRequirement: {
          kind: "world_fact",
          durability: "durable",
          topicKind: "procedure",
        },
        narrationGuardrails: [
          "Do not invent a conspiracy; record uncertainty only where grounded facts conflict.",
        ],
      },
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as {
      activeTools: string[];
      prompt: string;
    };
    expect(generateArgs.prompt).toContain("PROFILE: world_fact_recording");
    expect(generateArgs.prompt).toContain("Do not use log_event, record_dialogue_outcome, or final assistant prose");
    expect(generateArgs.prompt).toContain("current.currentScene.ref/current.currentLocation.ref");
    expect(generateArgs.prompt).toContain("claims[].subjectRef must be visible/current refs");
    expect(generateArgs.prompt).toContain("put it in claims[].subjectText/summary");
    expect(generateArgs.activeTools).toEqual([
      "inspect_known_fact",
      "list_visible_affordances",
      "find_object_candidates",
      "find_actor_candidates",
      "find_location_candidates",
      "record_world_fact",
      "advance_time",
    ]);
    expect(result.stepResults[0]?.toolName).toBe("record_world_fact");
  });

  it("fails before model calls when a required world_fact terminal tool is unavailable", async () => {
    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 27,
      playerAction: "I compare prior procedural warnings and clerk statements.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "inspect_known_fact",
          "list_visible_affordances",
          "find_actor_candidates",
          "advance_time",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        runtimeRequirement: {
          kind: "world_fact",
          durability: "durable",
          topicKind: "procedure",
        },
      },
    })).rejects.toThrow(
      "runtimeRequirement world_fact has no active receipt-capable tool",
    );

    expect(generateText).not.toHaveBeenCalled();
  });

  it("rejects world facts that do not match GM Read required topicKind", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_world_fact",
              input: {
                sourceKind: "comparison",
                truthStatus: "disputed",
                factKind: "status",
                topicKind: "social",
                durability: "durable",
                futureUseKind: "npc_memory",
                futureRelevance:
                  "This social memory does not settle the required procedure comparison.",
                summary: "The clerk sounded worried.",
                claims: [
                  {
                    claimKind: "status",
                    polarity: "states",
                    subjectText: "clerk worry",
                    summary: "The clerk sounded worried.",
                  },
                ],
                subjectRefs: ["Player"],
                sourceRefs: ["Player"],
              },
            },
          ],
          toolResults: [
            {
              output: withTerminalTestAuthority("record_world_fact", {
                success: true,
                result: {
                  knowledgeId: "knowledge-1",
                  factKind: "status",
                  topicKind: "social",
                  truthStatus: "disputed",
                  durability: "durable",
                  persisted: true,
                  futureUseKind: "npc_memory",
                },
              }),
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 27,
      playerAction:
        "I compare the posted procedure against my route log.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "inspect_known_fact",
          "list_visible_affordances",
          "find_object_candidates",
          "find_actor_candidates",
          "find_location_candidates",
          "record_world_fact",
          "advance_time",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Record the procedural comparison.",
        runtimeRequirement: {
          kind: "world_fact",
          durability: "durable",
          topicKind: "procedure",
        },
      },
    })).rejects.toThrow("matching topicKind procedure");
  });

  it("keeps describe/status-read loops open after a failed observation and accepts a later successful lookup", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "inspect_known_fact",
              input: { query: "physically unsafe fault residue", scope: "known" },
            },
          ],
          toolResults: [
            {
              output: {
                success: false,
                error: "No known fact matched the visible query.",
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "exit:underpass", label: "Underpass Exit" },
                    { ref: "actor:witness", label: "Phone Witness" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const statusRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player describes the fault in ordinary visible terms.",
      sceneQuestion:
        "What sound, smell, temperature, visible residue, crowd behavior, and physical danger can be read from the current scene?",
      actionInterpretation: {
        intent:
          "Describe visible fault signs, crowd behavior, and what seems physically unsafe without changing state.",
        targetRefs: [],
      },
      turnIntent: "Ground a broad visible safety read with existing observations.",
      runtimeRequirement: {
        kind: "observation_read",
        categories: ["hazards", "crowd", "local_status"],
      },
    };

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I describe the fault in ordinary terms first: sound, smell, temperature, visible residue, crowd behavior, and what seems physically unsafe.",
      frame: {
        ...createFrame(),
        allowedTools: ["inspect_known_fact", "list_visible_affordances", "log_event"],
      } as SceneFrame,
      gmRead: statusRead,
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as {
      activeTools: string[];
      prompt: string;
    };
    expect(generateArgs.prompt).toContain("PROFILE: broad_status_read_observation");
    expect(generateArgs.activeTools).toEqual(["inspect_known_fact", "list_visible_affordances"]);
    expect(result.text).toBe("");
    expect(result.observationSummary).toContain("Scene scan:");
    expect(result.observationSummary).toContain("Underpass Exit");
    expect(result.observationSummary).not.toContain("list_visible_affordances");
    expect(result.observationSummary).not.toContain("affordances");
    expect(result.stepResults.map((step) => step.result?.success)).toEqual([false, true]);
  });

  it("discards broad status-read prose once observation succeeds", async () => {
    generateTextMock().mockResolvedValueOnce({
      text:
        "Route guidance: the visible market gate and ledger clerk are ordinary legal options for the next move.",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "route:market-gate", label: "Market Gate" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I take stock of visible people, routes, objects, and anything useful.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "list_visible_affordances",
          "find_poi_candidates",
          "start_search",
          "create_minor_poi",
          "create_scene_extra",
          "log_event",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player wants a broad visible status read.",
        sceneQuestion: "What visible people, routes, objects, and options can the player act on?",
        actionInterpretation: {
          intent: "Take stock of visible people, routes, objects, and useful options.",
          targetRefs: [],
        },
        turnIntent: "Take stock of existing visible affordances without creating new scene state.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["visible_actors", "visible_objects", "routes", "local_status"],
        },
      },
    });

    expect(result.text).toBe("");
    expect(result.observationSummary).toContain("Market Gate");
  });

  it("still rejects future-relevant text backed only by observation tools outside the broad status-read profile", async () => {
    generateTextMock().mockResolvedValueOnce({
      text:
        "Route guidance: a recessed maintenance-like door opens onto a narrow stair and iron-banded door.",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "route:service-stair", label: "Narrow Service Stair" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I follow the route guidance through the recessed door.",
      frame: {
        ...createFrame(),
        allowedTools: ["list_visible_affordances", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player follows concrete route guidance.",
        sceneQuestion: "Does this movement expose a persistent route?",
        turnIntent: "Resolve the concrete route interaction.",
      },
    })).rejects.toThrow("without an accepted scene beat or state mutation receipt");
  });

  it("requires conversational tool-plan turns to create a visible NPC outcome log event", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Counter Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "social",
                authorityKind: "witness",
                truthStatus: "speaker_asserted",
                durability: "scene_local",
                summary: "The counter clerk says the awning makes the rain sound louder at this counter.",
                sourceRefs: ["Counter Clerk", "Player"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  text: "The counter clerk replies that the awning makes the rain sound louder at this counter.",
                  outcomeKind: "answered",
                  topicKind: "social",
                  authorityKind: "witness",
                  truthStatus: "speaker_asserted",
                  durability: "scene_local",
                  persisted: false,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a service worker for local color.",
      sceneQuestion: "What does the worker answer or refuse to answer?",
      actionInterpretation: {
        intent: "Ask the counter clerk whether the rain is always this loud.",
        targetRefs: ["Counter Clerk"],
      },
      turnIntent: "Resolve the worker's immediate visible answer or refusal.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "scene_local",
        topicKind: "social",
      },
    };

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the counter clerk whether the rain is always this loud.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    });

    const generateArgs = generateTextMock().mock.calls[0]?.[0] as { prompt: string };
    expect(generateArgs.prompt).toContain("CONVERSATION COMPLETION");
    expect(generateArgs.prompt).toContain("do not stop after only create_scene_extra");
    expect(generateArgs.prompt).toContain("structurally records the NPC/source answer");
    expect(result.stepResults).toEqual([
      expect.objectContaining({
        status: "done",
        toolName: "record_dialogue_outcome",
      }),
    ]);
  });

  it("requires reusable procedural NPC answers to be durable future-relevant dialogue outcomes", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Lead Warden",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "role_authority",
                truthStatus: "speaker_asserted",
                durability: "scene_local",
                summary:
                  "The Lead Warden says Mira needs a seal-verified transit chit, guild waiver, or signal-house dispatch authorisation stamped within twelve hours.",
                sourceRefs: ["Lead Warden", "Player"],
              },
            },
          ],
          toolResults: [
            {
              output: withTerminalTestAuthority("record_dialogue_outcome", {
                success: true,
                result: {
                  text:
                    "The Lead Warden answers that Mira needs a seal-verified transit chit, guild waiver, or signal-house dispatch authorisation stamped within twelve hours.",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "role_authority",
                  truthStatus: "speaker_asserted",
                  durability: "scene_local",
                  persisted: false,
                },
              }),
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a visible authority what proof is required.",
      sceneQuestion: "What proof does the Lead Warden require before letting the courier proceed?",
      actionInterpretation: {
        intent: "Ask the Lead Warden what specific proof is required.",
        targetRefs: ["Lead Warden"],
      },
      turnIntent: "Resolve and record the authority's procedural answer.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask the nearest visible authority what specific proof they require, without arguing or inventing status.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("reusable procedural conversation");
  });

  it("accepts reusable procedural NPC answers when the outcome is durable and future-relevant", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Lead Warden",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "role_authority",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "permission_check",
                futureRelevance:
                  "The required proof controls whether Mira can pass this checkpoint on later turns.",
                summary:
                  "The Lead Warden says Mira needs a seal-verified transit chit, guild waiver, or signal-house dispatch authorisation stamped within twelve hours and clarifies that commercial routing ciphers are insufficient.",
                claims: [
                  {
                    claimKind: "requirement",
                    polarity: "requires",
                    subjectText: "seal-verified transit chit, guild waiver, or signal-house dispatch authorisation",
                    summary: "One of the named current proofs is required.",
                  },
                  {
                    claimKind: "document_status",
                    polarity: "denies",
                    subjectText: "commercial routing ciphers",
                    summary: "Commercial routing ciphers are insufficient proof.",
                  },
                ],
                sourceRefs: ["Lead Warden", "Player"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-proof-required",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "role_authority",
                  truthStatus: "speaker_asserted",
                  speakerRef: "Lead Warden",
                  durability: "durable",
                  futureUseKind: "permission_check",
                  futureRelevance:
                    "The required proof controls whether Mira can pass this checkpoint on later turns.",
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a visible authority what proof is required.",
      sceneQuestion: "What proof does the Lead Warden require before letting the courier proceed?",
      actionInterpretation: {
        intent: "Ask the Lead Warden what specific proof is required.",
        targetRefs: ["Lead Warden"],
      },
      turnIntent: "Resolve and record the authority's procedural answer.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask the nearest visible authority what specific proof they require, without arguing or inventing status.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [expect.objectContaining({ toolName: "record_dialogue_outcome" })],
    });
  });

  it("rejects applied_now dialogue stateEffects without a prior matching structural mutation", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance:
                  "The Routing Stamp on the sealed writ is proof for later Bureau filing.",
                quote:
                  "Routing Stamp applied; this stamp is sufficient proof for substitute-bond filing.",
                summary:
                  "The clerk applies the Routing Stamp to the sealed writ and confirms it is sufficient proof for Bureau filing.",
                claims: [
                  {
                    claimKind: "document_status",
                    polarity: "states",
                    subjectRef: "item:sealed-writ",
                    subjectText: "Sealed Writ",
                    summary:
                      "A Routing Stamp has been applied to the sealed writ.",
                  },
                ],
                stateEffects: [
                  {
                    effectId: "routing-stamp-on-writ",
                    status: "applied_now",
                    structuralTool: "add_tag",
                    targetRef: "item:sealed-writ",
                    stateKey: "document_status",
                    stateValue: "routing-stamped",
                    summary: "The sealed writ now has the routing-stamped tag.",
                  },
                ],
                sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-routing-stamp",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance:
                    "The Routing Stamp on the sealed writ is proof for later Bureau filing.",
                  stateEffects: [
                    {
                      effectId: "routing-stamp-on-writ",
                      status: "applied_now",
                      structuralTool: "add_tag",
                      targetRef: "item:sealed-writ",
                      stateKey: "document_status",
                      stateValue: "routing-stamped",
                      summary: "The sealed writ now has the routing-stamped tag.",
                    },
                  ],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a court clerk to apply a routing stamp to a sealed writ.",
      sceneQuestion: "Does the court clerk apply a durable proof state to the item?",
      actionInterpretation: {
        intent: "Request exterior inspection and routing stamp.",
        targetRefs: ["Court Routing Clerk", "item:sealed-writ"],
      },
      turnIntent: "Record the stamp outcome and item state.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("applied_now stateEffect without a prior matching structural state tool");
    expect(retractStoredEpisodicEventMock).toHaveBeenCalledWith({
      campaignId: "campaign-1",
      eventId: "event-routing-stamp",
    });
    expect(retractReflectionBudgetMock).toHaveBeenCalledWith(
      "campaign-1",
      ["Court Routing Clerk", "Player", "item:sealed-writ"],
      5,
    );
  });

  it.each([
    {
      label: "roll_oracle with no typed requirement",
      allowedTools: ["record_dialogue_outcome", "log_event"] as const,
      gmReadOverride: {
        ...gmRead,
        path: "roll_oracle",
        rollRequest: {
          actorRef: "actor-player",
          question: "Does the clerk stamp the writ?",
          stakes: "Whether the item gains a durable proof state.",
          evidenceRefs: ["actor-player"],
        },
        runtimeRequirement: { kind: "none" },
      } as Extract<GmRead, { path: "roll_oracle" }>,
    },
  ])("blocks terminal dialogue stateEffects on non-tool_plan default profile for $label", async ({
    allowedTools,
    gmReadOverride,
  }) => {
    const dialogueInput = {
      speakerRef: "Court Routing Clerk",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "proof",
      authorityKind: "public_service",
      truthStatus: "settled_by_backend",
      durability: "scene_local",
      summary: "The clerk says the writ has been stamped, but no structural tool ran.",
      stateEffects: [
        {
          effectId: "routing-stamp-on-writ",
          status: "applied_now",
          structuralTool: "add_tag",
          targetRef: "item:sealed-writ",
          stateKey: "tag",
          stateValue: "routing-stamped",
        },
      ],
      sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
    };
    mockGenerateTextExecutingToolCalls([
      {
        toolName: "record_dialogue_outcome",
        input: dialogueInput,
        output: {
          success: true,
          result: {
            eventId: "event-unbacked-applied-now",
            outcomeKind: "answered",
            topicKind: "proof",
            authorityKind: "public_service",
            truthStatus: "settled_by_backend",
            durability: "scene_local",
            persisted: false,
            stateEffects: dialogueInput.stateEffects,
          },
        },
      },
    ]);

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: [...allowedTools],
      } as SceneFrame,
      gmRead: gmReadOverride,
    })).rejects.toThrow("profile default_runtime_execution exposes no allowed runtime tools");

    expect(recordDialogueOutcomeExecuteMock).not.toHaveBeenCalled();
  });

  it("rejects applied_now dialogue stateEffects before scene_beat receipt acceptance", async () => {
    const logInput = {
      text: "The clerk interaction remains local.",
      durability: "scene_local",
    };
    const dialogueInput = {
      speakerRef: "Court Routing Clerk",
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "proof",
      authorityKind: "public_service",
      truthStatus: "settled_by_backend",
      durability: "scene_local",
      summary: "The clerk says the writ has been stamped, but no structural tool ran.",
      stateEffects: [
        {
          effectId: "routing-stamp-on-writ",
          status: "applied_now",
          structuralTool: "add_tag",
          targetRef: "item:sealed-writ",
          stateKey: "tag",
          stateValue: "routing-stamped",
        },
      ],
      sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
    };
    logEventExecuteMock.mockResolvedValueOnce({
      success: true,
      result: { durability: "scene_local", persisted: false },
      authority: toolAuthority(["scene_local_observation"], "tool-result-scene-local-log-event"),
    });
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const logOutput = await options.tools.log_event!.execute(logInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "log_event", input: logInput }],
            toolResults: [{ output: logOutput }],
          },
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: dialogueInput }],
            toolResults: [{
              output: {
                success: true,
                result: {
                  eventId: "event-unbacked-scene-beat-applied-now",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "scene_local",
                  persisted: false,
                  stateEffects: dialogueInput.stateEffects,
                },
              },
            }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player asks a court clerk to apply a routing stamp to a sealed writ.",
        sceneQuestion: "Does the scene beat apply item state?",
        turnIntent: "Record the immediate scene beat.",
        runtimeRequirement: { kind: "scene_beat", durability: "scene_local", beatKind: "event_log" },
      },
    })).rejects.toThrow("applied_now stateEffect without a prior matching structural state tool");

    expect(logEventExecuteMock).toHaveBeenCalledTimes(1);
    expect(recordDialogueOutcomeExecuteMock).not.toHaveBeenCalled();
  });

  it("accepts applied_now dialogue stateEffects with a prior matching structural mutation", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "add_tag",
              input: {
                entityName: "item:sealed-writ",
                entityType: "item",
                tag: "routing-stamped",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  entity: "Sealed Writ",
                  appliedTag: "routing-stamped",
                  tags: ["routing-stamped"],
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance:
                  "The Routing Stamp on the sealed writ is proof for later Bureau filing.",
                quote:
                  "Routing Stamp applied; this stamp is sufficient proof for substitute-bond filing.",
                summary:
                  "The clerk applies the Routing Stamp to the sealed writ and confirms it is sufficient proof for Bureau filing.",
                claims: [
                  {
                    claimKind: "document_status",
                    polarity: "states",
                    subjectRef: "item:sealed-writ",
                    subjectText: "Sealed Writ",
                    summary:
                      "A Routing Stamp has been applied to the sealed writ.",
                  },
                ],
                stateEffects: [
                  {
                    effectId: "routing-stamp-on-writ",
                    status: "applied_now",
                    stateReceipt: "state_receipt_1_1",
                    summary: "The sealed writ now has the routing-stamped tag.",
                  },
                ],
                sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-routing-stamp",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance:
                    "The Routing Stamp on the sealed writ is proof for later Bureau filing.",
                  stateEffects: [
                    {
                      effectId: "routing-stamp-on-writ",
                      status: "applied_now",
                      stateReceipt: "state_receipt_1_1",
                      structuralTool: "add_tag",
                      targetRef: "item:sealed-writ",
                      stateKey: "tag",
                      stateValue: "routing-stamped",
                      summary: "The sealed writ now has the routing-stamped tag.",
                    },
                  ],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a court clerk to apply a routing stamp to a sealed writ.",
      sceneQuestion: "Does the court clerk apply a durable proof state to the item?",
      actionInterpretation: {
        intent: "Request exterior inspection and routing stamp.",
        targetRefs: ["Court Routing Clerk", "item:sealed-writ"],
      },
      turnIntent: "Record the stamp outcome and item state.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [
        expect.objectContaining({ toolName: "add_tag", status: "done" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome", status: "done" }),
      ],
    });
  });

  it("does not accept model-input stateEffects when the dialogue tool result omits them", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "add_tag",
              input: {
                entityName: "item:sealed-writ",
                entityType: "item",
                tag: "routing-stamped",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  entity: "Sealed Writ",
                  appliedTag: "routing-stamped",
                  tags: ["routing-stamped"],
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance:
                  "The Routing Stamp on the sealed writ is proof for later Bureau filing.",
                summary:
                  "The clerk applies the Routing Stamp to the sealed writ and confirms it is sufficient proof for Bureau filing.",
                stateEffects: [
                  {
                    effectId: "routing-stamp-on-writ",
                    status: "applied_now",
                    stateReceipt: "state_receipt_1_1",
                    structuralTool: "add_tag",
                    targetRef: "item:sealed-writ",
                    stateKey: "tag",
                    stateValue: "routing-stamped",
                    summary: "The sealed writ now has the routing-stamped tag.",
                  },
                ],
                sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-routing-stamp",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance:
                    "The Routing Stamp on the sealed writ is proof for later Bureau filing.",
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a court clerk to apply a routing stamp to a sealed writ.",
      sceneQuestion: "Does the court clerk apply a durable proof state to the item?",
      actionInterpretation: {
        intent: "Request exterior inspection and routing stamp.",
        targetRefs: ["Court Routing Clerk", "item:sealed-writ"],
      },
      turnIntent: "Record the stamp outcome and item state.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("without a backed applied_now stateEffect");
  });

  it("accepts docketed proof custody backed by tag and transfer receipts", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "add_tag",
              input: {
                entityName: "Anonymous sealed proof",
                entityType: "item",
                tag: "docketed-pending-tide-lock",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  entity: "Anonymous sealed proof",
                  appliedTag: "docketed-pending-tide-lock",
                  tags: ["starting-loadout", "equipped", "docketed-pending-tide-lock"],
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "transfer_item",
              input: {
                itemName: "Anonymous sealed proof",
                targetName: "Corvan Dels",
                targetType: "character",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  item: "Anonymous sealed proof",
                  target: "Corvan Dels",
                  action: "carried",
                  equipState: "carried",
                  equippedSlot: null,
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Corvan Dels",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "role_authority",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance:
                  "The docketed sealed proof is queued and must be revisited at the next low verdict-tide.",
                quote: "The seal is intact. I will accept it for docketing.",
                summary:
                  "Corvan Dels accepts the anonymous sealed proof for docketing and holds it until authentication.",
                claims: [
                  {
                    claimKind: "document_status",
                    polarity: "states",
                    subjectRef: "Anonymous sealed proof",
                    summary: "The sealed proof has been accepted for docketing.",
                  },
                ],
                stateEffects: [
                  {
                    effectId: "docket-proof",
                    status: "applied_now",
                    stateReceipt: "state_receipt_1_1",
                    summary: "The proof is docketed and pending authentication.",
                  },
                  {
                    effectId: "transfer-custody",
                    status: "applied_now",
                    stateReceipt: "state_receipt_2_7",
                    summary: "The proof is in Corvan Dels' custody.",
                  },
                ],
                sourceRefs: ["Corvan Dels", "Player", "Anonymous sealed proof"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-docket-proof",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "role_authority",
                  truthStatus: "speaker_asserted",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance:
                    "The docketed sealed proof is queued and must be revisited at the next low verdict-tide.",
                  stateEffects: [
                    {
                      effectId: "docket-proof",
                      status: "applied_now",
                      stateReceipt: "state_receipt_1_1",
                      structuralTool: "add_tag",
                      targetRef: "Anonymous sealed proof",
                      stateKey: "tag",
                      stateValue: "docketed-pending-tide-lock",
                      summary: "The proof is docketed and pending authentication.",
                    },
                    {
                      effectId: "transfer-custody",
                      status: "applied_now",
                      stateReceipt: "state_receipt_2_7",
                      structuralTool: "transfer_item",
                      targetRef: "Anonymous sealed proof",
                      stateKey: "custody",
                      stateValue: "carried",
                      summary: "The proof is in Corvan Dels' custody.",
                    },
                  ],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player presents a sealed proof to Corvan Dels for docketing.",
      sceneQuestion: "Does Corvan docket and hold the proof?",
      actionInterpretation: {
        intent: "Present sealed proof for proper verification.",
        targetRefs: ["Corvan Dels", "Anonymous sealed proof"],
      },
      turnIntent: "Record the proof docketing and custody outcome.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKinds: ["entity_tag", "item_transfer"],
        speakerBinding: { kind: "visible_actor", speakerRef: "Corvan Dels" },
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I place the sealed proof on the counter for legitimate verification.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "transfer_item", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [
        expect.objectContaining({ toolName: "add_tag", status: "done" }),
        expect.objectContaining({ toolName: "transfer_item", status: "done" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome", status: "done" }),
      ],
    });
  });

  it("accepts applied_now dialogue stateEffects backed by a partial transfer receipt", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "transfer_item",
              input: {
                itemName: "Three Ration Slips",
                targetName: "Bureau Window Clerk",
                targetType: "character",
                transferredItemName: "Two Ration Slips",
                remainingItemName: "One Ration Slip",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  item: "Two Ration Slips",
                  splitFrom: "Three Ration Slips",
                  remainingItem: "One Ration Slip",
                  target: "Bureau Window Clerk",
                  action: "carried",
                  equipState: "carried",
                  partialTransfer: true,
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Bureau Window Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "accepted",
                topicKind: "trade",
                authorityKind: "public_service",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "access",
                futureRelevance:
                  "The substitute-bond payment lets the sealed filing continue.",
                quote: "Two ration slips accepted as substitute-bond surety.",
                summary:
                  "The clerk accepts two ration slips and leaves one ration slip with the player.",
                claims: [
                  {
                    claimKind: "possession",
                    polarity: "states",
                    subjectRef: "Two Ration Slips",
                    subjectText: "Two Ration Slips",
                    summary: "The Bureau clerk now holds the two ration slips.",
                  },
                ],
                stateEffects: [
                  {
                    effectId: "surety-slip-transfer",
                    status: "applied_now",
                    stateReceipt: "state_receipt_1_16",
                    summary: "Two ration slips move to the Bureau clerk.",
                  },
                  {
                    effectId: "surety-slip-target-transfer",
                    status: "applied_now",
                    stateReceipt: "state_receipt_1_2",
                    summary: "The transferred two-ration-slip bundle is now held by the Bureau clerk.",
                  },
                ],
                sourceRefs: ["Bureau Window Clerk", "Three Ration Slips"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-surety-payment",
                  outcomeKind: "accepted",
                  topicKind: "trade",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "access",
                  futureRelevance:
                    "The substitute-bond payment lets the sealed filing continue.",
                  stateEffects: [
                    {
                      effectId: "surety-slip-transfer",
                      status: "applied_now",
                      stateReceipt: "state_receipt_1_16",
                      structuralTool: "transfer_item",
                      targetRef: "Three Ration Slips",
                      stateKey: "possession",
                      stateValue: "split",
                      summary: "Two ration slips move to the Bureau clerk.",
                    },
                    {
                      effectId: "surety-slip-target-transfer",
                      status: "applied_now",
                      stateReceipt: "state_receipt_1_2",
                      structuralTool: "transfer_item",
                      targetRef: "Two Ration Slips",
                      stateKey: "possession",
                      stateValue: "carried by Bureau Window Clerk",
                      summary: "The transferred two-ration-slip bundle is now held by the Bureau clerk.",
                    },
                  ],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player offers part of a bundled ration-slip item as surety.",
      sceneQuestion: "Does the clerk accept the durable payment and filing state?",
      actionInterpretation: {
        intent: "Pay two of three ration slips as substitute-bond surety.",
        targetRefs: ["Bureau Window Clerk", "Three Ration Slips"],
      },
      turnIntent: "Record the surety payment and accepted filing.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "trade",
        requiresStructuralEffect: true,
        effectKind: "item_transfer",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I pay exactly two of my three ration slips.",
      frame: {
        ...createFrame(),
        allowedTools: ["transfer_item", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [
        expect.objectContaining({ toolName: "transfer_item", status: "done" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome", status: "done" }),
      ],
    });
  });

  it("accepts same-turn metadata tags on a spawned item covered by the creation receipt", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "spawn_item",
              input: {
                name: "Filing Receipt Stub",
                tags: ["receipt", "proof"],
                ownerName: "Player",
                ownerType: "character",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  id: "item-receipt-stub",
                  name: "Filing Receipt Stub",
                  owner: "Player",
                  ownerType: "character",
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "add_tag",
              input: {
                entityName: "Filing Receipt Stub",
                entityType: "item",
                tag: "registry-stamped",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  entity: "Filing Receipt Stub",
                  appliedTag: "registry-stamped",
                  tags: ["receipt", "proof", "registry-stamped"],
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Bureau Window Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "role_authority",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance: "The receipt stub can prove the filing later.",
                summary: "The clerk issues a filing receipt stub.",
                claims: [
                  {
                    claimKind: "document_status",
                    polarity: "states",
                    subjectRef: "Filing Receipt Stub",
                    summary: "The receipt stub exists as filing proof.",
                  },
                ],
                stateEffects: [
                  {
                    effectId: "receipt-stub-issued",
                    status: "applied_now",
                    stateReceipt: "state_receipt_1_7",
                    summary: "The player receives the filing receipt stub.",
                  },
                ],
                sourceRefs: ["Bureau Window Clerk", "Filing Receipt Stub"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-receipt-stub",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "role_authority",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance: "The receipt stub can prove the filing later.",
                  stateEffects: [
                    {
                      effectId: "receipt-stub-issued",
                      status: "applied_now",
                      stateReceipt: "state_receipt_1_7",
                      structuralTool: "spawn_item",
                      targetRef: "Filing Receipt Stub",
                      stateKey: "possession",
                      stateValue: "carried by Player",
                      summary: "The player receives the filing receipt stub.",
                    },
                  ],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks for a filing receipt.",
      sceneQuestion: "Does the clerk issue the receipt proof?",
      actionInterpretation: {
        intent: "Receive a filing receipt stub.",
        targetRefs: ["Bureau Window Clerk"],
      },
      turnIntent: "Record the receipt issue.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKinds: ["item_created", "entity_tag"],
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask for a receipt stub.",
      frame: {
        ...createFrame(),
        allowedTools: ["spawn_item", "add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [
        expect.objectContaining({ toolName: "spawn_item", status: "done" }),
        expect.objectContaining({ toolName: "add_tag", status: "done" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome", status: "done" }),
      ],
    });
  });

  it("rejects premature applied_now dialogue effects as retryable tool feedback before commit", async () => {
    const stateEffects = [
      {
        effectId: "registry-token-transfer",
        status: "applied_now",
        stateReceipt: "state_receipt_1_2",
        structuralTool: "transfer_item",
        targetRef: "Public Debt Token",
        stateKey: "possession",
        stateValue: "carried by Bureau Window Clerk",
        summary: "The token moves to the registry clerk.",
      },
    ];
    const prematureDialogueInput = {
      speakerRef: "Bureau Window Clerk",
      addresseeRefs: ["Player"],
      outcomeKind: "accepted",
      topicKind: "trade",
      authorityKind: "public_service",
      truthStatus: "settled_by_backend",
      durability: "durable",
      futureUseKind: "evidence",
      futureRelevance: "The registry token payment proves the filing fee was paid.",
      quote: "Token accepted for the registry.",
      summary: "The clerk says the token has been accepted before the backend transfer runs.",
      claims: [
        {
          claimKind: "possession",
          polarity: "states",
          subjectRef: "Public Debt Token",
          summary: "The registry now holds the public debt token.",
        },
      ],
      stateEffects,
      sourceRefs: ["Bureau Window Clerk", "Public Debt Token"],
    };
    const repairedDialogueInput = {
      ...prematureDialogueInput,
      summary: "The clerk accepts the token after the backend transfer succeeds.",
    };

    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: prematureDialogueInput,
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "transfer_item",
              input: {
                itemName: "Public Debt Token",
                targetName: "Bureau Window Clerk",
                targetType: "character",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  item: "Public Debt Token",
                  target: "Bureau Window Clerk",
                  action: "carried",
                  equipState: "carried",
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: repairedDialogueInput,
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-registry-token-paid",
                  outcomeKind: "accepted",
                  topicKind: "trade",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance: "The registry token payment proves the filing fee was paid.",
                  stateEffects,
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player offers a public debt token for a registry fee.",
      sceneQuestion: "Does the clerk accept the token payment?",
      actionInterpretation: {
        intent: "Pay the registry fee.",
        targetRefs: ["Bureau Window Clerk", "Public Debt Token"],
      },
      turnIntent: "Record the registry payment.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "trade",
        requiresStructuralEffect: true,
        effectKind: "item_transfer",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I pay the registry fee with the public debt token.",
      frame: {
        ...createFrame(),
        allowedTools: ["transfer_item", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [
        expect.objectContaining({
          toolName: "record_dialogue_outcome",
          status: "skipped",
          result: expect.objectContaining({
            contractFailure: expect.objectContaining({
              code: "dialogue_state_effect_missing_prior_receipt",
              retryable: true,
            }),
          }),
        }),
        expect.objectContaining({ toolName: "transfer_item", status: "done" }),
        expect.objectContaining({ toolName: "record_dialogue_outcome", status: "done" }),
      ],
    });
  });

  it("rejects applied_now dialogue stateEffects backed only by a mutation on another entity", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "add_tag",
              input: {
                entityName: "item:other-writ",
                entityType: "item",
                tag: "routing-stamped",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { entity: "Other Writ", tags: ["routing-stamped"] },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance: "The carried sealed writ can be cited later.",
                quote: "Да.",
                summary: "Готово.",
                claims: [
                  {
                    claimKind: "document_status",
                    polarity: "states",
                    subjectRef: "item:sealed-writ",
                    summary: "The sealed writ is claimed as routing-stamped.",
                  },
                ],
                stateEffects: [
                  {
                    effectId: "routing-stamp-on-writ",
                    status: "applied_now",
                    structuralTool: "add_tag",
                    targetRef: "item:sealed-writ",
                    stateKey: "tag",
                    stateValue: "routing-stamped",
                    summary: "The sealed writ now has the routing-stamped tag.",
                  },
                ],
                sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-routing-stamp",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance: "The carried sealed writ can be cited later.",
                  stateEffects: [
                    {
                      effectId: "routing-stamp-on-writ",
                      status: "applied_now",
                      structuralTool: "add_tag",
                      targetRef: "item:sealed-writ",
                      stateKey: "tag",
                      stateValue: "routing-stamped",
                      summary: "The sealed writ now has the routing-stamped tag.",
                    },
                  ],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a court clerk to apply a routing stamp to a sealed writ.",
      sceneQuestion: "Does the court clerk apply a durable proof state to the item?",
      actionInterpretation: {
        intent: "Request exterior inspection and routing stamp.",
        targetRefs: ["Court Routing Clerk", "item:sealed-writ"],
      },
      turnIntent: "Record the stamp outcome and item state.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("applied_now stateEffect without a prior matching structural state tool");
  });

  it("accepts refused structural-effect requests when no state was applied", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "refused",
                topicKind: "trade",
                authorityKind: "public_service",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance:
                  "The refusal closes off barter as a payment path and confirms no fee is owed yet.",
                quote:
                  "Keep your hood. We do not take equipment as filing collateral, and no fee is owed yet.",
                summary:
                  "The clerk refuses the offered hood as a payment or deposit. No item moved, no fee was charged, and no receipt was issued.",
                claims: [
                  {
                    claimKind: "prohibition",
                    polarity: "denies",
                    subjectRef: "item:borrowed-hood",
                    summary: "Equipment barter is not accepted for this filing fee.",
                  },
                ],
                stateEffects: [],
                sourceRefs: ["Court Routing Clerk", "item:borrowed-hood"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-barter-refused",
                  outcomeKind: "refused",
                  topicKind: "trade",
                  authorityKind: "public_service",
                  truthStatus: "speaker_asserted",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance:
                    "The refusal closes off barter as a payment path and confirms no fee is owed yet.",
                  stateEffects: [],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player offers a carried hood as payment collateral.",
      sceneQuestion: "Does the clerk accept payment or refuse the attempted transfer?",
      actionInterpretation: {
        intent: "Offer the borrowed hood as payment collateral.",
        targetRefs: ["Court Routing Clerk", "item:borrowed-hood"],
      },
      turnIntent: "Record the attempted payment outcome.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "trade",
        requiresStructuralEffect: true,
        effectKind: "item_transfer",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I offer my borrowed hood as filing collateral.",
      frame: {
        ...createFrame(),
        allowedTools: ["transfer_item", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [expect.objectContaining({ toolName: "record_dialogue_outcome" })],
    });
  });

  it("rejects positive structural-effect answers without mutation or typed non-application", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "settled_by_backend",
                durability: "durable",
                futureUseKind: "evidence",
                futureRelevance:
                  "The answer claims the sealed writ can now be filed.",
                quote: "That is enough; take it to the Bureau.",
                summary:
                  "The clerk says the writ is good enough but no state-bearing tool ran.",
                claims: [
                  {
                    claimKind: "document_status",
                    polarity: "states",
                    subjectRef: "item:sealed-writ",
                    summary: "The sealed writ is claimed as ready for filing.",
                  },
                ],
                stateEffects: [],
                sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
              },
            },
          ],
          toolResults: [
            {
              output: withTerminalTestAuthority("record_dialogue_outcome", {
                success: true,
                result: {
                  eventId: "event-unbacked-positive-answer",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "settled_by_backend",
                  durability: "durable",
                  futureUseKind: "evidence",
                  futureRelevance:
                    "The answer claims the sealed writ can now be filed.",
                  stateEffects: [],
                  persisted: true,
                },
              }),
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a court clerk to apply a routing stamp to a sealed writ.",
      sceneQuestion: "Does the court clerk apply a durable proof state to the item?",
      actionInterpretation: {
        intent: "Request exterior inspection and routing stamp.",
        targetRefs: ["Court Routing Clerk", "item:sealed-writ"],
      },
      turnIntent: "Record the stamp outcome and item state.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        requiresStructuralEffect: true,
        effectKind: "entity_tag",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the court clerk to apply the routing stamp.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("typed non-application outcome");
  });

  it("accepts communicative sufficiency claims without structural mutation when no state was applied", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Court Routing Clerk",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "permission_check",
                futureRelevance:
                  "The sufficiency rule can guide whether the player seeks a routing stamp later.",
                quote:
                  "A routing-stamped writ would be enough for the Bureau filing.",
                summary:
                  "The clerk states what proof would be sufficient, but does not apply any mark now.",
                claims: [
                  {
                    claimKind: "requirement",
                    polarity: "allows",
                    subjectText: "routing-stamped sealed writ",
                    summary: "A routing-stamped sealed writ would be sufficient proof.",
                  },
                ],
                stateEffects: [],
                sourceRefs: ["Court Routing Clerk", "item:sealed-writ"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-stamp-rule",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "speaker_asserted",
                  durability: "durable",
                  futureUseKind: "permission_check",
                  futureRelevance:
                    "The sufficiency rule can guide whether the player seeks a routing stamp later.",
                  stateEffects: [],
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks whether a routing-stamped writ would be enough.",
      sceneQuestion: "What proof would be sufficient?",
      actionInterpretation: {
        intent: "Ask a proof sufficiency question without requesting a mark.",
        targetRefs: ["Court Routing Clerk", "item:sealed-writ"],
      },
      turnIntent: "Record the sufficiency answer only.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask whether a routing-stamped writ would be enough.",
      frame: {
        ...createFrame(),
        allowedTools: ["add_tag", "record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [expect.objectContaining({ toolName: "record_dialogue_outcome" })],
    });
  });

  it("rejects dialogue outcomes that do not match GM Read required topicKind", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Lead Warden",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "social",
                authorityKind: "role_authority",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "npc_memory",
                futureRelevance:
                  "The answer is friendly but does not settle the required proof topic.",
                summary: "The Lead Warden makes small talk instead of naming proof.",
                sourceRefs: ["Lead Warden", "Player"],
              },
            },
          ],
          toolResults: [
            {
              output: withTerminalTestAuthority("record_dialogue_outcome", {
                success: true,
                result: {
                  outcomeKind: "answered",
                  topicKind: "social",
                  authorityKind: "role_authority",
                  truthStatus: "speaker_asserted",
                  durability: "durable",
                  futureUseKind: "npc_memory",
                  persisted: true,
                },
              }),
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask the Lead Warden what exact proof will satisfy the checkpoint.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Record the authority's proof requirement.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "durable",
          topicKind: "proof",
        },
      },
    })).rejects.toThrow("matching topicKind proof");
  });

  it("accepts durable authority procedure outcomes that use direct speech instead of outcome verbs", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Lead Warden",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "role_authority",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "permission_check",
                futureRelevance:
                  "The named Harbor Registry Office and seal-verified transit chit requirement constrain later lawful route attempts.",
                quote:
                  "Bring a seal-verified transit chit to the Harbor Registry Office before dusk.",
                summary:
                  "The Lead Warden names the Harbor Registry Office and a seal-verified transit chit requirement.",
                claims: [
                  {
                    claimKind: "requirement",
                    polarity: "requires",
                    subjectText: "seal-verified transit chit",
                    summary: "A seal-verified transit chit is required.",
                  },
                  {
                    claimKind: "office",
                    polarity: "redirects",
                    subjectText: "Harbor Registry Office",
                    summary: "The Harbor Registry Office is the named place to resolve the block.",
                  },
                ],
                sourceRefs: ["Lead Warden", "Player"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-warden-office",
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "role_authority",
                  truthStatus: "speaker_asserted",
                  speakerRef: "Lead Warden",
                  durability: "durable",
                  futureUseKind: "permission_check",
                  futureRelevance:
                    "The named Harbor Registry Office and seal-verified transit chit requirement constrain later lawful route attempts.",
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a visible authority for a formal office.",
      sceneQuestion: "What office does the Lead Warden name for resolving the block?",
      actionInterpretation: {
        intent: "Ask the Lead Warden for a written citation or named office.",
        targetRefs: ["Lead Warden"],
      },
      turnIntent: "Resolve and record the authority's procedural answer.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask for a written citation or named office where a junior courier can resolve the block.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [expect.objectContaining({ toolName: "record_dialogue_outcome" })],
    });
  });

  it("accepts durable unavailable-role outcomes for reusable procedural questions", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                addresseeRefs: ["Player"],
                outcomeKind: "unavailable",
                topicKind: "safety",
                authorityKind: "no_visible_authority",
                truthStatus: "unconfirmed",
                durability: "durable",
                futureUseKind: "safety",
                futureRelevance:
                  "The unavailable ward engineer and named public places constrain the player's next lawful route for fog and engine-district safety information.",
                requestedRoleText: "ward engineer",
                summary:
                  "No ward engineer answers from the public ironwalk; public safety guidance must be sought at an active engine ward or posted fog-signal station.",
                claims: [
                  {
                    claimKind: "lead",
                    polarity: "redirects",
                    subjectText: "active engine ward or posted fog-signal station",
                    summary: "These are the grounded next places to seek engine-district safety guidance.",
                  },
                ],
                sourceRefs: ["Player"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-engineer-unavailable",
                  outcomeKind: "unavailable",
                  topicKind: "safety",
                  authorityKind: "no_visible_authority",
                  truthStatus: "unconfirmed",
                  durability: "durable",
                  futureUseKind: "safety",
                  futureRelevance:
                    "The unavailable ward engineer and named public places constrain the player's next lawful route for fog and engine-district safety information.",
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks for a ward engineer's public safety guidance.",
      sceneQuestion: "What grounded answer, silence, or next public office does the player get?",
      actionInterpretation: {
        intent: "Ask a ward engineer what the glowing fog means and whether any district is unsafe.",
        targetRefs: ["ward engineer"],
      },
      turnIntent:
        "Resolve and record the procedural safety answer, refusal, silence, or unavailable-role outcome.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "safety",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask a ward engineer what the glowing fog means today and whether any engine district is unsafe for ordinary travel.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).resolves.toMatchObject({
      stepResults: [expect.objectContaining({ toolName: "record_dialogue_outcome" })],
    });
  });

  it("keeps create_scene_extra unavailable when GM Read binds no_visible_authority", async () => {
    const noAnswerInput = {
      addresseeRefs: ["Player"],
      outcomeKind: "no_current_answer",
      topicKind: "procedure",
      authorityKind: "no_visible_authority",
      truthStatus: "unconfirmed",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The missing dispatch clerk pushes the player toward another public source.",
      requestedRoleText: "dispatch clerk",
      summary: "No dispatch clerk can be reached from this counter right now.",
      sourceRefs: ["Player"],
    };
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
        success: true,
        result: {
          ...noAnswerInput,
          eventId: "event-no-dispatch-clerk",
          persisted: true,
        },
      },
    ));
    let capturedToolNames: string[] = [];
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      capturedToolNames = Object.keys(options.tools);
      const output = await options.tools.record_dialogue_outcome!.execute(noAnswerInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: noAnswerInput }],
            toolResults: [{ output }],
          },
        ],
      };
    });

    const frame = {
      ...createFrame(),
      allowedTools: ["create_scene_extra", "record_dialogue_outcome", "log_event"],
    } as SceneFrame;
    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks for a dispatch clerk's public procedure answer.",
      sceneQuestion: "Does any dispatch clerk answer here?",
      actionInterpretation: {
        intent: "Ask the dispatch clerk what queue applies.",
        targetRefs: ["dispatch clerk"],
      },
      turnIntent: "Record no current dispatch-clerk answer without creating a responder.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "procedure",
        speakerBinding: {
          kind: "no_visible_authority",
          requestedRoleText: "dispatch clerk",
        },
      },
    };

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the dispatch clerk what queue applies.",
      frame,
      gmRead: askRead,
    });

    expect(capturedToolNames).not.toContain("create_scene_extra");
    expect(createSceneExtraExecuteMock).not.toHaveBeenCalled();
    expect(createPlayerTurnToolExecutionContext).toHaveBeenLastCalledWith({
      frame,
      addressedTarget: { kind: "no_visible_authority", roleText: "dispatch clerk" },
    });
    expect(result.stepResults).toMatchObject([
      { status: "done", toolName: "record_dialogue_outcome" },
    ]);
  });

  it("runs a terminal closure pass when helper calls prepare a conversation but do not record the outcome", async () => {
    const frame = createFrame();
    frame.roster.support = [
      {
        id: "actor-hidden-tea-broker",
        actorId: "npc-hidden-tea-broker",
        type: "npc",
        label: "Hidden Tea Broker",
        locationId: "loc-private-vault",
        sceneScopeId: "loc-private-vault",
        awareness: "none",
      },
    ];
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "tool-calls",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "create_scene_extra",
              input: {
                name: "Stamp Deputy Corrin",
                role: "clerk",
                roleText: "commissioned stamp deputy",
                reason:
                  "The guardpost tariff office plausibly has an ordinary commissioned stamp deputy on duty.",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  id: "actor-stamp-deputy",
                  name: "Stamp Deputy Corrin",
                  role: "clerk",
                  modelSafeRefs: ["Stamp Deputy Corrin"],
                  note:
                    "Hidden Tea Broker should not replay through prior tool observations after actor:hidden-broker.",
                },
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "inspect_known_fact",
              input: { query: "warden stamp procedure", refs: ["Player"] },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  count: 1,
                  facts: [{ ref: "fact:permit-log", label: "permit log entry" }],
                },
              },
            },
          ],
        },
      ],
    });
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_dialogue_outcome",
              input: {
                speakerRef: "Stamp Deputy Corrin",
                addresseeRefs: ["Player"],
                outcomeKind: "answered",
                topicKind: "proof",
                authorityKind: "public_service",
                truthStatus: "speaker_asserted",
                durability: "durable",
                futureUseKind: "permission_check",
                futureRelevance:
                  "The deputy's stamp procedure constrains later lawful checkpoint passage.",
                quote:
                  "I can begin the stamp review if your route log is current and the seal stays intact.",
                summary:
                  "Stamp Deputy Corrin says the route log must be current and the seal must stay intact for stamp review.",
                claims: [
                  {
                    claimKind: "requirement",
                    polarity: "requires",
                    subjectText: "current route log and intact seal",
                    summary:
                      "A current route log and intact seal are required for stamp review.",
                  },
                ],
                stateEffects: [],
                sourceRefs: ["Stamp Deputy Corrin", "Player"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-stamp-review-answer",
                  speakerRef: "Stamp Deputy Corrin",
                  addresseeRefs: ["Player"],
                  outcomeKind: "answered",
                  topicKind: "proof",
                  authorityKind: "public_service",
                  truthStatus: "speaker_asserted",
                  durability: "durable",
                  futureUseKind: "permission_check",
                  futureRelevance:
                    "The deputy's stamp procedure constrains later lawful checkpoint passage.",
                  persisted: true,
                  stateEffects: [],
                  sourceRefs: ["Stamp Deputy Corrin", "Player"],
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks the guardpost stamp deputy to begin a stamp review.",
      sceneQuestion: "What does the stamp deputy say?",
      actionInterpretation: {
        intent: "Ask a public-service stamp deputy to begin the review.",
        targetRefs: ["commissioned stamp deputy"],
      },
      turnIntent: "Record the stamp deputy's procedural answer.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "proof",
        speakerBinding: {
          kind: "prose_role",
          requestedRoleText: "commissioned stamp deputy",
          allowCreateSceneExtra: true,
        },
      },
    };

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the commissioned stamp deputy to begin the stamp review.",
      frame: {
        ...frame,
        allowedTools: [
          "create_scene_extra",
          "inspect_known_fact",
          "record_dialogue_outcome",
        ],
      } as SceneFrame,
      gmRead: askRead,
    });

    expect(generateText).toHaveBeenCalledTimes(2);
    const closurePrompt = (generateTextMock().mock.calls[1]?.[0] as { prompt?: string } | undefined)?.prompt ?? "";
    expect(closurePrompt).not.toContain("Hidden Tea Broker");
    expect(closurePrompt).not.toContain("actor:hidden-broker");
    expect(closurePrompt).not.toContain("tool-call-1");
    expect(closurePrompt).not.toContain("tool-call-2");
    expect(closurePrompt).toContain("[backend ref hidden]");
    expect(generateText).toHaveBeenLastCalledWith(expect.objectContaining({
      activeTools: ["record_dialogue_outcome"],
      tools: {
        record_dialogue_outcome: expect.objectContaining({
          description: "Record dialogue outcome tool",
          execute: expect.any(Function),
        }),
      },
      stopWhen: [
        { type: "step-count", count: GM_TOOL_LOOP_TERMINAL_CLOSURE_MAX_STEPS },
        expect.any(Function),
      ],
    }));
    expect(result.stepResults).toMatchObject([
      { status: "done", toolName: "create_scene_extra" },
      { status: "done", toolName: "inspect_known_fact" },
      { status: "done", toolName: "record_dialogue_outcome" },
    ]);
    expect(result.acceptedStepIds).toContain("tool-call-1");
    expect(result.acceptedStepIds).toContain("tool-call-3");
  });

  it("makes procedural scene-local dialogue outcomes fail as an observed correction opportunity", async () => {
    const badInput = {
      addresseeRefs: ["Player"],
      outcomeKind: "unavailable",
      topicKind: "safety",
      authorityKind: "no_visible_authority",
      truthStatus: "unconfirmed",
      durability: "scene_local",
      requestedRoleText: "ward engineer",
      summary: "No ward engineer answers from the public ironwalk, and the current exchange ends here.",
      sourceRefs: ["Player"],
    };
    const durableInput = {
      addresseeRefs: ["Player"],
      outcomeKind: "unavailable",
      topicKind: "safety",
      authorityKind: "no_visible_authority",
      truthStatus: "unconfirmed",
      durability: "durable",
      futureUseKind: "safety",
      futureRelevance:
        "The unavailable ward engineer and named public places constrain the player's next lawful route for fog and engine-district safety information.",
      requestedRoleText: "ward engineer",
      summary:
        "No ward engineer answers from the public ironwalk; public safety guidance must be sought at an active engine ward or posted fog-signal station.",
      sourceRefs: ["Player"],
    };
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce(withTerminalTestAuthority(
      "record_dialogue_outcome",
      {
      success: true,
      result: {
        eventId: "event-engineer-unavailable",
        outcomeKind: "unavailable",
        topicKind: "safety",
        authorityKind: "no_visible_authority",
        truthStatus: "unconfirmed",
        durability: "durable",
        futureUseKind: "safety",
        futureRelevance:
          "The unavailable ward engineer and named public places constrain the player's next lawful route for fog and engine-district safety information.",
        persisted: true,
      },
      },
    ));
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const failedSceneLocal = await options.tools.record_dialogue_outcome!.execute(badInput);
      const durableCorrection = await options.tools.record_dialogue_outcome!.execute(durableInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: badInput }],
            toolResults: [{ output: failedSceneLocal }],
          },
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: durableInput }],
            toolResults: [{ output: durableCorrection }],
          },
        ],
      };
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks for a ward engineer's public safety guidance.",
      sceneQuestion: "What grounded answer, silence, or next public office does the player get?",
      actionInterpretation: {
        intent: "Ask a ward engineer what the glowing fog means and whether any district is unsafe.",
        targetRefs: ["ward engineer"],
      },
      turnIntent:
        "Resolve and record the procedural safety answer, refusal, silence, or unavailable-role outcome.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "safety",
      },
    };

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask a ward engineer what the glowing fog means today and whether any engine district is unsafe for ordinary travel.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    });

    expect(recordDialogueOutcomeExecuteMock).toHaveBeenCalledTimes(1);
    expect(recordDialogueOutcomeExecuteMock).toHaveBeenCalledWith(durableInput);
    expect(result.stepResults).toEqual([
      expect.objectContaining({
        status: "skipped",
        validationError: expect.objectContaining({
          message: expect.stringContaining("procedural_conversation_dialogue_outcome_requires_structural_durable_result"),
        }),
      }),
      expect.objectContaining({
        status: "done",
        toolName: "record_dialogue_outcome",
      }),
    ]);
  });

  it("rejects durable dialogue outcomes before execution when GM Read required scene-local", async () => {
    const durableInput = {
      addresseeRefs: ["Player"],
      outcomeKind: "answered",
      topicKind: "procedure",
      authorityKind: "role_authority",
      truthStatus: "speaker_asserted",
      durability: "durable",
      futureUseKind: "route_choice",
      futureRelevance: "The answer would affect later route choices.",
      summary: "The clerk names the route office.",
      sourceRefs: ["Counter Clerk", "Player"],
    };
    generateTextMock().mockImplementationOnce(async (options: {
      tools: Record<string, { execute: (input: unknown) => Promise<unknown> }>;
    }) => {
      const failedDurableAttempt = await options.tools.record_dialogue_outcome!.execute(durableInput);
      return {
        text: "",
        finishReason: "stop",
        response: { modelId: "judge-model" },
        usage: null,
        steps: [
          {
            toolCalls: [{ toolName: "record_dialogue_outcome", input: durableInput }],
            toolResults: [{ output: failedDurableAttempt }],
          },
        ],
      };
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the clerk which route office handles this.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Record the immediate clerk answer.",
        runtimeRequirement: {
          kind: "dialogue_outcome",
          durability: "scene_local",
          topicKind: "procedure",
        },
      },
    })).rejects.toThrow("GM tool loop produced no successful backend observations");

    expect(recordDialogueOutcomeExecuteMock).not.toHaveBeenCalled();
  });

  it("rejects conversational tool-plan turns that only record the player's ask", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: {
                text: "The player asks the counter clerk what changed today.",
                durability: "scene_local",
                participants: ["Player", "Counter Clerk"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  text: "The player asks the counter clerk what changed today.",
                  durability: "scene_local",
                  persisted: false,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a service worker for a local update.",
      sceneQuestion: "What does the worker answer or refuse to answer?",
      actionInterpretation: {
        intent: "Ask the counter clerk what changed today.",
        targetRefs: ["Counter Clerk"],
      },
      turnIntent: "Resolve the worker's immediate visible answer or refusal.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "scene_local",
        topicKind: "status",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I ask the counter clerk what changed today.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("without a structural record_dialogue_outcome");
  });

  it("rejects durable procedural log_events that still only echo the player's ask", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: {
                text: "Mira asks the Lead Warden which office accepts seal-verified transit chits.",
                durability: "durable",
                futureRelevance:
                  "The office question should remain available for later follow-up.",
                participants: ["Mira Voss", "Lead Warden"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  text: "Mira asks the Lead Warden which office accepts seal-verified transit chits.",
                  durability: "durable",
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    const askRead: Extract<GmRead, { path: "tool_plan" }> = {
      ...gmRead,
      situationSummary: "The player asks a visible authority for a local office.",
      sceneQuestion: "What does the authority answer or refuse to answer?",
      actionInterpretation: {
        intent: "Ask the Lead Warden which office accepts seal-verified transit chits.",
        targetRefs: ["Lead Warden"],
      },
      turnIntent: "Resolve the authority's immediate visible answer or refusal.",
      runtimeRequirement: {
        kind: "dialogue_outcome",
        durability: "durable",
        topicKind: "route",
      },
    };

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I ask the Lead Warden which office accepts seal-verified transit chits.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_dialogue_outcome", "log_event"],
      } as SceneFrame,
      gmRead: askRead,
    })).rejects.toThrow("without a structural record_dialogue_outcome");
  });

  it("builds candidate refs from the model-facing view without hidden support actors", () => {
    const frame = createFrame();
    frame.roster.support = [
      {
        id: "actor-hidden-tea-broker",
        actorId: "npc-hidden-tea-broker",
        type: "npc",
        label: "Hidden Tea Broker",
        locationId: "loc-private-vault",
        sceneScopeId: "loc-private-vault",
        awareness: "none",
      },
    ];

    const prompt = buildGmToolLoopPrompt({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I look for the tea stall.",
      frame,
      gmRead,
    });

    expect(prompt).toContain("CANDIDATE REFS FROM MODEL-FACING VIEW ONLY");
    expect(prompt).toContain('"ref": "current_location"');
    expect(prompt).toContain('"ref": "current_scene"');
    expect(prompt).not.toContain('"currentLocationId": "loc-market"');
    expect(prompt).not.toContain('"currentSceneScopeId": "scene-market"');
    expect(prompt).not.toContain('"ref": "location:loc-market"');
    expect(prompt).not.toContain('"ref": "location:scene-market"');
    expect(prompt).not.toContain("Hidden Tea Broker");
    expect(prompt).not.toContain("npc-hidden-tea-broker");
    expect(prompt).not.toContain("actor-hidden-tea-broker");
  });

  it("keeps Oracle reasoning out of model-facing tool-loop prompts", () => {
    const frame = {
      ...createFrame(),
      oracle: {
        outcome: "weak_hit",
        confidence: 55,
        rationale: "Private oracle rationale must not be replayed.",
      },
    };

    const prompt = buildGmToolLoopPrompt({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I bluff the road warden.",
      frame,
      gmRead,
      oracleResult: {
        outcome: "weak_hit",
        chance: 55,
        roll: 43,
        reasoning: "Secret oracle chain-of-thought.",
      },
    });

    expect(prompt).toContain('"outcome": "weak_hit"');
    expect(prompt).toContain('"roll": 43');
    expect(prompt).not.toContain("Secret oracle chain-of-thought.");
    expect(prompt).not.toContain("Private oracle rationale must not be replayed.");
    expect(prompt).not.toContain('"reasoning"');
  });

  it("returns failed observations for repeated equivalent dynamic creation calls", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "create_scene_extra",
              input: {
                name: "Counter Clerk",
                locationRef: "current_scene",
                role: "clerk",
                tags: ["service"],
                reason: "A counter clerk is needed for this public exchange.",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { id: "npc-1", name: "Counter Clerk" },
                authority: toolAuthority(["actor:npc-1:presence"]),
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "create_scene_extra",
              input: {
                name: "Counter Clerk",
                locationRef: "current_scene",
                role: "clerk",
                tags: ["service"],
                reason: "A counter clerk is needed for this public exchange.",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: false,
                error: "semantic_budget_exceeded",
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I bring the counter worker into focus.",
      frame: {
        ...createFrame(),
        allowedTools: ["create_scene_extra"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        runtimeRequirement: {
          kind: "scene_beat",
          durability: "scene_local",
          effectKind: "support_actor_created",
        },
      },
    });

    expect(result.stepResults).toMatchObject([
      { toolName: "create_scene_extra", status: "done" },
      {
        toolName: "create_scene_extra",
        status: "skipped",
        validationError: {
          message: expect.stringContaining("semantic_budget_exceeded"),
        },
      },
    ]);
    expect(createSceneExtraExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("blocks private forecast terms before runtime tool execution", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: {
                text: "A public delay is remembered.",
                durability: "durable",
                futureRelevance: "The public delay should remain relevant on later turns.",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-safe",
                  text: "A public delay is remembered.",
                  durability: "durable",
                  persisted: true,
                },
              },
            },
          ],
        },
      ],
    });

    await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I linger in the market for an hour.",
      frame: createFrame(),
      gmRead,
      scopedForecastExcerpt: {
        version: "scoped-forecast-excerpt.v1",
        baseTick: 7,
        promptReady: true,
        entries: [],
        forbiddenPrivateTerms: ["district watchers"],
      },
    });

    const toolSet = generateTextMock().mock.calls[0]?.[0]?.tools as
      | { log_event?: { execute?: (input: unknown) => Promise<unknown> } }
      | undefined;

    const callsBeforeForbiddenTerm = logEventExecuteMock.mock.calls.length;
    await expect(toolSet?.log_event?.execute?.({
      text: "District watchers mark Mira as suspicious.",
      durability: "durable",
      futureRelevance: "District watchers may remember this later.",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("private_source_boundary_term_in_tool_input"),
    });
    expect(logEventExecuteMock).toHaveBeenCalledTimes(callsBeforeForbiddenTerm);
  });

  it("exposes observation-only lookup tools through the live tool loop without mutation refs", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "find_poi_candidates",
              input: { query: "tea shop", includePotential: true },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  candidates: [{ ref: "location:tea-lane", label: "Tea Lane" }],
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I look for a tea shop along the logical route.",
      frame: {
        ...createFrame(),
        allowedTools: ["find_poi_candidates"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player looks for an existing visible tea shop affordance.",
        sceneQuestion: "Which existing nearby tea shop option can be seen?",
        turnIntent: "Read existing POI candidates without creating or recording new state.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["local_status", "other"],
        },
      },
    });

    expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
      tools: {
        find_poi_candidates: expect.objectContaining({
          description: "Find POI candidates tool",
          execute: expect.any(Function),
        }),
      },
      activeTools: ["find_poi_candidates"],
    }));
    expect(result.stepResults).toEqual([
      expect.objectContaining({
        status: "done",
        toolName: "find_poi_candidates",
        mutationRefs: [],
        result: expect.objectContaining({
          kind: "observation",
          observationOnly: true,
        }),
      }),
    ]);
  });

  it("does not accept helper-only observations as a scene_beat receipt", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "find_poi_candidates",
              input: { query: "tea shop", includePotential: true },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  candidates: [{ ref: "location:tea-lane", label: "Tea Lane" }],
                },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I linger and let the district pressure change around me.",
      frame: {
        ...createFrame(),
        allowedTools: ["find_poi_candidates", "log_event"],
      } as SceneFrame,
      gmRead,
    })).rejects.toThrow(
      "without an accepted scene beat or state mutation receipt",
    );
  });

  it("rejects access-granting tools for unconfirmed key or permit claims", async () => {
    type CapturedToolSet = {
      reveal_location?: { execute?: (input: unknown) => Promise<unknown> };
      move_actor?: { execute?: (input: unknown) => Promise<unknown> };
      spawn_item?: { execute?: (input: unknown) => Promise<unknown> };
      log_event?: { execute?: (input: unknown) => Promise<unknown> };
    };
    const captureToolSet = async (
      runtimeRequirement: RuntimeRequirementLike,
      allowedTools: readonly string[],
    ): Promise<CapturedToolSet> => {
      let capturedTools: CapturedToolSet | undefined;
      generateTextMock().mockImplementationOnce(async (generateOptions: { tools: CapturedToolSet }) => {
        capturedTools = generateOptions.tools;
        return {
          text: "",
          finishReason: "stop",
          response: null,
          usage: null,
          steps: [],
        };
      });
      await expect(runGmToolLoop({
        campaignId: "campaign-1",
        provider,
        tick: 7,
        playerAction:
          "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.",
        frame: {
          ...createFrame(),
          allowedTools: [...allowedTools],
        } as SceneFrame,
        gmRead: {
          ...gmRead,
          path: "roll_oracle",
          rollRequest: {
            actorRef: "actor-player",
            question: "Does the key claim open the sealed office?",
            stakes: "Whether unconfirmed access claims can create access tools.",
            evidenceRefs: ["actor-player"],
          },
          runtimeRequirement: runtimeRequirement as NonNullable<GmRead["runtimeRequirement"]>,
        } as Extract<GmRead, { path: "roll_oracle" }>,
      })).rejects.toThrow();
      expect(capturedTools).toBeDefined();
      return capturedTools as CapturedToolSet;
    };

    const revealToolSet = await captureToolSet(
      { kind: "state_mutation", effectKind: "location_revealed" },
      ["reveal_location"],
    );
    await expect(revealToolSet.reveal_location?.execute?.({
      name: "Sealed Signal-House Office",
      tags: ["locked", "staff-only"],
      connectedToName: "current_location",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    const moveToolSet = await captureToolSet(
      { kind: "state_mutation", effectKind: "movement" },
      ["move_actor"],
    );
    await expect(moveToolSet.move_actor?.execute?.({
      actorRef: "Player",
      destinationRef: "Sealed Signal-House Office",
      evidenceRefs: ["Sealed Signal-House Office"],
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    const spawnToolSet = await captureToolSet(
      { kind: "state_mutation", effectKind: "item_created" },
      ["spawn_item"],
    );
    await expect(spawnToolSet.spawn_item?.execute?.({
      name: "Signal-House Master Key",
      ownerName: "Player",
      ownerType: "character",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    const logToolSet = await captureToolSet(
      { kind: "scene_beat", durability: "scene_local", beatKind: "event_log" },
      ["log_event"],
    );
    await expect(logToolSet.log_event?.execute?.({
      text: "Mira gained entry to the sealed office.",
      durability: "durable",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    await expect(logToolSet.log_event?.execute?.({
      text: "Mira's claimed key attempt fails visibly.",
      durability: "scene_local",
    })).resolves.toMatchObject({ success: true });

    expect(revealLocationExecuteMock).not.toHaveBeenCalled();
    expect(moveActorExecuteMock).not.toHaveBeenCalled();
    expect(spawnItemExecuteMock).not.toHaveBeenCalled();
    expect(logEventExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("rejects prose-only grounded tool-plan turns through generic no-call handling", async () => {
    generateTextMock().mockResolvedValueOnce({
      text:
        "Raised voices sharpen around an inspection dispute as a canvas-apron woman and a dockworker with a clipboard start changing the barge count.",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I watch the pier argument and remember who changes plans.",
      frame: createFrame(),
      gmRead,
    })).rejects.toThrow("no runtime tool calls");
  });

  it.each([
    {
      label: "raised voices and inspection dispute",
      text:
        "Raised voices spread into an inspection dispute as a gondolier argues with a dockworker holding a sealed envelope.",
    },
    {
      label: "waxed cloth and barge-manifest obligation",
      text:
        "The waxed cloth shows a Second Family dockmark, seventeen barge manifests, and a new obligation for tomorrow.",
    },
    {
      label: "recessed door and narrow stair route",
      text:
        "A recessed maintenance-like door opens onto a narrow stair and iron-banded door that make this route guidance matter later.",
    },
    {
      label: "danger changed after violence",
      text:
        "After violence happened, Dol shifts into a defensive posture and marks the bridge route as more dangerous since the fight.",
    },
  ])("rejects grounded scene beats with only scene-local observations: $label", async ({ text }) => {
    generateTextMock().mockResolvedValueOnce({
      text,
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: {
                text: "The moment is witnessed but not committed as durable state.",
                durability: "scene_local",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { durability: "scene_local", persisted: false },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I test whether this pressure will matter later.",
      frame: createFrame(),
      gmRead,
    })).rejects.toThrow("without an accepted scene beat or state mutation receipt");
  });

  it("rejects grounded scene beats backed only by intent markers", async () => {
    generateTextMock().mockResolvedValueOnce({
      text:
        "The shortcut rumor becomes a public route with a permit condition.",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "record_player_intent",
              input: {
                actorRef: "Player",
                intentType: "claim",
                targetHint: "shortcut rumor",
                stance: "claims",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { intentId: "intent-shortcut", kind: "player_intent_recorded" },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I claim the courier knows a hidden shortcut.",
      frame: {
        ...createFrame(),
        allowedTools: ["record_player_intent", "log_event"],
      } as SceneFrame,
      gmRead,
    })).rejects.toThrow("without an accepted scene beat or state mutation receipt");
  });

  it.each([
    {
      label: "raised voices and inspection dispute",
      allowedTools: ["create_scene_extra"],
      text:
        "Raised voices spread into an inspection dispute as a dockworker with a clipboard keeps watching the count.",
      toolCall: {
        toolName: "create_scene_extra",
        input: {
          name: "Clipboard Dockworker",
          role: "witness",
          locationRef: "current_scene",
          tags: ["dockworker", "inspection", "witness"],
          reason: "A visible dockworker witness makes the inspection dispute playable.",
        },
      },
      toolResult: {
        success: true,
        result: { id: "npc-dockworker", name: "Clipboard Dockworker" },
        authority: toolAuthority(["actor:npc-dockworker:presence"]),
      },
      runtimeRequirement: {
        kind: "scene_beat",
        durability: "scene_local",
        effectKind: "support_actor_created",
      } as const,
    },
    {
      label: "waxed cloth and barge-manifest obligation",
      allowedTools: ["spawn_item"],
      text:
        "The waxed cloth shows seventeen barge manifests and creates a new obligation to account for them.",
      toolCall: {
        toolName: "spawn_item",
        input: {
          name: "Waxed Barge Manifests",
          tags: ["manifest", "obligation", "second-family"],
          ownerName: "current_scene",
          ownerType: "location",
        },
      },
      toolResult: {
        success: true,
        result: { id: "item-manifests", name: "Waxed Barge Manifests" },
        authority: toolAuthority(["item:item-manifests:location"]),
      },
      runtimeRequirement: {
        kind: "scene_beat",
        durability: "scene_local",
        effectKind: "item_created",
      } as const,
    },
    {
      label: "public notice board discovered in the gallery",
      allowedTools: ["create_minor_poi"],
      text:
        "A public notice board at the gallery turn lists the next hearing window and docket protocol.",
      toolCall: {
        toolName: "create_minor_poi",
        input: {
          areaRef: "current_scene",
          poiType: "notice_board",
          name: "Gallery Hearing Notice Board",
          description: "A public notice board listing the next hearing window and docket protocol.",
          tags: ["notice-board", "hearing", "public"],
          reason: "The courthouse gallery naturally supports a public hearing notice board.",
        },
      },
      toolResult: {
        success: true,
        result: { id: "poi-gallery-board", name: "Gallery Hearing Notice Board" },
        authority: toolAuthority(["poi:poi-gallery-board:created"]),
      },
      runtimeRequirement: {
        kind: "scene_beat",
        durability: "scene_local",
        effectKind: "minor_poi_created",
      } as const,
    },
    {
      label: "new public route revealed from the gallery",
      allowedTools: ["reveal_location"],
      text:
        "The gallery usher opens a marked side passage to the Harbor Registry Office.",
      toolCall: {
        toolName: "reveal_location",
        input: {
          name: "Harbor Registry Office",
          description: "A public office reached by a marked side passage from the gallery.",
          tags: ["office", "registry", "public"],
          connectedToName: "current_location",
        },
      },
      toolResult: {
        success: true,
        result: { id: "loc-registry-office", name: "Harbor Registry Office" },
        authority: toolAuthority(["location:loc-registry-office:revealed"]),
      },
      runtimeRequirement: {
        kind: "scene_beat",
        durability: "scene_local",
        effectKind: "location_revealed",
      } as const,
    },
    {
      label: "world fact records a durable public notice",
      allowedTools: ["record_world_fact"],
      text:
        "The public docket gains a durable notice that the afternoon appeal window has opened.",
      toolCall: {
        toolName: "record_world_fact",
        input: {
          sourceKind: "public_record",
          truthStatus: "verified",
          factKind: "public_record",
          topicKind: "procedure",
          durability: "durable",
          futureUseKind: "route_choice",
          futureRelevance: "The afternoon appeal window can be used for later office routing.",
          summary: "The afternoon appeal window is open on the public docket.",
          claims: [{
            claimKind: "public_record",
            polarity: "states",
            subjectText: "afternoon appeal window",
            summary: "The afternoon appeal window is open.",
          }],
          sourceRefs: ["Player"],
        },
      },
      toolResult: {
        success: true,
        result: {
          factRef: "fact1",
          knowledgeId: "knowledge-appeal-window",
          sourceKind: "public_record",
          truthStatus: "verified",
          factKind: "public_record",
          topicKind: "procedure",
          durability: "durable",
          futureUseKind: "route_choice",
          futureRelevance: "The afternoon appeal window can be used for later office routing.",
          summary: "The afternoon appeal window is open on the public docket.",
          persisted: true,
        },
        authority: toolAuthority(["knowledge:knowledge-appeal-window"]),
      },
      runtimeRequirement: {
        kind: "world_fact",
        durability: "durable",
        topicKind: "procedure",
      } as const,
    },
    {
      label: "danger changed after violence",
      allowedTools: ["log_event"],
      text:
        "After violence happened, Dol shifts into a defensive posture and treats the bridge route as more dangerous.",
      toolCall: {
        toolName: "log_event",
        input: {
          text: "Violence changed Dol's posture and made the bridge route more dangerous.",
          durability: "durable",
          futureRelevance: "Dol and the bridge route should remain more dangerous on later turns.",
        },
      },
      toolResult: {
        success: true,
        result: {
          eventId: "event-danger",
          durability: "durable",
          persisted: true,
          text: "Violence changed Dol's posture and made the bridge route more dangerous.",
        },
      },
      runtimeRequirement: {
        kind: "scene_beat",
        durability: "durable",
        beatKind: "event_log",
      } as const,
    },
  ])("accepts P86-F001 pressure when backed by state-bearing observations: $label", async ({
    allowedTools,
    text,
    toolCall,
    toolResult,
    runtimeRequirement,
  }) => {
    mockGenerateTextExecutingParsedSteps({
      text,
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [toolCall],
          toolResults: [{ output: toolResult }],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I test whether this pressure will matter later.",
      frame: {
        ...createFrame(),
        allowedTools,
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        runtimeRequirement,
      },
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]).toMatchObject({
      status: "done",
      toolName: toolCall.toolName,
    });
  });

  it("allows explicitly sensory non-durable tool-loop text when a backend observation exists", async () => {
    mockGenerateTextExecutingParsedSteps({
      text:
        "Cold rain beads on the awning; the harbor smells of tar and rope. Sensory color only, no durable change.",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: {
                text: "The player pauses to take in cold harbor rain.",
                durability: "scene_local",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { durability: "scene_local", persisted: false },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I pause and take in the sensory details.",
      frame: createFrame(),
      gmRead: {
        ...gmRead,
        runtimeRequirement: {
          kind: "scene_beat",
          durability: "scene_local",
          beatKind: "event_log",
        },
      },
    })).resolves.toMatchObject({
      rawToolCalls: expect.any(Array),
      stepResults: [expect.objectContaining({ toolName: "log_event" })],
    });
  });

  it("adds successful reveal_location and move_actor observations to later tool-call grounding refs", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "reveal_location",
              input: {
                name: "Back Room",
                description: "A cramped service room behind the counter.",
                tags: ["service", "local"],
                connectedToName: "current_scene",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { id: "loc-back-room", name: "Back Room" },
                authority: toolAuthority(["location:loc-back-room:revealed"]),
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              toolName: "move_actor",
              input: {
                actorRef: "Player",
                destinationRef: "Back Room",
                evidenceRefs: ["Back Room"],
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { locationId: "loc-back-room", locationName: "Back Room" },
                authority: toolAuthority(["actor:actor-player:location"]),
              },
            },
          ],
        },
      ],
    });

    await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I step into the back room.",
      frame: {
        ...createFrame(),
        allowedTools: ["reveal_location", "move_actor", "create_scene_extra"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        path: "roll_oracle",
        rollRequest: {
          actorRef: "actor-player",
          question: "Does the player reach the back room?",
          stakes: "Whether same-turn revealed movement refs can ground follow-up movement.",
          evidenceRefs: ["actor-player"],
        },
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      } as Extract<GmRead, { path: "roll_oracle" }>,
    });

    expect(executionContextMock.legalLocationRefs.has("loc-back-room")).toBe(true);
    expect(executionContextMock.legalLocationRefs.has("back room")).toBe(true);
    expect(executionContextMock.legalMovementRefs.has("back room")).toBe(true);
    expect(executionContextMock.currentLocationId).toBe("loc-back-room");
    expect(executionContextMock.currentSceneScopeId).toBe("loc-back-room");
    expect(executionContextMock.currentLocationRefs.has("current_location")).toBe(true);
    expect(executionContextMock.currentSceneRefs.has("back room")).toBe(true);
    expect(revealLocationExecuteMock).toHaveBeenCalledTimes(1);
    expect(moveActorExecuteMock).toHaveBeenCalledWith(
      expect.objectContaining({ destinationRef: "Back Room" }),
    );
  });

  it("keeps spawn_item available but blocks repeated equivalent item creation in one loop", async () => {
    mockGenerateTextExecutingParsedSteps({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "spawn_item",
              input: {
                name: "Sealed Route Chit",
                tags: ["route-token", "persistent"],
                ownerName: "Player",
                ownerType: "character",
              },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { id: "item-1", name: "Sealed Route Chit" },
                authority: toolAuthority(["item:item-1:holder"]),
              },
            },
          ],
        },
      ],
    });

    await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I receive a sealed route chit.",
      frame: {
        ...createFrame(),
        allowedTools: ["spawn_item"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        runtimeRequirement: { kind: "state_mutation", effectKind: "item_created" },
      },
    });

    const toolSet = generateTextMock().mock.calls[0]?.[0]?.tools as
      | { spawn_item?: { execute?: (input: unknown) => Promise<unknown> } }
      | undefined;
    const input = {
      name: "Sealed Route Chit",
      tags: ["route-token", "persistent"],
      ownerName: "Player",
      ownerType: "character",
    };
    await expect(toolSet?.spawn_item?.execute?.(input)).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("semantic_budget_exceeded"),
    });
    expect(spawnItemExecuteMock).toHaveBeenCalledTimes(1);
    expect(executionContextMock.legalItemRefs.has("sealed route chit")).toBe(true);
  });

  it("prompts for reveal-location-first locality and persistent-item discipline", () => {
    const prompt = buildGmToolLoopPrompt({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I step through the service door and take the route chit.",
      frame: {
        ...createFrame(),
        allowedTools: ["reveal_location", "move_actor", "create_scene_extra", "spawn_item"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        turnIntent: "Reveal and enter the service-door route.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "movement" },
      },
    });

    expect(prompt).toContain("call reveal_location first");
    expect(prompt).toContain("prefer the literal alias current_scene/current_location");
    expect(prompt).toContain("call move_actor after reveal_location succeeds");
    expect(prompt).toContain("Items are allowed when a tangible thing becomes persistent");
    expect(prompt).toContain("Do not spawn incidental set dressing");
    expect(prompt).toContain("Use durable log_event only for a new future-relevant fact");
    expect(prompt).toContain("Use scene_local log_event for attempted, refused, witnessed, conversational, or bluff beats");
    expect(prompt).toContain("Do not satisfy future-relevant concrete pressure in assistant prose");
    expect(prompt).toContain("Future-relevant pressure checklist");
    expect(prompt).toContain("recessed doors/stairs/routes");
    expect(prompt).toContain("Low-stakes sensory color is allowed");
    expect(prompt).toContain("Recent transcript is continuity, not legal refs");
    expect(prompt).toContain("No sudden lockpicks, seal-breaking tools");
    expect(prompt).toContain("Names can be private facts too");
    expect(prompt).toContain("raw player claim text only");
    expect(prompt).toContain("GM Read supplies the beat anchor");
    expect(prompt).toContain("Stop once the needed backend observations are enough");
    expect(prompt).toContain("Scoped forecast pressure is advisory only");
    expect(prompt).toContain("call advance_time with the GM-estimated in-world minutes");
  });

  it("rejects a tool-backed path when the model emits no runtime tool call", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "No mutation needed.",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I promise to meet the dock worker at dawn.",
      frame: createFrame(),
      gmRead,
    })).rejects.toThrow("produced no runtime tool calls");
  });

  it("rejects a tool loop with no successful backend observations", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: { text: "Invented offscreen fact." },
            },
          ],
          toolResults: [
            {
              output: {
                success: false,
                error: "grounding_invalid",
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I promise to meet the dock worker at dawn.",
      frame: createFrame(),
      gmRead,
    })).rejects.toThrow("produced no successful backend observations");
  });

  it("does not accept advance_time alone as a state mutation receipt", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "advance_time",
              input: { minutes: 10, reason: "Waiting does not apply the requested state." },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { minutes: 10, clockAdvanced: true },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I force the stuck gate open.",
      frame: {
        ...createFrame(),
        allowedTools: ["advance_time"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player attempts to change the gate state.",
        sceneQuestion: "Does the gate state change?",
        turnIntent: "Apply the gate-state change if it succeeds.",
        runtimeRequirement: { kind: "state_mutation", effectKind: "actor_condition" },
      },
    })).rejects.toThrow("runtimeRequirement state_mutation has no active receipt-capable tool");
  });

  it("accepts multiple successful observation-only lookup calls in one assistant step", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "call-poi",
              toolName: "find_poi_candidates",
              input: {
                query: "anomaly range timing reaction",
                maxResults: 4,
              },
            },
            {
              toolCallId: "call-fact",
              toolName: "inspect_known_fact",
              input: {
                query: "known anomaly reactions to cursed energy sound or motion",
                scope: "known",
              },
            },
          ],
          toolResults: [
            {
              toolCallId: "call-poi",
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  candidates: [
                    { ref: "poi:anomaly-edge", label: "Anomaly Edge" },
                  ],
                },
              },
            },
            {
              toolCallId: "call-fact",
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  candidates: [
                    { ref: "fact:resonance-pattern", label: "Resonance Pattern" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I brace and let the anomaly commit first, watching its range, timing, and whether it reacts to cursed energy, sound, or motion.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "find_poi_candidates",
          "inspect_known_fact",
          "list_visible_affordances",
          "log_event",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player is observing the anomaly before committing.",
        sceneQuestion:
          "What existing visible or known cues can ground the anomaly's range, timing, and reactions?",
        actionInterpretation: {
          intent: "Read existing anomaly cues without changing state.",
          targetRefs: [],
        },
        turnIntent: "Ground a defensive observation beat in backend observations.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["hazards", "local_status"],
        },
      },
    });

    expect(result.text).toBe("");
    expect(result.rawToolCalls).toHaveLength(2);
    expect(result.stepResults.map((step) => step.toolName)).toEqual([
      "find_poi_candidates",
      "inspect_known_fact",
    ]);
    expect(result.stepResults.map((step) => step.status)).toEqual(["done", "done"]);
    expect(result.stepResults.every((step) => step.mutationRefs.length === 0)).toBe(true);
    expect(result.observationSummary).toContain("Local point check");
    expect(result.observationSummary).toContain("Anomaly Edge");
    expect(result.observationSummary).toContain("Known information check");
    expect(result.observationSummary).toContain("Resonance Pattern");
  });

  it("rejects authority-bearing observation results as unsafe multi-tool co-steps", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "call-contested",
              toolName: "find_poi_candidates",
              input: {
                query: "contest range timing",
                maxResults: 4,
              },
            },
            {
              toolCallId: "call-fact",
              toolName: "inspect_known_fact",
              input: {
                query: "known contested timing",
                scope: "known",
              },
            },
          ],
          toolResults: [
            {
              toolCallId: "call-contested",
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  candidates: [{ ref: "poi:contest-edge", label: "Contest Edge" }],
                },
                authority: {
                  toolResultId: "tool-result-contested",
                  campaignId: "campaign-1",
                  sourceEntity: { type: "system", id: "gm-tool-loop" },
                  baseWorldVersion: 3,
                  resultWorldVersion: 4,
                  elapsedWorldTimeMinutes: 1,
                  stateDeltaRefs: [],
                  eventRefs: [],
                  witnesses: [],
                  knowledgeOutputs: [],
                  visibilityOutputs: [],
                  resources: [],
                },
              },
            },
            {
              toolCallId: "call-fact",
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  facts: [{ ref: "fact:contest-timing", label: "Contest Timing" }],
                },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction:
        "I brace and read the contest timing before committing.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "find_poi_candidates",
          "inspect_known_fact",
          "list_visible_affordances",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player is observing a contested setup before committing.",
        sceneQuestion: "What existing cues ground the contested timing?",
        actionInterpretation: {
          intent: "Read existing contested cues without changing state.",
          targetRefs: [],
        },
        turnIntent: "Ground a defensive observation beat in backend observations.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["hazards", "local_status"],
        },
      },
    })).rejects.toThrow(
      "only settled observation-only runtime tool results may share a step",
    );
  });

  it("accepts multiple observation-only calls when tool results arrive in a later SDK step", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: { modelId: "judge-model" },
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolCallId: "call-ledger",
              toolName: "find_object_candidates",
              input: { query: "route ledger", maxResults: 4 },
            },
            {
              toolCallId: "call-writ",
              toolName: "find_object_candidates",
              input: { query: "sealed seed-writ", maxResults: 4 },
            },
            {
              toolCallId: "call-fact",
              toolName: "inspect_known_fact",
              input: { query: "current bond wording", scope: "known" },
            },
          ],
        },
        {
          toolResults: [
            {
              toolCallId: "call-ledger",
              output: {
                type: "json",
                value: {
                  success: true,
                  kind: "observation",
                  observationOnly: true,
                  result: {
                    observationOnly: true,
                    candidates: [{ ref: "item:route-ledger", label: "Route Ledger" }],
                  },
                },
              },
            },
            {
              toolCallId: "call-writ",
              output: {
                type: "json",
                value: {
                  success: true,
                  kind: "observation",
                  observationOnly: true,
                  result: {
                    observationOnly: true,
                    candidates: [{ ref: "item:sealed-seed-writ", label: "Sealed Seed-Writ" }],
                  },
                },
              },
            },
            {
              toolCallId: "call-fact",
              output: {
                type: "json",
                value: {
                  success: true,
                  kind: "observation",
                  observationOnly: true,
                  result: {
                    observationOnly: true,
                    facts: [{ ref: "fact:bond-wording", label: "Bond wording" }],
                  },
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I reread my own route ledger and check the sealed writ.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "find_object_candidates",
          "inspect_known_fact",
          "list_visible_affordances",
          "log_event",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player rereads carried documents.",
        sceneQuestion: "What current carried document and known procedural facts can be read?",
        actionInterpretation: {
          intent: "Read current carried document status without changing state.",
          targetRefs: [],
        },
        turnIntent: "Ground a private status read in backend observations.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["visible_objects", "local_status"],
        },
      },
    });

    expect(result.text).toBe("");
    expect(result.rawToolCalls.map((call) => call.toolCallId)).toEqual([
      "call-ledger",
      "call-writ",
      "call-fact",
    ]);
    expect(result.stepResults.map((step) => step.status)).toEqual(["done", "done", "done"]);
    expect(result.stepResults.every((step) => step.mutationRefs.length === 0)).toBe(true);
    expect(result.observationSummary).toContain("Object check");
    expect(result.observationSummary).toContain("Route Ledger");
    expect(result.observationSummary).toContain("Sealed Seed-Writ");
  });

  it("accepts multiple observation-only calls when one lookup reports a no-match observation", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: GM_TOOL_LOOP_STATUS_READ_COMPLETION_SENTINEL,
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "find_poi_candidates",
              input: { query: "anomaly", maxResults: 4 },
            },
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: false,
                kind: "observation",
                observationOnly: true,
                error: "No matching visible point of interest.",
                result: {},
              },
            },
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "route:market-gate", label: "Market Gate" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    const result = await runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I take stock of the anomaly and nearby routes.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "find_poi_candidates",
          "list_visible_affordances",
          "log_event",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player wants a broad visible status read.",
        sceneQuestion: "What visible local status and routes are available?",
        actionInterpretation: {
          intent: "Read local status without changing state.",
          targetRefs: [],
        },
        turnIntent: "Ground a status read with backend observations.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["routes", "local_status"],
        },
      },
    });

    expect(result.text).toBe("");
    expect(result.stepResults.map((step) => step.status)).toEqual(["skipped", "done"]);
    expect(result.stepResults.every((step) => step.mutationRefs.length === 0)).toBe(true);
    expect(result.observationSummary).toContain("Scene scan");
    expect(result.observationSummary).toContain("Market Gate");
  });

  it("rejects multiple observation calls when any result is malformed rather than observation-only", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "find_poi_candidates",
              input: { query: "anomaly", maxResults: 4 },
            },
            {
              toolName: "list_visible_affordances",
              input: { scope: "visible", maxResults: 6 },
            },
          ],
          toolResults: [
            {
              output: {
                success: false,
                error: "Tool result was not returned by the runtime tool loop.",
              },
            },
            {
              output: {
                success: true,
                kind: "observation",
                observationOnly: true,
                result: {
                  observationOnly: true,
                  affordances: [
                    { ref: "route:market-gate", label: "Market Gate" },
                  ],
                },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I take stock of the anomaly and nearby routes.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "find_poi_candidates",
          "list_visible_affordances",
          "log_event",
        ],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player wants a broad visible status read.",
        sceneQuestion: "What visible local status and routes are available?",
        actionInterpretation: {
          intent: "Read local status without changing state.",
          targetRefs: [],
        },
        turnIntent: "Ground a status read with backend observations.",
        runtimeRequirement: {
          kind: "observation_read",
          categories: ["routes", "local_status"],
        },
      },
    })).rejects.toThrow("multiple runtime tool calls");
  });

  it("rejects multiple state-bearing runtime tool calls in one assistant step", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "log_event",
              input: { text: "First event." },
            },
            {
              toolName: "log_event",
              input: { text: "Second event." },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { id: "event-1", text: "First event." },
              },
            },
            {
              output: {
                success: true,
                result: { id: "event-2", text: "Second event." },
              },
            },
          ],
        },
      ],
    });

    await expect(runGmToolLoop({
      campaignId: "campaign-1",
      provider,
      tick: 7,
      playerAction: "I promise to meet the dock worker at dawn.",
      frame: createFrame(),
      gmRead,
    })).rejects.toThrow("multiple runtime tool calls");
  });
});
