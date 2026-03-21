import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type ProviderProtocol = "openai-compatible" | "anthropic-compatible";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol?: ProviderProtocol;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return /\/v\d+$/i.test(normalized) ? normalized : `${normalized}/v1`;
}

export function resolveProviderProtocol(config: ProviderConfig): ProviderProtocol {
  if (config.protocol) {
    return config.protocol;
  }

  const normalized = normalizeBaseUrl(config.baseUrl).toLowerCase();
  const isAnthropicCompatible =
    normalized.includes("/anthropic") ||
    normalized.includes("anthropic.com");

  return isAnthropicCompatible
    ? "anthropic-compatible"
    : "openai-compatible";
}

export function createModel(config: ProviderConfig): LanguageModel {
  const protocol = resolveProviderProtocol(config);
  const baseURL = normalizeBaseUrl(config.baseUrl);

  if (protocol === "anthropic-compatible") {
    const authToken = config.apiKey.trim().replace(/^Bearer\s+/i, "") || "anthropic";
    const provider = createAnthropic({
      baseURL: normalizeAnthropicBaseUrl(baseURL),
      authToken,
      headers: {
        "x-api-key": authToken,
      },
    });
    return provider(config.model);
  }

  const provider = createOpenAI({
    baseURL,
    apiKey: config.apiKey || "ollama",
    structuredOutputs: false,
  });

  // Use Chat Completions API (not Responses API) for broad provider compatibility.
  // The Responses API is OpenAI-specific and fails on OpenRouter, Ollama, etc.
  return provider.chat(config.model);
}
