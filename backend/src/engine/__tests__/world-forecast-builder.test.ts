import { beforeEach, describe, expect, it, vi } from "vitest";

const { logEventMock } = vi.hoisted(() => ({
  logEventMock: vi.fn(),
}));

vi.mock("../../ai/generate-object-safe.js", () => ({
  safeGenerateObject: vi.fn(),
}));

vi.mock("../../ai/provider-registry.js", () => ({
  createModel: vi.fn(() => "judge-model"),
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: logEventMock,
  })),
  withRole: vi.fn(async (_role: string, fn: () => unknown) => await fn()),
}));

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";
import type { SceneFrame } from "../scene-frame.js";
import { worldTrajectoryForecastSchema } from "../world-forecast.js";
import {
  forecastBuilderOutputSchema,
  runWorldForecastBuilder,
} from "../world-forecast-builder.js";

const provider = {
  id: "test-provider",
  name: "Test Provider",
  baseUrl: "http://localhost:1234",
  apiKey: "test-key",
  model: "test-model",
} as ProviderConfig;

function createFrame(): SceneFrame {
  return {
    campaignId: "campaign-forecast",
    tick: 24,
    worldVersion: 0,
    playerActorId: "actor-player",
    currentLocationId: "loc-pier",
    currentSceneScopeId: "scene-counter",
    currentLocationName: "Lantern-Lit Gondola Pier",
    currentSceneScopeName: "Pier Records Counter",
    playerAction: "I ask for a route chit.",
    roster: {
      active: [
        {
          id: "actor-player",
          actorId: "actor-player",
          type: "player",
          label: "Mira Voss",
          locationId: "loc-pier",
          sceneScopeId: "scene-counter",
          awareness: "clear",
        },
      ],
      support: [],
      background: [],
    },
    perception: {
      playerAwarenessHints: [],
      actorAwareness: {},
    },
    recentEvents: [
      {
        id: "event-1",
        tick: 23,
        summary: "Wardens fined operators at the pier.",
        source: "location_recent_event",
        actorIds: [],
        perceivableByPlayer: true,
      },
    ],
    targetCandidates: [],
    movementCandidates: [],
    deferredHooks: [],
    allowedTools: ["log_event"],
    oracle: null,
  };
}

describe("world forecast builder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("normalizes draft forecast output into strict persisted forecast shape", async () => {
    const longDiagnosticNote =
      "Forecast diagnostic notes may be verbose in live model output, but they are non-semantic telemetry and should not force a repair loop.";
    const draft = forecastBuilderOutputSchema.parse({
      expiresInTicks: 12,
      entries: [
        {
          baseTick: 24,
          campaignId: "campaign-forecast",
          subjectRefs: [{ type: "location", id: "current_location", label: "Lantern-Lit Gondola Pier" }],
          localityRefs: ["current_location", "scene:current_scene", "actor:Player"],
          privacy: "public",
          playerFacingEligibility: "local_public",
          advisoryText:
            "Warden inspections are likely to tighten around the pier if no one interrupts the current pressure.",
          advisorySignals: ["warden pressure", { signal: "pier chokepoint" }],
          privateTerms: { terms: ["Hidden Warden"] },
        },
      ],
      diagnostics: {
        notes: [longDiagnosticNote],
      },
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: draft,
      trace: {
        text: "{}",
        cleanedText: "{}",
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    const forecast = await runWorldForecastBuilder({
      provider,
      frame: createFrame(),
    });

    expect(worldTrajectoryForecastSchema.parse(forecast)).toEqual(forecast);
    expect(forecast).toMatchObject({
      version: "world-trajectory-forecast.v1",
      campaignId: "campaign-forecast",
      baseTick: 24,
      generatedAtTick: 24,
      expiresAtTick: 36,
      promptReady: false,
      diagnostics: {
        source: "gm_forecast_builder",
        notes: [longDiagnosticNote.slice(0, 120).trimEnd()],
      },
    });
    expect(forecast.diagnostics.notes[0]?.length).toBeLessThanOrEqual(120);
    expect(forecast.entries[0]).toMatchObject({
      id: "forecast-24-1",
      baseTick: 24,
      horizonTicks: 12,
      confidence: 0.5,
      privacy: "public",
      playerFacingEligibility: "local_public",
      subjectRefs: [{ type: "location", id: "loc-pier" }],
      locality: {
        locationRefs: ["loc-pier"],
        sceneRefs: ["scene-counter"],
        actorRefs: ["actor-player"],
      },
      advisorySignals: [
        { label: "warden pressure" },
        { label: "pier chokepoint" },
      ],
      privateTerms: ["Hidden Warden"],
    });
  });

  it("drops unsafe model-authored forecast labels before they can become prompt refs", async () => {
    const draft = forecastBuilderOutputSchema.parse({
      expiresInTicks: 3,
      entries: [
        {
          subjectRefs: [{ type: "actor", id: "Player", label: "actor:actor-player" }],
          localityRefs: ["current_location"],
          privacy: "public",
          playerFacingEligibility: "local_public",
          advisoryText: "A visible pressure follows the player if nobody intervenes.",
          advisorySignals: ["visible pressure"],
        },
      ],
      diagnostics: { notes: [] },
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: draft,
      trace: {
        text: "{}",
        cleanedText: "{}",
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    const forecast = await runWorldForecastBuilder({
      provider,
      frame: createFrame(),
    });

    expect(forecast.entries[0]?.subjectRefs[0]).toEqual({
      type: "actor",
      id: "actor-player",
    });
    expect(JSON.stringify(forecast)).not.toContain("actor:actor-player");
  });

  it("resolves prompt aliases back to backend refs before forecast persistence", async () => {
    const frame = createFrame();
    const npc = {
      id: "actor-clerk",
      actorId: "actor-clerk",
      type: "npc" as const,
      label: "Pier Clerk",
      locationId: frame.currentLocationId,
      sceneScopeId: frame.currentSceneScopeId,
      awareness: "clear" as const,
    };
    const draft = forecastBuilderOutputSchema.parse({
      expiresInTicks: 3,
      entries: [
        {
          subjectRefs: [{ type: "actor", id: "actor_2", label: "Pier Clerk" }],
          localityRefs: ["movement_1", "actor:actor_2", "scene:current_scene"],
          privacy: "public",
          playerFacingEligibility: "local_public",
          advisoryText: "The clerk pressure follows the next route if nobody intervenes.",
          advisorySignals: ["visible pressure"],
        },
      ],
      diagnostics: { notes: [] },
    });
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: draft,
      trace: {
        text: "{}",
        cleanedText: "{}",
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    const forecast = await runWorldForecastBuilder({
      provider,
      frame: {
        ...frame,
        roster: {
          ...frame.roster,
          active: [...frame.roster.active, npc],
        },
        targetCandidates: [
          {
            id: "target-clerk",
            actorId: "actor-clerk",
            type: "actor",
            label: "Pier Clerk",
            awareness: "clear",
          },
        ],
        movementCandidates: [
          {
            id: "movement-ramp",
            locationId: "loc-ramp",
            label: "Archive Ramp",
            connected: true,
          },
        ],
      },
    });

    expect(forecast.entries[0]?.subjectRefs[0]?.id).toBe("actor-clerk");
    expect(forecast.entries[0]?.locality).toMatchObject({
      locationRefs: ["loc-ramp"],
      sceneRefs: ["scene-counter"],
      actorRefs: ["actor-clerk"],
    });
    expect(JSON.stringify(forecast)).not.toContain("actor_2");
    expect(JSON.stringify(forecast)).not.toContain("movement_1");
  });

  it("redacts raw backend handles in prior forecast prose before refresh prompting", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: forecastBuilderOutputSchema.parse({
        expiresInTicks: 3,
        entries: [],
        diagnostics: { notes: [] },
      }),
      trace: {
        text: "{}",
        cleanedText: "{}",
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    await runWorldForecastBuilder({
      provider,
      frame: createFrame(),
      priorForecast: worldTrajectoryForecastSchema.parse({
        version: "world-trajectory-forecast.v1",
        campaignId: "campaign-forecast",
        baseTick: 20,
        generatedAtTick: 20,
        expiresAtTick: 25,
        entries: [
          {
            id: "forecast-old",
            baseTick: 20,
            horizonTicks: 3,
            subjectRefs: [{ type: "location", id: "loc-pier", label: "Lantern-Lit Gondola Pier" }],
            confidence: 0.5,
            privacy: "public",
            playerFacingEligibility: "local_public",
            locality: {
              locationRefs: ["loc-pier"],
              sceneRefs: ["scene-counter"],
              actorRefs: ["actor-player"],
            },
            advisoryText:
              "Old bad prose mentions loc-secret-vault, actor:private-handler, and tool-result-abc.",
            preconditions: ["Raw UUID 123e4567-e89b-42d3-a456-426614174000 is present."],
            advisorySignals: [{ label: "route:private-service" }],
            privateTerms: [],
          },
        ],
        diagnostics: { source: "manual", notes: [] },
      }),
    });

    const prompt = String(vi.mocked(safeGenerateObject).mock.calls[0]?.[0]?.prompt ?? "");
    expect(prompt).not.toContain("loc-secret-vault");
    expect(prompt).not.toContain("actor:private-handler");
    expect(prompt).not.toContain("tool-result-abc");
    expect(prompt).not.toContain("123e4567-e89b-42d3-a456-426614174000");
    expect(prompt).toContain("[backend ref hidden]");
  });

  it("omits non-public prior forecast entries from refresh prompts", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: forecastBuilderOutputSchema.parse({
        expiresInTicks: 3,
        entries: [],
        diagnostics: { notes: [] },
      }),
      trace: {
        text: "{}",
        cleanedText: "{}",
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    await runWorldForecastBuilder({
      provider,
      frame: createFrame(),
      priorForecast: worldTrajectoryForecastSchema.parse({
        version: "world-trajectory-forecast.v1",
        campaignId: "campaign-forecast",
        baseTick: 20,
        generatedAtTick: 20,
        expiresAtTick: 25,
        entries: [
          {
            id: "forecast-public",
            baseTick: 20,
            horizonTicks: 3,
            subjectRefs: [{ type: "location", id: "loc-pier", label: "Lantern-Lit Gondola Pier" }],
            confidence: 0.5,
            privacy: "public",
            playerFacingEligibility: "local_public",
            locality: {
              locationRefs: ["loc-pier"],
              sceneRefs: ["scene-counter"],
              actorRefs: ["actor-player"],
            },
            advisoryText: "Public pier pressure remains active.",
            preconditions: [],
            advisorySignals: [{ label: "visible queue pressure" }],
            privateTerms: [],
          },
          {
            id: "forecast-private",
            baseTick: 20,
            horizonTicks: 3,
            subjectRefs: [{ type: "actor", id: "actor-hidden", label: "Hidden Warden" }],
            confidence: 0.7,
            privacy: "private",
            playerFacingEligibility: "never",
            locality: {
              locationRefs: ["loc-pier"],
              sceneRefs: ["scene-counter"],
              actorRefs: ["actor-hidden"],
            },
            advisoryText: "Hidden Warden prepares a private warrant.",
            preconditions: ["private warrant is unsigned"],
            advisorySignals: [{ label: "sealed warrant" }],
            privateTerms: ["Hidden Warden", "private warrant"],
          },
        ],
        diagnostics: { source: "manual", notes: [] },
      }),
    });

    const prompt = String(vi.mocked(safeGenerateObject).mock.calls[0]?.[0]?.prompt ?? "");
    expect(prompt).toContain("Public pier pressure remains active.");
    expect(prompt).toContain("\"omittedNonPublicEntryCount\": 1");
    expect(prompt).not.toContain("Hidden Warden");
    expect(prompt).not.toContain("private warrant");
    expect(prompt).not.toContain("sealed warrant");
    expect(prompt).not.toContain("actor-hidden");
  });

  it("keeps executable payloads out of the draft schema before final forecast validation", () => {
    expect(forecastBuilderOutputSchema.safeParse({
      expiresInTicks: 3,
      entries: [
        {
          subjectRefs: ["location:loc-pier"],
          privacy: "public",
          playerFacingEligibility: "local_public",
          advisoryText: "Pressure rises.",
          plannedTools: [{ toolName: "spawn_npc", input: { locationId: "loc-remote" } }],
        },
      ],
    }).success).toBe(false);
  });

  it("prompts for model-owned forecast meaning instead of entry storage fields", async () => {
    vi.mocked(safeGenerateObject).mockResolvedValueOnce({
      object: forecastBuilderOutputSchema.parse({
        expiresInTicks: 3,
        entries: [],
        diagnostics: { notes: [] },
      }),
      trace: {
        text: "{}",
        cleanedText: "{}",
      },
    } as Awaited<ReturnType<typeof safeGenerateObject>>);

    await runWorldForecastBuilder({
      provider,
      frame: createFrame(),
    });

    const prompt = String(vi.mocked(safeGenerateObject).mock.calls[0]?.[0]?.prompt ?? "");
    expect(prompt).toContain("Backend fills entry id, entry baseTick");
    expect(prompt).toContain("Forecast pressure is a constraint, not a script");
    expect(prompt).toContain("if nobody changes course");
    expect(prompt).toContain("advisorySignals should be perceptual hooks");
    expect(prompt).toContain("\"subjectRefs\"");
    expect(prompt).toContain("\"locality\"");
    expect(prompt).toContain("Do not include entry campaignId");
    expect(prompt).not.toContain("campaignId must equal");
    expect(prompt).toContain("\"ref\": \"current_location\"");
    expect(prompt).toContain("\"ref\": \"current_scene\"");
    expect(prompt).not.toContain("campaign-forecast");
    expect(prompt).not.toContain("loc-pier");
    expect(prompt).not.toContain("scene-counter");
    expect(prompt).not.toContain("actor-player");
  });
});
