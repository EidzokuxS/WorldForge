import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locations, npcs } from "../db/schema.js";
import {
  hydrateStoredNpcRecord,
  projectNpcRecord,
} from "../character/record-adapters.js";
import {
  KEY_ACTOR_DEFAULT_WAKE_DELAY_MINUTES,
  updateActorProcessAfterDecision,
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
}

export interface ExecuteActorPlanStepResult {
  status: ActorPlanExecutionStatus;
  actorId: string;
  actorName: string;
  summary: string;
  authority?: ToolResultAuthority;
  eventIds: string[];
  stateDeltaRefs: string[];
  failureReason?: string;
  replanProposalId?: string;
  processUpdateStatus?: ReturnType<typeof updateActorProcessAfterDecision>["status"];
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
}): string[] {
  const event = recordLocationRecentEvent({
    campaignId: input.campaignId,
    locationRef: input.locationRef,
    tick: input.tick,
    eventType: input.eventType,
    summary: input.summary,
    importance: input.importance ?? 3,
  });
  return event ? [event.id] : [];
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
}): ExecuteActorPlanStepResult {
  const clock = readWorldClock(input.campaignId);
  const locationRef = input.process.actor.currentSceneLocationId
    ?? input.process.actor.currentLocationId;
  const eventIds = recordActorEvent({
    campaignId: input.campaignId,
    tick: input.tick,
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    locationRef,
    eventType: "actor_plan_failure",
    summary: `${input.process.actor.name}'s offscreen plan stalls: ${input.reason}`,
    importance: 4,
  });
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "actor_plan:failure",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    elapsedWorldTimeMinutes: 0,
    currentTick: input.tick,
    eventIds,
    stateDeltaRefs: [`npc:${input.process.actorId}:process`],
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
    stateDeltaRefs: [`npc:${input.process.actorId}:process`],
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
    });
  }

  const actorLocationId = input.process.actor.currentLocationId;
  if (!actorLocationId) {
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "actor has no current location",
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
    });
  }

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
  const eventIds = recordActorEvent({
    campaignId: input.campaignId,
    tick: input.tick,
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    locationRef: destination.locationId,
    eventType: "actor_plan_step",
    summary,
    importance: 3,
  });
  const clock = readWorldClock(input.campaignId);
  const stateDeltaRefs = [
    `npc:${input.process.actorId}:location`,
    `location:${actorLocationId}:presence`,
    `location:${destination.locationId}:presence`,
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

  return {
    status: "completed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary,
    authority,
    eventIds,
    stateDeltaRefs,
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
    });
  }

  const locationRef =
    action.locationRef
    ?? input.process.actor.currentSceneLocationId
    ?? input.process.actor.currentLocationId;
  const eventIds = recordActorEvent({
    campaignId: input.campaignId,
    tick: input.tick,
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    locationRef,
    eventType: "actor_plan_step",
    summary: action.summary,
    importance: action.importance ?? 3,
  });
  const clock = readWorldClock(input.campaignId);
  const stateDeltaRefs = [`event:actor_plan_step`, `npc:${input.process.actorId}:process`];
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

  return {
    status: "completed",
    actorId: input.process.actorId,
    actorName: input.process.actor.name,
    summary: action.summary,
    authority,
    eventIds,
    stateDeltaRefs,
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
    });
  }

  const summary = action.summary ?? `${input.process.actor.name} continues waiting.`;
  const clock = readWorldClock(input.campaignId);
  const stateDeltaRefs = [`npc:${input.process.actorId}:process`];
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "actor_plan:wait",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "npc", id: input.process.actorId },
    elapsedWorldTimeMinutes: action.durationWorldTimeMinutes ?? 0,
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
    return recordFailure({
      campaignId: input.campaignId,
      tick: input.tick,
      process: input.process,
      reason: "deterministic plan has no executable action payload",
    });
  }

  switch (plan.action.kind) {
    case "travel":
      return executeTravel(input);
    case "record_event":
      return executeRecordEvent(input);
    case "wait":
      return executeWait(input);
  }
}
