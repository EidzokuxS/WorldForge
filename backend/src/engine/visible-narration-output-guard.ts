import {
  getNarratorPacketRedactionAudit,
  type NarratorPacket,
  type NarratorPacketRedactionAudit,
} from "./narrator-packet.js";
import {
  ALLOWED_NARRATION_CLAIM_KINDS,
  validateNarrationDraftGrounding,
  type GroundingGuardResult,
  type NarrationClaim,
  type NarrationClaimSpan,
  type NarrationDraft,
} from "./narration-grounding-guard.js";

export const VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT = 1;

const GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration to stay within the visible packet. Omit any identity or fact that is not directly visible to the player.";

const EMPTY_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was empty. Write a concrete, player-visible response from the packet and return control on a playable next moment.";

const THIN_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was too thin. Write a concrete, player-visible beat from the packet and return control on a playable next moment.";

const INVALID_DRAFT_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was not a valid NarrationDraft JSON object. Stay within the visible packet. Return exactly one JSON object with prose, claims, and claimSpans; put player-visible narration only in prose.";

export type VisibleNarrationPacketViolationKind =
  | "forbiddenActorName"
  | "forbiddenFactMarker"
  | "forbiddenPrivateTerm"
  | "emptyNarration"
  | "invalidNarrationDraft"
  | "grounding";

export type VisibleNarrationPacketWarningKind = "thinNarration";

export interface VisibleNarrationPacketViolation {
  kind: VisibleNarrationPacketViolationKind;
  term: string;
}

export interface VisibleNarrationPacketWarning {
  kind: VisibleNarrationPacketWarningKind;
  term: string;
}

export interface VisibleNarrationPacketDiagnostics {
  violationKinds: VisibleNarrationPacketViolationKind[];
  redactionAudit: Pick<
    NarratorPacketRedactionAudit,
    | "hiddenEventCount"
    | "hiddenResponseCount"
    | "failedEffectCount"
    | "unreferencedEffectCount"
    | "hiddenEffectCount"
    | "privateActorNameCount"
    | "forbiddenFactMarkerCount"
    | "forbiddenPrivateTermCount"
    | "uncommittedProposalCount"
  >;
}

export interface VisibleNarrationPacketValidationResult {
  ok: boolean;
  violations: VisibleNarrationPacketViolation[];
  warnings?: VisibleNarrationPacketWarning[];
  grounding?: GroundingGuardResult;
  diagnostics?: VisibleNarrationPacketDiagnostics;
}

export interface VisibleNarrationGeneratorArgs {
  attempt: number;
  guardAddendum: string | null;
}

export type VisibleNarrationGenerator = (
  args: VisibleNarrationGeneratorArgs,
) => Promise<string> | string;

export interface RunVisibleNarrationWithPacketGuardArgs {
  packet: NarratorPacket;
  generateNarration: VisibleNarrationGenerator;
  onUnsafeAttempt?: (args: {
    attempt: number;
    validation: VisibleNarrationPacketValidationResult;
  }) => void;
}

export interface RunVisibleNarrationWithPacketGuardResult {
  text: string;
  attempts: number;
  retried: boolean;
  validation: VisibleNarrationPacketValidationResult;
  guardAddendum: string | null;
}

export class VisibleNarrationPacketGuardError extends Error {
  constructor(
    message: string,
    public readonly violations: VisibleNarrationPacketViolation[],
    public readonly attempts: number,
  ) {
    super(message);
    this.name = "VisibleNarrationPacketGuardError";
  }
}

export function validateVisibleNarrationAgainstPacket(args: {
  packet: NarratorPacket;
  text: string;
  draft?: NarrationDraft | null;
}): VisibleNarrationPacketValidationResult {
  const violations: VisibleNarrationPacketViolation[] = [];
  const warnings: VisibleNarrationPacketWarning[] = [];
  if (args.text.trim().length === 0) {
    violations.push({
      kind: "emptyNarration",
      term: "empty visible narration",
    });
  } else if (countWords(args.text) < 4) {
    warnings.push({
      kind: "thinNarration",
      term: "thin visible narration",
    });
  }

  collectForbiddenTermViolations({
    text: args.text,
    terms: args.packet.forbiddenActorNames,
    kind: "forbiddenActorName",
    violations,
  });
  collectForbiddenTermViolations({
    text: args.text,
    terms: args.packet.forbiddenFactMarkers,
    kind: "forbiddenFactMarker",
    violations,
  });
  collectForbiddenTermViolations({
    text: args.text,
    terms: args.packet.forbiddenPrivateTerms,
    kind: "forbiddenPrivateTerm",
    violations,
  });

  const grounding = args.draft && violations.length === 0
    ? validateNarrationDraftGrounding({
        packet: args.packet,
        draft: args.draft,
      })
    : undefined;

  if (grounding && !grounding.ok) {
    violations.push({
      kind: "grounding",
      term: "narration grounding",
    });
  }

  return {
    ok: violations.length === 0,
    violations,
    warnings,
    grounding,
    diagnostics: buildVisibleNarrationDiagnostics(args.packet, violations),
  };
}

export async function runVisibleNarrationWithPacketGuard(
  args: RunVisibleNarrationWithPacketGuardArgs,
): Promise<RunVisibleNarrationWithPacketGuardResult> {
  const maxAttempts = VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT + 1;
  let lastValidation: VisibleNarrationPacketValidationResult | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const guardAddendum = attempt === 1
      ? null
      : buildVisibleNarrationRetryAddendum(lastValidation);
    const generated = await args.generateNarration({
      attempt,
      guardAddendum,
    });
    const candidate = normalizeVisibleNarrationOutput(generated);
    const validation = validateVisibleNarrationAgainstPacket({
      packet: args.packet,
      text: candidate.text,
      draft: candidate.draft,
    });
    const effectiveValidation =
      isNarrationDraftRequired(args.packet) && !candidate.draft
        ? withInvalidNarrationDraftViolation(validation)
        : validation;

    if (shouldRetryThinNarrationPreference({
      validation: effectiveValidation,
      attempt,
      maxAttempts,
    })) {
      lastValidation = effectiveValidation;
      continue;
    }

    if (effectiveValidation.ok) {
      return {
        text: candidate.text,
        attempts: attempt,
        retried: attempt > 1,
        validation: effectiveValidation,
        guardAddendum,
      };
    }

    lastValidation = effectiveValidation;
    args.onUnsafeAttempt?.({ attempt, validation: effectiveValidation });
  }

  throw new VisibleNarrationPacketGuardError(
    "Visible narration violated packet visibility constraints after retry.",
    lastValidation?.violations ?? [],
    maxAttempts,
  );
}

function buildVisibleNarrationRetryAddendum(
  validation: VisibleNarrationPacketValidationResult | null,
): string {
  if (validation?.violations.some((violation) => violation.kind === "emptyNarration")) {
    return EMPTY_VISIBLE_PACKET_RETRY_ADDENDUM;
  }
  if (validation?.violations.some((violation) => violation.kind === "invalidNarrationDraft")) {
    return INVALID_DRAFT_RETRY_ADDENDUM;
  }
  if (validation?.grounding && !validation.grounding.ok) {
    return validation.grounding.repairAddendum ?? GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM;
  }
  if (hasThinNarrationWarning(validation)) {
    return THIN_VISIBLE_PACKET_RETRY_ADDENDUM;
  }

  if (validation?.diagnostics?.violationKinds.length) {
    return [
      GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM,
      `Safe redaction audit categories: ${validation.diagnostics.violationKinds.join(", ")}.`,
      formatDiagnosticCountLine(validation.diagnostics.redactionAudit),
    ].join("\n");
  }

  return GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM;
}

function buildVisibleNarrationDiagnostics(
  packet: NarratorPacket,
  violations: readonly VisibleNarrationPacketViolation[],
): VisibleNarrationPacketDiagnostics {
  const audit = getNarratorPacketRedactionAudit(packet);
  return {
    violationKinds: [...new Set(violations.map((violation) => violation.kind))],
    redactionAudit: {
      hiddenEventCount: audit.hiddenEventCount,
      hiddenResponseCount: audit.hiddenResponseCount,
      failedEffectCount: audit.failedEffectCount,
      unreferencedEffectCount: audit.unreferencedEffectCount,
      hiddenEffectCount: audit.hiddenEffectCount,
      privateActorNameCount: audit.privateActorNameCount,
      forbiddenFactMarkerCount: audit.forbiddenFactMarkerCount,
      forbiddenPrivateTermCount: audit.forbiddenPrivateTermCount,
      uncommittedProposalCount: audit.uncommittedProposalCount,
    },
  };
}

function formatDiagnosticCountLine(
  audit: VisibleNarrationPacketDiagnostics["redactionAudit"],
): string {
  return [
    "Safe redaction audit counts:",
    `hiddenEventCount=${audit.hiddenEventCount}`,
    `hiddenResponseCount=${audit.hiddenResponseCount}`,
    `failedEffectCount=${audit.failedEffectCount}`,
    `unreferencedEffectCount=${audit.unreferencedEffectCount}`,
    `hiddenEffectCount=${audit.hiddenEffectCount}`,
    `privateActorNameCount=${audit.privateActorNameCount}`,
    `forbiddenFactMarkerCount=${audit.forbiddenFactMarkerCount}`,
    `forbiddenPrivateTermCount=${audit.forbiddenPrivateTermCount}`,
    `uncommittedProposalCount=${audit.uncommittedProposalCount}`,
  ].join(" ");
}

function shouldRetryThinNarrationPreference(args: {
  validation: VisibleNarrationPacketValidationResult;
  attempt: number;
  maxAttempts: number;
}): boolean {
  return args.validation.ok
    && args.attempt < args.maxAttempts
    && hasThinNarrationWarning(args.validation);
}

function hasThinNarrationWarning(
  validation: VisibleNarrationPacketValidationResult | null,
): boolean {
  return validation?.warnings?.some((warning) => warning.kind === "thinNarration") === true
    || validation?.grounding?.warnings?.some((warning) => warning.kind === "thin_prose") === true;
}

function collectForbiddenTermViolations(args: {
  text: string;
  terms: string[];
  kind: VisibleNarrationPacketViolationKind;
  violations: VisibleNarrationPacketViolation[];
}): void {
  for (const term of args.terms) {
    const trimmed = term.trim();
    if (!trimmed) {
      continue;
    }

    if (containsForbiddenTerm(args.text, trimmed)) {
      args.violations.push({
        kind: args.kind,
        term: trimmed,
      });
    }
  }
}

function containsForbiddenTerm(text: string, term: string): boolean {
  return text.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function normalizeVisibleNarrationOutput(
  output: string,
): { text: string; draft: NarrationDraft | null } {
  const draft = parseNarrationDraft(output);
  return draft
    ? { text: draft.prose, draft }
    : { text: output, draft: null };
}

function parseNarrationDraft(text: string): NarrationDraft | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    return coerceNarrationDraft(JSON.parse(trimmed));
  } catch {
    return null;
  }
}

function coerceNarrationDraft(value: unknown): NarrationDraft | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.prose !== "string") {
    return null;
  }
  if (!Array.isArray(record.claims) || !Array.isArray(record.claimSpans)) {
    return null;
  }

  const claims = record.claims.map(coerceNarrationClaim);
  const claimSpans = record.claimSpans.map(coerceNarrationClaimSpan);
  if (claims.some((claim) => !claim) || claimSpans.some((span) => !span)) {
    return null;
  }

  return {
    prose: record.prose,
    claims: claims as NarrationClaim[],
    claimSpans: claimSpans as NarrationClaimSpan[],
  };
}

function coerceNarrationClaim(value: unknown): NarrationClaim | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string"
    || typeof record.kind !== "string"
    || typeof record.summary !== "string"
    || typeof record.requiresEvidence !== "boolean"
    || !Array.isArray(record.evidenceRefs)
  ) {
    return null;
  }
  if (!record.evidenceRefs.every((ref) => typeof ref === "string")) {
    return null;
  }
  if (!ALLOWED_NARRATION_CLAIM_KINDS.has(record.kind as NarrationClaim["kind"])) {
    return null;
  }

  return {
    id: record.id,
    kind: record.kind as NarrationClaim["kind"],
    summary: record.summary,
    requiresEvidence: record.requiresEvidence,
    evidenceRefs: record.evidenceRefs,
  };
}

function coerceNarrationClaimSpan(value: unknown): NarrationClaimSpan | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string"
    || typeof record.spanText !== "string"
    || typeof record.requiresEvidence !== "boolean"
    || !Array.isArray(record.claimIds)
  ) {
    return null;
  }
  if (!record.claimIds.every((claimId) => typeof claimId === "string")) {
    return null;
  }

  return {
    id: record.id,
    spanText: record.spanText,
    claimIds: record.claimIds,
    requiresEvidence: record.requiresEvidence,
  };
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

function isNarrationDraftRequired(packet: NarratorPacket): boolean {
  return Array.isArray(packet.evidenceLedger);
}

function withInvalidNarrationDraftViolation(
  validation: VisibleNarrationPacketValidationResult,
): VisibleNarrationPacketValidationResult {
  const violations = [
    ...validation.violations,
    {
      kind: "invalidNarrationDraft" as const,
      term: "NarrationDraft JSON",
    },
  ];

  return {
    ...validation,
    ok: false,
    violations,
    diagnostics: {
      ...(validation.diagnostics ?? buildEmptyVisibleNarrationDiagnostics()),
      violationKinds: [...new Set(violations.map((violation) => violation.kind))],
    },
  };
}

function buildEmptyVisibleNarrationDiagnostics(): VisibleNarrationPacketDiagnostics {
  return {
    violationKinds: [],
    redactionAudit: {
      hiddenEventCount: 0,
      hiddenResponseCount: 0,
      failedEffectCount: 0,
      unreferencedEffectCount: 0,
      hiddenEffectCount: 0,
      privateActorNameCount: 0,
      forbiddenFactMarkerCount: 0,
      forbiddenPrivateTermCount: 0,
      uncommittedProposalCount: 0,
    },
  };
}
