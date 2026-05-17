import crypto from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Field, FixedSizeList, Float32, Int32, List, Schema, Utf8 } from "apache-arrow";
import { getDb } from "../db/index.js";
import { locationRecentEvents } from "../db/schema.js";
import { getVectorDb } from "./connection.js";
import { embedTexts } from "./embeddings.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { createLogger } from "../lib/index.js";
import {
  recordLocationRecentEvent,
  type LocationRecentEventSummary,
} from "../engine/location-events.js";

const log = createLogger("episodic-events");

export interface EpisodicEvent {
  id: string;
  text: string;
  tick: number;
  location: string;
  participants: string[];
  importance: number;
  type: string;
  visibility?: LocationRecentEventSummary["visibility"];
  surfaceRoute?: string | null;
  knowledgeRoute?: string | null;
  hiddenCauseTerms?: string[];
  vector: number[];
}

export interface PendingCommittedEvent {
  id: string;
  text: string;
  tick: number;
  location: string;
  participants: string[];
  importance: number;
  type: string;
  visibility?: LocationRecentEventSummary["visibility"];
  surfaceRoute?: string | null;
  knowledgeRoute?: string | null;
  hiddenCauseTerms?: string[];
}

const TABLE_NAME = "episodic_events";
const pendingCommittedEvents = new Map<string, PendingCommittedEvent[]>();

type VectorDb = ReturnType<typeof getVectorDb>;
type EpisodicEventsTable = Awaited<ReturnType<VectorDb["openTable"]>>;

function createBaseSchema(): Schema {
  return new Schema([
    new Field("id", new Utf8(), false),
    new Field("text", new Utf8(), false),
    new Field("tick", new Int32(), false),
    new Field("location", new Utf8(), false),
    new Field("participants", new List(new Field("item", new Utf8(), true)), false),
    new Field("importance", new Int32(), false),
    new Field("type", new Utf8(), false),
  ]);
}

function createVectorSchema(vectorDimension: number): Schema {
  return new Schema([
    ...createBaseSchema().fields,
    new Field(
      "vector",
      new FixedSizeList(vectorDimension, new Field("item", new Float32(), true)),
      true,
    ),
  ]);
}

function normalizeStoredEventRowWithoutVector(
  row: Record<string, unknown>,
): Record<string, unknown> {
  return {
    id: String(row.id),
    text: String(row.text),
    tick: Number(row.tick ?? 0),
    location: String(row.location ?? ""),
    participants: normalizeStringArray(row.participants),
    importance: Number(row.importance ?? 0),
    type: String(row.type ?? "event"),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }

  if (typeof value === "string") {
    return [value];
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;

    if (typeof record.toArray === "function") {
      const arrayValue = (record.toArray as () => unknown[] | undefined).call(value);
      if (Array.isArray(arrayValue)) {
        return arrayValue.map((item) => String(item));
      }
    }

    const iterator = (value as { [Symbol.iterator]?: () => Iterator<unknown> })[Symbol.iterator];
    if (typeof iterator === "function") {
      return Array.from(value as Iterable<unknown>, (item) => String(item));
    }
  }

  return [];
}

async function tableHasVectorColumn(table: { schema(): Promise<{ fields: Array<{ name: string }> }> }): Promise<boolean> {
  const schema = await table.schema();
  return schema.fields.some((field) => field.name === "vector");
}

function formatStorageError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function createEpisodicEventsTable(
  db: VectorDb,
  vectorDimension?: number,
): Promise<EpisodicEventsTable> {
  if (vectorDimension && vectorDimension > 0) {
    return db.createEmptyTable(TABLE_NAME, createVectorSchema(vectorDimension));
  }
  return db.createEmptyTable(TABLE_NAME, createBaseSchema());
}

async function recreateUnreadableEpisodicEventsTable(
  db: VectorDb,
  error: unknown,
  vectorDimension?: number,
): Promise<EpisodicEventsTable> {
  log.warn("Episodic events table was listed but unreadable; recreating storage table.", {
    table: TABLE_NAME,
    error: formatStorageError(error),
  });
  try {
    await db.dropTable(TABLE_NAME);
  } catch (dropError) {
    log.warn("Dropping unreadable episodic events table failed before recreation.", {
      table: TABLE_NAME,
      error: formatStorageError(dropError),
    });
  }
  return createEpisodicEventsTable(db, vectorDimension);
}

async function ensureEpisodicEventsTable(
  vectorDimension?: number,
): Promise<EpisodicEventsTable> {
  const db = getVectorDb();
  const tableNames = await db.tableNames();

  if (!tableNames.includes(TABLE_NAME)) {
    return createEpisodicEventsTable(db, vectorDimension);
  }

  let table: EpisodicEventsTable;
  try {
    table = await db.openTable(TABLE_NAME);
    await table.schema();
  } catch (error) {
    return recreateUnreadableEpisodicEventsTable(db, error, vectorDimension);
  }

  if (!vectorDimension || vectorDimension <= 0) {
    return table;
  }

  if (await tableHasVectorColumn(table)) {
    return table;
  }

  const existingRows = await table.query().toArray();
  await db.dropTable(TABLE_NAME);

  const migratedTable = await db.createEmptyTable(TABLE_NAME, createVectorSchema(vectorDimension));
  if (existingRows.length > 0) {
    await migratedTable.add(
      existingRows.map((row) =>
        normalizeStoredEventRowWithoutVector(row as Record<string, unknown>),
      ),
    );
  }

  return migratedTable;
}

function clonePendingCommittedEvent(event: PendingCommittedEvent): PendingCommittedEvent {
  return {
    ...event,
    participants: [...event.participants],
    hiddenCauseTerms: [...(event.hiddenCauseTerms ?? [])],
  };
}

function queuePendingCommittedEvent(campaignId: string, event: PendingCommittedEvent): void {
  const queue = pendingCommittedEvents.get(campaignId) ?? [];
  queue.push(event);
  pendingCommittedEvents.set(campaignId, queue);
}

function removePendingCommittedEvent(
  campaignId: string,
  eventId: string,
): PendingCommittedEvent | null {
  const queue = pendingCommittedEvents.get(campaignId) ?? [];
  let removed: PendingCommittedEvent | null = null;
  const remaining = queue.filter((event) => {
    if (event.id === eventId && !removed) {
      removed = event;
      return false;
    }
    return true;
  });

  if (remaining.length > 0) {
    pendingCommittedEvents.set(campaignId, remaining);
  } else {
    pendingCommittedEvents.delete(campaignId);
  }

  return removed ? clonePendingCommittedEvent(removed) : null;
}

export function readPendingCommittedEvents(
  campaignId: string,
  tick: number,
): PendingCommittedEvent[] {
  return (pendingCommittedEvents.get(campaignId) ?? [])
    .filter((event) => event.tick === tick)
    .map(clonePendingCommittedEvent);
}

export function drainPendingCommittedEvents(
  campaignId: string,
  tick: number,
): PendingCommittedEvent[] {
  const queue = pendingCommittedEvents.get(campaignId) ?? [];
  const drained: PendingCommittedEvent[] = [];
  const remaining: PendingCommittedEvent[] = [];

  for (const event of queue) {
    if (event.tick === tick) {
      drained.push(event);
    } else {
      remaining.push(event);
    }
  }

  if (remaining.length > 0) {
    pendingCommittedEvents.set(campaignId, remaining);
  } else {
    pendingCommittedEvents.delete(campaignId);
  }

  return drained.map(clonePendingCommittedEvent);
}

export function drainPendingCommittedEventsByIds(
  campaignId: string,
  eventIds: readonly string[],
): PendingCommittedEvent[] {
  const idSet = new Set(
    eventIds
      .map((id) => id.trim())
      .filter(Boolean),
  );
  if (idSet.size === 0) {
    return [];
  }

  const queue = pendingCommittedEvents.get(campaignId) ?? [];
  const drained: PendingCommittedEvent[] = [];
  const remaining: PendingCommittedEvent[] = [];

  for (const event of queue) {
    if (idSet.has(event.id)) {
      drained.push(event);
    } else {
      remaining.push(event);
    }
  }

  if (remaining.length > 0) {
    pendingCommittedEvents.set(campaignId, remaining);
  } else {
    pendingCommittedEvents.delete(campaignId);
  }

  return drained.map(clonePendingCommittedEvent);
}

export function clearPendingCommittedEvents(campaignId: string): void {
  pendingCommittedEvents.delete(campaignId);
}

function escapeTableString(value: string): string {
  return value.replace(/'/g, "''");
}

export async function retractStoredEpisodicEvent(input: {
  campaignId: string;
  eventId: string;
}): Promise<{
  vectorDeleted: boolean;
  pendingEvent: PendingCommittedEvent | null;
}> {
  const pendingEvent = removePendingCommittedEvent(input.campaignId, input.eventId);
  let vectorDeleted = false;

  const vectorDb = getVectorDb();
  const tableNames = await vectorDb.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    const table = await vectorDb.openTable(TABLE_NAME);
    const escapedEventId = escapeTableString(input.eventId);
    const existingRows = await table
      .query()
      .where(`id = '${escapedEventId}'`)
      .toArray();
    if (existingRows.length > 0) {
      await table.delete(`id = '${escapedEventId}'`);
      vectorDeleted = true;
      log.event("vector.write", {
        store: "episodic_events",
        op: "delete",
        count: 1,
        rowId: input.eventId,
      });
    }
  }

  getDb()
    .delete(locationRecentEvents)
    .where(and(
      eq(locationRecentEvents.campaignId, input.campaignId),
      eq(locationRecentEvents.sourceEventId, input.eventId),
    ))
    .run();

  return { vectorDeleted, pendingEvent };
}

export async function retractPendingCommittedEventsForTick(
  campaignId: string,
  tick: number,
): Promise<Array<{
  eventId: string;
  vectorDeleted: boolean;
  pendingEvent: PendingCommittedEvent | null;
}>> {
  const pendingEvents = readPendingCommittedEvents(campaignId, tick);
  const results: Array<{
    eventId: string;
    vectorDeleted: boolean;
    pendingEvent: PendingCommittedEvent | null;
  }> = [];

  for (const event of pendingEvents) {
    const result = await retractStoredEpisodicEvent({
      campaignId,
      eventId: event.id,
    });
    results.push({
      eventId: event.id,
      vectorDeleted: result.vectorDeleted,
      pendingEvent: result.pendingEvent,
    });
  }

  return results;
}

/**
 * Store an episodic event in LanceDB for later semantic retrieval.
 * Vector field is empty (embedding deferred to post-turn async).
 * Returns the generated event ID.
 */
export async function storeEpisodicEvent(
  campaignId: string,
  event: Omit<EpisodicEvent, "id" | "vector">
): Promise<string> {
  const id = crypto.randomUUID();

  // Store WITHOUT vector column — embedding is deferred to post-turn async.
  const row = {
    id,
    text: event.text,
    tick: event.tick,
    location: event.location,
    participants: event.participants,
    importance: event.importance,
    type: event.type || "event",
  };

  const table = await ensureEpisodicEventsTable();
  await table.add([row as unknown as Record<string, unknown>]);
  log.event("vector.write", {
    store: "episodic_events",
    op: "add",
    count: 1,
    rowId: id,
  });

  recordLocationRecentEvent({
    campaignId,
    locationRef: event.location,
    tick: event.tick,
    eventType: event.type || "event",
    summary: event.text,
    importance: event.importance,
    sourceEventId: id,
    visibility: event.visibility,
    surfaceRoute: event.surfaceRoute,
    knowledgeRoute: event.knowledgeRoute,
    hiddenCauseTerms: event.hiddenCauseTerms,
  });

  queuePendingCommittedEvent(campaignId, {
    id,
    text: event.text,
    tick: event.tick,
    location: event.location,
    participants: [...event.participants],
    importance: event.importance,
    type: event.type || "event",
    visibility: event.visibility ?? "player_perceivable",
    surfaceRoute: event.surfaceRoute ?? null,
    knowledgeRoute: event.knowledgeRoute ?? null,
    hiddenCauseTerms: [...(event.hiddenCauseTerms ?? [])],
  });
  log.info(`Stored episodic event ${id} (tick=${event.tick}, importance=${event.importance})`);
  return id;
}

/**
 * Compute composite retrieval score for an episodic event.
 * Pure function — exported for testability.
 *
 * @param similarity - cosine similarity (0-1, higher = more similar)
 * @param tick - event tick
 * @param importance - event importance (1-10)
 * @param currentTick - current game tick (for recency calculation)
 * @returns weighted composite score
 */
export function computeCompositeScore(
  similarity: number,
  tick: number,
  importance: number,
  currentTick: number,
): number {
  const recency = currentTick > 0 ? tick / currentTick : 1.0;
  const importanceNorm = importance / 10;
  return similarity * 0.4 + recency * 0.3 + importanceNorm * 0.3;
}

/**
 * Generate a real embedding for an existing episodic event and update it in LanceDB.
 * Called asynchronously after a turn completes (post-turn hook).
 */
export async function embedAndUpdateEvent(
  eventId: string,
  text: string,
  provider: ResolvedRole["provider"],
): Promise<void> {
  const vectors = await embedTexts([text], provider);
  const vector = vectors[0];
  if (!vector || vector.length === 0) {
    log.warn(`Empty embedding returned for event ${eventId}`);
    return;
  }

  const table = await ensureEpisodicEventsTable(vector.length);
  const rows = await table
    .query()
    .where(`id = '${eventId}'`)
    .toArray();

  if (rows.length === 0) {
    log.warn(`Event ${eventId} not found in table`);
    return;
  }

  await table.update({
    where: `id = '${eventId}'`,
    values: { vector },
  });
  log.event("vector.write", {
    store: "episodic_events",
    op: "update",
    count: 1,
    rowId: eventId,
  });

  log.info(`Embedded episodic event ${eventId} (dim=${vector.length})`);
}

/**
 * Search episodic events by semantic similarity with composite re-ranking.
 * Returns events ranked by: similarity*0.4 + recency*0.3 + importance*0.3
 */
export async function searchEpisodicEvents(
  queryVector: number[],
  currentTick: number,
  limit = 5,
): Promise<EpisodicEvent[]> {
  const db = getVectorDb();

  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) {
    return [];
  }

  const table = await db.openTable(TABLE_NAME);
  if (!(await tableHasVectorColumn(table))) {
    return [];
  }

  // Over-fetch for composite re-ranking.
  // vectorSearch will fail if no rows have a vector column yet (all embeddings deferred).
  // Gracefully return empty in that case.
  const fetchLimit = limit * 3;
  let results: Record<string, unknown>[];
  try {
    results = await table
      .vectorSearch(queryVector)
      .distanceType("cosine")
      .limit(fetchLimit)
      .toArray();
  } catch (err) {
    log.warn("vectorSearch failed (table may lack vector column yet)", err);
    return [];
  }

  // Re-rank with composite score
  const scored = results.map((row: Record<string, unknown>) => {
    const distance = (row._distance as number) ?? 0;
    const similarity = 1 - distance;
    const tick = (row.tick as number) ?? 0;
    const importance = (row.importance as number) ?? 1;

    const composite = computeCompositeScore(similarity, tick, importance, currentTick);

    const event: EpisodicEvent = {
      id: String(row.id),
      text: String(row.text),
      tick,
      location: String(row.location ?? ""),
      participants: (row.participants as string[]) ?? [],
      importance,
      type: String(row.type ?? "event"),
      vector: row.vector as number[],
    };

    return { event, composite };
  });

  // Sort by composite descending, take top N
  scored.sort((a, b) => b.composite - a.composite);
  return scored.slice(0, limit).map((s) => s.event);
}
