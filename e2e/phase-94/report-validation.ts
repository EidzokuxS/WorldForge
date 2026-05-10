import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import {
  join,
  relative,
  resolve,
} from "node:path";

import {
  PHASE94_HARD_INVARIANT_IDS,
  PHASE94_ROUTE_IDS,
  type Phase94RouteId,
} from "../../backend/src/engine/phase-94-trace-assertions.js";
import {
  assertPhase94BaselinePoolValid,
  assertPhase94ManifestValid,
  type Phase94AcceptanceReport,
  type Phase94ArtifactKind,
  type Phase94BaselinePoolArtifact,
  type Phase94HardFailure,
  type Phase94LivingWorldAssertionsArtifact,
  type Phase94LivingWorldMetrics,
  type Phase94ManifestArtifact,
  type Phase94ReportDiagnostic,
  type Phase94RouteResult,
  type Phase94RouteValidationSummary,
  type Phase94SoftNote,
} from "./artifact-schema.js";

type Severity = Phase94ReportDiagnostic["severity"];

interface RouteAssertionsArtifact {
  routeId: string;
  status: "passed" | "failed";
  findings?: Array<{
    routeId?: string;
    turnIndex?: number | null;
    severity?: string;
    gate?: string;
    message?: string;
    evidenceIds?: string[];
  }>;
}

interface RouteResultsArtifact {
  phase: 94;
  routeResults: Phase94RouteResult[];
}

export interface Phase94ReportValidationOptions {
  inputRoot: string;
  requireAllRoutes?: boolean;
  generatedAt?: string;
}

export interface Phase94ReportValidationResult {
  report: Phase94AcceptanceReport;
  livingWorldAssertions: Phase94LivingWorldAssertionsArtifact;
}

const ARTIFACT_FILES: Record<Exclude<Phase94ArtifactKind, "screenshots" | "manifest" | "baseline-pool" | "hard-invariants" | "living-world-assertions" | "soft-review-packet" | "soft-review-notes" | "acceptance-report">, string> = {
  "route-results": "route-results.json",
  "turns-jsonl": "turns.jsonl",
  "trace-jsonl": "trace.jsonl",
  "sse-events-jsonl": "sse-events.jsonl",
  "full-turn-artifacts": "turn-artifacts.jsonl",
  "world-diffs-jsonl": "world-diffs.jsonl",
  "job-proposal-ledger": "job-proposal-ledger.json",
  "latency-context-trace": "latency-context-trace.jsonl",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectPath(filePath: string): string {
  const rel = relative(process.cwd(), filePath);
  return rel && !rel.startsWith("..") ? rel.replace(/\\/g, "/") : filePath;
}

function addDiagnostic(
  diagnostics: Phase94ReportDiagnostic[],
  input: {
    severity: Severity;
    routeId?: Phase94RouteId | "global";
    gate: string;
    message: string;
    evidencePaths?: string[];
  },
): void {
  diagnostics.push({
    severity: input.severity,
    routeId: input.routeId ?? "global",
    gate: input.gate,
    message: input.message,
    evidencePaths: input.evidencePaths ?? [],
  });
}

function readJson<T>(
  filePath: string,
  diagnostics: Phase94ReportDiagnostic[],
  input: { gate: string; routeId?: Phase94RouteId | "global"; required?: boolean },
): T | null {
  if (!existsSync(filePath)) {
    if (input.required ?? true) {
      addDiagnostic(diagnostics, {
        severity: "hard",
        routeId: input.routeId,
        gate: input.gate,
        message: `Missing required JSON artifact: ${projectPath(filePath)}.`,
        evidencePaths: [projectPath(filePath)],
      });
    }
    return null;
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as T;
  } catch (error) {
    addDiagnostic(diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: input.gate,
      message: `Unreadable JSON artifact ${projectPath(filePath)}: ${error instanceof Error ? error.message : String(error)}.`,
      evidencePaths: [projectPath(filePath)],
    });
    return null;
  }
}

function readJsonl(
  filePath: string,
  diagnostics: Phase94ReportDiagnostic[],
  input: { gate: string; routeId: Phase94RouteId },
): unknown[] {
  if (!existsSync(filePath)) {
    addDiagnostic(diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: input.gate,
      message: `Missing required JSONL artifact: ${projectPath(filePath)}.`,
      evidencePaths: [projectPath(filePath)],
    });
    return [];
  }
  try {
    const rows = readFileSync(filePath, "utf-8")
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0)
      .map((line) => JSON.parse(line) as unknown);
    if (rows.length === 0) {
      addDiagnostic(diagnostics, {
        severity: "hard",
        routeId: input.routeId,
        gate: input.gate,
        message: `Required JSONL artifact has no rows: ${projectPath(filePath)}.`,
        evidencePaths: [projectPath(filePath)],
      });
    }
    return rows;
  } catch (error) {
    addDiagnostic(diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: input.gate,
      message: `Unreadable JSONL artifact ${projectPath(filePath)}: ${error instanceof Error ? error.message : String(error)}.`,
      evidencePaths: [projectPath(filePath)],
    });
    return [];
  }
}

function artifactRootFor(inputRoot: string, result: Phase94RouteResult | undefined, routeId: Phase94RouteId): string {
  if (result?.artifactRoot) {
    return resolve(result.artifactRoot);
  }
  return resolve(inputRoot, routeId);
}

function routeResultFor(results: readonly Phase94RouteResult[], routeId: Phase94RouteId): Phase94RouteResult | undefined {
  return results.find((result) => result.routeId === routeId);
}

function screenshotsFor(routeRoot: string): string[] {
  if (!existsSync(routeRoot) || !statSync(routeRoot).isDirectory()) return [];
  return readdirSync(routeRoot)
    .filter((entry) => entry.endsWith(".png"))
    .map((entry) => join(routeRoot, entry));
}

function validateScreenshots(input: {
  routeId: Phase94RouteId;
  routeRoot: string;
  diagnostics: Phase94ReportDiagnostic[];
}): number {
  const screenshots = screenshotsFor(input.routeRoot);
  const hasRouteStart = screenshots.some((filePath) => filePath.endsWith("route-start.png"));
  const hasFinalState = screenshots.some((filePath) => filePath.endsWith("final-state.png"));
  const hasRepresentativeTurn = screenshots.some((filePath) => /turn-\d+\.png$/.test(filePath));
  const missing = [
    hasRouteStart ? undefined : "route-start",
    hasRepresentativeTurn ? undefined : "representative-turn",
    hasFinalState ? undefined : "final-state",
  ].filter(Boolean) as string[];
  if (missing.length > 0) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "screenshots",
      message: `Missing required screenshot evidence: ${missing.join(", ")}.`,
      evidencePaths: [projectPath(input.routeRoot)],
    });
  }
  return missing.length;
}

function hardFailureFromDiagnostic(diagnostic: Phase94ReportDiagnostic): Phase94HardFailure {
  return {
    routeId: diagnostic.routeId,
    turnId: null,
    invariantId: diagnostic.gate,
    gate: diagnostic.gate,
    reason: diagnostic.message,
    evidenceIds: diagnostic.evidencePaths,
  };
}

function hardFailuresFromAssertions(assertions: RouteAssertionsArtifact | null, routeId: Phase94RouteId): Phase94HardFailure[] {
  return (assertions?.findings ?? [])
    .filter((finding) => finding.severity === "hard")
    .map((finding) => ({
      routeId,
      turnId: typeof finding.turnIndex === "number" ? String(finding.turnIndex) : null,
      invariantId: finding.gate ?? "route-assertion",
      gate: finding.gate ?? "route-assertion",
      reason: finding.message ?? "Route assertion hard failure.",
      evidenceIds: finding.evidenceIds ?? [],
    }));
}

function rowsWithHardFailure(rows: readonly unknown[]): unknown[] {
  return rows.filter((row) => isRecord(row) && row.hardFailure === true);
}

function countRowsByGate(rows: readonly unknown[], gate: string): number {
  return rows.filter((row) => (
    isRecord(row)
    && typeof row.gate === "string"
    && row.gate === gate
  )).length;
}

function validateRoute(input: {
  inputRoot: string;
  routeId: Phase94RouteId;
  routeResult: Phase94RouteResult | undefined;
  routeClone: { sourceCampaignId?: string; cloneCampaignId?: string; dryRun?: boolean } | undefined;
  diagnostics: Phase94ReportDiagnostic[];
}): {
  summary: Phase94RouteValidationSummary;
  hardFailures: Phase94HardFailure[];
  turns: unknown[];
  traceRows: unknown[];
  latencyRows: unknown[];
  ledger: unknown;
} {
  const routeRoot = artifactRootFor(input.inputRoot, input.routeResult, input.routeId);
  const beforeDiagnosticCount = input.diagnostics.length;
  const hardFailures: Phase94HardFailure[] = [];

  if (!input.routeResult) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "route-results",
      message: "Route is missing from route-results.json.",
      evidencePaths: [projectPath(resolve(input.inputRoot, "route-results.json"))],
    });
  } else if (input.routeResult.status !== "passed") {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "route-status",
      message: `Route result status is ${input.routeResult.status}.`,
      evidencePaths: [projectPath(resolve(input.inputRoot, "route-results.json"))],
    });
  }

  if (!input.routeClone) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "clone-lineage",
      message: "Route clone lineage is missing from baseline-pool.json.",
      evidencePaths: [projectPath(resolve(input.inputRoot, "baseline-pool.json"))],
    });
  } else if (!input.routeClone.sourceCampaignId || !input.routeClone.cloneCampaignId) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "clone-lineage",
      message: "Route clone lineage is incomplete.",
      evidencePaths: [projectPath(resolve(input.inputRoot, "baseline-pool.json"))],
    });
  } else if (input.routeClone.sourceCampaignId === input.routeClone.cloneCampaignId) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "clone-isolation",
      message: "Route clone id matches source baseline id.",
      evidencePaths: [projectPath(resolve(input.inputRoot, "baseline-pool.json"))],
    });
  } else if (input.routeClone.dryRun === true) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "clone-isolation",
      message: "Acceptance route uses dry-run clone lineage.",
      evidencePaths: [projectPath(resolve(input.inputRoot, "baseline-pool.json"))],
    });
  }

  const turns = readJsonl(join(routeRoot, ARTIFACT_FILES["turns-jsonl"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "turns-jsonl",
  });
  const traceRows = readJsonl(join(routeRoot, ARTIFACT_FILES["trace-jsonl"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "trace-jsonl",
  });
  const sseRows = readJsonl(join(routeRoot, ARTIFACT_FILES["sse-events-jsonl"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "sse-events-jsonl",
  });
  const turnArtifactRows = readJsonl(join(routeRoot, ARTIFACT_FILES["full-turn-artifacts"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "full-turn-artifacts",
  });
  readJsonl(join(routeRoot, ARTIFACT_FILES["world-diffs-jsonl"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "world-diffs-jsonl",
  });
  const latencyRows = readJsonl(join(routeRoot, ARTIFACT_FILES["latency-context-trace"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "latency-context-trace",
  });
  const ledger = readJson<unknown>(join(routeRoot, ARTIFACT_FILES["job-proposal-ledger"]), input.diagnostics, {
    routeId: input.routeId,
    gate: "job-proposal-ledger",
  });
  const screenshotMissingCount = validateScreenshots({
    routeId: input.routeId,
    routeRoot,
    diagnostics: input.diagnostics,
  });
  const assertions = readJson<RouteAssertionsArtifact>(join(routeRoot, "route-assertions.json"), input.diagnostics, {
    routeId: input.routeId,
    gate: "route-assertions",
  });
  hardFailures.push(...hardFailuresFromAssertions(assertions, input.routeId));

  for (const turn of turns) {
    if (!isRecord(turn) || turn.terminalEvent !== "done") {
      addDiagnostic(input.diagnostics, {
        severity: "hard",
        routeId: input.routeId,
        gate: "terminal-closeout",
        message: "Route turn lacks terminal done closeout evidence.",
        evidencePaths: [projectPath(join(routeRoot, ARTIFACT_FILES["turns-jsonl"]))],
      });
    }
    if (isRecord(turn) && typeof turn.assistantTextLength === "number" && turn.assistantTextLength === 0) {
      addDiagnostic(input.diagnostics, {
        severity: "hard",
        routeId: input.routeId,
        gate: "empty-assistant-text",
        message: "Route turn records empty assistant text.",
        evidencePaths: [projectPath(join(routeRoot, ARTIFACT_FILES["turns-jsonl"]))],
      });
    }
  }

  for (const row of [...rowsWithHardFailure(latencyRows), ...rowsWithHardFailure(traceRows)]) {
    const status = isRecord(row) && typeof row.status === "string" ? row.status : "hard_failure";
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "trace-hard-failure",
      message: `Trace artifact reports hard failure: ${status}.`,
      evidencePaths: [projectPath(routeRoot)],
    });
  }
  if (isRecord(ledger) && ledger.hardFailure === true) {
    const status = typeof ledger.status === "string" ? ledger.status : "hard_failure";
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "job-proposal-ledger",
      message: `Job/proposal ledger reports hard failure: ${status}.`,
      evidencePaths: [projectPath(join(routeRoot, ARTIFACT_FILES["job-proposal-ledger"]))],
    });
  }
  if (sseRows.length === 0 || turnArtifactRows.length === 0) {
    addDiagnostic(input.diagnostics, {
      severity: "hard",
      routeId: input.routeId,
      gate: "raw-artifact-coverage",
      message: "Route lacks raw SSE or full turn rows; screenshot-only evidence cannot pass.",
      evidencePaths: [projectPath(routeRoot)],
    });
  }

  const routeDiagnostics = input.diagnostics.filter((diagnostic, index) => (
    index >= beforeDiagnosticCount
    && diagnostic.routeId === input.routeId
  ));
  const terminalDoneCount = turns.filter((turn) => isRecord(turn) && turn.terminalEvent === "done").length;
  const missingArtifactCount = routeDiagnostics.filter((diagnostic) => diagnostic.message.startsWith("Missing required")).length + screenshotMissingCount;
  const unreadableArtifactCount = routeDiagnostics.filter((diagnostic) => diagnostic.message.startsWith("Unreadable")).length;
  const diagnosticHardFailures = routeDiagnostics
    .filter((diagnostic) => diagnostic.severity === "hard")
    .map(hardFailureFromDiagnostic);
  hardFailures.push(...diagnosticHardFailures);

  return {
    summary: {
      routeId: input.routeId,
      status: routeDiagnostics.some((diagnostic) => diagnostic.severity === "hard") || hardFailures.length > 0 ? "failed" : "passed",
      cloneCampaignId: input.routeClone?.cloneCampaignId ?? input.routeResult?.cloneCampaignId ?? null,
      sourceCampaignId: input.routeClone?.sourceCampaignId ?? null,
      artifactRoot: routeRoot,
      turnCount: turns.length,
      terminalDoneCount,
      hardFailureCount: hardFailures.length,
      missingArtifactCount,
      unreadableArtifactCount,
    },
    hardFailures,
    turns,
    traceRows,
    latencyRows,
    ledger,
  };
}

function normalizeRouteIds(manifest: Phase94ManifestArtifact | null, routeResults: readonly Phase94RouteResult[]): Phase94RouteId[] {
  const seen = new Set<string>();
  const routeIds: Phase94RouteId[] = [];
  const candidates = [
    ...((manifest?.routes ?? []).map((route) => route.id)),
    ...routeResults.map((result) => result.routeId),
  ];
  for (const candidate of candidates) {
    if (!PHASE94_ROUTE_IDS.includes(candidate as Phase94RouteId)) continue;
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    routeIds.push(candidate as Phase94RouteId);
  }
  return routeIds;
}

function validateHardInvariantArtifact(
  hardInvariantArtifact: unknown,
  diagnostics: Phase94ReportDiagnostic[],
): void {
  if (!isRecord(hardInvariantArtifact)) return;
  const rawInvariants = Array.isArray(hardInvariantArtifact.invariants) ? hardInvariantArtifact.invariants : [];
  const ids = new Set(
    rawInvariants
      .map((item) => (isRecord(item) && typeof item.id === "string" ? item.id : undefined))
      .filter(Boolean) as string[],
  );
  const missing = PHASE94_HARD_INVARIANT_IDS.filter((id) => !ids.has(id));
  if (missing.length > 0) {
    addDiagnostic(diagnostics, {
      severity: "hard",
      gate: "hard-invariants",
      message: `hard-invariants.json is missing invariant ids: ${missing.join(", ")}.`,
      evidencePaths: ["output/playwright/phase-94-focused/*/hard-invariants.json"],
    });
  }
}

function makeSoftNotes(inputRoot: string): Phase94SoftNote[] {
  const packetPath = resolve(inputRoot, "soft-review-packet.md");
  const notesPath = resolve(inputRoot, "soft-review-notes.md");
  if (!existsSync(packetPath) && !existsSync(notesPath)) return [];
  return PHASE94_ROUTE_IDS.map((routeId) => ({
    routeId,
    reviewer: "human",
    verdict: existsSync(notesPath) ? "needs_review" : "needs_review",
    notesPath: projectPath(notesPath),
  }));
}

function metricsFrom(input: {
  routeSummaries: readonly Phase94RouteValidationSummary[];
  hardFailures: readonly Phase94HardFailure[];
  diagnostics: readonly Phase94ReportDiagnostic[];
  routeArtifacts: Array<{
    turns: unknown[];
    traceRows: unknown[];
    latencyRows: unknown[];
    ledger: unknown;
  }>;
}): Phase94LivingWorldMetrics {
  const routeCount = input.routeSummaries.length;
  const passedRoutes = input.routeSummaries.filter((summary) => summary.status === "passed").length;
  const turns = input.routeArtifacts.flatMap((artifact) => artifact.turns);
  const parserLikeFailures = input.hardFailures.filter((failure) => failure.gate === "parser-like-response").length;
  const emptyAssistantText = input.hardFailures.filter((failure) => failure.gate === "empty-assistant-text").length
    + turns.filter((turn) => isRecord(turn) && turn.assistantTextLength === 0).length;
  const hiddenLeaks = input.hardFailures.filter((failure) => failure.gate.includes("hidden") || failure.gate.includes("privacy")).length;
  const staleJobs = input.routeArtifacts.filter((artifact) => (
    isRecord(artifact.ledger)
    && (artifact.ledger.hardFailure === true || Array.isArray(artifact.ledger.staleJobIds))
  )).length;
  const proposalDue = input.routeArtifacts
    .map((artifact) => isRecord(artifact.ledger) && Array.isArray(artifact.ledger.dueProposalIds) ? artifact.ledger.dueProposalIds.length : 0)
    .reduce((total, value) => total + value, 0);
  const proposalTerminal = input.routeArtifacts
    .map((artifact) => isRecord(artifact.ledger) && Array.isArray(artifact.ledger.terminalProposalIds) ? artifact.ledger.terminalProposalIds.length : 0)
    .reduce((total, value) => total + value, 0);
  const proposalCommitted = input.routeArtifacts
    .map((artifact) => isRecord(artifact.ledger) && Array.isArray(artifact.ledger.committedProposalIds) ? artifact.ledger.committedProposalIds.length : 0)
    .reduce((total, value) => total + value, 0);
  const surfaceSignalsRequired = input.routeArtifacts
    .map((artifact) => isRecord(artifact.ledger) && Array.isArray(artifact.ledger.requiredSurfaceSignalIds) ? artifact.ledger.requiredSurfaceSignalIds.length : 0)
    .reduce((total, value) => total + value, 0);
  const surfaceSignalsObserved = input.routeArtifacts
    .map((artifact) => isRecord(artifact.ledger) && Array.isArray(artifact.ledger.surfaceSignalIds) ? artifact.ledger.surfaceSignalIds.length : 0)
    .reduce((total, value) => total + value, 0);
  const contextOverflows = input.routeArtifacts
    .flatMap((artifact) => artifact.latencyRows)
    .filter((row) => isRecord(row) && row.contextBudgetOverflow === true).length;

  return {
    route_completion_ratio: routeCount === 0 ? 0 : passedRoutes / routeCount,
    hard_failure_count: input.hardFailures.length,
    missing_artifact_count: input.routeSummaries
      .map((summary) => summary.missingArtifactCount)
      .reduce((total, value) => total + value, 0),
    oracle_persistence_failures: input.hardFailures.filter((failure) => failure.gate.includes("oracle")).length,
    narrator_repair_without_rollback_count: countRowsByGate(input.routeArtifacts.flatMap((artifact) => artifact.traceRows), "narrator-repair-no-turn-rollback"),
    proposal_terminal_state_ratio: proposalDue === 0 ? null : proposalTerminal / proposalDue,
    proposal_commit_ratio: proposalDue === 0 ? null : proposalCommitted / proposalDue,
    surface_signal_coverage: surfaceSignalsRequired === 0 ? null : surfaceSignalsObserved / surfaceSignalsRequired,
    stale_job_count: staleJobs,
    unnecessary_clarification_rate: turns.length === 0 ? 0 : parserLikeFailures / turns.length,
    parser_like_response_rate: turns.length === 0 ? 0 : parserLikeFailures / turns.length,
    empty_assistant_text_count: emptyAssistantText,
    hidden_truth_leak_count: hiddenLeaks,
    avg_turn_latency_by_stage: {},
    context_budget_overflow_count: contextOverflows,
  };
}

export function validatePhase94ReportArtifacts(options: Phase94ReportValidationOptions): Phase94ReportValidationResult {
  const inputRoot = resolve(options.inputRoot);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const diagnostics: Phase94ReportDiagnostic[] = [];
  const manifest = readJson<Phase94ManifestArtifact>(resolve(inputRoot, "manifest.json"), diagnostics, {
    gate: "manifest",
  });
  const routeResultsArtifact = readJson<RouteResultsArtifact>(resolve(inputRoot, "route-results.json"), diagnostics, {
    gate: "route-results",
  });
  const baselinePool = readJson<Phase94BaselinePoolArtifact>(resolve(inputRoot, "baseline-pool.json"), diagnostics, {
    gate: "baseline-pool",
  });
  const hardInvariantArtifact = readJson<unknown>(resolve(inputRoot, "hard-invariants.json"), diagnostics, {
    gate: "hard-invariants",
  });

  const routeResults = Array.isArray(routeResultsArtifact?.routeResults)
    ? routeResultsArtifact.routeResults
    : [];
  const routeIds = normalizeRouteIds(manifest, routeResults);
  const requireAllRoutes = options.requireAllRoutes ?? manifest?.profile === "focused";

  if (manifest) {
    try {
      assertPhase94ManifestValid(manifest.routes, { requireAllRoutes });
    } catch (error) {
      addDiagnostic(diagnostics, {
        severity: "hard",
        gate: "manifest",
        message: error instanceof Error ? error.message : String(error),
        evidencePaths: [projectPath(resolve(inputRoot, "manifest.json"))],
      });
    }
  }
  if (baselinePool) {
    try {
      assertPhase94BaselinePoolValid(baselinePool, {
        routeIds: requireAllRoutes ? PHASE94_ROUTE_IDS : routeIds,
      });
    } catch (error) {
      addDiagnostic(diagnostics, {
        severity: "hard",
        gate: "baseline-pool",
        message: error instanceof Error ? error.message : String(error),
        evidencePaths: [projectPath(resolve(inputRoot, "baseline-pool.json"))],
      });
    }
  }
  validateHardInvariantArtifact(hardInvariantArtifact, diagnostics);

  if (requireAllRoutes) {
    const missingRoutes = PHASE94_ROUTE_IDS.filter((routeId) => !routeIds.includes(routeId));
    for (const routeId of missingRoutes) {
      addDiagnostic(diagnostics, {
        severity: "hard",
        routeId,
        gate: "route-coverage",
        message: `Full focused matrix is missing route ${routeId}.`,
        evidencePaths: [projectPath(resolve(inputRoot, "manifest.json"))],
      });
    }
  }

  const routeSummaries: Phase94RouteValidationSummary[] = [];
  const hardFailures: Phase94HardFailure[] = [];
  const routeArtifacts: Array<{
    turns: unknown[];
    traceRows: unknown[];
    latencyRows: unknown[];
    ledger: unknown;
  }> = [];
  for (const routeId of requireAllRoutes ? PHASE94_ROUTE_IDS : routeIds) {
    const routeResult = routeResultFor(routeResults, routeId);
    const routeClone = baselinePool?.routeClones.find((clone) => clone.routeId === routeId);
    const validation = validateRoute({
      inputRoot,
      routeId,
      routeResult,
      routeClone,
      diagnostics,
    });
    routeSummaries.push(validation.summary);
    hardFailures.push(...validation.hardFailures);
    routeArtifacts.push({
      turns: validation.turns,
      traceRows: validation.traceRows,
      latencyRows: validation.latencyRows,
      ledger: validation.ledger,
    });
  }

  const globalHardFailures = diagnostics
    .filter((diagnostic) => diagnostic.severity === "hard" && diagnostic.routeId === "global")
    .map(hardFailureFromDiagnostic);
  hardFailures.push(...globalHardFailures);

  const softNotes = makeSoftNotes(inputRoot);
  if (softNotes.length === 0) {
    addDiagnostic(diagnostics, {
      severity: "info",
      gate: "soft-review",
      message: "Soft review packet/notes are not present yet; Phase 94-05 owns prose and playfeel review.",
      evidencePaths: [projectPath(resolve(inputRoot, "soft-review-notes.md"))],
    });
  }

  const metrics = metricsFrom({
    routeSummaries,
    hardFailures,
    diagnostics,
    routeArtifacts,
  });
  const status = diagnostics.some((diagnostic) => diagnostic.severity === "hard") || hardFailures.length > 0
    ? "failed"
    : "passed";

  const report: Phase94AcceptanceReport = {
    phase: 94,
    runId: manifest?.runId ?? baselinePool?.runId ?? "unknown",
    generatedAt,
    inputRoot,
    profile: manifest?.profile ?? baselinePool?.profile ?? "unknown",
    requiredRouteMode: requireAllRoutes ? "full-matrix" : "manifest-subset",
    status,
    routeSummaries,
    routeResults,
    hardFailures,
    softNotes,
    diagnostics,
    metrics,
  };
  const livingWorldAssertions: Phase94LivingWorldAssertionsArtifact = {
    phase: 94,
    runId: report.runId,
    generatedAt,
    status,
    metrics,
    routeSummaries,
    diagnostics,
  };
  return { report, livingWorldAssertions };
}
