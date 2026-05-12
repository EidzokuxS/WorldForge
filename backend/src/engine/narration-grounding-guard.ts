import type {
  NarratorPacket,
  NarratorPacketEvidence,
  NarratorPacketEvidenceCategory,
} from "./narrator-packet.js";
import { z } from "zod";

export const narrationClaimKindSchema = z.enum([
  "actor_presence",
  "object_presence",
  "location_change",
  "route_status",
  "threat_hazard",
  "future_pressure",
  "inventory_status",
  "inventory_status_change",
  "oracle_outcome",
  "playable_beat",
]);

export type NarrationClaimKind = z.infer<typeof narrationClaimKindSchema>;

export const ALLOWED_NARRATION_CLAIM_KINDS = new Set<NarrationClaimKind>([
  ...narrationClaimKindSchema.options,
]);

export const narrationClaimSchema = z.object({
  id: z.string(),
  kind: narrationClaimKindSchema,
  summary: z.string(),
  requiresEvidence: z.boolean(),
  evidenceRefs: z.array(z.string()),
});

export const narrationClaimSpanSchema = z.object({
  id: z.string(),
  spanText: z.string(),
  claimIds: z.array(z.string()),
  requiresEvidence: z.boolean(),
});

export const narrationDraftSchema = z.object({
  prose: z.string(),
  claims: z.array(narrationClaimSchema),
  claimSpans: z.array(narrationClaimSpanSchema),
});

export type NarrationClaim = z.infer<typeof narrationClaimSchema>;
export type NarrationClaimSpan = z.infer<typeof narrationClaimSpanSchema>;
export type NarrationDraft = z.infer<typeof narrationDraftSchema>;

export const GROUNDED_SENTENCE_DRAFT_VERSION = "grounded-sentence-draft.v2";
export const GROUNDED_SENTENCE_DRAFT_TEXT_MAX_LENGTH = 900;
export const GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MIN = 1;
export const GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX = 4;

const groundedSentenceEvidenceRefSchema = z
  .string()
  .min(1)
  .max(160)
  .describe("Exact packet evidence id copied from the allowed evidence list.");

const groundedSentenceSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(GROUNDED_SENTENCE_DRAFT_TEXT_MAX_LENGTH)
    .describe("One concise player-visible narration sentence. No ids, markdown, backend notes, or tool syntax."),
  evidenceRefs: z
    .array(groundedSentenceEvidenceRefSchema)
    .min(GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MIN)
    .max(GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX)
    .describe("Hard cap: one to four exact evidence ids supporting this sentence; never return five or more evidenceRefs."),
}).strict();

export const groundedSentenceDraftSchema = z.object({
  version: z
    .literal(GROUNDED_SENTENCE_DRAFT_VERSION)
    .describe(`Must be exactly ${GROUNDED_SENTENCE_DRAFT_VERSION}.`),
  sentences: z
    .array(groundedSentenceSchema)
    .min(1)
    .max(5)
    .describe("Hard cap: one to five grounded visible narration sentence objects; never return six or more."),
}).strict();

export type GroundedSentenceDraft = z.infer<typeof groundedSentenceDraftSchema>;

export type GroundingGuardViolationKind =
  | "empty_prose"
  | "missing_claim_spans"
  | "insufficient_claim_span_coverage"
  | "unsupported_claim"
  | "unknown_evidence_ref"
  | "disallowed_evidence_ref"
  | "claim_span_not_in_prose"
  | "uncovered_claim_span"
  | "unsupported_claim_span";

export type GroundingGuardWarningKind = "thin_prose";

export interface GroundingGuardViolation {
  kind: GroundingGuardViolationKind;
  claimId?: string;
  claimKind?: NarrationClaimKind;
  spanId?: string;
  evidenceRefs?: string[];
  missingEvidenceRefs?: string[];
  requiredEvidenceCategories?: NarratorPacketEvidenceCategory[];
  proseWordCount?: number;
  coveredWordCount?: number;
}

export interface GroundingGuardWarning {
  kind: GroundingGuardWarningKind;
  claimId?: string;
  claimKind?: NarrationClaimKind;
  spanId?: string;
  evidenceRefs?: string[];
  missingEvidenceRefs?: string[];
  requiredEvidenceCategories?: NarratorPacketEvidenceCategory[];
}

export interface NarrationClaimCoverageResult {
  spanId: string;
  claimIds: string[];
  covered: boolean;
  requiresEvidence: boolean;
}

export interface GroundingGuardResult {
  ok: boolean;
  violations: GroundingGuardViolation[];
  warnings?: GroundingGuardWarning[];
  coverage: NarrationClaimCoverageResult[];
  repairAddendum: string | null;
}

const MIN_THIN_PROSE_WORDS = 4;
const MIN_CLAIM_SPAN_WORD_COVERAGE_RATIO = 0.45;

const CLAIM_KIND_PRIORITY: NarrationClaimKind[] = [
  "inventory_status_change",
  "inventory_status",
  "location_change",
  "route_status",
  "object_presence",
  "threat_hazard",
  "future_pressure",
  "oracle_outcome",
  "actor_presence",
  "playable_beat",
];

export function isNarrationDraftCitationEvidence(
  entry: NarratorPacketEvidence,
  packet?: Pick<NarratorPacket, "anchorEvent">,
): boolean {
  switch (entry.category) {
    case "player_action_request":
    case "anchor_event":
    case "guardrail":
    case "control_return":
      return false;
    case "committed_event":
      return !isPlayerActionEvidenceEntry(entry, packet);
    default:
      return true;
  }
}

export function getAllowedNarrationCitationEvidence(
  packet: NarratorPacket,
): NarratorPacketEvidence[] {
  return (packet.evidenceLedger ?? []).filter((entry) =>
    isNarrationDraftCitationEvidence(entry, packet),
  );
}

function buildAllowedCitationEvidenceById(
  packet: NarratorPacket,
): ReadonlyMap<string, NarratorPacketEvidence> {
  return buildEvidenceById(getAllowedNarrationCitationEvidence(packet));
}

export function buildGroundedSentenceDraftRepairAddendum(args: {
  packet: NarratorPacket;
  failureReason: string;
}): string {
  const forbiddenTerms = collectNarratorPacketForbiddenTerms(args.packet);
  const evidenceLines = getAllowedNarrationCitationEvidence(args.packet)
    .map((entry) => formatAllowedEvidenceForRepair(entry, forbiddenTerms));
  const failureReason = sanitizeRepairText(args.failureReason, forbiddenTerms);

  return [
    "Revise the final grounded sentence draft because the previous structured object failed validation.",
    `Return exactly one GroundedSentenceDraft object with version="${GROUNDED_SENTENCE_DRAFT_VERSION}" and sentences[].text/evidenceRefs fields.`,
    "Return 1-5 sentence objects total; never return 6 or more. Merge or prioritize details if needed.",
    "Every sentence must cite 1-4 evidence ids; HARD CAP: evidenceRefs.length MUST be <= 4 for each sentence, never 5 or more.",
    "If many packet ids support one sentence, cite only the strongest 1-4 ids or split/prioritize the prose inside the 1-5 sentence limit.",
    "Do not include kind; the backend derives internal claim metadata from cited packet evidence.",
    "Write player-visible prose only in sentences[].text; do not output prose, claims, claimSpans, id, summary, or requiresEvidence.",
    "Use only evidence ids listed below.",
    "Do not cite player_action_request, anchor_event, guardrail, control_return, or the anchor player-action committed_event as proof of success, access, route truth, inventory, threat, pressure, or world change.",
    `Previous validation failure: ${failureReason || "GroundedSentenceDraft validation failed."}`,
    "[ALLOWED PACKET EVIDENCE IDS]",
    ...(evidenceLines.length > 0 ? evidenceLines : ["- No packet evidence ids are in scope."]),
  ].join("\n");
}

export function compileGroundedSentenceDraftToNarrationDraft(args: {
  packet: NarratorPacket;
  draft: unknown;
}): NarrationDraft {
  const draft = groundedSentenceDraftSchema.parse(args.draft);
  const allowedEvidenceById = buildAllowedCitationEvidenceById(args.packet);
  const seenSentences = new Set<string>();
  const normalizedSentences = draft.sentences.map((sentence, index) => {
    const text = normalizeGroundedSentenceText(sentence.text);
    if (!text) {
      throw new Error(`GroundedSentenceDraft sentence ${index + 1} is empty.`);
    }
    if (seenSentences.has(text)) {
      throw new Error(`GroundedSentenceDraft sentence ${index + 1} duplicates earlier prose.`);
    }
    seenSentences.add(text);
    assertGroundedSentenceTextIsVisibleProse(sentence.text, index);
    const evidenceRefs = uniqueEvidenceRefs(sentence.evidenceRefs);
    const kind = resolveGroundedSentenceClaimKind({
      sentenceIndex: index,
      evidenceRefs,
      allowedEvidenceById,
    });
    return {
      text,
      kind,
      evidenceRefs,
    };
  });
  const prose = normalizedSentences.map((sentence) => sentence.text).join(" ");
  const compiledDraft: NarrationDraft = {
    prose,
    claims: normalizedSentences.map((sentence, index) => ({
      id: `c${index + 1}`,
      kind: sentence.kind,
      summary: sentence.text,
      requiresEvidence: true,
      evidenceRefs: sentence.evidenceRefs,
    })),
    claimSpans: normalizedSentences.map((sentence, index) => ({
      id: `s${index + 1}`,
      spanText: sentence.text,
      claimIds: [`c${index + 1}`],
      requiresEvidence: true,
    })),
  };
  const grounding = validateNarrationDraftGrounding({
    packet: args.packet,
    draft: compiledDraft,
  });
  if (!grounding.ok) {
    throw new Error(
      `GroundedSentenceDraft compiled to an ungrounded NarrationDraft: ${grounding.violations.map((violation) => violation.kind).join(", ")}`,
    );
  }
  return compiledDraft;
}

export function validateNarrationDraftGrounding(args: {
  packet: NarratorPacket;
  draft: NarrationDraft;
}): GroundingGuardResult {
  const evidenceById = buildEvidenceById(args.packet.evidenceLedger ?? []);
  const allowedEvidenceById = buildAllowedCitationEvidenceById(args.packet);
  const claimById = buildClaimById(args.draft.claims);
  const violations: GroundingGuardViolation[] = [];
  const warnings: GroundingGuardWarning[] = [];

  const prose = args.draft.prose.trim();
  if (prose.length === 0) {
    violations.push({ kind: "empty_prose" });
  } else if (countWords(prose) < MIN_THIN_PROSE_WORDS) {
    warnings.push({ kind: "thin_prose" });
  }

  for (const claim of args.draft.claims) {
    if (!claim.requiresEvidence) {
      continue;
    }

    if (claim.evidenceRefs.length === 0) {
      violations.push({
        kind: "unsupported_claim",
        claimId: claim.id,
        claimKind: claim.kind,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
      continue;
    }

    const missingEvidenceRefs = claim.evidenceRefs.filter((ref) => !evidenceById.has(ref));
    const disallowedEvidenceRefs = claim.evidenceRefs.filter((ref) =>
      evidenceById.has(ref) && !allowedEvidenceById.has(ref),
    );
    if (missingEvidenceRefs.length > 0) {
      violations.push({
        kind: "unknown_evidence_ref",
        claimId: claim.id,
        claimKind: claim.kind,
        evidenceRefs: claim.evidenceRefs,
        missingEvidenceRefs,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
    }
    if (disallowedEvidenceRefs.length > 0) {
      violations.push({
        kind: "disallowed_evidence_ref",
        claimId: claim.id,
        claimKind: claim.kind,
        evidenceRefs: claim.evidenceRefs,
        missingEvidenceRefs: disallowedEvidenceRefs,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
    }
    if (claim.evidenceRefs.every((ref) => !allowedEvidenceById.has(ref))) {
      violations.push({
        kind: "unsupported_claim",
        claimId: claim.id,
        claimKind: claim.kind,
        evidenceRefs: claim.evidenceRefs,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
    }
  }

  const coverage = auditNarrationClaimCoverage({
    draft: args.draft,
    claimById,
    evidenceById: allowedEvidenceById,
  });
  for (const span of args.draft.claimSpans) {
    if (span.spanText.trim().length === 0 || !args.draft.prose.includes(span.spanText)) {
      violations.push({
        kind: "claim_span_not_in_prose",
        spanId: span.id,
      });
    }
  }

  if (prose.length > 0 && args.draft.claimSpans.length === 0) {
    violations.push({
      kind: "missing_claim_spans",
      requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
    });
  } else if (prose.length > 0 && args.draft.claimSpans.length > 0) {
    const proseWordCount = countWords(prose);
    const coveredWordCount = countCoveredClaimSpanWords(args.draft);
    if (
      proseWordCount >= MIN_THIN_PROSE_WORDS
      && coveredWordCount / proseWordCount < MIN_CLAIM_SPAN_WORD_COVERAGE_RATIO
    ) {
      violations.push({
        kind: "insufficient_claim_span_coverage",
        proseWordCount,
        coveredWordCount,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
    }
  }

  for (const entry of coverage) {
    if (!entry.requiresEvidence) {
      continue;
    }
    if (entry.claimIds.length === 0) {
      violations.push({
        kind: "uncovered_claim_span",
        spanId: entry.spanId,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
      continue;
    }
    if (!entry.covered) {
      violations.push({
        kind: "unsupported_claim_span",
        spanId: entry.spanId,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
    }
  }

  return buildGroundingResult(args.packet, violations, warnings, coverage);
}

export function auditNarrationClaimCoverage(args: {
  draft: NarrationDraft;
  claimById?: ReadonlyMap<string, NarrationClaim>;
  evidenceById?: ReadonlyMap<string, NarratorPacketEvidence>;
}): NarrationClaimCoverageResult[] {
  const claimById = args.claimById ?? buildClaimById(args.draft.claims);
  const evidenceById = args.evidenceById;

  return args.draft.claimSpans.map((span) => {
    const linkedClaims = span.claimIds
      .map((claimId) => claimById.get(claimId))
      .filter((claim): claim is NarrationClaim => Boolean(claim));
    const covered = linkedClaims.some((claim) => {
      if (span.requiresEvidence && !claim.requiresEvidence) {
        return false;
      }
      if (!claim.requiresEvidence) {
        return true;
      }
      return claim.evidenceRefs.length > 0
        && (evidenceById
          ? claim.evidenceRefs.every((ref) => evidenceById.has(ref))
          : true);
    });

    return {
      spanId: span.id,
      claimIds: [...span.claimIds],
      covered,
      requiresEvidence: span.requiresEvidence,
    };
  });
}

export function buildNarrationGroundingRepairAddendum(
  violations: readonly GroundingGuardViolation[],
  options: {
    evidenceLedger?: readonly NarratorPacketEvidence[];
    packet?: NarratorPacket;
    forbiddenTerms?: readonly string[];
  } = {},
): string {
  const forbiddenTerms = options.forbiddenTerms ?? [];
  const evidenceLines = (options.evidenceLedger ?? [])
    .filter((entry) => isNarrationDraftCitationEvidence(entry, options.packet))
    .map((entry) => formatAllowedEvidenceForRepair(entry, forbiddenTerms));
  const issueLines = violations.map((violation, index) => {
    const label = `Issue ${index + 1}`;
    const details = formatGroundingViolationDetails(violation);
    switch (violation.kind) {
      case "empty_prose":
        return `${label}: kind=empty_prose${details}; prose is empty; provide visible narration from the packet.`;
      case "missing_claim_spans":
        return `${label}: kind=missing_claim_spans${details}; claimSpans are missing; declare concrete prose spans and map them to claims.`;
      case "insufficient_claim_span_coverage":
        return `${label}: kind=insufficient_claim_span_coverage${details}; claimSpans cover too little of the prose; copy each concrete visible statement into claimSpans and map those spans to claims.`;
      case "unsupported_claim":
        return `${label}: kind=unsupported_claim${details}; an evidence-required claim lacks evidenceRefs; either remove it or cite packet evidence ids.`;
      case "unknown_evidence_ref":
        return `${label}: kind=unknown_evidence_ref${details}; an evidence-required claim cites evidence ids outside the packet ledger; use only packet evidence ids.`;
      case "disallowed_evidence_ref":
        return `${label}: kind=disallowed_evidence_ref${details}; an evidence-required claim cites context-only packet ids; use only allowed citation evidence ids.`;
      case "claim_span_not_in_prose":
        return `${label}: kind=claim_span_not_in_prose${details}; a claimSpan has empty text or text absent from prose; set spanText to an exact substring copied from prose.`;
      case "uncovered_claim_span":
        return `${label}: kind=uncovered_claim_span${details}; an evidence-required span has no declared claim; map it to an evidence-backed claim or remove the span.`;
      case "unsupported_claim_span":
        return `${label}: kind=unsupported_claim_span${details}; an evidence-required span maps only to unsupported claims; cite packet evidence ids or revise prose.`;
    }
  });

  return [
    "Revise the final grounded sentence draft. Do not reveal hidden terms.",
    `Return exactly one GroundedSentenceDraft object with version="${GROUNDED_SENTENCE_DRAFT_VERSION}" and sentences[].text/evidenceRefs fields.`,
    "Return 1-5 sentence objects total; never return 6 or more. Merge or prioritize details if needed.",
    "Every sentence must cite 1-4 evidence ids; HARD CAP: evidenceRefs.length MUST be <= 4 for each sentence, never 5 or more.",
    "If many packet ids support one sentence, cite only the strongest 1-4 ids or split/prioritize the prose inside the 1-5 sentence limit.",
    "Do not include kind; the backend derives internal claim metadata from cited packet evidence.",
    "Write player-visible prose only in sentences[].text; do not output prose, claims, claimSpans, id, summary, or requiresEvidence.",
    "Use only evidence ids already present in the packet evidence ledger.",
    "[ALLOWED PACKET EVIDENCE]",
    ...(evidenceLines.length > 0 ? evidenceLines : ["- No packet evidence ids are in scope."]),
    "[GROUNDING DIAGNOSTICS]",
    ...issueLines,
  ].join("\n");
}

function buildGroundingResult(
  packet: NarratorPacket,
  violations: GroundingGuardViolation[],
  warnings: GroundingGuardWarning[],
  coverage: NarrationClaimCoverageResult[],
): GroundingGuardResult {
  return {
    ok: violations.length === 0,
    violations,
    warnings,
    coverage,
    repairAddendum: violations.length > 0
      ? buildNarrationGroundingRepairAddendum(violations, {
          evidenceLedger: packet.evidenceLedger ?? [],
          packet,
          forbiddenTerms: [
            ...packet.forbiddenActorNames,
            ...packet.forbiddenFactMarkers,
            ...packet.forbiddenPrivateTerms,
          ],
        })
      : null,
  };
}

function formatAllowedEvidenceForRepair(
  entry: NarratorPacketEvidence,
  forbiddenTerms: readonly string[],
): string {
  const summary = sanitizeRepairText(entry.summary, forbiddenTerms);
  return `- ${entry.id} [category=${entry.category}] summary=${summary || "(empty summary)"}`;
}

function collectNarratorPacketForbiddenTerms(packet: NarratorPacket): string[] {
  return [
    ...packet.forbiddenActorNames,
    ...packet.forbiddenFactMarkers,
    ...packet.forbiddenPrivateTerms,
  ];
}

function isPlayerActionEvidenceEntry(
  entry: NarratorPacketEvidence,
  packet?: Pick<NarratorPacket, "anchorEvent">,
): boolean {
  if (entry.sourceId && packet?.anchorEvent?.id && entry.sourceId === packet.anchorEvent.id) {
    return true;
  }

  return /^\s*player action request\s*:/iu.test(entry.summary);
}

function formatGroundingViolationDetails(
  violation: GroundingGuardViolation,
): string {
  const details = [
    violation.claimKind ? `claimKind=${violation.claimKind}` : null,
    violation.evidenceRefs ? `evidenceRefCount=${violation.evidenceRefs.length}` : null,
    violation.missingEvidenceRefs
      ? `missingEvidenceRefCount=${violation.missingEvidenceRefs.length}`
      : null,
    violation.requiredEvidenceCategories?.length
      ? `requiredEvidenceCategories=${violation.requiredEvidenceCategories.join(",")}`
      : null,
    typeof violation.coveredWordCount === "number" && typeof violation.proseWordCount === "number"
      ? `coveredWords=${violation.coveredWordCount}/${violation.proseWordCount}`
      : null,
  ].filter((detail): detail is string => Boolean(detail));

  return details.length > 0 ? `; ${details.join("; ")}` : "";
}

function sanitizeRepairText(
  value: string,
  forbiddenTerms: readonly string[],
): string {
  let sanitized = value.replace(/\s+/gu, " ").trim();
  for (const term of forbiddenTerms) {
    const trimmed = term.trim();
    if (!trimmed) {
      continue;
    }
    sanitized = replaceLiteralCaseInsensitive(
      sanitized,
      trimmed,
      "[private term omitted]",
    );
  }
  return sanitized;
}

function replaceLiteralCaseInsensitive(
  value: string,
  search: string,
  replacement: string,
): string {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedSearch = search.toLocaleLowerCase();
  let cursor = 0;
  let result = "";

  while (cursor < value.length) {
    const matchIndex = normalizedValue.indexOf(normalizedSearch, cursor);
    if (matchIndex < 0) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, matchIndex);
    result += replacement;
    cursor = matchIndex + search.length;
  }

  return result;
}

function buildEvidenceById(
  evidenceLedger: readonly NarratorPacketEvidence[],
): ReadonlyMap<string, NarratorPacketEvidence> {
  return new Map(evidenceLedger.map((entry) => [entry.id, entry]));
}

function normalizeGroundedSentenceText(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}

function assertGroundedSentenceTextIsVisibleProse(text: string, index: number): void {
  if (/[\r\n]/u.test(text)) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} must be one visible prose sentence.`);
  }
  if (/```|^\s{0,3}#{1,6}\s|\[[^\]]+\]\([^)]+\)/u.test(text)) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} contains markdown.`);
  }
  if (
    /default_api\.|\b(?:offer_quick_actions|set_condition|log_event|record_dialogue_outcome|record_world_fact|list_visible_affordances|list_navigation_options|find_location_candidates|find_object_candidates|find_actor_candidates|find_poi_candidates|inspect_known_fact|check_route|spawn_npc|promote_npc|spawn_item|reveal_location|set_relationship|add_chronicle_entry|add_tag|remove_tag|transfer_item|move_to|move_actor|create_minor_poi|create_scene_extra|start_search|record_player_intent)\s*\(/iu.test(text)
  ) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} contains tool syntax.`);
  }
  if (
    /\b(?:offer_quick_actions|set_condition|log_event|record_dialogue_outcome|record_world_fact|list_visible_affordances|list_navigation_options|find_location_candidates|find_object_candidates|find_actor_candidates|find_poi_candidates|inspect_known_fact|check_route|spawn_npc|promote_npc|spawn_item|reveal_location|set_relationship|add_chronicle_entry|add_tag|remove_tag|transfer_item|move_to|move_actor|create_minor_poi|create_scene_extra|start_search|record_player_intent|NarrationDraft|GroundedSentenceDraft|backend|runtime)\b|(?:player_action_request|perceivable_effect|perceivable_response|committed_event|anchor_event|tool_result|visible_actor|current_inventory_status|control_return|guardrail):|action-result:|\b(?:tool|actor|kind)=|find-location|sweep returns|legal target|visible affordance/iu.test(text)
  ) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} contains backend metadata.`);
  }
}

function uniqueEvidenceRefs(refs: readonly string[]): string[] {
  const unique: string[] = [];
  for (const ref of refs) {
    const trimmed = ref.trim();
    if (!trimmed) {
      continue;
    }
    if (!unique.includes(trimmed)) {
      unique.push(trimmed);
    }
  }
  return unique;
}

function inferBackendClaimSupport(entry: NarratorPacketEvidence): NarrationClaimKind[] {
  const explicitSupport = (entry.claimSupport ?? [])
    .map((kind) => narrationClaimKindSchema.safeParse(kind))
    .filter((result): result is { success: true; data: NarrationClaimKind } => result.success)
    .map((result) => result.data);
  if (explicitSupport.length > 0) {
    return [...new Set(explicitSupport)];
  }

  switch (entry.category) {
    case "current_inventory_status":
      return ["inventory_status"];
    case "oracle_outcome":
      return ["oracle_outcome"];
    case "visible_actor":
      return ["actor_presence", "playable_beat"];
    case "hint_signal":
    case "world_thread_signal":
      return ["future_pressure"];
    case "committed_event":
    case "perceivable_effect":
    case "perceivable_response":
    case "tool_result":
      return ["playable_beat"];
    default:
      return [];
  }
}

function resolveGroundedSentenceClaimKind(args: {
  sentenceIndex: number;
  evidenceRefs: readonly string[];
  allowedEvidenceById: ReadonlyMap<string, NarratorPacketEvidence>;
}): NarrationClaimKind {
  if (args.evidenceRefs.length === 0) {
    throw new Error(`GroundedSentenceDraft sentence ${args.sentenceIndex + 1} must cite packet evidence.`);
  }
  const supportedKinds = new Set<NarrationClaimKind>();
  for (const ref of args.evidenceRefs) {
    const entry = args.allowedEvidenceById.get(ref);
    if (!entry) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} cites unknown or disallowed evidence ref: ${ref}`,
      );
    }
    for (const kind of inferBackendClaimSupport(entry)) {
      supportedKinds.add(kind);
    }
  }

  for (const kind of CLAIM_KIND_PRIORITY) {
    if (supportedKinds.has(kind)) {
      return kind;
    }
  }

  throw new Error(
    `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} cites evidence with no supported narration claim kind.`,
  );
}

function buildClaimById(
  claims: readonly NarrationClaim[],
): ReadonlyMap<string, NarrationClaim> {
  return new Map(claims.map((claim) => [claim.id, claim]));
}

function categoriesFromLedger(
  evidenceLedger: readonly NarratorPacketEvidence[],
): NarratorPacketEvidenceCategory[] {
  const categories = new Set<NarratorPacketEvidenceCategory>();
  for (const entry of evidenceLedger) {
    categories.add(entry.category);
  }
  return [...categories];
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

function countCoveredClaimSpanWords(draft: NarrationDraft): number {
  return draft.claimSpans
    .filter((span) => span.spanText.trim().length > 0 && draft.prose.includes(span.spanText))
    .reduce((total, span) => total + countWords(span.spanText), 0);
}
