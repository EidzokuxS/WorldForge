import crypto from "node:crypto";
import fs from "node:fs";
import type { WorldbookLibraryItemSummary } from "@worldforge/shared";
import type {
  ClassifiedEntry,
  WorldBookEntry,
} from "../worldgen/worldbook-importer.js";
import {
  getWorldbookLibraryDir,
  getWorldbookLibraryIndexPath,
  getWorldbookLibraryRecordPath,
  getWorldbookLibraryRecordsDir,
} from "./paths.js";

export const WORLDBOOK_LIBRARY_CLASSIFICATION_VERSION = 1;

type WorldbookLibraryIndexFile = {
  items: WorldbookLibraryItemSummary[];
};

export interface StoredWorldbookLibraryRecord extends WorldbookLibraryItemSummary {
  originalFileName?: string;
  classificationVersion: number;
  entries: ClassifiedEntry[];
}

export interface ImportWorldbookToLibraryOptions {
  displayName?: string;
  originalFileName?: string;
  parsedEntries: WorldBookEntry[];
  classify: () => Promise<ClassifiedEntry[]>;
}

export interface ImportWorldbookToLibraryResult {
  item: WorldbookLibraryItemSummary;
  existed: boolean;
}

function ensureLibraryDirs(): void {
  fs.mkdirSync(getWorldbookLibraryDir(), { recursive: true });
  fs.mkdirSync(getWorldbookLibraryRecordsDir(), { recursive: true });
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeEntry(entry: WorldBookEntry) {
  return {
    name: normalizeWhitespace(entry.name).toLocaleLowerCase("en-US"),
    text: normalizeWhitespace(entry.text).toLocaleLowerCase("en-US"),
  };
}

function buildNormalizedSourceHash(parsedEntries: WorldBookEntry[]): string {
  const normalizedEntries = parsedEntries
    .map(normalizeEntry)
    .sort((left, right) => {
      const nameCompare = left.name.localeCompare(right.name, "en", {
        sensitivity: "base",
      });
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return left.text.localeCompare(right.text, "en", { sensitivity: "base" });
    });

  return crypto
    .createHash("sha256")
    .update(JSON.stringify(normalizedEntries))
    .digest("hex");
}

function sortItems(items: WorldbookLibraryItemSummary[]): WorldbookLibraryItemSummary[] {
  return [...items].sort((left, right) => {
    const nameCompare = left.displayName.localeCompare(right.displayName, "en", {
      sensitivity: "base",
    });
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return left.id.localeCompare(right.id, "en", { sensitivity: "base" });
  });
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function writeJson(filePath: string, value: unknown): void {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf-8");
}

function readIndex(): WorldbookLibraryIndexFile {
  const indexPath = getWorldbookLibraryIndexPath();
  if (!fs.existsSync(indexPath)) {
    return { items: [] };
  }

  const parsed = readJson<Partial<WorldbookLibraryIndexFile>>(indexPath);
  return {
    items: Array.isArray(parsed.items) ? sortItems(parsed.items) : [],
  };
}

function writeIndex(index: WorldbookLibraryIndexFile): void {
  writeJson(getWorldbookLibraryIndexPath(), {
    items: sortItems(index.items),
  });
}

function toItemSummary(
  record: StoredWorldbookLibraryRecord,
): WorldbookLibraryItemSummary {
  return {
    id: record.id,
    displayName: record.displayName,
    normalizedSourceHash: record.normalizedSourceHash,
    entryCount: record.entryCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export function listWorldbookLibrary(): WorldbookLibraryItemSummary[] {
  ensureLibraryDirs();
  return readIndex().items;
}

export function loadWorldbookLibraryRecord(
  id: string,
): StoredWorldbookLibraryRecord | null {
  const recordPath = getWorldbookLibraryRecordPath(id);
  if (!fs.existsSync(recordPath)) {
    return null;
  }

  return readJson<StoredWorldbookLibraryRecord>(recordPath);
}

export async function importWorldbookToLibrary(
  options: ImportWorldbookToLibraryOptions,
): Promise<ImportWorldbookToLibraryResult> {
  ensureLibraryDirs();

  const normalizedSourceHash = buildNormalizedSourceHash(options.parsedEntries);
  const existingRecord = loadWorldbookLibraryRecord(normalizedSourceHash);
  if (existingRecord) {
    const index = readIndex();
    const existingItem = index.items.find((item) => item.id === existingRecord.id);
    if (!existingItem) {
      writeIndex({
        items: [...index.items, toItemSummary(existingRecord)],
      });
    }

    return {
      item: toItemSummary(existingRecord),
      existed: true,
    };
  }

  const classifiedEntries = await options.classify();
  const now = Date.now();
  const displayName = normalizeWhitespace(
    options.displayName || options.originalFileName || "Worldbook",
  );

  const record: StoredWorldbookLibraryRecord = {
    id: normalizedSourceHash,
    displayName,
    originalFileName: options.originalFileName,
    normalizedSourceHash,
    entryCount: classifiedEntries.length,
    classificationVersion: WORLDBOOK_LIBRARY_CLASSIFICATION_VERSION,
    createdAt: now,
    updatedAt: now,
    entries: classifiedEntries,
  };

  writeJson(getWorldbookLibraryRecordPath(record.id), record);
  const index = readIndex();
  writeIndex({
    items: [...index.items, toItemSummary(record)],
  });

  return {
    item: toItemSummary(record),
    existed: false,
  };
}
