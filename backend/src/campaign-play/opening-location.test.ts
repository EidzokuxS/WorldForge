import { describe, expect, it } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  isActorPresentInOpeningArea,
  isLocationWithinOpeningArea,
} from "./opening-location.js";

function locationWorld(): CampaignWorldReview {
  return {
    campaignId: "campaign-opening-location",
    status: "accepted",
    version: 1,
    contentHash: "a".repeat(64),
    sourceDigest: "b".repeat(64),
    worldSummary: "A harbor and its signal tower.",
    locations: [
      {
        id: "harbor",
        name: "Harbor",
        description: "A broad harbor district.",
        kind: "macro",
        parentLocationId: null,
        tags: [],
        isStarting: true,
      },
      {
        id: "tower",
        name: "Signal Tower",
        description: "A tower inside the harbor.",
        kind: "persistent_sublocation",
        parentLocationId: "harbor",
        tags: [],
        isStarting: false,
      },
      {
        id: "island",
        name: "Island",
        description: "A separate island.",
        kind: "macro",
        parentLocationId: null,
        tags: [],
        isStarting: false,
      },
    ],
    routes: [],
    actors: [],
    goals: [],
    relations: [],
    placements: [
      {
        id: "placement-keeper",
        actorId: "keeper",
        locationId: "tower",
        placementKind: "present",
      },
      {
        id: "placement-resident",
        actorId: "resident",
        locationId: "harbor",
        placementKind: "home",
      },
    ],
    pressures: [],
    builtAt: 1,
    acceptedAt: 2,
    source: {
      premise: "A harbor under pressure.",
      dna: null,
      researchSummary: null,
      sourceReferences: [],
    },
  };
}

describe("Campaign Play opening area", () => {
  it("treats a nested place as part of its macro opening area", () => {
    const world = locationWorld();

    expect(isLocationWithinOpeningArea(world, "tower", "harbor")).toBe(true);
    expect(isLocationWithinOpeningArea(world, "island", "harbor")).toBe(false);
    expect(isActorPresentInOpeningArea(world, "keeper", "harbor")).toBe(true);
    expect(isActorPresentInOpeningArea(world, "resident", "harbor")).toBe(false);
  });
});
