import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ModelCreationOptions, ProviderConfig } from "../provider-registry.js";

// Mock both SDK providers before importing the module under test
const mockOpenAIChatFn = vi.fn();
const mockCreateOpenAI = vi.fn(() => ({ chat: mockOpenAIChatFn }));

const mockAnthropicModelFn = vi.fn();
const mockCreateAnthropic = vi.fn(() => mockAnthropicModelFn);

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

// Import after mocks are set up
const { createModel, resolveProviderProtocol } = await import(
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

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-test-key",
    });
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

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "https://api.openai.com/v1",
      apiKey: "sk-key",
    });
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

    expect(mockCreateOpenAI).toHaveBeenCalledWith({
      baseURL: "http://localhost:11434/v1",
      apiKey: "ollama",
    });
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

    expect(result).toBe(fakeModel);
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

    const result = createModel(config) as { baseModel: unknown };

    expect(mockWrapLanguageModel).toHaveBeenCalledTimes(1);
    expect(result.baseModel).toBe(fakeModel);
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

    const result = createModel(config) as {
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
    expect(result.middleware).toHaveLength(2);
  });

  it("keeps storyteller GLM requests off the default reasoning wrapper when explicit", () => {
    const fakeModel = { modelId: "glm-5.1" };
    mockOpenAIChatFn.mockReturnValue(fakeModel);

    const config: ProviderConfig = {
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "key",
      model: "GLM-5.1",
    };

    const options: ModelCreationOptions = { role: "storyteller", familyHint: "glm" };
    const result = createModel(config, options);

    expect(mockWrapLanguageModel).not.toHaveBeenCalled();
    expect(result).toBe(fakeModel);
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
    expect((result as { baseModel: unknown }).baseModel).toBe(fakeModel);
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

    const result = createModel(config) as {
      middleware: Array<{
        specificationVersion: "v3";
        transformParams?: (options: { params: Record<string, unknown> }) => Promise<Record<string, unknown>>;
      }>;
    };

    const transform = result.middleware[1]?.transformParams;
    expect(transform).toBeTypeOf("function");

    const transformed = await transform!({
      params: { temperature: 0.7, maxOutputTokens: 1024, providerOptions: { openai: { forceReasoning: true } } },
    });

    expect(transformed).toEqual({
      maxOutputTokens: 1024,
      providerOptions: { openai: { forceReasoning: true } },
    });
  });
});
