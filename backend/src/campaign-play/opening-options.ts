import type {
  CampaignPlayOpeningLocationOption,
  CampaignPlayStartingConditions,
} from "@worldforge/shared";
import {
  campaignPlayOpeningLocationOptionSchema,
  validateCampaignPlayStartingConditionsAgainstOptions,
} from "./contracts.js";
import { deriveCampaignPlayPublicHandle } from "./campaign-play-projection.js";
import type { LoadedCampaignPlayState } from "./campaign-play-state-repository.js";

const ROLE_OPTIONS = [
  { key: "outsider", label: "Outsider" },
  { key: "local", label: "Local" },
  { key: "hired-hand", label: "Hired hand" },
] as const;

const ARRIVAL_MODE_OPTIONS = [
  { key: "just-arrived", label: "Just arrived" },
  { key: "already-here", label: "Already here" },
  { key: "passing-through", label: "Passing through" },
] as const;

const IMMEDIATE_SITUATION_OPTIONS = [
  { key: "following-a-lead", label: "Following a lead" },
  { key: "looking-for-work", label: "Looking for work" },
  { key: "local-trouble", label: "Caught in local trouble" },
] as const;

export interface CampaignPlayResolvedPublicStartingConditions {
  mode: "delegate" | "chosen";
  locationId?: string;
  role?: string;
  arrivalMode?: string;
  immediateSituation?: string;
}

function detailOptions(
  campaignId: string,
  locationId: string,
  family: string,
  options: readonly { key: string; label: string }[],
) {
  return options.map((option) => ({
    handle: deriveCampaignPlayPublicHandle(
      `opening-${family}`,
      campaignId,
      `${locationId}:${option.key}`,
    ),
    label: option.label,
  }));
}

function isViableOpeningLocation(
  state: LoadedCampaignPlayState,
  locationId: string,
): boolean {
  const review = state.acceptedReview;
  const supportActorIds = new Set(
    review.actors
      .filter((actor) => actor.kind === "person" && actor.role === "support")
      .map((actor) => actor.id),
  );
  const hasSupport = review.placements.some((placement) =>
    placement.locationId === locationId &&
    placement.placementKind === "present" &&
    supportActorIds.has(placement.actorId)
  );
  const hasPressure = review.pressures.some((pressure) =>
    pressure.locationIds.includes(locationId)
  );
  const reachable = new Set(state.eligibility.projection.reachableMacroLocationIds);
  const hasRoute = review.routes.some((route) =>
    route.fromLocationId === locationId &&
    route.toLocationId !== locationId &&
    reachable.has(route.toLocationId)
  );
  return hasSupport && hasPressure && hasRoute;
}

export function buildCampaignPlayOpeningOptions(
  state: LoadedCampaignPlayState,
): CampaignPlayOpeningLocationOption[] {
  if (
    !state.eligibility.projection.eligible ||
    state.authority.setupPhase !== "opening_required"
  ) {
    return [];
  }
  const reachable = new Set(state.eligibility.projection.reachableMacroLocationIds);
  return state.acceptedReview.locations
    .filter((location) =>
      location.kind === "macro" &&
      reachable.has(location.id) &&
      isViableOpeningLocation(state, location.id)
    )
    .sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
    .slice(0, 12)
    .map((location) => campaignPlayOpeningLocationOptionSchema.parse({
      locationHandle: deriveCampaignPlayPublicHandle(
        "location",
        state.authority.campaignId,
        location.id,
      ),
      name: location.name,
      description: location.description,
      roles: detailOptions(
        state.authority.campaignId,
        location.id,
        "role",
        ROLE_OPTIONS,
      ),
      arrivalModes: detailOptions(
        state.authority.campaignId,
        location.id,
        "arrival",
        ARRIVAL_MODE_OPTIONS,
      ),
      immediateSituations: detailOptions(
        state.authority.campaignId,
        location.id,
        "situation",
        IMMEDIATE_SITUATION_OPTIONS,
      ),
    }));
}

export function resolveCampaignPlayStartingConditions(
  state: LoadedCampaignPlayState,
  startingConditions: CampaignPlayStartingConditions,
): CampaignPlayResolvedPublicStartingConditions {
  if (startingConditions.mode === "delegate") return { mode: "delegate" };
  const options = buildCampaignPlayOpeningOptions(state);
  validateCampaignPlayStartingConditionsAgainstOptions(startingConditions, options);
  const location = options.find((option) =>
    option.locationHandle === startingConditions.locationHandle
  )!;
  const acceptedLocation = state.acceptedReview.locations.find((candidate) =>
    deriveCampaignPlayPublicHandle(
      "location",
      state.authority.campaignId,
      candidate.id,
    ) === location.locationHandle
  )!;
  return {
    mode: "chosen",
    locationId: acceptedLocation.id,
    role: location.roles.find((option) =>
      option.handle === startingConditions.roleHandle
    )!.label,
    arrivalMode: location.arrivalModes.find((option) =>
      option.handle === startingConditions.arrivalModeHandle
    )!.label,
    immediateSituation: location.immediateSituations.find((option) =>
      option.handle === startingConditions.immediateSituationHandle
    )!.label,
  };
}
