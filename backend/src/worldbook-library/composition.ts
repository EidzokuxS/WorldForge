import type {
  CampaignWorldbookSelection,
  IpResearchContext,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";
import {
  extractSourceData,
  getClassifiedEntryEntityKey,
  sortClassifiedEntriesForWorldContext,
  worldbookToIpContext,
} from "../worldgen/worldbook-importer.js";
import {
  loadWorldbookLibraryRecord,
  type StoredWorldbookLibraryRecord,
} from "./manager.js";

export interface WorldbookCompositionContribution {
  sourceId: string;
  sourceDisplayName: string;
  entryName: string;
  summary: string;
}

export interface WorldbookCompositionGroup {
  entityKey: string;
  type: StoredWorldbookLibraryRecord["entries"][number]["type"];
  name: string;
  summary: string;
  contributions: WorldbookCompositionContribution[];
}

export interface ComposeWorldbookSelectionResult {
  ipContext: IpResearchContext;
  worldbookSelection: CampaignWorldbookSelection[];
  provenance: {
    sources: CampaignWorldbookSelection[];
    groups: WorldbookCompositionGroup[];
  };
}

function compareStrings(left: string, right: string): number {
  return left.localeCompare(right, "en", { sensitivity: "base" });
}

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toSelection(record: StoredWorldbookLibraryRecord): CampaignWorldbookSelection {
  return {
    id: record.id,
    displayName: record.displayName,
    normalizedSourceHash: record.normalizedSourceHash,
    entryCount: record.entryCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function sortSelection(
  items: CampaignWorldbookSelection[],
): CampaignWorldbookSelection[] {
  return [...items].sort((left, right) => {
    const nameCompare = compareStrings(left.displayName, right.displayName);
    if (nameCompare !== 0) {
      return nameCompare;
    }
    return compareStrings(left.id, right.id);
  });
}

function sortRecords(
  records: StoredWorldbookLibraryRecord[],
): StoredWorldbookLibraryRecord[] {
  return [...records].sort((left, right) => {
    const selectionCompare = compareStrings(left.displayName, right.displayName);
    if (selectionCompare !== 0) {
      return selectionCompare;
    }
    return compareStrings(left.id, right.id);
  });
}

function buildFranchiseName(selection: CampaignWorldbookSelection[]): string {
  if (selection.length === 0) {
    return "Worldbook";
  }
  if (selection.length === 1) {
    return selection[0].displayName;
  }
  return selection.map((item) => item.displayName).join(" + ");
}

/** Max entries for supplementary sources to prevent context flooding. */
const SUPPLEMENTARY_ENTRY_CAP = 15;

/**
 * Detect primary source from premise text. Returns the displayName of the
 * primary source, or null if no clear signal is found.
 *
 * Looks for patterns like "mainly X", "primarily X", "based on X",
 * "in the world of X" (case-insensitive).
 */
function detectPrimarySource(
  premise: string,
  sourceNames: string[],
): string | null {
  const premiseLower = premise.toLowerCase();

  // Patterns that signal primary source intent
  const patterns = [
    /\b(?:mainly|primarily|mostly|chiefly|predominantly)\s+(?:based\s+on\s+)?(.+?)(?:\s+with|\s+and|\s*,|\s*\.|\s*$)/i,
    /\b(?:based\s+on|in\s+the\s+world\s+of|set\s+in|from)\s+(.+?)(?:\s+with|\s+and|\s*,|\s*\.|\s*$)/i,
  ];

  for (const pattern of patterns) {
    const match = premiseLower.match(pattern);
    if (!match?.[1]) continue;
    const captured = match[1].trim();

    // Check if any source name matches (substring match, case-insensitive)
    for (const name of sourceNames) {
      const nameLower = name.toLowerCase();
      if (captured.includes(nameLower) || nameLower.includes(captured)) {
        return name;
      }
    }
  }

  // Check if any source name appears right after a priority keyword
  for (const name of sourceNames) {
    const nameLower = name.toLowerCase();
    const keywordPattern = new RegExp(
      `\\b(?:mainly|primarily|mostly|chiefly|predominantly)\\s+${nameLower.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      "i",
    );
    if (keywordPattern.test(premiseLower)) {
      return name;
    }
  }

  return null;
}

/**
 * Score entries by word overlap with premise text. Higher score = more relevant.
 */
function scorePremiseRelevance(
  fact: string,
  premiseWords: Set<string>,
): number {
  const factWords = fact.toLowerCase().split(/\s+/);
  let score = 0;
  for (const word of factWords) {
    if (premiseWords.has(word) && word.length > 3) {
      score += 1;
    }
  }
  return score;
}

/**
 * Cap entries to a limit, preferring those with higher premise relevance.
 */
function capEntries(
  keyFacts: string[],
  limit: number,
  premise?: string,
): string[] {
  if (keyFacts.length <= limit) return keyFacts;

  if (!premise) return keyFacts.slice(0, limit);

  const premiseWords = new Set(
    premise.toLowerCase().split(/\s+/).filter((w) => w.length > 3),
  );

  const scored = keyFacts.map((fact, index) => ({
    fact,
    score: scorePremiseRelevance(fact, premiseWords),
    index,
  }));

  // Sort by score descending, then by original index for stability
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  return scored.slice(0, limit).sort((a, b) => a.index - b.index).map((s) => s.fact);
}

export function composeWorldbookLibraryRecords(
  records: StoredWorldbookLibraryRecord[],
  premise?: string,
): ComposeWorldbookSelectionResult {
  const uniqueRecords = Array.from(
    new Map(records.map((record) => [record.id, record] as const)).values(),
  );
  const sortedRecords = sortRecords(uniqueRecords);
  const worldbookSelection = sortSelection(sortedRecords.map(toSelection));

  const grouped = new Map<
    string,
    {
      type: StoredWorldbookLibraryRecord["entries"][number]["type"];
      contributions: WorldbookCompositionContribution[];
    }
  >();

  for (const record of sortedRecords) {
    const sortedEntries = sortClassifiedEntriesForWorldContext(record.entries);
    for (const entry of sortedEntries) {
      const entityKey = getClassifiedEntryEntityKey(entry);
      const group = grouped.get(entityKey) ?? {
        type: entry.type,
        contributions: [],
      };
      group.contributions.push({
        sourceId: record.id,
        sourceDisplayName: record.displayName,
        entryName: normalizeWhitespace(entry.name),
        summary: normalizeWhitespace(entry.summary),
      });
      grouped.set(entityKey, group);
    }
  }

  const groups = Array.from(grouped.entries())
    .map(([entityKey, group]): WorldbookCompositionGroup => {
      const contributions = [...group.contributions].sort((left, right) => {
        const sourceNameCompare = compareStrings(
          left.sourceDisplayName,
          right.sourceDisplayName,
        );
        if (sourceNameCompare !== 0) {
          return sourceNameCompare;
        }
        const sourceIdCompare = compareStrings(left.sourceId, right.sourceId);
        if (sourceIdCompare !== 0) {
          return sourceIdCompare;
        }
        const entryNameCompare = compareStrings(left.entryName, right.entryName);
        if (entryNameCompare !== 0) {
          return entryNameCompare;
        }
        return compareStrings(left.summary, right.summary);
      });
      const representative = contributions[0];
      return {
        entityKey,
        type: group.type,
        name: representative.entryName,
        summary: representative.summary,
        contributions,
      };
    })
    .sort((left, right) => compareStrings(left.entityKey, right.entityKey));

  const mergedEntries = groups.map((group) => ({
    name: group.name,
    type: group.type,
    summary: group.summary,
  }));

  const ipContext = worldbookToIpContext(
    mergedEntries,
    buildFranchiseName(worldbookSelection),
  );

  // Build per-source entry lists for source-grouped prompt rendering
  const sourceNames = sortedRecords.map((r) => r.displayName);
  const primarySourceName = premise && sortedRecords.length > 1
    ? detectPrimarySource(premise, sourceNames)
    : null;

  const sourceGroups: NonNullable<typeof ipContext.sourceGroups> = sortedRecords.map(
    (record) => {
      const sourceEntries = record.entries.map((e) => ({
        name: e.name,
        type: e.type,
        summary: e.summary,
      }));
      const sourceData = extractSourceData(sourceEntries);
      const isPrimary =
        primarySourceName === null || record.displayName === primarySourceName;
      const priority = isPrimary ? ("primary" as const) : ("supplementary" as const);

      return {
        sourceName: record.displayName,
        priority,
        keyFacts: priority === "supplementary"
          ? capEntries(sourceData.keyFacts, SUPPLEMENTARY_ENTRY_CAP, premise)
          : sourceData.keyFacts,
        canonicalNames: sourceData.canonicalNames,
      };
    },
  );

  ipContext.sourceGroups = sourceGroups;

  return {
    ipContext,
    worldbookSelection,
    provenance: {
      sources: worldbookSelection,
      groups,
    },
  };
}

export function composeSelectedWorldbooks(
  selectedWorldbooks: CampaignWorldbookSelection[],
  premise?: string,
): ComposeWorldbookSelectionResult {
  if (selectedWorldbooks.length === 0) {
    throw new AppError("At least one selected worldbook is required.", 400);
  }

  const records = sortSelection(selectedWorldbooks).map((selection) => {
    const record = loadWorldbookLibraryRecord(selection.id);
    if (!record) {
      throw new AppError(
        `Reusable worldbook "${selection.id}" could not be found.`,
        404,
      );
    }
    return record;
  });

  return composeWorldbookLibraryRecords(records, premise);
}
