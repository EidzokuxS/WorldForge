import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { adaptScaffoldLocationsToWorldGraph } from "../locations-adapter.js";
import type { ScaffoldLocation } from "../../worldgen/types.js";

const LOCATIONS: ScaffoldLocation[] = [
  {
    name: "Lantern Bar",
    description: "A salt-stained harbor bar with a guarded back room.",
    tags: ["harbor", "neutral ground", "harbor"],
    isStarting: true,
    connectedTo: ["Old Customs House"],
    kind: "macro",
  },
  {
    name: "Lantern Bar Back Room",
    description: "A cramped room behind a bead curtain where smugglers trade sealed ledgers.",
    tags: ["private", "smuggling"],
    isStarting: false,
    connectedTo: [],
    kind: "persistent_sublocation",
    parentLocationName: "Lantern Bar",
  },
  {
    name: "Old Customs House",
    description: "A shuttered customs office with fresh footprints near the river stairs.",
    tags: ["abandoned"],
    isStarting: false,
    connectedTo: ["Lantern Bar"],
    kind: "macro",
  },
];

describe("campaign kernel locations adapter", () => {
  it("maps scaffold locations into campaign kernel graph nodes and spatial edges", () => {
    const graph = adaptScaffoldLocationsToWorldGraph(LOCATIONS);

    const lantern = graph.nodes.find((node) => node.name === "Lantern Bar");
    const backRoom = graph.nodes.find((node) => node.name === "Lantern Bar Back Room");
    const customsHouse = graph.nodes.find((node) => node.name === "Old Customs House");

    expect(lantern).toMatchObject({
      type: "Location",
      data: {
        description: "A salt-stained harbor bar with a guarded back room.",
        tags: ["harbor", "neutral ground"],
        isStarting: true,
        kind: "macro",
      },
    });
    expect(backRoom).toMatchObject({
      type: "SceneLocation",
      data: {
        parentLocationName: "Lantern Bar",
      },
    });
    expect(customsHouse).toMatchObject({
      type: "Location",
    });

    expect(graph.edges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fromId: lantern?.id,
          toId: customsHouse?.id,
          type: "route_to",
          data: {
            sourceName: "Lantern Bar",
            targetName: "Old Customs House",
          },
        }),
        expect.objectContaining({
          fromId: customsHouse?.id,
          toId: lantern?.id,
          type: "route_to",
        }),
        expect.objectContaining({
          fromId: backRoom?.id,
          toId: lantern?.id,
          type: "located_at",
        }),
      ]),
    );
  });

  it("throws when a location name is duplicated", () => {
    expect(() =>
      adaptScaffoldLocationsToWorldGraph([
        LOCATIONS[0]!,
        { ...LOCATIONS[0]!, name: " lantern bar " },
      ]),
    ).toThrow("Location lantern bar is duplicated before A4 can run.");
  });

  it("throws when a route target is missing", () => {
    expect(() =>
      adaptScaffoldLocationsToWorldGraph([
        {
          ...LOCATIONS[0]!,
          connectedTo: ["Missing Pier"],
        },
      ]),
    ).toThrow("Location Lantern Bar references missing route target Missing Pier.");
  });

  it("throws when a scene parent is missing", () => {
    expect(() =>
      adaptScaffoldLocationsToWorldGraph([
        {
          ...LOCATIONS[1]!,
          parentLocationName: "Missing Bar",
        },
      ]),
    ).toThrow("Location Lantern Bar Back Room references missing parent location Missing Bar.");
  });

  it("does not import old route or generator implementations", () => {
    const source = fs.readFileSync(
      path.resolve(process.cwd(), "src/campaign-kernel/locations-adapter.ts"),
      "utf-8",
    );

    expect(source).not.toContain("/api/worldgen/generate");
    expect(source).not.toContain("scaffold-generator");
    expect(source).not.toContain("generateScaffold");
  });
});
