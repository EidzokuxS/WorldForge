import type { CampaignWorldReview } from "@worldforge/shared";

export function isSceneInMacroRegion(
  world: CampaignWorldReview,
  sceneLocationId: string,
  macroLocationId: string,
): boolean {
  const scene = world.locations.find((location) => location.id === sceneLocationId);
  const macro = world.locations.find((location) => location.id === macroLocationId);
  return scene?.kind === "persistent_sublocation"
    && macro?.kind === "macro"
    && scene.parentLocationId === macro.id;
}

export function isActorPresentAtScene(
  world: CampaignWorldReview,
  actorId: string,
  sceneLocationId: string,
): boolean {
  const scene = world.locations.find((location) => location.id === sceneLocationId);
  return scene?.kind === "persistent_sublocation" && world.placements.some((placement) =>
    placement.actorId === actorId
    && placement.placementKind === "present"
    && placement.locationId === sceneLocationId
  );
}
