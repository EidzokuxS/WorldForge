import type {
  CampaignWorldbookSelection,
  IpResearchContext,
} from "@worldforge/shared";
import { AppError } from "../lib/index.js";
import {
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

export function composeWorldbookLibraryRecords(
  records: StoredWorldbookLibraryRecord[],
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

  return {
    ipContext: worldbookToIpContext(
      mergedEntries,
      buildFranchiseName(worldbookSelection),
    ),
    worldbookSelection,
    provenance: {
      sources: worldbookSelection,
      groups,
    },
  };
}

export function composeSelectedWorldbooks(
  selectedWorldbooks: CampaignWorldbookSelection[],
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

  return composeWorldbookLibraryRecords(records);
}
