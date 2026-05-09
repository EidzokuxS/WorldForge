import { describe, expect, it, vi, beforeEach, type Mock } from "vitest";

vi.mock("../tool-executor.js", () => ({
  executeToolCall: vi.fn(),
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

describe("hidden adjudication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
          toolName: "log_event",
          input: { text: "event", importance: 1, participants: [] },
        })),
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

  it("executes ordered plan actions deterministically and preserves quick_actions/state_update mapping", async () => {
    (executeToolCall as Mock)
      .mockResolvedValueOnce({
        success: true,
        result: {
          locationId: "loc-2",
          locationName: "Shrine",
          travelCost: 1,
          tickAdvance: 1,
          path: ["Gate", "Shrine"],
        },
      })
      .mockResolvedValueOnce({
        success: true,
        result: {
          actions: [{ label: "Look around", action: "I scan the shrine courtyard." }],
        },
      });

    const executed = await executeAdjudicationPlan({
      campaignId: "campaign-1",
      tick: 7,
      outcomeTier: "strong_hit",
      plan: {
        rationale: "Move first, then present concrete follow-ups.",
        actions: [
          { toolName: "move_to", input: { targetLocationName: "Shrine" } },
          {
            toolName: "offer_quick_actions",
            input: { actions: [{ label: "Look around", action: "I scan the shrine courtyard." }] },
          },
        ],
      },
    });

    expect(executeToolCall).toHaveBeenNthCalledWith(
      1,
      "campaign-1",
      "move_to",
      { targetLocationName: "Shrine" },
      7,
      "strong_hit",
    );
    expect(executeToolCall).toHaveBeenNthCalledWith(
      2,
      "campaign-1",
      "offer_quick_actions",
      { actions: [{ label: "Look around", action: "I scan the shrine courtyard." }] },
      7,
      "strong_hit",
    );
    expect(executed.successfulTravel).toEqual({
      locationId: "loc-2",
      locationName: "Shrine",
      travelCost: 1,
      tickAdvance: 1,
      path: ["Gate", "Shrine"],
    });
    expect(executed.emittedEvents).toEqual([
      {
        type: "state_update",
        data: {
          type: "location_change",
          locationId: "loc-2",
          locationName: "Shrine",
          travelCost: 1,
          tickAdvance: 1,
          path: ["Gate", "Shrine"],
        },
      },
      {
        type: "quick_actions",
        data: {
          success: true,
          result: {
            actions: [{ label: "Look around", action: "I scan the shrine courtyard." }],
          },
        },
      },
    ]);
  });

  it("fails loud on the first unsuccessful executed action", async () => {
    (executeToolCall as Mock).mockResolvedValue({
      success: false,
      error: "Unknown character",
    });

    await expect(
      executeAdjudicationPlan({
        campaignId: "campaign-1",
        tick: 4,
        plan: {
          rationale: "Bad plan should abort immediately.",
          actions: [
            {
              toolName: "add_tag",
              input: { entityName: "Ghost", entityType: "npc", tag: "observed" },
            },
          ],
        },
      }),
    ).rejects.toThrow("Adjudication action failed: add_tag");
  });

  it("builds a judge-only contract with no prose requirement", () => {
    const contract = buildJudgeAdjudicationContract();

    expect(contract).toContain("hidden judge adjudication pass");
    expect(contract).toContain("STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication.v1");
    expect(contract).toContain('"actions": [{ "toolName": RuntimeToolName, "input": object }]');
    expect(contract).toContain('"offer_quick_actions" input');
    expect(contract).toContain('"actions": [{ "label": string, "action": string }]');
    expect(contract).toContain("3-5 actions");
    expect(contract).toContain("Hidden adjudication minimal valid output");
    expect(contract).toContain("missing input");
    expect(contract).toContain("missing actions[].action");
    expect(contract).toContain("unsupported toolName");
    expect(contract).toContain("payload instead of input");
    expect(contract).toContain("invented source truth");
    for (const toolName of Object.keys(runtimeToolInputSchemas)) {
      if (toolName === "request_contested_outcome") continue;
      expect(contract).toContain(`"${toolName}"`);
    }
    expect(contract).not.toContain('"request_contested_outcome" input');
    expect(contract).not.toContain("narrative prose only");
  });
});

describe("engine prompt contracts", () => {
  it("renders every runtime tool input contract from the schema registry", () => {
    const contract = buildRuntimeToolInputContract();

    for (const toolName of Object.keys(runtimeToolInputSchemas)) {
      expect(contract).toContain(`"${toolName}"`);
    }

    expect(contract).toContain('"offer_quick_actions"');
    expect(contract).toContain('"actions": [{ "label": string, "action": string }]');
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

    const hiddenContract = buildHiddenAdjudicationPromptContract();
    expect(hiddenContract).toContain("STRUCTURED_OUTPUT_CONTRACT: hidden-adjudication.v1");
    expect(hiddenContract).toContain('"actions": [{ "toolName": RuntimeToolName, "input": object }]');
    expect(hiddenContract).toContain("Do not invent source truth");
  });
});
