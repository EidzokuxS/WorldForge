import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  redactModelFacingJson,
  type ModelFacingScenePacket,
} from "./model-facing-scene.js";
import type { SceneFrame } from "./scene-frame.js";
import {
  WORLD_FORECAST_VERSION,
  WORLD_FORECAST_MAX_PRIVATE_TERMS,
  WORLD_FORECAST_MAX_REFS,
  WORLD_FORECAST_MAX_SCOPE_REFS,
  WORLD_FORECAST_MAX_SHORT_TEXT,
  forecastEntrySchema,
  worldTrajectoryForecastSchema,
  type ForecastEntry,
  type WorldTrajectoryForecast,
} from "./world-forecast.js";

const log = createLogger("world-forecast-builder");

const WORLD_FORECAST_REFRESH_MAX_OUTPUT_TOKENS = 1800;
const WORLD_FORECAST_DEFAULT_HORIZON_TICKS = 3;
const WORLD_FORECAST_DEFAULT_CONFIDENCE = 0.5;

const forecastBuilderRefSchema = z.string().trim().min(1).max(WORLD_FORECAST_MAX_SHORT_TEXT);
const forecastBuilderTextSchema = z.string().trim().min(1).max(320);
const forecastBuilderDiagnosticNoteSchema = z
  .string()
  .trim()
  .min(1)
  .transform((value) => value.slice(0, WORLD_FORECAST_MAX_SHORT_TEXT).trimEnd());
const forecastSubjectTypeSchema = z.enum([
  "actor",
  "location",
  "scene",
  "faction",
  "item",
  "clock",
  "thread",
]);
type ForecastSubjectType = z.infer<typeof forecastSubjectTypeSchema>;

const executableKeyNames = new Set([
  "actionpayload",
  "conditiondelta",
  "durableevent",
  "hpdelta",
  "inputpayload",
  "inventoryadd",
  "inventoryremove",
  "plannedactions",
  "plannedtools",
  "relationshipdelta",
  "runtimetool",
  "runtimetoolinput",
  "statedelta",
  "targetlocationid",
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
    (normalizedKeys.has("toolname") && normalizedKeys.has("input"))
    || (normalizedKeys.has("action") && normalizedKeys.has("payload"))
    || (normalizedKeys.has("operation") && normalizedKeys.has("payload"))
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

function subjectTypeFromRaw(value: string): ForecastSubjectType | null {
  const parsed = forecastSubjectTypeSchema.safeParse(value.trim().toLowerCase());
  return parsed.success ? parsed.data : null;
}

function parseTypedRef(value: string): {
  type: ForecastSubjectType | null;
  id: string;
} {
  const [prefix, ...rest] = value.split(":");
  const type = prefix ? subjectTypeFromRaw(prefix) : null;
  if (type && rest.length > 0) {
    return { type, id: rest.join(":").trim() };
  }
  return { type: null, id: value.trim() };
}

function forecastSubjectLabel(
  subject: { label?: string; id: string },
): string | undefined {
  return "label" in subject ? subject.label : undefined;
}

const forecastBuilderSubjectRefSchema = z.union([
  forecastBuilderRefSchema.transform((value) => {
    const parsed = parseTypedRef(value);
    return {
      type: parsed.type ?? "thread",
      id: parsed.id,
    };
  }),
  z.object({
    type: forecastSubjectTypeSchema.default("thread"),
    id: forecastBuilderRefSchema,
    label: forecastBuilderRefSchema.optional(),
  }),
]);

const forecastBuilderSignalSchema = z.union([
  forecastBuilderRefSchema.transform((value) => ({ label: value })),
  z.object({
    label: forecastBuilderRefSchema.optional(),
    signal: forecastBuilderRefSchema.optional(),
    evidenceRef: forecastBuilderRefSchema.optional(),
    note: z.string().trim().max(WORLD_FORECAST_MAX_SHORT_TEXT).optional(),
  }).transform((value) => ({
    label: value.label ?? value.signal ?? "forecast signal",
    evidenceRef: value.evidenceRef,
    note: value.note,
  })),
]);

const forecastBuilderPrivateTermsSchema = z.union([
  z.array(forecastBuilderRefSchema).max(WORLD_FORECAST_MAX_PRIVATE_TERMS),
  forecastBuilderRefSchema.transform((value) => [value]),
  z.record(z.string(), z.unknown()).transform((value) =>
    Object.values(value)
      .flatMap((entry) => {
        if (typeof entry === "string") return [entry];
        if (Array.isArray(entry)) return entry.filter((item): item is string => typeof item === "string");
        return [];
      })
      .map((entry) => entry.trim())
      .filter(Boolean)
      .slice(0, WORLD_FORECAST_MAX_PRIVATE_TERMS),
  ),
]);

const forecastBuilderLocalitySchema = z.union([
  z.object({
    locationRefs: z.array(forecastBuilderRefSchema).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
    sceneRefs: z.array(forecastBuilderRefSchema).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
    actorRefs: z.array(forecastBuilderRefSchema).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
  }),
  z.object({
    refs: z.array(forecastBuilderRefSchema).max(WORLD_FORECAST_MAX_SCOPE_REFS).default([]),
  }),
  z.object({
    type: forecastSubjectTypeSchema.default("location"),
    id: forecastBuilderRefSchema,
    label: forecastBuilderRefSchema.optional(),
  }),
]);

const forecastBuilderEntryCandidateSchema = z
  .unknown()
  .superRefine(addExecutablePayloadIssues)
  .pipe(z.object({
    id: forecastBuilderRefSchema.optional(),
    baseTick: z.number().int().nonnegative().optional(),
    horizonTicks: z.number().int().positive().max(10_000).optional(),
    subjectRefs: z
      .array(forecastBuilderSubjectRefSchema)
      .min(1)
      .max(WORLD_FORECAST_MAX_REFS),
    confidence: z.number().min(0).max(1).optional(),
    privacy: z.enum(["public", "player_known", "private"]).default("private"),
    playerFacingEligibility: z
      .enum(["local_public", "player_known_hint", "never"])
      .optional(),
    locality: forecastBuilderLocalitySchema.optional(),
    localityRefs: z.array(forecastBuilderRefSchema).max(WORLD_FORECAST_MAX_SCOPE_REFS).optional(),
    advisoryText: forecastBuilderTextSchema,
    preconditions: z.array(z.string().trim().min(1).max(WORLD_FORECAST_MAX_SHORT_TEXT)).max(6).default([]),
    advisorySignals: z.array(forecastBuilderSignalSchema).max(6).default([]),
    privateTerms: forecastBuilderPrivateTermsSchema.default([]),
  }));

export const forecastBuilderOutputSchema = z
  .object({
    expiresInTicks: z.number().int().positive().max(500).default(12),
    entries: z.array(forecastBuilderEntryCandidateSchema).max(12).default([]),
    diagnostics: z
      .object({
        notes: z.array(forecastBuilderDiagnosticNoteSchema).max(6).default([]),
      })
      .strict()
      .default({ notes: [] }),
  })
  .strict();

type ForecastBuilderEntryCandidate = z.infer<typeof forecastBuilderEntryCandidateSchema>;

function normalizeForecastRef(value: string): string {
  const parsed = parseTypedRef(value);
  return parsed.id;
}

function pushUniqueRef(target: string[], value: string | null | undefined): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  const normalized = normalizeForecastRef(trimmed);
  const key = normalized.toLowerCase();
  if (target.some((entry) => entry.toLowerCase() === key)) return;
  target.push(normalized);
}

function pushTypedLocalityRef(
  locality: { locationRefs: string[]; sceneRefs: string[]; actorRefs: string[] },
  value: string,
): void {
  const parsed = parseTypedRef(value);
  if (parsed.type === "scene") {
    pushUniqueRef(locality.sceneRefs, parsed.id);
    return;
  }
  if (parsed.type === "actor") {
    pushUniqueRef(locality.actorRefs, parsed.id);
    return;
  }
  pushUniqueRef(locality.locationRefs, parsed.id);
}

function normalizeForecastLocality(
  entry: ForecastBuilderEntryCandidate,
  frame: SceneFrame,
): ForecastEntry["locality"] {
  const locality = {
    locationRefs: [] as string[],
    sceneRefs: [] as string[],
    actorRefs: [] as string[],
  };

  for (const ref of entry.localityRefs ?? []) {
    pushTypedLocalityRef(locality, ref);
  }

  const rawLocality = entry.locality;
  if (rawLocality && "locationRefs" in rawLocality) {
    rawLocality.locationRefs.forEach((ref) => pushUniqueRef(locality.locationRefs, ref));
    rawLocality.sceneRefs.forEach((ref) => pushUniqueRef(locality.sceneRefs, ref));
    rawLocality.actorRefs.forEach((ref) => pushUniqueRef(locality.actorRefs, ref));
  } else if (rawLocality && "refs" in rawLocality) {
    rawLocality.refs.forEach((ref) => pushTypedLocalityRef(locality, ref));
  } else if (rawLocality && "id" in rawLocality) {
    if (rawLocality.type === "scene") {
      pushUniqueRef(locality.sceneRefs, rawLocality.id);
    } else if (rawLocality.type === "actor") {
      pushUniqueRef(locality.actorRefs, rawLocality.id);
    } else {
      pushUniqueRef(locality.locationRefs, rawLocality.id);
    }
  }

  for (const subject of entry.subjectRefs) {
    if (subject.type === "location") pushUniqueRef(locality.locationRefs, subject.id);
    if (subject.type === "scene") pushUniqueRef(locality.sceneRefs, subject.id);
    if (subject.type === "actor") pushUniqueRef(locality.actorRefs, subject.id);
  }

  if (
    locality.locationRefs.length === 0
    && locality.sceneRefs.length === 0
    && locality.actorRefs.length === 0
  ) {
    pushUniqueRef(locality.locationRefs, frame.currentLocationId);
    pushUniqueRef(locality.sceneRefs, frame.currentSceneScopeId);
    pushUniqueRef(locality.actorRefs, frame.playerActorId);
  }

  return locality;
}

function normalizePrivateTerms(
  entry: ForecastBuilderEntryCandidate,
): string[] {
  const terms: string[] = [];
  for (const term of entry.privateTerms) {
    pushUniqueRef(terms, term);
  }

  if (entry.privacy !== "public") {
    for (const subject of entry.subjectRefs) {
      pushUniqueRef(terms, forecastSubjectLabel(subject) ?? subject.id);
    }
  }

  return terms.slice(0, WORLD_FORECAST_MAX_PRIVATE_TERMS);
}

export interface RunWorldForecastBuilderArgs {
  provider: ProviderConfig;
  frame: SceneFrame;
  priorForecast?: WorldTrajectoryForecast | null;
  modelFacingScenePacket?: ModelFacingScenePacket;
  maxOutputTokens?: number;
}

function localDurableFactsForPrompt(packet: ModelFacingScenePacket): unknown {
  return {
    localScene: packet.view.localScene,
    visibleActors: packet.view.visibleActors,
    awarenessHints: packet.view.awarenessHints,
    localRecentEvents: packet.view.localRecentEvents,
    legalTargets: packet.view.legalTargets,
    legalMovement: packet.view.legalMovement,
    privateContext: packet.view.privateContext,
  };
}

function priorForecastForPrompt(
  forecast: WorldTrajectoryForecast | null | undefined,
  packet: ModelFacingScenePacket,
): unknown {
  if (!forecast) return null;
  return redactModelFacingJson(
    {
      baseTick: forecast.baseTick,
      generatedAtTick: forecast.generatedAtTick,
      expiresAtTick: forecast.expiresAtTick,
      entries: forecast.entries.map((entry) => ({
        id: entry.id,
        horizonTicks: entry.horizonTicks,
        subjectRefs: entry.subjectRefs,
        confidence: entry.confidence,
        privacy: entry.privacy,
        playerFacingEligibility: entry.playerFacingEligibility,
        locality: entry.locality,
        advisoryText: entry.advisoryText,
        preconditions: entry.preconditions,
        advisorySignals: entry.advisorySignals,
      })),
    },
    packet.safety,
  );
}

function buildWorldForecastBuilderPrompt(args: RunWorldForecastBuilderArgs): string {
  const packet = args.modelFacingScenePacket ?? buildModelFacingScenePacket(args.frame);
  return [
    "WORLD TRAJECTORY FORECAST CONTRACT",
    "Return one strict JSON object with expiresInTicks, entries, and diagnostics.",
    "You are forecasting advisory pressure for the GM, not writing narration and not mutating world state.",
    "Use only durable/backend-known facts in LOCAL DURABLE FACTS and the redacted prior forecast.",
    "Do not use raw player prose, do not invent executable tool payloads, and do not create state deltas.",
    "Forecast pressure is a constraint, not a script. Do not prewrite scenes, outcomes, or player choices.",
    "Ask: if nobody changes course, what pressure would likely press on the current scene next?",
    "Return model-owned forecast meaning only. Backend fills entry id, entry baseTick, root campaignId, generatedAtTick, expiresAtTick, and promptReady.",
    "Every forecast entry should be bounded pressure: subjectRefs, locality, privacy, playerFacingEligibility, advisoryText, preconditions, advisorySignals, privateTerms.",
    "advisorySignals should be perceptual hooks the GM can surface later (sound, movement, crowd behavior, clock pressure, light, posture), never hidden truth leaking into narration.",
    "Prefer this entry shape: {\"horizonTicks\":3,\"subjectRefs\":[{\"type\":\"location\",\"id\":\"current-location-id\",\"label\":\"Current place\"}],\"confidence\":0.5,\"privacy\":\"public\",\"playerFacingEligibility\":\"local_public\",\"locality\":{\"locationRefs\":[\"current-location-id\"],\"sceneRefs\":[],\"actorRefs\":[]},\"advisoryText\":\"One compact pressure likely to matter if nobody intervenes.\",\"preconditions\":[],\"advisorySignals\":[{\"label\":\"visible pressure\"}],\"privateTerms\":[]}.",
    "Only mark playerFacingEligibility=local_public when the pressure can be safely used in the current local scene without omniscience.",
    "Private/offscreen pressure is allowed, but it must be privacy=private, playerFacingEligibility=never, and include privateTerms for prompt/output guards.",
    "Do not include entry campaignId, toolName, input, plannedTools, action payloads, or state deltas.",
    "",
    "LOCAL DURABLE FACTS",
    JSON.stringify(localDurableFactsForPrompt(packet), null, 2),
    "",
    "PRIOR FORECAST (REDACTED)",
    JSON.stringify(priorForecastForPrompt(args.priorForecast, packet), null, 2),
  ].join("\n");
}

function normalizeForecastEntries(
  entries: readonly ForecastBuilderEntryCandidate[],
  frame: SceneFrame,
  expiresInTicks = WORLD_FORECAST_DEFAULT_HORIZON_TICKS,
): ForecastEntry[] {
  return entries.map((entry, index) => {
    const privacy = entry.privacy;
    const playerFacingEligibility =
      entry.playerFacingEligibility
      ?? (privacy === "public" ? "local_public" : "never");

    return forecastEntrySchema.parse({
      id: entry.id ?? `forecast-${frame.tick}-${index + 1}`,
      baseTick: frame.tick,
      horizonTicks: entry.horizonTicks
        ?? Math.min(Math.max(expiresInTicks, 1), 10_000),
      subjectRefs: entry.subjectRefs.map((subject) => ({
        type: subject.type,
        id: normalizeForecastRef(subject.id),
        ...(forecastSubjectLabel(subject) ? { label: forecastSubjectLabel(subject) } : {}),
      })),
      confidence: entry.confidence ?? WORLD_FORECAST_DEFAULT_CONFIDENCE,
      privacy,
      playerFacingEligibility,
      locality: normalizeForecastLocality(entry, frame),
      advisoryText: entry.advisoryText,
      preconditions: entry.preconditions,
      advisorySignals: entry.advisorySignals,
      privateTerms: normalizePrivateTerms(entry),
    });
  });
}

export async function runWorldForecastBuilder(
  args: RunWorldForecastBuilderArgs,
): Promise<WorldTrajectoryForecast> {
  const packet = args.modelFacingScenePacket ?? buildModelFacingScenePacket(args.frame);
  const model = createModel(args.provider, { role: "judge" });
  const system = [
    "You are the World Forecast Builder for a solo RPG engine.",
    "Return JSON only. Forecasts are advisory pressure, not truth, not tool calls, and not player-facing narration.",
    "Backend remains the rulebook and will validate, scope, stage, and persist only after a successful turn.",
  ].join(" ");
  const prompt = buildWorldForecastBuilderPrompt({
    ...args,
    modelFacingScenePacket: packet,
  });
  const startMs = Date.now();
  log.event("model-facing.scene-packet", {
    source: "world-forecast-builder",
    ...buildModelFacingSceneDiagnostics(packet),
  });

  const result = await withRole("judge", () =>
    safeGenerateObject({
      model,
      schema: forecastBuilderOutputSchema,
      system,
      prompt,
      temperature: 0,
      maxOutputTokens: args.maxOutputTokens ?? WORLD_FORECAST_REFRESH_MAX_OUTPUT_TOKENS,
      retries: 1,
    }),
  );

  const expiresAtTick = args.frame.tick + result.object.expiresInTicks;
  const forecast = worldTrajectoryForecastSchema.parse({
    version: WORLD_FORECAST_VERSION,
    campaignId: args.frame.campaignId,
    baseTick: args.frame.tick,
    generatedAtTick: args.frame.tick,
    expiresAtTick,
    promptReady: false,
    entries: normalizeForecastEntries(result.object.entries, args.frame, result.object.expiresInTicks),
    diagnostics: {
      source: "gm_forecast_builder",
      notes: result.object.diagnostics.notes,
    },
  });
  const trace = result.trace;
  log.event("judge.world-forecast-builder", {
    entryCount: forecast.entries.length,
    expiresAtTick,
    strategy: trace?.strategy ?? null,
    primaryStrategy: trace?.primaryStrategy ?? null,
    fallbackStrategy: trace?.fallbackStrategy ?? null,
    fallbackReason: trace?.fallbackReason ?? null,
    capability: trace?.capability ?? null,
    usage: trace?.usage ?? null,
    responseModel: trace?.response?.modelId ?? null,
    latencyMs: Date.now() - startMs,
  });

  return forecast;
}
