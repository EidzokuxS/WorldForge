import {
  backfillKeyActorProcessesForCampaign,
  listDueKeyActorProcessActorIds,
  listKeyActorProcessActorIdsInScope,
  listKeyActorProcessesByActorIds,
  type ActorProcessRoute,
  type KeyActorInboxItem,
  type KeyActorProcess,
} from "./key-actor-process.js";
import { readWorldClock } from "./living-world-authority.js";
import {
  collectWakeSignals,
  isActorInPlayerScene,
  type WakeSignal,
} from "./wake-signals.js";
import {
  actorWakeSignalToWakeSignal,
  listCriticalActorWakeCandidates,
  listPendingWakeSignalsForActors,
} from "./actor-wake-signals.js";
import {
  reserveActorWriteScopes,
  type ActorWriteScopeReservation,
} from "./simulation-write-scope.js";
import type { SimulationProposalWriteScope } from "./simulation-proposal.js";

export interface ActorScheduleDecision {
  actorId: string;
  actorName: string;
  route: ActorProcessRoute;
  reason: string;
  signals: WakeSignal[];
  writeScopes: SimulationProposalWriteScope[];
  reservation?: ActorWriteScopeReservation;
}

export interface ScheduleKeyActorProcessesInput {
  campaignId: string;
  tick: number;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  elapsedWorldTimeMinutes?: number;
  reportsByActorId?: ReadonlyMap<string, readonly KeyActorInboxItem[]>;
  explicitActorIds?: readonly string[];
  presentActorReactionRoute?: "required_before_done" | "proposal_after_done";
}

export interface ScheduleKeyActorProcessesResult {
  campaignId: string;
  baseWorldVersion: number;
  worldTimeMinutes: number;
  candidateActorIds?: string[];
  decisions: ActorScheduleDecision[];
}

function strongestSignal(signals: readonly WakeSignal[]): WakeSignal | null {
  return signals[0] ?? null;
}

function isProposalWriteScope(scope: string): scope is SimulationProposalWriteScope {
  return /^(npc|faction|location|world|memory|event|asset):.+/.test(scope);
}

function actorWriteScopes(
  process: KeyActorProcess,
  route: ActorProcessRoute,
): SimulationProposalWriteScope[] {
  const scopes: SimulationProposalWriteScope[] = [`npc:${process.actorId}:state`];
  if (process.actor.currentLocationId && route !== "sleeping") {
    scopes.push(`location:${process.actor.currentLocationId}:presence`);
  }
  for (const scope of process.state.activePlan?.writeScopes ?? []) {
    if (isProposalWriteScope(scope)) {
      scopes.push(scope);
    }
  }
  return scopes;
}

export function classifyActorProcess(input: {
  process: KeyActorProcess;
  signals: readonly WakeSignal[];
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  presentActorReactionRoute?: "required_before_done" | "proposal_after_done";
}): Omit<ActorScheduleDecision, "reservation"> {
  const process = input.process;
  if (process.status === "disabled") {
    return {
      actorId: process.actorId,
      actorName: process.actor.name,
      route: "sleeping",
      reason: process.disabledReason ?? "actor process disabled",
      signals: [...input.signals],
      writeScopes: [],
    };
  }

  const present = isActorInPlayerScene({
    actorLocationId: process.actor.currentLocationId,
    actorSceneScopeId: process.actor.currentSceneLocationId,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
  });
  const requiredSignals = input.signals.filter((signal) => signal.requiredBeforeDone);
  const onlyPresenceRequiresVisibleBoundary =
    requiredSignals.length > 0
    && requiredSignals.every((signal) => signal.type === "direct_observation");
  if (present && requiredSignals.length > 0) {
    const route: ActorProcessRoute =
      input.presentActorReactionRoute === "proposal_after_done"
      && onlyPresenceRequiresVisibleBoundary
        ? "proposal_after_done"
        : "required_before_done";
    return {
      actorId: process.actorId,
      actorName: process.actor.name,
      route,
      reason:
        route === "required_before_done"
          ? "present actor can affect the visible scene"
          : "present actor reaction deferred after visible status read",
      signals: [...input.signals],
      writeScopes: actorWriteScopes(process, route),
    };
  }

  const signal = strongestSignal(input.signals);
  if (!signal) {
    return {
      actorId: process.actorId,
      actorName: process.actor.name,
      route: "sleeping",
      reason: "no wake signal",
      signals: [],
      writeScopes: [],
    };
  }

  if (process.state.activePlan?.deterministic === true) {
    const route: ActorProcessRoute = "deterministic_continuation";
    return {
      actorId: process.actorId,
      actorName: process.actor.name,
      route,
      reason: `deterministic plan continues after ${signal.type}`,
      signals: [...input.signals],
      writeScopes: actorWriteScopes(process, route),
    };
  }

  const route: ActorProcessRoute = "proposal_after_done";
  return {
    actorId: process.actorId,
    actorName: process.actor.name,
    route,
    reason: `actor woke from ${signal.type}`,
    signals: [...input.signals],
    writeScopes: actorWriteScopes(process, route),
  };
}

export function scheduleKeyActorProcessesForTurn(
  input: ScheduleKeyActorProcessesInput,
): ScheduleKeyActorProcessesResult {
  const clock = readWorldClock(input.campaignId);
  backfillKeyActorProcessesForCampaign({ campaignId: input.campaignId });
  const candidateActorIds = new Set<string>();

  for (const actorId of listDueKeyActorProcessActorIds({
    campaignId: input.campaignId,
    worldTimeMinutes: clock.worldTimeMinutes,
  })) {
    candidateActorIds.add(actorId);
  }

  for (const actorId of listKeyActorProcessActorIdsInScope({
    campaignId: input.campaignId,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
    includeBroadLocation: (input.elapsedWorldTimeMinutes ?? 0) > 0,
  })) {
    candidateActorIds.add(actorId);
  }

  for (const actorId of input.reportsByActorId?.keys() ?? []) {
    candidateActorIds.add(actorId);
  }

  for (const actorId of input.explicitActorIds ?? []) {
    candidateActorIds.add(actorId);
  }

  const criticalWakeRows = listCriticalActorWakeCandidates({
    campaignId: input.campaignId,
    worldTimeMinutes: clock.worldTimeMinutes,
    actorType: "npc",
  });
  for (const row of criticalWakeRows) {
    candidateActorIds.add(row.actorId);
  }

  const candidateIds = [...candidateActorIds].sort();
  const processes = listKeyActorProcessesByActorIds({
    campaignId: input.campaignId,
    actorIds: candidateIds,
  });
  const durableSignalsByActorId = new Map<string, WakeSignal[]>();
  for (const row of listPendingWakeSignalsForActors({
    campaignId: input.campaignId,
    actorIds: candidateIds,
    worldTimeMinutes: clock.worldTimeMinutes,
    actorType: "npc",
  })) {
    const signals = durableSignalsByActorId.get(row.actorId) ?? [];
    signals.push(actorWakeSignalToWakeSignal(row));
    durableSignalsByActorId.set(row.actorId, signals);
  }

  const decisions = processes.flatMap((process) => {
    const signals = collectWakeSignals({
      process,
      worldVersion: clock.worldVersion,
      worldTimeMinutes: clock.worldTimeMinutes,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
      reports: input.reportsByActorId?.get(process.actorId),
      externalSignals: durableSignalsByActorId.get(process.actorId),
    });
    const decision = classifyActorProcess({
      process,
      signals,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
      presentActorReactionRoute: input.presentActorReactionRoute,
    });
    return decision.route === "sleeping" ? [] : [decision];
  });

  const reservable = decisions.filter((decision) => decision.writeScopes.length > 0);
  const reservations = reserveActorWriteScopes(reservable.map((decision) => ({
    actorId: decision.actorId,
    route: decision.route,
    writeScopes: decision.writeScopes,
  })));
  const reservationByActor = new Map(
    reservations.map((reservation) => [reservation.actorId, reservation]),
  );

  return {
    campaignId: input.campaignId,
    baseWorldVersion: clock.worldVersion,
    worldTimeMinutes: clock.worldTimeMinutes,
    candidateActorIds: candidateIds,
    decisions: decisions.map((decision) => ({
      ...decision,
      reservation: reservationByActor.get(decision.actorId),
    })),
  };
}
