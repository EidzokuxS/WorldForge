import { z } from "zod";
import type {
  SafeGenerateErrorCode,
  SafeGenerateTrace,
} from "../ai/generate-object-safe.js";

type OpeningOutputBoundary =
  | "empty"
  | "whitespace"
  | "backtick"
  | "object-open"
  | "object-close"
  | "array-open"
  | "array-close"
  | "quote"
  | "alphanumeric"
  | "other";

export interface OpeningDiagnosticsLogger {
  warn(message: string, data?: unknown): void;
}

const OPENING_SCHEMA_ISSUE_STRUCTURAL_KEYS = [
  "expected",
  "origin",
  "minimum",
  "maximum",
  "inclusive",
  "exact",
  "keys",
  "format",
  "values",
] as const;

function safePathSegment(segment: PropertyKey): string | number {
  if (
    typeof segment === "number"
    && Number.isSafeInteger(segment)
    && segment >= 0
  ) {
    return segment;
  }
  if (typeof segment === "string" && segment.length <= 120) {
    return segment;
  }
  return "[redacted]";
}

function structuralIssueMetadata(issue: z.ZodError["issues"][number]): Record<string, unknown> {
  const record = issue as unknown as Record<string, unknown>;
  const metadata: Record<string, unknown> = {};
  for (const key of OPENING_SCHEMA_ISSUE_STRUCTURAL_KEYS) {
    const value = record[key];
    if (key === "keys" || key === "values") {
      if (
        Array.isArray(value)
        && value.every((entry) =>
          typeof entry === "string"
          || typeof entry === "number"
          || typeof entry === "boolean"
        )
      ) {
        metadata[key === "values" ? "allowedValues" : key] = value.slice(0, 16);
      }
      continue;
    }
    if (
      (key === "expected" || key === "origin" || key === "format")
      && typeof value === "string"
      && value.length <= 120
    ) {
      metadata[key] = value;
      continue;
    }
    if (
      (key === "minimum" || key === "maximum")
      && typeof value === "number"
      && Number.isFinite(value)
    ) {
      metadata[key] = value;
      continue;
    }
    if (
      (key === "inclusive" || key === "exact")
      && typeof value === "boolean"
    ) {
      metadata[key] = value;
    }
  }
  return metadata;
}

/**
 * Record only schema structure for a parsed Opening proposal that failed the
 * proposal schema. The rejected value, issue messages, and error object are
 * intentionally excluded from the log payload.
 */
export function recordCampaignPlayOpeningSchemaIssueDiagnostics(
  logger: OpeningDiagnosticsLogger,
  error: unknown,
): boolean {
  if (!(error instanceof z.ZodError) || error.issues.length === 0) return false;

  logger.warn("Opening proposal failed schema validation.", {
    diagnostic: "opening_proposal_schema_invalid",
    issueCount: error.issues.length,
    issues: error.issues.map((issue, index) => ({
      index,
      path: issue.path.map(safePathSegment),
      code: issue.code,
      ...structuralIssueMetadata(issue),
    })),
  });
  return true;
}

function classifyBoundary(character: string | undefined): OpeningOutputBoundary {
  if (character === undefined) return "empty";
  if (/\s/u.test(character)) return "whitespace";
  if (character === "`") return "backtick";
  if (character === "{") return "object-open";
  if (character === "}") return "object-close";
  if (character === "[") return "array-open";
  if (character === "]") return "array-close";
  if (character === "\"" || character === "'") return "quote";
  if (/[A-Za-z0-9]/u.test(character)) return "alphanumeric";
  return "other";
}

function contentBoundaries(text: string): {
  leadingBoundary: OpeningOutputBoundary;
  trailingBoundary: OpeningOutputBoundary;
} {
  if (text.length === 0) {
    return { leadingBoundary: "empty", trailingBoundary: "empty" };
  }
  const content = text.trim();
  if (content.length === 0) {
    return { leadingBoundary: "whitespace", trailingBoundary: "whitespace" };
  }
  return {
    leadingBoundary: classifyBoundary(content[0]),
    trailingBoundary: classifyBoundary(content.at(-1)),
  };
}

export function recordCampaignPlayOpeningNoObjectDiagnostics(
  logger: OpeningDiagnosticsLogger,
  _error: unknown,
  code: SafeGenerateErrorCode | null,
  trace: Readonly<SafeGenerateTrace> | null,
): void {
  const isNativeJsonFailure = trace?.strategy === "native_json"
    || (
      trace?.strategy === "full_retry"
      && trace.primaryStrategy === "native_json"
    );
  if (
    code !== "native_output_unavailable"
    || !isNativeJsonFailure
  ) {
    return;
  }

  logger.warn("Opening native JSON output was not generated.", {
    diagnostic: "opening_no_object_generated",
    responseTextLength: trace.text.length,
    ...contentBoundaries(trace.text),
    finishReason: trace.finishReason ?? null,
    usage: trace.usage
      ? {
          inputTokens: trace.usage.inputTokens ?? null,
          outputTokens: trace.usage.outputTokens ?? null,
          totalTokens: trace.usage.totalTokens ?? null,
        }
      : null,
    causeName: "NoObjectGeneratedError",
    causeType: "AI_NoObjectGeneratedError",
  });
}
