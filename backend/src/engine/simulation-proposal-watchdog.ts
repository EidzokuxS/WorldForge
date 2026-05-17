import { and, asc, desc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { authorityTraces, simulationProposals } from "../db/schema.js";
import { readWorldClock } from "./living-world-authority.js";
import {
  executeDueSimulationProposal,
  hasExecutableIntendedTools,
  type ExecuteDueSimulationProposalResult,
} from "./simulation-proposal-executor.js";
import {
  parseSimulationProposalPayload,
  type SimulationProposalWriteScope,
} from "./simulation-proposal.js";
import { findConflictingWriteScope } from "./simulation-write-scope.js";
import type { DueWorldWorkPhase } from "./due-world-work.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import type { SceneFrame } from "./scene-frame.js";
import type { RunScheduledActorDecisionArgs } from "./actor-tools.js";

export interface ResolveDueSimulationProposalsForScopeInput {
  campaignId: string;
  tick: number;
  phase: DueWorldWorkPhase;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  limit?: number;
  blockedWriteScopes?: readonly SimulationProposalWriteScope[];
  actorDecisionContext?: {
    provider: ProviderConfig;
    sceneFrame: SceneFrame;
    maxOutputTokens?: number;
    decideActor?: RunScheduledActorDecisionArgs["decideActor"];
  };
}

export interface ResolveDueSimulationProposalsForScopeResult {
  selected: string[];
  executed: ExecuteDueSimulationProposalResult[];
  skipped: Array<{ proposalId: string; reason: string }>;
  blockedWriteScopes: SimulationProposalWriteScope[];
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

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function changedStateRefsSince(input: {
  campaignId: string;
  baseWorldVersion: number;
}): string[] {
  const rows = getDb()
    .select({ stateDeltaRefs: authorityTraces.stateDeltaRefs })
    .from(authorityTraces)
    .where(
      and(
        eq(authorityTraces.campaignId, input.campaignId),
        gt(authorityTraces.resultWorldVersion, input.baseWorldVersion),
      ),
    )
    .all();
  return [...new Set(rows.flatMap((row) => parseStringArray(row.stateDeltaRefs)))];
}

function requiresActorDecisionContext(
  payload: ReturnType<typeof parseSimulationProposalPayload>,
): boolean {
  return payload.intendedTools.some((tool) => tool.name === "actor_decision");
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
        inArray(simulationProposals.status, ["pending", "executing"]),
        or(
          isNull(simulationProposals.dueAtWorldTimeMinutes),
          lte(simulationProposals.dueAtWorldTimeMinutes, clock.worldTimeMinutes),
        ),
      ),
    )
    .orderBy(desc(simulationProposals.priority), asc(simulationProposals.dueAtWorldTimeMinutes))
    .all();
  const executableLimit = input.limit ?? 8;

  const selected: string[] = [];
  const executed: ExecuteDueSimulationProposalResult[] = [];
  const skipped: Array<{ proposalId: string; reason: string }> = [];
  const blockedWriteScopes: SimulationProposalWriteScope[] = [
    ...(input.blockedWriteScopes ?? []),
  ];
  let executableSelectedCount = 0;

  for (const row of rows) {
    const payload = parseSimulationProposalPayload(row.payload);
    if (
      row.status !== "executing"
      && !hasExecutableIntendedTools({
        row,
        payload,
        actorDecisionAvailable: input.actorDecisionContext != null,
      })
    ) {
      if (requiresActorDecisionContext(payload)) {
        skipped.push({
          proposalId: row.id,
          reason: "actor_decision_requires_scene_frame",
        });
        continue;
      }
      selected.push(row.id);
      executed.push(await executeDueSimulationProposal({
        campaignId: input.campaignId,
        proposalId: row.id,
        tick: input.tick,
        phase: input.phase,
        actorDecisionContext: input.actorDecisionContext,
        blockedWriteScopes,
        changedReadSetRefs: changedStateRefsSince({
          campaignId: input.campaignId,
          baseWorldVersion: row.baseWorldVersion,
        }),
      }));
      continue;
    }
    if (executableSelectedCount >= executableLimit) {
      break;
    }
    if (!isVisibleScopeRelevant({
      writeScopes: payload.writeScopes,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
    })) {
      skipped.push({ proposalId: row.id, reason: "not_visible_scope_relevant" });
      continue;
    }
    const conflict = findConflictingWriteScope({
      writeScopes: payload.writeScopes,
      blockedWriteScopes,
    });
    const changedReadSetRefs = changedStateRefsSince({
      campaignId: input.campaignId,
      baseWorldVersion: row.baseWorldVersion,
    });
    selected.push(row.id);
    const result = await executeDueSimulationProposal({
      campaignId: input.campaignId,
      proposalId: row.id,
      tick: input.tick,
      phase: input.phase,
      actorDecisionContext: input.actorDecisionContext,
      blockedWriteScopes,
      changedReadSetRefs,
    });
    executed.push(result);
    executableSelectedCount += 1;
    if (result.status === "committed" && !conflict) {
      blockedWriteScopes.push(...payload.writeScopes);
    }
  }

  return { selected, executed, skipped, blockedWriteScopes };
}
