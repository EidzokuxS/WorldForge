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
  return {
    worldSummary: "Three stormbound harbors depend on routes that fail after each eclipse.",
    locations: [
      {
        locationRef: "location:north-harbor",
        name: "North Harbor",
        description: "A fortified harbor governed by signal keepers.",
        kind: "macro",
        parentLocationRef: null,
        tags: ["fortified"],
        isStarting: true,
      },
      {
        locationRef: "location:glass-reef",
        name: "Glass Reef",
        description: "A trading harbor built around luminous shoals.",
        kind: "macro",
        parentLocationRef: null,
        tags: ["trade"],
        isStarting: false,
      },
      {
        locationRef: "location:bell-island",
        name: "Bell Island",
        description: "An island settlement that measures storms through bronze bells.",
        kind: "macro",
        parentLocationRef: null,
        tags: ["weather"],
        isStarting: false,
      },
    ],
    routes: [
      {
        fromLocationRef: "location:north-harbor",
        toLocationRef: "location:glass-reef",
        travelCost: 2,
      },
      {
        fromLocationRef: "location:glass-reef",
        toLocationRef: "location:bell-island",
        travelCost: 3,
      },
      {
        fromLocationRef: "location:bell-island",
        toLocationRef: "location:north-harbor",
        travelCost: 4,
      },
    ],
  };
}

function castFixture(): WorldCastPacket {
  return {
    actors: [
      {
        actorRef: "actor:mara-venn",
        kind: "person",
        controller: "agent",
        role: "key",
        name: "Mara Venn",
        summary: "A signal keeper tracking the broken route pattern.",
        traits: ["methodical"],
        tags: ["navigator"],
      },
      {
        actorRef: "actor:oren-tide",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Oren Tide",
        summary: "A courier who knows the reef passages.",
        traits: ["observant"],
        tags: ["courier"],
      },
      {
        actorRef: "actor:sel-bell",
        kind: "person",
        controller: "agent",
        role: "support",
        name: "Sel Bell",
        summary: "A bell tender who records impossible storms.",
        traits: ["patient"],
        tags: ["weather"],
      },
      {
        actorRef: "actor:lantern-council",
        kind: "collective",
        controller: "agent",
        role: "key",
        name: "Lantern Council",
        summary: "Harbor delegates who allocate safe passage windows.",
        traits: ["procedural"],
        tags: ["civic"],
      },
    ],
    goals: [
      {
        actorRef: "actor:mara-venn",
        objective: "Map the next route change.",
        motivation: "Keep North Harbor supplied.",
        horizon: "immediate",
        priority: 5,
        status: "active",
      },
      {
        actorRef: "actor:oren-tide",
        objective: "Deliver a sealed route ledger.",
        motivation: "Clear an old family debt.",
        horizon: "immediate",
        priority: 4,
        status: "active",
      },
      {
        actorRef: "actor:sel-bell",
        objective: "Explain the false storm signal.",
        motivation: "Protect Bell Island from panic.",
        horizon: "ongoing",
        priority: 3,
        status: "active",
      },
      {
        actorRef: "actor:lantern-council",
        objective: "Retain control of safe passage windows.",
        motivation: "Preserve the harbor compact.",
        horizon: "ongoing",
        priority: 4,
        status: "active",
      },
    ],
    placements: [
      {
        actorRef: "actor:mara-venn",
        locationRef: "location:north-harbor",
        placementKind: "present",
      },
      {
        actorRef: "actor:oren-tide",
        locationRef: "location:glass-reef",
        placementKind: "present",
      },
      {
        actorRef: "actor:sel-bell",
        locationRef: "location:bell-island",
        placementKind: "present",
      },
      {
        actorRef: "actor:lantern-council",
        locationRef: "location:north-harbor",
        placementKind: "base",
      },
    ],
  };
}

function connectionsFixture(): WorldConnectionsPacket {
  return {
    relations: [
      {
        sourceActorRef: "actor:mara-venn",
        targetActorRef: "actor:lantern-council",
        relationType: "authority",
        summary: "The council controls Mara's access to signal archives.",
        intensity: 4,
      },
      {
        sourceActorRef: "actor:oren-tide",
        targetActorRef: "actor:mara-venn",
        relationType: "dependency",
        summary: "Oren needs Mara to validate the sealed route ledger.",
        intensity: 3,
      },
      {
        sourceActorRef: "actor:sel-bell",
        targetActorRef: "actor:lantern-council",
        relationType: "rivalry",
        summary: "Sel disputes the council's storm forecasts.",
        intensity: 2,
      },
    ],
    pressures: [
      {
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorRefs: ["actor:mara-venn", "actor:lantern-council"],
        locationRefs: ["location:north-harbor"],
      },
      {
        name: "False Bells",
        description: "Bell Island signals storms that never arrive.",
        trajectory: "Couriers stop trusting Bell Island's warnings.",
        urgency: 3,
        actorRefs: ["actor:sel-bell"],
        locationRefs: ["location:bell-island"],
      },
    ],
  };
}

function generatedFrameLocation(index: number): WorldFramePacket["locations"][number] {
  return {
    locationRef: `location:harbor-${index}`,
    name: `Harbor ${index}`,
    description: `Persistent harbor ${index}.`,
    kind: "macro",
    parentLocationRef: null,
    tags: [],
    isStarting: index === 1,
  };
}

describe("Campaign World model contracts", () => {
  it("accepts valid frame, cast, and connections packets", () => {
    const frame = worldFramePacketSchema.parse(frameFixture());
    const cast = createWorldCastPacketSchema(frame).parse(castFixture());
    const connections = createWorldConnectionsPacketSchema(frame, cast).parse(
      connectionsFixture(),
    );

    expect(frame.locations).toHaveLength(3);
    expect(cast.actors).toHaveLength(4);
    expect(connections.pressures).toHaveLength(2);
  });

  it.each([
    ["location underflow", () => ({ ...frameFixture(), locations: frameFixture().locations.slice(0, 2) })],
    ["location overflow", () => ({
      ...frameFixture(),
      locations: Array.from({ length: 11 }, (_, index) => generatedFrameLocation(index + 1)),
    })],
    ["route underflow", () => ({ ...frameFixture(), routes: frameFixture().routes.slice(0, 1) })],
    ["route overflow", () => ({
      ...frameFixture(),
      routes: Array.from({ length: 31 }, (_, index) => ({
        fromLocationRef: "location:north-harbor",
        toLocationRef: index % 2 === 0 ? "location:glass-reef" : "location:bell-island",
        travelCost: 2,
      })),
    })],
    ["location tag overflow", () => ({
      ...frameFixture(),
      locations: frameFixture().locations.map((location, index) => index === 0
        ? { ...location, tags: Array.from({ length: 21 }, (_, tagIndex) => `tag-${tagIndex}`) }
        : location),
    })],
  ])("rejects frame %s", (_label, createPacket) => {
    expect(worldFramePacketSchema.safeParse(createPacket()).success).toBe(false);
  });

  it.each([
    ["actor underflow", () => ({ ...castFixture(), actors: castFixture().actors.slice(0, 3) })],
    ["actor overflow", () => ({
      ...castFixture(),
      actors: Array.from({ length: 17 }, (_, index) => ({
        ...castFixture().actors[0],
        actorRef: `actor:person-${index + 1}`,
        controller: "agent",
      })),
    })],
    ["goal underflow", () => ({ ...castFixture(), goals: castFixture().goals.slice(0, 3) })],
    ["goal overflow", () => ({
      ...castFixture(),
      goals: Array.from({ length: 33 }, () => castFixture().goals[0]),
    })],
    ["placement underflow", () => ({ ...castFixture(), placements: castFixture().placements.slice(0, 3) })],
    ["placement overflow", () => ({
      ...castFixture(),
      placements: Array.from({ length: 33 }, () => castFixture().placements[0]),
    })],
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
  ])("rejects cast %s", (_label, createPacket) => {
    const schema = createWorldCastPacketSchema(frameFixture());
    expect(schema.safeParse(createPacket()).success).toBe(false);
  });

  it.each([
    ["relation underflow", () => ({ ...connectionsFixture(), relations: connectionsFixture().relations.slice(0, 2) })],
    ["relation overflow", () => ({
      ...connectionsFixture(),
      relations: Array.from({ length: 33 }, () => connectionsFixture().relations[0]),
    })],
    ["pressure underflow", () => ({ ...connectionsFixture(), pressures: connectionsFixture().pressures.slice(0, 1) })],
    ["pressure overflow", () => ({
      ...connectionsFixture(),
      pressures: Array.from({ length: 7 }, () => ({
        ...connectionsFixture().pressures[0],
      })),
    })],
    ["pressure actor anchor overflow", () => ({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, actorRefs: Array.from({ length: 9 }, (_, actorIndex) => `actor:person-${actorIndex + 1}`) }
        : pressure),
    })],
    ["pressure location anchor overflow", () => ({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, locationRefs: Array.from({ length: 9 }, (_, locationIndex) => `location:harbor-${locationIndex + 1}`) }
        : pressure),
    })],
  ])("rejects connections %s", (_label, createPacket) => {
    const schema = createWorldConnectionsPacketSchema(frameFixture(), castFixture());
    expect(schema.safeParse(createPacket()).success).toBe(false);
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
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      worldSummary: "s".repeat(1_201),
    }).success).toBe(false);
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
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      worldSummary: ` ${frame.worldSummary}`,
    }).success).toBe(false);

    const castWithWhitespace = castFixture();
    const castResult = createWorldCastPacketSchema(frame).safeParse({
      ...castWithWhitespace,
      actors: castWithWhitespace.actors.map((actor, index) => index === 3
        ? { ...actor, traits: [actor.traits[0], " shared-memory "] }
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
      actors: castFixture().actors.map((actor, index) => index === 0
        ? { ...actor, controller: "human" }
        : actor),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 0
        ? { ...actor, role: "player" }
        : actor),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      goals: castFixture().goals.map((goal, index) => index === 0
        ? { ...goal, status: "paused" }
        : goal),
    }).success).toBe(false);
  });

  it("rejects missing fields and extra keys inside nested packets", () => {
    const frame = frameFixture();
    const goal = { ...castFixture().goals[0] } as Record<string, unknown>;
    delete goal.motivation;

    expect(worldFramePacketSchema.safeParse({
      ...frame,
      routes: frame.routes.map((route, index) => index === 0
        ? { ...route, note: "model-owned extra" }
        : route),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      goals: [goal, ...castFixture().goals.slice(1)],
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, outcome: "model-owned extra" }
        : pressure),
    }).success).toBe(false);
  });

  it("rejects empty anchors, duplicate references, and self-relations", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 1
        ? { ...location, locationRef: frame.locations[0].locationRef }
        : location),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor, index) => index === 1
        ? { ...actor, actorRef: castFixture().actors[0].actorRef }
        : actor),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      relations: connectionsFixture().relations.map((relation, index) => index === 0
        ? { ...relation, targetActorRef: relation.sourceActorRef }
        : relation),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure, index) => index === 0
        ? { ...pressure, actorRefs: [], locationRefs: [] }
        : pressure),
    }).success).toBe(false);
  });

  it("rejects malformed and unresolved local references", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0
        ? { ...location, locationRef: "location:North Harbor" }
        : location),
    }).success).toBe(false);
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      locations: frame.locations.map((location, index) => index === 0
        ? { ...location, parentLocationRef: "" }
        : location),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      placements: castFixture().placements.map((placement, index) => index === 0
        ? { ...placement, locationRef: "location:missing-harbor" }
        : placement),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      relations: connectionsFixture().relations.map((relation, index) => index === 0
        ? { ...relation, sourceActorRef: "actor:missing-person" }
        : relation),
    }).success).toBe(false);
  });

  it("rejects invented relation references and a missing required collective", () => {
    const frame = frameFixture();
    const cast = castFixture();
    const connections = connectionsFixture();
    const result = createWorldConnectionsPacketSchema(frame, cast).safeParse({
      ...connections,
      relations: connections.relations.map((relation) => ({
        ...relation,
        sourceActorRef: relation.sourceActorRef === "actor:lantern-council"
          ? "actor:lantern-guild"
          : relation.sourceActorRef,
        targetActorRef: relation.targetActorRef === "actor:lantern-council"
          ? "actor:lantern-guild"
          : relation.targetActorRef,
      })),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["relations", 0, "targetActorRef"],
        message: "Relation targetActorRef must match a cast reference exactly.",
      }));
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        path: ["relations"],
        message: "actor:lantern-council must participate in a relation.",
      }));
    }
  });

  it("rejects percentage-scale relation intensity and pressure urgency from live model output", () => {
    const frame = frameFixture();
    const cast = castFixture();
    const connections = connectionsFixture();
    const schema = createWorldConnectionsPacketSchema(frame, cast);

    expect(schema.safeParse({
      ...connections,
      relations: connections.relations.map((relation, index) => index === 0
        ? { ...relation, intensity: 70 }
        : relation),
    }).success).toBe(false);
    expect(schema.safeParse({
      ...connections,
      pressures: connections.pressures.map((pressure, index) => index === 0
        ? { ...pressure, urgency: 70 }
        : pressure),
    }).success).toBe(false);
  });

  it("rejects disconnected frames, missing cast roles, and repeated pressure anchors", () => {
    const frame = frameFixture();
    expect(worldFramePacketSchema.safeParse({
      ...frame,
      routes: frame.routes.filter((route) =>
        route.toLocationRef !== "location:bell-island"
      ),
    }).success).toBe(false);
    expect(createWorldCastPacketSchema(frame).safeParse({
      ...castFixture(),
      actors: castFixture().actors.map((actor) => ({
        ...actor,
        kind: "person",
        role: "support",
      })),
    }).success).toBe(false);
    expect(createWorldConnectionsPacketSchema(frame, castFixture()).safeParse({
      ...connectionsFixture(),
      pressures: connectionsFixture().pressures.map((pressure) => ({
        ...pressure,
        actorRefs: ["actor:mara-venn"],
        locationRefs: ["location:north-harbor"],
      })),
    }).success).toBe(false);
  });
});
