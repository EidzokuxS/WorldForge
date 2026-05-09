import type { NarratorPacket } from "./narrator-packet.js";

export const VISIBLE_NARRATION_PACKET_GUARD_RETRY_LIMIT = 1;

const GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration to stay within the visible packet. Omit any identity or fact that is not directly visible to the player.";

const EMPTY_VISIBLE_PACKET_RETRY_ADDENDUM =
  "Revise the final narration because the previous output was empty. Write a concrete, player-visible response from the packet and return control on a playable next moment.";

export type VisibleNarrationPacketViolationKind =
  | "forbiddenActorName"
  | "forbiddenFactMarker"
  | "forbiddenPrivateTerm"
  | "emptyNarration";

export interface VisibleNarrationPacketViolation {
  kind: VisibleNarrationPacketViolationKind;
  term: string;
}

export interface VisibleNarrationPacketValidationResult {
  ok: boolean;
  violations: VisibleNarrationPacketViolation[];
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
}): VisibleNarrationPacketValidationResult {
  const violations: VisibleNarrationPacketViolation[] = [];
  if (args.text.trim().length === 0) {
    violations.push({
      kind: "emptyNarration",
      term: "empty visible narration",
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

  return {
    ok: violations.length === 0,
    violations,
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
    const text = await args.generateNarration({
      attempt,
      guardAddendum,
    });
    const validation = validateVisibleNarrationAgainstPacket({
      packet: args.packet,
      text,
    });

    if (validation.ok) {
      return {
        text,
        attempts: attempt,
        retried: attempt > 1,
        validation,
        guardAddendum,
      };
    }

    lastValidation = validation;
    args.onUnsafeAttempt?.({ attempt, validation });
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

  return GENERIC_VISIBLE_PACKET_RETRY_ADDENDUM;
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
