import { describe, expect, it } from "vitest";

import {
  cleanNarratorViewSchema,
  cleanSettledTurnPacketSchema,
  cleanStage4ExecutionResultSchema,
  cleanStage4ReceiptSchema,
  type AuthoritativeSceneFrame,
  type CleanStage4ExecutionResult,
  type CleanStage4Receipt,
  type GameplayRuntimeTurnInput,
  type GmActionChecklist,
  type GmRead,
  type JudgeUncertainty,
} from "../gameplay-cycle-runtime/contracts.js";
import {
  buildCleanNarratorView,
  buildCleanSettledTurnPacket,
} from "../gameplay-cycle-runtime/settlement.js";
import { buildCleanPublicTurnIds } from "../gameplay-cycle-runtime/turn-persistence.js";

function turn(): GameplayRuntimeTurnInput {
  return {
    version: "gameplay-runtime.turn-input.v1",
    route: "/api/chat/action",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    playerAction: {
      submitted: "I walk to North Hall.",
      normalized: "I walk to North Hall.",
      source: "typed",
    },
    base: {
      tick: 0,
      worldVersion: 0,
      worldTimeMinutes: 0,
      chatHistoryLengthBeforeTurn: 0,
      preTurnSnapshot: {
        bundleDir: "snapshot-dir",
        capturedAt: 1,
      },
    },
    providers: {
      judge: { id: "test", model: "test-model", baseUrl: null },
      storyteller: { id: "test", model: "test-model", baseUrl: null },
    },
    idempotencyKey: "campaign-1:0:0:clean-turn-1",
  };
}

function frame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  return {
    version: "scene-frame.v1",
    frameId: "frame-1",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
    playerAction: "I walk to North Hall.",
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
      travelCost: 1,
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
    ...overrides,
  };
}

function postMovementFrame(overrides: Partial<AuthoritativeSceneFrame> = {}): AuthoritativeSceneFrame {
  return frame({
    frameId: "frame-post-movement-1",
    base: { tick: 1, worldVersion: 1, worldTimeMinutes: 1 },
    scene: {
      currentLocation: {
        ref: "North Hall",
        label: "North Hall",
        description: "Lantern chains tremble over the north landing.",
      },
      currentScene: {
        ref: "North Hall",
        label: "North Hall",
        description: "North Hall narrows beneath a row of iron lamps.",
      },
      visibleFacts: [],
      recentLocalFacts: [],
    },
    movementOptions: [],
    targets: [],
    citableRefs: ["Player", "North Hall"],
    ...overrides,
  });
}

function checklist(inputFrame = frame()): GmActionChecklist {
  return {
    version: "gm-action-checklist.v1",
    checklistId: "gm-action-checklist-1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      gmReadPath: "procedural",
      judgmentId: "judge-1",
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
      purpose: "Resolve movement.",
      actorRef: "Player",
      targetRefs: ["North Hall"],
      evidenceRefs: ["Player", "North Hall"],
      intended: {
        kind: "movement",
        stateOrEvidence: "state",
        requiredCapabilityId: "movement",
        summary: "Move the player to North Hall.",
      },
      disposition: {
        kind: "stage4_backend_resolution_required",
        reason: "Movement requires backend authority.",
      },
      dependsOnStepIds: [],
      expectedVisibleEffect: {
        summary: "The player may arrive after accepted receipt.",
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

function directGmRead(inputFrame = frame()): GmRead {
  return {
    version: "gm-read.v1",
    frameId: inputFrame.frameId,
    turnId: inputFrame.turnId,
    path: "direct",
    situationSummary: "The player is in the current visible scene.",
    liveSceneQuestion: "What does the player observe from here?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", inputFrame.scene.currentScene.ref],
    actionInterpretation: {
      summary: "The player observes the current scene without changing it.",
      playerIntent: "Observe the scene.",
      method: null,
      targetRefs: [inputFrame.scene.currentScene.ref],
      interactionKind: "current_scene_observation",
    },
    uncertainty: {
      present: false,
      question: null,
      basis: null,
    },
    interpretationRationale: "The action only asks for current visible context.",
  };
}

function clarificationGmRead(inputFrame = frame()): GmRead {
  return {
    ...directGmRead(inputFrame),
    path: "clarification",
    situationSummary: "The player action needs a concrete target before it can settle.",
    liveSceneQuestion: "Which visible person should receive the item?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", "Guide", "Courier"],
    actionInterpretation: {
      summary: "The player wants to hand an item to an underspecified visible person.",
      playerIntent: "Hand the item to someone.",
      method: "hand",
      targetRefs: ["Guide", "Courier"],
      interactionKind: "unsupported_or_unclear",
    },
    interpretationRationale: "The pronoun does not select one current visible target.",
  };
}

function clarificationJudgment(inputFrame = frame(), read = clarificationGmRead(inputFrame)): JudgeUncertainty {
  return {
    version: "judge-uncertainty.v1",
    judgmentId: "judge-1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      gmReadPath: read.path,
    },
    physicalPossibility: "underspecified",
    checkNeed: "clarification_needed",
    nextStep: "ask_clarification",
    actorRefs: ["Player"],
    targetRefs: ["Guide", "Courier"],
    evidenceRefs: ["Player", "Guide", "Courier"],
    possibilityRationale: "The action can be possible after target clarification.",
    checkRationale: "The current target is underspecified.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "insufficient_specificity",
      explanation: "Which visible person should receive the item?",
      evidenceRefs: ["Player", "Guide", "Courier"],
    },
  };
}

function movementReceipt(inputFrame = frame(), inputChecklist = checklist(inputFrame)): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    version: "gameplay-runtime.stage4-receipt.v1",
    receiptId: "stage4-receipt-movement-1",
    requestId: "stage4-request-movement-1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    checklistId: inputChecklist.checklistId,
    stepId: "step-1",
    capabilityId: "movement",
    status: "accepted",
    source: {
      sceneFrameVersion: "scene-frame.v1",
      gmReadVersion: "gm-read.v1",
      judgeVersion: "judge-uncertainty.v1",
      checklistVersion: "gm-action-checklist.v1",
      checklistId: inputChecklist.checklistId,
      checklistStepId: "step-1",
    },
    base: inputFrame.base,
    result: { tick: 1, worldVersion: 1, worldTimeMinutes: 1, mutationApplied: true },
    authority: {
      evidenceAuthority: "terminal_mutation_receipt",
      mutationAuthority: "player_location_and_world_clock",
      visibleResultAuthority: "may_claim_player_location_change",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: true,
    },
    publicResult: {
      summary: "You move to North Hall.",
      visibleRefs: ["Player", "North Hall"],
      routeStatus: null,
      locationChange: {
        type: "location_change",
        locationName: "North Hall",
        travelCost: 1,
        path: ["Market", "North Hall"],
      },
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
      dialogue: null,
    },
    privateResult: {
      playerId: "player-1",
      fromLocationId: "loc-market",
      destinationLocationId: "loc-north",
      edgeIds: ["edge-market-north"],
      authorityTraceId: "stage4-authority-1",
      clockReceiptId: "stage4-clock-1",
      stateDeltaRefs: ["player-location-stage4-receipt-movement-1"],
    },
    failure: null,
  });
}

function playerLocalConditionReceipt(inputFrame = frame(), inputChecklist = checklist(inputFrame)): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    ...movementReceipt(inputFrame, inputChecklist),
    receiptId: "stage4-receipt-condition-1",
    requestId: "stage4-request-condition-1",
    capabilityId: "condition_set",
    result: { ...inputFrame.base, worldVersion: inputFrame.base.worldVersion + 1, mutationApplied: true },
    authority: {
      evidenceAuthority: "player_local_condition_receipt",
      mutationAuthority: "player_local_condition_state",
      visibleResultAuthority: "may_claim_player_local_condition",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: true,
    },
    publicResult: {
      summary: "Player is kneeling in Market.",
      visibleRefs: ["Player", "Market"],
      routeStatus: null,
      locationChange: null,
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
      dialogue: null,
      supportActor: null,
      condition: {
        type: "player_local_condition",
        resultKind: "applied",
        actorLabel: "Player",
        operation: "apply",
        conditionKey: "kneeling",
        conditionLabel: "kneeling",
        conditionScope: "current_scene",
        anchorSceneLabel: "Market",
        anchorLocationLabel: "Market",
        targetKind: "current_scene",
        targetLabel: "Market",
        claimStatus: "visible_player_local_condition_only",
      },
    },
    privateResult: {
      playerId: "player-1",
      fromLocationId: null,
      destinationLocationId: null,
      supportActorId: null,
      supportActorOperation: null,
      conditionId: "condition-1",
      conditionOperation: "applied",
      previousConditionKeys: [],
      nextConditionKeys: ["kneeling"],
      anchorLocationId: "loc-market",
      anchorSceneLocationId: "loc-market",
      edgeIds: [],
      authorityTraceId: "stage4-authority-condition",
      clockReceiptId: null,
      stateDeltaRefs: ["player:player-1:condition:kneeling:applied"],
    },
    failure: null,
  });
}

function itemTransferReceipt(inputFrame = frame(), inputChecklist = checklist(inputFrame)): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    ...movementReceipt(inputFrame, inputChecklist),
    receiptId: "stage4-receipt-item-transfer-1",
    requestId: "stage4-request-item-transfer-1",
    capabilityId: "item_transfer",
    result: { ...inputFrame.base, worldVersion: inputFrame.base.worldVersion + 1, mutationApplied: true },
    authority: {
      evidenceAuthority: "item_transfer_receipt",
      mutationAuthority: "item_custody_location_equip_state",
      visibleResultAuthority: "may_claim_item_state_change",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: true,
    },
    publicResult: {
      summary: "Brass Tube item state is settled: transferred_to_actor.",
      visibleRefs: ["Player", "Brass Tube", "Guide", "Market"],
      routeStatus: null,
      locationChange: null,
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
      dialogue: null,
      supportActor: null,
      condition: null,
      itemTransfer: {
        type: "item_transfer",
        resultKind: "transferred_to_actor",
        itemLabel: "Brass Tube",
        actorLabel: "Player",
        operation: "give_to_visible_actor",
        sourceLabel: "Player",
        targetLabel: "Guide",
        anchorSceneLabel: "Market",
        anchorLocationLabel: "Market",
        finalOwnerKind: "visible_actor",
        finalLocationKind: "none",
        finalEquipState: "carried",
        finalEquippedSlot: null,
        claimStatus: "visible_item_state_change_only",
      },
    },
    privateResult: {
      playerId: "player-1",
      fromLocationId: null,
      destinationLocationId: null,
      supportActorId: null,
      supportActorOperation: null,
      conditionId: null,
      conditionOperation: null,
      itemId: "item-brass-tube",
      itemOperation: "give_to_visible_actor",
      previousOwnerId: "player-1",
      nextOwnerId: "npc-guide",
      previousLocationId: null,
      nextLocationId: null,
      previousEquipState: "carried",
      nextEquipState: "carried",
      previousEquippedSlot: null,
      nextEquippedSlot: null,
      edgeIds: [],
      authorityTraceId: "stage4-authority-item-transfer",
      clockReceiptId: null,
      stateDeltaRefs: ["item:item-brass-tube:owner:npc-guide"],
    },
    failure: null,
  });
}

function minorPoiReceipt(inputFrame = frame(), inputChecklist = checklist(inputFrame)): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    ...movementReceipt(inputFrame, inputChecklist),
    receiptId: "stage4-receipt-minor-poi-1",
    requestId: "stage4-request-minor-poi-1",
    capabilityId: "minor_poi_create",
    result: { ...inputFrame.base, worldVersion: inputFrame.base.worldVersion + 1, mutationApplied: true },
    authority: {
      evidenceAuthority: "minor_poi_handle_receipt",
      mutationAuthority: "current_scene_minor_poi_handle",
      visibleResultAuthority: "may_claim_visible_minor_poi_handle",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: true,
    },
    publicResult: {
      summary: "Visible local place handle available: Tea Stall.",
      visibleRefs: ["Player", "Market", "tea_stall"],
      routeStatus: null,
      locationChange: null,
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      sceneBeat: null,
      dialogue: null,
      supportActor: null,
      condition: null,
      minorPoi: {
        type: "minor_poi_handle",
        resultKind: "created",
        poiRef: "tea_stall",
        poiLabel: "Tea Stall",
        poiKind: "stall",
        actorLabel: "Player",
        anchorSceneLabel: "Market",
        anchorLocationLabel: "Market",
        visibility: "public_visible_current_scene",
        persistenceScope: "current_scene",
        targetOnly: true,
        claimStatus: "visible_current_scene_place_handle_only",
      },
    },
    privateResult: {
      playerId: "player-1",
      fromLocationId: null,
      destinationLocationId: null,
      supportActorId: null,
      supportActorOperation: null,
      conditionId: null,
      conditionOperation: null,
      minorPoiId: "stage4-minor-poi-secret",
      minorPoiOperation: "inserted",
      anchorLocationId: "loc-market",
      anchorSceneLocationId: "loc-market",
      edgeIds: [],
      authorityTraceId: "stage4-authority-minor-poi",
      clockReceiptId: null,
      stateDeltaRefs: ["minor_poi:stage4-minor-poi-secret:created"],
    },
    failure: null,
  });
}

function localObservationReceipt(inputFrame = frame(), inputChecklist = checklist(inputFrame)): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    ...movementReceipt(inputFrame, inputChecklist),
    receiptId: "stage4-receipt-local-observation-1",
    requestId: "stage4-request-local-observation-1",
    capabilityId: "local_observation",
    result: { ...inputFrame.base, mutationApplied: false },
    authority: {
      evidenceAuthority: "local_observation_receipt",
      mutationAuthority: "none",
      visibleResultAuthority: "may_claim_local_observation",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: false,
    },
    publicResult: {
      summary: "Current visible actors and visible targets show no match for \"Violet Astrolabe\".",
      visibleRefs: ["Player", "Market"],
      routeStatus: null,
      locationChange: null,
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      localObservation: {
        type: "local_observation",
        surfaceVersion: "scene_frame_current_observation_surface.v1",
        resultKind: "bounded_no_match",
        mode: "target_match",
        queryText: "Violet Astrolabe",
        targetLabel: null,
        matchedEntries: [],
        searchedSurfaceKinds: ["visible_actor", "visible_target"],
        anchorSceneLabel: "Market",
        anchorLocationLabel: "Market",
        boundedNegative: true,
        summary: "Current visible actors and visible targets show no match for \"Violet Astrolabe\".",
        claimStatus: "bounded_current_scene_observation_only",
      },
      sceneBeat: null,
      dialogue: null,
      supportActor: null,
      condition: null,
      itemTransfer: null,
    },
    privateResult: {
      playerId: "player-1",
      fromLocationId: null,
      destinationLocationId: null,
      supportActorId: null,
      supportActorOperation: null,
      conditionId: null,
      conditionOperation: null,
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
      edgeIds: [],
      authorityTraceId: null,
      clockReceiptId: null,
      stateDeltaRefs: [],
    },
    failure: null,
  });
}

function deviceSurfaceObservationReceipt(inputFrame = frame(), inputChecklist = checklist(inputFrame)): CleanStage4Receipt {
  return cleanStage4ReceiptSchema.parse({
    ...movementReceipt(inputFrame, inputChecklist),
    receiptId: "stage4-receipt-device-surface-1",
    requestId: "stage4-request-device-surface-1",
    capabilityId: "device_surface_observation",
    result: { ...inputFrame.base, mutationApplied: false },
    authority: {
      evidenceAuthority: "device_surface_observation_receipt",
      mutationAuthority: "none",
      visibleResultAuthority: "may_claim_device_surface_observation",
      maySupportNarrationClaim: true,
      mayAuthorizeMutation: false,
    },
    publicResult: {
      summary: "Current visible device surface for Burner phone exposes no requested message indicator.",
      visibleRefs: ["Player", "Burner phone", "Market"],
      routeStatus: null,
      locationChange: null,
      routeOptions: null,
      timeAdvance: null,
      visibleObservation: null,
      localObservation: null,
      deviceSurfaceObservation: {
        type: "device_surface_observation",
        surfaceVersion: "scene_frame_device_status_surface.v1",
        resultKind: "no_requested_surface",
        deviceLabel: "Burner phone",
        requestedFacetText: "message indicator",
        requestedFacetKinds: ["message_indicator"],
        observedFacets: [],
        unavailableFacetKinds: ["message_indicator"],
        anchorSceneLabel: "Market",
        anchorLocationLabel: "Market",
        boundedNoSurface: true,
        summary: "Current visible device surface for Burner phone exposes no requested message indicator.",
        claimStatus: "bounded_current_frame_device_surface_only",
      },
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
      edgeIds: [],
      authorityTraceId: null,
      clockReceiptId: null,
      stateDeltaRefs: [],
    },
    failure: null,
  });
}

function stage4(receipts: CleanStage4Receipt[], inputFrame = frame()): CleanStage4ExecutionResult {
  return cleanStage4ExecutionResultSchema.parse({
    version: "gameplay-runtime.stage4-execution-result.v1",
    campaignId: inputFrame.campaignId,
    turnId: inputFrame.turnId,
    frameId: inputFrame.frameId,
    checklistId: "gm-action-checklist-1",
    base: inputFrame.base,
    receipts,
    acceptedReceiptIds: receipts.filter((receipt) => receipt.status === "accepted").map((receipt) => receipt.receiptId),
    skippedStepIds: receipts.filter((receipt) => receipt.status === "skipped").map((receipt) => receipt.stepId),
    failedStepIds: receipts.filter((receipt) => receipt.status === "failed").map((receipt) => receipt.stepId),
    mutationApplied: receipts.some((receipt) => receipt.result.mutationApplied),
    resultWorldVersion: Math.max(...receipts.map((receipt) => receipt.result.worldVersion), inputFrame.base.worldVersion),
    visibleResults: receipts
      .filter((receipt) => receipt.status === "accepted" || receipt.status === "failed")
      .map((receipt) => ({
        receiptId: receipt.receiptId,
        authority: receipt.authority.evidenceAuthority,
        summary: receipt.publicResult.summary,
        visibleRefs: receipt.publicResult.visibleRefs,
        routeCheck: receipt.publicResult.routeCheck ?? null,
        locationChange: receipt.publicResult.locationChange,
        timeAdvance: receipt.publicResult.timeAdvance,
        dialogue: receipt.publicResult.dialogue,
        supportActor: receipt.publicResult.supportActor,
        condition: receipt.publicResult.condition,
        itemTransfer: receipt.publicResult.itemTransfer,
        minorPoi: receipt.publicResult.minorPoi,
        localObservation: receipt.publicResult.localObservation,
        deviceSurfaceObservation: receipt.publicResult.deviceSurfaceObservation,
      })),
  });
}

function buildPacket(input: {
  turn?: GameplayRuntimeTurnInput;
  frame?: AuthoritativeSceneFrame;
  postResolutionFrame?: AuthoritativeSceneFrame | null;
  gmRead?: GmRead | null;
  judgment?: JudgeUncertainty | null;
  checklist?: GmActionChecklist | null;
  execution?: CleanStage4ExecutionResult | null;
} = {}) {
  const inputTurn = input.turn ?? turn();
  const inputFrame = input.frame ?? frame();
  return buildCleanSettledTurnPacket({
    turn: inputTurn,
    publicPacketId: buildCleanPublicTurnIds(inputTurn).publicPacketId,
    frame: inputFrame,
    postResolutionFrame: input.postResolutionFrame ?? null,
    gmRead: input.gmRead ?? null,
    judgment: input.judgment ?? null,
    oracleSettlement: null,
    actionChecklist: input.checklist ?? null,
    stage4Execution: input.execution ?? null,
  });
}

describe("clean Stage 5 settlement contracts", () => {
  it("settles accepted movement with post-resolution scene texture evidence", () => {
    const inputFrame = frame();
    const inputChecklist = checklist(inputFrame);
    const packet = buildPacket({
      frame: inputFrame,
      postResolutionFrame: postMovementFrame(),
      checklist: inputChecklist,
      execution: stage4([movementReceipt(inputFrame, inputChecklist)], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    expect(cleanSettledTurnPacketSchema.safeParse(packet).success).toBe(true);
    expect(cleanNarratorViewSchema.safeParse(view).success).toBe(true);
    const scene = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("current_scene"));
    const texture = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("scene_texture"));
    const movement = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("player_location_change"));
    expect(scene?.backendFacts.map((entry) => entry.text)).toEqual([
      "Scene placement: You are at North Hall.",
      "Scene label: North Hall.",
      "Place label: North Hall.",
    ]);
    expect(texture?.backendFacts.map((entry) => entry.text)).toEqual([
      "Scene texture: North Hall narrows beneath a row of iron lamps.",
    ]);
    expect(movement).toMatchObject({
      authority: "terminal_mutation_receipt",
      claimKinds: ["player_location_change", "elapsed_time"],
      text: "After 1 minute, you reach North Hall.",
    });
    expect(movement?.backendFacts.map((entry) => entry.text)).toEqual([
      "Travel beat: After 1 minute, you reach North Hall.",
      "Destination label: North Hall.",
      "Elapsed travel time: 1 minute.",
      "Current place after movement: North Hall.",
    ]);
    expect(movement?.limits.proves).toContain("movement result phrasing for the player");
    expect(JSON.stringify(view)).not.toContain("player-1");
    expect(JSON.stringify(view)).not.toContain("edge-market-north");
    expect(JSON.stringify(view)).not.toContain("privateResult");
    expect(movement?.limits.doesNotProve).toContain("no-change");
  });

  it("builds narrator view with explicit language metadata instead of raw player action", () => {
    const rawActionMarker = "RAW_NARRATOR_VIEW_MARKER_NEVER_PROMPT";
    const baseTurn = turn();
    const inputTurn: GameplayRuntimeTurnInput = {
      ...baseTurn,
      playerAction: {
        ...baseTurn.playerAction,
        submitted: rawActionMarker,
        normalized: rawActionMarker,
      },
    };
    const inputFrame = frame({ playerAction: rawActionMarker });
    const inputChecklist = checklist(inputFrame);
    const packet = buildPacket({
      turn: inputTurn,
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([movementReceipt(inputFrame, inputChecklist)], inputFrame),
    });
    const view = buildCleanNarratorView(packet);
    const serializedView = JSON.stringify(view);

    expect(packet.input.normalizedPlayerAction).toBe(rawActionMarker);
    expect(view.language).toBe("en");
    expect(view.languageSource).toBe("derived_from_player_action_without_prompting_raw_action");
    expect(cleanNarratorViewSchema.safeParse(view).success).toBe(true);
    expect(serializedView).not.toContain(rawActionMarker);
    expect(serializedView).not.toContain("playerAction");
  });

  it("settles direct scene snapshots with visible targets and movement options for broad look actions", () => {
    const inputFrame = frame({
      playerAction: "I look around for visible objects, exits, and local targets.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [
        { ref: "Guide", label: "Guide", kind: "actor" },
        { ref: "Notice Board", label: "Notice Board", kind: "place_handle" },
        { ref: "North Hall", label: "North Hall", kind: "location" },
      ],
      inventory: [{ ref: "Courier satchel", label: "Courier satchel", equipState: "carried", tags: [] }],
      citableRefs: ["Player", "Market", "Guide", "North Hall", "Notice Board", "Courier satchel"],
    });
    const packet = buildPacket({
      frame: inputFrame,
      gmRead: directGmRead(inputFrame),
      checklist: null,
      execution: null,
    });
    const view = buildCleanNarratorView(packet);

    expect(packet.settlementKind).toBe("direct_scene");
    expect(cleanSettledTurnPacketSchema.safeParse(packet).success).toBe(true);
    expect(cleanNarratorViewSchema.safeParse(view).success).toBe(true);
    const targetEvidence = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("visible_target"));
    const actorEvidence = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("visible_actor"));
    expect(actorEvidence?.text).toBe("Guide is in view here.");
    expect(actorEvidence?.limits.proves).toEqual(["actor visible in the current scene"]);
    expect(targetEvidence?.text).toBe("Targets in view here include Guide, Notice Board, North Hall.");
    expect(targetEvidence?.backendFacts.map((entry) => entry.text)).toEqual([
      "Visible target labels: Guide; Notice Board; North Hall.",
      "Visible actor target labels: Guide.",
      "Visible place-handle target labels: Notice Board.",
      "Visible location target labels: North Hall.",
    ]);
    expect(targetEvidence?.limits.doesNotProve).toContain("movement");
    const routeEvidence = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("movement_option"));
    expect(routeEvidence?.text).toBe("From Market, visible route choices are North Hall (1 minute).");
    expect(routeEvidence?.backendFacts.map((entry) => entry.text)).toEqual([
      "Route choices beat: From Market, visible route choices are North Hall (1 minute).",
      "Route origin: Market.",
      "Route choice labels: North Hall.",
      "Open route labels: North Hall.",
      "Closed route labels: none.",
      "Route choice travel costs: North Hall: 1 minute.",
    ]);
    expect(routeEvidence?.limits.proves).toContain("route choice phrasing for the player");
    expect(routeEvidence?.limits.doesNotProve).toContain("arrival");
    expect(JSON.stringify(view)).not.toContain("SceneFrame");
  });

  it("settles public scene descriptions as bounded scene_texture evidence", () => {
    const baseFrame = frame();
    const inputFrame = frame({
      playerAction: "I check the visible routes from here.",
      scene: {
        ...baseFrame.scene,
        currentLocation: {
          ...baseFrame.scene.currentLocation,
          description: "Canvas awnings hang over the market lanes, and rain taps against the brass gutters.",
        },
        currentScene: {
          ...baseFrame.scene.currentScene,
          description: "Lantern smoke clings to the ticket counter beside the wet stone floor. Brass bells tremble above the ticket window.",
        },
      },
    });
    const packet = buildPacket({
      frame: inputFrame,
      gmRead: directGmRead(inputFrame),
      checklist: null,
      execution: null,
    });
    const view = buildCleanNarratorView(packet);
    const textureEvidence = packet.acceptedEvidence.find((entry) =>
      entry.claimKinds.includes("scene_texture")
    );

    expect(cleanSettledTurnPacketSchema.safeParse(packet).success).toBe(true);
    expect(cleanNarratorViewSchema.safeParse(view).success).toBe(true);
    expect(textureEvidence).toMatchObject({
      authority: "scene_frame_snapshot",
      sourceKind: "scene_frame",
      claimKinds: ["scene_texture"],
    });
    expect(textureEvidence?.backendFacts.map((entry) => entry.text)).toEqual([
      "Scene texture: Lantern smoke clings to the ticket counter beside the wet stone floor.",
      "Scene texture: Brass bells tremble above the ticket window.",
    ]);
    expect(textureEvidence?.limits.proves).toEqual(["public current-scene description texture"]);
    expect(textureEvidence?.limits.doesNotProve).toContain("route truth");
    expect(textureEvidence?.limits.doesNotProve).toContain("actor presence");
    expect(JSON.stringify(view)).toContain("Scene texture: Lantern smoke clings to the ticket counter beside the wet stone floor.");
    expect(JSON.stringify(view)).toContain("Scene texture: Brass bells tremble above the ticket window.");
  });

  it("settles clarification as an explicit player-facing request before scene snapshot context", () => {
    const inputFrame = frame({
      playerAction: "I hand it to them.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }, {
        ref: "Courier",
        label: "Courier",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [
        { ref: "Guide", label: "Guide", kind: "actor" },
        { ref: "Courier", label: "Courier", kind: "actor" },
      ],
      inventory: [{ ref: "Brass Tube", label: "Brass Tube", equipState: "carried", tags: [] }],
      citableRefs: ["Player", "Market", "Guide", "Courier", "Brass Tube"],
    });
    const read = clarificationGmRead(inputFrame);
    const packet = buildPacket({
      frame: inputFrame,
      gmRead: read,
      judgment: clarificationJudgment(inputFrame, read),
    });
    const view = buildCleanNarratorView(packet);
    const clarification = packet.acceptedEvidence.find((entry) =>
      entry.claimKinds.includes("clarification_request")
    );

    expect(packet.settlementKind).toBe("clarification");
    expect(cleanSettledTurnPacketSchema.safeParse(packet).success).toBe(true);
    expect(cleanNarratorViewSchema.safeParse(view).success).toBe(true);
    expect(packet.acceptedEvidence[0]?.authority).toBe("clarification_request");
    expect(clarification).toMatchObject({
      authority: "clarification_request",
      sourceKind: "gm_read",
      claimKinds: ["clarification_request"],
      text: "Clarification needed: Which visible person should receive the item?",
    });
    expect(clarification?.backendFacts.map((entry) => entry.text)).toEqual([
      "Clarification request: Which visible person should receive the item?",
    ]);
    expect(clarification?.limits.proves).toContain("clarification question text");
    expect(clarification?.limits.doesNotProve).toContain("item state");
    expect(packet.acceptedEvidence.some((entry) => entry.authority === "scene_frame_snapshot")).toBe(true);
    expect(view.acceptedEvidence[0]?.authority).toBe("clarification_request");
  });

  it("fails clarification settlement when no accepted clarification question exists", () => {
    const inputFrame = frame({ playerAction: "I do that." });
    const read = {
      ...directGmRead(inputFrame),
      path: "direct" as const,
      liveSceneQuestion: "What does the player observe from here?",
    };
    const judge = {
      ...clarificationJudgment(inputFrame, read),
      noRollReason: null,
      checkRationale: "",
    };

    expect(() => buildPacket({
      frame: inputFrame,
      gmRead: read,
      judgment: judge,
    })).toThrow("Clarification settlement requires a GM Read or Judge clarification question.");
  });

  it("settles route_check into route status only", () => {
    const inputFrame = frame();
    const inputChecklist = checklist(inputFrame);
    const routeReceipt = cleanStage4ReceiptSchema.parse({
      ...movementReceipt(inputFrame, inputChecklist),
      receiptId: "stage4-receipt-route-1",
      capabilityId: "route_check",
      result: { ...inputFrame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "route_check_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_explain_route_status",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "North Hall is reachable from Market.",
        visibleRefs: ["Player", "North Hall"],
        routeStatus: "connected",
        routeCheck: {
          label: "North Hall",
          status: "connected",
        },
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: "loc-market",
        destinationLocationId: "loc-north",
        edgeIds: ["edge-market-north"],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
    });
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([routeReceipt], inputFrame),
    });

    const route = packet.acceptedEvidence.find((entry) => entry.authority === "route_check_receipt");
    expect(route?.claimKinds).toEqual(["route_status"]);
    expect(route?.text).toBe("From here, the path to North Hall is open.");
    expect(route?.backendFacts.map((entry) => entry.text)).toEqual([
      "Route beat: From here, the path to North Hall is open.",
      "Route label: North Hall.",
      "Route status: connected.",
    ]);
    expect(route?.limits.proves).toContain("route status phrasing for the player");
    expect(route?.limits.doesNotProve).toContain("movement");
    expect(route?.limits.doesNotProve).toContain("current-scene change");
  });

  it("settles accepted dialogue as speaker response without promoting quote to world fact", () => {
    const inputFrame = frame({
      playerAction: "I ask Guide what happened.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    });
    const inputChecklist = checklist(inputFrame);
    const dialogueReceipt = cleanStage4ReceiptSchema.parse({
      ...movementReceipt(inputFrame, inputChecklist),
      receiptId: "stage4-receipt-dialogue-1",
      requestId: "stage4-request-dialogue-1",
      capabilityId: "dialogue_record",
      result: { ...inputFrame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "terminal_dialogue_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_quote_visible_dialogue_response",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "Guide dialogue response (answer): Guide says the north stairs flooded before dawn. Quote: The north stairs flooded before dawn.",
        visibleRefs: ["Player", "Guide"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: {
          type: "dialogue_response",
          authorityKind: "existing_visible_actor",
          speakerLabel: "Guide",
          addresseeLabels: ["Mira Voss"],
          outcomeKind: "answer",
          quotedSpeech: "The north stairs flooded before dawn.",
          summary: "Guide says the north stairs flooded before dawn.",
          responseLanguage: "match_player_action",
          claimStatus: "visible_speaker_response_only",
        },
      },
      privateResult: {
        playerId: null,
        fromLocationId: null,
        destinationLocationId: null,
        edgeIds: [],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
    });

    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([dialogueReceipt], inputFrame),
    });

    const dialogue = packet.acceptedEvidence.find((entry) => entry.authority === "terminal_dialogue_receipt");
    expect(dialogue?.claimKinds).toEqual(["dialogue_response"]);
    expect(dialogue?.backendFacts[1]?.text).toBe('Guide says: "The north stairs flooded before dawn."');
    expect(dialogue?.limits.doesNotProve).toContain("truth of speaker claim");
    expect(dialogue?.limits.doesNotProve).toContain("durable world fact");
  });

  it("settles Player local condition as posture/readiness evidence only", () => {
    const inputFrame = frame({
      playerAction: "I kneel near the stall.",
      citableRefs: ["Player", "Market", "North Hall"],
    });
    const inputChecklist = checklist(inputFrame);
    const receipt = playerLocalConditionReceipt(inputFrame, inputChecklist);
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([receipt], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    const condition = packet.acceptedEvidence.find((entry) => entry.authority === "player_local_condition_receipt");
    expect(condition?.claimKinds).toEqual(["player_local_condition"]);
    expect(condition?.backendFacts.map((entry) => entry.text)).toEqual([
      "Player is kneeling.",
      "Condition key: kneeling.",
      "Current scene anchor: Market.",
      "Condition result: applied.",
      "Condition target: Market.",
    ]);
    expect(condition?.limits.doesNotProve).toContain("HP change");
    expect(condition?.limits.doesNotProve).toContain("movement");
    expect(condition?.limits.doesNotProve).toContain("dialogue content");
    expect(JSON.stringify(view)).not.toContain("condition-1");
    expect(JSON.stringify(view)).not.toContain("player-1");
  });

  it("settles item_transfer receipts as item_state evidence only", () => {
    const inputFrame = frame({
      playerAction: "I hand the Brass Tube to Guide.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      inventory: [{
        ref: "Brass Tube",
        label: "Brass Tube",
        equipState: "carried",
        tags: [],
      }],
      citableRefs: ["Player", "Market", "North Hall", "Guide", "Brass Tube"],
    });
    const inputChecklist = checklist(inputFrame);
    const receipt = itemTransferReceipt(inputFrame, inputChecklist);
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([receipt], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    const itemState = packet.acceptedEvidence.find((entry) => entry.authority === "item_transfer_receipt");
    expect(itemState?.claimKinds).toEqual(["item_state"]);
    expect(itemState?.text).toBe(
      "Brass Tube passes from Player to Guide at Market. Brass Tube is carried by Guide at Market.",
    );
    expect(itemState?.backendFacts.map((entry) => entry.text)).toEqual([
      "Custody change: Brass Tube passes from Player to Guide at Market.",
      "Settled custody: Brass Tube is carried by Guide at Market.",
      "Item label: Brass Tube.",
      "Source: Player.",
      "Target: Guide.",
      "Final equip state: carried.",
      "Current scene anchor: Market.",
      "Item transfer result: transferred_to_actor.",
    ]);
    expect(itemState?.limits.doesNotProve).toEqual(expect.arrayContaining([
      "item discovery",
      "item use or activation",
      "NPC consent or reaction",
      "world fact",
      "dialogue content",
      "absence or no-change beyond the accepted item state",
    ]));
    expect(itemState?.limits.proves).toContain("settled custody phrasing for the player");
    expect(JSON.stringify(view)).not.toContain("item-brass-tube");
    expect(JSON.stringify(view)).not.toContain("npc-guide");
    expect(JSON.stringify(view)).not.toContain("stage4-authority-item-transfer");
  });

  it("settles minor_poi_create receipts as visible current-scene handle evidence only", () => {
    const inputFrame = frame({
      playerAction: "I mark the Tea Stall as a place to meet.",
      citableRefs: ["Player", "Market", "North Hall"],
    });
    const inputChecklist = checklist(inputFrame);
    const receipt = minorPoiReceipt(inputFrame, inputChecklist);
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([receipt], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    const handle = packet.acceptedEvidence.find((entry) => entry.authority === "minor_poi_handle_receipt");
    expect(handle?.claimKinds).toEqual(["minor_poi_handle", "visible_target"]);
    expect(handle?.backendFacts.map((entry) => entry.text)).toEqual([
      "Visible current-scene place handle created: Tea Stall.",
      "Place handle label: Tea Stall.",
      "Place handle kind: stall.",
      "Current scene anchor: Market.",
      "Handle result: created.",
      "This is a visible current-scene target handle only, not a movement destination.",
    ]);
    expect(handle?.limits.doesNotProve).toEqual(expect.arrayContaining([
      "services or inventory",
      "readable sign text",
      "route truth",
      "legal movement destination",
      "location reveal",
      "world fact",
      "absence or no-change beyond the accepted visible place handle",
    ]));
    expect(JSON.stringify(view)).not.toContain("stage4-minor-poi-secret");
    expect(JSON.stringify(view)).not.toContain("stage4-authority-minor-poi");
  });

  it("settles local_observation receipts as bounded current-scene observation evidence only", () => {
    const inputFrame = frame({
      playerAction: "Do I see a Violet Astrolabe here?",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      targets: [{ ref: "Guide", label: "Guide", kind: "actor" }],
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    });
    const inputChecklist = checklist(inputFrame);
    const receipt = localObservationReceipt(inputFrame, inputChecklist);
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([receipt], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    const observation = packet.acceptedEvidence.find((entry) => entry.authority === "local_observation_receipt");
    expect(observation?.claimKinds).toEqual(["local_observation", "bounded_visibility_negative"]);
    expect(observation?.text).toBe("The visible actors and visible targets show no match for \"Violet Astrolabe\".");
    expect(observation?.backendFacts.map((entry) => entry.text)).toEqual([
      "Local observation beat: The visible actors and visible targets show no match for \"Violet Astrolabe\".",
      "Searched visible surfaces: visible actors and visible targets.",
      "Observation query: Violet Astrolabe.",
      "Anchor scene: Market.",
      "Anchor location: Market.",
    ]);
    expect(observation?.limits.proves).toEqual([
      "bounded no-match against enumerated current visible entries",
    ]);
    expect(observation?.limits.doesNotProve).toEqual(expect.arrayContaining([
      "hidden discovery",
      "broad absence",
      "phone or device status",
      "route truth beyond route option/check receipts",
      "world fact",
      "no-change",
    ]));
    expect(JSON.stringify(view)).not.toContain("secret");
  });

  it("settles local_observation movement-option facts with player-safe display labels", () => {
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
    const routeSummary = `Current route options include: ${routeLabels.join(", ")}.`;
    const routeBeat = `The visible route choices here are ${routeLabels.join(", ")}.`;
    const inputFrame = frame({
      playerAction: "I look around for visible routes and local targets.",
      targets: [],
      movementOptions: routeLabels.map((label) => ({ ref: label, label, connected: true, travelCost: 1 })),
      citableRefs: ["Player", "Market", ...routeLabels],
    });
    const inputChecklist = checklist(inputFrame);
    const receipt = cleanStage4ReceiptSchema.parse({
      ...localObservationReceipt(inputFrame, inputChecklist),
      publicResult: {
        ...localObservationReceipt(inputFrame, inputChecklist).publicResult,
        summary: routeSummary,
        visibleRefs: ["Player", "Market", ...routeLabels],
        localObservation: {
          type: "local_observation",
          surfaceVersion: "scene_frame_current_observation_surface.v1",
          resultKind: "positive_list",
          mode: "list_surface",
          queryText: "visible routes and local targets",
          targetLabel: null,
          matchedEntries: routeLabels.map((label) => ({
            surfaceKind: "movement_option",
            label,
            detail: "movement option label only",
          })),
          searchedSurfaceKinds: ["movement_option"],
          anchorSceneLabel: "Market",
          anchorLocationLabel: "Market",
          boundedNegative: false,
          summary: routeSummary,
          claimStatus: "bounded_current_scene_observation_only",
        },
      },
    });
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([receipt], inputFrame),
    });

    const observation = packet.acceptedEvidence.find((entry) => entry.authority === "local_observation_receipt");
    expect(observation?.text).toBe(routeBeat);
    expect(observation?.backendFacts.map((entry) => entry.text)).toEqual([
      `Local observation beat: ${routeBeat}`,
      "Searched visible surfaces: route options.",
      "Observation query: visible routes and local targets.",
      "Observed entry labels: North Hall; East Gate; South Dock; West Yard; Bell Tower; Lantern Row; The Copper Tap; Upper Dam Ruins.",
      "Observed entry surfaces: route option North Hall; route option East Gate; route option South Dock; route option West Yard; route option Bell Tower; route option Lantern Row; route option The Copper Tap; route option Upper Dam Ruins.",
      "Anchor scene: Market.",
      "Anchor location: Market.",
    ]);
    expect(observation?.backendFacts[0]?.text).toContain("The Copper Tap");
    expect(observation?.backendFacts[0]?.text).toContain("Upper Dam Ruins");
    expect(JSON.stringify(observation)).not.toContain("[hidden]");
    expect(JSON.stringify(observation)).not.toContain("movement_option");
    expect(JSON.stringify(observation)).not.toContain("visible_target");
    expect(JSON.stringify(observation)).not.toContain("SceneFrame");
  });

  it("settles device_surface_observation receipts as bounded public device surface evidence only", () => {
    const inputFrame = frame({
      playerAction: "I check whether the Burner phone has a message.",
      inventory: [{
        ref: "Burner phone",
        label: "Burner phone",
        equipState: "equipped",
        tags: ["phone"],
      }],
      citableRefs: ["Player", "Market", "North Hall", "Burner phone"],
    });
    const inputChecklist = checklist(inputFrame);
    const receipt = deviceSurfaceObservationReceipt(inputFrame, inputChecklist);
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([receipt], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    const deviceSurface = packet.acceptedEvidence.find((entry) => entry.authority === "device_surface_observation_receipt");
    expect(deviceSurface?.claimKinds).toEqual(["device_surface_observation", "device_surface_unavailable"]);
    expect(deviceSurface?.text).toBe("Burner phone's visible surface shows no requested message indicator.");
    expect(deviceSurface?.backendFacts.map((entry) => entry.text)).toEqual([
      "Device surface beat: Burner phone's visible surface shows no requested message indicator.",
      "Device label: Burner phone.",
      "Requested surface facets: message indicator.",
      "Unavailable surface facets: message indicator.",
      "Anchor scene: Market.",
      "Anchor location: Market.",
    ]);
    expect(deviceSurface?.limits.proves).toEqual([
      "bounded current visible device surface result for requested facets",
      "requested device label",
    ]);
    expect(deviceSurface?.limits.doesNotProve).toEqual(expect.arrayContaining([
      "hidden or private message contents",
      "true absence of messages, calls, or signal",
      "message or call generation or delivery",
      "true network coverage",
      "device use or activation",
      "broad absence or no-change",
    ]));
    expect(JSON.stringify(view)).not.toContain("privateResult");
    expect(JSON.stringify(deviceSurface)).not.toMatch(/frame\/worldVersion|message_indicator/iu);
    expect(JSON.stringify(view)).not.toMatch(/frame\/worldVersion|message_indicator|no messages|no calls|no signal|nothing changed|no change/iu);
  });

  it("settles support actor materialization as visible actor presence only", () => {
    const inputFrame = frame({
      playerAction: "I look for a local vendor in the market.",
      citableRefs: ["Player", "Market", "North Hall"],
    });
    const inputChecklist = checklist(inputFrame);
    const supportReceipt = cleanStage4ReceiptSchema.parse({
      ...movementReceipt(inputFrame, inputChecklist),
      receiptId: "stage4-receipt-support-actor-1",
      requestId: "stage4-request-support-actor-1",
      capabilityId: "support_actor_create",
      result: { ...inputFrame.base, worldVersion: inputFrame.base.worldVersion + 1, mutationApplied: true },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "current_scene_support_actor",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: true,
      },
      publicResult: {
        summary: "Local Vendor is materialized as a vendor in Market.",
        visibleRefs: ["Player", "Market", "Local Vendor"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
        supportActor: {
          type: "support_actor_materialization",
          resultKind: "created",
          actorRef: "Local Vendor",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
          roleLabel: "vendor",
          anchorSceneLabel: "Market",
          anchorLocationLabel: "Market",
          publicSummary: "An ordinary local vendor is available in the market.",
          visibleCue: null,
          identityBounds: {
            tier: "temporary",
            persistence: "current_scene",
            significance: "minor_support",
            agency: "reactive_only",
          },
          claimStatus: "visible_support_actor_materialization_only",
        },
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: null,
        destinationLocationId: null,
        supportActorId: "npc-local-vendor",
        supportActorOperation: "inserted",
        anchorLocationId: "loc-market",
        anchorSceneLocationId: "loc-market",
        edgeIds: [],
        authorityTraceId: "stage4-authority-support",
        clockReceiptId: null,
        stateDeltaRefs: ["npc:npc-local-vendor:created", "scene:loc-market:support_actors"],
      },
    });

    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([supportReceipt], inputFrame),
    });

    const support = packet.acceptedEvidence.find((entry) => entry.authority === "support_actor_materialization_receipt");
    expect(support?.claimKinds).toEqual(["visible_actor", "support_actor_materialization"]);
    expect(support?.backendFacts[0]?.text).toBe("Visible support actor: Local Vendor.");
    expect(support?.limits.doesNotProve).toContain("dialogue content");
    expect(support?.limits.doesNotProve).toContain("NPC private knowledge");
    expect(support?.limits.doesNotProve).toContain("durable world fact");
  });

  it("settles support materialization and dependent dialogue as separate evidence authorities", () => {
    const inputFrame = frame({
      playerAction: "I ask a local vendor what changed today.",
      citableRefs: ["Player", "Market", "North Hall"],
    });
    const inputChecklist = checklist(inputFrame);
    const supportReceipt = cleanStage4ReceiptSchema.parse({
      ...movementReceipt(inputFrame, inputChecklist),
      receiptId: "stage4-receipt-support-actor-1",
      requestId: "stage4-request-support-actor-1",
      capabilityId: "support_actor_create",
      result: { ...inputFrame.base, worldVersion: 1, mutationApplied: true },
      authority: {
        evidenceAuthority: "support_actor_materialization_receipt",
        mutationAuthority: "current_scene_support_actor",
        visibleResultAuthority: "may_claim_visible_support_actor_materialized",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: true,
      },
      publicResult: {
        summary: "Local Vendor is materialized as a vendor in Market.",
        visibleRefs: ["Player", "Market", "Local Vendor"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
        supportActor: {
          type: "support_actor_materialization",
          resultKind: "created",
          actorRef: "Local Vendor",
          actorLabel: "Local Vendor",
          roleKind: "vendor",
          roleLabel: "vendor",
          anchorSceneLabel: "Market",
          anchorLocationLabel: "Market",
          publicSummary: "An ordinary local vendor is available in the market.",
          visibleCue: null,
          identityBounds: {
            tier: "temporary",
            persistence: "current_scene",
            significance: "minor_support",
            agency: "reactive_only",
          },
          claimStatus: "visible_support_actor_materialization_only",
        },
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: null,
        destinationLocationId: null,
        supportActorId: "npc-local-vendor",
        supportActorOperation: "inserted",
        anchorLocationId: "loc-market",
        anchorSceneLocationId: "loc-market",
        edgeIds: [],
        authorityTraceId: "stage4-authority-support",
        clockReceiptId: null,
        stateDeltaRefs: ["npc:npc-local-vendor:created", "scene:loc-market:support_actors"],
      },
    });
    const refreshedFrame = frame({
      frameId: "frame-refreshed-local-vendor",
      base: { tick: 0, worldVersion: 1, worldTimeMinutes: 0 },
      actors: [{
        ref: "Local Vendor",
        label: "Local Vendor",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      citableRefs: ["Player", "Market", "North Hall", "Local Vendor"],
    });
    const dialogueReceipt = cleanStage4ReceiptSchema.parse({
      ...movementReceipt(inputFrame, inputChecklist),
      receiptId: "stage4-receipt-dialogue-1",
      requestId: "stage4-request-dialogue-1",
      frameId: refreshedFrame.frameId,
      stepId: "step-2",
      capabilityId: "dialogue_record",
      source: {
        ...movementReceipt(inputFrame, inputChecklist).source,
        checklistStepId: "step-2",
      },
      base: refreshedFrame.base,
      result: { ...refreshedFrame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "terminal_dialogue_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_quote_visible_dialogue_response",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "Local Vendor dialogue response recorded (answer).",
        visibleRefs: ["Player", "Local Vendor"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: {
          type: "dialogue_response",
          authorityKind: "existing_visible_actor",
          speakerLabel: "Local Vendor",
          addresseeLabels: ["Mira Voss"],
          outcomeKind: "answer",
          quotedSpeech: "The morning crowd is thinner than usual.",
          summary: "Local Vendor says the morning crowd is thinner than usual.",
          responseLanguage: "match_player_action",
          claimStatus: "visible_speaker_response_only",
        },
        supportActor: null,
      },
      privateResult: {
        playerId: null,
        fromLocationId: null,
        destinationLocationId: null,
        supportActorId: null,
        supportActorOperation: null,
        anchorLocationId: null,
        anchorSceneLocationId: null,
        edgeIds: [],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
    });

    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([supportReceipt, dialogueReceipt], inputFrame),
    });

    const authorities = packet.acceptedEvidence
      .filter((entry) => entry.sourceKind === "stage4_receipt")
      .map((entry) => entry.authority);
    expect(authorities).toContain("support_actor_materialization_receipt");
    expect(authorities).toContain("terminal_dialogue_receipt");
    const support = packet.acceptedEvidence.find((entry) => entry.authority === "support_actor_materialization_receipt");
    const dialogue = packet.acceptedEvidence.find((entry) => entry.authority === "terminal_dialogue_receipt");
    expect(support?.claimKinds).toEqual(["visible_actor", "support_actor_materialization"]);
    expect(dialogue?.claimKinds).toEqual(["dialogue_response"]);
    expect(support?.limits.doesNotProve).toContain("dialogue content");
    expect(dialogue?.limits.doesNotProve).toContain("truth of speaker claim");
  });

  it("settles P64 non-movement receipts into exact accepted evidence authorities", () => {
    const inputFrame = frame({
      playerAction: "I wait, look around, and check routes.",
      actors: [{
        ref: "Guide",
        label: "Guide",
        role: "support",
        visibleStatus: { hp: null, conditions: [] },
      }],
      scene: {
        ...frame().scene,
        visibleFacts: [{
          factId: "fact-lanterns",
          summary: "Lanterns burn along the market stalls.",
          source: "Market",
          tick: 0,
        }],
      },
      citableRefs: ["Player", "Market", "North Hall", "Guide"],
    });
    const inputChecklist = checklist(inputFrame);
    const receiptBase = movementReceipt(inputFrame, inputChecklist);
    const timeReceipt = cleanStage4ReceiptSchema.parse({
      ...receiptBase,
      receiptId: "stage4-receipt-time-1",
      requestId: "stage4-request-time-1",
      capabilityId: "time_advance",
      result: { tick: 5, worldVersion: 1, worldTimeMinutes: 5, mutationApplied: true },
      authority: {
        evidenceAuthority: "terminal_mutation_receipt",
        mutationAuthority: "world_clock_only",
        visibleResultAuthority: "may_claim_elapsed_time",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: true,
      },
      publicResult: {
        summary: "5 minute(s) pass in Market.",
        visibleRefs: ["Player", "Market"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: {
          type: "time_advance",
          elapsedMinutes: 5,
          reasonKind: "wait",
        },
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: null,
        destinationLocationId: null,
        edgeIds: [],
        authorityTraceId: "stage4-authority-time-1",
        clockReceiptId: "stage4-clock-time-1",
        stateDeltaRefs: ["world_clock:stage4-receipt-time-1"],
      },
    });
    const observeReceipt = cleanStage4ReceiptSchema.parse({
      ...receiptBase,
      receiptId: "stage4-receipt-observe-1",
      requestId: "stage4-request-observe-1",
      capabilityId: "observe_visible",
      result: { ...inputFrame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "scene_observation_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_describe_visible_snapshot",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "The current visible scene is Market.",
        visibleRefs: ["Player", "Market", "Guide", "North Hall"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: {
          type: "visible_observation",
          currentScene: "Market",
          currentLocation: "Market",
          visibleActors: ["Guide", "Harbor Clerk", "Market Porter", "Lamp Keeper", "Cart Driver", "Courier"],
          visibleFacts: [
            "Lanterns burn along the market stalls.",
            "A route board hangs beside the stall.",
            "Rainwater gathers near the awning.",
            "The crowd keeps to the west edge.",
          ],
          inventory: ["Brass Tube", "Field Notebook", "Pocket Lens", "Token Pouch"],
          movementOptions: [
            "North Hall",
            "South Arcade",
            "East Gate",
            "West Stairs",
            "Canal Walk",
            "Archive Door",
          ],
        },
        sceneBeat: null,
        dialogue: null,
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: null,
        destinationLocationId: null,
        edgeIds: [],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
    });
    const routeOptionsReceipt = cleanStage4ReceiptSchema.parse({
      ...receiptBase,
      receiptId: "stage4-receipt-route-options-1",
      requestId: "stage4-request-route-options-1",
      capabilityId: "route_options",
      result: { ...inputFrame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "route_options_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "may_list_route_options",
        maySupportNarrationClaim: true,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "Visible route options: North Hall.",
        visibleRefs: ["Player", "Market", "North Hall"],
        routeStatus: null,
        locationChange: null,
        routeOptions: {
          type: "route_options",
          fromLabel: "Market",
          options: [
            { label: "North Hall", connected: true, travelCost: 1 },
            { label: "South Arcade", connected: true, travelCost: 2 },
            { label: "East Gate", connected: true, travelCost: 2 },
            { label: "West Stairs", connected: true, travelCost: 3 },
            { label: "Canal Walk", connected: true, travelCost: 4 },
            { label: "Archive Door", connected: false, travelCost: null },
            { label: "Clock Yard", connected: true, travelCost: 5 },
            { label: "Glasshouse", connected: true, travelCost: 6 },
            { label: "Old Ferry", connected: false, travelCost: null },
            { label: "Signal Loft", connected: true, travelCost: 7 },
            { label: "Ledger Annex", connected: true, travelCost: 8 },
            { label: "Blue Bridge", connected: true, travelCost: 9 },
          ],
        },
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
      },
      privateResult: {
        playerId: "player-1",
        fromLocationId: null,
        destinationLocationId: null,
        edgeIds: [],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
    });
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([timeReceipt, observeReceipt, routeOptionsReceipt], inputFrame),
    });

    expect(cleanSettledTurnPacketSchema.safeParse(packet).success).toBe(true);
    const authorities = packet.acceptedEvidence
      .filter((entry) => entry.sourceKind === "stage4_receipt")
      .map((entry) => entry.authority);
    expect(authorities).toEqual([
      "terminal_mutation_receipt",
      "scene_observation_receipt",
      "route_options_receipt",
    ]);
    const elapsed = packet.acceptedEvidence.find((entry) => entry.claimKinds.includes("elapsed_time"));
    expect(elapsed?.text).toBe("5 minutes pass.");
    expect(elapsed?.backendFacts.map((entry) => entry.text)).toEqual([
      "Time beat: 5 minutes pass.",
      "Elapsed time: 5 minutes.",
    ]);
    expect(elapsed?.limits.proves).toContain("time passage phrasing for the player");
    expect(elapsed?.limits.doesNotProve).toContain("offscreen events");
    const observation = packet.acceptedEvidence.find((entry) => entry.authority === "scene_observation_receipt");
    expect(observation?.claimKinds).toEqual([
      "current_scene",
      "current_location",
      "visible_actor",
      "visible_fact",
      "inventory_status",
      "movement_option",
    ]);
    expect(observation?.backendFacts).toHaveLength(8);
    expect(observation?.text).toBe("You are at Market.");
    expect(observation?.backendFacts.map((entry) => entry.text)).toEqual([
      "Scene placement: You are at Market.",
      "Scene label: Market.",
      "Place label: Market.",
      "Visible actor labels: Guide; Harbor Clerk; Market Porter; Lamp Keeper; Cart Driver; Courier.",
      "Visible scene facts: Lanterns burn along the market stalls; A route board hangs beside the stall; Rainwater gathers near the awning; The crowd keeps to the west edge.",
      "Inventory labels: Brass Tube; Field Notebook; Pocket Lens; Token Pouch.",
      "Route choices beat: From Market, visible route choices are North Hall, South Arcade, East Gate, West Stairs, Canal Walk, Archive Door.",
      "Route choice labels: North Hall; South Arcade; East Gate; West Stairs; Canal Walk; Archive Door.",
    ]);
    expect(observation?.limits.proves).toContain("scene observation phrasing for the player");
    const routes = packet.acceptedEvidence.find((entry) => entry.authority === "route_options_receipt");
    expect(routes?.text).toBe("From Market, visible route choices are North Hall (1 minute), South Arcade (2 minutes), East Gate (2 minutes), West Stairs (3 minutes), Canal Walk (4 minutes), Archive Door (closed), Clock Yard (5 minutes), Glasshouse (6 minutes).");
    expect(routes?.backendFacts.map((entry) => entry.text)).toEqual([
      "Route choices beat: From Market, visible route choices are North Hall (1 minute), South Arcade (2 minutes), East Gate (2 minutes), West Stairs (3 minutes), Canal Walk (4 minutes), Archive Door (closed), Clock Yard (5 minutes), Glasshouse (6 minutes).",
      "Route origin: Market.",
      "Route choice labels: North Hall; South Arcade; East Gate; West Stairs; Canal Walk; Archive Door; Clock Yard; Glasshouse.",
      "Open route labels: North Hall; South Arcade; East Gate; West Stairs; Canal Walk; Clock Yard; Glasshouse.",
      "Closed route labels: Archive Door.",
      "Route choice travel costs: North Hall: 1 minute; South Arcade: 2 minutes; East Gate: 2 minutes; West Stairs: 3 minutes; Canal Walk: 4 minutes; Archive Door: closed; Clock Yard: 5 minutes; Glasshouse: 6 minutes.",
    ]);
    expect(routes?.limits.proves).toContain("route choice phrasing for the player");
    expect(routes?.limits.doesNotProve).toContain("hidden routes");
  });

  it("excludes failed and skipped intended effects from accepted evidence", () => {
    const inputFrame = frame();
    const inputChecklist = checklist(inputFrame);
    const failed = cleanStage4ReceiptSchema.parse({
      ...movementReceipt(inputFrame, inputChecklist),
      status: "failed",
      result: { ...inputFrame.base, mutationApplied: false },
      authority: {
        evidenceAuthority: "failure_receipt",
        mutationAuthority: "none",
        visibleResultAuthority: "failure_only",
        maySupportNarrationClaim: false,
        mayAuthorizeMutation: false,
      },
      publicResult: {
        summary: "Stage 4 movement destination is stale.",
        visibleRefs: ["Player", "North Hall"],
        routeStatus: null,
        locationChange: null,
        routeOptions: null,
        timeAdvance: null,
        visibleObservation: null,
        sceneBeat: null,
        dialogue: null,
      },
      privateResult: {
        playerId: null,
        fromLocationId: null,
        destinationLocationId: null,
        edgeIds: [],
        authorityTraceId: null,
        clockReceiptId: null,
        stateDeltaRefs: [],
      },
      failure: {
        kind: "stale_frame_or_clock",
        message: "Stage 4 frame clock is stale.",
        hiddenMutationApplied: false,
      },
    });
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([failed], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    expect(packet.stepAudit).toContainEqual(expect.objectContaining({
      stepId: "step-1",
      status: "failed",
      maySupportWorldClaim: false,
    }));
    expect(packet.acceptedEvidence.some((entry) => entry.claimKinds.includes("player_location_change"))).toBe(false);
    expect(view.stepAuditForGrounding[0]).toMatchObject({
      stepId: "step-1",
      status: "failed",
      mayUseAsWorldTruth: false,
    });
  });

  it("rejects private guard leaks in accepted evidence", () => {
    const inputFrame = frame({
      scene: {
        ...frame().scene,
        visibleFacts: [{
          factId: "visible-fact-1",
          summary: "Hidden Watcher stands openly here.",
          source: "Market",
          tick: null,
        }],
      },
      privateGuards: {
        forbiddenActorLabels: ["Hidden Watcher"],
        forbiddenPrivateTerms: [],
      },
    });

    expect(() => buildPacket({
      frame: inputFrame,
      gmRead: directGmRead(inputFrame),
    })).toThrow(/private guard/u);
  });

  it("requires an admitted settlement source before player-facing packet creation", () => {
    expect(() => buildPacket()).toThrow(/requires an admitted settlement source/u);
  });
});
