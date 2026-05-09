import fs from "node:fs";
import { z } from "zod";

import { getCampaignConfigPath } from "../campaign/paths.js";
import { AppError } from "../lib/index.js";

export const WORLD_FORECAST_CONFIG_KEY = "worldTrajectoryForecast";
export const WORLD_FORECAST_VERSION = "world-trajectory-forecast.v1";
export const SCOPED_FORECAST_EXCERPT_VERSION = "scoped-forecast-excerpt.v1";

export const WORLD_FORECAST_MAX_ENTRIES = 24;
export const WORLD_FORECAST_MAX_EXCERPT_ENTRIES = 6;
export const WORLD_FORECAST_MAX_REFS = 8;
export const WORLD_FORECAST_MAX_SCOPE_REFS = 12;
export const WORLD_FORECAST_MAX_TEXT = 320;
export const WORLD_FORECAST_MAX_SHORT_TEXT = 120;
export const WORLD_FORECAST_MAX_PRIVATE_TERMS = 32;

const forecastText = (max = WORLD_FORECAST_MAX_TEXT) => z.string().trim().min(1).max(max);
const forecastOptionalText = (max = WORLD_FORECAST_MAX_TEXT) => z.string().trim().max(max);
const forecastRef = z.string().trim().min(1).max(WORLD_FORECAST_MAX_SHORT_TEXT);
const forecastTick = z.number().int().nonnegative();

const executableKeyNames = new Set([
  "actionpayload",
  "actorref",
  "conditiondelta",
  "durableevent",
  "hpdelta",
  "inputpayload",
  "inventoryadd",
  "inventoryremove",
  "locationid",
  "plannedactions",
  "plannedtools",
  "relationshipdelta",
  "runtimetool",
  "runtimetoolinput",
  "statedelta",
  "targetlocationid",
  "targetref",
  "toolinput",
  "toolname",
  "toolpayload",
  "worlddelta",
]);

function normalizeGuardKey(key: string): string {
  return key.replace(/[\s_-]/g, "").toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addExecutablePayloadIssues(
  value: unknown,
  ctx: z.RefinementCtx,
  path: Array<string | number> = [],
): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => addExecutablePayloadIssues(item, ctx, [...path, index]));
    return;
  }

  if (!isRecord(value)) return;

  const normalizedKeys = new Set(Object.keys(value).map(normalizeGuardKey));
  if (
    (normalizedKeys.has("toolname") && normalizedKeys.has("input")) ||
    (normalizedKeys.has("action") && normalizedKeys.has("payload")) ||
    (normalizedKeys.has("operation") && normalizedKeys.has("payload"))
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Forecast entries cannot contain executable tool/action payload objects.",
      path,
    });
  }

  for (const [key, nested] of Object.entries(value)) {
    if (executableKeyNames.has(normalizeGuardKey(key))) {
      ctx.addIssue({
        code: "custom",
        message: `Forecast entries cannot contain executable field "${key}".`,
        path: [...path, key],
      });
    }
    addExecutablePayloadIssues(nested, ctx, [...path, key]);
  }
}

function rejectExecutablePayloads<T extends z.ZodType>(schema: T): z.ZodPipe<z.ZodUnknown, T> {
  return z.unknown().superRefine(addExecutablePayloadIssues).pipe(schema);
}

const forecastSubjectRefSchema = z
  .object({
    type: z.enum(["actor", "location", "scene", "faction", "item", "clock", "thread"]),
    id: forecastRef,
    label: forecastRef.optional(),
  })
  .strict();

const forecastLocalitySchema = z
  .object({
    locationRefs: z.array(forecastRef).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
    sceneRefs: z.array(forecastRef).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
    actorRefs: z.array(forecastRef).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
  })
  .strict();

const advisorySignalSchema = z
  .object({
    label: forecastRef,
    evidenceRef: forecastRef.optional(),
    note: forecastOptionalText(WORLD_FORECAST_MAX_SHORT_TEXT).optional(),
  })
  .strict();

const forecastEntryBaseSchema = z
  .object({
    id: forecastRef,
    baseTick: forecastTick,
    horizonTicks: z.number().int().positive().max(10_000),
    subjectRefs: z.array(forecastSubjectRefSchema).min(1).max(WORLD_FORECAST_MAX_REFS),
    confidence: z.number().min(0).max(1),
    privacy: z.enum(["public", "player_known", "private"]),
    playerFacingEligibility: z.enum(["local_public", "player_known_hint", "never"]),
    locality: forecastLocalitySchema,
    advisoryText: forecastText(),
    preconditions: z.array(forecastText(WORLD_FORECAST_MAX_SHORT_TEXT)).max(6).default([]),
    advisorySignals: z.array(advisorySignalSchema).max(6).default([]),
    privateTerms: z.array(forecastRef).max(WORLD_FORECAST_MAX_PRIVATE_TERMS).default([]),
  })
  .strict()
  .superRefine((entry, ctx) => {
    if (entry.privacy !== "public" && entry.playerFacingEligibility === "local_public") {
      ctx.addIssue({
        code: "custom",
        message: "Only public forecast entries can be eligible as local_public.",
        path: ["playerFacingEligibility"],
      });
    }
    if (entry.playerFacingEligibility === "never" && entry.privacy === "public") {
      ctx.addIssue({
        code: "custom",
        message: "Public forecast entries must declare a prompt-safe eligibility mode.",
        path: ["playerFacingEligibility"],
      });
    }
  });

export const forecastEntrySchema = rejectExecutablePayloads(forecastEntryBaseSchema);

const worldTrajectoryForecastBaseSchema = z
  .object({
    version: z.literal(WORLD_FORECAST_VERSION),
    campaignId: forecastRef,
    baseTick: forecastTick,
    generatedAtTick: forecastTick,
    expiresAtTick: forecastTick.optional(),
    promptReady: z.literal(false).default(false),
    entries: z.array(forecastEntrySchema).max(WORLD_FORECAST_MAX_ENTRIES).default([]),
    diagnostics: z
      .object({
        source: z.enum(["gm_forecast_builder", "manual", "restore"]).default("gm_forecast_builder"),
        notes: z.array(forecastText(WORLD_FORECAST_MAX_SHORT_TEXT)).max(6).default([]),
      })
      .strict()
      .default({ source: "gm_forecast_builder", notes: [] }),
  })
  .strict()
  .superRefine((forecast, ctx) => {
    if (forecast.expiresAtTick !== undefined && forecast.expiresAtTick < forecast.baseTick) {
      ctx.addIssue({
        code: "custom",
        message: "expiresAtTick must be greater than or equal to baseTick.",
        path: ["expiresAtTick"],
      });
    }
  });

export const worldTrajectoryForecastSchema = rejectExecutablePayloads(
  worldTrajectoryForecastBaseSchema,
);

const scopedForecastEntrySchema = z
  .object({
    entryId: forecastRef,
    horizonTicks: z.number().int().positive().max(10_000),
    subjectRefs: z.array(forecastSubjectRefSchema).min(1).max(WORLD_FORECAST_MAX_REFS),
    confidence: z.number().min(0).max(1),
    pressure: forecastText(),
    preconditions: z.array(forecastText(WORLD_FORECAST_MAX_SHORT_TEXT)).max(6).default([]),
  })
  .strict();

export const scopedForecastExcerptSchema = z
  .object({
    version: z.literal(SCOPED_FORECAST_EXCERPT_VERSION),
    baseTick: forecastTick,
    promptReady: z.literal(true),
    entries: z.array(scopedForecastEntrySchema).max(WORLD_FORECAST_MAX_EXCERPT_ENTRIES),
    forbiddenPrivateTerms: z.array(forecastRef).max(WORLD_FORECAST_MAX_PRIVATE_TERMS),
  })
  .strict();

export const WorldTrajectoryForecastSchema = worldTrajectoryForecastSchema;
export const ScopedForecastExcerptSchema = scopedForecastExcerptSchema;

export const stagedWorldTrajectoryForecastSchema = z
  .object({
    status: z.literal("staged"),
    stagedAt: z.number().int().nonnegative(),
    forecast: worldTrajectoryForecastSchema,
  })
  .strict();

export type ForecastEntry = z.infer<typeof forecastEntrySchema>;
export type WorldTrajectoryForecast = z.infer<typeof worldTrajectoryForecastSchema>;
export type ScopedForecastExcerpt = z.infer<typeof scopedForecastExcerptSchema>;
export type StagedWorldTrajectoryForecast = z.infer<typeof stagedWorldTrajectoryForecastSchema>;

export interface BuildScopedForecastExcerptArgs {
  forecast: WorldTrajectoryForecast | null | undefined;
  localRefs: readonly string[];
  maxEntries?: number;
}

export function shouldRefreshWorldTrajectoryForecast(
  forecast: WorldTrajectoryForecast | null | undefined,
  currentTick: number,
): boolean {
  if (!forecast) return true;
  if (forecast.expiresAtTick !== undefined && forecast.expiresAtTick <= currentTick) return true;
  return forecast.entries.length === 0;
}

function readRawCampaignConfig(campaignId: string): Record<string, unknown> {
  const configPath = getCampaignConfigPath(campaignId);
  if (!fs.existsSync(configPath)) {
    throw new AppError("Campaign config.json not found.", 404);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(configPath, "utf-8")) as unknown;
  } catch {
    throw new AppError("Campaign config.json contains invalid JSON.", 500);
  }

  if (!isRecord(parsed)) {
    throw new AppError("Campaign config.json is invalid.", 500);
  }

  return parsed;
}

function writeRawCampaignConfig(campaignId: string, config: Record<string, unknown>): void {
  fs.writeFileSync(getCampaignConfigPath(campaignId), JSON.stringify(config, null, 2), "utf-8");
}

export function parseWorldTrajectoryForecast(value: unknown): WorldTrajectoryForecast {
  return worldTrajectoryForecastSchema.parse(value);
}

export function loadWorldTrajectoryForecast(campaignId: string): WorldTrajectoryForecast | null {
  const rawConfig = readRawCampaignConfig(campaignId);
  const rawForecast = rawConfig[WORLD_FORECAST_CONFIG_KEY];
  if (rawForecast === undefined || rawForecast === null) return null;
  return parseWorldTrajectoryForecast(rawForecast);
}

export function writeWorldTrajectoryForecast(
  campaignId: string,
  forecast: WorldTrajectoryForecast,
): WorldTrajectoryForecast {
  const parsedForecast = parseWorldTrajectoryForecast(forecast);
  if (parsedForecast.campaignId !== campaignId) {
    throw new AppError("Forecast campaignId does not match target campaign.", 400);
  }

  const rawConfig = readRawCampaignConfig(campaignId);
  writeRawCampaignConfig(campaignId, {
    ...rawConfig,
    [WORLD_FORECAST_CONFIG_KEY]: parsedForecast,
  });
  return parsedForecast;
}

export function stageWorldTrajectoryForecast(
  forecast: WorldTrajectoryForecast,
  stagedAt = Date.now(),
): StagedWorldTrajectoryForecast {
  return stagedWorldTrajectoryForecastSchema.parse({
    status: "staged",
    stagedAt,
    forecast,
  });
}

export function writeStagedWorldTrajectoryForecast(
  campaignId: string,
  staged: StagedWorldTrajectoryForecast,
): WorldTrajectoryForecast {
  const parsed = stagedWorldTrajectoryForecastSchema.parse(staged);
  return writeWorldTrajectoryForecast(campaignId, parsed.forecast);
}

function normalizedRefSet(refs: readonly string[]): Set<string> {
  return new Set(refs.map((ref) => ref.trim().toLowerCase()).filter(Boolean));
}

function entryLocalRefs(entry: ForecastEntry): string[] {
  return [
    ...entry.locality.locationRefs,
    ...entry.locality.sceneRefs,
    ...entry.locality.actorRefs,
    ...entry.subjectRefs.flatMap((ref) => [ref.id, ref.label ?? ""]),
  ].filter(Boolean);
}

function isEntryLocal(entry: ForecastEntry, localRefs: Set<string>): boolean {
  return entryLocalRefs(entry).some((ref) => localRefs.has(ref.trim().toLowerCase()));
}

function pushUniqueTerm(
  terms: string[],
  seen: Set<string>,
  safeLocalRefs: Set<string>,
  term: string,
): void {
  const trimmed = term.trim();
  const key = trimmed.toLowerCase();
  if (!trimmed || seen.has(key) || safeLocalRefs.has(key)) return;
  seen.add(key);
  terms.push(trimmed);
}

function collectForbiddenTerms(
  entries: readonly ForecastEntry[],
  includedIds: Set<string>,
  safeLocalRefs: Set<string>,
): string[] {
  const terms: string[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    if (includedIds.has(entry.id)) continue;

    const publicSubjectRefs = new Set(
      entry.subjectRefs
        .flatMap((subject) => [subject.id, subject.label])
        .filter((value): value is string => Boolean(value?.trim()))
        .map((value) => value.trim().toLowerCase()),
    );

    for (const term of entry.privateTerms) {
      if (entry.privacy === "public" && publicSubjectRefs.has(term.trim().toLowerCase())) {
        continue;
      }
      pushUniqueTerm(terms, seen, safeLocalRefs, term);
    }

    if (entry.privacy !== "public") {
      for (const subject of entry.subjectRefs) {
        pushUniqueTerm(terms, seen, safeLocalRefs, subject.label ?? subject.id);
      }
    }

    if (terms.length >= WORLD_FORECAST_MAX_PRIVATE_TERMS) break;
  }

  return terms.slice(0, WORLD_FORECAST_MAX_PRIVATE_TERMS);
}

export function buildScopedForecastExcerpt({
  forecast,
  localRefs,
  maxEntries = WORLD_FORECAST_MAX_EXCERPT_ENTRIES,
}: BuildScopedForecastExcerptArgs): ScopedForecastExcerpt {
  const entryLimit = Math.max(0, Math.min(maxEntries, WORLD_FORECAST_MAX_EXCERPT_ENTRIES));
  const localRefSet = normalizedRefSet(localRefs);
  const entries = forecast?.entries ?? [];
  const includedIds = new Set<string>();

  const scopedEntries = entries
    .filter((entry) => entry.privacy === "public")
    .filter((entry) => entry.playerFacingEligibility === "local_public")
    .filter((entry) => isEntryLocal(entry, localRefSet))
    .slice(0, entryLimit)
    .map((entry) => {
      includedIds.add(entry.id);
      return {
        entryId: entry.id,
        horizonTicks: entry.horizonTicks,
        subjectRefs: entry.subjectRefs,
        confidence: entry.confidence,
        pressure: entry.advisoryText,
        preconditions: entry.preconditions,
      };
    });

  return scopedForecastExcerptSchema.parse({
    version: SCOPED_FORECAST_EXCERPT_VERSION,
    baseTick: forecast?.baseTick ?? 0,
    promptReady: true,
    entries: scopedEntries,
    forbiddenPrivateTerms: collectForbiddenTerms(entries, includedIds, localRefSet),
  });
}
