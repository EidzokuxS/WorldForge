import type {
  CampaignWorldbookSelection,
  IpResearchContext,
} from "@worldforge/shared";
import { z } from "zod";
import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel } from "../ai/index.js";
import { resolveRoleModel } from "../ai/resolve-role-model.js";
import { AppError, createLogger } from "../lib/index.js";
import { loadSettings } from "../settings/manager.js";
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

const log = createLogger("worldbook-composition");

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

// ───── LLM-based source detection & filtering ─────

const primarySourceSchema = z.object({
  primarySource: z.string().describe("The display name of the primary source worldbook that best matches the campaign premise"),
  reasoning: z.string().describe("Brief explanation of why this source is primary"),
});

const filterSchema = z.object({
  relevantIndices: z.array(z.number()).describe("The index numbers of supplementary entries to keep"),
  reasoning: z.string().describe("Brief explanation of selection criteria"),
});

async function detectPrimarySource(
  premise: string,
  sourceNames: string[],
): Promise<string | null> {
  log.info("detectPrimarySource INPUT", { premise, sourceNames });
  if (sourceNames.length < 2) {
    log.info("detectPrimarySource SKIP: fewer than 2 sources");
    return null;
  }
  try {
    const settings = loadSettings();
    const resolved = resolveRoleModel(settings.judge, settings.providers);
    log.info("detectPrimarySource using Judge", { provider: resolved.provider.id, model: resolved.provider.model });
    const model = createModel(resolved.provider);
    const { object } = await safeGenerateObject({
      model,
      schema: primarySourceSchema,
      temperature: 0,
      prompt: [
        `Campaign premise: "${premise}"`,
        "",
        "Available worldbook sources (one per line):",
        ...sourceNames.map((n) => `  - ${n}`),
        "",
        "Which source is the PRIMARY foundation for this campaign? The primary source is the one whose world, setting, and characters the premise is built upon.",
        "Copy the source name exactly as listed above into the primarySource field.",
      ].join("\n"),
    });
    log.info("detectPrimarySource LLM OUTPUT", object);
    const match = sourceNames.find(
      (name) => name.toLowerCase().trim() === object.primarySource.toLowerCase().trim(),
    );
    log.info("detectPrimarySource RESULT", { match: match ?? "NO MATCH", llmSaid: object.primarySource, availableNames: sourceNames });
    return match ?? null;
  } catch (error) {
    log.error("detectPrimarySource FAILED", error);
    return null;
  }
}

async function filterRelevantEntries(
  premise: string,
  primarySourceName: string,
  supplementaryRecords: StoredWorldbookLibraryRecord[],
): Promise<Map<string, Set<string>> | null> {
  log.info("filterRelevantEntries INPUT", {
    premise,
    primarySourceName,
    supplementarySources: supplementaryRecords.map((r) => ({ name: r.displayName, id: r.id, entryCount: r.entries.length })),
  });

  // Build a flat numbered list: "0: SCP Foundation (faction) — description..."
  // LLM returns indices, zero ambiguity.
  interface IndexedEntry { index: number; recordId: string; name: string }
  const indexedEntries: IndexedEntry[] = [];
  const numberedLines: string[] = [];

  for (const record of supplementaryRecords) {
    for (const entry of record.entries) {
      const idx = indexedEntries.length;
      indexedEntries.push({ index: idx, recordId: record.id, name: entry.name });
      numberedLines.push(`${idx}: ${entry.name} (${entry.type}) — ${entry.summary}`);
    }
  }

  if (indexedEntries.length === 0) {
    log.info("filterRelevantEntries SKIP: no entries in supplementary sources");
    return new Map();
  }

  log.info(`filterRelevantEntries sending ${indexedEntries.length} numbered entries to Judge`);

  try {
    const settings = loadSettings();
    const resolved = resolveRoleModel(settings.judge, settings.providers);
    const model = createModel(resolved.provider);
    const { object } = await safeGenerateObject({
      model,
      schema: filterSchema,
      temperature: 0,
      retries: 1,
      prompt: [
        `Campaign premise: "${premise}"`,
        `Primary worldbook (already fully included): "${primarySourceName}"`,
        "",
        "Supplementary worldbook entries (numbered):",
        ...numberedLines,
        "",
        "Pick entries that complement the primary world for this premise. Include entries the premise mentions or implies, and a handful that fit the themes.",
        "Return the index numbers of the entries you selected into the relevantIndices array.",
      ].join("\n"),
    });

    log.info("filterRelevantEntries LLM OUTPUT", {
      relevantIndices: object.relevantIndices,
      reasoning: object.reasoning,
      count: object.relevantIndices.length,
    });

    // Map indices back to record → entry names
    const validIndices = new Set(
      object.relevantIndices.filter((i) => i >= 0 && i < indexedEntries.length),
    );

    if (validIndices.size !== object.relevantIndices.length) {
      log.warn("filterRelevantEntries: some indices out of range", {
        returned: object.relevantIndices,
        valid: [...validIndices],
        max: indexedEntries.length - 1,
      });
    }

    const result = new Map<string, Set<string>>();
    for (const idx of validIndices) {
      const entry = indexedEntries[idx];
      const existing = result.get(entry.recordId) ?? new Set<string>();
      existing.add(entry.name.toLowerCase().trim());
      result.set(entry.recordId, existing);
    }

    // Log per-source results
    for (const record of supplementaryRecords) {
      const kept = result.get(record.id);
      const keptNames = kept ? [...kept] : [];
      const rejectedNames = record.entries
        .filter((e) => !kept?.has(e.name.toLowerCase().trim()))
        .map((e) => e.name);
      log.info(`filterRelevantEntries "${record.displayName}": kept ${keptNames.length}/${record.entries.length}`, {
        kept: keptNames,
        rejected: rejectedNames,
      });
    }

    return result;
  } catch (error) {
    log.error("filterRelevantEntries FAILED — returning null (caller will include all as fallback)", error);
    return null;
  }
}

// ───── Composition ─────

export async function composeWorldbookLibraryRecords(
  records: StoredWorldbookLibraryRecord[],
  premise?: string,
): Promise<ComposeWorldbookSelectionResult> {
  log.info("composeWorldbookLibraryRecords INPUT", {
    recordCount: records.length,
    records: records.map((r) => ({ id: r.id, displayName: r.displayName, entryCount: r.entries.length })),
    premise: premise ?? "NOT PROVIDED",
  });

  const uniqueRecords = Array.from(
    new Map(records.map((record) => [record.id, record] as const)).values(),
  );
  const sortedRecords = sortRecords(uniqueRecords);
  const worldbookSelection = sortSelection(sortedRecords.map(toSelection));

  // Detect primary source and filter supplementary entries when premise is provided
  let relevanceMap: Map<string, Set<string>> | null = null;
  let primarySourceName: string | null = null;

  if (premise && sortedRecords.length >= 2) {
    const sourceNames = sortedRecords.map((r) => r.displayName);
    log.info("composeWorldbookLibraryRecords: premise provided + 2+ sources — running primary detection", { sourceNames });
    primarySourceName = await detectPrimarySource(premise, sourceNames);

    if (primarySourceName) {
      const supplementaryRecords = sortedRecords.filter(
        (r) => r.displayName !== primarySourceName,
      );
      relevanceMap = await filterRelevantEntries(
        premise,
        primarySourceName,
        supplementaryRecords,
      );
      log.info("filterRelevantEntries returned", {
        isNull: relevanceMap === null,
        mapSize: relevanceMap?.size ?? "N/A",
      });
    }
  }

  // Helper: returns filtered entries for supplementary records, all entries for primary/unfiltered
  function getFilteredEntries(record: StoredWorldbookLibraryRecord) {
    // No primary detected or this IS the primary — include all entries
    if (!primarySourceName || record.displayName === primarySourceName) {
      return record.entries;
    }
    // LLM filter failed entirely (null) — fallback: include all supplementary entries
    if (relevanceMap === null) {
      log.warn(`getFilteredEntries "${record.displayName}": filter was null (LLM failure), including all ${record.entries.length} entries`);
      return record.entries;
    }
    // LLM filter succeeded — apply it (may return 0 entries if LLM deemed none relevant)
    const allowedNames = relevanceMap.get(record.id);
    if (!allowedNames || allowedNames.size === 0) {
      log.info(`getFilteredEntries "${record.displayName}": LLM kept 0 entries — supplementary source excluded`);
      return [];
    }
    return record.entries.filter((e) =>
      allowedNames.has(e.name.toLowerCase().trim()),
    );
  }

  const grouped = new Map<
    string,
    {
      type: StoredWorldbookLibraryRecord["entries"][number]["type"];
      contributions: WorldbookCompositionContribution[];
    }
  >();

  for (const record of sortedRecords) {
    const filteredEntries = getFilteredEntries(record);
    log.info(`getFilteredEntries "${record.displayName}": ${filteredEntries.length}/${record.entries.length} entries passed filter`);
    const sortedEntries = sortClassifiedEntriesForWorldContext(filteredEntries);
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

  // Build per-source groups with priority labels so prompt rendering
  // can distinguish PRIMARY vs SUPPLEMENTARY worldbook sources.
  if (primarySourceName && sortedRecords.length >= 2) {
    const perSourceEntries = new Map<string, Array<{ name: string; type: StoredWorldbookLibraryRecord["entries"][number]["type"]; summary: string }>>();
    for (const group of groups) {
      for (const contribution of group.contributions) {
        const list = perSourceEntries.get(contribution.sourceDisplayName) ?? [];
        list.push({
          name: contribution.entryName,
          type: group.type,
          summary: contribution.summary,
        });
        perSourceEntries.set(contribution.sourceDisplayName, list);
      }
    }

    ipContext.sourceGroups = [];
    for (const record of sortedRecords) {
      const entries = perSourceEntries.get(record.displayName);
      if (!entries || entries.length === 0) continue;
      const sourceData = extractSourceData(entries);
      ipContext.sourceGroups.push({
        sourceName: record.displayName,
        priority: record.displayName === primarySourceName ? "primary" : "supplementary",
        keyFacts: sourceData.keyFacts,
        canonicalNames: sourceData.canonicalNames,
      });
    }

    log.info(
      `Built ${ipContext.sourceGroups.length} source groups: ${ipContext.sourceGroups.map((g) => `${g.sourceName} (${g.priority}, ${g.keyFacts.length} facts)`).join(", ")}`,
    );
  }

  log.info("composeWorldbookLibraryRecords OUTPUT", {
    franchise: ipContext.franchise,
    totalKeyFacts: ipContext.keyFacts.length,
    hasSourceGroups: !!ipContext.sourceGroups,
    sourceGroupCount: ipContext.sourceGroups?.length ?? 0,
    sourceGroupSummary: ipContext.sourceGroups?.map((g) => ({
      name: g.sourceName,
      priority: g.priority,
      keyFactCount: g.keyFacts.length,
      locations: g.canonicalNames?.locations?.length ?? 0,
      factions: g.canonicalNames?.factions?.length ?? 0,
      characters: g.canonicalNames?.characters?.length ?? 0,
    })),
    canonicalNames: {
      locations: ipContext.canonicalNames?.locations?.length ?? 0,
      factions: ipContext.canonicalNames?.factions?.length ?? 0,
      characters: ipContext.canonicalNames?.characters?.length ?? 0,
    },
  });

  return {
    ipContext,
    worldbookSelection,
    provenance: {
      sources: worldbookSelection,
      groups,
    },
  };
}

export async function composeSelectedWorldbooks(
  selectedWorldbooks: CampaignWorldbookSelection[],
  premise?: string,
): Promise<ComposeWorldbookSelectionResult> {
  log.info("composeSelectedWorldbooks CALLED", {
    worldbookCount: selectedWorldbooks.length,
    worldbooks: selectedWorldbooks.map((w) => ({ id: w.id, name: w.displayName })),
    premiseProvided: !!premise,
    premise: premise ? premise.slice(0, 200) : "NOT PROVIDED",
  });

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
