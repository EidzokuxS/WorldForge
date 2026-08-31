import { z } from "zod";
import {
  normalizeCampaignIdentityName,
  type CampaignPlayerIdentityClaim,
} from "@worldforge/shared";

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

// These caps apply only to provider transport packets. The broader domain
// schemas above remain unchanged so persisted data and decoded world content
// keep their existing contract.
const providerNameSchema = boundedStringSchema(80, true);
const providerSummarySchema = boundedStringSchema(140, false);
const providerObjectiveSchema = boundedStringSchema(140, false);
const providerTagSchema = boundedStringSchema(48, true);
const providerTagListSchema = z.array(providerTagSchema).min(1).max(4);
const providerDetailMotivationSchema = boundedStringSchema(160, false);
const providerAdditionalGoalTextSchema = boundedStringSchema(140, false);
const providerPressureNameSchema = boundedStringSchema(64, true);
const providerPressureDescriptionSchema = boundedStringSchema(220, false);
const providerPressureTrajectorySchema = z.enum([
  "escalating",
  "holding",
  "breaking",
  "shifting",
]);

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

/**
 * Provider-safe cast transport. Actor and location references are assigned by
 * code from the stable array slots after this packet passes its contract.
 */
const worldCastSkeletonActorSchema = z.object({
  name: nameSchema,
  role: z.enum(actorRoleValues),
  summary: textSchema,
  presentLocationIndex: z.number().int(),
  homeLocationIndex: z.number().int().nullable(),
  objective: textSchema,
}).strict();

const worldCastSkeletonPacketBaseSchema = z.object({
  actors: z.array(worldCastSkeletonActorSchema).min(6).max(16),
}).strict();

export type WorldCastSkeletonPacket = z.infer<
  typeof worldCastSkeletonPacketBaseSchema
>;

const worldCastSkeletonTransportActorFieldsSchema = z.object({
  name: providerNameSchema,
  role: z.enum(actorRoleValues),
  summary: providerSummarySchema,
  presentLocationIndex: z.number().int(),
  homeLocationIndex: z.number().int(),
  objective: providerObjectiveSchema,
}).strict();

const worldCastSkeletonTransportSlotNames = [
  "keyActorOne",
  "keyActorTwo",
  "startingSupport",
  "supportActor",
  "remoteBackground",
  "backgroundActor",
  "otherActorOne",
  "otherActorTwo",
] as const;

export type WorldCastSkeletonTransportSlotName =
  (typeof worldCastSkeletonTransportSlotNames)[number];

function duplicateTransportActorNames(packet: unknown): string[] {
  if (packet === null || typeof packet !== "object") {
    return [];
  }
  const record = packet as Record<string, unknown>;
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const slotName of worldCastSkeletonTransportSlotNames) {
    const actor = record[slotName];
    if (actor === null || typeof actor !== "object") {
      continue;
    }
    const name = (actor as Record<string, unknown>).name;
    if (typeof name !== "string") {
      continue;
    }
    const normalized = normalizeCampaignIdentityName(name);
    const firstName = seen.get(normalized);
    if (firstName !== undefined) {
      duplicates.add(firstName);
    } else {
      seen.set(normalized, name);
    }
  }
  return [...duplicates];
}

function addTransportActorNameCheck<
  TSchema extends z.ZodObject<any>,
>(schema: TSchema): TSchema {
  return schema.check(({ value, issues }) => {
    const duplicates = duplicateTransportActorNames(value);
    if (duplicates.length > 0) {
      issues.push({
        code: "custom",
        input: value,
        path: ["actors"],
        message: `Actor names must be unique: ${duplicates.join(", ")}.`,
      });
    }
  }) as TSchema;
}

const transportKeyActorSchema = worldCastSkeletonTransportActorFieldsSchema.extend({
  role: z.literal("key"),
}).strict();
const transportStartingSupportSchema = worldCastSkeletonTransportActorFieldsSchema.extend({
  role: z.literal("support"),
}).strict();
const transportSupportActorSchema = worldCastSkeletonTransportActorFieldsSchema.extend({
  role: z.literal("support"),
}).strict();
const transportRemoteBackgroundSchema = worldCastSkeletonTransportActorFieldsSchema.extend({
  role: z.literal("background"),
}).strict();
const transportBackgroundActorSchema = worldCastSkeletonTransportActorFieldsSchema.extend({
  role: z.literal("background"),
}).strict();
const transportOtherActorSchema = worldCastSkeletonTransportActorFieldsSchema.extend({
  role: z.enum(actorRoleValues),
}).strict();

export const worldCastSkeletonTransportPacketBaseSchema = addTransportActorNameCheck(
  z.object({
    keyActorOne: transportKeyActorSchema,
    keyActorTwo: transportKeyActorSchema,
    startingSupport: transportStartingSupportSchema,
    supportActor: transportSupportActorSchema,
    remoteBackground: transportRemoteBackgroundSchema,
    backgroundActor: transportBackgroundActorSchema,
    otherActorOne: transportOtherActorSchema,
    otherActorTwo: transportOtherActorSchema,
  }).strict(),
);

export type WorldCastSkeletonTransportPacket = z.infer<
  typeof worldCastSkeletonTransportPacketBaseSchema
>;

export function createWorldCastSkeletonTransportPacketSchema(
  frame: Pick<WorldFramePacket, "locations">,
): z.ZodType<WorldCastSkeletonTransportPacket> {
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const persistentLocationMaxIndex = Math.max(0, persistentLocations.length - 1);
  const presentLocationIndexSchema = z.number()
    .int()
    .min(0)
    .max(persistentLocationMaxIndex);
  const homeLocationIndexSchema = z.number()
    .int()
    .min(-1)
    .max(persistentLocationMaxIndex);
  const actorSchema = <
    TRole extends z.ZodTypeAny,
    TPresentLocationIndex extends z.ZodTypeAny,
  >(
    roleSchema: TRole,
    presentLocationIndexSchema: TPresentLocationIndex,
  ) =>
    worldCastSkeletonTransportActorFieldsSchema.extend({
      role: roleSchema,
      presentLocationIndex: presentLocationIndexSchema,
      homeLocationIndex: homeLocationIndexSchema,
    }).strict();
  const startingMacro = frame.locations.find((location) =>
    location.kind === "macro" && location.isStarting
  );
  const startingSupportLocationIndex = persistentLocations.findIndex((location) =>
    startingMacro !== undefined && location.parentLocationRef === startingMacro.locationRef
  );
  const remoteBackgroundLocationIndex = persistentLocations.findIndex((location) =>
    startingMacro === undefined || location.parentLocationRef !== startingMacro.locationRef
  );
  if (startingSupportLocationIndex < 0 || remoteBackgroundLocationIndex < 0) {
    throw new Error("World frame must expose starting and remote persistent cast slots.");
  }

  const keyActorSchema = actorSchema(z.literal("key"), presentLocationIndexSchema);
  const startingSupportSchema = actorSchema(
    z.literal("support"),
    z.literal(startingSupportLocationIndex),
  );
  const supportActorSchema = actorSchema(z.literal("support"), presentLocationIndexSchema);
  const remoteBackgroundSchema = actorSchema(
    z.literal("background"),
    z.literal(remoteBackgroundLocationIndex),
  );
  const backgroundActorSchema = actorSchema(z.literal("background"), presentLocationIndexSchema);
  const otherActorSchema = actorSchema(z.enum(actorRoleValues), presentLocationIndexSchema);

  return addTransportActorNameCheck(
    z.object({
      keyActorOne: keyActorSchema,
      keyActorTwo: keyActorSchema,
      startingSupport: startingSupportSchema,
      supportActor: supportActorSchema,
      remoteBackground: remoteBackgroundSchema,
      backgroundActor: backgroundActorSchema,
      otherActorOne: otherActorSchema,
      otherActorTwo: otherActorSchema,
    }).strict(),
  );
}

function transportHomeLocationIndex(homeLocationIndex: number): number | null {
  return homeLocationIndex === -1 ? null : homeLocationIndex;
}

function transportActorWithRole(
  actor: {
    name: string;
    role: (typeof actorRoleValues)[number];
    summary: string;
    presentLocationIndex: number;
    homeLocationIndex: number;
    objective: string;
  },
  role: (typeof actorRoleValues)[number],
  presentLocationIndex: number,
): WorldCastSkeletonPacket["actors"][number] {
  if (actor.role !== role) {
    throw new Error(`Transport actor role must be ${role}.`);
  }
  if (actor.presentLocationIndex !== presentLocationIndex) {
    throw new Error("Transport actor present location must match its code-owned slot.");
  }
  return {
    name: actor.name,
    role,
    summary: actor.summary,
    presentLocationIndex,
    homeLocationIndex: transportHomeLocationIndex(actor.homeLocationIndex),
    objective: actor.objective,
  };
}

export function decodeWorldCastSkeletonTransportPacket(
  frame: Pick<WorldFramePacket, "locations">,
  transport: WorldCastSkeletonTransportPacket,
  playerIdentity?: Pick<CampaignPlayerIdentityClaim, "displayName">,
): WorldCastSkeletonPacket {
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const startingMacro = frame.locations.find((location) =>
    location.kind === "macro" && location.isStarting
  );
  const startingSupportLocationIndex = persistentLocations.findIndex((location) =>
    startingMacro !== undefined && location.parentLocationRef === startingMacro.locationRef
  );
  const remoteBackgroundLocationIndex = persistentLocations.findIndex((location) =>
    startingMacro === undefined || location.parentLocationRef !== startingMacro.locationRef
  );
  if (startingSupportLocationIndex < 0 || remoteBackgroundLocationIndex < 0) {
    throw new Error("World frame must expose starting and remote persistent cast slots.");
  }

  const actors: WorldCastSkeletonPacket["actors"] = [
    transportActorWithRole(transport.keyActorOne, "key", transport.keyActorOne.presentLocationIndex),
    transportActorWithRole(transport.keyActorTwo, "key", transport.keyActorTwo.presentLocationIndex),
    transportActorWithRole(transport.startingSupport, "support", startingSupportLocationIndex),
    transportActorWithRole(transport.supportActor, "support", transport.supportActor.presentLocationIndex),
    transportActorWithRole(transport.remoteBackground, "background", remoteBackgroundLocationIndex),
    transportActorWithRole(transport.backgroundActor, "background", transport.backgroundActor.presentLocationIndex),
    transportActorWithRole(transport.otherActorOne, transport.otherActorOne.role, transport.otherActorOne.presentLocationIndex),
    transportActorWithRole(transport.otherActorTwo, transport.otherActorTwo.role, transport.otherActorTwo.presentLocationIndex),
  ];

  return createWorldCastSkeletonPacketSchema(frame, playerIdentity).parse({ actors });
}

export function createWorldCastSkeletonPacketSchema(
  frame: Pick<WorldFramePacket, "locations">,
  playerIdentity?: Pick<CampaignPlayerIdentityClaim, "displayName">,
): z.ZodType<WorldCastSkeletonPacket> {
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const startingMacro = frame.locations.find((location) =>
    location.kind === "macro" && location.isStarting
  );
  const startingMacroSceneIndices = new Set(
    startingMacro === undefined
      ? []
      : persistentLocations.flatMap((location, index) =>
        location.parentLocationRef === startingMacro.locationRef ? [index] : []
      ),
  );

  return worldCastSkeletonPacketBaseSchema.superRefine((packet, context) => {
    const names = packet.actors.map((actor) => normalizeCampaignIdentityName(actor.name));
    addDuplicateIssues(names, context, ["actors"], "Actor names");

    if (playerIdentity) {
      const reservedName = normalizeCampaignIdentityName(playerIdentity.displayName);
      packet.actors.forEach((actor, index) => {
        if (normalizeCampaignIdentityName(actor.name) === reservedName) {
          context.addIssue({
            code: "custom",
            path: ["actors", index, "name"],
            message: "Actor name conflicts with the reserved player identity.",
          });
        }
      });
    }

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

    const presentIndices = new Set<number>();
    packet.actors.forEach((actor, index) => {
      if (
        actor.presentLocationIndex < 0 ||
        actor.presentLocationIndex >= persistentLocations.length
      ) {
        context.addIssue({
          code: "custom",
          path: ["actors", index, "presentLocationIndex"],
          message: "Present location index must address a persistent sublocation.",
        });
      } else {
        presentIndices.add(actor.presentLocationIndex);
      }
      if (
        actor.homeLocationIndex !== null &&
        (actor.homeLocationIndex < 0 ||
          actor.homeLocationIndex >= persistentLocations.length)
      ) {
        context.addIssue({
          code: "custom",
          path: ["actors", index, "homeLocationIndex"],
          message: "Home location index must address a persistent sublocation.",
        });
      }
    });
    if (presentIndices.size < 2) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "The cast requires present placements across at least two locations.",
      });
    }
    if (
      startingMacroSceneIndices.size > 0 &&
      !packet.actors.some((actor) =>
        actor.role === "support" && startingMacroSceneIndices.has(actor.presentLocationIndex)
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "The cast requires a present support person under the starting macro.",
      });
    }
  });
}

const worldCastDetailActorSchema = z.object({
  actorIndex: z.number().int(),
  traits: tagsSchema,
  motivation: textSchema,
  horizon: z.enum(goalHorizonValues),
  priority: z.number().int().min(1).max(5),
  tags: tagsSchema,
  additionalGoals: z.array(z.object({
    objective: textSchema,
    motivation: textSchema,
    horizon: z.enum(goalHorizonValues),
    priority: z.number().int().min(1).max(5),
  }).strict()).max(2),
}).strict();

const worldCastDetailPacketBaseSchema = z.object({
  actors: z.array(worldCastDetailActorSchema).min(6).max(16),
}).strict();

export type WorldCastDetailPacket = z.infer<
  typeof worldCastDetailPacketBaseSchema
>;

export function createWorldCastDetailPacketSchema(
  skeleton: Pick<WorldCastSkeletonPacket, "actors">,
): z.ZodType<WorldCastDetailPacket> {
  const actorSchema = worldCastDetailActorSchema.extend({
    actorIndex: z.number().int().min(0).max(skeleton.actors.length - 1),
  }).strict();
  const packetSchema = worldCastDetailPacketBaseSchema.extend({
    actors: z.array(actorSchema).min(6).max(16),
  }).strict();
  return packetSchema.superRefine((packet, context) => {
    if (packet.actors.length !== skeleton.actors.length) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "Cast detail must contain exactly one row for every skeleton actor.",
      });
    }
    const seen = new Set<number>();
    packet.actors.forEach((actor, index) => {
      if (actor.actorIndex < 0 || actor.actorIndex >= skeleton.actors.length) {
        context.addIssue({
          code: "custom",
          path: ["actors", index, "actorIndex"],
          message: "Cast detail actorIndex must address a skeleton actor.",
        });
      } else if (seen.has(actor.actorIndex)) {
        context.addIssue({
          code: "custom",
          path: ["actors", index, "actorIndex"],
          message: "Cast detail actorIndex values must be unique.",
        });
      }
      seen.add(actor.actorIndex);
    });
    skeleton.actors.forEach((_, actorIndex) => {
      if (!seen.has(actorIndex)) {
        context.addIssue({
          code: "custom",
          path: ["actors"],
          message: `Cast detail must include actorIndex ${actorIndex}.`,
        });
      }
    });
  });
}

/**
 * Provider-facing transport for one parallel cast-detail batch.
 *
 * The provider only sees a batch-local slot. The builder maps that slot back
 * to the accepted skeleton's global actor index after this strict transport
 * contract has been accepted.
 */
const worldCastDetailBatchActorSchema = z.object({
  detailSlotIndex: z.number().int(),
  traits: providerTagListSchema,
  motivation: providerDetailMotivationSchema,
  horizon: z.enum(goalHorizonValues),
  priority: z.number().int().min(1).max(5),
  tags: providerTagListSchema,
  additionalGoals: z.array(z.object({
    objective: providerAdditionalGoalTextSchema,
    motivation: providerAdditionalGoalTextSchema,
    horizon: z.enum(goalHorizonValues),
    priority: z.number().int().min(1).max(5),
  }).strict()).max(1),
}).strict();

const worldCastDetailBatchPacketBaseSchema = z.object({
  actors: z.array(worldCastDetailBatchActorSchema).min(1).max(8),
}).strict();

export type WorldCastDetailBatchPacket = z.infer<
  typeof worldCastDetailBatchPacketBaseSchema
>;

export type WorldCastDetailBatchActor = WorldCastDetailBatchPacket["actors"][number];

export function createWorldCastDetailBatchPacketSchema(
  batchSize: number,
): z.ZodType<WorldCastDetailBatchPacket> {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 8) {
    throw new RangeError("Cast detail batch size must be an integer from 1 through 8.");
  }
  const actorSchema = worldCastDetailBatchActorSchema.extend({
    detailSlotIndex: z.number().int().min(0).max(batchSize - 1),
  }).strict();
  const packetSchema = worldCastDetailBatchPacketBaseSchema.extend({
    actors: z.array(actorSchema).length(batchSize),
  }).strict();
  return packetSchema.superRefine((packet, context) => {
    const seen = new Set<number>();
    packet.actors.forEach((actor, index) => {
      if (seen.has(actor.detailSlotIndex)) {
        context.addIssue({
          code: "custom",
          path: ["actors", index, "detailSlotIndex"],
          message: "Cast detail batch detailSlotIndex values must be unique.",
        });
      }
      seen.add(actor.detailSlotIndex);
    });
    for (let detailSlotIndex = 0; detailSlotIndex < batchSize; detailSlotIndex += 1) {
      if (!seen.has(detailSlotIndex)) {
        context.addIssue({
          code: "custom",
          path: ["actors"],
          message: `Cast detail batch must include detailSlotIndex ${detailSlotIndex}.`,
        });
      }
    }
    const actorsWithAdditionalGoals = packet.actors.filter((actor) =>
      actor.additionalGoals.length > 0
    );
    if (actorsWithAdditionalGoals.length > 1) {
      context.addIssue({
        code: "custom",
        path: ["actors"],
        message: "At most one actor in a detail batch may have an additional goal.",
      });
    }
  });
}

function validateWorldCastDetailBatchActorIndices(
  globalActorIndices: readonly number[],
): void {
  if (
    globalActorIndices.length < 1 ||
    globalActorIndices.length > 8 ||
    globalActorIndices.some((actorIndex) =>
      !Number.isInteger(actorIndex) || actorIndex < 0 || actorIndex > 15
    ) ||
    new Set(globalActorIndices).size !== globalActorIndices.length
  ) {
    throw new RangeError("Cast detail batch actor indices must be unique integers from 0 through 15.");
  }
}

/**
 * Decode one accepted batch by replacing its local detail slots with the
 * deterministic global actor indices assigned by the builder.
 */
export function decodeWorldCastDetailBatchPacket(
  input: unknown,
  globalActorIndices: readonly number[],
): WorldCastDetailPacket["actors"] {
  validateWorldCastDetailBatchActorIndices(globalActorIndices);
  const schema = createWorldCastDetailBatchPacketSchema(globalActorIndices.length);
  const packet = schema.parse(input);
  const actorBySlot = new Map(
    packet.actors.map((actor) => [actor.detailSlotIndex, actor]),
  );
  return globalActorIndices.map((actorIndex, detailSlotIndex) => {
    const actor = actorBySlot.get(detailSlotIndex);
    if (actor === undefined) {
      throw new Error(`Cast detail batch is missing detailSlotIndex ${detailSlotIndex}.`);
    }
    const {
      detailSlotIndex: _detailSlotIndex,
      ...detail
    } = actor;
    return {
      actorIndex,
      ...detail,
    };
  });
}

export function mapWorldCastDetailBatchPacketToGlobal(
  input: unknown,
  globalActorIndices: readonly number[],
): WorldCastDetailPacket["actors"] {
  return decodeWorldCastDetailBatchPacket(input, globalActorIndices);
}

const worldConnectionsTransportRelationSchema = z.object({
  targetActorIndex: z.number().int(),
  relationType: z.enum(relationTypeValues),
  intensity: z.number().int().min(1).max(5),
}).strict();

const worldConnectionsTransportPressureSchema = z.object({
  name: providerPressureNameSchema,
  description: providerPressureDescriptionSchema,
  trajectory: providerPressureTrajectorySchema,
  urgency: z.number().int().min(1).max(5),
  actorIndices: z.array(z.number().int()).min(1).max(8),
  locationIndices: z.array(z.number().int()).min(1).max(8),
}).strict();

const worldConnectionsTransportPacketBaseSchema = z.object({
  relations: z.array(worldConnectionsTransportRelationSchema).min(3).max(32),
  pressures: z.array(worldConnectionsTransportPressureSchema).min(3).max(4),
}).strict();

export type WorldConnectionsTransportPacket = z.infer<
  typeof worldConnectionsTransportPacketBaseSchema
>;

export function createWorldConnectionsTransportPacketSchema(
  frame: Pick<WorldFramePacket, "locations">,
  skeleton: Pick<WorldCastSkeletonPacket, "actors">,
): z.ZodType<WorldConnectionsTransportPacket> {
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const actorIndexSchema = z.number()
    .int()
    .min(0)
    .max(skeleton.actors.length - 1);
  const locationIndexSchema = z.number()
    .int()
    .min(0)
    .max(persistentLocations.length - 1);
  const relationSchema = worldConnectionsTransportRelationSchema.extend({
    targetActorIndex: actorIndexSchema,
  }).strict();
  const pressureSchema = worldConnectionsTransportPressureSchema.extend({
    actorIndices: z.array(actorIndexSchema).min(1).max(8),
    locationIndices: z.array(locationIndexSchema).min(1).max(8),
  }).strict();
  const packetSchema = worldConnectionsTransportPacketBaseSchema.extend({
    relations: z.array(relationSchema).length(skeleton.actors.length),
    pressures: z.array(pressureSchema).min(3).max(4),
  }).strict();
  const startingMacro = frame.locations.find((location) =>
    location.kind === "macro" && location.isStarting
  );
  const startingMacroSceneIndices = new Set(
    startingMacro === undefined
      ? []
      : persistentLocations.flatMap((location, index) =>
        location.parentLocationRef === startingMacro.locationRef ? [index] : []
      ),
  );
  return packetSchema.superRefine((packet, context) => {
    packet.relations.forEach((relation, index) => {
      if (relation.targetActorIndex === index) {
        context.addIssue({
          code: "custom",
          path: ["relations", index],
          message: "Relation target actor must differ from its source actor.",
        });
      }
    });

    const anchorSets = new Set<string>();
    packet.pressures.forEach((pressure, index) => {
      addDuplicateIssues(
        pressure.actorIndices.map(String),
        context,
        ["pressures", index, "actorIndices"],
        "Pressure actor indices",
      );
      addDuplicateIssues(
        pressure.locationIndices.map(String),
        context,
        ["pressures", index, "locationIndices"],
        "Pressure location indices",
      );
      pressure.actorIndices.forEach((actorIndex, actorIndexPosition) => {
        if (actorIndex < 0 || actorIndex >= skeleton.actors.length) {
          context.addIssue({
            code: "custom",
            path: ["pressures", index, "actorIndices", actorIndexPosition],
            message: "Pressure actor index must address a skeleton actor.",
          });
        }
      });
      pressure.locationIndices.forEach((locationIndex, locationIndexPosition) => {
        if (locationIndex < 0 || locationIndex >= persistentLocations.length) {
          context.addIssue({
            code: "custom",
            path: ["pressures", index, "locationIndices", locationIndexPosition],
            message: "Pressure location index must address a persistent sublocation.",
          });
        }
      });
      anchorSets.add(JSON.stringify({
        actorIndices: [...pressure.actorIndices].sort((a, b) => a - b),
        locationIndices: [...pressure.locationIndices].sort((a, b) => a - b),
      }));
    });
    if (anchorSets.size < 2) {
      context.addIssue({
        code: "custom",
        path: ["pressures"],
        message: "At least two pressures require different anchor sets.",
      });
    }
    const hasStartingSupportPressure = packet.pressures.some((pressure) =>
      pressure.locationIndices.some((locationIndex) =>
        startingMacroSceneIndices.has(locationIndex)
      ) && pressure.actorIndices.some((actorIndex) => {
        const actor = skeleton.actors[actorIndex];
        return actor?.role === "support" &&
          pressure.locationIndices.includes(actor.presentLocationIndex);
      })
    );
    if (startingMacroSceneIndices.size > 0 && !hasStartingSupportPressure) {
      context.addIssue({
        code: "custom",
        path: ["pressures"],
        message: "At least one pressure must anchor both a starting-macro persistent scene and a support actor present in that scene.",
      });
    }
  });
}

export function createWorldCastPacketSchema(
  frame: Pick<WorldFramePacket, "locations" | "routes">,
  playerIdentity?: Pick<CampaignPlayerIdentityClaim, "displayName">,
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

    if (playerIdentity) {
      const reservedName = normalizeCampaignIdentityName(playerIdentity.displayName);
      packet.actors.forEach((actor, index) => {
        if (normalizeCampaignIdentityName(actor.name) === reservedName) {
          context.addIssue({
            code: "custom",
            path: ["actors", index, "name"],
            message: "Actor name conflicts with the reserved player identity.",
          });
        }
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
        ) && pressure.actorRefs.some((actorRef) => {
          const presentPlacement = cast.placements.find((placement) =>
            placement.actorRef === actorRef && placement.placementKind === "present"
          );
          return supportActorRefs.has(actorRef) &&
            presentPlacement !== undefined &&
            pressure.locationRefs.includes(presentPlacement.locationRef);
        })
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["pressures"],
        message: "At least one pressure must anchor both a starting-macro persistent scene and a support actor present in that scene.",
      });
    }
  });
}
