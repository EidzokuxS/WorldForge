import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  authoritativeSceneFrameSchema,
  gameplayRuntimeTurnInputSchema,
  scopedForecastEnvelopeSchema,
} from "../gameplay-cycle-runtime/contracts.js";
import { isCleanGameplayRuntimeEnabled } from "../gameplay-cycle-runtime/runtime.js";

const runtimeDir = join(process.cwd(), "src", "engine", "gameplay-cycle-runtime");

function runtimeSources(): Array<{ path: string; text: string }> {
  return readdirSync(runtimeDir)
    .filter((file) => file.endsWith(".ts"))
    .map((file) => {
      const path = join(runtimeDir, file);
      return { path, text: readFileSync(path, "utf8") };
    });
}

describe("gameplay-cycle-runtime primitive 0/1 contracts", () => {
  it("keeps the clean runtime import graph fenced from v1/v2 and old tool-loop owners", () => {
    const forbidden = [
      "gameplay-cycle-v2",
      "gameplay-turn-cycle-v1",
      "turn-processor",
      "gm-tool-loop",
      "tool-executor",
      "tool-schemas",
      "runtime-tool-input-schemas",
      "runtime-tool-descriptors",
    ];

    for (const source of runtimeSources()) {
      for (const token of forbidden) {
        expect(source.text, `${source.path} must not import or cite ${token}`).not.toContain(token);
      }
    }
  });

  it("uses a clean-runtime flag independent from the old gameplay-cycle-v2 flag", () => {
    const previousClean = process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN;
    const previousV2 = process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2;
    try {
      delete process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN;
      process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2 = "true";
      expect(isCleanGameplayRuntimeEnabled()).toBe(false);

      process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN = "true";
      process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2 = "false";
      expect(isCleanGameplayRuntimeEnabled()).toBe(true);
    } finally {
      if (previousClean === undefined) delete process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN;
      else process.env.WORLDFORGE_GAMEPLAY_RUNTIME_CLEAN = previousClean;
      if (previousV2 === undefined) delete process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2;
      else process.env.WORLDFORGE_GAMEPLAY_CYCLE_V2 = previousV2;
    }
  });

  it("accepts a Primitive 0 turn input without legacy intent/method or tool payloads", () => {
    const parsed = gameplayRuntimeTurnInputSchema.parse({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: "campaign-1",
      turnId: "clean-turn-1",
      playerAction: {
        submitted: "I look around.",
        normalized: "I look around.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: "snapshot-dir",
          capturedAt: 1,
        },
      },
      providers: {
        judge: { id: "openai", model: "gpt-test", baseUrl: null },
        storyteller: { id: "openai", model: "gpt-test", baseUrl: null },
      },
      idempotencyKey: "campaign-1:0:0:clean-turn-1",
    });

    expect(parsed).not.toHaveProperty("intent");
    expect(parsed).not.toHaveProperty("method");
    expect(JSON.stringify(parsed)).not.toContain("toolId");
  });

  it("makes scoped forecast advisory and non-authoritative by schema", () => {
    const parsed = scopedForecastEnvelopeSchema.parse({
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    });

    expect(parsed.advisoryOnly).toBe(true);
    expect(parsed.mayAuthorizeMutation).toBe(false);
    expect(parsed.maySupportNarrationClaim).toBe(false);
  });

  it("requires SceneFrame refs and capabilities to live in the authoritative frame contract", () => {
    const parsed = authoritativeSceneFrameSchema.parse({
      version: "scene-frame.v1",
      frameId: "frame-1",
      campaignId: "campaign-1",
      turnId: "clean-turn-1",
      base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
      playerAction: "I look around.",
      player: {
        ref: "Player",
        label: "Player",
        visibleStatus: { hp: null, conditions: [] },
      },
      scene: {
        currentLocation: { ref: "Market", label: "Market", description: null },
        currentScene: { ref: "Market", label: "Market", description: null },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      actors: [],
      movementOptions: [],
      targets: [],
      inventory: [],
      capabilities: [
        {
          capabilityId: "observe_visible",
          evidenceAuthority: "observation_only",
          allowed: true,
        },
      ],
      citableRefs: ["Player", "Market"],
      privateGuards: {
        forbiddenActorLabels: [],
        forbiddenPrivateTerms: [],
      },
      forecast: {
        version: "scoped-forecast.v1",
        advisoryOnly: true,
        sourceStatus: "empty_missing",
        mayAuthorizeMutation: false,
        maySupportNarrationClaim: false,
        entries: [],
        forbiddenPrivateTerms: [],
      },
    });

    expect(parsed.citableRefs).toContain("Player");
    expect(parsed.capabilities[0]?.capabilityId).toBe("observe_visible");
  });
});

