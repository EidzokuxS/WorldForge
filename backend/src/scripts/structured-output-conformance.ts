import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createModel, resolveProviderProtocol, type ProviderConfig } from "../ai/provider-registry.js";
import {
  runStructuredOutputConformance,
  type RunStructuredOutputConformanceInput,
  type StructuredOutputConformanceReport,
  type StructuredOutputConformanceProvider,
} from "../ai/structured-output-conformance.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SETTINGS_PATH = path.resolve(__dirname, "../../../settings.json");
const LIVE_CONFORMANCE_ENV = "WORLDFORGE_LIVE_PROVIDER_CONFORMANCE";

type CliEnv = Record<string, string | undefined>;

export interface StructuredOutputConformanceCliOptions {
  env?: CliEnv;
  write?: (text: string) => void;
  readSettingsText?: () => string | null;
  runConformance?: (input: RunStructuredOutputConformanceInput) => Promise<StructuredOutputConformanceReport>;
  generatedAt?: string;
}

interface RawSettingsRecord {
  providers?: unknown;
  judge?: unknown;
  storyteller?: unknown;
  generator?: unknown;
  embedder?: unknown;
}

const STRUCTURED_OUTPUT_ROLE_NAMES = ["judge", "generator"] as const;

function nowIso(options: StructuredOutputConformanceCliOptions): string {
  return options.generatedAt ?? new Date().toISOString();
}

function skippedReport(generatedAt: string): StructuredOutputConformanceReport {
  return {
    generatedAt,
    skipped: true,
    summary: {
      providers: 0,
      cases: 0,
      total: 0,
      passed: 0,
      failed: 0,
      semanticFailed: 0,
    },
    results: [],
  };
}

function writeJson(
  write: (text: string) => void,
  value: unknown,
): void {
  write(`${JSON.stringify(value, null, 2)}\n`);
}

function defaultReadSettingsText(): string | null {
  if (!fs.existsSync(SETTINGS_PATH)) {
    return null;
  }

  return fs.readFileSync(SETTINGS_PATH, "utf8");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function structuredRoleModelsForProvider(
  settings: RawSettingsRecord,
  providerId: string,
  fallbackModel: string,
): string[] {
  const models = STRUCTURED_OUTPUT_ROLE_NAMES.map((roleName) => {
    const role = settings[roleName];
    if (!isRecord(role) || asString(role.providerId) !== providerId) return "";
    return asString(role.model) || fallbackModel;
  }).filter(Boolean);

  return [...new Set(models)];
}

function readProviderConfigs(rawSettings: unknown): ProviderConfig[] {
  if (!isRecord(rawSettings)) return [];

  const settings = rawSettings as RawSettingsRecord;
  const rawProviders = Array.isArray(settings.providers) ? settings.providers : [];

  return rawProviders.flatMap((rawProvider): ProviderConfig[] => {
    if (!isRecord(rawProvider)) return [];

    const id = asString(rawProvider.id);
    const baseUrl = asString(rawProvider.baseUrl);
    const defaultModel = asString(rawProvider.defaultModel);
    if (!id || !baseUrl) return [];
    const apiKey = asString(rawProvider.apiKey);
    const models = structuredRoleModelsForProvider(settings, id, defaultModel);
    if (models.length === 0) return [];

    const protocol = asString(rawProvider.protocol);
    return models.map((model): ProviderConfig => ({
      id,
      name: asString(rawProvider.name) || id,
      baseUrl,
      apiKey,
      model,
      protocol:
        protocol === "anthropic-compatible" || protocol === "openai-compatible"
          ? protocol
          : undefined,
    }));
  });
}

function buildConformanceProviders(
  configs: ProviderConfig[],
): StructuredOutputConformanceProvider[] {
  return configs.map((config) => ({
    providerId: config.id,
    providerName: config.name,
    protocol: resolveProviderProtocol(config),
    model: config.model,
    languageModel: createModel(config),
  }));
}

function compactCliError(error: unknown): { generatedAt: string; success: false; errorType: string; errorMessage: string } {
  if (error instanceof Error) {
    return {
      generatedAt: new Date().toISOString(),
      success: false,
      errorType: error.name || "Error",
      errorMessage: error.message.slice(0, 280),
    };
  }

  return {
    generatedAt: new Date().toISOString(),
    success: false,
    errorType: typeof error,
    errorMessage: String(error).slice(0, 280),
  };
}

export async function runStructuredOutputConformanceCli(
  options: StructuredOutputConformanceCliOptions = {},
): Promise<number> {
  const env = options.env ?? process.env;
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const generatedAt = nowIso(options);

  if (env[LIVE_CONFORMANCE_ENV] !== "1") {
    writeJson(write, skippedReport(generatedAt));
    return 0;
  }

  try {
    const readSettingsText = options.readSettingsText ?? defaultReadSettingsText;
    const rawText = readSettingsText();
    const rawSettings = rawText ? JSON.parse(rawText) : {};
    const providerConfigs = readProviderConfigs(rawSettings);
    const providers = buildConformanceProviders(providerConfigs);
    const runConformance = options.runConformance ?? runStructuredOutputConformance;
    const report = await runConformance({
      providers,
      generatedAt,
    });

    writeJson(write, report);
    return report.summary.failed > 0 ? 1 : 0;
  } catch (error) {
    writeJson(write, compactCliError(error));
    return 1;
  }
}

function isDirectRun(): boolean {
  const entry = process.argv[1];
  return Boolean(entry) && import.meta.url === pathToFileURL(entry!).href;
}

if (isDirectRun()) {
  runStructuredOutputConformanceCli()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
