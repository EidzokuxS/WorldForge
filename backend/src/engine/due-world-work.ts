import {
  scheduleKeyActorProcessesForTurn,
  type ActorScheduleDecision,
} from "./actor-scheduler.js";
import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { simulationProposals } from "../db/schema.js";
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
  parseSimulationProposalPayload,
  type CreatedSimulationProposal,
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
import { consumeActorWakeSignals } from "./actor-wake-signals.js";

export type DueWorldWorkPhase = "pre_scene_frame" | "pre_narrator_packet";

export interface ResolveDueWorldWorkForScopeInput {
  campaignId: string;
  tick: number;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  elapsedWorldTimeMinutes?: number;
  phase: DueWorldWorkPhase;
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
}

export interface ResolveDueWorldWorkWithProposalWatchdogResult
  extends ResolveDueWorldWorkForScopeResult {
  proposals: ResolveDueSimulationProposalsForScopeResult;
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
  const existing = getDb()
    .select()
    .from(simulationProposals)
    .where(
      and(
        eq(simulationProposals.campaignId, input.campaignId),
        eq(simulationProposals.proposalType, "key_actor_due_decision"),
        eq(simulationProposals.status, "pending"),
        eq(simulationProposals.sourceEntityId, input.decision.actorId),
      ),
    )
    .all()
    .find((proposal) => {
      const payload = parseSimulationProposalPayload(proposal.payload);
      const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
        ? payload.data as Record<string, unknown>
        : {};
      return data.phase === input.phase;
    });
  if (existing) {
    const payload = parseSimulationProposalPayload(existing.payload);
    return {
      proposalId: existing.id,
      campaignId: existing.campaignId,
      proposalType: existing.proposalType,
      baseWorldVersion: existing.baseWorldVersion,
      writeScopes: payload.writeScopes,
      status: "pending",
      disposition: existing.proposalDisposition,
      dueAtWorldTimeMinutes: existing.dueAtWorldTimeMinutes ?? payload.dueAtWorldTimeMinutes,
      priority: existing.priority ?? payload.priority,
    };
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

export function resolveDueWorldWorkForScope(
  input: ResolveDueWorldWorkForScopeInput,
): ResolveDueWorldWorkForScopeResult {
  const worldThreads = resolveDueWorldThreadWorkForScope({
    campaignId: input.campaignId,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
  });
  const schedule = scheduleKeyActorProcessesForTurn({
    campaignId: input.campaignId,
    tick: input.tick,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
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
  };
}

export async function resolveDueWorldWorkForScopeWithProposalWatchdog(
  input: ResolveDueWorldWorkForScopeInput,
): Promise<ResolveDueWorldWorkWithProposalWatchdogResult> {
  const proposals = await resolveDueSimulationProposalsForScope({
    campaignId: input.campaignId,
    tick: input.tick,
    phase: input.phase,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
  });
  return {
    ...resolveDueWorldWorkForScope(input),
    proposals,
  };
}
