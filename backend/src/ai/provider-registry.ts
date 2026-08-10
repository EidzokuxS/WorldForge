import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { MODEL_OUTPUT_TOKEN_MINIMUM } from "@worldforge/shared";
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
import { createLogger } from "../lib/logger.js";
import {
  buildZaiFetchDiagnostic,
  extractZaiProviderError,
  ZAI_FETCH_DIAGNOSTIC_EVENT,
} from "./zai-fetch-diagnostic.js";

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

function minimumOutputBudgetMiddleware(): LanguageModelMiddleware {
  return {
    specificationVersion: "v3",
    transformParams: async ({ params }) => ({
      ...params,
      maxOutputTokens: Math.max(
        params.maxOutputTokens ?? MODEL_OUTPUT_TOKEN_MINIMUM,
        MODEL_OUTPUT_TOKEN_MINIMUM,
      ),
    }),
  };
}

const zaiFetchDiagnosticLog = createLogger("zai-fetch-diagnostic");
const ZAI_FETCH_SETTLEMENT_EVENT = "ai.zai_fetch.settlement";
const MAX_ZAI_FETCH_SETTLEMENT_ELAPSED_MS = 10_000_000;

function zaiFetchSettlementElapsedMs(startedAt: number): number {
  return Math.max(
    0,
    Math.min(MAX_ZAI_FETCH_SETTLEMENT_ELAPSED_MS, Math.round(Date.now() - startedAt)),
  );
}

function parseJsonBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    return undefined;
  }
  try {
    return JSON.parse(init.body) as unknown;
  } catch {
    return undefined;
  }
}

async function readZaiProviderError(response: Response): Promise<ReturnType<typeof extractZaiProviderError>> {
  if (response.bodyUsed) {
    return {};
  }
  try {
    const text = await response.clone().text();
    if (text.length === 0 || text.length > 16_384) {
      return {};
    }
    return extractZaiProviderError(JSON.parse(text) as unknown);
  } catch {
    return {};
  }
}

function createZaiThinkingDisabledFetch(
  fetchImpl: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return async (input, init) => {
    const observeFetch = async (
      requestInput: Parameters<typeof fetchImpl>[0],
      requestInit: Parameters<typeof fetchImpl>[1],
      requestBody: unknown,
    ): Promise<Response> => {
      const startedAt = Date.now();
      try {
        const response = await fetchImpl(requestInput, requestInit);
        zaiFetchDiagnosticLog.event(
          ZAI_FETCH_SETTLEMENT_EVENT,
          {
            ...buildZaiFetchDiagnostic({
              input: requestInput,
              init: requestInit,
              body: requestBody,
              response: {
                status: response.status,
                contentType: response.headers.get("content-type") ?? undefined,
                requestId:
                  response.headers.get("x-request-id") ??
                  response.headers.get("request-id") ??
                  undefined,
              },
            }),
            settlement: {
              outcome: "response",
              elapsedMs: zaiFetchSettlementElapsedMs(startedAt),
            },
          },
        );
        if (!response.ok) {
          const providerError = await readZaiProviderError(response);
          zaiFetchDiagnosticLog.event(
            ZAI_FETCH_DIAGNOSTIC_EVENT,
            buildZaiFetchDiagnostic({
              input: requestInput,
              init: requestInit,
              body: requestBody,
              response: {
                status: response.status,
                contentType: response.headers.get("content-type") ?? undefined,
                requestId:
                  response.headers.get("x-request-id") ??
                  response.headers.get("request-id") ??
                  undefined,
                providerError,
              },
            }),
          );
        }
        return response;
      } catch (error) {
        zaiFetchDiagnosticLog.event(
          ZAI_FETCH_SETTLEMENT_EVENT,
          {
            ...buildZaiFetchDiagnostic({
              input: requestInput,
              init: requestInit,
              body: requestBody,
            }),
            settlement: {
              outcome: requestInit?.signal?.aborted ? "aborted" : "fetch_error",
              elapsedMs: zaiFetchSettlementElapsedMs(startedAt),
            },
          },
        );
        zaiFetchDiagnosticLog.event(
          ZAI_FETCH_DIAGNOSTIC_EVENT,
          buildZaiFetchDiagnostic({
            input: requestInput,
            init: requestInit,
            body: requestBody,
          }),
        );
        throw error;
      }
    };

    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : typeof (input as { url?: unknown }).url === "string"
          ? String((input as { url: string }).url)
          : "";

    if (!url.includes("/chat/completions") || typeof init?.body !== "string") {
      return observeFetch(input, init, parseJsonBody(init));
    }

    try {
      const body = JSON.parse(init.body) as unknown;
      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return observeFetch(input, init, body);
      }

      const modifiedBody = {
        ...body,
        thinking: { type: "disabled" },
      };
      const requestInit = {
        ...init,
        body: JSON.stringify(modifiedBody),
      };
      return observeFetch(input, requestInit, modifiedBody);
    } catch {
      return observeFetch(input, init, undefined);
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
    const wrappedModel = wrapLanguageModel({
      model,
      middleware: [minimumOutputBudgetMiddleware()],
    });
    rememberModelMetadata(wrappedModel, "anthropic-messages");
    return wrappedModel;
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

  const wrappedModel = wrapLanguageModel({
    model,
    middleware: [
      minimumOutputBudgetMiddleware(),
      ...(bypassReasoning || !shouldForceReasoning(config)
        ? []
        : reasoningMiddleware()),
    ],
  });
  rememberModelMetadata(wrappedModel, "chat-completions");
  return wrappedModel;
}
