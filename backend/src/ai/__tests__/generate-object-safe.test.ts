import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
} from "../structured-output-capabilities.js";

const mockGenerateText = vi.fn();
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
  isSafeGenerateObjectError,
  safeGenerateObject,
} = await import("../generate-object-safe.js");

const repairPolicyPath = path.resolve(
  process.cwd(),
  "..",
  ".planning/phases/74-structured-prompt-contracts-and-model-facing-schema-hardenin/74-REPAIR-POLICY.md",
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

  it("documents the structured output repair policy source of truth", () => {
    const policy = fs.readFileSync(repairPolicyPath, "utf8");

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
      expect(entry.source).toMatch(/\.planning\/phases\/(73|74)-|backend\/src\//);
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
      system: expect.stringContaining("valid JSON object"),
      output: expect.objectContaining({
        kind: "mock-output-json",
      }),
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
