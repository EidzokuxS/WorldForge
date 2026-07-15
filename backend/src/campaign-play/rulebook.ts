import {
  CAMPAIGN_PLAY_LIMITS,
  type CampaignPlaySetupPhase,
  type CampaignWorldReview,
} from "@worldforge/shared";
import {
  CAMPAIGN_PLAY_COMMAND_METADATA,
  rulebookCommandBatchSchema,
  type CampaignPlayCausalParent,
  type CampaignPlayEntityRef,
  type RulebookBatchCommand,
  type RulebookCommandBatch,
} from "./contracts.js";
import {
  canonicalizeCampaignPlayProjection,
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
  hashCampaignPlayProjection,
  projectCampaignPlayMechanicalTruth,
} from "./campaign-play-projection.js";
import type { CampaignPlayMutationContext } from "./campaign-play-state-repository.js";
import type {
  CampaignPlayHumanMechanicalIdentity,
  CampaignPlayLiveActorCondition,
  CampaignPlayLiveActorPossession,
  CampaignPlayLiveGoal,
  CampaignPlayLivePlacement,
  CampaignPlayLivePressureState,
  CampaignPlayLiveRelation,
  CampaignPlayLiveRouteState,
} from "./campaign-play-projection.js";

export type CampaignPlayRulebookPurpose =
  | "character_bootstrap"
  | "opening"
  | "player_action"
  | "actor_job";

export interface CampaignPlayRulebookFrame {
  campaignId: string;
  acceptedWorldVersion: number;
  acceptedContentHash: string;
  setupPhase: CampaignPlaySetupPhase;
  worldVersion: number;
  worldTimeMinutes: number | null;
  human: CampaignPlayHumanMechanicalIdentity | null;
  acceptedWorld: CampaignWorldReview;
  routeStates: CampaignPlayLiveRouteState[];
  actorConditions: CampaignPlayLiveActorCondition[];
  possessions: CampaignPlayLiveActorPossession[];
  pressureStates: CampaignPlayLivePressureState[];
  placements: CampaignPlayLivePlacement[];
  relations: CampaignPlayLiveRelation[];
  goals: CampaignPlayLiveGoal[];
}

export interface CampaignPlayRulebookAuthority {
  purpose: CampaignPlayRulebookPurpose;
  turnId: string | null;
  actorId: string | null;
  rootParent: CampaignPlayCausalParent;
  authorizedRefs: CampaignPlayEntityRef[];
  witnessActorIds: string[];
  knownWorldEventIds: string[];
}

export interface CampaignPlayRulebookPreflightInput {
  frame: CampaignPlayRulebookFrame;
  authority: CampaignPlayRulebookAuthority;
  batch: unknown;
}

export type CampaignPlayRulebookDenialCode =
  | "invalid_frame"
  | "invalid_authority"
  | "invalid_batch"
  | "stale_world_version"
  | "command_unavailable"
  | "invalid_source"
  | "invalid_causal_parent"
  | "unauthorized_reference"
  | "invalid_reference"
  | "invalid_read_scope"
  | "invalid_write_scope"
  | "precondition_failed"
  | "invalid_exposure"
  | "invalid_bootstrap_coverage";

export interface CampaignPlayRulebookDenial {
  code: CampaignPlayRulebookDenialCode;
  commandIndex: number | null;
  commandId: string | null;
  detail: string;
}

export interface CampaignPlayRulebookSimulation {
  worldVersion: number;
  worldTimeMinutes: number | null;
  human: CampaignPlayHumanMechanicalIdentity | null;
  routeStates: CampaignPlayLiveRouteState[];
  actorConditions: CampaignPlayLiveActorCondition[];
  possessions: CampaignPlayLiveActorPossession[];
  pressureStates: CampaignPlayLivePressureState[];
  placements: CampaignPlayLivePlacement[];
  relations: CampaignPlayLiveRelation[];
  goals: CampaignPlayLiveGoal[];
}

export type CampaignPlayRulebookPreflightResult =
  | {
      accepted: true;
      batch: RulebookCommandBatch;
      simulation: CampaignPlayRulebookSimulation;
      checkpoints: CampaignPlayRulebookSimulation[];
    }
  | { accepted: false; denial: CampaignPlayRulebookDenial };

const acceptedRulebookSeals = new WeakMap<object, string>();

function freezeRulebookValue<T>(value: T, seen = new Set<object>()): T {
  if (value === null || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value as Record<string, unknown>)) {
    freezeRulebookValue(child, seen);
  }
  return Object.freeze(value);
}

function acceptedRulebookSeal(
  batch: RulebookCommandBatch,
  checkpoints: CampaignPlayRulebookSimulation[],
): string {
  return hashCampaignPlayProjection({ batch, checkpoints });
}

class RulebookDenied extends Error {
  constructor(readonly denial: CampaignPlayRulebookDenial) {
    super(denial.code);
    this.name = "RulebookDenied";
  }
}

function deny(
  code: CampaignPlayRulebookDenialCode,
  detail: string,
  command?: RulebookBatchCommand,
  commandIndex: number | null = null,
): never {
  throw new RulebookDenied({
    code,
    commandIndex,
    commandId: command?.commandId ?? null,
    detail,
  });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function unique(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

function refKey(reference: CampaignPlayEntityRef): string {
  return `${reference.kind}\u0000${reference.id}`;
}

function refsEqual(
  actual: readonly CampaignPlayEntityRef[],
  expected: readonly CampaignPlayEntityRef[],
): boolean {
  return actual.length === expected.length
    && actual.every((reference, index) => refKey(reference) === refKey(expected[index]!));
}

function causalParentsEqual(
  left: CampaignPlayCausalParent,
  right: CampaignPlayCausalParent,
): boolean {
  if (left.kind !== right.kind) return false;
  switch (left.kind) {
    case "accepted_world": return right.kind === "accepted_world"
      && left.campaignId === right.campaignId
      && left.acceptedWorldVersion === right.acceptedWorldVersion
      && left.acceptedContentHash === right.acceptedContentHash;
    case "turn": return right.kind === "turn" && left.turnId === right.turnId;
    case "command": return right.kind === "command" && left.commandId === right.commandId;
    case "world_event": return right.kind === "world_event" && left.eventId === right.eventId;
    case "actor_job": return right.kind === "actor_job" && left.jobId === right.jobId;
  }
}

function ref(kind: CampaignPlayEntityRef["kind"], id: string): CampaignPlayEntityRef {
  return { kind, id };
}

function validFrame(frame: CampaignPlayRulebookFrame): boolean {
  const world = frame.acceptedWorld;
  const lowerHex = "0123456789abcdef";
  const validHash = (value: string) => value.length === 64
    && [...value].every((character) => lowerHex.includes(character));
  const validWorldTime = frame.worldTimeMinutes === null
    || (Number.isInteger(frame.worldTimeMinutes)
      && frame.worldTimeMinutes >= 0
      && frame.worldTimeMinutes <= CAMPAIGN_PLAY_LIMITS.worldTimeMinutes);
  const idsUnique = [
    frame.routeStates.map((row) => row.routeId),
    frame.actorConditions.map((row) => `${row.actorId}\u0000${row.condition}`),
    frame.possessions.map((row) => row.possessionId),
    frame.possessions.map((row) => `${row.actorId}\u0000${row.possessionKey}`),
    frame.pressureStates.map((row) => row.pressureId),
    frame.placements.map((row) => row.placementId),
    frame.relations.map((row) => row.relationId),
    frame.goals.map((row) => row.goalId),
  ].every(unique);
  const actorIds = new Set(world.actors.map((actor) => actor.id));
  if (frame.human) actorIds.add(frame.human.actorId);
  const locationIds = new Set(world.locations.map((location) => location.id));
  const relationById = new Map(world.relations.map((relation) => [relation.id, relation]));
  const goalById = new Map(world.goals.map((goal) => [goal.id, goal]));
  const acceptedPlacementById = new Map(world.placements.map((placement) => [placement.id, placement]));
  const acceptedPlacementIds = new Set(world.placements.map((placement) => placement.id));
  const pressureIds = [...world.pressures].map((pressure) => pressure.id).sort(compareText);
  const currentPressureIds = frame.pressureStates.map((pressure) => pressure.pressureId).sort(compareText);
  const playerPresent = frame.human !== null && frame.placements.some((placement) =>
    placement.actorId === frame.human!.actorId && placement.placementKind === "present");
  const playerPlacements = frame.human === null
    ? []
    : frame.placements.filter((placement) => placement.actorId === frame.human!.actorId);
  const expectedOpeningBaseVersion = frame.acceptedWorldVersion + 1;
  const expectedReadyMinimumVersion = expectedOpeningBaseVersion + 2 + world.pressures.length;
  const setupShapeValid = frame.setupPhase === "character_required"
    ? frame.human === null && frame.worldVersion === frame.acceptedWorldVersion
      && frame.worldTimeMinutes === null
      && frame.pressureStates.length === 0 && !playerPresent
    : frame.setupPhase === "opening_required"
      ? frame.human !== null && frame.worldVersion === expectedOpeningBaseVersion
        && frame.worldTimeMinutes === null && playerPlacements.length === 0
        && frame.pressureStates.length === 0
      : frame.human !== null && frame.worldVersion >= expectedReadyMinimumVersion
        && frame.worldTimeMinutes !== null && playerPlacements.length === 1 && playerPresent
        && JSON.stringify(currentPressureIds) === JSON.stringify(pressureIds);
  return world.status === "accepted"
    && world.acceptedAt !== null
    && world.campaignId === frame.campaignId
    && world.version === frame.acceptedWorldVersion
    && world.contentHash === frame.acceptedContentHash
    && Number.isInteger(frame.worldVersion)
    && frame.worldVersion >= frame.acceptedWorldVersion
    && validWorldTime
    && idsUnique
    && (frame.human === null || validHash(frame.human.recordHash))
    && (frame.human === null || !world.actors.some((candidate) => candidate.id === frame.human!.actorId))
    && frame.routeStates.every((row) => world.routes.some((route) => route.id === row.routeId))
    && frame.actorConditions.every((row) => actorIds.has(row.actorId)
      && row.summary.length > 0
      && row.summary.length <= CAMPAIGN_PLAY_LIMITS.shortText
      && row.summary === row.summary.trim())
    && frame.possessions.every((row) => actorIds.has(row.actorId)
      && row.name.length > 0
      && row.name.length <= CAMPAIGN_PLAY_LIMITS.name
      && row.name === row.name.trim()
      && row.possessionKey === deriveCampaignPlayPossessionKey(row.name)
      && row.possessionId === deriveCampaignPlayPossessionId(
        frame.campaignId,
        row.actorId,
        row.possessionKey,
      )
      && Number.isInteger(row.quantity)
      && row.quantity >= 0
      && row.quantity <= CAMPAIGN_PLAY_LIMITS.possessionQuantity)
    && frame.pressureStates.every((row) =>
      world.pressures.some((pressure) => pressure.id === row.pressureId)
      && Number.isInteger(row.progress)
      && row.progress >= 0
      && row.progress <= CAMPAIGN_PLAY_LIMITS.pressureProgress
      && (row.status === "resolved") === (row.progress === CAMPAIGN_PLAY_LIMITS.pressureProgress)
      && Number.isInteger(row.lastAdvancedWorldTimeMinutes)
      && row.lastAdvancedWorldTimeMinutes >= 0
      && frame.worldTimeMinutes !== null
      && row.lastAdvancedWorldTimeMinutes <= frame.worldTimeMinutes)
    && frame.placements.every((row) => {
      const accepted = acceptedPlacementById.get(row.placementId);
      return actorIds.has(row.actorId)
        && locationIds.has(row.locationId)
        && (row.placementKind === "present" || row.placementKind === "home")
        && (accepted
          ? accepted.actorId === row.actorId
            && accepted.placementKind === row.placementKind
            && (row.placementKind === "present" || accepted.locationId === row.locationId)
          : row.actorId === frame.human?.actorId && row.placementKind === "present");
    })
    && [...acceptedPlacementIds].every((placementId) =>
      frame.placements.some((row) => row.placementId === placementId))
    && unique(frame.placements
      .filter((placement) => placement.placementKind === "present")
      .map((placement) => placement.actorId))
    && frame.relations.length === world.relations.length
    && frame.relations.every((row) => {
      const accepted = relationById.get(row.relationId);
      return accepted?.sourceActorId === row.sourceActorId
        && accepted.targetActorId === row.targetActorId
        && accepted.relationType === row.relationType
        && Number.isInteger(row.intensity)
        && row.intensity >= 1
        && row.intensity <= 5
        && row.summary.length > 0
        && row.summary.length <= CAMPAIGN_PLAY_LIMITS.shortText
        && row.summary === row.summary.trim();
    })
    && frame.goals.length === world.goals.length
    && frame.goals.every((row) => {
      const accepted = goalById.get(row.goalId);
      return accepted?.actorId === row.actorId
        && accepted.objective === row.objective
        && accepted.motivation === row.motivation
        && accepted.priority === row.priority;
    })
    && world.pressures.every((pressure) =>
      pressure.actorIds.length + pressure.locationIds.length > 0
      && pressure.actorIds.every((actorId) => actorIds.has(actorId))
      && pressure.locationIds.every((locationId) => locationIds.has(locationId)))
    && setupShapeValid;
}

function expectedRoot(frame: CampaignPlayRulebookFrame, authority: CampaignPlayRulebookAuthority) {
  switch (authority.purpose) {
    case "character_bootstrap":
      return authority.turnId === null
        && authority.actorId === null
        && authority.rootParent.kind === "accepted_world"
        && authority.rootParent.campaignId === frame.campaignId
        && authority.rootParent.acceptedWorldVersion === frame.acceptedWorldVersion
        && authority.rootParent.acceptedContentHash === frame.acceptedContentHash;
    case "opening":
    case "player_action":
      return authority.turnId !== null
        && authority.actorId === frame.human?.actorId
        && authority.rootParent.kind === "turn"
        && authority.rootParent.turnId === authority.turnId;
    case "actor_job":
      return authority.turnId !== null
        && authority.actorId !== null
        && authority.rootParent.kind === "actor_job";
  }
}

function validateAuthority(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
): Set<string> {
  if (
    !expectedRoot(frame, authority)
    || !unique(authority.authorizedRefs.map(refKey))
    || !unique(authority.witnessActorIds)
    || !unique(authority.knownWorldEventIds)
    || !authority.witnessActorIds.every((actorId) =>
      authority.authorizedRefs.some((reference) =>
        reference.kind === "actor" && reference.id === actorId)
      && (frame.acceptedWorld.actors.some((candidate) => candidate.id === actorId)
        || actorId === frame.human?.actorId))
  ) {
    deny("invalid_authority", "Rulebook authority does not match its purpose.");
  }
  if (authority.purpose === "player_action") {
    if (frame.setupPhase !== "ready" || frame.worldTimeMinutes === null) {
      deny("invalid_authority", "Player actions require ready mechanical state.");
    }
  }
  if (authority.purpose === "actor_job") {
    const actor = frame.acceptedWorld.actors.find((candidate) => candidate.id === authority.actorId);
    if (
      frame.setupPhase !== "ready"
      || frame.worldTimeMinutes === null
      || !actor
      || actor.controller !== "agent"
    ) {
      deny("invalid_authority", "Actor jobs require one schedulable agent actor.");
    }
  }
  return new Set(authority.authorizedRefs.map(refKey));
}

function cloneSimulation(frame: CampaignPlayRulebookFrame): CampaignPlayRulebookSimulation {
  return {
    worldVersion: frame.worldVersion,
    worldTimeMinutes: frame.worldTimeMinutes,
    human: frame.human ? { ...frame.human } : null,
    routeStates: structuredClone(frame.routeStates),
    actorConditions: structuredClone(frame.actorConditions),
    possessions: structuredClone(frame.possessions),
    pressureStates: structuredClone(frame.pressureStates),
    placements: structuredClone(frame.placements),
    relations: structuredClone(frame.relations),
    goals: structuredClone(frame.goals),
  };
}

function actor(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  actorId: string,
) {
  const accepted = frame.acceptedWorld.actors.find((candidate) => candidate.id === actorId);
  if (accepted) return accepted;
  if (state.human?.actorId === actorId) {
    return {
      id: actorId,
      kind: "person" as const,
      controller: "human" as const,
      role: "player" as const,
    };
  }
  return null;
}

function entityExists(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  knownWorldEventIds: ReadonlySet<string>,
  reference: CampaignPlayEntityRef,
): boolean {
  switch (reference.kind) {
    case "actor": return actor(frame, state, reference.id) !== null;
    case "location": return frame.acceptedWorld.locations.some((row) => row.id === reference.id);
    case "route": return frame.acceptedWorld.routes.some((row) => row.id === reference.id);
    case "relation": return state.relations.some((row) => row.relationId === reference.id);
    case "goal": return state.goals.some((row) => row.goalId === reference.id);
    case "pressure": return frame.acceptedWorld.pressures.some((row) => row.id === reference.id);
    case "possession": return state.possessions.some((row) => row.possessionId === reference.id);
    case "world_event": return knownWorldEventIds.has(reference.id);
  }
}

function routeState(state: CampaignPlayRulebookSimulation, routeId: string) {
  return state.routeStates.find((row) => row.routeId === routeId)?.state ?? "open";
}

function commandEntityRefs(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): CampaignPlayEntityRef[] {
  switch (command.kind) {
    case "advance_world_time": return [];
    case "move_actor": return [
      ref("actor", command.actorId),
      ref("route", command.routeId),
      ref("location", command.fromLocationId),
      ref("location", command.toLocationId),
    ];
    case "set_route_state": return [ref("route", command.routeId)];
    case "set_actor_condition": return [ref("actor", command.actorId)];
    case "update_actor_relation": {
      const relation = state.relations.find((row) => row.relationId === command.relationId);
      return relation ? [
        ref("relation", command.relationId),
        ref("actor", relation.sourceActorId),
        ref("actor", relation.targetActorId),
      ] : [ref("relation", command.relationId)];
    }
    case "update_actor_goal": {
      const goal = state.goals.find((row) => row.goalId === command.goalId);
      return goal
        ? [ref("goal", command.goalId), ref("actor", goal.actorId)]
        : [ref("goal", command.goalId)];
    }
    case "advance_pressure": return [ref("pressure", command.pressureId)];
    case "adjust_actor_possession": return [
      ref("actor", command.actorId),
      ref("possession", command.possessionId),
      ...command.affectedRefs.filter((reference) =>
        reference.kind !== "actor" || reference.id !== command.actorId),
    ].filter((reference, index, values) =>
      values.findIndex((candidate) => refKey(candidate) === refKey(reference)) === index);
    case "record_world_event": return command.affectedRefs;
    case "create_player_actor": return [ref("actor", command.actorId)];
    case "initialize_player_placement": return [
      ref("actor", command.actorId),
      ref("location", command.locationId),
    ];
    case "initialize_world_time": return [];
    case "initialize_pressure_state": return [ref("pressure", command.pressureId)];
  }
}

function expectedScopes(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): { read: CampaignPlayEntityRef[]; write: CampaignPlayEntityRef[] } {
  const refs = commandEntityRefs(frame, state, command);
  switch (command.kind) {
    case "advance_world_time":
    case "initialize_world_time": return { read: [], write: [] };
    case "move_actor": return { read: refs, write: [refs[0]!, refs[2]!, refs[3]!] };
    case "set_route_state":
    case "set_actor_condition":
    case "advance_pressure":
    case "create_player_actor":
    case "initialize_pressure_state": return { read: command.kind === "create_player_actor" ? [] : refs, write: [refs[0]!] };
    case "update_actor_relation":
    case "update_actor_goal": return { read: refs, write: [refs[0]!] };
    case "adjust_actor_possession": return { read: refs, write: [refs[1]!] };
    case "record_world_event": return { read: refs, write: [] };
    case "initialize_player_placement": return { read: refs, write: refs };
  }
}

function exposureRefs(command: RulebookBatchCommand): CampaignPlayEntityRef[] {
  if (command.exposure.mode === "protected") return [];
  return command.exposure.predicates.map((predicate) => {
    switch (predicate.channel) {
      case "direct_perception":
      case "local_aftermath": return ref("location", predicate.locationId);
      case "route_state": return ref("route", predicate.routeId);
      case "witness_report": return ref("actor", predicate.witnessActorId);
    }
  });
}

function operativeActorLocations(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  actorId: string,
): string[] {
  return state.placements
    .filter((placement) =>
      placement.actorId === actorId && placement.placementKind === "present")
    .map((placement) => placement.locationId);
}

function exposureGrounding(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
): { locationIds: Set<string>; routeIds: Set<string>; actorIds: Set<string> } {
  const locationIds = new Set<string>();
  const routeIds = new Set<string>();
  const actorIds = new Set<string>();
  const addActor = (actorId: string) => {
    actorIds.add(actorId);
    operativeActorLocations(frame, state, actorId)
      .forEach((locationId) => locationIds.add(locationId));
  };
  const addRoute = (routeId: string) => {
    const route = frame.acceptedWorld.routes.find((candidate) => candidate.id === routeId);
    if (!route) return;
    routeIds.add(route.id);
    locationIds.add(route.fromLocationId);
    locationIds.add(route.toLocationId);
  };
  const addPressure = (pressureId: string) => {
    const pressure = frame.acceptedWorld.pressures.find((candidate) => candidate.id === pressureId);
    if (!pressure) return;
    pressure.locationIds.forEach((locationId) => locationIds.add(locationId));
    pressure.actorIds.forEach(addActor);
  };
  const addReference = (reference: CampaignPlayEntityRef) => {
    switch (reference.kind) {
      case "actor": addActor(reference.id); break;
      case "location": locationIds.add(reference.id); break;
      case "route": addRoute(reference.id); break;
      case "relation": {
        const relation = state.relations.find((candidate) => candidate.relationId === reference.id);
        if (relation) {
          addActor(relation.sourceActorId);
          addActor(relation.targetActorId);
        }
        break;
      }
      case "goal": {
        const goal = state.goals.find((candidate) => candidate.goalId === reference.id);
        if (goal) addActor(goal.actorId);
        break;
      }
      case "pressure": addPressure(reference.id); break;
      case "possession": {
        const possession = state.possessions.find((candidate) =>
          candidate.possessionId === reference.id);
        if (possession) addActor(possession.actorId);
        break;
      }
      case "world_event": break;
    }
  };
  switch (command.kind) {
    case "advance_world_time":
      if (command.source.kind === "actor") addActor(command.source.actorId);
      break;
    case "move_actor":
      addActor(command.actorId);
      addRoute(command.routeId);
      break;
    case "set_route_state": addRoute(command.routeId); break;
    case "set_actor_condition": addActor(command.actorId); break;
    case "update_actor_relation": addReference(ref("relation", command.relationId)); break;
    case "update_actor_goal": addReference(ref("goal", command.goalId)); break;
    case "advance_pressure": addPressure(command.pressureId); break;
    case "adjust_actor_possession": addActor(command.actorId); break;
    case "record_world_event": command.affectedRefs.forEach(addReference); break;
    case "create_player_actor": addActor(command.actorId); break;
    case "initialize_player_placement": locationIds.add(command.locationId); addActor(command.actorId); break;
    case "initialize_world_time": break;
    case "initialize_pressure_state": addPressure(command.pressureId); break;
  }
  return { locationIds, routeIds, actorIds };
}

function validateSource(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
  index: number,
): void {
  const source = command.source;
  const valid = authority.purpose === "character_bootstrap"
    ? source.kind === "system" && source.system === "character_bootstrap"
    : authority.purpose === "opening"
      ? source.kind === "system" && source.system === "opening_bootstrap"
      : authority.purpose === "player_action"
        ? (source.kind === "system" && source.system === "game_master")
          || (source.kind === "actor" && source.actorId === state.human?.actorId)
        : source.kind === "actor" && source.actorId === authority.actorId;
  if (!valid) deny("invalid_source", "Command source exceeds its admitted authority.", command, index);
  if (source.kind === "actor") {
    const sourceActor = actor(frame, state, source.actorId);
    if (!sourceActor) deny("invalid_source", "Command source actor does not exist.", command, index);
    if (state.actorConditions.some((condition) =>
      condition.actorId === source.actorId
      && condition.condition === "incapacitated"
      && condition.present)) {
      deny("precondition_failed", "An incapacitated actor cannot issue a command.", command, index);
    }
  }
}

function validateCausalParent(
  authority: CampaignPlayRulebookAuthority,
  commands: readonly RulebookBatchCommand[],
  command: RulebookBatchCommand,
  index: number,
): void {
  const expected = index === 0 || authority.purpose === "actor_job"
    ? authority.rootParent
    : { kind: "command" as const, commandId: commands[index - 1]!.commandId };
  if (!causalParentsEqual(command.causalParent, expected)) {
    deny("invalid_causal_parent", "Command causal lineage is not contiguous.", command, index);
  }
}

function validateRefsAndScopes(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  authorized: ReadonlySet<string>,
  knownEvents: ReadonlySet<string>,
  command: RulebookBatchCommand,
  index: number,
): void {
  const entityRefs = commandEntityRefs(frame, state, command);
  const allRefs = [...entityRefs, ...command.readScope, ...command.writeScope, ...exposureRefs(command)];
  const existingPossession = command.kind === "adjust_actor_possession"
    ? state.possessions.find((row) => row.possessionId === command.possessionId)
    : undefined;
  const grantedPossessionRef = command.kind === "adjust_actor_possession"
    && command.quantityDelta > 0
    && command.possessionKey === deriveCampaignPlayPossessionKey(command.name)
    && command.possessionId === deriveCampaignPlayPossessionId(
      frame.campaignId,
      command.actorId,
      command.possessionKey,
    )
    ? refKey(ref("possession", command.possessionId))
    : null;
  if (!allRefs.every((reference) =>
    refKey(reference) === grantedPossessionRef || authorized.has(refKey(reference)))) {
    deny("unauthorized_reference", "Command references an entity outside its frozen frame.", command, index);
  }
  const newPlayerRef = command.kind === "create_player_actor" ? refKey(ref("actor", command.actorId)) : null;
  if (!allRefs.every((reference) =>
    refKey(reference) === newPlayerRef
    || (existingPossession === undefined && refKey(reference) === grantedPossessionRef)
    || entityExists(frame, state, knownEvents, reference))) {
    deny("invalid_reference", "Command references an entity that does not exist.", command, index);
  }
  const scopes = expectedScopes(frame, state, command);
  if (!refsEqual(command.readScope, scopes.read)) {
    deny("invalid_read_scope", "Command read scope differs from its exact contract.", command, index);
  }
  if (!refsEqual(command.writeScope, scopes.write)) {
    deny("invalid_write_scope", "Command write scope differs from its exact contract.", command, index);
  }
  if (authority.purpose === "character_bootstrap" || authority.purpose === "opening") {
    if (command.exposure.mode !== "protected") {
      deny("invalid_exposure", "Bootstrap commands require protected exposure.", command, index);
    }
  }
  if (command.exposure.mode === "projectable") {
    const grounding = exposureGrounding(frame, state, command);
    const predicateKeys = new Set<string>();
    for (const predicate of command.exposure.predicates) {
      const exposureReference = exposureRefs({ ...command, exposure: {
        mode: "projectable",
        predicates: [predicate],
      }} as RulebookBatchCommand)[0]!;
      if (!entityExists(frame, state, knownEvents, exposureReference)) {
        deny("invalid_exposure", "Exposure anchor does not exist.", command, index);
      }
      const predicateKey = `${predicate.channel}\u0000${exposureReference.id}`;
      if (predicateKeys.has(predicateKey)) {
        deny("invalid_exposure", "Exposure predicates must be semantically unique.", command, index);
      }
      predicateKeys.add(predicateKey);
      if (
        (predicate.channel === "direct_perception" || predicate.channel === "local_aftermath")
        && !grounding.locationIds.has(predicate.locationId)
      ) {
        deny("invalid_exposure", "Location exposure is outside the command effect.", command, index);
      }
      if (predicate.channel === "route_state" && !grounding.routeIds.has(predicate.routeId)) {
        deny("invalid_exposure", "Route exposure is outside the command effect.", command, index);
      }
      if (
        predicate.channel === "witness_report"
        && (
          actor(frame, state, predicate.witnessActorId)?.kind !== "person"
          || !authority.witnessActorIds.includes(predicate.witnessActorId)
          || !operativeActorLocations(frame, state, predicate.witnessActorId).some((locationId) =>
            grounding.locationIds.has(locationId))
        )
      ) {
        deny("invalid_exposure", "Witness exposure requires a person at an affected location.", command, index);
      }
      if (
        predicate.channel === "local_aftermath"
        && (state.worldTimeMinutes === null
          || predicate.validUntilWorldTimeMinutes < state.worldTimeMinutes)
      ) {
        deny("invalid_exposure", "Local aftermath is already expired.", command, index);
      }
    }
  }
}

function actorJobOwns(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  authority: CampaignPlayRulebookAuthority,
  command: RulebookBatchCommand,
): boolean {
  if (authority.purpose !== "actor_job") return true;
  const actorId = authority.actorId!;
  const actorLocations = new Set(operativeActorLocations(frame, state, actorId));
  const sharesActorLocation = (targetActorId: string) =>
    operativeActorLocations(frame, state, targetActorId).some((locationId) =>
      actorLocations.has(locationId));
  switch (command.kind) {
    case "advance_world_time": return true;
    case "move_actor": return command.actorId === actorId;
    case "set_route_state": {
      const route = frame.acceptedWorld.routes.find((row) => row.id === command.routeId);
      return !!route && (actorLocations.has(route.fromLocationId) || actorLocations.has(route.toLocationId));
    }
    case "set_actor_condition": return sharesActorLocation(command.actorId);
    case "update_actor_relation": {
      const relation = state.relations.find((row) => row.relationId === command.relationId);
      return !!relation && (relation.sourceActorId === actorId || relation.targetActorId === actorId);
    }
    case "update_actor_goal": return state.goals.some((goal) =>
      goal.goalId === command.goalId && goal.actorId === actorId);
    case "advance_pressure": {
      const pressure = frame.acceptedWorld.pressures.find((row) => row.id === command.pressureId);
      return !!pressure && (pressure.actorIds.includes(actorId)
        || pressure.locationIds.some((locationId) => actorLocations.has(locationId)));
    }
    case "adjust_actor_possession": return command.actorId === actorId;
    case "record_world_event": return command.affectedRefs.some((reference) =>
      reference.kind === "actor" && reference.id === actorId);
    case "create_player_actor":
    case "initialize_player_placement":
    case "initialize_world_time":
    case "initialize_pressure_state": return false;
  }
}

function validateAvailability(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
  index: number,
): void {
  const bootstrap = !CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].modelVisible;
  if (
    (authority.purpose === "character_bootstrap" || authority.purpose === "opening") !== bootstrap
    || !actorJobOwns(frame, state, authority, command)
  ) {
    deny("command_unavailable", "Command kind is unavailable to this authority.", command, index);
  }
}

function applyCommand(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
  command: RulebookBatchCommand,
  index: number,
): void {
  switch (command.kind) {
    case "advance_world_time": {
      if (
        state.worldTimeMinutes === null
        || state.worldTimeMinutes + command.elapsedMinutes > CAMPAIGN_PLAY_LIMITS.worldTimeMinutes
      ) deny("precondition_failed", "World time cannot advance from this state.", command, index);
      state.worldTimeMinutes += command.elapsedMinutes;
      break;
    }
    case "move_actor": {
      const movingActor = actor(frame, state, command.actorId);
      const route = frame.acceptedWorld.routes.find((row) => row.id === command.routeId);
      const fromLocation = frame.acceptedWorld.locations.find((row) =>
        row.id === command.fromLocationId);
      const toLocation = frame.acceptedWorld.locations.find((row) =>
        row.id === command.toLocationId);
      const placement = state.placements.find((row) =>
        row.actorId === command.actorId && row.placementKind === "present");
      if (
        movingActor?.kind !== "person"
        || !route
        || fromLocation?.kind !== "persistent_sublocation"
        || toLocation?.kind !== "persistent_sublocation"
        || route.fromLocationId !== command.fromLocationId
        || route.toLocationId !== command.toLocationId
        || routeState(state, route.id) === "blocked"
        || placement?.locationId !== command.fromLocationId
        || state.actorConditions.some((condition) =>
          condition.actorId === command.actorId
          && condition.condition === "incapacitated"
          && condition.present)
      ) deny("precondition_failed", "Actor movement preconditions failed.", command, index);
      placement.locationId = command.toLocationId;
      break;
    }
    case "set_route_state": {
      const prior = routeState(state, command.routeId);
      if (prior === command.state) deny("precondition_failed", "Route state already has that value.", command, index);
      const row = state.routeStates.find((candidate) => candidate.routeId === command.routeId);
      if (row) row.state = command.state;
      else state.routeStates.push({ routeId: command.routeId, state: command.state });
      break;
    }
    case "set_actor_condition": {
      if (!actor(frame, state, command.actorId)) {
        deny("invalid_reference", "Actor condition target does not exist.", command, index);
      }
      const row = state.actorConditions.find((candidate) =>
        candidate.actorId === command.actorId && candidate.condition === command.condition);
      const present = row?.present ?? false;
      if ((command.operation === "set") === present) {
        deny("precondition_failed", "Actor condition operation has no valid transition.", command, index);
      }
      if (row) {
        row.present = command.operation === "set";
        row.summary = command.summary;
      } else {
        state.actorConditions.push({
          actorId: command.actorId,
          condition: command.condition,
          present: true,
          summary: command.summary,
        });
      }
      break;
    }
    case "update_actor_relation": {
      const relation = state.relations.find((row) => row.relationId === command.relationId);
      if (!relation || (relation.intensity === command.intensity && relation.summary === command.summary)) {
        deny("precondition_failed", "Relation update has no valid transition.", command, index);
      }
      relation.intensity = command.intensity;
      relation.summary = command.summary;
      break;
    }
    case "update_actor_goal": {
      const goal = state.goals.find((row) => row.goalId === command.goalId);
      if (!goal || goal.status === "completed" || goal.status === command.status) {
        deny("precondition_failed", "Goal status transition is invalid.", command, index);
      }
      goal.status = command.status;
      break;
    }
    case "advance_pressure": {
      const pressure = frame.acceptedWorld.pressures.find((row) => row.id === command.pressureId);
      const stateRow = state.pressureStates.find((row) => row.pressureId === command.pressureId);
      if (!pressure || !stateRow || stateRow.status !== "active") {
        deny("precondition_failed", "Pressure is unavailable for advancement.", command, index);
      }
      const result = Math.min(CAMPAIGN_PLAY_LIMITS.pressureProgress, stateRow.progress + command.amount);
      const expectedStatus = result === CAMPAIGN_PLAY_LIMITS.pressureProgress ? "resolved" : "active";
      if (command.resultStatus !== expectedStatus) {
        deny("precondition_failed", "Pressure result status does not match its progress.", command, index);
      }
      stateRow.progress = result;
      stateRow.status = expectedStatus;
      stateRow.lastAdvancedWorldTimeMinutes = state.worldTimeMinutes!;
      break;
    }
    case "adjust_actor_possession": {
      if (!actor(frame, state, command.actorId)) {
        deny("invalid_reference", "Possession owner does not exist.", command, index);
      }
      const expectedKey = deriveCampaignPlayPossessionKey(command.name);
      const expectedId = deriveCampaignPlayPossessionId(
        frame.campaignId,
        command.actorId,
        expectedKey,
      );
      const row = state.possessions.find((candidate) =>
        candidate.possessionId === command.possessionId);
      if (
        command.possessionKey !== expectedKey
        || command.possessionId !== expectedId
        || (row !== undefined && (
          row.actorId !== command.actorId
          || row.possessionKey !== command.possessionKey
          || row.name !== command.name
        ))
      ) {
        deny("precondition_failed", "Possession identity does not match its owner and name.", command, index);
      }
      const priorQuantity = row?.quantity ?? 0;
      const resultQuantity = priorQuantity + command.quantityDelta;
      if (
        resultQuantity < 0
        || resultQuantity > CAMPAIGN_PLAY_LIMITS.possessionQuantity
        || (!row && command.quantityDelta <= 0)
      ) {
        deny("precondition_failed", "Possession quantity transition is unavailable.", command, index);
      }
      if (row) row.quantity = resultQuantity;
      else state.possessions.push({
        possessionId: command.possessionId,
        actorId: command.actorId,
        possessionKey: command.possessionKey,
        name: command.name,
        quantity: resultQuantity,
      });
      break;
    }
    case "record_world_event": {
      if (!unique(command.affectedRefs.map(refKey))) {
        deny("precondition_failed", "World event affected references must be unique.", command, index);
      }
      break;
    }
    case "create_player_actor": {
      if (
        frame.setupPhase !== "character_required"
        || state.human !== null
        || actor(frame, state, command.actorId) !== null
      ) deny("precondition_failed", "Player actor already exists or phase is closed.", command, index);
      state.human = { actorId: command.actorId, recordHash: command.characterDigest };
      break;
    }
    case "initialize_player_placement": {
      const player = actor(frame, state, command.actorId);
      const location = frame.acceptedWorld.locations.find((row) => row.id === command.locationId);
      const placementId = `opening-placement:${command.actorId}`;
      if (
        frame.setupPhase !== "opening_required"
        || player?.controller !== "human"
        || player.role !== "player"
        || location?.kind !== "persistent_sublocation"
        || state.placements.some((row) => row.actorId === command.actorId)
        || state.placements.some((row) => row.placementId === placementId)
      ) deny("precondition_failed", "Player placement initialization is invalid.", command, index);
      state.placements.push({
        placementId,
        actorId: command.actorId,
        locationId: command.locationId,
        placementKind: "present",
      });
      break;
    }
    case "initialize_world_time": {
      if (frame.setupPhase !== "opening_required" || state.worldTimeMinutes !== null || command.worldTimeMinutes !== 0) {
        deny("precondition_failed", "Opening world clock must initialize exactly once at zero.", command, index);
      }
      state.worldTimeMinutes = 0;
      break;
    }
    case "initialize_pressure_state": {
      if (
        frame.setupPhase !== "opening_required"
        || !frame.acceptedWorld.pressures.some((row) => row.id === command.pressureId)
        || state.pressureStates.some((row) => row.pressureId === command.pressureId)
        || command.progress !== 0
        || command.status !== "active"
      ) deny("precondition_failed", "Pressure state initialization is invalid.", command, index);
      state.pressureStates.push({
        pressureId: command.pressureId,
        progress: 0,
        status: "active",
        lastAdvancedWorldTimeMinutes: 0,
      });
      break;
    }
  }
  if (CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation) {
    state.worldVersion += 1;
  }
}

function validateBootstrapCoverage(
  frame: CampaignPlayRulebookFrame,
  authority: CampaignPlayRulebookAuthority,
  commands: readonly RulebookBatchCommand[],
): void {
  if (authority.purpose === "character_bootstrap") {
    if (commands.length !== 1 || commands[0]?.kind !== "create_player_actor") {
      deny("invalid_bootstrap_coverage", "Character bootstrap requires exactly one player command.");
    }
    return;
  }
  if (authority.purpose !== "opening") return;
  const placements = commands.filter((command) => command.kind === "initialize_player_placement");
  const clocks = commands.filter((command) => command.kind === "initialize_world_time");
  const pressures = commands.filter((command) => command.kind === "initialize_pressure_state");
  const expectedPressureIds = [...frame.acceptedWorld.pressures].map((pressure) => pressure.id).sort(compareText);
  const actualPressureIds = pressures.map((command) => command.pressureId).sort(compareText);
  if (
    placements.length !== 1
    || clocks.length !== 1
    || commands.length !== 2 + expectedPressureIds.length
    || JSON.stringify(actualPressureIds) !== JSON.stringify(expectedPressureIds)
  ) {
    deny("invalid_bootstrap_coverage", "Opening bootstrap must initialize placement, clock, and every pressure exactly once.");
  }
}

function sortSimulation(state: CampaignPlayRulebookSimulation): void {
  state.routeStates.sort((left, right) => compareText(left.routeId, right.routeId));
  state.actorConditions.sort((left, right) =>
    compareText(`${left.actorId}\u0000${left.condition}`, `${right.actorId}\u0000${right.condition}`));
  state.possessions.sort((left, right) => compareText(left.possessionId, right.possessionId));
  state.pressureStates.sort((left, right) => compareText(left.pressureId, right.pressureId));
  state.placements.sort((left, right) => compareText(left.placementId, right.placementId));
  state.relations.sort((left, right) => compareText(left.relationId, right.relationId));
  state.goals.sort((left, right) => compareText(left.goalId, right.goalId));
}

function snapshotSimulation(
  state: CampaignPlayRulebookSimulation,
): CampaignPlayRulebookSimulation {
  return {
    worldVersion: state.worldVersion,
    worldTimeMinutes: state.worldTimeMinutes,
    human: state.human === null ? null : { ...state.human },
    routeStates: state.routeStates.map((row) => ({ ...row })),
    actorConditions: state.actorConditions.map((row) => ({ ...row })),
    possessions: state.possessions.map((row) => ({ ...row })),
    pressureStates: state.pressureStates.map((row) => ({ ...row })),
    placements: state.placements.map((row) => ({ ...row })),
    relations: state.relations.map((row) => ({ ...row })),
    goals: state.goals.map((row) => ({ ...row })),
  };
}

export function preflightCampaignPlayRulebook(
  input: CampaignPlayRulebookPreflightInput,
): CampaignPlayRulebookPreflightResult {
  try {
    if (!validFrame(input.frame)) deny("invalid_frame", "Mechanical frame is inconsistent.");
    const authorized = validateAuthority(input.frame, input.authority);
    const parsed = rulebookCommandBatchSchema.safeParse(input.batch);
    if (!parsed.success) deny("invalid_batch", "Command batch violates the strict contract.");
    const batch = parsed.data;
    if (batch.baseWorldVersion !== input.frame.worldVersion) {
      deny("stale_world_version", "Command batch base version is stale.");
    }
    validateBootstrapCoverage(input.frame, input.authority, batch.commands);
    const state = cloneSimulation(input.frame);
    const checkpoints: CampaignPlayRulebookSimulation[] = [snapshotSimulation(state)];
    const knownEvents = new Set(input.authority.knownWorldEventIds);
    for (const [index, command] of batch.commands.entries()) {
      validateAvailability(input.frame, input.authority, state, command, index);
      validateSource(input.frame, input.authority, state, command, index);
      validateCausalParent(input.authority, batch.commands, command, index);
      validateRefsAndScopes(
        input.frame,
        input.authority,
        state,
        authorized,
        knownEvents,
        command,
        index,
      );
      applyCommand(input.frame, state, command, index);
      sortSimulation(state);
      checkpoints.push(snapshotSimulation(state));
    }
    sortSimulation(state);
    const result = { accepted: true as const, batch, simulation: state, checkpoints };
    acceptedRulebookSeals.set(result, acceptedRulebookSeal(batch, checkpoints));
    return freezeRulebookValue(result);
  } catch (error) {
    if (error instanceof RulebookDenied) return { accepted: false, denial: error.denial };
    throw error;
  }
}

export type CampaignPlayRulebookFaultPoint =
  | { kind: "before_command"; commandIndex: number }
  | { kind: "after_command"; commandIndex: number }
  | { kind: "before_commit"; commandIndex: null };

type AcceptedRulebookBatch = Extract<
  CampaignPlayRulebookPreflightResult,
  { accepted: true }
>;

export interface ExecuteCampaignPlayRulebookInput {
  frame: CampaignPlayRulebookFrame;
  accepted: AcceptedRulebookBatch;
  context: CampaignPlayMutationContext;
  turnId: string | null;
  createdAt: number;
  persistPlayerCharacter?: (
    context: CampaignPlayMutationContext,
    command: Extract<RulebookBatchCommand, { kind: "create_player_actor" }>,
  ) => void;
  injectFault?: (point: CampaignPlayRulebookFaultPoint) => void;
}

export interface ExecutedCampaignPlayRulebookBatch {
  batchId: string;
  commandIds: string[];
  receiptIds: string[];
  eventIds: string[];
  priorWorldVersion: number;
  resultWorldVersion: number;
  resultWorldHash: string;
}

export class CampaignPlayRulebookExecutionError extends Error {
  constructor(
    readonly code:
      | "execution_contract_invalid"
      | "player_character_writer_required"
      | "mechanical_hash_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "CampaignPlayRulebookExecutionError";
  }
}

function stableRulebookId(prefix: string, value: unknown): string {
  return `${prefix}:${hashCampaignPlayProjection(value).slice(0, 32)}`;
}

export function deriveCampaignPlayReceiptId(
  campaignId: string,
  turnId: string | null,
  batchId: string,
  commandOrder: number,
): string {
  return stableRulebookId("receipt", { campaignId, turnId, batchId, commandOrder });
}

export function deriveCampaignPlayCommandId(
  campaignId: string,
  turnId: string | null,
  batchId: string,
  commandOrder: number,
): string {
  return stableRulebookId("command", { campaignId, turnId, batchId, commandOrder });
}

function deriveCampaignPlayEventId(
  campaignId: string,
  turnId: string | null,
  batchId: string,
  commandOrder: number,
): string {
  return stableRulebookId("event", { campaignId, turnId, batchId, commandOrder });
}

function commandArguments(command: RulebookBatchCommand): Record<string, unknown> {
  const result = { ...command } as Record<string, unknown>;
  for (const key of [
    "commandId", "batchId", "order", "causalParent", "source",
    "expectedWorldVersion", "readScope", "writeScope", "exposure",
  ]) delete result[key];
  return result;
}

function mechanicalHash(
  frame: CampaignPlayRulebookFrame,
  state: CampaignPlayRulebookSimulation,
): string {
  const acceptedPlacements = frame.acceptedWorld.placements.map((row) => ({
    placementId: row.id,
    actorId: row.actorId,
    locationId: row.locationId,
    placementKind: row.placementKind,
  }));
  const acceptedRelations = frame.acceptedWorld.relations.map((row) => ({
    relationId: row.id,
    sourceActorId: row.sourceActorId,
    targetActorId: row.targetActorId,
    relationType: row.relationType,
    intensity: row.intensity,
    summary: row.summary,
  }));
  const acceptedGoals = frame.acceptedWorld.goals.map((row) => ({
    goalId: row.id,
    actorId: row.actorId,
    status: row.status,
    priority: row.priority,
    objective: row.objective,
    motivation: row.motivation,
  }));
  const unchanged = (left: unknown, right: unknown) =>
    canonicalizeCampaignPlayProjection(left) === canonicalizeCampaignPlayProjection(right);
  const acceptedBaseRowsUnchanged =
    unchanged(state.placements, acceptedPlacements)
    && unchanged(state.relations, acceptedRelations)
    && unchanged(state.goals, acceptedGoals);
  return projectCampaignPlayMechanicalTruth({
    acceptedReview: frame.acceptedWorld,
    worldTimeMinutes: state.worldTimeMinutes,
    human: state.human,
    routeStates: state.routeStates,
    actorConditions: state.actorConditions,
    possessions: state.possessions,
    pressureStates: state.pressureStates,
    placements: acceptedBaseRowsUnchanged ? [] : state.placements,
    relations: acceptedBaseRowsUnchanged ? [] : state.relations,
    goals: acceptedBaseRowsUnchanged ? [] : state.goals,
  }).hash;
}

function eventKind(command: RulebookBatchCommand): string {
  switch (command.kind) {
    case "advance_world_time": return "world_time_advanced";
    case "move_actor": return "actor_moved";
    case "set_route_state": return "route_state_changed";
    case "set_actor_condition": return "actor_condition_changed";
    case "update_actor_relation": return "actor_relation_changed";
    case "update_actor_goal": return "actor_goal_changed";
    case "advance_pressure": return "pressure_advanced";
    case "adjust_actor_possession": return "actor_possession_adjusted";
    case "record_world_event": return "scene_recorded";
    case "create_player_actor": return "player_actor_created";
    case "initialize_player_placement": return "player_placement_initialized";
    case "initialize_world_time": return "world_time_initialized";
    case "initialize_pressure_state": return "pressure_initialized";
  }
}

function eventAffectedRefs(
  frame: CampaignPlayRulebookFrame,
  command: RulebookBatchCommand,
  before: CampaignPlayRulebookSimulation,
  after: CampaignPlayRulebookSimulation,
): CampaignPlayEntityRef[] {
  if (command.kind === "record_world_event") return command.affectedRefs;
  if (command.kind === "adjust_actor_possession") return commandEntityRefs(frame, after, command);
  const refs = command.writeScope.length > 0 ? command.writeScope : command.readScope;
  if (refs.length > 0) return refs;
  if (command.source.kind === "actor") return [ref("actor", command.source.actorId)];
  const humanActorId = after.human?.actorId ?? before.human?.actorId;
  if (humanActorId) return [ref("actor", humanActorId)];
  throw new CampaignPlayRulebookExecutionError(
    "execution_contract_invalid",
    `Command ${command.commandId} has no durable affected entity.`,
  );
}

function applyStoredMutation(
  input: ExecuteCampaignPlayRulebookInput,
  command: RulebookBatchCommand,
  receiptId: string,
  resultWorldVersion: number,
): void {
  const { sqlite, campaignId } = input.context;
  switch (command.kind) {
    case "advance_world_time":
      sqlite.prepare(`UPDATE campaign_play_states SET world_time_minutes = world_time_minutes + ? WHERE campaign_id = ?`)
        .run(command.elapsedMinutes, campaignId);
      return;
    case "move_actor":
      sqlite.prepare(`UPDATE actor_placements SET location_id = ? WHERE campaign_id = ? AND actor_id = ? AND placement_kind = 'present' AND location_id = ?`)
        .run(command.toLocationId, campaignId, command.actorId, command.fromLocationId);
      return;
    case "set_route_state":
      sqlite.prepare(`INSERT INTO campaign_play_route_states (route_id, campaign_id, state, causal_receipt_id, world_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(route_id) DO UPDATE SET state = excluded.state, causal_receipt_id = excluded.causal_receipt_id,
          world_version = excluded.world_version, updated_at = excluded.updated_at`)
        .run(command.routeId, campaignId, command.state, receiptId, resultWorldVersion, input.createdAt);
      return;
    case "set_actor_condition":
      sqlite.prepare(`INSERT INTO campaign_play_actor_conditions
        (actor_id, campaign_id, condition, present, summary, causal_receipt_id, world_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(actor_id, condition) DO UPDATE SET present = excluded.present, summary = excluded.summary,
          causal_receipt_id = excluded.causal_receipt_id, world_version = excluded.world_version,
          updated_at = excluded.updated_at`)
        .run(command.actorId, campaignId, command.condition, command.operation === "set" ? 1 : 0,
          command.summary, receiptId, resultWorldVersion, input.createdAt);
      return;
    case "update_actor_relation":
      sqlite.prepare(`UPDATE actor_relations SET intensity = ?, summary = ? WHERE id = ? AND campaign_id = ?`)
        .run(command.intensity, command.summary, command.relationId, campaignId);
      return;
    case "update_actor_goal":
      sqlite.prepare(`UPDATE actor_goals SET status = ? WHERE id = ? AND campaign_id = ?`)
        .run(command.status, command.goalId, campaignId);
      return;
    case "advance_pressure": {
      sqlite.prepare(`UPDATE campaign_play_pressure_states SET
        progress = min(100, progress + ?), status = ?, last_advanced_world_time_minutes =
          (SELECT world_time_minutes FROM campaign_play_states WHERE campaign_id = ?),
        causal_receipt_id = ?, world_version = ?, updated_at = ?
        WHERE pressure_id = ? AND campaign_id = ?`)
        .run(command.amount, command.resultStatus, campaignId, receiptId, resultWorldVersion,
          input.createdAt, command.pressureId, campaignId);
      return;
    }
    case "adjust_actor_possession": {
      const exists = sqlite.prepare(`SELECT 1 FROM campaign_play_actor_possessions
        WHERE possession_id = ? AND campaign_id = ?`).get(command.possessionId, campaignId);
      if (exists) {
        sqlite.prepare(`UPDATE campaign_play_actor_possessions SET
          quantity = quantity + ?, causal_receipt_id = ?, world_version = ?, updated_at = ?
          WHERE possession_id = ? AND campaign_id = ?`)
          .run(command.quantityDelta, receiptId, resultWorldVersion, input.createdAt,
            command.possessionId, campaignId);
      } else {
        sqlite.prepare(`INSERT INTO campaign_play_actor_possessions
          (possession_id, campaign_id, actor_id, possession_key, name, quantity,
            causal_receipt_id, world_version, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(command.possessionId, campaignId, command.actorId, command.possessionKey,
            command.name, command.quantityDelta, receiptId, resultWorldVersion, input.createdAt);
      }
      return;
    }
    case "record_world_event": return;
    case "create_player_actor":
      sqlite.prepare(`INSERT INTO actors
        (id, campaign_id, kind, controller, role, name, summary, traits, tags)
        VALUES (?, ?, 'person', 'human', 'player', ?, ?, ?, ?)`)
        .run(command.actorId, campaignId, command.name, command.summary,
          canonicalizeCampaignPlayProjection(command.traits),
          canonicalizeCampaignPlayProjection(command.tags));
      if (!input.persistPlayerCharacter) {
        throw new CampaignPlayRulebookExecutionError(
          "player_character_writer_required",
          "Player creation requires its CharacterRecord writer inside the same transaction.",
        );
      }
      input.persistPlayerCharacter(input.context, command);
      sqlite.prepare(`UPDATE campaign_play_states SET setup_phase = 'opening_required' WHERE campaign_id = ?`)
        .run(campaignId);
      return;
    case "initialize_player_placement":
      sqlite.prepare(`INSERT INTO actor_placements (id, campaign_id, actor_id, location_id, placement_kind)
        VALUES (?, ?, ?, ?, 'present')`)
        .run(`opening-placement:${command.actorId}`, campaignId, command.actorId, command.locationId);
      return;
    case "initialize_world_time":
      sqlite.prepare(`UPDATE campaign_play_states SET world_time_minutes = ? WHERE campaign_id = ?`)
        .run(command.worldTimeMinutes, campaignId);
      return;
    case "initialize_pressure_state":
      sqlite.prepare(`INSERT INTO campaign_play_pressure_states
        (pressure_id, campaign_id, progress, status, last_advanced_world_time_minutes,
          causal_receipt_id, world_version, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
        .run(command.pressureId, campaignId, command.progress, command.status,
          input.accepted.checkpoints[command.order + 1]!.worldTimeMinutes,
          receiptId, resultWorldVersion, input.createdAt);
      return;
  }
}

export function executeCampaignPlayRulebookBatch(
  input: ExecuteCampaignPlayRulebookInput,
): ExecutedCampaignPlayRulebookBatch {
  const { accepted, context, frame, turnId, createdAt } = input;
  const mutationCount = accepted.batch.commands.filter((command) =>
    CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation).length;
  const createsPlayer = accepted.batch.commands.some((command) =>
    command.kind === "create_player_actor");
  if (
    accepted.checkpoints.length !== accepted.batch.commands.length + 1
    || acceptedRulebookSeals.get(accepted) !== acceptedRulebookSeal(
      accepted.batch,
      accepted.checkpoints,
    )
    || context.campaignId !== frame.campaignId
    || context.priorWorldVersion !== accepted.batch.baseWorldVersion
    || context.targetWorldVersion !== context.priorWorldVersion + mutationCount
    || (createsPlayer ? turnId !== null : turnId === null)
  ) {
    throw new CampaignPlayRulebookExecutionError(
      "execution_contract_invalid",
      "Rulebook execution context does not match its accepted batch.",
    );
  }

  const receiptIds: string[] = [];
  const eventIds: string[] = [];
  let priorHash = mechanicalHash(frame, accepted.checkpoints[0]!);
  if (priorHash !== context.mechanicalHash()) {
    throw new CampaignPlayRulebookExecutionError(
      "mechanical_hash_mismatch",
      "Rulebook base hash differs from persisted mechanical truth.",
    );
  }

  for (const [index, command] of accepted.batch.commands.entries()) {
    input.injectFault?.({ kind: "before_command", commandIndex: index });
    const expectedCommandId = deriveCampaignPlayCommandId(
      frame.campaignId,
      command.kind === "create_player_actor" ? null : turnId,
      accepted.batch.batchId,
      index,
    );
    if (command.commandId !== expectedCommandId) {
      throw new CampaignPlayRulebookExecutionError(
        "execution_contract_invalid",
        `Command ${index} does not carry its code-owned deterministic identity.`,
      );
    }
    const before = accepted.checkpoints[index]!;
    const after = accepted.checkpoints[index + 1]!;
    const mutates = CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation;
    const resultHash = mutates ? mechanicalHash(frame, after) : priorHash;
    const receiptId = deriveCampaignPlayReceiptId(frame.campaignId, turnId, accepted.batch.batchId, index);
    const causalEventId = deriveCampaignPlayEventId(frame.campaignId, turnId, accepted.batch.batchId, index);
    const argumentsPayload = commandArguments(command);
    const commandPayloadJson = canonicalizeCampaignPlayProjection(argumentsPayload);
    const sourceJson = canonicalizeCampaignPlayProjection(command.source);
    const eventPayload = { before, after };
    const parentEventId = command.causalParent.kind === "world_event"
      ? command.causalParent.eventId
      : command.causalParent.kind === "command"
        ? eventIds[command.order - 1] ?? null
        : null;

    context.sqlite.prepare(`INSERT INTO campaign_play_commands
      (command_id, campaign_id, turn_id, batch_id, command_order, command_kind,
        causal_parent_json, source_json, expected_world_version, read_scope_json,
        write_scope_json, exposure_policy_json, arguments_hash, protected_payload_json,
        protected_payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(command.commandId, frame.campaignId, command.kind === "create_player_actor" ? null : turnId,
        accepted.batch.batchId, index, command.kind,
        canonicalizeCampaignPlayProjection(command.causalParent), sourceJson,
        command.expectedWorldVersion, canonicalizeCampaignPlayProjection(command.readScope),
        canonicalizeCampaignPlayProjection(command.writeScope),
        canonicalizeCampaignPlayProjection(command.exposure),
        hashCampaignPlayProjection(argumentsPayload),
        commandPayloadJson,
        hashCampaignPlayProjection(argumentsPayload),
        createdAt);

    if (command.kind === "create_player_actor") {
      applyStoredMutation(input, command, receiptId, after.worldVersion);
    }
    context.sqlite.prepare(`INSERT INTO campaign_play_receipts
      (receipt_id, campaign_id, turn_id, command_id, command_kind, outcome,
        applied_world_mutation, prior_world_version, result_world_version,
        prior_world_hash, result_world_hash, causal_event_ids_json,
        protected_payload_json, protected_payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, 'applied', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(receiptId, frame.campaignId, command.kind === "create_player_actor" ? null : turnId,
        command.commandId, command.kind, mutates ? 1 : 0, before.worldVersion, after.worldVersion,
        priorHash, resultHash, canonicalizeCampaignPlayProjection([causalEventId]),
        commandPayloadJson,
        hashCampaignPlayProjection(argumentsPayload),
        createdAt);

    if (command.kind === "adjust_actor_possession") {
      applyStoredMutation(input, command, receiptId, after.worldVersion);
    }

    const affectedRefs = eventAffectedRefs(input.frame, command, before, after);
    context.sqlite.prepare(`INSERT INTO campaign_play_events
      (event_id, campaign_id, turn_id, command_id, receipt_id, parent_event_id,
        event_kind, source_json, world_time_minutes, world_version, affected_refs_json,
        before_payload_json, after_payload_json, payload_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(causalEventId, frame.campaignId, command.kind === "create_player_actor" ? null : turnId,
        command.commandId, receiptId, parentEventId, eventKind(command), sourceJson,
        after.worldTimeMinutes ?? 0, after.worldVersion,
        canonicalizeCampaignPlayProjection(affectedRefs),
        canonicalizeCampaignPlayProjection(eventPayload.before),
        canonicalizeCampaignPlayProjection(eventPayload.after),
        hashCampaignPlayProjection(eventPayload),
        createdAt);

    if (command.exposure.mode === "projectable") {
      for (const [exposureIndex, predicate] of command.exposure.predicates.entries()) {
        const exposureId = stableRulebookId("exposure", {
          campaignId: frame.campaignId,
          eventId: causalEventId,
          exposureIndex,
        });
        context.sqlite.prepare(`INSERT INTO campaign_play_event_exposures
          (exposure_id, campaign_id, event_id, channel, location_id, route_id,
            witness_actor_id, valid_until_world_time_minutes, route_triggers_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(exposureId, frame.campaignId, causalEventId, predicate.channel,
            "locationId" in predicate ? predicate.locationId : null,
            "routeId" in predicate ? predicate.routeId : null,
            "witnessActorId" in predicate ? predicate.witnessActorId : null,
            "validUntilWorldTimeMinutes" in predicate ? predicate.validUntilWorldTimeMinutes : null,
            "triggers" in predicate ? canonicalizeCampaignPlayProjection(predicate.triggers) : null,
            createdAt);
      }
    }
    if (command.kind !== "create_player_actor" && command.kind !== "adjust_actor_possession") {
      applyStoredMutation(input, command, receiptId, after.worldVersion);
    }
    const observedHash = context.mechanicalHash();
    if (observedHash !== resultHash) {
      throw new CampaignPlayRulebookExecutionError(
        "mechanical_hash_mismatch",
        `Command ${command.commandId} produced a mechanical hash outside its accepted checkpoint.`,
      );
    }
    priorHash = resultHash;
    receiptIds.push(receiptId);
    eventIds.push(causalEventId);
    input.injectFault?.({ kind: "after_command", commandIndex: index });
  }

  const ledgerCounts = context.sqlite.prepare(`SELECT
    (SELECT count(*) FROM campaign_play_commands WHERE campaign_id = ? AND batch_id = ?) AS commands,
    (SELECT count(*) FROM campaign_play_receipts r JOIN campaign_play_commands c ON c.command_id = r.command_id
      WHERE r.campaign_id = ? AND c.batch_id = ?) AS receipts,
    (SELECT count(*) FROM campaign_play_events e JOIN campaign_play_commands c ON c.command_id = e.command_id
      WHERE e.campaign_id = ? AND c.batch_id = ?) AS events`)
    .get(
      frame.campaignId, accepted.batch.batchId,
      frame.campaignId, accepted.batch.batchId,
      frame.campaignId, accepted.batch.batchId,
    ) as { commands: number; receipts: number; events: number };
  if (
    ledgerCounts.commands !== accepted.batch.commands.length
    || ledgerCounts.receipts !== accepted.batch.commands.length
    || ledgerCounts.events !== accepted.batch.commands.length
  ) {
    throw new CampaignPlayRulebookExecutionError(
      "execution_contract_invalid",
      "Rulebook ledger is incomplete at the transaction boundary.",
    );
  }
  input.injectFault?.({ kind: "before_commit", commandIndex: null });
  return {
    batchId: accepted.batch.batchId,
    commandIds: accepted.batch.commands.map((command) => command.commandId),
    receiptIds,
    eventIds,
    priorWorldVersion: context.priorWorldVersion,
    resultWorldVersion: context.targetWorldVersion,
    resultWorldHash: priorHash,
  };
}
