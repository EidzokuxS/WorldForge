import { describe, expect, it } from "vitest";
import {
  createWorldCastPacketSchema,
  createWorldConnectionsPacketSchema,
  worldFramePacketSchema,
  type WorldCastPacket,
  type WorldConnectionsPacket,
  type WorldFramePacket,
} from "./contracts.js";

function frameFixture(): WorldFramePacket {
  const locationEntries = [
    ["north-harbor", "North Harbor", "macro", null, true],
    ["glass-reef", "Glass Reef", "macro", null, false],
    ["bell-island", "Bell Island", "macro", null, false],
    ["north-dock", "North Dock", "persistent_sublocation", "north-harbor", false],
    ["signal-tower", "Signal Tower", "persistent_sublocation", "north-harbor", false],
    ["reef-market", "Reef Market", "persistent_sublocation", "glass-reef", false],
    ["tide-gate", "Tide Gate", "persistent_sublocation", "glass-reef", false],
    ["bell-foundry", "Bell Foundry", "persistent_sublocation", "bell-island", false],
    ["storm-shrine", "Storm Shrine", "persistent_sublocation", "bell-island", false],
  ] as const;
  const locations: WorldFramePacket["locations"] = locationEntries.map(([
    localName,
    name,
    kind,
    parentLocalName,
    isStarting,
  ]) => ({
    locationRef: `location:${localName}`,
    name,
    description: `${name} is a concrete part of the stormbound coast.`,
    kind: kind as "macro" | "persistent_sublocation",
    parentLocationRef: parentLocalName ? `location:${parentLocalName}` : null,
    tags: [],
    isStarting: Boolean(isStarting),
  }));

  return {
    worldSummary: "Three stormbound regions depend on routes that fail after each eclipse.",
    locations,
    routes: [
      ["north-dock", "signal-tower"],
      ["signal-tower", "reef-market"],
      ["reef-market", "tide-gate"],
      ["tide-gate", "bell-foundry"],
      ["bell-foundry", "storm-shrine"],
      ["storm-shrine", "north-dock"],
    ].map(([from, to], index) => ({
      fromLocationRef: `location:${from}`,
      toLocationRef: `location:${to}`,
      travelCost: index + 1,
    })),
  };
}

function castFixture(): WorldCastPacket {
  const actorRefs = [
    "mara-venn",
    "oren-tide",
    "sel-bell",
    "ilya-venn",
    "niko-salt",
    "rhea-quill",
  ];
  const roles = ["key", "support", "support", "background", "background", "key"] as const;
  const sceneRefs = [
    "north-dock",
    "signal-tower",
    "reef-market",
    "tide-gate",
    "bell-foundry",
    "storm-shrine",
  ];
  return {
    actors: actorRefs.map((localName, index) => ({
      actorRef: `actor:${localName}`,
      kind: "person",
      controller: "agent",
      role: roles[index]!,
      name: localName.replace("-", " "),
      summary: `${localName} has a stake in the stormbound coast.`,
      traits: ["watchful"],
      tags: ["coast"],
    })),
    goals: actorRefs.map((localName) => ({
      actorRef: `actor:${localName}`,
      objective: "Keep the next crossing open.",
      motivation: "Protect people who depend on the route.",
      horizon: "immediate" as const,
      priority: 3,
      status: "active" as const,
    })),
    placements: actorRefs.map((localName, index) => ({
      actorRef: `actor:${localName}`,
      locationRef: `location:${sceneRefs[index]!}`,
      placementKind: "present" as const,
    })),
  };
}

function connectionsFixture(): WorldConnectionsPacket {
  return {
    relations: [
      ["mara-venn", "ilya-venn"],
      ["oren-tide", "mara-venn"],
      ["sel-bell", "ilya-venn"],
      ["ilya-venn", "niko-salt"],
      ["niko-salt", "rhea-quill"],
    ].map(([source, target]) => ({
      sourceActorRef: `actor:${source}`,
      targetActorRef: `actor:${target}`,
      relationType: "association" as const,
      summary: `${source} relies on ${target}.`,
      intensity: 3,
    })),
    pressures: [
      {
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "Dockworkers lose supply access within two route cycles.",
        urgency: 5,
        actorRefs: ["actor:oren-tide", "actor:mara-venn"],
        locationRefs: ["location:signal-tower"],
      },
      {
        name: "False Bells",
        description: "Bronze bells signal storms that never arrive.",
        trajectory: "Couriers stop trusting the island warnings.",
        urgency: 3,
        actorRefs: ["actor:sel-bell", "actor:niko-salt"],
        locationRefs: ["location:bell-foundry"],
      },
    ],
  };
}

describe("Campaign World model contracts", () => {
  it("accepts three regions with six concrete scenes and connected scene routes", () => {
    const frame = worldFramePacketSchema.parse(frameFixture());
    const cast = createWorldCastPacketSchema(frame).parse(castFixture());
    const connections = createWorldConnectionsPacketSchema(frame, cast).parse(
      connectionsFixture(),
    );

    expect(frame.locations.filter((location) => location.kind === "macro")).toHaveLength(3);
    expect(frame.locations.filter((location) => location.kind === "persistent_sublocation")).toHaveLength(6);
    expect(cast.placements.every((placement) => placement.locationRef !== "location:north-harbor")).toBe(true);
    expect(connections.pressures).toHaveLength(2);
  });

  it("requires a present support person under the starting macro", () => {
    const frame = frameFixture();
    const cast = castFixture();
    const result = createWorldCastPacketSchema(frame).safeParse({
      ...cast,
      placements: cast.placements.map((placement) =>
        placement.actorRef === "actor:oren-tide"
          ? { ...placement, locationRef: "location:reef-market" }
          : placement
      ),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["placements"],
        message: "The cast requires a present support person in a persistent sublocation under the starting macro.",
      }));
    }
  });

  it("requires a pressure anchored to the eligible starting support scene", () => {
    const frame = frameFixture();
    const cast = createWorldCastPacketSchema(frame).parse(castFixture());
    const connections = connectionsFixture();
    const result = createWorldConnectionsPacketSchema(frame, cast).safeParse({
      ...connections,
      pressures: connections.pressures.map((pressure) =>
        pressure.locationRefs.includes("location:signal-tower")
          ? { ...pressure, locationRefs: ["location:reef-market"] }
          : pressure
      ),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["pressures"],
        message: "At least one pressure must anchor a persistent support scene under the starting macro.",
      }));
    }
  });

  it("requires the concrete frame shape and direct macro children", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.slice(0, 8),
    }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location) =>
        location.locationRef === "location:signal-tower"
          ? { ...location, parentLocationRef: "location:glass-reef" }
          : location
      ),
    }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location) =>
        location.locationRef === "location:north-dock"
          ? { ...location, isStarting: true }
          : location
      ),
    }).success).toBe(false);
  });

  it("rejects macro route endpoints and a concrete graph that cannot return", () => {
    const frame = frameFixture();
    const macroEndpoint = worldFramePacketSchema.safeParse({
      ...frame,
      routes: frame.routes.map((route, index) => index === 0
        ? { ...route, fromLocationRef: "location:north-harbor" }
        : route),
    });
    expect(macroEndpoint.success).toBe(false);
    if (!macroEndpoint.success) {
      expect(macroEndpoint.error.issues).toContainEqual(expect.objectContaining({
        message: "Route origin must be a persistent sublocation.",
      }));
    }
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      routes: frame.routes.slice(0, 5),
    }).success).toBe(false);
  });

  it("rejects macro placements, macro pressure anchors, and non-person actors", () => {
    const frame = frameFixture();
    const cast = castFixture();
    const castResult = createWorldCastPacketSchema(frame).safeParse({
      ...cast,
      placements: cast.placements.map((placement, index) => index === 0
        ? { ...placement, locationRef: "location:north-harbor" }
        : placement),
    });
    expect(castResult.success).toBe(false);
    if (!castResult.success) {
      expect(castResult.error.issues).toContainEqual(expect.objectContaining({
        message: "Placement locationRef must be a persistent sublocation.",
      }));
    }
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...cast,
      actors: cast.actors.map((actor, index) => index === 0
        ? { ...actor, kind: "group" }
        : actor),
    }).success).toBe(false);
    const pressureResult = createWorldConnectionsPacketSchema(frame, cast).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, locationRefs: ["location:north-harbor"] }
        : pressure),
    });
    expect(pressureResult.success).toBe(false);
    if (!pressureResult.success) {
      expect(pressureResult.error.issues).toContainEqual(expect.objectContaining({
        message: "Pressure locationRef must be a persistent sublocation.",
      }));
    }
  });

  it.each([
    ["location underflow", () => ({ ...frameFixture(), locations: frameFixture().locations.slice(0, 8) })],
    ["location overflow", () => ({
      ...frameFixture(),
      locations: Array.from({ length: 11 }, (_, index) => ({
        ...frameFixture().locations[3]!,
        locationRef: `location:scene-${index + 1}`,
      })),
    })],
    ["route underflow", () => ({ ...frameFixture(), routes: frameFixture().routes.slice(0, 1) })],
    ["route overflow", () => ({
      ...frameFixture(),
      routes: Array.from({ length: 31 }, (_, index) => ({
        fromLocationRef: "location:north-dock",
        toLocationRef: index % 2 === 0 ? "location:signal-tower" : "location:reef-market",
        travelCost: 2,
      })),
    })],
    ["location tag overflow", () => ({
      ...frameFixture(),
      locations: frameFixture().locations.map((location, index) => index === 0
        ? { ...location, tags: Array.from({ length: 21 }, (_, tagIndex) => `tag-${tagIndex}`) }
        : location),
    })],
  ])("rejects frame bounds and tag limits for %s", (_label, createPacket) => {
    expect(worldFramePacketSchema.safeParse(createPacket()).success).toBe(false);
  });

  it.each([
    ["actor underflow", () => ({ ...castFixture(), actors: castFixture().actors.slice(0, 3) })],
    ["actor overflow", () => ({
      ...castFixture(),
      actors: Array.from({ length: 17 }, (_, index) => ({
        ...castFixture().actors[0]!,
        actorRef: `actor:person-${index + 1}`,
      })),
    })],
    ["goal underflow", () => ({ ...castFixture(), goals: castFixture().goals.slice(0, 3) })],
    ["goal overflow", () => ({ ...castFixture(), goals: Array.from({ length: 49 }, () => castFixture().goals[0]!) })],
    ["placement underflow", () => ({ ...castFixture(), placements: castFixture().placements.slice(0, 3) })],
    ["placement overflow", () => ({ ...castFixture(), placements: Array.from({ length: 33 }, () => castFixture().placements[0]!) })],
    ["trait overflow", () => ({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 0
        ? { ...actor, traits: Array.from({ length: 21 }, (_, traitIndex) => `trait-${traitIndex}`) }
        : actor),
    })],
    ["actor tag overflow", () => ({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 0
        ? { ...actor, tags: Array.from({ length: 21 }, (_, tagIndex) => `tag-${tagIndex}`) }
        : actor),
    })],
  ])("rejects cast bounds and tag limits for %s", (_label, createPacket) => {
    expect(createWorldCastPacketSchema(frameFixture()).safeParse(createPacket()).success).toBe(false);
  });

  it.each([
    ["relation underflow", () => ({ ...connectionsFixture(), relations: connectionsFixture().relations.slice(0, 2) })],
    ["relation overflow", () => ({ ...connectionsFixture(), relations: Array.from({ length: 33 }, () => connectionsFixture().relations[0]!) })],
    ["pressure underflow", () => ({ ...connectionsFixture(), pressures: connectionsFixture().pressures.slice(0, 1) })],
    ["pressure overflow", () => ({ ...connectionsFixture(), pressures: Array.from({ length: 7 }, () => ({ ...connectionsFixture().pressures[0]! })) })],
    ["pressure actor anchor overflow", () => ({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, actorRefs: Array.from({ length: 9 }, (_, actorIndex) => `actor:person-${actorIndex + 1}`) }
        : pressure),
    })],
    ["pressure location anchor overflow", () => ({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, locationRefs: Array.from({ length: 9 }, (_, locationIndex) => `location:scene-${locationIndex + 1}`) }
        : pressure),
    })],
  ])("rejects connection bounds and anchor limits for %s", (_label, createPacket) => {
    expect(createWorldConnectionsPacketSchema(frameFixture(), castFixture()).safeParse(createPacket()).success).toBe(false);
  });

  it("rejects missing semantics, extra fields, invalid enums, and model IDs", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({ ...frame, worldSummary: "" }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({ ...frame, extra: true }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0
        ? { ...location, id: "model-id" }
        : location),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 0
        ? { ...actor, kind: "guild" }
        : actor),
    }).success).toBe(false);
  });

  it("enforces name, prose, tag, and local-reference text bounds", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0
        ? { ...location, name: "n".repeat(121) }
        : location),
    }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({ ...frame, worldSummary: "s".repeat(1_201) }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0
        ? { ...location, tags: ["t".repeat(81)] }
        : location),
    }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0
        ? { ...location, locationRef: `location:${"a".repeat(112)}` }
        : location),
    }).success).toBe(false);
  });

  it("rejects surrounding whitespace and fixed-literal drift", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({ ...frame, worldSummary: ` ${frame.worldSummary}` }).success).toBe(false);
    const castWithWhitespace = castFixture();
    const castResult = createWorldCastPacketSchema(frame).safeParse({
      ...castWithWhitespace,
      actors: castWithWhitespace.actors.map((actor, index) => index === 3
        ? { ...actor, traits: [actor.traits[0]!, " shared-memory "] }
        : actor),
    });
    expect(castResult.success).toBe(false);
    if (!castResult.success) {
      expect(castResult.error.issues).toContainEqual(expect.objectContaining({
        path: ["actors", 3, "traits", 1],
        message: "Text must not contain surrounding whitespace.",
      }));
    }
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 0 ? { ...actor, controller: "human" } : actor),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 0 ? { ...actor, role: "player" } : actor),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      goals: castFixture().goals.map((goal, index) => index === 0 ? { ...goal, status: "paused" } : goal),
    }).success).toBe(false);
  });

  it("rejects missing fields and extra keys inside nested packets", () => {
    const frame = frameFixture();
    const goal = { ...castFixture().goals[0]! } as Record<string, unknown>;
    delete goal.motivation;
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      routes: frame.routes.map((route, index) => index === 0 ? { ...route, note: "model-owned extra" } : route),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({ ...castFixture(), goals: [goal, ...castFixture().goals.slice(1)] }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0 ? { ...pressure, outcome: "model-owned extra" } : pressure),
    }).success).toBe(false);
  });

  it("rejects empty anchors, duplicate references, and self-relations", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 1 ? { ...location, locationRef: frame.locations[0]!.locationRef } : location),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 1 ? { ...actor, actorRef: castFixture().actors[0]!.actorRef } : actor),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      relations: connectionsFixture().relations.map((relation, index) => index === 0 ? { ...relation, targetActorRef: relation.sourceActorRef } : relation),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0 ? { ...pressure, actorRefs: [], locationRefs: [] } : pressure),
    }).success).toBe(false);
  });

  it("rejects malformed and unresolved local references", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0 ? { ...location, locationRef: "location:North Harbor" } : location),
    }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 3 ? { ...location, parentLocationRef: "" } : location),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      placements: castFixture().placements.map((placement, index) => index === 0 ? { ...placement, locationRef: "location:missing-harbor" } : placement),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      relations: connectionsFixture().relations.map((relation, index) => index === 0 ? { ...relation, sourceActorRef: "actor:missing-person" } : relation),
    }).success).toBe(false);
  });

  it("rejects invented relation references and missing person participation", () => {
    const frame = frameFixture();
    const cast = castFixture();
    const connections = connectionsFixture();
    const result = createWorldConnectionsPacketSchema(frame, cast).safeParse({
      ...connections,
      relations: connections.relations.map((relation) => ({
        ...relation,
        sourceActorRef: relation.sourceActorRef === "actor:ilya-venn" ? "actor:lantern-guild" : relation.sourceActorRef,
        targetActorRef: relation.targetActorRef === "actor:ilya-venn" ? "actor:lantern-guild" : relation.targetActorRef,
      })),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["relations", 0, "targetActorRef"], message: "Relation targetActorRef must match a cast reference exactly." }));
      expect(result.error.issues).toContainEqual(expect.objectContaining({ path: ["relations"], message: "actor:ilya-venn must participate in a relation." }));
    }
  });

  it("rejects percentage-scale relation intensity and pressure urgency", () => {
    const frame = frameFixture();
    const cast = castFixture();
    const connections = connectionsFixture();
    const schema = createWorldConnectionsPacketSchema(frame, cast);
    expect(schema.safeParse({ ...connections, relations: connections.relations.map((relation, index) => index === 0 ? { ...relation, intensity: 70 } : relation) }).success).toBe(false);
    expect(schema.safeParse({ ...connections, pressures: connections.pressures.map((pressure, index) => index === 0 ? { ...pressure, urgency: 70 } : pressure) }).success).toBe(false);
  });

  it("rejects a disconnected concrete graph, missing cast roles, and repeated pressure anchors", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({ ...frame, routes: frame.routes.slice(0, 5) }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor) => ({ ...actor, kind: "person", role: "support" })),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure) => ({
        ...pressure,
        actorRefs: ["actor:mara-venn"],
        locationRefs: ["location:north-dock"],
      })),
    }).success).toBe(false);
  });
});
