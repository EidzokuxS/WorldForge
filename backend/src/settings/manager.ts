import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Provider, RoleConfig, FallbackConfig, ResearchConfig, Settings } from "@worldforge/shared";
import {
  BUILTIN_PROVIDER_PRESETS,
  NONE_PROVIDER_ID,
  createDefaultSettings,
  firstProviderId,
} from "@worldforge/shared";
import { isRecord } from "../lib/index.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, "../../../settings.json");

const BUILTIN_PROVIDER_IDS = new Set(BUILTIN_PROVIDER_PRESETS.map((p) => p.id));

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function clampNumber(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, value));
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number
): number {
  return Math.round(clampNumber(value, min, max, fallback));
}

function sanitizeProvider(value: unknown): Provider | null {
  if (!isRecord(value)) {
    return null;
  }

  const id = asString(value.id).trim();
  if (!id) {
    return null;
  }

  return {
    id,
    name: asString(value.name, "Custom Provider").trim() || "Custom Provider",
    baseUrl: asString(value.baseUrl).trim(),
    apiKey: asString(value.apiKey).trim(),
    defaultModel: asString(value.defaultModel).trim(),
    isBuiltin: Boolean(value.isBuiltin),
  };
}

function mergeBuiltinProviders(providers: Provider[]): Provider[] {
  const providerById = new Map(providers.map((provider) => [provider.id, provider]));

  const builtins = BUILTIN_PROVIDER_PRESETS.map((preset) => {
    const existing = providerById.get(preset.id);
    if (!existing) {
      return preset;
    }

    return {
      ...preset,
      name: existing.name || preset.name,
      baseUrl: existing.baseUrl || preset.baseUrl,
      apiKey: existing.apiKey,
      defaultModel: existing.defaultModel || preset.defaultModel,
      isBuiltin: true,
    };
  });

  const customProviders = providers
    .filter((provider) => !BUILTIN_PROVIDER_IDS.has(provider.id))
    .map((provider) => ({
      ...provider,
      isBuiltin: false,
    }));

  return [...builtins, ...customProviders];
}

function resolveProviderId(
  providers: Provider[],
  providerId: string | undefined,
  fallback: string
): string {
  if (providerId && providers.some((provider) => provider.id === providerId)) {
    return providerId;
  }

  return fallback;
}

function normalizeRoleConfig(
  value: unknown,
  providers: Provider[],
  defaults: RoleConfig
): RoleConfig {
  const fallbackProviderId = firstProviderId(providers);
  const source = isRecord(value) ? value : {};

  return {
    providerId: resolveProviderId(
      providers,
      asString(source.providerId),
      fallbackProviderId
    ),
    model: asString(source.model, defaults.model ?? ""),
    temperature: clampNumber(source.temperature, 0, 2, defaults.temperature),
    maxTokens: clampInt(source.maxTokens, 1, 32000, defaults.maxTokens),
  };
}

function normalizeFallbackConfig(
  value: unknown,
  providers: Provider[],
  defaults: FallbackConfig
): FallbackConfig {
  const fallbackProviderId = firstProviderId(providers);
  const source = isRecord(value) ? value : {};

  return {
    providerId: resolveProviderId(
      providers,
      asString(source.providerId),
      fallbackProviderId
    ),
    model: asString(source.model, defaults.model),
    timeoutMs: clampInt(source.timeoutMs, 1000, 120000, defaults.timeoutMs),
    retryCount: clampInt(source.retryCount, 0, 10, defaults.retryCount),
  };
}

const VALID_SEARCH_PROVIDERS = new Set(["duckduckgo", "zai"]);

function normalizeResearchConfig(
  value: unknown,
  defaults: ResearchConfig
): ResearchConfig {
  const source = isRecord(value) ? value : {};
  const rawProvider = asString(source.searchProvider);

  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : defaults.enabled,
    maxSearchSteps: clampInt(source.maxSearchSteps, 1, 100, defaults.maxSearchSteps),
    searchProvider: VALID_SEARCH_PROVIDERS.has(rawProvider)
      ? (rawProvider as ResearchConfig["searchProvider"])
      : defaults.searchProvider,
  };
}

export function rebindProviderReferences(settings: Settings): Settings {
  const providers = mergeBuiltinProviders(settings.providers);
  const defaults = createDefaultSettings();
  const fallbackProviderId = firstProviderId(providers);

  const imageProviderId =
    settings.images.providerId === NONE_PROVIDER_ID ||
      providers.some((provider) => provider.id === settings.images.providerId)
      ? settings.images.providerId
      : NONE_PROVIDER_ID;

  return {
    ...settings,
    providers,
    judge: {
      ...settings.judge,
      providerId: resolveProviderId(
        providers,
        settings.judge.providerId,
        fallbackProviderId
      ),
    },
    storyteller: {
      ...settings.storyteller,
      providerId: resolveProviderId(
        providers,
        settings.storyteller.providerId,
        fallbackProviderId
      ),
    },
    generator: {
      ...settings.generator,
      providerId: resolveProviderId(
        providers,
        settings.generator.providerId,
        fallbackProviderId
      ),
    },
    embedder: {
      ...settings.embedder,
      providerId: resolveProviderId(
        providers,
        settings.embedder.providerId,
        fallbackProviderId
      ),
    },
    fallback: {
      ...settings.fallback,
      providerId: resolveProviderId(
        providers,
        settings.fallback.providerId,
        fallbackProviderId
      ),
    },
    images: {
      ...settings.images,
      providerId: imageProviderId,
      stylePrompt: settings.images.stylePrompt || defaults.images.stylePrompt,
    },
  };
}

export function normalizeSettings(value: unknown): Settings {
  const defaults = createDefaultSettings();
  if (!isRecord(value)) {
    return defaults;
  }

  const rawProviders = Array.isArray(value.providers)
    ? value.providers
      .map(sanitizeProvider)
      .filter((provider): provider is Provider => provider !== null)
    : defaults.providers;
  const providers = mergeBuiltinProviders(rawProviders);

  const imagesSource = isRecord(value.images) ? value.images : {};
  const imagesProviderId = asString(imagesSource.providerId);

  return {
    providers,
    judge: normalizeRoleConfig(value.judge, providers, defaults.judge),
    storyteller: normalizeRoleConfig(
      value.storyteller,
      providers,
      defaults.storyteller
    ),
    generator: normalizeRoleConfig(value.generator, providers, defaults.generator),
    embedder: normalizeRoleConfig(value.embedder, providers, defaults.embedder),
    fallback: normalizeFallbackConfig(value.fallback, providers, defaults.fallback),
    images: {
      providerId:
        imagesProviderId === NONE_PROVIDER_ID ||
          providers.some((provider) => provider.id === imagesProviderId)
          ? imagesProviderId || NONE_PROVIDER_ID
          : NONE_PROVIDER_ID,
      model: asString(imagesSource.model),
      stylePrompt: asString(imagesSource.stylePrompt, defaults.images.stylePrompt),
      enabled: Boolean(imagesSource.enabled),
    },
    research: normalizeResearchConfig(value.research, defaults.research),
  };
}

function writeSettingsFile(settings: Settings): void {
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_PATH)) {
    const defaults = createDefaultSettings();
    writeSettingsFile(defaults);
    return defaults;
  }

  try {
    const rawText = fs.readFileSync(SETTINGS_PATH, "utf-8");
    const raw = JSON.parse(rawText) as unknown;
    const normalized = normalizeSettings(raw);
    const normalizedText = JSON.stringify(normalized, null, 2);
    if (normalizedText !== rawText) {
      writeSettingsFile(normalized);
    }
    return normalized;
  } catch {
    const defaults = createDefaultSettings();
    writeSettingsFile(defaults);
    return defaults;
  }
}

export function saveSettings(value: unknown): Settings {
  const normalized = rebindProviderReferences(normalizeSettings(value));
  writeSettingsFile(normalized);
  return normalized;
}
