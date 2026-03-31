import crypto from "node:crypto";
import { embedTexts } from "./embeddings.js";
import { getVectorDb } from "./connection.js";
import type { ResolveResult } from "../ai/index.js";
import { createLogger } from "../lib/index.js";
import { LORE_CATEGORIES, type LoreCategory } from "../worldgen/types.js";

const log = createLogger("lore-cards");

function validCategory(raw: string): LoreCategory {
  if ((LORE_CATEGORIES as readonly string[]).includes(raw)) return raw as LoreCategory;
  return "concept";
}

export type { LoreCategory };

export interface LoreCard {
  id: string;
  term: string;
  definition: string;
  category: LoreCategory;
  vector: number[];
}

export interface LoreCardRow {
  id: string;
  term: string;
  definition: string;
  category: string;
  vector: number[];
}

const TABLE_NAME = "lore_cards";

export interface LoreCardUpdateInput {
  term: string;
  definition: string;
  category: LoreCategory;
}

function buildEmbeddingText(card: Pick<LoreCard, "term" | "definition">): string {
  return `${card.term}: ${card.definition}`;
}

function escapeTableString(value: string): string {
  return value.replaceAll("'", "''");
}

export async function insertLoreCards(
  cards: Omit<LoreCard, "vector">[],
  embeddings: number[][]
): Promise<void> {
  const db = getVectorDb();

  const rows: LoreCardRow[] = cards.map((card, i) => ({
    id: card.id,
    term: card.term,
    definition: card.definition,
    category: card.category,
    vector: embeddings[i] ?? [],
  }));

  const tableNames = await db.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    await db.dropTable(TABLE_NAME);
  }
  await db.createTable(TABLE_NAME, rows as unknown as Record<string, unknown>[]);
}

export async function insertLoreCardsWithoutVectors(
  cards: Omit<LoreCard, "vector">[]
): Promise<void> {
  const db = getVectorDb();

  const rows = cards.map((card) => ({
    id: card.id,
    term: card.term,
    definition: card.definition,
    category: card.category,
  }));

  const tableNames = await db.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    await db.dropTable(TABLE_NAME);
  }
  await db.createTable(TABLE_NAME, rows as unknown as Record<string, unknown>[]);
}

export async function searchLoreCards(
  queryVector: number[],
  limit = 5
): Promise<LoreCardRow[]> {
  const db = getVectorDb();

  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) {
    return [];
  }

  const table = await db.openTable(TABLE_NAME);
  const results = await table
    .vectorSearch(queryVector)
    .distanceType("cosine")
    .limit(limit)
    .toArray();

  return results.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    term: String(row.term),
    definition: String(row.definition),
    category: String(row.category),
    vector: row.vector as number[],
  }));
}

export async function getAllLoreCards(): Promise<Omit<LoreCard, "vector">[]> {
  const db = getVectorDb();

  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) {
    return [];
  }

  const table = await db.openTable(TABLE_NAME);
  const rows = await table.query().select(["id", "term", "definition", "category"]).toArray();

  return rows.map((row) => ({
    id: String(row.id),
    term: String(row.term),
    definition: String(row.definition),
    category: validCategory(String(row.category)),
  }));
}

export async function deleteCampaignLore(): Promise<void> {
  const db = getVectorDb();

  const tableNames = await db.tableNames();
  if (tableNames.includes(TABLE_NAME)) {
    await db.dropTable(TABLE_NAME);
  }
}

export async function updateLoreCard(
  cardId: string,
  updates: LoreCardUpdateInput,
  embedderResult: ResolveResult,
): Promise<Omit<LoreCard, "vector"> | null> {
  if (!("resolved" in embedderResult)) {
    throw new Error("Embedder not configured. Lore edits require fresh embeddings.");
  }

  const currentCards = await getAllLoreCards();
  const targetIndex = currentCards.findIndex((card) => card.id === cardId);
  if (targetIndex === -1) {
    return null;
  }

  const nextCards = currentCards.map((card, index) =>
    index === targetIndex
      ? {
          id: card.id,
          term: updates.term,
          definition: updates.definition,
          category: updates.category,
        }
      : card,
  );

  const embeddings = await embedTexts(
    nextCards.map((card) => buildEmbeddingText(card)),
    embedderResult.resolved.provider,
  );

  await insertLoreCards(nextCards, embeddings);
  return nextCards[targetIndex] ?? null;
}

export async function deleteLoreCardById(cardId: string): Promise<boolean> {
  const db = getVectorDb();
  const tableNames = await db.tableNames();
  if (!tableNames.includes(TABLE_NAME)) {
    return false;
  }

  const table = await db.openTable(TABLE_NAME);
  const existingRows = await table.query().select(["id"]).toArray();
  const exists = existingRows.some((row) => String(row.id) === cardId);
  if (!exists) {
    return false;
  }

  await table.delete(`id = '${escapeTableString(cardId)}'`);
  return true;
}

/**
 * Assign UUIDs to raw lore cards, embed them if possible, and store in LanceDB.
 * Falls back to storing without vectors if embedding fails or no embedder is configured.
 */
export async function storeLoreCards(
  rawCards: { term: string; definition: string; category: string }[],
  embedderResult: ResolveResult,
): Promise<void> {
  if (rawCards.length === 0) return;

  const cards = rawCards.map((lc) => ({
    id: crypto.randomUUID(),
    term: lc.term,
    definition: lc.definition,
    category: validCategory(lc.category),
  }));

  if ("resolved" in embedderResult) {
    try {
      const definitions = cards.map((c) => `${c.term}: ${c.definition}`);
      const embeddings = await embedTexts(definitions, embedderResult.resolved.provider);
      await insertLoreCards(cards, embeddings);
    } catch (embedError) {
      log.warn("Embedding failed, storing lore without vectors", embedError);
      await insertLoreCardsWithoutVectors(cards);
    }
  } else {
    await insertLoreCardsWithoutVectors(cards);
  }
}
