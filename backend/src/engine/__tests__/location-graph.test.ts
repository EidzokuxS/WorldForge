import { describe, it, expect } from "vitest";

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
