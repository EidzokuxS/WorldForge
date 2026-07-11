import type {
  ActorGoal,
  ActorPlacement,
  ActorRelation,
  CampaignWorldLocation,
  CampaignWorldRoute,
  GeneratedWorldActor,
  WorldActor,
  WorldPressure,
} from "@worldforge/shared";

export interface CampaignWorldDraft {
  worldSummary: string;
  locations: CampaignWorldLocation[];
  routes: CampaignWorldRoute[];
  actors: GeneratedWorldActor[];
  goals: ActorGoal[];
  relations: ActorRelation[];
  placements: ActorPlacement[];
  pressures: WorldPressure[];
}

export class CampaignWorldValidationError extends Error {
  readonly code = "campaign_world_invalid";

  constructor(readonly issues: string[]) {
    super(`Campaign World validation failed: ${issues.join(" | ")}`);
    this.name = "CampaignWorldValidationError";
  }
}

const locationKinds = new Set(["macro", "persistent_sublocation"]);
const actorKinds = new Set(["person", "collective"]);
const actorRoles = new Set(["key", "support", "background"]);
const goalHorizons = new Set(["immediate", "ongoing"]);
const placementKinds = new Set(["present", "home", "base", "influence"]);
const relationTypes = new Set([
  "alliance",
  "rivalry",
  "authority",
  "dependency",
  "kinship",
  "association",
  "hostility",
]);

function worldActorControlIssue(
  actor: Pick<WorldActor, "id" | "kind" | "controller" | "role">,
): string | null {
  const validHuman =
    actor.controller === "human" &&
    actor.kind === "person" &&
    actor.role === "player";
  const validAgent =
    actor.controller === "agent" &&
    (actor.kind === "person" || actor.kind === "collective") &&
    actorRoles.has(actor.role);
  return validHuman || validAgent
    ? null
    : `actor ${actor.id} has an invalid controller, kind, and role combination`;
}

export function validateWorldActorControl(
  actor: Pick<WorldActor, "id" | "kind" | "controller" | "role">,
): void {
  const issue = worldActorControlIssue(actor);
  if (issue) throw new CampaignWorldValidationError([issue]);
}

function compareText(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function validateText(
  value: unknown,
  max: number,
  label: string,
  issues: string[],
): void {
  if (
    typeof value !== "string" ||
    value.length < 1 ||
    value.length > max ||
    value !== value.trim()
  ) {
    issues.push(`${label} must contain 1 to ${max} trimmed characters`);
  }
}

function validateStringList(
  values: unknown,
  label: string,
  issues: string[],
): void {
  if (!Array.isArray(values) || values.length > 20) {
    issues.push(`${label} must contain at most 20 entries`);
    return;
  }
  values.forEach((value, index) =>
    validateText(value, 80, `${label}[${index}]`, issues),
  );
}

function validateBounds(
  values: unknown,
  min: number,
  max: number,
  label: string,
  issues: string[],
): values is unknown[] {
  if (!Array.isArray(values) || values.length < min || values.length > max) {
    issues.push(`${label} count must be between ${min} and ${max}`);
    return false;
  }
  return true;
}

function validateUniqueIds(
  values: readonly { id: string }[],
  label: string,
  issues: string[],
): Set<string> {
  const ids = new Set<string>();
  for (const value of values) {
    validateText(value.id, 120, `${label} id`, issues);
    if (ids.has(value.id)) {
      issues.push(`${label} id ${value.id} is duplicated`);
    }
    ids.add(value.id);
  }
  return ids;
}

function reachableLocations(draft: CampaignWorldDraft): Set<string> {
  const starting = draft.locations.find((location) => location.isStarting);
  const reachable = new Set(starting ? [starting.id] : []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const route of draft.routes) {
      if (reachable.has(route.fromLocationId) && !reachable.has(route.toLocationId)) {
        reachable.add(route.toLocationId);
        changed = true;
      }
    }
    for (const location of draft.locations) {
      if (
        location.parentLocationId &&
        reachable.has(location.parentLocationId) &&
        !reachable.has(location.id)
      ) {
        reachable.add(location.id);
        changed = true;
      }
    }
  }
  return reachable;
}

export function validateCampaignWorldDraft(
  draft: CampaignWorldDraft,
): CampaignWorldDraft {
  const issues: string[] = [];
  validateText(draft.worldSummary, 1_200, "worldSummary", issues);
  validateBounds(draft.locations, 3, 10, "locations", issues);
  validateBounds(draft.routes, 2, 30, "routes", issues);
  validateBounds(draft.actors, 4, 16, "actors", issues);
  validateBounds(draft.goals, 4, 32, "goals", issues);
  validateBounds(draft.relations, 3, 32, "relations", issues);
  validateBounds(draft.placements, 4, 32, "placements", issues);
  validateBounds(draft.pressures, 2, 6, "pressures", issues);

  const locationIds = validateUniqueIds(draft.locations, "location", issues);
  const routeIds = validateUniqueIds(draft.routes, "route", issues);
  const actorIds = validateUniqueIds(draft.actors, "actor", issues);
  validateUniqueIds(draft.goals, "goal", issues);
  validateUniqueIds(draft.relations, "relation", issues);
  validateUniqueIds(draft.placements, "placement", issues);
  const pressureIds = validateUniqueIds(draft.pressures, "pressure", issues);
  void routeIds;
  void pressureIds;

  const startingLocations = draft.locations.filter((location) =>
    location.isStarting && location.kind === "macro"
  );
  if (startingLocations.length !== 1) {
    issues.push("world requires exactly one starting macro location");
  }
  for (const location of draft.locations) {
    validateText(location.name, 120, `location ${location.id} name`, issues);
    validateText(
      location.description,
      1_200,
      `location ${location.id} description`,
      issues,
    );
    validateStringList(location.tags, `location ${location.id} tags`, issues);
    if (!locationKinds.has(location.kind)) {
      issues.push(`location ${location.id} has an invalid kind`);
    }
    if (location.kind === "macro" && location.parentLocationId !== null) {
      issues.push(`macro location ${location.id} must have a null parent`);
    }
    if (location.kind === "persistent_sublocation") {
      const parent = draft.locations.find((candidate) =>
        candidate.id === location.parentLocationId
      );
      if (!parent || parent.kind !== "macro") {
        issues.push(`sublocation ${location.id} requires an existing macro parent`);
      }
      if (location.isStarting) {
        issues.push(`sublocation ${location.id} cannot be the starting location`);
      }
    }
  }

  const routeKeys = new Set<string>();
  for (const route of draft.routes) {
    if (!locationIds.has(route.fromLocationId) || !locationIds.has(route.toLocationId)) {
      issues.push(`route ${route.id} references an unknown location`);
    }
    if (route.fromLocationId === route.toLocationId) {
      issues.push(`route ${route.id} has identical endpoints`);
    }
    if (!Number.isInteger(route.travelCost) || route.travelCost < 1 || route.travelCost > 10) {
      issues.push(`route ${route.id} travelCost must be between 1 and 10`);
    }
    const key = `${route.fromLocationId}\u0000${route.toLocationId}`;
    if (routeKeys.has(key)) {
      issues.push(`directed route ${route.fromLocationId} -> ${route.toLocationId} is duplicated`);
    }
    routeKeys.add(key);
  }

  const reachable = reachableLocations(draft);
  for (const location of draft.locations) {
    if (location.kind === "macro" && !reachable.has(location.id)) {
      issues.push(`macro location ${location.id} is unreachable from the start`);
    }
  }

  let keyPeople = 0;
  let supportPeople = 0;
  let collectiveActors = 0;
  for (const actor of draft.actors) {
    validateText(actor.name, 120, `actor ${actor.id} name`, issues);
    validateText(actor.summary, 1_200, `actor ${actor.id} summary`, issues);
    validateStringList(actor.traits, `actor ${actor.id} traits`, issues);
    validateStringList(actor.tags, `actor ${actor.id} tags`, issues);
    if (!actorKinds.has(actor.kind)) {
      issues.push(`actor ${actor.id} has an invalid kind`);
    }
    if (!actorRoles.has(actor.role)) {
      issues.push(`actor ${actor.id} has an invalid role`);
    }
    const controlIssue = worldActorControlIssue(actor);
    if (controlIssue) issues.push(controlIssue);
    if (actor.controller !== "agent") {
      issues.push(`generated actor ${actor.id} must use the agent controller`);
    }
    if (actor.kind === "person" && actor.role === "key") keyPeople += 1;
    if (actor.kind === "person" && actor.role === "support") supportPeople += 1;
    if (actor.kind === "collective") collectiveActors += 1;
  }
  if (keyPeople < 1) issues.push("cast requires at least one key person");
  if (supportPeople < 2) issues.push("cast requires at least two support people");
  if (collectiveActors < 1) issues.push("cast requires at least one collective actor");

  for (const goal of draft.goals) {
    if (!actorIds.has(goal.actorId)) issues.push(`goal ${goal.id} references an unknown actor`);
    validateText(goal.objective, 1_200, `goal ${goal.id} objective`, issues);
    validateText(goal.motivation, 1_200, `goal ${goal.id} motivation`, issues);
    if (!goalHorizons.has(goal.horizon)) {
      issues.push(`goal ${goal.id} has an invalid horizon`);
    }
    if (!Number.isInteger(goal.priority) || goal.priority < 1 || goal.priority > 5) {
      issues.push(`goal ${goal.id} priority must be between 1 and 5`);
    }
    if (goal.status !== "active") issues.push(`goal ${goal.id} must be active`);
  }

  const placementKeys = new Set<string>();
  for (const placement of draft.placements) {
    if (!actorIds.has(placement.actorId) || !locationIds.has(placement.locationId)) {
      issues.push(`placement ${placement.id} references an unknown actor or location`);
    }
    if (!placementKinds.has(placement.placementKind)) {
      issues.push(`placement ${placement.id} has an invalid kind`);
    }
    const key = `${placement.actorId}\u0000${placement.locationId}\u0000${placement.placementKind}`;
    if (placementKeys.has(key)) issues.push(`placement ${placement.id} is duplicated`);
    placementKeys.add(key);
  }

  for (const actor of draft.actors) {
    const goals = draft.goals.filter((goal) => goal.actorId === actor.id);
    const placements = draft.placements.filter((placement) =>
      placement.actorId === actor.id
    );
    const requiresGoals =
      actor.kind === "collective" || actor.role === "key" || actor.role === "support";
    if (requiresGoals && (goals.length < 1 || goals.length > 3)) {
      issues.push(`actor ${actor.id} requires one to three active goals`);
    }
    if (actor.role === "background" && goals.length > 1) {
      issues.push(`background actor ${actor.id} may have at most one goal`);
    }
    if (actor.kind === "person") {
      const present = placements.filter((placement) => placement.placementKind === "present");
      const home = placements.filter((placement) => placement.placementKind === "home");
      const incompatible = placements.some((placement) =>
        placement.placementKind === "base" || placement.placementKind === "influence"
      );
      if (present.length !== 1 || home.length > 1 || incompatible) {
        issues.push(`person ${actor.id} has invalid placement semantics`);
      }
    } else {
      const anchored = placements.some((placement) =>
        placement.placementKind === "base" || placement.placementKind === "influence"
      );
      const incompatible = placements.some((placement) =>
        placement.placementKind === "present" || placement.placementKind === "home"
      );
      if (!anchored || incompatible) {
        issues.push(`collective ${actor.id} has invalid placement semantics`);
      }
    }
  }

  const activePersonIds = new Set(
    draft.actors
      .filter((actor) =>
        actor.kind === "person" && (actor.role === "key" || actor.role === "support")
      )
      .map((actor) => actor.id),
  );
  const activeLocations = new Set(
    draft.placements
      .filter((placement) =>
        activePersonIds.has(placement.actorId) && placement.placementKind === "present"
      )
      .map((placement) => placement.locationId),
  );
  if (activeLocations.size < 2) {
    issues.push("key and support people require present placements across two locations");
  }
  for (const locationId of activeLocations) {
    if (!reachable.has(locationId)) {
      issues.push(`active cast location ${locationId} is unreachable`);
    }
  }

  const relationKeys = new Set<string>();
  const relationParticipants = new Set<string>();
  for (const relation of draft.relations) {
    if (!actorIds.has(relation.sourceActorId) || !actorIds.has(relation.targetActorId)) {
      issues.push(`relation ${relation.id} references an unknown actor`);
    }
    if (relation.sourceActorId === relation.targetActorId) {
      issues.push(`relation ${relation.id} has identical endpoints`);
    }
    validateText(relation.summary, 1_200, `relation ${relation.id} summary`, issues);
    if (!relationTypes.has(relation.relationType)) {
      issues.push(`relation ${relation.id} has an invalid type`);
    }
    if (!Number.isInteger(relation.intensity) || relation.intensity < 1 || relation.intensity > 5) {
      issues.push(`relation ${relation.id} intensity must be between 1 and 5`);
    }
    const key = `${relation.sourceActorId}\u0000${relation.targetActorId}\u0000${relation.relationType}`;
    if (relationKeys.has(key)) issues.push(`relation ${relation.id} is duplicated`);
    relationKeys.add(key);
    relationParticipants.add(relation.sourceActorId);
    relationParticipants.add(relation.targetActorId);
  }
  for (const actor of draft.actors) {
    if (
      (actor.kind === "collective" || actor.role === "key") &&
      !relationParticipants.has(actor.id)
    ) {
      issues.push(`actor ${actor.id} must participate in a relation`);
    }
  }

  const pressureAnchorSets = new Set<string>();
  for (const pressure of draft.pressures) {
    validateText(pressure.name, 120, `pressure ${pressure.id} name`, issues);
    validateText(pressure.description, 1_200, `pressure ${pressure.id} description`, issues);
    validateText(pressure.trajectory, 1_200, `pressure ${pressure.id} trajectory`, issues);
    if (!Number.isInteger(pressure.urgency) || pressure.urgency < 1 || pressure.urgency > 5) {
      issues.push(`pressure ${pressure.id} urgency must be between 1 and 5`);
    }
    if (pressure.actorIds.length > 8 || pressure.locationIds.length > 8) {
      issues.push(`pressure ${pressure.id} exceeds anchor limits`);
    }
    if (pressure.actorIds.length + pressure.locationIds.length === 0) {
      issues.push(`pressure ${pressure.id} requires an actor or location anchor`);
    }
    const uniqueActorAnchors = new Set(pressure.actorIds);
    const uniqueLocationAnchors = new Set(pressure.locationIds);
    if (
      uniqueActorAnchors.size !== pressure.actorIds.length ||
      uniqueLocationAnchors.size !== pressure.locationIds.length
    ) {
      issues.push(`pressure ${pressure.id} contains duplicate anchors`);
    }
    if (pressure.actorIds.some((actorId) => !actorIds.has(actorId))) {
      issues.push(`pressure ${pressure.id} references an unknown actor`);
    }
    if (pressure.locationIds.some((locationId) => !locationIds.has(locationId))) {
      issues.push(`pressure ${pressure.id} references an unknown location`);
    }
    pressureAnchorSets.add(JSON.stringify({
      actorIds: [...pressure.actorIds].sort(compareText),
      locationIds: [...pressure.locationIds].sort(compareText),
    }));
  }
  if (pressureAnchorSets.size < 2) {
    issues.push("at least two pressures require different anchor sets");
  }

  if (issues.length > 0) {
    throw new CampaignWorldValidationError(issues);
  }
  return draft;
}
