import type { LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { CampaignWorldReview } from "@worldforge/shared";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../ai/structured-output-capabilities.js";
import { safeGenerateObject, type SafeGenerateTrace } from "../ai/generate-object-safe.js";
import {
  campaignPlayGameMasterProposalSchema,
  createCampaignPlayGameMaster,
  CampaignPlayGameMasterError,
  getCampaignPlayGameMasterRecoveryFeedback,
  type CampaignPlayGameMasterFrame,
} from "./game-master.js";
import type { CampaignPlayJudgeRuling, CampaignPlayUncertaintyResolution } from "./contracts.js";
import { resolveCampaignPlayUncertainty, type CampaignPlayModelBudget } from "./judge.js";
import {
  deriveCampaignPlayLocalSceneTopologyIds,
  deriveCampaignPlayObligationId,
  deriveCampaignPlayPossessionId,
  deriveCampaignPlayPossessionKey,
  deriveCampaignPlaySupportActorIds,
} from "./campaign-play-projection.js";

const gameMasterWarn = vi.hoisted(() => vi.fn());
const gameMasterEvent = vi.hoisted(() => vi.fn());

vi.mock("../lib/index.js", () => ({
  createLogger: (tag: string) => ({
    info: vi.fn(),
    warn: tag === "campaign-play-game-master" ? gameMasterWarn : vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    event: tag === "campaign-play-game-master" ? gameMasterEvent : vi.fn(),
  }),
}));

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
    playerProfile: {
      backgroundSummary: "Fifteen years maintaining the harbor signal bridge.",
      personaSummary: "A careful mechanic who tests one variable at a time.",
      traits: ["Mechanic", "Harbor resident"],
      skills: [{ name: "Instrument repair", tier: "Master" }],
      specialties: ["Acoustic mechanisms"],
      motivations: ["Keep the harbor bridge sound"],
    },
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
      runtimeActors: [],
      runtimeLocations: [],
      runtimeRoutes: [],
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

function scopeOverflowFrame(): CampaignPlayGameMasterFrame {
  const value = frame();
  for (let index = 0; index < 9; index += 1) {
    const handle = `scope-location-${index}`;
    const locationId = `scope-location-${index}`;
    value.visibleFacts.push({
      handle,
      kind: "location",
      summary: `A visible scope test location ${index}.`,
    });
    value.handleBindings.push({
      handle,
      reference: { kind: "location", id: locationId },
    });
    value.authority.authorizedRefs.push({ kind: "location", id: locationId });
    value.rulebookFrame.acceptedWorld.locations.push({
      id: locationId,
      name: `Scope Location ${index}`,
      description: `A scope test location ${index}.`,
      kind: "persistent_sublocation",
      parentLocationId: "region-a",
      tags: ["harbor"],
      isStarting: false,
    });
  }
  return value;
}

function scopeOverflowRuling(): CampaignPlayJudgeRuling {
  return ruling({
    normalizedIntent: {
      originalText: "I inspect the gate.",
      source: "suggested",
      choiceHandle: "observe-gate",
      kind: "observe",
      targets: [],
      method: "Inspect the gate",
      stakes: "Learn the gate's visible condition",
    },
    citedVisibleFactHandles: ["here"],
    reason: "The gate is visible.",
  });
}

function scopeDiscoveryEffect(affectedHandles: string[]) {
  return {
    kind: "record_world_event" as const,
    eventClass: "discovery" as const,
    performingActorHandle: null,
    summary: "The gate shows visible wear.",
    affectedHandles,
  };
}

function scopeLocationHandles(): string[] {
  return Array.from({ length: 9 }, (_, index) => `scope-location-${index}`);
}

function ruling(overrides: Partial<CampaignPlayJudgeRuling> = {}): CampaignPlayJudgeRuling {
  return {
    disposition: "deterministic",
    normalizedIntent: {
      originalText: "I ask the guard what happened here.", source: "freeform", choiceHandle: null,
      kind: "contact", targets: [{ handle: "guard", kind: "actor" }], method: "Ask calmly", stakes: "Learn what happened",
    },
    movementRouteHandle: null,
    possessionEffectAuthority: { kind: "none" },
    requiredObligationEffect: { kind: "none" },
    citedVisibleFactHandles: ["guard"],
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
    summary: "The player asks the guard about the passage.",
    affectedHandles: ["you", "guard"],
  }],
};

const guardResponseEffect = {
  kind: "record_world_event" as const,
  eventClass: "dialogue" as const,
  performingActorHandle: "guard",
  summary: "The guard answers the player's question.",
  affectedHandles: ["you", "guard"],
};

const toolEffectKinds = [
  "move_actor",
  "enter_local_scene",
  "set_route_state",
  "set_actor_condition",
  "update_actor_relation",
  "update_actor_goal",
  "advance_pressure",
  "adjust_actor_possession",
  "materialize_support_actor",
  "incur_actor_obligation",
  "pay_actor_obligation",
  "record_world_event",
] as const;

function toolTransport(
  elapsedMinutes: number,
  effects: readonly Record<string, unknown>[],
  performerHandles: readonly string[] = ["guard", "introduced-support-actor"],
): Record<string, unknown> {
  const performerKeyByHandle = new Map(
    performerHandles.map((handle, index) => [handle, `p${index + 1}`]),
  );
  const transport: Record<string, unknown> = {
    elapsedMinutes,
    effectOrder: [],
  };
  for (const kind of toolEffectKinds) transport[kind] = [];
  for (const effect of effects) {
    const kind = effect.kind;
    if (typeof kind !== "string" || !toolEffectKinds.includes(kind as typeof toolEffectKinds[number])) {
      throw new Error(`Unsupported tool effect kind: ${String(kind)}`);
    }
    const items = transport[kind] as Record<string, unknown>[];
    const { kind: _kind, ...rawItem } = effect;
    const item = structuredClone(rawItem) as Record<string, unknown>;
    if (kind === "record_world_event") {
      const performerHandle = item.performingActorHandle;
      delete item.performingActorHandle;
      item.performingActorKey = performerHandle === null || performerHandle === ""
        ? ""
        : typeof performerHandle === "string"
          ? (performerKeyByHandle.get(performerHandle) ?? `unknown-${performerHandle}`)
          : `unknown-${String(performerHandle)}`;
    }
    const rawExposure = item.exposure as Record<string, unknown> | undefined;
    if (rawExposure !== undefined) {
      const rawMode = rawExposure.mode;
      if (rawMode === "protected") {
        item.exposure = { mode: "protected", predicates: [] };
      } else if (rawMode === "projectable") {
        const predicates = Array.isArray(rawExposure.predicates)
          ? rawExposure.predicates as Array<Record<string, unknown>>
          : [];
        item.exposure = {
          mode: "projectable",
          predicates: predicates.map((predicate) => ({
            channel: predicate.channel,
            anchorHandle: predicate.anchorHandle ?? predicate.locationId ?? predicate.actorHandle,
            visibleForMinutes: predicate.visibleForMinutes ?? 0,
            triggers: predicate.triggers ?? [],
          })),
        };
      }
    }
    items.push(item);
    (transport.effectOrder as string[]).push(kind);
  }
  return transport;
}

function receivableCollectionFrame(): CampaignPlayGameMasterFrame {
  const value = frame();
  const obligationId = deriveCampaignPlayObligationId(
    CAMPAIGN_ID,
    "actor-guard",
    PLAYER_ID,
    "copper",
  );
  value.visibleFacts.push({
    handle: "guard-receivable",
    kind: "obligation",
    summary: "Oren Tide owes you six copper.",
  });
  value.handleBindings.push({
    handle: "guard-receivable",
    reference: { kind: "obligation", id: obligationId },
  });
  value.rulebookFrame.obligations.push({
    obligationId,
    debtorActorId: "actor-guard",
    creditorActorId: PLAYER_ID,
    unitKey: "copper",
    principalAmount: 6,
    outstandingAmount: 6,
  });
  value.authority.authorizedRefs.push({ kind: "obligation", id: obligationId });
  return value;
}

function receivableCollectionRuling(): CampaignPlayJudgeRuling {
  return ruling({
    normalizedIntent: {
      originalText: "I ask Oren to pay the six copper he owes me.",
      source: "suggested",
      choiceHandle: "collect-payment",
      kind: "contact",
      targets: [{ handle: "guard", kind: "actor" }],
      method: "Ask Oren to settle the recorded payment",
      stakes: "Receive the six copper owed for completed work",
    },
    possessionEffectAuthority: {
      kind: "adjust_actor_possession",
      enforcement: "permitted",
      operation: "acquire",
      possessionHandle: null,
      quantity: 6,
      minimumResult: "success",
    },
    citedVisibleFactHandles: ["guard", "guard-receivable"],
    reason: "Oren is present and the receivable is visible.",
  });
}

describe("Campaign Play Game Master obligations", () => {
  it("compiles one Judge-required debt with code-owned identity, order, scopes, and version", () => {
    const requiredObligationEffect = {
      kind: "incur_actor_obligation" as const,
      debtorHandle: "you",
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
        }, guardResponseEffect],
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

  it("compiles a visible actor's unpaid service debt to the player without reversing the parties", () => {
    const requiredObligationEffect = {
      kind: "incur_actor_obligation" as const,
      debtorHandle: "guard",
      creditorHandle: "you",
      unitKey: "copper" as const,
      amount: 8,
      minimumResult: "success" as const,
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
          debtorActorHandle: "guard",
          creditorActorHandle: "you",
          unitKey: "copper",
          amount: 8,
          summary: "Oren Tide owes the player eight copper for the completed repair.",
          affectedHandles: ["guard", "you"],
        }, guardResponseEffect],
      },
    );
    const obligationId = deriveCampaignPlayObligationId(
      CAMPAIGN_ID,
      "actor-guard",
      PLAYER_ID,
      "copper",
    );

    expect(candidate.batch.commands[1]).toMatchObject({
      kind: "incur_actor_obligation",
      debtorActorId: "actor-guard",
      creditorActorId: PLAYER_ID,
      obligationId,
      unitKey: "copper",
      amount: 8,
    });
    expect(candidate.preflight.accepted).toBe(true);
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
      debtorHandle: "you",
      creditorHandle: "guard",
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
        }, guardResponseEffect],
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

  it("keeps collection of a nonplayer receivable as contact until the debtor acts from owned copper", () => {
    const gameMaster = createCampaignPlayGameMaster();
    const contactOnly = gameMaster.compile(
      receivableCollectionFrame(),
      receivableCollectionRuling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: "guard",
          summary: "Oren acknowledges the request but does not transfer any copper yet.",
          affectedHandles: ["you", "guard", "guard-receivable"],
        }],
      },
    );
    expect(contactOnly.preflight.accepted).toBe(true);
    expect(contactOnly.batch.commands).toHaveLength(2);
    expect(contactOnly.batch.commands[1]).toMatchObject({ kind: "record_world_event" });
    expect(() => gameMaster.compile(
      receivableCollectionFrame(),
      receivableCollectionRuling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "adjust_actor_possession",
          operation: "acquire",
          actorHandle: "you",
          possessionHandle: null,
          name: "Copper coins",
          quantity: 6,
          summary: "Oren pays six copper.",
          affectedHandles: ["you", "guard", "guard-receivable"],
        }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("presents a receivable collection request to the model with acquisition authority removed", async () => {
    const contactOnlyProposal = {
      elapsedMinutes: 1,
      effects: [{
        kind: "record_world_event" as const,
        eventClass: "dialogue" as const,
        performingActorHandle: "guard",
        summary: "Oren acknowledges the request but does not transfer any copper yet.",
        affectedHandles: ["you", "guard", "guard-receivable"],
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: contactOnlyProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The response changes no possession or debt balance." },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: receivableCollectionFrame(),
      ruling: receivableCollectionRuling(),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
      signal: new AbortController().signal,
    });

    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    expect(promptText).toContain(
      "When PLAYER_INTENT asks a targeted nonplayer debtor to settle a cited receivable obligation",
    );
    expect(promptText).toContain('"possessionEffectAuthority":{"kind":"none"}');
    expect(promptText).not.toContain('"possessionEffectAuthority":{"kind":"adjust_actor_possession"');
    expect(promptText).toContain("PERMITTED_RESOURCE_EFFECT_KINDS=[]");
    expect(promptText).not.toContain("Use adjust_actor_possession whenever");
    expect(promptText).not.toContain("effects[].kind accepts exactly: move_actor, enter_local_scene, set_route_state, set_actor_condition, update_actor_relation, update_actor_goal, advance_pressure, adjust_actor_possession");
    const requestSchema = generateObject.mock.calls[0]![0].schema;
    expect(requestSchema.safeParse(contactOnlyProposal).success).toBe(true);
    expect(requestSchema.safeParse({
      elapsedMinutes: 1,
      effects: [{
        kind: "adjust_actor_possession",
        operation: "acquire",
        actorHandle: "you",
        possessionHandle: null,
        name: "Copper coins",
        quantity: 6,
        summary: "Oren pays the six copper.",
        affectedHandles: ["you", "guard", "guard-receivable"],
      }],
    }).success).toBe(false);
  });
});

describe("Campaign Play Game Master obligation authority prompt", () => {
  const obligationRecoveryFeedback = {
    diagnostic: "game_master_semantic_validation_mismatch" as const,
    failedChecks: [{
      check: "mechanical_authority_rejected" as const,
      reviewFailedChecks: ["obligation_authority_missing" as const],
    }],
  };

  it("shares one canonical Judge obligation authority with initial, recovery, and reviewer prompts", async () => {
    const requiredObligationEffect = {
      kind: "incur_actor_obligation" as const,
      debtorHandle: "you",
      creditorHandle: "guard",
      unitKey: "copper" as const,
      amount: 8,
      minimumResult: "setback" as const,
    };
    const obligationProposal = {
      elapsedMinutes: 1,
      effects: [{
        kind: "incur_actor_obligation" as const,
        debtorActorHandle: "you",
        creditorActorHandle: "guard",
        unitKey: "copper" as const,
        amount: 8,
        summary: "You owe Oren Tide eight copper for the broken glass.",
        affectedHandles: ["you", "guard"],
      }, guardResponseEffect],
    };
    const initialGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: obligationProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The debt is the typed Judge transition." },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: initialGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling({ requiredObligationEffect }), resolution,
      uncertaintyAuthority: null, model: model(), temperature: 0.2, budget,
    });

    const recoveryGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: obligationProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The repaired debt remains typed." },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: recoveryGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling({ requiredObligationEffect }), resolution,
      uncertaintyAuthority: null, model: model(), temperature: 0.2, budget,
      recoveryFeedback: obligationRecoveryFeedback,
    });

    const expected = 'OBLIGATION_AUTHORITY={"kind":"incur_actor_obligation","debtorHandle":"you","creditorHandle":"guard","unitKey":"copper","amount":8,"minimumResult":"setback"}';
    const initialPrompt = String(initialGenerateObject.mock.calls[0]![0].prompt);
    const recoveryPrompt = String(recoveryGenerateObject.mock.calls[0]![0].prompt);
    const initialReviewPrompt = String(initialGenerateObject.mock.calls[1]![0].prompt);
    const recoveryReviewPrompt = String(recoveryGenerateObject.mock.calls[1]![0].prompt);
    expect(initialPrompt).toContain(expected);
    expect(recoveryPrompt).toContain(expected);
    expect(initialReviewPrompt).toContain(expected);
    expect(recoveryReviewPrompt).toContain(expected);
    expect(initialPrompt.match(/OBLIGATION_AUTHORITY=.*$/m)?.[0]).toBe(expected);
    expect(recoveryPrompt.match(/OBLIGATION_AUTHORITY=.*$/m)?.[0]).toBe(expected);
    expect(initialReviewPrompt.match(/OBLIGATION_AUTHORITY=.*$/m)?.[0]).toBe(expected);
    expect(recoveryReviewPrompt.match(/OBLIGATION_AUTHORITY=.*$/m)?.[0]).toBe(expected);
    expect(recoveryPrompt).toContain(
      "For obligation_authority_missing, follow OBLIGATION_AUTHORITY exactly. If kind is none, remove every claim that a debt, payment, fee liability, duty balance, or completed bargain changed; keep only the non-binding offer, request, promise, quoted terms, refusal, counteroffer, accepted assignment, or future plan established by the action. If kind is incur_actor_obligation or pay_actor_obligation, emit the one exact permitted typed effect and match its parties, handles, unit, and amount in the public consequence. Do not invent a second obligation or payment.",
    );
    expect(initialPrompt).not.toContain("For obligation_authority_missing,");
    expect(initialGenerateObject).toHaveBeenCalledTimes(2);
    expect(recoveryGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("preserves pay authority handles, unit, amount, and threshold in the canonical block", async () => {
    const paymentFrame = frame();
    const possessionKey = deriveCampaignPlayPossessionKey("Copper coins");
    const paymentPossessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, possessionKey);
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
      debtorHandle: "you",
      creditorHandle: "guard",
      obligationHandle: "guard-debt",
      paymentPossessionHandle: "coins",
      unitKey: "copper" as const,
      amount: 2,
      minimumResult: "success" as const,
    };
    const paymentProposal = {
      elapsedMinutes: 1,
      effects: [{
        kind: "pay_actor_obligation" as const,
        debtorActorHandle: "you",
        creditorActorHandle: "guard",
        obligationHandle: "guard-debt",
        paymentPossessionHandle: "coins",
        unitKey: "copper" as const,
        amount: 2,
        summary: "You pay two copper toward the recorded debt.",
        affectedHandles: ["you", "guard", "coins", "guard-debt"],
      }, guardResponseEffect],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: paymentProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The payment matches the Judge transition." },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: paymentFrame,
      ruling: ruling({ requiredObligationEffect }),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
    });
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'OBLIGATION_AUTHORITY={"kind":"pay_actor_obligation","debtorHandle":"you","creditorHandle":"guard","obligationHandle":"guard-debt","paymentPossessionHandle":"coins","unitKey":"copper","amount":2,"minimumResult":"success"}',
    );
    expect(String(generateObject.mock.calls[1]![0].prompt)).toContain(
      'OBLIGATION_AUTHORITY={"kind":"pay_actor_obligation","debtorHandle":"you","creditorHandle":"guard","obligationHandle":"guard-debt","paymentPossessionHandle":"coins","unitKey":"copper","amount":2,"minimumResult":"success"}',
    );
  });

  it("keeps obligation recovery wording targeted to its safe reviewer coordinate", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The event remains non-mechanical." },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
      recoveryFeedback: obligationRecoveryFeedback,
    });
    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    expect(promptText).toContain('OBLIGATION_AUTHORITY={"kind":"none"}');
    expect(promptText).toContain("OBLIGATION_AUTHORITY is the exact Judge-owned obligation transition for this action.");
    expect(promptText).toContain("For obligation_authority_missing, follow OBLIGATION_AUTHORITY exactly.");
    expect(promptText).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(promptText).not.toContain("SENTINEL_REVIEW_REASON");
  });
});

describe("Campaign Play Game Master repeated-dialogue recovery", () => {
  const repeatedSummary = frame().actorContinuity[0]!.recentOwnActions[0]!.summary;
  const recoveryFeedback = {
    diagnostic: "game_master_semantic_validation_mismatch" as const,
    failedChecks: [{
      check: "repeated_actor_dialogue" as const,
      effectIndex: 0,
      fieldPath: "effects[0].summary",
      performingActorHandle: "guard",
      recentOwnActionIndex: 0,
      }],
  };
  const mechanicalRecoveryFeedback = {
    diagnostic: "game_master_semantic_validation_mismatch" as const,
    failedChecks: [{
      check: "mechanical_authority_rejected" as const,
      reviewFailedChecks: [
        "possession_authority_missing" as const,
        "route_authority_missing" as const,
      ],
    }],
  };
  const possessionTransformRecoveryFeedback = {
    diagnostic: "game_master_semantic_validation_mismatch" as const,
    failedChecks: [{
      check: "mechanical_authority_rejected" as const,
      reviewFailedChecks: ["possession_transform_identity_incomplete" as const],
    }],
  };
  const targetedActorRecoveryFeedback = {
    diagnostic: "game_master_semantic_validation_mismatch" as const,
    failedChecks: [{
      check: "targeted_actor_response_missing" as const,
      intentKind: "contact" as const,
      requiredActorHandles: ["guard"],
      firstActorlessEffectIndex: 0,
    }],
  };

  it("rejects repeated actor dialogue with stable ordered safe coordinates", () => {
    const repeatedProposal = {
      ...proposal,
      effects: [
        { ...proposal.effects[0], summary: repeatedSummary },
        { ...proposal.effects[0], eventClass: "interaction" as const, summary: repeatedSummary },
      ],
    };
    let thrown: unknown;
    try {
      createCampaignPlayGameMaster().compile(
        frame(),
        ruling(),
        resolution,
        null,
        repeatedProposal,
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(CampaignPlayGameMasterError);
    expect(thrown).toMatchObject({ code: "model_contract_failed" });
    const feedback = getCampaignPlayGameMasterRecoveryFeedback(thrown);
    expect(feedback).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [
        {
          check: "repeated_actor_dialogue",
          effectIndex: 0,
          fieldPath: "effects[0].summary",
          performingActorHandle: "guard",
          recentOwnActionIndex: 0,
        },
        {
          check: "repeated_actor_dialogue",
          effectIndex: 1,
          fieldPath: "effects[1].summary",
          performingActorHandle: "guard",
          recentOwnActionIndex: 0,
        },
      ],
    });
    expect(JSON.stringify(feedback)).not.toContain(repeatedSummary);
    expect(JSON.stringify(feedback)).not.toContain("SENTINEL_RAW_PROPOSAL");
  });

  it("preserves safe feedback when semantic failure is wrapped with model evidence", async () => {
    const repeatedProposal = {
      ...proposal,
      effects: [{ ...proposal.effects[0], summary: repeatedSummary }],
    };
    const generateObject = vi.fn().mockResolvedValue({ object: repeatedProposal, trace: trace() });
    let thrown: unknown;
    try {
      await createCampaignPlayGameMaster({
        generateObject: generateObject as unknown as typeof safeGenerateObject,
      }).plan({
        frame: frame(),
        ruling: ruling(),
        resolution,
        uncertaintyAuthority: null,
        model: model(),
        temperature: 0.2,
        budget,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "model_contract_failed",
      modelEvidence: expect.objectContaining({ errorCode: "model_contract_failed" }),
    });
    expect(getCampaignPlayGameMasterRecoveryFeedback(thrown)).toEqual(recoveryFeedback);
    expect(generateObject).toHaveBeenCalledOnce();
  });

  it("adds the exact recovery block only when safe feedback is supplied", async () => {
    const acceptedReview = {
      object: { verdict: "accepted", reason: "The dialogue remains within supplied authority." },
      trace: trace(),
    };
    const normalGenerate = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce(acceptedReview);
    await createCampaignPlayGameMaster({
      generateObject: normalGenerate as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    const normalPrompt = String(normalGenerate.mock.calls[0]![0].prompt);
    expect(normalPrompt).not.toContain("GAME_MASTER_RECOVERY");
    expect(normalPrompt).toContain("ROUTE_AUTHORITY=[]");

    const recoveryGenerate = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce(acceptedReview);
    await createCampaignPlayGameMaster({
      generateObject: recoveryGenerate as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
      recoveryFeedback,
    });
    const recoveryPrompt = String(recoveryGenerate.mock.calls[0]![0].prompt);
    const recoveryBlock = recoveryPrompt.slice(recoveryPrompt.indexOf("GAME_MASTER_RECOVERY"));
    expect(recoveryBlock).toBe([
      "GAME_MASTER_RECOVERY",
      "The previous proposal failed the safe checks below. Generate a new proposal from the unchanged frame, ruling, and resolution. Fix every listed check. For repeated_actor_dialogue, do not reuse the matching ACTOR_CONTINUITY.recentOwnActions summary. Answer the current PLAYER_INTENT in new words and include the current question-specific detail. For mechanical_authority_rejected, make every mechanically durable claim in each event summary agree with the typed resource effects and ROUTE_AUTHORITY. If no typed authority changes a possession, obligation, or route, keep the event summary non-mechanical. All schema, authority, continuity, and Rulebook rules above still apply.",
      "RECOVERY_DIAGNOSTIC",
      JSON.stringify(recoveryFeedback),
      "END_RECOVERY_DIAGNOSTIC",
    ].join("\n"));
    expect(recoveryBlock).not.toContain(repeatedSummary);
    expect(recoveryBlock).not.toContain("SENTINEL_RAW_PROPOSAL");
  });

  it("forwards only the safe mechanical-authority check after reviewer rejection", async () => {
    gameMasterWarn.mockClear();
    gameMasterEvent.mockClear();
    const rejectedProposal = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        summary: "SENTINEL_RAW_PROPOSAL Dren Vask says the route is paid.",
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: rejectedProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "rejected",
          reason: "SENTINEL_REVIEW_REASON Dren Vask and private reviewer prose.",
          failedChecks: [
            "route_authority_missing",
            "possession_authority_missing",
            "route_authority_missing",
          ],
        },
        trace: trace(),
      });
    let thrown: unknown;
    try {
      await createCampaignPlayGameMaster({
        generateObject: generateObject as unknown as typeof safeGenerateObject,
      }).plan({
        frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget,
      });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({
      code: "model_contract_failed",
      modelEvidence: expect.objectContaining({ errorCode: "mechanical_authority_rejected" }),
    });
    expect(getCampaignPlayGameMasterRecoveryFeedback(thrown)).toEqual(mechanicalRecoveryFeedback);
    const feedbackText = JSON.stringify(getCampaignPlayGameMasterRecoveryFeedback(thrown));
    expect(feedbackText).not.toContain("SENTINEL_REVIEW_REASON");
    expect(feedbackText).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(feedbackText).not.toContain("Dren Vask");
    expect(feedbackText).not.toContain(rejectedProposal.effects[0]!.summary);
    const warningPayload = gameMasterWarn.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(warningPayload).toMatchObject({
      code: "model_contract_failed",
      reviewFailedChecks: [
        "possession_authority_missing",
        "route_authority_missing",
      ],
    });
    expect(warningPayload).not.toHaveProperty("proposal");
    expect(JSON.stringify(warningPayload)).not.toContain("SENTINEL_REVIEW_REASON");
    expect(JSON.stringify(warningPayload)).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(JSON.stringify(warningPayload)).not.toContain("Dren Vask");
    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    const [eventName, eventPayload] = gameMasterEvent.mock.calls[0]!;
    expect(eventName).toBe("game_master.contract_rejected");
    expect(eventPayload).toEqual({
      phase: "review",
      errorCode: "model_contract_failed",
      modelEvidenceErrorCode: "mechanical_authority_rejected",
      safeGenerationCode: null,
      recoveryDiagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "mechanical_authority_rejected",
        reviewFailedChecks: ["possession_authority_missing", "route_authority_missing"],
      }],
      reviewFailedChecks: ["possession_authority_missing", "route_authority_missing"],
      denial: null,
    });
    expect(JSON.stringify(eventPayload)).not.toContain("SENTINEL_REVIEW_REASON");
    expect(JSON.stringify(eventPayload)).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(JSON.stringify(eventPayload)).not.toContain("Dren Vask");
    expect(generateObject).toHaveBeenCalledTimes(2);
  });

  it("passes route-authority reviewer checks to the automatic second plan request", async () => {
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
    const rejectedProposal = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        summary: "The guard describes a toll bridge before the south harbor.",
      }],
    };
    const correctedProposal = {
      ...rejectedProposal,
      effects: [{
        ...rejectedProposal.effects[0],
        summary: "The guard says the passage runs directly south and needs no permit.",
      }],
    };
    const firstGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: rejectedProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "rejected",
          reason: "The summary invents an access condition.",
          failedChecks: ["route_authority_missing"],
        },
        trace: trace(),
      });
    let firstError: unknown;
    try {
      await createCampaignPlayGameMaster({
        generateObject: firstGenerateObject as unknown as typeof safeGenerateObject,
      }).plan({
        frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget,
      });
    } catch (error) {
      firstError = error;
    }
    const feedback = getCampaignPlayGameMasterRecoveryFeedback(firstError);
    expect(feedback).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "mechanical_authority_rejected",
        reviewFailedChecks: ["route_authority_missing"],
      }],
    });

    const secondGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: correctedProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The route claim matches the open route." },
        trace: trace(),
      });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: secondGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
      recoveryFeedback: feedback,
    });
    expect(candidate.preflight.accepted).toBe(true);
    const recoveryPrompt = String(secondGenerateObject.mock.calls[0]![0].prompt);
    expect(recoveryPrompt).toContain(
      'ROUTE_AUTHORITY=[{"routeHandle":"passage","state":"open","accessRequirement":"none","viaLocationHandle":null}]',
    );
    expect(recoveryPrompt).toContain(
      "For route_authority_missing, remove or correct only unsupported campaign-route edge topology, state, waypoint, detour, or traversal requirements. Preserve grounded ordinary location descriptions and wayfinding that make none of those claims. Do not invent a location while repairing.",
    );
    expect(recoveryPrompt).toContain(JSON.stringify(feedback));
    expect(secondGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("renders the mechanical-authority recovery instruction without rejected content", async () => {
    const acceptedReview = {
      object: { verdict: "accepted", reason: "The corrected proposal remains within typed authority." },
      trace: trace(),
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce(acceptedReview);
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
      recoveryFeedback: mechanicalRecoveryFeedback,
    });
    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    expect(promptText).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(promptText).toContain([
      "GAME_MASTER_RECOVERY",
      "The previous proposal failed the safe checks below. Generate a new proposal from the unchanged frame, ruling, and resolution. Fix every listed check. For repeated_actor_dialogue, do not reuse the matching ACTOR_CONTINUITY.recentOwnActions summary. Answer the current PLAYER_INTENT in new words and include the current question-specific detail. For mechanical_authority_rejected, make every mechanically durable claim in each event summary agree with the typed resource effects and ROUTE_AUTHORITY. If no typed authority changes a possession, obligation, or route, keep the event summary non-mechanical. For route_authority_missing, remove or correct only unsupported campaign-route edge topology, state, waypoint, detour, or traversal requirements. Preserve grounded ordinary location descriptions and wayfinding that make none of those claims. Do not invent a location while repairing. All schema, authority, continuity, and Rulebook rules above still apply.",
      "RECOVERY_DIAGNOSTIC",
      JSON.stringify(mechanicalRecoveryFeedback),
      "END_RECOVERY_DIAGNOSTIC",
    ].join("\n"));
    expect(promptText).not.toContain(
      "For possession_transform_identity_incomplete, name each transformed possession as the complete retained item or container after the transform. Preserve the source identity and include every material content or state added by the accepted action. Do not rely on summary to carry durable identity, and do not imply an untracked split or remainder.",
    );
  });

  it("renders the possession-transform recovery instruction only for its safe reviewer coordinate", async () => {
    const acceptedReview = {
      object: { verdict: "accepted", reason: "The corrected possession remains within typed authority." },
      trace: trace(),
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce(acceptedReview);
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
      recoveryFeedback: possessionTransformRecoveryFeedback,
    });
    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    expect(promptText).toContain(
      "For possession_transform_identity_incomplete, name each transformed possession as the complete retained item or container after the transform. Preserve the source identity and include every material content or state added by the accepted action. Do not rely on summary to carry durable identity, and do not imply an untracked split or remainder.",
    );
    expect(promptText).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(promptText).not.toContain("SENTINEL_REVIEW_REASON");
    expect(promptText).not.toContain("Dren Vask");
    expect(JSON.stringify(possessionTransformRecoveryFeedback)).not.toContain("SENTINEL_RAW_PROPOSAL");
  });

  it("renders the targeted-contact recovery instruction with only safe coordinates", async () => {
    const acceptedReview = {
      object: { verdict: "accepted", reason: "The corrected reply precedes the actorless result." },
      trace: trace(),
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce(acceptedReview);
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
      recoveryFeedback: targetedActorRecoveryFeedback,
    });
    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    expect(promptText).toContain("GAME_MASTER_RECOVERY");
    expect(promptText).toContain(
      "For targeted_actor_response_missing, include one dialogue or interaction record_world_event for every handle in requiredActorHandles, copy that same handle into performingActorHandle, and put all required responses before the first actorless discovery or scene event.",
    );
    expect(promptText).toContain("RECOVERY_DIAGNOSTIC");
    expect(promptText).toContain(JSON.stringify(targetedActorRecoveryFeedback));
    expect(promptText).toContain("END_RECOVERY_DIAGNOSTIC");
    expect(promptText).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(promptText).not.toContain("SENTINEL_REVIEW_REASON");
    expect(promptText).not.toContain("Oren Tide's private response");
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

function schemaContractFailureModel(): LanguageModel {
  const value = new MockLanguageModelV3({
    provider: "test-provider",
    modelId: "test-model",
    doGenerate: async () => ({
      content: [{
        type: "tool-call",
        toolCallId: "structured-output-failure",
        toolName: "structured_output",
        input: JSON.stringify({
          SENTINEL_RAW_PROPOSAL: "SENTINEL_PLAYER_AND_ACTOR_PROSE",
        }),
      }],
      finishReason: { unified: "tool-calls", raw: undefined },
      response: { modelId: "test-model" },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 12, text: 12, reasoning: undefined },
      },
      warnings: [],
    }),
  });
  rememberStructuredOutputModelMetadata(value, buildStructuredOutputModelMetadata({
    providerId: "test-provider", providerName: "Test Provider", model: "test-model",
    protocol: "openai-compatible", baseUrl: "https://api.z.ai/v1", transport: "chat-completions",
  }));
  return value;
}

function trace(
  strategy: SafeGenerateTrace["strategy"] = "native_schema",
  usage: SafeGenerateTrace["usage"] = { inputTokens: 100, outputTokens: 80, totalTokens: 180 },
  requestedMode: SafeGenerateTrace["requestedMode"] = "auto",
): SafeGenerateTrace {
  const primaryStrategy: SafeGenerateTrace["primaryStrategy"] =
    strategy === "repair" || strategy === "full_retry" ? "native_schema" : strategy;
  return {
    text: "private", cleanedText: "private", requestedMode, strategy,
    primaryStrategy, fallbackStrategy: "text_fallback",
    capability: { requestedMode, primaryStrategy, fallbackStrategy: "text_fallback",
      actualMode: primaryStrategy, reason: "test", providerId: "test-provider",
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

  it("materializes one contacted ambient resident with code-owned identity and an immediate reply", () => {
    const ambientRuling = ruling({
      normalizedIntent: {
        originalText: "I call to the nearby workers and offer to mend a torn boot.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [{ handle: "here", kind: "location" }],
        method: "Offer a practical repair to anyone within earshot",
        stakes: "Find one resident willing to stop and answer",
      },
      citedVisibleFactHandles: ["here"],
      reason: "Nearby residents can hear and choose whether to respond.",
    });
    const supportProfile = {
      name: "Sella Rook",
      summary: "A rope mender with a torn work boot and a waxed canvas tool roll.",
    };
    const candidate = createCampaignPlayGameMaster().compile(
      frame(),
      ambientRuling,
      resolution,
      null,
      {
        elapsedMinutes: 2,
        effects: [
          {
            kind: "materialize_support_actor",
            actorHandle: "introduced-support-actor",
            ...supportProfile,
            goal: "Earn enough before rain closes the bridge market.",
            motivation: "Keep the family workshop supplied through the wet season.",
            nextIntentKind: "contact",
            observableTrace: "Sella unrolls waxed thread and tests a frayed rope by hand.",
            cadenceMinutes: 30,
          },
          {
            kind: "record_world_event",
            eventClass: "dialogue",
            performingActorHandle: "introduced-support-actor",
            summary: "A woman with a torn boot stops. ‘Sella Rook. Show me your stitching first; if it holds, we can talk price.’",
            affectedHandles: ["you", "here", "introduced-support-actor"],
          },
        ],
      },
    );
    const ids = deriveCampaignPlaySupportActorIds({
      campaignId: CAMPAIGN_ID,
      turnId: TURN_ID,
      locationId: "location-a",
      ...supportProfile,
    });

    expect(candidate.preflight.accepted).toBe(true);
    expect(candidate.batch.commands).toHaveLength(3);
    expect(candidate.batch.commands[1]).toMatchObject({
      kind: "materialize_support_actor",
      order: 1,
      expectedWorldVersion: 8,
      ...ids,
      locationId: "location-a",
      name: supportProfile.name,
      planIntentKind: "contact",
      planMethod: "Earn enough before rain closes the bridge market.",
      priority: 3,
      steps: [{
        intentKind: "contact",
        method: "Earn enough before rain closes the bridge market.",
        elapsedBounds: { minimumMinutes: 1, maximumMinutes: 10 },
      }],
    });
    expect(candidate.batch.commands[2]).toMatchObject({
      kind: "record_world_event",
      order: 2,
      expectedWorldVersion: 9,
      performingActorId: ids.actorId,
      affectedRefs: expect.arrayContaining([
        { kind: "actor", id: ids.actorId },
        { kind: "actor", id: PLAYER_ID },
      ]),
    });
  });

  it("gives the strict proposal and authority review independent model-call timeouts", async () => {
    const workerController = new AbortController();
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The dialogue changes no mechanical resource state.",
        },
        trace: trace(),
      });
    const gameMaster = createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject });
    const result = await gameMaster.plan({ frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, signal: workerController.signal });
    expect(result.preflight.accepted).toBe(true);
    expect(result.semanticReview).toEqual({
      kind: "mechanical_authority",
      reviewHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    const options = generateObject.mock.calls[0]![0];
    expect(options).toMatchObject({ strictSchema: true, allowRepair: false, allowTextFallback: false,
      retries: 1, abortSignal: workerController.signal, mode: "auto", timeout: { totalMs: 180_000 } });
    const reviewOptions = generateObject.mock.calls[1]![0];
    expect(reviewOptions).toMatchObject({ strictSchema: true, allowRepair: false,
      allowTextFallback: false, retries: 1, abortSignal: workerController.signal, mode: "auto",
      timeout: { totalMs: 180_000 } });
    const reviewSchema = reviewOptions.schema as z.ZodType;
    expect(reviewSchema.safeParse({
      verdict: "accepted",
      reason: "No mechanical claim changes.",
      failedChecks: [],
    }).success).toBe(true);
    expect(reviewSchema.safeParse({
      verdict: "accepted",
      reason: "No mechanical claim changes.",
    }).success).toBe(false);
    expect(reviewSchema.safeParse({
      verdict: "accepted",
      reason: "No mechanical claim changes.",
      failedChecks: ["route_authority_missing"],
    }).success).toBe(false);
    expect(reviewSchema.safeParse({
      verdict: "rejected",
      reason: "A typed authority check failed.",
      failedChecks: ["route_authority_missing", "route_authority_missing"],
    }).success).toBe(true);
    expect(reviewSchema.safeParse({
      verdict: "rejected",
      reason: "A typed authority check failed.",
      failedChecks: [],
    }).success).toBe(false);
    expect(reviewSchema.safeParse({
      verdict: "rejected",
      reason: "A typed authority check failed.",
      failedChecks: ["SENTINEL_UNKNOWN_CHECK"],
    }).success).toBe(false);
    expect(reviewSchema.safeParse({
      verdict: "rejected",
      reason: "A typed authority check failed.",
    }).success).toBe(false);
    const reviewSchemaJson = JSON.stringify(z.toJSONSchema(reviewSchema));
    expect(reviewSchemaJson).toContain("player_intent_unfulfilled");
    expect(reviewSchemaJson).toContain("possession_authority_missing");
    expect(reviewSchemaJson).toContain("obligation_authority_missing");
    expect(reviewSchemaJson).toContain("route_authority_missing");
    expect(reviewSchemaJson).toContain("possession_transform_identity_incomplete");
    expect(reviewSchemaJson).toContain("other_mechanical_authority_mismatch");
    expect(reviewSchemaJson).toContain("minItems");
    expect(reviewSchemaJson).toContain("maxItems");
    expect(String(reviewOptions.prompt)).toContain("A record_world_event is presentation evidence, never mechanical authority");
    expect(String(reviewOptions.prompt)).toContain("unless typedResourceEffects contains the matching possession effect");
    expect(String(reviewOptions.prompt)).toContain("unless typedResourceEffects contains the matching obligation effect");
    expect(String(reviewOptions.prompt)).toContain('"typedResourceEffects":[]');
    expect(String(reviewOptions.prompt)).toContain(
      "Set failedChecks to [] when verdict is accepted. When verdict is rejected, include each applicable safe check once: player_intent_unfulfilled when the proposal drops or leaves unresolved a material part of PLAYER_INTENT; possession_authority_missing for an untyped possession or custody change; obligation_authority_missing for an untyped debt, payment, or duty change; route_authority_missing for an unsupported route or access claim; possession_transform_identity_incomplete when a typed transformation leaves retained possession identity incomplete; other_mechanical_authority_mismatch only when none of the specific checks applies. Do not copy event summaries, proposal text, player text, actor names, location names, provider text, or the free-form reason into failedChecks.",
    );
    expect(String(reviewOptions.prompt)).toContain(
      "Do not classify an ordinary location description or ordinary wayfinding as route_authority_missing unless the prose actually asserts a campaign route edge",
    );
    expect(String(reviewOptions.prompt)).toContain(
      "REVIEW_OUTPUT_CONTRACT\nReturn exactly one object with exactly these keys: verdict, reason, failedChecks. failedChecks is mandatory.",
    );
    expect(String(reviewOptions.prompt).trimEnd()).toMatch(
      /REVIEW_OUTPUT_CONTRACT[\s\S]*Do not add, omit, default, or repair any key\.$/,
    );
    expect(String(options.prompt)).toContain("opaque handles");
    expect(String(options.prompt)).toContain("SOURCE_MOMENT is the exact accepted player-visible scene");
    expect(String(options.prompt)).toContain("PLAYER_PROFILE is protected authority for the player's durable identity, history, and capabilities");
    expect(String(options.prompt)).toContain("must not assert the opposite of PLAYER_PROFILE as fact");
    expect(String(options.prompt)).toContain('PLAYER_PROFILE={"backgroundSummary":"Fifteen years maintaining the harbor signal bridge."');
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
    expect(String(options.prompt)).toContain(
      "ROUTE_AUTHORITY governs campaign route edges and their traversal state or requirements. A location description or ordinary wayfinding",
    );
    expect(String(options.prompt)).toContain(
      "Such information must still be grounded in SOURCE_MOMENT, VISIBLE_FACTS, ACTOR_CONTINUITY, or ACTOR_DIRECTIVES",
    );
    expect(String(options.prompt)).toContain("not a new source of world facts");
    expect(String(options.prompt)).toContain("A clean, empty, missing, or disturbed surface establishes only its current observable state");
    expect(String(options.prompt)).toContain("Do not expose protected truth by guessing");
    expect(String(options.prompt)).toContain("Unknowns are constraints, not a checklist for the public summary");
    expect(String(options.prompt)).toContain("do not enumerate every interpretation the evidence fails to prove");
    expect(String(options.prompt)).toContain("materialize each usable player-visible value in the committed summary");
    expect(String(options.prompt)).toContain("Never say that a value was read, written down, repeated, counted, or confirmed while omitting the value itself");
    expect(String(options.prompt)).toContain(
      'ALLOWED_HANDLES=["you","guard","here","south","passage","delay","trust","guard-goal","introduced-support-actor"]',
    );
    expect(String(options.prompt)).toContain(
      'HANDLES_BY_KIND={"actor":["you","guard","introduced-support-actor"],"location":["here","south"],"route":["passage"],"pressure":["delay"],"relation":["trust"],"goal":["guard-goal"]}',
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
    expect(String(options.prompt)).toContain("PLAYER_INTENT owns the player's method and scope");
    expect(String(options.prompt)).toContain("Preserve every concrete trade, material, tool, target, and explicit exclusion or refusal");
    expect(String(options.prompt)).toContain("never substitute a nearby profession or revive a rejected method");
    expect(String(options.prompt)).toContain("A generic approach, observation, or wait does not authorize an offer");
    expect(String(options.prompt)).toContain("Autonomous actor scheduling runs after the primary batch");
    expect(String(options.prompt)).toContain("Do not freeze their later state in an actorless summary");
    expect(String(options.prompt)).toContain("Crossing into an already known Rulebook location requires PLAYER_MOVEMENT");
    expect(String(options.prompt)).toContain("Prior scene prose may explain context but cannot add a player action");
    expect(String(options.prompt)).toContain("does not turn an unfamiliar actor into a fully cooperative informant");
    expect(String(options.prompt)).toContain("A direct question identifies the topic but never gives the speaker a reason to answer");
    expect(String(options.prompt)).toContain("reciprocal value already supplied or explicitly committed in PLAYER_INTENT");
    expect(String(options.prompt)).toContain("do not recruit the player to find or report on that person");
    expect(String(options.prompt)).toContain("Do not invent a quest");
    expect(String(options.prompt)).toContain("an actor must not deny, misattribute, or forget an action");
    expect(String(options.prompt)).toContain(
      "Never copy a summary from that actor's ACTOR_CONTINUITY.recentOwnActions",
    );
    expect(String(options.prompt)).toContain(
      'ACTOR_CONTINUITY=[{"actorHandle":"guard","recentOwnActions":[{"summary":"Oren Tide inspected the passage latch before the traveler arrived.","observableTrace":"Fresh oil marks the passage latch."}]}]',
    );
    expect(String(options.prompt)).toContain("ACTOR_DIRECTIVES is protected roleplay authority");
    expect(String(options.prompt)).toContain(
      "For an attempt with nonplayer actor targets, their response is part of the outcome",
    );
    expect(String(options.prompt)).toContain("REQUIRED_ACTOR_RESPONSES is the complete code-owned list");
    expect(String(options.prompt)).toContain('REQUIRED_ACTOR_RESPONSES=["guard"]');
    expect(String(options.prompt)).toContain("Omitting, delaying, or replacing a required response with actorless prose invalidates the whole proposal");
    expect(String(options.prompt)).toContain(
      "A successful roll resolves the player's effort; it does not create permission or cooperation",
    );
    expect(String(options.prompt)).toContain("CANONICAL_PEOPLE is the complete durable person roster at the start of this call");
    expect(String(options.prompt)).toContain("A person name outside this list does not identify an actor, even when SOURCE_MOMENT or prior prose mentions it");
    expect(String(options.prompt)).toContain("Unless the materialize_support_actor contract below applies, an unlisted resident cannot own a job");
    expect(String(options.prompt)).toContain("Use materialize_support_actor only for a contact with unnamed ambient residents in CURRENT_EXACT_SCENE");
    expect(String(options.prompt)).toContain("Code derives every identity, placement, role, priority, plan step, timing bounds, scope, version, and receipt");
    expect(String(options.prompt)).toContain("write that targeted person's actual spoken reply, silence, gesture, or action");
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
    expect(String(options.prompt)).toContain("CURRENT_EXACT_SCENE is the Rulebook placement boundary");
    expect(String(options.prompt)).toContain("may establish rooms, corridors, thresholds, floors, trails, or other local features inside it");
    expect(String(options.prompt)).toContain("without changing exact position, use an actorless discovery or scene result");
    expect(String(options.prompt)).toContain("When the accepted action advances into a distinct directly perceivable scene, follow the enter_local_scene contract");
    expect(String(options.prompt)).toContain("Crossing into an already known Rulebook location requires PLAYER_MOVEMENT");
    expect(String(options.prompt)).toContain(
      'CURRENT_EXACT_SCENE={"locationName":"North Harbor Gate","description":"A guarded passage gate."}',
    );
    expect(String(options.prompt)).toContain(
      'LOCAL_SCENE_AUTHORITY={"forbiddenNames":["North Harbor Gate"],"presentPeople":[]}',
    );
    expect(String(options.prompt)).toContain(
      "Its name must differ case-insensitively from every LOCAL_SCENE_AUTHORITY.forbiddenNames entry",
    );
    expect(String(options.prompt)).toContain(
      "presentPeople is the complete named-person roster permitted in that scene",
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
      "Actor placement changes only through an accepted move_actor or materialize_support_actor effect",
    );
    expect(String(options.prompt)).toContain(
      "VISIBLE_FACTS route handles are code-authoritative topology and access state",
    );
    expect(String(options.prompt)).toContain(
      "Dialogue and SOURCE_MOMENT do not create route access rules",
    );
    expect(String(options.prompt)).toContain(
      "A route claim with state open and accessRequirement none establishes no crossing payment",
    );
    expect(String(options.prompt)).toContain(
      "do not infer a conditional charge from the route's name, an actor's title or duties",
    );
    expect(String(options.prompt)).toContain(
      "they establish no charge, debt, tithe, collection rule, liable category, or conditional obligation",
    );
    expect(String(options.prompt)).toContain(
      "omit every separate financial duty, collection practice, liable category, and conditional payment",
    );
    expect(String(options.prompt)).toContain(
      "treat that dialogue as a continuity error rather than protected character belief",
    );
    expect(String(options.prompt)).toContain(
      "Do not repeat, qualify, defend, or preserve the conflicting toll",
    );
    expect(String(options.prompt)).toContain(
      "Do not output routeAccessClaims or other route-authority metadata. Route topology and access are supplied by code to the reviewer. Write event prose that agrees with VISIBLE_FACTS and accepted set_route_state effects.",
    );
    expect(String(options.prompt)).toContain('"eventClass":"discovery"');
    expect(String(options.prompt)).toContain(
      "effects[].kind accepts exactly: move_actor, enter_local_scene, set_route_state, set_actor_condition, update_actor_relation, update_actor_goal, advance_pressure, materialize_support_actor, record_world_event",
    );
    expect(String(options.prompt)).toContain("PERMITTED_RESOURCE_EFFECT_KINDS=[]");
    expect(String(options.prompt)).not.toContain("Use pay_actor_obligation for");
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
    expect(String(options.prompt)).toContain("Player possession is code-owned authority");
    expect(String(options.prompt)).toContain("A general tool possession never supplies raw material, fasteners, or another consumable");
    expect(String(options.prompt)).toContain("A work assignment, supply list, visible stock");
    expect(String(options.prompt)).toContain("record_world_event cannot substitute for a possession transition");
    expect(String(options.prompt)).toContain("No resource effect kind is available for this proposal");
    expect(String(options.prompt)).toContain("Leave every possession quantity and obligation balance unchanged");
    expect(String(options.prompt)).not.toContain("Use adjust_actor_possession whenever");
    expect(String(options.prompt)).toContain("WORLD_TIME_AUTHORITY is code-owned");
    expect(String(options.prompt)).toContain("Any clock time, part of day, date, deadline, duration, or relative phrase");
    expect(String(options.prompt)).toContain('WORLD_TIME_AUTHORITY={"actionStart":{"totalMinutes":10,"day":1,"hour":0,"minute":10},"resultRange":{"earliest":{"totalMinutes":11,"day":1,"hour":0,"minute":11},"latest":{"totalMinutes":13,"day":1,"hour":0,"minute":13}}}');
    expect(String(options.prompt)).not.toContain("Every non-null adjust_actor_possession name must be at most");
    expect(String(options.prompt)).toContain("Every summary must fit its schema limit: at most 1200 characters");
    expect(String(options.prompt)).toContain("Do not include planning or reasoning, and do not repeat supporting facts");
    expect(String(options.prompt)).not.toContain("actor-player");
    expect(String(options.prompt)).not.toContain("actor-guard");
  });

  it("uses the requested strict tool mode for the proposal and authority review", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({
        object: toolTransport(proposal.elapsedMinutes, proposal.effects),
        trace: trace("tool_mode", undefined, "tool"),
      })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The dialogue changes no mechanical resource state.",
          failedChecks: [],
        },
        trace: trace("tool_mode", undefined, "tool"),
      });
    const gameMaster = createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    });
    await gameMaster.plan({
      frame: frame(),
      ruling: ruling(),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
      structuredOutputMode: "tool",
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(generateObject.mock.calls.map(([options]) => options.mode)).toEqual(["tool", "tool"]);

    const proposalSchema = generateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    const reviewerSchema = generateObject.mock.calls[1]![0].schema as z.ZodType<unknown>;
    const proposalSchemaJson = JSON.stringify(z.toJSONSchema(proposalSchema));
    const reviewerSchemaJson = JSON.stringify(z.toJSONSchema(reviewerSchema));
    for (const forbiddenKeyword of ["anyOf", "oneOf", "const", "prefixItems"]) {
      expect(proposalSchemaJson).not.toContain(forbiddenKeyword);
      expect(reviewerSchemaJson).not.toContain(forbiddenKeyword);
    }
    const proposalJson = z.toJSONSchema(proposalSchema) as {
      required?: string[];
      properties?: Record<string, {
        items?: { properties?: Record<string, { enum?: string[] }> };
      }>;
    };
    expect(proposalJson.required).toEqual(expect.arrayContaining([
      "elapsedMinutes",
      "effectOrder",
      ...toolEffectKinds,
    ]));
    expect(proposalJson.properties?.record_world_event?.items?.properties?.eventClass?.enum)
      .toEqual(expect.arrayContaining(["dialogue", "discovery"]));
    const proposalJsonText = JSON.stringify(proposalJson);
    expect(proposalJsonText).not.toContain("performingActorHandle");
    expect(proposalJsonText).not.toContain('"index"');
    expect(proposalJsonText).toContain('"p1"');
    expect(proposalJsonText).toContain('"p2"');
    expect(proposalJson.properties?.effectOrder?.items).toEqual(expect.objectContaining({
      enum: expect.arrayContaining([...toolEffectKinds]),
    }));
    expect(proposalSchema.safeParse({
      ...toolTransport(proposal.elapsedMinutes, [{ ...proposal.effects[0], performingActorHandle: "you" }]),
    }).success).toBe(false);
    expect(proposalSchema.safeParse({
      ...toolTransport(proposal.elapsedMinutes, [{
        ...proposal.effects[0],
        performingActorHandle: "introduced-support-actor",
        affectedHandles: ["you", "introduced-support-actor"],
      }]),
    }).success).toBe(true);
    expect(proposalSchema.safeParse({
      ...toolTransport(proposal.elapsedMinutes, [{ ...proposal.effects[0], performingActorHandle: "" }]),
    }).success).toBe(false);
    expect(proposalSchema.safeParse({
      ...toolTransport(proposal.elapsedMinutes, [{ ...proposal.effects[0], performingActorHandle: null }]),
    }).success).toBe(false);
    const missingPerformer = toolTransport(proposal.elapsedMinutes, [proposal.effects[0]]);
    delete (missingPerformer.record_world_event as Record<string, unknown>[])[0]!.performingActorKey;
    expect(proposalSchema.safeParse(missingPerformer).success).toBe(false);
    const oldRawPerformer = toolTransport(proposal.elapsedMinutes, [proposal.effects[0]]);
    const oldRawRow = (oldRawPerformer.record_world_event as Record<string, unknown>[])[0]!;
    delete oldRawRow.performingActorKey;
    oldRawRow.performingActorHandle = "guard";
    expect(proposalSchema.safeParse(oldRawPerformer).success).toBe(false);
    expect(proposalSchema.safeParse({
      ...toolTransport(5, [{ kind: "move_actor", actorHandle: "" }]),
    }).success).toBe(true);
    expect(proposalSchema.safeParse({
      ...toolTransport(5, [{ kind: "move_actor", actorHandle: null }]),
    }).success).toBe(false);
    expect(proposalSchema.safeParse({
      ...toolTransport(5, [{ kind: "move_actor" }]),
    }).success).toBe(false);
    expect(proposalSchemaJson).toContain('""');
    const sentinelInstruction =
      'For move_actor.actorHandle and record_world_event.performingActorKey, include the required field and return the empty string "" when the domain value is null. For materialize_support_actor.nextAction, include the required string and return the empty string "" when the domain value is omitted. Never emit JSON null or omit a required field.';
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(sentinelInstruction);
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "The named effect arrays in TOOL_MODE_OUTPUT_CONTRACT are the complete transport surface; do not emit a flat effects array.",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).not.toContain("effects[].kind accepts exactly:");
    expect(String(generateObject.mock.calls[0]![0].prompt)).not.toContain(
      "set_actor_condition has exactly these fields: kind,",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "nextAction is a required string; return the empty string when the domain action is omitted.",
    );
    const reviewerJson = z.toJSONSchema(reviewerSchema) as { required?: string[] };
    expect(reviewerJson.required).toEqual(expect.arrayContaining(["verdict", "reason", "failedChecks"]));
    expect(reviewerSchema.safeParse({
      verdict: "accepted",
      reason: "The event is grounded.",
      failedChecks: ["route_authority_missing"],
    }).success).toBe(false);
    expect(reviewerSchema.safeParse({
      verdict: "rejected",
      reason: "The event is not grounded.",
      failedChecks: [],
    }).success).toBe(false);
  });

  it("rejects contradictory reviewer verdict coupling through the private plan boundary", async () => {
    const cases = [
      {
        label: "accepted with failed checks",
        review: {
          verdict: "accepted" as const,
          reason: "The event is grounded.",
          failedChecks: ["route_authority_missing" as const],
        },
      },
      {
        label: "rejected without failed checks",
        review: {
          verdict: "rejected" as const,
          reason: "The event is not grounded.",
          failedChecks: [] as const,
        },
      },
    ];
    for (const malformedCase of cases) {
      const generateObject = vi.fn()
        .mockResolvedValueOnce({
          object: toolTransport(proposal.elapsedMinutes, proposal.effects),
          trace: trace("tool_mode", undefined, "tool"),
        })
        .mockResolvedValueOnce({
          object: malformedCase.review,
          trace: trace("tool_mode", undefined, "tool"),
        });
      let thrown: unknown;
      try {
        await createCampaignPlayGameMaster({
          generateObject: generateObject as unknown as typeof safeGenerateObject,
        }).plan({
          frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
          model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, malformedCase.label).toMatchObject({ code: "model_contract_failed" });
      expect(getCampaignPlayGameMasterRecoveryFeedback(thrown), malformedCase.label).toMatchObject({
        diagnostic: "game_master_semantic_validation_mismatch",
        failedChecks: [],
        contractDiagnostic: { phase: "domain_mismatch", coordinate: "reviewer.domain" },
      });
      expect(generateObject).toHaveBeenCalledTimes(2);
    }
  });

  it("keeps the null-sentinel contract in a recovered tool-mode attempt", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({
        object: toolTransport(proposal.elapsedMinutes, proposal.effects),
        trace: trace("tool_mode", undefined, "tool"),
      })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The corrected dialogue remains grounded.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    const recoveryFeedback = {
      diagnostic: "game_master_semantic_validation_mismatch" as const,
      failedChecks: [{
        check: "mechanical_authority_rejected" as const,
        reviewFailedChecks: ["route_authority_missing" as const],
      }],
    };
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool", recoveryFeedback,
    });
    const recoveryPrompt = String(generateObject.mock.calls[0]![0].prompt);
    expect(recoveryPrompt).toContain(
      'For move_actor.actorHandle and record_world_event.performingActorKey, include the required field and return the empty string "" when the domain value is null. For materialize_support_actor.nextAction, include the required string and return the empty string "" when the domain value is omitted. Never emit JSON null or omit a required field.',
    );
  });

  it("partitions the fixed-key exposure transport and rejects mixed or contradictory channels", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({
        object: toolTransport(proposal.elapsedMinutes, proposal.effects),
        trace: trace("tool_mode", undefined, "tool"),
      })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The event is grounded.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    const proposalSchema = generateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    const exposureItem = (predicate: Record<string, unknown>) => toolTransport(1, [{
      kind: "set_actor_condition",
      exposure: { mode: "projectable", predicates: [predicate] },
      actorHandle: "guard",
      condition: "strained",
      operation: "set",
      summary: "The guard looks strained.",
    }]);
    for (const predicate of [
      { channel: "direct_perception", anchorHandle: "here", visibleForMinutes: 0, triggers: [] },
      { channel: "local_aftermath", anchorHandle: "here", visibleForMinutes: 5, triggers: [] },
      { channel: "route_state", anchorHandle: "passage", visibleForMinutes: 0, triggers: ["inspect"] },
      { channel: "witness_report", anchorHandle: "guard", visibleForMinutes: 0, triggers: [] },
    ]) {
      expect(proposalSchema.safeParse(exposureItem(predicate)).success).toBe(true);
    }
    const protectedTransport = toolTransport(1, [{
      kind: "set_actor_condition",
      exposure: { mode: "protected" },
      actorHandle: "guard",
      condition: "strained",
      operation: "set",
      summary: "The guard looks strained.",
    }]);
    expect(proposalSchema.safeParse(protectedTransport).success).toBe(true);
    const oldProtected = structuredClone(protectedTransport);
    ((oldProtected.set_actor_condition as Record<string, unknown>[])[0]!.exposure as Record<string, unknown>) = {
      mode: "protected",
    };
    expect(proposalSchema.safeParse(oldProtected).success).toBe(false);
    const missingFixedKey = exposureItem({
      channel: "direct_perception", anchorHandle: "here", visibleForMinutes: 0, triggers: [],
    });
    delete (((missingFixedKey.set_actor_condition as Record<string, unknown>[])[0]!.exposure as Record<string, unknown>)
      .predicates as Record<string, unknown>[])[0]!.visibleForMinutes;
    expect(proposalSchema.safeParse(missingFixedKey).success).toBe(false);
    const mixedFields = exposureItem({
      channel: "direct_perception", anchorHandle: "here", visibleForMinutes: 0, triggers: [],
    });
    const mixedPredicate = (((mixedFields.set_actor_condition as Record<string, unknown>[])[0]!.exposure as Record<string, unknown>)
      .predicates as Record<string, unknown>[])[0]!;
    mixedPredicate.locationId = "here";
    expect(proposalSchema.safeParse(mixedFields).success).toBe(false);

    const protectedNonEmpty = toolTransport(1, [{
      kind: "set_actor_condition",
      exposure: { mode: "protected", predicates: [] },
      actorHandle: "guard", condition: "strained", operation: "set", summary: "The guard looks strained.",
    }]);
    (((protectedNonEmpty.set_actor_condition as Record<string, unknown>[])[0]!.exposure as Record<string, unknown>)
      .predicates as Record<string, unknown>[]).push({
        channel: "direct_perception", anchorHandle: "here", visibleForMinutes: 0, triggers: [],
      });
    const privateDecodeCases = [
      {
        label: "empty route trigger set",
        transport: exposureItem({ channel: "route_state", anchorHandle: "passage", visibleForMinutes: 0, triggers: [] }),
        coordinate: "exposure.predicates[0].route_state.triggers",
      },
      {
        label: "duplicate route trigger set",
        transport: exposureItem({ channel: "route_state", anchorHandle: "passage", visibleForMinutes: 0, triggers: ["inspect", "inspect"] }),
        coordinate: "exposure.predicates[0].route_state.triggers",
      },
      {
        label: "projectable empty partition",
        transport: toolTransport(1, [{
          kind: "set_actor_condition",
          exposure: { mode: "projectable", predicates: [] },
          actorHandle: "guard", condition: "strained", operation: "set", summary: "The guard looks strained.",
        }]),
        coordinate: "exposure.predicates.cardinality",
      },
      {
        label: "protected non-empty partition",
        transport: protectedNonEmpty,
        coordinate: "exposure.protected.predicates",
      },
    ];
    for (const malformedCase of privateDecodeCases) {
      let thrown: unknown;
      const malformedGenerateObject = vi.fn().mockResolvedValue({
        object: malformedCase.transport,
        trace: trace("tool_mode", undefined, "tool"),
      });
      try {
        await createCampaignPlayGameMaster({
          generateObject: malformedGenerateObject as unknown as typeof safeGenerateObject,
        }).plan({
          frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
          model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
        });
      } catch (error) {
        thrown = error;
      }
      expect(thrown, malformedCase.label).toMatchObject({ code: "model_contract_failed" });
      expect(getCampaignPlayGameMasterRecoveryFeedback(thrown), malformedCase.label).toMatchObject({
        contractDiagnostic: { phase: "private_decode", coordinate: malformedCase.coordinate },
      });
      expect(malformedGenerateObject).toHaveBeenCalledTimes(1);
    }
  });

  it("requires a model-owned name only for new acquisition and transform, and carries only its sanitized coordinate into recovery", async () => {
    const possessionRuling = ruling({
      possessionEffectAuthority: {
        kind: "adjust_actor_possession", enforcement: "required", operation: "acquire",
        possessionHandle: null, quantity: 1, minimumResult: "success",
      },
    });
    const malformedTransport = toolTransport(1, [{
      kind: "adjust_actor_possession",
      name: "Copper chit",
      summary: "The guard hands over one copper chit.",
      affectedHandles: ["you", "guard"],
    }, guardResponseEffect]);
    delete (malformedTransport.adjust_actor_possession as Record<string, unknown>[])[0]!.name;
    const firstGenerateObject = vi.fn().mockResolvedValue({
      object: malformedTransport,
      trace: trace("tool_mode", undefined, "tool"),
    });
    let firstError: unknown;
    try {
      await createCampaignPlayGameMaster({
        generateObject: firstGenerateObject as unknown as typeof safeGenerateObject,
      }).plan({
        frame: frame(), ruling: possessionRuling, resolution, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
      });
    } catch (error) {
      firstError = error;
    }
    expect(firstError).toMatchObject({ code: "model_contract_failed" });
    const recoveryFeedback = getCampaignPlayGameMasterRecoveryFeedback(firstError);
    expect(recoveryFeedback).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [],
      contractDiagnostic: { phase: "provider_extraction", coordinate: "adjust_actor_possession.name" },
    });
    expect(JSON.stringify(recoveryFeedback)).not.toContain("Copper chit");

    const correctedTransport = toolTransport(1, [{
      kind: "adjust_actor_possession",
      name: "Copper chit",
      summary: "The guard hands over one copper chit.",
      affectedHandles: ["you", "guard"],
    }, guardResponseEffect]);
    const correctedGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: correctedTransport, trace: trace("tool_mode", undefined, "tool") })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The corrected typed acquisition is grounded.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    await createCampaignPlayGameMaster({
      generateObject: correctedGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: possessionRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool", recoveryFeedback,
    });
    const correctedPrompt = String(correctedGenerateObject.mock.calls[0]![0].prompt);
    expect(correctedPrompt).toContain(
      "The previous tool response failed the provider_extraction contract at adjust_actor_possession.name. Return the same fixed object shape with that coordinate corrected. Do not add prose or change any code-owned field.",
    );
    expect(correctedPrompt).not.toContain("Copper chit");
  });

  it("forbids names on existing-stack acquire and spend, requires them on transform, and keeps unavailable authority empty", async () => {
    const possessionKey = deriveCampaignPlayPossessionKey("Copper chit");
    const possessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, possessionKey);
    const sourceFrame = frame();
    sourceFrame.visibleFacts.push({ handle: "copper-chit", kind: "possession", summary: "Copper chit: 2" });
    sourceFrame.handleBindings.push({ handle: "copper-chit", reference: { kind: "possession", id: possessionId } });
    sourceFrame.authority.authorizedRefs.push({ kind: "possession", id: possessionId });
    sourceFrame.rulebookFrame.possessions.push({ possessionId, actorId: PLAYER_ID, possessionKey, name: "Copper chit", quantity: 2 });
    const readSchema = async (requestRuling: CampaignPlayJudgeRuling) => {
      const authority = requestRuling.possessionEffectAuthority;
      const possessionEffect = authority.kind === "adjust_actor_possession"
        ? {
            kind: "adjust_actor_possession" as const,
            ...(authority.operation === "transform" || authority.possessionHandle === null
              ? { name: "Stamped copper chit" }
              : {}),
            summary: "The possession transition is complete.",
            affectedHandles: ["you"],
          }
        : proposal.effects[0]!;
      const generateObject = vi.fn()
        .mockResolvedValueOnce({ object: toolTransport(1, [possessionEffect, guardResponseEffect]), trace: trace("tool_mode", undefined, "tool") })
        .mockResolvedValueOnce({ object: { verdict: "accepted", reason: "No mechanical change.", failedChecks: [] }, trace: trace("tool_mode", undefined, "tool") });
      await createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject }).plan({
        frame: sourceFrame, ruling: requestRuling, resolution, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
      });
      return generateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    };
    const spendRuling = ruling({
      possessionEffectAuthority: {
        kind: "adjust_actor_possession", enforcement: "required", operation: "spend",
        possessionHandle: "copper-chit", quantity: 1, minimumResult: "success",
      },
      citedVisibleFactHandles: ["guard", "copper-chit"],
    });
    const spendSchema = await readSchema(spendRuling);
    const spendBase = toolTransport(1, [{ kind: "adjust_actor_possession", summary: "One chit is spent.", affectedHandles: ["you"] }, guardResponseEffect]);
    expect(spendSchema.safeParse(spendBase).success).toBe(true);
    const illicitSpend = structuredClone(spendBase);
    (illicitSpend.adjust_actor_possession as Record<string, unknown>[])[0]!.name = "Illicit name";
    expect(spendSchema.safeParse(illicitSpend).success).toBe(false);

    const transformRuling = ruling({
      possessionEffectAuthority: {
        kind: "adjust_actor_possession", enforcement: "required", operation: "transform",
        possessionHandle: "copper-chit", quantity: 1, minimumResult: "success",
      },
      citedVisibleFactHandles: ["guard", "copper-chit"],
    });
    const transformSchema = await readSchema(transformRuling);
    const transformBase = toolTransport(1, [{ kind: "adjust_actor_possession", summary: "The chit is stamped.", affectedHandles: ["you"] }, guardResponseEffect]);
    expect(transformSchema.safeParse(transformBase).success).toBe(false);
    const namedTransform = structuredClone(transformBase);
    (namedTransform.adjust_actor_possession as Record<string, unknown>[])[0]!.name = "Stamped copper chit";
    expect(transformSchema.safeParse(namedTransform).success).toBe(true);

    const unavailableGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: toolTransport(1, [proposal.effects[0]]), trace: trace("tool_mode", undefined, "tool") })
      .mockResolvedValueOnce({ object: { verdict: "accepted", reason: "No mechanical change.", failedChecks: [] }, trace: trace("tool_mode", undefined, "tool") });
    await createCampaignPlayGameMaster({ generateObject: unavailableGenerateObject as unknown as typeof safeGenerateObject }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    const unavailableSchema = unavailableGenerateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    const illicitUnavailable = toolTransport(1, [{
      kind: "adjust_actor_possession", summary: "An unauthorized item.", affectedHandles: ["you"],
    }]);
    expect(unavailableSchema.safeParse(illicitUnavailable).success).toBe(false);
  });

  it("distinguishes provider extraction, private decode, and domain mismatch without retaining raw content", async () => {
    const domainMismatch = toolTransport(1, [{
      kind: "record_world_event",
      eventClass: "dialogue",
      performingActorHandle: "guard",
      summary: " The guard answers. ",
      affectedHandles: ["you", "guard", "introduced-support-actor"],
    }]);
    const cases = [
      {
        label: "private decode",
        transport: toolTransport(1, [{
          kind: "set_actor_condition",
          exposure: { mode: "projectable", predicates: [{ channel: "route_state", anchorHandle: "passage", visibleForMinutes: 0, triggers: ["inspect", "inspect"] }] },
          actorHandle: "guard", condition: "strained", operation: "set", summary: "The guard looks strained.",
        }]),
        diagnostic: { phase: "private_decode", coordinate: "exposure.predicates[0].route_state.triggers" },
      },
      {
        label: "domain mismatch",
        transport: domainMismatch,
        diagnostic: { phase: "domain_mismatch", coordinate: "proposal.domain" },
      },
    ] as const;
    for (const malformedCase of cases) {
      const generateObject = vi.fn().mockResolvedValue({
        object: malformedCase.transport,
        trace: trace("tool_mode", undefined, "tool"),
      });
      let thrown: unknown;
      try {
        await createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject }).plan({
          frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
          model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
        });
      } catch (error) {
        thrown = error;
      }
      const feedback = getCampaignPlayGameMasterRecoveryFeedback(thrown);
      expect(feedback?.contractDiagnostic, malformedCase.label).toEqual(malformedCase.diagnostic);
      expect(JSON.stringify(feedback)).not.toContain("The guard answers.");
      expect(generateObject).toHaveBeenCalledTimes(1);
    }
  });

  it("keeps native schema planning on the unchanged effects transport", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace("native_schema") })
      .mockResolvedValueOnce({ object: { verdict: "accepted", reason: "The event is grounded." }, trace: trace("native_schema") });
    await createCampaignPlayGameMaster({ generateObject: generateObject as unknown as typeof safeGenerateObject }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    const nativeSchema = generateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    expect(nativeSchema.safeParse(proposal).success).toBe(true);
    expect(JSON.stringify(z.toJSONSchema(nativeSchema))).toContain("effects");
    expect(generateObject.mock.calls[0]![0].mode).toBe("auto");
  });

  it("keeps every non-resource tool array strict and decodes the required empty nextAction sentinel", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({
        object: toolTransport(proposal.elapsedMinutes, [proposal.effects[0]]),
        trace: trace("tool_mode", undefined, "tool"),
      })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The event is grounded.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    const proposalSchema = generateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    const fixtures: Record<string, Record<string, unknown>> = {
      move_actor: { actorHandle: "" },
      enter_local_scene: { name: "Gatehouse alcove", description: "A narrow alcove by the latch." },
      set_route_state: { exposure: { mode: "protected" }, routeHandle: "passage", state: "open", reason: "The route remains open." },
      set_actor_condition: { exposure: { mode: "protected" }, actorHandle: "guard", condition: "strained", operation: "set", summary: "The guard looks strained." },
      update_actor_relation: { exposure: { mode: "protected" }, relationHandle: "trust", intensity: 2, summary: "Trust rises slightly." },
      update_actor_goal: { exposure: { mode: "protected" }, goalHandle: "guard-goal", status: "active", summary: "The guard keeps the route orderly." },
      advance_pressure: { exposure: { mode: "protected" }, pressureHandle: "delay", amount: 1, resultStatus: "active" },
      materialize_support_actor: {
        actorHandle: "introduced-support-actor", name: "Sella Rook", summary: "A rope mender pauses nearby.",
        goal: "Find a dry place before rain.", motivation: "Protect the workshop tools.", nextIntentKind: "observe",
        nextAction: "", observableTrace: "Waxed thread catches the light.", cadenceMinutes: 30,
      },
      record_world_event: { eventClass: "dialogue", performingActorHandle: "guard", summary: "The guard answers plainly.", affectedHandles: ["you", "guard"] },
    };
    for (const [kind, item] of Object.entries(fixtures)) {
      const valid = toolTransport(1, [{ kind, ...item }]);
      expect(proposalSchema.safeParse(valid).success, kind).toBe(true);
      const row = (valid[kind] as Record<string, unknown>[])[0]!;
      expect(row).not.toHaveProperty("kind");
      const withKind = structuredClone(valid);
      ((withKind[kind] as Record<string, unknown>[])[0]!).kind = kind;
      expect(proposalSchema.safeParse(withKind).success, `${kind} rejects kind`).toBe(false);
    }
    const omittedNextAction = toolTransport(1, [{
      kind: "materialize_support_actor",
      ...fixtures.materialize_support_actor,
    }]);
    delete (omittedNextAction.materialize_support_actor as Record<string, unknown>[])[0]!.nextAction;
    expect(proposalSchema.safeParse(omittedNextAction).success).toBe(false);
  });

  it("reconstructs kind-list tool order and rejects missing, over-covered, and wrong-kind entries", async () => {
    const firstEvent = {
      kind: "record_world_event" as const,
      eventClass: "dialogue" as const,
      performingActorHandle: "guard",
      summary: "The guard answers the first part of the question.",
      affectedHandles: ["you", "guard"],
    };
    const secondEvent = {
      ...firstEvent,
      summary: "The guard adds the second part of the answer.",
    };
    const orderedTransport = toolTransport(1, [firstEvent, secondEvent]);
    const orderedItems = orderedTransport.record_world_event as Record<string, unknown>[];
    orderedTransport.record_world_event = [orderedItems[1], orderedItems[0]];
    orderedTransport.effectOrder = ["record_world_event", "record_world_event"];
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: orderedTransport, trace: trace("tool_mode", undefined, "tool") })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "Both ordered responses are grounded.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    const orderedCandidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    const orderedSummaries = orderedCandidate.batch.commands
      .filter((command) => command.kind === "record_world_event")
      .map((command) => command.summary);
    expect(orderedSummaries).toEqual([
      secondEvent.summary,
      firstEvent.summary,
    ]);

    const ambientRuling = ruling({
      normalizedIntent: {
        originalText: "I call to the nearby workers and offer to mend a torn boot.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [],
        method: "Offer a practical repair to anyone within earshot",
        stakes: "Find one resident willing to stop and answer",
      },
      citedVisibleFactHandles: ["here"],
      reason: "Nearby residents can hear and choose whether to respond.",
    });
    const supportEffects = [
      {
        kind: "materialize_support_actor" as const,
        actorHandle: "introduced-support-actor",
        name: "Sella Rook",
        summary: "A rope mender pauses nearby.",
        goal: "Find a dry place before rain.",
        motivation: "Protect the workshop tools.",
        nextIntentKind: "observe" as const,
        nextAction: "",
        observableTrace: "Waxed thread catches the light.",
        cadenceMinutes: 30,
      },
      {
        kind: "record_world_event" as const,
        eventClass: "dialogue" as const,
        performingActorHandle: "introduced-support-actor",
        summary: "Sella offers to inspect the torn boot.",
        affectedHandles: ["you", "here", "introduced-support-actor"],
      },
      {
        kind: "record_world_event" as const,
        eventClass: "discovery" as const,
        performingActorHandle: null,
        summary: "The torn boot shows a clean place to start stitching.",
        affectedHandles: ["here"],
      },
    ];
    const mixedTransport = toolTransport(2, supportEffects, ["introduced-support-actor"]);
    mixedTransport.effectOrder = [
      "materialize_support_actor",
      "record_world_event",
      "record_world_event",
    ];
    const mixedGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: mixedTransport, trace: trace("tool_mode", undefined, "tool") })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The support actor and observations are grounded.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    const mixedCandidate = await createCampaignPlayGameMaster({
      generateObject: mixedGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ambientRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    expect(mixedCandidate.batch.commands.map((command) => command.kind)).toEqual([
      "advance_world_time",
      "materialize_support_actor",
      "record_world_event",
      "record_world_event",
    ]);
    expect(mixedCandidate.batch.commands.slice(2).map((command) =>
      command.kind === "record_world_event" ? command.eventClass : command.kind,
    )).toEqual(["dialogue", "discovery"]);

    const malformedCases: Array<{ label: string; transport: Record<string, unknown> }> = [];
    const missing = toolTransport(1, [firstEvent, secondEvent]);
    missing.effectOrder = ["record_world_event"];
    malformedCases.push({ label: "missing", transport: missing });
    const overCovered = toolTransport(1, [firstEvent, secondEvent]);
    overCovered.effectOrder = ["record_world_event", "record_world_event", "record_world_event"];
    malformedCases.push({ label: "over-covered", transport: overCovered });
    const wrongKind = toolTransport(1, [firstEvent]);
    wrongKind.effectOrder = ["move_actor"];
    malformedCases.push({ label: "wrong-kind", transport: wrongKind });
    const oldIndexed = toolTransport(1, [firstEvent]);
    oldIndexed.effectOrder = [{ kind: "record_world_event", index: 0 }];
    malformedCases.push({ label: "old-indexed-order", transport: oldIndexed });
    for (const malformedCase of malformedCases) {
      const malformedGenerateObject = vi.fn().mockResolvedValue({
        object: malformedCase.transport,
        trace: trace("tool_mode", undefined, "tool"),
      });
      await expect(createCampaignPlayGameMaster({
        generateObject: malformedGenerateObject as unknown as typeof safeGenerateObject,
      }).plan({
        frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
      })).rejects.toMatchObject({ code: "model_contract_failed" });
      expect(malformedGenerateObject, malformedCase.label).toHaveBeenCalledTimes(1);
    }
  });

  it("decodes empty-string sentinels to exact domain nulls for movement, possession, and actorless events", async () => {
    const moveRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "I cross to South Harbor.", source: "suggested", choiceHandle: "cross-passage",
        kind: "move", targets: [{ handle: "passage", kind: "route" }, { handle: "south", kind: "location" }],
        method: "Cross the open passage", stakes: "Reach South Harbor",
      },
      citedVisibleFactHandles: ["passage", "south"],
    });
    const moveGenerateObject = vi.fn()
      .mockResolvedValueOnce({
        object: toolTransport(5, [{ kind: "move_actor", actorHandle: "" }]),
        trace: trace("tool_mode", undefined, "tool"),
      });
    const moveCandidate = await createCampaignPlayGameMaster({
      generateObject: moveGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: moveRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    expect(moveCandidate.batch.commands[1]).toMatchObject({ kind: "move_actor", actorId: PLAYER_ID });

    const acquisitionProposal = toolTransport(1, [
      {
        kind: "adjust_actor_possession",
        name: "Copper chit",
        summary: "Oren hands over two copper chits for the copied manifests.",
        affectedHandles: ["you", "guard"],
      },
      guardResponseEffect,
    ]);
    const acquisitionGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: acquisitionProposal, trace: trace("tool_mode", undefined, "tool") })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The typed acquisition is the only durable possession change.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    const acquisitionCandidate = await createCampaignPlayGameMaster({
      generateObject: acquisitionGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling({
        possessionEffectAuthority: {
          kind: "adjust_actor_possession", enforcement: "required", operation: "acquire",
          possessionHandle: null, quantity: 2, minimumResult: "success",
        },
      }),
      resolution, uncertaintyAuthority: null, model: model(), temperature: 0.2, budget,
      structuredOutputMode: "tool",
    });
    const acquisitionCommand = acquisitionCandidate.batch.commands.find((command) =>
      command.kind === "adjust_actor_possession");
    expect(acquisitionCommand).toMatchObject({
      kind: "adjust_actor_possession",
      name: "Copper chit",
      quantityDelta: 2,
    });
    const acquisitionSchema = acquisitionGenerateObject.mock.calls[0]![0].schema as z.ZodType<unknown>;
    expect(acquisitionSchema.safeParse(acquisitionProposal).success).toBe(true);
    expect(acquisitionSchema.safeParse({
      ...acquisitionProposal,
      adjust_actor_possession: [{
        ...(acquisitionProposal.adjust_actor_possession as Record<string, unknown>[])[0],
        operation: "acquire",
      }],
    }).success).toBe(false);
    const missingPossessionName = {
      ...(acquisitionProposal.adjust_actor_possession as Record<string, unknown>[])[0],
    };
    delete missingPossessionName.name;
    expect(acquisitionSchema.safeParse({
      ...acquisitionProposal,
      adjust_actor_possession: [missingPossessionName],
    }).success).toBe(false);
    expect(acquisitionSchema.safeParse({
      ...acquisitionProposal,
      adjust_actor_possession: [{
        ...(acquisitionProposal.adjust_actor_possession as Record<string, unknown>[])[0],
        name: null,
      }],
    }).success).toBe(false);
    expect(acquisitionSchema.safeParse({
      ...acquisitionProposal,
      adjust_actor_possession: [{
        ...(acquisitionProposal.adjust_actor_possession as Record<string, unknown>[])[0],
        name: "",
      }],
    }).success).toBe(false);

    const actorlessProposal = toolTransport(1, [{
        kind: "record_world_event" as const,
        eventClass: "discovery" as const,
        performingActorHandle: "",
        summary: "The gate shows visible wear.",
        affectedHandles: ["here"],
      }]);
    const actorlessGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: actorlessProposal, trace: trace("tool_mode", undefined, "tool") })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The discovery resolves the admitted inspection.", failedChecks: [] },
        trace: trace("tool_mode", undefined, "tool"),
      });
    const actorlessCandidate = await createCampaignPlayGameMaster({
      generateObject: actorlessGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: scopeOverflowRuling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, structuredOutputMode: "tool",
    });
    expect(actorlessCandidate.batch.commands.find((command) => command.kind === "record_world_event"))
      .toMatchObject({ kind: "record_world_event", performingActorId: null });
  });

  it("rejects irrelevant partition fields before any reviewer call", async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: toolTransport(proposal.elapsedMinutes, [{ ...proposal.effects[0], actorHandle: "guard" }]),
      trace: trace("tool_mode", undefined, "tool"),
    });
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
      budget,
      structuredOutputMode: "tool",
    })).rejects.toMatchObject({ code: "model_contract_failed" });
    expect(generateObject).toHaveBeenCalledTimes(1);
  });

  it("rejects duplicate and unmatched resource rows in native and partitioned transports", async () => {
    const requiredPossessionRuling = ruling({
      possessionEffectAuthority: {
        kind: "adjust_actor_possession", enforcement: "required", operation: "acquire",
        possessionHandle: null, quantity: 2, minimumResult: "success",
      },
    });
    const requiredIncurRuling = ruling({
      requiredObligationEffect: {
        kind: "incur_actor_obligation", debtorHandle: "you", creditorHandle: "guard",
        unitKey: "copper", amount: 8, minimumResult: "success",
      },
    });
    const requiredPayRuling = ruling({
      requiredObligationEffect: {
        kind: "pay_actor_obligation", debtorHandle: "you", creditorHandle: "guard",
        obligationHandle: "guard-debt", paymentPossessionHandle: "coins", unitKey: "copper",
        amount: 2, minimumResult: "success",
      },
    });
    const nativeAdjust = {
      kind: "adjust_actor_possession",
      operation: "acquire",
      actorHandle: "you",
      possessionHandle: null,
      name: "Copper chit",
      quantity: 2,
      summary: "Oren hands over two copper chits.",
      affectedHandles: ["you", "guard"],
    };
    const toolAdjust = {
      kind: "adjust_actor_possession",
      summary: "Oren hands over two copper chits.",
      affectedHandles: ["you", "guard"],
      name: "Copper chit",
    };
    const nativeIncur = {
      kind: "incur_actor_obligation",
      debtorActorHandle: "you",
      creditorActorHandle: "guard",
      unitKey: "copper",
      amount: 8,
      summary: "You owe Oren eight copper.",
      affectedHandles: ["you", "guard"],
    };
    const toolIncur = {
      kind: "incur_actor_obligation",
      summary: "You owe Oren eight copper.",
      affectedHandles: ["you", "guard"],
    };
    const nativePay = {
      kind: "pay_actor_obligation",
      debtorActorHandle: "you",
      creditorActorHandle: "guard",
      obligationHandle: "guard-debt",
      paymentPossessionHandle: "coins",
      unitKey: "copper",
      amount: 2,
      summary: "You pay Oren two copper.",
      affectedHandles: ["you", "guard", "guard-debt", "coins"],
    };
    const toolPay = {
      kind: "pay_actor_obligation",
      summary: "You pay Oren two copper.",
      affectedHandles: ["you", "guard", "guard-debt", "coins"],
    };
    const cases: Array<{
      label: string;
      ruling: CampaignPlayJudgeRuling;
      nativeEffects: Record<string, unknown>[];
      toolEffects: Record<string, unknown>[];
    }> = [
      {
        label: "two matching adjust rows",
        ruling: requiredPossessionRuling,
        nativeEffects: [nativeAdjust, nativeAdjust, guardResponseEffect],
        toolEffects: [toolAdjust, toolAdjust, guardResponseEffect],
      },
      {
        label: "two matching incur rows",
        ruling: requiredIncurRuling,
        nativeEffects: [nativeIncur, nativeIncur, guardResponseEffect],
        toolEffects: [toolIncur, toolIncur, guardResponseEffect],
      },
      {
        label: "two matching pay rows",
        ruling: requiredPayRuling,
        nativeEffects: [nativePay, nativePay, guardResponseEffect],
        toolEffects: [toolPay, toolPay, guardResponseEffect],
      },
      {
        label: "matching possession plus unmatched obligation",
        ruling: requiredPossessionRuling,
        nativeEffects: [nativeAdjust, nativeIncur, guardResponseEffect],
        toolEffects: [toolAdjust, toolIncur, guardResponseEffect],
      },
      {
        label: "matching incur plus unmatched payment",
        ruling: requiredIncurRuling,
        nativeEffects: [nativeIncur, nativePay, guardResponseEffect],
        toolEffects: [toolIncur, toolPay, guardResponseEffect],
      },
      {
        label: "matching payment plus unmatched incur",
        ruling: requiredPayRuling,
        nativeEffects: [nativePay, nativeIncur, guardResponseEffect],
        toolEffects: [toolPay, toolIncur, guardResponseEffect],
      },
    ];
    for (const testCase of cases) {
      for (const mode of ["native", "tool"] as const) {
        const toolMode = mode === "tool";
        const generatedObject = toolMode
          ? toolTransport(1, testCase.toolEffects)
          : { elapsedMinutes: 1, effects: testCase.nativeEffects };
        const generateObject = vi.fn().mockResolvedValue({
          object: generatedObject,
          trace: trace(toolMode ? "tool_mode" : "native_schema", undefined, toolMode ? "tool" : "auto"),
        });
        await expect(createCampaignPlayGameMaster({
          generateObject: generateObject as unknown as typeof safeGenerateObject,
        }).plan({
          frame: frame(),
          ruling: testCase.ruling,
          resolution,
          uncertaintyAuthority: null,
          model: model(),
          temperature: 0.2,
          budget,
          structuredOutputMode: toolMode ? "tool" : "auto",
        })).rejects.toMatchObject({ code: "model_contract_failed" });
        expect(generateObject, testCase.label + ` (${mode})`).toHaveBeenCalledTimes(1);
      }
    }
  });

  it("rejects a verbatim repeat of the performing actor's recent dialogue", () => {
    const requestFrame = frame();
    const repeatedSummary = requestFrame.actorContinuity[0]!.recentOwnActions[0]!.summary;
    expect(() => createCampaignPlayGameMaster().compile(
      requestFrame,
      ruling(),
      resolution,
      null,
      {
        ...proposal,
        effects: [{ ...proposal.effects[0], summary: repeatedSummary }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(createCampaignPlayGameMaster().compile(
      requestFrame,
      ruling(),
      resolution,
      null,
      proposal,
    ).batch.commands).toHaveLength(2);
  });

  it("constrains every generated handle field to admitted frame bindings", async () => {
    const requestFrame = frame();
    requestFrame.visibleFacts.push({ handle: "choice-only", kind: "choice", summary: "A UI choice, not an entity ref." });
    const generateObject = vi.fn()
      .mockImplementationOnce(async (options: Parameters<typeof safeGenerateObject>[0]) => {
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
      })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The dialogue changes no mechanical resource state." },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({ frame: requestFrame, ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget });
    const promptText = String(generateObject.mock.calls[0]![0].prompt);
    const allowedLine = promptText.split("\n").find((value) => value.startsWith("ALLOWED_HANDLES="));
    expect(JSON.parse(allowedLine!.slice("ALLOWED_HANDLES=".length))).toEqual(
      [...requestFrame.handleBindings.map((binding) => binding.handle), "introduced-support-actor"],
    );
  });

  it("does not require route metadata for an observation", async () => {
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
    const generateObject = vi.fn()
      .mockImplementationOnce(async (options: Parameters<typeof safeGenerateObject>[0]) => {
        const schema = options.schema as typeof campaignPlayGameMasterProposalSchema;
        expect(schema.safeParse(observationProposal).success).toBe(true);
        return { object: observationProposal, trace: trace() };
      })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The discovery resolves the admitted inspection without inventing route mechanics.",
          failedChecks: [],
        },
        trace: trace(),
      });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: observationRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    expect(candidate.preflight.accepted).toBe(true);
    expect(generateObject).toHaveBeenCalledTimes(2);
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

  it("requires a targeted actor to respond before an actorless attempt result", () => {
    const attemptRuling = ruling({
      normalizedIntent: {
        originalText: "I pull at the latch the guard just secured.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [
          { handle: "here", kind: "location" },
          { handle: "guard", kind: "actor" },
        ],
        method: "Pull at the secured latch",
        stakes: "Open the gate",
      },
    });
    const actorlessResult = {
      kind: "record_world_event" as const,
      eventClass: "discovery" as const,
      performingActorHandle: null,
      summary: "The latch holds fast under the pull.",
      affectedHandles: ["here"],
    };
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      attemptRuling,
      resolution,
      null,
      { elapsedMinutes: 1, effects: [actorlessResult] },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));

    const response = {
      kind: "record_world_event" as const,
      eventClass: "interaction" as const,
      performingActorHandle: "guard",
      summary: "The guard plants one hand on the gate and orders you away from the latch.",
      affectedHandles: ["guard"],
    };
    expect(createCampaignPlayGameMaster().compile(
      frame(),
      attemptRuling,
      resolution,
      null,
      { elapsedMinutes: 1, effects: [response, actorlessResult] },
    ).preflight.accepted).toBe(true);
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      attemptRuling,
      resolution,
      null,
      { elapsedMinutes: 1, effects: [actorlessResult, response] },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("requires a targeted contact actor to respond before an actorless result", () => {
    const actorlessResult = {
      kind: "record_world_event" as const,
      eventClass: "discovery" as const,
      performingActorHandle: null,
      summary: "A posted notice catches the player's eye.",
      affectedHandles: ["here"],
    };
    let thrown: unknown;
    try {
      createCampaignPlayGameMaster().compile(
        frame(),
        ruling(),
        resolution,
        null,
        { elapsedMinutes: 1, effects: [actorlessResult] },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "model_contract_failed" });
    expect(getCampaignPlayGameMasterRecoveryFeedback(thrown)).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "targeted_actor_response_missing",
        intentKind: "contact",
        requiredActorHandles: ["guard"],
        firstActorlessEffectIndex: 0,
      }],
    });
    const feedbackText = JSON.stringify(getCampaignPlayGameMasterRecoveryFeedback(thrown));
    expect(feedbackText).not.toContain(actorlessResult.summary);
    expect(feedbackText).not.toContain("SENTINEL_RAW_PROPOSAL");

    const delayedResponse = [actorlessResult, guardResponseEffect];
    let delayedThrown: unknown;
    try {
      createCampaignPlayGameMaster().compile(
        frame(), ruling(), resolution, null,
        { elapsedMinutes: 1, effects: delayedResponse },
      );
    } catch (error) {
      delayedThrown = error;
    }
    expect(delayedThrown).toMatchObject({ code: "model_contract_failed" });
    expect(getCampaignPlayGameMasterRecoveryFeedback(delayedThrown)).toEqual(
      getCampaignPlayGameMasterRecoveryFeedback(thrown),
    );

    const accepted = createCampaignPlayGameMaster().compile(
      frame(), ruling(), resolution, null,
      { elapsedMinutes: 1, effects: [guardResponseEffect, actorlessResult] },
    );
    expect(accepted.preflight.accepted).toBe(true);
    expect(accepted.batch.commands).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "record_world_event",
        affectedRefs: expect.arrayContaining([{ kind: "actor", id: "actor-guard" }]),
        readScope: expect.arrayContaining([{ kind: "actor", id: "actor-guard" }]),
      }),
    ]));
  });

  it("accepts route-targeted dialogue without model-owned route metadata", () => {
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
        summary: "The guard says the passage runs directly south and needs no permit.",
      }],
    };
    expect(createCampaignPlayGameMaster().compile(
      frame(), routeRuling, resolution, null, grounded,
    ).preflight.accepted).toBe(true);
    const citedRouteRuling = ruling({
      normalizedIntent: {
        originalText: "I ask what passage stamping requires.",
        source: "freeform",
        choiceHandle: null,
        kind: "contact",
        targets: [{ handle: "guard", kind: "actor" }],
        method: "Ask about passage stamping",
        stakes: "Learn the local access rule",
      },
      citedVisibleFactHandles: ["guard", "passage"],
    });
    expect(createCampaignPlayGameMaster().compile(
      frame(), citedRouteRuling, resolution, null, grounded,
    ).preflight.accepted).toBe(true);
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
      frame(), routeRuling, resolution, null,
      { ...grounded, effects: [{ ...grounded.effects[0], routeAccessClaims: [] }] },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("rejects route-authority metadata as an extra strict schema key", () => {
    const extraMetadata = {
      ...proposal,
      effects: [{ ...proposal.effects[0], routeAccessClaims: [] }],
    };
    expect(campaignPlayGameMasterProposalSchema.safeParse(extraMetadata).success).toBe(false);
    expect(() => createCampaignPlayGameMaster().compile(
      frame(), ruling(), resolution, null, extraMetadata,
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("supplies canonical code-owned route authority to the reviewer", async () => {
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
      citedVisibleFactHandles: ["passage", "guard"],
    });
    const generateObject = vi.fn()
      .mockResolvedValueOnce({
        object: {
          ...proposal,
          effects: [{
            ...proposal.effects[0],
            summary: "The guard says the passage runs directly south and needs no permit.",
          }],
        },
        trace: trace(),
      })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The route prose agrees with code-owned authority." },
        trace: trace(),
      });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    expect(candidate.preflight.accepted).toBe(true);
    const proposerPrompt = String(generateObject.mock.calls[0]![0].prompt);
    expect(proposerPrompt).toContain(
      'ROUTE_AUTHORITY=[{"routeHandle":"passage","state":"open","accessRequirement":"none","viaLocationHandle":null}]',
    );
    expect(proposerPrompt).toContain(
      "ROUTE_AUTHORITY is code-owned route topology and access for the current action. Every route or access statement in event prose must match it. Do not invent payment, permission, stamps, credentials, checkpoints, intermediate locations, blockage, or detours.",
    );
    expect(proposerPrompt).toContain(
      "ROUTE_AUTHORITY governs campaign route edges and their traversal state or requirements. A location description or ordinary wayfinding",
    );
    expect(proposerPrompt).toContain(
      "Such information must still be grounded in SOURCE_MOMENT, VISIBLE_FACTS, ACTOR_CONTINUITY, or ACTOR_DIRECTIVES",
    );
    const reviewPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(reviewPrompt).toContain(
      'ROUTE_AUTHORITY=[{"routeHandle":"passage","state":"open","accessRequirement":"none","viaLocationHandle":null}]',
    );
    expect(reviewPrompt).toContain(
      "Do not classify an ordinary location description or ordinary wayfinding as route_authority_missing unless the prose actually asserts a campaign route edge",
    );
    expect(reviewPrompt).toContain(
      "Grounding of non-route location information remains owned by the existing source/directive contracts",
    );
    expect(reviewPrompt.trimEnd()).toMatch(
      /REVIEW_OUTPUT_CONTRACT[\s\S]*Do not add, omit, default, or repair any key\.$/,
    );
    expect(reviewPrompt).not.toContain("routeAccessClaims");
  });

  it("rejects a successful scene that performs travel but drops the admitted delivery task", async () => {
    const compoundRuling = ruling({
      normalizedIntent: {
        originalText: "Try to reach South Harbor: harness trunk 4 down to the brazier",
        source: "suggested",
        choiceHandle: "move-trunk",
        kind: "attempt",
        targets: [{ handle: "passage", kind: "route" }],
        method: "Carry trunk 4 along the passage and deliver it to the brazier",
        stakes: "Reach South Harbor with trunk 4 delivered",
      },
      movementRouteHandle: "passage",
      citedVisibleFactHandles: ["passage", "south"],
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      reason: "The route is open and the delivery can be attempted.",
    });
    const travelOnlyProposal = {
      elapsedMinutes: 5,
      effects: [
        { kind: "move_actor" as const, actorHandle: null },
        {
          kind: "record_world_event" as const,
          eventClass: "scene" as const,
          performingActorHandle: null,
          summary: "The player follows the passage and reaches South Harbor.",
          affectedHandles: ["you", "passage", "south"],
        },
      ],
    };
    const rejectedFeedback = {
      diagnostic: "game_master_semantic_validation_mismatch" as const,
      failedChecks: [{
        check: "mechanical_authority_rejected" as const,
        reviewFailedChecks: ["player_intent_unfulfilled"] as const,
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: travelOnlyProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "rejected",
          reason: "The proposal completes the route but never delivers the named trunk.",
          failedChecks: ["player_intent_unfulfilled"],
        },
        trace: trace(),
      });
    let thrown: unknown;
    try {
      await createCampaignPlayGameMaster({
        generateObject: generateObject as unknown as typeof safeGenerateObject,
      }).plan({
        frame: frame(), ruling: compoundRuling, resolution, uncertaintyAuthority: null,
        model: model(), temperature: 0.2, budget,
      });
    } catch (cause) {
      thrown = cause;
    }
    expect(thrown).toMatchObject({
      code: "model_contract_failed",
      modelEvidence: expect.objectContaining({ errorCode: "mechanical_authority_rejected" }),
    });
    expect(getCampaignPlayGameMasterRecoveryFeedback(thrown)).toEqual(rejectedFeedback);
    expect(generateObject).toHaveBeenCalledTimes(2);
    const reviewPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(reviewPrompt).toContain(travelOnlyProposal.effects[1].summary);
    expect(reviewPrompt).toContain('"originalText":"Try to reach South Harbor: harness trunk 4 down to the brazier"');
    expect(reviewPrompt).toContain('"result":"success"');
    expect(reviewPrompt).toContain("travel while dropping an additional handling, delivery, contact, inspection, tool, target, or explicit exclusion");

    const recoveryGenerateObject = vi.fn()
      .mockResolvedValueOnce({ object: travelOnlyProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The replacement proposal covers the complete admitted action.",
          failedChecks: [],
        },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: recoveryGenerateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: compoundRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget, recoveryFeedback: rejectedFeedback,
    });
    expect(String(recoveryGenerateObject.mock.calls[0]![0].prompt)).toContain(
      "For player_intent_unfulfilled, resolve every material part of PLAYER_INTENT under RESOLUTION.",
    );
  });

  it("rejects route prose that contradicts code-owned route authority", async () => {
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
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: contradictory, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "rejected",
          reason: "The summary invents a toll bridge.",
          failedChecks: ["route_authority_missing"],
        },
        trace: trace(),
      });
    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({
      code: "model_contract_failed",
      modelEvidence: expect.objectContaining({ errorCode: "mechanical_authority_rejected" }),
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    expect(String(generateObject.mock.calls[1]![0].prompt)).toContain(
      "Do not rewrite, repair, or continue the story",
    );
    expect(String(generateObject.mock.calls[1]![0].prompt)).toContain(
      "The route itself may be named or described as a bridge, toll bridge, gate, or passage",
    );
    expect(String(generateObject.mock.calls[1]![0].prompt)).toContain(
      "An explicit statement that no toll, payment, permission, stamp, or permit is required agrees",
    );
  });

  it("keeps ordinary location wayfinding outside route-authority classification", async () => {
    const wayfinding = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        summary: "Oren points toward the market counter and says the south stall is beside the back room.",
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: wayfinding, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The ordinary location guidance asserts no campaign route mechanics.",
          failedChecks: [],
        },
        trace: trace(),
      });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    expect(candidate.semanticReview.kind).toBe("mechanical_authority");
    const proposerPrompt = String(generateObject.mock.calls[0]![0].prompt);
    const reviewPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(proposerPrompt).toContain("ordinary wayfinding to a person, shop, counter, room, row, landmark, or destination is not a route claim by itself");
    expect(proposerPrompt).toContain("Such information must still be grounded in SOURCE_MOMENT, VISIBLE_FACTS, ACTOR_CONTINUITY, or ACTOR_DIRECTIVES");
    expect(reviewPrompt).toContain("ROUTE_AUTHORITY=[]");
    expect(reviewPrompt).toContain("this Reviewer must neither authorize nor reject it as route mechanics");
    expect(reviewPrompt).toContain("REVIEW_OUTPUT_CONTRACT");
  });

  it("rejects resource consumption and payment hidden inside an ordinary world event", async () => {
    const unbackedRepair = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        eventClass: "interaction" as const,
        summary: "The cobbler uses the last leather scraps to finish the repair, and the guard pays six copper.",
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: unbackedRepair, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "rejected",
          reason: "The summary consumes material and completes payment without typed resource effects.",
          failedChecks: ["possession_authority_missing"],
        },
        trace: trace(),
      });

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({
      code: "model_contract_failed",
      modelEvidence: expect.objectContaining({ errorCode: "mechanical_authority_rejected" }),
    });
    expect(generateObject).toHaveBeenCalledTimes(2);
    const reviewPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(reviewPrompt).toContain(unbackedRepair.effects[0].summary);
    expect(reviewPrompt).toContain('"typedResourceEffects":[]');
    expect(reviewPrompt).toContain("A record_world_event is presentation evidence, never mechanical authority");
  });

  it("keeps document procedure dialogue separate from actor resources and route access", async () => {
    const documentProcedure = {
      ...proposal,
      effects: [{
        ...proposal.effects[0],
        summary: "Oren says the defaulted passage bonds are filed for the brazier and void once stamped.",
        affectedHandles: ["guard"],
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: documentProcedure, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The attributed document procedure changes no actor resource, obligation, or route access state.",
        },
        trace: trace(),
      });

    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });

    expect(candidate.preflight.accepted).toBe(true);
    expect(candidate.semanticReview.kind).toBe("mechanical_authority");
    const reviewPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(reviewPrompt).toContain(documentProcedure.effects[0].summary);
    expect(reviewPrompt).toContain(
      "A statement about an untracked scene document's classification, validity, filing, disposal procedure, or history",
    );
    expect(reviewPrompt).toContain(
      "Words such as passage, bond, stamp, clearance, gate, permit, or contract",
    );
    expect(reviewPrompt).toContain('"typedResourceEffects":[]');
    expect(reviewPrompt).toContain('ROUTE_AUTHORITY=[]');
  });

  it("persists an independent review hash for route prose accepted against typed authority", async () => {
    const reviewReason = "The event remains within the supplied mechanical authority. ".repeat(10);
    expect(reviewReason.length).toBeGreaterThan(500);
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
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: grounded, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: reviewReason },
        trace: trace(),
      });
    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: routeRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });
    expect(candidate.semanticReview).toEqual({
      kind: "mechanical_authority",
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

  it("offers only the Judge-authorized resource effect in the per-turn schema and prompt", async () => {
    const acquisitionProposal = {
      elapsedMinutes: 1,
      effects: [{
        kind: "adjust_actor_possession" as const,
        operation: "acquire" as const,
        actorHandle: "you",
        possessionHandle: null,
        name: "Copper chit",
        quantity: 2,
        summary: "Oren hands over two copper chits for the copied manifests.",
        affectedHandles: ["you", "guard"],
      }, guardResponseEffect],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: acquisitionProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The typed acquisition is the only durable possession change and the guard answered.",
        },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(),
      ruling: ruling({
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
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
    });

    const options = generateObject.mock.calls[0]![0];
    expect(options.schema.safeParse(acquisitionProposal).success).toBe(true);
    expect(String(options.prompt)).toContain('PERMITTED_RESOURCE_EFFECT_KINDS=["adjust_actor_possession"]');
    expect(String(options.prompt)).toContain("Use adjust_actor_possession whenever");
    expect(String(options.prompt)).toContain("The transform name must identify the post-transform possession and must differ from the source possession name");
    expect(String(options.prompt)).toContain("changing only the summary is invalid");
    expect(String(options.prompt)).toContain("For a quantity-1 plural container or kit, name the whole retained set together with its new contents or state");
    expect(String(options.prompt)).toContain("Every non-null adjust_actor_possession name must be at most 120 characters");
    expect(String(options.prompt)).toContain("put state, contents, provenance, and other details in summary");
    expect(String(options.prompt)).not.toContain("Use incur_actor_obligation for");
    expect(String(options.prompt)).not.toContain("Use pay_actor_obligation for");
  });

  it("requires independent semantic review for a pure possession transform", async () => {
    const sourceFrame = frame();
    const possessionKey = deriveCampaignPlayPossessionKey("Specimen jars");
    const possessionId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, possessionKey);
    sourceFrame.visibleFacts.push({
      handle: "specimen-jars",
      kind: "possession",
      summary: "Specimen jars: 1",
    });
    sourceFrame.handleBindings.push({
      handle: "specimen-jars",
      reference: { kind: "possession", id: possessionId },
    });
    sourceFrame.authority.authorizedRefs.push({ kind: "possession", id: possessionId });
    sourceFrame.rulebookFrame.possessions.push({
      possessionId,
      actorId: PLAYER_ID,
      possessionKey,
      name: "Specimen jars",
      quantity: 1,
    });
    const transformRuling = ruling({
      normalizedIntent: {
        originalText: "Seal one loose corrosion flake in the specimen jars.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [{ handle: "here", kind: "location" }],
        method: "Seal one corrosion flake in one jar while retaining the whole set",
        stakes: "Keep the sealed sample and remaining empty jars together",
      },
      possessionEffectAuthority: {
        kind: "adjust_actor_possession",
        enforcement: "required",
        operation: "transform",
        possessionHandle: "specimen-jars",
        quantity: 1,
        minimumResult: "success",
      },
      citedVisibleFactHandles: ["here", "specimen-jars"],
    });
    const transformProposal = {
      elapsedMinutes: 1,
      effects: [{
        kind: "adjust_actor_possession" as const,
        operation: "transform" as const,
        actorHandle: "you",
        possessionHandle: "specimen-jars",
        name: "Specimen jar set with sealed corrosion flake and empty jars",
        quantity: 1,
        summary: "One jar holds the sealed corrosion flake; the remaining empty jars stay with it.",
        affectedHandles: ["you", "specimen-jars", "here"],
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: transformProposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "The name preserves the complete set and its sealed contents." },
        trace: trace(),
      });

    const candidate = await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: sourceFrame,
      ruling: transformRuling,
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
    });

    expect(candidate.semanticReview.kind).toBe("mechanical_authority");
    expect(generateObject).toHaveBeenCalledTimes(2);
    const reviewPrompt = String(generateObject.mock.calls[1]![0].prompt);
    expect(reviewPrompt).toContain('"sourcePossessions":[{"handle":"specimen-jars","kind":"possession","summary":"Specimen jars: 1"}]');
    expect(reviewPrompt).toContain('"originalText":"Seal one loose corrosion flake in the specimen jars."');
    expect(reviewPrompt).toContain("Accept only when the name is a concise durable identity for the complete retained possession after the transform");
    expect(reviewPrompt).toContain("names only remaining empty containers while omitting what was collected or sealed inside the set");
    expect(reviewPrompt).toContain("relies on summary to carry material possession state missing from name");
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
        }, guardResponseEffect],
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
        }, guardResponseEffect],
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
        citedVisibleFactHandles: ["guard", "copper-chit"],
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
        }, guardResponseEffect],
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
      ruling({ citedVisibleFactHandles: ["guard", "copper-chit"] }),
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
        citedVisibleFactHandles: ["guard", "copper-chit"],
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
        }, guardResponseEffect],
      },
    );
    const resultKey = deriveCampaignPlayPossessionKey("Copper chit stamped for lodging");
    const resultId = deriveCampaignPlayPossessionId(CAMPAIGN_ID, PLAYER_ID, resultKey);
    expect(transformation.batch.commands.filter((command) => command.kind === "adjust_actor_possession")).toMatchObject([{
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
        citedVisibleFactHandles: ["guard", "copper-chit"],
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
    }) : ruling({
      normalizedIntent: {
        ...ruling().normalizedIntent,
        targets: [],
      },
    });
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
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      moveRuling,
      resolution,
      null,
      {
        elapsedMinutes: 5,
        effects: [
          { kind: "move_actor", actorHandle: null },
          {
            kind: "enter_local_scene",
            name: "South Harbor Market Interior",
            description: "A narrow market interior with stacked crates and damp stone.",
          },
          {
            kind: "record_world_event",
            eventClass: "scene",
            performingActorHandle: null,
            summary: "The player reaches the market interior.",
            affectedHandles: ["you", "south"],
          },
        ],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'PLAYER_MOVEMENT={"actorHandle":"you","routeHandle":"passage","fromLocationHandle":"here","toLocationHandle":"south","travelCost":5,"initialRouteState":"open"}',
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "For a pure move ruling or resolution, elapsedMinutes must equal travelCost exactly; do not emit enter_local_scene",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "An actorless record_world_event remains permitted",
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
      "PLAYER_MOVEMENT already places the player in its known destination scene; never add enter_local_scene merely for that arrival",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      "When maximumMinutes equals travelCost, omit enter_local_scene even for observe or attempt",
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'DESTINATION_SCENE={"locationName":"South Harbor Market","description":"A market beyond the passage.","presentPeople":["Mara Quay"]}',
    );
    expect(String(generateObject.mock.calls[0]![0].prompt)).toContain(
      'LOCAL_SCENE_AUTHORITY={"forbiddenNames":["North Harbor Gate","South Harbor Market"],"presentPeople":[]}',
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

  it("rejects a destination local scene when an attempt has no time beyond route travel", () => {
    const travelAttempt = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 5 },
      normalizedIntent: {
        originalText: "I try to reach South Harbor.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [{ handle: "passage", kind: "route" }, { handle: "south", kind: "location" }],
        method: "Pass through the crowd and cross the open passage",
        stakes: "Reach South Harbor",
      },
    });

    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      travelAttempt,
      resolution,
      null,
      {
        elapsedMinutes: 5,
        effects: [
          { kind: "move_actor", actorHandle: null },
          {
            kind: "enter_local_scene",
            name: "South Harbor Market Interior",
            description: "A narrow market interior with stacked crates and damp stone.",
          },
          {
            kind: "record_world_event",
            eventClass: "scene",
            performingActorHandle: null,
            summary: "The player reaches South Harbor.",
            affectedHandles: ["south"],
          },
        ],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("compiles grounded route-less traversal into one code-owned local topology move", () => {
    const localRuling = ruling({
      normalizedIntent: {
        originalText: "I squeeze deeper through the fitted-block break.",
        source: "freeform",
        choiceHandle: null,
        kind: "attempt",
        targets: [{ handle: "here", kind: "location" }],
        method: "Advance through the established fitted-block break",
        stakes: "Reach the space beyond the collapse",
      },
      citedVisibleFactHandles: ["here"],
      elapsedBounds: { minimumMinutes: 10, maximumMinutes: 10 },
      reason: "The established passage can be traversed with care.",
    });
    const name = "Collapsed Fitted-Block Passage";
    const description = "A low masonry break where black water threads through fitted stone.";
    const candidate = createCampaignPlayGameMaster().compile(
        frame(),
        localRuling,
        resolution,
        null,
        {
          elapsedMinutes: 10,
          effects: [
            { kind: "enter_local_scene", name, description },
            {
              kind: "record_world_event",
              eventClass: "discovery",
              performingActorHandle: null,
              summary: "Beyond the break, a dragged iron edge has scored fresh arcs into the wet stone.",
              affectedHandles: ["here"],
            },
          ],
        },
    );
    const ids = deriveCampaignPlayLocalSceneTopologyIds({
      campaignId: CAMPAIGN_ID,
      turnId: TURN_ID,
      anchorLocationId: "location-a",
      name,
      description,
    });
    expect(candidate.preflight.accepted).toBe(true);
    expect(candidate.batch.commands[1]).toMatchObject({
      kind: "move_actor",
      actorId: PLAYER_ID,
      routeId: ids.outboundRouteId,
      fromLocationId: "location-a",
      toLocationId: ids.locationId,
      materializedLocalScene: {
        ...ids,
        anchorLocationId: "location-a",
        name,
        description,
        travelCost: 10,
      },
    });
    expect(candidate.batch.commands[2]).toMatchObject({
      kind: "record_world_event",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: ids.locationId }],
      },
    });

    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      localRuling,
      resolution,
      null,
      {
        elapsedMinutes: 10,
        effects: [{ kind: "enter_local_scene", name, description }],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      ruling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [
          { kind: "enter_local_scene", name, description },
          {
            kind: "record_world_event",
            eventClass: "discovery",
            performingActorHandle: null,
            summary: "The player stays where they are.",
            affectedHandles: ["here"],
          },
        ],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      localRuling,
      resolution,
      null,
      {
        elapsedMinutes: 10,
        effects: [
          {
            kind: "enter_local_scene",
            name: "North Harbor Gate",
            description,
          },
          {
            kind: "record_world_event",
            eventClass: "discovery",
            performingActorHandle: null,
            summary: "The player reaches a distinct passage beyond the gate.",
            affectedHandles: ["here"],
          },
        ],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
  });

  it("splits known-route travel from a destination local-scene transition", () => {
    const compoundRuling = ruling({
      movementRouteHandle: "passage",
      normalizedIntent: {
        originalText: "I cross to South Harbor and look for the stores room.",
        source: "freeform",
        choiceHandle: null,
        kind: "observe",
        targets: [{ handle: "south", kind: "location" }],
        method: "Cross the open passage, then find the established stores room",
        stakes: "Reach the stores room",
      },
      citedVisibleFactHandles: ["south", "passage"],
      elapsedBounds: { minimumMinutes: 8, maximumMinutes: 8 },
      reason: "The open route reaches the market, where the established room can be found.",
    });
    const name = "South Harbor Stores Room";
    const description = "A narrow service room with a scarred counter and numbered shelves.";
    const candidate = createCampaignPlayGameMaster().compile(
      frame(),
      compoundRuling,
      resolution,
      null,
      {
        elapsedMinutes: 8,
        effects: [
          { kind: "move_actor", actorHandle: null },
          { kind: "enter_local_scene", name, description },
          {
            kind: "record_world_event",
            eventClass: "discovery",
            performingActorHandle: null,
            summary: "A slate beside the counter lists blankets and work aprons awaiting collection.",
            affectedHandles: ["south"],
          },
        ],
      },
    );
    const ids = deriveCampaignPlayLocalSceneTopologyIds({
      campaignId: CAMPAIGN_ID,
      turnId: TURN_ID,
      anchorLocationId: "location-b",
      name,
      description,
    });

    expect(candidate.preflight.accepted).toBe(true);
    expect(candidate.batch.commands.map((command) => command.kind)).toEqual([
      "advance_world_time",
      "move_actor",
      "advance_world_time",
      "move_actor",
      "record_world_event",
    ]);
    expect(candidate.batch.commands[0]).toMatchObject({
      kind: "advance_world_time",
      elapsedMinutes: 5,
    });
    expect(candidate.batch.commands[1]).toMatchObject({
      kind: "move_actor",
      routeId: "route-a-b",
      fromLocationId: "location-a",
      toLocationId: "location-b",
    });
    expect(candidate.batch.commands[2]).toMatchObject({
      kind: "advance_world_time",
      elapsedMinutes: 3,
    });
    expect(candidate.batch.commands[3]).toMatchObject({
      kind: "move_actor",
      fromLocationId: "location-b",
      toLocationId: ids.locationId,
      materializedLocalScene: {
        ...ids,
        anchorLocationId: "location-b",
        name,
        description,
        travelCost: 3,
      },
    });
    expect(candidate.batch.commands[4]).toMatchObject({
      kind: "record_world_event",
      exposure: {
        mode: "projectable",
        predicates: [{ channel: "direct_perception", locationId: ids.locationId }],
      },
    });

    expect(() => createCampaignPlayGameMaster().compile(
      frame(),
      compoundRuling,
      resolution,
      null,
      {
        elapsedMinutes: 5,
        effects: [
          { kind: "move_actor", actorHandle: null },
          { kind: "enter_local_scene", name, description },
          {
            kind: "record_world_event",
            eventClass: "discovery",
            performingActorHandle: null,
            summary: "The route ends without enough time to enter another scene.",
            affectedHandles: ["south"],
          },
        ],
      },
    )).toThrow(expect.objectContaining({ code: "model_contract_failed" }));
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
          summary: "The guard points the player toward South Harbor.",
          affectedHandles: ["you", "guard", "here"],
        },
        { kind: "move_actor", actorHandle: null },
        {
          kind: "record_world_event",
          eventClass: "scene",
          performingActorHandle: null,
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
          summary: "Oren agrees to walk beside the player and steps toward the passage.",
          affectedHandles: ["you", "guard", "here"],
        },
        { kind: "move_actor", actorHandle: null },
        { kind: "move_actor", actorHandle: "guard" },
        {
          kind: "record_world_event",
          eventClass: "scene",
          performingActorHandle: null,
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
    const generateObject = vi.fn()
      .mockResolvedValueOnce({
        object: proposal,
        trace: trace("native_schema", {
          inputTokens: 100,
          outputTokens: 32_100,
          reasoningTokens: 32_000,
          totalTokens: 32_200,
        }),
      })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "No resource state changes in the dialogue." },
        trace: trace("native_schema", {
          inputTokens: 1,
          outputTokens: 0,
          reasoningTokens: 0,
          totalTokens: 1,
        }),
      });
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

  it("rejects a record event whose compiler-owned player ref would exceed the affected-ref limit", () => {
    const affectedHandles = [
      "guard",
      "here",
      "south",
      "passage",
      "delay",
      "trust",
      "guard-goal",
      ...scopeLocationHandles(),
    ];
    let thrown: unknown;
    try {
      createCampaignPlayGameMaster().compile(
        scopeOverflowFrame(),
        scopeOverflowRuling(),
        resolution,
        null,
        { elapsedMinutes: 1, effects: [scopeDiscoveryEffect(affectedHandles)] },
      );
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ code: "model_contract_failed" });
    const feedback = getCampaignPlayGameMasterRecoveryFeedback(thrown);
    expect(feedback).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "record_world_event_scope_overflow",
        effectIndex: 0,
        fieldPath: "effects[0].affectedHandles",
        proposedAffectedHandleCount: 16,
        compilerOwnedAppendCount: 1,
        maximumAffectedRefCount: 16,
      }],
    });
    const serialized = JSON.stringify(feedback);
    expect(serialized).not.toContain("scope-location-0");
    expect(serialized).not.toContain("The gate shows visible wear.");
  });

  it("accepts fifteen authored refs plus the compiler-owned player ref", () => {
    const affectedHandles = [
      "guard",
      "here",
      "south",
      "passage",
      "delay",
      "trust",
      "guard-goal",
      ...scopeLocationHandles().slice(0, 8),
    ];
    const candidate = createCampaignPlayGameMaster().compile(
      scopeOverflowFrame(),
      scopeOverflowRuling(),
      resolution,
      null,
      { elapsedMinutes: 1, effects: [scopeDiscoveryEffect(affectedHandles)] },
    );
    expect(candidate.preflight.accepted).toBe(true);
    const eventCommand = candidate.batch.commands.find((command) => command.kind === "record_world_event");
    expect(eventCommand).toMatchObject({
      affectedRefs: expect.arrayContaining([{ kind: "actor", id: PLAYER_ID }]),
    });
    expect(eventCommand?.affectedRefs).toHaveLength(16);
  });

  it("accepts sixteen authored refs when the player ref is already present", () => {
    const affectedHandles = ["you", ...[
      "guard",
      "here",
      "south",
      "passage",
      "delay",
      "trust",
      "guard-goal",
      ...scopeLocationHandles(),
    ].slice(0, 15)];
    const candidate = createCampaignPlayGameMaster().compile(
      scopeOverflowFrame(),
      scopeOverflowRuling(),
      resolution,
      null,
      { elapsedMinutes: 1, effects: [scopeDiscoveryEffect(affectedHandles)] },
    );
    expect(candidate.preflight.accepted).toBe(true);
    const eventCommand = candidate.batch.commands.find((command) => command.kind === "record_world_event");
    expect(eventCommand?.affectedRefs).toHaveLength(16);
    expect(getCampaignPlayGameMasterRecoveryFeedback(null)).toBeUndefined();
  });

  it("counts a missing performer ref alongside the player ref for performed events", () => {
    const affectedHandles = [
      "here",
      "south",
      "passage",
      "delay",
      "trust",
      "guard-goal",
      ...scopeLocationHandles().slice(0, 8),
    ];
    const candidate = createCampaignPlayGameMaster().compile(
      scopeOverflowFrame(),
      ruling(),
      resolution,
      null,
      {
        elapsedMinutes: 1,
        effects: [{
          kind: "record_world_event",
          eventClass: "dialogue",
          performingActorHandle: "guard",
          summary: "The guard answers the player's question.",
          affectedHandles,
        }, guardResponseEffect],
      },
    );
    expect(candidate.preflight.accepted).toBe(true);
    const eventCommand = candidate.batch.commands.find((command) => command.kind === "record_world_event");
    expect(eventCommand?.affectedRefs).toHaveLength(16);
    expect(eventCommand?.affectedRefs).toEqual(expect.arrayContaining([
      { kind: "actor", id: PLAYER_ID },
      { kind: "actor", id: "actor-guard" },
    ]));
  });

  it("reports multiple scope overflows in effect order", () => {
    const affectedHandles = [
      "guard",
      "here",
      "south",
      "passage",
      "delay",
      "trust",
      "guard-goal",
      ...scopeLocationHandles(),
    ];
    let thrown: unknown;
    try {
      createCampaignPlayGameMaster().compile(
        scopeOverflowFrame(),
        scopeOverflowRuling(),
        resolution,
        null,
        {
          elapsedMinutes: 1,
          effects: [scopeDiscoveryEffect(affectedHandles), scopeDiscoveryEffect(affectedHandles)],
        },
      );
    } catch (error) {
      thrown = error;
    }
    expect(getCampaignPlayGameMasterRecoveryFeedback(thrown)).toEqual({
      diagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [0, 1].map((effectIndex) => ({
        check: "record_world_event_scope_overflow",
        effectIndex,
        fieldPath: `effects[${effectIndex}].affectedHandles`,
        proposedAffectedHandleCount: 16,
        compilerOwnedAppendCount: 1,
        maximumAffectedRefCount: 16,
      })),
    });
  });

  it("adds the scope overflow recovery sentence only for that safe check", async () => {
    const sentence = "For record_world_event_scope_overflow, reduce affectedHandles at fieldPath until proposedAffectedHandleCount plus compilerOwnedAppendCount is no greater than maximumAffectedRefCount. Keep only handles directly affected by that event, and preserve the performing actor handle when the event has one.";
    const overflowFeedback = {
      diagnostic: "game_master_semantic_validation_mismatch" as const,
      failedChecks: [{
        check: "record_world_event_scope_overflow" as const,
        effectIndex: 0,
        fieldPath: "effects[0].affectedHandles",
        proposedAffectedHandleCount: 16,
        compilerOwnedAppendCount: 1,
        maximumAffectedRefCount: 16,
      }],
    };
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: {
        elapsedMinutes: 1,
        effects: [scopeDiscoveryEffect(["here"])],
      }, trace: trace() })
      .mockResolvedValueOnce({
        object: {
          verdict: "accepted",
          reason: "The discovery resolves the admitted inspection.",
          failedChecks: [],
        },
        trace: trace(),
      });
    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: scopeOverflowFrame(),
      ruling: scopeOverflowRuling(),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
      recoveryFeedback: overflowFeedback,
    });
    const recoveryPrompt = String(generateObject.mock.calls[0]?.[0]?.prompt);
    expect(recoveryPrompt).toContain(sentence);
    expect(recoveryPrompt).toContain("record_world_event_scope_overflow");
    expect(recoveryPrompt).not.toContain("REJECTED RAW PROPOSAL");

    let normalPrompt = "";
    const normalGenerate = vi.fn(async (input: { prompt?: unknown }) => {
      const prompt = String(input.prompt);
      if (prompt.includes("You are the Mechanical Authority Reviewer.")) {
        return {
          object: {
            verdict: "accepted",
            reason: "The discovery resolves the admitted inspection.",
            failedChecks: [],
          },
          trace: trace(),
        };
      }
      normalPrompt = prompt;
      return {
        object: { elapsedMinutes: 1, effects: [scopeDiscoveryEffect(["here"])] },
        trace: trace(),
      };
    });
    await createCampaignPlayGameMaster({
      generateObject: normalGenerate as unknown as typeof safeGenerateObject,
    }).plan({
      frame: scopeOverflowFrame(),
      ruling: scopeOverflowRuling(),
      resolution,
      uncertaintyAuthority: null,
      model: model(),
      temperature: 0.2,
      budget,
    });
    expect(normalPrompt).not.toContain(sentence);
  });
});

describe("Campaign Play Game Master contract rejection diagnostics", () => {
  beforeEach(() => {
    gameMasterEvent.mockClear();
    gameMasterWarn.mockClear();
  });

  it("stays silent for an accepted plan", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockResolvedValueOnce({
        object: { verdict: "accepted", reason: "No mechanical authority changes are present." },
        trace: trace(),
      });

    await createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    });

    expect(gameMasterEvent).not.toHaveBeenCalled();
  });

  it("emits one generation diagnostic for a primary transport interruption", async () => {
    const generateObject = vi.fn(async () => {
      throw new Error("SENTINEL_PROVIDER_BODY_AND_STACK");
    });

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "transport_interrupted" });

    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    const [eventName, eventPayload] = gameMasterEvent.mock.calls[0]!;
    expect(eventName).toBe("game_master.contract_rejected");
    expect(eventPayload).toEqual({
      phase: "generation",
      errorCode: "transport_interrupted",
      modelEvidenceErrorCode: null,
      safeGenerationCode: null,
      recoveryDiagnostic: null,
      failedChecks: [],
      reviewFailedChecks: [],
      denial: null,
    });
    expect(JSON.stringify(eventPayload)).not.toContain("SENTINEL_PROVIDER_BODY_AND_STACK");
  });

  it("emits the SafeGenerate contract code for a primary strict tool failure", async () => {
    await expect(createCampaignPlayGameMaster().plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: schemaContractFailureModel(), temperature: 0.2, budget,
    })).rejects.toMatchObject({
      code: "model_contract_failed",
      modelEvidence: { errorCode: "invalid_structured_tool_call" },
    });

    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    const [eventName, eventPayload] = gameMasterEvent.mock.calls[0]!;
    expect(eventName).toBe("game_master.contract_rejected");
    expect(eventPayload).toEqual({
      phase: "generation",
      errorCode: "model_contract_failed",
      modelEvidenceErrorCode: "invalid_structured_tool_call",
      safeGenerationCode: "invalid_structured_tool_call",
      contractDiagnosticPhase: "provider_extraction",
      contractDiagnosticCoordinate: "proposal.provider_response",
      recoveryDiagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [],
      reviewFailedChecks: [],
      denial: null,
    });
    const serialized = JSON.stringify(eventPayload);
    expect(serialized).not.toContain("SENTINEL_RAW_PROPOSAL");
    expect(serialized).not.toContain("SENTINEL_PLAYER_AND_ACTOR_PROSE");
    expect(serialized).not.toContain("schema-validation");
  });

  it("classifies a returned evidence-invariant failure before compilation", async () => {
    const generateObject = vi.fn(async () => ({
      object: proposal,
      trace: trace("repair"),
    }));

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "model_contract_failed" });

    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    expect(gameMasterEvent.mock.calls[0]).toEqual([
      "game_master.contract_rejected",
      {
        phase: "evidence",
        errorCode: "model_contract_failed",
        modelEvidenceErrorCode: "model_contract_failed",
        safeGenerationCode: null,
        recoveryDiagnostic: null,
        failedChecks: [],
        reviewFailedChecks: [],
        denial: null,
      },
    ]);
  });

  it("classifies compiler recovery coordinates without proposal content", async () => {
    const repeatedSummary = frame().actorContinuity[0]!.recentOwnActions[0]!.summary;
    const repeatedProposal = {
      ...proposal,
      effects: [{ ...proposal.effects[0], summary: repeatedSummary }],
    };
    const generateObject = vi.fn(async () => ({ object: repeatedProposal, trace: trace() }));

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "model_contract_failed" });

    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    const [, eventPayload] = gameMasterEvent.mock.calls[0]!;
    expect(eventPayload).toEqual({
      phase: "compilation",
      errorCode: "model_contract_failed",
      modelEvidenceErrorCode: "model_contract_failed",
      safeGenerationCode: null,
      recoveryDiagnostic: "game_master_semantic_validation_mismatch",
      failedChecks: [{
        check: "repeated_actor_dialogue",
        effectIndex: 0,
        fieldPath: "effects[0].summary",
        performingActorHandle: "guard",
        recentOwnActionIndex: 0,
      }],
      reviewFailedChecks: [],
      denial: null,
    });
    expect(JSON.stringify(eventPayload)).not.toContain(repeatedSummary);
  });

  it("classifies Rulebook denial with only bounded denial coordinates", async () => {
    const compoundRuling = ruling({
      movementRouteHandle: "passage",
      elapsedBounds: { minimumMinutes: 5, maximumMinutes: 8 },
      normalizedIntent: {
        originalText: "I cross to South Harbor and ask the guard about passage delays.",
        source: "freeform", choiceHandle: null, kind: "contact",
        targets: [
          { handle: "passage", kind: "route" },
          { handle: "south", kind: "location" },
          { handle: "guard", kind: "actor" },
        ],
        method: "Cross the passage, then ask the guard",
        stakes: "Learn why crossings are delayed",
      },
    });
    const candidate = {
      elapsedMinutes: 5,
      effects: [
        { kind: "move_actor" as const, actorHandle: null },
        {
          kind: "record_world_event" as const,
          eventClass: "interaction" as const,
          performingActorHandle: "guard",
          summary: "SENTINEL_RAW_EVENT_SUMMARY",
          affectedHandles: ["you", "guard", "south"],
        },
      ],
    };
    const generateObject = vi.fn(async () => ({ object: candidate, trace: trace() }));

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: compoundRuling, resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "rulebook_denied" });

    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    const [, eventPayload] = gameMasterEvent.mock.calls[0]!;
    expect(eventPayload).toMatchObject({
      phase: "compilation",
      errorCode: "rulebook_denied",
      modelEvidenceErrorCode: "rulebook_denied",
      safeGenerationCode: null,
      recoveryDiagnostic: null,
      failedChecks: [],
      reviewFailedChecks: [],
      denial: {
        code: "precondition_failed",
        commandIndex: expect.any(Number),
        commandId: expect.any(String),
      },
    });
    expect(eventPayload.denial).not.toHaveProperty("detail");
    expect(JSON.stringify(eventPayload)).not.toContain("SENTINEL_RAW_EVENT_SUMMARY");
    expect(JSON.stringify(eventPayload)).not.toContain("South Harbor");
  });

  it("classifies Mechanical Authority Reviewer generation failure as review", async () => {
    const generateObject = vi.fn()
      .mockResolvedValueOnce({ object: proposal, trace: trace() })
      .mockRejectedValueOnce(new Error("SENTINEL_REVIEW_PROVIDER_BODY"));

    await expect(createCampaignPlayGameMaster({
      generateObject: generateObject as unknown as typeof safeGenerateObject,
    }).plan({
      frame: frame(), ruling: ruling(), resolution, uncertaintyAuthority: null,
      model: model(), temperature: 0.2, budget,
    })).rejects.toMatchObject({ code: "transport_interrupted" });

    expect(gameMasterEvent).toHaveBeenCalledTimes(1);
    const [, eventPayload] = gameMasterEvent.mock.calls[0]!;
    expect(eventPayload).toEqual({
      phase: "review",
      errorCode: "transport_interrupted",
      modelEvidenceErrorCode: "transport_interrupted",
      safeGenerationCode: null,
      recoveryDiagnostic: null,
      failedChecks: [],
      reviewFailedChecks: [],
      denial: null,
    });
    expect(JSON.stringify(eventPayload)).not.toContain("SENTINEL_REVIEW_PROVIDER_BODY");
  });
});
