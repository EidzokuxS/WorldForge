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
  oracleRequest: gmReadOracleRequestV2Schema,
}).strict().superRefine((read, ctx) => {
  if (read.oracleRequest.actorRef && !read.focalActorRefs.includes(read.oracleRequest.actorRef)) {
    ctx.addIssue({
      code: "custom",
      path: ["oracleRequest", "actorRef"],
      message: "Oracle actorRef must be one of the GM Read focalActorRefs.",
    });
  }
  const evidenceRefs = new Set(read.evidenceRefs.map((ref) => ref.toLowerCase()));
  for (const ref of read.oracleRequest.evidenceRefs) {
    if (!evidenceRefs.has(ref.toLowerCase())) {
      ctx.addIssue({
        code: "custom",
        path: ["oracleRequest", "evidenceRefs"],
        message: `Oracle evidence ref "${ref}" must also be cited in GM Read evidenceRefs.`,
      });
    }
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
  checklistRequest: gmReadChecklistRequestV2Schema,
}).strict().superRefine((read, ctx) => {
  const focalRefs = new Set(read.focalActorRefs.map((ref) => ref.toLowerCase()));
  for (const ref of read.checklistRequest.actorRefs) {
    if (!focalRefs.has(ref.toLowerCase())) {
      ctx.addIssue({
        code: "custom",
        path: ["checklistRequest", "actorRefs"],
        message: `Checklist actor ref "${ref}" must be one of the GM Read focalActorRefs.`,
      });
    }
  }
  const evidenceRefs = new Set(read.evidenceRefs.map((ref) => ref.toLowerCase()));
  for (const ref of read.checklistRequest.evidenceRefs) {
    if (!evidenceRefs.has(ref.toLowerCase())) {
      ctx.addIssue({
        code: "custom",
        path: ["checklistRequest", "evidenceRefs"],
        message: `Checklist evidence ref "${ref}" must also be cited in GM Read evidenceRefs.`,
      });
    }
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
    ...gmReadCandidateV2LooseSidecars,
    oracleRequest: gmReadOracleRequestV2Schema.partial().passthrough().optional(),
  }).strict(),
  gmReadCandidateV2LooseBaseSchema.extend({
    path: z.literal("tool_plan"),
    ...gmReadCandidateV2LooseSidecars,
    checklistRequest: gmReadChecklistRequestV2Schema.partial().passthrough().optional(),
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
    stateScope: z.enum(["local_scene", "actor", "item", "location", "world", "ui"]),
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
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const worldFactRecordRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("world_fact_record"),
  toolId: z.literal("world_fact.record.v2"),
  effectBinding: z.object({
    subjectRefs: z.array(modelSafeRefSchema).min(1).max(8),
    summary: z.string().trim().min(1).max(700),
    futureUseKind: z.enum(["memory", "evidence", "procedure", "other"]),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const supportActorCreateRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("support_actor_create"),
  toolId: z.literal("support_actor.create.v2"),
  effectBinding: z.object({
    roleLabel: shortText,
    anchorRef: modelSafeRefSchema,
    reason: z.string().trim().min(1).max(500),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const entityTagRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("entity_tag"),
  toolId: z.literal("entity.tag.v2"),
  effectBinding: z.object({
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
    itemRef: modelSafeRefSchema,
    fromRef: modelSafeRefSchema.optional(),
    toRef: modelSafeRefSchema,
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const actorConditionSetRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("condition_set"),
  toolId: z.literal("actor.condition_set.v2"),
  effectBinding: z.object({
    actorRef: modelSafeRefSchema,
    operation: z.enum(["set", "clear", "adjust_hp"]),
    conditionLabel: optionalNonEmptyString(180),
    amount: z.number().int().min(-100).max(100).optional(),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const timeAdvanceRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("time_advance"),
  toolId: z.literal("time.advance.v2"),
  effectBinding: z.object({
    minutes: z.number().int().positive().max(24 * 60),
    reason: z.string().trim().min(1).max(500),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
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

const locationRevealRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("location_reveal"),
  toolId: z.literal("location.reveal.v2"),
  effectBinding: z.object({
    locationLabel: shortText,
    anchorRef: modelSafeRefSchema,
    revealReason: z.string().trim().min(1).max(500),
    evidenceRefs: toolEvidenceRefsSchema,
  }).strict(),
}).strict();

const minorPoiCreateRequestV2Schema = z.object({
  ...gameplayToolRequestBaseV2Shape,
  capabilityId: z.literal("minor_poi_create"),
  toolId: z.literal("minor_poi.create.v2"),
  effectBinding: z.object({
    poiLabel: shortText,
    anchorRef: modelSafeRefSchema,
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

export const settledTurnPacketV2Schema = z.object({
  version: z.literal("settled-turn-packet.v2"),
  packetId: idText,
  campaignId: idText,
  turnId: idText,
  playerAction: proseText,
  baseTick: tick,
  baseWorldVersion: worldVersion,
  resultWorldVersion: worldVersion,
  gmRead: gmReadV2Schema,
  oracleSettlement: oracleSettlementV2Schema.nullable().default(null),
  acceptedEvidence: z.array(settledEvidenceV2Schema).max(80),
  acceptedRuntimeReceiptIds: z.array(idText).max(80).default([]),
  acceptedDurableEventIds: z.array(idText).max(80).default([]),
  skippedSteps: z.array(settledStepAuditV2Schema).max(40).default([]),
  failedSteps: z.array(settledStepAuditV2Schema).max(40).default([]),
  privateGuardTerms: z.array(shortText).max(80).default([]),
}).strict().superRefine((packet, ctx) => {
  if (packet.resultWorldVersion < packet.baseWorldVersion) {
    ctx.addIssue({
      code: "custom",
      path: ["resultWorldVersion"],
      message: "Settled packet resultWorldVersion cannot precede baseWorldVersion.",
    });
  }
  for (const term of packet.privateGuardTerms) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;
    const publicText = JSON.stringify({
      playerAction: packet.playerAction,
      gmRead: packet.gmRead,
      acceptedEvidence: packet.acceptedEvidence,
      skippedSteps: packet.skippedSteps,
      failedSteps: packet.failedSteps,
    }).toLowerCase();
    if (publicText.includes(normalizedTerm)) {
      ctx.addIssue({
        code: "custom",
        path: ["privateGuardTerms"],
        message: `Private guard term "${term}" leaked into settled public fields.`,
      });
    }
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
  if (packet.oracleSettlement) {
    if (packet.gmRead.path !== "roll_oracle") {
      ctx.addIssue({
        code: "custom",
        path: ["oracleSettlement"],
        message: "Oracle settlement requires a roll_oracle GM Read.",
      });
    }
    const hasOracleEvidence = packet.acceptedEvidence.some((evidence) =>
      evidence.authority === "oracle_settlement" && evidence.kind === "oracle_outcome");
    if (!hasOracleEvidence) {
      ctx.addIssue({
        code: "custom",
        path: ["acceptedEvidence"],
        message: "Oracle settlement requires accepted oracle_outcome evidence.",
      });
    }
  }
  if (!packet.oracleSettlement && packet.gmRead.path === "roll_oracle") {
    ctx.addIssue({
      code: "custom",
      path: ["oracleSettlement"],
      message: "roll_oracle GM Read requires an Oracle settlement.",
    });
  }
});

export type SettledTurnPacketV2 = z.infer<typeof settledTurnPacketV2Schema>;

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

export function assertSettledPacketPersistenceV2(value: unknown): SettledPacketPersistenceV2 {
  return settledPacketPersistenceV2Schema.parse(value);
}

export function assertNarratorViewV2(value: unknown): NarratorViewV2 {
  return narratorViewV2Schema.parse(value);
}

export function assertApiResponseProjectionV2(value: unknown): ApiResponseProjectionV2 {
  return apiResponseProjectionV2Schema.parse(value);
}
