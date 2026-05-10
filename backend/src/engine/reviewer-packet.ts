import {
  buildContextBudgetTrace,
  type ContextBudgetTrace,
} from "./context-budget-trace.js";
import { getFrameBudgetSpec } from "./frame-budget.js";

export type ReviewerPacketEvidenceKind =
  | "evidence"
  | "redaction_finding"
  | "grounding_claim"
  | "source_linked_summary";

export interface ReviewerPacketEvidenceInput {
  id: string;
  kind: Exclude<ReviewerPacketEvidenceKind, "source_linked_summary">;
  text: string;
  sourceRefs?: readonly string[];
  hidden?: boolean;
}

export interface ReviewerPacketEvidence {
  id: string;
  kind: ReviewerPacketEvidenceKind;
  text: string;
  sourceRefs: string[];
}

export interface ReviewerPacket {
  id: string;
  evidence: ReviewerPacketEvidence[];
  excluded: {
    hiddenEvidenceCount: number;
    sourceFreeEvidenceCount: number;
  };
  contextBudgetTrace: ContextBudgetTrace;
}

export class ReviewerPacketSourceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReviewerPacketSourceError";
  }
}

function uniqueStrings(values: Iterable<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function normalizeEvidence(input: ReviewerPacketEvidenceInput): ReviewerPacketEvidence {
  return {
    id: input.id,
    kind: input.kind,
    text: input.text.trim(),
    sourceRefs: uniqueStrings(input.sourceRefs ?? []),
  };
}

function buildSourceLinkedSummary(
  overflow: readonly ReviewerPacketEvidence[],
): ReviewerPacketEvidence | null {
  if (overflow.length === 0) {
    return null;
  }
  const sourceRefs = uniqueStrings(overflow.flatMap((entry) => [entry.id, ...entry.sourceRefs]));
  return {
    id: `reviewer-summary:${sourceRefs.slice(0, 4).join(":")}`,
    kind: "source_linked_summary",
    text: `${overflow.length} reviewer records summarized for budget. Sources: ${sourceRefs.slice(0, 8).join(", ")}.`,
    sourceRefs,
  };
}

export function buildReviewerPacket(input: {
  id: string;
  evidence: readonly ReviewerPacketEvidenceInput[];
}): ReviewerPacket {
  const visibleCandidates = input.evidence
    .filter((entry) => !entry.hidden)
    .map(normalizeEvidence)
    .filter((entry) => entry.text.length > 0);
  const hiddenEvidenceCount = input.evidence.filter((entry) => entry.hidden).length;
  const sourceFreeEvidenceCount = visibleCandidates.filter((entry) => entry.sourceRefs.length === 0)
    .length;
  if (sourceFreeEvidenceCount > 0) {
    throw new ReviewerPacketSourceError(
      `ReviewerPacket includes ${sourceFreeEvidenceCount} source-free evidence records.`,
    );
  }

  const budget = getFrameBudgetSpec("ReviewerPacket");
  const selected = visibleCandidates.slice(0, budget.maxSelectedItems);
  const overflow = visibleCandidates.slice(budget.maxSelectedItems);
  const summary = buildSourceLinkedSummary(overflow);
  const evidence = summary ? [...selected, summary] : selected;

  return {
    id: input.id,
    evidence,
    excluded: {
      hiddenEvidenceCount,
      sourceFreeEvidenceCount,
    },
    contextBudgetTrace: buildContextBudgetTrace({
      label: "ReviewerPacket",
      frameType: "ReviewerPacket",
      visibleTexts: evidence.map((entry) => entry.text),
      visibleItemCount: evidence.length,
      hiddenExcludedCount: hiddenEvidenceCount,
      candidateItemCount: input.evidence.length,
      selectedItemCount: selected.length,
      summarizedItemCount: overflow.length,
      excludedByVisibilityCount: hiddenEvidenceCount,
      sourceLinkedSummaryCount: summary ? 1 : 0,
      sectionCounts: evidence.reduce<Record<string, number>>((counts, entry) => {
        counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
        return counts;
      }, {}),
      sourceCoverage: {
        sourceBackedCount: evidence.length,
        routeCounts: evidence.reduce<Record<string, number>>((counts, entry) => {
          counts[entry.kind] = (counts[entry.kind] ?? 0) + 1;
          return counts;
        }, {}),
      },
      notes: [
        "ReviewerPacket evidence is bounded before prompt formatting and summaries carry source refs.",
      ],
    }),
  };
}

export function formatReviewerPacketForPrompt(packet: ReviewerPacket): string {
  return [
    "[REVIEWER PACKET]",
    `Packet: ${packet.id}`,
    ...packet.evidence.map((entry) =>
      `- ${entry.kind}:${entry.id}: ${entry.text} [sources=${entry.sourceRefs.join(", ")}]`,
    ),
    "[CONTEXT BUDGET TRACE]",
    `- frameType: ${packet.contextBudgetTrace.frameType}`,
    `- selectedItemCount: ${packet.contextBudgetTrace.selectedItemCount}`,
    `- summarizedItemCount: ${packet.contextBudgetTrace.summarizedItemCount}`,
    `- hiddenExcludedCount: ${packet.contextBudgetTrace.hiddenExcludedCount}`,
    `- didClipModelOutput: ${packet.contextBudgetTrace.didClipModelOutput}`,
  ].join("\n");
}
