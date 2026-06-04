import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locations, npcs } from "../db/schema.js";
import {
  hydrateStoredNpcRecord,
  projectNpcRecord,
} from "../character/record-adapters.js";
import {
  KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES,
  updateActorProcessAfterDecision,
  type KeyActorPlanSurfacePolicy,
  type KeyActorProcess,
  type KeyActorProcessState,
} from "./key-actor-process.js";
import {
  commitAuthorityTrace,
  readWorldClock,
} from "./living-world-authority.js";
import type { ToolResultAuthority } from "./tool-result.js";
import {
  loadLocationGraph,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";
import { recordLocationRecentEvent } from "./location-events.js";
import { createSimulationProposal } from "./simulation-proposal.js";
import {
  findUncoveredWriteRef,
  type SimulationActorWriteScope,
} from "./simulation-write-scope.js";

type ActorProcessUpdateStatus = ReturnType<typeof updateActorProcessAfterDecision>["status"];

class ActorPlanProcessUpdateError extends Error {
  readonly actorId: string;
  readonly status: ActorProcessUpdateStatus;

  constructor(input: { actorId: string; status: ActorProcessUpdateStatus }) {
    super(`Actor plan process update failed for ${input.actorId}: ${input.status}`);
    this.name = "ActorPlanProcessUpdateError";
    this.actorId = input.actorId;
    this.status = input.status;
  }
}

export type ActorPlanExecutionStatus =
  | "completed"
  | "waiting"
  | "needs_decision"
  | "failed"
  | "stale_rejected";

export interface ExecuteActorPlanStepInput {
  campaignId: string;
  tick: number;
  process: KeyActorProcess;
  baseWorldVersion?: number;
  allowedWriteScopes?: readonly SimulationActorWriteScope[];
}

export interface ExecuteActorPlanStepResult {
  status: ActorPlanExecutionStatus;
  actorId: string;
  actorName: string;
  summary: string;
  authority?: ToolResultAuthority;
  eventIds: string[];
  stateDeltaRefs: string[];
  surface?: ActorPlanStepSurface;
  failureReason?: string;
  replanProposalId?: string;
  processUpdateStatus?: ReturnType<typeof updateActorProcessAfterDecision>["status"];
}

export interface ActorPlanStepSurface {
  locationRef: string | null;
  surfaceRoute: string | null;
  visibility: KeyActorPlanSurfacePolicy["visibility"];
  knowledgeRoute: string | null;
  hiddenCauseTerms: string[];
}

function nextProcessState(input: {
  process: KeyActorProcess;
  activePlan: KeyActorProcessState["activePlan"];
  reason: string;
  failed?: boolean;
}): KeyActorProcessState {
  return {
    ...input.process.state,
    activePlan: input.activePlan,
    nextDecisionReason: input.reason,
    interrupts: input.failed
      ? [
          ...input.process.state.interrupts,
          {
            id: `plan-failure:${input.process.state.activePlan?.id ?? "unknown"}`,
            reason: input.reason,
            priority: 8,
          },
        ]
      : input.process.state.interrupts,
    inbox: input.process.state.inbox,
    agencyDebt: input.failed
      ? input.process.state.agencyDebt + 1
      : Math.max(0, input.process.state.agencyDebt - 1),
  };
}

function updateProcess(input: {
  process: KeyActorProcess;
  resultWorldVersion: number;
  worldTimeMinutes: number;
  activePlan: KeyActorProcessState["activePlan"];
  reason: string;
  failed?: boolean;
}): ReturnType<typeof updateActorProcessAfterDecision> {
  return updateActorProcessAfterDecision({
    campaignId: input.process.campaignId,
    actorId: input.process.actorId,
    expectedBaseWorldVersion: input.process.lastWorldVersion,
    resultWorldVersion: input.resultWorldVersion,
    lastWakeWorldTimeMinutes: input.worldTimeMinutes,
    nextWakeWorldTimeMinutes: input.failed
      ? input.worldTimeMinutes
      : input.worldTimeMinutes + KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES,
    status: input.failed ? "queued" : "waiting",
    processState: nextProcessState({
      process: input.process,
      activePlan: input.activePlan,
      reason: input.reason,
      failed: input.failed,
    }),
  });
}

function assertActorPlanProcessUpdated(input: {
  actorId: string;
  status: ActorProcessUpdateStatus;
}): asserts input is { actorId: string; status: "updated" } {
  if (input.status !== "updated") {
    throw new ActorPlanProcessUpdateError(input);
  }
}

function findLocationName(locationId: string | null): string | null {
  if (!locationId) {
    return null;
  }
  return getDb()
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.id, locationId))
    .get()?.name ?? null;
}

function resolveDestination(input: {
  campaignId: string;
  tick: number;
  destinationLocationId?: string | null;
  destinationLocationName?: string | null;
}): { locationId: string; locationName: string } | null {
  const graph = loadLocationGraph({ campaignId: input.campaignId });
  if (input.destinationLocationId) {
    const byId = graph.locations.find((location) => location.id === input.destinationLocationId);
    if (byId) {
      return { locationId: byId.id, locationName: byId.name };
    }
  }
  if (!input.destinationLocationName) {
    return null;
  }
  return resolveLocationTarget({
    targetName: input.destinationLocationName,
    locations: graph.locations,
    currentTick: input.tick,
  });
}

function recordActorEvent(input: {
  campaignId: string;
  tick: number;
  actorId: string;
  actorName: string;
  locationRef: string | null;
  eventType: string;
  summary: string;
  importance?: number | null;
  surface?: KeyActorPlanSurfacePolicy;
}): string[] {
  const event = recordLocationRecentEvent({
    campaignId: input.campaignId,
    locationRef: input.locationRef,
    tick: input.tick,
    eventType: input.eventType,
    summary: input.summary,
    importance: input.importance ?? 3,
    surfaceRoute: input.surface?.surfaceRoute ?? "actor_plan_step",
    visibility: input.surface?.visibility ?? "player_perceivable",
    knowledgeRoute: input.surface?.knowledgeRoute ?? null,
    hiddenCauseTerms: input.surface?.hiddenCauseTerms ?? [],
  });
  return event ? [event.id] : [];
}

function uniqueWriteScopes(
  values: readonly (SimulationActorWriteScope | null | undefined)[],
): SimulationActorWriteScope[] {
  return [...new Set(values.map((value) => value?.trim()).filter((value): value is string =>
    Boolean(value)))];
}

function actorStateWriteScope(actorId: string): SimulationActorWriteScope {
  return `npc:${actorId}:state`;
}

function locationRecentEventWriteScope(input: {
  campaignId: string;
  locationRef: string | null | undefined;
}): SimulationActorWriteScope | null {
  const normalizedLocationRef = input.locationRef?.trim();
  if (!normalizedLocationRef) return null;
  const location = getDb()
    .select({
      id: locations.id,
      kind: locations.kind,
      anchorLocationId: locations.anchorLocationId,
    })
    .from(locations)
    .where(
      sql`${locations.campaignId} = ${input.campaignId} AND (${locations.id} = ${normalizedLocationRef} OR LOWER(${locations.name}) = LOWER(${normalizedLocationRef}))`,
    )
    .get();
  if (!location) return null;
  const locationId =
    location.kind === "ephemeral_scene" && location.anchorLocationId
      ? location.anchorLocationId
      : location.id;
  return `location:${locationId}:recent_event`;
}

function actorPlanWriteScopeFailureResult(input: {
  process: KeyActorProcess;
  stateDeltaRef: SimulationActorWriteScope;
}): ExecuteActorPlanStepResult {
  return {
    status: "failed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary: `Skipped deterministic plan for ${input.process.actor.name}: planned write ref ${input.stateDeltaRef} was not covered by the reserved write scopes.`,
    eventIds: [],
    stateDeltaRefs: [],
    failureReason: `actor_plan_write_scope_mismatch:${input.stateDeltaRef}`,
  };
}

function validateActorPlanWriteScopes(input: {
  process: KeyActorProcess;
  stateDeltaRefs: readonly SimulationActorWriteScope[];
  allowedWriteScopes?: readonly SimulationActorWriteScope[];
}): ExecuteActorPlanStepResult | null {
  if (!input.allowedWriteScopes) return null;
  const uncovered = findUncoveredWriteRef({
    stateDeltaRefs: input.stateDeltaRefs,
    allowedWriteScopes: input.allowedWriteScopes,
  });
  return uncovered
    ? actorPlanWriteScopeFailureResult({
        process: input.process,
        stateDeltaRef: uncovered.stateDeltaRef,
      })
    : null;
}

function actorPlanSurface(input: {
  locationRef: string | null;
  surface?: KeyActorPlanSurfacePolicy;
}): ActorPlanStepSurface {
  return {
    locationRef: input.locationRef,
    surfaceRoute: input.surface?.surfaceRoute ?? "actor_plan_step",
    visibility: input.surface?.visibility ?? "player_perceivable",
    knowledgeRoute: input.surface?.knowledgeRoute ?? null,
    hiddenCauseTerms: [...(input.surface?.hiddenCauseTerms ?? [])],
  };
}

function rejectStale(input: {
  process: KeyActorProcess;
  expected: number;
  actual: number;
}): ExecuteActorPlanStepResult {
  return {
    status: "stale_rejected",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary: `Skipped deterministic plan for ${input.process.actor.name}: stale world version ${input.expected} != ${input.actual}.`,
    eventIds: [],
    stateDeltaRefs: [],
    failureReason: "stale_base_world_version",
  };
}

function recordFailure(input: {
  campaignId: string;
  tick: number;
  process: KeyActorProcess;
  reason: string;
  allowedWriteScopes?: readonly SimulationActorWriteScope[];
}): ExecuteActorPlanStepResult {
  const clock = readWorldClock(input.campaignId);
  const locationRef = input.process.actor.currentSceneLocationId
    ?? input.process.actor.currentLocationId;
  const stateDeltaRefs = uniqueWriteScopes([
    actorStateWriteScope(input.process.actorId),
    locationRecentEventWriteScope({
      campaignId: input.campaignId,
      locationRef,
    }),
  ]);
  const scopeFailure = validateActorPlanWriteScopes({
    process: input.process,
    stateDeltaRefs,
    allowedWriteScopes: input.allowedWriteScopes,
  });
  if (scopeFailure) return scopeFailure;
  const eventIds = recordActorEvent({
    campaignId: input.campaignId,
    tick: input.tick,
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    locationRef,
    eventType: "actor_plan_failure",
    summary: `${input.process.actor.name}'s offscreen plan stalls: ${input.reason}`,
    importance: 4,
    surface: {
      surfaceRoute: "actor_plan_failure",
      visibility: "local_signal",
      knowledgeRoute: null,
      hiddenCauseTerms: [],
    },
  });
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "actor_plan:failure",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    elapsedWorldTimeMinutes: 0,
    currentTick: input.tick,
    eventIds,
    stateDeltaRefs,
    metadata: {
      planId: input.process.state.activePlan?.id ?? null,
      reason: input.reason,
    },
  });
  const clockAfter = readWorldClock(input.campaignId);
  const processUpdate = updateProcess({
    process: input.process,
    resultWorldVersion: clockAfter.worldVersion,
    worldTimeMinutes: clockAfter.worldTimeMinutes,
    activePlan: input.process.state.activePlan,
    reason: input.reason,
    failed: true,
  });
  assertActorPlanProcessUpdated({
    actorId: input.process.actorId,
    status: processUpdate.status,
  });
  const replan = createSimulationProposal({
    campaignId: input.campaignId,
    proposalType: "key_actor_replan_request",
    baseWorldVersion: clockAfter.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    summary: `${input.process.actor.name} needs a new plan: ${input.reason}`,
    readSet: [
      `world_version:${clockAfter.worldVersion}`,
      `npc:${input.process.actorId}:process`,
    ],
    writeScopes: [`npc:${input.process.actorId}:state`],
    preconditions: [
      "A failed deterministic offscreen step must be reviewed before new state is committed.",
    ],
    dueAtWorldTimeMinutes: clockAfter.worldTimeMinutes,
    priority: 8,
    intendedTools: [{
      name: "actor_replan_request",
      reason: "deterministic_plan_failed",
    }],
    provenance: { source: "actor-plan-executor", tick: input.tick },
    data: {
      failedPlan: input.process.state.activePlan,
      reason: input.reason,
    },
  });

  return {
    status: "failed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary: input.reason,
    authority,
    eventIds,
    stateDeltaRefs,
    failureReason: input.reason,
    replanProposalId: replan.proposalId,
    processUpdateStatus: processUpdate.status,
  };
}

function executeTravel(input: ExecuteActorPlanStepInput): ExecuteActorPlanStepResult {
  const action = input.process.state.activePlan?.action;
  if (!action || action.kind !== "travel") {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "deterministic travel plan has no travel action payload",
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const actorLocationId = input.process.actor.currentLocationId;
  if (!actorLocationId) {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "actor has no current location",
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const graph = loadLocationGraph({ campaignId: input.campaignId });
  const destination = resolveDestination({
    campaignId: input.campaignId,
    tick: input.tick,
    destinationLocationId: action.destinationLocationId,
    destinationLocationName: action.destinationLocationName,
  });
  if (!destination) {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "destination is not a known traversable location",
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const path = resolveTravelPath({
    campaignId: input.campaignId,
    fromLocationId: actorLocationId,
    toLocationId: destination.locationId,
    edges: graph.edges,
    locations: graph.locations,
    currentTick: input.tick,
  });
  if (!path) {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: `${destination.locationName} is not connected to ${findLocationName(actorLocationId) ?? "the actor's current location"}`,
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const db = getDb();
  const npc = db
    .select()
    .from(npcs)
    .where(eq(npcs.id, input.process.actorId))
    .get();
  if (!npc || npc.campaignId !== input.campaignId) {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "actor NPC record disappeared before travel could commit",
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const plannedStateDeltaRefs = uniqueWriteScopes([
    actorStateWriteScope(input.process.actorId),
    `location:${actorLocationId}:presence`,
    `location:${destination.locationId}:presence`,
    locationRecentEventWriteScope({
      campaignId: input.campaignId,
      locationRef: destination.locationId,
    }),
    path.totalTravelCost > 0 ? "world:time" : null,
  ]);
  const scopeFailure = validateActorPlanWriteScopes({
    process: input.process,
    stateDeltaRefs: plannedStateDeltaRefs,
    allowedWriteScopes: input.allowedWriteScopes,
  });
  if (scopeFailure) return scopeFailure;

  const npcRecord = hydrateStoredNpcRecord(npc, {
    currentLocationName: destination.locationName,
  });
  db.update(npcs)
    .set({
      ...projectNpcRecord({
        ...npcRecord,
        socialContext: {
          ...npcRecord.socialContext,
          currentLocationId: destination.locationId,
          currentLocationName: destination.locationName,
        },
      }),
      currentSceneLocationId: destination.locationId,
    })
    .where(eq(npcs.id, input.process.actorId))
    .run();

  const summary = action.summary
    ?? `${input.process.actor.name} travels from ${findLocationName(actorLocationId) ?? "their previous location"} to ${destination.locationName}.`;
  const surface = actorPlanSurface({
    locationRef: destination.locationId,
    surface: action.surface,
  });
  const eventIds = recordActorEvent({
    campaignId: input.campaignId,
    tick: input.tick,
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    locationRef: destination.locationId,
    eventType: "actor_plan_step",
    summary,
    importance: 3,
    surface: action.surface,
  });
  const clock = readWorldClock(input.campaignId);
  const stateDeltaRefs = [
    actorStateWriteScope(input.process.actorId),
    `location:${actorLocationId}:presence`,
    `location:${destination.locationId}:presence`,
    ...(
      eventIds.length > 0
        ? [`location:${destination.locationId}:recent_event`]
        : []
    ),
    ...(path.totalTravelCost > 0 ? ["world:time"] : []),
  ];
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "actor_plan:travel",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    elapsedWorldTimeMinutes: path.totalTravelCost,
    currentTick: input.tick,
    eventIds,
    stateDeltaRefs,
    metadata: {
      planId: input.process.state.activePlan?.id ?? null,
      pathLocationIds: path.locationIds,
      edgeIds: path.edgeIds,
      summary,
      surfaceRoute: surface.surfaceRoute,
      visibility: surface.visibility,
    },
  });
  const clockAfter = readWorldClock(input.campaignId);
  const processUpdate = updateProcess({
    process: input.process,
    resultWorldVersion: clockAfter.worldVersion,
    worldTimeMinutes: clockAfter.worldTimeMinutes,
    activePlan: null,
    reason: "deterministic_travel_completed",
  });
  assertActorPlanProcessUpdated({
    actorId: input.process.actorId,
    status: processUpdate.status,
  });

  return {
    status: "completed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary,
    authority,
    eventIds,
    stateDeltaRefs,
    surface,
    processUpdateStatus: processUpdate.status,
  };
}

function executeRecordEvent(input: ExecuteActorPlanStepInput): ExecuteActorPlanStepResult {
  const action = input.process.state.activePlan?.action;
  if (!action || action.kind !== "record_event") {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "deterministic event plan has no event action payload",
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const locationRef =
    action.locationRef
    ?? input.process.actor.currentSceneLocationId
    ?? input.process.actor.currentLocationId;
  const surface = actorPlanSurface({
    locationRef,
    surface: action.surface,
  });
  const plannedStateDeltaRefs = uniqueWriteScopes([
    actorStateWriteScope(input.process.actorId),
    locationRecentEventWriteScope({
      campaignId: input.campaignId,
      locationRef,
    }),
  ]);
  const scopeFailure = validateActorPlanWriteScopes({
    process: input.process,
    stateDeltaRefs: plannedStateDeltaRefs,
    allowedWriteScopes: input.allowedWriteScopes,
  });
  if (scopeFailure) return scopeFailure;
  const eventIds = recordActorEvent({
    campaignId: input.campaignId,
    tick: input.tick,
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    locationRef,
    eventType: "actor_plan_step",
    summary: action.summary,
    importance: action.importance ?? 3,
    surface: action.surface,
  });
  const clock = readWorldClock(input.campaignId);
  const stateDeltaRefs = [
    ...(
      eventIds.length > 0
        ? [locationRecentEventWriteScope({
            campaignId: input.campaignId,
            locationRef,
          })].filter((ref): ref is SimulationActorWriteScope => Boolean(ref))
        : []
    ),
    actorStateWriteScope(input.process.actorId),
  ];
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "actor_plan:record_event",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    elapsedWorldTimeMinutes: 0,
    currentTick: input.tick,
    eventIds,
    stateDeltaRefs,
    metadata: {
      planId: input.process.state.activePlan?.id ?? null,
      summary: action.summary,
      surfaceRoute: surface.surfaceRoute,
      visibility: surface.visibility,
    },
  });
  const clockAfter = readWorldClock(input.campaignId);
  const processUpdate = updateProcess({
    process: input.process,
    resultWorldVersion: clockAfter.worldVersion,
    worldTimeMinutes: clockAfter.worldTimeMinutes,
    activePlan: null,
    reason: "deterministic_event_recorded",
  });
  assertActorPlanProcessUpdated({
    actorId: input.process.actorId,
    status: processUpdate.status,
  });

  return {
    status: "completed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary: action.summary,
    authority,
    eventIds,
    stateDeltaRefs,
    surface,
    processUpdateStatus: processUpdate.status,
  };
}

function executeWait(input: ExecuteActorPlanStepInput): ExecuteActorPlanStepResult {
  const action = input.process.state.activePlan?.action;
  if (!action || action.kind !== "wait") {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "deterministic wait plan has no wait action payload",
      allowedWriteScopes: input.allowedWriteScopes,
    });
  }

  const summary = action.summary ?? `${input.process.actor.name} continues waiting.`;
  const clock = readWorldClock(input.campaignId);
  const duration = action.durationWorldTimeMinutes ?? 0;
  const stateDeltaRefs = uniqueWriteScopes([
    actorStateWriteScope(input.process.actorId),
    duration > 0 ? "world:time" : null,
  ]);
  const scopeFailure = validateActorPlanWriteScopes({
    process: input.process,
    stateDeltaRefs,
    allowedWriteScopes: input.allowedWriteScopes,
  });
  if (scopeFailure) return scopeFailure;
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "actor_plan:wait",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    elapsedWorldTimeMinutes: duration,
    currentTick: input.tick,
    stateDeltaRefs,
    metadata: {
      planId: input.process.state.activePlan?.id ?? null,
      summary,
    },
  });
  const clockAfter = readWorldClock(input.campaignId);
  const processUpdate = updateProcess({
    process: input.process,
    resultWorldVersion: clockAfter.worldVersion,
    worldTimeMinutes: clockAfter.worldTimeMinutes,
    activePlan: null,
    reason: "deterministic_wait_completed",
  });
  assertActorPlanProcessUpdated({
    actorId: input.process.actorId,
    status: processUpdate.status,
  });

  return {
    status: "completed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary,
    authority,
    eventIds: [],
    stateDeltaRefs,
    processUpdateStatus: processUpdate.status,
  };
}

function actorPlanProcessUpdateFailureResult(input: {
  process: KeyActorProcess;
  error: ActorPlanProcessUpdateError;
}): ExecuteActorPlanStepResult {
  return {
    status: input.error.status === "stale_rejected" ? "stale_rejected" : "failed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary: `Skipped deterministic plan for ${input.process.actor.name}: actor process update failed with ${input.error.status}.`,
    eventIds: [],
    stateDeltaRefs: [],
    failureReason: `actor_process_update_${input.error.status}`,
    processUpdateStatus: input.error.status,
  };
}

export function executeActorPlanStep(
  input: ExecuteActorPlanStepInput,
): ExecuteActorPlanStepResult {
  const clock = readWorldClock(input.campaignId);
  if (
    input.baseWorldVersion !== undefined
    && input.baseWorldVersion !== clock.worldVersion
  ) {
    return rejectStale({
      process: input.process,
      expected: input.baseWorldVersion,
      actual: clock.worldVersion,
    });
  }

  const plan = input.process.state.activePlan;
  if (!plan) {
    return {
      status: "waiting",
      actorId: input.process.actorId,
      actorName: input.process.actor.name,
      summary: "No active plan.",
      eventIds: [],
      stateDeltaRefs: [],
    };
  }

  if (!plan.deterministic) {
    return {
      status: "needs_decision",
      actorId: input.process.actorId,
      actorName: input.process.actor.name,
      summary: "Active plan requires an actor decision.",
      eventIds: [],
      stateDeltaRefs: [],
    };
  }

  if (input.process.state.interrupts.length > 0) {
    return {
      status: "needs_decision",
      actorId: input.process.actorId,
      actorName: input.process.actor.name,
      summary: "Active plan has interrupts and must be reconsidered.",
      eventIds: [],
      stateDeltaRefs: [],
    };
  }

  if (!plan.action) {
    try {
      return getDb().transaction(() => recordFailure({
        campaignId: input.campaignId,
        tick: input.tick,
        process: input.process,
        reason: "deterministic plan has no executable action payload",
        allowedWriteScopes: input.allowedWriteScopes,
      }));
    } catch (error) {
      if (error instanceof ActorPlanProcessUpdateError) {
        return actorPlanProcessUpdateFailureResult({
          process: input.process,
          error,
        });
      }
      throw error;
    }
  }

  try {
    return getDb().transaction(() => {
      switch (plan.action?.kind) {
        case "travel":
          return executeTravel(input);
        case "record_event":
          return executeRecordEvent(input);
        case "wait":
          return executeWait(input);
        default:
          throw new Error("deterministic_actor_plan_action_disappeared");
      }
    });
  } catch (error) {
    if (error instanceof ActorPlanProcessUpdateError) {
      return actorPlanProcessUpdateFailureResult({
        process: input.process,
        error,
      });
    }
    throw error;
  }
}
