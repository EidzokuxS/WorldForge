import type { LanguageModel } from "ai";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { CampaignWorldSource } from "@worldforge/shared";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import {
  getSafeGenerateObjectSchemaDiagnostics,
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import type {
  WorldCastDetailBatchPacket,
  WorldCastDetailPacket,
  WorldCastPacket,
  WorldCastSkeletonPacket,
  WorldCastSkeletonTransportPacket,
  WorldConnectionsPacket,
  WorldConnectionsTransportPacket,
  WorldFramePacket,
} from "./contracts.js";
import {
  createWorldCastDetailBatchPacketSchema,
  createWorldCastDetailPacketSchema,
  createWorldCastPacketSchema,
  createWorldCastSkeletonPacketSchema,
  createWorldCastSkeletonTransportPacketSchema,
  createWorldConnectionsPacketSchema,
  createWorldConnectionsTransportPacketSchema,
  decodeWorldCastSkeletonTransportPacket,
  worldFramePacketSchema,
} from "./contracts.js";
import {
  CampaignWorldBuilderError,
  CampaignWorldStageTimeoutError,
  CAMPAIGN_WORLD_BUILD_BUDGET_MS,
  createCampaignWorldStageEvidence,
  createCampaignWorldBuilder,
  composeWorldConnectionsPacketFromTransport,
  composeWorldCastPacketFromTransport,
  decodeWorldFrameAndCastSkeletonToolPacket,
  decodeWorldFrameToolPacket,
  splitWorldCastDetailActorIndices,
  worldFrameAndCastSkeletonToolPacketSchema,
  worldFrameToolPacketSchema,
  type WorldFrameToolPacket,
  type WorldFrameAndCastSkeletonToolPacket,
} from "./world-builder.js";

const { mockGenerateText } = vi.hoisted(() => ({
  mockGenerateText: vi.fn(),
}));

vi.mock("../ai/raindrop-workshop.js", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  streamText: (...args: unknown[]) => {
    throw new Error(`streamText is not expected in this test: ${String(args.length)}`);
  },
}));

function sourceFixture(withDna: boolean): CampaignWorldSource {
  return {
    campaignId: "campaign-a",
    premise: "A stormbound archipelago faces a failing sea route.",
    dna: withDna
      ? {
          geography: "A ring of stormbound islands",
          politicalStructure: "Independent harbor councils",
          centralConflict: "The sea routes are failing",
          culturalFlavor: "Salt-worn ritual; Communal songs",
          environment: "Cold ocean winds and luminous reefs",
          wildcard: "Maps change after every eclipse",
        }
      : null,
    researchSummary: null,
    sourceReferences: [],
    sourceDigest: "source-digest",
  };
}

function framePacket(): WorldFramePacket {
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
      {
        locationRef: "location:north-pier",
        name: "North Pier",
        description: "A wind-cut pier below the signal keepers' watch.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:north-harbor",
        tags: ["pier"],
        isStarting: false,
      },
      {
        locationRef: "location:north-market",
        name: "North Market",
        description: "A covered market where route ledgers change hands.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:north-harbor",
        tags: ["market"],
        isStarting: false,
      },
      {
        locationRef: "location:glass-dock",
        name: "Glass Dock",
        description: "A low dock beside luminous shoals.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:glass-reef",
        tags: ["dock"],
        isStarting: false,
      },
      {
        locationRef: "location:glass-garden",
        name: "Glass Garden",
        description: "A sheltered platform strung with reef lanterns.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:glass-reef",
        tags: ["lanterns"],
        isStarting: false,
      },
      {
        locationRef: "location:bell-quay",
        name: "Bell Quay",
        description: "A stone quay beneath the island's warning bells.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:bell-island",
        tags: ["quay"],
        isStarting: false,
      },
      {
        locationRef: "location:bell-tower",
        name: "Bell Tower",
        description: "A narrow tower with a clear view of the storm line.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:bell-island",
        tags: ["tower"],
        isStarting: false,
      },
    ],
    routes: [
      { fromLocationRef: "location:north-pier", toLocationRef: "location:north-market", travelCost: 2 },
      { fromLocationRef: "location:north-market", toLocationRef: "location:glass-dock", travelCost: 3 },
      { fromLocationRef: "location:glass-dock", toLocationRef: "location:glass-garden", travelCost: 4 },
      { fromLocationRef: "location:glass-garden", toLocationRef: "location:bell-quay", travelCost: 5 },
      { fromLocationRef: "location:bell-quay", toLocationRef: "location:bell-tower", travelCost: 6 },
      { fromLocationRef: "location:bell-tower", toLocationRef: "location:north-pier", travelCost: 1 },
    ],
  };
}

function toolFramePacket(): WorldFrameToolPacket {
  const frame = framePacket();
  const macroLocations = frame.locations.filter((location) => location.kind === "macro");
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const macroIndexByRef = new Map(
    macroLocations.map((location, index) => [location.locationRef, index]),
  );
  const persistentIndexByRef = new Map(
    persistentLocations.map((location, index) => [location.locationRef, index]),
  );
  return {
    worldSummary: frame.worldSummary,
    startingMacroIndex: macroLocations.findIndex((location) => location.isStarting),
    macroLocations: macroLocations.map((location) => ({
      name: location.name,
      description: location.description,
      tags: [...location.tags, "world"],
    })),
    persistentLocations: persistentLocations.map((location) => ({
      name: location.name,
      description: location.description,
      parentMacroIndex: macroIndexByRef.get(location.parentLocationRef!)!,
      tags: [...location.tags, "scene"],
    })),
    routes: frame.routes.map((route) => ({
      fromPersistentIndex: persistentIndexByRef.get(route.fromLocationRef)!,
      toPersistentIndex: persistentIndexByRef.get(route.toLocationRef)!,
      travelCost: route.travelCost,
    })),
  };
}

function castPacket(): WorldCastPacket {
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
        actorRef: "actor:ilya-venn",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Ilya Venn",
        summary: "A harbor clerk who keeps copies of denied passage records.",
        traits: ["precise"],
        tags: ["clerk"],
      },
      { actorRef: "actor:niko-salt", kind: "person", controller: "agent", role: "background", name: "Niko Salt", summary: "A dock medic who hears the crews' private fears.", traits: ["steady"], tags: ["medic"] },
      { actorRef: "actor:rhea-quill", kind: "person", controller: "agent", role: "key", name: "Rhea Quill", summary: "A route assessor who suspects the storms are directed.", traits: ["skeptical"], tags: ["assessor"] },
      { actorRef: "actor:tavi-reed", kind: "person", controller: "agent", role: "key", name: "Tavi Reed", summary: "A tide cartographer who compares routes against old reef charts.", traits: ["restless"], tags: ["cartographer"] },
      { actorRef: "actor:uma-vale", kind: "person", controller: "agent", role: "background", name: "Uma Vale", summary: "A lantern keeper who notices which docks go dark first.", traits: ["watchful"], tags: ["lanterns"] },
    ],
    goals: [
      { actorRef: "actor:mara-venn", objective: "Map the next route change.", motivation: "Keep North Harbor supplied.", horizon: "immediate", priority: 5, status: "active" },
      { actorRef: "actor:oren-tide", objective: "Deliver a sealed route ledger.", motivation: "Clear an old family debt.", horizon: "immediate", priority: 4, status: "active" },
      { actorRef: "actor:sel-bell", objective: "Explain the false storm signal.", motivation: "Protect Bell Island from panic.", horizon: "ongoing", priority: 3, status: "active" },
      { actorRef: "actor:ilya-venn", objective: "Recover the missing passage register.", motivation: "Prove the harbor records were altered.", horizon: "ongoing", priority: 4, status: "active" },
      { actorRef: "actor:niko-salt", objective: "Keep exhausted crews working.", motivation: "Prevent another dockside death.", horizon: "immediate", priority: 3, status: "active" },
      { actorRef: "actor:rhea-quill", objective: "Identify who redirects storm signals.", motivation: "Restore safe crossings before eclipse.", horizon: "ongoing", priority: 5, status: "active" },
      { actorRef: "actor:tavi-reed", objective: "Compare the new route failures with the old reef charts.", motivation: "Find a safe crossing before the next storm.", horizon: "ongoing", priority: 4, status: "active" },
      { actorRef: "actor:uma-vale", objective: "Track which lanterns fail during the false storms.", motivation: "Keep the night crossings visible.", horizon: "immediate", priority: 3, status: "active" },
    ],
    placements: [
      { actorRef: "actor:mara-venn", locationRef: "location:north-pier", placementKind: "present" },
      { actorRef: "actor:oren-tide", locationRef: "location:north-pier", placementKind: "present" },
      { actorRef: "actor:sel-bell", locationRef: "location:bell-quay", placementKind: "present" },
      { actorRef: "actor:ilya-venn", locationRef: "location:north-market", placementKind: "present" },
      { actorRef: "actor:niko-salt", locationRef: "location:glass-garden", placementKind: "present" },
      { actorRef: "actor:rhea-quill", locationRef: "location:bell-tower", placementKind: "present" },
      { actorRef: "actor:tavi-reed", locationRef: "location:north-market", placementKind: "present" },
      { actorRef: "actor:uma-vale", locationRef: "location:bell-quay", placementKind: "present" },
    ],
  };
}

function connectionsPacket(): WorldConnectionsPacket {
  return {
    relations: [
      { sourceActorRef: "actor:mara-venn", targetActorRef: "actor:ilya-venn", relationType: "authority", summary: "Ilya controls Mara's signal archive access.", intensity: 4 },
      { sourceActorRef: "actor:oren-tide", targetActorRef: "actor:mara-venn", relationType: "dependency", summary: "Oren needs Mara to validate the route ledger.", intensity: 3 },
      { sourceActorRef: "actor:sel-bell", targetActorRef: "actor:ilya-venn", relationType: "rivalry", summary: "Sel disputes Ilya's storm records.", intensity: 2 },
      { sourceActorRef: "actor:ilya-venn", targetActorRef: "actor:niko-salt", relationType: "association", summary: "Ilya trusts Niko with copied records.", intensity: 3 },
      { sourceActorRef: "actor:niko-salt", targetActorRef: "actor:rhea-quill", relationType: "dependency", summary: "Niko needs Rhea to keep relief crossings open.", intensity: 4 },
      { sourceActorRef: "actor:tavi-reed", targetActorRef: "actor:uma-vale", relationType: "association", summary: "Tavi checks Uma's lantern observations against the reef charts.", intensity: 3 },
      { sourceActorRef: "actor:uma-vale", targetActorRef: "actor:tavi-reed", relationType: "dependency", summary: "Uma relies on Tavi's charts to identify the safest lit crossing.", intensity: 3 },
    ],
    pressures: [
      {
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorRefs: ["actor:mara-venn", "actor:oren-tide", "actor:ilya-venn", "actor:rhea-quill"],
        locationRefs: ["location:north-pier"],
      },
      {
        name: "False Bells",
        description: "Bell Island signals storms that never arrive.",
        trajectory: "Couriers stop trusting Bell Island's warnings.",
        urgency: 3,
        actorRefs: ["actor:sel-bell", "actor:niko-salt"],
        locationRefs: ["location:bell-quay"],
      },
    ],
  };
}

function skeletonPacket(): WorldCastSkeletonPacket {
  const frame = framePacket();
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const cast = castPacket();
  return {
    actors: cast.actors.map((actor, index) => {
      const placement = cast.placements.find((entry) =>
        entry.actorRef === actor.actorRef && entry.placementKind === "present"
      );
      const presentLocationIndex = persistentLocations.findIndex((location) =>
        location.locationRef === placement?.locationRef
      );
      const goal = cast.goals.find((entry) => entry.actorRef === actor.actorRef)!;
      return {
        name: actor.name,
        role: actor.role,
        summary: actor.summary,
        presentLocationIndex,
        homeLocationIndex: null,
        objective: goal.objective,
      };
    }),
  };
}

function skeletonTransportPacket(): WorldCastSkeletonTransportPacket {
  const actors = skeletonPacket().actors;
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

function fixedSlotSkeletonPacket(): WorldCastSkeletonPacket {
  return decodeWorldCastSkeletonTransportPacket(framePacket(), skeletonTransportPacket());
}

function detailPacket(): WorldCastDetailPacket {
  const cast = castPacket();
  return {
    actors: cast.actors.map((actor, actorIndex) => {
      const goal = cast.goals.find((entry) => entry.actorRef === actor.actorRef)!;
      return {
        actorIndex,
        traits: [...actor.traits],
        motivation: goal.motivation,
        horizon: goal.horizon,
        priority: goal.priority,
        tags: [...actor.tags],
        additionalGoals: [],
      };
    }),
  };
}

function detailBatchPacket(globalActorIndices: readonly number[]): WorldCastDetailBatchPacket {
  const detail = detailPacket();
  return {
    actors: globalActorIndices.map((actorIndex, detailSlotIndex) => {
      const { actorIndex: _globalActorIndex, ...fields } = detail.actors[actorIndex]!;
      return { detailSlotIndex, ...fields };
    }),
  };
}

function detailActorIndicesFromPrompt(prompt: string): number[] {
  const startMarker = "ASSIGNED_ACTORS\n";
  const endMarker = "\nEND_ASSIGNED_ACTORS";
  const start = prompt.indexOf(startMarker);
  const end = prompt.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) throw new Error("Detail prompt is missing its assigned actor block.");
  const assigned = JSON.parse(
    prompt.slice(start + startMarker.length, end),
  ) as Array<{ actorIndex: number }>;
  return assigned.map((actor) => actor.actorIndex);
}

function detailBatchPacketForPrompt(prompt: string): WorldCastDetailBatchPacket {
  return detailBatchPacket(detailActorIndicesFromPrompt(prompt));
}

function toolDetailBatchPacketForPrompt(prompt: string): WorldCastDetailBatchPacket {
  return toolDetailBatchPacket(detailActorIndicesFromPrompt(prompt));
}

function toolDetailBatchPacket(globalActorIndices: readonly number[]): WorldCastDetailBatchPacket {
  const detailActors = detailPacket().actors;
  return {
    actors: globalActorIndices.map((actorIndex, detailSlotIndex) => {
      const { actorIndex: _globalActorIndex, ...fields } = detailActors[actorIndex]!;
      return { detailSlotIndex, ...fields };
    }),
  };
}

function connectionsTransportPacket(): WorldConnectionsTransportPacket {
  const frame = framePacket();
  const cast = castPacket();
  const persistentLocations = frame.locations.filter((location) =>
    location.kind === "persistent_sublocation"
  );
  const fixedActorRefs = [
    cast.actors[0]!.actorRef,
    cast.actors[5]!.actorRef,
    cast.actors[1]!.actorRef,
    cast.actors[2]!.actorRef,
    cast.actors[3]!.actorRef,
    cast.actors[4]!.actorRef,
    cast.actors[6]!.actorRef,
    cast.actors[7]!.actorRef,
  ];
  const actorIndexByRef = new Map(fixedActorRefs.map((actorRef, index) => [actorRef, index]));
  const locationIndexByRef = new Map(
    persistentLocations.map((location, index) => [location.locationRef, index]),
  );
  const connections = connectionsPacket();
  const semanticRelations = [
    ...connections.relations,
    {
      sourceActorRef: "actor:rhea-quill",
      targetActorRef: "actor:mara-venn",
      relationType: "association" as const,
      summary: "Rhea needs Mara's route judgment.",
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
        locationRefs: ["location:glass-garden"],
      },
    ].map((pressure, index) => ({
      name: pressure.name,
      description: pressure.description,
      trajectory: pressureTrajectories[index]!,
      urgency: pressure.urgency,
      actorIndices: pressure.actorRefs.map((ref) => actorIndexByRef.get(ref)!),
      locationIndices: pressure.locationRefs.map((ref) => locationIndexByRef.get(ref)!),
    })),
  };
}

function toolConnectionsTransportPacket(): WorldConnectionsTransportPacket {
  const base = connectionsTransportPacket();
  return {
    ...base,
    pressures: [
      {
        ...base.pressures[0]!,
        actorIndices: [0, 2, 4, 1],
        locationIndices: [0],
      },
      {
        ...base.pressures[1]!,
        actorIndices: [3, 5],
        locationIndices: [4],
      },
      {
        ...base.pressures[2]!,
        actorIndices: [1],
        locationIndices: [3],
      },
    ],
  };
}

describe("Campaign World connections transport", () => {
  it("maps ordered source rows and direct target indices to canonical actor references", () => {
    const frame = framePacket();
    const skeleton = fixedSlotSkeletonPacket();
    const cast = composeWorldCastPacketFromTransport(frame, skeleton, detailPacket());
    const transport = connectionsTransportPacket();
    const composed = composeWorldConnectionsPacketFromTransport(frame, skeleton, transport);

    expect(composed.relations).toHaveLength(cast.actors.length);
    expect(composed.relations).toEqual(transport.relations.map((relation, relationIndex) => {
      const sourceActorIndex = relationIndex;
      const targetActorIndex = relation.targetActorIndex;
      return {
        sourceActorRef: cast.actors[sourceActorIndex]!.actorRef,
        targetActorRef: cast.actors[targetActorIndex]!.actorRef,
        relationType: relation.relationType,
        summary: [
          "Mara Venn answers to Ilya Venn's authority.",
          "Rhea Quill is associated with Mara Venn.",
          "Oren Tide depends on Mara Venn.",
          "Sel Bell and Ilya Venn are active rivals.",
          "Ilya Venn is associated with Niko Salt.",
          "Niko Salt depends on Rhea Quill.",
          "Tavi Reed is associated with Uma Vale.",
          "Uma Vale depends on Tavi Reed.",
        ][relationIndex]!,
        intensity: relation.intensity,
      };
    }));
    expect(composed.relations.every((relation) =>
      relation.sourceActorRef !== relation.targetActorRef
    )).toBe(true);
    expect(composed.pressures.map((pressure) => pressure.trajectory)).toEqual([
      "Failing Routes continues to escalate.",
      "False Bells holds steady.",
      "Tide Ledger shifts into a new form.",
    ]);
    expect(createWorldConnectionsPacketSchema(frame, cast).safeParse(composed).success).toBe(true);
  });

  it("decodes every closed pressure trajectory into a code-owned canonical sentence", () => {
    const frame = framePacket();
    const skeleton = fixedSlotSkeletonPacket();
    const transport = connectionsTransportPacket();
    const [firstPressure] = transport.pressures;
    const composed = composeWorldConnectionsPacketFromTransport(frame, skeleton, {
      ...transport,
      pressures: [
        ...transport.pressures,
        { ...firstPressure!, name: "Breaking Tide", trajectory: "breaking" },
      ],
    });

    expect(composed.pressures.map((pressure) => pressure.trajectory)).toEqual([
      "Failing Routes continues to escalate.",
      "False Bells holds steady.",
      "Tide Ledger shifts into a new form.",
      "Breaking Tide reaches a breaking point.",
    ]);
  });

  it("builds canonical relation summaries for every relation type from accepted actor names", () => {
    const frame = framePacket();
    const skeleton = fixedSlotSkeletonPacket();
    const namedSkeleton: WorldCastSkeletonPacket = {
      ...skeleton,
      actors: skeleton.actors.map((actor, index) =>
        index === 0
          ? { ...actor, name: "Aldous Fenwick" }
          : index === 1
            ? { ...actor, name: "Griet Vandam" }
            : actor
      ),
    };
    const relationTypes = [
      "alliance",
      "rivalry",
      "authority",
      "dependency",
      "kinship",
      "association",
      "hostility",
      "alliance",
    ] as const;
    const transport = {
      ...connectionsTransportPacket(),
      relations: namedSkeleton.actors.map((_, sourceActorIndex) => ({
        targetActorIndex: sourceActorIndex === 0 ? 1 : 0,
        relationType: relationTypes[sourceActorIndex],
        intensity: 1,
      })),
    } satisfies WorldConnectionsTransportPacket;

    const composed = composeWorldConnectionsPacketFromTransport(frame, namedSkeleton, transport);

    expect(composed.relations.map((relation) => relation.summary)).toEqual([
      "Aldous Fenwick and Griet Vandam work as allies.",
      "Griet Vandam and Aldous Fenwick are active rivals.",
      "Oren Tide answers to Aldous Fenwick's authority.",
      "Sel Bell depends on Aldous Fenwick.",
      "Ilya Venn and Aldous Fenwick are kin.",
      "Niko Salt is associated with Aldous Fenwick.",
      "Tavi Reed is hostile toward Aldous Fenwick.",
      "Uma Vale and Aldous Fenwick work as allies.",
    ]);
  });
});

function structuredModel(): LanguageModel {
  const model = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(
    model,
    buildStructuredOutputModelMetadata({
      providerId: "test-provider",
      providerName: "Test Provider",
      model: "test-model",
      protocol: "openai-compatible",
      baseUrl: "https://example.test/v1",
      transport: "chat-completions",
    }),
  );
  return model;
}

function toolStructuredModel(): LanguageModel {
  const model = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(
    model,
    buildStructuredOutputModelMetadata({
      providerId: "zai-coding-plan",
      providerName: "Z.AI",
      model: "glm-5.3",
      protocol: "openai-compatible",
      baseUrl: "https://api.z.ai/v1",
      transport: "chat-completions",
    }),
  );
  return model;
}

function trace(
  strategy: SafeGenerateTrace["strategy"] = "native_schema",
  primaryStrategy: SafeGenerateTrace["primaryStrategy"] = "native_schema",
): SafeGenerateTrace {
  return {
    text: "private model output",
    cleanedText: "private cleaned output",
    requestedMode: "auto",
    strategy,
    primaryStrategy,
    fallbackStrategy: "text_fallback",
    capability: {
      requestedMode: "auto",
      primaryStrategy: primaryStrategy ?? "native_schema",
      fallbackStrategy: "text_fallback",
      actualMode: primaryStrategy ?? "native_schema",
      reason: "test capability",
    },
    reasoningText: "private reasoning",
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
      reasoningTokens: 10,
    },
    response: {
      id: "private-response-id",
      modelId: "response-model",
      timestamp: "private-timestamp",
    },
    providerMetadata: { private: true },
    finishReason: "stop",
  };
}

function traceWithUsage(
  strategy: SafeGenerateTrace["strategy"] = "native_schema",
  primaryStrategy: SafeGenerateTrace["primaryStrategy"] = "native_schema",
  inputTokens = 100,
  outputTokens = 50,
): SafeGenerateTrace {
  const result = trace(strategy, primaryStrategy);
  result.usage = {
    ...result.usage,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
  };
  return result;
}

function successfulGenerateMock() {
  return vi
    .fn()
    .mockResolvedValueOnce({ object: framePacket(), trace: trace() })
    .mockResolvedValueOnce({ object: skeletonTransportPacket(), trace: trace() })
    .mockResolvedValueOnce({ object: detailBatchPacket([0, 2]), trace: trace() })
    .mockResolvedValueOnce({ object: detailBatchPacket([1, 3]), trace: trace() })
    .mockResolvedValueOnce({ object: detailBatchPacket([4, 6]), trace: trace() })
    .mockResolvedValueOnce({ object: detailBatchPacket([5, 7]), trace: trace() })
    .mockResolvedValueOnce({ object: connectionsTransportPacket(), trace: trace() });
}

function successfulToolGenerateMock() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      object: toolFramePacket(),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: combinedSkeletonTransportPacket(),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: toolDetailBatchPacket([0, 2]),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: toolDetailBatchPacket([1, 3]),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: toolDetailBatchPacket([4, 6]),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: toolDetailBatchPacket([5, 7]),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: toolConnectionsTransportPacket(),
      trace: trace("tool_mode", "tool_mode"),
    });
}

function sequentialIdFactory(): () => string {
  let next = 0;
  return () => `persistent-id-${++next}`;
}

type ToolFrameMutation = (packet: WorldFrameToolPacket) => void;

type TestGenerateOptions = {
  prompt: string;
  abortSignal?: AbortSignal;
  [key: string]: unknown;
};

function mutableToolFramePacket(): WorldFrameToolPacket {
  const packet = JSON.parse(JSON.stringify(toolFramePacket())) as WorldFrameToolPacket;
  packet.macroLocations[0]!.name = "MODEL_PRIVATE_LOCATION_NAME";
  packet.macroLocations[0]!.description = "MODEL_PRIVATE_DESCRIPTION";
  return packet;
}

function combinedToolPacket(): WorldFrameAndCastSkeletonToolPacket {
  return {
    ...toolFramePacket(),
    ...combinedSkeletonTransportPacket(),
  };
}

function combinedSkeletonTransportPacket(): WorldCastSkeletonTransportPacket {
  return skeletonTransportPacket();
}

function mutableCombinedToolPacket(): WorldFrameAndCastSkeletonToolPacket {
  const packet = JSON.parse(JSON.stringify(combinedToolPacket())) as WorldFrameAndCastSkeletonToolPacket;
  packet.macroLocations[0]!.name = "MODEL_PRIVATE_LOCATION_NAME";
  packet.macroLocations[0]!.description = "MODEL_PRIVATE_DESCRIPTION";
  return packet;
}

function combinedToolPacketForStartingMacro(
  startingMacroIndex: 0 | 1 | 2,
): WorldFrameAndCastSkeletonToolPacket {
  const packet = JSON.parse(JSON.stringify(combinedToolPacket())) as WorldFrameAndCastSkeletonToolPacket;
  packet.startingMacroIndex = startingMacroIndex;
  const anchorPlacements = [
    { startingSupport: 0, remoteBackground: 2 },
    { startingSupport: 2, remoteBackground: 0 },
    { startingSupport: 4, remoteBackground: 0 },
  ] as const;
  const placements = anchorPlacements[startingMacroIndex];
  packet.startingSupport.presentLocationIndex = placements.startingSupport;
  packet.remoteBackground.presentLocationIndex = placements.remoteBackground;
  return packet;
}

function recoveryIssuesFromPrompt(prompt: string): Array<Record<string, unknown>> {
  const start = prompt.indexOf("SAFE_ISSUES\n");
  const end = prompt.indexOf("\nEND_SAFE_ISSUES", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return JSON.parse(prompt.slice(start + "SAFE_ISSUES\n".length, end)) as Array<Record<string, unknown>>;
}

async function productionConnectionsSafeGenerateError(
  schema: z.ZodType<WorldConnectionsTransportPacket>,
  input: unknown,
): Promise<unknown> {
  mockGenerateText.mockReset();
  mockGenerateText.mockResolvedValueOnce({
    text: "",
    finishReason: "tool-calls",
    toolCalls: [{
      type: "tool-call",
      toolName: "structured_output",
      invalid: true,
      input,
    }],
  });

  let captured: unknown;
  try {
    await safeGenerateObject({
      model: toolStructuredModel(),
      schema,
      prompt: "Return the world-connections packet.",
      mode: "tool",
      retries: 1,
      allowRepair: false,
      allowTextFallback: false,
      strictSchema: true,
    });
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeDefined();
  expect(getSafeGenerateObjectSchemaDiagnostics(captured)).toMatchObject({
    schemaParseOutcome: "invalid",
    schemaIssueCount: expect.any(Number),
    schemaIssues: expect.any(Array),
  });
  return captured;
}

async function productionCastSafeGenerateError(
  schema: z.ZodType<WorldCastDetailBatchPacket>,
  input: unknown,
): Promise<unknown> {
  mockGenerateText.mockReset();
  mockGenerateText.mockResolvedValueOnce({
    text: "",
    finishReason: "tool-calls",
    toolCalls: [{
      type: "tool-call",
      toolName: "structured_output",
      invalid: true,
      input,
    }],
  });

  let captured: unknown;
  try {
    await safeGenerateObject({
      model: toolStructuredModel(),
      schema,
      prompt: "Return the world-cast packet.",
      mode: "tool",
      retries: 1,
      allowRepair: false,
      allowTextFallback: false,
      strictSchema: true,
    });
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeDefined();
  expect(getSafeGenerateObjectSchemaDiagnostics(captured)).toMatchObject({
    schemaParseOutcome: "invalid",
    schemaIssueCount: expect.any(Number),
    schemaIssues: expect.any(Array),
  });
  return captured;
}

async function productionCastSkeletonSafeGenerateError(
  schema: z.ZodType<WorldCastSkeletonTransportPacket>,
  input: unknown,
): Promise<unknown> {
  mockGenerateText.mockReset();
  mockGenerateText.mockResolvedValueOnce({
    text: "",
    finishReason: "tool-calls",
    toolCalls: [{
      type: "tool-call",
      toolName: "structured_output",
      invalid: true,
      input,
    }],
  });

  let captured: unknown;
  try {
    await safeGenerateObject({
      model: toolStructuredModel(),
      schema,
      prompt: "Return the world-cast skeleton packet.",
      mode: "tool",
      retries: 1,
      allowRepair: false,
      allowTextFallback: false,
      strictSchema: true,
    });
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeDefined();
  expect(getSafeGenerateObjectSchemaDiagnostics(captured)).toMatchObject({
    schemaParseOutcome: "invalid",
    schemaIssueCount: expect.any(Number),
    schemaIssues: expect.any(Array),
  });
  return captured;
}

function stageErrorCause(error: unknown): Record<string, unknown> {
  return (error as { cause?: Record<string, unknown> }).cause ?? {};
}

describe("Campaign World staged builder", () => {
  it("gives the frame wave up to 70 seconds and does not retry after its deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const abortSignals: AbortSignal[] = [];
      const generateMock = vi.fn(async (options: TestGenerateOptions) => {
        abortSignals.push(options.abortSignal!);
        return new Promise<never>(() => {});
      });
      const builder = createCampaignWorldBuilder({
        generateObject: generateMock as unknown as typeof safeGenerateObject,
      });
      const buildPromise = builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
      const rejectionPromise = buildPromise.catch((error: unknown) => error);
      for (let tick = 0; tick < 10 && generateMock.mock.calls.length < 1; tick += 1) {
        await Promise.resolve();
      }
      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(generateMock.mock.calls[0]![0].timeout).toEqual({ totalMs: 70_000 });
      expect(abortSignals[0]!.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(69_999);
      expect(abortSignals[0]!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const rejection = await rejectionPromise;
      expect(rejection).toMatchObject({
        code: "model_contract_failed",
        stage: "world_frame",
        stageEvidence: [{ stage: "world_frame", totalAttempts: 1, retryUsed: false }],
      });
      expect(rejection).toBeInstanceOf(CampaignWorldBuilderError);
      expect(stageErrorCause(rejection)).toBeInstanceOf(CampaignWorldStageTimeoutError);
      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(abortSignals[0]!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("gives a tool-mode frame its own strict recovery wave before skeleton transport", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const invalidFrame = { ...toolFramePacket() } as Record<string, unknown>;
      delete invalidFrame.persistentLocations;
      invalidFrame.privateProviderBody = "PRIVATE_PROVIDER_BODY";
      let frameAttempts = 0;
      const generateMock = vi.fn(async (options: TestGenerateOptions) => {
        const prompt = String(options.prompt);
        if (prompt.startsWith("You design the Campaign World frame.")) {
          const attempt = frameAttempts++;
          const result = attempt === 0
            ? { object: invalidFrame, trace: trace("tool_mode", "tool_mode") }
            : { object: toolFramePacket(), trace: trace("tool_mode", "tool_mode") };
          return new Promise<typeof result>((resolve) => {
            setTimeout(() => resolve(result), 30_000);
          });
        }
        if (prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
          return {
            object: combinedSkeletonTransportPacket(),
            trace: trace("tool_mode", "tool_mode"),
          };
        }
        if (prompt.startsWith(
          "You complete one assigned detail batch for an accepted Campaign World cast skeleton.",
        )) {
          return {
            object: toolDetailBatchPacketForPrompt(prompt),
            trace: trace("tool_mode", "tool_mode"),
          };
        }
        if (prompt.startsWith(
          "You design Campaign World relations and starting pressures from an accepted cast skeleton.",
        )) {
          return {
            object: toolConnectionsTransportPacket(),
            trace: trace("tool_mode", "tool_mode"),
          };
        }
        throw new Error(`Unexpected Campaign World prompt: ${prompt.slice(0, 80)}`);
      });
      const builder = createCampaignWorldBuilder({
        generateObject: generateMock as unknown as typeof safeGenerateObject,
        idFactory: sequentialIdFactory(),
      });

      const buildPromise = builder.build({
        source: sourceFixture(false),
        model: toolStructuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
      for (let tick = 0; tick < 20 && generateMock.mock.calls.length < 1; tick += 1) {
        await Promise.resolve();
      }
      expect(generateMock).toHaveBeenCalledTimes(1);
      const firstOptions = generateMock.mock.calls[0]![0];
      expect(firstOptions.timeout).toEqual({ totalMs: 70_000 });
      expect(firstOptions.schema).toBe(worldFrameToolPacketSchema);
      expect(String(firstOptions.prompt)).not.toContain("WORLD_CAST_SKELETON_IN_SAME_PACKET");

      await vi.advanceTimersByTimeAsync(29_999);
      expect(Date.now()).toBe(29_999);
      expect(generateMock).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1);
      for (let tick = 0; tick < 20 && generateMock.mock.calls.length < 2; tick += 1) {
        await Promise.resolve();
      }
      expect(Date.now()).toBe(30_000);
      expect(generateMock).toHaveBeenCalledTimes(2);
      const secondOptions = generateMock.mock.calls[1]![0];
      expect(secondOptions.model).toBe(firstOptions.model);
      expect(secondOptions.schema).toBe(firstOptions.schema);
      expect(secondOptions.temperature).toBe(firstOptions.temperature);
      expect(secondOptions.maxOutputTokens).toBe(firstOptions.maxOutputTokens);
      expect(secondOptions.retries).toBe(firstOptions.retries);
      expect(secondOptions.timeout).toEqual({ totalMs: 40_000 });
      const secondPrompt = String(secondOptions.prompt);
      expect(secondOptions.schema).toBe(worldFrameToolPacketSchema);
      expect(secondPrompt).toContain("WORLD_FRAME_RECOVERY:");
      const recoveryIssues = recoveryIssuesFromPrompt(secondPrompt);
      expect(recoveryIssues.some((issue) =>
        JSON.stringify(issue.path) === JSON.stringify(["persistentLocations"]) &&
        issue.check === "unknown_contract_issue"
      )).toBe(true);
      expect(recoveryIssues.every((issue) =>
        Object.keys(issue).sort().join(",") === "check,code,issueIndex,path"
      )).toBe(true);
      expect(secondPrompt).not.toContain("PRIVATE_PROVIDER_BODY");
      expect(secondPrompt).not.toContain("WORLD_CAST_SKELETON_IN_SAME_PACKET");

      await vi.advanceTimersByTimeAsync(29_999);
      expect(generateMock).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      for (let tick = 0; tick < 20 && generateMock.mock.calls.length < 7; tick += 1) {
        await Promise.resolve();
      }

      const candidate = await buildPromise;
      expect(Date.now()).toBe(60_000);
      expect(Date.now()).toBeLessThanOrEqual(CAMPAIGN_WORLD_BUILD_BUDGET_MS);
      expect(generateMock).toHaveBeenCalledTimes(8);
      expect(candidate.stageEvidence).toHaveLength(3);
      expect(candidate.stageEvidence[0]).toMatchObject({
        stage: "world_frame",
        totalAttempts: 2,
        retryUsed: true,
        textFallbackUsed: false,
      });
      expect(candidate.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
        totalAttempts: 5,
        retryUsed: false,
      });
      expect(String(generateMock.mock.calls[2]![0].prompt)).toContain(
        "You design the compact starting Campaign World cast skeleton.",
      );
      expect(String(generateMock.mock.calls[2]![0].prompt)).not.toContain("WORLD_FRAME_RECOVERY:");
      expect(candidate.draft.locations).toHaveLength(9);
      expect(candidate.draft.actors).toHaveLength(8);
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a fresh 70-second skeleton wave after frame completion", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      let resolveFrame!: (value: { object: WorldFramePacket; trace: SafeGenerateTrace }) => void;
      const frameGate = new Promise<{ object: WorldFramePacket; trace: SafeGenerateTrace }>((resolve) => {
        resolveFrame = resolve;
      });
      const skeletonSignals: AbortSignal[] = [];
      const generateMock = vi.fn(async (options: TestGenerateOptions) => {
        if (options.prompt.startsWith("You design the Campaign World frame.")) {
          return frameGate;
        }
        if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
          skeletonSignals.push(options.abortSignal!);
          return new Promise<never>(() => {});
        }
        throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
      });
      const builder = createCampaignWorldBuilder({
        generateObject: generateMock as unknown as typeof safeGenerateObject,
      });
      const buildPromise = builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
      const rejectionPromise = buildPromise.catch((error: unknown) => error);
      for (let tick = 0; tick < 10 && generateMock.mock.calls.length < 1; tick += 1) {
        await Promise.resolve();
      }
      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(generateMock.mock.calls[0]![0].timeout).toEqual({ totalMs: 70_000 });

      await vi.advanceTimersByTimeAsync(27_000);
      resolveFrame({ object: framePacket(), trace: trace() });
      for (let tick = 0; tick < 10 && generateMock.mock.calls.length < 2; tick += 1) {
        await Promise.resolve();
      }
      expect(generateMock).toHaveBeenCalledTimes(2);
      expect(generateMock.mock.calls[1]![0].timeout).toEqual({ totalMs: 70_000 });
      expect(skeletonSignals[0]!.aborted).toBe(false);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(Date.now()).toBe(87_000);
      expect(skeletonSignals[0]!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(10_000);

      const rejection = await rejectionPromise;
      expect(rejection).toMatchObject({
        code: "model_contract_failed",
        stage: "world_cast",
        stageEvidence: [
          { stage: "world_frame", totalAttempts: 1 },
          { stage: "world_cast", totalAttempts: 1, retryUsed: false },
        ],
      });
      expect(stageErrorCause(rejection)).toBeInstanceOf(CampaignWorldStageTimeoutError);
      expect(generateMock).toHaveBeenCalledTimes(2);
      expect(skeletonSignals[0]!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the downstream branch wave alive for a 65.577-second call", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    try {
      const connectionGate = (() => {
        let resolve!: (value: {
          object: WorldConnectionsTransportPacket;
          trace: SafeGenerateTrace;
        }) => void;
        const promise = new Promise<{
          object: WorldConnectionsTransportPacket;
          trace: SafeGenerateTrace;
        }>((resolvePromise) => {
          resolve = resolvePromise;
        });
        return { promise, resolve };
      })();
      const branchSignals: AbortSignal[] = [];
      const branchTimeouts: number[] = [];
      const generateMock = vi.fn(async (options: TestGenerateOptions) => {
        if (options.prompt.startsWith("You design the Campaign World frame.")) {
          return { object: framePacket(), trace: trace() };
        }
        if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
          return { object: skeletonTransportPacket(), trace: trace() };
        }
        if (options.prompt.startsWith(
          "You complete one assigned detail batch for an accepted Campaign World cast skeleton.",
        )) {
          branchSignals.push(options.abortSignal!);
          branchTimeouts.push((options.timeout as { totalMs: number }).totalMs);
          return {
            object: detailBatchPacketForPrompt(options.prompt),
            trace: trace(),
          };
        }
        if (options.prompt.startsWith(
          "You design Campaign World relations and starting pressures from an accepted cast skeleton.",
        )) {
          branchSignals.push(options.abortSignal!);
          branchTimeouts.push((options.timeout as { totalMs: number }).totalMs);
          return connectionGate.promise;
        }
        throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
      });
      const builder = createCampaignWorldBuilder({
        generateObject: generateMock as unknown as typeof safeGenerateObject,
        idFactory: sequentialIdFactory(),
      });

      const buildPromise = builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
      for (let tick = 0; tick < 20 && generateMock.mock.calls.length < 5; tick += 1) {
        await Promise.resolve();
      }
      expect(generateMock).toHaveBeenCalledTimes(7);
      expect(branchSignals).toHaveLength(5);
      expect(branchTimeouts).toEqual([70_000, 70_000, 70_000, 70_000, 70_000]);

      await vi.advanceTimersByTimeAsync(60_000);
      expect(branchSignals.every((signal) => !signal.aborted)).toBe(true);
      await vi.advanceTimersByTimeAsync(5_577);
      expect(Date.now()).toBe(65_577);
      expect(branchSignals.every((signal) => !signal.aborted)).toBe(true);

      connectionGate.resolve({ object: connectionsTransportPacket(), trace: trace() });
      const candidate = await buildPromise;
      expect(candidate.stageEvidence).toHaveLength(3);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ["premise-only", false],
    ["World DNA", true],
  ])("builds a valid %s world through a frame, skeleton, detail, and connections calls", async (_label, withDna) => {
    const generateMock = successfulGenerateMock();
    const observer = {
      onStageStarted: vi.fn(),
      onStageCompleted: vi.fn(),
    };
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(withDna),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
      observer,
    });

    expect(generateMock).toHaveBeenCalledTimes(7);
    expect(generateMock.mock.calls[0]![0].schema).toBe(worldFramePacketSchema);
    for (const [index, call] of generateMock.mock.calls.entries()) {
      expect(call[0]).toMatchObject({
        mode: "auto",
        strictSchema: true,
        allowRepair: false,
        allowTextFallback: false,
        retries: 1,
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
      expect(call[0].timeout.totalMs).toBeGreaterThan(0);
      expect(call[0].timeout.totalMs).toBeLessThanOrEqual(70_000);
    }
    const prompts = generateMock.mock.calls.map((call) => String(call[0].prompt));
    expect(prompts.every((prompt) => prompt.includes(sourceFixture(withDna).premise))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      "Output every string without leading or trailing whitespace.",
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      "Keep each reference, name, tag, and trait on one line without line breaks.",
    ))).toBe(true);
    expect(prompts[1]).toContain("PERSISTENT_LOCATION_SLOTS");
    expect(prompts[1]).toContain("presentLocationIndex");
    expect(prompts[1]).toContain("never emit actorRef, locationRef, or any free-form reference");
    const detailPrompts = prompts.filter((prompt) => prompt.startsWith(
      "You complete one assigned detail batch for an accepted Campaign World cast skeleton.",
    ));
    expect(detailPrompts).toHaveLength(4);
    for (const detailPrompt of detailPrompts) {
      expect(detailPrompt).toContain("ASSIGNED_ACTORS");
      expect(detailPrompt).not.toContain("WORLD_CAST_SKELETON\n");
      expect(detailPrompt).not.toContain("DETAIL_ACTOR_SLOTS\n");
    }
    expect(detailPrompts[0]).toContain(
      "Fill exactly the detail fields traits, motivation, horizon, priority, tags, and additionalGoals.",
    );
    expect(detailPrompts[0]).toContain(
      "For each actor, return 2-4 short traits and 2-4 short tags",
    );
    expect(detailPrompts[0]).toContain("each trait and tag must be <=48 characters");
    expect(detailPrompts[0]).toContain("motivation as one concise sentence <=160 characters");
    expect(detailPrompts[1]).toContain(
      "At most one actor in this batch may receive one additional goal",
    );
    const connectionsPrompt = prompts.find((prompt) => prompt.startsWith(
      "You design Campaign World relations and starting pressures from an accepted cast skeleton.",
    ));
    expect(connectionsPrompt).toBeDefined();
    expect(connectionsPrompt).toContain("WORLD_CAST_SKELETON");
    expect(connectionsPrompt).toContain(
      "Each relations[] object contains exactly targetActorIndex, relationType, and intensity.",
    );
    expect(connectionsPrompt).toContain(
      "Return exactly 8 relation rows in source-slot order: array position i is source actor i, so row 0 is source actor 0 and so on.",
    );
    expect(connectionsPrompt).not.toContain("RELATION_SLOTS");
    expect(connectionsPrompt).not.toContain("relationSlotIndex");
    expect(connectionsPrompt).not.toContain("targetOffset");
    expect(connectionsPrompt).toContain("locationIndices");
    expect(prompts[0]).toContain(
      "Set parentLocationRef to null for each macro region.",
    );
    expect(prompts[0]).toContain(
      "Give every persistent sublocation an existing macro region as its parent.",
    );
    expect(connectionsPrompt).toContain("Set intensity and urgency from 1 through 5.");
    if (withDna) {
      expect(prompts.every((prompt) => prompt.includes("Salt-worn ritual"))).toBe(true);
    }
    expect(observer.onStageStarted.mock.calls.map((call) => call[0])).toEqual([
      "world_frame",
      "world_cast",
      "world_connections",
    ]);
    expect(observer.onStageCompleted).toHaveBeenCalledTimes(3);
    expect(candidate.stageEvidence).toHaveLength(3);
    expect(candidate.contentHash).toHaveLength(64);
    expect(candidate.draft.actors).toHaveLength(8);
    expect(candidate.draft.actors.every((actor) => actor.kind === "person")).toBe(true);
    expect(candidate.draft.actors.every((actor) =>
      actor.controller === "agent" && String(actor.role) !== "player"
    )).toBe(true);
    expect(candidate.draft.locations.every((location) =>
      location.id.startsWith("persistent-id-")
    )).toBe(true);
    expect(candidate.draft.pressures[0].actorIds).toEqual([
      candidate.draft.actors[0].id,
      candidate.draft.actors[2].id,
      candidate.draft.actors[4].id,
      candidate.draft.actors[1].id,
    ]);

    const evidenceJson = JSON.stringify(candidate.stageEvidence);
    expect(evidenceJson).not.toContain("private model output");
    expect(evidenceJson).not.toContain("private reasoning");
    expect(evidenceJson).not.toContain("private-response-id");
    expect(evidenceJson).not.toContain("private-timestamp");
    expect(evidenceJson).not.toContain("providerMetadata");
    expect(candidate.stageEvidence[0]).toEqual({
      stage: "world_frame",
      requestedMode: "auto",
      primaryStrategy: "native_schema",
      actualStrategy: "native_schema",
      totalAttempts: 1,
      repairUsed: false,
      retryUsed: false,
      textFallbackUsed: false,
      responseModel: "response-model",
      finishReason: "stop",
      errorCode: null,
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    });
  });

  it.each([
    ["cast detail", "world_cast"],
    ["connections", "world_connections"],
  ] as const)("proves cast detail and connections overlap when %s resolves first", async (_label, firstStage) => {
    const deferred = <T,>() => {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      return { promise, resolve, reject };
    };
    const castStarted = deferred<void>();
    const connectionsStarted = deferred<void>();
    const castGates = Array.from({ length: 4 }, () => deferred<{
      object: WorldCastDetailBatchPacket;
      trace: SafeGenerateTrace;
    }>());
    const connectionsGate = deferred<{
      object: WorldConnectionsTransportPacket;
      trace: SafeGenerateTrace;
    }>();
    let castBatchIndex = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      if (options.prompt.startsWith("You design the Campaign World frame.")) {
        return { object: framePacket(), trace: trace() };
      }
      if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        return { object: skeletonTransportPacket(), trace: trace() };
      }
      if (options.prompt.startsWith("You complete one assigned detail batch for an accepted Campaign World cast skeleton.")) {
        castStarted.resolve();
        return castGates[castBatchIndex++].promise;
      }
      if (options.prompt.startsWith("You design Campaign World relations and starting pressures from an accepted cast skeleton.")) {
        connectionsStarted.resolve();
        return connectionsGate.promise;
      }
      throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
    });
    const observer = {
      onStageStarted: vi.fn(),
      onStageCompleted: vi.fn(),
    };
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    let settled = false;
    let candidate: Awaited<ReturnType<typeof builder.build>> | undefined;
    let failure: unknown;
    const pending = builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
      observer,
    }).then(
      (result) => {
        candidate = result;
        settled = true;
      },
      (error: unknown) => {
        failure = error;
        settled = true;
      },
    );

    await Promise.all([castStarted.promise, connectionsStarted.promise]);
    expect(generateMock).toHaveBeenCalledTimes(7);
    expect(observer.onStageStarted.mock.calls.map((call) => call[0])).toEqual([
      "world_frame",
      "world_cast",
      "world_connections",
    ]);

    if (firstStage === "world_cast") {
      castGates.forEach((gate, index) => gate.resolve({
        object: detailBatchPacket([[0, 2], [1, 3], [4, 6], [5, 7]][index]!),
        trace: trace(),
      }));
    } else {
      connectionsGate.resolve({ object: connectionsTransportPacket(), trace: trace() });
    }
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(candidate).toBeUndefined();
    expect(failure).toBeUndefined();

    if (firstStage === "world_cast") {
      connectionsGate.resolve({ object: connectionsTransportPacket(), trace: trace() });
    } else {
      castGates.forEach((gate, index) => gate.resolve({
        object: detailBatchPacket([[0, 2], [1, 3], [4, 6], [5, 7]][index]!),
        trace: trace(),
      }));
    }
    await pending;

    expect(failure).toBeUndefined();
    expect(settled).toBe(true);
    expect(candidate).toBeDefined();
    expect(candidate!.draft.actors).toHaveLength(8);
    expect(candidate!.draft.relations).toHaveLength(8);
    expect(candidate!.draft.pressures).toHaveLength(3);
    expect(candidate!.stageEvidence).toHaveLength(3);
    expect(candidate!.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
      stage: "world_cast",
      totalAttempts: 5,
      totalTokens: 750,
    });
    expect(candidate!.stageEvidence.find((entry) => entry.stage === "world_connections")).toMatchObject({
      stage: "world_connections",
      totalAttempts: 1,
      totalTokens: 150,
    });
    expect(observer.onStageCompleted).toHaveBeenCalledTimes(3);
    expect(observer.onStageCompleted.mock.calls.map((call) => call[0].stage)).toEqual([
      "world_frame",
      firstStage,
      firstStage === "world_cast" ? "world_connections" : "world_cast",
    ]);
  });

  it.each([
    ["world_cast", "world_connections"],
    ["world_connections", "world_cast"],
  ] as const)(
    "keeps the concurrent group atomic when %s fails and the sibling resolves late",
    async (failedStage, siblingStage) => {
      const deferred = <T,>() => {
        let resolve!: (value: T | PromiseLike<T>) => void;
        const promise = new Promise<T>((resolvePromise) => {
          resolve = resolvePromise;
        });
        return { promise, resolve };
      };
      const failedStarted = deferred<void>();
      const siblingStarted = deferred<void>();
      const failureGate = deferred<void>();
      const lateGate = deferred<{
        object: WorldCastDetailBatchPacket | WorldConnectionsTransportPacket;
        trace: SafeGenerateTrace;
      }>();
      const abortObserved = deferred<void>();
      const generateMock = vi.fn(async (options: {
        prompt: string;
        abortSignal?: AbortSignal;
      }) => {
        if (options.prompt.startsWith("You design the Campaign World frame.")) {
          return { object: framePacket(), trace: trace() };
        }
        if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
          return {
            object: skeletonTransportPacket(),
            trace: traceWithUsage("native_schema", "native_schema", 20, 10),
          };
        }
        const isCastBatch = options.prompt.startsWith(
          "You complete one assigned detail batch for an accepted Campaign World cast skeleton.",
        );
        const stage = isCastBatch
          ? "world_cast"
          : options.prompt.startsWith(
            "You design Campaign World relations and starting pressures from an accepted cast skeleton.",
          )
            ? "world_connections"
            : null;
        if (stage === null) {
          throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
        }
        const isFailedCall = stage === failedStage && (
          stage !== "world_cast" || options.prompt.includes('"actorIndex":0')
        );
        if (isFailedCall) {
          failedStarted.resolve();
          await failureGate.promise;
          return {
            get object(): never {
              throw new Error(`${failedStage} provider failure`);
            },
            trace: traceWithUsage(
              "native_schema",
              "native_schema",
              failedStage === "world_cast" ? 30 : 40,
              20,
            ),
          };
        }
        siblingStarted.resolve();
        options.abortSignal?.addEventListener("abort", () => abortObserved.resolve(), { once: true });
        return lateGate.promise;
      });
      const observer = {
        onStageStarted: vi.fn(),
        onStageCompleted: vi.fn(),
      };
      const builder = createCampaignWorldBuilder({
        generateObject: generateMock as unknown as typeof safeGenerateObject,
        idFactory: sequentialIdFactory(),
      });
      const buildPromise = builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
        observer,
      });

      await Promise.all([failedStarted.promise, siblingStarted.promise]);
      expect(observer.onStageStarted.mock.calls.map((call) => call[0])).toEqual([
        "world_frame",
        "world_cast",
        "world_connections",
      ]);
      failureGate.resolve();
      await abortObserved.promise;
      expect(observer.onStageCompleted).toHaveBeenCalledTimes(1);
      expect(observer.onStageCompleted.mock.calls[0]![0].stage).toBe("world_frame");

      lateGate.resolve({
        object: siblingStage === "world_cast"
          ? detailBatchPacket([0, 2])
          : connectionsTransportPacket(),
        trace: trace(),
      });
      const expectedFailureEvidence = failedStage === "world_cast"
        ? {
          stage: failedStage,
          totalAttempts: 4,
          retryUsed: true,
          inputTokens: 110,
          outputTokens: 70,
          totalTokens: 180,
        }
        : {
          stage: failedStage,
          totalAttempts: 3,
          retryUsed: true,
          inputTokens: 120,
          outputTokens: 60,
          totalTokens: 180,
        };
      await expect(buildPromise).rejects.toMatchObject({
        code: "model_contract_failed",
        stage: failedStage,
        stageEvidence: [
          { stage: "world_frame" },
          expectedFailureEvidence,
        ],
      });
      const error = await buildPromise.catch((value: unknown) => value);
      expect(error).toBeInstanceOf(CampaignWorldBuilderError);
      expect((error as CampaignWorldBuilderError).stageEvidence.map((entry) => entry.stage))
        .not.toContain(siblingStage);
      expect(observer.onStageCompleted).toHaveBeenCalledTimes(1);
    },
  );

  it("treats a local detail timeout as terminal, aborts sibling calls, and records no partial stage", async () => {
    vi.useFakeTimers();
    try {
      const never = <T,>() => new Promise<T>(() => {});
      const batchSignals: AbortSignal[] = [];
      const connectionSignals: AbortSignal[] = [];
      const branchTimeouts: number[] = [];
      const generateMock = vi.fn(async (options: TestGenerateOptions) => {
        if (options.prompt.startsWith("You design the Campaign World frame.")) {
          return { object: framePacket(), trace: trace() };
        }
        if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
          return { object: skeletonTransportPacket(), trace: trace() };
        }
        if (options.prompt.startsWith(
          "You complete one assigned detail batch for an accepted Campaign World cast skeleton.",
        )) {
          batchSignals.push(options.abortSignal!);
          branchTimeouts.push((options.timeout as { totalMs: number }).totalMs);
          return never<{
            object: WorldCastDetailBatchPacket;
            trace: SafeGenerateTrace;
          }>();
        }
        if (options.prompt.startsWith(
          "You design Campaign World relations and starting pressures from an accepted cast skeleton.",
        )) {
          connectionSignals.push(options.abortSignal!);
          branchTimeouts.push((options.timeout as { totalMs: number }).totalMs);
          return never<{
            object: WorldConnectionsTransportPacket;
            trace: SafeGenerateTrace;
          }>();
        }
        throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
      });
      const observer = {
        onStageStarted: vi.fn(),
        onStageCompleted: vi.fn(),
      };
      const builder = createCampaignWorldBuilder({
        generateObject: generateMock as unknown as typeof safeGenerateObject,
        idFactory: sequentialIdFactory(),
      });

      const buildPromise = builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
        observer,
      });
      const rejectionPromise = buildPromise.catch((error: unknown) => error);
      for (let tick = 0; tick < 20 && generateMock.mock.calls.length < 7; tick += 1) {
        await Promise.resolve();
      }
      expect(generateMock).toHaveBeenCalledTimes(7);
      expect(batchSignals).toHaveLength(4);
      expect(connectionSignals).toHaveLength(1);
      expect(branchTimeouts).toEqual([70_000, 70_000, 70_000, 70_000, 70_000]);
      expect(observer.onStageCompleted).toHaveBeenCalledTimes(1);
      expect(observer.onStageCompleted.mock.calls[0]![0].stage).toBe("world_frame");

      await vi.advanceTimersByTimeAsync(69_999);
      expect(batchSignals.every((signal) => !signal.aborted)).toBe(true);
      expect(connectionSignals[0]!.aborted).toBe(false);
      await vi.advanceTimersByTimeAsync(1);

      const rejection = await rejectionPromise;
      expect(rejection).toBeInstanceOf(CampaignWorldBuilderError);
      expect(rejection).toMatchObject({
        code: "model_contract_failed",
        stage: "world_cast",
        stageEvidence: [
          { stage: "world_frame", totalAttempts: 1 },
          { stage: "world_cast", totalAttempts: 2, retryUsed: false },
        ],
      });
      const castFailure = stageErrorCause(rejection);
      expect(castFailure.name).toBe("CampaignWorldStageFailure");
      expect(castFailure.cause).toBeInstanceOf(CampaignWorldStageTimeoutError);
      expect((castFailure.cause as CampaignWorldStageTimeoutError).stage).toBe("world_cast");
      expect(batchSignals.every((signal) => signal.aborted)).toBe(true);
      expect(connectionSignals[0]!.aborted).toBe(true);
      expect(generateMock.mock.calls.filter(([call]) =>
        String(call.prompt).startsWith("You complete one assigned detail batch"),
      )).toHaveLength(4);
      expect(observer.onStageCompleted).toHaveBeenCalledTimes(1);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("aggregates skeleton and detail retries as one truthful world-cast stage", async () => {
    let detailAttemptsA = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      if (options.prompt.startsWith("You design the Campaign World frame.")) {
        return {
          object: framePacket(),
          trace: traceWithUsage("native_schema", "native_schema", 10, 5),
        };
      }
      if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        return {
          object: skeletonTransportPacket(),
          trace: traceWithUsage("native_schema", "native_schema", 20, 10),
        };
      }
      if (options.prompt.startsWith("You complete one assigned detail batch")) {
        if (options.prompt.includes('"actorIndex":0') && detailAttemptsA++ === 0) {
          throw new Error("detail transport failure");
        }
        return {
          object: detailBatchPacketForPrompt(options.prompt),
          trace: options.prompt.includes('"actorIndex":0')
            ? traceWithUsage("native_schema", "native_schema", 40, 20)
            : traceWithUsage("native_schema", "native_schema", 50, 25),
        };
      }
      if (options.prompt.startsWith("You design Campaign World relations and starting pressures")) {
        return {
          object: connectionsTransportPacket(),
          trace: traceWithUsage("native_schema", "native_schema", 30, 15),
        };
      }
      throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(generateMock).toHaveBeenCalledTimes(8);
    expect(candidate.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
      stage: "world_cast",
      totalAttempts: 6,
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
    expect(candidate.stageEvidence.find((entry) => entry.stage === "world_connections")).toMatchObject({
      stage: "world_connections",
      totalAttempts: 1,
      retryUsed: false,
      inputTokens: 30,
      outputTokens: 15,
      totalTokens: 45,
    });
  });

  it("composes keyed detail by actor index and preserves duplicate display names as distinct locations", () => {
    const frame = framePacket();
    const duplicateNameFrame: WorldFramePacket = {
      ...frame,
      locations: frame.locations.map((location) =>
        location.locationRef === "location:north-market"
          ? { ...location, name: "North Pier" }
          : location,
      ),
    };
    const detail = detailPacket();
    detail.actors = [...detail.actors].reverse().map((actor) => ({
      ...actor,
      traits: [`trait-${actor.actorIndex}`],
      motivation: `detail motivation ${actor.actorIndex}`,
      horizon: actor.actorIndex % 2 === 0 ? "immediate" : "ongoing",
      priority: (actor.actorIndex % 5) + 1,
      tags: [`actor-index-${actor.actorIndex}`],
    }));
    const cast = composeWorldCastPacketFromTransport(
      duplicateNameFrame,
      skeletonPacket(),
      detail,
    );

    expect(cast.actors.map((actor) => actor.tags)).toEqual(
      cast.actors.map((_actor, index) => [`actor-index-${index}`]),
    );
    expect(cast.actors.map((actor) => actor.traits)).toEqual(
      cast.actors.map((_actor, index) => [`trait-${index}`]),
    );
    expect(cast.goals.filter((goal) => goal.objective === "Map the next route change.")
      .map((goal) => ({ motivation: goal.motivation, horizon: goal.horizon, priority: goal.priority })))
      .toEqual([{ motivation: "detail motivation 0", horizon: "immediate", priority: 1 }]);
    expect(cast.actors[3]!.summary).toBe(skeletonPacket().actors[3]!.summary);
    expect(cast.placements.find((placement) =>
      placement.actorRef === "actor:slot-4" && placement.placementKind === "present"
    )?.locationRef).toBe("location:north-market");
  });

  it("partitions every supported cast size into deterministic balanced mixed detail batches", () => {
    for (let actorCount = 6; actorCount <= 16; actorCount += 1) {
      const groups = splitWorldCastDetailActorIndices(actorCount);
      expect(groups).toHaveLength(Math.ceil(actorCount / 2));
      expect(groups.every((group) => group.length >= 1 && group.length <= 2)).toBe(true);
      expect(Math.max(...groups.map((group) => group.length)) - Math.min(...groups.map((group) => group.length)))
        .toBeLessThanOrEqual(1);
      expect(groups).toEqual(splitWorldCastDetailActorIndices(actorCount));
      expect(groups.flat().sort((left, right) => left - right)).toEqual(
        Array.from({ length: actorCount }, (_, index) => index),
      );
    }
    expect(splitWorldCastDetailActorIndices(8)).toEqual([[0, 2], [1, 3], [4, 6], [5, 7]]);
  });

  it("stops a late provider result after abort without decoding or advancing stages", async () => {
    const abortController = new AbortController();
    let resolveFrame!: (result: {
      object: WorldFramePacket;
      trace: SafeGenerateTrace;
    }) => void;
    const frameResult = new Promise<{
      object: WorldFramePacket;
      trace: SafeGenerateTrace;
    }>((resolve) => {
      resolveFrame = resolve;
    });
    let childSignal!: AbortSignal;
    const generateMock = vi.fn(async (options: { abortSignal?: AbortSignal }) => {
      childSignal = options.abortSignal!;
      expect(childSignal).toBeInstanceOf(AbortSignal);
      expect(childSignal).not.toBe(abortController.signal);
      return frameResult;
    });
    const observer = {
      onStageStarted: vi.fn(),
      onStageCompleted: vi.fn(),
    };
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
    });

    const pending = builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
      abortSignal: abortController.signal,
      observer,
    });
    await Promise.resolve();
    expect(generateMock).toHaveBeenCalledTimes(1);
    const abortCallOptions = generateMock.mock.calls[0]![0] as TestGenerateOptions;
    expect(abortCallOptions).toMatchObject({
      abortSignal: expect.any(AbortSignal),
    });
    const abortTimeout = abortCallOptions.timeout as { totalMs: number };
    expect(abortTimeout.totalMs).toBeGreaterThan(0);
    expect(abortTimeout.totalMs).toBeLessThanOrEqual(70_000);
    abortController.abort();
    expect(childSignal.aborted).toBe(true);
    resolveFrame({ object: framePacket(), trace: trace() });

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(observer.onStageStarted.mock.calls.map((call) => call[0])).toEqual([
      "world_frame",
    ]);
    expect(observer.onStageCompleted).not.toHaveBeenCalled();
    expect(generateMock).toHaveBeenCalledTimes(1);
  });

  it("uses a provider-safe structural transport for Z.AI tool mode and decodes it before acceptance", async () => {
    const generateMock = successfulToolGenerateMock();
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: toolStructuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(generateMock).toHaveBeenCalledTimes(7);
    expect(generateMock.mock.calls[0]![0].schema).toBe(worldFrameToolPacketSchema);
    expect(generateMock.mock.calls[0]![0].schema).not.toBe(worldFramePacketSchema);
    const schemaJson = JSON.stringify(z.toJSONSchema(worldFrameToolPacketSchema));
    for (const forbidden of ["anyOf", "oneOf", "prefixItems", "nullable", "location:", "locationKey"]) {
      expect(schemaJson).not.toContain(forbidden);
    }
    expect(schemaJson).toContain("startingMacroIndex");
    expect(schemaJson).toContain("macroLocations");
    expect(schemaJson).toContain("persistentLocations");
    expect(schemaJson).toContain("parentMacroIndex");
    expect(schemaJson).toContain("fromPersistentIndex");
    expect(schemaJson).toContain("toPersistentIndex");
    for (const forbidden of [
      "keyActorOne",
      "keyActorTwo",
      "startingSupport",
      "supportActor",
      "remoteBackground",
      "backgroundActor",
      "otherActorOne",
      "otherActorTwo",
      "keyActors",
      "supportActors",
      "backgroundActors",
      "otherActors",
    ]) {
      expect(schemaJson).not.toContain(forbidden);
    }
    for (const forbiddenField of [
      "kind",
      "isStarting",
      "parentLocationRef",
      "fromLocationRef",
      "toLocationRef",
    ]) {
      expect(schemaJson).not.toContain(forbiddenField);
    }
    const framePrompt = String(generateMock.mock.calls[0]![0].prompt);
    expect(framePrompt).toContain(
      "Code assigns stable location references from array order, so never return locationKey or any other free-form reference.",
    );
    expect(framePrompt).toContain(
      "Return exactly three macroLocations, then exactly six persistentLocations.",
    );
    expect(framePrompt).toContain(
      "startingMacroIndex selects one macroLocations row.",
    );
    expect(framePrompt).toContain(
      "Each persistentLocations row uses parentMacroIndex to index macroLocations.",
    );
    expect(framePrompt).toContain(
      "Each route uses required fromPersistentIndex and toPersistentIndex values that index persistentLocations; the two indices must differ.",
    );
    expect(framePrompt).toContain(
      "Do not return kind, isStarting, parentLocationRef, fromLocationRef, or toLocationRef in tool mode.",
    );
    expect(framePrompt).not.toContain("WORLD_CAST_SKELETON_IN_SAME_PACKET");
    const skeletonPrompt = String(generateMock.mock.calls[1]![0].prompt);
    expect(skeletonPrompt).toContain(
      "You design the compact starting Campaign World cast skeleton.",
    );
    expect(skeletonPrompt).toContain("keyActorOne");
    expect(skeletonPrompt).not.toContain("WORLD_FRAME_AND_CAST_RECOVERY:");
    expect(generateMock.mock.calls[1]![0].schema).not.toBe(worldFrameToolPacketSchema);
    expect(candidate.stageEvidence[0]).toMatchObject({
      primaryStrategy: "tool_mode",
      actualStrategy: "tool_mode",
      totalAttempts: 1,
      retryUsed: false,
    });
    expect(candidate.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
      totalAttempts: 5,
      retryUsed: false,
    });
    expect(candidate.draft.locations.map((location) => location.name)).toEqual(
      framePacket().locations.map((location) => location.name),
    );
    expect(candidate.draft.routes.map((route) => route.fromLocationId)).toHaveLength(6);
  });

  it("requires the combined provider skeleton to use exactly the fixed actor slots", () => {
    const base = combinedToolPacket();
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

    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse(base).success).toBe(true);
    for (const slot of slots) {
      const missing = { ...base } as Record<string, unknown>;
      delete missing[slot];
      expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse(missing).success).toBe(false);
    }
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      unexpectedActor: base.otherActorOne,
    }).success).toBe(false);
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      keyActorOne: { ...base.keyActorOne, role: "support" },
    }).success).toBe(false);
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      startingSupport: { ...base.startingSupport, presentLocationIndex: 1 },
    }).success).toBe(true);
    expect(() => decodeWorldFrameAndCastSkeletonToolPacket({
      ...base,
      startingSupport: { ...base.startingSupport, presentLocationIndex: 1 },
    })).toThrow(/expected 0|present location must match/);
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      remoteBackground: { ...base.remoteBackground, presentLocationIndex: 0 },
    }).success).toBe(true);
    expect(() => decodeWorldFrameAndCastSkeletonToolPacket({
      ...base,
      remoteBackground: { ...base.remoteBackground, presentLocationIndex: 0 },
    })).toThrow(/expected 2|present location must match/);
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      otherActorTwo: { ...base.otherActorTwo, name: "  MARA   VENN " },
    }).success).toBe(false);
  });

  it("allows provider world summaries through 400 characters while the domain target remains compact", () => {
    const base = combinedToolPacket();
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      worldSummary: "w".repeat(301),
    }).success).toBe(true);
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      worldSummary: "w".repeat(400),
    }).success).toBe(true);
    expect(worldFrameAndCastSkeletonToolPacketSchema.safeParse({
      ...base,
      worldSummary: "w".repeat(401),
    }).success).toBe(false);
  });

  it("decodes the fixed combined anchor map for every starting macro and rejects wrong anchor placements", () => {
    const anchorMap = [
      { startingMacroIndex: 0 as const, startingSupport: 0, remoteBackground: 2 },
      { startingMacroIndex: 1 as const, startingSupport: 2, remoteBackground: 0 },
      { startingMacroIndex: 2 as const, startingSupport: 4, remoteBackground: 0 },
    ];

    for (const expected of anchorMap) {
      const packet = combinedToolPacketForStartingMacro(expected.startingMacroIndex);
      const decoded = decodeWorldFrameAndCastSkeletonToolPacket(packet);

      expect(decoded.skeleton.actors[2]!.presentLocationIndex).toBe(expected.startingSupport);
      expect(decoded.skeleton.actors[4]!.presentLocationIndex).toBe(expected.remoteBackground);

      const wrongAnchorPacket = {
        ...JSON.parse(JSON.stringify(packet)),
        remoteBackground: {
          ...packet.remoteBackground,
          presentLocationIndex: expected.startingSupport,
        },
      };
      expect(() => decodeWorldFrameAndCastSkeletonToolPacket(wrongAnchorPacket)).toThrow();
    }
  });

  it("decodes exact location order and leaves all domain invariants to the unchanged schema", () => {
    const decoded = decodeWorldFrameToolPacket(toolFramePacket());
    expect(decoded.locations.map((location) => location.locationRef)).toEqual(
      [
        "location:macro-1",
        "location:macro-2",
        "location:macro-3",
        "location:scene-1",
        "location:scene-2",
        "location:scene-3",
        "location:scene-4",
        "location:scene-5",
        "location:scene-6",
      ],
    );
    expect(decoded.locations.map((location) => location.parentLocationRef)).toEqual(
      [
        null,
        null,
        null,
        "location:macro-1",
        "location:macro-1",
        "location:macro-2",
        "location:macro-2",
        "location:macro-3",
        "location:macro-3",
      ],
    );
    expect(decoded.routes).toEqual([
      { fromLocationRef: "location:scene-1", toLocationRef: "location:scene-2", travelCost: 2 },
      { fromLocationRef: "location:scene-2", toLocationRef: "location:scene-3", travelCost: 3 },
      { fromLocationRef: "location:scene-3", toLocationRef: "location:scene-4", travelCost: 4 },
      { fromLocationRef: "location:scene-4", toLocationRef: "location:scene-5", travelCost: 5 },
      { fromLocationRef: "location:scene-5", toLocationRef: "location:scene-6", travelCost: 6 },
      { fromLocationRef: "location:scene-6", toLocationRef: "location:scene-1", travelCost: 1 },
    ]);
  });

  it.each([
    ["missing name", (packet: WorldFrameToolPacket) => {
      const location = packet.persistentLocations[0]!;
      delete (location as Partial<typeof location>).name;
    }],
    ["empty name", (packet: WorldFrameToolPacket) => { packet.persistentLocations[0]!.name = ""; }],
    ["invalid description", (packet: WorldFrameToolPacket) => { packet.persistentLocations[0]!.description = ""; }],
    ["duplicate name", (packet: WorldFrameToolPacket) => { packet.persistentLocations[1]!.name = packet.persistentLocations[0]!.name; }],
    ["out-of-range parent index", (packet: WorldFrameToolPacket) => { packet.persistentLocations[0]!.parentMacroIndex = 99; }],
    ["starting macro index", (packet: WorldFrameToolPacket) => { packet.startingMacroIndex = -1; }],
    ["self route", (packet: WorldFrameToolPacket) => { packet.routes[0]!.toPersistentIndex = packet.routes[0]!.fromPersistentIndex; }],
    ["out-of-range route index", (packet: WorldFrameToolPacket) => { packet.routes[0]!.toPersistentIndex = 99; }],
    ["duplicate route", (packet: WorldFrameToolPacket) => { packet.routes[1] = { ...packet.routes[0]! }; }],
    ["invalid travel cost", (packet: WorldFrameToolPacket) => { packet.routes[0]!.travelCost = 0; }],
    ["forbidden kind", (packet: WorldFrameToolPacket) => {
      (packet.macroLocations[0] as typeof packet.macroLocations[number] & { kind?: string }).kind = "macro";
    }],
    ["extra top-level key", (packet: WorldFrameToolPacket) => { (packet as WorldFrameToolPacket & { extra?: string }).extra = "nope"; }],
    ["extra location key", (packet: WorldFrameToolPacket) => { (packet.macroLocations[0] as typeof packet.macroLocations[number] & { extra?: string }).extra = "nope"; }],
  ] as const)("rejects %s without manufacturing or dropping topology", (_label, mutate) => {
    const packet = JSON.parse(JSON.stringify(toolFramePacket())) as WorldFrameToolPacket;
    mutate(packet);
    expect(() => decodeWorldFrameToolPacket(packet)).toThrow();
  });

  it.each([
    ["location_name", (packet: WorldFrameToolPacket) => {
      packet.persistentLocations[1]!.name = packet.persistentLocations[0]!.name;
    }],
    ["location_count", (packet: WorldFrameToolPacket) => {
      packet.persistentLocations.pop();
    }],
    ["starting_macro", (packet: WorldFrameToolPacket) => {
      packet.startingMacroIndex = 99;
    }],
    ["parent_index", (packet: WorldFrameToolPacket) => {
      packet.persistentLocations[0]!.parentMacroIndex = 99;
    }],
    ["macro_children", (packet: WorldFrameToolPacket) => {
      packet.persistentLocations.forEach((location) => { location.parentMacroIndex = 0; });
    }],
    ["route_index", (packet: WorldFrameToolPacket) => {
      packet.routes[0]!.toPersistentIndex = 99;
    }],
    ["route_self", (packet: WorldFrameToolPacket) => {
      packet.routes[0]!.toPersistentIndex = packet.routes[0]!.fromPersistentIndex;
    }],
    ["route_duplicate", (packet: WorldFrameToolPacket) => {
      packet.routes[1] = { ...packet.routes[0]! };
    }],
    ["route_connectivity", (packet: WorldFrameToolPacket) => {
      packet.routes[5]!.toPersistentIndex = 4;
    }],
    ["route_cost", (packet: WorldFrameToolPacket) => {
      packet.routes[0]!.travelCost = 0;
    }],
    ["text_or_tag_shape", (packet: WorldFrameToolPacket) => {
      packet.macroLocations[0]!.description = "";
    }],
  ] as const)("feeds only sanitized %s recovery coordinates to the next tool attempt", async (expectedCheck, mutate) => {
    const invalid = mutableToolFramePacket();
    mutate(invalid);
    let frameAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      if (options.prompt.startsWith("You design the Campaign World frame.")) {
        return frameAttempts++ === 0
          ? {
            object: invalid,
            trace: traceWithUsage("tool_mode", "tool_mode", 11, 7),
          }
          : {
            object: toolFramePacket(),
            trace: traceWithUsage("tool_mode", "tool_mode", 13, 9),
          };
      }
      if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        return {
          object: combinedSkeletonTransportPacket(),
          trace: trace("tool_mode", "tool_mode"),
        };
      }
      if (options.prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: toolDetailBatchPacketForPrompt(options.prompt),
          trace: trace("tool_mode", "tool_mode"),
        };
      }
      if (options.prompt.startsWith("You design Campaign World relations and starting pressures")) {
        return { object: toolConnectionsTransportPacket(), trace: trace("tool_mode", "tool_mode") };
      }
      throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: toolStructuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(generateMock).toHaveBeenCalledTimes(8);
    expect(candidate.stageEvidence[0]).toMatchObject({
      primaryStrategy: "tool_mode",
      actualStrategy: "tool_mode",
      totalAttempts: 2,
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
      inputTokens: 24,
      outputTokens: 16,
      totalTokens: 40,
    });
    const firstOptions = generateMock.mock.calls[0]![0];
    const secondOptions = generateMock.mock.calls[1]![0];
    expect(secondOptions.model).toBe(firstOptions.model);
    expect(secondOptions.schema).toBe(firstOptions.schema);
    expect(secondOptions.temperature).toBe(firstOptions.temperature);
    expect(secondOptions.maxOutputTokens).toBe(firstOptions.maxOutputTokens);
    expect(secondOptions.retries).toBe(firstOptions.retries);
    expect(secondOptions.prompt).not.toBe(firstOptions.prompt);
    const recoveryIssues = recoveryIssuesFromPrompt(String(secondOptions.prompt));
    expect(recoveryIssues.length).toBeGreaterThan(0);
    expect(recoveryIssues.some((issue) => issue.check === expectedCheck)).toBe(true);
    expect(recoveryIssues.every((issue) =>
      Object.keys(issue).sort().join(",") === "check,code,issueIndex,path"
    )).toBe(true);
    const recoveryBlock = String(secondOptions.prompt).slice(
      String(secondOptions.prompt).indexOf("WORLD_FRAME_RECOVERY:"),
    );
    expect(recoveryBlock).not.toContain("MODEL_PRIVATE_LOCATION_NAME");
    expect(recoveryBlock).not.toContain("MODEL_PRIVATE_DESCRIPTION");
    expect(recoveryBlock).not.toContain("model-private-key");
    expect(recoveryBlock).not.toContain("A route requires different origin and destination locations.");
    expect(recoveryBlock).not.toContain(JSON.stringify(invalid));
    expect(recoveryBlock).not.toContain("WORLD_CAST_SKELETON_IN_SAME_PACKET");
  });

  it("uses an unknown safe coordinate for an opaque rejection without echoing the provider message", async () => {
    const privateMessage = "RAW_PROVIDER_MESSAGE MODEL_PRIVATE_LOCATION_NAME";
    let frameAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      if (options.prompt.startsWith("You design the Campaign World frame.")) {
        if (frameAttempts++ === 0) throw new Error(privateMessage);
        return {
          object: toolFramePacket(),
          trace: traceWithUsage("tool_mode", "tool_mode", 13, 9),
        };
      }
      if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        return {
          object: combinedSkeletonTransportPacket(),
          trace: trace("tool_mode", "tool_mode"),
        };
      }
      if (options.prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: toolDetailBatchPacketForPrompt(options.prompt),
          trace: trace("tool_mode", "tool_mode"),
        };
      }
      if (options.prompt.startsWith("You design Campaign World relations and starting pressures")) {
        return { object: toolConnectionsTransportPacket(), trace: trace("tool_mode", "tool_mode") };
      }
      throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: toolStructuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(generateMock).toHaveBeenCalledTimes(8);
    const secondPrompt = String(generateMock.mock.calls[1]![0].prompt);
    expect(secondPrompt).toContain("WORLD_FRAME_RECOVERY:");
    const recoveryIssues = recoveryIssuesFromPrompt(secondPrompt);
    expect(recoveryIssues).toEqual([
      { issueIndex: 0, code: "unknown", path: [], check: "unknown_contract_issue" },
    ]);
    expect(secondPrompt).not.toContain(privateMessage);
    expect(secondPrompt).not.toContain("MODEL_PRIVATE_LOCATION_NAME");
    expect(candidate.stageEvidence[0]).toMatchObject({
      totalAttempts: 2,
      retryUsed: true,
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
    });
  });

  it("keeps every uniform skeleton field required during semantic recovery", async () => {
    const invalidSkeleton = JSON.parse(JSON.stringify(skeletonTransportPacket())) as Record<string, unknown>;
    delete (invalidSkeleton.startingSupport as Record<string, unknown>).summary;
    let skeletonAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      const prompt = String(options.prompt);
      if (prompt.startsWith("You design the Campaign World frame.")) {
        return { object: framePacket(), trace: trace() };
      }
      if (prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        if (skeletonAttempts++ === 0) {
          return { object: invalidSkeleton, trace: trace() };
        }
        expect(prompt).toContain("WORLD_CAST_RECOVERY:");
        expect(prompt).toContain(
          "Every actor object contains exactly name, role, summary, presentLocationIndex, homeLocationIndex, and objective.",
        );
        expect(prompt).toContain("keyActorOne and keyActorTwo use role key; startingSupport and supportActor use role support; remoteBackground and backgroundActor use role background; otherActorOne and otherActorTwo use role key, support, or background.");
        expect(prompt).toContain(
          "Copy startingSupport.presentLocationIndex exactly from STARTING_SUPPORT_SLOT.index and remoteBackground.presentLocationIndex exactly from REMOTE_BACKGROUND_SLOT.index.",
        );
        expect(prompt).not.toContain("Fixed groups omit role");
        expect(prompt).not.toContain("omit presentLocationIndex");
        return { object: skeletonTransportPacket(), trace: trace() };
      }
      if (prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: detailBatchPacketForPrompt(prompt),
          trace: trace(),
        };
      }
      if (prompt.startsWith("You design Campaign World relations and starting pressures")) {
        return { object: connectionsTransportPacket(), trace: trace() };
      }
      throw new Error(`Unexpected Campaign World prompt: ${prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(skeletonAttempts).toBe(2);
    expect(generateMock).toHaveBeenCalledTimes(8);
    expect(candidate.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
      totalAttempts: 6,
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
    });
  });

  it("recovers fixed-slot world-cast skeleton diagnostics with safe actor coordinates", async () => {
    const invalid = JSON.parse(JSON.stringify(skeletonTransportPacket())) as WorldCastSkeletonTransportPacket & {
      remoteBackground: WorldCastSkeletonTransportPacket["remoteBackground"] & { unexpectedField?: string };
      supportActor: WorldCastSkeletonTransportPacket["supportActor"] & { unexpectedField?: string };
    };
    invalid.remoteBackground.unexpectedField = "PRIVATE_REMOTE_BACKGROUND_FIELD";
    invalid.supportActor.unexpectedField = "PRIVATE_SUPPORT_ACTOR_FIELD";
    const schema = createWorldCastSkeletonTransportPacketSchema(framePacket());
    const providerError = await productionCastSkeletonSafeGenerateError(schema, invalid);
    const providerDiagnostics = getSafeGenerateObjectSchemaDiagnostics(providerError);
    expect(providerDiagnostics?.schemaIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unrecognized_keys",
        path: ["remoteBackground"],
      }),
      expect.objectContaining({
        code: "unrecognized_keys",
        path: ["supportActor"],
      }),
    ]));

    let skeletonAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      const prompt = String(options.prompt);
      if (prompt.startsWith("You design the Campaign World frame.")) {
        return { object: framePacket(), trace: trace() };
      }
      if (prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        if (skeletonAttempts++ === 0) throw providerError;
        return { object: skeletonTransportPacket(), trace: trace() };
      }
      if (prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: detailBatchPacketForPrompt(prompt),
          trace: trace(),
        };
      }
      if (prompt.startsWith("You design Campaign World relations and starting pressures")) {
        return { object: connectionsTransportPacket(), trace: trace() };
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(skeletonAttempts).toBe(2);
    expect(candidate.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
      stage: "world_cast",
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
    });
    const skeletonCalls = generateMock.mock.calls.filter(([options]) =>
      String(options.prompt).startsWith("You design the compact starting Campaign World cast skeleton."),
    );
    expect(skeletonCalls).toHaveLength(2);
    const recoveryPrompt = String(skeletonCalls[1]![0].prompt);
    expect(recoveryPrompt).toContain("WORLD_CAST_RECOVERY:");
    expect(recoveryIssuesFromPrompt(recoveryPrompt)).toEqual(expect.arrayContaining([
      {
        issueIndex: expect.any(Number),
        code: "unrecognized_keys",
        path: ["remoteBackground"],
        check: "actor_object_keys",
      },
      {
        issueIndex: expect.any(Number),
        code: "unrecognized_keys",
        path: ["supportActor"],
        check: "actor_object_keys",
      },
    ]));
    expect(recoveryPrompt).not.toContain("PRIVATE_REMOTE_BACKGROUND_FIELD");
    expect(recoveryPrompt).not.toContain("PRIVATE_SUPPORT_ACTOR_FIELD");
    expect(recoveryPrompt).not.toContain(JSON.stringify(invalid));
  });

  it("sanitizes unknown world-cast skeleton coordinates without echoing provider data", async () => {
    const privatePathSegment = "MODEL_PRIVATE_REMOTE_BACKGROUND";
    const rejected = new z.ZodError(
      Array.from({ length: 20 }, (_, index) => ({
        code: "custom",
        path: ["remoteBackground", privatePathSegment, ...Array.from({ length: 20 }, () => `private-${index}`)],
        message: "PRIVATE_PROVIDER_MESSAGE",
      })),
    );
    let skeletonAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      const prompt = String(options.prompt);
      if (prompt.startsWith("You design the Campaign World frame.")) {
        return { object: framePacket(), trace: trace() };
      }
      if (prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        if (skeletonAttempts++ === 0) throw rejected;
        return { object: skeletonTransportPacket(), trace: trace() };
      }
      if (prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: detailBatchPacketForPrompt(prompt),
          trace: trace(),
        };
      }
      if (prompt.startsWith("You design Campaign World relations and starting pressures")) {
        return { object: connectionsTransportPacket(), trace: trace() };
      }
      throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    const skeletonCalls = generateMock.mock.calls.filter(([options]) =>
      String(options.prompt).startsWith("You design the compact starting Campaign World cast skeleton."),
    );
    expect(skeletonCalls).toHaveLength(2);
    const recoveryIssues = recoveryIssuesFromPrompt(String(skeletonCalls[1]![0].prompt));
    expect(recoveryIssues).toHaveLength(8);
    expect(recoveryIssues.every((issue) => issue.check === "actor_field")).toBe(true);
    expect(recoveryIssues.every((issue) =>
      Array.isArray(issue.path) &&
      (issue.path as unknown[]).length <= 12 &&
      (issue.path as unknown[]).includes("[dynamic]"),
    )).toBe(true);
    expect(String(skeletonCalls[1]![0].prompt)).not.toContain(privatePathSegment);
    expect(String(skeletonCalls[1]![0].prompt)).not.toContain("PRIVATE_PROVIDER_MESSAGE");
  });

  it("recovers oscillating world-connections diagnostics with a complete checklist on each retry", async () => {
    const invalidEnum = JSON.parse(JSON.stringify(connectionsTransportPacket())) as WorldConnectionsTransportPacket;
    for (const relation of invalidEnum.relations) {
      Object.assign(relation, { relationType: "not-a-relation" });
    }
    const invalidSelf = JSON.parse(JSON.stringify(connectionsTransportPacket())) as WorldConnectionsTransportPacket;
    invalidSelf.relations[0]!.targetActorIndex = 0;
    const schema = createWorldConnectionsTransportPacketSchema(framePacket(), skeletonPacket());
    const rejectedEnum = schema.safeParse(invalidEnum);
    expect(rejectedEnum.success).toBe(false);
    if (rejectedEnum.success) throw new Error("enum fixture should fail the strict connections schema");
    const rejectedSelf = schema.safeParse(invalidSelf);
    expect(rejectedSelf.success).toBe(false);
    if (rejectedSelf.success) throw new Error("self fixture should fail the strict connections schema");

    let connectionAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      if (options.prompt.startsWith("You design the Campaign World frame.")) {
        return { object: framePacket(), trace: trace() };
      }
      if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        return { object: skeletonTransportPacket(), trace: trace() };
      }
      if (options.prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: detailBatchPacketForPrompt(options.prompt),
          trace: trace(),
        };
      }
      if (options.prompt.startsWith("You design Campaign World relations and starting pressures")) {
        switch (connectionAttempts++) {
          case 0:
            throw rejectedEnum.error;
          case 1:
            throw rejectedSelf.error;
          default:
            return { object: connectionsTransportPacket(), trace: trace() };
        }
      }
      throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(candidate.stageEvidence[2]).toMatchObject({
      stage: "world_connections",
      totalAttempts: 3,
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
    });
    expect(generateMock).toHaveBeenCalledTimes(9);
    const connectionCalls = generateMock.mock.calls.filter(([options]) =>
      String(options.prompt).startsWith("You design Campaign World relations and starting pressures"),
    );
    expect(connectionCalls).toHaveLength(3);
    const firstOptions = connectionCalls[0]![0];
    for (const [options] of connectionCalls.slice(1)) {
      expect(options.model).toBe(firstOptions.model);
      expect(options.schema).toBe(firstOptions.schema);
      expect(options.temperature).toBe(firstOptions.temperature);
      expect(options.maxOutputTokens).toBe(firstOptions.maxOutputTokens);
      expect(options.mode).toBe(firstOptions.mode);
      expect(options.strictSchema).toBe(firstOptions.strictSchema);
      expect(options.allowRepair).toBe(false);
      expect(options.allowTextFallback).toBe(false);
      expect(options.retries).toBe(firstOptions.retries);
      expect(options.timeout).toEqual(firstOptions.timeout);
    }

    const recoveryChecklist = [
      "exactly one row for every accepted skeleton actor, ordered by source actor slot; relations array position i is source actor i",
      "Each row contains only targetActorIndex, relationType, and intensity",
      "relationType must be exactly one of alliance, rivalry, authority, dependency, kinship, association, hostility",
      "targetActorIndex must be a direct integer from ALLOWED_ACTOR_INDICES and must differ from the row's array index",
      "intensity is an integer from 1 through 5",
      "return exactly 3 or 4 rows",
      "each row contains only name, description, trajectory, urgency, actorIndices, and locationIndices",
      "name is at most 64 characters",
      "description is one sentence at most 160 characters",
      "trajectory is exactly one of escalating, holding, breaking, or shifting",
      "urgency is an integer from 1 through 5",
      "actorIndices must be non-empty in-range integers from the accepted skeleton with no duplicates",
      "locationIndices must be non-empty in-range integers from persistent location slots with no duplicates",
      "use at least two different combined actor/location anchor sets",
      "At least one pressure must contain a persistent location index from STARTING_MACRO_SCENE_INDICES and a support actor whose presentLocationIndex is included in that same pressure's locationIndices",
      "Use no actorRef, locationRef, or free-form references",
      "Do not return summary, rationale, actor names, or other relation prose",
    ];
    const secondPrompt = String(connectionCalls[1]![0].prompt);
    const thirdPrompt = String(connectionCalls[2]![0].prompt);
    for (const recoveryPrompt of [secondPrompt, thirdPrompt]) {
      expect(recoveryPrompt).toContain("WORLD_CONNECTIONS_RECOVERY:");
      for (const fragment of recoveryChecklist) expect(recoveryPrompt).toContain(fragment);
      const recoveryBlock = recoveryPrompt.slice(recoveryPrompt.indexOf("WORLD_CONNECTIONS_RECOVERY:"));
      expect(recoveryBlock).not.toContain("RAW_PROVIDER_MESSAGE");
      expect(recoveryBlock).not.toContain("private model output");
      expect(recoveryBlock).not.toContain("Invalid input");
      expect(recoveryBlock).not.toContain(JSON.stringify(invalidEnum));
      expect(recoveryBlock).not.toContain(JSON.stringify(invalidSelf));
      expect(recoveryIssuesFromPrompt(recoveryPrompt).every((issue) =>
        Object.keys(issue).sort().join(",") === "check,code,issueIndex,path"
      )).toBe(true);
    }
    const secondIssues = recoveryIssuesFromPrompt(secondPrompt);
    expect(secondIssues).toHaveLength(8);
    expect(secondIssues.every((issue) => issue.check === "relation_type")).toBe(true);
    expect(secondIssues.every((issue) =>
      JSON.stringify(issue.path).startsWith('["relations",') &&
      JSON.stringify(issue.path).endsWith(',"relationType"]')
    )).toBe(true);
    expect(recoveryIssuesFromPrompt(thirdPrompt)).toEqual([
      {
        issueIndex: 0,
        code: "custom",
        path: ["relations", 0],
        check: "relation_self",
      },
    ]);
  });

  it("recovers an extra world-connection transport key inside the stage retry", async () => {
    const valid = connectionsTransportPacket();
    const invalid: WorldConnectionsTransportPacket = {
      ...valid,
      relations: valid.relations.map((relation, index) => index === 1
        ? { ...relation, relationSlotIndex: 0 }
        : relation),
    };
    const schema = createWorldConnectionsTransportPacketSchema(framePacket(), skeletonPacket());
    const providerError = await productionConnectionsSafeGenerateError(schema, invalid);
    const providerDiagnostics = getSafeGenerateObjectSchemaDiagnostics(providerError);
    expect(providerDiagnostics).toMatchObject({
      schemaParseOutcome: "invalid",
      schemaIssueCount: 1,
      schemaIssues: [
        expect.objectContaining({
          code: "unrecognized_keys",
          path: ["relations", 1],
        }),
      ],
    });

    let connectionAttempts = 0;
    const generateMock = vi.fn(async (options: TestGenerateOptions) => {
      if (options.prompt.startsWith("You design the Campaign World frame.")) {
        return { object: framePacket(), trace: trace() };
      }
      if (options.prompt.startsWith("You design the compact starting Campaign World cast skeleton.")) {
        return { object: skeletonTransportPacket(), trace: trace() };
      }
      if (options.prompt.startsWith("You complete one assigned detail batch")) {
        return {
          object: detailBatchPacketForPrompt(options.prompt),
          trace: trace(),
        };
      }
      if (options.prompt.startsWith("You design Campaign World relations and starting pressures")) {
        if (connectionAttempts++ === 0) throw providerError;
        return { object: valid, trace: trace() };
      }
      throw new Error(`Unexpected Campaign World prompt: ${options.prompt.slice(0, 80)}`);
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(connectionAttempts).toBe(2);
    expect(candidate.stageEvidence[2]).toMatchObject({
      stage: "world_connections",
      totalAttempts: 2,
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
    });
    const connectionCalls = generateMock.mock.calls.filter(([call]) =>
      String(call.prompt).startsWith("You design Campaign World relations and starting pressures"),
    );
    expect(connectionCalls).toHaveLength(2);
    const secondPrompt = String(connectionCalls[1]![0].prompt);
    expect(secondPrompt).toContain("WORLD_CONNECTIONS_RECOVERY:");
    expect(recoveryIssuesFromPrompt(secondPrompt)).toEqual([
      {
        issueIndex: 0,
        code: "unrecognized_keys",
        path: ["relations", 1],
        check: "unknown_contract_issue",
      },
    ]);
    expect(secondPrompt).not.toContain(JSON.stringify(invalid));
  });

  it("recovers production-shaped world-cast diagnostics with safe actor object coordinates", async () => {
    const invalid = JSON.parse(JSON.stringify(detailBatchPacket([0, 2]))) as WorldCastDetailBatchPacket & {
      actors: Array<WorldCastDetailBatchPacket["actors"][number] & { unexpectedField?: string }>;
    };
    invalid.actors[1]!.unexpectedField = "PRIVATE_ACTOR_FIELD";
    invalid.actors[0]!.traits = Array.from({ length: 21 }, (_, index) => `trait-${index}`);
    invalid.actors[1]!.tags = [" tag with surrounding whitespace "];
    const schema = createWorldCastDetailBatchPacketSchema(2);
    const providerError = await productionCastSafeGenerateError(schema, invalid);
    const providerDiagnostics = getSafeGenerateObjectSchemaDiagnostics(providerError);
    expect(providerDiagnostics?.schemaIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "unrecognized_keys",
        path: ["actors", 1],
      }),
    ]));

    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({ object: framePacket(), trace: trace() })
      .mockResolvedValueOnce({ object: skeletonTransportPacket(), trace: trace() })
      .mockImplementation(async (options: TestGenerateOptions) => {
        const prompt = String(options.prompt);
        if (prompt.includes("You complete one assigned detail batch")) {
          if (prompt.includes('"actorIndex":0') && !prompt.includes("WORLD_CAST_RECOVERY:")) {
            return Promise.reject(providerError);
          }
          if (prompt.includes('"actorIndex":0') && prompt.includes("WORLD_CAST_RECOVERY:")) {
            return { object: detailBatchPacketForPrompt(prompt), trace: trace() };
          }
          return { object: detailBatchPacketForPrompt(prompt), trace: trace() };
        }
        if (prompt.startsWith("You design Campaign World relations and starting pressures")) {
          return { object: connectionsTransportPacket(), trace: trace() };
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(generateMock).toHaveBeenCalledTimes(8);
    expect(candidate.stageEvidence.find((entry) => entry.stage === "world_cast")).toMatchObject({
      stage: "world_cast",
      totalAttempts: 6,
      retryUsed: true,
      repairUsed: false,
      textFallbackUsed: false,
    });
    const castDetailCalls = generateMock.mock.calls.filter(([options]) =>
      String(options.prompt).includes("You complete one assigned detail batch"),
    );
    expect(castDetailCalls).toHaveLength(5);
    const firstOptions = castDetailCalls[0]![0];
    const retryOptions = castDetailCalls.find(([options]) =>
      String(options.prompt).includes("WORLD_CAST_RECOVERY:"),
    )![0];
    expect(retryOptions.model).toBe(firstOptions.model);
    expect(retryOptions.schema).toBe(firstOptions.schema);
    expect(retryOptions.temperature).toBe(firstOptions.temperature);
    expect(retryOptions.maxOutputTokens).toBe(firstOptions.maxOutputTokens);
    expect(retryOptions.mode).toBe(firstOptions.mode);
    expect(retryOptions.strictSchema).toBe(firstOptions.strictSchema);
    expect(retryOptions.allowRepair).toBe(false);
    expect(retryOptions.allowTextFallback).toBe(false);
    expect(retryOptions.retries).toBe(firstOptions.retries);
    expect(retryOptions.timeout).toEqual(firstOptions.timeout);

    const firstPrompt = String(firstOptions.prompt);
    const secondPrompt = String(retryOptions.prompt);
    expect(secondPrompt).toContain("WORLD_CAST_RECOVERY:");
    expect(secondPrompt).toContain(sourceFixture(false).premise);
    expect(secondPrompt).toContain("ASSIGNED_ACTORS");
    expect(secondPrompt).not.toContain("WORLD_CAST_SKELETON\n");
    expect(secondPrompt).not.toContain("DETAIL_ACTOR_SLOTS\n");
    expect(secondPrompt).toContain("detailSlotIndex");
    for (const fragment of [
      "For each actor, return 2-4 short traits and 2-4 short tags",
      "each trait and tag must be <=48 characters",
      "motivation as one concise sentence <=160 characters",
      "Return additionalGoals: [] for every actor by default",
      "At most one actor in this batch may receive one additional goal",
      "objective and motivation are each one concise sentence <=140 characters",
      "Every additional goal contains exactly objective, motivation, horizon, and priority",
    ]) {
      expect(secondPrompt).toContain(fragment);
    }
    const recoveryIssues = recoveryIssuesFromPrompt(secondPrompt);
    expect(recoveryIssues).toEqual(expect.arrayContaining([
      {
        issueIndex: expect.any(Number),
        code: "unrecognized_keys",
        path: ["actors", 1],
        check: "actor_object_keys",
      },
      {
        issueIndex: expect.any(Number),
        code: "too_big",
        path: ["actors", 0, "traits"],
        check: "actor_field",
      },
      {
        issueIndex: expect.any(Number),
        code: "custom",
        path: ["actors", 1, "tags", 0],
        check: "actor_field",
      },
    ]));
    expect(recoveryIssues.every((issue) =>
      Object.keys(issue).sort().join(",") === "check,code,issueIndex,path"
    )).toBe(true);
    expect(secondPrompt).not.toContain("PRIVATE_ACTOR_FIELD");
    expect(secondPrompt).not.toContain(JSON.stringify(invalid));
    expect(secondPrompt).not.toBe(firstPrompt);
  });

  it("recovers production-shaped world-connections diagnostics with nested safe coordinates", async () => {
    const invalid = JSON.parse(JSON.stringify(connectionsTransportPacket())) as WorldConnectionsTransportPacket;
    (invalid.relations[0] as Record<string, unknown>).relationSlotIndex = 99;
    (invalid.relations[1] as Record<string, unknown>).relationType = "PRIVATE_RELATION_TYPE";
    invalid.pressures[0]!.actorIndices[2] = 99;
    const schema = createWorldConnectionsTransportPacketSchema(framePacket(), skeletonPacket());
    const providerError = await productionConnectionsSafeGenerateError(schema, invalid);
    const providerDiagnostics = getSafeGenerateObjectSchemaDiagnostics(providerError);
    expect(providerDiagnostics?.schemaIssues.map((issue) => issue.path)).toEqual([
      ["relations", 0],
      ["relations", 1, "relationType"],
      ["pressures", 0, "actorIndices", 2],
    ]);

    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({ object: framePacket(), trace: trace() })
      .mockResolvedValueOnce({ object: skeletonTransportPacket(), trace: trace() })
      .mockImplementation(async (options: TestGenerateOptions) => {
        const prompt = String(options.prompt);
        if (prompt.includes("You complete one assigned detail batch")) {
          return { object: detailBatchPacketForPrompt(prompt), trace: trace() };
        }
        if (prompt.startsWith("You design Campaign World relations and starting pressures") && !prompt.includes("WORLD_CONNECTIONS_RECOVERY:")) {
          return Promise.reject(providerError);
        }
        if (prompt.includes("WORLD_CONNECTIONS_RECOVERY:")) {
          return { object: connectionsTransportPacket(), trace: trace() };
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    const connectionCalls = generateMock.mock.calls.filter(([options]) =>
      String(options.prompt).startsWith("You design Campaign World relations and starting pressures"),
    );
    expect(connectionCalls).toHaveLength(2);
    const firstOptions = connectionCalls[0]![0];
    const secondOptions = connectionCalls[1]![0];
    expect(secondOptions.model).toBe(firstOptions.model);
    expect(secondOptions.schema).toBe(firstOptions.schema);
    expect(secondOptions.temperature).toBe(firstOptions.temperature);
    expect(secondOptions.maxOutputTokens).toBe(firstOptions.maxOutputTokens);
    expect(secondOptions.mode).toBe(firstOptions.mode);
    expect(secondOptions.strictSchema).toBe(firstOptions.strictSchema);
    expect(secondOptions.allowRepair).toBe(false);
    expect(secondOptions.allowTextFallback).toBe(false);
    expect(secondOptions.retries).toBe(firstOptions.retries);
    expect(secondOptions.timeout).toEqual(firstOptions.timeout);

    const secondPrompt = String(secondOptions.prompt);
    const recoveryIssues = recoveryIssuesFromPrompt(secondPrompt);
    expect(recoveryIssues).toEqual(expect.arrayContaining([
      {
        issueIndex: expect.any(Number),
        code: "unrecognized_keys",
        path: ["relations", 0],
        check: "unknown_contract_issue",
      },
      {
        issueIndex: expect.any(Number),
        code: "invalid_value",
        path: ["relations", 1, "relationType"],
        check: "relation_type",
      },
    ]));
    expect(secondPrompt).not.toContain("PRIVATE_SOURCE_REF");
    expect(secondPrompt).not.toContain("PRIVATE_RELATION_TYPE");
    expect(secondPrompt).not.toContain("PRIVATE_PRESSURE_REF");
    expect(secondPrompt).not.toContain("Return the world-connections packet.");
  });

  it("bounds and redacts unknown world-connections recovery coordinates", async () => {
    const privatePathSegment = "MODEL_PRIVATE_LOCATION_NAME";
    const rejected = new z.ZodError(
      Array.from({ length: 20 }, (_, index) => ({
        code: "custom",
        path: ["relations", privatePathSegment, ...Array.from({ length: 20 }, () => `private-${index}`)],
        message: "PRIVATE_PROVIDER_MESSAGE",
      })),
    );
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({ object: framePacket(), trace: trace() })
      .mockResolvedValueOnce({ object: skeletonTransportPacket(), trace: trace() })
      .mockImplementation(async (options: TestGenerateOptions) => {
        const prompt = String(options.prompt);
        if (prompt.includes("You complete one assigned detail batch")) {
          return { object: detailBatchPacketForPrompt(prompt), trace: trace() };
        }
        if (prompt.startsWith("You design Campaign World relations and starting pressures") && !prompt.includes("WORLD_CONNECTIONS_RECOVERY:")) {
          return Promise.reject(rejected);
        }
        if (prompt.includes("WORLD_CONNECTIONS_RECOVERY:")) {
          return { object: connectionsTransportPacket(), trace: trace() };
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    const connectionCalls = generateMock.mock.calls.filter(([options]) =>
      String(options.prompt).startsWith("You design Campaign World relations and starting pressures"),
    );
    expect(connectionCalls).toHaveLength(2);
    const secondPrompt = String(connectionCalls[1]![0].prompt);
    const recoveryIssues = recoveryIssuesFromPrompt(secondPrompt);
    expect(recoveryIssues).toHaveLength(8);
    expect(recoveryIssues.every((issue) => issue.check === "unknown_contract_issue")).toBe(true);
    expect(recoveryIssues.every((issue) => Array.isArray(issue.path) && (issue.path as unknown[]).length <= 12)).toBe(true);
    expect(recoveryIssues.every((issue) => (issue.path as unknown[]).includes("[dynamic]"))).toBe(true);
    expect(secondPrompt).not.toContain(privatePathSegment);
    expect(secondPrompt).not.toContain("PRIVATE_PROVIDER_MESSAGE");
  });

  it("keeps safe terminal diagnostics after three local failures and makes no fourth attempt", async () => {
    const invalid = mutableToolFramePacket();
    invalid.routes[0]!.toPersistentIndex = invalid.routes[0]!.fromPersistentIndex;
    const generateMock = vi
      .fn()
      .mockResolvedValue({
        object: invalid,
        trace: traceWithUsage("tool_mode", "tool_mode", 11, 7),
      });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
    });

    let captured: unknown;
    try {
      await builder.build({
        source: sourceFixture(false),
        model: toolStructuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CampaignWorldBuilderError);
    expect(captured).toMatchObject({
      code: "model_contract_failed",
      stage: "world_frame",
      stageEvidence: [{
        totalAttempts: 3,
        retryUsed: true,
        inputTokens: 33,
        outputTokens: 21,
        totalTokens: 54,
      }],
    });
    expect(generateMock).toHaveBeenCalledTimes(3);
    const cause = stageErrorCause(captured);
    expect(cause).toMatchObject({
      name: "WorldFrameLocalContractError",
      recoveryIssues: expect.arrayContaining([
        expect.objectContaining({
          code: "custom",
          path: ["routes", 0],
          check: "route_self",
        }),
      ]),
    });
    const safeCause = JSON.stringify(cause);
    expect(safeCause).not.toContain("MODEL_PRIVATE_LOCATION_NAME");
    expect(safeCause).not.toContain("MODEL_PRIVATE_DESCRIPTION");
    expect(safeCause).not.toContain("A route requires different origin and destination locations.");
  });

  it("fails before the first call when the model has no structured strategy", async () => {
    const generateMock = vi.fn();
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
    });

    await expect(builder.build({
      source: sourceFixture(false),
      model: {} as LanguageModel,
      temperature: 0.7,
      maxOutputTokens: 8_000,
    })).rejects.toMatchObject({
      code: "structured_output_unavailable",
      stage: "world_frame",
      stageEvidence: [],
    });
    expect(generateMock).not.toHaveBeenCalled();
  });

  it("stops after a failed stage and retains completed plus failed evidence", async () => {
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({ object: framePacket(), trace: trace() })
      .mockRejectedValue(new Error("cast provider failure"));
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
    });

    let captured: unknown;
    try {
      await builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toBeInstanceOf(CampaignWorldBuilderError);
    expect(captured).toMatchObject({
      code: "model_contract_failed",
      stage: "world_cast",
      stageEvidence: [
        { stage: "world_frame", errorCode: null },
        {
          stage: "world_cast",
          primaryStrategy: "native_schema",
          actualStrategy: "native_schema",
          totalAttempts: 3,
          repairUsed: false,
          retryUsed: true,
          textFallbackUsed: false,
          errorCode: "model_contract_failed",
        },
      ],
    });
    expect(generateMock).toHaveBeenCalledTimes(4);
  });

  it("records truthful retry evidence and aggregates known token usage", async () => {
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({
        object: framePacket(),
        trace: traceWithUsage("full_retry", "native_schema", 11, 7),
      })
      .mockResolvedValueOnce({
        object: framePacket(),
        trace: traceWithUsage("native_schema", "native_schema", 13, 9),
      })
      .mockResolvedValueOnce({ object: skeletonTransportPacket(), trace: trace() })
      .mockImplementation(async (options: TestGenerateOptions) => {
        const prompt = String(options.prompt);
        if (prompt.includes("You complete one assigned detail batch")) {
          return { object: detailBatchPacketForPrompt(prompt), trace: trace() };
        }
        if (prompt.startsWith("You design Campaign World relations and starting pressures")) {
          return { object: connectionsTransportPacket(), trace: trace() };
        }
        throw new Error(`Unexpected prompt: ${prompt.slice(0, 80)}`);
      });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
      idFactory: sequentialIdFactory(),
    });

    const candidate = await builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    });

    expect(generateMock).toHaveBeenCalledTimes(8);
    expect(candidate.stageEvidence[0]).toMatchObject({
      totalAttempts: 2,
      retryUsed: true,
      inputTokens: 24,
      outputTokens: 16,
      totalTokens: 40,
    });
    expect(generateMock.mock.calls[0]![0]).toMatchObject({ retries: 1, allowRepair: false, allowTextFallback: false });
    expect(generateMock.mock.calls[1]![0]).toMatchObject({ retries: 1, allowRepair: false, allowTextFallback: false });
  });

  it("stops after exactly three failed attempts without fallback or a fourth call", async () => {
    const generateMock = vi.fn().mockRejectedValue(new Error("frame provider failure"));
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
    });

    let captured: unknown;
    try {
      await builder.build({
        source: sourceFixture(false),
        model: structuredModel(),
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
    } catch (error) {
      captured = error;
    }

    expect(captured).toMatchObject({
      code: "model_contract_failed",
      stage: "world_frame",
      stageEvidence: [{ totalAttempts: 3, retryUsed: true, textFallbackUsed: false }],
    });
    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(generateMock.mock.calls.every((call) => call[0].retries === 1)).toBe(true);
  });

  it("records one failed attempt without treating the outer full_retry label as a retry", () => {
    const failedTrace = trace("full_retry", "tool_mode");
    const evidence = createCampaignWorldStageEvidence(
      "world_cast",
      failedTrace,
      "schema_validation_failed",
      true,
    );

    expect(evidence).toMatchObject({
      requestedMode: "auto",
      primaryStrategy: "tool_mode",
      actualStrategy: "tool_mode",
      totalAttempts: 1,
      repairUsed: false,
      retryUsed: false,
      textFallbackUsed: false,
      errorCode: "schema_validation_failed",
    });
  });

  it.each([
    ["repair", "repair", "native_schema"],
    ["text fallback", "text_fallback", "text_fallback"],
    ["retry wrapper", "full_retry", "native_schema"],
    ["strategy mismatch", "native_json", "native_schema"],
  ] as const)("rejects a successful %s trace", async (_label, strategy, primaryStrategy) => {
    const generateMock = vi.fn().mockResolvedValue({
      object: framePacket(),
      trace: trace(strategy, primaryStrategy),
    });
    const builder = createCampaignWorldBuilder({
      generateObject: generateMock as unknown as typeof safeGenerateObject,
    });

    await expect(builder.build({
      source: sourceFixture(false),
      model: structuredModel(),
      temperature: 0.7,
      maxOutputTokens: 8_000,
    })).rejects.toMatchObject({
      code: "model_contract_failed",
      stage: "world_frame",
    });
    expect(generateMock).toHaveBeenCalledTimes(3);
  });
});
