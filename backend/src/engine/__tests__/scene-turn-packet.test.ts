import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

import type { SceneFrame } from "../scene-frame.js";
import { scenePlanSchema, type ScenePlan } from "../scene-plan-schema.js";
import { executeScenePlan } from "../scene-plan-executor.js";
import {
  type CanonicalTurnPacket,
  buildNarratorPacket,
  formatNarratorPacketForPrompt,
  assertNarratorPacketPromptSafe,
} from "../narrator-packet.js";
import { validateScenePlan } from "../scene-plan-validator.js";
import { executeToolCall } from "../tool-executor.js";
import type { ValidatedScenePlan } from "../scene-plan-validator.js";

const playerId = "11111111-1111-4111-8111-111111111111";
const activeNpcId = "22222222-2222-4222-8222-222222222222";
const hintNpcId = "33333333-3333-4333-8333-333333333333";
const hiddenNpcId = "44444444-4444-4444-8444-444444444444";
const eventId = "55555555-5555-4555-8555-555555555555";
const responseId = "66666666-6666-4666-8666-666666666666";
const actionId = "77777777-7777-4777-8777-777777777777";
const locationId = "88888888-8888-4888-8888-888888888888";

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-1",
    tick: 21,
    playerActorId: playerId,
    currentLocationId: locationId,
    currentSceneScopeId: locationId,
    playerAction: "I keep my hands visible.",
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
          label: "Gate Captain",
          locationId,
          sceneScopeId: locationId,
          awareness: "clear",
        },
      ],
      support: [
        {
          id: hintNpcId,
          type: "npc",
          label: "Veiled Listener",
          locationId,
          sceneScopeId: locationId,
          awareness: "hint",
          awarenessHint: "Cloth shifts behind the gatehouse screen.",
        },
      ],
      background: [
        {
          id: hiddenNpcId,
          type: "npc",
          label: "Hidden Archer",
          locationId,
          sceneScopeId: null,
          awareness: "none",
        },
      ],
    },
    perception: {
      playerAwarenessHints: ["Cloth shifts behind the gatehouse screen."],
      actorAwareness: {
        [playerId]: {
          [activeNpcId]: "clear",
          [hintNpcId]: "hint",
          [hiddenNpcId]: "none",
        },
      },
    },
    recentEvents: [],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event"],
    oracle: {
      outcome: "weak_hit",
    },
  };
}

function createPlan(): ScenePlan {
  return scenePlanSchema.parse({
    actionInterpretation: {
      actorId: playerId,
      intent: "de-escalate",
      method: "open posture",
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
      responseKind: "gesture",
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
          text: "The gate captain lowers one hand but keeps the patrol in formation.",
          importance: 4,
          participants: ["Gate Captain", "Player"],
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
    hiddenRationale: "Hidden fact: the archer has orders to fire if names are spoken.",
  });
}

function createCanonicalTurnPacket(
  frame: SceneFrame,
  plan: ScenePlan,
  executed: Awaited<ReturnType<typeof executeScenePlan>>,
  overrides: Partial<CanonicalTurnPacket> = {},
): CanonicalTurnPacket {
  return {
    campaignId: frame.campaignId,
    tick: frame.tick,
    playerAction: frame.playerAction,
    oracleOutcome: frame.oracle?.outcome ?? null,
    narratorFacts: {
      anchorEventId: plan.narratorFacts.anchorEventId,
      eventIds: [...plan.narratorFacts.eventIds],
      responseIds: [...plan.narratorFacts.responseIds],
      actionIds: [...plan.narratorFacts.actionIds],
      toolResultRefs: plan.narratorFacts.toolResultRefs.map((ref) => ({ ...ref })),
    },
    anchorEvent: {
      id: plan.anchorEvent.id,
      actorId: plan.anchorEvent.actorId,
      kind: plan.anchorEvent.kind,
      summary: "Player keeps both hands visible.",
      perceivableByPlayer: true,
    },
    events: [
      {
        id: plan.anchorEvent.id,
        actorId: plan.anchorEvent.actorId,
        kind: plan.anchorEvent.kind,
        summary: "Player keeps both hands visible.",
        perceivableByPlayer: true,
      },
    ],
    responses: [
      {
        id: plan.primaryResponse.id,
        actorId: plan.primaryResponse.actorId,
        responseKind: plan.primaryResponse.responseKind,
        eventId: plan.primaryResponse.eventId,
        summary: "The gate captain answers with a contained gesture.",
        visibleToPlayer: true,
      },
    ],
    effects: [
      {
        id: `effect-${actionId}`,
        actionId,
        actorId: activeNpcId,
        toolName: "log_event",
        summary: "The gate captain lowers one hand but keeps the patrol in formation.",
        perceivableByPlayer: true,
        toolResult: executed.actionResults[0]!.result,
      },
    ],
    actionResults: executed.actionResults,
    guardrails: ["Keep narration grounded in the committed event IDs."],
    controlReturnReason: "Return control after the immediate guard response.",
    outcomeBounds: undefined,
    ...overrides,
  };
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

describe("ScenePlan execution and narrator packet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("executeScenePlan returns full ToolResult metadata", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: true,
      result: {
        eventId: "event-1",
        stored: true,
      },
    });

    const frame = createFrame();
    const plan = createPlan();
    const validated = expectValidated(
      validateScenePlan({ frame, plan, oracleResult: { outcome: "weak_hit" } }),
    );

    const executed = await executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      outcomeTier: "weak_hit",
      validatedPlan: validated,
    });

    expect(executed.actionResults[0]).toEqual(
      expect.objectContaining({
        order: 0,
        actionId,
        actionRef: actionId,
        actorId: activeNpcId,
        toolName: "log_event",
        input: plan.plannedActions[0]!.input,
        args: plan.plannedActions[0]!.input,
        result: {
          success: true,
          result: {
            eventId: "event-1",
            stored: true,
          },
        },
      }),
    );
  });

  it("narratorFacts rejects free prose and uses backend refs", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: true,
      result: { eventId: "event-1" },
    });

    const frame = createFrame();
    const plan = createPlan();
    const validated = expectValidated(validateScenePlan({ frame, plan }));
    const executed = await executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      validatedPlan: validated,
    });
    const canonicalTurnPacket = createCanonicalTurnPacket(frame, plan, executed, {
      outcomeBounds: {
        summary: "Outcome-bound preservation: weak hit keeps the scene unstable.",
        ceilings: ["The patrol can yield a little ground."],
        floors: ["Pressure remains visible."],
        prohibitions: ["Do not narrate total victory."],
      },
    });
    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket,
    });

    expect(packet.playerAction).toBe(frame.playerAction);
    expect(packet.oracleOutcome).toBe("weak_hit");
    expect(packet.anchorEvent.id).toBe(eventId);
    expect(packet.perceivableEvents.map((event) => event.id)).toEqual([eventId]);
    expect(packet.perceivableResponses.map((response) => response.id)).toEqual([responseId]);
    expect(packet.perceivableEffects[0]?.toolResult).toEqual({
      success: true,
      result: { eventId: "event-1" },
    });
    expect(packet.canonicalTurnPacket.narratorFacts).toEqual({
      anchorEventId: eventId,
      eventIds: [eventId],
      responseIds: [responseId],
      actionIds: [actionId],
      toolResultRefs: [{ actionId, toolName: "log_event" }],
    });
    expect(packet.allowedVisibleActorNames).toEqual(["Player", "Gate Captain"]);
    expect(formatNarratorPacketForPrompt(packet)).not.toContain(plan.hiddenRationale);
  });

  it("hidden observer name is absent from narrator packet and final prompt", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: true,
      result: { eventId: "event-1" },
    });

    const frame = createFrame();
    const plan = createPlan();
    const validated = expectValidated(validateScenePlan({ frame, plan }));
    const executed = await executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      validatedPlan: validated,
    });
    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket: createCanonicalTurnPacket(frame, plan, executed),
    });
    const prompt = formatNarratorPacketForPrompt(packet);

    expect(prompt).toContain("[NARRATOR PACKET]");
    expect(prompt).toContain("VISIBLE ACTORS");
    expect(prompt).toContain("COMMITTED EVENTS");
    expect(prompt).toContain("PERCEIVABLE RESPONSES");
    expect(prompt).toContain("GUARDRAILS");
    expect(prompt).toContain("CONTROL RETURN");
    expect(prompt).toContain("Gate Captain");
    expect(prompt).toContain("Cloth shifts behind the gatehouse screen.");
    expect(prompt).not.toContain("Veiled Listener");
    expect(prompt).not.toContain("Hidden Archer");
    expect(packet.allowedVisibleActorNames).not.toContain("Hidden Archer");
    expect(packet.visibleActors.map((actor) => actor.label)).not.toContain("Hidden Archer");
  });

  it("hint actor name is included in forbiddenActorNames but not prompt", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: true,
      result: { eventId: "event-1" },
    });

    const frame = createFrame();
    const plan = createPlan();
    const validated = expectValidated(validateScenePlan({ frame, plan }));
    const executed = await executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      validatedPlan: validated,
    });
    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket: createCanonicalTurnPacket(frame, plan, executed),
    });
    const prompt = formatNarratorPacketForPrompt(packet);

    expect(prompt).toContain("Cloth shifts behind the gatehouse screen.");
    expect(prompt).not.toContain("Veiled Listener");
    expect(prompt).not.toContain("forbiddenActorNames");
    expect(prompt).not.toContain("forbiddenFactMarkers");
    expect(packet.hintSignals).toEqual(["Cloth shifts behind the gatehouse screen."]);
    expect(packet.forbiddenActorNames).toEqual(
      expect.arrayContaining(["Veiled Listener", "Hidden Archer"]),
    );
    expect(packet.forbiddenFactMarkers).toEqual(
      expect.arrayContaining([`hidden-actor:${hintNpcId}`, `hidden-actor:${hiddenNpcId}`]),
    );
  });

  it("adds authoritative current inventory status evidence without inventing an inventory change", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: true,
      result: { eventId: "event-1" },
    });

    const frame = {
      ...createFrame(),
      playerInventory: [
        {
          id: "current-inventory:item-satchel",
          itemId: "item-satchel",
          label: "Worn Leather Satchel",
          equipState: "equipped" as const,
          equippedSlot: "shoulder",
          isSignature: true,
        },
      ],
    };
    const plan = createPlan();
    const validated = expectValidated(validateScenePlan({ frame, plan }));
    const executed = await executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      validatedPlan: validated,
    });
    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket: createCanonicalTurnPacket(frame, plan, executed),
    });
    const prompt = formatNarratorPacketForPrompt(packet);

    expect(packet.currentInventory).toEqual([
      expect.objectContaining({
        itemId: "item-satchel",
        label: "Worn Leather Satchel",
        equipState: "equipped",
        isSignature: true,
      }),
    ]);
    expect(packet.evidenceLedger).toContainEqual(
      expect.objectContaining({
        id: "current_inventory_status:item-satchel",
        category: "current_inventory_status",
        sourceId: "item-satchel",
      }),
    );
    expect(packet.evidenceLedger).not.toContainEqual(
      expect.objectContaining({
        id: "tool_result:item-satchel:transfer_item",
      }),
    );
    expect(prompt).toContain("[CURRENT INVENTORY STATUS]");
    expect(prompt).toContain(
      "Worn Leather Satchel is currently equipped in shoulder by the player as a signature item.",
    );
  });

  it("pre-prompt guard rejects backend prose that leaks a hidden actor name or hidden fact marker", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: true,
      result: { eventId: "event-1" },
    });

    const frame = createFrame();
    const plan = createPlan();
    const validated = expectValidated(validateScenePlan({ frame, plan }));
    const executed = await executeScenePlan({
      campaignId: frame.campaignId,
      tick: frame.tick,
      validatedPlan: validated,
    });
    const packet = buildNarratorPacket({
      frame,
      canonicalTurnPacket: createCanonicalTurnPacket(frame, plan, executed, {
        anchorEvent: {
          id: eventId,
          actorId: playerId,
          kind: "player_action",
          summary: `Hidden Archer marker hidden-actor:${hiddenNpcId} should never format.`,
          perceivableByPlayer: true,
        },
        events: [
          {
            id: eventId,
            actorId: playerId,
            kind: "player_action",
            summary: `Hidden Archer marker hidden-actor:${hiddenNpcId} should never format.`,
            perceivableByPlayer: true,
          },
        ],
      }),
    });

    expect(() => assertNarratorPacketPromptSafe(packet)).toThrow(/NarratorPacket prompt unsafe/);
    expect(() => formatNarratorPacketForPrompt(packet)).toThrow(/NarratorPacket prompt unsafe/);
  });
});
