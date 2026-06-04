import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { simulationProposals } from "../db/schema.js";

export interface SimulationProposalExecutionMetadata {
  proposalId: string;
  executionToken: string;
  phase: string;
  toolName: string;
  toolResultId: string;
  claimLifecycleMetadata: string;
}

export function simulationProposalToolResultId(input: {
  proposalId: string;
  executionToken: string;
  toolName: string;
}): string {
  return `proposal:${input.proposalId}:${input.executionToken}:tool:${input.toolName}`;
}

export function simulationProposalAuthorityTraceToolResultId(input: {
  proposalId: string;
  executionToken: string;
}): string {
  return `proposal:${input.proposalId}:${input.executionToken}:authority_trace`;
}

function readExecutionMetadata(value: unknown): SimulationProposalExecutionMetadata | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const proposalId = record.proposalId;
  const executionToken = record.executionToken;
  const phase = record.phase;
  const toolName = record.toolName;
  const toolResultId = record.toolResultId;
  const claimLifecycleMetadata = record.claimLifecycleMetadata;
  if (
    typeof proposalId !== "string"
    || typeof executionToken !== "string"
    || typeof phase !== "string"
    || typeof toolName !== "string"
    || typeof toolResultId !== "string"
    || typeof claimLifecycleMetadata !== "string"
  ) {
    return null;
  }
  return {
    proposalId,
    executionToken,
    phase,
    toolName,
    toolResultId,
    claimLifecycleMetadata,
  };
}

export function assertSimulationProposalExecutionStillClaimed(input: {
  campaignId: string;
  metadata: unknown;
}): void {
  const metadata = readExecutionMetadata(input.metadata);
  if (!metadata) {
    return;
  }
  const row = getDb()
    .select({ id: simulationProposals.id })
    .from(simulationProposals)
    .where(and(
      eq(simulationProposals.campaignId, input.campaignId),
      eq(simulationProposals.id, metadata.proposalId),
      eq(simulationProposals.status, "executing"),
      eq(simulationProposals.lifecycleMetadata, metadata.claimLifecycleMetadata),
    ))
    .get();
  if (!row) {
    throw new Error(
      `Proposal execution fence failed for ${metadata.proposalId}; execution token is no longer current.`,
    );
  }
}
