import { describe, expect, it } from "vitest";

import { createCampaignPlayScorecard } from "./scorecard.js";

describe("Campaign Play promotion scorecard", () => {
  it("promotes only complete evidence with full mutation coverage", () => {
    expect(createCampaignPlayScorecard({
      runId: "run-one",
      lane: "deterministic-10",
      completedPlayerActions: 10,
      expectedPlayerActions: 10,
      receiptBearingMutations: 20,
      mechanicalMutations: 20,
      runtimeEvents: 80,
      runtimeRevisions: 80,
      turnOwnedRuntimeEvents: 78,
      turnOwnedRuntimeMutations: 78,
    })).toMatchObject({
      promotionEligible: true,
      receiptCoverage: 1,
      runtimeEventCoverage: 1,
      turnEventCoverage: 1,
    });
  });

  it("records missing receipt and runtime evidence as hard failures", () => {
    const scorecard = createCampaignPlayScorecard({
      runId: "run-one",
      lane: "deterministic-10",
      completedPlayerActions: 9,
      expectedPlayerActions: 10,
      receiptBearingMutations: 19,
      mechanicalMutations: 20,
      runtimeEvents: 79,
      runtimeRevisions: 80,
      turnOwnedRuntimeEvents: 77,
      turnOwnedRuntimeMutations: 78,
    });
    expect(scorecard).toMatchObject({
      promotionEligible: false,
      hardFailures: { receiptCoverageGap: 1, runtimeEventGap: 1, turnEventGap: 1 },
    });
  });

  it("rejects impossible coverage measurements", () => {
    expect(() => createCampaignPlayScorecard({
      runId: "run-one",
      lane: "deterministic-10",
      completedPlayerActions: 10,
      expectedPlayerActions: 10,
      receiptBearingMutations: 21,
      mechanicalMutations: 20,
      runtimeEvents: 80,
      runtimeRevisions: 80,
      turnOwnedRuntimeEvents: 78,
      turnOwnedRuntimeMutations: 78,
    })).toThrow("coverage cannot exceed");
  });
});
