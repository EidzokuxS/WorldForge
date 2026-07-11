import type { LanguageModel } from "ai";
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
import {
  CampaignWorldBuilderError,
  createCampaignWorldStageEvidence,
  createCampaignWorldBuilder,
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
    ],
    routes: [
      { fromLocationRef: "location:north-harbor", toLocationRef: "location:glass-reef", travelCost: 2 },
      { fromLocationRef: "location:glass-reef", toLocationRef: "location:bell-island", travelCost: 3 },
      { fromLocationRef: "location:bell-island", toLocationRef: "location:north-harbor", travelCost: 4 },
    ],
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
      { actorRef: "actor:mara-venn", objective: "Map the next route change.", motivation: "Keep North Harbor supplied.", horizon: "immediate", priority: 5, status: "active" },
      { actorRef: "actor:oren-tide", objective: "Deliver a sealed route ledger.", motivation: "Clear an old family debt.", horizon: "immediate", priority: 4, status: "active" },
      { actorRef: "actor:sel-bell", objective: "Explain the false storm signal.", motivation: "Protect Bell Island from panic.", horizon: "ongoing", priority: 3, status: "active" },
      { actorRef: "actor:lantern-council", objective: "Retain control of safe passage windows.", motivation: "Preserve the harbor compact.", horizon: "ongoing", priority: 4, status: "active" },
    ],
    placements: [
      { actorRef: "actor:mara-venn", locationRef: "location:north-harbor", placementKind: "present" },
      { actorRef: "actor:oren-tide", locationRef: "location:glass-reef", placementKind: "present" },
      { actorRef: "actor:sel-bell", locationRef: "location:bell-island", placementKind: "present" },
      { actorRef: "actor:lantern-council", locationRef: "location:north-harbor", placementKind: "base" },
    ],
  };
}

function connectionsPacket(): WorldConnectionsPacket {
  return {
    relations: [
      { sourceActorRef: "actor:mara-venn", targetActorRef: "actor:lantern-council", relationType: "authority", summary: "The council controls Mara's signal archive access.", intensity: 4 },
      { sourceActorRef: "actor:oren-tide", targetActorRef: "actor:mara-venn", relationType: "dependency", summary: "Oren needs Mara to validate the route ledger.", intensity: 3 },
      { sourceActorRef: "actor:sel-bell", targetActorRef: "actor:lantern-council", relationType: "rivalry", summary: "Sel disputes the council's storm forecasts.", intensity: 2 },
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

function successfulGenerateMock() {
  return vi
    .fn()
    .mockResolvedValueOnce({ object: framePacket(), trace: trace() })
    .mockResolvedValueOnce({ object: castPacket(), trace: trace() })
    .mockResolvedValueOnce({ object: connectionsPacket(), trace: trace() });
}

function sequentialIdFactory(): () => string {
  let next = 0;
  return () => `persistent-id-${++next}`;
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
      JSON.stringify(framePacket().locations.map((location) => location.locationRef)),
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
        .filter((actor) => actor.kind === "collective" || actor.role === "key")
        .map((actor) => actor.actorRef)),
      "END_REQUIRED_RELATION_ACTOR_REFS",
    ].join("\n"));
    expect(prompts[2]).toContain([
      "ALLOWED_LOCATION_REFS",
      JSON.stringify(framePacket().locations.map((location) => location.locationRef)),
      "END_ALLOWED_LOCATION_REFS",
    ].join("\n"));
    expect(prompts[2]).toContain(
      "Every value in REQUIRED_RELATION_ACTOR_REFS must appear as a sourceActorRef or targetActorRef in at least one relation.",
    );
    expect(prompts[0]).toContain(
      "Set parentLocationRef to null for every macro location.",
    );
    expect(prompts[0]).toContain(
      "For each persistent sublocation, copy the locationRef of an existing macro location into parentLocationRef.",
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
    expect(candidate.draft.actors.find((actor) => actor.kind === "collective")).toMatchObject({
      controller: "agent",
      name: "Lantern Council",
    });
    expect(candidate.draft.actors.every((actor) =>
      actor.controller === "agent" && String(actor.role) !== "player"
    )).toBe(true);
    expect(candidate.draft.locations.every((location) =>
      location.id.startsWith("persistent-id-")
    )).toBe(true);
    expect(candidate.draft.pressures[0].actorIds).toEqual([
      candidate.draft.actors[0].id,
      candidate.draft.actors[3].id,
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
      .mockRejectedValueOnce(new Error("cast provider failure"));
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
          totalAttempts: 1,
          repairUsed: false,
          retryUsed: false,
          textFallbackUsed: false,
          errorCode: "model_contract_failed",
        },
      ],
    });
    expect(generateMock).toHaveBeenCalledTimes(2);
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
    const generateMock = vi.fn().mockResolvedValueOnce({
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
    expect(generateMock).toHaveBeenCalledOnce();
  });
});
