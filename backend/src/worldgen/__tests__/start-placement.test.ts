import { describe, expect, it } from "vitest";

import {
  resolveConcreteStartPlacement,
  resolveOpeningStageInPlacement,
  type StartPlacementLocationCandidate,
} from "../start-placement.js";

describe("start placement", () => {
  it("resolves macro start rows to the concrete starting child scene", () => {
    const locations: StartPlacementLocationCandidate[] = [
      {
        id: "loc-macro",
        name: "Transit Ward",
        kind: "macro",
      },
      {
        id: "loc-concourse",
        name: "Station Concourse",
        kind: "persistent_sublocation",
        parentLocationId: "loc-macro",
        isStarting: true,
      },
    ];

    const placement = resolveConcreteStartPlacement(locations[0]!, locations);

    expect(placement).toMatchObject({
      ok: true,
      broadLocationId: "loc-macro",
      sceneLocationId: "loc-concourse",
      matchedLocation: expect.objectContaining({ name: "Station Concourse" }),
    });
  });

  it("rejects ambiguous character macro starts before play", () => {
    const locations: StartPlacementLocationCandidate[] = [
      {
        id: "loc-macro",
        name: "Shibuya District",
        kind: "macro",
      },
      {
        id: "loc-underpass",
        name: "Shibuya Pedestrian Underpass",
        kind: "persistent_sublocation",
        parentLocationId: "loc-macro",
      },
      {
        id: "loc-rooftop",
        name: "Shibuya Rooftop Overlook",
        kind: "persistent_sublocation",
        parentLocationId: "loc-macro",
      },
    ];

    const placement = resolveConcreteStartPlacement(locations[0]!, locations);

    expect(placement).toMatchObject({
      ok: false,
      error: expect.stringContaining("must resolve to one concrete sublocation"),
    });
  });

  it("uses the explicit starting child scene for opening stage-in", () => {
    const locations: StartPlacementLocationCandidate[] = [
      {
        id: "loc-shibuya",
        name: "Shibuya District",
        kind: "macro",
        description:
          "Civilians shop above while anomalous bursts surge through underground passages.",
      },
      {
        id: "loc-underpass",
        name: "Shibuya Pedestrian Underpass",
        kind: "persistent_sublocation",
        parentLocationId: "loc-shibuya",
        isStarting: true,
        description: "A tile-floored pedestrian tunnel runs beneath the surface roads.",
        tags: ["Underground", "Crowded"],
      },
      {
        id: "loc-rooftop",
        name: "Shibuya Rooftop Overlook",
        kind: "persistent_sublocation",
        parentLocationId: "loc-shibuya",
        description: "A rooftop watches the underpass entrance from above.",
        tags: ["Outdoor", "Elevated"],
      },
    ];

    const placement = resolveOpeningStageInPlacement({
      playerCurrentLocationId: "loc-shibuya",
      playerCurrentSceneLocationId: "loc-shibuya",
      locations,
    });

    expect(placement).toMatchObject({
      ok: true,
      mode: "existing_child",
      broadLocationId: "loc-shibuya",
      sceneLocationId: "loc-underpass",
      source: "starting_child",
    });
  });

  it("uses opening stage-in policy for legacy macro starts with one public playable child", () => {
    const locations: StartPlacementLocationCandidate[] = [
      {
        id: "loc-ward",
        name: "Glass Ward",
        kind: "macro",
        description: "Market stalls glare under rain and reflected neon.",
      },
      {
        id: "loc-hidden",
        name: "Glass Ward Hidden Office",
        kind: "persistent_sublocation",
        parentLocationId: "loc-ward",
        description: "A private office sealed behind staff doors.",
        tags: ["Hidden"],
      },
      {
        id: "loc-arcade",
        name: "Glass Ward Arcade",
        kind: "persistent_sublocation",
        parentLocationId: "loc-ward",
        description: "A covered shopping arcade opens toward the wet street.",
        tags: ["Public"],
      },
    ];

    const placement = resolveOpeningStageInPlacement({
      playerCurrentLocationId: "loc-ward",
      playerCurrentSceneLocationId: "loc-ward",
      locations,
    });

    expect(placement).toMatchObject({
      ok: true,
      mode: "existing_child",
      broadLocationId: "loc-ward",
      sceneLocationId: "loc-arcade",
      source: "opening_stage_in_policy",
    });
  });

  it("uses opening stage-in policy for a Shibuya macro start without legacy isStarting markers", () => {
    const locations: StartPlacementLocationCandidate[] = [
      {
        id: "loc-shibuya",
        name: "Shibuya District",
        kind: "macro",
      },
      {
        id: "loc-warehouse",
        name: "Abandoned Warehouse Hideout",
        kind: "persistent_sublocation",
        parentLocationId: "loc-shibuya",
        tags: ["Indoor", "Hidden", "Controlled by Kenjaku's Curse User Alliance"],
      },
      {
        id: "loc-alley",
        name: "Shibuya Back-Alley Meeting Point",
        kind: "persistent_sublocation",
        parentLocationId: "loc-shibuya",
        tags: ["Alley", "Urban", "Unmonitored"],
      },
      {
        id: "loc-underpass",
        name: "Shibuya Pedestrian Underpass",
        kind: "persistent_sublocation",
        parentLocationId: "loc-shibuya",
        tags: ["Underground", "Crowded", "Hazardous Anomaly", "Low-Grade Curse Habitat"],
      },
      {
        id: "loc-rooftop",
        name: "Shibuya Rooftop Overlook",
        kind: "persistent_sublocation",
        parentLocationId: "loc-shibuya",
        tags: ["Outdoor", "Elevated", "Unmonitored"],
      },
    ];

    const placement = resolveOpeningStageInPlacement({
      playerCurrentLocationId: "loc-shibuya",
      playerCurrentSceneLocationId: "loc-shibuya",
      locations,
    });

    expect(placement).toMatchObject({
      ok: true,
      mode: "existing_child",
      broadLocationId: "loc-shibuya",
      sceneLocationId: "loc-underpass",
      source: "opening_stage_in_policy",
    });
  });

  it("rejects an opening macro start when no concrete child has a distinct stage-in signal", () => {
    const locations: StartPlacementLocationCandidate[] = [
      {
        id: "loc-ward",
        name: "Glass Ward",
        kind: "macro",
      },
      {
        id: "loc-north",
        name: "North Room",
        kind: "persistent_sublocation",
        parentLocationId: "loc-ward",
      },
      {
        id: "loc-south",
        name: "South Room",
        kind: "persistent_sublocation",
        parentLocationId: "loc-ward",
      },
    ];

    const placement = resolveOpeningStageInPlacement({
      playerCurrentLocationId: "loc-ward",
      playerCurrentSceneLocationId: "loc-ward",
      locations,
    });

    expect(placement).toMatchObject({
      ok: false,
      error: expect.stringContaining("must resolve to one concrete sublocation"),
    });
  });
});
