import crypto from "node:crypto";
import { and, eq, lte } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  worldThreadEvents,
  worldThreads,
} from "../db/schema.js";
import {
  commitAuthorityTrace,
  readWorldClock,
  validateBaseWorldVersion,
} from "./living-world-authority.js";
import { recordLocationRecentEvent } from "./location-events.js";
import type { ToolResultAuthority } from "./tool-result.js";

export type WorldThreadStatus = "active" | "paused" | "resolved" | "canceled" | "invalidated";
export type WorldThreadVisibility = "hidden" | "signal_only" | "public";

export interface WorldThreadSurfaceRoute {
  id?: string;
  route: "sensory" | "rumor" | "report" | "public_record";
  summary: string;
  locationId?: string | null;
  stage?: string;
  dueWorldTimeMinutes?: number;
  nextDueWorldTimeMinutes?: number | null;
  sourceEventIds?: readonly string[];
  sourceAuthorityTraceIds?: readonly string[];
}

export interface WorldThreadRecord {
  id: string;
  campaignId: string;
  name: string;
  status: WorldThreadStatus;
  stage: string;
  visibility: WorldThreadVisibility;
  pressure: number;
  hiddenCause: string | null;
  hiddenCauseTerms: string[];
  involvedActorIds: string[];
  involvedFactionIds: string[];
  sourceEventIds: string[];
  sourceAuthorityTraceIds: string[];
  surfaceRoutes: WorldThreadSurfaceRoute[];
  currentLocationId: string | null;
  nextDueWorldTimeMinutes: number | null;
  baseWorldVersion: number;
  lastAdvancedWorldVersion: number;
  createdWorldTimeMinutes: number;
  updatedWorldTimeMinutes: number;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface WorldThreadEventRecord {
  id: string;
  campaignId: string;
  threadId: string;
  eventType: string;
  summary: string;
  visibility: WorldThreadVisibility;
  surfaceRoute: string | null;
  locationId: string | null;
  sourceEventIds: string[];
  sourceAuthorityTraceIds: string[];
  worldVersion: number;
  worldTimeMinutes: number;
  createdAt: number;
}

export type WorldThreadAdvanceResult =
  | {
      status: "advanced";
      thread: WorldThreadRecord;
      event: WorldThreadEventRecord;
      authority: ToolResultAuthority;
    }
  | { status: "blocked"; reason: string; thread: WorldThreadRecord | null };

function now(): number {
  return Date.now();
}

function parseJsonRecord(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values ?? []) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
}

function stringifyArray(values: readonly string[] | undefined): string {
  return JSON.stringify(normalizeStringArray(values));
}

function parseSurfaceRoutes(value: string): WorldThreadSurfaceRoute[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> =>
        Boolean(item) && typeof item === "object" && !Array.isArray(item),
      )
      .map((item): WorldThreadSurfaceRoute | null => {
        const summary = typeof item.summary === "string" ? item.summary.trim() : "";
        const route = typeof item.route === "string" ? item.route : "";
        if (!summary || !["sensory", "rumor", "report", "public_record"].includes(route)) {
          return null;
        }
        return {
          id: typeof item.id === "string" ? item.id : undefined,
          route: route as WorldThreadSurfaceRoute["route"],
          summary,
          locationId: typeof item.locationId === "string" ? item.locationId : null,
          stage: typeof item.stage === "string" ? item.stage : undefined,
          dueWorldTimeMinutes:
            typeof item.dueWorldTimeMinutes === "number" ? item.dueWorldTimeMinutes : undefined,
          nextDueWorldTimeMinutes:
            typeof item.nextDueWorldTimeMinutes === "number"
              ? item.nextDueWorldTimeMinutes
              : null,
          sourceEventIds: Array.isArray(item.sourceEventIds)
            ? item.sourceEventIds.filter((value): value is string => typeof value === "string")
            : undefined,
          sourceAuthorityTraceIds: Array.isArray(item.sourceAuthorityTraceIds)
            ? item.sourceAuthorityTraceIds.filter((value): value is string => typeof value === "string")
            : undefined,
        };
      })
      .filter((route): route is WorldThreadSurfaceRoute => route !== null);
  } catch {
    return [];
  }
}

function stringifySurfaceRoutes(routes: readonly WorldThreadSurfaceRoute[] | undefined): string {
  return JSON.stringify(
    (routes ?? []).map((route) => ({
      id: route.id,
      route: route.route,
      summary: route.summary,
      locationId: route.locationId ?? null,
      stage: route.stage,
      dueWorldTimeMinutes: route.dueWorldTimeMinutes,
      nextDueWorldTimeMinutes: route.nextDueWorldTimeMinutes ?? null,
      sourceEventIds: normalizeStringArray(route.sourceEventIds),
      sourceAuthorityTraceIds: normalizeStringArray(route.sourceAuthorityTraceIds),
    })),
  );
}

function hydrateThread(row: typeof worldThreads.$inferSelect): WorldThreadRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    status: row.status,
    stage: row.stage,
    visibility: row.visibility,
    pressure: row.pressure,
    hiddenCause: row.hiddenCause,
    hiddenCauseTerms: parseStringArray(row.hiddenCauseTerms),
    involvedActorIds: parseStringArray(row.involvedActorIds),
    involvedFactionIds: parseStringArray(row.involvedFactionIds),
    sourceEventIds: parseStringArray(row.sourceEventIds),
    sourceAuthorityTraceIds: parseStringArray(row.sourceAuthorityTraceIds),
    surfaceRoutes: parseSurfaceRoutes(row.surfaceRoutes),
    currentLocationId: row.currentLocationId,
    nextDueWorldTimeMinutes: row.nextDueWorldTimeMinutes,
    baseWorldVersion: row.baseWorldVersion,
    lastAdvancedWorldVersion: row.lastAdvancedWorldVersion,
    createdWorldTimeMinutes: row.createdWorldTimeMinutes,
    updatedWorldTimeMinutes: row.updatedWorldTimeMinutes,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function hydrateEvent(row: typeof worldThreadEvents.$inferSelect): WorldThreadEventRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    threadId: row.threadId,
    eventType: row.eventType,
    summary: row.summary,
    visibility: row.visibility,
    surfaceRoute: row.surfaceRoute,
    locationId: row.locationId,
    sourceEventIds: parseStringArray(row.sourceEventIds),
    sourceAuthorityTraceIds: parseStringArray(row.sourceAuthorityTraceIds),
    worldVersion: row.worldVersion,
    worldTimeMinutes: row.worldTimeMinutes,
    createdAt: row.createdAt,
  };
}

function assertHasSource(input: {
  sourceEventIds?: readonly string[];
  sourceAuthorityTraceIds?: readonly string[];
}): string | null {
  return normalizeStringArray(input.sourceEventIds).length > 0
    || normalizeStringArray(input.sourceAuthorityTraceIds).length > 0
    ? null
    : "missing_source_event_or_authority_trace";
}

export function assertWorldThreadSignalSafe(input: {
  summary: string;
  hiddenCauseTerms?: readonly string[];
}): void {
  const normalizedSummary = input.summary.toLowerCase();
  for (const term of input.hiddenCauseTerms ?? []) {
    const normalizedTerm = term.trim().toLowerCase();
    if (!normalizedTerm) continue;
    if (normalizedSummary.includes(normalizedTerm)) {
      throw new Error(`WorldThread surfacing leaks hidden cause term: ${term}`);
    }
  }
}

export function createWorldThread(input: {
  campaignId: string;
  name: string;
  stage: string;
  visibility?: WorldThreadVisibility;
  pressure?: number;
  hiddenCause?: string | null;
  hiddenCauseTerms?: readonly string[];
  involvedActorIds?: readonly string[];
  involvedFactionIds?: readonly string[];
  sourceEventIds?: readonly string[];
  sourceAuthorityTraceIds?: readonly string[];
  surfaceRoutes?: readonly WorldThreadSurfaceRoute[];
  currentLocationId?: string | null;
  nextDueWorldTimeMinutes?: number | null;
  metadata?: Record<string, unknown>;
}): WorldThreadRecord {
  const sourceError = assertHasSource(input);
  if (sourceError) {
    throw new Error(`WorldThread cannot be created without provenance: ${sourceError}.`);
  }
  const clock = readWorldClock(input.campaignId);
  const threadId = crypto.randomUUID();
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "world_thread:create",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "world_thread", id: threadId },
    elapsedWorldTimeMinutes: 0,
    eventIds: normalizeStringArray(input.sourceEventIds),
    stateDeltaRefs: ["world:thread"],
    metadata: {
      name: input.name,
      stage: input.stage,
      sourceAuthorityTraceIds: normalizeStringArray(input.sourceAuthorityTraceIds),
    },
  });
  const timestamp = now();
  const createdWorldVersion = authority.resultWorldVersion ?? clock.worldVersion + 1;
  const createdWorldTimeMinutes =
    authority.worldTimeMinutes ?? clock.worldTimeMinutes;
  const row = {
    id: threadId,
    campaignId: input.campaignId,
    name: input.name.trim(),
    status: "active",
    stage: input.stage.trim(),
    visibility: input.visibility ?? "signal_only",
    pressure: Math.max(0, Math.round(input.pressure ?? 0)),
    hiddenCause: input.hiddenCause?.trim() || null,
    hiddenCauseTerms: stringifyArray(input.hiddenCauseTerms),
    involvedActorIds: stringifyArray(input.involvedActorIds),
    involvedFactionIds: stringifyArray(input.involvedFactionIds),
    sourceEventIds: stringifyArray(input.sourceEventIds),
    sourceAuthorityTraceIds: stringifyArray([
      ...normalizeStringArray(input.sourceAuthorityTraceIds),
      authority.toolResultId,
    ]),
    surfaceRoutes: stringifySurfaceRoutes(input.surfaceRoutes),
    currentLocationId: input.currentLocationId ?? null,
    nextDueWorldTimeMinutes: input.nextDueWorldTimeMinutes ?? null,
    baseWorldVersion: clock.worldVersion,
    lastAdvancedWorldVersion: createdWorldVersion,
    createdWorldTimeMinutes: clock.worldTimeMinutes,
    updatedWorldTimeMinutes: createdWorldTimeMinutes,
    metadata: JSON.stringify(input.metadata ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof worldThreads.$inferInsert;

  getDb().insert(worldThreads).values(row).run();
  return hydrateThread(row as typeof worldThreads.$inferSelect);
}

export function listDueWorldThreads(input: {
  campaignId: string;
  worldTimeMinutes?: number;
}): WorldThreadRecord[] {
  const clock = readWorldClock(input.campaignId);
  const worldTimeMinutes = input.worldTimeMinutes ?? clock.worldTimeMinutes;
  return getDb()
    .select()
    .from(worldThreads)
    .where(
      and(
        eq(worldThreads.campaignId, input.campaignId),
        eq(worldThreads.status, "active"),
        lte(worldThreads.nextDueWorldTimeMinutes, worldTimeMinutes),
      ),
    )
    .all()
    .map(hydrateThread);
}

export function getWorldThread(input: {
  campaignId: string;
  threadId: string;
}): WorldThreadRecord | null {
  const row = getDb()
    .select()
    .from(worldThreads)
    .where(
      and(
        eq(worldThreads.campaignId, input.campaignId),
        eq(worldThreads.id, input.threadId),
      ),
    )
    .get();
  return row ? hydrateThread(row) : null;
}

export function advanceWorldThread(input: {
  campaignId: string;
  threadId: string;
  baseWorldVersion: number;
  nextStage?: string;
  pressureDelta?: number;
  sourceEventIds?: readonly string[];
  sourceAuthorityTraceIds?: readonly string[];
  surface?: {
    summary: string;
    route: WorldThreadSurfaceRoute["route"];
    locationRef?: string | null;
    visibility?: WorldThreadVisibility;
  } | null;
  nextDueWorldTimeMinutes?: number | null;
  metadata?: Record<string, unknown>;
}): WorldThreadAdvanceResult {
  const thread = getWorldThread(input);
  if (!thread) {
    return { status: "blocked", reason: "thread_not_found", thread: null };
  }
  if (thread.status !== "active") {
    return { status: "blocked", reason: `thread_not_active:${thread.status}`, thread };
  }
  const sourceEventIds = normalizeStringArray([
    ...thread.sourceEventIds,
    ...normalizeStringArray(input.sourceEventIds),
  ]);
  const sourceAuthorityTraceIds = normalizeStringArray([
    ...thread.sourceAuthorityTraceIds,
    ...normalizeStringArray(input.sourceAuthorityTraceIds),
  ]);
  const sourceError = assertHasSource({ sourceEventIds, sourceAuthorityTraceIds });
  if (sourceError) {
    return { status: "blocked", reason: sourceError, thread };
  }
  if (input.surface) {
    assertWorldThreadSignalSafe({
      summary: input.surface.summary,
      hiddenCauseTerms: thread.hiddenCauseTerms,
    });
  }

  const clock = validateBaseWorldVersion({
    campaignId: input.campaignId,
    baseWorldVersion: input.baseWorldVersion,
  });
  const authority = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: "world_thread:advance",
    baseWorldVersion: clock.worldVersion,
    sourceEntity: { type: "world_thread", id: thread.id },
    elapsedWorldTimeMinutes: 1,
    eventIds: sourceEventIds,
    stateDeltaRefs: [`world-thread:${thread.id}`],
    metadata: {
      threadId: thread.id,
      nextStage: input.nextStage ?? thread.stage,
      sourceAuthorityTraceIds,
      surfaceRoute: input.surface?.route,
    },
  });
  const resultWorldVersion = authority.resultWorldVersion ?? clock.worldVersion + 1;
  const resultWorldTimeMinutes =
    authority.worldTimeMinutes ?? clock.worldTimeMinutes + 1;

  const eventSummary = input.surface?.summary.trim()
    || `${thread.name} advanced to ${input.nextStage ?? thread.stage}.`;
  const visibility = input.surface?.visibility ?? thread.visibility;
  const timestamp = now();
  const eventRow = {
    id: crypto.randomUUID(),
    campaignId: input.campaignId,
    threadId: thread.id,
    eventType: input.surface ? "surface_signal" : "thread_advance",
    summary: eventSummary,
    visibility,
    surfaceRoute: input.surface?.route ?? null,
    locationId: input.surface?.locationRef ?? thread.currentLocationId,
    sourceEventIds: stringifyArray(sourceEventIds),
    sourceAuthorityTraceIds: stringifyArray([
      ...sourceAuthorityTraceIds,
      authority.toolResultId,
    ]),
    worldVersion: resultWorldVersion,
    worldTimeMinutes: resultWorldTimeMinutes,
    createdAt: timestamp,
  } satisfies typeof worldThreadEvents.$inferInsert;
  getDb().insert(worldThreadEvents).values(eventRow).run();

  if (input.surface?.locationRef && visibility !== "hidden") {
    recordLocationRecentEvent({
      campaignId: input.campaignId,
      locationRef: input.surface.locationRef,
      tick: resultWorldTimeMinutes,
      eventType: "world_thread_signal",
      summary: eventSummary,
      importance: Math.max(2, thread.pressure),
      threadId: thread.id,
      sourceEventId: eventRow.id,
      surfaceRoute: input.surface.route,
      visibility: visibility === "public" ? "player_perceivable" : "local_signal",
      knowledgeRoute:
        input.surface.route === "public_record"
          ? "public_record"
          : input.surface.route === "rumor"
            ? "rumor"
            : "direct_observation",
      hiddenCauseTerms: thread.hiddenCauseTerms,
    });
  }

  const updatedThread = {
    ...thread,
    stage: input.nextStage?.trim() || thread.stage,
    pressure: Math.max(0, thread.pressure + Math.round(input.pressureDelta ?? 1)),
    sourceEventIds,
    sourceAuthorityTraceIds: normalizeStringArray([
      ...sourceAuthorityTraceIds,
      authority.toolResultId,
    ]),
    nextDueWorldTimeMinutes: input.nextDueWorldTimeMinutes ?? null,
    lastAdvancedWorldVersion: resultWorldVersion,
    updatedWorldTimeMinutes: resultWorldTimeMinutes,
    metadata: { ...thread.metadata, ...(input.metadata ?? {}) },
    updatedAt: timestamp,
  };

  getDb()
    .update(worldThreads)
    .set({
      stage: updatedThread.stage,
      pressure: updatedThread.pressure,
      sourceEventIds: stringifyArray(updatedThread.sourceEventIds),
      sourceAuthorityTraceIds: stringifyArray(updatedThread.sourceAuthorityTraceIds),
      nextDueWorldTimeMinutes: updatedThread.nextDueWorldTimeMinutes,
      lastAdvancedWorldVersion: updatedThread.lastAdvancedWorldVersion,
      updatedWorldTimeMinutes: updatedThread.updatedWorldTimeMinutes,
      metadata: JSON.stringify(updatedThread.metadata),
      updatedAt: timestamp,
    })
    .where(eq(worldThreads.id, thread.id))
    .run();

  return {
    status: "advanced",
    thread: updatedThread,
    event: hydrateEvent(eventRow as typeof worldThreadEvents.$inferSelect),
    authority,
  };
}
