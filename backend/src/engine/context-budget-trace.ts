import { estimateTokens } from "./token-budget.js";
import {
  getFrameBudgetSpec,
  type ContextFrameType,
  type FrameBudgetSpec,
} from "./frame-budget.js";

export type ContextBudgetViolationCode =
  | "hidden_truth_visible"
  | "full_history_dump"
  | "source_free_memory"
  | "source_free_fact"
  | "summary_as_truth"
  | "model_output_clip"
  | "budget_slice";

export interface ContextBudgetViolation {
  code: ContextBudgetViolationCode;
  message: string;
  count?: number;
  terms?: string[];
}

export type ContextBudgetOverflowWarningCode =
  | "budget_warning"
  | "budget_failure_threshold"
  | "items_summarized_by_budget"
  | "items_excluded_by_budget";

export interface ContextBudgetOverflowWarning {
  code: ContextBudgetOverflowWarningCode;
  message: string;
  count?: number;
  estimatedInputTokens?: number;
  thresholdTokens?: number;
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
  frameType?: ContextFrameType;
  budget?: FrameBudgetSpec;
  estimatedInputTokens: number;
  visibleItemCount: number;
  hiddenExcludedCount: number;
  candidateItemCount: number;
  selectedItemCount: number;
  summarizedItemCount: number;
  excludedByVisibilityCount: number;
  excludedByBudgetCount: number;
  sourceLinkedSummaryCount: number;
  overflowWarnings: ContextBudgetOverflowWarning[];
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
  genericBudgetSliceAttempted: false;
  didClipModelOutput: false;
  violations: ContextBudgetViolation[];
  notes: string[];
}

export function buildContextBudgetTrace(args: {
  label: string;
  frameType?: ContextFrameType;
  budget?: FrameBudgetSpec;
  visibleTexts: readonly string[];
  visibleItemCount: number;
  hiddenExcludedCount: number;
  candidateItemCount: number;
  selectedItemCount?: number;
  summarizedItemCount?: number;
  excludedByVisibilityCount?: number;
  excludedByBudgetCount?: number;
  sourceLinkedSummaryCount?: number;
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
  genericBudgetSliceAttempted?: boolean;
  didClipModelOutput?: boolean;
  notes?: readonly string[];
}): ContextBudgetTrace {
  const joinedVisibleText = args.visibleTexts.join("\n");
  const visibleText = joinedVisibleText.toLocaleLowerCase();
  const estimatedInputTokens = estimateTokens(joinedVisibleText);
  const budget = args.budget ?? (args.frameType ? getFrameBudgetSpec(args.frameType) : undefined);
  const selectedItemCount = Math.max(0, args.selectedItemCount ?? args.visibleItemCount);
  const summarizedItemCount = Math.max(0, args.summarizedItemCount ?? 0);
  const excludedByVisibilityCount = Math.max(
    0,
    args.excludedByVisibilityCount ?? args.hiddenExcludedCount,
  );
  const excludedByBudgetCount = Math.max(0, args.excludedByBudgetCount ?? 0);
  const sourceLinkedSummaryCount = Math.max(0, args.sourceLinkedSummaryCount ?? 0);
  const forbiddenHits = [...new Set(
    (args.forbiddenPrivateTerms ?? [])
      .map((term) => term.trim())
      .filter(Boolean)
      .filter((term) => visibleText.includes(term.toLocaleLowerCase())),
  )];
  const sourceFreeCount = Math.max(0, args.sourceCoverage?.sourceFreeCount ?? 0);
  const sourceFreeMemoryCount = Math.max(0, args.sourceFreeMemoryCount ?? 0);
  const sourceFreeSummaryCount = summarizedItemCount > 0 && sourceLinkedSummaryCount === 0
    ? summarizedItemCount
    : 0;
  const summaryAsTruthCount = Math.max(0, args.summaryAsTruthCount ?? 0) + sourceFreeSummaryCount;
  const violations: ContextBudgetViolation[] = [];
  const overflowWarnings: ContextBudgetOverflowWarning[] = [];

  if (budget && estimatedInputTokens >= budget.failTokens) {
    overflowWarnings.push({
      code: "budget_failure_threshold",
      message: `${args.label} exceeds the ${budget.frameType} failure budget threshold.`,
      estimatedInputTokens,
      thresholdTokens: budget.failTokens,
    });
  } else if (budget && estimatedInputTokens >= budget.warningTokens) {
    overflowWarnings.push({
      code: "budget_warning",
      message: `${args.label} exceeds the ${budget.frameType} warning budget threshold.`,
      estimatedInputTokens,
      thresholdTokens: budget.warningTokens,
    });
  }
  if (excludedByBudgetCount > 0) {
    overflowWarnings.push({
      code: "items_excluded_by_budget",
      message: `${args.label} excluded ${excludedByBudgetCount} records by frame budget.`,
      count: excludedByBudgetCount,
    });
  }
  if (summarizedItemCount > 0) {
    overflowWarnings.push({
      code: "items_summarized_by_budget",
      message: `${args.label} summarized ${summarizedItemCount} records by frame budget with source-linked summaries.`,
      count: summarizedItemCount,
    });
  }

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
  if (args.genericBudgetSliceAttempted) {
    violations.push({
      code: "budget_slice",
      message: `${args.label} attempted generic budget slicing instead of source-linked pre-prompt summaries.`,
      count: 1,
    });
  }

  if (violations.length > 0) {
    throw new ContextBudgetViolationError(violations);
  }

  return {
    label: args.label,
    frameType: args.frameType,
    budget,
    estimatedInputTokens,
    visibleItemCount: args.visibleItemCount,
    hiddenExcludedCount: args.hiddenExcludedCount,
    candidateItemCount: args.candidateItemCount,
    selectedItemCount,
    summarizedItemCount,
    excludedByVisibilityCount,
    excludedByBudgetCount,
    sourceLinkedSummaryCount,
    overflowWarnings,
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
    genericBudgetSliceAttempted: false,
    didClipModelOutput: false,
    violations: [],
    notes: [...(args.notes ?? [])],
  };
}
