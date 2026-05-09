import {
  listKeyActorProcessesForCampaign,
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
}

export interface ScheduleKeyActorProcessesResult {
  campaignId: string;
  baseWorldVersion: number;
  worldTimeMinutes: number;
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
  if (present && input.signals.some((signal) => signal.requiredBeforeDone)) {
    const route: ActorProcessRoute = "required_before_done";
    return {
      actorId: process.actorId,
      actorName: process.actor.name,
      route,
      reason: "present actor can affect the visible scene",
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
  const processes = listKeyActorProcessesForCampaign({
    campaignId: input.campaignId,
    backfill: true,
  });
  const decisions = processes.map((process) => {
    const signals = collectWakeSignals({
      process,
      worldVersion: clock.worldVersion,
      worldTimeMinutes: clock.worldTimeMinutes,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
      elapsedWorldTimeMinutes: input.elapsedWorldTimeMinutes,
      reports: input.reportsByActorId?.get(process.actorId),
    });
    return classifyActorProcess({
      process,
      signals,
      playerLocationId: input.playerLocationId,
      playerSceneScopeId: input.playerSceneScopeId,
    });
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
    decisions: decisions.map((decision) => ({
      ...decision,
      reservation: reservationByActor.get(decision.actorId),
    })),
  };
}
