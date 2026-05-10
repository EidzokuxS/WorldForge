import { describe, expect, it } from "vitest";

import { buildCommandNodeFrame } from "../actor-frame.js";

describe("FactionCommandFrame budget", () => {
  it("summarizes over-budget command records with source ids", () => {
    const frame = buildCommandNodeFrame({
      campaignId: "campaign-faction-frame",
      commandNodeId: "node-market",
      label: "Market Warden Desk",
      worldVersion: 3,
      reports: Array.from({ length: 34 }, (_, index) => ({
        id: `report-${index}`,
        route: "report_message" as const,
        text: `Report ${index}: routine market pressure.`,
        subjectRefs: ["market", `report-${index}`],
        sourceKnowledgeIds: [`knowledge-report-${index}`],
      })),
      publicRecords: [
        {
          id: "resource-ledger",
          route: "public_record",
          text: "Patrol reserve ledger: 6 available.",
          subjectRefs: ["patrols"],
          sourceKnowledgeIds: ["resource-ledger"],
        },
      ],
      goals: ["Keep the gate open."],
      legalTools: ["log_event"],
      hiddenExcludedCount: 2,
    });

    const summary = frame.facts.find((fact) => fact.route === "source_linked_summary");
    expect(summary).toBeDefined();
    expect(summary?.sourceKnowledgeIds).toContain("knowledge-report-33");
    expect(frame.contextBudgetTrace.frameType).toBe("FactionCommandFrame");
    expect(frame.contextBudgetTrace.excludedByVisibilityCount).toBe(2);
    expect(frame.contextBudgetTrace.summarizedItemCount).toBeGreaterThan(0);
    expect(frame.contextBudgetTrace.sourceLinkedSummaryCount).toBe(1);
  });
});
