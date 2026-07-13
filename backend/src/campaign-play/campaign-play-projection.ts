import crypto from "node:crypto";
import type {
  CampaignPlayConsequence,
  CampaignPlayJournalEntry,
  CampaignPlayVisibleActor,
  CampaignPlayVisibleLocation,
  CampaignPlayVisiblePressure,
  CampaignPlayVisibleRoute,
  CampaignWorldReview,
} from "@worldforge/shared";
import {
  serializeCampaignWorldContent,
} from "../campaign-world/world-snapshot.js";

export type CampaignPlayEligibilityRequirementCode =
  | "active_actor_goal_missing"
  | "active_actor_placement_invalid"
  | "directed_routes_missing"
  | "key_person_missing"
  | "macro_location_unreachable"
  | "macro_locations_below_minimum"
  | "non_local_exposure_path_missing"
  | "opening_location_invalid"
  | "pressure_anchors_not_distinct"
  | "pressures_below_minimum"
  | "support_people_below_minimum";

export type CanonicalJsonPrimitive = boolean | number | string | null;
export type CanonicalJsonValue =
  | CanonicalJsonPrimitive
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

export interface CampaignPlayProjectionRecord {
  readonly [key: string]: CanonicalJsonValue;
}

export interface CampaignPlayProjection<T> {
  projection: T;
  canonicalBytes: string;
  hash: string;
}

export interface CampaignPlayExposurePath {
  fromLocationId: string;
  toLocationId: string;
  routeIds: string[];
  locationIds: string[];
}

export interface CampaignPlayEligibilitySemanticProjection {
  acceptedContentHash: string;
  eligible: boolean;
  unmetRequirements: CampaignPlayEligibilityRequirementCode[];
  openingLocationId: string | null;
  reachableMacroLocationIds: string[];
  activeActorIds: string[];
  pressureAnchorKeys: string[];
  exposurePath: CampaignPlayExposurePath | null;
}

export interface CampaignPlayLiveRouteState {
  routeId: string;
  state: "open" | "restricted" | "blocked";
}

export interface CampaignPlayLiveActorCondition {
  actorId: string;
  condition: "occupied" | "strained" | "incapacitated";
  present: boolean;
  summary: string;
}

export interface CampaignPlayLivePressureState {
  pressureId: string;
  progress: number;
  status: "active" | "resolved";
  lastAdvancedWorldTimeMinutes: number;
}

export interface CampaignPlayLivePlacement {
  placementId: string;
  actorId: string;
  locationId: string;
  placementKind: "present" | "home" | "base" | "influence";
}

export interface CampaignPlayLiveRelation {
  relationId: string;
  sourceActorId: string;
  targetActorId: string;
  relationType: string;
  intensity: number;
  summary: string;
}

export interface CampaignPlayLiveGoal {
  goalId: string;
  actorId: string;
  status: "active" | "completed" | "blocked";
  priority: number;
  objective: string;
  motivation: string;
}

export interface CampaignPlayHumanMechanicalIdentity {
  actorId: string;
  recordHash: string;
}

export interface CampaignPlayMechanicalProjectionInput {
  acceptedReview: CampaignWorldReview;
  worldTimeMinutes: number | null;
  human: CampaignPlayHumanMechanicalIdentity | null;
  routeStates: readonly CampaignPlayLiveRouteState[];
  actorConditions: readonly CampaignPlayLiveActorCondition[];
  pressureStates: readonly CampaignPlayLivePressureState[];
  placements: readonly CampaignPlayLivePlacement[];
  relations: readonly CampaignPlayLiveRelation[];
  goals: readonly CampaignPlayLiveGoal[];
}

export interface CampaignPlayRuntimeProjectionInput {
  campaignId: string;
  setupPhase: "character_required" | "opening_required" | "ready";
  eligibility: CampaignPlayEligibilitySemanticProjection;
  eligibilityHash: string;
  activeTurn: CampaignPlayProjectionRecord | null;
  actorPlans: readonly CampaignPlayProjectionRecord[];
  actorSchedules: readonly CampaignPlayProjectionRecord[];
  pendingJobs: readonly CampaignPlayProjectionRecord[];
  pendingProposals: readonly CampaignPlayProjectionRecord[];
  actorKnowledge: readonly CampaignPlayProjectionRecord[];
  playerObservations: readonly CampaignPlayProjectionRecord[];
  narratorState: CampaignPlayProjectionRecord | null;
  workerLeaseEpoch: number;
  nextRuntimeEventSequence: number;
  nextTurnEventSequence: number | null;
}

export interface CampaignPlayProtectedAuditInput {
  campaignId: string;
  worldVersion: number;
  runtimeRevision: number;
  commands: readonly CampaignPlayProjectionRecord[];
  receipts: readonly CampaignPlayProjectionRecord[];
  worldEvents: readonly CampaignPlayProjectionRecord[];
  eventExposures: readonly CampaignPlayProjectionRecord[];
  runtimeEvents: readonly CampaignPlayProjectionRecord[];
  turnEvents: readonly CampaignPlayProjectionRecord[];
  modelStages: readonly CampaignPlayProjectionRecord[];
}

export interface CampaignPlayPublicProjectionInput {
  campaignId: string;
  acceptedWorldVersion: number;
  worldVersion: number;
  runtimeRevision: number;
  phase: string;
  worldTimeMinutes: number | null;
  currentLocation: CampaignPlayVisibleLocation | null;
  visibleActors: readonly CampaignPlayVisibleActor[];
  visibleRoutes: readonly CampaignPlayVisibleRoute[];
  visiblePressures: readonly CampaignPlayVisiblePressure[];
  consequences: readonly CampaignPlayConsequence[];
  journal: readonly CampaignPlayPublicJournalEntry[];
  narration: CampaignPlayProjectionRecord | null;
}

export interface CampaignPlayPublicJournalEntry {
  observationId: string;
  worldTimeMinutes: number;
  entry: CampaignPlayJournalEntry;
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function canonicalJson(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical Campaign Play JSON requires finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError("Canonical Campaign Play JSON contains an unsupported value.");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical Campaign Play JSON cannot contain cycles.");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalJson(entry, ancestors)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical Campaign Play JSON requires plain objects.");
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort(compareText)
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`)
      .join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalizeCampaignPlayProjection(value: unknown): string {
  return canonicalJson(value, new Set<object>());
}

export function hashCampaignPlayProjection(value: unknown): string {
  return crypto
    .createHash("sha256")
    .update(canonicalizeCampaignPlayProjection(value))
    .digest("hex");
}

export function deriveCampaignPlayActorReplanStageId(jobId: string): string {
  if (jobId.length === 0) {
    throw new TypeError("Campaign Play actor replan stage requires a job ID.");
  }
  return `actor-replan-stage:${hashCampaignPlayProjection({ jobId }).slice(0, 32)}`;
}

export function deriveCampaignPlayPublicHandle(
  kind: string,
  campaignId: string,
  id: string,
): string {
  return `${kind}_${hashCampaignPlayProjection({
    domain: "campaign_play_public_handle",
    campaignId,
    kind,
    id,
  }).slice(0, 24)}`;
}

function wrapProjection<T>(projection: T): CampaignPlayProjection<T> {
  const canonicalBytes = canonicalizeCampaignPlayProjection(projection);
  return {
    projection,
    canonicalBytes,
    hash: crypto.createHash("sha256").update(canonicalBytes).digest("hex"),
  };
}

function sortByText<T>(
  values: readonly T[],
  select: (value: T) => string,
): T[] {
  return [...values].sort((left, right) =>
    compareText(select(left), select(right))
  );
}

function compareNumber(left: number, right: number): number {
  if (!Number.isFinite(left) || !Number.isFinite(right)) {
    throw new TypeError("Campaign Play projection ordering requires finite numbers.");
  }
  return left - right;
}

function projectionNumber(
  row: CampaignPlayProjectionRecord,
  key: string,
): number {
  const value = row[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`Campaign Play projection row requires numeric ${key}.`);
  }
  return value;
}

function projectionText(
  row: CampaignPlayProjectionRecord,
  key: string,
): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new TypeError(`Campaign Play projection row requires text ${key}.`);
  }
  return value;
}

function uniqueSorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort(compareText);
}

function publicConsequence(entry: CampaignPlayConsequence): CampaignPlayConsequence {
  return {
    observationHandle: entry.observationHandle,
    whatChanged: entry.whatChanged,
    whereOrRoute: entry.whereOrRoute,
    worldTimeLabel: entry.worldTimeLabel,
    causalCue: entry.causalCue,
  };
}

function publicJournalEntry(entry: CampaignPlayJournalEntry): CampaignPlayJournalEntry {
  return {
    observationHandle: entry.observationHandle,
    title: entry.title,
    text: entry.text,
    whereOrRoute: entry.whereOrRoute,
    worldTimeLabel: entry.worldTimeLabel,
    consequence: entry.consequence ? publicConsequence(entry.consequence) : null,
  };
}

function activeAcceptedActors(review: CampaignWorldReview) {
  return review.actors.filter((actor) =>
    actor.controller === "agent" && actor.kind === "person"
  );
}

function pressureAnchorKey(pressure: CampaignWorldReview["pressures"][number]): string {
  const anchors = [
    ...pressure.actorIds.map((actorId) => `actor:${actorId}`),
    ...pressure.locationIds.map((locationId) => `location:${locationId}`),
  ].sort(compareText);
  return anchors.join("|");
}

function reachableLocationIds(
  review: CampaignWorldReview,
  startLocationId: string,
): Set<string> {
  const reachable = new Set([startLocationId]);
  const routes = sortByText(review.routes, (route) => route.id);
  let changed = true;
  while (changed) {
    changed = false;
    for (const route of routes) {
      if (reachable.has(route.fromLocationId) && !reachable.has(route.toLocationId)) {
        reachable.add(route.toLocationId);
        changed = true;
      }
    }
  }
  return reachable;
}

function findExposurePath(
  review: CampaignWorldReview,
  openingLocationId: string,
  reachable: ReadonlySet<string>,
): CampaignPlayExposurePath | null {
  const macroIds = new Set(
    review.locations
      .filter((location) => location.kind === "macro")
      .map((location) => location.id),
  );
  const nonLocalAnchors = new Set<string>();
  for (const pressure of review.pressures) {
    for (const locationId of pressure.locationIds) {
      if (
        locationId !== openingLocationId &&
        macroIds.has(locationId) &&
        reachable.has(locationId)
      ) {
        nonLocalAnchors.add(locationId);
      }
    }
  }
  for (const actor of activeAcceptedActors(review)) {
    for (const placement of review.placements) {
      if (
        placement.actorId === actor.id &&
        placement.locationId !== openingLocationId &&
        macroIds.has(placement.locationId) &&
        reachable.has(placement.locationId)
      ) {
        nonLocalAnchors.add(placement.locationId);
      }
    }
  }
  if (nonLocalAnchors.size === 0) return null;

  const outgoing = new Map<string, Array<{ routeId: string; toLocationId: string }>>();
  for (const route of review.routes) {
    const entries = outgoing.get(route.fromLocationId) ?? [];
    entries.push({ routeId: route.id, toLocationId: route.toLocationId });
    outgoing.set(route.fromLocationId, entries);
  }
  for (const entries of outgoing.values()) {
    entries.sort((left, right) =>
      compareText(left.toLocationId, right.toLocationId) ||
      compareText(left.routeId, right.routeId)
    );
  }

  const queue: Array<{ locationId: string; routeIds: string[]; locationIds: string[] }> = [
    { locationId: openingLocationId, routeIds: [], locationIds: [openingLocationId] },
  ];
  const visited = new Set([openingLocationId]);
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    if (nonLocalAnchors.has(current.locationId)) {
      return {
        fromLocationId: openingLocationId,
        toLocationId: current.locationId,
        routeIds: current.routeIds,
        locationIds: current.locationIds,
      };
    }
    for (const edge of outgoing.get(current.locationId) ?? []) {
      if (!visited.has(edge.toLocationId)) {
        visited.add(edge.toLocationId);
        queue.push({
          locationId: edge.toLocationId,
          routeIds: [...current.routeIds, edge.routeId],
          locationIds: [...current.locationIds, edge.toLocationId],
        });
      }
    }
  }
  return null;
}

export function projectAcceptedTopologyEligibility(
  review: CampaignWorldReview,
): CampaignPlayProjection<CampaignPlayEligibilitySemanticProjection> {
  const unmet = new Set<CampaignPlayEligibilityRequirementCode>();
  const macroLocations = review.locations.filter((location) => location.kind === "macro");
  const startingMacros = macroLocations.filter((location) => location.isStarting);
  const openingLocationId = startingMacros.length === 1 ? startingMacros[0].id : null;
  const reachable = openingLocationId
    ? reachableLocationIds(review, openingLocationId)
    : new Set<string>();
  const reachableMacroLocationIds = uniqueSorted(
    macroLocations.filter((location) => reachable.has(location.id)).map((location) => location.id),
  );

  if (macroLocations.length < 3) unmet.add("macro_locations_below_minimum");
  if (reachableMacroLocationIds.length !== macroLocations.length) {
    unmet.add("macro_location_unreachable");
  }
  if (review.routes.length === 0) unmet.add("directed_routes_missing");

  const keyPeople = review.actors.filter((actor) =>
    actor.kind === "person" && actor.role === "key"
  );
  const supportPeople = review.actors.filter((actor) =>
    actor.kind === "person" && actor.role === "support"
  );
  if (keyPeople.length < 1) unmet.add("key_person_missing");
  if (supportPeople.length < 2) unmet.add("support_people_below_minimum");

  if (review.pressures.length < 2) unmet.add("pressures_below_minimum");
  const pressureAnchorKeys = uniqueSorted(
    review.pressures.map(pressureAnchorKey).filter((key) => key.length > 0),
  );
  if (pressureAnchorKeys.length < 2) unmet.add("pressure_anchors_not_distinct");

  const activeActors = activeAcceptedActors(review);
  const locationIds = new Set(review.locations.map((location) => location.id));
  const playablePlacementLocationIds = new Set(
    review.locations
      .filter((location) =>
        reachable.has(location.id)
        || location.parentLocationId !== null && reachable.has(location.parentLocationId)
      )
      .map((location) => location.id),
  );
  for (const actor of activeActors) {
    if (!review.goals.some((goal) => goal.actorId === actor.id && goal.status === "active")) {
      unmet.add("active_actor_goal_missing");
    }
    const placements = review.placements.filter((placement) => placement.actorId === actor.id);
    const valid = actor.kind === "person"
      ? placements.filter((placement) =>
        placement.placementKind === "present" &&
        locationIds.has(placement.locationId) &&
        playablePlacementLocationIds.has(placement.locationId)
      ).length === 1
      : placements.some((placement) =>
        (placement.placementKind === "base" || placement.placementKind === "influence") &&
        locationIds.has(placement.locationId) &&
        playablePlacementLocationIds.has(placement.locationId)
      );
    if (!valid) unmet.add("active_actor_placement_invalid");
  }

  let openingValid = openingLocationId !== null;
  if (openingLocationId) {
    const pressurePresent = review.pressures.some((pressure) =>
      pressure.locationIds.includes(openingLocationId)
    );
    const routeAffordance = review.routes.some((route) =>
      route.fromLocationId === openingLocationId &&
      route.toLocationId !== openingLocationId &&
      reachable.has(route.toLocationId)
    );
    openingValid = pressurePresent && routeAffordance;
  }
  if (!openingValid) unmet.add("opening_location_invalid");

  const exposurePath = openingLocationId
    ? findExposurePath(review, openingLocationId, reachable)
    : null;
  if (!exposurePath) unmet.add("non_local_exposure_path_missing");

  const unmetRequirements = [...unmet].sort(compareText);
  return wrapProjection({
    acceptedContentHash: review.contentHash,
    eligible: unmetRequirements.length === 0,
    unmetRequirements,
    openingLocationId,
    reachableMacroLocationIds,
    activeActorIds: uniqueSorted(activeActors.map((actor) => actor.id)),
    pressureAnchorKeys,
    exposurePath,
  });
}

function isAcceptedMechanicalBase(input: CampaignPlayMechanicalProjectionInput): boolean {
  return input.worldTimeMinutes === null &&
    input.human === null &&
    input.routeStates.length === 0 &&
    input.actorConditions.length === 0 &&
    input.pressureStates.length === 0 &&
    input.placements.length === 0 &&
    input.relations.length === 0 &&
    input.goals.length === 0;
}

export function projectCampaignPlayMechanicalTruth(
  input: CampaignPlayMechanicalProjectionInput,
): CampaignPlayProjection<object> {
  if (isAcceptedMechanicalBase(input)) {
    const review = input.acceptedReview;
    const canonicalBytes = serializeCampaignWorldContent(review.sourceDigest, {
      worldSummary: review.worldSummary,
      locations: review.locations,
      routes: review.routes,
      actors: review.actors,
      goals: review.goals,
      relations: review.relations,
      placements: review.placements,
      pressures: review.pressures,
    });
    const hash = crypto.createHash("sha256").update(canonicalBytes).digest("hex");
    if (hash !== review.contentHash) {
      throw new Error("Accepted Campaign World content hash does not match its canonical bytes.");
    }
    return {
      projection: JSON.parse(canonicalBytes) as object,
      canonicalBytes,
      hash,
    };
  }

  return wrapProjection({
    domain: "campaign_play_mechanical",
    acceptedContentHash: input.acceptedReview.contentHash,
    worldTimeMinutes: input.worldTimeMinutes,
    human: input.human,
    routeStates: sortByText(input.routeStates, (row) => row.routeId),
    actorConditions: sortByText(
      input.actorConditions,
      (row) => `${row.actorId}\u0000${row.condition}`,
    ),
    pressureStates: sortByText(input.pressureStates, (row) => row.pressureId),
    placements: sortByText(input.placements, (row) => row.placementId),
    relations: sortByText(input.relations, (row) => row.relationId),
    goals: sortByText(input.goals, (row) => row.goalId),
  });
}

export function projectCampaignPlayRuntimeTruth(
  input: CampaignPlayRuntimeProjectionInput,
): CampaignPlayProjection<object> {
  return wrapProjection({
    domain: "campaign_play_runtime",
    campaignId: input.campaignId,
    setupPhase: input.setupPhase,
    eligibility: input.eligibility,
    eligibilityHash: input.eligibilityHash,
    activeTurn: input.activeTurn,
    actorPlans: sortByText(input.actorPlans, (row) => String(row.planId ?? "")),
    actorSchedules: sortByText(input.actorSchedules, (row) => String(row.scheduleId ?? "")),
    pendingJobs: sortByText(input.pendingJobs, (row) => String(row.jobId ?? "")),
    pendingProposals: sortByText(input.pendingProposals, (row) => String(row.proposalId ?? "")),
    actorKnowledge: [...input.actorKnowledge].sort((left, right) =>
      compareText(
        projectionText(left, "actorId"),
        projectionText(right, "actorId"),
      ) || compareText(
        projectionText(left, "eventId"),
        projectionText(right, "eventId"),
      ) || compareText(
        projectionText(left, "channel"),
        projectionText(right, "channel"),
      ) || compareText(
        projectionText(left, "sourceHash"),
        projectionText(right, "sourceHash"),
      ) || compareText(
        projectionText(left, "knowledgeId"),
        projectionText(right, "knowledgeId"),
      )
    ),
    playerObservations: [...input.playerObservations].sort((left, right) =>
      compareNumber(
        projectionNumber(left, "worldTimeMinutes"),
        projectionNumber(right, "worldTimeMinutes"),
      ) || compareText(
        projectionText(left, "observationId"),
        projectionText(right, "observationId"),
      )
    ),
    narratorState: input.narratorState,
    workerLeaseEpoch: input.workerLeaseEpoch,
    nextRuntimeEventSequence: input.nextRuntimeEventSequence,
    nextTurnEventSequence: input.nextTurnEventSequence,
  });
}

export function projectCampaignPlayProtectedAudit(
  input: CampaignPlayProtectedAuditInput,
): CampaignPlayProjection<object> {
  return wrapProjection({
    domain: "campaign_play_protected_audit",
    campaignId: input.campaignId,
    worldVersion: input.worldVersion,
    runtimeRevision: input.runtimeRevision,
    commands: sortByText(input.commands, (row) => String(row.commandId ?? "")),
    receipts: sortByText(input.receipts, (row) => String(row.receiptId ?? "")),
    worldEvents: sortByText(input.worldEvents, (row) => String(row.eventId ?? "")),
    eventExposures: sortByText(
      input.eventExposures,
      (row) => String(row.exposureId ?? ""),
    ),
    runtimeEvents: [...input.runtimeEvents].sort((left, right) =>
      compareNumber(
        projectionNumber(left, "sequence"),
        projectionNumber(right, "sequence"),
      ) || compareText(
        projectionText(left, "eventId"),
        projectionText(right, "eventId"),
      )
    ),
    turnEvents: [...input.turnEvents].sort((left, right) =>
      compareText(
        projectionText(left, "turnId"),
        projectionText(right, "turnId"),
      ) || compareNumber(
        projectionNumber(left, "sequence"),
        projectionNumber(right, "sequence"),
      ) || compareText(
        projectionText(left, "eventId"),
        projectionText(right, "eventId"),
      )
    ),
    modelStages: [...input.modelStages].sort((left, right) =>
      compareText(
        projectionText(left, "stageId"),
        projectionText(right, "stageId"),
      ) || compareNumber(
        projectionNumber(left, "attempt"),
        projectionNumber(right, "attempt"),
      ) || compareText(
        projectionText(left, "id"),
        projectionText(right, "id"),
      )
    ),
  });
}

export function projectCampaignPlayPublicState(
  input: CampaignPlayPublicProjectionInput,
): CampaignPlayProjection<object> {
  return wrapProjection({
    domain: "campaign_play_player_public",
    campaignId: input.campaignId,
    acceptedWorldVersion: input.acceptedWorldVersion,
    worldVersion: input.worldVersion,
    runtimeRevision: input.runtimeRevision,
    phase: input.phase,
    worldTimeMinutes: input.worldTimeMinutes,
    currentLocation: input.currentLocation ? {
      handle: input.currentLocation.handle,
      name: input.currentLocation.name,
      description: input.currentLocation.description,
    } : null,
    visibleActors: sortByText(input.visibleActors.map((row) => ({
      handle: row.handle,
      name: row.name,
      monogram: row.monogram,
      descriptor: row.descriptor,
      accent: row.accent,
    })), (row) => row.handle),
    visibleRoutes: sortByText(input.visibleRoutes.map((row) => ({
      handle: row.handle,
      destinationHandle: row.destinationHandle,
      destinationName: row.destinationName,
      state: row.state,
      travelTimeLabel: row.travelTimeLabel,
    })), (row) => row.handle),
    visiblePressures: sortByText(input.visiblePressures.map((row) => ({
      handle: row.handle,
      label: row.label,
      summary: row.summary,
    })), (row) => row.handle),
    consequences: sortByText(
      input.consequences.map(publicConsequence),
      (row) => row.observationHandle,
    ),
    journal: [...input.journal]
      .sort((left, right) =>
        compareNumber(left.worldTimeMinutes, right.worldTimeMinutes) ||
        compareText(left.observationId, right.observationId)
      )
      .map((row) => publicJournalEntry(row.entry)),
    narration: input.narration,
  });
}
