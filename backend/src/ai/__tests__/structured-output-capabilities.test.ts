import { describe, it, expect, vi, beforeEach } from "vitest";

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

const { createModel } = await import("../provider-registry.js");
const {
  getStructuredOutputModelMetadata,
  resolveStructuredOutputCapability,
} = await import("../structured-output-capabilities.js");

describe("structured output capability metadata", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOpenAIChatFn.mockReturnValue({ modelId: "openai-compatible-model" });
    mockAnthropicModelFn.mockReturnValue({ modelId: "anthropic-compatible-model" });
  });

  it("records OpenAI-compatible model metadata without secrets", () => {
    const model = createModel({
      id: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1///",
      apiKey: "Bearer sk-openrouter-secret",
      model: "openai/gpt-4o-mini",
      protocol: "openai-compatible",
    });

    const metadata = getStructuredOutputModelMetadata(model);

    expect(metadata).toMatchObject({
      providerId: "openrouter",
      providerName: "OpenRouter",
      model: "openai/gpt-4o-mini",
      protocol: "openai-compatible",
      baseUrlFamily: "openrouter.ai",
      transport: "chat-completions",
    });
    expect(metadata?.capabilityKey).toContain("openrouter");
    expect(metadata?.capabilityKey).toContain("OpenRouter");
    expect(metadata?.capabilityKey).toContain("openai/gpt-4o-mini");
    expect(metadata?.capabilityKey).toContain("openai-compatible");
    expect(metadata?.capabilityKey).toContain("openrouter.ai");
    expect(metadata?.capabilityKey).toContain("chat-completions");
    expect(JSON.stringify(metadata)).not.toContain("sk-openrouter-secret");
    expect(JSON.stringify(metadata)).not.toContain("Bearer");
  });

  it("records Anthropic-compatible model metadata with messages transport", () => {
    const model = createModel({
      id: "anthropic",
      name: "Anthropic",
      baseUrl: "https://api.anthropic.com",
      apiKey: "Bearer sk-ant-secret",
      model: "claude-sonnet-4-20250514",
      protocol: "anthropic-compatible",
    });

    const metadata = getStructuredOutputModelMetadata(model);

    expect(metadata).toMatchObject({
      providerId: "anthropic",
      providerName: "Anthropic",
      model: "claude-sonnet-4-20250514",
      protocol: "anthropic-compatible",
      baseUrlFamily: "api.anthropic.com",
      transport: "anthropic-messages",
    });
    expect(JSON.stringify(metadata)).not.toContain("sk-ant-secret");
    expect(JSON.stringify(metadata)).not.toContain("Bearer");
  });

  it("keeps wrapped reasoning models mapped to the original provider metadata", () => {
    mockOpenAIChatFn.mockReturnValue({ modelId: "glm-5.1" });

    const model = createModel({
      id: "glm",
      name: "ZAI",
      baseUrl: "https://api.z.ai/api/paas/v4",
      apiKey: "sk-glm-secret",
      model: "GLM-5.1",
    });

    expect(getStructuredOutputModelMetadata(model)).toMatchObject({
      providerId: "glm",
      providerName: "ZAI",
      model: "GLM-5.1",
      protocol: "openai-compatible",
      baseUrlFamily: "api.z.ai",
      transport: "chat-completions",
    });
  });

  it("resolves requested structured-output mode to strategy labels", () => {
    const model = createModel({
      id: "openai",
      name: "OpenAI",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-openai-secret",
      model: "gpt-4o",
    });

    const metadata = getStructuredOutputModelMetadata(model);
    const decision = resolveStructuredOutputCapability({
      metadata,
      requestedMode: "tool",
    });

    expect(decision).toMatchObject({
      primaryStrategy: "tool_mode",
      fallbackStrategy: "text_fallback",
      requestedMode: "tool",
      actualMode: "tool_mode",
      reason: expect.any(String),
    });
    expect(JSON.stringify(decision)).not.toContain("sk-openai-secret");
    expect(JSON.stringify(decision)).not.toContain("Bearer");
  });

  it("routes OpenCode chat-completions auto mode to json_object instead of json_schema", () => {
    const model = createModel({
      id: "opencode",
      name: "OpenCode",
      baseUrl: "https://opencode.ai/zen/v1/chat/completions",
      apiKey: "sk-opencode-secret",
      model: "deepseek-v4-flash",
      protocol: "openai-compatible",
    });

    const metadata = getStructuredOutputModelMetadata(model);
    const autoDecision = resolveStructuredOutputCapability({ metadata });
    const explicitSchemaDecision = resolveStructuredOutputCapability({
      metadata,
      requestedMode: "native_schema",
    });

    expect(autoDecision).toMatchObject({
      primaryStrategy: "native_json",
      actualMode: "native_json",
    });
    expect(explicitSchemaDecision).toMatchObject({
      primaryStrategy: "native_schema",
      actualMode: "native_schema",
    });
    expect(JSON.stringify(autoDecision)).not.toContain("sk-opencode-secret");
  });
});
