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
        locationChange: receipt.publicResult.locationChange,
        timeAdvance: receipt.publicResult.timeAdvance,
        dialogue: receipt.publicResult.dialogue,
      })),
  });
}

function buildPacket(input: {
  frame?: AuthoritativeSceneFrame;
  checklist?: GmActionChecklist | null;
  execution?: CleanStage4ExecutionResult | null;
} = {}) {
  const inputTurn = turn();
  const inputFrame = input.frame ?? frame();
  return buildCleanSettledTurnPacket({
    turn: inputTurn,
    publicPacketId: buildCleanPublicTurnIds(inputTurn).publicPacketId,
    frame: inputFrame,
    gmRead: null,
    judgment: null,
    oracleSettlement: null,
    actionChecklist: input.checklist ?? null,
    stage4Execution: input.execution ?? null,
  });
}

describe("clean Stage 5 settlement contracts", () => {
  it("settles accepted movement into terminal mutation evidence only", () => {
    const inputFrame = frame();
    const inputChecklist = checklist(inputFrame);
    const packet = buildPacket({
      frame: inputFrame,
      checklist: inputChecklist,
      execution: stage4([movementReceipt(inputFrame, inputChecklist)], inputFrame),
    });
    const view = buildCleanNarratorView(packet);

    expect(cleanSettledTurnPacketSchema.safeParse(packet).success).toBe(true);
    expect(cleanNarratorViewSchema.safeParse(view).success).toBe(true);
    expect(packet.acceptedEvidence).toHaveLength(1);
    expect(packet.acceptedEvidence[0]).toMatchObject({
      authority: "terminal_mutation_receipt",
      claimKinds: ["player_location_change", "elapsed_time"],
    });
    expect(JSON.stringify(view)).not.toContain("player-1");
    expect(JSON.stringify(view)).not.toContain("edge-market-north");
    expect(JSON.stringify(view)).not.toContain("privateResult");
    expect(packet.acceptedEvidence[0]?.limits.doesNotProve).toContain("no-change");
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
    expect(dialogue?.backendFacts[1]?.text).toBe('Guide says: "The north stairs flooded before dawn.".');
    expect(dialogue?.limits.doesNotProve).toContain("truth of speaker claim");
    expect(dialogue?.limits.doesNotProve).toContain("durable world fact");
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
          visibleActors: ["Guide"],
          visibleFacts: ["Lanterns burn along the market stalls."],
          inventory: [],
          movementOptions: ["North Hall"],
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
          options: [{ label: "North Hall", connected: true, travelCost: 1 }],
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
    expect(elapsed?.backendFacts[0]?.text).toBe("5 minute(s) pass.");
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
    const routes = packet.acceptedEvidence.find((entry) => entry.authority === "route_options_receipt");
    expect(routes?.backendFacts[0]?.text).toBe("Route option: North Hall (connected, 1 minute(s)).");
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

    expect(() => buildPacket({ frame: inputFrame })).toThrow(/private guard/u);
  });

  it("does not invent absence or no-change evidence for direct no-receipt packets", () => {
    const packet = buildPacket();
    const serialized = JSON.stringify(packet);

    expect(packet.settlementKind).toBe("minimal_safe");
    expect(serialized).not.toMatch(/none are present|nothing changed|no routes|no one is there/iu);
    expect(packet.acceptedEvidence.some((entry) =>
      entry.claimKinds.includes("player_location_change")
      || entry.claimKinds.includes("route_status")
    )).toBe(false);
  });
});
