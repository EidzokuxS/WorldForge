import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { simulationProposals } from "../db/schema.js";
import {
  commitAuthorityTrace,
  recordSimulationProposal,
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";
import { findConflictingWriteScope, writeScopesConflict } from "./simulation-write-scope.js";

export type SimulationProposalWriteScope =
  | `npc:${string}`
  | `faction:${string}`
  | `location:${string}`
  | `world:${string}`
  | `memory:${string}`
  | `event:${string}`
  | `asset:${string}`;

export type SimulationProposalStatus =
  | "pending"
  | "committed"
  | "rejected"
  | "canceled"
  | "superseded";

export type SimulationProposalDisposition =
  | "pending"
  | "committed"
  | "rejected_invalid"
  | "expired_stale_version"
  | "deferred_not_due"
  | "superseded_by_new_event"
  | "needs_rebase"
  | "needs_actor_retry";

export type SimulationProposalPreflightDisposition =
  | "ready_to_commit"
  | "needs_rebase"
  | "needs_actor_retry"
  | "rejected_invalid"
  | "expired_stale_version"
  | "deferred_not_due"
  | "superseded_by_new_event";

export type SimulationProposalExpiryPolicy =
  | "reject_when_expired"
  | "ignore_expiry";

export interface SimulationProposalIntendedTool {
  name: string;
  args?: Record<string, unknown>;
  reason?: string;
}

export interface SimulationProposalPayload {
  schemaVersion: 1 | 2;
  summary: string;
  readSet: string[];
  writeScopes: SimulationProposalWriteScope[];
  preconditions: string[];
  dueAtWorldTimeMinutes?: number;
  expiryPolicy: SimulationProposalExpiryPolicy;
  priority: number;
  intendedTools: SimulationProposalIntendedTool[];
  sourceJobId?: string | null;
  sourceEntity?: AuthoritySourceEntity;
  provenance: {
    source: string;
    tick?: number;
    route?: string;
    idempotencyKey?: string;
  };
  expiresAtWorldTimeMinutes?: number;
  data: unknown;
}

export interface CreateSimulationProposalInput {
  campaignId: string;
  proposalType: string;
  baseWorldVersion: number;
  sourceEntity: AuthoritySourceEntity;
  jobId?: string | null;
  idempotencyKey?: string | null;
  summary: string;
  readSet?: readonly string[];
  writeScopes?: readonly SimulationProposalWriteScope[];
  preconditions?: readonly string[];
  dueAtWorldTimeMinutes?: number;
  expiryPolicy?: SimulationProposalExpiryPolicy;
  priority?: number;
  intendedTools?: readonly SimulationProposalIntendedTool[];
  provenance: SimulationProposalPayload["provenance"];
  expiresAtWorldTimeMinutes?: number;
  data?: unknown;
  toolResultId?: string | null;
}

export interface CreatedSimulationProposal {
  proposalId: string;
  campaignId: string;
  proposalType: string;
  baseWorldVersion: number;
  writeScopes: SimulationProposalWriteScope[];
  status: SimulationProposalStatus;
  disposition: SimulationProposalDisposition;
  dueAtWorldTimeMinutes?: number;
  priority: number;
}

export interface CommitSimulationProposalInput {
  campaignId: string;
  proposalId: string;
  blockedWriteScopes?: readonly SimulationProposalWriteScope[];
  changedReadSetRefs?: readonly string[];
  supersededByProposalId?: string | null;
  elapsedWorldTimeMinutes?: number;
}

export type CommitSimulationProposalResult =
  | {
      status: "committed";
      proposalId: string;
      baseWorldVersion: number;
      committedWorldVersion: number;
      writeScopes: SimulationProposalWriteScope[];
    }
  | {
      status: "rejected";
      proposalId: string;
      reason:
        | "not_found"
        | "not_pending"
        | "stale_base_world_version"
        | "expired"
        | "conflicting_write_scope"
        | "deferred_not_due"
        | "superseded_by_new_event"
        | "needs_actor_retry"
        | "rejected_invalid";
      baseWorldVersion?: number;
      currentWorldVersion?: number;
      writeScopes?: SimulationProposalWriteScope[];
      disposition?: SimulationProposalDisposition;
    };

export interface SimulationProposalPreflightInput {
  status: SimulationProposalStatus;
  baseWorldVersion: number;
  currentWorldVersion: number;
  currentWorldTimeMinutes: number;
  payload: SimulationProposalPayload;
  blockedWriteScopes?: readonly SimulationProposalWriteScope[];
  changedReadSetRefs?: readonly string[];
  supersededByProposalId?: string | null;
}

export interface SimulationProposalPreflightResult {
  disposition: SimulationProposalPreflightDisposition;
  reason: string;
  baseWorldVersion: number;
  currentWorldVersion: number;
  currentWorldTimeMinutes: number;
  writeScopes: SimulationProposalWriteScope[];
  conflictingWriteScope?: string;
  blockedWriteScope?: string;
  materialReadSetRefs?: string[];
  supersededByProposalId?: string;
}

type SimulationProposalRejectionReason = Extract<
  CommitSimulationProposalResult,
  { status: "rejected" }
>["reason"];

function now(): number {
  return Date.now();
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

function parseExpiryPolicy(value: unknown): SimulationProposalExpiryPolicy {
  return value === "ignore_expiry"
    ? "ignore_expiry"
    : "reject_when_expired";
}

function parseSourceEntity(value: unknown): AuthoritySourceEntity | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.type !== "string") {
    return undefined;
  }
  return {
    type: record.type,
    id: typeof record.id === "string" || record.id === null
      ? record.id
      : undefined,
  };
}

function parseIntendedTools(value: unknown): SimulationProposalIntendedTool[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): SimulationProposalIntendedTool[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }
    const record = item as Record<string, unknown>;
    if (typeof record.name !== "string" || record.name.trim().length === 0) {
      return [];
    }
    return [{
      name: record.name.trim(),
      args: record.args && typeof record.args === "object" && !Array.isArray(record.args)
        ? record.args as Record<string, unknown>
        : undefined,
      reason: typeof record.reason === "string" ? record.reason : undefined,
    }];
  });
}

export function parseSimulationProposalPayload(value: string): SimulationProposalPayload {
  const parsed = parseJsonRecord(value);
  const sourceJobId = typeof parsed.sourceJobId === "string" || parsed.sourceJobId === null
    ? parsed.sourceJobId
    : undefined;
  return {
    schemaVersion: parsed.schemaVersion === 2 ? 2 : 1,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    readSet: parseStringArray(parsed.readSet),
    writeScopes: parseStringArray(parsed.writeScopes) as SimulationProposalWriteScope[],
    preconditions: parseStringArray(parsed.preconditions),
    dueAtWorldTimeMinutes: parseOptionalNumber(parsed.dueAtWorldTimeMinutes),
    expiryPolicy: parseExpiryPolicy(parsed.expiryPolicy),
    priority: parseOptionalNumber(parsed.priority) ?? 0,
    intendedTools: parseIntendedTools(parsed.intendedTools),
    sourceJobId,
    sourceEntity: parseSourceEntity(parsed.sourceEntity),
    provenance:
      parsed.provenance && typeof parsed.provenance === "object" && !Array.isArray(parsed.provenance)
        ? parsed.provenance as SimulationProposalPayload["provenance"]
        : { source: "unknown" },
    expiresAtWorldTimeMinutes:
      typeof parsed.expiresAtWorldTimeMinutes === "number"
        ? parsed.expiresAtWorldTimeMinutes
        : undefined,
    data: parsed.data,
  };
}

function dispositionFromLegacyRow(input: {
  status: SimulationProposalStatus;
  proposalDisposition: SimulationProposalDisposition;
  rejectionReason?: string | null;
}): SimulationProposalDisposition {
  if (input.proposalDisposition !== "pending") {
    return input.proposalDisposition;
  }
  switch (input.status) {
    case "committed":
      return "committed";
    case "superseded":
      return "superseded_by_new_event";
    case "rejected":
      if (input.rejectionReason === "expired") {
        return "expired_stale_version";
      }
      return "rejected_invalid";
    case "canceled":
      return "rejected_invalid";
    case "pending":
      return "pending";
  }
}

function createdProposalFromRow(
  row: typeof simulationProposals.$inferSelect,
  payload: SimulationProposalPayload,
): CreatedSimulationProposal {
  return {
    proposalId: row.id,
    campaignId: row.campaignId,
    proposalType: row.proposalType,
    baseWorldVersion: row.baseWorldVersion,
    writeScopes: payload.writeScopes,
    status: row.status,
    disposition: dispositionFromLegacyRow({
      status: row.status,
      proposalDisposition: row.proposalDisposition,
      rejectionReason: row.rejectionReason,
    }),
    dueAtWorldTimeMinutes: row.dueAtWorldTimeMinutes ?? payload.dueAtWorldTimeMinutes,
    priority: row.priority ?? payload.priority,
  };
}

export function createSimulationProposal(
  input: CreateSimulationProposalInput,
): CreatedSimulationProposal {
  if (input.idempotencyKey) {
    const existing = getDb()
      .select()
      .from(simulationProposals)
      .where(and(
        eq(simulationProposals.campaignId, input.campaignId),
        eq(simulationProposals.idempotencyKey, input.idempotencyKey),
      ))
      .get();
    if (existing) {
      const existingPayload = parseSimulationProposalPayload(existing.payload);
      return createdProposalFromRow(existing, existingPayload);
    }
  }

  const payload: SimulationProposalPayload = {
    schemaVersion: 2,
    summary: input.summary,
    readSet: [...(input.readSet ?? [])],
    writeScopes: [...(input.writeScopes ?? [])],
    preconditions: [...(input.preconditions ?? [])],
    dueAtWorldTimeMinutes: input.dueAtWorldTimeMinutes,
    expiryPolicy: input.expiryPolicy ?? "reject_when_expired",
    priority: input.priority ?? 0,
    intendedTools: [...(input.intendedTools ?? [])],
    sourceJobId: input.jobId ?? null,
    sourceEntity: input.sourceEntity,
    provenance: input.provenance,
    expiresAtWorldTimeMinutes: input.expiresAtWorldTimeMinutes,
    data: input.data ?? {},
  };

  const proposalId = recordSimulationProposal({
    campaignId: input.campaignId,
    proposalType: input.proposalType,
    baseWorldVersion: input.baseWorldVersion,
    sourceEntity: input.sourceEntity,
    jobId: input.jobId ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    payload,
    toolResultId: input.toolResultId ?? null,
  });
  getDb()
    .update(simulationProposals)
    .set({
      proposalDisposition: "pending",
      dispositionReason: null,
      dueAtWorldTimeMinutes: payload.dueAtWorldTimeMinutes ?? null,
      expiryPolicy: payload.expiryPolicy,
      priority: payload.priority,
      intendedTools: JSON.stringify(payload.intendedTools),
      lifecycleMetadata: JSON.stringify({
        readSet: payload.readSet,
        writeScopes: payload.writeScopes,
        preconditions: payload.preconditions,
        sourceJobId: payload.sourceJobId ?? null,
        sourceEntity: payload.sourceEntity ?? null,
      }),
      updatedAt: now(),
    })
    .where(eq(simulationProposals.id, proposalId))
    .run();
  const row = getDb()
    .select()
    .from(simulationProposals)
    .where(eq(simulationProposals.id, proposalId))
    .get();
  const storedPayload = row
    ? parseSimulationProposalPayload(row.payload)
    : payload;

  return row
    ? createdProposalFromRow(row, storedPayload)
    : {
        proposalId,
        campaignId: input.campaignId,
        proposalType: input.proposalType,
        baseWorldVersion: input.baseWorldVersion,
        writeScopes: storedPayload.writeScopes,
        status: "pending",
        disposition: "pending",
        dueAtWorldTimeMinutes: storedPayload.dueAtWorldTimeMinutes,
        priority: storedPayload.priority,
      };
}

function invalidPreconditionReason(preconditions: readonly string[]): string | null {
  for (const precondition of preconditions) {
    const normalized = precondition.trim().toLowerCase();
    if (
      normalized.startsWith("invalid:")
      || normalized.startsWith("reject:")
      || normalized === "rejected_invalid"
    ) {
      return precondition;
    }
  }
  return null;
}

function materialReadSetRefs(input: {
  readSet: readonly string[];
  changedReadSetRefs: readonly string[];
}): string[] {
  const changed = input.changedReadSetRefs
    .map((ref) => ref.trim())
    .filter(Boolean);
  if (changed.length === 0) {
    return [];
  }
  return input.readSet.filter((readRef) =>
    changed.some((changedRef) =>
      readRef === changedRef || writeScopesConflict(readRef, changedRef),
    ),
  );
}

export function classifySimulationProposalPreflight(
  input: SimulationProposalPreflightInput,
): SimulationProposalPreflightResult {
  const base = {
    baseWorldVersion: input.baseWorldVersion,
    currentWorldVersion: input.currentWorldVersion,
    currentWorldTimeMinutes: input.currentWorldTimeMinutes,
    writeScopes: input.payload.writeScopes,
  };

  if (input.status === "superseded" || input.supersededByProposalId) {
    return {
      ...base,
      disposition: "superseded_by_new_event",
      reason: "proposal_superseded_by_new_event",
      supersededByProposalId: input.supersededByProposalId ?? undefined,
    };
  }

  if (input.status !== "pending") {
    return {
      ...base,
      disposition: "rejected_invalid",
      reason: `proposal_not_pending:${input.status}`,
    };
  }

  if (
    input.payload.expiresAtWorldTimeMinutes !== undefined
    && input.payload.expiryPolicy !== "ignore_expiry"
    && input.currentWorldTimeMinutes > input.payload.expiresAtWorldTimeMinutes
  ) {
    return {
      ...base,
      disposition: "expired_stale_version",
      reason: "proposal_expired_before_commit",
    };
  }

  if (
    input.payload.dueAtWorldTimeMinutes !== undefined
    && input.currentWorldTimeMinutes < input.payload.dueAtWorldTimeMinutes
  ) {
    return {
      ...base,
      disposition: "deferred_not_due",
      reason: "proposal_due_time_not_reached",
    };
  }

  const invalidPrecondition = invalidPreconditionReason(input.payload.preconditions);
  if (invalidPrecondition) {
    return {
      ...base,
      disposition: "rejected_invalid",
      reason: invalidPrecondition,
    };
  }

  const conflict = findConflictingWriteScope({
    writeScopes: input.payload.writeScopes,
    blockedWriteScopes: input.blockedWriteScopes ?? [],
  });
  if (conflict) {
    return {
      ...base,
      disposition: "rejected_invalid",
      reason: "conflicting_write_scope",
      conflictingWriteScope: conflict.writeScope,
      blockedWriteScope: conflict.blockedWriteScope,
    };
  }

  if (input.currentWorldVersion !== input.baseWorldVersion) {
    const materialRefs = materialReadSetRefs({
      readSet: input.payload.readSet,
      changedReadSetRefs: input.changedReadSetRefs ?? [],
    });
    if (materialRefs.length > 0) {
      return {
        ...base,
        disposition: "needs_actor_retry",
        reason: "material_read_set_changed",
        materialReadSetRefs: materialRefs,
      };
    }
    return {
      ...base,
      disposition: "needs_rebase",
      reason: "stale_base_world_version_unaffected_read_set",
    };
  }

  return {
    ...base,
    disposition: "ready_to_commit",
    reason: "proposal_ready_to_commit",
  };
}

function legacyReasonFromPreflight(
  preflight: SimulationProposalPreflightResult,
): SimulationProposalRejectionReason {
  switch (preflight.disposition) {
    case "expired_stale_version":
      return "expired";
    case "deferred_not_due":
      return "deferred_not_due";
    case "superseded_by_new_event":
      return "superseded_by_new_event";
    case "needs_actor_retry":
      return "needs_actor_retry";
    case "needs_rebase":
      return "stale_base_world_version";
    case "rejected_invalid":
      return preflight.reason === "conflicting_write_scope"
        ? "conflicting_write_scope"
        : "rejected_invalid";
    case "ready_to_commit":
      return "rejected_invalid";
  }
}

function statusForRejectedPreflight(
  disposition: SimulationProposalDisposition,
): SimulationProposalStatus {
  if (disposition === "deferred_not_due") {
    return "pending";
  }
  if (disposition === "superseded_by_new_event") {
    return "superseded";
  }
  return "rejected";
}

function applyPreflightDisposition(input: {
  proposalId: string;
  preflight: SimulationProposalPreflightResult;
  rejectionReason: SimulationProposalRejectionReason;
}): void {
  const disposition = input.preflight.disposition === "ready_to_commit"
    ? "pending"
    : input.preflight.disposition;
  getDb()
    .update(simulationProposals)
    .set({
      status: statusForRejectedPreflight(disposition),
      rejectionReason: input.rejectionReason,
      proposalDisposition: disposition,
      dispositionReason: input.preflight.reason,
      supersededByProposalId: input.preflight.supersededByProposalId ?? null,
      lifecycleMetadata: JSON.stringify({
        preflight: input.preflight,
      }),
      updatedAt: now(),
    })
    .where(eq(simulationProposals.id, input.proposalId))
    .run();
}

export function commitSimulationProposal(
  input: CommitSimulationProposalInput,
): CommitSimulationProposalResult {
  const db = getDb();
  const proposal = db
    .select()
    .from(simulationProposals)
    .where(
      and(
        eq(simulationProposals.id, input.proposalId),
        eq(simulationProposals.campaignId, input.campaignId),
      ),
    )
    .get();

  if (!proposal) {
    return { status: "rejected", proposalId: input.proposalId, reason: "not_found" };
  }

  const payload = parseSimulationProposalPayload(proposal.payload);
  if (proposal.status !== "pending") {
    return {
      status: "rejected",
      proposalId: input.proposalId,
      reason: "not_pending",
      baseWorldVersion: proposal.baseWorldVersion,
      writeScopes: payload.writeScopes,
      disposition: dispositionFromLegacyRow({
        status: proposal.status,
        proposalDisposition: proposal.proposalDisposition,
        rejectionReason: proposal.rejectionReason,
      }),
    };
  }

  const clock = readWorldClock(input.campaignId);
  const preflight = classifySimulationProposalPreflight({
    status: proposal.status,
    baseWorldVersion: proposal.baseWorldVersion,
    currentWorldVersion: clock.worldVersion,
    currentWorldTimeMinutes: clock.worldTimeMinutes,
    payload,
    blockedWriteScopes: input.blockedWriteScopes,
    changedReadSetRefs: input.changedReadSetRefs,
    supersededByProposalId: input.supersededByProposalId ?? proposal.supersededByProposalId,
  });

  if (preflight.disposition !== "ready_to_commit") {
    const rejectionReason = legacyReasonFromPreflight(preflight);
    applyPreflightDisposition({
      proposalId: input.proposalId,
      preflight,
      rejectionReason,
    });
    return {
      status: "rejected",
      proposalId: input.proposalId,
      reason: rejectionReason,
      baseWorldVersion: proposal.baseWorldVersion,
      currentWorldVersion: clock.worldVersion,
      writeScopes: payload.writeScopes,
      disposition: preflight.disposition,
    };
  }

  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: `proposal:${proposal.proposalType}`,
    baseWorldVersion: proposal.baseWorldVersion,
    sourceEntity: {
      type: proposal.sourceEntityType,
      id: proposal.sourceEntityId,
    },
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes ?? 0,
    stateDeltaRefs: payload.writeScopes,
    metadata: {
      proposalId: input.proposalId,
      proposalType: proposal.proposalType,
      summary: payload.summary,
      readSet: payload.readSet,
      preconditions: payload.preconditions,
      intendedTools: payload.intendedTools,
      proposalPreflight: preflight,
      provenance: payload.provenance,
    },
  });

  const committedWorldVersion = authority.resultWorldVersion ?? proposal.baseWorldVersion + 1;

  db.update(simulationProposals)
    .set({
      status: "committed",
      proposalDisposition: "committed",
      dispositionReason: preflight.reason,
      committedWorldVersion,
      lifecycleMetadata: JSON.stringify({
        preflight,
        authorityToolResultId: authority.toolResultId,
      }),
      updatedAt: now(),
    })
    .where(eq(simulationProposals.id, input.proposalId))
    .run();

  return {
    status: "committed",
    proposalId: input.proposalId,
    baseWorldVersion: proposal.baseWorldVersion,
    committedWorldVersion,
    writeScopes: payload.writeScopes,
  };
}
