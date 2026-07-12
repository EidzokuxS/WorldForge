import type { CampaignWorldReview } from "@worldforge/shared";

export function isLocationWithinOpeningArea(
  world: CampaignWorldReview,
  locationId: string,
  openingLocationId: string,
): boolean {
  const locations = new Map(world.locations.map((location) => [location.id, location]));
  const visited = new Set<string>();
  let currentId: string | null = locationId;

  while (currentId !== null && !visited.has(currentId)) {
    if (currentId === openingLocationId) return true;
    visited.add(currentId);
    currentId = locations.get(currentId)?.parentLocationId ?? null;
  }

  return false;
}

export function isActorPresentInOpeningArea(
  world: CampaignWorldReview,
  actorId: string,
  openingLocationId: string,
): boolean {
  return world.placements.some((placement) =>
    placement.actorId === actorId
    && placement.placementKind === "present"
    && isLocationWithinOpeningArea(world, placement.locationId, openingLocationId)
  );
}
