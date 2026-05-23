import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

const { sqliteExecMock } = vi.hoisted(() => ({
  sqliteExecMock: vi.fn(),
}));

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getSqliteConnection: vi.fn(() => ({
    exec: sqliteExecMock,
  })),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => "judge-model"),
}));

import {
  adjudicationPlanSchema,
  buildJudgeAdjudicationContract,
  executeAdjudicationPlan,
  runHiddenAdjudicationPlan,
  ADJUDICATION_PLAN_ACTION_LIMIT,
  ADJUDICATION_PLAN_RATIONALE_MAX,
  type AdjudicationPlan,
} from "../hidden-adjudication.js";
import { executeToolCall } from "../tool-executor.js";
import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel } from "../../ai/provider-registry.js";
import {
  buildHiddenAdjudicationPromptContract,
  buildRuntimeToolInputContract,
  buildScenePlannerPromptContract,
  ENGINE_CONTRACT_MARKER_PREFIX,
} from "../prompt-contracts.js";
import { runtimeToolInputSchemas } from "../tool-schemas.js";
import type { ToolExecutionContext } from "../tool-execution-context.js";

function createExecutionContext(): ToolExecutionContext {
  return {
    scope: "player_turn",
    subjectActorId: "actor-player",
    subjectActorRefs: new Set(["Player", "player"]),
    authority: {
      baseWorldVersion: 0,
      sourceEntity: { type: "player", id: "actor-player" },
      elapsedWorldTimeMinutes: 0,
      allowedWriteScopes: [
        "world:event",
        "world:intent",
        "world:time",
        "world:relationship",
        "player:*:state",
        "player:*:tags",
        "npc:*:state",
        "location:*:state",
        "item:*:state",
        "location:*",
        "item:*",
        "world:inventory",
        "world:quick_action",
      ],
    },
    legalActorRefs: new Set(["Player", "player"]),
    legalLocationRefs: new Set(["Gate", "Shrine"]),
    legalMovementRefs: new Set(["Gate", "Shrine"]),
    legalItemRefs: new Set<string>(),
    legalFactionRefs: new Set<string>(),
    currentLocationId: "loc-gate",
    currentSceneScopeId: "scene-gate",
    currentLocationRefs: new Set(["current_location", "Gate"]),
    currentSceneRefs: new Set(["current_scene", "Gate"]),
    sameTurnModelSafeRefs: [],
    bridgeLookup: {
      current: {
        campaignId: "campaign-hidden-adjudication",
        tick: 0,
        playerActorId: "actor-player",
        currentLocationId: "loc-gate",
        currentSceneScopeId: "scene-gate",
        currentLocationName: "Gate",
        currentSceneScopeName: "Gate",
        currentLocationDescription: null,
        currentSceneScopeDescription: null,
      },
      visibleActors: [],
      awarenessHints: [],
      legalTargets: [],
      legalMovement: [],
      localRecentEvents: [],
      playerKnownFacts: [],
      allowedTools: [],
    },
  };
}

describe("hidden adjudication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sqliteExecMock.mockReset();
  });

  it("bounds rationale length and ordered action count in the adjudication plan schema", () => {
    expect(() =>
      adjudicationPlanSchema.parse({
        rationale: "x".repeat(ADJUDICATION_PLAN_RATIONALE_MAX + 1),
        actions: [],
      }),
    ).toThrow();

    expect(() =>
      adjudicationPlanSchema.parse({
        rationale: "bounded",
        actions: Array.from({ length: ADJUDICATION_PLAN_ACTION_LIMIT + 1 }, () => ({
          toolName: "offer_quick_actions",
          input: {
            actions: [{
              label: "Wait",
              action: "I wait and watch.",
              sourceRefs: ["Player"],
            }],
          },
        })),
      }),
    ).toThrow();

    expect(() =>
      adjudicationPlanSchema.parse({
        rationale: "Movement belongs to GM tool loop canonical movement ownership.",
        actions: [
          {
            toolName: "move_to",
            input: { targetLocationName: "Shrine" },
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      adjudicationPlanSchema.parse({
        rationale: "hidden judge cannot request contested bounds without execution context.",
        actions: [
          {
            toolName: "request_contested_outcome",
            input: {
              actorName: "Judge",
              targetName: "Player",
              mode: "contest",
              intent: "Decide a contest from hidden adjudication.",
              stakes: "Illegal hidden authority.",
              evidenceRefs: [],
            },
          },
        ],
      }),
    ).toThrow();

    expect(() =>
      adjudicationPlanSchema.parse({
        rationale: "Semantic receipts belong to the GM tool loop, not hidden adjudication.",
        actions: [
          {
            toolName: "record_dialogue_outcome",
            input: {
              speakerRef: "Road Warden",
              addresseeRefs: ["Player"],
              outcomeKind: "answered",
              topicKind: "procedure",
              authorityKind: "role_authority",
              truthStatus: "speaker_asserted",
              durability: "scene_local",
              summary: "The warden answers.",
            },
          },
        ],
      }),
    ).toThrow();
  });

  it("runs hidden adjudication through safeGenerateObject on the judge model", async () => {
    (safeGenerateObject as Mock).mockResolvedValue({
      object: {
        rationale: "Oracle miss prevents a free success branch.",
        actions: [],
      },
      trace: {
        text: "{\"rationale\":\"Oracle miss prevents a free success branch.\",\"actions\":[]}",
        cleanedText: "{\"rationale\":\"Oracle miss prevents a free success branch.\",\"actions\":[]}",
        reasoningText: "The miss should preserve the pressure without inventing free movement.",
      },
    });

    const provider = {
      id: "judge",
      name: "Judge",
      baseUrl: "http://localhost",
      apiKey: "key",
      model: "glm-5.1",
    };

    const result = await runHiddenAdjudicationPlan({
      provider,
      system: "judge system",
      messages: [{ role: "user", content: "Attack" }],
    });

    expect(createModel).toHaveBeenCalledWith(provider, { role: "judge" });
    expect(safeGenerateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        model: "judge-model",
        schema: adjudicationPlanSchema,
        system: "judge system",
        messages: [{ role: "user", content: "Attack" }],
      }),
    );
    expect(result.actions).toEqual([]);
    expect(result.trace?.reasoningText).toBe(
      "The miss should preserve the pressure without inventing free movement.",
    );
  });

  it("executes hidden quick action projection without world mutation tools", async () => {
    const executionContext = createExecutionContext();
    (executeToolCall as Mock).mockResolvedValueOnce({
      success: true,
      result: {
        offerId: "hidden_offer",
        persisted: true,
        actions: [{
          label: "Look around",
          action: "I scan the shrine courtyard.",
          sourceRefs: ["Player"],
        }],
      },
    });

    const executed = await executeAdjudicationPlan({
      campaignId: "campaign-1",
      tick: 7,
      outcomeTier: "strong_hit",
      executionContext,
      plan: {
        rationale: "Offer concrete follow-ups without writing world state.",
        actions: [
          {
            toolName: "offer_quick_actions",
            input: {
              actions: [{
                label: "Look around",
                action: "I scan the shrine courtyard.",
                sourceRefs: ["Player"],
              }],
            },
          },
        ],
      },
    });

    expect(executeToolCall).toHaveBeenNthCalledWith(
      1,
      "campaign-1",
      "offer_quick_actions",
      {
        actions: [{
          label: "Look around",
          action: "I scan the shrine courtyard.",
          sourceRefs: ["Player"],
        }],
      },
      7,
      "strong_hit",
      executionContext,
    );
    expect(executeToolCall).toHaveBeenCalledTimes(1);
    expect(executed.successfulTravel).toBeNull();
    expect(executed.emittedEvents).toEqual([
      {
        type: "quick_actions",
        data: {
          offerId: "hidden_offer",
          actions: [{
            actionId: "hidden_offer_1",
            label: "Look around",
            action: "I scan the shrine courtyard.",
          }],
        },
      },
    ]);
    expect(sqliteExecMock).not.toHaveBeenCalled();
  });

  it("passes player-turn execution context through hidden quick-action execution", async () => {
    const executionContext = createExecutionContext();
    (executeToolCall as Mock).mockResolvedValueOnce({
      success: true,
      result: {
        offerId: "hidden_offer",
        persisted: true,
        actions: [{
          label: "Wait",
          action: "I wait and study the gate.",
          sourceRefs: ["Player"],
        }],
      },
    });

    await executeAdjudicationPlan({
      campaignId: "campaign-1",
      tick: 7,
      outcomeTier: "weak_hit",
      executionContext,
      plan: {
        rationale: "Offer a bounded next step.",
        actions: [
          {
            toolName: "offer_quick_actions",
            input: {
              actions: [{
                label: "Wait",
                action: "I wait and study the gate.",
                sourceRefs: ["Player"],
              }],
            },
          },
        ],
      },
    });

    expect(executeToolCall).toHaveBeenCalledWith(
      "campaign-1",
      "offer_quick_actions",
      {
        actions: [{
          label: "Wait",
          action: "I wait and study the gate.",
          sourceRefs: ["Player"],
        }],
      },
      7,
      "weak_hit",
      executionContext,
    );
  });

  it("rejects hidden state-bearing actions before execution", async () => {
    const executionContext = createExecutionContext();

    await expect(executeAdjudicationPlan({
      campaignId: "campaign-1",
      tick: 7,
      executionContext,
      plan: {
        rationale: "Missing authority scopes must fail before hidden writes.",
        actions: [
          {
            toolName: "log_event",
            input: {
              text: "This local beat must not be written.",
              importance: 3,
              participants: ["Player"],
              durability: "scene_local",
            },
          },
        ],
      } as unknown as AdjudicationPlan,
    })).rejects.toThrow("hidden adjudication cannot execute log_event");
    expect(executeToolCall).not.toHaveBeenCalled();
    expect(sqliteExecMock).not.toHaveBeenCalled();
  });

  it("fails loud on the first unsuccessful executed action", async () => {
    const executionContext = createExecutionContext();
    (executeToolCall as Mock).mockResolvedValue({
      success: false,
      error: "Unknown character",
    });

    await expect(
      executeAdjudicationPlan({
        campaignId: "campaign-1",
        tick: 4,
        executionContext,
        plan: {
          rationale: "Bad plan should abort immediately.",
          actions: [
            {
              toolName: "offer_quick_actions",
              input: {
                actions: [{
                  label: "Look",
                  action: "I look around.",
                  sourceRefs: ["Player"],
                }],
              },
            },
          ],
        },
      }),
    ).rejects.toThrow("Adjudication action failed: offer_quick_actions");
  });

  it("rejects legacy hidden mutation batches before executing any action", async () => {
    await expect(
      executeAdjudicationPlan({
        campaignId: "campaign-1",
        tick: 4,
        executionContext: createExecutionContext(),
        plan: {
          rationale: "Legacy hidden adjudication must not partially commit multi-step state.",
          actions: [
            {
              toolName: "add_tag",
              input: { entityName: "Gate", entityType: "location", tag: "watched" },
            },
            {
              toolName: "log_event",
              input: { text: "A second mutation should not run.", importance: 1, participants: [] },
            },
          ],
        } as unknown as AdjudicationPlan,
      }),
    ).rejects.toThrow("hidden adjudication cannot execute add_tag");

    expect(executeToolCall).not.toHaveBeenCalled();
  });

  it("builds a judge-only contract with no prose requirement", () => {
    const contract = buildJudgeAdjudicationContract();

    expect(contract).toContain("hidden judge adjudication pass");
    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication.v1");
    expect(contract).toContain('"actions": [{ "toolName": RuntimeToolName, "input": object }]');
    expect(contract).toContain('"offer_quick_actions" input');
    expect(contract).toContain('"actions": [{ "label": string, "action": string, "sourceRefs": string[] }]');
    expect(contract).toContain("3-5 actions");
    expect(contract).toContain("Hidden adjudication minimal valid output");
    expect(contract).toContain("missing input");
    expect(contract).toContain("missing actions[].action");
    expect(contract).toContain("unsupported toolName");
    expect(contract).toContain("payload instead of input");
    expect(contract).toContain("invented source truth");
    const allowedHiddenToolNames = ["offer_quick_actions"];
    expect(contract).toContain('"offer_quick_actions"');
    for (const toolName of Object.keys(runtimeToolInputSchemas)) {
      if (toolName === "request_contested_outcome") continue;
      if (allowedHiddenToolNames.includes(toolName)) continue;
      expect(contract).not.toContain(`"${toolName}" input`);
    }
    expect(contract).not.toContain('"request_contested_outcome" input');
    expect(contract).not.toContain('"log_event" input');
    expect(contract).not.toContain('"transfer_item" input');
    expect(contract).not.toContain("narrative prose only");
  });
});

describe("engine prompt contracts", () => {
  it("fails closed when no runtime tool input contract scope is supplied", () => {
    const contract = buildRuntimeToolInputContract();

    for (const toolName of Object.keys(runtimeToolInputSchemas)) {
      expect(contract).not.toContain(`"${toolName}" input`);
    }

    expect(contract).toContain("Allowed RuntimeToolName values from runtimeToolInputSchemas: (none).");
    expect(contract).toContain("no runtime tools are allowed");
    expect(contract).toContain("Runtime tool input shapes:\n- none");
    expect(contract).not.toContain('"toolName": "');
  });

  it("renders every runtime tool input contract from the schema registry when explicitly scoped", () => {
    const contract = buildRuntimeToolInputContract({
      toolNames: Object.keys(runtimeToolInputSchemas) as Array<keyof typeof runtimeToolInputSchemas>,
    });

    for (const toolName of Object.keys(runtimeToolInputSchemas)) {
      expect(contract).toContain(`"${toolName}"`);
    }

    expect(contract).toContain('"offer_quick_actions"');
    expect(contract).toContain('"actions": [{ "label": string, "action": string, "sourceRefs": string[] }]');
    expect(contract).toContain("3-5 actions");
    expect(contract).toContain("Compact valid example");
    expect(contract).toContain("nested runtime tool calls only");
    expect(contract).not.toContain('Minimal valid output:\n{ "actions": [] }');
    expect(contract).toContain("Invalid examples");
    expect(contract).toContain('missing "actions[].action"');
    expect(contract).toContain('"payload" is compatibility-only');
    expect(contract).toContain("unsupported toolName");
    expect(contract).toContain("backend owns IDs");
    expect(contract).toContain("reference resolution");
    expect(contract).toContain("trimming");
    expect(contract).toContain("final validation");
  });

  it("renders versioned scene-planner and hidden-adjudication markers", () => {
    expect(ENGINE_CONTRACT_MARKER_PREFIX).toBe("STRUCTURED_OUTPUT_CONTRACT:");

    const sceneContract = buildScenePlannerPromptContract();
    expect(sceneContract).toContain("STRUCTURED_OUTPUT_CONTRACT: scene-planner.v1");
    expect(sceneContract).toContain('"plannedActions": [{ "toolName": RuntimeToolName, "input": object }]');
    expect(sceneContract).toContain("backend generates event/action/response/narrator IDs");
    expect(sceneContract).toContain("Allowed RuntimeToolName values from runtimeToolInputSchemas: (none).");
    expect(sceneContract).not.toContain('"log_event" input');

    const hiddenContract = buildHiddenAdjudicationPromptContract();
    expect(hiddenContract).toContain("STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication.v1");
    expect(hiddenContract).toContain('"actions": [{ "toolName": RuntimeToolName, "input": object }]');
    expect(hiddenContract).toContain("Do not invent source truth");
  });
});
