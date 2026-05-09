import { beforeEach, describe, expect, it, vi } from "vitest";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  deriveBeatPlanToolPosture,
  formatBeatPlanForNarrator,
  formatBeatPlanForScenePlanner,
  gmBeatPlanSchema,
  runGmBeatPlan,
  validateBeatPlanForFrame,
  type GmBeatPlan,
} from "../gm-beat-plan.js";
import type { GmTurnDecision } from "../gm-turn-decision.js";
import type { SceneFrame } from "../scene-frame.js";
import {
  SCOPED_FORECAST_EXCERPT_VERSION,
  type ScopedForecastExcerpt,
} from "../world-forecast.js";

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => ({ modelId: "judge-test-model" })),
}));

const playerId = "11111111-1111-4111-8111-111111111111";
const npcId = "22222222-2222-4222-8222-222222222222";
const hiddenNpcId = "77777777-7777-4777-8777-777777777777";

const provider: ProviderConfig = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "test-key",
  model: "judge-model",
};

const directDecision: GmTurnDecision = {
  path: "direct",
  directResolutionNotes: "Answer without mutation.",
  evidenceRefs: ["Player"],
};

const toolDecision: GmTurnDecision = {
  path: "tool_plan",
  plannedTools: [
    {
      toolName: "log_event",
      actorRef: "Player",
      targetRefs: [],
      input: {
        text: "The player promises to return.",
        importance: 6,
        participants: ["Player"],
        durability: "durable",
        futureRelevance: "The promise should shape trust later.",
      },
      evidenceRefs: ["Player"],
    },
  ],
  evidenceRefs: ["Player"],
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
    recentEvents: [],
    targetCandidates: [
      {
        id: npcId,
        actorId: npcId,
        type: "actor",
        label: "Road Warden",
        awareness: "clear",
      },
    ],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event", "move_to", "set_condition"],
    oracleContext: null,
    combatEnvelope: null,
    oracle: null,
    ...overrides,
  };
}

function createScopedForecast(): ScopedForecastExcerpt {
  return {
    version: SCOPED_FORECAST_EXCERPT_VERSION,
    baseTick: 4,
    promptReady: true,
    entries: [
      {
        entryId: "forecast-local-rain",
        horizonTicks: 12,
        subjectRefs: [
          {
            type: "location",
            id: "99999999-9999-4999-8999-999999999999",
            label: "Town Gate",
          },
        ],
        confidence: 0.7,
        pressure: "Rain will make the road harder to read if the player waits.",
        preconditions: ["The player remains near the gate."],
      },
    ],
    forbiddenPrivateTerms: ["Forest Outpost", "Okutama Safe Zone", "Outpost Cook"],
  };
}

function createBeatPlan(overrides: Partial<GmBeatPlan> = {}): GmBeatPlan {
  return gmBeatPlanSchema.parse({
    version: "gm-beat-plan.v1",
    beatIntent: "Let the warden answer the immediate question without changing world state.",
    whyNow: "The player asked a direct local question and no uncertainty is required.",
    localFocus: {
      actorRefs: ["Player", "Road Warden"],
      locationRefs: ["Town Gate"],
      sceneRefs: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
      evidenceRefs: ["Player", "Road Warden"],
    },
    pacing: "breathe",
    tensionPosture: "low",
    revealBudget: {
      mode: "hint",
      playerFacingSummary: "The road may become harder to read if the delay continues.",
      privateRationale: "Use the local rain forecast as pressure, not as a forced route.",
    },
    forecastInfluenceRefs: [
      {
        entryId: "forecast-local-rain",
        influence: "Add gentle time pressure around the road.",
        force: "pressure_only",
      },
    ],
    agencyGuardrails: {
      ifPlayerDoesNothing: "The warden waits and the rain keeps building.",
      alternativesOpen: [
        "Ask a follow-up question.",
        "Inspect the road.",
        "Leave the gate.",
      ],
      nonForcingGuidance: "Do not force the player toward the road; keep choices open.",
    },
    toolPosture: deriveBeatPlanToolPosture(directDecision),
    narratorGuidance: {
      playerFacingBeat: "The warden answers plainly while the weather presses at the edges.",
      settledFactsOnly: "Only narrate the answer and visible weather pressure.",
      tone: "Grounded and quiet.",
    },
    privateRationale: "Private reason: direct path, no mutation, local forecast only.",
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GM BeatPlan contract", () => {
  it("requires strict current-beat intent, why-now, focus, posture, reveal budget, forecast refs, and tool posture", () => {
    const parsed = gmBeatPlanSchema.parse(createBeatPlan());

    expect(parsed.beatIntent).toContain("warden");
    expect(parsed.whyNow).toContain("direct local question");
    expect(parsed.localFocus.evidenceRefs).toEqual(["Player", "Road Warden"]);
    expect(parsed.pacing).toBe("breathe");
    expect(parsed.tensionPosture).toBe("low");
    expect(parsed.revealBudget.mode).toBe("hint");
    expect(parsed.forecastInfluenceRefs[0]?.entryId).toBe("forecast-local-rain");
    expect(parsed.toolPosture.execution).toBe("forbid_tools");

    expect(() =>
      gmBeatPlanSchema.parse({
        version: "gm-beat-plan.v1",
        beatIntent: "Missing most required fields.",
      }),
    ).toThrow();

    expect(() =>
      gmBeatPlanSchema.parse({
        ...createBeatPlan(),
        hpDelta: -1,
      }),
    ).toThrow(/hpDelta/);
  });

  it("allows direct and no-roll decisions to create a non-mutating BeatPlan", () => {
    const frame = createFrame();
    const plan = createBeatPlan();

    expect(validateBeatPlanForFrame({
      beatPlan: plan,
      frame,
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).toEqual([]);
    expect(plan.toolPosture).toEqual({
      execution: "forbid_tools",
      allowedCategories: [],
      candidateTools: [],
    });
  });

  it("rejects nested executable payload smuggling and ScenePlan narrator facts", () => {
    const base = createBeatPlan();

    expect(() =>
      gmBeatPlanSchema.parse({
        ...base,
        localFocus: {
          ...base.localFocus,
          metadata: {
            toolInput: {
              targetName: "Player",
              delta: -1,
            },
          },
        },
      }),
    ).toThrow(/toolInput/);

    expect(() =>
      gmBeatPlanSchema.parse({
        ...base,
        revealBudget: {
          ...base.revealBudget,
          durableEvent: {
            text: "Persist this hidden fact.",
          },
        },
      }),
    ).toThrow(/durableEvent/);

    expect(() =>
      gmBeatPlanSchema.parse({
        ...base,
        plannedActions: [
          {
            toolName: "set_condition",
            input: {
              targetName: "Player",
              delta: -1,
            },
          },
        ],
      }),
    ).toThrow(/plannedActions/);

    expect(() =>
      gmBeatPlanSchema.parse({
        ...base,
        narratorFacts: {
          actionIds: ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"],
        },
      }),
    ).toThrow(/narratorFacts/);
  });

  it("normalizes near-miss advisory BeatPlan JSON without accepting executable payloads", () => {
    const nearMiss = {
      version: "gm-beat-plan.v1",
      beatIntent:
        "Describe Tiamat's sensory experience in Shibuya Station and her search for the pancake smell.",
      whyNow:
        "The player has just arrived and is actively exploring through character perspective.",
      localFocus:
        "Sensory details of Shibuya Station: crowd, lights, smells, especially the pancake aroma, and the visible exit.",
      pacing: "descriptive",
      tensionPosture: "low-to-moderate",
      revealBudget: {
        mode: "ambient",
        description: "Reveal only the immediate local sensory trail.",
      },
      forecastInfluenceRefs: [],
      agencyGuardrails: {
        description: "If the player does nothing, the station flow continues around her.",
        rules: "Do not force a destination.",
      },
      toolPosture: deriveBeatPlanToolPosture(directDecision),
      narratorGuidance: {
        description: "Keep the beat grounded in what Tiamat can smell and see.",
        tone: "Specific, sensory, and restrained.",
      },
      privateRationale: "The output is advisory and should not mutate state.",
    };

    const parsed = gmBeatPlanSchema.parse(nearMiss);

    expect(parsed.localFocus.evidenceRefs[0]).toContain("Sensory details");
    expect(parsed.pacing).toBe("breathe");
    expect(parsed.tensionPosture).toBe("rising");
    expect(parsed.revealBudget.mode).toBe("hint");
    expect(parsed.revealBudget.privateRationale).toContain("Reveal only");
    expect(parsed.agencyGuardrails.ifPlayerDoesNothing).toContain("station flow");
    expect(parsed.agencyGuardrails.alternativesOpen.length).toBeGreaterThan(0);
    expect(parsed.narratorGuidance.playerFacingBeat).toContain("Tiamat");

    expect(() =>
      gmBeatPlanSchema.parse({
        ...nearMiss,
        plannedActions: [
          {
            toolName: "spawn_npc",
            input: { locationName: "Shibuya Station" },
          },
        ],
      }),
    ).toThrow(/plannedActions/);
  });

  it("rejects unsupported runtime tools, frame-disallowed tools, and GM decision posture mismatches", () => {
    expect(() =>
      gmBeatPlanSchema.parse({
        ...createBeatPlan(),
        toolPosture: {
          execution: "require_tools",
          allowedCategories: ["memory"],
          candidateTools: ["search_environment"],
        },
      }),
    ).toThrow();

    const toolPlan = createBeatPlan({
      toolPosture: {
        execution: "require_tools",
        allowedCategories: ["world"],
        candidateTools: ["spawn_npc"],
      },
      forecastInfluenceRefs: [],
    });

    expect(validateBeatPlanForFrame({
      beatPlan: toolPlan,
      frame: createFrame({ allowedTools: ["log_event"] }),
      gmDecision: toolDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).toEqual([
      expect.objectContaining({ code: "tool_posture_mismatch" }),
      expect.objectContaining({ code: "tool_category_mismatch" }),
      expect.objectContaining({ code: "tool_not_allowed" }),
    ]);

    const directMismatch = createBeatPlan({
      toolPosture: {
        execution: "require_tools",
        allowedCategories: ["memory"],
        candidateTools: ["log_event"],
      },
      forecastInfluenceRefs: [],
    });

    expect(validateBeatPlanForFrame({
      beatPlan: directMismatch,
      frame: createFrame(),
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).toEqual([
      expect.objectContaining({ path: "toolPosture.execution" }),
      expect.objectContaining({ path: "toolPosture.candidateTools" }),
      expect.objectContaining({ path: "toolPosture.allowedCategories" }),
    ]);
  });

  it("rejects forecast refs outside the scoped excerpt and private terms in player-facing fields", () => {
    const outOfScope = createBeatPlan({
      forecastInfluenceRefs: [
        {
          entryId: "forecast-private-outpost",
          influence: "Leak a private forecast.",
          force: "pressure_only",
        },
      ],
    });

    expect(validateBeatPlanForFrame({
      beatPlan: outOfScope,
      frame: createFrame(),
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).toEqual([
      expect.objectContaining({ code: "forecast_ref_out_of_scope" }),
    ]);

    const leakingPlan = createBeatPlan({
      narratorGuidance: {
        playerFacingBeat: "A voice from Forest Outpost presses into the scene.",
        settledFactsOnly: "Only visible facts.",
        tone: "Quiet.",
      },
      forecastInfluenceRefs: [],
    });

    expect(validateBeatPlanForFrame({
      beatPlan: leakingPlan,
      frame: createFrame(),
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).toEqual([
      expect.objectContaining({ code: "private_forecast_term" }),
    ]);

    const plannerProjectionLeak = createBeatPlan({
      whyNow: "The Forest Outpost forecast should steer this scene.",
      forecastInfluenceRefs: [
        {
          entryId: "forecast-local-rain",
          influence: "Let the Okutama Safe Zone pressure shape the gate.",
          force: "pressure_only",
        },
      ],
    });

    expect(validateBeatPlanForFrame({
      beatPlan: plannerProjectionLeak,
      frame: createFrame(),
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).toEqual([
      expect.objectContaining({
        code: "private_forecast_term",
        path: expect.stringContaining("scenePlannerProjection"),
      }),
      expect.objectContaining({
        code: "private_forecast_term",
        path: expect.stringContaining("scenePlannerProjection"),
      }),
    ]);
  });

  it("formats ScenePlanner guidance as posture/category only and Narrator guidance without private rationale", () => {
    const plan = createBeatPlan();
    const scenePlannerProjection = formatBeatPlanForScenePlanner(plan);
    const narratorProjection = formatBeatPlanForNarrator(plan);

    expect(scenePlannerProjection.toolPosture).toEqual(plan.toolPosture);
    expect(JSON.stringify(scenePlannerProjection)).not.toContain("plannedActions");
    expect(JSON.stringify(scenePlannerProjection)).not.toContain("payload");
    expect(JSON.stringify(scenePlannerProjection)).not.toContain("toolInput");
    expect(JSON.stringify(scenePlannerProjection)).not.toContain("narratorFacts");

    const narratorJson = JSON.stringify(narratorProjection);
    expect(narratorJson).toContain("The warden answers plainly");
    expect(narratorJson).not.toContain("Private reason");
    expect(narratorJson).not.toContain("privateRationale");
    expect(narratorJson).not.toContain("whyNow");
  });

  it("redacts forbidden private forecast terms from ScenePlanner projection", () => {
    const leakingProjection = formatBeatPlanForScenePlanner(
      createBeatPlan({
        whyNow: "The Forest Outpost pressure is offscreen.",
        forecastInfluenceRefs: [
          {
            entryId: "forecast-local-rain",
            influence: "Use the Okutama Safe Zone thread as pressure only.",
            force: "pressure_only",
          },
        ],
        agencyGuardrails: {
          ifPlayerDoesNothing: "The Outpost Cook remains hidden.",
          alternativesOpen: ["Stay local.", "Ask about the [redacted] rumor."],
          nonForcingGuidance: "Do not force the Forest Outpost thread.",
        },
      }),
      createScopedForecast().forbiddenPrivateTerms,
    );
    const json = JSON.stringify(leakingProjection);

    expect(json).toContain("[redacted]");
    expect(json).not.toContain("Forest Outpost");
    expect(json).not.toContain("Okutama Safe Zone");
    expect(json).not.toContain("Outpost Cook");
  });

  it("runs with a scoped forecast excerpt only and omits private forecast terms from the prompt", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(safeResult(createBeatPlan()));

    const result = await runGmBeatPlan({
      provider,
      playerAction: "I ask what happened here.",
      frame: createFrame(),
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    });

    expect(result.toolPosture.execution).toBe("forbid_tools");
    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        schema: gmBeatPlanSchema,
        temperature: 0,
        retries: 1,
      }),
    );
    const call = vi.mocked(safeGenerateObject).mock.calls[0]?.[0];
    expect(call?.system).toContain("Forecast excerpts are advisory pressure only");
    expect(call?.prompt).toContain("STRUCTURED_OUTPUT_CONTRACT: gm-beat-plan.v1");
    expect(call?.prompt).toContain("PLAYER ACTION RAW TEXT");
    expect(call?.prompt).toContain("GM TURN DECISION");
    expect(call?.prompt).toContain("MODEL-FACING LOCAL SCENE PACKET");
    expect(call?.prompt).toContain("SCOPED FORECAST EXCERPT ONLY");
    expect(call?.prompt).toContain("forecast-local-rain");
    expect(call?.prompt).toContain("EXPECTED TOOL POSTURE AND CANDIDATES");
    expect(call?.prompt).not.toContain("forbiddenPrivateTerms");
    expect(call?.prompt).not.toContain("Forest Outpost");
    expect(call?.prompt).not.toContain("Okutama Safe Zone");
    expect(call?.prompt).not.toContain("Outpost Cook");
  });

  it("fails closed when model output violates the GM decision posture", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce(
      safeResult(createBeatPlan({
        toolPosture: {
          execution: "require_tools",
          allowedCategories: ["memory"],
          candidateTools: ["log_event"],
        },
        forecastInfluenceRefs: [],
      })),
    );

    await expect(runGmBeatPlan({
      provider,
      playerAction: "I say hello.",
      frame: createFrame(),
      gmDecision: directDecision,
      scopedForecastExcerpt: createScopedForecast(),
    })).rejects.toThrow(/GmBeatPlan validation failed/);
  });
});
