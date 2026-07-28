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

interface OpeningDiagnosticsLogger {
  warn(message: string, data?: unknown): void;
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
  error: unknown,
  code: SafeGenerateErrorCode | null,
  trace: Readonly<SafeGenerateTrace> | null,
): void {
  if (
    code !== "native_output_unavailable"
    || trace?.strategy !== "native_json"
    || !(error instanceof Error)
    || !error.message.includes("NoObjectGeneratedError:")
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
