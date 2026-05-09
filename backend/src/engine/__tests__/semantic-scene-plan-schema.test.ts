import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

import type { SceneFrame } from "../scene-frame.js";
import {
  SemanticScenePlanMappingError,
  semanticScenePlanToStrictPlan,
} from "../semantic-scene-plan-schema.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const clearNpcId = "22222222-2222-4222-8222-222222222222";
const backgroundNpcId = "33333333-3333-4333-8333-333333333333";

function createNeutralFrame(): SceneFrame {
  return {
    campaignId: "campaign-78-02",
    tick: 7,
    playerActorId: playerId,
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-bridge",
    playerAction: "I hit Iru",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Player",
          locationId: "loc-market",
          sceneScopeId: "scene-bridge",
          awareness: "clear",
        },
        {
          id: clearNpcId,
          actorId: clearNpcId,
          type: "npc",
          label: "Iru",
          locationId: "loc-market",
          sceneScopeId: "scene-bridge",
          awareness: "clear",
        },
      ],
      support: [],
      background: [
        {
          id: backgroundNpcId,
          actorId: backgroundNpcId,
          type: "npc",
          label: "Roof Archer",
          locationId: "loc-market",
          sceneScopeId: "roof",
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
      forbiddenActorIds: [backgroundNpcId],
      forbiddenActorLabels: ["Roof Archer"],
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [
      {
        id: "edge-market-canal",
        locationId: "loc-canal",
        label: "Canal Walk",
        connected: true,
      },
    ],
    deferredHooks: [],
    allowedTools: ["log_event"],
    oracle: null,
  };
}

function createSemanticPlan(overrides: Record<string, unknown> = {}) {
  return {
    actionInterpretation: {
      actorRef: "Player",
      intent: "GM-selected local exchange",
      method: "concrete plan, not SceneFrame default",
      targetRefs: ["Iru"],
    },
    primaryResponse: {
      actorRef: "Iru",
      responseKind: "gesture",
      visibleToPlayer: true,
      targetRefs: ["Player"],
    },
    supportResponses: [],
    plannedActions: [
      {
        actorRef: "Iru",
        toolName: "log_event",
        input: {
          text: "Iru reacts to the player's move.",
          importance: 3,
          participants: ["Player", "Iru"],
        },
      },
    ],
    deferredHooks: [],
    hiddenRationale: "The GM supplied the semantic target explicitly.",
    ...overrides,
  };
}

describe("semanticScenePlanToStrictPlan with neutral SceneFrame", () => {
  it("maps explicit GM actor refs without oracleContext or combatEnvelope defaults", () => {
    const frame = createNeutralFrame();
    const strictPlan = semanticScenePlanToStrictPlan(createSemanticPlan(), frame, {
      idFactory: () => randomUUID(),
    });

    expect(frame.oracleContext).toBeUndefined();
    expect(frame.combatEnvelope).toBeUndefined();
    expect(strictPlan.actionInterpretation.targetIds).toEqual([clearNpcId]);
    expect(strictPlan.plannedActions[0]?.toolName).toBe("log_event");
  });

  it("rejects forbidden background refs instead of fabricating target meaning", () => {
    expect(() =>
      semanticScenePlanToStrictPlan(
        createSemanticPlan({
          actionInterpretation: {
            actorRef: "Player",
            intent: "GM-selected local exchange",
            targetRefs: ["Roof Archer"],
          },
        }),
        createNeutralFrame(),
      ),
    ).toThrow(SemanticScenePlanMappingError);
  });

  it("rejects invented actor labels and ids instead of selecting from raw text", () => {
    for (const targetRef of ["Iru's hidden twin", "99999999-9999-4999-8999-999999999999"]) {
      expect(() =>
        semanticScenePlanToStrictPlan(
          createSemanticPlan({
            actionInterpretation: {
              actorRef: "Player",
              intent: "GM-selected local exchange",
              targetRefs: [targetRef],
            },
          }),
          createNeutralFrame(),
        ),
      ).toThrow(SemanticScenePlanMappingError);
    }
  });

  it("rejects unsupported and missing tool semantics", () => {
    expect(() =>
      semanticScenePlanToStrictPlan(
        createSemanticPlan({
          plannedActions: [
            {
              actorRef: "Iru",
              toolName: "rewrite_world_truth",
              input: { currentLocationId: "loc-secret" },
            },
          ],
        }),
        createNeutralFrame(),
      ),
    ).toThrow(SemanticScenePlanMappingError);

    expect(() =>
      semanticScenePlanToStrictPlan(
        createSemanticPlan({
          plannedActions: [
            {
              actorRef: "Iru",
              input: { text: "A missing tool must not be invented." },
            },
          ],
        }),
        createNeutralFrame(),
      ),
    ).toThrow(SemanticScenePlanMappingError);
  });
});
