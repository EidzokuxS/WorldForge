import {
  scheduleKeyActorProcessesForTurn,
  type ActorScheduleDecision,
} from "./actor-scheduler.js";
import {
  listKeyActorProcessesByActorIds,
  type KeyActorProcess,
} from "./key-actor-process.js";
import {
  executeActorPlanStep,
  type ExecuteActorPlanStepResult,
} from "./actor-plan-executor.js";
import {
  createSimulationProposal,
  findActiveActorDecisionProposal,
  type CreatedSimulationProposal,
  type SimulationProposalWriteScope,
} from "./simulation-proposal.js";
import { readWorldClock } from "./living-world-authority.js";
import {
  resolveDueWorldThreadWorkForScope,
  type ResolveDueWorldThreadWorkForScopeResult,
} from "./world-thread-runner.js";
import {
  resolveDueSimulationProposalsForScope,
  type ResolveDueSimulationProposalsForScopeResult,
} from "./simulation-proposal-watchdog.js";
import {
  findConflictingWriteScope,
  type SimulationActorWriteScope,
} from "./simulation-write-scope.js";
import { consumeActorWakeSignals } from "./actor-wake-signals.js";
import {
  planParallelSimulationGroups,
  type ParallelSimulationRunTrace,
} from "./parallel-simulation-runner.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import type { SceneFrame } from "./scene-frame.js";
import type { RunScheduledActorDecisionArgs } from "./actor-tools.js";

export type DueWorldWorkPhase = "pre_scene_frame" | "pre_narrator_packet";

export interface ResolveDueWorldWorkForScopeInput {
  campaignId: string;
  tick: number;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  elapsedWorldTimeMinutes?: number;
  phase: DueWorldWorkPhase;
  blockedWriteScopes?: readonly SimulationActorWriteScope[];
  actorDecisionContext?: {
    provider: ProviderConfig;
    sceneFrame: SceneFrame;
    maxOutputTokens?: number;
    decideActor?: RunScheduledActorDecisionArgs["decideActor"];
  };
}

export interface DeferredActorWork {
  decision: ActorScheduleDecision;
  proposal: CreatedSimulationProposal;
}

export interface ResolveDueWorldWorkForScopeResult {
  phase: DueWorldWorkPhase;
  executed: ExecuteActorPlanStepResult[];
  deferred: DeferredActorWork[];
  skipped: ActorScheduleDecision[];
  worldThreads: ResolveDueWorldThreadWorkForScopeResult;
  proposalPrepTrace: ParallelSimulationRunTrace[];
}

export interface ResolveDueWorldWorkWithProposalWatchdogResult
  extends ResolveDueWorldWorkForScopeResult {
  proposals: ResolveDueSimulationProposalsForScopeResult;
}

function mergeProposalResults(
  first: ResolveDueSimulationProposalsForScopeResult,
  second: ResolveDueSimulationProposalsForScopeResult,
): ResolveDueSimulationProposalsForScopeResult {
  const selected = [...new Set([...first.selected, ...second.selected])];
  const executedByProposalId = new Map(
    first.executed.map((entry) => [entry.proposalId, entry]),
  );
  for (const entry of second.executed) {
    executedByProposalId.set(entry.proposalId, entry);
  }
  const skippedByKey = new Map(
    first.skipped.map((entry) => [`${entry.proposalId}:${entry.reason}`, entry]),
  );
  for (const entry of second.skipped) {
    skippedByKey.set(`${entry.proposalId}:${entry.reason}`, entry);
  }
  return {
    selected,
    executed: [...executedByProposalId.values()],
    skipped: [...skippedByKey.values()],
    blockedWriteScopes: [...new Set([
      ...first.blockedWriteScopes,
      ...second.blockedWriteScopes,
    ])],
  };
}

function dueWorkBlockedWriteScopes(
  result: ResolveDueWorldWorkForScopeResult,
): SimulationActorWriteScope[] {
  return [...new Set([
    ...result.executed.flatMap((entry) => entry.stateDeltaRefs),
    ...result.worldThreads.executed.flatMap((entry) => entry.authority.stateDeltaRefs),
  ])];
}

function processByActorId(processes: readonly KeyActorProcess[]): Map<string, KeyActorProcess> {
  return new Map(processes.map((process) => [process.actorId, process]));
}

function shouldExecuteDeterministic(decision: ActorScheduleDecision): boolean {
  if (decision.route !== "deterministic_continuation") {
    return false;
  }
  return !decision.reservation || decision.reservation.status === "reserved";
}

function shouldDeferDecision(decision: ActorScheduleDecision): boolean {
  if (decision.route !== "proposal_after_done") {
    return false;
  }
  return decision.signals.some((signal) =>
    signal.type === "exposed_scope_catch_up"
    || signal.type === "due_time"
    || signal.type === "deadline"
    || signal.type === "agency_debt",
  );
}

function queueDeferredActorDecision(input: {
  campaignId: string;
  tick: number;
  phase: DueWorldWorkPhase;
  decision: ActorScheduleDecision;
}): CreatedSimulationProposal {
  const clock = readWorldClock(input.campaignId);
  const existing = findActiveActorDecisionProposal({
    campaignId: input.campaignId,
    actorId: input.decision.actorId,
    phase: input.phase,
  });
  if (existing) {
    return existing;
  }

  return createSimulationProposal({
    campaignId: input.campaignId,
    proposalType: "key_actor_due_decision",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.decision.actorId },
    summary: `${input.decision.actorName}: ${input.decision.reason}`,
    readSet: [
      `world_version:${clock.worldVersion}`,
      `world_time:${clock.worldTimeMinutes}`,
      `npc:${input.decision.actorId}:process`,
      ...input.decision.writeScopes,
    ],
    writeScopes: input.decision.writeScopes,
    preconditions: [
      "Due actor work touching exposed scope must resolve through an actor decision before committing non-deterministic state.",
    ],
    dueAtWorldTimeMinutes: clock.worldTimeMinutes,
    priority: input.decision.signals[0]?.priority ?? 5,
    intendedTools: [{
      name: "actor_decision",
      reason: input.phase,
    }],
    provenance: {
      source: "due-world-work",
      tick: input.tick,
      route: input.phase,
    },
    data: {
      schedule: input.decision,
      phase: input.phase,
    },
  });
}

function buildDeferredActorProposalPrepTrace(
  deferred: readonly DeferredActorWork[],
): ParallelSimulationRunTrace[] {
  if (deferred.length === 0) {
    return [];
  }

  const startedAt = Date.now();
  const groups = planParallelSimulationGroups(
    deferred.map((item) => ({
      id: item.decision.actorId,
      label: item.decision.actorName,
      route: item.decision.route,
      writeScopes: item.decision.writeScopes,
      run: () => undefined,
    })),
  );
  const endedAt = Date.now();

  return groups.map((group) => ({
    groupIndex: group.groupIndex,
    startedAt,
    endedAt,
    durationMs: Math.max(0, endedAt - startedAt),
    jobCount: group.jobs.length,
    writeScopes: group.writeScopes,
    serializedFallbackCount: group.jobs.filter((job) => job.serializedAfterJobIds.length > 0).length,
  }));
}

export function resolveDueWorldWorkForScope(
  input: ResolveDueWorldWorkForScopeInput,
): ResolveDueWorldWorkForScopeResult {
  const blockedWriteScopes: SimulationActorWriteScope[] = [
    ...(input.blockedWriteScopes ?? []),
  ];
  const worldThreads = resolveDueWorldThreadWorkForScope({
    campaignId: input.campaignId,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    blockedWriteScopes,
  });
  blockedWriteScopes.push(
    ...worldThreads.executed.flatMap((entry) =>
      entry.authority.stateDeltaRefs,
    ),
  );
  const schedule = scheduleKeyActorProcessesForTurn({
    campaignId: input.campaignId,
    tick: input.tick,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
    blockedWriteScopes,
  });
  const processes = processByActorId(
    listKeyActorProcessesByActorIds({
      campaignId: input.campaignId,
      actorIds: schedule.decisions.map((decision) => decision.actorId),
    }),
  );
  const executed: ExecuteActorPlanStepResult[] = [];
  const deferred: DeferredActorWork[] = [];
  const skipped: ActorScheduleDecision[] = [];

  for (const decision of schedule.decisions) {
    const conflict = findConflictingWriteScope({
      writeScopes: decision.writeScopes,
      blockedWriteScopes,
    });
    if (conflict) {
      skipped.push(decision);
      continue;
    }

    if (shouldExecuteDeterministic(decision)) {
      const process = processes.get(decision.actorId);
      if (!process) {
        skipped.push(decision);
        continue;
      }
      const result = executeActorPlanStep({
        campaignId: input.campaignId,
        tick: input.tick,
        process,
        baseWorldVersion: readWorldClock(input.campaignId).worldVersion,
      });
      executed.push(result);
      if (result.status === "completed") {
        blockedWriteScopes.push(...result.stateDeltaRefs);
        consumeActorWakeSignals({
          campaignId: input.campaignId,
          actorIds: [decision.actorId],
          worldTimeMinutes: readWorldClock(input.campaignId).worldTimeMinutes,
        });
      }
      continue;
    }

    if (shouldDeferDecision(decision)) {
      deferred.push({
        decision,
        proposal: queueDeferredActorDecision({
          campaignId: input.campaignId,
          tick: input.tick,
          phase: input.phase,
          decision,
        }),
      });
      continue;
    }

    skipped.push(decision);
  }

  return {
    phase: input.phase,
    executed,
    deferred,
    skipped,
    worldThreads,
    proposalPrepTrace: buildDeferredActorProposalPrepTrace(deferred),
  };
}

export async function resolveDueWorldWorkForScopeWithProposalWatchdog(
  input: ResolveDueWorldWorkForScopeInput,
): Promise<ResolveDueWorldWorkWithProposalWatchdogResult> {
  const beforeProposals = await resolveDueSimulationProposalsForScope({
    campaignId: input.campaignId,
    tick: input.tick,
    phase: input.phase,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    blockedWriteScopes: input.blockedWriteScopes,
    actorDecisionContext: input.actorDecisionContext,
  });
  const dueWork = resolveDueWorldWorkForScope({
    ...input,
    blockedWriteScopes: beforeProposals.blockedWriteScopes,
  });
  const afterProposals = await resolveDueSimulationProposalsForScope({
    campaignId: input.campaignId,
    tick: input.tick,
    phase: input.phase,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    blockedWriteScopes: [
      ...beforeProposals.blockedWriteScopes,
      ...dueWorkBlockedWriteScopes(dueWork),
    ],
    actorDecisionContext: input.actorDecisionContext,
  });
  return {
    ...dueWork,
    proposals: mergeProposalResults(beforeProposals, afterProposals),
  };
}
