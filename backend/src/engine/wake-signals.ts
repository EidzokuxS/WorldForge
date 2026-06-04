import {
  KEY_ACTOR_AGENCY_DEBT_WAKE_THRESHOLD,
  type KeyActorInboxItem,
  type KeyActorProcess,
} from "./key-actor-process.js";

export type WakeSignalType =
  | "due_time"
  | "direct_observation"
  | "report"
  | "rumor"
  | "urgency"
  | "exposed_scope_catch_up"
  | "deadline"
  | "agency_debt"
  | "inbox";

export interface WakeSignal {
  type: WakeSignalType;
  reason: string;
  priority: number;
  requiredBeforeDone: boolean;
  sourceId?: string | null;
}

export interface WakeSignalInput {
  process: KeyActorProcess;
  worldTimeMinutes: number;
  worldVersion: number;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
  elapsedWorldTimeMinutes?: number;
  reports?: readonly KeyActorInboxItem[];
  externalSignals?: readonly WakeSignal[];
}

function normalizeSceneScope(locationId?: string | null, sceneScopeId?: string | null): string | null {
  if (!locationId) {
    return null;
  }
  return sceneScopeId && sceneScopeId !== locationId ? sceneScopeId : locationId;
}

export function isActorInPlayerScene(input: {
  actorLocationId?: string | null;
  actorSceneScopeId?: string | null;
  playerLocationId?: string | null;
  playerSceneScopeId?: string | null;
}): boolean {
  if (!input.actorLocationId || !input.playerLocationId) {
    return false;
  }
  if (input.actorLocationId !== input.playerLocationId) {
    return false;
  }
  return normalizeSceneScope(input.actorLocationId, input.actorSceneScopeId)
    === normalizeSceneScope(input.playerLocationId, input.playerSceneScopeId);
}

export function collectWakeSignals(input: WakeSignalInput): WakeSignal[] {
  const process = input.process;
  if (process.status === "disabled") {
    return [];
  }

  const signals: WakeSignal[] = [];
  const dueAt = process.nextWakeWorldTimeMinutes;
  if (dueAt !== null && dueAt <= input.worldTimeMinutes) {
    signals.push({
      type: "due_time",
      reason: `next wake time ${dueAt} reached at ${input.worldTimeMinutes}`,
      priority: 5,
      requiredBeforeDone: false,
    });
  }

  if (isActorInPlayerScene({
    actorLocationId: process.actor.currentLocationId,
    actorSceneScopeId: process.actor.currentSceneLocationId,
    playerLocationId: input.playerLocationId,
    playerSceneScopeId: input.playerSceneScopeId,
  })) {
    signals.push({
      type: "direct_observation",
      reason: "actor is present in the player-visible scene",
      priority: 10,
      requiredBeforeDone: true,
    });
  } else if (
    process.actor.currentLocationId
    && input.playerLocationId
    && process.actor.currentLocationId === input.playerLocationId
    && (input.elapsedWorldTimeMinutes ?? 0) > 0
  ) {
    signals.push({
      type: "exposed_scope_catch_up",
      reason: "actor shares the broad exposed location but is outside the current scene scope",
      priority: 4,
      requiredBeforeDone: false,
    });
  }

  const deadline = process.state.activePlan?.deadlineWorldTimeMinutes ?? null;
  if (deadline !== null && deadline <= input.worldTimeMinutes) {
    signals.push({
      type: "deadline",
      reason: `active plan deadline ${deadline} reached`,
      priority: 8,
      requiredBeforeDone: false,
    });
  }

  if (process.state.agencyDebt >= KEY_ACTOR_AGENCY_DEBT_WAKE_THRESHOLD) {
    signals.push({
      type: "agency_debt",
      reason: `agency debt ${process.state.agencyDebt} reached threshold`,
      priority: 6,
      requiredBeforeDone: false,
    });
  }

  for (const item of [...process.state.inbox, ...(input.reports ?? [])]) {
    const type = item.route === "rumor" ? "rumor" : item.route === "report" ? "report" : "inbox";
    signals.push({
      type,
      reason: item.summary,
      priority: Math.max(1, item.priority),
      requiredBeforeDone: item.route === "direct_observation" || item.priority >= 9,
      sourceId: item.id,
    });
  }

  for (const interrupt of process.state.interrupts) {
    signals.push({
      type: "urgency",
      reason: interrupt.reason,
      priority: Math.max(1, interrupt.priority),
      requiredBeforeDone: interrupt.priority >= 9,
      sourceId: interrupt.id,
    });
  }

  signals.push(...(input.externalSignals ?? []));

  return signals
    .sort((left, right) => right.priority - left.priority)
    .filter((signal, index, all) =>
      all.findIndex(
        (candidate) => candidate.type === signal.type && candidate.sourceId === signal.sourceId,
      ) === index,
    );
}
