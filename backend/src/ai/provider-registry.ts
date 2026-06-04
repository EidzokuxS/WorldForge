import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import {
  defaultSettingsMiddleware,
  type LanguageModel,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from "ai";
import {
  buildStructuredOutputModelMetadata,
  rememberStructuredOutputModelMetadata,
  type StructuredOutputTransport,
} from "./structured-output-capabilities.js";

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
export type ModelReasoningMode = "default" | "bypass";

export interface ModelCreationOptions {
  role?: ModelRole;
  familyHint?: "baseline" | "glm";
  reasoningMode?: ModelReasoningMode;
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

function isZaiApiFamily(config: ProviderConfig): boolean {
  const haystack = `${config.name} ${config.baseUrl}`.toLowerCase();
  return /\bzai\b|z\.ai|zhipu/.test(haystack);
}

function shouldBypassReasoning(
  config: ProviderConfig,
  options?: ModelCreationOptions,
): boolean {
  if (options?.reasoningMode === "bypass") {
    return isGlmFamilyModel(config);
  }

  if (options?.role !== "storyteller") {
    return false;
  }

  if (options.familyHint === "glm") {
    return true;
  }

  return false;
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

function createZaiThinkingDisabledFetch(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : typeof (input as { url?: unknown }).url === "string"
          ? String((input as { url: string }).url)
          : "";

    if (!url.includes("/chat/completions") || typeof init?.body !== "string") {
      return fetchImpl(input, init);
    }

    try {
      const body = JSON.parse(init.body) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return fetchImpl(input, init);
      }

      return fetchImpl(input, {
        ...init,
        body: JSON.stringify({
          ...body,
          thinking: { type: "disabled" },
        }),
      });
    } catch {
      return fetchImpl(input, init);
    }
  };
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
  const rememberModelMetadata = (
    model: LanguageModel,
    transport: StructuredOutputTransport,
  ) => {
    rememberStructuredOutputModelMetadata(
      model,
      buildStructuredOutputModelMetadata({
        providerId: config.id,
        providerName: config.name,
        model: config.model,
        protocol,
        baseUrl: baseURL,
        transport,
      }),
    );
  };

  if (protocol === "anthropic-compatible") {
    const authToken = config.apiKey.trim().replace(/^Bearer\s+/i, "") || "anthropic";
    const provider = createAnthropic({
      baseURL: normalizeAnthropicBaseUrl(baseURL),
      authToken,
      headers: {
        "x-api-key": authToken,
      },
    });
    const model = provider(config.model);
    rememberModelMetadata(model, "anthropic-messages");
    return model;
  }

  const bypassReasoning = shouldBypassReasoning(config, options);
  const provider = createOpenAI({
    baseURL,
    apiKey: config.apiKey || "ollama",
    ...(bypassReasoning && isZaiApiFamily(config)
      ? { fetch: createZaiThinkingDisabledFetch() }
      : {}),
  });

  // Use Chat Completions API (not Responses API) for broad provider compatibility.
  // The Responses API is OpenAI-specific and fails on OpenRouter, Ollama, etc.
  const model = provider.chat(config.model);
  rememberModelMetadata(model, "chat-completions");

  if (bypassReasoning) {
    return model;
  }

  if (!shouldForceReasoning(config)) {
    return model;
  }

  const wrappedModel = wrapLanguageModel({
    model,
    middleware: reasoningMiddleware(),
  });
  rememberModelMetadata(wrappedModel, "chat-completions");
  return wrappedModel;
}
