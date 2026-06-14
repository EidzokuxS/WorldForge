import { safeGenerateObject } from "../../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../../ai/provider-registry.js";
import {
  assertCleanNarrationResult,
  assertCleanNarratorPromptInput,
  cleanNarrationCandidateSchema,
  type CleanNarrationCandidate,
  type CleanNarrationLanguage,
  type CleanNarrationResult,
  type CleanNarratorPromptInput,
  type CleanNarratorView,
} from "./contracts.js";

export interface CleanNarrationValidationIssue {
  code:
    | "audit_misuse"
    | "backend_ref"
    | "claim_not_supported"
    | "empty_text"
    | "fact_not_supported"
    | "language_mismatch"
    | "linkage_mismatch"
    | "old_runtime_marker"
    | "page_move_not_supported"
    | "private_term"
    | "schema_invalid"
    | "sentence_plan_not_supported"
    | "text_mismatch";
  path: string;
  message: string;
}

export interface CleanNarrationCandidateRequest {
  system: string;
  prompt: string;
  promptInput: CleanNarratorPromptInput;
  styleMode: CleanNarrationStyleMode;
}

export type CleanNarrationCandidateGenerator =
  (request: CleanNarrationCandidateRequest) => Promise<unknown>;

export type CleanNarrationStyleMode = "grounded_clean" | "realism_nsfw";

export type CleanNarrationRunResult = CleanNarrationResult & {
  validationIssues: CleanNarrationValidationIssue[];
};

export class CleanNarrationGenerationError extends Error {
  constructor(message: string, cause: unknown) {
    super(message, { cause });
    this.name = "CleanNarrationGenerationError";
  }
}

export class CleanNarrationValidationError extends Error {
  readonly issues: CleanNarrationValidationIssue[];

  constructor(message: string, issues: CleanNarrationValidationIssue[]) {
    super(message);
    this.name = "CleanNarrationValidationError";
    this.issues = issues;
  }
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeText(value: string): string {
  const trimmed = value.trim();
  let result = "";
  let sawWhitespace = false;
  for (const char of trimmed) {
    if (char.trim().length === 0) {
      sawWhitespace = result.length > 0;
      continue;
    }
    if (sawWhitespace && result.length > 0) result += " ";
    result += char;
    sawWhitespace = false;
  }
  return result;
}

type CleanNarrationClaimKind = CleanNarratorView["acceptedEvidence"][number]["claimKinds"][number];
type AcceptedNarrationEvidence = CleanNarratorView["acceptedEvidence"][number];
type AcceptedNarrationBackendFact = AcceptedNarrationEvidence["backendFacts"][number];
type AcceptedNarrationBackendFactRole = NonNullable<AcceptedNarrationBackendFact["role"]>;

const MAX_PROMPT_BACKEND_FACTS_PER_EVIDENCE = 6;
const MAX_ROUTE_PROMPT_BACKEND_FACTS_PER_EVIDENCE = 16;
const MAX_LOCAL_OBSERVATION_PROMPT_BACKEND_FACTS_PER_EVIDENCE = 12;
const LITERARY_TERMINAL_CLAIMS: CleanNarrationClaimKind[] = [
  "item_state",
  "dialogue_response",
  "player_location_change",
  "elapsed_time",
  "route_status",
  "movement_option",
  "local_observation",
  "support_actor_materialization",
  "player_local_condition",
  "minor_poi_handle",
  "device_surface_observation",
  "oracle_outcome",
];
const LITERARY_SCENE_ANCHOR_CLAIMS: CleanNarrationClaimKind[] = [
  "current_scene",
  "current_location",
  "scene_texture",
];

function hasClaimKind(view: CleanNarratorView, claimKind: CleanNarrationClaimKind): boolean {
  return view.acceptedEvidence.some((evidence) => evidence.claimKinds.includes(claimKind));
}

function evidenceHasAnyClaimKind(
  evidence: AcceptedNarrationEvidence,
  claimKinds: readonly CleanNarrationClaimKind[],
): boolean {
  return claimKinds.some((claimKind) => evidence.claimKinds.includes(claimKind));
}

function isLiteraryTerminalEvidence(evidence: AcceptedNarrationEvidence): boolean {
  return evidence.authority !== "scene_frame_snapshot"
    && evidenceHasAnyClaimKind(evidence, LITERARY_TERMINAL_CLAIMS);
}

function hasOnlySceneFrameSnapshotEvidence(view: CleanNarratorView): boolean {
  return view.acceptedEvidence.length > 0
    && view.acceptedEvidence.every((evidence) => evidence.authority === "scene_frame_snapshot");
}

function isLiteraryNarrationCandidateExpected(view: CleanNarratorView): boolean {
  if (
    hasClaimKind(view, "item_state")
    || hasClaimKind(view, "dialogue_response")
    || hasClaimKind(view, "player_location_change")
    || hasClaimKind(view, "elapsed_time")
    || hasClaimKind(view, "route_status")
    || hasClaimKind(view, "movement_option")
    || hasClaimKind(view, "local_observation")
    || hasClaimKind(view, "support_actor_materialization")
    || hasClaimKind(view, "player_local_condition")
    || hasClaimKind(view, "minor_poi_handle")
    || hasClaimKind(view, "device_surface_observation")
    || hasClaimKind(view, "oracle_outcome")
  ) return true;
  return hasOnlySceneFrameSnapshotEvidence(view)
    && view.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("visible_target")
      || evidence.claimKinds.includes("movement_option")
    );
}

function uniqueFactsByRef(facts: readonly AcceptedNarrationBackendFact[]): AcceptedNarrationBackendFact[] {
  const seen = new Set<string>();
  const selected: AcceptedNarrationBackendFact[] = [];
  for (const fact of facts) {
    if (seen.has(fact.factRef)) continue;
    seen.add(fact.factRef);
    selected.push(fact);
  }
  return selected;
}

function preferredPromptFactsByRole(
  evidence: AcceptedNarrationEvidence,
  roles: readonly AcceptedNarrationBackendFactRole[],
): AcceptedNarrationBackendFact[] {
  const missingRoleFact = evidence.backendFacts.find((fact) => fact.role === undefined);
  if (missingRoleFact) {
    throw new Error(`Prompt fact selection for ${evidence.authority} requires typed backend fact roles.`);
  }
  const preferred = roles.flatMap((role) =>
    evidence.backendFacts.filter((fact) => fact.role === role)
  );
  if (preferred.length === 0) {
    throw new Error(`Prompt fact selection for ${evidence.authority} requires at least one preferred backend fact role.`);
  }
  return uniqueFactsByRef([...preferred, ...evidence.backendFacts]);
}

function preferredPromptFacts(evidence: AcceptedNarrationEvidence): AcceptedNarrationBackendFact[] {
  if (evidence.claimKinds.includes("item_state")) {
    return preferredPromptFactsByRole(evidence, [
      "settled_custody",
      "custody_change",
      "item_label",
      "target_label",
      "final_equip_state",
      "current_scene_anchor",
      "source_label",
      "item_transfer_result",
    ]);
  }
  if (evidence.claimKinds.includes("dialogue_response")) {
    return preferredPromptFactsByRole(evidence, [
      "speaker_label",
      "dialogue_quote",
      "dialogue_summary",
    ]);
  }
  if (evidence.claimKinds.includes("route_status")) {
    return preferredPromptFactsByRole(evidence, [
      "route_beat",
      "route_label",
      "route_status",
    ]);
  }
  if (evidence.claimKinds.includes("movement_option")) {
    return preferredPromptFactsByRole(evidence, [
      "route_choices_beat",
      "route_origin",
      "route_choice_labels",
      "open_route_labels",
      "closed_route_labels",
      "route_choice_travel_costs",
    ]);
  }
  if (evidence.claimKinds.includes("local_observation")) {
    return preferredPromptFactsByRole(evidence, [
      "local_observation_beat",
      "searched_visible_surfaces",
      "observation_query",
      "observed_entry_labels",
      "observed_entry_surfaces",
      "anchor_scene",
      "anchor_location",
    ]);
  }
  if (evidence.claimKinds.includes("support_actor_materialization")) {
    return preferredPromptFactsByRole(evidence, [
      "visible_support_actor",
      "anchor_scene",
      "support_actor_visible_cue",
      "support_actor_public_summary",
      "support_role",
      "support_actor_presence",
      "materialization_result",
    ]);
  }
  if (evidence.claimKinds.includes("player_local_condition")) {
    return preferredPromptFactsByRole(evidence, [
      "player_condition_operation",
      "condition_key",
      "current_scene_anchor",
      "condition_result",
      "condition_target",
    ]);
  }
  if (evidence.claimKinds.includes("minor_poi_handle")) {
    return preferredPromptFactsByRole(evidence, [
      "minor_poi_operation",
      "place_handle_label",
      "place_handle_kind",
      "current_scene_anchor",
      "handle_result",
      "place_handle_scope",
    ]);
  }
  if (evidence.claimKinds.includes("device_surface_observation")) {
    return preferredPromptFactsByRole(evidence, [
      "device_surface_beat",
      "device_label",
      "requested_surface_facets",
      "observed_device_facets",
      "unavailable_surface_facets",
      "anchor_scene",
      "anchor_location",
    ]);
  }
  if (evidence.claimKinds.includes("scene_beat")) {
    return preferredPromptFactsByRole(evidence, [
      "scene_beat",
      "scene_beat_target_labels",
    ]);
  }
  if (evidence.authority === "scene_frame_snapshot") {
    return preferredPromptFactsByRole(evidence, [
      "scene_placement",
      "scene_label",
      "place_label",
      "scene_texture",
      "visible_scene_facts",
      "visible_actor_labels",
      "inventory_status_beat",
      "inventory_labels",
      "visible_target_labels",
      "visible_actor_target_labels",
      "visible_item_target_labels",
      "visible_place_handle_target_labels",
      "visible_location_target_labels",
    ]);
  }
  return evidence.backendFacts;
}

function maxPromptBackendFactsForEvidence(evidence: AcceptedNarrationEvidence): number {
  if (evidence.claimKinds.includes("movement_option")) return MAX_ROUTE_PROMPT_BACKEND_FACTS_PER_EVIDENCE;
  if (evidence.claimKinds.includes("local_observation")) return MAX_LOCAL_OBSERVATION_PROMPT_BACKEND_FACTS_PER_EVIDENCE;
  return MAX_PROMPT_BACKEND_FACTS_PER_EVIDENCE;
}

function promptSafeBackendFact(fact: AcceptedNarrationBackendFact): AcceptedNarrationBackendFact {
  const value = fact.value?.trim();
  if (!value) return fact;
  return {
    ...fact,
    text: normalizeText(value),
  };
}

function limitPromptEvidenceFacts(evidence: AcceptedNarrationEvidence): AcceptedNarrationEvidence {
  assertRouteOptionsReceiptStoryEvidence(evidence);
  assertSceneFrameRouteStoryEvidence(evidence);
  assertSceneObservationStoryEvidence(evidence);
  assertSceneFrameSnapshotStoryEvidence(evidence);
  assertLocalObservationStoryEvidence(evidence);
  assertDeviceSurfaceStoryEvidence(evidence);
  assertSceneBeatStoryEvidence(evidence);
  assertSupportActorStoryEvidence(evidence);
  const maxFacts = maxPromptBackendFactsForEvidence(evidence);
  const backendFacts = evidence.backendFacts.length <= maxFacts
    ? evidence.backendFacts
    : preferredPromptFacts(evidence).slice(0, maxFacts);
  return {
    ...evidence,
    backendFacts: backendFacts.map(promptSafeBackendFact),
  };
}

function selectPromptAcceptedEvidence(view: CleanNarratorView): AcceptedNarrationEvidence[] {
  if (!isLiteraryNarrationCandidateExpected(view) || hasOnlySceneFrameSnapshotEvidence(view)) {
    return view.acceptedEvidence.map(limitPromptEvidenceFacts);
  }

  const terminalEvidence = view.acceptedEvidence.filter(isLiteraryTerminalEvidence);
  if (terminalEvidence.length === 0) return view.acceptedEvidence.map(limitPromptEvidenceFacts);

  const sceneAnchors = view.acceptedEvidence.filter((evidence) =>
    evidence.authority === "scene_frame_snapshot"
    && evidenceHasAnyClaimKind(evidence, LITERARY_SCENE_ANCHOR_CLAIMS)
  );
  const byRef = new Set<string>();
  const selected: AcceptedNarrationEvidence[] = [];
  for (const evidence of [...terminalEvidence, ...sceneAnchors]) {
    if (byRef.has(evidence.ref)) continue;
    byRef.add(evidence.ref);
    selected.push(limitPromptEvidenceFacts(evidence));
  }
  return selected;
}

type CleanNarratorStoryFrameEntry = CleanNarratorPromptInput["storyFrame"]["turnEvents"][number];
type CleanNarratorProseCue = CleanNarratorStoryFrameEntry["proseCue"];
type CleanNarratorCompositionSlot = CleanNarratorStoryFrameEntry["compositionSlot"];
type CleanNarratorPagePlanStep = CleanNarratorPromptInput["storyFrame"]["pagePlan"]["steps"][number];
type CleanNarratorPageTaskMove = CleanNarratorPromptInput["narrativePageTask"]["moves"][number];
type CleanNarratorFactUse = CleanNarratorPageTaskMove["factUses"][number];
type CleanNarratorSentencePlanStep = CleanNarratorPromptInput["narrativePageTask"]["sentencePlan"][number];
type CleanNarratorSentencePlanDraft = Omit<CleanNarratorSentencePlanStep, "flowCue">;
type CleanNarratorPageArc = CleanNarratorPromptInput["narrativePageTask"]["pageArc"];
type CleanNarratorPagePerformance = CleanNarratorPromptInput["narrativePageTask"]["pagePerformance"];
type CleanNarratorPageVariation = CleanNarratorPromptInput["narrativePageTask"]["pageVariation"];
type CleanNarratorPageFocus = CleanNarratorPromptInput["narrativePageTask"]["pageFocus"];
type CleanNarratorChoicePresentation = CleanNarratorPromptInput["narrativePageTask"]["choicePresentation"];
type CleanNarratorStoryPageBrief = CleanNarratorPromptInput["narrativePageTask"]["storyPageBrief"];

function evidenceIncludesClaimKind(
  evidence: AcceptedNarrationEvidence,
  claimKind: CleanNarrationClaimKind,
): boolean {
  return evidence.claimKinds.includes(claimKind);
}

function storyFrameProseCue(evidence: AcceptedNarrationEvidence): CleanNarratorProseCue {
  if (evidenceIncludesClaimKind(evidence, "bounded_visibility_negative")) return "bounded_visibility_negative";
  if (evidenceIncludesClaimKind(evidence, "clarification_request")) return "clarification_request";
  if (evidenceIncludesClaimKind(evidence, "oracle_outcome")) return "oracle_outcome";
  if (evidenceIncludesClaimKind(evidence, "player_location_change")) return "movement_result";
  if (evidenceIncludesClaimKind(evidence, "route_status")) return "route_status";
  if (evidenceIncludesClaimKind(evidence, "movement_option")) return "route_options";
  if (evidenceIncludesClaimKind(evidence, "item_state")) return "item_state";
  if (evidenceIncludesClaimKind(evidence, "dialogue_response")) return "dialogue_response";
  if (evidenceIncludesClaimKind(evidence, "local_observation")) return "local_observation";
  if (evidenceIncludesClaimKind(evidence, "device_surface_observation")) return "device_surface_observation";
  if (evidenceIncludesClaimKind(evidence, "support_actor_materialization")) return "support_actor_materialization";
  if (evidenceIncludesClaimKind(evidence, "player_local_condition")) return "player_local_condition";
  if (evidenceIncludesClaimKind(evidence, "minor_poi_handle")) return "minor_poi_handle";
  if (evidenceIncludesClaimKind(evidence, "scene_beat")) return "scene_beat";
  if (evidenceIncludesClaimKind(evidence, "elapsed_time")) return "elapsed_time";
  if (evidenceIncludesClaimKind(evidence, "scene_texture")) return "scene_texture";
  if (
    evidenceIncludesClaimKind(evidence, "current_scene")
    || evidenceIncludesClaimKind(evidence, "current_location")
  ) {
    return "current_scene_anchor";
  }
  if (evidence.authority === "scene_frame_snapshot") return "direct_scene_snapshot";
  return "generic_accepted_evidence";
}

function storyFrameCompositionSlot(evidence: AcceptedNarrationEvidence): CleanNarratorCompositionSlot {
  const cue = storyFrameProseCue(evidence);
  if (cue === "clarification_request") return "clarification";
  if (cue === "scene_texture") return "texture_context";
  if (cue === "current_scene_anchor") return "opening_context";
  if (
    cue === "route_options"
    || (evidence.authority === "scene_frame_snapshot" && cue === "direct_scene_snapshot")
  ) {
    return "next_action_context";
  }
  return "event_beat";
}

function cleanNarratorStoryFrameEntry(
  evidence: AcceptedNarrationEvidence,
): CleanNarratorStoryFrameEntry {
  return {
    ref: evidence.ref,
    authority: evidence.authority,
    claimKinds: evidence.claimKinds,
    proseCue: storyFrameProseCue(evidence),
    compositionSlot: storyFrameCompositionSlot(evidence),
    summary: evidence.text,
    backendFactRefs: evidence.backendFacts.map((fact) => fact.factRef),
    limits: evidence.limits,
  };
}

function storyFrameEntryRefsForSlots(
  entries: CleanNarratorStoryFrameEntry[],
  slots: CleanNarratorCompositionSlot[],
): string[] {
  const slotSet = new Set(slots);
  const refs: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!slotSet.has(entry.compositionSlot) || seen.has(entry.ref)) continue;
    seen.add(entry.ref);
    refs.push(entry.ref);
  }
  return refs;
}

function buildCleanNarratorPagePlan(
  currentContext: CleanNarratorStoryFrameEntry[],
  turnEvents: CleanNarratorStoryFrameEntry[],
): CleanNarratorPromptInput["storyFrame"]["pagePlan"] {
  const allEntries = [...currentContext, ...turnEvents];
  const steps: CleanNarratorPagePlanStep[] = [];
  const clarificationRefs = storyFrameEntryRefsForSlots(allEntries, ["clarification"]);
  if (clarificationRefs.length > 0) {
    return {
      version: "gameplay-runtime.clean-narrator-page-plan.v1",
      source: "derived_from_story_frame_composition_slots",
      steps: [{ step: "ask_clarification", entryRefs: clarificationRefs }],
    };
  }

  const openingRefs = storyFrameEntryRefsForSlots(currentContext, ["texture_context", "opening_context"]);
  if (openingRefs.length > 0) {
    steps.push({ step: "open_with_context", entryRefs: openingRefs });
  }

  const eventRefs = storyFrameEntryRefsForSlots(turnEvents, ["event_beat"]);
  if (eventRefs.length > 0) {
    steps.push({ step: "narrate_turn_event", entryRefs: eventRefs });
  }

  const nextActionRefs = storyFrameEntryRefsForSlots(allEntries, ["next_action_context"]);
  if (nextActionRefs.length > 0) {
    steps.push({ step: "close_with_next_action_context", entryRefs: nextActionRefs });
  }

  if (steps.length === 0 && allEntries.length > 0) {
    steps.push({
      step: "narrate_turn_event",
      entryRefs: allEntries.map((entry) => entry.ref),
    });
  }

  return {
    version: "gameplay-runtime.clean-narrator-page-plan.v1",
    source: "derived_from_story_frame_composition_slots",
    steps,
  };
}

function buildCleanNarratorStoryFrame(
  acceptedEvidence: AcceptedNarrationEvidence[],
): CleanNarratorPromptInput["storyFrame"] {
  const currentContext = acceptedEvidence
    .filter((evidence) => evidence.authority === "scene_frame_snapshot")
    .map(cleanNarratorStoryFrameEntry);
  const turnEvents = acceptedEvidence
    .filter((evidence) => evidence.authority !== "scene_frame_snapshot")
    .map(cleanNarratorStoryFrameEntry);

  return {
    version: "gameplay-runtime.clean-narrator-story-frame.v1",
    source: "derived_from_prompt_accepted_evidence",
    currentContext,
    turnEvents,
    pagePlan: buildCleanNarratorPagePlan(currentContext, turnEvents),
  };
}

function narrativePageProseMove(step: CleanNarratorPagePlanStep["step"]): CleanNarratorPageTaskMove["proseMove"] {
  switch (step) {
    case "ask_clarification":
      return "ask_accepted_question";
    case "open_with_context":
      return "establish_playable_context";
    case "narrate_turn_event":
      return "render_authoritative_turn_event";
    case "close_with_next_action_context":
      return "leave_playable_next_action_handle";
  }
}

function narrativePageMoveCoverage(
  step: CleanNarratorPagePlanStep["step"],
  hasAuthoritativeTurnMove: boolean,
): CleanNarratorPageTaskMove["coverage"] {
  if (step === "open_with_context") return "optional";
  if (step === "close_with_next_action_context" && hasAuthoritativeTurnMove) return "optional";
  return "required";
}

function narrativeFactProseUse(
  fact: AcceptedNarrationEvidence["backendFacts"][number],
): CleanNarratorFactUse["proseUse"] {
  switch (fact.role) {
    case "scene_texture":
      return "exact_texture_sentence";
    case "dialogue_quote":
      return "exact_dialogue_quote";
    case "travel_beat":
    case "time_beat":
    case "route_beat":
    case "route_choices_beat":
    case "device_surface_beat":
    case "local_observation_beat":
    case "scene_beat":
    case "oracle_selected_meaning":
    case "player_condition_operation":
    case "minor_poi_operation":
    case "support_actor_presence":
    case "support_actor_visible_cue":
    case "custody_change":
    case "settled_custody":
    case "visible_scene_facts":
      return "primary_beat";
    case "inventory_status_beat":
      return "inventory_status";
    case "elapsed_time":
    case "elapsed_travel_time":
    case "route_choice_travel_costs":
      return "time_value";
    case "route_choice_labels":
    case "open_route_labels":
    case "closed_route_labels":
      return "route_choice";
    case "scene_placement":
    case "current_scene_anchor":
    case "anchor_scene":
    case "anchor_location":
    case "scene_label":
    case "place_label":
    case "route_origin":
      return "scene_anchor";
    case "condition_key":
    case "condition_result":
    case "condition_target":
    case "final_equip_state":
    case "handle_result":
    case "item_transfer_result":
    case "materialization_result":
    case "route_status":
      return "state_value";
    case "current_place_after_movement":
    case "destination_label":
    case "device_label":
    case "inventory_labels":
    case "item_label":
    case "observed_entry_labels":
    case "place_handle_label":
    case "route_label":
    case "source_label":
    case "speaker_label":
    case "support_role":
    case "target_label":
    case "visible_actor_labels":
    case "visible_actor_target_labels":
    case "visible_item_target_labels":
    case "visible_location_target_labels":
    case "visible_place_handle_target_labels":
    case "visible_support_actor":
    case "visible_target_labels":
      return "label_anchor";
    default:
      return "supporting_detail";
  }
}

function sentencePlanPreferredFactRefs(
  move: CleanNarratorPageTaskMove,
  proseUses: CleanNarratorFactUse["proseUse"][],
): string[] {
  const useSet = new Set(proseUses);
  return move.factUses
    .filter((factUse) => useSet.has(factUse.proseUse))
    .map((factUse) => factUse.factRef);
}

function sentencePlanFactRefsByRole(
  move: CleanNarratorPageTaskMove,
  roles: readonly string[],
): string[] {
  return uniqueStrings(roles.flatMap((role) =>
    move.usableFacts
      .filter((fact) => fact.role === role)
      .map((fact) => fact.factRef)
  ));
}

function selectRouteChoiceFactRefs(move: CleanNarratorPageTaskMove): string[] {
  const openLabelFactRefs = sentencePlanFactRefsByRole(move, ["open_route_labels"]);
  const routeLabelFactRefs = openLabelFactRefs.length > 0
    ? openLabelFactRefs
    : sentencePlanFactRefsByRole(move, ["route_choice_labels"]);
  return uniqueStrings([
    ...sentencePlanFactRefsByRole(move, ["route_origin"]),
    ...routeLabelFactRefs,
    ...sentencePlanFactRefsByRole(move, ["route_choice_travel_costs"]),
  ]);
}

function moveHasDirectSceneSurfaceFacts(move: CleanNarratorPageTaskMove): boolean {
  return move.usableFacts.some((fact) =>
    fact.role === "scene_label"
    || fact.role === "place_label"
    || fact.role === "visible_actor_labels"
    || fact.role === "visible_actor_target_labels"
    || fact.role === "inventory_status_beat"
    || fact.role === "inventory_labels"
    || fact.role === "visible_target_labels"
  );
}

function selectPlayableNextActionFactRefs(move: CleanNarratorPageTaskMove): string[] {
  if (move.entryProseCues.includes("direct_scene_snapshot") || moveHasDirectSceneSurfaceFacts(move)) {
    const directSceneSurfaceRefs = move.factUses
      .filter((factUse) => factUse.proseUse === "scene_anchor" || factUse.proseUse === "label_anchor")
      .flatMap((factUse) => {
        const fact = move.usableFacts.find((entry) => entry.factRef === factUse.factRef);
        return fact?.role === "inventory_labels" ? [] : [factUse.factRef];
      });
    return uniqueStrings([
      ...directSceneSurfaceRefs,
      ...selectRouteChoiceFactRefs(move),
    ]);
  }
  return selectRouteChoiceFactRefs(move);
}

function selectDirectSceneInventoryStatusFactRefs(move: CleanNarratorPageTaskMove): string[] {
  if (!move.entryProseCues.includes("direct_scene_snapshot") && !moveHasDirectSceneSurfaceFacts(move)) {
    return [];
  }
  return sentencePlanFactRefsByRole(move, ["inventory_status_beat"]);
}

function selectCurrentSceneLabelAnchor(input: {
  currentContext: CleanNarratorStoryFrameEntry[];
  backendFactsByRef: Map<string, AcceptedNarrationEvidence["backendFacts"][number]>;
}): { entryRefs: string[]; factRefs: string[] } {
  for (const entry of input.currentContext) {
    if (
      !entry.claimKinds.includes("current_scene")
      && !entry.claimKinds.includes("current_location")
    ) {
      continue;
    }

    const sceneLabelFactRef = entry.backendFactRefs.find((factRef) =>
      input.backendFactsByRef.get(factRef)?.role === "scene_label"
    );
    const placeLabelFactRef = entry.backendFactRefs.find((factRef) =>
      input.backendFactsByRef.get(factRef)?.role === "place_label"
    );
    const anchorFactRef = sceneLabelFactRef ?? placeLabelFactRef;
    if (anchorFactRef) {
      return { entryRefs: [entry.ref], factRefs: [anchorFactRef] };
    }
  }

  return { entryRefs: [], factRefs: [] };
}

function pageTextureFrameRole(
  coreProseCues: readonly CleanNarratorProseCue[],
): "detail_frame" | "social_frame" | "spatial_frame" {
  if (coreProseCues.some((cue) =>
    cue === "device_surface_observation"
    || cue === "elapsed_time"
    || cue === "item_state"
    || cue === "minor_poi_handle"
    || cue === "player_local_condition"
  )) {
    return "detail_frame";
  }
  if (coreProseCues.some((cue) =>
    cue === "dialogue_response"
    || cue === "local_observation"
    || cue === "support_actor_materialization"
  )) {
    return "social_frame";
  }
  return "spatial_frame";
}

function pageTexturePrimaryCue(
  coreProseCues: readonly CleanNarratorProseCue[],
): CleanNarratorProseCue | null {
  for (const cue of [
    "device_surface_observation",
    "elapsed_time",
    "item_state",
    "minor_poi_handle",
    "player_local_condition",
    "dialogue_response",
    "local_observation",
    "support_actor_materialization",
    "route_options",
    "route_status",
  ] as const satisfies readonly CleanNarratorProseCue[]) {
    if (coreProseCues.includes(cue)) return cue;
  }
  return null;
}

function selectTextureFrameIndex(
  coreProseCues: readonly CleanNarratorProseCue[],
  textureFactCount: number,
): number {
  if (textureFactCount <= 1) return 0;
  const lastIndex = textureFactCount - 1;
  const middleIndex = Math.min(1, lastIndex);
  const frameRole = pageTextureFrameRole(coreProseCues);
  const primaryCue = pageTexturePrimaryCue(coreProseCues);

  if (frameRole === "spatial_frame") return 0;
  if (frameRole === "social_frame") {
    if (
      primaryCue === "dialogue_response"
      || primaryCue === "support_actor_materialization"
    ) {
      return middleIndex;
    }
    if (primaryCue === "local_observation") return lastIndex;
    return middleIndex;
  }

  switch (primaryCue) {
    case "elapsed_time":
      return lastIndex;
    case "item_state":
      return middleIndex;
    case "device_surface_observation":
      return middleIndex;
    case "minor_poi_handle":
      return middleIndex;
    case "player_local_condition":
      return textureFactCount > 2 ? 0 : lastIndex;
    default:
      return lastIndex;
  }
}

function selectFrameTextureFactRefs(
  move: CleanNarratorPageTaskMove,
  coreProseCues: readonly CleanNarratorProseCue[],
): string[] {
  const textureFactRefs = sentencePlanPreferredFactRefs(move, ["exact_texture_sentence"]);
  if (textureFactRefs.length <= 1) return textureFactRefs;

  return [textureFactRefs[selectTextureFrameIndex(coreProseCues, textureFactRefs.length)]!];
}

function isStandaloneElapsedTimeMove(move: CleanNarratorPageTaskMove): boolean {
  return move.entryProseCues.includes("elapsed_time")
    && !move.entryProseCues.includes("movement_result");
}

function selectSupportActorPresenceFactRefs(move: CleanNarratorPageTaskMove): string[] {
  return sentencePlanFactRefsByRole(move, [
    "visible_support_actor",
    "anchor_scene",
    "support_actor_visible_cue",
    "support_actor_public_summary",
    "support_role",
    "support_actor_presence",
  ]);
}

function selectDialogueReplyFactRefs(move: CleanNarratorPageTaskMove): string[] {
  return sentencePlanFactRefsByRole(move, [
    "speaker_label",
    "dialogue_quote",
    "dialogue_summary",
  ]);
}

function selectTurnEventFactRefs(move: CleanNarratorPageTaskMove): string[] {
  if (isStandaloneElapsedTimeMove(move)) {
    const elapsedDurationFactRefs = sentencePlanPreferredFactRefs(move, ["time_value"]);
    if (elapsedDurationFactRefs.length > 0) {
      return [
        ...elapsedDurationFactRefs,
        ...sentencePlanPreferredFactRefs(move, ["scene_anchor"]),
      ];
    }
  }

  if (move.entryProseCues.includes("item_state") && !move.entryProseCues.includes("dialogue_response")) {
    return sentencePlanFactRefsByRole(move, [
      "settled_custody",
      "custody_change",
      "item_label",
      "target_label",
      "final_equip_state",
      "current_scene_anchor",
      "source_label",
      "item_transfer_result",
    ]);
  }

  if (move.entryProseCues.includes("support_actor_materialization")) {
    return selectSupportActorPresenceFactRefs(move);
  }

  return sentencePlanPreferredFactRefs(move, [
    "primary_beat",
    "exact_dialogue_quote",
    "state_value",
    "time_value",
    "inventory_status",
    "label_anchor",
    "scene_anchor",
    "supporting_detail",
  ]);
}

function sentencePlanHasProseUse(
  move: CleanNarratorPageTaskMove,
  proseUse: CleanNarratorFactUse["proseUse"],
): boolean {
  return move.factUses.some((factUse) => factUse.proseUse === proseUse);
}

function sentencePlanMaterialCopyMode(
  proseUse: CleanNarratorFactUse["proseUse"],
): CleanNarratorSentencePlanStep["proseMaterials"][number]["copyMode"] {
  switch (proseUse) {
    case "exact_dialogue_quote":
    case "exact_texture_sentence":
    case "inventory_status":
      return "copy_exact";
    case "label_anchor":
    case "route_choice":
    case "scene_anchor":
    case "state_value":
    case "time_value":
      return "preserve_token";
    case "primary_beat":
    case "supporting_detail":
      return "phrase_from_material";
  }
}

function sentencePlanProseMaterials(
  move: CleanNarratorPageTaskMove,
  preferredBackendFactRefs: string[],
): CleanNarratorSentencePlanStep["proseMaterials"] {
  const factsByRef = new Map(move.usableFacts.map((fact) => [fact.factRef, fact]));
  const usesByRef = new Map(move.factUses.map((factUse) => [factUse.factRef, factUse.proseUse]));
  return preferredBackendFactRefs.flatMap((factRef) => {
    const fact = factsByRef.get(factRef);
    const proseUse = usesByRef.get(factRef);
    if (!fact || !proseUse) return [];
    const value = fact.value?.trim();
    return [{
      factRef,
      proseUse,
      materialText: value && value.length > 0 ? normalizeText(value) : normalizeText(fact.text),
      materialTextSource: value && value.length > 0 ? "accepted_value" : "accepted_text",
      copyMode: sentencePlanMaterialCopyMode(proseUse),
    }];
  });
}

function sentencePlanMaterialObligations(
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["materialObligations"] {
  const allowedMaterialFactRefs = proseMaterials.map((material) => material.factRef);
  const coreMaterialFactRefs = proseMaterials
    .filter((material) => material.proseUse !== "supporting_detail")
    .map((material) => material.factRef);
  return {
    allowedMaterialFactRefs,
    coreMaterialFactRefs: coreMaterialFactRefs.length > 0 ? coreMaterialFactRefs : allowedMaterialFactRefs,
    exactCopyFactRefs: proseMaterials
      .filter((material) => material.copyMode === "copy_exact")
      .map((material) => material.factRef),
    preserveTokenFactRefs: proseMaterials
      .filter((material) => material.copyMode === "preserve_token")
      .map((material) => material.factRef),
    phraseFromMaterialFactRefs: proseMaterials
      .filter((material) => material.copyMode === "phrase_from_material")
      .map((material) => material.factRef),
    citationMode: "cite_only_material_fact_refs_from_cited_sentence_plan_refs",
  };
}

function sentencePlanClaimFocus(
  move: CleanNarratorPageTaskMove,
  preferredBackendFactRefs: string[],
  claimKindsByEntryRef: Map<string, CleanNarrationClaimKind[]>,
  claimKindsByFactRef: Map<string, CleanNarrationClaimKind[]>,
): CleanNarratorSentencePlanStep["claimFocus"] {
  const primaryClaimKinds = uniqueStrings(preferredBackendFactRefs.flatMap((factRef) => {
    const claimKinds = claimKindsByFactRef.get(factRef);
    if (!claimKinds) {
      throw new Error(`Narrative sentence plan requires accepted claimKinds for backend fact ${factRef}.`);
    }
    return claimKinds;
  })) as CleanNarrationClaimKind[];
  if (primaryClaimKinds.length === 0) {
    throw new Error(`Narrative sentence plan requires primary claimKinds for move ${move.moveRef}.`);
  }

  const moveClaimKinds = uniqueStrings(move.entryRefs.flatMap((entryRef) => {
    const claimKinds = claimKindsByEntryRef.get(entryRef);
    if (!claimKinds) {
      throw new Error(`Narrative sentence plan requires accepted claimKinds for entry ${entryRef}.`);
    }
    return claimKinds;
  })) as CleanNarrationClaimKind[];
  const primarySet = new Set(primaryClaimKinds);
  return {
    primaryClaimKinds,
    supportingClaimKinds: moveClaimKinds.filter((claimKind) => !primarySet.has(claimKind)),
    citationMode: "primary_claims_of_cited_sentence_plan_refs",
  };
}

function sentencePlanTextureCue(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["textureCue"] {
  const textureFactRefs = proseMaterials
    .filter((material) => material.proseUse === "exact_texture_sentence")
    .map((material) => material.factRef);
  if (sentenceRole === "exact_context_texture" && textureFactRefs.length > 0) {
    return {
      mode: "copy_exact_texture_sentence",
      playerFacingUse: "standalone_context_sentence",
      allowedTextureFactRefs: textureFactRefs,
    };
  }
  return {
    mode: "omit_texture_in_this_sentence",
    playerFacingUse: "none",
    allowedTextureFactRefs: [],
  };
}

function sentencePlanAdventureSubjectFocus(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
  beatObjective: CleanNarratorSentencePlanStep["beatObjective"],
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["adventureCue"]["subjectFocus"] {
  if (sentenceRole === "clarification_question") return "accepted_question";
  if (sentenceRole === "exact_context_texture") return "accepted_texture";
  if (sentenceRole === "context_anchor") return "player_scene_position";
  if (proseMaterials.some((material) => material.proseUse === "inventory_status")) {
    return "settled_result_material";
  }
  if (sentenceRole === "next_action_handle") return "playable_route_choices";
  if (beatObjective === "render_elapsed_time") return "elapsed_time_value";
  if (beatObjective === "render_item_custody") return "item_custody_state";
  if (beatObjective === "render_support_actor_presence") return "visible_support_actor";
  if (proseMaterials.some((material) => material.proseUse === "exact_dialogue_quote")) {
    return "visible_speaker";
  }
  return "settled_result_material";
}

function sentencePlanAdventureVerbFrame(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
  beatObjective: CleanNarratorSentencePlanStep["beatObjective"],
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["adventureCue"]["verbFrame"] {
  if (sentenceRole === "clarification_question") return "ask_direct_question";
  if (sentenceRole === "exact_context_texture") return "copy_visible_texture";
  if (sentenceRole === "context_anchor") return "place_player_in_scene";
  if (proseMaterials.some((material) => material.proseUse === "inventory_status")) {
    return "land_settled_result";
  }
  if (sentenceRole === "next_action_handle") return "offer_scene_exits";
  if (beatObjective === "render_elapsed_time") return "mark_elapsed_time_pressure";
  if (beatObjective === "render_item_custody") return "land_scene_custody";
  if (beatObjective === "render_support_actor_presence") return "land_support_presence";
  if (proseMaterials.some((material) => material.proseUse === "exact_dialogue_quote")) {
    return "frame_exact_utterance";
  }
  return "land_settled_result";
}

function sentencePlanAdventureDetailPalette(
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["adventureCue"]["detailPalette"] {
  const palette = uniqueStrings(proseMaterials.map((material) => {
    switch (material.proseUse) {
      case "exact_dialogue_quote":
        return "accepted_quote";
      case "exact_texture_sentence":
        return "accepted_texture";
      case "inventory_status":
        return "accepted_state";
      case "label_anchor":
      case "scene_anchor":
        return "accepted_labels";
      case "primary_beat":
      case "supporting_detail":
        return "accepted_primary_beat";
      case "route_choice":
        return "accepted_route_choices";
      case "state_value":
        return "accepted_state";
      case "time_value":
        return "accepted_time";
    }
  }));
  return palette.length > 0
    ? palette as CleanNarratorSentencePlanStep["adventureCue"]["detailPalette"]
    : ["accepted_primary_beat"];
}

function sentencePlanAdventureCue(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
  beatObjective: CleanNarratorSentencePlanStep["beatObjective"],
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["adventureCue"] {
  return {
    subjectFocus: sentencePlanAdventureSubjectFocus(sentenceRole, beatObjective, proseMaterials),
    verbFrame: sentencePlanAdventureVerbFrame(sentenceRole, beatObjective, proseMaterials),
    detailPalette: sentencePlanAdventureDetailPalette(proseMaterials),
  };
}

function sentencePlanBeatObjective(
  move: CleanNarratorPageTaskMove,
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
): CleanNarratorSentencePlanStep["beatObjective"] {
  if (sentenceRole === "clarification_question") return "ask_clarification_question";
  if (sentenceRole === "exact_context_texture") return "copy_scene_texture";
  if (sentenceRole === "context_anchor") return "place_current_scene";
  if (sentenceRole === "next_action_handle") return "render_route_choices";

  const cues = new Set(move.entryProseCues);
  if (cues.has("dialogue_response")) return "frame_dialogue_reply";
  if (cues.has("item_state")) return "render_item_custody";
  if (cues.has("movement_result")) return "render_movement_arrival";
  if (cues.has("elapsed_time")) return "render_elapsed_time";
  if (cues.has("route_status")) return "render_route_status";
  if (cues.has("route_options")) return "render_route_choices";
  if (cues.has("local_observation") || cues.has("bounded_visibility_negative")) return "render_local_observation";
  if (cues.has("device_surface_observation")) return "render_device_surface";
  if (cues.has("support_actor_materialization")) return "render_support_actor_presence";
  if (cues.has("player_local_condition")) return "render_player_condition";
  if (cues.has("minor_poi_handle")) return "render_minor_poi_handle";
  if (cues.has("oracle_outcome")) return "render_oracle_outcome";
  if (cues.has("scene_beat")) return "render_scene_beat";
  if (cues.has("direct_scene_snapshot")) return "render_direct_scene_snapshot";
  return "render_generic_evidence";
}

function sentencePlanProseAssembly(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
  beatObjective: CleanNarratorSentencePlanStep["beatObjective"],
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
  materialObligations: CleanNarratorSentencePlanStep["materialObligations"],
  hasSupportActorPresentationDetail: boolean,
): CleanNarratorSentencePlanStep["proseAssembly"] {
  switch (sentenceRole) {
    case "clarification_question":
      return {
        perspective: "direct_question",
        sentenceShape: "accepted_question_line",
        openingSource: "accepted_question",
        verbEnergy: "ask",
        detailRhythm: "single_core_material",
        materialWeaveOrder: "accepted_question_only",
        styleBudget: "direct_question_clarity",
        closingFunction: "request_answer",
      };
    case "exact_context_texture":
      return {
        perspective: "environment_present",
        sentenceShape: "exact_texture_line",
        openingSource: "accepted_texture_material",
        verbEnergy: "copy_exact",
        detailRhythm: "texture_line",
        materialWeaveOrder: "texture_exact_only",
        styleBudget: "exact_texture_atmosphere",
        closingFunction: "orient_context",
      };
    case "context_anchor":
      return {
        perspective: "second_person_present",
        sentenceShape: "scene_anchor_line",
        openingSource: "preserved_label_anchor",
        verbEnergy: "concrete_present",
        detailRhythm: "scene_anchor_tokens",
        materialWeaveOrder: "scene_anchor_only",
        styleBudget: "scene_anchor_cadence",
        closingFunction: "orient_context",
      };
    case "next_action_handle": {
      if (proseMaterials.some((material) => material.proseUse === "inventory_status")) {
        return {
          perspective: "second_person_present",
          sentenceShape: "result_beat_line",
          openingSource: "core_material_subject",
          verbEnergy: "copy_exact",
          detailRhythm: "single_core_material",
          materialWeaveOrder: "result_only",
          styleBudget: "result_beat_cadence",
          closingFunction: "orient_context",
        };
      }
      const carriesCost = proseMaterials.some((material) => material.proseUse === "time_value");
      return {
        perspective: "playable_choice_present",
        sentenceShape: "scene_exit_choice_line",
        openingSource: "route_exit_label",
        verbEnergy: "offer_scene_exit",
        detailRhythm: carriesCost ? "exit_group_with_cost" : "exit_group",
        materialWeaveOrder: carriesCost ? "exits_then_costs" : "exits_only",
        styleBudget: "scene_exit_handoff_cadence",
        closingFunction: "offer_next_action",
      };
    }
    case "turn_event_beat":
      if (beatObjective === "frame_dialogue_reply") {
        return {
          perspective: "visible_speaker_present",
          sentenceShape: "quote_framed_beat",
          openingSource: "visible_speaker_label",
          verbEnergy: "frame_speech",
          detailRhythm: "exact_quote_with_frame",
          materialWeaveOrder: "speaker_then_quote",
          styleBudget: "quote_frame_cadence",
          closingFunction: "settle_outcome",
        };
      }
      if (beatObjective === "render_elapsed_time") {
        return {
          perspective: "settled_result_present",
          sentenceShape: "clock_beat_line",
          openingSource: "elapsed_time_value",
          verbEnergy: "pressure_time",
          detailRhythm: "time_with_scene_anchor",
          materialWeaveOrder: "time_pressure_then_scene_anchor",
          styleBudget: "clock_pressure_cadence",
          closingFunction: "settle_outcome",
        };
      }
      if (beatObjective === "render_item_custody") {
        return {
          perspective: "settled_result_present",
          sentenceShape: "scene_custody_beat_line",
          openingSource: "item_label_or_custody_state",
          verbEnergy: "land_custody",
          detailRhythm: "item_custody_with_scene_anchor",
          materialWeaveOrder: "item_then_custody_then_holder_scene",
          styleBudget: "scene_custody_cadence",
          closingFunction: "settle_outcome",
        };
      }
      if (beatObjective === "render_support_actor_presence") {
        return {
          perspective: "settled_result_present",
          sentenceShape: "support_actor_presence_line",
          openingSource: "visible_support_actor_label",
          verbEnergy: "place_presence",
          detailRhythm: hasSupportActorPresentationDetail
            ? "actor_visible_cue_with_scene_role_context"
            : "actor_presence_with_scene_role_context",
          materialWeaveOrder: hasSupportActorPresentationDetail
            ? "actor_then_visible_cue_then_scene"
            : "actor_then_scene_with_role_context",
          styleBudget: "support_presence_cadence",
          closingFunction: "settle_outcome",
        };
      }
      const preservesTokens = materialObligations.preserveTokenFactRefs.length > 0;
      return {
        perspective: "settled_result_present",
        sentenceShape: "result_beat_line",
        openingSource: "core_material_subject",
        verbEnergy: "land_result",
        detailRhythm: preservesTokens ? "core_with_preserved_tokens" : "single_core_material",
        materialWeaveOrder: preservesTokens ? "result_then_preserved_tokens" : "result_only",
        styleBudget: preservesTokens ? "result_with_anchor_cadence" : "result_beat_cadence",
        closingFunction: "settle_outcome",
      };
  }
}

function sentencePlanLiteraryCue(
  move: CleanNarratorPageTaskMove,
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
  beatObjective: CleanNarratorSentencePlanStep["beatObjective"],
  proseMaterials: CleanNarratorSentencePlanStep["proseMaterials"],
): CleanNarratorSentencePlanStep["literaryCue"] {
  switch (sentenceRole) {
    case "clarification_question":
      return {
        renderShape: "ask_accepted_clarification",
        cadence: "direct_question",
        styleLevers: ["accepted_label_anchor"],
      };
    case "exact_context_texture":
      return {
        renderShape: "copy_exact_context_texture",
        cadence: "exact_short_sentence",
        styleLevers: ["accepted_texture_only"],
      };
    case "context_anchor":
      return {
        renderShape: "place_player_in_context",
        cadence: "compact_present_beat",
        styleLevers: ["accepted_label_anchor", "concrete_present_verb"],
      };
    case "next_action_handle":
      if (proseMaterials.some((material) => material.proseUse === "inventory_status")) {
        return {
          renderShape: "land_settled_turn_result",
          cadence: "compact_present_beat",
          styleLevers: ["settled_state_focus", "accepted_label_anchor"],
        };
      }
      return {
        renderShape: "leave_scene_exit_handoff",
        cadence: "scene_exit_choice_sentence",
        styleLevers: sentencePlanHasProseUse(move, "time_value")
          ? ["route_exit_grouping", "accepted_label_anchor", "elapsed_time_pressure"]
          : ["route_exit_grouping", "accepted_label_anchor"],
      };
    case "turn_event_beat": {
      if (beatObjective === "frame_dialogue_reply") {
        return {
          renderShape: "frame_exact_quote",
          cadence: "quote_framed_beat",
          styleLevers: ["visible_speaker_frame", "accepted_label_anchor"],
        };
      }
      if (isStandaloneElapsedTimeMove(move)) {
        return {
          renderShape: "mark_elapsed_time_pressure_clock_beat",
          cadence: "pressure_clock_beat_sentence",
          styleLevers: ["elapsed_time_pressure", "clock_pressure_verb", "concrete_present_verb"],
        };
      }
      if (beatObjective === "render_item_custody") {
        return {
          renderShape: "weave_item_custody_scene_beat",
          cadence: "scene_custody_beat_sentence",
          styleLevers: ["item_custody_focus", "accepted_label_anchor", "settled_state_focus", "custody_endpoint_rotation"],
        };
      }
      if (beatObjective === "render_support_actor_presence") {
        return {
          renderShape: "weave_support_actor_scene_presence",
          cadence: "support_presence_beat_sentence",
          styleLevers: ["support_actor_presence_focus", "accepted_label_anchor", "concrete_present_verb"],
        };
      }
      const styleLevers: CleanNarratorSentencePlanStep["literaryCue"]["styleLevers"] = ["concrete_present_verb"];
      if (sentencePlanHasProseUse(move, "time_value")) styleLevers.push("elapsed_time_pressure");
      if (sentencePlanHasProseUse(move, "state_value")) styleLevers.push("settled_state_focus");
      if (sentencePlanHasProseUse(move, "label_anchor")) styleLevers.push("accepted_label_anchor");
      return {
        renderShape: "land_settled_turn_result",
        cadence: "compact_present_beat",
        styleLevers,
      };
    }
  }
}

function sentencePlanForMove(
  move: CleanNarratorPageTaskMove,
  sentenceIndex: number,
  claimKindsByEntryRef: Map<string, CleanNarrationClaimKind[]>,
  claimKindsByFactRef: Map<string, CleanNarrationClaimKind[]>,
  entryRefsByFactRef: Map<string, string[]>,
  coreProseCues: readonly CleanNarratorProseCue[],
): CleanNarratorSentencePlanDraft[] {
  const steps: CleanNarratorSentencePlanDraft[] = [];
  const pushPlan = (
    sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
    coverage: CleanNarratorSentencePlanStep["coverage"],
    preferredBackendFactRefs: string[],
    beatObjectiveOverride?: CleanNarratorSentencePlanStep["beatObjective"],
  ) => {
    if (preferredBackendFactRefs.length === 0) return;
    const proseMaterials = sentencePlanProseMaterials(move, preferredBackendFactRefs);
    const beatObjective = beatObjectiveOverride ?? sentencePlanBeatObjective(move, sentenceRole);
    const materialObligations = sentencePlanMaterialObligations(proseMaterials);
    const entryRefs = uniqueStrings(preferredBackendFactRefs.flatMap((factRef) =>
      entryRefsByFactRef.get(factRef) ?? []
    ));
    const hasSupportActorPresentationDetail = preferredBackendFactRefs.some((factRef) => {
      const fact = move.usableFacts.find((entry) => entry.factRef === factRef);
      return fact?.role === "support_actor_visible_cue"
        || fact?.role === "support_actor_public_summary";
    });
    steps.push({
      sentenceRef: `s${sentenceIndex + steps.length + 1}`,
      moveRef: move.moveRef,
      sentenceRole,
      coverage,
      entryRefs: entryRefs.length > 0 ? entryRefs : move.entryRefs,
      preferredBackendFactRefs,
      claimFocus: sentencePlanClaimFocus(move, preferredBackendFactRefs, claimKindsByEntryRef, claimKindsByFactRef),
      beatObjective,
      proseMaterials,
      materialObligations,
      textureCue: sentencePlanTextureCue(sentenceRole, proseMaterials),
      adventureCue: sentencePlanAdventureCue(sentenceRole, beatObjective, proseMaterials),
      proseAssembly: sentencePlanProseAssembly(
        sentenceRole,
        beatObjective,
        proseMaterials,
        materialObligations,
        hasSupportActorPresentationDetail,
      ),
      literaryCue: sentencePlanLiteraryCue(move, sentenceRole, beatObjective, proseMaterials),
    });
  };

  switch (move.proseMove) {
    case "ask_accepted_question":
      pushPlan("clarification_question", "required", sentencePlanPreferredFactRefs(move, ["primary_beat", "supporting_detail"]));
      break;
    case "establish_playable_context":
      pushPlan("exact_context_texture", move.coverage, selectFrameTextureFactRefs(move, coreProseCues));
      if (!coreProseCues.includes("item_state")) {
        pushPlan("context_anchor", "optional", sentencePlanPreferredFactRefs(move, ["scene_anchor"]));
      }
      break;
    case "render_authoritative_turn_event":
      if (
        move.entryProseCues.includes("support_actor_materialization")
        && move.entryProseCues.includes("dialogue_response")
      ) {
        pushPlan(
          "turn_event_beat",
          move.coverage,
          selectSupportActorPresenceFactRefs(move),
          "render_support_actor_presence",
        );
        pushPlan(
          "turn_event_beat",
          move.coverage,
          selectDialogueReplyFactRefs(move),
          "frame_dialogue_reply",
        );
      } else {
        pushPlan("turn_event_beat", move.coverage, selectTurnEventFactRefs(move));
      }
      break;
    case "leave_playable_next_action_handle":
      pushPlan("next_action_handle", move.coverage, selectPlayableNextActionFactRefs(move));
      pushPlan(
        "next_action_handle",
        move.coverage,
        selectDirectSceneInventoryStatusFactRefs(move),
        "render_direct_scene_snapshot",
      );
      break;
  }
  return steps;
}

function sentencePlanTransitionRole(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
): CleanNarratorSentencePlanStep["flowCue"]["transitionRole"] {
  switch (sentenceRole) {
    case "clarification_question":
      return "accepted_question";
    case "context_anchor":
      return "context_setup";
    case "exact_context_texture":
      return "context_texture";
    case "next_action_handle":
      return "playable_handle";
    case "turn_event_beat":
      return "settled_result";
  }
}

function sentencePlanReaderEffect(
  sentenceRole: CleanNarratorSentencePlanStep["sentenceRole"],
): CleanNarratorSentencePlanStep["flowCue"]["readerEffect"] {
  switch (sentenceRole) {
    case "clarification_question":
      return "request_specific_answer";
    case "context_anchor":
      return "carry_forward_context";
    case "exact_context_texture":
      return "orient_player";
    case "next_action_handle":
      return "offer_next_action";
    case "turn_event_beat":
      return "land_outcome";
  }
}

function sentencePlanWithFlowCues(
  drafts: CleanNarratorSentencePlanDraft[],
): CleanNarratorSentencePlanStep[] {
  return drafts.map((step, index) => ({
    ...step,
    flowCue: {
      pagePosition: drafts.length === 1
        ? "single"
        : index === 0
          ? "opening"
          : index === drafts.length - 1
            ? "closing"
            : "continuation",
      transitionRole: sentencePlanTransitionRole(step.sentenceRole),
      readerEffect: sentencePlanReaderEffect(step.sentenceRole),
    },
  }));
}

function buildCleanNarrativePageArc(
  moves: CleanNarratorPageTaskMove[],
): CleanNarratorPageArc {
  if (moves.length === 0) {
    return {
      arcShape: "audit_notice_only",
      pageCadence: "audit_notice_only",
      readerPosture: "review_audit_notice",
      closingIntent: "audit_notice",
    };
  }

  const hasClarification = moves.some((move) => move.proseMove === "ask_accepted_question");
  if (hasClarification) {
    return {
      arcShape: "accepted_clarification_question",
      pageCadence: "question_only",
      readerPosture: "answer_the_prompted_clarification",
      closingIntent: "accepted_question",
    };
  }

  const hasContext = moves.some((move) => move.proseMove === "establish_playable_context");
  const hasNextActionHandle = moves.some((move) => move.proseMove === "leave_playable_next_action_handle");
  if (hasContext && hasNextActionHandle) {
    return {
      arcShape: "context_then_choice_handle",
      pageCadence: "context_then_choice",
      readerPosture: "choose_visible_next_action",
      closingIntent: "playable_next_action",
    };
  }
  if (hasNextActionHandle) {
    return {
      arcShape: "single_choice_handle",
      pageCadence: "single_compact_beat",
      readerPosture: "choose_visible_next_action",
      closingIntent: "playable_next_action",
    };
  }
  if (hasContext) {
    return {
      arcShape: "context_then_settled_result",
      pageCadence: "context_then_result",
      readerPosture: "continue_from_settled_result",
      closingIntent: "settled_result",
    };
  }
  return {
    arcShape: "single_settled_result",
    pageCadence: "single_compact_beat",
    readerPosture: "continue_from_settled_result",
    closingIntent: "settled_result",
  };
}

function storyPageBriefKind(
  pageArc: CleanNarratorPageArc,
): CleanNarratorStoryPageBrief["pageKind"] {
  switch (pageArc.arcShape) {
    case "accepted_clarification_question":
      return "clarification_prompt_page";
    case "audit_notice_only":
      return "audit_notice_page";
    case "context_then_choice_handle":
      return "context_to_playable_choices_page";
    case "context_then_settled_result":
      return "context_to_settled_result_page";
    case "single_choice_handle":
      return "playable_choices_page";
    case "single_settled_result":
      return "settled_turn_page";
  }
}

function storyPageBriefCompositionJob(
  pageArc: CleanNarratorPageArc,
): CleanNarratorStoryPageBrief["compositionJob"] {
  switch (pageArc.arcShape) {
    case "accepted_clarification_question":
      return "ask_accepted_clarification";
    case "audit_notice_only":
      return "render_audit_notice";
    case "context_then_choice_handle":
      return "place_context_then_offer_scene_exits";
    case "context_then_settled_result":
      return "place_context_then_land_result";
    case "single_choice_handle":
      return "offer_scene_exits";
    case "single_settled_result":
      return "land_settled_turn_result";
  }
}

function storyPageBriefOpeningInstruction(
  pageArc: CleanNarratorPageArc,
): CleanNarratorStoryPageBrief["openingInstruction"] {
  switch (pageArc.arcShape) {
    case "accepted_clarification_question":
      return "ask_accepted_question";
    case "audit_notice_only":
      return "begin_with_audit_notice";
    case "context_then_choice_handle":
    case "context_then_settled_result":
      return "begin_with_accepted_context";
    case "single_choice_handle":
      return "begin_with_playable_choices";
    case "single_settled_result":
      return "begin_with_settled_result";
  }
}

function storyPageBriefClosingInstruction(
  pageArc: CleanNarratorPageArc,
): CleanNarratorStoryPageBrief["closingInstruction"] {
  switch (pageArc.closingIntent) {
    case "accepted_question":
      return "close_on_accepted_question";
    case "audit_notice":
      return "close_on_audit_notice";
    case "playable_next_action":
      return "close_on_playable_handle";
    case "settled_result":
      return "close_on_settled_result";
  }
}

function buildCleanStoryPageBrief(
  pageArc: CleanNarratorPageArc,
  moves: CleanNarratorPageTaskMove[],
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorStoryPageBrief {
  return {
    pageKind: storyPageBriefKind(pageArc),
    narratorStance: "second_person_present_player_view",
    proseRegister: "grounded_adventure_micro_page",
    compositionJob: storyPageBriefCompositionJob(pageArc),
    openingInstruction: storyPageBriefOpeningInstruction(pageArc),
    closingInstruction: storyPageBriefClosingInstruction(pageArc),
    requiredMoveRefs: moves
      .filter((move) => move.coverage === "required")
      .map((move) => move.moveRef),
    optionalMoveRefs: moves
      .filter((move) => move.coverage === "optional")
      .map((move) => move.moveRef),
    requiredSentenceRefs: sentencePlan
      .filter((step) => step.coverage === "required")
      .map((step) => step.sentenceRef),
    optionalSentenceRefs: sentencePlan
      .filter((step) => step.coverage === "optional")
      .map((step) => step.sentenceRef),
  };
}

function pagePerformanceOpeningBeat(
  pageArc: CleanNarratorPageArc,
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPagePerformance["openingBeat"] {
  if (pageArc.arcShape === "audit_notice_only") return "audit_notice_opening";
  if (pageArc.arcShape === "accepted_clarification_question") return "accepted_question_opening";
  if (sentencePlan.some((step) => step.sentenceRole === "exact_context_texture")) return "exact_texture_opening";
  if (sentencePlan.some((step) => step.sentenceRole === "context_anchor")) return "context_anchor_opening";
  if (pageArc.arcShape === "single_choice_handle") return "playable_choices_opening";
  return "settled_result_opening";
}

function pagePerformanceMotion(
  pageArc: CleanNarratorPageArc,
): CleanNarratorPagePerformance["pageMotion"] {
  switch (pageArc.arcShape) {
    case "accepted_clarification_question":
      return "question_only";
    case "audit_notice_only":
      return "audit_notice_only";
    case "context_then_choice_handle":
      return "context_to_choices";
    case "context_then_settled_result":
      return "context_to_result";
    case "single_choice_handle":
      return "single_choice_handle";
    case "single_settled_result":
      return "single_result";
  }
}

function pagePerformanceContinuityMaterial(
  pageArc: CleanNarratorPageArc,
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPagePerformance["continuityMaterial"] {
  if (pageArc.arcShape === "audit_notice_only") return "audit_notice";
  if (pageArc.arcShape === "accepted_clarification_question") return "accepted_question";
  if (pageArc.arcShape === "single_choice_handle") return "playable_route_material";
  if (pageArc.arcShape === "single_settled_result") return "result_material";

  const hasTexture = sentencePlan.some((step) => step.sentenceRole === "exact_context_texture");
  if (pageArc.arcShape === "context_then_choice_handle") {
    return hasTexture ? "texture_to_choices" : "context_labels_to_choices";
  }
  return hasTexture ? "texture_to_result" : "context_labels_to_result";
}

function pagePerformanceClosingBeat(
  pageArc: CleanNarratorPageArc,
): CleanNarratorPagePerformance["closingBeat"] {
  switch (pageArc.closingIntent) {
    case "accepted_question":
      return "accepted_question_closure";
    case "audit_notice":
      return "audit_notice_closure";
    case "playable_next_action":
      return "playable_handle_closure";
    case "settled_result":
      return "settled_result_closure";
  }
}

function pagePerformanceReaderHandoff(
  pageArc: CleanNarratorPageArc,
): CleanNarratorPagePerformance["readerHandoff"] {
  switch (pageArc.readerPosture) {
    case "answer_the_prompted_clarification":
      return "answer_clarification";
    case "choose_visible_next_action":
      return "choose_next_action";
    case "continue_from_settled_result":
      return "continue_from_result";
    case "review_audit_notice":
      return "review_audit_notice";
  }
}

function buildCleanPagePerformance(
  pageArc: CleanNarratorPageArc,
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPagePerformance {
  return {
    openingBeat: pagePerformanceOpeningBeat(pageArc, sentencePlan),
    pageMotion: pagePerformanceMotion(pageArc),
    continuityMaterial: pagePerformanceContinuityMaterial(pageArc, sentencePlan),
    closingBeat: pagePerformanceClosingBeat(pageArc),
    readerHandoff: pagePerformanceReaderHandoff(pageArc),
  };
}

function pageVariationOpeningRotation(
  pagePerformance: CleanNarratorPagePerformance,
): CleanNarratorPageVariation["openingRotation"] {
  switch (pagePerformance.openingBeat) {
    case "accepted_question_opening":
      return "question_material_first";
    case "audit_notice_opening":
      return "audit_notice_first";
    case "context_anchor_opening":
      return "context_label_first";
    case "exact_texture_opening":
      return "texture_sentence_first";
    case "playable_choices_opening":
      return "route_choice_first";
    case "settled_result_opening":
      return "core_result_first";
  }
}

function pageVariationCadenceTarget(
  pagePerformance: CleanNarratorPagePerformance,
): CleanNarratorPageVariation["cadenceTarget"] {
  switch (pagePerformance.pageMotion) {
    case "audit_notice_only":
      return "audit_notice_sentence";
    case "context_to_choices":
      return "context_then_playable_handle";
    case "context_to_result":
      return "context_then_short_result";
    case "question_only":
      return "direct_question";
    case "single_choice_handle":
      return "choice_list_as_sentence";
    case "single_result":
      return "single_micro_beat";
  }
}

function pageVariationDictionPalette(
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPageVariation["dictionPalette"] {
  if (sentencePlan.length === 0) return ["audit_notice_clarity"];

  const palette: CleanNarratorPageVariation["dictionPalette"] = [];
  const add = (item: CleanNarratorPageVariation["dictionPalette"][number]) => {
    if (!palette.includes(item)) palette.push(item);
  };

  if (sentencePlan.some((step) => step.sentenceRole === "exact_context_texture")) {
    add("accepted_texture_atmosphere");
  }
  if (sentencePlan.some((step) =>
    step.sentenceRole === "context_anchor"
      || step.proseMaterials.some((material) =>
        material.proseUse === "label_anchor" || material.proseUse === "scene_anchor"
      )
  )) {
    add("scene_anchor_tokens");
  }
  if (sentencePlan.some((step) =>
    step.sentenceRole === "turn_event_beat" && step.beatObjective !== "frame_dialogue_reply"
  )) {
    add("concrete_result_verbs");
  }
  if (sentencePlan.some((step) =>
    step.proseMaterials.some((material) => material.proseUse === "time_value")
  )) {
    add("time_pressure");
  }
  if (sentencePlan.some((step) => step.beatObjective === "frame_dialogue_reply")) {
    add("quote_frame");
  }
  if (sentencePlan.some((step) => step.sentenceRole === "next_action_handle")) {
    add("playable_route_labels");
  }
  if (sentencePlan.some((step) => step.sentenceRole === "clarification_question")) {
    add("question_clarity");
  }

  if (palette.length === 0) {
    throw new Error("Narrative page variation requires a sentence plan diction palette.");
  }
  return palette;
}

function buildCleanPageVariation(
  pagePerformance: CleanNarratorPagePerformance,
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPageVariation {
  return {
    openingRotation: pageVariationOpeningRotation(pagePerformance),
    cadenceTarget: pageVariationCadenceTarget(pagePerformance),
    dictionPalette: pageVariationDictionPalette(sentencePlan),
    variationBoundary: "vary_syntax_only_inside_cited_material",
  };
}

function pageFocusEmphasis(
  pageArc: CleanNarratorPageArc,
): CleanNarratorPageFocus["emphasis"] {
  switch (pageArc.closingIntent) {
    case "accepted_question":
      return "accepted_clarification";
    case "audit_notice":
      return "audit_notice";
    case "playable_next_action":
      return "playable_next_action";
    case "settled_result":
      return "settled_turn_event";
  }
}

function pageFocusCoreFrameRelationship(
  pageArc: CleanNarratorPageArc,
): CleanNarratorPageFocus["coreFrameRelationship"] {
  switch (pageArc.arcShape) {
    case "accepted_clarification_question":
      return "question_is_page_core";
    case "audit_notice_only":
      return "audit_notice_only";
    case "context_then_choice_handle":
      return "context_frames_choices";
    case "context_then_settled_result":
      return "context_frames_result";
    case "single_choice_handle":
      return "choices_stand_alone";
    case "single_settled_result":
      return "result_stands_alone";
  }
}

function pageFocusContextUse(
  pageArc: CleanNarratorPageArc,
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPageFocus["contextUse"] {
  if (pageArc.arcShape === "audit_notice_only") return "audit_only";
  if (sentencePlan.some((step) =>
    step.coverage === "optional" && step.sentenceRole === "exact_context_texture"
  )) {
    return "texture_before_core";
  }
  if (sentencePlan.some((step) =>
    step.coverage === "optional" && step.sentenceRole === "context_anchor"
  )) {
    return "orient_before_core";
  }
  return "none";
}

function pageFocusPreferredFrameSentenceRefs(
  sentencePlan: CleanNarratorSentencePlanStep[],
): string[] {
  const optionalTextureRefs = sentencePlan
    .filter((step) => step.coverage === "optional" && step.sentenceRole === "exact_context_texture")
    .map((step) => step.sentenceRef);
  if (optionalTextureRefs.length > 0) return optionalTextureRefs;

  return sentencePlan
    .filter((step) => step.coverage === "optional" && step.sentenceRole === "context_anchor")
    .map((step) => step.sentenceRef);
}

function pageFocusFrameSelection(
  pageArc: CleanNarratorPageArc,
  preferredFrameSentenceRefs: readonly string[],
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPageFocus["frameSelection"] {
  if (pageArc.arcShape === "audit_notice_only") return "audit_notice_only";
  if (preferredFrameSentenceRefs.length === 0) return "no_frame";
  const preferred = new Set(preferredFrameSentenceRefs);
  return sentencePlan.some((step) =>
    preferred.has(step.sentenceRef) && step.sentenceRole === "exact_context_texture"
  )
    ? "prefer_texture_frame"
    : "prefer_scene_anchor_frame";
}

function buildCleanPageFocus(
  pageArc: CleanNarratorPageArc,
  moves: CleanNarratorPageTaskMove[],
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorPageFocus {
  const preferredFrameSentenceRefs = pageFocusPreferredFrameSentenceRefs(sentencePlan);
  return {
    coreMoveRefs: moves
      .filter((move) => move.coverage === "required")
      .map((move) => move.moveRef),
    frameMoveRefs: moves
      .filter((move) => move.coverage === "optional")
      .map((move) => move.moveRef),
    coreSentenceRefs: sentencePlan
      .filter((step) => step.coverage === "required")
      .map((step) => step.sentenceRef),
    frameSentenceRefs: sentencePlan
      .filter((step) => step.coverage === "optional")
      .map((step) => step.sentenceRef),
    preferredFrameSentenceRefs,
    emphasis: pageFocusEmphasis(pageArc),
    frameSelection: pageFocusFrameSelection(pageArc, preferredFrameSentenceRefs, sentencePlan),
    coreFrameRelationship: pageFocusCoreFrameRelationship(pageArc),
    contextUse: pageFocusContextUse(pageArc, sentencePlan),
  };
}

function choicePresentationMode(choiceCount: number): CleanNarratorChoicePresentation["mode"] {
  if (choiceCount === 0) return "none";
  if (choiceCount === 1) return "single_route";
  if (choiceCount <= 4) return "compact_route_group";
  return "wide_scene_exit_group";
}

function choicePresentationClosingStyle(
  mode: CleanNarratorChoicePresentation["mode"],
): CleanNarratorChoicePresentation["closingStyle"] {
  switch (mode) {
    case "compact_route_group":
      return "group_named_options_with_cost";
    case "none":
      return "none";
    case "single_route":
      return "name_single_exit";
    case "wide_scene_exit_group":
      return "show_scene_exit_group";
  }
}

function choicePresentationCostHandling(
  choices: CleanNarratorChoicePresentation["choices"],
): CleanNarratorChoicePresentation["costHandling"] {
  const costs = choices.map((choice) => choice.costText).filter((cost): cost is string => cost !== null);
  if (costs.length === 0) return "omit_costs";
  if (costs.length === choices.length && uniqueStrings(costs).length === 1) return "preserve_shared_cost";
  return "preserve_per_route_costs";
}

function usableFactByRole(
  moves: CleanNarratorPageTaskMove[],
  role: CleanNarratorPageTaskMove["usableFacts"][number]["role"],
): CleanNarratorPageTaskMove["usableFacts"][number] | null {
  for (const move of moves) {
    const fact = move.usableFacts.find((entry) => entry.role === role);
    if (fact) return fact;
  }
  return null;
}

function parseRouteChoiceCostMap(value: string): Map<string, string> {
  const costs = new Map<string, string>();
  for (const part of splitEvidenceLabels(value)) {
    const separator = part.indexOf(":");
    if (separator <= 0) continue;
    const label = part.slice(0, separator).trim();
    const cost = part.slice(separator + 1).trim();
    if (label.length > 0 && cost.length > 0) costs.set(label, cost);
  }
  return costs;
}

function buildCleanChoicePresentation(
  moves: CleanNarratorPageTaskMove[],
  sentencePlan: CleanNarratorSentencePlanStep[],
): CleanNarratorChoicePresentation {
  const choiceSentencePlan = sentencePlan.filter((step) =>
    step.sentenceRole === "next_action_handle"
      && step.proseMaterials.some((material) => material.proseUse === "route_choice")
  );
  const sourceSentenceRefs = choiceSentencePlan.map((step) => step.sentenceRef);
  const sourceMoveRefs = uniqueStrings(choiceSentencePlan.map((step) => step.moveRef));
  if (sourceMoveRefs.length === 0 || sourceSentenceRefs.length === 0) {
    return {
      mode: "none",
      sourceMoveRefs: [],
      sourceSentenceRefs: [],
      choices: [],
      choiceCount: 0,
      anchorFactRefs: [],
      anchorStyle: "choice_labels_only",
      labelHandling: "preserve_route_labels_verbatim",
      costHandling: "omit_costs",
      closingStyle: "none",
      readerHandoff: "none",
    };
  }

  const choiceMoves = moves.filter((move) => sourceMoveRefs.includes(move.moveRef));
  const labelFact = usableFactByRole(choiceMoves, "open_route_labels")
    ?? usableFactByRole(choiceMoves, "route_choice_labels");
  if (!labelFact?.value) {
    throw new Error("Narrative choice presentation requires accepted route label value evidence.");
  }
  const labels = splitRouteChoiceLabels(labelFact.value);
  const costFact = usableFactByRole(choiceMoves, "route_choice_travel_costs");
  const originFact = usableFactByRole(choiceMoves, "route_origin");
  const costMap = costFact?.value ? parseRouteChoiceCostMap(costFact.value) : new Map<string, string>();
  const choices = labels.map((label) => {
    const costText = costMap.get(label) ?? null;
    return {
      label,
      labelFactRef: labelFact.factRef,
      costText,
      costFactRef: costText && costFact ? costFact.factRef : null,
    };
  });
  const mode = choicePresentationMode(choices.length);
  return {
    mode,
    sourceMoveRefs,
    sourceSentenceRefs,
    choices,
    choiceCount: choices.length,
    anchorFactRefs: originFact?.value ? [originFact.factRef] : [],
    anchorStyle: originFact?.value ? "route_origin_place_label" : "choice_labels_only",
    labelHandling: "preserve_route_labels_verbatim",
    costHandling: choicePresentationCostHandling(choices),
    closingStyle: choicePresentationClosingStyle(mode),
    readerHandoff: choices.length > 0 ? "choose_one_visible_route" : "none",
  };
}

function buildCleanNarrativePageTask(
  storyFrame: CleanNarratorPromptInput["storyFrame"],
  acceptedEvidence: AcceptedNarrationEvidence[],
): CleanNarratorPromptInput["narrativePageTask"] {
  const entries = [...storyFrame.currentContext, ...storyFrame.turnEvents];
  const entriesByRef = new Map(entries.map((entry) => [entry.ref, entry] as const));
  const claimKindsByEntryRef = new Map(entries.map((entry) => [entry.ref, entry.claimKinds] as const));
  const claimKindsByFactRef = new Map<string, CleanNarrationClaimKind[]>();
  const entryRefsByFactRef = new Map<string, string[]>();
  for (const entry of entries) {
    for (const factRef of entry.backendFactRefs) {
      claimKindsByFactRef.set(factRef, entry.claimKinds);
      entryRefsByFactRef.set(factRef, uniqueStrings([
        ...(entryRefsByFactRef.get(factRef) ?? []),
        entry.ref,
      ]));
    }
  }
  const backendFactsByRef = new Map(
    acceptedEvidence.flatMap((evidence) =>
      evidence.backendFacts.map((fact) => [fact.factRef, fact] as const)
    ),
  );
  const elapsedTimeSceneAnchor = selectCurrentSceneLabelAnchor({
    currentContext: storyFrame.currentContext,
    backendFactsByRef,
  });
  const hasAuthoritativeTurnMove = storyFrame.pagePlan.steps.some((step) =>
    step.step === "ask_clarification" || step.step === "narrate_turn_event"
  );
  const moves: CleanNarratorPageTaskMove[] = storyFrame.pagePlan.steps.map((step, index) => {
    const stepEntryRefs = uniqueStrings(step.entryRefs.flatMap((ref) => [ref]));
    const stepProseCues = uniqueStrings(stepEntryRefs.flatMap((ref) => {
      const cue = entriesByRef.get(ref)?.proseCue;
      return cue ? [cue] : [];
    })) as CleanNarratorProseCue[];
    const ownsStandaloneElapsedTime = step.step === "narrate_turn_event"
      && stepProseCues.includes("elapsed_time")
      && !stepProseCues.includes("movement_result");
    const entryRefs = ownsStandaloneElapsedTime
      ? uniqueStrings([...stepEntryRefs, ...elapsedTimeSceneAnchor.entryRefs])
      : stepEntryRefs;
    const entryProseCues = uniqueStrings(entryRefs.flatMap((ref) => {
      const cue = entriesByRef.get(ref)?.proseCue;
      return cue ? [cue] : [];
    })) as CleanNarratorProseCue[];
    const moveBackendFactRefs = uniqueStrings([
      ...stepEntryRefs.flatMap((ref) =>
      entriesByRef.get(ref)?.backendFactRefs ?? []
      ),
      ...(ownsStandaloneElapsedTime ? elapsedTimeSceneAnchor.factRefs : []),
    ]);
    const usableFacts = moveBackendFactRefs.flatMap((factRef) => {
      const fact = backendFactsByRef.get(factRef);
      return fact ? [fact] : [];
    });
    return {
      moveRef: `m${index + 1}`,
      step: step.step,
      entryRefs,
      entryProseCues,
      proseMove: narrativePageProseMove(step.step),
      coverage: narrativePageMoveCoverage(step.step, hasAuthoritativeTurnMove),
      allowedBackendFactRefs: moveBackendFactRefs,
      usableFacts,
      factUses: usableFacts.map((fact) => ({
        factRef: fact.factRef,
        proseUse: narrativeFactProseUse(fact),
      })),
    };
  });
  const sentencePlanDrafts: CleanNarratorSentencePlanDraft[] = [];
  const coreProseCues = uniqueStrings(moves
    .filter((move) => move.coverage === "required")
    .flatMap((move) => move.entryProseCues)) as CleanNarratorProseCue[];
  for (const move of moves) {
    sentencePlanDrafts.push(...sentencePlanForMove(
      move,
      sentencePlanDrafts.length,
      claimKindsByEntryRef,
      claimKindsByFactRef,
      entryRefsByFactRef,
      coreProseCues,
    ));
  }
  const sentencePlan = sentencePlanWithFlowCues(sentencePlanDrafts);
  const pageArc = buildCleanNarrativePageArc(moves);
  const pagePerformance = buildCleanPagePerformance(pageArc, sentencePlan);

  return {
    version: "gameplay-runtime.clean-narrator-page-task.v1",
    source: "derived_from_story_frame_page_plan",
    referenceProfile: "zetta_micro_1_1_3_primary_ff5_micro_secondary",
    pageGoal: "turn_changelog_to_grounded_text_rpg_page",
    truthBoundary: "accepted_evidence_only",
    storyPageBrief: buildCleanStoryPageBrief(pageArc, moves, sentencePlan),
    pageArc,
    pagePerformance,
    pageVariation: buildCleanPageVariation(pagePerformance, sentencePlan),
    pageFocus: buildCleanPageFocus(pageArc, moves, sentencePlan),
    choicePresentation: buildCleanChoicePresentation(moves, sentencePlan),
    moves,
    sentencePlan,
  };
}

function zodIssue(issue: { path: PropertyKey[]; message: string }): CleanNarrationValidationIssue {
  return {
    code: "schema_invalid",
    path: issue.path.map(String).join(".") || "<root>",
    message: issue.message,
  };
}

function leakageIssues(input: {
  view: CleanNarratorView;
  promptInput: CleanNarratorPromptInput;
  candidate: CleanNarrationCandidate;
}): CleanNarrationValidationIssue[] {
  const text = input.candidate.sentences.map((sentence) => sentence.text).join("\n")
    + "\n"
    + input.candidate.finalText;
  const issues: CleanNarrationValidationIssue[] = [];
  const privateTerms = uniqueStrings([
    ...input.view.privateGuardSidecar.forbiddenActorLabels,
    ...input.view.privateGuardSidecar.forbiddenPrivateTerms,
  ]);

  for (const term of privateTerms) {
    if (text.toLowerCase().includes(term.toLowerCase())) {
      issues.push({
        code: "private_term",
        path: "finalText",
        message: "Narration candidate leaked a private guard term.",
      });
      break;
    }
  }

  const internalToken = knownInternalNarrationTokens(input.view, input.promptInput)
    .find((token) => text.includes(token));
  if (internalToken) {
    issues.push({
      code: "backend_ref",
      path: "finalText",
      message: `Narration candidate copied internal prompt token ${internalToken} into player-facing text.`,
    });
  }

  return issues;
}

function knownInternalNarrationTokens(
  view: CleanNarratorView,
  promptInput: CleanNarratorPromptInput,
): string[] {
  return uniqueStrings([
    view.packetId,
    view.campaignId,
    view.turnId,
    promptInput.version,
    promptInput.storyFrame.version,
    promptInput.storyFrame.pagePlan.version,
    promptInput.narrativePageTask.version,
    ...view.acceptedEvidence.flatMap((evidence) => [
      evidence.ref,
      ...evidence.backendFacts.map((fact) => fact.factRef),
    ]),
    ...view.stepAuditForGrounding.map((step) => step.stepId),
    ...promptInput.narrativePageTask.moves.map((move) => move.moveRef),
    ...promptInput.narrativePageTask.sentencePlan.map((step) => step.sentenceRef),
  ]).filter((token) => token.length >= 4);
}

function isDirectSceneEvidence(evidence: AcceptedNarrationEvidence): boolean {
  return evidence.authority === "scene_frame_snapshot"
    || evidence.authority === "scene_observation_receipt";
}

export function buildCleanNarratorPromptInput(view: CleanNarratorView): CleanNarratorPromptInput {
  const acceptedEvidence = selectPromptAcceptedEvidence(view);
  const storyFrame = buildCleanNarratorStoryFrame(acceptedEvidence);
  return assertCleanNarratorPromptInput({
    version: "gameplay-runtime.clean-narrator-prompt-input.v1",
    packetId: view.packetId,
    turnId: view.turnId,
    responseLanguage: view.responseLanguage,
    language: view.language,
    languageSource: view.languageSource,
    preserveLabelsVerbatim: view.preserveLabelsVerbatim,
    acceptedEvidence,
    storyFrame,
    narrativePageTask: buildCleanNarrativePageTask(storyFrame, acceptedEvidence),
    stepAuditForGrounding: view.stepAuditForGrounding,
    guard: view.guard,
  });
}

function cleanNarrationStyleLines(styleMode: CleanNarrationStyleMode): string[] {
  if (styleMode === "realism_nsfw") {
    return [
      "Adult realism mode: active only when the caller explicitly passes styleMode=realism_nsfw and accepted evidence places the turn in adult-rated intimacy, violence, injury, desire, or bodily vulnerability.",
      "Adult realism role: use slow-burn pacing, frank physical diction, body-specific detail, sensory pressure, and character motive from accepted evidence.",
      "Adult realism NPC agency: portray visible goals, pursuit, hesitation, appetite, fear, pain, tenderness, cruelty, and speech through accepted actions and utterances.",
      "Adult realism pacing: let attraction, threat, revulsion, injury, pleasure, or tenderness build through concrete beats; preserve the scene's motive and consequence path.",
      "Adult realism boundary: adult-rated detail requires adult characters, campaign rating support, accepted evidence refs, and the same clean narration grounding contract as every other turn.",
    ];
  }
  return [];
}

export function buildCleanNarrationSystemPrompt(
  styleMode: CleanNarrationStyleMode = "grounded_clean",
): string {
  return [
    "You are WorldForge Stage 6 Narration.",
    "Return only JSON matching gameplay-runtime.clean-narration-candidate.v1.",
    "World-truth source: promptInput.acceptedEvidence[].backendFacts and promptInput.acceptedEvidence[].text.",
    "raw player action is intentionally omitted; write the settled result described by accepted evidence.",
    "Stage authority: narration phrases accepted evidence into player-facing prose.",
    "Story frame: promptInput.storyFrame.currentContext is compressed current playable context; promptInput.storyFrame.turnEvents is the authoritative summary of what happened this turn. storyFrame derives from promptInput.acceptedEvidence and adds no separate world truth.",
    "Story frame use: choose sentence shape, emphasis, pacing, and page flow from storyFrame, then prove every accepted_evidence sentence with evidenceRefs, backendFactRefs, and claimKinds from promptInput.acceptedEvidence.",
    "Story composition cues: use storyFrame entries' proseCue to understand each beat kind and compositionSlot to order the page. opening_context and texture_context frame the scene, event_beat carries the settled result, next_action_context leaves the player with usable visible choices, and clarification asks the accepted question. These cues are derived routing hints and add no world truth.",
    "Story page plan: promptInput.storyFrame.pagePlan.steps gives the intended page order by entryRefs. Use open_with_context for setup, narrate_turn_event for the settled result, close_with_next_action_context for visible choices or direct-scene affordances, and ask_clarification for accepted clarification questions. The page plan organizes accepted evidence; it does not authorize facts beyond cited evidence.",
    "Story page brief: promptInput.narrativePageTask.storyPageBrief names the writer-facing page kind, second-person present stance, grounded adventure register, composition job, opening instruction, closing instruction, and required/optional move and sentence refs. Use it to turn the accepted changelog into one playable story page while keeping every claim inside cited evidence.",
    "Page arc: promptInput.narrativePageTask.pageArc names the whole-page shape and reader posture. Use arcShape, pageCadence, and closingIntent to make the sentence objects read as one playable RPG page: a single settled beat, context into result, context into choices, or an accepted clarification question. Page arc shapes flow only; accepted evidence remains the only source of facts.",
    "Page performance: promptInput.narrativePageTask.pagePerformance names openingBeat, pageMotion, continuityMaterial, closingBeat, and readerHandoff. Use it to connect sentencePlan steps into one text-RPG page: start from the opening material, carry continuity material through the page motion, and land the reader handoff while preserving sentence refs and evidence refs.",
    "Page variation: promptInput.narrativePageTask.pageVariation names openingRotation, cadenceTarget, dictionPalette, and variationBoundary. Use it to vary syntax, cadence, and RPG diction across pages while staying inside cited proseMaterials; variationBoundary=vary_syntax_only_inside_cited_material means style changes the phrasing path, not the facts.",
    "Page focus: promptInput.narrativePageTask.pageFocus names coreMoveRefs/coreSentenceRefs, frameMoveRefs/frameSentenceRefs, preferredFrameSentenceRefs, emphasis, frameSelection, coreFrameRelationship, and contextUse. Treat the core refs as the story page center: the accepted turn event, playable next-action handle, or accepted clarification. When preferredFrameSentenceRefs is nonempty, use those frame sentence refs before the core; other frame refs are support material and may be omitted. Treat frame refs as context that orients the reader before the core, never as competing gameplay truth.",
    "Choice presentation: promptInput.narrativePageTask.choicePresentation names sourceMoveRefs/sourceSentenceRefs, exact route choices, anchorStyle, cost handling, closingStyle, and readerHandoff for playable route-choice pages. Use choices as scene exits the reader can choose from accepted route evidence: preserve route labels verbatim, mention shared or per-route costs only when present in choicePresentation, anchor through route origin as a place label when anchorStyle=route_origin_place_label, reserve posture verbs for cited player_local_condition evidence, and close as an adventure handoff with the named exits carrying the next move.",
    "Narrative page task: promptInput.narrativePageTask turns the story page plan into writer moves. Follow each move's proseMove order, use its entryRefs for page structure, and draw material from its usableFacts while citing only its allowedBackendFactRefs plus the cited accepted evidence.",
    "Beat objectives: each page move carries entryProseCues from storyFrame, and each sentencePlan step carries beatObjective. Use beatObjective as the concrete RPG sentence job: movement arrival, elapsed time, route status, route choices, item custody, dialogue reply, local observation, device surface, support actor presence, player condition, minor POI handle, oracle outcome, direct scene snapshot, scene texture, or accepted clarification.",
    "Claim focus: each sentencePlan step carries claimFocus.primaryClaimKinds and supportingClaimKinds. Set output sentence.claimKinds from the primaryClaimKinds of the cited sentencePlanRefs; if one player-facing sentence combines two planned roles, cite both sentencePlanRefs and use only their combined primaryClaimKinds. supportingClaimKinds names nearby context owned by other planned sentences.",
    "Fact use plan: each page move's factUses tells how usableFacts enter prose. primary_beat drives the sentence, exact_texture_sentence, exact_dialogue_quote, and inventory_status copy accepted values exactly when cited, label_anchor and scene_anchor preserve names/placement, time_value and route_choice carry playable quantities/options, state_value carries settled state, and supporting_detail stays supporting material.",
    "Sentence plan: promptInput.narrativePageTask.sentencePlan gives the intended sentence-object order. Use sentenceRole to shape each sentence, preferredBackendFactRefs to pick the core material, textureCue to decide whether this sentence owns texture, sentenceRef to set sentencePlanRefs, and moveRef to set pageMoveRefs on the matching output sentence.",
    "Prose materials: each sentencePlan step includes proseMaterials derived from accepted backend facts. Use materialText as the sentence's concrete raw material, materialTextSource as provenance, proseUse as purpose, and copyMode to know whether to copy exact text, preserve a token, or phrase from the material. Do not use backend-style role labels as player-facing prose.",
    "Material obligations: each sentencePlan step carries materialObligations. Cite backendFactRefs only from allowedMaterialFactRefs on the cited sentencePlanRefs, include at least one coreMaterialFactRefs value, copy exactCopyFactRefs materials exactly when used, preserve labels/time/state from preserveTokenFactRefs, and phrase phraseFromMaterialFactRefs into natural adventure prose.",
    "Flow cues: each sentencePlan step includes flowCue.pagePosition, flowCue.transitionRole, and flowCue.readerEffect. Use flowCue to connect sentence objects as opening, continuation, closing, or single-beat page flow while preserving the cited refs for every claim.",
    "Literary cues: each sentencePlan step includes literaryCue.renderShape, literaryCue.cadence, and literaryCue.styleLevers. Use these as the prose method for that sentence: concrete verb choice, accepted label anchoring, visible speaker frame, elapsed-time pressure, exact texture copying, or playable choice grouping. Cues shape language only; they never authorize facts beyond the step's refs.",
    "Texture cues: each sentencePlan step includes textureCue. mode=copy_exact_texture_sentence means this sentence owns the selected public scene texture frame and must copy one allowedTextureFactRefs material as its own context sentence. mode=omit_texture_in_this_sentence means the sentence should spend its prose on its preferred non-texture materials. Texture cues organize accepted scene texture; they never authorize new setting detail.",
    "Selected texture frame: when accepted scene_texture has multiple backend facts, the page task places the chosen page frame in textureCue.allowedTextureFactRefs and materialObligations for the texture sentence. Other accepted texture facts remain proof context, not default player-facing prose for this page.",
    "Adventure cues: each sentencePlan step includes adventureCue.subjectFocus, adventureCue.verbFrame, and adventureCue.detailPalette. Use subjectFocus as the sentence's grammatical center, verbFrame as the action/placement frame, and detailPalette as the accepted material palette. These cues convert changelog entries into RPG scene beats while keeping every noun, action, quote, route, time, texture, and state inside cited proseMaterials.",
    "Prose assembly: each sentencePlan step includes proseAssembly.perspective, sentenceShape, openingSource, verbEnergy, detailRhythm, materialWeaveOrder, styleBudget, and closingFunction. Use these fields as the sentence construction contract: pick the grammatical vantage, line shape, accepted opening material, verb force, detail rhythm, material order, legal style budget, and page-ending job before phrasing the cited proseMaterials. clock_beat_line with pressure_time uses the accepted duration as the subject, the accepted scene_anchor token as placement, and a present-tense pressure or settling verb frame such as '<time> gather at <scene>', '<time> settle over <scene>', or '<time> press around <scene>'. scene_custody_beat_line with item_then_custody_then_holder_scene uses the accepted item label as the sentence center, custody_change as the transfer spine, settled_custody/final_equip_state as the landing state, and current_scene_anchor as the placement token. scene_exit_choice_line with exits_then_costs uses accepted route labels as named scene exits, accepted route_origin as the placement token, and accepted route_choice_travel_costs as exact travel-cost material. support_actor_presence_line with actor_then_scene_with_role_context uses accepted visible_support_actor as the sentence center, anchor_scene as the exact placement token, support_role as identity context, and support_actor_presence as proof that the actor is in view. support_actor_presence_line with actor_then_visible_cue_then_scene uses accepted support_actor_visible_cue or support_actor_public_summary as visible detail material between the actor label and exact scene anchor.",
    "Page move proof: every accepted_evidence sentence must include pageMoveRefs from promptInput.narrativePageTask.moves[].moveRef. A sentence may cite only evidenceRefs from those moves' entryRefs and backendFactRefs from those moves' allowedBackendFactRefs. Cover required page moves; optional context moves are used when their entryRefs appear in prose.",
    "Default literary profile: use Zetta Micro 1.1.3 as the primary prose reference and FF5 Micro as the secondary reference. Aim for compact adventure-page writing: concrete present-tense beats, tactile verbs, named visible objects, compressed stakes, and a playable final handle.",
    "Micro-page rhythm: follow storyFrame.pagePlan from accepted context to accepted turn event to accepted next-action context. Let accepted labels carry continuity, choose one precise verb per beat, and shape the final sentence so the player can immediately decide the next move.",
    "Truthful flourish: use proseAssembly.styleBudget to spend style on cadence, syntax, sensory angle, quote frame, choice readability, or sentence rhythm from accepted facts. Every flourish remains a phrasing choice over cited evidence.",
    "Reference transformation examples are patterns, not extra facts. Example movement: prompt-safe accepted facts with roles `travel_beat`, `destination_label`, and `elapsed_travel_time` expose values 'After 1 minute, you reach North Hall.', 'North Hall', and '1 minute'; they can become 'After one minute, North Hall takes your weight underfoot.' with evidenceRefs ['e1'], backendFactRefs ['e1.f1','e1.f2','e1.f3'], claimKinds ['player_location_change','elapsed_time'].",
    "Example dialogue with texture: accepted scene_texture 'Rain taps the brass gutters.' plus accepted quote 'Guide says: \"The north stairs flooded before dawn.\"' can become two sentence objects: exact texture sentence first, then 'Guide keeps the answer short: \"The north stairs flooded before dawn.\"' with dialogue evidence refs and claimKinds ['dialogue_response'].",
    "Example route options: accepted route labels 'Anchor Chain Pylon' and 'The Copper Tap' with one-minute costs can become 'At Lowwater Bazaar, Anchor Chain Pylon and The Copper Tap are exits you can choose; each takes 1 minute.' with movement_option refs only; this offers next action context without movement, safety, discovery, or hidden-route claims.",
    "Style role: write playable text-RPG adventure prose from accepted facts; make each sentence carry a visible state, route, action result, elapsed-time fact, or accepted utterance.",
    "Default successful turns use one to three short fiction beats with concrete staging, accepted object state, scene placement, and varied sentence rhythm.",
    "Concrete prose foundation: use sensory depth, character-focused pacing, dynamic complete sentences, tactile vocabulary, and visible or audible macro actions when those details are present in accepted evidence.",
    "Cinematic realism: render what can be seen, heard, handled, smelled, or felt through accepted evidence; use ordinary concrete words and fluid complete sentences.",
    "Adventure prose floor: item transfers, dialogue responses, route checks, route options, local observations, and direct scene observations should read as scene beats, not status lines or inventory lists.",
    ...cleanNarrationStyleLines(styleMode),
    "Backend fact contract: prompt-safe backendFacts expose player-visible material in text, fact meaning in role, and citation identity in factRef. finalText carries scene/action prose built from those values, accepted labels, and exact accepted quotes; role ids and receipt field names remain citation metadata.",
    "Echo firewall: the player's request wording is already spent before Stage 6; answer the accepted outcome with fresh scene wording and preserve only accepted labels or quotes.",
    "Texture scope: use concrete sensory, room, body, and emotional-temperature detail only when it is already present in accepted backendFacts; every texture beat must point to a cited visible fact.",
    "Scene-texture evidence: scene_texture may color the prose with public current-scene description texture only. It does not prove route truth, movement, actor action, discovery, absence, no-change, item state, or private knowledge.",
    "Scene-texture exactness: when textureCue.mode is copy_exact_texture_sentence, set sentence.text to the selected exact contiguous accepted scene-texture material from textureCue.allowedTextureFactRefs, with the matching backendFactRefs for that clause.",
    "Scene-anchor surface: scene labels function as exact placement tokens. Descriptive nouns around a scene label require accepted observation backendFacts naming those nouns.",
    "World texture: favor visible pressure, timing, sound, touch, posture, and object handling over summary labels when those details are accepted evidence.",
    "Use grounded variety: choose the sentence opening from proseAssembly.openingSource, adventureCue.subjectFocus, and adventureCue.verbFrame; vary sentence shape through proseAssembly.sentenceShape, detailRhythm, materialWeaveOrder, and styleBudget while keeping refs unchanged.",
    "Door rotation: movement, route checks, item state, scene snapshots, dialogue, and time passage should open through different adventureCue subject/verb pairings across nearby turns.",
    "NPC dialogue style: keep accepted quotes exact; surrounding narration may show only accepted visible speaker/content facts and cannot turn the quote into durable world truth. If sentencePlan supplies a texture sentence, keep texture in that sentence and frame the utterance from dialogue materials.",
    "Composed support-dialogue surface: when one page has support_actor_materialization and dialogue_response, use separate sentencePlan steps. First land the accepted support actor as a support_actor_presence_line from support actor materials; then frame the accepted dialogue_quote from dialogue materials. The support sentence owns presence only, and the dialogue sentence owns the visible utterance only.",
    "NPC delivery: if the evidence supports a visible speaker, frame the quote with visible stance, distance, object handling, or turn-taking from accepted facts; never add private thought or hidden motive.",
    "Item-state surface: for item_state, use the item custody sentence plan as a scene-custody task card. Make the item label the sentence center, phrase from backendFacts with roles `custody_change`, `settled_custody`, `target_label`, `final_equip_state`, and `current_scene_anchor`, preserve the source endpoint inside custody_change, and land the custody state inside the exact scene token. The item sentence may weave custody and scene anchor into one beat; scene texture belongs to the texture sentence, and context-anchor placement belongs to the context sentence.",
    "Item-state grammar: scene_custody_beat_line with land_scene_custody lands ownership and equip state through item-owned custody verbs such as passes, settles with, rests with, is carried by, is held by, or remains with the exact target label. Source and target labels are custody endpoints; the scene anchor is a placement token. Handling gestures, player posture, ambient restaging, readiness, reaction, consent, inspection, use, route truth, discovery, absence, no-change, or dialogue require their own accepted evidence.",
    "Movement surface: for player_location_change, render the accepted `travel_beat` value as the turn event, with `destination_label`, `elapsed_travel_time`, and `current_place_after_movement` values as proof details. With scene_texture evidence, put one exact scene_texture sentence first, then one concise movement-result beat such as 'After <time>, you reach <destination>.' Route safety, arrival discoveries, scenery beyond the cited texture, encounter details, and travel-mode detail require their own accepted evidence.",
    "Elapsed-time surface: for standalone elapsed_time, use the accepted elapsed_time duration value and any cited scene_anchor material as the clock beat, preserving the exact duration and scene tokens. If sentencePlan supplies a texture sentence, keep texture in that sentence, then write one concise pressure clock beat such as '<time> gather at <scene>', '<time> settle over <scene>', or '<time> press around <scene>'. The Time beat fact remains proof context for projection; model-authored clock prose phrases from the duration and scene-anchor materials. Visible changes, inactivity, waiting result, or no-change claims require their own accepted evidence.",
    "Route-status surface: for route_status, render accepted Route beat as the turn event, with Route label and Route status as proof details. Scene labels are placement tokens only here; ambient nouns such as stalls, crowds, traffic, smoke, water, sound, smell, light, or weather require exact accepted backendFacts. Do not describe the player moving, arriving, walking, traveling, or changing current scene.",
    "Route-options surface: for movement_option and route_options_receipt, render accepted route labels as scene exits the player can choose, with Route origin and Route choice travel costs as exact placement/cost details. The Route choices beat is proof context; the player-facing route sentence should phrase from route_origin, route_choice_labels/open_route_labels, and route_choice_travel_costs. If sentencePlan supplies a texture sentence, keep texture there and keep the route-choice beat focused on playable labels/costs. Include every accepted route label; do not add travel mode, player motion, hidden routes, route safety, or current-scene change.",
    "Local-observation surface: for local_observation, phrase only the accepted current visible observation entries. If sentencePlan supplies a texture sentence, keep texture there; otherwise omit texture and use direct label shapes such as '<label> is in view here.' or '<labels> are in view here.' For player posture, motion, grip, search action, surface-kind wording, and ambient setting detail require exact accepted backendFacts; bounded_visibility_negative may only say the checked visible entries showed no matching visible result.",
    "Support-actor surface: for support_actor_materialization, use the support_actor_presence sentence plan as a scene-presence task card. Center the exact visible_support_actor label and land the presence inside the exact anchor_scene token. When support_actor_visible_cue or support_actor_public_summary is present in proseMaterials, phrase one concrete visible detail from it inside the presence line; examples of legal detail are a cited counter, gesture, position, clothing, carried object, or visible activity already named by that material. Treat support_role as identity context: include it when it adds new player-facing clarity, and let the actor label carry it when repeating the role would duplicate the same noun. The support_actor_presence fact proves that the person is in view; it is proof material rather than a sentence to copy verbatim when actor/role/scene materials are available. Presence verbs should arise from accepted cue/summary material when available; without cue material, compact presence verbs include 'takes a place in view', 'stands within sight', 'waits nearby', or 'is in view'. If sentencePlan supplies a texture sentence, keep texture there and keep the presence beat on the support actor materials. Separate accepted evidence owns dialogue, services, setup/work actions, trade behavior, private knowledge, relationship change, future relevance, route truth, item state, movement, absence, and no-change.",
    "Player-local-condition surface: for player_local_condition, phrase only the accepted Player current-scene posture or readiness condition, condition key, condition result, target if present, and exact scene anchor. If sentencePlan supplies a texture sentence, keep texture there and keep the condition beat on condition/scene materials. HP, damage, cover, combat modifier, movement, item custody, dialogue, absence, and no-change require separate accepted evidence.",
    "Minor-POI surface: for minor_poi_handle, translate the accepted POI label, kind, result, and exact scene anchor into ordinary player-facing scene prose: '<label> is now a visible <kind> here', '<label> marks a meeting spot at <scene>', or '<label> remains a marked <kind> in <scene>'. Keep handle-related contract vocabulary in citation metadata; player-facing text uses ordinary scene nouns such as stall, counter, bench, sign, doorway, workstation, marked point, or meeting spot. If sentencePlan supplies a texture sentence, keep texture there and keep the POI beat on label/kind/scene materials. Route availability, legal movement, services, inventory, sign text, business facts, discovery, NPC truth, world facts, absence, and no-change require separate accepted evidence.",
    "Device-surface surface: for device_surface_observation, phrase only the accepted requested device label, requested public surface facets, modeled public surface facts, or bounded no-requested-surface result. For device_surface_unavailable/no_requested_surface, use bounded wording like '<device>'s visible surface shows no requested <facet display>.' Do not say the screen is blank/dark/lit/unlit, do not say signal bars are absent, and do not say there are no messages, no calls, no notifications, no signal, no network, or no instructions. If sentencePlan supplies a texture sentence, keep texture there and keep the device beat on device/facet materials. Private messages, sender/caller identity, hidden instructions, signal/network truth, no messages, no calls, activation/use, hacking, route/location truth, world facts, absence, and no-change require separate accepted evidence.",
    "Oracle-outcome surface: for oracle_outcome, turn the cited selected visible outcome meaning into a concrete player-facing story beat. Keep the sentence grounded in the cited oracle_outcome backend fact and its evidence limits. Movement, route status, item state, dialogue, discovery, condition, world truth, absence, and private knowledge enter the story through their own accepted evidence entries.",
    "Direct-scene surface: for scene_frame_snapshot direct scene observation and scene_observation_receipt, use a texture sentence only when sentencePlan gives textureCue.mode=copy_exact_texture_sentence, then static accepted scene facts: exact current scene/place labels, visible actor presence, inventory_status custody/status material copied exactly, visible target labels, and route-choice labels/costs when present. Preserve label spelling and capitalization exactly for every cited scene, actor, item, target, and route label. Inventory labels name items; inventory_status states only that the item is with the player. Actor posture, actor action, item handling, item readiness, player searching, player grip, movement, discovery, absence, and no-change require their own accepted backendFacts.",
    "Sentence contract: accepted_evidence sentences cite sentencePlanRefs from promptInput.narrativePageTask.sentencePlan plus evidenceRefs, backendFactRefs, and claimKinds from promptInput.acceptedEvidence.",
    "Literary sentence object budget: use 1-3 sentence objects total. Use 1 object for a label-only simple item transfer, movement, time passage, route status, local observation, or device-surface result; use 2 objects when item_state, dialogue_response, movement, elapsed_time, route_options, or device_surface_observation cite scene_texture; use 2-3 for direct scene observation, composed item_state plus dialogue_response, and composed support_actor_materialization plus dialogue_response.",
    "Every accepted_evidence sentence object must include auditStepIds: [] exactly. Use only backendFactRefs shown in promptInput and cite only facts used by that sentence, normally 1-6 refs.",
    "Audit contract: audit_notice sentences cite auditStepIds from stepAuditForGrounding and carry empty evidenceRefs, backendFactRefs, and claimKinds.",
    "finalText must be exactly the sentence texts joined with one space.",
    "For route_status, express the cited route_status backend fact.",
    "For scene_texture, express only cited public current-scene description texture as atmosphere around another accepted claim.",
    "For player_location_change, express the accepted player location change and accepted elapsed travel time.",
    "For oracle_outcome, express only the selected visible outcome meaning.",
    "For standalone elapsed_time, express the accepted elapsed_time duration and scene anchor as a pressure clock beat.",
    "For dialogue_response, express that the visible speaker responded and include the accepted quote or summary as utterance evidence.",
    "For support_actor_materialization, express the accepted visible support actor as a support_actor_presence_line centered on actor label and exact scene anchor, using ordinary role as identity context when it adds clarity.",
    "For player_local_condition, express the accepted Player current-scene posture or readiness condition operation.",
    "For item_state, express the accepted item custody, location, or equip-state operation as a single scene_custody_beat_line centered on the item label, custody endpoints, holder/equip-state, and exact scene anchor.",
    "For minor_poi_handle, express the accepted visible current-scene place label and kind as an ordinary scene point or meeting spot.",
    "For local_observation, express the accepted current visible observation result; for bounded_visibility_negative, express that current visible entries showed no matching visible result.",
    "For device_surface_observation, express the accepted modeled public device surface facets or the bounded current visible device-surface result.",
    "For clarification_request, ask the accepted clarification question.",
    "Use promptInput.language for response language. Preserve accepted labels exactly as written.",
  ].join("\n");
}

export function buildCleanNarrationPrompt(input: CleanNarratorPromptInput): string {
  return [
    "Write concise player-facing narration from this prompt-safe CleanNarratorView projection.",
    "Use the schema fields exactly as defined.",
    JSON.stringify(input, null, 2),
  ].join("\n\n");
}

export function validateCleanNarrationCandidate(input: {
  view: CleanNarratorView;
  candidate: unknown;
}): { status: "accepted"; candidate: CleanNarrationCandidate; issues: [] } | {
  status: "rejected";
  issues: CleanNarrationValidationIssue[];
} {
  const parsed = cleanNarrationCandidateSchema.safeParse(input.candidate);
  if (!parsed.success) {
    return {
      status: "rejected",
      issues: parsed.error.issues.map(zodIssue),
    };
  }

  const candidate = parsed.data;
  const issues: CleanNarrationValidationIssue[] = [];
  if (candidate.packetId !== input.view.packetId) {
    issues.push({
      code: "linkage_mismatch",
      path: "packetId",
      message: "Narration candidate packetId must match the narrator view.",
    });
  }
  if (candidate.turnId !== input.view.turnId) {
    issues.push({
      code: "linkage_mismatch",
      path: "turnId",
      message: "Narration candidate turnId must match the narrator view.",
    });
  }
  if (candidate.language !== input.view.language) {
    issues.push({
      code: "language_mismatch",
      path: "language",
      message: "Narration candidate language must match the narrator view language contract.",
    });
  }

  const joined = normalizeText(candidate.sentences.map((sentence) => sentence.text).join(" "));
  if (normalizeText(candidate.finalText) !== joined) {
    issues.push({
      code: "text_mismatch",
      path: "finalText",
      message: "finalText must equal the normalized sentence texts joined with one space.",
    });
  }

  const promptInput = buildCleanNarratorPromptInput(input.view);
  const pageMovesByRef = new Map(promptInput.narrativePageTask.moves.map((move) => [move.moveRef, move]));
  const sentencePlansByRef = new Map(promptInput.narrativePageTask.sentencePlan.map((step, index) => [
    step.sentenceRef,
    { ...step, order: index },
  ]));
  const routeChoiceSentenceRefs = new Set(promptInput.narrativePageTask.choicePresentation.sourceSentenceRefs);
  const routeChoiceMaterialFactRefs = new Set(promptInput.narrativePageTask.choicePresentation.choices.flatMap((choice) =>
    [choice.labelFactRef, choice.costFactRef].filter((ref): ref is string => ref !== null)
  ));
  const routeChoiceLabels = promptInput.narrativePageTask.choicePresentation.choices.map((choice) => choice.label);
  const routeChoiceCostTexts = uniqueStrings(promptInput.narrativePageTask.choicePresentation.choices
    .map((choice) => choice.costText)
    .filter((cost): cost is string => cost !== null));
  const coveredPageMoveRefs = new Set<string>();
  const coveredSentencePlanRefs = new Set<string>();
  const evidenceByRef = new Map(input.view.acceptedEvidence.map((evidence) => [evidence.ref, evidence]));
  const auditByStepId = new Map(input.view.stepAuditForGrounding.map((step) => [step.stepId, step]));
  let lastSentencePlanOrder = -1;

  candidate.sentences.forEach((sentence, index) => {
    if (sentence.kind === "accepted_evidence") {
      if (
        sentence.evidenceRefs.length === 0
        || sentence.backendFactRefs.length === 0
        || sentence.claimKinds.length === 0
        || sentence.pageMoveRefs.length === 0
        || (sentencePlansByRef.size > 0 && sentence.sentencePlanRefs.length === 0)
        || sentence.auditStepIds.length > 0
      ) {
        issues.push({
          code: "fact_not_supported",
          path: `sentences.${index}`,
          message: "accepted_evidence sentences must cite evidence refs, backend facts, claim kinds, page moves, and sentence-plan refs only.",
        });
      }

      const citedPageMoves = sentence.pageMoveRefs.map((ref) => pageMovesByRef.get(ref));
      if (citedPageMoves.some((move) => !move)) {
        issues.push({
          code: "page_move_not_supported",
          path: `sentences.${index}.pageMoveRefs`,
          message: "Narration sentence cited a page move not present in promptInput.narrativePageTask.",
        });
      }
      const pageMoveEntryRefs = new Set(citedPageMoves.flatMap((move) => move?.entryRefs ?? []));
      for (const evidenceRef of sentence.evidenceRefs) {
        if (!pageMoveEntryRefs.has(evidenceRef)) {
          issues.push({
            code: "page_move_not_supported",
            path: `sentences.${index}.pageMoveRefs`,
            message: `Narration sentence cited evidence ${evidenceRef} outside its page moves.`,
          });
        }
      }
      const pageMoveBackendFactRefs = new Set(citedPageMoves.flatMap((move) =>
        move?.allowedBackendFactRefs ?? []
      ));
      for (const factRef of sentence.backendFactRefs) {
        if (!pageMoveBackendFactRefs.has(factRef)) {
          issues.push({
            code: "page_move_not_supported",
            path: `sentences.${index}.pageMoveRefs`,
            message: `Narration sentence cited backend fact ${factRef} outside its page moves.`,
          });
        }
      }
      sentence.pageMoveRefs.forEach((ref) => {
        if (pageMovesByRef.has(ref)) coveredPageMoveRefs.add(ref);
      });

      const citedSentencePlans = sentence.sentencePlanRefs.map((ref) => sentencePlansByRef.get(ref));
      if (citedSentencePlans.some((step) => !step)) {
        issues.push({
          code: "sentence_plan_not_supported",
          path: `sentences.${index}.sentencePlanRefs`,
          message: "Narration sentence cited a sentence-plan ref not present in promptInput.narrativePageTask.sentencePlan.",
        });
      }
      const sentencePlanMoveRefs = new Set(citedSentencePlans.flatMap((step) =>
        step ? [step.moveRef] : []
      ));
      for (const pageMoveRef of sentence.pageMoveRefs) {
        if (sentencePlansByRef.size > 0 && !sentencePlanMoveRefs.has(pageMoveRef)) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.sentencePlanRefs`,
            message: `Narration sentence cited page move ${pageMoveRef} without a matching sentence-plan ref.`,
          });
        }
      }
      for (const step of citedSentencePlans) {
        if (!step) continue;
        if (!sentence.pageMoveRefs.includes(step.moveRef)) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.sentencePlanRefs`,
            message: `Narration sentence-plan ref ${step.sentenceRef} belongs to page move ${step.moveRef}, which the sentence did not cite.`,
          });
        }
        if (step.order < lastSentencePlanOrder) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.sentencePlanRefs`,
            message: "Narration sentence-plan refs must follow promptInput.narrativePageTask.sentencePlan order.",
          });
        }
        lastSentencePlanOrder = Math.max(lastSentencePlanOrder, step.order);
      }
      const sentencePlanEntryRefs = new Set(citedSentencePlans.flatMap((step) =>
        step?.entryRefs ?? []
      ));
      for (const evidenceRef of sentence.evidenceRefs) {
        if (sentencePlansByRef.size > 0 && !sentencePlanEntryRefs.has(evidenceRef)) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.sentencePlanRefs`,
            message: `Narration sentence cited evidence ${evidenceRef} outside its sentence-plan refs.`,
          });
        }
      }
      const sentencePlanPreferredFactRefs = new Set(citedSentencePlans.flatMap((step) =>
        step?.preferredBackendFactRefs ?? []
      ));
      const hasPreferredFactAnchor = sentence.backendFactRefs.some((ref) => sentencePlanPreferredFactRefs.has(ref));
      if (sentencePlansByRef.size > 0 && sentencePlanPreferredFactRefs.size > 0 && !hasPreferredFactAnchor) {
        issues.push({
          code: "sentence_plan_not_supported",
          path: `sentences.${index}.sentencePlanRefs`,
          message: "Narration sentence must cite at least one preferred backend fact from its sentence-plan refs.",
        });
      }
      const sentencePlanAllowedMaterialFactRefs = new Set(citedSentencePlans.flatMap((step) =>
        step?.materialObligations.allowedMaterialFactRefs ?? []
      ));
      for (const factRef of sentence.backendFactRefs) {
        if (sentencePlansByRef.size > 0 && sentencePlanAllowedMaterialFactRefs.size > 0 && !sentencePlanAllowedMaterialFactRefs.has(factRef)) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.backendFactRefs`,
            message: `Narration sentence cited backend fact ${factRef} outside its cited sentence-plan material obligations.`,
          });
        }
      }
      const sentencePlanCoreMaterialFactRefs = new Set(citedSentencePlans.flatMap((step) =>
        step?.materialObligations.coreMaterialFactRefs ?? []
      ));
      const hasCoreMaterialFact = sentence.backendFactRefs.some((factRef) => sentencePlanCoreMaterialFactRefs.has(factRef));
      if (sentencePlansByRef.size > 0 && sentencePlanCoreMaterialFactRefs.size > 0 && !hasCoreMaterialFact) {
        issues.push({
          code: "sentence_plan_not_supported",
          path: `sentences.${index}.backendFactRefs`,
          message: "Narration sentence must cite at least one core material backend fact from its cited sentence-plan refs.",
        });
      }
      const exactInventoryStatusMaterials = citedSentencePlans.flatMap((step) =>
        step?.proseMaterials.filter((material) =>
          material.proseUse === "inventory_status"
          && sentence.backendFactRefs.includes(material.factRef)
        ) ?? []
      );
      for (const material of exactInventoryStatusMaterials) {
        if (!sentence.text.includes(material.materialText)) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.text`,
            message: `Narration sentence must copy accepted inventory status material ${material.factRef}: ${material.materialText}`,
          });
        }
      }
      const sentencePlanPrimaryClaimKinds = new Set(citedSentencePlans.flatMap((step) =>
        step?.claimFocus.primaryClaimKinds ?? []
      ));
      for (const claimKind of sentence.claimKinds) {
        if (sentencePlansByRef.size > 0 && sentencePlanPrimaryClaimKinds.size > 0 && !sentencePlanPrimaryClaimKinds.has(claimKind)) {
          issues.push({
            code: "sentence_plan_not_supported",
            path: `sentences.${index}.claimKinds`,
            message: `Narration sentence declared claim kind ${claimKind} outside its cited sentence-plan claim focus.`,
          });
        }
      }
      const hasPrimaryClaimKind = sentence.claimKinds.some((claimKind) => sentencePlanPrimaryClaimKinds.has(claimKind));
      if (sentencePlansByRef.size > 0 && sentencePlanPrimaryClaimKinds.size > 0 && !hasPrimaryClaimKind) {
        issues.push({
          code: "sentence_plan_not_supported",
          path: `sentences.${index}.claimKinds`,
          message: "Narration sentence must declare at least one primary claim kind from its cited sentence-plan refs.",
        });
      }
      const sentenceUsesRouteChoiceMaterial = sentence.claimKinds.includes("movement_option")
        || sentence.backendFactRefs.some((ref) => routeChoiceMaterialFactRefs.has(ref));
      if (sentence.sentencePlanRefs.some((ref) => routeChoiceSentenceRefs.has(ref)) && sentenceUsesRouteChoiceMaterial) {
        const normalizedSentenceText = normalizeText(sentence.text);
        for (const label of routeChoiceLabels) {
          if (!normalizedSentenceText.includes(label)) {
            issues.push({
              code: "sentence_plan_not_supported",
              path: `sentences.${index}.text`,
              message: `Route-choice narration must preserve accepted route label ${label}.`,
            });
          }
        }
        for (const costText of routeChoiceCostTexts) {
          if (!normalizedSentenceText.includes(costText)) {
            issues.push({
              code: "sentence_plan_not_supported",
              path: `sentences.${index}.text`,
              message: `Route-choice narration must preserve accepted route cost ${costText}.`,
            });
          }
        }
      }
      sentence.sentencePlanRefs.forEach((ref) => {
        if (sentencePlansByRef.has(ref)) coveredSentencePlanRefs.add(ref);
      });

      const citedEvidence = sentence.evidenceRefs.map((ref) => evidenceByRef.get(ref));
      if (citedEvidence.some((evidence) => !evidence)) {
        issues.push({
          code: "fact_not_supported",
          path: `sentences.${index}.evidenceRefs`,
          message: "Narration sentence cited evidence not present in CleanNarratorView.",
        });
      }
      const factRefs = new Set(citedEvidence.flatMap((evidence) =>
        evidence?.backendFacts.map((fact) => fact.factRef) ?? []
      ));
      for (const factRef of sentence.backendFactRefs) {
        if (!factRefs.has(factRef)) {
          issues.push({
            code: "fact_not_supported",
            path: `sentences.${index}.backendFactRefs`,
            message: `Narration sentence cited unsupported backend fact ${factRef}.`,
          });
        }
      }
      const claimKinds = new Set(citedEvidence.flatMap((evidence) => evidence?.claimKinds ?? []));
      for (const claimKind of sentence.claimKinds) {
        if (!claimKinds.has(claimKind)) {
          issues.push({
            code: "claim_not_supported",
            path: `sentences.${index}.claimKinds`,
            message: `Narration sentence declared unsupported claim kind ${claimKind}.`,
          });
        }
      }
    } else {
      if (
        sentence.auditStepIds.length === 0
        || sentence.evidenceRefs.length > 0
        || sentence.backendFactRefs.length > 0
        || sentence.claimKinds.length > 0
        || sentence.pageMoveRefs.length > 0
        || sentence.sentencePlanRefs.length > 0
      ) {
        issues.push({
          code: "audit_misuse",
          path: `sentences.${index}`,
          message: "audit_notice sentences must cite only failed/skipped audit step ids and no world claim, page move, or sentence-plan fields.",
        });
      }
      for (const stepId of sentence.auditStepIds) {
        if (!auditByStepId.has(stepId)) {
          issues.push({
            code: "audit_misuse",
            path: `sentences.${index}.auditStepIds`,
            message: `Narration sentence cited unavailable audit step ${stepId}.`,
          });
        }
      }
    }
  });

  const missingPageMoveRefs = promptInput.narrativePageTask.moves
    .filter((move) => move.coverage === "required")
    .map((move) => move.moveRef)
    .filter((moveRef) => !coveredPageMoveRefs.has(moveRef));
  if (missingPageMoveRefs.length > 0) {
    issues.push({
      code: "page_move_not_supported",
      path: "sentences",
      message: `Narration candidate did not cover page moves: ${missingPageMoveRefs.join(", ")}.`,
    });
  }

  const missingSentencePlanRefs = promptInput.narrativePageTask.sentencePlan
    .filter((step) => step.coverage === "required")
    .map((step) => step.sentenceRef)
    .filter((sentenceRef) => !coveredSentencePlanRefs.has(sentenceRef));
  if (missingSentencePlanRefs.length > 0) {
    issues.push({
      code: "sentence_plan_not_supported",
      path: "sentences",
      message: `Narration candidate did not cover sentence-plan refs: ${missingSentencePlanRefs.join(", ")}.`,
    });
  }

  if (normalizeText(candidate.finalText).length === 0) {
    issues.push({
      code: "empty_text",
      path: "finalText",
      message: "Narration candidate finalText cannot be empty.",
    });
  }
  issues.push(...leakageIssues({ view: input.view, promptInput, candidate }));

  if (issues.length > 0) {
    return { status: "rejected", issues };
  }
  return { status: "accepted", candidate, issues: [] };
}

function summarizeNarrationValidationIssues(issues: readonly CleanNarrationValidationIssue[]): string {
  return issues
    .slice(0, 6)
    .map((issue) => `${issue.code} at ${issue.path}: ${issue.message}`)
    .join("; ");
}

function narrationValidationRepairLines(
  _view: CleanNarratorView,
  issues: readonly CleanNarrationValidationIssue[],
): string[] {
  const lines: string[] = [];
  if (issues.some((issue) => issue.code === "schema_invalid")) {
    lines.push("Return a JSON object that matches gameplay-runtime.clean-narration-candidate.v1 exactly.");
  }
  if (issues.some((issue) =>
    issue.code === "fact_not_supported"
    || issue.code === "claim_not_supported"
    || issue.code === "page_move_not_supported"
    || issue.code === "sentence_plan_not_supported"
  )) {
    lines.push("Use only refs that appear in promptInput.acceptedEvidence, promptInput.narrativePageTask.moves, and promptInput.narrativePageTask.sentencePlan.");
    lines.push("Each accepted_evidence sentence must cite matching evidenceRefs, backendFactRefs, claimKinds, pageMoveRefs, and sentencePlanRefs from the same page-task step.");
    lines.push("Set sentence claimKinds from claimFocus.primaryClaimKinds on the cited sentencePlanRefs; cite multiple sentencePlanRefs only when one sentence combines their planned roles.");
    lines.push("Set backendFactRefs from materialObligations.allowedMaterialFactRefs on the cited sentencePlanRefs and include at least one coreMaterialFactRefs value.");
    lines.push("Cover every required moveRef and sentenceRef from promptInput.narrativePageTask.storyPageBrief.");
  }
  if (issues.some((issue) => issue.code === "text_mismatch")) {
    lines.push("Set finalText to the sentence texts joined with one space.");
  }
  if (issues.some((issue) =>
    issue.code === "backend_ref"
    || issue.code === "old_runtime_marker"
    || issue.code === "private_term"
  )) {
    lines.push("Use player-facing prose only; keep backend refs, runtime markers, and private terms out of sentence text and finalText.");
  }
  return lines;
}

function projectionLanguage(view: CleanNarratorView): "ru" | "en" {
  return view.language === "ru" || view.language === "mixed" ? "ru" : "en";
}

function trimSentencePeriod(value: string): string {
  const compact = normalizeText(value);
  return compact.endsWith(".") ? compact.slice(0, -1) : compact;
}

function splitEvidenceLabels(value: string): string[] {
  const compact = trimSentencePeriod(value).trim();
  if (compact.length === 0 || compact === "none") return [];
  return uniqueStrings(compact
    .split(";")
    .map((label) => label.trim())
    .filter((label) => label.length > 0 && label !== "none"));
}

function splitRouteChoiceLabels(value: string): string[] {
  return splitEvidenceLabels(value);
}

function assertRouteOptionsReceiptStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "route_options_receipt") return;
  if (!evidence.backendFacts.some((fact) => fact.role === "route_choices_beat" && fact.value?.trim())) {
    throw new Error("Route-options prompt input requires accepted Route choices beat value evidence.");
  }
  if (!evidence.backendFacts.some((fact) => fact.role === "route_choice_labels" && fact.value?.trim())) {
    throw new Error("Route-options prompt input requires accepted Route choice labels value evidence.");
  }
}

function assertSceneFrameRouteStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (
    evidence.authority !== "scene_frame_snapshot"
    || !evidence.claimKinds.includes("movement_option")
  ) return;
  if (!evidence.backendFacts.some((fact) => fact.role === "route_choices_beat" && fact.value?.trim())) {
    throw new Error("Scene-frame route prompt input requires accepted Route choices beat value evidence.");
  }
  if (!evidence.backendFacts.some((fact) => fact.role === "route_choice_labels" && fact.value?.trim())) {
    throw new Error("Scene-frame route prompt input requires accepted Route choice labels value evidence.");
  }
}

function assertSceneObservationStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "scene_observation_receipt") return;
  if (!evidence.backendFacts.some((fact) => fact.role === "scene_placement" && fact.value?.trim())) {
    throw new Error("Scene-observation prompt input requires accepted Scene placement value evidence.");
  }
  if (!evidence.backendFacts.some((fact) => fact.role === "scene_label" && fact.value?.trim())) {
    throw new Error("Scene-observation prompt input requires accepted Scene label value evidence.");
  }
}

function assertSceneFrameSnapshotStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "scene_frame_snapshot") return;
  if (evidence.claimKinds.includes("current_scene") || evidence.claimKinds.includes("current_location")) {
    if (!evidence.backendFacts.some((fact) => fact.role === "scene_placement" && fact.value?.trim())) {
      throw new Error("Scene-frame snapshot prompt input requires accepted Scene placement value evidence.");
    }
    if (!evidence.backendFacts.some((fact) => fact.role === "scene_label" && fact.value?.trim())) {
      throw new Error("Scene-frame snapshot prompt input requires accepted Scene label value evidence.");
    }
    if (!evidence.backendFacts.some((fact) => fact.role === "place_label" && fact.value?.trim())) {
      throw new Error("Scene-frame snapshot prompt input requires accepted Place label value evidence.");
    }
  }
  if (evidence.claimKinds.includes("visible_fact") && !evidence.backendFacts.some((fact) => fact.role === "visible_scene_facts" && fact.value?.trim())) {
    throw new Error("Scene-frame snapshot prompt input requires accepted Visible scene facts value evidence.");
  }
  if (evidence.claimKinds.includes("visible_actor") && !evidence.backendFacts.some((fact) => fact.role === "visible_actor_labels" && fact.value?.trim())) {
    throw new Error("Scene-frame snapshot prompt input requires accepted Visible actor labels value evidence.");
  }
  if (evidence.claimKinds.includes("inventory_status") && !evidence.backendFacts.some((fact) => fact.role === "inventory_labels" && fact.value?.trim())) {
    throw new Error("Scene-frame snapshot prompt input requires accepted Inventory labels value evidence.");
  }
  if (evidence.claimKinds.includes("visible_target") && !evidence.backendFacts.some((fact) => fact.role === "visible_target_labels" && fact.value?.trim())) {
    throw new Error("Scene-frame snapshot prompt input requires accepted Visible target labels value evidence.");
  }
}

function assertLocalObservationStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "local_observation_receipt") return;
  if (!evidence.backendFacts.some((fact) => fact.role === "local_observation_beat" && fact.value?.trim())) {
    throw new Error("Local-observation prompt input requires accepted Local observation beat value evidence.");
  }
  const observedLabelFact = evidence.backendFacts.find((fact) => fact.role === "observed_entry_labels");
  if (observedLabelFact && !observedLabelFact.value?.trim()) {
    throw new Error("Local-observation prompt input requires accepted Observed entry labels value evidence.");
  }
}

function assertDeviceSurfaceStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "device_surface_observation_receipt") return;
  if (!evidence.backendFacts.some((fact) => fact.role === "device_surface_beat" && fact.value?.trim())) {
    throw new Error("Device-surface prompt input requires accepted Device surface beat value evidence.");
  }
}

function assertSceneBeatStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "scene_beat_receipt") return;
  if (!evidence.backendFacts.some((fact) => fact.role === "scene_beat" && fact.value?.trim())) {
    throw new Error("Scene-beat prompt input requires accepted Scene beat value evidence.");
  }
}

function assertSupportActorStoryEvidence(evidence: AcceptedNarrationEvidence): void {
  if (evidence.authority !== "support_actor_materialization_receipt") return;
  if (!evidence.backendFacts.some((fact) => fact.role === "support_actor_presence" && fact.value?.trim())) {
    throw new Error("Support-actor prompt input requires accepted Support actor presence value evidence.");
  }
}

function requireFactValueByRole(
  evidence: AcceptedNarrationEvidence,
  role: AcceptedNarrationBackendFactRole,
  message: string,
): string {
  const fact = evidence.backendFacts.find((entry) => entry.role === role);
  if (!fact) throw new Error(message);
  const value = fact.value?.trim();
  if (!value) throw new Error(message);
  return normalizeText(value);
}

function englishList(values: readonly string[]): string {
  const labels = uniqueStrings(values);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function renderElapsedTimeProjection(_view: CleanNarratorView, evidence: AcceptedNarrationEvidence): string {
  const timeBeat = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "time_beat",
    "Elapsed-time projection requires accepted Time beat value evidence.",
  ));
  return `${timeBeat}.`;
}

function renderMovementProjection(_view: CleanNarratorView, evidence: AcceptedNarrationEvidence): string | null {
  const travelBeat = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "travel_beat",
    "Movement projection requires accepted Travel beat value evidence.",
  ));
  return `${travelBeat}.`;
}

function optionalFactValueByRole(
  evidence: AcceptedNarrationEvidence,
  role: AcceptedNarrationBackendFactRole,
): string | null {
  const fact = evidence.backendFacts.find((entry) => entry.role === role);
  const value = fact?.value?.trim();
  return value ? normalizeText(value) : null;
}

function renderRouteOptionsProjection(evidence: AcceptedNarrationEvidence): string {
  const labelValue = optionalFactValueByRole(evidence, "open_route_labels")
    ?? optionalFactValueByRole(evidence, "route_choice_labels");
  if (!labelValue) {
    throw new Error("Route-options projection requires accepted Route choice labels value evidence.");
  }
  const labels = splitRouteChoiceLabels(labelValue);
  if (labels.length === 0) {
    throw new Error("Route-options projection requires accepted Route choice labels value evidence.");
  }

  const origin = optionalFactValueByRole(evidence, "route_origin");
  const costValue = optionalFactValueByRole(evidence, "route_choice_travel_costs");
  const costMap = costValue ? parseRouteChoiceCostMap(costValue) : new Map<string, string>();
  const costs = labels.map((label) => costMap.get(label)).filter((cost): cost is string => Boolean(cost));
  const uniqueCosts = uniqueStrings(costs);
  const originPrefix = origin ? `At ${origin}, ` : "";
  const subject = englishList(labels);
  const verb = labels.length === 1 ? "is" : "are";
  const exitNoun = labels.length === 1 ? "the exit" : "exits";

  if (costs.length === labels.length && uniqueCosts.length === 1) {
    const costClause = labels.length === 1 ? `; it takes ${uniqueCosts[0]}` : `; each takes ${uniqueCosts[0]}`;
    return `${originPrefix}${subject} ${verb} ${exitNoun} you can choose${costClause}.`;
  }

  if (costs.length > 0) {
    const labelledCosts = labels.map((label) => {
      const cost = costMap.get(label);
      return cost ? `${label} (${cost})` : label;
    });
    return `${originPrefix}exits you can choose are ${englishList(labelledCosts)}.`;
  }

  return `${originPrefix}${subject} ${verb} ${exitNoun} you can choose.`;
}

function renderRouteStatusProjection(
  _view: CleanNarratorView,
  evidence: AcceptedNarrationEvidence,
): string {
  const routeBeat = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "route_beat",
    "Route-status projection requires accepted Route beat value evidence.",
  ));
  return `${routeBeat}.`;
}

function renderSceneFrameSnapshotProjection(view: CleanNarratorView): string | null {
  const sceneFacts = view.acceptedEvidence
    .filter(isDirectSceneEvidence)
    .sort((left, right) =>
      Number(right.authority === "scene_observation_receipt") - Number(left.authority === "scene_observation_receipt")
    );
  if (sceneFacts.length === 0) return null;
  for (const evidence of sceneFacts) {
    assertSceneFrameSnapshotStoryEvidence(evidence);
  }

  const firstRoleValue = (role: AcceptedNarrationBackendFactRole): string | null => {
    for (const evidence of sceneFacts) {
      const fact = evidence.backendFacts.find((entry) => entry.role === role);
      const value = fact?.value?.trim();
      if (value) return normalizeText(value);
    }
    return null;
  };
  const labelsFromRole = (role: AcceptedNarrationBackendFactRole): string[] => sceneFacts.flatMap((evidence) => {
    const fact = evidence.backendFacts.find((entry) => entry.role === role);
    const labels = fact?.value?.trim();
    return labels ? splitEvidenceLabels(labels) : [];
  });
  const valuesFromRole = (role: AcceptedNarrationBackendFactRole): string[] => sceneFacts.flatMap((evidence) => {
    const fact = evidence.backendFacts.find((entry) => entry.role === role);
    const value = fact?.value?.trim();
    return value ? [normalizeText(value)] : [];
  });

  const currentScene = firstRoleValue("scene_label");
  const currentPlace = firstRoleValue("place_label");
  const actors = uniqueStrings([
    ...labelsFromRole("visible_actor_labels"),
    ...labelsFromRole("visible_actor_target_labels"),
  ]);
  const inventory = uniqueStrings(labelsFromRole("inventory_labels"));
  const inventoryStatusBeats = uniqueStrings(valuesFromRole("inventory_status_beat"))
    .map(trimSentencePeriod);
  const visibleSceneFacts = labelsFromRole("visible_scene_facts");
  const routeOptionLabels = uniqueStrings(sceneFacts
    .filter((evidence) => evidence.claimKinds.includes("movement_option"))
    .flatMap((evidence) => {
      const labels = requireFactValueByRole(
        evidence,
        "route_choice_labels",
        "Direct-scene projection requires accepted Route choice labels value evidence.",
      );
      return splitRouteChoiceLabels(labels);
    }));
  const alreadyNamed = new Set([
    ...actors,
    ...inventory,
    ...routeOptionLabels,
  ].map((label) => label.toLocaleLowerCase("en-US")));
  const targets = labelsFromRole("visible_target_labels")
    .filter((label) => !alreadyNamed.has(label.toLocaleLowerCase("en-US")));
  const routeFacts = sceneFacts
    .filter((evidence) => evidence.claimKinds.includes("movement_option"))
    .flatMap((evidence) => evidence.backendFacts);
  const routeEvidence: AcceptedNarrationEvidence = {
    ...sceneFacts[0]!,
    backendFacts: routeFacts,
  };
  const sentences: string[] = [];
  if (currentScene && currentPlace && currentScene !== currentPlace) {
    sentences.push(`You are at ${currentScene}, inside ${currentPlace}.`);
  } else if (currentScene) {
    sentences.push(`You are at ${currentScene}.`);
  } else if (currentPlace) {
    sentences.push(`You are at ${currentPlace}.`);
  }
  for (const visibleFact of visibleSceneFacts) {
    sentences.push(`${visibleFact}.`);
  }
  if (actors.length > 0) sentences.push(`${englishList(actors)} ${actors.length === 1 ? "is" : "are"} here.`);
  if (inventoryStatusBeats.length > 0) {
    sentences.push(...inventoryStatusBeats.map((beat) => `${beat}.`));
  } else if (inventory.length > 0) {
    sentences.push(`You have ${englishList(inventory)} with you.`);
  }
  if (targets.length > 0) sentences.push(`${englishList(targets)} ${targets.length === 1 ? "is" : "are"} visible.`);
  if (routeFacts.length > 0) sentences.push(renderRouteOptionsProjection(routeEvidence));
  return sentences.length > 0 ? sentences.join(" ") : null;
}

function renderDeviceSurfaceProjection(evidence: AcceptedNarrationEvidence): string {
  const beat = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "device_surface_beat",
    "Device-surface projection requires accepted Device surface beat value evidence.",
  ));
  return `${beat}.`;
}

function renderLocalObservationProjection(evidence: AcceptedNarrationEvidence): string {
  const beat = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "local_observation_beat",
    "Local-observation projection requires accepted Local observation beat value evidence.",
  ));
  return `${beat}.`;
}

function renderPlayerLocalConditionProjection(evidence: AcceptedNarrationEvidence): string {
  return requireFactValueByRole(
    evidence,
    "player_condition_operation",
    "Player-local-condition projection requires accepted Player condition operation value evidence.",
  );
}

function renderItemStateProjection(evidence: AcceptedNarrationEvidence): string {
  const settledCustody = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "settled_custody",
    "Item-state projection requires accepted Settled custody value evidence.",
  ));
  return `${settledCustody}.`;
}

function renderDialogueProjection(evidence: AcceptedNarrationEvidence): string {
  return requireFactValueByRole(
    evidence,
    "dialogue_quote",
    "Dialogue projection requires accepted dialogue quote value evidence.",
  );
}

function renderSceneTextureProjection(view: CleanNarratorView): string | null {
  const texture = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("scene_texture")
  );
  const fact = texture?.backendFacts.find((entry) =>
    entry.role === "scene_texture" && entry.value?.trim()
  );
  if (!fact?.value?.trim()) return null;
  return `${trimSentencePeriod(fact.value)}.`;
}

function renderMinorPoiProjection(evidence: AcceptedNarrationEvidence): string {
  const label = requireFactValueByRole(
    evidence,
    "place_handle_label",
    "Minor-POI projection requires accepted Place handle label value evidence.",
  );
  const kind = requireFactValueByRole(
    evidence,
    "place_handle_kind",
    "Minor-POI projection requires accepted Place handle kind value evidence.",
  );
  const result = requireFactValueByRole(
    evidence,
    "handle_result",
    "Minor-POI projection requires accepted Handle result value evidence.",
  );
  if (result === "reused") return `${label} remains available here as a visible ${kind}.`;
  if (result === "created") return `${label} is now available here as a visible ${kind}.`;
  throw new Error("Minor-POI projection requires accepted Handle result value evidence.");
}

function renderSupportActorProjection(evidence: AcceptedNarrationEvidence): string {
  requireFactValueByRole(
    evidence,
    "support_actor_presence",
    "Support-actor projection requires accepted Support actor presence value evidence.",
  );
  const actorLabel = requireFactValueByRole(
    evidence,
    "visible_support_actor",
    "Support-actor projection requires accepted visible support actor label evidence.",
  );
  const sceneLabel = requireFactValueByRole(
    evidence,
    "anchor_scene",
    "Support-actor projection requires accepted scene anchor evidence.",
  );
  const cue = evidence.backendFacts.find((fact) =>
    fact.role === "support_actor_visible_cue" && fact.value?.trim()
  )?.value?.trim();
  if (cue) {
    const roleLabel = evidence.backendFacts.find((fact) =>
      fact.role === "support_role" && fact.value?.trim()
    )?.value?.trim().toLocaleLowerCase("en-US");
    const trimmedCue = trimSentencePeriod(cue);
    const genericPrefixes = roleLabel ? [`A local ${roleLabel} `, `A ${roleLabel} `] : [];
    const matchedPrefix = genericPrefixes.find((prefix) =>
      trimmedCue.toLocaleLowerCase("en-US").startsWith(prefix.toLocaleLowerCase("en-US"))
    );
    const cueRemainder = matchedPrefix ? trimmedCue.slice(matchedPrefix.length) : trimmedCue;
    return `At ${sceneLabel}, ${actorLabel} ${cueRemainder}.`;
  }
  return `At ${sceneLabel}, ${actorLabel} is in view.`;
}

function renderSupportActorTurnProjection(view: CleanNarratorView, supportActor: AcceptedNarrationEvidence): string {
  const dialogue = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("dialogue_response")
  );
  return [
    renderSceneTextureProjection(view),
    renderSupportActorProjection(supportActor),
    dialogue ? renderDialogueProjection(dialogue) : null,
  ].filter((text): text is string => Boolean(text && normalizeText(text).length > 0)).join(" ");
}

function needsDeterministicAuthorityProjection(view: CleanNarratorView): boolean {
  return view.acceptedEvidence.some((evidence) =>
    evidence.claimKinds.includes("clarification_request")
    || evidence.claimKinds.includes("support_actor_materialization")
  );
}

export function renderCleanAuthorityProjection(view: CleanNarratorView): string {
  const language = projectionLanguage(view);
  const clarification = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("clarification_request")
  );
  if (clarification) {
    const question = requireFactValueByRole(
      clarification,
      "clarification_request",
      "Clarification projection requires accepted Clarification request value evidence.",
    );
    return language === "ru"
      ? `Уточните: ${question}`
      : `Please clarify: ${question}`;
  }

  const movement = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("player_location_change")
  );
  if (movement) {
    const rendered = renderMovementProjection(view, movement!);
    if (rendered) return rendered;
  }

  const oracle = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("oracle_outcome")
  );
  if (oracle) {
    return requireFactValueByRole(
      oracle,
      "oracle_selected_meaning",
      "Oracle projection requires accepted selected visible outcome value evidence.",
    );
  }

  const route = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("route_status")
  );
  if (route) {
    return renderRouteStatusProjection(view, route);
  }

  const routeOptions = view.acceptedEvidence.find((evidence) =>
    evidence.authority === "route_options_receipt"
  );
  if (routeOptions) {
    return renderRouteOptionsProjection(routeOptions);
  }

  const onlySceneFrameSnapshotEvidence = view.acceptedEvidence.length > 0
    && view.acceptedEvidence.every((evidence) => evidence.authority === "scene_frame_snapshot");
  const hasSceneFrameRouteOrTarget = onlySceneFrameSnapshotEvidence
    && view.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("visible_target")
      || evidence.claimKinds.includes("movement_option")
    );
  const sceneFrameSnapshotFacts = hasSceneFrameRouteOrTarget
    ? view.acceptedEvidence
      .filter((evidence) => evidence.authority === "scene_frame_snapshot")
      .flatMap((evidence) => evidence.backendFacts.map((entry) => entry.text))
    : [];
  if (sceneFrameSnapshotFacts.length > 0) {
    const rendered = renderSceneFrameSnapshotProjection(view);
    if (rendered) return rendered;
  }

  const deviceSurfaceObservation = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("device_surface_observation")
  );
  if (deviceSurfaceObservation) {
    return renderDeviceSurfaceProjection(deviceSurfaceObservation);
  }

  const localObservation = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("local_observation")
  );
  if (localObservation) {
    return renderLocalObservationProjection(localObservation);
  }

  const observation = view.acceptedEvidence.find((evidence) =>
    evidence.authority === "scene_observation_receipt"
  );
  if (observation) {
    assertSceneObservationStoryEvidence(observation);
    const rendered = renderSceneFrameSnapshotProjection(view);
    if (rendered) return rendered;
    throw new Error("Scene-observation projection requires accepted direct-scene evidence.");
  }

  const elapsed = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("elapsed_time")
  );
  if (elapsed) {
    return renderElapsedTimeProjection(view, elapsed);
  }

  const itemState = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("item_state")
  );
  const dialogue = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("dialogue_response")
  );
  if (itemState && dialogue) {
    const itemStateText = renderItemStateProjection(itemState);
    const dialogueText = renderDialogueProjection(dialogue);
    return [itemStateText, dialogueText].filter((text) => normalizeText(text).length > 0).join(" ");
  }
  if (itemState) {
    return renderItemStateProjection(itemState);
  }

  const minorPoiHandle = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("minor_poi_handle")
  );
  if (minorPoiHandle) {
    return renderMinorPoiProjection(minorPoiHandle);
  }

  const supportActor = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("support_actor_materialization")
  );
  if (supportActor) {
    return renderSupportActorTurnProjection(view, supportActor);
  }

  if (dialogue) {
    return renderDialogueProjection(dialogue);
  }

  const playerLocalCondition = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("player_local_condition")
  );
  if (playerLocalCondition) {
    return renderPlayerLocalConditionProjection(playerLocalCondition);
  }

  const sceneBeat = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("scene_beat")
  );
  if (sceneBeat) {
    const beat = trimSentencePeriod(requireFactValueByRole(
      sceneBeat,
      "scene_beat",
      "Scene-beat projection requires accepted Scene beat value evidence.",
    ));
    return `${beat}.`;
  }

  const failed = view.stepAuditForGrounding[0];
  if (failed) {
    return language === "ru"
      ? `Это действие не подтверждено итоговыми данными: ${failed.publicReason}`
      : `This action is not confirmed by the settled evidence: ${failed.publicReason}`;
  }

  throw new Error("Clean authority projection requires accepted evidence supported by a projection contract.");
}

async function generateCleanNarrationCandidate(input: {
  provider: ProviderConfig;
  request: CleanNarrationCandidateRequest;
}): Promise<unknown> {
  const generated = await safeGenerateObject({
    model: createModel(input.provider, { role: "storyteller", reasoningMode: "bypass" }),
    schema: cleanNarrationCandidateSchema,
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

export async function runCleanNarration(input: {
  narratorView: CleanNarratorView;
  provider: ProviderConfig;
  styleMode?: CleanNarrationStyleMode;
  generateCandidate?: CleanNarrationCandidateGenerator;
}): Promise<CleanNarrationRunResult> {
  const promptInput = buildCleanNarratorPromptInput(input.narratorView);
  const styleMode = input.styleMode ?? "grounded_clean";
  const system = buildCleanNarrationSystemPrompt(styleMode);
  const prompt = buildCleanNarrationPrompt(promptInput);
  if (needsDeterministicAuthorityProjection(input.narratorView)) {
    return {
      ...assertCleanNarrationResult({
        version: "gameplay-runtime.clean-narration-result.v1",
        packetId: input.narratorView.packetId,
        turnId: input.narratorView.turnId,
        text: renderCleanAuthorityProjection(input.narratorView),
        source: "deterministic_authority_projection",
      }),
      validationIssues: [],
    };
  }
  const generateCandidate =
    input.generateCandidate
    ?? ((request: CleanNarrationCandidateRequest) => generateCleanNarrationCandidate({
      provider: input.provider,
      request,
    }));

  let validationIssues: CleanNarrationValidationIssue[] = [];
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const requestPrompt = attempt === 1
      ? prompt
      : [
          prompt,
          "",
          "Stage 6 validation feedback from the previous candidate:",
          summarizeNarrationValidationIssues(validationIssues),
          ...narrationValidationRepairLines(input.narratorView, validationIssues),
          "Return a replacement JSON candidate that satisfies the same accepted evidence refs and fixes the validation feedback.",
        ].join("\n");
    let candidate: unknown;
    try {
      candidate = await generateCandidate({ system, prompt: requestPrompt, promptInput, styleMode });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new CleanNarrationGenerationError(
        `Clean Narration generation failed before validation: ${message.slice(0, 300)}`,
        error,
      );
    }

    const validation = validateCleanNarrationCandidate({
      view: input.narratorView,
      candidate,
    });
    if (validation.status === "accepted") {
      return {
        ...assertCleanNarrationResult({
          version: "gameplay-runtime.clean-narration-result.v1",
          packetId: input.narratorView.packetId,
          turnId: input.narratorView.turnId,
          text: validation.candidate.finalText,
          source: "model",
        }),
        validationIssues: [],
      };
    }
    validationIssues = validation.issues;
  }

  throw new CleanNarrationValidationError(
    `Clean Narration validation failed: ${summarizeNarrationValidationIssues(validationIssues)}`,
    validationIssues,
  );
}
