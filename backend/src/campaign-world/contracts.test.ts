import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createWorldCastDetailPacketSchema,
  createWorldCastDetailBatchPacketSchema,
  createWorldCastPacketSchema,
  createWorldCastSkeletonPacketSchema,
  createWorldCastSkeletonTransportPacketSchema,
  createWorldConnectionsPacketSchema,
  createWorldConnectionsTransportPacketSchema,
  decodeWorldCastSkeletonTransportPacket,
  decodeWorldCastDetailBatchPacket,
  worldCastSkeletonTransportPacketBaseSchema,
  worldFramePacketSchema,
  type WorldCastDetailPacket,
  type WorldCastDetailBatchPacket,
  type WorldCastPacket,
  type WorldCastSkeletonPacket,
  type WorldCastSkeletonTransportPacket,
  type WorldConnectionsTransportPacket,
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
    "tavi-reed",
    "uma-vale",
  ];
  const roles = ["key", "support", "support", "background", "background", "key", "key", "background"] as const;
  const sceneRefs = [
    "north-dock",
    "signal-tower",
    "reef-market",
    "tide-gate",
    "bell-foundry",
    "storm-shrine",
    "north-dock",
    "bell-foundry",
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
      ["tavi-reed", "uma-vale"],
      ["uma-vale", "mara-venn"],
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

function skeletonFixture(): WorldCastSkeletonPacket {
  const frame = frameFixture();
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const cast = castFixture();
  return {
    actors: cast.actors.map((actor, index) => {
      const placement = cast.placements.find((entry) =>
        entry.actorRef === actor.actorRef && entry.placementKind === "present"
      );
      const goal = cast.goals.find((entry) => entry.actorRef === actor.actorRef)!;
      return {
        name: actor.name,
        role: actor.role,
        summary: actor.summary,
        presentLocationIndex: persistentLocations.findIndex((location) =>
          location.locationRef === placement?.locationRef
        ),
        homeLocationIndex: null,
        objective: goal.objective,
      };
    }),
  };
}

function skeletonTransportFixture(): WorldCastSkeletonTransportPacket {
  const actors = skeletonFixture().actors;
  const ordinary = (actor: WorldCastSkeletonPacket["actors"][number]) => ({
    name: actor.name,
    role: actor.role,
    summary: actor.summary,
    presentLocationIndex: actor.presentLocationIndex,
    homeLocationIndex: actor.homeLocationIndex ?? -1,
    objective: actor.objective,
  });
  return {
    keyActorOne: { ...ordinary(actors[0]!), role: "key" },
    keyActorTwo: { ...ordinary(actors[5]!), role: "key" },
    startingSupport: {
      ...ordinary(actors[1]!),
      role: "support",
      presentLocationIndex: 0,
    },
    supportActor: { ...ordinary(actors[2]!), role: "support" },
    remoteBackground: {
      ...ordinary(actors[3]!),
      role: "background",
      presentLocationIndex: 2,
    },
    backgroundActor: { ...ordinary(actors[4]!), role: "background" },
    otherActorOne: ordinary(actors[6]!),
    otherActorTwo: ordinary(actors[7]!),
  };
}

function connectionsTransportFixture(): WorldConnectionsTransportPacket {
  const cast = castFixture();
  const frame = frameFixture();
  const actorIndexByRef = new Map(cast.actors.map((actor, index) => [actor.actorRef, index]));
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const locationIndexByRef = new Map(
    persistentLocations.map((location, index) => [location.locationRef, index]),
  );
  const connections = connectionsFixture();
  const semanticRelations = [
    ...connections.relations,
    {
      sourceActorRef: "actor:rhea-quill",
      targetActorRef: "actor:mara-venn",
      relationType: "association" as const,
      summary: "rhea-quill relies on mara-venn.",
      intensity: 3,
    },
  ];
  const orderedRelations = [...semanticRelations].sort((left, right) =>
    actorIndexByRef.get(left.sourceActorRef)! - actorIndexByRef.get(right.sourceActorRef)!
  );
  const pressureTrajectories = ["escalating", "holding", "shifting"] as const;
  return {
    relations: orderedRelations.map((relation) => {
      const targetActorIndex = actorIndexByRef.get(relation.targetActorRef)!;
      return {
        targetActorIndex,
        relationType: relation.relationType,
        intensity: relation.intensity,
      };
    }),
    pressures: [
      ...connections.pressures,
      {
        name: "Tide Ledger",
        description: "Route records disagree after the latest eclipse.",
        trajectory: "Couriers lose confidence in the next crossing.",
        urgency: 4,
        actorRefs: ["actor:rhea-quill"],
        locationRefs: ["location:tide-gate"],
      },
    ].map((pressure, index) => ({
      name: pressure.name,
      description: pressure.description,
      trajectory: pressureTrajectories[index]!,
      urgency: pressure.urgency,
      actorIndices: pressure.actorRefs.map((actorRef) => actorIndexByRef.get(actorRef)!),
      locationIndices: pressure.locationRefs.map((locationRef) => locationIndexByRef.get(locationRef)!),
    })),
  };
}

function detailFixture(): WorldCastDetailPacket {
  const cast = castFixture();
  return {
    actors: cast.actors.map((actor, actorIndex) => {
      const goal = cast.goals.find((entry) => entry.actorRef === actor.actorRef)!;
      return {
        actorIndex,
        traits: [...actor.traits, "focused"],
        motivation: goal.motivation,
        horizon: goal.horizon,
        priority: goal.priority,
        tags: [`tag-${actorIndex + 1}`, "coast"],
        additionalGoals: [],
      };
    }),
  };
}

function detailBatchFixture(globalActorIndices: readonly number[]): WorldCastDetailBatchPacket {
  const detail = detailFixture();
  return {
    actors: globalActorIndices.map((actorIndex, detailSlotIndex) => {
      const { actorIndex: _globalActorIndex, ...fields } = detail.actors[actorIndex]!;
      return { detailSlotIndex, ...fields };
    }),
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

  it("rejects an exact normalized reserved full-name collision without blocking first-name matches", () => {
    const frame = frameFixture();
    const exact = createWorldCastPacketSchema(frame, { displayName: "  Mara   Venn " })
      .safeParse(castFixture());
    expect(exact.success).toBe(false);
    if (!exact.success) {
      expect(exact.error.issues).toContainEqual(expect.objectContaining({
        path: ["actors", 0, "name"],
        message: "Actor name conflicts with the reserved player identity.",
      }));
    }

    const firstNameOnly = createWorldCastPacketSchema(frame, { displayName: "Mara" })
      .safeParse(castFixture());
    expect(firstNameOnly.success).toBe(true);
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
        message: "At least one pressure must anchor both a starting-macro persistent scene and a support actor present in that scene.",
      }));
    }

    const missingSupportActor = createWorldConnectionsPacketSchema(frame, cast).safeParse({
      ...connections,
      pressures: connections.pressures.map((pressure) =>
        pressure.locationRefs.includes("location:signal-tower")
          ? { ...pressure, actorRefs: ["actor:mara-venn"] }
          : pressure
      ),
    });
    expect(missingSupportActor.success).toBe(false);
  });

  it("requires keyed cast detail rows and an index-grounded starting support pressure", () => {
    const frame = frameFixture();
    const skeleton = createWorldCastSkeletonPacketSchema(frame).parse(skeletonFixture());
    expect(createWorldCastSkeletonPacketSchema(frame).safeParse({
      ...skeleton,
      actors: skeleton.actors.map((actor, index) => index === 0
        ? { ...actor, traits: ["detail-only"] }
        : actor),
    }).success).toBe(false);
    const detail = createWorldCastDetailPacketSchema(skeleton);
    const validDetail = detailFixture();
    expect(detail.safeParse(validDetail).success).toBe(true);
    expect(detail.safeParse({
      ...validDetail,
      actors: validDetail.actors.map((actor, index) => index === 0
        ? (({ motivation: _motivation, ...withoutMotivation }) => withoutMotivation)(actor)
        : actor),
    }).success).toBe(false);
    expect(detail.safeParse({ ...validDetail, actors: [...validDetail.actors].reverse() }).success).toBe(true);
    expect(detail.safeParse({ ...validDetail, actors: validDetail.actors.slice(0, -1) }).success).toBe(false);
    expect(detail.safeParse({
      ...validDetail,
      actors: validDetail.actors.map((actor, index) => index === 1
        ? { ...actor, actorIndex: validDetail.actors[0]!.actorIndex }
        : actor),
    }).success).toBe(false);
    expect(detail.safeParse({
      ...validDetail,
      actors: validDetail.actors.map((actor, index) => index === 0
        ? { ...actor, actorIndex: skeleton.actors.length }
        : actor),
    }).success).toBe(false);

    const transport = createWorldConnectionsTransportPacketSchema(frame, skeleton);
    const validTransport = connectionsTransportFixture();
    expect(transport.safeParse(validTransport).success).toBe(true);
    expect(validTransport.relations).toHaveLength(skeleton.actors.length);
    expect(Object.keys(validTransport.relations[0]!).sort()).toEqual([
      "intensity",
      "relationType",
      "targetActorIndex",
    ]);
    const extraRelationKey = transport.safeParse({
      ...validTransport,
      relations: validTransport.relations.map((relation, index) => index === 1
        ? { ...relation, relationSlotIndex: 0 }
        : relation),
    });
    expect(extraRelationKey.success).toBe(false);
    if (!extraRelationKey.success) {
      expect(extraRelationKey.error.issues).toContainEqual(expect.objectContaining({
        code: "unrecognized_keys",
        path: ["relations", 1],
        keys: ["relationSlotIndex"],
      }));
    }
    expect(transport.safeParse({
      ...validTransport,
      relations: validTransport.relations.map((relation, index) => index === 0
        ? { ...relation, targetActorIndex: 0 }
        : relation),
    }).success).toBe(false);
    expect(transport.safeParse({
      ...validTransport,
      pressures: validTransport.pressures.map((pressure, index) => index === 0
        ? { ...pressure, trajectory: "A freeform trajectory" }
        : pressure),
    }).success).toBe(false);
    expect(transport.safeParse({
      ...validTransport,
      pressures: validTransport.pressures.map((pressure, index) => index === 0
        ? { ...pressure, actorIndices: [0] }
        : pressure),
    }).success).toBe(false);
    expect(transport.safeParse({
      ...validTransport,
      pressures: validTransport.pressures.map((pressure, index) => index === 0
        ? { ...pressure, locationIndices: [2] }
        : pressure),
    }).success).toBe(false);
  });

  it("keeps provider relation rows mechanical and rejects free-text summaries", () => {
    const frame = frameFixture();
    const skeleton = createWorldCastSkeletonPacketSchema(frame).parse(skeletonFixture());
    const schema = createWorldConnectionsTransportPacketSchema(frame, skeleton);
    const validTransport = connectionsTransportFixture();

    expect(Object.keys(validTransport.relations[0]!).sort()).toEqual([
      "intensity",
      "relationType",
      "targetActorIndex",
    ]);

    const result = schema.safeParse({
      ...validTransport,
      relations: validTransport.relations.map((relation, index) => index === 0
        ? { ...relation, summary: "Aldos Fenwick and Griet Vandam work as allies." }
        : relation),
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(expect.objectContaining({
        code: "unrecognized_keys",
        path: ["relations", 0],
        keys: ["summary"],
      }));
    }
  });

  it("keeps parallel detail transport local, exact, and strict", () => {
    const valid = detailBatchFixture([0, 2, 4]);
    const schema = createWorldCastDetailBatchPacketSchema(3);
    expect(Object.keys(valid.actors[0]!).sort()).toEqual([
      "additionalGoals",
      "detailSlotIndex",
      "horizon",
      "motivation",
      "priority",
      "tags",
      "traits",
    ]);
    expect(schema.safeParse(valid).success).toBe(true);
    expect(schema.safeParse({ ...valid, actors: valid.actors.slice(0, 2) }).success).toBe(false);
    expect(schema.safeParse({
      ...valid,
      actors: valid.actors.map((actor, index) => index === 1
        ? { ...actor, detailSlotIndex: 0 }
        : actor),
    }).success).toBe(false);
    expect(schema.safeParse({
      ...valid,
      actors: valid.actors.map((actor, index) => index === 1
        ? { ...actor, detailSlotIndex: 3 }
        : actor),
    }).success).toBe(false);
    expect(schema.safeParse({
      ...valid,
      actors: valid.actors.map((actor, index) => index === 0
        ? { ...actor, actorIndex: 0 }
        : actor),
    }).success).toBe(false);
  });

  it("maps reversed local detail rows to their assigned global actor indices", () => {
    const globalActorIndices = [4, 1, 5] as const;
    const valid = detailBatchFixture(globalActorIndices);
    const decoded = decodeWorldCastDetailBatchPacket(
      { ...valid, actors: [...valid.actors].reverse() },
      globalActorIndices,
    );

    expect(decoded.map((actor) => actor.actorIndex)).toEqual([...globalActorIndices]);
    expect(decoded.map((actor) => actor.tags)).toEqual([["tag-5", "coast"], ["tag-2", "coast"], ["tag-6", "coast"]]);
    expect(decoded.map((actor) => actor.traits)).toEqual([
      ["watchful", "focused"],
      ["watchful", "focused"],
      ["watchful", "focused"],
    ]);
  });

  it("makes exactly eight fixed actor slots provider-visible", () => {
    const frame = frameFixture();
    const schema = createWorldCastSkeletonTransportPacketSchema(frame);
    const schemaJson = z.toJSONSchema(schema) as {
      required?: string[];
      properties?: Record<string, {
        required?: string[];
        properties?: Record<string, {
          minimum?: number;
          maximum?: number;
          const?: string | number;
          enum?: string[];
        }>;
      }>;
    };
    const slots = [
      "keyActorOne",
      "keyActorTwo",
      "startingSupport",
      "supportActor",
      "remoteBackground",
      "backgroundActor",
      "otherActorOne",
      "otherActorTwo",
    ];
    const ordinaryRowRequired = [
      "name",
      "role",
      "summary",
      "presentLocationIndex",
      "homeLocationIndex",
      "objective",
    ];
    expect(schemaJson.required).toEqual(slots);
    expect(Object.keys(schemaJson.properties ?? {})).toEqual(slots);
    for (const slot of slots) {
      const row = schemaJson.properties?.[slot];
      expect(row?.required).toEqual(ordinaryRowRequired);
      expect(Object.keys(row?.properties ?? {})).toEqual(ordinaryRowRequired);
      expect(row?.properties?.homeLocationIndex).toMatchObject({ minimum: -1, maximum: 5 });
    }
    expect(schemaJson.properties?.keyActorOne?.properties?.role).toMatchObject({ const: "key" });
    expect(schemaJson.properties?.keyActorTwo?.properties?.role).toMatchObject({ const: "key" });
    expect(schemaJson.properties?.startingSupport?.properties?.role).toMatchObject({ const: "support" });
    expect(schemaJson.properties?.supportActor?.properties?.role).toMatchObject({ const: "support" });
    expect(schemaJson.properties?.remoteBackground?.properties?.role).toMatchObject({ const: "background" });
    expect(schemaJson.properties?.backgroundActor?.properties?.role).toMatchObject({ const: "background" });
    expect(schemaJson.properties?.otherActorOne?.properties?.role).toMatchObject({ enum: ["key", "support", "background"] });
    expect(schemaJson.properties?.otherActorTwo?.properties?.role).toMatchObject({ enum: ["key", "support", "background"] });
    expect(schemaJson.properties?.startingSupport?.properties?.presentLocationIndex).toMatchObject({ const: 0 });
    expect(schemaJson.properties?.remoteBackground?.properties?.presentLocationIndex).toMatchObject({ const: 2 });
    const serialized = JSON.stringify(schemaJson);
    for (const forbidden of ["anyOf", "oneOf", "prefixItems"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("requires every fixed slot, exact roles and anchors, and leaves domain range at six to sixteen", () => {
    const frame = frameFixture();
    const base = skeletonTransportFixture();
    const slots = [
      "keyActorOne",
      "keyActorTwo",
      "startingSupport",
      "supportActor",
      "remoteBackground",
      "backgroundActor",
      "otherActorOne",
      "otherActorTwo",
    ] as const;
    expect(worldCastSkeletonTransportPacketBaseSchema.safeParse(base).success).toBe(true);
    for (const slot of slots) {
      const missing = { ...base } as Record<string, unknown>;
      delete missing[slot];
      expect(worldCastSkeletonTransportPacketBaseSchema.safeParse(missing).success).toBe(false);
    }
    expect(worldCastSkeletonTransportPacketBaseSchema.safeParse({
      ...base,
      unexpectedActor: base.otherActorOne,
    }).success).toBe(false);
    expect(createWorldCastSkeletonTransportPacketSchema(frame).safeParse({
      ...base,
      keyActorOne: { ...base.keyActorOne, role: "support" },
    }).success).toBe(false);
    expect(createWorldCastSkeletonTransportPacketSchema(frame).safeParse({
      ...base,
      startingSupport: { ...base.startingSupport, presentLocationIndex: 1 },
    }).success).toBe(false);
    expect(createWorldCastSkeletonTransportPacketSchema(frame).safeParse({
      ...base,
      remoteBackground: { ...base.remoteBackground, presentLocationIndex: 0 },
    }).success).toBe(false);
    expect(worldCastSkeletonTransportPacketBaseSchema.safeParse({
      ...base,
      otherActorTwo: { ...base.otherActorTwo, name: "  MARA   VENN " },
    }).success).toBe(false);

    const domain = skeletonFixture();
    const domainEleven = {
      actors: [
        ...domain.actors,
        ...Array.from({ length: 3 }, (_, index) => ({
          ...domain.actors[index % domain.actors.length]!,
          name: `Extra Person ${index + 1}`,
          presentLocationIndex: index % 6,
        })),
      ],
    };
    expect(createWorldCastSkeletonPacketSchema(frame).safeParse(domainEleven).success).toBe(true);
  });

  it("accepts provider pressure descriptions through 220 characters and rejects 221", () => {
    const frame = frameFixture();
    const skeleton = skeletonFixture();
    const schema = createWorldConnectionsTransportPacketSchema(frame, skeleton);
    const valid = connectionsTransportFixture();
    const withDescriptionLength = (length: number) => ({
      ...valid,
      pressures: valid.pressures.map((pressure, index) => index === 0
        ? { ...pressure, description: "p".repeat(length) }
        : pressure),
    });

    expect(schema.safeParse(withDescriptionLength(161)).success).toBe(true);
    expect(schema.safeParse(withDescriptionLength(220)).success).toBe(true);
    expect(schema.safeParse(withDescriptionLength(221)).success).toBe(false);
  });

  it("rejects a missing summary in every fixed skeleton slot", () => {
    const frame = frameFixture();
    const schema = createWorldCastSkeletonTransportPacketSchema(frame);
    const valid = skeletonTransportFixture();
    const slots = [
      "keyActorOne",
      "keyActorTwo",
      "startingSupport",
      "supportActor",
      "remoteBackground",
      "backgroundActor",
      "otherActorOne",
      "otherActorTwo",
    ] as const;

    for (const slot of slots) {
      const invalid = JSON.parse(JSON.stringify(valid)) as Record<string, unknown>;
      delete (invalid[slot] as Record<string, unknown>).summary;
      const result = schema.safeParse(invalid);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues).toContainEqual(expect.objectContaining({
          code: "invalid_type",
          path: [slot, "summary"],
        }));
      }
    }
  });

  it("decodes fixed anchors into flat roles, minima, and starting/remote placements", () => {
    const frame = frameFixture();
    const transport = skeletonTransportFixture();
    const decoded = decodeWorldCastSkeletonTransportPacket(frame, transport);
    const accepted = createWorldCastSkeletonPacketSchema(frame).parse(decoded);

    expect(accepted.actors).toHaveLength(8);
    expect(accepted.actors.filter((actor) => actor.role === "key")).toHaveLength(3);
    expect(accepted.actors.filter((actor) => actor.role === "support")).toHaveLength(2);
    expect(accepted.actors.filter((actor) => actor.role === "background")).toHaveLength(3);
    expect(accepted.actors[2]?.role).toBe("support");
    expect(accepted.actors[2]?.presentLocationIndex).toBe(0);
    expect(accepted.actors[4]?.role).toBe("background");
    expect(accepted.actors[4]?.presentLocationIndex).toBe(2);
    expect(new Set(accepted.actors.map((actor) => actor.presentLocationIndex)).size).toBeGreaterThanOrEqual(2);
    expect(accepted.actors.every((actor) => actor.homeLocationIndex === null)).toBe(true);
  });

  it("rejects fixed-slot actor names that collide after case and whitespace normalization", () => {
    const frame = frameFixture();
    const transport = skeletonTransportFixture();
    const duplicateNameTransport: WorldCastSkeletonTransportPacket = {
      ...transport,
      supportActor: { ...transport.supportActor, name: "mara   VENN" },
    };

    expect(() => decodeWorldCastSkeletonTransportPacket(frame, duplicateNameTransport))
      .toThrow(/Actor names must be unique/);
  });

  it("rejects out-of-range skeleton coordinates before decode", () => {
    const frame = frameFixture();
    const schema = createWorldCastSkeletonTransportPacketSchema(frame);
    const valid = skeletonTransportFixture();
    expect(schema.safeParse({
      ...valid,
      keyActorOne: { ...valid.keyActorOne, presentLocationIndex: 6 },
    }).success).toBe(false);
    expect(schema.safeParse({
      ...valid,
      startingSupport: { ...valid.startingSupport, homeLocationIndex: -2 },
    }).success).toBe(false);
    expect(schema.safeParse({
      ...valid,
      remoteBackground: { ...valid.remoteBackground, homeLocationIndex: 6 },
    }).success).toBe(false);
  });

  it("exposes bounded detail and connections indices while keeping relational checks", () => {
    const frame = frameFixture();
    const skeleton = createWorldCastSkeletonPacketSchema(frame).parse(skeletonFixture());
    const detailSchema = createWorldCastDetailPacketSchema(skeleton);
    const connectionsSchema = createWorldConnectionsTransportPacketSchema(frame, skeleton);
    const detailJson = z.toJSONSchema(detailSchema) as {
      properties?: { actors?: { items?: { properties?: { actorIndex?: { minimum?: number; maximum?: number } } } } };
    };
    const connectionsJson = z.toJSONSchema(connectionsSchema) as {
      properties?: {
        relations?: {
          minItems?: number;
          maxItems?: number;
          items?: { properties?: {
            targetActorIndex?: { minimum?: number; maximum?: number };
          } };
        };
        pressures?: { items?: { properties?: {
          actorIndices?: { items?: { minimum?: number; maximum?: number } };
          locationIndices?: { items?: { minimum?: number; maximum?: number } };
        } } };
      };
    };
    const serialized = `${JSON.stringify(detailJson)}${JSON.stringify(connectionsJson)}`;
    for (const forbidden of ["anyOf", "oneOf", "prefixItems"]) {
      expect(serialized).not.toContain(forbidden);
    }
    expect(detailJson.properties?.actors?.items?.properties?.actorIndex)
      .toMatchObject({ minimum: 0, maximum: 7 });
    expect(connectionsJson.properties?.relations)
      .toMatchObject({ minItems: 8, maxItems: 8 });
    expect(connectionsJson.properties?.relations?.items?.properties?.targetActorIndex)
      .toMatchObject({ minimum: 0, maximum: 7 });
    expect(connectionsJson.properties?.pressures?.items?.properties?.actorIndices?.items)
      .toMatchObject({ minimum: 0, maximum: 7 });
    expect(connectionsJson.properties?.pressures?.items?.properties?.locationIndices?.items)
      .toMatchObject({ minimum: 0, maximum: 5 });

    const validDetail = detailFixture();
    expect(detailSchema.safeParse({
      ...validDetail,
      actors: validDetail.actors.map((actor, index) => index === 0
        ? { ...actor, actorIndex: skeleton.actors.length }
        : actor),
    }).success).toBe(false);
    const validConnections = connectionsTransportFixture();
    expect(connectionsSchema.safeParse({
      ...validConnections,
      pressures: validConnections.pressures.map((pressure, index) => index === 0
        ? { ...pressure, locationIndices: [6] }
        : pressure),
    }).success).toBe(false);
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
      relations: [
        ...connectionsFixture().relations,
        { ...connectionsFixture().relations[0]! },
      ],
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
