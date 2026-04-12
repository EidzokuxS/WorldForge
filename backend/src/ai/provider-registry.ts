import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  defaultSettingsMiddleware,
  type LanguageModel,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from "ai";

export type ProviderProtocol = "openai-compatible" | "anthropic-compatible";

export interface ProviderConfig {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  protocol?: ProviderProtocol;
}

export type ModelRole = "storyteller" | "judge" | "generator" | "embedder";

export interface ModelCreationOptions {
  role?: ModelRole;
  familyHint?: "baseline" | "glm";
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function normalizeAnthropicBaseUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl);
  return /\/v\d+$/i.test(normalized) ? normalized : `${normalized}/v1`;
}

function shouldForceReasoning(config: ProviderConfig): boolean {
  const haystack = `${config.name} ${config.model} ${config.baseUrl}`.toLowerCase();
  return /(glm-5|gpt-5|(^|[\s/_-])o[1345]($|[\s._-]))/.test(haystack);
}

function isGlmFamilyModel(config: ProviderConfig): boolean {
  const haystack = `${config.name} ${config.model} ${config.baseUrl}`.toLowerCase();
  return /\bglm\b/.test(haystack);
}

function shouldBypassReasoningForStoryteller(
  config: ProviderConfig,
  options?: ModelCreationOptions,
): boolean {
  if (options?.role !== "storyteller") {
    return false;
  }

  if (options.familyHint === "glm") {
    return true;
  }

  if (options.familyHint === "baseline") {
    return false;
  }

  return isGlmFamilyModel(config);
}

function reasoningMiddleware(): LanguageModelMiddleware[] {
  return [
    defaultSettingsMiddleware({
      settings: {
        providerOptions: {
          openai: {
            forceReasoning: true,
            reasoningEffort: "high",
          },
        },
      },
    }),
    {
      specificationVersion: "v3",
      transformParams: async ({ params }) => {
        const { temperature: _temperature, ...rest } = params;
        return rest;
      },
    },
  ];
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

export function createModel(
  config: ProviderConfig,
  options: ModelCreationOptions = {},
): LanguageModel {
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
  });

  // Use Chat Completions API (not Responses API) for broad provider compatibility.
  // The Responses API is OpenAI-specific and fails on OpenRouter, Ollama, etc.
  const model = provider.chat(config.model);
  const bypassReasoning = shouldBypassReasoningForStoryteller(config, options);

  if (bypassReasoning) {
    return model;
  }

  if (!shouldForceReasoning(config)) {
    return model;
  }

  return wrapLanguageModel({
    model,
    middleware: reasoningMiddleware(),
  });
}
