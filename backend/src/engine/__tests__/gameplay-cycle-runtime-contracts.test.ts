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
  type JudgeUncertainty,
  judgeUncertaintySchema,
  oracleSettlementSchema,
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
import {
  buildJudgeUncertaintySystemPrompt,
  runCleanJudgeUncertainty,
  validateJudgeUncertaintyCandidate,
} from "../gameplay-cycle-runtime/judge-uncertainty.js";
import {
  buildOraclePayloadV1,
  runCleanOracleSettlement,
  validateOracleSettlement,
} from "../gameplay-cycle-runtime/oracle-settlement.js";
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

  it("rejects SceneFrame private terms that duplicate public citable refs", () => {
    const frame = minimalFrame({
      privateGuards: {
        forbiddenActorLabels: ["Guide"],
        forbiddenPrivateTerms: ["Market"],
      },
      forecast: {
        ...minimalFrame().forecast,
        forbiddenPrivateTerms: ["North Hall"],
      },
    });

    const result = authoritativeSceneFrameSchema.safeParse(frame);

    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((issue) => issue.path.join("."));
      expect(paths).toContain("privateGuards.forbiddenActorLabels.0");
      expect(paths).toContain("privateGuards.forbiddenPrivateTerms.0");
      expect(paths).toContain("forecast.forbiddenPrivateTerms.0");
    }
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

function validJudgeUncertainty(
  frame = minimalFrame(),
  gmRead = validGmRead(frame),
): JudgeUncertainty {
  return {
    version: "judge-uncertainty.v1",
    judgmentId: "judge-1",
    campaignId: frame.campaignId,
    turnId: frame.turnId,
    frameId: frame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: gmRead.path,
    },
    physicalPossibility: "possible",
    checkNeed: "no_roll_needed",
    nextStep: "settle_no_roll",
    actorRefs: ["Player"],
    targetRefs: ["Market"],
    evidenceRefs: ["Player", "Market"],
    possibilityRationale: "The player can observe the current scene.",
    checkRationale: "Current visible observation does not require a random outcome.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "deterministic_scene_truth",
      explanation: "The action asks for current visible scene truth.",
      evidenceRefs: ["Player", "Market"],
    },
  };
}

function validOracleJudgeUncertainty(
  frame = minimalFrame(),
  gmRead = validGmRead(frame),
): JudgeUncertainty {
  return {
    ...validJudgeUncertainty(frame, gmRead),
    physicalPossibility: "possible_but_uncertain",
    checkNeed: "oracle_roll_needed",
    nextStep: "oracle_roll",
    actorRefs: ["Player"],
    targetRefs: ["Guide"],
    evidenceRefs: ["Player", "Guide", "Market"],
    possibilityRationale: "The player can attempt the risky read.",
    checkRationale: "The visible actor's reaction under pressure is genuinely uncertain.",
    difficulty: {
      tier: "standard",
      basis: "The player is reading a visible actor under pressure.",
      evidenceRefs: ["Player", "Guide"],
    },
    oracleAdmission: {
      admissionId: "oracle-admission-1",
      question: "Does Guide notice the player's subtle action?",
      uncertaintyKind: "perception_under_pressure",
      actorRef: "Player",
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Guide"],
      stakes: "The response determines whether the visible actor reacts now.",
      difficultyTier: "standard",
      outcomeMeanings: {
        strong_hit: "The player acts without Guide noticing.",
        weak_hit: "Guide notices something but does not fully understand it.",
        miss: "Guide notices and reacts immediately.",
      },
      settlementScope: "visible_outcome_only",
      requiresFollowupMutation: false,
    },
    noRollReason: null,
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

  it("runs GM Read after SceneFrame and before Judge/Uncertainty events", async () => {
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
      judgeUncertaintyCandidateGenerator: async () => {
        order.push("judge-uncertainty");
        return validJudgeUncertainty(frame);
      },
    })) {
      events.push(event);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (stage === "scene-frame") order.push("scene-frame-progress");
        if (stage === "gm-read") order.push("gm-read-progress");
        if (stage === "judge-uncertainty") order.push("judge-uncertainty-progress");
      }
    }

    expect(order).toEqual([
      "scene-frame-progress",
      "frame",
      "gm-read-progress",
      "gm-read",
      "judge-uncertainty-progress",
      "judge-uncertainty",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
  });
});

describe("gameplay-cycle-runtime primitive 3 Judge/Uncertainty contracts", () => {
  it("accepts a strict no-roll admission without tools, checklist, receipts, mutation, narration, or Oracle result", () => {
    const parsed = judgeUncertaintySchema.parse(validJudgeUncertainty());

    expect(parsed.version).toBe("judge-uncertainty.v1");
    expect(parsed.nextStep).toBe("settle_no_roll");
    expect(parsed.oracleAdmission).toBeNull();
    expect(parsed.noRollReason?.code).toBe("deterministic_scene_truth");
    expect(JSON.stringify(parsed)).not.toContain("toolName");
    expect(JSON.stringify(parsed)).not.toContain("requiredEffectKinds");
    expect(JSON.stringify(parsed)).not.toContain("oracleResult");
    expect(JSON.stringify(parsed)).not.toContain("mutation");
    expect(JSON.stringify(parsed)).not.toContain("receipt");
    expect(JSON.stringify(parsed)).not.toContain("narrativeText");
  });

  it("accepts backend action-plan admission without importing effect or tool payload ownership", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "procedural" as const,
    };
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "procedural",
      },
      checkNeed: "backend_action_plan_needed",
      nextStep: "action_plan",
      checkRationale: "The action needs backend-owned receipts later, not a roll.",
      noRollReason: {
        code: "backend_receipt_required",
        explanation: "Consequences need later action planning.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("accepted");
    expect(JSON.stringify(candidate)).not.toContain("toolId");
    expect(JSON.stringify(candidate)).not.toContain("effectKind");
  });

  it("accepts a true Oracle admission but does not include a roll or selected outcome", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const candidate = validOracleJudgeUncertainty(frame, gmRead);

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("accepted");
    expect(candidate.oracleAdmission?.outcomeMeanings.strong_hit).toContain("without Guide noticing");
    expect(JSON.stringify(candidate)).not.toContain("selectedOutcome");
    expect(JSON.stringify(candidate)).not.toContain("outcomeTier");
  });

  it("accepts gm-read uncertain as a signal without forcing an Oracle admission", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
      uncertainty: {
        present: true,
        question: "Is anything uncertain?",
        basis: "The interpreter was not certain.",
      },
    };
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "uncertain",
      },
      noRollReason: {
        code: "gm_read_uncertain_signal_only",
        explanation: "The Judge found no true rollable uncertainty in the current frame.",
        evidenceRefs: ["Player", "Market"],
      },
    };

    expect(validateJudgeUncertaintyCandidate({ frame, gmRead, candidate }).status).toBe("accepted");
  });

  it("rejects unknown root fields in Primitive 3 Judge/Uncertainty candidates", () => {
    const candidate = {
      ...validJudgeUncertainty(),
      hiddenPlan: "smuggled",
    };

    expect(judgeUncertaintySchema.safeParse(candidate).success).toBe(false);
  });

  it.each([
    "toolId",
    "toolName",
    "toolInput",
    "payload",
    "args",
    "toolCall",
    "plannedTools",
    "candidateToolRequest",
    "requiredEffectKinds",
    "checklist",
    "checklistAdmission",
    "lane",
    "stateDelta",
    "mutation",
    "receipt",
    "narrativeText",
    "oracleResult",
    "roll",
    "chance",
    "selectedOutcome",
  ])("rejects recursive settlement/executable key %s before accepting Judge/Uncertainty", (key) => {
    const candidate = {
      ...validJudgeUncertainty(),
      noRollReason: {
        ...validJudgeUncertainty().noRollReason,
        extra: [{ [key]: "smuggled" }],
      },
    };

    const result = validateJudgeUncertaintyCandidate({
      frame: minimalFrame(),
      gmRead: validGmRead(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "settlement_payload")).toBe(true);
  });

  it("allows Judge/Uncertainty refs only from SceneFrame.citableRefs and rejects backend refs", () => {
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(),
      actorRefs: ["actor:abc"],
      targetRefs: ["invented gate"],
      evidenceRefs: ["Hidden Watcher"],
    };

    const result = validateJudgeUncertaintyCandidate({
      frame: minimalFrame(),
      gmRead: validGmRead(),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "uncited_ref")).toHaveLength(3);
    expect(result.issues.some((issue) => issue.code === "backend_ref")).toBe(true);
  });

  it("rejects private guard terms in public Judge/Uncertainty fields", () => {
    const frame = minimalFrame({
      privateGuards: {
        forbiddenActorLabels: ["Hidden Watcher"],
        forbiddenPrivateTerms: ["sealed patron"],
      },
    });
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame),
      possibilityRationale: "Hidden Watcher is relevant.",
      checkRationale: "The sealed patron would know.",
    };

    const result = validateJudgeUncertaintyCandidate({
      frame,
      gmRead: validGmRead(frame),
      candidate,
    });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "private_term")).toBe(true);
  });

  it("rejects frame, turn, and GM Read linkage mismatches", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      frameId: "other-frame",
      source: {
        sceneFrameVersion: "scene-frame.v1",
        gmReadVersion: "gm-read.v1",
        gmReadPath: "procedural",
      },
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.filter((issue) => issue.code === "frame_mismatch").length).toBeGreaterThanOrEqual(2);
  });

  it("rejects Oracle branch without full Oracle admission and difficulty invariants", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      checkNeed: "oracle_roll_needed",
      nextStep: "oracle_roll",
      physicalPossibility: "possible_but_uncertain",
      noRollReason: null,
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.path === "difficulty")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "oracleAdmission")).toBe(true);
  });

  it("normalizes omitted nullable branch fields before validating Oracle admission", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const { noRollReason: _omitted, ...oracleCandidate } = validOracleJudgeUncertainty(frame, gmRead);

    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => oracleCandidate,
    });

    expect(result.status).toBe("accepted");
    expect(result.judgment.nextStep).toBe("oracle_roll");
    expect(result.judgment.noRollReason).toBeNull();
  });

  it("rejects non-Oracle branches that smuggle Oracle admission or difficulty", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const oracle = validOracleJudgeUncertainty(frame, gmRead);
    const candidate: JudgeUncertainty = {
      ...validJudgeUncertainty(frame, gmRead),
      oracleAdmission: oracle.oracleAdmission,
      difficulty: oracle.difficulty,
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.path === "oracleAdmission")).toBe(true);
    expect(result.issues.some((issue) => issue.path === "difficulty")).toBe(true);
  });

  it("rejects impossible actions that try to roll or action-plan", () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const candidate: JudgeUncertainty = {
      ...validOracleJudgeUncertainty(frame, gmRead),
      physicalPossibility: "impossible",
    };

    const result = validateJudgeUncertaintyCandidate({ frame, gmRead, candidate });

    expect(result.status).toBe("rejected");
    expect(result.issues.some((issue) => issue.code === "branch_invalid")).toBe(true);
  });

  it("keeps the Judge/Uncertainty prompt admission-only and non-settling", () => {
    const prompt = buildJudgeUncertaintySystemPrompt();

    expect(prompt).toContain("admission layer");
    expect(prompt).toContain("must not narrate");
    expect(prompt).toContain("mutate state");
    expect(prompt).toContain("roll dice");
    expect(prompt).toContain("gm-read uncertain is a signal");
    expect(prompt).toContain("backend-owned consequences");
  });

  it("repairs once locally, then accepts only a validated Judge/Uncertainty packet", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const calls: string[] = [];
    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async (request) => {
        calls.push(request.repairOf ? "repair" : "initial");
        if (!request.repairOf) {
          return {
            ...validJudgeUncertainty(frame, gmRead),
            toolInput: { effect: "smuggled" },
          };
        }
        return validJudgeUncertainty(frame, gmRead);
      },
    });

    expect(calls).toEqual(["initial", "repair"]);
    expect(result.status).toBe("accepted");
    expect(result.repairAttempted).toBe(true);
  });

  it("falls back to a no-mutation clarification when generation and repair stay invalid", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    const result = await runCleanJudgeUncertainty({
      frame,
      gmRead,
      provider,
      generateCandidate: async () => ({
        ...validJudgeUncertainty(frame, gmRead),
        oracleResult: { tier: "strong_hit" },
      }),
    });

    expect(result.status).toBe("fallback_clarification");
    expect(result.judgment.nextStep).toBe("ask_clarification");
    expect(result.judgment.oracleAdmission).toBeNull();
  });

  it("skips Judge/Uncertainty when GM Read falls back before admission", async () => {
    const order: string[] = [];
    const frame = minimalFrame();

    for await (const event of processCleanGameplayTurnFromInput({
      turn: validTurnInput(),
      judgeProvider: provider,
      buildFrame: async () => frame,
      gmReadCandidateGenerator: async () => ({
        ...validGmRead(frame),
        toolInput: { effect: "invalid" },
      }),
      judgeUncertaintyCandidateGenerator: async () => {
        order.push("judge-called");
        return validJudgeUncertainty(frame);
      },
    })) {
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") order.push(stage);
      }
    }

    expect(order).toEqual(["scene-frame", "gm-read"]);
  });
});

describe("gameplay-cycle-runtime primitive 4 Oracle Roll/Settlement contracts", () => {
  it.each([
    ["strong_hit", "The player acts without Guide noticing."],
    ["weak_hit", "Guide notices something but does not fully understand it."],
    ["miss", "Guide notices and reacts immediately."],
  ] as const)("settles %s by selecting the predeclared admission meaning", async (outcome, expectedMeaning) => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: `oracle-${outcome}`,
      adapter: async () => ({
        chance: 65,
        roll: outcome === "strong_hit" ? 10 : outcome === "weak_hit" ? 50 : 90,
        outcome,
        reasoning: "Adapter resolved the admitted visible uncertainty.",
      }),
    });

    expect(result.status).toBe("settled");
    if (result.status !== "settled") throw new Error("expected settled");
    expect(result.settlement.version).toBe("oracle-settlement.v1");
    expect(result.settlement.authority.evidenceAuthority).toBe("oracle_settlement");
    expect(result.settlement.authority.mutationAuthority).toBe("none");
    expect(result.settlement.selectedMeaning.text).toBe(expectedMeaning);
    expect(result.settlement.visibleOutcome.selectedMeaning).toBe(expectedMeaning);
    expect(result.publicEvent).toEqual({
      type: "oracle_result",
      data: { outcome },
    });
    expect(JSON.stringify(result.publicEvent)).not.toContain("chance");
    expect(JSON.stringify(result.publicEvent)).not.toContain("roll");
  });

  it("builds OraclePayload from SceneFrame, GM Read, and P57 admission without old packet coupling", () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);

    const payload = buildOraclePayloadV1({ frame, gmRead, judgment });

    expect(payload.intent).toBe(judgment.oracleAdmission?.question);
    expect(payload.actorTags).toContain("Player");
    expect(payload.targetTags).toContain("Guide");
    expect(payload.environmentTags.some((tag) => tag.includes("current-scene:Market"))).toBe(true);
    expect(payload.sceneContext).toContain("Strong hit means:");
    expect(payload.sceneContext).toContain("Evidence refs:");
    expect(JSON.stringify(payload)).not.toContain("ModelFacingTurnPacketV2");
    expect(JSON.stringify(payload)).not.toContain("receipt");
    expect(JSON.stringify(payload)).not.toContain("toolId");
  });

  it("refuses to run when P57 did not admit an Oracle roll", async () => {
    const frame = minimalFrame();
    const gmRead = validGmRead(frame);
    let adapterCalls = 0;

    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment: validJudgeUncertainty(frame, gmRead),
      provider,
      settlementId: "oracle-not-applicable",
      adapter: async () => {
        adapterCalls += 1;
        return {
          chance: 50,
          roll: 50,
          outcome: "weak_hit",
          reasoning: "should not happen",
        };
      },
    });

    expect(result.status).toBe("not_applicable");
    expect(adapterCalls).toBe(0);
  });

  it("falls back to conservative miss after adapter generation failure without fake chance or roll", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-fallback",
      adapter: async () => {
        throw new Error("adapter offline");
      },
    });

    expect(result.status).toBe("settled_with_fallback");
    if (result.status !== "settled_with_fallback") throw new Error("expected fallback");
    expect(result.settlement.adapter.result.status).toBe("fallback");
    expect(result.settlement.visibleOutcome.outcome).toBe("miss");
    expect(result.settlement.selectedMeaning.text).toBe(judgment.oracleAdmission?.outcomeMeanings.miss);
    expect(JSON.stringify(result.settlement.adapter.result)).not.toContain("chance");
    expect(JSON.stringify(result.settlement.adapter.result)).not.toContain("roll");
    expect(result.settlement.failure?.hiddenMutationApplied).toBe(false);
  });

  it("falls back to conservative miss after invalid adapter output", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-invalid-output",
      adapter: async () => ({
        chance: 0,
        roll: 101,
        outcome: "weak_hit",
        reasoning: "invalid",
      }),
    });

    expect(result.status).toBe("settled_with_fallback");
    if (result.status !== "settled_with_fallback") throw new Error("expected fallback");
    expect(result.settlement.failure?.kind).toBe("invalid_adapter_output");
    expect(result.settlement.visibleOutcome.outcome).toBe("miss");
  });

  it("rejects settlement selected meaning mismatches and forbidden materialization claims", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = {
      ...validOracleJudgeUncertainty(frame, gmRead),
      oracleAdmission: {
        ...validOracleJudgeUncertainty(frame, gmRead).oracleAdmission!,
        outcomeMeanings: {
          strong_hit: "The player arrives at Guide's hidden room.",
          weak_hit: "Guide visibly notices something.",
          miss: "Guide visibly reacts immediately.",
        },
      },
    };
    const run = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-forbidden-claim",
      adapter: async () => ({
        chance: 50,
        roll: 10,
        outcome: "strong_hit",
        reasoning: "valid adapter result",
      }),
    });

    expect(run.status).toBe("not_applicable");
    if (run.status !== "not_applicable") throw new Error("expected rejection");
    expect(run.issues.some((issue) => issue.code === "forbidden_claim")).toBe(true);
  });

  it("validates oracle-settlement.v1 schema and selected meaning equality", async () => {
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
    const result = await runCleanOracleSettlement({
      frame,
      gmRead,
      judgment,
      provider,
      settlementId: "oracle-schema",
      adapter: async () => ({
        chance: 50,
        roll: 10,
        outcome: "strong_hit",
        reasoning: "valid adapter result",
      }),
    });
    if (result.status !== "settled") throw new Error("expected settled");
    const settlement = {
      ...result.settlement,
      selectedMeaning: {
        ...result.settlement.selectedMeaning,
        text: "wrong meaning",
      },
    };

    expect(oracleSettlementSchema.safeParse(result.settlement).success).toBe(true);
    const validation = validateOracleSettlement({ frame, gmRead, judgment, settlement });
    expect(validation.status).toBe("rejected");
    expect(validation.issues.some((issue) => issue.code === "selected_meaning_mismatch")).toBe(true);
  });

  it("composes Oracle settlement after Judge admission and before frozen projection events", async () => {
    const order: string[] = [];
    const frame = minimalFrame();
    const gmRead = {
      ...validGmRead(frame),
      path: "uncertain" as const,
    };
    const judgment = validOracleJudgeUncertainty(frame, gmRead);
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
        return gmRead;
      },
      judgeUncertaintyCandidateGenerator: async () => {
        order.push("judge-uncertainty");
        return judgment;
      },
      oracleAdapter: async () => {
        order.push("oracle-adapter");
        return {
          chance: 65,
          roll: 10,
          outcome: "strong_hit",
          reasoning: "Adapter resolved the admitted visible uncertainty.",
        };
      },
    })) {
      events.push(event);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") order.push(`${stage}-progress`);
      }
      if (event.type === "oracle_result") order.push("oracle_result");
    }

    expect(order).toEqual([
      "scene-frame-progress",
      "frame",
      "gm-read-progress",
      "gm-read",
      "judge-uncertainty-progress",
      "judge-uncertainty",
      "oracle-roll-progress",
      "oracle-adapter",
      "oracle_result",
      "oracle-settlement-progress",
    ]);
    expect(events.map((event) => event.type)).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "oracle_result",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
    const oracleEvent = events.find((event) => event.type === "oracle_result");
    expect(oracleEvent?.data).toEqual({ outcome: "strong_hit" });
  });
});
