import { z } from "zod";
import {
  CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES,
  CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES,
  CAMPAIGN_PLAY_EFFECT_KIND_VALUES,
  CAMPAIGN_PLAY_INTENT_SOURCE_VALUES,
  CAMPAIGN_PLAY_LIMITS,
  CAMPAIGN_PLAY_PHASE_VALUES,
  CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES,
  CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES,
  CAMPAIGN_PLAY_PUBLIC_TURN_STATUS_VALUES,
  CAMPAIGN_PLAY_ROUTE_STATE_VALUES,
  CAMPAIGN_PLAY_SETUP_PHASE_VALUES,
  CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES,
  CAMPAIGN_PLAY_VISIBLE_TARGET_KIND_VALUES,
  CAMPAIGN_TURN_KIND_VALUES,
  WORLD_INTENT_KIND_VALUES,
  type CampaignPlayErrorResponse,
  type CampaignPlayActionContext,
  type CampaignPlayAvailableIntent,
  type CampaignPlayCharacterDraft,
  type CampaignPlayCharacterDraftResponse,
  type CampaignPlayCharacterResearch,
  type CampaignPlayCharacterResearchResponse,
  type CampaignPlayGeneratePlayerDraftRequest,
  type CampaignPlayJournalPage,
  type CampaignPlayJournalRequest,
  type CampaignPlayNarration,
  type CampaignPlayNarratorPacket,
  type CampaignPlayOpeningAdmissionRequest,
  type CampaignPlayOpeningDetailOption,
  type CampaignPlayOpeningLocationOption,
  type CampaignPlayParsePlayerCardRequest,
  type CampaignPlayPutPlayerRequest,
  type CampaignPlayPutPlayerResponse,
  type CampaignPlayResearchPlayerRequest,
  type CampaignPlayResumeTurnRequest,
  type CampaignPlaySseEvent,
  type CampaignPlayStartingConditions,
  type CampaignPlayState,
  type CampaignPlayTurnAdmissionRequest,
  type CampaignPlayTurnAdmissionResponse,
  type CampaignPlayTurnReadResponse,
  type CampaignPlayVersionExpectation,
  type PlayerIntent,
} from "@worldforge/shared";

const LOWER_HEX_CHARACTERS = "0123456789abcdef";
const HANDLE_CHARACTERS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-";
const ID_CHARACTERS = `${HANDLE_CHARACTERS}:`;
const ACCENT_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789-";
const REQUIREMENT_CODE_CHARACTERS = "abcdefghijklmnopqrstuvwxyz0123456789_";

export const CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES = [
  "deterministic",
  "uncertain",
  "impossible",
  "clarification_required",
] as const;

export const CAMPAIGN_PLAY_RESULT_TIER_VALUES = [
  "no_effect",
  "setback",
  "limited",
  "success",
  "strong_success",
] as const;

export const CAMPAIGN_PLAY_ACTOR_CONDITION_VALUES = [
  "occupied",
  "strained",
  "incapacitated",
] as const;

export const CAMPAIGN_PLAY_GOAL_STATUS_VALUES = [
  "active",
  "blocked",
  "completed",
] as const;

export const CAMPAIGN_PLAY_PRESSURE_STATUS_VALUES = [
  "active",
  "resolved",
] as const;

export const CAMPAIGN_PLAY_EXPOSURE_CHANNEL_VALUES = [
  "direct_perception",
  "local_aftermath",
  "route_state",
  "witness_report",
] as const;

export const CAMPAIGN_PLAY_COMMAND_KIND_VALUES = [
  "advance_world_time",
  "move_actor",
  "set_route_state",
  "set_actor_condition",
  "update_actor_relation",
  "update_actor_goal",
  "advance_pressure",
  "record_world_event",
] as const;

export const CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES = [
  "create_player_actor",
  "initialize_player_placement",
  "initialize_world_time",
  "initialize_pressure_state",
] as const;

export const CAMPAIGN_PLAY_WORLD_EVENT_KIND_VALUES = [
  "player_actor_created",
  "player_placement_initialized",
  "world_time_initialized",
  "pressure_initialized",
  "world_time_advanced",
  "actor_moved",
  "route_state_changed",
  "actor_condition_changed",
  "actor_relation_changed",
  "actor_goal_changed",
  "pressure_advanced",
  "scene_recorded",
] as const;

export const CAMPAIGN_PLAY_ACTOR_JOB_STAGE_VALUES = [
  "queued",
  "claimed",
  "interrupted",
  "proposed",
  "settled",
  "rejected",
  "deferred",
] as const;

export const CAMPAIGN_PLAY_RUNTIME_EVENT_KIND_VALUES = [
  "play_state_created",
  "character_created",
  "turn_admitted",
  "worker_claimed",
  "worker_lease_renewed",
  "stage_accepted",
  "primary_settled",
  "actor_job_transitioned",
  "visibility_projected",
  "turn_interrupted",
  "turn_resumed",
  "turn_completed",
  "turn_failed",
] as const;

export const CAMPAIGN_PLAY_ENTITY_REF_KIND_VALUES = [
  "actor",
  "location",
  "route",
  "relation",
  "goal",
  "pressure",
  "world_event",
] as const;

export const CAMPAIGN_PLAY_CAUSAL_PARENT_KIND_VALUES = [
  "accepted_world",
  "turn",
  "command",
  "world_event",
  "actor_job",
] as const;

export const CAMPAIGN_PLAY_COMMAND_SOURCE_KIND_VALUES = [
  "actor",
  "system",
] as const;

export const CAMPAIGN_PLAY_SYSTEM_SOURCE_VALUES = [
  "character_bootstrap",
  "opening_bootstrap",
  "game_master",
  "actor_scheduler",
] as const;

export const CAMPAIGN_PLAY_EXPOSURE_POLICY_MODE_VALUES = [
  "protected",
  "projectable",
] as const;

export const CAMPAIGN_PLAY_PLAN_PRECONDITION_KIND_VALUES = [
  "actor_at_location",
  "route_state",
  "goal_status",
  "pressure_status",
  "actor_condition",
] as const;

export const CAMPAIGN_PLAY_PROPOSAL_STATUS_VALUES = [
  "pending",
  "accepted",
  "rejected",
] as const;

export const CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_KIND_VALUES = [
  "deterministic",
  "rolled",
] as const;

export const CAMPAIGN_PLAY_MODEL_STAGE_STATUS_VALUES = [
  "started",
  "accepted",
  "interrupted",
  "failed",
] as const;

export const CAMPAIGN_TURN_STAGE_VALUES = [
  "admitted",
  "judged",
  "planned",
  "primary_settled",
  "actors_settled",
  "visibility_projected",
  "interrupted",
  "completed",
  "failed",
] as const;

export type CampaignPlayJudgmentDisposition =
  (typeof CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES)[number];
export type CampaignPlayResultTier =
  (typeof CAMPAIGN_PLAY_RESULT_TIER_VALUES)[number];
export type CampaignPlayActorCondition =
  (typeof CAMPAIGN_PLAY_ACTOR_CONDITION_VALUES)[number];
export type CampaignPlayGoalStatus =
  (typeof CAMPAIGN_PLAY_GOAL_STATUS_VALUES)[number];
export type CampaignPlayPressureStatus =
  (typeof CAMPAIGN_PLAY_PRESSURE_STATUS_VALUES)[number];
export type CampaignPlayExposureChannel =
  (typeof CAMPAIGN_PLAY_EXPOSURE_CHANNEL_VALUES)[number];
export type CampaignPlayCommandKind =
  (typeof CAMPAIGN_PLAY_COMMAND_KIND_VALUES)[number];
export type CampaignPlayBootstrapCommandKind =
  (typeof CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES)[number];
export type RulebookBatchCommandKind =
  | CampaignPlayCommandKind
  | CampaignPlayBootstrapCommandKind;
export type CampaignPlayWorldEventKind =
  (typeof CAMPAIGN_PLAY_WORLD_EVENT_KIND_VALUES)[number];
export type CampaignPlayActorJobStage =
  (typeof CAMPAIGN_PLAY_ACTOR_JOB_STAGE_VALUES)[number];
export type CampaignPlayRuntimeEventKind =
  (typeof CAMPAIGN_PLAY_RUNTIME_EVENT_KIND_VALUES)[number];
export type CampaignTurnStage = (typeof CAMPAIGN_TURN_STAGE_VALUES)[number];

function boundedStringSchema(
  maximum: number,
  options: { singleLine: boolean; characters?: string },
) {
  return z.string().min(1).max(maximum)
    .refine((value) => value === value.trim(), {
      message: "Text must not contain surrounding whitespace.",
    })
    .refine(
      (value) => !options.singleLine ||
        (!value.includes("\n") && !value.includes("\r")),
      { message: "Text must use one line." },
    )
    .refine(
      (value) => !options.characters ||
        [...value].every((character) => options.characters?.includes(character)),
      { message: "Text contains an unsupported character." },
    );
}

const idSchema = boundedStringSchema(CAMPAIGN_PLAY_LIMITS.id, {
  singleLine: true,
  characters: ID_CHARACTERS,
});
const handleSchema = boundedStringSchema(CAMPAIGN_PLAY_LIMITS.handle, {
  singleLine: true,
  characters: HANDLE_CHARACTERS,
});
const idempotencyKeySchema = boundedStringSchema(
  CAMPAIGN_PLAY_LIMITS.idempotencyKey,
  { singleLine: true, characters: ID_CHARACTERS },
);
const nameSchema = boundedStringSchema(CAMPAIGN_PLAY_LIMITS.name, {
  singleLine: true,
});
const labelSchema = boundedStringSchema(CAMPAIGN_PLAY_LIMITS.label, {
  singleLine: true,
});
const shortTextSchema = boundedStringSchema(CAMPAIGN_PLAY_LIMITS.shortText, {
  singleLine: true,
});
const textSchema = boundedStringSchema(CAMPAIGN_PLAY_LIMITS.text, {
  singleLine: false,
});
const reasoningTextSchema = boundedStringSchema(
  CAMPAIGN_PLAY_LIMITS.narrationText,
  { singleLine: false },
);
const narrationBeatTextSchema = boundedStringSchema(
  CAMPAIGN_PLAY_LIMITS.narrationBeat,
  { singleLine: false },
);
const narrationTextSchema = boundedStringSchema(
  CAMPAIGN_PLAY_LIMITS.narrationText,
  { singleLine: false },
);
const playerInputSchema = boundedStringSchema(
  CAMPAIGN_PLAY_LIMITS.playerInput,
  { singleLine: false },
);
const accentSchema = boundedStringSchema(32, {
  singleLine: true,
  characters: ACCENT_CHARACTERS,
});
const requirementCodeSchema = boundedStringSchema(80, {
  singleLine: true,
  characters: REQUIREMENT_CODE_CHARACTERS,
});
const hashSchema = z.string().length(64).refine(
  (value) => [...value].every((character) =>
    LOWER_HEX_CHARACTERS.includes(character)),
  { message: "Hash must contain 64 lowercase hexadecimal characters." },
);
const safeIntegerSchema = z.number().int().safe();
const positiveIntegerSchema = safeIntegerSchema.min(1);
const nonnegativeIntegerSchema = safeIntegerSchema.min(0);
const timestampSchema = nonnegativeIntegerSchema;
const worldTimeSchema = nonnegativeIntegerSchema.max(
  CAMPAIGN_PLAY_LIMITS.worldTimeMinutes,
);

function addDuplicateIssue(
  values: readonly string[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  label: string,
): void {
  if (new Set(values).size !== values.length) {
    context.addIssue({
      code: "custom",
      path,
      message: `${label} must be unique.`,
    });
  }
}

function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), "utf-8");
}

const campaignPlayPublicVersionsBaseSchema = z.object({
  acceptedWorldVersion: positiveIntegerSchema,
  worldVersion: positiveIntegerSchema,
  runtimeRevision: positiveIntegerSchema,
}).strict();

export const campaignPlayPublicVersionsSchema =
  campaignPlayPublicVersionsBaseSchema.superRefine((versions, context) => {
    if (versions.worldVersion < versions.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "worldVersion must include the accepted world base.",
      });
    }
  });

export const campaignPlayVisibleTargetSchema = z.object({
  handle: handleSchema,
  kind: z.enum(CAMPAIGN_PLAY_VISIBLE_TARGET_KIND_VALUES),
}).strict();

const playerIntentBaseSchema = z.object({
  originalText: playerInputSchema,
  source: z.enum(CAMPAIGN_PLAY_INTENT_SOURCE_VALUES),
  choiceHandle: handleSchema.nullable(),
  kind: z.enum(WORLD_INTENT_KIND_VALUES),
  targets: z.array(campaignPlayVisibleTargetSchema)
    .max(CAMPAIGN_PLAY_LIMITS.targets),
  method: shortTextSchema.nullable(),
  stakes: shortTextSchema.nullable(),
}).strict();

export const playerIntentSchema: z.ZodType<PlayerIntent> =
  playerIntentBaseSchema.superRefine((intent, context) => {
    if (intent.source === "suggested" && intent.choiceHandle === null) {
      context.addIssue({
        code: "custom",
        path: ["choiceHandle"],
        message: "Suggested intent requires a choice handle.",
      });
    }
    if (intent.source === "freeform" && intent.choiceHandle !== null) {
      context.addIssue({
        code: "custom",
        path: ["choiceHandle"],
        message: "Freeform intent carries no choice handle.",
      });
    }
    addDuplicateIssue(
      intent.targets.map((target) => target.handle),
      context,
      ["targets"],
      "Target handles",
    );
  });

export const campaignPlayVisibleLocationSchema = z.object({
  handle: handleSchema,
  name: nameSchema,
  description: textSchema,
}).strict();

export const campaignPlayVisibleActorSchema = z.object({
  handle: handleSchema,
  name: nameSchema,
  monogram: boundedStringSchema(3, { singleLine: true }),
  descriptor: labelSchema,
  accent: accentSchema,
}).strict();

export const campaignPlayVisibleRouteSchema = z.object({
  handle: handleSchema,
  destinationHandle: handleSchema,
  destinationName: nameSchema,
  state: z.enum(CAMPAIGN_PLAY_ROUTE_STATE_VALUES),
  travelTimeLabel: labelSchema,
}).strict();

export const campaignPlayVisiblePressureSchema = z.object({
  handle: handleSchema,
  label: labelSchema,
  summary: textSchema,
}).strict();

export const campaignPlayConsequenceSchema = z.object({
  observationHandle: handleSchema,
  whatChanged: textSchema,
  whereOrRoute: labelSchema,
  worldTimeLabel: labelSchema,
  causalCue: z.enum(CAMPAIGN_PLAY_CONSEQUENCE_CUE_VALUES),
}).strict();

export const campaignPlayJournalEntrySchema = z.object({
  observationHandle: handleSchema,
  title: labelSchema,
  text: textSchema,
  whereOrRoute: labelSchema.nullable(),
  worldTimeLabel: labelSchema,
  consequence: campaignPlayConsequenceSchema.nullable(),
}).strict().superRefine((entry, context) => {
  if (
    entry.consequence !== null &&
    entry.consequence.observationHandle !== entry.observationHandle
  ) {
    context.addIssue({
      code: "custom",
      path: ["consequence", "observationHandle"],
      message: "Journal consequence must belong to its observation.",
    });
  }
});

export const campaignPlayAvailableIntentSchema = z.object({
  handle: handleSchema,
  label: labelSchema,
  kind: z.enum(WORLD_INTENT_KIND_VALUES),
  targets: z.array(campaignPlayVisibleTargetSchema)
    .max(CAMPAIGN_PLAY_LIMITS.targets),
}).strict();

export const campaignPlayOpeningContextSchema = z.object({
  role: shortTextSchema,
  arrivalMode: shortTextSchema,
  immediateSituation: textSchema,
}).strict();

export const campaignPlayActionContextSchema:
  z.ZodType<CampaignPlayActionContext> = z.object({
    submittedText: playerInputSchema,
    intentKind: z.enum(WORLD_INTENT_KIND_VALUES),
    disposition: z.enum(CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES),
    result: z.enum(CAMPAIGN_PLAY_RESULT_TIER_VALUES),
    clarificationQuestion: shortTextSchema.nullable(),
  }).strict().superRefine((action, context) => {
    const requiresQuestion = action.disposition === "clarification_required";
    if (requiresQuestion !== (action.clarificationQuestion !== null)) {
      context.addIssue({
        code: "custom",
        path: ["clarificationQuestion"],
        message: "Clarification text must match the action disposition.",
      });
    }
    if (
      (action.disposition === "impossible" || requiresQuestion) &&
      action.result !== "no_effect"
    ) {
      context.addIssue({
        code: "custom",
        path: ["result"],
        message: "Impossible and clarification actions have no mechanical result.",
      });
    }
  });

const campaignPlayNarratorPacketBaseSchema =
  campaignPlayPublicVersionsBaseSchema.extend({
    campaignId: idSchema,
    turnId: idSchema,
    turnKind: z.enum(CAMPAIGN_TURN_KIND_VALUES),
    openingContext: campaignPlayOpeningContextSchema.nullable(),
    actionContext: campaignPlayActionContextSchema.nullable(),
    sourceMoment: narrationTextSchema.nullable(),
    currentLocation: campaignPlayVisibleLocationSchema,
    visibleActors: z.array(campaignPlayVisibleActorSchema)
      .max(CAMPAIGN_PLAY_LIMITS.visibleActors),
    visibleRoutes: z.array(campaignPlayVisibleRouteSchema)
      .max(CAMPAIGN_PLAY_LIMITS.visibleRoutes),
    visiblePressures: z.array(campaignPlayVisiblePressureSchema)
      .max(CAMPAIGN_PLAY_LIMITS.visiblePressures),
    newObservations: z.array(campaignPlayJournalEntrySchema)
      .max(CAMPAIGN_PLAY_LIMITS.newObservations),
    consequences: z.array(campaignPlayConsequenceSchema)
      .max(CAMPAIGN_PLAY_LIMITS.newObservations),
    continuity: z.array(campaignPlayJournalEntrySchema)
      .max(CAMPAIGN_PLAY_LIMITS.continuityEntries),
    elapsedMinutes: nonnegativeIntegerSchema.max(
      CAMPAIGN_PLAY_LIMITS.elapsedMinutes,
    ),
    availableIntents: z.array(campaignPlayAvailableIntentSchema)
      .max(CAMPAIGN_PLAY_LIMITS.suggestedActions),
  }).strict();

export const campaignPlayNarratorPacketSchema:
  z.ZodType<CampaignPlayNarratorPacket> =
  campaignPlayNarratorPacketBaseSchema.superRefine((packet, context) => {
    if ((packet.turnKind === "opening") !== (packet.openingContext !== null)) {
      context.addIssue({
        code: "custom",
        path: ["openingContext"],
        message: "Opening context belongs exactly to an opening turn.",
      });
    }
    if ((packet.turnKind === "player_action") !== (packet.actionContext !== null)) {
      context.addIssue({
        code: "custom",
        path: ["actionContext"],
        message: "Action context belongs exactly to a player action turn.",
      });
    }
    if ((packet.turnKind === "player_action") !== (packet.sourceMoment !== null)) {
      context.addIssue({
        code: "custom",
        path: ["sourceMoment"],
        message: "The exact prior public moment belongs to every player action and never to an opening.",
      });
    }
    if (packet.worldVersion < packet.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "worldVersion must include the accepted world base.",
      });
    }
    addDuplicateIssue(
      packet.visibleActors.map((actor) => actor.handle),
      context,
      ["visibleActors"],
      "Visible actor handles",
    );
    addDuplicateIssue(
      packet.visibleRoutes.map((route) => route.handle),
      context,
      ["visibleRoutes"],
      "Visible route handles",
    );
    addDuplicateIssue(
      packet.visiblePressures.map((pressure) => pressure.handle),
      context,
      ["visiblePressures"],
      "Visible pressure handles",
    );
    addDuplicateIssue(
      packet.newObservations.map((entry) => entry.observationHandle),
      context,
      ["newObservations"],
      "New observation handles",
    );
    addDuplicateIssue(
      packet.continuity.map((entry) => entry.observationHandle),
      context,
      ["continuity"],
      "Continuity observation handles",
    );
    addDuplicateIssue(
      packet.consequences.map((entry) => entry.observationHandle),
      context,
      ["consequences"],
      "Consequence observation handles",
    );
    addDuplicateIssue(
      packet.availableIntents.map((intent) => intent.handle),
      context,
      ["availableIntents"],
      "Available intent handles",
    );
    packet.availableIntents.forEach((intent, index) => {
      addDuplicateIssue(
        intent.targets.map((target) => target.handle),
        context,
        ["availableIntents", index, "targets"],
        "Available intent target handles",
      );
    });
    const newObservationHandles = new Set(
      packet.newObservations.map((entry) => entry.observationHandle),
    );
    packet.consequences.forEach((consequence, index) => {
      if (!newObservationHandles.has(consequence.observationHandle)) {
        context.addIssue({
          code: "custom",
          path: ["consequences", index, "observationHandle"],
          message: "Consequence must belong to a newly exposed observation.",
        });
      }
    });
    if (jsonByteLength(packet) > CAMPAIGN_PLAY_LIMITS.publicPacketBytes) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "Narrator packet exceeds the public byte limit.",
      });
    }
  });

export const campaignPlayNarrationBeatSchema = z.object({
  beatId: idSchema,
  text: narrationBeatTextSchema,
}).strict();

export const campaignPlaySuggestedActionSchema = z.object({
  choiceHandle: handleSchema,
  label: labelSchema,
}).strict();

export const campaignPlayStageEffectSchema = z.object({
  kind: z.enum(CAMPAIGN_PLAY_EFFECT_KIND_VALUES),
  beatId: idSchema.nullable(),
}).strict();

const campaignPlayNarrationBaseSchema = z.object({
  narrationId: idSchema,
  turnId: idSchema,
  beats: z.array(campaignPlayNarrationBeatSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.narrationBeats),
  displayText: narrationTextSchema,
  suggestedActions: z.array(campaignPlaySuggestedActionSchema)
    .max(CAMPAIGN_PLAY_LIMITS.suggestedActions),
  effects: z.array(campaignPlayStageEffectSchema)
    .max(CAMPAIGN_PLAY_LIMITS.effects),
  createdAt: timestampSchema,
}).strict();

export const campaignPlayNarrationSchema: z.ZodType<CampaignPlayNarration> =
  campaignPlayNarrationBaseSchema.superRefine((narration, context) => {
    const beatIds = narration.beats.map((beat) => beat.beatId);
    addDuplicateIssue(beatIds, context, ["beats"], "Beat IDs");
    addDuplicateIssue(
      narration.suggestedActions.map((action) => action.choiceHandle),
      context,
      ["suggestedActions"],
      "Suggested action handles",
    );
    const beatIdSet = new Set(beatIds);
    narration.effects.forEach((effect, index) => {
      if (effect.beatId !== null && !beatIdSet.has(effect.beatId)) {
        context.addIssue({
          code: "custom",
          path: ["effects", index, "beatId"],
          message: "Effect beatId must reference a narration beat.",
        });
      }
    });
  });

function playerFacingName(value: string): string {
  return value.replace(/[-_]+/g, " ").replace(/(^|\s)(\p{L})/gu, (_match, space: string, letter: string) =>
    `${space}${letter.toUpperCase()}`);
}

export function campaignPlaySuggestedActionLabelPrefix(
  packet: CampaignPlayNarratorPacket,
  intent: CampaignPlayAvailableIntent,
): string {
  switch (intent.kind) {
    case "observe": return "Examine ";
    case "wait": return "Wait and ";
    case "attempt": return "Try ";
    case "move": {
      const routeHandle = intent.targets.find((target) => target.kind === "route")?.handle;
      const route = packet.visibleRoutes.find((candidate) => candidate.handle === routeHandle);
      if (!route) {
        throw new CampaignPlayContractError(
          "narration_invalid",
          "Move action label requires its frozen visible route.",
        );
      }
      return `Go to ${playerFacingName(route.destinationName)}: `;
    }
    case "contact": {
      const actorHandle = intent.targets.find((target) => target.kind === "actor")?.handle;
      const actor = packet.visibleActors.find((candidate) => candidate.handle === actorHandle);
      if (!actor) {
        throw new CampaignPlayContractError(
          "narration_invalid",
          "Contact action label requires its frozen visible actor.",
        );
      }
      return `Ask ${actor.name} about `;
    }
  }
}

export function buildCampaignPlaySuggestedActionLabel(
  packet: CampaignPlayNarratorPacket,
  intent: CampaignPlayAvailableIntent,
  detail: string,
): string {
  if (detail.length === 0 || detail !== detail.trim() || detail.includes("\n") || detail.includes("\r")) {
    throw new CampaignPlayContractError(
      "narration_invalid",
      "Suggested action detail must be one trimmed line.",
    );
  }
  return `${campaignPlaySuggestedActionLabelPrefix(packet, intent)}${detail}`;
}

export function validateNarrationAgainstPacket(
  narration: CampaignPlayNarration,
  packet: CampaignPlayNarratorPacket,
): void {
  if (narration.suggestedActions.length !== packet.availableIntents.length) {
    throw new CampaignPlayContractError(
      "narration_invalid",
      "Narration must publish the complete frozen available-intent set.",
    );
  }
  narration.suggestedActions.forEach((action, index) => {
    const available = packet.availableIntents[index];
    const prefix = available
      ? campaignPlaySuggestedActionLabelPrefix(packet, available)
      : null;
    if (
      !available || available.handle !== action.choiceHandle ||
      prefix === null || !action.label.startsWith(prefix) ||
      action.label.length === prefix.length
    ) {
      throw new CampaignPlayContractError(
        "narration_invalid",
        `Suggested action ${action.choiceHandle} has no exact available intent binding.`,
      );
    }
  });
  if (narration.effects.length !== 1 || narration.effects[0]!.beatId === null) {
    throw new CampaignPlayContractError(
      "narration_invalid",
      "Narration must publish one beat-bound application effect.",
    );
  }
  const effectKind = narration.effects[0]!.kind;
  const expectedKinds = packet.actionContext?.disposition === "clarification_required"
    ? ["pause"]
    : packet.turnKind === "player_action" ||
        packet.visiblePressures.length > 0 || packet.consequences.length > 0
      ? ["flash"]
      : ["fade", "flash"];
  if (!expectedKinds.includes(effectKind)) {
    throw new CampaignPlayContractError(
      "narration_invalid",
      "Narration effect disagrees with the frozen packet disposition.",
    );
  }
}

export const campaignPlayPublicCharacterSchema = z.object({
  name: nameSchema,
  monogram: boundedStringSchema(3, { singleLine: true }),
  descriptor: labelSchema,
  accent: accentSchema,
}).strict();

export const campaignPlayOpeningDetailOptionSchema:
  z.ZodType<CampaignPlayOpeningDetailOption> = z.object({
    handle: handleSchema,
    label: labelSchema,
  }).strict();

export const campaignPlayOpeningLocationOptionSchema:
  z.ZodType<CampaignPlayOpeningLocationOption> = z.object({
    locationHandle: handleSchema,
    name: nameSchema,
    description: textSchema,
    roles: z.array(campaignPlayOpeningDetailOptionSchema)
      .min(1)
      .max(CAMPAIGN_PLAY_LIMITS.openingDetails),
    arrivalModes: z.array(campaignPlayOpeningDetailOptionSchema)
      .min(1)
      .max(CAMPAIGN_PLAY_LIMITS.openingDetails),
    immediateSituations: z.array(campaignPlayOpeningDetailOptionSchema)
      .min(1)
      .max(CAMPAIGN_PLAY_LIMITS.openingDetails),
  }).strict().superRefine((option, context) => {
    addDuplicateIssue(
      option.roles.map((role) => role.handle),
      context,
      ["roles"],
      "Opening role handles",
    );
    addDuplicateIssue(
      option.arrivalModes.map((arrival) => arrival.handle),
      context,
      ["arrivalModes"],
      "Opening arrival handles",
    );
    addDuplicateIssue(
      option.immediateSituations.map((situation) => situation.handle),
      context,
      ["immediateSituations"],
      "Opening situation handles",
    );
  });

export const campaignPlayPublicTurnSchema = z.object({
  turnId: idSchema,
  turnKind: z.enum(CAMPAIGN_TURN_KIND_VALUES),
  status: z.enum(CAMPAIGN_PLAY_PUBLIC_TURN_STATUS_VALUES),
  progress: z.enum(CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES).nullable(),
  lastEventSequence: nonnegativeIntegerSchema,
  retryEligible: z.boolean(),
  submittedAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
}).strict().superRefine((turn, context) => {
  if (turn.status === "processing") {
    if (turn.progress === null) {
      context.addIssue({
        code: "custom",
        path: ["progress"],
        message: "Processing turn requires public progress.",
      });
    }
    if (turn.completedAt !== null || turn.retryEligible) {
      context.addIssue({
        code: "custom",
        path: ["completedAt"],
        message: "Processing turn remains incomplete and owns no retry action.",
      });
    }
    return;
  }
  if (turn.progress !== null) {
    context.addIssue({
      code: "custom",
      path: ["progress"],
      message: "Interrupted or terminal turn carries no progress label.",
    });
  }
  if (turn.status === "interrupted") {
    if (turn.completedAt !== null || !turn.retryEligible) {
      context.addIssue({
        code: "custom",
        path: ["retryEligible"],
        message: "Interrupted turn remains incomplete and exposes resume.",
      });
    }
    return;
  }
  if (turn.completedAt === null || turn.retryEligible) {
    context.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Terminal turn requires completion time and owns no retry action.",
    });
  }
});

const campaignPlayStateBaseSchema = campaignPlayPublicVersionsBaseSchema.extend({
  campaignId: idSchema,
  phase: z.enum(CAMPAIGN_PLAY_PHASE_VALUES),
  character: campaignPlayPublicCharacterSchema.nullable(),
  openingOptions: z.array(campaignPlayOpeningLocationOptionSchema)
    .max(CAMPAIGN_PLAY_LIMITS.openingLocations),
  currentLocation: campaignPlayVisibleLocationSchema.nullable(),
  visibleActors: z.array(campaignPlayVisibleActorSchema)
    .max(CAMPAIGN_PLAY_LIMITS.visibleActors),
  visibleRoutes: z.array(campaignPlayVisibleRouteSchema)
    .max(CAMPAIGN_PLAY_LIMITS.visibleRoutes),
  visiblePressures: z.array(campaignPlayVisiblePressureSchema)
    .max(CAMPAIGN_PLAY_LIMITS.visiblePressures),
  narration: campaignPlayNarrationSchema.nullable(),
  consequences: z.array(campaignPlayConsequenceSchema)
    .max(CAMPAIGN_PLAY_LIMITS.newObservations),
  activeTurn: campaignPlayPublicTurnSchema.nullable(),
  journalCursor: nonnegativeIntegerSchema,
  projectionHash: hashSchema,
}).strict();

export const campaignPlayStateSchema: z.ZodType<CampaignPlayState> =
  campaignPlayStateBaseSchema.superRefine((state, context) => {
    if (state.worldVersion < state.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "worldVersion must include the accepted world base.",
      });
    }
    addDuplicateIssue(
      state.openingOptions.map((option) => option.locationHandle),
      context,
      ["openingOptions"],
      "Opening location handles",
    );
    if (
      (state.phase === "opening_required") !== (state.openingOptions.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["openingOptions"],
        message: "Opening options belong exactly to opening setup.",
      });
    }
    const requireEmptyScene = (): void => {
      if (
        state.currentLocation !== null ||
        state.narration !== null ||
        state.visibleActors.length > 0 ||
        state.visibleRoutes.length > 0 ||
        state.visiblePressures.length > 0 ||
        state.consequences.length > 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["currentLocation"],
          message: "Setup phase carries no live scene projection.",
        });
      }
    };
    if (state.phase === "character_required") {
      if (state.character !== null || state.activeTurn !== null) {
        context.addIssue({
          code: "custom",
          path: ["character"],
          message: "Character setup begins without a character or turn.",
        });
      }
      requireEmptyScene();
    } else if (state.phase === "opening_required") {
      if (
        state.character === null ||
        state.activeTurn !== null ||
        state.openingOptions.length === 0
      ) {
        context.addIssue({
          code: "custom",
          path: ["openingOptions"],
          message: "Opening setup requires a character and bounded starting options.",
        });
      }
      requireEmptyScene();
    } else if (state.phase === "opening_active") {
      if (
        state.character === null ||
        state.activeTurn === null ||
        state.activeTurn.turnKind !== "opening" ||
        (state.activeTurn.status !== "processing" &&
          state.activeTurn.status !== "interrupted") ||
        state.activeTurn.progress === "narrating"
      ) {
        context.addIssue({
          code: "custom",
          path: ["activeTurn"],
          message: "Opening phase requires an admitted or resumable opening turn.",
        });
      }
      requireEmptyScene();
    } else if (state.phase === "ready") {
      if (
        state.character === null ||
        state.currentLocation === null ||
        state.narration === null ||
        state.activeTurn !== null
      ) {
        context.addIssue({
          code: "custom",
          path: ["activeTurn"],
          message: "Ready state requires a settled scene and no active turn.",
        });
      }
    } else if (state.phase === "turn_active") {
      if (
        state.character === null ||
        state.currentLocation === null ||
        state.activeTurn === null ||
        state.activeTurn.turnKind !== "player_action" ||
        (state.activeTurn.status !== "processing" &&
          state.activeTurn.status !== "interrupted") ||
        state.activeTurn.progress === "narrating"
      ) {
        context.addIssue({
          code: "custom",
          path: ["activeTurn"],
          message: "Active phase requires a mechanical turn before narration.",
        });
      }
    } else {
      const narrationProcessing =
        state.activeTurn?.status === "processing" &&
        state.activeTurn.progress === "narrating";
      const narrationInterrupted =
        state.activeTurn?.status === "interrupted" &&
        state.activeTurn.progress === null &&
        state.activeTurn.retryEligible;
      if (
        state.character === null ||
        state.currentLocation === null ||
        (!narrationProcessing && !narrationInterrupted)
      ) {
        context.addIssue({
          code: "custom",
          path: ["activeTurn"],
          message: "Narration phase requires active or resumable narrator work.",
        });
      }
    }
    if (jsonByteLength(state) > CAMPAIGN_PLAY_LIMITS.publicStateBytes) {
      context.addIssue({
        code: "custom",
        path: [],
        message: "Campaign Play state exceeds the public byte limit.",
      });
    }
  });

export const campaignPlayJournalPageSchema: z.ZodType<CampaignPlayJournalPage> =
  campaignPlayPublicVersionsBaseSchema.extend({
    campaignId: idSchema,
    entries: z.array(campaignPlayJournalEntrySchema)
      .max(CAMPAIGN_PLAY_LIMITS.journalPage),
    nextCursor: nonnegativeIntegerSchema.nullable(),
  }).strict().superRefine((page, context) => {
    if (page.worldVersion < page.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "worldVersion must include the accepted world base.",
      });
    }
  });

export const campaignPlayVersionExpectationSchema:
  z.ZodType<CampaignPlayVersionExpectation> = z.object({
    expectedWorldVersion: positiveIntegerSchema,
    expectedRuntimeRevision: positiveIntegerSchema,
  }).strict();

export const campaignPlayTurnAdmissionRequestSchema:
  z.ZodType<CampaignPlayTurnAdmissionRequest> = z.discriminatedUnion("source", [
    z.object({
      source: z.literal("freeform"),
      idempotencyKey: idempotencyKeySchema,
      text: playerInputSchema,
      expectedWorldVersion: positiveIntegerSchema,
      expectedRuntimeRevision: positiveIntegerSchema,
    }).strict(),
    z.object({
      source: z.literal("suggested"),
      idempotencyKey: idempotencyKeySchema,
      choiceHandle: handleSchema,
      expectedWorldVersion: positiveIntegerSchema,
      expectedRuntimeRevision: positiveIntegerSchema,
    }).strict(),
  ]);

export const campaignPlayStartingConditionsSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("delegate") }).strict(),
  z.object({
    mode: z.literal("chosen"),
    locationHandle: handleSchema,
    roleHandle: handleSchema,
    arrivalModeHandle: handleSchema,
    immediateSituationHandle: handleSchema,
  }).strict(),
]);

export const campaignPlayOpeningAdmissionRequestSchema:
  z.ZodType<CampaignPlayOpeningAdmissionRequest> = z.object({
    idempotencyKey: idempotencyKeySchema,
    expectedWorldVersion: positiveIntegerSchema,
    expectedRuntimeRevision: positiveIntegerSchema,
    startingConditions: campaignPlayStartingConditionsSchema,
  }).strict();

export const campaignPlayResumeTurnRequestSchema:
  z.ZodType<CampaignPlayResumeTurnRequest> = z.object({
    expectedWorldVersion: positiveIntegerSchema,
    expectedRuntimeRevision: positiveIntegerSchema,
  }).strict();

export const campaignPlayTurnAdmissionResponseSchema:
  z.ZodType<CampaignPlayTurnAdmissionResponse> = z.object({
    turnId: idSchema,
    sequence: positiveIntegerSchema,
  }).strict();

export const campaignPlayTurnPublicResultSchema =
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("processing") }).strict(),
    z.object({
      status: z.literal("interrupted"),
      errorCode: z.enum(CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES),
    }).strict(),
    z.object({
      status: z.literal("completed"),
      narration: campaignPlayNarrationSchema,
      consequences: z.array(campaignPlayConsequenceSchema)
        .max(CAMPAIGN_PLAY_LIMITS.newObservations),
      journalCursor: nonnegativeIntegerSchema,
    }).strict(),
    z.object({
      status: z.literal("failed"),
      errorCode: z.enum(CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES),
    }).strict(),
  ]);

export const campaignPlayTurnReadResponseSchema:
  z.ZodType<CampaignPlayTurnReadResponse> =
  campaignPlayPublicVersionsBaseSchema.extend({
    campaignId: idSchema,
    turn: campaignPlayPublicTurnSchema,
    result: campaignPlayTurnPublicResultSchema,
  }).strict().superRefine((response, context) => {
    if (response.worldVersion < response.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "worldVersion must include the accepted world base.",
      });
    }
    if (response.turn.status !== response.result.status) {
      context.addIssue({
        code: "custom",
        path: ["result", "status"],
        message: "Turn result status must match the durable public turn.",
      });
    }
    if (
      response.result.status === "completed" &&
      response.result.narration.turnId !== response.turn.turnId
    ) {
      context.addIssue({
        code: "custom",
        path: ["result", "narration", "turnId"],
        message: "Turn narration must belong to the requested durable turn.",
      });
    }
    if (
      response.result.status === "interrupted" &&
      !CAMPAIGN_PLAY_ERROR_METADATA[response.result.errorCode].retryEligible
    ) {
      context.addIssue({
        code: "custom",
        path: ["result", "errorCode"],
        message: "Interrupted turn requires a resumable public error.",
      });
    }
    if (
      response.result.status === "failed" &&
      CAMPAIGN_PLAY_ERROR_METADATA[response.result.errorCode].retryEligible
    ) {
      context.addIssue({
        code: "custom",
        path: ["result", "errorCode"],
        message: "Failed turn requires a terminal public error.",
      });
    }
  });

export const campaignPlayJournalRequestSchema:
  z.ZodType<CampaignPlayJournalRequest> = z.object({
    cursor: nonnegativeIntegerSchema,
    limit: positiveIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.journalPage),
  }).strict();

const characterListSchema = z.array(labelSchema)
  .max(CAMPAIGN_PLAY_LIMITS.characterList);
const optionalCharacterLabelSchema = z.string()
  .max(CAMPAIGN_PLAY_LIMITS.label)
  .refine((value) => value === value.trim(), {
    message: "Text must not contain surrounding whitespace.",
  })
  .refine((value) => !value.includes("\n") && !value.includes("\r"), {
    message: "Text must use one line.",
  });
const optionalCharacterTextSchema = z.string()
  .max(CAMPAIGN_PLAY_LIMITS.text)
  .refine((value) => value === value.trim(), {
    message: "Text must not contain surrounding whitespace.",
  });

export const campaignPlayCharacterPersonalitySchema = z.object({
  summary: optionalCharacterTextSchema,
  voice: optionalCharacterTextSchema,
  decisionStyle: optionalCharacterTextSchema,
  worldview: optionalCharacterTextSchema,
  contradictions: z.array(shortTextSchema).max(CAMPAIGN_PLAY_LIMITS.characterList),
  mythology: optionalCharacterTextSchema,
  sampleLines: z.array(shortTextSchema).max(CAMPAIGN_PLAY_LIMITS.characterList),
}).strict();

export const campaignPlayCharacterSkillSchema = z.object({
  name: labelSchema,
  tier: z.enum(["Novice", "Skilled", "Master"]).nullable(),
}).strict();

export const campaignPlayCharacterDraftSchema:
  z.ZodType<CampaignPlayCharacterDraft> = z.object({
    name: nameSchema,
    summary: textSchema,
    species: optionalCharacterLabelSchema,
    gender: optionalCharacterLabelSchema,
    ageText: optionalCharacterLabelSchema,
    appearance: optionalCharacterTextSchema,
    biography: textSchema,
    personality: campaignPlayCharacterPersonalitySchema,
    motives: characterListSchema,
    beliefs: characterListSchema,
    drives: characterListSchema,
    traits: characterListSchema,
    skills: z.array(campaignPlayCharacterSkillSchema)
      .max(CAMPAIGN_PLAY_LIMITS.characterList),
    flaws: characterListSchema,
    specialties: characterListSchema,
    inventory: characterListSchema,
    signatureItems: characterListSchema,
    source: z.object({
      kind: z.enum(CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES),
      importMode: z.enum(["native", "outsider"]).nullable(),
      label: labelSchema,
    }).strict(),
  }).strict();

export const campaignPlayCharacterResearchSourceSchema = z.object({
  label: labelSchema,
  excerpt: textSchema,
}).strict();

export const campaignPlayCharacterResearchSchema:
  z.ZodType<CampaignPlayCharacterResearch> = z.object({
    summary: textSchema,
    sources: z.array(campaignPlayCharacterResearchSourceSchema)
      .max(CAMPAIGN_PLAY_LIMITS.researchSources),
  }).strict();

const cardJsonSchema = z.string().min(2)
  .refine(
    (value) => Buffer.byteLength(value, "utf-8") <= CAMPAIGN_PLAY_LIMITS.cardBytes,
    { message: "Character card exceeds the byte limit." },
  )
  .refine((value) => {
    try {
      const parsed: unknown = JSON.parse(value);
      return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed);
    } catch {
      return false;
    }
  }, { message: "Character card must be one JSON object." });

export const campaignPlayParsePlayerCardRequestSchema:
  z.ZodType<CampaignPlayParsePlayerCardRequest> = z.object({
    cardJson: cardJsonSchema,
    importMode: z.enum(["native", "outsider"]),
  }).strict();

export const campaignPlayGeneratePlayerDraftRequestSchema:
  z.ZodType<CampaignPlayGeneratePlayerDraftRequest> = z.object({
    prompt: playerInputSchema,
    research: campaignPlayCharacterResearchSchema.nullable(),
  }).strict();

export const campaignPlayResearchPlayerRequestSchema:
  z.ZodType<CampaignPlayResearchPlayerRequest> = z.object({
    query: playerInputSchema,
  }).strict();

export const campaignPlayCharacterDraftResponseSchema:
  z.ZodType<CampaignPlayCharacterDraftResponse> = z.object({
    draft: campaignPlayCharacterDraftSchema,
  }).strict();

export const campaignPlayCharacterResearchResponseSchema:
  z.ZodType<CampaignPlayCharacterResearchResponse> = z.object({
    research: campaignPlayCharacterResearchSchema,
  }).strict();

export const campaignPlayPutPlayerRequestSchema:
  z.ZodType<CampaignPlayPutPlayerRequest> = z.object({
    acceptedWorldVersion: positiveIntegerSchema,
    expectedWorldVersion: positiveIntegerSchema,
    expectedRuntimeRevision: positiveIntegerSchema,
    source: z.enum(CAMPAIGN_PLAY_CHARACTER_SOURCE_VALUES),
    character: campaignPlayCharacterDraftSchema,
  }).strict().superRefine((request, context) => {
    if (request.source !== request.character.source.kind) {
      context.addIssue({
        code: "custom",
        path: ["source"],
        message: "Player source must match the normalized character draft.",
      });
    }
    if (request.expectedWorldVersion !== request.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["expectedWorldVersion"],
        message: "Character bootstrap begins from the accepted world version.",
      });
    }
  });

export const campaignPlayPutPlayerResponseSchema:
  z.ZodType<CampaignPlayPutPlayerResponse> =
  campaignPlayPublicVersionsBaseSchema.extend({
    actorHandle: handleSchema,
  }).strict().superRefine((response, context) => {
    if (response.worldVersion !== response.acceptedWorldVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "Character bootstrap advances one mechanical world version.",
      });
    }
  });

export const CAMPAIGN_PLAY_ERROR_METADATA = {
  campaign_not_found: { status: 404, retryEligible: false, context: "none" },
  world_not_accepted: { status: 422, retryEligible: false, context: "none" },
  world_not_playable: { status: 422, retryEligible: false, context: "play" },
  character_required: { status: 422, retryEligible: false, context: "play" },
  character_already_exists: { status: 409, retryEligible: false, context: "play" },
  opening_required: { status: 422, retryEligible: false, context: "play" },
  opening_already_completed: { status: 409, retryEligible: false, context: "play" },
  invalid_character: { status: 422, retryEligible: false, context: "play" },
  invalid_starting_conditions: { status: 422, retryEligible: false, context: "play" },
  invalid_intent: { status: 422, retryEligible: false, context: "play" },
  invalid_choice: { status: 422, retryEligible: false, context: "play" },
  invalid_event_cursor: { status: 422, retryEligible: false, context: "play" },
  idempotency_conflict: { status: 409, retryEligible: false, context: "play" },
  stale_world_version: { status: 409, retryEligible: false, context: "play" },
  stale_runtime_revision: { status: 409, retryEligible: false, context: "play" },
  turn_in_progress: { status: 409, retryEligible: false, context: "play" },
  turn_not_found: { status: 404, retryEligible: false, context: "play" },
  turn_not_resumable: { status: 409, retryEligible: false, context: "play" },
  turn_interrupted: { status: 503, retryEligible: true, context: "play" },
  turn_failed: { status: 503, retryEligible: false, context: "play" },
  service_unavailable: { status: 503, retryEligible: true, context: "optional" },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES)[number],
  {
    status: 404 | 409 | 422 | 503;
    retryEligible: boolean;
    context: "none" | "play" | "optional";
  }
>;

export const campaignPlayErrorResponseSchema:
  z.ZodType<CampaignPlayErrorResponse> = z.object({
    code: z.enum(CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES),
    status: z.union([
      z.literal(404),
      z.literal(409),
      z.literal(422),
      z.literal(503),
    ]),
    campaignPhase: z.enum(CAMPAIGN_PLAY_PHASE_VALUES).nullable(),
    acceptedWorldVersion: positiveIntegerSchema.nullable(),
    expectedWorldVersion: positiveIntegerSchema.nullable(),
    currentWorldVersion: positiveIntegerSchema.nullable(),
    expectedRuntimeRevision: positiveIntegerSchema.nullable(),
    currentRuntimeRevision: positiveIntegerSchema.nullable(),
    turnId: idSchema.nullable(),
    retryEligible: z.boolean(),
    unmetRequirements: z.array(requirementCodeSchema).max(32),
  }).strict().superRefine((error, context) => {
    const metadata = CAMPAIGN_PLAY_ERROR_METADATA[error.code];
    if (
      error.status !== metadata.status ||
      error.retryEligible !== metadata.retryEligible
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Error status and retry contract must match its code.",
      });
    }
    const playContext = [
      error.campaignPhase,
      error.acceptedWorldVersion,
      error.currentWorldVersion,
      error.currentRuntimeRevision,
    ];
    if (
      metadata.context === "none" &&
      playContext.some((value) => value !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["campaignPhase"],
        message: "Pre-play error carries no invented Campaign Play state.",
      });
    }
    if (
      metadata.context === "play" &&
      playContext.some((value) => value === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["campaignPhase"],
        message: "Play error requires the current versioned state context.",
      });
    }
    if (
      metadata.context === "optional" &&
      playContext.some((value) => value === null) &&
      playContext.some((value) => value !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["campaignPhase"],
        message: "Optional play error context must be complete or absent.",
      });
    }
    if (
      error.code === "stale_world_version" &&
      error.expectedWorldVersion === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedWorldVersion"],
        message: "Stale world error requires the rejected expectation.",
      });
    }
    if (
      error.code === "stale_runtime_revision" &&
      error.expectedRuntimeRevision === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["expectedRuntimeRevision"],
        message: "Stale runtime error requires the rejected expectation.",
      });
    }
    if (
      (error.code === "campaign_not_found" ||
        error.code === "world_not_accepted") &&
      (error.expectedWorldVersion !== null ||
        error.expectedRuntimeRevision !== null ||
        error.turnId !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["turnId"],
        message: "Pre-play error carries no turn or version expectation.",
      });
    }
    if (
      error.code === "world_not_playable" &&
      error.unmetRequirements.length === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["unmetRequirements"],
        message: "world_not_playable requires safe unmet requirement codes.",
      });
    }
  });

const campaignPlaySseBaseShape = {
  sequence: positiveIntegerSchema,
  turnId: idSchema,
  acceptedWorldVersion: positiveIntegerSchema,
  worldVersion: positiveIntegerSchema,
  runtimeRevision: positiveIntegerSchema,
  createdAt: timestampSchema,
};

export const campaignPlaySseEventSchema: z.ZodType<CampaignPlaySseEvent> =
  z.discriminatedUnion("type", [
    z.object({
      ...campaignPlaySseBaseShape,
      type: z.literal("turn.accepted"),
      status: z.literal("processing"),
    }).strict(),
    z.object({
      ...campaignPlaySseBaseShape,
      type: z.literal("turn.progressed"),
      progress: z.enum(CAMPAIGN_PLAY_PUBLIC_PROGRESS_VALUES),
    }).strict(),
    z.object({
      ...campaignPlaySseBaseShape,
      type: z.literal("turn.interrupted"),
      retryEligible: z.literal(true),
    }).strict(),
    z.object({
      ...campaignPlaySseBaseShape,
      type: z.literal("turn.completed"),
      retryEligible: z.literal(false),
    }).strict(),
    z.object({
      ...campaignPlaySseBaseShape,
      type: z.literal("turn.failed"),
      retryEligible: z.literal(false),
      errorCode: z.enum(CAMPAIGN_PLAY_PUBLIC_ERROR_CODE_VALUES),
    }).strict(),
  ]).superRefine((event, context) => {
    if (event.worldVersion < event.acceptedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["worldVersion"],
        message: "worldVersion must include the accepted world base.",
      });
    }
  });

export const campaignPlaySetupPhaseSchema =
  z.enum(CAMPAIGN_PLAY_SETUP_PHASE_VALUES);
export const campaignPlayPhaseSchema = z.enum(CAMPAIGN_PLAY_PHASE_VALUES);
export const campaignTurnKindSchema = z.enum(CAMPAIGN_TURN_KIND_VALUES);
export const campaignTurnStageSchema = z.enum(CAMPAIGN_TURN_STAGE_VALUES);
export const worldIntentKindSchema = z.enum(WORLD_INTENT_KIND_VALUES);
export const campaignPlayJudgmentDispositionSchema =
  z.enum(CAMPAIGN_PLAY_JUDGMENT_DISPOSITION_VALUES);
export const campaignPlayResultTierSchema =
  z.enum(CAMPAIGN_PLAY_RESULT_TIER_VALUES);
export const campaignPlayActorConditionSchema =
  z.enum(CAMPAIGN_PLAY_ACTOR_CONDITION_VALUES);
export const campaignPlayGoalStatusSchema =
  z.enum(CAMPAIGN_PLAY_GOAL_STATUS_VALUES);
export const campaignPlayPressureStatusSchema =
  z.enum(CAMPAIGN_PLAY_PRESSURE_STATUS_VALUES);
export const campaignPlayExposureChannelSchema =
  z.enum(CAMPAIGN_PLAY_EXPOSURE_CHANNEL_VALUES);
export const campaignPlayCommandKindSchema =
  z.enum(CAMPAIGN_PLAY_COMMAND_KIND_VALUES);
export const campaignPlayBootstrapCommandKindSchema =
  z.enum(CAMPAIGN_PLAY_BOOTSTRAP_COMMAND_KIND_VALUES);
export const campaignPlayWorldEventKindSchema =
  z.enum(CAMPAIGN_PLAY_WORLD_EVENT_KIND_VALUES);
export const campaignPlayActorJobStageSchema =
  z.enum(CAMPAIGN_PLAY_ACTOR_JOB_STAGE_VALUES);
export const campaignPlayRuntimeEventKindSchema =
  z.enum(CAMPAIGN_PLAY_RUNTIME_EVENT_KIND_VALUES);

export const campaignPlayResultBoundsSchema = z.object({
  minimum: campaignPlayResultTierSchema,
  maximum: campaignPlayResultTierSchema,
}).strict().superRefine((bounds, context) => {
  const rank = new Map(
    CAMPAIGN_PLAY_RESULT_TIER_VALUES.map((tier, index) => [tier, index]),
  );
  if ((rank.get(bounds.minimum) ?? 0) > (rank.get(bounds.maximum) ?? 0)) {
    context.addIssue({
      code: "custom",
      path: ["maximum"],
      message: "Result bounds must be ordered.",
    });
  }
});

export const campaignPlayElapsedBoundsSchema = z.object({
  minimumMinutes: nonnegativeIntegerSchema.max(
    CAMPAIGN_PLAY_LIMITS.elapsedMinutes,
  ),
  maximumMinutes: nonnegativeIntegerSchema.max(
    CAMPAIGN_PLAY_LIMITS.elapsedMinutes,
  ),
}).strict().superRefine((bounds, context) => {
  if (bounds.minimumMinutes > bounds.maximumMinutes) {
    context.addIssue({
      code: "custom",
      path: ["maximumMinutes"],
      message: "Elapsed-time bounds must be ordered.",
    });
  }
});

export const campaignPlayUncertaintySpecSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("none") }).strict(),
  z.object({
    kind: z.literal("check"),
    dieSides: z.literal(20),
    difficulty: z.number().int().min(1).max(20),
    modifierMinimum: z.number().int().min(-10).max(10),
    modifierMaximum: z.number().int().min(-10).max(10),
  }).strict().superRefine((check, context) => {
    if (check.modifierMinimum > check.modifierMaximum) {
      context.addIssue({
        code: "custom",
        path: ["modifierMaximum"],
        message: "Modifier bounds must be ordered.",
      });
    }
  }),
]);

const campaignPlayJudgeRulingBaseSchema = z.object({
  disposition: campaignPlayJudgmentDispositionSchema,
  normalizedIntent: playerIntentSchema,
  movementRouteHandle: handleSchema.nullable(),
  citedVisibleFactHandles: z.array(handleSchema)
    .max(CAMPAIGN_PLAY_LIMITS.citedFacts),
  resultBounds: campaignPlayResultBoundsSchema,
  elapsedBounds: campaignPlayElapsedBoundsSchema,
  uncertainty: campaignPlayUncertaintySpecSchema,
  reason: reasoningTextSchema,
  clarificationQuestion: shortTextSchema.nullable(),
}).strict();

export const campaignPlayJudgeRulingSchema =
  campaignPlayJudgeRulingBaseSchema.superRefine((ruling, context) => {
    const movementRouteIsTarget = ruling.movementRouteHandle === null
      || ruling.normalizedIntent.targets.some((target) =>
        target.kind === "route" && target.handle === ruling.movementRouteHandle);
    if (ruling.normalizedIntent.kind === "move" && ruling.movementRouteHandle === null) {
      context.addIssue({
        code: "custom",
        path: ["movementRouteHandle"],
        message: "Move intent requires an explicit movement route handle.",
      });
    }
    if (!movementRouteIsTarget) {
      context.addIssue({
        code: "custom",
        path: ["movementRouteHandle"],
        message: "Movement route handle must identify an explicit route target.",
      });
    }
    addDuplicateIssue(
      ruling.citedVisibleFactHandles,
      context,
      ["citedVisibleFactHandles"],
      "Cited visible fact handles",
    );
    if (
      ruling.disposition === "uncertain" &&
      ruling.uncertainty.kind !== "check"
    ) {
      context.addIssue({
        code: "custom",
        path: ["uncertainty"],
        message: "Uncertain judgment requires a code-owned check.",
      });
    }
    if (
      ruling.disposition !== "uncertain" &&
      ruling.uncertainty.kind !== "none"
    ) {
      context.addIssue({
        code: "custom",
        path: ["uncertainty"],
        message: "Only uncertain judgment may request a check.",
      });
    }
    const asksClarification = ruling.disposition === "clarification_required";
    if (asksClarification !== (ruling.clarificationQuestion !== null)) {
      context.addIssue({
        code: "custom",
        path: ["clarificationQuestion"],
        message: "Clarification question must match the judgment disposition.",
      });
    }
    if (
      (ruling.disposition === "impossible" || asksClarification) &&
      (
        ruling.resultBounds.minimum !== "no_effect" ||
        ruling.resultBounds.maximum !== "no_effect"
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultBounds"],
        message: "Impossible and clarification judgments have no mechanical result range.",
      });
    }
    if (
      (ruling.disposition === "deterministic" || ruling.disposition === "uncertain") &&
      (ruling.resultBounds.minimum === "no_effect" || ruling.resultBounds.maximum === "no_effect")
    ) {
      context.addIssue({
        code: "custom",
        path: ["resultBounds"],
        message: "Actionable judgments require a mechanical result range.",
      });
    }
    if (
      ruling.disposition === "uncertain" && ruling.uncertainty.kind === "check" &&
      (ruling.uncertainty.modifierMinimum > 0 || ruling.uncertainty.modifierMaximum < 0)
    ) {
      context.addIssue({
        code: "custom",
        path: ["uncertainty"],
        message: "The current code-owned uncertainty modifier requires a range containing zero.",
      });
    }
  });

export const campaignPlayUncertaintyResolutionSchema =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("deterministic"),
      result: campaignPlayResultTierSchema,
    }).strict(),
    z.object({
      kind: z.literal("rolled"),
      dieSides: z.literal(20),
      roll: z.number().int().min(1).max(20),
      modifier: z.number().int().min(-10).max(10),
      total: z.number().int().min(-9).max(30),
      seedHash: hashSchema,
      result: campaignPlayResultTierSchema,
    }).strict().superRefine((resolution, context) => {
      if (resolution.roll + resolution.modifier !== resolution.total) {
        context.addIssue({
          code: "custom",
          path: ["total"],
          message: "Roll total must equal roll plus modifier.",
        });
      }
    }),
  ]);

export const campaignPlayUncertaintyAuthoritySchema = z.object({
  seedMaterial: z.string().min(1).max(1_000),
  modifier: z.number().int().min(-10).max(10),
}).strict();

export const campaignPlayJudgePublicResultSchema = z.object({
  intentKind: worldIntentKindSchema,
  disposition: campaignPlayJudgmentDispositionSchema,
  result: campaignPlayResultTierSchema,
  clarificationQuestion: shortTextSchema.nullable(),
}).strict();

export const campaignPlayJudgePrimaryPlanSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("game_master_required") }).strict(),
  z.object({
    kind: z.literal("no_effect"),
    reason: z.enum(["impossible", "clarification_required"]),
    commands: z.tuple([]),
  }).strict(),
]);

export const campaignPlayJudgeArtifactSchema = z.object({
  ruling: campaignPlayJudgeRulingSchema,
  resolution: campaignPlayUncertaintyResolutionSchema,
  uncertaintyAuthority: campaignPlayUncertaintyAuthoritySchema.nullable(),
  publicResult: campaignPlayJudgePublicResultSchema,
  primaryPlan: campaignPlayJudgePrimaryPlanSchema,
}).strict().superRefine((artifact, context) => {
  const uncertain = artifact.ruling.disposition === "uncertain";
  if (uncertain !== (artifact.uncertaintyAuthority !== null)) {
    context.addIssue({
      code: "custom",
      path: ["uncertaintyAuthority"],
      message: "Uncertainty authority belongs exactly to an uncertain ruling.",
    });
  }
  if (uncertain !== (artifact.resolution.kind === "rolled")) {
    context.addIssue({
      code: "custom",
      path: ["resolution"],
      message: "Resolution kind must match the ruling disposition.",
    });
  }
  if (
    artifact.uncertaintyAuthority !== null &&
    artifact.ruling.uncertainty.kind === "check" &&
    (
      artifact.uncertaintyAuthority.modifier < artifact.ruling.uncertainty.modifierMinimum ||
      artifact.uncertaintyAuthority.modifier > artifact.ruling.uncertainty.modifierMaximum
    )
  ) {
    context.addIssue({
      code: "custom",
      path: ["uncertaintyAuthority", "modifier"],
      message: "Uncertainty modifier must stay inside the accepted ruling bounds.",
    });
  }
  const expectedPublicResult = {
    intentKind: artifact.ruling.normalizedIntent.kind,
    disposition: artifact.ruling.disposition,
    result: artifact.resolution.result,
    clarificationQuestion: artifact.ruling.clarificationQuestion,
  };
  if (
    JSON.stringify(artifact.publicResult) !== JSON.stringify(expectedPublicResult)
  ) {
    context.addIssue({
      code: "custom",
      path: ["publicResult"],
      message: "Public Judge result must be derived from the accepted ruling and resolution.",
    });
  }
  const noEffect = artifact.ruling.disposition === "impossible" ||
    artifact.ruling.disposition === "clarification_required";
  if (noEffect) {
    if (
      artifact.primaryPlan.kind !== "no_effect" ||
      artifact.primaryPlan.reason !== artifact.ruling.disposition ||
      artifact.resolution.result !== "no_effect"
    ) {
      context.addIssue({
        code: "custom",
        path: ["primaryPlan"],
        message: "No-effect plan must match its impossible or clarification ruling.",
      });
    }
  } else if (artifact.primaryPlan.kind !== "game_master_required") {
    context.addIssue({
      code: "custom",
      path: ["primaryPlan"],
      message: "Actionable rulings require Game Master planning.",
    });
  }
});

export const campaignPlayEntityRefSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("actor"), id: idSchema }).strict(),
  z.object({ kind: z.literal("location"), id: idSchema }).strict(),
  z.object({ kind: z.literal("route"), id: idSchema }).strict(),
  z.object({ kind: z.literal("relation"), id: idSchema }).strict(),
  z.object({ kind: z.literal("goal"), id: idSchema }).strict(),
  z.object({ kind: z.literal("pressure"), id: idSchema }).strict(),
  z.object({ kind: z.literal("world_event"), id: idSchema }).strict(),
]);

export const campaignPlayCommandSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("actor"), actorId: idSchema }).strict(),
  z.object({
    kind: z.literal("system"),
    system: z.enum(CAMPAIGN_PLAY_SYSTEM_SOURCE_VALUES),
  }).strict(),
]);

export const campaignPlayCausalParentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("accepted_world"),
    campaignId: idSchema,
    acceptedWorldVersion: positiveIntegerSchema,
    acceptedContentHash: hashSchema,
  }).strict(),
  z.object({ kind: z.literal("turn"), turnId: idSchema }).strict(),
  z.object({ kind: z.literal("command"), commandId: idSchema }).strict(),
  z.object({ kind: z.literal("world_event"), eventId: idSchema }).strict(),
  z.object({ kind: z.literal("actor_job"), jobId: idSchema }).strict(),
]);

export const campaignPlayExposurePredicateSchema =
  z.discriminatedUnion("channel", [
    z.object({
      channel: z.literal("direct_perception"),
      locationId: idSchema,
    }).strict(),
    z.object({
      channel: z.literal("local_aftermath"),
      locationId: idSchema,
      validUntilWorldTimeMinutes: worldTimeSchema,
    }).strict(),
    z.object({
      channel: z.literal("route_state"),
      routeId: idSchema,
      triggers: z.array(z.enum(["inspect", "attempt", "traverse"]))
        .min(1)
        .max(3),
    }).strict().superRefine((predicate, context) => {
      addDuplicateIssue(
        predicate.triggers,
        context,
        ["triggers"],
        "Route exposure triggers",
      );
    }),
    z.object({
      channel: z.literal("witness_report"),
      witnessActorId: idSchema,
    }).strict(),
  ]);

const campaignPlayEventExposureBaseShape = {
  exposureId: idSchema,
  campaignId: idSchema,
  eventId: idSchema,
  createdAt: timestampSchema,
};

export const campaignPlayEventExposureSchema = z.discriminatedUnion("channel", [
  z.object({
    ...campaignPlayEventExposureBaseShape,
    channel: z.literal("direct_perception"),
    locationId: idSchema,
  }).strict(),
  z.object({
    ...campaignPlayEventExposureBaseShape,
    channel: z.literal("local_aftermath"),
    locationId: idSchema,
    validUntilWorldTimeMinutes: worldTimeSchema,
  }).strict(),
  z.object({
    ...campaignPlayEventExposureBaseShape,
    channel: z.literal("route_state"),
    routeId: idSchema,
    triggers: z.array(z.enum(["inspect", "attempt", "traverse"]))
      .min(1)
      .max(3),
  }).strict().superRefine((exposure, context) => {
    addDuplicateIssue(
      exposure.triggers,
      context,
      ["triggers"],
      "Route exposure triggers",
    );
  }),
  z.object({
    ...campaignPlayEventExposureBaseShape,
    channel: z.literal("witness_report"),
    witnessActorId: idSchema,
  }).strict(),
]);

export const campaignPlayEpistemicSourceSchema = z.discriminatedUnion("channel", [
  z.object({
    channel: z.literal("direct_perception"),
    locationId: idSchema,
    perceivedActorId: idSchema.nullable(),
  }).strict(),
  z.object({
    channel: z.literal("local_aftermath"),
    locationId: idSchema,
  }).strict(),
  z.object({
    channel: z.literal("route_state"),
    routeId: idSchema,
    trigger: z.enum(["inspect", "attempt", "traverse"]),
  }).strict(),
  z.object({
    channel: z.literal("witness_report"),
    witnessActorId: idSchema,
  }).strict(),
]);

export const campaignPlayExposurePolicySchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("protected") }).strict(),
  z.object({
    mode: z.literal("projectable"),
    predicates: z.array(campaignPlayExposurePredicateSchema)
      .min(1)
      .max(CAMPAIGN_PLAY_LIMITS.exposuresPerEvent),
  }).strict(),
]);

const campaignPlayCommandBaseShape = {
  commandId: idSchema,
  batchId: idSchema,
  order: z.number().int().min(0).max(CAMPAIGN_PLAY_LIMITS.commandsPerBatch - 1),
  causalParent: campaignPlayCausalParentSchema,
  source: campaignPlayCommandSourceSchema,
  expectedWorldVersion: positiveIntegerSchema,
  readScope: z.array(campaignPlayEntityRefSchema)
    .max(CAMPAIGN_PLAY_LIMITS.scopes),
  writeScope: z.array(campaignPlayEntityRefSchema)
    .max(CAMPAIGN_PLAY_LIMITS.scopes),
  exposure: campaignPlayExposurePolicySchema,
};

export const advanceWorldTimeCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("advance_world_time"),
  elapsedMinutes: positiveIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.elapsedMinutes),
}).strict();

export const moveActorCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("move_actor"),
  actorId: idSchema,
  routeId: idSchema,
  fromLocationId: idSchema,
  toLocationId: idSchema,
}).strict();

export const setRouteStateCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("set_route_state"),
  routeId: idSchema,
  state: z.enum(CAMPAIGN_PLAY_ROUTE_STATE_VALUES),
  reason: shortTextSchema,
}).strict();

export const setActorConditionCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("set_actor_condition"),
  actorId: idSchema,
  condition: campaignPlayActorConditionSchema,
  operation: z.enum(["set", "clear"]),
  summary: shortTextSchema,
}).strict();

export const updateActorRelationCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("update_actor_relation"),
  relationId: idSchema,
  intensity: z.number().int().min(1).max(5),
  summary: shortTextSchema,
}).strict();

export const updateActorGoalCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("update_actor_goal"),
  goalId: idSchema,
  status: campaignPlayGoalStatusSchema,
  summary: shortTextSchema,
}).strict();

export const advancePressureCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("advance_pressure"),
  pressureId: idSchema,
  amount: positiveIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.pressureAdvance),
  resultStatus: campaignPlayPressureStatusSchema,
}).strict();

export const recordWorldEventCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("record_world_event"),
  eventClass: z.enum(["dialogue", "interaction", "discovery", "scene"]),
  summary: textSchema,
  observableTrace: textSchema.nullable(),
  affectedRefs: z.array(campaignPlayEntityRefSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.affectedRefs),
}).strict();

export const createPlayerActorCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("create_player_actor"),
  actorId: idSchema,
  characterDigest: hashSchema,
  name: nameSchema,
  summary: textSchema,
  traits: z.array(labelSchema).max(20),
  tags: z.array(labelSchema).max(20),
}).strict();

export const initializePlayerPlacementCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("initialize_player_placement"),
  actorId: idSchema,
  locationId: idSchema,
}).strict();

export const initializeWorldTimeCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("initialize_world_time"),
  worldTimeMinutes: worldTimeSchema,
}).strict();

export const initializePressureStateCommandSchema = z.object({
  ...campaignPlayCommandBaseShape,
  kind: z.literal("initialize_pressure_state"),
  pressureId: idSchema,
  progress: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.pressureProgress),
  status: campaignPlayPressureStatusSchema,
}).strict();

export const campaignPlayCommandSchema = z.discriminatedUnion("kind", [
  advanceWorldTimeCommandSchema,
  moveActorCommandSchema,
  setRouteStateCommandSchema,
  setActorConditionCommandSchema,
  updateActorRelationCommandSchema,
  updateActorGoalCommandSchema,
  advancePressureCommandSchema,
  recordWorldEventCommandSchema,
]);

export const campaignPlayBootstrapCommandSchema = z.discriminatedUnion("kind", [
  createPlayerActorCommandSchema,
  initializePlayerPlacementCommandSchema,
  initializeWorldTimeCommandSchema,
  initializePressureStateCommandSchema,
]);

export const rulebookBatchCommandSchema = z.discriminatedUnion("kind", [
  advanceWorldTimeCommandSchema,
  moveActorCommandSchema,
  setRouteStateCommandSchema,
  setActorConditionCommandSchema,
  updateActorRelationCommandSchema,
  updateActorGoalCommandSchema,
  advancePressureCommandSchema,
  recordWorldEventCommandSchema,
  createPlayerActorCommandSchema,
  initializePlayerPlacementCommandSchema,
  initializeWorldTimeCommandSchema,
  initializePressureStateCommandSchema,
]);

export type CampaignPlayCommand = z.infer<typeof campaignPlayCommandSchema>;
export type CampaignPlayBootstrapCommand =
  z.infer<typeof campaignPlayBootstrapCommandSchema>;
export type RulebookBatchCommand = z.infer<typeof rulebookBatchCommandSchema>;

export const campaignPlayGameMasterPlanSchema = z.object({
  commands: z.array(campaignPlayCommandSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.commandsPerBatch),
}).strict();

export const rulebookCommandBatchSchema = z.object({
  batchId: idSchema,
  baseWorldVersion: positiveIntegerSchema,
  commands: z.array(rulebookBatchCommandSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.commandsPerBatch),
}).strict().superRefine((batch, context) => {
  addDuplicateIssue(
    batch.commands.map((command) => command.commandId),
    context,
    ["commands"],
    "Command IDs",
  );
  let expectedWorldVersion = batch.baseWorldVersion;
  batch.commands.forEach((command, index) => {
    const readScopeKeys = command.readScope.map(entityRefKey);
    const writeScopeKeys = command.writeScope.map(entityRefKey);
    if (new Set(readScopeKeys).size !== readScopeKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "readScope"],
        message: "Command read scope must be unique.",
      });
    }
    if (new Set(writeScopeKeys).size !== writeScopeKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "writeScope"],
        message: "Command write scope must be unique.",
      });
    }
    if (command.batchId !== batch.batchId) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "batchId"],
        message: "Command batchId must match its batch.",
      });
    }
    if (command.order !== index) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "order"],
        message: "Command order must be contiguous from zero.",
      });
    }
    if (command.expectedWorldVersion !== expectedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "expectedWorldVersion"],
        message: "Command expectedWorldVersion does not match batch order.",
      });
    }
    if (CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation) {
      expectedWorldVersion += 1;
    }
  });
});

export const campaignPlayGameMasterArtifactSchema = z.object({
  judgeArtifactHash: hashSchema,
  batch: rulebookCommandBatchSchema,
  batchHash: hashSchema,
}).strict();

function entityRefKey(reference: z.infer<typeof campaignPlayEntityRefSchema>): string {
  return `${reference.kind}\u0000${reference.id}`;
}

const campaignPlayWorldEventBaseShape = {
  eventId: idSchema,
  campaignId: idSchema,
  turnId: idSchema.nullable(),
  commandId: idSchema,
  receiptId: idSchema,
  parentEventId: idSchema.nullable(),
  source: campaignPlayCommandSourceSchema,
  worldTimeMinutes: worldTimeSchema,
  worldVersion: positiveIntegerSchema,
  affectedRefs: z.array(campaignPlayEntityRefSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.affectedRefs),
  exposures: z.array(campaignPlayEventExposureSchema)
    .max(CAMPAIGN_PLAY_LIMITS.exposuresPerEvent),
  payloadHash: hashSchema,
  createdAt: timestampSchema,
};

export const playerActorCreatedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("player_actor_created"),
  actorId: idSchema,
}).strict();

export const playerPlacementInitializedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("player_placement_initialized"),
  actorId: idSchema,
  locationId: idSchema,
}).strict();

export const worldTimeInitializedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("world_time_initialized"),
  worldTimeMinutes: worldTimeSchema,
}).strict();

export const pressureInitializedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("pressure_initialized"),
  pressureId: idSchema,
  progress: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.pressureProgress),
  status: campaignPlayPressureStatusSchema,
}).strict();

export const worldTimeAdvancedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("world_time_advanced"),
  priorWorldTimeMinutes: worldTimeSchema,
  resultWorldTimeMinutes: worldTimeSchema,
}).strict().superRefine((event, context) => {
  if (event.resultWorldTimeMinutes <= event.priorWorldTimeMinutes) {
    context.addIssue({
      code: "custom",
      path: ["resultWorldTimeMinutes"],
      message: "World time must advance.",
    });
  }
});

export const actorMovedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("actor_moved"),
  actorId: idSchema,
  routeId: idSchema,
  fromLocationId: idSchema,
  toLocationId: idSchema,
}).strict();

export const routeStateChangedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("route_state_changed"),
  routeId: idSchema,
  priorState: z.enum(CAMPAIGN_PLAY_ROUTE_STATE_VALUES),
  resultState: z.enum(CAMPAIGN_PLAY_ROUTE_STATE_VALUES),
}).strict().superRefine((event, context) => {
  if (event.priorState === event.resultState) {
    context.addIssue({
      code: "custom",
      path: ["resultState"],
      message: "Route-state event requires a changed state.",
    });
  }
});

export const actorConditionChangedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("actor_condition_changed"),
  actorId: idSchema,
  condition: campaignPlayActorConditionSchema,
  operation: z.enum(["set", "clear"]),
  priorPresent: z.boolean(),
  resultPresent: z.boolean(),
  summary: shortTextSchema,
}).strict().superRefine((event, context) => {
  const expected = event.operation === "set"
    ? { prior: false, result: true }
    : { prior: true, result: false };
  if (
    event.priorPresent !== expected.prior ||
    event.resultPresent !== expected.result
  ) {
    context.addIssue({
      code: "custom",
      path: ["resultPresent"],
      message: "Actor condition event requires explicit changed presence.",
    });
  }
});

export const actorRelationChangedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("actor_relation_changed"),
  relationId: idSchema,
  priorIntensity: z.number().int().min(1).max(5),
  resultIntensity: z.number().int().min(1).max(5),
  priorSummary: shortTextSchema,
  resultSummary: shortTextSchema,
}).strict().superRefine((event, context) => {
  if (
    event.priorIntensity === event.resultIntensity &&
    event.priorSummary === event.resultSummary
  ) {
    context.addIssue({
      code: "custom",
      path: ["resultIntensity"],
      message: "Actor relation event requires changed state.",
    });
  }
});

export const actorGoalChangedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("actor_goal_changed"),
  goalId: idSchema,
  priorStatus: campaignPlayGoalStatusSchema,
  resultStatus: campaignPlayGoalStatusSchema,
  priorSummary: shortTextSchema,
  resultSummary: shortTextSchema,
}).strict().superRefine((event, context) => {
  if (
    event.priorStatus === event.resultStatus &&
    event.priorSummary === event.resultSummary
  ) {
    context.addIssue({
      code: "custom",
      path: ["resultStatus"],
      message: "Actor goal event requires changed state.",
    });
  }
});

export const pressureAdvancedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("pressure_advanced"),
  pressureId: idSchema,
  priorProgress: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.pressureProgress),
  resultProgress: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.pressureProgress),
  priorStatus: campaignPlayPressureStatusSchema,
  resultStatus: campaignPlayPressureStatusSchema,
}).strict().superRefine((event, context) => {
  if (event.resultProgress < event.priorProgress) {
    context.addIssue({
      code: "custom",
      path: ["resultProgress"],
      message: "Pressure progress must move forward.",
    });
  }
  if (
    event.resultProgress === event.priorProgress &&
    event.resultStatus === event.priorStatus
  ) {
    context.addIssue({
      code: "custom",
      path: ["resultProgress"],
      message: "Pressure event requires changed progress or status.",
    });
  }
});

export const sceneRecordedEventSchema = z.object({
  ...campaignPlayWorldEventBaseShape,
  kind: z.literal("scene_recorded"),
  eventClass: z.enum(["dialogue", "interaction", "discovery", "scene"]),
  summary: textSchema,
}).strict();

const campaignPlayWorldEventUnionSchema = z.union([
  playerActorCreatedEventSchema,
  playerPlacementInitializedEventSchema,
  worldTimeInitializedEventSchema,
  pressureInitializedEventSchema,
  worldTimeAdvancedEventSchema,
  actorMovedEventSchema,
  routeStateChangedEventSchema,
  actorConditionChangedEventSchema,
  actorRelationChangedEventSchema,
  actorGoalChangedEventSchema,
  pressureAdvancedEventSchema,
  sceneRecordedEventSchema,
]);

export const campaignPlayWorldEventSchema =
  campaignPlayWorldEventUnionSchema.superRefine((event, context) => {
    addDuplicateIssue(
      event.affectedRefs.map(entityRefKey),
      context,
      ["affectedRefs"],
      "Affected references",
    );
    addDuplicateIssue(
      event.exposures.map((exposure) => exposure.exposureId),
      context,
      ["exposures"],
      "Event exposure IDs",
    );
    event.exposures.forEach((exposure, index) => {
      if (
        exposure.campaignId !== event.campaignId ||
        exposure.eventId !== event.eventId
      ) {
        context.addIssue({
          code: "custom",
          path: ["exposures", index],
          message: "Event exposure must belong to its campaign and world event.",
        });
      }
    });
  });

export type CampaignPlayWorldEvent = z.infer<typeof campaignPlayWorldEventSchema>;

export const campaignPlayReceiptSchema = z.object({
  receiptId: idSchema,
  campaignId: idSchema,
  turnId: idSchema.nullable(),
  commandId: idSchema,
  commandKind: z.union([
    campaignPlayCommandKindSchema,
    campaignPlayBootstrapCommandKindSchema,
  ]),
  outcome: z.literal("applied"),
  appliedWorldMutation: z.boolean(),
  priorWorldVersion: positiveIntegerSchema,
  resultWorldVersion: positiveIntegerSchema,
  priorWorldHash: hashSchema,
  resultWorldHash: hashSchema,
  causalEventIds: z.array(idSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.eventsPerReceipt),
  createdAt: timestampSchema,
}).strict().superRefine((receipt, context) => {
  const expectedMutation =
    CAMPAIGN_PLAY_COMMAND_METADATA[receipt.commandKind].mechanicalMutation;
  if (receipt.appliedWorldMutation !== expectedMutation) {
    context.addIssue({
      code: "custom",
      path: ["appliedWorldMutation"],
      message: "Receipt mutation authority must match its command kind.",
    });
  }
  addDuplicateIssue(
    receipt.causalEventIds,
    context,
    ["causalEventIds"],
    "Causal event IDs",
  );
  if (receipt.appliedWorldMutation) {
    if (receipt.resultWorldVersion !== receipt.priorWorldVersion + 1) {
      context.addIssue({
        code: "custom",
        path: ["resultWorldVersion"],
        message: "Mechanical mutation advances one logical world version.",
      });
    }
    if (receipt.priorWorldHash === receipt.resultWorldHash) {
      context.addIssue({
        code: "custom",
        path: ["resultWorldHash"],
        message: "Mechanical mutation requires a changed world hash.",
      });
    }
  } else if (
    receipt.resultWorldVersion !== receipt.priorWorldVersion ||
    receipt.resultWorldHash !== receipt.priorWorldHash
  ) {
    context.addIssue({
      code: "custom",
      path: ["resultWorldVersion"],
      message: "Non-mutating receipt preserves world version and hash.",
    });
  }
});

export type CampaignPlayReceipt = z.infer<typeof campaignPlayReceiptSchema>;

export const campaignPlayPlanPreconditionSchema =
  z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("actor_at_location"),
      actorId: idSchema,
      locationId: idSchema,
    }).strict(),
    z.object({
      kind: z.literal("route_state"),
      routeId: idSchema,
      state: z.enum(CAMPAIGN_PLAY_ROUTE_STATE_VALUES),
    }).strict(),
    z.object({
      kind: z.literal("goal_status"),
      goalId: idSchema,
      status: campaignPlayGoalStatusSchema,
    }).strict(),
    z.object({
      kind: z.literal("pressure_status"),
      pressureId: idSchema,
      status: campaignPlayPressureStatusSchema,
    }).strict(),
    z.object({
      kind: z.literal("actor_condition"),
      actorId: idSchema,
      condition: campaignPlayActorConditionSchema,
      present: z.boolean(),
    }).strict(),
  ]);

export const campaignPlayActorIntentSchema = z.object({
  kind: worldIntentKindSchema,
  targets: z.array(campaignPlayEntityRefSchema)
    .max(CAMPAIGN_PLAY_LIMITS.targets),
  method: shortTextSchema.nullable(),
  stakes: shortTextSchema.nullable(),
}).strict();

export const campaignPlayActorPlanStepSchema = z.object({
  stepId: idSchema,
  order: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.planSteps - 1),
  intent: campaignPlayActorIntentSchema,
  observableTrace: shortTextSchema,
  elapsedBounds: campaignPlayElapsedBoundsSchema,
}).strict();

export const campaignPlayActorPlanSchema = z.object({
  planId: idSchema,
  campaignId: idSchema,
  actorId: idSchema,
  goalId: idSchema,
  planVersion: positiveIntegerSchema,
  intent: campaignPlayActorIntentSchema,
  preconditions: z.array(campaignPlayPlanPreconditionSchema)
    .max(CAMPAIGN_PLAY_LIMITS.preconditionsPerPlan),
  cadenceMinutes: positiveIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.elapsedMinutes),
  priority: z.number().int().min(1).max(5),
  steps: z.array(campaignPlayActorPlanStepSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.planSteps),
  status: z.enum(["active", "completed", "blocked"]),
}).strict().superRefine((plan, context) => {
  addDuplicateIssue(
    plan.steps.map((step) => step.stepId),
    context,
    ["steps"],
    "Plan step IDs",
  );
  plan.steps.forEach((step, index) => {
    if (step.order !== index) {
      context.addIssue({
        code: "custom",
        path: ["steps", index, "order"],
        message: "Plan step order must be contiguous from zero.",
      });
    }
  });
});

export const campaignPlayActorScheduleSchema = z.object({
  scheduleId: idSchema,
  campaignId: idSchema,
  actorId: idSchema,
  planId: idSchema,
  nextActAtWorldTimeMinutes: worldTimeSchema,
  lastActAtWorldTimeMinutes: worldTimeSchema.nullable(),
  priority: z.number().int().min(1).max(5),
  agencyDebt: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.agencyDebt),
}).strict();

const campaignPlayActorDueDecisionBaseShape = {
  dueOrder: nonnegativeIntegerSchema,
  actorId: idSchema,
  scheduleId: idSchema,
  planId: idSchema,
  nextActAtWorldTimeMinutes: worldTimeSchema,
  priority: z.number().int().min(1).max(5),
  agencyDebt: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.agencyDebt),
  cadenceMinutes: positiveIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.elapsedMinutes),
};

export const campaignPlayActorDueDecisionSchema = z.discriminatedUnion(
  "disposition",
  [
    z.object({
      ...campaignPlayActorDueDecisionBaseShape,
      disposition: z.literal("wake"),
      dueReason: z.enum(["scheduled", "agency_debt", "plan_retry"]),
      jobId: idSchema,
    }).strict(),
    z.object({
      ...campaignPlayActorDueDecisionBaseShape,
      disposition: z.literal("defer"),
      dueReason: z.enum(["scheduled", "agency_debt", "plan_retry"]),
      reason: z.enum(["incapacitated", "actor_capacity"]),
      jobId: idSchema,
      nextDueAtWorldTimeMinutes: worldTimeSchema,
      resultAgencyDebt: nonnegativeIntegerSchema.max(CAMPAIGN_PLAY_LIMITS.agencyDebt),
    }).strict(),
    z.object({
      ...campaignPlayActorDueDecisionBaseShape,
      disposition: z.literal("skip"),
      reason: z.enum([
        "already_considered_this_turn",
        "pending_job",
        "actor_ineligible",
      ]),
    }).strict(),
  ],
);

export const campaignPlayActorDueSetSchema = z.object({
  campaignId: idSchema,
  turnId: idSchema,
  settledWorldTimeMinutes: worldTimeSchema,
  baseWorldVersion: positiveIntegerSchema,
  baseRuntimeRevision: positiveIntegerSchema,
  decisions: z.array(campaignPlayActorDueDecisionSchema),
}).strict().superRefine((dueSet, context) => {
  const wakeCount = dueSet.decisions.filter((decision) => decision.disposition === "wake").length;
  if (wakeCount > CAMPAIGN_PLAY_LIMITS.actorOpportunitiesPerTurn) {
    context.addIssue({
      code: "custom",
      path: ["decisions"],
      message: "Due set exceeds the per-turn actor opportunity limit.",
    });
  }
  addDuplicateIssue(
    dueSet.decisions.map((decision) => decision.actorId),
    context,
    ["decisions"],
    "Due-set actor IDs",
  );
  addDuplicateIssue(
    dueSet.decisions.map((decision) => decision.scheduleId),
    context,
    ["decisions"],
    "Due-set schedule IDs",
  );
  dueSet.decisions.forEach((decision, index) => {
    if (decision.dueOrder !== index) {
      context.addIssue({
        code: "custom",
        path: ["decisions", index, "dueOrder"],
        message: "Due-set order must be contiguous from zero.",
      });
    }
  });
});

export const campaignPlayActorJobSchema = z.object({
  jobId: idSchema,
  campaignId: idSchema,
  turnId: idSchema,
  actorId: idSchema,
  admittedPlanId: idSchema,
  planId: idSchema,
  dueReason: z.enum(["scheduled", "agency_debt", "plan_retry"]),
  frozenBaseWorldVersion: positiveIntegerSchema,
  workerEpoch: nonnegativeIntegerSchema,
  claimTurnWorkerEpoch: positiveIntegerSchema.nullable(),
  stage: campaignPlayActorJobStageSchema,
  proposalId: idSchema.nullable(),
  deferReason: z.enum(["incapacitated", "actor_capacity", "replan_capacity"]).nullable(),
  createdAt: timestampSchema,
  completedAt: timestampSchema.nullable(),
}).strict().superRefine((job, context) => {
  const terminal = ["settled", "rejected", "deferred"].includes(job.stage);
  if (terminal !== (job.completedAt !== null)) {
    context.addIssue({
      code: "custom",
      path: ["completedAt"],
      message: "Actor job completion time must match its terminal stage.",
    });
  }
  if (
    (job.stage === "proposed" || job.stage === "settled") &&
    job.proposalId === null
  ) {
    context.addIssue({
      code: "custom",
      path: ["proposalId"],
      message: "Proposed or settled actor job requires a proposal.",
    });
  }
  if ((job.stage === "deferred") !== (job.deferReason !== null)) {
    context.addIssue({
      code: "custom",
      path: ["deferReason"],
      message: "Only a deferred actor job has a defer reason.",
    });
  }
  if (
    ["claimed", "interrupted", "proposed"].includes(job.stage) &&
    job.claimTurnWorkerEpoch === null
  ) {
    context.addIssue({
      code: "custom",
      path: ["claimTurnWorkerEpoch"],
      message: "Active actor work requires its owning turn worker epoch.",
    });
  }
  if (job.stage === "queued" && job.claimTurnWorkerEpoch !== null) {
    context.addIssue({
      code: "custom",
      path: ["claimTurnWorkerEpoch"],
      message: "Queued actor work has no owning turn worker epoch.",
    });
  }
  if (job.stage === "queued" && job.workerEpoch !== 0) {
    context.addIssue({
      code: "custom",
      path: ["workerEpoch"],
      message: "Queued actor work starts before any actor worker claim.",
    });
  }
});

export const campaignPlayActorProposalResultSchema =
  z.discriminatedUnion("status", [
    z.object({ status: z.literal("pending") }).strict(),
    z.object({
      status: z.literal("accepted"),
      receiptIds: z.array(idSchema)
        .min(1)
        .max(CAMPAIGN_PLAY_LIMITS.commandsPerBatch),
    }).strict().superRefine((result, context) => {
      addDuplicateIssue(
        result.receiptIds,
        context,
        ["receiptIds"],
        "Proposal receipt IDs",
      );
    }),
    z.object({
      status: z.literal("rejected"),
      reason: z.enum([
        "stale_world_version",
        "precondition_failed",
        "scope_denied",
        "command_denied",
        "expired",
      ]),
    }).strict(),
  ]);

export const campaignPlayActorProposalSchema = z.object({
  proposalId: idSchema,
  batchId: idSchema,
  jobId: idSchema,
  actorId: idSchema,
  causalParent: campaignPlayCausalParentSchema,
  baseWorldVersion: positiveIntegerSchema,
  readScope: z.array(campaignPlayEntityRefSchema)
    .max(CAMPAIGN_PLAY_LIMITS.scopes),
  writeScope: z.array(campaignPlayEntityRefSchema)
    .max(CAMPAIGN_PLAY_LIMITS.scopes),
  expiresAtWorldTimeMinutes: worldTimeSchema,
  commands: z.array(campaignPlayCommandSchema)
    .min(1)
    .max(CAMPAIGN_PLAY_LIMITS.planSteps),
  result: campaignPlayActorProposalResultSchema,
}).strict().superRefine((proposal, context) => {
  if (
    proposal.causalParent.kind !== "actor_job" ||
    proposal.causalParent.jobId !== proposal.jobId
  ) {
    context.addIssue({
      code: "custom",
      path: ["causalParent"],
      message: "Actor proposal must descend from its actor job.",
    });
  }
  addDuplicateIssue(
    proposal.readScope.map(entityRefKey),
    context,
    ["readScope"],
    "Proposal read scope",
  );
  addDuplicateIssue(
    proposal.writeScope.map(entityRefKey),
    context,
    ["writeScope"],
    "Proposal write scope",
  );
  const proposalReadScopeKeys = proposal.readScope.map(entityRefKey);
  const proposalWriteScopeKeys = proposal.writeScope.map(entityRefKey);
  const commandReadScopeKeys = [...new Set(
    proposal.commands.flatMap((command) => command.readScope.map(entityRefKey)),
  )];
  const commandWriteScopeKeys = [...new Set(
    proposal.commands.flatMap((command) => command.writeScope.map(entityRefKey)),
  )];
  if (
    proposalReadScopeKeys.length !== commandReadScopeKeys.length ||
    proposalReadScopeKeys.some((key) => !commandReadScopeKeys.includes(key))
  ) {
    context.addIssue({
      code: "custom",
      path: ["readScope"],
      message: "Proposal read scope must equal its command read-scope union.",
    });
  }
  if (
    proposalWriteScopeKeys.length !== commandWriteScopeKeys.length ||
    proposalWriteScopeKeys.some((key) => !commandWriteScopeKeys.includes(key))
  ) {
    context.addIssue({
      code: "custom",
      path: ["writeScope"],
      message: "Proposal write scope must equal its command write-scope union.",
    });
  }
  addDuplicateIssue(
    proposal.commands.map((command) => command.commandId),
    context,
    ["commands"],
    "Proposal command IDs",
  );
  if (
    proposal.result.status === "accepted" &&
    proposal.result.receiptIds.length !== proposal.commands.length
  ) {
    context.addIssue({
      code: "custom",
      path: ["result", "receiptIds"],
      message: "Accepted proposal requires one receipt per command.",
    });
  }
  let expectedWorldVersion = proposal.baseWorldVersion;
  proposal.commands.forEach((command, index) => {
    if (
      command.source.kind !== "actor" ||
      command.source.actorId !== proposal.actorId
    ) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "source"],
        message: "Proposal commands must be sourced by the proposing actor.",
      });
    }
    if (
      command.causalParent.kind !== "actor_job" ||
      command.causalParent.jobId !== proposal.jobId
    ) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "causalParent"],
        message: "Proposal commands must descend from the proposal actor job.",
      });
    }
    addDuplicateIssue(
      command.readScope.map(entityRefKey),
      context,
      ["commands", index, "readScope"],
      "Proposal command read scope",
    );
    addDuplicateIssue(
      command.writeScope.map(entityRefKey),
      context,
      ["commands", index, "writeScope"],
      "Proposal command write scope",
    );
    if (command.batchId !== proposal.batchId) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "batchId"],
        message: "Proposal command batchId must match its proposal.",
      });
    }
    if (command.order !== index) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "order"],
        message: "Proposal command order must be contiguous from zero.",
      });
    }
    if (command.expectedWorldVersion !== expectedWorldVersion) {
      context.addIssue({
        code: "custom",
        path: ["commands", index, "expectedWorldVersion"],
        message: "Proposal command version must follow its frozen base.",
      });
    }
    if (CAMPAIGN_PLAY_COMMAND_METADATA[command.kind].mechanicalMutation) {
      expectedWorldVersion += 1;
    }
  });
});

export const campaignPlayActorKnowledgeSchema = z.object({
  knowledgeId: idSchema,
  campaignId: idSchema,
  actorId: idSchema,
  eventId: idSchema,
  exposureId: idSchema,
  source: campaignPlayEpistemicSourceSchema,
  learnedAtWorldTimeMinutes: worldTimeSchema,
  createdAt: timestampSchema,
}).strict();

export const campaignPlayObservationSchema = z.object({
  observationId: idSchema,
  campaignId: idSchema,
  humanActorId: idSchema,
  eventId: idSchema,
  exposureId: idSchema,
  source: campaignPlayEpistemicSourceSchema,
  publicEntry: campaignPlayJournalEntrySchema,
  worldTimeMinutes: worldTimeSchema,
  createdAt: timestampSchema,
}).strict();

export const campaignPlayRuntimeEventSchema = z.object({
  kind: campaignPlayRuntimeEventKindSchema,
  eventId: idSchema,
  campaignId: idSchema,
  sequence: positiveIntegerSchema,
  turnId: idSchema.nullable(),
  workerEpoch: nonnegativeIntegerSchema.nullable(),
  worldVersion: positiveIntegerSchema,
  priorRuntimeRevision: nonnegativeIntegerSchema,
  resultRuntimeRevision: positiveIntegerSchema,
  priorRuntimeHash: hashSchema,
  resultRuntimeHash: hashSchema,
  protectedPayloadHash: hashSchema,
  createdAt: timestampSchema,
}).strict().superRefine((event, context) => {
  const metadata = CAMPAIGN_PLAY_RUNTIME_EVENT_METADATA[event.kind];
  if (metadata.turnOwned !== (event.turnId !== null)) {
    context.addIssue({
      code: "custom",
      path: ["turnId"],
      message: "Runtime event turn ownership must match its mutation kind.",
    });
  }
  const fencedKinds = new Set([
    "worker_claimed",
    "worker_lease_renewed",
    "stage_accepted",
    "primary_settled",
    "actor_job_transitioned",
    "visibility_projected",
    "turn_interrupted",
    "turn_resumed",
    "turn_completed",
    "turn_failed",
  ]);
  if (fencedKinds.has(event.kind) !== (event.workerEpoch !== null)) {
    context.addIssue({
      code: "custom",
      path: ["workerEpoch"],
      message: "Fenced runtime transition requires its worker epoch.",
    });
  }
  if (event.resultRuntimeRevision !== event.priorRuntimeRevision + 1) {
    context.addIssue({
      code: "custom",
      path: ["resultRuntimeRevision"],
      message: "Runtime event advances exactly one revision.",
    });
  }
  if (event.priorRuntimeHash === event.resultRuntimeHash) {
    context.addIssue({
      code: "custom",
      path: ["resultRuntimeHash"],
      message: "Runtime event requires a changed runtime hash.",
    });
  }
});

export const CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES = [
  "invalid_input",
  "worker_lease_lost",
  "stale_artifact",
  "model_contract_invalid",
  "stage_budget_exceeded",
  "stage_timeout",
  "rulebook_denied",
  "persistence_failed",
  "provider_unavailable",
  "narration_invalid",
] as const;

export const campaignPlayInterruptionSchema = z.object({
  interruptedStage: z.enum([
    "admitted",
    "judged",
    "planned",
    "primary_settled",
    "actors_settled",
    "visibility_projected",
  ]),
  workerEpoch: positiveIntegerSchema,
  errorCode: z.enum(CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES),
  resumeEligible: z.literal(true),
}).strict();

export const campaignPlayNarrationArtifactSchema =
  z.discriminatedUnion("status", [
    z.object({
      status: z.literal("pending"),
      narrationId: idSchema,
      turnId: idSchema,
      packetHash: hashSchema,
      narration: z.null(),
      errorCode: z.null(),
    }).strict(),
    z.object({
      status: z.literal("complete"),
      narrationId: idSchema,
      turnId: idSchema,
      packetHash: hashSchema,
      narration: campaignPlayNarrationSchema,
      errorCode: z.null(),
    }).strict(),
    z.object({
      status: z.literal("invalid"),
      narrationId: idSchema,
      turnId: idSchema,
      packetHash: hashSchema,
      narration: z.null(),
      errorCode: z.literal("narration_invalid"),
    }).strict(),
  ]);

export const CAMPAIGN_PLAY_MODEL_STAGE_KIND_VALUES = [
  "judge",
  "game_master",
  "opening_planner",
  "actor_replanner",
  "narrator",
] as const;

const modelStageArtifactJsonSchema = z.string().min(1).superRefine(
  (artifactJson, context) => {
    try {
      JSON.parse(artifactJson);
    } catch {
      context.addIssue({
        code: "custom",
        message: "Model stage artifact bytes must contain valid JSON.",
      });
    }
  },
);

export const campaignPlayModelStageSchema = z.object({
  stageId: idSchema,
  campaignId: idSchema,
  turnId: idSchema.nullable(),
  kind: z.enum(CAMPAIGN_PLAY_MODEL_STAGE_KIND_VALUES),
  attempt: positiveIntegerSchema,
  status: z.enum(CAMPAIGN_PLAY_MODEL_STAGE_STATUS_VALUES),
  workerEpoch: positiveIntegerSchema,
  requestedProviderId: idSchema,
  requestedModel: labelSchema,
  requestedStrategy: z.literal("strict_object"),
  actualProviderId: idSchema.nullable(),
  actualModel: labelSchema.nullable(),
  actualStrategy: z.literal("strict_object").nullable(),
  inputTokens: nonnegativeIntegerSchema.nullable(),
  outputTokens: nonnegativeIntegerSchema.nullable(),
  durationMs: nonnegativeIntegerSchema.nullable(),
  finishReason: labelSchema.nullable(),
  schemaOutcome: z.enum(["pending", "valid", "invalid", "transport_error"]),
  artifactJson: modelStageArtifactJsonSchema.nullable(),
  artifactHash: hashSchema.nullable(),
  errorCode: z.enum(CAMPAIGN_PLAY_INTERNAL_ERROR_CODE_VALUES).nullable(),
}).strict().superRefine((stage, context) => {
  const actualEvidence = [
    stage.actualProviderId,
    stage.actualModel,
    stage.actualStrategy,
  ];
  if (stage.status === "started") {
    if (
      stage.schemaOutcome !== "pending" ||
      stage.artifactJson !== null ||
      stage.artifactHash !== null ||
      stage.errorCode !== null ||
      actualEvidence.some((value) => value !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Started model stage carries only requested execution evidence.",
      });
    }
    return;
  }
  if (stage.status === "accepted") {
    if (
      stage.schemaOutcome !== "valid" ||
      stage.artifactJson === null ||
      stage.artifactHash === null ||
      stage.errorCode !== null ||
      actualEvidence.some((value) => value === null) ||
      stage.inputTokens === null ||
      stage.outputTokens === null ||
      stage.durationMs === null ||
      stage.finishReason === null
    ) {
      context.addIssue({
        code: "custom",
        path: ["status"],
        message: "Accepted model stage requires complete actual and artifact evidence.",
      });
    }
    return;
  }
  if (
    stage.artifactJson !== null ||
    stage.artifactHash !== null ||
    stage.errorCode === null ||
    stage.durationMs === null ||
    (stage.status === "interrupted" &&
      stage.schemaOutcome !== "invalid" &&
      stage.schemaOutcome !== "transport_error") ||
    (stage.status === "failed" &&
      stage.schemaOutcome !== "invalid" &&
      stage.schemaOutcome !== "transport_error")
  ) {
    context.addIssue({
      code: "custom",
      path: ["status"],
      message: "Unaccepted model stage requires typed terminal evidence and no artifact.",
    });
  }
});

export const CAMPAIGN_PLAY_WORLD_EVENT_METADATA = {
  player_actor_created: { commandKind: "create_player_actor" },
  player_placement_initialized: { commandKind: "initialize_player_placement" },
  world_time_initialized: { commandKind: "initialize_world_time" },
  pressure_initialized: { commandKind: "initialize_pressure_state" },
  world_time_advanced: { commandKind: "advance_world_time" },
  actor_moved: { commandKind: "move_actor" },
  route_state_changed: { commandKind: "set_route_state" },
  actor_condition_changed: { commandKind: "set_actor_condition" },
  actor_relation_changed: { commandKind: "update_actor_relation" },
  actor_goal_changed: { commandKind: "update_actor_goal" },
  pressure_advanced: { commandKind: "advance_pressure" },
  scene_recorded: { commandKind: "record_world_event" },
} as const satisfies Record<
  CampaignPlayWorldEventKind,
  { commandKind: RulebookBatchCommandKind }
>;

export const CAMPAIGN_PLAY_RUNTIME_EVENT_METADATA = {
  play_state_created: { turnOwned: false },
  character_created: { turnOwned: false },
  turn_admitted: { turnOwned: true },
  worker_claimed: { turnOwned: true },
  worker_lease_renewed: { turnOwned: true },
  stage_accepted: { turnOwned: true },
  primary_settled: { turnOwned: true },
  actor_job_transitioned: { turnOwned: true },
  visibility_projected: { turnOwned: true },
  turn_interrupted: { turnOwned: true },
  turn_resumed: { turnOwned: true },
  turn_completed: { turnOwned: true },
  turn_failed: { turnOwned: true },
} as const satisfies Record<
  CampaignPlayRuntimeEventKind,
  { turnOwned: boolean }
>;

export const CAMPAIGN_PLAY_JUDGMENT_METADATA = {
  deterministic: { uncertaintyKind: "none" },
  uncertain: { uncertaintyKind: "check" },
  impossible: { uncertaintyKind: "none" },
  clarification_required: { uncertaintyKind: "none" },
} as const satisfies Record<
  CampaignPlayJudgmentDisposition,
  { uncertaintyKind: "none" | "check" }
>;

export const CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_METADATA = {
  deterministic: { rolled: false },
  rolled: { rolled: true },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_UNCERTAINTY_RESOLUTION_KIND_VALUES)[number],
  { rolled: boolean }
>;

export const CAMPAIGN_PLAY_PLAN_PRECONDITION_METADATA = {
  actor_at_location: { targetKind: "actor" },
  route_state: { targetKind: "route" },
  goal_status: { targetKind: "goal" },
  pressure_status: { targetKind: "pressure" },
  actor_condition: { targetKind: "actor" },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_PLAN_PRECONDITION_KIND_VALUES)[number],
  { targetKind: "actor" | "route" | "goal" | "pressure" }
>;

export const CAMPAIGN_PLAY_CAUSAL_PARENT_METADATA = {
  accepted_world: { idField: "acceptedWorldVersion" },
  turn: { idField: "turnId" },
  command: { idField: "commandId" },
  world_event: { idField: "eventId" },
  actor_job: { idField: "jobId" },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_CAUSAL_PARENT_KIND_VALUES)[number],
  {
    idField:
      | "acceptedWorldVersion"
      | "turnId"
      | "commandId"
      | "eventId"
      | "jobId";
  }
>;

export const CAMPAIGN_PLAY_COMMAND_SOURCE_METADATA = {
  actor: { modelProposalSource: true },
  system: { modelProposalSource: false },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_COMMAND_SOURCE_KIND_VALUES)[number],
  { modelProposalSource: boolean }
>;

export const CAMPAIGN_PLAY_EXPOSURE_POLICY_METADATA = {
  protected: { predicateMinimum: 0 },
  projectable: { predicateMinimum: 1 },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_EXPOSURE_POLICY_MODE_VALUES)[number],
  { predicateMinimum: 0 | 1 }
>;

export const CAMPAIGN_PLAY_ACTOR_JOB_STAGE_METADATA = {
  queued: { terminal: false },
  claimed: { terminal: false },
  interrupted: { terminal: false },
  proposed: { terminal: false },
  settled: { terminal: true },
  rejected: { terminal: true },
  deferred: { terminal: true },
} as const satisfies Record<
  CampaignPlayActorJobStage,
  { terminal: boolean }
>;

export const CAMPAIGN_PLAY_PROPOSAL_STATUS_METADATA = {
  pending: { terminal: false },
  accepted: { terminal: true },
  rejected: { terminal: true },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_PROPOSAL_STATUS_VALUES)[number],
  { terminal: boolean }
>;

export const CAMPAIGN_PLAY_MODEL_STAGE_STATUS_METADATA = {
  started: { terminal: false },
  accepted: { terminal: true },
  interrupted: { terminal: true },
  failed: { terminal: true },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_MODEL_STAGE_STATUS_VALUES)[number],
  { terminal: boolean }
>;

export type CampaignPlayResultBounds =
  z.infer<typeof campaignPlayResultBoundsSchema>;
export type CampaignPlayElapsedBounds =
  z.infer<typeof campaignPlayElapsedBoundsSchema>;
export type CampaignPlayUncertaintySpec =
  z.infer<typeof campaignPlayUncertaintySpecSchema>;
export type CampaignPlayJudgeRuling =
  z.infer<typeof campaignPlayJudgeRulingSchema>;
export type CampaignPlayUncertaintyResolution =
  z.infer<typeof campaignPlayUncertaintyResolutionSchema>;
export type CampaignPlayUncertaintyAuthority =
  z.infer<typeof campaignPlayUncertaintyAuthoritySchema>;
export type CampaignPlayJudgePublicResult =
  z.infer<typeof campaignPlayJudgePublicResultSchema>;
export type CampaignPlayJudgePrimaryPlan =
  z.infer<typeof campaignPlayJudgePrimaryPlanSchema>;
export type CampaignPlayJudgeArtifact =
  z.infer<typeof campaignPlayJudgeArtifactSchema>;
export type CampaignPlayGameMasterArtifact =
  z.infer<typeof campaignPlayGameMasterArtifactSchema>;
export type CampaignPlayEntityRef =
  z.infer<typeof campaignPlayEntityRefSchema>;
export type CampaignPlayCommandSource =
  z.infer<typeof campaignPlayCommandSourceSchema>;
export type CampaignPlayCausalParent =
  z.infer<typeof campaignPlayCausalParentSchema>;
export type CampaignPlayExposurePredicate =
  z.infer<typeof campaignPlayExposurePredicateSchema>;
export type CampaignPlayEventExposure =
  z.infer<typeof campaignPlayEventExposureSchema>;
export type CampaignPlayEpistemicSource =
  z.infer<typeof campaignPlayEpistemicSourceSchema>;
export type CampaignPlayExposurePolicy =
  z.infer<typeof campaignPlayExposurePolicySchema>;
export type RulebookCommandBatch =
  z.infer<typeof rulebookCommandBatchSchema>;
export type CampaignPlayPlanPrecondition =
  z.infer<typeof campaignPlayPlanPreconditionSchema>;
export type CampaignPlayActorIntent =
  z.infer<typeof campaignPlayActorIntentSchema>;
export type CampaignPlayActorPlanStep =
  z.infer<typeof campaignPlayActorPlanStepSchema>;
export type CampaignPlayActorPlan =
  z.infer<typeof campaignPlayActorPlanSchema>;
export type CampaignPlayActorSchedule =
  z.infer<typeof campaignPlayActorScheduleSchema>;
export type CampaignPlayActorDueDecision =
  z.infer<typeof campaignPlayActorDueDecisionSchema>;
export type CampaignPlayActorDueSet =
  z.infer<typeof campaignPlayActorDueSetSchema>;
export type CampaignPlayActorJob =
  z.infer<typeof campaignPlayActorJobSchema>;
export type CampaignPlayActorProposalResult =
  z.infer<typeof campaignPlayActorProposalResultSchema>;
export type CampaignPlayActorProposal =
  z.infer<typeof campaignPlayActorProposalSchema>;
export type CampaignPlayActorKnowledge =
  z.infer<typeof campaignPlayActorKnowledgeSchema>;
export type CampaignPlayObservation =
  z.infer<typeof campaignPlayObservationSchema>;
export type CampaignPlayRuntimeEvent =
  z.infer<typeof campaignPlayRuntimeEventSchema>;
export type CampaignPlayInterruption =
  z.infer<typeof campaignPlayInterruptionSchema>;
export type CampaignPlayNarrationArtifact =
  z.infer<typeof campaignPlayNarrationArtifactSchema>;
export type CampaignPlayModelStage =
  z.infer<typeof campaignPlayModelStageSchema>;

export type CampaignPlayContractErrorCode =
  | "invalid_starting_conditions"
  | "stale_world_version"
  | "stale_runtime_revision"
  | "narration_invalid"
  | "epistemic_provenance_invalid";

export class CampaignPlayContractError extends Error {
  constructor(
    readonly code: CampaignPlayContractErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CampaignPlayContractError";
  }
}

export function validateCampaignPlayStartingConditionsAgainstOptions(
  startingConditions: CampaignPlayStartingConditions,
  openingOptions: readonly CampaignPlayOpeningLocationOption[],
): void {
  const parsed = campaignPlayStartingConditionsSchema.parse(startingConditions);
  const parsedOptions = openingOptions.map((option) =>
    campaignPlayOpeningLocationOptionSchema.parse(option)
  );
  if (parsed.mode === "delegate") {
    return;
  }
  const location = parsedOptions.find((option) =>
    option.locationHandle === parsed.locationHandle
  );
  if (location === undefined) {
    throw new CampaignPlayContractError(
      "invalid_starting_conditions",
      "Chosen starting location does not match the public opening options.",
    );
  }
  const selections = [
    [location.roles, parsed.roleHandle, "role"],
    [location.arrivalModes, parsed.arrivalModeHandle, "arrival mode"],
    [location.immediateSituations, parsed.immediateSituationHandle, "immediate situation"],
  ] as const;
  for (const [options, selectedHandle, label] of selections) {
    if (!options.some((option) => option.handle === selectedHandle)) {
      throw new CampaignPlayContractError(
        "invalid_starting_conditions",
        `Chosen ${label} does not match the selected location options.`,
      );
    }
  }
}

function epistemicSourceMatchesExposure(
  source: CampaignPlayEpistemicSource,
  exposure: CampaignPlayEventExposure,
): boolean {
  if (source.channel !== exposure.channel) {
    return false;
  }
  switch (exposure.channel) {
    case "direct_perception":
      return source.channel === "direct_perception" &&
        source.locationId === exposure.locationId;
    case "local_aftermath":
      return source.channel === "local_aftermath" &&
        source.locationId === exposure.locationId;
    case "route_state":
      return source.channel === "route_state" &&
        source.routeId === exposure.routeId &&
        exposure.triggers.includes(source.trigger);
    case "witness_report":
      return source.channel === "witness_report" &&
        source.witnessActorId === exposure.witnessActorId;
  }
}

function validateEpistemicProvenance(
  record: {
    campaignId: string;
    eventId: string;
    exposureId: string;
    source: CampaignPlayEpistemicSource;
  },
  exposure: CampaignPlayEventExposure,
): void {
  if (
    record.campaignId !== exposure.campaignId ||
    record.eventId !== exposure.eventId ||
    record.exposureId !== exposure.exposureId ||
    !epistemicSourceMatchesExposure(record.source, exposure)
  ) {
    throw new CampaignPlayContractError(
      "epistemic_provenance_invalid",
      "Knowledge or observation provenance does not match its event exposure.",
    );
  }
}

export function validateCampaignPlayActorKnowledgeAgainstExposure(
  knowledge: CampaignPlayActorKnowledge,
  exposure: CampaignPlayEventExposure,
): void {
  const parsedKnowledge = campaignPlayActorKnowledgeSchema.parse(knowledge);
  const parsedExposure = campaignPlayEventExposureSchema.parse(exposure);
  validateEpistemicProvenance(parsedKnowledge, parsedExposure);
}

export function validateCampaignPlayObservationAgainstExposure(
  observation: CampaignPlayObservation,
  exposure: CampaignPlayEventExposure,
): void {
  const parsedObservation = campaignPlayObservationSchema.parse(observation);
  const parsedExposure = campaignPlayEventExposureSchema.parse(exposure);
  validateEpistemicProvenance(parsedObservation, parsedExposure);
}

export function validateCampaignPlayVersionExpectation(
  expectation: CampaignPlayVersionExpectation,
  current: { worldVersion: number; runtimeRevision: number },
): void {
  campaignPlayVersionExpectationSchema.parse(expectation);
  if (expectation.expectedWorldVersion !== current.worldVersion) {
    throw new CampaignPlayContractError(
      "stale_world_version",
      "Expected mechanical world version is stale.",
    );
  }
  if (expectation.expectedRuntimeRevision !== current.runtimeRevision) {
    throw new CampaignPlayContractError(
      "stale_runtime_revision",
      "Expected runtime revision is stale.",
    );
  }
}

export function assertNever(value: never): never {
  throw new Error(`Unhandled Campaign Play contract variant: ${String(value)}`);
}

export const CAMPAIGN_PLAY_COMMAND_METADATA = {
  advance_world_time: { modelVisible: true, mechanicalMutation: true },
  move_actor: { modelVisible: true, mechanicalMutation: true },
  set_route_state: { modelVisible: true, mechanicalMutation: true },
  set_actor_condition: { modelVisible: true, mechanicalMutation: true },
  update_actor_relation: { modelVisible: true, mechanicalMutation: true },
  update_actor_goal: { modelVisible: true, mechanicalMutation: true },
  advance_pressure: { modelVisible: true, mechanicalMutation: true },
  record_world_event: { modelVisible: true, mechanicalMutation: false },
  create_player_actor: { modelVisible: false, mechanicalMutation: true },
  initialize_player_placement: { modelVisible: false, mechanicalMutation: true },
  initialize_world_time: { modelVisible: false, mechanicalMutation: true },
  initialize_pressure_state: { modelVisible: false, mechanicalMutation: true },
} as const satisfies Record<
  RulebookBatchCommandKind,
  { modelVisible: boolean; mechanicalMutation: boolean }
>;

export const CAMPAIGN_PLAY_TURN_STAGE_METADATA = {
  admitted: { terminal: false, external: true },
  judged: { terminal: false, external: true },
  planned: { terminal: false, external: false },
  primary_settled: { terminal: false, external: false },
  actors_settled: { terminal: false, external: false },
  visibility_projected: { terminal: false, external: true },
  interrupted: { terminal: false, external: false },
  completed: { terminal: true, external: false },
  failed: { terminal: true, external: false },
} as const satisfies Record<
  (typeof CAMPAIGN_TURN_STAGE_VALUES)[number],
  { terminal: boolean; external: boolean }
>;

export const CAMPAIGN_PLAY_EXPOSURE_METADATA = {
  direct_perception: { playerInitiated: false },
  local_aftermath: { playerInitiated: true },
  route_state: { playerInitiated: true },
  witness_report: { playerInitiated: true },
} as const satisfies Record<
  CampaignPlayExposureChannel,
  { playerInitiated: boolean }
>;

export const CAMPAIGN_PLAY_SSE_METADATA = {
  "turn.accepted": { terminal: false },
  "turn.progressed": { terminal: false },
  "turn.interrupted": { terminal: false },
  "turn.completed": { terminal: true },
  "turn.failed": { terminal: true },
} as const satisfies Record<
  (typeof CAMPAIGN_PLAY_SSE_EVENT_TYPE_VALUES)[number],
  { terminal: boolean }
>;
