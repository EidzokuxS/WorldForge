import { z } from "zod";

import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { createLogger, withRole } from "../lib/index.js";
import {
  buildModelFacingSceneDiagnostics,
  buildModelFacingScenePacket,
  buildModelFacingScenePromptView,
  isUnsafeModelFacingRef,
  type ModelFacingScenePacket,
} from "./model-facing-scene.js";
import { sanitizeModelFacingJson } from "./model-facing-conversation.js";
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

function safeForecastSubjectLabel(
  subject: { label?: string; id: string },
): string | undefined {
  const label = forecastSubjectLabel(subject)?.trim();
  if (!label || isUnsafeModelFacingRef(label)) return undefined;
  return label;
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

type ForecastPromptRefResolver = ReadonlyMap<string, string>;

function normalizeForecastRef(
  value: string,
  frame?: SceneFrame,
  promptRefResolver?: ForecastPromptRefResolver,
): string {
  const parsed = parseTypedRef(value);
  const id = parsed.id.trim();
  const normalized = id.toLowerCase();
  const mapped = promptRefResolver?.get(normalized)
    ?? promptRefResolver?.get(value.trim().toLowerCase());
  if (mapped) return mapped;
  if (frame) {
    if (normalized === "current_location" && frame.currentLocationId) return frame.currentLocationId;
    if (normalized === "current_scene" && frame.currentSceneScopeId) return frame.currentSceneScopeId;
    if (normalized === "player" && frame.playerActorId) return frame.playerActorId;
  }
  return id;
}

function pushUniqueRef(
  target: string[],
  value: string | null | undefined,
  frame?: SceneFrame,
  promptRefResolver?: ForecastPromptRefResolver,
): void {
  const trimmed = value?.trim();
  if (!trimmed) return;
  const normalized = normalizeForecastRef(trimmed, frame, promptRefResolver);
  const key = normalized.toLowerCase();
  if (target.some((entry) => entry.toLowerCase() === key)) return;
  target.push(normalized);
}

function pushTypedLocalityRef(
  locality: { locationRefs: string[]; sceneRefs: string[]; actorRefs: string[] },
  value: string,
  frame: SceneFrame,
  promptRefResolver?: ForecastPromptRefResolver,
): void {
  const parsed = parseTypedRef(value);
  if (parsed.type === "scene") {
    pushUniqueRef(locality.sceneRefs, parsed.id, frame, promptRefResolver);
    return;
  }
  if (parsed.type === "actor") {
    pushUniqueRef(locality.actorRefs, parsed.id, frame, promptRefResolver);
    return;
  }
  pushUniqueRef(locality.locationRefs, parsed.id, frame, promptRefResolver);
}

function normalizeForecastLocality(
  entry: ForecastBuilderEntryCandidate,
  frame: SceneFrame,
  promptRefResolver?: ForecastPromptRefResolver,
): ForecastEntry["locality"] {
  const locality = {
    locationRefs: [] as string[],
    sceneRefs: [] as string[],
    actorRefs: [] as string[],
  };

  for (const ref of entry.localityRefs ?? []) {
    pushTypedLocalityRef(locality, ref, frame, promptRefResolver);
  }

  const rawLocality = entry.locality;
  if (rawLocality && "locationRefs" in rawLocality) {
    rawLocality.locationRefs.forEach((ref) =>
      pushUniqueRef(locality.locationRefs, ref, frame, promptRefResolver));
    rawLocality.sceneRefs.forEach((ref) =>
      pushUniqueRef(locality.sceneRefs, ref, frame, promptRefResolver));
    rawLocality.actorRefs.forEach((ref) =>
      pushUniqueRef(locality.actorRefs, ref, frame, promptRefResolver));
  } else if (rawLocality && "refs" in rawLocality) {
    rawLocality.refs.forEach((ref) =>
      pushTypedLocalityRef(locality, ref, frame, promptRefResolver));
  } else if (rawLocality && "id" in rawLocality) {
    if (rawLocality.type === "scene") {
      pushUniqueRef(locality.sceneRefs, rawLocality.id, frame, promptRefResolver);
    } else if (rawLocality.type === "actor") {
      pushUniqueRef(locality.actorRefs, rawLocality.id, frame, promptRefResolver);
    } else {
      pushUniqueRef(locality.locationRefs, rawLocality.id, frame, promptRefResolver);
    }
  }

  for (const subject of entry.subjectRefs) {
    if (subject.type === "location") {
      pushUniqueRef(locality.locationRefs, subject.id, frame, promptRefResolver);
    }
    if (subject.type === "scene") {
      pushUniqueRef(locality.sceneRefs, subject.id, frame, promptRefResolver);
    }
    if (subject.type === "actor") {
      pushUniqueRef(locality.actorRefs, subject.id, frame, promptRefResolver);
    }
  }

  if (
    locality.locationRefs.length === 0
    && locality.sceneRefs.length === 0
    && locality.actorRefs.length === 0
  ) {
    pushUniqueRef(locality.locationRefs, frame.currentLocationId, frame, promptRefResolver);
    pushUniqueRef(locality.sceneRefs, frame.currentSceneScopeId, frame, promptRefResolver);
    pushUniqueRef(locality.actorRefs, frame.playerActorId, frame, promptRefResolver);
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
      pushUniqueRef(
        terms,
        safeForecastSubjectLabel(subject) ?? `${subject.type} forecast subject`,
      );
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
  return buildModelFacingScenePromptView(packet.view);
}

function addPromptRefMapping(
  refs: Map<string, string>,
  rawRef: string | null | undefined,
  promptRef: string | null | undefined,
): void {
  const raw = rawRef?.trim();
  const prompt = promptRef?.trim();
  if (!raw || !prompt) return;
  refs.set(raw.toLowerCase(), prompt);
}

function buildForecastPromptRefMap(packet: ModelFacingScenePacket): Map<string, string> {
  const refs = new Map<string, string>();
  const promptView = buildModelFacingScenePromptView(packet.view);
  addPromptRefMapping(refs, packet.view.localScene.playerActorId, "Player");
  addPromptRefMapping(refs, packet.view.localScene.currentLocationId, "current_location");
  addPromptRefMapping(refs, packet.view.localScene.currentLocationName, "current_location");
  addPromptRefMapping(refs, packet.view.localScene.currentSceneScopeId, "current_scene");
  addPromptRefMapping(refs, packet.view.localScene.currentSceneScopeName, "current_scene");

  packet.view.visibleActors.forEach((actor, index) => {
    const promptActor = promptView.visibleActors[index];
    addPromptRefMapping(refs, actor.id, promptActor?.ref);
    addPromptRefMapping(refs, actor.actorId, promptActor?.ref);
    addPromptRefMapping(refs, actor.label, promptActor?.ref);
  });

  packet.view.legalTargets.forEach((target, index) => {
    const promptTarget = promptView.legalTargets[index];
    addPromptRefMapping(refs, target.id, promptTarget?.ref);
    addPromptRefMapping(refs, target.actorId, promptTarget?.ref);
    addPromptRefMapping(refs, target.itemId, promptTarget?.ref);
    addPromptRefMapping(refs, target.locationId, promptTarget?.ref);
    addPromptRefMapping(refs, target.factionId, promptTarget?.ref);
    addPromptRefMapping(refs, target.label, promptTarget?.ref);
  });

  packet.view.legalMovement.forEach((movement, index) => {
    const promptMovement = promptView.legalMovement[index];
    addPromptRefMapping(refs, movement.id, promptMovement?.ref);
    addPromptRefMapping(refs, movement.locationId, promptMovement?.ref);
    addPromptRefMapping(refs, movement.label, promptMovement?.ref);
  });

  return refs;
}

function addPromptAliasResolution(
  refs: Map<string, string>,
  promptRef: string | null | undefined,
  rawRef: string | null | undefined,
): void {
  const prompt = promptRef?.trim();
  const raw = rawRef?.trim();
  if (!prompt || !raw) return;
  refs.set(prompt.toLowerCase(), raw);
}

function targetRawRef(target: ModelFacingScenePacket["view"]["legalTargets"][number]): string {
  switch (target.type) {
    case "actor":
      return target.actorId ?? target.id;
    case "item":
      return target.itemId ?? target.id;
    case "location":
      return target.locationId ?? target.id;
    case "faction":
      return target.factionId ?? target.id;
  }
}

function buildForecastPromptRefResolver(packet: ModelFacingScenePacket): Map<string, string> {
  const refs = new Map<string, string>();
  const promptView = buildModelFacingScenePromptView(packet.view);
  addPromptAliasResolution(refs, "Player", packet.view.localScene.playerActorId);
  addPromptAliasResolution(refs, "current_location", packet.view.localScene.currentLocationId);
  addPromptAliasResolution(refs, packet.view.localScene.currentLocationName, packet.view.localScene.currentLocationId);
  addPromptAliasResolution(refs, "current_scene", packet.view.localScene.currentSceneScopeId);
  addPromptAliasResolution(refs, packet.view.localScene.currentSceneScopeName, packet.view.localScene.currentSceneScopeId);

  packet.view.visibleActors.forEach((actor, index) => {
    const promptActor = promptView.visibleActors[index];
    const rawRef = actor.actorId ?? actor.id;
    addPromptAliasResolution(refs, promptActor?.ref, rawRef);
    addPromptAliasResolution(refs, `actor_${index + 1}`, rawRef);
    addPromptAliasResolution(refs, actor.label, rawRef);
  });

  packet.view.legalTargets.forEach((target, index) => {
    const promptTarget = promptView.legalTargets[index];
    const rawRef = targetRawRef(target);
    addPromptAliasResolution(refs, promptTarget?.ref, rawRef);
    addPromptAliasResolution(refs, `${target.type}_${index + 1}`, rawRef);
    addPromptAliasResolution(refs, target.label, rawRef);
  });

  packet.view.legalMovement.forEach((movement, index) => {
    const promptMovement = promptView.legalMovement[index];
    addPromptAliasResolution(refs, promptMovement?.ref, movement.locationId ?? movement.id);
    addPromptAliasResolution(refs, `movement_${index + 1}`, movement.locationId ?? movement.id);
    addPromptAliasResolution(refs, `location_${index + 1}`, movement.locationId ?? movement.id);
    addPromptAliasResolution(refs, movement.label, movement.locationId ?? movement.id);
  });

  return refs;
}

function promptSafeForecastRef(
  ref: string,
  promptRefs: ReadonlyMap<string, string>,
  fallback: string,
): string {
  const trimmed = ref.trim();
  const mapped = promptRefs.get(trimmed.toLowerCase());
  if (mapped) return mapped;
  return isUnsafeModelFacingRef(trimmed) ? fallback : trimmed;
}

function priorForecastForPrompt(
  forecast: WorldTrajectoryForecast | null | undefined,
  packet: ModelFacingScenePacket,
): unknown {
  if (!forecast) return null;
  const promptRefs = buildForecastPromptRefMap(packet);
  const promptVisibleEntries = forecast.entries.filter((entry) => entry.privacy === "public");
  return sanitizeModelFacingJson(
    {
      baseTick: forecast.baseTick,
      generatedAtTick: forecast.generatedAtTick,
      expiresAtTick: forecast.expiresAtTick,
      omittedNonPublicEntryCount: forecast.entries.length - promptVisibleEntries.length,
      entries: promptVisibleEntries.map((entry, entryIndex) => ({
        entryId: `forecast_${entryIndex + 1}`,
        horizonTicks: entry.horizonTicks,
        subjectRefs: entry.subjectRefs.map((subject, subjectIndex) => ({
          type: subject.type,
          ref: promptSafeForecastRef(
            subject.id,
            promptRefs,
            `subject_${subjectIndex + 1}`,
          ),
          label: subject.label ?? null,
        })),
        confidence: entry.confidence,
        privacy: entry.privacy,
        playerFacingEligibility: entry.playerFacingEligibility,
        locality: {
          locationRefs: entry.locality.locationRefs.map((ref, index) =>
            promptSafeForecastRef(ref, promptRefs, `place_${index + 1}`)),
          sceneRefs: entry.locality.sceneRefs.map((ref, index) =>
            promptSafeForecastRef(ref, promptRefs, `scope_${index + 1}`)),
          actorRefs: entry.locality.actorRefs.map((ref, index) =>
            promptSafeForecastRef(ref, promptRefs, `person_${index + 1}`)),
        },
        advisoryText: entry.advisoryText,
        preconditions: entry.preconditions,
        advisorySignals: entry.advisorySignals,
      })),
    },
    { safety: packet.safety },
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
    "Use human-readable labels, current_scene/current_location, Player, or short prompt aliases. Never copy UUID-like backend ids, typed backend refs, actor ids, location ids, route ids, or tool result ids.",
    "Prefer this entry shape: {\"horizonTicks\":3,\"subjectRefs\":[{\"type\":\"location\",\"id\":\"current_location\",\"label\":\"Current place\"}],\"confidence\":0.5,\"privacy\":\"public\",\"playerFacingEligibility\":\"local_public\",\"locality\":{\"locationRefs\":[\"current_location\"],\"sceneRefs\":[\"current_scene\"],\"actorRefs\":[]},\"advisoryText\":\"One compact pressure likely to matter if nobody intervenes.\",\"preconditions\":[],\"advisorySignals\":[{\"label\":\"visible pressure\"}],\"privateTerms\":[]}.",
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
  promptRefResolver?: ForecastPromptRefResolver,
  expiresInTicks = WORLD_FORECAST_DEFAULT_HORIZON_TICKS,
): ForecastEntry[] {
  return entries.map((entry, index) => {
    const privacy = entry.privacy;
    const playerFacingEligibility =
      entry.playerFacingEligibility
      ?? (privacy === "public" ? "local_public" : "never");

    return forecastEntrySchema.parse({
      id: `forecast-${frame.tick}-${index + 1}`,
      baseTick: frame.tick,
      horizonTicks: entry.horizonTicks
        ?? Math.min(Math.max(expiresInTicks, 1), 10_000),
      subjectRefs: entry.subjectRefs.map((subject) => ({
        type: subject.type,
        id: normalizeForecastRef(subject.id, frame, promptRefResolver),
        ...(safeForecastSubjectLabel(subject) ? { label: safeForecastSubjectLabel(subject) } : {}),
      })),
      confidence: entry.confidence ?? WORLD_FORECAST_DEFAULT_CONFIDENCE,
      privacy,
      playerFacingEligibility,
      locality: normalizeForecastLocality(entry, frame, promptRefResolver),
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
    entries: normalizeForecastEntries(
      result.object.entries,
      args.frame,
      buildForecastPromptRefResolver(packet),
      result.object.expiresInTicks,
    ),
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
