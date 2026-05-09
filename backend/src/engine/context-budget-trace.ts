import { estimateTokens } from "./token-budget.js";

export type ContextBudgetViolationCode =
  | "hidden_truth_visible"
  | "full_history_dump"
  | "source_free_memory"
  | "source_free_fact"
  | "summary_as_truth"
  | "model_output_clip";

export interface ContextBudgetViolation {
  code: ContextBudgetViolationCode;
  message: string;
  count?: number;
  terms?: string[];
}

export class ContextBudgetViolationError extends Error {
  readonly violations: ContextBudgetViolation[];

  constructor(violations: readonly ContextBudgetViolation[]) {
    super(violations.map((violation) => violation.message).join("; "));
    this.name = "ContextBudgetViolationError";
    this.violations = [...violations];
  }
}

export interface ContextBudgetTrace {
  label: string;
  estimatedInputTokens: number;
  visibleItemCount: number;
  hiddenExcludedCount: number;
  candidateItemCount: number;
  sectionCounts: Record<string, number>;
  sourceCoverage: {
    sourceBackedCount: number;
    sourceFreeCount: number;
    routeCounts: Record<string, number>;
  };
  retrievalCounts: {
    structured: number;
    lexical: number;
    vector: number;
    returned: number;
  };
  forbiddenPrivateTermHitCount: number;
  fullHistoryDumpAttempted: false;
  sourceFreeMemoryCount: number;
  summaryAsTruthCount: number;
  didClipModelOutput: false;
  violations: ContextBudgetViolation[];
  notes: string[];
}

export function buildContextBudgetTrace(args: {
  label: string;
  visibleTexts: readonly string[];
  visibleItemCount: number;
  hiddenExcludedCount: number;
  candidateItemCount: number;
  sectionCounts: Record<string, number>;
  sourceCoverage?: {
    sourceBackedCount?: number;
    sourceFreeCount?: number;
    routeCounts?: Record<string, number>;
  };
  retrievalCounts?: {
    structured?: number;
    lexical?: number;
    vector?: number;
    returned?: number;
  };
  forbiddenPrivateTerms?: readonly string[];
  fullHistoryDumpAttempted?: boolean;
  sourceFreeMemoryCount?: number;
  summaryAsTruthCount?: number;
  didClipModelOutput?: boolean;
  notes?: readonly string[];
}): ContextBudgetTrace {
  const visibleText = args.visibleTexts.join("\n").toLocaleLowerCase();
  const forbiddenHits = [...new Set(
    (args.forbiddenPrivateTerms ?? [])
      .map((term) => term.trim())
      .filter(Boolean)
      .filter((term) => visibleText.includes(term.toLocaleLowerCase())),
  )];
  const sourceFreeCount = Math.max(0, args.sourceCoverage?.sourceFreeCount ?? 0);
  const sourceFreeMemoryCount = Math.max(0, args.sourceFreeMemoryCount ?? 0);
  const summaryAsTruthCount = Math.max(0, args.summaryAsTruthCount ?? 0);
  const violations: ContextBudgetViolation[] = [];

  if (forbiddenHits.length > 0) {
    violations.push({
      code: "hidden_truth_visible",
      message: `${args.label} includes forbidden private terms in visible context.`,
      count: forbiddenHits.length,
      terms: forbiddenHits,
    });
  }
  if (args.fullHistoryDumpAttempted) {
    violations.push({
      code: "full_history_dump",
      message: `${args.label} attempted to use a full-history prompt dump.`,
      count: 1,
    });
  }
  if (sourceFreeCount > 0) {
    violations.push({
      code: "source_free_fact",
      message: `${args.label} includes ${sourceFreeCount} source-free facts.`,
      count: sourceFreeCount,
    });
  }
  if (sourceFreeMemoryCount > 0) {
    violations.push({
      code: "source_free_memory",
      message: `${args.label} includes ${sourceFreeMemoryCount} source-free memories.`,
      count: sourceFreeMemoryCount,
    });
  }
  if (summaryAsTruthCount > 0) {
    violations.push({
      code: "summary_as_truth",
      message: `${args.label} treats ${summaryAsTruthCount} summary records as truth.`,
      count: summaryAsTruthCount,
    });
  }
  if (args.didClipModelOutput) {
    violations.push({
      code: "model_output_clip",
      message: `${args.label} attempted to clip model output instead of changing prompt/budget shape.`,
      count: 1,
    });
  }

  if (violations.length > 0) {
    throw new ContextBudgetViolationError(violations);
  }

  return {
    label: args.label,
    estimatedInputTokens: estimateTokens(args.visibleTexts.join("\n")),
    visibleItemCount: args.visibleItemCount,
    hiddenExcludedCount: args.hiddenExcludedCount,
    candidateItemCount: args.candidateItemCount,
    sectionCounts: { ...args.sectionCounts },
    sourceCoverage: {
      sourceBackedCount: Math.max(0, args.sourceCoverage?.sourceBackedCount ?? 0),
      sourceFreeCount,
      routeCounts: { ...(args.sourceCoverage?.routeCounts ?? {}) },
    },
    retrievalCounts: {
      structured: Math.max(0, args.retrievalCounts?.structured ?? 0),
      lexical: Math.max(0, args.retrievalCounts?.lexical ?? 0),
      vector: Math.max(0, args.retrievalCounts?.vector ?? 0),
      returned: Math.max(0, args.retrievalCounts?.returned ?? args.visibleItemCount),
    },
    forbiddenPrivateTermHitCount: 0,
    fullHistoryDumpAttempted: false,
    sourceFreeMemoryCount,
    summaryAsTruthCount,
    didClipModelOutput: false,
    violations: [],
    notes: [...(args.notes ?? [])],
  };
}
