import type { Provider, Settings } from "./types.js";

export const NONE_PROVIDER_ID = "none";

export const BUILTIN_PROVIDER_PRESETS: Provider[] = [
  {
    id: "builtin-openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    apiKey: "",
    defaultModel: "gpt-4o-mini",
    isBuiltin: true,
  },
  {
    id: "builtin-anthropic",
    name: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    apiKey: "",
    defaultModel: "claude-sonnet-4-20250514",
    isBuiltin: true,
  },
  {
    id: "builtin-openrouter",
    name: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    defaultModel: "openrouter/auto",
    isBuiltin: true,
  },
  {
    id: "builtin-ollama",
    name: "Ollama",
    baseUrl: "http://localhost:11434/v1",
    apiKey: "",
    defaultModel: "llama3.2",
    isBuiltin: true,
  },
];

export function isLocalProvider(baseUrl: string): boolean {
  return /(localhost|127\.0\.0\.1|0\.0\.0\.0)/i.test(baseUrl);
}

export function firstProviderId(providers: Provider[]): string {
  return providers[0]?.id ?? BUILTIN_PROVIDER_PRESETS[0].id;
}

export function createDefaultSettings(): Settings {
  const providers = [...BUILTIN_PROVIDER_PRESETS];
  const defaultProviderId = firstProviderId(providers);

  return {
    providers,
    judge: {
      providerId: defaultProviderId,
      model: "",
      temperature: 0,
      maxTokens: 512,
    },
    storyteller: {
      providerId: defaultProviderId,
      model: "",
      temperature: 0.8,
      maxTokens: 1024,
    },
    generator: {
      providerId: defaultProviderId,
      model: "",
      temperature: 0.7,
      maxTokens: 4096,
    },
    embedder: {
      providerId: defaultProviderId,
      model: "",
      temperature: 0,
      maxTokens: 512,
    },
    fallback: {
      providerId: defaultProviderId,
      model: "gpt-4o-mini",
      timeoutMs: 30000,
      retryCount: 1,
    },
    images: {
      providerId: NONE_PROVIDER_ID,
      model: "",
      stylePrompt: "dark fantasy art, matte painting style...",
      enabled: false,
    },
    research: {
      enabled: true,
      maxSearchSteps: 10,
      searchProvider: "duckduckgo",
    },
  };
}
