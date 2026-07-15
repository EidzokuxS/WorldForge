import { describe, expect, it } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  isActorPresentAtScene,
  isSceneInMacroRegion,
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
      {
        id: "warehouse",
        name: "Warehouse",
        description: "A separate establishment inside the harbor.",
        kind: "persistent_sublocation",
        parentLocationId: "harbor",
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

describe("Campaign Play scene location", () => {
  it("keeps sibling establishments in one region mechanically separate", () => {
    const world = locationWorld();

    expect(isSceneInMacroRegion(world, "tower", "harbor")).toBe(true);
    expect(isSceneInMacroRegion(world, "island", "harbor")).toBe(false);
    expect(isActorPresentAtScene(world, "keeper", "tower")).toBe(true);
    expect(isActorPresentAtScene(world, "keeper", "warehouse")).toBe(false);
    expect(isActorPresentAtScene(world, "keeper", "harbor")).toBe(false);
    expect(isActorPresentAtScene(world, "resident", "tower")).toBe(false);
  });
});
