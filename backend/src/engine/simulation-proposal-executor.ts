import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
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
} from "./simulation-proposal.js";
import { executeToolCall } from "./tool-executor.js";
import {
  applySuccessfulToolObservationToExecutionContext,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import { attachToolResultAuthority, type ToolResult } from "./tool-result.js";
import {
  runtimeToolInputSchemas,
  type RuntimeToolName,
} from "./tool-schemas.js";

export interface ExecuteDueSimulationProposalInput {
  campaignId: string;
  proposalId: string;
  tick: number;
  phase: "pre_scene_frame" | "pre_narrator_packet" | "watchdog";
  changedReadSetRefs?: readonly string[];
  elapsedWorldTimeMinutes?: number;
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
    };

const EXECUTABLE_RUNTIME_TOOL_NAMES = new Set<RuntimeToolName>([
  "add_tag",
  "remove_tag",
  "set_relationship",
  "add_chronicle_entry",
  "log_event",
  "advance_time",
  "spawn_npc",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "request_contested_outcome",
  "set_condition",
  "move_to",
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "start_search",
  "record_player_intent",
  "transfer_item",
]);

function now(): number {
  return Date.now();
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
  elapsedWorldTimeMinutes?: number;
}): ToolExecutionContext {
  return {
    scope: "background",
    subjectActorId: input.sourceEntity.id ?? undefined,
    subjectActorRefs: new Set<string>(),
    authority: {
      baseWorldVersion: input.baseWorldVersion,
      sourceEntity: input.sourceEntity,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes ?? 1,
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
      return "rejected";
  }
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
  row: ProposalRow;
  disposition: SimulationProposalDisposition;
  reason: string;
  resultWorldVersion?: number | null;
  metadata?: Record<string, unknown>;
}): void {
  getDb()
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
    .where(eq(simulationProposals.id, input.row.id))
    .run();
  updateSourceJob({
    jobId: input.row.jobId,
    disposition: input.disposition,
    reason: input.reason,
    resultWorldVersion: input.resultWorldVersion,
  });
}

function terminalResult(input: {
  row: ProposalRow;
  disposition: SimulationProposalDisposition;
  reason: string;
  metadata?: Record<string, unknown>;
  rebasedFromWorldVersion?: number;
}): ExecuteDueSimulationProposalResult {
  markProposalDisposition({
    row: input.row,
    disposition: input.disposition,
    reason: input.reason,
    metadata: input.metadata,
  });
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
  row: ProposalRow;
  currentWorldVersion: number;
  preflight: SimulationProposalPreflightResult;
}): ProposalRow {
  getDb()
    .update(simulationProposals)
    .set({
      baseWorldVersion: input.currentWorldVersion,
      proposalDisposition: "pending",
      dispositionReason: "rebased_for_unaffected_read_set",
      rejectionReason: null,
      lifecycleMetadata: JSON.stringify({
        rebase: {
          fromWorldVersion: input.row.baseWorldVersion,
          toWorldVersion: input.currentWorldVersion,
          preflight: input.preflight,
        },
      }),
      updatedAt: now(),
    })
    .where(eq(simulationProposals.id, input.row.id))
    .run();
  return loadProposal({
    campaignId: input.row.campaignId,
    proposalId: input.row.id,
  }) ?? {
    ...input.row,
    baseWorldVersion: input.currentWorldVersion,
  };
}

function authorityIdsFromResults(results: readonly ExecutedProposalToolResult[]): string[] {
  return [
    ...new Set(
      results
        .map((entry) => entry.result.authority?.toolResultId)
        .filter((id): id is string => typeof id === "string" && id.length > 0),
    ),
  ];
}

function executeTypedTool(input: {
  campaignId: string;
  tool: Extract<PreparedTool, { kind: "typed" }>;
  tick: number;
  context: ToolExecutionContext;
}): ToolResult {
  const authority = input.context.authority;
  if (!authority) {
    return { success: false, error: "missing_authority_context" };
  }
  return getDb().transaction(() => {
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
    const trace = commitAuthorityTrace({
      campaignId: input.campaignId,
      operation: "proposal:record_location_event",
      baseWorldVersion: authority.baseWorldVersion,
      sourceEntity: authority.sourceEntity,
      elapsedWorldTimeMinutes: authority.elapsedWorldTimeMinutes ?? 1,
      currentTick: input.tick,
      eventIds: [event.id],
      stateDeltaRefs: [`location:${event.locationId}:recent_event`],
      metadata: {
        eventId: event.id,
        source: "simulation_proposal_executor",
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
}

async function executePreparedTools(input: {
  campaignId: string;
  tools: readonly PreparedTool[];
  tick: number;
  sourceEntity: AuthoritySourceEntity;
  baseWorldVersion: number;
  elapsedWorldTimeMinutes?: number;
}): Promise<ExecutedProposalToolResult[] | string> {
  const context = createBackgroundExecutionContext({
    campaignId: input.campaignId,
    baseWorldVersion: input.baseWorldVersion,
    sourceEntity: input.sourceEntity,
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
  });
  const results: ExecutedProposalToolResult[] = [];
  for (const tool of input.tools) {
    const result = tool.kind === "runtime"
      ? await executeToolCall(
          input.campaignId,
          tool.toolName,
          tool.args,
          input.tick,
          undefined,
          context,
        )
      : executeTypedTool({
          campaignId: input.campaignId,
          tool,
          tick: input.tick,
          context,
        });
    results.push({ toolName: tool.toolName, result });
    if (!result.success) {
      return result.error ?? `tool_failed:${tool.toolName}`;
    }
    applySuccessfulToolObservationToExecutionContext({
      toolName: tool.toolName as RuntimeToolName,
      result,
      context,
    });
  }
  return results;
}

export function hasExecutableIntendedTools(input: {
  row: ProposalRow;
  payload?: SimulationProposalPayload;
}): boolean {
  const payload = input.payload ?? parseSimulationProposalPayload(input.row.payload);
  const tools = intendedToolsFromRow(input.row, payload);
  return tools.some((tool) =>
    isExecutableRuntimeToolName(tool.name) || tool.name === "record_location_event",
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

  let payload = parseSimulationProposalPayload(row.payload);
  const clock = readWorldClock(input.campaignId);
  let preflight = classifySimulationProposalPreflight({
    status: row.status,
    baseWorldVersion: row.baseWorldVersion,
    currentWorldVersion: clock.worldVersion,
    currentWorldTimeMinutes: clock.worldTimeMinutes,
    payload,
    changedReadSetRefs: input.changedReadSetRefs,
    supersededByProposalId: row.supersededByProposalId,
  });
  let rebasedFromWorldVersion: number | undefined;

  if (preflight.disposition === "needs_rebase") {
    rebasedFromWorldVersion = row.baseWorldVersion;
    row = rebaseProposal({
      row,
      currentWorldVersion: clock.worldVersion,
      preflight,
    });
    payload = parseSimulationProposalPayload(row.payload);
    preflight = classifySimulationProposalPreflight({
      status: row.status,
      baseWorldVersion: row.baseWorldVersion,
      currentWorldVersion: clock.worldVersion,
      currentWorldTimeMinutes: clock.worldTimeMinutes,
      payload,
      changedReadSetRefs: input.changedReadSetRefs,
      supersededByProposalId: row.supersededByProposalId,
    });
  }

  if (preflight.disposition !== "ready_to_commit") {
    return terminalResult({
      row,
      disposition: dispositionFromPreflight(preflight),
      reason: preflight.reason,
      metadata: { preflight, phase: input.phase },
      rebasedFromWorldVersion,
    });
  }

  const intendedTools = intendedToolsFromRow(row, payload);
  const preparedTools = prepareTools(intendedTools);
  if (typeof preparedTools === "string") {
    return terminalResult({
      row,
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

  const executed = await executePreparedTools({
    campaignId: input.campaignId,
    tools: preparedTools,
    tick: input.tick,
    sourceEntity: sourceEntityFromRow(row),
    baseWorldVersion: row.baseWorldVersion,
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
  });
  if (typeof executed === "string") {
    return terminalResult({
      row,
      disposition: "rejected_invalid",
      reason: executed,
      metadata: {
        preflight,
        intendedTools,
        phase: input.phase,
      },
      rebasedFromWorldVersion,
    });
  }

  const committedWorldVersion = readWorldClock(input.campaignId).worldVersion;
  const authorityTraceIds = authorityIdsFromResults(executed);
  markProposalDisposition({
    row,
    disposition: "committed",
    reason: "intended_tools_executed",
    resultWorldVersion: committedWorldVersion,
    metadata: {
      preflight,
      intendedTools,
      phase: input.phase,
      toolResults: executed.map((entry) => ({
        toolName: entry.toolName,
        success: entry.result.success,
        authority: entry.result.authority,
      })),
      rebasedFromWorldVersion,
    },
  });

  return {
    status: "committed",
    proposalId: row.id,
    proposalType: row.proposalType,
    disposition: "committed",
    committedWorldVersion,
    toolResults: executed,
    authorityTraceIds,
    sourceJobId: row.jobId,
    rebasedFromWorldVersion,
  };
}
