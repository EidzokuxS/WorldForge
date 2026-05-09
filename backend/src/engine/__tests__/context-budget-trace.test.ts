import { describe, expect, it } from "vitest";

import {
  buildContextBudgetTrace,
  ContextBudgetViolationError,
} from "../context-budget-trace.js";

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
    expect(trace.violations).toEqual([]);
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
