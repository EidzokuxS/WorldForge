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
          subjectRefs: ["location:loc-pier"],
          localityRefs: ["location:loc-pier", "scene:scene-counter", "actor:actor-player"],
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
  });
});
