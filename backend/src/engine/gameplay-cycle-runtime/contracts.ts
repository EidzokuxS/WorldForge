import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const modelSafeRef = z.string().trim().min(1).max(200);

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

export const frozenApiProjectionSchema = z.object({
  version: z.literal("gameplay-runtime.frozen-api-projection.v1"),
  runtime: z.literal("gameplay-cycle-runtime"),
  campaignId: shortText,
  turnId: shortText,
  frameId: shortText,
  narrativeText: z.string().min(1).max(4000),
  mutationApplied: z.literal(false),
  settled: z.literal(true),
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
export type FrozenApiProjection = z.infer<typeof frozenApiProjectionSchema>;

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

export function assertFrozenApiProjection(value: unknown): FrozenApiProjection {
  return frozenApiProjectionSchema.parse(value);
}
