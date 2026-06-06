import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  type AuthoritativeSceneFrame,
  authoritativeSceneFrameSchema,
  type GameplayRuntimeTurnInput,
  type GmRead,
  gmReadSchema,
  gameplayRuntimeTurnInputSchema,
  scopedForecastEnvelopeSchema,
} from "../gameplay-cycle-runtime/contracts.js";
import {
  isCleanGameplayRuntimeEnabled,
  processCleanGameplayTurnFromInput,
} from "../gameplay-cycle-runtime/runtime.js";
import {
  buildGmReadSystemPrompt,
  runCleanGmRead,
  validateGmReadCandidate,
} from "../gameplay-cycle-runtime/gm-read.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";

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
      "gm-turn-decision",
      "gm-turn-read",
      "turn-processor",
      "world-brain",
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

const provider: ProviderConfig = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-key",
  model: "test-model",
};

function minimalFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  const frame: AuthoritativeSceneFrame = {
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
    actors: [{
      ref: "Guide",
      label: "Guide",
      role: "support",
      visibleStatus: { hp: null, conditions: [] },
    }],
    movementOptions: [{
      ref: "North Hall",
      label: "North Hall",
      connected: true,
      travelCost: 1,
    }],
    targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
    inventory: [],
    capabilities: [
      {
        capabilityId: "observe_visible",
        evidenceAuthority: "observation_only",
        allowed: true,
      },
    ],
    citableRefs: ["Player", "Market", "Guide", "North Hall"],
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
  };
  return { ...frame, ...overrides };
}

function validGmRead(frame = minimalFrame()): GmRead {
  return {
    version: "gm-read.v1",
    frameId: frame.frameId,
    turnId: frame.turnId,
    path: "direct",
    situationSummary: "The player is in the current visible scene.",
    liveSceneQuestion: "What does the player observe from here?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", "Market"],
    actionInterpretation: {
      summary: "The player is observing the current scene without changing it.",
      playerIntent: "Observe the scene.",
      method: null,
      targetRefs: ["Market"],
    },
    uncertainty: {
      present: false,
      question: null,
      basis: null,
    },
    interpretationRationale: "The action only asks for current visible context.",
  };
}

function validTurnInput(): GameplayRuntimeTurnInput {
  return gameplayRuntimeTurnInputSchema.parse({
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
      judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
    },
    idempotencyKey: "campaign-1:0:0:clean-turn-1",
  });
}

describe("gameplay-cycle-runtime primitive 2 GM Read contracts", () => {
  it("accepts a strict interpretation without admission, executable, mutation, receipt, or narration authority", () => {
    const parsed = gmReadSchema.parse(validGmRead());

    expect(parsed.version).toBe("gm-read.v1");
    expect(JSON.stringify(parsed)).not.toContain("toolName");
    expect(JSON.stringify(parsed)).not.toContain("requiredEffectKinds");
    expect(JSON.stringify(parsed)).not.toContain("oracleRequest");
    expect(JSON.stringify(parsed)).not.toContain("mutation");
    expect(JSON.stringify(parsed)).not.toContain("receipt");
    expect(JSON.stringify(parsed)).not.toContain("narrativeText");
  });

  it("rejects unknown root fields in Primitive 2 GM Read candidates", () => {
    const candidate = {
      ...validGmRead(),
      hiddenPlan: "smuggled",
    };

    expect(gmReadSchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "toolId",
    "toolName",
    "toolInput",
    "input",
    "payload",
    "args",
    "toolCall",
    "plannedTools",
    "candidateToolRequest",
    "requiredEffectKinds",
    "checklist",
    "oracleAdmission",
    "stateDelta",
    "mutation",
    "receipt",
    "resultWorldVersion",
  ])("rejects recursive executable and admission key %s before accepting GM Read", (key) => {
    const candidate = {
      ...validGmRead(),
      actionInterpretation: {
        ...validGmRead().actionInterpretation,
        extra: [{ [key]: "smuggled" }],
      },
    };

    const result = validateGmReadCandidate({
      frame: minimalFrame(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "execution_payload")).toBe(true);
  });

  it("allows GM Read refs only from SceneFrame.citableRefs and rejects backend refs", () => {
    const candidate = {
      ...validGmRead(),
      focalRefs: ["Hidden Watcher"],
      evidenceRefs: ["actor:abc"],
      actionInterpretation: {
        ...validGmRead().actionInterpretation,
        targetRefs: ["invented gate"],
      },
    };

    const result = validateGmReadCandidate({
      frame: minimalFrame(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "uncited_ref")).toHaveLength(3);
    expect(result.issues.some((issue) => issue.code === "backend_ref")).toBe(true);
  });

  it.each([
    ["situationSummary", (read: GmRead) => ({ ...read, situationSummary: "Hidden Watcher is here." })],
    ["liveSceneQuestion", (read: GmRead) => ({ ...read, liveSceneQuestion: "Is the sealed patron visible?" })],
    ["actionInterpretation.summary", (read: GmRead) => ({
      ...read,
      actionInterpretation: {
        ...read.actionInterpretation,
        summary: "The player notices Hidden Watcher.",
      },
    })],
    ["uncertainty.basis", (read: GmRead) => ({
      ...read,
      uncertainty: {
        present: true,
        question: "Is there pressure?",
        basis: "sealed patron pressure",
      },
    })],
    ["interpretationRationale", (read: GmRead) => ({
      ...read,
      interpretationRationale: "Hidden Watcher would know.",
    })],
  ])("rejects private guard terms in %s", (_name, mutate) => {
    const frame = minimalFrame({
      privateGuards: {
        forbiddenActorLabels: ["Hidden Watcher"],
        forbiddenPrivateTerms: ["sealed patron"],
      },
    });
    const result = validateGmReadCandidate({
      frame,
      candidate: mutate(validGmRead(frame)),
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "private_term")).toBe(true);
  });

  it("keeps the GM Read prompt interpretive instead of admission-oriented", () => {
    const prompt = buildGmReadSystemPrompt();

    expect(prompt).toContain("interpretation only");
    expect(prompt).toContain("must not narrate");
    expect(prompt).toContain("must not");
    expect(prompt).toContain("call tools");
    expect(prompt).toContain("procedural does not authorize");
    expect(prompt).toContain("uncertain does not authorize");
  });

  it("repairs once locally, then accepts only a validated GM Read", async () => {
    const frame = minimalFrame();
    const calls: string[] = [];
    const result = await runCleanGmRead({
      frame,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        if (!request.repairOf) {
          return {
            ...validGmRead(frame),
            payload: { toolId: "movement" },
          };
        }
        return validGmRead(frame);
      },
    });

    expect(calls).toEqual(["initial", "repair"]);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(true);
  });

  it("falls back to a no-mutation clarification read when generation and repair stay invalid", async () => {
    const frame = minimalFrame();
    const result = await runCleanGmRead({
      frame,
      provider,
      generateCandidate: async () => ({
        ...validGmRead(frame),
        toolInput: { effect: "smuggled" },
      }),
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.read.path).toBe("clarification");
    expect(result.read.frameId).toBe(frame.frameId);
  });

  it("runs GM Read after SceneFrame and before frozen projection events", async () => {
    const order: string[] = [];
    const frame = minimalFrame();
    const events = [];

    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => {
        order.push("frame");
        return frame;
      },
      gmReadCandidateGenerator: async () => {
        order.push("gm-read");
        return validGmRead(frame);
      },
    })) {
      events.push(event);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (stage === "scene-frame") order.push("scene-frame-progress");
        if (stage === "gm-read") order.push("gm-read-progress");
      }
    }

    expect(order).toEqual([
      "scene-frame-progress",
      "frame",
      "gm-read-progress",
      "gm-read",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "scene-settling",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
  });
});
