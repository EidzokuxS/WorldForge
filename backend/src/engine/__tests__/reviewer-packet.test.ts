import { describe, expect, it } from "vitest";

import {
  ReviewerPacketSourceError,
  buildReviewerPacket,
  formatReviewerPacketForPrompt,
} from "../reviewer-packet.js";

describe("ReviewerPacket", () => {
  it("summarizes over-budget reviewer evidence with source ids and excludes hidden records", () => {
    const packet = buildReviewerPacket({
      id: "reviewer-budget",
      evidence: [
        {
          id: "hidden-proposal",
          kind: "redaction_finding",
          text: "Secret proposal text that must not reach review prompt.",
          sourceRefs: ["proposal-secret"],
          hidden: true,
        },
        ...Array.from({ length: 30 }, (_, index) => ({
          id: `evidence-${index}`,
          kind: "evidence" as const,
          text: `Grounded evidence ${index}.`,
          sourceRefs: [`source-${index}`],
        })),
      ],
    });
    const prompt = formatReviewerPacketForPrompt(packet);

    expect(prompt).not.toContain("Secret proposal text");
    expect(packet.contextBudgetTrace.frameType).toBe("ReviewerPacket");
    expect(packet.contextBudgetTrace.hiddenExcludedCount).toBe(1);
    expect(packet.contextBudgetTrace.summarizedItemCount).toBeGreaterThan(0);
    expect(packet.contextBudgetTrace.sourceLinkedSummaryCount).toBe(1);
    expect(packet.contextBudgetTrace.overflowWarnings).toContainEqual(
      expect.objectContaining({ code: "items_summarized_by_budget" }),
    );
    expect(packet.evidence.at(-1)?.sourceRefs).toContain("source-29");
    expect(prompt).toContain("didClipModelOutput: false");
  });

  it("rejects reviewer evidence without source refs", () => {
    expect(() =>
      buildReviewerPacket({
        id: "source-free-reviewer",
        evidence: [{
          id: "claim-1",
          kind: "grounding_claim",
          text: "This claim has no citation.",
        }],
      }),
    ).toThrow(ReviewerPacketSourceError);
  });
});
