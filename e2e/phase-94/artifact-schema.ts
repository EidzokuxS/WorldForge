import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import {
  PHASE94_HARD_INVARIANT_IDS,
  PHASE94_ROUTE_IDS,
  type Phase94HardInvariantId,
  type Phase94RouteId,
} from "../../backend/src/engine/phase-94-trace-assertions.js";

export type Phase94ArtifactKind =
  | "manifest"
  | "baseline-pool"
  | "route-results"
  | "turns-jsonl"
  | "trace-jsonl"
  | "sse-events-jsonl"
  | "full-turn-artifacts"
  | "world-diffs-jsonl"
  | "job-proposal-ledger"
  | "latency-context-trace"
  | "screenshots"
  | "hard-invariants"
  | "living-world-assertions"
  | "soft-review-packet"
  | "soft-review-notes"
  | "acceptance-report";

export interface Phase94ArtifactRequirement {
  kind: Phase94ArtifactKind;
  path: string;
}

export interface Phase94RouteManifestEntry {
  id: Phase94RouteId;
  title: string;
  family: Phase94RouteId;
  baselinePoolId: string;
  readOnly: false;
  actionScript: string[];
  hardInvariantIds: Phase94HardInvariantId[];
  traceAssertionIds: string[];
  requiredArtifacts: Phase94ArtifactRequirement[];
  requiredScreenshots: string[];
  softReviewRubricIds: string[];
}

export interface Phase94ManifestArtifact {
  phase: 94;
  runId: string;
  profile: string;
  turnsPerRoute: number;
  routes: Phase94RouteManifestEntry[];
}

export interface Phase94BaselineRecord {
  baselinePoolId: string;
  sourceCampaignId: string;
  sourceCampaignPath: string;
  routeIds: Phase94RouteId[];
  exists: boolean;
}

export interface Phase94RouteCloneRecord {
  routeId: Phase94RouteId;
  profile: string;
  baselinePoolId: string;
  sourceCampaignId: string;
  cloneCampaignId: string;
  sourceCampaignPath: string;
  cloneCampaignPath: string;
  routeOutputRoot: string;
  dryRun: boolean;
  status: "planned" | "created" | "reused";
}

export interface Phase94BaselinePoolArtifact {
  phase: 94;
  runId: string;
  dryRun: boolean;
  profile: string;
  baselines: Phase94BaselineRecord[];
  routeClones: Phase94RouteCloneRecord[];
}

export interface Phase94TurnRow {
  routeId: Phase94RouteId;
  turnId: string;
  action: string;
  terminalEvent: "done" | "recoverable_error" | "failed";
  rawSseArtifactId: string;
  fullTurnArtifactId: string;
}

export interface Phase94TraceRow {
  routeId: Phase94RouteId;
  turnId: string;
  traceArtifactId: string;
  hardInvariantIds: Phase94HardInvariantId[];
}

export interface Phase94RouteResult {
  routeId: Phase94RouteId;
  cloneCampaignId: string;
  status: "passed" | "failed" | "not_run";
  hardFailureCount: number;
  missingArtifactCount: number;
  artifactRoot: string;
}

export interface Phase94HardFailure {
  routeId: Phase94RouteId | "global";
  turnId: string | null;
  invariantId: Phase94HardInvariantId | string;
  gate: string;
  reason: string;
  evidenceIds: string[];
}

export interface Phase94SoftNote {
  routeId: Phase94RouteId;
  reviewer: "human" | "llm";
  verdict: "pass" | "fail" | "needs_review";
  notesPath: string;
}

export interface Phase94ReportDiagnostic {
  severity: "hard" | "soft" | "info";
  routeId: Phase94RouteId | "global";
  gate: string;
  message: string;
  evidencePaths: string[];
}

export interface Phase94RouteValidationSummary {
  routeId: Phase94RouteId;
  status: "passed" | "failed" | "missing";
  cloneCampaignId: string | null;
  sourceCampaignId: string | null;
  artifactRoot: string;
  turnCount: number;
  terminalDoneCount: number;
  hardFailureCount: number;
  missingArtifactCount: number;
  unreadableArtifactCount: number;
}

export interface Phase94LivingWorldMetrics {
  route_completion_ratio: number;
  hard_failure_count: number;
  missing_artifact_count: number;
  oracle_persistence_failures: number;
  narrator_repair_without_rollback_count: number;
  proposal_terminal_state_ratio: number | null;
  proposal_commit_ratio: number | null;
  surface_signal_coverage: number | null;
  stale_job_count: number;
  unnecessary_clarification_rate: number;
  parser_like_response_rate: number;
  empty_assistant_text_count: number;
  hidden_truth_leak_count: number;
  avg_turn_latency_by_stage: Record<string, number>;
  context_budget_overflow_count: number;
}

export interface Phase94LivingWorldAssertionsArtifact {
  phase: 94;
  runId: string;
  generatedAt: string;
  status: "passed" | "failed";
  metrics: Phase94LivingWorldMetrics;
  routeSummaries: Phase94RouteValidationSummary[];
  diagnostics: Phase94ReportDiagnostic[];
}

export interface Phase94AcceptanceReport {
  phase: 94;
  runId: string;
  generatedAt: string;
  inputRoot: string;
  profile: string;
  requiredRouteMode: "full-matrix" | "manifest-subset";
  status: "passed" | "failed";
  routeSummaries: Phase94RouteValidationSummary[];
  routeResults: Phase94RouteResult[];
  hardFailures: Phase94HardFailure[];
  softNotes: Phase94SoftNote[];
  diagnostics: Phase94ReportDiagnostic[];
  metrics: Phase94LivingWorldMetrics;
}

export const PHASE94_REQUIRED_ARTIFACTS: readonly Phase94ArtifactKind[] = [
  "turns-jsonl",
  "trace-jsonl",
  "sse-events-jsonl",
  "full-turn-artifacts",
  "world-diffs-jsonl",
  "job-proposal-ledger",
  "latency-context-trace",
  "screenshots",
] as const;

const HARD_INVARIANT_SET = new Set(PHASE94_HARD_INVARIANT_IDS);
const ROUTE_ID_SET = new Set(PHASE94_ROUTE_IDS);

function assertNonEmptyString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
}

function assertNonEmptyArray<T>(value: readonly T[] | undefined, label: string): asserts value is readonly T[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${label} must be a non-empty array.`);
  }
}

export function assertPhase94ManifestValid(
  routes: readonly Phase94RouteManifestEntry[],
  options: { requireAllRoutes?: boolean } = {},
): void {
  const seen = new Set<string>();
  for (const route of routes) {
    if (!ROUTE_ID_SET.has(route.id)) {
      throw new Error(`Unknown Phase 94 route id: ${route.id}`);
    }
    if (seen.has(route.id)) {
      throw new Error(`Duplicate Phase 94 route id: ${route.id}`);
    }
    seen.add(route.id);
    if (route.readOnly !== false) {
      throw new Error(`Phase 94 route ${route.id} must not run directly against a shared read-only baseline.`);
    }
    assertNonEmptyString(route.title, `${route.id}.title`);
    assertNonEmptyString(route.baselinePoolId, `${route.id}.baselinePoolId`);
    assertNonEmptyArray(route.actionScript, `${route.id}.actionScript`);
    assertNonEmptyArray(route.hardInvariantIds, `${route.id}.hardInvariantIds`);
    assertNonEmptyArray(route.traceAssertionIds, `${route.id}.traceAssertionIds`);
    assertNonEmptyArray(route.requiredArtifacts, `${route.id}.requiredArtifacts`);
    assertNonEmptyArray(route.requiredScreenshots, `${route.id}.requiredScreenshots`);
    assertNonEmptyArray(route.softReviewRubricIds, `${route.id}.softReviewRubricIds`);
    for (const invariantId of route.hardInvariantIds) {
      if (!HARD_INVARIANT_SET.has(invariantId)) {
        throw new Error(`Route ${route.id} references unknown invariant ${invariantId}.`);
      }
    }
    const artifactKinds = new Set(route.requiredArtifacts.map((artifact) => artifact.kind));
    for (const required of PHASE94_REQUIRED_ARTIFACTS) {
      if (!artifactKinds.has(required)) {
        throw new Error(`Route ${route.id} is missing required artifact kind ${required}.`);
      }
    }
  }
  if (options.requireAllRoutes ?? true) {
    const missing = PHASE94_ROUTE_IDS.filter((routeId) => !seen.has(routeId));
    if (missing.length > 0) {
      throw new Error(`Phase 94 manifest is missing route ids: ${missing.join(", ")}.`);
    }
  }
}

export function assertPhase94BaselinePoolValid(
  pool: Phase94BaselinePoolArtifact,
  options: { routeIds?: readonly Phase94RouteId[] } = {},
): void {
  const cloneRoutes = new Set(pool.routeClones.map((clone) => clone.routeId));
  for (const routeId of options.routeIds ?? PHASE94_ROUTE_IDS) {
    if (!cloneRoutes.has(routeId)) {
      throw new Error(`Baseline pool is missing route clone for ${routeId}.`);
    }
  }
  for (const clone of pool.routeClones) {
    assertNonEmptyString(clone.sourceCampaignId, `${clone.routeId}.sourceCampaignId`);
    assertNonEmptyString(clone.cloneCampaignId, `${clone.routeId}.cloneCampaignId`);
    if (clone.cloneCampaignId === clone.sourceCampaignId) {
      throw new Error(`Route ${clone.routeId} would run directly against baseline ${clone.sourceCampaignId}.`);
    }
  }
}

export function writeJsonFile(filePath: string, value: unknown): void {
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf-8");
}
