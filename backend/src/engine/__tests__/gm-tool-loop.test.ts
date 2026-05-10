import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

const {
  logEventMock,
  logEventExecuteMock,
  revealLocationExecuteMock,
  moveToExecuteMock,
  spawnNpcExecuteMock,
  spawnItemExecuteMock,
  advanceTimeExecuteMock,
  findPoiCandidatesExecuteMock,
  executionContextMock,
} = vi.hoisted(() => ({
  logEventMock: vi.fn(),
  logEventExecuteMock: vi.fn(),
  revealLocationExecuteMock: vi.fn(),
  moveToExecuteMock: vi.fn(),
  spawnNpcExecuteMock: vi.fn(),
  spawnItemExecuteMock: vi.fn(),
  advanceTimeExecuteMock: vi.fn(),
  findPoiCandidatesExecuteMock: vi.fn(),
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
      location: { id: "loc-market", name: "Market" },
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
    find_poi_candidates: { description: "Find POI candidates tool", execute: findPoiCandidatesExecuteMock },
    log_event: { description: "Log event tool", execute: logEventExecuteMock },
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
import { buildGmToolLoopPrompt, GM_TOOL_LOOP_MAX_STEPS, runGmToolLoop } from "../gm-tool-loop.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";
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
    revealLocationExecuteMock.mockResolvedValue({ success: true, result: { id: "loc-back-room", name: "Back Room" } });
    moveToExecuteMock.mockResolvedValue({ success: true, result: { locationId: "loc-back-room", locationName: "Back Room" } });
    spawnNpcExecuteMock.mockResolvedValue({ success: true, result: { id: "npc-1" } });
    spawnItemExecuteMock.mockResolvedValue({ success: true, result: { id: "item-1" } });
    advanceTimeExecuteMock.mockResolvedValue({ success: true, result: { minutes: 60, clockAdvanced: true } });
    findPoiCandidatesExecuteMock.mockResolvedValue({
      success: true,
      kind: "observation",
      observationOnly: true,
      result: {
        observationOnly: true,
        candidates: [{ ref: "location:tea-lane", label: "Tea Lane" }],
      },
    });
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
      stopWhen: { type: "step-count", count: GM_TOOL_LOOP_MAX_STEPS },
    }));
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
      playerAction: "I ask who works the counter.",
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

  it("rejects multiple runtime tool calls in one assistant step", async () => {
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
