import { z } from "zod";

const shortText = z.string().trim().min(1).max(500);
const rationaleText = z.string().trim().min(1).max(2000);
const modelSafeRef = z.string().trim().min(1).max(200);

function normalizedContractRef(value: string): string {
  return value.trim().toLowerCase();
}

const BACKEND_REF_PREFIXES = new Set([
  "actor",
  "campaign",
  "edge",
  "fact",
  "frame",
  "item",
  "knowledge",
  "loc",
  "location",
  "npc",
  "packet",
  "player",
  "route",
  "scene",
  "turn",
  "world",
]);

function isAsciiAlphaNumeric(char: string): boolean {
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122);
}

function isHexToken(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    const isHex =
      (code >= 48 && code <= 57)
      || (code >= 65 && code <= 70)
      || (code >= 97 && code <= 102);
    if (!isHex) return false;
  }
  return value.length > 0;
}

function tokenishValues(value: string): string[] {
  const tokens: string[] = [];
  let current = "";
  const flush = (): void => {
    if (current.length > 0) tokens.push(current);
    current = "";
  };

  for (const char of value) {
    if (isAsciiAlphaNumeric(char) || char === ":" || char === "_" || char === "-") {
      current += char;
    } else {
      flush();
    }
  }
  flush();
  return tokens;
}

function isUuidLikeBackendIdToken(token: string): boolean {
  const parts = token.split("-");
  return parts.length === 5
    && parts[0]?.length === 8
    && parts[1]?.length === 4
    && parts[2]?.length === 4
    && parts[3]?.length === 4
    && parts[4]?.length === 12
    && parts.every(isHexToken);
}

function isBackendRefToken(token: string): boolean {
  const lower = token.toLowerCase();
  const colonIndex = lower.indexOf(":");
  if (colonIndex > 0 && BACKEND_REF_PREFIXES.has(lower.slice(0, colonIndex)) && colonIndex < lower.length - 1) {
    return true;
  }

  if (lower.startsWith("pdto_")) return true;

  const underscoreIndex = lower.indexOf("_");
  if (underscoreIndex > 0 && BACKEND_REF_PREFIXES.has(lower.slice(0, underscoreIndex)) && underscoreIndex < lower.length - 1) {
    return true;
  }

  return false;
}

function containsUuidLikeBackendId(value: string): boolean {
  return tokenishValues(value).some(isUuidLikeBackendIdToken);
}

function containsBackendRefToken(value: string): boolean {
  return tokenishValues(value).some(isBackendRefToken);
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
  "local_observation",
  "device_surface_observation",
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
  kind: z.enum(["actor", "item", "location", "faction", "place_handle", "unknown"]),
  holder: z.object({
    holderKind: z.enum(["player", "visible_actor", "current_scene"]),
    holderLabel: shortText,
    equipState: z.enum(["carried", "equipped"]).nullable(),
  }).nullable().optional(),
});

export const inventoryItemViewSchema = z.object({
  ref: modelSafeRef,
  label: shortText,
  equipState: z.enum(["carried", "equipped"]),
  tags: z.array(shortText).max(12),
});

export const cleanDeviceFacetKindSchema = z.enum([
  "screen_state",
  "power_indicator",
  "battery_indicator",
  "signal_indicator",
  "notification_indicator",
  "message_indicator",
  "call_indicator",
]);

export const sceneFrameDeviceStatusSurfaceSchema = z.object({
  surfaceVersion: z.literal("scene_frame_device_status_surface.v1"),
  deviceRef: modelSafeRef,
  deviceLabel: shortText,
  deviceKind: z.enum(["phone", "radio", "tablet", "laptop", "terminal", "other_device"]),
  holderScope: z.enum(["player_inventory", "player_equipped", "current_scene_visible"]),
  anchorRef: modelSafeRef,
  availableFacetKinds: z.array(cleanDeviceFacetKindSchema).max(7),
  facets: z.array(z.object({
    facetKind: cleanDeviceFacetKindSchema,
    displayLabel: shortText,
    valueText: shortText,
    valueClass: z.enum(["visible_status_text", "indicator_state", "meter_value", "icon_state"]),
    publicSafe: z.literal(true),
  }).strict()).max(12),
}).strict().superRefine((surface, ctx) => {
  const available = new Set(surface.availableFacetKinds);
  surface.facets.forEach((facet, index) => {
    if (!available.has(facet.facetKind)) {
      ctx.addIssue({
        code: "custom",
        path: ["facets", index, "facetKind"],
        message: "Device surface facets must be listed in availableFacetKinds.",
      });
    }
  });
});

export const cleanMinorPoiKindSchema = z.enum([
  "stall",
  "counter",
  "bench",
  "landmark",
  "signage",
  "cover",
  "doorway",
  "alcove",
  "workstation",
  "notice_board",
  "other_place",
]);

export const sceneFrameCurrentPlaceHandleSurfaceSchema = z.object({
  surfaceVersion: z.literal("scene_frame_current_place_handle_surface.v1"),
  anchorRef: modelSafeRef,
  anchorLabel: shortText,
  allowedPlaceKinds: z.array(cleanMinorPoiKindSchema).min(1).max(16),
  existingPlaceHandleRefs: z.array(modelSafeRef).max(32),
  maxCreatesPerTurn: z.literal(1),
  creationAuthority: z.literal("ordinary_public_visible_current_scene_handle_only"),
}).strict();

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
  deviceStatusSurfaces: z.array(sceneFrameDeviceStatusSurfaceSchema).max(32).optional(),
  currentScenePlaceHandleSurface: sceneFrameCurrentPlaceHandleSurfaceSchema.optional(),
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

export const cleanSupportActorRoleKindSchema = z.enum([
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
]);

export const cleanLocalConditionKeySchema = z.enum([
  "kneeling",
  "crouched",
  "prone",
  "taking_cover",
  "keeping_distance",
  "stepped_back",
  "braced",
  "hands_visible",
  "hands_raised",
  "gripping_held_item",
]);

export const cleanLocalConditionTargetKindSchema = z.enum([
  "current_scene",
  "visible_actor_distance",
  "visible_scene_anchor",
  "inventory_item_readiness",
]);

export const cleanItemTransferOperationSchema = z.enum([
  "give_to_visible_actor",
  "receive_from_visible_actor",
  "drop_in_current_scene",
  "pickup_from_current_scene",
  "equip_inventory_item",
  "unequip_inventory_item",
]);

export const cleanItemTransferSourceKindSchema = z.enum([
  "player_inventory",
  "visible_actor_item",
  "current_scene_item",
]);

export const cleanItemTransferTargetKindSchema = z.enum([
  "visible_actor",
  "current_scene",
  "player_inventory",
  "player_equipment",
]);

type CleanItemTransferOperation = z.infer<typeof cleanItemTransferOperationSchema>;
type CleanItemTransferSourceKind = z.infer<typeof cleanItemTransferSourceKindSchema>;
type CleanItemTransferTargetKind = z.infer<typeof cleanItemTransferTargetKindSchema>;

const itemTransferOperationContracts: Record<CleanItemTransferOperation, {
  sourceKind: CleanItemTransferSourceKind;
  targetKind: CleanItemTransferTargetKind;
  targetEquipState: "carried" | "equipped";
  targetEquippedSlot: "equipped" | null;
  requiredOwner: "Player" | "visible_actor" | "none";
  requiredLocation: "current_scene" | "none";
  requiredEquipState: "equipped" | null;
}> = {
  give_to_visible_actor: {
    sourceKind: "player_inventory",
    targetKind: "visible_actor",
    targetEquipState: "carried",
    targetEquippedSlot: null,
    requiredOwner: "Player",
    requiredLocation: "none",
    requiredEquipState: null,
  },
  receive_from_visible_actor: {
    sourceKind: "visible_actor_item",
    targetKind: "player_inventory",
    targetEquipState: "carried",
    targetEquippedSlot: null,
    requiredOwner: "visible_actor",
    requiredLocation: "none",
    requiredEquipState: null,
  },
  drop_in_current_scene: {
    sourceKind: "player_inventory",
    targetKind: "current_scene",
    targetEquipState: "carried",
    targetEquippedSlot: null,
    requiredOwner: "Player",
    requiredLocation: "none",
    requiredEquipState: null,
  },
  pickup_from_current_scene: {
    sourceKind: "current_scene_item",
    targetKind: "player_inventory",
    targetEquipState: "carried",
    targetEquippedSlot: null,
    requiredOwner: "none",
    requiredLocation: "current_scene",
    requiredEquipState: null,
  },
  equip_inventory_item: {
    sourceKind: "player_inventory",
    targetKind: "player_equipment",
    targetEquipState: "equipped",
    targetEquippedSlot: "equipped",
    requiredOwner: "Player",
    requiredLocation: "none",
    requiredEquipState: null,
  },
  unequip_inventory_item: {
    sourceKind: "player_inventory",
    targetKind: "player_inventory",
    targetEquipState: "carried",
    targetEquippedSlot: null,
    requiredOwner: "Player",
    requiredLocation: "none",
    requiredEquipState: "equipped",
  },
};

function addItemTransferContractIssue(
  ctx: z.RefinementCtx,
  path: Array<string | number>,
  message: string,
): void {
  ctx.addIssue({
    code: "custom",
    path,
    message,
  });
}

function validateItemTransferOperationContract(
  input: {
    operation: CleanItemTransferOperation;
    sourceKind: CleanItemTransferSourceKind;
    targetKind: CleanItemTransferTargetKind;
    targetEquipState: "carried" | "equipped";
    targetEquippedSlot: "equipped" | null;
    requiredOwner?: "Player" | "visible_actor" | "none";
    requiredLocation?: "current_scene" | "none";
    requiredEquipState?: "carried" | "equipped" | null;
  },
  ctx: z.RefinementCtx,
  basePath: Array<string | number>,
): void {
  const expected = itemTransferOperationContracts[input.operation];
  if (input.sourceKind !== expected.sourceKind) {
    addItemTransferContractIssue(ctx, [...basePath, "sourceKind"], `${input.operation} requires sourceKind=${expected.sourceKind}.`);
  }
  if (input.targetKind !== expected.targetKind) {
    addItemTransferContractIssue(ctx, [...basePath, "targetKind"], `${input.operation} requires targetKind=${expected.targetKind}.`);
  }
  if (input.targetEquipState !== expected.targetEquipState) {
    addItemTransferContractIssue(ctx, [...basePath, "targetEquipState"], `${input.operation} requires targetEquipState=${expected.targetEquipState}.`);
  }
  if (input.targetEquippedSlot !== expected.targetEquippedSlot) {
    addItemTransferContractIssue(
      ctx,
      [...basePath, "targetEquippedSlot"],
      `${input.operation} requires targetEquippedSlot=${expected.targetEquippedSlot ?? "null"}.`,
    );
  }
  if (input.requiredOwner !== undefined && input.requiredOwner !== expected.requiredOwner) {
    addItemTransferContractIssue(ctx, [...basePath, "requiredOwner"], `${input.operation} requires requiredOwner=${expected.requiredOwner}.`);
  }
  if (input.requiredLocation !== undefined && input.requiredLocation !== expected.requiredLocation) {
    addItemTransferContractIssue(ctx, [...basePath, "requiredLocation"], `${input.operation} requires requiredLocation=${expected.requiredLocation}.`);
  }
  if (input.requiredEquipState !== undefined && input.requiredEquipState !== expected.requiredEquipState) {
    addItemTransferContractIssue(
      ctx,
      [...basePath, "requiredEquipState"],
      `${input.operation} requires requiredEquipState=${expected.requiredEquipState ?? "null"}.`,
    );
  }
}

export const cleanLocalObservationSurfaceKindSchema = z.enum([
  "player_status",
  "current_scene",
  "current_location",
  "visible_actor",
  "visible_target",
  "inventory_item",
  "visible_fact",
  "movement_option",
]);

export const cleanLocalObservationModeSchema = z.enum([
  "list_surface",
  "target_match",
]);

export const cleanLocalObservationResultKindSchema = z.enum([
  "positive_list",
  "positive_match",
  "ambiguous_match",
  "bounded_no_match",
]);

export const cleanDeviceSurfaceObservationResultKindSchema = z.enum([
  "facets_observed",
  "partial_facets_observed",
  "no_requested_surface",
]);

export const cleanTimeAdvanceReasonKindSchema = z.enum([
  "brief_local_action",
  "wait",
  "short_rest",
]);

export const cleanSceneBeatKindSchema = z.enum([
  "gesture",
  "posture",
  "local_interaction",
  "ordinary_prop_availability",
  "ordinary_prop_readiness",
  "generic_scene_beat",
]);

export const gmReadLocalObservationNeedSchema = z.object({
  actorRef: z.literal("Player"),
  mode: cleanLocalObservationModeSchema,
  queryText: shortText,
  targetRef: modelSafeRef.nullable(),
  surfaceKinds: z.array(cleanLocalObservationSurfaceKindSchema).min(1).max(7),
  allowBoundedNegative: z.boolean(),
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
}).strict().superRefine((need, ctx) => {
  if (need.mode === "list_surface" && need.targetRef !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["targetRef"],
      message: "list_surface local observations must use targetRef=null.",
    });
  }
});

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
    "device_status_observation",
    "ordinary_support_actor_needed",
    "player_local_condition",
    "item_transfer",
    "minor_poi_create",
    "unsupported_or_unclear",
  ]),
  supportActorNeed: z.object({
    roleKind: cleanSupportActorRoleKindSchema,
    requestedRoleText: shortText,
    currentScenePlausibility: z.literal("ordinary_local_role"),
    intendedUse: z.enum([
      "presence_only",
      "dialogue_requested_but_not_yet_recorded",
      "service_requested_but_not_yet_resolved",
    ]),
    dialogueRequestText: shortText.nullable().optional(),
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().superRefine((need, ctx) => {
    const requestText = need.dialogueRequestText?.trim() ?? "";
    if (need.intendedUse === "dialogue_requested_but_not_yet_recorded" && requestText.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dialogueRequestText"],
        message: "supportActorNeed.dialogueRequestText is required when intendedUse=dialogue_requested_but_not_yet_recorded.",
      });
    }
    if (need.intendedUse !== "dialogue_requested_but_not_yet_recorded" && requestText.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["dialogueRequestText"],
        message: "supportActorNeed.dialogueRequestText belongs only to dialogue_requested_but_not_yet_recorded.",
      });
    }
  }).nullable().optional(),
  localConditionNeed: z.object({
    actorRef: z.literal("Player"),
    operation: z.enum(["apply", "clear"]),
    conditionKey: cleanLocalConditionKeySchema,
    requestedPostureText: shortText,
    targetKind: cleanLocalConditionTargetKindSchema,
    targetRef: modelSafeRef.nullable(),
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().nullable().optional(),
  itemTransferNeed: z.object({
    actorRef: z.literal("Player"),
    operation: cleanItemTransferOperationSchema,
    itemRef: modelSafeRef,
    sourceKind: cleanItemTransferSourceKindSchema,
    sourceRef: modelSafeRef.nullable().optional(),
    targetKind: cleanItemTransferTargetKindSchema,
    targetRef: modelSafeRef,
    equipSlot: z.literal("equipped").nullable(),
    requestedItemText: shortText,
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().nullable().optional(),
  minorPoiNeed: z.object({
    actorRef: z.literal("Player"),
    placeLabel: shortText,
    placeKind: cleanMinorPoiKindSchema,
    anchorRef: modelSafeRef,
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().nullable().optional(),
  timePassageNeed: z.object({
    actorRef: z.literal("Player"),
    elapsedMinutes: z.number().int().min(1).max(60),
    reasonKind: cleanTimeAdvanceReasonKindSchema,
    requestedDurationText: shortText,
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().nullable().optional(),
  sceneBeatNeed: z.object({
    actorRef: z.literal("Player"),
    beatKind: cleanSceneBeatKindSchema,
    requestedBeatText: shortText,
    anchorRef: modelSafeRef,
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().nullable().optional(),
  localObservationNeed: gmReadLocalObservationNeedSchema.nullable().optional(),
  deviceObservationNeed: z.object({
    actorRef: z.literal("Player"),
    deviceRef: modelSafeRef,
    requestedDeviceText: shortText,
    requestedFacetText: shortText,
    facetKinds: z.array(cleanDeviceFacetKindSchema).min(1).max(7),
    allowNoSurface: z.boolean(),
    evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  }).strict().nullable().optional(),
}).strict().superRefine((interpretation, ctx) => {
  const hasSceneBeatNeed = interpretation.sceneBeatNeed !== undefined && interpretation.sceneBeatNeed !== null;
  if (interpretation.interactionKind === "scene_local_beat" && !hasSceneBeatNeed) {
    ctx.addIssue({
      code: "custom",
      path: ["sceneBeatNeed"],
      message: "scene_local_beat requires a typed sceneBeatNeed.",
    });
  }
  if (interpretation.interactionKind !== "scene_local_beat" && hasSceneBeatNeed) {
    ctx.addIssue({
      code: "custom",
      path: ["sceneBeatNeed"],
      message: "sceneBeatNeed is allowed only for scene_local_beat.",
    });
  }
});

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
  interpretationRationale: rationaleText,
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

export const oracleAdapterSettlementResultSchema = oracleAdapterOkResultSchema;

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
  failure: z.null(),
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
  "local_observation",
  "device_surface_observation",
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

export const gmActionChecklistMaterializedSpeakerBindingSchema = z.object({
  bindingId: z.literal("materialized_speaker"),
  fromStepId: gmActionChecklistStepIdSchema,
  requiredCapabilityId: z.literal("support_actor_create"),
  requiredReceiptAuthority: z.literal("support_actor_materialization_receipt"),
  sourcePath: z.literal("publicResult.supportActor.actorRef"),
  resolveIn: z.literal("post_dependency_scene_frame"),
  requiredFramePresence: z.literal("actors_and_citableRefs"),
}).strict();

export const gmActionChecklistPlayerLocalConditionBindingSchema = z.object({
  bindingId: z.literal("player_local_condition"),
  fromStepId: gmActionChecklistStepIdSchema,
  requiredCapabilityId: z.literal("condition_set"),
  requiredReceiptAuthority: z.literal("player_local_condition_receipt"),
  sourcePath: z.literal("publicResult.condition.conditionKey"),
  resolveIn: z.literal("post_dependency_scene_frame"),
  requiredFramePresence: z.literal("player_visibleStatus.conditions"),
}).strict();

export const gmActionChecklistItemTransferBindingSchema = z.object({
  bindingId: z.literal("item_transfer_state"),
  fromStepId: gmActionChecklistStepIdSchema,
  requiredCapabilityId: z.literal("item_transfer"),
  requiredReceiptAuthority: z.literal("item_transfer_receipt"),
  sourcePath: z.literal("publicResult.itemTransfer"),
  resolveIn: z.literal("post_dependency_scene_frame"),
  requiredFramePresence: z.literal("item_state_reconciled"),
}).strict();

export const gmActionChecklistMinorPoiHandleBindingSchema = z.object({
  bindingId: z.literal("minor_poi_handle"),
  fromStepId: gmActionChecklistStepIdSchema,
  requiredCapabilityId: z.literal("minor_poi_create"),
  requiredReceiptAuthority: z.literal("minor_poi_handle_receipt"),
  sourcePath: z.literal("publicResult.minorPoi"),
  resolveIn: z.literal("post_dependency_scene_frame"),
  requiredFramePresence: z.literal("targets_and_citableRefs"),
}).strict();

export const gmActionChecklistDependencyBindingSchema = z.discriminatedUnion("bindingId", [
  gmActionChecklistMaterializedSpeakerBindingSchema,
  gmActionChecklistPlayerLocalConditionBindingSchema,
  gmActionChecklistItemTransferBindingSchema,
  gmActionChecklistMinorPoiHandleBindingSchema,
]);

const gmActionChecklistTypedPlanRequirements = [
  { kind: "scene_beat_record", planKey: "sceneBeatPlan" },
  { kind: "time_advance", planKey: "timeAdvancePlan" },
  { kind: "support_actor_create", planKey: "supportActorPlan" },
  { kind: "dialogue_record", planKey: "dialoguePlan" },
  { kind: "condition_set", planKey: "localConditionPlan" },
  { kind: "item_transfer", planKey: "itemTransferPlan" },
  { kind: "minor_poi_create", planKey: "minorPoiPlan" },
  { kind: "local_observation", planKey: "localObservationPlan" },
  { kind: "device_surface_observation", planKey: "deviceObservationPlan" },
] as const;

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
    sceneBeatPlan: z.object({
      actorRef: z.literal("Player"),
      beatKind: cleanSceneBeatKindSchema,
      requestedBeatText: shortText,
      anchorRef: modelSafeRef,
      persistenceScope: z.literal("turn_event_only"),
    }).strict().nullable().optional(),
    localConditionPlan: z.object({
      actorRef: z.literal("Player"),
      operation: z.enum(["apply", "clear"]),
      conditionKey: cleanLocalConditionKeySchema,
      requestedPostureText: shortText.optional(),
      conditionScope: z.literal("current_scene"),
      anchorRef: modelSafeRef,
      targetKind: cleanLocalConditionTargetKindSchema,
      targetRef: modelSafeRef.nullable(),
      replacementPolicy: z.enum(["replace_same_condition_group", "no_replacement"]),
    }).strict().nullable().optional(),
    itemTransferPlan: z.object({
      actorRef: z.literal("Player"),
      operation: cleanItemTransferOperationSchema,
      itemRef: modelSafeRef,
      sourceKind: cleanItemTransferSourceKindSchema,
      sourceRef: modelSafeRef.nullable().optional(),
      targetKind: cleanItemTransferTargetKindSchema,
      targetRef: modelSafeRef,
      targetEquipState: z.enum(["carried", "equipped"]),
      targetEquippedSlot: z.literal("equipped").nullable(),
      anchorRef: modelSafeRef,
    }).strict().nullable().optional(),
    minorPoiPlan: z.object({
      actorRef: z.literal("Player"),
      placeLabel: shortText,
      placeKind: cleanMinorPoiKindSchema,
      anchorRef: modelSafeRef,
      reusePolicy: z.literal("reuse_matching_current_scene_place_handle_or_create"),
    }).strict().nullable().optional(),
    supportActorPlan: z.object({
      actorRef: z.literal("Player"),
      roleKind: cleanSupportActorRoleKindSchema,
      requestedRoleText: shortText,
      anchorRef: modelSafeRef,
      intendedUse: z.enum([
        "presence_only",
        "dialogue_requested_but_not_yet_recorded",
        "service_requested_but_not_yet_resolved",
      ]),
      dialogueRequestText: shortText.nullable().optional(),
      reusePolicy: z.literal("reuse_matching_temporary_current_scene_or_create"),
    }).strict().nullable().optional(),
    dialoguePlan: z.object({
      actorRef: z.literal("Player"),
      speakerSource: z.enum(["existing_visible_actor", "materialized_support_actor"]),
      speakerRef: modelSafeRef.nullable(),
      materializedSpeakerBindingId: z.literal("materialized_speaker").nullable(),
      addresseeRef: z.literal("Player"),
      playerIntent: shortText,
      responseScope: z.literal("visible_speaker_response_only"),
    }).strict().nullable().optional(),
    timeAdvancePlan: z.object({
      actorRef: z.literal("Player"),
      sceneRef: modelSafeRef,
      elapsedMinutes: z.number().int().min(1).max(60),
      reasonKind: cleanTimeAdvanceReasonKindSchema,
      requestedDurationText: shortText,
    }).strict().nullable().optional(),
    localObservationPlan: z.object({
      actorRef: z.literal("Player"),
      mode: cleanLocalObservationModeSchema,
      queryText: shortText,
      targetRef: modelSafeRef.nullable(),
      surfaceKinds: z.array(cleanLocalObservationSurfaceKindSchema).min(1).max(7),
      allowBoundedNegative: z.boolean(),
      anchorRef: modelSafeRef,
    }).strict().nullable().optional(),
    deviceObservationPlan: z.object({
      actorRef: z.literal("Player"),
      deviceRef: modelSafeRef,
      requestedDeviceText: shortText,
      requestedFacetText: shortText,
      facetKinds: z.array(cleanDeviceFacetKindSchema).min(1).max(7),
      allowNoSurface: z.boolean(),
      anchorRef: modelSafeRef,
    }).strict().nullable().optional(),
  }).strict(),
  disposition: z.object({
    kind: gmActionChecklistDispositionKindSchema,
    reason: shortText,
  }).strict(),
  dependsOnStepIds: z.array(gmActionChecklistStepIdSchema).max(5),
  dependencyBindings: z.array(gmActionChecklistDependencyBindingSchema).max(3).optional(),
  expectedVisibleEffect: z.object({
    summary: shortText,
    visibleRefs: z.array(modelSafeRef).min(1).max(8),
  }).strict(),
}).strict().superRefine((step, ctx) => {
  for (const requirement of gmActionChecklistTypedPlanRequirements) {
    const plan = step.intended[requirement.planKey];
    if (step.intended.kind === requirement.kind && plan == null) {
      ctx.addIssue({
        code: "custom",
        path: ["intended", requirement.planKey],
        message: `${requirement.kind} checklist steps require a typed ${requirement.planKey}.`,
      });
    }
    if (step.intended.kind !== requirement.kind && plan != null) {
      ctx.addIssue({
        code: "custom",
        path: ["intended", requirement.planKey],
        message: `${requirement.planKey} is allowed only for ${requirement.kind} checklist steps.`,
      });
    }
  }
  if (step.intended.itemTransferPlan) {
    const plan = step.intended.itemTransferPlan;
    validateItemTransferOperationContract({
      operation: plan.operation,
      sourceKind: plan.sourceKind,
      targetKind: plan.targetKind,
      targetEquipState: plan.targetEquipState,
      targetEquippedSlot: plan.targetEquippedSlot,
    }, ctx, ["intended", "itemTransferPlan"]);
    if (plan.sourceKind === "visible_actor_item") {
      if (!plan.sourceRef) {
        ctx.addIssue({
          code: "custom",
          path: ["intended", "itemTransferPlan", "sourceRef"],
          message: "visible_actor_item itemTransferPlan requires sourceRef.",
        });
      }
    } else if (plan.sourceRef != null) {
      ctx.addIssue({
        code: "custom",
        path: ["intended", "itemTransferPlan", "sourceRef"],
        message: "itemTransferPlan.sourceRef is allowed only for visible_actor_item.",
      });
    }
  }
  if (step.intended.dialoguePlan?.speakerSource === "existing_visible_actor") {
    if (!step.intended.dialoguePlan.speakerRef) {
      ctx.addIssue({
        code: "custom",
        path: ["intended", "dialoguePlan", "speakerRef"],
        message: "existing visible dialogue plans require speakerRef.",
      });
    }
    if (step.intended.dialoguePlan.materializedSpeakerBindingId != null) {
      ctx.addIssue({
        code: "custom",
        path: ["intended", "dialoguePlan", "materializedSpeakerBindingId"],
        message: "existing visible dialogue plans use speakerRef as the speaker source.",
      });
    }
  }
  if (step.intended.dialoguePlan?.speakerSource === "materialized_support_actor") {
    if (step.intended.dialoguePlan.speakerRef != null) {
      ctx.addIssue({
        code: "custom",
        path: ["intended", "dialoguePlan", "speakerRef"],
        message: "materialized support actor dialogue plans resolve speakerRef from dependency binding.",
      });
    }
    if (step.intended.dialoguePlan.materializedSpeakerBindingId !== "materialized_speaker") {
      ctx.addIssue({
        code: "custom",
        path: ["intended", "dialoguePlan", "materializedSpeakerBindingId"],
        message: "materialized support actor dialogue plans require materialized_speaker binding.",
      });
    }
  }
});

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
  "local_observation",
  "device_surface_observation",
  "route_options",
  "route_check",
  "movement",
  "dialogue_record",
  "support_actor_create",
  "item_transfer",
  "minor_poi_create",
  "condition_set",
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

export const cleanSupportActorCuePlacementSchema = z.enum([
  "at_scene_edge",
  "beside_counter_or_stall",
  "beside_mooring_or_railing",
  "by_door_or_threshold",
  "in_open_view",
  "near_public_fixture",
  "under_public_cover",
]);

export const cleanSupportActorCueBearingSchema = z.enum([
  "hands_resting_visible",
  "leaning_in_view",
  "seated_in_view",
  "standing_in_view",
  "waiting_in_view",
  "watching_the_scene",
]);

export const cleanSupportActorCueDetailSchema = z.enum([
  "canvas_awning",
  "market_basket",
  "mooring_rope",
  "plain_work_clothes",
  "satchel_or_pouch",
  "weathered_coat",
  "wooden_counter",
]);

export const cleanSupportActorVisibleCueProfileSchema = z.object({
  placement: cleanSupportActorCuePlacementSchema,
  bearing: cleanSupportActorCueBearingSchema,
  detail: cleanSupportActorCueDetailSchema.nullable(),
}).strict();

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

export const cleanStage4SupportActorCreateEffectSchema = z.object({
  kind: z.literal("support_actor_create"),
  authorityKind: z.literal("ordinary_current_scene_support_actor"),
  anchorScope: z.literal("current_scene"),
  anchorRef: modelSafeRef,
  roleKind: cleanSupportActorRoleKindSchema,
  roleLabel: shortText,
  publicPresentation: z.object({
    presentationMode: z.literal("visible_presence_only"),
    visibleCueProfile: cleanSupportActorVisibleCueProfileSchema,
    voiceHint: z.string().trim().min(1).max(160).nullable(),
  }).strict(),
  identityBounds: z.object({
    tier: z.literal("temporary"),
    persistence: z.literal("current_scene"),
    significance: z.literal("minor_support"),
    agency: z.literal("reactive_only"),
    mayBecomePersistentHere: z.literal(false),
  }).strict(),
  reusePolicy: z.literal("reuse_matching_temporary_current_scene_or_create"),
  reason: shortText,
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  forbiddenPayloads: z.object({
    dialogueContent: z.literal(false),
    worldFact: z.literal(false),
    relationship: z.literal(false),
    itemState: z.literal(false),
    routeTruth: z.literal(false),
    futureRelevance: z.literal(false),
    privateKnowledge: z.literal(false),
  }).strict(),
}).strict();

export const cleanStage4SupportActorMaterializationResultSchema = z.object({
  type: z.literal("support_actor_materialization"),
  resultKind: z.enum(["created", "reused"]),
  actorRef: modelSafeRef,
  actorLabel: shortText,
  roleKind: cleanSupportActorRoleKindSchema,
  roleLabel: shortText,
  anchorSceneLabel: shortText,
  anchorLocationLabel: shortText,
  presentationMode: z.literal("visible_presence_only"),
  publicSummary: z.string().trim().min(1).max(240),
  visibleCue: z.string().trim().min(1).max(160).nullable(),
  identityBounds: z.object({
    tier: z.literal("temporary"),
    persistence: z.literal("current_scene"),
    significance: z.literal("minor_support"),
    agency: z.literal("reactive_only"),
  }).strict(),
  claimStatus: z.literal("visible_support_actor_materialization_only"),
}).strict();

export const cleanStage4LocalConditionSetEffectSchema = z.object({
  kind: z.literal("condition_set"),
  authorityKind: z.literal("current_scene_player_local_condition"),
  actorRef: z.literal("Player"),
  conditionScope: z.literal("current_scene"),
  anchorRef: modelSafeRef,
  operation: z.enum(["apply", "clear"]),
  conditionKey: cleanLocalConditionKeySchema,
  requestedPostureText: shortText.optional(),
  target: z.object({
    targetKind: cleanLocalConditionTargetKindSchema,
    targetRef: modelSafeRef.nullable(),
  }).strict(),
  replacementPolicy: z.enum(["replace_same_condition_group", "no_replacement"]),
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  forbiddenPayloads: z.object({
    hpDelta: z.literal(false),
    damage: z.literal(false),
    healing: z.literal(false),
    combatModifier: z.literal(false),
    stealthSuccess: z.literal(false),
    coverEffectiveness: z.literal(false),
    itemCustody: z.literal(false),
    itemLocation: z.literal(false),
    itemEquipState: z.literal(false),
    itemMutation: z.literal(false),
    movement: z.literal(false),
    routeTruth: z.literal(false),
    worldFact: z.literal(false),
    relationship: z.literal(false),
    dialogueContent: z.literal(false),
    npcCondition: z.literal(false),
    privateKnowledge: z.literal(false),
    absenceOrNoChange: z.literal(false),
  }).strict(),
}).strict();

export const cleanStage4PlayerLocalConditionResultSchema = z.object({
  type: z.literal("player_local_condition"),
  resultKind: z.enum(["applied", "cleared", "replaced", "already_present"]),
  actorLabel: z.literal("Player"),
  operation: z.enum(["apply", "clear"]),
  conditionKey: cleanLocalConditionKeySchema,
  conditionLabel: shortText,
  requestedPostureText: shortText.optional(),
  conditionScope: z.literal("current_scene"),
  anchorSceneLabel: shortText,
  anchorLocationLabel: shortText,
  targetKind: cleanLocalConditionTargetKindSchema,
  targetLabel: shortText.nullable(),
  claimStatus: z.literal("visible_player_local_condition_only"),
}).strict();

export const cleanStage4ItemTransferEffectSchema = z.object({
  kind: z.literal("item_transfer"),
  authorityKind: z.literal("player_current_scene_item_state_transition"),
  actorRef: z.literal("Player"),
  operation: cleanItemTransferOperationSchema,
  itemRef: modelSafeRef,
  source: z.object({
    sourceKind: cleanItemTransferSourceKindSchema,
    sourceRef: modelSafeRef.nullable().optional(),
    requiredOwner: z.enum(["Player", "visible_actor", "none"]),
    requiredLocation: z.enum(["current_scene", "none"]),
    requiredEquipState: z.enum(["carried", "equipped"]).nullable(),
  }).strict(),
  target: z.object({
    targetKind: cleanItemTransferTargetKindSchema,
    targetRef: modelSafeRef,
    targetEquipState: z.enum(["carried", "equipped"]),
    targetEquippedSlot: z.literal("equipped").nullable(),
  }).strict(),
  anchorRef: modelSafeRef,
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  forbiddenPayloads: z.object({
    itemCreation: z.literal(false),
    itemDiscovery: z.literal(false),
    itemInspection: z.literal(false),
    itemUseOrActivation: z.literal(false),
    itemDamageOrRepair: z.literal(false),
    containerContents: z.literal(false),
    currencyOrBarter: z.literal(false),
    npcConsentOrReaction: z.literal(false),
    relationship: z.literal(false),
    worldFact: z.literal(false),
    routeTruth: z.literal(false),
    locationReveal: z.literal(false),
    hpOrCondition: z.literal(false),
    dialogueContent: z.literal(false),
    privateKnowledge: z.literal(false),
    absenceOrNoChange: z.literal(false),
  }).strict(),
}).strict().superRefine((effect, ctx) => {
  validateItemTransferOperationContract({
    operation: effect.operation,
    sourceKind: effect.source.sourceKind,
    targetKind: effect.target.targetKind,
    targetEquipState: effect.target.targetEquipState,
    targetEquippedSlot: effect.target.targetEquippedSlot,
    requiredOwner: effect.source.requiredOwner,
    requiredLocation: effect.source.requiredLocation,
    requiredEquipState: effect.source.requiredEquipState,
  }, ctx, []);
  if (effect.source.sourceKind === "visible_actor_item") {
    if (!effect.source.sourceRef) {
      ctx.addIssue({
        code: "custom",
        path: ["source", "sourceRef"],
        message: "visible_actor_item item_transfer requests require sourceRef.",
      });
    }
  } else if (effect.source.sourceRef != null) {
    ctx.addIssue({
      code: "custom",
      path: ["source", "sourceRef"],
      message: "item_transfer sourceRef is allowed only for visible_actor_item.",
    });
  }
});

export const cleanStage4ItemTransferResultSchema = z.object({
  type: z.literal("item_transfer"),
  resultKind: z.enum([
    "transferred_to_actor",
    "received_from_actor",
    "dropped_in_scene",
    "picked_up",
    "equipped",
    "unequipped",
    "already_satisfied",
  ]),
  itemLabel: shortText,
  actorLabel: z.literal("Player"),
  operation: cleanItemTransferOperationSchema,
  sourceLabel: shortText,
  targetLabel: shortText,
  anchorSceneLabel: shortText,
  anchorLocationLabel: shortText,
  finalOwnerKind: z.enum(["player", "visible_actor", "none"]),
  finalLocationKind: z.enum(["current_scene", "none"]),
  finalEquipState: z.enum(["carried", "equipped"]),
  finalEquippedSlot: z.string().trim().min(1).max(80).nullable(),
  claimStatus: z.literal("visible_item_state_change_only"),
}).strict();

export const cleanStage4MinorPoiCreateEffectSchema = z.object({
  kind: z.literal("minor_poi_create"),
  authorityKind: z.literal("current_scene_visible_place_handle_create"),
  actorRef: z.literal("Player"),
  anchorRef: modelSafeRef,
  placeLabel: shortText,
  placeKind: cleanMinorPoiKindSchema,
  reusePolicy: z.literal("reuse_matching_current_scene_place_handle_or_create"),
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  forbiddenPayloads: z.object({
    actorCreation: z.literal(false),
    servicesOrInventory: z.literal(false),
    routeTruth: z.literal(false),
    locationReveal: z.literal(false),
    movementDestination: z.literal(false),
    businessFact: z.literal(false),
    readableText: z.literal(false),
    hiddenDiscovery: z.literal(false),
    absenceOrNoChange: z.literal(false),
    dialogueContent: z.literal(false),
    worldFact: z.literal(false),
    privateKnowledge: z.literal(false),
  }).strict(),
}).strict();

export const cleanStage4MinorPoiHandleResultSchema = z.object({
  type: z.literal("minor_poi_handle"),
  resultKind: z.enum(["created", "reused"]),
  poiRef: modelSafeRef,
  poiLabel: shortText,
  poiKind: cleanMinorPoiKindSchema,
  actorLabel: z.literal("Player"),
  anchorSceneLabel: shortText,
  anchorLocationLabel: shortText,
  visibility: z.literal("public_visible_current_scene"),
  persistenceScope: z.literal("current_scene"),
  targetOnly: z.literal(true),
  claimStatus: z.literal("visible_current_scene_place_handle_only"),
}).strict();

export const cleanStage4LocalObservationEffectSchema = z.object({
  kind: z.literal("local_observation"),
  authorityKind: z.literal("current_scene_observation_surface"),
  actorRef: z.literal("Player"),
  anchorRef: modelSafeRef,
  mode: cleanLocalObservationModeSchema,
  queryText: shortText,
  targetRef: modelSafeRef.nullable(),
  surfaceKinds: z.array(cleanLocalObservationSurfaceKindSchema).min(1).max(7),
  allowBoundedNegative: z.boolean(),
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  forbiddenPayloads: z.object({
    hiddenDiscovery: z.literal(false),
    concealedSearch: z.literal(false),
    broadAbsence: z.literal(false),
    itemUseOrActivation: z.literal(false),
    itemStateChange: z.literal(false),
    phoneOrDeviceStatus: z.literal(false),
    routeTruth: z.literal(false),
    locationReveal: z.literal(false),
    worldFact: z.literal(false),
    dialogueContent: z.literal(false),
    privateKnowledge: z.literal(false),
    mutation: z.literal(false),
  }).strict(),
}).strict();

export const cleanStage4LocalObservationResultSchema = z.object({
  type: z.literal("local_observation"),
  surfaceVersion: z.literal("scene_frame_current_observation_surface.v1"),
  resultKind: cleanLocalObservationResultKindSchema,
  mode: cleanLocalObservationModeSchema,
  queryText: shortText,
  targetLabel: shortText.nullable(),
  matchedEntries: z.array(z.object({
    surfaceKind: cleanLocalObservationSurfaceKindSchema,
    label: shortText,
    detail: shortText.nullable(),
  }).strict()).max(12),
  searchedSurfaceKinds: z.array(cleanLocalObservationSurfaceKindSchema).min(1).max(7),
  anchorSceneLabel: shortText,
  anchorLocationLabel: shortText,
  boundedNegative: z.boolean(),
  summary: shortText,
  claimStatus: z.literal("bounded_current_scene_observation_only"),
}).strict();

export const cleanStage4DeviceSurfaceObservationEffectSchema = z.object({
  kind: z.literal("device_surface_observation"),
  authorityKind: z.literal("current_frame_device_status_surface"),
  actorRef: z.literal("Player"),
  anchorRef: modelSafeRef,
  deviceRef: modelSafeRef,
  requestedDeviceText: shortText,
  requestedFacetText: shortText,
  facetKinds: z.array(cleanDeviceFacetKindSchema).min(1).max(7),
  allowNoSurface: z.boolean(),
  evidenceRefs: z.array(modelSafeRef).min(1).max(12),
  forbiddenPayloads: z.object({
    privateMessageContents: z.literal(false),
    messageOrCallGeneration: z.literal(false),
    networkSimulation: z.literal(false),
    hackingOrDecryption: z.literal(false),
    itemUseOrActivation: z.literal(false),
    itemStateChange: z.literal(false),
    routeTruth: z.literal(false),
    locationReveal: z.literal(false),
    worldFact: z.literal(false),
    dialogueContent: z.literal(false),
    privateKnowledge: z.literal(false),
    mutation: z.literal(false),
    absenceOrNoChange: z.literal(false),
  }).strict(),
}).strict();

export const cleanStage4DeviceSurfaceObservationResultSchema = z.object({
  type: z.literal("device_surface_observation"),
  surfaceVersion: z.literal("scene_frame_device_status_surface.v1"),
  resultKind: cleanDeviceSurfaceObservationResultKindSchema,
  deviceLabel: shortText,
  requestedFacetText: shortText,
  requestedFacetKinds: z.array(cleanDeviceFacetKindSchema).min(1).max(7),
  observedFacets: z.array(z.object({
    facetKind: cleanDeviceFacetKindSchema,
    displayLabel: shortText,
    valueText: shortText,
    valueClass: z.enum(["visible_status_text", "indicator_state", "meter_value", "icon_state"]),
    claimStatus: z.literal("modeled_public_device_surface_only"),
  }).strict()).max(12),
  unavailableFacetKinds: z.array(cleanDeviceFacetKindSchema).max(7),
  anchorSceneLabel: shortText,
  anchorLocationLabel: shortText,
  boundedNoSurface: z.boolean(),
  summary: shortText,
  claimStatus: z.literal("bounded_current_frame_device_surface_only"),
}).strict();

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
  author: z.enum([
    "backend_from_checklist",
    "model_from_stage4_dialogue_request",
    "model_from_stage4_support_actor_request",
  ]),
  modelAuthored: z.boolean(),
  capabilityId: cleanStage4CapabilityIdSchema,
  effect: z.discriminatedUnion("kind", [
    z.object({
      kind: z.literal("observe_visible"),
      actorRef: z.literal("Player"),
      scope: z.literal("current_scene"),
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    cleanStage4LocalObservationEffectSchema,
    cleanStage4DeviceSurfaceObservationEffectSchema,
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
      beatKind: cleanSceneBeatKindSchema,
      evidenceRefs: z.array(modelSafeRef).min(1).max(12),
    }).strict(),
    cleanStage4DialogueRequestEffectSchema,
    cleanStage4SupportActorCreateEffectSchema,
    cleanStage4ItemTransferEffectSchema,
    cleanStage4MinorPoiCreateEffectSchema,
    cleanStage4LocalConditionSetEffectSchema,
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
  if (request.effect.kind === "support_actor_create") {
    if (request.author !== "model_from_stage4_support_actor_request" || request.modelAuthored !== true) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "P66 support_actor_create requests must be model-authored Stage 4 requests." });
    }
    return;
  }
  if (request.effect.kind === "item_transfer") {
    if (request.author !== "backend_from_checklist" || request.modelAuthored !== false) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "P69 item_transfer requests must be backend-authored from the accepted checklist." });
    }
    return;
  }
  if (request.effect.kind === "minor_poi_create") {
    if (request.author !== "backend_from_checklist" || request.modelAuthored !== false) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "P72 minor_poi_create requests must be backend-authored from the accepted checklist." });
    }
    return;
  }
  if (request.effect.kind === "local_observation") {
    if (request.author !== "backend_from_checklist" || request.modelAuthored !== false) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "P70 local_observation requests must be backend-authored from the accepted checklist." });
    }
    return;
  }
  if (request.effect.kind === "device_surface_observation") {
    if (request.author !== "backend_from_checklist" || request.modelAuthored !== false) {
      ctx.addIssue({ code: "custom", path: ["author"], message: "P71 device_surface_observation requests must be backend-authored from the accepted checklist." });
    }
    return;
  }
  if (request.author !== "backend_from_checklist" || request.modelAuthored !== false) {
    ctx.addIssue({ code: "custom", path: ["author"], message: "Only dialogue_record and support_actor_create may be model-authored in the clean runtime." });
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
      "local_observation_receipt",
      "device_surface_observation_receipt",
      "route_options_receipt",
      "route_check_receipt",
      "scene_beat_receipt",
      "terminal_dialogue_receipt",
      "support_actor_materialization_receipt",
      "player_local_condition_receipt",
      "item_transfer_receipt",
      "minor_poi_handle_receipt",
      "terminal_mutation_receipt",
      "failure_receipt",
      "skip_receipt",
    ]),
    mutationAuthority: z.enum([
      "none",
      "player_location_and_world_clock",
      "world_clock_only",
      "current_scene_support_actor",
      "player_local_condition_state",
      "item_custody_location_equip_state",
      "current_scene_minor_poi_handle",
    ]),
    visibleResultAuthority: z.enum([
      "may_describe_visible_snapshot",
      "may_claim_local_observation",
      "may_claim_device_surface_observation",
      "may_list_route_options",
      "may_explain_route_status",
      "may_claim_player_location_change",
      "may_claim_elapsed_time",
      "may_acknowledge_scene_beat",
      "may_quote_visible_dialogue_response",
      "may_claim_visible_support_actor_materialized",
      "may_claim_player_local_condition",
      "may_claim_item_state_change",
      "may_claim_visible_minor_poi_handle",
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
    routeCheck: z.object({
      label: shortText,
      status: z.enum(["connected", "disconnected"]),
    }).strict().nullable().optional(),
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
    localObservation: cleanStage4LocalObservationResultSchema.nullable().optional(),
    deviceSurfaceObservation: cleanStage4DeviceSurfaceObservationResultSchema.nullable().optional(),
    sceneBeat: z.object({
      type: z.literal("scene_beat"),
      beatKind: cleanSceneBeatKindSchema,
      summary: shortText,
      requestedBeatText: shortText.optional(),
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
    supportActor: cleanStage4SupportActorMaterializationResultSchema.nullable().optional(),
    condition: cleanStage4PlayerLocalConditionResultSchema.nullable().optional(),
    itemTransfer: cleanStage4ItemTransferResultSchema.nullable().optional(),
    minorPoi: cleanStage4MinorPoiHandleResultSchema.nullable().optional(),
  }).strict(),
  privateResult: z.object({
    playerId: shortText.nullable(),
    fromLocationId: shortText.nullable(),
    destinationLocationId: shortText.nullable(),
    supportActorId: shortText.nullable().optional(),
    supportActorOperation: z.enum(["inserted", "reused"]).nullable().optional(),
    anchorLocationId: shortText.nullable().optional(),
    anchorSceneLocationId: shortText.nullable().optional(),
    conditionId: shortText.nullable().optional(),
    conditionOperation: z.enum(["applied", "cleared", "replaced", "already_present"]).nullable().optional(),
    previousConditionKeys: z.array(cleanLocalConditionKeySchema).max(12).optional(),
    nextConditionKeys: z.array(cleanLocalConditionKeySchema).max(12).optional(),
    itemId: shortText.nullable().optional(),
    itemOperation: cleanItemTransferOperationSchema.nullable().optional(),
    previousOwnerId: shortText.nullable().optional(),
    nextOwnerId: shortText.nullable().optional(),
    previousLocationId: shortText.nullable().optional(),
    nextLocationId: shortText.nullable().optional(),
    previousEquipState: z.enum(["carried", "equipped"]).nullable().optional(),
    nextEquipState: z.enum(["carried", "equipped"]).nullable().optional(),
    previousEquippedSlot: shortText.nullable().optional(),
    nextEquippedSlot: shortText.nullable().optional(),
    minorPoiId: shortText.nullable().optional(),
    minorPoiOperation: z.enum(["inserted", "reused"]).nullable().optional(),
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
      "missing_or_ambiguous_item",
      "missing_or_ambiguous_target",
      "route_disconnected",
      "dependency_not_accepted",
      "missing_or_ambiguous_condition_target",
      "condition_not_active",
      "condition_state_conflict",
      "source_state_mismatch",
      "target_not_visible",
      "target_state_invalid",
      "equip_slot_conflict",
      "minor_poi_surface_unavailable",
      "minor_poi_state_conflict",
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
    if (receipt.status === "accepted" && receipt.publicResult.routeCheck == null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "routeCheck"], message: "Accepted route check requires public route check result." });
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
  if (receipt.status === "accepted" && receipt.capabilityId === "support_actor_create") {
    const supportActor = receipt.publicResult.supportActor ?? null;
    if (supportActor === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "supportActor"], message: "Accepted support_actor_create requires public support actor materialization result." });
      return;
    }
    if (receipt.authority.evidenceAuthority !== "support_actor_materialization_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted support_actor_create must use support actor materialization authority." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_visible_support_actor_materialized") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted support_actor_create must authorize support actor materialization narration." });
    }
    if (receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes || receipt.result.tick !== receipt.base.tick) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted support_actor_create must not advance time or tick." });
    }
    if (supportActor.resultKind === "created") {
      if (!receipt.result.mutationApplied || receipt.result.worldVersion <= receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Created support actor receipt must apply mutation and advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "current_scene_support_actor" || receipt.authority.mayAuthorizeMutation !== true) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Created support actor receipt must own current-scene support actor mutation." });
      }
    } else {
      if (receipt.result.mutationApplied || receipt.result.worldVersion !== receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Reused support actor receipt must not mutate or advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "none" || receipt.authority.mayAuthorizeMutation !== false) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Reused support actor receipt must not authorize mutation." });
      }
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "condition_set") {
    const condition = receipt.publicResult.condition ?? null;
    if (condition === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "condition"], message: "Accepted condition_set requires public player local condition result." });
      return;
    }
    if (receipt.authority.evidenceAuthority !== "player_local_condition_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted condition_set must use player local condition evidence authority." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_player_local_condition") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted condition_set must authorize player local condition narration." });
    }
    if (receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes || receipt.result.tick !== receipt.base.tick) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted condition_set must not advance time or tick." });
    }
    if (condition.resultKind === "already_present") {
      if (receipt.result.mutationApplied || receipt.result.worldVersion !== receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Already-present condition receipt must not mutate or advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "none" || receipt.authority.mayAuthorizeMutation !== false) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Already-present condition receipt must not authorize mutation." });
      }
    } else {
      if (!receipt.result.mutationApplied || receipt.result.worldVersion <= receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Applied/cleared/replaced condition receipt must apply mutation and advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "player_local_condition_state" || receipt.authority.mayAuthorizeMutation !== true) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Mutating condition receipt must own player local condition state." });
      }
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "item_transfer") {
    const itemTransfer = receipt.publicResult.itemTransfer ?? null;
    if (itemTransfer === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "itemTransfer"], message: "Accepted item_transfer requires public item transfer result." });
      return;
    }
    if (receipt.authority.evidenceAuthority !== "item_transfer_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted item_transfer must use item transfer evidence authority." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_item_state_change") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted item_transfer must authorize item-state narration." });
    }
    if (receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes || receipt.result.tick !== receipt.base.tick) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted item_transfer must not advance time or tick." });
    }
    if (itemTransfer.resultKind === "already_satisfied") {
      if (receipt.result.mutationApplied || receipt.result.worldVersion !== receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Already-satisfied item_transfer receipt must not mutate or advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "none" || receipt.authority.mayAuthorizeMutation !== false) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Already-satisfied item_transfer receipt must not authorize mutation." });
      }
    } else {
      if (!receipt.result.mutationApplied || receipt.result.worldVersion <= receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Mutating item_transfer receipt must apply mutation and advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "item_custody_location_equip_state" || receipt.authority.mayAuthorizeMutation !== true) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Mutating item_transfer receipt must own item custody/location/equip state." });
      }
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "minor_poi_create") {
    const minorPoi = receipt.publicResult.minorPoi ?? null;
    if (minorPoi === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "minorPoi"], message: "Accepted minor_poi_create requires public minor POI handle result." });
      return;
    }
    if (receipt.authority.evidenceAuthority !== "minor_poi_handle_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted minor_poi_create must use minor POI handle evidence authority." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_visible_minor_poi_handle") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted minor_poi_create must authorize visible minor POI handle narration." });
    }
    if (receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes || receipt.result.tick !== receipt.base.tick) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted minor_poi_create must not advance time or tick." });
    }
    if (minorPoi.resultKind === "reused") {
      if (receipt.result.mutationApplied || receipt.result.worldVersion !== receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Reused minor_poi_create receipt must not mutate or advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "none" || receipt.authority.mayAuthorizeMutation !== false) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Reused minor_poi_create receipt must not authorize mutation." });
      }
    } else {
      if (!receipt.result.mutationApplied || receipt.result.worldVersion <= receipt.base.worldVersion) {
        ctx.addIssue({ code: "custom", path: ["result"], message: "Created minor_poi_create receipt must apply mutation and advance world version." });
      }
      if (receipt.authority.mutationAuthority !== "current_scene_minor_poi_handle" || receipt.authority.mayAuthorizeMutation !== true) {
        ctx.addIssue({ code: "custom", path: ["authority"], message: "Created minor_poi_create receipt must own current-scene minor POI handle mutation." });
      }
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "local_observation") {
    const localObservation = receipt.publicResult.localObservation ?? null;
    if (localObservation === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "localObservation"], message: "Accepted local_observation requires public local observation result." });
      return;
    }
    if (receipt.authority.evidenceAuthority !== "local_observation_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted local_observation must use local observation evidence authority." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_local_observation") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted local_observation must authorize local observation narration." });
    }
    if (
      receipt.result.mutationApplied
      || receipt.result.worldVersion !== receipt.base.worldVersion
      || receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes
      || receipt.result.tick !== receipt.base.tick
    ) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted local_observation must not mutate or advance world state, time, or tick." });
    }
    if (receipt.authority.mutationAuthority !== "none" || receipt.authority.mayAuthorizeMutation !== false) {
      ctx.addIssue({ code: "custom", path: ["authority"], message: "Accepted local_observation mutation authority must be none." });
    }
  }
  if (receipt.status === "accepted" && receipt.capabilityId === "device_surface_observation") {
    const deviceSurfaceObservation = receipt.publicResult.deviceSurfaceObservation ?? null;
    if (deviceSurfaceObservation === null) {
      ctx.addIssue({ code: "custom", path: ["publicResult", "deviceSurfaceObservation"], message: "Accepted device_surface_observation requires public device surface observation result." });
      return;
    }
    if (receipt.authority.evidenceAuthority !== "device_surface_observation_receipt") {
      ctx.addIssue({ code: "custom", path: ["authority", "evidenceAuthority"], message: "Accepted device_surface_observation must use device surface observation evidence authority." });
    }
    if (receipt.authority.visibleResultAuthority !== "may_claim_device_surface_observation") {
      ctx.addIssue({ code: "custom", path: ["authority", "visibleResultAuthority"], message: "Accepted device_surface_observation must authorize device surface narration." });
    }
    if (
      receipt.result.mutationApplied
      || receipt.result.worldVersion !== receipt.base.worldVersion
      || receipt.result.worldTimeMinutes !== receipt.base.worldTimeMinutes
      || receipt.result.tick !== receipt.base.tick
    ) {
      ctx.addIssue({ code: "custom", path: ["result"], message: "Accepted device_surface_observation must not mutate or advance world state, time, or tick." });
    }
    if (receipt.authority.mutationAuthority !== "none" || receipt.authority.mayAuthorizeMutation !== false) {
      ctx.addIssue({ code: "custom", path: ["authority"], message: "Accepted device_surface_observation mutation authority must be none." });
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
    .replace(/local_observation/g, "")
    .replace(/scene_frame_current_observation_surface\.v1/g, "")
    .replace(/device_surface_observation/g, "")
    .replace(/deviceSurfaceObservation/g, "")
    .replace(/scene_frame_device_status_surface\.v1/g, "")
    .replace(/scene_beat/g, "")
    .replace(/dialogue_response/g, "")
    .replace(/support_actor_materialization/g, "")
    .replace(/player_local_condition/g, "")
    .replace(/item_transfer/g, "")
    .replace(/minor_poi_handle/g, "")
    .replace(/minorPoi/g, "");
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
  frameChain: z.array(z.object({
    frameId: shortText,
    base: z.object({
      tick: z.number().int().nonnegative(),
      worldVersion: z.number().int().nonnegative(),
      worldTimeMinutes: z.number().int().nonnegative(),
    }).strict(),
    source: z.enum(["initial", "post_dependency_scene_frame"]),
    afterReceiptId: shortText.nullable(),
  }).strict()).min(1).max(6).optional(),
  visibleResults: z.array(z.object({
    receiptId: shortText,
    authority: z.enum([
      "scene_observation_receipt",
      "local_observation_receipt",
      "device_surface_observation_receipt",
      "route_options_receipt",
      "route_check_receipt",
      "scene_beat_receipt",
      "terminal_dialogue_receipt",
      "support_actor_materialization_receipt",
      "player_local_condition_receipt",
      "item_transfer_receipt",
      "minor_poi_handle_receipt",
      "terminal_mutation_receipt",
      "failure_receipt",
      "skip_receipt",
    ]),
    summary: shortText,
    visibleRefs: z.array(modelSafeRef).min(1).max(12),
    routeCheck: z.object({
      label: shortText,
      status: z.enum(["connected", "disconnected"]),
    }).strict().nullable().optional(),
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
    supportActor: cleanStage4SupportActorMaterializationResultSchema.nullable().optional(),
    condition: cleanStage4PlayerLocalConditionResultSchema.nullable().optional(),
    itemTransfer: cleanStage4ItemTransferResultSchema.nullable().optional(),
    minorPoi: cleanStage4MinorPoiHandleResultSchema.nullable().optional(),
    localObservation: cleanStage4LocalObservationResultSchema.nullable().optional(),
    deviceSurfaceObservation: cleanStage4DeviceSurfaceObservationResultSchema.nullable().optional(),
  }).strict()).max(6),
}).strict();

const cleanSettledClaimKindSchema = z.enum([
  "current_scene",
  "current_location",
  "scene_texture",
  "visible_fact",
  "visible_actor",
  "visible_target",
  "local_observation",
  "bounded_visibility_negative",
  "device_surface_observation",
  "device_surface_unavailable",
  "inventory_status",
  "movement_option",
  "route_status",
  "scene_beat",
  "dialogue_response",
  "support_actor_materialization",
  "player_local_condition",
  "item_state",
  "minor_poi_handle",
  "player_location_change",
  "elapsed_time",
  "oracle_outcome",
  "clarification_request",
]);

const cleanNarrationHardClaimKindSchema = z.enum([
  "current_scene",
  "current_location",
  "scene_texture",
  "visible_fact",
  "visible_actor",
  "visible_target",
  "local_observation",
  "bounded_visibility_negative",
  "device_surface_observation",
  "device_surface_unavailable",
  "inventory_status",
  "movement_option",
  "route_status",
  "scene_beat",
  "dialogue_response",
  "support_actor_materialization",
  "player_local_condition",
  "item_state",
  "minor_poi_handle",
  "player_location_change",
  "elapsed_time",
  "oracle_outcome",
  "clarification_request",
  "movement",
  "item_custody",
  "route",
  "time",
  "injury_condition",
  "dialogue_quote",
  "secret_world_fact",
  "resource",
  "relationship",
  "important_object_affordance",
]);

const cleanNarrationSoftProseKindSchema = z.enum([
  "color",
  "wear",
  "scratches",
  "smell",
  "ordinary_texture",
  "temperature",
  "ambient_sound",
  "posture_flavor",
  "small_gesture",
  "ambient_motion",
  "non_mechanical_object_surface",
  "ordinary_scene_prop",
]);

const cleanNarratorHardFactContractSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-hard-fact-contract.v1"),
  source: z.literal("accepted_evidence_required"),
  strict: z.literal(true),
  categories: z.array(cleanNarrationHardClaimKindSchema).min(33).max(33),
}).strict();

const cleanNarratorSoftProseBudgetSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-soft-prose-budget.v1"),
  mayInventLowStakesVisibleSensoryDetail: z.literal(true),
  becomesWorldStateAuthority: z.literal(false),
  laterPlayerUseRequiresAdjudication: z.literal(true),
  allowedKinds: z.array(cleanNarrationSoftProseKindSchema).min(12).max(12),
}).strict();

const cleanSettledEvidenceAuthoritySchema = z.enum([
  "clarification_request",
  "scene_frame_snapshot",
  "scene_observation_receipt",
  "local_observation_receipt",
  "device_surface_observation_receipt",
  "route_options_receipt",
  "route_check_receipt",
  "scene_beat_receipt",
  "terminal_dialogue_receipt",
  "support_actor_materialization_receipt",
  "player_local_condition_receipt",
  "item_transfer_receipt",
  "minor_poi_handle_receipt",
  "terminal_mutation_receipt",
  "oracle_visible_outcome",
]);

const cleanEvidenceLimitSchema = z.object({
  proves: z.array(shortText).max(12),
  doesNotProve: z.array(shortText).max(16),
}).strict();

const cleanSettledBackendFactRoleSchema = z.enum([
  "anchor_location",
  "anchor_scene",
  "clarification_request",
  "closed_route_labels",
  "condition_key",
  "condition_result",
  "condition_target",
  "current_place_after_movement",
  "current_scene_anchor",
  "custody_change",
  "destination_label",
  "device_label",
  "device_surface_beat",
  "dialogue_quote",
  "dialogue_summary",
  "elapsed_time",
  "elapsed_travel_time",
  "final_equip_state",
  "handle_result",
  "inventory_status_beat",
  "inventory_labels",
  "item_label",
  "item_transfer_result",
  "local_observation_beat",
  "materialization_result",
  "minor_poi_beat",
  "minor_poi_operation",
  "observed_device_facets",
  "observed_entry_labels",
  "observed_visible_actor_labels",
  "observed_entry_surfaces",
  "observed_inventory_item_labels",
  "observation_query",
  "open_route_labels",
  "oracle_selected_meaning",
  "place_handle_kind",
  "place_handle_label",
  "place_handle_scope",
  "place_label",
  "player_condition_operation",
  "requested_surface_facets",
  "route_beat",
  "route_choice_labels",
  "route_choice_travel_costs",
  "route_choices_beat",
  "route_label",
  "route_origin",
  "route_status",
  "scene_beat",
  "scene_beat_kind",
  "scene_beat_target_labels",
  "scene_label",
  "scene_placement",
  "scene_texture",
  "searched_visible_surfaces",
  "settled_custody",
  "source_label",
  "speaker_label",
  "support_actor_presence",
  "support_actor_public_summary",
  "support_actor_visible_cue",
  "support_role",
  "target_label",
  "time_beat",
  "travel_beat",
  "unavailable_surface_facets",
  "visible_actor_labels",
  "visible_actor_target_labels",
  "visible_item_target_labels",
  "visible_location_target_labels",
  "visible_place_handle_target_labels",
  "visible_scene_facts",
  "visible_support_actor",
  "visible_target_labels",
]);

const cleanSettledBackendFactSchema = z.object({
  factRef: shortText,
  role: cleanSettledBackendFactRoleSchema.optional(),
  value: shortText.optional(),
  text: shortText,
  exact: z.boolean(),
}).strict();

export const cleanSettledEvidenceSchema = z.object({
  evidenceId: shortText,
  sourceKind: z.enum(["scene_frame", "gm_read", "judge_uncertainty", "stage4_receipt", "oracle_settlement"]),
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
      "local_observation_receipt",
      "device_surface_observation_receipt",
      "route_options_receipt",
    "route_check_receipt",
    "scene_beat_receipt",
    "terminal_dialogue_receipt",
    "support_actor_materialization_receipt",
    "player_local_condition_receipt",
    "item_transfer_receipt",
    "minor_poi_handle_receipt",
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

const cleanNarratorProseCueSchema = z.enum([
  "bounded_visibility_negative",
  "clarification_request",
  "current_scene_anchor",
  "device_surface_observation",
  "dialogue_response",
  "direct_scene_snapshot",
  "elapsed_time",
  "item_state",
  "local_observation",
  "minor_poi_handle",
  "movement_result",
  "oracle_outcome",
  "player_local_condition",
  "route_options",
  "route_status",
  "scene_beat",
  "scene_texture",
  "support_actor_materialization",
  "generic_accepted_evidence",
]);

const cleanNarratorCompositionSlotSchema = z.enum([
  "clarification",
  "event_beat",
  "next_action_context",
  "opening_context",
  "texture_context",
]);

const cleanNarratorStoryFrameEntrySchema = z.object({
  ref: shortText,
  authority: cleanSettledEvidenceAuthoritySchema,
  claimKinds: z.array(cleanSettledClaimKindSchema).min(1).max(6),
  proseCue: cleanNarratorProseCueSchema,
  compositionSlot: cleanNarratorCompositionSlotSchema,
  summary: shortText,
  backendFactRefs: z.array(shortText).min(1).max(8),
  limits: cleanEvidenceLimitSchema,
}).strict();

const cleanNarratorPagePlanStepSchema = z.object({
  step: z.enum([
    "ask_clarification",
    "open_with_context",
    "narrate_turn_event",
    "close_with_next_action_context",
  ]),
  entryRefs: z.array(shortText).min(1).max(24),
}).strict();

const cleanNarratorPagePlanSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-page-plan.v1"),
  source: z.literal("derived_from_story_frame_composition_slots"),
  steps: z.array(cleanNarratorPagePlanStepSchema).max(4),
}).strict();

const cleanNarratorStoryFrameSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-story-frame.v1"),
  source: z.literal("derived_from_prompt_accepted_evidence"),
  currentContext: z.array(cleanNarratorStoryFrameEntrySchema).max(24),
  turnEvents: z.array(cleanNarratorStoryFrameEntrySchema).max(24),
  pagePlan: cleanNarratorPagePlanSchema,
}).strict();

const cleanNarratorFactUseSchema = z.object({
  factRef: shortText,
  proseUse: z.enum([
    "exact_dialogue_quote",
    "exact_texture_sentence",
    "inventory_status",
    "label_anchor",
    "primary_beat",
    "route_choice",
    "scene_anchor",
    "state_value",
    "supporting_detail",
    "time_value",
  ]),
}).strict();

const cleanNarratorPageTaskMoveSchema = z.object({
  moveRef: shortText,
  step: z.enum([
    "ask_clarification",
    "open_with_context",
    "narrate_turn_event",
    "close_with_next_action_context",
  ]),
  entryRefs: z.array(shortText).min(1).max(24),
  entryProseCues: z.array(cleanNarratorProseCueSchema).min(1).max(24),
  proseMove: z.enum([
    "ask_accepted_question",
    "establish_playable_context",
    "render_authoritative_turn_event",
    "leave_playable_next_action_handle",
  ]),
  coverage: z.enum(["required", "optional"]),
  allowedBackendFactRefs: z.array(shortText).min(1).max(192),
  usableFacts: z.array(cleanSettledBackendFactSchema).min(1).max(192),
  factUses: z.array(cleanNarratorFactUseSchema).min(1).max(192),
}).strict();

const cleanNarratorSentencePlanStepSchema = z.object({
  sentenceRef: shortText,
  moveRef: shortText,
  sentenceRole: z.enum([
    "clarification_question",
    "context_anchor",
    "exact_context_texture",
    "next_action_handle",
    "turn_event_beat",
  ]),
  coverage: z.enum(["required", "optional"]),
  entryRefs: z.array(shortText).min(1).max(24),
  preferredBackendFactRefs: z.array(shortText).min(1).max(24),
  claimFocus: z.object({
    primaryClaimKinds: z.array(cleanSettledClaimKindSchema).min(1).max(6),
    supportingClaimKinds: z.array(cleanSettledClaimKindSchema).max(12),
    citationMode: z.literal("primary_claims_of_cited_sentence_plan_refs"),
  }).strict(),
  beatObjective: z.enum([
    "ask_clarification_question",
    "copy_scene_texture",
    "frame_dialogue_reply",
    "place_current_scene",
    "render_device_surface",
    "render_direct_scene_snapshot",
    "render_elapsed_time",
    "render_generic_evidence",
    "render_item_custody",
    "render_local_observation",
    "render_minor_poi_handle",
    "render_movement_arrival",
    "render_oracle_outcome",
    "render_player_condition",
    "render_route_choices",
    "render_route_status",
    "render_scene_beat",
    "render_support_actor_presence",
  ]),
  proseMaterials: z.array(z.object({
    factRef: shortText,
    proseUse: z.enum([
      "exact_dialogue_quote",
      "exact_texture_sentence",
      "inventory_status",
      "label_anchor",
      "primary_beat",
      "route_choice",
      "scene_anchor",
      "state_value",
      "supporting_detail",
      "time_value",
    ]),
    materialText: shortText,
    materialTextSource: z.enum(["accepted_text", "accepted_value"]),
    copyMode: z.enum([
      "copy_exact",
      "phrase_from_material",
      "preserve_token",
    ]),
  }).strict()).min(1).max(24),
  materialObligations: z.object({
    allowedMaterialFactRefs: z.array(shortText).min(1).max(24),
    coreMaterialFactRefs: z.array(shortText).min(1).max(24),
    exactCopyFactRefs: z.array(shortText).max(12),
    preserveTokenFactRefs: z.array(shortText).max(16),
    phraseFromMaterialFactRefs: z.array(shortText).max(16),
    citationMode: z.literal("cite_only_material_fact_refs_from_cited_sentence_plan_refs"),
  }).strict(),
  textureCue: z.object({
    mode: z.enum([
      "copy_exact_texture_sentence",
      "omit_texture_in_this_sentence",
    ]),
    playerFacingUse: z.enum([
      "none",
      "standalone_context_sentence",
    ]),
    allowedTextureFactRefs: z.array(shortText).max(12),
  }).strict(),
  adventureCue: z.object({
    subjectFocus: z.enum([
      "accepted_question",
      "accepted_texture",
      "elapsed_time_value",
      "item_custody_state",
      "observed_visible_entries",
      "playable_room_state",
      "playable_route_choices",
      "player_scene_position",
      "settled_result_material",
      "visible_support_actor",
      "visible_speaker",
    ]),
    verbFrame: z.enum([
      "ask_direct_question",
      "copy_visible_texture",
      "compose_playable_room_beat",
      "frame_exact_utterance",
      "land_settled_result",
      "land_item_custody",
      "land_visible_observation",
      "land_scene_custody",
      "land_support_presence",
      "mark_elapsed_time",
      "mark_elapsed_time_pressure",
      "offer_scene_exits",
      "place_player_in_scene",
    ]),
    detailPalette: z.array(z.enum([
      "accepted_labels",
      "accepted_primary_beat",
      "accepted_question",
      "accepted_quote",
      "accepted_room_state",
      "accepted_route_choices",
      "accepted_state",
      "accepted_texture",
      "accepted_time",
    ])).min(1).max(8),
  }).strict(),
  proseAssembly: z.object({
    perspective: z.enum([
      "direct_question",
      "environment_present",
      "playable_choice_present",
      "second_person_present",
      "settled_result_present",
      "visible_speaker_present",
    ]),
    sentenceShape: z.enum([
      "accepted_question_line",
      "clock_beat_line",
      "exact_texture_line",
      "item_custody_line",
      "local_observation_line",
      "minor_poi_handle_line",
      "playable_room_beat_line",
      "quote_framed_beat",
      "result_beat_line",
      "route_status_line",
      "scene_anchor_line",
      "scene_beat_surface_line",
      "scene_custody_beat_line",
      "scene_exit_choice_line",
      "support_actor_presence_line",
    ]),
    openingSource: z.enum([
      "accepted_question",
      "accepted_texture_material",
      "core_material_subject",
      "elapsed_time_value",
      "item_label_or_custody_state",
      "minor_poi_label",
      "observation_query",
      "observed_visible_label",
      "playable_route_label",
      "preserved_label_anchor",
      "route_label_or_status",
      "route_exit_label",
      "visible_support_actor_label",
      "visible_speaker_label",
    ]),
    verbEnergy: z.enum([
      "ask",
      "concrete_present",
      "copy_exact",
      "frame_speech",
      "land_result",
      "land_custody",
      "mark_scene_handle",
      "land_visible_observation",
      "mark_time",
      "offer_choice",
      "offer_scene_exit",
      "place_presence",
      "pressure_time",
      "report_route_status",
    ]),
    detailRhythm: z.enum([
      "core_with_preserved_tokens",
      "exact_quote_with_frame",
      "exit_group",
      "exit_group_with_cost",
      "item_custody_with_holder",
      "item_custody_with_scene_anchor",
      "minor_poi_with_kind_scene_anchor",
      "observed_labels_with_scene_anchor",
      "room_beat_with_state_and_exits",
      "query_with_scene_anchor",
      "route_status_with_label",
      "actor_role_with_scene_anchor",
      "actor_presence_with_scene_role_context",
      "actor_visible_cue_with_scene_role_context",
      "accepted_beat_plus_sensory_texture",
      "scene_anchor_tokens",
      "single_core_material",
      "time_with_scene_anchor",
      "texture_line",
    ]),
    materialWeaveOrder: z.enum([
      "accepted_question_only",
      "custody_then_holder",
      "exits_only",
      "exits_then_costs",
      "item_then_custody_then_holder_scene",
      "item_source_target_state_scene_then_custody_proof",
      "minor_poi_label_kind_then_scene",
      "observed_labels_then_scene",
      "scene_actor_inventory_then_exits",
      "query_scene_then_bounded_no_match_proof",
      "actor_then_role_then_scene",
      "actor_then_scene_with_role_context",
      "actor_then_visible_cue_then_scene",
      "accepted_beat_then_sensory_stop",
      "result_only",
      "result_then_preserved_tokens",
      "route_status_then_label",
      "scene_anchor_only",
      "speaker_then_quote",
      "time_then_scene_anchor",
      "time_pressure_then_scene_anchor",
      "texture_exact_only",
    ]),
    styleBudget: z.enum([
      "direct_question_clarity",
      "exact_texture_atmosphere",
      "item_custody_cadence",
      "local_observation_cadence",
      "minor_poi_cadence",
      "quote_frame_cadence",
      "clock_beat_cadence",
      "clock_pressure_cadence",
      "result_beat_cadence",
      "result_with_anchor_cadence",
      "route_status_cadence",
      "scene_beat_surface_cadence",
      "scene_exit_handoff_cadence",
      "playable_room_beat_cadence",
      "scene_anchor_cadence",
      "scene_custody_cadence",
      "support_presence_cadence",
    ]),
    closingFunction: z.enum([
      "offer_next_action",
      "orient_context",
      "request_answer",
      "settle_outcome",
    ]),
  }).strict(),
  flowCue: z.object({
    pagePosition: z.enum([
      "closing",
      "continuation",
      "opening",
      "single",
    ]),
    transitionRole: z.enum([
      "accepted_question",
      "context_setup",
      "context_texture",
      "playable_handle",
      "settled_result",
    ]),
    readerEffect: z.enum([
      "carry_forward_context",
      "land_outcome",
      "offer_next_action",
      "orient_player",
      "request_specific_answer",
    ]),
  }).strict(),
  literaryCue: z.object({
    renderShape: z.enum([
      "ask_accepted_clarification",
      "copy_exact_context_texture",
      "frame_exact_quote",
      "land_item_custody",
      "land_visible_observation",
      "land_settled_turn_result",
      "answer_route_status",
      "leave_scene_exit_handoff",
      "mark_elapsed_time_clock_beat",
      "mark_elapsed_time_pressure_clock_beat",
      "place_player_in_context",
      "weave_scene_beat_surface",
      "weave_item_custody_scene_beat",
      "weave_minor_poi_scene_handle",
      "weave_support_actor_scene_presence",
    ]),
    cadence: z.enum([
      "clock_beat_sentence",
      "compact_present_beat",
      "custody_beat_sentence",
      "direct_question",
      "exact_short_sentence",
      "pressure_clock_beat_sentence",
      "quote_framed_beat",
      "local_observation_beat_sentence",
      "minor_poi_handle_sentence",
      "route_status_beat_sentence",
      "scene_beat_surface_sentence",
      "scene_custody_beat_sentence",
      "scene_exit_choice_sentence",
      "support_presence_beat_sentence",
    ]),
    styleLevers: z.array(z.enum([
      "accepted_label_anchor",
      "accepted_texture_only",
      "concrete_present_verb",
      "clock_pressure_verb",
      "custody_endpoint_rotation",
      "elapsed_time_pressure",
      "item_custody_focus",
      "local_observation_focus",
      "minor_poi_focus",
      "route_exit_grouping",
      "route_status_focus",
      "settled_state_focus",
      "scene_beat_surface_focus",
      "support_actor_presence_focus",
      "visible_speaker_frame",
    ])).min(1).max(4),
  }).strict(),
}).strict();

const cleanNarratorPageArcSchema = z.object({
  arcShape: z.enum([
    "accepted_clarification_question",
    "audit_notice_only",
    "context_then_choice_handle",
    "context_then_settled_result",
    "single_choice_handle",
    "single_settled_result",
  ]),
  pageCadence: z.enum([
    "audit_notice_only",
    "context_then_choice",
    "context_then_result",
    "question_only",
    "single_compact_beat",
  ]),
  readerPosture: z.enum([
    "answer_the_prompted_clarification",
    "choose_visible_next_action",
    "continue_from_settled_result",
    "review_audit_notice",
  ]),
  closingIntent: z.enum([
    "accepted_question",
    "audit_notice",
    "playable_next_action",
    "settled_result",
  ]),
}).strict();

const cleanNarratorPagePerformanceSchema = z.object({
  openingBeat: z.enum([
    "accepted_question_opening",
    "audit_notice_opening",
    "context_anchor_opening",
    "exact_texture_opening",
    "playable_choices_opening",
    "settled_result_opening",
  ]),
  pageMotion: z.enum([
    "audit_notice_only",
    "context_to_choices",
    "context_to_result",
    "question_only",
    "single_choice_handle",
    "single_result",
  ]),
  continuityMaterial: z.enum([
    "accepted_question",
    "audit_notice",
    "context_labels_to_choices",
    "context_labels_to_result",
    "playable_route_material",
    "result_material",
    "texture_to_choices",
    "texture_to_result",
  ]),
  closingBeat: z.enum([
    "accepted_question_closure",
    "audit_notice_closure",
    "playable_handle_closure",
    "settled_result_closure",
  ]),
  readerHandoff: z.enum([
    "answer_clarification",
    "choose_next_action",
    "continue_from_result",
    "review_audit_notice",
  ]),
}).strict();

const cleanNarratorPageVariationSchema = z.object({
  openingRotation: z.enum([
    "audit_notice_first",
    "context_label_first",
    "core_result_first",
    "question_material_first",
    "route_choice_first",
    "texture_sentence_first",
  ]),
  cadenceTarget: z.enum([
    "audit_notice_sentence",
    "choice_list_as_sentence",
    "context_then_playable_handle",
    "context_then_short_result",
    "direct_question",
    "single_micro_beat",
  ]),
  dictionPalette: z.array(z.enum([
    "accepted_texture_atmosphere",
    "audit_notice_clarity",
    "concrete_result_verbs",
    "playable_route_labels",
    "question_clarity",
    "quote_frame",
    "scene_anchor_tokens",
    "time_pressure",
  ])).min(1).max(7),
  variationBoundary: z.literal("vary_syntax_only_inside_cited_material"),
  openingDoor: z.enum([
    "accepted_texture_first",
    "choice_handoff_first",
    "core_result_first",
    "object_or_actor_first",
    "sensory_strike_first",
    "speech_first",
  ]),
  recentSurfaceAvoid: z.object({
    source: z.literal("recent_player_facing_style_only"),
    maySupportWorldTruth: z.literal(false),
    recentOpeningDoors: z.array(z.enum([
      "accepted_texture_first",
      "choice_handoff_first",
      "core_result_first",
      "object_or_actor_first",
      "sensory_strike_first",
      "speech_first",
    ])).max(24),
    recentFirstSentenceShapes: z.array(shortText).max(24),
  }).strict(),
}).strict();

const cleanNarratorPageFocusSchema = z.object({
  coreMoveRefs: z.array(shortText).max(4),
  frameMoveRefs: z.array(shortText).max(4),
  coreSentenceRefs: z.array(shortText).max(6),
  frameSentenceRefs: z.array(shortText).max(6),
  preferredFrameSentenceRefs: z.array(shortText).max(6),
  emphasis: z.enum([
    "accepted_clarification",
    "audit_notice",
    "playable_next_action",
    "settled_turn_event",
  ]),
  frameSelection: z.enum([
    "audit_notice_only",
    "no_frame",
    "prefer_scene_anchor_frame",
    "prefer_texture_frame",
  ]),
  coreFrameRelationship: z.enum([
    "audit_notice_only",
    "choices_stand_alone",
    "context_frames_choices",
    "context_frames_result",
    "question_is_page_core",
    "result_stands_alone",
  ]),
  contextUse: z.enum([
    "audit_only",
    "none",
    "orient_before_core",
    "texture_before_core",
  ]),
}).strict();

const cleanNarratorChoicePresentationSchema = z.object({
  mode: z.enum([
    "compact_route_group",
    "none",
    "single_route",
    "wide_scene_exit_group",
  ]),
  sourceMoveRefs: z.array(shortText).max(4),
  sourceSentenceRefs: z.array(shortText).max(6),
  choices: z.array(z.object({
    label: shortText,
    labelFactRef: shortText,
    costText: shortText.nullable(),
    costFactRef: shortText.nullable(),
  }).strict()).max(24),
  choiceCount: z.number().int().min(0).max(24),
  sharedCostText: shortText.nullable(),
  sharedCostFactRef: shortText.nullable(),
  anchorFactRefs: z.array(shortText).max(4),
  anchorStyle: z.enum([
    "choice_labels_only",
    "route_origin_place_label",
  ]),
  labelHandling: z.literal("preserve_route_labels_verbatim"),
  costHandling: z.enum([
    "omit_costs",
    "preserve_per_route_costs",
    "preserve_shared_cost",
  ]),
  closingStyle: z.enum([
    "group_named_options_with_cost",
    "name_single_exit",
    "none",
    "show_scene_exit_group",
  ]),
  readerHandoff: z.enum([
    "choose_one_visible_route",
    "none",
  ]),
}).strict();

const cleanNarratorDirectScenePresentationSchema = z.object({
  mode: z.enum([
    "look_around_digest",
    "none",
    "playable_room_beat",
  ]),
  sourceMoveRefs: z.array(shortText).max(4),
  sourceSentenceRefs: z.array(shortText).max(6),
  sentenceObjectPolicy: z.enum([
    "none",
    "optional_texture_then_single_room_beat",
    "single_room_beat",
  ]),
  roomBeatSplitPolicy: z.enum([
    "actor_inventory_routes_same_sentence_text",
    "none",
  ]),
  catalogPolicy: z.enum([
    "no_receipt_lists",
    "none",
  ]),
  mergeAllowed: z.boolean(),
  routeClose: z.enum([
    "final_handoff_when_present",
    "none",
  ]),
  inventoryPolicy: z.enum([
    "none",
    "subordinate_unless_core",
  ]),
}).strict();

const cleanNarratorStoryPageBriefSchema = z.object({
  pageKind: z.enum([
    "audit_notice_page",
    "clarification_prompt_page",
    "context_to_playable_choices_page",
    "context_to_settled_result_page",
    "playable_choices_page",
    "settled_turn_page",
  ]),
  narratorStance: z.literal("second_person_present_player_view"),
  proseRegister: z.literal("grounded_adventure_micro_page"),
  compositionJob: z.enum([
    "ask_accepted_clarification",
    "land_settled_turn_result",
    "render_audit_notice",
    "place_context_then_land_result",
    "place_context_then_offer_scene_exits",
    "offer_scene_exits",
  ]),
  openingInstruction: z.enum([
    "ask_accepted_question",
    "begin_with_audit_notice",
    "begin_with_accepted_context",
    "begin_with_playable_choices",
    "begin_with_settled_result",
  ]),
  closingInstruction: z.enum([
    "close_on_accepted_question",
    "close_on_audit_notice",
    "close_on_playable_handle",
    "close_on_settled_result",
  ]),
  requiredMoveRefs: z.array(shortText).max(4),
  optionalMoveRefs: z.array(shortText).max(4),
  requiredSentenceRefs: z.array(shortText).max(6),
  optionalSentenceRefs: z.array(shortText).max(6),
}).strict();

const cleanNarratorPageTaskSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-page-task.v1"),
  source: z.literal("derived_from_story_frame_page_plan"),
  referenceProfile: z.literal("zetta_onyx_1_37_primary_balanced_freaky_nsfw_donor"),
  pageGoal: z.literal("turn_changelog_to_grounded_text_rpg_page"),
  truthBoundary: z.literal("hard_facts_strict_soft_prose_free"),
  storyPageBrief: cleanNarratorStoryPageBriefSchema,
  pageArc: cleanNarratorPageArcSchema,
  pagePerformance: cleanNarratorPagePerformanceSchema,
  pageVariation: cleanNarratorPageVariationSchema,
  pageFocus: cleanNarratorPageFocusSchema,
  choicePresentation: cleanNarratorChoicePresentationSchema,
  directScenePresentation: cleanNarratorDirectScenePresentationSchema,
  moves: z.array(cleanNarratorPageTaskMoveSchema).max(4),
  sentencePlan: z.array(cleanNarratorSentencePlanStepSchema).max(6),
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

export const cleanNarrationLanguageSchema = z.enum(["en", "ru", "mixed"]);

export const cleanNarratorViewSchema = z.object({
  version: z.literal("gameplay-runtime.narrator-view.v1"),
  packetId: shortText,
  campaignId: shortText,
  turnId: shortText,
  responseLanguage: z.literal("match_player_action"),
  language: cleanNarrationLanguageSchema,
  languageSource: z.literal("derived_from_player_action_without_prompting_raw_action"),
  preserveLabelsVerbatim: z.literal(true),
  acceptedEvidence: z.array(cleanNarratorAcceptedEvidenceSchema).max(24),
  stepAuditForGrounding: z.array(cleanNarratorAuditNoticeSchema).max(6),
  guard: cleanNarratorGuardSchema,
  privateGuardSidecar: z.object({
    forbiddenActorLabels: z.array(shortText).max(64),
    forbiddenPrivateTerms: z.array(shortText).max(128),
  }).strict(),
}).strict().superRefine((view, ctx) => {
  const publicTexts = [
    ...view.acceptedEvidence.flatMap((evidence) => [
      evidence.text,
      ...evidence.backendFacts.flatMap((fact) => [fact.text, fact.value ?? ""]),
    ]),
    ...view.stepAuditForGrounding.map((step) => step.publicReason),
  ];
  if (publicTexts.some(containsUuidLikeBackendId)) {
    ctx.addIssue({ code: "custom", path: ["acceptedEvidence"], message: "Narrator view must not expose UUID-like backend ids." });
  }
  if (publicTexts.some(containsBackendRefToken)) {
    ctx.addIssue({ code: "custom", path: ["acceptedEvidence"], message: "Narrator view must not expose backend refs." });
  }
});

export const cleanNarratorPromptInputSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narrator-prompt-input.v1"),
  packetId: shortText,
  turnId: shortText,
  responseLanguage: z.literal("match_player_action"),
  language: cleanNarrationLanguageSchema,
  languageSource: z.literal("derived_from_player_action_without_prompting_raw_action"),
  preserveLabelsVerbatim: z.literal(true),
  acceptedEvidence: z.array(cleanNarratorAcceptedEvidenceSchema).max(24),
  hardFactContract: cleanNarratorHardFactContractSchema,
  softProseBudget: cleanNarratorSoftProseBudgetSchema,
  storyFrame: cleanNarratorStoryFrameSchema,
  narrativePageTask: cleanNarratorPageTaskSchema,
  stepAuditForGrounding: z.array(cleanNarratorAuditNoticeSchema).max(6),
  guard: cleanNarratorGuardSchema,
}).strict();

export const cleanNarrationSentenceSchema = z.object({
  kind: shortText,
  text: z.string().trim().min(1).max(900),
  evidenceRefs: z.array(shortText).max(12),
  backendFactRefs: z.array(shortText).max(12),
  claimKinds: z.array(shortText).max(6),
  hardClaims: z.array(shortText).max(10).default([]),
  softProseKinds: z.array(shortText).max(12).default([]),
  pageMoveRefs: z.array(shortText).max(4).default([]),
  sentencePlanRefs: z.array(shortText).max(4).default([]),
  auditStepIds: z.array(gmActionChecklistStepIdSchema).max(6).default([]),
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
    "deterministic_authority_projection",
  ]),
}).strict();

const cleanNarrationProofValidationIssueSchema = z.object({
  code: shortText,
  path: z.string().trim().min(1).max(300),
  message: z.string().trim().min(1).max(700),
}).strict();

export const cleanNarrationProofSchema = z.object({
  version: z.literal("gameplay-runtime.clean-narration-proof.v1"),
  result: cleanNarrationResultSchema,
  promptInput: cleanNarratorPromptInputSchema,
  candidate: cleanNarrationCandidateSchema.nullable(),
  validation: z.object({
    status: z.enum(["accepted", "deterministic_authority_projection"]),
    issues: z.array(cleanNarrationProofValidationIssueSchema).max(24),
  }).strict(),
}).strict().superRefine((proof, ctx) => {
  if (proof.result.packetId !== proof.promptInput.packetId) {
    ctx.addIssue({ code: "custom", path: ["result", "packetId"], message: "Narration proof result packetId must match promptInput." });
  }
  if (proof.result.turnId !== proof.promptInput.turnId) {
    ctx.addIssue({ code: "custom", path: ["result", "turnId"], message: "Narration proof result turnId must match promptInput." });
  }
  if (proof.result.source === "model") {
    if (proof.validation.status !== "accepted") {
      ctx.addIssue({ code: "custom", path: ["validation", "status"], message: "Model narration proof must carry accepted validation status." });
    }
    if (proof.candidate === null) {
      ctx.addIssue({ code: "custom", path: ["candidate"], message: "Model narration proof must preserve the accepted model candidate." });
    } else {
      if (proof.candidate.packetId !== proof.result.packetId) {
        ctx.addIssue({ code: "custom", path: ["candidate", "packetId"], message: "Narration proof candidate packetId must match result." });
      }
      if (proof.candidate.turnId !== proof.result.turnId) {
        ctx.addIssue({ code: "custom", path: ["candidate", "turnId"], message: "Narration proof candidate turnId must match result." });
      }
      if (proof.candidate.finalText !== proof.result.text) {
        ctx.addIssue({ code: "custom", path: ["candidate", "finalText"], message: "Narration proof candidate finalText must match result text." });
      }
    }
  }
  if (proof.result.source === "deterministic_authority_projection") {
    if (proof.validation.status !== "deterministic_authority_projection") {
      ctx.addIssue({ code: "custom", path: ["validation", "status"], message: "Deterministic narration proof must carry deterministic validation status." });
    }
    if (proof.candidate !== null) {
      ctx.addIssue({ code: "custom", path: ["candidate"], message: "Deterministic narration proof must not carry a model candidate." });
    }
  }
});

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
  tick: z.number().int().nonnegative(),
  worldVersion: z.number().int().nonnegative(),
  worldTimeMinutes: z.number().int().nonnegative(),
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
  narration: cleanNarrationProofSchema.optional(),
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
export type CleanNarrationProof = z.infer<typeof cleanNarrationProofSchema>;
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
