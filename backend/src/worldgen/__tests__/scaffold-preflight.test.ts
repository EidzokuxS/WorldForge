import { describe, expect, it } from "vitest";
import {
  assertScaffoldPlayable,
  validateScaffoldForPlayableWorld,
} from "../scaffold-preflight.js";
import type { WorldScaffold } from "../types.js";

function playableScaffold(): WorldScaffold {
  return {
    refinedPremise: "A civic fantasy city where routes, witnesses, and permits matter.",
    locations: [
      {
        name: "Harbor Gate",
        description: "A public entry gate with clerks and visible routes.",
        tags: ["public", "gate"],
        isStarting: true,
        connectedTo: ["Market Office"],
      },
      {
        name: "Market Office",
        description: "A lawful service office for posted cases.",
        tags: ["office", "service"],
        isStarting: false,
        connectedTo: ["Harbor Gate"],
      },
    ],
    factions: [
      {
        name: "Harbor Registry",
        tags: ["civic"],
        goals: ["Keep messages routed"],
        assets: ["clerks"],
        territoryNames: ["Market Office"],
      },
    ],
    npcs: [
      {
        name: "Gate Clerk",
        persona: "A practical clerk who can answer public routing questions.",
        tags: ["clerk", "service"],
        goals: {
          shortTerm: ["Keep the queue moving"],
          longTerm: ["Avoid misfiled messages"],
        },
        locationName: "Harbor Gate",
        factionName: "Harbor Registry",
        tier: "supporting",
      },
    ],
    loreCards: [],
  };
}

describe("scaffold playable preflight", () => {
  it("accepts a connected scaffold with valid starting location and references", () => {
    const result = validateScaffoldForPlayableWorld(playableScaffold());

    expect(result.ok).toBe(true);
    expect(result.issues.filter((issue) => issue.severity === "critical")).toEqual([]);
  });

  it("rejects unknown graph and NPC references before the world can be marked generated", () => {
    const scaffold = playableScaffold();
    scaffold.locations[0] = {
      ...scaffold.locations[0]!,
      connectedTo: ["Missing Office"],
    };
    scaffold.locations[1] = {
      ...scaffold.locations[1]!,
      connectedTo: [],
    };
    scaffold.npcs[0] = {
      ...scaffold.npcs[0]!,
      locationName: "Missing Office",
    };

    const result = validateScaffoldForPlayableWorld(scaffold);

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "location_connection_missing" }),
        expect.objectContaining({ code: "location_graph_disconnected" }),
        expect.objectContaining({ code: "npc_location_missing" }),
      ]),
    );
    expect(() => assertScaffoldPlayable(scaffold)).toThrow(
      /World scaffold playable preflight failed/i,
    );
  });

  it("rejects a scaffold without a single unambiguous playable start", () => {
    const scaffold = playableScaffold();
    scaffold.locations = scaffold.locations.map((location) => ({
      ...location,
      isStarting: false,
    }));

    expect(validateScaffoldForPlayableWorld(scaffold).issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "starting_location_missing" }),
      ]),
    );
  });
});
