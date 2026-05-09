import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

import type { SceneFrame } from "../scene-frame.js";
import { executeScenePlan, ScenePlanExecutionError } from "../scene-plan-executor.js";
import { scenePlanSchema, type ScenePlan } from "../scene-plan-schema.js";
import { validateScenePlan } from "../scene-plan-validator.js";
import { executeToolCall } from "../tool-executor.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const npcId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";
const responseId = "44444444-4444-4444-8444-444444444444";
const firstActionId = "55555555-5555-4555-8555-555555555555";
const secondActionId = "66666666-6666-4666-8666-666666666666";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-78-05",
    tick: 3,
    playerActorId: playerId,
    currentLocationId: "loc-bridge",
    currentSceneScopeId: "loc-bridge",
    playerAction: "Force the hatch open.",
    roster: {
      active: [
        {
          id: playerId,
          type: "player",
          label: "Player",
          locationId: "loc-bridge",
          sceneScopeId: "loc-bridge",
          awareness: "clear",
        },
        {
          id: npcId,
          type: "npc",
          label: "Bridge Captain",
          locationId: "loc-bridge",
          sceneScopeId: "loc-bridge",
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
    deferredHooks: [],
    allowedTools: ["log_event", "offer_quick_actions"],
    oracle: null,
  };
}

function createPlan(): ScenePlan {
  return scenePlanSchema.parse({
    actionInterpretation: {
      actorId: playerId,
      intent: "force the hatch",
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
      responseKind: "gesture",
      eventId,
      visibleToPlayer: true,
      targetIds: [playerId],
    },
    supportResponses: [],
    plannedActions: [
      {
        id: firstActionId,
        actorId: npcId,
        toolName: "log_event",
        input: {
          text: "The hatch strains but holds.",
          importance: 3,
          participants: ["Player", "Bridge Captain"],
        },
      },
      {
        id: secondActionId,
        actorId: npcId,
        toolName: "offer_quick_actions",
        input: {
          actions: [
            { label: "Brace", action: "Brace and try again." },
            { label: "Listen", action: "Listen for movement beyond the hatch." },
            { label: "Back off", action: "Back away from the hatch." },
          ],
        },
      },
    ],
    deferredHooks: [],
    narratorFacts: {
      anchorEventId: eventId,
      eventIds: [eventId],
      responseIds: [responseId],
      actionIds: [firstActionId, secondActionId],
      toolResultRefs: [
        { actionId: firstActionId, toolName: "log_event" },
        { actionId: secondActionId, toolName: "offer_quick_actions" },
      ],
    },
    hiddenRationale: "Executor should fail through to route rollback if a later action fails.",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("executeScenePlan rollback boundary evidence", () => {
  it("throws through failed legal execution while exposing partial evidence for route rollback", async () => {
    const validation = validateScenePlan({ frame: createFrame(), plan: createPlan() });
    expect(validation.ok).toBe(true);
    if (!validation.ok) throw new Error("expected valid plan");

    vi.mocked(executeToolCall)
      .mockResolvedValueOnce({ success: true, result: { eventId: "committed-before-failure" } })
      .mockResolvedValueOnce({ success: false, error: "projection failed" });

    const promise = executeScenePlan({
      campaignId: "campaign-78-05",
      tick: 3,
      plan: validation.plan,
    });

    await expect(promise).rejects.toBeInstanceOf(ScenePlanExecutionError);
    await expect(promise).rejects.toThrow(/ScenePlan action failed/);
  });

  it("prevalidates mixed plans atomically before the first mutation", async () => {
    const frame = {
      ...createFrame(),
      allowedTools: ["log_event", "spawn_npc"] as SceneFrame["allowedTools"],
    };
    const firstAction = createPlan().plannedActions[0]!;
    const remoteSpawnAction = {
      id: secondActionId,
      actorId: npcId,
      toolName: "spawn_npc" as const,
      input: {
        name: "Outpost Cook",
        tags: ["service-staff"],
        locationName: "Okutama Safe Zone - Forest Outpost",
      },
    };
    const plan = scenePlanSchema.parse({
      ...createPlan(),
      plannedActions: [firstAction, remoteSpawnAction],
      narratorFacts: {
        ...createPlan().narratorFacts,
        actionIds: [firstAction.id, remoteSpawnAction.id],
        toolResultRefs: [
          { actionId: firstAction.id, toolName: firstAction.toolName },
          { actionId: remoteSpawnAction.id, toolName: remoteSpawnAction.toolName },
        ],
      },
    });

    const promise = executeScenePlan({
      campaignId: "campaign-78-05",
      tick: 3,
      plan: { frame, plan, issues: [] },
    });

    await expect(promise).rejects.toBeInstanceOf(ScenePlanExecutionError);
    await expect(promise).rejects.toThrow(/grounding failed before execution/);
    expect(executeToolCall).not.toHaveBeenCalled();
  });
});
