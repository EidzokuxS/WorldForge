export type StartPlacementLocationCandidate = {
  id: string;
  name: string;
  isStarting?: boolean | null;
  kind?: string | null;
  parentLocationId?: string | null;
  description?: string | null;
  tags?: string[] | string | null;
};

export type ConcreteStartPlacement =
  | {
      ok: true;
      broadLocationId: string;
      sceneLocationId: string;
      matchedLocation: StartPlacementLocationCandidate;
      source: "already_concrete" | "starting_child" | "single_child";
    }
  | {
      ok: false;
      error: string;
    };

export type OpeningStageInPlacement =
  | {
      ok: true;
      mode: "current" | "existing_child";
      broadLocationId: string;
      sceneLocationId: string;
      matchedLocation: StartPlacementLocationCandidate;
      source: "already_concrete" | "starting_child" | "single_child" | "opening_stage_in_policy";
    }
  | {
      ok: false;
      error: string;
    };

function normalizedKind(location: StartPlacementLocationCandidate): string {
  return location.kind ?? "macro";
}

function isConcreteScene(location: StartPlacementLocationCandidate): boolean {
  const kind = normalizedKind(location);
  return kind === "persistent_sublocation" || kind === "ephemeral_scene";
}

function childScenesFor(
  location: StartPlacementLocationCandidate,
  allLocations: readonly StartPlacementLocationCandidate[],
): StartPlacementLocationCandidate[] {
  return allLocations.filter((candidate) =>
    normalizedKind(candidate) === "persistent_sublocation"
    && candidate.parentLocationId === location.id,
  );
}

function locationTagTexts(location: StartPlacementLocationCandidate): string[] {
  if (Array.isArray(location.tags)) {
    return location.tags.map((tag) => String(tag));
  }
  if (typeof location.tags !== "string") {
    return [];
  }
  try {
    const parsed = JSON.parse(location.tags) as unknown;
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag)) : [location.tags];
  } catch {
    return [location.tags];
  }
}

function openingStageInText(location: StartPlacementLocationCandidate): string {
  return [
    location.name,
    ...locationTagTexts(location),
  ].join(" ").toLocaleLowerCase("en-US");
}

const OPENING_STAGE_IN_POSITIVE_MARKERS: readonly [string, number][] = [
  ["public", 5],
  ["crowded", 5],
  ["station", 5],
  ["concourse", 5],
  ["underpass", 5],
  ["pedestrian", 4],
  ["street", 4],
  ["market", 4],
  ["arcade", 4],
  ["transit", 4],
  ["gate", 3],
  ["entrance", 3],
  ["plaza", 3],
  ["urban", 2],
  ["anomaly", 2],
  ["alley", 1],
];

const OPENING_STAGE_IN_NEGATIVE_MARKERS: readonly [string, number][] = [
  ["hidden", 8],
  ["private", 7],
  ["controlled", 7],
  ["hideout", 7],
  ["warehouse", 5],
  ["office", 5],
  ["vault", 5],
  ["rooftop", 3],
  ["elevated", 2],
];

function openingStageInScore(location: StartPlacementLocationCandidate): number {
  const text = openingStageInText(location);
  const positive = OPENING_STAGE_IN_POSITIVE_MARKERS.reduce(
    (score, [marker, weight]) => score + (text.includes(marker) ? weight : 0),
    0,
  );
  const negative = OPENING_STAGE_IN_NEGATIVE_MARKERS.reduce(
    (score, [marker, weight]) => score + (text.includes(marker) ? weight : 0),
    0,
  );
  return positive - negative;
}

function openingStageInPolicyChild(
  macroLocation: StartPlacementLocationCandidate,
  allLocations: readonly StartPlacementLocationCandidate[],
): StartPlacementLocationCandidate | null {
  const ranked = childScenesFor(macroLocation, allLocations)
    .map((location) => ({ location, score: openingStageInScore(location) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);
  const first = ranked[0] ?? null;
  const second = ranked[1] ?? null;
  if (!first || (second && second.score === first.score)) {
    return null;
  }
  return first.location;
}

function parentFor(
  location: StartPlacementLocationCandidate,
  allLocations: readonly StartPlacementLocationCandidate[],
): StartPlacementLocationCandidate | null {
  return location.parentLocationId
    ? allLocations.find((candidate) => candidate.id === location.parentLocationId) ?? null
    : null;
}

export function resolveConcreteStartPlacement(
  matchedLocation: StartPlacementLocationCandidate,
  allLocations: readonly StartPlacementLocationCandidate[],
): ConcreteStartPlacement {
  if (isConcreteScene(matchedLocation)) {
    const parentLocation = parentFor(matchedLocation, allLocations);
    if (normalizedKind(matchedLocation) === "persistent_sublocation" && !parentLocation) {
      return {
        ok: false,
        error: `Starting location "${matchedLocation.name}" has an unresolved parent location.`,
      };
    }
    return {
      ok: true,
      broadLocationId: parentLocation?.id ?? matchedLocation.id,
      sceneLocationId: matchedLocation.id,
      matchedLocation,
      source: "already_concrete",
    };
  }

  const childScenes = childScenesFor(matchedLocation, allLocations);
  const startingChildren = childScenes.filter((location) => location.isStarting);
  if (startingChildren.length > 1) {
    return {
      ok: false,
      error: `Starting location "${matchedLocation.name}" has multiple concrete starting sublocations.`,
    };
  }

  const selectedScene =
    startingChildren[0]
    ?? (childScenes.length === 1 ? childScenes[0] : null);
  if (!selectedScene) {
    return {
      ok: false,
      error: `Starting location "${matchedLocation.name}" must resolve to one concrete sublocation before play.`,
    };
  }

  return {
    ok: true,
    broadLocationId: matchedLocation.id,
    sceneLocationId: selectedScene.id,
    matchedLocation: selectedScene,
    source: startingChildren[0] ? "starting_child" : "single_child",
  };
}

export function resolveOpeningStageInPlacement(input: {
  playerCurrentLocationId: string | null | undefined;
  playerCurrentSceneLocationId: string | null | undefined;
  locations: readonly StartPlacementLocationCandidate[];
}): OpeningStageInPlacement {
  const byId = new Map(input.locations.map((location) => [location.id, location]));
  const currentScene =
    (input.playerCurrentSceneLocationId ? byId.get(input.playerCurrentSceneLocationId) : null)
    ?? (input.playerCurrentLocationId ? byId.get(input.playerCurrentLocationId) : null)
    ?? null;
  if (!currentScene) {
    return {
      ok: false,
      error: "Opening scene requires a current player location before narration.",
    };
  }

  if (isConcreteScene(currentScene)) {
    const concrete = resolveConcreteStartPlacement(currentScene, input.locations);
    if (!concrete.ok) return concrete;
    return {
      ok: true,
      mode: "current",
      broadLocationId: concrete.broadLocationId,
      sceneLocationId: concrete.sceneLocationId,
      matchedLocation: concrete.matchedLocation,
      source: concrete.source,
    };
  }

  const concrete = resolveConcreteStartPlacement(currentScene, input.locations);
  if (concrete.ok) {
    return {
      ok: true,
      mode: "existing_child",
      broadLocationId: concrete.broadLocationId,
      sceneLocationId: concrete.sceneLocationId,
      matchedLocation: concrete.matchedLocation,
      source: concrete.source,
    };
  }

  const policyChild = openingStageInPolicyChild(currentScene, input.locations);
  if (policyChild) {
    return {
      ok: true,
      mode: "existing_child",
      broadLocationId: currentScene.id,
      sceneLocationId: policyChild.id,
      matchedLocation: policyChild,
      source: "opening_stage_in_policy",
    };
  }

  return concrete;
}
