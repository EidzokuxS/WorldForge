import { randomUUID } from "node:crypto";

import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import { getSqliteConnection } from "../../db/index.js";
import { withSqliteWriteLock } from "../../db/sqlite-write-lock.js";
import {
  hydrateStoredPlayerRecord,
  projectPlayerRecord,
  type PlayerRecordProjection,
} from "../../character/record-adapters.js";
import { refreshInventoryCompatibilityProjectionForActor } from "../../inventory/legacy-migration.js";
import {
  loadLocationGraph,
  resolveTravelPath,
} from "../location-graph.js";
import {
  assertCleanStage4ExecutionResult,
  cleanStage4DeviceSurfaceObservationEffectSchema,
  cleanStage4DialogueRequestEffectSchema,
  cleanStage4ItemTransferEffectSchema,
  cleanStage4LocalObservationEffectSchema,
  cleanStage4LocalConditionSetEffectSchema,
  cleanStage4MinorPoiCreateEffectSchema,
  cleanStage4SupportActorCreateEffectSchema,
  assertCleanStage4Receipt,
  assertCleanStage4Request,
  type AuthoritativeSceneFrame,
  type CleanStage4ExecutionResult,
  type CleanStage4Receipt,
  type CleanStage4Request,
  type GmActionChecklist,
} from "./contracts.js";

type Step = GmActionChecklist["steps"][number];
type SupportActorCreateEffect = Extract<CleanStage4Request["effect"], { kind: "support_actor_create" }>;
type SupportActorRoleKind = SupportActorCreateEffect["roleKind"];
type SupportActorMaterializationResult = NonNullable<CleanStage4Receipt["publicResult"]["supportActor"]>;
type LocalConditionSetEffect = Extract<CleanStage4Request["effect"], { kind: "condition_set" }>;
type PlayerLocalConditionResult = NonNullable<CleanStage4Receipt["publicResult"]["condition"]>;
type ItemTransferEffect = Extract<CleanStage4Request["effect"], { kind: "item_transfer" }>;
type ItemTransferResult = NonNullable<CleanStage4Receipt["publicResult"]["itemTransfer"]>;
type MinorPoiCreateEffect = Extract<CleanStage4Request["effect"], { kind: "minor_poi_create" }>;
type MinorPoiHandleResult = NonNullable<CleanStage4Receipt["publicResult"]["minorPoi"]>;
type LocalObservationEffect = Extract<CleanStage4Request["effect"], { kind: "local_observation" }>;
type LocalObservationResult = NonNullable<CleanStage4Receipt["publicResult"]["localObservation"]>;
type LocalObservationSurfaceKind = LocalObservationEffect["surfaceKinds"][number];
type DeviceSurfaceObservationEffect = Extract<CleanStage4Request["effect"], { kind: "device_surface_observation" }>;
type DeviceSurfaceObservationResult = NonNullable<CleanStage4Receipt["publicResult"]["deviceSurfaceObservation"]>;
type DeviceFacetKind = DeviceSurfaceObservationEffect["facetKinds"][number];
type DeviceSurfaceFacet = NonNullable<AuthoritativeSceneFrame["deviceStatusSurfaces"]>[number]["facets"][number];
type LocalObservationSurfaceEntry = {
  surfaceKind: LocalObservationSurfaceKind;
  ref: string;
  label: string;
  detail: string | null;
};

type PlayerRow = {
  id: string;
  campaign_id: string;
  name: string;
  race: string;
  gender: string;
  age: string;
  appearance: string;
  hp: number;
  character_record: string;
  derived_tags: string;
  tags: string;
  equipped_items: string;
  current_location_id: string | null;
  current_scene_location_id: string | null;
};

type ClockRow = {
  world_version: number;
  world_time_minutes: number;
  current_tick: number;
};

type LocationRow = {
  id: string;
  name: string;
  parent_location_id: string | null;
};

type NpcSupportRow = {
  id: string;
  name: string;
  persona: string;
  tags: string;
  derived_tags: string;
  tier: "temporary" | "persistent" | "key";
  current_location_id: string | null;
  current_scene_location_id: string | null;
};

type CleanActorConditionRow = {
  condition_id: string;
  condition_key: LocalConditionSetEffect["conditionKey"];
  condition_label: string;
  condition_group: string;
  target_kind: LocalConditionSetEffect["target"]["targetKind"];
  target_ref: string | null;
  active: number;
};

type ItemRow = {
  id: string;
  name: string;
  tags: string;
  owner_id: string | null;
  location_id: string | null;
  equip_state: "carried" | "equipped";
  equipped_slot: string | null;
  is_signature: number;
};

type CleanMinorPoiRow = {
  poi_id: string;
  poi_ref: string;
  poi_label: string;
  poi_kind: MinorPoiCreateEffect["placeKind"];
  active: number;
};

export interface CleanStage4ReceiptStore {
  insert(receipt: CleanStage4Receipt, createdAt?: number): void;
}

export interface Stage4ExecutionEvent {
  type: "state_update";
  data: {
    type: "location_change";
    locationName: string;
    travelCost: number;
    path: string[];
  } | {
    type: "time_advance";
    elapsedMinutes: number;
    reasonKind: "brief_local_action" | "wait" | "short_rest";
  } | PlayerLocalConditionResult | ItemTransferResult;
}

export interface CleanStage4ExecutionRunResult {
  status: "executed" | "skipped";
  execution: CleanStage4ExecutionResult | null;
  publicEvents: Stage4ExecutionEvent[];
}

export interface Stage4FrameRefreshRequest {
  initialFrame: AuthoritativeSceneFrame;
  currentFrame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: GmActionChecklist["steps"][number];
  receipt: CleanStage4Receipt;
}

export type Stage4FrameRefresh = (request: Stage4FrameRefreshRequest) => Promise<AuthoritativeSceneFrame>;

type MaterializedSpeakerBinding = NonNullable<Step["dependencyBindings"]>[number];
type PlayerLocalConditionBinding = NonNullable<Step["dependencyBindings"]>[number];
type ItemTransferBinding = NonNullable<Step["dependencyBindings"]>[number];
type MinorPoiHandleBinding = NonNullable<Step["dependencyBindings"]>[number];

type Stage4MaterializedSpeakerResolution = {
  bindingId: "materialized_speaker";
  fromStepId: string;
  receiptId: string;
  actorRef: string;
  actorLabel: string;
  refreshedFrameId: string;
};

type Stage4PlayerLocalConditionResolution = {
  bindingId: "player_local_condition";
  fromStepId: string;
  receiptId: string;
  conditionKey: LocalConditionSetEffect["conditionKey"];
  conditionLabel: string;
  resultKind: PlayerLocalConditionResult["resultKind"];
  refreshedFrameId: string;
};

type Stage4ItemTransferResolution = {
  bindingId: "item_transfer_state";
  fromStepId: string;
  receiptId: string;
  resultKind: ItemTransferResult["resultKind"];
  itemLabel: string;
  refreshedFrameId: string;
};

type Stage4MinorPoiHandleResolution = {
  bindingId: "minor_poi_handle";
  fromStepId: string;
  receiptId: string;
  poiRef: string;
  poiLabel: string;
  resultKind: MinorPoiHandleResult["resultKind"];
  refreshedFrameId: string;
};

type Stage4DialogueDependencyResolution = {
  materializedSpeaker: Stage4MaterializedSpeakerResolution | null;
  playerLocalCondition: Stage4PlayerLocalConditionResolution | null;
  itemTransfer: Stage4ItemTransferResolution | null;
  minorPoi: Stage4MinorPoiHandleResolution | null;
};

export interface Stage4DialogueRequestCandidateRequest {
  system: string;
  prompt: string;
  repairOf?: {
    candidate: unknown;
    issues: Stage4DialogueRequestValidationIssue[];
  };
}

export type Stage4DialogueRequestGenerator =
  (request: Stage4DialogueRequestCandidateRequest) => Promise<unknown>;

export interface Stage4DialogueRequestValidationIssue {
  code:
    | "backend_ref"
    | "private_term"
    | "schema_invalid"
    | "speaker_invalid"
    | "uncited_ref"
    | "unplanned_ref";
  path: string;
  message: string;
}

export interface Stage4SupportActorRequestCandidateRequest {
  system: string;
  prompt: string;
  repairOf?: {
    candidate: unknown;
    issues: Stage4SupportActorRequestValidationIssue[];
  };
}

export type Stage4SupportActorRequestGenerator =
  (request: Stage4SupportActorRequestCandidateRequest) => Promise<unknown>;

export interface Stage4SupportActorRequestValidationIssue {
  code:
    | "anchor_invalid"
    | "backend_ref"
    | "private_term"
    | "plan_mismatch"
    | "role_collision"
    | "schema_invalid"
    | "uncited_ref"
    | "unplanned_ref";
  path: string;
  message: string;
}

export const sqliteCleanStage4ReceiptStore: CleanStage4ReceiptStore = {
  insert(receipt, createdAt = Date.now()) {
    getSqliteConnection()
      .prepare(`
        INSERT INTO clean_gameplay_stage4_receipts (
          receipt_id,
          campaign_id,
          turn_id,
          frame_id,
          checklist_id,
          step_id,
          capability_id,
          status,
          base_world_version,
          result_world_version,
          mutation_applied,
          receipt_json,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        receipt.receiptId,
        receipt.campaignId,
        receipt.turnId,
        receipt.frameId,
        receipt.checklistId,
        receipt.stepId,
        receipt.capabilityId,
        receipt.status,
        receipt.base.worldVersion,
        receipt.result.worldVersion,
        receipt.result.mutationApplied ? 1 : 0,
        JSON.stringify(receipt),
        createdAt,
      );
  },
};

function destinationOption(frame: AuthoritativeSceneFrame, ref: string) {
  return frame.movementOptions.find((option) =>
    option.ref.trim().toLowerCase() === ref.trim().toLowerCase()
    || option.label.trim().toLowerCase() === ref.trim().toLowerCase()
  ) ?? null;
}

function locationByLabel(frame: AuthoritativeSceneFrame, label: string): LocationRow | null {
  const graph = loadLocationGraph({ campaignId: frame.campaignId });
  const normalized = label.trim().toLowerCase();
  const matches = graph.locations.filter((location) =>
    location.name.trim().toLowerCase() === normalized
  );
  if (matches.length !== 1) return null;
  const parentRow = getSqliteConnection()
    .prepare(`
      SELECT parent_location_id AS parentLocationId
      FROM locations
      WHERE campaign_id = ? AND id = ?
    `)
    .get(frame.campaignId, matches[0].id) as { parentLocationId: string | null } | undefined;
  return {
    id: matches[0].id,
    name: matches[0].name,
    parent_location_id: parentRow?.parentLocationId ?? null,
  };
}

function readPlayer(frame: AuthoritativeSceneFrame): PlayerRow | null {
  return getSqliteConnection()
    .prepare(`
      SELECT
        id,
        campaign_id,
        name,
        race,
        gender,
        age,
        appearance,
        hp,
        character_record,
        derived_tags,
        tags,
        equipped_items,
        current_location_id,
        current_scene_location_id
      FROM players
      WHERE campaign_id = ?
      LIMIT 1
    `)
    .get(frame.campaignId) as PlayerRow | undefined ?? null;
}

function readClock(campaignId: string): ClockRow {
  const row = getSqliteConnection()
    .prepare(`
      SELECT world_version, world_time_minutes, current_tick
      FROM world_clocks
      WHERE campaign_id = ?
      LIMIT 1
    `)
    .get(campaignId) as ClockRow | undefined;
  return row ?? { world_version: 0, world_time_minutes: 0, current_tick: 0 };
}

function publicPathLabels(locationIds: readonly string[], locations: readonly { id: string; name: string }[]): string[] {
  const byId = new Map(locations.map((location) => [location.id, location.name]));
  return locationIds.map((id) => byId.get(id)).filter((label): label is string => Boolean(label));
}

function requestForStep(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  requiredRouteReceiptId: string | null;
}): CleanStage4Request {
  const destinationRef = input.step.targetRefs[0] ?? "";
  const kind = input.step.intended.kind;
  const capabilityId = cleanStage4CapabilityForKind(kind);
  return assertCleanStage4Request({
    version: "gameplay-runtime.stage4-request.v1",
    requestId: `stage4-request-${randomUUID()}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: input.checklist.checklistId,
      checklistStepId: input.step.stepId,
    },
    base: input.frame.base,
    author: "backend_from_checklist",
    modelAuthored: false,
    capabilityId,
    effect: requestEffectForStep({
      frame: input.frame,
      step: input.step,
      capabilityId,
      destinationRef,
      requiredRouteReceiptId: input.requiredRouteReceiptId,
    }),
  });
}

function cleanStage4CapabilityForKind(kind: Step["intended"]["kind"]): CleanStage4Receipt["capabilityId"] {
  if (kind === "observe_visible") return "observe_visible";
  if (kind === "local_observation") return "local_observation";
  if (kind === "device_surface_observation") return "device_surface_observation";
  if (kind === "route_options") return "route_options";
  if (kind === "route_check") return "route_check";
  if (kind === "movement") return "movement";
  if (kind === "dialogue_record") return "dialogue_record";
  if (kind === "support_actor_create") return "support_actor_create";
  if (kind === "item_transfer") return "item_transfer";
  if (kind === "minor_poi_create") return "minor_poi_create";
  if (kind === "condition_set") return "condition_set";
  if (kind === "time_advance") return "time_advance";
  if (kind === "scene_beat_record") return "scene_beat_record";
  return "scene_beat_record";
}

function requestEffectForStep(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  capabilityId: CleanStage4Receipt["capabilityId"];
  destinationRef: string;
  requiredRouteReceiptId: string | null;
}): CleanStage4Request["effect"] {
  if (input.capabilityId === "observe_visible") {
    return {
      kind: "observe_visible",
      actorRef: "Player",
      scope: "current_scene",
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "local_observation") {
    const plan = input.step.intended.localObservationPlan;
    return {
      kind: "local_observation",
      authorityKind: "current_scene_observation_surface",
      actorRef: "Player",
      anchorRef: plan?.anchorRef ?? input.frame.scene.currentScene.ref,
      mode: plan?.mode ?? "target_match",
      queryText: plan?.queryText ?? input.frame.scene.currentScene.label,
      targetRef: plan?.targetRef ?? null,
      surfaceKinds: plan?.surfaceKinds ?? ["current_scene", "current_location", "visible_actor", "visible_target", "inventory_item", "visible_fact"],
      allowBoundedNegative: plan?.allowBoundedNegative ?? false,
      evidenceRefs: input.step.evidenceRefs,
      forbiddenPayloads: {
        hiddenDiscovery: false,
        concealedSearch: false,
        broadAbsence: false,
        itemUseOrActivation: false,
        itemStateChange: false,
        phoneOrDeviceStatus: false,
        routeTruth: false,
        locationReveal: false,
        worldFact: false,
        dialogueContent: false,
        privateKnowledge: false,
        mutation: false,
      },
    };
  }
  if (input.capabilityId === "device_surface_observation") {
    const plan = input.step.intended.deviceObservationPlan;
    return {
      kind: "device_surface_observation",
      authorityKind: "current_frame_device_status_surface",
      actorRef: "Player",
      anchorRef: plan?.anchorRef ?? input.frame.scene.currentScene.ref,
      deviceRef: plan?.deviceRef ?? input.destinationRef,
      requestedDeviceText: plan?.requestedDeviceText ?? input.destinationRef,
      requestedFacetText: plan?.requestedFacetText ?? "device surface",
      facetKinds: plan?.facetKinds ?? ["screen_state"],
      allowNoSurface: plan?.allowNoSurface ?? false,
      evidenceRefs: input.step.evidenceRefs,
      forbiddenPayloads: {
        privateMessageContents: false,
        messageOrCallGeneration: false,
        networkSimulation: false,
        hackingOrDecryption: false,
        itemUseOrActivation: false,
        itemStateChange: false,
        routeTruth: false,
        locationReveal: false,
        worldFact: false,
        dialogueContent: false,
        privateKnowledge: false,
        mutation: false,
        absenceOrNoChange: false,
      },
    };
  }
  if (input.capabilityId === "route_options") {
    return {
      kind: "route_options",
      actorRef: "Player",
      fromRef: input.frame.scene.currentLocation.ref,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "route_check") {
    return {
      kind: "route_check",
      actorRef: "Player",
      destinationRef: input.destinationRef,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "movement") {
    return {
      kind: "movement",
      actorRef: "Player",
      destinationRef: input.destinationRef,
      travelMode: "walk",
      requiredRouteReceiptId: input.requiredRouteReceiptId,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "time_advance") {
    const plan = input.step.intended.timeAdvancePlan;
    if (!plan) {
      throw new Error("time_advance Stage4 request requires checklist intended.timeAdvancePlan.");
    }
    return {
      kind: "time_advance",
      actorRef: "Player",
      sceneRef: plan.sceneRef,
      elapsedMinutes: plan.elapsedMinutes,
      reasonKind: plan.reasonKind,
      evidenceRefs: input.step.evidenceRefs,
    };
  }
  if (input.capabilityId === "condition_set") {
    const plan = input.step.intended.localConditionPlan;
    return {
      kind: "condition_set",
      authorityKind: "current_scene_player_local_condition",
      actorRef: "Player",
      conditionScope: "current_scene",
      anchorRef: plan?.anchorRef ?? input.frame.scene.currentScene.ref,
      operation: plan?.operation ?? "apply",
      conditionKey: plan?.conditionKey ?? "braced",
      target: {
        targetKind: plan?.targetKind ?? "current_scene",
        targetRef: plan?.targetRef ?? input.frame.scene.currentScene.ref,
      },
      replacementPolicy: plan?.replacementPolicy ?? "no_replacement",
      evidenceRefs: input.step.evidenceRefs,
      forbiddenPayloads: {
        hpDelta: false,
        damage: false,
        healing: false,
        combatModifier: false,
        stealthSuccess: false,
        coverEffectiveness: false,
        itemCustody: false,
        itemLocation: false,
        itemEquipState: false,
        itemMutation: false,
        movement: false,
        routeTruth: false,
        worldFact: false,
        relationship: false,
        dialogueContent: false,
        npcCondition: false,
        privateKnowledge: false,
        absenceOrNoChange: false,
      },
    };
  }
  if (input.capabilityId === "item_transfer") {
    const plan = input.step.intended.itemTransferPlan;
    const operation = plan?.operation ?? "drop_in_current_scene";
    const sourceKind = plan?.sourceKind ?? "player_inventory";
    const targetKind = plan?.targetKind ?? "current_scene";
    return {
      kind: "item_transfer",
      authorityKind: "player_current_scene_item_state_transition",
      actorRef: "Player",
      operation,
      itemRef: plan?.itemRef ?? input.destinationRef,
      source: {
        sourceKind,
        requiredOwner: sourceKind === "player_inventory" ? "Player" : "none",
        requiredLocation: sourceKind === "current_scene_item" ? "current_scene" : "none",
        requiredEquipState: operation === "unequip_inventory_item" ? "equipped" : null,
      },
      target: {
        targetKind,
        targetRef: plan?.targetRef ?? input.frame.scene.currentScene.ref,
        targetEquipState: plan?.targetEquipState ?? "carried",
        targetEquippedSlot: plan?.targetEquippedSlot ?? null,
      },
      anchorRef: plan?.anchorRef ?? input.frame.scene.currentScene.ref,
      evidenceRefs: input.step.evidenceRefs,
      forbiddenPayloads: {
        itemCreation: false,
        itemDiscovery: false,
        itemInspection: false,
        itemUseOrActivation: false,
        itemDamageOrRepair: false,
        containerContents: false,
        currencyOrBarter: false,
        npcConsentOrReaction: false,
        relationship: false,
        worldFact: false,
        routeTruth: false,
        locationReveal: false,
        hpOrCondition: false,
        dialogueContent: false,
        privateKnowledge: false,
        absenceOrNoChange: false,
      },
    };
  }
  if (input.capabilityId === "minor_poi_create") {
    const plan = input.step.intended.minorPoiPlan;
    return {
      kind: "minor_poi_create",
      authorityKind: "current_scene_visible_place_handle_create",
      actorRef: "Player",
      anchorRef: plan?.anchorRef ?? input.frame.scene.currentScene.ref,
      placeLabel: plan?.placeLabel ?? input.destinationRef,
      placeKind: plan?.placeKind ?? "other_place",
      reusePolicy: "reuse_matching_current_scene_place_handle_or_create",
      evidenceRefs: input.step.evidenceRefs,
      forbiddenPayloads: {
        actorCreation: false,
        servicesOrInventory: false,
        routeTruth: false,
        locationReveal: false,
        movementDestination: false,
        businessFact: false,
        readableText: false,
        hiddenDiscovery: false,
        absenceOrNoChange: false,
        dialogueContent: false,
        worldFact: false,
        privateKnowledge: false,
      },
    };
  }
  return {
    kind: "scene_beat_record",
    actorRef: "Player",
    sceneRef: input.frame.scene.currentScene.ref,
    targetRefs: input.step.targetRefs,
    beatKind: "generic_scene_beat",
    evidenceRefs: input.step.evidenceRefs,
  };
}

function baseReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  status: CleanStage4Receipt["status"];
  capabilityId: CleanStage4Receipt["capabilityId"];
  summary: string;
  visibleRefs: string[];
  routeStatus?: "connected" | "disconnected" | null;
  routeOptions?: CleanStage4Receipt["publicResult"]["routeOptions"];
  locationChange?: CleanStage4Receipt["publicResult"]["locationChange"];
  timeAdvance?: CleanStage4Receipt["publicResult"]["timeAdvance"];
  visibleObservation?: CleanStage4Receipt["publicResult"]["visibleObservation"];
  localObservation?: CleanStage4Receipt["publicResult"]["localObservation"];
  sceneBeat?: CleanStage4Receipt["publicResult"]["sceneBeat"];
  dialogue?: CleanStage4Receipt["publicResult"]["dialogue"];
  supportActor?: CleanStage4Receipt["publicResult"]["supportActor"];
  condition?: CleanStage4Receipt["publicResult"]["condition"];
  resultWorldVersion?: number;
  resultWorldTimeMinutes?: number;
  resultTick?: number;
  mutationApplied?: boolean;
  authorityTraceId?: string | null;
  clockReceiptId?: string | null;
  playerId?: string | null;
  fromLocationId?: string | null;
  destinationLocationId?: string | null;
  supportActorId?: string | null;
  supportActorOperation?: "inserted" | "reused" | null;
  conditionId?: string | null;
  conditionOperation?: "applied" | "cleared" | "replaced" | "already_present" | null;
  previousConditionKeys?: LocalConditionSetEffect["conditionKey"][];
  nextConditionKeys?: LocalConditionSetEffect["conditionKey"][];
  anchorLocationId?: string | null;
  anchorSceneLocationId?: string | null;
  edgeIds?: string[];
  stateDeltaRefs?: string[];
  failure?: CleanStage4Receipt["failure"];
}): CleanStage4Receipt {
  const accepted = input.status === "accepted";
  const movementAccepted = accepted && input.capabilityId === "movement";
  const timeAccepted = accepted && input.capabilityId === "time_advance";
  const observationAccepted = accepted && input.capabilityId === "observe_visible";
  const localObservationAccepted = accepted && input.capabilityId === "local_observation";
  const routeOptionsAccepted = accepted && input.capabilityId === "route_options";
  const sceneBeatAccepted = accepted && input.capabilityId === "scene_beat_record";
  const dialogueAccepted = accepted && input.capabilityId === "dialogue_record";
  const supportActorAccepted = accepted && input.capabilityId === "support_actor_create";
  const supportActorCreated = supportActorAccepted && input.supportActor?.resultKind === "created";
  const conditionAccepted = accepted && input.capabilityId === "condition_set";
  const conditionMutated = conditionAccepted && input.condition?.resultKind !== "already_present";
  return assertCleanStage4Receipt({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: `stage4-receipt-${randomUUID()}`,
    requestId: input.request.requestId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    capabilityId: input.capabilityId,
    status: input.status,
    source: input.request.source,
    base: input.frame.base,
    result: {
      tick: input.resultTick ?? input.frame.base.tick,
      worldVersion: input.resultWorldVersion ?? input.frame.base.worldVersion,
      worldTimeMinutes: input.resultWorldTimeMinutes ?? input.frame.base.worldTimeMinutes,
      mutationApplied: input.mutationApplied ?? false,
    },
    authority: {
      evidenceAuthority: movementAccepted
        ? "terminal_mutation_receipt"
        : timeAccepted
          ? "terminal_mutation_receipt"
          : observationAccepted
            ? "scene_observation_receipt"
            : localObservationAccepted
              ? "local_observation_receipt"
              : routeOptionsAccepted
                ? "route_options_receipt"
                : accepted && input.capabilityId === "route_check"
                  ? "route_check_receipt"
                  : sceneBeatAccepted
                    ? "scene_beat_receipt"
                    : dialogueAccepted
                      ? "terminal_dialogue_receipt"
                      : supportActorAccepted
                        ? "support_actor_materialization_receipt"
                        : conditionAccepted
                          ? "player_local_condition_receipt"
                    : input.status === "skipped"
                      ? "skip_receipt"
                      : "failure_receipt",
      mutationAuthority: movementAccepted
        ? "player_location_and_world_clock"
        : timeAccepted
          ? "world_clock_only"
          : supportActorCreated
            ? "current_scene_support_actor"
            : conditionMutated
              ? "player_local_condition_state"
            : "none",
      visibleResultAuthority: movementAccepted
        ? "may_claim_player_location_change"
        : timeAccepted
          ? "may_claim_elapsed_time"
          : observationAccepted
            ? "may_describe_visible_snapshot"
            : localObservationAccepted
              ? "may_claim_local_observation"
              : routeOptionsAccepted
                ? "may_list_route_options"
                : accepted && input.capabilityId === "route_check"
                  ? "may_explain_route_status"
                  : sceneBeatAccepted
                    ? "may_acknowledge_scene_beat"
                    : dialogueAccepted
                      ? "may_quote_visible_dialogue_response"
                      : supportActorAccepted
                        ? "may_claim_visible_support_actor_materialized"
                        : conditionAccepted
                          ? "may_claim_player_local_condition"
                    : input.status === "failed"
                      ? "failure_only"
                      : "none",
      maySupportNarrationClaim: accepted,
      mayAuthorizeMutation: movementAccepted || timeAccepted || supportActorCreated || conditionMutated,
    },
    publicResult: {
      summary: input.summary,
      visibleRefs: input.visibleRefs,
      routeStatus: input.routeStatus ?? null,
      routeOptions: input.routeOptions ?? null,
      locationChange: input.locationChange ?? null,
      timeAdvance: input.timeAdvance ?? null,
      visibleObservation: input.visibleObservation ?? null,
      localObservation: input.localObservation ?? null,
      sceneBeat: input.sceneBeat ?? null,
      dialogue: input.dialogue ?? null,
      supportActor: input.supportActor ?? null,
      condition: input.condition ?? null,
    },
    privateResult: {
      playerId: input.playerId ?? null,
      fromLocationId: input.fromLocationId ?? null,
      destinationLocationId: input.destinationLocationId ?? null,
      supportActorId: input.supportActorId ?? null,
      supportActorOperation: input.supportActorOperation ?? null,
      conditionId: input.conditionId ?? null,
      conditionOperation: input.conditionOperation ?? null,
      previousConditionKeys: input.previousConditionKeys ?? [],
      nextConditionKeys: input.nextConditionKeys ?? [],
      anchorLocationId: input.anchorLocationId ?? null,
      anchorSceneLocationId: input.anchorSceneLocationId ?? null,
      edgeIds: input.edgeIds ?? [],
      authorityTraceId: input.authorityTraceId ?? null,
      clockReceiptId: input.clockReceiptId ?? null,
      stateDeltaRefs: input.stateDeltaRefs ?? [],
    },
    failure: input.failure ?? null,
  });
}

function failReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  capabilityId: CleanStage4Receipt["capabilityId"];
  kind: NonNullable<CleanStage4Receipt["failure"]>["kind"];
  message: string;
}): CleanStage4Receipt {
  return baseReceipt({
    ...input,
    status: "failed",
    summary: input.message,
    visibleRefs: ["Player", ...(input.step.targetRefs.slice(0, 1))],
    failure: {
      kind: input.kind,
      message: input.message,
      hiddenMutationApplied: false,
    },
  });
}

function skipReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  capabilityId: CleanStage4Receipt["capabilityId"];
  kind: NonNullable<CleanStage4Receipt["failure"]>["kind"];
  message: string;
}): CleanStage4Receipt {
  return baseReceipt({
    ...input,
    status: "skipped",
    summary: input.message,
    visibleRefs: ["Player", ...(input.step.targetRefs.slice(0, 1))],
    failure: {
      kind: input.kind,
      message: input.message,
      hiddenMutationApplied: false,
    },
  });
}

function validateFrameAndClock(input: {
  frame: AuthoritativeSceneFrame;
  player: PlayerRow | null;
  clock: ClockRow;
}): { ok: true } | { ok: false; message: string } {
  if (!input.player) {
    return { ok: false, message: "Player row is unavailable for Stage 4 execution." };
  }
  if (
    input.clock.world_version !== input.frame.base.worldVersion
    || input.clock.world_time_minutes !== input.frame.base.worldTimeMinutes
  ) {
    return { ok: false, message: "Stage 4 frame clock is stale." };
  }
  const current = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
  if (!current || input.player.current_location_id !== current.id) {
    return { ok: false, message: "Stage 4 player location no longer matches the SceneFrame." };
  }
  return { ok: true };
}

function labelForRef(frame: AuthoritativeSceneFrame, ref: string): string {
  if (ref === frame.player.ref) return frame.player.label;
  const actor = frame.actors.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (actor) return actor.label;
  const target = frame.targets.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (target) return target.label;
  const route = frame.movementOptions.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (route) return route.label;
  const item = frame.inventory.find((entry) => entry.ref.toLowerCase() === ref.toLowerCase());
  if (item) return item.label;
  if (ref.toLowerCase() === frame.scene.currentScene.ref.toLowerCase()) return frame.scene.currentScene.label;
  if (ref.toLowerCase() === frame.scene.currentLocation.ref.toLowerCase()) return frame.scene.currentLocation.label;
  return ref;
}

function localConditionLabel(key: LocalConditionSetEffect["conditionKey"]): string {
  const labels: Record<LocalConditionSetEffect["conditionKey"], string> = {
    kneeling: "kneeling",
    crouched: "crouched",
    prone: "prone",
    taking_cover: "taking cover",
    keeping_distance: "keeping distance",
    stepped_back: "stepped back",
    braced: "braced",
    hands_visible: "hands visible",
    hands_raised: "hands raised",
    gripping_held_item: "gripping held item",
  };
  return labels[key];
}

function localConditionGroup(key: LocalConditionSetEffect["conditionKey"]): string {
  if (["kneeling", "crouched", "prone", "taking_cover", "stepped_back"].includes(key)) {
    return "player_local_posture";
  }
  if (key === "keeping_distance") return "player_local_distance";
  if (["hands_visible", "hands_raised", "gripping_held_item"].includes(key)) {
    return "player_local_hands";
  }
  return "player_local_readiness";
}

function conditionTargetIsValid(input: {
  frame: AuthoritativeSceneFrame;
  effect: LocalConditionSetEffect;
}): { ok: true; targetLabel: string | null } | { ok: false; message: string } {
  const targetRef = input.effect.target.targetRef;
  if (input.effect.anchorRef.toLowerCase() !== input.frame.scene.currentScene.ref.toLowerCase()) {
    return { ok: false, message: "Stage 4 condition_set anchor must be the current SceneFrame scene." };
  }
  if (input.effect.conditionKey === "gripping_held_item" && input.effect.target.targetKind !== "inventory_item_readiness") {
    return { ok: false, message: "gripping_held_item requires an already-held inventory item target." };
  }
  if (input.effect.target.targetKind === "inventory_item_readiness") {
    const item = targetRef
      ? input.frame.inventory.find((entry) => normalizedRef(entry.ref) === normalizedRef(targetRef))
      : null;
    return item
      ? { ok: true, targetLabel: item.label }
      : { ok: false, message: "Stage 4 condition_set inventory target is not visible in SceneFrame.inventory." };
  }
  if (input.effect.target.targetKind === "visible_actor_distance") {
    const actor = targetRef
      ? input.frame.actors.find((entry) => normalizedRef(entry.ref) === normalizedRef(targetRef))
      : null;
    return actor
      ? { ok: true, targetLabel: actor.label }
      : { ok: false, message: "Stage 4 condition_set distance target is not a visible SceneFrame actor." };
  }
  if (input.effect.target.targetKind === "visible_scene_anchor") {
    if (!targetRef) return { ok: false, message: "Stage 4 condition_set visible scene anchor requires a citable target." };
    return { ok: true, targetLabel: labelForRef(input.frame, targetRef) };
  }
  if (targetRef && ![
    input.frame.scene.currentScene.ref,
    input.frame.scene.currentLocation.ref,
  ].some((ref) => normalizedRef(ref) === normalizedRef(targetRef))) {
    return { ok: false, message: "Stage 4 condition_set current_scene target must be the current scene/location or null." };
  }
  return { ok: true, targetLabel: targetRef ? labelForRef(input.frame, targetRef) : null };
}

function localConditionResult(input: {
  frame: AuthoritativeSceneFrame;
  effect: LocalConditionSetEffect;
  resultKind: PlayerLocalConditionResult["resultKind"];
  targetLabel: string | null;
}): PlayerLocalConditionResult {
  return {
    type: "player_local_condition",
    resultKind: input.resultKind,
    actorLabel: "Player",
    operation: input.effect.operation,
    conditionKey: input.effect.conditionKey,
    conditionLabel: localConditionLabel(input.effect.conditionKey),
    conditionScope: "current_scene",
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    targetKind: input.effect.target.targetKind,
    targetLabel: input.targetLabel,
    claimStatus: "visible_player_local_condition_only",
  };
}

function activeLocalConditionRows(input: {
  campaignId: string;
  playerId: string;
  currentSceneLocationId: string;
}): CleanActorConditionRow[] {
  return getSqliteConnection()
    .prepare(`
      SELECT
        condition_id,
        condition_key,
        condition_label,
        condition_group,
        target_kind,
        target_ref,
        active
      FROM clean_gameplay_actor_conditions
      WHERE campaign_id = ?
        AND actor_type = 'player'
        AND player_id = ?
        AND condition_scope = 'current_scene'
        AND anchor_scene_location_id = ?
        AND active = 1
      ORDER BY created_at ASC, condition_id ASC
    `)
    .all(input.campaignId, input.playerId, input.currentSceneLocationId) as CleanActorConditionRow[];
}

function conditionKeysAfter(input: {
  activeRows: readonly CleanActorConditionRow[];
  clearedConditionIds: readonly string[];
  appliedConditionKey?: LocalConditionSetEffect["conditionKey"] | null;
}): LocalConditionSetEffect["conditionKey"][] {
  const cleared = new Set(input.clearedConditionIds);
  return uniqueStrings([
    ...input.activeRows
      .filter((row) => !cleared.has(row.condition_id))
      .map((row) => row.condition_key),
    ...(input.appliedConditionKey ? [input.appliedConditionKey] : []),
  ]) as LocalConditionSetEffect["conditionKey"][];
}

function itemRowsForCampaign(campaignId: string): ItemRow[] {
  return getSqliteConnection()
    .prepare(`
      SELECT
        id,
        name,
        tags,
        owner_id,
        location_id,
        equip_state,
        equipped_slot,
        is_signature
      FROM items
      WHERE campaign_id = ?
    `)
    .all(campaignId) as ItemRow[];
}

function itemByVisibleLabel(input: {
  rows: readonly ItemRow[];
  label: string;
  sourceKind: ItemTransferEffect["source"]["sourceKind"];
  playerId: string;
  currentSceneLocationId: string;
}): { ok: true; row: ItemRow } | { ok: false; kind: NonNullable<CleanStage4Receipt["failure"]>["kind"]; message: string } {
  const normalized = normalizedRef(input.label);
  const labelMatches = input.rows.filter((row) => normalizedRef(row.name) === normalized);
  const matches = labelMatches.filter((row) => {
    if (input.sourceKind === "player_inventory") return row.owner_id === input.playerId;
    return row.owner_id === null && row.location_id === input.currentSceneLocationId;
  });
  if (matches.length === 1) return { ok: true, row: matches[0] };
  if (matches.length > 1) {
    return {
      ok: false,
      kind: "missing_or_ambiguous_item",
      message: "Stage 4 item_transfer could not resolve exactly one item from the accepted SceneFrame evidence.",
    };
  }
  if (labelMatches.length > 0) {
    return {
      ok: false,
      kind: "source_state_mismatch",
      message: "Stage 4 item_transfer found an item label, but its current owner/location does not match the accepted request source.",
    };
  }
  return {
    ok: false,
    kind: "missing_or_ambiguous_item",
    message: "Stage 4 item_transfer could not resolve exactly one item from the accepted SceneFrame evidence.",
  };
}

function visibleActorTarget(input: {
  frame: AuthoritativeSceneFrame;
  targetRef: string;
  currentLocationId: string;
  currentSceneLocationId: string;
}): { ok: true; actorLabel: string; npcId: string } | { ok: false; message: string } {
  const actor = input.frame.actors.find((entry) =>
    entry.role !== "player" && normalizedRef(entry.ref) === normalizedRef(input.targetRef)
  );
  if (!actor) {
    return { ok: false, message: "Stage 4 item_transfer target actor is not visible in the SceneFrame." };
  }
  const rows = getSqliteConnection()
    .prepare(`
      SELECT id, name, current_location_id, current_scene_location_id
      FROM npcs
      WHERE campaign_id = ?
        AND name = ?
    `)
    .all(input.frame.campaignId, actor.label) as Array<{
      id: string;
      name: string;
      current_location_id: string | null;
      current_scene_location_id: string | null;
    }>;
  const currentRows = rows.filter((row) => {
    if (row.current_scene_location_id === input.currentSceneLocationId) return true;
    return input.currentLocationId === input.currentSceneLocationId
      && row.current_location_id === input.currentLocationId
      && row.current_scene_location_id === null;
  });
  if (currentRows.length !== 1) {
    return { ok: false, message: "Stage 4 item_transfer could not resolve exactly one visible actor target row." };
  }
  return { ok: true, actorLabel: actor.label, npcId: currentRows[0].id };
}

function itemTransferResultKind(operation: ItemTransferEffect["operation"]): Exclude<ItemTransferResult["resultKind"], "already_satisfied"> {
  if (operation === "give_to_visible_actor") return "transferred_to_actor";
  if (operation === "drop_in_current_scene") return "dropped_in_scene";
  if (operation === "pickup_from_current_scene") return "picked_up";
  if (operation === "equip_inventory_item") return "equipped";
  return "unequipped";
}

function itemTransferReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  receiptId?: string;
  itemTransfer: ItemTransferResult;
  resultWorldVersion?: number;
  mutationApplied: boolean;
  authorityTraceId?: string | null;
  playerId: string;
  itemId: string;
  previousOwnerId: string | null;
  nextOwnerId: string | null;
  previousLocationId: string | null;
  nextLocationId: string | null;
  previousEquipState: "carried" | "equipped";
  nextEquipState: "carried" | "equipped";
  previousEquippedSlot: string | null;
  nextEquippedSlot: string | null;
  anchorLocationId: string;
  anchorSceneLocationId: string;
  stateDeltaRefs?: string[];
}): CleanStage4Receipt {
  const mutating = input.mutationApplied;
  return assertCleanStage4Receipt({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: input.receiptId ?? `stage4-receipt-${randomUUID()}`,
    requestId: input.request.requestId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    capabilityId: "item_transfer",
    status: "accepted",
    source: input.request.source,
    base: input.frame.base,
    result: {
      tick: input.frame.base.tick,
      worldVersion: input.resultWorldVersion ?? input.frame.base.worldVersion,
      worldTimeMinutes: input.frame.base.worldTimeMinutes,
      mutationApplied: mutating,
    },
    authority: {
      evidenceAuthority: "item_transfer_receipt",
      mutationAuthority: mutating ? "item_custody_location_equip_state" : "none",
      visibleResultAuthority: "may_claim_item_state_change",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: mutating,
    },
    publicResult: {
      summary: mutating
        ? `${input.itemTransfer.itemLabel} item state is settled: ${input.itemTransfer.resultKind}.`
        : `${input.itemTransfer.itemLabel} is already in the requested item state.`,
      visibleRefs: uniqueStrings([
        "Player",
        input.frame.scene.currentScene.ref,
        input.itemTransfer.itemLabel,
        input.itemTransfer.targetLabel,
      ]).slice(0, 12),
      routeStatus: null,
      routeOptions: null,
      locationChange: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
      dialogue: null,
      itemTransfer: input.itemTransfer,
    },
    privateResult: {
      playerId: input.playerId,
      fromLocationId: null,
      destinationLocationId: null,
      edgeIds: [],
      authorityTraceId: input.authorityTraceId ?? null,
      clockReceiptId: null,
      stateDeltaRefs: input.stateDeltaRefs ?? [],
      itemId: input.itemId,
      itemOperation: input.itemTransfer.operation,
      previousOwnerId: input.previousOwnerId,
      nextOwnerId: input.nextOwnerId,
      previousLocationId: input.previousLocationId,
      nextLocationId: input.nextLocationId,
      previousEquipState: input.previousEquipState,
      nextEquipState: input.nextEquipState,
      previousEquippedSlot: input.previousEquippedSlot,
      nextEquippedSlot: input.nextEquippedSlot,
      anchorLocationId: input.anchorLocationId,
      anchorSceneLocationId: input.anchorSceneLocationId,
    },
    failure: null,
  });
}

function itemTransferStateMatches(input: {
  row: ItemRow;
  nextOwnerId: string | null;
  nextLocationId: string | null;
  nextEquipState: "carried" | "equipped";
  nextEquippedSlot: string | null;
}): boolean {
  return input.row.owner_id === input.nextOwnerId
    && input.row.location_id === input.nextLocationId
    && input.row.equip_state === input.nextEquipState
    && input.row.equipped_slot === input.nextEquippedSlot;
}

function isExclusiveEquipmentSlot(slot: string | null): boolean {
  return slot != null && slot !== "equipped";
}

function effectRefsAreCitable(input: {
  frame: AuthoritativeSceneFrame;
  refs: readonly string[];
}): boolean {
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  return input.refs.every((ref) => citable.has(normalizedRef(ref)) && !backendRefIssue(ref));
}

function itemTransferTargetForEffect(input: {
  frame: AuthoritativeSceneFrame;
  effect: ItemTransferEffect;
  player: PlayerRow;
  currentLocationId: string;
  currentSceneLocationId: string;
}): {
  ok: true;
  targetLabel: string;
  nextOwnerId: string | null;
  nextLocationId: string | null;
  nextEquipState: "carried" | "equipped";
  nextEquippedSlot: string | null;
  finalOwnerKind: ItemTransferResult["finalOwnerKind"];
  finalLocationKind: ItemTransferResult["finalLocationKind"];
} | { ok: false; kind: NonNullable<CleanStage4Receipt["failure"]>["kind"]; message: string } {
  const operation = input.effect.operation;
  const target = input.effect.target;
  if (
    operation === "give_to_visible_actor"
    && (input.effect.source.sourceKind !== "player_inventory" || target.targetKind !== "visible_actor")
  ) {
    return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer give requires a player inventory source and visible actor target." };
  }
  if (
    operation === "drop_in_current_scene"
    && (input.effect.source.sourceKind !== "player_inventory" || target.targetKind !== "current_scene")
  ) {
    return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer drop requires a player inventory source and current-scene target." };
  }
  if (
    operation === "pickup_from_current_scene"
    && (input.effect.source.sourceKind !== "current_scene_item" || target.targetKind !== "player_inventory")
  ) {
    return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer pickup requires a current-scene item source and player inventory target." };
  }
  if (
    operation === "equip_inventory_item"
    && (input.effect.source.sourceKind !== "player_inventory" || target.targetKind !== "player_equipment")
  ) {
    return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer equip requires a player inventory source and player equipment target." };
  }
  if (
    operation === "unequip_inventory_item"
    && (input.effect.source.sourceKind !== "player_inventory" || target.targetKind !== "player_inventory")
  ) {
    return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer unequip requires a player inventory source and player inventory target." };
  }

  if (operation === "give_to_visible_actor") {
    const actor = visibleActorTarget({
      frame: input.frame,
      targetRef: target.targetRef,
      currentLocationId: input.currentLocationId,
      currentSceneLocationId: input.currentSceneLocationId,
    });
    if (!actor.ok) {
      return { ok: false, kind: "target_not_visible", message: actor.message };
    }
    return {
      ok: true,
      targetLabel: actor.actorLabel,
      nextOwnerId: actor.npcId,
      nextLocationId: null,
      nextEquipState: "carried",
      nextEquippedSlot: null,
      finalOwnerKind: "visible_actor",
      finalLocationKind: "none",
    };
  }

  if (operation === "drop_in_current_scene") {
    if (normalizedRef(target.targetRef) !== normalizedRef(input.frame.scene.currentScene.ref)) {
      return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer drop target must be the current SceneFrame scene." };
    }
    return {
      ok: true,
      targetLabel: input.frame.scene.currentScene.label,
      nextOwnerId: null,
      nextLocationId: input.currentSceneLocationId,
      nextEquipState: "carried",
      nextEquippedSlot: null,
      finalOwnerKind: "none",
      finalLocationKind: "current_scene",
    };
  }

  if (operation === "pickup_from_current_scene" || operation === "unequip_inventory_item") {
    if (normalizedRef(target.targetRef) !== normalizedRef(input.frame.player.ref)) {
      return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer player inventory target must be Player." };
    }
    return {
      ok: true,
      targetLabel: input.frame.player.label,
      nextOwnerId: input.player.id,
      nextLocationId: null,
      nextEquipState: "carried",
      nextEquippedSlot: null,
      finalOwnerKind: "player",
      finalLocationKind: "none",
    };
  }

  if (normalizedRef(target.targetRef) !== normalizedRef(input.frame.player.ref)) {
    return { ok: false, kind: "target_state_invalid", message: "Stage 4 item_transfer player equipment target must be Player." };
  }
  return {
    ok: true,
    targetLabel: input.frame.player.label,
    nextOwnerId: input.player.id,
    nextLocationId: null,
    nextEquipState: "equipped",
    nextEquippedSlot: target.targetEquippedSlot ?? "equipped",
    finalOwnerKind: "player",
    finalLocationKind: "none",
  };
}

function itemTransferResult(input: {
  frame: AuthoritativeSceneFrame;
  effect: ItemTransferEffect;
  resultKind: ItemTransferResult["resultKind"];
  itemLabel: string;
  sourceLabel: string;
  targetLabel: string;
  finalOwnerKind: ItemTransferResult["finalOwnerKind"];
  finalLocationKind: ItemTransferResult["finalLocationKind"];
  finalEquipState: "carried" | "equipped";
  finalEquippedSlot: string | null;
}): ItemTransferResult {
  return {
    type: "item_transfer",
    resultKind: input.resultKind,
    itemLabel: input.itemLabel,
    actorLabel: "Player",
    operation: input.effect.operation,
    sourceLabel: input.sourceLabel,
    targetLabel: input.targetLabel,
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    finalOwnerKind: input.finalOwnerKind,
    finalLocationKind: input.finalLocationKind,
    finalEquipState: input.finalEquipState,
    finalEquippedSlot: input.finalEquippedSlot,
    claimStatus: "visible_item_state_change_only",
  };
}

function modelSafeMinorPoiRef(label: string): string {
  const normalized = label
    .trim()
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/gu, "")
    .slice(0, 80);
  return normalized.length > 0 ? normalized : "place_handle";
}

function activeMinorPoiRows(input: {
  campaignId: string;
  currentSceneLocationId: string;
}): CleanMinorPoiRow[] {
  return getSqliteConnection()
    .prepare(`
      SELECT
        poi_id,
        poi_ref,
        poi_label,
        poi_kind,
        active
      FROM clean_gameplay_minor_pois
      WHERE campaign_id = ?
        AND anchor_scene_location_id = ?
        AND active = 1
      ORDER BY created_at ASC, poi_id ASC
    `)
    .all(input.campaignId, input.currentSceneLocationId) as CleanMinorPoiRow[];
}

function minorPoiHandleConflicts(input: {
  frame: AuthoritativeSceneFrame;
  poiRef: string;
  poiLabel: string;
}): boolean {
  const ref = normalizedRef(input.poiRef);
  const label = normalizedRef(input.poiLabel);
  const reserved = [
    input.frame.scene.currentScene.ref,
    input.frame.scene.currentScene.label,
    input.frame.scene.currentLocation.ref,
    input.frame.scene.currentLocation.label,
    ...input.frame.movementOptions.flatMap((option) => [option.ref, option.label]),
    ...input.frame.actors.flatMap((actor) => [actor.ref, actor.label]),
    ...input.frame.inventory.flatMap((item) => [item.ref, item.label]),
    ...input.frame.targets
      .filter((target) => target.kind !== "place_handle")
      .flatMap((target) => [target.ref, target.label]),
  ].map(normalizedRef);
  return reserved.includes(ref) || reserved.includes(label);
}

function minorPoiHandleResult(input: {
  frame: AuthoritativeSceneFrame;
  effect: MinorPoiCreateEffect;
  resultKind: MinorPoiHandleResult["resultKind"];
  poiRef: string;
}): MinorPoiHandleResult {
  return {
    type: "minor_poi_handle",
    resultKind: input.resultKind,
    poiRef: input.poiRef,
    poiLabel: input.effect.placeLabel,
    poiKind: input.effect.placeKind,
    actorLabel: "Player",
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    visibility: "public_visible_current_scene",
    persistenceScope: "current_scene",
    targetOnly: true,
    claimStatus: "visible_current_scene_place_handle_only",
  };
}

function minorPoiReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  receiptId?: string;
  minorPoi: MinorPoiHandleResult;
  resultWorldVersion?: number;
  mutationApplied: boolean;
  authorityTraceId?: string | null;
  playerId: string;
  minorPoiId: string;
  minorPoiOperation: "inserted" | "reused";
  anchorLocationId: string;
  anchorSceneLocationId: string;
  stateDeltaRefs?: string[];
}): CleanStage4Receipt {
  return assertCleanStage4Receipt({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: input.receiptId ?? `stage4-receipt-${randomUUID()}`,
    requestId: input.request.requestId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    capabilityId: "minor_poi_create",
    status: "accepted",
    source: input.request.source,
    base: input.frame.base,
    result: {
      tick: input.frame.base.tick,
      worldVersion: input.resultWorldVersion ?? input.frame.base.worldVersion,
      worldTimeMinutes: input.frame.base.worldTimeMinutes,
      mutationApplied: input.mutationApplied,
    },
    authority: {
      evidenceAuthority: "minor_poi_handle_receipt",
      mutationAuthority: input.mutationApplied ? "current_scene_minor_poi_handle" : "none",
      visibleResultAuthority: "may_claim_visible_minor_poi_handle",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: input.mutationApplied,
    },
    publicResult: {
      summary: input.mutationApplied
        ? `Visible local place handle available: ${input.minorPoi.poiLabel}.`
        : `Visible local place handle reused: ${input.minorPoi.poiLabel}.`,
      visibleRefs: uniqueStrings([
        "Player",
        input.frame.scene.currentScene.ref,
        input.minorPoi.poiRef,
      ]).slice(0, 12),
      routeStatus: null,
      routeOptions: null,
      locationChange: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
      dialogue: null,
      minorPoi: input.minorPoi,
    },
    privateResult: {
      playerId: input.playerId,
      fromLocationId: null,
      destinationLocationId: null,
      edgeIds: [],
      authorityTraceId: input.authorityTraceId ?? null,
      clockReceiptId: null,
      stateDeltaRefs: input.stateDeltaRefs ?? [],
      minorPoiId: input.minorPoiId,
      minorPoiOperation: input.minorPoiOperation,
      anchorLocationId: input.anchorLocationId,
      anchorSceneLocationId: input.anchorSceneLocationId,
    },
    failure: null,
  });
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function normalizedRef(ref: string): string {
  return ref.trim().toLowerCase();
}

function zodIssue(issue: { path: PropertyKey[]; message: string }): Stage4DialogueRequestValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  };
}

function backendRefIssue(ref: string): boolean {
  return /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i.test(ref)
    || /^(actor|campaign|edge|fact|item|knowledge|location|npc|packet|receipt|route|scene|turn|world)[_:]/i.test(ref);
}

function collectDialoguePrivateTermIssues(input: {
  frame: AuthoritativeSceneFrame;
  candidate: unknown;
}): Stage4DialogueRequestValidationIssue[] {
  const terms = uniqueStrings([
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ]);
  if (terms.length === 0) return [];
  const text = JSON.stringify(input.candidate).toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()))
    ? [{
      code: "private_term",
      path: "<root>",
      message: "Dialogue request effect must not leak private frame guard terms.",
    }]
    : [];
}

export function validateDialogueRequestEffectCandidate(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): { status: "accepted"; effect: Extract<CleanStage4Request["effect"], { kind: "dialogue_record" }>; issues: [] } | {
  status: "rejected";
  issues: Stage4DialogueRequestValidationIssue[];
} {
  const issues = collectDialoguePrivateTermIssues({
    frame: input.frame,
    candidate: input.candidate,
  });
  const parsed = cleanStage4DialogueRequestEffectSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: [...issues, ...parsed.error.issues.map(zodIssue)],
    };
  }

  const effect = parsed.data;
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  const planned = new Set([
    input.frame.player.ref,
    ...input.step.targetRefs,
    ...input.step.evidenceRefs,
    ...(input.dependencyResolution?.materializedSpeaker
      ? [input.dependencyResolution.materializedSpeaker.actorRef]
      : []),
    ...(input.dependencyResolution?.minorPoi
      ? [input.dependencyResolution.minorPoi.poiRef]
      : []),
  ].map(normalizedRef));
  const refs = uniqueStrings([
    effect.speakerRef,
    ...effect.addresseeRefs,
    ...effect.evidenceRefs,
  ]);

  for (const ref of refs) {
    if (!citable.has(normalizedRef(ref))) {
      issues.push({
        code: "uncited_ref",
        path: "refs",
        message: `Dialogue request cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (!planned.has(normalizedRef(ref))) {
      issues.push({
        code: "unplanned_ref",
        path: "refs",
        message: `Dialogue request cited ref "${ref}" outside the accepted checklist step scope.`,
      });
    }
    if (backendRefIssue(ref)) {
      issues.push({
        code: "backend_ref",
        path: "refs",
        message: `Dialogue request cited backend-looking ref "${ref}".`,
      });
    }
  }

  const speaker = input.frame.actors.find((actor) =>
    actor.role !== "player" && normalizedRef(actor.ref) === normalizedRef(effect.speakerRef)
  );
  if (!speaker) {
    issues.push({
      code: "speaker_invalid",
      path: "speakerRef",
      message: "Dialogue request speakerRef must be exactly one already-visible non-player SceneFrame actor.",
    });
  }
  if (
    input.dependencyResolution?.materializedSpeaker
    && normalizedRef(effect.speakerRef) !== normalizedRef(input.dependencyResolution.materializedSpeaker.actorRef)
  ) {
    issues.push({
      code: "speaker_invalid",
      path: "speakerRef",
      message: "Dependent support-actor dialogue must use the actorRef resolved from the post-dependency SceneFrame.",
    });
  }
  const dialoguePlan = input.step.intended.dialoguePlan ?? null;
  if (!dialoguePlan) {
    issues.push({
      code: "speaker_invalid",
      path: "dialoguePlan",
      message: "Dialogue request requires the accepted checklist dialoguePlan.",
    });
  } else {
    if (
      dialoguePlan.speakerSource === "existing_visible_actor"
      && (!dialoguePlan.speakerRef || normalizedRef(effect.speakerRef) !== normalizedRef(dialoguePlan.speakerRef))
    ) {
      issues.push({
        code: "speaker_invalid",
        path: "speakerRef",
        message: "Dialogue request speakerRef must match dialoguePlan.speakerRef.",
      });
    }
    if (dialoguePlan.speakerSource === "materialized_support_actor") {
      const resolvedSpeakerRef = input.dependencyResolution?.materializedSpeaker?.actorRef ?? null;
      if (!resolvedSpeakerRef || normalizedRef(effect.speakerRef) !== normalizedRef(resolvedSpeakerRef)) {
        issues.push({
          code: "speaker_invalid",
          path: "speakerRef",
          message: "Dialogue request speakerRef must match the materialized support actor from dependency resolution.",
        });
      }
    }
    if (!effect.addresseeRefs.some((ref) => normalizedRef(ref) === normalizedRef(dialoguePlan.addresseeRef))) {
      issues.push({
        code: "speaker_invalid",
        path: "addresseeRefs",
        message: "Dialogue request addresseeRefs must include dialoguePlan.addresseeRef.",
      });
    }
  }
  if (!effect.addresseeRefs.some((ref) => normalizedRef(ref) === normalizedRef(input.frame.player.ref))) {
    issues.push({
      code: "speaker_invalid",
      path: "addresseeRefs",
      message: "Dialogue request must include Player as an addressee in P65.",
    });
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", effect, issues: [] };
}

function promptFrameForDialogue(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    turnId: frame.turnId,
    base: frame.base,
    scene: {
      currentLocation: {
        ref: frame.scene.currentLocation.ref,
        label: frame.scene.currentLocation.label,
      },
      currentScene: {
        ref: frame.scene.currentScene.ref,
        label: frame.scene.currentScene.label,
      },
    },
    player: frame.player,
    actors: frame.actors.map((actor) => ({
      ref: actor.ref,
      label: actor.label,
      role: actor.role,
      visibleStatus: actor.visibleStatus,
    })),
    targets: frame.targets.map((target) => ({
      ref: target.ref,
      label: target.label,
      kind: target.kind,
      holder: target.holder ?? null,
    })),
    citableRefs: frame.citableRefs,
  };
}

function dialogueTaskCard(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): unknown {
  const dialoguePlan = input.step.intended.dialoguePlan ?? null;
  const resolvedSpeakerRef = input.dependencyResolution?.materializedSpeaker?.actorRef
    ?? dialoguePlan?.speakerRef
    ?? null;
  const speaker = resolvedSpeakerRef
    ? input.frame.actors.find((actor) =>
        actor.role !== "player"
        && normalizedRef(actor.ref) === normalizedRef(resolvedSpeakerRef)
      ) ?? null
    : input.frame.actors.find((actor) =>
        actor.role !== "player"
        && input.step.targetRefs.some((ref) => normalizedRef(ref) === normalizedRef(actor.ref))
      ) ?? null;
  const stepRefs = new Set([
    ...input.step.targetRefs,
    ...input.step.evidenceRefs,
  ].map(normalizedRef));
  const currentItemHolders = input.frame.targets
    .filter((target) =>
      target.kind === "item"
      && target.holder
      && stepRefs.has(normalizedRef(target.ref))
    )
    .map((target) => ({
      itemRef: target.ref,
      itemLabel: target.label,
      currentHolderKind: target.holder?.holderKind ?? null,
      currentHolderLabel: target.holder?.holderLabel ?? null,
      currentEquipState: target.holder?.equipState ?? null,
    }));
  return {
    job: "record_one_visible_speaker_response",
    capabilityId: "dialogue_record",
    dialoguePlan: dialoguePlan
      ? {
        ...dialoguePlan,
        resolvedSpeakerRef,
      }
      : null,
    checklistPurpose: input.step.purpose,
    checklistTask: input.step.intended.summary,
    expectedVisibleEffect: input.step.expectedVisibleEffect,
    speaker: speaker
      ? {
        ref: speaker.ref,
        label: speaker.label,
        role: speaker.role,
      }
      : null,
    addressee: {
      ref: input.frame.player.ref,
      label: input.frame.player.label,
    },
    allowedEvidenceRefs: uniqueStrings([
      input.frame.player.ref,
      ...input.step.targetRefs,
      ...input.step.evidenceRefs,
    ]),
    currentItemHolders,
    responseAuthority: {
      evidenceKind: "visible_speaker_response_content",
      truthStatus: "speaker_response_only",
      stateAuthority: "state_facts_remain_with_backend_receipts",
    },
  };
}

export function buildStage4DialogueRequestSystemPrompt(): string {
  return [
    "You are WorldForge clean Stage 4 Dialogue Request.",
    "Return only JSON matching the dialogue_record effect schema.",
    "Create exactly one visible speaker-response payload for backend validation.",
    "Use Dialogue task card as the job contract: dialoguePlan, speaker, addressee, checklist task, allowed evidence refs, and response authority.",
    "The speaker field must name one already-visible non-player actor from SceneFrame.actors, and addresseeRefs must include Player.",
    "For non-silence outcomes, response.kind must be speech and quotedSpeech is required.",
    "For silence outcomes, response.kind must be silence and quotedSpeech must be null.",
    "response.summary restates the same visible response content in one concise sentence.",
    "stateEffects.appliesState is false for this clean dialogue task.",
    "World-state, relationship, item, condition, location, movement, memory, and durable-event authority belongs to backend receipts; dialogue stores visible response content.",
    "For current item holder/custody answers, Dialogue task card currentItemHolders is the complete evidence basis for quotedSpeech and summary.",
    "Use dialoguePlan.playerIntent for the player's visible request; in-world language barriers require citable scene evidence.",
    "Use refs from allowedEvidenceRefs and SceneFrame.citableRefs.",
  ].join("\n");
}

export function buildStage4DialogueRequestPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): string {
  return [
    "Produce one dialogue_record effect for this accepted checklist step.",
    "Required effect shape:",
    "{ kind, authorityKind, speakerRef, addresseeRefs, outcomeKind, response, languageBasis, evidenceRefs, stateEffects }",
    "Dialogue task card:",
    JSON.stringify(dialogueTaskCard(input), null, 2),
    input.dependencyResolution?.materializedSpeaker
      ? [
        "Resolved materialized-speaker dependency:",
        JSON.stringify(input.dependencyResolution.materializedSpeaker, null, 2),
        "The speakerRef must be exactly the resolved actorRef above, and that actor must appear in the authoritative SceneFrame below.",
      ].join("\n")
      : input.dependencyResolution?.playerLocalCondition
        ? [
          "Resolved player-local-condition dependency:",
          JSON.stringify(input.dependencyResolution.playerLocalCondition, null, 2),
          "The condition has already been applied or cleared by Stage 4 and the authoritative SceneFrame below is post-dependency.",
        ].join("\n")
        : input.dependencyResolution?.itemTransfer
          ? [
            "Resolved item-transfer dependency:",
            JSON.stringify(input.dependencyResolution.itemTransfer, null, 2),
            "The item state has already been applied by Stage 4 and the authoritative SceneFrame below is post-dependency.",
          ].join("\n")
          : input.dependencyResolution?.minorPoi
            ? [
              "Resolved minor-POI-handle dependency:",
              JSON.stringify(input.dependencyResolution.minorPoi, null, 2),
              "The visible current-scene place handle has already been accepted by Stage 4 and the authoritative SceneFrame below is post-dependency.",
            ].join("\n")
          : "No post-dependency SceneFrame binding is active for this dialogue step.",
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForDialogue(input.frame), null, 2),
  ].join("\n\n");
}

function buildStage4DialogueRepairPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
  issues: Stage4DialogueRequestValidationIssue[];
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
}): string {
  return [
    "Repair the dialogue_record effect so it satisfies the clean P65 dialogue contract.",
    "Use the Dialogue task card fields as the complete job contract for the repaired effect.",
    "Dialogue task card:",
    JSON.stringify(dialogueTaskCard(input), null, 2),
    input.dependencyResolution?.materializedSpeaker
      ? `This is dependent support-actor dialogue; speakerRef must be ${input.dependencyResolution.materializedSpeaker.actorRef}.`
      : input.dependencyResolution?.playerLocalCondition
        ? "This dialogue follows an accepted player-local-condition dependency; do not restate or mutate that condition beyond accepted evidence."
        : input.dependencyResolution?.itemTransfer
          ? "This dialogue follows an accepted item-transfer dependency; do not restate or mutate item state beyond accepted evidence."
          : input.dependencyResolution?.minorPoi
            ? "This dialogue follows an accepted minor-POI-handle dependency; cite the refreshed place handle only as a visible current-scene target."
          : "This dialogue step has no post-dependency SceneFrame binding.",
    "Validation issues:",
    JSON.stringify(input.issues, null, 2),
    "Original candidate:",
    JSON.stringify(input.candidate, null, 2),
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForDialogue(input.frame), null, 2),
  ].join("\n\n");
}

async function generateDialogueEffectCandidate(input: {
  provider: ProviderConfig;
  request: Stage4DialogueRequestCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "storyteller", reasoningMode: "bypass" }),
    schema: cleanStage4DialogueRequestEffectSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.2,
    maxOutputTokens: 1000,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

function dialogueRequestFromEffect(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  effect: Extract<CleanStage4Request["effect"], { kind: "dialogue_record" }>;
}): CleanStage4Request {
  return assertCleanStage4Request({
    version: "gameplay-runtime.stage4-request.v1",
    requestId: `stage4-request-${randomUUID()}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: input.checklist.checklistId,
      checklistStepId: input.step.stepId,
    },
    base: input.frame.base,
    author: "model_from_stage4_dialogue_request",
    modelAuthored: true,
    capabilityId: "dialogue_record",
    effect: input.effect,
  });
}

function placeholderDialogueRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
}): CleanStage4Request {
  const speakerRef = input.step.targetRefs.find((ref) =>
    input.frame.actors.some((actor) =>
      actor.role !== "player" && normalizedRef(actor.ref) === normalizedRef(ref)
    )
  ) ?? input.step.targetRefs[0] ?? input.frame.scene.currentScene.ref;
  return dialogueRequestFromEffect({
    ...input,
    effect: {
      kind: "dialogue_record",
      authorityKind: "existing_visible_actor",
      speakerRef,
      addresseeRefs: ["Player"],
      outcomeKind: "silence",
      response: {
        kind: "silence",
        quotedSpeech: null,
        summary: "No accepted dialogue response was generated.",
      },
      languageBasis: {
        responseLanguage: "match_player_action",
        source: "turn_language_profile",
      },
      evidenceRefs: uniqueStrings(["Player", speakerRef, ...input.step.evidenceRefs]).slice(0, 12),
      stateEffects: {
        appliesState: false,
      },
    },
  });
}

async function buildDialogueRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
  provider?: ProviderConfig;
  generateDialogueRequest?: Stage4DialogueRequestGenerator;
}): Promise<{ status: "accepted"; request: CleanStage4Request; issues: [] } | {
  status: "failed";
  request: CleanStage4Request;
  issues: Stage4DialogueRequestValidationIssue[];
}> {
  const system = buildStage4DialogueRequestSystemPrompt();
  const prompt = buildStage4DialogueRequestPrompt({
    frame: input.frame,
    step: input.step,
    dependencyResolution: input.dependencyResolution,
  });
  const generator = input.generateDialogueRequest
    ?? (input.provider
      ? ((request: Stage4DialogueRequestCandidateRequest) => generateDialogueEffectCandidate({
        provider: input.provider as ProviderConfig,
        request,
      }))
      : null);
  if (!generator) {
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: "P65 dialogue execution requires a Stage 4 dialogue request generator.",
      }],
    };
  }

  let firstCandidate: unknown;
  try {
    firstCandidate = await generator({ system, prompt });
  } catch (error) {
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const firstValidation = validateDialogueRequestEffectCandidate({
    frame: input.frame,
    step: input.step,
    candidate: firstCandidate,
    dependencyResolution: input.dependencyResolution,
  });
  if (firstValidation.status === "accepted") {
    return {
      status: "accepted",
      request: dialogueRequestFromEffect({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        effect: firstValidation.effect,
      }),
      issues: [],
    };
  }

  try {
    const repairCandidate = await generator({
      system,
      prompt: buildStage4DialogueRepairPrompt({
        frame: input.frame,
        step: input.step,
        candidate: firstCandidate,
        issues: firstValidation.issues,
        dependencyResolution: input.dependencyResolution,
      }),
      repairOf: {
        candidate: firstCandidate,
        issues: firstValidation.issues,
      },
    });
    const repairValidation = validateDialogueRequestEffectCandidate({
      frame: input.frame,
      step: input.step,
      candidate: repairCandidate,
      dependencyResolution: input.dependencyResolution,
    });
    if (repairValidation.status === "accepted") {
      return {
        status: "accepted",
        request: dialogueRequestFromEffect({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          effect: repairValidation.effect,
        }),
        issues: [],
      };
    }
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [...firstValidation.issues, ...repairValidation.issues],
    };
  } catch (error) {
    return {
      status: "failed",
      request: placeholderDialogueRequest(input),
      issues: [
        ...firstValidation.issues,
        {
          code: "schema_invalid",
          path: "<repair>",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

const SUPPORT_ROLE_LABELS: Record<SupportActorRoleKind, { actorLabel: string; roleLabel: string }> = {
  attendant: { actorLabel: "Local Attendant", roleLabel: "attendant" },
  bystander: { actorLabel: "Local Bystander", roleLabel: "bystander" },
  clerk: { actorLabel: "Local Clerk", roleLabel: "clerk" },
  courier: { actorLabel: "Local Courier", roleLabel: "courier" },
  crowd_voice: { actorLabel: "Local Crowd Voice", roleLabel: "crowd voice" },
  dockhand: { actorLabel: "Local Dockhand", roleLabel: "dockhand" },
  guard: { actorLabel: "Local Guard", roleLabel: "guard" },
  guide: { actorLabel: "Local Guide", roleLabel: "guide" },
  helper: { actorLabel: "Local Helper", roleLabel: "helper" },
  laborer: { actorLabel: "Local Laborer", roleLabel: "laborer" },
  porter: { actorLabel: "Local Porter", roleLabel: "porter" },
  vendor: { actorLabel: "Local Vendor", roleLabel: "vendor" },
  witness: { actorLabel: "Local Witness", roleLabel: "witness" },
};

function supportActorLabels(roleKind: SupportActorRoleKind): { actorLabel: string; roleLabel: string } {
  return SUPPORT_ROLE_LABELS[roleKind];
}

function safeParseStringArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

function hasTag(row: NpcSupportRow, tag: string): boolean {
  return safeParseStringArray(row.tags).some((entry) => entry.toLowerCase() === tag.toLowerCase());
}

function isReusableSupportActor(input: {
  row: NpcSupportRow;
  roleKind: SupportActorRoleKind;
  currentLocationId: string;
  currentSceneLocationId: string;
}): boolean {
  return input.row.tier === "temporary"
    && input.row.current_location_id === input.currentLocationId
    && input.row.current_scene_location_id === input.currentSceneLocationId
    && hasTag(input.row, "temporary-support")
    && hasTag(input.row, "clean-runtime-support")
    && hasTag(input.row, `support-role:${input.roleKind}`)
    && hasTag(input.row, "current-scene")
    && !hasTag(input.row, "hidden")
    && !hasTag(input.row, "concealed")
    && !hasTag(input.row, "disguised")
    && !hasTag(input.row, "secret")
    && !hasTag(input.row, "private")
    && !hasTag(input.row, "remote")
    && !hasTag(input.row, "persistent")
    && !hasTag(input.row, "key");
}

function collectSupportActorPrivateTermIssues(input: {
  frame: AuthoritativeSceneFrame;
  candidate: unknown;
}): Stage4SupportActorRequestValidationIssue[] {
  const terms = uniqueStrings([
    ...input.frame.privateGuards.forbiddenActorLabels,
    ...input.frame.privateGuards.forbiddenPrivateTerms,
    ...input.frame.forecast.forbiddenPrivateTerms,
  ]);
  if (terms.length === 0) return [];
  const text = JSON.stringify(input.candidate).toLowerCase();
  return terms.some((term) => text.includes(term.toLowerCase()))
    ? [{
      code: "private_term",
      path: "<root>",
      message: "Support actor request effect must not leak private frame guard terms.",
    }]
    : [];
}

function zodSupportIssue(issue: { path: PropertyKey[]; message: string }): Stage4SupportActorRequestValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  };
}

export function validateSupportActorRequestEffectCandidate(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
}): { status: "accepted"; effect: SupportActorCreateEffect; issues: [] } | {
  status: "rejected";
  issues: Stage4SupportActorRequestValidationIssue[];
} {
  const issues = collectSupportActorPrivateTermIssues({
    frame: input.frame,
    candidate: input.candidate,
  });
  const parsed = cleanStage4SupportActorCreateEffectSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: [...issues, ...parsed.error.issues.map(zodSupportIssue)],
    };
  }

  const effect = parsed.data;
  const plan = input.step.intended.supportActorPlan ?? null;
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  const planned = new Set([
    input.frame.player.ref,
    input.frame.scene.currentScene.ref,
    input.frame.scene.currentLocation.ref,
    ...input.step.targetRefs,
    ...input.step.evidenceRefs,
  ].map(normalizedRef));
  const refs = uniqueStrings([
    effect.anchorRef,
    ...effect.evidenceRefs,
  ]);

  if (normalizedRef(effect.anchorRef) !== normalizedRef(input.frame.scene.currentScene.ref)) {
    issues.push({
      code: "anchor_invalid",
      path: "anchorRef",
      message: "Support actor materialization must anchor exactly to the current SceneFrame scene ref.",
    });
  }
  if (!plan) {
    issues.push({
      code: "plan_mismatch",
      path: "step.intended.supportActorPlan",
      message: "Support actor materialization requires a typed supportActorPlan from Checklist.",
    });
  } else {
    if (effect.roleKind !== plan.roleKind) {
      issues.push({
        code: "plan_mismatch",
        path: "roleKind",
        message: `Support actor roleKind must match checklist supportActorPlan roleKind ${plan.roleKind}.`,
      });
    }
    if (normalizedRef(effect.anchorRef) !== normalizedRef(plan.anchorRef)) {
      issues.push({
        code: "plan_mismatch",
        path: "anchorRef",
        message: "Support actor anchorRef must match checklist supportActorPlan anchorRef.",
      });
    }
  }

  for (const ref of refs) {
    if (!citable.has(normalizedRef(ref))) {
      issues.push({
        code: "uncited_ref",
        path: "refs",
        message: `Support actor request cited ref "${ref}" outside SceneFrame.citableRefs.`,
      });
    }
    if (!planned.has(normalizedRef(ref))) {
      issues.push({
        code: "unplanned_ref",
        path: "refs",
        message: `Support actor request cited ref "${ref}" outside the accepted checklist step scope.`,
      });
    }
    if (backendRefIssue(ref)) {
      issues.push({
        code: "backend_ref",
        path: "refs",
        message: `Support actor request cited backend-looking ref "${ref}".`,
      });
    }
  }

  const roleCollisionLabels = [
    input.frame.player.label,
    ...input.frame.actors.map((actor) => actor.label),
  ].map((label) => label.trim().toLowerCase());
  const modelRoleLabel = effect.roleLabel.trim().toLowerCase();
  if (roleCollisionLabels.includes(modelRoleLabel)) {
    issues.push({
      code: "role_collision",
      path: "roleLabel",
      message: "Support actor request roleLabel must not collide with the Player or already-visible actor labels.",
    });
  }

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", effect, issues: [] };
}

function promptFrameForSupportActor(frame: AuthoritativeSceneFrame): unknown {
  return {
    version: frame.version,
    frameId: frame.frameId,
    turnId: frame.turnId,
    base: frame.base,
    scene: frame.scene,
    player: frame.player,
    actors: frame.actors.map((actor) => ({
      ref: actor.ref,
      label: actor.label,
      role: actor.role,
      visibleStatus: actor.visibleStatus,
    })),
    citableRefs: frame.citableRefs,
  };
}

function supportActorTaskCard(input: {
  step: Step;
}): unknown {
  const plan = input.step.intended.supportActorPlan;
  return {
    job: "propose_one_ordinary_current_scene_support_actor_materialization",
    capabilityId: "support_actor_create",
    supportActorPlan: plan
      ? {
        roleKind: plan.roleKind,
        requestedRoleText: plan.requestedRoleText,
        anchorRef: plan.anchorRef,
        intendedUse: plan.intendedUse,
        reusePolicy: plan.reusePolicy,
      }
      : null,
    checklistPurpose: input.step.purpose,
    checklistTask: input.step.intended.summary,
    expectedVisibleEffect: input.step.expectedVisibleEffect,
    allowedEvidenceRefs: input.step.evidenceRefs,
    materializationAuthority: {
      evidenceKind: "visible_current_scene_support_actor_materialization",
      identityBounds: "temporary/current_scene/minor_support/reactive_only",
      stateAuthority: "backend_materialization_receipt_only",
    },
  };
}

export function buildStage4SupportActorRequestSystemPrompt(): string {
  return [
    "You are WorldForge clean Stage 4 Support Actor Request.",
    "Return only JSON matching the support_actor_create effect schema.",
    "This is not narration. It proposes one bounded ordinary current-scene support actor presentation for backend validation.",
    "Use Support actor task card as the job contract: roleKind, requestedRoleText, anchorRef, intendedUse, allowed evidence refs, and materialization authority.",
    "Use only ordinary local roles allowed by the schema and anchorRef must be the current SceneFrame scene ref.",
    "Do not create named people, key NPCs, faction leaders, secret contacts, hidden actors, remote actors, family members, persistent actors, or campaign-critical roles.",
    "Do not include dialogue content, world facts, relationship changes, item state, route truth, future relevance, private knowledge, old tool ids, backend refs, or durable event claims.",
    "Set identityBounds exactly to temporary/current_scene/minor_support/reactive_only/mayBecomePersistentHere=false.",
    "Set reusePolicy to reuse_matching_temporary_current_scene_or_create and all forbiddenPayloads fields to false.",
    "Use only refs from the accepted checklist step and SceneFrame.citableRefs.",
  ].join("\n");
}

export function buildStage4SupportActorRequestPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
}): string {
  return [
    "Produce one support_actor_create effect for this accepted checklist step.",
    "Required effect shape:",
    "{ kind, authorityKind, anchorScope, anchorRef, roleKind, roleLabel, publicPresentation, identityBounds, reusePolicy, reason, evidenceRefs, forbiddenPayloads }",
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Support actor task card:",
    JSON.stringify(supportActorTaskCard({ step: input.step }), null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForSupportActor(input.frame), null, 2),
  ].join("\n\n");
}

function buildStage4SupportActorRepairPrompt(input: {
  frame: AuthoritativeSceneFrame;
  step: Step;
  candidate: unknown;
  issues: Stage4SupportActorRequestValidationIssue[];
}): string {
  return [
    "Repair the support_actor_create effect so it satisfies the clean P66 support actor contract.",
    "Do not add unsupported fields, old tool ids, backend refs, dialogue, world facts, relationships, item state, route truth, future relevance, private knowledge, or durable events.",
    "Validation issues:",
    JSON.stringify(input.issues, null, 2),
    "Original candidate:",
    JSON.stringify(input.candidate, null, 2),
    "Accepted checklist step:",
    JSON.stringify(input.step, null, 2),
    "Support actor task card:",
    JSON.stringify(supportActorTaskCard({ step: input.step }), null, 2),
    "Authoritative SceneFrame:",
    JSON.stringify(promptFrameForSupportActor(input.frame), null, 2),
  ].join("\n\n");
}

async function generateSupportActorEffectCandidate(input: {
  provider: ProviderConfig;
  request: Stage4SupportActorRequestCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "storyteller", reasoningMode: "bypass" }),
    schema: cleanStage4SupportActorCreateEffectSchema,
    system: input.request.system,
    prompt: input.request.prompt,
    temperature: 0.2,
    maxOutputTokens: 900,
    mode: "native_json",
    retries: 1,
    allowTextFallback: false,
    allowRepair: false,
    strictSchema: true,
  });
  return generated.object;
}

function supportActorRequestFromEffect(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  effect: SupportActorCreateEffect;
}): CleanStage4Request {
  return assertCleanStage4Request({
    version: "gameplay-runtime.stage4-request.v1",
    requestId: `stage4-request-${randomUUID()}`,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: input.checklist.checklistId,
      checklistStepId: input.step.stepId,
    },
    base: input.frame.base,
    author: "model_from_stage4_support_actor_request",
    modelAuthored: true,
    capabilityId: "support_actor_create",
    effect: input.effect,
  });
}

function placeholderSupportActorRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
}): CleanStage4Request {
  const labels = supportActorLabels("helper");
  return supportActorRequestFromEffect({
    ...input,
    effect: {
      kind: "support_actor_create",
      authorityKind: "ordinary_current_scene_support_actor",
      anchorScope: "current_scene",
      anchorRef: input.frame.scene.currentScene.ref,
      roleKind: "helper",
      roleLabel: labels.roleLabel,
      publicPresentation: {
        publicSummary: "No accepted support actor request was generated.",
        visibleCue: null,
        voiceHint: null,
      },
      identityBounds: {
        tier: "temporary",
        persistence: "current_scene",
        significance: "minor_support",
        agency: "reactive_only",
        mayBecomePersistentHere: false,
      },
      reusePolicy: "reuse_matching_temporary_current_scene_or_create",
      reason: "Failure audit request shell for rejected support actor request generation.",
      evidenceRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, ...input.step.evidenceRefs]).slice(0, 12),
      forbiddenPayloads: {
        dialogueContent: false,
        worldFact: false,
        relationship: false,
        itemState: false,
        routeTruth: false,
        futureRelevance: false,
        privateKnowledge: false,
      },
    },
  });
}

function supportActorFailureMessage(message: string): string {
  const prefix = "Stage 4 support actor request was not accepted: ";
  const normalized = message.replace(/\s+/g, " ").trim() || "invalid support actor request";
  const maxMessageLength = 500 - prefix.length;
  const diagnostic = normalized.length <= maxMessageLength
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxMessageLength - 3))}...`;
  return `${prefix}${diagnostic}`;
}

async function buildSupportActorRequest(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  provider?: ProviderConfig;
  generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
}): Promise<{ status: "accepted"; request: CleanStage4Request; issues: [] } | {
  status: "failed";
  request: CleanStage4Request;
  issues: Stage4SupportActorRequestValidationIssue[];
}> {
  const system = buildStage4SupportActorRequestSystemPrompt();
  const prompt = buildStage4SupportActorRequestPrompt({
    frame: input.frame,
    step: input.step,
  });
  const generator = input.generateSupportActorRequest
    ?? (input.provider
      ? ((request: Stage4SupportActorRequestCandidateRequest) => generateSupportActorEffectCandidate({
        provider: input.provider as ProviderConfig,
        request,
      }))
      : null);
  if (!generator) {
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: "P66 support actor execution requires a Stage 4 support actor request generator.",
      }],
    };
  }

  let firstCandidate: unknown;
  try {
    firstCandidate = await generator({ system, prompt });
  } catch (error) {
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [{
        code: "schema_invalid",
        path: "<generation>",
        message: error instanceof Error ? error.message : String(error),
      }],
    };
  }

  const firstValidation = validateSupportActorRequestEffectCandidate({
    frame: input.frame,
    step: input.step,
    candidate: firstCandidate,
  });
  if (firstValidation.status === "accepted") {
    return {
      status: "accepted",
      request: supportActorRequestFromEffect({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        effect: firstValidation.effect,
      }),
      issues: [],
    };
  }

  try {
    const repairCandidate = await generator({
      system,
      prompt: buildStage4SupportActorRepairPrompt({
        frame: input.frame,
        step: input.step,
        candidate: firstCandidate,
        issues: firstValidation.issues,
      }),
      repairOf: {
        candidate: firstCandidate,
        issues: firstValidation.issues,
      },
    });
    const repairValidation = validateSupportActorRequestEffectCandidate({
      frame: input.frame,
      step: input.step,
      candidate: repairCandidate,
    });
    if (repairValidation.status === "accepted") {
      return {
        status: "accepted",
        request: supportActorRequestFromEffect({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          effect: repairValidation.effect,
        }),
        issues: [],
      };
    }
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [...firstValidation.issues, ...repairValidation.issues],
    };
  } catch (error) {
    return {
      status: "failed",
      request: placeholderSupportActorRequest(input),
      issues: [
        ...firstValidation.issues,
        {
          code: "schema_invalid",
          path: "<repair>",
          message: error instanceof Error ? error.message : String(error),
        },
      ],
    };
  }
}

function clockLedgerReasonKind(reasonKind: "brief_local_action" | "wait" | "short_rest"): string {
  if (reasonKind === "short_rest") return "rest";
  if (reasonKind === "wait") return "wait";
  return "other_elapsed_time";
}

function executeObserveVisible(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const actors = input.frame.actors
    .filter((actor) => actor.role !== "player")
    .map((actor) => actor.label)
    .slice(0, 12);
  const visibleFacts = [
    ...input.frame.scene.visibleFacts.map((fact) => fact.summary),
    ...input.frame.scene.recentLocalFacts.map((fact) => fact.summary),
  ].slice(0, 12);
  const inventory = input.frame.inventory.map((item) => item.label).slice(0, 12);
  const movementOptions = input.frame.movementOptions.map((option) => option.label).slice(0, 32);
  const summary = [
    `Current visible place is ${input.frame.scene.currentScene.label}.`,
    actors.length > 0 ? `Visible actors include ${actors.join(", ")}.` : null,
    movementOptions.length > 0 ? `Visible routes include ${movementOptions.join(", ")}.` : null,
    inventory.length > 0 ? `Inventory includes ${inventory.join(", ")}.` : null,
  ].filter((part): part is string => Boolean(part)).join(" ");
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "observe_visible",
    summary,
    visibleRefs: ["Player", input.frame.scene.currentScene.ref, ...input.frame.actors.map((actor) => actor.ref)].slice(0, 12),
    visibleObservation: {
      type: "visible_observation",
      currentScene: input.frame.scene.currentScene.label,
      currentLocation: input.frame.scene.currentLocation.label,
      visibleActors: actors,
      visibleFacts,
      inventory,
      movementOptions,
    },
  });
  input.store.insert(receipt);
  return receipt;
}

function shortObservationText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length === 0) return null;
  return trimmed.slice(0, 500);
}

function localObservationSurface(input: {
  frame: AuthoritativeSceneFrame;
  surfaceKinds: readonly LocalObservationSurfaceKind[];
}): LocalObservationSurfaceEntry[] {
  const requested = new Set(input.surfaceKinds);
  const entries: LocalObservationSurfaceEntry[] = [];
  if (requested.has("current_scene")) {
    entries.push({
      surfaceKind: "current_scene",
      ref: input.frame.scene.currentScene.ref,
      label: input.frame.scene.currentScene.label,
      detail: shortObservationText(input.frame.scene.currentScene.description),
    });
  }
  if (requested.has("current_location")) {
    entries.push({
      surfaceKind: "current_location",
      ref: input.frame.scene.currentLocation.ref,
      label: input.frame.scene.currentLocation.label,
      detail: shortObservationText(input.frame.scene.currentLocation.description),
    });
  }
  if (requested.has("visible_actor")) {
    for (const actor of input.frame.actors.filter((entry) => entry.role !== "player")) {
      entries.push({
        surfaceKind: "visible_actor",
        ref: actor.ref,
        label: actor.label,
        detail: shortObservationText(`visible ${actor.role} actor`),
      });
    }
  }
  if (requested.has("visible_target")) {
    for (const target of input.frame.targets) {
      entries.push({
        surfaceKind: "visible_target",
        ref: target.ref,
        label: target.label,
        detail: shortObservationText(`${target.kind} target`),
      });
    }
  }
  if (requested.has("inventory_item")) {
    for (const item of input.frame.inventory) {
      entries.push({
        surfaceKind: "inventory_item",
        ref: item.ref,
        label: item.label,
        detail: shortObservationText(`inventory item, ${item.equipState}`),
      });
    }
  }
  if (requested.has("visible_fact")) {
    for (const factEntry of [...input.frame.scene.visibleFacts, ...input.frame.scene.recentLocalFacts]) {
      entries.push({
        surfaceKind: "visible_fact",
        ref: factEntry.source,
        label: factEntry.summary,
        detail: null,
      });
    }
  }
  if (requested.has("movement_option")) {
    for (const option of input.frame.movementOptions) {
      entries.push({
        surfaceKind: "movement_option",
        ref: option.ref,
        label: option.label,
        detail: shortObservationText("movement option label only"),
      });
    }
  }
  return entries.slice(0, 64);
}

function normalizeObservationMatch(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

function localObservationSurfaceKindLabel(kind: LocalObservationSurfaceKind): string {
  switch (kind) {
    case "current_scene": return "current scene";
    case "current_location": return "current location";
    case "visible_actor": return "visible actor";
    case "visible_target": return "visible target";
    case "inventory_item": return "inventory item";
    case "visible_fact": return "visible fact";
    case "movement_option": return "route option";
  }
}

function localObservationSurfaceKindPluralLabel(kind: LocalObservationSurfaceKind): string {
  switch (kind) {
    case "current_scene": return "the current scene";
    case "current_location": return "the current location";
    case "visible_actor": return "visible actors";
    case "visible_target": return "visible targets";
    case "inventory_item": return "inventory items";
    case "visible_fact": return "visible facts";
    case "movement_option": return "route options";
  }
}

function localObservationSurfaceEntryLabel(entry: Pick<LocalObservationSurfaceEntry, "surfaceKind" | "label">): string {
  return `${localObservationSurfaceKindLabel(entry.surfaceKind)} ${entry.label}`;
}

function localObservationSurfaceGroupLabel(kinds: readonly LocalObservationSurfaceKind[]): string {
  const labels = uniqueStrings(kinds.map(localObservationSurfaceKindPluralLabel));
  if (labels.length === 0) return "current visible entries";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function localObservationLabelList(entries: readonly LocalObservationSurfaceEntry[]): string {
  return uniqueStrings(entries.map((entry) => entry.label)).join(", ");
}

function localObservationEntryList(entries: readonly LocalObservationSurfaceEntry[]): string {
  return entries.map(localObservationSurfaceEntryLabel).join(", ");
}

function isOnlyVisibleActorSurface(kinds: readonly LocalObservationSurfaceKind[]): boolean {
  return kinds.length === 1 && kinds[0] === "visible_actor";
}

function entryMatchesQuery(entry: LocalObservationSurfaceEntry, queryText: string): boolean {
  const query = normalizeObservationMatch(queryText);
  if (query.length === 0) return false;
  const haystacks = [
    entry.label,
    entry.detail ?? "",
    entry.surfaceKind.replace(/_/gu, " "),
  ].map(normalizeObservationMatch).filter((value) => value.length > 0);
  return haystacks.some((value) =>
    value.includes(query) || (query.length >= 3 && query.includes(value))
  );
}

function uniqueObservationEntries(entries: readonly LocalObservationSurfaceEntry[]): LocalObservationSurfaceEntry[] {
  const byEntity = new Map<string, LocalObservationSurfaceEntry>();
  for (const entry of entries) {
    const key = `${normalizedRef(entry.ref)}::${normalizeObservationMatch(entry.label)}`;
    if (!byEntity.has(key)) byEntity.set(key, entry);
  }
  return [...byEntity.values()];
}

function localObservationSummary(input: {
  effect: LocalObservationEffect;
  resultKind: LocalObservationResult["resultKind"];
  matchedEntries: readonly LocalObservationSurfaceEntry[];
}): string {
  const surfaceGroup = localObservationSurfaceGroupLabel(input.effect.surfaceKinds);
  if (input.resultKind === "bounded_no_match") {
    return isOnlyVisibleActorSurface(input.effect.surfaceKinds)
      ? "No visible non-player actors are present in the current scene."
      : `Current ${surfaceGroup} show no match for "${input.effect.queryText}".`;
  }
  const labels = localObservationLabelList(input.matchedEntries);
  if (input.resultKind === "positive_list") {
    return labels.length > 0
      ? `Current ${surfaceGroup} include: ${labels}.`
      : isOnlyVisibleActorSurface(input.effect.surfaceKinds)
        ? "No visible non-player actors are present in the current scene."
        : `Current ${surfaceGroup} include no entries.`;
  }
  const matchedSurfaceLabels = localObservationEntryList(input.matchedEntries);
  if (input.resultKind === "ambiguous_match") {
    return `Multiple current visible matches are available: ${matchedSurfaceLabels}.`;
  }
  return `Current visible match: ${matchedSurfaceLabels}.`;
}

function localObservationResult(input: {
  frame: AuthoritativeSceneFrame;
  effect: LocalObservationEffect;
  resultKind: LocalObservationResult["resultKind"];
  matchedEntries: readonly LocalObservationSurfaceEntry[];
}): LocalObservationResult {
  const summary = localObservationSummary(input);
  const firstMatch = input.matchedEntries[0] ?? null;
  return {
    type: "local_observation",
    surfaceVersion: "scene_frame_current_observation_surface.v1",
    resultKind: input.resultKind,
    mode: input.effect.mode,
    queryText: input.effect.queryText,
    targetLabel: input.resultKind === "positive_match" && firstMatch ? firstMatch.label : null,
    matchedEntries: input.matchedEntries.slice(0, 12).map((entry) => ({
      surfaceKind: entry.surfaceKind,
      label: entry.label,
      detail: entry.detail,
    })),
    searchedSurfaceKinds: input.effect.surfaceKinds,
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    boundedNegative: input.resultKind === "bounded_no_match",
    summary,
    claimStatus: "bounded_current_scene_observation_only",
  };
}

function executeLocalObservation(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  if (input.request.effect.kind !== "local_observation") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "local_observation",
      kind: "invalid_backend_request",
      message: "Stage 4 local_observation request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const parsedEffect = cleanStage4LocalObservationEffectSchema.safeParse(input.request.effect);
  if (!parsedEffect.success) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "local_observation",
      kind: "invalid_backend_request",
      message: parsedEffect.error.issues[0]?.message ?? "Stage 4 local_observation request failed schema validation.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const effect = parsedEffect.data;
  const anchorRefs = new Set([
    normalizedRef(input.frame.scene.currentScene.ref),
    normalizedRef(input.frame.scene.currentLocation.ref),
  ]);
  if (!anchorRefs.has(normalizedRef(effect.anchorRef))) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "local_observation",
      kind: "insufficient_grounding",
      message: "Stage 4 local_observation anchor must be the current SceneFrame scene or location.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const entries = localObservationSurface({
    frame: input.frame,
    surfaceKinds: effect.surfaceKinds,
  });
  let matchedEntries: LocalObservationSurfaceEntry[] = [];
  let resultKind: LocalObservationResult["resultKind"];
  if (effect.mode === "list_surface") {
    matchedEntries = entries.slice(0, 12);
    resultKind = matchedEntries.length > 0 ? "positive_list" : "bounded_no_match";
  } else if (effect.targetRef) {
    matchedEntries = uniqueObservationEntries(entries.filter((entry) =>
      normalizedRef(entry.ref) === normalizedRef(effect.targetRef ?? "")
    )).slice(0, 12);
    resultKind = matchedEntries.length === 0
      ? "bounded_no_match"
      : matchedEntries.length === 1
        ? "positive_match"
        : "ambiguous_match";
  } else {
    matchedEntries = uniqueObservationEntries(entries.filter((entry) => entryMatchesQuery(entry, effect.queryText))).slice(0, 12);
    resultKind = matchedEntries.length === 0
      ? "bounded_no_match"
      : matchedEntries.length === 1
        ? "positive_match"
        : "ambiguous_match";
  }

  if (resultKind === "bounded_no_match" && !effect.allowBoundedNegative) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "local_observation",
      kind: "insufficient_grounding",
      message: "Stage 4 local_observation found no exposed surface entry and bounded negative evidence was not admitted.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const result = localObservationResult({
    frame: input.frame,
    effect,
    resultKind,
    matchedEntries,
  });
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "local_observation",
    summary: result.summary,
    visibleRefs: uniqueStrings([
      "Player",
      effect.anchorRef,
      ...matchedEntries.map((entry) => entry.ref),
    ]).slice(0, 12),
    localObservation: result,
  });
  input.store.insert(receipt);
  return receipt;
}

function uniqueDeviceFacetKinds(kinds: readonly DeviceFacetKind[]): DeviceFacetKind[] {
  return uniqueStrings(kinds) as DeviceFacetKind[];
}

function deviceFacetKindLabel(kind: DeviceFacetKind): string {
  switch (kind) {
    case "screen_state": return "screen state";
    case "power_indicator": return "power indicator";
    case "battery_indicator": return "battery indicator";
    case "signal_indicator": return "signal indicator";
    case "notification_indicator": return "notification indicator";
    case "message_indicator": return "message indicator";
    case "call_indicator": return "call indicator";
    default: return String(kind).replace(/_/gu, " ");
  }
}

function deviceFacetKindListLabel(kinds: readonly DeviceFacetKind[]): string {
  const labels = uniqueDeviceFacetKinds(kinds).map(deviceFacetKindLabel);
  if (labels.length === 0) return "requested device surface facets";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function deviceSurfaceForEffect(input: {
  frame: AuthoritativeSceneFrame;
  effect: DeviceSurfaceObservationEffect;
}): NonNullable<AuthoritativeSceneFrame["deviceStatusSurfaces"]>[number] | null {
  const matches = (input.frame.deviceStatusSurfaces ?? []).filter((surface) =>
    normalizedRef(surface.deviceRef) === normalizedRef(input.effect.deviceRef)
  );
  return matches.length === 1 ? matches[0] : null;
}

function deviceFacetSummary(input: {
  effect: DeviceSurfaceObservationEffect;
  surface: NonNullable<AuthoritativeSceneFrame["deviceStatusSurfaces"]>[number];
  resultKind: DeviceSurfaceObservationResult["resultKind"];
  observedFacets: readonly DeviceSurfaceFacet[];
  unavailableFacetKinds: readonly DeviceFacetKind[];
}): string {
  if (input.resultKind === "no_requested_surface") {
    const unavailable = deviceFacetKindListLabel(input.unavailableFacetKinds);
    return `Current visible device surface for ${input.surface.deviceLabel} exposes no requested ${unavailable}.`;
  }
  const observed = input.observedFacets
    .map((facet) => `${facet.displayLabel}: ${facet.valueText}`)
    .slice(0, 6)
    .join("; ");
  if (input.resultKind === "partial_facets_observed") {
    return `Modeled public device surface for ${input.surface.deviceLabel}: ${observed}. Unavailable requested surface facets: ${deviceFacetKindListLabel(input.unavailableFacetKinds)}.`;
  }
  return `Modeled public device surface for ${input.surface.deviceLabel}: ${observed}.`;
}

function deviceSurfaceObservationResult(input: {
  frame: AuthoritativeSceneFrame;
  effect: DeviceSurfaceObservationEffect;
  surface: NonNullable<AuthoritativeSceneFrame["deviceStatusSurfaces"]>[number];
  resultKind: DeviceSurfaceObservationResult["resultKind"];
  observedFacets: readonly DeviceSurfaceFacet[];
  unavailableFacetKinds: readonly DeviceFacetKind[];
}): DeviceSurfaceObservationResult {
  const summary = deviceFacetSummary(input);
  return {
    type: "device_surface_observation",
    surfaceVersion: "scene_frame_device_status_surface.v1",
    resultKind: input.resultKind,
    deviceLabel: input.surface.deviceLabel,
    requestedFacetText: input.effect.requestedFacetText,
    requestedFacetKinds: uniqueDeviceFacetKinds(input.effect.facetKinds),
    observedFacets: input.observedFacets.slice(0, 12).map((facet) => ({
      facetKind: facet.facetKind,
      displayLabel: facet.displayLabel,
      valueText: facet.valueText,
      valueClass: facet.valueClass,
      claimStatus: "modeled_public_device_surface_only",
    })),
    unavailableFacetKinds: uniqueDeviceFacetKinds(input.unavailableFacetKinds),
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    boundedNoSurface: input.resultKind === "no_requested_surface",
    summary,
    claimStatus: "bounded_current_frame_device_surface_only",
  };
}

function deviceSurfaceObservationReceipt(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  deviceSurfaceObservation: DeviceSurfaceObservationResult;
  visibleRefs: string[];
}): CleanStage4Receipt {
  return assertCleanStage4Receipt({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: `stage4-receipt-${randomUUID()}`,
    requestId: input.request.requestId,
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    stepId: input.step.stepId,
    capabilityId: "device_surface_observation",
    status: "accepted",
    source: input.request.source,
    base: input.frame.base,
    result: {
      tick: input.frame.base.tick,
      worldVersion: input.frame.base.worldVersion,
      worldTimeMinutes: input.frame.base.worldTimeMinutes,
      mutationApplied: false,
    },
    authority: {
      evidenceAuthority: "device_surface_observation_receipt",
      mutationAuthority: "none",
      visibleResultAuthority: "may_claim_device_surface_observation",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: false,
    },
    publicResult: {
      summary: input.deviceSurfaceObservation.summary,
      visibleRefs: input.visibleRefs,
      routeStatus: null,
      routeOptions: null,
      locationChange: null,
      timeAdvance: null,
      visibleObservation: null,
      localObservation: null,
      deviceSurfaceObservation: input.deviceSurfaceObservation,
      sceneBeat: null,
      dialogue: null,
      supportActor: null,
      condition: null,
      itemTransfer: null,
    },
    privateResult: {
      playerId: null,
      fromLocationId: null,
      destinationLocationId: null,
      supportActorId: null,
      supportActorOperation: null,
      conditionId: null,
      conditionOperation: null,
      previousConditionKeys: [],
      nextConditionKeys: [],
      itemId: null,
      itemOperation: null,
      previousOwnerId: null,
      nextOwnerId: null,
      previousLocationId: null,
      nextLocationId: null,
      previousEquipState: null,
      nextEquipState: null,
      previousEquippedSlot: null,
      nextEquippedSlot: null,
      anchorLocationId: null,
      anchorSceneLocationId: null,
      edgeIds: [],
      authorityTraceId: null,
      clockReceiptId: null,
      stateDeltaRefs: [],
    },
    failure: null,
  });
}

function executeDeviceSurfaceObservation(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  if (input.request.effect.kind !== "device_surface_observation") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "invalid_backend_request",
      message: "Stage 4 device_surface_observation request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const parsedEffect = cleanStage4DeviceSurfaceObservationEffectSchema.safeParse(input.request.effect);
  if (!parsedEffect.success) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "invalid_backend_request",
      message: parsedEffect.error.issues[0]?.message ?? "Stage 4 device_surface_observation request failed schema validation.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const effect = parsedEffect.data;
  const anchorRefs = new Set([
    normalizedRef(input.frame.scene.currentScene.ref),
    normalizedRef(input.frame.scene.currentLocation.ref),
  ]);
  if (!anchorRefs.has(normalizedRef(effect.anchorRef))) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "insufficient_grounding",
      message: "Stage 4 device_surface_observation anchor must be the current SceneFrame scene or location.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  if (!effectRefsAreCitable({
    frame: input.frame,
    refs: uniqueStrings(["Player", effect.anchorRef, effect.deviceRef, ...effect.evidenceRefs]),
  })) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "insufficient_grounding",
      message: "Stage 4 device_surface_observation refs must be citable current SceneFrame refs.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const surface = deviceSurfaceForEffect({ frame: input.frame, effect });
  if (!surface) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "missing_or_ambiguous_item",
      message: "Stage 4 device_surface_observation deviceRef is not a single exposed SceneFrame device surface.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  if (normalizedRef(surface.anchorRef) !== normalizedRef(input.frame.scene.currentScene.ref)) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "insufficient_grounding",
      message: "Stage 4 device_surface_observation surface is not anchored to the current SceneFrame scene.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const requestedKinds = uniqueDeviceFacetKinds(effect.facetKinds);
  const requested = new Set(requestedKinds);
  const observedFacets = surface.facets
    .filter((facet) => facet.publicSafe && requested.has(facet.facetKind))
    .slice(0, 12);
  const observedKinds = new Set(observedFacets.map((facet) => facet.facetKind));
  const unavailableFacetKinds = requestedKinds.filter((kind) => !observedKinds.has(kind));
  const resultKind: DeviceSurfaceObservationResult["resultKind"] = observedFacets.length === 0
    ? "no_requested_surface"
    : unavailableFacetKinds.length > 0
      ? "partial_facets_observed"
      : "facets_observed";
  if (resultKind === "no_requested_surface" && !effect.allowNoSurface) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "device_surface_observation",
      kind: "insufficient_grounding",
      message: "Stage 4 device_surface_observation found no modeled/exposed requested device surface and bounded no-surface evidence was not admitted.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const result = deviceSurfaceObservationResult({
    frame: input.frame,
    effect,
    surface,
    resultKind,
    observedFacets,
    unavailableFacetKinds,
  });
  const receipt = deviceSurfaceObservationReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    deviceSurfaceObservation: result,
    visibleRefs: uniqueStrings(["Player", effect.anchorRef, effect.deviceRef, ...effect.evidenceRefs]).slice(0, 12),
  });
  input.store.insert(receipt);
  return receipt;
}

function executeRouteOptions(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const options = input.frame.movementOptions.map((option) => ({
    label: option.label,
    connected: option.connected,
    travelCost: option.travelCost,
  }));
  const summary = options.length > 0
    ? `Visible route options from ${input.frame.scene.currentLocation.label} include ${options.map((option) => option.label).join(", ")}.`
    : `No route options are exposed by the current scene frame for ${input.frame.scene.currentLocation.label}.`;
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "route_options",
    summary,
    visibleRefs: ["Player", input.frame.scene.currentLocation.ref, ...input.frame.movementOptions.map((option) => option.ref)].slice(0, 12),
    routeOptions: {
      type: "route_options",
      fromLabel: input.frame.scene.currentLocation.label,
      options,
    },
  });
  input.store.insert(receipt);
  return receipt;
}

function executeSceneBeat(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const targetLabels = input.step.targetRefs.map((ref) => labelForRef(input.frame, ref)).slice(0, 8);
  const summary = targetLabels.length > 0
    ? `Player's local visible beat is acknowledged in ${input.frame.scene.currentScene.label} with ${targetLabels.join(", ")}.`
    : `Player's local visible beat is acknowledged in ${input.frame.scene.currentScene.label}.`;
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "scene_beat_record",
    summary,
    visibleRefs: ["Player", input.frame.scene.currentScene.ref, ...input.step.targetRefs].slice(0, 12),
    sceneBeat: {
      type: "scene_beat",
      beatKind: "generic_scene_beat",
      summary,
      targetLabels,
    },
  });
  input.store.insert(receipt);
  return receipt;
}

async function executeDialogueRecord(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  dependencyResolution?: Stage4DialogueDependencyResolution | null;
  provider?: ProviderConfig;
  generateDialogueRequest?: Stage4DialogueRequestGenerator;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const builtRequest = await buildDialogueRequest({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    dependencyResolution: input.dependencyResolution,
    provider: input.provider,
    generateDialogueRequest: input.generateDialogueRequest,
  });
  if (builtRequest.status === "failed") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "dialogue_record",
      kind: "invalid_backend_request",
      message: `Stage 4 dialogue request was not accepted: ${builtRequest.issues[0]?.message ?? "invalid dialogue request"}`,
    });
    input.store.insert(receipt);
    return receipt;
  }

  const effect = builtRequest.request.effect;
  if (effect.kind !== "dialogue_record") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "dialogue_record",
      kind: "invalid_backend_request",
      message: "Stage 4 dialogue request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const speaker = input.frame.actors.find((actor) =>
    actor.role !== "player" && normalizedRef(actor.ref) === normalizedRef(effect.speakerRef)
  );
  if (!speaker) {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "dialogue_record",
      kind: "insufficient_grounding",
      message: "Stage 4 dialogue speaker is not an already-visible non-player actor.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const addresseeLabels = effect.addresseeRefs.map((ref) => labelForRef(input.frame, ref)).slice(0, 8);
  const dialogue = {
    type: "dialogue_response" as const,
    authorityKind: "existing_visible_actor" as const,
    speakerLabel: speaker.label,
    addresseeLabels,
    outcomeKind: effect.outcomeKind,
    quotedSpeech: effect.response.quotedSpeech,
    summary: effect.response.summary,
    responseLanguage: "match_player_action" as const,
    claimStatus: "visible_speaker_response_only" as const,
  };
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: builtRequest.request,
    status: "accepted",
    capabilityId: "dialogue_record",
    summary: `${speaker.label} dialogue response recorded (${dialogue.outcomeKind}).`,
    visibleRefs: uniqueStrings(["Player", speaker.ref, ...effect.addresseeRefs]).slice(0, 12),
    dialogue,
  });
  input.store.insert(receipt);
  return receipt;
}

function supportActorMaterializationResult(input: {
  effect: SupportActorCreateEffect;
  resultKind: "created" | "reused";
  actorLabel: string;
  roleLabel: string;
  frame: AuthoritativeSceneFrame;
}): SupportActorMaterializationResult {
  return {
    type: "support_actor_materialization",
    resultKind: input.resultKind,
    actorRef: input.actorLabel,
    actorLabel: input.actorLabel,
    roleKind: input.effect.roleKind,
    roleLabel: input.roleLabel,
    anchorSceneLabel: input.frame.scene.currentScene.label,
    anchorLocationLabel: input.frame.scene.currentLocation.label,
    publicSummary: input.effect.publicPresentation.publicSummary,
    visibleCue: input.effect.publicPresentation.visibleCue,
    identityBounds: {
      tier: "temporary",
      persistence: "current_scene",
      significance: "minor_support",
      agency: "reactive_only",
    },
    claimStatus: "visible_support_actor_materialization_only",
  };
}

function supportActorCollisionMessage(): string {
  return "Stage 4 support actor materialization could not be accepted for the current scene.";
}

async function executeSupportActorCreate(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  provider?: ProviderConfig;
  generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const builtRequest = await buildSupportActorRequest({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    provider: input.provider,
    generateSupportActorRequest: input.generateSupportActorRequest,
  });
  if (builtRequest.status === "failed") {
    const message = supportActorFailureMessage(
      builtRequest.issues[0]?.message ?? "invalid support actor request",
    );
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "support_actor_create",
      kind: "invalid_backend_request",
      message,
    });
    input.store.insert(receipt);
    return receipt;
  }

  const effect = builtRequest.request.effect;
  if (effect.kind !== "support_actor_create") {
    const receipt = failReceipt({
      frame: input.frame,
      checklist: input.checklist,
      step: input.step,
      request: builtRequest.request,
      capabilityId: "support_actor_create",
      kind: "invalid_backend_request",
      message: "Stage 4 support actor request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-support-actor-create", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id || !player.current_scene_location_id) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 current scene is unavailable for support actor materialization." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const currentLocation = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
      const currentScene = locationByLabel(input.frame, input.frame.scene.currentScene.label);
      if (
        !currentLocation
        || !currentScene
        || player.current_location_id !== currentLocation.id
        || player.current_scene_location_id !== currentScene.id
      ) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "stale_frame_or_clock",
          message: "Stage 4 current scene no longer matches the SceneFrame.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const labels = supportActorLabels(effect.roleKind);
      const actorLabel = labels.actorLabel;
      const roleLabel = labels.roleLabel;
      const supportActorLocationId = currentScene.parent_location_id ?? currentLocation.id;
      const normalizedActorLabel = actorLabel.trim().toLowerCase();
      const visibleLabelCollision = [
        input.frame.player.label,
        ...input.frame.actors.map((actor) => actor.label),
      ].some((label) => label.trim().toLowerCase() === normalizedActorLabel);
      if (visibleLabelCollision) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "insufficient_grounding",
          message: supportActorCollisionMessage(),
        });
        input.store.insert(receipt);
        return receipt;
      }

      const candidateRows = db.prepare(`
        SELECT
          id,
          name,
          persona,
          tags,
          derived_tags,
          tier,
          current_location_id,
          current_scene_location_id
        FROM npcs
        WHERE campaign_id = ?
      `).all(input.frame.campaignId) as NpcSupportRow[];
      const sameNameRows = candidateRows.filter((row) => row.name.trim().toLowerCase() === normalizedActorLabel);
      const reusableRows = candidateRows.filter((row) => isReusableSupportActor({
        row,
        roleKind: effect.roleKind,
        currentLocationId: supportActorLocationId,
        currentSceneLocationId: currentScene.id,
      }));
      if (sameNameRows.length > 0) {
        const exactNameReusableRows = sameNameRows.filter((row) => isReusableSupportActor({
          row,
          roleKind: effect.roleKind,
          currentLocationId: supportActorLocationId,
          currentSceneLocationId: currentScene.id,
        }));
        if (sameNameRows.length === 1 && exactNameReusableRows.length === 1) {
          const reusable = exactNameReusableRows[0];
          const supportActor = supportActorMaterializationResult({
            effect,
            resultKind: "reused",
            actorLabel: reusable.name,
            roleLabel,
            frame: input.frame,
          });
          const receipt = baseReceipt({
            frame: input.frame,
            checklist: input.checklist,
            step: input.step,
            request: builtRequest.request,
            status: "accepted",
            capabilityId: "support_actor_create",
            summary: `${reusable.name} is already available as a ${roleLabel} in ${input.frame.scene.currentScene.label}.`,
            visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, reusable.name]).slice(0, 12),
            supportActor,
            supportActorId: reusable.id,
            supportActorOperation: "reused",
            anchorLocationId: currentLocation.id,
            anchorSceneLocationId: currentScene.id,
          });
          input.store.insert(receipt);
          return receipt;
        }

        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "insufficient_grounding",
          message: supportActorCollisionMessage(),
        });
        input.store.insert(receipt);
        return receipt;
      }
      if (reusableRows.length === 1) {
        const reusable = reusableRows[0];
        const supportActor = supportActorMaterializationResult({
          effect,
          resultKind: "reused",
          actorLabel: reusable.name,
          roleLabel,
          frame: input.frame,
        });
        const receipt = baseReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          status: "accepted",
          capabilityId: "support_actor_create",
          summary: `${reusable.name} is already available as a ${roleLabel} in ${input.frame.scene.currentScene.label}.`,
          visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, reusable.name]).slice(0, 12),
          supportActor,
          supportActorId: reusable.id,
          supportActorOperation: "reused",
          anchorLocationId: currentLocation.id,
          anchorSceneLocationId: currentScene.id,
        });
        input.store.insert(receipt);
        return receipt;
      }
      if (reusableRows.length > 1) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "insufficient_grounding",
          message: supportActorCollisionMessage(),
        });
        input.store.insert(receipt);
        return receipt;
      }

      const receiptId = `stage4-receipt-${randomUUID()}`;
      const actorId = `stage4-support-actor-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const resultWorldVersion = clock.world_version + 1;
      const stateDeltaRefs = [`npc:${actorId}:created`, `scene:${currentScene.id}:support_actors`];
      const now = Date.now();
      const tags = [
        "temporary-support",
        "clean-runtime-support",
        `support-role:${effect.roleKind}`,
        "current-scene",
        "minor-support",
        "reactive-only",
      ];
      const characterRecord = {
        identity: {
          id: actorId,
          campaignId: input.frame.campaignId,
          role: "npc",
          tier: "temporary",
          displayName: actorLabel,
          canonicalStatus: "original",
          baseFacts: {
            biography: effect.publicPresentation.publicSummary,
            socialRole: [roleLabel],
            hardConstraints: [
              "Temporary current-scene support actor.",
              "Reactive only; no persistent significance from creation.",
            ],
          },
          behavioralCore: {
            motives: [],
            pressureResponses: [],
            taboos: [],
            attachments: [],
            selfImage: effect.publicPresentation.publicSummary,
          },
          liveDynamics: {
            attachments: [],
            activeGoals: [],
            beliefDrift: [],
            currentStrains: [],
            earnedChanges: [],
          },
          personality: {
            summary: "",
            voice: effect.publicPresentation.voiceHint ?? "",
            decisionStyle: "",
            worldview: "",
            internalContradictions: [],
            personalMythology: "",
            sampleLines: [],
          },
        },
        profile: {
          species: "",
          gender: "",
          ageText: "",
          appearance: effect.publicPresentation.visibleCue ?? "",
          backgroundSummary: "",
          personaSummary: effect.publicPresentation.publicSummary,
        },
        socialContext: {
          factionId: null,
          factionName: null,
          homeLocationId: null,
          homeLocationName: null,
          currentLocationId: supportActorLocationId,
          currentLocationName: input.frame.scene.currentLocation.label,
          relationshipRefs: [],
          socialStatus: [roleLabel],
          originMode: "resident",
        },
        motivations: {
          shortTermGoals: [],
          longTermGoals: [],
          beliefs: [],
          drives: [],
          frictions: [],
        },
        capabilities: {
          traits: [],
          skills: [],
          flaws: [],
          specialties: [],
          wealthTier: null,
        },
        state: {
          hp: 1,
          conditions: [],
          statusFlags: [],
          activityState: "active",
        },
        loadout: {
          inventorySeed: [],
          equippedItemRefs: [],
          currencyNotes: "",
          signatureItems: [],
        },
        startConditions: {},
        provenance: {
          sourceKind: "runtime",
          importMode: null,
          templateId: null,
          archetypePrompt: null,
          worldgenOrigin: null,
          legacyTags: tags,
        },
      };
      const update = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        now,
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (update.changes !== 1) {
        const receipt = failReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: builtRequest.request,
          capabilityId: "support_actor_create",
          kind: "stale_frame_or_clock",
          message: "Stage 4 support actor materialization found stale world clock state.",
        });
        input.store.insert(receipt);
        return receipt;
      }
      db.prepare(`
        INSERT INTO npcs (
          id,
          campaign_id,
          name,
          persona,
          character_record,
          derived_tags,
          tags,
          tier,
          current_location_id,
          current_scene_location_id,
          goals,
          beliefs,
          unprocessed_importance,
          inactive_ticks,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        actorId,
        input.frame.campaignId,
        actorLabel,
        effect.publicPresentation.publicSummary,
        JSON.stringify(characterRecord),
        JSON.stringify(tags),
        JSON.stringify(tags),
        "temporary",
        supportActorLocationId,
        currentScene.id,
        JSON.stringify({ short_term: [], long_term: [] }),
        "[]",
        0,
        0,
        now,
      );
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.support_actor.materialize.v1",
        "npc",
        actorId,
        clock.world_version,
        resultWorldVersion,
        clock.world_time_minutes,
        0,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(effect.evidenceRefs),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          capabilityId: "support_actor_create",
          roleKind: effect.roleKind,
          roleLabel,
          anchorScope: "current_scene",
          anchorRef: effect.anchorRef,
          resultKind: "created",
        }),
        now,
      );

      const supportActor = supportActorMaterializationResult({
        effect,
        resultKind: "created",
        actorLabel,
        roleLabel,
        frame: input.frame,
      });
      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: builtRequest.request,
        status: "accepted",
        capabilityId: "support_actor_create",
        summary: `${actorLabel} is materialized as a ${roleLabel} in ${input.frame.scene.currentScene.label}.`,
        visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, actorLabel]).slice(0, 12),
        supportActor,
        resultWorldVersion,
        mutationApplied: true,
        authorityTraceId,
        playerId: player.id,
        supportActorId: actorId,
        supportActorOperation: "inserted",
        anchorLocationId: currentLocation.id,
        anchorSceneLocationId: currentScene.id,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    return transaction();
  });
}

async function executePlayerLocalConditionSet(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "condition_set") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "condition_set",
      kind: "invalid_backend_request",
      message: "Stage 4 condition_set request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const plan = input.step.intended.localConditionPlan;
  if (!plan) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "condition_set",
      kind: "invalid_backend_request",
      message: "Stage 4 condition_set requires a typed backend localConditionPlan.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const parsedEffect = cleanStage4LocalConditionSetEffectSchema.safeParse(effect);
  if (!parsedEffect.success) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "condition_set",
      kind: "invalid_backend_request",
      message: parsedEffect.error.issues[0]?.message ?? "Stage 4 condition_set request failed schema validation.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const target = conditionTargetIsValid({ frame: input.frame, effect });
  if (!target.ok) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "condition_set",
      kind: "missing_or_ambiguous_condition_target",
      message: target.message,
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-player-local-condition-set", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id || !player.current_scene_location_id) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "condition_set",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 current scene is unavailable for player local condition." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const currentLocation = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
      const currentScene = locationByLabel(input.frame, input.frame.scene.currentScene.label);
      if (
        !currentLocation
        || !currentScene
        || player.current_location_id !== currentLocation.id
        || player.current_scene_location_id !== currentScene.id
      ) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "condition_set",
          kind: "stale_frame_or_clock",
          message: "Stage 4 current scene no longer matches the SceneFrame.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const activeRows = activeLocalConditionRows({
        campaignId: input.frame.campaignId,
        playerId: player.id,
        currentSceneLocationId: currentScene.id,
      });
      const exactRows = activeRows.filter((row) => row.condition_key === effect.conditionKey);
      const previousConditionKeys = uniqueStrings(activeRows.map((row) => row.condition_key)) as LocalConditionSetEffect["conditionKey"][];

      if (exactRows.length > 1) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "condition_set",
          kind: "condition_state_conflict",
          message: "Stage 4 found ambiguous active player local condition rows.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      if (effect.operation === "clear") {
        if (exactRows.length === 0) {
          const receipt = skipReceipt({
            ...input,
            capabilityId: "condition_set",
            kind: "condition_not_active",
            message: `${localConditionLabel(effect.conditionKey)} is not active in the current scene.`,
          });
          input.store.insert(receipt);
          return receipt;
        }

        const receiptId = `stage4-receipt-${randomUUID()}`;
        const authorityTraceId = `stage4-authority-${randomUUID()}`;
        const resultWorldVersion = clock.world_version + 1;
        const stateDeltaRefs = [`player:${player.id}:condition:${effect.conditionKey}:cleared`];
        const now = Date.now();
        const update = db.prepare(`
          UPDATE world_clocks
          SET world_version = ?, updated_at = ?
          WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
        `).run(
          resultWorldVersion,
          now,
          input.frame.campaignId,
          clock.world_version,
          clock.world_time_minutes,
        );
        if (update.changes !== 1) {
          const receipt = failReceipt({
            ...input,
            capabilityId: "condition_set",
            kind: "stale_frame_or_clock",
            message: "Stage 4 condition_set found stale world clock state.",
          });
          input.store.insert(receipt);
          return receipt;
        }
        db.prepare(`
          UPDATE clean_gameplay_actor_conditions
          SET active = 0, cleared_receipt_id = ?, updated_at = ?
          WHERE condition_id = ? AND active = 1
        `).run(receiptId, now, exactRows[0].condition_id);
        db.prepare(`
          INSERT INTO authority_traces (
            id,
            campaign_id,
            operation,
            source_entity_type,
            source_entity_id,
            base_world_version,
            result_world_version,
            world_time_minutes,
            elapsed_world_time_minutes,
            tool_result_id,
            event_ids,
            state_delta_refs,
            witnesses,
            metadata,
            created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          authorityTraceId,
          input.frame.campaignId,
          "gameplay-cycle-runtime.player.condition_set.v1",
          "player",
          player.id,
          clock.world_version,
          resultWorldVersion,
          clock.world_time_minutes,
          0,
          receiptId,
          "[]",
          JSON.stringify(stateDeltaRefs),
          JSON.stringify(effect.evidenceRefs),
          JSON.stringify({
            checklistId: input.checklist.checklistId,
            stepId: input.step.stepId,
            capabilityId: "condition_set",
            operation: "clear",
            conditionKey: effect.conditionKey,
            anchorScope: "current_scene",
            anchorRef: effect.anchorRef,
            resultKind: "cleared",
          }),
          now,
        );

        const condition = localConditionResult({
          frame: input.frame,
          effect,
          resultKind: "cleared",
          targetLabel: target.targetLabel,
        });
        const receipt = baseReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: input.request,
          status: "accepted",
          capabilityId: "condition_set",
          summary: `Player clears ${condition.conditionLabel} in ${input.frame.scene.currentScene.label}.`,
          visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, ...(effect.target.targetRef ? [effect.target.targetRef] : [])]).slice(0, 12),
          condition,
          resultWorldVersion,
          mutationApplied: true,
          authorityTraceId,
          playerId: player.id,
          conditionId: exactRows[0].condition_id,
          conditionOperation: "cleared",
          previousConditionKeys,
          nextConditionKeys: conditionKeysAfter({
            activeRows,
            clearedConditionIds: [exactRows[0].condition_id],
            appliedConditionKey: null,
          }),
          anchorLocationId: currentLocation.id,
          anchorSceneLocationId: currentScene.id,
          stateDeltaRefs,
        });
        const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
        input.store.insert(finalReceipt);
        return finalReceipt;
      }

      if (exactRows.length === 1) {
        const condition = localConditionResult({
          frame: input.frame,
          effect,
          resultKind: "already_present",
          targetLabel: target.targetLabel,
        });
        const receipt = baseReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: input.request,
          status: "accepted",
          capabilityId: "condition_set",
          summary: `Player is already ${condition.conditionLabel} in ${input.frame.scene.currentScene.label}.`,
          visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, ...(effect.target.targetRef ? [effect.target.targetRef] : [])]).slice(0, 12),
          condition,
          playerId: player.id,
          conditionId: exactRows[0].condition_id,
          conditionOperation: "already_present",
          previousConditionKeys,
          nextConditionKeys: previousConditionKeys,
          anchorLocationId: currentLocation.id,
          anchorSceneLocationId: currentScene.id,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const conditionGroup = localConditionGroup(effect.conditionKey);
      const replacedRows = effect.replacementPolicy === "replace_same_condition_group"
        ? activeRows.filter((row) => row.condition_group === conditionGroup)
        : [];
      const receiptId = `stage4-receipt-${randomUUID()}`;
      const conditionId = `stage4-condition-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const resultWorldVersion = clock.world_version + 1;
      const resultKind: PlayerLocalConditionResult["resultKind"] = replacedRows.length > 0 ? "replaced" : "applied";
      const stateDeltaRefs = [
        ...replacedRows.map((row) => `player:${player.id}:condition:${row.condition_key}:replaced`),
        `player:${player.id}:condition:${effect.conditionKey}:applied`,
      ];
      const now = Date.now();
      const update = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        now,
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (update.changes !== 1) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "condition_set",
          kind: "stale_frame_or_clock",
          message: "Stage 4 condition_set found stale world clock state.",
        });
        input.store.insert(receipt);
        return receipt;
      }
      for (const row of replacedRows) {
        db.prepare(`
          UPDATE clean_gameplay_actor_conditions
          SET active = 0, cleared_receipt_id = ?, updated_at = ?
          WHERE condition_id = ? AND active = 1
        `).run(receiptId, now, row.condition_id);
      }
      db.prepare(`
        INSERT INTO clean_gameplay_actor_conditions (
          condition_id,
          campaign_id,
          actor_type,
          player_id,
          condition_key,
          condition_label,
          condition_group,
          condition_scope,
          anchor_location_id,
          anchor_scene_location_id,
          target_kind,
          target_ref,
          target_label,
          active,
          applied_receipt_id,
          cleared_receipt_id,
          base_world_version,
          result_world_version,
          created_at,
          updated_at
        ) VALUES (?, ?, 'player', ?, ?, ?, ?, 'current_scene', ?, ?, ?, ?, ?, 1, ?, NULL, ?, ?, ?, ?)
      `).run(
        conditionId,
        input.frame.campaignId,
        player.id,
        effect.conditionKey,
        localConditionLabel(effect.conditionKey),
        conditionGroup,
        currentLocation.id,
        currentScene.id,
        effect.target.targetKind,
        effect.target.targetRef,
        target.targetLabel,
        receiptId,
        clock.world_version,
        resultWorldVersion,
        now,
        now,
      );
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.player.condition_set.v1",
        "player",
        player.id,
        clock.world_version,
        resultWorldVersion,
        clock.world_time_minutes,
        0,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(effect.evidenceRefs),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          capabilityId: "condition_set",
          operation: "apply",
          conditionKey: effect.conditionKey,
          anchorScope: "current_scene",
          anchorRef: effect.anchorRef,
          replacementPolicy: effect.replacementPolicy,
          resultKind,
        }),
        now,
      );

      const condition = localConditionResult({
        frame: input.frame,
        effect,
        resultKind,
        targetLabel: target.targetLabel,
      });
      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        status: "accepted",
        capabilityId: "condition_set",
        summary: `Player is ${condition.conditionLabel} in ${input.frame.scene.currentScene.label}.`,
        visibleRefs: uniqueStrings(["Player", input.frame.scene.currentScene.ref, ...(effect.target.targetRef ? [effect.target.targetRef] : [])]).slice(0, 12),
        condition,
        resultWorldVersion,
        mutationApplied: true,
        authorityTraceId,
        playerId: player.id,
        conditionId,
        conditionOperation: resultKind,
        previousConditionKeys,
        nextConditionKeys: conditionKeysAfter({
          activeRows,
          clearedConditionIds: replacedRows.map((row) => row.condition_id),
          appliedConditionKey: effect.conditionKey,
        }),
        anchorLocationId: currentLocation.id,
        anchorSceneLocationId: currentScene.id,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    try {
      return transaction();
    } catch {
      const receipt = failReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        capabilityId: "condition_set",
        kind: "mutation_apply_failed",
        message: "Stage 4 condition_set mutation transaction failed before commit.",
      });
      input.store.insert(receipt);
      return receipt;
    }
  });
}

async function executeItemTransfer(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "item_transfer") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "item_transfer",
      kind: "invalid_backend_request",
      message: "Stage 4 item_transfer request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  if (!input.step.intended.itemTransferPlan) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "item_transfer",
      kind: "invalid_backend_request",
      message: "Stage 4 item_transfer requires a typed backend itemTransferPlan.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const parsedEffect = cleanStage4ItemTransferEffectSchema.safeParse(effect);
  if (!parsedEffect.success) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "item_transfer",
      kind: "invalid_backend_request",
      message: parsedEffect.error.issues[0]?.message ?? "Stage 4 item_transfer request failed schema validation.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  if (normalizedRef(effect.anchorRef) !== normalizedRef(input.frame.scene.currentScene.ref)) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "item_transfer",
      kind: "invalid_backend_request",
      message: "Stage 4 item_transfer anchor must be the current SceneFrame scene.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  if (!effectRefsAreCitable({
    frame: input.frame,
    refs: uniqueStrings([
      effect.actorRef,
      effect.itemRef,
      effect.target.targetRef,
      effect.anchorRef,
      ...effect.evidenceRefs,
    ]),
  })) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "item_transfer",
      kind: "invalid_backend_request",
      message: "Stage 4 item_transfer cited refs outside SceneFrame.citableRefs or backend-looking refs.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-item-transfer", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id || !player.current_scene_location_id) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "item_transfer",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 current scene is unavailable for item_transfer." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const currentLocation = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
      const currentScene = locationByLabel(input.frame, input.frame.scene.currentScene.label);
      if (
        !currentLocation
        || !currentScene
        || player.current_location_id !== currentLocation.id
        || player.current_scene_location_id !== currentScene.id
      ) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "item_transfer",
          kind: "stale_frame_or_clock",
          message: "Stage 4 current scene no longer matches the SceneFrame.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const visibleSource = effect.source.sourceKind === "player_inventory"
        ? input.frame.inventory.find((item) => normalizedRef(item.ref) === normalizedRef(effect.itemRef))
        : input.frame.targets.find((target) =>
          target.kind === "item" && normalizedRef(target.ref) === normalizedRef(effect.itemRef)
        );
      if (!visibleSource) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "item_transfer",
          kind: "missing_or_ambiguous_item",
          message: "Stage 4 item_transfer source item is not present in the accepted SceneFrame source surface.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const target = itemTransferTargetForEffect({
        frame: input.frame,
        effect,
        player,
        currentLocationId: currentLocation.id,
        currentSceneLocationId: currentScene.id,
      });
      if (!target.ok) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "item_transfer",
          kind: target.kind,
          message: target.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const itemLabel = visibleSource.label;
      const itemRows = itemRowsForCampaign(input.frame.campaignId);
      const item = itemByVisibleLabel({
        rows: itemRows,
        label: itemLabel,
        sourceKind: effect.source.sourceKind,
        playerId: player.id,
        currentSceneLocationId: currentScene.id,
      });
      if (!item.ok) {
        const finalStateRow = itemRows.filter((row) => normalizedRef(row.name) === normalizedRef(itemLabel))
          .find((row) => itemTransferStateMatches({
            row,
            nextOwnerId: target.nextOwnerId,
            nextLocationId: target.nextLocationId,
            nextEquipState: target.nextEquipState,
            nextEquippedSlot: target.nextEquippedSlot,
          })) ?? null;
        if (finalStateRow) {
          const result = itemTransferResult({
            frame: input.frame,
            effect,
            resultKind: "already_satisfied",
            itemLabel,
            sourceLabel: effect.source.sourceKind === "player_inventory" ? input.frame.player.label : input.frame.scene.currentScene.label,
            targetLabel: target.targetLabel,
            finalOwnerKind: target.finalOwnerKind,
            finalLocationKind: target.finalLocationKind,
            finalEquipState: target.nextEquipState,
            finalEquippedSlot: target.nextEquippedSlot,
          });
          const receipt = itemTransferReceipt({
            frame: input.frame,
            checklist: input.checklist,
            step: input.step,
            request: input.request,
            itemTransfer: result,
            mutationApplied: false,
            playerId: player.id,
            itemId: finalStateRow.id,
            previousOwnerId: finalStateRow.owner_id,
            nextOwnerId: finalStateRow.owner_id,
            previousLocationId: finalStateRow.location_id,
            nextLocationId: finalStateRow.location_id,
            previousEquipState: finalStateRow.equip_state,
            nextEquipState: finalStateRow.equip_state,
            previousEquippedSlot: finalStateRow.equipped_slot,
            nextEquippedSlot: finalStateRow.equipped_slot,
            anchorLocationId: currentLocation.id,
            anchorSceneLocationId: currentScene.id,
          });
          input.store.insert(receipt);
          return receipt;
        }
        const receipt = failReceipt({
          ...input,
          capabilityId: "item_transfer",
          kind: item.kind,
          message: item.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const sourceRequiresEquip = effect.source.requiredEquipState;
      if (
        sourceRequiresEquip
        && item.row.equip_state !== sourceRequiresEquip
        && !itemTransferStateMatches({
          row: item.row,
          nextOwnerId: target.nextOwnerId,
          nextLocationId: target.nextLocationId,
          nextEquipState: target.nextEquipState,
          nextEquippedSlot: target.nextEquippedSlot,
        })
      ) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "item_transfer",
          kind: "source_state_mismatch",
          message: "Stage 4 item_transfer item equip state does not match the accepted request source.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      if (effect.operation === "equip_inventory_item" && isExclusiveEquipmentSlot(target.nextEquippedSlot)) {
        const slotConflict = itemRows.some((row) =>
          row.id !== item.row.id
          && row.owner_id === player.id
          && row.equip_state === "equipped"
          && row.equipped_slot === target.nextEquippedSlot
        );
        if (slotConflict) {
          const receipt = failReceipt({
            ...input,
            capabilityId: "item_transfer",
            kind: "equip_slot_conflict",
            message: "Stage 4 item_transfer cannot equip into an occupied player equipment slot.",
          });
          input.store.insert(receipt);
          return receipt;
        }
      }

      if (itemTransferStateMatches({
        row: item.row,
        nextOwnerId: target.nextOwnerId,
        nextLocationId: target.nextLocationId,
        nextEquipState: target.nextEquipState,
        nextEquippedSlot: target.nextEquippedSlot,
      })) {
        const result = itemTransferResult({
          frame: input.frame,
          effect,
          resultKind: "already_satisfied",
          itemLabel,
          sourceLabel: effect.source.sourceKind === "player_inventory" ? input.frame.player.label : input.frame.scene.currentScene.label,
          targetLabel: target.targetLabel,
          finalOwnerKind: target.finalOwnerKind,
          finalLocationKind: target.finalLocationKind,
          finalEquipState: target.nextEquipState,
          finalEquippedSlot: target.nextEquippedSlot,
        });
        const receipt = itemTransferReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: input.request,
          itemTransfer: result,
          mutationApplied: false,
          playerId: player.id,
          itemId: item.row.id,
          previousOwnerId: item.row.owner_id,
          nextOwnerId: item.row.owner_id,
          previousLocationId: item.row.location_id,
          nextLocationId: item.row.location_id,
          previousEquipState: item.row.equip_state,
          nextEquipState: item.row.equip_state,
          previousEquippedSlot: item.row.equipped_slot,
          nextEquippedSlot: item.row.equipped_slot,
          anchorLocationId: currentLocation.id,
          anchorSceneLocationId: currentScene.id,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const receiptId = `stage4-receipt-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const resultWorldVersion = clock.world_version + 1;
      const now = Date.now();
      const resultKind = itemTransferResultKind(effect.operation);
      const stateDeltaRefs = uniqueStrings([
        `item:${item.row.id}:owner`,
        `item:${item.row.id}:location`,
        `item:${item.row.id}:equip_state`,
      ]);
      const updateItem = db.prepare(`
        UPDATE items
        SET owner_id = ?, location_id = ?, equip_state = ?, equipped_slot = ?
        WHERE id = ?
          AND campaign_id = ?
          AND owner_id IS ?
          AND location_id IS ?
          AND equip_state = ?
          AND equipped_slot IS ?
      `).run(
        target.nextOwnerId,
        target.nextLocationId,
        target.nextEquipState,
        target.nextEquippedSlot,
        item.row.id,
        input.frame.campaignId,
        item.row.owner_id,
        item.row.location_id,
        item.row.equip_state,
        item.row.equipped_slot,
      );
      if (updateItem.changes !== 1) {
        throw new Error("item row optimistic update failed");
      }
      refreshInventoryCompatibilityProjectionForActor(input.frame.campaignId, item.row.owner_id);
      refreshInventoryCompatibilityProjectionForActor(input.frame.campaignId, target.nextOwnerId);
      const updateClock = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        now,
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (updateClock.changes !== 1) {
        throw new Error("item transfer clock update failed");
      }
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.item_transfer.v1",
        "item",
        item.row.id,
        clock.world_version,
        resultWorldVersion,
        clock.world_time_minutes,
        0,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(effect.evidenceRefs),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          capabilityId: "item_transfer",
          operation: effect.operation,
          resultKind,
          sourceKind: effect.source.sourceKind,
          targetKind: effect.target.targetKind,
          anchorScope: "current_scene",
          anchorRef: effect.anchorRef,
        }),
        now,
      );

      const result = itemTransferResult({
        frame: input.frame,
        effect,
        resultKind,
        itemLabel,
        sourceLabel: effect.source.sourceKind === "player_inventory" ? input.frame.player.label : input.frame.scene.currentScene.label,
        targetLabel: target.targetLabel,
        finalOwnerKind: target.finalOwnerKind,
        finalLocationKind: target.finalLocationKind,
        finalEquipState: target.nextEquipState,
        finalEquippedSlot: target.nextEquippedSlot,
      });
      const receipt = itemTransferReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        receiptId,
        itemTransfer: result,
        resultWorldVersion,
        mutationApplied: true,
        authorityTraceId,
        playerId: player.id,
        itemId: item.row.id,
        previousOwnerId: item.row.owner_id,
        nextOwnerId: target.nextOwnerId,
        previousLocationId: item.row.location_id,
        nextLocationId: target.nextLocationId,
        previousEquipState: item.row.equip_state,
        nextEquipState: target.nextEquipState,
        previousEquippedSlot: item.row.equipped_slot,
        nextEquippedSlot: target.nextEquippedSlot,
        anchorLocationId: currentLocation.id,
        anchorSceneLocationId: currentScene.id,
        stateDeltaRefs,
      });
      input.store.insert(receipt);
      return receipt;
    });

    try {
      return transaction();
    } catch {
      const receipt = failReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        capabilityId: "item_transfer",
        kind: "mutation_apply_failed",
        message: "Stage 4 item_transfer mutation transaction failed before commit.",
      });
      input.store.insert(receipt);
      return receipt;
    }
  });
}

async function executeMinorPoiCreate(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "minor_poi_create") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "minor_poi_create",
      kind: "invalid_backend_request",
      message: "Stage 4 minor_poi_create request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  if (!input.step.intended.minorPoiPlan) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "minor_poi_create",
      kind: "invalid_backend_request",
      message: "Stage 4 minor_poi_create requires a typed backend minorPoiPlan.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const parsedEffect = cleanStage4MinorPoiCreateEffectSchema.safeParse(effect);
  if (!parsedEffect.success) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "minor_poi_create",
      kind: "invalid_backend_request",
      message: parsedEffect.error.issues[0]?.message ?? "Stage 4 minor_poi_create request failed schema validation.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const surface = input.frame.currentScenePlaceHandleSurface ?? null;
  if (
    !surface
    || normalizedRef(effect.anchorRef) !== normalizedRef(input.frame.scene.currentScene.ref)
    || !surface.allowedPlaceKinds.includes(effect.placeKind)
  ) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "minor_poi_create",
      kind: "minor_poi_surface_unavailable",
      message: "Stage 4 minor_poi_create requires the current SceneFrame place-handle surface and an allowed place kind.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  if (!effectRefsAreCitable({
    frame: input.frame,
    refs: uniqueStrings([
      effect.actorRef,
      effect.anchorRef,
      ...effect.evidenceRefs,
    ]),
  })) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "minor_poi_create",
      kind: "invalid_backend_request",
      message: "Stage 4 minor_poi_create cited refs outside SceneFrame.citableRefs or backend-looking refs.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  const poiRef = modelSafeMinorPoiRef(effect.placeLabel);
  if (minorPoiHandleConflicts({ frame: input.frame, poiRef, poiLabel: effect.placeLabel })) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "minor_poi_create",
      kind: "target_state_invalid",
      message: "Stage 4 minor_poi_create place handle conflicts with an existing actor, item, route, location, or current SceneFrame target.",
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-minor-poi-create", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id || !player.current_scene_location_id) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "minor_poi_create",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 current scene is unavailable for minor_poi_create." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const currentLocation = locationByLabel(input.frame, input.frame.scene.currentLocation.label);
      const currentScene = locationByLabel(input.frame, input.frame.scene.currentScene.label);
      if (
        !currentLocation
        || !currentScene
        || player.current_location_id !== currentLocation.id
        || player.current_scene_location_id !== currentScene.id
      ) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "minor_poi_create",
          kind: "stale_frame_or_clock",
          message: "Stage 4 current scene no longer matches the SceneFrame.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const rows = activeMinorPoiRows({
        campaignId: input.frame.campaignId,
        currentSceneLocationId: currentScene.id,
      });
      const existing = rows.filter((row) => normalizedRef(row.poi_ref) === normalizedRef(poiRef));
      if (existing.length > 1) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "minor_poi_create",
          kind: "minor_poi_state_conflict",
          message: "Stage 4 minor_poi_create found ambiguous active place-handle rows.",
        });
        input.store.insert(receipt);
        return receipt;
      }
      if (existing.length === 1) {
        if (
          normalizedRef(existing[0].poi_label) !== normalizedRef(effect.placeLabel)
          || existing[0].poi_kind !== effect.placeKind
        ) {
          const receipt = failReceipt({
            ...input,
            capabilityId: "minor_poi_create",
            kind: "minor_poi_state_conflict",
            message: "Stage 4 minor_poi_create found an existing handle ref with a different label or kind.",
          });
          input.store.insert(receipt);
          return receipt;
        }
        const minorPoi = minorPoiHandleResult({
          frame: input.frame,
          effect,
          resultKind: "reused",
          poiRef,
        });
        const receipt = minorPoiReceipt({
          frame: input.frame,
          checklist: input.checklist,
          step: input.step,
          request: input.request,
          minorPoi,
          mutationApplied: false,
          playerId: player.id,
          minorPoiId: existing[0].poi_id,
          minorPoiOperation: "reused",
          anchorLocationId: currentLocation.id,
          anchorSceneLocationId: currentScene.id,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const receiptId = `stage4-receipt-${randomUUID()}`;
      const poiId = `stage4-minor-poi-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const resultWorldVersion = clock.world_version + 1;
      const now = Date.now();
      const stateDeltaRefs = [`minor_poi:${poiId}:created`];

      const updateClock = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        now,
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (updateClock.changes !== 1) {
        throw new Error("minor POI clock update failed");
      }
      db.prepare(`
        INSERT INTO clean_gameplay_minor_pois (
          poi_id,
          campaign_id,
          poi_ref,
          poi_label,
          poi_kind,
          anchor_location_id,
          anchor_scene_location_id,
          active,
          applied_receipt_id,
          base_world_version,
          result_world_version,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `).run(
        poiId,
        input.frame.campaignId,
        poiRef,
        effect.placeLabel,
        effect.placeKind,
        currentLocation.id,
        currentScene.id,
        receiptId,
        clock.world_version,
        resultWorldVersion,
        now,
        now,
      );
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.minor_poi_create.v1",
        "minor_poi",
        poiId,
        clock.world_version,
        resultWorldVersion,
        clock.world_time_minutes,
        0,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(effect.evidenceRefs),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          capabilityId: "minor_poi_create",
          placeKind: effect.placeKind,
          anchorScope: "current_scene",
          anchorRef: effect.anchorRef,
          resultKind: "created",
        }),
        now,
      );

      const minorPoi = minorPoiHandleResult({
        frame: input.frame,
        effect,
        resultKind: "created",
        poiRef,
      });
      const receipt = minorPoiReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        receiptId,
        minorPoi,
        resultWorldVersion,
        mutationApplied: true,
        authorityTraceId,
        playerId: player.id,
        minorPoiId: poiId,
        minorPoiOperation: "inserted",
        anchorLocationId: currentLocation.id,
        anchorSceneLocationId: currentScene.id,
        stateDeltaRefs,
      });
      input.store.insert(receipt);
      return receipt;
    });

    try {
      return transaction();
    } catch {
      const receipt = failReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        capabilityId: "minor_poi_create",
        kind: "mutation_apply_failed",
        message: "Stage 4 minor_poi_create mutation transaction failed before commit.",
      });
      input.store.insert(receipt);
      return receipt;
    }
  });
}

async function executeTimeAdvance(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "time_advance") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "time_advance",
      kind: "invalid_backend_request",
      message: "Stage 4 time advance request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  return withSqliteWriteLock("clean-stage4-time-advance", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "time_advance",
          kind: "stale_frame_or_clock",
          message: current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const elapsedMinutes = effect.elapsedMinutes;
      const resultWorldVersion = clock.world_version + 1;
      const resultWorldTimeMinutes = clock.world_time_minutes + elapsedMinutes;
      const resultTick = Math.max(clock.current_tick, input.frame.base.tick) + elapsedMinutes;
      const receiptId = `stage4-receipt-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const clockReceiptId = `stage4-clock-${randomUUID()}`;
      const stateDeltaRefs = [`world_clock:${receiptId}`];
      const update = db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, world_time_minutes = ?, current_tick = ?, updated_at = ?
        WHERE campaign_id = ? AND world_version = ? AND world_time_minutes = ?
      `).run(
        resultWorldVersion,
        resultWorldTimeMinutes,
        resultTick,
        Date.now(),
        input.frame.campaignId,
        clock.world_version,
        clock.world_time_minutes,
      );
      if (update.changes !== 1) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "time_advance",
          kind: "stale_frame_or_clock",
          message: "Stage 4 time advance clock update found stale world clock state.",
        });
        input.store.insert(receipt);
        return receipt;
      }
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.clock.advance.v1",
        "clean_stage4_receipt",
        receiptId,
        clock.world_version,
        resultWorldVersion,
        resultWorldTimeMinutes,
        elapsedMinutes,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(["Player", input.frame.scene.currentScene.ref]),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          sceneRef: input.frame.scene.currentScene.ref,
          reasonKind: effect.reasonKind,
        }),
        Date.now(),
      );
      db.prepare(`
        INSERT INTO turn_clock_ledger (
          clock_receipt_id,
          campaign_id,
          turn_id,
          ui_turn_ordinal,
          base_world_version,
          result_world_version,
          delta_minutes,
          reason_kind,
          source_receipt_ref,
          result_world_time_minutes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clockReceiptId,
        input.frame.campaignId,
        input.frame.turnId,
        input.frame.base.tick,
        clock.world_version,
        resultWorldVersion,
        elapsedMinutes,
        clockLedgerReasonKind(effect.reasonKind),
        receiptId,
        resultWorldTimeMinutes,
        Date.now(),
      );

      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        status: "accepted",
        capabilityId: "time_advance",
        summary: `${elapsedMinutes} minute(s) pass in ${input.frame.scene.currentScene.label}.`,
        visibleRefs: ["Player", input.frame.scene.currentScene.ref],
        timeAdvance: {
          type: "time_advance",
          elapsedMinutes,
          reasonKind: effect.reasonKind,
        },
        resultTick,
        resultWorldVersion,
        resultWorldTimeMinutes,
        mutationApplied: true,
        authorityTraceId,
        clockReceiptId,
        playerId: player?.id ?? null,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    return transaction();
  });
}

function executeRouteCheck(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  store: CleanStage4ReceiptStore;
}): CleanStage4Receipt {
  const effect = input.request.effect;
  if (effect.kind !== "route_check") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "invalid_backend_request",
      message: "Stage 4 route check request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const option = destinationOption(input.frame, effect.destinationRef);
  if (!option) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "missing_or_ambiguous_destination",
      message: "Stage 4 route check destination is not in the SceneFrame movement options.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const player = readPlayer(input.frame);
  const clock = readClock(input.frame.campaignId);
  const current = validateFrameAndClock({ frame: input.frame, player, clock });
  if (!current.ok) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "stale_frame_or_clock",
      message: current.message,
    });
    input.store.insert(receipt);
    return receipt;
  }

  const graph = loadLocationGraph({ campaignId: input.frame.campaignId });
  const destination = locationByLabel(input.frame, option.label);
  if (!player || !destination || !player.current_location_id) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "route_check",
      kind: "missing_or_ambiguous_destination",
      message: "Stage 4 route destination could not be resolved uniquely.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const path = resolveTravelPath({
    campaignId: input.frame.campaignId,
    fromLocationId: player.current_location_id,
    toLocationId: destination.id,
    edges: graph.edges,
    locations: graph.locations,
    currentTick: input.frame.base.tick,
  });
  const connected = path !== null;
  const receipt = baseReceipt({
    frame: input.frame,
    checklist: input.checklist,
    step: input.step,
    request: input.request,
    status: "accepted",
    capabilityId: "route_check",
    summary: connected
      ? `${option.label} is reachable from the current scene.`
      : `${option.label} is not currently reachable from the current scene.`,
    visibleRefs: ["Player", option.ref],
    routeStatus: connected ? "connected" : "disconnected",
    playerId: player.id,
    fromLocationId: player.current_location_id,
    destinationLocationId: destination.id,
    edgeIds: path?.edgeIds ?? [],
  });
  input.store.insert(receipt);
  return receipt;
}

async function executeMovement(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  request: CleanStage4Request;
  priorReceipts: readonly CleanStage4Receipt[];
  store: CleanStage4ReceiptStore;
}): Promise<CleanStage4Receipt> {
  const effect = input.request.effect;
  if (effect.kind !== "movement") {
    const receipt = failReceipt({
      ...input,
      capabilityId: "movement",
      kind: "invalid_backend_request",
      message: "Stage 4 movement request effect did not match capability.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const option = destinationOption(input.frame, effect.destinationRef);
  if (!option) {
    const receipt = failReceipt({
      ...input,
      capabilityId: "movement",
      kind: "missing_or_ambiguous_destination",
      message: "Stage 4 movement destination is not in the SceneFrame movement options.",
    });
    input.store.insert(receipt);
    return receipt;
  }
  const dependencyIds = new Set(input.step.dependsOnStepIds);
  const dependencies = input.priorReceipts.filter((receipt) => dependencyIds.has(receipt.stepId));
  if (dependencyIds.size > 0) {
    const connectedRoute = dependencies.some((receipt) =>
      receipt.status === "accepted"
      && receipt.capabilityId === "route_check"
      && receipt.publicResult.routeStatus === "connected"
      && receipt.privateResult.destinationLocationId !== null
    );
    if (!connectedRoute) {
      const receipt = skipReceipt({
        ...input,
        capabilityId: "movement",
        kind: "dependency_not_accepted",
        message: "Stage 4 movement skipped because required route evidence was not accepted.",
      });
      input.store.insert(receipt);
      return receipt;
    }
  } else if (!option.connected) {
    const receipt = skipReceipt({
      ...input,
      capabilityId: "movement",
      kind: "route_disconnected",
      message: `${option.label} is not currently reachable from the current scene.`,
    });
    input.store.insert(receipt);
    return receipt;
  }

  return withSqliteWriteLock("clean-stage4-movement", () => {
    const db = getSqliteConnection();
    const transaction = db.transaction(() => {
      const player = readPlayer(input.frame);
      const clock = readClock(input.frame.campaignId);
      const current = validateFrameAndClock({ frame: input.frame, player, clock });
      if (!current.ok || !player?.current_location_id) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "movement",
          kind: "stale_frame_or_clock",
          message: current.ok ? "Stage 4 player location is unavailable." : current.message,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const graph = loadLocationGraph({ campaignId: input.frame.campaignId });
      const destination = locationByLabel(input.frame, option.label);
      if (!destination) {
        const receipt = failReceipt({
          ...input,
          capabilityId: "movement",
          kind: "missing_or_ambiguous_destination",
          message: "Stage 4 movement destination could not be resolved uniquely.",
        });
        input.store.insert(receipt);
        return receipt;
      }

      const path = resolveTravelPath({
        campaignId: input.frame.campaignId,
        fromLocationId: player.current_location_id,
        toLocationId: destination.id,
        edges: graph.edges,
        locations: graph.locations,
        currentTick: input.frame.base.tick,
      });
      if (!path) {
        const receipt = skipReceipt({
          ...input,
          capabilityId: "movement",
          kind: "route_disconnected",
          message: `${option.label} is not currently reachable from the current scene.`,
        });
        input.store.insert(receipt);
        return receipt;
      }

      const resultWorldVersion = clock.world_version + 1;
      const resultWorldTimeMinutes = clock.world_time_minutes + path.totalTravelCost;
      const resultTick = Math.max(clock.current_tick, input.frame.base.tick) + path.totalTravelCost;
      const receiptId = `stage4-receipt-${randomUUID()}`;
      const authorityTraceId = `stage4-authority-${randomUUID()}`;
      const clockReceiptId = `stage4-clock-${randomUUID()}`;
      const stateDeltaRefs = [`player_location:${receiptId}`];
      const storedRecord = hydrateStoredPlayerRecord({
        id: player.id,
        campaignId: player.campaign_id,
        name: player.name,
        race: player.race,
        gender: player.gender,
        age: player.age,
        appearance: player.appearance,
        hp: player.hp,
        characterRecord: player.character_record,
        derivedTags: player.derived_tags,
        tags: player.tags,
        equippedItems: player.equipped_items,
        currentLocationId: destination.id,
      });
      const projected: PlayerRecordProjection = projectPlayerRecord({
        ...storedRecord,
        socialContext: {
          ...storedRecord.socialContext,
          currentLocationId: destination.id,
          currentLocationName: destination.name,
        },
      });

      db.prepare(`
        UPDATE players
        SET
          current_location_id = ?,
          current_scene_location_id = ?,
          character_record = ?,
          derived_tags = ?,
          tags = ?,
          equipped_items = ?
        WHERE id = ? AND campaign_id = ?
      `).run(
        destination.id,
        destination.id,
        projected.characterRecord,
        projected.derivedTags,
        projected.tags,
        projected.equippedItems,
        player.id,
        input.frame.campaignId,
      );
      db.prepare(`
        UPDATE world_clocks
        SET world_version = ?, world_time_minutes = ?, current_tick = ?, updated_at = ?
        WHERE campaign_id = ?
      `).run(
        resultWorldVersion,
        resultWorldTimeMinutes,
        resultTick,
        Date.now(),
        input.frame.campaignId,
      );
      db.prepare(`
        INSERT INTO authority_traces (
          id,
          campaign_id,
          operation,
          source_entity_type,
          source_entity_id,
          base_world_version,
          result_world_version,
          world_time_minutes,
          elapsed_world_time_minutes,
          tool_result_id,
          event_ids,
          state_delta_refs,
          witnesses,
          metadata,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        authorityTraceId,
        input.frame.campaignId,
        "gameplay-cycle-runtime.player.move.v1",
        "clean_stage4_receipt",
        receiptId,
        clock.world_version,
        resultWorldVersion,
        resultWorldTimeMinutes,
        path.totalTravelCost,
        receiptId,
        "[]",
        JSON.stringify(stateDeltaRefs),
        JSON.stringify(["Player", option.ref]),
        JSON.stringify({
          checklistId: input.checklist.checklistId,
          stepId: input.step.stepId,
          destinationRef: option.ref,
        }),
        Date.now(),
      );
      db.prepare(`
        INSERT INTO turn_clock_ledger (
          clock_receipt_id,
          campaign_id,
          turn_id,
          ui_turn_ordinal,
          base_world_version,
          result_world_version,
          delta_minutes,
          reason_kind,
          source_receipt_ref,
          result_world_time_minutes,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        clockReceiptId,
        input.frame.campaignId,
        input.frame.turnId,
        input.frame.base.tick,
        clock.world_version,
        resultWorldVersion,
        path.totalTravelCost,
        "travel",
        receiptId,
        resultWorldTimeMinutes,
        Date.now(),
      );

      const receipt = baseReceipt({
        frame: input.frame,
        checklist: input.checklist,
        step: input.step,
        request: input.request,
        status: "accepted",
        capabilityId: "movement",
        summary: `You move to ${option.label}.`,
        visibleRefs: ["Player", option.ref],
        locationChange: {
          type: "location_change",
          locationName: option.label,
          travelCost: path.totalTravelCost,
          path: publicPathLabels(path.locationIds, graph.locations),
        },
        resultTick,
        resultWorldVersion,
        resultWorldTimeMinutes,
        mutationApplied: true,
        authorityTraceId,
        clockReceiptId,
        playerId: player.id,
        fromLocationId: player.current_location_id,
        destinationLocationId: destination.id,
        edgeIds: path.edgeIds,
        stateDeltaRefs,
      });
      const finalReceipt = assertCleanStage4Receipt({ ...receipt, receiptId });
      input.store.insert(finalReceipt);
      return finalReceipt;
    });

    return transaction();
  });
}

function branchEligible(frame: AuthoritativeSceneFrame, checklist: GmActionChecklist): boolean {
  return checklist.version === "gm-action-checklist.v1"
    && checklist.campaignId === frame.campaignId
    && checklist.turnId === frame.turnId
    && checklist.frameId === frame.frameId
    && checklist.source.judgeNextStep === "action_plan"
    && checklist.source.judgeCheckNeed === "backend_action_plan_needed";
}

function materializedSpeakerBinding(step: Step): MaterializedSpeakerBinding | null {
  return (step.dependencyBindings ?? []).find((binding) =>
    binding.bindingId === "materialized_speaker"
    && binding.requiredCapabilityId === "support_actor_create"
    && binding.requiredReceiptAuthority === "support_actor_materialization_receipt"
    && binding.sourcePath === "publicResult.supportActor.actorRef"
    && binding.resolveIn === "post_dependency_scene_frame"
    && binding.requiredFramePresence === "actors_and_citableRefs"
  ) ?? null;
}

function playerLocalConditionBinding(step: Step): PlayerLocalConditionBinding | null {
  return (step.dependencyBindings ?? []).find((binding) =>
    binding.bindingId === "player_local_condition"
    && binding.requiredCapabilityId === "condition_set"
    && binding.requiredReceiptAuthority === "player_local_condition_receipt"
    && binding.sourcePath === "publicResult.condition.conditionKey"
    && binding.resolveIn === "post_dependency_scene_frame"
    && binding.requiredFramePresence === "player_visibleStatus.conditions"
  ) ?? null;
}

function itemTransferBinding(step: Step): ItemTransferBinding | null {
  return (step.dependencyBindings ?? []).find((binding) =>
    binding.bindingId === "item_transfer_state"
    && binding.requiredCapabilityId === "item_transfer"
    && binding.requiredReceiptAuthority === "item_transfer_receipt"
    && binding.sourcePath === "publicResult.itemTransfer"
    && binding.resolveIn === "post_dependency_scene_frame"
    && binding.requiredFramePresence === "item_state_reconciled"
  ) ?? null;
}

function minorPoiHandleBinding(step: Step): MinorPoiHandleBinding | null {
  return (step.dependencyBindings ?? []).find((binding) =>
    binding.bindingId === "minor_poi_handle"
    && binding.requiredCapabilityId === "minor_poi_create"
    && binding.requiredReceiptAuthority === "minor_poi_handle_receipt"
    && binding.sourcePath === "publicResult.minorPoi"
    && binding.resolveIn === "post_dependency_scene_frame"
    && binding.requiredFramePresence === "targets_and_citableRefs"
  ) ?? null;
}

function refreshedActorForMaterializedSpeaker(input: {
  frame: AuthoritativeSceneFrame;
  actorRef: string;
}): AuthoritativeSceneFrame["actors"][number] | null {
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  if (!citable.has(normalizedRef(input.actorRef))) return null;
  const matches = input.frame.actors.filter((actor) =>
    actor.role !== "player"
    && normalizedRef(actor.ref) === normalizedRef(input.actorRef)
  );
  return matches.length === 1 ? matches[0] : null;
}

function refreshedPlayerConditionMatches(input: {
  frame: AuthoritativeSceneFrame;
  condition: PlayerLocalConditionResult;
}): boolean {
  const labels = input.frame.player.visibleStatus.conditions.map((condition) =>
    condition.trim().toLowerCase()
  );
  const key = input.condition.conditionKey.trim().toLowerCase();
  const label = input.condition.conditionLabel.trim().toLowerCase();
  const present = labels.includes(key) || labels.includes(label);
  if (input.condition.resultKind === "cleared") return !present;
  return present;
}

function refreshedItemTransferMatches(input: {
  frame: AuthoritativeSceneFrame;
  itemTransfer: ItemTransferResult;
}): boolean {
  const itemLabel = normalizedRef(input.itemTransfer.itemLabel);
  const inventoryItem = input.frame.inventory.find((item) =>
    normalizedRef(item.label) === itemLabel || normalizedRef(item.ref) === itemLabel
  );
  if (input.itemTransfer.finalOwnerKind === "player") {
    return Boolean(inventoryItem && inventoryItem.equipState === input.itemTransfer.finalEquipState);
  }
  if (input.itemTransfer.finalOwnerKind === "none" && input.itemTransfer.finalLocationKind === "current_scene") {
    return input.frame.targets.some((target) =>
      target.kind === "item"
      && (normalizedRef(target.label) === itemLabel || normalizedRef(target.ref) === itemLabel)
    );
  }
  if (input.itemTransfer.finalOwnerKind === "visible_actor") {
    const targetVisible = input.frame.actors.some((actor) =>
      actor.role !== "player"
      && normalizedRef(actor.label) === normalizedRef(input.itemTransfer.targetLabel)
    );
    return targetVisible && !inventoryItem;
  }
  return false;
}

function refreshedMinorPoiMatches(input: {
  frame: AuthoritativeSceneFrame;
  minorPoi: MinorPoiHandleResult;
}): boolean {
  const citable = new Set(input.frame.citableRefs.map(normalizedRef));
  if (!citable.has(normalizedRef(input.minorPoi.poiRef))) return false;
  return input.frame.targets.some((target) =>
    target.kind === "place_handle"
    && (
      normalizedRef(target.ref) === normalizedRef(input.minorPoi.poiRef)
      || normalizedRef(target.label) === normalizedRef(input.minorPoi.poiLabel)
    )
  );
}

async function resolveDialogueDependencies(input: {
  initialFrame: AuthoritativeSceneFrame;
  currentFrame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  step: Step;
  receipts: readonly CleanStage4Receipt[];
  refreshFrameAfterReceipt?: Stage4FrameRefresh;
}): Promise<{
  status: "ready";
  frame: AuthoritativeSceneFrame;
  resolution: Stage4DialogueDependencyResolution | null;
  refreshed: boolean;
  afterReceiptId: string | null;
} | {
  status: "skip";
  receipt: CleanStage4Receipt;
}> {
  const speakerBinding = materializedSpeakerBinding(input.step);
  const conditionBinding = playerLocalConditionBinding(input.step);
  const itemBinding = itemTransferBinding(input.step);
  const minorPoiBinding = minorPoiHandleBinding(input.step);
  if (!speakerBinding && !conditionBinding && !itemBinding && !minorPoiBinding) {
    return {
      status: "ready",
      frame: input.currentFrame,
      resolution: null,
      refreshed: false,
      afterReceiptId: null,
    };
  }

  const placeholderRequest = () => placeholderDialogueRequest({
    frame: input.currentFrame,
    checklist: input.checklist,
    step: input.step,
  });
  const skipDependency = (message: string): { status: "skip"; receipt: CleanStage4Receipt } => ({
    status: "skip",
    receipt: skipReceipt({
      frame: input.currentFrame,
      checklist: input.checklist,
      step: input.step,
      request: placeholderRequest(),
      capabilityId: "dialogue_record",
      kind: "dependency_not_accepted",
      message,
    }),
  });

  if (conditionBinding && !speakerBinding && !itemBinding && !minorPoiBinding) {
    const sourceReceipt = input.receipts.find((receipt) =>
      receipt.stepId === conditionBinding.fromStepId
      && receipt.capabilityId === "condition_set"
    );
    if (
      !sourceReceipt
      || sourceReceipt.status !== "accepted"
      || sourceReceipt.authority.evidenceAuthority !== "player_local_condition_receipt"
      || !sourceReceipt.publicResult.condition
    ) {
      return skipDependency("Dependent dialogue was skipped because player local condition evidence was not accepted.");
    }
    if (!input.refreshFrameAfterReceipt) {
      return skipDependency("Dependent dialogue was skipped because no post-condition SceneFrame refresh was available.");
    }

    let refreshedFrame: AuthoritativeSceneFrame;
    try {
      refreshedFrame = await input.refreshFrameAfterReceipt({
        initialFrame: input.initialFrame,
        currentFrame: input.currentFrame,
        checklist: input.checklist,
        step: input.step,
        receipt: sourceReceipt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return skipDependency(`Dependent dialogue was skipped because post-condition SceneFrame refresh failed: ${message}`);
    }

    const condition = sourceReceipt.publicResult.condition;
    if (!refreshedPlayerConditionMatches({ frame: refreshedFrame, condition })) {
      return {
        status: "skip",
        receipt: skipReceipt({
          frame: refreshedFrame,
          checklist: input.checklist,
          step: input.step,
          request: placeholderDialogueRequest({
            frame: refreshedFrame,
            checklist: input.checklist,
            step: input.step,
          }),
          capabilityId: "dialogue_record",
          kind: "dependency_not_accepted",
          message: "Dependent dialogue was skipped because the refreshed SceneFrame did not reflect the accepted player local condition state.",
        }),
      };
    }

    return {
      status: "ready",
      frame: refreshedFrame,
      refreshed: true,
      afterReceiptId: sourceReceipt.receiptId,
      resolution: {
          materializedSpeaker: null,
        playerLocalCondition: {
          bindingId: "player_local_condition",
          fromStepId: conditionBinding.fromStepId,
          receiptId: sourceReceipt.receiptId,
          conditionKey: condition.conditionKey,
          conditionLabel: condition.conditionLabel,
          resultKind: condition.resultKind,
          refreshedFrameId: refreshedFrame.frameId,
        },
        itemTransfer: null,
        minorPoi: null,
      },
    };
  }

  if (itemBinding && !speakerBinding && !conditionBinding && !minorPoiBinding) {
    const sourceReceipt = input.receipts.find((receipt) =>
      receipt.stepId === itemBinding.fromStepId
      && receipt.capabilityId === "item_transfer"
    );
    if (
      !sourceReceipt
      || sourceReceipt.status !== "accepted"
      || sourceReceipt.authority.evidenceAuthority !== "item_transfer_receipt"
      || !sourceReceipt.publicResult.itemTransfer
    ) {
      return skipDependency("Dependent dialogue was skipped because item transfer evidence was not accepted.");
    }
    if (!input.refreshFrameAfterReceipt) {
      return skipDependency("Dependent dialogue was skipped because no post-item-transfer SceneFrame refresh was available.");
    }

    let refreshedFrame: AuthoritativeSceneFrame;
    try {
      refreshedFrame = await input.refreshFrameAfterReceipt({
        initialFrame: input.initialFrame,
        currentFrame: input.currentFrame,
        checklist: input.checklist,
        step: input.step,
        receipt: sourceReceipt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return skipDependency(`Dependent dialogue was skipped because post-item-transfer SceneFrame refresh failed: ${message}`);
    }

    const itemTransfer = sourceReceipt.publicResult.itemTransfer;
    if (!refreshedItemTransferMatches({ frame: refreshedFrame, itemTransfer })) {
      return {
        status: "skip",
        receipt: skipReceipt({
          frame: refreshedFrame,
          checklist: input.checklist,
          step: input.step,
          request: placeholderDialogueRequest({
            frame: refreshedFrame,
            checklist: input.checklist,
            step: input.step,
          }),
          capabilityId: "dialogue_record",
          kind: "dependency_not_accepted",
          message: "Dependent dialogue was skipped because the refreshed SceneFrame did not reflect the accepted item state.",
        }),
      };
    }

    return {
      status: "ready",
      frame: refreshedFrame,
      refreshed: true,
      afterReceiptId: sourceReceipt.receiptId,
      resolution: {
          materializedSpeaker: null,
          playerLocalCondition: null,
        itemTransfer: {
          bindingId: "item_transfer_state",
          fromStepId: itemBinding.fromStepId,
          receiptId: sourceReceipt.receiptId,
          resultKind: itemTransfer.resultKind,
          itemLabel: itemTransfer.itemLabel,
          refreshedFrameId: refreshedFrame.frameId,
        },
        minorPoi: null,
      },
    };
  }

  if (minorPoiBinding && !speakerBinding && !conditionBinding && !itemBinding) {
    const sourceReceipt = input.receipts.find((receipt) =>
      receipt.stepId === minorPoiBinding.fromStepId
      && receipt.capabilityId === "minor_poi_create"
    );
    if (
      !sourceReceipt
      || sourceReceipt.status !== "accepted"
      || sourceReceipt.authority.evidenceAuthority !== "minor_poi_handle_receipt"
      || !sourceReceipt.publicResult.minorPoi
    ) {
      return skipDependency("Dependent dialogue was skipped because minor POI handle evidence was not accepted.");
    }
    if (!input.refreshFrameAfterReceipt) {
      return skipDependency("Dependent dialogue was skipped because no post-minor-POI SceneFrame refresh was available.");
    }

    let refreshedFrame: AuthoritativeSceneFrame;
    try {
      refreshedFrame = await input.refreshFrameAfterReceipt({
        initialFrame: input.initialFrame,
        currentFrame: input.currentFrame,
        checklist: input.checklist,
        step: input.step,
        receipt: sourceReceipt,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return skipDependency(`Dependent dialogue was skipped because post-minor-POI SceneFrame refresh failed: ${message}`);
    }

    const minorPoi = sourceReceipt.publicResult.minorPoi;
    if (!refreshedMinorPoiMatches({ frame: refreshedFrame, minorPoi })) {
      return {
        status: "skip",
        receipt: skipReceipt({
          frame: refreshedFrame,
          checklist: input.checklist,
          step: input.step,
          request: placeholderDialogueRequest({
            frame: refreshedFrame,
            checklist: input.checklist,
            step: input.step,
          }),
          capabilityId: "dialogue_record",
          kind: "dependency_not_accepted",
          message: "Dependent dialogue was skipped because the refreshed SceneFrame did not expose the accepted minor POI handle.",
        }),
      };
    }

    return {
      status: "ready",
      frame: refreshedFrame,
      refreshed: true,
      afterReceiptId: sourceReceipt.receiptId,
      resolution: {
        materializedSpeaker: null,
        playerLocalCondition: null,
        itemTransfer: null,
        minorPoi: {
          bindingId: "minor_poi_handle",
          fromStepId: minorPoiBinding.fromStepId,
          receiptId: sourceReceipt.receiptId,
          poiRef: minorPoi.poiRef,
          poiLabel: minorPoi.poiLabel,
          resultKind: minorPoi.resultKind,
          refreshedFrameId: refreshedFrame.frameId,
        },
      },
    };
  }

  const binding = speakerBinding;
  if (!binding || conditionBinding || itemBinding || minorPoiBinding) return skipDependency("Dependent dialogue has unsupported mixed dependency bindings.");
  const sourceReceipt = input.receipts.find((receipt) =>
    receipt.stepId === binding.fromStepId
    && receipt.capabilityId === "support_actor_create"
  );
  if (
    !sourceReceipt
    || sourceReceipt.status !== "accepted"
    || sourceReceipt.authority.evidenceAuthority !== "support_actor_materialization_receipt"
    || !sourceReceipt.publicResult.supportActor
  ) {
    return skipDependency("Dependent dialogue was skipped because support actor materialization was not accepted.");
  }

  const actorRef = sourceReceipt.publicResult.supportActor.actorRef;
  if (!input.refreshFrameAfterReceipt) {
    return skipDependency("Dependent dialogue was skipped because no post-dependency SceneFrame refresh was available.");
  }

  let refreshedFrame: AuthoritativeSceneFrame;
  try {
    refreshedFrame = await input.refreshFrameAfterReceipt({
      initialFrame: input.initialFrame,
      currentFrame: input.currentFrame,
      checklist: input.checklist,
      step: input.step,
      receipt: sourceReceipt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return skipDependency(`Dependent dialogue was skipped because post-dependency SceneFrame refresh failed: ${message}`);
  }

  const actor = refreshedActorForMaterializedSpeaker({
    frame: refreshedFrame,
    actorRef,
  });
  if (!actor) {
    return {
      status: "skip",
      receipt: skipReceipt({
        frame: refreshedFrame,
        checklist: input.checklist,
        step: input.step,
        request: placeholderDialogueRequest({
          frame: refreshedFrame,
          checklist: input.checklist,
          step: input.step,
        }),
        capabilityId: "dialogue_record",
        kind: "dependency_not_accepted",
        message: "Dependent dialogue was skipped because the materialized support actor was not present in the refreshed SceneFrame actors and citableRefs.",
      }),
    };
  }

  return {
    status: "ready",
    frame: refreshedFrame,
    refreshed: true,
    afterReceiptId: sourceReceipt.receiptId,
    resolution: {
      materializedSpeaker: {
        bindingId: "materialized_speaker",
        fromStepId: binding.fromStepId,
        receiptId: sourceReceipt.receiptId,
        actorRef: actor.ref,
        actorLabel: actor.label,
        refreshedFrameId: refreshedFrame.frameId,
      },
      playerLocalCondition: null,
      itemTransfer: null,
      minorPoi: null,
    },
  };
}

export async function runCleanStage4Execution(input: {
  frame: AuthoritativeSceneFrame;
  checklist: GmActionChecklist;
  dialogueProvider?: ProviderConfig;
  generateDialogueRequest?: Stage4DialogueRequestGenerator;
  supportActorProvider?: ProviderConfig;
  generateSupportActorRequest?: Stage4SupportActorRequestGenerator;
  refreshFrameAfterReceipt?: Stage4FrameRefresh;
  store?: CleanStage4ReceiptStore;
}): Promise<CleanStage4ExecutionRunResult> {
  if (!branchEligible(input.frame, input.checklist)) {
    return { status: "skipped", execution: null, publicEvents: [] };
  }
  const store = input.store ?? sqliteCleanStage4ReceiptStore;
  const receipts: CleanStage4Receipt[] = [];
  const initialFrame = input.frame;
  let currentFrame = input.frame;
  const frameChain: NonNullable<CleanStage4ExecutionResult["frameChain"]> = [{
    frameId: initialFrame.frameId,
    base: initialFrame.base,
    source: "initial",
    afterReceiptId: null,
  }];

  for (const step of input.checklist.steps) {
    if (step.disposition.kind !== "stage4_backend_resolution_required") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = skipReceipt({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        capabilityId: cleanStage4CapabilityForKind(step.intended.kind),
        kind: "unsupported_clean_stage4_capability",
        message: "Stage 4 step is not marked for backend resolution.",
      });
      store.insert(receipt);
      receipts.push(receipt);
      continue;
    }
    const implementedKinds: Array<Step["intended"]["kind"]> = [
      "observe_visible",
      "local_observation",
      "device_surface_observation",
      "route_options",
      "route_check",
      "movement",
      "dialogue_record",
      "support_actor_create",
      "condition_set",
      "item_transfer",
      "minor_poi_create",
      "time_advance",
      "scene_beat_record",
    ];
    if (!implementedKinds.includes(step.intended.kind)) {
      const request = assertCleanStage4Request({
        version: "gameplay-runtime.stage4-request.v1",
        requestId: `stage4-request-${randomUUID()}`,
        campaignId: currentFrame.campaignId,
        turnId: currentFrame.turnId,
        frameId: currentFrame.frameId,
        checklistId: input.checklist.checklistId,
        stepId: step.stepId,
        source: {
          sceneFrameVersion: "scene-frame.v1",
          gmReadVersion: "gm-read.v1",
          judgeVersion: "judge-uncertainty.v1",
          checklistVersion: "gm-action-checklist.v1",
          checklistId: input.checklist.checklistId,
          checklistStepId: step.stepId,
        },
        base: currentFrame.base,
        author: "backend_from_checklist",
        modelAuthored: false,
        capabilityId: "scene_beat_record",
        effect: {
          kind: "scene_beat_record",
          actorRef: "Player",
          sceneRef: currentFrame.scene.currentScene.ref,
          targetRefs: step.targetRefs,
          beatKind: "generic_scene_beat",
          evidenceRefs: step.evidenceRefs,
        },
      });
      const receipt = skipReceipt({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        capabilityId: "scene_beat_record",
        kind: "unsupported_clean_stage4_capability",
        message: "This Stage 4 capability is not implemented in the clean P64 executor.",
      });
      store.insert(receipt);
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "dialogue_record") {
      const dependency = await resolveDialogueDependencies({
        initialFrame,
        currentFrame,
        checklist: input.checklist,
        step,
        receipts,
        refreshFrameAfterReceipt: input.refreshFrameAfterReceipt,
      });
      if (dependency.status === "skip") {
        store.insert(dependency.receipt);
        receipts.push(dependency.receipt);
        continue;
      }
      if (dependency.refreshed) {
        currentFrame = dependency.frame;
        frameChain.push({
          frameId: currentFrame.frameId,
          base: currentFrame.base,
          source: "post_dependency_scene_frame",
          afterReceiptId: dependency.afterReceiptId,
        });
      }
      const receipt = await executeDialogueRecord({
        frame: dependency.frame,
        checklist: input.checklist,
        step,
        dependencyResolution: dependency.resolution,
        provider: input.dialogueProvider,
        generateDialogueRequest: input.generateDialogueRequest,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "support_actor_create") {
      const receipt = await executeSupportActorCreate({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        provider: input.supportActorProvider,
        generateSupportActorRequest: input.generateSupportActorRequest,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "local_observation") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = executeLocalObservation({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "device_surface_observation") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = executeDeviceSurfaceObservation({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "condition_set") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = await executePlayerLocalConditionSet({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "item_transfer") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = await executeItemTransfer({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    if (step.intended.kind === "minor_poi_create") {
      const request = requestForStep({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        requiredRouteReceiptId: null,
      });
      const receipt = await executeMinorPoiCreate({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        store,
      });
      receipts.push(receipt);
      continue;
    }

    const routeDependency = receipts.find((receipt) =>
      step.dependsOnStepIds.includes(receipt.stepId)
      && receipt.capabilityId === "route_check"
      && receipt.status === "accepted"
    );
    const request = requestForStep({
      frame: currentFrame,
      checklist: input.checklist,
      step,
      requiredRouteReceiptId: routeDependency?.receiptId ?? null,
    });
    let receipt: CleanStage4Receipt;
    if (step.intended.kind === "observe_visible") {
      receipt = executeObserveVisible({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "route_options") {
      receipt = executeRouteOptions({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "route_check") {
      receipt = executeRouteCheck({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else if (step.intended.kind === "movement") {
      receipt = await executeMovement({
        frame: currentFrame,
        checklist: input.checklist,
        step,
        request,
        priorReceipts: receipts,
        store,
      });
    } else if (step.intended.kind === "time_advance") {
      receipt = await executeTimeAdvance({ frame: currentFrame, checklist: input.checklist, step, request, store });
    } else {
      receipt = executeSceneBeat({ frame: currentFrame, checklist: input.checklist, step, request, store });
    }
    receipts.push(receipt);
  }

  const acceptedReceiptIds = receipts
    .filter((receipt) => receipt.status === "accepted")
    .map((receipt) => receipt.receiptId);
  const skippedStepIds = receipts
    .filter((receipt) => receipt.status === "skipped")
    .map((receipt) => receipt.stepId);
  const failedStepIds = receipts
    .filter((receipt) => receipt.status === "failed")
    .map((receipt) => receipt.stepId);
  const mutationApplied = receipts.some((receipt) => receipt.result.mutationApplied);
  const resultWorldVersion = Math.max(...receipts.map((receipt) => receipt.result.worldVersion), input.frame.base.worldVersion);
  const visibleResults = receipts
    .filter((receipt) => receipt.status === "accepted" || receipt.status === "failed")
    .map((receipt) => ({
      receiptId: receipt.receiptId,
      authority: receipt.authority.evidenceAuthority,
      summary: receipt.publicResult.summary,
      visibleRefs: receipt.publicResult.visibleRefs,
      locationChange: receipt.publicResult.locationChange,
      timeAdvance: receipt.publicResult.timeAdvance,
      dialogue: receipt.publicResult.dialogue,
      supportActor: receipt.publicResult.supportActor,
      condition: receipt.publicResult.condition,
      itemTransfer: receipt.publicResult.itemTransfer,
      minorPoi: receipt.publicResult.minorPoi,
      localObservation: receipt.publicResult.localObservation,
      deviceSurfaceObservation: receipt.publicResult.deviceSurfaceObservation,
    }));
  const execution = assertCleanStage4ExecutionResult({
    version: "gameplay-runtime.stage4-execution-result.v1",
    campaignId: input.frame.campaignId,
    turnId: input.frame.turnId,
    frameId: input.frame.frameId,
    checklistId: input.checklist.checklistId,
    base: input.frame.base,
    receipts,
    acceptedReceiptIds,
    skippedStepIds,
    failedStepIds,
    mutationApplied,
    resultWorldVersion,
    frameChain,
    visibleResults,
  });
  const publicEvents: Stage4ExecutionEvent[] = [];
  for (const result of visibleResults) {
    if (result.locationChange) {
      publicEvents.push({ type: "state_update", data: result.locationChange });
    }
    if (result.timeAdvance) {
      publicEvents.push({ type: "state_update", data: result.timeAdvance });
    }
    if (result.condition) {
      publicEvents.push({ type: "state_update", data: result.condition });
    }
  }
  return {
    status: "executed",
    execution,
    publicEvents,
  };
}
