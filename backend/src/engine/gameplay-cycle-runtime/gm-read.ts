import { z } from "zod";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  assertGmRead,
  cleanItemTransferOperationSchema,
  cleanItemTransferSourceKindSchema,
  cleanItemTransferTargetKindSchema,
  cleanLocalObservationModeSchema,
  cleanLocalObservationSurfaceKindSchema,
  cleanMinorPoiKindSchema,
  cleanSceneBeatKindSchema,
  cleanTimeAdvanceReasonKindSchema,
  gmReadSchema,
  gmReadActionInterpretationSchema,
  type AuthoritativeSceneFrame,
  type GmRead,
} from "./contracts.js";

const FORBIDDEN_EXECUTION_KEYS = new Set([
  "args",
  "candidateToolRequest",
  "check",
  "checklist",
  "checklistStep",
  "delta",
  "effect",
  "effectKind",
  "effects",
  "input",
  "mutation",
  "mutationApplied",
  "mutationAuthority",
  "oracle",
  "oracleAdmission",
  "oraclePayload",
  "oracleResult",
  "payload",
  "plannedTools",
  "receipt",
  "receiptId",
  "receipts",
  "requiredEffectKinds",
  "resultWorldVersion",
  "stateDelta",
  "step",
  "steps",
  "tool",
  "toolCall",
  "toolId",
  "toolInput",
  "toolName",
  "toolRequest",
  "worldVersionDelta",
]);

const NORMALIZED_FORBIDDEN_EXECUTION_KEYS = new Set(
  [...FORBIDDEN_EXECUTION_KEYS].map(normalizedKey),
);

const UUID_LIKE_REF = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const BACKEND_REF_PREFIX = /^(actor|campaign|edge|fact|frame|item|location|npc|packet|receipt|route|scene|turn|world)[_:]/i;

const gmReadGenerationModelSafeRef = z.string().trim().min(1).max(120);
const gmReadGenerationShortText = z.string().trim().min(1).max(500);
const gmReadGenerationRepairableText = z.string().trim().min(1).max(2000);
const DEFAULT_GM_READ_LIVE_SCENE_QUESTION = "Which current-scene consequence should be resolved?";
type CleanItemTransferOperation = z.infer<typeof cleanItemTransferOperationSchema>;
type CleanItemTransferSourceKind = z.infer<typeof cleanItemTransferSourceKindSchema>;
type CleanItemTransferTargetKind = z.infer<typeof cleanItemTransferTargetKindSchema>;

const ITEM_TRANSFER_OPERATION_SHAPE: Record<CleanItemTransferOperation, {
  sourceKind: CleanItemTransferSourceKind;
  targetKind: CleanItemTransferTargetKind;
  equipSlot: "equipped" | null;
}> = {
  give_to_visible_actor: { sourceKind: "player_inventory", targetKind: "visible_actor", equipSlot: null },
  receive_from_visible_actor: { sourceKind: "visible_actor_item", targetKind: "player_inventory", equipSlot: null },
  drop_in_current_scene: { sourceKind: "player_inventory", targetKind: "current_scene", equipSlot: null },
  pickup_from_current_scene: { sourceKind: "current_scene_item", targetKind: "player_inventory", equipSlot: null },
  equip_inventory_item: { sourceKind: "player_inventory", targetKind: "player_equipment", equipSlot: "equipped" },
  unequip_inventory_item: { sourceKind: "player_inventory", targetKind: "player_inventory", equipSlot: null },
};

const FIRST_PERSON_GIVE_TO_VISIBLE_ACTOR_WORDS = new Set(["hand", "give", "pass", "offer", "transfer"]);
const GIVE_TO_VISIBLE_ACTOR_LINK_WORDS = new Set(["to", "toward", "towards"]);
const GIVE_TO_VISIBLE_ACTOR_DIRECT_OBJECT_BRIDGE_WORDS = new Set(["a", "an", "the", "my", "this", "that", "his", "her", "their", "its"]);
const FIRST_PERSON_GIVE_CUE_PREFIX_WORDS = new Set([
  "physically",
  "carefully",
  "quietly",
  "briefly",
  "deliberately",
  "openly",
  "slowly",
  "gently",
  "firmly",
  "directly",
  "immediately",
]);
const FIRST_PERSON_GIVE_CONDITIONAL_PREFIX_WORDS = new Set(["if", "whether", "when", "should", "could", "would"]);
const RECEIVE_FROM_VISIBLE_ACTOR_WORDS = new Set(["return", "give", "hand", "pass"]);
const VISIBLE_ACTOR_DIALOGUE_WORDS = new Set([
  "ask",
  "asked",
  "asks",
  "tell",
  "told",
  "tells",
  "say",
  "said",
  "says",
  "answer",
  "answered",
  "answers",
  "greet",
  "greeted",
  "greets",
  "threaten",
  "threatened",
  "threatens",
  "bargain",
  "bargained",
  "bargains",
  "request",
  "requested",
  "requests",
]);
const CARRIED_ITEM_READINESS_WORDS = new Set([
  "above",
  "clear",
  "dry",
  "grip",
  "gripped",
  "gripping",
  "grips",
  "hand",
  "high",
  "hold",
  "holding",
  "holds",
  "protect",
  "protected",
  "protecting",
  "ready",
  "safe",
  "steady",
]);

const gmReadGenerationItemTransferNeedSchema = z.object({
  actorRef: z.literal("Player"),
  operation: cleanItemTransferOperationSchema,
  itemRef: gmReadGenerationModelSafeRef,
  sourceKind: gmReadGenerationModelSafeRef,
  sourceRef: gmReadGenerationModelSafeRef.nullable().optional(),
  targetKind: gmReadGenerationModelSafeRef,
  targetRef: gmReadGenerationModelSafeRef,
  equipSlot: z.enum(["equipped", "carried"]).nullable(),
  requestedItemText: gmReadGenerationShortText,
  evidenceRefs: z.array(gmReadGenerationModelSafeRef).min(1).max(12),
}).strict();

const gmReadGenerationMinorPoiNeedSchema = z.object({
  actorRef: z.literal("Player"),
  placeLabel: gmReadGenerationShortText,
  placeKind: cleanMinorPoiKindSchema,
  anchorRef: gmReadGenerationModelSafeRef,
  evidenceRefs: z.array(gmReadGenerationModelSafeRef).min(1).max(12),
}).strict();

const gmReadGenerationTimePassageNeedSchema = z.object({
  actorRef: z.literal("Player"),
  elapsedMinutes: z.number().int().min(1).max(60),
  reasonKind: cleanTimeAdvanceReasonKindSchema,
  requestedDurationText: gmReadGenerationShortText,
  evidenceRefs: z.array(gmReadGenerationModelSafeRef).min(1).max(12),
}).strict();

const gmReadGenerationLocalObservationNeedSchema = z.object({
  actorRef: z.literal("Player"),
  mode: cleanLocalObservationModeSchema,
  queryText: gmReadGenerationShortText.optional(),
  targetRef: gmReadGenerationModelSafeRef.nullable().optional(),
  surfaceKinds: z.array(cleanLocalObservationSurfaceKindSchema).min(1).max(7),
  allowBoundedNegative: z.boolean(),
  evidenceRefs: z.array(gmReadGenerationModelSafeRef).min(1).max(12),
}).strict();

const gmReadGenerationSceneBeatNeedSchema = z.object({
  actorRef: z.literal("Player"),
  beatKind: cleanSceneBeatKindSchema,
  requestedBeatText: gmReadGenerationShortText,
  anchorRef: gmReadGenerationModelSafeRef,
  evidenceRefs: z.array(gmReadGenerationModelSafeRef).min(1).max(12),
}).strict();

const gmReadGenerationUncertaintySchema = z.object({
  present: z.boolean(),
  question: z.string().trim().max(500).nullable().optional(),
  basis: z.string().trim().max(500).nullable().optional(),
}).strict();

const gmReadGenerationActionInterpretationSchema = (
  gmReadActionInterpretationSchema as unknown as {
    safeExtend: (shape: Record<string, z.ZodType>) => z.ZodType;
  }
).safeExtend({
  method: z.string().trim().max(500).nullable().optional(),
  targetRefs: z.array(gmReadGenerationModelSafeRef).max(12).optional(),
  itemTransferNeed: gmReadGenerationItemTransferNeedSchema.nullable().optional(),
  minorPoiNeed: gmReadGenerationMinorPoiNeedSchema.nullable().optional(),
  timePassageNeed: gmReadGenerationTimePassageNeedSchema.nullable().optional(),
  sceneBeatNeed: gmReadGenerationSceneBeatNeedSchema.nullable().optional(),
  localObservationNeed: gmReadGenerationLocalObservationNeedSchema.nullable().optional(),
});

export const gmReadModelGenerationSchema = gmReadSchema.extend({
  situationSummary: gmReadGenerationRepairableText,
  liveSceneQuestion: z.union([gmReadGenerationRepairableText, z.null()]),
  uncertainty: gmReadGenerationUncertaintySchema.optional(),
  actionInterpretation: gmReadGenerationActionInterpretationSchema,
  interpretationRationale: gmReadGenerationRepairableText,
}).passthrough();

export interface GmReadValidationIssue {
  code:
    | "backend_ref"
    | "execution_payload"
    | "frame_mismatch"
    | "interaction_invalid"
    | "private_term"
    | "schema_invalid"
    | "uncited_ref";
  path: string;
  message: string;
}

export interface GmReadAccepted {
  status: "accepted";
  read: GmRead;
  issues: [];
  repairAttempted: boolean;
}

export type GmReadRunResult = GmReadAccepted;

export class CleanGmReadGenerationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "CleanGmReadGenerationError";
  }
}

export class CleanGmReadValidationError extends Error {
  readonly issues: GmReadValidationIssue[];

  constructor(message: string, issues: GmReadValidationIssue[]) {
    super(message);
    this.name = "CleanGmReadValidationError";
    this.issues = issues;
  }
}

function gmReadIssueSummary(issues: readonly GmReadValidationIssue[]): string {
  return issues
    .slice(0, 4)
    .map((issue) => `${issue.path}: ${issue.message}`)
    .join("; ");
}

export interface GmReadCandidateRequest {
  system: string;
  prompt: string;
}

export type GmReadCandidateGenerator = (request: GmReadCandidateRequest) => Promise<unknown>;
export interface GmReadRecentConversationMessage {
  role: string;
  content: string;
}

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function compactGmReadDiscourseText(value: string, maxLength = 700): string {
  const oneLine = value
    .replaceAll("\r", " ")
    .replaceAll("\n", " ")
    .replaceAll("\t", " ")
    .trim();
  if (oneLine.length <= maxLength) return oneLine;
  return `${oneLine.slice(0, maxLength - 1).trim()}...`;
}

function gmReadRecentDiscourseCue(
  recentConversation?: readonly GmReadRecentConversationMessage[],
): string {
  const entries = (recentConversation ?? [])
    .slice(-6)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "other",
      content: compactGmReadDiscourseText(message.content),
    }))
    .filter((message) => message.content.length > 0);
  if (entries.length === 0) {
    return "Recent discourse context: none.";
  }
  return [
    "Recent discourse context (non-authoritative):",
    "Use this only to resolve pronouns and short references to immediately recent player-facing prose, such as the scrap, that stool, the loose brick, or the chair. It may identify a low-stakes current-scene discourse handle; it does not prove inventory, custody, hidden mechanisms, route truth, safety, damage, secrets, durable item state, or future availability.",
    "For recent soft prop references that are not SceneFrame refs, keep targetRefs/targetRef to current scene refs or null. Use scene_local_beat for immediate use/readiness, and current_scene_observation with localObservationNeed.targetRef=null for visible or hidden-property checks.",
    JSON.stringify(entries, null, 2),
  ].join("\n");
}

function isGenericVisibleActorQuery(value: string): boolean {
  const words = new Set(asciiWordTokens(value));
  const propertyQueryWords = [
    "waiting",
    "waits",
    "seems",
    "looking",
    "holding",
    "carrying",
    "wearing",
    "watching",
    "guarding",
    "following",
    "expecting",
    "courier",
    "contact",
    "commissioner",
  ];
  if (propertyQueryWords.some((word) => words.has(word))) return false;
  return (
    words.has("people")
    || words.has("person")
    || words.has("persons")
    || words.has("anyone")
    || words.has("someone")
    || words.has("somebody")
    || words.has("actors")
    || words.has("npcs")
    || words.has("npc")
    || (words.has("who") && (words.has("visible") || words.has("nearby") || words.has("here")))
  );
}

function publicDeviceFacetKinds(input: {
  frame: AuthoritativeSceneFrame;
  deviceRef: string;
}): Set<string> {
  const surface = (input.frame.deviceStatusSurfaces ?? []).find((candidate) =>
    candidate.deviceRef.toLowerCase() === input.deviceRef.toLowerCase()
  );
  return new Set((surface?.facets ?? [])
    .filter((facet) => facet.publicSafe)
    .map((facet) => facet.facetKind));
}

function normalizeGmReadDeviceNoSurfaceAdmission(input: {
  frame: AuthoritativeSceneFrame;
  read: GmRead;
}): GmRead {
  const need = input.read.actionInterpretation.deviceObservationNeed ?? null;
  if (!need || need.allowNoSurface) return input.read;

  const publicFacetKinds = publicDeviceFacetKinds({
    frame: input.frame,
    deviceRef: need.deviceRef,
  });
  const hasRequestedPublicFacet = need.facetKinds.some((kind) => publicFacetKinds.has(kind));
  if (hasRequestedPublicFacet) return input.read;

  return {
    ...input.read,
    actionInterpretation: {
      ...input.read.actionInterpretation,
      deviceObservationNeed: {
        ...need,
        allowNoSurface: true,
      },
    },
  };
}

function hasAllowedCleanCapability(frame: AuthoritativeSceneFrame, capabilityId: string): boolean {
  return frame.capabilities.some((capability) =>
    capability.capabilityId === capabilityId && capability.allowed
  );
}

function isBroadRouteListSurface(surfaceKinds: readonly string[]): boolean {
  const allowedAnchorKinds = new Set(["movement_option", "current_scene", "current_location"]);
  const kinds = uniqueStrings(surfaceKinds);
  return kinds.includes("movement_option")
    && kinds.every((surfaceKind) => allowedAnchorKinds.has(surfaceKind));
}

function isBroadSceneOverviewQueryText(value: string): boolean {
  const text = value.trim().toLocaleLowerCase("en-US");
  if (!text) return false;
  return [
    "look around",
    "take in",
    "what is visible",
    "what's visible",
    "what is here",
    "what's here",
    "what is around",
    "what's around",
    "what is immediately useful",
    "what feels immediately useful",
    "immediately useful around",
    "immediately useful in",
    "useful or notable",
  ].some((cue) => text.includes(cue));
}

function isBroadRouteOptionsQueryText(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const text = value.trim().toLocaleLowerCase("en-US");
  if (!text) return false;
  return [
    "ways out",
    "ways onward",
    "ways forward",
    "ways from here",
    "ways i can go",
    "ways we can go",
    "exit options",
    "route options",
    "routes out",
    "current routes",
    "available routes",
    "list routes",
    "show routes",
    "list exits",
    "show exits",
    "where can i go",
    "where can we go",
    "what routes",
    "what exits",
    "what paths",
    "paths out",
  ].some((cue) => text.includes(cue));
}

function normalizeGmReadBroadSceneOverviewObservation(input: {
  frame: AuthoritativeSceneFrame;
  read: GmRead;
}): GmRead {
  const { frame, read } = input;
  const localObservationNeed = read.actionInterpretation.localObservationNeed ?? null;
  if (read.actionInterpretation.interactionKind !== "current_scene_observation") return read;
  if (!localObservationNeed) return read;
  if (localObservationNeed.mode !== "list_surface") return read;
  if (localObservationNeed.allowBoundedNegative) return read;

  const kinds = uniqueStrings(localObservationNeed.surfaceKinds);
  if (kinds.length === 0) return read;
  const broadOverviewKinds = new Set([
    "current_scene",
    "current_location",
    "visible_actor",
    "visible_target",
    "inventory_item",
    "movement_option",
    "visible_fact",
  ]);
  if (!kinds.every((surfaceKind) => broadOverviewKinds.has(surfaceKind))) {
    return read;
  }
  const onlySceneAnchors = kinds.every((surfaceKind) => surfaceKind === "current_scene" || surfaceKind === "current_location");
  const broadMixedOverview = kinds.length > 1 && !(
    kinds.length === 1
    || (kinds.length === 2 && kinds.includes("current_scene") && kinds.includes("current_location"))
  );
  const broadQueryOverview = localObservationNeed.targetRef === null
    && isBroadSceneOverviewQueryText(localObservationNeed.queryText);
  if (!onlySceneAnchors && !broadMixedOverview && !broadQueryOverview) return read;

  const sceneAnchors = new Set([
    frame.scene.currentScene.ref,
    frame.scene.currentScene.label,
    frame.scene.currentLocation.ref,
    frame.scene.currentLocation.label,
  ].filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.toLocaleLowerCase("en-US")));
  if (
    localObservationNeed.targetRef !== null
    && !sceneAnchors.has(localObservationNeed.targetRef.toLocaleLowerCase("en-US"))
  ) {
    return read;
  }

  return {
    ...read,
    actionInterpretation: {
      ...read.actionInterpretation,
      localObservationNeed: null,
    },
  };
}

function normalizeGmReadRouteListObservation(input: {
  frame: AuthoritativeSceneFrame;
  read: GmRead;
}): GmRead {
  const { read } = input;
  const localObservationNeed = read.actionInterpretation.localObservationNeed ?? null;
  if (read.actionInterpretation.interactionKind !== "current_scene_observation") return read;
  if (!localObservationNeed) return read;
  if (localObservationNeed.mode !== "list_surface") return read;
  if (localObservationNeed.targetRef !== null) return read;

  if (!isBroadRouteListSurface(localObservationNeed.surfaceKinds)) return read;
  if (!hasAllowedCleanCapability(input.frame, "route_options")) return read;

  return {
    ...read,
    path: "procedural",
    actionInterpretation: {
      ...read.actionInterpretation,
      targetRefs: [],
      interactionKind: "route_inquiry",
      localObservationNeed: null,
    },
  };
}

function normalizeGmReadItemTransferShapeCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  const itemTransferNeed = actionInterpretation.itemTransferNeed;
  if (!isRecord(itemTransferNeed) || typeof itemTransferNeed.operation !== "string") return candidate;
  const expectedShape = ITEM_TRANSFER_OPERATION_SHAPE[itemTransferNeed.operation as CleanItemTransferOperation];
  if (!expectedShape) return candidate;

  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      itemTransferNeed: {
        ...itemTransferNeed,
        sourceKind: expectedShape.sourceKind,
        targetKind: expectedShape.targetKind,
      },
    },
  };
}

function normalizeGmReadUncertaintyCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const uncertainty = candidate.uncertainty;
  if (uncertainty === undefined) {
    return {
      ...candidate,
      uncertainty: {
        present: false,
        question: null,
        basis: null,
      },
    };
  }
  if (!isRecord(uncertainty) || uncertainty.present !== false) return candidate;
  return {
    ...candidate,
    uncertainty: {
      ...uncertainty,
      question: uncertainty.question ?? null,
      basis: uncertainty.basis ?? null,
    },
  };
}

function normalizeGmReadTargetRefsCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation) || Array.isArray(actionInterpretation.targetRefs)) return candidate;
  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      targetRefs: [],
    },
  };
}

function normalizeGmReadRouteInquiryCandidate(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const { candidate, frame } = input;
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  if (actionInterpretation.interactionKind !== "route_inquiry") return candidate;
  const broadRouteQuery = [
    actionInterpretation.summary,
    actionInterpretation.playerIntent,
    actionInterpretation.method,
    candidate.situationSummary,
    candidate.liveSceneQuestion,
  ].some(isBroadRouteOptionsQueryText);
  const targetRefs = Array.isArray(actionInterpretation.targetRefs) ? actionInterpretation.targetRefs : [];
  const frameAnchorRefs = new Set([
    frame.scene.currentScene.ref,
    frame.scene.currentScene.label,
    frame.scene.currentLocation.ref,
    frame.scene.currentLocation.label,
  ].map((ref) => ref.toLowerCase()));
  const routeInquiryTargetRefs = broadRouteQuery
    ? targetRefs.filter((ref) => typeof ref === "string" && frameAnchorRefs.has(ref.toLowerCase()))
    : targetRefs;
  if (actionInterpretation.localObservationNeed == null && (!broadRouteQuery || targetRefs.length === 0)) {
    return candidate;
  }
  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      targetRefs: routeInquiryTargetRefs,
      localObservationNeed: null,
    },
  };
}

function normalizeGmReadMethodCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation) || Object.hasOwn(actionInterpretation, "method")) return candidate;
  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      method: null,
    },
  };
}

function normalizeGmReadLocalObservationTargetCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  const localObservationNeed = actionInterpretation.localObservationNeed;
  if (!isRecord(localObservationNeed)) return candidate;
  if (localObservationNeed.mode === "list_surface") {
    if (
      localObservationNeed.targetRef === null
      && Array.isArray(localObservationNeed.surfaceKinds)
      && localObservationNeed.surfaceKinds.length === 1
      && localObservationNeed.surfaceKinds[0] === "visible_actor"
      && typeof localObservationNeed.queryText === "string"
      && !isGenericVisibleActorQuery(localObservationNeed.queryText)
    ) {
      return {
        ...candidate,
        actionInterpretation: {
          ...actionInterpretation,
          localObservationNeed: {
            ...localObservationNeed,
            mode: "target_match",
          },
        },
      };
    }
    if (localObservationNeed.targetRef === null) return candidate;
    return {
      ...candidate,
      actionInterpretation: {
        ...actionInterpretation,
        localObservationNeed: {
          ...localObservationNeed,
          targetRef: null,
        },
      },
    };
  }
  if (
    localObservationNeed.mode === "target_match"
    && localObservationNeed.targetRef === null
    && Array.isArray(localObservationNeed.surfaceKinds)
    && localObservationNeed.surfaceKinds.length === 1
    && localObservationNeed.surfaceKinds[0] === "visible_actor"
    && typeof localObservationNeed.queryText === "string"
    && isGenericVisibleActorQuery(localObservationNeed.queryText)
  ) {
    return {
      ...candidate,
      actionInterpretation: {
        ...actionInterpretation,
        localObservationNeed: {
          ...localObservationNeed,
          mode: "list_surface",
        },
      },
    };
  }
  if (Object.hasOwn(localObservationNeed, "targetRef")) return candidate;
  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      localObservationNeed: {
        ...localObservationNeed,
        targetRef: null,
      },
    },
  };
}

function normalizeGmReadLocalObservationListQueryCandidate(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const { candidate } = input;
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  const localObservationNeed = actionInterpretation.localObservationNeed;
  if (!isRecord(localObservationNeed)) return candidate;
  if (localObservationNeed.mode !== "list_surface") return candidate;
  if (Object.hasOwn(localObservationNeed, "queryText")) return candidate;

  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      localObservationNeed: {
        ...localObservationNeed,
        queryText: input.frame.playerAction,
      },
    },
  };
}

function normalizeGmReadPlayerConditionObservationDriftCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  if (actionInterpretation.interactionKind !== "player_local_condition") return candidate;
  if (!isRecord(actionInterpretation.localConditionNeed)) return candidate;
  if (actionInterpretation.localObservationNeed == null) return candidate;
  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      localObservationNeed: null,
    },
  };
}

function normalizeGmReadStrayLocalConditionKindCandidate(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const { candidate } = input;
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  if (!isRecord(actionInterpretation.localConditionNeed)) return candidate;
  if (
    actionInterpretation.interactionKind === "player_local_condition"
    || actionInterpretation.interactionKind === "visible_actor_dialogue"
  ) {
    return candidate;
  }
  const competingPayloadKeys = [
    "supportActorNeed",
    "itemTransferNeed",
    "minorPoiNeed",
    "timePassageNeed",
    "localObservationNeed",
    "deviceObservationNeed",
  ];
  if (competingPayloadKeys.some((key) => actionInterpretation[key] != null)) return candidate;

  const movementOptionRefs = new Set(input.frame.movementOptions.map((option) => option.ref.toLowerCase()));
  const targetRefs = Array.isArray(actionInterpretation.targetRefs) ? actionInterpretation.targetRefs : [];
  const targetsMovementOption = targetRefs.some((ref) =>
    typeof ref === "string" && movementOptionRefs.has(ref.toLowerCase())
  );
  if (targetsMovementOption) return candidate;

  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      interactionKind: "player_local_condition",
    },
  };
}

function normalizeGmReadStraySceneBeatKindCandidate(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const { candidate } = input;
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  if (!isRecord(actionInterpretation.sceneBeatNeed)) return candidate;
  if (actionInterpretation.interactionKind === "scene_local_beat") return candidate;
  const competingPayloadKeys = [
    "supportActorNeed",
    "itemTransferNeed",
    "minorPoiNeed",
    "timePassageNeed",
    "localConditionNeed",
    "localObservationNeed",
    "deviceObservationNeed",
  ];
  if (competingPayloadKeys.some((key) => actionInterpretation[key] != null)) return candidate;

  const movementOptionRefs = new Set(input.frame.movementOptions.map((option) => option.ref.toLowerCase()));
  const targetRefs = Array.isArray(actionInterpretation.targetRefs) ? actionInterpretation.targetRefs : [];
  const targetsMovementOption = targetRefs.some((ref) =>
    typeof ref === "string" && movementOptionRefs.has(ref.toLowerCase())
  );
  if (targetsMovementOption) return candidate;

  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      interactionKind: "scene_local_beat",
    },
  };
}

function normalizeGmReadUnsupportedGiveToVisibleActorNeedCandidate(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const { candidate, frame } = input;
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  const itemTransferNeed = actionInterpretation.itemTransferNeed;
  if (!isRecord(itemTransferNeed)) return candidate;
  if (itemTransferNeed.operation !== "give_to_visible_actor") return candidate;
  if (giveToVisibleActorAdmissionCue(frame)) return candidate;

  const targetRef = typeof itemTransferNeed.targetRef === "string" ? itemTransferNeed.targetRef : null;
  const targetActorRef = targetRef && frame.actors.some((actor) => actor.ref.toLowerCase() === targetRef.toLowerCase())
    ? targetRef
    : null;

  if (actionInterpretation.interactionKind === "visible_actor_dialogue") {
    return {
      ...candidate,
      actionInterpretation: {
        ...actionInterpretation,
        targetRefs: targetActorRef ? [targetActorRef] : actionInterpretation.targetRefs,
        itemTransferNeed: undefined,
      },
    };
  }

  if (
    actionInterpretation.interactionKind === "item_transfer"
    && targetActorRef
    && playerActionHasDialogueCueToVisibleActor(frame, targetActorRef)
  ) {
    return {
      ...candidate,
      actionInterpretation: {
        ...actionInterpretation,
        interactionKind: "visible_actor_dialogue",
        targetRefs: [targetActorRef],
        itemTransferNeed: undefined,
      },
    };
  }

  return candidate;
}

function normalizeGmReadCompoundLocalConditionClarificationCandidate(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const { candidate, frame } = input;
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  if (actionInterpretation.interactionKind !== "player_local_condition") return candidate;
  const localConditionNeed = actionInterpretation.localConditionNeed;
  if (!isRecord(localConditionNeed)) return candidate;
  if (localConditionNeed.conditionKey === "gripping_held_item") return candidate;

  const readinessCue = carriedItemReadinessCue(frame);
  if (!readinessCue) return candidate;

  const conditionText = typeof localConditionNeed.conditionKey === "string"
    ? localConditionNeed.conditionKey
    : "the posture";
  return {
    ...candidate,
    path: "clarification",
    liveSceneQuestion: `Which posture/readiness should apply first: ${conditionText} or keeping ${readinessCue.itemLabel} ready?`,
    actionInterpretation: {
      ...actionInterpretation,
      summary: "The player asked for more than one current-scene posture/readiness commitment.",
      playerIntent: `Clarify whether to apply ${conditionText} or keep ${readinessCue.itemLabel} ready first.`,
      targetRefs: Array.isArray(actionInterpretation.targetRefs) ? actionInterpretation.targetRefs : [],
      interactionKind: "unsupported_or_unclear",
      localConditionNeed: undefined,
    },
  };
}

function normalizeGmReadItemTransferSameItemConditionCandidate(candidate: unknown): unknown {
  if (!isRecord(candidate)) return candidate;
  const actionInterpretation = candidate.actionInterpretation;
  if (!isRecord(actionInterpretation)) return candidate;
  const itemTransferNeed = actionInterpretation.itemTransferNeed;
  const localConditionNeed = actionInterpretation.localConditionNeed;
  if (!isRecord(itemTransferNeed) || !isRecord(localConditionNeed)) return candidate;
  if (
    actionInterpretation.interactionKind !== "item_transfer"
    && actionInterpretation.interactionKind !== "visible_actor_dialogue"
  ) {
    return candidate;
  }
  if (localConditionNeed.targetKind !== "inventory_item_readiness") return candidate;
  const itemRef = typeof itemTransferNeed.itemRef === "string" ? itemTransferNeed.itemRef.toLowerCase() : null;
  const conditionTargetRef = typeof localConditionNeed.targetRef === "string"
    ? localConditionNeed.targetRef.toLowerCase()
    : null;
  if (!itemRef || !conditionTargetRef || itemRef !== conditionTargetRef) return candidate;

  return {
    ...candidate,
    actionInterpretation: {
      ...actionInterpretation,
      localConditionNeed: undefined,
    },
  };
}

function normalizeGmReadCandidateForValidation(input: {
  candidate: unknown;
  frame: AuthoritativeSceneFrame;
}): unknown {
  const normalizedUncertainty = normalizeGmReadUncertaintyCandidate(input.candidate);
  const normalizedMethod = normalizeGmReadMethodCandidate(normalizedUncertainty);
  const normalizedTargetRefs = normalizeGmReadTargetRefsCandidate(normalizedMethod);
  const normalizedRouteInquiry = normalizeGmReadRouteInquiryCandidate({
    candidate: normalizedTargetRefs,
    frame: input.frame,
  });
  const normalizedLocalObservation = normalizeGmReadLocalObservationTargetCandidate(normalizedRouteInquiry);
  const normalizedLocalObservationQuery = normalizeGmReadLocalObservationListQueryCandidate({
    candidate: normalizedLocalObservation,
    frame: input.frame,
  });
  const normalizedConditionObservationDrift =
    normalizeGmReadPlayerConditionObservationDriftCandidate(normalizedLocalObservationQuery);
  const normalizedStrayLocalCondition = normalizeGmReadStrayLocalConditionKindCandidate({
    candidate: normalizedConditionObservationDrift,
    frame: input.frame,
  });
  const normalizedStraySceneBeat = normalizeGmReadStraySceneBeatKindCandidate({
    candidate: normalizedStrayLocalCondition,
    frame: input.frame,
  });
  const normalizedUnsupportedGiveToActor = normalizeGmReadUnsupportedGiveToVisibleActorNeedCandidate({
    candidate: normalizedStraySceneBeat,
    frame: input.frame,
  });
  const normalizedSameItemTransferCondition =
    normalizeGmReadItemTransferSameItemConditionCandidate(normalizedUnsupportedGiveToActor);
  const normalizedCompoundConditionClarification = normalizeGmReadCompoundLocalConditionClarificationCandidate({
    candidate: normalizedSameItemTransferCondition,
    frame: input.frame,
  });
  const normalizedTransfer = normalizeGmReadItemTransferShapeCandidate(normalizedCompoundConditionClarification);
  if (!isRecord(normalizedTransfer) || normalizedTransfer.liveSceneQuestion !== null) return normalizedTransfer;
  return {
    ...normalizedTransfer,
    liveSceneQuestion: DEFAULT_GM_READ_LIVE_SCENE_QUESTION,
  };
}

function zodIssue(issue: z.core.$ZodIssue): GmReadValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.join(".") || "<root>",
    message: issue.message,
  };
}

function collectExecutionPayloadIssues(value: unknown): GmReadValidationIssue[] {
  const issues: GmReadValidationIssue[] = [];

  function visit(node: unknown, path: string): void {
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;

    for (const [key, child] of Object.entries(node)) {
      const childPath = path ? `${path}.${key}` : key;
      const normalized = normalizedKey(key);
      if (FORBIDDEN_EXECUTION_KEYS.has(key) || NORMALIZED_FORBIDDEN_EXECUTION_KEYS.has(normalized)) {
        issues.push({
          code: "execution_payload",
          path: childPath,
          message: "GM Read cannot carry executable, admission, mutation, receipt, Oracle, or narration payload fields.",
        });
      }
      visit(child, childPath);
    }
  }

  visit(value, "");
  return issues;
}

function collectPrivateTermIssues(value: unknown, terms: readonly string[]): GmReadValidationIssue[] {
  const loweredTerms = uniqueStrings(terms)
    .map((term) => term.toLowerCase())
    .filter((term) => term.length > 0);
  if (loweredTerms.length === 0) return [];

  const issues: GmReadValidationIssue[] = [];

  function visit(node: unknown, path: string): void {
    if (typeof node === "string") {
      const lowered = node.toLowerCase();
      if (loweredTerms.some((term) => lowered.includes(term))) {
        issues.push({
          code: "private_term",
          path: path || "<root>",
          message: "GM Read public fields cannot leak private frame guard terms.",
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => visit(item, `${path}[${index}]`));
      return;
    }
    if (!isRecord(node)) return;
    for (const [key, child] of Object.entries(node)) {
      visit(child, path ? `${path}.${key}` : key);
    }
  }

  visit(value, "");
  return issues;
}

function refValidationIssues(read: GmRead, frame: AuthoritativeSceneFrame): GmReadValidationIssue[] {
  const legalRefs = new Set(frame.citableRefs.map((ref) => ref.trim().toLowerCase()));
  const refs = uniqueStrings([
    ...read.focalRefs,
    ...read.evidenceRefs,
    ...read.actionInterpretation.targetRefs,
    ...(read.actionInterpretation.supportActorNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.localConditionNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.localConditionNeed?.targetRef
      ? [read.actionInterpretation.localConditionNeed.targetRef]
      : []),
    ...(read.actionInterpretation.itemTransferNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.itemTransferNeed
      ? [read.actionInterpretation.itemTransferNeed.itemRef, read.actionInterpretation.itemTransferNeed.targetRef]
      : []),
    ...(read.actionInterpretation.minorPoiNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.minorPoiNeed?.anchorRef
      ? [read.actionInterpretation.minorPoiNeed.anchorRef]
      : []),
    ...(read.actionInterpretation.timePassageNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.localObservationNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.localObservationNeed?.targetRef
      ? [read.actionInterpretation.localObservationNeed.targetRef]
      : []),
    ...(read.actionInterpretation.deviceObservationNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.deviceObservationNeed?.deviceRef
      ? [read.actionInterpretation.deviceObservationNeed.deviceRef]
      : []),
  ]);
  const issues: GmReadValidationIssue[] = [];

  for (const ref of refs) {
    if (!legalRefs.has(ref.toLowerCase())) {
      issues.push({
        code: "uncited_ref",
        path: "refs",
        message: `GM Read cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (UUID_LIKE_REF.test(ref) || BACKEND_REF_PREFIX.test(ref)) {
      issues.push({
        code: "backend_ref",
        path: "refs",
        message: `GM Read cited backend-only ref "${ref}" instead of a model-safe citable ref.`,
      });
    }
  }

  return issues;
}

function frameMismatchIssues(read: GmRead, frame: AuthoritativeSceneFrame): GmReadValidationIssue[] {
  const issues: GmReadValidationIssue[] = [];
  if (read.frameId !== frame.frameId) {
    issues.push({
      code: "frame_mismatch",
      path: "frameId",
      message: "GM Read frameId must match the current SceneFrame.",
    });
  }
  if (read.turnId !== frame.turnId) {
    issues.push({
      code: "frame_mismatch",
      path: "turnId",
      message: "GM Read turnId must match the current SceneFrame.",
    });
  }
  return issues;
}

function closeGmReadRuntimeMetadata(read: GmRead, frame: AuthoritativeSceneFrame): GmRead {
  if (read.frameId === frame.frameId && read.turnId === frame.turnId) {
    return read;
  }
  return {
    ...read,
    frameId: frame.frameId,
    turnId: frame.turnId,
  };
}

interface GiveToVisibleActorAdmissionCue {
  itemRef: string;
  itemLabel: string;
  actorRef: string;
  actorLabel: string;
  sceneRef: string;
  evidenceRefs: string[];
}

interface ReceiveFromVisibleActorAdmissionCue {
  itemRef: string;
  itemLabel: string;
  actorRef: string;
  actorLabel: string;
  sceneRef: string;
  evidenceRefs: string[];
}

function asciiWordTokens(text: string): string[] {
  const tokens: string[] = [];
  let current = "";
  for (const char of text.toLowerCase()) {
    const code = char.charCodeAt(0);
    const isDigit = code >= 48 && code <= 57;
    const isLowerAsciiLetter = code >= 97 && code <= 122;
    if (isDigit || isLowerAsciiLetter) {
      current += char;
      continue;
    }
    if (current) {
      tokens.push(current);
      current = "";
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

function containsTokenSequence(tokens: string[], sequence: string[]): boolean {
  if (sequence.length === 0 || sequence.length > tokens.length) return false;
  for (let index = 0; index <= tokens.length - sequence.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (tokens[index + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) return true;
  }
  return false;
}

function tokenSequenceRanges(tokens: string[], sequence: string[]): { start: number; end: number }[] {
  if (sequence.length === 0 || sequence.length > tokens.length) return [];
  const ranges: { start: number; end: number }[] = [];
  for (let index = 0; index <= tokens.length - sequence.length; index += 1) {
    let matches = true;
    for (let offset = 0; offset < sequence.length; offset += 1) {
      if (tokens[index + offset] !== sequence[offset]) {
        matches = false;
        break;
      }
    }
    if (matches) ranges.push({ start: index, end: index + sequence.length });
  }
  return ranges;
}

function surfaceMentionRanges(tokens: string[], ref: string, label: string): { start: number; end: number }[] {
  const seen = new Set<string>();
  const ranges: { start: number; end: number }[] = [];
  for (const surfaceText of [ref, label]) {
    const surfaceTokens = asciiWordTokens(surfaceText);
    const key = surfaceTokens.join("\u0000");
    if (surfaceTokens.length === 0 || seen.has(key)) continue;
    seen.add(key);
    ranges.push(...tokenSequenceRanges(tokens, surfaceTokens));
  }
  return ranges;
}

function actionMentionsSurface(tokens: string[], ref: string, label: string): boolean {
  return [ref, label].some((surfaceText) => containsTokenSequence(tokens, asciiWordTokens(surfaceText)));
}

function actionMentionsSurfaceLoosely(tokens: string[], surfaceText: string): boolean {
  const surfaceTokens = asciiWordTokens(surfaceText);
  if (surfaceTokens.length === 0) return false;
  if (containsTokenSequence(tokens, surfaceTokens)) return true;
  for (let index = 0; index < surfaceTokens.length - 1; index += 1) {
    if (containsTokenSequence(tokens, surfaceTokens.slice(index, index + 2))) return true;
  }
  return surfaceTokens.some((token) => token.length >= 6 && tokens.includes(token));
}

function carriedItemReadinessCue(frame: AuthoritativeSceneFrame): { itemLabel: string } | null {
  const actionTokens = asciiWordTokens(frame.playerAction);
  if (!actionTokens.some((token) => CARRIED_ITEM_READINESS_WORDS.has(token))) return null;
  const matchingItems = frame.inventory.filter((item) =>
    [item.ref, item.label].some((surfaceText) => actionMentionsSurfaceLoosely(actionTokens, surfaceText))
  );
  if (matchingItems.length === 1) return { itemLabel: matchingItems[0].label };
  if (matchingItems.length > 1) return { itemLabel: "a carried item" };
  return null;
}

function hasFirstPersonGiveToVisibleActorCue(tokens: string[]): boolean {
  return firstPersonGiveCueIndexes(tokens).length > 0;
}

function firstPersonGiveCueIndexes(tokens: string[]): number[] {
  if (tokens.length === 0) return [];
  if (FIRST_PERSON_GIVE_TO_VISIBLE_ACTOR_WORDS.has(tokens[0])) return [0];
  for (let startIndex = 0; startIndex < tokens.length - 1; startIndex += 1) {
    if (tokens[startIndex] !== "i") continue;
    const previous = startIndex > 0 ? tokens[startIndex - 1] : null;
    if (previous && FIRST_PERSON_GIVE_CONDITIONAL_PREFIX_WORDS.has(previous)) continue;
    const maxCueIndex = Math.min(tokens.length - 1, startIndex + 4);
    for (let index = startIndex + 1; index <= maxCueIndex; index += 1) {
      const token = tokens[index]!;
      if (FIRST_PERSON_GIVE_TO_VISIBLE_ACTOR_WORDS.has(token)) return [index];
      if (!FIRST_PERSON_GIVE_CUE_PREFIX_WORDS.has(token)) break;
    }
  }
  return [];
}

function receiveFromVisibleActorCueIndexes(tokens: string[]): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (RECEIVE_FROM_VISIBLE_ACTOR_WORDS.has(tokens[index]!)) indexes.push(index);
  }
  return indexes;
}

function hasHandoffLinkBetween(tokens: string[], start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    if (GIVE_TO_VISIBLE_ACTOR_LINK_WORDS.has(tokens[index])) return true;
  }
  return false;
}

function hasOnlyDirectObjectBridgeWords(tokens: string[], start: number, end: number): boolean {
  for (let index = start; index < end; index += 1) {
    if (!GIVE_TO_VISIBLE_ACTOR_DIRECT_OBJECT_BRIDGE_WORDS.has(tokens[index])) return false;
  }
  return true;
}

function hasPlayerDirectedReceiveTail(tokens: string[], start: number): boolean {
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "me" || token === "my" || token === "mine" || token === "player") return true;
  }
  return false;
}

function playerActionHasDialogueCueToVisibleActor(frame: AuthoritativeSceneFrame, actorRef: string): boolean {
  const actionTokens = asciiWordTokens(frame.playerAction);
  if (!actionTokens.some((token) => VISIBLE_ACTOR_DIALOGUE_WORDS.has(token))) return false;
  const actor = frame.actors.find((candidate) => candidate.ref.toLowerCase() === actorRef.toLowerCase());
  return actor ? actionMentionsSurface(actionTokens, actor.ref, actor.label) : false;
}

function giveToVisibleActorAdmissionCue(frame: AuthoritativeSceneFrame): GiveToVisibleActorAdmissionCue | null {
  const itemTransferAllowed = frame.capabilities.some((capability) => capability.capabilityId === "item_transfer" && capability.allowed);
  if (!itemTransferAllowed) return null;

  const actionTokens = asciiWordTokens(frame.playerAction);
  const cueIndexes = firstPersonGiveCueIndexes(actionTokens);
  if (cueIndexes.length === 0) return null;

  const matchingItems = frame.inventory.flatMap((item) =>
    surfaceMentionRanges(actionTokens, item.ref, item.label).map((range) => ({ item, range }))
  );
  const matchingActors = frame.actors.flatMap((actor) =>
    surfaceMentionRanges(actionTokens, actor.ref, actor.label).map((range) => ({ actor, range }))
  );
  const linkedPairs = new Map<string, {
    item: AuthoritativeSceneFrame["inventory"][number];
    actor: AuthoritativeSceneFrame["actors"][number];
  }>();
  for (const cueIndex of cueIndexes) {
    for (const itemMatch of matchingItems) {
      if (itemMatch.range.start <= cueIndex) continue;
      for (const actorMatch of matchingActors) {
        if (actorMatch.range.start <= itemMatch.range.end) continue;
        if (!hasHandoffLinkBetween(actionTokens, itemMatch.range.end, actorMatch.range.start)) continue;
        const key = `${itemMatch.item.ref.toLowerCase()}\u0000${actorMatch.actor.ref.toLowerCase()}`;
        linkedPairs.set(key, { item: itemMatch.item, actor: actorMatch.actor });
      }
    }
    for (const actorMatch of matchingActors) {
      if (actorMatch.range.start <= cueIndex) continue;
      if (!hasOnlyDirectObjectBridgeWords(actionTokens, cueIndex + 1, actorMatch.range.start)) continue;
      for (const itemMatch of matchingItems) {
        if (itemMatch.range.start <= actorMatch.range.end) continue;
        if (!hasOnlyDirectObjectBridgeWords(actionTokens, actorMatch.range.end, itemMatch.range.start)) continue;
        const key = `${itemMatch.item.ref.toLowerCase()}\u0000${actorMatch.actor.ref.toLowerCase()}`;
        linkedPairs.set(key, { item: itemMatch.item, actor: actorMatch.actor });
      }
    }
  }
  const linked = [...linkedPairs.values()];
  if (linked.length !== 1) return null;

  const { item, actor } = linked[0]!;
  return {
    itemRef: item.ref,
    itemLabel: item.label,
    actorRef: actor.ref,
    actorLabel: actor.label,
    sceneRef: frame.scene.currentScene.ref,
    evidenceRefs: Array.from(new Set(["Player", item.ref, actor.ref, frame.scene.currentScene.ref])),
  };
}

function itemTransferNeedForGiveCue(cue: GiveToVisibleActorAdmissionCue) {
  return {
    actorRef: "Player",
    operation: "give_to_visible_actor",
    itemRef: cue.itemRef,
    sourceKind: "player_inventory",
    sourceRef: null,
    targetKind: "visible_actor",
    targetRef: cue.actorRef,
    equipSlot: null,
    requestedItemText: cue.itemLabel,
    evidenceRefs: cue.evidenceRefs,
  };
}

function receiveFromVisibleActorAdmissionCue(frame: AuthoritativeSceneFrame): ReceiveFromVisibleActorAdmissionCue | null {
  const itemTransferAllowed = frame.capabilities.some((capability) => capability.capabilityId === "item_transfer" && capability.allowed);
  if (!itemTransferAllowed) return null;

  const actionTokens = asciiWordTokens(frame.playerAction);
  const cueIndexes = receiveFromVisibleActorCueIndexes(actionTokens);
  if (cueIndexes.length === 0) return null;

  const matchingItems = frame.targets
    .filter((target) => target.kind === "item")
    .flatMap((item) =>
      surfaceMentionRanges(actionTokens, item.ref, item.label).map((range) => ({ item, range }))
    );
  const matchingActors = frame.actors.flatMap((actor) =>
    surfaceMentionRanges(actionTokens, actor.ref, actor.label).map((range) => ({ actor, range }))
  );
  const linkedPairs = new Map<string, {
    item: AuthoritativeSceneFrame["targets"][number];
    actor: AuthoritativeSceneFrame["actors"][number];
  }>();
  for (const cueIndex of cueIndexes) {
    for (const actorMatch of matchingActors) {
      if (actorMatch.range.end > cueIndex) continue;
      for (const itemMatch of matchingItems) {
        if (itemMatch.range.start <= cueIndex) continue;
        if (!hasPlayerDirectedReceiveTail(actionTokens, itemMatch.range.end)) continue;
        const key = `${itemMatch.item.ref.toLowerCase()}\u0000${actorMatch.actor.ref.toLowerCase()}`;
        linkedPairs.set(key, { item: itemMatch.item, actor: actorMatch.actor });
      }
    }
  }
  const linked = [...linkedPairs.values()];
  if (linked.length !== 1) return null;

  const { item, actor } = linked[0]!;
  return {
    itemRef: item.ref,
    itemLabel: item.label,
    actorRef: actor.ref,
    actorLabel: actor.label,
    sceneRef: frame.scene.currentScene.ref,
    evidenceRefs: Array.from(new Set(["Player", item.ref, actor.ref, frame.scene.currentScene.ref])),
  };
}

function itemTransferNeedForReceiveCue(cue: ReceiveFromVisibleActorAdmissionCue) {
  return {
    actorRef: "Player",
    operation: "receive_from_visible_actor",
    itemRef: cue.itemRef,
    sourceKind: "visible_actor_item",
    sourceRef: cue.actorRef,
    targetKind: "player_inventory",
    targetRef: "Player",
    equipSlot: null,
    requestedItemText: cue.itemLabel,
    evidenceRefs: cue.evidenceRefs,
  };
}

function itemTransferRepairCard(frame: AuthoritativeSceneFrame): string {
  const giveCue = giveToVisibleActorAdmissionCue(frame);
  const receiveCue = receiveFromVisibleActorAdmissionCue(frame);
  if (!giveCue && !receiveCue) {
    return "Current-frame item_transfer admission card: no exact inventory handoff or visible-actor return cue is active for this SceneFrame.";
  }
  if (receiveCue) {
    return [
      "Current-frame item_transfer admission card:",
      `The player action asks one visible actor (${receiveCue.actorRef}) to return one visible item (${receiveCue.itemRef}) to Player.`,
      "Represent the physical item-state transition with this exact itemTransferNeed shape:",
      JSON.stringify(itemTransferNeedForReceiveCue(receiveCue), null, 2),
    ].join("\n");
  }
  const cue = giveCue!;
  return [
    "Current-frame item_transfer admission card:",
    `The player action names one Player inventory item (${cue.itemRef}) and one visible actor recipient (${cue.actorRef}).`,
    "Represent the physical item-state transition with this exact itemTransferNeed shape:",
    JSON.stringify(itemTransferNeedForGiveCue(cue), null, 2),
  ].join("\n");
}

function interactionIssues(read: GmRead, frame: AuthoritativeSceneFrame): GmReadValidationIssue[] {
  const issues: GmReadValidationIssue[] = [];
  const loweredTargets = read.actionInterpretation.targetRefs.map((ref) => ref.toLowerCase());
  const visibleActorRefs = new Set(frame.actors.map((actor) => actor.ref.toLowerCase()));
  const inventoryRefs = new Set(frame.inventory.map((item) => item.ref.toLowerCase()));
  const visibleItemRefs = new Set(frame.targets
    .filter((target) => target.kind === "item")
    .map((target) => target.ref.toLowerCase()));
  const allowedCapabilities = new Set(frame.capabilities
    .filter((capability) => capability.allowed)
    .map((capability) => capability.capabilityId));
  const movementOptionRefs = new Set(frame.movementOptions.map((option) => option.ref.toLowerCase()));
  const localConditionNeed = read.actionInterpretation.localConditionNeed ?? null;
  const itemTransferNeed = read.actionInterpretation.itemTransferNeed ?? null;
  const minorPoiNeed = read.actionInterpretation.minorPoiNeed ?? null;
  const timePassageNeed = read.actionInterpretation.timePassageNeed ?? null;
  const localObservationNeed = read.actionInterpretation.localObservationNeed ?? null;
  const deviceObservationNeed = read.actionInterpretation.deviceObservationNeed ?? null;
  const sceneRefs = new Set([
    frame.scene.currentScene.ref.toLowerCase(),
    frame.scene.currentLocation.ref.toLowerCase(),
  ]);
  const deviceSurfaceRefs = new Set((frame.deviceStatusSurfaces ?? [])
    .map((surface) => surface.deviceRef.toLowerCase()));
  const minorPoiSurface = frame.currentScenePlaceHandleSurface ?? null;
  const allowedMinorPoiKinds = new Set(minorPoiSurface?.allowedPlaceKinds ?? []);
  const giveToVisibleActorCue = giveToVisibleActorAdmissionCue(frame);
  const receiveFromVisibleActorCue = receiveFromVisibleActorAdmissionCue(frame);
  const hasInventoryToVisibleActorTargetPair =
    allowedCapabilities.has("item_transfer")
    && loweredTargets.some((target) => inventoryRefs.has(target))
    && loweredTargets.some((target) => visibleActorRefs.has(target));

  if (giveToVisibleActorCue) {
    if (
      read.actionInterpretation.interactionKind !== "item_transfer"
      && read.actionInterpretation.interactionKind !== "visible_actor_dialogue"
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.interactionKind",
        message: "A current-frame Player inventory handoff to one visible actor requires item_transfer, or visible_actor_dialogue when the action also asks the actor to speak.",
      });
    }
    if (itemTransferNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "A current-frame Player inventory handoff to one visible actor requires itemTransferNeed.",
      });
    } else if (
      itemTransferNeed.operation !== "give_to_visible_actor"
      || itemTransferNeed.itemRef.toLowerCase() !== giveToVisibleActorCue.itemRef.toLowerCase()
      || itemTransferNeed.sourceKind !== "player_inventory"
      || itemTransferNeed.targetKind !== "visible_actor"
      || itemTransferNeed.targetRef.toLowerCase() !== giveToVisibleActorCue.actorRef.toLowerCase()
      || itemTransferNeed.equipSlot !== null
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "itemTransferNeed must represent the exact current-frame inventory item handoff to the visible actor.",
      });
    }
  }

  if (
    itemTransferNeed?.operation === "give_to_visible_actor"
    && !giveToVisibleActorCue
  ) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.itemTransferNeed",
      message: "give_to_visible_actor requires an explicit first-person physical handoff cue in the player action.",
    });
  }

  if (receiveFromVisibleActorCue) {
    if (
      read.actionInterpretation.interactionKind !== "item_transfer"
      && read.actionInterpretation.interactionKind !== "visible_actor_dialogue"
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.interactionKind",
        message: "A current-frame visible actor item return to Player requires item_transfer, or visible_actor_dialogue when the same action asks the actor to speak.",
      });
    }
    if (itemTransferNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "A current-frame visible actor item return to Player requires itemTransferNeed.",
      });
    } else if (
      itemTransferNeed.operation !== "receive_from_visible_actor"
      || itemTransferNeed.itemRef.toLowerCase() !== receiveFromVisibleActorCue.itemRef.toLowerCase()
      || itemTransferNeed.sourceKind !== "visible_actor_item"
      || itemTransferNeed.sourceRef?.toLowerCase() !== receiveFromVisibleActorCue.actorRef.toLowerCase()
      || itemTransferNeed.targetKind !== "player_inventory"
      || itemTransferNeed.targetRef.toLowerCase() !== frame.player.ref.toLowerCase()
      || itemTransferNeed.equipSlot !== null
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "itemTransferNeed must represent the exact current-frame visible actor item return to Player.",
      });
    }
  }

  if (
    itemTransferNeed?.operation === "receive_from_visible_actor"
    && !receiveFromVisibleActorCue
  ) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.itemTransferNeed",
      message: "receive_from_visible_actor requires an explicit visible actor return cue to Player in the player action.",
    });
  }

  if (
    hasInventoryToVisibleActorTargetPair
    && read.actionInterpretation.interactionKind !== "item_transfer"
    && read.actionInterpretation.interactionKind !== "visible_actor_dialogue"
  ) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.interactionKind",
      message: "SceneFrame inventory item plus visible actor target refs require item_transfer, or visible_actor_dialogue when the action also asks the actor to speak.",
    });
  }

  if (read.actionInterpretation.interactionKind !== "time_passage" && timePassageNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.timePassageNeed",
      message: "timePassageNeed is allowed only for time_passage.",
    });
  }

  if (localConditionNeed) {
    const targetRef = localConditionNeed.targetRef?.toLowerCase() ?? null;
    if (localConditionNeed.targetKind === "inventory_item_readiness") {
      if (!targetRef || !inventoryRefs.has(targetRef)) {
        issues.push({
          code: "interaction_invalid",
          path: "actionInterpretation.localConditionNeed.targetRef",
          message: "inventory_item_readiness local conditions require one visible SceneFrame.inventory ref.",
        });
      }
    } else if (localConditionNeed.targetKind === "visible_actor_distance") {
      if (!targetRef || !visibleActorRefs.has(targetRef)) {
        issues.push({
          code: "interaction_invalid",
          path: "actionInterpretation.localConditionNeed.targetRef",
          message: "visible_actor_distance local conditions require one already-visible non-player actor ref.",
        });
      }
    } else if (localConditionNeed.targetKind === "current_scene") {
      const sceneRefs = new Set([
        frame.scene.currentScene.ref.toLowerCase(),
        frame.scene.currentLocation.ref.toLowerCase(),
      ]);
      if (targetRef && !sceneRefs.has(targetRef)) {
        issues.push({
          code: "interaction_invalid",
          path: "actionInterpretation.localConditionNeed.targetRef",
          message: "current_scene local conditions may target only the current scene/location ref or null.",
        });
      }
    }
    if (localConditionNeed.conditionKey === "gripping_held_item" && localConditionNeed.targetKind !== "inventory_item_readiness") {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed.targetKind",
        message: "gripping_held_item requires targetKind=inventory_item_readiness.",
      });
    }
    if (
      localConditionNeed.conditionKey !== "gripping_held_item"
      && carriedItemReadinessCue(frame)
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed.conditionKey",
        message: "A posture/readiness action that also asks to keep a carried item ready must clarify which condition applies first.",
      });
    }
  }

  if (itemTransferNeed) {
    const itemRef = itemTransferNeed.itemRef.toLowerCase();
    const targetRef = itemTransferNeed.targetRef.toLowerCase();
    const operation = itemTransferNeed.operation;
    const expectedShape = ITEM_TRANSFER_OPERATION_SHAPE[operation];
    if (
      itemTransferNeed.sourceKind !== expectedShape.sourceKind
      || itemTransferNeed.targetKind !== expectedShape.targetKind
      || itemTransferNeed.equipSlot !== expectedShape.equipSlot
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "itemTransferNeed source/target/equipSlot shape must match the bounded item transfer operation.",
      });
    }
    if (itemTransferNeed.sourceKind === "visible_actor_item") {
      const sourceRef = itemTransferNeed.sourceRef?.toLowerCase() ?? null;
      if (!sourceRef || !visibleActorRefs.has(sourceRef)) {
        issues.push({
          code: "interaction_invalid",
          path: "actionInterpretation.itemTransferNeed.sourceRef",
          message: "visible_actor_item transfers require sourceRef copied from a visible actor.",
        });
      }
    } else if (itemTransferNeed.sourceRef != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.sourceRef",
        message: "itemTransferNeed.sourceRef is allowed only for visible_actor_item transfers.",
      });
    }
    if (itemTransferNeed.sourceKind === "player_inventory" && !inventoryRefs.has(itemRef)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.itemRef",
        message: "Player inventory item transfers require one SceneFrame.inventory item ref.",
      });
    }
    if (itemTransferNeed.sourceKind === "visible_actor_item" && !visibleItemRefs.has(itemRef)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.itemRef",
        message: "Visible actor item transfers require one visible SceneFrame.targets item ref.",
      });
    }
    if (itemTransferNeed.sourceKind === "current_scene_item" && !visibleItemRefs.has(itemRef)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.itemRef",
        message: "Current-scene item pickups require one visible SceneFrame.targets item ref.",
      });
    }
    if (itemTransferNeed.targetKind === "visible_actor" && !visibleActorRefs.has(targetRef)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.targetRef",
        message: "Giving an item requires one already-visible non-player actor target ref.",
      });
    }
    if (itemTransferNeed.targetKind === "current_scene" && !sceneRefs.has(targetRef)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.targetRef",
        message: "Dropping or placing an item requires the current scene/location target ref.",
      });
    }
    if (
      ["player_inventory", "player_equipment"].includes(itemTransferNeed.targetKind)
      && targetRef !== frame.player.ref.toLowerCase()
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.targetRef",
        message: "Pickup/equip/unequip targets must use Player as the target ref.",
      });
    }
  }

  if (minorPoiNeed) {
    if (!minorPoiSurface) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "minorPoiNeed requires a current SceneFrame place-handle surface.",
      });
    } else if (!allowedMinorPoiKinds.has(minorPoiNeed.placeKind)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed.placeKind",
        message: "minorPoiNeed.placeKind must be allowed by the current SceneFrame place-handle surface.",
      });
    }
    if (!sceneRefs.has(minorPoiNeed.anchorRef.toLowerCase())) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed.anchorRef",
        message: "minorPoiNeed.anchorRef must be the current scene/location ref.",
      });
    }
  }

  if (localObservationNeed) {
    const localSurfaceRefs = new Set<string>();
    for (const surfaceKind of localObservationNeed.surfaceKinds) {
      if (surfaceKind === "current_scene") {
        localSurfaceRefs.add(frame.scene.currentScene.ref.toLowerCase());
      } else if (surfaceKind === "player_status") {
        localSurfaceRefs.add(frame.player.ref.toLowerCase());
      } else if (surfaceKind === "current_location") {
        localSurfaceRefs.add(frame.scene.currentLocation.ref.toLowerCase());
      } else if (surfaceKind === "visible_actor") {
        frame.actors
          .filter((actor) => actor.role !== "player")
          .forEach((actor) => localSurfaceRefs.add(actor.ref.toLowerCase()));
      } else if (surfaceKind === "visible_target") {
        frame.targets.forEach((target) => localSurfaceRefs.add(target.ref.toLowerCase()));
      } else if (surfaceKind === "inventory_item") {
        frame.inventory.forEach((item) => localSurfaceRefs.add(item.ref.toLowerCase()));
      } else if (surfaceKind === "visible_fact") {
        [...frame.scene.visibleFacts, ...frame.scene.recentLocalFacts]
          .forEach((fact) => localSurfaceRefs.add(fact.source.toLowerCase()));
      } else if (surfaceKind === "movement_option") {
        frame.movementOptions.forEach((option) => localSurfaceRefs.add(option.ref.toLowerCase()));
      }
    }
    if (localObservationNeed.mode === "list_surface" && localObservationNeed.targetRef !== null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed.targetRef",
        message: "list_surface local observations must not target one ref.",
      });
    }
    if (
      localObservationNeed.mode === "target_match"
      && localObservationNeed.targetRef === null
      && localObservationNeed.surfaceKinds.length === 1
      && localObservationNeed.surfaceKinds[0] === "visible_actor"
      && isGenericVisibleActorQuery(localObservationNeed.queryText)
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed.mode",
        message: "Generic visible-actor/person presence questions must use mode=list_surface with targetRef=null.",
      });
    }
    if (
      localObservationNeed.targetRef
      && !localSurfaceRefs.has(localObservationNeed.targetRef.toLowerCase())
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed.targetRef",
        message: "localObservationNeed.targetRef must be exposed by one requested current SceneFrame observation surface.",
      });
    }
  }

  if (deviceObservationNeed && !deviceSurfaceRefs.has(deviceObservationNeed.deviceRef.toLowerCase())) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.deviceObservationNeed.deviceRef",
      message: "deviceObservationNeed.deviceRef must be one exposed SceneFrame.deviceStatusSurfaces device ref.",
    });
  }

  if (read.actionInterpretation.interactionKind === "current_scene_observation") {
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "current_scene_observation must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "current_scene_observation must not include localConditionNeed.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "current_scene_observation must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "current_scene_observation must not include deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "current_scene_observation must not include minorPoiNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "time_passage") {
    if (timePassageNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.timePassageNeed",
        message: "time_passage requires timePassageNeed with explicit elapsedMinutes.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "time_passage must not include supportActorNeed.",
      });
    }
    if (
      read.actionInterpretation.localConditionNeed != null
      && read.actionInterpretation.localConditionNeed.operation !== "apply"
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed.operation",
        message: "time_passage may include only an apply localConditionNeed for maintained Player posture/readiness.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "time_passage must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "time_passage must not include minorPoiNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "time_passage must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "time_passage must not include deviceObservationNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "device_status_observation") {
    if (read.actionInterpretation.deviceObservationNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "device_status_observation requires deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "device_status_observation must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "device_status_observation must not include localConditionNeed.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "device_status_observation must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "device_status_observation must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "device_status_observation must not include minorPoiNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "route_inquiry") {
    const invalidTargets = loweredTargets.filter((target) =>
      !movementOptionRefs.has(target) && !sceneRefs.has(target)
    );
    if (invalidTargets.length > 0) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
        message: "route_inquiry targetRefs must cite visible SceneFrame.movementOptions, current scene/location refs, or stay empty for broad route-option questions.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "route_inquiry must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "route_inquiry must not include localConditionNeed.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "route_inquiry must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "route_inquiry must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "route_inquiry must not include deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "route_inquiry must not include minorPoiNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "movement_intent") {
    const movementTargets = loweredTargets.filter((target) => movementOptionRefs.has(target));
    if (movementTargets.length !== 1 || loweredTargets.length !== 1) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
        message: "movement_intent requires exactly one targetRef copied from SceneFrame.movementOptions.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "movement_intent must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "movement_intent must not include localConditionNeed.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "movement_intent must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "movement_intent must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "movement_intent must not include deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "movement_intent must not include minorPoiNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "visible_actor_dialogue") {
    const speakerTargets = frame.actors.filter((actor) =>
      actor.role !== "player" && loweredTargets.includes(actor.ref.toLowerCase())
    );
    if (speakerTargets.length !== 1) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
        message: "visible_actor_dialogue requires exactly one already-visible non-player speaker ref from SceneFrame.actors.",
      });
    }
    if (loweredTargets.includes(frame.player.ref.toLowerCase())) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
        message: "visible_actor_dialogue speaker target must not be Player.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "visible_actor_dialogue must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "visible_actor_dialogue must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "visible_actor_dialogue must not include deviceObservationNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "player_local_condition") {
    if (read.actionInterpretation.localConditionNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "player_local_condition requires localConditionNeed.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "player_local_condition must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "player_local_condition must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "player_local_condition must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "player_local_condition must not include deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "player_local_condition must not include minorPoiNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "item_transfer") {
    if (read.actionInterpretation.itemTransferNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "item_transfer requires itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "item_transfer must not include supportActorNeed.",
      });
    }
    if (
      read.actionInterpretation.localConditionNeed != null
      && read.actionInterpretation.localConditionNeed.operation !== "apply"
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed.operation",
        message: "item_transfer may include only an apply localConditionNeed for a separate maintained Player posture/readiness.",
      });
    }
    if (
      read.actionInterpretation.itemTransferNeed
      && read.actionInterpretation.localConditionNeed?.targetRef
      && read.actionInterpretation.localConditionNeed.targetRef.toLowerCase()
        === read.actionInterpretation.itemTransferNeed.itemRef.toLowerCase()
    ) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed.targetRef",
        message: "item_transfer localConditionNeed must not target the item whose custody/location/equip state is changing.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "item_transfer must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "item_transfer must not include deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "item_transfer must not include minorPoiNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "minor_poi_create") {
    if (read.actionInterpretation.minorPoiNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "minor_poi_create requires minorPoiNeed.",
      });
    }
    if (read.actionInterpretation.supportActorNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "minor_poi_create must not include supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "minor_poi_create must not include localConditionNeed.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "minor_poi_create must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "minor_poi_create must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "minor_poi_create must not include deviceObservationNeed.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.interactionKind === "ordinary_support_actor_needed") {
    if (read.actionInterpretation.supportActorNeed == null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.supportActorNeed",
        message: "ordinary_support_actor_needed requires supportActorNeed.",
      });
    }
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "ordinary_support_actor_needed must not include localConditionNeed in P68.",
      });
    }
    if (read.actionInterpretation.itemTransferNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed",
        message: "ordinary_support_actor_needed must not include itemTransferNeed.",
      });
    }
    if (read.actionInterpretation.localObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localObservationNeed",
        message: "ordinary_support_actor_needed must not include localObservationNeed.",
      });
    }
    if (read.actionInterpretation.deviceObservationNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.deviceObservationNeed",
        message: "ordinary_support_actor_needed must not include deviceObservationNeed.",
      });
    }
    if (read.actionInterpretation.minorPoiNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.minorPoiNeed",
        message: "ordinary_support_actor_needed must not include minorPoiNeed.",
      });
    }
    const targetedVisibleActors = loweredTargets.filter((target) => visibleActorRefs.has(target));
    if (targetedVisibleActors.length > 0) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
        message: "ordinary_support_actor_needed must not target already-visible actors; use visible_actor_dialogue for visible speakers.",
      });
    }
    return issues;
  }

  if (read.actionInterpretation.supportActorNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.supportActorNeed",
      message: "supportActorNeed is allowed only for ordinary_support_actor_needed.",
    });
  }
  if (read.actionInterpretation.localConditionNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.localConditionNeed",
      message: "localConditionNeed is allowed only for player_local_condition, time_passage, or visible_actor_dialogue compound actions.",
    });
  }
  if (read.actionInterpretation.itemTransferNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.itemTransferNeed",
      message: "itemTransferNeed is allowed only for item_transfer or visible_actor_dialogue compound actions.",
    });
  }
  if (read.actionInterpretation.localObservationNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.localObservationNeed",
      message: "localObservationNeed is allowed only for current_scene_observation.",
    });
  }
  if (read.actionInterpretation.deviceObservationNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.deviceObservationNeed",
      message: "deviceObservationNeed is allowed only for device_status_observation.",
    });
  }
  if (read.actionInterpretation.minorPoiNeed != null) {
    issues.push({
      code: "interaction_invalid",
      path: "actionInterpretation.minorPoiNeed",
      message: "minorPoiNeed is allowed only for minor_poi_create or visible_actor_dialogue compound actions.",
    });
  }
  return issues;
}

export function validateGmReadCandidate(input: {
  frame: AuthoritativeSceneFrame;
  candidate: unknown;
}): { status: "accepted"; read: GmRead; issues: [] } | {
  status: "rejected";
  issues: GmReadValidationIssue[];
} {
  const privateTerms = [
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ];
  const issues = [
    ...collectExecutionPayloadIssues(input.candidate),
    ...collectPrivateTermIssues(input.candidate, privateTerms),
  ];

  const candidateForValidation = normalizeGmReadCandidateForValidation({
    candidate: input.candidate,
    frame: input.frame,
  });
  const parsed = gmReadSchema.safeParse(candidateForValidation);
  let parsedRead: GmRead | null = null;
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(zodIssue));
  } else {
    parsedRead = normalizeGmReadRouteListObservation({
      frame: input.frame,
      read: closeGmReadRuntimeMetadata(parsed.data, input.frame),
    });
    parsedRead = normalizeGmReadBroadSceneOverviewObservation({
      frame: input.frame,
      read: parsedRead,
    });
    parsedRead = normalizeGmReadDeviceNoSurfaceAdmission({
      frame: input.frame,
      read: parsedRead,
    });
    issues.push(...frameMismatchIssues(parsedRead, input.frame));
    issues.push(...refValidationIssues(parsedRead, input.frame));
    issues.push(...interactionIssues(parsedRead, input.frame));
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  if (!parsedRead) {
    return {
      status: "rejected",
      issues: [{
        code: "schema_invalid",
        path: "<root>",
        message: "GM Read candidate did not parse.",
      }],
    };
  }
  return { status: "accepted", read: parsedRead, issues: [] };
}

function promptFrame(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    turnId: frame.turnId,
    base: frame.base,
    playerAction: frame.playerAction,
    player: {
      ref: frame.player.ref,
      label: frame.player.label,
      visibleStatus: frame.player.visibleStatus,
    },
    scene: frame.scene,
    actors: frame.actors.map((actor) => ({
      ref: actor.ref,
      label: actor.label,
      role: actor.role,
      visibleStatus: actor.visibleStatus,
    })),
    movementOptions: frame.movementOptions,
    targets: frame.targets,
    inventory: frame.inventory.map((item) => ({
      ref: item.ref,
      label: item.label,
      equipState: item.equipState,
    })),
    deviceStatusSurfaces: frame.deviceStatusSurfaces ?? [],
    currentScenePlaceHandleSurface: frame.currentScenePlaceHandleSurface ?? null,
    capabilities: frame.capabilities,
    citableRefs: frame.citableRefs,
    forecast: {
      version: frame.forecast.version,
      advisoryOnly: frame.forecast.advisoryOnly,
      sourceStatus: frame.forecast.sourceStatus,
      mayAuthorizeMutation: frame.forecast.mayAuthorizeMutation,
      maySupportNarrationClaim: frame.forecast.maySupportNarrationClaim,
      entries: frame.forecast.entries.map((entry) => ({
        ref: entry.ref,
        horizonTicks: entry.horizonTicks,
        pressure: entry.pressure,
        confidence: entry.confidence,
        localRelevanceRefs: entry.localRelevanceRefs,
      })),
    },
    privateGuardSummary: {
      forbiddenActorLabelCount: frame.privateGuards.forbiddenActorLabels.length,
      forbiddenPrivateTermCount:
        frame.privateGuards.forbiddenPrivateTerms.length + frame.forecast.forbiddenPrivateTerms.length,
    },
  };
}

export function buildGmReadSystemPrompt(): string {
  return [
    "You are the clean WorldForge GM Read interpreter.",
    "Return only a JSON object matching gm-read.v1.",
    "GM Read is interpretation only. It must not narrate, mutate state, call tools, request an Oracle, create checklist steps, emit receipts, or decide physical possibility.",
    "Keep situationSummary, liveSceneQuestion, and interpretationRationale concise enough for the gm-read.v1 field limits.",
    "Allowed path values: direct, continue, clarification, uncertain, procedural, combat_pressure.",
    "Path is a coarse interpretation signal only. procedural does not authorize a tool or effect. uncertain does not authorize an Oracle roll.",
    "Set actionInterpretation.interactionKind to exactly one of: current_scene_observation, route_inquiry, movement_intent, time_passage, scene_local_beat, visible_actor_dialogue, device_status_observation, ordinary_support_actor_needed, player_local_condition, item_transfer, minor_poi_create, unsupported_or_unclear.",
    "Use route_inquiry when the player asks whether a visible route/path/destination is open, legal, safe, reachable, connected, available, where it leads, or asks to list/show current routes/exits/options, including wording like without moving / do not go yet.",
    "route_inquiry targetRefs must cite SceneFrame.movementOptions when the question targets one exposed route, cite current scene/location refs for broad current-scene route questions, or stay empty. If the player names a destination that is not an exposed movementOptions ref/label, keep that name only in playerIntent, method, or liveSceneQuestion.",
    "When the player asks Do I see / can I see / is there any physical access fixture such as a stair, ladder, lift, doorway, hatch, gate, rope, bridge, passage mouth, or barricade opening in the current scene, use current_scene_observation with localObservationNeed over current_scene and visible_target surfaces unless the player names an exact SceneFrame.movementOptions label.",
    "Use movement_intent only when the player asks to physically go, move, travel, enter, leave, follow, take a route, step through, head to, walk back to, return to, or otherwise change current scene/location.",
    "movement_intent requires exactly one targetRef copied from SceneFrame.movementOptions. If the destination is not an exposed movement option, use clarification or unsupported_or_unclear.",
    "When a player gives social color to a visible actor and also explicitly takes an exposed route or moves to an exposed destination, the route movement owns the turn. Put the destination movement option in targetRefs and do not choose visible_actor_dialogue unless the player requests a spoken answer or reaction before movement.",
    "Use time_passage when the player waits, rests, pauses, watches, stands by, or otherwise lets time pass in the current scene without movement, item custody/equip change, dialogue, support actor creation, observation result, or other primary action. Fill timePassageNeed with actorRef=Player, elapsedMinutes, reasonKind, requestedDurationText, and citable evidenceRefs.",
    "For time_passage, copy an explicit requested duration exactly into timePassageNeed.elapsedMinutes when the action gives minutes. For vague brief waits such as a few minutes, set elapsedMinutes=5 and requestedDurationText to the vague duration phrase.",
    "If the player waits while explicitly maintaining a current-scene Player posture/readiness commitment, keep interactionKind=time_passage and fill localConditionNeed for that bounded maintained posture/readiness. This compound does not authorize item custody/equip changes, NPC actions, observations, route truth, or world facts.",
    "Use visible_actor_dialogue only when the player addresses exactly one already-visible non-player actor from SceneFrame.actors as the speaker. Put that speaker ref in actionInterpretation.targetRefs.",
    "Naming a visible actor as an item-transfer recipient is not visible_actor_dialogue by itself. Use visible_actor_dialogue only when the action includes communicative speech content such as asking, telling, saying, answering, greeting, threatening, bargaining, or requesting a spoken response.",
    "If the player also makes a current-scene Player posture/readiness commitment while addressing a visible actor, keep interactionKind=visible_actor_dialogue and fill localConditionNeed for that bounded posture/readiness part.",
    "Use ordinary_support_actor_needed only when the player needs one ordinary local current-scene role absent from SceneFrame.actors, with roleKind in the schema and supportActorNeed filled. Do not target an invented actor ref.",
    "ordinary_support_actor_needed may cover ordinary local roles like vendor, guard, clerk, dockhand, guide, porter, witness, helper, laborer, courier, attendant, bystander, or crowd voice. It does not authorize dialogue content.",
    "If the action says to call over, hail, flag down, get, find, or ask a local ordinary role absent from SceneFrame.actors, use ordinary_support_actor_needed. If the same action includes speech, a request, or wording like keep an eye on / watch a current-scene target, set supportActorNeed.intendedUse=dialogue_requested_but_not_yet_recorded and copy the concrete request into supportActorNeed.dialogueRequestText.",
    "For ordinary_support_actor_needed presence-only turns, omit supportActorNeed.dialogueRequestText or set it to null. For dependent dialogue turns, dialogueRequestText is the support actor's immediate response task, for example stand where I can see you, watch the small tea stall, or answer what changed today.",
    "Do not use ordinary_support_actor_needed for named people, key NPCs, faction leaders, secret contacts, remote actors, persistent actors, hidden actors, family members, campaign-critical roles, or broad world creation; use clarification or unsupported_or_unclear instead.",
    "Use player_local_condition only for uncontested first-person current-scene Player posture/readiness such as kneeling, crouched, prone, taking_cover as posture only, keeping_distance, stepped_back, braced, hands_visible, hands_raised, or gripping_held_item for an already-inventory item.",
    "For phrases like keeping low while moving through the current passage, choose player_local_condition with conditionKey=crouched when no exact SceneFrame.movementOptions destination is named.",
    "player_local_condition owns exactly one conditionKey. If the player asks for two independent posture/readiness conditions in one action, such as stepping back and keeping hands visible, or crouching while holding a carried item high/dry/ready, use path=clarification with interactionKind=unsupported_or_unclear and ask which condition to apply first in natural player-facing wording, for example step back or keep your hands visible. If the body posture is an immediate ordinary prop/fixture beat such as leaning on a crate or ducking behind a counter while keeping an already-inventory item close, use scene_local_beat and keep the whole visible beat in sceneBeatNeed.requestedBeatText.",
    "Use current_scene_observation with localObservationNeed surfaceKinds=[\"player_status\"] when the player only asks to check their own obvious injury, strain, pain, fatigue, visible condition, or how they are holding up without declaring a posture/readiness change.",
    "localConditionNeed does not authorize HP, damage, healing, injuries, combat status, NPC conditions, stealth success, cover effectiveness, movement, item custody/location/equip changes, tags, discovery, world facts, relationship, absence, no-change, or dialogue content.",
    "For gripping_held_item, localConditionNeed.targetKind must be inventory_item_readiness and targetRef must be copied from SceneFrame.inventory; requestedPostureText must preserve consequential handling such as hold Courier satchel high above water, without adding item custody/location/equip-state change.",
    "Keeping an already-inventory item high, in hand, dry, protected, or ready never uses itemTransferNeed unless the player also asks to give, drop, pick up, equip, or unequip it.",
    "Low-stakes carried-item manner text such as keeping a satchel close, tight, tucked, or against the player's side/chest while walking, following footing, or taking a body posture stays in playerIntent/method or the scene beat text. Do not split it into a second localConditionNeed.",
    "For visible_actor_distance, localConditionNeed.targetRef must be one visible actor ref. For current_scene, targetRef may be null or current scene/location ref.",
    "Use item_transfer only for one bounded Player current-scene item custody/location/equip-state transition: give_to_visible_actor, receive_from_visible_actor, drop_in_current_scene, pickup_from_current_scene, equip_inventory_item, or unequip_inventory_item.",
    "Requests to a visible actor about holding, keeping, watching, taking, or storing a Player inventory item route as visible_actor_dialogue with itemTransferNeed=null; itemTransferNeed is added only when the same action explicitly performs the physical handoff with hand/give/pass/offer/transfer.",
    "When the player asks an already-visible actor to return, give back, hand back, or pass back one visible SceneFrame.targets item to Player, use receive_from_visible_actor. This is a custody transition; any spoken reply stays in a dependent dialogue_record step.",
    "itemTransferNeed must cite itemRef from SceneFrame.inventory for give/drop/equip/unequip, from SceneFrame.targets where kind=item for pickup/receive, and sourceRef from SceneFrame.actors for receive_from_visible_actor. give_to_visible_actor targetRef must be a visible actor; receive/pickup/equip/unequip targetRef must be Player; drop targetRef must be current scene/location.",
    "itemTransferNeed sourceKind/targetKind are fixed by operation: give/drop/equip/unequip sourceKind=player_inventory, receive sourceKind=visible_actor_item, pickup sourceKind=current_scene_item; give targetKind=visible_actor, drop targetKind=current_scene, receive/pickup/unequip targetKind=player_inventory, equip targetKind=player_equipment.",
    "itemTransferNeed.equipSlot is the requested target equipment slot only: set it to \"equipped\" only for equip_inventory_item, and set it to null for give_to_visible_actor, receive_from_visible_actor, drop_in_current_scene, pickup_from_current_scene, and unequip_inventory_item. Do not copy the inventory item's current equipState into equipSlot.",
    "item_transfer does not authorize item creation, discovery/search/inspection, item use/activation, damage/repair/consumption, barter/payment, container contents, NPC consent/reaction, stealing/planting, relationship, world facts, route/location/POI truth, HP/condition, dialogue, absence, or no-change.",
    "Use scene_local_beat for an ordinary possible low-stakes current-scene interaction with a plausible public scene prop, fixture, or soft prose detail: touch it, lean on it, duck behind it, step onto it for a moment, balance on it lightly, kick it aside, break an unimportant chair in a scuffle, grab or hold a nearby stool/chair as immediate cover, or otherwise use it for the immediate beat. This records only the visible turn event through scene_beat_record; it does not create an inventory item, durable object row, route, hidden mechanism, resource, condition, relationship, or world fact.",
    "A one-turn phrase such as grab it, hold it ready, keep it ready, use it as improvised cover/shield, step onto the loose board, balance on the brick, or set it between me and danger stays scene_local_beat when the object is an ordinary plausible current-scene prop and the action is bounded to the immediate beat.",
    "When a scene_local_beat also mentions keeping an already-inventory item close/ready without changing custody or equipment, keep the item phrase inside sceneBeatNeed.requestedBeatText and leave itemTransferNeed null.",
    "When the player simply asks whether an obvious mundane prop such as a stool, chair, cup, broom, curtain, counter, crate, or table is available in a location where it is plainly plausible, use scene_local_beat with a bounded availability/readiness beat instead of localObservationNeed over enumerated surfaces.",
    "When the player listens, smells, feels air/temperature, or otherwise asks for ordinary ambient sensory texture from a current-scene surface, prop, fixture, backdrop, crowd, or background chatter, use scene_local_beat with beatKind=local_interaction. This authorizes only a one-turn sensory/social beat for prose; it does not prove pressure, leaks, codes, hidden mechanisms, structural safety, danger, resources, routes, activation, exact dialogue quotes, NPC private knowledge, or future availability.",
    "For scene_local_beat, fill sceneBeatNeed. Use beatKind=ordinary_prop_availability when the player only checks whether a mundane prop is available. Use beatKind=ordinary_prop_readiness when the player grabs, holds, braces, or keeps an ordinary prop ready for the immediate beat. Use local_interaction for other one-turn ordinary prop/fixture interactions.",
    "If the player wants durable carry/equip/storage, trade, hidden-property inspection, activation, repair, tracking, special mechanical advantage, future-important use, or a persistent named object, use the appropriate modeled primitive when a SceneFrame ref exists, or clarification/unsupported_or_unclear when it does not.",
    "If the player puts on, wears, straps on, slings onto shoulder/back, fastens onto themselves, or otherwise moves a carried inventory item into a worn/equipped state, use item_transfer with operation=equip_inventory_item.",
    "If the player unfastens, takes off, removes, unslings, or otherwise moves an equipped inventory item out of its worn/equipped slot, use item_transfer with operation=unequip_inventory_item even when the action also says the Player will hold, carry, or grip the item afterward.",
    "If the player merely grips, holds ready, keeps, or steadies an already-inventory item without custody/location/equip-state change, use player_local_condition with gripping_held_item, not item_transfer.",
    "If the player transfers or receives an item and also addresses a visible actor, keep interactionKind=visible_actor_dialogue, fill itemTransferNeed for the physical item-state part, and still put exactly one visible speaker ref in actionInterpretation.targetRefs.",
    "Spoken confirmation after transfer, such as \"Do you have it now?\", is visible_actor_dialogue with itemTransferNeed; playerIntent names the requested spoken confirmation.",
    "If the player transfers one item while explicitly maintaining a separate current-scene Player posture/readiness condition, keep interactionKind=item_transfer and fill localConditionNeed for the bounded posture/readiness. localConditionNeed must not target the same item whose custody/location/equip state is changing.",
    "Use minor_poi_create only for one ordinary public visible current-scene place handle named or pointed out by the player: a stall, counter, bench, landmark, signage, cover, doorway, alcove, workstation, notice_board, or other_place. It creates/reuses only a SceneFrame target handle, not a location or route.",
    "minorPoiNeed.placeLabel is the visible handle label the player is establishing. minorPoiNeed.anchorRef must be the current scene/location ref from SceneFrame.citableRefs. placeKind must be allowed by SceneFrame.currentScenePlaceHandleSurface.allowedPlaceKinds.",
    "minor_poi_create does not authorize actors, services, inventory, business facts, readable sign text, hidden discovery, search result, absence, no-change, world fact, location reveal, movement option, legal destination, route truth, or dialogue content.",
    "If the player establishes a current-scene place handle and also addresses a visible actor, keep interactionKind=visible_actor_dialogue, fill minorPoiNeed for the handle part, and still put exactly one visible speaker ref in actionInterpretation.targetRefs.",
    "Use current_scene_observation with localObservationNeed only for targeted read-only current-scene observation over exposed SceneFrame surfaces: player_status, current_scene, current_location, visible_actor, visible_target, inventory_item, visible_fact, or movement_option labels/details. Broad route/exits/options lists over movement_option use route_inquiry.",
    "For broad look/look around/what is visible/what feels immediately useful or notable around me without a concrete target query, use current_scene_observation without localObservationNeed so the existing observe_visible snapshot can handle it.",
    "For inventory/kit/carrying lists such as what am I carrying or pat down my kit, use localObservationNeed mode=list_surface, surfaceKinds=[\"inventory_item\"], targetRef=null, and allowBoundedNegative=false.",
    "For visible people, roles, ordinary clutter, cover, nearby props, or current-scene surface probes that may have no matching exposed entries, set allowBoundedNegative=true. A current_scene/current_location anchor alone is context, not a positive match for the requested people, object, cover, or prop.",
    "For yes/no visible-surface checks phrased as look for X, any X, signs of X, or visible X, make localObservationNeed.queryText a grammatical whether-shaped query such as \"whether visible sparks, heat shimmer, or warning tags are present\". Do not leave queryText as a bare noun phrase that would make receipt prose read as answers visible sparks.",
    "For harmless surface details, wear, marks, scratches, smell, or texture on an exposed item or target, use localObservationNeed over that exposed surface with targetRef copied from the known item/target. The queryText should ask only for ordinary visible/sensory surface texture. Clue meaning, hidden discovery, activation, and mechanism checks use the separate property/outcome route below.",
    "When the player asks whether visible wear, marks, scratches, or handling detail on a known item/target reveals a hidden mechanism, secret, route, or useful clue, set localObservationNeed.targetRef=null and queryText to the requested property/outcome. A targetRef to the known item/target proves only that exposed entry exists; it must not answer hidden/mechanical/clue meaning.",
    "When ordinary ambient listening/smelling/feeling asks only for scene texture, crowd noise, background argument, or tavern/street chatter, keep it scene_local_beat; when the same sensory wording asks whether the texture proves a consequential property or outcome such as pressure, leak source, code, hidden mechanism, safety, danger, activation, route truth, exact quoted speech, private knowledge, or a useful clue, use current_scene_observation with localObservationNeed targetRef=null and allowBoundedNegative=true.",
    "For ordinary one-turn tactile or physical probes that explicitly ask to learn whether current-scene texture shifts, holds, reveals something, or has a property, such as nudging rubble, testing footing, touching a wall, or checking whether a loose surface shifts, use localObservationNeed mode=target_match, targetRef=null, surfaceKinds=[\"current_scene\"], and allowBoundedNegative=true. Do not use this observation route for the plain immediate action of stepping onto a plausible loose board, balancing on a brick, leaning on a crate, or ducking behind a counter; those stay scene_local_beat unless the player explicitly asks for a property/outcome check. Do not cite the current scene or location as targetRef merely because the probe happens there; the receipt owns only the bounded visible/sensory query, not a durable object, item pickup, mutation, hidden mechanism, or route discovery.",
    "For who/anyone/people/person/NPC visible nearby or here, use localObservationNeed mode=list_surface, surfaceKinds=[\"visible_actor\"], targetRef=null, and allowBoundedNegative=true.",
    "For looking around or searching for a named person, role, or NPC in the current scene, use localObservationNeed mode=target_match, surfaceKinds=[\"visible_actor\"], targetRef=null, and queryText with the searched name or role. This produces a bounded visible-actor check and does not create the named actor.",
    "For Do I see X here? or a visible surface-entry inspection, fill localObservationNeed with mode=target_match, queryText copied as a concise visible target phrase, surfaceKinds to search, targetRef when an exact exposed ref is already known, and allowBoundedNegative=true only for bounded no-match against those enumerated surfaces.",
    "player_status localObservationNeed reads only SceneFrame.player.visibleStatus; it may report bounded visible status labels or their absence in that surface, and it does not authorize HP changes, damage, healing, broad injury absence beyond that surface, posture changes, combat status, mutation, or no-change.",
    "localObservationNeed does not authorize hidden discovery, concealed search, thorough room search, broad absence, item use/effects, phone or device status/messages, POI/storefront/landmark truth unless already exposed by a SceneFrame surface, route truth beyond route option/check receipts, world facts, mutation, dialogue content, or private facts.",
    "Use device_status_observation with deviceObservationNeed only for checking citable Player-carried/equipped or current-scene visible device surfaces from SceneFrame.deviceStatusSurfaces.",
    "deviceObservationNeed facets are only screen_state, power_indicator, battery_indicator, signal_indicator, notification_indicator, message_indicator, or call_indicator. allowNoSurface=true means only bounded no-surface, not no signal/no message/no call/no instruction/no-change.",
    "deviceObservationNeed does not authorize hidden/private message contents, instructions, message/call generation, caller/sender identity, true network state, item use/activation, hacking/decryption, route/location truth, world facts, mutation, broad absence, or no-change.",
    "Every focalRefs, evidenceRefs, and actionInterpretation.targetRefs entry must be copied exactly from SceneFrame.citableRefs.",
    "For ordinary_support_actor_needed, supportActorNeed.evidenceRefs must also be copied exactly from SceneFrame.citableRefs, usually Player plus current scene/current location.",
    "For player_local_condition or compound localConditionNeed, localConditionNeed.evidenceRefs and any targetRef must also be copied exactly from SceneFrame.citableRefs.",
    "For item_transfer or compound itemTransferNeed, itemTransferNeed.itemRef, targetRef, and evidenceRefs must also be copied exactly from SceneFrame.citableRefs.",
    "For minor_poi_create or compound minorPoiNeed, minorPoiNeed.anchorRef and evidenceRefs must also be copied exactly from SceneFrame.citableRefs.",
    "For time_passage, timePassageNeed.evidenceRefs must also be copied exactly from SceneFrame.citableRefs, usually Player plus current scene/current location.",
    "For localObservationNeed, evidenceRefs and any targetRef must also be copied exactly from SceneFrame.citableRefs.",
    "For deviceObservationNeed, deviceRef and evidenceRefs must also be copied exactly from SceneFrame.citableRefs.",
    "Do not use UUIDs, database ids, backend refs, or private terms.",
    "Forecast is advisory trajectory without player intervention. It cannot authorize mutation or narration claims.",
    "Keep arrays short and omit all fields not defined by the schema.",
  ].join("\n");
}

export function buildGmReadPrompt(
  frame: AuthoritativeSceneFrame,
  options: { recentConversation?: readonly GmReadRecentConversationMessage[] } = {},
): string {
  const firstInventoryItem = frame.inventory[0]?.ref ?? null;
  const firstVisibleActor = frame.actors[0]?.ref ?? null;
  const firstVisibleItem = frame.targets.find((target) => target.kind === "item")?.ref ?? null;
  const itemTransferCue = firstVisibleActor && (firstInventoryItem || firstVisibleItem)
    ? [
      "Current-frame item_transfer cue:",
      "A request to hold, keep, watch, take, or store an inventory item is dialogue only until the player explicitly hands, gives, passes, offers, or transfers the item.",
      ...(firstInventoryItem ? [
        "For this frame, a valid hold/keep request example shape is:",
        JSON.stringify({
          path: "procedural",
          actionInterpretation: {
            interactionKind: "visible_actor_dialogue",
            playerIntent: `Ask whether ${firstVisibleActor} can hold ${firstInventoryItem}.`,
            targetRefs: [firstVisibleActor],
            itemTransferNeed: null,
          },
        }, null, 2),
        "When the player hands, gives, passes, offers, or transfers a SceneFrame.inventory item to a SceneFrame.actors visible non-player actor and also asks, tells, says, or requests spoken confirmation, choose interactionKind=visible_actor_dialogue.",
        "For compound transfer plus speech, use path=procedural, targetRefs=[speakerRef], and fill itemTransferNeed with operation=give_to_visible_actor, sourceKind=player_inventory, sourceRef=null, targetKind=visible_actor, equipSlot=null.",
        "Verification wording such as \"Do you have it now?\" counts as spoken confirmation.",
        "For this frame, a valid compound handoff plus confirmation example shape is:",
        JSON.stringify({
          path: "procedural",
          actionInterpretation: {
            interactionKind: "visible_actor_dialogue",
            playerIntent: `Hand ${firstInventoryItem} to ${firstVisibleActor}, then ask for spoken confirmation.`,
            targetRefs: [firstVisibleActor],
            itemTransferNeed: {
              actorRef: "Player",
              operation: "give_to_visible_actor",
              itemRef: firstInventoryItem,
              sourceKind: "player_inventory",
              sourceRef: null,
              targetKind: "visible_actor",
              targetRef: firstVisibleActor,
              equipSlot: null,
              requestedItemText: firstInventoryItem,
              evidenceRefs: ["Player", firstInventoryItem, firstVisibleActor, frame.scene.currentScene.ref],
            },
          },
        }, null, 2),
        "For a standalone physical handoff, choose interactionKind=item_transfer.",
        "For this frame, a valid standalone handoff example shape is:",
        JSON.stringify({
          path: "procedural",
          actionInterpretation: {
            interactionKind: "item_transfer",
            targetRefs: [firstInventoryItem, firstVisibleActor],
            itemTransferNeed: {
              actorRef: "Player",
              operation: "give_to_visible_actor",
              itemRef: firstInventoryItem,
              sourceKind: "player_inventory",
              sourceRef: null,
              targetKind: "visible_actor",
              targetRef: firstVisibleActor,
              equipSlot: null,
              requestedItemText: firstInventoryItem,
              evidenceRefs: ["Player", firstInventoryItem, firstVisibleActor, frame.scene.currentScene.ref],
            },
          },
        }, null, 2),
      ] : []),
      ...(firstVisibleItem ? [
        "When the player asks a SceneFrame.actors visible non-player actor to return, give back, hand back, or pass back one visible SceneFrame.targets item to Player, choose receive_from_visible_actor.",
        "For this frame, a valid visible-actor return plus spoken reply example shape is:",
        JSON.stringify({
          path: "procedural",
          actionInterpretation: {
            interactionKind: "visible_actor_dialogue",
            playerIntent: `Ask ${firstVisibleActor} to return ${firstVisibleItem} to Player, then answer.`,
            targetRefs: [firstVisibleActor],
            itemTransferNeed: {
              actorRef: "Player",
              operation: "receive_from_visible_actor",
              itemRef: firstVisibleItem,
              sourceKind: "visible_actor_item",
              sourceRef: firstVisibleActor,
              targetKind: "player_inventory",
              targetRef: "Player",
              equipSlot: null,
              requestedItemText: firstVisibleItem,
              evidenceRefs: ["Player", firstVisibleItem, firstVisibleActor, frame.scene.currentScene.ref],
            },
          },
        }, null, 2),
      ] : []),
    ].join("\n")
    : "Current-frame item_transfer cue: no inventory handoff or visible-actor return example is available in this SceneFrame.";
  const firstMovementOption = frame.movementOptions[0]?.ref ?? null;
  const movementCue = firstMovementOption
    ? [
      "Current-frame movement cue:",
      "When the player says to walk, go, head, return, travel, enter, leave, follow, take a route, or move to a SceneFrame.movementOptions entry, choose interactionKind=movement_intent.",
      "If the same action contains a courtesy such as thanking, nodding to, or saying farewell to a visible actor, keep movement_intent when the player still explicitly takes the route or heads to the exposed destination.",
      "If the same movement action includes low-stakes manner text such as keeping a carried satchel close, holding an inventory item close, or keeping hands on a carried object while walking, keep movement_intent and place that wording in playerIntent/method only. Do not fill localConditionNeed for movement_intent; current-scene local conditions are for standalone posture/readiness commitments.",
      "Use path=procedural, targetRefs=[destinationRef], and copy the destination ref exactly from movementOptions. Route-status questions with without moving / do not go yet use interactionKind=route_inquiry instead. If that question names a destination absent from movementOptions, use route_inquiry with targetRefs=[] or a current scene/location ref and keep the destination name only in text fields.",
      "For this frame, a valid movement example shape is:",
      JSON.stringify({
        path: "procedural",
        actionInterpretation: {
          interactionKind: "movement_intent",
          targetRefs: [firstMovementOption],
          method: "walk",
        },
      }, null, 2),
      "For this frame, a valid movement-with-carried-item-manner example shape is:",
      JSON.stringify({
        path: "procedural",
        actionInterpretation: {
          interactionKind: "movement_intent",
          targetRefs: [firstMovementOption],
          playerIntent: `Walk to ${firstMovementOption} while keeping a carried item close`,
          method: "walk while keeping carried item close",
        },
      }, null, 2),
    ].join("\n")
    : "Current-frame movement cue: no movement_intent target is available because SceneFrame.movementOptions is empty.";
  const localConditionCue = [
    "Current-frame Player local-condition cue:",
    "When the player steadies, braces, kneels, crouches, raises hands, keeps hands visible, steps back, keeps distance, or checks themself while making an uncontested current-scene posture/readiness commitment, choose interactionKind=player_local_condition.",
    "When the player only keeps an already-inventory item high, in hand, dry, protected, or ready without giving, dropping, picking up, equipping, or unequipping it, choose player_local_condition with localConditionNeed.conditionKey=gripping_held_item and leave itemTransferNeed null.",
    "When the player combines two standalone body/readiness commitments such as crouch, kneel, step back, or keep hands visible with consequential carried-item readiness such as keeping the message tube dry, satchel high, or a tube ready in hand, ask which posture/readiness condition to apply first. When the body wording is an ordinary prop/fixture beat such as lean on a crate, duck behind a counter, or brace a door while keeping an already-inventory item close, choose scene_local_beat.",
    "If the same wording asks whether the Player is hurt while also declaring posture/readiness, do not assert injury, no injury, HP, damage, or healing from GM Read; model only the supported posture/readiness receipt, such as conditionKey=braced for steady myself, and do not include localObservationNeed in that player_local_condition object.",
    "For this frame, a valid steady/self-check example shape is:",
    JSON.stringify({
      path: "procedural",
      actionInterpretation: {
        interactionKind: "player_local_condition",
        targetRefs: ["Player", frame.scene.currentScene.ref],
        localConditionNeed: {
          actorRef: "Player",
          operation: "apply",
          conditionKey: "braced",
          requestedPostureText: "steady myself",
          targetKind: "visible_scene_anchor",
          targetRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
    "For this frame, a valid keep-low passage example shape is:",
    JSON.stringify({
      path: "procedural",
      actionInterpretation: {
        interactionKind: "player_local_condition",
        targetRefs: ["Player", frame.scene.currentScene.ref],
        localConditionNeed: {
          actorRef: "Player",
          operation: "apply",
          conditionKey: "crouched",
          requestedPostureText: "keep low while moving through the passage",
          targetKind: "visible_scene_anchor",
          targetRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
    ...(firstInventoryItem
      ? [
        "For this frame, a valid body-posture plus carried-item readiness clarification example shape is:",
        JSON.stringify({
          path: "clarification",
          liveSceneQuestion: `Which posture/readiness should apply first: crouching or keeping ${firstInventoryItem} ready?`,
          actionInterpretation: {
            interactionKind: "unsupported_or_unclear",
            playerIntent: `Clarify whether to crouch or keep ${firstInventoryItem} ready first.`,
            targetRefs: ["Player", firstInventoryItem],
          },
        }, null, 2),
      ]
      : ["For this frame, no body-posture plus carried-item readiness clarification example is available because SceneFrame.inventory is empty."]),
    ...(firstInventoryItem
      ? [
        "For this frame, a valid held-item readiness example shape is:",
        JSON.stringify({
          path: "procedural",
          actionInterpretation: {
            interactionKind: "player_local_condition",
            targetRefs: ["Player", firstInventoryItem],
            localConditionNeed: {
              actorRef: "Player",
              operation: "apply",
              conditionKey: "gripping_held_item",
              requestedPostureText: `keep ${firstInventoryItem} close`,
              targetKind: "inventory_item_readiness",
              targetRef: firstInventoryItem,
              evidenceRefs: ["Player", firstInventoryItem, frame.scene.currentScene.ref],
            },
            itemTransferNeed: null,
          },
        }, null, 2),
      ]
      : ["For this frame, no held-item readiness example is available because SceneFrame.inventory is empty."]),
  ].join("\n");
  const playerStatusCue = [
    "Current-frame Player visible-status observation cue:",
    "When the player asks only whether they have any obvious injury, strain, pain, fatigue, visible condition, or asks how they are holding up, choose interactionKind=current_scene_observation with localObservationNeed over player_status.",
    "This is a bounded read-only SceneFrame.player.visibleStatus check. It is not clarification and does not create a posture/readiness condition.",
    "For this frame, a valid visible-status self-check example shape is:",
    JSON.stringify({
      path: "direct",
      actionInterpretation: {
        interactionKind: "current_scene_observation",
        targetRefs: ["Player"],
        localObservationNeed: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "obvious injury or strain on Player",
          targetRef: "Player",
          surfaceKinds: ["player_status"],
          allowBoundedNegative: true,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
  ].join("\n");
  const accessFixtureObservationCue = [
    "Current-frame access-fixture observation cue:",
    "When the player asks whether they can see a physical access fixture such as a stair, lift, ladder, doorway, hatch, gate, rope, bridge, passage mouth, or barricade opening, choose current_scene_observation with localObservationNeed unless the target is an exact movementOptions label.",
    "Do not substitute a different visible route label when the requested access fixture or destination is not exposed as a movement option.",
    "For this frame, a valid physical-access observation example shape is:",
    JSON.stringify({
      path: "direct",
      actionInterpretation: {
        interactionKind: "current_scene_observation",
        playerIntent: "Check whether an open stair, lift, ladder, or doorway to upper floors is visibly available.",
        method: "visible access fixture check",
        targetRefs: [frame.scene.currentScene.ref],
        localObservationNeed: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "open stair, lift, ladder, or doorway that clearly leads to upper floors",
          targetRef: null,
          surfaceKinds: ["current_scene", "visible_target"],
          allowBoundedNegative: true,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
  ].join("\n");
  const firstSurfaceItem = frame.inventory[0] ?? null;
  const firstSurfaceTarget = frame.targets[0] ?? null;
  const surfaceCueTarget = firstSurfaceItem
    ? {
      ref: firstSurfaceItem.ref,
      label: firstSurfaceItem.label,
      surfaceKinds: ["inventory_item", "visible_fact"],
    }
    : firstSurfaceTarget
      ? {
        ref: firstSurfaceTarget.ref,
        label: firstSurfaceTarget.label,
        surfaceKinds: ["visible_target", "visible_fact"],
      }
      : null;
  const surfaceDetailCue = surfaceCueTarget
    ? [
      "Current-frame surface-detail observation cue:",
      "When the player inspects harmless visible surface details, ordinary wear, marks, scratches, texture, or smell on an exposed item or target, choose interactionKind=current_scene_observation with localObservationNeed over that exposed surface.",
      "When the player asks whether those visible details reveal hidden mechanism, secret, route, useful clue, activation, or meaning, keep interactionKind=current_scene_observation but set localObservationNeed.targetRef=null and queryText to that requested property/outcome.",
      "This route asks only for current visible surface evidence. It does not authorize hidden mechanisms, secret inscriptions, item powers, discovery, item use, route truth, or world facts; those require separate accepted evidence.",
      "For this frame, a valid harmless exposed-surface example shape is:",
      JSON.stringify({
        path: "direct",
        actionInterpretation: {
          interactionKind: "current_scene_observation",
          targetRefs: [surfaceCueTarget.ref],
          localObservationNeed: {
            actorRef: "Player",
            mode: "target_match",
            queryText: `visible surface details, ordinary wear, marks, or scratches on ${surfaceCueTarget.label}`,
            targetRef: surfaceCueTarget.ref,
            surfaceKinds: surfaceCueTarget.surfaceKinds,
            allowBoundedNegative: true,
            evidenceRefs: ["Player", surfaceCueTarget.ref, frame.scene.currentScene.ref],
          },
        },
      }, null, 2),
      "For this frame, a valid hidden/clue property question shape is:",
      JSON.stringify({
        path: "direct",
        actionInterpretation: {
          interactionKind: "current_scene_observation",
          targetRefs: [surfaceCueTarget.ref],
          localObservationNeed: {
            actorRef: "Player",
            mode: "target_match",
            queryText: `whether visible details on ${surfaceCueTarget.label} reveal a hidden mechanism or useful clue`,
            targetRef: null,
            surfaceKinds: surfaceCueTarget.surfaceKinds,
            allowBoundedNegative: true,
            evidenceRefs: ["Player", surfaceCueTarget.ref, frame.scene.currentScene.ref],
          },
        },
      }, null, 2),
      "A surface-detail meaning question over an exposed ref uses observation with bounded property/outcome evidence, not clarification.",
    ].join("\n")
    : "Current-frame surface-detail observation cue: no exposed inventory item or visible target example is available in this SceneFrame.";
  const sceneLocalBeatCue = [
    "Current-frame ordinary scene-prop beat cue:",
    "When the player uses a plausible ordinary current-scene prop or fixture for this immediate beat, choose interactionKind=scene_local_beat even when the prop is not a SceneFrame target.",
    "Priority: plain immediate action verbs such as step onto, balance on, lean on, duck behind, grab, hold, brace, kick aside, or set between stay scene_local_beat. Use current_scene_observation for a prop only when the player explicitly asks to check/test/inspect whether it shifts, holds, reveals something, has a hidden property, or proves an outcome.",
    "If this immediate scene-prop beat also says to keep an already-inventory item close or ready, keep that phrase in sceneBeatNeed.requestedBeatText and leave itemTransferNeed and localConditionNeed empty.",
    "When the player asks whether an obvious ordinary prop is available in a plausible place, choose interactionKind=scene_local_beat and phrase playerIntent as a bounded current-scene availability beat, for example Ordinary stool/chair is within easy reach for this beat.",
    "When the player listens, smells, or feels for ordinary ambient scene texture from a surface, prop, fixture, backdrop, crowd, or background chatter, choose interactionKind=scene_local_beat and phrase playerIntent as a natural sensory/social scene beat. A look-around action combined with listening to crowd argument or tavern chatter should still preserve the listening beat instead of collapsing into a generic visible-entry list. Keep classifier terms such as harmless, low-stakes, soft prose, authority, or scene beat out of playerIntent and sceneBeatNeed.requestedBeatText because those fields may shape visible narration. Use current_scene_observation only when the player asks what the sensory detail proves about a consequential property, mechanism, route, danger, safety, resource, activation, code, exact quote, private knowledge, or useful clue.",
    "Examples include grabbing or holding a nearby stool/chair as improvised cover, stepping lightly onto a loose board/brick, bracing a door with a loose chair, kicking a crate aside, ducking behind a counter, or breaking an unimportant chair during a scuffle.",
    "This shape records a visible turn event only. It does not create inventory, durable object state, cover effectiveness, hidden mechanisms, combat advantage, resource change, world facts, or future availability.",
    "For this frame, a valid immediate ordinary prop beat example shape is:",
    JSON.stringify({
      path: "procedural",
      actionInterpretation: {
        interactionKind: "scene_local_beat",
        playerIntent: "Grab a nearby stool or chair and keep it ready as an improvised shield for this beat",
        method: "immediate scene-prop interaction",
        targetRefs: [frame.scene.currentScene.ref],
        sceneBeatNeed: {
          actorRef: "Player",
          beatKind: "ordinary_prop_readiness",
          requestedBeatText: "Grab a nearby stool or chair and keep it ready as an improvised shield for this beat",
          anchorRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
    ...(firstInventoryItem
      ? [
        "For this frame, a valid ordinary prop plus carried-item readiness example shape is:",
        JSON.stringify({
          path: "procedural",
          actionInterpretation: {
            interactionKind: "scene_local_beat",
            playerIntent:
              `Lean on an ordinary crate while keeping ${firstInventoryItem} close for this immediate beat`,
            method: "immediate scene-prop interaction",
            targetRefs: [frame.scene.currentScene.ref, firstInventoryItem],
            sceneBeatNeed: {
              actorRef: "Player",
              beatKind: "ordinary_prop_readiness",
              requestedBeatText:
                `Lean on an ordinary crate while keeping ${firstInventoryItem} close for this immediate beat`,
              anchorRef: frame.scene.currentScene.ref,
              evidenceRefs: ["Player", frame.scene.currentScene.ref, firstInventoryItem],
            },
          },
        }, null, 2),
      ]
      : []),
    "For this frame, a valid immediate loose footing beat example shape is:",
    JSON.stringify({
      path: "procedural",
      actionInterpretation: {
        interactionKind: "scene_local_beat",
        playerIntent: "Step onto a loose board or brick for this immediate beat",
        method: "immediate scene-prop interaction",
        targetRefs: [frame.scene.currentScene.ref],
        sceneBeatNeed: {
          actorRef: "Player",
          beatKind: "local_interaction",
          requestedBeatText: "Step onto a loose board or brick for this immediate beat",
          anchorRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
    "For this frame, a valid ordinary prop availability example shape is:",
    JSON.stringify({
      path: "direct",
      actionInterpretation: {
        interactionKind: "scene_local_beat",
        playerIntent: "Ordinary stool or chair is within easy reach for this beat",
        method: "ordinary scene-prop availability",
        targetRefs: [frame.scene.currentScene.ref],
        sceneBeatNeed: {
          actorRef: "Player",
          beatKind: "ordinary_prop_availability",
          requestedBeatText: "Ordinary stool or chair is within easy reach for this beat",
          anchorRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
    "For this frame, a valid ordinary ambient sensory example shape is:",
    JSON.stringify({
      path: "direct",
      actionInterpretation: {
        interactionKind: "scene_local_beat",
        playerIntent: "Listen to ordinary pipes for their current sound in the damp cellar",
        method: "ambient sensory check",
        targetRefs: [frame.scene.currentScene.ref],
        sceneBeatNeed: {
          actorRef: "Player",
          beatKind: "local_interaction",
          requestedBeatText: "Listen to ordinary pipes for their current sound in the damp cellar",
          anchorRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
    "For this frame, a valid ordinary overheard chatter example shape is:",
    JSON.stringify({
      path: "direct",
      actionInterpretation: {
        interactionKind: "scene_local_beat",
        playerIntent: "Listen to the ordinary background argument and courier chatter in the current room",
        method: "ambient social listening",
        targetRefs: [frame.scene.currentScene.ref],
        sceneBeatNeed: {
          actorRef: "Player",
          beatKind: "local_interaction",
          requestedBeatText: "Listen to the ordinary background argument and courier chatter in the current room",
          anchorRef: frame.scene.currentScene.ref,
          evidenceRefs: ["Player", frame.scene.currentScene.ref],
        },
      },
    }, null, 2),
  ].join("\n");
  return [
    "Interpret the player action against this authoritative SceneFrame.",
    "Return gm-read.v1 JSON. Do not add extra fields.",
    itemTransferCue,
    movementCue,
    localConditionCue,
    playerStatusCue,
    accessFixtureObservationCue,
    surfaceDetailCue,
    sceneLocalBeatCue,
    gmReadRecentDiscourseCue(options.recentConversation),
    JSON.stringify(promptFrame(frame), null, 2),
  ].join("\n\n");
}

async function generateGmReadCandidate(input: {
  provider: ProviderConfig;
  request: GmReadCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "judge", reasoningMode: "bypass" }),
    schema: gmReadModelGenerationSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.1,
    maxOutputTokens: 1200,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

export async function runCleanGmRead(input: {
  frame: AuthoritativeSceneFrame;
  provider: ProviderConfig;
  generateCandidate?: GmReadCandidateGenerator;
  recentConversation?: readonly GmReadRecentConversationMessage[];
}): Promise<GmReadRunResult> {
  const system = buildGmReadSystemPrompt();
  const prompt = buildGmReadPrompt(input.frame, {
    recentConversation: input.recentConversation,
  });
  const generateCandidate =
    input.generateCandidate
    ?? ((request: GmReadCandidateRequest) => generateGmReadCandidate({
      provider: input.provider,
      request,
    }));

  let firstCandidate: unknown;
  try {
    firstCandidate = await generateCandidate({ system, prompt });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new CleanGmReadGenerationError(
      `Clean GM Read generation failed before validation: ${message.slice(0, 300)}`,
      error,
    );
  }

  const firstValidation = validateGmReadCandidate({
    frame: input.frame,
    candidate: firstCandidate,
  });
  if (firstValidation.status === "accepted") {
    return {
      status: "accepted",
      read: firstValidation.read,
      issues: [],
      repairAttempted: false,
    };
  }

  throw new CleanGmReadValidationError(
    `Clean GM Read validation failed. ${gmReadIssueSummary(firstValidation.issues)}`,
    firstValidation.issues,
  );
}
