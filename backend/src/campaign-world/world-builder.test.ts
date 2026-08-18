import type { LanguageModel } from "ai";
import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { CampaignWorldSource } from "@worldforge/shared";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import {
  safeGenerateObject,
  type SafeGenerateTrace,
} from "../ai/generate-object-safe.js";
import type {
  WorldCastPacket,
  WorldConnectionsPacket,
  WorldFramePacket,
} from "./contracts.js";
import { worldFramePacketSchema } from "./contracts.js";
import {
  CampaignWorldBuilderError,
  createCampaignWorldStageEvidence,
  createCampaignWorldBuilder,
  decodeWorldFrameToolPacket,
  worldFrameToolPacketSchema,
  type WorldFrameToolPacket,
} from "./world-builder.js";

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
      locationKey: location.locationRef.slice("location:".length),
      name: location.name,
      description: location.description,
      tags: [...location.tags],
    })),
    persistentLocations: persistentLocations.map((location) => ({
      locationKey: location.locationRef.slice("location:".length),
      name: location.name,
      description: location.description,
      parentMacroIndex: macroIndexByRef.get(location.parentLocationRef!)!,
      tags: [...location.tags],
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
    ],
    goals: [
      { actorRef: "actor:mara-venn", objective: "Map the next route change.", motivation: "Keep North Harbor supplied.", horizon: "immediate", priority: 5, status: "active" },
      { actorRef: "actor:oren-tide", objective: "Deliver a sealed route ledger.", motivation: "Clear an old family debt.", horizon: "immediate", priority: 4, status: "active" },
      { actorRef: "actor:sel-bell", objective: "Explain the false storm signal.", motivation: "Protect Bell Island from panic.", horizon: "ongoing", priority: 3, status: "active" },
      { actorRef: "actor:ilya-venn", objective: "Recover the missing passage register.", motivation: "Prove the harbor records were altered.", horizon: "ongoing", priority: 4, status: "active" },
      { actorRef: "actor:niko-salt", objective: "Keep exhausted crews working.", motivation: "Prevent another dockside death.", horizon: "immediate", priority: 3, status: "active" },
      { actorRef: "actor:rhea-quill", objective: "Identify who redirects storm signals.", motivation: "Restore safe crossings before eclipse.", horizon: "ongoing", priority: 5, status: "active" },
    ],
    placements: [
      { actorRef: "actor:mara-venn", locationRef: "location:north-pier", placementKind: "present" },
      { actorRef: "actor:oren-tide", locationRef: "location:glass-dock", placementKind: "present" },
      { actorRef: "actor:sel-bell", locationRef: "location:bell-quay", placementKind: "present" },
      { actorRef: "actor:ilya-venn", locationRef: "location:north-market", placementKind: "present" },
      { actorRef: "actor:niko-salt", locationRef: "location:glass-garden", placementKind: "present" },
      { actorRef: "actor:rhea-quill", locationRef: "location:bell-tower", placementKind: "present" },
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
    ],
    pressures: [
      {
        name: "Failing Routes",
        description: "Safe sea lanes close earlier after every eclipse.",
        trajectory: "North Harbor loses supply access within two route cycles.",
        urgency: 5,
        actorRefs: ["actor:mara-venn", "actor:ilya-venn", "actor:rhea-quill"],
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
    .mockResolvedValueOnce({ object: castPacket(), trace: trace() })
    .mockResolvedValueOnce({ object: connectionsPacket(), trace: trace() });
}

function successfulToolGenerateMock() {
  return vi
    .fn()
    .mockResolvedValueOnce({
      object: toolFramePacket(),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: castPacket(),
      trace: trace("tool_mode", "tool_mode"),
    })
    .mockResolvedValueOnce({
      object: connectionsPacket(),
      trace: trace("tool_mode", "tool_mode"),
    });
}

function sequentialIdFactory(): () => string {
  let next = 0;
  return () => `persistent-id-${++next}`;
}

type ToolFrameMutation = (packet: WorldFrameToolPacket) => void;

function mutableToolFramePacket(): WorldFrameToolPacket {
  const packet = JSON.parse(JSON.stringify(toolFramePacket())) as WorldFrameToolPacket;
  packet.macroLocations[0]!.name = "MODEL_PRIVATE_LOCATION_NAME";
  packet.macroLocations[0]!.description = "MODEL_PRIVATE_DESCRIPTION";
  packet.macroLocations[0]!.locationKey = "model-private-key";
  return packet;
}

function recoveryIssuesFromPrompt(prompt: string): Array<Record<string, unknown>> {
  const start = prompt.indexOf("SAFE_ISSUES\n");
  const end = prompt.indexOf("\nEND_SAFE_ISSUES", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return JSON.parse(prompt.slice(start + "SAFE_ISSUES\n".length, end)) as Array<Record<string, unknown>>;
}

function stageErrorCause(error: unknown): Record<string, unknown> {
  return (error as { cause?: Record<string, unknown> }).cause ?? {};
}

describe("Campaign World staged builder", () => {
  it.each([
    ["premise-only", false],
    ["World DNA", true],
  ])("builds a valid %s world through three ordered strict calls", async (_label, withDna) => {
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

    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(generateMock.mock.calls[0]![0].schema).toBe(worldFramePacketSchema);
    for (const call of generateMock.mock.calls) {
      expect(call[0]).toMatchObject({
        mode: "auto",
        strictSchema: true,
        allowRepair: false,
        allowTextFallback: false,
        retries: 1,
        temperature: 0.7,
        maxOutputTokens: 8_000,
      });
    }
    const prompts = generateMock.mock.calls.map((call) => String(call[0].prompt));
    expect(prompts.every((prompt) => prompt.includes(sourceFixture(withDna).premise))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      "Output every string without leading or trailing whitespace.",
    ))).toBe(true);
    expect(prompts.every((prompt) => prompt.includes(
      "Keep each reference, name, tag, and trait on one line without line breaks.",
    ))).toBe(true);
    expect(prompts[1]).toContain([
      "ALLOWED_LOCATION_REFS",
      JSON.stringify(framePacket().locations
        .filter((location) => location.kind === "persistent_sublocation")
        .map((location) => location.locationRef)),
      "END_ALLOWED_LOCATION_REFS",
    ].join("\n"));
    expect(prompts[1]).toContain(
      "Reuse each actors[].actorRef character-for-character in the matching goals[].actorRef and placements[].actorRef fields.",
    );
    expect(prompts[2]).toContain([
      "ALLOWED_ACTOR_REFS",
      JSON.stringify(castPacket().actors.map((actor) => actor.actorRef)),
      "END_ALLOWED_ACTOR_REFS",
    ].join("\n"));
    expect(prompts[2]).toContain([
      "REQUIRED_RELATION_ACTOR_REFS",
      JSON.stringify(castPacket().actors
        .map((actor) => actor.actorRef)),
      "END_REQUIRED_RELATION_ACTOR_REFS",
    ].join("\n"));
    expect(prompts[2]).toContain([
      "ALLOWED_LOCATION_REFS",
      JSON.stringify(framePacket().locations
        .filter((location) => location.kind === "persistent_sublocation")
        .map((location) => location.locationRef)),
      "END_ALLOWED_LOCATION_REFS",
    ].join("\n"));
    expect(prompts[2]).toContain(
      "Every value in REQUIRED_RELATION_ACTOR_REFS must appear as a sourceActorRef or targetActorRef in at least one relation.",
    );
    expect(prompts[0]).toContain(
      "Set parentLocationRef to null for each macro region.",
    );
    expect(prompts[0]).toContain(
      "Give every persistent sublocation an existing macro region as its parent.",
    );
    expect(prompts[2]).toContain(
      "Set each relation intensity to an integer from 1 for a faint link through 5 for a defining force.",
    );
    expect(prompts[2]).toContain(
      "Set each pressure urgency to an integer from 1 for slow pressure through 5 for immediate pressure.",
    );
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
    expect(candidate.draft.actors).toHaveLength(6);
    expect(candidate.draft.actors.every((actor) => actor.kind === "person")).toBe(true);
    expect(candidate.draft.actors.every((actor) =>
      actor.controller === "agent" && String(actor.role) !== "player"
    )).toBe(true);
    expect(candidate.draft.locations.every((location) =>
      location.id.startsWith("persistent-id-")
    )).toBe(true);
    expect(candidate.draft.pressures[0].actorIds).toEqual([
      candidate.draft.actors[0].id,
      candidate.draft.actors[3].id,
      candidate.draft.actors[5].id,
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

    expect(generateMock).toHaveBeenCalledTimes(3);
    expect(generateMock.mock.calls[0]![0].schema).toBe(worldFrameToolPacketSchema);
    expect(generateMock.mock.calls[0]![0].schema).not.toBe(worldFramePacketSchema);
    const schemaJson = JSON.stringify(z.toJSONSchema(worldFrameToolPacketSchema));
    for (const forbidden of ["anyOf", "oneOf", "const", "prefixItems", "nullable", "location:"]) {
      expect(schemaJson).not.toContain(forbidden);
    }
    expect(schemaJson).toContain("locationKey");
    expect(schemaJson).toContain("startingMacroIndex");
    expect(schemaJson).toContain("macroLocations");
    expect(schemaJson).toContain("persistentLocations");
    expect(schemaJson).toContain("parentMacroIndex");
    expect(schemaJson).toContain("fromPersistentIndex");
    expect(schemaJson).toContain("toPersistentIndex");
    for (const forbiddenField of [
      "kind",
      "isStarting",
      "parentLocationRef",
      "fromLocationRef",
      "toLocationRef",
    ]) {
      expect(schemaJson).not.toContain(forbiddenField);
    }
    expect(String(generateMock.mock.calls[0]![0].prompt)).toContain(
      "Return locationKey as lowercase kebab-case without the location: prefix.",
    );
    expect(String(generateMock.mock.calls[0]![0].prompt)).toContain(
      "Return exactly three macroLocations, then six or seven persistentLocations.",
    );
    expect(String(generateMock.mock.calls[0]![0].prompt)).toContain(
      "startingMacroIndex selects one macroLocations row.",
    );
    expect(String(generateMock.mock.calls[0]![0].prompt)).toContain(
      "Each persistentLocations row uses parentMacroIndex to index macroLocations.",
    );
    expect(String(generateMock.mock.calls[0]![0].prompt)).toContain(
      "Each route uses required fromPersistentIndex and toPersistentIndex values that index persistentLocations; the two indices must differ.",
    );
    expect(String(generateMock.mock.calls[0]![0].prompt)).toContain(
      "Do not return kind, isStarting, parentLocationRef, fromLocationRef, or toLocationRef in tool mode.",
    );
    expect(candidate.stageEvidence[0]).toMatchObject({
      primaryStrategy: "tool_mode",
      actualStrategy: "tool_mode",
      totalAttempts: 1,
      retryUsed: false,
    });
    expect(candidate.draft.locations.map((location) => location.name)).toEqual(
      framePacket().locations.map((location) => location.name),
    );
    expect(candidate.draft.routes.map((route) => route.fromLocationId)).toHaveLength(6);
  });

  it("decodes exact location order and leaves all domain invariants to the unchanged schema", () => {
    const decoded = decodeWorldFrameToolPacket(toolFramePacket());
    expect(decoded.locations.map((location) => location.locationRef)).toEqual(
      framePacket().locations.map((location) => location.locationRef),
    );
    expect(decoded.locations.map((location) => location.parentLocationRef)).toEqual(
      framePacket().locations.map((location) => location.parentLocationRef),
    );
    expect(decoded.routes).toEqual(framePacket().routes);
  });

  it.each([
    ["missing key", (packet: WorldFrameToolPacket) => {
      const location = packet.persistentLocations[0]!;
      delete (location as Partial<typeof location>).locationKey;
    }],
    ["empty key", (packet: WorldFrameToolPacket) => { packet.persistentLocations[0]!.locationKey = ""; }],
    ["invalid key", (packet: WorldFrameToolPacket) => { packet.persistentLocations[0]!.locationKey = "Not A Key"; }],
    ["duplicate key", (packet: WorldFrameToolPacket) => { packet.persistentLocations[1]!.locationKey = packet.persistentLocations[0]!.locationKey; }],
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
    ["location_key", (packet: WorldFrameToolPacket) => {
      packet.persistentLocations[1]!.locationKey = packet.persistentLocations[0]!.locationKey;
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
    const generateMock = vi
      .fn()
      .mockResolvedValueOnce({
        object: invalid,
        trace: traceWithUsage("tool_mode", "tool_mode", 11, 7),
      })
      .mockResolvedValueOnce({
        object: toolFramePacket(),
        trace: traceWithUsage("tool_mode", "tool_mode", 13, 9),
      })
      .mockResolvedValueOnce({ object: castPacket(), trace: trace("tool_mode", "tool_mode") })
      .mockResolvedValueOnce({ object: connectionsPacket(), trace: trace("tool_mode", "tool_mode") });
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

    expect(generateMock).toHaveBeenCalledTimes(4);
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
  });

  it("uses an unknown safe coordinate for an opaque rejection without echoing the provider message", async () => {
    const privateMessage = "RAW_PROVIDER_MESSAGE MODEL_PRIVATE_LOCATION_NAME";
    const generateMock = vi
      .fn()
      .mockRejectedValueOnce(new Error(privateMessage))
      .mockResolvedValueOnce({
        object: toolFramePacket(),
        trace: traceWithUsage("tool_mode", "tool_mode", 13, 9),
      })
      .mockResolvedValueOnce({ object: castPacket(), trace: trace("tool_mode", "tool_mode") })
      .mockResolvedValueOnce({ object: connectionsPacket(), trace: trace("tool_mode", "tool_mode") });
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

    const secondPrompt = String(generateMock.mock.calls[1]![0].prompt);
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
      .mockResolvedValueOnce({ object: castPacket(), trace: trace() })
      .mockResolvedValueOnce({ object: connectionsPacket(), trace: trace() });
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

    expect(generateMock).toHaveBeenCalledTimes(4);
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
