import { and, asc, desc, eq, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { simulationProposals } from "../db/schema.js";
import { readWorldClock } from "./living-world-authority.js";
import {
  executeDueSimulationProposal,
  hasExecutableIntendedTools,
  type ExecuteDueSimulationProposalResult,
} from "./simulation-proposal-executor.js";
import { parseSimulationProposalPayload } from "./simulation-proposal.js";
import type { DueWorldWorkPhase } from "./due-world-work.js";

export interface ResolveDueSimulationProposalsForScopeInput {
  campaignId: string;
  tick: number;
  phase: DueWorldWorkPhase;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  limit?: number;
}

export interface ResolveDueSimulationProposalsForScopeResult {
  selected: string[];
  executed: ExecuteDueSimulationProposalResult[];
  skipped: Array<{ proposalId: string; reason: string }>;
}

function isVisibleScopeRelevant(input: {
  writeScopes: readonly string[];
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
}): boolean {
  const visibleLocationRefs = [
    input.playerLocationId ? `location:${input.playerLocationId}` : null,
    input.playerSceneScopeId ? `location:${input.playerSceneScopeId}` : null,
  ].filter((value): value is string => Boolean(value));
  if (visibleLocationRefs.length === 0) {
    return true;
  }
  return input.writeScopes.some((scope) =>
    scope.startsWith("world:")
    || visibleLocationRefs.some((visibleRef) => scope.startsWith(visibleRef)),
  );
}

export async function resolveDueSimulationProposalsForScope(
  input: ResolveDueSimulationProposalsForScopeInput,
): Promise<ResolveDueSimulationProposalsForScopeResult> {
  const clock = readWorldClock(input.campaignId);
  const rows = getDb()
    .select()
    .from(simulationProposals)
    .where(
      and(
        eq(simulationProposals.campaignId, input.campaignId),
        eq(simulationProposals.status, "pending"),
        lte(simulationProposals.dueAtWorldTimeMinutes, clock.worldTimeMinutes),
      ),
    )
    .orderBy(desc(simulationProposals.priority), asc(simulationProposals.dueAtWorldTimeMinutes))
    .limit(input.limit ?? 8)
    .all();

  const selected: string[] = [];
  const executed: ExecuteDueSimulationProposalResult[] = [];
  const skipped: Array<{ proposalId: string; reason: string }> = [];

  for (const row of rows) {
    const payload = parseSimulationProposalPayload(row.payload);
    if (!isVisibleScopeRelevant({
      writeScopes: payload.writeScopes,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
    })) {
      skipped.push({ proposalId: row.id, reason: "not_visible_scope_relevant" });
      continue;
    }
    if (!hasExecutableIntendedTools({ row, payload })) {
      skipped.push({ proposalId: row.id, reason: "no_executable_intended_tools" });
      continue;
    }
    selected.push(row.id);
    executed.push(await executeDueSimulationProposal({
      campaignId: input.campaignId,
      proposalId: row.id,
      tick: input.tick,
      phase: input.phase,
    }));
  }

  return { selected, executed, skipped };
}
