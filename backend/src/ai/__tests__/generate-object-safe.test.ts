import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../structured-output-capabilities.js";

const mockGenerateText = vi.fn();
const mockStreamText = vi.fn((...args: unknown[]) => {
  const result = Promise.resolve(mockGenerateText(...args));
  return {
    text: result.then((value) => value.text),
    reasoningText: result.then((value) => value.reasoningText),
    usage: result.then((value) => value.usage),
    response: result.then((value) => value.response),
    providerMetadata: result.then((value) => value.providerMetadata),
    finishReason: result.then((value) => value.finishReason),
    output: result.then((value) => value.output, () => undefined),
  };
});
const mockOutputObject = vi.fn((input: unknown) => ({
  kind: "mock-output-object",
  input,
}));
const mockOutputJson = vi.fn(() => ({
  kind: "mock-output-json",
}));
const mockTool = vi.fn((input: unknown) => ({
  kind: "mock-tool",
  input,
}));
const mockLogEvent = vi.fn();
const mockLogWarn = vi.fn();
const mockLogError = vi.fn();

class MockNoObjectGeneratedError extends Error {
  static isInstance(error: unknown): boolean {
    return error instanceof MockNoObjectGeneratedError;
  }
}

vi.mock("ai", () => ({
  generateText: (...args: unknown[]) => mockGenerateText(...args),
  streamText: (...args: unknown[]) => mockStreamText(...args),
  generateObject: vi.fn(),
  Output: {
    object: (input: unknown) => mockOutputObject(input),
    json: () => mockOutputJson(),
  },
  tool: (input: unknown) => mockTool(input),
  NoObjectGeneratedError: MockNoObjectGeneratedError,
}));

vi.mock("../../lib/index.js", () => ({
  createLogger: vi.fn(() => ({
    event: mockLogEvent,
    warn: mockLogWarn,
    error: mockLogError,
  })),
}));

const {
  getSafeGenerateObjectErrorCode,
  getSafeGenerateObjectTrace,
  isSafeGenerateObjectContractErrorCode,
  isSafeGenerateObjectError,
  safeGenerateObject,
} = await import("../generate-object-safe.js");

const repairPolicySourcePath = path.resolve(
  process.cwd(),
  "src/ai/generate-object-safe.ts",
);
const failureFixtureDir = path.resolve(
  process.cwd(),
  "src/ai/__tests__/fixtures/structured-output-failures",
);
const expectedFailureFixtureIds = [
  "kimi-citations-string",
  "mimo-canonical-names-string",
  "deepseek-scene-plan-missing-action",
  "deepseek-payload-vs-input",
  "glm-overlong-rationale",
  "unsupported-tool-name",
  "lazy-power-stats",
] as const;

type FailureFixture = {
  fixtureId: string;
  targetSchemaFamily: string;
  malformedObject: Record<string, unknown>;
};

type FailureFixtureManifest = {
  version: number;
  fixtures: Array<{
    fixtureId: string;
    file: string;
    source: string;
    providerModel: string;
    targetSchemaFamily: string;
    failureClass: string;
    sanitizedFields: string[];
  }>;
};

describe("safeGenerateObject", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the structured output repair policy source of truth in production code", () => {
    const policy = fs.readFileSync(repairPolicySourcePath, "utf8");

    expect(policy).toContain("STRUCTURED_OUTPUT_CONTRACT: repair-policy.v1");
    expect(policy).toContain("may coerce");
    expect(policy).toContain("must never invent");
    expect(policy).toContain("fail closed");
    expect(policy).toContain("new array elements");
    expect(policy).toContain("semantic");
  });

  it("locks sanitized structured-output failure fixtures with provenance", () => {
    const manifestPath = path.join(failureFixtureDir, "manifest.json");
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as FailureFixtureManifest;
    expect(manifest.version).toBe(1);
    expect(manifest.fixtures.map((entry) => entry.fixtureId)).toEqual(expectedFailureFixtureIds);

    const fixtures: Record<string, FailureFixture> = {};
    for (const entry of manifest.fixtures) {
      expect(entry.file).toMatch(/\.json$/);
      expect(entry.source).not.toContain("MISSING_SOURCE");
      expect(entry.source).toMatch(/backend\/src\//);
      expect(entry.providerModel.length).toBeGreaterThan(2);
      expect(entry.targetSchemaFamily.length).toBeGreaterThan(2);
      expect(entry.failureClass.length).toBeGreaterThan(8);
      expect(entry.sanitizedFields.length).toBeGreaterThan(0);

      const fixturePath = path.join(failureFixtureDir, entry.file);
      const fixtureText = fs.readFileSync(fixturePath, "utf8");
      expect(fixtureText).not.toMatch(/apiKey|Authorization|Bearer|raw full prompt|campaigns[\\/]/i);

      const fixture = JSON.parse(fixtureText) as FailureFixture;
      expect(fixture.fixtureId).toBe(entry.fixtureId);
      expect(fixture.targetSchemaFamily).toBe(entry.targetSchemaFamily);
      fixtures[fixture.fixtureId] = fixture;
    }

    expect(typeof fixtures["kimi-citations-string"]?.malformedObject.citations).toBe("string");
    expect(typeof fixtures["mimo-canonical-names-string"]?.malformedObject.canonicalNames).toBe("string");

    const missingActionPlan = fixtures["deepseek-scene-plan-missing-action"]?.malformedObject;
    const missingActionRows = missingActionPlan?.plannedActions as Array<Record<string, unknown>>;
    const quickActionsInput = missingActionRows[0]?.input as Record<string, unknown>;
    const quickActions = quickActionsInput.actions as Array<Record<string, unknown>>;
    expect(quickActions[0]).toHaveProperty("label");
    expect(quickActions[0]).not.toHaveProperty("action");

    const payloadAliasPlan = fixtures["deepseek-payload-vs-input"]?.malformedObject;
    const payloadAliasRows = payloadAliasPlan?.plannedActions as Array<Record<string, unknown>>;
    expect(payloadAliasRows[0]).toHaveProperty("payload");
    expect(payloadAliasRows[0]).not.toHaveProperty("input");

    const overlongRationale = String(fixtures["glm-overlong-rationale"]?.malformedObject.reasoning ?? "");
    expect(overlongRationale.length).toBeGreaterThan(500);

    const unsupportedToolPlan = fixtures["unsupported-tool-name"]?.malformedObject;
    const unsupportedToolRows = unsupportedToolPlan?.plannedActions as Array<Record<string, unknown>>;
    expect(unsupportedToolRows[0]?.toolName).toBe("search_environment");

    expect(Object.values(fixtures["lazy-power-stats"]?.malformedObject ?? {})).toEqual(
      expect.arrayContaining(["godlike", "fast", "unknown"]),
    );
  });

  it("uses AI SDK Output.object native_schema before text fallback when metadata allows it", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openai",
        providerName: "OpenAI",
        model: "gpt-5.1",
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      output: { hp: 5 },
      response: {
        modelId: "gpt-5.1",
      },
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.strategy).toBe("native_schema");
    expect(result.trace.primaryStrategy).toBe("native_schema");
    expect(result.trace.fallbackStrategy).toBe("text_fallback");
    expect(mockOutputObject).toHaveBeenCalledWith(expect.objectContaining({
      schema: expect.any(Object),
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      maxRetries: 0,
      output: expect.objectContaining({
        kind: "mock-output-object",
      }),
    }));
  });

  it("records explicit native_schema mode in trace metadata", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openai",
        providerName: "OpenAI",
        model: "gpt-5.1",
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      output: { hp: 5 },
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      mode: "native_schema",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.requestedMode).toBe("native_schema");
    expect(result.trace.strategy).toBe("native_schema");
    expect(result.trace.primaryStrategy).toBe("native_schema");
  });

  it("honors explicit text_fallback mode for native-capable metadata", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openai",
        providerName: "OpenAI",
        model: "gpt-5.1",
        protocol: "openai-compatible",
        baseUrl: "https://api.openai.com/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ hp: 5 }),
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      mode: "text_fallback",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.requestedMode).toBe("text_fallback");
    expect(result.trace.strategy).toBe("text_fallback");
    expect(result.trace.primaryStrategy).toBe("text_fallback");
    expect(mockOutputObject).not.toHaveBeenCalled();
    expect(mockGenerateText.mock.calls[0]?.[0]).not.toHaveProperty("output");
  });

  it("rejects explicit text_fallback mode without calling generateText when text fallback is disabled", async () => {
    await expect(safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      mode: "text_fallback",
      allowTextFallback: false,
      retries: 1,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("text fallback is disabled")
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("rejects resolver text_fallback strategy without calling generateText when text fallback is disabled", async () => {
    await expect(safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      allowTextFallback: false,
      retries: 1,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("text fallback is disabled")
    );

    expect(mockGenerateText).not.toHaveBeenCalled();
  });

  it("uses native JSON mode for OpenCode chat-completions models that do not support json_schema", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "opencode",
        providerName: "OpenCode",
        model: "deepseek-v4-flash",
        protocol: "openai-compatible",
        baseUrl: "https://opencode.ai/zen/v1/chat/completions",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      output: { hp: 5 },
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "Return JSON.",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.strategy).toBe("native_json");
    expect(result.trace.primaryStrategy).toBe("native_json");
    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    expect(mockOutputObject).not.toHaveBeenCalled();
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      maxRetries: 0,
      system: expect.stringContaining("valid JSON object"),
      output: expect.objectContaining({
        kind: "mock-output-json",
      }),
    }));
  });

  it("uses native JSON mode for GLM/Z.AI chat-completions models that fail json_schema in live play", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      output: { hp: 5 },
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "Return JSON.",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.strategy).toBe("native_json");
    expect(result.trace.primaryStrategy).toBe("native_json");
    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    expect(mockOutputObject).not.toHaveBeenCalled();
    expect(mockStreamText).toHaveBeenCalledWith(expect.objectContaining({
      maxRetries: 0,
      output: expect.objectContaining({
        kind: "mock-output-json",
      }),
    }));
  });

  it("can disable text fallback for strict native JSON call sites", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockRejectedValueOnce(new Error("The operation was aborted due to timeout"));

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "Return JSON.",
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("text fallback is disabled")
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith("llm.attempt", expect.objectContaining({
      success: false,
      strategy: "full_retry",
      primaryStrategy: "native_json",
      fallbackStrategy: "text_fallback",
      error: expect.stringContaining("text fallback is disabled"),
    }));
  });

  it("can disable repair for strict native JSON call sites", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      output: { hp: "five" },
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "Return JSON.",
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("Zod validation failed")
    );

    expect(mockGenerateText).toHaveBeenCalledTimes(1);
    expect(mockOutputJson).toHaveBeenCalledTimes(1);
    expect(mockLogEvent).toHaveBeenCalledWith("llm.attempt", expect.objectContaining({
      success: false,
      strategy: "full_retry",
      primaryStrategy: "native_json",
      fallbackStrategy: "text_fallback",
      error: expect.stringContaining("Zod validation failed"),
    }));
  });

  it("does not coerce final narration evidenceRefs strings in strict schema mode", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      output: {
        version: "grounded-sentence-draft.v2",
        sentences: [
          {
            text: "The clerk lowers his voice.",
            evidenceRefs: "perceivable_response:one,perceivable_effect:two",
          },
        ],
      },
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        version: z.literal("grounded-sentence-draft.v2"),
        sentences: z.array(z.object({
          text: z.string(),
          evidenceRefs: z.array(z.string()).min(1).max(4),
        }).strict()).min(1).max(5),
      }).strict(),
      prompt: "Return final narration JSON.",
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("Zod validation failed")
    );
  });

  it("does not truncate excess final narration sentences in strict schema mode", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      output: {
        version: "grounded-sentence-draft.v2",
        sentences: Array.from({ length: 6 }, (_, index) => ({
          text: `Visible sentence ${index + 1}.`,
          evidenceRefs: [`perceivable_effect:${index + 1}`],
        })),
      },
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        version: z.literal("grounded-sentence-draft.v2"),
        sentences: z.array(z.object({
          text: z.string(),
          evidenceRefs: z.array(z.string()).min(1).max(4),
        }).strict()).min(1).max(5),
      }).strict(),
      prompt: "Return final narration JSON.",
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("Zod validation failed")
    );
  });

  it("does not wrap bare arrays in strict schema mode", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      output: ["perceivable_effect:one"],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        evidenceRefs: z.array(z.string()).min(1),
      }).strict(),
      prompt: "Return final narration JSON.",
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    })).rejects.toSatisfy((error: unknown) =>
      isSafeGenerateObjectError(error)
      && error instanceof Error
      && error.message.includes("Zod validation failed")
    );
  });

  it("preserves native JSON failure diagnostics when AI SDK output is unavailable", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "z-ai",
        providerName: "GLM",
        model: "glm-5-turbo",
        protocol: "openai-compatible",
        baseUrl: "https://api.z.ai/api/coding/paas/v4",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValueOnce({
      text: "",
      get output() {
        throw new Error("No output generated");
      },
      usage: {
        inputTokens: 100,
        outputTokens: 32,
        totalTokens: 132,
        reasoningTokens: 0,
      },
      response: {
        modelId: "glm-5-turbo",
      },
      finishReason: "length",
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "Return JSON.",
      mode: "native_json",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
    })).rejects.toSatisfy((error: unknown) => {
      const code = getSafeGenerateObjectErrorCode(error);
      return isSafeGenerateObjectError(error)
        && isSafeGenerateObjectContractErrorCode(code)
        && code === "native_output_unavailable"
        && error instanceof Error
        && error.message.includes("No output generated");
    });

    expect(mockLogEvent).toHaveBeenCalledWith("llm.attempt", expect.objectContaining({
      success: false,
      primaryStrategy: "native_json",
      usage: {
        inputTokens: 100,
        outputTokens: 32,
        totalTokens: 132,
        reasoningTokens: 0,
        cachedInputTokens: undefined,
      },
      responseModel: "glm-5-turbo",
      finishReason: "length",
      error: expect.stringContaining("No output generated"),
    }));
  });

  it("uses AI SDK tool calls for explicit tool mode", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      toolCalls: [
        {
          type: "tool-call",
          toolName: "structured_output",
          input: { hp: 5 },
        },
      ],
    });

    const schema = z.object({
      hp: z.number(),
    });
    const result = await safeGenerateObject({
      model: model as never,
      schema,
      prompt: "test",
      mode: "tool",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.requestedMode).toBe("tool");
    expect(result.trace.strategy).toBe("tool_mode");
    expect(result.trace.primaryStrategy).toBe("tool_mode");
    expect(mockTool).toHaveBeenCalledWith(expect.objectContaining({
      inputSchema: schema,
      strict: true,
    }));
    expect(mockGenerateText).toHaveBeenCalledWith(expect.objectContaining({
      tools: expect.objectContaining({
        structured_output: expect.objectContaining({
          kind: "mock-tool",
        }),
      }),
      toolChoice: {
        type: "tool",
        toolName: "structured_output",
      },
    }));
  });

  it("includes exact literal values in tool-mode schema hints", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    const schema = z.object({
      version: z.literal("grounded-sentence-draft.v2"),
      sentences: z.array(z.object({
        text: z.string().describe("One concise player-visible narration sentence."),
        evidenceRefs: z
          .array(z.string().describe("Exact packet evidence id."))
          .describe("One to four exact evidence ids."),
      })).describe("Hard cap: one to five grounded visible narration sentence objects; never return six or more."),
    }).strict();
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [
        {
          type: "tool-call",
          toolName: "structured_output",
          input: {
            version: "grounded-sentence-draft.v2",
            sentences: [
              {
                text: "The witness points east.",
                evidenceRefs: ["perceivable_effect:1"],
              },
            ],
          },
        },
      ],
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema,
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
      allowRepair: false,
      strictSchema: true,
    });

    expect(result.object.version).toBe("grounded-sentence-draft.v2");
    const call = mockGenerateText.mock.calls[0]?.[0] as { system?: string } | undefined;
    expect(call?.system).toContain('"version": "grounded-sentence-draft.v2"');
    expect(call?.system).toContain('"text": "string value"');
    expect(call?.system).toContain('"evidenceRefs": [');
    expect(call?.system).not.toContain('"sentences": [\n    "Hard cap: one to five grounded visible narration sentence objects; never return six or more."');
    expect(call?.system).not.toContain('"version": "value"');
  });

  it("uses AI SDK step tool calls with args for explicit tool mode", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      steps: [
        {
          toolCalls: [
            {
              type: "tool-call",
              toolName: "structured_output",
              args: { hp: 6 },
            },
          ],
        },
      ],
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      mode: "tool",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 6 });
    expect(result.trace.strategy).toBe("tool_mode");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("uses AI SDK step tool calls with arguments for explicit tool mode", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      steps: [
        {
          toolCalls: [
            {
              type: "tool-call",
              toolName: "structured_output",
              arguments: { hp: 7 },
            },
          ],
        },
      ],
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      mode: "tool",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 7 });
    expect(result.trace.strategy).toBe("tool_mode");
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("surfaces a typed missing-tool error when explicit tool mode does not call the structured output tool", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({ hp: z.number() }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "missing_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    expect(mockLogEvent.mock.calls.filter(([name]) => name === "llm.structured_output_invalid_tool_call")).toEqual([]);
  });

  it("separates strict output contract failures from transport interruptions", () => {
    expect(([
      "missing_structured_tool_call",
      "invalid_structured_tool_call",
      "schema_validation_failed",
      "native_output_unavailable",
      "invalid_json",
    ] as const).every((code) => isSafeGenerateObjectContractErrorCode(code))).toBe(true);
    expect(isSafeGenerateObjectContractErrorCode("text_fallback_disabled")).toBe(false);
    expect(isSafeGenerateObjectContractErrorCode(null)).toBe(false);
  });

  it("exposes the read-only trace from a structured generation error", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [],
    });

    let captured: unknown;
    try {
      await safeGenerateObject({
        model: model as never,
        schema: z.object({ hp: z.number() }),
        prompt: "test",
        mode: "tool",
        retries: 1,
        allowTextFallback: false,
      });
    } catch (error) {
      captured = error;
    }

    expect(getSafeGenerateObjectTrace(captured)).toMatchObject({
      strategy: "full_retry",
      primaryStrategy: "tool_mode",
      finishReason: "tool-calls",
    });
    expect(getSafeGenerateObjectTrace(new Error("other"))).toBeNull();
  });

  it("surfaces a typed invalid-tool error when explicit tool mode returns invalid structured output arguments", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [
        {
          type: "tool-call",
          toolName: "structured_output",
          invalid: true,
          input: { secret: "raw-invalid-argument" },
        },
      ],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({ hp: z.number() }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const diagnostics = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload);
    expect(diagnostics).toEqual([{
      toolName: "structured_output",
      source: "result",
      stepIndex: null,
      toolCallIndex: 0,
      argumentCarrier: "input",
      argumentType: "object",
      directToolCallCount: 1,
      stepToolCallCount: 0,
      matchingToolCallCount: 1,
      invalidMatchingToolCallCount: 1,
      schemaParseOutcome: "invalid",
      schemaIssueCount: 1,
      schemaIssuesTruncated: false,
      schemaIssues: [{
        issueIndex: 0,
        code: "invalid_type",
        path: ["hp"],
        valueState: "missing",
        valueType: null,
        schemaLiteralCount: 0,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "unavailable",
      }],
    }]);
    expect(JSON.stringify(diagnostics)).not.toContain("raw-invalid-argument");
  });

  it("records bounded origin metadata for an invalid structured output step call", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [],
      steps: [{
        toolCalls: [
          { type: "tool-call", toolName: "other_tool" },
          {
            type: "tool-call",
            toolName: "structured_output",
            invalid: true,
            arguments: null,
            secret: "provider-response-prose",
          },
        ],
      }],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({ hp: z.number() }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const diagnostics = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload);
    expect(diagnostics).toEqual([{
      toolName: "structured_output",
      source: "step",
      stepIndex: 0,
      toolCallIndex: 1,
      argumentCarrier: "arguments",
      argumentType: "null",
      directToolCallCount: 0,
      stepToolCallCount: 2,
      matchingToolCallCount: 1,
      invalidMatchingToolCallCount: 1,
      schemaParseOutcome: "invalid",
      schemaIssueCount: 1,
      schemaIssuesTruncated: false,
      schemaIssues: [{
        issueIndex: 0,
        code: "invalid_type",
        path: [],
        valueState: "present",
        valueType: "null",
        schemaLiteralCount: 0,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "unavailable",
      }],
    }]);
    expect(JSON.stringify(diagnostics)).not.toContain("provider-response-prose");
  });

  it("records only safe schema issue coordinates for invalid arguments", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: {
          extraSentinel: "PLAYER_RAW_VALUE",
          nested: { safeField: 7, rawActorName: "Dren Vask" },
        },
      }],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        nested: z.object({ safeField: z.string() }),
      }).strict(),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload);
    expect(diagnostic).toMatchObject({
      schemaParseOutcome: "invalid",
      schemaIssueCount: 2,
      schemaIssuesTruncated: false,
      schemaIssues: [
        { issueIndex: 0, code: "invalid_type", path: ["nested", "safeField"] },
        { issueIndex: 1, code: "unrecognized_keys", path: [] },
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain("PLAYER_RAW_VALUE");
    expect(JSON.stringify(diagnostic)).not.toContain("Dren Vask");
    expect(JSON.stringify(diagnostic)).not.toContain("extraSentinel");
    expect(JSON.stringify(diagnostic)).not.toContain("rawActorName");
  });

  it("masks dynamic record keys while preserving nested schema-owned paths", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: { metadata: { PLAYER_SENTINEL: { known: "wrong" } } },
      }],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({
        metadata: z.record(z.string(), z.object({ known: z.number() })),
      }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload);
    expect(diagnostic).toMatchObject({
      schemaParseOutcome: "invalid",
      schemaIssueCount: 1,
      schemaIssuesTruncated: false,
      schemaIssues: [{
        issueIndex: 0,
        code: "invalid_type",
        path: ["metadata", "[dynamic]", "known"],
      }],
    });
    expect(JSON.stringify(diagnostic)).not.toContain("PLAYER_SENTINEL");
    expect(JSON.stringify(diagnostic)).not.toContain("wrong");
  });

  it("traverses named definition children while masking dynamic keys", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    const Node: z.ZodTypeAny = z.lazy(() => z.object({
      known: z.number(),
      metadata: z.record(z.string(), z.object({ innerKnown: z.number() })),
      child: Node.optional(),
    }));
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: {
          root: {
            known: "wrong",
            metadata: { PLAYER_SENTINEL: { innerKnown: "wrong" } },
          },
        },
      }],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({ root: Node }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload);
    expect(diagnostic).toMatchObject({
      schemaParseOutcome: "invalid",
      schemaIssueCount: 2,
      schemaIssuesTruncated: false,
      schemaIssues: [
        { issueIndex: 0, code: "invalid_type", path: ["root", "known"] },
        { issueIndex: 1, code: "invalid_type", path: ["root", "metadata", "[dynamic]", "innerKnown"] },
      ],
    });
    expect(JSON.stringify(diagnostic)).not.toContain("PLAYER_SENTINEL");
    expect(JSON.stringify(diagnostic)).not.toContain("wrong");
  });

  it("flattens union issue branches in order and caps safe coordinates", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    const shape: Record<string, z.ZodTypeAny> = {
      kind: z.union([z.literal("a"), z.literal("b"), z.literal("c")]),
    };
    for (let index = 0; index < 9; index += 1) shape[`field${index}`] = z.string();
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: { kind: "unexpected" },
      }],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object(shape),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload) as Array<Record<string, unknown>>;
    expect(diagnostic).toMatchObject({
      schemaParseOutcome: "invalid",
      schemaIssueCount: 12,
      schemaIssuesTruncated: true,
      schemaIssues: [
        { issueIndex: 0, code: "invalid_value", path: ["kind"] },
        { issueIndex: 1, code: "invalid_value", path: ["kind"] },
        { issueIndex: 2, code: "invalid_value", path: ["kind"] },
        { issueIndex: 3, code: "invalid_type", path: ["field0"] },
        { issueIndex: 4, code: "invalid_type", path: ["field1"] },
        { issueIndex: 5, code: "invalid_type", path: ["field2"] },
        { issueIndex: 6, code: "invalid_type", path: ["field3"] },
        { issueIndex: 7, code: "invalid_type", path: ["field4"] },
      ],
    });
    expect((diagnostic as { schemaIssues: unknown[] }).schemaIssues).toHaveLength(8);
  });

  it("reports valid schema input for an SDK-invalid call without changing the error", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: { hp: 7 },
      }],
    });

    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({ hp: z.number() }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error)
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload);
    expect(diagnostic).toMatchObject({
      schemaParseOutcome: "valid",
      schemaIssueCount: 0,
      schemaIssuesTruncated: false,
      schemaIssues: [],
    });
  });

  it("classifies a missing discriminated-union value against reachable literals", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: { PLAYER_RAW_VALUE: "do-not-log" },
      }],
    });

    const schema = z.discriminatedUnion("disposition", [
      z.object({ disposition: z.literal("deterministic") }),
      z.object({ disposition: z.literal("uncertain") }),
      z.object({ disposition: z.literal("impossible") }),
      z.object({ disposition: z.literal("clarification_required") }),
    ]);
    await expect(safeGenerateObject({
      model: model as never,
      schema,
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
      && isSafeGenerateObjectError(error),
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload) as Array<Record<string, unknown>>;
    expect(diagnostic.schemaIssues).toEqual([{
      issueIndex: 0,
      code: "invalid_union",
      path: ["disposition"],
      valueState: "missing",
      valueType: null,
      schemaLiteralCount: 4,
      schemaLiteralsTruncated: false,
      schemaLiteralMatch: "none",
    }]);
    expect(JSON.stringify(diagnostic)).not.toContain("PLAYER_RAW_VALUE");
    expect(JSON.stringify(diagnostic)).not.toContain("do-not-log");
  });

  it("classifies normalized and unrelated invalid string literals without exposing values", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    const schema = z.object({ disposition: z.enum(["deterministic", "uncertain"]) });
    mockGenerateText
      .mockResolvedValueOnce({
        text: "",
        finishReason: "tool-calls",
        toolCalls: [{
          type: "tool-call",
          toolName: "structured_output",
          invalid: true,
          input: { disposition: "  DETERMINISTIC  " },
        }],
      })
      .mockResolvedValueOnce({
        text: "",
        finishReason: "tool-calls",
        toolCalls: [{
          type: "tool-call",
          toolName: "structured_output",
          invalid: true,
          input: { disposition: "PLAYER_NOT_ALLOWED" },
        }],
      });

    const options = {
      model: model as never,
      schema,
      prompt: "test",
      mode: "tool" as const,
      retries: 1,
      allowTextFallback: false,
    };
    await expect(safeGenerateObject(options)).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call",
    );
    await expect(safeGenerateObject(options)).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call",
    );

    const diagnostics = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload) as Array<Record<string, unknown>>;
    expect(diagnostics.map((diagnostic) => (diagnostic.schemaIssues as Array<Record<string, unknown>>)[0])).toEqual([
      {
        issueIndex: 0,
        code: "invalid_value",
        path: ["disposition"],
        valueState: "present",
        valueType: "string",
        schemaLiteralCount: 2,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "normalized_string",
      },
      {
        issueIndex: 0,
        code: "invalid_value",
        path: ["disposition"],
        valueState: "present",
        valueType: "string",
        schemaLiteralCount: 2,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "none",
      },
    ]);
    const serialized = JSON.stringify(diagnostics);
    expect(serialized).not.toContain("PLAYER_NOT_ALLOWED");
    expect(serialized).not.toContain("DETERMINISTIC");
  });

  it("classifies an exact literal from an intersected schema constraint", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: { mode: "alpha" },
      }],
    });

    const schema = z.object({ mode: z.literal("alpha").and(z.string().min(10)) });
    await expect(safeGenerateObject({
      model: model as never,
      schema,
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call",
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload) as Array<Record<string, unknown>>;
    expect((diagnostic.schemaIssues as Array<Record<string, unknown>>)[0]).toMatchObject({
      path: ["mode"],
      valueState: "present",
      valueType: "string",
      schemaLiteralCount: 1,
      schemaLiteralsTruncated: false,
      schemaLiteralMatch: "exact",
    });
  });

  it("resolves named definitions and array literals while keeping dynamic keys masked", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [{
        type: "tool-call",
        toolName: "structured_output",
        invalid: true,
        input: {
          root: {
            mode: " ALPHA ",
            values: ["THREE"],
            metadata: { PLAYER_DYNAMIC_KEY: { known: "MAYBE" } },
          },
        },
      }],
    });

    const Node: z.ZodTypeAny = z.lazy(() => z.object({
      mode: z.enum(["alpha", "beta"]),
      values: z.array(z.enum(["one", "two"])),
      metadata: z.record(z.string(), z.object({ known: z.enum(["yes", "no"]) })),
      child: Node.optional(),
    }));
    await expect(safeGenerateObject({
      model: model as never,
      schema: z.object({ root: Node }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    })).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call",
    );

    const [diagnostic] = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload) as Array<Record<string, unknown>>;
    expect(diagnostic.schemaIssues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: ["root", "mode"],
        valueState: "present",
        valueType: "string",
        schemaLiteralCount: 2,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "normalized_string",
      }),
      expect.objectContaining({
        path: ["root", "values", 0],
        valueState: "present",
        valueType: "string",
        schemaLiteralCount: 2,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "none",
      }),
      expect.objectContaining({
        path: ["root", "metadata", "[dynamic]", "known"],
        valueState: "present",
        valueType: "string",
        schemaLiteralCount: 2,
        schemaLiteralsTruncated: false,
        schemaLiteralMatch: "none",
      }),
    ]));
    const serialized = JSON.stringify(diagnostic);
    expect(serialized).not.toContain("PLAYER_DYNAMIC_KEY");
    expect(serialized).not.toContain("MAYBE");
  });

  it("keeps scalar and missing argument carriers private", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText
      .mockResolvedValueOnce({
        text: "",
        finishReason: "tool-calls",
        toolCalls: [{
          type: "tool-call",
          toolName: "structured_output",
          invalid: true,
          args: "PLAYER_RAW_SCALAR",
        }],
      })
      .mockResolvedValueOnce({
        text: "",
        finishReason: "tool-calls",
        toolCalls: [{
          type: "tool-call",
          toolName: "structured_output",
          invalid: true,
        }],
      });

    const options = {
      model: model as never,
      schema: z.object({ hp: z.number() }),
      prompt: "test",
      mode: "tool" as const,
      retries: 1,
      allowTextFallback: false,
    };
    await expect(safeGenerateObject(options)).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
    );
    await expect(safeGenerateObject(options)).rejects.toSatisfy((error: unknown) =>
      getSafeGenerateObjectErrorCode(error) === "invalid_structured_tool_call"
    );
    const diagnostics = mockLogEvent.mock.calls
      .filter(([name]) => name === "llm.structured_output_invalid_tool_call")
      .map(([, payload]) => payload) as Array<Record<string, unknown>>;
    expect(diagnostics.map(({ argumentCarrier, argumentType, schemaParseOutcome, schemaIssueCount, schemaIssues }) =>
      ({ argumentCarrier, argumentType, schemaParseOutcome, schemaIssueCount, schemaIssues }))).toEqual([
        {
          argumentCarrier: "args",
          argumentType: "string",
          schemaParseOutcome: "invalid",
          schemaIssueCount: 1,
          schemaIssues: [{
            issueIndex: 0,
            code: "invalid_type",
            path: [],
            valueState: "present",
            valueType: "string",
            schemaLiteralCount: 0,
            schemaLiteralsTruncated: false,
            schemaLiteralMatch: "unavailable",
          }],
        },
        {
          argumentCarrier: "none",
          argumentType: "missing",
          schemaParseOutcome: "invalid",
          schemaIssueCount: 1,
          schemaIssues: [{
            issueIndex: 0,
            code: "invalid_type",
            path: [],
            valueState: "missing",
            valueType: null,
            schemaLiteralCount: 0,
            schemaLiteralsTruncated: false,
            schemaLiteralMatch: "unavailable",
          }],
        },
      ]);
    expect(JSON.stringify(diagnostics)).not.toContain("PLAYER_RAW_SCALAR");
  });

  it("prefers a valid structured output call over an invalid matching call without logging invalid diagnostics", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "tool-capable-model",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText.mockResolvedValue({
      text: "",
      finishReason: "tool-calls",
      toolCalls: [
        {
          type: "tool-call",
          toolName: "structured_output",
          invalid: true,
          args: { secret: "ignored-invalid" },
        },
        {
          type: "tool-call",
          toolName: "structured_output",
          input: { hp: 8 },
        },
      ],
    });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({ hp: z.number() }),
      prompt: "test",
      mode: "tool",
      retries: 1,
      allowTextFallback: false,
    });

    expect(result.object).toEqual({ hp: 8 });
    expect(mockLogEvent.mock.calls.filter(([name]) => name === "llm.structured_output_invalid_tool_call")).toEqual([]);
  });

  it("validates native_schema output with Zod before returning and falls back to text JSON on failure", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "openrouter",
        providerName: "OpenRouter",
        model: "mimo-test",
        protocol: "openai-compatible",
        baseUrl: "https://openrouter.ai/api/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText
      .mockResolvedValueOnce({
        text: "",
        output: { hp: "five" },
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({ hp: 5 }),
      });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.strategy).toBe("text_fallback");
    expect(result.trace.primaryStrategy).toBe("native_schema");
    expect(result.trace.fallbackReason).toContain("Zod validation failed");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
  });

  it("falls back from NoObjectGeneratedError to text_fallback and logs bounded strategy metadata", async () => {
    const model = {};
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: "moonshot",
        providerName: "Kimi",
        model: "kimi-test",
        protocol: "openai-compatible",
        baseUrl: "https://api.moonshot.test/v1",
        transport: "chat-completions",
      }),
    );
    mockGenerateText
      .mockRejectedValueOnce(new MockNoObjectGeneratedError("native schema rejected"))
      .mockResolvedValueOnce({
        text: JSON.stringify({ hp: 5 }),
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
        },
        response: {
          modelId: "kimi-test",
        },
      });

    const result = await safeGenerateObject({
      model: model as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "SECRET_PROMPT_BODY",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace.strategy).toBe("text_fallback");
    expect(result.trace.primaryStrategy).toBe("native_schema");
    expect(result.trace.fallbackReason).toContain("NoObjectGeneratedError");
    expect(mockGenerateText.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      system: expect.stringContaining("valid JSON only"),
    }));
    expect(mockLogEvent).toHaveBeenCalledWith("llm.attempt", expect.objectContaining({
      strategy: "text_fallback",
      primaryStrategy: "native_schema",
      fallbackStrategy: "text_fallback",
      fallbackReason: expect.stringContaining("NoObjectGeneratedError"),
      responseModel: "kimi-test",
      usage: {
        inputTokens: 10,
        outputTokens: 5,
        totalTokens: 15,
        reasoningTokens: undefined,
        cachedInputTokens: undefined,
      },
    }));
    expect(JSON.stringify(mockLogEvent.mock.calls)).not.toContain("SECRET_PROMPT_BODY");
  });

  it("coerces string-array elements from object payloads with item-like keys", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        equippedItems: [
          { name: "White Lightning" },
          { item: "Seal Eyepatch" },
          { label: "Travel Papers" },
        ],
      }),
    });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        equippedItems: z.array(z.string()),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object).toEqual({
      equippedItems: [
        "White Lightning",
        "Seal Eyepatch",
        "Travel Papers",
      ],
    });
  });

  it("coerces primitive record fields into value objects", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({
        plannedActions: [
          {
            toolName: "log_event",
            input: "address",
            payload: "Satoru Gojo",
          },
        ],
      }),
    });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        plannedActions: z.array(z.object({
          toolName: z.enum(["log_event"]),
          input: z.record(z.string(), z.unknown()).optional(),
          payload: z.record(z.string(), z.unknown()).optional(),
        })),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object.plannedActions[0]?.input).toEqual({ value: "address" });
    expect(result.object.plannedActions[0]?.payload).toEqual({ value: "Satoru Gojo" });
  });

  it("returns trace metadata including reasoning, usage, and response details", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ hp: 5 }),
      reasoningText: "The answer is stable and does not require any repair.",
      usage: {
        inputTokens: 120,
        outputTokens: 18,
        totalTokens: 138,
        reasoningTokens: 44,
        cachedInputTokens: 12,
      },
      response: {
        id: "resp-123",
        modelId: "glm-5.1",
        timestamp: new Date("2026-04-22T07:00:00.000Z"),
      },
      providerMetadata: {
        openai: { cached: true },
      },
      finishReason: "stop",
    });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(result.trace).toEqual(expect.objectContaining({
      text: "{\"hp\":5}",
      cleanedText: "{\"hp\":5}",
      requestedMode: "auto",
      strategy: "text_fallback",
      primaryStrategy: "text_fallback",
      fallbackStrategy: "text_fallback",
      reasoningText: "The answer is stable and does not require any repair.",
      usage: {
        inputTokens: 120,
        outputTokens: 18,
        totalTokens: 138,
        reasoningTokens: 44,
        cachedInputTokens: 12,
      },
      response: {
        id: "resp-123",
        modelId: "glm-5.1",
        timestamp: "2026-04-22T07:00:00.000Z",
      },
      providerMetadata: {
        openai: { cached: true },
      },
      finishReason: "stop",
    }));
  });

  it("extracts reasoning from Z.AI chat response body when ai-sdk reasoningText is empty", async () => {
    mockGenerateText.mockResolvedValue({
      text: JSON.stringify({ hp: 5 }),
      reasoningText: undefined,
      response: {
        modelId: "glm-5.1",
        body: {
          choices: [
            {
              message: {
                content: "{\"hp\":5}",
                reasoning_content: "The model kept the visible answer short after internal analysis.",
                role: "assistant",
              },
            },
          ],
        },
      },
    });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.trace.reasoningText).toBe(
      "The model kept the visible answer short after internal analysis.",
    );
  });

  it("repairs schema-invalid research context JSON instead of rerunning the full generation", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: JSON.stringify({
          keyFacts: [
            "Tokyo Jujutsu High is a central Jujutsu Kaisen institution.",
            "Chakra mechanics are imported as the power-system overlay.",
          ],
          tonalNotes: ["Urban occult action"],
          citations: "jjk-world-structure: Tokyo Jujutsu High; naruto-power-system: chakra mechanics",
          canonicalNames: "Tokyo Jujutsu High, Kyoto Jujutsu High, Satoru Gojo, Naruto chakra",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          keyFacts: [
            "Tokyo Jujutsu High is a central Jujutsu Kaisen institution.",
            "Chakra mechanics are imported as the power-system overlay.",
          ],
          tonalNotes: ["Urban occult action"],
          citations: [
            {
              jobId: "jjk-world-structure",
              note: "Tokyo Jujutsu High institution context.",
            },
            {
              jobId: "naruto-power-system",
              note: "Chakra mechanics context.",
            },
          ],
          canonicalNames: {
            locations: ["Tokyo Jujutsu High", "Kyoto Jujutsu High"],
            factions: [],
            characters: ["Satoru Gojo"],
          },
        }),
        usage: {
          inputTokens: 250,
          outputTokens: 120,
          totalTokens: 370,
        },
      });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        keyFacts: z.array(z.string()),
        tonalNotes: z.array(z.string()),
        citations: z.array(z.object({
          jobId: z.string().max(64).optional(),
          url: z.string().optional(),
          note: z.string().max(300),
        })).max(24).optional(),
        canonicalNames: z.object({
          locations: z.array(z.string()).optional(),
          factions: z.array(z.string()).optional(),
          characters: z.array(z.string()).optional(),
        }).optional(),
      }),
      prompt: "compile generated context",
      timeout: { totalMs: 1234 },
      retries: 1,
    });

    expect(result.object.citations?.map((citation) => citation.jobId)).toEqual([
      "jjk-world-structure",
      "naruto-power-system",
    ]);
    expect(result.object.canonicalNames?.locations).toEqual([
      "Tokyo Jujutsu High",
      "Kyoto Jujutsu High",
    ]);
    expect(result.trace.strategy).toBe("repair");
    expect(result.trace.repair?.strategy).toBe("repair");
    expect(result.trace.repair?.issues).toContain("[citations]");
    expect(mockGenerateText).toHaveBeenCalledTimes(2);
    expect(mockGenerateText.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        maxRetries: 0,
        temperature: 0,
        timeout: { totalMs: 1234 },
        prompt: expect.stringContaining("Validation errors:"),
      }),
    );
  });

  it("includes bounded repair policy in the generic repair prompt", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts: "Tokyo Jujutsu High",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts: [{ note: "Tokyo Jujutsu High" }],
        }),
      });

    await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        facts: z.array(z.object({
          note: z.string(),
        })),
      }),
      prompt: "test repair policy",
      retries: 1,
    });

    const repairPrompt = String(mockGenerateText.mock.calls[1]?.[0]?.prompt ?? "");
    expect(repairPrompt).toContain("STRUCTURED_OUTPUT_CONTRACT: repair-policy.v1");
    expect(repairPrompt).toContain("may coerce");
    expect(repairPrompt).toContain("must never invent");
    expect(repairPrompt).toContain("semantic lore, actions, targets");
    expect(repairPrompt).toContain("new array elements with missing semantics");
    expect(repairPrompt).toContain("fail closed");
  });

  it("redacts backend refs from generic repair prompts before replaying invalid output", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts:
            "actor:actor-player reached location:loc-secret via route-secret-1, tool_result_8, action-result-1, response-visible-1, and 11111111-1111-4111-8111-111111111111",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts: [{ note: "The visible route changed." }],
        }),
      });

    await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        facts: z.array(z.object({
          note: z.string(),
        })),
      }),
      prompt: "test repair redaction",
      retries: 1,
    });

    const repairPrompt = String(mockGenerateText.mock.calls[1]?.[0]?.prompt ?? "");
    expect(repairPrompt).toContain("[backend ref hidden]");
    expect(repairPrompt).not.toContain("actor:actor-player");
    expect(repairPrompt).not.toContain("location:loc-secret");
    expect(repairPrompt).not.toContain("route-secret-1");
    expect(repairPrompt).not.toContain("tool_result_8");
    expect(repairPrompt).not.toContain("action-result-1");
    expect(repairPrompt).not.toContain("response-visible-1");
    expect(repairPrompt).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("applies caller repair redaction to validation issues and invalid output", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts: "The Hidden Tea Broker opens actor:secret-contact.",
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          facts: [{ note: "Hidden Tea Broker" }],
        }),
      });

    await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        facts: z.array(z.object({
          note: z.literal("Hidden Tea Broker"),
        })),
      }),
      prompt: "test repair caller redaction",
      retries: 1,
      repairRedactor: (text) => text.split("Hidden Tea Broker").join("[private term hidden]"),
    });

    const repairPrompt = String(mockGenerateText.mock.calls[1]?.[0]?.prompt ?? "");
    expect(repairPrompt).toContain("[private term hidden]");
    expect(repairPrompt).toContain("[backend ref hidden]");
    expect(repairPrompt).not.toContain("Hidden Tea Broker");
    expect(repairPrompt).not.toContain("actor:secret-contact");
  });

  it("extracts the first parseable balanced JSON payload after malformed prose braces", async () => {
    mockGenerateText.mockResolvedValue({
      text: "metadata: {not valid json}\nActual payload:\n{\"hp\":5}",
    });

    const result = await safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 1,
    });

    expect(result.object).toEqual({ hp: 5 });
    expect(mockGenerateText).toHaveBeenCalledTimes(1);
  });

  it("classifies structured-output failures for fallback callers", async () => {
    mockGenerateText
      .mockResolvedValueOnce({
        text: "not-json",
      })
      .mockResolvedValueOnce({
        text: "still-not-json",
      });

    await expect(safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 1,
    })).rejects.toSatisfy((error: unknown) => isSafeGenerateObjectError(error));
    expect(isSafeGenerateObjectError(new Error("NoObjectGeneratedError: native schema rejected"))).toBe(true);
  });

  it("labels exhausted attempt failures as full_retry before final throw", async () => {
    mockGenerateText.mockResolvedValue({
      text: "not-json",
    });

    await expect(safeGenerateObject({
      model: {} as never,
      schema: z.object({
        hp: z.number(),
      }),
      prompt: "test",
      retries: 2,
    })).rejects.toSatisfy((error: unknown) => {
      const trace = (error as { trace?: { strategy?: string } }).trace;
      return isSafeGenerateObjectError(error) && trace?.strategy === "full_retry";
    });

    const retryPayloads = mockLogEvent.mock.calls
      .filter(([eventName]) => eventName === "llm.attempt")
      .map(([, payload]) => payload as { strategy?: string; error?: string });
    expect(retryPayloads).toEqual([
      expect.objectContaining({
        strategy: "full_retry",
        error: expect.stringContaining("safeGenerateObject: invalid JSON"),
      }),
      expect.objectContaining({
        strategy: "full_retry",
        error: expect.stringContaining("safeGenerateObject: invalid JSON"),
      }),
    ]);
  });
});
