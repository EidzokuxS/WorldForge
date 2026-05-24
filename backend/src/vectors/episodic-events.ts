import crypto from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
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
  campaignId: string;
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

export type EpisodicEventVisibility = NonNullable<LocationRecentEventSummary["visibility"]>;

export type EpisodicEventSearchAudience =
  | {
      kind: "player";
      campaignId: string;
      includeLocalSignals?: boolean;
    }
  | {
      kind: "actor";
      campaignId: string;
      actorId: string;
      includePlayerPerceivable?: boolean;
      includeLocalSignals?: boolean;
    }
  | {
      kind: "system";
      campaignId?: string;
    };

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

const BASE_SCHEMA_FIELD_NAMES = [
  "campaignId",
  "id",
  "text",
  "tick",
  "location",
  "participants",
  "importance",
  "type",
  "visibility",
  "surfaceRoute",
  "knowledgeRoute",
  "hiddenCauseTerms",
] as const;

function createBaseSchema(): Schema {
  return new Schema([
    new Field("campaignId", new Utf8(), false),
    new Field("id", new Utf8(), false),
    new Field("text", new Utf8(), false),
    new Field("tick", new Int32(), false),
    new Field("location", new Utf8(), false),
    new Field("participants", new List(new Field("item", new Utf8(), true)), false),
    new Field("importance", new Int32(), false),
    new Field("type", new Utf8(), false),
    new Field("visibility", new Utf8(), false),
    new Field("surfaceRoute", new Utf8(), false),
    new Field("knowledgeRoute", new Utf8(), false),
    new Field("hiddenCauseTerms", new List(new Field("item", new Utf8(), true)), false),
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

function normalizeStoredEventRow(
  row: Record<string, unknown>,
  options: { preserveVector?: boolean } = {},
): Record<string, unknown> {
  const normalized: Record<string, unknown> = {
    campaignId: String(row.campaignId ?? ""),
    id: String(row.id),
    text: String(row.text),
    tick: Number(row.tick ?? 0),
    location: String(row.location ?? ""),
    participants: normalizeStringArray(row.participants),
    importance: Number(row.importance ?? 0),
    type: String(row.type ?? "event"),
    visibility: String(row.visibility ?? "player_perceivable"),
    surfaceRoute: String(row.surfaceRoute ?? ""),
    knowledgeRoute: String(row.knowledgeRoute ?? ""),
    hiddenCauseTerms: normalizeStringArray(row.hiddenCauseTerms),
  };

  if (options.preserveVector && Array.isArray(row.vector)) {
    normalized.vector = row.vector;
  }

  return normalized;
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

function parseStoredStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return normalizeStringArray(value);
  }
  if (typeof value !== "string" || !value.trim()) {
    return [];
  }
  try {
    return normalizeStringArray(JSON.parse(value) as unknown);
  } catch {
    return [];
  }
}

async function tableHasVectorColumn(table: { schema(): Promise<{ fields: Array<{ name: string }> }> }): Promise<boolean> {
  const schema = await table.schema();
  return schema.fields.some((field) => field.name === "vector");
}

async function tableColumnNames(
  table: { schema(): Promise<{ fields: Array<{ name: string }> }> },
): Promise<Set<string>> {
  const schema = await table.schema();
  return new Set(schema.fields.map((field) => field.name));
}

function inferVectorDimension(rows: readonly Record<string, unknown>[]): number | undefined {
  for (const row of rows) {
    if (Array.isArray(row.vector) && row.vector.length > 0) {
      return row.vector.length;
    }
  }
  return undefined;
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

  const columnNames = await tableColumnNames(table);
  const hasRequiredBaseColumns = BASE_SCHEMA_FIELD_NAMES.every((fieldName) =>
    columnNames.has(fieldName)
  );
  const hasVectorColumn = columnNames.has("vector");
  const requiresVectorColumn = Boolean(vectorDimension && vectorDimension > 0);

  if (hasRequiredBaseColumns && (!requiresVectorColumn || hasVectorColumn)) {
    return table;
  }

  const existingRows = (await table.query().toArray()) as Record<string, unknown>[];
  await db.dropTable(TABLE_NAME);

  const targetVectorDimension =
    requiresVectorColumn ? vectorDimension : inferVectorDimension(existingRows);
  const migratedTable = targetVectorDimension && targetVectorDimension > 0
    ? await db.createEmptyTable(TABLE_NAME, createVectorSchema(targetVectorDimension))
    : await db.createEmptyTable(TABLE_NAME, createBaseSchema());
  if (existingRows.length > 0) {
    await migratedTable.add(
      existingRows.map((row) =>
        normalizeStoredEventRow(row, { preserveVector: Boolean(targetVectorDimension) }),
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

function episodicRowFromRecentEvent(
  event: typeof locationRecentEvents.$inferSelect,
): Record<string, unknown> {
  return {
    campaignId: event.campaignId,
    id: event.sourceEventId ?? event.id,
    text: event.summary,
    tick: event.tick,
    location: event.locationId,
    participants: [],
    importance: event.importance,
    type: event.eventType,
    visibility: event.visibility,
    surfaceRoute: event.surfaceRoute ?? "",
    knowledgeRoute: event.knowledgeRoute ?? "",
    hiddenCauseTerms: parseStoredStringArray(event.hiddenCauseTerms),
  };
}

function rowsById(rows: readonly Record<string, unknown>[]): Map<string, Record<string, unknown>> {
  const result = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const id = String(row.id ?? "").trim();
    if (!id || result.has(id)) continue;
    result.set(id, row);
  }
  return result;
}

export async function rebuildEpisodicEventsFromLocationRecentEvents(
  campaignId: string,
): Promise<{ rebuiltCount: number; preservedVectorCount: number; purgedVectorCount: number }> {
  const restoredEvents = getDb()
    .select()
    .from(locationRecentEvents)
    .where(eq(locationRecentEvents.campaignId, campaignId))
    .orderBy(asc(locationRecentEvents.tick), asc(locationRecentEvents.createdAt))
    .all();
  const authoritativeRows = [...rowsById(restoredEvents.map(episodicRowFromRecentEvent)).values()];
  const authoritativeIds = new Set(authoritativeRows.map((row) => String(row.id)));

  const vectorDb = getVectorDb();
  const tableNames = await vectorDb.tableNames();
  let preservedRows: Record<string, unknown>[] = [];
  let purgedVectorCount = 0;

  if (tableNames.includes(TABLE_NAME)) {
    try {
      const existingTable = await vectorDb.openTable(TABLE_NAME);
      const existingRows = (await existingTable.query().toArray()) as Record<string, unknown>[];
      preservedRows = existingRows.filter((row) => authoritativeIds.has(String(row.id)));
      purgedVectorCount = Math.max(0, existingRows.length - preservedRows.length);
    } catch (error) {
      log.warn("Could not read existing episodic table during rollback rebuild; rebuilding from receipts.", {
        table: TABLE_NAME,
        error: formatStorageError(error),
      });
    }
    await vectorDb.dropTable(TABLE_NAME);
  }

  if (authoritativeRows.length === 0) {
    return { rebuiltCount: 0, preservedVectorCount: 0, purgedVectorCount };
  }

  const vectorDimension = inferVectorDimension(preservedRows);
  const table = await createEpisodicEventsTable(vectorDb, vectorDimension);
  const preservedById = rowsById(preservedRows);
  const rowsToAdd = [
    ...[...preservedById.values()].map((row) =>
      normalizeStoredEventRow(row, { preserveVector: Boolean(vectorDimension) })
    ),
    ...authoritativeRows.filter((row) => !preservedById.has(String(row.id))),
  ];
  await table.add(rowsToAdd);
  log.event("vector.write", {
    store: "episodic_events",
    op: "rebuild_from_location_recent_events",
    count: rowsToAdd.length,
    preservedVectorCount: preservedById.size,
    purgedVectorCount,
  });
  return {
    rebuiltCount: authoritativeRows.length,
    preservedVectorCount: preservedById.size,
    purgedVectorCount,
  };
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
  event: Omit<EpisodicEvent, "id" | "campaignId" | "vector">
): Promise<string> {
  const id = crypto.randomUUID();
  const visibility = event.visibility ?? "player_perceivable";
  const surfaceRoute = event.surfaceRoute ?? null;
  const knowledgeRoute = event.knowledgeRoute ?? null;
  const hiddenCauseTerms = [...(event.hiddenCauseTerms ?? [])];

  // Store WITHOUT vector column — embedding is deferred to post-turn async.
  const row = {
    campaignId,
    id,
    text: event.text,
    tick: event.tick,
    location: event.location,
    participants: event.participants,
    importance: event.importance,
    type: event.type || "event",
    visibility,
    surfaceRoute: surfaceRoute ?? "",
    knowledgeRoute: knowledgeRoute ?? "",
    hiddenCauseTerms,
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
    visibility,
    surfaceRoute,
    knowledgeRoute,
    hiddenCauseTerms,
  });

  queuePendingCommittedEvent(campaignId, {
    id,
    text: event.text,
    tick: event.tick,
    location: event.location,
    participants: [...event.participants],
    importance: event.importance,
    type: event.type || "event",
    visibility,
    surfaceRoute,
    knowledgeRoute,
    hiddenCauseTerms,
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
  audience?: EpisodicEventSearchAudience,
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
  const fetchLimit = Math.max(limit * 6, 30);
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
      campaignId: String(row.campaignId ?? ""),
      text: String(row.text),
      tick,
      location: String(row.location ?? ""),
      participants: normalizeStringArray(row.participants),
      importance,
      type: String(row.type ?? "event"),
      visibility: normalizeEpisodicVisibility(row.visibility),
      surfaceRoute: normalizeNullableText(row.surfaceRoute),
      knowledgeRoute: normalizeNullableText(row.knowledgeRoute),
      hiddenCauseTerms: normalizeStringArray(row.hiddenCauseTerms),
      vector: row.vector as number[],
    };

    return { event, composite };
  }).filter(({ event }) => episodicEventVisibleToAudience(event, audience));

  // Sort by composite descending, take top N
  scored.sort((a, b) => b.composite - a.composite);
  return scored.slice(0, limit).map((s) => s.event);
}

function normalizeNullableText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeEpisodicVisibility(value: unknown): EpisodicEventVisibility {
  return value === "hidden"
    || value === "local_signal"
    || value === "report_only"
    || value === "player_perceivable"
    ? value
    : "player_perceivable";
}

function episodicEventVisibleToAudience(
  event: EpisodicEvent,
  audience: EpisodicEventSearchAudience | undefined,
): boolean {
  if (!audience) return true;
  if (event.campaignId !== audience.campaignId) {
    return false;
  }

  if (audience.kind === "system") {
    return true;
  }

  if (audience.kind === "player") {
    return event.visibility === "player_perceivable"
      || (audience.includeLocalSignals === true && event.visibility === "local_signal");
  }

  if (event.visibility === "hidden") {
    return event.knowledgeRoute === `actor:${audience.actorId}`;
  }

  if (event.visibility === "player_perceivable") {
    return audience.includePlayerPerceivable !== false;
  }

  return audience.includeLocalSignals === true && event.visibility === "local_signal";
}
