import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  analyzeClarificationBridge,
  clarificationReviewerTestHooks,
  classifyClarificationReview,
  reviewGmReadClarification,
} from "../clarification-reviewer.js";
import type { GmRead } from "../gm-turn-read.js";
import type { SceneFrame } from "../scene-frame.js";

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => ({ modelId: "judge-test-model" })),
}));

const playerId = "11111111-1111-4111-8111-111111111111";
const clerkId = "22222222-2222-4222-8222-222222222222";
const guardId = "33333333-3333-4333-8333-333333333333";

const provider: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "test-key",
  model: "judge-model",
};

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
    campaignId: "campaign-90-03",
    tick: 12,
    playerActorId: playerId,
    currentLocationId: "loc-market",
    currentSceneScopeId: "scene-market-entrance",
    currentLocationName: "Canal Market",
    currentSceneScopeName: "Canal Market Entrance",
    playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
    roster: {
      active: [
        {
          id: playerId,
          actorId: playerId,
          type: "player",
          label: "Player",
          locationId: "loc-market",
          sceneScopeId: "scene-market-entrance",
          awareness: "clear",
        },
        {
          id: clerkId,
          actorId: clerkId,
          type: "npc",
          label: "Market Clerk",
          locationId: "loc-market",
          sceneScopeId: "scene-market-entrance",
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
    targetCandidates: [
      {
        id: "actor-market-clerk",
        actorId: clerkId,
        type: "actor",
        label: "Market Clerk",
        awareness: "clear",
      },
    ],
    movementCandidates: [
      {
        id: "route-tea-row",
        locationId: "loc-tea-row",
        label: "Tea Row",
        connected: true,
        travelCost: 1,
        path: ["Canal Market", "Tea Row"],
      },
    ],
    deferredHooks: [],
    allowedTools: [
      "list_navigation_options",
      "find_location_candidates",
      "find_poi_candidates",
      "check_route",
      "move_actor",
      "create_minor_poi",
      "start_search",
      "record_player_intent",
      "log_event",
    ],
    oracleContext: null,
    combatEnvelope: null,
    oracle: null,
    ...overrides,
  };
}

const baseClarification: Extract<GmRead, { path: "clarification" }> = {
  version: "gm-read.v1",
  situationSummary: "The player wants to move onward and find tea.",
  sceneQuestion: "Which backend target should the route use?",
  focalActorRefs: ["Player"],
  backgroundActorRefs: [],
  actionInterpretation: {
    intent: "follow a logical route and find a tea stall",
    targetRefs: [],
  },
  path: "clarification",
  clarificationPrompt: "Which connected location should I use for that route?",
  rationale: "The player did not provide an exact location id.",
  evidenceRefs: ["Player"],
  narrationGuardrails: ["Do not invent the tea stall in prose."],
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("clarification reviewer", () => {
  it("detects backend-ish English and Russian exact-target clarification patterns", () => {
    expect(
      clarificationReviewerTestHooks.findParserLikePattern(
        "Which connected location should I use?",
      ),
    ).toBe("connected_location");
    expect(
      clarificationReviewerTestHooks.findParserLikePattern(
        "I need the exact target id before resolving this.",
      ),
    ).toBe("exact_target_or_id");
    expect(
      clarificationReviewerTestHooks.findParserLikePattern(
        "Какая локация нужна для маршрута?",
      ),
    ).toBe("russian_location");
    expect(
      clarificationReviewerTestHooks.findParserLikePattern(
        "Уточните connected location.",
      ),
    ).toBe("russian_connected_location");
    expect(
      clarificationReviewerTestHooks.findParserLikePattern(
        "Did you mean the legal movement paths visible from here (Tea Row), or something else?",
      ),
    ).toBe("did_you_mean_movement_options");
  });

  it("classifies the Russian tourist tea-stall turn as bridgeable", () => {
    const frame = createFrame();
    const analysis = analyzeClarificationBridge({
      playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
      frame,
      gmRead: baseClarification,
    });

    expect(analysis.hasNavigationIntent).toBe(true);
    expect(analysis.hasSearchOrServiceIntent).toBe(true);
    expect(analysis.bridgeCandidateCount).toBeGreaterThanOrEqual(2);

    expect(
      classifyClarificationReview({
        playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
        frame,
        gmRead: baseClarification,
      }),
    ).toMatchObject({
      reviewed: true,
      repaired: true,
      reason: "bridgeable_parser_like_clarification",
      parserLikePattern: "connected_location",
    });
  });

  it("classifies did-you-mean movement options as parser-like when a fair bridge exists", () => {
    expect(
      classifyClarificationReview({
        playerAction:
          "I choose the clearly public path toward the courier depot and walk there slowly.",
        frame: createFrame({
          playerAction:
            "I choose the clearly public path toward the courier depot and walk there slowly.",
          movementCandidates: [
            {
              id: "route-courier-depot",
              locationId: "loc-courier-depot",
              label: "Night Courier Depot",
              connected: true,
              travelCost: 1,
              path: ["Canal Market", "Night Courier Depot"],
            },
          ],
        }),
        gmRead: {
          ...baseClarification,
          actionInterpretation: {
            intent: "follow the public path toward the courier depot",
            targetRefs: [],
          },
          clarificationPrompt:
            "Did you mean the legal movement paths visible from here (Night Courier Depot), or something else?",
        },
      }),
    ).toMatchObject({
      reviewed: true,
      repaired: true,
      reason: "bridgeable_parser_like_clarification",
      parserLikePattern: "did_you_mean_movement_options",
    });
  });

  it("repairs exact-route and tea-stall clarification into a tool_plan", async () => {
    const repairedRead: GmRead = {
      ...baseClarification,
      sceneQuestion: "How does the market route and tea search become grounded?",
      actionInterpretation: {
        intent: "follow the obvious market route and look for tea",
        targetRefs: ["Tea Row"],
      },
      path: "tool_plan",
      turnIntent:
        "Use bridge lookup and state tools to follow the legal route and ground a low-impact tea search or minor tea stall.",
      runtimeRequirement: { kind: "state_mutation" },
      rationale: "The intent is understandable and low-risk; backend tools must validate movement and POI state.",
      evidenceRefs: ["Player", "Tea Row"],
      narrationGuardrails: ["Do not narrate completed movement or a tea stall before tool results."],
    };
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(repairedRead));

    const result = await reviewGmReadClarification({
      provider,
      playerAction: "иду дальше по логичному маршруту и ищу чайную лавку",
      frame: createFrame(),
      gmRead: baseClarification,
    });

    expect(result).toMatchObject({
      reviewed: true,
      repaired: true,
      reason: "bridgeable_parser_like_clarification",
      parserLikePattern: "connected_location",
      gmRead: expect.objectContaining({ path: "tool_plan" }),
    });
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledTimes(1);
    const repairCall = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(repairCall?.temperature).toBe(0);
    expect(repairCall?.retries).toBe(1);
    expect(repairCall?.system).toContain("parser-like clarification review");
    expect(repairCall?.prompt).toContain("MODEL-FACING GM READ CLARIFICATION REPAIR");
    expect(repairCall?.prompt).toContain("connected_location");
    expect(repairCall?.prompt).toContain("create_minor_poi");
    expect(repairCall?.prompt).toContain("Do not ask for exact ids");
    expect(repairCall?.prompt).toContain("All state changes must still go through later bridge tools");
  });

  it("allows repair into bounded grounded diegetic choices", async () => {
    const frame = createFrame({
      movementCandidates: [
        {
          id: "route-tea-row",
          locationId: "loc-tea-row",
          label: "Tea Row",
          connected: true,
          travelCost: 1,
        },
        {
          id: "route-courier-arcade",
          locationId: "loc-courier-arcade",
          label: "Courier Arcade",
          connected: true,
          travelCost: 1,
        },
      ],
    });
    const repairedRead: GmRead = {
      ...baseClarification,
      path: "clarification",
      clarificationPrompt:
        "Do you follow Tea Row toward the tea sellers, or Courier Arcade where message desks cluster?",
      rationale: "Both choices are visible and similarly low-risk, so the question is diegetic.",
      evidenceRefs: ["Player", "Tea Row", "Courier Arcade"],
    };
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(repairedRead));

    const result = await reviewGmReadClarification({
      provider,
      playerAction: "I follow the logical route and look for service desks.",
      frame,
      gmRead: {
        ...baseClarification,
        clarificationPrompt: "Which exact route should I use?",
      },
    });

    expect(result).toMatchObject({
      repaired: true,
      reason: "repair_returned_clarification",
      gmRead: expect.objectContaining({
        path: "clarification",
        clarificationPrompt: expect.stringContaining("Tea Row"),
      }),
    });
  });

  it("keeps valid clarification for materially different route cost", async () => {
    const result = await reviewGmReadClarification({
      provider,
      playerAction: "I go onward by the logical route.",
      frame: createFrame({
        movementCandidates: [
          {
            id: "short",
            locationId: "loc-short",
            label: "Crowded Shortcut",
            connected: true,
            travelCost: 1,
          },
          {
            id: "long",
            locationId: "loc-long",
            label: "Quiet Long Road",
            connected: true,
            travelCost: 4,
          },
        ],
      }),
      gmRead: baseClarification,
    });

    expect(result).toMatchObject({
      repaired: false,
      reason: "materially_different_risk_or_cost",
    });
    expect(safeGenerateObject).not.toHaveBeenCalled();
  });

  it("keeps valid clarification for high-impact or irreversible actions", async () => {
    const result = await reviewGmReadClarification({
      provider,
      playerAction: "I attack whichever guard is the exact backend target.",
      frame: createFrame(),
      gmRead: {
        ...baseClarification,
        clarificationPrompt: "Which exact target id are you attacking?",
      },
    });

    expect(result).toMatchObject({
      repaired: false,
      reason: "high_impact_or_irreversible",
    });
    expect(safeGenerateObject).not.toHaveBeenCalled();
  });

  it("keeps valid clarification for contradictory intent", async () => {
    const result = await reviewGmReadClarification({
      provider,
      playerAction: "I go into the market and stay here waiting.",
      frame: createFrame(),
      gmRead: baseClarification,
    });

    expect(result).toMatchObject({
      repaired: false,
      reason: "contradictory_intent",
    });
    expect(safeGenerateObject).not.toHaveBeenCalled();
  });

  it("keeps valid clarification when target identity matters mechanically", async () => {
    const result = await reviewGmReadClarification({
      provider,
      playerAction: "I follow one of them through the crowd.",
      frame: createFrame({
        targetCandidates: [
          {
            id: "actor-market-clerk",
            actorId: clerkId,
            type: "actor",
            label: "Market Clerk",
            awareness: "clear",
          },
          {
            id: "actor-gate-guard",
            actorId: guardId,
            type: "actor",
            label: "Gate Guard",
            awareness: "clear",
          },
        ],
      }),
      gmRead: {
        ...baseClarification,
        clarificationPrompt: "Which exact target should I follow?",
      },
    });

    expect(result).toMatchObject({
      repaired: false,
      reason: "identity_critical_ambiguity",
    });
    expect(safeGenerateObject).not.toHaveBeenCalled();
  });

  it("keeps clarification when no lookup or bridge tool can fairly resolve the turn", async () => {
    const result = await reviewGmReadClarification({
      provider,
      playerAction: "I go onward and look for tea.",
      frame: createFrame({
        movementCandidates: [],
        targetCandidates: [],
        allowedTools: ["log_event"],
      }),
      gmRead: baseClarification,
    });

    expect(result).toMatchObject({
      repaired: false,
      reason: "no_fair_bridge",
      bridgeCandidateCount: 0,
    });
    expect(safeGenerateObject).not.toHaveBeenCalled();
  });
});
