import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { simulationProposals } from "../db/schema.js";
import {
  commitAuthorityTrace,
  recordSimulationProposal,
  readWorldClock,
  type AuthoritySourceEntity,
} from "./living-world-authority.js";

export type SimulationProposalWriteScope =
  | `npc:${string}`
  | `faction:${string}`
  | `location:${string}`
  | `world:${string}`
  | `memory:${string}`
  | `event:${string}`
  | `asset:${string}`;

export interface SimulationProposalPayload {
  schemaVersion: 1;
  summary: string;
  readSet: string[];
  writeScopes: SimulationProposalWriteScope[];
  preconditions: string[];
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
  status: "pending" | "committed" | "rejected" | "canceled" | "superseded";
}

export interface CommitSimulationProposalInput {
  campaignId: string;
  proposalId: string;
  blockedWriteScopes?: readonly SimulationProposalWriteScope[];
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
        | "conflicting_write_scope";
      baseWorldVersion?: number;
      currentWorldVersion?: number;
      writeScopes?: SimulationProposalWriteScope[];
    };

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

export function parseSimulationProposalPayload(value: string): SimulationProposalPayload {
  const parsed = parseJsonRecord(value);
  return {
    schemaVersion: 1,
    summary: typeof parsed.summary === "string" ? parsed.summary : "",
    readSet: parseStringArray(parsed.readSet),
    writeScopes: parseStringArray(parsed.writeScopes) as SimulationProposalWriteScope[],
    preconditions: parseStringArray(parsed.preconditions),
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
      return {
        proposalId: existing.id,
        campaignId: existing.campaignId,
        proposalType: existing.proposalType,
        baseWorldVersion: existing.baseWorldVersion,
        writeScopes: existingPayload.writeScopes,
        status: existing.status,
      };
    }
  }

  const payload: SimulationProposalPayload = {
    schemaVersion: 1,
    summary: input.summary,
    readSet: [...(input.readSet ?? [])],
    writeScopes: [...(input.writeScopes ?? [])],
    preconditions: [...(input.preconditions ?? [])],
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
  const row = getDb()
    .select()
    .from(simulationProposals)
    .where(eq(simulationProposals.id, proposalId))
    .get();
  const storedPayload = row
    ? parseSimulationProposalPayload(row.payload)
    : payload;

  return {
    proposalId,
    campaignId: input.campaignId,
    proposalType: row?.proposalType ?? input.proposalType,
    baseWorldVersion: row?.baseWorldVersion ?? input.baseWorldVersion,
    writeScopes: storedPayload.writeScopes,
    status: row?.status ?? "pending",
  };
}

function rejectProposal(
  proposalId: string,
  reason: SimulationProposalRejectionReason,
): void {
  getDb()
    .update(simulationProposals)
    .set({
      status: "rejected",
      rejectionReason: reason,
      updatedAt: now(),
    })
    .where(eq(simulationProposals.id, proposalId))
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
    };
  }

  const clock = readWorldClock(input.campaignId);
  if (clock.worldVersion !== proposal.baseWorldVersion) {
    rejectProposal(input.proposalId, "stale_base_world_version");
    return {
      status: "rejected",
      proposalId: input.proposalId,
      reason: "stale_base_world_version",
      baseWorldVersion: proposal.baseWorldVersion,
      currentWorldVersion: clock.worldVersion,
      writeScopes: payload.writeScopes,
    };
  }

  if (
    payload.expiresAtWorldTimeMinutes !== undefined
    && clock.worldTimeMinutes > payload.expiresAtWorldTimeMinutes
  ) {
    rejectProposal(input.proposalId, "expired");
    return {
      status: "rejected",
      proposalId: input.proposalId,
      reason: "expired",
      baseWorldVersion: proposal.baseWorldVersion,
      currentWorldVersion: clock.worldVersion,
      writeScopes: payload.writeScopes,
    };
  }

  const blockedScopes = new Set(input.blockedWriteScopes ?? []);
  if (payload.writeScopes.some((scope) => blockedScopes.has(scope))) {
    rejectProposal(input.proposalId, "conflicting_write_scope");
    return {
      status: "rejected",
      proposalId: input.proposalId,
      reason: "conflicting_write_scope",
      baseWorldVersion: proposal.baseWorldVersion,
      currentWorldVersion: clock.worldVersion,
      writeScopes: payload.writeScopes,
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
      provenance: payload.provenance,
    },
  });

  const committedWorldVersion = authority.resultWorldVersion ?? proposal.baseWorldVersion + 1;

  db.update(simulationProposals)
    .set({
      status: "committed",
      committedWorldVersion,
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
