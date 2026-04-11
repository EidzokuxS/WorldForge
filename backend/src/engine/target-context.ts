import { eq } from "drizzle-orm";
import { z } from "zod";
import { safeGenerateObject } from "../ai/generate-object-safe.js";
import { createModel, type ProviderConfig } from "../ai/provider-registry.js";
import { hydrateStoredNpcRecord, hydrateStoredPlayerRecord } from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { getDb } from "../db/index.js";
import { factions, items, locations, npcs, players } from "../db/schema.js";
import { createLogger } from "../lib/index.js";
import { parseTags } from "./parse-helpers.js";

const log = createLogger("target-context");

export type SupportedActionTargetType =
  | "character"
  | "item"
  | "location/object"
  | "faction";

export interface ActionTargetCandidate {
  name: string;
  type: SupportedActionTargetType;
  source: "parsed" | "movement" | "classifier";
}

export interface ActionTargetContext {
  targetLabel: string | null;
  targetType: SupportedActionTargetType | "none";
  targetTags: string[];
  source: ActionTargetCandidate["source"] | "fallback";
  fallbackReason: string | null;
}

interface ResolveActionTargetContextOptions {
  campaignId: string;
  playerAction: string;
  intent: string;
  method: string;
  judgeProvider: ProviderConfig;
  movementDestination?: string | null;
}

interface EntityNameCandidate {
  name: string;
  type: SupportedActionTargetType;
}

const targetCandidateSchema = z.object({
  targetName: z.string().nullable(),
  targetType: z
    .enum(["character", "item", "location/object", "faction"])
    .nullable(),
});

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function readRows<T>(query: { all?: () => T[]; get?: () => T | null | undefined }): T[] {
  if (typeof query.all === "function") {
    return query.all();
  }
  if (typeof query.get === "function") {
    const row = query.get();
    return row ? [row] : [];
  }
  return [];
}

function collectEntityNameCandidates(campaignId: string): EntityNameCandidate[] {
  const db = getDb();
  const rows: EntityNameCandidate[] = [];

  const playerRows = readRows(
    db
    .select({ name: players.name })
    .from(players)
    .where(eq(players.campaignId, campaignId)),
  );
  rows.push(...playerRows.map((row) => ({ name: row.name, type: "character" as const })));

  const npcRows = readRows(
    db
    .select({ name: npcs.name })
    .from(npcs)
    .where(eq(npcs.campaignId, campaignId)),
  );
  rows.push(...npcRows.map((row) => ({ name: row.name, type: "character" as const })));

  const itemRows = readRows(
    db
    .select({ name: items.name })
    .from(items)
    .where(eq(items.campaignId, campaignId)),
  );
  rows.push(...itemRows.map((row) => ({ name: row.name, type: "item" as const })));

  const locationRows = readRows(
    db
    .select({ name: locations.name })
    .from(locations)
    .where(eq(locations.campaignId, campaignId)),
  );
  rows.push(
    ...locationRows.map((row) => ({
      name: row.name,
      type: "location/object" as const,
    })),
  );

  const factionRows = readRows(
    db
    .select({ name: factions.name })
    .from(factions)
    .where(eq(factions.campaignId, campaignId)),
  );
  rows.push(...factionRows.map((row) => ({ name: row.name, type: "faction" as const })));

  return rows;
}

function detectCandidateFromParsedTexts(
  candidates: EntityNameCandidate[],
  intent: string,
  method: string,
): ActionTargetCandidate | null {
  const texts = [intent, method]
    .map((value) => normalizeText(value))
    .filter(Boolean);
  if (texts.length === 0) {
    return null;
  }

  const match = [...candidates]
    .sort((left, right) => right.name.length - left.name.length)
    .find((candidate) => {
      const normalizedName = normalizeText(candidate.name);
      return texts.some((text) => text.includes(normalizedName));
    });

  if (!match) {
    return null;
  }

  return {
    name: match.name,
    type: match.type,
    source: "parsed",
  };
}

async function detectCandidateByClassifier(
  candidates: EntityNameCandidate[],
  options: ResolveActionTargetContextOptions,
): Promise<ActionTargetCandidate | null> {
  if (candidates.length === 0) {
    return null;
  }

  try {
    const grouped = {
      character: candidates.filter((candidate) => candidate.type === "character").map((candidate) => candidate.name),
      item: candidates.filter((candidate) => candidate.type === "item").map((candidate) => candidate.name),
      "location/object": candidates
        .filter((candidate) => candidate.type === "location/object")
        .map((candidate) => candidate.name),
      faction: candidates.filter((candidate) => candidate.type === "faction").map((candidate) => candidate.name),
    };

    const { object } = await safeGenerateObject({
      model: createModel(options.judgeProvider),
      schema: targetCandidateSchema,
      temperature: 0,
      prompt: [
        "Choose the single concrete target this action is directed at, if any.",
        "Only choose one of the listed names. If no supported concrete target is present, return nulls.",
        `Player action: ${options.playerAction}`,
        `Intent: ${options.intent}`,
        `Method: ${options.method}`,
        "Available character targets:",
        grouped.character.join(", ") || "(none)",
        "Available item targets:",
        grouped.item.join(", ") || "(none)",
        "Available location/object targets:",
        grouped["location/object"].join(", ") || "(none)",
        "Available faction targets:",
        grouped.faction.join(", ") || "(none)",
      ].join("\n"),
    });

    if (!object.targetName || !object.targetType) {
      return null;
    }

    const match = candidates.find(
      (candidate) =>
        candidate.type === object.targetType &&
        normalizeText(candidate.name) === normalizeText(object.targetName),
    );

    if (!match) {
      return null;
    }

    return {
      name: match.name,
      type: match.type,
      source: "classifier",
    };
  } catch (error) {
    log.warn("Target candidate classification failed, falling back to non-targeted oracle", error);
    return null;
  }
}

export async function detectActionTargetCandidate(
  options: ResolveActionTargetContextOptions,
): Promise<ActionTargetCandidate | null> {
  const candidates = collectEntityNameCandidates(options.campaignId);
  const parsedMatch = detectCandidateFromParsedTexts(candidates, options.intent, options.method);
  if (parsedMatch) {
    return parsedMatch;
  }

  if (options.movementDestination) {
    const movementMatch = candidates.find(
      (candidate) =>
        candidate.type === "location/object" &&
        normalizeText(candidate.name) === normalizeText(options.movementDestination ?? ""),
    );
    if (movementMatch) {
      return {
        name: movementMatch.name,
        type: movementMatch.type,
        source: "movement",
      };
    }
  }

  return detectCandidateByClassifier(candidates, options);
}

export function deriveTargetTags(
  targetType: SupportedActionTargetType,
  row: Record<string, unknown>,
): string[] {
  switch (targetType) {
    case "character":
      if (row.characterRole === "player") {
        return deriveRuntimeCharacterTags(
          hydrateStoredPlayerRecord(row as Parameters<typeof hydrateStoredPlayerRecord>[0]),
        );
      }
      return deriveRuntimeCharacterTags(
        hydrateStoredNpcRecord(row as Parameters<typeof hydrateStoredNpcRecord>[0]),
      );
    case "item":
    case "location/object":
    case "faction":
      return parseTags(String(row.tags ?? "[]"));
    default:
      return [];
  }
}

function resolveCharacterTarget(
  campaignId: string,
  name: string,
): ActionTargetContext {
  const db = getDb();
  const normalizedName = normalizeText(name);

  const playerRows = readRows(
    db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId)),
  );
  const player = playerRows.find((row) => normalizeText(row.name) === normalizedName);
  if (player) {
    return {
      targetLabel: player.name,
      targetType: "character",
      targetTags: deriveTargetTags("character", { ...player, characterRole: "player" }),
      source: "parsed",
      fallbackReason: null,
    };
  }

  const npcRows = readRows(
    db
    .select()
    .from(npcs)
    .where(eq(npcs.campaignId, campaignId)),
  );
  const npc = npcRows.find((row) => normalizeText(row.name) === normalizedName);
  if (npc) {
    return {
      targetLabel: npc.name,
      targetType: "character",
      targetTags: deriveTargetTags("character", { ...npc, characterRole: "npc" }),
      source: "parsed",
      fallbackReason: null,
    };
  }

  return {
    targetLabel: null,
    targetType: "none",
    targetTags: [],
    source: "fallback",
    fallbackReason: `Unresolved character target: ${name}`,
  };
}

function resolveStoredTagTarget(
  campaignId: string,
  name: string,
  targetType: Exclude<SupportedActionTargetType, "character">,
): ActionTargetContext {
  const db = getDb();
  const normalizedName = normalizeText(name);

  if (targetType === "item") {
    const rows = readRows(
      db
      .select()
      .from(items)
      .where(eq(items.campaignId, campaignId)),
    );
    const row = rows.find((candidate) => normalizeText(candidate.name) === normalizedName);
    if (row) {
      return {
        targetLabel: row.name,
        targetType,
        targetTags: deriveTargetTags(targetType, row),
        source: "parsed",
        fallbackReason: null,
      };
    }
  }

  if (targetType === "location/object") {
    const rows = readRows(
      db
      .select()
      .from(locations)
      .where(eq(locations.campaignId, campaignId)),
    );
    const row = rows.find((candidate) => normalizeText(candidate.name) === normalizedName);
    if (row) {
      return {
        targetLabel: row.name,
        targetType,
        targetTags: deriveTargetTags(targetType, row),
        source: "parsed",
        fallbackReason: null,
      };
    }
  }

  const rows = readRows(
    db
    .select()
    .from(factions)
    .where(eq(factions.campaignId, campaignId)),
  );
  const row = rows.find((candidate) => normalizeText(candidate.name) === normalizedName);
  if (row) {
    return {
      targetLabel: row.name,
      targetType,
      targetTags: deriveTargetTags(targetType, row),
      source: "parsed",
      fallbackReason: null,
    };
  }

  return {
    targetLabel: null,
    targetType: "none",
    targetTags: [],
    source: "fallback",
    fallbackReason: `Unresolved ${targetType} target: ${name}`,
  };
}

export async function resolveActionTargetContext(
  options: ResolveActionTargetContextOptions,
): Promise<ActionTargetContext> {
  const candidate = await detectActionTargetCandidate(options);
  if (!candidate) {
    return {
      targetLabel: null,
      targetType: "none",
      targetTags: [],
      source: "fallback",
      fallbackReason: "No supported concrete target resolved",
    };
  }

  const resolved =
    candidate.type === "character"
      ? resolveCharacterTarget(options.campaignId, candidate.name)
      : resolveStoredTagTarget(options.campaignId, candidate.name, candidate.type);

  return {
    ...resolved,
    source: resolved.targetType === "none" ? "fallback" : candidate.source,
  };
}
