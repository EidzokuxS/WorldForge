import { describe, expect, it } from "vitest";

describe("resolveTravelPath", () => {
  it("resolves a multi-edge path with summed travel cost instead of adjacency-only teleport movement", async () => {
    const { resolveTravelPath } = await import("../location-graph.js");

    const path = resolveTravelPath({
      campaignId: "campaign-1",
      fromLocationId: "macro-shibuya",
      toLocationId: "macro-school",
      edges: [
        {
          id: "edge-1",
          fromLocationId: "macro-shibuya",
          toLocationId: "station-platform",
          travelCost: 1,
          discovered: true,
        },
        {
          id: "edge-2",
          fromLocationId: "station-platform",
          toLocationId: "macro-school",
          travelCost: 2,
          discovered: true,
        },
      ],
    });

    expect(path).toEqual({
      destinationId: "macro-school",
      locationIds: ["macro-shibuya", "station-platform", "macro-school"],
      edgeIds: ["edge-1", "edge-2"],
      totalTravelCost: 3,
    });
  });

  it("skips expired or archived ephemeral scene nodes when resolving normal travel", async () => {
    const { resolveTravelPath } = await import("../location-graph.js");

    const path = resolveTravelPath({
      campaignId: "campaign-1",
      fromLocationId: "macro-shibuya",
      toLocationId: "macro-school",
      currentTick: 8,
      locations: [
        {
          id: "macro-shibuya",
          name: "Shibuya",
          kind: "macro",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
        {
          id: "alley-pocket",
          name: "Alley Pocket",
          kind: "ephemeral_scene",
          persistence: "ephemeral",
          archivedAtTick: null,
          expiresAtTick: 8,
        },
        {
          id: "macro-school",
          name: "Tokyo Jujutsu High",
          kind: "macro",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
      ],
      edges: [
        {
          id: "edge-1",
          fromLocationId: "macro-shibuya",
          toLocationId: "alley-pocket",
          travelCost: 1,
          discovered: true,
        },
        {
          id: "edge-2",
          fromLocationId: "alley-pocket",
          toLocationId: "macro-school",
          travelCost: 1,
          discovered: true,
        },
      ],
    });

    expect(path).toBeNull();
  });

  it("returns null for an unreachable destination so travel cost is never fabricated", async () => {
    const { resolveTravelPath } = await import("../location-graph.js");

    const path = resolveTravelPath({
      campaignId: "campaign-1",
      fromLocationId: "macro-shibuya",
      toLocationId: "sealed-rooftop",
      edges: [
        {
          id: "edge-1",
          fromLocationId: "macro-shibuya",
          toLocationId: "station-platform",
          travelCost: 1,
          discovered: true,
        },
      ],
    });

    expect(path).toBeNull();
  });
});

describe("resolveLocationTarget", () => {
  it("returns one canonical location id for case-insensitive destination names before path resolution", async () => {
    const { resolveLocationTarget } = await import("../location-graph.js");

    const target = resolveLocationTarget({
      targetName: "tokyo jujutsu high",
      currentTick: 8,
      locations: [
        {
          id: "loc-old-school",
          name: "Tokyo Jujutsu High",
          kind: "ephemeral_scene",
          persistence: "ephemeral",
          archivedAtTick: 5,
          expiresAtTick: 4,
        },
        {
          id: "loc-school",
          name: "Tokyo Jujutsu High",
          kind: "macro",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
      ],
    });

    expect(target).toEqual({
      locationId: "loc-school",
      locationName: "Tokyo Jujutsu High",
    });
  });
});

describe("listConnectedPaths", () => {
  it("returns adjacent discovered paths with normalized travel cost summaries", async () => {
    const { listConnectedPaths } = await import("../location-graph.js");

    const connectedPaths = listConnectedPaths({
      campaignId: "campaign-1",
      fromLocationId: "macro-shibuya",
      currentTick: 2,
      locations: [
        {
          id: "macro-shibuya",
          name: "Shibuya",
          kind: "macro",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
        {
          id: "station-platform",
          name: "Station Platform",
          kind: "persistent_sublocation",
          persistence: "persistent",
          archivedAtTick: null,
          expiresAtTick: null,
        },
      ],
      edges: [
        {
          id: "edge-1",
          fromLocationId: "macro-shibuya",
          toLocationId: "station-platform",
          travelCost: 2,
          discovered: true,
        },
      ],
    });

    expect(connectedPaths).toEqual([
      {
        edgeId: "edge-1",
        locationId: "station-platform",
        locationName: "Station Platform",
        travelCost: 2,
      },
    ]);
  });
});
