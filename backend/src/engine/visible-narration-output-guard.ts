import {
  collectCommittedVisibleActorCreationLabels,
  getNarratorPacketRedactionAudit,
  type NarratorPacket,
  type NarratorPacketRedactionAudit,
} from "./narrator-packet.js";
import {
  narrationDraftSchema,
  validateNarrationDraftGrounding,
  type GroundingGuardResult,
  type GroundingGuardViolationKind,
  type GroundingGuardWarningKind,
  type NarrationDraft,
} from "./narration-grounding-guard.js";

export const VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT = 0;

const GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration to stay within the visible packet. Omit any identity or fact that is not directly visible to the player.";

const EMPTY_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was empty. Write a concrete, player-visible response from the packet and return control on a playable next moment.";

const THIN_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was too thin. Write a concrete, player-visible beat from the packet and return control on a playable next moment.";

const INVALID_DRAFT_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was not a valid grounded structured draft. Stay within the visible packet. Return exactly one GroundedSentenceDraft object with version and sentences; put player-visible narration only in sentences[].text. Each sentences[].evidenceRefs array must contain 1-4 ids and never five or more.";

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
  grounding?: {
    violationKinds: GroundingGuardViolationKind[];
    warningKinds: GroundingGuardWarningKind[];
    coverage: {
      total: number;
      covered: number;
      unsupported: number;
      evidenceRequired: number;
      missingClaim: number;
    };
  };
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

export type VisibleNarrationGeneratorOutput = NarrationDraft;

export type VisibleNarrationGenerator = (
  args: VisibleNarrationGeneratorArgs,
) => Promise<VisibleNarrationGeneratorOutput> | VisibleNarrationGeneratorOutput;

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
  draft: NarrationDraft;
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
    public readonly validation: VisibleNarrationPacketValidationResult | null = null,
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

  const committedVisibleActorCreationLabels = collectCommittedVisibleActorCreationLabels({
    packet: args.packet.canonicalTurnPacket,
    perceivableEffects: args.packet.perceivableEffects,
  });

  collectForbiddenTermViolations({
    text: args.text,
    terms: args.packet.forbiddenActorNames,
    kind: "forbiddenActorName",
    violations,
    isAllowedTerm: (term) =>
      outputTextAllowsCommittedVisibleActorCreationLabel({
        text: args.text,
        forbiddenTerm: term,
        committedVisibleActorCreationLabels,
      }),
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
    diagnostics: buildVisibleNarrationDiagnostics(args.packet, violations, grounding),
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
    const effectiveValidation = !candidate.draft
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

    if (effectiveValidation.ok && candidate.draft) {
      return {
        text: candidate.draft.prose,
        draft: candidate.draft,
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
    "Visible narration failed NarrationDraft or packet validation after retry.",
    lastValidation?.violations ?? [],
    maxAttempts,
    lastValidation,
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
  grounding?: GroundingGuardResult,
): VisibleNarrationPacketDiagnostics {
  const audit = getNarratorPacketRedactionAudit(packet);
  return {
    violationKinds: [...new Set(violations.map((violation) => violation.kind))],
    grounding: grounding ? summarizeGroundingDiagnostics(grounding) : undefined,
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

function summarizeGroundingDiagnostics(
  grounding: GroundingGuardResult,
): NonNullable<VisibleNarrationPacketDiagnostics["grounding"]> {
  const evidenceRequiredCoverage = grounding.coverage.filter((entry) => entry.requiresEvidence);
  return {
    violationKinds: [...new Set(grounding.violations.map((violation) => violation.kind))],
    warningKinds: [...new Set((grounding.warnings ?? []).map((warning) => warning.kind))],
    coverage: {
      total: grounding.coverage.length,
      covered: grounding.coverage.filter((entry) => entry.covered).length,
      unsupported: evidenceRequiredCoverage.filter((entry) => !entry.covered).length,
      evidenceRequired: evidenceRequiredCoverage.length,
      missingClaim: evidenceRequiredCoverage.filter((entry) => entry.claimIds.length === 0).length,
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
  isAllowedTerm?: (term: string) => boolean;
}): void {
  for (const term of args.terms) {
    const trimmed = term.trim();
    if (!trimmed) {
      continue;
    }

    if (containsForbiddenTerm(args.text, trimmed)) {
      if (args.isAllowedTerm?.(trimmed)) {
        continue;
      }
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

function outputTextAllowsCommittedVisibleActorCreationLabel(args: {
  text: string;
  forbiddenTerm: string;
  committedVisibleActorCreationLabels: readonly string[];
}): boolean {
  const normalizedText = normalizeActorLabel(args.text);
  return args.committedVisibleActorCreationLabels.some((label) => {
    const normalizedLabel = normalizeActorLabel(label);
    return forbiddenActorTermMatchesCommittedVisibleActorLabel(
      args.forbiddenTerm,
      normalizedLabel,
    ) && actorLabelContainsWholeTokens(normalizedText, normalizedLabel);
  });
}

function forbiddenActorTermMatchesCommittedVisibleActorLabel(
  forbiddenTerm: string,
  normalizedCommittedLabel: string,
): boolean {
  const normalizedForbiddenTerm = normalizeActorLabel(forbiddenTerm);
  return Boolean(normalizedForbiddenTerm)
    && Boolean(normalizedCommittedLabel)
    && normalizedForbiddenTerm === normalizedCommittedLabel;
}

function normalizeActorLabel(label: string): string {
  return label.trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function actorLabelContainsWholeTokens(text: string, label: string): boolean {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(^|\\W)${escapedLabel}(\\W|$)`, "iu").test(text);
}

function normalizeVisibleNarrationOutput(
  output: unknown,
): { text: string; draft: NarrationDraft | null } {
  const parsed = narrationDraftSchema.safeParse(output);
  return parsed.success
    ? { text: parsed.data.prose, draft: parsed.data }
    : { text: "", draft: null };
}

function countWords(text: string): number {
  return text.split(/\s+/u).filter(Boolean).length;
}

function withInvalidNarrationDraftViolation(
  validation: VisibleNarrationPacketValidationResult,
): VisibleNarrationPacketValidationResult {
  const violations = [
    ...validation.violations,
    {
      kind: "invalidNarrationDraft" as const,
      term: "GroundedSentenceDraft",
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
    grounding: undefined,
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
