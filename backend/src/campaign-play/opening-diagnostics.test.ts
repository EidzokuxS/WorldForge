import { z } from "zod";
import { describe, expect, it, vi } from "vitest";
import type { SafeGenerateTrace } from "../ai/generate-object-safe.js";
import {
  recordCampaignPlayOpeningNoObjectDiagnostics,
  recordCampaignPlayOpeningSchemaIssueDiagnostics,
} from "./opening-diagnostics.js";

const noObjectError = new Error(
  "safeGenerateObject native JSON output was unavailable: "
    + "NoObjectGeneratedError: No object generated: could not parse the response.",
);

const r41WrappedNoObjectError = new Error(
  "safeGenerateObject: full_retry exhausted. "
    + "safeGenerateObject native_json: text fallback is disabled. "
    + "native_json failed: safeGenerateObject native JSON output was unavailable: "
    + "NoObjectGeneratedError: No object generated: could not parse the response.",
);

function failureTrace(text: string, finishReason = "stop"): SafeGenerateTrace {
  return {
    text,
    cleanedText: text,
    strategy: "native_json",
    usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
    finishReason,
  };
}

describe("Opening no-object diagnostics", () => {
  it("records the wrapped native JSON no-object failure shape from r41", () => {
    const warn = vi.fn();
    const text = "{\"secret-r41-body\":\"unfinished";
    const trace: SafeGenerateTrace = {
      text,
      cleanedText: text,
      requestedMode: "auto",
      strategy: "full_retry",
      primaryStrategy: "native_json",
      fallbackStrategy: "text_fallback",
      fallbackReason: "native_json failed: native output unavailable",
      capability: {
        requestedMode: "auto",
        primaryStrategy: "native_json",
        fallbackStrategy: "text_fallback",
        actualMode: "native_json",
        reason: "Resolved auto to native_json for the configured provider.",
      },
      usage: { inputTokens: 16605, outputTokens: 20333, totalTokens: 36938 },
      finishReason: "stop",
    };

    recordCampaignPlayOpeningNoObjectDiagnostics(
      { warn },
      r41WrappedNoObjectError,
      "native_output_unavailable",
      trace,
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "Opening native JSON output was not generated.",
      {
        diagnostic: "opening_no_object_generated",
        responseTextLength: text.length,
        leadingBoundary: "object-open",
        trailingBoundary: "alphanumeric",
        finishReason: "stop",
        usage: { inputTokens: 16605, outputTokens: 20333, totalTokens: 36938 },
        causeName: "NoObjectGeneratedError",
        causeType: "AI_NoObjectGeneratedError",
      },
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain("secret-r41-body");
  });

  it.each([
    {
      shape: "empty",
      text: "",
      finishReason: "stop",
      leadingBoundary: "empty",
      trailingBoundary: "empty",
    },
    {
      shape: "fenced",
      text: "```json\n{\"secret-fenced-body\":true}\n```",
      finishReason: "stop",
      leadingBoundary: "backtick",
      trailingBoundary: "backtick",
    },
    {
      shape: "prose",
      text: "Here is secret-prose-body before the object: {\"ok\":true}",
      finishReason: "stop",
      leadingBoundary: "alphanumeric",
      trailingBoundary: "object-close",
    },
    {
      shape: "truncated",
      text: "{\"secret-truncated-body\":\"unfinished",
      finishReason: "length",
      leadingBoundary: "object-open",
      trailingBoundary: "alphanumeric",
    },
  ])(
    "records only redacted $shape output boundaries",
    ({ text, finishReason, leadingBoundary, trailingBoundary }) => {
      const warn = vi.fn();

      recordCampaignPlayOpeningNoObjectDiagnostics(
        { warn },
        noObjectError,
        "native_output_unavailable",
        failureTrace(text, finishReason),
      );

      expect(warn).toHaveBeenCalledOnce();
      expect(warn).toHaveBeenCalledWith(
        "Opening native JSON output was not generated.",
        {
          diagnostic: "opening_no_object_generated",
          responseTextLength: text.length,
          leadingBoundary,
          trailingBoundary,
          finishReason,
          usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
          causeName: "NoObjectGeneratedError",
          causeType: "AI_NoObjectGeneratedError",
        },
      );
      const logged = JSON.stringify(warn.mock.calls);
      if (text.length > 0) expect(logged).not.toContain(text);
      expect(logged).not.toContain("secret-");
    },
  );

  it("ignores failures outside the Opening native NoObjectGeneratedError lane", () => {
    const warn = vi.fn();

    recordCampaignPlayOpeningNoObjectDiagnostics(
      { warn },
      new Error("transport stopped"),
      null,
      failureTrace("private provider text"),
    );

    expect(warn).not.toHaveBeenCalled();
  });

  it("ignores a wrapped failure whose primary strategy was not native JSON", () => {
    const warn = vi.fn();
    const trace: SafeGenerateTrace = {
      ...failureTrace("private provider text"),
      strategy: "full_retry",
      primaryStrategy: "tool_mode",
    };

    recordCampaignPlayOpeningNoObjectDiagnostics(
      { warn },
      r41WrappedNoObjectError,
      "native_output_unavailable",
      trace,
    );

    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Opening schema-issue diagnostics", () => {
  it("records safe paths, codes, and structural metadata without rejected values", () => {
    const warn = vi.fn();
    const rejectedValue = "private-opening-narration";
    const result = z.object({
      start: z.object({ role: z.string() }).strict(),
    }).strict().safeParse({ start: rejectedValue });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(recordCampaignPlayOpeningSchemaIssueDiagnostics({ warn }, result.error)).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith(
      "Opening proposal failed schema validation.",
      {
        diagnostic: "opening_proposal_schema_invalid",
        issueCount: 1,
        issues: [{
          index: 0,
          path: ["start"],
          code: "invalid_type",
          expected: "object",
        }],
      },
    );
    const serialized = JSON.stringify(warn.mock.calls);
    expect(serialized).not.toContain(rejectedValue);
    expect(serialized).not.toContain("private");
    expect(serialized).not.toContain("message");
  });

  it("does not classify valid or native-output failures as schema issues", () => {
    const warn = vi.fn();

    expect(recordCampaignPlayOpeningSchemaIssueDiagnostics({ warn }, undefined)).toBe(false);
    recordCampaignPlayOpeningNoObjectDiagnostics(
      { warn },
      noObjectError,
      "native_output_unavailable",
      failureTrace("private provider text"),
    );

    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toBe("Opening native JSON output was not generated.");
    expect(JSON.stringify(warn.mock.calls)).not.toContain("opening_proposal_schema_invalid");
  });
});
