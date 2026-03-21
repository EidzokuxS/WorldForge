import { getVectorDb } from "./connection.js";

export type LoreCategory =
    | "location"
    | "npc"
    | "faction"
    | "ability"
    | "rule"
    | "concept"
    | "item"
    | "event";

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

    return results.map((row: any) => ({
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
        category: String(row.category) as LoreCategory,
    }));
}

export async function deleteCampaignLore(): Promise<void> {
    const db = getVectorDb();

    const tableNames = await db.tableNames();
    if (tableNames.includes(TABLE_NAME)) {
        await db.dropTable(TABLE_NAME);
    }
}
