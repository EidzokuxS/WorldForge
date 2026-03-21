import crypto from "node:crypto";
import { getVectorDb } from "./connection.js";
import { embedTexts } from "./embeddings.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import { createLogger } from "../lib/index.js";

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

const TABLE_NAME = "episodic_events";

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

  const db = getVectorDb();

  // Store WITHOUT vector column — embedding is deferred to post-turn async.
  // An empty vector [] causes "Failed to infer data type for field vector" on createTable.
  const row = {
    id,
    text: event.text,
    tick: event.tick,
    location: event.location,
    participants: event.participants,
    importance: event.importance,
    type: event.type || "event",
  };

  const tableNames = await db.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    const table = await db.openTable(TABLE_NAME);
    await table.add([row as unknown as Record<string, unknown>]);
  } else {
    await db.createTable(TABLE_NAME, [row as unknown as Record<string, unknown>]);
  }

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

  const db = getVectorDb();

  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) {
    log.warn(`Table ${TABLE_NAME} not found when updating event ${eventId}`);
    return;
  }

  const table = await db.openTable(TABLE_NAME);

  // LanceDB: delete old row, re-add with vector
  // First, query the existing row to preserve metadata
  const rows = await table
    .query()
    .where(`id = '${eventId}'`)
    .toArray();

  if (rows.length === 0) {
    log.warn(`Event ${eventId} not found in table`);
    return;
  }

  const existing = rows[0] as Record<string, unknown>;
  const updatedRow = { ...existing, vector };

  await table.delete(`id = '${eventId}'`);
  await table.add([updatedRow]);

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
