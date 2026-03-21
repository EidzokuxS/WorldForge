import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ProviderConfig } from "../provider-registry.js";

// Mock both SDK providers before importing the module under test
const mockOpenAIModelFn = vi.fn();
const mockCreateOpenAI = vi.fn(() => mockOpenAIModelFn);

const mockAnthropicModelFn = vi.fn();
const mockCreateAnthropic = vi.fn(() => mockAnthropicModelFn);

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: mockCreateOpenAI,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: mockCreateAnthropic,
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
    mockOpenAIModelFn.mockReturnValue({ modelId: "mock-model" });
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
    expect(mockOpenAIModelFn).toHaveBeenCalledWith("gpt-4o");
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
    expect(mockOpenAIModelFn).toHaveBeenCalledWith("llama3");
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
    mockOpenAIModelFn.mockReturnValue(fakeModel);

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
});
