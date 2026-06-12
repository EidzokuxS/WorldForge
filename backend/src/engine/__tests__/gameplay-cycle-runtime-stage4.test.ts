import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { closeDb, connectDb, getSqliteConnection } from "../../db/index.js";
import { runMigrations } from "../../db/migrate.js";
import { buildAuthoritativeSceneFrame } from "../gameplay-cycle-runtime/frame.js";
import { runCleanStage4Execution } from "../gameplay-cycle-runtime/stage4-execution.js";
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
  conditionKey?: "kneeling" | "crouched" | "prone" | "braced";
  targetRef?: string | null;
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
          conditionScope: "current_scene",
          anchorRef: "Market",
          targetKind: "current_scene",
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
      publicSummary: `An ordinary local ${roleKind} is available in the market.`,
      visibleCue: `The local ${roleKind} is close enough to be visible.`,
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
    expect(summary).toContain("No modeled/exposed device surface facet");
    expect(summary).not.toMatch(/no messages|no calls|no signal|nothing changed|no change/iu);
    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
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
    expect(noMatch.execution?.receipts[0]?.publicResult.summary).toContain("No matching current SceneFrame observation surface entry is exposed");

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

  it("accepts scene-beat receipts as non-mutating visible acknowledgement", async () => {
    const inputFrame = {
      ...frame(),
      playerAction: "I nod to the market crowd without leaving.",
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

    const result = await runCleanStage4Execution({
      frame: inputFrame,
      checklist: checklistForKind("scene_beat_record", inputFrame),
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
          beatKind: "generic_scene_beat",
        },
      },
    });

    const clock = getSqliteConnection()
      .prepare("SELECT world_version AS worldVersion, world_time_minutes AS worldTimeMinutes, current_tick AS currentTick FROM world_clocks WHERE campaign_id = ?")
      .get(CAMPAIGN_ID) as { worldVersion: number; worldTimeMinutes: number; currentTick: number };
    expect(clock).toEqual({ worldVersion: 0, worldTimeMinutes: 0, currentTick: 0 });
  });
});
