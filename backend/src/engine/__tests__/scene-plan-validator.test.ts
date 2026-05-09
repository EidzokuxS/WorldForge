import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

import type { SceneFrame } from "../scene-frame.js";
import { executeScenePlan, ScenePlanExecutionError } from "../scene-plan-executor.js";
import { scenePlanSchema, type ScenePlan } from "../scene-plan-schema.js";
import { validateScenePlan, type ValidatedScenePlan } from "../scene-plan-validator.js";
import {
  SemanticScenePlanMappingError,
  semanticScenePlanToStrictPlan,
} from "../semantic-scene-plan-schema.js";
import { executeToolCall } from "../tool-executor.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const activeNpcId = "22222222-2222-4222-8222-222222222222";
const supportNpcId = "33333333-3333-4333-8333-333333333333";
const backgroundNpcId = "44444444-4444-4444-8444-444444444444";
const unknownActorId = "99999999-9999-4999-8999-999999999999";
const eventId = "55555555-5555-4555-8555-555555555555";
const responseId = "66666666-6666-4666-8666-666666666666";
const actionId = "77777777-7777-4777-8777-777777777777";
const locationId = "88888888-8888-4888-8888-888888888888";
const generatedId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001";

function createFrame(overrides: Partial<SceneFrame> = {}): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 12,
    playerActorId: playerId,
    currentLocationId: locationId,
    currentSceneScopeId: locationId,
    playerAction: "I ask who controls the bridge.",
    roster: {
      active: [
        {
          id: playerId,
          type: "player",
          label: "Player",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
        {
          id: activeNpcId,
          type: "npc",
          label: "Bridge Captain",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
      ],
      support: [
        {
          id: supportNpcId,
          type: "npc",
          label: "Signal Guard",
          locationId,
          sceneScopeId: locationId,
          awareness: "hint",
          awarenessHint: "A signal lamp moves behind the arch.",
        },
      ],
      background: [
        {
          id: backgroundNpcId,
          type: "npc",
          label: "Hidden Archer",
          locationId,
          sceneScopeId: null,
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: ["A signal lamp moves behind the arch."],
      actorAwareness: {
        [playerId]: {
          [activeNpcId]: "clear",
          [supportNpcId]: "hint",
          [backgroundNpcId]: "none",
        },
      },
    },
    recentEvents: [
      {
        id: eventId,
        tick: 12,
        summary: "The player challenges the bridge patrol.",
        source: "committed_event",
        actorIds: [playerId, activeNpcId],
        perceivableByPlayer: true,
      },
    ],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event", "set_condition", "offer_quick_actions"],
    oracle: {
      outcome: "weak_hit",
    },
    ...overrides,
  };
}

function createPlan(overrides: Partial<ScenePlan> = {}): ScenePlan {
  return scenePlanSchema.parse({
    actionInterpretation: {
      actorId: playerId,
      intent: "open negotiation",
      method: "direct question",
      targetIds: [activeNpcId],
    },
    anchorEvent: {
      id: eventId,
      actorId: playerId,
      subjectIds: [activeNpcId],
      kind: "player_action",
    },
    primaryResponse: {
      id: responseId,
      actorId: activeNpcId,
      responseKind: "spoken",
      eventId,
      visibleToPlayer: true,
    },
    supportResponses: [],
    plannedActions: [
      {
        id: actionId,
        actorId: activeNpcId,
        toolName: "log_event",
        input: {
          text: "The bridge captain answers without lowering the spear line.",
          importance: 3,
          participants: ["Bridge Captain", "Player"],
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
    hiddenRationale: "The Oracle leaves negotiation open while preserving pressure.",
    ...overrides,
  });
}

function expectIssue(
  result: ReturnType<typeof validateScenePlan>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues.map((issue) => issue.code)).toContain(code);
  }
}

function expectValidated(
  result: ReturnType<typeof validateScenePlan>,
): ValidatedScenePlan {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected valid ScenePlan, got ${result.issues.map((issue) => issue.code).join(", ")}`);
  }
  return result.plan;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("ScenePlan validator", () => {
  it("ScenePlan planned actions use actor IDs not display names", () => {
    const validated = validateScenePlan({
      frame: createFrame(),
      plan: createPlan(),
      oracleResult: { outcome: "weak_hit" },
    });

    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.plan.plan.plannedActions[0]?.actorId).toBe(activeNpcId);
    }
  });

  it("unknown actor fails before executeScenePlan", () => {
    const result = validateScenePlan({
      frame: createFrame(),
      plan: createPlan({
        plannedActions: [
          {
            ...createPlan().plannedActions[0]!,
            actorId: unknownActorId,
          },
        ],
      }),
    });

    expectIssue(result, "unknown_actor");
  });

  it("returns display_name_actor_reference when a display name is used instead of an actor ID", () => {
    const plan = {
      ...createPlan(),
      primaryResponse: {
        ...createPlan().primaryResponse,
        actorId: "Bridge Captain",
      },
    } as unknown as ScenePlan;

    expectIssue(validateScenePlan({ frame: createFrame(), plan }), "display_name_actor_reference");
  });

  it("returns background_actor_action when background actors own scene-changing actions", () => {
    const result = validateScenePlan({
      frame: createFrame(),
      plan: createPlan({
        plannedActions: [
          {
            ...createPlan().plannedActions[0]!,
            actorId: backgroundNpcId,
          },
        ],
      }),
    });

    expectIssue(result, "background_actor_action");
  });

  it("returns inactive_primary_actor when the primary response is not owned by an active actor", () => {
    const result = validateScenePlan({
      frame: createFrame(),
      plan: createPlan({
        primaryResponse: {
          ...createPlan().primaryResponse,
          actorId: supportNpcId,
        },
      }),
    });

    expectIssue(result, "inactive_primary_actor");
  });

  it("returns unsupported_tool for tool names outside the SceneFrame allow-list", () => {
    const result = validateScenePlan({
      frame: createFrame({ allowedTools: ["offer_quick_actions"] }),
      plan: createPlan(),
    });

    expectIssue(result, "unsupported_tool");
  });

  it("returns invalid_tool_input and never calls executeToolCall during validation", () => {
    const invalidPlan = {
      ...createPlan(),
      plannedActions: [
        {
          id: actionId,
          actorId: activeNpcId,
          toolName: "set_condition",
          input: {
            targetName: "Player",
          },
        },
      ],
    } as unknown as ScenePlan;

    const result = validateScenePlan({
      frame: createFrame(),
      plan: invalidPlan,
    });

    expectIssue(result, "invalid_tool_input");
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("rejects LLM-authored direct state deltas hidden inside otherwise legal tool inputs", () => {
    const plan = createPlan();
    plan.plannedActions = [
      {
        id: actionId,
        actorId: activeNpcId,
        toolName: "log_event",
        input: {
          text: "The bridge captain answers.",
          importance: 3,
          participants: ["Bridge Captain", "Player"],
          stateDelta: {
            currentLocationId: "loc-secret",
            hp: 0,
            inventory: ["GM-authored overwrite"],
          },
        },
      } as ScenePlan["plannedActions"][number],
    ];

    const result = validateScenePlan({
      frame: createFrame(),
      plan,
    });

    expectIssue(result, "invalid_tool_input");
    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("returns semantic missing toolName mapping issue before executeToolCall can run", () => {
    expect(() =>
      semanticScenePlanToStrictPlan(
        {
          actionInterpretation: {
            actorRef: "Player",
            intent: "open negotiation",
            targetRefs: ["Bridge Captain"],
          },
          primaryResponse: {
            actorRef: "Bridge Captain",
            responseKind: "spoken",
            visibleToPlayer: true,
          },
          supportResponses: [],
          plannedActions: [
            {
              actorRef: "Bridge Captain",
              payload: {
                text: "Missing tool intent must fail before execution.",
              },
            },
          ],
          deferredHooks: [],
          hiddenRationale: "Missing tool selection is not executable authority.",
        },
        createFrame(),
        { idFactory: () => generatedId },
      ),
    ).toThrow(SemanticScenePlanMappingError);

    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("returns tool_input_scope when tool input strings reference hidden actor labels", () => {
    const result = validateScenePlan({
      frame: createFrame(),
      plan: createPlan({
        plannedActions: [
          {
            id: actionId,
            actorId: activeNpcId,
            toolName: "log_event",
            input: {
              text: "The Hidden Archer changes position behind the arch.",
              importance: 3,
              participants: ["Bridge Captain", "Hidden Archer"],
            },
          },
        ],
      }),
    });

    expectIssue(result, "tool_input_scope");
  });

  it("returns tool_input_scope when set_condition targets anyone except the player", () => {
    const result = validateScenePlan({
      frame: createFrame(),
      plan: createPlan({
        plannedActions: [
          {
            id: actionId,
            actorId: activeNpcId,
            toolName: "set_condition",
            input: {
              targetName: "Bridge Captain",
              delta: -1,
            },
          },
        ],
      }),
    });

    expectIssue(result, "tool_input_scope");
  });

  it("returns tool_input_scope when character tool targets are outside clear active support actors", () => {
    const result = validateScenePlan({
      frame: createFrame({ allowedTools: ["log_event", "add_tag", "set_condition", "offer_quick_actions"] }),
      plan: createPlan({
        plannedActions: [
          {
            id: actionId,
            actorId: activeNpcId,
            toolName: "add_tag",
            input: {
              entityName: "Offscreen Stranger",
              entityType: "npc",
              tag: "marked",
            },
          },
        ],
      }),
    });

    expectIssue(result, "tool_input_scope");
  });

  it("returns hidden_actor_ref when contested actorName does not match the planned action owner", () => {
    const result = validateScenePlan({
      frame: createFrame({ allowedTools: ["request_contested_outcome"] }),
      plan: createPlan({
        plannedActions: [
          {
            id: actionId,
            actorId: activeNpcId,
            toolName: "request_contested_outcome",
            input: {
              actorName: "Player",
              targetName: "Bridge Captain",
              mode: "attack",
              intent: "Spoof the player into an NPC-owned contested tool.",
              stakes: "Whether a scene plan can make the wrong actor own the contest.",
              evidenceRefs: ["Player", "Bridge Captain"],
            },
          },
        ],
        narratorFacts: {
          ...createPlan().narratorFacts,
          actionIds: [actionId],
          toolResultRefs: [{ actionId, toolName: "request_contested_outcome" }],
        },
      }),
    });

    expectIssue(result, "hidden_actor_ref");
  });

  it("returns remote_location_ref when spawn_npc uses a remote legacy locationName", () => {
    const result = validateScenePlan({
      frame: createFrame({ allowedTools: ["log_event", "spawn_npc"] }),
      plan: createPlan({
        plannedActions: [
          {
            id: actionId,
            actorId: activeNpcId,
            toolName: "spawn_npc",
            input: {
              name: "Outpost Cook",
              tags: ["service-staff"],
              locationName: "Okutama Safe Zone - Forest Outpost",
            },
          },
        ],
      }),
    });

    expectIssue(result, "remote_location_ref");
  });

  it("returns hidden_actor_visible_fact when narratorFacts reference hidden actor identity", () => {
    const plan = {
      ...createPlan(),
      narratorFacts: {
        ...createPlan().narratorFacts,
        eventIds: [eventId, backgroundNpcId],
      },
    } as unknown as ScenePlan;

    expectIssue(validateScenePlan({ frame: createFrame(), plan }), "hidden_actor_visible_fact");
  });

  it("returns narrator_fact_prose when narratorFacts carry prose instead of backend IDs", () => {
    const plan = {
      ...createPlan(),
      narratorFacts: {
        ...createPlan().narratorFacts,
        eventIds: [eventId, "the hidden archer is waiting"],
      },
    } as unknown as ScenePlan;

    expectIssue(validateScenePlan({ frame: createFrame(), plan }), "narrator_fact_prose");
  });

  it("returns outcome_contradiction before execution", () => {
    const contradiction = scenePlanSchema.parse({
      ...createPlan(),
      plannedActions: [
        {
          id: actionId,
          actorId: activeNpcId,
          toolName: "set_condition",
          input: {
            targetName: "Player",
            delta: -1,
          },
        },
      ],
    });

    const result = validateScenePlan({
      frame: createFrame(),
      plan: contradiction,
      oracleResult: { outcome: "strong_hit" },
    });

    expectIssue(result, "outcome_contradiction");
  });

  it("returns too_many_primary_scene_changers when multiple non-player actors mutate the scene", () => {
    const secondActionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const result = validateScenePlan({
      frame: createFrame(),
      plan: createPlan({
        plannedActions: [
          createPlan().plannedActions[0]!,
          {
            ...createPlan().plannedActions[0]!,
            id: secondActionId,
            actorId: supportNpcId,
          },
        ],
        narratorFacts: {
          ...createPlan().narratorFacts,
          actionIds: [actionId, secondActionId],
          toolResultRefs: [
            { actionId, toolName: "log_event" },
            { actionId: secondActionId, toolName: "log_event" },
          ],
        },
      }),
    });

    expectIssue(result, "too_many_primary_scene_changers");
  });
});

describe("ScenePlan executor", () => {
  const quickActionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const travelActionId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  function createExecutionPlan(
    plannedActions: ScenePlan["plannedActions"],
  ): ScenePlan {
    return createPlan({
      plannedActions,
      narratorFacts: {
        ...createPlan().narratorFacts,
        actionIds: plannedActions.map((action) => action.id),
        toolResultRefs: plannedActions.map((action) => ({
          actionId: action.id,
          toolName: action.toolName,
        })),
      },
    });
  }

  function validateForExecution(plan: ScenePlan, frameOverrides: Partial<SceneFrame> = {}) {
    return expectValidated(validateScenePlan({
      frame: createFrame(frameOverrides),
      plan,
      oracleResult: { outcome: "weak_hit" },
    }));
  }

  it("proves ordered execution through executeToolCall", async () => {
    const secondAction = {
      id: quickActionId,
      actorId: activeNpcId,
      toolName: "offer_quick_actions" as const,
      input: {
        actions: [
          { label: "Press", action: "Press the captain for a clear answer." },
          { label: "Wait", action: "Wait and study the patrol." },
          { label: "Step back", action: "Step back from the spear line." },
        ],
      },
    };
    const plan = createExecutionPlan([createPlan().plannedActions[0]!, secondAction]);
    const validated = validateForExecution(plan);
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({ success: true, result: { eventId: "event-1" } })
      .mockResolvedValueOnce({ success: true, result: { actions: secondAction.input.actions } });

    const executed = await executeScenePlan({
      campaignId: "campaign-1",
      tick: 12,
      outcomeTier: "weak_hit",
      plan: validated,
    });

    expect(executeToolCall).toHaveBeenNthCalledWith(
      1,
      "campaign-1",
      "log_event",
      createPlan().plannedActions[0]!.input,
      12,
      "weak_hit",
      expect.objectContaining({ scope: "player_turn" }),
    );
    expect(executeToolCall).toHaveBeenNthCalledWith(
      2,
      "campaign-1",
      "offer_quick_actions",
      secondAction.input,
      12,
      "weak_hit",
      expect.objectContaining({ scope: "player_turn" }),
    );
    expect(executed.toolCallResults.map((result) => result.actionId)).toEqual([actionId, quickActionId]);
  });

  it("throws on action N after preserving earlier successful ToolResult evidence", async () => {
    const secondAction = {
      id: quickActionId,
      actorId: activeNpcId,
      toolName: "offer_quick_actions" as const,
      input: {
        actions: [
          { label: "Press", action: "Press the captain for a clear answer." },
          { label: "Wait", action: "Wait and study the patrol." },
          { label: "Step back", action: "Step back from the spear line." },
        ],
      },
    };
    const validated = validateForExecution(
      createExecutionPlan([createPlan().plannedActions[0]!, secondAction]),
    );
    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({ success: true, result: { eventId: "event-1" } })
      .mockResolvedValueOnce({ success: false, error: "quick action projection failed" });

    const promise = executeScenePlan({
        campaignId: "campaign-1",
        tick: 12,
        plan: validated,
      });

    await expect(promise).rejects.toBeInstanceOf(ScenePlanExecutionError);
    await expect(promise).rejects.toMatchObject({
      message: expect.stringMatching(/ScenePlan action failed: offer_quick_actions/),
      partial: {
        toolCallResults: [
          expect.objectContaining({
            order: 0,
            actionId,
            result: { success: true, result: { eventId: "event-1" } },
          }),
          expect.objectContaining({
            order: 1,
            actionId: quickActionId,
            result: { success: false, error: "quick action projection failed" },
          }),
        ],
      },
    });
  });

  it("projects quick action emitted events and full ToolResult metadata", async () => {
    const quickAction = {
      id: quickActionId,
      actorId: activeNpcId,
      toolName: "offer_quick_actions" as const,
      input: {
        actions: [
          { label: "Press", action: "Press the captain for a clear answer." },
          { label: "Wait", action: "Wait and study the patrol." },
          { label: "Step back", action: "Step back from the spear line." },
        ],
      },
    };
    const validated = validateForExecution(createExecutionPlan([quickAction]));
    const toolResult = { success: true, result: { actions: quickAction.input.actions, source: "tool" } };
    vi.mocked(executeToolCall).mockResolvedValueOnce(toolResult);

    const executed = await executeScenePlan({ campaignId: "campaign-1", tick: 12, plan: validated });

    expect(executed.quickActionsEmitted).toBe(true);
    expect(executed.emittedEvents).toEqual([{ type: "quick_actions", data: toolResult }]);
    expect(executed.toolCallResults).toEqual([
      expect.objectContaining({
        order: 0,
        actionId: quickActionId,
        actorId: activeNpcId,
        toolName: "offer_quick_actions",
        input: quickAction.input,
        result: toolResult,
      }),
    ]);
  });

  it("projects successful travel from move_to ToolResult metadata", async () => {
    const travelAction = {
      id: travelActionId,
      actorId: activeNpcId,
      toolName: "move_to" as const,
      input: { targetLocationName: "Signal Tower" },
    };
    const validated = validateForExecution(
      createExecutionPlan([travelAction]),
      {
        allowedTools: ["log_event", "move_to", "offer_quick_actions"],
        movementCandidates: [
          {
            id: "move-signal-tower",
            locationId,
            label: "Signal Tower",
            connected: true,
            travelCost: 1,
            path: ["Bridge", "Signal Tower"],
          },
        ],
      },
    );
    const toolResult = {
      success: true,
      result: {
        locationId: locationId,
        locationName: "Signal Tower",
        travelCost: 1,
        path: ["Bridge", "Signal Tower"],
      },
    };
    vi.mocked(executeToolCall).mockResolvedValueOnce(toolResult);

    const executed = await executeScenePlan({ campaignId: "campaign-1", tick: 12, plan: validated });

    expect(executed.successfulTravel).toEqual({
      locationId,
      locationName: "Signal Tower",
      travelCost: 1,
      tickAdvance: 1,
      path: ["Bridge", "Signal Tower"],
    });
    expect(executed.emittedEvents).toEqual([
      {
        type: "state_update",
        data: {
          type: "location_change",
          locationId,
          locationName: "Signal Tower",
          travelCost: 1,
          tickAdvance: 1,
          path: ["Bridge", "Signal Tower"],
        },
      },
    ]);
  });
});
