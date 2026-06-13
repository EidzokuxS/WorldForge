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
const PROSE_SHAPE_MARKERS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "word_as_object",
    pattern: /\b(?:taste[sd]?|weigh(?:ed|s)?|roll(?:ed|s)?|repeat(?:ed|s)?|testing|working through)\b[\s\S]{0,80}\b(?:name|word|phrase|syllable)s?\b/iu,
  },
  {
    name: "novelty_tag",
    pattern: /\b(?:interesting|intriguing|full of surprises|that's new|we'll see)\b/iu,
  },
  {
    name: "crowd_foil",
    pattern: /\b(?:most people|everyone else|people usually|most would)\b/iu,
  },
  {
    name: "bottled_atmosphere",
    pattern: /\b(?:velvet|velvety|silk(?:en)?|husky|charged air|thick air|stretched silence|pregnant pause|barely above a whisper|ozone)\b/iu,
  },
  {
    name: "negation_as_description",
    pattern: /\b(?:not quite|not anymore|not yet|not\s+\w+(?:\s+\w+){0,3}\s*,?\s+but)\b/iu,
  },
  {
    name: "option_menu_verdict",
    pattern: /\beither\b[\s\S]{0,90}\bor\b|\b[A-Z][\w-]+\. Or [A-Z][\w-]+\b/u,
  },
  {
    name: "cosmic_fluff",
    pattern: /\b(?:world (?:narrowed|tilted|fell away)|something (?:dark|ancient|feral)|[\p{L}\p{N}_-]+ was a [\p{L}\p{N}_-]+ thing)\b/iu,
  },
];
const SUMMARY_DIGEST_MARKERS: Array<{ name: string; pattern: RegExp }> = [
  {
    name: "bare_item_transfer",
    pattern: /^[\p{L}\p{N}' -]+ is now with [\p{L}\p{N}' -]+\.$/iu,
  },
  {
    name: "bare_dialogue_quote",
    pattern: /^[\p{L}\p{N}' -]+ says:\s*"[^"]+[.!?]?"\.?$/iu,
  },
  {
    name: "direct_scene_list",
    pattern: /^You are at [^.]+\. (?:[\p{L}\p{N}' ,&-]+ (?:is|are) here\. )?(?:You have [^.]+\. )?(?:[\p{L}\p{N}' ,&-]+ (?:is|are) visible\. )?(?:Visible routes lead to|A visible route leads to)/iu,
  },
  {
    name: "old_arrival_formula",
    pattern: /^You arrive at\b/iu,
  },
];

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

const MAX_PROMPT_BACKEND_FACTS_PER_EVIDENCE = 6;
const LITERARY_TERMINAL_CLAIMS: CleanNarrationClaimKind[] = [
  "item_state",
  "dialogue_response",
  "player_location_change",
  "elapsed_time",
];
const LITERARY_SCENE_ANCHOR_CLAIMS: CleanNarrationClaimKind[] = [
  "current_scene",
  "current_location",
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
  ) return true;
  return hasOnlySceneFrameSnapshotEvidence(view)
    && view.acceptedEvidence.some((evidence) =>
      evidence.claimKinds.includes("visible_target")
      || evidence.claimKinds.includes("movement_option")
    );
}

function minimumLiteraryWordCount(view: CleanNarratorView): number {
  if (hasClaimKind(view, "player_location_change")) return 6;
  if (hasClaimKind(view, "elapsed_time")) return 4;
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

function preferredPromptFacts(evidence: AcceptedNarrationEvidence): AcceptedNarrationBackendFact[] {
  if (evidence.claimKinds.includes("item_state")) {
    const preferred = evidence.backendFacts.filter((fact) =>
      /^(?:Item label|Source|Target|Final equip state|Current scene anchor|Item transfer result):/u.test(fact.text)
    );
    return uniqueFactsByRef([...preferred, ...evidence.backendFacts]);
  }
  if (evidence.claimKinds.includes("dialogue_response")) {
    const preferred = evidence.backendFacts.filter((fact) =>
      /^(?:Speaker:|.+ says:|Dialogue summary:)/u.test(fact.text)
    );
    return uniqueFactsByRef([...preferred, ...evidence.backendFacts]);
  }
  return evidence.backendFacts;
}

function limitPromptEvidenceFacts(evidence: AcceptedNarrationEvidence): AcceptedNarrationEvidence {
  if (evidence.backendFacts.length <= MAX_PROMPT_BACKEND_FACTS_PER_EVIDENCE) return evidence;
  return {
    ...evidence,
    backendFacts: preferredPromptFacts(evidence).slice(0, MAX_PROMPT_BACKEND_FACTS_PER_EVIDENCE),
  };
}

function selectPromptAcceptedEvidence(view: CleanNarratorView): AcceptedNarrationEvidence[] {
  if (!isLiteraryNarrationCandidateExpected(view) || hasOnlySceneFrameSnapshotEvidence(view)) {
    return view.acceptedEvidence.map(limitPromptEvidenceFacts);
  }

  const terminalEvidence = view.acceptedEvidence.filter((evidence) =>
    evidenceHasAnyClaimKind(evidence, LITERARY_TERMINAL_CLAIMS)
  );
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

  for (const marker of PROSE_SHAPE_MARKERS) {
    if (marker.pattern.test(unquotedText)) {
      issues.push({
        code: "prose_quality",
        path: "finalText",
        message: `Narration finalText used tired prose shape: ${marker.name}.`,
      });
    }
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
    for (const marker of SUMMARY_DIGEST_MARKERS) {
      if (marker.pattern.test(text)) {
        issues.push({
          code: "prose_quality",
          path: "finalText",
          message: `Literary narration used summary-digest shape: ${marker.name}.`,
        });
      }
    }
  }

  return issues;
}

export function buildCleanNarratorPromptInput(view: CleanNarratorView): CleanNarratorPromptInput {
  return assertCleanNarratorPromptInput({
    version: "gameplay-runtime.clean-narrator-prompt-input.v1",
    packetId: view.packetId,
    turnId: view.turnId,
    responseLanguage: view.responseLanguage,
    language: view.language,
    languageSource: view.languageSource,
    preserveLabelsVerbatim: view.preserveLabelsVerbatim,
    acceptedEvidence: selectPromptAcceptedEvidence(view),
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
    "Style role: write playable text-RPG adventure prose from accepted facts; make each sentence carry a visible state, route, action result, elapsed-time fact, or accepted utterance.",
    "Default successful turns use one to three short fiction beats with concrete staging, accepted object state, scene placement, and varied sentence rhythm.",
    "Concrete prose foundation: use sensory depth, character-focused pacing, dynamic complete sentences, tactile vocabulary, and visible or audible macro actions when those details are present in accepted evidence.",
    "Cinematic realism: render what can be seen, heard, handled, smelled, or felt through accepted evidence; use ordinary concrete words and fluid complete sentences.",
    "Adventure prose floor: item transfers, dialogue responses, and direct scene observations should read as scene beats, not status lines or inventory lists.",
    ...cleanNarrationStyleLines(styleMode),
    "Render receipt fact labels into prose. Internal labels such as Operation, Source, Target, Final equip state, Current scene anchor, Item transfer result, Route option, connected, minute(s), backend, evidence, receipt, and authority stay out of finalText.",
    "Echo firewall: the player's request wording is already spent before Stage 6; answer the accepted outcome with fresh scene wording and preserve only accepted labels or quotes.",
    "Texture scope: use concrete sensory, room, body, and emotional-temperature detail only when it is already present in accepted backendFacts; every texture beat must point to a cited visible fact.",
    "Scene-anchor surface: scene labels function as exact placement tokens. Descriptive nouns around a scene label require accepted observation backendFacts naming those nouns.",
    "World texture: favor visible pressure, timing, sound, touch, posture, and object handling over summary labels when those details are accepted evidence.",
    "Use grounded variety: choose a direct scene opening that fits the claim, vary sentence shape, and avoid echoing prior phrasing when the facts allow another clean wording.",
    "Door rotation: movement, route checks, item state, scene snapshots, dialogue, and time passage should open through different sentence shapes across nearby turns.",
    "Shape pass: replace word-as-object phrasing, novelty tags, crowd-foil contrasts, bottled atmosphere, negation-as-description, either/or verdict menus, and cosmic abstractions with the accepted concrete fact.",
    "NPC dialogue style: keep accepted quotes exact; surrounding narration may show only accepted visible speaker/content facts and cannot turn the quote into durable world truth.",
    "NPC delivery: if the evidence supports a visible speaker, frame the quote with visible stance, distance, object handling, or turn-taking from accepted facts; never add private thought or hidden motive.",
    "Item-state surface: for item_state, phrase only the accepted custody/location/equip-state operation, source label, item label, target label, final equip state, and exact scene-anchor label. Extra handling gestures, readiness, reaction, consent, inspection, use, or dialogue require their own accepted evidence.",
    "Item-state grammar: make the item or settled custody state carry the sentence. Render target labels as holder or placement phrases such as with, by, carried by, held by, or at the exact target label.",
    "Movement surface: for player_location_change, phrase only the accepted destination/current-place label and accepted elapsed travel time. Use travel-time or current-place result phrasing such as '<time> travel brings you to <destination>' or '<destination> becomes the current place after <time>'. Route safety, arrival discoveries, scenery, and encounter details require their own accepted evidence.",
    "Elapsed-time surface: for standalone elapsed_time, phrase the accepted time passage and exact scene anchor if present. Visible changes, inactivity, waiting result, or no-change claims require their own accepted evidence.",
    "Sentence contract: accepted_evidence sentences cite evidenceRefs, backendFactRefs, and claimKinds from promptInput.acceptedEvidence.",
    "Literary sentence object budget: use 1-3 sentence objects total. Use 1 object for a simple item transfer, movement, or time passage, 1-2 for dialogue, and 2-3 for direct scene observation.",
    "Every accepted_evidence sentence object must include auditStepIds: [] exactly. Use only backendFactRefs shown in promptInput and cite only facts used by that sentence, normally 1-6 refs.",
    "Audit contract: audit_notice sentences cite auditStepIds from stepAuditForGrounding and carry empty evidenceRefs, backendFactRefs, and claimKinds.",
    "finalText must be exactly the sentence texts joined with one space.",
    "For route_status, express the cited route_status backend fact.",
    "For player_location_change, express the accepted player location change and accepted elapsed travel time.",
    "For oracle_outcome, express the selected visible outcome meaning.",
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

function projectionLanguage(view: CleanNarratorView): "ru" | "en" {
  return view.language === "ru" || view.language === "mixed" ? "ru" : "en";
}

function trimSentencePeriod(value: string): string {
  return normalizeText(value).replace(/\.$/u, "");
}

function factValue(evidence: AcceptedNarrationEvidence, prefix: string): string | null {
  const fact = evidence.backendFacts.find((entry) => entry.text.startsWith(prefix));
  if (!fact) return null;
  return trimSentencePeriod(fact.text.slice(prefix.length));
}

function factText(evidence: AcceptedNarrationEvidence, predicate: (text: string) => boolean): string | null {
  return evidence.backendFacts.find((entry) => predicate(entry.text))?.text ?? null;
}

function englishList(values: readonly string[]): string {
  const labels = uniqueStrings(values);
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(", ")}, and ${labels[labels.length - 1]}`;
}

function formatMinutes(value: string | null): string | null {
  if (!value) return null;
  return `${value} minute${value === "1" ? "" : "s"}`;
}

function renderElapsedTimeProjection(view: CleanNarratorView, evidence: AcceptedNarrationEvidence): string {
  const fact = evidence.backendFacts[0]?.text ?? evidence.text;
  const minutes = fact.match(/^World clock advances by (\d+) minute\(s\)\.$/u)?.[1] ?? null;
  if (!minutes) return fact;
  return projectionLanguage(view) === "ru"
    ? `Проходит ${minutes} мин.`
    : `${formatMinutes(minutes)!} pass.`;
}

function stableVariant(seed: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return hash % count;
}

function renderMovementProjection(view: CleanNarratorView, evidence: AcceptedNarrationEvidence): string | null {
  const language = projectionLanguage(view);
  const location = factValue(evidence, "Player location changed to ");
  if (!location) return null;
  const travelCost = factValue(evidence, "Travel cost: ")?.match(/^(\d+)\s+minute/u)?.[1] ?? null;
  const minutes = formatMinutes(travelCost);
  if (language === "ru") {
    return minutes
      ? `Через ${minutes} вы добираетесь до ${location}.`
      : `Вы добираетесь до ${location}.`;
  }

  const variants = minutes
    ? [
      `After ${minutes}, you reach ${location}.`,
      `The route brings you to ${location} in ${minutes}.`,
      `You make it to ${location} after ${minutes}.`,
    ]
    : [
      `You reach ${location}.`,
      `The route brings you to ${location}.`,
      `You make it to ${location}.`,
    ];
  return variants[stableVariant(`${view.turnId}:${location}`, variants.length)]!;
}

function parseRouteOptionFact(text: string): { label: string; connected: boolean; travelCost: string | null } | null {
  const match = text.match(/^Route option:\s+(.+?)\s+\((connected|not connected)(?:,\s+(\d+)\s+minute\(s\))?\)\.$/u);
  if (!match) return null;
  return {
    label: match[1]!,
    connected: match[2] === "connected",
    travelCost: match[3] ?? null,
  };
}

function parseVisibleTargetFact(text: string): { label: string; kind: string | null } | null {
  const match = text.match(/^Visible target:\s+(.+?)(?:\s+\(([^)]+)\))?\.$/u);
  if (!match) return null;
  return {
    label: match[1]!,
    kind: match[2] ?? null,
  };
}

function renderRouteOptionsProjection(evidence: AcceptedNarrationEvidence): string {
  const options = evidence.backendFacts
    .map((entry) => parseRouteOptionFact(entry.text))
    .filter((option): option is NonNullable<typeof option> => option !== null);
  if (options.length === 0) return evidence.backendFacts.map((entry) => entry.text).join(" ");

  const connected = options.filter((option) => option.connected);
  const blocked = options.filter((option) => !option.connected);
  const sentences: string[] = [];
  if (connected.length > 0) {
    const costs = uniqueStrings(connected.map((option) => option.travelCost ?? ""));
    const routeLabels = englishList(connected.map((option) => option.label));
    if (connected.length === 1) {
      const minutes = formatMinutes(connected[0]!.travelCost);
      sentences.push(minutes
        ? `A visible route leads to ${routeLabels}; it takes ${minutes}.`
        : `A visible route leads to ${routeLabels}.`);
    } else if (costs.length === 1 && costs[0]) {
      sentences.push(`Visible routes lead to ${routeLabels}; each takes ${formatMinutes(costs[0]!)!}.`);
    } else {
      sentences.push(`Visible routes lead to ${routeLabels}.`);
    }
  }
  if (blocked.length > 0) {
    sentences.push(`Closed visible routes: ${englishList(blocked.map((option) => option.label))}.`);
  }
  return sentences.join(" ");
}

function renderRouteStatusProjection(
  view: CleanNarratorView,
  evidence: AcceptedNarrationEvidence,
): string {
  const language = projectionLanguage(view);
  const routeText = evidence.backendFacts[0]?.text ?? evidence.text;
  const reachable = routeText.match(/^(.+?)\s+is reachable from (?:the current scene|here|.+)\.$/u);
  if (reachable) {
    return language === "ru"
      ? `Отсюда можно пройти к ${reachable[1]}.`
      : `${reachable[1]} is reachable from here.`;
  }
  const blocked = routeText.match(/^(.+?)\s+is not reachable from (?:the current scene|here|.+)\.$/u);
  if (blocked) {
    return language === "ru"
      ? `Путь к ${blocked[1]} отсюда закрыт.`
      : `The path to ${blocked[1]} is closed from here.`;
  }
  return routeText;
}

function renderSceneFrameSnapshotProjection(view: CleanNarratorView): string | null {
  const sceneFacts = view.acceptedEvidence
    .filter((evidence) => evidence.authority === "scene_frame_snapshot");
  if (sceneFacts.length === 0) return null;

  const currentScene = sceneFacts
    .flatMap((evidence) => evidence.backendFacts)
    .find((entry) => entry.text.startsWith("Current scene is "))
    ?.text.replace(/^Current scene is /u, "").replace(/\.$/u, "");
  const currentPlace = sceneFacts
    .flatMap((evidence) => evidence.backendFacts)
    .find((entry) => entry.text.startsWith("Current place is "))
    ?.text.replace(/^Current place is /u, "").replace(/\.$/u, "");
  const actors = sceneFacts
    .flatMap((evidence) => evidence.backendFacts)
    .filter((entry) => entry.text.startsWith("Visible actor: "))
    .map((entry) => trimSentencePeriod(entry.text.replace(/^Visible actor:\s*/u, "")));
  const inventory = sceneFacts
    .flatMap((evidence) => evidence.backendFacts)
    .filter((entry) => entry.text.startsWith("Inventory item: "))
    .map((entry) => trimSentencePeriod(entry.text.replace(/^Inventory item:\s*/u, "")));
  const routeOptions = sceneFacts
    .flatMap((evidence) => evidence.backendFacts)
    .map((entry) => parseRouteOptionFact(entry.text))
    .filter((option): option is NonNullable<typeof option> => option !== null);
  const alreadyNamed = new Set([
    ...actors,
    ...inventory,
    ...routeOptions.map((option) => option.label),
  ].map((label) => label.toLocaleLowerCase("en-US")));
  const targets = sceneFacts
    .flatMap((evidence) => evidence.backendFacts)
    .map((entry) => parseVisibleTargetFact(entry.text))
    .filter((target): target is NonNullable<typeof target> => target !== null)
    .map((target) => target.label)
    .filter((label) => !alreadyNamed.has(label.toLocaleLowerCase("en-US")));
  const routeEvidence: AcceptedNarrationEvidence = {
    ...sceneFacts[0]!,
    backendFacts: sceneFacts
      .flatMap((evidence) => evidence.backendFacts)
      .filter((entry) => entry.text.startsWith("Route option: ")),
  };
  const sentences: string[] = [];
  if (currentScene && currentPlace && currentScene !== currentPlace) {
    sentences.push(`You are at ${currentScene}, inside ${currentPlace}.`);
  } else if (currentScene) {
    sentences.push(`You are at ${currentScene}.`);
  } else if (currentPlace) {
    sentences.push(`You are at ${currentPlace}.`);
  }
  if (actors.length > 0) sentences.push(`${englishList(actors)} ${actors.length === 1 ? "is" : "are"} here.`);
  if (inventory.length > 0) sentences.push(`You have ${englishList(inventory)}.`);
  if (targets.length > 0) sentences.push(`${englishList(targets)} ${targets.length === 1 ? "is" : "are"} visible.`);
  if (routeEvidence.backendFacts.length > 0) sentences.push(renderRouteOptionsProjection(routeEvidence));
  return sentences.length > 0 ? sentences.join(" ") : null;
}

function renderDeviceSurfaceProjection(evidence: AcceptedNarrationEvidence): string {
  const summary = evidence.backendFacts[0]?.text ?? evidence.text;
  const device = factValue(evidence, "Device: ");
  if (!device) return summary;
  const unavailable = evidence.backendFacts.find((entry) =>
    entry.text.startsWith("Current visible device surface exposes no requested ")
  );
  if (unavailable) {
    const facet = unavailable.text
      .replace(/^Current visible device surface exposes no requested /u, "")
      .replace(new RegExp(`\\s+for\\s+${device.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.$`, "u"), "");
    return `${device}'s visible surface shows no requested ${facet}.`;
  }
  const facetFacts = evidence.backendFacts.filter((entry) =>
    !entry.text.startsWith("Device: ")
    && !entry.text.startsWith("Requested surface facets: ")
    && entry.text !== summary
  );
  return facetFacts.length > 0
    ? `${device}: ${facetFacts.map((entry) => trimSentencePeriod(entry.text)).join("; ")}.`
    : summary;
}

function renderLocalObservationProjection(evidence: AcceptedNarrationEvidence): string {
  const summary = evidence.backendFacts[0]?.text ?? evidence.text;
  if (evidence.claimKinds.includes("bounded_visibility_negative")) {
    return summary.replace(/^Current visible /u, "The visible ");
  }
  const routeSummary = summary.startsWith("Current route options include:")
    ? trimSentencePeriod(summary.replace(/^Current route options include:\s*/u, ""))
    : null;
  const observed = evidence.backendFacts
    .filter((entry) => entry.text.startsWith("Observed "))
    .map((entry) =>
      trimSentencePeriod(entry.text.replace(/^Observed\s+/u, ""))
        .replace(/^visible\s+(actor|target|item|route|device)\s+/u, "")
        .replace(/^route option\s+/u, "")
    );
  if (observed.length > 0) {
    if (routeSummary) {
      return `Visible routes here include: ${routeSummary}. Visible route match: ${englishList(observed)}.`;
    }
    return `Visible here: ${englishList(observed)}.`;
  }
  return summary;
}

function renderPlayerLocalConditionProjection(evidence: AcceptedNarrationEvidence): string {
  const operation = evidence.backendFacts[0]?.text ?? evidence.text;
  return operation;
}

function renderItemStateProjection(evidence: AcceptedNarrationEvidence): string {
  const itemLabel = factValue(evidence, "Item label: ");
  const operation = factValue(evidence, "Operation: ");
  const target = factValue(evidence, "Target: ");
  const result = factValue(evidence, "Item transfer result: ");
  const firstFact = evidence.backendFacts[0]?.text ?? evidence.text;
  if (!itemLabel || !operation) return firstFact;
  if (result === "already_satisfied") return `${itemLabel} is already in that state.`;
  switch (operation) {
    case "give_to_visible_actor":
      return target ? `${itemLabel} is now with ${target}.` : firstFact;
    case "drop_in_current_scene":
      return target ? `${itemLabel} is now at ${target}.` : firstFact;
    case "pickup_from_current_scene":
      return `You now carry ${itemLabel}.`;
    case "equip_inventory_item":
      return `You equip ${itemLabel}.`;
    case "unequip_inventory_item":
      return `You now carry ${itemLabel}.`;
    default:
      return firstFact;
  }
}

function renderDialogueProjection(evidence: AcceptedNarrationEvidence): string {
  const quoteFact = evidence.backendFacts.find((entry) =>
    entry.text.includes(" says: ") || entry.text.includes("dialogue response")
  );
  return quoteFact?.text ?? evidence.text;
}

function renderMinorPoiProjection(evidence: AcceptedNarrationEvidence): string {
  const label = factValue(evidence, "Place handle label: ");
  const kind = factValue(evidence, "Place handle kind: ");
  const result = factValue(evidence, "Handle result: ");
  if (!label) return evidence.backendFacts[0]?.text ?? evidence.text;
  const noun = kind ? `${kind} handle` : "place handle";
  return result === "reused"
    ? `${label} remains available here as a visible ${kind ?? "place"} handle.`
    : `${label} is now available here as a visible ${noun}.`;
}

function renderSupportActorProjection(evidence: AcceptedNarrationEvidence): string {
  const actor = factValue(evidence, "Visible support actor: ");
  const role = factValue(evidence, "Support role: ");
  const scene = factValue(evidence, "Anchor scene: ");
  if (!actor) return evidence.backendFacts[0]?.text ?? evidence.text;
  if (role && scene) return `${actor} is present in ${scene} as a ${role}.`;
  if (role) return `${actor} is present as a ${role}.`;
  return `${actor} is present.`;
}

function needsDeterministicAuthorityProjection(view: CleanNarratorView): boolean {
  const onlySceneFrameSnapshotEvidence = hasOnlySceneFrameSnapshotEvidence(view);
  return view.acceptedEvidence.some((evidence) =>
    evidence.claimKinds.includes("clarification_request")
    || evidence.claimKinds.includes("minor_poi_handle")
    || evidence.claimKinds.includes("local_observation")
    || evidence.claimKinds.includes("player_local_condition")
    || evidence.claimKinds.includes("route_status")
    || evidence.authority === "route_options_receipt"
    || evidence.authority === "scene_observation_receipt"
    || evidence.claimKinds.includes("device_surface_observation")
  );
}

export function renderCleanAuthorityProjection(view: CleanNarratorView): string {
  const language = projectionLanguage(view);
  const clarification = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("clarification_request")
  );
  if (clarification) {
    const question = (clarification.backendFacts[0]?.text ?? clarification.text)
      .replace(/^Clarification request:\s*/u, "")
      .replace(/^Clarification needed:\s*/u, "")
      .trim();
    return language === "ru"
      ? `Уточните: ${question}`
      : `Please clarify: ${question}`;
  }

  const movement = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("player_location_change")
  );
  const movementFact = movement?.backendFacts.find((entry) =>
    entry.text.startsWith("Player location changed to ")
  );
  if (movementFact) {
    const rendered = renderMovementProjection(view, movement!);
    if (rendered) return rendered;
  }

  const oracle = view.acceptedEvidence.find((evidence) =>
    evidence.claimKinds.includes("oracle_outcome")
  );
  if (oracle) {
    return oracle.backendFacts[0]?.text ?? oracle.text;
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
    const narratableFacts = localObservation.backendFacts.filter((entry) =>
      !entry.text.startsWith("Checked current ")
    );
    return renderLocalObservationProjection({
      ...localObservation,
      backendFacts: narratableFacts.length > 0 ? narratableFacts : localObservation.backendFacts,
    });
  }

  const observation = view.acceptedEvidence.find((evidence) =>
    evidence.authority === "scene_observation_receipt"
  );
  if (observation) {
    return observation.backendFacts.map((entry) => entry.text).join(" ");
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
    return sceneBeat.backendFacts[0]?.text ?? sceneBeat.text;
  }

  const failed = view.stepAuditForGrounding[0];
  if (failed) {
    return language === "ru"
      ? `Это действие не подтверждено итоговыми данными: ${failed.publicReason}`
      : `This action is not confirmed by the settled evidence: ${failed.publicReason}`;
  }

  const firstFact = view.acceptedEvidence[0]?.backendFacts[0]?.text;
  if (firstFact) return firstFact;
  return language === "ru"
    ? "Ход зафиксирован, но итоговые данные не дают отдельного видимого факта для описания."
    : "The turn is settled, but there is no separate accepted visible fact to narrate.";
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

  let candidate: unknown;
  try {
    candidate = await generateCandidate({ system, prompt, promptInput, styleMode });
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

  throw new CleanNarrationValidationError(
    `Clean Narration validation failed: ${summarizeNarrationValidationIssues(validation.issues)}`,
    validation.issues,
  );
}
