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
export type FrozenApiProjection = z.infer<typeof frozenApiProjectionSchema>;

export function assertGameplayRuntimeTurnInput(value: unknown): GameplayRuntimeTurnInput {
  return gameplayRuntimeTurnInputSchema.parse(value);
}

export function assertAuthoritativeSceneFrame(value: unknown): AuthoritativeSceneFrame {
  return authoritativeSceneFrameSchema.parse(value);
}

export function assertFrozenApiProjection(value: unknown): FrozenApiProjection {
  return frozenApiProjectionSchema.parse(value);
}

