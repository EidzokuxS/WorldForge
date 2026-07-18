import { describe, expect, it } from "vitest";
import {
  CAMPAIGN_PLAY_LIMITS,
  CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES,
  CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES,
  CAMPAIGN_PLAY_EFFECT_KIND_VALUES,
  CAMPAIGN_PLAY_PHASE_VALUES,
  CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES,
  CAMPAIGN_PLAY_SETUP_PHASE_VALUES,
  CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES,
  CAMPAIGN_PLAY_VISIBLE_TARGET_KIND_VALUES,
  CAMPAIGN_TURN_KIND_VALUES,
  WORLD_INTENT_KIND_VALUES,
  type CampaignPlayJournalPage,
  type CampaignPlayNarration,
  type CampaignPlayNarratorPacket,
  type CampaignPlaySseEvent,
  type CampaignPlayState,
  type PlayerIntent,
} from "@worldforge/shared";
import {
  CAMPAIGN_PLAY_ACTOR_JOB_STAGE_VALUES,
  CAMPAIGN_PLAY_ACTOR_JOB_STAGE_METADATA,
  CAMPAIGN_PLAY_ACTOR_CONDITION_VALUES,
  CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES,
  CAMPAIGN_PLAY_COMMAND_KIND_VALUES,
  CAMPAIGN_PLAY_COMMAND_METADATA,
  CAMPAIGN_PLAY_COMMAND_SOURCE_METADATA,
  CAMPAIGN_PLAY_COMMAND_SOURCE_KIND_VALUES,
  CAMPAIGN_PLAY_CAUSAL_PARENT_METADATA,
  CAMPAIGN_PLAY_CAUSAL_PARENT_KIND_VALUES,
  CAMPAIGN_PLAY_ENTITY_REF_KIND_VALUES,
  CAMPAIGN_PLAY_ERROR_METADATA,
  CAMPAIGN_PLAY_EXPOSURE_CHANNEL_VALUES,
  CAMPAIGN_PLAY_EXPOSURE_METADATA,
  CAMPAIGN_PLAY_EXPOSURE_POLICY_METADATA,
  CAMPAIGN_PLAY_EXPOSURE_POLICY_MODE_VALUES,
  CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES,
  CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES,
  CAMPAIGN_PLAY_JUDGMENT_METADATA,
  CAMPAIGN_PLAY_MODEL_STAGE_KIND_VALUES,
  CAMPAIGN_PLAY_MODEL_STAGE_STATUS_METADATA,
  CAMPAIGN_PLAY_MODEL_STAGE_STATUS_VALUES,
  CAMPAIGN_PLAY_PLAN_PRECONDITION_METADATA,
  CAMPAIGN_PLAY_PLAN_PRECONDITION_KIND_VALUES,
  CAMPAIGN_PLAY_GOAL_STATUS_VALUES,
  CAMPAIGN_PLAY_PRESSURE_STATUS_VALUES,
  CAMPAIGN_PLAY_PROPOSAL_STATUS_METADATA,
  CAMPAIGN_PLAY_PROPOSAL_STATUS_VALUES,
  CAMPAIGN_PLAY_RESULT_TIER_VALUES,
  CAMPAIGN_PLAY_RUNTIME_EVENT_KIND_VALUES,
  CAMPAIGN_PLAY_RUNTIME_EVENT_METADATA,
  CAMPAIGN_PLAY_SYSTEM_SOURCE_VALUES,
  CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_KIND_VALUES,
  CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_METADATA,
  CAMPAIGN_PLAY_SSE_METADATA,
  CAMPAIGN_PLAY_TURN_STAGE_METADATA,
  CAMPAIGN_TURN_STAGE_VALUES,
  CAMPAIGN_PLAY_WORLD_EVENT_KIND_VALUES,
  CAMPAIGN_PLAY_WORLD_EVENT_METADATA,
  CampaignPlayContractError,
  buildCampaignPlaySuggestedActionLabel,
  campaignPlayActorJobSchema,
  campaignPlayActorDueSetSchema,
  campaignPlayActorKnowledgeSchema,
  campaignPlayActorConditionSchema,
  campaignPlayActorPlanSchema,
  campaignPlayActorProposalSchema,
  campaignPlayActorScheduleSchema,
  campaignPlayAvailableIntentSchema,
  campaignPlayBootstrapCommandSchema,
  campaignPlayCommandSchema,
  campaignPlayCommandSourceSchema,
  campaignPlayCausalParentSchema,
  campaignPlayConsequenceSchema,
  campaignPlayCharacterDraftResponseSchema,
  campaignPlayCharacterDraftSchema,
  campaignPlayCharacterResearchResponseSchema,
  campaignPlayGeneratePlayerDraftRequestSchema,
  campaignPlayElapsedBoundsSchema,
  campaignPlayEntityRefSchema,
  campaignPlayErrorResponseSchema,
  campaignPlayExposurePredicateSchema,
  campaignPlayExposurePolicySchema,
  campaignPlayEventExposureSchema,
  campaignPlayGameMasterPlanSchema,
  campaignPlayInterruptionSchema,
  campaignPlayJournalPageSchema,
  campaignPlayJournalEntrySchema,
  campaignPlayJournalRequestSchema,
  campaignPlayGoalStatusSchema,
  campaignPlayJudgeRulingSchema,
  campaignPlayJudgeArtifactSchema,
  campaignPlayModelStageSchema,
  campaignPlayNarrationArtifactSchema,
  campaignPlayNarrationBeatSchema,
  campaignPlayNarrationSchema,
  campaignPlayNarratorPacketSchema,
  campaignPlayObservationSchema,
  campaignPlayOpeningAdmissionRequestSchema,
  campaignPlayOpeningDetailOptionSchema,
  campaignPlayOpeningLocationOptionSchema,
  campaignPlayParsePlayerCardRequestSchema,
  campaignPlayPhaseSchema,
  campaignPlayPlanPreconditionSchema,
  campaignPlayPublicVersionsSchema,
  campaignPlayPressureStatusSchema,
  campaignPlayPublicTurnSchema,
  campaignPlayPublicCharacterSchema,
  campaignPlayPutPlayerRequestSchema,
  campaignPlayPutPlayerResponseSchema,
  campaignPlayReceiptSchema,
  campaignPlayResultTierSchema,
  campaignPlayResumeTurnRequestSchema,
  campaignPlayResearchPlayerRequestSchema,
  campaignPlayRuntimeEventSchema,
  campaignPlaySetupPhaseSchema,
  campaignPlaySseEventSchema,
  campaignPlayStateSchema,
  campaignPlayStageEffectSchema,
  campaignPlayStartingConditionsSchema,
  campaignPlaySuggestedActionSchema,
  campaignPlayTurnAdmissionRequestSchema,
  campaignPlayTurnAdmissionResponseSchema,
  campaignPlayTurnReadResponseSchema,
  campaignPlayUncertaintyResolutionSchema,
  campaignPlayVersionExpectationSchema,
  campaignPlayWorldEventSchema,
  campaignPlayVisibleActorSchema,
  campaignPlayVisibleLocationSchema,
  campaignPlayVisiblePressureSchema,
  campaignPlayVisibleRouteSchema,
  campaignPlayVisibleTargetSchema,
  campaignTurnKindSchema,
  campaignTurnStageSchema,
  playerIntentSchema,
  rulebookCommandBatchSchema,
  validateCampaignPlayVersionExpectation,
  validateCampaignPlayActorKnowledgeAgainstExposure,
  validateCampaignPlayObservationAgainstExposure,
  validateCampaignPlayStartingConditionsAgainstOptions,
  validateNarrationAgainstPacket,
  worldIntentKindSchema,
  type RulebookBatchCommand,
} from "./contracts.js";

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

interface Parser {
  parse(input: unknown): unknown;
  safeParse(input: unknown): { success: boolean };
}

function targetFixture() {
  return { handle: "actor_visible_1", kind: "actor" as const };
}

function intentFixture(
  kind: (typeof WORLD_INTENT_KIND_VALUES)[number] = "observe",
  source: "freeform" | "suggested" = "freeform",
): PlayerIntent {
  return {
    originalText: source === "freeform" ? "Watch the bridge." : "Watch the bridge",
    source,
    choiceHandle: source === "suggested" ? "choice_watch_bridge" : null,
    kind,
    targets: kind === "wait" ? [] : [targetFixture()],
    method: kind === "wait" ? null : "carefully",
    stakes: null,
  };
}

function consequenceFixture() {
  return {
    observationHandle: "observation_1",
    performingActorHandle: null,
    performingActorName: null,
    whatChanged: "The east bridge is now guarded.",
    whereOrRoute: "East bridge",
    worldTimeLabel: "Late afternoon",
    causalCue: "visible_aftermath" as const,
  };
}

function journalEntryFixture() {
  return {
    observationHandle: "observation_1",
    title: "A guarded bridge",
    text: "Fresh boot prints and a new barricade mark the crossing.",
    whereOrRoute: "East bridge",
    worldTimeLabel: "Late afternoon",
    consequence: consequenceFixture(),
  };
}

function narrationFixture(): CampaignPlayNarration {
  return {
    narrationId: "narration_1",
    turnId: "turn_1",
    beats: [{ beatId: "beat_1", text: "Rain threads across the bridge." }],
    displayText: "Rain threads across the bridge as the new guards take position.",
    suggestedActions: [{
      choiceHandle: "choice_watch_bridge",
      label: "Examine the guarded route from shelter",
    }],
    effects: [{ kind: "flash", beatId: "beat_1" }],
    createdAt: 1_000,
  };
}

function narratorPacketFixture(): CampaignPlayNarratorPacket {
  return {
    campaignId: "campaign_1",
    turnId: "turn_1",
    turnKind: "player_action",
    openingContext: null,
    sourceMoment: "Rain threads across the bridge while the guards take position.",
    actionContext: {
      submittedText: "Watch the bridge from shelter.",
      intentKind: "observe",
      disposition: "deterministic",
      result: "success",
      clarificationQuestion: null,
    },
    playerHistory: [],
    acceptedWorldVersion: 7,
    worldVersion: 11,
    runtimeRevision: 29,
    currentLocation: {
      handle: "location_bridge",
      name: "East Bridge",
      description: "A narrow stone bridge above floodwater.",
    },
    visibleActors: [{
      handle: "actor_guard",
      name: "Mara Venn",
      monogram: "MV",
      descriptor: "A soaked guard with a dented lantern.",
      accent: "amber-7",
    }],
    visibleRoutes: [{
      handle: "route_market",
      destinationHandle: "location_market",
      destinationName: "Flood Market",
      state: "restricted",
      travelTimeLabel: "About twenty minutes",
    }],
    visiblePressures: [{
      handle: "pressure_flood",
      label: "Rising water",
      summary: "The river keeps climbing against the old piers.",
    }],
    possessions: [],
    obligations: [],
    newObservations: [journalEntryFixture()],
    consequences: [consequenceFixture()],
    continuity: [journalEntryFixture()],
    elapsedMinutes: 10,
    availableIntents: [{
      handle: "choice_watch_bridge",
      label: "Watch from shelter",
      kind: "observe",
      targets: [{ handle: "route_market", kind: "route" }],
    }],
  };
}

function attemptIntentFixture() {
  return {
    handle: "choice_continue_work",
    label: "Try the immediate next step",
    kind: "attempt" as const,
    targets: [{ handle: "location_bridge", kind: "location" as const }],
  };
}

function openingOptionFixture() {
  return {
    locationHandle: "location_bridge",
    name: "Old River Bridge",
    description: "A rain-dark crossing above the flooded market road.",
    roles: [
      { handle: "role_traveler", label: "Newly arrived traveler" },
      { handle: "role_local", label: "Local witness" },
    ],
    arrivalModes: [
      { handle: "arrival_foot", label: "On foot" },
      { handle: "arrival_ferry", label: "By river ferry" },
    ],
    immediateSituations: [
      { handle: "situation_shelter", label: "Seeking shelter from the rain" },
      { handle: "situation_blockade", label: "Stopped at the barricade" },
    ],
  };
}

function stateFixture(): CampaignPlayState {
  const packet = narratorPacketFixture();
  return {
    campaignId: packet.campaignId,
    acceptedWorldVersion: packet.acceptedWorldVersion,
    worldVersion: packet.worldVersion,
    runtimeRevision: packet.runtimeRevision,
    phase: "turn_active",
    character: {
      name: "Iria Vale",
      monogram: "IV",
      descriptor: "A traveler carrying a weather-stained field journal.",
      accent: "blue-5",
    },
    openingOptions: [],
    currentLocation: packet.currentLocation,
    visibleActors: packet.visibleActors,
    visibleRoutes: packet.visibleRoutes,
    visiblePressures: packet.visiblePressures,
    possessions: packet.possessions,
    obligations: packet.obligations,
    narration: narrationFixture(),
    consequences: packet.consequences,
    activeTurn: {
      turnId: packet.turnId,
      turnKind: packet.turnKind,
      status: "processing",
      progress: "world_acting",
      lastEventSequence: 4,
      retryEligible: false,
      submittedAt: 900,
      completedAt: null,
    },
    journalCursor: 8,
    projectionHash: HASH_A,
  };
}

function journalPageFixture(): CampaignPlayJournalPage {
  return {
    campaignId: "campaign_1",
    acceptedWorldVersion: 7,
    worldVersion: 11,
    runtimeRevision: 29,
    entries: [journalEntryFixture()],
    nextCursor: 9,
  };
}

function characterDraftFixture() {
  return {
    name: "Iria Vale",
    summary: "A traveler who records the effects of the flood.",
    species: "Human",
    gender: "Woman",
    ageText: "Early thirties",
    appearance: "Weather-stained coat, silver-rimmed glasses, and inked fingers.",
    biography: "Iria arrived from the coast after following reports of the broken river road.",
    personality: {
      summary: "Patient, skeptical, and quietly compassionate.",
      voice: "Precise sentences with dry humor.",
      decisionStyle: "Observe first, then commit to one practical course.",
      worldview: "Every public story hides a material cause.",
      contradictions: ["Distrusts institutions but keeps meticulous official records."],
      mythology: "Believes roads remember everyone who leaves by them.",
      sampleLines: ["Show me where the water first crossed the stones."],
    },
    motives: ["Understand why the flood defenses failed."],
    beliefs: ["Evidence matters more than rank."],
    drives: ["Protect ordinary travelers from preventable harm."],
    traits: ["observant", "methodical"],
    skills: [{ name: "Field investigation", tier: "Skilled" as const }],
    flaws: ["Slow to trust urgent claims."],
    specialties: ["Reading physical traces"],
    inventory: ["Field journal", "Oilskin cloak"],
    signatureItems: ["Silver-rimmed glasses"],
    source: {
      kind: "created" as const,
      importMode: null,
      label: "Player-created character",
    },
  };
}

function commandBase(order = 0, expectedWorldVersion = 11) {
  return {
    commandId: `command_${order}`,
    batchId: "batch_1",
    order,
    causalParent: { kind: "turn" as const, turnId: "turn_1" },
    source: { kind: "actor" as const, actorId: "actor_player" },
    expectedWorldVersion,
    readScope: [{ kind: "location" as const, id: "location_bridge" }],
    writeScope: [{ kind: "actor" as const, id: "actor_player" }],
    exposure: { mode: "protected" as const },
  };
}

function commandFixtures(): RulebookBatchCommand[] {
  return [
    { ...commandBase(), kind: "advance_world_time", elapsedMinutes: 10 },
    {
      ...commandBase(),
      kind: "move_actor",
      actorId: "actor_player",
      routeId: "route_market",
      fromLocationId: "location_bridge",
      toLocationId: "location_market",
    },
    {
      ...commandBase(),
      kind: "set_route_state",
      routeId: "route_market",
      state: "restricted",
      reason: "Floodwater has reached the lower steps.",
    },
    {
      ...commandBase(),
      kind: "set_actor_condition",
      actorId: "actor_guard",
      condition: "strained",
      operation: "set",
      summary: "The guard is soaked and exhausted.",
    },
    {
      ...commandBase(),
      kind: "update_actor_relation",
      relationId: "relation_guard_player",
      intensity: 2,
      summary: "The guard now recognizes the traveler.",
    },
    {
      ...commandBase(),
      kind: "update_actor_goal",
      goalId: "goal_guard_bridge",
      status: "blocked",
      summary: "The flooded steps block the patrol route.",
    },
    {
      ...commandBase(),
      kind: "advance_pressure",
      pressureId: "pressure_flood",
      amount: 5,
      resultStatus: "active",
    },
    {
      ...commandBase(),
      kind: "adjust_actor_possession",
      actorId: "actor_player",
      possessionId: "possession_copper_chit",
      possessionKey: "copper chit",
      name: "Copper chit",
      quantityDelta: 2,
      summary: "The clerk pays two copper chits.",
      affectedRefs: [{ kind: "actor", id: "actor_player" }],
    },
    {
      ...commandBase(),
      kind: "incur_actor_obligation",
      debtorActorId: "actor_player",
      creditorActorId: "actor_guard",
      obligationId: "obligation_passage_guard_copper",
      unitKey: "copper",
      amount: 8,
      summary: "The traveler owes the guard eight copper for passage.",
      affectedRefs: [{ kind: "actor", id: "actor_guard" }],
    },
    {
      ...commandBase(),
      kind: "pay_actor_obligation",
      debtorActorId: "actor_player",
      creditorActorId: "actor_guard",
      obligationId: "obligation_passage_guard_copper",
      paymentPossessionId: "possession_copper_chit",
      unitKey: "copper",
      amount: 3,
      summary: "The traveler pays three copper chits toward the passage debt.",
      affectedRefs: [{ kind: "actor", id: "actor_guard" }],
    },
    {
      ...commandBase(),
      kind: "record_world_event",
      eventClass: "discovery",
      performingActorId: null,
      summary: "A fresh barricade appears at the bridge.",
      observableTrace: null,
      affectedRefs: [{ kind: "route", id: "route_market" }],
    },
    {
      ...commandBase(),
      kind: "create_player_actor",
      actorId: "actor_player",
      characterDigest: HASH_A,
      name: "Iria Vale",
      summary: "A traveler carrying a weather-stained journal.",
      traits: ["observant"],
      tags: ["traveler"],
    },
    {
      ...commandBase(),
      kind: "initialize_player_placement",
      actorId: "actor_player",
      locationId: "location_bridge",
    },
    {
      ...commandBase(),
      kind: "initialize_world_time",
      worldTimeMinutes: 480,
    },
    {
      ...commandBase(),
      kind: "initialize_pressure_state",
      pressureId: "pressure_flood",
      progress: 20,
      status: "active",
    },
  ];
}

function worldEventBase() {
  return {
    eventId: "event_1",
    campaignId: "campaign_1",
    turnId: "turn_1",
    commandId: "command_0",
    receiptId: "receipt_1",
    parentEventId: null,
    source: { kind: "actor" as const, actorId: "actor_player" },
    worldTimeMinutes: 490,
    worldVersion: 12,
    affectedRefs: [{ kind: "actor" as const, id: "actor_player" }],
    exposures: [{
      exposureId: "exposure_1",
      campaignId: "campaign_1",
      eventId: "event_1",
      channel: "direct_perception" as const,
      locationId: "location_bridge",
      createdAt: 1_000,
    }],
    payloadHash: HASH_A,
    createdAt: 1_000,
  };
}

function worldEventFixtures() {
  const base = worldEventBase();
  return [
    { ...base, kind: "player_actor_created", actorId: "actor_player" },
    {
      ...base,
      kind: "player_placement_initialized",
      actorId: "actor_player",
      locationId: "location_bridge",
    },
    { ...base, kind: "world_time_initialized", worldTimeMinutes: 480 },
    {
      ...base,
      kind: "pressure_initialized",
      pressureId: "pressure_flood",
      progress: 20,
      status: "active",
    },
    {
      ...base,
      kind: "world_time_advanced",
      priorWorldTimeMinutes: 480,
      resultWorldTimeMinutes: 490,
    },
    {
      ...base,
      kind: "actor_moved",
      actorId: "actor_player",
      routeId: "route_market",
      fromLocationId: "location_bridge",
      toLocationId: "location_market",
    },
    {
      ...base,
      kind: "route_state_changed",
      routeId: "route_market",
      priorState: "open",
      resultState: "restricted",
    },
    {
      ...base,
      kind: "actor_condition_changed",
      actorId: "actor_guard",
      condition: "strained",
      operation: "set",
      priorPresent: false,
      resultPresent: true,
      summary: "The guard is exhausted.",
    },
    {
      ...base,
      kind: "actor_relation_changed",
      relationId: "relation_guard_player",
      priorIntensity: 1,
      resultIntensity: 2,
      priorSummary: "The guard has seen the traveler once.",
      resultSummary: "The guard recognizes the traveler.",
    },
    {
      ...base,
      kind: "actor_goal_changed",
      goalId: "goal_guard_bridge",
      priorStatus: "active",
      resultStatus: "blocked",
      priorSummary: "Patrol the bridge before dusk.",
      resultSummary: "Floodwater blocks the patrol.",
    },
    {
      ...base,
      kind: "pressure_advanced",
      pressureId: "pressure_flood",
      priorProgress: 20,
      resultProgress: 25,
      priorStatus: "active",
      resultStatus: "active",
    },
    {
      ...base,
      kind: "actor_obligation_incurred",
      debtorActorId: "actor_player",
      creditorActorId: "actor_guard",
      obligationId: "obligation_passage_guard_copper",
      unitKey: "copper",
      amount: 8,
      priorPrincipalAmount: 0,
      resultPrincipalAmount: 8,
      priorOutstandingAmount: 0,
      resultOutstandingAmount: 8,
      summary: "The traveler owes the guard eight copper for passage.",
    },
    {
      ...base,
      kind: "actor_possession_adjusted",
      actorId: "actor_player",
      possessionId: "possession_copper_chit",
      possessionKey: "copper chit",
      name: "Copper chit",
      quantityDelta: 2,
      priorQuantity: 0,
      resultQuantity: 2,
      summary: "The clerk pays two copper chits.",
    },
    {
      ...base,
      kind: "actor_obligation_payment_applied",
      debtorActorId: "actor_player",
      creditorActorId: "actor_guard",
      obligationId: "obligation_passage_guard_copper",
      paymentPossessionId: "possession_copper_chit",
      paymentPossessionKey: "copper-chit",
      paymentPossessionName: "Copper chit",
      creditorPossessionId: "possession_guard_copper_chit",
      unitKey: "copper",
      amount: 3,
      priorDebtorQuantity: 5,
      resultDebtorQuantity: 2,
      priorCreditorQuantity: 1,
      resultCreditorQuantity: 4,
      principalAmount: 8,
      priorOutstandingAmount: 8,
      resultOutstandingAmount: 5,
    },
    {
      ...base,
      kind: "scene_recorded",
      eventClass: "discovery",
      performingActorId: null,
      summary: "A fresh barricade appears at the bridge.",
    },
  ];
}

function actorPlanFixture() {
  return {
    planId: "plan_guard",
    campaignId: "campaign_1",
    actorId: "actor_guard",
    goalId: "goal_guard_bridge",
    planVersion: 1,
    intent: {
      kind: "move" as const,
      targets: [{ kind: "location" as const, id: "location_market" }],
      method: "on foot",
      stakes: "The patrol reaches the market before dark.",
    },
    preconditions: [{
      kind: "actor_at_location" as const,
      actorId: "actor_guard",
      locationId: "location_bridge",
    }],
    cadenceMinutes: 30,
    priority: 4,
    steps: [{
      stepId: "step_1",
      order: 0,
      intent: {
        kind: "move" as const,
        targets: [{ kind: "location" as const, id: "location_market" }],
        method: "on foot",
        stakes: null,
      },
      observableTrace: "Fresh boot prints lead from the bridge toward the market.",
      possessionOutcome: { kind: "none" as const },
      elapsedBounds: { minimumMinutes: 10, maximumMinutes: 30 },
    }],
    status: "active" as const,
  };
}

describe("Campaign Play shared public contracts", () => {
  it("round-trips every lifecycle and intent discriminator", () => {
    for (const phase of CAMPAIGN_PLAY_SETUP_PHASE_VALUES) {
      expect(campaignPlaySetupPhaseSchema.parse(phase)).toBe(phase);
    }
    for (const phase of CAMPAIGN_PLAY_PHASE_VALUES) {
      expect(campaignPlayPhaseSchema.parse(phase)).toBe(phase);
    }
    for (const kind of CAMPAIGN_TURN_KIND_VALUES) {
      expect(campaignTurnKindSchema.parse(kind)).toBe(kind);
    }
    for (const stage of CAMPAIGN_TURN_STAGE_VALUES) {
      expect(campaignTurnStageSchema.parse(stage)).toBe(stage);
    }
    for (const kind of WORLD_INTENT_KIND_VALUES) {
      expect(worldIntentKindSchema.parse(kind)).toBe(kind);
      expect(playerIntentSchema.parse(intentFixture(kind, "freeform"))).toEqual(
        intentFixture(kind, "freeform"),
      );
      expect(playerIntentSchema.parse(intentFixture(kind, "suggested"))).toEqual(
        intentFixture(kind, "suggested"),
      );
    }
  });

  it("round-trips every public visual and action discriminator", () => {
    for (const kind of CAMPAIGN_PLAY_EFFECT_KIND_VALUES) {
      expect(campaignPlayStageEffectSchema.parse({ kind, beatId: null })).toEqual({
        kind,
        beatId: null,
      });
    }
    for (const causalCue of CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES) {
      expect(campaignPlayConsequenceSchema.safeParse({
        ...consequenceFixture(),
        causalCue,
      }).success).toBe(true);
    }
    for (const kind of CAMPAIGN_PLAY_VISIBLE_TARGET_KIND_VALUES) {
      expect(playerIntentSchema.safeParse({
        ...intentFixture(),
        targets: [{ handle: `target_${kind}`, kind }],
      }).success).toBe(true);
    }
    for (const progress of [
      "interpreting",
      "settling",
      "world_acting",
      "revealing",
      "narrating",
    ] as const) {
      expect(campaignPlayPublicTurnSchema.safeParse({
        ...stateFixture().activeTurn!,
        progress,
      }).success).toBe(true);
    }
    for (const state of ["open", "restricted", "blocked"] as const) {
      expect(campaignPlayNarratorPacketSchema.safeParse({
        ...narratorPacketFixture(),
        visibleRoutes: [{
          ...narratorPacketFixture().visibleRoutes[0],
          state,
        }],
      }).success).toBe(true);
    }
    expect(campaignPlayOpeningAdmissionRequestSchema.safeParse({
      idempotencyKey: "opening_chosen",
      expectedWorldVersion: 7,
      expectedRuntimeRevision: 1,
      startingConditions: {
        mode: "chosen",
        locationHandle: "location_bridge",
        roleHandle: "role_traveler",
        arrivalModeHandle: "arrival_foot",
        immediateSituationHandle: "situation_shelter",
      },
    }).success).toBe(true);
  });

  it("preserves accepted, mechanical, and runtime versions independently", () => {
    const state = stateFixture();
    expect(campaignPlayStateSchema.parse(state)).toMatchObject({
      acceptedWorldVersion: 7,
      worldVersion: 11,
      runtimeRevision: 29,
    });
    expect(campaignPlayPublicVersionsSchema.safeParse({
      acceptedWorldVersion: 7,
      worldVersion: 6,
      runtimeRevision: 29,
    }).success).toBe(false);
  });

  it("accepts only coherent public lifecycle projections", () => {
    const active = stateFixture();
    const emptyScene = {
      currentLocation: null,
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      possessions: [],
      narration: null,
      consequences: [],
      activeTurn: null,
    };
    const states: CampaignPlayState[] = [
      {
        ...active,
        ...emptyScene,
        phase: "character_required",
        character: null,
      },
      {
        ...active,
        ...emptyScene,
        phase: "opening_required",
        openingOptions: [openingOptionFixture()],
        possessions: [{ handle: "possession_tools", name: "Mending tools", quantity: 1 }],
      },
      {
        ...active,
        ...emptyScene,
        phase: "opening_active",
        possessions: [{ handle: "possession_tools", name: "Mending tools", quantity: 1 }],
        activeTurn: {
          ...active.activeTurn!,
          turnKind: "opening",
        },
      },
      {
        ...active,
        ...emptyScene,
        phase: "opening_active",
        possessions: [{ handle: "possession_tools", name: "Mending tools", quantity: 1 }],
        activeTurn: {
          ...active.activeTurn!,
          turnKind: "opening",
          status: "interrupted",
          progress: null,
          retryEligible: true,
        },
      },
      {
        ...active,
        phase: "ready",
        activeTurn: null,
      },
      active,
      {
        ...active,
        phase: "narration_pending",
        activeTurn: { ...active.activeTurn!, progress: "narrating" },
      },
      {
        ...active,
        phase: "narration_pending",
        activeTurn: {
          ...active.activeTurn!,
          status: "interrupted",
          progress: null,
          retryEligible: true,
        },
      },
    ];
    for (const state of states) {
      expect(campaignPlayStateSchema.safeParse(state).success).toBe(true);
    }
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      phase: "ready",
    }).success).toBe(false);
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      ...emptyScene,
      phase: "opening_required",
    }).success).toBe(false);
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      phase: "ready",
      activeTurn: null,
      openingOptions: [openingOptionFixture()],
    }).success).toBe(false);
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      phase: "narration_pending",
      activeTurn: null,
    }).success).toBe(false);
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      ...emptyScene,
      phase: "opening_active",
      activeTurn: active.activeTurn,
    }).success).toBe(false);
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      phase: "turn_active",
      activeTurn: { ...active.activeTurn!, turnKind: "opening" },
    }).success).toBe(false);

    const turnBase = active.activeTurn!;
    for (const turn of [
      turnBase,
      {
        ...turnBase,
        status: "interrupted",
        progress: null,
        retryEligible: true,
      },
      {
        ...turnBase,
        status: "completed",
        progress: null,
        retryEligible: false,
        completedAt: 1_100,
      },
      {
        ...turnBase,
        status: "failed",
        progress: null,
        retryEligible: false,
        completedAt: 1_100,
      },
    ]) {
      expect(campaignPlayPublicTurnSchema.safeParse(turn).success).toBe(true);
    }
    expect(campaignPlayStateSchema.safeParse({
      ...active,
      activeTurn: { ...turnBase, completedAt: 1_100 },
    }).success).toBe(false);
  });

  it("binds chosen starting conditions to an offered location and bounded text", () => {
    const option = openingOptionFixture();
    const chosen = {
      mode: "chosen" as const,
      locationHandle: option.locationHandle,
      roleHandle: option.roles[0]!.handle,
      arrivalModeHandle: option.arrivalModes[0]!.handle,
      immediateSituationHandle: option.immediateSituations[0]!.handle,
    };
    expect(() => validateCampaignPlayStartingConditionsAgainstOptions(
      chosen,
      [option],
    )).not.toThrow();
    expect(() => validateCampaignPlayStartingConditionsAgainstOptions(
      { mode: "delegate" },
      [],
    )).not.toThrow();
    expect(() => validateCampaignPlayStartingConditionsAgainstOptions(
      { ...chosen, locationHandle: "location_hidden" },
      [option],
    )).toThrow(expect.objectContaining({ code: "invalid_starting_conditions" }));
    expect(() => validateCampaignPlayStartingConditionsAgainstOptions(
      { ...chosen, roleHandle: option.arrivalModes[0]!.handle },
      [option],
    )).toThrow(expect.objectContaining({ code: "invalid_starting_conditions" }));
    const otherLocation = {
      ...option,
      locationHandle: "location_harbor",
      roles: [{ handle: "role_harbor_local", label: "Harbor local" }],
    };
    expect(() => validateCampaignPlayStartingConditionsAgainstOptions(
      { ...chosen, roleHandle: otherLocation.roles[0]!.handle },
      [option, otherLocation],
    )).toThrow(expect.objectContaining({ code: "invalid_starting_conditions" }));
    expect(campaignPlayOpeningLocationOptionSchema.safeParse({
      ...option,
      roles: [option.roles[0], option.roles[0]],
    }).success).toBe(false);
    for (const field of ["roles", "arrivalModes", "immediateSituations"] as const) {
      expect(campaignPlayOpeningLocationOptionSchema.safeParse({
        ...option,
        [field]: [],
      }).success).toBe(false);
    }
    expect(campaignPlayStartingConditionsSchema.safeParse({
      ...chosen,
      roleHandle: null,
    }).success).toBe(false);

    const openingState = {
      ...stateFixture(),
      phase: "opening_required" as const,
      currentLocation: null,
      visibleActors: [],
      visibleRoutes: [],
      visiblePressures: [],
      narration: null,
      consequences: [],
      activeTurn: null,
      openingOptions: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.openingLocations + 1 },
        (_, index) => ({
          ...option,
          locationHandle: `location_${index}`,
        }),
      ),
    };
    expect(campaignPlayStateSchema.safeParse(openingState).success).toBe(false);
    expect(campaignPlayStateSchema.safeParse({
      ...openingState,
      openingOptions: [option, option],
    }).success).toBe(false);
  });

  it("round-trips state, packet, narration, journal, requests, SSE, and errors", () => {
    const state = stateFixture();
    const packet = narratorPacketFixture();
    const narration = narrationFixture();
    const journal = journalPageFixture();
    const freeform = {
      source: "freeform",
      idempotencyKey: "action_1",
      text: "Watch the bridge.",
      expectedWorldVersion: 11,
      expectedRuntimeRevision: 29,
    };
    const suggested = {
      source: "suggested",
      idempotencyKey: "action_2",
      choiceHandle: "choice_watch_bridge",
      expectedWorldVersion: 11,
      expectedRuntimeRevision: 29,
    };
    const opening = {
      idempotencyKey: "opening_1",
      expectedWorldVersion: 7,
      expectedRuntimeRevision: 1,
      startingConditions: { mode: "delegate" },
    };
    const resume = {
      expectedWorldVersion: 11,
      expectedRuntimeRevision: 29,
    };
    const response = { turnId: "turn_1", sequence: 1 };
    const journalRequest = { cursor: 0, limit: 20 };
    const error = {
      code: "turn_in_progress",
      status: 409,
      campaignPhase: "turn_active",
      acceptedWorldVersion: 7,
      expectedWorldVersion: 11,
      currentWorldVersion: 11,
      expectedRuntimeRevision: 29,
      currentRuntimeRevision: 29,
      turnId: "turn_1",
      retryEligible: false,
      unmetRequirements: [],
    };

    expect(campaignPlayStateSchema.parse(state)).toEqual(state);
    expect(campaignPlayNarratorPacketSchema.parse(packet)).toEqual(packet);
    expect(campaignPlayNarrationSchema.parse(narration)).toEqual(narration);
    expect(campaignPlayJournalPageSchema.parse(journal)).toEqual(journal);
    expect(campaignPlayTurnAdmissionRequestSchema.parse(freeform)).toEqual(freeform);
    expect(campaignPlayTurnAdmissionRequestSchema.parse(suggested)).toEqual(suggested);
    expect(campaignPlayOpeningAdmissionRequestSchema.parse(opening)).toEqual(opening);
    expect(campaignPlayResumeTurnRequestSchema.parse(resume)).toEqual(resume);
    expect(campaignPlayTurnAdmissionResponseSchema.parse(response)).toEqual(response);
    expect(campaignPlayJournalRequestSchema.parse(journalRequest)).toEqual(journalRequest);
    expect(campaignPlayErrorResponseSchema.parse(error)).toEqual(error);

    const events: CampaignPlaySseEvent[] = [
      {
        type: "turn.accepted",
        status: "processing",
        sequence: 1,
        turnId: "turn_1",
        acceptedWorldVersion: 7,
        worldVersion: 11,
        runtimeRevision: 29,
        createdAt: 1_000,
      },
      {
        type: "turn.progressed",
        progress: "settling",
        sequence: 2,
        turnId: "turn_1",
        acceptedWorldVersion: 7,
        worldVersion: 12,
        runtimeRevision: 30,
        createdAt: 1_001,
      },
      {
        type: "turn.interrupted",
        retryEligible: true,
        sequence: 3,
        turnId: "turn_1",
        acceptedWorldVersion: 7,
        worldVersion: 12,
        runtimeRevision: 31,
        createdAt: 1_002,
      },
      {
        type: "turn.completed",
        retryEligible: false,
        sequence: 4,
        turnId: "turn_1",
        acceptedWorldVersion: 7,
        worldVersion: 12,
        runtimeRevision: 32,
        createdAt: 1_003,
      },
      {
        type: "turn.failed",
        retryEligible: false,
        errorCode: "turn_failed",
        sequence: 5,
        turnId: "turn_1",
        acceptedWorldVersion: 7,
        worldVersion: 12,
        runtimeRevision: 33,
        createdAt: 1_004,
      },
    ];
    for (const event of events) {
      expect(campaignPlaySseEventSchema.parse(event)).toEqual(event);
    }

    const turnBase = state.activeTurn!;
    const turnReads = [
      {
        campaignId: "campaign_1",
        acceptedWorldVersion: 7,
        worldVersion: 11,
        runtimeRevision: 29,
        turn: turnBase,
        result: { status: "processing" },
      },
      {
        campaignId: "campaign_1",
        acceptedWorldVersion: 7,
        worldVersion: 11,
        runtimeRevision: 30,
        turn: {
          ...turnBase,
          status: "interrupted",
          progress: null,
          retryEligible: true,
        },
        result: { status: "interrupted", errorCode: "turn_interrupted" },
      },
      {
        campaignId: "campaign_1",
        acceptedWorldVersion: 7,
        worldVersion: 12,
        runtimeRevision: 31,
        turn: {
          ...turnBase,
          status: "completed",
          progress: null,
          retryEligible: false,
          completedAt: 1_100,
        },
        result: {
          status: "completed",
          narration,
          consequences: packet.consequences,
          journalCursor: 9,
        },
      },
      {
        campaignId: "campaign_1",
        acceptedWorldVersion: 7,
        worldVersion: 11,
        runtimeRevision: 31,
        turn: {
          ...turnBase,
          status: "failed",
          progress: null,
          retryEligible: false,
          completedAt: 1_100,
        },
        result: { status: "failed", errorCode: "turn_failed" },
      },
    ];
    for (const turnRead of turnReads) {
      expect(campaignPlayTurnReadResponseSchema.parse(turnRead)).toEqual(turnRead);
    }
    expect(campaignPlayTurnReadResponseSchema.safeParse({
      ...turnReads[0],
      result: { status: "failed", errorCode: "invalid_intent" },
    }).success).toBe(false);
    expect(campaignPlayTurnReadResponseSchema.safeParse({
      ...turnReads[2],
      result: {
        ...turnReads[2]!.result,
        narration: { ...narration, turnId: "turn_other" },
      },
    }).success).toBe(false);
    expect(campaignPlayTurnReadResponseSchema.safeParse({
      ...turnReads[1],
      result: { status: "interrupted", errorCode: "invalid_intent" },
    }).success).toBe(false);
    expect(campaignPlayTurnReadResponseSchema.safeParse({
      ...turnReads[3],
      result: { status: "failed", errorCode: "service_unavailable" },
    }).success).toBe(false);
  });

  it("owns strict bounded character intake requests and results", () => {
    const draft = characterDraftFixture();
    const research = {
      summary: "Travel records connect the failed river road to the east bridge.",
      sources: [{
        label: "Harbor road ledger",
        excerpt: "Three closures followed the first week of rain.",
      }],
    };
    const fixtures: Array<[Parser, object]> = [
      [campaignPlayParsePlayerCardRequestSchema, {
        cardJson: JSON.stringify({ data: { name: "Iria Vale" } }),
        importMode: "outsider",
      }],
      [campaignPlayGeneratePlayerDraftRequestSchema, {
        prompt: "Create an observant outsider who studies the flood.",
        research,
      }],
      [campaignPlayResearchPlayerRequestSchema, {
        query: "A field investigator from the coast",
      }],
      [campaignPlayCharacterDraftSchema, draft],
      [campaignPlayCharacterDraftResponseSchema, { draft }],
      [campaignPlayCharacterResearchResponseSchema, { research }],
      [campaignPlayPutPlayerRequestSchema, {
        acceptedWorldVersion: 7,
        expectedWorldVersion: 7,
        expectedRuntimeRevision: 1,
        source: "created",
        character: draft,
      }],
      [campaignPlayPutPlayerResponseSchema, {
        actorHandle: "actor_player",
        acceptedWorldVersion: 7,
        worldVersion: 11,
        runtimeRevision: 2,
      }],
    ];
    for (const [schema, fixture] of fixtures) {
      expect(schema.parse(fixture)).toEqual(fixture);
    }
    expect(CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES).toContain(draft.source.kind);
    expect(campaignPlayParsePlayerCardRequestSchema.safeParse({
      cardJson: JSON.stringify({
        data: "x".repeat(CAMPAIGN_PLAY_LIMITS.cardBytes),
      }),
      importMode: "native",
    }).success).toBe(false);
    expect(campaignPlayCharacterDraftSchema.safeParse({
      ...draft,
      personality: { ...draft.personality, unknown: true },
    }).success).toBe(false);
    expect(campaignPlayPutPlayerRequestSchema.safeParse({
      acceptedWorldVersion: 7,
      expectedWorldVersion: 7,
      expectedRuntimeRevision: 1,
      source: "generated",
      character: draft,
    }).success).toBe(false);
    expect(campaignPlayPutPlayerRequestSchema.safeParse({
      acceptedWorldVersion: 7,
      expectedWorldVersion: 8,
      expectedRuntimeRevision: 1,
      source: "created",
      character: draft,
    }).success).toBe(false);
    expect(campaignPlayPutPlayerResponseSchema.safeParse({
      actorHandle: "actor_player",
      acceptedWorldVersion: 7,
      worldVersion: 7,
      runtimeRevision: 2,
    }).success).toBe(false);
    expect(campaignPlayPutPlayerResponseSchema.safeParse({
      actorHandle: "actor_player",
      acceptedWorldVersion: 7,
      worldVersion: 29,
      runtimeRevision: 2,
    }).success).toBe(false);
  });

  it("rejects protected fields at every public root", () => {
    const cases: Array<[string, Parser, object]> = [
      ["state", campaignPlayStateSchema, stateFixture()],
      ["packet", campaignPlayNarratorPacketSchema, narratorPacketFixture()],
      ["narration", campaignPlayNarrationSchema, narrationFixture()],
      ["journal", campaignPlayJournalPageSchema, journalPageFixture()],
      ["SSE", campaignPlaySseEventSchema, {
        type: "turn.completed",
        retryEligible: false,
        sequence: 4,
        turnId: "turn_1",
        acceptedWorldVersion: 7,
        worldVersion: 12,
        runtimeRevision: 32,
        createdAt: 1_003,
      }],
      ["error", campaignPlayErrorResponseSchema, {
        code: "turn_in_progress",
        status: 409,
        campaignPhase: "turn_active",
        acceptedWorldVersion: 7,
        expectedWorldVersion: 11,
        currentWorldVersion: 11,
        expectedRuntimeRevision: 29,
        currentRuntimeRevision: 29,
        turnId: "turn_1",
        retryEligible: false,
        unmetRequirements: [],
      }],
    ];
    const protectedKeys = [
      "actorId",
      "locationId",
      "eventId",
      "goalId",
      "worldHash",
      "runtimeHash",
      "payloadHash",
      "packetHash",
      "workerEpoch",
      "provider",
      "model",
    ];
    for (const [label, schema, fixture] of cases) {
      for (const key of protectedKeys) {
        expect(
          schema.safeParse({ ...fixture, [key]: "protected_value" }).success,
          `${label} accepted protected key ${key}`,
        ).toBe(false);
      }
    }
  });

  it("binds every public error code to truthful status and context", () => {
    for (const code of Object.keys(CAMPAIGN_PLAY_ERROR_METADATA) as Array<
      keyof typeof CAMPAIGN_PLAY_ERROR_METADATA
    >) {
      const metadata = CAMPAIGN_PLAY_ERROR_METADATA[code];
      const hasContext = metadata.context === "play";
      const error = {
        code,
        status: metadata.status,
        campaignPhase: hasContext ? "ready" : null,
        acceptedWorldVersion: hasContext ? 7 : null,
        expectedWorldVersion: code === "stale_world_version" ? 10 : null,
        currentWorldVersion: hasContext ? 11 : null,
        expectedRuntimeRevision: code === "stale_runtime_revision" ? 28 : null,
        currentRuntimeRevision: hasContext ? 29 : null,
        turnId: code === "campaign_not_found" || code === "world_not_accepted"
          ? null
          : "turn_1",
        retryEligible: metadata.retryEligible,
        unmetRequirements: code === "world_not_playable"
          ? ["opening_route_missing"]
          : [],
      };
      expect(campaignPlayErrorResponseSchema.parse(error)).toEqual(error);
      expect(campaignPlayErrorResponseSchema.safeParse({
        ...error,
        status: metadata.status === 503 ? 409 : 503,
      }).success).toBe(false);
      expect(campaignPlayErrorResponseSchema.safeParse({
        ...error,
        retryEligible: !metadata.retryEligible,
      }).success).toBe(false);
    }
    const unavailableWithoutState = {
      code: "service_unavailable" as const,
      status: 503 as const,
      campaignPhase: null,
      acceptedWorldVersion: null,
      expectedWorldVersion: null,
      currentWorldVersion: null,
      expectedRuntimeRevision: null,
      currentRuntimeRevision: null,
      turnId: null,
      retryEligible: true,
      unmetRequirements: [],
    };
    expect(campaignPlayErrorResponseSchema.parse(unavailableWithoutState))
      .toEqual(unavailableWithoutState);
    expect(campaignPlayErrorResponseSchema.safeParse({
      ...unavailableWithoutState,
      campaignPhase: "ready",
    }).success).toBe(false);
  });

  it("rejects nested unknown keys and invalid discriminators", () => {
    const state = stateFixture();
    expect(campaignPlayStateSchema.safeParse({
      ...state,
      currentLocation: { ...state.currentLocation, unknown: true },
    }).success).toBe(false);
    const packet = narratorPacketFixture();
    expect(campaignPlayNarratorPacketSchema.safeParse({
      ...packet,
      availableIntents: [{
        ...packet.availableIntents[0],
        targets: [{ ...packet.availableIntents[0]?.targets[0], unknown: true }],
      }],
    }).success).toBe(false);
    const openingContext = {
      role: "A newly arrived visitor",
      arrivalMode: "On foot through the rain",
      immediateSituation: "The harbor watch is closing the east gate.",
    };
    expect(campaignPlayNarratorPacketSchema.safeParse({
      ...packet,
      openingContext,
    }).success).toBe(false);
    expect(campaignPlayNarratorPacketSchema.safeParse({
      ...packet,
      turnKind: "opening",
      openingContext,
      actionContext: null,
      sourceMoment: null,
    }).success).toBe(true);
    expect(campaignPlayNarratorPacketSchema.safeParse({
      ...packet,
      turnKind: "opening",
      openingContext,
      actionContext: null,
      playerHistory: [packet.actionContext],
      sourceMoment: null,
    }).success).toBe(false);
    expect(campaignPlayNarratorPacketSchema.safeParse({
      ...packet,
      turnKind: "opening",
      openingContext,
    }).success).toBe(false);
    expect(playerIntentSchema.safeParse({
      ...intentFixture(),
      kind: "teleport",
    }).success).toBe(false);
    expect(campaignPlaySseEventSchema.safeParse({
      type: "turn.secret",
      sequence: 1,
    }).success).toBe(false);
  });

  it("keeps every reusable public object strict against unknown and protected keys", () => {
    const packet = narratorPacketFixture();
    const state = stateFixture();
    const narration = narrationFixture();
    const fixtures: Array<[string, Parser, object]> = [
      ["target", campaignPlayVisibleTargetSchema, targetFixture()],
      ["location", campaignPlayVisibleLocationSchema, packet.currentLocation],
      ["actor", campaignPlayVisibleActorSchema, packet.visibleActors[0]!],
      ["route", campaignPlayVisibleRouteSchema, packet.visibleRoutes[0]!],
      ["pressure", campaignPlayVisiblePressureSchema, packet.visiblePressures[0]!],
      ["consequence", campaignPlayConsequenceSchema, consequenceFixture()],
      ["journal entry", campaignPlayJournalEntrySchema, journalEntryFixture()],
      ["available intent", campaignPlayAvailableIntentSchema, packet.availableIntents[0]!],
      ["beat", campaignPlayNarrationBeatSchema, narration.beats[0]!],
      ["suggested action", campaignPlaySuggestedActionSchema, narration.suggestedActions[0]!],
      ["effect", campaignPlayStageEffectSchema, narration.effects[0]!],
      ["character", campaignPlayPublicCharacterSchema, state.character!],
      ["opening detail", campaignPlayOpeningDetailOptionSchema,
        openingOptionFixture().roles[0]!],
      ["opening location", campaignPlayOpeningLocationOptionSchema,
        openingOptionFixture()],
      ["turn", campaignPlayPublicTurnSchema, state.activeTurn!],
      ["player intent", playerIntentSchema, intentFixture()],
      ["delegated start", campaignPlayStartingConditionsSchema, { mode: "delegate" }],
      ["chosen start", campaignPlayStartingConditionsSchema, {
        mode: "chosen",
        locationHandle: "location_bridge",
        roleHandle: "role_traveler",
        arrivalModeHandle: "arrival_foot",
        immediateSituationHandle: "situation_shelter",
      }],
    ];
    for (const [label, schema, fixture] of fixtures) {
      expect(
        schema.safeParse(fixture).success,
        `${label} fixture must prove the strictness branch`,
      ).toBe(true);
      expect(
        schema.safeParse({ ...fixture, __unexpected: true }).success,
        `${label} accepted an unknown field`,
      ).toBe(false);
      expect(
        schema.safeParse({ ...fixture, actorId: "actor_hidden" }).success,
        `${label} accepted a protected field`,
      ).toBe(false);
    }
  });

  it("enforces public text, collection, and byte bounds", () => {
    expect(playerIntentSchema.safeParse({
      ...intentFixture(),
      originalText: "x".repeat(CAMPAIGN_PLAY_LIMITS.playerInput + 1),
    }).success).toBe(false);
    expect(playerIntentSchema.safeParse({
      ...intentFixture(),
      targets: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.targets + 1 },
        (_, index) => ({ handle: `actor_${index}`, kind: "actor" }),
      ),
    }).success).toBe(false);
    expect(campaignPlayJournalRequestSchema.safeParse({
      cursor: 0,
      limit: CAMPAIGN_PLAY_LIMITS.journalPage + 1,
    }).success).toBe(false);
    expect(campaignPlayNarrationSchema.safeParse({
      ...narrationFixture(),
      effects: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.effects + 1 },
        () => ({ kind: "fade", beatId: null }),
      ),
    }).success).toBe(false);

    const largeEntry = {
      observationHandle: "observation_large",
      title: "t".repeat(CAMPAIGN_PLAY_LIMITS.label),
      text: "界".repeat(CAMPAIGN_PLAY_LIMITS.text),
      whereOrRoute: "w".repeat(CAMPAIGN_PLAY_LIMITS.label),
      worldTimeLabel: "l".repeat(CAMPAIGN_PLAY_LIMITS.label),
      consequence: {
        observationHandle: "observation_large",
        performingActorHandle: null,
        performingActorName: null,
        whatChanged: "界".repeat(CAMPAIGN_PLAY_LIMITS.text),
        whereOrRoute: "w".repeat(CAMPAIGN_PLAY_LIMITS.label),
        worldTimeLabel: "l".repeat(CAMPAIGN_PLAY_LIMITS.label),
        causalCue: "direct_perception",
      },
    };
    const packet = narratorPacketFixture();
    expect(campaignPlayNarratorPacketSchema.safeParse({
      ...packet,
      newObservations: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.newObservations },
        (_, index) => ({
          ...largeEntry,
          observationHandle: `new_${index}`,
          consequence: {
            ...largeEntry.consequence,
            observationHandle: `new_${index}`,
          },
        }),
      ),
      continuity: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.continuityEntries },
        (_, index) => ({
          ...largeEntry,
          observationHandle: `old_${index}`,
          consequence: {
            ...largeEntry.consequence,
            observationHandle: `old_${index}`,
          },
        }),
      ),
      consequences: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.newObservations },
        (_, index) => ({
          ...largeEntry.consequence,
          observationHandle: `new_${index}`,
        }),
      ),
    }).success).toBe(false);
  });

  it("accepts each public collection cap and rejects cap plus one", () => {
    const packet = narratorPacketFixture();
    const entry = (handle: string) => ({
      ...journalEntryFixture(),
      observationHandle: handle,
      consequence: {
        ...consequenceFixture(),
        observationHandle: handle,
      },
    });
    const cappedPacket: CampaignPlayNarratorPacket = {
      ...packet,
      visibleActors: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.visibleActors },
        (_, index) => ({ ...packet.visibleActors[0]!, handle: `actor_${index}` }),
      ),
      visibleRoutes: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.visibleRoutes },
        (_, index) => ({
          ...packet.visibleRoutes[0]!,
          handle: `route_${index}`,
          destinationHandle: `location_${index}`,
        }),
      ),
      visiblePressures: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.visiblePressures },
        (_, index) => ({ ...packet.visiblePressures[0]!, handle: `pressure_${index}` }),
      ),
      newObservations: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.newObservations },
        (_, index) => entry(`new_${index}`),
      ),
      consequences: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.newObservations },
        (_, index) => ({
          ...consequenceFixture(),
          observationHandle: `new_${index}`,
        }),
      ),
      continuity: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.continuityEntries },
        (_, index) => entry(`old_${index}`),
      ),
      playerHistory: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.continuityEntries },
        (_, index) => ({
          ...packet.actionContext!,
          submittedText: `Prior player action ${index}`,
        }),
      ),
      availableIntents: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.availableIntents },
        (_, index) => ({
          ...packet.availableIntents[0]!,
          handle: `choice_${index}`,
          targets: [{
            handle: `route_${index % CAMPAIGN_PLAY_LIMITS.visibleRoutes}`,
            kind: "route",
          }],
        }),
      ),
    };
    expect(campaignPlayNarratorPacketSchema.safeParse(cappedPacket).success).toBe(true);
    for (const key of [
      "visibleActors",
      "visibleRoutes",
      "visiblePressures",
      "newObservations",
      "consequences",
      "continuity",
      "playerHistory",
      "availableIntents",
    ] as const) {
      const values = cappedPacket[key];
      expect(campaignPlayNarratorPacketSchema.safeParse({
        ...cappedPacket,
        [key]: [...values, values[0]],
      }).success).toBe(false);
    }

    const narration = narrationFixture();
    const cappedNarration = {
      ...narration,
      beats: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.narrationBeats },
        (_, index) => ({ beatId: `beat_${index}`, text: `Beat ${index}` }),
      ),
      suggestedActions: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.suggestedActions },
        (_, index) => ({ choiceHandle: `choice_${index}`, label: `Choice ${index}` }),
      ),
      effects: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.effects },
        (_, index) => ({ kind: "fade", beatId: `beat_${index}` }),
      ),
    };
    expect(campaignPlayNarrationSchema.safeParse(cappedNarration).success).toBe(true);
    expect(campaignPlayNarrationSchema.safeParse({
      ...cappedNarration,
      beats: [...cappedNarration.beats, { beatId: "beat_extra", text: "Extra" }],
    }).success).toBe(false);
    expect(campaignPlayNarrationSchema.safeParse({
      ...cappedNarration,
      suggestedActions: [
        ...cappedNarration.suggestedActions,
        { choiceHandle: "choice_extra", label: "Extra" },
      ],
    }).success).toBe(false);
    const journal = journalPageFixture();
    const cappedEntries = Array.from(
      { length: CAMPAIGN_PLAY_LIMITS.journalPage },
      (_, index) => ({
        ...journalEntryFixture(),
        observationHandle: `journal_${index}`,
        consequence: {
          ...consequenceFixture(),
          observationHandle: `journal_${index}`,
        },
      }),
    );
    expect(campaignPlayJournalPageSchema.safeParse({
      ...journal,
      entries: cappedEntries,
    }).success).toBe(true);
    expect(campaignPlayJournalPageSchema.safeParse({
      ...journal,
      entries: [...cappedEntries, cappedEntries[0]],
    }).success).toBe(false);
  });

  it("enforces the aggregate public state byte cap", () => {
    const state = stateFixture();
    const wide = "界";
    const largeConsequence = (index: number) => ({
      observationHandle: `observation_${index}`,
      performingActorHandle: null,
      performingActorName: null,
      whatChanged: wide.repeat(CAMPAIGN_PLAY_LIMITS.text),
      whereOrRoute: wide.repeat(CAMPAIGN_PLAY_LIMITS.label),
      worldTimeLabel: wide.repeat(CAMPAIGN_PLAY_LIMITS.label),
      causalCue: "direct_perception" as const,
    });
    const largeState = {
      ...state,
      currentLocation: {
        ...state.currentLocation!,
        description: wide.repeat(CAMPAIGN_PLAY_LIMITS.text),
      },
      visiblePressures: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.visiblePressures },
        (_, index) => ({
          handle: `pressure_${index}`,
          label: wide.repeat(CAMPAIGN_PLAY_LIMITS.label),
          summary: wide.repeat(CAMPAIGN_PLAY_LIMITS.text),
        }),
      ),
      consequences: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.newObservations },
        (_, index) => largeConsequence(index),
      ),
      narration: {
        ...narrationFixture(),
        displayText: wide.repeat(CAMPAIGN_PLAY_LIMITS.narrationText),
        beats: Array.from(
          { length: CAMPAIGN_PLAY_LIMITS.narrationBeats },
          (_, index) => ({
            beatId: `beat_${index}`,
            text: wide.repeat(CAMPAIGN_PLAY_LIMITS.narrationBeat),
          }),
        ),
        effects: [],
      },
    };
    expect(campaignPlayStateSchema.safeParse(largeState).success).toBe(false);
  });

  it("binds narration choices to the immutable packet", () => {
    expect(() => validateNarrationAgainstPacket(
      narrationFixture(),
      narratorPacketFixture(),
    )).not.toThrow();
    expect(() => validateNarrationAgainstPacket(
      {
        ...narrationFixture(),
        suggestedActions: [{ choiceHandle: "choice_hidden", label: "Hidden" }],
      },
      narratorPacketFixture(),
    )).toThrow(CampaignPlayContractError);
    expect(() => validateNarrationAgainstPacket(
      {
        ...narrationFixture(),
        suggestedActions: [{
          choiceHandle: "choice_watch_bridge",
          label: "Attack the guard",
        }],
      },
      narratorPacketFixture(),
    )).toThrow(CampaignPlayContractError);
    expect(() => validateNarrationAgainstPacket(
      { ...narrationFixture(), suggestedActions: [] },
      narratorPacketFixture(),
    )).toThrow(CampaignPlayContractError);
    const catalogPacket = {
      ...narratorPacketFixture(),
      availableIntents: Array.from({ length: 5 }, (_value, index) => ({
        ...narratorPacketFixture().availableIntents[0]!,
        handle: `choice_catalog_${index}`,
      })),
    };
    const selectedNarration = {
      ...narrationFixture(),
      suggestedActions: [4, 1, 3, 0].map((index) => ({
        choiceHandle: `choice_catalog_${index}`,
        label: `Examine option ${index}`,
      })),
    };
    expect(() => validateNarrationAgainstPacket(
      selectedNarration,
      catalogPacket,
    )).not.toThrow();
    expect(() => validateNarrationAgainstPacket(
      {
        ...selectedNarration,
        suggestedActions: [
          selectedNarration.suggestedActions[0]!,
          selectedNarration.suggestedActions[0]!,
          ...selectedNarration.suggestedActions.slice(2),
        ],
      },
      catalogPacket,
    )).toThrow(CampaignPlayContractError);
    expect(() => validateNarrationAgainstPacket(
      {
        ...narrationFixture(),
        effects: [{ kind: "fade", beatId: "beat_1" }],
      },
      narratorPacketFixture(),
    )).toThrow(CampaignPlayContractError);
  });

  it("renders attempt choices as grammatical infinitives", () => {
    expect(buildCampaignPlaySuggestedActionLabel(
      narratorPacketFixture(),
      attemptIntentFixture(),
      "stow the tools and chit in the locker",
    )).toBe("Try to stow the tools and chit in the locker");
    expect(buildCampaignPlaySuggestedActionLabel(
      narratorPacketFixture(),
      {
        ...attemptIntentFixture(),
        targets: [{ handle: "route_market", kind: "route" }],
      },
      "shove off on Netta's signal",
    )).toBe("Try to reach Flood Market: shove off on Netta's signal");
  });

  it("renders ordinary moves only from frozen route authority", () => {
    const packet = narratorPacketFixture();
    const moveIntent = {
      handle: "choice_move_market",
      label: "Go to Flood Market",
      kind: "move" as const,
      targets: [{ handle: "route_market", kind: "route" as const }],
    };
    expect(buildCampaignPlaySuggestedActionLabel(
      packet,
      moveIntent,
      null,
    )).toBe("Go to Flood Market");
    expect(() => buildCampaignPlaySuggestedActionLabel(
      packet,
      moveIntent,
      "toward another scene's documents",
    )).toThrow(CampaignPlayContractError);
  });

  it("rejects stale mechanical and runtime expectations contextually", () => {
    expect(() => validateCampaignPlayVersionExpectation(
      { expectedWorldVersion: 11, expectedRuntimeRevision: 29 },
      { worldVersion: 11, runtimeRevision: 29 },
    )).not.toThrow();
    expect(() => validateCampaignPlayVersionExpectation(
      { expectedWorldVersion: 10, expectedRuntimeRevision: 29 },
      { worldVersion: 11, runtimeRevision: 29 },
    )).toThrow(expect.objectContaining({ code: "stale_world_version" }));
    expect(() => validateCampaignPlayVersionExpectation(
      { expectedWorldVersion: 11, expectedRuntimeRevision: 28 },
      { worldVersion: 11, runtimeRevision: 29 },
    )).toThrow(expect.objectContaining({ code: "stale_runtime_revision" }));
    expect(campaignPlayVersionExpectationSchema.safeParse({
      expectedWorldVersion: 0,
      expectedRuntimeRevision: 1.5,
    }).success).toBe(false);
  });
});

describe("Campaign Play Judge and Rulebook contracts", () => {
  it("requires every actionable wait to advance world time", () => {
    const ruling = {
      disposition: "deterministic" as const,
      normalizedIntent: intentFixture("wait"),
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" as const },
      requiredObligationEffect: { kind: "none" as const },
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "success" as const, maximum: "success" as const },
      elapsedBounds: { minimumMinutes: 10, maximumMinutes: 10 },
      uncertainty: { kind: "none" as const },
      reason: "The player remains in place while world time advances.",
      clarificationQuestion: null,
    };
    expect(campaignPlayJudgeRulingSchema.safeParse(ruling).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...ruling,
      elapsedBounds: { minimumMinutes: 0, maximumMinutes: 0 },
    }).success).toBe(false);
  });

  it("requires reachable and well-shaped possession effects in Judge rulings", () => {
    const ruling = {
      disposition: "uncertain" as const,
      normalizedIntent: intentFixture(),
      movementRouteHandle: null,
      possessionEffectAuthority: {
        kind: "adjust_actor_possession" as const,
        enforcement: "required" as const,
        operation: "transform" as const,
        possessionHandle: "possession_notebook",
        quantity: 1,
        minimumResult: "limited" as const,
      },
      requiredObligationEffect: { kind: "none" as const },
      citedVisibleFactHandles: ["possession_notebook"],
      resultBounds: { minimum: "limited" as const, maximum: "success" as const },
      elapsedBounds: { minimumMinutes: 30, maximumMinutes: 120 },
      uncertainty: {
        kind: "check" as const,
        dieSides: 20 as const,
        difficulty: 9,
        modifierMinimum: -2,
        modifierMaximum: 2,
      },
      reason: "A retained condition list requires writing in the notebook.",
      clarificationQuestion: null,
    };
    expect(campaignPlayJudgeRulingSchema.safeParse(ruling).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...ruling,
      possessionEffectAuthority: {
        ...ruling.possessionEffectAuthority,
        enforcement: "permitted",
        operation: "acquire",
        possessionHandle: null,
      },
    }).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...ruling,
      possessionEffectAuthority: {
        ...ruling.possessionEffectAuthority,
        enforcement: "permitted",
        operation: "spend",
      },
    }).success).toBe(false);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...ruling,
      possessionEffectAuthority: {
        ...ruling.possessionEffectAuthority,
        possessionHandle: null,
      },
    }).success).toBe(false);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...ruling,
      possessionEffectAuthority: {
        ...ruling.possessionEffectAuthority,
        minimumResult: "strong_success",
      },
    }).success).toBe(false);
  });

  it("round-trips every judgment and uncertainty variant", () => {
    for (const disposition of CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES) {
      const ruling = {
        disposition,
        normalizedIntent: intentFixture(),
        movementRouteHandle: null,
        possessionEffectAuthority: { kind: "none" as const },
        requiredObligationEffect: { kind: "none" as const },
        citedVisibleFactHandles: ["fact_bridge"],
        resultBounds: disposition === "impossible" || disposition === "clarification_required"
          ? { minimum: "no_effect", maximum: "no_effect" }
          : { minimum: "limited", maximum: "success" },
        elapsedBounds: { minimumMinutes: 0, maximumMinutes: 30 },
        uncertainty: disposition === "uncertain"
          ? {
              kind: "check",
              dieSides: 20,
              difficulty: 12,
              modifierMinimum: -2,
              modifierMaximum: 3,
            }
          : { kind: "none" },
        reason: "The visible bridge conditions bound the action.",
        clarificationQuestion: disposition === "clarification_required"
          ? "Which side of the bridge do you watch?"
          : null,
      };
      expect(campaignPlayJudgeRulingSchema.parse(ruling)).toEqual(ruling);
    }
    const resolutions = [
      { kind: "deterministic", result: "success" },
      {
        kind: "rolled",
        dieSides: 20,
        roll: 12,
        modifier: 2,
        total: 14,
        seedHash: HASH_A,
        result: "success",
      },
    ];
    for (const resolution of resolutions) {
      expect(campaignPlayUncertaintyResolutionSchema.parse(resolution)).toEqual(
        resolution,
      );
    }
  });

  it("rejects unordered bounds and disposition drift", () => {
    expect(campaignPlayElapsedBoundsSchema.safeParse({
      minimumMinutes: 30,
      maximumMinutes: 10,
    }).success).toBe(false);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      disposition: "uncertain",
      normalizedIntent: intentFixture(),
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "limited", maximum: "success" },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 10 },
      uncertainty: { kind: "none" },
      reason: "A check is required.",
      clarificationQuestion: null,
    }).success).toBe(false);
  });

  it("rejects no-effect actionable rulings and uncertainty ranges without a neutral modifier", () => {
    const actionableRuling = {
      disposition: "deterministic" as const,
      normalizedIntent: intentFixture(),
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" as const },
      requiredObligationEffect: { kind: "none" as const },
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "limited" as const, maximum: "success" as const },
      elapsedBounds: { minimumMinutes: 0, maximumMinutes: 10 },
      uncertainty: { kind: "none" as const },
      reason: "The visible bridge conditions support a bounded attempt.",
      clarificationQuestion: null,
    };
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...actionableRuling,
      resultBounds: { minimum: "no_effect", maximum: "success" },
    }).success).toBe(false);

    const uncertainRuling = {
      ...actionableRuling,
      disposition: "uncertain" as const,
      uncertainty: {
        kind: "check" as const,
        dieSides: 20,
        difficulty: 12,
        modifierMinimum: -2,
        modifierMaximum: 2,
      },
    };
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...uncertainRuling,
      resultBounds: { minimum: "limited", maximum: "no_effect" },
    }).success).toBe(false);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...uncertainRuling,
      uncertainty: { ...uncertainRuling.uncertainty, modifierMinimum: 1, modifierMaximum: 2 },
    }).success).toBe(false);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...uncertainRuling,
      uncertainty: { ...uncertainRuling.uncertainty, modifierMinimum: -2, modifierMaximum: -1 },
    }).success).toBe(false);
  });

  it("binds pure and compound movement to an explicit route handle", () => {
    const baseRuling = {
      disposition: "deterministic" as const,
      normalizedIntent: intentFixture(),
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" as const },
      requiredObligationEffect: { kind: "none" as const },
      citedVisibleFactHandles: [],
      resultBounds: { minimum: "success" as const, maximum: "success" as const },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 5 },
      uncertainty: { kind: "none" as const },
      reason: "The visible route supports the action.",
      clarificationQuestion: null,
    };
    const routeTarget = { handle: "route_bridge", kind: "route" as const };
    const moveIntent = {
      ...intentFixture(),
      kind: "move" as const,
      targets: [routeTarget],
    };

    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...baseRuling,
      normalizedIntent: moveIntent,
    }).success).toBe(false);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...baseRuling,
      disposition: "clarification_required",
      normalizedIntent: { ...moveIntent, targets: [] },
      resultBounds: { minimum: "no_effect", maximum: "no_effect" },
      elapsedBounds: { minimumMinutes: 0, maximumMinutes: 0 },
      clarificationQuestion: "Which open route do you take?",
    }).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...baseRuling,
      normalizedIntent: moveIntent,
      movementRouteHandle: routeTarget.handle,
    }).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...baseRuling,
      normalizedIntent: {
        ...intentFixture(),
        kind: "contact",
        targets: [routeTarget, { handle: "actor_guard", kind: "actor" }],
      },
      movementRouteHandle: routeTarget.handle,
    }).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...baseRuling,
      movementRouteHandle: routeTarget.handle,
    }).success).toBe(true);
  });

  it("binds the persisted Judge artifact to its public result and code-owned primary plan", () => {
    const artifact = {
      ruling: {
        disposition: "deterministic" as const,
        normalizedIntent: intentFixture(),
        movementRouteHandle: null,
        possessionEffectAuthority: { kind: "none" as const },
        requiredObligationEffect: { kind: "none" as const },
        citedVisibleFactHandles: [],
        resultBounds: { minimum: "limited" as const, maximum: "success" as const },
        elapsedBounds: { minimumMinutes: 0, maximumMinutes: 10 },
        uncertainty: { kind: "none" as const },
        reason: "The action is directly possible.",
        clarificationQuestion: null,
      },
      resolution: { kind: "deterministic" as const, result: "success" as const },
      uncertaintyAuthority: null,
      publicResult: {
        intentKind: "observe" as const,
        disposition: "deterministic" as const,
        result: "success" as const,
        clarificationQuestion: null,
      },
      primaryPlan: { kind: "game_master_required" as const },
    };
    expect(campaignPlayJudgeArtifactSchema.parse(artifact)).toEqual(artifact);
    expect(campaignPlayJudgeArtifactSchema.safeParse({
      ...artifact,
      publicResult: { ...artifact.publicResult, disposition: "impossible" },
    }).success).toBe(false);
    expect(campaignPlayJudgeArtifactSchema.safeParse({
      ...artifact,
      primaryPlan: { kind: "no_effect", reason: "impossible", commands: [] },
    }).success).toBe(false);
  });

  it("round-trips every protected vocabulary and reference branch", () => {
    for (const tier of CAMPAIGN_PLAY_RESULT_TIER_VALUES) {
      expect(campaignPlayResultTierSchema.parse(tier)).toBe(tier);
    }
    for (const condition of CAMPAIGN_PLAY_ACTOR_CONDITION_VALUES) {
      expect(campaignPlayActorConditionSchema.parse(condition)).toBe(condition);
    }
    for (const status of CAMPAIGN_PLAY_GOAL_STATUS_VALUES) {
      expect(campaignPlayGoalStatusSchema.parse(status)).toBe(status);
    }
    for (const status of CAMPAIGN_PLAY_PRESSURE_STATUS_VALUES) {
      expect(campaignPlayPressureStatusSchema.parse(status)).toBe(status);
    }
    for (const kind of CAMPAIGN_PLAY_ENTITY_REF_KIND_VALUES) {
      expect(campaignPlayEntityRefSchema.safeParse({
        kind,
        id: `${kind}_1`,
      }).success).toBe(true);
    }
    const causalParents = [
      {
        kind: "accepted_world",
        campaignId: "campaign_1",
        acceptedWorldVersion: 11,
        acceptedContentHash: HASH_A,
      },
      { kind: "turn", turnId: "turn_1" },
      { kind: "command", commandId: "command_1" },
      { kind: "world_event", eventId: "event_1" },
      { kind: "actor_job", jobId: "job_1" },
    ];
    expect(causalParents.map((parent) => parent.kind)).toEqual(
      CAMPAIGN_PLAY_CAUSAL_PARENT_KIND_VALUES,
    );
    for (const parent of causalParents) {
      expect(campaignPlayCausalParentSchema.parse(parent)).toEqual(parent);
    }
    expect(CAMPAIGN_PLAY_COMMAND_SOURCE_KIND_VALUES).toEqual(["actor", "system"]);
    expect(campaignPlayCommandSourceSchema.safeParse({
      kind: "actor",
      actorId: "actor_guard",
    }).success).toBe(true);
    for (const system of CAMPAIGN_PLAY_SYSTEM_SOURCE_VALUES) {
      expect(campaignPlayCommandSourceSchema.safeParse({
        kind: "system",
        system,
      }).success).toBe(true);
    }
    expect(campaignPlayExposurePolicySchema.safeParse({
      mode: "projectable",
      predicates: [{
        channel: "direct_perception",
        locationId: "location_bridge",
      }],
    }).success).toBe(true);
  });

  it("round-trips all twelve commands and keeps bootstrap out of GM plans", () => {
    const fixtures = commandFixtures();
    expect(fixtures.map((command) => command.kind).sort()).toEqual([
      ...CAMPAIGN_PLAY_COMMAND_KIND_VALUES,
      ...CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES,
    ].sort());
    for (const command of fixtures) {
      const schema = CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES.includes(
        command.kind as (typeof CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES)[number],
      )
        ? campaignPlayBootstrapCommandSchema
        : campaignPlayCommandSchema;
      expect(schema.parse(command)).toEqual(command);
    }
    expect(campaignPlayGameMasterPlanSchema.safeParse({
      commands: [fixtures.find((command) => command.kind === "create_player_actor")],
    }).success).toBe(false);
    expect(campaignPlayGameMasterPlanSchema.safeParse({
      commands: [fixtures.find((command) => command.kind === "move_actor")],
    }).success).toBe(true);
    const recorded = fixtures.find((command) => command.kind === "record_world_event")!;
    expect(campaignPlayCommandSchema.safeParse({
      ...recorded,
      eventClass: "dialogue",
      performingActorId: "actor_guard",
    }).success).toBe(false);
  });

  it("validates contiguous batch order and mechanical versions", () => {
    const fixtures = commandFixtures();
    const record = {
      ...fixtures.find((command) => command.kind === "record_world_event")!,
      order: 0,
      expectedWorldVersion: 11,
      commandId: "command_record",
    };
    const advance = {
      ...fixtures.find((command) => command.kind === "advance_world_time")!,
      order: 1,
      expectedWorldVersion: 11,
      commandId: "command_advance",
    };
    const move = {
      ...fixtures.find((command) => command.kind === "move_actor")!,
      order: 2,
      expectedWorldVersion: 12,
      commandId: "command_move",
    };
    const batch = { batchId: "batch_1", baseWorldVersion: 11, commands: [record, advance, move] };
    expect(rulebookCommandBatchSchema.parse(batch)).toEqual(batch);
    expect(rulebookCommandBatchSchema.safeParse({
      ...batch,
      commands: [record, { ...advance, expectedWorldVersion: 12 }, move],
    }).success).toBe(false);
    expect(rulebookCommandBatchSchema.safeParse({
      ...batch,
      commands: [record, { ...advance, order: 3 }, move],
    }).success).toBe(false);
  });

  it("accepts protected collection caps and rejects cap plus one", () => {
    const advance = commandFixtures().find((command) =>
      command.kind === "advance_world_time"
    )!;
    const commands = Array.from(
      { length: CAMPAIGN_PLAY_LIMITS.commandsPerBatch },
      (_, index) => ({
        ...advance,
        commandId: `command_${index}`,
        order: index,
        expectedWorldVersion: 11 + index,
      }),
    );
    expect(campaignPlayGameMasterPlanSchema.safeParse({ commands }).success).toBe(true);
    const internalCommands = Array.from(
      { length: CAMPAIGN_PLAY_LIMITS.characterList + 1 },
      (_, index) => ({
        ...advance,
        commandId: `internal_command_${index}`,
        order: index,
        expectedWorldVersion: 11 + index,
      }),
    );
    expect(rulebookCommandBatchSchema.safeParse({
      batchId: "batch_1",
      baseWorldVersion: 11,
      commands: internalCommands,
    }).success).toBe(true);
    expect(rulebookCommandBatchSchema.safeParse({
      batchId: "batch_1",
      baseWorldVersion: 11,
      commands: [
        ...internalCommands,
        {
          ...advance,
          commandId: "internal_command_extra",
          order: CAMPAIGN_PLAY_LIMITS.characterList + 1,
          expectedWorldVersion: 11 + CAMPAIGN_PLAY_LIMITS.characterList + 1,
        },
      ],
    }).success).toBe(false);
    expect(campaignPlayGameMasterPlanSchema.safeParse({
      commands: [...commands, { ...commands[0], commandId: "command_extra" }],
    }).success).toBe(false);

    const scopes = Array.from(
      { length: CAMPAIGN_PLAY_LIMITS.scopes },
      (_, index) => ({ kind: "actor" as const, id: `actor_${index}` }),
    );
    expect(campaignPlayCommandSchema.safeParse({
      ...advance,
      readScope: scopes,
      writeScope: scopes,
    }).success).toBe(true);
    expect(campaignPlayCommandSchema.safeParse({
      ...advance,
      readScope: [...scopes, { kind: "actor", id: "actor_extra" }],
    }).success).toBe(false);

    const ruling = {
      disposition: "deterministic",
      normalizedIntent: intentFixture(),
      movementRouteHandle: null,
      possessionEffectAuthority: { kind: "none" as const },
      requiredObligationEffect: { kind: "none" as const },
      citedVisibleFactHandles: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.citedFacts },
        (_, index) => `fact_${index}`,
      ),
      resultBounds: { minimum: "limited", maximum: "success" },
      elapsedBounds: { minimumMinutes: 1, maximumMinutes: 10 },
      uncertainty: { kind: "none" },
      reason: "The visible bridge facts determine the outcome.",
      clarificationQuestion: null,
    };
    expect(campaignPlayJudgeRulingSchema.safeParse(ruling).success).toBe(true);
    expect(campaignPlayJudgeRulingSchema.safeParse({
      ...ruling,
      citedVisibleFactHandles: [...ruling.citedVisibleFactHandles, "fact_extra"],
    }).success).toBe(false);

    const predicates = Array.from(
      { length: CAMPAIGN_PLAY_LIMITS.exposuresPerEvent },
      (_, index) => ({
        channel: "direct_perception" as const,
        locationId: `location_${index}`,
      }),
    );
    expect(campaignPlayCommandSchema.safeParse({
      ...advance,
      exposure: { mode: "projectable", predicates },
    }).success).toBe(true);
    expect(campaignPlayCommandSchema.safeParse({
      ...advance,
      exposure: {
        mode: "projectable",
        predicates: [...predicates, {
          channel: "direct_perception",
          locationId: "location_extra",
        }],
      },
    }).success).toBe(false);

    const receipt = {
      receiptId: "receipt_1",
      campaignId: "campaign_1",
      turnId: "turn_1",
      commandId: "command_1",
      commandKind: "move_actor",
      outcome: "applied",
      appliedWorldMutation: true,
      priorWorldVersion: 11,
      resultWorldVersion: 12,
      priorWorldHash: HASH_A,
      resultWorldHash: HASH_B,
      causalEventIds: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.eventsPerReceipt },
        (_, index) => `event_${index}`,
      ),
      createdAt: 1_000,
    };
    expect(campaignPlayReceiptSchema.safeParse(receipt).success).toBe(true);
    expect(campaignPlayReceiptSchema.safeParse({
      ...receipt,
      causalEventIds: [...receipt.causalEventIds, "event_extra"],
    }).success).toBe(false);
  });

  it("rejects nested protected contract drift", () => {
    const command = commandFixtures()[0]!;
    expect(campaignPlayCommandSchema.safeParse({
      ...command,
      causalParent: { ...command.causalParent, unexpected: true },
    }).success).toBe(false);
    expect(campaignPlayEntityRefSchema.safeParse({
      kind: "faction",
      id: "faction_1",
    }).success).toBe(false);
  });
});

describe("Campaign Play events, actors, visibility, and recovery contracts", () => {
  it("round-trips all exposure channels and world-event kinds", () => {
    const exposures = [
      { channel: "direct_perception", locationId: "location_bridge" },
      {
        channel: "local_aftermath",
        locationId: "location_bridge",
        validUntilWorldTimeMinutes: 600,
      },
      {
        channel: "route_state",
        routeId: "route_market",
        triggers: ["inspect", "attempt", "traverse"],
      },
      { channel: "witness_report", witnessActorId: "actor_guard" },
    ];
    expect(exposures.map((exposure) => exposure.channel)).toEqual(
      CAMPAIGN_PLAY_EXPOSURE_CHANNEL_VALUES,
    );
    for (const exposure of exposures) {
      expect(campaignPlayExposurePredicateSchema.parse(exposure)).toEqual(exposure);
    }
    const events = worldEventFixtures();
    expect(events.map((event) => event.kind)).toEqual(
      CAMPAIGN_PLAY_WORLD_EVENT_KIND_VALUES,
    );
    for (const event of events) {
      expect(campaignPlayWorldEventSchema.parse(event)).toEqual(event);
    }
    const recorded = events.find((event) => event.kind === "scene_recorded")!;
    expect(campaignPlayWorldEventSchema.safeParse({
      ...recorded,
      eventClass: "dialogue",
      performingActorId: "actor_guard",
    }).success).toBe(false);
  });

  it("enforces receipt version and hash semantics", () => {
    const mutating = {
      receiptId: "receipt_1",
      campaignId: "campaign_1",
      turnId: "turn_1",
      commandId: "command_1",
      commandKind: "move_actor",
      outcome: "applied",
      appliedWorldMutation: true,
      priorWorldVersion: 11,
      resultWorldVersion: 12,
      priorWorldHash: HASH_A,
      resultWorldHash: HASH_B,
      causalEventIds: ["event_1"],
      createdAt: 1_000,
    };
    const nonmutating = {
      ...mutating,
      commandKind: "record_world_event",
      appliedWorldMutation: false,
      resultWorldVersion: 11,
      resultWorldHash: HASH_A,
    };
    expect(campaignPlayReceiptSchema.parse(mutating)).toEqual(mutating);
    expect(campaignPlayReceiptSchema.parse(nonmutating)).toEqual(nonmutating);
    expect(campaignPlayReceiptSchema.safeParse({
      ...mutating,
      resultWorldVersion: 13,
    }).success).toBe(false);
    expect(campaignPlayReceiptSchema.safeParse({
      ...mutating,
      appliedWorldMutation: false,
      resultWorldVersion: 11,
      resultWorldHash: HASH_A,
    }).success).toBe(false);
    expect(campaignPlayReceiptSchema.safeParse({
      ...nonmutating,
      appliedWorldMutation: true,
      resultWorldVersion: 12,
      resultWorldHash: HASH_B,
    }).success).toBe(false);
  });

  it("round-trips every plan precondition, job stage, and proposal result", () => {
    const preconditions = [
      { kind: "actor_at_location", actorId: "actor_guard", locationId: "location_bridge" },
      { kind: "route_state", routeId: "route_market", state: "open" },
      { kind: "goal_status", goalId: "goal_guard", status: "active" },
      { kind: "pressure_status", pressureId: "pressure_flood", status: "active" },
      {
        kind: "actor_condition",
        actorId: "actor_guard",
        condition: "strained",
        present: false,
      },
    ];
    for (const precondition of preconditions) {
      expect(campaignPlayPlanPreconditionSchema.parse(precondition)).toEqual(
        precondition,
      );
    }
    const plan = actorPlanFixture();
    expect(campaignPlayActorPlanSchema.parse(plan)).toEqual(plan);
    for (const kind of WORLD_INTENT_KIND_VALUES) {
      const targets = kind === "wait" ? [] : plan.intent.targets;
      expect(campaignPlayActorPlanSchema.safeParse({
        ...plan,
        intent: { ...plan.intent, kind, targets },
        steps: [{
          ...plan.steps[0],
          intent: { ...plan.steps[0]?.intent, kind, targets },
        }],
      }).success).toBe(true);
    }
    expect(campaignPlayActorScheduleSchema.safeParse({
      scheduleId: "schedule_guard",
      campaignId: "campaign_1",
      actorId: "actor_guard",
      planId: plan.planId,
      nextActAtWorldTimeMinutes: 520,
      lastActAtWorldTimeMinutes: null,
      priority: 4,
      agencyDebt: 0,
    }).success).toBe(true);

    const dueDecision = {
      dueOrder: 0,
      actorId: "actor_guard",
      scheduleId: "schedule_guard",
      planId: plan.planId,
      nextActAtWorldTimeMinutes: 520,
      priority: 4,
      agencyDebt: 0,
      cadenceMinutes: 30,
      disposition: "skip" as const,
      reason: "actor_ineligible" as const,
    };
    const dueSet = {
      campaignId: "campaign_1",
      turnId: "turn_1",
      settledWorldTimeMinutes: 520,
      baseWorldVersion: 11,
      baseRuntimeRevision: 29,
      decisions: [dueDecision],
    };
    expect(campaignPlayActorDueSetSchema.parse(dueSet)).toEqual(dueSet);
    expect(campaignPlayActorDueSetSchema.safeParse({
      ...dueSet,
      decisions: [dueDecision, { ...dueDecision, dueOrder: 1 }],
    }).success).toBe(false);
    expect(campaignPlayActorDueSetSchema.safeParse({
      ...dueSet,
      decisions: [{ ...dueDecision, dueOrder: 2 }],
    }).success).toBe(false);

    for (const stage of CAMPAIGN_PLAY_ACTOR_JOB_STAGE_VALUES) {
      const terminal = ["settled", "rejected", "deferred"].includes(stage);
      const proposalRequired = stage === "proposed" || stage === "settled";
      const active = ["claimed", "interrupted", "proposed"].includes(stage);
      expect(campaignPlayActorJobSchema.safeParse({
        jobId: `job_${stage}`,
        campaignId: "campaign_1",
        turnId: "turn_1",
        actorId: "actor_guard",
        admittedPlanId: "plan_guard",
        planId: "plan_guard",
        dueReason: "scheduled",
        frozenBaseWorldVersion: 11,
        workerEpoch: stage === "queued" ? 0 : 1,
        claimTurnWorkerEpoch: active ? 1 : null,
        stage,
        proposalId: proposalRequired ? "proposal_guard" : null,
        deferReason: stage === "deferred" ? "incapacitated" : null,
        createdAt: 1_000,
        completedAt: terminal ? 1_010 : null,
      }).success).toBe(true);
    }

    const proposalBase = {
      proposalId: "proposal_guard",
      batchId: "batch_1",
      jobId: "job_guard",
      actorId: "actor_guard",
      causalParent: { kind: "actor_job" as const, jobId: "job_guard" },
      baseWorldVersion: 11,
      readScope: [{ kind: "route", id: "route_market" }],
      writeScope: [{ kind: "actor", id: "actor_guard" }],
      expiresAtWorldTimeMinutes: 600,
      commands: [{
        ...commandFixtures()[0],
        source: { kind: "actor" as const, actorId: "actor_guard" },
        causalParent: { kind: "actor_job" as const, jobId: "job_guard" },
        readScope: [{ kind: "route" as const, id: "route_market" }],
        writeScope: [{ kind: "actor" as const, id: "actor_guard" }],
      }],
    };
    for (const result of [
      { status: "pending" },
      { status: "accepted", receiptIds: ["receipt_1"] },
      { status: "rejected", reason: "precondition_failed" },
    ]) {
      expect(campaignPlayActorProposalSchema.safeParse({
        ...proposalBase,
        result,
      }).success).toBe(true);
    }

    const secondCommand = {
      ...proposalBase.commands[0],
      commandId: "command_1",
      order: 1,
      expectedWorldVersion: 12,
    };
    expect(campaignPlayActorProposalSchema.safeParse({
      ...proposalBase,
      commands: [...proposalBase.commands, secondCommand],
      result: { status: "accepted", receiptIds: ["receipt_1"] },
    }).success).toBe(false);
    for (const invalid of [
      { causalParent: { kind: "actor_job", jobId: "job_other" } },
      { commands: [{ ...proposalBase.commands[0], batchId: "batch_other" }] },
      { commands: [{ ...proposalBase.commands[0], order: 1 }] },
      { commands: [{ ...proposalBase.commands[0], expectedWorldVersion: 12 }] },
      { commands: [{
        ...proposalBase.commands[0],
        source: { kind: "actor", actorId: "actor_other" },
      }] },
      { commands: [{
        ...proposalBase.commands[0],
        causalParent: { kind: "actor_job", jobId: "job_other" },
      }] },
      { commands: [{
        ...proposalBase.commands[0],
        readScope: [
          proposalBase.commands[0]!.readScope[0],
          proposalBase.commands[0]!.readScope[0],
        ],
      }] },
      { commands: [{
        ...proposalBase.commands[0],
        readScope: [{ kind: "location", id: "location_hidden" }],
      }] },
      { readScope: [
        ...proposalBase.readScope,
        { kind: "location", id: "location_unused" },
      ] },
      { result: { status: "accepted", receiptIds: [] } },
      { result: { status: "accepted", receiptIds: ["receipt_1", "receipt_1"] } },
    ]) {
      expect(campaignPlayActorProposalSchema.safeParse({
        ...proposalBase,
        ...invalid,
      }).success).toBe(false);
    }
  });

  it("round-trips observation, runtime events, interruption, narration, and model stages", () => {
    const epistemicFixtures = [
      {
        exposure: {
          exposureId: "exposure_direct",
          campaignId: "campaign_1",
          eventId: "event_1",
          channel: "direct_perception" as const,
          locationId: "location_bridge",
          createdAt: 1_000,
        },
        source: {
          channel: "direct_perception" as const,
          locationId: "location_bridge",
          perceivedActorId: "actor_guard",
        },
      },
      {
        exposure: {
          exposureId: "exposure_aftermath",
          campaignId: "campaign_1",
          eventId: "event_1",
          channel: "local_aftermath" as const,
          locationId: "location_bridge",
          validUntilWorldTimeMinutes: 520,
          createdAt: 1_000,
        },
        source: {
          channel: "local_aftermath" as const,
          locationId: "location_bridge",
        },
      },
      {
        exposure: {
          exposureId: "exposure_route",
          campaignId: "campaign_1",
          eventId: "event_1",
          channel: "route_state" as const,
          routeId: "route_market",
          triggers: ["inspect" as const, "traverse" as const],
          createdAt: 1_000,
        },
        source: {
          channel: "route_state" as const,
          routeId: "route_market",
          trigger: "inspect" as const,
        },
      },
      {
        exposure: {
          exposureId: "exposure_witness",
          campaignId: "campaign_1",
          eventId: "event_1",
          channel: "witness_report" as const,
          witnessActorId: "actor_guard",
          createdAt: 1_000,
        },
        source: {
          channel: "witness_report" as const,
          witnessActorId: "actor_guard",
        },
      },
    ];
    for (const [index, fixture] of epistemicFixtures.entries()) {
      const knowledge = {
        knowledgeId: `knowledge_${index}`,
        campaignId: "campaign_1",
        actorId: "actor_player",
        eventId: "event_1",
        exposureId: fixture.exposure.exposureId,
        source: fixture.source,
        learnedAtWorldTimeMinutes: 490,
        createdAt: 1_000,
      };
      const observation = {
        observationId: `observation_${index}`,
        campaignId: "campaign_1",
        humanActorId: "actor_player",
        eventId: "event_1",
        exposureId: fixture.exposure.exposureId,
        source: fixture.source,
        publicEntry: journalEntryFixture(),
        worldTimeMinutes: 490,
        createdAt: 1_000,
      };
      expect(campaignPlayEventExposureSchema.safeParse(fixture.exposure).success)
        .toBe(true);
      expect(campaignPlayActorKnowledgeSchema.safeParse(knowledge).success)
        .toBe(true);
      expect(campaignPlayObservationSchema.safeParse(observation).success)
        .toBe(true);
      expect(() => validateCampaignPlayActorKnowledgeAgainstExposure(
        knowledge,
        fixture.exposure,
      )).not.toThrow();
      expect(() => validateCampaignPlayObservationAgainstExposure(
        observation,
        fixture.exposure,
      )).not.toThrow();
    }
    const direct = epistemicFixtures[0]!;
    const mismatchedObservation = {
      observationId: "observation_mismatch",
      campaignId: "campaign_1",
      humanActorId: "actor_player",
      eventId: "event_1",
      exposureId: direct.exposure.exposureId,
      source: {
        channel: "direct_perception" as const,
        locationId: "location_other",
        perceivedActorId: null,
      },
      publicEntry: journalEntryFixture(),
      worldTimeMinutes: 490,
      createdAt: 1_000,
    };
    expect(() => validateCampaignPlayObservationAgainstExposure(
      mismatchedObservation,
      direct.exposure,
    )).toThrow(expect.objectContaining({ code: "epistemic_provenance_invalid" }));
    expect(() => validateCampaignPlayActorKnowledgeAgainstExposure({
      knowledgeId: "knowledge_mismatch",
      campaignId: "campaign_1",
      actorId: "actor_player",
      eventId: "event_other",
      exposureId: direct.exposure.exposureId,
      source: direct.source,
      learnedAtWorldTimeMinutes: 490,
      createdAt: 1_000,
    }, direct.exposure)).toThrow(expect.objectContaining({
      code: "epistemic_provenance_invalid",
    }));
    for (const kind of CAMPAIGN_PLAY_RUNTIME_EVENT_KIND_VALUES) {
      const campaignOwned = kind === "play_state_created" || kind === "character_created";
      const fenced = !campaignOwned && kind !== "turn_admitted";
      expect(campaignPlayRuntimeEventSchema.safeParse({
        kind,
        eventId: `runtime_${kind}`,
        campaignId: "campaign_1",
        sequence: 1,
        turnId: campaignOwned ? null : "turn_1",
        workerEpoch: fenced ? 1 : null,
        worldVersion: 11,
        priorRuntimeRevision: 28,
        resultRuntimeRevision: 29,
        priorRuntimeHash: HASH_A,
        resultRuntimeHash: HASH_B,
        protectedPayloadHash: HASH_A,
        createdAt: 1_000,
      }).success).toBe(true);
    }
    const runtimeBase = {
      eventId: "runtime_invalid",
      campaignId: "campaign_1",
      sequence: 1,
      worldVersion: 11,
      priorRuntimeRevision: 28,
      resultRuntimeRevision: 29,
      priorRuntimeHash: HASH_A,
      resultRuntimeHash: HASH_B,
      protectedPayloadHash: HASH_A,
      createdAt: 1_000,
    };
    expect(campaignPlayRuntimeEventSchema.safeParse({
      ...runtimeBase,
      kind: "play_state_created",
      turnId: "turn_1",
      workerEpoch: null,
    }).success).toBe(false);
    expect(campaignPlayRuntimeEventSchema.safeParse({
      ...runtimeBase,
      kind: "worker_claimed",
      turnId: "turn_1",
      workerEpoch: null,
    }).success).toBe(false);
    expect(campaignPlayRuntimeEventSchema.safeParse({
      ...runtimeBase,
      kind: "worker_lease_renewed",
      turnId: "turn_1",
      workerEpoch: null,
    }).success).toBe(false);
    expect(campaignPlayRuntimeEventSchema.safeParse({
      ...runtimeBase,
      kind: "worker_lease_renewed",
      turnId: null,
      workerEpoch: 1,
    }).success).toBe(false);
    for (const errorCode of CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES) {
      expect(campaignPlayInterruptionSchema.safeParse({
        interruptedStage: "judged",
        workerEpoch: 2,
        errorCode,
        resumeEligible: true,
      }).success).toBe(true);
    }
    expect(campaignPlayInterruptionSchema.safeParse({
      interruptedStage: "judged",
      workerEpoch: 2,
      errorCode: "provider_unavailable",
      resumeEligible: false,
    }).success).toBe(false);
    for (const artifact of [
      {
        status: "pending",
        narrationId: "narration_1",
        turnId: "turn_1",
        packetHash: HASH_A,
        narration: null,
        errorCode: null,
      },
      {
        status: "complete",
        narrationId: "narration_1",
        turnId: "turn_1",
        packetHash: HASH_A,
        narration: narrationFixture(),
        errorCode: null,
      },
      {
        status: "invalid",
        narrationId: "narration_1",
        turnId: "turn_1",
        packetHash: HASH_A,
        narration: null,
        errorCode: "narration_invalid",
      },
    ]) {
      expect(campaignPlayNarrationArtifactSchema.parse(artifact)).toEqual(artifact);
    }
    for (const kind of CAMPAIGN_PLAY_MODEL_STAGE_KIND_VALUES) {
      for (const status of CAMPAIGN_PLAY_MODEL_STAGE_STATUS_VALUES) {
        const accepted = status === "accepted";
        const started = status === "started";
        const interrupted = status === "interrupted";
        expect(campaignPlayModelStageSchema.safeParse({
          stageId: `stage_${kind}_${status}`,
          campaignId: "campaign_1",
          turnId: "turn_1",
          kind,
          attempt: 1,
          status,
          workerEpoch: 1,
          requestedProviderId: "provider_1",
          requestedModel: "model-one",
          requestedStrategy: "strict_object",
          actualProviderId: started ? null : "provider_1",
          actualModel: started ? null : "model-one",
          actualStrategy: started ? null : "strict_object",
          inputTokens: accepted ? 100 : null,
          outputTokens: accepted ? 50 : null,
          durationMs: started ? null : 250,
          finishReason: accepted ? "stop" : null,
          schemaOutcome: started
            ? "pending"
            : accepted
              ? "valid"
              : interrupted
                ? "transport_error"
                : "invalid",
          artifactJson: accepted ? '{"result":"accepted"}' : null,
          artifactHash: accepted ? HASH_A : null,
          errorCode: started || accepted
            ? null
            : interrupted
              ? "provider_unavailable"
              : "model_contract_invalid",
        }).success).toBe(true);
      }
    }
    expect(campaignPlayModelStageSchema.safeParse({
      stageId: "stage_invalid_accepted",
      campaignId: "campaign_1",
      turnId: "turn_1",
      kind: "judge",
      attempt: 1,
      status: "accepted",
      workerEpoch: 1,
      requestedProviderId: "provider_1",
      requestedModel: "model-one",
      requestedStrategy: "strict_object",
      actualProviderId: "provider_1",
      actualModel: "model-one",
      actualStrategy: "strict_object",
      inputTokens: null,
      outputTokens: null,
      durationMs: null,
      finishReason: null,
      schemaOutcome: "pending",
      artifactJson: null,
      artifactHash: null,
      errorCode: null,
    }).success).toBe(false);
    expect(campaignPlayModelStageSchema.safeParse({
      stageId: "stage_invalid_artifact_json",
      campaignId: "campaign_1",
      turnId: "turn_1",
      kind: "judge",
      attempt: 1,
      status: "accepted",
      workerEpoch: 1,
      requestedProviderId: "provider_1",
      requestedModel: "model-one",
      requestedStrategy: "strict_object",
      actualProviderId: "provider_1",
      actualModel: "model-one",
      actualStrategy: "strict_object",
      inputTokens: 1,
      outputTokens: 1,
      durationMs: 1,
      finishReason: "stop",
      schemaOutcome: "valid",
      artifactJson: "not-json",
      artifactHash: HASH_A,
      errorCode: null,
    }).success).toBe(false);
  });

  it("rejects invalid actor collections and protected nested drift", () => {
    const plan = actorPlanFixture();
    const acquiringStep = {
      ...plan.steps[0],
      intent: { ...plan.steps[0]!.intent, kind: "attempt" as const },
      possessionOutcome: { kind: "acquire" as const, name: "Copper chits", quantity: 2 },
    };
    expect(campaignPlayActorPlanSchema.safeParse({
      ...plan,
      steps: [acquiringStep],
    }).success).toBe(true);
    expect(campaignPlayActorPlanSchema.safeParse({
      ...plan,
      steps: [{ ...acquiringStep, possessionOutcome: { kind: "acquire", name: "Copper chits", quantity: 0 } }],
    }).success).toBe(false);
    expect(campaignPlayActorPlanSchema.safeParse({
      ...plan,
      steps: [{ ...plan.steps[0], possessionOutcome: { kind: "acquire", name: "Copper chits", quantity: 2 } }],
    }).success).toBe(false);
    expect(campaignPlayActorPlanSchema.safeParse({
      ...plan,
      steps: [{ ...plan.steps[0], possessionOutcome: { kind: "unknown" } }],
    }).success).toBe(false);
    expect(campaignPlayActorPlanSchema.safeParse({
      ...plan,
      preconditions: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.preconditionsPerPlan + 1 },
        () => plan.preconditions[0],
      ),
    }).success).toBe(false);
    expect(campaignPlayActorPlanSchema.safeParse({
      ...plan,
      steps: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.planSteps + 1 },
        (_, index) => ({ ...plan.steps[0], stepId: `step_${index}`, order: index }),
      ),
    }).success).toBe(false);
    expect(campaignPlayActorProposalSchema.safeParse({
      proposalId: "proposal_many",
      batchId: "batch_1",
      jobId: "job_many",
      actorId: "actor_guard",
      causalParent: { kind: "actor_job", jobId: "job_many" },
      baseWorldVersion: 11,
      readScope: [{ kind: "location", id: "location_bridge" }],
      writeScope: [{ kind: "actor", id: "actor_player" }],
      expiresAtWorldTimeMinutes: 600,
      commands: Array.from(
        { length: CAMPAIGN_PLAY_LIMITS.planSteps + 1 },
        (_, index) => ({
          ...commandFixtures()[0],
          commandId: `proposal_command_${index}`,
          order: index,
          expectedWorldVersion: 11 + index,
          source: { kind: "actor", actorId: "actor_guard" },
          causalParent: { kind: "actor_job", jobId: "job_many" },
        }),
      ),
      result: { status: "pending" },
    }).success).toBe(false);
    const event = worldEventFixtures()[0]!;
    expect(campaignPlayWorldEventSchema.safeParse({
      ...event,
      source: { ...event.source, unexpected: true },
    }).success).toBe(false);
    expect(campaignPlayWorldEventSchema.safeParse({
      ...event,
      exposures: [{ ...event.exposures[0], eventId: "event_other" }],
    }).success).toBe(false);
    expect(campaignPlayWorldEventSchema.safeParse({
      ...event,
      exposures: [event.exposures[0], event.exposures[0]],
    }).success).toBe(false);
    expect(campaignPlayExposurePredicateSchema.safeParse({
      channel: "omniscient",
      eventId: "event_1",
    }).success).toBe(false);
  });

  it("keeps exhaustive metadata maps synchronized with every closed union", () => {
    expect(Object.keys(CAMPAIGN_PLAY_COMMAND_METADATA).sort()).toEqual([
      ...CAMPAIGN_PLAY_COMMAND_KIND_VALUES,
      ...CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES,
    ].sort());
    expect(Object.keys(CAMPAIGN_PLAY_TURN_STAGE_METADATA)).toEqual(
      CAMPAIGN_TURN_STAGE_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_EXPOSURE_METADATA)).toEqual(
      CAMPAIGN_PLAY_EXPOSURE_CHANNEL_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_WORLD_EVENT_METADATA)).toEqual(
      CAMPAIGN_PLAY_WORLD_EVENT_KIND_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_RUNTIME_EVENT_METADATA)).toEqual(
      CAMPAIGN_PLAY_RUNTIME_EVENT_KIND_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_SSE_METADATA)).toEqual(
      CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_JUDGMENT_METADATA)).toEqual(
      CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_METADATA)).toEqual(
      CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_KIND_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_PLAN_PRECONDITION_METADATA)).toEqual(
      CAMPAIGN_PLAY_PLAN_PRECONDITION_KIND_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_CAUSAL_PARENT_METADATA)).toEqual(
      CAMPAIGN_PLAY_CAUSAL_PARENT_KIND_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_COMMAND_SOURCE_METADATA)).toEqual(
      CAMPAIGN_PLAY_COMMAND_SOURCE_KIND_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_EXPOSURE_POLICY_METADATA)).toEqual(
      CAMPAIGN_PLAY_EXPOSURE_POLICY_MODE_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_ACTOR_JOB_STAGE_METADATA)).toEqual(
      CAMPAIGN_PLAY_ACTOR_JOB_STAGE_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_PROPOSAL_STATUS_METADATA)).toEqual(
      CAMPAIGN_PLAY_PROPOSAL_STATUS_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_MODEL_STAGE_STATUS_METADATA)).toEqual(
      CAMPAIGN_PLAY_MODEL_STAGE_STATUS_VALUES,
    );
    expect(Object.keys(CAMPAIGN_PLAY_ERROR_METADATA)).toEqual(
      CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES,
    );
  });
});
