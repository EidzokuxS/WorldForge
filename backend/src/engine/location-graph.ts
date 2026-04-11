import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { locationEdges, locations } from "../db/schema.js";

export type LocationGraphLocation = Pick<
  typeof locations.$inferSelect,
  | "id"
  | "campaignId"
  | "name"
  | "kind"
  | "persistence"
  | "archivedAtTick"
  | "expiresAtTick"
>;

export type LocationGraphEdge = Pick<
  typeof locationEdges.$inferSelect,
  "id" | "campaignId" | "fromLocationId" | "toLocationId" | "travelCost" | "discovered"
>;

export type ResolvedLocationTarget = {
  locationId: string;
  locationName: string;
};

export type ResolvedTravelPath = {
  destinationId: string;
  locationIds: string[];
  edgeIds: string[];
  totalTravelCost: number;
};

type LoadLocationGraphParams = {
  campaignId: string;
};

type ResolveLocationTargetParams = {
  targetName: string;
  locations: readonly LocationGraphLocation[];
  currentTick?: number;
  allowArchived?: boolean;
};

type ResolveTravelPathParams = {
  campaignId: string;
  fromLocationId: string;
  toLocationId: string;
  edges: readonly LocationGraphEdge[];
  locations?: readonly LocationGraphLocation[];
  currentTick?: number;
  includeUndiscovered?: boolean;
  allowArchived?: boolean;
};

type ListConnectedPathsParams = {
  campaignId: string;
  fromLocationId: string;
  edges: readonly LocationGraphEdge[];
  locations: readonly LocationGraphLocation[];
  currentTick?: number;
  includeUndiscovered?: boolean;
  allowArchived?: boolean;
};

type ConnectedPathSummary = {
  edgeId: string;
  locationId: string;
  locationName: string;
  travelCost: number;
};

function normalizeLocationName(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function isTraversableLocation(
  location: LocationGraphLocation | null | undefined,
  currentTick: number,
  allowArchived: boolean,
): boolean {
  if (!location) {
    return false;
  }
  if (allowArchived) {
    return true;
  }
  if (location.archivedAtTick != null) {
    return false;
  }
  if (
    location.persistence === "ephemeral" &&
    location.expiresAtTick != null &&
    location.expiresAtTick <= currentTick
  ) {
    return false;
  }
  return true;
}

function getLocationPriority(location: LocationGraphLocation): number {
  if (location.archivedAtTick != null) {
    return 0;
  }
  if (location.persistence === "persistent") {
    return 3;
  }
  if (location.kind === "persistent_sublocation") {
    return 2;
  }
  return 1;
}

export function loadLocationGraph({
  campaignId,
}: LoadLocationGraphParams): {
  locations: LocationGraphLocation[];
  edges: LocationGraphEdge[];
} {
  const db = getDb();

  const graphLocations = db
    .select({
      id: locations.id,
      campaignId: locations.campaignId,
      name: locations.name,
      kind: locations.kind,
      persistence: locations.persistence,
      archivedAtTick: locations.archivedAtTick,
      expiresAtTick: locations.expiresAtTick,
    })
    .from(locations)
    .where(eq(locations.campaignId, campaignId))
    .all();

  const graphEdges = db
    .select({
      id: locationEdges.id,
      campaignId: locationEdges.campaignId,
      fromLocationId: locationEdges.fromLocationId,
      toLocationId: locationEdges.toLocationId,
      travelCost: locationEdges.travelCost,
      discovered: locationEdges.discovered,
    })
    .from(locationEdges)
    .where(eq(locationEdges.campaignId, campaignId))
    .all();

  return {
    locations: graphLocations,
    edges: graphEdges,
  };
}

export function resolveLocationTarget({
  targetName,
  locations,
  currentTick = 0,
  allowArchived = false,
}: ResolveLocationTargetParams): ResolvedLocationTarget | null {
  const rawTarget = targetName.trim();
  if (!rawTarget) {
    return null;
  }

  const normalizedTarget = normalizeLocationName(rawTarget);
  const matches = locations.filter(
    (location) =>
      location.id === rawTarget || normalizeLocationName(location.name) === normalizedTarget,
  );

  if (matches.length === 0) {
    return null;
  }

  const rankedMatches = [...matches].sort((left, right) => {
    const priorityDelta = getLocationPriority(right) - getLocationPriority(left);
    if (priorityDelta !== 0) {
      return priorityDelta;
    }
    const leftTraversable = isTraversableLocation(left, currentTick, allowArchived);
    const rightTraversable = isTraversableLocation(right, currentTick, allowArchived);
    if (leftTraversable !== rightTraversable) {
      return leftTraversable ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });

  const canonicalMatch =
    rankedMatches.find((location) =>
      isTraversableLocation(location, currentTick, allowArchived),
    ) ?? rankedMatches[0];

  if (!allowArchived && !isTraversableLocation(canonicalMatch, currentTick, false)) {
    return null;
  }

  return {
    locationId: canonicalMatch.id,
    locationName: canonicalMatch.name,
  };
}

export function resolveTravelPath({
  campaignId,
  fromLocationId,
  toLocationId,
  edges,
  locations = [],
  currentTick = 0,
  includeUndiscovered = false,
  allowArchived = false,
}: ResolveTravelPathParams): ResolvedTravelPath | null {
  void campaignId;

  if (fromLocationId === toLocationId) {
    return {
      destinationId: toLocationId,
      locationIds: [fromLocationId],
      edgeIds: [],
      totalTravelCost: 0,
    };
  }

  const locationById = new Map(locations.map((location) => [location.id, location]));
  const traversableLocationIds =
    locations.length > 0
      ? new Set(
          locations
            .filter((location) => isTraversableLocation(location, currentTick, allowArchived))
            .map((location) => location.id),
        )
      : null;

  const isAllowedLocationId = (locationId: string): boolean => {
    if (locationId === fromLocationId) {
      return true;
    }
    if (!traversableLocationIds) {
      return true;
    }
    return traversableLocationIds.has(locationId);
  };

  if (!isAllowedLocationId(toLocationId)) {
    return null;
  }

  const outgoingEdges = new Map<string, LocationGraphEdge[]>();
  for (const edge of edges) {
    if (!includeUndiscovered && !edge.discovered) {
      continue;
    }
    if (!isAllowedLocationId(edge.fromLocationId) || !isAllowedLocationId(edge.toLocationId)) {
      continue;
    }
    const nextEdges = outgoingEdges.get(edge.fromLocationId) ?? [];
    nextEdges.push(edge);
    outgoingEdges.set(edge.fromLocationId, nextEdges);
  }

  const distances = new Map<string, number>([[fromLocationId, 0]]);
  const previousEdgeByLocation = new Map<string, LocationGraphEdge>();
  const previousLocationByLocation = new Map<string, string>();
  const frontier = new Set<string>([fromLocationId]);

  while (frontier.size > 0) {
    let currentLocationId: string | null = null;
    let currentDistance = Number.POSITIVE_INFINITY;

    for (const candidateLocationId of frontier) {
      const candidateDistance = distances.get(candidateLocationId) ?? Number.POSITIVE_INFINITY;
      if (candidateDistance < currentDistance) {
        currentDistance = candidateDistance;
        currentLocationId = candidateLocationId;
      }
    }

    if (!currentLocationId) {
      break;
    }

    frontier.delete(currentLocationId);

    if (currentLocationId === toLocationId) {
      break;
    }

    for (const edge of outgoingEdges.get(currentLocationId) ?? []) {
      const nextDistance = currentDistance + edge.travelCost;
      const recordedDistance = distances.get(edge.toLocationId);
      if (recordedDistance != null && recordedDistance <= nextDistance) {
        continue;
      }
      distances.set(edge.toLocationId, nextDistance);
      previousEdgeByLocation.set(edge.toLocationId, edge);
      previousLocationByLocation.set(edge.toLocationId, currentLocationId);
      frontier.add(edge.toLocationId);
    }
  }

  if (!distances.has(toLocationId)) {
    return null;
  }

  const edgeIds: string[] = [];
  const locationIds = [toLocationId];
  let cursor = toLocationId;

  while (cursor !== fromLocationId) {
    const edge = previousEdgeByLocation.get(cursor);
    const previousLocationId = previousLocationByLocation.get(cursor);
    if (!edge || !previousLocationId) {
      return null;
    }
    edgeIds.unshift(edge.id);
    locationIds.unshift(previousLocationId);
    cursor = previousLocationId;
  }

  const totalTravelCost = distances.get(toLocationId) ?? 0;
  if (locationIds.length > 1 && locations.length > 0) {
    const missingLocation = locationIds.some((locationId) => !locationById.has(locationId));
    if (missingLocation) {
      return null;
    }
  }

  return {
    destinationId: toLocationId,
    locationIds,
    edgeIds,
    totalTravelCost,
  };
}

export function listConnectedPaths({
  campaignId,
  fromLocationId,
  edges,
  locations,
  currentTick = 0,
  includeUndiscovered = false,
  allowArchived = false,
}: ListConnectedPathsParams): ConnectedPathSummary[] {
  void campaignId;

  const locationById = new Map(locations.map((location) => [location.id, location]));

  return edges
    .filter((edge) => edge.fromLocationId === fromLocationId)
    .filter((edge) => includeUndiscovered || edge.discovered)
    .map((edge) => {
      const target = locationById.get(edge.toLocationId);
      if (!isTraversableLocation(target, currentTick, allowArchived)) {
        return null;
      }
      return {
        edgeId: edge.id,
        locationId: edge.toLocationId,
        locationName: target.name,
        travelCost: edge.travelCost,
      };
    })
    .filter((path): path is ConnectedPathSummary => path != null)
    .sort((left, right) => {
      if (left.travelCost !== right.travelCost) {
        return left.travelCost - right.travelCost;
      }
      return left.locationName.localeCompare(right.locationName);
    });
}

export function resolveCampaignLocationTarget(input: {
  campaignId: string;
  targetName: string;
  currentTick?: number;
  allowArchived?: boolean;
}): ResolvedLocationTarget | null {
  const graph = loadLocationGraph({ campaignId: input.campaignId });
  return resolveLocationTarget({
    targetName: input.targetName,
    locations: graph.locations,
    currentTick: input.currentTick,
    allowArchived: input.allowArchived,
  });
}

export function resolveCampaignTravelPath(input: {
  campaignId: string;
  fromLocationId: string;
  toLocationId: string;
  currentTick?: number;
  includeUndiscovered?: boolean;
  allowArchived?: boolean;
}): ResolvedTravelPath | null {
  const graph = loadLocationGraph({ campaignId: input.campaignId });
  return resolveTravelPath({
    campaignId: input.campaignId,
    fromLocationId: input.fromLocationId,
    toLocationId: input.toLocationId,
    edges: graph.edges,
    locations: graph.locations,
    currentTick: input.currentTick,
    includeUndiscovered: input.includeUndiscovered,
    allowArchived: input.allowArchived,
  });
}
