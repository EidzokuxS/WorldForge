import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { buildRuntimeToolInputContract } from "../prompt-contracts.js";
import { runScenePlanner } from "../scene-planner.js";
import {
  SemanticScenePlanMappingError,
  semanticScenePlanSchema,
  semanticScenePlanToStrictPlan,
} from "../semantic-scene-plan-schema.js";
import {
  SCENE_PLAN_ACTION_LIMIT,
  SCENE_PLAN_DEFERRED_HOOK_LIMIT,
  SCENE_PLAN_HIDDEN_RATIONALE_MAX,
  SCENE_PLAN_SUPPORT_RESPONSE_LIMIT,
  buildScenePlanContract,
  formatScenePlanValidationIssues,
  sanitizeScenePlanCandidate,
  scenePlanLooseSchema,
  scenePlanSchema,
} from "../scene-plan-schema.js";
import type { SceneFrame } from "../scene-frame.js";

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => ({ modelId: "judge-test-model" })),
}));

const playerId = "11111111-1111-4111-8111-111111111111";
const npcId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const responseId = "44444444-4444-4444-8444-444444444444";
const actionId = "55555555-5555-4555-8555-555555555555";
const hiddenNpcId = "77777777-7777-4777-8777-777777777777";

const generatedIds = [
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005",
  "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0006",
];

function createValidPlan() {
  return {
    actionInterpretation: {
      actorId: playerId,
      intent: "open negotiation",
      method: "measured speech",
      targetIds: [npcId],
    },
    anchorEvent: {
      id: eventId,
      actorId: playerId,
      subjectIds: [npcId],
      kind: "player_action",
    },
    primaryResponse: {
      id: responseId,
      actorId: npcId,
      responseKind: "spoken",
      eventId,
      visibleToPlayer: true,
    },
    supportResponses: [],
    plannedActions: [
      {
        id: actionId,
        actorId: npcId,
        toolName: "log_event",
        input: {
          text: "The road warden acknowledges the player's question.",
          importance: 3,
          participants: ["Road Warden", "Player"],
        },
      },
    ],
    deferredHooks: [],
    narratorFacts: {
      anchorEventId: eventId,
      eventIds: [eventId],
      responseIds: [responseId],
      actionIds: [actionId],
      toolResultRefs: [
        {
          actionId,
          toolName: "log_event",
        },
      ],
    },
    hiddenRationale: "The Oracle result allows contact, not instant compliance.",
  };
}

function nextGeneratedIdFactory() {
  let index = 0;
  return () => generatedIds[index++] ?? "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa9999";
}

function createSemanticPlan(overrides: Record<string, unknown> = {}) {
  return {
    actionInterpretation: {
      actorRef: "Player",
      intent: "open negotiation",
      method: "measured speech",
      targetRefs: ["Road Warden"],
    },
    primaryResponse: {
      actorRef: npcId,
      responseKind: "spoken",
      visibleToPlayer: true,
      targetRefs: [playerId],
    },
    supportResponses: [
      {
        actorRef: "Player",
        responseKind: "gesture",
        visibleToPlayer: true,
        targetRefs: ["Road Warden"],
      },
    ],
    plannedActions: [
      {
        actorRef: "Road Warden",
        toolName: "log_event",
        input: {
          text: "The road warden acknowledges the player's question.",
          importance: 3,
          participants: ["Road Warden", "Player"],
        },
      },
    ],
    deferredHooks: [
      {
        hookType: "memory",
        subjectRefs: ["Road Warden"],
        reason: "Remember that the player asked about the road incident.",
      },
    ],
    hiddenRationale: "The Oracle result allows contact, not instant compliance.",
    ...overrides,
  };
}

function safeResult<T>(object: T) {
  return {
    object,
    trace: {
      text: JSON.stringify(object),
      cleanedText: JSON.stringify(object),
    },
  };
}

function createFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 4,
    playerActorId: playerId,
    currentLocationId: "99999999-9999-4999-8999-999999999999",
    currentSceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    playerAction: "Ask the road warden what happened.",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Player",
          locationId: "99999999-9999-4999-8999-999999999999",
          sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          awareness: "clear",
        },
        {
          id: npcId,
          actorId: npcId,
          type: "npc",
          label: "Road Warden",
          locationId: "99999999-9999-4999-8999-999999999999",
          sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          awareness: "clear",
        },
      ],
      support: [],
      background: [
        {
          id: hiddenNpcId,
          actorId: hiddenNpcId,
          type: "npc",
          label: "Hidden Watcher",
          locationId: "99999999-9999-4999-8999-999999999999",
          sceneScopeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
      forbiddenActorIds: [hiddenNpcId],
      forbiddenActorLabels: ["Hidden Watcher"],
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event", "offer_quick_actions"],
    oracleContext: null,
    combatEnvelope: null,
    oracle: { outcome: "weak_hit" },
    ...overrides,
  };
}

const provider: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "test-key",
  model: "judge-model",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runtime tool prompt contracts", () => {
  it("omits out-of-scope quick-action examples for log_event-only contracts", () => {
    const contract = buildRuntimeToolInputContract({ toolNames: ["log_event"] });

    expect(contract).toContain('"log_event" input');
    expect(contract).toContain(
      '{ "text": string, "importance": number 1-10, "participants": string[], "durability"?: "durable"|"scene_local", "futureRelevance"?: string }',
    );
    expect(contract).toContain('Default durability is "scene_local"');
    expect(contract).toContain("Participants must be clear local/current actors");
    expect(contract).toContain("Do not use durable log_event to grant or confirm player possession");
    expect(contract).toContain("If the player is bluffing, requesting, attempting, being refused, or being merely witnessed");
    expect(contract).toContain("nested runtime tool calls only");
    expect(contract).not.toContain('Minimal valid output:\n{ "actions": [] }');
    expect(contract).not.toContain("offer_quick_actions");
    expect(contract).not.toContain('missing "actions[].action"');
  });

  it("keeps quick-action shape and invalid example for quick-action contracts", () => {
    const contract = buildRuntimeToolInputContract({
      toolNames: ["offer_quick_actions"],
    });

    expect(contract).toContain('"offer_quick_actions" input');
    expect(contract).toContain(
      '{ "actions": [{ "label": string, "action": string }] }',
    );
    expect(contract).toContain('missing "actions[].action"');
  });

  it("tells reveal_location to use exact current anchors instead of paraphrased labels", () => {
    const contract = buildRuntimeToolInputContract({ toolNames: ["reveal_location"] });

    expect(contract).toContain('"reveal_location" input');
    expect(contract).toContain('Use connectedToName "current_scene" or "current_location"');
    expect(contract).toContain('"connectedToName": "current_location"');
  });

  it("omits specific tool examples when no runtime tools are allowed", () => {
    const contract = buildRuntimeToolInputContract({ toolNames: [] });

    expect(contract).toContain("no runtime tools are allowed");
    expect(contract).not.toContain('"log_event" input');
    expect(contract).not.toContain('"offer_quick_actions" input');
    expect(contract).not.toContain('"toolName": "');
  });
});

describe("ScenePlan schema", () => {
  it("maps semantic ScenePlan refs into backend-generated strict ScenePlan references", () => {
    const strictPlan = semanticScenePlanToStrictPlan(
      createSemanticPlan(),
      createFrame(),
      { idFactory: nextGeneratedIdFactory() },
    );

    expect(semanticScenePlanSchema.safeParse(createSemanticPlan()).success).toBe(true);
    expect(strictPlan.actionInterpretation).toMatchObject({
      actorId: playerId,
      targetIds: [npcId],
    });
    expect(strictPlan.anchorEvent).toMatchObject({
      id: generatedIds[0],
      actorId: playerId,
      subjectIds: [npcId],
    });
    expect(strictPlan.primaryResponse).toMatchObject({
      id: generatedIds[1],
      actorId: npcId,
      eventId: generatedIds[0],
      targetIds: [playerId],
    });
    expect(strictPlan.supportResponses[0]).toMatchObject({
      id: generatedIds[2],
      actorId: playerId,
      eventId: generatedIds[0],
      targetIds: [npcId],
    });
    expect(strictPlan.plannedActions[0]).toMatchObject({
      id: generatedIds[3],
      actorId: npcId,
      toolName: "log_event",
    });
    expect(strictPlan.deferredHooks[0]).toMatchObject({
      id: generatedIds[4],
      subjectIds: [npcId],
    });
    expect(strictPlan.narratorFacts).toEqual({
      anchorEventId: generatedIds[0],
      eventIds: [generatedIds[0]],
      responseIds: [generatedIds[1], generatedIds[2]],
      actionIds: [generatedIds[3]],
      toolResultRefs: [{ actionId: generatedIds[3], toolName: "log_event" }],
    });
    expect(scenePlanSchema.safeParse(strictPlan).success).toBe(true);
  });

  it("derives omitted semantic planned action actorRef from actionInterpretation.actorRef", () => {
    const strictPlan = semanticScenePlanToStrictPlan(
      createSemanticPlan({
        plannedActions: [
          {
            toolName: "log_event",
            input: {
              text: "The player is logged as asking a precise question.",
              importance: 2,
              participants: ["Player"],
            },
          },
        ],
      }),
      createFrame(),
      { idFactory: nextGeneratedIdFactory() },
    );

    expect(strictPlan.plannedActions[0]?.actorId).toBe(playerId);
  });

  it("maps semantic planned action payload alias to strict input", () => {
    const payload = {
      text: "The road warden records the player's dessert inquiry.",
      importance: 2,
      participants: ["Road Warden", "Player"],
    };

    const strictPlan = semanticScenePlanToStrictPlan(
      createSemanticPlan({
        plannedActions: [
          {
            actorRef: "Road Warden",
            toolName: "log_event",
            payload,
          },
        ],
      }),
      createFrame(),
      { idFactory: nextGeneratedIdFactory() },
    );

    expect(strictPlan.plannedActions[0]).toMatchObject({
      toolName: "log_event",
      input: payload,
    });
    expect("payload" in (strictPlan.plannedActions[0] as object)).toBe(false);
  });

  it("normalizes nested quick-action entries that omit action text before strict parse", () => {
    const strictPlan = semanticScenePlanToStrictPlan(
      createSemanticPlan({
        plannedActions: [
          {
            actorRef: "Road Warden",
            toolName: "log_event",
            input: {
              text: "The player searches the plaza for a dessert vendor.",
              importance: 2,
              participants: ["Player"],
            },
          },
          {
            actorRef: "Player",
            toolName: "offer_quick_actions",
            input: {
              actions: [
                { label: "Follow the sweet smell" },
                { label: "Ask a passerby" },
                { label: "Check the station arcade" },
              ],
            },
          },
        ],
      }),
      createFrame(),
      { idFactory: nextGeneratedIdFactory() },
    );

    expect(strictPlan.plannedActions[1]).toMatchObject({
      toolName: "offer_quick_actions",
      input: {
        actions: [
          {
            label: "Follow the sweet smell",
            action: "Follow the sweet smell",
          },
          {
            label: "Ask a passerby",
            action: "Ask a passerby",
          },
          {
            label: "Check the station arcade",
            action: "Check the station arcade",
          },
        ],
      },
    });
    expect(scenePlanSchema.safeParse(strictPlan).success).toBe(true);
  });

  it("drops malformed quick-action actions that have no recoverable actions array", () => {
    const strictPlan = semanticScenePlanToStrictPlan(
      createSemanticPlan({
        plannedActions: [
          {
            actorRef: "Player",
            toolName: "offer_quick_actions",
            input: {
              label: "Follow the sweet smell",
            },
          },
        ],
      }),
      createFrame(),
      { idFactory: nextGeneratedIdFactory() },
    );

    expect(strictPlan.plannedActions).toEqual([]);
    expect(strictPlan.narratorFacts.actionIds).toEqual([]);
    expect(strictPlan.narratorFacts.toolResultRefs).toEqual([]);
    expect(scenePlanSchema.safeParse(strictPlan).success).toBe(true);
  });

  it("deterministically caps overlong semantic hiddenRationale before repair is needed", () => {
    const parsed = semanticScenePlanSchema.parse({
      ...createSemanticPlan(),
      hiddenRationale: ` ${"x".repeat(SCENE_PLAN_HIDDEN_RATIONALE_MAX + 120)} `,
    });

    expect(parsed.hiddenRationale).toHaveLength(SCENE_PLAN_HIDDEN_RATIONALE_MAX);
  });

  it("returns machine-readable semantic mapping issues for missing toolName", () => {
    expect(() =>
      semanticScenePlanToStrictPlan(
        createSemanticPlan({
          plannedActions: [
            {
              actorRef: "Road Warden",
              payload: {
                text: "A malformed action with no semantic tool intent.",
              },
            },
          ],
        }),
        createFrame(),
        { idFactory: nextGeneratedIdFactory() },
      ),
    ).toThrow(SemanticScenePlanMappingError);

    try {
      semanticScenePlanToStrictPlan(
        createSemanticPlan({
          plannedActions: [{ actorRef: "Road Warden", payload: {} }],
        }),
        createFrame(),
        { idFactory: nextGeneratedIdFactory() },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(SemanticScenePlanMappingError);
      expect((error as SemanticScenePlanMappingError).issues).toEqual([
        expect.objectContaining({
          code: "missing_toolName",
          path: "plannedActions.0.toolName",
        }),
      ]);
    }
  });

  it("parses a valid ScenePlan with RuntimeToolName actions and bounded hiddenRationale", () => {
    const parsed = scenePlanSchema.parse(createValidPlan());

    expect(parsed.plannedActions[0]?.toolName).toBe("log_event");
    expect(parsed.hiddenRationale.length).toBeLessThanOrEqual(
      SCENE_PLAN_HIDDEN_RATIONALE_MAX,
    );
  });

  it("rejects extra top-level keys", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        proseSummary: "This extra prose key must not be accepted.",
      }),
    ).toThrow();
  });

  it("rejects more than 8 planned actions", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        plannedActions: Array.from({ length: SCENE_PLAN_ACTION_LIMIT + 1 }, (_, index) => ({
          id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
          actorId: npcId,
          toolName: "log_event",
          input: {
            text: `Event ${index}`,
            importance: 2,
            participants: ["Road Warden"],
          },
        })),
      }),
    ).toThrow();
  });

  it("rejects more than 2 support response entries", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        supportResponses: Array.from({ length: SCENE_PLAN_SUPPORT_RESPONSE_LIMIT + 1 }, (_, index) => ({
          id: `66666666-6666-4666-8666-${String(index).padStart(12, "0")}`,
          actorId: npcId,
          responseKind: "gesture",
          eventId,
          visibleToPlayer: true,
        })),
      }),
    ).toThrow();
  });

  it("rejects display-name actor ID references instead of backend actor IDs", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        primaryResponse: {
          ...createValidPlan().primaryResponse,
          actorId: "Road Warden",
        },
      }),
    ).toThrow();
  });

  it("rejects narratorFacts prose fields such as summary, description, or text", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        narratorFacts: {
          ...createValidPlan().narratorFacts,
          text: "Hidden prose must not bypass packet filtering.",
        },
      }),
    ).toThrow();
  });

  it("rejects invalid tool inputs through runtimeToolInputSchemas", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        plannedActions: [
          {
            id: actionId,
            actorId: npcId,
            toolName: "add_tag",
            input: {
              entityName: "Road Warden",
              tag: "alert",
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("rejects overlong bounded strings", () => {
    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        actionInterpretation: {
          ...createValidPlan().actionInterpretation,
          intent: "x".repeat(161),
        },
      }),
    ).toThrow();

    expect(() =>
      scenePlanSchema.parse({
        ...createValidPlan(),
        hiddenRationale: "x".repeat(SCENE_PLAN_HIDDEN_RATIONALE_MAX + 1),
      }),
    ).toThrow();
  });

  it("exposes a loose schema that accepts repairable model candidates before strict parse", () => {
    const candidate = {
      ...createValidPlan(),
      actionInterpretation: {
        ...createValidPlan().actionInterpretation,
        intent: "  open negotiation  ",
      },
    };

    expect(scenePlanLooseSchema.parse(candidate).actionInterpretation.intent).toBe(
      "open negotiation",
    );
  });

  it("sanitizes repairable candidates without inventing actor IDs or accepting display names", () => {
    const sanitized = sanitizeScenePlanCandidate(
      {
        ...createValidPlan(),
        actionInterpretation: {
          ...createValidPlan().actionInterpretation,
          actorId: playerId,
          intent: "  open negotiation  ",
        },
        plannedActions: [
          {
            id: actionId,
            actorId: "Road Warden",
            toolName: "log_event",
            input: {
              text: "The road warden acknowledges the player's question.",
              importance: 3,
              participants: ["Road Warden", "Player"],
            },
          },
        ],
      },
      createFrame(),
    );

    expect(sanitized.actionInterpretation.intent).toBe("open negotiation");
    expect(sanitized.plannedActions[0]?.actorId).toBe("Road Warden");
    expect(scenePlanSchema.safeParse(sanitized).success).toBe(false);
  });

  it("normalizes repairable plannedActions with payload and missing actorId before strict parse", () => {
    const payload = {
      text: "The player searches the plaza for a dessert vendor.",
      importance: 2,
      participants: ["Player"],
    };

    const sanitized = sanitizeScenePlanCandidate(
      {
        ...createValidPlan(),
        plannedActions: [
          {
            id: actionId,
            toolName: "logEvent",
            payload,
          },
        ],
      },
      createFrame(),
    );

    expect(sanitized.plannedActions[0]).toMatchObject({
      id: actionId,
      actorId: playerId,
      toolName: "log_event",
      input: payload,
    });
    expect(scenePlanSchema.safeParse(sanitized).success).toBe(true);
  });

  it("drops plannedActions with no runtime tool name instead of triggering loose Zod repair", () => {
    const sanitized = sanitizeScenePlanCandidate(
      {
        ...createValidPlan(),
        plannedActions: [
          {
            payload: {
              query: "parfait vendor",
            },
          },
        ],
        narratorFacts: {
          ...createValidPlan().narratorFacts,
          actionIds: ["missing-action"],
          toolResultRefs: [{ actionId: "missing-action" }],
        },
      },
      createFrame(),
    );

    expect(sanitized.plannedActions).toEqual([]);
    expect(sanitized.narratorFacts.actionIds).toEqual([]);
    expect(sanitized.narratorFacts.toolResultRefs).toEqual([]);
    expect(scenePlanSchema.safeParse(sanitized).success).toBe(true);
  });

  it("assigns structural IDs to valid plannedActions and rewrites narratorFacts refs", () => {
    const payload = {
      text: "The player searches the plaza for a dessert vendor.",
      importance: 2,
      participants: ["Player"],
    };

    const sanitized = sanitizeScenePlanCandidate(
      {
        ...createValidPlan(),
        plannedActions: [
          {
            actionId: "local-action-1",
            type: "logEvent",
            payload,
          },
        ],
        narratorFacts: {
          ...createValidPlan().narratorFacts,
          actionIds: ["local-action-1"],
          toolResultRefs: [{ action_id: "local-action-1", tool: "logEvent" }],
        },
      },
      createFrame(),
    );

    expect(sanitized.plannedActions[0]).toMatchObject({
      id: "55555555-5555-4555-8555-000000000001",
      actorId: playerId,
      toolName: "log_event",
      input: payload,
    });
    expect(sanitized.narratorFacts.actionIds).toEqual([
      "55555555-5555-4555-8555-000000000001",
    ]);
    expect(sanitized.narratorFacts.toolResultRefs).toEqual([
      {
        actionId: "55555555-5555-4555-8555-000000000001",
        toolName: "log_event",
      },
    ]);
    expect(scenePlanSchema.safeParse(sanitized).success).toBe(true);
  });

  it("drops unsupported model-invented plannedActions instead of failing loose schema parsing", () => {
    const sanitized = sanitizeScenePlanCandidate(
      {
        ...createValidPlan(),
        plannedActions: [
          {
            id: actionId,
            toolName: "search_environment",
            payload: {
              query: "parfait vendor",
            },
          },
        ],
        narratorFacts: {
          ...createValidPlan().narratorFacts,
          actionIds: [actionId],
          toolResultRefs: [{ actionId, toolName: "search_environment" }],
        },
      },
      createFrame(),
    );

    expect(sanitized.plannedActions).toEqual([]);
    expect(sanitized.narratorFacts.actionIds).toEqual([]);
    expect(sanitized.narratorFacts.toolResultRefs).toEqual([]);
    expect(scenePlanSchema.safeParse(sanitized).success).toBe(true);
  });

  it("does not convert hidden actors into narratorFacts", () => {
    const sanitized = sanitizeScenePlanCandidate(
      {
        ...createValidPlan(),
        narratorFacts: {
          ...createValidPlan().narratorFacts,
          responseIds: [hiddenNpcId],
        },
      },
      createFrame(),
    );

    expect(sanitized.narratorFacts.responseIds).toEqual([]);
  });

  it("rejects prose-bearing narratorFacts in loose and strict schemas", () => {
    const candidate = {
      ...createValidPlan(),
      narratorFacts: {
        ...createValidPlan().narratorFacts,
        summary: "Hidden prose must not bypass packet filtering.",
      },
    };

    expect(() => scenePlanLooseSchema.parse(candidate)).toThrow();
    expect(() => scenePlanSchema.parse(candidate)).toThrow();
  });

  it("formats validation issues and publishes the ScenePlan contract", () => {
    const issues = scenePlanSchema.safeParse({
      ...createValidPlan(),
      plannedActions: Array.from({ length: SCENE_PLAN_ACTION_LIMIT + 1 }, (_, index) => ({
        id: `55555555-5555-4555-8555-${String(index).padStart(12, "0")}`,
        actorId: npcId,
        toolName: "log_event",
        input: {
          text: `Event ${index}`,
          importance: 2,
          participants: ["Road Warden"],
        },
      })),
      deferredHooks: Array.from({ length: SCENE_PLAN_DEFERRED_HOOK_LIMIT + 1 }, (_, index) => ({
        id: `88888888-8888-4888-8888-${String(index).padStart(12, "0")}`,
        hookType: "memory",
        subjectIds: [npcId],
        reason: `Remember consequence ${index}`,
      })),
    });

    expect(issues.success).toBe(false);
    if (!issues.success) {
      expect(formatScenePlanValidationIssues(issues.error.issues)).toContain(
        "plannedActions",
      );
    }
    expect(buildScenePlanContract()).toContain("plannedActions max 8");
    expect(buildScenePlanContract()).toContain("narratorFacts");
    expect(buildScenePlanContract()).toContain("eventIds");
  });
});

describe("runScenePlanner", () => {
  it("accepts a direct GM decision without requiring an Oracle result", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult(
        createSemanticPlan({
          actionInterpretation: {
            actorRef: "Player",
            intent: "greet the road warden",
            targetRefs: ["Road Warden"],
          },
          primaryResponse: {
            actorRef: "Road Warden",
            responseKind: "spoken",
            visibleToPlayer: true,
            targetRefs: ["Player"],
          },
          supportResponses: [],
          plannedActions: [],
          deferredHooks: [],
          hiddenRationale: "Direct conversation needs no backend mutation.",
        }),
      ),
    );

    const result = await runScenePlanner({
      provider,
      frame: createFrame(),
      playerAction: "Say hello.",
      gmDecision: {
        path: "direct",
        directResolutionNotes: "Answer the greeting without mechanics.",
        evidenceRefs: ["Player", "Road Warden"],
      },
    });

    expect(result.plannedActions).toEqual([]);
    expect(result.narratorFacts.actionIds).toEqual([]);
    const firstCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(firstCall?.prompt).toContain("GM READ");
    expect(firstCall?.prompt).toContain('"path": "direct"');
    expect(firstCall?.prompt).toContain("ORACLE RESULT");
    expect(firstCall?.prompt).toContain("- none requested for this decision path");
    expect(firstCall?.prompt).toContain("Direct, continue, and clarification decisions may produce plannedActions: []");
  });

  it("accepts continue and clarification GM decisions without Oracle", async () => {
    for (const gmDecision of [
      {
        path: "continue" as const,
        continuationGuidance: "Let the scene breathe.",
        evidenceRefs: ["Player"],
      },
      {
        path: "clarification" as const,
        clarificationPrompt: "Which road are you taking?",
        evidenceRefs: ["Old Shrine Road"],
      },
    ]) {
      vi.mocked(safeGenerateObject).mockResolvedValueOnce(
        safeResult(
          createSemanticPlan({
            actionInterpretation: {
              actorRef: "Player",
              intent: gmDecision.path,
              targetRefs: [],
            },
            primaryResponse: {
              actorRef: "Player",
              responseKind: "system",
              visibleToPlayer: true,
              targetRefs: [],
            },
            supportResponses: [],
            plannedActions: [],
            deferredHooks: [],
            hiddenRationale: "No backend mutation.",
          }),
        ),
      );

      const result = await runScenePlanner({
        provider,
        frame: createFrame(),
        playerAction: "Continue scene.",
        gmDecision,
      });

      expect(result.plannedActions).toEqual([]);
    }

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("passes binding Oracle context only when GM requested roll_oracle", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(createSemanticPlan()));

    await runScenePlanner({
      provider,
      frame: createFrame(),
      playerAction: "Bluff the road warden.",
      gmDecision: {
        path: "roll_oracle",
        rollRequest: {
          actorRef: "Player",
          targetRef: "Road Warden",
          question: "Does the warden believe the bluff?",
          stakes: "Trust opens or closes the gate.",
          evidenceRefs: ["Player", "Road Warden"],
        },
        evidenceRefs: ["Player", "Road Warden"],
      },
      oracleResult: {
        outcome: "weak_hit",
        roll: 43,
        chance: 55,
        reasoning: "The evidence creates mixed odds.",
      },
    });

    const firstCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(firstCall?.prompt).toContain('"path": "roll_oracle"');
    expect(firstCall?.prompt).toContain('"roll": 43');
    expect(firstCall?.prompt).toContain("Oracle outcome is present only when a GM roll_oracle decision requested backend randomness");
    expect(firstCall?.system).toContain("Do not choose or request a new Oracle outcome tier");
  });

  it("calls safeGenerateObject once on valid semantic output with judge role and semantic prompt markers", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(createSemanticPlan()));

    const result = await runScenePlanner({
      provider,
      frame: createFrame(),
      playerAction: "Ask the road warden what happened.",
      oracleResult: {
        outcome: "weak_hit",
        reasoning: "Contact is possible but not guaranteed.",
      },
    });

    expect(result.actionInterpretation).toMatchObject({
      actorId: playerId,
      targetIds: [npcId],
    });
    expect(result.primaryResponse.actorId).toBe(npcId);
    expect(result.primaryResponse.eventId).toBe(result.anchorEvent.id);
    expect(result.plannedActions[0]).toMatchObject({
      actorId: npcId,
      toolName: "log_event",
      input: createValidPlan().plannedActions[0]?.input,
    });
    expect(result.narratorFacts.actionIds).toEqual([
      result.plannedActions[0]?.id,
    ]);
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: semanticScenePlanSchema,
        temperature: 0,
        prompt: expect.stringContaining("MODEL-FACING SCENE VIEW"),
      }),
    );
    const firstCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(firstCall?.system).toContain("backend will generate");
    expect(firstCall?.system).toContain("do not output id/eventId/actionId/responseId/narratorFacts reference arrays");
    expect(firstCall?.prompt).toContain("ORACLE RESULT");
    expect(firstCall?.prompt).toContain("ALLOWED ACTORS");
    expect(firstCall?.prompt).toContain("ALLOWED TOOLS");
    expect(firstCall?.prompt).toContain("actorRef");
    expect(firstCall?.prompt).toContain("backend will generate");
    expect(firstCall?.prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: scene-planner.v1");
    expect(firstCall?.prompt).toContain(
      '"plannedActions": [{ "toolName": RuntimeToolName, "input": object }]',
    );
    expect(firstCall?.prompt).toContain('"offer_quick_actions" input');
    expect(firstCall?.prompt).toContain('"actions": [{ "label": string, "action": string }]');
    expect(firstCall?.prompt).toContain("3-5 actions");
    expect(firstCall?.prompt).toContain("ScenePlanner minimal valid output");
    expect(firstCall?.prompt).toContain("missing nested actions[].action");
    expect(firstCall?.prompt).toContain("unsupported toolName");
    expect(firstCall?.prompt).toContain("payload instead of input");
    expect(firstCall?.prompt).toContain("model-generated backend IDs");
    expect(firstCall?.prompt).toContain("semanticScenePlanSchema");
    expect(firstCall?.prompt).toContain(playerId);
    expect(firstCall?.prompt).toContain("Road Warden");
  });

  it("does not leak background actors, forbidden fields, or offscreen Forest Outpost text into planner prompts", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult(
        createSemanticPlan({
          actionInterpretation: {
            actorRef: "Player",
            intent: "ask the cafe clerk for the price",
            targetRefs: ["Cafe Clerk"],
          },
          primaryResponse: {
            actorRef: "Cafe Clerk",
            responseKind: "spoken",
            visibleToPlayer: true,
            targetRefs: ["Player"],
          },
          supportResponses: [],
          plannedActions: [],
          deferredHooks: [],
          hiddenRationale: "Direct local service beat.",
        }),
      ),
    );

    await runScenePlanner({
      provider,
      frame: createFrame({
        currentLocationId: "loc-shibuya-district",
        currentSceneScopeId: "scene-shibuya-cafe",
        roster: {
          active: [
            {
              id: playerId,
              actorId: playerId,
              type: "player",
              label: "Player",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
            {
              id: npcId,
              actorId: npcId,
              type: "npc",
              label: "Cafe Clerk",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
          ],
          support: [],
          background: [
            {
              id: hiddenNpcId,
              actorId: hiddenNpcId,
              type: "npc",
              label: "Outpost Cook",
              locationId: "loc-okutama-safe-zone",
              sceneScopeId: "scene-forest-outpost",
              awareness: "none",
            },
          ],
        },
        perception: {
          playerAwarenessHints: [],
          actorAwareness: {},
          forbiddenActorIds: [hiddenNpcId],
          forbiddenActorLabels: ["Outpost Cook"],
        },
        recentEvents: [
          {
            id: "local-cafe-bell",
            tick: 78,
            summary: "The Shibuya cafe bell rings as the clerk waits.",
            source: "location_recent_event",
            actorIds: [playerId, npcId],
            perceivableByPlayer: true,
          },
          {
            id: "private-outpost-beat",
            tick: 78,
            summary: "Outpost Cook waits at Okutama Safe Zone - Forest Outpost.",
            source: "committed_event",
            actorIds: [hiddenNpcId],
            perceivableByPlayer: false,
          },
        ],
        targetCandidates: [
          {
            id: `actor:${npcId}`,
            actorId: npcId,
            type: "actor",
            label: "Cafe Clerk",
            awareness: "clear",
          },
        ],
      }),
      playerAction: "I ask the cafe clerk for the price.",
      gmDecision: {
        path: "direct",
        directResolutionNotes: "The clerk can answer without mechanics.",
        evidenceRefs: ["Player", "Cafe Clerk"],
      },
      recentConversation: [
        {
          role: "assistant",
          content: "Earlier background beat: Outpost Cook stayed at Forest Outpost.",
        },
      ],
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("Shibuya");
    expect(prompt).toContain("Cafe Clerk");
    expect(prompt).toContain("hiddenActorCount");
    expect(prompt).not.toContain("Forest Outpost");
    expect(prompt).not.toContain("Okutama Safe Zone");
    expect(prompt).not.toContain("Outpost Cook");
    expect(prompt).not.toContain(hiddenNpcId);
    expect(prompt).not.toContain("forbiddenActorLabels");
    expect(prompt).not.toContain("roster.background");
  });

  it("drops recent conversation entries that contain private forecast terms", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult(
        createSemanticPlan({
          actionInterpretation: {
            actorRef: "Player",
            intent: "ask the cafe clerk for another cup",
            targetRefs: ["Cafe Clerk"],
          },
          primaryResponse: {
            actorRef: "Cafe Clerk",
            responseKind: "spoken",
            visibleToPlayer: true,
            targetRefs: ["Player"],
          },
          supportResponses: [],
          plannedActions: [],
          deferredHooks: [],
          hiddenRationale: "Direct local service beat.",
        }),
      ),
    );

    await runScenePlanner({
      provider,
      frame: createFrame({
        currentLocationId: "loc-shibuya-district",
        currentSceneScopeId: "scene-shibuya-cafe",
        roster: {
          active: [
            {
              id: playerId,
              actorId: playerId,
              type: "player",
              label: "Player",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
              awareness: "clear",
            },
            {
              id: npcId,
              actorId: npcId,
              type: "npc",
              label: "Cafe Clerk",
              locationId: "loc-shibuya-district",
              sceneScopeId: "scene-shibuya-cafe",
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
      }),
      playerAction: "I ask the cafe clerk for another cup.",
      gmDecision: {
        path: "direct",
        directResolutionNotes: "The clerk can answer without mechanics.",
        evidenceRefs: ["Player", "Cafe Clerk"],
      },
      forbiddenPrivateTerms: ["Postal Cache"],
      recentConversation: [
        {
          role: "assistant",
          content: "The Cafe Clerk puts a ceramic cup on the counter.",
        },
        {
          role: "assistant",
          content: "Private forecast pressure: the Postal Cache is being watched.",
        },
      ],
    });

    const prompt = vi.mocked(safeGenerateObject).mock.calls[0]?.[0].prompt ?? "";
    expect(prompt).toContain("The Cafe Clerk puts a ceramic cup on the counter.");
    expect(prompt).not.toContain("Postal Cache");
  });

  it("repairs semantic output once and returns mapped strict ScenePlan", async () => {
    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(
        safeResult({
          ...createSemanticPlan(),
          primaryResponse: {
            ...createSemanticPlan().primaryResponse,
            actorRef: "Hidden Watcher",
          },
        }),
      )
      .mockResolvedValueOnce(safeResult(createSemanticPlan()));

    const result = await runScenePlanner({
      provider,
      frame: createFrame(),
      playerAction: "Ask the road warden what happened.",
      oracleResult: { outcome: "weak_hit" },
    });

    expect(result.primaryResponse.actorId).toBe(npcId);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(safeGenerateObject).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        schema: semanticScenePlanSchema,
        temperature: 0,
        prompt: expect.stringContaining("Validation issues:"),
      }),
    );
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt).toContain(
      "semantic-mapping-failed",
    );
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt).toContain(
      "Repair the semantic object shape",
    );
  });

  it("redacts forbidden names from ScenePlanner repair issues and invalid candidate JSON", async () => {
    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(
        safeResult({
          ...createSemanticPlan(),
          primaryResponse: {
            actorRef: "Outpost Cook",
            responseKind: "spoken",
            visibleToPlayer: true,
            targetRefs: ["Player"],
          },
          plannedActions: [
            {
              actorRef: "Outpost Cook",
              toolName: "spawn_npc",
              input: {
                name: "Outpost Cook",
                locationName: "Okutama Safe Zone - Forest Outpost",
              },
            },
          ],
          hiddenRationale: "The Forest Outpost beat leaked into local planning.",
        }),
      )
      .mockResolvedValueOnce(safeResult(createSemanticPlan()));

    await runScenePlanner({
      provider,
      frame: createFrame({
        roster: {
          ...createFrame().roster,
          background: [
            {
              id: hiddenNpcId,
              actorId: hiddenNpcId,
              type: "npc",
              label: "Outpost Cook",
              locationId: "loc-okutama-safe-zone",
              sceneScopeId: "scene-forest-outpost",
              awareness: "none",
            },
          ],
        },
        perception: {
          playerAwarenessHints: [],
          actorAwareness: {},
          forbiddenActorIds: [hiddenNpcId],
          forbiddenActorLabels: ["Outpost Cook"],
        },
        recentEvents: [
          {
            id: "private-outpost-beat",
            tick: 78,
            summary: "Outpost Cook waits at Okutama Safe Zone - Forest Outpost.",
            source: "committed_event",
            actorIds: [hiddenNpcId],
            perceivableByPlayer: false,
          },
        ],
        allowedTools: ["log_event", "spawn_npc"],
      }),
      playerAction: "Ask the road warden what happened.",
      oracleResult: { outcome: "weak_hit" },
    });

    const repairPrompt = vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt ?? "";
    expect(repairPrompt).toContain("semantic-mapping-failed");
    expect(repairPrompt).toContain("Validation issues:");
    expect(repairPrompt).toContain("Candidate to repair:");
    expect(repairPrompt).not.toContain("Forest Outpost");
    expect(repairPrompt).not.toContain("Okutama Safe Zone");
    expect(repairPrompt).not.toContain("Outpost Cook");
    expect(repairPrompt).not.toContain(hiddenNpcId);
  });

  it("throws after one repair failure instead of returning an empty fallback plan", async () => {
    const forbiddenSemanticPlan = {
      ...createSemanticPlan(),
      primaryResponse: {
        ...createSemanticPlan().primaryResponse,
        actorRef: "Hidden Watcher",
      },
    };
    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(forbiddenSemanticPlan))
      .mockResolvedValueOnce(safeResult(forbiddenSemanticPlan));

    await expect(
      runScenePlanner({
        provider,
        frame: createFrame(),
        playerAction: "Ask the road warden what happened.",
        oracleResult: { outcome: "weak_hit" },
      }),
    ).rejects.toThrow(/ScenePlan repair failed|Invalid ScenePlan/i);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("does not accept forbidden semantic actorRef output", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult({
        ...createSemanticPlan(),
        plannedActions: [
          {
            ...createSemanticPlan().plannedActions[0],
            actorRef: "Hidden Watcher",
          },
        ],
      }),
    );

    await expect(
      runScenePlanner({
        provider,
        frame: createFrame(),
        playerAction: "Ask the road warden what happened.",
        oracleResult: { outcome: "weak_hit" },
      }),
    ).rejects.toThrow(/ScenePlan repair failed|Invalid ScenePlan/i);
  });

  it("repairs backend-ID-shaped output before returning a strict semantic-mapped plan", async () => {
    vi.mocked(safeGenerateObject)
      .mockResolvedValueOnce(safeResult(createValidPlan()))
      .mockResolvedValueOnce(safeResult(createSemanticPlan()));

    const result = await runScenePlanner({
      provider,
      frame: createFrame(),
      playerAction: "Ask the road warden what happened.",
      oracleResult: { outcome: "weak_hit" },
    });

    expect(result.actionInterpretation.actorId).toBe(playerId);
    expect(result.narratorFacts.anchorEventId).toBe(result.anchorEvent.id);

    expect(safeGenerateObject).toHaveBeenCalledTimes(2);
    expect(vi.mocked(safeGenerateObject).mock.calls[1]?.[0].prompt).toContain(
      "semantic object",
    );
  });
});
