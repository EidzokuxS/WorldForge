import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import { safeGenerateObject, type SafeGenerateTrace } from "../ai/generate-object-safe.js";
import {
  createCampaignPlayGameMaster,
  type CampaignPlayGameMasterFrame,
} from "./game-master.js";
import type { CampaignPlayJudgeRuling, CampaignPlayUncertaintyResolution } from "./contracts.js";
import { resolveCampaignPlayUncertainty, type CampaignPlayModelBudget } from "./judge.js";

const CAMPAIGN_ID = "campaign-game-master";
const TURN_ID = "turn-action";
const PLAYER_ID = "actor-player";

function world(): CampaignWorldReview {
  return {
    campaignId: CAMPAIGN_ID,
    status: "accepted",
    version: 3,
    contentHash: "a".repeat(64),
    sourceDigest: "b".repeat(64),
    worldSummary: "Two harbors share a guarded passage.",
    locations: [
      { id: "location-a", name: "North Harbor", description: "A guarded harbor.", kind: "macro",
        parentLocationId: null, tags: ["harbor"], isStarting: true },
      { id: "location-b", name: "South Harbor", description: "A market beyond the passage.", kind: "macro",
        parentLocationId: null, tags: ["market"], isStarting: false },
    ],
    routes: [{ id: "route-a-b", fromLocationId: "location-a", toLocationId: "location-b", travelCost: 5 }],
    actors: [
      { id: "actor-guard", kind: "person", controller: "agent", role: "support", name: "Oren Tide",
        summary: "A guard at the northern gate.", traits: ["observant"], tags: ["guard"] },
    ],
    goals: [{ id: "goal-guard", actorId: "actor-guard", objective: "Keep the route orderly.",
      motivation: "Protect the harbor.", horizon: "immediate", priority: 4, status: "active" }],
    relations: [{ id: "relation-player-guard", sourceActorId: PLAYER_ID, targetActorId: "actor-guard",
      relationType: "association", intensity: 1, summary: "They have just met." }],
    placements: [{ id: "placement-guard", actorId: "actor-guard", locationId: "location-a", placementKind: "present" }],
    pressures: [{ id: "pressure-passage", name: "Passage Delay", description: "Travel is slowing.",
      trajectory: "The gate may close.", urgency: 4, actorIds: ["actor-guard"], locationIds: ["location-a", "location-b"] }],
    builtAt: 1_000,
    acceptedAt: 2_000,
    source: { premise: "A traveler reaches a guarded route.", dna: null, researchSummary: null, sourceReferences: [] },
  };
}

function frame(): CampaignPlayGameMasterFrame {
  return {
    visibleFacts: [
      { handle: "you", kind: "actor", summary: "You stand by the gate." },
      { handle: "guard", kind: "actor", summary: "A guard waits nearby." },
      { handle: "here", kind: "location", summary: "North Harbor gate." },
      { handle: "south", kind: "location", summary: "South Harbor beyond the route." },
      { handle: "passage", kind: "route", summary: "An open guarded route." },
      { handle: "delay", kind: "pressure", summary: "Passage delays are mounting." },
      { handle: "trust", kind: "relation", summary: "A new acquaintance." },
      { handle: "guard-goal", kind: "goal", summary: "The guard wants order." },
    ],
    handleBindings: [
      { handle: "you", reference: { kind: "actor", id: PLAYER_ID } },
      { handle: "guard", reference: { kind: "actor", id: "actor-guard" } },
      { handle: "here", reference: { kind: "location", id: "location-a" } },
      { handle: "south", reference: { kind: "location", id: "location-b" } },
      { handle: "passage", reference: { kind: "route", id: "route-a-b" } },
      { handle: "delay", reference: { kind: "pressure", id: "pressure-passage" } },
      { handle: "trust", reference: { kind: "relation", id: "relation-player-guard" } },
      { handle: "guard-goal", reference: { kind: "goal", id: "goal-guard" } },
    ],
    rulebookFrame: {
      campaignId: CAMPAIGN_ID,
      acceptedWorldVersion: 3,
      acceptedContentHash: "a".repeat(64),
      setupPhase: "ready",
      worldVersion: 7,
      worldTimeMinutes: 10,
      human: { actorId: PLAYER_ID, recordHash: "c".repeat(64) },
      acceptedWorld: world(),
      routeStates: [],
      actorConditions: [],
      pressureStates: [{ pressureId: "pressure-passage", progress: 40, status: "active", lastAdvancedWorldTimeMinutes: 0 }],
      placements: [
        { placementId: "placement-player", actorId: PLAYER_ID, locationId: "location-a", placementKind: "present" },
        { placementId: "placement-guard", actorId: "actor-guard", locationId: "location-a", placementKind: "present" },
      ],
      relations: [{ relationId: "relation-player-guard", sourceActorId: PLAYER_ID, targetActorId: "actor-guard",
        relationType: "association", intensity: 1, summary: "They have just met." }],
      goals: [{ goalId: "goal-guard", actorId: "actor-guard", status: "active", priority: 4,
        objective: "Keep the route orderly.", motivation: "Protect the harbor." }],
    },
    authority: {
      purpose: "player_action",
      turnId: TURN_ID,
      actorId: PLAYER_ID,
      rootParent: { kind: "turn", turnId: TURN_ID },
      authorizedRefs: [
        { kind: "actor", id: PLAYER_ID }, { kind: "actor", id: "actor-guard" },
        { kind: "location", id: "location-a" }, { kind: "location", id: "location-b" },
        { kind: "route", id: "route-a-b" }, { kind: "pressure", id: "pressure-passage" },
        { kind: "relation", id: "relation-player-guard" }, { kind: "goal", id: "goal-guard" },
      ],
      witnessActorIds: ["actor-guard"],
      knownWorldEventIds: [],
    },
  };
}

function ruling(overrides: Partial<CampaignPlayJudgeRuling> = {}): CampaignPlayJudgeRuling {
  return {
    disposition: "deterministic",
    normalizedIntent: {
      originalText: "I ask the guard why the road is closed.", source: "freeform", choiceHandle: null,
      kind: "contact", targets: [{ handle: "guard", kind: "actor" }], method: "Ask calmly", stakes: "Learn the reason",
    },
    citedVisibleFactHandles: ["guard", "passage"],
    resultBounds: { minimum: "success", maximum: "success" },
    elapsedBounds: { minimumMinutes: 1, maximumMinutes: 3 },
    uncertainty: { kind: "none" },
    reason: "The guard can answer.",
    clarificationQuestion: null,
    ...overrides,
  };
}

const resolution: CampaignPlayUncertaintyResolution = { kind: "deterministic", result: "success" };
const proposal = {
  elapsedMinutes: 1,
  effects: [{
    kind: "record_world_event" as const,
    eventClass: "dialogue" as const,
    summary: "The player asks the guard about the passage.",
    affectedHandles: ["you", "guard"],
    exposure: { mode: "projectable" as const, predicates: [{ channel: "direct_perception" as const, anchorHandle: "here" }] },
  }],
};

function model(): LanguageModel {
  const value = {} as LanguageModel;
  rememberStructuredOutputModelMetadata(value, buildStructuredOutputModelMetadata({
    providerId: "test-provider", providerName: "Test Provider", model: "test-model",
    protocol: "openai-compatible", baseUrl: "https://example.invalid/v1", transport: "chat-completions",
  }));
  return value;
}

function trace(strategy: SafeGenerateTrace["strategy"] = "native_schema"): SafeGenerateTrace {
  return {
    text: "private", cleanedText: "private", requestedMode: "auto", strategy,
    primaryStrategy: "native_schema", fallbackStrategy: "text_fallback",
    capability: { requestedMode: "auto", primaryStrategy: "native_schema", fallbackStrategy: "text_fallback",
      actualMode: "native_schema", reason: "test", providerId: "test-provider",
      providerName: "Test Provider", model: "test-model" },
    usage: { inputTokens: 100, outputTokens: 80, totalTokens: 180 },
    response: { modelId: "test-model" }, finishReason: "stop",
  };
}

const budget: CampaignPlayModelBudget = {
  maximumDurationMs: 10_000, maximumInputTokens: 1_000, maximumOutputTokens: 1_000,
  maximumTotalTokens: 2_000, maximumCostMicros: 10_000,
  inputCostMicrosPerMillionTokens: 1_000_000, outputCostMicrosPerMillionTokens: 2_000_000,
};

describe("Campaign Play Game Master", () => {
  it("compiles an open action into deterministic IDs, scopes, causal order, and accepted Rulebook commands", () => {
    const first = createCampaignPlayGameMaster().compile(frame(), ruling(), resolution, null, proposal);
    const second = createCampaignPlayGameMaster().compile(structuredClone(frame()), ruling(), resolution, null, structuredClone(proposal));
    expect(first.batch).toEqual(second.batch);
    expect(first.batchHash).toBe(second.batchHash);
    expect(first.preflight.accepted).toBe(true);
    expect(first.batch.commands).toHaveLength(2);
    expect(first.batch.commands[0]).toMatchObject({ kind: "advance_world_time", elapsedMinutes: 1, order: 0,
      source: { kind: "system", system: "game_master" }, expectedWorldVersion: 7 });
    expect(first.batch.commands[1]).toMatchObject({ kind: "record_world_event", order: 1,
      expectedWorldVersion: 8, readScope: [{ kind: "actor", id: PLAYER_ID }, { kind: "actor", id: "actor-guard" }] });
    expect(first.batch.commands[1]!.causalParent).toEqual({ kind: "command", commandId: first.batch.commands[0]!.commandId });
  });

  it("uses one strict provider/model call and keeps canonical bindings out of its prompt", async () => {
    const generateObject = vi.fn(async (_options: Parameters<typeof safeGenerateObject>[0]) => ({ object: proposal, trace: trace() }));
    const gameMaster = createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject });
    const result = await gameMaster.plan({ frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget });
    expect(result.preflight.accepted).toBe(true);
    expect(generateObject).toHaveBeenCalledOnce();
    const options = generateObject.mock.calls[0]![0];
    expect(options).toMatchObject({ strictSchema: true, allowRepair: false, allowTextFallback: false,
      retries: 1, timeout: budget.maximumDurationMs, abortSignal: expect.any(AbortSignal) });
    expect(String(options.prompt)).toContain("opaque handles");
    expect(String(options.prompt)).toContain(
      'ALLOWED_HANDLES=["you","guard","here","south","passage","delay","trust","guard-goal"]',
    );
    expect(String(options.prompt)).toContain(
      'HANDLES_BY_KIND={"actor":["you","guard"],"location":["here","south"],"route":["passage"],"pressure":["delay"],"relation":["trust"],"goal":["guard-goal"]}',
    );
    expect(String(options.prompt)).toContain("This includes affectedHandles");
    expect(String(options.prompt)).toContain("every exposure predicate anchorHandle");
    expect(String(options.prompt)).toContain("route_state anchorHandle requires route");
    expect(String(options.prompt)).toContain("witness_report anchorHandle requires actor");
    expect(String(options.prompt)).toContain("Resolve only the exact PLAYER_INTENT");
    expect(String(options.prompt)).toContain("does not turn an unfamiliar actor into a fully cooperative informant");
    expect(String(options.prompt)).toContain("Never return an empty effects array");
    expect(String(options.prompt)).toContain("eventClass discovery");
    expect(String(options.prompt)).not.toContain("actor-player");
    expect(String(options.prompt)).not.toContain("actor-guard");
  });

  it("binds every recorded player-action event to the player actor", () => {
    const withoutPlayer = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        affectedHandles: ["guard"],
      }],
    };
    const result = createCampaignPlayGameMaster().compile(
      frame(),
      ruling(),
      resolution,
      null,
      withoutPlayer,
    );
    expect(result.batch.commands[1]).toMatchObject({
      kind: "record_world_event",
      affectedRefs: [
        { kind: "actor", id: "actor-guard" },
        { kind: "actor", id: PLAYER_ID },
      ],
      readScope: [
        { kind: "actor", id: "actor-guard" },
        { kind: "actor", id: PLAYER_ID },
      ],
    });
  });

  it("aborts one provider attempt at the admitted Game Master deadline", async () => {
    const generateObject = vi.fn((options: Parameters<typeof safeGenerateObject>[0]) =>
      new Promise((_resolve, reject) => {
        options.abortSignal?.addEventListener("abort", () => reject(new Error("deadline")), {
          once: true,
        });
      }));
    const gameMaster = createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });
    await expect(gameMaster.plan({
      frame: frame(),
      ruling: ruling(),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget: { ...budget, maximumDurationMs: 5 },
    })).rejects.toMatchObject({ code: "stage_timeout" });
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("rejects impossible and clarification rulings before any GM model call", async () => {
    const generateObject = vi.fn();
    const gameMaster = createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject });
    for (const disposition of ["impossible", "clarification_required"] as const) {
      await expect(gameMaster.plan({
        frame: frame(),
        ruling: ruling({ disposition, resultBounds: { minimum: "no_effect", maximum: "no_effect" },
          clarificationQuestion: disposition === "clarification_required" ? "Which gate?" : null }),
        resolution: { kind: "deterministic", result: "no_effect" }, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget,
      })).rejects.toMatchObject({ code: "no_effect_ruling" });
    }
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("rejects hidden handles, unsupported effects, elapsed violations, and results outside Judge bounds", () => {
    const gameMaster = createCampaignPlayGameMaster();
    expect(() => gameMaster.compile(frame(), ruling(), resolution, null, {
      ...proposal, effects: [{ ...proposal.effects[0], affectedHandles: ["hidden-actor"] }],
    })).toThrowError(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => gameMaster.compile(frame(), ruling(), resolution, null, {
      ...proposal, effects: [{ kind: "delete_actor", actorHandle: "guard", exposure: { mode: "protected" } }],
    })).toThrowError(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => gameMaster.compile(frame(), ruling(), resolution, null, { ...proposal, elapsedMinutes: 4 }))
      .toThrowError(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => gameMaster.compile(frame(), ruling(), { kind: "deterministic", result: "setback" }, null, proposal))
      .toThrowError(expect.objectContaining({ code: "ruling_invalid" }));
  });

  it("authenticates uncertain resolution from code-owned seed material before any GM model call", async () => {
    const uncertain = ruling({
      disposition: "uncertain",
      resultBounds: { minimum: "setback", maximum: "success" },
      uncertainty: { kind: "check", dieSides: 20, difficulty: 12, modifierMinimum: -2, modifierMaximum: 3 },
    });
    const uncertaintyAuthority = { seedMaterial: "server-secret:turn-action:attempt-one", modifier: 1 };
    const rolled = resolveCampaignPlayUncertainty({ ruling: uncertain, ...uncertaintyAuthority });
    expect(createCampaignPlayGameMaster().compile(
      frame(), uncertain, rolled, uncertaintyAuthority, proposal,
    ).preflight.accepted).toBe(true);

    const generateObject = vi.fn();
    const gameMaster = createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject });
    await expect(gameMaster.plan({
      frame: frame(), ruling: uncertain,
      resolution: { kind: "deterministic", result: "success" },
      uncertaintyAuthority,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "ruling_invalid" });
    if (rolled.kind !== "rolled") throw new Error("expected rolled fixture");
    await expect(gameMaster.plan({
      frame: frame(), ruling: uncertain,
      resolution: { ...rolled, roll: rolled.roll === 20 ? 19 : rolled.roll + 1,
        total: rolled.total === 30 ? 29 : rolled.total + 1 },
      uncertaintyAuthority,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "ruling_invalid" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it.each([
    { kind: "move_actor", actorHandle: "you", routeHandle: "passage", fromLocationHandle: "here", toLocationHandle: "south",
      exposure: { mode: "projectable", predicates: [{ channel: "direct_perception", anchorHandle: "here" }] } },
    { kind: "set_route_state", routeHandle: "passage", state: "restricted", reason: "The guard delays passage.",
      exposure: { mode: "projectable", predicates: [{ channel: "route_state", anchorHandle: "passage", triggers: ["inspect"] }] } },
    { kind: "set_actor_condition", actorHandle: "guard", condition: "occupied", operation: "set", summary: "The guard checks papers.",
      exposure: { mode: "projectable", predicates: [{ channel: "direct_perception", anchorHandle: "here" }] } },
    { kind: "update_actor_relation", relationHandle: "trust", intensity: 2, summary: "The exchange builds trust.",
      exposure: { mode: "protected" } },
    { kind: "update_actor_goal", goalHandle: "guard-goal", status: "blocked", summary: "The guard cannot keep the route orderly.",
      exposure: { mode: "protected" } },
    { kind: "advance_pressure", pressureHandle: "delay", amount: 5, resultStatus: "active",
      exposure: { mode: "projectable", predicates: [{ channel: "local_aftermath", anchorHandle: "here", visibleForMinutes: 15 }] } },
  ])("compiles the supported $kind effect through Rulebook", (effect) => {
    const result = createCampaignPlayGameMaster().compile(frame(), ruling(), resolution, null, {
      elapsedMinutes: 1, effects: [effect],
    });
    expect(result.preflight.accepted).toBe(true);
    expect(result.batch.commands[1]!.kind).toBe(effect.kind);
  });

  it.each(["repair", "full_retry", "text_fallback"] as const)("rejects %s output strategy", async (strategy) => {
    const generateObject = vi.fn(async () => ({ object: proposal, trace: trace(strategy) }));
    const gameMaster = createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject });
    await expect(gameMaster.plan({ frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget }))
      .rejects.toMatchObject({ code: "model_contract_failed" });
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("enforces stage evidence budget and surfaces transport interruption without retry", async () => {
    const costly = vi.fn(async () => ({ object: proposal, trace: trace() }));
    await expect(createCampaignPlayGameMaster({ generateObject: costly as unknown as typeof safeGenerateObject }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null, model: model(), temperature: 0.2,
      budget: { ...budget, maximumTotalTokens: 100 },
    })).rejects.toMatchObject({ code: "stage_budget_exceeded" });
    const interrupted = vi.fn(async () => { throw new Error("connection reset"); });
    await expect(createCampaignPlayGameMaster({ generateObject: interrupted as unknown as typeof safeGenerateObject }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null, model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "transport_interrupted" });
    expect(interrupted).toHaveBeenCalledOnce();
  });
});
