import { z } from "zod";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  assertGmRead,
  gmReadSchema,
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

const gmReadGenerationSchema = gmReadSchema.passthrough();

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

export interface GmReadFallback {
  status: "fallback_clarification";
  read: GmRead;
  issues: GmReadValidationIssue[];
  repairAttempted: boolean;
}

export type GmReadRunResult = GmReadAccepted | GmReadFallback;

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
    ...(read.actionInterpretation.localObservationNeed?.evidenceRefs ?? []),
    ...(read.actionInterpretation.localObservationNeed?.targetRef
      ? [read.actionInterpretation.localObservationNeed.targetRef]
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
  const localConditionNeed = read.actionInterpretation.localConditionNeed ?? null;
  const itemTransferNeed = read.actionInterpretation.itemTransferNeed ?? null;
  const localObservationNeed = read.actionInterpretation.localObservationNeed ?? null;
  const sceneRefs = new Set([
    frame.scene.currentScene.ref.toLowerCase(),
    frame.scene.currentLocation.ref.toLowerCase(),
  ]);

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
    const expected: Record<typeof operation, {
      sourceKind: typeof itemTransferNeed.sourceKind;
      targetKind: typeof itemTransferNeed.targetKind;
      equipSlot: typeof itemTransferNeed.equipSlot;
    }> = {
      give_to_visible_actor: { sourceKind: "player_inventory", targetKind: "visible_actor", equipSlot: null },
      drop_in_current_scene: { sourceKind: "player_inventory", targetKind: "current_scene", equipSlot: null },
      pickup_from_current_scene: { sourceKind: "current_scene_item", targetKind: "player_inventory", equipSlot: null },
      equip_inventory_item: { sourceKind: "player_inventory", targetKind: "player_equipment", equipSlot: "equipped" },
      unequip_inventory_item: { sourceKind: "player_inventory", targetKind: "player_inventory", equipSlot: null },
    };
    const expectedShape = expected[operation];
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

  const parsed = gmReadSchema.safeParse(input.candidate);
  let parsedRead: GmRead | null = null;
  if (!parsed.success) {
    issues.push(...parsed.error.issues.map(zodIssue));
  } else {
    parsedRead = parsed.data;
    issues.push(...frameMismatchIssues(parsed.data, input.frame));
    issues.push(...refValidationIssues(parsed.data, input.frame));
    issues.push(...interactionIssues(parsed.data, input.frame));
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

export function buildFallbackClarificationGmRead(input: {
  frame: AuthoritativeSceneFrame;
  reason: string;
}): GmRead {
  const sceneRef = input.frame.scene.currentScene.ref;
  return assertGmRead({
    version: "gm-read.v1",
    frameId: input.frame.frameId,
    turnId: input.frame.turnId,
    path: "clarification",
    situationSummary: "The current player action needs clarification before the GM can interpret it safely.",
    liveSceneQuestion: "What exactly is the player trying to do in the current scene?",
    focalRefs: ["Player"],
    evidenceRefs: uniqueStrings(["Player", sceneRef]),
    actionInterpretation: {
      summary: "The action is not safe to interpret as a concrete world change yet.",
      playerIntent: input.frame.playerAction,
      method: null,
      targetRefs: [],
      interactionKind: "unsupported_or_unclear",
      supportActorNeed: null,
      localConditionNeed: null,
    },
    uncertainty: {
      present: false,
      question: null,
      basis: null,
    },
    interpretationRationale: input.reason,
  });
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
    "Allowed path values: direct, continue, clarification, uncertain, procedural, combat_pressure.",
    "Path is a coarse interpretation signal only. procedural does not authorize a tool or effect. uncertain does not authorize an Oracle roll.",
    "Set actionInterpretation.interactionKind to exactly one of: current_scene_observation, route_inquiry, movement_intent, time_passage, scene_local_beat, visible_actor_dialogue, ordinary_support_actor_needed, player_local_condition, item_transfer, unsupported_or_unclear.",
    "Use visible_actor_dialogue only when the player addresses exactly one already-visible non-player actor from SceneFrame.actors as the speaker. Put that speaker ref in actionInterpretation.targetRefs.",
    "If the player also makes a current-scene Player posture/readiness commitment while addressing a visible actor, keep interactionKind=visible_actor_dialogue and fill localConditionNeed for that bounded posture/readiness part.",
    "Use ordinary_support_actor_needed only when the player needs one ordinary local current-scene role absent from SceneFrame.actors, with roleKind in the schema and supportActorNeed filled. Do not target an invented actor ref.",
    "ordinary_support_actor_needed may cover ordinary local roles like vendor, guard, clerk, dockhand, guide, porter, witness, helper, laborer, courier, attendant, bystander, or crowd voice. It does not authorize dialogue content.",
    "Do not use ordinary_support_actor_needed for named people, key NPCs, faction leaders, secret contacts, remote actors, persistent actors, hidden actors, family members, campaign-critical roles, or broad world creation; use clarification or unsupported_or_unclear instead.",
    "Use player_local_condition only for uncontested first-person current-scene Player posture/readiness such as kneeling, crouched, prone, taking_cover as posture only, keeping_distance, stepped_back, braced, hands_visible, hands_raised, or gripping_held_item for an already-inventory item.",
    "localConditionNeed does not authorize HP, damage, healing, injuries, combat status, NPC conditions, stealth success, cover effectiveness, movement, item custody/location/equip changes, tags, discovery, world facts, relationship, absence, no-change, or dialogue content.",
    "For gripping_held_item, localConditionNeed.targetKind must be inventory_item_readiness and targetRef must be copied from SceneFrame.inventory. For visible_actor_distance, targetRef must be one visible actor ref. For current_scene, targetRef may be null or current scene/location ref.",
    "Use item_transfer only for one uncontested Player item custody/location/equip-state transition: give_to_visible_actor, drop_in_current_scene, pickup_from_current_scene, equip_inventory_item, or unequip_inventory_item.",
    "itemTransferNeed must cite itemRef from SceneFrame.inventory for give/drop/equip/unequip, or from SceneFrame.targets where kind=item for pickup. give_to_visible_actor targetRef must be a visible actor; drop targetRef must be current scene/location; pickup/equip/unequip targetRef must be Player.",
    "item_transfer does not authorize item creation, discovery/search/inspection, item use/activation, damage/repair/consumption, barter/payment, container contents, NPC consent/reaction, stealing/planting, relationship, world facts, route/location/POI truth, HP/condition, dialogue, absence, or no-change.",
    "If the player merely grips, holds ready, keeps, or steadies an already-inventory item without custody/location/equip-state change, use player_local_condition with gripping_held_item, not item_transfer.",
    "If the player transfers an item and also addresses a visible actor, keep interactionKind=visible_actor_dialogue, fill itemTransferNeed for the physical item-state part, and still put exactly one visible speaker ref in actionInterpretation.targetRefs.",
    "Use current_scene_observation with localObservationNeed only for targeted read-only current-scene observation over exposed SceneFrame surfaces: current_scene, current_location, visible_actor, visible_target, inventory_item, visible_fact, or movement_option labels/details.",
    "For broad look/look around/what is visible without a concrete target query, use current_scene_observation without localObservationNeed so the existing observe_visible snapshot can handle it.",
    "For Do I see X here? or a visible surface-entry inspection, fill localObservationNeed with mode=target_match, queryText copied as a concise visible target phrase, surfaceKinds to search, targetRef when an exact exposed ref is already known, and allowBoundedNegative=true only for bounded no-match against those enumerated surfaces.",
    "localObservationNeed does not authorize hidden discovery, concealed search, thorough room search, broad absence, item use/effects, phone or device status/messages, POI/storefront/landmark truth unless already exposed by a SceneFrame surface, route truth beyond route option/check receipts, world facts, mutation, dialogue content, or private facts.",
    "Every focalRefs, evidenceRefs, and actionInterpretation.targetRefs entry must be copied exactly from SceneFrame.citableRefs.",
    "For ordinary_support_actor_needed, supportActorNeed.evidenceRefs must also be copied exactly from SceneFrame.citableRefs, usually Player plus current scene/current location.",
    "For player_local_condition or compound localConditionNeed, localConditionNeed.evidenceRefs and any targetRef must also be copied exactly from SceneFrame.citableRefs.",
    "For item_transfer or compound itemTransferNeed, itemTransferNeed.itemRef, targetRef, and evidenceRefs must also be copied exactly from SceneFrame.citableRefs.",
    "For localObservationNeed, evidenceRefs and any targetRef must also be copied exactly from SceneFrame.citableRefs.",
    "Do not use UUIDs, database ids, backend refs, or private terms.",
    "Forecast is advisory trajectory without player intervention. It cannot authorize mutation or narration claims.",
    "Keep arrays short and omit all fields not defined by the schema.",
  ].join("\n");
}

export function buildGmReadPrompt(frame: AuthoritativeSceneFrame): string {
  return [
    "Interpret the player action against this authoritative SceneFrame.",
    "Return gm-read.v1 JSON. Do not add extra fields.",
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
    schema: gmReadGenerationSchema,
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
    return {
      status: "fallback_clarification",
      read: buildFallbackClarificationGmRead({
        frame: input.frame,
        reason: `GM Read generation failed before validation: ${message.slice(0, 300)}`,
      }),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message,
      }],
      repairAttempted: false,
    };
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
    return {
      status: "fallback_clarification",
      read: buildFallbackClarificationGmRead({
        frame: input.frame,
        reason: "GM Read repair did not satisfy the clean interpretation contract.",
      }),
      issues: [...firstValidation.issues, ...repairValidation.issues],
      repairAttempted: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "fallback_clarification",
      read: buildFallbackClarificationGmRead({
        frame: input.frame,
        reason: `GM Read repair generation failed: ${message.slice(0, 300)}`,
      }),
      issues: [
        ...firstValidation.issues,
        {
          code: "schema_invalid",
          path: "<repair>",
          message,
        },
      ],
      repairAttempted: true,
    };
  }
}
