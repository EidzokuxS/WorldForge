import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  Provider,
  RoleConfig,
  ResearchConfig,
  Settings,
  UiConfig,
} from "@worldforge/shared";
import {
  BUILTIN_PROVIDER_PRESETS,
  NONE_PROVIDER_ID,
  createDefaultSettings,
} from "@worldforge/shared";
import { isRecord } from "../lib/index.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, "../../../settings.json");
const SETTINGS_BACKUP_PATH = path.resolve(__dirname, "../../../settings.json.bak");

class SettingsFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsFileError";
  }
}

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

function normalizeRoleProviderId(
  providerId: unknown,
  defaults: RoleConfig
): string {
  const normalized = asString(providerId).trim();
  return normalized || defaults.providerId;
}

function normalizeRoleConfig(
  value: unknown,
  defaults: RoleConfig
): RoleConfig {
  const source = isRecord(value) ? value : {};

  return {
    providerId: normalizeRoleProviderId(source.providerId, defaults),
    model: asString(source.model, defaults.model ?? ""),
    temperature: clampNumber(source.temperature, 0, 2, defaults.temperature),
    maxTokens: clampInt(source.maxTokens, 1, 32000, defaults.maxTokens),
  };
}

const VALID_SEARCH_PROVIDERS = new Set(["brave", "duckduckgo", "zai"]);

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
    braveApiKey: asString(source.braveApiKey, defaults.braveApiKey ?? ""),
    zaiApiKey: asString(source.zaiApiKey, defaults.zaiApiKey ?? ""),
  };
}

function normalizeUiConfig(
  value: unknown,
  defaults: UiConfig
): UiConfig {
  const source = isRecord(value) ? value : {};

  return {
    showRawReasoning:
      typeof source.showRawReasoning === "boolean"
        ? source.showRawReasoning
        : defaults.showRawReasoning,
  };
}

export function rebindProviderReferences(settings: Settings): Settings {
  const providers = mergeBuiltinProviders(settings.providers);
  const defaults = createDefaultSettings();

  const imageProviderId =
    settings.images.providerId === NONE_PROVIDER_ID ||
      providers.some((provider) => provider.id === settings.images.providerId)
      ? settings.images.providerId
      : NONE_PROVIDER_ID;

  return {
    ...settings,
    providers,
    judge: { ...settings.judge },
    storyteller: { ...settings.storyteller },
    generator: { ...settings.generator },
    embedder: { ...settings.embedder },
    images: {
      ...settings.images,
      providerId: imageProviderId,
      stylePrompt: settings.images.stylePrompt || defaults.images.stylePrompt,
    },
    ui: normalizeUiConfig(settings.ui, defaults.ui),
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
    judge: normalizeRoleConfig(value.judge, defaults.judge),
    storyteller: normalizeRoleConfig(
      value.storyteller,
      defaults.storyteller
    ),
    generator: normalizeRoleConfig(value.generator, defaults.generator),
    embedder: normalizeRoleConfig(value.embedder, defaults.embedder),
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
    ui: normalizeUiConfig(value.ui, defaults.ui),
  };
}

function readSettingsText(): string | null {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return null;
  }

  try {
    return fs.readFileSync(SETTINGS_PATH, "utf-8");
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown read failure.";
    throw new SettingsFileError(`Failed to read settings file at ${SETTINGS_PATH}: ${detail}`);
  }
}

function backupSettingsText(rawText: string): void {
  if (!rawText.trim()) {
    return;
  }

  fs.writeFileSync(SETTINGS_BACKUP_PATH, rawText, "utf-8");
}

function writeSettingsFile(
  settings: Settings,
  options: { backupCurrent?: boolean } = {}
): void {
  const serialized = JSON.stringify(settings, null, 2);

  if (options.backupCurrent) {
    const current = readSettingsText();
    if (current !== null && current !== serialized) {
      backupSettingsText(current);
    }
  }

  fs.writeFileSync(SETTINGS_PATH, serialized, "utf-8");
}

export function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_PATH)) {
    const defaults = createDefaultSettings();
    writeSettingsFile(defaults);
    return defaults;
  }

  const rawText = readSettingsText();
  if (rawText == null) {
    throw new SettingsFileError(`Failed to read settings file at ${SETTINGS_PATH}.`);
  }

  let raw: unknown;
  try {
    raw = JSON.parse(rawText) as unknown;
  } catch {
    backupSettingsText(rawText);
    throw new SettingsFileError(
      `Settings file at ${SETTINGS_PATH} contains invalid JSON. The original content was preserved at ${SETTINGS_BACKUP_PATH}.`
    );
  }

  const normalized = normalizeSettings(raw);
  const normalizedText = JSON.stringify(normalized, null, 2);
  if (normalizedText !== rawText) {
    writeSettingsFile(normalized, { backupCurrent: true });
  }
  return normalized;
}

export function saveSettings(value: unknown): Settings {
  const normalized = rebindProviderReferences(normalizeSettings(value));
  writeSettingsFile(normalized, { backupCurrent: true });
  return normalized;
}
