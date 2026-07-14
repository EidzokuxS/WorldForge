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
import {
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
} from "./campaign-play-projection.js";

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
    sourceMoment: "Oren paints a fresh white line across the passage latch.",
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
    actorContinuity: [{
      actorHandle: "guard",
      recentOwnActions: [{
        summary: "Oren Tide inspected the passage latch before the traveler arrived.",
        observableTrace: "Fresh oil marks the passage latch.",
      }],
    }],
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
      possessions: [],
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
    movementRouteHandle: null,
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

function trace(
  strategy: SafeGenerateTrace["strategy"] = "native_schema",
  usage: SafeGenerateTrace["usage"] = { inputTokens: 100, outputTokens: 80, totalTokens: 180 },
): SafeGenerateTrace {
  return {
    text: "private", cleanedText: "private", requestedMode: "auto", strategy,
    primaryStrategy: "native_schema", fallbackStrategy: "text_fallback",
    capability: { requestedMode: "auto", primaryStrategy: "native_schema", fallbackStrategy: "text_fallback",
      actualMode: "native_schema", reason: "test", providerId: "test-provider",
      providerName: "Test Provider", model: "test-model" },
    usage,
    response: { modelId: "test-model" }, finishReason: "stop",
  };
}

const budget: CampaignPlayModelBudget = {
  maximumInputTokens: 1_000, maximumOutputTokens: 1_000,
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
      expectedWorldVersion: 8, readScope: [{ kind: "actor", id: PLAYER_ID }, { kind: "actor", id: "actor-guard" }],
      exposure: { mode: "projectable", predicates: [{ channel: "direct_perception", locationId: "location-a" }] } });
    expect(first.batch.commands[1]!.causalParent).toEqual({ kind: "command", commandId: first.batch.commands[0]!.commandId });
  });

  it("uses one strict provider/model call and keeps canonical bindings out of its prompt", async () => {
    const workerController = new AbortController();
    const generateObject = vi.fn(async (_options: Parameters<typeof safeGenerateObject>[0]) => ({ object: proposal, trace: trace() }));
    const gameMaster = createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject });
    const result = await gameMaster.plan({ frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, signal: workerController.signal });
    expect(result.preflight.accepted).toBe(true);
    expect(generateObject).toHaveBeenCalledOnce();
    const options = generateObject.mock.calls[0]![0];
    expect(options).toMatchObject({ strictSchema: true, allowRepair: false, allowTextFallback: false,
      retries: 1, abortSignal: workerController.signal });
    expect("timeout" in options).toBe(false);
    expect(String(options.prompt)).toContain("opaque handles");
    expect(String(options.prompt)).toContain("SOURCE_MOMENT is the exact accepted player-visible scene");
    expect(String(options.prompt)).toContain(
      'SOURCE_MOMENT="Oren paints a fresh white line across the passage latch."',
    );
    expect(String(options.prompt)).toContain("Do not change that detail's origin, age, owner, location, or state");
    expect(String(options.prompt)).toContain("It never overrides the current visible placement or condition of an object");
    expect(String(options.prompt)).toContain("never make a visible object vanish or move without explicit evidence");
    expect(String(options.prompt)).toContain("RULING defines feasibility, result bounds, and elapsed bounds");
    expect(String(options.prompt)).toContain("not a new source of world facts");
    expect(String(options.prompt)).toContain("A clean, empty, missing, or disturbed surface establishes only its current observable state");
    expect(String(options.prompt)).toContain("Do not expose protected truth by guessing");
    expect(String(options.prompt)).toContain("Unknowns are constraints, not a checklist for the public summary");
    expect(String(options.prompt)).toContain("do not enumerate every interpretation the evidence fails to prove");
    expect(String(options.prompt)).toContain(
      'ALLOWED_HANDLES=["you","guard","here","south","passage","delay","trust","guard-goal"]',
    );
    expect(String(options.prompt)).toContain(
      'HANDLES_BY_KIND={"actor":["you","guard"],"location":["here","south"],"route":["passage"],"pressure":["delay"],"relation":["trust"],"goal":["guard-goal"]}',
    );
    expect(String(options.prompt)).toContain("This includes affectedHandles");
    expect(String(options.prompt)).toContain("affectedHandles must not repeat a handle");
    expect(String(options.prompt)).toContain("every model-authored exposure predicate anchorHandle");
    expect(String(options.prompt)).toContain("route_state anchorHandle requires route");
    expect(String(options.prompt)).toContain("witness_report anchorHandle requires actor");
    expect(String(options.prompt)).toContain(
      "local_aftermath has exactly channel, anchorHandle, and the required integer visibleForMinutes",
    );
    expect(String(options.prompt)).toContain(
      "route_state has exactly channel, anchorHandle, and the required non-empty triggers array",
    );
    expect(String(options.prompt)).toContain("Resolve only the exact PLAYER_INTENT");
    expect(String(options.prompt)).toContain("does not turn an unfamiliar actor into a fully cooperative informant");
    expect(String(options.prompt)).toContain("an actor must not deny, misattribute, or forget an action");
    expect(String(options.prompt)).toContain(
      'ACTOR_CONTINUITY=[{"actorHandle":"guard","recentOwnActions":[{"summary":"Oren Tide inspected the passage latch before the traveler arrived.","observableTrace":"Fresh oil marks the passage latch."}]}]',
    );
    expect(String(options.prompt)).toContain("ACTOR_DIRECTIVES is protected roleplay authority");
    expect(String(options.prompt)).toContain("write the person's actual spoken reply, silence, gesture, or action");
    expect(String(options.prompt)).toContain("Do not replace the exchange with audit labels");
    expect(String(options.prompt)).toContain(
      'ACTOR_DIRECTIVES=[{"handle":"guard","name":"Oren Tide","summary":"A guard at the northern gate.","traits":["observant"],"tags":["guard"],"conditions":[],"goals":[{"status":"active","priority":4,"objective":"Keep the route orderly.","motivation":"Protect the harbor."}],"relations":[{"direction":"from","counterpartName":"Unknown person","relationType":"association","intensity":1,"summary":"They have just met."}]}]',
    );
    expect(String(options.prompt)).toContain("PLAYER_MOVEMENT is code-authoritative");
    expect(String(options.prompt)).toContain("put it first in effects");
    expect(String(options.prompt)).toContain("post-effect location");
    expect(String(options.prompt)).toContain("PLAYER_MOVEMENT=null");
    expect(String(options.prompt)).toContain("Never return an empty effects array");
    expect(String(options.prompt)).toContain(
      "record_world_event accepts exactly four eventClass values: dialogue, interaction, discovery, or scene",
    );
    expect(String(options.prompt)).toContain('"eventClass":"discovery"');
    expect(String(options.prompt)).toContain(
      "effects[].kind accepts exactly: move_actor, set_route_state, set_actor_condition, update_actor_relation, update_actor_goal, advance_pressure, adjust_actor_possession, or record_world_event",
    );
    expect(String(options.prompt)).toContain("These are eventClass values only and must never appear in kind");
    expect(String(options.prompt)).toContain(
      'return exactly one effect shaped as {"kind":"record_world_event","eventClass":"discovery","summary":"grounded observation","affectedHandles":["copied handle"]}',
    );
    expect(String(options.prompt)).toContain("cannot establish an absolute chronology");
    expect(String(options.prompt)).toContain("without supplied expertise and reference evidence");
    expect(String(options.prompt)).toContain("Omit exposure from record_world_event");
    expect(String(options.prompt)).toContain("Use adjust_actor_possession whenever the resolved action gives the player a countable possession or consumes one");
    expect(String(options.prompt)).toContain("Do not add record_world_event for the same gain or spend");
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

  it("compiles acquisition and spending into the typed Rulebook possession effect", () => {
    const acquisition = createCampaignPlayGameMaster().compile(
      frame(),
      ruling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "adjust_actor_possession",
          operation: "acquire",
          actorHandle: "you",
          possessionHandle: null,
          name: "Copper chit",
          quantity: 2,
          summary: "The clerk pays you two copper chits for the copied manifests.",
          affectedHandles: ["guard"],
        }],
      },
    );
    const possessionKey = deriveCampaignPlayPossessionKey("Copper chit");
    const possessionId = deriveCampaignPlayPossessionId(
      CAMPAIGN_ID,
      PLAYER_ID,
      possessionKey,
    );
    expect(acquisition.batch.commands[1]).toMatchObject({
      kind: "adjust_actor_possession",
      actorId: PLAYER_ID,
      possessionId,
      possessionKey,
      name: "Copper chit",
      quantityDelta: 2,
      affectedRefs: [
        { kind: "actor", id: "actor-guard" },
        { kind: "actor", id: PLAYER_ID },
      ],
      writeScope: [{ kind: "possession", id: possessionId }],
    });
    expect(acquisition.preflight.accepted).toBe(true);

    const spendingFrame = frame();
    spendingFrame.visibleFacts.push({
      handle: "copper-chit",
      kind: "possession",
      summary: "Copper chit: 2",
    });
    spendingFrame.handleBindings.push({
      handle: "copper-chit",
      reference: { kind: "possession", id: possessionId },
    });
    spendingFrame.authority.authorizedRefs.push({ kind: "possession", id: possessionId });
    spendingFrame.rulebookFrame.possessions.push({
      possessionId,
      actorId: PLAYER_ID,
      possessionKey,
      name: "Copper chit",
      quantity: 2,
    });
    const spending = createCampaignPlayGameMaster().compile(
      spendingFrame,
      ruling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "adjust_actor_possession",
          operation: "spend",
          actorHandle: "you",
          possessionHandle: "copper-chit",
          name: null,
          quantity: 1,
          summary: "You pay one copper chit for a cot until afternoon.",
          affectedHandles: [],
        }],
      },
    );
    expect(spending.batch.commands[1]).toMatchObject({
      kind: "adjust_actor_possession",
      possessionId,
      quantityDelta: -1,
    });
    expect(spending.preflight.accepted).toBe(true);
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
      ...proposal,
      effects: [{ ...proposal.effects[0], exposure: { mode: "protected" } }],
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
    { kind: "move_actor" },
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
    const effectRuling = effect.kind === "move_actor" ? ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "passage", kind: "route" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
    }) : ruling();
    const result = createCampaignPlayGameMaster().compile(frame(), effectRuling, resolution, null, {
      elapsedMinutes: 1, effects: [effect],
    });
    expect(result.preflight.accepted).toBe(true);
    expect(result.batch.commands[1]!.kind).toBe(effect.kind);
  });

  it("binds movement mechanics from Judge targets and current placement instead of model-authored handles", async () => {
    const moveRuling = ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "passage", kind: "route" }, { handle: "south", kind: "location" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
    });
    const moveProposal = {
      elapsedMinutes: 1,
      effects: [{ kind: "move_actor" as const }],
    };
    const generateObject = vi.fn(async (_options: Parameters<typeof safeGenerateObject>[0]) =>
      ({ object: moveProposal, trace: trace() }));
    const result = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({ frame: frame(), ruling: moveRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget });

    expect(result.batch.commands[1]).toMatchObject({
      kind: "move_actor",
      actorId: PLAYER_ID,
      routeId: "route-a-b",
      fromLocationId: "location-a",
      toLocationId: "location-b",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-b" }],
      },
    });
    expect(moveProposal.effects[0]).toEqual({ kind: "move_actor" });
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      moveRuling,
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{ kind: "move_actor", exposure: { mode: "protected" } }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'PLAYER_MOVEMENT={"actorHandle":"you","routeHandle":"passage","fromLocationHandle":"here","toLocationHandle":"south"}',
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "return exactly one move_actor effect containing only kind",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "Do not copy PLAYER_MOVEMENT fields or exposure into the effect",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "use eventClass scene for that arrival",
    );
  });

  it("requires the Judge's explicit route instead of inferring movement from citations", async () => {
    const moveRuling = ruling({
      normalizedIntent: {
        originalText: "I take the open path to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "south", kind: "location" }],
        method: "Follow the open passage", stakes: "Reach South Harbor",
      },
      citedVisibleFactHandles: ["passage", "south"],
    });
    const generateObject = vi.fn();

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({ frame: frame(), ruling: moveRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget })).rejects.toMatchObject({ code: "ruling_invalid" });
    expect(generateObject).not.toHaveBeenCalled();
  });

  it("binds a movement result event to the destination after the move command", () => {
    const moveRuling = ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "passage", kind: "route" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
    });
    const result = createCampaignPlayGameMaster().compile(frame(), moveRuling, resolution, null, {
      elapsedMinutes: 1,
      effects: [
        { kind: "move_actor" },
        {
          kind: "record_world_event",
          eventClass: "scene",
          summary: "The player reaches South Harbor.",
          affectedHandles: ["you", "south"],
        },
      ],
    });

    expect(result.batch.commands[2]).toMatchObject({
      kind: "record_world_event",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-b" }],
      },
    });
    expect(() => createCampaignPlayGameMaster().compile(frame(), moveRuling, resolution, null, {
      elapsedMinutes: 1,
      effects: [
        {
          kind: "record_world_event",
          eventClass: "scene",
          summary: "The player reaches South Harbor.",
          affectedHandles: ["you", "south"],
        },
        { kind: "move_actor" },
      ],
    })).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("settles compound travel before the local contact event", () => {
    const compoundRuling = ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I cross to South Harbor and ask the guard about passage delays.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [
          { handle: "passage", kind: "route" },
          { handle: "south", kind: "location" },
          { handle: "guard", kind: "actor" },
        ],
        method: "Cross the passage, then ask the guard",
        stakes: "Learn why crossings are delayed",
      },
    });
    const result = createCampaignPlayGameMaster().compile(frame(), compoundRuling, resolution, null, {
      elapsedMinutes: 1,
      effects: [
        { kind: "move_actor" },
        {
          kind: "record_world_event",
          eventClass: "dialogue",
          summary: "At South Harbor, the player asks the guard about passage delays.",
          affectedHandles: ["you", "guard", "south"],
        },
      ],
    });

    expect(result.batch.commands[1]).toMatchObject({
      kind: "move_actor",
      actorId: PLAYER_ID,
      fromLocationId: "location-a",
      toLocationId: "location-b",
    });
    expect(result.batch.commands[2]).toMatchObject({
      kind: "record_world_event",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-b" }],
      },
    });
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

  it("does not count thinking tokens against the visible output budget", async () => {
    const generateObject = vi.fn(async () => ({
      object: proposal,
      trace: trace("native_schema", {
        inputTokens: 100,
        outputTokens: 32_100,
        reasoningTokens: 32_000,
        totalTokens: 32_200,
      }),
    }));
    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(),
      ruling: ruling(),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget: {
        ...budget,
        maximumOutputTokens: 100,
        maximumTotalTokens: 1_000,
        maximumCostMicros: 100_000,
      },
    })).resolves.toMatchObject({
      modelEvidence: { outputTokens: 32_100, errorCode: null },
      preflight: { accepted: true },
    });
  });
});
