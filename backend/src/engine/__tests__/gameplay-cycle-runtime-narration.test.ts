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
  buildCleanNarrationPrompt,
  buildCleanNarrationSystemPrompt,
  buildCleanNarratorPromptInput,
  CleanNarrationGenerationError,
  renderCleanAuthorityProjection,
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

type NarrationClaimKind = CleanNarratorView["acceptedEvidence"][number]["claimKinds"][number];

function pageMoveRefsForSentence(
  view: CleanNarratorView,
  evidenceRefs: readonly string[],
  backendFactRefs: readonly string[],
): string[] {
  const promptInput = buildCleanNarratorPromptInput(view);
  const sentencePlanRefs = sentencePlanRefsForSentence(view, evidenceRefs, backendFactRefs);
  const planOwnedMoveRefs = promptInput.narrativePageTask.sentencePlan
    .filter((step) => sentencePlanRefs.includes(step.sentenceRef))
    .map((step) => step.moveRef);
  if (planOwnedMoveRefs.length > 0) return Array.from(new Set(planOwnedMoveRefs));

  return promptInput.narrativePageTask.moves
    .filter((move) =>
      evidenceRefs.some((ref) => move.entryRefs.includes(ref))
      || backendFactRefs.some((ref) => move.allowedBackendFactRefs.includes(ref))
    )
    .map((move) => move.moveRef);
}

function sentencePlanRefsForSentence(
  view: CleanNarratorView,
  evidenceRefs: readonly string[],
  backendFactRefs: readonly string[],
): string[] {
  const sentencePlan = buildCleanNarratorPromptInput(view).narrativePageTask.sentencePlan;
  const preferredMatches = sentencePlan
    .filter((step) => backendFactRefs.some((ref) => step.preferredBackendFactRefs.includes(ref)));
  const matches = preferredMatches.length > 0
    ? preferredMatches
    : sentencePlan.filter((step) => evidenceRefs.some((ref) => step.entryRefs.includes(ref)));
  return matches.map((step) => step.sentenceRef);
}

function promptBackendFactsForRefs(
  promptInput: ReturnType<typeof buildCleanNarratorPromptInput>,
  refs: readonly string[],
) {
  const refSet = new Set(refs);
  return promptInput.acceptedEvidence
    .filter((evidence) => refSet.has(evidence.ref))
    .flatMap((evidence) => evidence.backendFacts);
}

function movementView(overrides: Partial<CleanNarratorView> = {}): CleanNarratorView {
  return {
    version: "gameplay-runtime.narrator-view.v1",
    packetId: "cgpacket_test",
    campaignId: "campaign-1",
    turnId: "clean-turn-1",
    responseLanguage: "match_player_action",
    language: "en",
    languageSource: "derived_from_player_action_without_prompting_raw_action",
    preserveLabelsVerbatim: true,
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_mutation_receipt",
      claimKinds: ["player_location_change", "elapsed_time"],
      text: "After 1 minute, you reach North Hall.",
      backendFacts: [
        { factRef: "e1.f1", role: "travel_beat", value: "After 1 minute, you reach North Hall.", text: "Travel beat: After 1 minute, you reach North Hall.", exact: true },
        { factRef: "e1.f2", role: "destination_label", value: "North Hall", text: "Destination label: North Hall.", exact: true },
        { factRef: "e1.f3", role: "elapsed_travel_time", value: "1 minute", text: "Elapsed travel time: 1 minute.", exact: true },
        { factRef: "e1.f4", role: "current_place_after_movement", value: "North Hall", text: "Current place after movement: North Hall.", exact: true },
      ],
      limits: {
        proves: ["player location change", "elapsed travel time", "movement result phrasing for the player"],
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

function movementCandidate(
  text = "After one minute, you reach North Hall.",
  view = movementView(),
): CleanNarrationCandidate {
  const evidenceRefs = ["e1"];
  const backendFactRefs = ["e1.f1", "e1.f2", "e1.f3", "e1.f4"];
  return {
    version: "gameplay-runtime.clean-narration-candidate.v1",
    packetId: "cgpacket_test",
    turnId: "clean-turn-1",
    language: view.language,
    sentences: [{
      kind: "accepted_evidence",
      text,
      evidenceRefs,
      backendFactRefs,
      claimKinds: ["player_location_change", "elapsed_time"],
      pageMoveRefs: pageMoveRefsForSentence(view, evidenceRefs, backendFactRefs),
      sentencePlanRefs: sentencePlanRefsForSentence(view, evidenceRefs, backendFactRefs),
      auditStepIds: [],
    }],
    finalText: text,
  };
}

function acceptedCandidate(
  view: CleanNarratorView,
  sentences: Array<{
    text: string;
    evidenceRefs: string[];
    backendFactRefs: string[];
    claimKinds: NarrationClaimKind[];
    pageMoveRefs?: string[];
    sentencePlanRefs?: string[];
  }>,
): CleanNarrationCandidate {
  return {
    version: "gameplay-runtime.clean-narration-candidate.v1",
    packetId: view.packetId,
    turnId: view.turnId,
    language: view.language,
    sentences: sentences.map((sentence) => ({
      kind: "accepted_evidence",
      text: sentence.text,
      evidenceRefs: sentence.evidenceRefs,
      backendFactRefs: sentence.backendFactRefs,
      claimKinds: sentence.claimKinds,
      pageMoveRefs: sentence.pageMoveRefs
        ?? pageMoveRefsForSentence(view, sentence.evidenceRefs, sentence.backendFactRefs),
      sentencePlanRefs: sentence.sentencePlanRefs
        ?? sentencePlanRefsForSentence(view, sentence.evidenceRefs, sentence.backendFactRefs),
      auditStepIds: [],
    })),
    finalText: sentences.map((sentence) => sentence.text).join(" "),
  };
}

function routeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "route_check_receipt",
      claimKinds: ["route_status"],
      text: "From here, the path to North Hall is open.",
      backendFacts: [
        { factRef: "e1.f1", role: "route_beat", value: "From here, the path to North Hall is open.", text: "Route beat: From here, the path to North Hall is open.", exact: true },
        { factRef: "e1.f2", role: "route_label", value: "North Hall", text: "Route label: North Hall.", exact: true },
        { factRef: "e1.f3", role: "route_status", value: "connected", text: "Route status: connected.", exact: true },
      ],
      limits: {
        proves: ["route status only", "route status phrasing for the player"],
        doesNotProve: ["movement", "arrival", "current-scene change"],
      },
    }],
  });
}

function routeWithSceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "route_check_receipt",
        claimKinds: ["route_status"],
        text: "From here, the path to Transmission Basement is open.",
        backendFacts: [{
          factRef: "e5.f1",
          role: "route_beat",
          value: "From here, the path to Transmission Basement is open.",
          text: "Route beat: From here, the path to Transmission Basement is open.",
          exact: true,
        }, {
          factRef: "e5.f2",
          role: "route_label",
          value: "Transmission Basement",
          text: "Route label: Transmission Basement.",
          exact: true,
        }, {
          factRef: "e5.f3",
          role: "route_status",
          value: "connected",
          text: "Route status: connected.",
          exact: true,
        }],
        limits: {
          proves: ["route status only", "route status phrasing for the player"],
          doesNotProve: ["movement", "arrival", "current-scene change", "clock advance", "no-change"],
        },
      },
    ],
  });
}

function routeWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...routeView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function timeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "terminal_mutation_receipt",
      claimKinds: ["elapsed_time"],
      text: "5 minutes pass.",
      backendFacts: [
        { factRef: "e1.f1", role: "time_beat", value: "5 minutes pass.", text: "Time beat: 5 minutes pass.", exact: true },
        { factRef: "e1.f2", role: "elapsed_time", value: "5 minutes", text: "Elapsed time: 5 minutes.", exact: true },
      ],
      limits: {
        proves: ["elapsed world clock time", "time passage phrasing for the player"],
        doesNotProve: ["no-change", "offscreen events", "NPC action", "world fact"],
      },
    }],
  });
}

function oracleOutcomeView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "oracle_visible_outcome",
      claimKinds: ["oracle_outcome"],
      text: "The loose grate holds under your weight.",
      backendFacts: [
        {
          factRef: "e1.f1",
          role: "oracle_selected_meaning",
          value: "The loose grate holds under your weight.",
          text: "The loose grate holds under your weight.",
          exact: true,
        },
      ],
      limits: {
        proves: ["selected visible uncertainty outcome"],
        doesNotProve: [
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
        ],
      },
    }],
  });
}

function timeWithSceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "terminal_mutation_receipt",
        claimKinds: ["elapsed_time"],
        text: "5 minutes pass.",
        backendFacts: [
          { factRef: "e5.f1", role: "time_beat", value: "5 minutes pass.", text: "Time beat: 5 minutes pass.", exact: true },
          { factRef: "e5.f2", role: "elapsed_time", value: "5 minutes", text: "Elapsed time: 5 minutes.", exact: true },
        ],
        limits: {
          proves: ["elapsed world clock time", "time passage phrasing for the player"],
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
      text: "From Market, visible route choices are North Hall (1 minute).",
      backendFacts: [
        { factRef: "e1.f1", role: "route_choices_beat", value: "From Market, visible route choices are North Hall (1 minute).", text: "Route choices beat: From Market, visible route choices are North Hall (1 minute).", exact: true },
        { factRef: "e1.f2", role: "route_origin", value: "Market", text: "Route origin: Market.", exact: true },
        { factRef: "e1.f3", role: "route_choice_labels", value: "North Hall", text: "Route choice labels: North Hall.", exact: true },
        { factRef: "e1.f4", role: "open_route_labels", value: "North Hall", text: "Open route labels: North Hall.", exact: true },
        { factRef: "e1.f5", role: "closed_route_labels", value: "none", text: "Closed route labels: none.", exact: true },
        { factRef: "e1.f6", role: "route_choice_travel_costs", value: "North Hall: 1 minute", text: "Route choice travel costs: North Hall: 1 minute.", exact: true },
      ],
      limits: {
        proves: ["route options exposed by current SceneFrame", "route choice phrasing for the player"],
        doesNotProve: ["hidden routes", "absence of other routes", "movement", "discovery", "no-change"],
      },
    }],
  });
}

function timeWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
      {
        ref: "e5",
        authority: "terminal_mutation_receipt",
        claimKinds: ["elapsed_time"],
        text: "5 minutes pass.",
        backendFacts: [
          { factRef: "e5.f1", role: "time_beat", value: "5 minutes pass.", text: "Time beat: 5 minutes pass.", exact: true },
          { factRef: "e5.f2", role: "elapsed_time", value: "5 minutes", text: "Elapsed time: 5 minutes.", exact: true },
        ],
        limits: {
          proves: ["elapsed world clock time", "time passage phrasing for the player"],
          doesNotProve: ["no-change", "offscreen events", "NPC action", "world fact"],
        },
      },
    ],
  });
}

function routeOptionsManyView(): CleanNarratorView {
  const labels = [
    "Anchor Chain Pylon",
    "Auditor Spire",
    "Charter Gallery",
    "Resonance Tower",
    "Silt Warrens",
    "Slip Twelve Berth",
    "The Copper Tap",
    "Upper Dam Ruins",
  ];
  const routeChoicesBeat = `From Lowwater Bazaar, visible route choices are ${labels.map((label) => `${label} (1 minute)`).join(", ")}.`;
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "route_options_receipt",
      claimKinds: ["movement_option"],
      text: routeChoicesBeat,
      backendFacts: [
        { factRef: "e1.f1", role: "route_choices_beat", value: routeChoicesBeat, text: `Route choices beat: ${routeChoicesBeat}`, exact: true },
        { factRef: "e1.f2", role: "route_origin", value: "Lowwater Bazaar", text: "Route origin: Lowwater Bazaar.", exact: true },
        { factRef: "e1.f3", role: "route_choice_labels", value: labels.join("; "), text: `Route choice labels: ${labels.join("; ")}.`, exact: true },
        { factRef: "e1.f4", role: "open_route_labels", value: labels.join("; "), text: `Open route labels: ${labels.join("; ")}.`, exact: true },
        { factRef: "e1.f5", role: "closed_route_labels", value: "none", text: "Closed route labels: none.", exact: true },
        { factRef: "e1.f6", role: "route_choice_travel_costs", value: labels.map((label) => `${label}: 1 minute`).join("; "), text: `Route choice travel costs: ${labels.map((label) => `${label}: 1 minute`).join("; ")}.`, exact: true },
      ],
      limits: {
        proves: ["route options exposed by current SceneFrame", "route choice phrasing for the player"],
        doesNotProve: ["hidden routes", "absence of other routes", "movement", "discovery", "no-change"],
      },
    }],
  });
}

function sceneTextureEvidence(ref = "e2"): CleanNarratorView["acceptedEvidence"][number] {
  return {
    ref,
    authority: "scene_frame_snapshot",
    claimKinds: ["scene_texture"],
    text: "Current scene texture: Canvas awnings hang over the market lanes. Rain taps the brass gutters.",
    backendFacts: [
      {
        factRef: `${ref}.f1`,
        role: "scene_texture",
        value: "Canvas awnings hang over the market lanes",
        text: "Scene texture: Canvas awnings hang over the market lanes.",
        exact: true,
      },
      {
        factRef: `${ref}.f2`,
        role: "scene_texture",
        value: "Rain taps the brass gutters",
        text: "Scene texture: Rain taps the brass gutters.",
        exact: true,
      },
    ],
    limits: {
      proves: ["public current-scene description texture"],
      doesNotProve: ["route truth", "movement", "actor presence", "NPC action", "item state", "discovery", "absence", "no-change"],
    },
  };
}

function threeFrameSceneTextureEvidence(ref = "e2"): CleanNarratorView["acceptedEvidence"][number] {
  return {
    ref,
    authority: "scene_frame_snapshot",
    claimKinds: ["scene_texture"],
    text: "Current scene texture: Canvas awnings hang over the market lanes. Rain taps the brass gutters. Lantern smoke gathers under the bridge.",
    backendFacts: [
      {
        factRef: `${ref}.f1`,
        role: "scene_texture",
        value: "Canvas awnings hang over the market lanes",
        text: "Scene texture: Canvas awnings hang over the market lanes.",
        exact: true,
      },
      {
        factRef: `${ref}.f2`,
        role: "scene_texture",
        value: "Rain taps the brass gutters",
        text: "Scene texture: Rain taps the brass gutters.",
        exact: true,
      },
      {
        factRef: `${ref}.f3`,
        role: "scene_texture",
        value: "Lantern smoke gathers under the bridge",
        text: "Scene texture: Lantern smoke gathers under the bridge.",
        exact: true,
      },
    ],
    limits: {
      proves: ["public current-scene description texture"],
      doesNotProve: ["route truth", "movement", "actor presence", "NPC action", "item state", "discovery", "absence", "no-change"],
    },
  };
}

function replaceAcceptedEvidence(
  view: CleanNarratorView,
  replacement: CleanNarratorView["acceptedEvidence"][number],
): CleanNarratorView {
  return {
    ...view,
    acceptedEvidence: view.acceptedEvidence.map((evidence) =>
      evidence.ref === replacement.ref ? replacement : evidence
    ),
  };
}

function currentSceneAnchorEvidence(ref = "e3"): CleanNarratorView["acceptedEvidence"][number] {
  return {
    ref,
    authority: "scene_frame_snapshot",
    claimKinds: ["current_scene", "current_location"],
    text: "You are at Market.",
    backendFacts: [
      { factRef: `${ref}.f1`, role: "scene_placement", value: "You are at Market.", text: "Scene placement: You are at Market.", exact: true },
      { factRef: `${ref}.f2`, role: "scene_label", value: "Market", text: "Scene label: Market.", exact: true },
      { factRef: `${ref}.f3`, role: "place_label", value: "Market", text: "Place label: Market.", exact: true },
    ],
    limits: {
      proves: ["current scene label"],
      doesNotProve: ["hidden areas", "movement", "arrival"],
    },
  };
}

function routeOptionsWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...routeOptionsView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function movementWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...movementView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function clarificationWithSceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "clarification_request",
      claimKinds: ["clarification_request"],
      text: "Clarification needed: Which visible person should receive the item?",
      backendFacts: [{
        factRef: "e1.f1",
        role: "clarification_request",
        value: "Which visible person should receive the item?",
        text: "Clarification request: Which visible person should receive the item?",
        exact: true,
      }],
      limits: {
        proves: ["player clarification is required before resolving this action", "clarification question text"],
        doesNotProve: ["movement", "item state", "dialogue response", "world fact", "absence", "no-change"],
      },
    }, {
      ref: "e2",
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_target"],
      text: "Targets in view here include Guide, Courier.",
      backendFacts: [
        { factRef: "e2.f1", role: "visible_target_labels", value: "Guide; Courier", text: "Visible target labels: Guide; Courier.", exact: true },
        { factRef: "e2.f2", role: "visible_actor_target_labels", value: "Guide; Courier", text: "Visible actor target labels: Guide; Courier.", exact: true },
      ],
      limits: {
        proves: ["visible current-scene target labels"],
        doesNotProve: ["hidden targets", "discovery", "movement", "item state"],
      },
    }],
  });
}

function sceneFrameSnapshotView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "scene_frame_snapshot",
      claimKinds: ["current_scene", "current_location"],
      text: "You are at Market.",
      backendFacts: [
        { factRef: "e1.f1", role: "scene_placement", value: "You are at Market.", text: "Scene placement: You are at Market.", exact: true },
        { factRef: "e1.f2", role: "scene_label", value: "Market", text: "Scene label: Market.", exact: true },
        { factRef: "e1.f3", role: "place_label", value: "Market", text: "Place label: Market.", exact: true },
      ],
      limits: {
        proves: ["current scene label"],
        doesNotProve: ["hidden areas", "movement", "arrival"],
      },
    }, {
      ref: "e2",
      authority: "scene_frame_snapshot",
      claimKinds: ["inventory_status"],
      text: "You have Courier satchel with you.",
      backendFacts: [
        { factRef: "e2.f1", role: "inventory_status_beat", value: "You have Courier satchel with you.", text: "Inventory status beat: You have Courier satchel with you.", exact: true },
        { factRef: "e2.f2", role: "inventory_labels", value: "Courier satchel", text: "Inventory labels: Courier satchel.", exact: true },
      ],
      limits: {
        proves: ["inventory item is with the player"],
        doesNotProve: ["item handling", "item readiness", "item contents", "item use", "ownership transfer"],
      },
    }, {
      ref: "e3",
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_target"],
      text: "Targets in view here include Notice Board.",
      backendFacts: [
        { factRef: "e3.f1", role: "visible_target_labels", value: "Notice Board", text: "Visible target labels: Notice Board.", exact: true },
        { factRef: "e3.f2", role: "visible_place_handle_target_labels", value: "Notice Board", text: "Visible place-handle target labels: Notice Board.", exact: true },
      ],
      limits: {
        proves: ["visible target labels exposed by the current SceneFrame snapshot"],
        doesNotProve: ["hidden targets", "movement", "arrival", "absence of other targets"],
      },
    }, {
      ref: "e4",
      authority: "scene_frame_snapshot",
      claimKinds: ["movement_option"],
      text: "From Market, visible route choices are North Hall (1 minute).",
      backendFacts: [
        { factRef: "e4.f1", role: "route_choices_beat", value: "From Market, visible route choices are North Hall (1 minute).", text: "Route choices beat: From Market, visible route choices are North Hall (1 minute).", exact: true },
        { factRef: "e4.f2", role: "route_origin", value: "Market", text: "Route origin: Market.", exact: true },
        { factRef: "e4.f3", role: "route_choice_labels", value: "North Hall", text: "Route choice labels: North Hall.", exact: true },
        { factRef: "e4.f4", role: "open_route_labels", value: "North Hall", text: "Open route labels: North Hall.", exact: true },
        { factRef: "e4.f5", role: "closed_route_labels", value: "none", text: "Closed route labels: none.", exact: true },
        { factRef: "e4.f6", role: "route_choice_travel_costs", value: "North Hall: 1 minute", text: "Route choice travel costs: North Hall: 1 minute.", exact: true },
      ],
      limits: {
        proves: ["route option labels exposed by the current SceneFrame snapshot", "route choice phrasing for the player"],
        doesNotProve: ["hidden routes", "route safety", "movement", "arrival", "absence of other routes"],
      },
    }],
  });
}

function sceneFrameSnapshotWithTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      sceneTextureEvidence("e5"),
      ...sceneFrameSnapshotView().acceptedEvidence,
    ],
  });
}

function sceneFrameSnapshotWithOverlappingTargetsView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "scene_frame_snapshot",
      claimKinds: ["current_scene", "current_location"],
      text: "You are at Market.",
      backendFacts: [
        { factRef: "e1.f1", role: "scene_placement", value: "You are at Market.", text: "Scene placement: You are at Market.", exact: true },
        { factRef: "e1.f2", role: "scene_label", value: "Market", text: "Scene label: Market.", exact: true },
        { factRef: "e1.f3", role: "place_label", value: "Market", text: "Place label: Market.", exact: true },
      ],
      limits: {
        proves: ["current scene label"],
        doesNotProve: ["hidden areas", "movement", "arrival"],
      },
    }, {
      ref: "e2",
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_actor"],
      text: "Guide is in view here.",
      backendFacts: [{ factRef: "e2.f1", role: "visible_actor_labels", value: "Guide", text: "Visible actor labels: Guide.", exact: true }],
      limits: {
        proves: ["actor visible in the current scene"],
        doesNotProve: ["actor private knowledge", "actor intent", "future actor action"],
      },
    }, {
      ref: "e3",
      authority: "scene_frame_snapshot",
      claimKinds: ["inventory_status"],
      text: "You have Courier satchel with you.",
      backendFacts: [
        { factRef: "e3.f1", role: "inventory_status_beat", value: "You have Courier satchel with you.", text: "Inventory status beat: You have Courier satchel with you.", exact: true },
        { factRef: "e3.f2", role: "inventory_labels", value: "Courier satchel", text: "Inventory labels: Courier satchel.", exact: true },
      ],
      limits: {
        proves: ["inventory item is with the player"],
        doesNotProve: ["item handling", "item readiness", "item contents", "item use", "ownership transfer"],
      },
    }, {
      ref: "e4",
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_target"],
      text: "Targets in view here include Guide, Courier satchel, North Hall, Brass Tube, Notice Board.",
      backendFacts: [
        { factRef: "e4.f1", role: "visible_target_labels", value: "Guide; Courier satchel; North Hall; Brass Tube; Notice Board", text: "Visible target labels: Guide; Courier satchel; North Hall; Brass Tube; Notice Board.", exact: true },
        { factRef: "e4.f2", role: "visible_actor_target_labels", value: "Guide", text: "Visible actor target labels: Guide.", exact: true },
        { factRef: "e4.f3", role: "visible_item_target_labels", value: "Courier satchel; Brass Tube", text: "Visible item target labels: Courier satchel; Brass Tube.", exact: true },
        { factRef: "e4.f4", role: "visible_place_handle_target_labels", value: "Notice Board", text: "Visible place-handle target labels: Notice Board.", exact: true },
        { factRef: "e4.f5", role: "visible_location_target_labels", value: "North Hall", text: "Visible location target labels: North Hall.", exact: true },
      ],
      limits: {
        proves: ["visible current-scene target labels"],
        doesNotProve: ["hidden targets", "movement", "arrival", "absence of other targets"],
      },
    }, {
      ref: "e5",
      authority: "scene_frame_snapshot",
      claimKinds: ["movement_option"],
      text: "From Market, visible route choices are North Hall (1 minute).",
      backendFacts: [
        { factRef: "e5.f1", role: "route_choices_beat", value: "From Market, visible route choices are North Hall (1 minute).", text: "Route choices beat: From Market, visible route choices are North Hall (1 minute).", exact: true },
        { factRef: "e5.f2", role: "route_origin", value: "Market", text: "Route origin: Market.", exact: true },
        { factRef: "e5.f3", role: "route_choice_labels", value: "North Hall", text: "Route choice labels: North Hall.", exact: true },
        { factRef: "e5.f4", role: "open_route_labels", value: "North Hall", text: "Open route labels: North Hall.", exact: true },
        { factRef: "e5.f5", role: "closed_route_labels", value: "none", text: "Closed route labels: none.", exact: true },
        { factRef: "e5.f6", role: "route_choice_travel_costs", value: "North Hall: 1 minute", text: "Route choice travel costs: North Hall: 1 minute.", exact: true },
      ],
      limits: {
        proves: ["route option labels exposed by the current SceneFrame snapshot", "route choice phrasing for the player"],
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
        { factRef: "e1.f1", role: "speaker_label", text: "Speaker: Guide.", exact: true },
        { factRef: "e1.f2", role: "dialogue_quote", value: 'Guide says: "The north stairs flooded before dawn."', text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
        { factRef: "e1.f3", role: "dialogue_summary", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
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
    acceptedEvidence: [
      ...snapshot,
      {
        ref: "e5",
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: 'Guide says: "The north stairs flooded before dawn."',
        backendFacts: [
          { factRef: "e5.f1", role: "speaker_label", text: "Speaker: Guide.", exact: true },
          { factRef: "e5.f2", role: "dialogue_quote", value: 'Guide says: "The north stairs flooded before dawn."', text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
          { factRef: "e5.f3", role: "dialogue_summary", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
        ],
        limits: {
          proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
          doesNotProve: ["truth of speaker claim", "durable world fact", "movement", "arrival"],
        },
      },
    ],
  });
}

function modelNarrationView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "scene_frame_snapshot",
      claimKinds: ["visible_fact"],
      text: "Guide stands nearby.",
      backendFacts: [
        { factRef: "e1.f1", role: "visible_scene_facts", value: "Guide stands nearby", text: "Visible scene facts: Guide stands nearby.", exact: true },
      ],
      limits: {
        proves: ["accepted visible fact"],
        doesNotProve: ["movement", "item state", "dialogue content"],
      },
    }],
  });
}

function supportActorView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "support_actor_materialization_receipt",
      claimKinds: ["visible_actor", "support_actor_materialization"],
      text: "Local Vendor is now in view at Market as a vendor.",
      backendFacts: [
        { factRef: "e1.f1", role: "support_actor_presence", value: "Local Vendor is now in view at Market as a vendor.", text: "Local Vendor is now in view at Market as a vendor.", exact: true },
        { factRef: "e1.f2", role: "visible_support_actor", value: "Local Vendor", text: "Visible person now in view: Local Vendor.", exact: true },
        { factRef: "e1.f3", role: "support_role", value: "vendor", text: "Ordinary scene role: vendor.", exact: true },
        { factRef: "e1.f4", role: "anchor_scene", value: "Market", text: "Scene anchor: Market.", exact: true },
        { factRef: "e1.f5", role: "materialization_result", value: "created", text: "Presence result: created.", exact: true },
        { factRef: "e1.f6", role: "support_actor_visible_cue", value: "A local vendor is visible beside a counter or stall, with worn wood nearby.", text: "Visible support cue: A local vendor is visible beside a counter or stall, with worn wood nearby.", exact: true },
        { factRef: "e1.f7", role: "support_actor_public_summary", value: "An ordinary local vendor is visible beside a counter or stall at Market.", text: "Support actor public summary: An ordinary local vendor is visible beside a counter or stall at Market.", exact: true },
      ],
      limits: {
        proves: ["visible current-scene person label", "ordinary scene role", "current-scene presence or reuse"],
        doesNotProve: ["dialogue content", "NPC private knowledge", "relationship change", "future relevance", "durable world fact"],
      },
    }],
  });
}

function playerLocalConditionView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "player_local_condition_receipt",
      claimKinds: ["player_local_condition"],
      text: "Player is kneeling. Current scene anchor: Market.",
      backendFacts: [
        { factRef: "e1.f1", role: "player_condition_operation", value: "Player is kneeling.", text: "Player is kneeling.", exact: true },
        { factRef: "e1.f2", role: "condition_key", text: "Condition key: kneeling.", exact: true },
        { factRef: "e1.f3", role: "current_scene_anchor", text: "Current scene anchor: Market.", exact: true },
        { factRef: "e1.f4", role: "condition_result", text: "Condition result: applied.", exact: true },
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
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "player_local_condition_receipt",
        claimKinds: ["player_local_condition"],
        text: "Player is hands visible. Current scene anchor: Market.",
        backendFacts: [
          { factRef: "e5.f1", role: "player_condition_operation", value: "Player is hands visible.", text: "Player is hands visible.", exact: true },
          { factRef: "e5.f2", role: "condition_key", text: "Condition key: hands_visible.", exact: true },
          { factRef: "e5.f3", role: "current_scene_anchor", text: "Current scene anchor: Market.", exact: true },
          { factRef: "e5.f4", role: "condition_result", text: "Condition result: applied.", exact: true },
          { factRef: "e5.f5", role: "condition_target", text: "Condition target: Market.", exact: true },
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

function supportActorWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...supportActorView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function supportActorWithDialogueAndSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...supportActorView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
      {
        ref: "e4",
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: 'Local Vendor says: "The audit bell rang before dawn."',
        backendFacts: [
          { factRef: "e4.f1", role: "speaker_label", value: "Local Vendor", text: "Speaker: Local Vendor.", exact: true },
          { factRef: "e4.f2", role: "dialogue_quote", value: 'Local Vendor says: "The audit bell rang before dawn."', text: 'Local Vendor says: "The audit bell rang before dawn."', exact: true },
          { factRef: "e4.f3", role: "dialogue_summary", value: "Local Vendor says the audit bell rang before dawn.", text: "Dialogue summary: Local Vendor says the audit bell rang before dawn.", exact: true },
        ],
        limits: {
          proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
          doesNotProve: ["truth of speaker claim", "durable world fact", "NPC private knowledge beyond the utterance"],
        },
      },
    ],
  });
}

function playerLocalConditionWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...playerLocalConditionView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function itemStateView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "item_transfer_receipt",
      claimKinds: ["item_state"],
      text: "Brass Tube passes from Player to Guide at Market. Brass Tube is carried by Guide at Market.",
      backendFacts: [
        { factRef: "e1.f1", role: "custody_change", value: "Brass Tube passes from Player to Guide at Market.", text: "Custody change: Brass Tube passes from Player to Guide at Market.", exact: true },
        { factRef: "e1.f2", role: "settled_custody", value: "Brass Tube is carried by Guide at Market.", text: "Settled custody: Brass Tube is carried by Guide at Market.", exact: true },
        { factRef: "e1.f3", role: "item_label", value: "Brass Tube", text: "Item label: Brass Tube.", exact: true },
        { factRef: "e1.f4", role: "source_label", value: "Player", text: "Source: Player.", exact: true },
        { factRef: "e1.f5", role: "target_label", value: "Guide", text: "Target: Guide.", exact: true },
        { factRef: "e1.f6", role: "final_equip_state", value: "carried", text: "Final equip state: carried.", exact: true },
        { factRef: "e1.f7", role: "current_scene_anchor", value: "Market", text: "Current scene anchor: Market.", exact: true },
        { factRef: "e1.f8", role: "item_transfer_result", value: "transferred_to_actor", text: "Item transfer result: transferred_to_actor.", exact: true },
      ],
      limits: {
        proves: [
          "accepted item custody/location/equip-state operation",
          "accepted item label",
          "accepted source and target labels",
          "current scene item state anchor",
          "settled custody phrasing for the player",
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
    acceptedEvidence: [
      ...itemStateView().acceptedEvidence,
      {
        ref: "e2",
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: 'Guide says: "The north stairs flooded before dawn."',
        backendFacts: [
          { factRef: "e2.f1", role: "speaker_label", text: "Speaker: Guide.", exact: true },
          { factRef: "e2.f2", role: "dialogue_quote", value: 'Guide says: "The north stairs flooded before dawn."', text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
          { factRef: "e2.f3", role: "dialogue_summary", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
        ],
        limits: {
          proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
          doesNotProve: ["truth of speaker claim", "durable world fact", "NPC consent or reaction"],
        },
      },
    ],
  });
}

function itemStateWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...itemStateView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function dialogueWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...dialogueView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function itemStateWithDialogueAndSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...itemStateView().acceptedEvidence,
      sceneTextureEvidence("e3"),
      currentSceneAnchorEvidence("e4"),
      {
        ref: "e2",
        authority: "terminal_dialogue_receipt",
        claimKinds: ["dialogue_response"],
        text: 'Guide says: "The north stairs flooded before dawn."',
        backendFacts: [
          { factRef: "e2.f1", role: "speaker_label", text: "Speaker: Guide.", exact: true },
          { factRef: "e2.f2", role: "dialogue_quote", value: 'Guide says: "The north stairs flooded before dawn."', text: 'Guide says: "The north stairs flooded before dawn."', exact: true },
          { factRef: "e2.f3", role: "dialogue_summary", text: "Dialogue summary: Guide says the north stairs flooded before dawn.", exact: true },
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
    acceptedEvidence: [{
      ref: "e1",
      authority: "minor_poi_handle_receipt",
      claimKinds: ["minor_poi_handle", "visible_target"],
      text: "Visible current-scene point marked: Tea Stall. Current scene anchor: Market.",
      backendFacts: [
        { factRef: "e1.f1", role: "minor_poi_operation", value: "Visible current-scene point marked: Tea Stall.", text: "Visible current-scene point marked: Tea Stall.", exact: true },
        { factRef: "e1.f2", role: "place_handle_label", value: "Tea Stall", text: "Scene point label: Tea Stall.", exact: true },
        { factRef: "e1.f3", role: "place_handle_kind", value: "stall", text: "Scene point kind: stall.", exact: true },
        { factRef: "e1.f4", role: "current_scene_anchor", text: "Current scene anchor: Market.", exact: true },
        { factRef: "e1.f5", role: "handle_result", value: "created", text: "Scene point result: created.", exact: true },
        { factRef: "e1.f6", role: "place_handle_scope", text: "This is a visible current-scene point for reference only; movement uses separate route evidence.", exact: true },
      ],
      limits: {
        proves: [
          "accepted visible current-scene point label",
          "accepted scene point kind",
          "current visible scene point",
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
          "absence or no-change beyond the accepted visible scene point",
        ],
      },
    }],
  });
}

function minorPoiHandleWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...minorPoiHandleView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function localObservationView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "local_observation_receipt",
      claimKinds: ["local_observation", "bounded_visibility_negative"],
      text: "The visible actors and visible targets show no match for \"Violet Astrolabe\".",
      backendFacts: [
        { factRef: "e1.f1", role: "local_observation_beat", value: "The visible actors and visible targets show no match for \"Violet Astrolabe\".", text: "Local observation beat: The visible actors and visible targets show no match for \"Violet Astrolabe\".", exact: true },
        { factRef: "e1.f2", role: "searched_visible_surfaces", text: "Searched visible surfaces: visible actors and visible targets.", exact: true },
        { factRef: "e1.f3", role: "observation_query", text: "Observation query: Violet Astrolabe.", exact: true },
        { factRef: "e1.f4", role: "anchor_scene", text: "Anchor scene: Market.", exact: true },
        { factRef: "e1.f5", role: "anchor_location", text: "Anchor location: Market.", exact: true },
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
    acceptedEvidence: [{
      ref: "e1",
      authority: "local_observation_receipt",
      claimKinds: ["local_observation", "visible_target"],
      text: "central telegraph desk is in view here.",
      backendFacts: [
        { factRef: "e1.f1", role: "local_observation_beat", value: "central telegraph desk is in view here.", text: "Local observation beat: central telegraph desk is in view here.", exact: true },
        { factRef: "e1.f2", role: "searched_visible_surfaces", text: "Searched visible surfaces: visible targets.", exact: true },
        { factRef: "e1.f3", role: "observation_query", text: "Observation query: central telegraph desk.", exact: true },
        { factRef: "e1.f4", role: "observed_entry_labels", value: "central telegraph desk", text: "Observed entry labels: central telegraph desk.", exact: true },
        { factRef: "e1.f5", role: "observed_entry_surfaces", text: "Observed entry surfaces: visible target central telegraph desk.", exact: true },
        { factRef: "e1.f6", role: "anchor_scene", text: "Anchor scene: Market.", exact: true },
        { factRef: "e1.f7", role: "anchor_location", text: "Anchor location: Market.", exact: true },
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

function positiveLocalObservationWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...positiveLocalObservationView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
  });
}

function visibleActorLocalObservationWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      {
        ref: "e1",
        authority: "local_observation_receipt",
        claimKinds: ["local_observation"],
        text: "Guide is in view here.",
        backendFacts: [
          { factRef: "e1.f1", role: "local_observation_beat", value: "Guide is in view here.", text: "Local observation beat: Guide is in view here.", exact: true },
          { factRef: "e1.f2", role: "searched_visible_surfaces", text: "Searched visible surfaces: visible actors.", exact: true },
          { factRef: "e1.f3", role: "observation_query", text: "Observation query: visible people nearby.", exact: true },
          { factRef: "e1.f4", role: "observed_entry_labels", value: "Guide", text: "Observed entry labels: Guide.", exact: true },
          { factRef: "e1.f5", role: "observed_entry_surfaces", text: "Observed entry surfaces: visible actor Guide.", exact: true },
          { factRef: "e1.f6", role: "anchor_scene", value: "Lowwater Bazaar", text: "Anchor scene: Lowwater Bazaar.", exact: true },
          { factRef: "e1.f7", role: "anchor_location", value: "Lowwater Bazaar", text: "Anchor location: Lowwater Bazaar.", exact: true },
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
      },
      sceneTextureEvidence("e2"),
    ],
  });
}

function sceneObservationReceiptView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...sceneFrameSnapshotView().acceptedEvidence,
      {
        ref: "e5",
        authority: "scene_observation_receipt",
        claimKinds: ["current_scene", "current_location", "visible_actor", "inventory_status", "movement_option"],
        text: "You are at Market.",
        backendFacts: [
          { factRef: "e5.f1", role: "scene_placement", value: "You are at Market.", text: "Scene placement: You are at Market.", exact: true },
          { factRef: "e5.f2", role: "scene_label", value: "Market", text: "Scene label: Market.", exact: true },
          { factRef: "e5.f3", role: "place_label", value: "Market", text: "Place label: Market.", exact: true },
          { factRef: "e5.f4", role: "visible_actor_labels", value: "Guide", text: "Visible actor labels: Guide.", exact: true },
          { factRef: "e5.f5", role: "inventory_status_beat", value: "You have Courier satchel with you.", text: "Inventory status beat: You have Courier satchel with you.", exact: true },
          { factRef: "e5.f6", role: "route_choices_beat", value: "From Market, visible route choices are North Hall.", text: "Route choices beat: From Market, visible route choices are North Hall.", exact: true },
          { factRef: "e5.f7", role: "route_choice_labels", value: "North Hall", text: "Route choice labels: North Hall.", exact: true },
        ],
        limits: {
          proves: ["accepted current visible scene observation result", "scene observation phrasing for the player"],
          doesNotProve: ["hidden discovery", "movement", "item state", "dialogue content"],
        },
      },
    ],
  });
}

function sceneObservationReceiptWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      sceneTextureEvidence("e6"),
      ...sceneObservationReceiptView().acceptedEvidence,
    ],
  });
}

function deviceSurfaceObservationView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [{
      ref: "e1",
      authority: "device_surface_observation_receipt",
      claimKinds: ["device_surface_observation", "device_surface_unavailable"],
      text: "Burner phone's visible surface shows no requested message indicator.",
      backendFacts: [
        { factRef: "e1.f1", role: "device_surface_beat", value: "Burner phone's visible surface shows no requested message indicator.", text: "Device surface beat: Burner phone's visible surface shows no requested message indicator.", exact: true },
        { factRef: "e1.f2", role: "device_label", text: "Device label: Burner phone.", exact: true },
        { factRef: "e1.f3", role: "requested_surface_facets", text: "Requested surface facets: message indicator.", exact: true },
        { factRef: "e1.f4", role: "unavailable_surface_facets", text: "Unavailable surface facets: message indicator.", exact: true },
        { factRef: "e1.f5", role: "anchor_scene", text: "Anchor scene: Market.", exact: true },
        { factRef: "e1.f6", role: "anchor_location", text: "Anchor location: Market.", exact: true },
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

function deviceSurfaceObservationWithSceneTextureView(): CleanNarratorView {
  return movementView({
    acceptedEvidence: [
      ...deviceSurfaceObservationView().acceptedEvidence,
      sceneTextureEvidence("e2"),
      currentSceneAnchorEvidence("e3"),
    ],
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
    expect(serialized).not.toContain("playerAction");
    expect(promptInput.language).toBe("en");
    expect(promptInput.languageSource).toBe("derived_from_player_action_without_prompting_raw_action");
    expect(promptInput.acceptedEvidence[0]?.backendFacts[0]?.factRef).toBe("e1.f1");
    expect(promptInput.acceptedEvidence[0]?.backendFacts.map((fact) => fact.text)).toEqual([
      "After 1 minute, you reach North Hall.",
      "North Hall",
      "1 minute",
      "North Hall",
    ]);
    expect(promptInput.storyFrame.version).toBe("gameplay-runtime.clean-narrator-story-frame.v1");
    expect(promptInput.storyFrame.source).toBe("derived_from_prompt_accepted_evidence");
    expect(promptInput.storyFrame.pagePlan.version).toBe("gameplay-runtime.clean-narrator-page-plan.v1");
    expect(promptInput.storyFrame.pagePlan.source).toBe("derived_from_story_frame_composition_slots");
    expect(promptInput.narrativePageTask).toEqual({
      version: "gameplay-runtime.clean-narrator-page-task.v1",
      source: "derived_from_story_frame_page_plan",
      referenceProfile: "zetta_micro_1_1_3_primary_ff5_micro_secondary",
      pageGoal: "turn_changelog_to_grounded_text_rpg_page",
      truthBoundary: "accepted_evidence_only",
      storyPageBrief: {
        pageKind: "settled_turn_page",
        narratorStance: "second_person_present_player_view",
        proseRegister: "grounded_adventure_micro_page",
        compositionJob: "land_settled_turn_result",
        openingInstruction: "begin_with_settled_result",
        closingInstruction: "close_on_settled_result",
        requiredMoveRefs: ["m1"],
        optionalMoveRefs: [],
        requiredSentenceRefs: ["s1"],
        optionalSentenceRefs: [],
      },
      pageArc: {
        arcShape: "single_settled_result",
        pageCadence: "single_compact_beat",
        readerPosture: "continue_from_settled_result",
        closingIntent: "settled_result",
      },
      pagePerformance: {
        openingBeat: "settled_result_opening",
        pageMotion: "single_result",
        continuityMaterial: "result_material",
        closingBeat: "settled_result_closure",
        readerHandoff: "continue_from_result",
      },
      pageVariation: {
        openingRotation: "core_result_first",
        cadenceTarget: "single_micro_beat",
        dictionPalette: ["scene_anchor_tokens", "concrete_result_verbs", "time_pressure"],
        variationBoundary: "vary_syntax_only_inside_cited_material",
      },
      pageFocus: {
        coreMoveRefs: ["m1"],
        frameMoveRefs: [],
        coreSentenceRefs: ["s1"],
        frameSentenceRefs: [],
        preferredFrameSentenceRefs: [],
        emphasis: "settled_turn_event",
        frameSelection: "no_frame",
        coreFrameRelationship: "result_stands_alone",
        contextUse: "none",
      },
      choicePresentation: {
        mode: "none",
        sourceMoveRefs: [],
        sourceSentenceRefs: [],
        choices: [],
        choiceCount: 0,
        sharedCostText: null,
        sharedCostFactRef: null,
        anchorFactRefs: [],
        anchorStyle: "choice_labels_only",
        labelHandling: "preserve_route_labels_verbatim",
        costHandling: "omit_costs",
        closingStyle: "none",
        readerHandoff: "none",
      },
      moves: [{
        moveRef: "m1",
        step: "narrate_turn_event",
        entryRefs: ["e1"],
        entryProseCues: ["movement_result"],
        proseMove: "render_authoritative_turn_event",
        coverage: "required",
        allowedBackendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
        usableFacts: promptBackendFactsForRefs(promptInput, ["e1"]),
        factUses: [
          { factRef: "e1.f1", proseUse: "primary_beat" },
          { factRef: "e1.f2", proseUse: "label_anchor" },
          { factRef: "e1.f3", proseUse: "time_value" },
          { factRef: "e1.f4", proseUse: "label_anchor" },
        ],
      }],
      sentencePlan: [{
        sentenceRef: "s1",
        moveRef: "m1",
        sentenceRole: "turn_event_beat",
        coverage: "required",
        entryRefs: ["e1"],
        preferredBackendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
        claimFocus: {
          primaryClaimKinds: ["player_location_change", "elapsed_time"],
          supportingClaimKinds: [],
          citationMode: "primary_claims_of_cited_sentence_plan_refs",
        },
        beatObjective: "render_movement_arrival",
        proseMaterials: [
          {
            factRef: "e1.f1",
            proseUse: "primary_beat",
            materialText: "After 1 minute, you reach North Hall.",
            materialTextSource: "accepted_value",
            copyMode: "phrase_from_material",
          },
          {
            factRef: "e1.f2",
            proseUse: "label_anchor",
            materialText: "North Hall",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f3",
            proseUse: "time_value",
            materialText: "1 minute",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f4",
            proseUse: "label_anchor",
            materialText: "North Hall",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
        ],
        materialObligations: {
          allowedMaterialFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
          coreMaterialFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
          exactCopyFactRefs: [],
          preserveTokenFactRefs: ["e1.f2", "e1.f3", "e1.f4"],
          phraseFromMaterialFactRefs: ["e1.f1"],
          citationMode: "cite_only_material_fact_refs_from_cited_sentence_plan_refs",
        },
        textureCue: {
          mode: "omit_texture_in_this_sentence",
          playerFacingUse: "none",
          allowedTextureFactRefs: [],
        },
        adventureCue: {
          subjectFocus: "settled_result_material",
          verbFrame: "land_settled_result",
          detailPalette: ["accepted_primary_beat", "accepted_labels", "accepted_time"],
        },
        proseAssembly: {
          perspective: "settled_result_present",
          sentenceShape: "result_beat_line",
          openingSource: "core_material_subject",
          verbEnergy: "land_result",
          detailRhythm: "core_with_preserved_tokens",
          materialWeaveOrder: "result_then_preserved_tokens",
          styleBudget: "result_with_anchor_cadence",
          closingFunction: "settle_outcome",
        },
        literaryCue: {
          renderShape: "land_settled_turn_result",
          cadence: "compact_present_beat",
          styleLevers: ["concrete_present_verb", "elapsed_time_pressure", "accepted_label_anchor"],
        },
        flowCue: {
          pagePosition: "single",
          transitionRole: "settled_result",
          readerEffect: "land_outcome",
        },
      }],
    });
    expect(promptInput.narrativePageTask.moves[0]?.usableFacts.map((fact) => fact.value))
      .toEqual(["After 1 minute, you reach North Hall.", "North Hall", "1 minute", "North Hall"]);
  });

  it("builds a structured story frame from prompt accepted evidence", () => {
    const promptInput = buildCleanNarratorPromptInput(dialogueWithSceneFrameSnapshotView());
    const prompt = buildCleanNarrationPrompt(promptInput);

    expect(prompt).toContain('"storyFrame"');
    expect(prompt).toContain('"narrativePageTask"');
    expect(promptInput.storyFrame.turnEvents.map((entry) => entry.ref)).toEqual(["e5"]);
    expect(promptInput.storyFrame.turnEvents[0]).toEqual({
      ref: "e5",
      authority: "terminal_dialogue_receipt",
      claimKinds: ["dialogue_response"],
      proseCue: "dialogue_response",
      compositionSlot: "event_beat",
      summary: 'Guide says: "The north stairs flooded before dawn."',
      backendFactRefs: ["e5.f1", "e5.f2", "e5.f3"],
      limits: {
        proves: ["visible speaker identity", "visible response content", "speaker response happened this turn"],
        doesNotProve: ["truth of speaker claim", "durable world fact", "movement", "arrival"],
      },
    });
    expect(promptInput.storyFrame.currentContext.map((entry) => entry.ref)).toEqual(["e1"]);
    expect(promptInput.storyFrame.currentContext[0]?.claimKinds).toEqual(["current_scene", "current_location"]);
    expect(promptInput.storyFrame.currentContext[0]?.proseCue).toBe("current_scene_anchor");
    expect(promptInput.storyFrame.currentContext[0]?.compositionSlot).toBe("opening_context");
    expect(promptInput.storyFrame.currentContext[0]?.backendFactRefs).toEqual(["e1.f1", "e1.f2", "e1.f3"]);
    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "open_with_context", entryRefs: ["e1"] },
      { step: "narrate_turn_event", entryRefs: ["e5"] },
    ]);
    expect(promptInput.narrativePageTask.pageArc).toEqual({
      arcShape: "context_then_settled_result",
      pageCadence: "context_then_result",
      readerPosture: "continue_from_settled_result",
      closingIntent: "settled_result",
    });
    expect(promptInput.narrativePageTask.pagePerformance).toEqual({
      openingBeat: "context_anchor_opening",
      pageMotion: "context_to_result",
      continuityMaterial: "context_labels_to_result",
      closingBeat: "settled_result_closure",
      readerHandoff: "continue_from_result",
    });
    expect(promptInput.narrativePageTask.pageVariation).toEqual({
      openingRotation: "context_label_first",
      cadenceTarget: "context_then_short_result",
      dictionPalette: ["scene_anchor_tokens", "quote_frame"],
      variationBoundary: "vary_syntax_only_inside_cited_material",
    });
    expect(promptInput.narrativePageTask.pageFocus).toEqual({
      coreMoveRefs: ["m2"],
      frameMoveRefs: ["m1"],
      coreSentenceRefs: ["s2"],
      frameSentenceRefs: ["s1"],
      preferredFrameSentenceRefs: ["s1"],
      emphasis: "settled_turn_event",
      frameSelection: "prefer_scene_anchor_frame",
      coreFrameRelationship: "context_frames_result",
      contextUse: "orient_before_core",
    });
    expect(promptInput.narrativePageTask.storyPageBrief).toEqual({
      pageKind: "context_to_settled_result_page",
      narratorStance: "second_person_present_player_view",
      proseRegister: "grounded_adventure_micro_page",
      compositionJob: "place_context_then_land_result",
      openingInstruction: "begin_with_accepted_context",
      closingInstruction: "close_on_settled_result",
      requiredMoveRefs: ["m2"],
      optionalMoveRefs: ["m1"],
      requiredSentenceRefs: ["s2"],
      optionalSentenceRefs: ["s1"],
    });
    expect(promptInput.narrativePageTask.moves).toEqual([
      {
        moveRef: "m1",
        step: "open_with_context",
        entryRefs: ["e1"],
        entryProseCues: ["current_scene_anchor"],
        proseMove: "establish_playable_context",
        coverage: "optional",
        allowedBackendFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
        usableFacts: promptBackendFactsForRefs(promptInput, ["e1"]),
        factUses: [
          { factRef: "e1.f1", proseUse: "scene_anchor" },
          { factRef: "e1.f2", proseUse: "scene_anchor" },
          { factRef: "e1.f3", proseUse: "scene_anchor" },
        ],
      },
      {
        moveRef: "m2",
        step: "narrate_turn_event",
        entryRefs: ["e5"],
        entryProseCues: ["dialogue_response"],
        proseMove: "render_authoritative_turn_event",
        coverage: "required",
        allowedBackendFactRefs: ["e5.f1", "e5.f2", "e5.f3"],
        usableFacts: promptBackendFactsForRefs(promptInput, ["e5"]),
        factUses: [
          { factRef: "e5.f1", proseUse: "label_anchor" },
          { factRef: "e5.f2", proseUse: "exact_dialogue_quote" },
          { factRef: "e5.f3", proseUse: "supporting_detail" },
        ],
      },
    ]);
    expect(promptInput.narrativePageTask.moves[1]?.usableFacts.map((fact) => fact.value))
      .toEqual([undefined, 'Guide says: "The north stairs flooded before dawn."', undefined]);
    expect(promptInput.narrativePageTask.sentencePlan).toEqual([
      {
        sentenceRef: "s1",
        moveRef: "m1",
        sentenceRole: "context_anchor",
        coverage: "optional",
        entryRefs: ["e1"],
        preferredBackendFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
        claimFocus: {
          primaryClaimKinds: ["current_scene", "current_location"],
          supportingClaimKinds: [],
          citationMode: "primary_claims_of_cited_sentence_plan_refs",
        },
        beatObjective: "place_current_scene",
        proseMaterials: [
          {
            factRef: "e1.f1",
            proseUse: "scene_anchor",
            materialText: "You are at Market.",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f2",
            proseUse: "scene_anchor",
            materialText: "Market",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f3",
            proseUse: "scene_anchor",
            materialText: "Market",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
        ],
        materialObligations: {
          allowedMaterialFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
          coreMaterialFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
          exactCopyFactRefs: [],
          preserveTokenFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
          phraseFromMaterialFactRefs: [],
          citationMode: "cite_only_material_fact_refs_from_cited_sentence_plan_refs",
        },
        textureCue: {
          mode: "omit_texture_in_this_sentence",
          playerFacingUse: "none",
          allowedTextureFactRefs: [],
        },
        adventureCue: {
          subjectFocus: "player_scene_position",
          verbFrame: "place_player_in_scene",
          detailPalette: ["accepted_labels"],
        },
        proseAssembly: {
          perspective: "second_person_present",
          sentenceShape: "scene_anchor_line",
          openingSource: "preserved_label_anchor",
          verbEnergy: "concrete_present",
          detailRhythm: "scene_anchor_tokens",
          materialWeaveOrder: "scene_anchor_only",
          styleBudget: "scene_anchor_cadence",
          closingFunction: "orient_context",
        },
        literaryCue: {
          renderShape: "place_player_in_context",
          cadence: "compact_present_beat",
          styleLevers: ["accepted_label_anchor", "concrete_present_verb"],
        },
        flowCue: {
          pagePosition: "opening",
          transitionRole: "context_setup",
          readerEffect: "carry_forward_context",
        },
      },
      {
        sentenceRef: "s2",
        moveRef: "m2",
        sentenceRole: "turn_event_beat",
        coverage: "required",
        entryRefs: ["e5"],
        preferredBackendFactRefs: ["e5.f1", "e5.f2", "e5.f3"],
        claimFocus: {
          primaryClaimKinds: ["dialogue_response"],
          supportingClaimKinds: [],
          citationMode: "primary_claims_of_cited_sentence_plan_refs",
        },
        beatObjective: "frame_dialogue_reply",
        proseMaterials: [
          {
            factRef: "e5.f1",
            proseUse: "label_anchor",
            materialText: "Speaker: Guide.",
            materialTextSource: "accepted_text",
            copyMode: "preserve_token",
          },
          {
            factRef: "e5.f2",
            proseUse: "exact_dialogue_quote",
            materialText: 'Guide says: "The north stairs flooded before dawn."',
            materialTextSource: "accepted_value",
            copyMode: "copy_exact",
          },
          {
            factRef: "e5.f3",
            proseUse: "supporting_detail",
            materialText: "Dialogue summary: Guide says the north stairs flooded before dawn.",
            materialTextSource: "accepted_text",
            copyMode: "phrase_from_material",
          },
        ],
        materialObligations: {
          allowedMaterialFactRefs: ["e5.f1", "e5.f2", "e5.f3"],
          coreMaterialFactRefs: ["e5.f1", "e5.f2"],
          exactCopyFactRefs: ["e5.f2"],
          preserveTokenFactRefs: ["e5.f1"],
          phraseFromMaterialFactRefs: ["e5.f3"],
          citationMode: "cite_only_material_fact_refs_from_cited_sentence_plan_refs",
        },
        textureCue: {
          mode: "omit_texture_in_this_sentence",
          playerFacingUse: "none",
          allowedTextureFactRefs: [],
        },
        adventureCue: {
          subjectFocus: "visible_speaker",
          verbFrame: "frame_exact_utterance",
          detailPalette: ["accepted_labels", "accepted_quote", "accepted_primary_beat"],
        },
        proseAssembly: {
          perspective: "visible_speaker_present",
          sentenceShape: "quote_framed_beat",
          openingSource: "visible_speaker_label",
          verbEnergy: "frame_speech",
          detailRhythm: "exact_quote_with_frame",
          materialWeaveOrder: "speaker_then_quote",
          styleBudget: "quote_frame_cadence",
          closingFunction: "settle_outcome",
        },
        literaryCue: {
          renderShape: "frame_exact_quote",
          cadence: "quote_framed_beat",
          styleLevers: ["visible_speaker_frame", "accepted_label_anchor"],
        },
        flowCue: {
          pagePosition: "closing",
          transitionRole: "settled_result",
          readerEffect: "land_outcome",
        },
      },
    ]);
  });

  it("keeps movement receipts as authoritative turn events", () => {
    const promptInput = buildCleanNarratorPromptInput(movementView());

    expect(promptInput.storyFrame.currentContext).toEqual([]);
    expect(promptInput.storyFrame.turnEvents.map((entry) => entry.ref)).toEqual(["e1"]);
    expect(promptInput.storyFrame.turnEvents[0]?.claimKinds).toEqual(["player_location_change", "elapsed_time"]);
    expect(promptInput.storyFrame.turnEvents[0]?.proseCue).toBe("movement_result");
    expect(promptInput.storyFrame.turnEvents[0]?.compositionSlot).toBe("event_beat");
    expect(promptInput.storyFrame.turnEvents[0]?.summary).toBe("After 1 minute, you reach North Hall.");
    expect(promptInput.storyFrame.turnEvents[0]?.backendFactRefs).toEqual(["e1.f1", "e1.f2", "e1.f3", "e1.f4"]);
    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "narrate_turn_event", entryRefs: ["e1"] },
    ]);
  });

  it("keeps oracle outcomes as turn events without inventing context", () => {
    const promptInput = buildCleanNarratorPromptInput(oracleOutcomeView());

    expect(promptInput.storyFrame.currentContext).toEqual([]);
    expect(promptInput.storyFrame.turnEvents).toEqual([{
      ref: "e1",
      authority: "oracle_visible_outcome",
      claimKinds: ["oracle_outcome"],
      proseCue: "oracle_outcome",
      compositionSlot: "event_beat",
      summary: "The loose grate holds under your weight.",
      backendFactRefs: ["e1.f1"],
      limits: {
        proves: ["selected visible uncertainty outcome"],
        doesNotProve: [
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
        ],
      },
    }]);
    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "narrate_turn_event", entryRefs: ["e1"] },
    ]);
  });

  it("derives route-option texture and next-action composition cues from structured evidence", () => {
    const promptInput = buildCleanNarratorPromptInput(routeOptionsWithSceneTextureView());

    expect(promptInput.storyFrame.turnEvents.map((entry) => [
      entry.ref,
      entry.proseCue,
      entry.compositionSlot,
    ])).toEqual([["e1", "route_options", "next_action_context"]]);
    expect(promptInput.storyFrame.currentContext.map((entry) => [
      entry.ref,
      entry.proseCue,
      entry.compositionSlot,
    ])).toEqual([
      ["e2", "scene_texture", "texture_context"],
      ["e3", "current_scene_anchor", "opening_context"],
    ]);
    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "open_with_context", entryRefs: ["e2", "e3"] },
      { step: "close_with_next_action_context", entryRefs: ["e1"] },
    ]);
    expect(promptInput.narrativePageTask.pageArc).toEqual({
      arcShape: "context_then_choice_handle",
      pageCadence: "context_then_choice",
      readerPosture: "choose_visible_next_action",
      closingIntent: "playable_next_action",
    });
    expect(promptInput.narrativePageTask.pagePerformance).toEqual({
      openingBeat: "exact_texture_opening",
      pageMotion: "context_to_choices",
      continuityMaterial: "texture_to_choices",
      closingBeat: "playable_handle_closure",
      readerHandoff: "choose_next_action",
    });
    expect(promptInput.narrativePageTask.pageVariation).toEqual({
      openingRotation: "texture_sentence_first",
      cadenceTarget: "context_then_playable_handle",
      dictionPalette: [
        "accepted_texture_atmosphere",
        "scene_anchor_tokens",
        "time_pressure",
        "playable_route_labels",
      ],
      variationBoundary: "vary_syntax_only_inside_cited_material",
    });
    expect(promptInput.narrativePageTask.pageFocus).toEqual({
      coreMoveRefs: ["m2"],
      frameMoveRefs: ["m1"],
      coreSentenceRefs: ["s2"],
      frameSentenceRefs: ["s1"],
      preferredFrameSentenceRefs: ["s1"],
      emphasis: "playable_next_action",
      frameSelection: "prefer_texture_frame",
      coreFrameRelationship: "context_frames_choices",
      contextUse: "texture_before_core",
    });
    expect(promptInput.narrativePageTask.choicePresentation).toEqual({
      mode: "single_route",
      sourceMoveRefs: ["m2"],
      sourceSentenceRefs: ["s2"],
      choices: [{
        label: "North Hall",
        labelFactRef: "e1.f4",
        costText: "1 minute",
        costFactRef: "e1.f6",
      }],
      choiceCount: 1,
      sharedCostText: "1 minute",
      sharedCostFactRef: "e1.f6",
      anchorFactRefs: ["e1.f2"],
      anchorStyle: "route_origin_place_label",
      labelHandling: "preserve_route_labels_verbatim",
      costHandling: "preserve_shared_cost",
      closingStyle: "name_single_exit",
      readerHandoff: "choose_one_visible_route",
    });
    expect(promptInput.narrativePageTask.storyPageBrief).toEqual({
      pageKind: "context_to_playable_choices_page",
      narratorStance: "second_person_present_player_view",
      proseRegister: "grounded_adventure_micro_page",
      compositionJob: "place_context_then_offer_scene_exits",
      openingInstruction: "begin_with_accepted_context",
      closingInstruction: "close_on_playable_handle",
      requiredMoveRefs: ["m2"],
      optionalMoveRefs: ["m1"],
      requiredSentenceRefs: ["s2"],
      optionalSentenceRefs: ["s1"],
    });
    expect(promptInput.narrativePageTask.moves).toEqual([
      {
        moveRef: "m1",
        step: "open_with_context",
        entryRefs: ["e2", "e3"],
        entryProseCues: ["scene_texture", "current_scene_anchor"],
        proseMove: "establish_playable_context",
        coverage: "optional",
        allowedBackendFactRefs: ["e2.f1", "e2.f2", "e3.f1", "e3.f2", "e3.f3"],
        usableFacts: promptBackendFactsForRefs(promptInput, ["e2", "e3"]),
        factUses: [
          { factRef: "e2.f1", proseUse: "exact_texture_sentence" },
          { factRef: "e2.f2", proseUse: "exact_texture_sentence" },
          { factRef: "e3.f1", proseUse: "scene_anchor" },
          { factRef: "e3.f2", proseUse: "scene_anchor" },
          { factRef: "e3.f3", proseUse: "scene_anchor" },
        ],
      },
      {
        moveRef: "m2",
        step: "close_with_next_action_context",
        entryRefs: ["e1"],
        entryProseCues: ["route_options"],
        proseMove: "leave_playable_next_action_handle",
        coverage: "required",
        allowedBackendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4", "e1.f5", "e1.f6"],
        usableFacts: promptBackendFactsForRefs(promptInput, ["e1"]),
        factUses: [
          { factRef: "e1.f1", proseUse: "primary_beat" },
          { factRef: "e1.f2", proseUse: "scene_anchor" },
          { factRef: "e1.f3", proseUse: "route_choice" },
          { factRef: "e1.f4", proseUse: "route_choice" },
          { factRef: "e1.f5", proseUse: "route_choice" },
          { factRef: "e1.f6", proseUse: "time_value" },
        ],
      },
    ]);
    expect(promptInput.narrativePageTask.moves[0]?.usableFacts.map((fact) => fact.value))
      .toEqual([
        "Canvas awnings hang over the market lanes",
        "Rain taps the brass gutters",
        "You are at Market.",
        "Market",
        "Market",
      ]);
    expect(promptInput.narrativePageTask.sentencePlan).toEqual([
      {
        sentenceRef: "s1",
        moveRef: "m1",
        sentenceRole: "exact_context_texture",
        coverage: "optional",
        entryRefs: ["e2"],
        preferredBackendFactRefs: ["e2.f1"],
        claimFocus: {
          primaryClaimKinds: ["scene_texture"],
          supportingClaimKinds: ["current_scene", "current_location"],
          citationMode: "primary_claims_of_cited_sentence_plan_refs",
        },
        beatObjective: "copy_scene_texture",
        proseMaterials: [
          {
            factRef: "e2.f1",
            proseUse: "exact_texture_sentence",
            materialText: "Canvas awnings hang over the market lanes",
            materialTextSource: "accepted_value",
            copyMode: "copy_exact",
          },
        ],
        materialObligations: {
          allowedMaterialFactRefs: ["e2.f1"],
          coreMaterialFactRefs: ["e2.f1"],
          exactCopyFactRefs: ["e2.f1"],
          preserveTokenFactRefs: [],
          phraseFromMaterialFactRefs: [],
          citationMode: "cite_only_material_fact_refs_from_cited_sentence_plan_refs",
        },
        textureCue: {
          mode: "copy_exact_texture_sentence",
          playerFacingUse: "standalone_context_sentence",
          allowedTextureFactRefs: ["e2.f1"],
        },
        adventureCue: {
          subjectFocus: "accepted_texture",
          verbFrame: "copy_visible_texture",
          detailPalette: ["accepted_texture"],
        },
        proseAssembly: {
          perspective: "environment_present",
          sentenceShape: "exact_texture_line",
          openingSource: "accepted_texture_material",
          verbEnergy: "copy_exact",
          detailRhythm: "texture_line",
          materialWeaveOrder: "texture_exact_only",
          styleBudget: "exact_texture_atmosphere",
          closingFunction: "orient_context",
        },
        literaryCue: {
          renderShape: "copy_exact_context_texture",
          cadence: "exact_short_sentence",
          styleLevers: ["accepted_texture_only"],
        },
        flowCue: {
          pagePosition: "opening",
          transitionRole: "context_texture",
          readerEffect: "orient_player",
        },
      },
      {
        sentenceRef: "s2",
        moveRef: "m2",
        sentenceRole: "next_action_handle",
        coverage: "required",
        entryRefs: ["e1"],
        preferredBackendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4", "e1.f6"],
        claimFocus: {
          primaryClaimKinds: ["movement_option"],
          supportingClaimKinds: [],
          citationMode: "primary_claims_of_cited_sentence_plan_refs",
        },
        beatObjective: "render_route_choices",
        proseMaterials: [
          {
            factRef: "e1.f1",
            proseUse: "primary_beat",
            materialText: "From Market, visible route choices are North Hall (1 minute).",
            materialTextSource: "accepted_value",
            copyMode: "phrase_from_material",
          },
          {
            factRef: "e1.f2",
            proseUse: "scene_anchor",
            materialText: "Market",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f3",
            proseUse: "route_choice",
            materialText: "North Hall",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f4",
            proseUse: "route_choice",
            materialText: "North Hall",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
          {
            factRef: "e1.f6",
            proseUse: "time_value",
            materialText: "North Hall: 1 minute",
            materialTextSource: "accepted_value",
            copyMode: "preserve_token",
          },
        ],
        materialObligations: {
          allowedMaterialFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4", "e1.f6"],
          coreMaterialFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4", "e1.f6"],
          exactCopyFactRefs: [],
          preserveTokenFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f6"],
          phraseFromMaterialFactRefs: ["e1.f1"],
          citationMode: "cite_only_material_fact_refs_from_cited_sentence_plan_refs",
        },
        textureCue: {
          mode: "omit_texture_in_this_sentence",
          playerFacingUse: "none",
          allowedTextureFactRefs: [],
        },
        adventureCue: {
          subjectFocus: "playable_route_choices",
          verbFrame: "offer_scene_exits",
          detailPalette: ["accepted_primary_beat", "accepted_labels", "accepted_route_choices", "accepted_time"],
        },
        proseAssembly: {
          perspective: "playable_choice_present",
          sentenceShape: "scene_exit_choice_line",
          openingSource: "route_exit_label",
          verbEnergy: "offer_scene_exit",
          detailRhythm: "exit_group_with_cost",
          materialWeaveOrder: "exits_then_costs",
          styleBudget: "scene_exit_handoff_cadence",
          closingFunction: "offer_next_action",
        },
        literaryCue: {
          renderShape: "leave_scene_exit_handoff",
          cadence: "scene_exit_choice_sentence",
          styleLevers: ["route_exit_grouping", "accepted_label_anchor", "elapsed_time_pressure"],
        },
        flowCue: {
          pagePosition: "closing",
          transitionRole: "playable_handle",
          readerEffect: "offer_next_action",
        },
      },
    ]);
  });

  it("derives wide route-choice presentation from accepted open route labels and costs", () => {
    const promptInput = buildCleanNarratorPromptInput(routeOptionsManyView());

    expect(promptInput.narrativePageTask.pageArc).toEqual({
      arcShape: "single_choice_handle",
      pageCadence: "single_compact_beat",
      readerPosture: "choose_visible_next_action",
      closingIntent: "playable_next_action",
    });
    expect(promptInput.narrativePageTask.choicePresentation).toEqual({
      mode: "wide_scene_exit_group",
      sourceMoveRefs: ["m1"],
      sourceSentenceRefs: ["s1"],
      choices: [
        "Anchor Chain Pylon",
        "Auditor Spire",
        "Charter Gallery",
        "Resonance Tower",
        "Silt Warrens",
        "Slip Twelve Berth",
        "The Copper Tap",
        "Upper Dam Ruins",
      ].map((label) => ({
        label,
        labelFactRef: "e1.f4",
        costText: "1 minute",
        costFactRef: "e1.f6",
      })),
      choiceCount: 8,
      sharedCostText: "1 minute",
      sharedCostFactRef: "e1.f6",
      anchorFactRefs: ["e1.f2"],
      anchorStyle: "route_origin_place_label",
      labelHandling: "preserve_route_labels_verbatim",
      costHandling: "preserve_shared_cost",
      closingStyle: "show_scene_exit_group",
      readerHandoff: "choose_one_visible_route",
    });
  });

  it("prefers texture frame over scene-anchor support for textured route-status pages", () => {
    const promptInput = buildCleanNarratorPromptInput(routeWithSceneTextureView());

    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "open_with_context", entryRefs: ["e2", "e3"] },
      { step: "narrate_turn_event", entryRefs: ["e1"] },
    ]);
    expect(promptInput.narrativePageTask.pageFocus).toEqual({
      coreMoveRefs: ["m2"],
      frameMoveRefs: ["m1"],
      coreSentenceRefs: ["s3"],
      frameSentenceRefs: ["s1", "s2"],
      preferredFrameSentenceRefs: ["s1"],
      emphasis: "settled_turn_event",
      frameSelection: "prefer_texture_frame",
      coreFrameRelationship: "context_frames_result",
      contextUse: "texture_before_core",
    });
  });

  it("checks narration sentence page-move refs against the narrative page task", () => {
    const view = routeOptionsWithSceneTextureView();
    const validCandidate = acceptedCandidate(view, [
      {
        text: "Canvas awnings hang over the market lanes.",
        evidenceRefs: ["e2"],
        backendFactRefs: ["e2.f1"],
        claimKinds: ["scene_texture"],
      },
      {
        text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      },
    ]);
    expect(validCandidate.sentences.map((sentence) => sentence.pageMoveRefs)).toEqual([["m1"], ["m2"]]);
    expect(validCandidate.sentences.map((sentence) => sentence.sentencePlanRefs)).toEqual([["s1"], ["s2"]]);
    expect(validateCleanNarrationCandidate({ view, candidate: validCandidate }).status).toBe("accepted");

    const wrongMove = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
        pageMoveRefs: ["m1"],
      }]),
    });

    expect(wrongMove.status).toBe("rejected");
    if (wrongMove.status !== "rejected") throw new Error("expected rejected");
    expect(wrongMove.issues.some((issue) => issue.code === "page_move_not_supported")).toBe(true);

    const wrongSentencePlan = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
        pageMoveRefs: ["m2"],
        sentencePlanRefs: ["s1"],
      }]),
    });

    expect(wrongSentencePlan.status).toBe("rejected");
    if (wrongSentencePlan.status !== "rejected") throw new Error("expected rejected");
    expect(wrongSentencePlan.issues.some((issue) => issue.code === "sentence_plan_not_supported")).toBe(true);

    const wrongClaimFocus = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes at Market.",
          evidenceRefs: ["e2", "e3"],
          backendFactRefs: ["e2.f1", "e3.f1"],
          claimKinds: ["scene_texture", "current_scene"],
          pageMoveRefs: ["m1"],
          sentencePlanRefs: ["s1"],
        },
        {
          text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
          pageMoveRefs: ["m2"],
          sentencePlanRefs: ["s3"],
        },
      ]),
    });

    expect(wrongClaimFocus.status).toBe("rejected");
    if (wrongClaimFocus.status !== "rejected") throw new Error("expected rejected");
    expect(wrongClaimFocus.issues).toContainEqual(expect.objectContaining({
      code: "sentence_plan_not_supported",
      path: "sentences.0.claimKinds",
    }));
    expect(wrongClaimFocus.issues).toContainEqual(expect.objectContaining({
      code: "sentence_plan_not_supported",
      path: "sentences.0.backendFactRefs",
    }));
  });

  it("uses clarification page plans without promoting scene context to a world event", () => {
    const promptInput = buildCleanNarratorPromptInput(clarificationWithSceneFrameSnapshotView());

    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "ask_clarification", entryRefs: ["e1"] },
    ]);
    expect(promptInput.narrativePageTask.pageArc).toEqual({
      arcShape: "accepted_clarification_question",
      pageCadence: "question_only",
      readerPosture: "answer_the_prompted_clarification",
      closingIntent: "accepted_question",
    });
    expect(promptInput.narrativePageTask.storyPageBrief).toEqual({
      pageKind: "clarification_prompt_page",
      narratorStance: "second_person_present_player_view",
      proseRegister: "grounded_adventure_micro_page",
      compositionJob: "ask_accepted_clarification",
      openingInstruction: "ask_accepted_question",
      closingInstruction: "close_on_accepted_question",
      requiredMoveRefs: ["m1"],
      optionalMoveRefs: [],
      requiredSentenceRefs: ["s1"],
      optionalSentenceRefs: [],
    });
    expect(promptInput.storyFrame.turnEvents[0]?.proseCue).toBe("clarification_request");
    expect(promptInput.storyFrame.turnEvents[0]?.compositionSlot).toBe("clarification");
    expect(promptInput.storyFrame.currentContext.map((entry) => entry.ref)).toEqual(["e2"]);
  });

  it("narrows literary receipt prompt input to terminal evidence and scene anchors", () => {
    const promptInput = buildCleanNarratorPromptInput(dialogueWithSceneFrameSnapshotView());
    const refs = promptInput.acceptedEvidence.map((evidence) => evidence.ref);
    const claimKinds = promptInput.acceptedEvidence.flatMap((evidence) => evidence.claimKinds);

    expect(refs).toEqual(["e5", "e1"]);
    expect(claimKinds).toContain("dialogue_response");
    expect(claimKinds).toContain("current_scene");
    expect(claimKinds).not.toContain("visible_target");
    expect(claimKinds).not.toContain("movement_option");
  });

  it("uses a bounded item-transfer citation shortlist in literary prompt input", () => {
    const view = itemStateView();
    const promptInput = buildCleanNarratorPromptInput(view);
    const facts = promptInput.acceptedEvidence[0]?.backendFacts ?? [];

    expect(view.acceptedEvidence[0]?.backendFacts[0]?.text)
      .toBe("Custody change: Brass Tube passes from Player to Guide at Market.");
    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e1"]);
    expect(facts.map((fact) => fact.factRef)).toEqual([
      "e1.f2",
      "e1.f1",
      "e1.f3",
      "e1.f5",
      "e1.f6",
      "e1.f7",
    ]);
    expect(facts).toHaveLength(6);
    expect(facts.map((fact) => fact.text)).toEqual([
      "Brass Tube is carried by Guide at Market.",
      "Brass Tube passes from Player to Guide at Market.",
      "Brass Tube",
      "Guide",
      "carried",
      "Market",
    ]);
    expect(facts.map((fact) => fact.text).join("\n")).not.toContain("Item label:");
    expect(facts[0]).toMatchObject({
      factRef: "e1.f2",
      role: "settled_custody",
      value: "Brass Tube is carried by Guide at Market.",
      text: "Brass Tube is carried by Guide at Market.",
      exact: true,
    });
    const itemStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "turn_event_beat"
    );
    expect(itemStep).toMatchObject({
      beatObjective: "render_item_custody",
      adventureCue: {
        subjectFocus: "item_custody_state",
        verbFrame: "land_scene_custody",
      },
      proseAssembly: {
        sentenceShape: "scene_custody_beat_line",
        openingSource: "item_label_or_custody_state",
        verbEnergy: "land_custody",
        detailRhythm: "item_custody_with_scene_anchor",
        materialWeaveOrder: "item_then_custody_then_holder_scene",
        styleBudget: "scene_custody_cadence",
      },
      literaryCue: {
        renderShape: "weave_item_custody_scene_beat",
        cadence: "scene_custody_beat_sentence",
        styleLevers: ["item_custody_focus", "accepted_label_anchor", "settled_state_focus", "custody_endpoint_rotation"],
      },
    });
  });

  it("builds support actor presence as a scene-presence task card", () => {
    const promptInput = buildCleanNarratorPromptInput(supportActorWithSceneTextureView());
    const supportStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_support_actor_presence"
    );

    expect(supportStep?.preferredBackendFactRefs).toEqual(["e1.f2", "e1.f4", "e1.f6", "e1.f7", "e1.f3", "e1.f1"]);
    expect(supportStep).toMatchObject({
      beatObjective: "render_support_actor_presence",
      adventureCue: {
        subjectFocus: "visible_support_actor",
        verbFrame: "land_support_presence",
      },
      proseAssembly: {
        sentenceShape: "support_actor_presence_line",
        openingSource: "visible_support_actor_label",
        verbEnergy: "place_presence",
        detailRhythm: "actor_visible_cue_with_scene_role_context",
        materialWeaveOrder: "actor_then_visible_cue_then_scene",
        styleBudget: "support_presence_cadence",
      },
      literaryCue: {
        renderShape: "weave_support_actor_scene_presence",
        cadence: "support_presence_beat_sentence",
        styleLevers: ["support_actor_presence_focus", "accepted_label_anchor", "concrete_present_verb"],
      },
    });
    expect(supportStep?.proseMaterials.map((material) => ({
      factRef: material.factRef,
      proseUse: material.proseUse,
      materialText: material.materialText,
    }))).toEqual([
      { factRef: "e1.f2", proseUse: "label_anchor", materialText: "Local Vendor" },
      { factRef: "e1.f4", proseUse: "scene_anchor", materialText: "Market" },
      { factRef: "e1.f6", proseUse: "primary_beat", materialText: "A local vendor is visible beside a counter or stall, with worn wood nearby." },
      { factRef: "e1.f7", proseUse: "supporting_detail", materialText: "An ordinary local vendor is visible beside a counter or stall at Market." },
      { factRef: "e1.f3", proseUse: "label_anchor", materialText: "vendor" },
      { factRef: "e1.f1", proseUse: "primary_beat", materialText: "Local Vendor is now in view at Market as a vendor." },
    ]);
  });

  it("splits composed support actor dialogue into presence and quote sentence plans", () => {
    const promptInput = buildCleanNarratorPromptInput(supportActorWithDialogueAndSceneTextureView());
    const turnSteps = promptInput.narrativePageTask.sentencePlan.filter((step) =>
      step.sentenceRole === "turn_event_beat"
    );

    expect(turnSteps.map((step) => step.beatObjective)).toEqual([
      "render_support_actor_presence",
      "frame_dialogue_reply",
    ]);
    expect(turnSteps[0]?.preferredBackendFactRefs).toEqual(["e1.f2", "e1.f4", "e1.f6", "e1.f7", "e1.f3", "e1.f1"]);
    expect(turnSteps[0]?.proseAssembly.sentenceShape).toBe("support_actor_presence_line");
    expect(turnSteps[0]?.literaryCue.renderShape).toBe("weave_support_actor_scene_presence");
    expect(turnSteps[1]?.preferredBackendFactRefs).toEqual(["e4.f1", "e4.f2", "e4.f3"]);
    expect(turnSteps[1]?.proseAssembly.sentenceShape).toBe("quote_framed_beat");
    expect(turnSteps[1]?.literaryCue.renderShape).toBe("frame_exact_quote");
  });

  it("uses backend fact roles instead of fact text shape for prompt shortlists", () => {
    const base = itemStateView();
    const evidence = base.acceptedEvidence[0]!;
    const roleOwnedView = movementView({
      acceptedEvidence: [{
        ...evidence,
        backendFacts: evidence.backendFacts.map((fact, index) => ({
          ...fact,
          text: `Opaque accepted fact ${index + 1}.`,
        })),
      }],
    });

    const promptInput = buildCleanNarratorPromptInput(roleOwnedView);
    const facts = promptInput.acceptedEvidence[0]?.backendFacts ?? [];

    expect(facts.map((fact) => fact.factRef)).toEqual([
      "e1.f2",
      "e1.f1",
      "e1.f3",
      "e1.f5",
      "e1.f6",
      "e1.f7",
    ]);
    expect(facts.map((fact) => fact.text)).toEqual([
      "Brass Tube is carried by Guide at Market.",
      "Brass Tube passes from Player to Guide at Market.",
      "Brass Tube",
      "Guide",
      "carried",
      "Market",
    ]);
  });

  it("rejects prompt shortlisting when typed backend fact roles are missing", () => {
    const base = itemStateView();
    const evidence = base.acceptedEvidence[0]!;
    const legacyShapedView = movementView({
      acceptedEvidence: [{
        ...evidence,
        backendFacts: evidence.backendFacts.map(({ role: _role, ...fact }) => fact),
      }],
    });

    expect(() => buildCleanNarratorPromptInput(legacyShapedView))
      .toThrow("Prompt fact selection for item_transfer_receipt requires typed backend fact roles.");
  });

  it("keeps direct scene snapshot evidence available to the literary scene prompt", () => {
    const promptInput = buildCleanNarratorPromptInput(sceneFrameSnapshotView());
    const routeEvidence = promptInput.acceptedEvidence.find((evidence) =>
      evidence.authority === "scene_frame_snapshot"
      && evidence.claimKinds.includes("movement_option")
    );
    const inventoryEvidence = promptInput.acceptedEvidence.find((evidence) =>
      evidence.authority === "scene_frame_snapshot"
      && evidence.claimKinds.includes("inventory_status")
    );

    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(promptInput.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("visible_target")
    )).toBe(true);
    expect(promptInput.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("movement_option")
    )).toBe(true);
    expect(inventoryEvidence?.backendFacts.map((fact) => [fact.role, fact.text])).toEqual([
      ["inventory_status_beat", "You have Courier satchel with you."],
    ]);
    const routeChoiceStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "next_action_handle"
      && step.beatObjective === "render_route_choices"
    );
    expect(routeChoiceStep?.preferredBackendFactRefs).toEqual(["e4.f2", "e4.f3", "e4.f4"]);
    expect(routeChoiceStep?.proseAssembly).toMatchObject({
      sentenceShape: "scene_exit_choice_line",
      openingSource: "route_exit_label",
      verbEnergy: "offer_scene_exit",
      materialWeaveOrder: "exits_only",
    });
    expect(routeChoiceStep?.proseMaterials.map((material) => material.proseUse)).toEqual([
      "scene_anchor",
      "route_choice",
      "route_choice",
    ]);
    const inventoryStatusStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "next_action_handle"
      && step.proseMaterials.some((material) => material.factRef === "e2.f1")
    );
    expect(inventoryStatusStep?.preferredBackendFactRefs).toEqual(["e2.f1"]);
    expect(inventoryStatusStep?.beatObjective).toBe("render_direct_scene_snapshot");
    expect(inventoryStatusStep?.proseMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({
        factRef: "e2.f1",
        proseUse: "inventory_status",
        materialText: "You have Courier satchel with you.",
        copyMode: "phrase_from_material",
      }),
    ]));
    expect(inventoryStatusStep?.materialObligations.exactCopyFactRefs).toEqual([]);
    expect(inventoryStatusStep?.materialObligations.phraseFromMaterialFactRefs).toEqual(["e2.f1"]);
    expect(routeEvidence?.backendFacts.map((fact) => fact.text)).toEqual([
      "Market",
      "North Hall",
      "North Hall",
    ]);
    expect(routeEvidence?.backendFacts.map((fact) => fact.text).join("\n"))
      .not.toContain("Route choices beat:");
  });

  it("compresses scene observation receipts to canonical direct-scene prompt material", () => {
    const promptInput = buildCleanNarratorPromptInput(sceneObservationReceiptWithSceneTextureView());

    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e6", "e5"]);
    expect(promptInput.acceptedEvidence[0]?.backendFacts.map((fact) => fact.factRef)).toEqual(["e6.f1"]);
    expect(promptInput.storyFrame.currentContext.map((entry) => entry.ref)).toEqual(["e6", "e5"]);
    expect(promptInput.storyFrame.turnEvents).toEqual([]);
    expect(promptInput.storyFrame.pagePlan.steps).toEqual([
      { step: "open_with_context", entryRefs: ["e6"] },
      { step: "close_with_next_action_context", entryRefs: ["e5"] },
    ]);

    const routeChoiceStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "next_action_handle"
      && step.beatObjective === "render_route_choices"
    );
    expect(routeChoiceStep?.preferredBackendFactRefs).toEqual(["e5.f6", "e5.f7"]);

    const inventoryStatusStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "next_action_handle"
      && step.proseMaterials.some((material) => material.factRef === "e5.f5")
    );
    expect(inventoryStatusStep?.preferredBackendFactRefs).toEqual(["e5.f5"]);
    expect(inventoryStatusStep?.materialObligations.exactCopyFactRefs).toEqual([]);
    expect(inventoryStatusStep?.materialObligations.phraseFromMaterialFactRefs).toEqual(["e5.f5"]);
  });

  it("keeps elapsed-time literary prompt input to time evidence and scene label anchors", () => {
    const promptInput = buildCleanNarratorPromptInput(timeWithSceneFrameSnapshotView());
    const claimKinds = promptInput.acceptedEvidence.flatMap((evidence) => evidence.claimKinds);

    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e5", "e1"]);
    expect(claimKinds).toContain("elapsed_time");
    expect(claimKinds).toContain("current_scene");
    expect(claimKinds).not.toContain("visible_actor");
    expect(claimKinds).not.toContain("visible_target");
    expect(claimKinds).not.toContain("movement_option");
    expect(promptInput.narrativePageTask.sentencePlan.some((step) =>
      step.sentenceRole === "context_anchor"
    )).toBe(false);
    const elapsedStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_elapsed_time"
    );
    expect(elapsedStep).toMatchObject({
      preferredBackendFactRefs: ["e5.f2", "e1.f2"],
      adventureCue: {
        subjectFocus: "elapsed_time_value",
        verbFrame: "mark_elapsed_time_pressure",
        detailPalette: ["accepted_time", "accepted_labels"],
      },
      proseAssembly: {
        sentenceShape: "clock_beat_line",
        openingSource: "elapsed_time_value",
        verbEnergy: "pressure_time",
        detailRhythm: "time_with_scene_anchor",
        materialWeaveOrder: "time_pressure_then_scene_anchor",
        styleBudget: "clock_pressure_cadence",
      },
      literaryCue: {
        renderShape: "mark_elapsed_time_pressure_clock_beat",
        cadence: "pressure_clock_beat_sentence",
        styleLevers: ["elapsed_time_pressure", "clock_pressure_verb", "concrete_present_verb"],
      },
    });
    expect(elapsedStep?.proseMaterials).toEqual([
      {
        factRef: "e5.f2",
        proseUse: "time_value",
        materialText: "5 minutes",
        materialTextSource: "accepted_value",
        copyMode: "preserve_token",
      },
      {
        factRef: "e1.f2",
        proseUse: "scene_anchor",
        materialText: "Market",
        materialTextSource: "accepted_value",
        copyMode: "preserve_token",
      },
    ]);
  });

  it("keeps selected scene texture separate from standalone elapsed-time clock-beat material", () => {
    const promptInput = buildCleanNarratorPromptInput(timeWithSceneTextureView());
    const textureStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "exact_context_texture"
    );
    const elapsedStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_elapsed_time"
    );
    const contextAnchorStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.sentenceRole === "context_anchor"
    );

    expect(textureStep?.preferredBackendFactRefs).toEqual(["e2.f2"]);
    expect(textureStep?.materialObligations.coreMaterialFactRefs).toEqual(["e2.f2"]);
    expect(contextAnchorStep).toBeUndefined();
    expect(elapsedStep?.preferredBackendFactRefs).toEqual(["e5.f2", "e3.f2"]);
    expect(elapsedStep?.materialObligations.coreMaterialFactRefs).toEqual(["e5.f2", "e3.f2"]);
    expect(elapsedStep?.proseMaterials.map((material) => material.materialText)).toEqual(["5 minutes", "Market"]);
  });

  it("keeps all accepted route-option facts in literary prompt input", () => {
    const promptInput = buildCleanNarratorPromptInput(routeOptionsManyView());
    const routeEvidence = promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e1");

    expect(routeEvidence?.backendFacts).toHaveLength(6);
    expect(routeEvidence?.backendFacts.map((fact) => fact.text)).toEqual([
      "From Lowwater Bazaar, visible route choices are Anchor Chain Pylon (1 minute), Auditor Spire (1 minute), Charter Gallery (1 minute), Resonance Tower (1 minute), Silt Warrens (1 minute), Slip Twelve Berth (1 minute), The Copper Tap (1 minute), Upper Dam Ruins (1 minute).",
      "Lowwater Bazaar",
      "Anchor Chain Pylon; Auditor Spire; Charter Gallery; Resonance Tower; Silt Warrens; Slip Twelve Berth; The Copper Tap; Upper Dam Ruins",
      "Anchor Chain Pylon; Auditor Spire; Charter Gallery; Resonance Tower; Silt Warrens; Slip Twelve Berth; The Copper Tap; Upper Dam Ruins",
      "none",
      "Anchor Chain Pylon: 1 minute; Auditor Spire: 1 minute; Charter Gallery: 1 minute; Resonance Tower: 1 minute; Silt Warrens: 1 minute; Slip Twelve Berth: 1 minute; The Copper Tap: 1 minute; Upper Dam Ruins: 1 minute",
    ]);
  });

  it("includes scene_texture beside terminal route evidence when literary route prose can cite texture", () => {
    const promptInput = buildCleanNarratorPromptInput(routeOptionsWithSceneTextureView());

    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e1", "e2", "e3"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.claimKinds).toEqual(["scene_texture"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.backendFacts[0]?.text)
      .toBe("Canvas awnings hang over the market lanes");
  });

  it("includes scene_texture beside terminal item and dialogue evidence when literary prose can cite texture", () => {
    const promptInput = buildCleanNarratorPromptInput(itemStateWithDialogueAndSceneTextureView());

    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e1", "e2", "e3", "e4"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e1")?.claimKinds).toEqual(["item_state"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.claimKinds).toEqual(["dialogue_response"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e3")?.claimKinds).toEqual(["scene_texture"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e3")?.backendFacts.map((fact) => fact.text)).toEqual([
      "Canvas awnings hang over the market lanes",
      "Rain taps the brass gutters",
    ]);
  });

  it("rotates selected scene_texture frames by page cue while preserving accepted fact refs", () => {
    const routePrompt = buildCleanNarratorPromptInput(replaceAcceptedEvidence(
      routeOptionsWithSceneTextureView(),
      threeFrameSceneTextureEvidence("e2"),
    ));
    const timePrompt = buildCleanNarratorPromptInput(replaceAcceptedEvidence(
      timeWithSceneTextureView(),
      threeFrameSceneTextureEvidence("e2"),
    ));
    const itemPrompt = buildCleanNarratorPromptInput(replaceAcceptedEvidence(
      itemStateWithSceneTextureView(),
      threeFrameSceneTextureEvidence("e2"),
    ));
    const socialPrompt = buildCleanNarratorPromptInput(replaceAcceptedEvidence(
      supportActorWithSceneTextureView(),
      threeFrameSceneTextureEvidence("e2"),
    ));

    const selectedTextureRefs = (promptInput: ReturnType<typeof buildCleanNarratorPromptInput>) =>
      promptInput.narrativePageTask.sentencePlan
        .filter((step) => step.sentenceRole === "exact_context_texture")
        .map((step) => ({
          preferredBackendFactRefs: step.preferredBackendFactRefs,
          allowedTextureFactRefs: step.textureCue.allowedTextureFactRefs,
          materialTexts: step.proseMaterials.map((material) => material.materialText),
        }));

    expect(selectedTextureRefs(routePrompt)).toEqual([{
      preferredBackendFactRefs: ["e2.f1"],
      allowedTextureFactRefs: ["e2.f1"],
      materialTexts: ["Canvas awnings hang over the market lanes"],
    }]);
    expect(selectedTextureRefs(timePrompt)).toEqual([{
      preferredBackendFactRefs: ["e2.f3"],
      allowedTextureFactRefs: ["e2.f3"],
      materialTexts: ["Lantern smoke gathers under the bridge"],
    }]);
    expect(selectedTextureRefs(itemPrompt)).toEqual([{
      preferredBackendFactRefs: ["e2.f2"],
      allowedTextureFactRefs: ["e2.f2"],
      materialTexts: ["Rain taps the brass gutters"],
    }]);
    expect(selectedTextureRefs(socialPrompt)).toEqual([{
      preferredBackendFactRefs: ["e2.f2"],
      allowedTextureFactRefs: ["e2.f2"],
      materialTexts: ["Rain taps the brass gutters"],
    }]);
  });

  it("lets item_state carry its own scene token instead of adding a standalone player-placement sentence", () => {
    const promptInput = buildCleanNarratorPromptInput(itemStateWithSceneTextureView());

    expect(promptInput.narrativePageTask.sentencePlan.map((step) => step.sentenceRole))
      .toEqual(["exact_context_texture", "turn_event_beat"]);
    expect(promptInput.narrativePageTask.sentencePlan.map((step) => step.beatObjective))
      .toEqual(["copy_scene_texture", "render_item_custody"]);
    expect(promptInput.narrativePageTask.storyPageBrief.optionalSentenceRefs).toEqual(["s1"]);
    expect(promptInput.narrativePageTask.storyPageBrief.requiredSentenceRefs).toEqual(["s2"]);
  });

  it("includes scene_texture beside small scene-result evidence when literary prose can cite texture", () => {
    for (const view of [
      supportActorWithSceneTextureView(),
      playerLocalConditionWithSceneTextureView(),
      minorPoiHandleWithSceneTextureView(),
    ]) {
      const promptInput = buildCleanNarratorPromptInput(view);

      expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e1", "e2", "e3"]);
      expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.claimKinds).toEqual(["scene_texture"]);
      expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.backendFacts.map((fact) => fact.text)).toEqual([
        "Canvas awnings hang over the market lanes",
        "Rain taps the brass gutters",
      ]);
    }
  });

  it("includes scene_texture beside device-surface evidence when literary prose can cite texture", () => {
    const promptInput = buildCleanNarratorPromptInput(deviceSurfaceObservationWithSceneTextureView());

    expect(promptInput.acceptedEvidence.map((evidence) => evidence.ref)).toEqual(["e1", "e2", "e3"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e1")?.claimKinds).toEqual([
      "device_surface_observation",
      "device_surface_unavailable",
    ]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.claimKinds).toEqual(["scene_texture"]);
    expect(promptInput.acceptedEvidence.find((evidence) => evidence.ref === "e2")?.backendFacts.map((fact) => fact.text)).toEqual([
      "Canvas awnings hang over the market lanes",
      "Rain taps the brass gutters",
    ]);
  });

  it("accepts model narration from accepted movement evidence", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate(),
    });

    expect(result.status).toBe("accepted");
  });

  it("uses model-authored literary narration for movement receipts with travel cost", async () => {
    const view = movementWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "After one minute, you reach North Hall.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
          claimKinds: ["player_location_change", "elapsed_time"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Canvas awnings hang over the market lanes. After one minute, you reach North Hall.");
    expect(result.text).not.toMatch(/\b(Player location changed|Travel cost|minute\(s\)|arrive at|backend|receipt)\b/iu);
  });

  it("rejects route_check candidates that declare movement", () => {
    const result = validateCleanNarrationCandidate({
      view: routeView(),
      candidate: movementCandidate("You move to North Hall."),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
    expect(renderCleanAuthorityProjection(routeView())).not.toMatch(/\b(move|arrive|travel)\b/iu);
  });

  it("fails route_status projection when accepted Route beat evidence is missing", () => {
    const view = routeView();
    view.acceptedEvidence[0] = {
      ...view.acceptedEvidence[0],
      text: "North Hall is reachable from Market.",
      backendFacts: [{ factRef: "e1.f1", text: "North Hall is reachable from Market.", exact: true }],
    };

    expect(() => renderCleanAuthorityProjection(view)).toThrow("Route-status projection requires accepted Route beat value evidence.");
  });

  it("fails route_options receipt handling when accepted story evidence is missing", () => {
    const oldFactView = routeOptionsView();
    oldFactView.acceptedEvidence[0] = {
      ...oldFactView.acceptedEvidence[0]!,
      text: "Visible route options: North Hall.",
      backendFacts: [{ factRef: "e1.f1", text: "Route option: North Hall (connected, 1 minute(s)).", exact: true }],
    };

    expect(() => buildCleanNarratorPromptInput(oldFactView))
      .toThrow("Route-options prompt input requires accepted Route choices beat value evidence.");
    expect(() => renderCleanAuthorityProjection(oldFactView))
      .toThrow("Route-options projection requires accepted Route choice labels value evidence.");

    const missingLabelsView = routeOptionsView();
    missingLabelsView.acceptedEvidence[0] = {
      ...missingLabelsView.acceptedEvidence[0]!,
      backendFacts: [{
        factRef: "e1.f1",
        role: "route_choices_beat",
        value: "From Market, visible route choices are North Hall (1 minute).",
        text: "Route choices beat: From Market, visible route choices are North Hall (1 minute).",
        exact: true,
      }],
    };

    expect(() => buildCleanNarratorPromptInput(missingLabelsView))
      .toThrow("Route-options prompt input requires accepted Route choice labels value evidence.");
  });

  it("fails scene_frame_snapshot route handling when accepted story evidence is missing", () => {
    const oldFactView = sceneFrameSnapshotView();
    oldFactView.acceptedEvidence[3] = {
      ...oldFactView.acceptedEvidence[3]!,
      text: "Visible route options include North Hall.",
      backendFacts: [{ factRef: "e4.f1", text: "Route option: North Hall (connected, 1 minute(s)).", exact: true }],
    };

    expect(() => buildCleanNarratorPromptInput(oldFactView))
      .toThrow("Scene-frame route prompt input requires accepted Route choices beat value evidence.");
    expect(() => renderCleanAuthorityProjection(oldFactView))
      .toThrow("Direct-scene projection requires accepted Route choice labels value evidence.");
  });

  it("fails scene_frame_snapshot handling when accepted direct-scene story facts are missing", () => {
    const oldFactView = sceneFrameSnapshotView();
    oldFactView.acceptedEvidence[0] = {
      ...oldFactView.acceptedEvidence[0]!,
      text: "Current scene is Market.",
      backendFacts: [
        { factRef: "e1.f1", text: "Current scene is Market.", exact: true },
        { factRef: "e1.f2", text: "Current place is Market.", exact: true },
      ],
    };

    expect(() => buildCleanNarratorPromptInput(oldFactView))
      .toThrow("Scene-frame snapshot prompt input requires accepted Scene placement value evidence.");
    expect(() => renderCleanAuthorityProjection(oldFactView))
      .toThrow("Scene-frame snapshot prompt input requires accepted Scene placement value evidence.");
  });

  it("fails scene_observation receipt handling when accepted story evidence is missing", () => {
    const oldFactView = sceneObservationReceiptView();
    const receiptIndex = oldFactView.acceptedEvidence.findIndex((entry) =>
      entry.authority === "scene_observation_receipt"
    );
    oldFactView.acceptedEvidence[receiptIndex] = {
      ...oldFactView.acceptedEvidence[receiptIndex]!,
      text: "Current visible place is Market. Visible actors include Guide. Visible routes include North Hall. Inventory includes Courier satchel.",
      backendFacts: [
        { factRef: "e5.f1", text: "Current scene is Market.", exact: true },
        { factRef: "e5.f2", text: "Visible actor: Guide.", exact: true },
        { factRef: "e5.f3", text: "Inventory item: Courier satchel.", exact: true },
        { factRef: "e5.f4", text: "Movement option: North Hall.", exact: true },
      ],
    };

    expect(() => buildCleanNarratorPromptInput(oldFactView))
      .toThrow("Scene-observation prompt input requires accepted Scene placement value evidence.");
    expect(() => renderCleanAuthorityProjection(oldFactView))
      .toThrow("Scene-observation prompt input requires accepted Scene placement value evidence.");
  });

  it("fails local_observation receipt handling when accepted story evidence is missing", () => {
    const oldFactView = localObservationView();
    oldFactView.acceptedEvidence[0] = {
      ...oldFactView.acceptedEvidence[0]!,
      text: "Current visible actors and visible targets show no match for \"Violet Astrolabe\".",
      backendFacts: [
        { factRef: "e1.f1", text: "Current visible actors and visible targets show no match for \"Violet Astrolabe\".", exact: true },
        { factRef: "e1.f2", text: "Checked current visible actors and visible targets.", exact: true },
      ],
    };

    expect(() => buildCleanNarratorPromptInput(oldFactView))
      .toThrow("Local-observation prompt input requires accepted Local observation beat value evidence.");
    expect(() => renderCleanAuthorityProjection(oldFactView))
      .toThrow("Local-observation projection requires accepted Local observation beat value evidence.");
  });

  it("fails device_surface_observation receipt handling when accepted story evidence is missing", () => {
    const oldFactView = deviceSurfaceObservationView();
    oldFactView.acceptedEvidence[0] = {
      ...oldFactView.acceptedEvidence[0]!,
      text: "Current visible device surface for Burner phone exposes no requested message indicator.",
      backendFacts: [
        { factRef: "e1.f1", text: "Current visible device surface for Burner phone exposes no requested message indicator.", exact: true },
        { factRef: "e1.f2", text: "Device: Burner phone.", exact: true },
        { factRef: "e1.f3", text: "Requested surface facets: message indicator.", exact: true },
        { factRef: "e1.f4", text: "Current visible device surface exposes no requested message indicator for Burner phone.", exact: true },
      ],
    };

    expect(() => buildCleanNarratorPromptInput(oldFactView))
      .toThrow("Device-surface prompt input requires accepted Device surface beat value evidence.");
    expect(() => renderCleanAuthorityProjection(oldFactView))
      .toThrow("Device-surface projection requires accepted Device surface beat value evidence.");
  });

  it("uses model-authored literary narration for route_status with snapshot context", async () => {
    const view = routeWithSceneFrameSnapshotView();
    const promptInput = buildCleanNarratorPromptInput(view);
    const routeStatusStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_route_status"
    );
    expect(routeStatusStep?.proseAssembly).toMatchObject({
      sentenceShape: "route_status_line",
      openingSource: "route_label_or_status",
      verbEnergy: "report_route_status",
      materialWeaveOrder: "route_status_then_label",
      styleBudget: "route_status_cadence",
    });
    expect(routeStatusStep?.literaryCue).toMatchObject({
      renderShape: "answer_route_status",
      cadence: "route_status_beat_sentence",
      styleLevers: ["route_status_focus", "accepted_label_anchor", "settled_state_focus", "concrete_present_verb"],
    });
    expect(routeStatusStep?.proseMaterials.map((material) => [material.factRef, material.materialText])).toEqual([
      ["e5.f1", "From here, the path to Transmission Basement is open."],
      ["e5.f2", "Transmission Basement"],
      ["e5.f3", "connected"],
    ]);

    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "Transmission Basement lies open from here.",
        evidenceRefs: ["e5"],
        backendFactRefs: ["e5.f1", "e5.f2", "e5.f3"],
        claimKinds: ["route_status"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Transmission Basement lies open from here.");
    expect(result.text).toContain("Transmission Basement");
    expect(result.text).not.toContain("Transmission Basin");
    expect(result.text).not.toContain("You are at");
    expect(result.text).not.toMatch(/\b(settled route check|current scene|visible paths|inventory|move|arrive|travel|nothing changed|no change)\b/iu);
  });

  it("projects P64 elapsed-time evidence without no-change claims", () => {
    const text = renderCleanAuthorityProjection(timeView());

    expect(text).toBe("5 minutes pass.");
    expect(text).not.toMatch(/World clock|minute\(s\)|backend|receipt|nothing changed|nothing happened|no visible changes|everything stayed/iu);
  });

  it("fails elapsed_time projection when accepted Time beat evidence is missing", () => {
    const view = timeView();
    view.acceptedEvidence[0] = {
      ...view.acceptedEvidence[0],
      text: "World clock advances by 5 minute(s).",
      backendFacts: [{ factRef: "e1.f1", text: "World clock advances by 5 minute(s).", exact: true }],
    };

    expect(() => renderCleanAuthorityProjection(view)).toThrow("Elapsed-time projection requires accepted Time beat value evidence.");
  });

  it("renders movement, time, and route projections from role values instead of beat-shaped fact text", () => {
    const movement = movementView();
    movement.acceptedEvidence[0] = {
      ...movement.acceptedEvidence[0]!,
      backendFacts: movement.acceptedEvidence[0]!.backendFacts.map((fact) =>
        fact.role === "travel_beat" ? { ...fact, text: "Opaque accepted travel fact." } : fact
      ),
    };
    expect(renderCleanAuthorityProjection(movement)).toBe("After 1 minute, you reach North Hall.");

    const movementMissingValue = movementView();
    movementMissingValue.acceptedEvidence[0] = {
      ...movementMissingValue.acceptedEvidence[0]!,
      backendFacts: movementMissingValue.acceptedEvidence[0]!.backendFacts.map((fact) => {
        if (fact.role !== "travel_beat") return fact;
        const { value: _value, ...withoutValue } = fact;
        return withoutValue;
      }),
    };
    expect(() => renderCleanAuthorityProjection(movementMissingValue))
      .toThrow("Movement projection requires accepted Travel beat value evidence.");

    const elapsed = timeView();
    elapsed.acceptedEvidence[0] = {
      ...elapsed.acceptedEvidence[0]!,
      backendFacts: elapsed.acceptedEvidence[0]!.backendFacts.map((fact) =>
        fact.role === "time_beat" ? { ...fact, text: "Opaque accepted time fact." } : fact
      ),
    };
    expect(renderCleanAuthorityProjection(elapsed)).toBe("5 minutes pass.");

    const elapsedMissingValue = timeView();
    elapsedMissingValue.acceptedEvidence[0] = {
      ...elapsedMissingValue.acceptedEvidence[0]!,
      backendFacts: elapsedMissingValue.acceptedEvidence[0]!.backendFacts.map((fact) => {
        if (fact.role !== "time_beat") return fact;
        const { value: _value, ...withoutValue } = fact;
        return withoutValue;
      }),
    };
    expect(() => renderCleanAuthorityProjection(elapsedMissingValue))
      .toThrow("Elapsed-time projection requires accepted Time beat value evidence.");

    const routeStatus = routeView();
    routeStatus.acceptedEvidence[0] = {
      ...routeStatus.acceptedEvidence[0]!,
      backendFacts: routeStatus.acceptedEvidence[0]!.backendFacts.map((fact) =>
        fact.role === "route_beat" ? { ...fact, text: "Opaque accepted route-status fact." } : fact
      ),
    };
    expect(renderCleanAuthorityProjection(routeStatus)).toBe("From here, the path to North Hall is open.");

    const routeStatusMissingValue = routeView();
    routeStatusMissingValue.acceptedEvidence[0] = {
      ...routeStatusMissingValue.acceptedEvidence[0]!,
      backendFacts: routeStatusMissingValue.acceptedEvidence[0]!.backendFacts.map((fact) => {
        if (fact.role !== "route_beat") return fact;
        const { value: _value, ...withoutValue } = fact;
        return withoutValue;
      }),
    };
    expect(() => renderCleanAuthorityProjection(routeStatusMissingValue))
      .toThrow("Route-status projection requires accepted Route beat value evidence.");

    const routeOptions = routeOptionsView();
    routeOptions.acceptedEvidence[0] = {
      ...routeOptions.acceptedEvidence[0]!,
      backendFacts: routeOptions.acceptedEvidence[0]!.backendFacts.map((fact) =>
        fact.role === "route_choices_beat" ? { ...fact, text: "Opaque accepted route-options fact." } : fact
      ),
    };
    expect(renderCleanAuthorityProjection(routeOptions)).toBe("At Market, North Hall is the exit you can choose; it takes 1 minute.");

    const routeOptionsMissingValue = routeOptionsView();
    routeOptionsMissingValue.acceptedEvidence[0] = {
      ...routeOptionsMissingValue.acceptedEvidence[0]!,
      backendFacts: routeOptionsMissingValue.acceptedEvidence[0]!.backendFacts.map((fact) => {
        if (fact.role !== "route_choice_labels" && fact.role !== "open_route_labels") return fact;
        const { value: _value, ...withoutValue } = fact;
        return withoutValue;
      }),
    };
    expect(() => renderCleanAuthorityProjection(routeOptionsMissingValue))
      .toThrow("Route-options projection requires accepted Route choice labels value evidence.");
  });

  it("renders small terminal projections from role values instead of beat-shaped fact text", () => {
    const withOpaqueFactText = (
      view: CleanNarratorView,
      role: NonNullable<CleanNarratorView["acceptedEvidence"][number]["backendFacts"][number]["role"]>,
    ): CleanNarratorView => {
      view.acceptedEvidence[0] = {
        ...view.acceptedEvidence[0]!,
        backendFacts: view.acceptedEvidence[0]!.backendFacts.map((fact) =>
          fact.role === role ? { ...fact, text: `Opaque ${role} fact.` } : fact
        ),
      };
      return view;
    };
    const withoutFactValue = (
      view: CleanNarratorView,
      role: NonNullable<CleanNarratorView["acceptedEvidence"][number]["backendFacts"][number]["role"]>,
    ): CleanNarratorView => {
      view.acceptedEvidence[0] = {
        ...view.acceptedEvidence[0]!,
        backendFacts: view.acceptedEvidence[0]!.backendFacts.map((fact) => {
          if (fact.role !== role) return fact;
          const { value: _value, ...withoutValue } = fact;
          return withoutValue;
        }),
      };
      return view;
    };
    const sceneBeatView = (): CleanNarratorView => movementView({
      acceptedEvidence: [{
        ref: "e1",
        authority: "scene_beat_receipt",
        claimKinds: ["scene_beat"],
        text: "The market answers with a visible stir.",
        backendFacts: [{
          factRef: "e1.f1",
          role: "scene_beat",
          value: "The market answers with a visible stir.",
          text: "Scene beat: The market answers with a visible stir.",
          exact: true,
        }],
        limits: {
          proves: ["local visible scene beat acknowledgement"],
          doesNotProve: ["movement", "item state", "dialogue content"],
        },
      }],
    });

    expect(renderCleanAuthorityProjection(withOpaqueFactText(
      clarificationWithSceneFrameSnapshotView(),
      "clarification_request",
    ))).toBe("Please clarify: Which visible person should receive the item?");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(
      clarificationWithSceneFrameSnapshotView(),
      "clarification_request",
    ))).toThrow("Clarification projection requires accepted Clarification request value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(oracleOutcomeView(), "oracle_selected_meaning")))
      .toBe("The loose grate holds under your weight.");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(oracleOutcomeView(), "oracle_selected_meaning")))
      .toThrow("Oracle projection requires accepted selected visible outcome value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(localObservationView(), "local_observation_beat")))
      .toBe("The visible actors and visible targets show no match for \"Violet Astrolabe\".");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(localObservationView(), "local_observation_beat")))
      .toThrow("Local-observation projection requires accepted Local observation beat value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(
      deviceSurfaceObservationView(),
      "device_surface_beat",
    ))).toBe("Burner phone's visible surface shows no requested message indicator.");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(
      deviceSurfaceObservationView(),
      "device_surface_beat",
    ))).toThrow("Device-surface projection requires accepted Device surface beat value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(sceneBeatView(), "scene_beat")))
      .toBe("The market answers with a visible stir.");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(sceneBeatView(), "scene_beat")))
      .toThrow("Scene-beat projection requires accepted Scene beat value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(
      playerLocalConditionView(),
      "player_condition_operation",
    ))).toBe("Player is kneeling.");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(
      playerLocalConditionView(),
      "player_condition_operation",
    ))).toThrow("Player-local-condition projection requires accepted Player condition operation value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(supportActorView(), "support_actor_presence")))
      .toBe("At Market, Local Vendor is visible beside a counter or stall, with worn wood nearby.");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(supportActorView(), "support_actor_presence")))
      .toThrow("Support-actor projection requires accepted Support actor presence value evidence.");

    expect(renderCleanAuthorityProjection(withOpaqueFactText(minorPoiHandleView(), "place_handle_label")))
      .toBe("Tea Stall is now available here as a visible stall.");
    expect(() => renderCleanAuthorityProjection(withoutFactValue(minorPoiHandleView(), "place_handle_kind")))
      .toThrow("Minor-POI projection requires accepted Place handle kind value evidence.");
  });

  it("fails terminal authority projections when their accepted story facts are missing", () => {
    const clarification = clarificationWithSceneFrameSnapshotView();
    clarification.acceptedEvidence[0] = {
      ...clarification.acceptedEvidence[0]!,
      backendFacts: [],
    };
    expect(() => renderCleanAuthorityProjection(clarification))
      .toThrow("Clarification projection requires accepted Clarification request value evidence.");

    const item = itemStateView();
    item.acceptedEvidence[0] = {
      ...item.acceptedEvidence[0]!,
      backendFacts: item.acceptedEvidence[0]!.backendFacts.filter((fact) =>
        fact.role !== "settled_custody"
      ),
    };
    expect(() => renderCleanAuthorityProjection(item))
      .toThrow("Item-state projection requires accepted Settled custody value evidence.");

    const dialogue = dialogueView();
    dialogue.acceptedEvidence[0] = {
      ...dialogue.acceptedEvidence[0]!,
      backendFacts: dialogue.acceptedEvidence[0]!.backendFacts.filter((fact) =>
        fact.role !== "dialogue_quote"
      ),
    };
    expect(() => renderCleanAuthorityProjection(dialogue))
      .toThrow("Dialogue projection requires accepted dialogue quote value evidence.");

    const supportActor = supportActorView();
    supportActor.acceptedEvidence[0] = {
      ...supportActor.acceptedEvidence[0]!,
      backendFacts: supportActor.acceptedEvidence[0]!.backendFacts.filter((fact) =>
        fact.role !== "support_actor_presence"
      ),
    };
    expect(() => renderCleanAuthorityProjection(supportActor))
      .toThrow("Support-actor projection requires accepted Support actor presence value evidence.");

    const condition = playerLocalConditionView();
    condition.acceptedEvidence[0] = {
      ...condition.acceptedEvidence[0]!,
      backendFacts: condition.acceptedEvidence[0]!.backendFacts.filter((fact) =>
        fact.role !== "player_condition_operation"
      ),
    };
    expect(() => renderCleanAuthorityProjection(condition))
      .toThrow("Player-local-condition projection requires accepted Player condition operation value evidence.");

    const minorPoi = minorPoiHandleView();
    minorPoi.acceptedEvidence[0] = {
      ...minorPoi.acceptedEvidence[0]!,
      backendFacts: minorPoi.acceptedEvidence[0]!.backendFacts.filter((fact) =>
        fact.role !== "place_handle_kind"
      ),
    };
    expect(() => renderCleanAuthorityProjection(minorPoi))
      .toThrow("Minor-POI projection requires accepted Place handle kind value evidence.");

    const oracle = oracleOutcomeView();
    oracle.acceptedEvidence[0] = {
      ...oracle.acceptedEvidence[0]!,
      backendFacts: [],
    };
    expect(() => renderCleanAuthorityProjection(oracle))
      .toThrow("Oracle projection requires accepted selected visible outcome value evidence.");

    const sceneBeat = movementView({
      acceptedEvidence: [{
        ref: "e1",
        authority: "scene_beat_receipt",
        claimKinds: ["scene_beat"],
        text: "The market answers with a visible stir.",
        backendFacts: [{ factRef: "e1.f1", text: "The market answers with a visible stir.", exact: true }],
        limits: {
          proves: ["local visible scene beat acknowledgement"],
          doesNotProve: ["movement", "item state", "dialogue content"],
        },
      }],
    });
    expect(() => buildCleanNarratorPromptInput(sceneBeat))
      .toThrow("Scene-beat prompt input requires accepted Scene beat value evidence.");
    expect(() => renderCleanAuthorityProjection(sceneBeat))
      .toThrow("Scene-beat projection requires accepted Scene beat value evidence.");

    const sceneBeatWithStoryFact = movementView({
      acceptedEvidence: [{
        ...sceneBeat.acceptedEvidence[0]!,
        backendFacts: [{
          factRef: "e1.f1",
          role: "scene_beat",
          value: "The market answers with a visible stir.",
          text: "Scene beat: The market answers with a visible stir.",
          exact: true,
        }],
      }],
    });
    expect(renderCleanAuthorityProjection(sceneBeatWithStoryFact))
      .toBe("The market answers with a visible stir.");
  });

  it("uses model-authored literary narration for oracle_outcome visible meanings", async () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("Oracle-outcome surface:");
    const view = oracleOutcomeView();
    const promptInput = buildCleanNarratorPromptInput(view);

    expect(promptInput.acceptedEvidence).toHaveLength(1);
    expect(promptInput.acceptedEvidence[0]?.claimKinds).toEqual(["oracle_outcome"]);
    expect(promptInput.acceptedEvidence[0]?.backendFacts).toEqual([{
      factRef: "e1.f1",
      role: "oracle_selected_meaning",
      value: "The loose grate holds under your weight.",
      text: "The loose grate holds under your weight.",
      exact: true,
    }]);

    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "The loose grate holds firm beneath your weight.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f1"],
        claimKinds: ["oracle_outcome"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("The loose grate holds firm beneath your weight.");
  });

  it("rejects oracle_outcome candidates that declare unsupported structured claims", () => {
    const unsupportedClaimKinds: NarrationClaimKind[] = [
      "player_location_change",
      "item_state",
      "dialogue_response",
    ];

    for (const unsupportedClaimKind of unsupportedClaimKinds) {
      const view = oracleOutcomeView();
      const result = validateCleanNarrationCandidate({
        view,
        candidate: acceptedCandidate(view, [{
          text: "The loose grate holds firm beneath your weight.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["oracle_outcome", unsupportedClaimKind],
        }]),
      });

      expect(result.status).toBe("rejected");
      if (result.status !== "rejected") throw new Error("expected rejected");
      expect(result.issues).toEqual(expect.arrayContaining([
        expect.objectContaining({
          code: "claim_not_supported",
          path: "sentences.0.claimKinds",
          message: `Narration sentence declared unsupported claim kind ${unsupportedClaimKind}.`,
        }),
      ]));
    }
  });

  it("uses model-authored literary narration for standalone elapsed-time turns with snapshot context", async () => {
    const view = timeWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Five minutes gather at Market.",
          evidenceRefs: ["e5", "e3"],
          backendFactRefs: ["e5.f2", "e3.f2"],
          claimKinds: ["elapsed_time", "current_scene"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Five minutes gather at Market.");
    expect(result.text).not.toMatch(/\b(World clock|minute\(s\)|backend|receipt|remains?|still|inventory|visible routes|nothing changed|no change)\b/iu);
  });

  it("accepts standalone elapsed-time prose with the selected texture frame", () => {
    const view = timeWithSceneTextureView();
    const reserveTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Five minutes gather at Market.",
          evidenceRefs: ["e5", "e3"],
          backendFactRefs: ["e5.f2", "e3.f2"],
          claimKinds: ["elapsed_time", "current_scene"],
        },
      ]),
    });

    expect(reserveTexture.status).toBe("rejected");

    const selectedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Five minutes gather at Market.",
          evidenceRefs: ["e5", "e3"],
          backendFactRefs: ["e5.f2", "e3.f2"],
          claimKinds: ["elapsed_time", "current_scene"],
        },
      ]),
    });

    expect(selectedTexture.status).toBe("accepted");
  });

  it("allows standalone elapsed-time prose to use later scene_texture when route options are only contextual evidence", () => {
    const base = timeWithSceneTextureView();
    const view = movementView({
      acceptedEvidence: [
        ...base.acceptedEvidence,
        routeOptionsView().acceptedEvidence[0]!,
      ],
    });
    const result = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Five minutes gather at Market.",
          evidenceRefs: ["e5", "e3"],
          backendFactRefs: ["e5.f2", "e3.f2"],
          claimKinds: ["elapsed_time", "current_scene"],
        },
      ]),
    });

    expect(result.status).toBe("accepted");
  });

  it("uses model-authored route-options prose without scene texture while preserving route-only truth", async () => {
    const view = routeOptionsView();
    let modelCalls = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => {
        modelCalls += 1;
        return acceptedCandidate(view, [{
          text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        }]);
      },
    });

    expect(modelCalls).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("At Market, North Hall is the exit you can choose; it takes 1 minute.");
    expect(result.text).not.toMatch(/\b(Route option|connected|minute\(s\)|move|arrive|travel to|you go)\b/iu);

    const manyRoutes = validateCleanNarrationCandidate({
      view: routeOptionsManyView(),
      candidate: acceptedCandidate(routeOptionsManyView(), [{
        text: "At Lowwater Bazaar, Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, and Upper Dam Ruins are exits you can choose; each takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(manyRoutes.status).toBe("accepted");

    const labelAndCostPreserved = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "North Hall is the exit from Market; it takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(labelAndCostPreserved.status).toBe("accepted");

    const unsupportedMovementClaim = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "North Hall is the visible route choice from here.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f1"],
        claimKinds: ["movement_option", "player_location_change"],
      }]),
    });
    expect(unsupportedMovementClaim.status).toBe("rejected");
    if (unsupportedMovementClaim.status !== "rejected") throw new Error("expected rejected");
    expect(unsupportedMovementClaim.issues.some((issue) =>
      issue.code === "claim_not_supported"
    )).toBe(true);

    const missingRouteLabels = validateCleanNarrationCandidate({
      view: routeOptionsManyView(),
      candidate: acceptedCandidate(routeOptionsManyView(), [{
        text: "Passages from here lead toward Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, and Slip Twelve Berth, each about a minute's walk.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(missingRouteLabels.status).toBe("rejected");
    if (missingRouteLabels.status !== "rejected") throw new Error("expected rejected");
    expect(missingRouteLabels.issues.some((issue) =>
      issue.message.includes("The Copper Tap") || issue.message.includes("Upper Dam Ruins")
    )).toBe(true);

    const missingRouteCost = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, North Hall is the exit you can choose.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(missingRouteCost.status).toBe("rejected");
    if (missingRouteCost.status !== "rejected") throw new Error("expected rejected");
    expect(missingRouteCost.issues.some((issue) =>
      issue.message.includes("1 minute")
    )).toBe(true);

    const sceneExitShape = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(sceneExitShape.status).toBe("accepted");

    const wideSceneExitShape = validateCleanNarrationCandidate({
      view: routeOptionsManyView(),
      candidate: acceptedCandidate(routeOptionsManyView(), [{
        text: "At Lowwater Bazaar, Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, and Upper Dam Ruins are exits you can choose; each takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(wideSceneExitShape.status).toBe("accepted");

    const unsupportedSceneTextureClaim = validateCleanNarrationCandidate({
      view: routeOptionsManyView(),
      candidate: acceptedCandidate(routeOptionsManyView(), [{
        text: "At Lowwater Bazaar, Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, and Upper Dam Ruins are exits you can choose; each takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
        claimKinds: ["movement_option", "scene_texture"],
      }]),
    });
    expect(unsupportedSceneTextureClaim.status).toBe("rejected");
    if (unsupportedSceneTextureClaim.status !== "rejected") throw new Error("expected rejected");
    expect(unsupportedSceneTextureClaim.issues.some((issue) =>
      issue.code === "claim_not_supported"
    )).toBe(true);
  });

  it("preserves route-options shared route cost in validation retry feedback", async () => {
    const view = routeOptionsManyView();
    const prompts: string[] = [];
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async ({ prompt }) => {
        prompts.push(prompt);
        return acceptedCandidate(view, [{
          text: prompts.length === 1
            ? "At Lowwater Bazaar, Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, and Upper Dam Ruins are exits you can choose."
            : "At Lowwater Bazaar, Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, and Upper Dam Ruins are exits you can choose; each takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        }]);
      },
    });

    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("sharedCostText 1 minute");
    expect(result.source).toBe("model");
    expect(result.text).toBe(
      "At Lowwater Bazaar, Anchor Chain Pylon, Auditor Spire, Charter Gallery, Resonance Tower, Silt Warrens, Slip Twelve Berth, The Copper Tap, and Upper Dam Ruins are exits you can choose; each takes 1 minute.",
    );
  });

  it("uses model-authored route-options prose when accepted scene_texture is available", async () => {
    const view = routeOptionsWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Canvas awnings hang over the market lanes. At Market, North Hall is the exit you can choose; it takes 1 minute.");
    expect(result.text).toContain("North Hall");
    expect(result.text).not.toMatch(/\b(Route option|connected|minute\(s\)|you go|you walk|arrive)\b/iu);

    const routeSentenceMissingLabel = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, the exit is available; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        },
      ]),
    });
    expect(routeSentenceMissingLabel.status).toBe("rejected");

    const reserveTextureRepeatedByRoute = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        },
      ]),
    });
    expect(reserveTextureRepeatedByRoute.status).toBe("rejected");

    const paraphrasedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Canvas awnings hang overhead.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        },
      ]),
    });
    expect(paraphrasedTexture.status).toBe("accepted");

    const uncitedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Market stalls surround you while North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f4", "e1.f6"],
        claimKinds: ["movement_option"],
      }]),
    });
    expect(uncitedTexture.status).toBe("accepted");

    const wrongCitedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Market stalls surround you while North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1", "e2"],
        backendFactRefs: ["e1.f4", "e1.f6", "e2.f1"],
        claimKinds: ["movement_option", "scene_texture"],
      }]),
    });
    expect(wrongCitedTexture.status).toBe("accepted");
  });

  it("accepts route prose by structured route refs instead of repairing uncited texture wording", async () => {
    const view = routeOptionsWithSceneTextureView();
    let attempts = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async (request) => {
        attempts += 1;
        expect(request.prompt).not.toContain("Stage 6 validation feedback");
        return acceptedCandidate(view, [{
          text: "Market stalls surround you while North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f4", "e1.f6"],
          claimKinds: ["movement_option"],
        }]);
      },
    });

    expect(attempts).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("Market stalls surround you while North Hall is the exit you can choose; it takes 1 minute.");
  });

  it("accepts selected scene_texture in standalone elapsed-time runtime prose without prose-quality repair", async () => {
    const view = timeWithSceneTextureView();
    let attempts = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async (request) => {
        attempts += 1;
        return acceptedCandidate(view, [
          {
            text: "Rain taps the brass gutters.",
            evidenceRefs: ["e2"],
            backendFactRefs: ["e2.f2"],
            claimKinds: ["scene_texture"],
          },
          {
            text: "Five minutes gather at Market.",
            evidenceRefs: ["e5", "e3"],
            backendFactRefs: ["e5.f2", "e3.f2"],
            claimKinds: ["elapsed_time", "current_scene"],
          },
        ]);
      },
    });

    expect(attempts).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Five minutes gather at Market.");
  });

  it("accepts missing scene_texture for item_state at runtime without prose-quality repair", async () => {
    const view = itemStateWithSceneTextureView();
    let attempts = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async (request) => {
        attempts += 1;
        expect(request.prompt).not.toContain("Stage 6 validation feedback");
        return acceptedCandidate(view, [{
          text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
          claimKinds: ["item_state"],
        }]);
      },
    });

    expect(attempts).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("Brass Tube passes from Player to Guide, and Guide carries it at Market.");
  });

  it("accepts selected scene_texture frame for dialogue_response at runtime without prose-quality repair", async () => {
    const view = dialogueWithSceneTextureView();
    let attempts = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async (request) => {
        attempts += 1;
        expect(request.prompt).not.toContain("Stage 6 validation feedback");
        return acceptedCandidate(view, [
          {
            text: "Rain taps the brass gutters.",
            evidenceRefs: ["e2"],
            backendFactRefs: ["e2.f2"],
            claimKinds: ["scene_texture"],
          },
          {
            text: 'At Market, Guide answers: "The north stairs flooded before dawn."',
            evidenceRefs: ["e1", "e3"],
            backendFactRefs: ["e1.f1", "e1.f2", "e3.f1"],
            claimKinds: ["dialogue_response", "current_scene"],
          },
        ]);
      },
    });

    expect(attempts).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe('Rain taps the brass gutters. At Market, Guide answers: "The north stairs flooded before dawn."');
  });

  it("accepts missing scene_texture for support_actor_materialization at runtime without prose-quality repair", async () => {
    const view = supportActorWithSceneTextureView();
    let attempts = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async (request) => {
        attempts += 1;
        expect(request.prompt).not.toContain("Stage 6 validation feedback");
        return acceptedCandidate(view, [{
          text: "Local Vendor takes a visible place at Market.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f1", "e3.f1"],
          claimKinds: ["visible_actor", "support_actor_materialization", "current_scene"],
        }]);
      },
    });

    expect(attempts).toBe(0);
    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("Canvas awnings hang over the market lanes. At Market, Local Vendor is visible beside a counter or stall, with worn wood nearby.");
  });

  it("accepts direct-scene custody status at runtime without prose-quality repair", async () => {
    const view = movementView({
      acceptedEvidence: [
        sceneTextureEvidence("e6"),
        ...sceneFrameSnapshotWithOverlappingTargetsView().acceptedEvidence,
      ],
    });
    let attempts = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async (request) => {
        attempts += 1;
        expect(request.prompt).not.toContain("Stage 6 validation feedback");
        return acceptedCandidate(view, [
          {
            text: "Canvas awnings hang over the market lanes.",
            evidenceRefs: ["e6"],
            backendFactRefs: ["e6.f1"],
            claimKinds: ["scene_texture"],
          },
          {
            text: "Guide is in view, with Brass Tube and Notice Board visible nearby.",
            evidenceRefs: ["e2", "e4"],
            backendFactRefs: ["e2.f1", "e4.f3", "e4.f4"],
            claimKinds: ["visible_actor", "visible_target"],
          },
          {
            text: "You have Courier satchel with you.",
            evidenceRefs: ["e3"],
            backendFactRefs: ["e3.f1"],
            claimKinds: ["inventory_status"],
          },
          {
            text: "At Market, North Hall is the exit you can choose.",
            evidenceRefs: ["e5"],
            backendFactRefs: ["e5.f2", "e5.f3", "e5.f4"],
            claimKinds: ["movement_option"],
          },
        ]);
      },
    });

    expect(attempts).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("Canvas awnings hang over the market lanes. Guide is in view, with Brass Tube and Notice Board visible nearby. You have Courier satchel with you. At Market, North Hall is the exit you can choose.");
  });

  it("uses deterministic authority projection for clarification requests before scene snapshot context", async () => {
    const result = await runCleanNarration({
      narratorView: clarificationWithSceneFrameSnapshotView(),
      provider,
      generateCandidate: async () => {
        throw new Error("clarification_request should not call the model");
      },
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("Please clarify: Which visible person should receive the item?");
    expect(result.text).not.toMatch(/\bVisible target|Guide|Courier|Brass Tube|moves?|nothing changed|no change\b/u);

    const unsupported = validateCleanNarrationCandidate({
      view: clarificationWithSceneFrameSnapshotView(),
      candidate: {
        ...movementCandidate("Guide receives the item."),
        sentences: [{
          kind: "accepted_evidence",
          text: "Guide receives the item.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1"],
          claimKinds: ["clarification_request", "item_state"],
          auditStepIds: [],
        }],
        finalText: "Guide receives the item.",
      },
    });
    expect(unsupported.status).toBe("rejected");
    if (unsupported.status !== "rejected") throw new Error("expected rejected");
    expect(unsupported.issues.some((issue) => issue.code === "claim_not_supported")).toBe(true);
  });

  it("uses model-authored literary narration for direct scene targets and exits", async () => {
    const view = sceneFrameSnapshotWithTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Notice Board is visible.",
          evidenceRefs: ["e3"],
          backendFactRefs: ["e3.f1"],
          claimKinds: ["visible_target"],
        },
        {
          text: "You have Courier satchel with you.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["inventory_status"],
        },
        {
          text: "At Market, North Hall is the exit you can choose; it takes 1 minute.",
          evidenceRefs: ["e4"],
          backendFactRefs: ["e4.f2", "e4.f3", "e4.f4"],
          claimKinds: ["movement_option"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Canvas awnings hang over the market lanes. Notice Board is visible. You have Courier satchel with you. At Market, North Hall is the exit you can choose; it takes 1 minute.");
    expect(result.text).not.toMatch(/\b(Current scene|Current place|Inventory item|Visible target|Route option|connected|move|arrive|travel to|you go|hidden|absent|nothing changed|no change)\b/iu);

    const missingTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, Notice Board is visible. You have Courier satchel with you. At Market, North Hall is the exit you can choose; it takes 1 minute.",
        evidenceRefs: ["e1", "e2", "e3", "e4"],
        backendFactRefs: ["e1.f1", "e2.f1", "e3.f1", "e4.f2", "e4.f3", "e4.f4"],
        claimKinds: ["current_scene", "inventory_status", "visible_target", "movement_option"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const inventoryPhrase = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, Notice Board is visible.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f1", "e3.f1"],
          claimKinds: ["current_scene", "visible_target"],
        },
        {
          text: "Courier satchel is with you.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1"],
          claimKinds: ["inventory_status"],
        },
        {
          text: "At Market, North Hall is the exit you can choose.",
          evidenceRefs: ["e4"],
          backendFactRefs: ["e4.f2", "e4.f3", "e4.f4"],
          claimKinds: ["movement_option"],
        },
      ]),
    });
    expect(inventoryPhrase.status).toBe("accepted");

    const conflatedInventoryAsVisibleTarget = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, Notice Board and Courier satchel are visible.",
          evidenceRefs: ["e1", "e2", "e3"],
          backendFactRefs: ["e1.f1", "e2.f1", "e3.f1"],
          claimKinds: ["current_scene", "inventory_status", "visible_target"],
        },
      ]),
    });
    expect(conflatedInventoryAsVisibleTarget.status).toBe("rejected");
    if (conflatedInventoryAsVisibleTarget.status !== "rejected") throw new Error("expected rejected");
    expect(conflatedInventoryAsVisibleTarget.issues.some((issue) =>
      issue.code === "claim_not_supported" || issue.code === "sentence_plan_not_supported"
    )).toBe(true);
  });

  it("keeps compact projection available for direct scene target dedupe boundaries", () => {
    const text = renderCleanAuthorityProjection(sceneFrameSnapshotWithOverlappingTargetsView());

    expect(text).toBe("You are at Market. Guide is here. You have Courier satchel with you. Brass Tube and Notice Board are visible. At Market, North Hall is the exit you can choose; it takes 1 minute.");
    expect(text).not.toContain("Guide, Courier satchel");
    expect(text).not.toContain("Guide, Brass Tube");
    expect(text).not.toContain("Courier satchel is visible");
    expect(text).not.toContain("North Hall is visible");
    expect(text.match(/\bGuide\b/gu)).toHaveLength(1);
  });

  it("uses model-authored literary narration for overlapping direct scene targets", async () => {
    const view = sceneFrameSnapshotWithOverlappingTargetsView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Guide is here, with Brass Tube and Notice Board visible.",
          evidenceRefs: ["e2", "e4"],
          backendFactRefs: ["e2.f1", "e4.f3", "e4.f4", "e4.f5"],
          claimKinds: ["visible_actor", "visible_target"],
        },
        {
          text: "You have Courier satchel with you.",
          evidenceRefs: ["e3"],
          backendFactRefs: ["e3.f1"],
          claimKinds: ["inventory_status"],
        },
        {
          text: "At Market, North Hall is the exit you can choose.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f2", "e5.f3", "e5.f4"],
          claimKinds: ["movement_option"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toContain("Guide is here");
    expect(result.text).not.toContain("Guide, Courier satchel");
    expect(result.text).not.toContain("Guide, Brass Tube");
    expect(result.text).not.toContain("Courier satchel is visible");
    expect(result.text).not.toContain("North Hall is visible");
    expect(result.text.match(/\bGuide\b/gu)).toHaveLength(1);

    const actorAction = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Guide waits in Market while Brass Tube is visible.",
        evidenceRefs: ["e1", "e2", "e4"],
        backendFactRefs: ["e1.f1", "e2.f1", "e4.f4"],
        claimKinds: ["current_scene", "visible_actor", "visible_target"],
      }]),
    });
    expect(actorAction.status).toBe("rejected");

    const inventoryPhrase = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Guide is here, with Brass Tube and Notice Board visible.",
          evidenceRefs: ["e2", "e4"],
          backendFactRefs: ["e2.f1", "e4.f3", "e4.f4", "e4.f5"],
          claimKinds: ["visible_actor", "visible_target"],
        },
        {
          text: "Courier satchel remains with you.",
          evidenceRefs: ["e3"],
          backendFactRefs: ["e3.f1"],
          claimKinds: ["inventory_status"],
        },
        {
          text: "At Market, North Hall is the exit you can choose.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f2", "e5.f3", "e5.f4"],
          claimKinds: ["movement_option"],
        },
      ]),
    });
    expect(inventoryPhrase.status).toBe("accepted");
  });

  it("renders dialogue response evidence without promoting the quote to world truth", () => {
    const text = renderCleanAuthorityProjection(dialogueView());

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

  it("renders dialogue projection from role value instead of quote-shaped fact text", () => {
    const base = dialogueView();
    const evidence = base.acceptedEvidence[0]!;
    const roleValueView = movementView({
      acceptedEvidence: [{
        ...evidence,
        backendFacts: evidence.backendFacts.map((fact) =>
          fact.role === "dialogue_quote"
            ? { ...fact, text: "Opaque accepted dialogue fact." }
            : fact
        ),
      }],
    });
    const missingValueView = movementView({
      acceptedEvidence: [{
        ...evidence,
        backendFacts: evidence.backendFacts.map((fact) => {
          if (fact.role !== "dialogue_quote") return fact;
          const { value: _value, ...withoutValue } = fact;
          return withoutValue;
        }),
      }],
    });

    expect(renderCleanAuthorityProjection(roleValueView))
      .toBe('Guide says: "The north stairs flooded before dawn."');
    expect(() => renderCleanAuthorityProjection(missingValueView))
      .toThrow("Dialogue projection requires accepted dialogue quote value evidence.");
  });

  it("uses model-authored literary narration for dialogue without promoting quote truth", async () => {
    const view = dialogueWithSceneFrameSnapshotView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: 'In Market, Guide gives the answer: "The north stairs flooded before dawn."',
        evidenceRefs: ["e1", "e5"],
        backendFactRefs: ["e1.f1", "e5.f1", "e5.f2"],
        claimKinds: ["current_scene", "dialogue_response"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe('In Market, Guide gives the answer: "The north stairs flooded before dawn."');
    expect(result.text).not.toMatch(/\b(route|arrive|travel|durable world fact|true|confirmed by the world)\b/iu);
  });

  it("uses later accepted scene_texture for dialogue_response prose when texture is available", async () => {
    const view = dialogueWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: 'At Market, Guide answers: "The north stairs flooded before dawn."',
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f1", "e1.f2", "e3.f1"],
          claimKinds: ["dialogue_response", "current_scene"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe('Rain taps the brass gutters. At Market, Guide answers: "The north stairs flooded before dawn."');
    expect(result.text).not.toMatch(/\b(Route option|receipt|durable world fact|confirmed by the world|either|or)\b/iu);
  });

  it("accepts dialogue_response prose with structurally cited texture choices", () => {
    const view = dialogueWithSceneTextureView();
    const missingTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: 'At Market, Guide answers: "The north stairs flooded before dawn."',
        evidenceRefs: ["e1", "e3"],
        backendFactRefs: ["e1.f1", "e1.f2", "e3.f1"],
        claimKinds: ["dialogue_response", "current_scene"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const selectedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: 'At Market, Guide answers: "The north stairs flooded before dawn."',
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f1", "e1.f2", "e3.f1"],
          claimKinds: ["dialogue_response", "current_scene"],
        },
      ]),
    });
    expect(selectedTexture.status).toBe("accepted");
  });

  it("renders support actor materialization without inventing dialogue or services", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For support_actor_materialization");
    const text = renderCleanAuthorityProjection(supportActorView());

    expect(text).toBe("At Market, Local Vendor is visible beside a counter or stall, with worn wood nearby.");
    for (const forbidden of [
      "Visible support actor",
      "Visible person now in view",
      "Support role",
      "Ordinary scene role",
      "Anchor scene",
      "Scene anchor",
      "Materialization result",
      "Presence result",
      "has set up",
      "set up",
      "says",
      "offers",
      "knows",
      "service",
      "future",
    ]) {
      expect(text).not.toContain(forbidden);
    }

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

  it("uses deterministic support_actor_materialization prose without scene_texture", async () => {
    const view = supportActorView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "Local Vendor takes a visible place at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f1"],
        claimKinds: ["visible_actor", "support_actor_materialization"],
      }]),
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("At Market, Local Vendor is visible beside a counter or stall, with worn wood nearby.");
    for (const forbidden of [
      "Visible support actor",
      "Visible person now in view",
      "Support role",
      "Ordinary scene role",
      "Anchor scene",
      "Scene anchor",
      "Materialization result",
      "Presence result",
      "has set up",
      "set up",
      "says",
      "offers",
      "knows",
      "service",
      "future",
      "route",
      "movement",
      "no change",
      "nothing changed",
    ]) {
      expect(result.text).not.toContain(forbidden);
    }
  });

  it("uses accepted scene_texture for deterministic support_actor_materialization prose when texture is available", async () => {
    const view = supportActorWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, Local Vendor glances up from a narrow plank counter.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6", "e1.f7", "e1.f3", "e1.f1", "e3.f1"],
          claimKinds: ["visible_actor", "support_actor_materialization", "current_scene"],
        },
      ]),
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe("Canvas awnings hang over the market lanes. At Market, Local Vendor is visible beside a counter or stall, with worn wood nearby.");
    for (const forbidden of [
      "has set up",
      "set up",
      "says",
      "offers",
      "service",
      "knows",
      "future",
      "relationship",
      "route",
      "movement",
      "no change",
      "nothing changed",
    ]) {
      expect(result.text).not.toContain(forbidden);
    }
  });

  it("accepts support_actor_materialization prose with structurally cited texture choices", () => {
    const view = supportActorWithSceneTextureView();
    const missingTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, Local Vendor glances up from a narrow plank counter.",
        evidenceRefs: ["e1", "e3"],
        backendFactRefs: ["e1.f2", "e1.f4", "e1.f6", "e1.f7", "e1.f3", "e1.f1", "e3.f1"],
        claimKinds: ["visible_actor", "support_actor_materialization", "current_scene"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const laterTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, Local Vendor glances up from a narrow plank counter.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6", "e1.f7", "e1.f3", "e1.f1", "e3.f1"],
          claimKinds: ["visible_actor", "support_actor_materialization", "current_scene"],
        },
      ]),
    });
    expect(laterTexture.status).toBe("accepted");
  });

  it("uses separate support presence and dialogue beats for composed support_actor dialogue", async () => {
    const view = supportActorWithDialogueAndSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, Local Vendor glances up from a narrow plank counter.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f4", "e1.f6", "e1.f7", "e1.f3", "e1.f1"],
          claimKinds: ["visible_actor", "support_actor_materialization"],
        },
        {
          text: 'Local Vendor answers: "The audit bell rang before dawn."',
          evidenceRefs: ["e4"],
          backendFactRefs: ["e4.f1", "e4.f2"],
          claimKinds: ["dialogue_response"],
        },
      ]),
    });

    expect(result.source).toBe("deterministic_authority_projection");
    expect(result.text).toBe('Canvas awnings hang over the market lanes. At Market, Local Vendor is visible beside a counter or stall, with worn wood nearby. Local Vendor says: "The audit bell rang before dawn."');
    for (const forbidden of [
      "has set up",
      "set up",
      "offers",
      "service",
      "trade",
      "knows",
      "future",
      "relationship",
      "route",
      "movement",
      "no change",
      "nothing changed",
    ]) {
      expect(result.text).not.toContain(forbidden);
    }
  });

  it("renders Player local condition evidence without inventing HP, cover, combat, movement, or no-change", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For player_local_condition");
    const text = renderCleanAuthorityProjection(playerLocalConditionView());

    expect(text).toBe("Player is kneeling.");
    expect(text).not.toMatch(/\bCondition key|Current scene anchor|Condition result|hp|damage|cover|combat|moves?|nothing changed|no change\b/iu);

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

  it("uses model-authored player_local_condition prose without scene_texture even with snapshot context", async () => {
    const view = playerLocalConditionWithSceneFrameSnapshotView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "You hold your hands plainly visible at Market.",
        evidenceRefs: ["e5"],
        backendFactRefs: ["e5.f1", "e5.f3", "e5.f4", "e5.f5"],
        claimKinds: ["player_local_condition"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("You hold your hands plainly visible at Market.");
    expect(result.text).not.toMatch(/\b(Condition key|Current scene anchor|Condition result|Condition target|inventory|route|at hand|visible target|still|remains?|no change)\b/iu);
  });

  it("uses accepted scene_texture for player_local_condition prose when texture is available", async () => {
    const view = playerLocalConditionWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Player is kneeling at Market.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f1", "e1.f3", "e1.f4", "e3.f1"],
          claimKinds: ["player_local_condition", "current_scene"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Player is kneeling at Market.");
    expect(result.text).not.toMatch(/\b(hp|damage|cover|combat|moves?|route|item custody|dialogue|no change|nothing changed)\b/iu);
  });

  it("accepts player_local_condition prose with structurally cited texture choices", () => {
    const view = playerLocalConditionWithSceneTextureView();
    const missingTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Player is kneeling at Market.",
        evidenceRefs: ["e1", "e3"],
        backendFactRefs: ["e1.f1", "e1.f3", "e1.f4", "e3.f1"],
        claimKinds: ["player_local_condition", "current_scene"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const selectedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Player is kneeling at Market.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f1", "e1.f3", "e1.f4", "e3.f1"],
          claimKinds: ["player_local_condition", "current_scene"],
        },
      ]),
    });
    expect(selectedTexture.status).toBe("accepted");
  });

  it("renders item_state evidence without expanding it into dialogue, discovery, use, consent, or no-change", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For item_state");
    const text = renderCleanAuthorityProjection(itemStateView());

    expect(text).toBe("Brass Tube is carried by Guide at Market.");
    expect(text).not.toMatch(/\b(item state|Item label|Operation|Source|Target|Final equip state|Current scene anchor|Item transfer result|says|discovers?|uses?|activates?|consents?|reacts?|nothing changed|no change)\b/iu);

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

  it("renders item-state projection from role value instead of settled-custody fact text prefix", () => {
    const base = itemStateView();
    const evidence = base.acceptedEvidence[0]!;
    const roleValueView = movementView({
      acceptedEvidence: [{
        ...evidence,
        backendFacts: evidence.backendFacts.map((fact) =>
          fact.role === "settled_custody"
            ? { ...fact, text: "Opaque accepted item-state fact." }
            : fact
        ),
      }],
    });
    const missingValueView = movementView({
      acceptedEvidence: [{
        ...evidence,
        backendFacts: evidence.backendFacts.map((fact) => {
          if (fact.role !== "settled_custody") return fact;
          const { value: _value, ...withoutValue } = fact;
          return withoutValue;
        }),
      }],
    });

    expect(renderCleanAuthorityProjection(roleValueView))
      .toBe("Brass Tube is carried by Guide at Market.");
    expect(() => renderCleanAuthorityProjection(missingValueView))
      .toThrow("Item-state projection requires accepted Settled custody value evidence.");
  });

  it("uses model-authored literary narration for item_state instead of compact status prose", async () => {
    const view = itemStateView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
        claimKinds: ["item_state"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Brass Tube passes from Player to Guide, and Guide carries it at Market.");
    expect(result.text).not.toMatch(/\b(item state|Operation|Final equip state|Current scene anchor|Item transfer result|says|accepts|reacts|consents|uses|activates|nothing changed|no change)\b/iu);
  });

  it("accepts scene-custody item_state prose from the typed custody task card", () => {
    const view = itemStateView();
    const promptInput = buildCleanNarratorPromptInput(view);
    const itemStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_item_custody"
    );

    expect(itemStep?.proseAssembly.sentenceShape).toBe("scene_custody_beat_line");
    expect(itemStep?.proseAssembly.materialWeaveOrder).toBe("item_then_custody_then_holder_scene");
    expect(itemStep?.literaryCue.renderShape).toBe("weave_item_custody_scene_beat");

    const result = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "The Brass Tube passes from Player to Guide and settles carried with Guide at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
        claimKinds: ["item_state"],
      }]),
    });

    expect(result.status).toBe("accepted");
  });

  it("uses accepted scene_texture for item_state prose when texture is available", async () => {
    const view = itemStateWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
          claimKinds: ["item_state"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Brass Tube passes from Player to Guide, and Guide carries it at Market.");
    expect(result.text).not.toMatch(/\b(item state|Operation|Final equip state|Current scene anchor|Item transfer result|accepts|reacts|consents|uses|activates|nothing changed|no change)\b/iu);
  });

  it("accepts item_state prose that omits scene_texture when item refs are structurally valid", () => {
    const view = itemStateWithSceneTextureView();
    const result = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
        claimKinds: ["item_state"],
      }]),
    });

    expect(result.status).toBe("accepted");
  });

  it("accepts standalone item_state prose that cites a later scene_texture fact", () => {
    const view = itemStateWithSceneTextureView();
    const result = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
          claimKinds: ["item_state"],
        },
      ]),
    });

    expect(result.status).toBe("accepted");
  });

  it("uses model-authored literary narration for composed item_state plus dialogue_response", async () => {
    const view = itemStateWithDialogueView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
          claimKinds: ["item_state"],
        },
        {
          text: 'He follows it with a plain answer: "The north stairs flooded before dawn."',
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1", "e2.f2"],
          claimKinds: ["dialogue_response"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toContain("Brass Tube passes from Player to Guide");
    expect(result.text).toContain('"The north stairs flooded before dawn."');
    expect(result.text).not.toMatch(/\b(item state|Operation|Final equip state|Current scene anchor|Item transfer result|accepts|reacts|consents|uses|activates|nothing changed|no change)\b/iu);
  });

  it("uses accepted scene_texture for composed item_state plus dialogue_response without expanding the quote into truth", async () => {
    const view = itemStateWithDialogueAndSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e3"],
          backendFactRefs: ["e3.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Brass Tube passes from Player to Guide, and Guide carries it at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
          claimKinds: ["item_state"],
        },
        {
          text: 'Guide answers: "The north stairs flooded before dawn."',
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f1", "e2.f2"],
          claimKinds: ["dialogue_response"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe('Rain taps the brass gutters. Brass Tube passes from Player to Guide, and Guide carries it at Market. Guide answers: "The north stairs flooded before dawn."');
    expect(result.text).not.toMatch(/\b(durable world fact|confirmed by the world|accepts|reacts|consents|uses|activates|nothing changed|no change)\b/iu);
  });

  it("renders minor_poi_handle evidence without route, location, service, sign-text, or no-change claims", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For minor_poi_handle");
    const text = renderCleanAuthorityProjection(minorPoiHandleView());

    expect(text).toBe("Tea Stall is now available here as a visible stall.");
    for (const forbidden of [
      "Visible current-scene",
      "Place handle",
      "Current scene anchor",
      "Handle result",
      "target handle",
      "place handle",
      "route",
      "reachable",
      "travel",
      "arrive",
      "service",
      "inventory",
      "sign says",
      "nothing changed",
      "no change",
    ]) {
      expect(text).not.toContain(forbidden);
    }

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

  it("uses model-authored minor_poi_handle prose without scene_texture", async () => {
    const view = minorPoiHandleView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "At Market, Tea Stall marks a visible stall.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f5"],
        claimKinds: ["minor_poi_handle", "visible_target"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("At Market, Tea Stall marks a visible stall.");
    for (const forbidden of [
      "Visible current-scene",
      "Place handle",
      "Current scene anchor",
      "Handle result",
      "target handle",
      "place handle",
      "route",
      "reachable",
      "travel",
      "service",
      "inventory",
      "sign says",
      "nothing changed",
      "no change",
    ]) {
      expect(result.text).not.toContain(forbidden);
    }
  });

  it("uses accepted scene_texture for minor_poi_handle prose when texture is available", async () => {
    const view = minorPoiHandleWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Tea Stall is available here as a visible stall at Market.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f5", "e3.f1"],
          claimKinds: ["minor_poi_handle", "visible_target", "current_scene"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Tea Stall is available here as a visible stall at Market.");
    for (const forbidden of [
      "target handle",
      "place handle",
      "route",
      "reachable",
      "travel",
      "arrive",
      "service",
      "inventory",
      "sign says",
      "business",
      "discover",
      "world fact",
      "no change",
      "nothing changed",
    ]) {
      expect(result.text).not.toContain(forbidden);
    }
  });

  it("accepts minor_poi_handle prose with structurally cited texture choices", () => {
    const view = minorPoiHandleWithSceneTextureView();
    const missingTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Tea Stall is available here as a visible stall at Market.",
        evidenceRefs: ["e1", "e3"],
        backendFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f5", "e3.f1"],
        claimKinds: ["minor_poi_handle", "visible_target", "current_scene"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const selectedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Tea Stall is available here as a visible stall at Market.",
          evidenceRefs: ["e1", "e3"],
          backendFactRefs: ["e1.f2", "e1.f3", "e1.f4", "e1.f5", "e3.f1"],
          claimKinds: ["minor_poi_handle", "visible_target", "current_scene"],
        },
      ]),
    });
    expect(selectedTexture.status).toBe("accepted");
  });

  it("renders local_observation evidence without broad absence, discovery, route truth, device status, or no-change", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For local_observation");
    const text = renderCleanAuthorityProjection(localObservationView());

    expect(text).toBe("The visible actors and visible targets show no match for \"Violet Astrolabe\".");
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

    const broadAbsence = validateCleanNarrationCandidate({
      view: localObservationView(),
      candidate: acceptedCandidate(localObservationView(), [{
        text: "The Violet Astrolabe is absent from the market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f1"],
        claimKinds: ["local_observation", "bounded_visibility_negative"],
      }]),
    });
    expect(broadAbsence.status).toBe("accepted");
  });

  it("uses model-authored positive local_observation prose without texture", async () => {
    const view = positiveLocalObservationView();
    const promptInput = buildCleanNarratorPromptInput(view);
    const observationStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_local_observation"
    );

    expect(observationStep?.preferredBackendFactRefs).toEqual(["e1.f4", "e1.f6"]);
    expect(observationStep?.proseAssembly.sentenceShape).toBe("local_observation_line");
    expect(observationStep?.proseAssembly.materialWeaveOrder).toBe("observed_labels_then_scene");

    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "The central telegraph desk is visible at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f4", "e1.f6"],
        claimKinds: ["local_observation", "visible_target"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe(
      "The central telegraph desk is visible at Market.",
    );
    expect(result.text).not.toMatch(/SceneFrame|worldVersion|visible target|visible marks|moving parts|touch|move/iu);
  });

  it("uses model-authored bounded negative local_observation prose without texture", async () => {
    const view = localObservationView();
    let modelCalls = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => {
        modelCalls += 1;
        return acceptedCandidate(view, [{
          text: "Among the checked visible entries, \"Violet Astrolabe\" has no matching visible result.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1", "e1.f2", "e1.f3"],
          claimKinds: ["local_observation", "bounded_visibility_negative"],
        }]);
      },
    });

    expect(modelCalls).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("Among the checked visible entries, \"Violet Astrolabe\" has no matching visible result.");
  });

  it("uses model-authored local_observation prose when accepted scene_texture is available", async () => {
    const view = positiveLocalObservationWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "The central telegraph desk is visible at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f4", "e1.f6"],
          claimKinds: ["local_observation", "visible_target"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. The central telegraph desk is visible at Market.");
    expect(result.text).not.toMatch(/SceneFrame|worldVersion|visible target|visible marks|moving parts|touch|move/iu);

    const selectedTextureRepeated = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "The central telegraph desk is visible at Market.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f4", "e1.f6"],
          claimKinds: ["local_observation", "visible_target"],
        },
      ]),
    });
    expect(selectedTextureRepeated.status).toBe("accepted");

    const omittedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "The central telegraph desk is visible at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f4", "e1.f6"],
        claimKinds: ["local_observation", "visible_target"],
      }]),
    });
    expect(omittedTexture.status).toBe("accepted");

    const uncitedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "The central telegraph desk is visible at Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f4", "e1.f6"],
        claimKinds: ["local_observation", "visible_target"],
      }]),
    });
    expect(uncitedTexture.status).toBe("accepted");

    const reserveCitedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Market stalls surround the central telegraph desk.",
        evidenceRefs: ["e1", "e2"],
        backendFactRefs: ["e1.f4", "e1.f6", "e2.f1"],
        claimKinds: ["local_observation", "visible_target", "scene_texture"],
      }]),
    });
    expect(reserveCitedTexture.status).toBe("rejected");
  });

  it("shapes visible-actor local_observation as an observation beat with texture", async () => {
    const view = visibleActorLocalObservationWithSceneTextureView();
    const promptInput = buildCleanNarratorPromptInput(view);
    const observationStep = promptInput.narrativePageTask.sentencePlan.find((step) =>
      step.beatObjective === "render_local_observation"
    );

    expect(observationStep?.preferredBackendFactRefs).toEqual(["e1.f4", "e1.f6"]);
    expect(observationStep?.adventureCue.subjectFocus).toBe("observed_visible_entries");
    expect(observationStep?.adventureCue.verbFrame).toBe("land_visible_observation");
    expect(observationStep?.proseAssembly.sentenceShape).toBe("local_observation_line");
    expect(observationStep?.literaryCue.renderShape).toBe("land_visible_observation");

    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Guide is in sight at Lowwater Bazaar.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f4", "e1.f6"],
          claimKinds: ["local_observation"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Guide is in sight at Lowwater Bazaar.");
    for (const internalToken of ["SceneFrame", "worldVersion", "surface entry", "visible actor", "route", "Brass Tube", "no change"]) {
      expect(result.text).not.toContain(internalToken);
    }
  });

  it("uses model-authored local_observation movement-option prose without hidden placeholders", async () => {
    const routeBeat = "The visible route choices here are North Hall, East Gate, South Dock, West Yard, Bell Tower, Lantern Row, The Copper Tap, Upper Dam Ruins.";
    const view = movementView({
      acceptedEvidence: [{
        ref: "e1",
        authority: "local_observation_receipt",
        claimKinds: ["local_observation"],
        text: routeBeat,
        backendFacts: [
          { factRef: "e1.f1", role: "local_observation_beat", value: routeBeat, text: `Local observation beat: ${routeBeat}`, exact: true },
          { factRef: "e1.f2", text: "Searched visible surfaces: route options.", exact: true },
          { factRef: "e1.f3", text: "Observation query: visible routes and local targets.", exact: true },
          { factRef: "e1.f4", role: "observed_entry_labels", value: "North Hall; East Gate; South Dock; West Yard; Bell Tower; Lantern Row; The Copper Tap; Upper Dam Ruins", text: "Observed entry labels: North Hall; East Gate; South Dock; West Yard; Bell Tower; Lantern Row; The Copper Tap; Upper Dam Ruins.", exact: true },
          { factRef: "e1.f5", role: "observed_entry_surfaces", text: "Observed entry surfaces: route option North Hall; route option East Gate; route option South Dock; route option West Yard; route option Bell Tower; route option Lantern Row; route option The Copper Tap; route option Upper Dam Ruins.", exact: true },
          { factRef: "e1.f6", role: "anchor_scene", value: "Market", text: "Anchor scene: Market.", exact: true },
          { factRef: "e1.f7", role: "anchor_location", value: "Market", text: "Anchor location: Market.", exact: true },
        ],
        limits: {
          proves: ["matching exposed current SceneFrame observation surface entries"],
          doesNotProve: ["route truth beyond route option/check receipts", "movement", "no-change"],
        },
      }],
    });
    let modelCalls = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => {
        modelCalls += 1;
        return acceptedCandidate(view, [{
          text: "At Market, North Hall, East Gate, South Dock, West Yard, Bell Tower, Lantern Row, The Copper Tap, and Upper Dam Ruins are visible route choices.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f4", "e1.f6"],
          claimKinds: ["local_observation"],
        }]);
      },
    });

    expect(modelCalls).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("At Market, North Hall, East Gate, South Dock, West Yard, Bell Tower, Lantern Row, The Copper Tap, and Upper Dam Ruins are visible route choices.");
    expect(result.text).toContain("The Copper Tap");
    expect(result.text).toContain("Upper Dam Ruins");
    expect(result.text).not.toContain("[hidden]");
    expect(result.text).not.toContain("movement_option");
    expect(result.text).not.toContain("visible_target");
    expect(result.text).not.toContain("SceneFrame");

    const missingObservedLabel = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, North Hall, East Gate, South Dock, West Yard, Bell Tower, Lantern Row, and The Copper Tap are visible route choices.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f4", "e1.f6"],
        claimKinds: ["local_observation"],
      }]),
    });
    expect(missingObservedLabel.status).toBe("accepted");
  });

  it("uses model-authored direct-scene prose for scene_observation receipts with direct-scene guards", async () => {
    const view = sceneObservationReceiptView();
    let modelCalls = 0;
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => {
        modelCalls += 1;
        return acceptedCandidate(view, [{
          text: "At Market, Guide is in view, and North Hall is an exit you can choose. You have Courier satchel with you.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f2", "e5.f4", "e5.f5", "e5.f7"],
          claimKinds: ["current_scene", "visible_actor", "inventory_status", "movement_option"],
        }]);
      },
    });

    expect(modelCalls).toBe(1);
    expect(result.source).toBe("model");
    expect(result.text).toBe("At Market, Guide is in view, and North Hall is an exit you can choose. You have Courier satchel with you.");
    expect(result.text).not.toMatch(/\b(Current scene is|Visible actor:|Inventory item:|Movement option:|backend|receipt|nothing changed|no change)\b/iu);

    const inventoryPhrase = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, Guide is in view, Courier satchel stays with you, and North Hall is an exit you can choose.",
        evidenceRefs: ["e5"],
        backendFactRefs: ["e5.f2", "e5.f4", "e5.f5", "e5.f7"],
        claimKinds: ["current_scene", "visible_actor", "inventory_status", "movement_option"],
      }]),
    });
    expect(inventoryPhrase.status).toBe("accepted");

    const inventoryAsVisibleTarget = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "At Market, Guide, Courier satchel, and North Hall are visible.",
        evidenceRefs: ["e5"],
        backendFactRefs: ["e5.f2", "e5.f4", "e5.f5", "e5.f7"],
        claimKinds: ["current_scene", "visible_actor", "visible_target", "inventory_status", "movement_option"],
      }]),
    });
    expect(inventoryAsVisibleTarget.status).toBe("rejected");
    if (inventoryAsVisibleTarget.status !== "rejected") throw new Error("expected rejected");
    expect(inventoryAsVisibleTarget.issues.some((issue) =>
      issue.code === "claim_not_supported" || issue.code === "sentence_plan_not_supported"
    )).toBe(true);

    const texturedView = sceneObservationReceiptWithSceneTextureView();
    const missingTexture = validateCleanNarrationCandidate({
      view: texturedView,
      candidate: acceptedCandidate(texturedView, [{
        text: "At Market, Guide is in view, and North Hall is an exit you can choose. You have Courier satchel with you.",
        evidenceRefs: ["e5"],
        backendFactRefs: ["e5.f2", "e5.f4", "e5.f5", "e5.f7"],
        claimKinds: ["current_scene", "visible_actor", "inventory_status", "movement_option"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const texturedResult = await runCleanNarration({
      narratorView: texturedView,
      provider,
      generateCandidate: async () => acceptedCandidate(texturedView, [
        {
          text: "Canvas awnings hang over the market lanes.",
          evidenceRefs: ["e6"],
          backendFactRefs: ["e6.f1"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "At Market, Guide is in view, and North Hall is an exit you can choose. You have Courier satchel with you.",
          evidenceRefs: ["e5"],
          backendFactRefs: ["e5.f2", "e5.f4", "e5.f5", "e5.f7"],
          claimKinds: ["current_scene", "visible_actor", "inventory_status", "movement_option"],
        },
      ]),
    });
    expect(texturedResult.source).toBe("model");
    expect(texturedResult.text).toBe("Canvas awnings hang over the market lanes. At Market, Guide is in view, and North Hall is an exit you can choose. You have Courier satchel with you.");
  });

  it("renders device_surface_observation evidence without private messages, no-signal, no-message, or no-change claims", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("For device_surface_observation");
    const text = renderCleanAuthorityProjection(deviceSurfaceObservationView());

    expect(text).toBe("Burner phone's visible surface shows no requested message indicator.");
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

  it("uses model-authored device_surface_observation prose without scene_texture", async () => {
    const view = deviceSurfaceObservationView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [{
        text: "The Burner phone gives back no requested message indicator on its visible surface.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
        claimKinds: ["device_surface_observation", "device_surface_unavailable"],
      }]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("The Burner phone gives back no requested message indicator on its visible surface.");
    expect(result.text).not.toMatch(/frame\/worldVersion|message_indicator|no messages|no calls|no signal|nothing changed|no change|instructions|network|screen|lit|unlit/iu);
  });

  it("accepts deterministic-looking device_surface_observation text by structured refs", () => {
    const result = validateCleanNarrationCandidate({
      view: deviceSurfaceObservationView(),
      candidate: acceptedCandidate(deviceSurfaceObservationView(), [{
        text: "Burner phone's visible surface shows no requested message indicator.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
        claimKinds: ["device_surface_observation", "device_surface_unavailable"],
      }]),
    });

    expect(result.status).toBe("accepted");
  });

  it("uses accepted scene_texture for device_surface_observation prose when texture is available", async () => {
    const view = deviceSurfaceObservationWithSceneTextureView();
    const result = await runCleanNarration({
      narratorView: view,
      provider,
      generateCandidate: async () => acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Burner phone shows no requested message indicator on its visible surface.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
          claimKinds: ["device_surface_observation", "device_surface_unavailable"],
        },
      ]),
    });

    expect(result.source).toBe("model");
    expect(result.text).toBe("Rain taps the brass gutters. Burner phone shows no requested message indicator on its visible surface.");
    expect(result.text).not.toMatch(/frame\/worldVersion|message_indicator|private message|no messages|no calls|no signal|nothing changed|no change|instructions|network|sender|caller/iu);
  });

  it("accepts device_surface_observation prose with structurally cited texture choices", () => {
    const view = deviceSurfaceObservationWithSceneTextureView();
    const missingTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Burner phone shows no requested message indicator on its visible surface.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
        claimKinds: ["device_surface_observation", "device_surface_unavailable"],
      }]),
    });
    expect(missingTexture.status).toBe("accepted");

    const selectedTexture = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "Burner phone shows no requested message indicator on its visible surface.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
          claimKinds: ["device_surface_observation", "device_surface_unavailable"],
        },
      ]),
    });
    expect(selectedTexture.status).toBe("accepted");
  });

  it("accepts device no-surface wording when typed refs remain bounded", () => {
    const view = deviceSurfaceObservationWithSceneTextureView();
    const result = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [
        {
          text: "Rain taps the brass gutters.",
          evidenceRefs: ["e2"],
          backendFactRefs: ["e2.f2"],
          claimKinds: ["scene_texture"],
        },
        {
          text: "The Burner phone screen shows no signal indicator, no message indicator, and no call indicator lit on its current surface.",
          evidenceRefs: ["e1"],
          backendFactRefs: ["e1.f1", "e1.f2", "e1.f3", "e1.f4"],
          claimKinds: ["device_surface_observation", "device_surface_unavailable"],
        },
      ]),
    });

    expect(result.status).toBe("accepted");
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
    const promptInput = buildCleanNarratorPromptInput(view);
    expect(promptInput.narrativePageTask.pageArc).toEqual({
      arcShape: "audit_notice_only",
      pageCadence: "audit_notice_only",
      readerPosture: "review_audit_notice",
      closingIntent: "audit_notice",
    });
    expect(promptInput.narrativePageTask.pageVariation).toEqual({
      openingRotation: "audit_notice_first",
      cadenceTarget: "audit_notice_sentence",
      dictionPalette: ["audit_notice_clarity"],
      variationBoundary: "vary_syntax_only_inside_cited_material",
    });
    expect(promptInput.narrativePageTask.pageFocus).toEqual({
      coreMoveRefs: [],
      frameMoveRefs: [],
      coreSentenceRefs: [],
      frameSentenceRefs: [],
      preferredFrameSentenceRefs: [],
      emphasis: "audit_notice",
      frameSelection: "audit_notice_only",
      coreFrameRelationship: "audit_notice_only",
      contextUse: "audit_only",
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
    expect(renderCleanAuthorityProjection(view)).toContain("not confirmed");
  });

  it("rejects private terms and exact prompt-owned internal token leaks", () => {
    const view = movementView();
    const result = validateCleanNarrationCandidate({
      view,
      candidate: movementCandidate(`You move to North Hall, then ${view.packetId}, e1.f1, and the secret chamber remain visible.`),
    });

    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") throw new Error("expected rejected");
    expect(result.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "backend_ref",
      "private_term",
    ]));
  });

  it("accepts punctuation that only looked like backend syntax under the removed mask", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate("You move to North Hall; route: open, roll steady."),
    });

    expect(result.status).toBe("accepted");
  });

  it("normalizes sentence and final text whitespace without regex masking", () => {
    const candidate = movementCandidate("After 1 minute,\n\tyou reach North Hall.");
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: {
        ...candidate,
        finalText: "After 1 minute, you reach North Hall.",
      },
    });

    expect(result.status).toBe("accepted");
  });

  it("accepts concise prose when structural movement refs are valid", () => {
    for (const text of [
      "Done.",
      "Вы идете.",
    ]) {
      const result = validateCleanNarrationCandidate({
        view: movementView(),
        candidate: movementCandidate(text),
      });

      expect(result.status, text).toBe("accepted");
    }
  });

  it("accepts receipt-shaped wording according to structured refs rather than marker scanning", () => {
    const view = itemStateView();
    const result = validateCleanNarrationCandidate({
      view,
      candidate: acceptedCandidate(view, [{
        text: "Settled custody: Brass Tube is carried by Guide at Market. Target: Guide. Final equip state: carried. Current scene anchor: Market.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2", "e1.f1", "e1.f3", "e1.f5", "e1.f6", "e1.f7"],
        claimKinds: ["item_state"],
      }]),
    });

    expect(result.status).toBe("accepted");
  });

  it("does not reject accepted narration only for old donor prose shapes", () => {
    const result = validateCleanNarrationCandidate({
      view: movementView(),
      candidate: movementCandidate("After one minute, you reach North Hall, and the world narrowed around the step."),
    });

    expect(result.status).toBe("accepted");
  });

  it("governs deterministic-looking authority text by structural refs", () => {
    const deterministicCandidate = (view: CleanNarratorView): CleanNarrationCandidate => acceptedCandidate(view, [{
      text: renderCleanAuthorityProjection(view),
      evidenceRefs: view.acceptedEvidence.map((evidence) => evidence.ref).slice(0, 12),
      backendFactRefs: view.acceptedEvidence.flatMap((evidence) =>
        evidence.backendFacts.map((fact) => fact.factRef)
      ).slice(0, 12),
      claimKinds: [...new Set(view.acceptedEvidence.flatMap((evidence) => evidence.claimKinds))],
    }]);
    const views = [
      itemStateView(),
      dialogueView(),
      sceneFrameSnapshotView(),
      movementView(),
      routeWithSceneFrameSnapshotView(),
      routeOptionsView(),
      positiveLocalObservationView(),
      supportActorView(),
      playerLocalConditionView(),
      minorPoiHandleView(),
      deviceSurfaceObservationView(),
    ];

    for (const view of views) {
      const label = view.acceptedEvidence.map((evidence) => evidence.authority).join(",");
      const result = validateCleanNarrationCandidate({
        view,
        candidate: deterministicCandidate(view),
      });
      if (result.status === "rejected") {
        expect(result.issues.length, label).toBeGreaterThan(0);
      }
    }

    const movementTextureView = movementWithSceneTextureView();
    const movementWithoutTexture = validateCleanNarrationCandidate({
      view: movementTextureView,
      candidate: movementCandidate("After one minute, you reach North Hall.", movementTextureView),
    });
    expect(movementWithoutTexture.status).toBe("accepted");

    const elapsedDigest = validateCleanNarrationCandidate({
      view: timeView(),
      candidate: acceptedCandidate(timeView(), [{
        text: "Five minutes pass.",
        evidenceRefs: ["e1"],
        backendFactRefs: ["e1.f2"],
        claimKinds: ["elapsed_time"],
      }]),
    });
    expect(elapsedDigest.status).toBe("accepted");

  });

  it("accepts Russian-language candidates by typed language field and structural refs", () => {
    const view = movementView({ language: "ru" });
    const result = validateCleanNarrationCandidate({
      view,
      candidate: movementCandidate("Current scene is Market.", view),
    });

    expect(result.status).toBe("accepted");
  });

  it("keeps Realism NSFW mode as an explicit opt-in narrator style layer", async () => {
    const result = await runCleanNarration({
      narratorView: modelNarrationView(),
      provider,
      styleMode: "realism_nsfw",
      generateCandidate: async (request) => {
        expect(request.styleMode).toBe("realism_nsfw");
        expect(request.system).toContain("Adult realism mode:");
        expect(request.system).toContain("slow-burn pacing");
        expect(request.system).toContain("accepted evidence refs");
        expect(request.system).not.toMatch(/\b(jailbreak|assault|never ask permission)\b/iu);
        return {
          version: "gameplay-runtime.clean-narration-candidate.v1",
          packetId: "cgpacket_test",
          turnId: "clean-turn-1",
          language: "en",
          sentences: [{
            kind: "accepted_evidence",
            text: "Guide stands nearby.",
            evidenceRefs: ["e1"],
            backendFactRefs: ["e1.f1"],
            claimKinds: ["visible_fact"],
            pageMoveRefs: ["m1"],
            sentencePlanRefs: sentencePlanRefsForSentence(modelNarrationView(), ["e1"], ["e1.f1"]),
            auditStepIds: [],
          }],
          finalText: "Guide stands nearby.",
        };
      },
    });

    expect(result.source).toBe("model");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("Adult realism mode:");
  });

  it("rejects generation failure before player-facing narration", async () => {
    await expect(runCleanNarration({
      narratorView: modelNarrationView(),
      provider,
      generateCandidate: async () => {
        throw new Error("model offline");
      },
    })).rejects.toThrow(CleanNarrationGenerationError);

    await expect(runCleanNarration({
      narratorView: modelNarrationView(),
      provider,
      generateCandidate: async () => {
        throw new Error("model offline");
      },
    })).rejects.toThrow("Clean Narration generation failed before validation");
  });

  it("projects movement only from accepted Travel beat evidence", () => {
    expect(renderCleanAuthorityProjection(movementView())).toBe("After 1 minute, you reach North Hall.");

    const view = movementView({
      acceptedEvidence: [{
        ...movementView().acceptedEvidence[0]!,
        text: "Player location changed to The Copper Tap.",
        backendFacts: [
          { factRef: "e1.f1", text: "Player location changed to The Copper Tap.", exact: true },
        ],
      }],
    });

    expect(() => renderCleanAuthorityProjection(view)).toThrow("Movement projection requires accepted Travel beat value evidence.");
  });

  it("documents that raw player action is intentionally omitted from the system prompt", () => {
    expect(buildCleanNarrationSystemPrompt()).toContain("raw player action is intentionally omitted");
    expect(buildCleanNarrationSystemPrompt()).toContain("Style role: write playable text-RPG adventure prose from accepted facts");
    expect(buildCleanNarrationSystemPrompt()).toContain("Default successful turns use one to three short fiction beats");
    expect(buildCleanNarrationSystemPrompt()).toContain("Adventure prose floor:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Default literary profile:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Zetta Micro 1.1.3");
    expect(buildCleanNarrationSystemPrompt()).toContain("FF5 Micro");
    expect(buildCleanNarrationSystemPrompt()).toContain("Micro-page rhythm:");
    expect(buildCleanNarrationSystemPrompt()).toContain("follow storyFrame.pagePlan from accepted context to accepted turn event to accepted next-action context");
    expect(buildCleanNarrationSystemPrompt()).toContain("Story page brief:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask.storyPageBrief");
    expect(buildCleanNarrationSystemPrompt()).toContain("writer-facing page kind");
    expect(buildCleanNarrationSystemPrompt()).toContain("required/optional move and sentence refs");
    expect(buildCleanNarrationSystemPrompt()).toContain("Page arc:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask.pageArc");
    expect(buildCleanNarrationSystemPrompt()).toContain("reader posture");
    expect(buildCleanNarrationSystemPrompt()).toContain("Page performance:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask.pagePerformance");
    expect(buildCleanNarrationSystemPrompt()).toContain("openingBeat");
    expect(buildCleanNarrationSystemPrompt()).toContain("pageMotion");
    expect(buildCleanNarrationSystemPrompt()).toContain("continuityMaterial");
    expect(buildCleanNarrationSystemPrompt()).toContain("readerHandoff");
    expect(buildCleanNarrationSystemPrompt()).toContain("Page variation:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask.pageVariation");
    expect(buildCleanNarrationSystemPrompt()).toContain("openingRotation");
    expect(buildCleanNarrationSystemPrompt()).toContain("cadenceTarget");
    expect(buildCleanNarrationSystemPrompt()).toContain("dictionPalette");
    expect(buildCleanNarrationSystemPrompt()).toContain("variationBoundary");
    expect(buildCleanNarrationSystemPrompt()).toContain("Page focus:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask.pageFocus");
    expect(buildCleanNarrationSystemPrompt()).toContain("coreMoveRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("coreSentenceRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("frameMoveRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("preferredFrameSentenceRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("frameSelection");
    expect(buildCleanNarrationSystemPrompt()).toContain("coreFrameRelationship");
    expect(buildCleanNarrationSystemPrompt()).toContain("Choice presentation:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask.choicePresentation");
    expect(buildCleanNarrationSystemPrompt()).toContain("anchorStyle");
    expect(buildCleanNarrationSystemPrompt()).toContain("preserve route labels verbatim");
    expect(buildCleanNarrationSystemPrompt()).toContain("reserve posture verbs for cited player_local_condition evidence");
    expect(buildCleanNarrationSystemPrompt()).toContain("adventure handoff");
    expect(buildCleanNarrationSystemPrompt()).toContain("Narrative page task:");
    expect(buildCleanNarrationSystemPrompt()).toContain("promptInput.narrativePageTask turns the story page plan into writer moves");
    expect(buildCleanNarrationSystemPrompt()).toContain("entryProseCues");
    expect(buildCleanNarrationSystemPrompt()).toContain("usableFacts");
    expect(buildCleanNarrationSystemPrompt()).toContain("Beat objectives:");
    expect(buildCleanNarrationSystemPrompt()).toContain("beatObjective");
    expect(buildCleanNarrationSystemPrompt()).toContain("movement arrival");
    expect(buildCleanNarrationSystemPrompt()).toContain("item custody");
    expect(buildCleanNarrationSystemPrompt()).toContain("dialogue reply");
    expect(buildCleanNarrationSystemPrompt()).toContain("Claim focus:");
    expect(buildCleanNarrationSystemPrompt()).toContain("claimFocus.primaryClaimKinds");
    expect(buildCleanNarrationSystemPrompt()).toContain("supportingClaimKinds");
    expect(buildCleanNarrationSystemPrompt()).toContain("combined primaryClaimKinds");
    expect(buildCleanNarrationSystemPrompt()).toContain("Fact use plan:");
    expect(buildCleanNarrationSystemPrompt()).toContain("factUses");
    expect(buildCleanNarrationSystemPrompt()).toContain("allowedBackendFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("Sentence plan:");
    expect(buildCleanNarrationSystemPrompt()).toContain("sentencePlan");
    expect(buildCleanNarrationSystemPrompt()).toContain("sentencePlanRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("preferredBackendFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("textureCue");
    expect(buildCleanNarrationSystemPrompt()).toContain("Prose materials:");
    expect(buildCleanNarrationSystemPrompt()).toContain("proseMaterials");
    expect(buildCleanNarrationSystemPrompt()).toContain("copyMode");
    expect(buildCleanNarrationSystemPrompt()).toContain("Material obligations:");
    expect(buildCleanNarrationSystemPrompt()).toContain("allowedMaterialFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("coreMaterialFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("exactCopyFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("preserveTokenFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("phraseFromMaterialFactRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("Flow cues:");
    expect(buildCleanNarrationSystemPrompt()).toContain("flowCue.pagePosition");
    expect(buildCleanNarrationSystemPrompt()).toContain("Literary cues:");
    expect(buildCleanNarrationSystemPrompt()).toContain("literaryCue.renderShape");
    expect(buildCleanNarrationSystemPrompt()).toContain("Texture cues:");
    expect(buildCleanNarrationSystemPrompt()).toContain("mode=copy_exact_texture_sentence");
    expect(buildCleanNarrationSystemPrompt()).toContain("mode=omit_texture_in_this_sentence");
    expect(buildCleanNarrationSystemPrompt()).toContain("Adventure cues:");
    expect(buildCleanNarrationSystemPrompt()).toContain("adventureCue.subjectFocus");
    expect(buildCleanNarrationSystemPrompt()).toContain("adventureCue.verbFrame");
    expect(buildCleanNarrationSystemPrompt()).toContain("adventureCue.detailPalette");
    expect(buildCleanNarrationSystemPrompt()).toContain("Prose assembly:");
    expect(buildCleanNarrationSystemPrompt()).toContain("proseAssembly.perspective");
    expect(buildCleanNarrationSystemPrompt()).toContain("sentenceShape");
    expect(buildCleanNarrationSystemPrompt()).toContain("openingSource");
    expect(buildCleanNarrationSystemPrompt()).toContain("verbEnergy");
    expect(buildCleanNarrationSystemPrompt()).toContain("detailRhythm");
    expect(buildCleanNarrationSystemPrompt()).toContain("materialWeaveOrder");
    expect(buildCleanNarrationSystemPrompt()).toContain("styleBudget");
    expect(buildCleanNarrationSystemPrompt()).toContain("closingFunction");
    expect(buildCleanNarrationSystemPrompt()).toContain("subject/verb pairings");
    expect(buildCleanNarrationSystemPrompt()).toContain("Page move proof:");
    expect(buildCleanNarrationSystemPrompt()).toContain("pageMoveRefs");
    expect(buildCleanNarrationSystemPrompt()).toContain("Cover required page moves");
    expect(buildCleanNarrationSystemPrompt()).toContain("Truthful flourish:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Every flourish remains a phrasing choice over cited evidence");
    expect(buildCleanNarrationSystemPrompt()).toContain("Reference transformation examples are patterns, not extra facts");
    expect(buildCleanNarrationSystemPrompt()).toContain("Example movement:");
    expect(buildCleanNarrationSystemPrompt()).toContain("roles `travel_beat`, `destination_label`, and `elapsed_travel_time` expose values");
    expect(buildCleanNarrationSystemPrompt()).toContain("'After 1 minute, you reach North Hall.', 'North Hall', and '1 minute'");
    expect(buildCleanNarrationSystemPrompt()).toContain("After one minute, North Hall takes your weight underfoot.");
    expect(buildCleanNarrationSystemPrompt()).toContain("Example dialogue with texture:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Rain taps the brass gutters.");
    expect(buildCleanNarrationSystemPrompt()).toContain("Composed support-dialogue surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("support_actor_presence_line");
    expect(buildCleanNarrationSystemPrompt()).toContain("quote frame");
    expect(buildCleanNarrationSystemPrompt()).toContain("Example route options:");
    expect(buildCleanNarrationSystemPrompt()).toContain("At Lowwater Bazaar, Anchor Chain Pylon and The Copper Tap are exits you can choose; each takes 1 minute.");
    expect(buildCleanNarrationSystemPrompt()).toContain("without movement, safety, discovery, or hidden-route claims");
    expect(buildCleanNarrationSystemPrompt()).toContain("Item-state surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("use the item custody sentence plan as a scene-custody task card");
    expect(buildCleanNarrationSystemPrompt()).toContain("phrase from backendFacts with roles `custody_change`, `settled_custody`, `target_label`, `final_equip_state`, and `current_scene_anchor`");
    expect(buildCleanNarrationSystemPrompt()).toContain("Item-state grammar:");
    expect(buildCleanNarrationSystemPrompt()).toContain("scene_custody_beat_line with land_scene_custody");
    expect(buildCleanNarrationSystemPrompt()).toContain("lands ownership and equip state through item-owned custody verbs");
    expect(buildCleanNarrationSystemPrompt()).toContain("Movement surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("render the accepted `travel_beat` value as the turn event");
    expect(buildCleanNarrationSystemPrompt()).toContain("Elapsed-time surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("accepted elapsed_time duration value and any cited scene_anchor material as the clock beat");
    expect(buildCleanNarrationSystemPrompt()).toContain("clock_beat_line with pressure_time");
    expect(buildCleanNarrationSystemPrompt()).toContain("pressure clock beat");
    expect(buildCleanNarrationSystemPrompt()).toContain("Route-status surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("answer the checked path as a route_status_line");
    expect(buildCleanNarrationSystemPrompt()).toContain("phrase the route_beat into ordinary path-status prose");
    expect(buildCleanNarrationSystemPrompt()).toContain("Route-options surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("render accepted route labels as scene exits the player can choose");
    expect(buildCleanNarrationSystemPrompt()).toContain("scene_exit_choice_line with exits_then_costs");
    expect(buildCleanNarrationSystemPrompt()).toContain("express the cited route_label and route_status materials");
    expect(buildCleanNarrationSystemPrompt()).toContain("Include every accepted route label");
    expect(buildCleanNarrationSystemPrompt()).toContain("Local-observation surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("observed_entry_labels plus anchor_scene");
    expect(buildCleanNarrationSystemPrompt()).toContain("local_observation_line with observed_labels_then_scene");
    expect(buildCleanNarrationSystemPrompt()).toContain("Player posture, motion, grip, search action, surface-kind wording, actor action");
    expect(buildCleanNarrationSystemPrompt()).toContain("Support-actor surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("use the support_actor_presence sentence plan as a scene-presence task card");
    expect(buildCleanNarrationSystemPrompt()).toContain("support_actor_presence_line with actor_then_scene_with_role_context");
    expect(buildCleanNarrationSystemPrompt()).toContain("let the actor label carry it when repeating the role would duplicate");
    expect(buildCleanNarrationSystemPrompt()).toContain("Player-local-condition surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("keep texture there and keep the condition beat on condition/scene materials");
    expect(buildCleanNarrationSystemPrompt()).toContain("Minor-POI surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("keep texture there and keep the POI beat on label/kind/scene materials");
    expect(buildCleanNarrationSystemPrompt()).toContain("Device-surface surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("keep texture there and keep the device beat on device/facet materials");
    expect(buildCleanNarrationSystemPrompt()).toContain("Scene-anchor surface:");
    expect(buildCleanNarrationSystemPrompt()).toContain("scene labels function as exact placement tokens");
    expect(buildCleanNarrationSystemPrompt()).toContain("Concrete prose foundation:");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("Shape pass:");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("Travel beat: After 1 minute, you reach North Hall.");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("Destination label: North Hall.");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("after the 'Scene texture:' label");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("Item label:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Echo firewall:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Texture scope:");
    expect(buildCleanNarrationSystemPrompt()).toContain("Door rotation:");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("uses the first accepted texture fact");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("uses a later texture fact");
    expect(buildCleanNarrationSystemPrompt()).not.toContain("choose a later texture fact");
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
