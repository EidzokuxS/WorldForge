import { and, eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { simulationProposals } from "../db/schema.js";
import {
  actorWakeSignalToWakeSignal,
  type ActorWakeSignalRecord,
  consumeActorWakeSignals,
  listCriticalActorWakeCandidates,
} from "./actor-wake-signals.js";
import {
  classifyActorProcess,
  type ActorScheduleDecision,
} from "./actor-scheduler.js";
import {
  listKeyActorProcessActorIdsInScope,
  listKeyActorProcessesByActorIds,
} from "./key-actor-process.js";
import { executeActorPlanStep, type ExecuteActorPlanStepResult } from "./actor-plan-executor.js";
import { readWorldClock } from "./living-world-authority.js";
import {
  createSimulationProposal,
  parseSimulationProposalPayload,
  type CreatedSimulationProposal,
} from "./simulation-proposal.js";
import { collectWakeSignals, type WakeSignal } from "./wake-signals.js";

export interface ResolveActorExposureCatchupInput {
  campaignId: string;
  tick: number;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  candidateActorIds?: readonly string[];
  elapsedWorldTimeMinutes?: number;
  phase: "pre_scene_frame" | "pre_narrator_packet";
}

export interface DeferredActorExposureWork {
  actorId: string;
  decision: ActorScheduleDecision;
  proposal: CreatedSimulationProposal;
}

export interface ResolveActorExposureCatchupResult {
  executed: ExecuteActorPlanStepResult[];
  deferred: DeferredActorExposureWork[];
  skippedActorIds: string[];
  inspectedActorIds: string[];
  requiresFrameRefresh: boolean;
}

function groupSignalsByActor(signals: readonly ActorWakeSignalRecord[]) {
  const result = new Map<string, WakeSignal[]>();
  for (const signal of signals) {
    const actorSignals = result.get(signal.actorId) ?? [];
    actorSignals.push(actorWakeSignalToWakeSignal(signal));
    result.set(signal.actorId, actorSignals);
  }
  return result;
}

function hasActionableExposureSignal(decision: ActorScheduleDecision): boolean {
  return decision.signals.some((signal) =>
    signal.type === "exposed_scope_catch_up"
    || signal.type === "due_time"
    || signal.type === "deadline"
    || signal.type === "agency_debt"
    || signal.type === "report"
    || signal.type === "urgency",
  );
}

function shouldExecuteDeterministicExposure(input: {
  process: { state: { activePlan?: { deterministic?: boolean } | null } };
  decision: ActorScheduleDecision;
}): boolean {
  return input.process.state.activePlan?.deterministic === true
    && hasActionableExposureSignal(input.decision);
}

function shouldDeferDecision(decision: ActorScheduleDecision): boolean {
  return (decision.route === "proposal_after_done" || decision.route === "required_before_done")
    && hasActionableExposureSignal(decision);
}

function queueDeferredExposureDecision(input: {
  campaignId: string;
  tick: number;
  phase: ResolveActorExposureCatchupInput["phase"];
  decision: ActorScheduleDecision;
}): CreatedSimulationProposal {
  const clock = readWorldClock(input.campaignId);
  const existing = getDb()
    .select()
    .from(simulationProposals)
    .where(
      and(
        eq(simulationProposals.campaignId, input.campaignId),
        eq(simulationProposals.proposalType, "key_actor_exposure_decision"),
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
    proposalType: "key_actor_exposure_decision",
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
      "Actor exposure catchup may not commit non-deterministic private actor state without a later actor decision.",
    ],
    dueAtWorldTimeMinutes: clock.worldTimeMinutes,
    priority: input.decision.signals[0]?.priority ?? 5,
    intendedTools: [{
      name: "actor_decision",
      reason: input.phase,
    }],
    provenance: {
      source: "actor-exposure-catchup",
      tick: input.tick,
      route: input.phase,
    },
    data: {
      schedule: input.decision,
      phase: input.phase,
    },
  });
}

export function resolveActorExposureCatchup(
  input: ResolveActorExposureCatchupInput,
): ResolveActorExposureCatchupResult {
  const clock = readWorldClock(input.campaignId);
  const candidateActorIds = new Set<string>(input.candidateActorIds ?? []);
  for (const actorId of listKeyActorProcessActorIdsInScope({
    campaignId: input.campaignId,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    includeBroadLocation: (input.elapsedWorldTimeMinutes ?? 0) > 0,
  })) {
    candidateActorIds.add(actorId);
  }
  const wakeRows = listCriticalActorWakeCandidates({
    campaignId: input.campaignId,
    worldTimeMinutes: clock.worldTimeMinutes,
    actorType: "npc",
  });
  for (const row of wakeRows) {
    candidateActorIds.add(row.actorId);
  }

  const inspectedActorIds = [...candidateActorIds].sort();
  const externalSignalsByActor = groupSignalsByActor(wakeRows);
  const processes = listKeyActorProcessesByActorIds({
    campaignId: input.campaignId,
    actorIds: inspectedActorIds,
  });
  const executed: ExecuteActorPlanStepResult[] = [];
  const deferred: DeferredActorExposureWork[] = [];
  const skippedActorIds: string[] = [];

  for (const process of processes) {
    const signals = collectWakeSignals({
      process,
      worldVersion: clock.worldVersion,
      worldTimeMinutes: clock.worldTimeMinutes,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
      externalSignals: externalSignalsByActor.get(process.actorId),
    });
    const decision = classifyActorProcess({
      process,
      signals,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
    });

    if (
      decision.route === "deterministic_continuation"
      || shouldExecuteDeterministicExposure({ process, decision })
    ) {
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
        actorId: decision.actorId,
        decision,
        proposal: queueDeferredExposureDecision({
          campaignId: input.campaignId,
          tick: input.tick,
          phase: input.phase,
          decision,
        }),
      });
      continue;
    }

    skippedActorIds.push(process.actorId);
  }

  return {
    executed,
    deferred,
    skippedActorIds,
    inspectedActorIds,
    requiresFrameRefresh: executed.some((result) => result.status === "completed"),
  };
}
