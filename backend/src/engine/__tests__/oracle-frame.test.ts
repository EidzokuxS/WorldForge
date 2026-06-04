import { describe, expect, it } from "vitest";

import {
  DURABILITY_NO_BYPASS_CLAMP_LINE,
  buildOracleFrame,
  formatOracleFrameForPrompt,
} from "../oracle-frame.js";

describe("OracleFrame", () => {
  it("formats bounded oracle evidence with source refs before model invocation", () => {
    const frame = buildOracleFrame({
      payload: {
        intent: "Force the rusted gate",
        method: "shoulder through the hinge",
        actorTags: ["strong", "injured"],
        targetTags: ["rusted-gate"],
        environmentTags: ["rain"],
        sceneContext: "The gate blocks the canal path.",
        combatEnvelope: {
          matchup: "disadvantaged",
          durabilityTierGap: 2,
          durabilityStepGap: 20,
          speedTierGap: 0,
          speedStepGap: 0,
          intelligenceTierGap: null,
          intelligenceStepGap: null,
          actorBypassesTarget: false,
          targetBypassesActor: false,
          actorBypassSources: [],
          targetBypassSources: [],
          relevantVulnerabilities: [],
          summaryLines: ["The hinge is stronger than the actor's leverage."],
        },
      },
      sourceRefs: [
        { id: "action-1", kind: "action" },
        { id: "scene-frame-1", kind: "scene_context" },
      ],
      hiddenProposalCandidates: ["proposal-secret-route"],
      irrelevantLoreCandidates: ["old kingdom backstory"],
      fullMemoryCandidates: ["full npc memory dump"],
      chatHistoryMessages: ["old chat line"],
    });
    const prompt = formatOracleFrameForPrompt(frame);

    expect(prompt).toContain("Action: Force the rusted gate via shoulder through the hinge");
    expect(prompt).toContain("Actor: [strong, injured]");
    expect(prompt).toContain("Target: [rusted-gate]");
    expect(prompt).toContain(DURABILITY_NO_BYPASS_CLAMP_LINE);
    expect(prompt).not.toContain("proposal-secret-route");
    expect(prompt).not.toContain("old kingdom backstory");
    expect(prompt).not.toContain("full npc memory dump");
    expect(prompt).not.toContain("old chat line");
    expect(frame.contextBudgetTrace.frameType).toBe("OracleFrame");
    expect(frame.contextBudgetTrace.excludedByVisibilityCount).toBe(2);
    expect(frame.contextBudgetTrace.excludedByBudgetCount).toBe(2);
    expect(frame.contextBudgetTrace.sourceCoverage.sourceBackedCount).toBe(2);
    expect(frame.contextBudgetTrace.didClipModelOutput).toBe(false);
  });
});
