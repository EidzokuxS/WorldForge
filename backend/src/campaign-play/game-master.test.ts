import type { LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import { safeGenerateObject, type SafeGenerateTrace } from "../ai/generate-object-safe.js";
import {
  campaignPlayGameMasterProposalSchema,
  createCampaignPlayGameMaster,
  type CampaignPlayGameMasterFrame,
} from "./game-master.js";
import type { CampaignPlayJudgeRuling, CampaignPlayUncertaintyResolution } from "./contracts.js";
import { resolveCampaignPlayUncertainty, type CampaignPlayModelBudget } from "./judge.js";
import {
  deriveCampaignPlayObligationId,
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
      { id: "region-a", name: "North Harbor", description: "A guarded harbor region.", kind: "macro",
        parentLocationId: null, tags: ["harbor"], isStarting: true },
      { id: "region-b", name: "South Harbor", description: "A market region beyond the passage.", kind: "macro",
        parentLocationId: null, tags: ["market"], isStarting: false },
      { id: "location-a", name: "North Harbor Gate", description: "A guarded passage gate.", kind: "persistent_sublocation",
        parentLocationId: "region-a", tags: ["harbor", "gate"], isStarting: false },
      { id: "location-b", name: "South Harbor Market", description: "A market beyond the passage.", kind: "persistent_sublocation",
        parentLocationId: "region-b", tags: ["market"], isStarting: false },
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
      obligations: [],
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
    possessionEffectAuthority: { kind: "none" },
    requiredObligationEffect: { kind: "none" },
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
    performingActorHandle: "guard",
    routeAccessClaims: [],
    summary: "The player asks the guard about the passage.",
    affectedHandles: ["you", "guard"],
  }],
};

describe("Campaign Play Game Master obligations", () => {
  it("compiles one Judge-required debt with code-owned identity, order, scopes, and version", () => {
    const requiredObligationEffect = {
      kind: "incur_actor_obligation" as const,
      creditorHandle: "guard",
      unitKey: "copper" as const,
      amount: 8,
      minimumResult: "setback" as const,
    };
    const candidate = createCampaignPlayGameMaster().compile(
      frame(),
      ruling({ requiredObligationEffect }),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "incur_actor_obligation",
          debtorActorHandle: "you",
          creditorActorHandle: "guard",
          unitKey: "copper",
          amount: 8,
          summary: "You now owe Oren Tide eight copper for the broken glass.",
          affectedHandles: [],
        }],
      },
    );
    const obligationId = deriveCampaignPlayObligationId(
      CAMPAIGN_ID,
      PLAYER_ID,
      "actor-guard",
      "copper",
    );
    expect(candidate.batch.commands[1]).toMatchObject({
      kind: "incur_actor_obligation",
      order: 1,
      expectedWorldVersion: 8,
      debtorActorId: PLAYER_ID,
      creditorActorId: "actor-guard",
      obligationId,
      unitKey: "copper",
      amount: 8,
      readScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "actor", id: "actor-guard" },
        { kind: "obligation", id: obligationId },
      ],
      writeScope: [{ kind: "obligation", id: obligationId }],
    });
    expect(candidate.preflight.accepted).toBe(true);
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      ruling({ requiredObligationEffect }),
      resolution,
      null,
      proposal,
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("compiles one Judge-required partial payment as an atomic possession transfer and debt reduction", () => {
    const paymentFrame = frame();
    const possessionKey = deriveCampaignPlayPossessionKey("Copper coins");
    const paymentPossessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, possessionKey);
    const creditorPossessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, "actor-guard", possessionKey);
    const obligationId = deriveCampaignPlayObligationId(
      CAMPAIGN_ID,
      PLAYER_ID,
      "actor-guard",
      "copper",
    );
    paymentFrame.visibleFacts.push(
      { handle: "coins", kind: "possession", summary: "Five copper coins." },
      { handle: "guard-debt", kind: "obligation", summary: "Seven copper owed to Oren Tide." },
    );
    paymentFrame.handleBindings.push(
      { handle: "coins", reference: { kind: "possession", id: paymentPossessionId } },
      { handle: "guard-debt", reference: { kind: "obligation", id: obligationId } },
    );
    paymentFrame.rulebookFrame.possessions.push({
      possessionId: paymentPossessionId,
      actorId: PLAYER_ID,
      possessionKey,
      name: "Copper coins",
      quantity: 5,
    });
    paymentFrame.rulebookFrame.obligations.push({
      obligationId,
      debtorActorId: PLAYER_ID,
      creditorActorId: "actor-guard",
      unitKey: "copper",
      principalAmount: 7,
      outstandingAmount: 7,
    });
    paymentFrame.authority.authorizedRefs.push(
      { kind: "possession", id: paymentPossessionId },
      { kind: "obligation", id: obligationId },
    );
    const requiredObligationEffect = {
      kind: "pay_actor_obligation" as const,
      obligationHandle: "guard-debt",
      paymentPossessionHandle: "coins",
      unitKey: "copper" as const,
      amount: 2,
      minimumResult: "success" as const,
    };
    const candidate = createCampaignPlayGameMaster().compile(
      paymentFrame,
      ruling({ requiredObligationEffect }),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "pay_actor_obligation",
          debtorActorHandle: "you",
          creditorActorHandle: "guard",
          obligationHandle: "guard-debt",
          paymentPossessionHandle: "coins",
          unitKey: "copper",
          amount: 2,
          summary: "You place two copper coins in Oren Tide's hand; five copper remains owed.",
          affectedHandles: ["you", "guard", "coins", "guard-debt"],
        }],
      },
    );
    expect(candidate.batch.commands[1]).toMatchObject({
      kind: "pay_actor_obligation",
      order: 1,
      expectedWorldVersion: 8,
      debtorActorId: PLAYER_ID,
      creditorActorId: "actor-guard",
      obligationId,
      paymentPossessionId,
      unitKey: "copper",
      amount: 2,
      summary: "You place two copper coins in Oren Tide's hand; five copper remains owed.",
      affectedRefs: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "actor", id: "actor-guard" },
        { kind: "possession", id: paymentPossessionId },
        { kind: "possession", id: creditorPossessionId },
        { kind: "obligation", id: obligationId },
      ],
      readScope: [
        { kind: "actor", id: PLAYER_ID },
        { kind: "actor", id: "actor-guard" },
        { kind: "possession", id: paymentPossessionId },
        { kind: "possession", id: creditorPossessionId },
        { kind: "obligation", id: obligationId },
      ],
      writeScope: [
        { kind: "possession", id: paymentPossessionId },
        { kind: "possession", id: creditorPossessionId },
        { kind: "obligation", id: obligationId },
      ],
    });
    expect(candidate.preflight.accepted).toBe(true);
    expect(() => createCampaignPlayGameMaster().compile(
      paymentFrame,
      ruling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "pay_actor_obligation",
          debtorActorHandle: "you",
          creditorActorHandle: "guard",
          obligationHandle: "guard-debt",
          paymentPossessionHandle: "coins",
          unitKey: "copper",
          amount: 2,
          summary: "You place two copper coins in Oren Tide's hand.",
          affectedHandles: ["you", "guard", "coins", "guard-debt"],
        }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });
});

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
    expect(String(options.prompt)).toContain("commit one unambiguous final relation in the summary");
    expect(String(options.prompt)).toContain("state whether it was first put inside");
    expect(String(options.prompt)).toContain("never defer that spatial decision to a later stage");
    expect(String(options.prompt)).toContain("RULING defines feasibility, result bounds, and elapsed bounds");
    expect(String(options.prompt)).toContain("not a new source of world facts");
    expect(String(options.prompt)).toContain("A clean, empty, missing, or disturbed surface establishes only its current observable state");
    expect(String(options.prompt)).toContain("Do not expose protected truth by guessing");
    expect(String(options.prompt)).toContain("Unknowns are constraints, not a checklist for the public summary");
    expect(String(options.prompt)).toContain("do not enumerate every interpretation the evidence fails to prove");
    expect(String(options.prompt)).toContain("materialize each usable player-visible value in the committed summary");
    expect(String(options.prompt)).toContain("Never say that a value was read, written down, repeated, counted, or confirmed while omitting the value itself");
    expect(String(options.prompt)).toContain(
      'ALLOWED_HANDLES=["you","guard","here","south","passage","delay","trust","guard-goal"]',
    );
    expect(String(options.prompt)).toContain(
      'HANDLES_BY_KIND={"actor":["you","guard"],"location":["here","south"],"route":["passage"],"pressure":["delay"],"relation":["trust"],"goal":["guard-goal"]}',
    );
    expect(String(options.prompt)).toContain("This includes performingActorHandle, affectedHandles");
    expect(String(options.prompt)).toContain("affectedHandles must not repeat a handle");
    expect(String(options.prompt)).toContain("every model-authored exposure predicate anchorHandle");
    expect(String(options.prompt)).toContain("route_state anchorHandle requires route");
    expect(String(options.prompt)).toContain("witness_report anchorHandle requires actor");
    expect(String(options.prompt)).toContain(
      "local_aftermath has exactly channel, anchorHandle, and the required integer visibleForMinutes",
    );
    expect(String(options.prompt)).toContain("Every exposure field is one object, never an array");
    expect(String(options.prompt)).toContain(
      'It is exactly {"mode":"protected"} or {"mode":"projectable","predicates":[...]}; predicates is the only array',
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
    expect(String(options.prompt)).toContain(
      "For an attempt with nonplayer actor targets, their response is part of the outcome",
    );
    expect(String(options.prompt)).toContain(
      "A successful roll resolves the player's effort; it does not create permission or cooperation",
    );
    expect(String(options.prompt)).toContain("CANONICAL_PEOPLE is the complete person roster for this call");
    expect(String(options.prompt)).toContain("A person name outside this list does not identify an actor, even when SOURCE_MOMENT or prior prose mentions it");
    expect(String(options.prompt)).toContain("treat any prior mention as unverified hearsay about an unnamed resident");
    expect(String(options.prompt)).toContain("Do not offer knocking, calling, or waiting for one as the next playable step");
    expect(String(options.prompt)).toContain("Keep a concrete offer or transaction with the targeted actor");
    expect(String(options.prompt)).toContain("have the targeted actor state that no actionable offer exists");
    expect(String(options.prompt)).toContain("write the targeted person's actual spoken reply, silence, gesture, or action");
    expect(String(options.prompt)).toContain("Do not replace the exchange with audit labels");
    expect(String(options.prompt)).toContain(
      'ACTOR_DIRECTIVES=[{"handle":"guard","name":"Oren Tide","summary":"A guard at the northern gate.","traits":["observant"],"tags":["guard"],"conditions":[],"goals":[{"status":"active","priority":4,"objective":"Keep the route orderly.","motivation":"Protect the harbor."}],"relations":[{"direction":"from","counterpartName":"Unknown person","relationType":"association","intensity":1,"summary":"They have just met."}]}]',
    );
    expect(String(options.prompt)).toContain('CANONICAL_PEOPLE=["Oren Tide"]');
    expect(String(options.prompt)).toContain("PLAYER_MOVEMENT is code-authoritative");
    expect(String(options.prompt)).toContain("When it is restricted, the accepted attempt has earned passage for this traversal only");
    expect(String(options.prompt)).toContain(
      "set_route_state has exactly these fields: kind, exposure, routeHandle, state, and reason",
    );
    expect(String(options.prompt)).toContain("summary and affectedHandles are forbidden");
    expect(String(options.prompt)).toContain("CURRENT_EXACT_SCENE is the only scene the player occupies before movement");
    expect(String(options.prompt)).toContain("Crossing that boundary requires PLAYER_MOVEMENT");
    expect(String(options.prompt)).toContain(
      'CURRENT_EXACT_SCENE={"locationName":"North Harbor Gate","description":"A guarded passage gate."}',
    );
    expect(String(options.prompt)).toContain("Order movement effects as origin interaction");
    expect(String(options.prompt)).toContain("current location at that effect's chronological position");
    expect(String(options.prompt)).toContain("PLAYER_MOVEMENT=null");
    expect(String(options.prompt)).toContain("Never return an empty effects array");
    expect(String(options.prompt)).toContain(
      "record_world_event accepts exactly four eventClass values: dialogue, interaction, discovery, or scene",
    );
    expect(String(options.prompt)).toContain(
      "When PLAYER_INTENT targets no actor, every record_world_event must be actorless",
    );
    expect(String(options.prompt)).toContain(
      "Actor placement changes only through an accepted move_actor effect",
    );
    expect(String(options.prompt)).toContain(
      "VISIBLE_FACTS route handles are code-authoritative topology and access state",
    );
    expect(String(options.prompt)).toContain(
      "Dialogue and SOURCE_MOMENT do not create route access rules",
    );
    expect(String(options.prompt)).toContain(
      "treat that dialogue as a continuity error rather than protected character belief",
    );
    expect(String(options.prompt)).toContain(
      "Do not repeat, qualify, defend, or preserve the conflicting toll",
    );
    expect(String(options.prompt)).toContain(
      "whose PLAYER_INTENT targets or RULING cites a route, routeAccessClaims is required",
    );
    expect(String(options.prompt)).toContain(
      "Every route topology or access statement in summary must agree with these claims",
    );
    expect(String(options.prompt)).toContain(
      "leave that response for a later contact action",
    );
    expect(String(options.prompt)).toContain('"eventClass":"discovery"');
    expect(String(options.prompt)).toContain(
      "effects[].kind accepts exactly: move_actor, set_route_state, set_actor_condition, update_actor_relation, update_actor_goal, advance_pressure, adjust_actor_possession, incur_actor_obligation, pay_actor_obligation, or record_world_event",
    );
    expect(String(options.prompt)).toContain(
      "Use pay_actor_obligation only when the resolved result transfers the player's visible copper possession",
    );
    expect(String(options.prompt)).toContain(
      "Do not add record_world_event or adjust_actor_possession for the same payment",
    );
    expect(String(options.prompt)).toContain(
      "set_actor_condition has exactly these fields: kind, exposure, actorHandle, condition, operation, and summary",
    );
    expect(String(options.prompt)).toContain(
      "condition must be exactly occupied, strained, or incapacitated; operation must be exactly set or clear",
    );
    expect(String(options.prompt)).toContain("affectedHandles is forbidden");
    expect(String(options.prompt)).toContain(
      "If none of those three conditions fits the resolved result, do not use set_actor_condition",
    );
    expect(String(options.prompt)).toContain("These are eventClass values only and must never appear in kind");
    expect(String(options.prompt)).toContain(
      'return exactly one effect shaped as {"kind":"record_world_event","eventClass":"discovery","performingActorHandle":null,"summary":"grounded observation","affectedHandles":["copied handle"]}',
    );
    expect(String(options.prompt)).toContain("cannot establish an absolute chronology");
    expect(String(options.prompt)).toContain("without supplied expertise and reference evidence");
    expect(String(options.prompt)).toContain("Omit exposure from record_world_event");
    expect(String(options.prompt)).toContain("Use adjust_actor_possession whenever the resolved action gives the player a countable possession, consumes one, or durably changes what an existing possession is");
    expect(String(options.prompt)).toContain("Put the player's copied handle in actorHandle. performingActorHandle is forbidden on adjust_actor_possession and exists only on record_world_event");
    expect(String(options.prompt)).toContain("return operation transform with the source possessionHandle and the concrete resulting name");
    expect(String(options.prompt)).toContain("Do not add record_world_event for the same gain, spend, or transformation");
    expect(String(options.prompt)).toContain("Player possession is code-owned authority");
    expect(String(options.prompt)).toContain("A general tool possession never supplies raw material, fasteners, or another consumable");
    expect(String(options.prompt)).toContain("A work assignment, supply list, visible stock");
    expect(String(options.prompt)).toContain("record_world_event cannot substitute for a possession transition");
    expect(String(options.prompt)).toContain("required means include exactly one matching adjust_actor_possession effect");
    expect(String(options.prompt)).toContain("permitted means include zero or one");
    expect(String(options.prompt)).toContain("When no authority applies, every adjust_actor_possession effect is forbidden");
    expect(String(options.prompt)).toContain("WORLD_TIME_AUTHORITY is code-owned");
    expect(String(options.prompt)).toContain("Any clock time, part of day, date, deadline, duration, or relative phrase");
    expect(String(options.prompt)).toContain('WORLD_TIME_AUTHORITY={"actionStart":{"totalMinutes":10,"day":1,"hour":0,"minute":10},"resultRange":{"earliest":{"totalMinutes":11,"day":1,"hour":0,"minute":11},"latest":{"totalMinutes":13,"day":1,"hour":0,"minute":13}}}');
    expect(String(options.prompt)).toContain("Every non-null adjust_actor_possession name must be at most 120 characters");
    expect(String(options.prompt)).toContain("put state, contents, provenance, and other details in summary");
    expect(String(options.prompt)).toContain("Every summary must fit its schema limit: at most 1200 characters");
    expect(String(options.prompt)).toContain("Do not include planning or reasoning, and do not repeat supporting facts");
    expect(String(options.prompt)).not.toContain("actor-player");
    expect(String(options.prompt)).not.toContain("actor-guard");
  });

  it("constrains every generated handle field to admitted frame bindings", async () => {
    const requestFrame = frame();
    requestFrame.visibleFacts.push({ handle: "choice-only", kind: "choice", summary: "A UI choice, not an entity ref." });
    const generateObject = vi.fn(async (options: Parameters<typeof safeGenerateObject>[0]) => {
      const schema = options.schema as typeof campaignPlayGameMasterProposalSchema;
      expect(schema.safeParse(proposal).success).toBe(true);
      expect(schema.safeParse({
        ...proposal,
        effects: [{ ...proposal.effects[0], performingActorHandle: "guar" }],
      }).success).toBe(false);
      expect(schema.safeParse({
        ...proposal,
        effects: [{ ...proposal.effects[0], affectedHandles: ["you", "choice-only"] }],
      }).success).toBe(false);
      return { object: proposal, trace: trace() };
    });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({ frame: requestFrame, ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget });
    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    const allowedLine = promptText.split("\n").find((value) => value.startsWith("ALLOWED_HANDLES="));
    expect(JSON.parse(allowedLine!.slice("ALLOWED_HANDLES=".length))).toEqual(
      requestFrame.handleBindings.map((binding) => binding.handle),
    );
  });

  it("omits route claims from an observation that neither targets nor cites a route", async () => {
    const observationRuling = ruling({
      normalizedIntent: {
        originalText: "I inspect the marks beside the gate.",
        source: "freeform",
        choiceHandle: null,
        kind: "observe",
        targets: [{ handle: "here", kind: "location" }],
        method: "Inspect the visible surface",
        stakes: "Learn what left the marks",
      },
      citedVisibleFactHandles: ["here"],
    });
    const observationProposal = {
      elapsedMinutes: 1,
      effects: [{
        kind: "record_world_event" as const,
        eventClass: "discovery" as const,
        performingActorHandle: null,
        summary: "The marks are fresh, but their cause is not visible.",
        affectedHandles: ["you", "here"],
      }],
    };
    const generateObject = vi.fn(async (options: Parameters<typeof safeGenerateObject>[0]) => {
      const schema = options.schema as typeof campaignPlayGameMasterProposalSchema;
      expect(schema.safeParse(observationProposal).success).toBe(true);
      return { object: observationProposal, trace: trace() };
    });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: observationRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    expect(candidate.preflight.accepted).toBe(true);
    expect(generateObject).toHaveBeenCalledTimes(1);
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

  it("requires a recorded performer to be one of the ruling's actor targets", () => {
    expect(() => createCampaignPlayGameMaster().compile(frame(), ruling(), resolution, null, {
      ...proposal,
      effects: [{ ...proposal.effects[0], performingActorHandle: null }],
    })).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(frame(), ruling(), resolution, null, {
      ...proposal,
      effects: [{ ...proposal.effects[0], performingActorHandle: "you" }],
    })).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("binds route-targeted dialogue to the code-owned direct access state", () => {
    const routeRuling = ruling({
      normalizedIntent: {
        originalText: "I ask whether this direct route needs a permit.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [{ handle: "guard", kind: "actor" }, { handle: "passage", kind: "route" }],
        method: "Ask about the visible route",
        stakes: "Learn its access rule",
      },
    });
    const grounded = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        routeAccessClaims: [{
          routeHandle: "passage",
          state: "open" as const,
          accessRequirement: "none" as const,
          viaLocationHandle: null,
        }],
      }],
    };
    expect(createCampaignPlayGameMaster().compile(
      frame(), routeRuling, resolution, null, grounded,
    ).preflight.accepted).toBe(true);
    expect(createCampaignPlayGameMaster().compile(
      frame(), ruling(), resolution, null, grounded,
    ).preflight.accepted).toBe(true);
    expect(() => createCampaignPlayGameMaster().compile(
      frame(), routeRuling, resolution, null, proposal,
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(
      frame(), routeRuling, resolution, null, {
        ...grounded,
        effects: [{
          ...grounded.effects[0],
          eventClass: "scene",
          performingActorHandle: null,
        }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(
      frame(), routeRuling, resolution, null, {
        ...grounded,
        effects: [{
          ...grounded.effects[0],
          routeAccessClaims: [{
            routeHandle: "passage",
            state: "restricted",
            accessRequirement: "required",
            viaLocationHandle: "south",
          }],
        }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("rejects route prose that contradicts its mechanically valid route claim", async () => {
    const routeRuling = ruling({
      normalizedIntent: {
        originalText: "I ask whether this direct route needs a permit.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [{ handle: "guard", kind: "actor" }, { handle: "passage", kind: "route" }],
        method: "Ask about the visible route",
        stakes: "Learn its access rule",
      },
    });
    const contradictory = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        summary: "Oren says every crossing reaches a toll bridge before the south harbor.",
        routeAccessClaims: [{
          routeHandle: "passage",
          state: "open" as const,
          accessRequirement: "none" as const,
          viaLocationHandle: null,
        }],
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: contradictory, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "rejected", reason: "The summary invents a toll bridge." },
        trace: trace(),
      });
    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({
      code: "model_contract_failed",
      modelEvidence: expect.objectContaining({ errorCode: "route_authority_rejected" }),
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(String(generateObject.mock.calls[1]![0].prompt)).toContain(
      "Do not rewrite, repair, or continue the story",
    );
  });

  it("persists an independent review hash for route prose accepted against typed authority", async () => {
    const routeRuling = ruling({
      normalizedIntent: {
        originalText: "I ask whether this direct route needs a permit.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [{ handle: "guard", kind: "actor" }, { handle: "passage", kind: "route" }],
        method: "Ask about the visible route",
        stakes: "Learn its access rule",
      },
    });
    const grounded = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        summary: "Oren says the passage runs directly south and needs no permit.",
        routeAccessClaims: [{
          routeHandle: "passage",
          state: "open" as const,
          accessRequirement: "none" as const,
          viaLocationHandle: null,
        }],
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: grounded, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The summary matches the direct open route." },
        trace: trace(),
      });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    expect(candidate.semanticReview).toEqual({
      kind: "route_authority",
      reviewHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(candidate.modelEvidence).toMatchObject({
      totalAttempts: 1,
      inputTokens: 200,
      outputTokens: 160,
      totalTokens: 360,
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("compiles acquisition, spending, and transformation into typed Rulebook possession effects", () => {
    const acquisition = createCampaignPlayGameMaster().compile(
      frame(),
      ruling({
        possessionEffectAuthority: {
          kind: "adjust_actor_possession",
          enforcement: "required",
          operation: "acquire",
          possessionHandle: null,
          quantity: 2,
          minimumResult: "success",
        },
      }),
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

    const permittedAcquisition = ruling({
      possessionEffectAuthority: {
        kind: "adjust_actor_possession",
        enforcement: "permitted",
        operation: "acquire",
        possessionHandle: null,
        quantity: 2,
        minimumResult: "success",
      },
    });
    const declinedAcquisition = createCampaignPlayGameMaster().compile(
      frame(),
      permittedAcquisition,
      resolution,
      null,
      proposal,
    );
    expect(declinedAcquisition.preflight.accepted).toBe(true);
    expect(declinedAcquisition.batch.commands.some((command) =>
      command.kind === "adjust_actor_possession")).toBe(false);
    const grantedAcquisition = createCampaignPlayGameMaster().compile(
      frame(),
      permittedAcquisition,
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
    expect(grantedAcquisition.preflight.accepted).toBe(true);
    expect(grantedAcquisition.batch.commands.some((command) =>
      command.kind === "adjust_actor_possession")).toBe(true);

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
      ruling({
        possessionEffectAuthority: {
          kind: "adjust_actor_possession",
          enforcement: "required",
          operation: "spend",
          possessionHandle: "copper-chit",
          quantity: 1,
          minimumResult: "success",
        },
        citedVisibleFactHandles: ["guard", "passage", "copper-chit"],
      }),
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

    expect(() => createCampaignPlayGameMaster().compile(
      spendingFrame,
      ruling({ citedVisibleFactHandles: ["guard", "passage", "copper-chit"] }),
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
          summary: "You spend one copper chit without Judge authority.",
          affectedHandles: [],
        }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));

    const transformation = createCampaignPlayGameMaster().compile(
      spendingFrame,
      ruling({
        possessionEffectAuthority: {
          kind: "adjust_actor_possession",
          enforcement: "required",
          operation: "transform",
          possessionHandle: "copper-chit",
          quantity: 1,
          minimumResult: "limited",
        },
        citedVisibleFactHandles: ["guard", "passage", "copper-chit"],
      }),
      resolution,
      null,
      {
        elapsedMinutes: 2,
        effects: [{
          kind: "adjust_actor_possession",
          operation: "transform",
          actorHandle: "you",
          possessionHandle: "copper-chit",
          name: "Copper chit stamped for lodging",
          quantity: 1,
          summary: "You stamp one copper chit as paid lodging credit.",
          affectedHandles: [],
        }],
      },
    );
    const resultKey = deriveCampaignPlayPossessionKey("Copper chit stamped for lodging");
    const resultId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, resultKey);
    expect(transformation.batch.commands.slice(1)).toMatchObject([{
      kind: "adjust_actor_possession",
      possessionId,
      quantityDelta: -1,
      exposure: { mode: "protected" },
    }, {
      kind: "adjust_actor_possession",
      possessionId: resultId,
      possessionKey: resultKey,
      name: "Copper chit stamped for lodging",
      quantityDelta: 1,
      exposure: { mode: "projectable" },
    }]);
    expect(transformation.preflight.accepted).toBe(true);
    expect(() => createCampaignPlayGameMaster().compile(
      spendingFrame,
      ruling({
        possessionEffectAuthority: {
          kind: "adjust_actor_possession",
          enforcement: "required",
          operation: "transform",
          possessionHandle: "copper-chit",
          quantity: 1,
          minimumResult: "limited",
        },
        citedVisibleFactHandles: ["guard", "passage", "copper-chit"],
      }),
      resolution,
      null,
      proposal,
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
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
    { kind: "move_actor", actorHandle: null },
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
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "passage", kind: "route" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
    }) : ruling();
    const result = createCampaignPlayGameMaster().compile(frame(), effectRuling, resolution, null, {
      elapsedMinutes: effect.kind === "move_actor" ? 5 : 1, effects: [effect],
    });
    expect(result.preflight.accepted).toBe(true);
    expect(result.batch.commands[1]!.kind).toBe(effect.kind);
  });

  it("binds movement mechanics from Judge targets and current placement instead of model-authored handles", async () => {
    const moveFrame = frame();
    moveFrame.rulebookFrame.acceptedWorld.actors.push({
      id: "actor-merchant",
      kind: "person",
      controller: "agent",
      role: "background",
      name: "Mara Quay",
      summary: "A fish merchant sorting the morning catch.",
      traits: ["practical"],
      tags: ["merchant"],
    });
    moveFrame.rulebookFrame.acceptedWorld.goals.push({
      id: "goal-merchant",
      actorId: "actor-merchant",
      objective: "Sell the morning catch.",
      motivation: "Keep the stall solvent.",
      horizon: "immediate",
      priority: 3,
      status: "active",
    });
    moveFrame.rulebookFrame.acceptedWorld.placements.push({
      id: "placement-merchant",
      actorId: "actor-merchant",
      locationId: "location-b",
      placementKind: "present",
    });
    moveFrame.rulebookFrame.placements.push({
      placementId: "placement-merchant",
      actorId: "actor-merchant",
      locationId: "location-b",
      placementKind: "present",
    });
    moveFrame.rulebookFrame.goals.push({
      goalId: "goal-merchant",
      actorId: "actor-merchant",
      status: "active",
      priority: 3,
      objective: "Sell the morning catch.",
      motivation: "Keep the stall solvent.",
    });
    const moveRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "passage", kind: "route" }, { handle: "south", kind: "location" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
    });
    const moveProposal = {
      elapsedMinutes: 5,
      effects: [{ kind: "move_actor" as const, actorHandle: null }],
    };
    const generateObject = vi.fn(async (_options: Parameters<typeof safeGenerateObject>[0]) =>
      ({ object: moveProposal, trace: trace() }));
    const result = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({ frame: moveFrame, ruling: moveRuling, resolution, uncertaintyAuthority: null,
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
    expect(moveProposal.effects[0]).toEqual({ kind: "move_actor", actorHandle: null });
    expect(result.batch.commands[0]).toMatchObject({ kind: "advance_world_time", elapsedMinutes: 5 });
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      moveRuling,
      resolution,
      null,
      { ...moveProposal, elapsedMinutes: 1 },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      moveRuling,
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{ kind: "move_actor", actorHandle: null, exposure: { mode: "protected" } }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'PLAYER_MOVEMENT={"actorHandle":"you","routeHandle":"passage","fromLocationHandle":"here","toLocationHandle":"south","travelCost":5,"initialRouteState":"open"}',
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "For a pure move, elapsedMinutes must equal travelCost exactly",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'return exactly one {"kind":"move_actor","actorHandle":null} effect for the player',
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "Do not copy PLAYER_MOVEMENT fields or exposure into an effect",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "use eventClass scene for an actorless arrival",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "places the player inside the destination's shared location scene",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'DESTINATION_SCENE={"locationName":"South Harbor Market","description":"A market beyond the passage.","presentPeople":["Mara Quay"]}',
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "Do not call the scene empty, move a listed person behind an unentered boundary, or contradict their presence",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "A targeted visible agent may voluntarily travel with the player",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "do not describe that person at the destination",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "do not claim that the destination is empty or inaccessible",
    );
  });

  it("opens, traverses, and restores a restricted route in one accepted batch", () => {
    const restrictedFrame = frame();
    restrictedFrame.rulebookFrame.routeStates = [{
      routeId: "route-a-b",
      state: "restricted",
    }];
    const restrictedRuling = ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I present my permission and pass the gate.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [{ handle: "passage", kind: "route" }],
        method: "Present permission and pass",
        stakes: "Reach South Harbor",
      },
      citedVisibleFactHandles: ["passage"],
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
    });
    const restrictedProposal = {
      elapsedMinutes: 5,
      effects: [
        { kind: "set_route_state" as const, routeHandle: "passage", state: "open" as const,
          reason: "Permission grants this crossing.", exposure: { mode: "protected" as const } },
        { kind: "move_actor" as const, actorHandle: null },
        { kind: "set_route_state" as const, routeHandle: "passage", state: "restricted" as const,
          reason: "Permission remains required for later crossings.", exposure: { mode: "protected" as const } },
      ],
    };
    const accepted = createCampaignPlayGameMaster().compile(
      restrictedFrame,
      restrictedRuling,
      resolution,
      null,
      restrictedProposal,
    );
    expect(accepted.preflight.accepted).toBe(true);
    expect(accepted.batch.commands.map((command) => command.kind)).toEqual([
      "advance_world_time",
      "set_route_state",
      "move_actor",
      "set_route_state",
    ]);
    expect(accepted.preflight.simulation.routeStates).toEqual([{
      routeId: "route-a-b",
      state: "restricted",
    }]);
    expect(accepted.preflight.simulation.placements.find((placement) =>
      placement.actorId === PLAYER_ID)?.locationId).toBe("location-b");
    expect(() => createCampaignPlayGameMaster().compile(
      restrictedFrame,
      restrictedRuling,
      resolution,
      null,
      { elapsedMinutes: 5, effects: [{ kind: "move_actor", actorHandle: null }] },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("keeps the player in place when a restricted traversal does not earn passage", () => {
    const restrictedFrame = frame();
    restrictedFrame.rulebookFrame.routeStates = [{
      routeId: "route-a-b",
      state: "restricted",
    }];
    const restrictedRuling = ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I try to slip through the guarded passage.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [{ handle: "passage", kind: "route" }],
        method: "Slip past the guard",
        stakes: "Reach South Harbor",
      },
      disposition: "deterministic",
      resultBounds: { minimum: "limited", maximum: "limited" },
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 10 },
      uncertainty: { kind: "none" },
    });
    const failed = createCampaignPlayGameMaster().compile(
      restrictedFrame,
      restrictedRuling,
      { kind: "deterministic", result: "limited" },
      null,
      {
        elapsedMinutes: 5,
        effects: [{
          kind: "record_world_event",
          eventClass: "scene",
          performingActorHandle: null,
          routeAccessClaims: [],
          summary: "The guard closes the gap before the traveler reaches the passage.",
          affectedHandles: ["you", "passage"],
        }],
      },
    );
    expect(failed.batch.commands.some((command) => command.kind === "move_actor")).toBe(false);
    expect(failed.preflight.simulation.placements.find((placement) =>
      placement.actorId === PLAYER_ID)?.locationId).toBe("location-a");
    expect(failed.preflight.simulation.routeStates).toEqual([{
      routeId: "route-a-b",
      state: "restricted",
    }]);
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
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "freeform", choiceHandle: null,
        kind: "move", targets: [{ handle: "passage", kind: "route" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
    });
    const result = createCampaignPlayGameMaster().compile(frame(), moveRuling, resolution, null, {
      elapsedMinutes: 5,
      effects: [
        { kind: "move_actor", actorHandle: null },
        {
          kind: "record_world_event",
          eventClass: "scene",
          performingActorHandle: null,
          routeAccessClaims: [],
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
  });

  it("binds compound origin contact and destination scene in chronological locations", () => {
    const compoundRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 8 },
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
      elapsedMinutes: 5,
      effects: [
        {
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: "guard",
          routeAccessClaims: [],
          summary: "The guard points the player toward South Harbor.",
          affectedHandles: ["you", "guard", "here"],
        },
        { kind: "move_actor", actorHandle: null },
        {
          kind: "record_world_event",
          eventClass: "scene",
          performingActorHandle: null,
          routeAccessClaims: [],
          summary: "At South Harbor, the player's call receives no reply.",
          affectedHandles: ["you", "south"],
        },
      ],
    });

    expect(result.batch.commands.map((command) => command.kind)).toEqual([
      "advance_world_time",
      "record_world_event",
      "move_actor",
      "record_world_event",
    ]);
    expect(result.batch.commands[1]).toMatchObject({
      performingActorId: "actor-guard",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-a" }],
      },
    });
    expect(result.batch.commands[3]).toMatchObject({
      performingActorId: null,
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-b" }],
      },
    });
  });

  it("moves one willing targeted companion after a route-bound attempt", () => {
    const companionRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "On Oren's call, I shove the skiff into the passage toward South Harbor.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [
          { handle: "passage", kind: "route" },
          { handle: "guard", kind: "actor" },
        ],
        method: "Time the launch with Oren and enter the passage",
        stakes: "Reach South Harbor together without losing control of the skiff",
      },
    });
    const result = createCampaignPlayGameMaster().compile(frame(), companionRuling, resolution, null, {
      elapsedMinutes: 5,
      effects: [
        {
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: "guard",
          routeAccessClaims: [],
          summary: "Oren agrees to walk beside the player and steps toward the passage.",
          affectedHandles: ["you", "guard", "here"],
        },
        { kind: "move_actor", actorHandle: null },
        { kind: "move_actor", actorHandle: "guard" },
        {
          kind: "record_world_event",
          eventClass: "scene",
          performingActorHandle: null,
          routeAccessClaims: [],
          summary: "The player and Oren enter South Harbor together.",
          affectedHandles: ["you", "guard", "south"],
        },
      ],
    });

    expect(result.batch.commands.map((command) => command.kind)).toEqual([
      "advance_world_time",
      "record_world_event",
      "move_actor",
      "move_actor",
      "record_world_event",
    ]);
    expect(result.batch.commands[2]).toMatchObject({
      kind: "move_actor",
      actorId: PLAYER_ID,
      routeId: "route-a-b",
      fromLocationId: "location-a",
      toLocationId: "location-b",
    });
    expect(result.batch.commands[3]).toMatchObject({
      kind: "move_actor",
      actorId: "actor-guard",
      routeId: "route-a-b",
      fromLocationId: "location-a",
      toLocationId: "location-b",
    });
    expect(result.preflight.simulation.placements.filter((placement) =>
      placement.placementKind === "present"
      && (placement.actorId === PLAYER_ID || placement.actorId === "actor-guard")))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ actorId: PLAYER_ID, locationId: "location-b" }),
        expect.objectContaining({ actorId: "actor-guard", locationId: "location-b" }),
      ]));
    expect(result.batch.commands[4]).toMatchObject({
      kind: "record_world_event",
      affectedRefs: expect.arrayContaining([
        { kind: "actor", id: PLAYER_ID },
        { kind: "actor", id: "actor-guard" },
        { kind: "location", id: "location-b" },
      ]),
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: "location-b" }],
      },
    });
  });

  it("rejects companion movement without prior consent or after invalid ordering", () => {
    const companionRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "I tell Oren to walk with me to South Harbor.",
        source: "freeform",
        choiceHandle: null,
        kind: "move",
        targets: [
          { handle: "south", kind: "location" },
          { handle: "guard", kind: "actor" },
        ],
        method: "Travel the open passage beside Oren",
        stakes: "Reach South Harbor together",
      },
    });
    const scene = {
      kind: "record_world_event" as const,
      eventClass: "scene" as const,
      performingActorHandle: null,
      routeAccessClaims: [],
      summary: "The player and Oren enter South Harbor together.",
      affectedHandles: ["you", "guard", "south"],
    };
    expect(() => createCampaignPlayGameMaster().compile(frame(), companionRuling, resolution, null, {
      elapsedMinutes: 5,
      effects: [
        { kind: "move_actor", actorHandle: null },
        { kind: "move_actor", actorHandle: "guard" },
        scene,
      ],
    })).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(frame(), companionRuling, resolution, null, {
      elapsedMinutes: 5,
      effects: [
        {
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: "guard",
          routeAccessClaims: [],
          summary: "Oren agrees to walk beside the player.",
          affectedHandles: ["you", "guard", "here"],
        },
        { kind: "move_actor", actorHandle: "guard" },
        { kind: "move_actor", actorHandle: null },
        scene,
      ],
    })).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("rejects an origin performer placed after movement", () => {
    const compoundRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 8 },
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
    expect(() => createCampaignPlayGameMaster().compile(frame(), compoundRuling, resolution, null, {
      elapsedMinutes: 5,
      effects: [
        { kind: "move_actor", actorHandle: null },
        {
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: "guard",
          routeAccessClaims: [],
          summary: "At South Harbor, the player asks the guard about passage delays.",
          affectedHandles: ["you", "guard", "south"],
        },
      ],
    })).toThrow(expect.objectContaining({ code: "rulebook_denied" }));
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
