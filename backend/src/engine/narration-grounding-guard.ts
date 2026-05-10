import type {
  NarratorPacket,
  NarratorPacketEvidence,
  NarratorPacketEvidenceCategory,
} from "./narrator-packet.js";

export type NarrationClaimKind =
  | "actor_presence"
  | "object_presence"
  | "location_change"
  | "route_status"
  | "threat_hazard"
  | "future_pressure"
  | "inventory_status_change"
  | "oracle_outcome"
  | "playable_beat";

export const ALLOWED_NARRATION_CLAIM_KINDS = new Set<NarrationClaimKind>([
  "actor_presence",
  "object_presence",
  "location_change",
  "route_status",
  "threat_hazard",
  "future_pressure",
  "inventory_status_change",
  "oracle_outcome",
  "playable_beat",
]);

export interface NarrationClaim {
  id: string;
  kind: NarrationClaimKind;
  summary: string;
  requiresEvidence: boolean;
  evidenceRefs: string[];
}

export interface NarrationClaimSpan {
  id: string;
  spanText: string;
  claimIds: string[];
  requiresEvidence: boolean;
}

export interface NarrationDraft {
  prose: string;
  claims: NarrationClaim[];
  claimSpans: NarrationClaimSpan[];
}

export type GroundingGuardViolationKind =
  | "empty_prose"
  | "missing_claim_spans"
  | "unsupported_claim"
  | "unknown_evidence_ref"
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

export function validateNarrationDraftGrounding(args: {
  packet: NarratorPacket;
  draft: NarrationDraft;
}): GroundingGuardResult {
  const evidenceById = buildEvidenceById(args.packet.evidenceLedger ?? []);
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
  }

  const coverage = auditNarrationClaimCoverage({
    draft: args.draft,
    claimById,
    evidenceById,
  });
  const normalizedProse = normalizeSpanText(args.draft.prose);
  for (const span of args.draft.claimSpans) {
    const normalizedSpan = normalizeSpanText(span.spanText);
    if (!normalizedSpan || !normalizedProse.includes(normalizedSpan)) {
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

  return buildGroundingResult(violations, warnings, coverage);
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
): string {
  const issueLines = violations.map((violation, index) => {
    const label = `Issue ${index + 1}`;
    switch (violation.kind) {
      case "empty_prose":
        return `${label}: prose is empty; provide visible narration from the packet.`;
      case "missing_claim_spans":
        return `${label}: claimSpans are missing; declare concrete prose spans and map them to claims.`;
      case "unsupported_claim":
        return `${label}: an evidence-required claim lacks evidenceRefs; either remove it or cite packet evidence ids.`;
      case "unknown_evidence_ref":
        return `${label}: an evidence-required claim cites evidence ids outside the packet ledger; use only packet evidence ids.`;
      case "claim_span_not_in_prose":
        return `${label}: a claimSpan has empty text or text absent from prose; use exact visible prose spans.`;
      case "uncovered_claim_span":
        return `${label}: an evidence-required span has no declared claim; map it to an evidence-backed claim or remove the span.`;
      case "unsupported_claim_span":
        return `${label}: an evidence-required span maps only to unsupported claims; cite packet evidence ids or revise prose.`;
    }
  });

  return [
    "Revise the final narration draft. Do not reveal hidden terms.",
    "Return the same draft JSON shape with revised prose, claims, claimSpans, and evidenceRefs.",
    "Use only evidence ids already present in the packet evidence ledger.",
    ...issueLines,
  ].join("\n");
}

function buildGroundingResult(
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
      ? buildNarrationGroundingRepairAddendum(violations)
      : null,
  };
}

function buildEvidenceById(
  evidenceLedger: readonly NarratorPacketEvidence[],
): ReadonlyMap<string, NarratorPacketEvidence> {
  return new Map(evidenceLedger.map((entry) => [entry.id, entry]));
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

function normalizeSpanText(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/gu, " ").trim();
}
