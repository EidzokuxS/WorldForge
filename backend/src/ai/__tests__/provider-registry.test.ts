import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelCreationOptions, ProviderConfig } from "../provider-registry.js";

// Mock both SDK providers before importing the module under test
const mockOpenAIChatFn = vi.fn();
const mockCreateOpenAI = vi.fn(() => ({ chat: mockOpenAIChatFn }));

const mockAnthropicModelFn = vi.fn();
const mockCreateAnthropic = vi.fn(() => mockAnthropicModelFn);
const { mockDiagnosticEvent } = vi.hoisted(() => ({
  mockDiagnosticEvent: vi.fn(),
}));

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
}));

const mockDefaultSettingsMiddleware = vi.fn((options) => ({
  specificationVersion: "v3" as const,
  _tag: "defaultSettings",
  options,
}));
const mockWrapLanguageModel = vi.fn(({ model, middleware }) => ({
  modelId: "wrapped-model",
  baseModel: model,
  middleware,
}));

vi.mock("ai", () => ({
  defaultSettingsMiddleware: mockDefaultSettingsMiddleware,
  wrapLanguageModel: mockWrapLanguageModel,
}));

vi.mock("../../lib/logger.js", () => ({
  createLogger: vi.fn(() => ({
    event: mockDiagnosticEvent,
  })),
}));

// Import after mocks are set up
const { createModel, resolveProviderProtocol, ZAI_CLAUDE_CODE_USER_AGENT } = await import(
  "../provider-registry.js"
);

describe("resolveProviderProtocol", () => {
  it('returns explicit protocol when set to "openai-compatible"', () => {
    const config: ProviderConfig = {
      id: "test",
      name: "Test",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "key",
      model: "model",
      protocol: "openai-compatible",
    };

    expect(resolveProviderProtocol(config)).toBe("openai-compatible");
  });

  it('returns explicit protocol when set to "anthropic-compatible"', () => {
    const config: ProviderConfig = {
      id: "test",
      name: "Test",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "key",
      model: "model",
      protocol: "anthropic-compatible",
    };

    expect(resolveProviderProtocol(config)).toBe("anthropic-compatible");
  });

  it('detects "anthropic-compatible" from anthropic.com in baseUrl', () => {
    const config: ProviderConfig = {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "key",
      model: "claude-3",
    };

    expect(resolveProviderProtocol(config)).toBe("anthropic-compatible");
  });

  it('detects "anthropic-compatible" from /anthropic path segment', () => {
    const config: ProviderConfig = {
      id: "proxy",
      name: "Proxy",
      baseUrl: "https://proxy.example.com/anthropic",
      apiKey: "key",
      model: "claude-3",
    };

    expect(resolveProviderProtocol(config)).toBe("anthropic-compatible");
  });

  it('defaults to "openai-compatible" for generic URLs', () => {
    const config: ProviderConfig = {
      id: "custom",
      name: "Custom",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3",
    };

    expect(resolveProviderProtocol(config)).toBe("openai-compatible");
  });

  it("handles URL detection case-insensitively", () => {
    const config: ProviderConfig = {
      id: "test",
      name: "Test",
      baseUrl: "https://API.ANTHROPIC.COM/V1",
      apiKey: "key",
      model: "model",
    };

    expect(resolveProviderProtocol(config)).toBe("anthropic-compatible");
  });
});

describe("createModel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAIChatFn.mockReturnValue({ modelId: "mock-model" });
    mockAnthropicModelFn.mockReturnValue({ modelId: "mock-model" });
  });

  it("creates an OpenAI-compatible model with correct baseURL, apiKey, and model name", () => {
    const config: ProviderConfig = {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test-key",
      model: "gpt-4o",
    };

    createModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-test-key",
    }));
    expect(mockOpenAIChatFn).toHaveBeenCalledWith("gpt-4o");
  });

  it("strips trailing slashes from baseUrl", () => {
    const config: ProviderConfig = {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1///",
      apiKey: "sk-key",
      model: "gpt-4o",
    };

    createModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-key",
    }));
  });

  it('uses "ollama" as fallback apiKey when apiKey is empty', () => {
    const config: ProviderConfig = {
      id: "ollama",
      name: "Ollama",
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama3",
    };

    createModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
    }));
    expect(mockOpenAIChatFn).toHaveBeenCalledWith("llama3");
  });

  it("creates an Anthropic-compatible model for anthropic.com URLs", () => {
    const config: ProviderConfig = {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-key",
      model: "claude-sonnet-4-20250514",
    };

    createModel(config);

    expect(mockCreateAnthropic).toHaveBeenCalledWith({
      baseURL: "https://api.anthropic.com/v1",
      authToken: "sk-ant-key",
      headers: {
        "x-api-key": "sk-ant-key",
      },
    });
    expect(mockAnthropicModelFn).toHaveBeenCalledWith("claude-sonnet-4-20250514");
    expect(mockCreateOpenAI).not.toHaveBeenCalled();
  });

  it("appends /v1 to Anthropic base URL when missing", () => {
    const config: ProviderConfig = {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "key",
      model: "claude-3",
    };

    createModel(config);

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.anthropic.com/v1",
      })
    );
  });

  it("does not double-append /v1 to Anthropic base URL", () => {
    const config: ProviderConfig = {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "key",
      model: "claude-3",
    };

    createModel(config);

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "https://api.anthropic.com/v1",
      })
    );
  });

  it("strips 'Bearer ' prefix from Anthropic API key", () => {
    const config: ProviderConfig = {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "Bearer sk-ant-key",
      model: "claude-3",
    };

    createModel(config);

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: "sk-ant-key",
        headers: {
          "x-api-key": "sk-ant-key",
        },
      })
    );
  });

  it('uses "anthropic" as fallback authToken when Anthropic apiKey is empty', () => {
    const config: ProviderConfig = {
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "",
      model: "claude-3",
    };

    createModel(config);

    expect(mockCreateAnthropic).toHaveBeenCalledWith(
      expect.objectContaining({
        authToken: "anthropic",
      })
    );
  });

  it("uses explicit protocol over URL-based detection", () => {
    const config: ProviderConfig = {
      id: "proxy",
      name: "Proxy",
      baseUrl: "https://api.anthropic.com/v1",
      apiKey: "key",
      model: "gpt-4o",
      protocol: "openai-compatible",
    };

    createModel(config);

    expect(mockCreateOpenAI).toHaveBeenCalled();
    expect(mockCreateAnthropic).not.toHaveBeenCalled();
  });

  it("returns the model object from the provider factory", () => {
    const fakeModel = { modelId: "test-model", provider: "openai" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-key",
      model: "gpt-4o",
    };

    const result = createModel(config);

    expect((result as unknown as { baseModel: unknown }).baseModel).toBe(fakeModel);
  });

  it("preserves default reasoning middleware behavior for non-storyteller callers", () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const result = createModel(config) as unknown as { baseModel: unknown };

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(result.baseModel).toBe(fakeModel);
  });

  it("identifies Z.AI requests as Claude Code without changing generic providers", () => {
    createModel({
      id: "zai-coding-plan",
      name: "ZAI Coding Plan",
      baseUrl: "https://api.z.ai/api/coding/paas/v4",
      apiKey: "key",
      model: "glm-5.3",
    });

    expect(mockCreateOpenAI).toHaveBeenLastCalledWith(expect.objectContaining({
      headers: { "User-Agent": ZAI_CLAUDE_CODE_USER_AGENT },
    }));

    createModel({
      id: "generic-openai-compatible",
      name: "Generic",
      baseUrl: "https://models.example.test/v1",
      apiKey: "key",
      model: "model",
    });

    expect(mockCreateOpenAI).toHaveBeenLastCalledWith(expect.not.objectContaining({
      headers: expect.anything(),
    }));
  });

  it("wraps reasoning-capable OpenAI-compatible models with reasoning settings", () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const result = createModel(config) as unknown as {
      baseModel: unknown;
      middleware: Array<{
        specificationVersion: "v3";
        transformParams?: (options: { params: Record<string, unknown> }) => Promise<Record<string, unknown>>;
        _tag?: string;
        options?: unknown;
      }>;
    };

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(result.baseModel).toBe(fakeModel);
    expect(mockDefaultSettingsMiddleware).toHaveBeenCalledWith({
      settings: {
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "high",
          },
        },
      },
    });
    expect(result.middleware).toHaveLength(3);
  });

  it("injects Z.AI thinking-disabled into chat completion bodies for explicit GLM bypass", async () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);
    let capturedBody: BodyInit | null | undefined;
    const response = new Response("{}", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "request-id": "req_success",
      },
    });
    const downstreamFetch = vi.fn(async (_input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
      capturedBody = init?.body;
      return response;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(downstreamFetch);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const options: ModelCreationOptions = { role: "storyteller", familyHint: "glm" };
    const result = createModel(config, options);
    const createOptions = (mockCreateOpenAI.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      fetch?: typeof globalThis.fetch;
    };

    expect((result as unknown as { baseModel: unknown }).baseModel).toBe(fakeModel);
    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(createOptions.fetch).toBeTypeOf("function");

    const returned = await createOptions.fetch!("https://api.z.ai/api/paas/v4/chat/completions", {
      method: "POST",
      body: JSON.stringify({
        model: "glm-5.1",
        messages: [{ role: "user", content: "Return JSON." }],
      }),
    });

    const sentBody = JSON.parse(String(capturedBody));
    expect(sentBody.thinking).toEqual({ type: "disabled" });
    expect(returned).toBe(response);
    await expect(returned.text()).resolves.toBe("{}");
    expect(mockDiagnosticEvent).toHaveBeenCalledTimes(1);
    const [eventName, payload] = mockDiagnosticEvent.mock.calls[0] as [string, unknown];
    expect(eventName).toBe("ai.zai_fetch.settlement");
    expect(payload).toMatchObject({
      response: {
        status: 200,
        contentType: "application/json",
        requestId: "req_success",
      },
      settlement: {
        outcome: "response",
      },
    });
    expect((payload as { settlement: { elapsedMs: number } }).settlement.elapsedMs).toBeGreaterThanOrEqual(0);
    expect((payload as { settlement: { elapsedMs: number } }).settlement.elapsedMs).toBeLessThanOrEqual(10_000_000);
    fetchSpy.mockRestore();
  });

  it("emits a settlement and one bounded failure diagnostic for a structured non-success response", async () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);
    const responseBody = JSON.stringify({
      error: {
        code: "invalid_parameter",
        param: "tools[0].function.parameters",
        message: "Invalid API parameter, please check the documentation.",
        secret: "do-not-log",
      },
      prompt: "private player prose",
    });
    const response = new Response(responseBody, {
      status: 400,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-request-id": "req_123",
      },
    });
    const downstreamFetch = vi.fn(async () => response);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(downstreamFetch);

    const createOptions = (createModel({
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "secret-api-key",
      model: "GLM-5.1",
    }, { role: "storyteller", familyHint: "glm" }) as unknown as { baseModel: unknown });
    expect(createOptions.baseModel).toBe(fakeModel);
    const fetch = (mockCreateOpenAI.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      fetch?: typeof globalThis.fetch;
    };

    const returned = await fetch.fetch!(
      "https://api.z.ai/api/paas/v4/chat/completions?api_key=secret",
      {
        method: "POST",
        headers: { authorization: "Bearer secret" },
        body: JSON.stringify({
          model: "glm-5.1",
          messages: [{ role: "user", content: "private player prose" }],
          tools: [{
            type: "function",
            function: {
              name: "private_tool",
              strict: true,
              parameters: { type: "object", properties: { secret: { type: "string" } } },
            },
          }],
          tool_choice: { type: "function", function: { name: "private_tool" } },
        }),
      },
    );

    expect(returned).toBe(response);
    await expect(returned.text()).resolves.toBe(responseBody);
    expect(mockDiagnosticEvent).toHaveBeenCalledTimes(2);
    const [settlementEventName, settlementPayload] = mockDiagnosticEvent.mock.calls[0] as [string, unknown];
    expect(settlementEventName).toBe("ai.zai_fetch.settlement");
    expect(settlementPayload).toMatchObject({
      response: {
        status: 400,
        contentType: "application/json; charset=utf-8",
        requestId: "req_123",
      },
      settlement: { outcome: "response" },
    });
    expect(JSON.stringify(settlementPayload)).not.toContain("providerError");
    const [eventName, payload] = mockDiagnosticEvent.mock.calls[1] as [string, unknown];
    expect(eventName).toBe("ai.zai_fetch.failure");
    expect(payload).toMatchObject({
      request: {
        method: "POST",
        endpointClass: "chat_completions",
        selectedMode: "tool",
      },
      response: {
        status: 400,
        contentType: "application/json; charset=utf-8",
        requestId: "req_123",
        providerErrorCode: "invalid_parameter",
        providerErrorParameter: "tools[0].function.parameters",
        providerErrorMessage: "Invalid API parameter, please check the documentation.",
      },
    });
    expect(JSON.stringify(payload)).not.toContain("secret");
    expect(JSON.stringify(payload)).not.toContain("private player prose");
    fetchSpy.mockRestore();
  });

  it("emits settlement and failure diagnostics and rethrows the original fetch error unchanged", async () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);
    const thrown = new Error("provider secret and player prose");
    const downstreamFetch = vi.fn(async () => {
      throw thrown;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(downstreamFetch);

    createModel({
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "secret-api-key",
      model: "GLM-5.1",
    }, { role: "storyteller", familyHint: "glm" });
    const fetch = (mockCreateOpenAI.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      fetch?: typeof globalThis.fetch;
    };

    await expect(
      fetch.fetch!("https://api.z.ai/api/paas/v4/chat/completions", {
        method: "POST",
        body: JSON.stringify({ model: "glm-5.1", messages: [] }),
      }),
    ).rejects.toBe(thrown);
    expect(downstreamFetch).toHaveBeenCalledTimes(1);
    expect(mockDiagnosticEvent).toHaveBeenCalledTimes(2);
    const [settlementEventName, settlementPayload] = mockDiagnosticEvent.mock.calls[0] as [string, unknown];
    expect(settlementEventName).toBe("ai.zai_fetch.settlement");
    expect(settlementPayload).toMatchObject({
      settlement: { outcome: "fetch_error" },
    });
    const [eventName, payload] = mockDiagnosticEvent.mock.calls[1] as [string, unknown];
    expect(eventName).toBe("ai.zai_fetch.failure");
    expect(payload).toMatchObject({
      request: { method: "POST", endpointClass: "chat_completions" },
    });
    expect(JSON.stringify(payload)).not.toContain("provider secret");
    fetchSpy.mockRestore();
  });

  it("classifies an aborted fetch separately while preserving error identity", async () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);
    const controller = new AbortController();
    const thrown = new Error("abort secret and player prose");
    const downstreamFetch = vi.fn(async (_input: Parameters<typeof globalThis.fetch>[0], init?: Parameters<typeof globalThis.fetch>[1]) => {
      expect(init?.signal).toBe(controller.signal);
      controller.abort();
      throw thrown;
    });
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(downstreamFetch);

    createModel({
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "secret-api-key",
      model: "GLM-5.1",
    }, { role: "storyteller", familyHint: "glm" });
    const fetch = (mockCreateOpenAI.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      fetch?: typeof globalThis.fetch;
    };

    await expect(
      fetch.fetch!("https://api.z.ai/api/paas/v4/chat/completions", {
        method: "POST",
        signal: controller.signal,
        body: JSON.stringify({ model: "glm-5.1", messages: [] }),
      }),
    ).rejects.toBe(thrown);
    expect(mockDiagnosticEvent).toHaveBeenCalledTimes(2);
    const [settlementEventName, settlementPayload] = mockDiagnosticEvent.mock.calls[0] as [string, unknown];
    expect(settlementEventName).toBe("ai.zai_fetch.settlement");
    expect(settlementPayload).toMatchObject({ settlement: { outcome: "aborted" } });
    const [eventName, payload] = mockDiagnosticEvent.mock.calls[1] as [string, unknown];
    expect(eventName).toBe("ai.zai_fetch.failure");
    expect(JSON.stringify(settlementPayload)).not.toContain("abort secret");
    expect(JSON.stringify(payload)).not.toContain("abort secret");
    fetchSpy.mockRestore();
  });

  it("keeps storyteller GLM requests on default reasoning without explicit bypass", () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const result = createModel(config, { role: "storyteller" }) as unknown as {
      baseModel: unknown;
    };

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(result.baseModel).toBe(fakeModel);
  });

  it("allows explicit GLM reasoning bypass for latency-sensitive judge calls", () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const result = createModel(config, { role: "judge", reasoningMode: "bypass" });
    const createOptions = (mockCreateOpenAI.mock.calls.at(-1) as unknown[] | undefined)?.[0] as {
      fetch?: typeof globalThis.fetch;
    };

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(createOptions.fetch).toBeTypeOf("function");
    expect((result as unknown as { baseModel: unknown }).baseModel).toBe(fakeModel);
  });

  it("keeps explicit reasoning bypass scoped to GLM-family providers", () => {
    const fakeModel = { modelId: "gpt-5" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "key",
      model: "gpt-5",
    };

    const result = createModel(config, { role: "judge", reasoningMode: "bypass" }) as unknown as {
      baseModel: unknown;
    };

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(result.baseModel).toBe(fakeModel);
  });

  it("can explicitly request non-glm behavior for storyteller role", () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const options: ModelCreationOptions = { role: "storyteller", familyHint: "baseline" };
    const result = createModel(config, options);

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect((result as unknown as { baseModel: unknown }).baseModel).toBe(fakeModel);
  });

  it("strips temperature from reasoning-model call params", async () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "GLM",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const result = createModel(config) as unknown as {
      middleware: Array<{
        specificationVersion: "v3";
        transformParams?: (options: { params: Record<string, unknown> }) => Promise<Record<string, unknown>>;
      }>;
    };

    let transformed: Record<string, unknown> = {
      temperature: 0.7,
      maxOutputTokens: 1024,
      providerOptions: { openai: { forceReasoning: true } },
    };
    for (const middleware of result.middleware) {
      if (middleware.transformParams) {
        transformed = await middleware.transformParams({ params: transformed });
      }
    }

    expect(transformed).toEqual({
      maxOutputTokens: 32_768,
      providerOptions: { openai: { forceReasoning: true } },
    });
  });

  it("enforces at least 32k output tokens while preserving larger budgets", async () => {
    const fakeModel = { modelId: "ordinary-model" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const result = createModel({
      id: "ordinary",
      name: "Ordinary",
      baseUrl: "https://example.com/v1",
      apiKey: "key",
      model: "ordinary-model",
    }) as unknown as {
      middleware: Array<{
        transformParams?: (options: { params: Record<string, unknown> }) => Promise<Record<string, unknown>>;
      }>;
    };

    const transform = result.middleware[0]?.transformParams;
    expect(transform).toBeTypeOf("function");
    await expect(transform!({ params: { maxOutputTokens: 4096 } })).resolves.toMatchObject({
      maxOutputTokens: 32_768,
    });
    await expect(transform!({ params: { maxOutputTokens: 65_536 } })).resolves.toMatchObject({
      maxOutputTokens: 65_536,
    });
    await expect(transform!({ params: {} })).resolves.toMatchObject({
      maxOutputTokens: 32_768,
    });
  });
});
