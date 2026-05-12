import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const {
  logEventMock,
  logEventExecuteMock,
  recordDialogueOutcomeExecuteMock,
  recordWorldFactExecuteMock,
  createSceneExtraExecuteMock,
  revealLocationExecuteMock,
  moveToExecuteMock,
  spawnNpcExecuteMock,
  spawnItemExecuteMock,
  advanceTimeExecuteMock,
  listVisibleAffordancesExecuteMock,
  findPoiCandidatesExecuteMock,
  inspectKnownFactExecuteMock,
  executionContextMock,
} = vi.hoisted(() => ({
  logEventMock: vi.fn(),
  logEventExecuteMock: vi.fn(),
  recordDialogueOutcomeExecuteMock: vi.fn(),
  recordWorldFactExecuteMock: vi.fn(),
  createSceneExtraExecuteMock: vi.fn(),
  revealLocationExecuteMock: vi.fn(),
  moveToExecuteMock: vi.fn(),
  spawnNpcExecuteMock: vi.fn(),
  spawnItemExecuteMock: vi.fn(),
  advanceTimeExecuteMock: vi.fn(),
  listVisibleAffordancesExecuteMock: vi.fn(),
  findPoiCandidatesExecuteMock: vi.fn(),
  inspectKnownFactExecuteMock: vi.fn(),
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
  },
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
  redactModelFacingJson: vi.fn((value: unknown) => value),
  shouldDropModelFacingText: vi.fn(() => false),
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
  createStorytellerTools: vi.fn(() => ({
    list_visible_affordances: { description: "List visible affordances tool", execute: listVisibleAffordancesExecuteMock },
    find_poi_candidates: { description: "Find POI candidates tool", execute: findPoiCandidatesExecuteMock },
    inspect_known_fact: { description: "Inspect known fact tool", execute: inspectKnownFactExecuteMock },
    log_event: { description: "Log event tool", execute: logEventExecuteMock },
    record_dialogue_outcome: { description: "Record dialogue outcome tool", execute: recordDialogueOutcomeExecuteMock },
    record_world_fact: { description: "Record world fact tool", execute: recordWorldFactExecuteMock },
    create_scene_extra: { description: "Create scene extra tool", execute: createSceneExtraExecuteMock },
    reveal_location: { description: "Reveal location tool", execute: revealLocationExecuteMock },
    move_to: { description: "Move to tool", execute: moveToExecuteMock },
    spawn_npc: { description: "Spawn NPC tool", execute: spawnNpcExecuteMock },
    spawn_item: { description: "Spawn Item tool", execute: spawnItemExecuteMock },
    advance_time: { description: "Advance time tool", execute: advanceTimeExecuteMock },
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
  GM_TOOL_LOOP_TIMEOUT_MS,
  GM_TOOL_LOOP_TRANSPORT_MAX_RETRIES,
  runGmToolLoop,
} from "../gm-tool-loop.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import type { GmRead } from "../gm-turn-read.js";
import type { SceneFrame } from "../scene-frame.js";

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
  rationale: "A promise should persist for future continuity.",
  evidenceRefs: ["actor-player"],
  narrationGuardrails: [],
  turnIntent: "Record the promise as future-relevant memory.",
  runtimeRequirement: {
    kind: "scene_beat",
    durability: "durable",
  },
};

function generateTextMock(): Mock {
  return generateText as unknown as Mock;
}

describe("runGmToolLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    executionContextMock.currentLocationId = "loc-market";
    executionContextMock.currentSceneScopeId = "scene-market";
    executionContextMock.legalLocationRefs = new Set(["current_location", "current_scene", "loc-market", "scene-market"]);
    executionContextMock.legalActorRefs = new Set(["actor-player", "player"]);
    executionContextMock.legalItemRefs = new Set();
    executionContextMock.legalFactionRefs = new Set();
    executionContextMock.currentLocationRefs = new Set(["current_location", "loc-market", "market"]);
    executionContextMock.currentSceneRefs = new Set(["current_scene", "scene-market", "market counter"]);
    executionContextMock.legalMovementRefs = new Set();
    logEventExecuteMock.mockResolvedValue({ success: true, result: {} });
    recordDialogueOutcomeExecuteMock.mockResolvedValue({ success: true, result: {} });
    createSceneExtraExecuteMock.mockResolvedValue({
      success: true,
      result: { id: "actor-scene-extra-1", name: "Local Clerk", role: "clerk" },
    });
    revealLocationExecuteMock.mockResolvedValue({ success: true, result: { id: "loc-back-room", name: "Back Room" } });
    moveToExecuteMock.mockResolvedValue({ success: true, result: { locationId: "loc-back-room", locationName: "Back Room" } });
    spawnNpcExecuteMock.mockResolvedValue({ success: true, result: { id: "npc-1" } });
    spawnItemExecuteMock.mockResolvedValue({ success: true, result: { id: "item-1" } });
    advanceTimeExecuteMock.mockResolvedValue({ success: true, result: { minutes: 60, clockAdvanced: true } });
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
              input: { text: "The dawn appointment is promised." },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: {
                  eventId: "event-1",
                  text: "The dawn appointment is promised.",
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
            },
          ],
          toolResults: [
            {
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
                  futureUseKind: "permission_check",
                  futureRelevance:
                    "The named bridge office and failed logbook requirement should guide later permit attempts.",
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
        "I show only the documents I actually have and ask which one fails their permit requirement.",
      frame: {
        ...createFrame(),
        allowedTools: [
          "list_visible_affordances",
          "find_object_candidates",
          "find_actor_candidates",
          "inspect_known_fact",
          "create_scene_extra",
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
    expect(Object.keys(generateArgs.tools)).not.toContain("spawn_npc");
    expect(Object.keys(generateArgs.tools)).not.toContain("reveal_location");
    expect(Object.keys(generateArgs.tools)).not.toContain("move_to");
    expect(Object.keys(generateArgs.tools)).not.toContain("transfer_item");
    expect(generateArgs.maxOutputTokens).toBe(GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_OUTPUT_TOKENS);
    expect(generateArgs.timeout).toEqual({
      totalMs: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_TIMEOUT_MS,
    });
    expect(generateArgs.stopWhen).toEqual({
      type: "step-count",
      count: GM_TOOL_LOOP_PROCEDURAL_CONVERSATION_MAX_STEPS,
    });
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]?.toolName).toBe("record_dialogue_outcome");
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
      speakerRef: "actor-concourse-disputes-clerk",
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
      sourceRefs: ["actor-concourse-disputes-clerk"],
    };
    createSceneExtraExecuteMock.mockResolvedValueOnce({
      success: true,
      result: {
        id: "actor-concourse-disputes-clerk",
        name: "Concourse Disputes Clerk",
        role: "clerk",
      },
    });
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce({
      success: true,
      result: {
        eventId: "event-support-responder-dialogue",
        speakerRef: "actor-concourse-disputes-clerk",
        outcomeKind: "redirected",
        topicKind: "procedure",
        authorityKind: "role_authority",
        truthStatus: "speaker_asserted",
        durability: "durable",
        futureUseKind: "next_step",
        futureRelevance:
          "The clerk's next-step redirect constrains where the courier should take the sealed message next.",
      },
    });
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
  });

  it("uses typed GM Read runtimeRequirement for dialogue outcomes without English regex cues", async () => {
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
                  durability: "durable",
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
              output: {
                success: true,
                result: {
                  knowledgeId: "knowledge-1",
                  factKind: "status",
                  topicKind: "social",
                  truthStatus: "disputed",
                  durability: "durable",
                  futureUseKind: "npc_memory",
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
        allowedTools: ["list_visible_affordances"],
      } as SceneFrame,
      gmRead: {
        ...gmRead,
        situationSummary: "The player follows concrete route guidance.",
        sceneQuestion: "Does this movement expose a persistent route?",
        turnIntent: "Resolve the concrete route interaction.",
      },
    })).rejects.toThrow("future-relevant concrete pressure");
  });

  it("requires conversational tool-plan turns to create a visible NPC outcome log event", async () => {
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
              output: {
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
    })).rejects.toThrow("reusable procedural conversation");
  });

  it("accepts reusable procedural NPC answers when the outcome is durable and future-relevant", async () => {
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
              output: {
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
    recordDialogueOutcomeExecuteMock.mockResolvedValueOnce({
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
    });
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
    expect(prompt).toContain('"alias": "current_location"');
    expect(prompt).toContain('"ref": "location:loc-market"');
    expect(prompt).toContain('"alias": "current_scene"');
    expect(prompt).toContain('"ref": "location:scene-market"');
    expect(prompt).not.toContain("Hidden Tea Broker");
    expect(prompt).not.toContain("npc-hidden-tea-broker");
    expect(prompt).not.toContain("actor-hidden-tea-broker");
  });

  it("returns failed observations for repeated equivalent dynamic creation calls", async () => {
    generateTextMock().mockResolvedValueOnce({
      text: "",
      finishReason: "stop",
      response: null,
      usage: null,
      steps: [
        {
          toolCalls: [
            {
              toolName: "spawn_npc",
              input: { name: "Counter Clerk", locationRef: "current_scene", tags: ["service"] },
            },
          ],
          toolResults: [
            {
              output: {
                success: true,
                result: { id: "npc-1", name: "Counter Clerk" },
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
      playerAction: "I bring the counter worker into focus.",
      frame: {
        ...createFrame(),
        allowedTools: ["spawn_npc"],
      } as SceneFrame,
      gmRead,
    });

    const toolSet = generateTextMock().mock.calls[0]?.[0]?.tools as
      | { spawn_npc?: { execute?: (input: unknown) => Promise<unknown> } }
      | undefined;
    const spawnNpc = toolSet?.spawn_npc;

    await expect(spawnNpc?.execute?.({
      name: "Counter Clerk",
      locationRef: "current_scene",
      tags: ["service"],
    })).resolves.toMatchObject({ success: true });
    await expect(spawnNpc?.execute?.({
      name: "Counter Clerk",
      locationRef: "current_scene",
      tags: ["service"],
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("semantic_budget_exceeded"),
    });
    expect(spawnNpcExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("blocks private forecast terms before runtime tool execution", async () => {
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
              input: {
                text: "A public delay is remembered.",
                durability: "scene_local",
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
                  durability: "scene_local",
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

    await expect(toolSet?.log_event?.execute?.({
      text: "District watchers mark Mira as suspicious.",
      durability: "durable",
      futureRelevance: "District watchers may remember this later.",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("private_source_boundary_term_in_tool_input"),
    });
    expect(logEventExecuteMock).not.toHaveBeenCalled();
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
      gmRead,
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

  it("rejects access-granting tools for unconfirmed key or permit claims", async () => {
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
              toolCallId: "call-safe",
              input: { text: "The claimed key attempt fails.", durability: "scene_local" },
            },
          ],
          toolResults: [
            {
              toolCallId: "call-safe",
              output: {
                success: true,
                result: { durability: "scene_local", persisted: false },
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
      playerAction:
        "I claim I already have the master key to every signal-house door and try to unlock the nearest sealed office.",
      frame: {
        ...createFrame(),
        allowedTools: ["log_event", "reveal_location", "move_to", "spawn_item"],
      } as SceneFrame,
      gmRead,
    });

    const toolSet = generateTextMock().mock.calls[0]?.[0]?.tools as
      | {
          reveal_location?: { execute?: (input: unknown) => Promise<unknown> };
          move_to?: { execute?: (input: unknown) => Promise<unknown> };
          spawn_item?: { execute?: (input: unknown) => Promise<unknown> };
          log_event?: { execute?: (input: unknown) => Promise<unknown> };
        }
      | undefined;

    await expect(toolSet?.reveal_location?.execute?.({
      name: "Sealed Signal-House Office",
      tags: ["locked", "staff-only"],
      connectedToName: "current_location",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    await expect(toolSet?.move_to?.execute?.({
      targetLocationName: "Sealed Signal-House Office",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    await expect(toolSet?.spawn_item?.execute?.({
      name: "Signal-House Master Key",
      ownerName: "Player",
      ownerType: "character",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    await expect(toolSet?.log_event?.execute?.({
      text: "Mira gained entry to the sealed office.",
      durability: "durable",
    })).resolves.toMatchObject({
      success: false,
      error: expect.stringContaining("unconfirmed_access_claim"),
    });
    await expect(toolSet?.log_event?.execute?.({
      text: "Mira's claimed key attempt fails visibly.",
      durability: "scene_local",
    })).resolves.toMatchObject({ success: true });

    expect(revealLocationExecuteMock).not.toHaveBeenCalled();
    expect(moveToExecuteMock).not.toHaveBeenCalled();
    expect(spawnItemExecuteMock).not.toHaveBeenCalled();
    expect(logEventExecuteMock).toHaveBeenCalledTimes(1);
  });

  it("rejects prose-only future-relevant pressure before generic no-call handling", async () => {
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
    })).rejects.toThrow("future-relevant concrete pressure");
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
  ])("rejects P86-F001 prose pressure with only scene-local observations: $label", async ({ text }) => {
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
    })).rejects.toThrow("future-relevant concrete pressure");
  });

  it.each([
    {
      label: "raised voices and inspection dispute",
      allowedTools: ["spawn_npc"],
      text:
        "Raised voices spread into an inspection dispute as a dockworker with a clipboard keeps watching the count.",
      toolCall: {
        toolName: "spawn_npc",
        input: {
          name: "Clipboard Dockworker",
          locationRef: "current_scene",
          tags: ["dockworker", "inspection", "witness"],
        },
      },
      toolResult: {
        success: true,
        result: { id: "npc-dockworker", name: "Clipboard Dockworker" },
      },
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
      },
    },
    {
      label: "recessed door and narrow stair route",
      allowedTools: ["reveal_location"],
      text:
        "A recessed maintenance-like door opens onto a narrow stair and iron-banded door.",
      toolCall: {
        toolName: "reveal_location",
        input: {
          name: "Narrow Service Stair",
          description: "A recessed maintenance-like door opens onto a narrow stair.",
          tags: ["route", "service", "local"],
          connectedToName: "current_scene",
        },
      },
      toolResult: {
        success: true,
        result: { id: "loc-service-stair", name: "Narrow Service Stair" },
      },
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
          text: "Violence changed Dol's posture and made the bridge route more dangerous.",
        },
      },
    },
  ])("accepts P86-F001 pressure when backed by state-bearing observations: $label", async ({
    allowedTools,
    text,
    toolCall,
    toolResult,
  }) => {
    generateTextMock().mockResolvedValueOnce({
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
      gmRead,
    });

    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0]).toMatchObject({
      status: "done",
      toolName: toolCall.toolName,
    });
  });

  it("allows explicitly sensory non-durable tool-loop text when a backend observation exists", async () => {
    generateTextMock().mockResolvedValueOnce({
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
      gmRead,
    })).resolves.toMatchObject({
      rawToolCalls: expect.any(Array),
      stepResults: [expect.objectContaining({ toolName: "log_event" })],
    });
  });

  it("adds successful reveal_location and move_to observations to later tool-call grounding refs", async () => {
    generateTextMock().mockResolvedValueOnce({
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
        allowedTools: ["reveal_location", "move_to", "spawn_npc"],
      } as SceneFrame,
      gmRead,
    });

    const toolSet = generateTextMock().mock.calls[0]?.[0]?.tools as
      | {
        reveal_location?: { execute?: (input: unknown) => Promise<unknown> };
        move_to?: { execute?: (input: unknown) => Promise<unknown> };
      }
      | undefined;

    await expect(toolSet?.reveal_location?.execute?.({
      name: "Back Room",
      description: "A cramped service room behind the counter.",
      tags: ["service", "local"],
      connectedToName: "current_scene",
    })).resolves.toMatchObject({ success: true });
    expect(executionContextMock.legalLocationRefs.has("loc-back-room")).toBe(true);
    expect(executionContextMock.legalLocationRefs.has("back room")).toBe(true);
    expect(executionContextMock.legalMovementRefs.has("back room")).toBe(true);

    await expect(toolSet?.move_to?.execute?.({
      targetLocationName: "Back Room",
    })).resolves.toMatchObject({ success: true });
    expect(executionContextMock.currentLocationId).toBe("loc-back-room");
    expect(executionContextMock.currentSceneScopeId).toBe("loc-back-room");
    expect(executionContextMock.currentLocationRefs.has("current_location")).toBe(true);
    expect(executionContextMock.currentSceneRefs.has("back room")).toBe(true);
  });

  it("keeps spawn_item available but blocks repeated equivalent item creation in one loop", async () => {
    generateTextMock().mockResolvedValueOnce({
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
      gmRead,
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
    spawnItemExecuteMock.mockResolvedValueOnce({
      success: true,
      result: { id: "item-1", name: "Sealed Route Chit" },
    });

    await expect(toolSet?.spawn_item?.execute?.(input)).resolves.toMatchObject({ success: true });
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
        allowedTools: ["reveal_location", "move_to", "spawn_npc", "spawn_item"],
      } as SceneFrame,
      gmRead,
    });

    expect(prompt).toContain("call reveal_location first");
    expect(prompt).toContain("prefer the literal alias current_scene/current_location");
    expect(prompt).toContain("call move_to after reveal_location succeeds");
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

  it("rejects multiple observation calls in one assistant step when any result failed", async () => {
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
