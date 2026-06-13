import { z } from "zod";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  assertGmRead,
  cleanItemTransferOperationSchema,
  cleanItemTransferSourceKindSchema,
  cleanItemTransferTargetKindSchema,
  cleanMinorPoiKindSchema,
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
  drop_in_current_scene: { sourceKind: "player_inventory", targetKind: "current_scene", equipSlot: null },
  pickup_from_current_scene: { sourceKind: "current_scene_item", targetKind: "player_inventory", equipSlot: null },
  equip_inventory_item: { sourceKind: "player_inventory", targetKind: "player_equipment", equipSlot: "equipped" },
  unequip_inventory_item: { sourceKind: "player_inventory", targetKind: "player_inventory", equipSlot: null },
};

const gmReadGenerationItemTransferNeedSchema = z.object({
  actorRef: z.literal("Player"),
  operation: cleanItemTransferOperationSchema,
  itemRef: gmReadGenerationModelSafeRef,
  sourceKind: gmReadGenerationModelSafeRef,
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

export const gmReadModelGenerationSchema = gmReadSchema.extend({
  situationSummary: gmReadGenerationRepairableText,
  liveSceneQuestion: z.union([gmReadGenerationRepairableText, z.null()]),
  actionInterpretation: gmReadActionInterpretationSchema.extend({
    itemTransferNeed: gmReadGenerationItemTransferNeedSchema.nullable().optional(),
    minorPoiNeed: gmReadGenerationMinorPoiNeedSchema.nullable().optional(),
    timePassageNeed: gmReadGenerationTimePassageNeedSchema.nullable().optional(),
  }).strict(),
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

export interface GmReadCandidateRequest {
  system: string;
  prompt: string;
  repairOf?: {
    candidate: unknown;
    issues: GmReadValidationIssue[];
  };
}

export type GmReadCandidateGenerator = (request: GmReadCandidateRequest) => Promise<unknown>;

function normalizedKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizedObservationQuery(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function isGenericVisibleActorQuery(value: string): boolean {
  const normalized = normalizedObservationQuery(value);
  const words = new Set(normalized.split(/[^a-z0-9]+/u).filter(Boolean));
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

function normalizeGmReadCandidateForValidation(candidate: unknown): unknown {
  const normalizedTransfer = normalizeGmReadItemTransferShapeCandidate(candidate);
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
  const hasInventoryToVisibleActorTargetPair =
    allowedCapabilities.has("item_transfer")
    && loweredTargets.some((target) => inventoryRefs.has(target))
    && loweredTargets.some((target) => visibleActorRefs.has(target));

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
    if (itemTransferNeed.sourceKind === "player_inventory" && !inventoryRefs.has(itemRef)) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.itemTransferNeed.itemRef",
        message: "Player inventory item transfers require one SceneFrame.inventory item ref.",
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
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "time_passage must not include localConditionNeed.",
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
    const invalidTargets = loweredTargets.filter((target) => !movementOptionRefs.has(target));
    if (invalidTargets.length > 0) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.targetRefs",
        message: "route_inquiry targetRefs must cite visible SceneFrame.movementOptions, or stay empty for broad route-option questions.",
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
    if (read.actionInterpretation.localConditionNeed != null) {
      issues.push({
        code: "interaction_invalid",
        path: "actionInterpretation.localConditionNeed",
        message: "item_transfer must not include localConditionNeed.",
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
      message: "localConditionNeed is allowed only for player_local_condition or visible_actor_dialogue compound actions.",
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

  const candidateForValidation = normalizeGmReadCandidateForValidation(input.candidate);
  const parsed = gmReadSchema.safeParse(candidateForValidation);
  let parsedRead: GmRead | null = null;
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(zodIssue));
  } else {
    parsedRead = normalizeGmReadDeviceNoSurfaceAdmission({
      frame: input.frame,
      read: parsed.data,
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
    inventory: frame.inventory,
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
    "Use route_inquiry when the player asks whether a visible route/path/destination is open, legal, safe, reachable, connected, available, or where it leads, including wording like without moving / do not go yet.",
    "route_inquiry targetRefs must cite SceneFrame.movementOptions when the question targets one route, or stay empty for broad route-option questions.",
    "Use movement_intent only when the player asks to physically go, move, travel, enter, leave, follow, take a route, step through, head to, walk back to, return to, or otherwise change current scene/location.",
    "movement_intent requires exactly one targetRef copied from SceneFrame.movementOptions. If the destination is not an exposed movement option, use clarification or unsupported_or_unclear.",
    "Use time_passage only when the player waits, rests, pauses, watches, stands by, or otherwise lets time pass in the current scene without movement or another state change. Fill timePassageNeed with actorRef=Player, elapsedMinutes, reasonKind, requestedDurationText, and citable evidenceRefs.",
    "For time_passage, copy an explicit requested duration exactly into timePassageNeed.elapsedMinutes when the action gives minutes. For vague brief waits such as a few minutes, set elapsedMinutes=5 and requestedDurationText to the vague duration phrase.",
    "Use visible_actor_dialogue only when the player addresses exactly one already-visible non-player actor from SceneFrame.actors as the speaker. Put that speaker ref in actionInterpretation.targetRefs.",
    "Naming a visible actor as an item-transfer recipient is not visible_actor_dialogue by itself. Use visible_actor_dialogue only when the action includes communicative speech content such as asking, telling, saying, answering, greeting, threatening, bargaining, or requesting a spoken response.",
    "If the player also makes a current-scene Player posture/readiness commitment while addressing a visible actor, keep interactionKind=visible_actor_dialogue and fill localConditionNeed for that bounded posture/readiness part.",
    "Use ordinary_support_actor_needed only when the player needs one ordinary local current-scene role absent from SceneFrame.actors, with roleKind in the schema and supportActorNeed filled. Do not target an invented actor ref.",
    "ordinary_support_actor_needed may cover ordinary local roles like vendor, guard, clerk, dockhand, guide, porter, witness, helper, laborer, courier, attendant, bystander, or crowd voice. It does not authorize dialogue content.",
    "If the action says to call over, hail, flag down, get, find, or ask a local ordinary role absent from SceneFrame.actors, use ordinary_support_actor_needed. If the same action includes speech, a request, or wording like keep an eye on / watch a current-scene target, set supportActorNeed.intendedUse=dialogue_requested_but_not_yet_recorded.",
    "Do not use ordinary_support_actor_needed for named people, key NPCs, faction leaders, secret contacts, remote actors, persistent actors, hidden actors, family members, campaign-critical roles, or broad world creation; use clarification or unsupported_or_unclear instead.",
    "Use player_local_condition only for uncontested first-person current-scene Player posture/readiness such as kneeling, crouched, prone, taking_cover as posture only, keeping_distance, stepped_back, braced, hands_visible, hands_raised, or gripping_held_item for an already-inventory item.",
    "localConditionNeed does not authorize HP, damage, healing, injuries, combat status, NPC conditions, stealth success, cover effectiveness, movement, item custody/location/equip changes, tags, discovery, world facts, relationship, absence, no-change, or dialogue content.",
    "For gripping_held_item, localConditionNeed.targetKind must be inventory_item_readiness and targetRef must be copied from SceneFrame.inventory. For visible_actor_distance, targetRef must be one visible actor ref. For current_scene, targetRef may be null or current scene/location ref.",
    "Use item_transfer only for one uncontested Player item custody/location/equip-state transition: give_to_visible_actor, drop_in_current_scene, pickup_from_current_scene, equip_inventory_item, or unequip_inventory_item.",
    "itemTransferNeed must cite itemRef from SceneFrame.inventory for give/drop/equip/unequip, or from SceneFrame.targets where kind=item for pickup. give_to_visible_actor targetRef must be a visible actor; drop targetRef must be current scene/location; pickup/equip/unequip targetRef must be Player.",
    "itemTransferNeed sourceKind/targetKind are fixed by operation: give/drop/equip/unequip sourceKind=player_inventory, pickup sourceKind=current_scene_item; give targetKind=visible_actor, drop targetKind=current_scene, pickup/unequip targetKind=player_inventory, equip targetKind=player_equipment.",
    "itemTransferNeed.equipSlot is the requested target equipment slot only: set it to \"equipped\" only for equip_inventory_item, and set it to null for give_to_visible_actor, drop_in_current_scene, pickup_from_current_scene, and unequip_inventory_item. Do not copy the inventory item's current equipState into equipSlot.",
    "item_transfer does not authorize item creation, discovery/search/inspection, item use/activation, damage/repair/consumption, barter/payment, container contents, NPC consent/reaction, stealing/planting, relationship, world facts, route/location/POI truth, HP/condition, dialogue, absence, or no-change.",
    "If the player puts on, wears, straps on, slings onto shoulder/back, fastens onto themselves, or otherwise moves a carried inventory item into a worn/equipped state, use item_transfer with operation=equip_inventory_item.",
    "If the player unfastens, takes off, removes, unslings, or otherwise moves an equipped inventory item out of its worn/equipped slot, use item_transfer with operation=unequip_inventory_item even when the action also says the Player will hold, carry, or grip the item afterward.",
    "If the player merely grips, holds ready, keeps, or steadies an already-inventory item without custody/location/equip-state change, use player_local_condition with gripping_held_item, not item_transfer.",
    "If the player transfers an item and also addresses a visible actor, keep interactionKind=visible_actor_dialogue, fill itemTransferNeed for the physical item-state part, and still put exactly one visible speaker ref in actionInterpretation.targetRefs.",
    "Spoken confirmation after transfer, such as \"Do you have it now?\", is visible_actor_dialogue with itemTransferNeed; playerIntent names the requested spoken confirmation.",
    "Use minor_poi_create only for one ordinary public visible current-scene place handle named or pointed out by the player: a stall, counter, bench, landmark, signage, cover, doorway, alcove, workstation, notice_board, or other_place. It creates/reuses only a SceneFrame target handle, not a location or route.",
    "minorPoiNeed.placeLabel is the visible handle label the player is establishing. minorPoiNeed.anchorRef must be the current scene/location ref from SceneFrame.citableRefs. placeKind must be allowed by SceneFrame.currentScenePlaceHandleSurface.allowedPlaceKinds.",
    "minor_poi_create does not authorize actors, services, inventory, business facts, readable sign text, hidden discovery, search result, absence, no-change, world fact, location reveal, movement option, legal destination, route truth, or dialogue content.",
    "If the player establishes a current-scene place handle and also addresses a visible actor, keep interactionKind=visible_actor_dialogue, fill minorPoiNeed for the handle part, and still put exactly one visible speaker ref in actionInterpretation.targetRefs.",
    "Use current_scene_observation with localObservationNeed only for targeted read-only current-scene observation over exposed SceneFrame surfaces: current_scene, current_location, visible_actor, visible_target, inventory_item, visible_fact, or movement_option labels/details.",
    "For broad look/look around/what is visible without a concrete target query, use current_scene_observation without localObservationNeed so the existing observe_visible snapshot can handle it.",
    "For who/anyone/people/person/NPC visible nearby or here, use localObservationNeed mode=list_surface, surfaceKinds=[\"visible_actor\"], targetRef=null, and allowBoundedNegative=true.",
    "For Do I see X here? or a visible surface-entry inspection, fill localObservationNeed with mode=target_match, queryText copied as a concise visible target phrase, surfaceKinds to search, targetRef when an exact exposed ref is already known, and allowBoundedNegative=true only for bounded no-match against those enumerated surfaces.",
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

export function buildGmReadPrompt(frame: AuthoritativeSceneFrame): string {
  const firstInventoryItem = frame.inventory[0]?.ref ?? null;
  const firstVisibleActor = frame.actors[0]?.ref ?? null;
  const itemTransferCue = firstInventoryItem && firstVisibleActor
    ? [
      "Current-frame item_transfer cue:",
      "When the player hands, gives, passes, offers, or transfers a SceneFrame.inventory item to a SceneFrame.actors visible non-player actor and also asks, tells, says, or requests spoken confirmation, choose interactionKind=visible_actor_dialogue.",
      "For compound transfer plus speech, use path=procedural, targetRefs=[speakerRef], and fill itemTransferNeed with operation=give_to_visible_actor, sourceKind=player_inventory, targetKind=visible_actor, equipSlot=null.",
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
            targetKind: "visible_actor",
            targetRef: firstVisibleActor,
            equipSlot: null,
            requestedItemText: firstInventoryItem,
            evidenceRefs: ["Player", firstInventoryItem, firstVisibleActor, frame.scene.currentScene.ref],
          },
        },
      }, null, 2),
    ].join("\n")
    : "Current-frame item_transfer cue: no inventory-to-visible-actor handoff example is available in this SceneFrame.";
  const firstMovementOption = frame.movementOptions[0]?.ref ?? null;
  const movementCue = firstMovementOption
    ? [
      "Current-frame movement cue:",
      "When the player says to walk, go, head, return, travel, enter, leave, follow, take a route, or move to a SceneFrame.movementOptions entry, choose interactionKind=movement_intent.",
      "Use path=procedural, targetRefs=[destinationRef], and copy the destination ref exactly from movementOptions. Route-status questions with without moving / do not go yet use interactionKind=route_inquiry instead.",
      "For this frame, a valid movement example shape is:",
      JSON.stringify({
        path: "procedural",
        actionInterpretation: {
          interactionKind: "movement_intent",
          targetRefs: [firstMovementOption],
          method: "walk",
        },
      }, null, 2),
    ].join("\n")
    : "Current-frame movement cue: no movement_intent target is available because SceneFrame.movementOptions is empty.";
  return [
    "Interpret the player action against this authoritative SceneFrame.",
    "Return gm-read.v1 JSON. Do not add extra fields.",
    itemTransferCue,
    movementCue,
    JSON.stringify(promptFrame(frame), null, 2),
  ].join("\n\n");
}

function buildGmReadRepairPrompt(input: {
  frame: AuthoritativeSceneFrame;
  candidate: unknown;
  issues: GmReadValidationIssue[];
}): string {
  return [
    "Repair the GM Read candidate so it satisfies gm-read.v1.",
    "Do not add executable, admission, mutation, Oracle, checklist, receipt, narration, or state-delta fields.",
    "Use only refs from SceneFrame.citableRefs.",
    "Validation issues:",
    JSON.stringify(input.issues, null, 2),
    "Original candidate:",
    JSON.stringify(input.candidate, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrame(input.frame), null, 2),
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
}): Promise<GmReadRunResult> {
  const system = buildGmReadSystemPrompt();
  const prompt = buildGmReadPrompt(input.frame);
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

  try {
    const repairCandidate = await generateCandidate({
      system,
      prompt: buildGmReadRepairPrompt({
        frame: input.frame,
        candidate: firstCandidate,
        issues: firstValidation.issues,
      }),
      repairOf: {
        candidate: firstCandidate,
        issues: firstValidation.issues,
      },
    });
    const repairValidation = validateGmReadCandidate({
      frame: input.frame,
      candidate: repairCandidate,
    });
    if (repairValidation.status === "accepted") {
      return {
        status: "accepted",
        read: repairValidation.read,
        issues: [],
        repairAttempted: true,
      };
    }
    throw new CleanGmReadValidationError(
      "Clean GM Read validation failed after repair.",
      [...firstValidation.issues, ...repairValidation.issues],
    );
  } catch (error) {
    if (error instanceof CleanGmReadValidationError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new CleanGmReadGenerationError(
      `Clean GM Read repair generation failed: ${message.slice(0, 300)}`,
      error,
    );
  }
}
