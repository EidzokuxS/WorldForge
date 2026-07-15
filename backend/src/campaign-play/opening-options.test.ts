import { describe, expect, it } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import type { LoadedCampaignPlayState } from "./campaign-play-state-repository.js";
import { buildCampaignPlayOpeningOptions } from "./opening-options.js";

function openingWorld(): CampaignWorldReview {
  return {
    campaignId: "campaign-opening-options",
    status: "accepted",
    version: 1,
    contentHash: "a".repeat(64),
    sourceDigest: "b".repeat(64),
    worldSummary: "A valley connected to a terrace through a lift station.",
    locations: [
      {
        id: "valley",
        name: "Valley",
        description: "A valley settlement below the terraces.",
        kind: "macro",
        parentLocationId: null,
        tags: [],
        isStarting: true,
      },
      {
        id: "lift-station",
        name: "Lift Station",
        description: "A station inside the valley opening area.",
        kind: "persistent_sublocation",
        parentLocationId: "valley",
        tags: [],
        isStarting: false,
      },
      {
        id: "terrace",
        name: "Terrace",
        description: "A reachable terrace above the valley.",
        kind: "macro",
        parentLocationId: null,
        tags: [],
        isStarting: false,
      },
      {
        id: "terrace-office",
        name: "Terrace Office",
        description: "A public office above the valley.",
        kind: "persistent_sublocation",
        parentLocationId: "terrace",
        tags: [],
        isStarting: false,
      },
    ],
    routes: [
      {
        id: "route-to-lift",
        fromLocationId: "lift-station",
        toLocationId: "terrace-office",
        travelCost: 2,
      },
    ],
    actors: [
      {
        id: "mechanic",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Mechanic",
        summary: "A mechanic working at the lift station.",
        traits: [],
        tags: [],
      },
    ],
    goals: [],
    relations: [],
    placements: [
      {
        id: "mechanic-present",
        actorId: "mechanic",
        locationId: "lift-station",
        placementKind: "present",
      },
    ],
    pressures: [
      {
        id: "lift-pressure",
        name: "Failing lift",
        description: "The lift is close to seizing.",
        trajectory: "Transit will stop without repairs.",
        urgency: 4,
        actorIds: ["mechanic"],
        locationIds: ["lift-station"],
      },
    ],
    builtAt: 1,
    acceptedAt: 2,
    source: {
      premise: "A valley depends on a failing lift.",
      dna: null,
      researchSummary: null,
      sourceReferences: [],
    },
  };
}

describe("Campaign Play opening options", () => {
  it("offers a macro region when one exact child scene has support, pressure, and a route", () => {
    const world = openingWorld();
    const state = {
      authority: {
        campaignId: world.campaignId,
        setupPhase: "opening_required",
      },
      acceptedReview: world,
      eligibility: {
        projection: {
          eligible: true,
          reachableSceneLocationIds: ["lift-station", "terrace-office"],
        },
      },
    } as unknown as LoadedCampaignPlayState;

    expect(buildCampaignPlayOpeningOptions(state)).toEqual([
      expect.objectContaining({ name: "Valley" }),
    ]);
  });
});
