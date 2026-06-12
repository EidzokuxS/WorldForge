import { describe, expect, it } from "vitest";

import {
  type AuthoritativeSceneFrame,
  type CleanNarratorView,
  type CleanNarrationCandidate,
  type GameplayRuntimeTurnInput,
  type GmRead,
  type JudgeUncertainty,
} from "../gameplay-cycle-runtime/contracts.js";
import {
  buildCleanNarrationSystemPrompt,
  buildCleanNarratorPromptInput,
  renderCleanNarrationFallback,
  runCleanNarration,
  validateCleanNarrationCandidate,
} from "../gameplay-cycle-runtime/narration.js";
import { processCleanGameplayTurnFromInput } from "../gameplay-cycle-runtime/runtime.js";
import type { ProviderConfig } from "../../ai/provider-registry.js";
import type { CleanPlayerFacingTurnCommitResult } from "../gameplay-cycle-runtime/turn-persistence.js";

const provider: ProviderConfig = {
  id: "test",
  name: "Test",
  baseUrl: "https://example.invalid/v1",
  apiKey: "test-key",
  model: "test-model",
};

function movementView(overrides: Partial<CleanNarratorView> = {}): CleanNarratorView {
  return {
    version: "gameplay-runtime.narrator-view.v1",
    packetId: "cgpacket_test",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    playerAction: "I walk to North Hall.",
    responseLanguage: "match_player_action",
    preserveLabelsVerbatim: true,
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_mutation_receipt",
      claimKinds: ["player_location_change", "elapsed_time"],
      text: "Player location changed to North Hall.",
      backendFacts: [
        { factRef: "e1.f1", text: "Player location changed to North Hall.", exact: true },
        { factRef: "e1.f2", text: "Travel cost: 1 minute(s).", exact: true },
      ],
      limits: {
        proves: ["player location change", "elapsed travel time"],
        doesNotProve: ["discovery", "absence", "no-change"],
      },
    }],
    stepAuditForGrounding: [],
    guard: {
      mayCallTools: false,
      mayInferNewFacts: false,
      mayUseFailedOrSkippedAsTruth: false,
      mayNarrateNoChangeWithoutExplicitEvidence: false,
    },
    privateGuardSidecar: {
      forbiddenActorLabels: ["Hidden Watcher"],
      forbiddenPrivateTerms: ["secret chamber"],
    },
    ...overrides,
  };
}

function movementCandidate(text = "You move to North Hall."): CleanNarrationCandidate {
  return {
    version: "gameplay-runtime.clean-narration-candidate.v1",
    packetId: "cgpacket_test",
    turnId: "clean-turn-1",
    language: "en",
    sentences: [{
      kind: "accepted_evidence",
      text,
      evidenceRefs: ["e1"],
      backendFactRefs: ["e1.f1"],
      claimKinds: ["player_location_change"],
      auditStepIds: [],
    }],
    finalText: text,
  };
}

function dialogueCandidate(): CleanNarrationCandidate {
  return {
    version: "gameplay-runtime.clean-narration-candidate.v1",
    packetId: "cgpacket_test",
    turnId: "clean-turn-1",
    language: "en",
    sentences: [{
      kind: "accepted_evidence",
      text: 'Guide says: "The north stairs flooded before dawn."',
      evidenceRefs: ["e5"],
      backendFactRefs: ["e5.f2"],
      claimKinds: ["dialogue_response"],
      auditStepIds: [],
    }],
    finalText: 'Guide says: "The north stairs flooded before dawn."',
  };
}

function routeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "route_check_receipt",
      claimKinds: ["route_status"],
      text: "North Hall is reachable from Market.",
      backendFacts: [{ factRef: "e1.f1", text: "North Hall is reachable from Market.", exact: true }],
      limits: {
        proves: ["route status only"],
        doesNotProve: ["movement", "arrival", "current-scene change"],
      },
    }],
  });
}

function routeWithSceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    playerAction: "I check whether the route from Resonance Tower to Transmission Basement is open, without moving.",
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "route_check_receipt",
        claimKinds: ["route_status"],
        text: "Transmission Basement is reachable from the current scene.",
        backendFacts: [{
          factRef: "e5.f1",
          text: "Transmission Basement is reachable from the current scene.",
          exact: true,
        }],
        limits: {
          proves: ["route status only"],
          doesNotProve: ["movement", "arrival", "current-scene change", "clock advance", "no-change"],
        },
      },
    ],
  });
}

function timeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_mutation_receipt",
      claimKinds: ["elapsed_time"],
      text: "World clock advances by 5 minute(s).",
      backendFacts: [{ factRef: "e1.f1", text: "World clock advances by 5 minute(s).", exact: true }],
      limits: {
        proves: ["elapsed world clock time"],
        doesNotProve: ["no-change", "offscreen events", "NPC action", "world fact"],
      },
    }],
  });
}

function timeWithSceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    playerAction: "I wait quietly in Market for 5 minutes, without moving or touching anything.",
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "terminal_mutation_receipt",
        claimKinds: ["elapsed_time"],
        text: "World clock advances by 5 minute(s).",
        backendFacts: [{ factRef: "e5.f1", text: "World clock advances by 5 minute(s).", exact: true }],
        limits: {
          proves: ["elapsed world clock time"],
          doesNotProve: ["no-change", "offscreen events", "NPC action", "world fact"],
        },
      },
    ],
  });
}

function routeOptionsView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "route_options_receipt",
      claimKinds: ["movement_option"],
      text: "Visible route options: North Hall.",
      backendFacts: [{ factRef: "e1.f1", text: "Route option: North Hall (connected, 1 minute(s)).", exact: true }],
      limits: {
        proves: ["route options exposed by current SceneFrame"],
        doesNotProve: ["hidden routes", "absence of other routes", "movement", "discovery", "no-change"],
      },
    }],
  });
}

function sceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    playerAction: "I look around to see visible objects and exits, without moving.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "scene_frame_snapshot",
      claimKinds: ["current_scene", "current_location"],
      text: "Current scene is Market.",
      backendFacts: [
        { factRef: "e1.f1", text: "Current scene is Market.", exact: true },
        { factRef: "e1.f2", text: "Current place is Market.", exact: true },
      ],
      limits: {
        proves: ["current scene label"],
        doesNotProve: ["hidden areas", "movement", "arrival"],
      },
    }, {
      ref: "e2",
      authority: "scene_frame_snapshot",
      claimKinds: ["inventory_status"],
      text: "Courier satchel is visible in the inventory snapshot.",
      backendFacts: [{ factRef: "e2.f1", text: "Inventory item: Courier satchel.", exact: true }],
      limits: {
        proves: ["inventory item label only"],
        doesNotProve: ["item contents", "item use", "ownership transfer"],
      },
    }, {
      ref: "e3",
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_target"],
      text: "Visible current-frame targets include Notice Board.",
      backendFacts: [{ factRef: "e3.f1", text: "Visible target: Notice Board (place_handle).", exact: true }],
      limits: {
        proves: ["visible target labels exposed by the current SceneFrame snapshot"],
        doesNotProve: ["hidden targets", "movement", "arrival", "absence of other targets"],
      },
    }, {
      ref: "e4",
      authority: "scene_frame_snapshot",
      claimKinds: ["movement_option"],
      text: "Visible route options include North Hall.",
      backendFacts: [{ factRef: "e4.f1", text: "Route option: North Hall (connected, 1 minute(s)).", exact: true }],
      limits: {
        proves: ["route option labels exposed by the current SceneFrame snapshot"],
        doesNotProve: ["hidden routes", "route safety", "movement", "arrival", "absence of other routes"],
      },
    }],
  });
}

function dialogueView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_dialogue_receipt",
      claimKinds: ["dialogue_response"],
      text: 'Guide says: "The north stairs flooded before dawn."',
      backendFacts: [
        { factRef: "e1.f1", text: "Speaker: Guide.", exact: true },
        { factRef: "e1.f2", text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
        { factRef: "e1.f3", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
      ],
      limits: {
        proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
        doesNotProve: ["truth of speaker claim", "durable world fact", "NPC private knowledge beyond the utterance"],
      },
    }],
  });
}

function dialogueWithSceneFrameSnapshotView(): CleanNarratorView {
  const snapshot = sceneFrameSnapshotView().acceptedEvidence;
  return movementView({
    playerAction: 'I ask Guide, "What happened upstairs?"',
    acceptedEvidence: [
      ...snapshot,
      {
        ref: "e5",
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: 'Guide says: "The north stairs flooded before dawn."',
        backendFacts: [
          { factRef: "e5.f1", text: "Speaker: Guide.", exact: true },
          { factRef: "e5.f2", text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
          { factRef: "e5.f3", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
        ],
        limits: {
          proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
          doesNotProve: ["truth of speaker claim", "durable world fact", "movement", "arrival"],
        },
      },
    ],
  });
}

function supportActorView(): CleanNarratorView {
  return movementView({
    playerAction: "I look for a local vendor in the market.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "support_actor_materialization_receipt",
      claimKinds: ["visible_actor", "support_actor_materialization"],
      text: "Local Vendor is visible as a vendor in Market.",
      backendFacts: [
        { factRef: "e1.f1", text: "Visible support actor: Local Vendor.", exact: true },
        { factRef: "e1.f2", text: "Support role: vendor.", exact: true },
        { factRef: "e1.f3", text: "Anchor scene: Market.", exact: true },
        { factRef: "e1.f4", text: "Materialization result: created.", exact: true },
      ],
      limits: {
        proves: ["visible temporary support actor label", "ordinary support role", "current-scene materialization or reuse"],
        doesNotProve: ["dialogue content", "NPC private knowledge", "relationship change", "future relevance", "durable world fact"],
      },
    }],
  });
}

function playerLocalConditionView(): CleanNarratorView {
  return movementView({
    playerAction: "I kneel beside the stall.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "player_local_condition_receipt",
      claimKinds: ["player_local_condition"],
      text: "Player is kneeling. Current scene anchor: Market.",
      backendFacts: [
        { factRef: "e1.f1", text: "Player is kneeling.", exact: true },
        { factRef: "e1.f2", text: "Condition key: kneeling.", exact: true },
        { factRef: "e1.f3", text: "Current scene anchor: Market.", exact: true },
        { factRef: "e1.f4", text: "Condition result: applied.", exact: true },
      ],
      limits: {
        proves: ["Player current-scene local posture/readiness condition operation"],
        doesNotProve: ["HP change", "damage", "combat modifier", "movement", "dialogue content", "absence or no-change"],
      },
    }],
  });
}

function playerLocalConditionWithSceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    playerAction: "I keep both hands visible while staying in Market, without moving or touching anything.",
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "player_local_condition_receipt",
        claimKinds: ["player_local_condition"],
        text: "Player is hands visible. Current scene anchor: Market.",
        backendFacts: [
          { factRef: "e5.f1", text: "Player is hands visible.", exact: true },
          { factRef: "e5.f2", text: "Condition key: hands_visible.", exact: true },
          { factRef: "e5.f3", text: "Current scene anchor: Market.", exact: true },
          { factRef: "e5.f4", text: "Condition result: applied.", exact: true },
          { factRef: "e5.f5", text: "Condition target: Market.", exact: true },
        ],
        limits: {
          proves: ["Player current-scene local posture/readiness condition operation"],
          doesNotProve: [
            "item custody or equip state",
            "movement",
            "route truth",
            "world fact",
            "dialogue content",
            "absence or no-change beyond the accepted local condition operation",
          ],
        },
      },
    ],
  });
}

function itemStateView(): CleanNarratorView {
  return movementView({
    playerAction: "I hand the Brass Tube to Guide.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "item_transfer_receipt",
      claimKinds: ["item_state"],
      text: "Brass Tube item state changed: transferred_to_actor. Current scene anchor: Market.",
      backendFacts: [
        { factRef: "e1.f1", text: "Brass Tube item state changed: transferred_to_actor.", exact: true },
        { factRef: "e1.f2", text: "Item label: Brass Tube.", exact: true },
        { factRef: "e1.f3", text: "Operation: give_to_visible_actor.", exact: true },
        { factRef: "e1.f4", text: "Source: Player.", exact: true },
        { factRef: "e1.f5", text: "Target: Guide.", exact: true },
        { factRef: "e1.f6", text: "Final equip state: carried.", exact: true },
        { factRef: "e1.f7", text: "Current scene anchor: Market.", exact: true },
        { factRef: "e1.f8", text: "Item transfer result: transferred_to_actor.", exact: true },
      ],
      limits: {
        proves: [
          "accepted item custody/location/equip-state operation",
          "accepted item label",
          "accepted source and target labels",
          "current scene item state anchor",
        ],
        doesNotProve: [
          "item creation",
          "item discovery",
          "item inspection result",
          "item use or activation",
          "item damage or repair",
          "container contents",
          "currency or barter value",
          "NPC consent or reaction",
          "relationship change",
          "world fact",
          "route truth",
          "location reveal",
          "condition or HP change",
          "dialogue content",
          "NPC private knowledge",
          "absence or no-change beyond the accepted item state",
        ],
      },
    }],
  });
}

function itemStateWithDialogueView(): CleanNarratorView {
  return movementView({
    playerAction: 'I hand the Brass Tube to Guide and ask, "Can you hold this?"',
    acceptedEvidence: [
      ...itemStateView().acceptedEvidence,
      {
        ref: "e2",
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: 'Guide says: "The north stairs flooded before dawn."',
        backendFacts: [
          { factRef: "e2.f1", text: "Speaker: Guide.", exact: true },
          { factRef: "e2.f2", text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
          { factRef: "e2.f3", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
        ],
        limits: {
          proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
          doesNotProve: ["truth of speaker claim", "durable world fact", "NPC consent or reaction"],
        },
      },
    ],
  });
}

function minorPoiHandleView(): CleanNarratorView {
  return movementView({
    playerAction: "I mark the Tea Stall as a place to meet.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "minor_poi_handle_receipt",
      claimKinds: ["minor_poi_handle", "visible_target"],
      text: "Visible current-scene place handle created: Tea Stall. Current scene anchor: Market.",
      backendFacts: [
        { factRef: "e1.f1", text: "Visible current-scene place handle created: Tea Stall.", exact: true },
        { factRef: "e1.f2", text: "Place handle label: Tea Stall.", exact: true },
        { factRef: "e1.f3", text: "Place handle kind: stall.", exact: true },
        { factRef: "e1.f4", text: "Current scene anchor: Market.", exact: true },
        { factRef: "e1.f5", text: "Handle result: created.", exact: true },
        { factRef: "e1.f6", text: "This is a visible current-scene target handle only, not a movement destination.", exact: true },
      ],
      limits: {
        proves: [
          "accepted visible current-scene place handle label",
          "accepted place handle kind",
          "current SceneFrame target handle",
        ],
        doesNotProve: [
          "actor presence",
          "services or inventory",
          "business fact",
          "readable sign text",
          "hidden discovery",
          "search result",
          "route truth",
          "legal movement destination",
          "location reveal",
          "world fact",
          "dialogue content",
          "NPC private knowledge",
          "absence or no-change beyond the accepted visible place handle",
        ],
      },
    }],
  });
}

function localObservationView(): CleanNarratorView {
  return movementView({
    playerAction: "Do I see a Violet Astrolabe here?",
    acceptedEvidence: [{
      ref: "e1",
      authority: "local_observation_receipt",
      claimKinds: ["local_observation", "bounded_visibility_negative"],
      text: "Current visible actors and visible targets show no match for \"Violet Astrolabe\".",
      backendFacts: [
        { factRef: "e1.f1", text: "Current visible actors and visible targets show no match for \"Violet Astrolabe\".", exact: true },
        { factRef: "e1.f2", text: "Checked current visible actors and visible targets.", exact: true },
      ],
      limits: {
        proves: ["bounded no-match against enumerated current visible entries"],
        doesNotProve: [
          "hidden discovery",
          "concealed or thorough search result",
          "private facts",
          "broad absence",
          "offscreen facts",
          "future non-discoverability",
          "item use or effects",
          "item state change",
          "phone or device status",
          "route truth beyond route option/check receipts",
          "location reveal",
          "world fact",
          "dialogue content",
          "mutation",
          "no-change",
        ],
      },
    }],
  });
}

function positiveLocalObservationView(): CleanNarratorView {
  return movementView({
    playerAction: "I examine the central telegraph desk for visible marks or moving parts.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "local_observation_receipt",
      claimKinds: ["local_observation", "visible_target"],
      text: "Current visible match: visible target central telegraph desk.",
      backendFacts: [
        { factRef: "e1.f1", text: "Current visible match: visible target central telegraph desk.", exact: true },
        { factRef: "e1.f2", text: "Checked current visible targets.", exact: true },
        { factRef: "e1.f3", text: "Observed visible target central telegraph desk.", exact: true },
      ],
      limits: {
        proves: ["matching current visible entries"],
        doesNotProve: [
          "hidden discovery",
          "concealed or thorough search result",
          "private facts",
          "broad absence",
          "offscreen facts",
          "future non-discoverability",
          "item use or effects",
          "item state change",
          "phone or device status",
          "route truth beyond route option/check receipts",
          "location reveal",
          "world fact",
          "dialogue content",
          "mutation",
          "no-change",
        ],
      },
    }],
  });
}

function deviceSurfaceObservationView(): CleanNarratorView {
  return movementView({
    playerAction: "I check whether the Burner phone has a message.",
    acceptedEvidence: [{
      ref: "e1",
      authority: "device_surface_observation_receipt",
      claimKinds: ["device_surface_observation", "device_surface_unavailable"],
      text: "Current visible device surface for Burner phone exposes no requested message indicator.",
      backendFacts: [
        { factRef: "e1.f1", text: "Current visible device surface for Burner phone exposes no requested message indicator.", exact: true },
        { factRef: "e1.f2", text: "Device: Burner phone.", exact: true },
        { factRef: "e1.f3", text: "Requested surface facets: message indicator.", exact: true },
        { factRef: "e1.f4", text: "Current visible device surface exposes no requested message indicator for Burner phone.", exact: true },
      ],
      limits: {
        proves: [
          "bounded current visible device surface result for requested facets",
          "requested device label",
        ],
        doesNotProve: [
          "hidden or private message contents",
          "true absence of messages, calls, or signal",
          "message or call generation or delivery",
          "caller or sender identity",
          "instructions or mission content",
          "true network coverage",
          "device use or activation",
          "hacking or decryption",
          "item custody, location, or equip state",
          "route truth",
          "location reveal",
          "dialogue content",
          "private knowledge",
          "world fact",
          "broad absence or no-change",
          "future device state",
        ],
      },
    }],
  });
}

function turn(): GameplayRuntimeTurnInput {
  return {
    version: "gameplay-runtime.turn-input.v1",
    route: "/api/chat/action",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
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
      preTurnSnapshot: { bundleDir: "snapshot-dir", capturedAt: 1 },
    },
    providers: {
      judge: { id: "test", model: "test-model", baseUrl: null },
      storyteller: { id: "test", model: "test-model", baseUrl: null },
    },
    idempotencyKey: "campaign-1:0:0:clean-turn-1",
  };
}

function frame(): AuthoritativeSceneFrame {
  return {
    version: "scene-frame.v1",
    frameId: "frame-1",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    base: { tick: 0, worldVersion: 0, worldTimeMinutes: 0 },
    playerAction: "I look around.",
    player: {
      ref: "Player",
      label: "Mira Voss",
      visibleStatus: { hp: null, conditions: [] },
    },
    scene: {
      currentLocation: { ref: "Market", label: "Market", description: null },
      currentScene: { ref: "Market", label: "Market", description: null },
      visibleFacts: [],
      recentLocalFacts: [],
    },
    actors: [],
    movementOptions: [],
    targets: [],
    inventory: [],
    capabilities: [{ capabilityId: "observe_visible", evidenceAuthority: "observation_only", allowed: true }],
    citableRefs: ["Player", "Market"],
    privateGuards: { forbiddenActorLabels: [], forbiddenPrivateTerms: [] },
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

function gmRead(inputFrame = frame()): GmRead {
  return {
    version: "gm-read.v1",
    frameId: inputFrame.frameId,
    turnId: inputFrame.turnId,
    path: "direct",
    situationSummary: "The player observes the current visible scene.",
    liveSceneQuestion: "What can the player observe?",
    focalRefs: ["Player"],
    evidenceRefs: ["Player", "Market"],
    actionInterpretation: {
      summary: "The player observes without mutation.",
      playerIntent: "Observe the scene.",
      method: null,
      targetRefs: ["Market"],
      interactionKind: "current_scene_observation",
    },
    uncertainty: { present: false, question: null, basis: null },
    interpretationRationale: "Observation of current visible truth.",
  };
}

function judgment(inputFrame = frame(), read = gmRead(inputFrame)): JudgeUncertainty {
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
    physicalPossibility: "possible",
    checkNeed: "no_roll_needed",
    nextStep: "settle_no_roll",
    actorRefs: ["Player"],
    targetRefs: ["Market"],
    evidenceRefs: ["Player", "Market"],
    possibilityRationale: "Observation is possible.",
    checkRationale: "Visible observation needs no roll.",
    difficulty: null,
    oracleAdmission: null,
    noRollReason: {
      code: "deterministic_scene_truth",
      explanation: "The action asks for current visible truth.",
      evidenceRefs: ["Player", "Market"],
    },
  };
}

function fakeCommit(input: Parameters<typeof processCleanGameplayTurnFromInput>[0] extends never ? never : any): CleanPlayerFacingTurnCommitResult {
  return {
    record: {
      version: "gameplay-runtime.player-facing-turn-record.v1",
      runtime: "gameplay-cycle-runtime",
      route: "/api/chat/action",
      campaignId: input.turn.campaignId,
      recordId: "cgtr_fake",
      publicTurnId: "cgturn_fake",
      publicPacketId: input.settlement.settledPacket.packetId,
      internalTurnId: input.turn.turnId,
      internalFrameId: input.projection.frameId,
      idempotencyKey: input.turn.idempotencyKey,
      committedAt: 1,
      input: input.turn.playerAction,
      base: {
        tick: 0,
        worldVersion: 0,
        worldTimeMinutes: 0,
        chatHistoryLengthBeforeTurn: 0,
      },
      chat: {
        userMessageIndex: 0,
        assistantMessageIndex: 1,
        userMessageSha256: "0".repeat(64),
        assistantMessageSha256: "1".repeat(64),
      },
      terminalProjection: input.projection,
      settlement: input.settlement,
      evidenceRefs: input.evidenceRefs,
      durableEventIds: { accepted: [], produced: [] },
      doneBoundary: {
        runtime: "gameplay-cycle-runtime",
        recordId: "cgtr_fake",
        turnId: "cgturn_fake",
        packetId: input.settlement.settledPacket.packetId,
        mutationApplied: input.projection.mutationApplied,
        settled: true,
        chatHistoryLengthBeforeTurn: 0,
        chatHistoryLengthAfterTurn: 2,
        userMessageSha256: "0".repeat(64),
        assistantMessageSha256: "1".repeat(64),
      },
    },
    doneBoundary: {
      runtime: "gameplay-cycle-runtime",
      recordId: "cgtr_fake",
      turnId: "cgturn_fake",
      packetId: input.settlement.settledPacket.packetId,
      mutationApplied: input.projection.mutationApplied,
      settled: true,
      chatHistoryLengthBeforeTurn: 0,
      chatHistoryLengthAfterTurn: 2,
      userMessageSha256: "0".repeat(64),
      assistantMessageSha256: "1".repeat(64),
    },
  } as CleanPlayerFacingTurnCommitResult;
}

describe("clean Stage 6 narration contracts", () => {
  it("builds prompt input without private sidecar or raw player action", () => {
    const promptInput = buildCleanNarratorPromptInput(movementView());
    const serialized = JSON.stringify(promptInput);

    expect(serialized).not.toContain("privateGuardSidecar");
    expect(serialized).not.toContain("Hidden Watcher");
    expect(serialized).not.toContain("secret chamber");
    expect(serialized).not.toContain("I walk to North Hall.");
    expect(promptInput.language).toBe("en");
    expect(promptInput.languageSource).toBe("derived_from_player_action_without_prompting_raw_action");
    expect(promptInput.acceptedEvidence[0]?.backendFacts[0]?.factRef).toBe("e1.f1");
  });

  it("accepts model narration from accepted movement evidence", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate(),
    });

    expect(result.status).toBe("accepted");
  });

  it("rejects route_check candidates that declare movement", () => {
    const result = validateCleanNarrationCandidate({
      view: routeView(),
      candidate: movementCandidate("You move to North Hall."),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
    expect(renderCleanNarrationFallback(routeView())).not.toMatch(/\b(move|arrive|travel)\b/iu);
  });

  it("uses deterministic authority projection for route_status with snapshot context", async () => {
    const result = await runCleanNarration({
      narratorView: routeWithSceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        throw new Error("route_status should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("The settled route check confirms: Transmission Basement is reachable from the current scene.");
    expect(result.text).toContain("Transmission Basement");
    expect(result.text).not.toContain("Transmission Basin");
    expect(result.text).not.toMatch(/\b(visible paths|inventory|move|arrive|travel|nothing changed|no change)\b/iu);
  });

  it("falls back from P64 elapsed-time evidence without no-change claims", () => {
    const text = renderCleanNarrationFallback(timeView());

    expect(text).toBe("World clock advances by 5 minute(s).");
    expect(text).not.toMatch(/nothing changed|nothing happened|no visible changes|everything stayed/iu);
  });

  it("uses deterministic authority projection for standalone elapsed-time turns with snapshot context", async () => {
    const result = await runCleanNarration({
      narratorView: timeWithSceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        throw new Error("standalone elapsed_time should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("World clock advances by 5 minute(s).");
    expect(result.text).not.toMatch(/\b(remains?|still|inventory|visible routes|nothing changed|no change)\b/iu);
  });

  it("renders route-options evidence without converting options into movement", () => {
    const text = renderCleanNarrationFallback(routeOptionsView());

    expect(text).toBe("Route option: North Hall (connected, 1 minute(s)).");
    expect(text).not.toMatch(/\b(move|arrive|travel to|you go)\b/iu);
  });

  it("uses deterministic authority projection for direct scene targets and exits", async () => {
    const result = await runCleanNarration({
      narratorView: sceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        throw new Error("scene_frame_snapshot route/target facts should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("Current scene is Market. Current place is Market. Inventory item: Courier satchel. Visible target: Notice Board (place_handle). Route option: North Hall (connected, 1 minute(s)).");
    expect(result.text).not.toMatch(/\b(move|arrive|travel to|you go|hidden|absent|nothing changed|no change)\b/iu);
  });

  it("renders dialogue response evidence without promoting the quote to world truth", () => {
    const text = renderCleanNarrationFallback(dialogueView());

    expect(text).toBe('Guide says: "The north stairs flooded before dawn."');
    const promotedTruth = validateCleanNarrationCandidate({
      view: dialogueView(),
      candidate: {
        ...movementCandidate("The north stairs flooded before dawn."),
        sentences: [{
          kind: "accepted_evidence",
          text: "The north stairs flooded before dawn.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2"],
          claimKinds: ["visible_fact"],
          auditStepIds: [],
        }],
        finalText: "The north stairs flooded before dawn.",
      },
    });
    expect(promotedTruth.status).toBe("rejected");
    if (promotedTruth.status !== "rejected") throw new Error("expected rejected");
    expect(promotedTruth.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("keeps scene snapshot route and target evidence from overriding dialogue receipts", async () => {
    let called = false;
    const result = await runCleanNarration({
      narratorView: dialogueWithSceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        called = true;
        return dialogueCandidate();
      },
    });

    expect(called).toBe(true);
    expect(result.source).toBe("model");
    expect(result.text).toBe('Guide says: "The north stairs flooded before dawn."');

    const fallback = await runCleanNarration({
      narratorView: dialogueWithSceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        throw new Error("force fallback");
      },
    });

    expect(fallback.source).toBe("fallback_generation_error");
    expect(fallback.text).toBe('Guide says: "The north stairs flooded before dawn."');
  });

  it("renders support actor materialization without inventing dialogue or services", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For support_actor_materialization");
    const text = renderCleanNarrationFallback(supportActorView());

    expect(text).toBe("Visible support actor: Local Vendor. Support role: vendor. Anchor scene: Market. Materialization result: created.");
    expect(text).not.toMatch(/\bsays|offers|knows|service|future\b/iu);

    const inventedDialogue = validateCleanNarrationCandidate({
      view: supportActorView(),
      candidate: {
        ...movementCandidate("Local Vendor says: \"Fresh fruit here.\""),
        sentences: [{
          kind: "accepted_evidence",
          text: "Local Vendor says: \"Fresh fruit here.\"",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["dialogue_response"],
          auditStepIds: [],
        }],
        finalText: "Local Vendor says: \"Fresh fruit here.\"",
      },
    });
    expect(inventedDialogue.status).toBe("rejected");
    if (inventedDialogue.status !== "rejected") throw new Error("expected rejected");
    expect(inventedDialogue.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("renders Player local condition evidence without inventing HP, cover, combat, movement, or no-change", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For player_local_condition");
    const text = renderCleanNarrationFallback(playerLocalConditionView());

    expect(text).toBe("Player is kneeling. Condition key: kneeling. Current scene anchor: Market. Condition result: applied.");
    expect(text).not.toMatch(/\bhp|damage|cover|combat|moves?|nothing changed|no change\b/iu);

    const inventedHp = validateCleanNarrationCandidate({
      view: playerLocalConditionView(),
      candidate: {
        ...movementCandidate("You kneel and gain cover, taking no damage."),
        sentences: [{
          kind: "accepted_evidence",
          text: "You kneel and gain cover, taking no damage.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["player_local_condition", "condition_or_hp_change"],
          auditStepIds: [],
        }],
        finalText: "You kneel and gain cover, taking no damage.",
      },
    });
    expect(inventedHp.status).toBe("rejected");
    if (inventedHp.status !== "rejected") throw new Error("expected rejected");
    expect(inventedHp.issues.some((issue) => issue.code === "schema_invalid" || issue.code === "claim_not_supported")).toBe(true);
  });

  it("keeps player_local_condition deterministic when snapshot context includes inventory and routes", async () => {
    const result = await runCleanNarration({
      narratorView: playerLocalConditionWithSceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        throw new Error("player_local_condition should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe(
      "Player is hands visible. Condition key: hands_visible. Current scene anchor: Market. Condition result: applied. Condition target: Market.",
    );
    expect(result.text).not.toMatch(/\b(inventory|route|at hand|visible target|still|remains?|no change)\b/iu);
  });

  it("renders item_state evidence without expanding it into dialogue, discovery, use, consent, or no-change", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For item_state");
    const text = renderCleanNarrationFallback(itemStateView());

    expect(text).toBe("Brass Tube item state changed: transferred_to_actor. Item label: Brass Tube. Operation: give_to_visible_actor. Source: Player. Target: Guide. Final equip state: carried. Current scene anchor: Market. Item transfer result: transferred_to_actor.");
    expect(text).not.toMatch(/\bsays|discovers?|uses?|activates?|consents?|reacts?|nothing changed|no change\b/iu);

    for (const unsupportedClaim of [
      "dialogue_response",
      "visible_fact",
      "support_actor_materialization",
      "route_status",
      "player_local_condition",
    ] as const) {
      const result = validateCleanNarrationCandidate({
        view: itemStateView(),
        candidate: {
          ...movementCandidate("Guide accepts the Brass Tube and explains how it works."),
          sentences: [{
            kind: "accepted_evidence",
            text: "Guide accepts the Brass Tube and explains how it works.",
            evidenceRefs: ["e1"],
            backendFactRefs: ["e1.f1"],
            claimKinds: ["item_state", unsupportedClaim],
            auditStepIds: [],
          }],
          finalText: "Guide accepts the Brass Tube and explains how it works.",
        },
      });
      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") throw new Error("expected rejected");
      expect(result.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
    }
  });

  it("uses deterministic authority projection for item_state instead of model paraphrase", async () => {
    const result = await runCleanNarration({
      narratorView: itemStateView(),
      provider,
      generateCandidate: async () => {
        throw new Error("item_state should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("Brass Tube item state changed: transferred_to_actor. Item label: Brass Tube. Operation: give_to_visible_actor. Source: Player. Target: Guide. Final equip state: carried. Current scene anchor: Market. Item transfer result: transferred_to_actor.");
    expect(result.text).not.toMatch(/\bsays|accepts|reacts|consents|uses|activates|nothing changed|no change\b/iu);
  });

  it("deterministically composes item_state with accepted dialogue_response", async () => {
    const result = await runCleanNarration({
      narratorView: itemStateWithDialogueView(),
      provider,
      generateCandidate: async () => {
        throw new Error("item_state plus dialogue_response should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe('Brass Tube item state changed: transferred_to_actor. Item label: Brass Tube. Operation: give_to_visible_actor. Source: Player. Target: Guide. Final equip state: carried. Current scene anchor: Market. Item transfer result: transferred_to_actor. Guide says: "The north stairs flooded before dawn."');
    expect(result.text).toContain("Item transfer result: transferred_to_actor.");
    expect(result.text).toContain('Guide says: "The north stairs flooded before dawn."');
    expect(result.text).not.toMatch(/\baccepts|reacts|consents|uses|activates|nothing changed|no change\b/iu);
  });

  it("renders minor_poi_handle evidence without route, location, service, sign-text, or no-change claims", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For minor_poi_handle");
    const text = renderCleanNarrationFallback(minorPoiHandleView());

    expect(text).toBe("Visible current-scene place handle created: Tea Stall. Place handle label: Tea Stall. Place handle kind: stall. Current scene anchor: Market. Handle result: created. This is a visible current-scene target handle only, not a movement destination.");
    expect(text).not.toMatch(/\b(route|reachable|travel|arrive|service|inventory|sign says|nothing changed|no change)\b/iu);

    const unsupported = validateCleanNarrationCandidate({
      view: minorPoiHandleView(),
      candidate: {
        ...movementCandidate("The Tea Stall is open for business and reachable as a new destination."),
        sentences: [{
          kind: "accepted_evidence",
          text: "The Tea Stall is open for business and reachable as a new destination.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["minor_poi_handle", "route_status"],
          auditStepIds: [],
        }],
        finalText: "The Tea Stall is open for business and reachable as a new destination.",
      },
    });
    expect(unsupported.status).toBe("rejected");
    if (unsupported.status !== "rejected") throw new Error("expected rejected");
    expect(unsupported.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("uses deterministic authority projection for minor_poi_handle instead of model paraphrase", async () => {
    const result = await runCleanNarration({
      narratorView: minorPoiHandleView(),
      provider,
      generateCandidate: async () => {
        throw new Error("minor_poi_handle should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toContain("Visible current-scene place handle created: Tea Stall.");
    expect(result.text).not.toMatch(/route|reachable|travel|service|inventory|sign says|nothing changed|no change/iu);
  });

  it("renders local_observation evidence without broad absence, discovery, route truth, device status, or no-change", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For local_observation");
    const text = renderCleanNarrationFallback(localObservationView());

    expect(text).toBe("Current visible actors and visible targets show no match for \"Violet Astrolabe\".");
    expect(text).not.toMatch(/\b(SceneFrame|worldVersion|surface entry)\b/u);
    expect(text).not.toMatch(/\b(absent|does not exist|nowhere|discover|route|phone|device|nothing changed|no change)\b/iu);

    const unsupported = validateCleanNarrationCandidate({
      view: localObservationView(),
      candidate: {
        ...movementCandidate("The Violet Astrolabe is absent from the market."),
        sentences: [{
          kind: "accepted_evidence",
          text: "The Violet Astrolabe is absent from the market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["local_observation", "visible_fact"],
          auditStepIds: [],
        }],
        finalText: "The Violet Astrolabe is absent from the market.",
      },
    });
    expect(unsupported.status).toBe("rejected");
    if (unsupported.status !== "rejected") throw new Error("expected rejected");
    expect(unsupported.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("deterministically projects positive local_observation without copying request details", async () => {
    const result = await runCleanNarration({
      narratorView: positiveLocalObservationView(),
      provider,
      generateCandidate: async () => {
        throw new Error("local_observation should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe(
      "Current visible match: visible target central telegraph desk. Observed visible target central telegraph desk.",
    );
    expect(result.text).not.toMatch(/SceneFrame|worldVersion|visible marks|moving parts|touch|move/iu);
  });

  it("deterministically projects local_observation movement options without hidden placeholders", async () => {
    const routeSummary = "Current route options include: North Hall, East Gate, South Dock, West Yard, Bell Tower, Lantern Row, The Copper Tap, Upper Dam Ruins.";
    const result = await runCleanNarration({
      narratorView: movementView({
        playerAction: "I look around for visible routes.",
        acceptedEvidence: [{
          ref: "e1",
          authority: "local_observation_receipt",
          claimKinds: ["local_observation"],
          text: routeSummary,
          backendFacts: [
            { factRef: "e1.f1", text: routeSummary, exact: true },
            { factRef: "e1.f2", text: "Checked current route options.", exact: true },
            { factRef: "e1.f3", text: "Observed route option North Hall.", exact: true },
          ],
          limits: {
            proves: ["matching exposed current SceneFrame observation surface entries"],
            doesNotProve: ["route truth beyond route option/check receipts", "movement", "no-change"],
          },
        }],
      }),
      provider,
      generateCandidate: async () => {
        throw new Error("local_observation should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe(`${routeSummary} Observed route option North Hall.`);
    expect(result.text).toContain("The Copper Tap");
    expect(result.text).toContain("Upper Dam Ruins");
    expect(result.text).not.toContain("[hidden]");
    expect(result.text).not.toContain("movement_option");
    expect(result.text).not.toContain("visible_target");
    expect(result.text).not.toContain("SceneFrame");
  });

  it("renders device_surface_observation evidence without private messages, no-signal, no-message, or no-change claims", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For device_surface_observation");
    const text = renderCleanNarrationFallback(deviceSurfaceObservationView());

    expect(text).toBe("Current visible device surface for Burner phone exposes no requested message indicator. Device: Burner phone. Requested surface facets: message indicator. Current visible device surface exposes no requested message indicator for Burner phone.");
    expect(text).not.toMatch(/frame\/worldVersion|message_indicator|private message|no messages|no calls|no signal|nothing changed|no change|instructions|network/iu);

    const unsupported = validateCleanNarrationCandidate({
      view: deviceSurfaceObservationView(),
      candidate: {
        ...movementCandidate("The Burner phone has no new messages and no signal."),
        sentences: [{
          kind: "accepted_evidence",
          text: "The Burner phone has no new messages and no signal.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["device_surface_observation", "visible_fact"],
          auditStepIds: [],
        }],
        finalText: "The Burner phone has no new messages and no signal.",
      },
    });
    expect(unsupported.status).toBe("rejected");
    if (unsupported.status !== "rejected") throw new Error("expected rejected");
    expect(unsupported.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("uses deterministic authority projection for device_surface_observation instead of model paraphrase", async () => {
    const result = await runCleanNarration({
      narratorView: deviceSurfaceObservationView(),
      provider,
      generateCandidate: async () => {
        throw new Error("device_surface_observation should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toContain("Current visible device surface");
    expect(result.text).not.toMatch(/frame\/worldVersion|message_indicator|no messages|no calls|no signal|nothing changed|no change|instructions|network/iu);
  });

  it("keeps failed and skipped audit notices from becoming world truth", () => {
    const view = movementView({
      acceptedEvidence: [],
      stepAuditForGrounding: [{
        stepId: "step-1",
        status: "failed",
        publicReason: "Movement was not accepted.",
        mayUseAsWorldTruth: false,
      }],
    });
    const result = validateCleanNarrationCandidate({
      view,
      candidate: {
        ...movementCandidate("You move to North Hall."),
        sentences: [{
          kind: "audit_notice",
          text: "You move to North Hall.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["player_location_change"],
          auditStepIds: ["step-1"],
        }],
      },
    });

    expect(result.status).toBe("rejected");
    expect(renderCleanNarrationFallback(view)).toContain("not confirmed");
  });

  it("rejects private, backend, old-runtime, and oracle adapter leaks", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate("You move to location:secret after roll reasoning."),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "backend_ref",
      "old_runtime_marker",
    ]));
  });

  it("falls back on generation failure without no-change narration", async () => {
    const result = await runCleanNarration({
      narratorView: movementView(),
      provider,
      generateCandidate: async () => {
        throw new Error("model offline");
      },
    });

    expect(result.source).toBe("fallback_generation_error");
    expect(result.text).toBe("You move to North Hall.");
    expect(result.text).not.toMatch(/nothing changed|nothing happened|no visible changes|you remain/iu);
  });

  it("uses Russian ordinary prose while preserving English accepted labels", async () => {
    const result = await runCleanNarration({
      narratorView: movementView({
        playerAction: "Я иду в The Copper Tap.",
        acceptedEvidence: [{
          ...movementView().acceptedEvidence[0]!,
          text: "Player location changed to The Copper Tap.",
          backendFacts: [
            { factRef: "e1.f1", text: "Player location changed to The Copper Tap.", exact: true },
          ],
        }],
      }),
      provider,
      generateCandidate: async () => {
        throw new Error("force fallback");
      },
    });

    expect(result.text).toBe("Вы перемещаетесь в The Copper Tap.");
  });

  it("documents that raw player action is intentionally omitted from the system prompt", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("raw player action is intentionally omitted");
  });

  it("composes runtime through Stage 6 with only CleanNarratorView input", async () => {
    const inputFrame = frame();
    const read = gmRead(inputFrame);
    const eventTypes: string[] = [];
    const stages: string[] = [];
    const narrationInputs: unknown[] = [];

    for await (const event of processCleanGameplayTurnFromInput({
      turn: turn(),
      judgeProvider: provider,
      storytellerProvider: provider,
      buildFrame: async () => inputFrame,
      gmReadCandidateGenerator: async () => read,
      judgeUncertaintyCandidateGenerator: async () => judgment(inputFrame, read),
      runNarration: async (input) => {
        narrationInputs.push(input);
        return {
          version: "gameplay-runtime.clean-narration-result.v1",
          packetId: input.narratorView.packetId,
          turnId: input.narratorView.turnId,
          text: "Current scene is Market.",
          source: "model",
          validationIssues: [],
        };
      },
      commitTurn: async (input) => fakeCommit(input),
    })) {
      eventTypes.push(event.type);
      if (event.type === "scene-settling" && typeof event.data === "object" && event.data) {
        const stage = (event.data as { stage?: unknown }).stage;
        if (typeof stage === "string") stages.push(stage);
      }
    }

    expect(stages).toEqual(["scene-frame", "gm-read", "judge-uncertainty", "settled-turn-packet"]);
    expect(eventTypes).toEqual([
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "scene-settling",
      "narrative",
      "finalizing_turn",
      "done",
    ]);
    expect(narrationInputs).toHaveLength(1);
    expect(JSON.stringify(narrationInputs[0])).toContain("narratorView");
    expect(JSON.stringify(narrationInputs[0])).not.toContain("receipts");
    expect(JSON.stringify(narrationInputs[0])).not.toContain("checklist");
  });
});
