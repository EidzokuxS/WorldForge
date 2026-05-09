import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import { actorKnowledgeRecords } from "../db/schema.js";
import { readWorldClock } from "./living-world-authority.js";
import type { ActorFrameExternalFactInput } from "./actor-frame.js";

export type ActorKnowledgeRoute =
  | "direct_observation"
  | "report_message"
  | "rumor"
  | "belief"
  | "memory"
  | "public_record"
  | "claim";

export type ActorKnowledgeTruthStatus =
  | "observed"
  | "reported"
  | "rumored"
  | "believed"
  | "claimed"
  | "verified"
  | "disputed";

export type ActorKnowledgePrivacy = "private" | "shared" | "public";

export interface RecordActorKnowledgeInput {
  campaignId: string;
  actorId: string;
  route: ActorKnowledgeRoute;
  truthStatus?: ActorKnowledgeTruthStatus;
  statement: string;
  subjectRefs?: readonly string[];
  sourceEventIds?: readonly string[];
  sourceKnowledgeIds?: readonly string[];
  authorityTraceIds?: readonly string[];
  sourceActorId?: string | null;
  recipientActorIds?: readonly string[];
  confidence?: number;
  reliability?: number;
  privacy?: ActorKnowledgePrivacy;
  observedAtWorldVersion?: number | null;
  deliveredWorldTimeMinutes?: number | null;
  expiresWorldTimeMinutes?: number | null;
  metadata?: Record<string, unknown>;
}

export interface ActorKnowledgeRecord {
  id: string;
  campaignId: string;
  actorId: string;
  route: ActorKnowledgeRoute;
  truthStatus: ActorKnowledgeTruthStatus;
  statement: string;
  subjectRefs: string[];
  sourceEventIds: string[];
  sourceKnowledgeIds: string[];
  authorityTraceIds: string[];
  sourceActorId: string | null;
  recipientActorIds: string[];
  confidence: number;
  reliability: number;
  privacy: ActorKnowledgePrivacy;
  baseWorldVersion: number;
  validFromWorldVersion: number;
  observedAtWorldVersion: number | null;
  invalidatedAtWorldVersion: number | null;
  createdWorldTimeMinutes: number;
  deliveredWorldTimeMinutes: number | null;
  expiresWorldTimeMinutes: number | null;
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface ListActorKnowledgeInput {
  campaignId: string;
  actorId: string;
  worldVersion?: number | null;
  routes?: readonly ActorKnowledgeRoute[];
  subjectRefs?: readonly string[];
  query?: string;
  limit?: number;
}

function now(): number {
  return Date.now();
}

function clampPercent(value: number | undefined, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  if (!values) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(trimmed);
  }
  return normalized;
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

function stringify(value: unknown): string {
  return JSON.stringify(value ?? {});
}

function defaultTruthStatus(route: ActorKnowledgeRoute): ActorKnowledgeTruthStatus {
  switch (route) {
    case "direct_observation":
      return "observed";
    case "report_message":
      return "reported";
    case "rumor":
      return "rumored";
    case "belief":
      return "believed";
    case "memory":
      return "believed";
    case "public_record":
      return "verified";
    case "claim":
      return "claimed";
  }
}

function hydrate(row: typeof actorKnowledgeRecords.$inferSelect): ActorKnowledgeRecord {
  return {
    id: row.id,
    campaignId: row.campaignId,
    actorId: row.actorId,
    route: row.route as ActorKnowledgeRoute,
    truthStatus: row.truthStatus as ActorKnowledgeTruthStatus,
    statement: row.statement,
    subjectRefs: parseStringArray(row.subjectRefs),
    sourceEventIds: parseStringArray(row.sourceEventIds),
    sourceKnowledgeIds: parseStringArray(row.sourceKnowledgeIds),
    authorityTraceIds: parseStringArray(row.authorityTraceIds),
    sourceActorId: row.sourceActorId,
    recipientActorIds: parseStringArray(row.recipientActorIds),
    confidence: row.confidence,
    reliability: row.reliability,
    privacy: row.privacy as ActorKnowledgePrivacy,
    baseWorldVersion: row.baseWorldVersion,
    validFromWorldVersion: row.validFromWorldVersion,
    observedAtWorldVersion: row.observedAtWorldVersion,
    invalidatedAtWorldVersion: row.invalidatedAtWorldVersion,
    createdWorldTimeMinutes: row.createdWorldTimeMinutes,
    deliveredWorldTimeMinutes: row.deliveredWorldTimeMinutes,
    expiresWorldTimeMinutes: row.expiresWorldTimeMinutes,
    metadata: parseJsonRecord(row.metadata),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function recordActorKnowledge(input: RecordActorKnowledgeInput): ActorKnowledgeRecord {
  const statement = input.statement.trim();
  if (!statement) {
    throw new Error("Actor knowledge statement cannot be empty.");
  }
  const clock = readWorldClock(input.campaignId);
  const timestamp = now();
  const row = {
    id: randomUUID(),
    campaignId: input.campaignId,
    actorId: input.actorId,
    route: input.route,
    truthStatus: input.truthStatus ?? defaultTruthStatus(input.route),
    statement,
    subjectRefs: stringify(normalizeStringArray(input.subjectRefs)),
    sourceEventIds: stringify(normalizeStringArray(input.sourceEventIds)),
    sourceKnowledgeIds: stringify(normalizeStringArray(input.sourceKnowledgeIds)),
    authorityTraceIds: stringify(normalizeStringArray(input.authorityTraceIds)),
    sourceActorId: input.sourceActorId ?? null,
    recipientActorIds: stringify(normalizeStringArray(input.recipientActorIds)),
    confidence: clampPercent(input.confidence, input.route === "rumor" ? 45 : 70),
    reliability: clampPercent(input.reliability, input.route === "rumor" ? 35 : 70),
    privacy: input.privacy ?? (input.route === "public_record" ? "public" : "private"),
    baseWorldVersion: clock.worldVersion,
    validFromWorldVersion: clock.worldVersion,
    observedAtWorldVersion: input.observedAtWorldVersion ?? clock.worldVersion,
    invalidatedAtWorldVersion: null,
    createdWorldTimeMinutes: clock.worldTimeMinutes,
    deliveredWorldTimeMinutes: input.deliveredWorldTimeMinutes ?? clock.worldTimeMinutes,
    expiresWorldTimeMinutes: input.expiresWorldTimeMinutes ?? null,
    metadata: stringify(input.metadata ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof actorKnowledgeRecords.$inferInsert;

  getDb().insert(actorKnowledgeRecords).values(row).run();
  return hydrate(row as typeof actorKnowledgeRecords.$inferSelect);
}

function queryTokens(query: string | undefined): string[] {
  if (!query) return [];
  return query
    .toLowerCase()
    .split(/[^a-zа-яё0-9_'-]+/iu)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function lexicalScore(record: ActorKnowledgeRecord, tokens: readonly string[]): number {
  if (tokens.length === 0) return 0;
  const haystack = [
    record.statement,
    ...record.subjectRefs,
    record.sourceActorId ?? "",
  ].join(" ").toLowerCase();
  return tokens.reduce((score, token) => score + (haystack.includes(token) ? 1 : 0), 0);
}

function subjectScore(record: ActorKnowledgeRecord, subjectRefs: readonly string[]): number {
  if (subjectRefs.length === 0) return 0;
  const subjects = new Set(record.subjectRefs.map((ref) => ref.toLowerCase()));
  return subjectRefs.reduce((score, ref) => score + (subjects.has(ref.toLowerCase()) ? 1 : 0), 0);
}

export function listActorKnowledge(input: ListActorKnowledgeInput): ActorKnowledgeRecord[] {
  const clock = readWorldClock(input.campaignId);
  const effectiveWorldVersion = input.worldVersion ?? clock.worldVersion;
  const routes = input.routes?.length ? [...input.routes] : null;
  const rows = getDb()
    .select()
    .from(actorKnowledgeRecords)
    .where(
      and(
        eq(actorKnowledgeRecords.campaignId, input.campaignId),
        eq(actorKnowledgeRecords.actorId, input.actorId),
        lte(actorKnowledgeRecords.validFromWorldVersion, effectiveWorldVersion),
        or(
          isNull(actorKnowledgeRecords.invalidatedAtWorldVersion),
          lte(actorKnowledgeRecords.invalidatedAtWorldVersion, effectiveWorldVersion + 1_000_000_000),
        ),
        routes ? inArray(actorKnowledgeRecords.route, routes) : undefined,
      ),
    )
    .all()
    .map(hydrate)
    .filter((record) =>
      record.invalidatedAtWorldVersion === null
      || record.invalidatedAtWorldVersion > effectiveWorldVersion,
    )
    .filter((record) =>
      record.expiresWorldTimeMinutes === null
      || record.expiresWorldTimeMinutes >= clock.worldTimeMinutes,
    );

  const tokens = queryTokens(input.query);
  const subjectRefs = normalizeStringArray(input.subjectRefs);
  return rows
    .map((record) => ({
      record,
      score:
        subjectScore(record, subjectRefs) * 10
        + lexicalScore(record, tokens) * 4
        + record.confidence / 100
        + record.reliability / 200,
    }))
    .filter(({ score }) => tokens.length === 0 && subjectRefs.length === 0 ? true : score > 0)
    .sort((a, b) => b.score - a.score || b.record.createdAt - a.record.createdAt)
    .slice(0, input.limit ?? 12)
    .map(({ record }) => record);
}

export function invalidateActorKnowledgeAfterRestore(input: {
  campaignId: string;
  restoredWorldVersion: number;
  reason: string;
}): void {
  getDb()
    .update(actorKnowledgeRecords)
    .set({
      invalidatedAtWorldVersion: input.restoredWorldVersion,
      updatedAt: now(),
      metadata: stringify({ invalidationReason: input.reason }),
    })
    .where(
      and(
        eq(actorKnowledgeRecords.campaignId, input.campaignId),
        or(
          gt(actorKnowledgeRecords.baseWorldVersion, input.restoredWorldVersion),
          gt(actorKnowledgeRecords.validFromWorldVersion, input.restoredWorldVersion),
          gt(actorKnowledgeRecords.observedAtWorldVersion, input.restoredWorldVersion),
        ),
      ),
    )
    .run();
}

export function toActorFrameExternalFact(
  record: ActorKnowledgeRecord,
): ActorFrameExternalFactInput {
  const route = record.route === "claim" || record.route === "direct_observation"
    ? "belief"
    : record.route;
  return {
    id: `knowledge:${record.id}`,
    route,
    text: `${record.truthStatus}: ${record.statement}`,
    subjectRefs: record.subjectRefs,
    confidence: record.confidence / 100,
    reliability: record.reliability / 100,
    sourceEventIds: record.sourceEventIds,
    sourceKnowledgeIds: [record.id, ...record.sourceKnowledgeIds],
    authorityTraceIds: record.authorityTraceIds,
    deliveredAtWorldTimeMinutes: record.deliveredWorldTimeMinutes,
  };
}
