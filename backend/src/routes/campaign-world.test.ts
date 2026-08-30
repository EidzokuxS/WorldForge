import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { LanguageModel } from "ai";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import { markGenerationComplete as syncCampaignGeneration } from "../campaign/index.js";
import { closeDb } from "../db/index.js";
import {
  createCampaignWorldBuilder,
  createCampaignWorldBuildService,
  createCampaignWorldSourceService,
  openCampaignWorldDatabase,
  type WorldFrameAndCastSkeletonToolPacket,
} from "../campaign-world/index.js";
import type {
  WorldCastDetailBatchPacket,
  WorldCastDetailPacket,
  WorldCastPacket,
  WorldCastSkeletonPacket,
  WorldCastSkeletonTransportPacket,
  WorldConnectionsPacket,
  WorldConnectionsTransportPacket,
  WorldFramePacket,
} from "../campaign-world/contracts.js";
import { createCampaignWorldRoutes } from "./campaign-world.js";
import campaignRoutes from "./campaigns.js";
import { worldFrameAndCastSkeletonToolPacketSchema } from "../campaign-world/world-builder.js";

const CAMPAIGN_ID = "33333333-3333-4333-8333-333333333333";

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
        locationRef: "location:north-dock",
        name: "North Dock",
        description: "A public counter for passage records beneath the harbor signal lines.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:north-harbor",
        tags: ["fortified", "records"],
        isStarting: false,
      },
      {
        locationRef: "location:signal-tower",
        name: "Signal Tower",
        description: "A wind-scoured tower where harbor flags mark the next crossing.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:north-harbor",
        tags: ["fortified", "signals"],
        isStarting: false,
      },
      {
        locationRef: "location:reef-market",
        name: "Reef Market",
        description: "A covered exchange behind the luminous reef quay.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:glass-reef",
        tags: ["trade"],
        isStarting: false,
      },
      {
        locationRef: "location:tide-gate",
        name: "Tide Gate",
        description: "A narrow gate where tide charts and cargo seals are checked.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:glass-reef",
        tags: ["trade", "routes"],
        isStarting: false,
      },
      {
        locationRef: "location:bell-foundry",
        name: "Bell Foundry",
        description: "A hot foundry that casts the bronze bells used to read the weather.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:bell-island",
        tags: ["weather", "bells"],
        isStarting: false,
      },
      {
        locationRef: "location:storm-shrine",
        name: "Storm Shrine",
        description: "A salt-dark shrine where sailors leave tokens before a crossing.",
        kind: "persistent_sublocation",
        parentLocationRef: "location:bell-island",
        tags: ["weather", "ritual"],
        isStarting: false,
      },
    ],
    routes: [
      {
        fromLocationRef: "location:north-dock",
        toLocationRef: "location:signal-tower",
        travelCost: 2,
      },
      {
        fromLocationRef: "location:signal-tower",
        toLocationRef: "location:reef-market",
        travelCost: 3,
      },
      {
        fromLocationRef: "location:reef-market",
        toLocationRef: "location:tide-gate",
        travelCost: 4,
      },
      {
        fromLocationRef: "location:tide-gate",
        toLocationRef: "location:bell-foundry",
        travelCost: 5,
      },
      {
        fromLocationRef: "location:bell-foundry",
        toLocationRef: "location:storm-shrine",
        travelCost: 6,
      },
      {
        fromLocationRef: "location:storm-shrine",
        toLocationRef: "location:north-dock",
        travelCost: 7,
      },
    ],
  };
}

function toolFrameAndSkeletonPacket(): WorldFrameAndCastSkeletonToolPacket {
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
      tags: [...location.tags, "world"].slice(0, 4),
    })),
    persistentLocations: persistentLocations.map((location) => ({
      name: location.name,
      description: location.description,
      parentMacroIndex: macroIndexByRef.get(location.parentLocationRef!)!,
      tags: [...location.tags, "scene"].slice(0, 4),
    })),
    routes: frame.routes.map((route) => ({
      fromPersistentIndex: persistentIndexByRef.get(route.fromLocationRef)!,
      toPersistentIndex: persistentIndexByRef.get(route.toLocationRef)!,
      travelCost: route.travelCost,
    })),
    ...toolSkeletonTransportPacket(),
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
        actorRef: "actor:lantern-council",
        kind: "person",
        controller: "agent",
        role: "background",
        name: "Ilya Venn",
        summary: "A harbor clerk who tracks denied passage windows.",
        traits: ["precise"],
        tags: ["clerk"],
      },
      { actorRef: "actor:niko-salt", kind: "person", controller: "agent", role: "background", name: "Niko Salt", summary: "A dock medic who hears crews' private fears.", traits: ["steady"], tags: ["medic"] },
      { actorRef: "actor:rhea-quill", kind: "person", controller: "agent", role: "key", name: "Rhea Quill", summary: "A route assessor who suspects the storms are directed.", traits: ["skeptical"], tags: ["assessor"] },
      { actorRef: "actor:tavi-reed", kind: "person", controller: "agent", role: "key", name: "Tavi Reed", summary: "A tide recorder who keeps a second route ledger.", traits: ["careful"], tags: ["recorder"] },
      { actorRef: "actor:uma-vale", kind: "person", controller: "agent", role: "background", name: "Uma Vale", summary: "A foundry runner who carries sealed bell parts.", traits: ["quick"], tags: ["runner"] },
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
        objective: "Recover the missing passage register.",
        motivation: "Prove the harbor records were altered.",
        horizon: "ongoing",
        priority: 4,
        status: "active",
      },
      { actorRef: "actor:niko-salt", objective: "Keep exhausted crews working.", motivation: "Prevent another dockside death.", horizon: "immediate", priority: 3, status: "active" },
      { actorRef: "actor:rhea-quill", objective: "Identify who redirects storm signals.", motivation: "Restore safe crossings before eclipse.", horizon: "ongoing", priority: 5, status: "active" },
      { actorRef: "actor:tavi-reed", objective: "Compare the duplicate route ledgers.", motivation: "Find which crossing remains safe.", horizon: "ongoing", priority: 4, status: "active" },
      { actorRef: "actor:uma-vale", objective: "Deliver the sealed bell parts.", motivation: "Keep the foundry's warning signal working.", horizon: "immediate", priority: 3, status: "active" },
    ],
    placements: [
      {
        actorRef: "actor:mara-venn",
        locationRef: "location:north-dock",
        placementKind: "present",
      },
      {
        actorRef: "actor:oren-tide",
        locationRef: "location:north-dock",
        placementKind: "present",
      },
      {
        actorRef: "actor:sel-bell",
        locationRef: "location:reef-market",
        placementKind: "present",
      },
      {
        actorRef: "actor:lantern-council",
        locationRef: "location:reef-market",
        placementKind: "present",
      },
      { actorRef: "actor:niko-salt", locationRef: "location:bell-foundry", placementKind: "present" },
      { actorRef: "actor:rhea-quill", locationRef: "location:storm-shrine", placementKind: "present" },
      { actorRef: "actor:tavi-reed", locationRef: "location:north-dock", placementKind: "present" },
      { actorRef: "actor:uma-vale", locationRef: "location:bell-foundry", placementKind: "present" },
    ],
  };
}

function connectionsPacket(): WorldConnectionsPacket {
  return {
    relations: [
      {
        sourceActorRef: "actor:mara-venn",
        targetActorRef: "actor:lantern-council",
        relationType: "authority",
        summary: "Ilya controls Mara's signal archive access.",
        intensity: 4,
      },
      {
        sourceActorRef: "actor:oren-tide",
        targetActorRef: "actor:mara-venn",
        relationType: "dependency",
        summary: "Oren needs Mara to validate the route ledger.",
        intensity: 3,
      },
      {
        sourceActorRef: "actor:sel-bell",
        targetActorRef: "actor:lantern-council",
        relationType: "rivalry",
        summary: "Sel disputes Ilya's storm records.",
        intensity: 2,
      },
      { sourceActorRef: "actor:lantern-council", targetActorRef: "actor:niko-salt", relationType: "association", summary: "Ilya trusts Niko with copied records.", intensity: 3 },
      { sourceActorRef: "actor:niko-salt", targetActorRef: "actor:rhea-quill", relationType: "dependency", summary: "Niko needs Rhea to keep relief routes open.", intensity: 4 },
      { sourceActorRef: "actor:tavi-reed", targetActorRef: "actor:uma-vale", relationType: "association", summary: "Tavi checks the bell parts against the duplicate ledger.", intensity: 3 },
      { sourceActorRef: "actor:uma-vale", targetActorRef: "actor:tavi-reed", relationType: "dependency", summary: "Uma needs Tavi's ledger before sealing the bell parts.", intensity: 3 },
    ],
    pressures: [
      {
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorRefs: ["actor:mara-venn", "actor:oren-tide", "actor:lantern-council", "actor:rhea-quill"],
        locationRefs: ["location:north-dock"],
      },
      {
        name: "False Bells",
        description: "Bell Island signals storms that never arrive.",
        trajectory: "Couriers stop trusting Bell Island's warnings.",
        urgency: 3,
        actorRefs: ["actor:sel-bell", "actor:niko-salt"],
        locationRefs: ["location:bell-foundry"],
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
    actors: cast.actors.map((actor) => {
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
  const anchor = (actor: WorldCastSkeletonPacket["actors"][number]) => ({
    name: actor.name,
    role: actor.role,
    summary: actor.summary,
    homeLocationIndex: actor.homeLocationIndex ?? -1,
    objective: actor.objective,
  });
  return {
    keyActorOne: { ...ordinary(actors[0]!), role: "key" },
    keyActorTwo: { ...ordinary(actors[5]!), role: "key" },
    startingSupport: { ...anchor(actors[1]!), role: "support" },
    supportActor: { ...ordinary(actors[2]!), role: "support" },
    remoteBackground: { ...anchor(actors[3]!), role: "background" },
    backgroundActor: { ...ordinary(actors[4]!), role: "background" },
    otherActorOne: { ...ordinary(actors[6]!), role: actors[6]!.role },
    otherActorTwo: { ...ordinary(actors[7]!), role: actors[7]!.role },
  };
}

function toolSkeletonTransportPacket(): WorldCastSkeletonTransportPacket {
  return skeletonTransportPacket();
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

function toolDetailBatchPacket(globalActorIndices: readonly number[]): WorldCastDetailBatchPacket {
  const actors = detailPacket().actors;
  return {
    actors: globalActorIndices.map((actorIndex, detailSlotIndex) => {
      const { actorIndex: _globalActorIndex, ...fields } = actors[actorIndex]!;
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
  semanticRelations.sort((left, right) =>
    actorIndexByRef.get(left.sourceActorRef)! - actorIndexByRef.get(right.sourceActorRef)!
  );
  return {
    relations: semanticRelations.map((relation) => {
      const targetActorIndex = actorIndexByRef.get(relation.targetActorRef)!;
      return {
        targetActorIndex,
        relationType: relation.relationType,
        intensity: relation.intensity,
      };
    }),
    pressures: connections.pressures.map((pressure, index) => ({
      name: pressure.name,
      description: pressure.description,
      trajectory: (["escalating", "holding"] as const)[index]!,
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
    relations: base.relations,
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
        name: "Tide Ledger",
        description: "Route records disagree after the latest eclipse.",
        trajectory: "shifting",
        urgency: 4,
        actorIndices: [1],
        locationIndices: [3],
      },
    ],
  };
}

function successfulTrace(): SafeGenerateTrace {
  return {
    text: "private model output",
    cleanedText: "private model output",
    requestedMode: "auto",
    strategy: "native_schema",
    primaryStrategy: "native_schema",
    fallbackStrategy: "text_fallback",
    capability: {
      requestedMode: "auto",
      primaryStrategy: "native_schema",
      fallbackStrategy: "text_fallback",
      actualMode: "native_schema",
      reason: "route integration fixture",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      totalTokens: 150,
    },
    response: {
      id: "private-response-id",
      modelId: "route-model",
      timestamp: "private-timestamp",
    },
    finishReason: "stop",
  };
}

function successfulToolTrace(): SafeGenerateTrace {
  const base = successfulTrace();
  return {
    ...base,
    strategy: "tool_mode",
    primaryStrategy: "tool_mode",
    capability: {
      ...base.capability,
      requestedMode: "tool",
      primaryStrategy: "tool_mode",
      fallbackStrategy: "text_fallback",
      actualMode: "tool_mode",
      reason: "route tool-mode fixture",
    },
  };
}

function structuredModel(): LanguageModel {
  const model = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(
    model,
    buildStructuredOutputModelMetadata({
      providerId: "route-provider",
      providerName: "Route Provider",
      model: "route-model",
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

interface Gate {
  entered: Promise<void>;
  release(): void;
}

function controlledSuccessfulProvider(toolMode = false): {
  generateObject: typeof safeGenerateObject;
  gate: Gate;
  prompts: string[];
  schemas: unknown[];
} {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let frameEntered = false;
  const prompts: string[] = [];
  const schemas: unknown[] = [];
  type GenerateOptions = { prompt?: string; [key: string]: unknown };
  const generateObject = vi.fn(async ({ prompt, schema }: GenerateOptions) => {
    prompts.push(prompt ?? "");
    schemas.push(schema);
    if (toolMode && prompt?.includes("WORLD_CAST_SKELETON_IN_SAME_PACKET")) {
      if (!frameEntered) {
        frameEntered = true;
        enter();
        await released;
      }
      return { object: toolFrameAndSkeletonPacket(), trace: successfulToolTrace() };
    }
    if (prompt?.startsWith("You design the Campaign World frame.")) {
      if (!frameEntered) {
        frameEntered = true;
        enter();
        await released;
      }
      return toolMode
        ? { object: toolFrameAndSkeletonPacket(), trace: successfulToolTrace() }
        : { object: framePacket(), trace: successfulTrace() };
    }
    if (prompt?.startsWith("You design the compact starting Campaign World cast skeleton.")) {
      return { object: skeletonTransportPacket(), trace: successfulTrace() };
    }
    if (prompt?.startsWith("You complete one assigned detail batch")) {
      const globalActorIndices = prompt.includes('"actorIndex":0')
        ? [0, 2, 4, 6]
        : [1, 3, 5, 7];
      return {
        object: toolMode
          ? toolDetailBatchPacket(prompt.includes('"actorIndex":0')
            ? [0, 2, 4, 6]
            : [1, 3, 5, 7])
          : detailBatchPacket(globalActorIndices),
        trace: successfulTrace(),
      };
    }
    if (prompt?.startsWith("You design Campaign World relations and starting pressures from an accepted cast skeleton.")) {
      return {
        object: toolMode ? toolConnectionsTransportPacket() : connectionsTransportPacket(),
        trace: successfulTrace(),
      };
    }
    throw new Error("Unexpected Campaign World route prompt.");
  }) as unknown as typeof safeGenerateObject;
  return {
    generateObject,
    gate: { entered, release },
    prompts,
    schemas,
  };
}

function controlledFailingProvider(): {
  generateObject: typeof safeGenerateObject;
  gate: Gate;
} {
  let enter!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    enter = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const generateObject = vi.fn(async () => {
    enter();
    await released;
    throw new Error("Injected provider failure");
  }) as unknown as typeof safeGenerateObject;
  return {
    generateObject,
    gate: { entered, release },
  };
}

interface RouteHarness {
  app: Hono;
  buildService: ReturnType<typeof createCampaignWorldBuildService>;
  createModel: ReturnType<typeof vi.fn>;
}

function createHarness(
  generateObject: typeof safeGenerateObject,
  toolMode = false,
  syncGenerationComplete?: (campaignId: string, refinedPremise: string) => void,
): RouteHarness {
  let entitySequence = 0;
  let buildSequence = 0;
  const sourceService = createCampaignWorldSourceService();
  const builder = createCampaignWorldBuilder({
    generateObject,
    idFactory: () => `route-entity-${++entitySequence}`,
  });
  const buildService = createCampaignWorldBuildService({
    sourceService,
    builder,
    idFactory: () => `route-build-${++buildSequence}`,
  });
  const model = toolMode ? toolStructuredModel() : structuredModel();
  const createModel = vi.fn(() => model);
  const routes = createCampaignWorldRoutes({
    sourceService,
    buildService,
    createModel,
    loadSettings: () => ({}) as never,
    resolveGenerator: () => ({
      resolved: {
        provider: {
          id: toolMode ? "zai-coding-plan" : "route-provider",
          name: toolMode ? "Z.AI" : "Route Provider",
          baseUrl: "https://example.test/v1",
          apiKey: "route-key",
          model: toolMode ? "glm-5.3" : "route-model",
        },
        temperature: 0.7,
        maxTokens: 8_000,
      },
    }),
    eventPollMilliseconds: 1,
    ...(syncGenerationComplete
      ? { markGenerationComplete: syncGenerationComplete }
      : {}),
  });
  const app = new Hono();
  app.route("/api/campaigns", routes);
  return { app, buildService, createModel };
}

interface SseRecord {
  id: number;
  event: string;
  data: Record<string, unknown>;
}

function parseSse(text: string): SseRecord[] {
  const records: SseRecord[] = [];
  for (const block of text.split("\n\n")) {
    if (block.length === 0) continue;
    let id: number | null = null;
    let event = "";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith("id:")) id = Number(line.slice(3).trim());
      if (line.startsWith("event:")) event = line.slice(6).trim();
      if (line.startsWith("data:")) data = line.slice(5).trim();
    }
    if (id !== null && event.length > 0 && data.length > 0) {
      records.push({ id, event, data: JSON.parse(data) as Record<string, unknown> });
    }
  }
  return records;
}

let root = "";
let previousCampaignsRoot: string | undefined;

function campaignDirectory(): string {
  return path.join(root, CAMPAIGN_ID);
}

function writeConfig(): void {
  fs.mkdirSync(campaignDirectory(), { recursive: true });
  fs.writeFileSync(
    path.join(campaignDirectory(), "config.json"),
    JSON.stringify({
      name: "Route Integration Campaign",
      premise: "A stormbound archipelago faces a failing sea route.",
      createdAt: 1_000,
      updatedAt: 1_000,
    }),
    "utf-8",
  );
}

async function loadSource(app: Hono) {
  const response = await app.request(
    `/api/campaigns/${CAMPAIGN_ID}/world/source`,
  );
  expect(response.status).toBe(200);
  return response.json() as Promise<{
    sourceDigest: string;
    dna: unknown;
  }>;
}

async function startBuild(app: Hono, sourceDigest: string) {
  return app.request(`/api/campaigns/${CAMPAIGN_ID}/world/builds`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ expectedSourceDigest: sourceDigest }),
  });
}

beforeEach(() => {
  previousCampaignsRoot = process.env.GSD_CAMPAIGNS_ROOT;
  root = fs.mkdtempSync(path.join(os.tmpdir(), "worldforge-world-route-"));
  process.env.GSD_CAMPAIGNS_ROOT = root;
  writeConfig();
});

afterEach(() => {
  closeDb();
  if (previousCampaignsRoot === undefined) {
    delete process.env.GSD_CAMPAIGNS_ROOT;
  } else {
    process.env.GSD_CAMPAIGNS_ROOT = previousCampaignsRoot;
  }
  fs.rmSync(root, { recursive: true, force: true });
});

describe("Campaign World routes", () => {
  it("loads source through the normal migration path and saves strict DNA", async () => {
    const provider = controlledSuccessfulProvider();
    const { app } = createHarness(provider.generateObject);
    const initial = await loadSource(app);
    expect(initial.dna).toBeNull();

    const database = openCampaignWorldDatabase(CAMPAIGN_ID);
    database.close();

    const invalid = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/dna`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geography: " Leading space",
          politicalStructure: "Harbor councils",
          centralConflict: "Failing routes",
          culturalFlavor: "Signal songs",
          environment: "Stormy islands",
          wildcard: "Living maps",
        }),
      },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "invalid_request" },
    });

    const saved = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/dna`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          geography: "A ring of stormbound islands",
          politicalStructure: "Independent harbor councils",
          centralConflict: "The sea routes are failing",
          culturalFlavor: "Salt-worn ritual; Communal songs",
          environment: "Cold ocean winds and luminous reefs",
          wildcard: "Maps change after every eclipse",
        }),
      },
    );
    expect(saved.status).toBe(200);
    const savedSource = await saved.json() as {
      sourceDigest: string;
      dna: { culturalFlavor: string };
    };
    expect(savedSource.sourceDigest).not.toBe(initial.sourceDigest);
    expect(savedSource.dna.culturalFlavor).toBe(
      "Salt-worn ritual; Communal songs",
    );
  });

  it("runs the tool-mode world seed as one frame call before detail and connections", async () => {
    const provider = controlledSuccessfulProvider(true);
    const { app, buildService } = createHarness(provider.generateObject, true);
    const source = await loadSource(app);
    const startedResponse = await startBuild(app, source.sourceDigest);
    expect(startedResponse.status).toBe(202);
    const started = await startedResponse.json() as { buildId: string };

    await provider.gate.entered;
    expect(provider.prompts).toHaveLength(1);
    expect(provider.prompts[0]).toContain("WORLD_CAST_SKELETON_IN_SAME_PACKET");
    expect(provider.schemas[0]).toBe(worldFrameAndCastSkeletonToolPacketSchema);

    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;

    expect(provider.prompts).toHaveLength(4);
    expect(provider.prompts.filter((prompt) =>
      prompt.startsWith("You design the compact starting Campaign World cast skeleton."),
    )).toHaveLength(0);
    expect(provider.prompts.slice(1).some((prompt) =>
      prompt.includes("WORLD_CAST_SKELETON_IN_SAME_PACKET"),
    )).toBe(false);

    const events = parseSse(await (await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events`,
    )).text());
    expect(events.at(-1)).toMatchObject({
      id: 12,
      event: "build_completed",
    });
    expect(await (await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toMatchObject({ status: "review" });
  });

  it("replays a completed build, resumes by sequence, and accepts persisted review", async () => {
    const provider = controlledSuccessfulProvider();
    const { app, buildService, createModel } = createHarness(provider.generateObject);
    const source = await loadSource(app);
    const startedResponse = await startBuild(app, source.sourceDigest);
    expect(startedResponse.status).toBe(202);
    const started = await startedResponse.json() as { buildId: string };
    expect(createModel).toHaveBeenCalledWith(
      expect.objectContaining({ id: "route-provider", model: "route-model" }),
      { role: "generator", reasoningMode: "bypass" },
    );
    await provider.gate.entered;
    expect(buildService.hasLiveCoordinator(CAMPAIGN_ID, started.buildId)).toBe(true);
    const liveEventsResponse = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events?afterSequence=0`,
    );
    const liveEventsText = liveEventsResponse.text();
    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;
    const allEvents = parseSse(await liveEventsText);
    expect(allEvents.map((event) => event.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    const stateResponse = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    );
    expect(stateResponse.status).toBe(200);
    const reviewState = await stateResponse.json() as {
      status: string;
      currentBuildId: string;
      currentStage: string;
      lastEventSequence: number;
      world: {
        version: number;
        contentHash: string;
        worldSummary: string;
        locations: unknown[];
      };
    };
    expect(reviewState).toMatchObject({
      status: "review",
      currentBuildId: started.buildId,
      currentStage: "persistence",
      lastEventSequence: 12,
    });
    expect(reviewState.world.locations).toHaveLength(9);

    const resumed = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events`,
      { headers: { "Last-Event-ID": "5" } },
    );
    const resumedEvents = parseSse(await resumed.text());
    expect(resumedEvents.map((event) => event.id)).toEqual([
      6, 7, 8, 9, 10, 11, 12,
    ]);
    const applied = new Map<number, SseRecord>();
    for (const event of allEvents.slice(0, 5)) applied.set(event.id, event);
    for (const event of resumedEvents) applied.set(event.id, event);
    expect([...applied.keys()]).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    closeDb();
    const restartedProvider = controlledSuccessfulProvider();
    const syncGenerationComplete = vi.fn(syncCampaignGeneration);
    const restarted = createHarness(
      restartedProvider.generateObject,
      false,
      syncGenerationComplete,
    ).app;
    const restartedState = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    );
    expect(await restartedState.json()).toMatchObject({
      status: "review",
      world: {
        version: reviewState.world.version,
        contentHash: reviewState.world.contentHash,
      },
    });
    const restartedReplay = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events?afterSequence=0`,
    );
    expect(parseSse(await restartedReplay.text()).map((event) => event.id)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);

    const staleAccept = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version + 1,
          expectedContentHash: reviewState.world.contentHash,
        }),
      },
    );
    expect(staleAccept.status).toBe(409);
    expect(await staleAccept.json()).toMatchObject({
      error: { code: "world_version_conflict" },
    });

    const staleHashAccept = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version,
          expectedContentHash: "0".repeat(64),
        }),
      },
    );
    expect(staleHashAccept.status).toBe(409);
    expect(await staleHashAccept.json()).toMatchObject({
      error: { code: "world_version_conflict" },
    });
    expect(syncGenerationComplete).not.toHaveBeenCalled();

    const rejectionDatabase = openCampaignWorldDatabase(CAMPAIGN_ID);
    try {
      rejectionDatabase.sqlite.exec(`
        CREATE TRIGGER reject_campaign_world_accept
        BEFORE UPDATE OF status ON campaign_worlds
        WHEN NEW.status = 'accepted'
        BEGIN
          SELECT RAISE(ABORT, 'acceptance rejected for route test');
        END;
      `);
    } finally {
      rejectionDatabase.close();
    }
    const failedAccept = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version,
          expectedContentHash: reviewState.world.contentHash,
        }),
      },
    );
    expect(failedAccept.status).toBe(500);
    expect(syncGenerationComplete).not.toHaveBeenCalled();

    const cleanupDatabase = openCampaignWorldDatabase(CAMPAIGN_ID);
    try {
      cleanupDatabase.sqlite.exec("DROP TRIGGER reject_campaign_world_accept");
    } finally {
      cleanupDatabase.close();
    }

    const accepted = await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/accept`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedVersion: reviewState.world.version,
          expectedContentHash: reviewState.world.contentHash,
        }),
      },
    );
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toMatchObject({
      campaignId: CAMPAIGN_ID,
      worldVersion: 1,
      contentHash: reviewState.world.contentHash,
    });
    expect(syncGenerationComplete).toHaveBeenCalledTimes(1);
    expect(syncGenerationComplete).toHaveBeenCalledWith(
      CAMPAIGN_ID,
      reviewState.world.worldSummary,
    );
    const config = JSON.parse(
      fs.readFileSync(path.join(campaignDirectory(), "config.json"), "utf-8"),
    ) as { generationComplete?: boolean; premise?: string };
    expect(config).toMatchObject({
      generationComplete: true,
      premise: reviewState.world.worldSummary,
    });
    const mounted = new Hono();
    mounted.route("/api/campaigns", campaignRoutes);
    const legacyWorld = await mounted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world?projection=review`,
    );
    expect(legacyWorld.status).toBe(200);
    const acceptedState = await (await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json();
    expect(acceptedState).toMatchObject({
      status: "accepted",
      world: { contentHash: reviewState.world.contentHash },
    });

    const acceptedDatabase = openCampaignWorldDatabase(CAMPAIGN_ID);
    try {
      acceptedDatabase.sqlite.prepare(`
        UPDATE actors
        SET summary = 'Live actor summary after acceptance.'
        WHERE campaign_id = ?
      `).run(CAMPAIGN_ID);
    } finally {
      acceptedDatabase.close();
    }
    expect(await (await restarted.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toEqual(acceptedState);
  });

  it("returns one accepted start and one conflict for simultaneous build requests", async () => {
    const provider = controlledSuccessfulProvider();
    const { app, buildService } = createHarness(provider.generateObject);
    const source = await loadSource(app);

    const [first, second] = await Promise.all([
      startBuild(app, source.sourceDigest),
      startBuild(app, source.sourceDigest),
    ]);
    const responses = [first, second].sort((left, right) => left.status - right.status);
    expect(responses.map((response) => response.status)).toEqual([202, 409]);
    const started = await responses[0].json() as { buildId: string };
    expect(await responses[1].json()).toMatchObject({
      error: { code: "world_build_running" },
    });
    await provider.gate.entered;
    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;
    expect(await (await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toMatchObject({ status: "review" });
  });

  it("streams a durable provider failure and leaves domain rows empty", async () => {
    const provider = controlledFailingProvider();
    const { app, buildService } = createHarness(provider.generateObject);
    const source = await loadSource(app);
    const startedResponse = await startBuild(app, source.sourceDigest);
    const started = await startedResponse.json() as { buildId: string };
    await provider.gate.entered;
    const completion = buildService.waitForBuild(CAMPAIGN_ID, started.buildId);
    provider.gate.release();
    await completion;

    const eventsResponse = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events`,
    );
    const events = parseSse(await eventsResponse.text());
    expect(events.at(-1)).toMatchObject({
      id: 3,
      event: "build_failed",
      data: { errorCode: "model_contract_failed" },
    });
    expect(await (await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/state`,
    )).json()).toMatchObject({
      status: "failed",
      currentBuildId: started.buildId,
      lastEventSequence: 3,
      build: { errorCode: "model_contract_failed" },
    });

    const database = openCampaignWorldDatabase(CAMPAIGN_ID);
    try {
      expect(database.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM locations WHERE campaign_id = ?",
      ).get(CAMPAIGN_ID)).toEqual({ count: 0 });
      expect(database.sqlite.prepare(
        "SELECT COUNT(*) AS count FROM actors WHERE campaign_id = ?",
      ).get(CAMPAIGN_ID)).toEqual({ count: 0 });
    } finally {
      database.close();
    }

    const invalidCursor = await app.request(
      `/api/campaigns/${CAMPAIGN_ID}/world/builds/${started.buildId}/events?afterSequence=two`,
    );
    expect(invalidCursor.status).toBe(400);
    expect(await invalidCursor.json()).toMatchObject({
      error: { code: "invalid_event_cursor" },
    });
  });
});
