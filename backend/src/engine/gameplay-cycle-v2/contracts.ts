import { z } from "zod";
import type { SceneFrame } from "../scene-frame.js";
import type { ScopedForecastExcerpt } from "../world-forecast.js";

const idText = z.string().trim().min(1).max(180);
const proseText = z.string().trim().min(1).max(1_000);
const shortText = z.string().trim().min(1).max(320);
const timestampMs = z.number().int().nonnegative();
const worldVersion = z.number().int().nonnegative();
const tick = z.number().int().nonnegative();
const optionalNonEmptyString = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().min(1).max(max).optional(),
  );

export const GAMEPLAY_CYCLE_V2_FORBIDDEN_CORE_IMPORTS = [
  "gameplay-turn-cycle-v1",
  "runtime-tool-input-schemas",
  "runtime-tool-descriptors",
  "tool-contracts",
  "gm-tool-loop",
] as const;

export const gameplayCycleTransportRouteSchema = z.enum([
  "/api/chat/action",
  "/api/chat/retry",
  "/api/chat/resume",
]);

export const turnProviderSummarySchema = z.object({
  id: idText,
  model: idText,
  baseUrl: z.string().trim().max(500).optional(),
}).strict();

export const quickActionSelectionSummarySchema = z.object({
  handle: idText,
  offerId: idText,
  actionId: idText,
  baseWorldVersion: worldVersion,
}).strict();

export const preTurnSnapshotHandleSchema = z.object({
  bundleDir: z.string().trim().min(1),
  capturedAt: timestampMs,
}).strict();

export const turnStartEnvelopeSchema = z.object({
  version: z.literal("turn-start-envelope.v2"),
  route: gameplayCycleTransportRouteSchema,
  campaignId: idText,
  turnId: idText,
  playerAction: proseText,
  submittedPlayerAction: proseText.optional(),
  quickActionSelection: quickActionSelectionSummarySchema.nullable(),
  baseTick: tick,
  chatHistoryLengthBeforeTurn: z.number().int().nonnegative(),
  preTurnSnapshot: preTurnSnapshotHandleSchema,
  providers: z.object({
    judge: turnProviderSummarySchema,
    storyteller: turnProviderSummarySchema,
  }).strict(),
  startedAt: timestampMs,
}).strict();

export type TurnStartEnvelopeV2 = z.infer<typeof turnStartEnvelopeSchema>;

export const turnSettlementTerminalStateSchema = z.enum([
  "pre_settlement_restore",
  "pending_narration",
  "finalized_done",
  "transport_error_after_done",
]);

export const turnAttemptContextSchema = z.object({
  version: z.literal("turn-attempt-context.v2"),
  campaignId: idText,
  turnId: idText,
  playerAction: proseText,
  baseTick: tick,
  baseWorldVersion: worldVersion,
  chatHistoryLengthBeforeTurn: z.number().int().nonnegative(),
  preTurnSnapshot: preTurnSnapshotHandleSchema,
  idempotencyKey: idText,
  allowedTerminalStates: z
    .array(turnSettlementTerminalStateSchema)
    .min(3)
    .max(4),
  settlementPhase: z.enum([
    "pre_settlement",
    "settled_packet_persisted",
    "narration_projected",
  ]),
}).strict().superRefine((value, ctx) => {
  if (!value.allowedTerminalStates.includes("pre_settlement_restore")) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedTerminalStates"],
      message: "Turn attempt must allow pre-settlement restore.",
    });
  }
  if (!value.allowedTerminalStates.includes("pending_narration")) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedTerminalStates"],
      message: "Turn attempt must allow post-packet pending narration.",
    });
  }
  if (!value.allowedTerminalStates.includes("finalized_done")) {
    ctx.addIssue({
      code: "custom",
      path: ["allowedTerminalStates"],
      message: "Turn attempt must allow finalized done.",
    });
  }
});

export type TurnAttemptContextV2 = z.infer<typeof turnAttemptContextSchema>;

export const runtimeCapabilityIdSchema = z.enum([
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

export type RuntimeCapabilityIdV2 = z.infer<typeof runtimeCapabilityIdSchema>;

const backendRefPrefixPattern =
  /^(?:actor|campaign|event|faction|item|knowledge|location|movement|npc|player|route|scene|tool_result|world_version):/iu;
const uuidLikePattern =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/iu;
const legacyRuntimeToolNames = new Set([
  "move_to",
  "spawn_npc",
  "log_event",
  "add_chronicle_entry",
  "plannedTools",
  "candidateToolRequest",
  "toolName",
  "toolInput",
]);

function isBackendOnlyRef(value: string): boolean {
  return backendRefPrefixPattern.test(value) || uuidLikePattern.test(value);
}

function isLegacyToolSurface(value: string): boolean {
  return legacyRuntimeToolNames.has(value.trim());
}

const modelSafeRefSchema = idText.superRefine((value, ctx) => {
  if (isBackendOnlyRef(value)) {
    ctx.addIssue({
      code: "custom",
      message: "Model-facing gameplay refs must not expose backend-only refs or UUIDs.",
    });
  }
  if (isLegacyToolSurface(value)) {
    ctx.addIssue({
      code: "custom",
      message: "Gameplay-cycle-v2 contracts must not expose old runtime tool surfaces.",
    });
  }
});

export const sceneFrameRefSetSchema = z.object({
  visibleRefs: z.array(modelSafeRefSchema).max(200).default([]),
  privateGuardTerms: z.array(shortText).max(80).default([]),
  allowedCapabilityIds: z.array(runtimeCapabilityIdSchema).max(32).default([]),
}).strict();

export const sceneFrameEnvelopeSchema = z.object({
  version: z.literal("scene-frame-envelope.v2"),
  attempt: turnAttemptContextSchema,
  frame: z.custom<SceneFrame>((value) => Boolean(value) && typeof value === "object", {
    message: "SceneFrame adapter payload is required.",
  }),
  scopedForecastExcerpt: z.custom<ScopedForecastExcerpt | null>(() => true),
  refs: sceneFrameRefSetSchema,
}).strict().superRefine((value, ctx) => {
  const frame = value.frame as SceneFrame;
  if (frame.campaignId !== value.attempt.campaignId) {
    ctx.addIssue({
      code: "custom",
      path: ["frame", "campaignId"],
      message: "SceneFrame campaignId must match the turn attempt.",
    });
  }
  if (frame.tick !== value.attempt.baseTick) {
    ctx.addIssue({
      code: "custom",
      path: ["frame", "tick"],
      message: "SceneFrame tick must match the turn attempt base tick.",
    });
  }
  if (frame.worldVersion !== value.attempt.baseWorldVersion) {
    ctx.addIssue({
      code: "custom",
      path: ["frame", "worldVersion"],
      message: "SceneFrame worldVersion must match the turn attempt base world version.",
    });
  }
  if (frame.playerAction !== value.attempt.playerAction) {
    ctx.addIssue({
      code: "custom",
      path: ["frame", "playerAction"],
      message: "SceneFrame playerAction must be the canonical turn action.",
    });
  }
});

export type SceneFrameEnvelopeV2 = z.infer<typeof sceneFrameEnvelopeSchema>;

export const modelFacingCapabilitySchema = z.object({
  capabilityId: runtimeCapabilityIdSchema,
  purpose: shortText,
  evidenceAuthority: z.enum([
    "observation_only",
    "mutation_receipt_required",
    "terminal_receipt_required",
    "ui_only",
  ]),
}).strict();

export const modelFacingActorSchema = z.object({
  ref: modelSafeRefSchema,
  label: shortText,
  role: z.enum(["player", "active", "support", "background"]),
  awarenessHint: z.string().trim().max(320).nullable(),
  status: z.object({
    conditions: z.array(shortText).max(12),
    hp: z.number().int().min(0).max(5).nullable(),
  }).strict(),
}).strict();

export const modelFacingMovementOptionSchema = z.object({
  ref: modelSafeRefSchema,
  label: shortText,
  connected: z.boolean(),
  travelCost: z.number().int().nonnegative().nullable(),
}).strict();

export const modelFacingTargetSchema = z.object({
  ref: modelSafeRefSchema,
  label: shortText,
  kind: z.enum(["actor", "item", "location", "faction"]),
}).strict();

export const modelFacingInventoryItemSchema = z.object({
  ref: modelSafeRefSchema,
  label: shortText,
  equipState: z.enum(["carried", "equipped"]),
  tags: z.array(shortText).max(12),
}).strict();

export const modelFacingRecentEventSchema = z.object({
  summary: z.string().trim().min(1).max(500),
  tick,
  source: z.enum([
    "location_recent_event",
    "world_thread_signal",
    "committed_event",
    "tool_result",
    "chat_history",
  ]),
}).strict();

export const modelFacingForecastEntrySchema = z.object({
  ref: modelSafeRefSchema,
  horizonTicks: z.number().int().positive().max(10_000),
  pressure: z.string().trim().min(1).max(500),
  confidence: z.number().min(0).max(1),
}).strict();

export const modelFacingTurnPacketSchema = z.object({
  version: z.literal("model-facing-turn-packet.v2"),
  campaignId: idText,
  turnId: idText,
  playerAction: proseText,
  baseTick: tick,
  baseWorldVersion: worldVersion,
  scene: z.object({
    currentLocation: z.object({
      ref: modelSafeRefSchema.nullable(),
      label: z.string().trim().max(320).nullable(),
      description: z.string().trim().max(1_000).nullable(),
    }).strict(),
    currentScene: z.object({
      ref: modelSafeRefSchema.nullable(),
      label: z.string().trim().max(320).nullable(),
      description: z.string().trim().max(1_000).nullable(),
    }).strict(),
    actors: z.array(modelFacingActorSchema).max(24),
    movementOptions: z.array(modelFacingMovementOptionSchema).max(24),
    targets: z.array(modelFacingTargetSchema).max(32),
    inventory: z.array(modelFacingInventoryItemSchema).max(32),
    recentEvents: z.array(modelFacingRecentEventSchema).max(12),
  }).strict(),
  capabilities: z.array(modelFacingCapabilitySchema).max(32),
  forecast: z.object({
    advisoryOnly: z.literal(true),
    entries: z.array(modelFacingForecastEntrySchema).max(6),
  }).strict(),
  citableRefs: z.array(modelSafeRefSchema).max(240),
  runtimePrivateGuardTerms: z.array(shortText).max(80),
}).strict().superRefine((packet, ctx) => {
  for (const term of packet.runtimePrivateGuardTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;
    const publicText = JSON.stringify({
      playerAction: packet.playerAction,
      scene: packet.scene,
      capabilities: packet.capabilities,
      forecast: packet.forecast,
      citableRefs: packet.citableRefs,
    }).toLowerCase();
    if (publicText.includes(normalizedTerm)) {
      ctx.addIssue({
        code: "custom",
        path: ["runtimePrivateGuardTerms"],
        message: `Private guard term "${term}" leaked into model-facing public packet fields.`,
      });
    }
  }
});

export type ModelFacingTurnPacketV2 = z.infer<typeof modelFacingTurnPacketSchema>;

export const gmReadPathV2Schema = z.enum([
  "direct",
  "continue",
  "clarification",
  "roll_oracle",
  "tool_plan",
  "combat_transition",
]);

export type GmReadPathV2 = z.infer<typeof gmReadPathV2Schema>;

export const gmReadNoMutationPathV2Schema = z.enum([
  "direct",
  "continue",
  "clarification",
]);

export const gmReadTurnNeedV2Schema = z.enum([
  "none",
  "clarification_needed",
  "oracle_uncertainty",
  "backend_action_checklist",
  "combat_judge",
]);

export const gmReadActionInterpretationV2Schema = z.object({
  intent: z.string().trim().min(1).max(320),
  method: z.string().trim().min(1).max(320).nullable(),
  targetRefs: z.array(modelSafeRefSchema).max(8).default([]),
}).strict();

export const gmReadV2BaseSchema = z.object({
  version: z.literal("gm-read.v2"),
  path: gmReadPathV2Schema,
  situationSummary: z.string().trim().min(1).max(800),
  sceneQuestion: z.string().trim().min(1).max(400),
  focalActorRefs: z.array(modelSafeRefSchema).min(1).max(4),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
  actionInterpretation: gmReadActionInterpretationV2Schema,
  turnNeed: gmReadTurnNeedV2Schema,
  rationale: z.string().trim().min(1).max(800),
}).strict();

export const gmReadNoMutationV2Schema = gmReadV2BaseSchema.extend({
  path: gmReadNoMutationPathV2Schema,
  turnNeed: z.enum(["none", "clarification_needed"]),
  noMutationReason: z.string().trim().min(1).max(500),
  clarificationPrompt: optionalNonEmptyString(500),
}).strict().superRefine((read, ctx) => {
  if (read.path === "clarification" && !read.clarificationPrompt?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["clarificationPrompt"],
      message: "clarification path requires clarificationPrompt.",
    });
  }
  if (read.path !== "clarification" && read.turnNeed !== "none") {
    ctx.addIssue({
      code: "custom",
      path: ["turnNeed"],
      message: "direct/continue GM Read paths must not request runtime work.",
    });
  }
});

export type GmReadNoMutationV2 = z.infer<typeof gmReadNoMutationV2Schema>;

export const oracleUncertaintyKindV2Schema = z.enum([
  "physical_risk",
  "perception",
  "social_pressure",
  "opposition",
  "chance",
]);

export const gmReadOracleRequestV2Schema = z.object({
  question: z.string().trim().min(1).max(500),
  stakes: z.string().trim().min(1).max(500),
  outcomeMeanings: z.object({
    strong_hit: z.string().trim().min(1).max(500),
    weak_hit: z.string().trim().min(1).max(500),
    miss: z.string().trim().min(1).max(500),
  }).strict(),
  uncertaintyKind: oracleUncertaintyKindV2Schema,
  actorRef: modelSafeRefSchema,
  targetRefs: z.array(modelSafeRefSchema).max(6).default([]),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
}).strict();

export const gmReadOracleV2Schema = gmReadV2BaseSchema.extend({
  path: z.literal("roll_oracle"),
  turnNeed: z.literal("oracle_uncertainty"),
}).strict().superRefine((read, ctx) => {
  if (read.evidenceRefs.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "Oracle-intent GM Read must cite interpretation evidence refs.",
    });
  }
});

export type GmReadOracleV2 = z.infer<typeof gmReadOracleV2Schema>;

export const gmReadChecklistRequestV2Schema = z.object({
  turnPath: z.enum(["mutating", "procedural", "combat"]),
  requiredEffectKinds: z.array(z.enum([
    "movement",
    "dialogue_outcome",
    "world_fact",
    "entity_tag",
    "item_transfer",
    "condition",
    "time_advance",
    "quick_action_offer",
    "scene_beat",
    "location_reveal",
    "minor_poi_create",
    "support_actor_create",
    "route_check",
  ])).min(1).max(6),
  actorRefs: z.array(modelSafeRefSchema).min(1).max(4),
  targetRefs: z.array(modelSafeRefSchema).max(8).default([]),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
  checklistGoal: z.string().trim().min(1).max(500),
}).strict();

export const gmReadChecklistV2Schema = gmReadV2BaseSchema.extend({
  path: z.literal("tool_plan"),
  turnNeed: z.literal("backend_action_checklist"),
}).strict().superRefine((read, ctx) => {
  if (read.evidenceRefs.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "Checklist-intent GM Read must cite interpretation evidence refs.",
    });
  }
});

export type GmReadChecklistV2 = z.infer<typeof gmReadChecklistV2Schema>;

export const gmReadV2Schema = z.discriminatedUnion("path", [
  gmReadNoMutationV2Schema,
  gmReadOracleV2Schema,
  gmReadChecklistV2Schema,
]);

export type GmReadV2 = z.infer<typeof gmReadV2Schema>;

const gmReadCandidateV2LooseBaseSchema = z.object({
  version: z.literal("gm-read.v2"),
  situationSummary: z.string().trim().min(1).max(800).optional(),
  sceneQuestion: z.string().trim().min(1).max(400).optional(),
  focalActorRefs: z.array(modelSafeRefSchema).max(6).optional(),
  evidenceRefs: z.array(modelSafeRefSchema).max(16).optional(),
  actionInterpretation: gmReadActionInterpretationV2Schema.partial().passthrough().optional(),
  turnNeed: gmReadTurnNeedV2Schema.optional(),
  rationale: z.string().trim().min(1).max(800).optional(),
});

const gmReadCandidateV2LooseSidecars = {
  noMutationReason: z.string().trim().max(500).optional(),
  clarificationPrompt: z.string().trim().max(500).optional(),
};

export const gmReadCandidateV2LooseSchema: z.ZodType<unknown> = z.discriminatedUnion("path", [
  gmReadCandidateV2LooseBaseSchema.extend({
    path: gmReadNoMutationPathV2Schema,
    ...gmReadCandidateV2LooseSidecars,
  }).strict(),
  gmReadCandidateV2LooseBaseSchema.extend({
    path: z.literal("roll_oracle"),
  }).strict(),
  gmReadCandidateV2LooseBaseSchema.extend({
    path: z.literal("tool_plan"),
  }).strict(),
]);

export const oracleOutcomeTierV2Schema = z.enum([
  "strong_hit",
  "weak_hit",
  "miss",
]);

export const oracleAdapterResultV2Schema = z.object({
  chance: z.number().int().min(1).max(99),
  roll: z.number().int().min(1).max(100),
  outcome: oracleOutcomeTierV2Schema,
  reasoning: z.string().trim().min(1).max(700),
}).strict();

export const oracleSettlementV2Schema = z.object({
  version: z.literal("oracle-settlement.v2"),
  settlementId: idText,
  campaignId: idText,
  turnId: idText,
  request: gmReadOracleRequestV2Schema,
  result: oracleAdapterResultV2Schema,
  evidenceAuthority: z.literal("oracle_settlement"),
  mutationAuthority: z.literal("none"),
  narratorSummary: z.string().trim().min(1).max(700),
  visibleOutcome: z.object({
    outcome: oracleOutcomeTierV2Schema,
    question: z.string().trim().min(1).max(500),
    stakes: z.string().trim().min(1).max(500),
    selectedMeaning: z.string().trim().min(1).max(500),
  }).strict(),
}).strict().superRefine((settlement, ctx) => {
  if (settlement.visibleOutcome.outcome !== settlement.result.outcome) {
    ctx.addIssue({
      code: "custom",
      path: ["visibleOutcome", "outcome"],
      message: "Oracle visible outcome must match the backend result outcome.",
    });
  }
  if (settlement.visibleOutcome.question !== settlement.request.question) {
    ctx.addIssue({
      code: "custom",
      path: ["visibleOutcome", "question"],
      message: "Oracle visible question must match the accepted oracle request question.",
    });
  }
  if (settlement.visibleOutcome.stakes !== settlement.request.stakes) {
    ctx.addIssue({
      code: "custom",
      path: ["visibleOutcome", "stakes"],
      message: "Oracle visible stakes must match the accepted oracle request stakes.",
    });
  }
  if (
    settlement.visibleOutcome.selectedMeaning
    !== settlement.request.outcomeMeanings[settlement.result.outcome]
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["visibleOutcome", "selectedMeaning"],
      message: "Oracle selected meaning must match the accepted request meaning for the result tier.",
    });
  }
});

export type OracleSettlementV2 = z.infer<typeof oracleSettlementV2Schema>;

export const gmActionChecklistEffectKindV2Schema = z.enum([
  "movement",
  "dialogue_outcome",
  "world_fact",
  "entity_tag",
  "item_transfer",
  "condition",
  "time_advance",
  "quick_action_offer",
  "scene_beat",
  "location_reveal",
  "minor_poi_create",
  "support_actor_create",
  "route_check",
]);

export type GmActionChecklistEffectKindV2 = z.infer<typeof gmActionChecklistEffectKindV2Schema>;

export const gmJudgeLaneV2Schema = z.enum([
  "direct",
  "continue",
  "clarification",
  "roll_oracle",
  "action_checklist",
  "combat_transition",
]);

export type GmJudgeLaneV2 = z.infer<typeof gmJudgeLaneV2Schema>;

export const gmJudgePhysicalPossibilityV2Schema = z.enum([
  "possible",
  "impossible",
  "underspecified",
  "unsupported",
  "uncertain",
]);

export type GmJudgePhysicalPossibilityV2 =
  z.infer<typeof gmJudgePhysicalPossibilityV2Schema>;

export const gmJudgeCheckNeedV2Schema = z.enum([
  "no_check",
  "clarification_needed",
  "oracle_uncertainty",
  "backend_action_checklist",
  "combat_judge",
]);

export type GmJudgeCheckNeedV2 = z.infer<typeof gmJudgeCheckNeedV2Schema>;

export const gmJudgeChecklistAdmissionV2Schema = gmReadChecklistRequestV2Schema;

export type GmJudgeChecklistAdmissionV2 =
  z.infer<typeof gmJudgeChecklistAdmissionV2Schema>;

export const gmJudgeOracleAdmissionV2Schema = gmReadOracleRequestV2Schema.extend({
  postOracleRoute: z.enum([
    "settle_visible_outcome_only",
    "may_require_followup_checklist",
  ]).default("settle_visible_outcome_only"),
}).strict();

export type GmJudgeOracleAdmissionV2 =
  z.infer<typeof gmJudgeOracleAdmissionV2Schema>;

export const gmJudgeV2BaseSchema = z.object({
  version: z.literal("gm-judge.v2"),
  lane: gmJudgeLaneV2Schema,
  physicalPossibility: gmJudgePhysicalPossibilityV2Schema,
  checkNeed: gmJudgeCheckNeedV2Schema,
  actorRefs: z.array(modelSafeRefSchema).min(1).max(4),
  targetRefs: z.array(modelSafeRefSchema).max(8).default([]),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
  rationale: z.string().trim().min(1).max(800),
}).strict();

export const gmJudgeNoMutationV2Schema = gmJudgeV2BaseSchema.extend({
  lane: z.enum(["direct", "continue"]),
  physicalPossibility: z.literal("possible"),
  checkNeed: z.literal("no_check"),
  noMutationReason: z.string().trim().min(1).max(500),
}).strict();

export const gmJudgeClarificationV2Schema = gmJudgeV2BaseSchema.extend({
  lane: z.literal("clarification"),
  physicalPossibility: z.literal("underspecified"),
  checkNeed: z.literal("clarification_needed"),
  clarificationPrompt: z.string().trim().min(1).max(500),
}).strict();

export const gmJudgeOracleV2Schema = gmJudgeV2BaseSchema.extend({
  lane: z.literal("roll_oracle"),
  physicalPossibility: z.enum(["possible", "uncertain"]),
  checkNeed: z.literal("oracle_uncertainty"),
  oracleAdmission: gmJudgeOracleAdmissionV2Schema,
}).strict();

export const gmJudgeChecklistV2Schema = gmJudgeV2BaseSchema.extend({
  lane: z.literal("action_checklist"),
  physicalPossibility: z.literal("possible"),
  checkNeed: z.literal("backend_action_checklist"),
  checklistAdmission: gmJudgeChecklistAdmissionV2Schema,
}).strict();

export const gmJudgeCombatTransitionV2Schema = gmJudgeV2BaseSchema.extend({
  lane: z.literal("combat_transition"),
  physicalPossibility: z.literal("possible"),
  checkNeed: z.literal("combat_judge"),
  combatReason: z.string().trim().min(1).max(500),
}).strict();

export const gmJudgeV2Schema = z.discriminatedUnion("lane", [
  gmJudgeNoMutationV2Schema,
  gmJudgeClarificationV2Schema,
  gmJudgeOracleV2Schema,
  gmJudgeChecklistV2Schema,
  gmJudgeCombatTransitionV2Schema,
]);

export type GmJudgeV2 = z.infer<typeof gmJudgeV2Schema>;

export type GmJudgeNoMutationV2 = z.infer<typeof gmJudgeNoMutationV2Schema>;
export type GmJudgeClarificationV2 = z.infer<typeof gmJudgeClarificationV2Schema>;
export type GmJudgeOracleV2 = z.infer<typeof gmJudgeOracleV2Schema>;
export type GmJudgeChecklistV2 = z.infer<typeof gmJudgeChecklistV2Schema>;

export const publicGmJudgeProjectionV2Schema = z.object({
  version: z.literal("public-gm-judge-projection.v2"),
  lane: gmJudgeLaneV2Schema,
  physicalPossibility: gmJudgePhysicalPossibilityV2Schema,
  checkNeed: gmJudgeCheckNeedV2Schema,
  actorRefs: z.array(modelSafeRefSchema).min(1).max(4),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
  targetRefs: z.array(modelSafeRefSchema).max(8).default([]),
  requiredEffectKinds: z.array(gmActionChecklistEffectKindV2Schema).max(6).default([]),
  settlementBasis: z.enum([
    "scene_frame",
    "gm_judge_direct",
    "gm_judge_continue",
    "gm_judge_clarification",
    "oracle_settlement",
    "runtime_receipts",
    "combat_transition",
  ]),
}).strict();

export type PublicGmJudgeProjectionV2 =
  z.infer<typeof publicGmJudgeProjectionV2Schema>;

export const publicGmReadProjectionV2Schema = z.object({
  version: z.literal("public-gm-read-projection.v2"),
  path: gmReadPathV2Schema,
  turnNeed: gmReadTurnNeedV2Schema,
  focalActorRefs: z.array(modelSafeRefSchema).min(1).max(4),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
  targetRefs: z.array(modelSafeRefSchema).max(8).default([]),
  requiredEffectKinds: z.array(gmActionChecklistEffectKindV2Schema).max(6).default([]),
  settlementBasis: z.enum([
    "scene_frame",
    "gm_read_direct",
    "gm_read_continue",
    "gm_read_clarification",
    "oracle_settlement",
    "runtime_receipts",
  ]),
}).strict();

export type PublicGmReadProjectionV2 =
  z.infer<typeof publicGmReadProjectionV2Schema>;

export const gmActionChecklistStepIdV2Schema = z.string().regex(/^step-[1-9][0-9]*$/u);

export const gmActionChecklistStepV2Schema = z.object({
  stepId: gmActionChecklistStepIdV2Schema,
  purpose: z.string().trim().min(1).max(500),
  actorRef: modelSafeRefSchema,
  targetRefs: z.array(modelSafeRefSchema).max(8).default([]),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
  requiredCapabilityId: runtimeCapabilityIdSchema,
  intendedEffect: z.object({
    kind: gmActionChecklistEffectKindV2Schema,
    summary: z.string().trim().min(1).max(500),
    stateScope: z.enum(["local_scene", "actor", "item", "location", "knowledge", "world", "ui"]),
  }).strict(),
  expectedVisibleEffect: z.string().trim().min(1).max(500),
  dependsOnStepIds: z.array(gmActionChecklistStepIdV2Schema).max(5).default([]),
}).strict();

export type GmActionChecklistStepV2 = z.infer<typeof gmActionChecklistStepV2Schema>;

export const gmActionChecklistV2Schema = z.object({
  version: z.literal("gm-action-checklist.v2"),
  checklistId: idText,
  campaignId: idText,
  turnId: idText,
  baseWorldVersion: worldVersion,
  sourceGmReadPath: z.enum(["tool_plan", "combat_transition"]),
  turnPath: z.enum(["mutating", "procedural", "combat"]),
  turnIntent: z.string().trim().min(1).max(500),
  steps: z.array(gmActionChecklistStepV2Schema).min(1).max(6),
}).strict().superRefine((checklist, ctx) => {
  const seen = new Set<string>();
  checklist.steps.forEach((step, index) => {
    if (seen.has(step.stepId)) {
      ctx.addIssue({
        code: "custom",
        path: ["steps", index, "stepId"],
        message: `Duplicate checklist stepId ${step.stepId}.`,
      });
    }
    for (const dependency of step.dependsOnStepIds) {
      if (!seen.has(dependency)) {
        ctx.addIssue({
          code: "custom",
          path: ["steps", index, "dependsOnStepIds"],
          message: `Checklist dependency ${dependency} must refer to an earlier step.`,
        });
      }
    }
    seen.add(step.stepId);
  });
});

export type GmActionChecklistV2 = z.infer<typeof gmActionChecklistV2Schema>;

export const gameplayToolIdV2Schema = z.enum([
  "route.check.v2",
  "actor.move.v2",
  "dialogue.record.v2",
  "world_fact.record.v2",
  "support_actor.create.v2",
  "entity.tag.v2",
  "item.transfer.v2",
  "actor.condition_set.v2",
  "time.advance.v2",
  "scene_beat.record.v2",
  "location.reveal.v2",
  "minor_poi.create.v2",
]);

export type GameplayToolIdV2 = z.infer<typeof gameplayToolIdV2Schema>;

const gameplayToolRequestBaseV2Shape = {
  version: z.literal("gameplay-tool-request.v2"),
  requestId: idText,
  stepId: gmActionChecklistStepIdV2Schema,
};

const toolEvidenceRefsSchema = z.array(modelSafeRefSchema).min(1).max(12);
const actorConditionLabelV2Schema = z.enum([
  "bleeding",
  "burned",
  "exhausted",
  "injured",
  "poisoned",
  "prone",
  "sick",
  "starving",
  "wounded",
]);
const actorConditionSourceAuthorityV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("current_scene_visible_evidence"),
    sourceRefs: z.array(modelSafeRefSchema).min(1).max(8),
    sourceSummary: shortText,
  }).strict(),
  z.object({
    kind: z.literal("accepted_runtime_receipt"),
    sourceReceiptIds: z.array(idText).min(1).max(4),
    sourceSummary: shortText,
  }).strict(),
]);

const routeCheckRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("route_check"),
  toolId: z.literal("route.check.v2"),
  effectBinding: z.object({
    actorRef: modelSafeRefSchema,
    destinationRef: modelSafeRefSchema,
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const actorMoveRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("movement"),
  toolId: z.literal("actor.move.v2"),
  effectBinding: z.object({
    actorRef: modelSafeRefSchema,
    destinationRef: modelSafeRefSchema,
    travelMode: z.enum(["walk", "careful", "quick"]).default("walk"),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const dialogueRecordRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("dialogue_record"),
  toolId: z.literal("dialogue.record.v2"),
  effectBinding: z.object({
    speakerRef: modelSafeRefSchema,
    addresseeRefs: z.array(modelSafeRefSchema).max(6).default([]),
    outcomeKind: z.enum(["answer", "refusal", "warning", "redirect", "silence", "other"]),
    summary: z.string().trim().min(1).max(700),
    quotedSpeech: optionalNonEmptyString(700),
    languageBasis: z.object({
      responseLanguage: z.literal("match_player_action"),
      sourceField: z.literal("playerAction"),
    }).strict(),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict().superRefine((request, ctx) => {
  const outcomeKind = request.effectBinding.outcomeKind;
  const quotedSpeech = request.effectBinding.quotedSpeech?.trim();
  if (outcomeKind === "silence") {
    if (quotedSpeech) {
      ctx.addIssue({
        code: "custom",
        path: ["effectBinding", "quotedSpeech"],
        message: "Silence dialogue outcomes must not include quotedSpeech.",
      });
    }
    return;
  }
  if (!quotedSpeech) {
    ctx.addIssue({
      code: "custom",
      path: ["effectBinding", "quotedSpeech"],
      message: "Non-silence dialogue outcomes require quotedSpeech so the terminal receipt records the visible response content.",
    });
  }
});

const worldFactRecordRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("world_fact_record"),
  toolId: z.literal("world_fact.record.v2"),
  effectBinding: z.object({
    knowledgeOwnerRef: z.literal("Player"),
    subjectRefs: z.array(modelSafeRefSchema).min(1).max(8),
    statement: z.string().trim().min(1).max(900),
    summary: z.string().trim().min(1).max(700),
    truthStatus: z.enum(["observed", "reported", "claimed", "verified", "disputed"]),
    futureUseKind: z.enum(["memory", "evidence", "procedure", "route_hint", "other"]),
    source: z.object({
      sourceKind: z.enum(["accepted_dialogue_receipt", "accepted_runtime_receipt"]),
      sourceReceiptIds: z.array(idText).min(1).max(4),
      sourceQuote: optionalNonEmptyString(700),
      sourceSummary: z.string().trim().min(1).max(700),
    }).strict(),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict().superRefine((request, ctx) => {
  const source = request.effectBinding.source;
  if (source.sourceKind === "accepted_dialogue_receipt" && !source.sourceQuote?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["effectBinding", "source", "sourceQuote"],
      message: "Dialogue-sourced player-known knowledge requires the accepted dialogue quote.",
    });
  }
});

const supportActorTagV2Schema = z.string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9][a-z0-9_-]*$/u);

const supportActorCreateRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("support_actor_create"),
  toolId: z.literal("support_actor.create.v2"),
  effectBinding: z.object({
    anchorScope: z.literal("current_scene"),
    anchorRef: modelSafeRefSchema,
    roleKind: z.enum([
      "attendant",
      "bystander",
      "clerk",
      "courier",
      "crowd_voice",
      "dockhand",
      "guard",
      "guide",
      "helper",
      "laborer",
      "porter",
      "vendor",
      "witness",
    ]),
    roleLabel: shortText,
    displayName: optionalNonEmptyString(80),
    persona: z.object({
      publicSummary: z.string().trim().min(1).max(240),
      visibleCue: optionalNonEmptyString(160),
      voiceHint: optionalNonEmptyString(160),
    }).strict(),
    tags: z.array(supportActorTagV2Schema).max(6).default([]),
    identityBounds: z.object({
      tier: z.literal("temporary"),
      persistence: z.literal("current_scene"),
      significance: z.literal("minor_support"),
      agency: z.literal("reactive_only"),
      mayBecomePersistentHere: z.literal(false),
    }).strict(),
    reason: z.string().trim().min(1).max(500),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const entityTagRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("entity_tag"),
  toolId: z.literal("entity.tag.v2"),
  effectBinding: z.object({
    entityScope: z.enum([
      "player_actor",
      "visible_actor",
      "current_location",
      "current_scene",
      "visible_item",
      "visible_location",
      "inventory_item",
    ]),
    entityRef: modelSafeRefSchema,
    operation: z.enum(["add", "remove"]),
    tag: shortText,
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const itemTransferRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("item_transfer"),
  toolId: z.literal("item.transfer.v2"),
  effectBinding: z.object({
    action: z.enum([
      "give_to_visible_actor",
      "drop_to_current_scene",
      "place_at_visible_location",
      "take_to_player_inventory",
      "equip_player_item",
      "unequip_player_item",
    ]),
    itemScope: z.enum(["player_inventory_item", "visible_scene_item"]),
    itemRef: modelSafeRefSchema,
    sourceScope: z.enum(["player_inventory", "current_scene", "visible_location"]),
    sourceRef: modelSafeRefSchema,
    targetScope: z.enum([
      "player_inventory",
      "visible_actor_inventory",
      "current_scene",
      "visible_location",
    ]),
    targetRef: modelSafeRefSchema,
    equip: z.discriminatedUnion("mode", [
      z.object({ mode: z.literal("unchanged") }).strict(),
      z.object({ mode: z.literal("carried") }).strict(),
      z.object({
        mode: z.literal("equipped"),
        slot: z.string().trim().min(1).max(80),
      }).strict(),
      z.object({ mode: z.literal("unequipped") }).strict(),
    ]).default({ mode: "unchanged" }),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict().superRefine((request, ctx) => {
  const binding = request.effectBinding;
  const addIssue = (message: string, path: Array<string | number> = ["effectBinding"]) => {
    ctx.addIssue({ code: "custom", path, message });
  };
  switch (binding.action) {
    case "give_to_visible_actor":
      if (binding.itemScope !== "player_inventory_item") addIssue("give_to_visible_actor requires itemScope=player_inventory_item.", ["effectBinding", "itemScope"]);
      if (binding.sourceScope !== "player_inventory") addIssue("give_to_visible_actor requires sourceScope=player_inventory.", ["effectBinding", "sourceScope"]);
      if (binding.sourceRef !== "Player") addIssue("give_to_visible_actor requires sourceRef=Player.", ["effectBinding", "sourceRef"]);
      if (binding.targetScope !== "visible_actor_inventory") addIssue("give_to_visible_actor requires targetScope=visible_actor_inventory.", ["effectBinding", "targetScope"]);
      if (binding.equip.mode === "equipped") addIssue("give_to_visible_actor cannot equip the transferred item.", ["effectBinding", "equip"]);
      break;
    case "drop_to_current_scene":
      if (binding.itemScope !== "player_inventory_item") addIssue("drop_to_current_scene requires itemScope=player_inventory_item.", ["effectBinding", "itemScope"]);
      if (binding.sourceScope !== "player_inventory") addIssue("drop_to_current_scene requires sourceScope=player_inventory.", ["effectBinding", "sourceScope"]);
      if (binding.sourceRef !== "Player") addIssue("drop_to_current_scene requires sourceRef=Player.", ["effectBinding", "sourceRef"]);
      if (binding.targetScope !== "current_scene") addIssue("drop_to_current_scene requires targetScope=current_scene.", ["effectBinding", "targetScope"]);
      if (binding.equip.mode === "equipped") addIssue("drop_to_current_scene cannot equip the transferred item.", ["effectBinding", "equip"]);
      break;
    case "place_at_visible_location":
      if (binding.itemScope !== "player_inventory_item") addIssue("place_at_visible_location requires itemScope=player_inventory_item.", ["effectBinding", "itemScope"]);
      if (binding.sourceScope !== "player_inventory") addIssue("place_at_visible_location requires sourceScope=player_inventory.", ["effectBinding", "sourceScope"]);
      if (binding.sourceRef !== "Player") addIssue("place_at_visible_location requires sourceRef=Player.", ["effectBinding", "sourceRef"]);
      if (binding.targetScope !== "visible_location") addIssue("place_at_visible_location requires targetScope=visible_location.", ["effectBinding", "targetScope"]);
      if (binding.equip.mode === "equipped") addIssue("place_at_visible_location cannot equip the transferred item.", ["effectBinding", "equip"]);
      break;
    case "take_to_player_inventory":
      if (binding.itemScope !== "visible_scene_item") addIssue("take_to_player_inventory requires itemScope=visible_scene_item.", ["effectBinding", "itemScope"]);
      if (binding.sourceScope !== "current_scene" && binding.sourceScope !== "visible_location") addIssue("take_to_player_inventory requires a current_scene or visible_location source.", ["effectBinding", "sourceScope"]);
      if (binding.targetScope !== "player_inventory") addIssue("take_to_player_inventory requires targetScope=player_inventory.", ["effectBinding", "targetScope"]);
      if (binding.targetRef !== "Player") addIssue("take_to_player_inventory requires targetRef=Player.", ["effectBinding", "targetRef"]);
      if (binding.equip.mode === "unequipped") addIssue("take_to_player_inventory cannot use equip.mode=unequipped.", ["effectBinding", "equip"]);
      break;
    case "equip_player_item":
      if (binding.itemScope !== "player_inventory_item") addIssue("equip_player_item requires itemScope=player_inventory_item.", ["effectBinding", "itemScope"]);
      if (binding.sourceScope !== "player_inventory" || binding.targetScope !== "player_inventory") addIssue("equip_player_item must stay within player inventory.");
      if (binding.sourceRef !== "Player" || binding.targetRef !== "Player") addIssue("equip_player_item requires Player source and target refs.");
      if (binding.equip.mode !== "equipped") addIssue("equip_player_item requires equip.mode=equipped.", ["effectBinding", "equip"]);
      break;
    case "unequip_player_item":
      if (binding.itemScope !== "player_inventory_item") addIssue("unequip_player_item requires itemScope=player_inventory_item.", ["effectBinding", "itemScope"]);
      if (binding.sourceScope !== "player_inventory" || binding.targetScope !== "player_inventory") addIssue("unequip_player_item must stay within player inventory.");
      if (binding.sourceRef !== "Player" || binding.targetRef !== "Player") addIssue("unequip_player_item requires Player source and target refs.");
      if (binding.equip.mode !== "unequipped" && binding.equip.mode !== "carried") addIssue("unequip_player_item requires equip.mode=unequipped or carried.", ["effectBinding", "equip"]);
      break;
  }
});

const actorConditionSetRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("condition_set"),
  toolId: z.literal("actor.condition_set.v2"),
  effectBinding: z.object({
    actorRef: modelSafeRefSchema,
    actorScope: z.enum(["player_actor", "visible_actor"]),
    operation: z.discriminatedUnion("kind", [
      z.object({
        kind: z.literal("set_condition"),
        conditionLabel: actorConditionLabelV2Schema,
      }).strict(),
      z.object({
        kind: z.literal("clear_condition"),
        conditionLabel: actorConditionLabelV2Schema,
      }).strict(),
      z.object({
        kind: z.literal("adjust_player_hp"),
        hpDelta: z.union([z.literal(-1), z.literal(1)]),
      }).strict(),
    ]),
    sourceAuthority: actorConditionSourceAuthorityV2Schema,
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const timeAdvanceReasonKindV2Schema = z.enum([
  "wait",
  "watch",
  "rest",
  "work",
  "other_elapsed_time",
]);

const timeAdvanceSourceAuthorityV2Schema = z.object({
  kind: z.literal("explicit_player_elapsed_time_intent"),
  actorRef: z.literal("Player"),
  anchorRef: modelSafeRefSchema,
  sourceSummary: shortText,
}).strict();

const timeAdvanceEffectBindingV2Schema = z.object({
  actorRef: z.literal("Player"),
  anchorScope: z.literal("current_scene"),
  anchorRef: modelSafeRefSchema,
  reasonKind: timeAdvanceReasonKindV2Schema,
  elapsedMinutes: z.number().int().min(1).max(240),
  sourceAuthority: timeAdvanceSourceAuthorityV2Schema,
  evidenceRefs: toolEvidenceRefsSchema,
}).strict().superRefine((binding, ctx) => {
  if (binding.sourceAuthority.anchorRef !== binding.anchorRef) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceAuthority", "anchorRef"],
      message: "time.advance.v2 sourceAuthority.anchorRef must match anchorRef.",
    });
  }
  const evidenceRefs = new Set(binding.evidenceRefs.map((ref) => ref.toLowerCase()));
  if (!evidenceRefs.has("player")) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "time.advance.v2 evidenceRefs must cite Player.",
    });
  }
  if (!evidenceRefs.has(binding.anchorRef.toLowerCase())) {
    ctx.addIssue({
      code: "custom",
      path: ["evidenceRefs"],
      message: "time.advance.v2 evidenceRefs must cite anchorRef.",
    });
  }
});

const timeAdvanceRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("time_advance"),
  toolId: z.literal("time.advance.v2"),
  effectBinding: timeAdvanceEffectBindingV2Schema,
}).strict();

const sceneBeatRecordRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("scene_beat_record"),
  toolId: z.literal("scene_beat.record.v2"),
  effectBinding: z.object({
    actorRef: modelSafeRefSchema,
    summary: z.string().trim().min(1).max(700),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const locationRevealSourceAuthorityV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("current_scene_visible_evidence"),
    sourceRefs: z.array(modelSafeRefSchema).min(1).max(8),
    sourceSummary: shortText,
  }).strict(),
  z.object({
    kind: z.literal("accepted_runtime_receipt"),
    sourceReceiptIds: z.array(idText).min(1).max(4),
    sourceSummary: shortText,
  }).strict(),
]);

const locationRevealRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("location_reveal"),
  toolId: z.literal("location.reveal.v2"),
  effectBinding: z.object({
    anchorScope: z.literal("current_scene"),
    anchorRef: modelSafeRefSchema,
    revealMode: z.enum(["create_visible_place_handle", "expose_existing_place_handle"]),
    placeHandleKind: z.enum([
      "entrance",
      "service_window",
      "alcove",
      "stall",
      "counter",
      "doorway",
      "local_area",
      "landmark",
      "other_visible_place",
    ]),
    locationLabel: shortText,
    visibleDescription: optionalNonEmptyString(320),
    sourceAuthority: locationRevealSourceAuthorityV2Schema,
    exposure: z.object({
      targetKind: z.literal("location"),
      visibleCurrentSceneTarget: z.literal(true),
      movementCandidate: z.literal(false),
      routeEdgeCreated: z.literal(false),
      currentSceneChanged: z.literal(false),
      absenceProof: z.literal(false),
      hiddenDiscovery: z.literal(false),
      itemCreated: z.literal(false),
      actorCreated: z.literal(false),
      worldFactCreated: z.literal(false),
    }).strict(),
    reason: z.string().trim().min(1).max(500),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const minorPoiCreateRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("minor_poi_create"),
  toolId: z.literal("minor_poi.create.v2"),
  effectBinding: z.object({
    anchorScope: z.literal("current_scene"),
    anchorRef: modelSafeRefSchema,
    poiLabel: shortText,
    purpose: z.string().trim().min(1).max(500),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

export const gameplayToolRequestV2Schema = z.discriminatedUnion("toolId", [
  routeCheckRequestV2Schema,
  actorMoveRequestV2Schema,
  dialogueRecordRequestV2Schema,
  worldFactRecordRequestV2Schema,
  supportActorCreateRequestV2Schema,
  entityTagRequestV2Schema,
  itemTransferRequestV2Schema,
  actorConditionSetRequestV2Schema,
  timeAdvanceRequestV2Schema,
  sceneBeatRecordRequestV2Schema,
  locationRevealRequestV2Schema,
  minorPoiCreateRequestV2Schema,
]);

export type GameplayToolRequestV2 = z.infer<typeof gameplayToolRequestV2Schema>;

export const gameplayRuntimeReceiptStatusV2Schema = z.enum([
  "accepted",
  "rejected",
  "failed",
]);

export const gameplayRuntimeReceiptEvidenceAuthorityV2Schema = z.enum([
  "observation_only",
  "mutation_receipt",
  "terminal_receipt",
]);

export const gameplayRuntimeMutationAuthorityV2Schema = z.enum([
  "none",
  "local_scene",
  "actor",
  "item",
  "knowledge",
  "location",
  "world",
  "ui",
]);

export const gameplayRuntimeReceiptSourceV2Schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("gm_action_checklist"),
    checklistId: idText,
    stepId: gmActionChecklistStepIdV2Schema,
  }).strict(),
  z.object({
    kind: z.literal("local_consequence_schedule"),
    scheduleId: idText,
    consequenceId: idText,
    triggerReceiptId: idText,
  }).strict(),
]);

export type GameplayRuntimeReceiptSourceV2 = z.infer<typeof gameplayRuntimeReceiptSourceV2Schema>;

export const gameplayRuntimeReceiptV2Schema = z.object({
  version: z.literal("gameplay-runtime-receipt.v2"),
  receiptId: idText,
  requestId: idText,
  stepId: gmActionChecklistStepIdV2Schema,
  source: gameplayRuntimeReceiptSourceV2Schema,
  capabilityId: runtimeCapabilityIdSchema.nullable(),
  toolId: gameplayToolIdV2Schema.nullable(),
  status: gameplayRuntimeReceiptStatusV2Schema,
  evidenceAuthority: gameplayRuntimeReceiptEvidenceAuthorityV2Schema,
  mutationAuthority: gameplayRuntimeMutationAuthorityV2Schema,
  mutationApplied: z.boolean(),
  baseWorldVersion: worldVersion,
  resultWorldVersion: worldVersion,
  visibleSummary: z.string().trim().min(1).max(700),
  evidenceRefs: z.array(modelSafeRefSchema).max(12).default([]),
  durableEventIds: z.array(idText).max(12).default([]),
  failureReason: optionalNonEmptyString(700),
  emittedAt: timestampMs,
}).strict().superRefine((receipt, ctx) => {
  if (
    receipt.source.kind === "gm_action_checklist"
    && receipt.source.stepId !== receipt.stepId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["source", "stepId"],
      message: "GM action checklist receipt source stepId must match receipt stepId.",
    });
  }
  if (
    receipt.source.kind === "local_consequence_schedule"
    && receipt.source.triggerReceiptId === receipt.receiptId
  ) {
    ctx.addIssue({
      code: "custom",
      path: ["source", "triggerReceiptId"],
      message: "Local consequence receipt cannot trigger itself.",
    });
  }
  if (receipt.status === "accepted") {
    if (!receipt.capabilityId || !receipt.toolId) {
      ctx.addIssue({
        code: "custom",
        path: ["toolId"],
        message: "Accepted runtime receipts require a capabilityId and toolId.",
      });
    }
    if (receipt.failureReason) {
      ctx.addIssue({
        code: "custom",
        path: ["failureReason"],
        message: "Accepted runtime receipts must not include failureReason.",
      });
    }
  } else if (!receipt.failureReason) {
    ctx.addIssue({
      code: "custom",
      path: ["failureReason"],
      message: "Rejected or failed runtime receipts require failureReason.",
    });
  }
  if (receipt.resultWorldVersion < receipt.baseWorldVersion) {
    ctx.addIssue({
      code: "custom",
      path: ["resultWorldVersion"],
      message: "Runtime receipt resultWorldVersion cannot precede baseWorldVersion.",
    });
  }
  if (receipt.mutationApplied) {
    if (receipt.status !== "accepted") {
      ctx.addIssue({
        code: "custom",
        path: ["mutationApplied"],
        message: "Only accepted runtime receipts can apply mutation.",
      });
    }
    if (receipt.evidenceAuthority !== "mutation_receipt") {
      ctx.addIssue({
        code: "custom",
        path: ["evidenceAuthority"],
        message: "Applied mutation requires mutation_receipt evidence authority.",
      });
    }
    if (receipt.mutationAuthority === "none") {
      ctx.addIssue({
        code: "custom",
        path: ["mutationAuthority"],
        message: "Applied mutation requires explicit mutation authority.",
      });
    }
    if (receipt.resultWorldVersion <= receipt.baseWorldVersion) {
      ctx.addIssue({
        code: "custom",
        path: ["resultWorldVersion"],
        message: "Applied mutation must advance resultWorldVersion.",
      });
    }
  } else {
    if (receipt.mutationAuthority !== "none") {
      ctx.addIssue({
        code: "custom",
        path: ["mutationAuthority"],
        message: "Non-mutating receipts must use mutationAuthority=none.",
      });
    }
    if (receipt.resultWorldVersion !== receipt.baseWorldVersion) {
      ctx.addIssue({
        code: "custom",
        path: ["resultWorldVersion"],
        message: "Non-mutating receipts must not advance world version.",
      });
    }
  }
  if (receipt.status !== "accepted" && receipt.durableEventIds.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["durableEventIds"],
      message: "Rejected or failed receipts must not carry accepted durable event ids.",
    });
  }
});

export type GameplayRuntimeReceiptV2 = z.infer<typeof gameplayRuntimeReceiptV2Schema>;

export const gameplayRuntimeReceiptLedgerV2Schema = z.object({
  version: z.literal("gameplay-runtime-receipt-ledger.v2"),
  ledgerId: idText,
  campaignId: idText,
  turnId: idText,
  checklistId: idText,
  baseWorldVersion: worldVersion,
  receipts: z.array(gameplayRuntimeReceiptV2Schema).min(1).max(40),
}).strict().superRefine((ledger, ctx) => {
  const seenReceiptIds = new Set<string>();
  let chainHeadWorldVersion = ledger.baseWorldVersion;
  for (const [index, receipt] of ledger.receipts.entries()) {
    if (seenReceiptIds.has(receipt.receiptId)) {
      ctx.addIssue({
        code: "custom",
        path: ["receipts", index, "receiptId"],
        message: `Duplicate runtime receipt id ${receipt.receiptId}.`,
      });
    }
    seenReceiptIds.add(receipt.receiptId);
    if (receipt.baseWorldVersion !== chainHeadWorldVersion) {
      ctx.addIssue({
        code: "custom",
        path: ["receipts", index, "baseWorldVersion"],
        message: "Runtime receipt baseWorldVersion must equal the current ledger chain head.",
      });
    }
    chainHeadWorldVersion = receipt.mutationApplied
      ? receipt.resultWorldVersion
      : chainHeadWorldVersion;
  }
});

export type GameplayRuntimeReceiptLedgerV2 = z.infer<typeof gameplayRuntimeReceiptLedgerV2Schema>;

export const settledEvidenceAuthorityV2Schema = z.enum([
  "scene_frame",
  "gm_read_direct",
  "gm_read_continue",
  "gm_read_clarification",
  "oracle_settlement",
  "runtime_receipt",
]);

export const settledEvidenceKindV2Schema = z.enum([
  "scene_status",
  "visible_actor",
  "movement_option",
  "visible_object",
  "inventory_item",
  "recent_visible_event",
  "direct_resolution",
  "clarification_request",
  "oracle_outcome",
  "runtime_receipt",
]);

export const settledEvidenceV2Schema = z.object({
  evidenceId: idText,
  kind: settledEvidenceKindV2Schema,
  authority: settledEvidenceAuthorityV2Schema,
  text: z.string().trim().min(1).max(700),
  sourceRefs: z.array(modelSafeRefSchema).max(12).default([]),
  sourceReceiptId: idText.optional(),
  sourceToolId: gameplayToolIdV2Schema.optional(),
}).strict().superRefine((evidence, ctx) => {
  if (evidence.authority === "runtime_receipt" && !evidence.sourceReceiptId) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceReceiptId"],
      message: "Runtime receipt evidence requires sourceReceiptId.",
    });
  }
  if (evidence.authority !== "runtime_receipt" && evidence.sourceReceiptId) {
    ctx.addIssue({
      code: "custom",
      path: ["sourceReceiptId"],
      message: "Only runtime receipt evidence may carry sourceReceiptId.",
    });
  }
  if (evidence.sourceToolId && evidence.authority !== "runtime_receipt") {
    ctx.addIssue({
      code: "custom",
      path: ["sourceToolId"],
      message: "Only runtime receipt evidence may carry sourceToolId.",
    });
  }
});

export type SettledEvidenceV2 = z.infer<typeof settledEvidenceV2Schema>;

export const settledStepAuditV2Schema = z.object({
  stage: z.string().trim().min(1).max(120),
  reason: z.string().trim().min(1).max(500),
  evidenceIds: z.array(idText).max(12).default([]),
}).strict();

export type SettledStepAuditV2 = z.infer<typeof settledStepAuditV2Schema>;

export const localConsequenceRouteV2Schema = z.enum([
  "none",
  "required_before_packet",
  "deferred_audit",
]);

export const localConsequenceScheduleEntryV2Schema = z.object({
  consequenceId: idText,
  route: z.enum(["required_before_packet", "deferred_audit"]),
  actorRef: modelSafeRefSchema,
  triggerReceiptId: idText,
  reason: z.string().trim().min(1).max(500),
  requiredCapabilityId: z.enum(["scene_beat_record", "dialogue_record"]),
  intendedEffectKind: z.enum(["scene_beat", "dialogue_outcome"]),
  evidenceRefs: z.array(modelSafeRefSchema).min(1).max(12),
}).strict().superRefine((entry, ctx) => {
  if (entry.requiredCapabilityId === "scene_beat_record" && entry.intendedEffectKind !== "scene_beat") {
    ctx.addIssue({
      code: "custom",
      path: ["intendedEffectKind"],
      message: "scene_beat_record local consequences must use scene_beat effect kind.",
    });
  }
  if (entry.requiredCapabilityId === "dialogue_record" && entry.intendedEffectKind !== "dialogue_outcome") {
    ctx.addIssue({
      code: "custom",
      path: ["intendedEffectKind"],
      message: "dialogue_record local consequences must use dialogue_outcome effect kind.",
    });
  }
});

export type LocalConsequenceScheduleEntryV2 = z.infer<typeof localConsequenceScheduleEntryV2Schema>;

export const localConsequenceScheduleV2Schema = z.object({
  version: z.literal("local-consequence-schedule.v2"),
  scheduleId: idText,
  campaignId: idText,
  turnId: idText,
  baseWorldVersion: worldVersion,
  frameWorldVersion: worldVersion,
  route: localConsequenceRouteV2Schema,
  triggerReceiptIds: z.array(idText).max(20).default([]),
  entries: z.array(localConsequenceScheduleEntryV2Schema).max(12).default([]),
  skipped: z.array(settledStepAuditV2Schema).max(20).default([]),
}).strict().superRefine((schedule, ctx) => {
  if (schedule.route === "none" && (schedule.entries.length > 0 || schedule.triggerReceiptIds.length > 0)) {
    ctx.addIssue({
      code: "custom",
      path: ["route"],
      message: "route=none cannot carry local consequence entries or trigger receipts.",
    });
  }
  if (schedule.route === "required_before_packet") {
    if (schedule.entries.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "required_before_packet schedules require at least one local consequence entry.",
      });
    }
    if (schedule.entries.some((entry) => entry.route !== "required_before_packet")) {
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: "required_before_packet schedule entries must also be required_before_packet.",
      });
    }
  }
  if (schedule.route === "deferred_audit" && schedule.entries.some((entry) => entry.route !== "deferred_audit")) {
    ctx.addIssue({
      code: "custom",
      path: ["entries"],
      message: "deferred_audit schedule entries must also be deferred_audit.",
    });
  }
  for (const entry of schedule.entries) {
    if (!schedule.triggerReceiptIds.includes(entry.triggerReceiptId)) {
      ctx.addIssue({
        code: "custom",
        path: ["entries"],
        message: `Local consequence entry trigger receipt ${entry.triggerReceiptId} must be listed in triggerReceiptIds.`,
      });
    }
  }
});

export type LocalConsequenceScheduleV2 = z.infer<typeof localConsequenceScheduleV2Schema>;

export const localConsequenceToolRequestCandidateV2Schema = z.object({
  version: z.literal("local-consequence-tool-request-candidate.v2"),
  candidateId: idText,
  consequenceId: idText,
  triggerReceiptId: idText,
  request: gameplayToolRequestV2Schema,
  rationale: z.string().trim().min(1).max(700),
}).strict();

export type LocalConsequenceToolRequestCandidateV2 =
  z.infer<typeof localConsequenceToolRequestCandidateV2Schema>;

export const localConsequenceExecutionV2Schema = z.object({
  version: z.literal("local-consequence-execution.v2"),
  executionId: idText,
  campaignId: idText,
  turnId: idText,
  scheduleId: idText,
  inputLedgerId: idText,
  outputLedgerId: idText,
  baseWorldVersion: worldVersion,
  resultWorldVersion: worldVersion,
  resolvedConsequenceIds: z.array(idText).max(12).default([]),
  acceptedReceiptIds: z.array(idText).max(12).default([]),
  rejectedReceiptIds: z.array(idText).max(12).default([]),
  failedReceiptIds: z.array(idText).max(12).default([]),
  skipped: z.array(settledStepAuditV2Schema).max(20).default([]),
}).strict().superRefine((execution, ctx) => {
  if (execution.resultWorldVersion < execution.baseWorldVersion) {
    ctx.addIssue({
      code: "custom",
      path: ["resultWorldVersion"],
      message: "Local consequence execution resultWorldVersion cannot precede baseWorldVersion.",
    });
  }
});

export type LocalConsequenceExecutionV2 = z.infer<typeof localConsequenceExecutionV2Schema>;

export const oracleVisibleOutcomeV2Schema = z.object({
  outcome: oracleOutcomeTierV2Schema,
  question: z.string().trim().min(1).max(500),
  stakes: z.string().trim().min(1).max(500),
  selectedMeaning: z.string().trim().min(1).max(500),
}).strict();

export type OracleVisibleOutcomeV2 = z.infer<typeof oracleVisibleOutcomeV2Schema>;

export const publicStepAuditSummaryV2Schema = z.object({
  skippedCount: z.number().int().nonnegative(),
  failedCount: z.number().int().nonnegative(),
}).strict();

export type PublicStepAuditSummaryV2 =
  z.infer<typeof publicStepAuditSummaryV2Schema>;

export const settledTurnPacketV2Schema = z.object({
  version: z.literal("settled-turn-packet.v2"),
  packetId: idText,
  campaignId: idText,
  turnId: idText,
  playerAction: proseText,
  baseTick: tick,
  baseWorldVersion: worldVersion,
  resultWorldVersion: worldVersion,
  gmReadPublic: publicGmReadProjectionV2Schema,
  gmJudgePublic: publicGmJudgeProjectionV2Schema,
  oracleVisibleOutcome: oracleVisibleOutcomeV2Schema.nullable().default(null),
  acceptedEvidence: z.array(settledEvidenceV2Schema).max(80),
  acceptedRuntimeReceiptIds: z.array(idText).max(80).default([]),
  acceptedDurableEventIds: z.array(idText).max(80).default([]),
  stepAudit: publicStepAuditSummaryV2Schema.default({
    skippedCount: 0,
    failedCount: 0,
  }),
  auditRef: idText.optional(),
}).strict().superRefine((packet, ctx) => {
  if (packet.resultWorldVersion < packet.baseWorldVersion) {
    ctx.addIssue({
      code: "custom",
      path: ["resultWorldVersion"],
      message: "Settled packet resultWorldVersion cannot precede baseWorldVersion.",
    });
  }
  if (packet.acceptedRuntimeReceiptIds.length > 0) {
    const hasRuntimeEvidence = packet.acceptedEvidence.some((evidence) =>
      evidence.authority === "runtime_receipt");
    if (!hasRuntimeEvidence) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptedRuntimeReceiptIds"],
        message: "Runtime receipt ids require runtime_receipt evidence.",
      });
    }
  }
  if (packet.oracleVisibleOutcome) {
    if (packet.gmJudgePublic.lane !== "roll_oracle") {
      ctx.addIssue({
        code: "custom",
        path: ["oracleVisibleOutcome"],
        message: "Oracle visible outcome requires a roll_oracle GM Judge admission.",
      });
    }
    const hasOracleEvidence = packet.acceptedEvidence.some((evidence) =>
      evidence.authority === "oracle_settlement" && evidence.kind === "oracle_outcome");
    if (!hasOracleEvidence) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptedEvidence"],
        message: "Oracle visible outcome requires accepted oracle_outcome evidence.",
      });
    }
  }
  if (!packet.oracleVisibleOutcome && packet.gmJudgePublic.lane === "roll_oracle") {
    ctx.addIssue({
      code: "custom",
      path: ["oracleVisibleOutcome"],
      message: "roll_oracle GM Judge admission requires an Oracle visible outcome.",
    });
  }
});

export type SettledTurnPacketV2 = z.infer<typeof settledTurnPacketV2Schema>;

const narratorForbiddenClaimV2Schema = z.enum([
  "absence_or_no_change",
  "movement_or_arrival_without_receipt",
  "route_availability_without_receipt",
  "discovery_or_search_result_without_receipt",
  "item_state_without_receipt",
  "npc_knowledge_or_response_without_receipt",
  "condition_or_rest_benefit_without_receipt",
  "hidden_or_offscreen_event_without_receipt",
  "location_or_world_fact_change_without_receipt",
]);

const defaultNarratorForbiddenClaimKindsV2 = [
  "absence_or_no_change",
  "movement_or_arrival_without_receipt",
  "route_availability_without_receipt",
  "discovery_or_search_result_without_receipt",
  "item_state_without_receipt",
  "npc_knowledge_or_response_without_receipt",
  "condition_or_rest_benefit_without_receipt",
  "hidden_or_offscreen_event_without_receipt",
  "location_or_world_fact_change_without_receipt",
] as const;

const narratorReceiptEvidenceLimitV2Schema = z.object({
  sourceReceiptId: idText,
  toolId: gameplayToolIdV2Schema,
  proves: z.array(z.string().trim().min(1).max(240)).min(1).max(8),
  doesNotProve: z.array(z.string().trim().min(1).max(240)).min(1).max(24),
}).strict();

const narratorEvidenceContractV2Schema = z.object({
  authoritativeSource: z.literal("acceptedEvidence"),
  forbiddenClaimKinds: z.array(narratorForbiddenClaimV2Schema)
    .min(1)
    .max(defaultNarratorForbiddenClaimKindsV2.length)
    .default([...defaultNarratorForbiddenClaimKindsV2]),
  receiptLimits: z.array(narratorReceiptEvidenceLimitV2Schema).max(80).default([]),
}).strict().default({
  authoritativeSource: "acceptedEvidence",
  forbiddenClaimKinds: [...defaultNarratorForbiddenClaimKindsV2],
  receiptLimits: [],
});

export const narrationAttemptStatusV2Schema = z.enum([
  "not_started",
  "started",
  "failed_pending_retry",
  "succeeded_projected",
]);

export const settledPacketPersistenceV2Schema = z.object({
  version: z.literal("settled-packet-persistence.v2"),
  packetId: idText,
  campaignId: idText,
  turnId: idText,
  status: z.enum(["resolved_pending_narration", "narrator_rendering", "finalized"]),
  narratorAttemptStatus: narrationAttemptStatusV2Schema,
}).strict();

export type SettledPacketPersistenceV2 = z.infer<typeof settledPacketPersistenceV2Schema>;

export const narratorViewV2Schema = z.object({
  version: z.literal("narrator-view.v2"),
  packetId: idText,
  campaignId: idText,
  turnId: idText,
  playerAction: proseText,
  gmReadPath: gmReadPathV2Schema,
  acceptedEvidence: z.array(settledEvidenceV2Schema).min(1).max(80),
  languageContract: z.object({
    responseLanguage: z.literal("match_player_action"),
    sourceField: z.literal("playerAction"),
    preserveLabelsVerbatim: z.literal(true),
  }).strict(),
  narrationLimits: z.object({
    mayInferNewFacts: z.literal(false),
    mayCallTools: z.literal(false),
    mayUseFailedOrSkippedAsTruth: z.literal(false),
  }).strict(),
  evidenceContract: narratorEvidenceContractV2Schema,
}).strict();

export type NarratorViewV2 = z.infer<typeof narratorViewV2Schema>;

export const apiResponseProjectionV2Schema = z.object({
  version: z.literal("api-response-projection.v2"),
  packetId: idText,
  campaignId: idText,
  turnId: idText,
  narrativeEvent: z.object({
    type: z.literal("narrative"),
    data: z.object({
      text: z.string().trim().min(1).max(6_000),
    }).strict(),
  }).strict(),
  doneEvent: z.object({
    type: z.literal("done"),
    data: z.object({
      tick,
      worldVersion,
      worldTimeMinutes: z.number().int().nonnegative(),
      opening: z.literal(false),
      turnId: idText,
      packetId: idText,
      runtime: z.literal("gameplay-cycle-v2"),
    }).strict(),
  }).strict(),
}).strict().superRefine((projection, ctx) => {
  if (projection.doneEvent.data.turnId !== projection.turnId) {
    ctx.addIssue({
      code: "custom",
      path: ["doneEvent", "data", "turnId"],
      message: "API done event turnId must match the projection turnId.",
    });
  }
  if (projection.doneEvent.data.packetId !== projection.packetId) {
    ctx.addIssue({
      code: "custom",
      path: ["doneEvent", "data", "packetId"],
      message: "API done event packetId must match the projection packetId.",
    });
  }
});

export type ApiResponseProjectionV2 = z.infer<typeof apiResponseProjectionV2Schema>;

export function assertTurnStartEnvelopeV2(value: unknown): TurnStartEnvelopeV2 {
  return turnStartEnvelopeSchema.parse(value);
}

export function assertTurnAttemptContextV2(value: unknown): TurnAttemptContextV2 {
  return turnAttemptContextSchema.parse(value);
}

export function assertSceneFrameEnvelopeV2(value: unknown): SceneFrameEnvelopeV2 {
  return sceneFrameEnvelopeSchema.parse(value);
}

export function assertModelFacingTurnPacketV2(value: unknown): ModelFacingTurnPacketV2 {
  return modelFacingTurnPacketSchema.parse(value);
}

export function assertGmReadNoMutationV2(value: unknown): GmReadNoMutationV2 {
  return gmReadNoMutationV2Schema.parse(value);
}

export function assertGmReadOracleV2(value: unknown): GmReadOracleV2 {
  return gmReadOracleV2Schema.parse(value);
}

export function assertGmReadChecklistV2(value: unknown): GmReadChecklistV2 {
  return gmReadChecklistV2Schema.parse(value);
}

export function assertGmReadV2(value: unknown): GmReadV2 {
  return gmReadV2Schema.parse(value);
}

export function assertGmJudgeV2(value: unknown): GmJudgeV2 {
  return gmJudgeV2Schema.parse(value);
}

export function assertPublicGmReadProjectionV2(value: unknown): PublicGmReadProjectionV2 {
  return publicGmReadProjectionV2Schema.parse(value);
}

export function assertPublicGmJudgeProjectionV2(value: unknown): PublicGmJudgeProjectionV2 {
  return publicGmJudgeProjectionV2Schema.parse(value);
}

export function assertOracleSettlementV2(value: unknown): OracleSettlementV2 {
  return oracleSettlementV2Schema.parse(value);
}

export function assertGmActionChecklistV2(value: unknown): GmActionChecklistV2 {
  return gmActionChecklistV2Schema.parse(value);
}

export function assertGameplayToolRequestV2(value: unknown): GameplayToolRequestV2 {
  return gameplayToolRequestV2Schema.parse(value);
}

export function assertGameplayRuntimeReceiptV2(value: unknown): GameplayRuntimeReceiptV2 {
  return gameplayRuntimeReceiptV2Schema.parse(value);
}

export function assertGameplayRuntimeReceiptLedgerV2(value: unknown): GameplayRuntimeReceiptLedgerV2 {
  return gameplayRuntimeReceiptLedgerV2Schema.parse(value);
}

export function assertLocalConsequenceScheduleV2(value: unknown): LocalConsequenceScheduleV2 {
  return localConsequenceScheduleV2Schema.parse(value);
}

export function assertLocalConsequenceToolRequestCandidateV2(value: unknown): LocalConsequenceToolRequestCandidateV2 {
  return localConsequenceToolRequestCandidateV2Schema.parse(value);
}

export function assertLocalConsequenceExecutionV2(value: unknown): LocalConsequenceExecutionV2 {
  return localConsequenceExecutionV2Schema.parse(value);
}

export function assertSettledTurnPacketV2(value: unknown): SettledTurnPacketV2 {
  return settledTurnPacketV2Schema.parse(value);
}

export function assertNoPrivateTermsInPublicPayloadV2(input: {
  payloadName: string;
  payload: unknown;
  privateGuardTerms: readonly string[];
}): void {
  const publicText = JSON.stringify(input.payload).toLowerCase();
  for (const term of input.privateGuardTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;
    if (publicText.includes(normalizedTerm)) {
      throw new Error(
        `${input.payloadName} leaked private guard term "${term}" into public fields.`,
      );
    }
  }
}

export function assertSettledPacketPersistenceV2(value: unknown): SettledPacketPersistenceV2 {
  return settledPacketPersistenceV2Schema.parse(value);
}

export function assertNarratorViewV2(value: unknown): NarratorViewV2 {
  return narratorViewV2Schema.parse(value);
}

export function assertApiResponseProjectionV2(value: unknown): ApiResponseProjectionV2 {
  return apiResponseProjectionV2Schema.parse(value);
}
