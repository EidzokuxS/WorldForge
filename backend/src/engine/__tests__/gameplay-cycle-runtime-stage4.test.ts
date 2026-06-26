import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { ensureCampaignInventoryAuthority } from "../../inventory/legacy-migration.js";
import { buildAuthoritativeSceneFrame } from "../gameplay-cycle-runtime/frame.js";
import {
  buildStage4DialogueRequestPrompt,
  buildStage4DialogueRequestSystemPrompt,
  CleanStage4InvariantError,
  runCleanStage4Execution,
  validateDialogueRequestEffectCandidate,
} from "../gameplay-cycle-runtime/stage4-execution.js";
import type {
  AuthoritativeSceneFrame,
  CleanStage4Receipt,
  GmActionChecklist,
} from "../gameplay-cycle-runtime/contracts.js";

const CAMPAIGN_ID = "stage4-campaign";

let tempRoot = "";
let previousCampaignRoot: string | undefined;

const CLEAN_SUPPORT_TAGS = [
  "temporary-support",
  "clean-runtime-support",
  "support-role:vendor",
  "current-scene",
  "minor-support",
  "reactive-only",
];

function exec(sql: string, ...values: unknown[]): void {
  getSqliteConnection().prepare(sql).run(...values);
}

function seedWorld(): void {
  const now = Date.now();
  exec(
    "INSERT INTO campaigns (id, name, premise, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    CAMPAIGN_ID,
    "Stage 4 Campaign",
    "A focused Stage 4 test campaign.",
    now,
    now,
  );
  exec(
    "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "loc-market",
    CAMPAIGN_ID,
    "Market",
    "A public market.",
    "macro",
    "persistent",
    "[]",
    1,
    JSON.stringify(["loc-north-hall"]),
  );
  exec(
    "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    "loc-north-hall",
    CAMPAIGN_ID,
    "North Hall",
    "A connected hall.",
    "macro",
    "persistent",
    "[]",
    0,
    "[]",
  );
  exec(
    "INSERT INTO location_edges (id, campaign_id, from_location_id, to_location_id, travel_cost, discovered) VALUES (?, ?, ?, ?, ?, ?)",
    "edge-market-north-hall",
    CAMPAIGN_ID,
    "loc-market",
    "loc-north-hall",
    3,
    1,
  );
  exec(
    `INSERT INTO players (
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
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "player-1",
    CAMPAIGN_ID,
    "Mira Voss",
    "Human",
    "Female",
    "32",
    "Focused.",
    5,
    "{}",
    "[]",
    "[]",
    "[]",
    "loc-market",
    "loc-market",
  );
  exec(
    "INSERT INTO world_clocks (campaign_id, world_version, world_time_minutes, current_tick, updated_at) VALUES (?, ?, ?, ?, ?)",
    CAMPAIGN_ID,
    0,
    0,
    0,
    now,
  );
}

function frame(): AuthoritativeSceneFrame {
  return {
    version: "scene-frame.v1",
    frameId: "frame-stage4-1",
    campaignId: CAMPAIGN_ID,
    turnId: "clean-turn-stage4-1",
    base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
    playerAction: "I walk from Market to North Hall.",
    player: {
      ref: "Player",
      label: "Mira Voss",
      visibleStatus: { hp: 5, conditions: [] },
    },
    scene: {
      currentLocation: { ref: "Market", label: "Market", description: null },
      currentScene: { ref: "Market", label: "Market", description: null },
      visibleFacts: [],
      recentLocalFacts: [],
    },
    actors: [],
    movementOptions: [{
      ref: "North Hall",
      label: "North Hall",
      connected: true,
      travelCost: 3,
    }],
    targets: [],
    inventory: [],
    capabilities: [
      { capabilityId: "route_check", evidenceAuthority: "receipt_required", allowed: true },
      { capabilityId: "movement", evidenceAuthority: "terminal_receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "North Hall"],
    privateGuards: {
      forbiddenActorLabels: [],
      forbiddenPrivateTerms: [],
    },
    forecast: {
      version: "scoped-forecast.v1",
      advisoryOnly: true,
      sourceStatus: "empty_missing",
      mayAuthorizeMutation: false,
      maySupportNarrationClaim: false,
      entries: [],
      forbiddenPrivateTerms: [],
    },
  };
}

function checklist(inputFrame = frame()): GmActionChecklist {
  return {
    version: "gm-action-checklist.v1",
    checklistId: "gm-action-checklist-stage4-1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      gmReadPath: "procedural",
      judgmentId: "judge-stage4-1",
      judgeCheckNeed: "backend_action_plan_needed",
      judgeNextStep: "action_plan",
      judgeNoRollReasonCode: "backend_receipt_required",
    },
    base: inputFrame.base,
    turnIntent: {
      playerIntent: "Move to North Hall.",
      admittedConsequenceNeed: "Movement needs backend receipt authority.",
    },
    steps: [{
      stepId: "step-1",
      purpose: "Resolve movement through Stage 4.",
      actorRef: "Player",
      targetRefs: ["North Hall"],
      evidenceRefs: ["Player", "North Hall"],
      intended: {
        kind: "movement",
        stateOrEvidence: "state",
        requiredCapabilityId: "movement",
        summary: "Move the player to North Hall if the backend accepts the route.",
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
        reason: "Movement requires a terminal backend receipt.",
      },
      dependsOnStepIds: [],
      expectedVisibleEffect: {
        summary: "The player may arrive at North Hall only after accepted receipt.",
        visibleRefs: ["Player", "North Hall"],
      },
    }],
    authority: {
      evidenceAuthority: "planning_only",
      mutationAuthority: "none",
      mayAuthorizeMutation: false,
      mayGenerateExecutableRequest: false,
      maySupportNarrationClaim: false,
      settledTruth: false,
      publicExposure: "stage_summary_only",
    },
  };
}

function checklistForKind(
  kind: GmActionChecklist["steps"][number]["intended"]["kind"],
  inputFrame = frame(),
): GmActionChecklist {
  const base = checklist(inputFrame);
  const capability = kind === "observe_visible"
    ? "observe_visible"
    : kind === "local_observation"
      ? "local_observation"
      : kind === "route_options"
        ? "route_options"
        : kind === "time_advance"
          ? "time_advance"
          : kind === "scene_beat_record"
            ? "scene_beat_record"
            : kind === "dialogue_record"
              ? "dialogue_record"
              : kind === "support_actor_create"
                ? "support_actor_create"
                : kind === "condition_set"
                  ? "condition_set"
                  : kind === "item_transfer"
                    ? "item_transfer"
                    : kind === "minor_poi_create"
                      ? "minor_poi_create"
                      : kind === "device_surface_observation"
                        ? "device_surface_observation"
              : base.steps[0].intended.requiredCapabilityId;
  return {
    ...base,
    steps: [{
      ...base.steps[0],
      targetRefs: kind === "movement"
        ? ["North Hall"]
        : kind === "dialogue_record" || kind === "local_observation"
          ? ["Guide", "Market"]
          : ["Market"],
      evidenceRefs: kind === "dialogue_record" || kind === "local_observation" ? ["Player", "Guide", "Market"] : ["Player", "Market"],
      intended: {
        ...base.steps[0].intended,
        kind,
        requiredCapabilityId: capability,
        stateOrEvidence: kind === "time_advance" || kind === "movement" || kind === "support_actor_create" || kind === "condition_set" || kind === "item_transfer" || kind === "minor_poi_create"
          ? "state"
          : kind === "dialogue_record"
            ? "terminal_player_visible"
            : "evidence",
        summary: kind === "support_actor_create"
          ? "Stage 4 may materialize one ordinary temporary current-scene support actor with roleKind=vendor; requested role text: local vendor."
          : kind === "condition_set"
            ? "Stage 4 must apply one backend-owned Player local condition in the current scene."
          : kind === "dialogue_record"
            ? "Stage 4 must request one dialogue_record for Guide's direct response to Player. The accepted receipt proves visible response content only."
          : base.steps[0].intended.summary,
        ...(kind === "condition_set"
          ? {
            localConditionPlan: {
              actorRef: "Player" as const,
              operation: "apply" as const,
              conditionKey: "kneeling" as const,
              conditionScope: "current_scene" as const,
              anchorRef: "Market",
              targetKind: "current_scene" as const,
              targetRef: "Market",
              replacementPolicy: "replace_same_condition_group" as const,
            },
          }
          : {}),
        ...(kind === "scene_beat_record"
          ? {
            sceneBeatPlan: {
              actorRef: "Player" as const,
              beatKind: "local_interaction" as const,
              requestedBeatText: "Nod to the market crowd without leaving",
              anchorRef: "Market",
              persistenceScope: "turn_event_only" as const,
            },
          }
          : {}),
        ...(kind === "support_actor_create"
          ? {
            supportActorPlan: {
              actorRef: "Player" as const,
              roleKind: "vendor" as const,
              requestedRoleText: "local vendor",
              anchorRef: "Market",
              intendedUse: "presence_only" as const,
              reusePolicy: "reuse_matching_temporary_current_scene_or_create" as const,
            },
          }
          : {}),
        ...(kind === "dialogue_record"
          ? {
            dialoguePlan: {
              actorRef: "Player" as const,
              speakerSource: "existing_visible_actor" as const,
              speakerRef: "Guide",
              materializedSpeakerBindingId: null,
              addresseeRef: "Player" as const,
              playerIntent: "Ask Guide for a visible response",
              responseScope: "visible_speaker_response_only" as const,
            },
          }
          : {}),
        ...(kind === "time_advance"
          ? {
            timeAdvancePlan: {
              actorRef: "Player" as const,
              sceneRef: "Market",
              elapsedMinutes: 5,
              reasonKind: "wait" as const,
              requestedDurationText: "a few minutes",
            },
          }
          : {}),
        ...(kind === "local_observation"
          ? {
            localObservationPlan: {
              actorRef: "Player" as const,
              mode: "target_match" as const,
              queryText: "Guide",
              targetRef: "Guide",
              surfaceKinds: ["visible_actor", "visible_target"] as const,
              allowBoundedNegative: true,
              anchorRef: "Market",
            },
          }
          : {}),
      },
      expectedVisibleEffect: {
        summary: `${kind} may be visible only after accepted receipt.`,
        visibleRefs: kind === "dialogue_record" || kind === "local_observation" ? ["Player", "Guide", "Market"] : ["Player", "Market"],
      },
    }],
  };
}

function conditionChecklist(input: {
  frame: AuthoritativeSceneFrame;
  operation?: "apply" | "clear";
  conditionKey?: NonNullable<GmActionChecklist["steps"][number]["intended"]["localConditionPlan"]>["conditionKey"];
  targetKind?: NonNullable<GmActionChecklist["steps"][number]["intended"]["localConditionPlan"]>["targetKind"];
  targetRef?: string | null;
  requestedPostureText?: string;
  replacementPolicy?: "replace_same_condition_group" | "no_replacement";
  dependsOnStepIds?: GmActionChecklist["steps"][number]["dependsOnStepIds"];
  dependencyBindings?: GmActionChecklist["steps"][number]["dependencyBindings"];
}): GmActionChecklist {
  const base = checklistForKind("condition_set", input.frame);
  const step = base.steps[0]!;
  return {
    ...base,
    steps: [{
      ...step,
      dependsOnStepIds: input.dependsOnStepIds ?? step.dependsOnStepIds,
      dependencyBindings: input.dependencyBindings ?? step.dependencyBindings,
      intended: {
        ...step.intended,
        localConditionPlan: {
          actorRef: "Player",
          operation: input.operation ?? "apply",
          conditionKey: input.conditionKey ?? "kneeling",
          requestedPostureText: input.requestedPostureText,
          conditionScope: "current_scene",
          anchorRef: "Market",
          targetKind: input.targetKind ?? "current_scene",
          targetRef: input.targetRef ?? "Market",
          replacementPolicy: input.replacementPolicy ?? (input.operation === "clear" ? "no_replacement" : "replace_same_condition_group"),
        },
      },
    }],
  };
}

function supportThenDialogueChecklist(inputFrame = frame()): GmActionChecklist {
  const base = checklistForKind("support_actor_create", inputFrame);
  const supportStep = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Ask a local vendor what changed today.",
      admittedConsequenceNeed: "Support actor materialization must refresh SceneFrame before dialogue.",
    },
    steps: [
      supportStep,
      {
        ...supportStep,
        stepId: "step-2",
        purpose: "Record dependent support actor dialogue only after post-materialization SceneFrame refresh.",
        targetRefs: ["Market"],
        evidenceRefs: ["Player", "Market"],
        intended: {
          kind: "dialogue_record",
          stateOrEvidence: "terminal_player_visible",
          requiredCapabilityId: "dialogue_record",
          summary: "Stage 4 may record dialogue only from the freshly materialized support actor after a post-dependency authoritative SceneFrame contains that actor.",
          dialoguePlan: {
            actorRef: "Player",
            speakerSource: "materialized_support_actor",
            speakerRef: null,
            materializedSpeakerBindingId: "materialized_speaker",
            addresseeRef: "Player",
            playerIntent: "Ask a local vendor what changed today",
            responseScope: "visible_speaker_response_only",
          },
        },
        dependsOnStepIds: ["step-1"],
        dependencyBindings: [{
          bindingId: "materialized_speaker",
          fromStepId: "step-1",
          requiredCapabilityId: "support_actor_create",
          requiredReceiptAuthority: "support_actor_materialization_receipt",
          sourcePath: "publicResult.supportActor.actorRef",
          resolveIn: "post_dependency_scene_frame",
          requiredFramePresence: "actors_and_citableRefs",
        }],
        expectedVisibleEffect: {
          summary: "If support materialization is accepted and refreshed into SceneFrame actors/citableRefs, one visible support actor response may be recorded.",
          visibleRefs: ["Player", "Market"],
        },
      },
    ],
  };
}

function supportActorEffect(roleKind: "vendor" | "guide" = "vendor") {
  return {
    kind: "support_actor_create" as const,
    authorityKind: "ordinary_current_scene_support_actor" as const,
    anchorScope: "current_scene" as const,
    anchorRef: "Market",
    roleKind,
    roleLabel: roleKind,
    publicPresentation: {
      presentationMode: "visible_presence_only",
      visibleCueProfile: {
        placement: "beside_counter_or_stall",
        bearing: "standing_in_view",
        detail: "wooden_counter",
      },
      voiceHint: null,
    },
    identityBounds: {
      tier: "temporary" as const,
      persistence: "current_scene" as const,
      significance: "minor_support" as const,
      agency: "reactive_only" as const,
      mayBecomePersistentHere: false as const,
    },
    reusePolicy: "reuse_matching_temporary_current_scene_or_create" as const,
    reason: `The player requested an ordinary local ${roleKind}.`,
    evidenceRefs: ["Player", "Market"],
    forbiddenPayloads: {
      dialogueContent: false as const,
      worldFact: false as const,
      relationship: false as const,
      itemState: false as const,
      routeTruth: false as const,
      futureRelevance: false as const,
      privateKnowledge: false as const,
    },
  };
}

function refreshedTurnInput(input: {
  receipt: CleanStage4Receipt;
  playerAction?: string;
}) {
  const { receipt } = input;
  return {
    version: "gameplay-runtime.turn-input.v1" as const,
    route: "/api/chat/action" as const,
    campaignId: CAMPAIGN_ID,
    turnId: "clean-turn-stage4-1",
    idempotencyKey: `refresh-${Date.now()}`,
    playerAction: {
      submitted: input.playerAction ?? "I ask the vendor what changed today.",
      normalized: input.playerAction ?? "I ask the vendor what changed today.",
      source: "typed" as const,
    },
    base: {
      tick: receipt.result.tick,
      worldVersion: receipt.result.worldVersion,
      worldTimeMinutes: receipt.result.worldTimeMinutes,
      chatHistoryLengthBeforeTurn: 0,
      preTurnSnapshot: {
        bundleDir: path.join(tempRoot, "snapshot-refresh"),
        capturedAt: Date.now(),
      },
    },
    providers: {
      judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
    },
  };
}

function insertNpc(input: {
  id: string;
  name: string;
  tier?: "temporary" | "persistent" | "key";
  locationId?: string | null;
  sceneLocationId?: string | null;
  tags?: string[];
  persona?: string;
}): void {
  const tags = input.tags ?? [];
  exec(
    `INSERT INTO npcs (
      id, campaign_id, name, persona, character_record, derived_tags, tags, tier,
      current_location_id, current_scene_location_id, goals, beliefs, unprocessed_importance, inactive_ticks, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    CAMPAIGN_ID,
    input.name,
    input.persona ?? `${input.name} persona.`,
    "{}",
    JSON.stringify(tags),
    JSON.stringify(tags),
    input.tier ?? "temporary",
    input.locationId ?? "loc-market",
    input.sceneLocationId ?? "loc-market",
    JSON.stringify({ short_term: [], long_term: [] }),
    "[]",
    0,
    0,
    Date.now(),
  );
}

function insertItem(input: {
  id: string;
  name: string;
  ownerId?: string | null;
  locationId?: string | null;
  equipState?: "carried" | "equipped";
  equippedSlot?: string | null;
  tags?: string[];
}): void {
  exec(
    `INSERT INTO items (
      id, campaign_id, name, tags, owner_id, location_id, equip_state, equipped_slot, is_signature
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    CAMPAIGN_ID,
    input.name,
    JSON.stringify(input.tags ?? []),
    input.ownerId ?? null,
    input.locationId ?? null,
    input.equipState ?? "carried",
    input.equippedSlot ?? null,
    0,
  );
}

function itemTransferFrame(worldVersion = 0): AuthoritativeSceneFrame {
  return {
    ...frame(),
    frameId: `frame-stage4-item-${worldVersion}`,
    turnId: `clean-turn-stage4-item-${worldVersion}`,
    base: { tick: 0, worldVersion, worldTimeMinutes: 0 },
    playerAction: "I hand the Brass Tube to Guide.",
    actors: [{
      ref: "Guide",
      label: "Guide",
      role: "support",
      visibleStatus: { hp: null, conditions: [] },
    }],
    targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
    inventory: [{
      ref: "Brass Tube",
      label: "Brass Tube",
      equipState: "carried",
      tags: [],
    }],
    capabilities: [
      ...frame().capabilities,
      { capabilityId: "item_transfer", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "North Hall", "Guide", "Brass Tube"],
  };
}

function itemTransferChecklist(inputFrame = itemTransferFrame()): GmActionChecklist {
  const base = checklistForKind("item_transfer", inputFrame);
  const step = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Hand Brass Tube to Guide.",
      admittedConsequenceNeed: "Item custody/equip state requires backend receipt authority.",
    },
    steps: [{
      ...step,
      targetRefs: ["Brass Tube", "Guide", "Market"],
      evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      intended: {
        kind: "item_transfer",
        stateOrEvidence: "state",
        requiredCapabilityId: "item_transfer",
        summary: "Stage 4 must transfer Brass Tube from Player inventory to visible Guide through backend item authority.",
        itemTransferPlan: {
          actorRef: "Player",
          operation: "give_to_visible_actor",
          itemRef: "Brass Tube",
          sourceKind: "player_inventory",
          targetKind: "visible_actor",
          targetRef: "Guide",
          targetEquipState: "carried",
          targetEquippedSlot: null,
          anchorRef: "Market",
        },
      },
      expectedVisibleEffect: {
        summary: "Accepted item transfer receipt only; no NPC reaction or dialogue is authorized.",
        visibleRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    }],
  };
}

function receiveItemTransferFrame(worldVersion = 0): AuthoritativeSceneFrame {
  return {
    ...frame(),
    frameId: `frame-stage4-item-receive-${worldVersion}`,
    turnId: `clean-turn-stage4-item-receive-${worldVersion}`,
    base: { tick: 0, worldVersion, worldTimeMinutes: 0 },
    playerAction: "I ask Guide to return the Brass Tube to me.",
    actors: [{
      ref: "Guide",
      label: "Guide",
      role: "support",
      visibleStatus: { hp: null, conditions: [] },
    }],
    targets: [
      { ref: "Guide", label: "Guide", kind: "actor" },
      { ref: "Brass Tube", label: "Brass Tube", kind: "item" },
    ],
    inventory: [],
    capabilities: [
      ...frame().capabilities,
      { capabilityId: "item_transfer", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "North Hall", "Guide", "Brass Tube"],
  };
}

function receiveItemTransferChecklist(inputFrame = receiveItemTransferFrame()): GmActionChecklist {
  const base = checklistForKind("item_transfer", inputFrame);
  const step = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Ask Guide to return Brass Tube to Player.",
      admittedConsequenceNeed: "Item custody/equip state requires backend receipt authority.",
    },
    steps: [{
      ...step,
      targetRefs: ["Brass Tube", "Guide", "Player", "Market"],
      evidenceRefs: ["Player", "Brass Tube", "Guide", "Market"],
      intended: {
        kind: "item_transfer",
        stateOrEvidence: "state",
        requiredCapabilityId: "item_transfer",
        summary: "Stage 4 must transfer Brass Tube from visible Guide to Player inventory through backend item authority.",
        itemTransferPlan: {
          actorRef: "Player",
          operation: "receive_from_visible_actor",
          itemRef: "Brass Tube",
          sourceKind: "visible_actor_item",
          sourceRef: "Guide",
          targetKind: "player_inventory",
          targetRef: "Player",
          targetEquipState: "carried",
          targetEquippedSlot: null,
          anchorRef: "Market",
        },
      },
      expectedVisibleEffect: {
        summary: "Accepted item transfer receipt only; no NPC reaction or dialogue is authorized.",
        visibleRefs: ["Player", "Brass Tube", "Guide", "Market"],
      },
    }],
  };
}

function minorPoiFrame(worldVersion = 0): AuthoritativeSceneFrame {
  return {
    ...frame(),
    frameId: `frame-stage4-minor-poi-${worldVersion}`,
    turnId: `clean-turn-stage4-minor-poi-${worldVersion}`,
    base: { tick: 0, worldVersion, worldTimeMinutes: 0 },
    playerAction: "I mark the tea stall as a place to meet.",
    targets: worldVersion > 0
      ? [{ ref: "tea_stall", label: "Tea Stall", kind: "place_handle" }]
      : [],
    currentScenePlaceHandleSurface: {
      surfaceVersion: "scene_frame_current_place_handle_surface.v1",
      anchorRef: "Market",
      anchorLabel: "Market",
      allowedPlaceKinds: ["stall", "counter", "bench", "landmark", "signage", "cover", "doorway", "alcove", "workstation", "notice_board", "other_place"],
      existingPlaceHandleRefs: worldVersion > 0 ? ["tea_stall"] : [],
      maxCreatesPerTurn: 1,
      creationAuthority: "ordinary_public_visible_current_scene_handle_only",
    },
    capabilities: [
      ...frame().capabilities,
      { capabilityId: "minor_poi_create", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: worldVersion > 0
      ? ["Player", "Market", "North Hall", "tea_stall"]
      : ["Player", "Market", "North Hall"],
  };
}

function minorPoiChecklist(inputFrame = minorPoiFrame()): GmActionChecklist {
  const base = checklistForKind("minor_poi_create", inputFrame);
  const step = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Mark Tea Stall as a current-scene place handle.",
      admittedConsequenceNeed: "Visible place handle creation requires backend receipt authority.",
    },
    steps: [{
      ...step,
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        kind: "minor_poi_create",
        stateOrEvidence: "state",
        requiredCapabilityId: "minor_poi_create",
        summary: "Stage 4 must create or reuse Tea Stall as a visible current-scene place handle only.",
        minorPoiPlan: {
          actorRef: "Player",
          placeLabel: "Tea Stall",
          placeKind: "stall",
          anchorRef: "Market",
          reusePolicy: "reuse_matching_current_scene_place_handle_or_create",
        },
      },
      expectedVisibleEffect: {
        summary: "Accepted minor POI handle receipt only; no route, location, service, sign text, or discovery is authorized.",
        visibleRefs: ["Player", "Market"],
      },
    }],
  };
}

function minorPoiThenDialogueChecklist(inputFrame = minorPoiFrame()): GmActionChecklist {
  const base = minorPoiChecklist(inputFrame);
  const poiStep = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Point out Tea Stall, then ask Guide to watch it.",
      admittedConsequenceNeed: "Minor POI handle must refresh SceneFrame before visible dialogue can cite it.",
    },
    steps: [
      poiStep,
      {
        ...poiStep,
        stepId: "step-2",
        purpose: "Record dependent visible Guide dialogue only after post-minor-POI SceneFrame refresh.",
        targetRefs: ["Guide", "tea_stall"],
        evidenceRefs: ["Player", "Guide", "tea_stall", "Market"],
        intended: {
          kind: "dialogue_record",
          stateOrEvidence: "terminal_player_visible",
          requiredCapabilityId: "dialogue_record",
          summary: "Stage 4 may record Guide dialogue only after the accepted minor POI handle is reflected in a refreshed SceneFrame.",
          dialoguePlan: {
            actorRef: "Player",
            speakerSource: "existing_visible_actor",
            speakerRef: "Guide",
            materializedSpeakerBindingId: null,
            addresseeRef: "Player",
            playerIntent: "Ask Guide to watch Tea Stall",
            responseScope: "visible_speaker_response_only",
          },
        },
        dependsOnStepIds: ["step-1"],
        dependencyBindings: [{
          bindingId: "minor_poi_handle",
          fromStepId: "step-1",
          requiredCapabilityId: "minor_poi_create",
          requiredReceiptAuthority: "minor_poi_handle_receipt",
          sourcePath: "publicResult.minorPoi",
          resolveIn: "post_dependency_scene_frame",
          requiredFramePresence: "targets_and_citableRefs",
        }],
        expectedVisibleEffect: {
          summary: "If minor POI handle is accepted and refreshed into SceneFrame targets/citableRefs, one visible Guide response may be recorded.",
          visibleRefs: ["Player", "Guide", "tea_stall"],
        },
      },
    ],
  };
}

function deviceSurfaceFrame(input: {
  facets?: NonNullable<AuthoritativeSceneFrame["deviceStatusSurfaces"]>[number]["facets"];
  availableFacetKinds?: NonNullable<AuthoritativeSceneFrame["deviceStatusSurfaces"]>[number]["availableFacetKinds"];
  playerAction?: string;
} = {}): AuthoritativeSceneFrame {
  const base = frame();
  const facets = input.facets ?? [{
    facetKind: "screen_state" as const,
    displayLabel: "Screen",
    valueText: "lit",
    valueClass: "indicator_state" as const,
    publicSafe: true as const,
  }, {
    facetKind: "signal_indicator" as const,
    displayLabel: "Signal indicator",
    valueText: "two visible bars",
    valueClass: "meter_value" as const,
    publicSafe: true as const,
  }];
  return {
    ...base,
    frameId: "frame-stage4-device-1",
    turnId: "clean-turn-stage4-device-1",
    playerAction: input.playerAction ?? "I check the Burner phone screen and signal indicator.",
    inventory: [{
      ref: "Burner phone",
      label: "Burner phone",
      equipState: "equipped",
      tags: ["phone"],
    }],
    deviceStatusSurfaces: [{
      surfaceVersion: "scene_frame_device_status_surface.v1",
      deviceRef: "Burner phone",
      deviceLabel: "Burner phone",
      deviceKind: "phone",
      holderScope: "player_equipped",
      anchorRef: "Market",
      availableFacetKinds: input.availableFacetKinds ?? facets.map((facet) => facet.facetKind),
      facets,
    }],
    capabilities: [
      ...base.capabilities,
      { capabilityId: "device_surface_observation", evidenceAuthority: "receipt_required", allowed: true },
    ],
    citableRefs: ["Player", "Market", "North Hall", "Burner phone"],
  };
}

function deviceSurfaceChecklist(inputFrame = deviceSurfaceFrame(), input: {
  facetKinds?: NonNullable<GmActionChecklist["steps"][number]["intended"]["deviceObservationPlan"]>["facetKinds"];
  allowNoSurface?: boolean;
  requestedFacetText?: string;
} = {}): GmActionChecklist {
  const base = checklistForKind("device_surface_observation", inputFrame);
  const step = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Check Burner phone visible surface indicators.",
      admittedConsequenceNeed: "Device surface observations require backend receipt authority.",
    },
    steps: [{
      ...step,
      targetRefs: ["Burner phone", "Market"],
      evidenceRefs: ["Player", "Burner phone", "Market"],
      intended: {
        kind: "device_surface_observation",
        stateOrEvidence: "evidence",
        requiredCapabilityId: "device_surface_observation",
        summary: "Stage 4 must read only modeled public device surface facets from the current SceneFrame.",
        deviceObservationPlan: {
          actorRef: "Player",
          deviceRef: "Burner phone",
          requestedDeviceText: "Burner phone",
          requestedFacetText: input.requestedFacetText ?? "screen and signal indicator",
          facetKinds: input.facetKinds ?? ["screen_state", "signal_indicator"],
          allowNoSurface: input.allowNoSurface ?? true,
          anchorRef: "Market",
        },
      },
      expectedVisibleEffect: {
        summary: "Accepted device surface observation receipt only; no private contents or network truth is authorized.",
        visibleRefs: ["Player", "Burner phone", "Market"],
      },
    }],
  };
}

type Stage4RequiredPlanKey =
  | "localObservationPlan"
  | "deviceObservationPlan"
  | "localConditionPlan"
  | "itemTransferPlan"
  | "minorPoiPlan";

function withoutIntendedPlan(checklistInput: GmActionChecklist, planKey: Stage4RequiredPlanKey): GmActionChecklist {
  const step = checklistInput.steps[0]!;
  const intended = { ...step.intended };
  delete intended[planKey];
  return {
    ...checklistInput,
    steps: [{
      ...step,
      intended,
    }],
  };
}

function itemTransferThenDialogueChecklist(inputFrame = itemTransferFrame()): GmActionChecklist {
  const base = itemTransferChecklist(inputFrame);
  const itemStep = base.steps[0]!;
  return {
    ...base,
    turnIntent: {
      playerIntent: "Hand Brass Tube to Guide, then ask what it is.",
      admittedConsequenceNeed: "Item custody must refresh SceneFrame before visible dialogue can be recorded.",
    },
    steps: [
      itemStep,
      {
        ...itemStep,
        stepId: "step-2",
        purpose: "Record dependent visible Guide dialogue only after post-item-transfer SceneFrame refresh.",
        targetRefs: ["Guide"],
        evidenceRefs: ["Player", "Guide", "Market"],
        intended: {
          kind: "dialogue_record",
          stateOrEvidence: "terminal_player_visible",
          requiredCapabilityId: "dialogue_record",
          summary: "Stage 4 may record Guide dialogue only after the accepted item transfer is reflected in a refreshed SceneFrame.",
          dialoguePlan: {
            actorRef: "Player",
            speakerSource: "existing_visible_actor",
            speakerRef: "Guide",
            materializedSpeakerBindingId: null,
            addresseeRef: "Player",
            playerIntent: "Ask Guide what the Brass Tube is",
            responseScope: "visible_speaker_response_only",
          },
        },
        dependsOnStepIds: ["step-1"],
        dependencyBindings: [{
          bindingId: "item_transfer_state",
          fromStepId: "step-1",
          requiredCapabilityId: "item_transfer",
          requiredReceiptAuthority: "item_transfer_receipt",
          sourcePath: "publicResult.itemTransfer",
          resolveIn: "post_dependency_scene_frame",
          requiredFramePresence: "item_state_reconciled",
        }],
        expectedVisibleEffect: {
          summary: "If item transfer is accepted and refreshed into SceneFrame item state, one visible Guide response may be recorded.",
          visibleRefs: ["Player", "Guide"],
        },
      },
    ],
  };
}

async function runVendorSupportActorCreate(inputFrame = {
  ...frame(),
  playerAction: "I look for a local vendor in the market.",
  capabilities: [
    ...frame().capabilities,
    { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
  ],
  citableRefs: ["Player", "Market", "North Hall"],
}): Promise<Awaited<ReturnType<typeof runCleanStage4Execution>>> {
  return runCleanStage4Execution({
    frame: inputFrame,
    checklist: checklistForKind("support_actor_create", inputFrame),
    generateSupportActorRequest: async () => supportActorEffect("vendor"),
  });
}

describe("clean Stage 4 executor DB contracts", () => {
  beforeEach(() => {
    previousCampaignRoot = process.env.GSD_CAMPAIGNS_ROOT;
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "wf-stage4-"));
    process.env.GSD_CAMPAIGNS_ROOT = tempRoot;
    const campaignDir = path.join(tempRoot, CAMPAIGN_ID);
    fs.mkdirSync(campaignDir, { recursive: true });
    fs.writeFileSync(path.join(campaignDir, "config.json"), JSON.stringify({
      name: "Stage 4 Campaign",
      premise: "A focused Stage 4 test campaign.",
      generationComplete: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }, null, 2));
    connectDb(path.join(tempRoot, "state.db"));
    runMigrations();
    seedWorld();
  });

  afterEach(() => {
    closeDb();
    if (previousCampaignRoot === undefined) delete process.env.GSD_CAMPAIGNS_ROOT;
    else process.env.GSD_CAMPAIGNS_ROOT = previousCampaignRoot;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it("requires typed Stage 4 plans before building receipt-owned primitive requests", async () => {
    const conditionFrame: AuthoritativeSceneFrame = {
      ...frame(),
      frameId: "frame-stage4-condition-plan-required",
      turnId: "clean-turn-stage4-condition-plan-required",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "condition_set", evidenceAuthority: "receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    const localObservationFrame: AuthoritativeSceneFrame = {
      ...frame(),
      frameId: "frame-stage4-local-observation-plan-required",
      turnId: "clean-turn-stage4-local-observation-plan-required",
      playerAction: "I look at Guide.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "local_observation", evidenceAuthority: "receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };

    const cases = [
      {
        frame: localObservationFrame,
        checklist: withoutIntendedPlan(checklistForKind("local_observation", localObservationFrame), "localObservationPlan"),
        message: "local_observation Stage4 request requires checklist intended.localObservationPlan.",
      },
      {
        frame: deviceSurfaceFrame(),
        checklist: withoutIntendedPlan(deviceSurfaceChecklist(deviceSurfaceFrame()), "deviceObservationPlan"),
        message: "device_surface_observation Stage4 request requires checklist intended.deviceObservationPlan.",
      },
      {
        frame: conditionFrame,
        checklist: withoutIntendedPlan(conditionChecklist({ frame: conditionFrame }), "localConditionPlan"),
        message: "condition_set Stage4 request requires checklist intended.localConditionPlan.",
      },
      {
        frame: itemTransferFrame(),
        checklist: withoutIntendedPlan(itemTransferChecklist(itemTransferFrame()), "itemTransferPlan"),
        message: "item_transfer Stage4 request requires checklist intended.itemTransferPlan.",
      },
      {
        frame: minorPoiFrame(),
        checklist: withoutIntendedPlan(minorPoiChecklist(minorPoiFrame()), "minorPoiPlan"),
        message: "minor_poi_create Stage4 request requires checklist intended.minorPoiPlan.",
      },
    ];

    for (const testCase of cases) {
      await expect(runCleanStage4Execution({
        frame: testCase.frame,
        checklist: testCase.checklist,
      })).rejects.toThrow(testCase.message);
      const receiptCount = getSqliteConnection()
        .prepare("SELECT COUNT(*) AS count FROM clean_gameplay_stage4_receipts WHERE campaign_id = ?")
        .get(CAMPAIGN_ID) as { count: number };
      expect(receiptCount.count).toBe(0);
    }
  });

  it("keeps broad-location background actors out of clean SceneFrame actors and citable refs", async () => {
    const now = Date.now();
    exec(
      `INSERT INTO npcs (
        id,
        campaign_id,
        name,
        persona,
        tags,
        tier,
        current_location_id,
        goals,
        beliefs,
        unprocessed_importance,
        inactive_ticks,
        created_at,
        character_record,
        derived_tags,
        current_scene_location_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "npc-sibling-scene",
      CAMPAIGN_ID,
      "Sibling Scene Broker",
      "Present somewhere in the broad market, but not in the player's current scene.",
      "[]",
      "persistent",
      "loc-market",
      "{\"short_term\":[],\"long_term\":[]}",
      "[]",
      0,
      0,
      now,
      "{}",
      "[]",
      "loc-north-hall",
    );

    const sceneFrame = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-background-actor",
      playerAction: {
        submitted: "I look around.",
        normalized: "I look around.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: tempRoot,
          capturedAt: now,
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
      idempotencyKey: "background-actor-clean-frame",
    });

    expect(sceneFrame.actors.map((actor) => actor.ref)).not.toContain("Sibling Scene Broker");
    expect(sceneFrame.citableRefs).not.toContain("Sibling Scene Broker");
  });

  it("keeps long recent local event summaries inside the authoritative frame text bound", async () => {
    const now = Date.now();
    const longSummary = `Bazaar clerks repeated a long public handover note. ${"Public ledger detail. ".repeat(40)}`;
    exec(
      `INSERT INTO location_recent_events (
        id,
        campaign_id,
        location_id,
        event_type,
        summary,
        visibility,
        tick,
        importance,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "recent-long-public-note",
      CAMPAIGN_ID,
      "loc-market",
      "public_note",
      longSummary,
      "player_perceivable",
      1,
      1,
      now,
    );

    const sceneFrame = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-long-recent-event",
      playerAction: {
        submitted: "I look around.",
        normalized: "I look around.",
        source: "typed",
      },
      base: {
        tick: 1,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: tempRoot,
          capturedAt: now,
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
      idempotencyKey: "long-recent-event-clean-frame",
    });

    const fact = sceneFrame.scene.recentLocalFacts.find((entry) => entry.factId === "recent-long-public-note");
    expect(fact?.summary.length).toBeLessThanOrEqual(500);
    expect(fact?.summary).toContain("Bazaar clerks repeated a long public handover note.");
    expect(fact?.summary.endsWith("...")).toBe(true);
  });

  it("exposes exact current-scene NPCs after the player moves into a sublocation", async () => {
    const now = Date.now();
    exec(
      "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, parent_location_id, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "loc-rooftop",
      CAMPAIGN_ID,
      "Rooftop Overlook",
      "A rooftop scene inside the market district.",
      "persistent_sublocation",
      "persistent",
      "loc-market",
      "[]",
      0,
      JSON.stringify(["loc-market"]),
    );
    exec(
      "UPDATE players SET current_location_id = ?, current_scene_location_id = ? WHERE id = ?",
      "loc-rooftop",
      "loc-rooftop",
      "player-1",
    );
    exec(
      `INSERT INTO npcs (
        id,
        campaign_id,
        name,
        persona,
        tags,
        tier,
        current_location_id,
        goals,
        beliefs,
        unprocessed_importance,
        inactive_ticks,
        created_at,
        character_record,
        derived_tags,
        current_scene_location_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      "npc-sendo",
      CAMPAIGN_ID,
      "Sendo Atsushi",
      "A persistent NPC physically present on the rooftop.",
      "[]",
      "persistent",
      "loc-market",
      "{\"short_term\":[],\"long_term\":[]}",
      "[]",
      0,
      0,
      now,
      "{}",
      "[]",
      "loc-rooftop",
    );

    const sceneFrame = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-current-scene-actor",
      playerAction: {
        submitted: "I look for people nearby.",
        normalized: "I look for people nearby.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: tempRoot,
          capturedAt: now,
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
      idempotencyKey: "current-scene-actor-clean-frame",
    });

    expect(sceneFrame.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Sendo Atsushi", role: "active" }),
    ]));
    expect(sceneFrame.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Sendo Atsushi", kind: "actor" }),
    ]));
    expect(sceneFrame.citableRefs).toContain("Sendo Atsushi");

    const observationChecklist = checklistForKind("local_observation", sceneFrame);
    observationChecklist.steps[0] = {
      ...observationChecklist.steps[0]!,
      targetRefs: ["Rooftop Overlook"],
      evidenceRefs: ["Player", "Rooftop Overlook"],
      intended: {
        ...observationChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "list_surface",
          queryText: "people visibly nearby",
          targetRef: null,
          surfaceKinds: ["visible_actor"],
          allowBoundedNegative: true,
          anchorRef: "Rooftop Overlook",
        },
      },
    };
    const observation = await runCleanStage4Execution({
      frame: sceneFrame,
      checklist: observationChecklist,
    });

    expect(observation.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "Sendo Atsushi is present.",
        localObservation: {
          resultKind: "positive_list",
          targetLabel: null,
          matchedEntries: [expect.objectContaining({ surfaceKind: "visible_actor", label: "Sendo Atsushi" })],
        },
      },
    });
  });

  it("applies accepted movement and persists clean receipt authority transactionally", async () => {
    const inputFrame = frame();
    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklist(inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.publicEvents).toEqual([{
      type: "state_update",
      data: {
        type: "location_change",
        locationName: "North Hall",
        travelCost: 3,
        path: ["Market", "North Hall"],
      },
    }]);

    const player = getSqliteConnection()
      .prepare("SELECT current_location_id AS currentLocationId, current_scene_location_id AS currentSceneLocationId FROM players WHERE id = ?")
      .get("player-1") as { currentLocationId: string; currentSceneLocationId: string };
    expect(player).toEqual({
      currentLocationId: "loc-north-hall",
      currentSceneLocationId: "loc-north-hall",
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 3, currentTick: 3 });

    const receiptCount = getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM clean_gameplay_stage4_receipts WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { count: number };
    expect(receiptCount.count).toBe(1);

    const authority = getSqliteConnection()
      .prepare("SELECT operation, result_world_version AS resultWorldVersion FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { operation: string; resultWorldVersion: number };
    expect(authority).toEqual({
      operation: "gameplay-cycle-runtime.player.move.v1",
      resultWorldVersion: 1,
    });

    const ledger = getSqliteConnection()
      .prepare("SELECT reason_kind AS reasonKind, delta_minutes AS deltaMinutes, result_world_time_minutes AS resultWorldTimeMinutes FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { reasonKind: string; deltaMinutes: number; resultWorldTimeMinutes: number };
    expect(ledger).toEqual({
      reasonKind: "travel",
      deltaMinutes: 3,
      resultWorldTimeMinutes: 3,
    });
  });

  it("applies accepted time advance as world-clock-only mutation", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I wait here for a few minutes.",
    };
    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("time_advance", inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.publicEvents).toEqual([{
      type: "state_update",
      data: {
        type: "time_advance",
        elapsedMinutes: 5,
        reasonKind: "wait",
      },
    }]);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "time_advance",
      status: "accepted",
      authority: {
        evidenceAuthority: "terminal_mutation_receipt",
        mutationAuthority: "world_clock_only",
        visibleResultAuthority: "may_claim_elapsed_time",
      },
      publicResult: {
        timeAdvance: {
          type: "time_advance",
          elapsedMinutes: 5,
          reasonKind: "wait",
        },
      },
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 5, currentTick: 5 });
    const ledger = getSqliteConnection()
      .prepare("SELECT reason_kind AS reasonKind, delta_minutes AS deltaMinutes FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { reasonKind: string; deltaMinutes: number };
    expect(ledger).toEqual({ reasonKind: "wait", deltaMinutes: 5 });
  });

  it("uses the checklist timeAdvancePlan duration for accepted time advance", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I wait here for 3 minutes.",
    };
    const plannedChecklist = checklistForKind("time_advance", inputFrame);
    plannedChecklist.steps[0]!.intended.timeAdvancePlan = {
      actorRef: "Player",
      sceneRef: "Market",
      elapsedMinutes: 3,
      reasonKind: "wait",
      requestedDurationText: "3 minutes",
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: plannedChecklist,
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([{
      type: "state_update",
      data: {
        type: "time_advance",
        elapsedMinutes: 3,
        reasonKind: "wait",
      },
    }]);
    const receipt = result.execution?.receipts[0];
    expect(receipt?.publicResult.timeAdvance).toEqual({
      type: "time_advance",
      elapsedMinutes: 3,
      reasonKind: "wait",
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 3, currentTick: 3 });

    const ledger = getSqliteConnection()
      .prepare("SELECT reason_kind AS reasonKind, delta_minutes AS deltaMinutes FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { reasonKind: string; deltaMinutes: number };
    expect(ledger).toEqual({ reasonKind: "wait", deltaMinutes: 3 });
  });

  it("accepts modeled public device surface facets without mutating world state", async () => {
    const inputFrame = deviceSurfaceFrame();

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: deviceSurfaceChecklist(inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.resultWorldVersion).toBe(0);
    expect(result.execution?.visibleResults[0]).toMatchObject({
      authority: "device_surface_observation_receipt",
      deviceSurfaceObservation: {
        type: "device_surface_observation",
        resultKind: "facets_observed",
        deviceLabel: "Burner phone",
        requestedFacetKinds: ["screen_state", "signal_indicator"],
        observedFacets: [
          {
            facetKind: "screen_state",
            displayLabel: "Screen",
            valueText: "lit",
            claimStatus: "modeled_public_device_surface_only",
          },
          {
            facetKind: "signal_indicator",
            displayLabel: "Signal indicator",
            valueText: "two visible bars",
            claimStatus: "modeled_public_device_surface_only",
          },
        ],
        boundedNoSurface: false,
        claimStatus: "bounded_current_frame_device_surface_only",
      },
    });
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "device_surface_observation",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        evidenceAuthority: "device_surface_observation_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_claim_device_surface_observation",
        mayAuthorizeMutation: false,
      },
    });
    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
    const authorityCount = getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { count: number };
    expect(authorityCount.count).toBe(0);
  });

  it("accepts bounded device no-surface without claiming no signal, no messages, or no-change", async () => {
    const inputFrame = deviceSurfaceFrame({
      facets: [],
      availableFacetKinds: [],
      playerAction: "I check whether the Burner phone has a message.",
    });

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: deviceSurfaceChecklist(inputFrame, {
        facetKinds: ["message_indicator"],
        requestedFacetText: "message indicator",
        allowNoSurface: true,
      }),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "device_surface_observation",
      status: "accepted",
      authority: {
        evidenceAuthority: "device_surface_observation_receipt",
        mutationAuthority: "none",
      },
      publicResult: {
        deviceSurfaceObservation: {
          resultKind: "no_requested_surface",
          deviceLabel: "Burner phone",
          requestedFacetKinds: ["message_indicator"],
          observedFacets: [],
          unavailableFacetKinds: ["message_indicator"],
          boundedNoSurface: true,
        },
      },
    });
    const summary = result.execution?.receipts[0]?.publicResult.summary ?? "";
    expect(summary).toBe("Burner phone's visible surface shows no readable public result for the requested message indicator check.");
    expect(summary).not.toMatch(/frame\/worldVersion|message_indicator|no messages|no calls|no signal|nothing changed|no change/iu);
    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });

  it("keeps multi-facet device no-surface prose generic instead of listing signal, battery, calls, or messages", async () => {
    const inputFrame = deviceSurfaceFrame({
      facets: [],
      availableFacetKinds: [],
      playerAction: "I check the phone screen for signal, battery, missed calls, messages, or anything open.",
    });

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: deviceSurfaceChecklist(inputFrame, {
        facetKinds: [
          "screen_state",
          "signal_indicator",
          "battery_indicator",
          "call_indicator",
          "message_indicator",
          "notification_indicator",
        ],
        requestedFacetText: "screen state, signal indicator, battery indicator, call indicator, message indicator, and notification indicator",
        allowNoSurface: true,
      }),
    });

    const summary = result.execution?.receipts[0]?.publicResult.summary ?? "";
    expect(summary).toBe("Burner phone's visible surface shows no readable public result for the requested surface check.");
    expect(summary).not.toMatch(/signal|battery|message|call|notification|screen|no messages|no calls|no signal|nothing changed|no change/iu);
    expect(result.execution?.receipts[0]?.publicResult.deviceSurfaceObservation?.unavailableFacetKinds).toEqual([
      "screen_state",
      "signal_indicator",
      "battery_indicator",
      "call_indicator",
      "message_indicator",
      "notification_indicator",
    ]);
  });

  it("requires an authoritative world clock row before item_transfer execution", async () => {
    insertNpc({
      id: "npc-guide",
      name: "Guide",
      tier: "temporary",
      tags: ["visible-guide"],
    });
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "player-1",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    getSqliteConnection()
      .prepare("DELETE FROM world_clocks WHERE campaign_id = ?")
      .run(CAMPAIGN_ID);
    const inputFrame = itemTransferFrame();

    await expect(runCleanStage4Execution({
      frame: inputFrame,
      checklist: itemTransferChecklist(inputFrame),
    })).rejects.toThrow(CleanStage4InvariantError);

    expect(getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-brass-tube")).toEqual({
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
    expect(getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM clean_gameplay_stage4_receipts WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ count: 0 });
    expect(getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ count: 0 });
  });

  it("transfers a carried item to a visible current-scene actor through clean item_transfer authority", async () => {
    insertNpc({
      id: "npc-guide",
      name: "Guide",
      tier: "temporary",
      tags: ["visible-guide"],
    });
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "player-1",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    const inputFrame = itemTransferFrame();

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: itemTransferChecklist(inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.execution?.resultWorldVersion).toBe(1);
    expect(result.execution?.visibleResults[0]).toMatchObject({
      authority: "item_transfer_receipt",
      itemTransfer: {
        type: "item_transfer",
        resultKind: "transferred_to_actor",
        itemLabel: "Brass Tube",
        operation: "give_to_visible_actor",
        targetLabel: "Guide",
        finalOwnerKind: "visible_actor",
        finalLocationKind: "none",
        finalEquipState: "carried",
        claimStatus: "visible_item_state_change_only",
      },
    });
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      authority: {
        evidenceAuthority: "item_transfer_receipt",
        mutationAuthority: "item_custody_location_equip_state",
        visibleResultAuthority: "may_claim_item_state_change",
      },
      publicResult: {
        itemTransfer: {
          itemLabel: "Brass Tube",
          targetLabel: "Guide",
        },
      },
      privateResult: {
        itemId: "item-brass-tube",
        itemOperation: "give_to_visible_actor",
        previousOwnerId: "player-1",
        nextOwnerId: "npc-guide",
        previousLocationId: null,
        nextLocationId: null,
        previousEquipState: "carried",
        nextEquipState: "carried",
      },
    });

    const item = getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-brass-tube") as { ownerId: string | null; locationId: string | null; equipState: string; equippedSlot: string | null };
    expect(item).toEqual({
      ownerId: "npc-guide",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 0, currentTick: 0 });
    const authority = getSqliteConnection()
      .prepare("SELECT operation, source_entity_type AS sourceEntityType, source_entity_id AS sourceEntityId, result_world_version AS resultWorldVersion FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { operation: string; sourceEntityType: string; sourceEntityId: string; resultWorldVersion: number };
    expect(authority).toEqual({
      operation: "gameplay-cycle-runtime.item_transfer.v1",
      sourceEntityType: "item",
      sourceEntityId: "item-brass-tube",
      resultWorldVersion: 1,
    });
    const ledgerCount = getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { count: number };
    expect(ledgerCount.count).toBe(0);
  });

  it("transfers to an actor visible by current_scene_location_id even when broad location differs", async () => {
    insertNpc({
      id: "npc-guide",
      name: "Guide",
      tier: "temporary",
      locationId: "loc-north-hall",
      sceneLocationId: "loc-market",
      tags: ["visible-guide"],
    });
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "player-1",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    const inputFrame = itemTransferFrame();

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: itemTransferChecklist(inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      publicResult: {
        itemTransfer: {
          resultKind: "transferred_to_actor",
          itemLabel: "Brass Tube",
          targetLabel: "Guide",
        },
      },
      privateResult: {
        nextOwnerId: "npc-guide",
      },
    });
    const item = getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState FROM items WHERE id = ?")
      .get("item-brass-tube") as { ownerId: string | null; locationId: string | null; equipState: string };
    expect(item).toEqual({
      ownerId: "npc-guide",
      locationId: null,
      equipState: "carried",
    });
  });

  it("receives a visible actor-held item back into Player inventory through clean item_transfer authority", async () => {
    insertNpc({
      id: "npc-guide",
      name: "Guide",
      tier: "temporary",
      tags: ["visible-guide"],
    });
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "npc-guide",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    const inputFrame = receiveItemTransferFrame();

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: receiveItemTransferChecklist(inputFrame),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.execution?.visibleResults[0]).toMatchObject({
      authority: "item_transfer_receipt",
      itemTransfer: {
        type: "item_transfer",
        resultKind: "received_from_actor",
        itemLabel: "Brass Tube",
        operation: "receive_from_visible_actor",
        sourceLabel: "Guide",
        targetLabel: "Mira Voss",
        finalOwnerKind: "player",
        finalLocationKind: "none",
        finalEquipState: "carried",
        claimStatus: "visible_item_state_change_only",
      },
    });
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      publicResult: {
        itemTransfer: {
          resultKind: "received_from_actor",
          itemLabel: "Brass Tube",
          sourceLabel: "Guide",
          targetLabel: "Mira Voss",
        },
      },
      privateResult: {
        itemId: "item-brass-tube",
        itemOperation: "receive_from_visible_actor",
        previousOwnerId: "npc-guide",
        nextOwnerId: "player-1",
        previousLocationId: null,
        nextLocationId: null,
      },
    });
    const item = getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-brass-tube") as { ownerId: string | null; locationId: string | null; equipState: string; equippedSlot: string | null };
    expect(item).toEqual({
      ownerId: "player-1",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
  });

  it("keeps dropped item transfers from being recreated by legacy inventory authority on reload", async () => {
    exec(
      "UPDATE players SET character_record = ?, equipped_items = ? WHERE id = ?",
      JSON.stringify({
        loadout: {
          inventorySeed: ["Courier satchel"],
          equippedItemRefs: ["Courier satchel"],
          signatureItems: ["Courier satchel"],
        },
      }),
      JSON.stringify(["Courier satchel"]),
      "player-1",
    );
    insertItem({
      id: "item-courier-satchel",
      name: "Courier satchel",
      ownerId: "player-1",
      locationId: null,
      equipState: "equipped",
      equippedSlot: "equipped",
      tags: ["starting-loadout", "equipped"],
    });
    const inputFrame: AuthoritativeSceneFrame = {
      ...itemTransferFrame(),
      frameId: "frame-stage4-drop-satchel",
      turnId: "clean-turn-stage4-drop-satchel",
      playerAction: "I set the Courier satchel down beside me.",
      actors: [],
      targets: [],
      inventory: [{
        ref: "Courier satchel",
        label: "Courier satchel",
        equipState: "equipped",
        tags: ["starting-loadout", "equipped"],
      }],
      citableRefs: ["Player", "Market", "Courier satchel"],
    };
    const base = checklistForKind("item_transfer", inputFrame);
    const step = base.steps[0]!;
    const dropChecklist: GmActionChecklist = {
      ...base,
      turnIntent: {
        playerIntent: "Set Courier satchel down in the current scene.",
        admittedConsequenceNeed: "Item location/equip state requires backend receipt authority.",
      },
      steps: [{
        ...step,
        targetRefs: ["Courier satchel", "Market"],
        evidenceRefs: ["Player", "Courier satchel", "Market"],
        intended: {
          kind: "item_transfer",
          stateOrEvidence: "state",
          requiredCapabilityId: "item_transfer",
          summary: "Stage 4 must move Courier satchel from Player inventory to the current scene.",
          itemTransferPlan: {
            actorRef: "Player",
            operation: "drop_in_current_scene",
            itemRef: "Courier satchel",
            sourceKind: "player_inventory",
            targetKind: "current_scene",
            targetRef: "Market",
            targetEquipState: "carried",
            targetEquippedSlot: null,
            anchorRef: "Market",
          },
        },
        expectedVisibleEffect: {
          summary: "Accepted item transfer receipt only.",
          visibleRefs: ["Player", "Courier satchel", "Market"],
        },
      }],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: dropChecklist,
    });

    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      publicResult: {
        itemTransfer: {
          resultKind: "dropped_in_scene",
          itemLabel: "Courier satchel",
        },
      },
    });
    ensureCampaignInventoryAuthority(CAMPAIGN_ID);

    const rows = getSqliteConnection()
      .prepare(`
        SELECT id, owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot, tags
        FROM items
        WHERE campaign_id = ? AND name = ?
        ORDER BY id
      `)
      .all(CAMPAIGN_ID, "Courier satchel") as Array<{
        id: string;
        ownerId: string | null;
        locationId: string | null;
        equipState: string;
        equippedSlot: string | null;
        tags: string;
      }>;
    expect(rows).toEqual([{
      id: "item-courier-satchel",
      ownerId: null,
      locationId: "loc-market",
      equipState: "carried",
      equippedSlot: null,
      tags: JSON.stringify(["starting-loadout", "equipped"]),
    }]);

    const playerProjection = getSqliteConnection()
      .prepare("SELECT character_record AS characterRecord, equipped_items AS equippedItems FROM players WHERE id = ?")
      .get("player-1") as { characterRecord: string; equippedItems: string };
    expect(JSON.parse(playerProjection.equippedItems)).toEqual([]);
    expect(JSON.parse(playerProjection.characterRecord).loadout).toMatchObject({
      inventorySeed: [],
      equippedItemRefs: [],
      signatureItems: [],
    });
  });

  it("executes a maintained item-readiness condition before a separate item transfer with refreshed frame state", async () => {
    insertItem({
      id: "item-courier-satchel",
      name: "Courier satchel",
      ownerId: "player-1",
      locationId: null,
      equipState: "equipped",
      equippedSlot: "equipped",
      tags: ["starting-loadout", "equipped"],
    });
    insertItem({
      id: "item-message-tube",
      name: "Message Tube",
      ownerId: "player-1",
      locationId: null,
      equipState: "equipped",
      equippedSlot: "equipped",
      tags: ["starting-loadout", "equipped"],
    });
    const inputFrame: AuthoritativeSceneFrame = {
      ...itemTransferFrame(),
      frameId: "frame-stage4-condition-then-drop",
      turnId: "clean-turn-stage4-condition-then-drop",
      playerAction: "I set the Courier satchel down while keeping the Message Tube in my hand.",
      actors: [],
      targets: [],
      inventory: [
        {
          ref: "Courier satchel",
          label: "Courier satchel",
          equipState: "equipped",
          tags: ["starting-loadout", "equipped"],
        },
        {
          ref: "Message Tube",
          label: "Message Tube",
          equipState: "equipped",
          tags: ["starting-loadout", "equipped"],
        },
      ],
      capabilities: [
        ...itemTransferFrame().capabilities,
        { capabilityId: "condition_set", evidenceAuthority: "receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "Courier satchel", "Message Tube"],
    };
    const conditionStep = conditionChecklist({
      frame: inputFrame,
      conditionKey: "gripping_held_item",
      targetKind: "inventory_item_readiness",
      targetRef: "Message Tube",
      requestedPostureText: "keeping the Message Tube in my hand",
    }).steps[0]!;
    const itemBase = checklistForKind("item_transfer", inputFrame);
    const itemStep = itemBase.steps[0]!;
    const compoundChecklist: GmActionChecklist = {
      ...itemBase,
      turnIntent: {
        playerIntent: "Set Courier satchel down while keeping Message Tube in hand.",
        admittedConsequenceNeed: "The maintained item-readiness condition must refresh SceneFrame before the separate item transfer.",
      },
      steps: [
        {
          ...conditionStep,
          targetRefs: ["Message Tube", "Market"],
          evidenceRefs: ["Player", "Message Tube", "Market"],
          expectedVisibleEffect: {
            summary: "Accepted Player item-readiness condition only.",
            visibleRefs: ["Player", "Message Tube", "Market"],
          },
        },
        {
          ...itemStep,
          stepId: "step-2",
          dependsOnStepIds: ["step-1"],
          targetRefs: ["Courier satchel", "Market"],
          evidenceRefs: ["Player", "Courier satchel", "Market"],
          intended: {
            kind: "item_transfer",
            stateOrEvidence: "state",
            requiredCapabilityId: "item_transfer",
            summary: "Stage 4 must move Courier satchel from Player inventory to the current scene after the refreshed condition frame.",
            itemTransferPlan: {
              actorRef: "Player",
              operation: "drop_in_current_scene",
              itemRef: "Courier satchel",
              sourceKind: "player_inventory",
              targetKind: "current_scene",
              targetRef: "Market",
              targetEquipState: "carried",
              targetEquippedSlot: null,
              anchorRef: "Market",
            },
          },
          expectedVisibleEffect: {
            summary: "Accepted item transfer receipt only.",
            visibleRefs: ["Player", "Courier satchel", "Market"],
          },
        },
      ],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: compoundChecklist,
      refreshFrameAfterReceipt: async ({ receipt }) => buildAuthoritativeSceneFrame(refreshedTurnInput({
        receipt,
        playerAction: inputFrame.playerAction,
      })),
    });

    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["condition_set", "accepted"],
      ["item_transfer", "accepted"],
    ]);
    expect(result.execution?.frameChain).toEqual([
      expect.objectContaining({
        source: "initial",
        base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
      }),
      expect.objectContaining({
        source: "post_dependency_scene_frame",
        base: { tick: 0, worldVersion: 1, worldTimeMinutes: 0 },
      }),
    ]);
    expect(result.execution?.receipts[1]).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      result: { tick: 0, worldVersion: 2, worldTimeMinutes: 0, mutationApplied: true },
      publicResult: {
        itemTransfer: {
          resultKind: "dropped_in_scene",
          itemLabel: "Courier satchel",
        },
      },
    });
    expect(getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-courier-satchel")).toEqual({
        ownerId: null,
        locationId: "loc-market",
        equipState: "carried",
        equippedSlot: null,
      });
    expect(getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState FROM items WHERE id = ?")
      .get("item-message-tube")).toEqual({
        ownerId: "player-1",
        locationId: null,
        equipState: "equipped",
      });
  });

  it("equips and unequips a Player inventory item through clean item_transfer authority", async () => {
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "player-1",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    insertItem({
      id: "item-signal-seal",
      name: "Signal Seal",
      ownerId: "player-1",
      locationId: null,
      equipState: "equipped",
      equippedSlot: "equipped",
    });
    const buildFrame = (worldVersion: number, equipState: "carried" | "equipped"): AuthoritativeSceneFrame => ({
      ...itemTransferFrame(worldVersion),
      frameId: `frame-stage4-equip-${worldVersion}`,
      turnId: `clean-turn-stage4-equip-${worldVersion}`,
      playerAction: equipState === "carried"
        ? "I sling the Brass Tube on my shoulder."
        : "I remove the Brass Tube from my shoulder and carry it instead.",
      actors: [],
      targets: [],
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState,
        tags: [],
      }],
      citableRefs: ["Player", "Market", "Brass Tube"],
    });
    const buildChecklist = (
      inputFrame: AuthoritativeSceneFrame,
      operation: "equip_inventory_item" | "unequip_inventory_item",
      targetEquipState: "carried" | "equipped",
      targetEquippedSlot: "equipped" | null,
    ): GmActionChecklist => {
      const base = checklistForKind("item_transfer", inputFrame);
      const step = base.steps[0]!;
      return {
        ...base,
        turnIntent: {
          playerIntent: operation === "equip_inventory_item"
            ? "Equip Brass Tube."
            : "Unequip Brass Tube.",
          admittedConsequenceNeed: "Item equip state requires backend receipt authority.",
        },
        steps: [{
          ...step,
          targetRefs: ["Brass Tube", "Player", "Market"],
          evidenceRefs: ["Player", "Brass Tube", "Market"],
          intended: {
            kind: "item_transfer",
            stateOrEvidence: "state",
            requiredCapabilityId: "item_transfer",
            summary: `Stage 4 must ${operation === "equip_inventory_item" ? "equip" : "unequip"} Brass Tube through backend item authority.`,
            itemTransferPlan: {
              actorRef: "Player",
              operation,
              itemRef: "Brass Tube",
              sourceKind: "player_inventory",
              targetKind: operation === "equip_inventory_item" ? "player_equipment" : "player_inventory",
              targetRef: "Player",
              targetEquipState,
              targetEquippedSlot,
              anchorRef: "Market",
            },
          },
          expectedVisibleEffect: {
            summary: "Accepted item transfer receipt only.",
            visibleRefs: ["Player", "Brass Tube", "Market"],
          },
        }],
      };
    };

    const invalidEquipFrame = buildFrame(0, "carried");
    await expect(runCleanStage4Execution({
      frame: invalidEquipFrame,
      checklist: buildChecklist(invalidEquipFrame, "equip_inventory_item", "equipped", null),
    })).rejects.toThrow(/targetEquippedSlot=equipped/);
    expect(getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-brass-tube")).toEqual({
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
    expect(getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
    expect(getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM clean_gameplay_stage4_receipts WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ count: 0 });
    expect(getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ count: 0 });

    const equipFrame = buildFrame(0, "carried");
    const equipResult = await runCleanStage4Execution({
      frame: equipFrame,
      checklist: buildChecklist(equipFrame, "equip_inventory_item", "equipped", "equipped"),
    });

    expect(equipResult.status).toBe("executed");
    expect(equipResult.execution?.mutationApplied).toBe(true);
    expect(equipResult.execution?.resultWorldVersion).toBe(1);
    expect(equipResult.execution?.receipts[0]).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      authority: {
        evidenceAuthority: "item_transfer_receipt",
        mutationAuthority: "item_custody_location_equip_state",
        visibleResultAuthority: "may_claim_item_state_change",
      },
      publicResult: {
        itemTransfer: {
          operation: "equip_inventory_item",
          resultKind: "equipped",
          itemLabel: "Brass Tube",
          targetLabel: "Mira Voss",
          finalOwnerKind: "player",
          finalLocationKind: "none",
          finalEquipState: "equipped",
          finalEquippedSlot: "equipped",
        },
      },
      privateResult: {
        itemId: "item-brass-tube",
        itemOperation: "equip_inventory_item",
        previousOwnerId: "player-1",
        nextOwnerId: "player-1",
        previousEquipState: "carried",
        nextEquipState: "equipped",
        nextEquippedSlot: "equipped",
      },
    });
    expect(getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-brass-tube")).toEqual({
        ownerId: "player-1",
        locationId: null,
        equipState: "equipped",
        equippedSlot: "equipped",
      });
    const equippedProjection = getSqliteConnection()
      .prepare("SELECT character_record AS characterRecord, equipped_items AS equippedItems FROM players WHERE id = ?")
      .get("player-1") as { characterRecord: string; equippedItems: string };
    const equippedItems = JSON.parse(equippedProjection.equippedItems) as string[];
    expect(equippedItems).toHaveLength(2);
    expect(equippedItems).toEqual(expect.arrayContaining(["Brass Tube", "Signal Seal"]));
    expect(JSON.parse(equippedProjection.characterRecord).loadout.inventorySeed)
      .toEqual(expect.arrayContaining(["Brass Tube", "Signal Seal"]));
    expect(JSON.parse(equippedProjection.characterRecord).loadout.equippedItemRefs)
      .toEqual(expect.arrayContaining(["Brass Tube", "Signal Seal"]));
    expect(getSqliteConnection()
      .prepare("SELECT equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-signal-seal")).toEqual({
        equipState: "equipped",
        equippedSlot: "equipped",
      });

    const unequipFrame = buildFrame(1, "equipped");
    const unequipResult = await runCleanStage4Execution({
      frame: unequipFrame,
      checklist: buildChecklist(unequipFrame, "unequip_inventory_item", "carried", null),
    });

    expect(unequipResult.status).toBe("executed");
    expect(unequipResult.execution?.mutationApplied).toBe(true);
    expect(unequipResult.execution?.resultWorldVersion).toBe(2);
    expect(unequipResult.execution?.receipts[0]).toMatchObject({
      capabilityId: "item_transfer",
      status: "accepted",
      result: { tick: 0, worldVersion: 2, worldTimeMinutes: 0, mutationApplied: true },
      publicResult: {
        itemTransfer: {
          operation: "unequip_inventory_item",
          resultKind: "unequipped",
          itemLabel: "Brass Tube",
          targetLabel: "Mira Voss",
          finalOwnerKind: "player",
          finalLocationKind: "none",
          finalEquipState: "carried",
          finalEquippedSlot: null,
        },
      },
      privateResult: {
        itemId: "item-brass-tube",
        itemOperation: "unequip_inventory_item",
        previousOwnerId: "player-1",
        nextOwnerId: "player-1",
        previousEquipState: "equipped",
        nextEquipState: "carried",
        nextEquippedSlot: null,
      },
    });
    expect(getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId, location_id AS locationId, equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-brass-tube")).toEqual({
        ownerId: "player-1",
        locationId: null,
        equipState: "carried",
        equippedSlot: null,
      });
    const carriedProjection = getSqliteConnection()
      .prepare("SELECT character_record AS characterRecord, equipped_items AS equippedItems FROM players WHERE id = ?")
      .get("player-1") as { characterRecord: string; equippedItems: string };
    expect(JSON.parse(carriedProjection.equippedItems)).toEqual(["Signal Seal"]);
    expect(JSON.parse(carriedProjection.characterRecord).loadout.inventorySeed)
      .toEqual(expect.arrayContaining(["Brass Tube", "Signal Seal"]));
    expect(JSON.parse(carriedProjection.characterRecord).loadout.equippedItemRefs)
      .toEqual(["Signal Seal"]);
    expect(getSqliteConnection()
      .prepare("SELECT equip_state AS equipState, equipped_slot AS equippedSlot FROM items WHERE id = ?")
      .get("item-signal-seal")).toEqual({
        equipState: "equipped",
        equippedSlot: "equipped",
      });
    expect(getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ worldVersion: 2, worldTimeMinutes: 0, currentTick: 0 });
    expect(getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID)).toEqual({ count: 0 });
    expect(getSqliteConnection()
      .prepare("SELECT operation FROM authority_traces WHERE campaign_id = ? ORDER BY created_at")
      .all(CAMPAIGN_ID)).toEqual([
        { operation: "gameplay-cycle-runtime.item_transfer.v1" },
        { operation: "gameplay-cycle-runtime.item_transfer.v1" },
      ]);
  });

  it("executes item_transfer then dialogue_record only after a refreshed SceneFrame reflects item state", async () => {
    insertNpc({
      id: "npc-guide",
      name: "Guide",
      tier: "temporary",
      tags: ["visible-guide"],
    });
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "player-1",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });
    const baseFrame = itemTransferFrame();
    const inputFrame: AuthoritativeSceneFrame = {
      ...baseFrame,
      playerAction: "I hand the Brass Tube to Guide and ask what it is.",
      capabilities: [
        ...baseFrame.capabilities,
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: itemTransferThenDialogueChecklist(inputFrame),
      refreshFrameAfterReceipt: async ({ receipt }) => ({
        ...inputFrame,
        frameId: "frame-post-item-transfer",
        base: {
          tick: receipt.result.tick,
          worldVersion: receipt.result.worldVersion,
          worldTimeMinutes: receipt.result.worldTimeMinutes,
        },
        inventory: [],
        citableRefs: ["Player", "Market", "North Hall", "Guide"],
      }),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "It is yours no longer.",
          summary: "Guide answers from the visible scene.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["item_transfer", "accepted"],
      ["dialogue_record", "accepted"],
    ]);
    const itemReceipt = result.execution?.receipts[0];
    const dialogueReceipt = result.execution?.receipts[1];
    expect(result.execution?.frameChain).toHaveLength(2);
    expect(result.execution?.frameChain?.[1]).toMatchObject({
      source: "post_dependency_scene_frame",
      afterReceiptId: itemReceipt?.receiptId,
      frameId: "frame-post-item-transfer",
      base: { tick: 0, worldVersion: 1, worldTimeMinutes: 0 },
    });
    expect(dialogueReceipt).toMatchObject({
      frameId: "frame-post-item-transfer",
      base: { worldVersion: 1 },
      result: { worldVersion: 1, mutationApplied: false },
      publicResult: {
        dialogue: {
          speakerLabel: "Guide",
          quotedSpeech: "It is yours no longer.",
          claimStatus: "visible_speaker_response_only",
        },
      },
    });
  });

  it("exposes visible actor-held item state to dialogue request prompts", async () => {
    insertNpc({
      id: "npc-guide",
      name: "Guide",
      tier: "temporary",
      tags: ["visible-guide"],
    });
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "npc-guide",
      locationId: null,
      equipState: "carried",
      equippedSlot: null,
    });

    const inputFrame = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-visible-holder-dialogue",
      idempotencyKey: "visible-holder-dialogue",
      playerAction: {
        submitted: "I ask Guide, \"Do you have the Brass Tube now?\"",
        normalized: "I ask Guide, \"Do you have the Brass Tube now?\"",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-visible-holder-dialogue"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });

    const brassTube = inputFrame.targets.find((target) => target.label === "Brass Tube");
    expect(brassTube).toMatchObject({
      kind: "item",
      holder: {
        holderKind: "visible_actor",
        holderLabel: "Guide",
        equipState: "carried",
      },
    });

    const promptFrame = {
      ...inputFrame,
      playerAction: "RAW_STAGE4_DIALOGUE_MARKER_NEVER_PROMPT",
    };
    const dialogueStep = {
      ...checklistForKind("dialogue_record", promptFrame).steps[0]!,
      targetRefs: ["Guide"],
      evidenceRefs: ["Player", "Guide", "Brass Tube", "Market"],
    };
    const prompt = buildStage4DialogueRequestPrompt({
      frame: promptFrame,
      step: dialogueStep,
    });
    const systemPrompt = buildStage4DialogueRequestSystemPrompt();
    expect(systemPrompt).toContain("Dialogue task card as the job contract");
    expect(systemPrompt).toContain("dialoguePlan");
    expect(systemPrompt).toContain("currentItemHolders is the complete evidence basis");
    expect(systemPrompt).toContain("one or two complete sentences under 360 characters");
    expect(systemPrompt).toContain("Do not use trailing ellipsis or cut-off fragments");
    expect(prompt).toContain("Dialogue task card:");
    expect(prompt).toContain('"dialoguePlan"');
    expect(prompt).toContain('"playerIntent": "Ask Guide for a visible response"');
    expect(prompt).not.toContain("RAW_STAGE4_DIALOGUE_MARKER_NEVER_PROMPT");
    expect(prompt).not.toContain('"playerRequest"');
    expect(prompt).toContain('"currentItemHolders"');
    expect(prompt).toContain('"label": "Brass Tube"');
    expect(prompt).toContain('"currentHolderKind": "visible_actor"');
    expect(prompt).toContain('"currentHolderLabel": "Guide"');
  });

  it("rejects ellipsis-truncated dialogue quote fragments before they become terminal receipts", () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I ask Guide for the route.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" as const }],
      citableRefs: ["Player", "Market", "Guide"],
    };

    const validation = validateDialogueRequestEffectCandidate({
      frame: inputFrame,
      step: checklistForKind("dialogue_record", inputFrame).steps[0]!,
      candidate: {
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "The route usually runs through the Bazaar throug...",
          summary: "Guide starts to answer the route question.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market"],
        stateEffects: {
          appliesState: false,
        },
      },
    });

    expect(validation.status).toBe("rejected");
    if (validation.status !== "rejected") throw new Error("expected rejected truncated dialogue");
    expect(validation.issues).toContainEqual(expect.objectContaining({
      path: "response.quotedSpeech",
      message: "Dialogue quotedSpeech must be complete text, not an ellipsis-truncated fragment.",
    }));
  });

  it("allows dialogue evidence refs to name citable route labels without treating them as speaker refs", () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I ask Guide where the tube should go.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" as const }],
      citableRefs: ["Player", "Market", "Guide", "North Hall"],
    };
    const step = checklistForKind("dialogue_record", inputFrame).steps[0]!;
    const validation = validateDialogueRequestEffectCandidate({
      frame: inputFrame,
      step,
      candidate: {
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "Take it to North Hall if you want it logged.",
          summary: "Guide names North Hall as their answer.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market", "North Hall"],
        stateEffects: {
          appliesState: false,
        },
      },
    });

    expect(validation.status).toBe("accepted");

    const badAddressee = validateDialogueRequestEffectCandidate({
      frame: inputFrame,
      step,
      candidate: {
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player", "North Hall"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "North Hall is a place, not a participant.",
          summary: "Guide answers the route-label question.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market", "North Hall"],
        stateEffects: {
          appliesState: false,
        },
      },
    });

    expect(badAddressee.status).toBe("rejected");
    if (badAddressee.status !== "rejected") throw new Error("expected rejected addressee route label");
    expect(badAddressee.issues).toContainEqual(expect.objectContaining({
      code: "unplanned_ref",
      path: "refs",
      message: "Dialogue request used speaker/addressee ref \"North Hall\" outside the accepted checklist step scope.",
    }));
  });

  it("fails item_transfer without mutating when the visible actor target is not in the current scene", async () => {
    insertItem({
      id: "item-brass-tube",
      name: "Brass Tube",
      ownerId: "player-1",
      equipState: "carried",
    });
    const inputFrame = itemTransferFrame();

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: itemTransferChecklist(inputFrame),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "item_transfer",
      status: "failed",
      failure: {
        kind: "target_not_visible",
        hiddenMutationApplied: false,
      },
    });
    const item = getSqliteConnection()
      .prepare("SELECT owner_id AS ownerId FROM items WHERE id = ?")
      .get("item-brass-tube") as { ownerId: string };
    expect(item.ownerId).toBe("player-1");
    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });

  it("creates and reuses a current-scene minor POI handle without creating a route or location", async () => {
    const inputFrame = minorPoiFrame();

    const created = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: minorPoiChecklist(inputFrame),
    });

    expect(created.status).toBe("executed");
    expect(created.publicEvents).toEqual([]);
    expect(created.execution?.mutationApplied).toBe(true);
    expect(created.execution?.resultWorldVersion).toBe(1);
    expect(created.execution?.visibleResults[0]).toMatchObject({
      authority: "minor_poi_handle_receipt",
      minorPoi: {
        type: "minor_poi_handle",
        resultKind: "created",
        poiRef: "tea_stall",
        poiLabel: "Tea Stall",
        poiKind: "stall",
        targetOnly: true,
        claimStatus: "visible_current_scene_place_handle_only",
      },
    });
    expect(created.execution?.receipts[0]).toMatchObject({
      capabilityId: "minor_poi_create",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      authority: {
        evidenceAuthority: "minor_poi_handle_receipt",
        mutationAuthority: "current_scene_minor_poi_handle",
        visibleResultAuthority: "may_claim_visible_minor_poi_handle",
      },
      privateResult: {
        minorPoiOperation: "inserted",
        anchorLocationId: "loc-market",
        anchorSceneLocationId: "loc-market",
      },
    });

    const db = getSqliteConnection();
    const poi = db
      .prepare("SELECT poi_ref AS poiRef, poi_label AS poiLabel, poi_kind AS poiKind, active FROM clean_gameplay_minor_pois WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { poiRef: string; poiLabel: string; poiKind: string; active: number };
    expect(poi).toEqual({ poiRef: "tea_stall", poiLabel: "Tea Stall", poiKind: "stall", active: 1 });
    const clockAfterCreate = db
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clockAfterCreate).toEqual({ worldVersion: 1, worldTimeMinutes: 0, currentTick: 0 });
    const authority = db
      .prepare("SELECT operation, source_entity_type AS sourceEntityType, result_world_version AS resultWorldVersion FROM authority_traces WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { operation: string; sourceEntityType: string; resultWorldVersion: number };
    expect(authority).toEqual({
      operation: "gameplay-cycle-runtime.minor_poi_create.v1",
      sourceEntityType: "minor_poi",
      resultWorldVersion: 1,
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM locations WHERE campaign_id = ?").get(CAMPAIGN_ID))
      .toEqual({ count: 2 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM location_edges WHERE campaign_id = ?").get(CAMPAIGN_ID))
      .toEqual({ count: 1 });

    const refreshed = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-stage4-minor-poi-next",
      idempotencyKey: "next-frame-minor-poi-proof",
      playerAction: {
        submitted: "I look at the Tea Stall.",
        normalized: "I look at the Tea Stall.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-minor-poi-next"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });
    expect(refreshed.targets).toContainEqual({
      ref: "tea_stall",
      label: "Tea Stall",
      kind: "place_handle",
    });
    expect(refreshed.citableRefs).toContain("tea_stall");
    expect(refreshed.movementOptions.map((option) => option.ref)).not.toContain("tea_stall");

    const reusedFrame = minorPoiFrame(1);
    const reused = await runCleanStage4Execution({
      frame: reusedFrame,
      checklist: minorPoiChecklist(reusedFrame),
    });
    expect(reused.execution?.receipts[0]).toMatchObject({
      capabilityId: "minor_poi_create",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        mutationAuthority: "none",
        mayAuthorizeMutation: false,
      },
      publicResult: {
        minorPoi: {
          resultKind: "reused",
          poiRef: "tea_stall",
          poiLabel: "Tea Stall",
        },
      },
      privateResult: {
        minorPoiOperation: "reused",
      },
    });
    expect(db.prepare("SELECT COUNT(*) AS count FROM clean_gameplay_minor_pois WHERE campaign_id = ?").get(CAMPAIGN_ID))
      .toEqual({ count: 1 });
    expect(db.prepare("SELECT COUNT(*) AS count FROM authority_traces WHERE campaign_id = ? AND operation = 'gameplay-cycle-runtime.minor_poi_create.v1'").get(CAMPAIGN_ID))
      .toEqual({ count: 1 });
  });

  it("executes minor_poi_create then dialogue_record only after a refreshed SceneFrame exposes the place handle", async () => {
    const baseFrame = minorPoiFrame();
    const inputFrame: AuthoritativeSceneFrame = {
      ...baseFrame,
      playerAction: "I point out the Tea Stall and ask Guide to watch it.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
      capabilities: [
        ...baseFrame.capabilities,
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: minorPoiThenDialogueChecklist(inputFrame),
      refreshFrameAfterReceipt: async ({ receipt }) => ({
        ...inputFrame,
        frameId: "frame-post-minor-poi",
        base: {
          tick: receipt.result.tick,
          worldVersion: receipt.result.worldVersion,
          worldTimeMinutes: receipt.result.worldTimeMinutes,
        },
        targets: [
          { ref: "Guide", label: "Guide", kind: "actor" },
          { ref: "tea_stall", label: "Tea Stall", kind: "place_handle" },
        ],
        citableRefs: ["Player", "Market", "North Hall", "Guide", "tea_stall"],
      }),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "I will keep the Tea Stall in sight.",
          summary: "Guide visibly agrees to watch the handle.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "tea_stall", "Market"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["minor_poi_create", "accepted"],
      ["dialogue_record", "accepted"],
    ]);
    const poiReceipt = result.execution?.receipts[0];
    expect(result.execution?.frameChain?.[1]).toMatchObject({
      source: "post_dependency_scene_frame",
      afterReceiptId: poiReceipt?.receiptId,
      frameId: "frame-post-minor-poi",
      base: { tick: 0, worldVersion: 1, worldTimeMinutes: 0 },
    });
    expect(result.execution?.receipts[1]).toMatchObject({
      frameId: "frame-post-minor-poi",
      publicResult: {
        dialogue: {
          speakerLabel: "Guide",
          quotedSpeech: "I will keep the Tea Stall in sight.",
        },
      },
    });
  });

  it("applies, replaces, and clears Player current-scene local conditions through clean receipt authority", async () => {
    const conditionFrame = (
      worldVersion: number,
      conditions: string[] = [],
      turnId = `clean-turn-stage4-condition-${worldVersion}`,
    ): AuthoritativeSceneFrame => ({
      ...frame(),
      turnId,
      base: { tick: 0, worldVersion, worldTimeMinutes: 0 },
      playerAction: "I settle into a visible current-scene posture.",
      player: {
        ...frame().player,
        visibleStatus: { hp: 5, conditions },
      },
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "condition_set" as const, evidenceAuthority: "receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    });

    const applyFrame = conditionFrame(0, [], "clean-turn-stage4-condition-apply");
    const applied = await runCleanStage4Execution({
      frame: applyFrame,
      checklist: conditionChecklist({ frame: applyFrame, conditionKey: "kneeling" }),
    });

    expect(applied.publicEvents).toEqual([{
      type: "state_update",
      data: expect.objectContaining({
        type: "player_local_condition",
        resultKind: "applied",
        conditionKey: "kneeling",
        conditionLabel: "kneeling",
      }),
    }]);
    expect(applied.execution?.receipts[0]).toMatchObject({
      capabilityId: "condition_set",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      authority: {
        evidenceAuthority: "player_local_condition_receipt",
        mutationAuthority: "player_local_condition_state",
        visibleResultAuthority: "may_claim_player_local_condition",
      },
      publicResult: {
        condition: {
          resultKind: "applied",
          conditionKey: "kneeling",
          conditionScope: "current_scene",
          anchorSceneLabel: "Market",
        },
      },
    });

    const refreshed = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-stage4-condition-next",
      idempotencyKey: "next-frame-condition-proof",
      playerAction: {
        submitted: "I stay kneeling.",
        normalized: "I stay kneeling.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-condition-next"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });
    expect(refreshed.capabilities.map((entry) => entry.capabilityId)).toContain("condition_set");
    expect(refreshed.player.visibleStatus.conditions).toContain("kneeling");

    const repeatFrame = conditionFrame(1, ["kneeling"], "clean-turn-stage4-condition-repeat");
    const alreadyPresent = await runCleanStage4Execution({
      frame: repeatFrame,
      checklist: conditionChecklist({ frame: repeatFrame, conditionKey: "kneeling" }),
    });
    expect(alreadyPresent.execution?.receipts[0]).toMatchObject({
      capabilityId: "condition_set",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        mutationAuthority: "none",
        mayAuthorizeMutation: false,
      },
      publicResult: {
        condition: { resultKind: "already_present", conditionKey: "kneeling" },
      },
    });

    const replaceFrame = conditionFrame(1, ["kneeling"], "clean-turn-stage4-condition-replace");
    const replaced = await runCleanStage4Execution({
      frame: replaceFrame,
      checklist: conditionChecklist({ frame: replaceFrame, conditionKey: "crouched" }),
    });
    expect(replaced.execution?.receipts[0]).toMatchObject({
      capabilityId: "condition_set",
      status: "accepted",
      result: { tick: 0, worldVersion: 2, worldTimeMinutes: 0, mutationApplied: true },
      publicResult: {
        condition: { resultKind: "replaced", conditionKey: "crouched" },
      },
      privateResult: {
        previousConditionKeys: ["kneeling"],
        nextConditionKeys: ["crouched"],
      },
    });

    const clearFrame = conditionFrame(2, ["crouched"], "clean-turn-stage4-condition-clear");
    const cleared = await runCleanStage4Execution({
      frame: clearFrame,
      checklist: conditionChecklist({
        frame: clearFrame,
        operation: "clear",
        conditionKey: "crouched",
        replacementPolicy: "no_replacement",
      }),
    });
    expect(cleared.execution?.receipts[0]).toMatchObject({
      capabilityId: "condition_set",
      status: "accepted",
      result: { tick: 0, worldVersion: 3, worldTimeMinutes: 0, mutationApplied: true },
      publicResult: {
        condition: { resultKind: "cleared", conditionKey: "crouched" },
      },
      privateResult: {
        previousConditionKeys: ["crouched"],
        nextConditionKeys: [],
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM clean_gameplay_actor_conditions WHERE campaign_id = ?) AS conditionRows,
          (SELECT COUNT(*) FROM clean_gameplay_actor_conditions WHERE campaign_id = ? AND active = 1) AS activeRows,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ? AND operation = 'gameplay-cycle-runtime.player.condition_set.v1') AS traceCount,
          (SELECT COUNT(*) FROM turn_clock_ledger WHERE campaign_id = ?) AS ledgerCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion,
          (SELECT world_time_minutes FROM world_clocks WHERE campaign_id = ?) AS worldTimeMinutes,
          (SELECT current_tick FROM world_clocks WHERE campaign_id = ?) AS currentTick
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as {
        conditionRows: number;
        activeRows: number;
        traceCount: number;
        ledgerCount: number;
        worldVersion: number;
        worldTimeMinutes: number;
        currentTick: number;
      };
    expect(counts).toEqual({
      conditionRows: 2,
      activeRows: 0,
      traceCount: 3,
      ledgerCount: 0,
      worldVersion: 3,
      worldTimeMinutes: 0,
      currentTick: 0,
    });
  });

  it("preserves concrete item-readiness posture text in condition receipts and refreshed frames", async () => {
    insertItem({
      id: "item-courier-satchel-condition",
      name: "Courier satchel",
      ownerId: "player-1",
      equipState: "carried",
    });
    const postureText = "hold Courier satchel high against chest above water";
    const inputFrame: AuthoritativeSceneFrame = {
      ...frame(),
      turnId: "clean-turn-stage4-condition-item-readiness",
      playerAction: "I hold the Courier satchel high against my chest above the water.",
      inventory: [{ ref: "Courier satchel", label: "Courier satchel", equipState: "carried", tags: [] }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "condition_set" as const, evidenceAuthority: "receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Courier satchel"],
    };

    const applied = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: conditionChecklist({
        frame: inputFrame,
        conditionKey: "gripping_held_item",
        targetKind: "inventory_item_readiness",
        targetRef: "Courier satchel",
        requestedPostureText: postureText,
      }),
    });

    expect(applied.execution?.receipts[0]).toMatchObject({
      capabilityId: "condition_set",
      status: "accepted",
      publicResult: {
        condition: {
          resultKind: "applied",
          conditionKey: "gripping_held_item",
          conditionLabel: "gripping held item",
          requestedPostureText: postureText,
          targetKind: "inventory_item_readiness",
          targetLabel: "Courier satchel",
        },
      },
    });
    expect(applied.publicEvents[0]).toMatchObject({
      type: "state_update",
      data: {
        conditionKey: "gripping_held_item",
        requestedPostureText: postureText,
        targetLabel: "Courier satchel",
      },
    });

    const refreshed = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-stage4-condition-item-readiness-next",
      idempotencyKey: "next-frame-condition-item-readiness-proof",
      playerAction: {
        submitted: "I keep the satchel high.",
        normalized: "I keep the satchel high.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-condition-item-readiness-next"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });
    expect(refreshed.player.visibleStatus.conditions).toContain(postureText);
  });

  it("accepts observation and route-options receipts without mutating world clock", async () => {
    const inputFrame = {
      ...frame(),
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      scene: {
        ...frame().scene,
        visibleFacts: [{
          factId: "fact-market",
          summary: "Lanterns burn along the market stalls.",
          source: "Market",
          tick: 0,
        }],
      },
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "observe_visible" as const, evidenceAuthority: "observation_only" as const, allowed: true },
        { capabilityId: "route_options" as const, evidenceAuthority: "observation_only" as const, allowed: true },
      ],
    };

    const observation = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("observe_visible", inputFrame),
    });
    expect(observation.execution?.receipts[0]).toMatchObject({
      capabilityId: "observe_visible",
      status: "accepted",
      authority: {
        evidenceAuthority: "scene_observation_receipt",
        mutationAuthority: "none",
      },
    });
    expect(observation.execution?.receipts[0]?.publicResult.visibleObservation).toMatchObject({
      currentScene: "Market",
      visibleActors: ["Guide"],
      visibleFacts: ["Lanterns burn along the market stalls."],
    });

    const routeFrame = {
      ...inputFrame,
      frameId: "frame-stage4-routes",
      turnId: "clean-turn-stage4-routes",
    };
    const routes = await runCleanStage4Execution({
      frame: routeFrame,
      checklist: checklistForKind("route_options", routeFrame),
    });
    expect(routes.execution?.receipts[0]).toMatchObject({
      capabilityId: "route_options",
      status: "accepted",
      authority: {
        evidenceAuthority: "route_options_receipt",
        mutationAuthority: "none",
      },
    });
    expect(routes.execution?.receipts[0]?.publicResult.routeOptions?.options).toEqual([{
      label: "North Hall",
      connected: true,
      travelCost: 3,
    }]);

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });

  it("bounds observe_visible receipt summary before typed receipt validation", async () => {
    const longInventory = Array.from({ length: 12 }, (_, index) => ({
      ref: `long-item-${index}`,
      label: `Municipal Stores assignment chit ${index} with an unusually long public-facing label`,
      owner: "player" as const,
      equipState: "carried" as const,
      tags: [],
    }));
    const inputFrame = {
      ...frame(),
      inventory: longInventory,
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "observe_visible" as const, evidenceAuthority: "observation_only" as const, allowed: true },
      ],
    };

    const observation = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("observe_visible", inputFrame),
    });

    const summary = observation.execution?.receipts[0]?.publicResult.summary ?? "";
    expect(observation.execution?.receipts[0]?.capabilityId).toBe("observe_visible");
    expect(summary.length).toBeLessThanOrEqual(500);
    expect(summary).toContain("Inventory includes");
  });

  it("produces local_observation positive and bounded-no-match receipts without mutating world state", async () => {
    const inputFrame: AuthoritativeSceneFrame = {
      ...frame(),
      playerAction: "Do I see Guide here?",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "local_observation", evidenceAuthority: "receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };

    const positive = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("local_observation", inputFrame),
    });

    expect(positive.execution?.mutationApplied).toBe(false);
    expect(positive.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        evidenceAuthority: "local_observation_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_claim_local_observation",
        mayAuthorizeMutation: false,
      },
      publicResult: {
        localObservation: {
          type: "local_observation",
          resultKind: "positive_match",
          queryText: "Guide",
          targetLabel: "Guide",
          matchedEntries: [expect.objectContaining({ surfaceKind: "visible_actor", label: "Guide" })],
          boundedNegative: false,
          claimStatus: "bounded_current_scene_observation_only",
        },
      },
    });
    expect(positive.execution?.visibleResults[0]?.localObservation?.resultKind).toBe("positive_match");
    expect(positive.execution?.receipts[0]?.publicResult.summary).toBe(
      "Current visible match: visible actor Guide.",
    );

    const actorPropertyFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-actor-property",
      turnId: "clean-turn-stage4-local-observation-actor-property",
      playerAction: "I watch Guide for any obvious visible reaction to my open hands.",
    };
    const actorPropertyChecklist = checklistForKind("local_observation", actorPropertyFrame);
    actorPropertyChecklist.steps[0] = {
      ...actorPropertyChecklist.steps[0]!,
      targetRefs: ["Guide", "Market"],
      evidenceRefs: ["Player", "Market", "Guide"],
      intended: {
        ...actorPropertyChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "obvious visible reaction from Guide to Player's open hands",
          targetRef: "Guide",
          surfaceKinds: ["visible_actor"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const actorProperty = await runCleanStage4Execution({
      frame: actorPropertyFrame,
      checklist: actorPropertyChecklist,
    });
    expect(actorProperty.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No match for \"obvious visible reaction from Guide to Mira Voss's open hands\" stands out on Guide.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "obvious visible reaction from Guide to Mira Voss's open hands",
          targetLabel: "Guide",
          matchedEntries: [],
          searchedSurfaceKinds: ["visible_actor"],
          boundedNegative: true,
        },
      },
    });

    const actorAwarenessFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-actor-awareness",
      turnId: "clean-turn-stage4-local-observation-actor-awareness",
      playerAction: "I watch Guide for any sign he noticed me.",
    };
    const actorAwarenessChecklist = checklistForKind("local_observation", actorAwarenessFrame);
    actorAwarenessChecklist.steps[0] = {
      ...actorAwarenessChecklist.steps[0]!,
      targetRefs: ["Guide", "Market"],
      evidenceRefs: ["Player", "Market", "Guide"],
      intended: {
        ...actorAwarenessChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "whether Guide shows any sign that he noticed the Player",
          targetRef: "Guide",
          surfaceKinds: ["visible_actor", "visible_target"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const actorAwareness = await runCleanStage4Execution({
      frame: actorAwarenessFrame,
      checklist: actorAwarenessChecklist,
    });
    expect(actorAwareness.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No visible sign gives a clear answer about \"whether Guide shows any sign that he noticed Mira Voss\" on Guide.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "whether Guide shows any sign that he noticed Mira Voss",
          targetLabel: "Guide",
          matchedEntries: [],
          searchedSurfaceKinds: ["visible_actor", "visible_target"],
          boundedNegative: true,
        },
      },
    });

    const inventoryFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-inventory-target",
      turnId: "clean-turn-stage4-local-observation-inventory-target",
      playerAction: "I look at the Brass Tube.",
      actors: [],
      targets: [],
      inventory: [{ ref: "Brass Tube", label: "Brass Tube", equipState: "carried", tags: [] }],
      citableRefs: ["Player", "Market", "Brass Tube"],
    };
    const inventoryChecklist = checklistForKind("local_observation", inventoryFrame);
    inventoryChecklist.steps[0] = {
      ...inventoryChecklist.steps[0]!,
      targetRefs: ["Brass Tube", "Market"],
      evidenceRefs: ["Player", "Market", "Brass Tube"],
      intended: {
        ...inventoryChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "Brass Tube",
          targetRef: "Brass Tube",
          surfaceKinds: ["inventory_item"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const inventoryTarget = await runCleanStage4Execution({
      frame: inventoryFrame,
      checklist: inventoryChecklist,
    });
    expect(inventoryTarget.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "Brass Tube is with you.",
        localObservation: {
          resultKind: "positive_match",
          queryText: "Brass Tube",
          targetLabel: "Brass Tube",
          matchedEntries: [expect.objectContaining({ surfaceKind: "inventory_item", label: "Brass Tube" })],
          searchedSurfaceKinds: ["inventory_item"],
        },
      },
    });

    const inventoryPropertyFrame: AuthoritativeSceneFrame = {
      ...inventoryFrame,
      frameId: "frame-stage4-local-observation-inventory-property",
      turnId: "clean-turn-stage4-local-observation-inventory-property",
      playerAction: "I inspect the Brass Tube for visible labels, damage, or authorization marks.",
    };
    const inventoryPropertyChecklist = checklistForKind("local_observation", inventoryPropertyFrame);
    inventoryPropertyChecklist.steps[0] = {
      ...inventoryPropertyChecklist.steps[0]!,
      targetRefs: ["Brass Tube", "Market"],
      evidenceRefs: ["Player", "Market", "Brass Tube"],
      intended: {
        ...inventoryPropertyChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "visible labels, damage, or authorization marks on Brass Tube",
          targetRef: "Brass Tube",
          surfaceKinds: ["inventory_item", "visible_fact"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const inventoryProperty = await runCleanStage4Execution({
      frame: inventoryPropertyFrame,
      checklist: inventoryPropertyChecklist,
    });
    expect(inventoryProperty.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No match for \"visible labels, damage, or authorization marks on Brass Tube\" stands out on Brass Tube.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "visible labels, damage, or authorization marks on Brass Tube",
          targetLabel: "Brass Tube",
          matchedEntries: [],
          searchedSurfaceKinds: ["inventory_item", "visible_fact"],
          boundedNegative: true,
        },
      },
    });

    const inventoryMechanicalPropertyFrame: AuthoritativeSceneFrame = {
      ...inventoryFrame,
      frameId: "frame-stage4-local-observation-inventory-mechanical-property",
      turnId: "clean-turn-stage4-local-observation-inventory-mechanical-property",
      playerAction: "I inspect the Brass Tube for visible threading, contact seating, or relay hardware marks.",
    };
    const inventoryMechanicalPropertyChecklist = checklistForKind("local_observation", inventoryMechanicalPropertyFrame);
    inventoryMechanicalPropertyChecklist.steps[0] = {
      ...inventoryMechanicalPropertyChecklist.steps[0]!,
      targetRefs: ["Brass Tube", "Market"],
      evidenceRefs: ["Player", "Market", "Brass Tube"],
      intended: {
        ...inventoryMechanicalPropertyChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "visible threading, contact seating, or relay hardware marks on Brass Tube",
          targetRef: "Brass Tube",
          surfaceKinds: ["inventory_item", "visible_fact"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const inventoryMechanicalProperty = await runCleanStage4Execution({
      frame: inventoryMechanicalPropertyFrame,
      checklist: inventoryMechanicalPropertyChecklist,
    });
    expect(inventoryMechanicalProperty.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No match for \"visible threading, contact seating, or relay hardware marks on Brass Tube\" stands out on Brass Tube.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "visible threading, contact seating, or relay hardware marks on Brass Tube",
          targetLabel: "Brass Tube",
          matchedEntries: [],
          searchedSurfaceKinds: ["inventory_item", "visible_fact"],
          boundedNegative: true,
        },
      },
    });

    const manifestSurfaceContentFrame: AuthoritativeSceneFrame = {
      ...inventoryFrame,
      frameId: "frame-stage4-local-observation-manifest-surface-content",
      turnId: "clean-turn-stage4-local-observation-manifest-surface-content",
      playerAction: "I check the Delivery manifest top page for a public destination name or visible instruction.",
      inventory: [{ ref: "Delivery manifest", label: "Delivery manifest", equipState: "carried", tags: [] }],
      citableRefs: ["Player", "Market", "Delivery manifest"],
    };
    const manifestSurfaceContentChecklist = checklistForKind("local_observation", manifestSurfaceContentFrame);
    manifestSurfaceContentChecklist.steps[0] = {
      ...manifestSurfaceContentChecklist.steps[0]!,
      targetRefs: ["Delivery manifest", "Market"],
      evidenceRefs: ["Player", "Market", "Delivery manifest"],
      intended: {
        ...manifestSurfaceContentChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "list_surface",
          queryText: "whether the Delivery manifest top page shows a public destination name or visible instruction",
          targetRef: null,
          surfaceKinds: ["inventory_item", "visible_fact"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const manifestSurfaceContent = await runCleanStage4Execution({
      frame: manifestSurfaceContentFrame,
      checklist: manifestSurfaceContentChecklist,
    });
    expect(manifestSurfaceContent.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No visible sign gives a clear answer about \"whether the Delivery manifest top page shows a public destination name or visible instruction\" among inventory items and visible facts.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "whether the Delivery manifest top page shows a public destination name or visible instruction",
          targetLabel: null,
          matchedEntries: [],
          searchedSurfaceKinds: ["inventory_item", "visible_fact"],
          boundedNegative: true,
        },
      },
    });

    const playerStatusFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-player-status",
      turnId: "clean-turn-stage4-local-observation-player-status",
      playerAction: "Check whether I have any obvious injury or strain.",
      actors: [],
      targets: [],
      inventory: [],
      player: {
        ...inputFrame.player,
        visibleStatus: { hp: 5, conditions: [] },
      },
      citableRefs: ["Player", "Market"],
    };
    const playerStatusChecklist = checklistForKind("local_observation", playerStatusFrame);
    playerStatusChecklist.steps[0] = {
      ...playerStatusChecklist.steps[0]!,
      targetRefs: ["Player", "Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        ...playerStatusChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "obvious injury or strain on Player",
          targetRef: "Player",
          surfaceKinds: ["player_status"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const playerStatus = await runCleanStage4Execution({
      frame: playerStatusFrame,
      checklist: playerStatusChecklist,
    });
    expect(playerStatus.execution?.mutationApplied).toBe(false);
    expect(playerStatus.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      publicResult: {
        summary: "No obvious injury or strain is visible on Mira Voss.",
        localObservation: {
          resultKind: "positive_match",
          queryText: "obvious injury or strain on Mira Voss",
          targetLabel: "Mira Voss",
          matchedEntries: [expect.objectContaining({
            surfaceKind: "player_status",
            label: "Mira Voss",
            detail: "no obvious injury or strain",
          })],
          searchedSurfaceKinds: ["player_status"],
          boundedNegative: false,
        },
      },
    });
    expect(playerStatus.execution?.receipts[0]?.publicResult.summary).not.toMatch(/condition labels|braced|clarify|SceneFrame|worldVersion/iu);

    const routeLabels = [
      "North Hall",
      "East Gate",
      "South Dock",
      "West Yard",
      "Bell Tower",
      "Lantern Row",
      "The Copper Tap",
      "Upper Dam Ruins",
    ];
    const listSurfaceFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-list-surface",
      turnId: "clean-turn-stage4-local-observation-list-surface",
      playerAction: "I look around for visible routes and current local targets.",
      actors: [],
      targets: [],
      movementOptions: routeLabels.map((label) => ({ ref: label, label, connected: true, travelCost: 3 })),
      citableRefs: ["Player", "Market", ...routeLabels],
    };
    const listSurfaceChecklist = checklistForKind("local_observation", listSurfaceFrame);
    listSurfaceChecklist.steps[0] = {
      ...listSurfaceChecklist.steps[0]!,
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market", ...routeLabels],
      intended: {
        ...listSurfaceChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "list_surface",
          queryText: "visible routes and current local targets",
          targetRef: null,
          surfaceKinds: ["movement_option"],
          allowBoundedNegative: false,
          anchorRef: "Market",
        },
      },
    };
    const listSurface = await runCleanStage4Execution({
      frame: listSurfaceFrame,
      checklist: listSurfaceChecklist,
    });
    expect(listSurface.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "Current route options include: North Hall, East Gate, South Dock, West Yard, Bell Tower, Lantern Row, The Copper Tap, Upper Dam Ruins.",
        localObservation: {
          resultKind: "positive_list",
          searchedSurfaceKinds: ["movement_option"],
        },
      },
    });
    expect(
      listSurface.execution?.receipts[0]?.publicResult.localObservation?.matchedEntries
        .map((entry) => `${entry.surfaceKind}:${entry.label}`),
    ).toEqual(routeLabels.map((label) => `movement_option:${label}`));

    const anchorOnlyFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-anchor-only-mixed",
      turnId: "clean-turn-stage4-local-observation-anchor-only-mixed",
      playerAction: "I look for who is openly present and what ordinary clutter or cover is close at hand.",
      actors: [],
      targets: [],
      scene: {
        currentLocation: { ref: "Market", label: "Market", description: "A public market." },
        currentScene: { ref: "Market", label: "Market", description: "A public market." },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      citableRefs: ["Player", "Market"],
    };
    const anchorOnlyChecklist = checklistForKind("local_observation", anchorOnlyFrame);
    anchorOnlyChecklist.steps[0] = {
      ...anchorOnlyChecklist.steps[0]!,
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        ...anchorOnlyChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "list_surface",
          queryText: "who is openly present and what ordinary clutter or cover is close at hand",
          targetRef: null,
          surfaceKinds: ["visible_actor", "current_scene"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const anchorOnly = await runCleanStage4Execution({
      frame: anchorOnlyFrame,
      checklist: anchorOnlyChecklist,
    });
    expect(anchorOnly.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "who is openly present and what ordinary clutter or cover is close at hand",
          matchedEntries: [],
          searchedSurfaceKinds: ["visible_actor", "current_scene"],
          boundedNegative: true,
        },
      },
    });
    expect(anchorOnly.execution?.receipts[0]?.publicResult.summary).toBe(
      "No match for \"who is openly present and what ordinary clutter or cover is close at hand\" stands out among visible actors and the current scene.",
    );

    const anchorOnlyWithoutNegativeFrame: AuthoritativeSceneFrame = {
      ...anchorOnlyFrame,
      frameId: "frame-stage4-local-observation-anchor-only-mixed-no-negative",
      turnId: "clean-turn-stage4-local-observation-anchor-only-mixed-no-negative",
    };
    const anchorOnlyWithoutNegativeChecklist = checklistForKind("local_observation", anchorOnlyWithoutNegativeFrame);
    anchorOnlyWithoutNegativeChecklist.steps[0] = {
      ...anchorOnlyChecklist.steps[0]!,
      intended: {
        ...anchorOnlyChecklist.steps[0]!.intended,
        localObservationPlan: {
          ...anchorOnlyChecklist.steps[0]!.intended.localObservationPlan!,
          allowBoundedNegative: false,
        },
      },
    };
    const anchorOnlyWithoutNegative = await runCleanStage4Execution({
      frame: anchorOnlyWithoutNegativeFrame,
      checklist: anchorOnlyWithoutNegativeChecklist,
    });
    expect(anchorOnlyWithoutNegative.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });

    const placeHandleFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-place-handle",
      turnId: "clean-turn-stage4-local-observation-place-handle",
      playerAction: "I examine the central telegraph desk for visible marks or moving parts.",
      targets: [
        ...inputFrame.targets,
        { ref: "central_telegraph_desk", label: "central telegraph desk", kind: "place_handle" },
      ],
      citableRefs: [...inputFrame.citableRefs, "central_telegraph_desk"],
    };
    const placeHandleChecklist = checklistForKind("local_observation", placeHandleFrame);
    placeHandleChecklist.steps[0] = {
      ...placeHandleChecklist.steps[0]!,
      targetRefs: ["central_telegraph_desk", "Market"],
      evidenceRefs: ["Player", "Market", "central_telegraph_desk"],
      intended: {
        ...placeHandleChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "visible marks or moving parts on the central telegraph desk",
          targetRef: "central_telegraph_desk",
          surfaceKinds: ["visible_target"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const placeHandle = await runCleanStage4Execution({
      frame: placeHandleFrame,
      checklist: placeHandleChecklist,
    });
    expect(placeHandle.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "central telegraph desk is visible.",
        localObservation: {
          resultKind: "positive_match",
          queryText: "visible marks or moving parts on the central telegraph desk",
          targetLabel: "central telegraph desk",
          matchedEntries: [expect.objectContaining({ surfaceKind: "visible_target", label: "central telegraph desk" })],
        },
      },
    });
    expect(placeHandle.execution?.receipts[0]?.publicResult.summary).not.toMatch(/visible marks|moving parts/iu);

    const noMatchFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-no-match",
      turnId: "clean-turn-stage4-local-observation-no-match",
      playerAction: "Do I see a Violet Astrolabe here?",
    };
    const noMatchChecklist = checklistForKind("local_observation", noMatchFrame);
    noMatchChecklist.steps[0] = {
      ...noMatchChecklist.steps[0]!,
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        ...noMatchChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "Violet Astrolabe",
          targetRef: null,
          surfaceKinds: ["visible_actor", "visible_target"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };

    const noMatch = await runCleanStage4Execution({
      frame: noMatchFrame,
      checklist: noMatchChecklist,
    });

    expect(noMatch.execution?.mutationApplied).toBe(false);
    expect(noMatch.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      authority: {
        evidenceAuthority: "local_observation_receipt",
        mutationAuthority: "none",
      },
      publicResult: {
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "Violet Astrolabe",
          matchedEntries: [],
          searchedSurfaceKinds: ["visible_actor", "visible_target"],
          boundedNegative: true,
        },
      },
    });
    expect(noMatch.execution?.receipts[0]?.publicResult.summary).toBe(
      "No match for \"Violet Astrolabe\" stands out among visible actors and visible targets.",
    );
    expect(noMatch.execution?.receipts[0]?.publicResult.summary).not.toMatch(/SceneFrame|worldVersion/u);

    const physicalProbeFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-physical-probe",
      turnId: "clean-turn-stage4-local-observation-physical-probe",
      playerAction: "I press my boot against a loose slab of rubble and check whether it shifts.",
    };
    const physicalProbeChecklist = checklistForKind("local_observation", physicalProbeFrame);
    physicalProbeChecklist.steps[0] = {
      ...physicalProbeChecklist.steps[0]!,
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        ...physicalProbeChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "whether loose rubble shifts under light pressure",
          targetRef: null,
          surfaceKinds: ["current_scene"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const physicalProbe = await runCleanStage4Execution({
      frame: physicalProbeFrame,
      checklist: physicalProbeChecklist,
    });
    expect(physicalProbe.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No visible sign gives a clear answer about \"whether loose rubble shifts under light pressure\" in the current scene.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "whether loose rubble shifts under light pressure",
          targetLabel: null,
          matchedEntries: [],
          searchedSurfaceKinds: ["current_scene"],
          boundedNegative: true,
        },
      },
    });

    const hiddenMeaningFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-hidden-meaning",
      turnId: "clean-turn-stage4-local-observation-hidden-meaning",
      playerAction: "I check whether visible wear on the Brass Tube reveals a hidden mechanism or useful clue.",
      inventory: [{ ref: "Brass Tube", label: "Brass Tube", equipState: "carried", tags: [] }],
      citableRefs: ["Player", "Market", "Brass Tube"],
    };
    const hiddenMeaningChecklist = checklistForKind("local_observation", hiddenMeaningFrame);
    hiddenMeaningChecklist.steps[0] = {
      ...hiddenMeaningChecklist.steps[0]!,
      targetRefs: ["Brass Tube", "Market"],
      evidenceRefs: ["Player", "Market", "Brass Tube"],
      intended: {
        ...hiddenMeaningChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "whether visible wear on Brass Tube reveals a hidden mechanism or useful clue",
          targetRef: "Brass Tube",
          surfaceKinds: ["inventory_item", "visible_fact"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const hiddenMeaning = await runCleanStage4Execution({
      frame: hiddenMeaningFrame,
      checklist: hiddenMeaningChecklist,
    });
    expect(hiddenMeaning.execution?.receipts[0]).toMatchObject({
      capabilityId: "local_observation",
      status: "accepted",
      publicResult: {
        summary: "No visible sign gives a clear answer about \"whether visible wear on Brass Tube reveals a hidden mechanism or useful clue\" on Brass Tube.",
        localObservation: {
          resultKind: "bounded_no_match",
          queryText: "whether visible wear on Brass Tube reveals a hidden mechanism or useful clue",
          targetLabel: "Brass Tube",
          matchedEntries: [],
          searchedSurfaceKinds: ["inventory_item", "visible_fact"],
          boundedNegative: true,
        },
      },
    });
    expect(hiddenMeaning.execution?.receipts[0]?.publicResult.summary).not.toContain("No visible wear");

    const emptyVisibleActorsFrame: AuthoritativeSceneFrame = {
      ...inputFrame,
      frameId: "frame-stage4-local-observation-empty-visible-actors",
      turnId: "clean-turn-stage4-local-observation-empty-visible-actors",
      playerAction: "I look to see whether anyone is visibly nearby.",
      actors: [],
      targets: [],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    const emptyVisibleActorsChecklist = checklistForKind("local_observation", emptyVisibleActorsFrame);
    emptyVisibleActorsChecklist.steps[0] = {
      ...emptyVisibleActorsChecklist.steps[0]!,
      targetRefs: ["Market"],
      evidenceRefs: ["Player", "Market"],
      intended: {
        ...emptyVisibleActorsChecklist.steps[0]!.intended,
        localObservationPlan: {
          actorRef: "Player",
          mode: "target_match",
          queryText: "anyone visibly nearby",
          targetRef: null,
          surfaceKinds: ["visible_actor"],
          allowBoundedNegative: true,
          anchorRef: "Market",
        },
      },
    };
    const emptyVisibleActors = await runCleanStage4Execution({
      frame: emptyVisibleActorsFrame,
      checklist: emptyVisibleActorsChecklist,
    });

    expect(emptyVisibleActors.execution?.receipts[0]?.publicResult.summary).toBe(
      "No visible non-player actors are present in the current scene.",
    );
    expect(emptyVisibleActors.execution?.receipts[0]?.publicResult.summary).not.toMatch(/SceneFrame|worldVersion|surface/u);

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });

  it("accepts existing-visible actor dialogue as terminal non-mutating evidence", async () => {
    const longQuote = `The north stairs flooded before dawn. ${Array.from({ length: 70 }, () => "water").join(" ")}`.slice(0, 480);
    const longSummary = `Guide gives a long visible answer about the north stairs. ${Array.from({ length: 70 }, () => "detail").join(" ")}`.slice(0, 480);
    const inputFrame = {
      ...frame(),
      playerAction: "I ask Guide what happened here.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" as const }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "dialogue_record" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("dialogue_record", inputFrame),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: longQuote,
          summary: longSummary,
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "dialogue_record",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        evidenceAuthority: "terminal_dialogue_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_quote_visible_dialogue_response",
      },
      publicResult: {
        dialogue: {
          type: "dialogue_response",
          speakerLabel: "Guide",
          quotedSpeech: longQuote,
          summary: longSummary,
          claimStatus: "visible_speaker_response_only",
        },
      },
    });
    expect(result.execution?.receipts[0]?.publicResult.summary).toBe("Guide dialogue response recorded (answer).");
    expect((result.execution?.receipts[0]?.publicResult.summary ?? "").length).toBeLessThanOrEqual(500);

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });

    const sideEffects = {
      traces: (getSqliteConnection().prepare("SELECT COUNT(*) AS count FROM authority_traces WHERE campaign_id = ?").get(CAMPAIGN_ID) as { count: number }).count,
      ledger: (getSqliteConnection().prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger WHERE campaign_id = ?").get(CAMPAIGN_ID) as { count: number }).count,
    };
    expect(sideEffects).toEqual({ traces: 0, ledger: 0 });
  });

  it("creates a temporary current-scene support actor with materialization receipt authority", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.status).toBe("executed");
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.mutationApplied).toBe(true);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      result: { tick: 0, worldVersion: 1, worldTimeMinutes: 0, mutationApplied: true },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "current_scene_support_actor",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        mayAuthorizeMutation: true,
      },
      publicResult: {
        supportActor: {
          type: "support_actor_materialization",
          resultKind: "created",
          actorRef: "Local Vendor",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
          roleLabel: "vendor",
          anchorSceneLabel: "Market",
          anchorLocationLabel: "Market",
          claimStatus: "visible_support_actor_materialization_only",
        },
      },
    });

    const npc = getSqliteConnection()
      .prepare("SELECT name, tier, current_location_id AS currentLocationId, current_scene_location_id AS currentSceneLocationId, tags FROM npcs WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { name: string; tier: string; currentLocationId: string; currentSceneLocationId: string; tags: string };
    expect(npc).toMatchObject({
      name: "Local Vendor",
      tier: "temporary",
      currentLocationId: "loc-market",
      currentSceneLocationId: "loc-market",
    });
    expect(JSON.parse(npc.tags)).toEqual(expect.arrayContaining([
      "temporary-support",
      "clean-runtime-support",
      "support-role:vendor",
      "current-scene",
      "minor-support",
      "reactive-only",
    ]));

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 1, worldTimeMinutes: 0, currentTick: 0 });

    const authority = getSqliteConnection()
      .prepare(`
        SELECT
          operation,
          source_entity_type AS sourceEntityType,
          source_entity_id AS sourceEntityId,
          result_world_version AS resultWorldVersion,
          elapsed_world_time_minutes AS elapsedMinutes,
          state_delta_refs AS stateDeltaRefs,
          witnesses,
          metadata
        FROM authority_traces
        WHERE campaign_id = ?
      `)
      .get(CAMPAIGN_ID) as {
        operation: string;
        sourceEntityType: string;
        sourceEntityId: string;
        resultWorldVersion: number;
        elapsedMinutes: number;
        stateDeltaRefs: string;
        witnesses: string;
        metadata: string;
      };
    expect(authority).toMatchObject({
      operation: "gameplay-cycle-runtime.support_actor.materialize.v1",
      sourceEntityType: "npc",
      resultWorldVersion: 1,
      elapsedMinutes: 0,
    });
    expect(authority.sourceEntityId).toMatch(/^stage4-support-actor-/u);
    expect(JSON.parse(authority.stateDeltaRefs)).toEqual([
      `npc:${authority.sourceEntityId}:created`,
      "scene:loc-market:support_actors",
    ]);
    expect(JSON.parse(authority.witnesses)).toEqual(["Player", "Market"]);
    expect(JSON.parse(authority.metadata)).toMatchObject({
      checklistId: "gm-action-checklist-stage4-1",
      stepId: "step-1",
      capabilityId: "support_actor_create",
      roleKind: "vendor",
      roleLabel: "vendor",
      anchorScope: "current_scene",
      resultKind: "created",
    });
    const ledgerCount = getSqliteConnection()
      .prepare("SELECT COUNT(*) AS count FROM turn_clock_ledger WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { count: number };
    expect(ledgerCount.count).toBe(0);

    const refreshed = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-stage4-next",
      idempotencyKey: "next-frame-proof",
      playerAction: {
        submitted: "I look at the vendor.",
        normalized: "I look at the vendor.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-next"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });
    expect(refreshed.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Local Vendor" }),
    ]));
    expect(refreshed.citableRefs).toContain("Local Vendor");
  });

  it("renders support actor visible cue slots as natural player-facing prose", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I look for someone working nearby.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    const baseChecklist = checklistForKind("support_actor_create", inputFrame);
    const baseStep = baseChecklist.steps[0]!;

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: {
        ...baseChecklist,
        steps: [{
          ...baseStep,
          intended: {
            ...baseStep.intended,
            summary: "Stage 4 may materialize one ordinary temporary current-scene support actor with roleKind=laborer; requested role text: local laborer.",
            supportActorPlan: {
              actorRef: "Player",
              roleKind: "laborer",
              requestedRoleText: "local laborer",
              anchorRef: "Market",
              intendedUse: "presence_only",
              reusePolicy: "reuse_matching_temporary_current_scene_or_create",
            },
          },
        }],
      },
      generateSupportActorRequest: async () => ({
        ...supportActorEffect("vendor"),
        roleKind: "laborer",
        roleLabel: "laborer",
        publicPresentation: {
          presentationMode: "visible_presence_only",
          visibleCueProfile: {
            placement: "near_public_fixture",
            bearing: "standing_in_view",
            detail: "plain_work_clothes",
          },
          voiceHint: null,
        },
        reason: "The player requested an ordinary local laborer.",
        evidenceRefs: ["Player", "Market"],
      }),
    });

    expect(result.status).toBe("executed");
    const receipt = result.execution?.receipts[0];
    const supportActor = receipt?.publicResult.supportActor;
    expect(supportActor).toMatchObject({
      actorLabel: "Local Laborer",
      roleKind: "laborer",
      publicSummary: "An ordinary local laborer stands nearby in public view at Market, wearing plain local work clothes.",
      visibleCue: "A local laborer stands nearby in public view, wearing plain local work clothes.",
    });
    const publicPayload = JSON.stringify(receipt?.publicResult);
    expect(publicPayload).not.toContain("public fixture");
    expect(publicPayload).not.toContain("plain local clothes");
  });

  it("builds support actor request prompts from typed plan without raw player action", async () => {
    const rawMarker = "RAW_STAGE4_SUPPORT_MARKER_NEVER_PROMPT";
    const inputFrame = {
      ...frame(),
      playerAction: `I ask for a local vendor while saying ${rawMarker}.`,
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    const prompts: string[] = [];

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async (request) => {
        prompts.push(request.prompt);
        return supportActorEffect("vendor");
      },
    });

    expect(result.status).toBe("executed");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Support actor task card");
    expect(prompts[0]).toContain('"supportActorPlan"');
    expect(prompts[0]).toContain('"roleKind": "vendor"');
    expect(prompts[0]).not.toContain(rawMarker);
    expect(prompts[0]).not.toContain('"playerAction"');
  });

  it("rejects invalid support actor requests in one pass on the typed plan contract", async () => {
    const rawMarker = "RAW_STAGE4_SUPPORT_MARKER_NEVER_PROMPT";
    const inputFrame = {
      ...frame(),
      playerAction: `I ask for a local vendor while saying ${rawMarker}.`,
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    const prompts: string[] = [];

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async (request) => {
        prompts.push(request.prompt);
        if ("repairOf" in request) {
          throw new Error("repair request must not be issued");
        }
        return supportActorEffect("guide");
      },
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.failedStepIds).toEqual(["step-1"]);
    expect(result.execution?.receipts[0]?.status).toBe("failed");
    expect(JSON.stringify(result.execution?.receipts[0]?.failure)).toContain("roleKind");
    expect(prompts).toHaveLength(1);
    expect(prompts[0]).toContain("Support actor task card");
    expect(prompts[0]).toContain('"supportActorPlan"');
    expect(prompts[0]).toContain('"roleKind": "vendor"');
    for (const prompt of prompts) {
      expect(prompt).not.toContain(rawMarker);
      expect(prompt).not.toContain('"playerAction"');
    }
  });

  it("stores support actors under the scene parent broad location so refreshed SceneFrame exposes them", async () => {
    const now = Date.now();
    exec(
      "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, parent_location_id, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "loc-lowwater",
      CAMPAIGN_ID,
      "Lowwater",
      "A broad river district.",
      "macro",
      "persistent",
      null,
      "[]",
      0,
      "[]",
    );
    exec(
      "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, parent_location_id, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "loc-copper-tap",
      CAMPAIGN_ID,
      "The Copper Tap",
      "A tavern scene inside Lowwater.",
      "micro",
      "persistent",
      "loc-lowwater",
      "[]",
      0,
      "[]",
    );
    exec(
      "UPDATE players SET current_location_id = ?, current_scene_location_id = ? WHERE id = ?",
      "loc-copper-tap",
      "loc-copper-tap",
      "player-1",
    );
    exec(
      "UPDATE world_clocks SET updated_at = ? WHERE campaign_id = ?",
      now,
      CAMPAIGN_ID,
    );
    const inputFrame: AuthoritativeSceneFrame = {
      ...frame(),
      frameId: "frame-stage4-copper",
      turnId: "clean-turn-stage4-copper",
      playerAction: "I wave over a nearby server in The Copper Tap.",
      scene: {
        currentLocation: { ref: "The Copper Tap", label: "The Copper Tap", description: null },
        currentScene: { ref: "The Copper Tap", label: "The Copper Tap", description: null },
        visibleFacts: [],
        recentLocalFacts: [],
      },
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "The Copper Tap"],
    };
    const guideChecklist = checklistForKind("support_actor_create", inputFrame);
    const guideStep = guideChecklist.steps[0]!;

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: {
        ...guideChecklist,
        steps: [{
          ...guideStep,
          targetRefs: ["The Copper Tap"],
          evidenceRefs: ["Player", "The Copper Tap"],
          intended: {
            ...guideStep.intended,
            summary: "Stage 4 may materialize one ordinary temporary current-scene support actor with roleKind=guide; requested role text: local guide.",
            supportActorPlan: {
              actorRef: "Player",
              roleKind: "guide",
              requestedRoleText: "local guide",
              anchorRef: "The Copper Tap",
              intendedUse: "presence_only",
              reusePolicy: "reuse_matching_temporary_current_scene_or_create",
            },
          },
          expectedVisibleEffect: {
            summary: "If accepted, one visible temporary guide may be materialized in the current scene only.",
            visibleRefs: ["Player", "The Copper Tap"],
          },
        }],
      },
      generateSupportActorRequest: async () => ({
        ...supportActorEffect("guide"),
        anchorRef: "The Copper Tap",
        publicPresentation: {
          presentationMode: "visible_presence_only",
          visibleCueProfile: {
            placement: "in_open_view",
            bearing: "standing_in_view",
            detail: null,
          },
          voiceHint: null,
        },
        reason: "The player requested an ordinary local guide in The Copper Tap.",
        evidenceRefs: ["Player", "The Copper Tap"],
      }),
    });

    expect(result.status).toBe("executed");
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      publicResult: {
        supportActor: {
          actorLabel: "Local Guide",
          roleKind: "guide",
          anchorSceneLabel: "The Copper Tap",
        },
      },
    });

    const npc = getSqliteConnection()
      .prepare("SELECT name, current_location_id AS currentLocationId, current_scene_location_id AS currentSceneLocationId FROM npcs WHERE campaign_id = ? AND name = ?")
      .get(CAMPAIGN_ID, "Local Guide") as { name: string; currentLocationId: string; currentSceneLocationId: string };
    expect(npc).toEqual({
      name: "Local Guide",
      currentLocationId: "loc-lowwater",
      currentSceneLocationId: "loc-copper-tap",
    });

    const refreshed = await buildAuthoritativeSceneFrame({
      version: "gameplay-runtime.turn-input.v1",
      route: "/api/chat/action",
      campaignId: CAMPAIGN_ID,
      turnId: "clean-turn-stage4-copper-next",
      idempotencyKey: "next-frame-copper-proof",
      playerAction: {
        submitted: "I look at the local attendant.",
        normalized: "I look at the local attendant.",
        source: "typed",
      },
      base: {
        tick: 0,
        worldVersion: 1,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
        preTurnSnapshot: {
          bundleDir: path.join(tempRoot, "snapshot-copper-next"),
          capturedAt: Date.now(),
        },
      },
      providers: {
        judge: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
        storyteller: { id: "test", model: "test-model", baseUrl: "https://example.invalid/v1" },
      },
    });
    expect(refreshed.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Local Guide" }),
    ]));
    expect(refreshed.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Local Guide", kind: "actor" }),
    ]));
    expect(refreshed.citableRefs).toContain("Local Guide");
  });

  it("reuses the exact matching temporary current-scene support actor without mutation", async () => {
    insertNpc({
      id: "npc-existing-vendor",
      name: "Local Vendor",
      tags: CLEAN_SUPPORT_TAGS,
      persona: "An ordinary local vendor is already visible.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      result: { tick: 0, worldVersion: 0, worldTimeMinutes: 0, mutationApplied: false },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        mayAuthorizeMutation: false,
      },
      publicResult: {
        supportActor: {
          resultKind: "reused",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
        },
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("reuses the sole same-scene temporary support actor for the role even when its label differs", async () => {
    insertNpc({
      id: "npc-existing-bazaar-vendor",
      name: "Bazaar Vendor",
      tags: CLEAN_SUPPORT_TAGS,
      persona: "A clean temporary vendor is already available in the scene.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "accepted",
      publicResult: {
        supportActor: {
          resultKind: "reused",
          actorRef: "Bazaar Vendor",
          actorLabel: "Bazaar Vendor",
          roleKind: "vendor",
        },
      },
      privateResult: {
        supportActorId: "npc-existing-bazaar-vendor",
        supportActorOperation: "reused",
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("fails support actor materialization when same-role same-scene temporary support actors are ambiguous", async () => {
    insertNpc({ id: "npc-vendor-a", name: "Bazaar Vendor", tags: CLEAN_SUPPORT_TAGS });
    insertNpc({ id: "npc-vendor-b", name: "Market Vendor", tags: CLEAN_SUPPORT_TAGS });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 2, traceCount: 0, worldVersion: 0 });
  });

  it("fails support actor materialization on non-reusable same-label collision without hidden mutation", async () => {
    insertNpc({
      id: "npc-persistent-vendor",
      name: "Local Vendor",
      tier: "persistent",
      tags: [],
      persona: "A persistent vendor with the same label already exists.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I look for a local vendor in the market.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
    });

    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      authority: {
        evidenceAuthority: "failure_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "failure_only",
      },
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });
    expect(result.execution?.receipts[0]?.failure?.message).not.toContain("persistent");

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("fails hidden sibling-scene support actor collision without exposing the hidden row", async () => {
    exec(
      "INSERT INTO locations (id, campaign_id, name, description, kind, persistence, tags, is_starting, connected_to) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      "loc-side-stall",
      CAMPAIGN_ID,
      "Side Stall",
      "A sibling scene.",
      "micro",
      "temporary",
      "[]",
      0,
      "[]",
    );
    insertNpc({
      id: "npc-hidden-sibling-vendor",
      name: "Local Vendor",
      tags: [...CLEAN_SUPPORT_TAGS, "hidden"],
      sceneLocationId: "loc-side-stall",
      persona: "Hidden sibling vendor private payload.",
    });

    const result = await runVendorSupportActorCreate();

    expect(result.execution?.mutationApplied).toBe(false);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });
    expect(JSON.stringify(receipt)).not.toContain("npc-hidden-sibling-vendor");
    expect(JSON.stringify(receipt)).not.toContain("Hidden sibling vendor");

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("keeps overlong support actor generation diagnostics inside failed receipt limits", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I ask a local vendor what changed today.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("support_actor_create", inputFrame),
      generateSupportActorRequest: async () => {
        throw new Error(`provider schema diagnostic ${"x".repeat(1200)}`);
      },
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(false);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      authority: {
        evidenceAuthority: "failure_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "failure_only",
      },
      failure: {
        kind: "invalid_backend_request",
        hiddenMutationApplied: false,
      },
    });
    expect(receipt?.publicResult.summary.length).toBeLessThanOrEqual(500);
    expect(receipt?.failure?.message.length).toBeLessThanOrEqual(500);
  });

  it("fails broad-location hidden support actor collision without exposing the hidden row", async () => {
    insertNpc({
      id: "npc-hidden-broad-vendor",
      name: "Local Vendor",
      tags: [...CLEAN_SUPPORT_TAGS, "secret"],
      sceneLocationId: null,
      persona: "Hidden broad-location vendor private payload.",
    });

    const result = await runVendorSupportActorCreate();

    expect(result.execution?.mutationApplied).toBe(false);
    const receipt = result.execution?.receipts[0];
    expect(receipt).toMatchObject({
      capabilityId: "support_actor_create",
      status: "failed",
      failure: {
        kind: "insufficient_grounding",
        hiddenMutationApplied: false,
      },
    });
    expect(JSON.stringify(receipt)).not.toContain("npc-hidden-broad-vendor");
    expect(JSON.stringify(receipt)).not.toContain("Hidden broad-location vendor");

    const counts = getSqliteConnection()
      .prepare(`
        SELECT
          (SELECT COUNT(*) FROM npcs WHERE campaign_id = ?) AS npcCount,
          (SELECT COUNT(*) FROM authority_traces WHERE campaign_id = ?) AS traceCount,
          (SELECT world_version FROM world_clocks WHERE campaign_id = ?) AS worldVersion
      `)
      .get(CAMPAIGN_ID, CAMPAIGN_ID, CAMPAIGN_ID) as { npcCount: number; traceCount: number; worldVersion: number };
    expect(counts).toEqual({ npcCount: 1, traceCount: 0, worldVersion: 0 });
  });

  it("executes support_actor_create then dialogue_record only after an authoritative refreshed SceneFrame contains the actor", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I ask a local vendor what changed today.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
        { capabilityId: "dialogue_record" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: supportThenDialogueChecklist(inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
      refreshFrameAfterReceipt: async ({ receipt }) => buildAuthoritativeSceneFrame(refreshedTurnInput({ receipt })),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Local Vendor",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "The morning crowd is thinner than usual.",
          summary: "Local Vendor says the morning crowd is thinner than usual.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Market", "Local Vendor"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.status).toBe("executed");
    const receipts = result.execution?.receipts ?? [];
    expect(receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["support_actor_create", "accepted"],
      ["dialogue_record", "accepted"],
    ]);
    const supportReceipt = receipts[0]!;
    const dialogueReceipt = receipts[1]!;
    expect(result.execution?.frameChain).toHaveLength(2);
    expect(result.execution?.frameChain?.[1]).toMatchObject({
      source: "post_dependency_scene_frame",
      afterReceiptId: supportReceipt.receiptId,
      base: { tick: 0, worldVersion: 1, worldTimeMinutes: 0 },
    });
    expect(dialogueReceipt.frameId).toBe(result.execution?.frameChain?.[1]?.frameId);
    expect(dialogueReceipt.base.worldVersion).toBe(1);
    expect(dialogueReceipt.result).toMatchObject({ worldVersion: 1, mutationApplied: false });
    expect(dialogueReceipt.publicResult.dialogue).toMatchObject({
      speakerLabel: "Local Vendor",
      quotedSpeech: "The morning crowd is thinner than usual.",
      claimStatus: "visible_speaker_response_only",
    });
  });

  it("skips dependent support-actor dialogue instead of using the stale pre-mutation frame when no refresh is available", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I ask a local vendor what changed today.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
        { capabilityId: "dialogue_record" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    let dialogueGeneratorCalled = false;

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: supportThenDialogueChecklist(inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
      generateDialogueRequest: async () => {
        dialogueGeneratorCalled = true;
        return {};
      },
    });

    expect(dialogueGeneratorCalled).toBe(false);
    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["support_actor_create", "accepted"],
      ["dialogue_record", "skipped"],
    ]);
    expect(result.execution?.receipts[1]).toMatchObject({
      failure: {
        kind: "dependency_not_accepted",
        hiddenMutationApplied: false,
      },
    });
    expect(result.execution?.frameChain).toHaveLength(1);
  });

  it("skips dependent dialogue when support actor materialization fails", async () => {
    insertNpc({
      id: "npc-persistent-vendor-before-dialogue",
      name: "Local Vendor",
      tier: "persistent",
      tags: [],
      persona: "A persistent collision should not be exposed.",
    });
    const inputFrame = {
      ...frame(),
      playerAction: "I ask a local vendor what changed today.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
        { capabilityId: "dialogue_record" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };
    let refreshed = false;

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: supportThenDialogueChecklist(inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
      refreshFrameAfterReceipt: async ({ receipt }) => {
        refreshed = true;
        return buildAuthoritativeSceneFrame(refreshedTurnInput({ receipt }));
      },
    });

    expect(refreshed).toBe(false);
    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["support_actor_create", "failed"],
      ["dialogue_record", "skipped"],
    ]);
    expect(result.execution?.receipts[1]).toMatchObject({
      failure: {
        kind: "dependency_not_accepted",
        hiddenMutationApplied: false,
      },
    });
    expect(JSON.stringify(result.execution?.receipts[1])).not.toContain("persistent");
  });

  it("skips dependent dialogue when the refreshed SceneFrame does not expose the materialized actor as citable", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I ask a local vendor what changed today.",
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "support_actor_create" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
        { capabilityId: "dialogue_record" as const, evidenceAuthority: "terminal_receipt_required" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall"],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: supportThenDialogueChecklist(inputFrame),
      generateSupportActorRequest: async () => supportActorEffect("vendor"),
      refreshFrameAfterReceipt: async ({ receipt }) => ({
        ...inputFrame,
        frameId: "frame-refresh-without-support-actor",
        base: {
          tick: receipt.result.tick,
          worldVersion: receipt.result.worldVersion,
          worldTimeMinutes: receipt.result.worldTimeMinutes,
        },
      }),
    });

    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["support_actor_create", "accepted"],
      ["dialogue_record", "skipped"],
    ]);
    expect(result.execution?.receipts[1]).toMatchObject({
      frameId: "frame-refresh-without-support-actor",
      base: { worldVersion: 1 },
      failure: {
        kind: "dependency_not_accepted",
        hiddenMutationApplied: false,
      },
    });
  });

  it("executes condition_set then visible dialogue only after a refreshed SceneFrame reflects Player condition state", async () => {
    const inputFrame: AuthoritativeSceneFrame = {
      ...frame(),
      playerAction: "I kneel and ask Guide what they see.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "condition_set", evidenceAuthority: "receipt_required", allowed: true },
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };
    const first = conditionChecklist({ frame: inputFrame }).steps[0]!;
    const dependentChecklist: GmActionChecklist = {
      ...conditionChecklist({ frame: inputFrame }),
      steps: [
        first,
        {
          ...first,
          stepId: "step-2",
          purpose: "Record visible dialogue only after the accepted Player local condition is visible in a refreshed SceneFrame.",
          targetRefs: ["Guide"],
          evidenceRefs: ["Player", "Guide", "Market"],
          intended: {
            kind: "dialogue_record",
            stateOrEvidence: "terminal_player_visible",
            requiredCapabilityId: "dialogue_record",
            summary: "Stage 4 may record dialogue only after a post-condition authoritative SceneFrame reflects the Player local condition.",
            dialoguePlan: {
              actorRef: "Player",
              speakerSource: "existing_visible_actor",
              speakerRef: "Guide",
              materializedSpeakerBindingId: null,
              addresseeRef: "Player",
              playerIntent: "Ask Guide for visible guidance",
              responseScope: "visible_speaker_response_only",
            },
          },
          dependsOnStepIds: ["step-1"],
          dependencyBindings: [{
            bindingId: "player_local_condition",
            fromStepId: "step-1",
            requiredCapabilityId: "condition_set",
            requiredReceiptAuthority: "player_local_condition_receipt",
            sourcePath: "publicResult.condition.conditionKey",
            resolveIn: "post_dependency_scene_frame",
            requiredFramePresence: "player_visibleStatus.conditions",
          }],
          expectedVisibleEffect: {
            summary: "If the Player local condition is accepted and refreshed into SceneFrame player visibleStatus, one visible Guide response may be recorded.",
            visibleRefs: ["Player", "Guide"],
          },
        },
      ],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: dependentChecklist,
      refreshFrameAfterReceipt: async ({ receipt }) => ({
        ...inputFrame,
        frameId: "frame-post-condition",
        base: {
          tick: receipt.result.tick,
          worldVersion: receipt.result.worldVersion,
          worldTimeMinutes: receipt.result.worldTimeMinutes,
        },
        player: {
          ...inputFrame.player,
          visibleStatus: {
            ...inputFrame.player.visibleStatus,
            conditions: ["kneeling"],
          },
        },
      }),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Guide",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "From there, you can see under the stall curtain.",
          summary: "Guide answers from the visible scene.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Guide", "Market"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["condition_set", "accepted"],
      ["dialogue_record", "accepted"],
    ]);
    expect(result.execution?.frameChain).toHaveLength(2);
    expect(result.execution?.frameChain?.[1]).toMatchObject({
      source: "post_dependency_scene_frame",
      afterReceiptId: result.execution?.receipts[0]?.receiptId,
      base: { worldVersion: 1 },
    });
    expect(result.execution?.receipts[1]).toMatchObject({
      frameId: "frame-post-condition",
      base: { worldVersion: 1 },
      publicResult: {
        dialogue: {
          speakerLabel: "Guide",
          quotedSpeech: "From there, you can see under the stall curtain.",
        },
      },
    });
  });

  it("executes item-readiness condition then visible dialogue when the refreshed frame still exposes the held item", async () => {
    const inputFrame: AuthoritativeSceneFrame = {
      ...frame(),
      playerAction: "I keep the message tube high and ask Dorin what the key is doing.",
      actors: [{
        ref: "Dorin",
        label: "Relay-Tech Dorin",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      inventory: [{
        ref: "Message Tube",
        label: "Sealed lacquer message tube",
        equipState: "equipped",
        tags: [],
      }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "condition_set", evidenceAuthority: "receipt_required", allowed: true },
        { capabilityId: "dialogue_record", evidenceAuthority: "terminal_receipt_required", allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Dorin", "Message Tube"],
    };
    const first = conditionChecklist({
      frame: inputFrame,
      conditionKey: "gripping_held_item",
      targetKind: "inventory_item_readiness",
      targetRef: "Message Tube",
      requestedPostureText: "keep the message tube high",
    }).steps[0]!;
    const dependentChecklist: GmActionChecklist = {
      ...conditionChecklist({
        frame: inputFrame,
        conditionKey: "gripping_held_item",
        targetKind: "inventory_item_readiness",
        targetRef: "Message Tube",
        requestedPostureText: "keep the message tube high",
      }),
      steps: [
        first,
        {
          ...first,
          stepId: "step-2",
          purpose: "Record visible dialogue only after accepted Player item-readiness is still grounded in a refreshed SceneFrame.",
          targetRefs: ["Dorin"],
          evidenceRefs: ["Player", "Dorin", "Market", "Message Tube"],
          intended: {
            kind: "dialogue_record",
            stateOrEvidence: "terminal_player_visible",
            requiredCapabilityId: "dialogue_record",
            summary: "Stage 4 may record dialogue only after a post-condition authoritative SceneFrame keeps the readied item with the Player.",
            dialoguePlan: {
              actorRef: "Player",
              speakerSource: "existing_visible_actor",
              speakerRef: "Dorin",
              materializedSpeakerBindingId: null,
              addresseeRef: "Player",
              playerIntent: "Ask Relay-Tech Dorin what the telegraph key is doing",
              responseScope: "visible_speaker_response_only",
            },
          },
          dependsOnStepIds: ["step-1"],
          dependencyBindings: [{
            bindingId: "player_local_condition",
            fromStepId: "step-1",
            requiredCapabilityId: "condition_set",
            requiredReceiptAuthority: "player_local_condition_receipt",
            sourcePath: "publicResult.condition.conditionKey",
            resolveIn: "post_dependency_scene_frame",
            requiredFramePresence: "player_visibleStatus.conditions",
          }],
          expectedVisibleEffect: {
            summary: "If the Player item-readiness condition is accepted and refreshed into SceneFrame inventory grounding, one visible Dorin response may be recorded.",
            visibleRefs: ["Player", "Dorin", "Message Tube"],
          },
        },
      ],
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: dependentChecklist,
      refreshFrameAfterReceipt: async ({ receipt }) => ({
        ...inputFrame,
        frameId: "frame-post-item-readiness-condition",
        base: {
          tick: receipt.result.tick,
          worldVersion: receipt.result.worldVersion,
          worldTimeMinutes: receipt.result.worldTimeMinutes,
        },
        player: {
          ...inputFrame.player,
          visibleStatus: {
            ...inputFrame.player.visibleStatus,
            conditions: [],
          },
        },
      }),
      generateDialogueRequest: async () => ({
        kind: "dialogue_record",
        authorityKind: "existing_visible_actor",
        speakerRef: "Dorin",
        addresseeRefs: ["Player"],
        outcomeKind: "answer",
        response: {
          kind: "speech",
          quotedSpeech: "The key is tapping names in batches.",
          summary: "Dorin answers from the visible scene.",
        },
        languageBasis: {
          responseLanguage: "match_player_action",
          source: "turn_language_profile",
        },
        evidenceRefs: ["Player", "Dorin", "Market"],
        stateEffects: {
          appliesState: false,
        },
      }),
    });

    expect(result.execution?.receipts.map((receipt) => [receipt.capabilityId, receipt.status])).toEqual([
      ["condition_set", "accepted"],
      ["dialogue_record", "accepted"],
    ]);
    expect(result.execution?.receipts[1]).toMatchObject({
      frameId: "frame-post-item-readiness-condition",
      base: { worldVersion: 1 },
      publicResult: {
        dialogue: {
          speakerLabel: "Relay-Tech Dorin",
          quotedSpeech: "The key is tapping names in batches.",
        },
      },
    });
  });

  it("accepts ordinary improvised-shield scene beats as non-mutating visible acknowledgement", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "If there is an ordinary stool or chair within easy reach, I grab it and keep it ready as an improvised shield.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support" as const,
        visibleStatus: { hp: null, conditions: [] },
      }],
      capabilities: [
        ...frame().capabilities,
        { capabilityId: "scene_beat_record" as const, evidenceAuthority: "observation_only" as const, allowed: true },
      ],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    };
    const sceneBeatChecklist = checklistForKind("scene_beat_record", inputFrame);
    sceneBeatChecklist.steps[0]!.purpose = "Resolve immediate ordinary scene-prop beat.";
    sceneBeatChecklist.steps[0]!.intended.sceneBeatPlan = {
      actorRef: "Player",
      beatKind: "ordinary_prop_readiness",
      requestedBeatText: "Grab a nearby stool or chair and keep it ready as an improvised shield for this beat",
      anchorRef: "Market",
      persistenceScope: "turn_event_only",
    };

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: sceneBeatChecklist,
    });

    expect(result.status).toBe("executed");
    expect(result.execution?.mutationApplied).toBe(false);
    expect(result.publicEvents).toEqual([]);
    expect(result.execution?.receipts[0]).toMatchObject({
      capabilityId: "scene_beat_record",
      status: "accepted",
      authority: {
        evidenceAuthority: "scene_beat_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_acknowledge_scene_beat",
      },
      publicResult: {
        sceneBeat: {
          beatKind: "ordinary_prop_readiness",
          requestedBeatText: "Grab a nearby stool or chair and keep it ready as an improvised shield for this beat",
          summary: "Grab a nearby stool or chair and keep it ready as an improvised shield for this beat at Market.",
        },
      },
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });
});
