import { z } from "zod";

const LOCAL_REFERENCE_MAX = 120;
const LOCAL_REFERENCE_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-";
const NAME_MAX = 120;
const TEXT_MAX = 1_200;
const TAG_MAX = 80;
const TAG_COUNT_MAX = 20;
const MACRO_LOCATION_COUNT = 3;
const PERSISTENT_SUBLOCATION_MIN = 6;
const PERSISTENT_SUBLOCATION_MAX = 7;

const actorRoleValues = ["key", "support", "background"] as const;
const goalHorizonValues = ["immediate", "ongoing"] as const;
const placementKindValues = ["present", "home"] as const;
const relationTypeValues = [
  "alliance",
  "rivalry",
  "authority",
  "dependency",
  "kinship",
  "association",
  "hostility",
] as const;

function boundedStringSchema(max: number, singleLine: boolean) {
  return z
    .string()
    .min(1)
    .max(max)
    .refine((value) => value === value.trim(), {
      message: "Text must not contain surrounding whitespace.",
    })
    .refine((value) =>
      !singleLine || (!value.includes("\n") && !value.includes("\r")),
    {
      message: "Text must use one line.",
    });
}

const nameSchema = boundedStringSchema(NAME_MAX, true);
const textSchema = boundedStringSchema(TEXT_MAX, false);
const tagSchema = boundedStringSchema(TAG_MAX, true);
const tagsSchema = z.array(tagSchema).max(TAG_COUNT_MAX);

function localReferenceSchema(prefix: "location" | "actor") {
  const marker = `${prefix}:`;
  return z
    .string()
    .min(marker.length + 1)
    .max(LOCAL_REFERENCE_MAX)
    .refine((value) => value === value.trim(), {
      message: "Reference must not contain surrounding whitespace.",
    })
    .refine((value) => !value.includes("\n") && !value.includes("\r"), {
      message: "Reference must use one line.",
    })
    .refine((value) => value.startsWith(marker), {
      message: `Reference must start with ${marker}`,
    })
    .refine((value) => {
      const localName = value.slice(marker.length);
      const first = localName[0] ?? "";
      const last = localName[localName.length - 1] ?? "";
      return (
        "abcdefghijklmnopqrstuvwxyz0123456789".includes(first) &&
        "abcdefghijklmnopqrstuvwxyz0123456789".includes(last) &&
        !localName.includes("--") &&
        [...localName].every((character) =>
          LOCAL_REFERENCE_CHARACTERS.includes(character),
        )
      );
    }, {
      message: "Reference local names use lowercase letters, digits, and single hyphens.",
    });
}

const locationReferenceSchema = localReferenceSchema("location");
const actorReferenceSchema = localReferenceSchema("actor");
const worldFrameLocationSchema = z.object({
  locationRef: locationReferenceSchema,
  name: nameSchema,
  description: textSchema,
  kind: z.enum(["macro", "persistent_sublocation"]),
  parentLocationRef: locationReferenceSchema.nullable(),
  tags: tagsSchema,
  isStarting: z.boolean(),
}).strict();

const worldFrameRouteSchema = z.object({
  fromLocationRef: locationReferenceSchema,
  toLocationRef: locationReferenceSchema,
  travelCost: z.number().int().min(1).max(10),
}).strict();

const worldFramePacketBaseSchema = z.object({
  worldSummary: textSchema,
  locations: z.array(worldFrameLocationSchema).min(9).max(10),
  routes: z.array(worldFrameRouteSchema).min(2).max(30),
}).strict();

function addDuplicateIssues(
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  label: string,
): void {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      duplicates.add(value);
    }
    seen.add(value);
  }
  if (duplicates.size > 0) {
    context.addIssue({
      code: "custom",
      path,
      message: `${label} must be unique: ${[...duplicates].join(", ")}`,
    });
  }
}

function reachesEveryLocation(
  startRef: string,
  locationRefs: ReadonlySet<string>,
  routes: readonly z.infer<typeof worldFrameRouteSchema>[],
): boolean {
  const reachable = new Set([startRef]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const route of routes) {
      if (
        locationRefs.has(route.fromLocationRef) &&
        locationRefs.has(route.toLocationRef) &&
        reachable.has(route.fromLocationRef) &&
        !reachable.has(route.toLocationRef)
      ) {
        reachable.add(route.toLocationRef);
        changed = true;
      }
    }
  }
  return reachable.size === locationRefs.size;
}

function hasStronglyConnectedConcreteRoutes(
  concreteLocationRefs: ReadonlySet<string>,
  routes: readonly z.infer<typeof worldFrameRouteSchema>[],
): boolean {
  return [...concreteLocationRefs].every((locationRef) =>
    reachesEveryLocation(locationRef, concreteLocationRefs, routes)
  );
}

export const worldFramePacketSchema = worldFramePacketBaseSchema.superRefine(
  (packet, context) => {
    const locationRefs = new Set(
      packet.locations.map((location) => location.locationRef),
    );
    const macroLocations = packet.locations.filter((location) =>
      location.kind === "macro"
    );
    const concreteLocations = packet.locations.filter((location) =>
      location.kind === "persistent_sublocation"
    );
    const concreteLocationRefs = new Set(
      concreteLocations.map((location) => location.locationRef),
    );
    addDuplicateIssues(
      packet.locations.map((location) => location.locationRef),
      context,
      ["locations"],
      "Location references",
    );

    if (macroLocations.length !== MACRO_LOCATION_COUNT) {
      context.addIssue({
        code: "custom",
        path: ["locations"],
        message: "The world frame requires exactly three macro regions.",
      });
    }
    if (
      concreteLocations.length < PERSISTENT_SUBLOCATION_MIN ||
      concreteLocations.length > PERSISTENT_SUBLOCATION_MAX
    ) {
      context.addIssue({
        code: "custom",
        path: ["locations"],
        message: "The world frame requires six or seven persistent sublocations.",
      });
    }

    const startingLocations = macroLocations.filter((location) =>
      location.isStarting && location.kind === "macro"
    );
    if (startingLocations.length !== 1) {
      context.addIssue({
        code: "custom",
        path: ["locations"],
        message: "The world frame requires exactly one starting macro location.",
      });
    }

    packet.locations.forEach((location, index) => {
      if (location.kind === "macro" && location.parentLocationRef !== null) {
        context.addIssue({
          code: "custom",
          path: ["locations", index, "parentLocationRef"],
          message: "A macro location has no parent location.",
        });
      }
      if (location.kind === "persistent_sublocation") {
        if (location.isStarting) {
          context.addIssue({
            code: "custom",
            path: ["locations", index, "isStarting"],
            message: "The starting location must be a macro location.",
          });
        }
        const parent = packet.locations.find((candidate) =>
          candidate.locationRef === location.parentLocationRef
        );
        if (!parent || parent.kind !== "macro") {
          context.addIssue({
            code: "custom",
            path: ["locations", index, "parentLocationRef"],
            message: "A persistent sublocation requires an existing macro parent.",
          });
        }
      }
    });
    macroLocations.forEach((macro) => {
      const childCount = concreteLocations.filter((location) =>
        location.parentLocationRef === macro.locationRef
      ).length;
      if (childCount < 2) {
        context.addIssue({
          code: "custom",
          path: ["locations"],
          message: `Macro region ${macro.locationRef} requires at least two direct persistent sublocations.`,
        });
      }
    });

    const routeKeys: string[] = [];
    packet.routes.forEach((route, index) => {
      if (!locationRefs.has(route.fromLocationRef)) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "fromLocationRef"],
          message: "Route origin must match a location reference exactly.",
        });
      }
      if (
        locationRefs.has(route.fromLocationRef) &&
        !concreteLocationRefs.has(route.fromLocationRef)
      ) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "fromLocationRef"],
          message: "Route origin must be a persistent sublocation.",
        });
      }
      if (!locationRefs.has(route.toLocationRef)) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "toLocationRef"],
          message: "Route destination must match a location reference exactly.",
        });
      }
      if (
        locationRefs.has(route.toLocationRef) &&
        !concreteLocationRefs.has(route.toLocationRef)
      ) {
        context.addIssue({
          code: "custom",
          path: ["routes", index, "toLocationRef"],
          message: "Route destination must be a persistent sublocation.",
        });
      }
      if (route.fromLocationRef === route.toLocationRef) {
        context.addIssue({
          code: "custom",
          path: ["routes", index],
          message: "A route requires different origin and destination locations.",
        });
      }
      routeKeys.push(`${route.fromLocationRef}\u0000${route.toLocationRef}`);
    });
    addDuplicateIssues(routeKeys, context, ["routes"], "Directed routes");

    if (
      concreteLocationRefs.size > 0 &&
      !hasStronglyConnectedConcreteRoutes(concreteLocationRefs, packet.routes)
    ) {
      context.addIssue({
        code: "custom",
        path: ["routes"],
        message: "Persistent sublocations must form a strongly connected directed route graph.",
      });
    }
  },
);

const worldCastActorSchema = z.object({
  actorRef: actorReferenceSchema,
  kind: z.literal("person"),
  controller: z.literal("agent"),
  role: z.enum(actorRoleValues),
  name: nameSchema,
  summary: textSchema,
  traits: tagsSchema,
  tags: tagsSchema,
}).strict();

const worldCastGoalSchema = z.object({
  actorRef: actorReferenceSchema,
  objective: textSchema,
  motivation: textSchema,
  horizon: z.enum(goalHorizonValues),
  priority: z.number().int().min(1).max(5),
  status: z.literal("active"),
}).strict();

const worldCastPlacementSchema = z.object({
  actorRef: actorReferenceSchema,
  locationRef: locationReferenceSchema,
  placementKind: z.enum(placementKindValues),
}).strict();

const worldCastPacketBaseSchema = z.object({
  actors: z.array(worldCastActorSchema).min(6).max(16),
  goals: z.array(worldCastGoalSchema).min(6).max(48),
  placements: z.array(worldCastPlacementSchema).min(6).max(32),
}).strict();

export type WorldFramePacket = z.infer<typeof worldFramePacketBaseSchema>;
export type WorldCastPacket = z.infer<typeof worldCastPacketBaseSchema>;

export function createWorldCastPacketSchema(
  frame: Pick<WorldFramePacket, "locations" | "routes">,
): z.ZodType<WorldCastPacket> {
  const locationRefs = new Set(
    frame.locations.map((location) => location.locationRef),
  );
  const concreteLocationRefs = new Set(
    frame.locations
      .filter((location) => location.kind === "persistent_sublocation")
      .map((location) => location.locationRef),
  );
  const startingMacros = frame.locations.filter((location) =>
    location.kind === "macro" && location.isStarting
  );
  const startingMacro = startingMacros.length === 1 ? startingMacros[0] : null;
  const startingMacroSceneRefs = new Set(
    startingMacro === null
      ? []
      : frame.locations
        .filter((location) =>
          location.kind === "persistent_sublocation" &&
          location.parentLocationRef === startingMacro.locationRef
        )
        .map((location) => location.locationRef),
  );

  return worldCastPacketBaseSchema.superRefine((packet, context) => {
    const actorRefs = new Set(packet.actors.map((actor) => actor.actorRef));
    addDuplicateIssues(
      packet.actors.map((actor) => actor.actorRef),
      context,
      ["actors"],
      "Actor references",
    );

    const keyPeople = packet.actors.filter((actor) => actor.role === "key");
    const supportPeople = packet.actors.filter((actor) => actor.role === "support");
    const backgroundPeople = packet.actors.filter((actor) => actor.role === "background");
    if (keyPeople.length < 1) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "The cast requires at least one key person.",
      });
    }
    if (supportPeople.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "The cast requires at least two support people.",
      });
    }
    if (backgroundPeople.length < 2) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "The cast requires at least two background people.",
      });
    }

    packet.goals.forEach((goal, index) => {
      if (!actorRefs.has(goal.actorRef)) {
        context.addIssue({
          code: "custom",
          path: ["goals", index, "actorRef"],
          message: "Goal actorRef must match an actor reference exactly.",
        });
      }
    });

    const placementKeys: string[] = [];
    packet.placements.forEach((placement, index) => {
      if (!actorRefs.has(placement.actorRef)) {
        context.addIssue({
          code: "custom",
          path: ["placements", index, "actorRef"],
          message: "Placement actorRef must match an actor reference exactly.",
        });
      }
      if (!locationRefs.has(placement.locationRef)) {
        context.addIssue({
          code: "custom",
          path: ["placements", index, "locationRef"],
          message: "Placement locationRef must match a frame reference exactly.",
        });
      }
      if (
        locationRefs.has(placement.locationRef) &&
        !concreteLocationRefs.has(placement.locationRef)
      ) {
        context.addIssue({
          code: "custom",
          path: ["placements", index, "locationRef"],
          message: "Placement locationRef must be a persistent sublocation.",
        });
      }
      placementKeys.push(
        `${placement.actorRef}\u0000${placement.locationRef}\u0000${placement.placementKind}`,
      );
    });
    addDuplicateIssues(
      placementKeys,
      context,
      ["placements"],
      "Actor placements",
    );

    for (const actor of packet.actors) {
      const goals = packet.goals.filter((goal) =>
        goal.actorRef === actor.actorRef
      );
      const placements = packet.placements.filter((placement) =>
        placement.actorRef === actor.actorRef
      );
      if (goals.length < 1 || goals.length > 3) {
        context.addIssue({
          code: "custom",
          path: ["goals"],
          message: `${actor.actorRef} requires one to three goals.`,
        });
      }
      const present = placements.filter((placement) =>
        placement.placementKind === "present"
      );
      const home = placements.filter((placement) =>
        placement.placementKind === "home"
      );
      if (present.length !== 1 || home.length > 1) {
        context.addIssue({
          code: "custom",
          path: ["placements"],
          message: `${actor.actorRef} requires one present placement and at most one home placement.`,
        });
      }
    }

    const activePersonRefs = new Set(
      packet.actors.map((actor) => actor.actorRef),
    );
    const activeLocations = new Set(
      packet.placements
        .filter((placement) =>
          activePersonRefs.has(placement.actorRef) &&
          placement.placementKind === "present"
        )
        .map((placement) => placement.locationRef),
    );
    if (
      activeLocations.size > 0 &&
      !hasStronglyConnectedConcreteRoutes(concreteLocationRefs, frame.routes)
    ) {
      context.addIssue({
        code: "custom",
        path: ["placements"],
        message: "Every person requires a present placement reachable through concrete routes.",
      });
    }
    if (activeLocations.size < 2) {
      context.addIssue({
        code: "custom",
        path: ["placements"],
        message: "The cast requires present placements across at least two locations.",
      });
    }

    const supportActorRefs = new Set(
      packet.actors
        .filter((actor) => actor.role === "support")
        .map((actor) => actor.actorRef),
    );
    const presentStartingSupportSceneRefs = new Set(
      packet.placements
        .filter((placement) =>
          placement.placementKind === "present" &&
          supportActorRefs.has(placement.actorRef) &&
          startingMacroSceneRefs.has(placement.locationRef)
        )
        .map((placement) => placement.locationRef),
    );
    if (presentStartingSupportSceneRefs.size === 0) {
      context.addIssue({
        code: "custom",
        path: ["placements"],
        message: "The cast requires a present support person in a persistent sublocation under the starting macro.",
      });
    }
  });
}

const worldConnectionRelationSchema = z.object({
  sourceActorRef: actorReferenceSchema,
  targetActorRef: actorReferenceSchema,
  relationType: z.enum(relationTypeValues),
  summary: textSchema,
  intensity: z.number().int().min(1).max(5),
}).strict();

const worldConnectionPressureSchema = z.object({
  name: nameSchema,
  description: textSchema,
  trajectory: textSchema,
  urgency: z.number().int().min(1).max(5),
  actorRefs: z.array(actorReferenceSchema).min(1).max(8),
  locationRefs: z.array(locationReferenceSchema).min(1).max(8),
}).strict();

const worldConnectionsPacketBaseSchema = z.object({
  relations: z.array(worldConnectionRelationSchema).min(3).max(32),
  pressures: z.array(worldConnectionPressureSchema).min(2).max(6),
}).strict();

export type WorldConnectionsPacket = z.infer<
  typeof worldConnectionsPacketBaseSchema
>;

export function createWorldConnectionsPacketSchema(
  frame: Pick<WorldFramePacket, "locations">,
  cast: Pick<WorldCastPacket, "actors" | "placements">,
): z.ZodType<WorldConnectionsPacket> {
  const locationRefs = new Set(
    frame.locations.map((location) => location.locationRef),
  );
  const concreteLocationRefs = new Set(
    frame.locations
      .filter((location) => location.kind === "persistent_sublocation")
      .map((location) => location.locationRef),
  );
  const actorRefs = new Set(cast.actors.map((actor) => actor.actorRef));
  const startingMacros = frame.locations.filter((location) =>
    location.kind === "macro" && location.isStarting
  );
  const startingMacro = startingMacros.length === 1 ? startingMacros[0] : null;
  const startingMacroSceneRefs = new Set(
    startingMacro === null
      ? []
      : frame.locations
        .filter((location) =>
          location.kind === "persistent_sublocation" &&
          location.parentLocationRef === startingMacro.locationRef
        )
        .map((location) => location.locationRef),
  );
  const supportActorRefs = new Set(
    cast.actors
      .filter((actor) => actor.role === "support")
      .map((actor) => actor.actorRef),
  );
  const eligibleStartingSupportSceneRefs = new Set(
    cast.placements
      .filter((placement) =>
        placement.placementKind === "present" &&
        supportActorRefs.has(placement.actorRef) &&
        startingMacroSceneRefs.has(placement.locationRef)
      )
      .map((placement) => placement.locationRef),
  );

  return worldConnectionsPacketBaseSchema.superRefine((packet, context) => {
    const relationKeys: string[] = [];
    const participatingActors = new Set<string>();
    packet.relations.forEach((relation, index) => {
      if (!actorRefs.has(relation.sourceActorRef)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "sourceActorRef"],
          message: "Relation sourceActorRef must match a cast reference exactly.",
        });
      }
      if (!actorRefs.has(relation.targetActorRef)) {
        context.addIssue({
          code: "custom",
          path: ["relations", index, "targetActorRef"],
          message: "Relation targetActorRef must match a cast reference exactly.",
        });
      }
      if (relation.sourceActorRef === relation.targetActorRef) {
        context.addIssue({
          code: "custom",
          path: ["relations", index],
          message: "A relation requires different source and target actors.",
        });
      }
      relationKeys.push(
        `${relation.sourceActorRef}\u0000${relation.targetActorRef}\u0000${relation.relationType}`,
      );
      participatingActors.add(relation.sourceActorRef);
      participatingActors.add(relation.targetActorRef);
    });
    addDuplicateIssues(
      relationKeys,
      context,
      ["relations"],
      "Actor relations",
    );

    for (const actor of cast.actors) {
      if (!participatingActors.has(actor.actorRef)) {
        context.addIssue({
          code: "custom",
          path: ["relations"],
          message: `${actor.actorRef} must participate in a relation.`,
        });
      }
    }

    const anchorSets = new Set<string>();
    packet.pressures.forEach((pressure, index) => {
      addDuplicateIssues(
        pressure.actorRefs,
        context,
        ["pressures", index, "actorRefs"],
        "Pressure actor references",
      );
      addDuplicateIssues(
        pressure.locationRefs,
        context,
        ["pressures", index, "locationRefs"],
        "Pressure location references",
      );
      pressure.actorRefs.forEach((actorRef, actorIndex) => {
        if (!actorRefs.has(actorRef)) {
          context.addIssue({
            code: "custom",
            path: ["pressures", index, "actorRefs", actorIndex],
            message: "Pressure actorRef must match a cast reference exactly.",
          });
        }
      });
      pressure.locationRefs.forEach((locationRef, locationIndex) => {
        if (!locationRefs.has(locationRef)) {
          context.addIssue({
            code: "custom",
            path: ["pressures", index, "locationRefs", locationIndex],
            message: "Pressure locationRef must match a frame reference exactly.",
          });
        }
        if (
          locationRefs.has(locationRef) &&
          !concreteLocationRefs.has(locationRef)
        ) {
          context.addIssue({
            code: "custom",
            path: ["pressures", index, "locationRefs", locationIndex],
            message: "Pressure locationRef must be a persistent sublocation.",
          });
        }
      });
      anchorSets.add(JSON.stringify({
        actorRefs: [...pressure.actorRefs].sort(),
        locationRefs: [...pressure.locationRefs].sort(),
      }));
    });
    if (anchorSets.size < 2) {
      context.addIssue({
        code: "custom",
        path: ["pressures"],
        message: "At least two pressures require different anchor sets.",
      });
    }
    if (
      eligibleStartingSupportSceneRefs.size === 0 ||
      !packet.pressures.some((pressure) =>
        pressure.locationRefs.some((locationRef) =>
          eligibleStartingSupportSceneRefs.has(locationRef)
        )
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["pressures"],
        message: "At least one pressure must anchor a persistent support scene under the starting macro.",
      });
    }
  });
}
