import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const modelSafeRef = z.string().trim().min(1).max(200);

function normalizedContractRef(value: string): string {
  return value.trim().toLowerCase();
}

export const gameplayRuntimeProviderSummarySchema = z.object({
  id: shortText,
  model: shortText.nullable(),
  baseUrl: shortText.nullable(),
});

export const gameplayRuntimeQuickActionSelectionSchema = z.object({
  handle: shortText,
  offerId: shortText,
  actionId: shortText,
  baseWorldVersion: z.number().int().nonnegative(),
});

export const gameplayRuntimeTurnInputSchema = z.object({
  version: z.literal("gameplay-runtime.turn-input.v1"),
  route: z.literal("/api/chat/action"),
  campaignId: shortText,
  turnId: shortText,
  playerAction: z.object({
    submitted: shortText,
    normalized: shortText,
    source: z.enum(["typed", "quick_action"]),
    quickActionSelection: gameplayRuntimeQuickActionSelectionSchema.optional(),
  }),
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative().nullable(),
    chatHistoryLengthBeforeTurn: z.number().int().nonnegative(),
    preTurnSnapshot: z.object({
      bundleDir: shortText,
      capturedAt: z.number().int().nonnegative(),
    }),
  }),
  providers: z.object({
    judge: gameplayRuntimeProviderSummarySchema,
    storyteller: gameplayRuntimeProviderSummarySchema,
    embedder: gameplayRuntimeProviderSummarySchema.optional(),
  }),
  idempotencyKey: shortText,
});

export const gameplayRuntimeCapabilityIdSchema = z.enum([
  "observe_visible",
  "oracle_roll",
  "route_options",
  "route_check",
  "movement",
  "dialogue_record",
  "world_fact_record",
  "support_actor_create",
  "entity_tag",
  "item_transfer",
  "condition_set",
  "time_advance",
  "quick_action_offer",
  "scene_beat_record",
  "location_reveal",
  "minor_poi_create",
]);

export const sceneFactSchema = z.object({
  factId: shortText,
  summary: shortText,
  source: shortText,
  tick: z.number().int().nonnegative().nullable(),
});

export const sceneActorViewSchema = z.object({
  ref: modelSafeRef,
  label: shortText,
  role: z.enum(["player", "active", "support", "background"]),
  visibleStatus: z.object({
    hp: z.number().int().nullable(),
    conditions: z.array(shortText).max(12),
  }),
});

export const movementOptionViewSchema = z.object({
  ref: modelSafeRef,
  label: shortText,
  connected: z.boolean(),
  travelCost: z.number().int().nonnegative().nullable(),
});

export const targetCandidateViewSchema = z.object({
  ref: modelSafeRef,
  label: shortText,
  kind: z.enum(["actor", "item", "location", "faction", "unknown"]),
});

export const inventoryItemViewSchema = z.object({
  ref: modelSafeRef,
  label: shortText,
  equipState: z.enum(["carried", "equipped"]),
  tags: z.array(shortText).max(12),
});

export const scopedForecastEnvelopeSchema = z.object({
  version: z.literal("scoped-forecast.v1"),
  advisoryOnly: z.literal(true),
  sourceStatus: z.enum(["loaded", "empty_missing", "empty_unavailable"]),
  mayAuthorizeMutation: z.literal(false),
  maySupportNarrationClaim: z.literal(false),
  entries: z.array(z.object({
    ref: modelSafeRef,
    horizonTicks: z.number().int().nonnegative(),
    pressure: shortText,
    confidence: z.number().min(0).max(1),
    localRelevanceRefs: z.array(modelSafeRef).max(16),
  })).max(12),
  forbiddenPrivateTerms: z.array(shortText).max(64),
});

export const authoritativeSceneFrameSchema = z.object({
  version: z.literal("scene-frame.v1"),
  frameId: shortText,
  campaignId: shortText,
  turnId: shortText,
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
  }),
  playerAction: shortText,
  player: z.object({
    ref: z.literal("Player"),
    label: shortText,
    visibleStatus: z.object({
      hp: z.number().int().nullable(),
      conditions: z.array(shortText).max(12),
    }),
  }),
  scene: z.object({
    currentLocation: z.object({
      ref: modelSafeRef,
      label: shortText,
      description: z.string().max(2000).nullable(),
    }),
    currentScene: z.object({
      ref: modelSafeRef,
      label: shortText,
      description: z.string().max(2000).nullable(),
    }),
    visibleFacts: z.array(sceneFactSchema).max(24),
    recentLocalFacts: z.array(sceneFactSchema).max(24),
  }),
  actors: z.array(sceneActorViewSchema).max(48),
  movementOptions: z.array(movementOptionViewSchema).max(32),
  targets: z.array(targetCandidateViewSchema).max(64),
  inventory: z.array(inventoryItemViewSchema).max(64),
  capabilities: z.array(z.object({
    capabilityId: gameplayRuntimeCapabilityIdSchema,
    evidenceAuthority: z.enum([
      "observation_only",
      "receipt_required",
      "terminal_receipt_required",
    ]),
    allowed: z.boolean(),
  })).max(32),
  citableRefs: z.array(modelSafeRef).max(256),
  privateGuards: z.object({
    forbiddenActorLabels: z.array(shortText).max(64),
    forbiddenPrivateTerms: z.array(shortText).max(64),
  }),
  forecast: scopedForecastEnvelopeSchema,
}).superRefine((frame, ctx) => {
  const citableRefs = new Set(frame.citableRefs.map(normalizedContractRef));
  const checkPrivateTerms = (
    terms: readonly string[],
    pathPrefix: Array<string | number>,
    label: string,
  ): void => {
    terms.forEach((term, index) => {
      if (!citableRefs.has(normalizedContractRef(term))) return;
      ctx.addIssue({
        code: "custom",
        path: [...pathPrefix, index],
        message: `${label} must not duplicate a public SceneFrame.citableRefs entry.`,
      });
    });
  };

  checkPrivateTerms(
    frame.privateGuards.forbiddenActorLabels,
    ["privateGuards", "forbiddenActorLabels"],
    "privateGuards.forbiddenActorLabels",
  );
  checkPrivateTerms(
    frame.privateGuards.forbiddenPrivateTerms,
    ["privateGuards", "forbiddenPrivateTerms"],
    "privateGuards.forbiddenPrivateTerms",
  );
  checkPrivateTerms(
    frame.forecast.forbiddenPrivateTerms,
    ["forecast", "forbiddenPrivateTerms"],
    "forecast.forbiddenPrivateTerms",
  );
});

export const gmReadPathSchema = z.enum([
  "direct",
  "continue",
  "clarification",
  "uncertain",
  "procedural",
  "combat_pressure",
]);

export const gmReadActionInterpretationSchema = z.object({
  summary: shortText,
  playerIntent: shortText,
  method: z.string().trim().max(500).nullable(),
  targetRefs: z.array(modelSafeRef).max(16),
  interactionKind: z.enum([
    "current_scene_observation",
    "route_inquiry",
    "movement_intent",
    "time_passage",
    "scene_local_beat",
    "visible_actor_dialogue",
    "unsupported_or_unclear",
  ]).default("unsupported_or_unclear"),
}).strict();

export const gmReadUncertaintySchema = z.object({
  present: z.boolean(),
  question: z.string().trim().max(500).nullable(),
  basis: z.string().trim().max(500).nullable(),
}).strict();

export const gmReadSchema = z.object({
  version: z.literal("gm-read.v1"),
  frameId: shortText,
  turnId: shortText,
  path: gmReadPathSchema,
  situationSummary: shortText,
  liveSceneQuestion: shortText,
  focalRefs: z.array(modelSafeRef).max(16),
  evidenceRefs: z.array(modelSafeRef).max(16),
  actionInterpretation: gmReadActionInterpretationSchema,
  uncertainty: gmReadUncertaintySchema,
  interpretationRationale: shortText,
}).strict();

export const judgePhysicalPossibilitySchema = z.enum([
  "possible",
  "possible_but_uncertain",
  "impossible",
  "underspecified",
  "unsupported_by_runtime",
]);

export const judgeCheckNeedSchema = z.enum([
  "no_roll_needed",
  "clarification_needed",
  "blocked_impossible",
  "blocked_unsupported",
  "backend_action_plan_needed",
  "oracle_roll_needed",
  "combat_judge_needed",
]);

export const judgeNextStepSchema = z.enum([
  "settle_no_roll",
  "ask_clarification",
  "block_no_mutation",
  "action_plan",
  "oracle_roll",
  "combat_boundary",
]);

export const judgeDifficultyTierSchema = z.enum([
  "trivial",
  "easy",
  "standard",
  "hard",
  "extreme",
]);

export const judgeUncertaintyKindSchema = z.enum([
  "physical_risk",
  "perception_under_pressure",
  "social_opposition",
  "opposition_resistance",
  "chance_under_pressure",
]);

export const judgeNoRollReasonCodeSchema = z.enum([
  "deterministic_scene_truth",
  "not_true_uncertainty",
  "backend_receipt_required",
  "insufficient_specificity",
  "physically_impossible",
  "unsupported_runtime_scope",
  "combat_boundary",
  "gm_read_uncertain_signal_only",
]);

export const judgeDifficultySchema = z.object({
  tier: judgeDifficultyTierSchema,
  basis: shortText,
  evidenceRefs: z.array(modelSafeRef).min(1).max(16),
}).strict();

export const judgeOracleAdmissionSchema = z.object({
  admissionId: shortText,
  question: shortText,
  uncertaintyKind: judgeUncertaintyKindSchema,
  actorRef: modelSafeRef,
  targetRefs: z.array(modelSafeRef).max(16),
  evidenceRefs: z.array(modelSafeRef).min(1).max(16),
  stakes: shortText,
  difficultyTier: judgeDifficultyTierSchema,
  outcomeMeanings: z.object({
    strong_hit: shortText,
    weak_hit: shortText,
    miss: shortText,
  }).strict(),
  settlementScope: z.literal("visible_outcome_only"),
  requiresFollowupMutation: z.literal(false),
}).strict();

export const judgeNoRollReasonSchema = z.object({
  code: judgeNoRollReasonCodeSchema,
  explanation: shortText,
  evidenceRefs: z.array(modelSafeRef).max(16),
}).strict();

export const judgeUncertaintySchema = z.object({
  version: z.literal("judge-uncertainty.v1"),
  judgmentId: shortText,
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  source: z.object({
    sceneFrameVersion: z.literal("scene-frame.v1"),
    gmReadVersion: z.literal("gm-read.v1"),
    gmReadPath: gmReadPathSchema,
  }).strict(),
  physicalPossibility: judgePhysicalPossibilitySchema,
  checkNeed: judgeCheckNeedSchema,
  nextStep: judgeNextStepSchema,
  actorRefs: z.array(modelSafeRef).max(16),
  targetRefs: z.array(modelSafeRef).max(16),
  evidenceRefs: z.array(modelSafeRef).max(16),
  possibilityRationale: shortText,
  checkRationale: shortText,
  difficulty: judgeDifficultySchema.nullable(),
  oracleAdmission: judgeOracleAdmissionSchema.nullable(),
  noRollReason: judgeNoRollReasonSchema.nullable(),
}).strict();

export const oracleOutcomeTierSchema = z.enum([
  "strong_hit",
  "weak_hit",
  "miss",
]);

export const oracleAdapterPayloadSchema = z.object({
  intent: shortText,
  method: shortText,
  actorTags: z.array(shortText).max(16),
  targetTags: z.array(shortText).max(16),
  environmentTags: z.array(shortText).max(16),
  sceneContext: z.string().trim().min(1).max(2000),
}).strict();

export const oracleAdapterOkResultSchema = z.object({
  status: z.literal("ok"),
  chance: z.number().int().min(1).max(99),
  roll: z.number().int().min(1).max(100),
  outcome: oracleOutcomeTierSchema,
  reasoning: shortText,
}).strict();

export const oracleAdapterFallbackResultSchema = z.object({
  status: z.literal("fallback"),
  fallbackPolicy: z.literal("conservative_miss"),
  outcome: z.literal("miss"),
  reason: z.object({
    kind: z.enum(["adapter_generation_failed", "invalid_adapter_output"]),
    message: z.string().trim().min(1).max(500),
  }).strict(),
}).strict();

export const oracleAdapterSettlementResultSchema = z.discriminatedUnion("status", [
  oracleAdapterOkResultSchema,
  oracleAdapterFallbackResultSchema,
]);

export const oracleSettlementAuthorityForbiddenClaimKindSchema = z.enum([
  "movement",
  "arrival",
  "route_state",
  "discovery",
  "location_reveal",
  "item_state",
  "npc_private_knowledge",
  "actor_creation",
  "world_fact",
  "absence_or_no_change",
  "condition_or_hp_change",
]);

export const oracleSettlementSchema = z.object({
  version: z.literal("oracle-settlement.v1"),
  settlementId: shortText,
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  source: z.object({
    sceneFrameVersion: z.literal("scene-frame.v1"),
    gmReadVersion: z.literal("gm-read.v1"),
    judgeVersion: z.literal("judge-uncertainty.v1"),
    gmReadPath: gmReadPathSchema,
    judgmentId: shortText,
    oracleAdmissionId: shortText,
  }).strict(),
  admission: judgeOracleAdmissionSchema,
  adapter: z.object({
    adapterId: z.literal("callOracle"),
    payload: oracleAdapterPayloadSchema,
    result: oracleAdapterSettlementResultSchema,
  }).strict(),
  selectedMeaning: z.object({
    outcome: oracleOutcomeTierSchema,
    text: shortText,
    source: z.literal("admission.outcomeMeanings[result.outcome]"),
  }).strict(),
  visibleOutcome: z.object({
    outcome: oracleOutcomeTierSchema,
    question: shortText,
    stakes: shortText,
    selectedMeaning: shortText,
  }).strict(),
  authority: z.object({
    evidenceAuthority: z.literal("oracle_settlement"),
    mutationAuthority: z.literal("none"),
    evidenceRefs: z.array(modelSafeRef).min(1).max(16),
    mayAuthorizeMutation: z.literal(false),
    claimScope: z.literal("visible_uncertainty_outcome_only"),
    forbiddenClaimKinds: z.array(oracleSettlementAuthorityForbiddenClaimKindSchema).min(1).max(16),
  }).strict(),
  failure: z.object({
    kind: z.enum(["adapter_generation_failed", "invalid_adapter_output"]),
    fallbackPolicy: z.literal("conservative_miss"),
    hiddenMutationApplied: z.literal(false),
  }).strict().nullable(),
}).strict();

export const gmActionChecklistStepIdSchema = z.enum([
  "step-1",
  "step-2",
  "step-3",
  "step-4",
  "step-5",
  "step-6",
]);

export const gmActionChecklistEffectKindSchema = z.enum([
  "observe_visible",
  "route_options",
  "route_check",
  "movement",
  "dialogue_record",
  "world_fact_record",
  "support_actor_create",
  "entity_tag",
  "item_transfer",
  "condition_set",
  "time_advance",
  "quick_action_offer",
  "scene_beat_record",
  "location_reveal",
  "minor_poi_create",
]);

export const gmActionChecklistDispositionKindSchema = z.enum([
  "stage4_backend_resolution_required",
  "skip_already_satisfied_by_scene_frame",
  "skip_insufficient_grounding",
]);

export const gmActionChecklistStateOrEvidenceSchema = z.enum([
  "state",
  "evidence",
  "terminal_player_visible",
]);

export const gmActionChecklistStepSchema = z.object({
  stepId: gmActionChecklistStepIdSchema,
  purpose: shortText,
  actorRef: modelSafeRef,
  targetRefs: z.array(modelSafeRef).max(8),
  evidenceRefs: z.array(modelSafeRef).min(1).max(8),
  intended: z.object({
    kind: gmActionChecklistEffectKindSchema,
    stateOrEvidence: gmActionChecklistStateOrEvidenceSchema,
    requiredCapabilityId: gameplayRuntimeCapabilityIdSchema,
    summary: shortText,
  }).strict(),
  disposition: z.object({
    kind: gmActionChecklistDispositionKindSchema,
    reason: shortText,
  }).strict(),
  dependsOnStepIds: z.array(gmActionChecklistStepIdSchema).max(5),
  expectedVisibleEffect: z.object({
    summary: shortText,
    visibleRefs: z.array(modelSafeRef).min(1).max(8),
  }).strict(),
}).strict();

export const gmActionChecklistSchema = z.object({
  version: z.literal("gm-action-checklist.v1"),
  checklistId: shortText,
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  source: z.object({
    sceneFrameVersion: z.literal("scene-frame.v1"),
    gmReadVersion: z.literal("gm-read.v1"),
    judgeVersion: z.literal("judge-uncertainty.v1"),
    gmReadPath: gmReadPathSchema,
    judgmentId: shortText,
    judgeCheckNeed: z.literal("backend_action_plan_needed"),
    judgeNextStep: z.literal("action_plan"),
    judgeNoRollReasonCode: z.literal("backend_receipt_required"),
  }).strict(),
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
  }).strict(),
  turnIntent: z.object({
    playerIntent: shortText,
    admittedConsequenceNeed: shortText,
  }).strict(),
  steps: z.array(gmActionChecklistStepSchema).min(1).max(6),
  authority: z.object({
    evidenceAuthority: z.literal("planning_only"),
    mutationAuthority: z.literal("none"),
    mayAuthorizeMutation: z.literal(false),
    mayGenerateExecutableRequest: z.literal(false),
    maySupportNarrationClaim: z.literal(false),
    settledTruth: z.literal(false),
    publicExposure: z.literal("stage_summary_only"),
  }).strict(),
}).strict();

export const frozenApiProjectionSchema = z.object({
  version: z.literal("gameplay-runtime.frozen-api-projection.v1"),
  runtime: z.literal("gameplay-cycle-runtime"),
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  narrativeText: z.string().min(1).max(4000),
  mutationApplied: z.boolean(),
  settled: z.literal(true),
});

export const cleanStage4CapabilityIdSchema = z.enum([
  "observe_visible",
  "route_options",
  "route_check",
  "movement",
  "dialogue_record",
  "time_advance",
  "scene_beat_record",
]);

export const cleanStage4DialogueOutcomeKindSchema = z.enum([
  "answer",
  "refusal",
  "warning",
  "redirect",
  "silence",
  "other",
]);

export const cleanStage4DialogueRequestEffectSchema = z.object({
  kind: z.literal("dialogue_record"),
  authorityKind: z.literal("existing_visible_actor"),
  speakerRef: modelSafeRef,
  addresseeRefs: z.array(modelSafeRef).min(1).max(8),
  outcomeKind: cleanStage4DialogueOutcomeKindSchema,
  response: z.object({
    kind: z.enum(["speech", "silence"]),
    quotedSpeech: z.string().trim().min(1).max(700).nullable(),
    summary: shortText,
  }).strict(),
  languageBasis: z.object({
    responseLanguage: z.literal("match_player_action"),
    source: z.literal("turn_language_profile"),
  }).strict(),
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  stateEffects: z.object({
    appliesState: z.literal(false),
  }).strict(),
}).strict().superRefine((effect, ctx) => {
  if (effect.outcomeKind === "silence") {
    if (effect.response.kind !== "silence") {
      ctx.addIssue({ code: "custom", path: ["response", "kind"], message: "Silence dialogue outcomes must use response.kind=silence." });
    }
    if (effect.response.quotedSpeech !== null) {
      ctx.addIssue({ code: "custom", path: ["response", "quotedSpeech"], message: "Silence dialogue outcomes must not include quoted speech." });
    }
    return;
  }
  if (effect.response.kind !== "speech") {
    ctx.addIssue({ code: "custom", path: ["response", "kind"], message: "Non-silence dialogue outcomes must use response.kind=speech." });
  }
  if (effect.response.quotedSpeech === null) {
    ctx.addIssue({ code: "custom", path: ["response", "quotedSpeech"], message: "Non-silence dialogue outcomes require quoted speech." });
  }
});

export const cleanStage4RequestSchema = z.object({
  version: z.literal("gameplay-runtime.stage4-request.v1"),
  requestId: shortText,
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  checklistId: shortText,
  stepId: gmActionChecklistStepIdSchema,
  source: z.object({
    sceneFrameVersion: z.literal("scene-frame.v1"),
    gmReadVersion: z.literal("gm-read.v1"),
    judgeVersion: z.literal("judge-uncertainty.v1"),
    checklistVersion: z.literal("gm-action-checklist.v1"),
    checklistId: shortText,
    checklistStepId: gmActionChecklistStepIdSchema,
  }).strict(),
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
  }).strict(),
  author: z.enum(["backend_from_checklist", "model_from_stage4_dialogue_request"]),
  modelAuthored: z.boolean(),
  capabilityId: cleanStage4CapabilityIdSchema,
  effect: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("observe_visible"),
      actorRef: z.literal("Player"),
      scope: z.literal("current_scene"),
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    z.object({
      kind: z.literal("route_options"),
      actorRef: z.literal("Player"),
      fromRef: modelSafeRef,
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    z.object({
      kind: z.literal("route_check"),
      actorRef: z.literal("Player"),
      destinationRef: modelSafeRef,
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    z.object({
      kind: z.literal("movement"),
      actorRef: z.literal("Player"),
      destinationRef: modelSafeRef,
      travelMode: z.literal("walk"),
      requiredRouteReceiptId: shortText.nullable(),
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    z.object({
      kind: z.literal("time_advance"),
      actorRef: z.literal("Player"),
      sceneRef: modelSafeRef,
      elapsedMinutes: z.number().int().min(1).max(60),
      reasonKind: z.enum(["brief_local_action", "wait", "short_rest"]),
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    z.object({
      kind: z.literal("scene_beat_record"),
      actorRef: z.literal("Player"),
      sceneRef: modelSafeRef,
      targetRefs: z.array(modelSafeRef).max(8),
      beatKind: z.enum(["gesture", "posture", "local_interaction", "generic_scene_beat"]),
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    cleanStage4DialogueRequestEffectSchema,
  ]),
}).strict().superRefine((request, ctx) => {
  if (request.effect.kind !== request.capabilityId) {
    ctx.addIssue({ code: "custom", path: ["capabilityId"], message: "Stage 4 request capabilityId must match effect kind." });
  }
  if (request.effect.kind === "dialogue_record") {
    if (request.author !== "model_from_stage4_dialogue_request" || request.modelAuthored !== true) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "P65 dialogue requests must be model-authored Stage 4 requests." });
    }
    return;
  }
  if (request.author !== "backend_from_checklist" || request.modelAuthored !== false) {
    ctx.addIssue({ code: "custom", path: ["author"], message: "Only dialogue_record may be model-authored in P65." });
  }
});

export const cleanStage4ReceiptSchema = z.object({
  version: z.literal("gameplay-runtime.stage4-receipt.v1"),
  receiptId: shortText,
  requestId: shortText,
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  checklistId: shortText,
  stepId: gmActionChecklistStepIdSchema,
  capabilityId: cleanStage4CapabilityIdSchema,
  status: z.enum(["accepted", "skipped", "failed"]),
  source: z.object({
    sceneFrameVersion: z.literal("scene-frame.v1"),
    gmReadVersion: z.literal("gm-read.v1"),
    judgeVersion: z.literal("judge-uncertainty.v1"),
    checklistVersion: z.literal("gm-action-checklist.v1"),
    checklistId: shortText,
    checklistStepId: gmActionChecklistStepIdSchema,
  }).strict(),
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
  }).strict(),
  result: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
    mutationApplied: z.boolean(),
  }).strict(),
  authority: z.object({
    evidenceAuthority: z.enum([
      "scene_observation_receipt",
      "route_options_receipt",
      "route_check_receipt",
      "scene_beat_receipt",
      "terminal_dialogue_receipt",
      "terminal_mutation_receipt",
      "failure_receipt",
      "skip_receipt",
    ]),
    mutationAuthority: z.enum([
      "none",
      "player_location_and_world_clock",
      "world_clock_only",
    ]),
    visibleResultAuthority: z.enum([
      "may_describe_visible_snapshot",
      "may_list_route_options",
      "may_explain_route_status",
      "may_claim_player_location_change",
      "may_claim_elapsed_time",
      "may_acknowledge_scene_beat",
      "may_quote_visible_dialogue_response",
      "failure_only",
      "none",
    ]),
    maySupportNarrationClaim: z.boolean(),
    mayAuthorizeMutation: z.boolean(),
  }).strict(),
  publicResult: z.object({
    summary: shortText,
    visibleRefs: z.array(modelSafeRef).min(1).max(12),
    routeStatus: z.enum(["connected", "disconnected"]).nullable(),
    routeOptions: z.object({
      type: z.literal("route_options"),
      fromLabel: shortText,
      options: z.array(z.object({
        label: shortText,
        connected: z.boolean(),
        travelCost: z.number().int().nonnegative().nullable(),
      }).strict()).max(32),
    }).strict().nullable(),
    locationChange: z.object({
      type: z.literal("location_change"),
      locationName: shortText,
      travelCost: z.number().int().nonnegative(),
      path: z.array(shortText).max(12),
    }).strict().nullable(),
    timeAdvance: z.object({
      type: z.literal("time_advance"),
      elapsedMinutes: z.number().int().min(1).max(60),
      reasonKind: z.enum(["brief_local_action", "wait", "short_rest"]),
    }).strict().nullable(),
    visibleObservation: z.object({
      type: z.literal("visible_observation"),
      currentScene: shortText,
      currentLocation: shortText,
      visibleActors: z.array(shortText).max(12),
      visibleFacts: z.array(shortText).max(12),
      inventory: z.array(shortText).max(12),
      movementOptions: z.array(shortText).max(32),
    }).strict().nullable(),
    sceneBeat: z.object({
      type: z.literal("scene_beat"),
      beatKind: z.enum(["gesture", "posture", "local_interaction", "generic_scene_beat"]),
      summary: shortText,
      targetLabels: z.array(shortText).max(8),
    }).strict().nullable(),
    dialogue: z.object({
      type: z.literal("dialogue_response"),
      authorityKind: z.literal("existing_visible_actor"),
      speakerLabel: shortText,
      addresseeLabels: z.array(shortText).min(1).max(8),
      outcomeKind: cleanStage4DialogueOutcomeKindSchema,
      quotedSpeech: z.string().trim().min(1).max(700).nullable(),
      summary: shortText,
      responseLanguage: z.literal("match_player_action"),
      claimStatus: z.literal("visible_speaker_response_only"),
    }).strict().nullable(),
  }).strict(),
  privateResult: z.object({
    playerId: shortText.nullable(),
    fromLocationId: shortText.nullable(),
    destinationLocationId: shortText.nullable(),
    edgeIds: z.array(shortText).max(24),
    authorityTraceId: shortText.nullable(),
    clockReceiptId: shortText.nullable(),
    stateDeltaRefs: z.array(shortText).max(24),
  }).strict(),
  failure: z.object({
    kind: z.enum([
      "invalid_backend_request",
      "unsupported_capability_for_p61",
      "unsupported_clean_stage4_capability",
      "insufficient_grounding",
      "frame_mismatch",
      "stale_frame_or_clock",
      "missing_or_ambiguous_destination",
      "route_disconnected",
      "dependency_not_accepted",
      "mutation_apply_failed",
      "receipt_persist_failed",
    ]),
    message: shortText,
    hiddenMutationApplied: z.literal(false),
  }).strict().nullable(),
}).strict().superRefine((receipt, ctx) => {
  if (receipt.status === "accepted" && receipt.capabilityId === "movement") {
    if (!receipt.result.mutationApplied) {
      ctx.addIssue({ code: "custom", path: ["result", "mutationApplied"], message: "Accepted movement must apply mutation." });
    }
    if (receipt.result.worldVersion <= receipt.base.worldVersion) {
      ctx.addIssue({ code: "custom", path: ["result", "worldVersion"], message: "Accepted movement must advance world version." });
    }
    if (receipt.authority.mutationAuthority !== "player_location_and_world_clock") {
      ctx.addIssue({ code: "custom", path: ["authority", "mutationAuthority"], message: "Accepted movement must own player location and clock mutation." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_player_location_change") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted movement must authorize location-change narration." });
    }
    if (receipt.publicResult.locationChange === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "locationChange"], message: "Accepted movement requires public location change." });
    }
  }
  if (receipt.capabilityId === "route_check") {
    if (receipt.result.mutationApplied) {
      ctx.addIssue({ code: "custom", path: ["result", "mutationApplied"], message: "Route check must not mutate." });
    }
    if (receipt.result.worldVersion !== receipt.base.worldVersion) {
      ctx.addIssue({ code: "custom", path: ["result", "worldVersion"], message: "Route check must not advance world version." });
    }
    if (receipt.authority.mutationAuthority !== "none") {
      ctx.addIssue({ code: "custom", path: ["authority", "mutationAuthority"], message: "Route check mutation authority must be none." });
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "time_advance") {
    if (!receipt.result.mutationApplied) {
      ctx.addIssue({ code: "custom", path: ["result", "mutationApplied"], message: "Accepted time advance must apply clock mutation." });
    }
    if (receipt.result.worldVersion <= receipt.base.worldVersion || receipt.result.worldTimeMinutes <= receipt.base.worldTimeMinutes) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted time advance must advance world version and time." });
    }
    if (receipt.authority.mutationAuthority !== "world_clock_only") {
      ctx.addIssue({ code: "custom", path: ["authority", "mutationAuthority"], message: "Accepted time advance must own world clock mutation only." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_elapsed_time") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted time advance must authorize elapsed-time narration." });
    }
    if (receipt.publicResult.timeAdvance === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "timeAdvance"], message: "Accepted time advance requires public elapsed-time result." });
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "dialogue_record") {
    if (receipt.result.mutationApplied) {
      ctx.addIssue({ code: "custom", path: ["result", "mutationApplied"], message: "Accepted dialogue must not mutate." });
    }
    if (
      receipt.result.worldVersion !== receipt.base.worldVersion
      || receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes
      || receipt.result.tick !== receipt.base.tick
    ) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted dialogue must not advance world state or tick." });
    }
    if (receipt.authority.evidenceAuthority !== "terminal_dialogue_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted dialogue must use terminal dialogue evidence authority." });
    }
    if (receipt.authority.mutationAuthority !== "none") {
      ctx.addIssue({ code: "custom", path: ["authority", "mutationAuthority"], message: "Accepted dialogue mutation authority must be none." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_quote_visible_dialogue_response") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted dialogue must authorize quoting visible response only." });
    }
    if (receipt.publicResult.dialogue === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "dialogue"], message: "Accepted dialogue requires public dialogue result." });
    }
  }
  for (const capabilityId of ["observe_visible", "route_options", "scene_beat_record"] as const) {
    if (receipt.capabilityId !== capabilityId) continue;
    if (receipt.result.mutationApplied) {
      ctx.addIssue({ code: "custom", path: ["result", "mutationApplied"], message: `${capabilityId} must not mutate.` });
    }
    if (receipt.result.worldVersion !== receipt.base.worldVersion || receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes) {
      ctx.addIssue({ code: "custom", path: ["result"], message: `${capabilityId} must not advance world state.` });
    }
    if (receipt.authority.mutationAuthority !== "none") {
      ctx.addIssue({ code: "custom", path: ["authority", "mutationAuthority"], message: `${capabilityId} mutation authority must be none.` });
    }
  }
  if (receipt.status !== "accepted") {
    if (receipt.result.mutationApplied || receipt.result.worldVersion !== receipt.base.worldVersion) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Skipped/failed receipts must not advance world state." });
    }
    if (receipt.failure === null) {
      ctx.addIssue({ code: "custom", path: ["failure"], message: "Skipped/failed receipts require a failure reason." });
    }
  }
  const publicJson = JSON.stringify(receipt.publicResult)
    .replace(/location_change/g, "")
    .replace(/route_options/g, "")
    .replace(/time_advance/g, "")
    .replace(/visible_observation/g, "")
    .replace(/scene_beat/g, "")
    .replace(/dialogue_response/g, "");
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(publicJson)) {
    ctx.addIssue({ code: "custom", path: ["publicResult"], message: "Public receipt result must not expose UUID-like backend ids." });
  }
  if (/\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|route|scene|turn|world)[_:]/i.test(publicJson)) {
    ctx.addIssue({ code: "custom", path: ["publicResult"], message: "Public receipt result must not expose backend refs." });
  }
});

export const cleanStage4ExecutionResultSchema = z.object({
  version: z.literal("gameplay-runtime.stage4-execution-result.v1"),
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  checklistId: shortText,
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
  }).strict(),
  receipts: z.array(cleanStage4ReceiptSchema).min(1).max(6),
  acceptedReceiptIds: z.array(shortText).max(6),
  skippedStepIds: z.array(gmActionChecklistStepIdSchema).max(6),
  failedStepIds: z.array(gmActionChecklistStepIdSchema).max(6),
  mutationApplied: z.boolean(),
  resultWorldVersion: z.number().int().nonnegative(),
  visibleResults: z.array(z.object({
    receiptId: shortText,
    authority: z.enum([
      "scene_observation_receipt",
      "route_options_receipt",
      "route_check_receipt",
      "scene_beat_receipt",
      "terminal_dialogue_receipt",
      "terminal_mutation_receipt",
      "failure_receipt",
      "skip_receipt",
    ]),
    summary: shortText,
    visibleRefs: z.array(modelSafeRef).min(1).max(12),
    locationChange: z.object({
      type: z.literal("location_change"),
      locationName: shortText,
      travelCost: z.number().int().nonnegative(),
      path: z.array(shortText).max(12),
    }).strict().nullable(),
    timeAdvance: z.object({
      type: z.literal("time_advance"),
      elapsedMinutes: z.number().int().min(1).max(60),
      reasonKind: z.enum(["brief_local_action", "wait", "short_rest"]),
    }).strict().nullable(),
    dialogue: z.object({
      type: z.literal("dialogue_response"),
      authorityKind: z.literal("existing_visible_actor"),
      speakerLabel: shortText,
      addresseeLabels: z.array(shortText).min(1).max(8),
      outcomeKind: cleanStage4DialogueOutcomeKindSchema,
      quotedSpeech: z.string().trim().min(1).max(700).nullable(),
      summary: shortText,
      responseLanguage: z.literal("match_player_action"),
      claimStatus: z.literal("visible_speaker_response_only"),
    }).strict().nullable(),
  }).strict()).max(6),
}).strict();

const cleanSettledClaimKindSchema = z.enum([
  "current_scene",
  "current_location",
  "visible_fact",
  "visible_actor",
  "inventory_status",
  "movement_option",
  "route_status",
  "scene_beat",
  "dialogue_response",
  "player_location_change",
  "elapsed_time",
  "oracle_outcome",
]);

const cleanSettledEvidenceAuthoritySchema = z.enum([
  "scene_frame_snapshot",
  "scene_observation_receipt",
  "route_options_receipt",
  "route_check_receipt",
  "scene_beat_receipt",
  "terminal_dialogue_receipt",
  "terminal_mutation_receipt",
  "oracle_visible_outcome",
]);

const cleanEvidenceLimitSchema = z.object({
  proves: z.array(shortText).max(12),
  doesNotProve: z.array(shortText).max(16),
}).strict();

const cleanSettledBackendFactSchema = z.object({
  factRef: shortText,
  text: shortText,
  exact: z.boolean(),
}).strict();

export const cleanSettledEvidenceSchema = z.object({
  evidenceId: shortText,
  sourceKind: z.enum(["scene_frame", "stage4_receipt", "oracle_settlement"]),
  sourceRef: shortText,
  authority: cleanSettledEvidenceAuthoritySchema,
  claimKinds: z.array(cleanSettledClaimKindSchema).min(1).max(6),
  text: shortText,
  visibleRefs: z.array(modelSafeRef).min(1).max(16),
  backendFacts: z.array(cleanSettledBackendFactSchema).min(1).max(8),
  limits: cleanEvidenceLimitSchema,
}).strict();

export const cleanSettledStepAuditSchema = z.object({
  stepId: gmActionChecklistStepIdSchema,
  intendedKind: gmActionChecklistEffectKindSchema.nullable(),
  status: z.enum(["accepted", "failed", "skipped", "not_run"]),
  receiptId: shortText.nullable(),
  authority: z.enum([
    "scene_observation_receipt",
    "route_options_receipt",
    "route_check_receipt",
    "scene_beat_receipt",
    "terminal_dialogue_receipt",
    "terminal_mutation_receipt",
    "failure_receipt",
    "skip_receipt",
  ]).nullable(),
  publicReason: shortText.nullable(),
  maySupportWorldClaim: z.literal(false),
}).strict();

const cleanNarrationContractSchema = z.object({
  acceptedEvidenceOnly: z.literal(true),
  mayCallTools: z.literal(false),
  mayInferNewFacts: z.literal(false),
  mayUseFailedOrSkippedAsTruth: z.literal(false),
  mayNarrateNoChangeWithoutExplicitEvidence: z.literal(false),
  preserveLabelsVerbatim: z.literal(true),
  forbiddenClaimKindsWithoutAcceptedEvidence: z.array(z.enum([
    "absence_or_no_change",
    "movement",
    "discovery",
    "item_state",
    "npc_private_knowledge",
    "location_reveal",
    "condition_or_hp_change",
    "world_fact",
  ])).min(8).max(8),
}).strict();

export const cleanSettledTurnPacketSchema = z.object({
  version: z.literal("gameplay-runtime.settled-turn-packet.v1"),
  packetId: shortText,
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  source: z.object({
    sceneFrameVersion: z.literal("scene-frame.v1"),
    gmReadVersion: z.literal("gm-read.v1").nullable(),
    judgeVersion: z.literal("judge-uncertainty.v1").nullable(),
    oracleSettlementVersion: z.literal("oracle-settlement.v1").nullable(),
    checklistVersion: z.literal("gm-action-checklist.v1").nullable(),
    stage4ExecutionVersion: z.literal("gameplay-runtime.stage4-execution-result.v1").nullable(),
  }).strict(),
  input: z.object({
    submittedPlayerAction: shortText,
    normalizedPlayerAction: shortText,
    source: z.enum(["typed", "quick_action"]),
  }).strict(),
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
  }).strict(),
  result: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
    mutationApplied: z.boolean(),
  }).strict(),
  settlementKind: z.enum([
    "direct_scene",
    "continue_scene",
    "clarification",
    "blocked_no_mutation",
    "oracle_visible_outcome",
    "stage4_execution",
    "stage4_failed_or_skipped",
    "minimal_safe",
  ]),
  acceptedEvidence: z.array(cleanSettledEvidenceSchema).max(24),
  stepAudit: z.array(cleanSettledStepAuditSchema).max(6),
  nonAuthoritativeContext: z.object({
    gmReadPath: gmReadPathSchema.nullable(),
    gmReadIntent: shortText.nullable(),
    judgeNextStep: judgeNextStepSchema.nullable(),
    checklistId: shortText.nullable(),
    checklistPlanningOnly: z.boolean(),
  }).strict(),
  privateGuards: z.object({
    forbiddenActorLabels: z.array(shortText).max(64),
    forbiddenPrivateTerms: z.array(shortText).max(128),
    forecastForbiddenPrivateTerms: z.array(shortText).max(128),
  }).strict(),
  narrationContract: cleanNarrationContractSchema,
}).strict().superRefine((packet, ctx) => {
  const privateTerms = [
    ...packet.privateGuards.forbiddenActorLabels,
    ...packet.privateGuards.forbiddenPrivateTerms,
    ...packet.privateGuards.forecastForbiddenPrivateTerms,
  ].map((term) => term.trim()).filter((term) => term.length > 0);
  const publicEvidenceText = JSON.stringify(packet.acceptedEvidence);
  for (const term of privateTerms) {
    if (publicEvidenceText.toLowerCase().includes(term.toLowerCase())) {
      ctx.addIssue({ code: "custom", path: ["acceptedEvidence"], message: "Settled evidence must not expose private guard terms." });
      break;
    }
  }
  if (packet.stepAudit.some((step) => step.status !== "accepted" && step.maySupportWorldClaim !== false)) {
    ctx.addIssue({ code: "custom", path: ["stepAudit"], message: "Failed/skipped steps cannot support world claims." });
  }
});

const cleanNarratorAcceptedEvidenceSchema = z.object({
  ref: shortText,
  authority: cleanSettledEvidenceAuthoritySchema,
  claimKinds: z.array(cleanSettledClaimKindSchema).min(1).max(6),
  text: shortText,
  backendFacts: z.array(cleanSettledBackendFactSchema).min(1).max(8),
  limits: cleanEvidenceLimitSchema,
}).strict();

const cleanNarratorAuditNoticeSchema = z.object({
  stepId: gmActionChecklistStepIdSchema,
  status: z.enum(["failed", "skipped"]),
  publicReason: shortText,
  mayUseAsWorldTruth: z.literal(false),
}).strict();

const cleanNarratorGuardSchema = z.object({
  mayCallTools: z.literal(false),
  mayInferNewFacts: z.literal(false),
  mayUseFailedOrSkippedAsTruth: z.literal(false),
  mayNarrateNoChangeWithoutExplicitEvidence: z.literal(false),
}).strict();

export const cleanNarratorViewSchema = z.object({
  version: z.literal("gameplay-runtime.narrator-view.v1"),
  packetId: shortText,
  campaignId: shortText,
  turnId: shortText,
  playerAction: shortText,
  responseLanguage: z.literal("match_player_action"),
  preserveLabelsVerbatim: z.literal(true),
  acceptedEvidence: z.array(cleanNarratorAcceptedEvidenceSchema).max(24),
  stepAuditForGrounding: z.array(cleanNarratorAuditNoticeSchema).max(6),
  guard: cleanNarratorGuardSchema,
  privateGuardSidecar: z.object({
    forbiddenActorLabels: z.array(shortText).max(64),
    forbiddenPrivateTerms: z.array(shortText).max(128),
  }).strict(),
}).strict().superRefine((view, ctx) => {
  const visibleJson = JSON.stringify({
    acceptedEvidence: view.acceptedEvidence,
    stepAuditForGrounding: view.stepAuditForGrounding,
    guard: view.guard,
  });
  if (/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(visibleJson)) {
    ctx.addIssue({ code: "custom", path: ["acceptedEvidence"], message: "Narrator view must not expose UUID-like backend ids." });
  }
  if (/\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|route|scene|turn|world|loc|player):[^\s",.]+/i.test(visibleJson)
    || /\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|route|scene|turn|world|loc|player)-[a-z0-9][a-z0-9-]*\b/i.test(visibleJson)) {
    ctx.addIssue({ code: "custom", path: ["acceptedEvidence"], message: "Narrator view must not expose backend refs." });
  }
});

export const cleanNarrationLanguageSchema = z.enum(["en", "ru", "mixed"]);

export const cleanNarratorPromptInputSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-prompt-input.v1"),
  packetId: shortText,
  turnId: shortText,
  responseLanguage: z.literal("match_player_action"),
  language: cleanNarrationLanguageSchema,
  languageSource: z.literal("derived_from_player_action_without_prompting_raw_action"),
  preserveLabelsVerbatim: z.literal(true),
  acceptedEvidence: z.array(cleanNarratorAcceptedEvidenceSchema).max(24),
  stepAuditForGrounding: z.array(cleanNarratorAuditNoticeSchema).max(6),
  guard: cleanNarratorGuardSchema,
}).strict();

export const cleanNarrationSentenceSchema = z.object({
  kind: z.enum(["accepted_evidence", "audit_notice"]),
  text: z.string().trim().min(1).max(500),
  evidenceRefs: z.array(shortText).max(6),
  backendFactRefs: z.array(shortText).max(12),
  claimKinds: z.array(cleanSettledClaimKindSchema).max(6),
  auditStepIds: z.array(gmActionChecklistStepIdSchema).max(6),
}).strict();

export const cleanNarrationCandidateSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narration-candidate.v1"),
  packetId: shortText,
  turnId: shortText,
  language: cleanNarrationLanguageSchema,
  sentences: z.array(cleanNarrationSentenceSchema).min(1).max(6),
  finalText: z.string().trim().min(1).max(900),
}).strict();

export const cleanNarrationResultSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narration-result.v1"),
  packetId: shortText,
  turnId: shortText,
  text: z.string().trim().min(1).max(900),
  source: z.enum([
    "model",
    "fallback_generation_error",
    "fallback_validation_error",
    "fallback_empty_evidence",
  ]),
}).strict();

const publicSafeRuntimeId = z.string().trim().regex(
  /^[a-z][a-z0-9_]{7,96}$/u,
  "Clean runtime public ids must be stable public-safe tokens.",
);
const sha256Hex = z.string().trim().regex(/^[a-f0-9]{64}$/u);

export const cleanPlayerFacingTurnEvidenceRefSchema = z.object({
  kind: z.enum([
    "scene_frame",
    "gm_read",
    "judge_uncertainty",
    "oracle_settlement",
    "gm_action_checklist",
    "stage4_execution",
    "settled_packet",
  ]),
  ref: shortText,
  authority: z.enum([
    "snapshot",
    "interpretation_only",
    "admission_only",
    "visible_uncertainty_outcome",
    "planning_only",
    "stage4_execution_result",
    "route_check_receipt",
    "terminal_mutation_receipt",
    "failure_receipt",
    "skip_receipt",
    "settled_truth_packet",
  ]),
}).strict();

export const cleanPlayerFacingTurnDoneBoundarySchema = z.object({
  runtime: z.literal("gameplay-cycle-runtime"),
  recordId: publicSafeRuntimeId,
  turnId: publicSafeRuntimeId,
  packetId: publicSafeRuntimeId,
  mutationApplied: z.boolean(),
  settled: z.literal(true),
  chatHistoryLengthBeforeTurn: z.number().int().nonnegative(),
  chatHistoryLengthAfterTurn: z.number().int().nonnegative(),
  userMessageSha256: sha256Hex,
  assistantMessageSha256: sha256Hex,
}).strict();

export const cleanPlayerFacingTurnRecordSchema = z.object({
  version: z.literal("gameplay-runtime.player-facing-turn-record.v1"),
  runtime: z.literal("gameplay-cycle-runtime"),
  route: z.literal("/api/chat/action"),
  campaignId: shortText,
  recordId: publicSafeRuntimeId,
  publicTurnId: publicSafeRuntimeId,
  publicPacketId: publicSafeRuntimeId,
  internalTurnId: shortText,
  internalFrameId: shortText,
  idempotencyKey: shortText,
  committedAt: z.number().int().nonnegative(),
  input: z.object({
    submittedPlayerAction: shortText,
    normalizedPlayerAction: shortText,
    source: z.enum(["typed", "quick_action"]),
  }).strict(),
  base: z.object({
    tick: z.number().int().nonnegative(),
    worldVersion: z.number().int().nonnegative(),
    worldTimeMinutes: z.number().int().nonnegative(),
    chatHistoryLengthBeforeTurn: z.number().int().nonnegative(),
  }).strict(),
  chat: z.object({
    userMessageIndex: z.number().int().nonnegative(),
    assistantMessageIndex: z.number().int().nonnegative(),
    userMessageSha256: sha256Hex,
    assistantMessageSha256: sha256Hex,
  }).strict(),
  terminalProjection: frozenApiProjectionSchema,
  settlement: z.object({
    settledPacket: cleanSettledTurnPacketSchema,
    narratorView: cleanNarratorViewSchema,
  }).strict(),
  evidenceRefs: z.array(cleanPlayerFacingTurnEvidenceRefSchema).min(1).max(8),
  durableEventIds: z.object({
    accepted: z.array(shortText).max(0),
    produced: z.array(shortText).max(0),
  }).strict(),
  doneBoundary: cleanPlayerFacingTurnDoneBoundarySchema,
}).strict().superRefine((record, ctx) => {
  if (record.publicTurnId !== record.doneBoundary.turnId) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "turnId"], message: "doneBoundary.turnId must match publicTurnId." });
  }
  if (record.publicPacketId !== record.doneBoundary.packetId) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "packetId"], message: "doneBoundary.packetId must match publicPacketId." });
  }
  if (record.recordId !== record.doneBoundary.recordId) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "recordId"], message: "doneBoundary.recordId must match recordId." });
  }
  if (record.internalTurnId !== record.terminalProjection.turnId) {
    ctx.addIssue({ code: "custom", path: ["terminalProjection", "turnId"], message: "terminalProjection.turnId must match internalTurnId." });
  }
  if (record.internalFrameId !== record.terminalProjection.frameId) {
    ctx.addIssue({ code: "custom", path: ["terminalProjection", "frameId"], message: "terminalProjection.frameId must match internalFrameId." });
  }
  if (record.publicPacketId !== record.settlement.settledPacket.packetId) {
    ctx.addIssue({ code: "custom", path: ["settlement", "settledPacket", "packetId"], message: "settled packet id must match publicPacketId." });
  }
  if (record.publicPacketId !== record.settlement.narratorView.packetId) {
    ctx.addIssue({ code: "custom", path: ["settlement", "narratorView", "packetId"], message: "narrator view packet id must match publicPacketId." });
  }
  if (record.internalTurnId !== record.settlement.settledPacket.turnId) {
    ctx.addIssue({ code: "custom", path: ["settlement", "settledPacket", "turnId"], message: "settled packet turn id must match internalTurnId." });
  }
  if (record.internalFrameId !== record.settlement.settledPacket.frameId) {
    ctx.addIssue({ code: "custom", path: ["settlement", "settledPacket", "frameId"], message: "settled packet frame id must match internalFrameId." });
  }
  if (record.chat.userMessageIndex !== record.base.chatHistoryLengthBeforeTurn) {
    ctx.addIssue({ code: "custom", path: ["chat", "userMessageIndex"], message: "user message index must equal base chat length." });
  }
  if (record.chat.assistantMessageIndex !== record.chat.userMessageIndex + 1) {
    ctx.addIssue({ code: "custom", path: ["chat", "assistantMessageIndex"], message: "assistant message must immediately follow user message." });
  }
  if (record.doneBoundary.chatHistoryLengthBeforeTurn !== record.base.chatHistoryLengthBeforeTurn) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "chatHistoryLengthBeforeTurn"], message: "done before length must match base." });
  }
  if (record.doneBoundary.chatHistoryLengthAfterTurn !== record.chat.assistantMessageIndex + 1) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "chatHistoryLengthAfterTurn"], message: "done after length must include exactly two appended messages." });
  }
  if (record.doneBoundary.userMessageSha256 !== record.chat.userMessageSha256) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "userMessageSha256"], message: "done user hash must match chat hash." });
  }
  if (record.doneBoundary.assistantMessageSha256 !== record.chat.assistantMessageSha256) {
    ctx.addIssue({ code: "custom", path: ["doneBoundary", "assistantMessageSha256"], message: "done assistant hash must match chat hash." });
  }
  const serialized = JSON.stringify(record);
  for (const forbidden of [
    "gameplay_cycle_v2",
    "turn_saga",
    "settled_turn_packet",
    "narrator_attempt",
    "receipt_ledger",
    "tool_payload",
  ]) {
    if (serialized.includes(forbidden)) {
      ctx.addIssue({ code: "custom", path: [], message: `Clean player-facing record must not carry ${forbidden}.` });
    }
  }
});

export type GameplayRuntimeProviderSummary = z.infer<typeof gameplayRuntimeProviderSummarySchema>;
export type GameplayRuntimeTurnInput = z.infer<typeof gameplayRuntimeTurnInputSchema>;
export type GameplayRuntimeCapabilityId = z.infer<typeof gameplayRuntimeCapabilityIdSchema>;
export type ScopedForecastEnvelope = z.infer<typeof scopedForecastEnvelopeSchema>;
export type AuthoritativeSceneFrame = z.infer<typeof authoritativeSceneFrameSchema>;
export type GmReadPath = z.infer<typeof gmReadPathSchema>;
export type GmRead = z.infer<typeof gmReadSchema>;
export type JudgePhysicalPossibility = z.infer<typeof judgePhysicalPossibilitySchema>;
export type JudgeCheckNeed = z.infer<typeof judgeCheckNeedSchema>;
export type JudgeNextStep = z.infer<typeof judgeNextStepSchema>;
export type JudgeDifficultyTier = z.infer<typeof judgeDifficultyTierSchema>;
export type JudgeUncertainty = z.infer<typeof judgeUncertaintySchema>;
export type OracleOutcomeTier = z.infer<typeof oracleOutcomeTierSchema>;
export type OracleAdapterSettlementResult = z.infer<typeof oracleAdapterSettlementResultSchema>;
export type OracleSettlement = z.infer<typeof oracleSettlementSchema>;
export type GmActionChecklistEffectKind = z.infer<typeof gmActionChecklistEffectKindSchema>;
export type GmActionChecklist = z.infer<typeof gmActionChecklistSchema>;
export type CleanStage4Request = z.infer<typeof cleanStage4RequestSchema>;
export type CleanStage4Receipt = z.infer<typeof cleanStage4ReceiptSchema>;
export type CleanStage4ExecutionResult = z.infer<typeof cleanStage4ExecutionResultSchema>;
export type CleanSettledEvidence = z.infer<typeof cleanSettledEvidenceSchema>;
export type CleanSettledStepAudit = z.infer<typeof cleanSettledStepAuditSchema>;
export type CleanSettledTurnPacket = z.infer<typeof cleanSettledTurnPacketSchema>;
export type CleanNarratorView = z.infer<typeof cleanNarratorViewSchema>;
export type CleanNarrationLanguage = z.infer<typeof cleanNarrationLanguageSchema>;
export type CleanNarratorPromptInput = z.infer<typeof cleanNarratorPromptInputSchema>;
export type CleanNarrationSentence = z.infer<typeof cleanNarrationSentenceSchema>;
export type CleanNarrationCandidate = z.infer<typeof cleanNarrationCandidateSchema>;
export type CleanNarrationResult = z.infer<typeof cleanNarrationResultSchema>;
export type FrozenApiProjection = z.infer<typeof frozenApiProjectionSchema>;
export type CleanPlayerFacingTurnEvidenceRef = z.infer<typeof cleanPlayerFacingTurnEvidenceRefSchema>;
export type CleanPlayerFacingTurnDoneBoundary = z.infer<typeof cleanPlayerFacingTurnDoneBoundarySchema>;
export type CleanPlayerFacingTurnRecord = z.infer<typeof cleanPlayerFacingTurnRecordSchema>;

export function assertGameplayRuntimeTurnInput(value: unknown): GameplayRuntimeTurnInput {
  return gameplayRuntimeTurnInputSchema.parse(value);
}

export function assertAuthoritativeSceneFrame(value: unknown): AuthoritativeSceneFrame {
  return authoritativeSceneFrameSchema.parse(value);
}

export function assertGmRead(value: unknown): GmRead {
  return gmReadSchema.parse(value);
}

export function assertJudgeUncertainty(value: unknown): JudgeUncertainty {
  return judgeUncertaintySchema.parse(value);
}

export function assertOracleSettlement(value: unknown): OracleSettlement {
  return oracleSettlementSchema.parse(value);
}

export function assertGmActionChecklist(value: unknown): GmActionChecklist {
  return gmActionChecklistSchema.parse(value);
}

export function assertCleanStage4Request(value: unknown): CleanStage4Request {
  return cleanStage4RequestSchema.parse(value);
}

export function assertCleanStage4Receipt(value: unknown): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse(value);
}

export function assertCleanStage4ExecutionResult(value: unknown): CleanStage4ExecutionResult {
  return cleanStage4ExecutionResultSchema.parse(value);
}

export function assertCleanSettledTurnPacket(value: unknown): CleanSettledTurnPacket {
  return cleanSettledTurnPacketSchema.parse(value);
}

export function assertCleanNarratorView(value: unknown): CleanNarratorView {
  return cleanNarratorViewSchema.parse(value);
}

export function assertCleanNarratorPromptInput(value: unknown): CleanNarratorPromptInput {
  return cleanNarratorPromptInputSchema.parse(value);
}

export function assertCleanNarrationCandidate(value: unknown): CleanNarrationCandidate {
  return cleanNarrationCandidateSchema.parse(value);
}

export function assertCleanNarrationResult(value: unknown): CleanNarrationResult {
  return cleanNarrationResultSchema.parse(value);
}

export function assertFrozenApiProjection(value: unknown): FrozenApiProjection {
  return frozenApiProjectionSchema.parse(value);
}

export function assertCleanPlayerFacingTurnRecord(value: unknown): CleanPlayerFacingTurnRecord {
  return cleanPlayerFacingTurnRecordSchema.parse(value);
}

export function assertCleanPlayerFacingTurnDoneBoundary(value: unknown): CleanPlayerFacingTurnDoneBoundary {
  return cleanPlayerFacingTurnDoneBoundarySchema.parse(value);
}
