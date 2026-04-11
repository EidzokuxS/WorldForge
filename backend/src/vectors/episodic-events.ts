import crypto from "node:crypto";
import { Field, FixedSizeList, Float32, Int32, List, Schema, Utf8 } from "apache-arrow";
import { getVectorDb } from "./connection.js";
import { embedTexts } from "./embeddings.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { createLogger } from "../lib/index.js";
import { recordLocationRecentEvent } from "../engine/location-events.js";

const log = createLogger("episodic-events");

export interface EpisodicEvent {
  id: string;
  text: string;
  tick: number;
  location: string;
  participants: string[];
  importance: number;
  type: string;
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
}

const TABLE_NAME = "episodic_events";
const pendingCommittedEvents = new Map<string, PendingCommittedEvent[]>();

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

async function ensureEpisodicEventsTable(
  vectorDimension?: number,
): Promise<Awaited<ReturnType<ReturnType<typeof getVectorDb>["openTable"]>>> {
  const db = getVectorDb();
  const tableNames = await db.tableNames();

  if (!tableNames.includes(TABLE_NAME)) {
    if (vectorDimension && vectorDimension > 0) {
      return db.createEmptyTable(TABLE_NAME, createVectorSchema(vectorDimension));
    }
    return db.createEmptyTable(TABLE_NAME, createBaseSchema());
  }

  const table = await db.openTable(TABLE_NAME);
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
  };
}

function queuePendingCommittedEvent(campaignId: string, event: PendingCommittedEvent): void {
  const queue = pendingCommittedEvents.get(campaignId) ?? [];
  queue.push(event);
  pendingCommittedEvents.set(campaignId, queue);
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

export function clearPendingCommittedEvents(campaignId: string): void {
  pendingCommittedEvents.delete(campaignId);
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

  recordLocationRecentEvent({
    campaignId,
    locationRef: event.location,
    tick: event.tick,
    eventType: event.type || "event",
    summary: event.text,
    importance: event.importance,
    sourceEventId: id,
  });

  queuePendingCommittedEvent(campaignId, {
    id,
    text: event.text,
    tick: event.tick,
    location: event.location,
    participants: [...event.participants],
    importance: event.importance,
    type: event.type || "event",
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
