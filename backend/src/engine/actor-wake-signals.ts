import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  actorWakeSignals,
  actorWakeSignalStatusValues,
  actorWakeSignalTypeValues,
} from "../db/schema.js";
import type { WakeSignal, WakeSignalType } from "./wake-signals.js";

export type ActorWakeSignalStatus = typeof actorWakeSignalStatusValues[number];
export type ActorWakeSignalActorType = "npc" | "faction_command_node";

export interface ActorWakeSignalRecord {
  id: string;
  campaignId: string;
  actorType: ActorWakeSignalActorType;
  actorId: string;
  signalType: WakeSignalType;
  sourceType: string;
  sourceId: string | null;
  summary: string;
  priority: number;
  requiredBeforeDone: boolean;
  dueWorldTimeMinutes: number | null;
  status: ActorWakeSignalStatus;
  payload: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface EnqueueActorWakeSignalInput {
  id?: string;
  campaignId: string;
  actorType?: ActorWakeSignalActorType;
  actorId: string;
  signalType: WakeSignalType;
  sourceType: string;
  sourceId?: string | null;
  summary: string;
  priority?: number;
  requiredBeforeDone?: boolean;
  dueWorldTimeMinutes?: number | null;
  payload?: Record<string, unknown>;
}

type ActorWakeSignalRow = typeof actorWakeSignals.$inferSelect;

const wakeSignalTypes = new Set<string>(actorWakeSignalTypeValues);
const wakeSignalStatuses = new Set<string>(actorWakeSignalStatusValues);

function now(): number {
  return Date.now();
}

function clampPriority(value: number | undefined): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(10, Math.round(value ?? 0)))
    : 0;
}

function normalizeDueTime(value: number | null | undefined): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
}

function normalizeActorType(value: ActorWakeSignalActorType | undefined): ActorWakeSignalActorType {
  return value ?? "npc";
}

function assertWakeSignalType(value: string): asserts value is WakeSignalType {
  if (!wakeSignalTypes.has(value)) {
    throw new Error(`Unsupported actor wake signal type: ${value}`);
  }
}

function normalizeStatus(value: string): ActorWakeSignalStatus {
  return wakeSignalStatuses.has(value) ? value as ActorWakeSignalStatus : "pending";
}

function parsePayload(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

function hydrate(row: ActorWakeSignalRow): ActorWakeSignalRecord {
  assertWakeSignalType(row.signalType);
  return {
    id: row.id,
    campaignId: row.campaignId,
    actorType: row.actorType === "faction_command_node" ? "faction_command_node" : "npc",
    actorId: row.actorId,
    signalType: row.signalType,
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    summary: row.summary,
    priority: clampPriority(row.priority),
    requiredBeforeDone: row.requiredBeforeDone,
    dueWorldTimeMinutes: row.dueWorldTimeMinutes ?? null,
    status: normalizeStatus(row.status),
    payload: parsePayload(row.payload),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function sourceIdPredicate(sourceId: string | null) {
  return sourceId === null
    ? isNull(actorWakeSignals.sourceId)
    : eq(actorWakeSignals.sourceId, sourceId);
}

function findPendingDuplicate(input: {
  campaignId: string;
  actorType: ActorWakeSignalActorType;
  actorId: string;
  signalType: WakeSignalType;
  sourceType: string;
  sourceId: string | null;
}): ActorWakeSignalRow | undefined {
  return getDb()
    .select()
    .from(actorWakeSignals)
    .where(
      and(
        eq(actorWakeSignals.campaignId, input.campaignId),
        eq(actorWakeSignals.actorType, input.actorType),
        eq(actorWakeSignals.actorId, input.actorId),
        eq(actorWakeSignals.signalType, input.signalType),
        eq(actorWakeSignals.sourceType, input.sourceType),
        sourceIdPredicate(input.sourceId),
        eq(actorWakeSignals.status, "pending"),
      ),
    )
    .get();
}

export function enqueueActorWakeSignal(
  input: EnqueueActorWakeSignalInput,
): ActorWakeSignalRecord {
  assertWakeSignalType(input.signalType);
  const actorType = normalizeActorType(input.actorType);
  const sourceType = input.sourceType.trim();
  const sourceId = input.sourceId?.trim() || null;
  const summary = input.summary.trim();
  if (!sourceType) {
    throw new Error("Actor wake signal sourceType is required.");
  }
  if (!input.actorId.trim()) {
    throw new Error("Actor wake signal actorId is required.");
  }
  if (!summary) {
    throw new Error("Actor wake signal summary is required.");
  }

  const duplicate = findPendingDuplicate({
    campaignId: input.campaignId,
    actorType,
    actorId: input.actorId,
    signalType: input.signalType,
    sourceType,
    sourceId,
  });
  const timestamp = now();
  const priority = clampPriority(input.priority);
  const dueWorldTimeMinutes = normalizeDueTime(input.dueWorldTimeMinutes);

  if (duplicate) {
    getDb()
      .update(actorWakeSignals)
      .set({
        summary,
        priority: Math.max(priority, duplicate.priority),
        requiredBeforeDone: duplicate.requiredBeforeDone || input.requiredBeforeDone === true,
        dueWorldTimeMinutes:
          duplicate.dueWorldTimeMinutes === null
            ? dueWorldTimeMinutes
            : dueWorldTimeMinutes === null
              ? duplicate.dueWorldTimeMinutes
              : Math.min(duplicate.dueWorldTimeMinutes, dueWorldTimeMinutes),
        payload: JSON.stringify({
          ...parsePayload(duplicate.payload),
          ...(input.payload ?? {}),
        }),
        updatedAt: timestamp,
      })
      .where(eq(actorWakeSignals.id, duplicate.id))
      .run();
    return hydrate(
      getDb().select().from(actorWakeSignals).where(eq(actorWakeSignals.id, duplicate.id)).get()
        ?? duplicate,
    );
  }

  const row = {
    id: input.id ?? randomUUID(),
    campaignId: input.campaignId,
    actorType,
    actorId: input.actorId.trim(),
    signalType: input.signalType,
    sourceType,
    sourceId,
    summary,
    priority,
    requiredBeforeDone: input.requiredBeforeDone === true,
    dueWorldTimeMinutes,
    status: "pending" as const,
    payload: JSON.stringify(input.payload ?? {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies typeof actorWakeSignals.$inferInsert;

  getDb().insert(actorWakeSignals).values(row).run();
  return hydrate(row as ActorWakeSignalRow);
}

export function listCriticalActorWakeCandidates(input: {
  campaignId: string;
  worldTimeMinutes: number;
  actorType?: ActorWakeSignalActorType;
  actorIds?: readonly string[];
  limit?: number;
}): ActorWakeSignalRecord[] {
  const actorType = normalizeActorType(input.actorType);
  const actorIds = [...new Set(input.actorIds ?? [])].filter(Boolean);
  if (input.actorIds && actorIds.length === 0) {
    return [];
  }
  const rows = getDb()
    .select()
    .from(actorWakeSignals)
    .where(
      and(
        eq(actorWakeSignals.campaignId, input.campaignId),
        eq(actorWakeSignals.actorType, actorType),
        eq(actorWakeSignals.status, "pending"),
        or(
          isNull(actorWakeSignals.dueWorldTimeMinutes),
          lte(actorWakeSignals.dueWorldTimeMinutes, input.worldTimeMinutes),
        ),
        actorIds.length > 0 ? inArray(actorWakeSignals.actorId, actorIds) : undefined,
      ),
    )
    .all()
    .map(hydrate)
    .sort((left, right) =>
      Number(right.requiredBeforeDone) - Number(left.requiredBeforeDone)
      || right.priority - left.priority
      || (left.dueWorldTimeMinutes ?? 0) - (right.dueWorldTimeMinutes ?? 0)
      || left.createdAt - right.createdAt,
    );
  return rows.slice(0, input.limit ?? rows.length);
}

export function listPendingWakeSignalsForActors(input: {
  campaignId: string;
  actorIds: readonly string[];
  worldTimeMinutes: number;
  actorType?: ActorWakeSignalActorType;
}): ActorWakeSignalRecord[] {
  const actorIds = [...new Set(input.actorIds)].filter(Boolean);
  if (actorIds.length === 0) {
    return [];
  }
  return listCriticalActorWakeCandidates({
    campaignId: input.campaignId,
    worldTimeMinutes: input.worldTimeMinutes,
    actorType: input.actorType,
    actorIds,
  });
}

export function consumeActorWakeSignals(input: {
  campaignId: string;
  actorIds?: readonly string[];
  signalIds?: readonly string[];
}): number {
  const actorIds = [...new Set(input.actorIds ?? [])].filter(Boolean);
  const signalIds = [...new Set(input.signalIds ?? [])].filter(Boolean);
  if (actorIds.length === 0 && signalIds.length === 0) {
    return 0;
  }
  const result = getDb()
    .update(actorWakeSignals)
    .set({
      status: "consumed",
      updatedAt: now(),
    })
    .where(
      and(
        eq(actorWakeSignals.campaignId, input.campaignId),
        eq(actorWakeSignals.status, "pending"),
        actorIds.length > 0 ? inArray(actorWakeSignals.actorId, actorIds) : undefined,
        signalIds.length > 0 ? inArray(actorWakeSignals.id, signalIds) : undefined,
      ),
    )
    .run();
  return result.changes;
}

export function expireActorWakeSignals(input: {
  campaignId: string;
  beforeWorldTimeMinutes: number;
}): number {
  const result = getDb()
    .update(actorWakeSignals)
    .set({
      status: "expired",
      updatedAt: now(),
    })
    .where(
      and(
        eq(actorWakeSignals.campaignId, input.campaignId),
        eq(actorWakeSignals.status, "pending"),
        lte(actorWakeSignals.dueWorldTimeMinutes, input.beforeWorldTimeMinutes),
      ),
    )
    .run();
  return result.changes;
}

export function actorWakeSignalToWakeSignal(
  record: ActorWakeSignalRecord,
): WakeSignal {
  return {
    type: record.signalType,
    reason: record.summary,
    priority: record.priority,
    requiredBeforeDone: record.requiredBeforeDone,
    sourceId: record.sourceId ?? record.id,
  };
}
