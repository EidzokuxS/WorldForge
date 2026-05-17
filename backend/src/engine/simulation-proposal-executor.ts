import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { getDb, getSqliteConnection } from "../db/index.js";
import {
  authorityTraces,
  locations,
  simulationJobs,
  simulationProposals,
} from "../db/schema.js";
import {
  commitAuthorityTrace,
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";
import { recordLocationRecentEvent } from "./location-events.js";
import {
  classifySimulationProposalPreflight,
  parseSimulationProposalPayload,
  type SimulationProposalDisposition,
  type SimulationProposalIntendedTool,
  type SimulationProposalPayload,
  type SimulationProposalPreflightResult,
  type SimulationProposalStatus,
  type SimulationProposalWriteScope,
} from "./simulation-proposal.js";
import { executeToolCall } from "./tool-executor.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { attachToolResultAuthority, type ToolResult } from "./tool-result.js";
import {
  isRuntimeToolName,
  isModelToolName,
  modelToolIsSideEffecting,
  runtimeToolHasRole,
} from "./tool-contracts.js";
import {
  runtimeToolInputSchemas,
  type RuntimeToolName,
} from "./tool-schemas.js";
import {
  assertSimulationProposalExecutionStillClaimed,
  type SimulationProposalExecutionMetadata,
  simulationProposalAuthorityTraceToolResultId,
  simulationProposalToolResultId,
} from "./simulation-proposal-execution.js";
import { findUncoveredWriteRef } from "./simulation-write-scope.js";
import {
  applySurfaceSignalDecision,
  proposalRequiresSurfaceSignal,
  readSurfaceSignalDecisionFromData,
  type SurfaceSignalApplyResult,
  type SurfaceSignalDecision,
} from "./surface-signal.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  runScheduledActorDecision,
  type RunScheduledActorDecisionArgs,
} from "./actor-tools.js";
import {
  listKeyActorProcessesByActorIds,
  updateActorProcessAfterDecision,
  KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES,
} from "./key-actor-process.js";
import type { ActorScheduleDecision } from "./actor-scheduler.js";

export interface ExecuteDueSimulationProposalInput {
  campaignId: string;
  proposalId: string;
  tick: number;
  phase: "pre_scene_frame" | "pre_narrator_packet" | "watchdog";
  changedReadSetRefs?: readonly string[];
  blockedWriteScopes?: readonly SimulationProposalWriteScope[];
  elapsedWorldTimeMinutes?: number;
  actorDecisionContext?: {
    provider: ProviderConfig;
    sceneFrame: SceneFrame;
    maxOutputTokens?: number;
    decideActor?: RunScheduledActorDecisionArgs["decideActor"];
  };
}

export interface ExecutedProposalToolResult {
  toolName: string;
  result: ToolResult;
}

export type ExecuteDueSimulationProposalResult =
  | {
      status: "committed";
      proposalId: string;
      proposalType: string;
      disposition: "committed";
      committedWorldVersion: number;
      toolResults: ExecutedProposalToolResult[];
      authorityTraceIds: string[];
      sourceJobId: string | null;
      rebasedFromWorldVersion?: number;
      surfaceSignalFailure?: string;
    }
  | {
      status: "deferred" | "terminal" | "not_found";
      proposalId: string;
      proposalType?: string;
      disposition?: SimulationProposalDisposition;
      reason: string;
      sourceJobId?: string | null;
      rebasedFromWorldVersion?: number;
    };

type ProposalRow = typeof simulationProposals.$inferSelect;
type ClaimedProposalRow = ProposalRow & { status: "executing" };
const EXECUTING_PROPOSAL_STALE_AFTER_MS = 10 * 60_000;
type PreparedTool =
  | {
      kind: "runtime";
      toolName: RuntimeToolName;
      args: Record<string, unknown>;
    }
  | {
      kind: "typed";
      toolName: "record_location_event";
      args: Record<string, unknown>;
    }
  | {
      kind: "actor_decision";
      toolName: "actor_decision";
      args: Record<string, unknown>;
    };
type PreparedToolExecutionOutcome =
  | {
      status: "accepted";
      results: ExecutedProposalToolResult[];
    }
  | {
      status: "failed";
      reason: string;
      results: ExecutedProposalToolResult[];
      sideEffectCommitted: boolean;
    };

const EXECUTABLE_RUNTIME_TOOL_NAMES = new Set<RuntimeToolName>([
  "add_tag",
  "remove_tag",
  "set_relationship",
  "add_chronicle_entry",
  "advance_time",
  "spawn_npc",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "set_condition",
  "move_to",
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "transfer_item",
]);

function now(): number {
  return Date.now();
}

function hasCommittedAuthority(result: ToolResult): boolean {
  return result.success && typeof result.authority?.resultWorldVersion === "number";
}

class PreparedToolBatchRejectedError extends Error {
  constructor(readonly outcome: Extract<PreparedToolExecutionOutcome, { status: "failed" }>) {
    super(outcome.reason);
    this.name = "PreparedToolBatchRejectedError";
  }
}

class ProposalDispositionClaimLostError extends Error {
  readonly campaignId: string;
  readonly proposalId: string;
  readonly fallbackRow: ProposalRow;

  constructor(input: {
    campaignId: string;
    proposalId: string;
    fallbackRow: ProposalRow;
  }) {
    super(`proposal_disposition_claim_lost:${input.proposalId}`);
    this.name = "ProposalDispositionClaimLostError";
    this.campaignId = input.campaignId;
    this.proposalId = input.proposalId;
    this.fallbackRow = input.fallbackRow;
  }
}

function parseJsonArray(value: string): unknown[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function readObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readActorScheduleDecision(value: unknown): ActorScheduleDecision | null {
  const record = readObject(value);
  if (!record) return null;
  if (
    typeof record.actorId !== "string"
    || typeof record.actorName !== "string"
    || typeof record.route !== "string"
    || typeof record.reason !== "string"
    || !Array.isArray(record.signals)
    || !Array.isArray(record.writeScopes)
  ) {
    return null;
  }
  return record as unknown as ActorScheduleDecision;
}

function actorDecisionFromPayload(payload: SimulationProposalPayload): ActorScheduleDecision | null {
  const data = readObject(payload.data);
  return readActorScheduleDecision(data?.schedule);
}

function intendedToolsFromRow(
  row: ProposalRow,
  payload: SimulationProposalPayload,
): SimulationProposalIntendedTool[] {
  if (payload.intendedTools.length > 0) {
    return payload.intendedTools;
  }
  return parseJsonArray(row.intendedTools).flatMap((item): SimulationProposalIntendedTool[] => {
    const record = readObject(item);
    if (!record || typeof record.name !== "string" || !record.name.trim()) {
      return [];
    }
    return [{
      name: record.name.trim(),
      args: readObject(record.args) ?? undefined,
      reason: typeof record.reason === "string" ? record.reason : undefined,
    }];
  });
}

function sourceEntityFromRow(row: ProposalRow): AuthoritySourceEntity {
  return {
    type: row.sourceEntityType,
    id: row.sourceEntityId,
  };
}

function createBackgroundExecutionContext(input: {
  campaignId: string;
  baseWorldVersion: number;
  sourceEntity: AuthoritySourceEntity;
  allowedWriteScopes: readonly SimulationProposalWriteScope[];
  elapsedWorldTimeMinutes?: number;
  proposalExecution?: SimulationProposalExecutionMetadata;
}): ToolExecutionContext {
  return {
    scope: "background",
    subjectActorId: input.sourceEntity.id ?? undefined,
    subjectActorRefs: new Set<string>(),
    authority: {
      baseWorldVersion: input.baseWorldVersion,
      sourceEntity: input.sourceEntity,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes ?? 1,
      toolResultId: input.proposalExecution?.toolResultId,
      allowedWriteScopes: input.allowedWriteScopes,
      metadata: input.proposalExecution ? { ...input.proposalExecution } : undefined,
    },
    currentLocationId: null,
    currentSceneScopeId: null,
    legalLocationRefs: new Set<string>(),
    legalActorRefs: new Set<string>(),
    legalItemRefs: new Set<string>(),
    legalFactionRefs: new Set<string>(),
    currentLocationRefs: new Set<string>(),
    currentSceneRefs: new Set<string>(),
    legalMovementRefs: new Set<string>(),
  };
}

function isExecutableRuntimeToolName(name: string): name is RuntimeToolName {
  return EXECUTABLE_RUNTIME_TOOL_NAMES.has(name as RuntimeToolName);
}

function prepareRuntimeTool(tool: SimulationProposalIntendedTool): PreparedTool | string {
  const args = readObject(tool.args) ?? {};
  if (tool.name === "actor_decision") {
    return {
      kind: "actor_decision",
      toolName: "actor_decision",
      args,
    };
  }
  if (isExecutableRuntimeToolName(tool.name)) {
    const schema = runtimeToolInputSchemas[tool.name];
    const parsed = schema.safeParse(args);
    if (!parsed.success) {
      return `invalid_tool_args:${tool.name}:${parsed.error.issues.map((issue) => issue.message).join("; ")}`;
    }
    return {
      kind: "runtime",
      toolName: tool.name,
      args: parsed.data as Record<string, unknown>,
    };
  }
  if (tool.name === "record_location_event") {
    if (
      typeof args.locationRef !== "string"
      || typeof args.eventType !== "string"
      || typeof args.summary !== "string"
    ) {
      return "invalid_tool_args:record_location_event";
    }
    return {
      kind: "typed",
      toolName: "record_location_event",
      args,
    };
  }
  return `unsupported_intended_tool:${tool.name}`;
}

function prepareTools(tools: readonly SimulationProposalIntendedTool[]): PreparedTool[] | string {
  if (tools.length === 0) {
    return "metadata_only_commit_rejected";
  }
  if (tools.length > 1) {
    return "multi_tool_proposal_rejected_pending_atomic_commit";
  }
  const prepared: PreparedTool[] = [];
  for (const tool of tools) {
    const result = prepareRuntimeTool(tool);
    if (typeof result === "string") {
      return result;
    }
    prepared.push(result);
  }
  return prepared;
}

function prepareSurfaceSignal(
  payload: SimulationProposalPayload,
): SurfaceSignalDecision | null | string {
  try {
    const decision = readSurfaceSignalDecisionFromData(payload.data);
    if (!decision && proposalRequiresSurfaceSignal(payload.data)) {
      return "surface_signal_required_for_meaningful_offscreen_commit";
    }
    return decision;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function proposalStatusForDisposition(
  disposition: SimulationProposalDisposition,
): SimulationProposalStatus {
  switch (disposition) {
    case "committed":
      return "committed";
    case "deferred_not_due":
      return "pending";
    case "superseded_by_new_event":
      return "superseded";
    case "pending":
      return "pending";
    case "rejected_invalid":
    case "expired_stale_version":
    case "needs_rebase":
    case "needs_actor_retry":
    case "execution_abandoned":
      return "rejected";
  }
}

function parseLifecycleMetadata(row: ProposalRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.lifecycleMetadata) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function claimProposalExecution(input: {
  row: ProposalRow;
  phase: ExecuteDueSimulationProposalInput["phase"];
}): ClaimedProposalRow | null {
  const timestamp = now();
  const lifecycleMetadata = JSON.stringify({
    ...parseLifecycleMetadata(input.row),
    execution: {
      token: randomUUID(),
      phase: input.phase,
      claimedAt: timestamp,
      previousStatus: input.row.status,
      previousDisposition: input.row.proposalDisposition,
    },
  });
  const update = getDb()
    .update(simulationProposals)
    .set({
      status: "executing",
      proposalDisposition: "pending",
      dispositionReason: "execution_claimed",
      rejectionReason: null,
      lifecycleMetadata,
      updatedAt: timestamp,
    })
    .where(and(
      eq(simulationProposals.id, input.row.id),
      eq(simulationProposals.status, "pending"),
    ))
    .run();
  if (update.changes !== 1) {
    return null;
  }
  const claimed = loadProposal({
    campaignId: input.row.campaignId,
    proposalId: input.row.id,
  });
  return claimed && claimed.status === "executing"
    ? claimed as ClaimedProposalRow
    : null;
}

function jobStatusForDisposition(
  disposition: SimulationProposalDisposition,
): typeof simulationJobs.$inferSelect.status {
  switch (disposition) {
    case "committed":
      return "completed";
    case "deferred_not_due":
    case "pending":
    case "needs_rebase":
      return "queued";
    case "superseded_by_new_event":
      return "superseded";
    case "rejected_invalid":
    case "expired_stale_version":
    case "needs_actor_retry":
    case "execution_abandoned":
      return "failed";
  }
}

function rejectionReasonForDisposition(
  disposition: SimulationProposalDisposition,
  reason: string,
): string | null {
  switch (disposition) {
    case "pending":
    case "committed":
    case "deferred_not_due":
      return null;
    case "expired_stale_version":
      return "expired";
    case "superseded_by_new_event":
      return "superseded_by_new_event";
    case "needs_rebase":
      return "stale_base_world_version";
    case "needs_actor_retry":
      return "needs_actor_retry";
    case "execution_abandoned":
      return "execution_abandoned";
    case "rejected_invalid":
      return reason || "rejected_invalid";
  }
}

function updateSourceJob(input: {
  jobId: string | null;
  disposition: SimulationProposalDisposition;
  reason: string;
  resultWorldVersion?: number | null;
}): void {
  if (!input.jobId) {
    return;
  }
  getDb()
    .update(simulationJobs)
    .set({
      status: jobStatusForDisposition(input.disposition),
      resultWorldVersion: input.resultWorldVersion ?? null,
      canceledReason:
        input.disposition === "committed" || input.disposition === "deferred_not_due"
          ? null
          : input.reason,
      updatedAt: now(),
    })
    .where(eq(simulationJobs.id, input.jobId))
    .run();
}

function markProposalDisposition(input: {
  row: ClaimedProposalRow;
  disposition: SimulationProposalDisposition;
  reason: string;
  resultWorldVersion?: number | null;
  metadata?: Record<string, unknown>;
}): boolean {
  const update = getDb()
    .update(simulationProposals)
    .set({
      status: proposalStatusForDisposition(input.disposition),
      proposalDisposition: input.disposition,
      dispositionReason: input.reason,
      rejectionReason: rejectionReasonForDisposition(input.disposition, input.reason),
      committedWorldVersion: input.disposition === "committed"
        ? input.resultWorldVersion ?? null
        : input.row.committedWorldVersion,
      lifecycleMetadata: JSON.stringify(input.metadata ?? {}),
      updatedAt: now(),
    })
    .where(and(
      eq(simulationProposals.id, input.row.id),
      eq(simulationProposals.status, "executing"),
      eq(simulationProposals.lifecycleMetadata, input.row.lifecycleMetadata),
    ))
    .run();
  if (update.changes !== 1) {
    return false;
  }
  updateSourceJob({
    jobId: input.row.jobId,
    disposition: input.disposition,
    reason: input.reason,
    resultWorldVersion: input.resultWorldVersion,
  });
  return true;
}

function existingProposalResult(row: ProposalRow): ExecuteDueSimulationProposalResult {
  if (row.status === "executing") {
    return {
      status: "deferred",
      proposalId: row.id,
      proposalType: row.proposalType,
      disposition: "pending",
      reason: "proposal_execution_in_progress",
      sourceJobId: row.jobId,
    };
  }
  const disposition = row.proposalDisposition ?? "rejected_invalid";
  if (row.status === "committed" || disposition === "committed") {
    return {
      status: "committed",
      proposalId: row.id,
      proposalType: row.proposalType,
      disposition: "committed",
      committedWorldVersion: row.committedWorldVersion ?? readWorldClock(row.campaignId).worldVersion,
      toolResults: [],
      authorityTraceIds: [],
      sourceJobId: row.jobId,
    };
  }
  return {
    status: disposition === "deferred_not_due" ? "deferred" : "terminal",
    proposalId: row.id,
    proposalType: row.proposalType,
    disposition,
    reason:
      row.dispositionReason
      ?? row.rejectionReason
      ?? `proposal_not_pending:${row.status}`,
    sourceJobId: row.jobId,
  };
}

function executingClaimedAt(row: ProposalRow): number | null {
  const metadata = parseLifecycleMetadata(row);
  const execution = metadata.execution;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) {
    return null;
  }
  const claimedAt = (execution as Record<string, unknown>).claimedAt;
  return typeof claimedAt === "number" && Number.isFinite(claimedAt) ? claimedAt : null;
}

function executionTokenFromRow(row: ProposalRow): string | null {
  const metadata = parseLifecycleMetadata(row);
  const execution = metadata.execution;
  if (!execution || typeof execution !== "object" || Array.isArray(execution)) {
    return null;
  }
  const token = (execution as Record<string, unknown>).token;
  return typeof token === "string" && token.trim() ? token.trim() : null;
}

function loadAuthorityTraceByToolResultId(input: {
  campaignId: string;
  toolResultId: string;
}): typeof authorityTraces.$inferSelect | null {
  return getDb()
    .select()
    .from(authorityTraces)
    .where(and(
      eq(authorityTraces.campaignId, input.campaignId),
      eq(authorityTraces.toolResultId, input.toolResultId),
    ))
    .get() ?? null;
}

function candidateToolResultIdsForRow(row: ProposalRow): string[] {
  const executionToken = executionTokenFromRow(row);
  if (!executionToken) {
    return [];
  }
  const payload = parseSimulationProposalPayload(row.payload);
  const intendedTools = intendedToolsFromRow(row, payload);
  return intendedTools.length > 0
    ? intendedTools.map((tool) => simulationProposalToolResultId({
        proposalId: row.id,
        executionToken,
        toolName: tool.name,
      }))
    : [simulationProposalAuthorityTraceToolResultId({
        proposalId: row.id,
        executionToken,
      })];
}

function isExecutingClaimStale(row: ProposalRow, nowMs = now()): boolean {
  if (row.status !== "executing") return false;
  const claimedAt = executingClaimedAt(row);
  return claimedAt !== null && nowMs - claimedAt > EXECUTING_PROPOSAL_STALE_AFTER_MS;
}

function recoverCommittedStaleExecutingProposal(row: ProposalRow): ExecuteDueSimulationProposalResult | null {
  const candidateToolResultIds = candidateToolResultIdsForRow(row);
  if (candidateToolResultIds.length === 0) {
    return null;
  }
  const payload = parseSimulationProposalPayload(row.payload);
  const intendedTools = intendedToolsFromRow(row, payload);
  const recoveredTrace = candidateToolResultIds
    .map((toolResultId) => loadAuthorityTraceByToolResultId({
      campaignId: row.campaignId,
      toolResultId,
    }))
    .find((trace): trace is typeof authorityTraces.$inferSelect => trace !== null);
  if (!recoveredTrace) {
    return null;
  }
  const claimedRow = row as ClaimedProposalRow;
  const metadata = {
    ...parseLifecycleMetadata(row),
    recoveredExecution: {
      recoveredAt: now(),
      reason: "stale_execution_authority_trace_found",
      toolResultId: recoveredTrace.toolResultId,
      authorityTraceId: recoveredTrace.id,
      operation: recoveredTrace.operation,
    },
    intendedTools,
  };
  const transitioned = markProposalDisposition({
    row: claimedRow,
    disposition: "committed",
    reason: "stale_execution_recovered_from_authority_trace",
    resultWorldVersion: recoveredTrace.resultWorldVersion,
    metadata,
  });
  if (!transitioned) {
    return existingProposalResult(loadProposal({
      campaignId: row.campaignId,
      proposalId: row.id,
    }) ?? row);
  }
  return {
    status: "committed",
    proposalId: row.id,
    proposalType: row.proposalType,
    disposition: "committed",
    committedWorldVersion: recoveredTrace.resultWorldVersion,
    toolResults: [],
    authorityTraceIds: [recoveredTrace.id],
    sourceJobId: row.jobId,
  };
}

function abandonStaleExecutingProposal(row: ProposalRow): ExecuteDueSimulationProposalResult {
  const recovered = recoverCommittedStaleExecutingProposal(row);
  if (recovered) {
    return recovered;
  }
  const candidateToolResultIds = candidateToolResultIdsForRow(row);
  const timestamp = now();
  const metadata = {
    ...parseLifecycleMetadata(row),
    abandonedExecution: {
      abandonedAt: timestamp,
      reason: "stale_executing_claim",
      staleAfterMs: EXECUTING_PROPOSAL_STALE_AFTER_MS,
    },
  };
  const placeholders = candidateToolResultIds.map(() => "?").join(", ");
  const traceAbsenceClause = candidateToolResultIds.length > 0
    ? `AND NOT EXISTS (
        SELECT 1 FROM authority_traces
        WHERE campaign_id = ?
          AND tool_result_id IN (${placeholders})
      )`
    : "";
  const update = getSqliteConnection()
    .prepare(`
      UPDATE simulation_proposals
      SET status = ?,
          proposal_disposition = ?,
          disposition_reason = ?,
          rejection_reason = ?,
          lifecycle_metadata = ?,
          updated_at = ?
      WHERE id = ?
        AND status = ?
        AND lifecycle_metadata = ?
        ${traceAbsenceClause}
    `)
    .run(
      "rejected",
      "execution_abandoned",
      "stale_executing_claim",
      "execution_abandoned",
      JSON.stringify(metadata),
      timestamp,
      row.id,
      "executing",
      row.lifecycleMetadata,
      ...(candidateToolResultIds.length > 0
        ? [row.campaignId, ...candidateToolResultIds]
        : []),
    );
  if (update.changes === 1) {
    updateSourceJob({
      jobId: row.jobId,
      disposition: "execution_abandoned",
      reason: "stale_executing_claim",
    });
  } else {
    const recoveredAfterRace = recoverCommittedStaleExecutingProposal(loadProposal({
      campaignId: row.campaignId,
      proposalId: row.id,
    }) ?? row);
    if (recoveredAfterRace) {
      return recoveredAfterRace;
    }
  }
  return existingProposalResult(loadProposal({
    campaignId: row.campaignId,
    proposalId: row.id,
  }) ?? row);
}

function terminalResult(input: {
  row: ClaimedProposalRow;
  disposition: SimulationProposalDisposition;
  reason: string;
  metadata?: Record<string, unknown>;
  rebasedFromWorldVersion?: number;
}): ExecuteDueSimulationProposalResult {
  const transitioned = markProposalDisposition({
    row: input.row,
    disposition: input.disposition,
    reason: input.reason,
    metadata: input.metadata,
  });
  if (!transitioned) {
    return existingProposalResult(loadProposal({
      campaignId: input.row.campaignId,
      proposalId: input.row.id,
    }) ?? input.row);
  }
  return {
    status: input.disposition === "deferred_not_due" ? "deferred" : "terminal",
    proposalId: input.row.id,
    proposalType: input.row.proposalType,
    disposition: input.disposition,
    reason: input.reason,
    sourceJobId: input.row.jobId,
    rebasedFromWorldVersion: input.rebasedFromWorldVersion,
  };
}

function dispositionFromPreflight(
  preflight: SimulationProposalPreflightResult,
): SimulationProposalDisposition {
  return preflight.disposition === "ready_to_commit"
    ? "pending"
    : preflight.disposition;
}

function loadProposal(input: {
  campaignId: string;
  proposalId: string;
}): ProposalRow | null {
  return getDb()
    .select()
    .from(simulationProposals)
    .where(
      and(
        eq(simulationProposals.campaignId, input.campaignId),
        eq(simulationProposals.id, input.proposalId),
      ),
    )
    .get() ?? null;
}

function rebaseProposal(input: {
  row: ClaimedProposalRow;
  currentWorldVersion: number;
  preflight: SimulationProposalPreflightResult;
}): ClaimedProposalRow | null {
  const update = getDb()
    .update(simulationProposals)
    .set({
      baseWorldVersion: input.currentWorldVersion,
      proposalDisposition: "pending",
      dispositionReason: "execution_rebased_for_unaffected_read_set",
      rejectionReason: null,
      lifecycleMetadata: JSON.stringify({
        ...parseLifecycleMetadata(input.row),
        rebase: {
          fromWorldVersion: input.row.baseWorldVersion,
          toWorldVersion: input.currentWorldVersion,
          preflight: input.preflight,
        },
      }),
      updatedAt: now(),
    })
    .where(and(
      eq(simulationProposals.id, input.row.id),
      eq(simulationProposals.status, "executing"),
      eq(simulationProposals.lifecycleMetadata, input.row.lifecycleMetadata),
    ))
    .run();
  if (update.changes !== 1) {
    return null;
  }
  const rebased = loadProposal({
    campaignId: input.row.campaignId,
    proposalId: input.row.id,
  });
  return rebased && rebased.status === "executing"
    ? rebased as ClaimedProposalRow
    : null;
}

function authorityIdsFromResults(results: readonly ExecutedProposalToolResult[]): string[] {
  return [
    ...new Set(
      results
        .map((entry) => {
          const authority = entry.result.authority;
          if (!authority?.toolResultId) return null;
          return loadAuthorityTraceByToolResultId({
            campaignId: authority.campaignId,
            toolResultId: authority.toolResultId,
          })?.id ?? null;
        })
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
}

function proposalToolResultsMetadata(results: readonly ExecutedProposalToolResult[]) {
  return results.map((entry) => ({
    toolName: entry.toolName,
    success: entry.result.success,
    authority: entry.result.authority,
  }));
}

function firstRecoveredAuthorityTraceForRow(row: ProposalRow): typeof authorityTraces.$inferSelect | null {
  const candidateToolResultIds = candidateToolResultIdsForRow(row);
  if (candidateToolResultIds.length === 0) {
    return null;
  }
  return candidateToolResultIds
    .map((toolResultId) => loadAuthorityTraceByToolResultId({
      campaignId: row.campaignId,
      toolResultId,
    }))
    .find((trace): trace is typeof authorityTraces.$inferSelect => trace !== null) ?? null;
}

function recoverCommittedProposalFromAuthorityTrace(input: {
  row: ProposalRow;
  reason: string;
  metadata: Record<string, unknown>;
  toolResults?: readonly ExecutedProposalToolResult[];
  authorityTraceIds?: readonly string[];
  rebasedFromWorldVersion?: number;
}): ExecuteDueSimulationProposalResult | null {
  const recoveredTrace = firstRecoveredAuthorityTraceForRow(input.row);
  if (!recoveredTrace) {
    return null;
  }
  const timestamp = now();
  const metadata = {
    ...parseLifecycleMetadata(input.row),
    ...input.metadata,
    recoveredExecution: {
      recoveredAt: timestamp,
      reason: "authority_trace_found",
      toolResultId: recoveredTrace.toolResultId,
      authorityTraceId: recoveredTrace.id,
      operation: recoveredTrace.operation,
    },
  };
  const update = getDb()
    .update(simulationProposals)
    .set({
      status: "committed",
      proposalDisposition: "committed",
      dispositionReason: input.reason,
      rejectionReason: null,
      committedWorldVersion: recoveredTrace.resultWorldVersion,
      lifecycleMetadata: JSON.stringify(metadata),
      updatedAt: timestamp,
    })
    .where(and(
      eq(simulationProposals.campaignId, input.row.campaignId),
      eq(simulationProposals.id, input.row.id),
    ))
    .run();
  if (update.changes !== 1) {
    return existingProposalResult(loadProposal({
      campaignId: input.row.campaignId,
      proposalId: input.row.id,
    }) ?? input.row);
  }
  updateSourceJob({
    jobId: input.row.jobId,
    disposition: "committed",
    reason: input.reason,
    resultWorldVersion: recoveredTrace.resultWorldVersion,
  });
  return {
    status: "committed",
    proposalId: input.row.id,
    proposalType: input.row.proposalType,
    disposition: "committed",
    committedWorldVersion: recoveredTrace.resultWorldVersion,
    toolResults: [...(input.toolResults ?? [])],
    authorityTraceIds: [
      ...new Set([
        ...(input.authorityTraceIds ?? []),
        recoveredTrace.id,
      ]),
    ],
    sourceJobId: input.row.jobId,
    rebasedFromWorldVersion: input.rebasedFromWorldVersion,
  };
}

function isAcceptedProposalRuntimeResult(input: {
  toolName: RuntimeToolName;
  result: ToolResult;
}): boolean {
  if (!input.result.success || input.result.status === "failure") return false;
  if (input.result.contractFailure) return false;
  if (input.result.observationOnly === true || input.result.kind === "observation") {
    return false;
  }
  if (typeof input.result.authority?.resultWorldVersion !== "number") {
    return false;
  }
  if (runtimeToolHasRole(input.toolName, "legacy_scene_beat")) {
    const payload = readObject(input.result.result);
    return payload?.durability === "durable" && payload.persisted === true;
  }
  return runtimeToolHasRole(input.toolName, "state_mutation")
    || runtimeToolHasRole(input.toolName, "time_effect");
}

function isAcceptedProposalToolResult(entry: ExecutedProposalToolResult): boolean {
  if (entry.toolName === "actor_decision") {
    return entry.result.success
      && entry.result.status !== "failure"
      && entry.result.contractFailure == null
      && entry.result.kind !== "observation"
      && entry.result.observationOnly !== true
      && typeof entry.result.authority?.resultWorldVersion === "number"
      && (entry.result.authority?.stateDeltaRefs.length ?? 0) > 0;
  }
  if (entry.toolName === "record_location_event") {
    return entry.result.success
      && entry.result.status !== "failure"
      && entry.result.contractFailure == null
      && entry.result.kind !== "observation"
      && entry.result.observationOnly !== true
      && typeof entry.result.authority?.resultWorldVersion === "number"
      && (entry.result.authority?.stateDeltaRefs.length ?? 0) > 0;
  }
  if (!isRuntimeToolName(entry.toolName)) return false;
  return isAcceptedProposalRuntimeResult({
    toolName: entry.toolName,
    result: entry.result,
  });
}

function assertProposalWriteScopesCover(input: {
  stateDeltaRefs: readonly string[];
  writeScopes: readonly SimulationProposalWriteScope[];
}): void {
  const uncovered = findUncoveredWriteRef({
    stateDeltaRefs: input.stateDeltaRefs,
    allowedWriteScopes: input.writeScopes,
  });
  if (uncovered) {
    throw new Error(`proposal_write_scope_mismatch:${uncovered.stateDeltaRef}`);
  }
}

function scopedProposalStateDeltaRefs(stateDeltaRefs: readonly string[]): string[] {
  return stateDeltaRefs.filter((ref) => /^[a-z-]+:[^:]+/i.test(ref));
}

function proposalToolResultRejectionReason(input: {
  entry: ExecutedProposalToolResult;
  writeScopes: readonly SimulationProposalWriteScope[];
}): string | null {
  if (!isAcceptedProposalToolResult(input.entry)) {
    return `tool_receipt_not_accepted:${input.entry.toolName}`;
  }
  const stateDeltaRefs = scopedProposalStateDeltaRefs(
    input.entry.result.authority?.stateDeltaRefs ?? [],
  );
  if (stateDeltaRefs.length === 0) {
    return `tool_authority_missing_state_delta:${input.entry.toolName}`;
  }
  try {
    assertProposalWriteScopesCover({
      stateDeltaRefs,
      writeScopes: input.writeScopes,
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function resolveLocationEventWriteRef(input: {
  campaignId: string;
  locationRef: unknown;
}): SimulationProposalWriteScope | null {
  const normalizedLocationRef =
    typeof input.locationRef === "string" ? input.locationRef.trim() : "";
  if (!normalizedLocationRef) {
    return null;
  }

  const location = getDb()
    .select({
      id: locations.id,
      kind: locations.kind,
      anchorLocationId: locations.anchorLocationId,
    })
    .from(locations)
    .where(
      sql`${locations.campaignId} = ${input.campaignId} AND (${locations.id} = ${normalizedLocationRef} OR LOWER(${locations.name}) = LOWER(${normalizedLocationRef}))`,
    )
    .get();
  if (!location) {
    return null;
  }

  const targetLocationId =
    location.kind === "ephemeral_scene" && location.anchorLocationId
      ? location.anchorLocationId
      : location.id;
  return `location:${targetLocationId}:recent_event` as SimulationProposalWriteScope;
}

function executeTypedTool(input: {
  campaignId: string;
  tool: Extract<PreparedTool, { kind: "typed" }>;
  payload: SimulationProposalPayload;
  tick: number;
  context: ToolExecutionContext;
}): ToolResult {
  const authority = input.context.authority;
  if (!authority) {
    return { success: false, error: "missing_authority_context" };
  }
  try {
    const plannedWriteRef = resolveLocationEventWriteRef({
      campaignId: input.campaignId,
      locationRef: input.tool.args.locationRef,
    });
    if (!plannedWriteRef) {
      return { success: false, error: "location_event_target_not_found" };
    }
    assertProposalWriteScopesCover({
      stateDeltaRefs: [plannedWriteRef],
      writeScopes: input.payload.writeScopes,
    });
    return getDb().transaction(() => {
      assertSimulationProposalExecutionStillClaimed({
        campaignId: input.campaignId,
        metadata: authority.metadata,
      });
      const event = recordLocationRecentEvent({
        campaignId: input.campaignId,
        locationRef: input.tool.args.locationRef as string,
        tick: input.tick,
        eventType: input.tool.args.eventType as string,
        summary: input.tool.args.summary as string,
        importance:
          typeof input.tool.args.importance === "number"
            ? input.tool.args.importance
            : 3,
      });
      if (!event) {
        return { success: false, error: "location_event_target_not_found" };
      }
      const stateDeltaRefs = [`location:${event.locationId}:recent_event`];
      assertProposalWriteScopesCover({
        stateDeltaRefs,
        writeScopes: input.payload.writeScopes,
      });
      const trace = commitAuthorityTrace({
        campaignId: input.campaignId,
        operation: "proposal:record_location_event",
        baseWorldVersion: authority.baseWorldVersion,
        sourceEntity: authority.sourceEntity,
        elapsedWorldTimeMinutes: authority.elapsedWorldTimeMinutes ?? 1,
        currentTick: input.tick,
        toolResultId: authority.toolResultId,
        eventIds: [event.id],
        stateDeltaRefs,
        metadata: {
          eventId: event.id,
          source: "simulation_proposal_executor",
          ...(authority.metadata ? { proposalExecution: authority.metadata } : {}),
        },
      });
      return attachToolResultAuthority(
        {
          success: true,
          status: "success",
          kind: "mutation",
          result: { eventId: event.id, locationId: event.locationId },
        },
        {
          ...trace,
          eventRefs: [event.id],
          requireStateDelta: true,
        },
      );
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeActorDecisionTool(input: {
  campaignId: string;
  row: ClaimedProposalRow;
  payload: SimulationProposalPayload;
  tick: number;
  phase: ExecuteDueSimulationProposalInput["phase"];
  sourceEntity: AuthoritySourceEntity;
  executionToken: string;
  claimLifecycleMetadata: string;
  elapsedWorldTimeMinutes?: number;
  actorDecisionContext?: ExecuteDueSimulationProposalInput["actorDecisionContext"];
}): Promise<ToolResult> {
  if (!input.actorDecisionContext) {
    return { success: false, error: "actor_decision_requires_scene_frame" };
  }
  const decision = actorDecisionFromPayload(input.payload);
  if (!decision) {
    return { success: false, error: "actor_decision_missing_schedule" };
  }
  const process = listKeyActorProcessesByActorIds({
    campaignId: input.campaignId,
    actorIds: [decision.actorId],
  })[0];
  if (!process) {
    return { success: false, error: "actor_decision_process_not_found" };
  }

  const toolResultId = simulationProposalToolResultId({
    proposalId: input.row.id,
    executionToken: input.executionToken,
    toolName: "actor_decision",
  });
  const proposalExecution: SimulationProposalExecutionMetadata = {
    proposalId: input.row.id,
    executionToken: input.executionToken,
    phase: input.phase,
    toolName: "actor_decision",
    toolResultId,
    claimLifecycleMetadata: input.claimLifecycleMetadata,
  };

  const record = await runScheduledActorDecision({
    campaignId: input.campaignId,
    tick: input.tick,
    provider: input.actorDecisionContext.provider,
    sceneFrame: input.actorDecisionContext.sceneFrame,
    decision,
    process,
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
    maxOutputTokens: input.actorDecisionContext.maxOutputTokens,
    legalTools: [],
    decideActor: input.actorDecisionContext.decideActor,
    commitProcessDecision: ({
      decision: scheduledDecision,
      process: scheduledProcess,
      packet,
      clockBeforeCommit,
      processState,
    }) => getDb().transaction(() => {
      if (clockBeforeCommit.worldVersion !== input.row.baseWorldVersion) {
        throw new Error(
          `actor_decision_stale_frame_world_version:${input.row.baseWorldVersion}->${clockBeforeCommit.worldVersion}`,
        );
      }
      assertSimulationProposalExecutionStillClaimed({
        campaignId: input.campaignId,
        metadata: proposalExecution,
      });
      const stateDeltaRefs = [`npc:${scheduledDecision.actorId}:process`];
      assertProposalWriteScopesCover({
        stateDeltaRefs,
        writeScopes: input.payload.writeScopes,
      });
      const trace = commitAuthorityTrace({
        campaignId: input.campaignId,
        operation: "proposal:actor_decision",
        baseWorldVersion: clockBeforeCommit.worldVersion,
        sourceEntity: input.sourceEntity,
        elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes ?? 0,
        currentTick: input.tick,
        toolResultId,
        stateDeltaRefs,
        metadata: {
          source: "simulation_proposal_executor",
          actorId: scheduledDecision.actorId,
          decisionSummary: packet.decisionSummary,
          noActionReason: packet.noActionReason,
          requestedToolCount: packet.requestedTools.length,
          proposalExecution,
        },
      });
      const processUpdate = updateActorProcessAfterDecision({
        campaignId: input.campaignId,
        actorId: scheduledDecision.actorId,
        expectedBaseWorldVersion: scheduledProcess.lastWorldVersion,
        resultWorldVersion: trace.resultWorldVersion ?? clockBeforeCommit.worldVersion,
        lastWakeWorldTimeMinutes: trace.worldTimeMinutes ?? clockBeforeCommit.worldTimeMinutes,
        nextWakeWorldTimeMinutes:
          (trace.worldTimeMinutes ?? clockBeforeCommit.worldTimeMinutes)
          + (
            packet.nextDecisionTrigger?.delayWorldTimeMinutes
            ?? KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES
          ),
        status: "waiting",
        processState,
      });
      if (processUpdate.status !== "updated") {
        throw new Error(
          `Actor process update failed for ${scheduledDecision.actorId}: ${processUpdate.status}`,
        );
      }
      return {
        status: processUpdate.status,
        authority: trace,
      };
    }),
  }).catch((error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
  }));
  if ("error" in record) {
    return { success: false, status: "failure", error: record.error };
  }
  if (!record.authority) {
    return { success: false, error: "actor_decision_missing_authority_trace" };
  }

  return attachToolResultAuthority(
    {
      success: true,
      status: "success",
      kind: "mutation",
      result: {
        actorId: decision.actorId,
        decisionSummary: record.packet.decisionSummary,
        noActionReason: record.packet.noActionReason,
        processUpdateStatus: record.processUpdateStatus,
        requestedToolCount: record.packet.requestedTools.length,
      },
    },
    {
      ...record.authority,
      requireStateDelta: true,
    },
  );
}

async function executePreparedTools(input: {
  campaignId: string;
  proposalId: string;
  row: ClaimedProposalRow;
  payload: SimulationProposalPayload;
  executionToken: string;
  claimLifecycleMetadata: string;
  phase: ExecuteDueSimulationProposalInput["phase"];
  tools: readonly PreparedTool[];
  tick: number;
  sourceEntity: AuthoritySourceEntity;
  baseWorldVersion: number;
  elapsedWorldTimeMinutes?: number;
  actorDecisionContext?: ExecuteDueSimulationProposalInput["actorDecisionContext"];
}): Promise<PreparedToolExecutionOutcome> {
  const results: ExecutedProposalToolResult[] = [];
  for (const tool of input.tools) {
    if (!isModelToolName(tool.toolName) || !modelToolIsSideEffecting(tool.toolName)) {
      return {
        status: "failed",
        reason: `side_effect_contract_missing:${tool.toolName}`,
        results,
        sideEffectCommitted: false,
      };
    }
    const toolResultId = simulationProposalToolResultId({
      proposalId: input.proposalId,
      executionToken: input.executionToken,
      toolName: tool.toolName,
    });
    const context = createBackgroundExecutionContext({
      campaignId: input.campaignId,
      baseWorldVersion: input.baseWorldVersion,
      sourceEntity: input.sourceEntity,
      allowedWriteScopes: input.payload.writeScopes,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
      proposalExecution: {
        proposalId: input.proposalId,
        executionToken: input.executionToken,
        phase: input.phase,
        toolName: tool.toolName,
        toolResultId,
        claimLifecycleMetadata: input.claimLifecycleMetadata,
      },
    });
    const result = tool.kind === "runtime"
      ? await executeToolCall(
          input.campaignId,
          tool.toolName,
          tool.args,
          input.tick,
          undefined,
          context,
        )
      : tool.kind === "typed"
        ? executeTypedTool({
          campaignId: input.campaignId,
          tool,
          payload: input.payload,
          tick: input.tick,
          context,
        })
        : await executeActorDecisionTool({
          campaignId: input.campaignId,
          row: input.row,
          payload: input.payload,
          tick: input.tick,
          phase: input.phase,
          sourceEntity: input.sourceEntity,
          executionToken: input.executionToken,
          claimLifecycleMetadata: input.claimLifecycleMetadata,
          elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
          actorDecisionContext: input.actorDecisionContext,
        });
    const entry = { toolName: tool.toolName, result };
    results.push(entry);
    if (!result.success) {
      return {
        status: "failed",
        reason: result.error ?? `tool_failed:${tool.toolName}`,
        results,
        sideEffectCommitted: results.some((entry) => hasCommittedAuthority(entry.result)),
      };
    }
    const rejectionReason = proposalToolResultRejectionReason({
      entry,
      writeScopes: input.payload.writeScopes,
    });
    if (rejectionReason) {
      return {
        status: "failed",
        reason: rejectionReason,
        results,
        sideEffectCommitted: results.some((entry) => hasCommittedAuthority(entry.result)),
      };
    }
    if (isRuntimeToolName(tool.toolName)) {
      applySuccessfulToolObservationToExecutionContext({
        toolName: tool.toolName,
        result,
        context,
      });
    }
  }
  return { status: "accepted", results };
}

export function hasExecutableIntendedTools(input: {
  row: ProposalRow;
  payload?: SimulationProposalPayload;
  actorDecisionAvailable?: boolean;
}): boolean {
  const payload = input.payload ?? parseSimulationProposalPayload(input.row.payload);
  const tools = intendedToolsFromRow(input.row, payload);
  return tools.some((tool) =>
    isExecutableRuntimeToolName(tool.name)
    || tool.name === "record_location_event"
    || (tool.name === "actor_decision" && input.actorDecisionAvailable === true),
  );
}

export async function executeDueSimulationProposal(
  input: ExecuteDueSimulationProposalInput,
): Promise<ExecuteDueSimulationProposalResult> {
  let row = loadProposal(input);
  if (!row) {
    return {
      status: "not_found",
      proposalId: input.proposalId,
      reason: "proposal_not_found",
    };
  }
  if (row.status === "executing" && isExecutingClaimStale(row)) {
    return abandonStaleExecutingProposal(row);
  }
  if (row.status !== "pending") {
    return existingProposalResult(row);
  }

  let claimedRow = claimProposalExecution({
    row,
    phase: input.phase,
  });
  if (!claimedRow) {
    return existingProposalResult(loadProposal({
      campaignId: input.campaignId,
      proposalId: input.proposalId,
    }) ?? row);
  }

  let payload = parseSimulationProposalPayload(claimedRow.payload);
  const clock = readWorldClock(input.campaignId);
  if (clock.worldVersion !== claimedRow.baseWorldVersion && input.changedReadSetRefs === undefined) {
    return terminalResult({
      row: claimedRow,
      disposition: "needs_actor_retry",
      reason: "stale_base_world_version_unverified_read_set",
      metadata: {
        phase: input.phase,
        baseWorldVersion: claimedRow.baseWorldVersion,
        currentWorldVersion: clock.worldVersion,
      },
    });
  }
  let preflight = classifySimulationProposalPreflight({
    status: "pending",
    baseWorldVersion: claimedRow.baseWorldVersion,
    currentWorldVersion: clock.worldVersion,
    currentWorldTimeMinutes: clock.worldTimeMinutes,
    payload,
    changedReadSetRefs: input.changedReadSetRefs,
    blockedWriteScopes: input.blockedWriteScopes,
    supersededByProposalId: claimedRow.supersededByProposalId,
  });
  let rebasedFromWorldVersion: number | undefined;

  if (preflight.disposition === "needs_rebase") {
    rebasedFromWorldVersion = claimedRow.baseWorldVersion;
    const rebased = rebaseProposal({
      row: claimedRow,
      currentWorldVersion: clock.worldVersion,
      preflight,
    });
    if (!rebased) {
      return existingProposalResult(loadProposal({
        campaignId: input.campaignId,
        proposalId: input.proposalId,
      }) ?? claimedRow);
    }
    claimedRow = rebased;
    payload = parseSimulationProposalPayload(claimedRow.payload);
    preflight = classifySimulationProposalPreflight({
      status: "pending",
      baseWorldVersion: claimedRow.baseWorldVersion,
      currentWorldVersion: clock.worldVersion,
      currentWorldTimeMinutes: clock.worldTimeMinutes,
      payload,
      changedReadSetRefs: input.changedReadSetRefs,
      blockedWriteScopes: input.blockedWriteScopes,
      supersededByProposalId: claimedRow.supersededByProposalId,
    });
  }

  if (preflight.disposition !== "ready_to_commit") {
    return terminalResult({
      row: claimedRow,
      disposition: dispositionFromPreflight(preflight),
      reason: preflight.reason,
      metadata: { preflight, phase: input.phase },
      rebasedFromWorldVersion,
    });
  }

  const intendedTools = intendedToolsFromRow(claimedRow, payload);
  const preparedTools = prepareTools(intendedTools);
  if (typeof preparedTools === "string") {
    return terminalResult({
      row: claimedRow,
      disposition: "rejected_invalid",
      reason: preparedTools,
      metadata: {
        preflight,
        intendedTools,
        phase: input.phase,
      },
      rebasedFromWorldVersion,
    });
  }
  const surfaceSignalDecision = prepareSurfaceSignal(payload);
  if (typeof surfaceSignalDecision === "string") {
    return terminalResult({
      row: claimedRow,
      disposition: "rejected_invalid",
      reason: surfaceSignalDecision,
      metadata: {
        preflight,
        intendedTools,
        phase: input.phase,
      },
      rebasedFromWorldVersion,
    });
  }

  const executionToken = executionTokenFromRow(claimedRow);
  if (!executionToken) {
    return terminalResult({
      row: claimedRow,
      disposition: "execution_abandoned",
      reason: "missing_execution_token",
      metadata: {
        preflight,
        intendedTools,
        phase: input.phase,
      },
      rebasedFromWorldVersion,
    });
  }
  const baseCommitMetadata = {
    preflight,
    intendedTools,
    phase: input.phase,
    rebasedFromWorldVersion,
  };
  try {
    const executed = await executePreparedTools({
      campaignId: input.campaignId,
      proposalId: claimedRow.id,
      row: claimedRow,
      payload,
      executionToken,
      claimLifecycleMetadata: claimedRow.lifecycleMetadata,
      phase: input.phase,
      tools: preparedTools,
      tick: input.tick,
      sourceEntity: sourceEntityFromRow(claimedRow),
      baseWorldVersion: claimedRow.baseWorldVersion,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
      actorDecisionContext: input.actorDecisionContext,
    });
    if (executed.status === "failed") {
      throw new PreparedToolBatchRejectedError(executed);
    }
    const executedResults = executed.results;

    const authorityTraceIds = authorityIdsFromResults(executedResults);
    let surfaceSignal: SurfaceSignalApplyResult | null = null;
    let surfaceSignalFailure: string | undefined;
    if (surfaceSignalDecision) {
      try {
        surfaceSignal = applySurfaceSignalDecision({
          campaignId: input.campaignId,
          proposalId: claimedRow.id,
          tick: input.tick,
          decision: surfaceSignalDecision,
          authorityTraceIds,
        });
      } catch (error) {
        surfaceSignalFailure = error instanceof Error ? error.message : String(error);
      }
    }
    const finalWorldVersion = readWorldClock(input.campaignId).worldVersion;
    const commitMetadata = {
      ...baseCommitMetadata,
      surfaceSignal,
      ...(surfaceSignalFailure ? { surfaceSignalFailure } : {}),
      toolResults: proposalToolResultsMetadata(executedResults),
    };
    const transitioned = markProposalDisposition({
      row: claimedRow,
      disposition: "committed",
      reason: "intended_tools_executed",
      resultWorldVersion: finalWorldVersion,
      metadata: commitMetadata,
    });
    if (!transitioned) {
      const recovered = recoverCommittedProposalFromAuthorityTrace({
        row: loadProposal({
          campaignId: claimedRow.campaignId,
          proposalId: claimedRow.id,
        }) ?? claimedRow,
        reason: "authority_committed_after_disposition_claim_lost",
        metadata: {
          ...commitMetadata,
          dispositionClaimLost: true,
        },
        toolResults: executedResults,
        authorityTraceIds,
        rebasedFromWorldVersion,
      });
      if (recovered) {
        return {
          ...recovered,
          ...(surfaceSignalFailure ? { surfaceSignalFailure } : {}),
        };
      }
      throw new ProposalDispositionClaimLostError({
        campaignId: claimedRow.campaignId,
        proposalId: claimedRow.id,
        fallbackRow: claimedRow,
      });
    }

    return {
      status: "committed" as const,
      proposalId: claimedRow.id,
      proposalType: claimedRow.proposalType,
      disposition: "committed" as const,
      committedWorldVersion: finalWorldVersion,
      toolResults: executedResults,
      authorityTraceIds,
      sourceJobId: claimedRow.jobId,
      rebasedFromWorldVersion,
      ...(surfaceSignalFailure ? { surfaceSignalFailure } : {}),
    };
  } catch (error) {
    if (error instanceof ProposalDispositionClaimLostError) {
      const currentRow = loadProposal({
        campaignId: error.campaignId,
        proposalId: error.proposalId,
      }) ?? error.fallbackRow;
      return recoverCommittedProposalFromAuthorityTrace({
        row: currentRow,
        reason: "authority_committed_after_disposition_claim_lost",
        metadata: {
          ...baseCommitMetadata,
          dispositionClaimLost: true,
        },
        rebasedFromWorldVersion,
      }) ?? existingProposalResult(currentRow);
    }
    if (!(error instanceof PreparedToolBatchRejectedError)) {
      throw error;
    }
    const executed = error.outcome;
    if (executed.sideEffectCommitted) {
      const currentRow = loadProposal({
        campaignId: claimedRow.campaignId,
        proposalId: claimedRow.id,
      }) ?? claimedRow;
      const recovered = recoverCommittedProposalFromAuthorityTrace({
        row: currentRow,
        reason: "authority_committed_before_late_rejection",
        metadata: {
          ...baseCommitMetadata,
          lateRejection: executed.reason,
          toolResults: proposalToolResultsMetadata(executed.results),
        },
        toolResults: executed.results,
        authorityTraceIds: authorityIdsFromResults(executed.results),
        rebasedFromWorldVersion,
      });
      if (recovered) {
        return recovered;
      }
    }
    return terminalResult({
      row: claimedRow,
      disposition: "rejected_invalid",
      reason: executed.reason,
      metadata: {
        ...baseCommitMetadata,
        toolResults: proposalToolResultsMetadata(executed.results),
      },
      rebasedFromWorldVersion,
    });
  }
}
