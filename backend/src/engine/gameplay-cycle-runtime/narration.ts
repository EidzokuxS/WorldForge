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
    | "private_term"
    | "prose_quality"
    | "schema_invalid"
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

const UUID_LIKE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const BACKEND_REF = /\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|receipt|route|scene|turn|world|loc|player):[^\s",.]+/i;
const BACKEND_DASH_ID = /\b(?:actor|campaign|edge|fact|frame|item|knowledge|location|npc|packet|receipt|route|scene|turn|world|loc|player|stage4-receipt)-[a-z0-9][a-z0-9-]*\b/i;
const OLD_RUNTIME_MARKER = /\b(?:narrator_attempt|clean_narrator_attempt|settled_turn_packet|receipt_ledger|gameplay_cycle_v2|turn_saga|tool_payload|privateResult|chance|roll|reasoning)\b/i;
const ONE_WORD = /[\p{L}\p{N}]+/gu;
const CYRILLIC_WORD = /[\u0400-\u04FF]+/gu;
const RUSSIAN_ENGLISH_SCAFFOLD = /\b(?:Current scene|Current place|Inventory item|Visible target|Route option|The settled route check confirms|World clock advances|item state changed|Operation|Final equip state|Item transfer result)\b/iu;
const RECEIPT_PROSE_MARKER = /\b(?:Operation:|Source:|Target:|Final equip state:|Current scene anchor:|Item transfer result:|Player location changed|Travel cost|Current scene is|Current place is|Inventory item:|Visible target:|Route option:|minute\(s\)|transferred_to_actor|give_to_visible_actor|movement_option|message_indicator)\b/iu;
const ROUTE_OPTIONS_STOCK_PROJECTION_SHAPE =
  /\bFrom here,\s+the visible ways? leads? to\b[\s\S]*\b(?:Each takes|It takes)\b/iu;

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter((value) => value.length > 0))];
}

function normalizeText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function stripQuotedSegments(value: string): string {
  return value
    .replace(/"[^"]*"/gu, " ")
    .replace(/'[^']*'/gu, " ");
}

function wordsIn(value: string): string[] {
  return value.match(ONE_WORD) ?? [];
}

function uniqueCyrillicWords(value: string): string[] {
  return uniqueStrings(value.match(CYRILLIC_WORD) ?? []).map((word) => word.toLowerCase());
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

function hasAcceptedSceneTextureEvidence(view: CleanNarratorView): boolean {
  return view.acceptedEvidence.some((evidence) =>
    evidence.authority === "scene_frame_snapshot"
    && evidence.claimKinds.includes("scene_texture")
  );
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

function minimumLiteraryWordCount(view: CleanNarratorView): number {
  if (hasClaimKind(view, "player_location_change")) return hasAcceptedSceneTextureEvidence(view) ? 12 : 6;
  if (hasClaimKind(view, "elapsed_time")) return hasAcceptedSceneTextureEvidence(view) ? 10 : 4;
  if (hasClaimKind(view, "route_status")) return 6;
  if (hasClaimKind(view, "movement_option")) return 8;
  if (hasClaimKind(view, "local_observation")) return 5;
  if (hasClaimKind(view, "support_actor_materialization")) return hasAcceptedSceneTextureEvidence(view) ? 12 : 6;
  if (hasClaimKind(view, "player_local_condition")) return hasAcceptedSceneTextureEvidence(view) ? 10 : 4;
  if (hasClaimKind(view, "minor_poi_handle")) return hasAcceptedSceneTextureEvidence(view) ? 12 : 7;
  if (hasClaimKind(view, "device_surface_observation")) return hasAcceptedSceneTextureEvidence(view) ? 12 : 6;
  if (hasClaimKind(view, "oracle_outcome")) return 7;
  return 12;
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
  const roleSet = new Set<AcceptedNarrationBackendFactRole>(roles);
  const preferred = evidence.backendFacts.filter((fact) =>
    fact.role !== undefined && roleSet.has(fact.role)
  );
  if (preferred.length === 0) {
    throw new Error(`Prompt fact selection for ${evidence.authority} requires at least one preferred backend fact role.`);
  }
  return uniqueFactsByRef([...preferred, ...evidence.backendFacts]);
}

function preferredPromptFacts(evidence: AcceptedNarrationEvidence): AcceptedNarrationBackendFact[] {
  if (evidence.claimKinds.includes("item_state")) {
    return preferredPromptFactsByRole(evidence, [
      "custody_change",
      "settled_custody",
      "item_label",
      "source_label",
      "target_label",
      "final_equip_state",
      "current_scene_anchor",
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
      "support_role",
      "anchor_scene",
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

function limitPromptEvidenceFacts(evidence: AcceptedNarrationEvidence): AcceptedNarrationEvidence {
  assertRouteOptionsReceiptStoryEvidence(evidence);
  assertSceneFrameRouteStoryEvidence(evidence);
  assertSceneObservationStoryEvidence(evidence);
  assertSceneFrameSnapshotStoryEvidence(evidence);
  assertLocalObservationStoryEvidence(evidence);
  assertDeviceSurfaceStoryEvidence(evidence);
  assertSceneBeatStoryEvidence(evidence);
  const maxFacts = maxPromptBackendFactsForEvidence(evidence);
  if (evidence.backendFacts.length <= maxFacts) return evidence;
  return {
    ...evidence,
    backendFacts: preferredPromptFacts(evidence).slice(0, maxFacts),
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

function acceptedEvidenceText(view: CleanNarratorView): string {
  return view.acceptedEvidence
    .flatMap((evidence) => [
      evidence.text,
      ...evidence.backendFacts.map((fact) => fact.text),
    ])
    .join("\n");
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

  if (UUID_LIKE.test(text) || BACKEND_REF.test(text) || BACKEND_DASH_ID.test(text)) {
    issues.push({
      code: "backend_ref",
      path: "finalText",
      message: "Narration candidate exposed backend-looking refs.",
    });
  }
  if (OLD_RUNTIME_MARKER.test(text)) {
    issues.push({
      code: "old_runtime_marker",
      path: "finalText",
      message: "Narration candidate exposed old runtime or hidden adapter markers.",
    });
  }

  return issues;
}

const ROUTE_AS_MOVEMENT_TEXT = /\b(?:you\s+(?:go|move|walk|head|travel|arrive|reach)\b|arrive[sd]?\s+at\b|brings you to\b|becomes your current place\b|location changed\b|walk(?:ing|'s)?\b)/iu;
const ROUTE_UNSUPPORTED_TEXTURE_TEXT = /\b(?:stalls?|walkways?|foot traffic|surrounds?\s+you|in every direction)\b/iu;
const LOCAL_OBSERVATION_DISCOVERY_TEXT = /\b(?:discover(?:s|ed)?|reveal(?:s|ed)?|hidden|concealed|nothing changed|no change|no visible changes)\b/iu;
const LOCAL_OBSERVATION_ABSENCE_TEXT = /\b(?:absent|does not exist|nowhere|missing|not present|not visible|not here)\b/iu;
const LOCAL_OBSERVATION_PLAYER_ACTION_TEXT = /\byou\s+(?:stand|sit|crouch|step|move|scan|look|watch|search|listen|hold|grip)\b/iu;
const LOCAL_OBSERVATION_UNSUPPORTED_TEXTURE_TEXT = /\b(?:stretches?\s+around\s+you|surrounds?\s+you|stalls?|walkways?|foot traffic|current scene and place)\b/iu;
const LOCAL_OBSERVATION_SURFACE_KIND_TEXT = /\bvisible\s+(?:actors?|targets?|items?|routes?|devices?)\b/iu;
const LOCAL_OBSERVATION_ACTOR_POSTURE_TEXT = /\bstands?\b/iu;
const DIRECT_SCENE_PLAYER_ACTION_TEXT = /\byou\s+(?:look|scan|search|listen|watch|turn|step|stand|sit|crouch|move|walk|take|hold|grip)\b/iu;
const DIRECT_SCENE_ACTOR_ACTION_TEXT =
  /\b(?:waits?|stands?|sits?|leans?|turns?|watches?|stares?|gestures?|speaks?|shouts?|answers?|asks?|nods?|carries?|holds?|guards?|works?|moves?|walks?|looks?|listens?)\b/iu;
const DIRECT_SCENE_ITEM_HANDLING_TEXT =
  /\b(?:at hand|rides?\s+at\s+your\s+side|in\s+your\s+hand|in\s+reach|useful\s+things?\s+in\s+reach|set\s+where\s+it\s+can\s+be\s+read|ready\s+to|gripped|held|strapped|slung|tucked|equipped)\b/iu;

function candidateCitesClaimKind(
  candidate: CleanNarrationCandidate,
  claimKind: CleanNarrationClaimKind,
): boolean {
  return candidate.sentences.some((sentence) => sentence.claimKinds.includes(claimKind));
}

function isDirectSceneSnapshotNarration(view: CleanNarratorView): boolean {
  return hasOnlySceneFrameSnapshotEvidence(view)
    && view.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("current_scene")
      || evidence.claimKinds.includes("visible_actor")
      || evidence.claimKinds.includes("inventory_status")
      || evidence.claimKinds.includes("visible_target")
      || evidence.claimKinds.includes("movement_option")
    );
}

function isSceneObservationReceiptNarration(view: CleanNarratorView): boolean {
  return view.acceptedEvidence.some((evidence) => evidence.authority === "scene_observation_receipt");
}

function isDirectSceneNarration(view: CleanNarratorView): boolean {
  return isDirectSceneSnapshotNarration(view) || isSceneObservationReceiptNarration(view);
}

function isDirectSceneEvidence(evidence: AcceptedNarrationEvidence): boolean {
  return evidence.authority === "scene_frame_snapshot"
    || evidence.authority === "scene_observation_receipt";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function directSceneFactValue(fact: AcceptedNarrationBackendFact, message: string): string {
  const value = fact.value?.trim();
  if (!value) throw new Error(message);
  return normalizeText(value);
}

function directSceneFactLabels(fact: AcceptedNarrationBackendFact): string[] {
  switch (fact.role) {
    case "scene_label":
      return [directSceneFactValue(fact, "Direct-scene label guard requires accepted Scene label value evidence.")];
    case "place_label":
      return [directSceneFactValue(fact, "Direct-scene label guard requires accepted Place label value evidence.")];
    case "visible_actor_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Visible actor labels value evidence."));
    case "inventory_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Inventory labels value evidence."));
    case "visible_target_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Visible target labels value evidence."));
    case "visible_actor_target_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Visible actor target labels value evidence."));
    case "visible_item_target_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Visible item target labels value evidence."));
    case "visible_place_handle_target_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Visible place-handle target labels value evidence."));
    case "visible_location_target_labels":
      return splitEvidenceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Visible location target labels value evidence."));
    case "route_choice_labels":
      return splitRouteChoiceLabels(directSceneFactValue(fact, "Direct-scene label guard requires accepted Route choice labels value evidence."));
    default:
      return [];
  }
}

function directSceneActorLabels(view: CleanNarratorView): string[] {
  return uniqueStrings(view.acceptedEvidence
    .filter((evidence) =>
      isDirectSceneEvidence(evidence)
      && (evidence.claimKinds.includes("visible_actor") || evidence.claimKinds.includes("visible_target"))
    )
    .flatMap((evidence) => evidence.backendFacts.flatMap((fact) =>
      fact.role === "visible_actor_labels" || fact.role === "visible_actor_target_labels"
        ? directSceneFactLabels(fact)
        : []
    ))
    .filter((label) => label.length > 0));
}

function directSceneObjectLabels(view: CleanNarratorView): string[] {
  return uniqueStrings(view.acceptedEvidence
    .filter((evidence) =>
      isDirectSceneEvidence(evidence)
      && (evidence.claimKinds.includes("inventory_status") || evidence.claimKinds.includes("visible_target"))
    )
    .flatMap((evidence) => evidence.backendFacts.flatMap((fact) =>
      fact.role === "inventory_labels"
      || fact.role === "visible_item_target_labels"
      || fact.role === "visible_place_handle_target_labels"
        ? directSceneFactLabels(fact)
        : []
    ))
    .filter((label) => label.length > 0));
}

function sentenceMentionsLabel(sentence: string, label: string): boolean {
  return new RegExp(`\\b${escapeRegExp(label)}\\b`, "iu").test(sentence);
}

function directSceneUsesUnsupportedActorAction(view: CleanNarratorView, text: string): boolean {
  if (!isDirectSceneNarration(view)) return false;
  const actorLabels = directSceneActorLabels(view);
  if (actorLabels.length === 0) return false;
  return text.split(/(?<=[.!?])\s+/u).some((sentence) =>
    DIRECT_SCENE_ACTOR_ACTION_TEXT.test(sentence)
    && actorLabels.some((label) => sentenceMentionsLabel(sentence, label))
  );
}

function directSceneUsesUnsupportedItemHandling(view: CleanNarratorView, text: string): boolean {
  if (!isDirectSceneNarration(view)) return false;
  const objectLabels = directSceneObjectLabels(view);
  if (objectLabels.length === 0) return false;
  return text.split(/(?<=[.!?])\s+/u).some((sentence) =>
    DIRECT_SCENE_ITEM_HANDLING_TEXT.test(sentence)
    && objectLabels.some((label) => sentenceMentionsLabel(sentence, label))
  );
}

function directSceneVerbatimLabels(view: CleanNarratorView): string[] {
  return uniqueStrings(view.acceptedEvidence
    .filter((evidence) => isDirectSceneEvidence(evidence))
    .flatMap((evidence) => evidence.backendFacts)
    .flatMap((fact) => directSceneFactLabels(fact))
    .filter((label) => label.length > 0));
}

function directSceneUsesNonVerbatimCitedLabel(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!isDirectSceneNarration(view)) return false;
  const factLabels = new Map<string, string[]>();
  for (const evidence of view.acceptedEvidence) {
    if (!isDirectSceneEvidence(evidence)) continue;
    for (const fact of evidence.backendFacts) {
      const labels = directSceneFactLabels(fact);
      if (labels.length > 0) factLabels.set(fact.factRef, labels);
    }
  }
  for (const sentence of candidate.sentences) {
    for (const factRef of sentence.backendFactRefs) {
      const labels = factLabels.get(factRef) ?? [];
      if (labels.some((label) => !sentence.text.includes(label))) return true;
    }
  }
  return false;
}

function acceptedSceneTextureText(view: CleanNarratorView): string {
  return view.acceptedEvidence
    .filter((evidence) => evidence.claimKinds.includes("scene_texture"))
    .flatMap((evidence) => [
      evidence.text,
      ...evidence.backendFacts.map((fact) => fact.text),
    ])
    .join("\n")
    .toLowerCase();
}

function sceneTextureSourceTexts(view: CleanNarratorView): string[] {
  return view.acceptedEvidence
    .filter((evidence) => evidence.claimKinds.includes("scene_texture"))
    .flatMap((evidence) => [
      evidence.text,
      ...evidence.backendFacts.map((fact) => fact.text),
    ])
    .map((value) =>
      normalizeText(value)
        .replace(/^(?:current\s+scene\s+texture|scene\s+texture):\s*/iu, "")
        .replace(/\.$/u, "")
    )
    .filter((value) => value.length > 0);
}

function sceneTextureBackendFactTexts(view: CleanNarratorView): Array<{ factRef: string; text: string }> {
  return view.acceptedEvidence
    .filter((evidence) => evidence.claimKinds.includes("scene_texture"))
    .flatMap((evidence) => evidence.backendFacts)
    .map((fact) => ({
      factRef: fact.factRef,
      text: normalizeText(fact.text)
        .replace(/^scene\s+texture:\s*/iu, "")
        .replace(/\.$/u, ""),
    }))
    .filter((fact) => fact.text.length > 0);
}

function isAcceptedSceneTextureSentence(
  view: CleanNarratorView,
  sentenceText: string,
): boolean {
  const normalizedSentence = normalizeText(sentenceText)
    .replace(/\.$/u, "")
    .toLowerCase();
  if (normalizedSentence.length === 0) return true;
  return sceneTextureSourceTexts(view)
    .some((sourceText) => sourceText.toLowerCase().includes(normalizedSentence));
}

function hasParaphrasedSceneTexture(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return candidate.sentences.some((sentence) =>
    sentence.claimKinds.includes("scene_texture")
    && !isAcceptedSceneTextureSentence(view, sentence.text)
  );
}

function localObservationUsesFirstSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!hasClaimKind(view, "local_observation")) return false;
  const textureFacts = sceneTextureBackendFactTexts(view);
  if (textureFacts.length <= 1) return false;
  const [firstTextureFact, ...laterTextureFacts] = textureFacts;
  if (!firstTextureFact) return false;
  const laterFactRefs = new Set(laterTextureFacts.map((fact) => fact.factRef));
  const firstTextureText = firstTextureFact.text.toLowerCase();
  for (const sentence of candidate.sentences) {
    if (!sentence.claimKinds.includes("scene_texture")) continue;
    const sentenceText = normalizeText(sentence.text)
      .replace(/\.$/u, "")
      .toLowerCase();
    const citesLaterTexture = sentence.backendFactRefs.some((factRef) => laterFactRefs.has(factRef));
    const usesFirstTexture = sentence.backendFactRefs.includes(firstTextureFact.factRef)
      || firstTextureText.includes(sentenceText);
    if (usesFirstTexture && !citesLaterTexture) return true;
  }
  return false;
}

function standaloneElapsedTimeUsesFirstSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!hasClaimKind(view, "elapsed_time") || hasClaimKind(view, "player_location_change")) return false;
  const textureFacts = sceneTextureBackendFactTexts(view);
  if (textureFacts.length <= 1) return false;
  const [firstTextureFact, ...laterTextureFacts] = textureFacts;
  if (!firstTextureFact) return false;
  const laterFactRefs = new Set(laterTextureFacts.map((fact) => fact.factRef));
  const firstTextureText = firstTextureFact.text.toLowerCase();
  for (const sentence of candidate.sentences) {
    if (!sentence.claimKinds.includes("scene_texture")) continue;
    const sentenceText = normalizeText(sentence.text)
      .replace(/\.$/u, "")
      .toLowerCase();
    const citesLaterTexture = sentence.backendFactRefs.some((factRef) => laterFactRefs.has(factRef));
    const usesFirstTexture = sentence.backendFactRefs.includes(firstTextureFact.factRef)
      || firstTextureText.includes(sentenceText);
    if (usesFirstTexture && !citesLaterTexture) return true;
  }
  return false;
}

function routeOptionsUsesLaterSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!candidateCitesClaimKind(candidate, "movement_option")) return false;
  const textureFacts = sceneTextureBackendFactTexts(view);
  if (textureFacts.length <= 1) return false;
  const [firstTextureFact, ...laterTextureFacts] = textureFacts;
  if (!firstTextureFact) return false;
  const laterFactRefs = new Set(laterTextureFacts.map((fact) => fact.factRef));
  const firstTextureText = firstTextureFact.text.toLowerCase();
  for (const sentence of candidate.sentences) {
    if (!sentence.claimKinds.includes("scene_texture")) continue;
    const sentenceText = normalizeText(sentence.text)
      .replace(/\.$/u, "")
      .toLowerCase();
    const citesFirstTexture = sentence.backendFactRefs.includes(firstTextureFact.factRef)
      || firstTextureText.includes(sentenceText);
    const citesLaterTexture = sentence.backendFactRefs.some((factRef) => laterFactRefs.has(factRef));
    if (citesLaterTexture && !citesFirstTexture) return true;
  }
  return false;
}

function itemOrDialogueNeedsSceneTexture(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasAcceptedSceneTextureEvidence(view)
    && (hasClaimKind(view, "item_state") || hasClaimKind(view, "dialogue_response"))
    && !candidateCitesClaimKind(candidate, "scene_texture");
}

function dialogueResponseUsesFirstSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!hasClaimKind(view, "dialogue_response")) return false;
  const textureFacts = sceneTextureBackendFactTexts(view);
  if (textureFacts.length <= 1) return false;
  const [firstTextureFact, ...laterTextureFacts] = textureFacts;
  if (!firstTextureFact) return false;
  const laterFactRefs = new Set(laterTextureFacts.map((fact) => fact.factRef));
  const firstTextureText = firstTextureFact.text.toLowerCase();
  for (const sentence of candidate.sentences) {
    if (!sentence.claimKinds.includes("scene_texture")) continue;
    const sentenceText = normalizeText(sentence.text)
      .replace(/\.$/u, "")
      .toLowerCase();
    const citesLaterTexture = sentence.backendFactRefs.some((factRef) => laterFactRefs.has(factRef));
    const usesFirstTexture = sentence.backendFactRefs.includes(firstTextureFact.factRef)
      || firstTextureText.includes(sentenceText);
    if (usesFirstTexture && !citesLaterTexture) return true;
  }
  return false;
}

function standaloneItemStateUsesLaterSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!hasClaimKind(view, "item_state") || hasClaimKind(view, "dialogue_response")) return false;
  const textureFacts = sceneTextureBackendFactTexts(view);
  if (textureFacts.length <= 1) return false;
  const [firstTextureFact, ...laterTextureFacts] = textureFacts;
  if (!firstTextureFact) return false;
  const laterFactRefs = new Set(laterTextureFacts.map((fact) => fact.factRef));
  const firstTextureText = firstTextureFact.text.toLowerCase();
  for (const sentence of candidate.sentences) {
    if (!sentence.claimKinds.includes("scene_texture")) continue;
    const sentenceText = normalizeText(sentence.text)
      .replace(/\.$/u, "")
      .toLowerCase();
    const citesFirstTexture = sentence.backendFactRefs.includes(firstTextureFact.factRef)
      || firstTextureText.includes(sentenceText);
    const citesLaterTexture = sentence.backendFactRefs.some((factRef) => laterFactRefs.has(factRef));
    if (citesLaterTexture && !citesFirstTexture) return true;
  }
  return false;
}

function smallSceneResultNeedsSceneTexture(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasAcceptedSceneTextureEvidence(view)
    && (
      hasClaimKind(view, "support_actor_materialization")
      || hasClaimKind(view, "player_local_condition")
      || hasClaimKind(view, "minor_poi_handle")
    )
    && !candidateCitesClaimKind(candidate, "scene_texture");
}

function deviceSurfaceNeedsSceneTexture(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasAcceptedSceneTextureEvidence(view)
    && hasClaimKind(view, "device_surface_observation")
    && !candidateCitesClaimKind(candidate, "scene_texture");
}

function sceneTextureSelectionViolates(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
  expected: "first" | "later",
): boolean {
  const textureFacts = sceneTextureBackendFactTexts(view);
  if (textureFacts.length <= 1) return false;
  const [firstTextureFact, ...laterTextureFacts] = textureFacts;
  if (!firstTextureFact) return false;
  const laterFactRefs = new Set(laterTextureFacts.map((fact) => fact.factRef));
  const firstTextureText = firstTextureFact.text.toLowerCase();
  for (const sentence of candidate.sentences) {
    if (!sentence.claimKinds.includes("scene_texture")) continue;
    const sentenceText = normalizeText(sentence.text)
      .replace(/\.$/u, "")
      .toLowerCase();
    const citesFirstTexture = sentence.backendFactRefs.includes(firstTextureFact.factRef)
      || firstTextureText.includes(sentenceText);
    const citesLaterTexture = sentence.backendFactRefs.some((factRef) => laterFactRefs.has(factRef));
    if (expected === "first" && citesLaterTexture && !citesFirstTexture) return true;
    if (expected === "later" && citesFirstTexture && !citesLaterTexture) return true;
  }
  return false;
}

function supportActorUsesLaterSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasClaimKind(view, "support_actor_materialization")
    && sceneTextureSelectionViolates(view, candidate, "first");
}

function playerConditionUsesFirstSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasClaimKind(view, "player_local_condition")
    && sceneTextureSelectionViolates(view, candidate, "later");
}

function minorPoiUsesFirstSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasClaimKind(view, "minor_poi_handle")
    && sceneTextureSelectionViolates(view, candidate, "later");
}

function deviceSurfaceUsesFirstSceneTextureFact(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  return hasClaimKind(view, "device_surface_observation")
    && sceneTextureSelectionViolates(view, candidate, "later");
}

function deviceSurfaceNoSurfaceWordingViolates(
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  if (!hasClaimKind(view, "device_surface_unavailable")) return false;
  const deviceSentenceText = candidate.sentences
    .filter((sentence) => sentence.claimKinds.includes("device_surface_observation"))
    .map((sentence) => sentence.text)
    .join(" ");
  const text = normalizeText(deviceSentenceText || candidate.finalText);
  if (!/\bno requested\b/iu.test(text)) return true;
  return /\b(?:screen|lit|unlit|dark|blank|signal bars?|no signal\b|no messages?\b|no calls?\b|current surface)\b/iu.test(text)
    || /\bnotifications?\b(?!\s+indicator)\b/iu.test(text);
}

function patternMatches(pattern: RegExp, text: string): string[] {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  return [...text.matchAll(new RegExp(pattern.source, flags))]
    .map((match) => normalizeText(match[0]).toLowerCase());
}

function hasUnsupportedTexture(
  pattern: RegExp,
  text: string,
  view: CleanNarratorView,
  candidate: CleanNarrationCandidate,
): boolean {
  const matches = patternMatches(pattern, text);
  if (matches.length === 0) return false;
  if (!candidateCitesClaimKind(candidate, "scene_texture")) return true;
  const acceptedTexture = acceptedSceneTextureText(view);
  return matches.some((match) => !acceptedTexture.includes(match));
}

function acceptedRouteOptionLabels(view: CleanNarratorView): string[] {
  return uniqueStrings(view.acceptedEvidence
    .filter((evidence) => evidence.authority === "route_options_receipt")
    .flatMap((evidence) => {
      const labels = requireFactValueByRole(
        evidence,
        "route_choice_labels",
        "Route-options narration requires accepted Route choice labels value evidence.",
      );
      return splitRouteChoiceLabels(labels);
    }));
}

function acceptedLocalObservationLabels(view: CleanNarratorView): string[] {
  return uniqueStrings(view.acceptedEvidence
    .filter((evidence) => evidence.claimKinds.includes("local_observation"))
    .flatMap((evidence) => evidence.backendFacts)
    .filter((fact) => fact.role === "observed_entry_labels")
    .flatMap((fact) => splitEvidenceLabels(fact.value ?? "")));
}

function acceptedDirectSceneRouteOptionLabels(view: CleanNarratorView): string[] {
  return uniqueStrings(view.acceptedEvidence
    .filter((evidence) =>
      evidence.authority === "scene_frame_snapshot"
      && evidence.claimKinds.includes("movement_option")
    )
    .flatMap((evidence) => {
      const labels = requireFactValueByRole(
        evidence,
        "route_choice_labels",
        "Direct-scene route narration requires accepted Route choice labels value evidence.",
      );
      return splitRouteChoiceLabels(labels);
    }));
}

function hasTerminalRouteEvidence(view: CleanNarratorView): boolean {
  return view.acceptedEvidence.some((evidence) =>
    evidence.authority === "route_options_receipt"
    || (evidence.authority !== "scene_frame_snapshot" && evidence.claimKinds.includes("route_status"))
  );
}

function deterministicAuthorityProjectionText(view: CleanNarratorView): string {
  return normalizeText(renderCleanAuthorityProjection(view));
}

function proseQualityIssues(input: {
  view: CleanNarratorView;
  candidate: CleanNarrationCandidate;
}): CleanNarrationValidationIssue[] {
  const text = normalizeText(input.candidate.finalText);
  const unquotedText = stripQuotedSegments(text);
  const issues: CleanNarrationValidationIssue[] = [];
  const literaryExpected = isLiteraryNarrationCandidateExpected(input.view);

  if (wordsIn(text).length <= 1) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Narration finalText must contain more than one token.",
    });
  }

  if (RECEIPT_PROSE_MARKER.test(unquotedText)) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Narration finalText used receipt-shaped or enum-shaped wording.",
    });
  }

  if (input.view.language === "en") {
    const acceptedText = acceptedEvidenceText(input.view).toLowerCase();
    const leakedWords = uniqueCyrillicWords(text)
      .filter((word) => !acceptedText.includes(word));
    if (leakedWords.length > 0) {
      issues.push({
        code: "prose_quality",
        path: "finalText",
        message: "English narration finalText introduced unrelated Cyrillic text.",
      });
    }
  }

  if ((input.view.language === "ru" || input.view.language === "mixed")
    && RUSSIAN_ENGLISH_SCAFFOLD.test(unquotedText)
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Russian narration finalText used English scaffold or receipt phrasing.",
    });
  }

  if (literaryExpected) {
    if (input.candidate.sentences.length > 3) {
      issues.push({
        code: "prose_quality",
        path: "sentences",
        message: "Literary narration must use one to three sentence objects.",
      });
    }
    const minimumWords = minimumLiteraryWordCount(input.view);
    if (wordsIn(text).length < minimumWords) {
      issues.push({
        code: "prose_quality",
        path: "finalText",
        message: `Literary narration must be more developed than a compact status digest; expected at least ${minimumWords} words.`,
      });
    }
    if (text === deterministicAuthorityProjectionText(input.view)) {
      issues.push({
        code: "prose_quality",
        path: "finalText",
        message: "Literary narration copied deterministic authority projection text; transform accepted evidence into a developed story beat.",
      });
    }
  }

  if (
    hasTerminalRouteEvidence(input.view)
    && ROUTE_AS_MOVEMENT_TEXT.test(unquotedText)
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Route narration must phrase accepted route availability or visible options without claiming movement, arrival, or current-scene change.",
    });
  }

  if (
    hasTerminalRouteEvidence(input.view)
    && hasUnsupportedTexture(
      ROUTE_UNSUPPORTED_TEXTURE_TEXT,
      unquotedText,
      input.view,
      input.candidate,
    )
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Route narration must use accepted route labels and costs without unsupported scene texture or travel-mode detail.",
    });
  }

  if (hasParaphrasedSceneTexture(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Scene_texture narration must use an exact contiguous accepted scene-texture clause instead of paraphrasing spatial or atmospheric facts.",
    });
  }

  if (
    hasAcceptedSceneTextureEvidence(input.view)
    && (
      hasClaimKind(input.view, "player_location_change")
      || hasClaimKind(input.view, "elapsed_time")
    )
    && !candidateCitesClaimKind(input.candidate, "scene_texture")
  ) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Movement and elapsed-time narration with accepted scene_texture must include one exact scene_texture sentence object.",
    });
  }

  if (
    isDirectSceneNarration(input.view)
    && hasAcceptedSceneTextureEvidence(input.view)
    && !candidateCitesClaimKind(input.candidate, "scene_texture")
  ) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Direct-scene narration with accepted scene_texture must include one exact scene_texture sentence object.",
    });
  }

  if (
    isDirectSceneNarration(input.view)
    && DIRECT_SCENE_PLAYER_ACTION_TEXT.test(unquotedText)
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Direct-scene narration must describe accepted visible scene facts without adding player posture, search action, grip, or movement.",
    });
  }

  if (directSceneUsesUnsupportedActorAction(input.view, unquotedText)) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Direct-scene visible-actor labels prove presence only; actor posture, speech, handling, or action require accepted action evidence.",
    });
  }

  if (directSceneUsesUnsupportedItemHandling(input.view, unquotedText)) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Direct-scene inventory and target labels prove visible/carrying labels only; item handling, readiness, or placement detail require accepted item evidence.",
    });
  }

  if (directSceneUsesNonVerbatimCitedLabel(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Direct-scene cited labels must appear verbatim; inventory, actor, target, route, and scene labels are fixed player-facing names.",
    });
  }

  if (localObservationUsesFirstSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Local-observation scene_texture must use a later accepted texture fact when several scene_texture facts are available, or omit texture for that turn.",
    });
  }

  if (standaloneElapsedTimeUsesFirstSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Standalone elapsed-time scene_texture must use a later accepted texture fact when several scene_texture facts are available.",
    });
  }

  if (
    hasClaimKind(input.view, "movement_option")
    && ROUTE_OPTIONS_STOCK_PROJECTION_SHAPE.test(input.candidate.finalText)
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Route-options prose used stock route-list wording; write a fresh route-choice beat while preserving every accepted label and cost.",
    });
  }

  if (routeOptionsUsesLaterSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Route-options scene_texture must use the first accepted texture fact when several scene_texture facts are available, or omit texture for that turn.",
    });
  }

  if (itemOrDialogueNeedsSceneTexture(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Item-state and dialogue-response narration with accepted scene_texture must include one exact scene_texture sentence object.",
    });
  }

  if (dialogueResponseUsesFirstSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Dialogue-response scene_texture must use a later accepted texture fact when several scene_texture facts are available.",
    });
  }

  if (standaloneItemStateUsesLaterSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Standalone item-state scene_texture must use the first accepted texture fact when several scene_texture facts are available.",
    });
  }

  if (smallSceneResultNeedsSceneTexture(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Support-actor, player-condition, and minor-POI narration with accepted scene_texture must include one exact scene_texture sentence object.",
    });
  }

  if (deviceSurfaceNeedsSceneTexture(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Device-surface narration with accepted scene_texture must include one exact scene_texture sentence object.",
    });
  }

  if (supportActorUsesLaterSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Support-actor scene_texture must use the first accepted texture fact when several scene_texture facts are available.",
    });
  }

  if (deviceSurfaceUsesFirstSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Device-surface scene_texture must use a later accepted texture fact when several scene_texture facts are available.",
    });
  }

  if (deviceSurfaceNoSurfaceWordingViolates(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Bounded device no-surface narration must say no requested public indicator is visible on the device surface; screen state, lit/unlit status, signal bars, no messages, no calls, and network truth require separate accepted evidence.",
    });
  }

  if (playerConditionUsesFirstSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Player-condition scene_texture must use a later accepted texture fact when several scene_texture facts are available.",
    });
  }

  if (minorPoiUsesFirstSceneTextureFact(input.view, input.candidate)) {
    issues.push({
      code: "prose_quality",
      path: "sentences",
      message: "Minor-POI scene_texture must use a later accepted texture fact when several scene_texture facts are available.",
    });
  }

  const routeOptionLabels = candidateCitesClaimKind(input.candidate, "movement_option")
    ? uniqueStrings([
      ...acceptedRouteOptionLabels(input.view),
      ...acceptedDirectSceneRouteOptionLabels(input.view),
    ])
    : [];
  if (routeOptionLabels.length > 0) {
    const missingLabels = routeOptionLabels.filter((label) => !text.includes(label));
    if (missingLabels.length > 0) {
      issues.push({
        code: "prose_quality",
        path: "finalText",
        message: `Route-options narration must include every accepted visible route label; missing ${missingLabels.join(", ")}.`,
      });
    }
  }

  if (candidateCitesClaimKind(input.candidate, "local_observation")) {
    const missingLabels = acceptedLocalObservationLabels(input.view).filter((label) => !text.includes(label));
    if (missingLabels.length > 0) {
      issues.push({
        code: "prose_quality",
        path: "finalText",
        message: `Local-observation narration must include every accepted observed label; missing ${missingLabels.join(", ")}.`,
      });
    }
  }

  if (hasClaimKind(input.view, "local_observation") && LOCAL_OBSERVATION_DISCOVERY_TEXT.test(unquotedText)) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Local-observation narration must phrase accepted current visible results without discovery, hidden-area, or no-change claims.",
    });
  }

  if (hasClaimKind(input.view, "local_observation") && LOCAL_OBSERVATION_PLAYER_ACTION_TEXT.test(unquotedText)) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Local-observation narration must phrase accepted visible results without adding player posture, motion, grip, or search-action claims.",
    });
  }

  if (
    hasClaimKind(input.view, "local_observation")
    && (
      hasUnsupportedTexture(
        LOCAL_OBSERVATION_UNSUPPORTED_TEXTURE_TEXT,
        unquotedText,
        input.view,
        input.candidate,
      )
      || LOCAL_OBSERVATION_SURFACE_KIND_TEXT.test(unquotedText)
      || LOCAL_OBSERVATION_ACTOR_POSTURE_TEXT.test(unquotedText)
    )
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Local-observation narration must use accepted visible labels without unsupported scene texture, surface-kind wording, or actor posture.",
    });
  }

  if (
    hasClaimKind(input.view, "local_observation")
    && hasClaimKind(input.view, "bounded_visibility_negative")
    && LOCAL_OBSERVATION_ABSENCE_TEXT.test(unquotedText)
  ) {
    issues.push({
      code: "prose_quality",
      path: "finalText",
      message: "Bounded local-observation narration must describe the checked visible entries without broad absence claims.",
    });
  }

  return issues;
}

export function buildCleanNarratorPromptInput(view: CleanNarratorView): CleanNarratorPromptInput {
  const acceptedEvidence = selectPromptAcceptedEvidence(view);
  return assertCleanNarratorPromptInput({
    version: "gameplay-runtime.clean-narrator-prompt-input.v1",
    packetId: view.packetId,
    turnId: view.turnId,
    responseLanguage: view.responseLanguage,
    language: view.language,
    languageSource: view.languageSource,
    preserveLabelsVerbatim: view.preserveLabelsVerbatim,
    acceptedEvidence,
    storyFrame: buildCleanNarratorStoryFrame(acceptedEvidence),
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
    "Default literary profile: use Zetta Micro 1.1.3 as the primary prose reference and FF5 Micro as the secondary reference. Aim for compact adventure-page writing: concrete present-tense beats, tactile verbs, named visible objects, compressed stakes, and a playable final handle.",
    "Micro-page rhythm: follow storyFrame.pagePlan from accepted context to accepted turn event to accepted next-action context. Let accepted labels carry continuity, choose one precise verb per beat, and shape the final sentence so the player can immediately decide the next move.",
    "Truthful flourish: spend style budget on cadence, syntax, sensory angle, and sentence rhythm from accepted facts. Every flourish must remain a phrasing choice over cited evidence, not a new event, state, route, item ownership, NPC action, discovery, absence, private fact, or world truth.",
    "Reference transformation examples are patterns, not extra facts. Example movement: accepted facts 'Travel beat: After 1 minute, you reach North Hall.', 'Destination label: North Hall.', and 'Elapsed travel time: 1 minute.' can become 'After one minute, North Hall takes your weight underfoot.' with evidenceRefs ['e1'], backendFactRefs ['e1.f1','e1.f2','e1.f3'], claimKinds ['player_location_change','elapsed_time'].",
    "Example dialogue with texture: accepted scene_texture 'Rain taps the brass gutters.' plus accepted quote 'Guide says: \"The north stairs flooded before dawn.\"' can become two sentence objects: exact texture sentence first, then 'Guide keeps the answer short: \"The north stairs flooded before dawn.\"' with dialogue evidence refs and claimKinds ['dialogue_response'].",
    "Example route options: accepted route labels 'Anchor Chain Pylon' and 'The Copper Tap' with one-minute costs can become 'Anchor Chain Pylon and The Copper Tap are the one-minute choices from here.' with movement_option refs only; this offers next action context without movement, safety, discovery, or hidden-route claims.",
    "Style role: write playable text-RPG adventure prose from accepted facts; make each sentence carry a visible state, route, action result, elapsed-time fact, or accepted utterance.",
    "Default successful turns use one to three short fiction beats with concrete staging, accepted object state, scene placement, and varied sentence rhythm.",
    "Concrete prose foundation: use sensory depth, character-focused pacing, dynamic complete sentences, tactile vocabulary, and visible or audible macro actions when those details are present in accepted evidence.",
    "Cinematic realism: render what can be seen, heard, handled, smelled, or felt through accepted evidence; use ordinary concrete words and fluid complete sentences.",
    "Adventure prose floor: item transfers, dialogue responses, route checks, route options, local observations, and direct scene observations should read as scene beats, not status lines or inventory lists.",
    ...cleanNarrationStyleLines(styleMode),
    "Render receipt fact labels into prose. Internal labels such as Operation, Source, Target, Final equip state, Current scene anchor, Item transfer result, Travel beat, Destination label, Elapsed travel time, Current place after movement, Time beat, Elapsed time, Route beat, Route label, Route status, Route choices beat, Route origin, Route choice labels, Open route labels, Closed route labels, Route choice travel costs, Route option, connected, minute(s), backend, evidence, receipt, and authority stay out of finalText.",
    "Echo firewall: the player's request wording is already spent before Stage 6; answer the accepted outcome with fresh scene wording and preserve only accepted labels or quotes.",
    "Texture scope: use concrete sensory, room, body, and emotional-temperature detail only when it is already present in accepted backendFacts; every texture beat must point to a cited visible fact.",
    "Scene-texture evidence: scene_texture may color the prose with public current-scene description texture only. It does not prove route truth, movement, actor action, discovery, absence, no-change, item state, or private knowledge.",
    "Scene-texture exactness: for scene_texture sentences, set sentence.text to one exact contiguous accepted scene-texture clause from backendFacts after the 'Scene texture:' label, with the matching backendFactRefs for that clause.",
    "Scene-anchor surface: scene labels function as exact placement tokens. Descriptive nouns around a scene label require accepted observation backendFacts naming those nouns.",
    "World texture: favor visible pressure, timing, sound, touch, posture, and object handling over summary labels when those details are accepted evidence.",
    "Use grounded variety: choose a direct scene opening that fits the claim, vary sentence shape, and avoid echoing prior phrasing when the facts allow another clean wording.",
    "Door rotation: movement, route checks, item state, scene snapshots, dialogue, and time passage should open through different sentence shapes across nearby turns.",
    "Shape pass: replace word-as-object phrasing, novelty tags, crowd-foil contrasts, bottled atmosphere, negation-as-description, either/or verdict menus, and cosmic abstractions with the accepted concrete fact.",
    "NPC dialogue style: keep accepted quotes exact; surrounding narration may show only accepted visible speaker/content facts and cannot turn the quote into durable world truth. With scene_texture evidence, put one exact scene_texture sentence beside the utterance; when several texture facts exist, dialogue_response uses a later texture fact than the first.",
    "NPC delivery: if the evidence supports a visible speaker, frame the quote with visible stance, distance, object handling, or turn-taking from accepted facts; never add private thought or hidden motive.",
    "Item-state surface: for item_state, phrase only the accepted custody/location/equip-state operation, source label, item label, target label, final equip state, and exact scene-anchor label. Prefer backendFacts named Custody change and Settled custody as the prose beat; use raw result details such as Item transfer result as proof details, not visible wording. With scene_texture evidence, put one exact scene_texture sentence beside the custody/state beat; standalone item_state uses the first accepted texture fact when several texture facts exist, and composed item_state plus dialogue_response follows the dialogue_response texture selection. Extra handling gestures, readiness, reaction, consent, inspection, use, or dialogue require their own accepted evidence.",
    "Item-state grammar: make the item or settled custody state carry the sentence. Render target labels as holder or placement phrases such as with, by, carried by, held by, or at the exact target label.",
    "Movement surface: for player_location_change, render accepted Travel beat as the turn event, with Destination label, Elapsed travel time, and Current place after movement as proof details. With scene_texture evidence, put one exact scene_texture sentence first, then one concise movement-result beat such as 'After <time>, you reach <destination>.' Route safety, arrival discoveries, scenery beyond the cited texture, encounter details, and travel-mode detail require their own accepted evidence.",
    "Elapsed-time surface: for standalone elapsed_time, render accepted Time beat as the turn event, with Elapsed time as the proof detail and exact scene anchor if present. With scene_texture evidence, put one exact scene_texture sentence first, then one concise elapsed-time beat such as '<time> pass at <scene>.' When several scene_texture backendFacts exist, choose a later texture fact than the first. Visible changes, inactivity, waiting result, or no-change claims require their own accepted evidence.",
    "Route-status surface: for route_status, render accepted Route beat as the turn event, with Route label and Route status as proof details. Scene labels are placement tokens only here; ambient nouns such as stalls, crowds, traffic, smoke, water, sound, smell, light, or weather require exact accepted backendFacts. Do not describe the player moving, arriving, walking, traveling, or changing current scene.",
    "Route-options surface: for movement_option and route_options_receipt, render accepted Route choices beat as the turn event, with Route choice labels, Open route labels, Closed route labels, and Route choice travel costs as proof details. With scene_texture evidence, one exact scene-texture sentence may precede or frame the route-choice beat; when several texture facts exist, route-options uses the first accepted texture fact. Include every accepted route label; do not add travel mode, player motion, hidden routes, route safety, or current-scene change.",
    "Local-observation surface: for local_observation, phrase only the accepted current visible observation entries. With scene_texture evidence, start from the visible result and attach at most one short scene-texture clause as its own sentence object. When several scene_texture backendFacts exist, choose a later texture fact than the first; texture may also be omitted. Use direct label shapes such as '<label> is in view here.' or '<labels> are in view here.' For player posture, motion, grip, search action, surface-kind wording, and ambient setting detail require exact accepted backendFacts; bounded_visibility_negative may only say the checked visible entries showed no matching visible result.",
    "Support-actor surface: for support_actor_materialization, phrase only the accepted visible support actor label, ordinary support role, materialization result, and exact scene anchor. With scene_texture evidence, put one exact scene_texture sentence beside the presence beat; when several texture facts exist, support_actor_materialization uses the first accepted texture fact. Dialogue, services, actor actions, private knowledge, relationship change, future relevance, route truth, item state, movement, absence, and no-change require separate accepted evidence.",
    "Player-local-condition surface: for player_local_condition, phrase only the accepted Player current-scene posture or readiness condition, condition key, condition result, target if present, and exact scene anchor. With scene_texture evidence, put one exact scene_texture sentence beside the condition beat; when several texture facts exist, player_local_condition uses a later texture fact than the first. HP, damage, cover, combat modifier, movement, item custody, dialogue, absence, and no-change require separate accepted evidence.",
    "Minor-POI surface: for minor_poi_handle, phrase only the accepted visible current-scene place handle label, kind, handle result, and exact scene anchor as a local target handle. With scene_texture evidence, put one exact scene_texture sentence beside the handle beat; when several texture facts exist, minor_poi_handle uses a later texture fact than the first. Route availability, legal movement, services, inventory, sign text, business facts, discovery, NPC truth, world facts, absence, and no-change require separate accepted evidence.",
    "Device-surface surface: for device_surface_observation, phrase only the accepted requested device label, requested public surface facets, modeled public surface facts, or bounded no-requested-surface result. For device_surface_unavailable/no_requested_surface, use bounded wording like '<device>'s visible surface shows no requested <facet display>.' Do not say the screen is blank/dark/lit/unlit, do not say signal bars are absent, and do not say there are no messages, no calls, no notifications, no signal, no network, or no instructions. With scene_texture evidence, put one exact scene_texture sentence beside the device-surface beat; when several texture facts exist, device_surface_observation uses a later texture fact than the first. Private messages, sender/caller identity, hidden instructions, signal/network truth, no messages, no calls, activation/use, hacking, route/location truth, world facts, absence, and no-change require separate accepted evidence.",
    "Oracle-outcome surface: for oracle_outcome, turn the cited selected visible outcome meaning into a concrete player-facing story beat. Keep the sentence grounded in the cited oracle_outcome backend fact and its evidence limits. Movement, route status, item state, dialogue, discovery, condition, world truth, absence, and private knowledge enter the story through their own accepted evidence entries.",
    "Direct-scene surface: for scene_frame_snapshot direct scene observation and scene_observation_receipt, use the first accepted scene_texture fact as its own exact sentence when scene_texture exists, then static accepted scene facts: exact current scene/place labels, visible actor presence, inventory labels the player has, visible target labels, and route-choice labels/costs when present. Preserve label spelling and capitalization exactly for every cited scene, actor, item, target, and route label. Actor posture, actor action, item handling, item readiness, player searching, player grip, movement, discovery, absence, and no-change require their own accepted backendFacts.",
    "Sentence contract: accepted_evidence sentences cite evidenceRefs, backendFactRefs, and claimKinds from promptInput.acceptedEvidence.",
    "Literary sentence object budget: use 1-3 sentence objects total. Use 1 object for a label-only simple item transfer, movement, time passage, route status, local observation, or device-surface result; use 2 objects when item_state, dialogue_response, movement, elapsed_time, route_options, or device_surface_observation cite scene_texture; use 2-3 for direct scene observation and composed item_state plus dialogue_response.",
    "Every accepted_evidence sentence object must include auditStepIds: [] exactly. Use only backendFactRefs shown in promptInput and cite only facts used by that sentence, normally 1-6 refs.",
    "Audit contract: audit_notice sentences cite auditStepIds from stepAuditForGrounding and carry empty evidenceRefs, backendFactRefs, and claimKinds.",
    "finalText must be exactly the sentence texts joined with one space.",
    "For route_status, express the cited route_status backend fact.",
    "For scene_texture, express only cited public current-scene description texture as atmosphere around another accepted claim.",
    "For player_location_change, express the accepted player location change and accepted elapsed travel time.",
    "For oracle_outcome, express only the selected visible outcome meaning.",
    "For standalone elapsed_time, express the accepted elapsed time fact.",
    "For dialogue_response, express that the visible speaker responded and include the accepted quote or summary as utterance evidence.",
    "For support_actor_materialization, express the accepted visible temporary support actor or role now present in the current scene.",
    "For player_local_condition, express the accepted Player current-scene posture or readiness condition operation.",
    "For item_state, express the accepted item custody, location, or equip-state operation as a single custody/state beat.",
    "For minor_poi_handle, express the accepted visible current-scene place handle label and kind as a target handle.",
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

  const evidenceByRef = new Map(input.view.acceptedEvidence.map((evidence) => [evidence.ref, evidence]));
  const auditByStepId = new Map(input.view.stepAuditForGrounding.map((step) => [step.stepId, step]));

  candidate.sentences.forEach((sentence, index) => {
    if (sentence.kind === "accepted_evidence") {
      if (
        sentence.evidenceRefs.length === 0
        || sentence.backendFactRefs.length === 0
        || sentence.claimKinds.length === 0
        || sentence.auditStepIds.length > 0
      ) {
        issues.push({
          code: "fact_not_supported",
          path: `sentences.${index}`,
          message: "accepted_evidence sentences must cite evidence refs, backend facts, and claim kinds only.",
        });
      }

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
      ) {
        issues.push({
          code: "audit_misuse",
          path: `sentences.${index}`,
          message: "audit_notice sentences must cite only failed/skipped audit step ids and no world claim fields.",
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

  if (normalizeText(candidate.finalText).length === 0) {
    issues.push({
      code: "empty_text",
      path: "finalText",
      message: "Narration candidate finalText cannot be empty.",
    });
  }
  issues.push(...leakageIssues({ view: input.view, candidate }));
  issues.push(...proseQualityIssues({ view: input.view, candidate }));

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
  view: CleanNarratorView,
  issues: readonly CleanNarrationValidationIssue[],
): string[] {
  const hasSceneTextureIssue = issues.some((issue) => issue.message.includes("scene_texture")
    || issue.message.includes("scene-texture")
    || issue.message.includes("scene texture")
    || issue.message.includes("texture fact")
    || issue.message.includes("texture clause"));
  const hasDirectSceneIssue = isDirectSceneNarration(view)
    && issues.some((issue) => issue.message.includes("Direct-scene"));
  const lines: string[] = [];
  const textureFacts = hasSceneTextureIssue || hasDirectSceneIssue
    ? sceneTextureBackendFactTexts(view)
    : [];
  if (textureFacts.length > 0) {
    lines.push(
      "Allowed scene_texture sentence texts, copied exactly from accepted backend facts:",
      ...textureFacts.slice(0, 6).map((fact) => `- ${fact.factRef}: ${fact.text}.`),
    );
    if (hasClaimKind(view, "local_observation") && textureFacts.length > 1) {
      lines.push(`For local_observation, use ${textureFacts.slice(1).map((fact) => fact.factRef).join(" or ")} if you include scene_texture; otherwise omit scene_texture.`);
    }
    if (hasClaimKind(view, "elapsed_time") && !hasClaimKind(view, "player_location_change") && textureFacts.length > 1) {
      lines.push(`For standalone elapsed_time, use ${textureFacts.slice(1).map((fact) => fact.factRef).join(" or ")} for the scene_texture sentence.`);
    }
    if (hasClaimKind(view, "movement_option") && textureFacts.length > 1 && textureFacts[0]) {
      lines.push(`For route_options, use ${textureFacts[0].factRef} if you include scene_texture; otherwise omit scene_texture.`);
    }
    if (hasDirectSceneIssue && textureFacts[0]) {
      lines.push(`For direct-scene snapshot narration, use ${textureFacts[0].factRef} as the scene_texture sentence.text exactly: "${textureFacts[0].text}."`);
    }
    if (hasClaimKind(view, "item_state") && !hasClaimKind(view, "dialogue_response") && textureFacts[0]) {
      lines.push(`For item_state, use ${textureFacts[0].factRef} for the scene_texture sentence.`);
    }
    if (hasClaimKind(view, "dialogue_response")) {
      const dialogueTextureRefs = textureFacts.length > 1
        ? textureFacts.slice(1).map((fact) => fact.factRef)
        : textureFacts.slice(0, 1).map((fact) => fact.factRef);
      if (dialogueTextureRefs.length > 0) {
        lines.push(`For dialogue_response, use ${dialogueTextureRefs.join(" or ")} for the scene_texture sentence.`);
      }
    }
    if (hasClaimKind(view, "support_actor_materialization") && textureFacts[0]) {
      lines.push(`For support_actor_materialization, use ${textureFacts[0].factRef} for the scene_texture sentence.`);
    }
    if (hasClaimKind(view, "player_local_condition")) {
      const playerConditionTextureRefs = textureFacts.length > 1
        ? textureFacts.slice(1).map((fact) => fact.factRef)
        : textureFacts.slice(0, 1).map((fact) => fact.factRef);
      if (playerConditionTextureRefs.length > 0) {
        lines.push(`For player_local_condition, use ${playerConditionTextureRefs.join(" or ")} for the scene_texture sentence.`);
      }
    }
    if (hasClaimKind(view, "minor_poi_handle")) {
      const minorPoiTextureRefs = textureFacts.length > 1
        ? textureFacts.slice(1).map((fact) => fact.factRef)
        : textureFacts.slice(0, 1).map((fact) => fact.factRef);
      if (minorPoiTextureRefs.length > 0) {
        lines.push(`For minor_poi_handle, use ${minorPoiTextureRefs.join(" or ")} for the scene_texture sentence.`);
      }
    }
    if (hasClaimKind(view, "device_surface_observation")) {
      const deviceSurfaceTextureRefs = textureFacts.length > 1
        ? textureFacts.slice(1).map((fact) => fact.factRef)
        : textureFacts.slice(0, 1).map((fact) => fact.factRef);
      if (deviceSurfaceTextureRefs.length > 0) {
        lines.push(`For device_surface_observation, use ${deviceSurfaceTextureRefs.join(" or ")} for the scene_texture sentence.`);
      }
    }
    lines.push("Set scene_texture sentence.text exactly to one listed text and cite only its matching backendFactRef in that sentence.");
    lines.push("Put scene_texture in its own accepted_evidence sentence object.");
  }
  if (hasDirectSceneIssue) {
    const labels = directSceneVerbatimLabels(view);
    lines.push(
      "Direct-scene repair contract:",
      "Use direct-scene accepted facts as static visible scene state.",
      "Use presence and visibility shapes: '<actor> is here.', '<actor> is in view here.', '<inventory item> is with you.', '<target> is visible.', '<route label> is the one-minute route choice here.'",
      "Use current-scene placement shapes such as 'At <scene>, ...' for scene labels.",
      "Replace player search, posture, grip, and movement wording with accepted scene placement or visible-state wording.",
      "Replace actor posture, speech, handling, work, and movement verbs with presence wording backed by visible_actor or actor visible_target facts.",
      "Replace item handling and readiness wording with carrying or visibility labels backed by inventory_status or visible_target facts.",
    );
    if (labels.length > 0) {
      lines.push(`Preserve these exact labels when cited: ${labels.slice(0, 16).join("; ")}.`);
    }
  }
  return lines;
}

function projectionLanguage(view: CleanNarratorView): "ru" | "en" {
  return view.language === "ru" || view.language === "mixed" ? "ru" : "en";
}

function trimSentencePeriod(value: string): string {
  return normalizeText(value).replace(/\.$/u, "");
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

function renderRouteOptionsProjection(evidence: AcceptedNarrationEvidence): string {
  const routeChoicesBeat = trimSentencePeriod(requireFactValueByRole(
    evidence,
    "route_choices_beat",
    "Route-options projection requires accepted Route choices beat value evidence.",
  ));
  return `${routeChoicesBeat}.`;
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

  const currentScene = firstRoleValue("scene_label");
  const currentPlace = firstRoleValue("place_label");
  const actors = uniqueStrings([
    ...labelsFromRole("visible_actor_labels"),
    ...labelsFromRole("visible_actor_target_labels"),
  ]);
  const inventory = uniqueStrings(labelsFromRole("inventory_labels"));
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
  if (inventory.length > 0) sentences.push(`You have ${englishList(inventory)}.`);
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
  if (result === "reused") return `${label} remains available here as a visible ${kind} handle.`;
  if (result === "created") return `${label} is now available here as a visible ${kind} handle.`;
  throw new Error("Minor-POI projection requires accepted Handle result value evidence.");
}

function renderSupportActorProjection(evidence: AcceptedNarrationEvidence): string {
  const actor = requireFactValueByRole(
    evidence,
    "visible_support_actor",
    "Support-actor projection requires accepted Visible support actor value evidence.",
  );
  const role = requireFactValueByRole(
    evidence,
    "support_role",
    "Support-actor projection requires accepted Support role value evidence.",
  );
  const scene = requireFactValueByRole(
    evidence,
    "anchor_scene",
    "Support-actor projection requires accepted Anchor scene value evidence.",
  );
  return `${actor} is present in ${scene} as a ${role}.`;
}

function needsDeterministicAuthorityProjection(view: CleanNarratorView): boolean {
  return view.acceptedEvidence.some((evidence) =>
    evidence.claimKinds.includes("clarification_request")
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

  if (dialogue) {
    return renderDialogueProjection(dialogue);
  }

  const supportActor = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("support_actor_materialization")
  );
  if (supportActor) {
    return renderSupportActorProjection(supportActor);
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
