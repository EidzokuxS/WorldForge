import type {
  NarratorPacket,
  NarratorPacketEvidence,
  NarratorPacketEvidenceCategory,
  NarratorPacketPrecisionFact,
} from "./narrator-packet.js";
import { z } from "zod";
import { sanitizeModelFacingText } from "./model-facing-ref-safety.js";

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
export const GROUNDED_SENTENCE_DRAFT_FACT_REF_MAX = 1;

const groundedSentenceEvidenceRefSchema = z
  .string()
  .min(1)
  .max(160)
  .describe("Short packet evidence ref copied from the allowed evidence list.");

const groundedSentenceBackendFactRefSchema = z
  .string()
  .min(1)
  .max(80)
  .describe("Short backend-owned fact ref copied from backendFacts, such as e1.s1 or e1.p1.");

const groundedSentenceSchema = z.object({
  text: z
    .string()
    .min(1)
    .max(GROUNDED_SENTENCE_DRAFT_TEXT_MAX_LENGTH)
    .describe("Player-visible narrative prose for this sentence. Use cited evidenceRefs for grounding.")
    .optional(),
  factRefs: z
    .array(groundedSentenceBackendFactRefSchema)
    .min(1)
    .max(GROUNDED_SENTENCE_DRAFT_FACT_REF_MAX)
    .optional()
    .describe("Legacy exact fact selector. Normal final narration should use text plus evidenceRefs."),
  evidenceRefs: z
    .array(groundedSentenceEvidenceRefSchema)
    .min(GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MIN)
    .max(GROUNDED_SENTENCE_DRAFT_EVIDENCE_REF_MAX)
    .describe("Hard cap: one to four short packet evidence refs supporting this sentence; never return five or more evidenceRefs."),
}).strict().superRefine((data, ctx) => {
  const hasText = typeof data.text === "string" && Boolean(data.text.trim());
  const hasFactRefs = Array.isArray(data.factRefs) && data.factRefs.length > 0;
  if (hasText === hasFactRefs) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["factRefs"],
      message: "Each sentence must include exactly one of text or factRefs.",
    });
  }
});

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

export interface NarrationCitationEvidenceRef {
  refId: string;
  evidence: NarratorPacketEvidence;
}

export type GroundingGuardViolationKind =
  | "empty_prose"
  | "missing_claim_spans"
  | "insufficient_claim_span_coverage"
  | "unsupported_claim"
  | "unknown_evidence_ref"
  | "disallowed_evidence_ref"
  | "missing_observation_ref"
  | "observation_claim_mismatch"
  | "precision_fact_drift"
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
  precisionFactKind?: string;
  unsupportedPrecisionTokens?: string[];
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
    case "tool_result":
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
  const forbiddenTerms = collectNarratorPacketForbiddenTerms(packet);
  return (packet.evidenceLedger ?? []).filter((entry) =>
    isNarrationDraftCitationEvidence(entry, packet)
      && evidenceHasBackendFacts(entry, forbiddenTerms),
  );
}

export function getAllowedNarrationCitationEvidenceRefs(
  packet: NarratorPacket,
): NarrationCitationEvidenceRef[] {
  return getAllowedNarrationCitationEvidence(packet).map((evidence, index) => ({
    refId: `e${index + 1}`,
    evidence,
  }));
}

function buildAllowedCitationEvidenceById(
  packet: NarratorPacket,
): ReadonlyMap<string, NarratorPacketEvidence> {
  return buildEvidenceById(getAllowedNarrationCitationEvidence(packet));
}

function buildAllowedCitationEvidenceByRef(
  packet: NarratorPacket,
): ReadonlyMap<string, NarratorPacketEvidence> {
  const refs = new Map<string, NarratorPacketEvidence>();
  for (const { refId, evidence } of getAllowedNarrationCitationEvidenceRefs(packet)) {
    refs.set(refId, evidence);
  }
  return refs;
}

function packetRequiresObservationEvidence(packet: NarratorPacket): boolean {
  return packet.canonicalTurnPacket.turnResolution?.resolutionState === "observation_grounded"
    && (packet.evidenceLedger ?? []).some((entry) => entry.category === "observation_result");
}

function claimNeedsObservationEvidence(claim: NarrationClaim): boolean {
  return claim.requiresEvidence
    && claim.kind !== "inventory_status"
    && claim.kind !== "inventory_status_change"
    && claim.kind !== "oracle_outcome";
}

export function compileGroundedSentenceDraftToNarrationDraft(args: {
  packet: NarratorPacket;
  draft: unknown;
  requireBackendOwnedFactText?: boolean;
  requireFactRefs?: boolean;
}): NarrationDraft {
  const draft = groundedSentenceDraftSchema.parse(args.draft);
  const allowedEvidenceByRef = buildAllowedCitationEvidenceByRef(args.packet);
  const allowedEvidenceById = buildAllowedCitationEvidenceById(args.packet);
  const allowedBackendFactsByRef = buildAllowedBackendFactsByRef(args.packet);
  const seenFactRefs = new Set<string>();
  const seenSentenceTexts = new Set<string>();
  const normalizedSentences: Array<{
    text: string;
    kind: NarrationClaimKind;
    evidenceRefs: string[];
  }> = [];
  draft.sentences.forEach((sentence, index) => {
    if (args.requireFactRefs && !sentence.factRefs) {
      throw new Error(
        `Live GroundedSentenceDraft sentence ${index + 1} must use factRefs; sentences[].text is legacy-only.`,
      );
    }
    const evidenceRefs = resolveGroundedSentenceEvidenceRefs(
      sentence.evidenceRefs,
      allowedEvidenceByRef,
      allowedBackendFactsByRef,
      index,
    );
    const expanded = sentence.factRefs
      ? expandGroundedSentenceFactRefs({
          factRefs: sentence.factRefs,
          canonicalEvidenceRefs: evidenceRefs,
          allowedBackendFactsByRef,
          sentenceIndex: index,
        })
      : expandGroundedSentenceBackendFacts({
          text: sentence.text ?? "",
          canonicalEvidenceRefs: evidenceRefs,
          allowedBackendFactsByRef,
          sentenceIndex: index,
        });
    if (args.requireBackendOwnedFactText && !sentence.factRefs) {
      assertBackendOwnedFactSkeleton({
        outsidePlaceholderText: expanded.outsidePlaceholderText,
        usedFactRefs: expanded.usedFactRefs,
        sentenceIndex: index,
      });
    }
    for (const factRef of expanded.usedFactRefs) {
      if (seenFactRefs.has(factRef)) {
        throw new Error(
          `GroundedSentenceDraft sentence ${index + 1} repeats backend fact ref already used earlier: ${factRef}`,
        );
      }
      seenFactRefs.add(factRef);
    }
    const text = normalizeGroundedSentenceText(expanded.text);
    if (!text) {
      throw new Error(`GroundedSentenceDraft sentence ${index + 1} is empty.`);
    }
    if (seenSentenceTexts.has(text)) {
      return;
    }
    seenSentenceTexts.add(text);
    assertGroundedSentenceTextIsVisibleProse(text, index);
    assertGroundedSentencePrecisionTextSupported({
      text,
      evidenceRefs,
      allowedEvidenceById,
      sentenceIndex: index,
    });
    const kind = resolveGroundedSentenceClaimKind({
      sentenceIndex: index,
      evidenceRefs,
      allowedEvidenceById,
    });
    normalizedSentences.push({
      text,
      kind,
      evidenceRefs,
    });
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
  const requiresObservationEvidence = packetRequiresObservationEvidence(args.packet);
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
    if (
      requiresObservationEvidence
      && claimNeedsObservationEvidence(claim)
      && claim.evidenceRefs.every((ref) => evidenceById.get(ref)?.category !== "observation_result")
    ) {
      violations.push({
        kind: "missing_observation_ref",
        claimId: claim.id,
        claimKind: claim.kind,
        evidenceRefs: claim.evidenceRefs,
        requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
      });
    }
    if (requiresObservationEvidence && claimNeedsObservationEvidence(claim)) {
      const citedObservationEvidence = claim.evidenceRefs
        .map((ref) => evidenceById.get(ref))
        .filter((entry): entry is NarratorPacketEvidence =>
          entry !== undefined && entry.category === "observation_result"
        );
      if (
        citedObservationEvidence.length > 0
        && citedObservationEvidence.every((entry) =>
          !inferBackendClaimSupport(entry).includes(claim.kind)
        )
      ) {
        violations.push({
          kind: "observation_claim_mismatch",
          claimId: claim.id,
          claimKind: claim.kind,
          evidenceRefs: claim.evidenceRefs,
          requiredEvidenceCategories: categoriesFromLedger(args.packet.evidenceLedger ?? []),
        });
      }
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

  for (const span of args.draft.claimSpans) {
    if (!span.requiresEvidence) {
      continue;
    }
    const evidenceRefs = Array.from(new Set(span.claimIds
      .map((claimId) => claimById.get(claimId))
      .filter((claim): claim is NarrationClaim => Boolean(claim))
      .flatMap((claim) => claim.evidenceRefs)));
    const drift = detectPrecisionFactDriftForText({
      text: span.spanText,
      evidenceRefs,
      allowedEvidenceById,
    });
    if (drift) {
      violations.push({
        kind: "precision_fact_drift",
        spanId: span.id,
        evidenceRefs,
        precisionFactKind: drift.precisionFactKind,
        unsupportedPrecisionTokens: drift.unsupportedTokens,
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
  };
}

export function formatAllowedCitationEvidenceRef(
  ref: NarrationCitationEvidenceRef,
  forbiddenTerms: readonly string[],
): string {
  const summary = sanitizeRepairText(ref.evidence.summary, forbiddenTerms);
  const summaryBackendFact = evidenceSummaryContributesBackendFact(ref.evidence)
    ? safeBackendFactText(ref.evidence.summary, forbiddenTerms)
    : null;
  const backendFacts = summaryBackendFact
    ? [`${ref.refId}.s1 summary: ${summaryBackendFact}`]
    : [];
  const precisionFacts = (ref.evidence.precisionFacts ?? [])
    .map((fact, index) => {
      const value = sanitizeRepairText(fact.value, forbiddenTerms);
      if (!value) return null;
      const polarity = fact.polarity ? `/${fact.polarity}` : "";
      if (!precisionFactContributesBackendFact(fact)) {
        return `supportOnly ${fact.kind}${polarity}: ${value}`;
      }
      const backendValue = safeBackendFactText(fact.value, forbiddenTerms);
      return backendValue
        ? `${ref.refId}.p${index + 1} ${fact.kind}${polarity}: ${backendValue}`
        : null;
    })
    .filter((fact): fact is string => Boolean(fact));
  backendFacts.push(...precisionFacts.filter((fact) => fact.startsWith(`${ref.refId}.p`)));
  const precisionSuffix = precisionFacts.length > 0
    ? ` precisionFacts=${precisionFacts.join(" | ")}`
    : "";
  const backendFactSuffix = backendFacts.length > 0
    ? ` backendFacts=${backendFacts.join(" | ")}`
    : "";
  return `- ${ref.refId} [category=${ref.evidence.category}] summary=${summary || "(empty summary)"}${precisionSuffix}${backendFactSuffix}`;
}

function collectNarratorPacketForbiddenTerms(packet: NarratorPacket): string[] {
  return [
    ...packet.forbiddenActorNames,
    ...packet.forbiddenFactMarkers,
    ...packet.forbiddenPrivateTerms,
  ];
}

const TOOL_SYNTAX_TERMS = [
  "offer_quick_actions",
  "set_condition",
  "log_event",
  "record_dialogue_outcome",
  "record_world_fact",
  "list_visible_affordances",
  "list_navigation_options",
  "find_location_candidates",
  "find_object_candidates",
  "find_actor_candidates",
  "find_poi_candidates",
  "inspect_known_fact",
  "check_route",
  "spawn_npc",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "set_relationship",
  "add_chronicle_entry",
  "add_tag",
  "remove_tag",
  "transfer_item",
  "move_to",
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "start_search",
  "record_player_intent",
] as const;

const BACKEND_METADATA_WORDS = [
  ...TOOL_SYNTAX_TERMS,
  "NarrationDraft",
  "GroundedSentenceDraft",
  "backend",
  "runtime",
] as const;

const BACKEND_METADATA_MARKERS = [
  "player_action_request:",
  "perceivable_effect:",
  "perceivable_response:",
  "observation_result:",
  "committed_event:",
  "anchor_event:",
  "tool_result:",
  "visible_actor:",
  "current_inventory_status:",
  "control_return:",
  "guardrail:",
  "action-result:",
  "tool=",
  "actor=",
  "kind=",
  "find-location",
  "sweep returns",
  "legal target",
  "visible affordance",
] as const;

function isWhitespace(char: string): boolean {
  return char.length > 0 && char.trim() === "";
}

function collapseWhitespace(value: string): string {
  let compacted = "";
  let pendingSpace = false;

  for (const char of value.trim()) {
    if (isWhitespace(char)) {
      pendingSpace = compacted.length > 0;
      continue;
    }
    if (pendingSpace) {
      compacted += " ";
      pendingSpace = false;
    }
    compacted += char;
  }

  return compacted;
}

function isAsciiWordChar(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122)
    || char === "_";
}

function containsCaseInsensitive(value: string, search: string): boolean {
  return value.toLocaleLowerCase().includes(search.toLocaleLowerCase());
}

function containsCaseInsensitiveWord(value: string, search: string): boolean {
  const lowerValue = value.toLocaleLowerCase();
  const lowerSearch = search.toLocaleLowerCase();
  let cursor = 0;

  while (cursor < lowerValue.length) {
    const index = lowerValue.indexOf(lowerSearch, cursor);
    if (index < 0) return false;
    const before = lowerValue[index - 1];
    const after = lowerValue[index + lowerSearch.length];
    if (!isAsciiWordChar(before) && !isAsciiWordChar(after)) {
      return true;
    }
    cursor = index + lowerSearch.length;
  }

  return false;
}

function nextNonWhitespaceChar(value: string, startIndex: number): string | null {
  for (let index = startIndex; index < value.length; index += 1) {
    if (!isWhitespace(value[index])) {
      return value[index];
    }
  }
  return null;
}

function isPlayerActionEvidenceEntry(
  entry: NarratorPacketEvidence,
  packet?: Pick<NarratorPacket, "anchorEvent">,
): boolean {
  if (entry.sourceId && packet?.anchorEvent?.id && entry.sourceId === packet.anchorEvent.id) {
    return true;
  }

  const trimmed = entry.summary.trimStart().toLocaleLowerCase();
  if (!trimmed.startsWith("player action request")) return false;
  return nextNonWhitespaceChar(trimmed, "player action request".length) === ":";
}

function sanitizeRepairText(
  value: string,
  forbiddenTerms: readonly string[],
): string {
  let sanitized = collapseWhitespace(sanitizeModelFacingText(value));
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

function safeBackendFactText(
  value: string,
  forbiddenTerms: readonly string[],
): string | null {
  const raw = collapseWhitespace(value);
  if (!raw) return null;
  const sanitized = sanitizeRepairText(raw, forbiddenTerms);
  if (sanitized !== raw) return null;
  if (containsBackendMetadata(sanitized)) return null;
  if (containsCaseInsensitive(sanitized, "[private term omitted]")) return null;
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

interface AllowedBackendFactRef {
  evidenceId: string;
  value: string;
}

function precisionFactContributesBackendFact(fact: NarratorPacketPrecisionFact): boolean {
  return fact.kind === "quote"
    || fact.kind === "claim"
    || fact.kind === "summary"
    || fact.kind === "scene_status"
    || fact.kind === "movement_time_beat";
}

function evidenceSummaryContributesBackendFact(evidence: NarratorPacketEvidence): boolean {
  if (evidence.summaryBackendFact === false) return false;
  if (evidence.category === "visible_actor") {
    return evidence.summaryBackendFact === true;
  }
  if (
    evidence.category === "current_inventory_status"
    || evidence.category === "scene_status"
    || evidence.category === "movement_time_beat"
  ) {
    return evidence.summaryBackendFact === true;
  }
  return evidence.category !== "tool_result";
}

function evidenceHasBackendFacts(
  evidence: NarratorPacketEvidence,
  forbiddenTerms: readonly string[],
): boolean {
  if (
    evidenceSummaryContributesBackendFact(evidence)
    && safeBackendFactText(evidence.summary, forbiddenTerms)
  ) {
    return true;
  }
  return (evidence.precisionFacts ?? []).some((fact) =>
    precisionFactContributesBackendFact(fact)
      && Boolean(safeBackendFactText(fact.value, forbiddenTerms)),
  );
}

function buildAllowedBackendFactsByRef(
  packet: NarratorPacket,
): ReadonlyMap<string, AllowedBackendFactRef> {
  const refs = new Map<string, AllowedBackendFactRef>();
  const forbiddenTerms = collectNarratorPacketForbiddenTerms(packet);
  for (const { refId, evidence } of getAllowedNarrationCitationEvidenceRefs(packet)) {
    const summary = safeBackendFactText(evidence.summary, forbiddenTerms);
    if (summary && evidenceSummaryContributesBackendFact(evidence)) {
      refs.set(`${refId}.s1`, {
        evidenceId: evidence.id,
        value: summary,
      });
    }
    (evidence.precisionFacts ?? []).forEach((fact, index) => {
      if (!precisionFactContributesBackendFact(fact)) return;
      const value = safeBackendFactText(fact.value, forbiddenTerms);
      if (!value) return;
      refs.set(`${refId}.p${index + 1}`, {
        evidenceId: evidence.id,
        value,
      });
    });
  }
  return refs;
}

const BACKEND_FACT_PLACEHOLDER_PREFIX = "[[fact:";
const BACKEND_FACT_PLACEHOLDER_SUFFIX = "]]";
const BACKEND_FACT_CONNECTOR_WORDS = new Set([
  "a",
  "also",
  "and",
  "as",
  "at",
  "but",
  "by",
  "for",
  "from",
  "in",
  "meanwhile",
  "now",
  "of",
  "on",
  "or",
  "so",
  "still",
  "then",
  "the",
  "to",
  "while",
  "with",
]);

interface BackendFactExpansion {
  text: string;
  usedFactRefs: string[];
  outsidePlaceholderText: string;
}

function expandGroundedSentenceBackendFacts(args: {
  text: string;
  canonicalEvidenceRefs: readonly string[];
  allowedBackendFactsByRef: ReadonlyMap<string, AllowedBackendFactRef>;
  sentenceIndex: number;
}): BackendFactExpansion {
  const citedEvidenceIds = new Set(args.canonicalEvidenceRefs);
  let cursor = 0;
  let expanded = "";
  let outsidePlaceholderText = "";
  const usedFactRefs: string[] = [];

  while (cursor < args.text.length) {
    const start = args.text.indexOf(BACKEND_FACT_PLACEHOLDER_PREFIX, cursor);
    if (start < 0) {
      expanded += args.text.slice(cursor);
      outsidePlaceholderText += args.text.slice(cursor);
      break;
    }

    expanded += args.text.slice(cursor, start);
    outsidePlaceholderText += args.text.slice(cursor, start);
    const valueStart = start + BACKEND_FACT_PLACEHOLDER_PREFIX.length;
    const end = args.text.indexOf(BACKEND_FACT_PLACEHOLDER_SUFFIX, valueStart);
    if (end < 0) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} has an unterminated backend fact placeholder.`,
      );
    }

    const factRef = args.text.slice(valueStart, end).trim();
    const backendFact = args.allowedBackendFactsByRef.get(factRef);
    if (!backendFact) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} cites unknown backend fact placeholder: ${factRef}`,
      );
    }
    if (!citedEvidenceIds.has(backendFact.evidenceId)) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} cites backend fact ${factRef} without citing its packet evidence ref.`,
      );
    }

    usedFactRefs.push(factRef);
    expanded += backendFact.value;
    cursor = end + BACKEND_FACT_PLACEHOLDER_SUFFIX.length;
  }

  return { text: expanded, usedFactRefs, outsidePlaceholderText };
}

function expandGroundedSentenceFactRefs(args: {
  factRefs: readonly string[];
  canonicalEvidenceRefs: readonly string[];
  allowedBackendFactsByRef: ReadonlyMap<string, AllowedBackendFactRef>;
  sentenceIndex: number;
}): BackendFactExpansion {
  const citedEvidenceIds = new Set(args.canonicalEvidenceRefs);
  const usedFactRefs = new Set<string>();
  const textParts: string[] = [];

  for (const rawFactRef of args.factRefs) {
    const factRef = collapseWhitespace(rawFactRef);
    const backendFact = args.allowedBackendFactsByRef.get(factRef);
    if (!backendFact) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} cites unknown backend fact ref: ${factRef}`,
      );
    }
    if (!citedEvidenceIds.has(backendFact.evidenceId)) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} cites backend fact ${factRef} without citing its packet evidence ref.`,
      );
    }
    if (usedFactRefs.has(factRef)) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} repeats backend fact ref: ${factRef}`,
      );
    }
    usedFactRefs.add(factRef);
    textParts.push(backendFact.value);
  }

  return {
    text: textParts.map((part) => collapseWhitespace(part)).filter(Boolean).join(" "),
    usedFactRefs: [...usedFactRefs],
    outsidePlaceholderText: "",
  };
}

function isConnectorWordChar(char: string): boolean {
  const lower = char.toLowerCase();
  const upper = char.toUpperCase();
  return lower !== upper || (char >= "0" && char <= "9");
}

function isBackendFactSkeletonPunctuation(char: string): boolean {
  return char === " "
    || char === "\t"
    || char === "\n"
    || char === "\r"
    || char === "."
    || char === ","
    || char === ";"
    || char === ":"
    || char === "!"
    || char === "?"
    || char === "-"
    || char === "("
    || char === ")"
    || char === "["
    || char === "]"
    || char === "'"
    || char === '"';
}

function assertBackendOwnedFactSkeleton(args: {
  outsidePlaceholderText: string;
  usedFactRefs: readonly string[];
  sentenceIndex: number;
}): void {
  if (args.usedFactRefs.length === 0) {
    throw new Error(
      `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} must include at least one backend-owned fact placeholder.`,
    );
  }

  let cursor = 0;
  while (cursor < args.outsidePlaceholderText.length) {
    const char = args.outsidePlaceholderText[cursor]!;
    if (isConnectorWordChar(char)) {
      let end = cursor + 1;
      while (
        end < args.outsidePlaceholderText.length
        && isConnectorWordChar(args.outsidePlaceholderText[end]!)
      ) {
        end += 1;
      }
      const word = args.outsidePlaceholderText.slice(cursor, end).toLowerCase();
      if (!BACKEND_FACT_CONNECTOR_WORDS.has(word)) {
        throw new Error(
          `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} has factual text outside backend-owned fact placeholders: ${word}`,
        );
      }
      cursor = end;
      continue;
    }

    if (!isBackendFactSkeletonPunctuation(char)) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} has unsupported text outside backend-owned fact placeholders.`,
      );
    }
    cursor += 1;
  }
}

function normalizeGroundedSentenceText(text: string): string {
  let normalized = collapseWhitespace(text);
  const replacements: Array<[string, string]> = [
    [". and ", ". "],
    ["! and ", "! "],
    ["? and ", "? "],
    ["., and ", ". "],
    ["!, and ", "! "],
    ["?, and ", "? "],
    [". then ", ". "],
    ["! then ", "! "],
    ["? then ", "? "],
    ["., then ", ". "],
    ["!, then ", "! "],
    ["?, then ", "? "],
    ["., while ", ". "],
    ["!, while ", "! "],
    ["?, while ", "? "],
    ["., but ", ". "],
    ["!, but ", "! "],
    ["?, but ", "? "],
    ["..", "."],
    ["?.", "?"],
    ["!.", "!"],
    [".\".", ".\""],
    ["?\".", "?\""],
    ["!\".", "!\""],
  ];
  for (const [search, replacement] of replacements) {
    while (normalized.includes(search)) {
      normalized = normalized.split(search).join(replacement);
    }
  }
  return normalized;
}

function assertGroundedSentencePrecisionTextSupported(args: {
  text: string;
  evidenceRefs: readonly string[];
  allowedEvidenceById: ReadonlyMap<string, NarratorPacketEvidence>;
  sentenceIndex: number;
}): void {
  const drift = detectPrecisionFactDriftForText({
    text: args.text,
    evidenceRefs: args.evidenceRefs,
    allowedEvidenceById: args.allowedEvidenceById,
  });
  if (drift) {
    throw new Error(
      `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} contains precision_fact_drift: ${drift.unsupportedTokens.slice(0, 4).join(", ")}.`,
    );
  }

  const citedEvidence = args.evidenceRefs
    .map((ref) => args.allowedEvidenceById.get(ref))
    .filter((entry): entry is NarratorPacketEvidence => Boolean(entry));
  const citedSupportText = collapseWhitespace(
    citedEvidence
      .map((entry) => [entry.summary, ...(entry.precisionFacts ?? []).map((fact) => fact.value)].join(" "))
      .join(" "),
  );

  for (const span of extractQuotedSpans(args.text)) {
    if (!quotedSpanNeedsPrecisionSupport(span)) {
      continue;
    }
    if (precisionSpanSupportedByEvidence(span, citedSupportText)) {
      continue;
    }

    throw new Error(
      `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} contains quoted precision text not supported by its cited packet evidence.`,
    );
  }

  const highPrecisionEvidenceText = collapseWhitespace(
    citedEvidence
      .filter(evidenceRequiresPrecisionTokenSupport)
      .map((entry) =>
        [entry.summary, ...(entry.precisionFacts ?? []).map((fact) => fact.value)].join(" "))
      .join(" "),
  );
  if (highPrecisionEvidenceText.length > 0) {
    const unsupportedPrecisionTokens = collectUnsupportedPrecisionTokens({
      text: args.text,
      evidenceText: highPrecisionEvidenceText,
    });
    if (unsupportedPrecisionTokens.length > 0) {
      throw new Error(
        `GroundedSentenceDraft sentence ${args.sentenceIndex + 1} contains precision tokens not supported by its cited packet evidence: ${unsupportedPrecisionTokens.slice(0, 4).join(", ")}.`,
      );
    }
  }
}

function evidenceRequiresPrecisionTokenSupport(evidence: NarratorPacketEvidence): boolean {
  const summary = evidence.summary;
  return (evidence.precisionFacts?.length ?? 0) > 0
    || summary.includes("Claims:")
    || summary.includes("Quote:")
    || summary.includes("Dialogue outcome:")
    || summary.includes("World fact:");
}

const PRECISION_FACT_WEAK_TOKENS = new Set([
  "answer",
  "answers",
  "asked",
  "asks",
  "bring",
  "concrete",
  "detail",
  "details",
  "exact",
  "gives",
  "says",
  "tells",
]);

const PRECISION_TIME_DETAIL_TOKENS = new Set([
  "afternoon",
  "ago",
  "already",
  "before",
  "bell",
  "bells",
  "desk",
  "early-to-mid",
  "hour",
  "hours",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
  "passed",
  "pass",
  "rung",
  "ring",
  "today",
]);

const PRECISION_TIME_ANCHOR_TOKENS = new Set([
  "bell",
  "bells",
  "desk",
  "passed",
  "pass",
  "rung",
  "ring",
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
]);

const PRECISION_NEGATION_TOKENS = new Set([
  "not",
  "yet",
  "hasn't",
  "hasnt",
  "haven't",
  "havent",
  "no",
]);

const PRECISION_ROUTE_DETAIL_TOKENS = new Set([
  "alcove",
  "aqueduct",
  "arch",
  "arches",
  "archway",
  "catwalk",
  "causeway",
  "central",
  "channel",
  "cistern",
  "door",
  "east",
  "eastern",
  "grate",
  "grated",
  "grates",
  "maintenance",
  "north",
  "northern",
  "outer",
  "registry",
  "route",
  "sheltered",
  "shelter",
  "south",
  "southern",
  "span",
  "stone",
  "trough",
  "troughs",
  "tribunal",
  "walk",
  "wall",
  "west",
  "western",
  "wing",
]);

const PRECISION_REQUIREMENT_DETAIL_TOKENS = new Set([
  "bond-witness",
  "concord",
  "matter",
  "office",
  "officer",
  "petition",
  "petitioner",
  "phrase",
  "phrasing",
  "provincial",
  "registry",
  "requests",
  "seal",
  "standing",
  "station",
  "tripoint",
  "tribunal",
  "wing",
  "wording",
]);

interface PrecisionFactDriftResult {
  precisionFactKind: string;
  unsupportedTokens: string[];
}

interface PrecisionModes {
  time: boolean;
  route: boolean;
  requirement: boolean;
}

function detectPrecisionFactDriftForText(args: {
  text: string;
  evidenceRefs: readonly string[];
  allowedEvidenceById: ReadonlyMap<string, NarratorPacketEvidence>;
}): PrecisionFactDriftResult | null {
  const citedFacts = args.evidenceRefs
    .map((ref) => args.allowedEvidenceById.get(ref))
    .filter((entry): entry is NarratorPacketEvidence => Boolean(entry))
    .flatMap((entry) => entry.precisionFacts ?? []);
  if (citedFacts.length === 0) {
    return null;
  }

  const textEntries = precisionTokenEntries(args.text);
  const textTokens = new Set(textEntries.map((entry) => entry.value));
  const relevantFacts = citedFacts.filter((fact) =>
    precisionFactIsRelevantToText(fact, textTokens));
  if (relevantFacts.length === 0) {
    return null;
  }

  const modes = activePrecisionModes(textTokens, relevantFacts);
  const allowedTokens = precisionFactAllowedTokenSet(relevantFacts);
  const unsupportedTokens: string[] = [];

  for (let index = 0; index < textEntries.length; index += 1) {
    const token = textEntries[index]!.value;
    if (!tokenRequiresPrecisionFactEvidence(token, modes)) {
      continue;
    }
    if (allowedTokens.has(token)) {
      continue;
    }
    if (!unsupportedTokens.includes(token)) {
      unsupportedTokens.push(token);
    }
  }

  const polarityMismatch = detectPrecisionPolarityMismatch(textTokens, relevantFacts);
  if (polarityMismatch) {
    for (const token of polarityMismatch) {
      if (!unsupportedTokens.includes(token)) {
        unsupportedTokens.push(token);
      }
    }
  }

  return unsupportedTokens.length > 0
    ? {
        precisionFactKind: relevantFacts.map((fact) => fact.kind).filter((value, index, array) =>
          array.indexOf(value) === index).join(","),
        unsupportedTokens,
      }
    : null;
}

function precisionFactIsRelevantToText(
  fact: NarratorPacketPrecisionFact,
  textTokens: ReadonlySet<string>,
): boolean {
  const factTokens = precisionTokens(fact.value);
  const strongOverlap = factTokens.filter((token) =>
    textTokens.has(token) && !PRECISION_FACT_WEAK_TOKENS.has(token)
  ).length;
  if (strongOverlap >= 2) {
    return true;
  }
  if (fact.claimKind === "route_status" && setIntersects(textTokens, PRECISION_ROUTE_DETAIL_TOKENS)) {
    return true;
  }
  if (
    (fact.claimKind === "requirement"
      || fact.claimKind === "document_status"
      || fact.claimKind === "office")
    && setIntersects(textTokens, PRECISION_REQUIREMENT_DETAIL_TOKENS)
  ) {
    return true;
  }
  return setIntersects(new Set(factTokens), PRECISION_TIME_DETAIL_TOKENS)
    && setIntersects(textTokens, PRECISION_TIME_DETAIL_TOKENS);
}

function activePrecisionModes(
  textTokens: ReadonlySet<string>,
  facts: readonly NarratorPacketPrecisionFact[],
): PrecisionModes {
  return {
    time: facts.some((fact) =>
      setIntersects(new Set(precisionTokens(fact.value)), PRECISION_TIME_DETAIL_TOKENS)
      && setIntersects(textTokens, PRECISION_TIME_DETAIL_TOKENS)),
    route: facts.some((fact) =>
      fact.claimKind === "route_status"
      || setIntersects(new Set(precisionTokens(fact.value)), PRECISION_ROUTE_DETAIL_TOKENS)),
    requirement: facts.some((fact) =>
      fact.claimKind === "requirement"
      || fact.claimKind === "document_status"
      || fact.claimKind === "office"
      || setIntersects(new Set(precisionTokens(fact.value)), PRECISION_REQUIREMENT_DETAIL_TOKENS)),
  };
}

function precisionFactAllowedTokenSet(
  facts: readonly NarratorPacketPrecisionFact[],
): Set<string> {
  const allowedTokens = new Set<string>();
  for (const fact of facts) {
    const tokens = precisionTokens(fact.value);
    for (const token of tokens) {
      allowedTokens.add(token);
    }
    addDerivedPrecisionSupportTokens(allowedTokens, tokens);
  }
  return allowedTokens;
}

function addDerivedPrecisionSupportTokens(
  allowedTokens: Set<string>,
  factTokens: readonly string[],
): void {
  const tokenSet = new Set(factTokens);
  if (
    setIntersects(tokenSet, new Set(["not", "yet", "hasn't", "hasnt", "haven't", "havent"]))
    && setIntersects(tokenSet, new Set(["passed", "pass", "rung", "ring"]))
    && tokenSet.has("bell")
  ) {
    allowedTokens.add("before");
  }
}

function detectPrecisionPolarityMismatch(
  textTokens: ReadonlySet<string>,
  facts: readonly NarratorPacketPrecisionFact[],
): string[] | null {
  const textHasNegation = setIntersects(textTokens, PRECISION_NEGATION_TOKENS);
  for (const fact of facts) {
    const factTokens = new Set(precisionTokens(fact.value));
    if (!setIntersects(factTokens, PRECISION_TIME_DETAIL_TOKENS)) {
      continue;
    }
    const sharedAnchors = [...PRECISION_TIME_ANCHOR_TOKENS]
      .filter((token) => textTokens.has(token) && factTokens.has(token));
    if (sharedAnchors.length < 2) {
      continue;
    }
    const factHasNegation = setIntersects(factTokens, PRECISION_NEGATION_TOKENS);
    if (factHasNegation !== textHasNegation) {
      return factHasNegation ? ["missing-negation"] : ["unsupported-negation"];
    }
  }
  return null;
}

function tokenRequiresPrecisionFactEvidence(
  token: string,
  modes: PrecisionModes,
): boolean {
  if (tokenRequiresPrecisionEvidence([{ value: token }], 0)) {
    return true;
  }
  if (modes.time && PRECISION_TIME_DETAIL_TOKENS.has(token)) {
    return true;
  }
  if (modes.route && PRECISION_ROUTE_DETAIL_TOKENS.has(token)) {
    return true;
  }
  return modes.requirement && PRECISION_REQUIREMENT_DETAIL_TOKENS.has(token);
}

function setIntersects<T>(
  values: ReadonlySet<T>,
  needles: ReadonlySet<T>,
): boolean {
  for (const needle of needles) {
    if (values.has(needle)) return true;
  }
  return false;
}

function extractQuotedSpans(text: string): string[] {
  const spans: string[] = [];
  let activeQuote: string | null = null;
  let activeStart = -1;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    const quoteKind = quoteDelimiterKind(char);
    if (!quoteKind) {
      continue;
    }

    if (!activeQuote) {
      activeQuote = quoteKind.close;
      activeStart = index + 1;
      continue;
    }

    if (char !== activeQuote) {
      continue;
    }

    const span = collapseWhitespace(text.slice(activeStart, index));
    if (span.length > 0) {
      spans.push(span);
    }
    activeQuote = null;
    activeStart = -1;
  }

  return spans;
}

function quoteDelimiterKind(char: string): { close: string } | null {
  switch (char) {
    case "\"":
      return { close: "\"" };
    case "'":
      return { close: "'" };
    case "“":
      return { close: "”" };
    case "‘":
      return { close: "’" };
    default:
      return null;
  }
}

const PRECISION_QUOTE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "if",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "with",
  "you",
  "your",
]);

function quotedSpanNeedsPrecisionSupport(span: string): boolean {
  return precisionTokens(span).length >= 2;
}

function precisionSpanSupportedByEvidence(span: string, evidenceText: string): boolean {
  const normalizedSpan = normalizePrecisionText(span);
  const normalizedEvidence = normalizePrecisionText(evidenceText);
  if (normalizedSpan.length > 0 && normalizedEvidence.includes(normalizedSpan)) {
    return true;
  }

  const evidenceTokens = new Set(precisionTokens(evidenceText));
  const spanTokens = precisionTokens(span);
  return spanTokens.length > 0 && spanTokens.every((token) => evidenceTokens.has(token));
}

function normalizePrecisionText(text: string): string {
  return precisionTokens(text).join(" ");
}

function precisionTokens(text: string): string[] {
  return precisionTokenEntries(text).map((entry) => entry.value);
}

interface PrecisionTokenEntry {
  value: string;
}

function precisionTokenEntries(text: string): PrecisionTokenEntry[] {
  const tokens: string[] = [];
  let token = "";

  for (const char of text) {
    if (isPrecisionTokenChar(char)) {
      token += char.toLocaleLowerCase();
      continue;
    }
    pushPrecisionToken(tokens, token);
    token = "";
  }
  pushPrecisionToken(tokens, token);
  return tokens.map((value) => ({ value }));
}

function pushPrecisionToken(tokens: string[], token: string): void {
  const trimmed = trimPrecisionToken(token);
  if (!trimmed || PRECISION_QUOTE_STOPWORDS.has(trimmed)) {
    return;
  }
  tokens.push(trimmed);
}

function trimPrecisionToken(token: string): string {
  let start = 0;
  let end = token.length;
  while (start < end && !isAlphaNumeric(token[start])) {
    start += 1;
  }
  while (end > start && !isAlphaNumeric(token[end - 1])) {
    end -= 1;
  }
  return token.slice(start, end);
}

function isPrecisionTokenChar(char: string): boolean {
  return isAlphaNumeric(char) || char === "-" || char === "'";
}

function isAlphaNumeric(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122);
}

const PRECISION_VALUE_TOKENS = new Set([
  "first",
  "second",
  "third",
  "fourth",
  "fifth",
  "sixth",
  "seventh",
  "eighth",
  "ninth",
  "tenth",
  "eleventh",
  "twelfth",
]);

const PRECISION_DOMAIN_NOUNS = new Set([
  "bell",
  "clerk",
  "desk",
  "docket",
  "fee",
  "officer",
  "petition",
  "phrase",
  "phrasing",
  "queue",
  "registry",
  "route",
  "seal",
  "standing",
  "token",
  "tribunal",
  "wing",
  "wording",
]);

function collectUnsupportedPrecisionTokens(args: {
  text: string;
  evidenceText: string;
}): string[] {
  const evidenceTokens = new Set(precisionTokens(args.evidenceText));
  const entries = precisionTokenEntries(args.text);
  const unsupported: string[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const token = entries[index]!.value;
    if (!tokenRequiresPrecisionEvidence(entries, index)) {
      continue;
    }
    if (evidenceTokens.has(token)) {
      continue;
    }
    if (!unsupported.includes(token)) {
      unsupported.push(token);
    }
  }

  return unsupported;
}

function tokenRequiresPrecisionEvidence(
  entries: readonly PrecisionTokenEntry[],
  index: number,
): boolean {
  const token = entries[index]?.value;
  if (!token) return false;
  if (PRECISION_VALUE_TOKENS.has(token)) return true;
  if (containsAsciiDigit(token)) return true;
  if (token.includes("-")) return true;
  return PRECISION_DOMAIN_NOUNS.has(token);
}

function containsAsciiDigit(token: string): boolean {
  for (const char of token) {
    const code = char.charCodeAt(0);
    if (code >= 48 && code <= 57) return true;
  }
  return false;
}

function containsMarkdownLink(text: string): boolean {
  const closeBracket = text.indexOf("]");
  if (closeBracket <= 0 || text[closeBracket + 1] !== "(") return false;
  return text.indexOf("[") >= 0 && text.indexOf(")", closeBracket + 2) > closeBracket + 2;
}

function containsMarkdownSyntax(text: string): boolean {
  const trimmedStart = text.trimStart();
  return text.includes("```")
    || trimmedStart.startsWith("# ")
    || trimmedStart.startsWith("## ")
    || trimmedStart.startsWith("### ")
    || trimmedStart.startsWith("#### ")
    || trimmedStart.startsWith("##### ")
    || trimmedStart.startsWith("###### ")
    || containsMarkdownLink(text);
}

function containsToolCallSyntax(text: string): boolean {
  if (containsCaseInsensitive(text, "default_api.")) return true;

  for (const term of TOOL_SYNTAX_TERMS) {
    const lowerText = text.toLocaleLowerCase();
    const lowerTerm = term.toLocaleLowerCase();
    let cursor = 0;
    while (cursor < lowerText.length) {
      const index = lowerText.indexOf(lowerTerm, cursor);
      if (index < 0) break;
      const before = lowerText[index - 1];
      const after = lowerText[index + lowerTerm.length];
      if (!isAsciiWordChar(before) && nextNonWhitespaceChar(lowerText, index + lowerTerm.length) === "(") {
        return true;
      }
      cursor = index + Math.max(1, lowerTerm.length);
      if (isAsciiWordChar(after)) {
        continue;
      }
    }
  }

  return false;
}

function containsBackendMetadata(text: string): boolean {
  for (const word of BACKEND_METADATA_WORDS) {
    if (containsCaseInsensitiveWord(text, word)) return true;
  }
  for (const marker of BACKEND_METADATA_MARKERS) {
    if (containsCaseInsensitive(text, marker)) return true;
  }
  return false;
}

function assertGroundedSentenceTextIsVisibleProse(text: string, index: number): void {
  if (text.includes("\r") || text.includes("\n")) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} must be one visible prose sentence.`);
  }
  if (containsMarkdownSyntax(text)) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} contains markdown.`);
  }
  if (containsToolCallSyntax(text)) {
    throw new Error(`GroundedSentenceDraft sentence ${index + 1} contains tool syntax.`);
  }
  if (containsBackendMetadata(text)) {
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

function resolveGroundedSentenceEvidenceRefs(
  refs: readonly string[],
  allowedEvidenceByRef: ReadonlyMap<string, NarratorPacketEvidence>,
  allowedBackendFactsByRef: ReadonlyMap<string, AllowedBackendFactRef>,
  sentenceIndex: number,
): string[] {
  const unique: string[] = [];
  for (const ref of refs) {
    const trimmed = ref.trim();
    if (!trimmed) {
      continue;
    }
    const backendFact = allowedBackendFactsByRef.get(trimmed);
    if (backendFact) {
      if (!unique.includes(backendFact.evidenceId)) {
        unique.push(backendFact.evidenceId);
      }
      continue;
    }
    const evidence = allowedEvidenceByRef.get(trimmed);
    if (!evidence) {
      throw new Error(
        `GroundedSentenceDraft sentence ${sentenceIndex + 1} cites unknown or disallowed evidence ref: ${trimmed}`,
      );
    }
    const canonicalRef = evidence.id;
    if (!unique.includes(canonicalRef)) {
      unique.push(canonicalRef);
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
    case "observation_result":
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
  let wordCount = 0;
  let insideWord = false;
  for (const char of text) {
    if (isWhitespace(char)) {
      insideWord = false;
      continue;
    }
    if (!insideWord) {
      wordCount += 1;
      insideWord = true;
    }
  }
  return wordCount;
}

function countCoveredClaimSpanWords(draft: NarrationDraft): number {
  return draft.claimSpans
    .filter((span) => span.spanText.trim().length > 0 && draft.prose.includes(span.spanText))
    .reduce((total, span) => total + countWords(span.spanText), 0);
}
