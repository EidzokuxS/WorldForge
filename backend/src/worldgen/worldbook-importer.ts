import crypto from "node:crypto";
import type { IpResearchContext } from "@worldforge/shared";
import { z } from "zod";
import { safeGenerateObject as generateObject } from "../ai/generate-object-safe.js";
import { createModel } from "../ai/index.js";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import type { ResolveResult } from "../ai/index.js";
import { getDb } from "../db/index.js";
import { npcs, locations, factions } from "../db/schema.js";
import { storeLoreCards } from "../vectors/lore-cards.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("worldbook-importer");

// ───── Types ─────

export interface WorldBookEntry {
  name: string;
  text: string;
}

export const WORLDBOOK_ENTRY_TYPES = [
  "character",
  "location",
  "faction",
  "bestiary",
  "lore_general",
] as const;

export type WorldBookEntryType = (typeof WORLDBOOK_ENTRY_TYPES)[number];

export interface ClassifiedEntry {
  name: string;
  type: WorldBookEntryType;
  summary: string;
}

export interface ImportResult {
  imported: {
    characters: number;
    locations: number;
    factions: number;
    loreCards: number;
  };
}

// ───── Zod schema for WorldBook JSON validation ─────

const worldBookEntrySchema = z
  .object({
    comment: z.string(),
    content: z.string(),
  })
  .passthrough();

export const worldBookJsonSchema = z
  .object({
    entries: z.record(z.string(), worldBookEntrySchema),
  })
  .passthrough();

// ───── 1. Parse WorldBook ─────

export function parseWorldBook(json: unknown): WorldBookEntry[] {
  const parsed = worldBookJsonSchema.parse(json);

  const seen = new Set<string>();
  const entries: WorldBookEntry[] = [];

  for (const key of Object.keys(parsed.entries)) {
    const entry = parsed.entries[key];
    if (!entry) continue;

    const name = (entry.comment || "").trim();
    if (!name) continue;

    const nameLower = name.toLowerCase();
    if (seen.has(nameLower)) continue;
    seen.add(nameLower);

    // Strip HTML tags from content
    const text = entry.content.replace(/<[^>]+>/g, "").trim();
    if (!text) continue;

    entries.push({ name, text });
  }

  log.info(`Parsed ${entries.length} unique entries from WorldBook`);
  return entries;
}

// ───── 2. Classify Entries ─────

const classificationSchema = z.object({
  entries: z.array(
    z.object({
      name: z.string(),
      type: z.enum(WORLDBOOK_ENTRY_TYPES),
      summary: z.string(),
    }),
  ),
});

const CLASSIFY_BATCH_SIZE = 20;

export async function classifyEntries(
  entries: WorldBookEntry[],
  role: ResolvedRole,
): Promise<ClassifiedEntry[]> {
  if (entries.length === 0) return [];

  const allClassified: ClassifiedEntry[] = [];
  const batches = Math.ceil(entries.length / CLASSIFY_BATCH_SIZE);

  for (let i = 0; i < entries.length; i += CLASSIFY_BATCH_SIZE) {
    const batch = entries.slice(i, i + CLASSIFY_BATCH_SIZE);
    const batchNum = Math.floor(i / CLASSIFY_BATCH_SIZE) + 1;
    log.info(`Classifying batch ${batchNum}/${batches} (${batch.length} entries)...`);

    const entriesList = batch
      .map((e, j) => `${j + 1}. "${e.name}": ${e.text.slice(0, 500)}`)
      .join("\n\n");

    const result = await generateObject({
      model: createModel(role.provider),
      schema: classificationSchema,
      prompt: `You are a content classifier for an RPG world-building system. Classify each WorldBook entry by its type.

ENTRY TYPES:
- character: describes a person, creature with personality, an NPC (individual with unique identity)
- location: describes a place, area, region, building, or geographical feature
- faction: describes an organization, group, guild, army, government, or political entity
- bestiary: describes a creature type, monster species, animal kind (no individual personality — generic species)
- lore_general: world rules, history, magic systems, concepts, items, events, cultural traditions

ENTRIES TO CLASSIFY:
${entriesList}

For each entry, provide:
- name: the exact entry name as given
- type: one of the five types above
- summary: a 1-2 sentence factual summary of the entry content`,
      temperature: role.temperature,
      maxOutputTokens: role.maxTokens,
    });

    allClassified.push(...result.object.entries);
  }

  log.info(`Classified ${allClassified.length} entries total (${batches} batches)`);
  return allClassified;
}

// ───── 3. Import Classified Entries ─────

export async function importClassifiedEntries(
  campaignId: string,
  entries: ClassifiedEntry[],
  embedderResult: ResolveResult,
): Promise<ImportResult> {
  const db = getDb();

  const characters = entries.filter((e) => e.type === "character");
  const locs = entries.filter((e) => e.type === "location");
  const facs = entries.filter((e) => e.type === "faction");
  const loreEntries = entries.filter(
    (e) => e.type === "bestiary" || e.type === "lore_general",
  );

  // Insert structured entities in a transaction
  db.transaction((tx) => {
    for (const entry of characters) {
      tx.insert(npcs)
        .values({
          id: crypto.randomUUID(),
          campaignId,
          name: entry.name,
          persona: entry.summary,
          tags: "[]",
          tier: "key",
          currentLocationId: null,
          goals: JSON.stringify({ short_term: [], long_term: [] }),
          beliefs: "{}",
          createdAt: Date.now(),
        })
        .run();
    }

    for (const entry of locs) {
      tx.insert(locations)
        .values({
          id: crypto.randomUUID(),
          campaignId,
          name: entry.name,
          description: entry.summary,
          tags: "[]",
          isStarting: false,
          connectedTo: "[]",
        })
        .run();
    }

    for (const entry of facs) {
      tx.insert(factions)
        .values({
          id: crypto.randomUUID(),
          campaignId,
          name: entry.name,
          tags: "[]",
          goals: JSON.stringify([entry.summary]),
          assets: "[]",
        })
        .run();
    }
  });

  // Store bestiary + lore_general as lore cards in LanceDB
  let loreCardCount = 0;
  if (loreEntries.length > 0) {
    const rawCards = loreEntries.map((e) => ({
      term: e.name,
      definition: e.summary,
      category: e.type === "bestiary" ? "npc" : "concept",
    }));
    await storeLoreCards(rawCards, embedderResult);
    loreCardCount = rawCards.length;
  }

  const result: ImportResult = {
    imported: {
      characters: characters.length,
      locations: locs.length,
      factions: facs.length,
      loreCards: loreCardCount,
    },
  };

  log.info("WorldBook import complete", result.imported);
  return result;
}

// ───── 4. WorldBook → IpResearchContext ─────

/**
 * Convert classified worldbook entries into an IpResearchContext.
 * This lets the scaffold generation pipeline use worldbook as its
 * knowledge base — same as franchise research, but from a file.
 */
export function worldbookToIpContext(
  entries: ClassifiedEntry[],
  worldbookName: string,
): IpResearchContext {
  const characters = entries.filter((e) => e.type === "character");
  const locs = entries.filter((e) => e.type === "location");
  const facs = entries.filter((e) => e.type === "faction");
  const loreEntries = entries.filter(
    (e) => e.type === "bestiary" || e.type === "lore_general",
  );

  // Build key facts from ALL entries — each becomes a fact
  const keyFacts = entries.map((e) => `${e.name}: ${e.summary}`);

  // Tonal notes from lore_general entries (world rules, atmosphere)
  const tonalNotes = loreEntries
    .filter((e) => e.type === "lore_general")
    .slice(0, 10)
    .map((e) => e.summary);

  return {
    franchise: worldbookName,
    keyFacts,
    tonalNotes: tonalNotes.length > 0 ? tonalNotes : ["Custom worldbook setting"],
    canonicalNames: {
      locations: locs.map((e) => e.name),
      factions: facs.map((e) => e.name),
      characters: characters.map((e) => e.name),
    },
    source: "llm" as const,
  };
}
