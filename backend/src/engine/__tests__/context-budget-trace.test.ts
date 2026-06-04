import { describe, expect, it } from "vitest";

import {
  buildContextBudgetTrace,
  ContextBudgetViolationError,
} from "../context-budget-trace.js";
import { FRAME_BUDGET_SPECS } from "../frame-budget.js";

describe("context budget trace", () => {
  it("records source coverage and retrieval counts without clipping model output", () => {
    const trace = buildContextBudgetTrace({
      label: "ActorFrame",
      visibleTexts: [
        "Source-backed fact about the local scene.",
        "Source-backed actor memory with citation.",
      ],
      visibleItemCount: 2,
      hiddenExcludedCount: 4,
      candidateItemCount: 6,
      sectionCounts: {
        facts: 2,
        memories: 1,
      },
      sourceCoverage: {
        sourceBackedCount: 2,
        routeCounts: {
          observation: 1,
          report: 1,
        },
      },
      retrievalCounts: {
        structured: 3,
        lexical: 1,
        vector: 0,
        returned: 2,
      },
      forbiddenPrivateTerms: ["hidden assassin"],
      notes: ["bounded packet"],
    });

    expect(trace.estimatedInputTokens).toBeGreaterThan(0);
    expect(trace.sourceCoverage).toEqual({
      sourceBackedCount: 2,
      sourceFreeCount: 0,
      routeCounts: {
        observation: 1,
        report: 1,
      },
    });
    expect(trace.retrievalCounts).toEqual({
      structured: 3,
      lexical: 1,
      vector: 0,
      returned: 2,
    });
    expect(trace.fullHistoryDumpAttempted).toBe(false);
    expect(trace.didClipModelOutput).toBe(false);
    expect(trace.selectedItemCount).toBe(2);
    expect(trace.summarizedItemCount).toBe(0);
    expect(trace.excludedByVisibilityCount).toBe(4);
    expect(trace.excludedByBudgetCount).toBe(0);
    expect(trace.overflowWarnings).toEqual([]);
    expect(trace.violations).toEqual([]);
  });

  it("defines shared frame budget specs for all Phase 93 frame and packet types", () => {
    expect(Object.keys(FRAME_BUDGET_SPECS).sort()).toEqual([
      "ActorFrame",
      "FactionCommandFrame",
      "NarratorPacket",
      "OracleFrame",
      "ReviewerPacket",
      "SceneFrame",
    ]);
    for (const spec of Object.values(FRAME_BUDGET_SPECS)) {
      expect(spec.targetTokens).toBeGreaterThan(0);
      expect(spec.warningTokens).toBeGreaterThan(spec.targetTokens);
      expect(spec.failTokens).toBeGreaterThan(spec.warningTokens);
      expect(spec.maxSelectedItems).toBeGreaterThan(0);
      expect(spec.maxSourceLinkedSummaries).toBeGreaterThan(0);
    }
  });

  it("records selected, summarized, visibility-excluded, budget-excluded, and overflow warning counts", () => {
    const trace = buildContextBudgetTrace({
      label: "SceneFrame",
      frameType: "SceneFrame",
      visibleTexts: ["A source-linked summary of six old local reports."],
      visibleItemCount: 4,
      selectedItemCount: 3,
      summarizedItemCount: 1,
      sourceLinkedSummaryCount: 1,
      hiddenExcludedCount: 2,
      excludedByVisibilityCount: 2,
      excludedByBudgetCount: 6,
      candidateItemCount: 12,
      sectionCounts: {
        directRecords: 3,
        sourceLinkedSummaries: 1,
      },
      sourceCoverage: {
        sourceBackedCount: 4,
        routeCounts: {
          source_linked_summary: 1,
          observation: 3,
        },
      },
    });

    expect(trace.frameType).toBe("SceneFrame");
    expect(trace.budget).toMatchObject({ frameType: "SceneFrame" });
    expect(trace.selectedItemCount).toBe(3);
    expect(trace.summarizedItemCount).toBe(1);
    expect(trace.sourceLinkedSummaryCount).toBe(1);
    expect(trace.excludedByVisibilityCount).toBe(2);
    expect(trace.excludedByBudgetCount).toBe(6);
    expect(trace.overflowWarnings).toContainEqual(
      expect.objectContaining({
        code: "items_excluded_by_budget",
        count: 6,
      }),
    );
    expect(trace.didClipModelOutput).toBe(false);
  });

  it("fails closed on source-free summaries and generic budget slicing", () => {
    expect(() =>
      buildContextBudgetTrace({
        label: "ReviewerPacket",
        frameType: "ReviewerPacket",
        visibleTexts: ["A compressed but uncited reviewer summary."],
        visibleItemCount: 1,
        summarizedItemCount: 1,
        sourceLinkedSummaryCount: 0,
        hiddenExcludedCount: 0,
        candidateItemCount: 3,
        sectionCounts: { summaries: 1 },
        sourceCoverage: { sourceBackedCount: 1 },
        genericBudgetSliceAttempted: true,
      }),
    ).toThrow(ContextBudgetViolationError);

    try {
      buildContextBudgetTrace({
        label: "ReviewerPacket",
        frameType: "ReviewerPacket",
        visibleTexts: ["A compressed but uncited reviewer summary."],
        visibleItemCount: 1,
        summarizedItemCount: 1,
        sourceLinkedSummaryCount: 0,
        hiddenExcludedCount: 0,
        candidateItemCount: 3,
        sectionCounts: { summaries: 1 },
        sourceCoverage: { sourceBackedCount: 1 },
        genericBudgetSliceAttempted: true,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetViolationError);
      expect((error as ContextBudgetViolationError).violations.map((violation) => violation.code))
        .toEqual(["summary_as_truth", "budget_slice"]);
    }
  });

  it("fails closed on hidden truth, source-free facts, summary-as-truth, full history dumps, and output clipping", () => {
    expect(() =>
      buildContextBudgetTrace({
        label: "NarratorPacket",
        visibleTexts: ["The hidden assassin waits above the player."],
        visibleItemCount: 1,
        hiddenExcludedCount: 0,
        candidateItemCount: 1,
        sectionCounts: { facts: 1 },
        sourceCoverage: {
          sourceFreeCount: 1,
        },
        forbiddenPrivateTerms: ["hidden assassin"],
        fullHistoryDumpAttempted: true,
        sourceFreeMemoryCount: 2,
        summaryAsTruthCount: 1,
        didClipModelOutput: true,
      }),
    ).toThrow(ContextBudgetViolationError);

    try {
      buildContextBudgetTrace({
        label: "NarratorPacket",
        visibleTexts: ["The hidden assassin waits above the player."],
        visibleItemCount: 1,
        hiddenExcludedCount: 0,
        candidateItemCount: 1,
        sectionCounts: { facts: 1 },
        sourceCoverage: {
          sourceFreeCount: 1,
        },
        forbiddenPrivateTerms: ["hidden assassin"],
        fullHistoryDumpAttempted: true,
        sourceFreeMemoryCount: 2,
        summaryAsTruthCount: 1,
        didClipModelOutput: true,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(ContextBudgetViolationError);
      expect((error as ContextBudgetViolationError).violations.map((violation) => violation.code))
        .toEqual([
          "hidden_truth_visible",
          "full_history_dump",
          "source_free_fact",
          "source_free_memory",
          "summary_as_truth",
          "model_output_clip",
        ]);
    }
  });
});
