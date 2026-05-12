/**
 * Tool executor: validates and executes Storyteller tool calls against the DB.
 *
 * Every tool call returns a ToolResult (never throws). Invalid entity references
 * return error results so the Storyteller can retry with corrected arguments.
 */

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { CHARACTER_SKILL_TIERS, CHARACTER_WEALTH_TIERS, type CharacterRecord } from "@worldforge/shared";
import { getDb } from "../db/index.js";
import {
  players,
  npcs,
  locations,
  locationEdges,
  items,
  factions,
  relationships,
  chronicle,
} from "../db/schema.js";
import { storeEpisodicEvent } from "../vectors/episodic-events.js";
import { createLogger } from "../lib/index.js";
import { parseTags } from "./parse-helpers.js";
import { accumulateReflectionBudget } from "./reflection-budget.js";
import {
  createCharacterRecordFromDraft,
  fromLegacyScaffoldNpc,
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  projectNpcRecord,
  projectPlayerRecord,
} from "../character/record-adapters.js";
import {
  listConnectedPaths,
  loadLocationGraph,
  resolveLocationTarget,
  resolveTravelPath,
} from "./location-graph.js";
import {
  DEFAULT_AUTHORITATIVE_ITEM_STATE,
  type InventoryEquipState,
  resolveCharacterTransferState,
  resolveLocationTransferState,
} from "../inventory/authority.js";
import {
  validateToolInputGrounding,
  type SpawnNpcLocationRef,
  type ToolExecutionContext,
} from "./tool-execution-context.js";
import {
  recordActorKnowledge,
  type ActorKnowledgeRoute,
  type ActorKnowledgeTruthStatus,
} from "./knowledge-model.js";
import type { RuntimeToolName } from "./tool-schemas.js";
import {
  buildRecordPlayerIntentResult,
  buildStartSearchResult,
  prepareCreateMinorPoiInput,
  prepareCreateSceneExtraInput,
  prepareMoveActorInput,
  type BridgeStateValidationIssue,
} from "./bridge-state-tools.js";
import {
  WorldVersionConflictError,
  commitAuthorityTrace,
  validateBaseWorldVersion,
} from "./living-world-authority.js";
import {
  attachToolResultAuthority,
  buildValidationFailureToolResult,
  inferRefsFromToolResultPayload,
  type ToolResult,
} from "./tool-result.js";
import {
  buildCombatEnvelope,
  buildNarrativeOutcomeBounds,
  deriveCombatPosture,
} from "./combat-envelope.js";

export type { ToolResult } from "./tool-result.js";

const log = createLogger("tool-executor");

// -- Types --------------------------------------------------------------------

type EntityType = "player" | "npc" | "location" | "item" | "faction";
type CharacterEntityType = "player" | "npc";
type NpcTier = "temporary" | "persistent" | "key";
type ToolLocationRow = {
  id: string;
  name: string;
  tags: string;
  kind?: "macro" | "persistent_sublocation" | "ephemeral_scene" | null;
  parentLocationId?: string | null;
  anchorLocationId?: string | null;
  persistence?: "persistent" | "ephemeral" | null;
};
type ResolvedSpawnNpcLocation = {
  scene: ToolLocationRow;
  broad: ToolLocationRow;
};

const ENTITY_TYPE_TABLE_MAP = {
  player: players,
  npc: npcs,
  location: locations,
  item: items,
  faction: factions,
} as const;
const NPC_TIER_ORDER: Record<NpcTier, number> = {
  temporary: 0,
  persistent: 1,
  key: 2,
};
const STATE_BEARING_TOOLS = new Set([
  "add_tag",
  "remove_tag",
  "set_relationship",
  "add_chronicle_entry",
  "log_event",
  "record_dialogue_outcome",
  "record_world_fact",
  "advance_time",
  "spawn_npc",
  "promote_npc",
  "spawn_item",
  "reveal_location",
  "request_contested_outcome",
  "set_condition",
  "move_to",
  "move_actor",
  "create_minor_poi",
  "create_scene_extra",
  "start_search",
  "record_player_intent",
  "transfer_item",
]);
const SYNC_SQLITE_STATE_BEARING_TOOLS = new Set(
  [...STATE_BEARING_TOOLS].filter((toolName) =>
    toolName !== "log_event" && toolName !== "record_dialogue_outcome"),
);

// -- Entity resolution --------------------------------------------------------

function typedRefPrefixesForEntityType(entityType: EntityType): string[] {
  switch (entityType) {
    case "player":
      return ["actor:", "player:"];
    case "npc":
      return ["actor:", "npc:"];
    case "location":
      return ["location:"];
    case "item":
      return ["item:"];
    case "faction":
      return ["faction:"];
  }
}

function refCandidates(value: string, prefixes: readonly string[]): string[] {
  const trimmed = value.trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const candidates = [trimmed];
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      const unprefixed = trimmed.slice(prefix.length).trim();
      if (unprefixed) candidates.push(unprefixed);
    }
  }
  return [...new Set(candidates)];
}

function resolveEntity(
  campaignId: string,
  entityName: string,
  entityType: EntityType
): { id: string; name: string; tags: string } | null {
  const table = ENTITY_TYPE_TABLE_MAP[entityType];
  if (!table) return null;

  const db = getDb();
  const candidates = refCandidates(entityName, typedRefPrefixesForEntityType(entityType));
  const primaryRef = candidates[0] ?? entityName;
  const secondaryRef = candidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();
  const row = db
    .select({ id: table.id, name: table.name, tags: table.tags })
    .from(table)
    .where(
      sql`${table.campaignId} = ${campaignId} AND (${table.id} = ${primaryRef} OR ${table.id} = ${secondaryRef} OR LOWER(${table.name}) = ${normalizedPrimary} OR LOWER(${table.name}) = ${normalizedSecondary})`
    )
    .get();

  return row ?? null;
}

function loadToolLocationRows(campaignId: string): ToolLocationRow[] {
  const db = getDb();
  return db
    .select({
      id: locations.id,
      name: locations.name,
      tags: locations.tags,
      kind: locations.kind,
      parentLocationId: locations.parentLocationId,
      anchorLocationId: locations.anchorLocationId,
      persistence: locations.persistence,
    })
    .from(locations)
    .where(eq(locations.campaignId, campaignId))
    .all();
}

function normalizeLocationRef(value: string): string {
  return value.trim().toLowerCase();
}

function resolveToolLocationById(campaignId: string, locationId: string): ToolLocationRow | null {
  const candidates = refCandidates(locationId, ["location:"]);
  return loadToolLocationRows(campaignId).find((location) => candidates.includes(location.id)) ?? null;
}

function resolveToolLocationByNameOrId(
  campaignId: string,
  locationRef: string,
): ToolLocationRow | null {
  const candidates = refCandidates(locationRef, ["location:"]);
  const normalizedRefs = candidates.map(normalizeLocationRef);
  return (
    loadToolLocationRows(campaignId).find(
      (location) =>
        candidates.includes(location.id) ||
        normalizedRefs.includes(normalizeLocationRef(location.name)),
    ) ?? null
  );
}

function resolveContextLocationRef(
  locationRef: string,
  executionContext?: ToolExecutionContext,
): string | null {
  if (!executionContext) return null;
  const normalizedRef = normalizeLocationRef(locationRef);
  if (
    executionContext.currentSceneScopeId &&
    (normalizedRef === "current_scene" || executionContext.currentSceneRefs.has(normalizedRef))
  ) {
    return executionContext.currentSceneScopeId;
  }
  if (
    executionContext.currentLocationId &&
    (normalizedRef === "current_location" || executionContext.currentLocationRefs.has(normalizedRef))
  ) {
    return executionContext.currentLocationId;
  }
  return null;
}

function resolveBroadLocationForScene(
  campaignId: string,
  sceneLocation: ToolLocationRow,
  executionContext?: ToolExecutionContext,
): ToolLocationRow {
  if ((sceneLocation.kind ?? "macro") === "macro") {
    return sceneLocation;
  }

  const broadLocationId =
    sceneLocation.parentLocationId ??
    executionContext?.currentLocationId ??
    sceneLocation.anchorLocationId ??
    sceneLocation.id;
  return resolveToolLocationById(campaignId, broadLocationId) ?? sceneLocation;
}

/**
 * Search for an entity by name across all entity tables (players, npcs, locations, factions).
 * Returns the entity ID if found. Used for relationship resolution where entity type is unknown.
 */
function resolveEntityIdByName(
  campaignId: string,
  entityName: string
): string | null {
  const db = getDb();
  const tables = [players, npcs, locations, factions, items] as const;
  const candidates = refCandidates(entityName, [
    "actor:",
    "player:",
    "npc:",
    "location:",
    "faction:",
    "item:",
  ]);
  const primaryRef = candidates[0] ?? entityName;
  const secondaryRef = candidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();

  for (const table of tables) {
    const row = db
      .select({ id: table.id })
      .from(table)
      .where(
        sql`${table.campaignId} = ${campaignId} AND (${table.id} = ${primaryRef} OR ${table.id} = ${secondaryRef} OR LOWER(${table.name}) = ${normalizedPrimary} OR LOWER(${table.name}) = ${normalizedSecondary})`
      )
      .get();

    if (row) return row.id;
  }

  return null;
}

const CONDITION_TAGS = new Set([
  "bleeding",
  "burned",
  "cursed",
  "disguised",
  "exhausted",
  "hidden",
  "injured",
  "poisoned",
  "prone",
  "sick",
  "starving",
  "wounded",
]);

function pushUnique(list: string[], value: string) {
  if (list.some((item) => item.toLowerCase() === value.toLowerCase())) {
    return;
  }
  list.push(value);
}

function removeInsensitive(list: string[], value: string): string[] {
  const lower = value.toLowerCase();
  return list.filter((item) => item.toLowerCase() !== lower);
}

function parseSkillTag(tag: string): { name: string; tier: typeof CHARACTER_SKILL_TIERS[number] } | null {
  for (const tier of CHARACTER_SKILL_TIERS) {
    const prefix = `${tier} `;
    if (tag.startsWith(prefix)) {
      const name = tag.slice(prefix.length).trim();
      if (name) {
        return { name, tier };
      }
    }
  }

  return null;
}

function addCompatibilityTagToRecord(record: CharacterRecord, tag: string): CharacterRecord {
  const trimmed = tag.trim();
  if (!trimmed) return record;

  if (CHARACTER_WEALTH_TIERS.includes(trimmed as typeof CHARACTER_WEALTH_TIERS[number])) {
    return {
      ...record,
      capabilities: {
        ...record.capabilities,
        wealthTier: trimmed as typeof CHARACTER_WEALTH_TIERS[number],
      },
    };
  }

  const skill = parseSkillTag(trimmed);
  if (skill) {
    const nextSkills = record.capabilities.skills.filter(
      (entry) => entry.name.toLowerCase() !== skill.name.toLowerCase(),
    );
    nextSkills.push(skill);
    return {
      ...record,
      capabilities: {
        ...record.capabilities,
        skills: nextSkills,
      },
    };
  }

  if (CONDITION_TAGS.has(trimmed.toLowerCase())) {
    const conditions = [...record.state.conditions];
    pushUnique(conditions, trimmed);
    return {
      ...record,
      state: {
        ...record.state,
        conditions,
      },
    };
  }

  const socialStatus = [...record.socialContext.socialStatus];
  pushUnique(socialStatus, trimmed);
  return {
    ...record,
    socialContext: {
      ...record.socialContext,
      socialStatus,
    },
  };
}

function removeCompatibilityTagFromRecord(record: CharacterRecord, tag: string): CharacterRecord {
  const trimmed = tag.trim();
  if (!trimmed) return record;

  const skill = parseSkillTag(trimmed);
  return {
    ...record,
    capabilities: {
      ...record.capabilities,
      wealthTier:
        record.capabilities.wealthTier?.toLowerCase() === trimmed.toLowerCase()
          ? null
          : record.capabilities.wealthTier,
      skills: skill
        ? record.capabilities.skills.filter(
            (entry) => entry.name.toLowerCase() !== skill.name.toLowerCase(),
          )
        : record.capabilities.skills,
      traits: removeInsensitive(record.capabilities.traits ?? [], trimmed),
      flaws: removeInsensitive(record.capabilities.flaws ?? [], trimmed),
    },
    state: {
      ...record.state,
      conditions: removeInsensitive(record.state.conditions, trimmed),
      statusFlags: removeInsensitive(record.state.statusFlags, trimmed),
    },
    socialContext: {
      ...record.socialContext,
      socialStatus: removeInsensitive(record.socialContext.socialStatus, trimmed),
    },
    motivations: {
      ...record.motivations,
      drives: removeInsensitive(record.motivations.drives, trimmed),
      frictions: removeInsensitive(record.motivations.frictions, trimmed),
    },
  };
}

function resolveCharacterRecordByName(
  campaignId: string,
  entityName: string,
  entityType: CharacterEntityType,
) {
  const db = getDb();
  const candidates = refCandidates(entityName, typedRefPrefixesForEntityType(entityType));
  const primaryRef = candidates[0] ?? entityName;
  const secondaryRef = candidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();

  if (entityType === "player") {
    const row = db
      .select()
      .from(players)
      .where(
        sql`${players.campaignId} = ${campaignId} AND (${players.id} = ${primaryRef} OR ${players.id} = ${secondaryRef} OR LOWER(${players.name}) = ${normalizedPrimary} OR LOWER(${players.name}) = ${normalizedSecondary})`
      )
      .get();

    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      type: "player" as const,
      record: hydrateStoredPlayerRecord(row),
    };
  }

  const row = db
    .select()
    .from(npcs)
    .where(
      sql`${npcs.campaignId} = ${campaignId} AND (${npcs.id} = ${primaryRef} OR ${npcs.id} = ${secondaryRef} OR LOWER(${npcs.name}) = ${normalizedPrimary} OR LOWER(${npcs.name}) = ${normalizedSecondary})`
    )
    .get();

  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    type: "npc" as const,
    record: hydrateStoredNpcRecord(row),
  };
}

function persistCharacterRecord(
  character: ReturnType<typeof resolveCharacterRecordByName>,
) {
  if (!character) return;

  const db = getDb();
  if (character.type === "player") {
    db.update(players)
      .set(projectPlayerRecord(character.record))
      .where(eq(players.id, character.id))
      .run();
    return;
  }

  db.update(npcs)
    .set(projectNpcRecord(character.record))
    .where(eq(npcs.id, character.id))
    .run();
}

// -- Character resolution helper (search players then npcs) -------------------

function resolveCharacterByName(
  campaignId: string,
  name: string
): { id: string; name: string; table: "players" | "npcs"; hp?: number } | null {
  const db = getDb();
  const candidates = refCandidates(name, ["actor:", "player:", "npc:"]);
  const primaryRef = candidates[0] ?? name;
  const secondaryRef = candidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();

  // Search players first
  const player = db
    .select({ id: players.id, name: players.name, hp: players.hp })
    .from(players)
    .where(
      sql`${players.campaignId} = ${campaignId} AND (${players.id} = ${primaryRef} OR ${players.id} = ${secondaryRef} OR LOWER(${players.name}) = ${normalizedPrimary} OR LOWER(${players.name}) = ${normalizedSecondary})`
    )
    .get();

  if (player) return { id: player.id, name: player.name, table: "players", hp: player.hp };

  // Then npcs
  const npc = db
    .select({ id: npcs.id, name: npcs.name })
    .from(npcs)
    .where(
      sql`${npcs.campaignId} = ${campaignId} AND (${npcs.id} = ${primaryRef} OR ${npcs.id} = ${secondaryRef} OR LOWER(${npcs.name}) = ${normalizedPrimary} OR LOWER(${npcs.name}) = ${normalizedSecondary})`
    )
    .get();

  if (npc) return { id: npc.id, name: npc.name, table: "npcs" };

  return null;
}

function resolveCharacterRecordByRef(
  campaignId: string,
  ref: string,
) {
  const candidates = refCandidates(ref, ["actor:", "player:", "npc:"]);
  const primaryRef = candidates[0] ?? ref;
  const secondaryRef = candidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();
  const db = getDb();

  const player = db
    .select()
    .from(players)
    .where(
      sql`${players.campaignId} = ${campaignId} AND (${players.id} = ${primaryRef} OR ${players.id} = ${secondaryRef} OR LOWER(${players.name}) = ${normalizedPrimary} OR LOWER(${players.name}) = ${normalizedSecondary})`,
    )
    .get();

  if (player) {
    return {
      id: player.id,
      name: player.name,
      type: "player" as const,
      record: hydrateStoredPlayerRecord(player),
    };
  }

  const npc = db
    .select()
    .from(npcs)
    .where(
      sql`${npcs.campaignId} = ${campaignId} AND (${npcs.id} = ${primaryRef} OR ${npcs.id} = ${secondaryRef} OR LOWER(${npcs.name}) = ${normalizedPrimary} OR LOWER(${npcs.name}) = ${normalizedSecondary})`,
    )
    .get();

  if (!npc) return null;
  return {
    id: npc.id,
    name: npc.name,
    type: "npc" as const,
    record: hydrateStoredNpcRecord(npc),
  };
}

function resolveItemByNameOrRef(
  campaignId: string,
  itemRef: string,
): { id: string; name: string } | null {
  const candidates = refCandidates(itemRef, ["item:"]);
  const primaryRef = candidates[0] ?? itemRef;
  const secondaryRef = candidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();
  const db = getDb();

  return db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(
      sql`${items.campaignId} = ${campaignId} AND (${items.id} = ${primaryRef} OR ${items.id} = ${secondaryRef} OR LOWER(${items.name}) = ${normalizedPrimary} OR LOWER(${items.name}) = ${normalizedSecondary})`
    )
    .get() ?? null;
}

function normalizeNpcTier(value: unknown): NpcTier | null {
  return value === "temporary" || value === "persistent" || value === "key"
    ? value
    : null;
}

// -- Tool handlers ------------------------------------------------------------

function handleAddTag(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const entityName = args.entityName as string;
  const entityType = args.entityType as string;
  const tag = args.tag as string;

  if (!(entityType in ENTITY_TYPE_TABLE_MAP)) {
    return { success: false, error: `Invalid entity type: ${entityType}` };
  }

  if (entityType === "player" || entityType === "npc") {
    const character = resolveCharacterRecordByName(
      campaignId,
      entityName,
      entityType,
    );
    if (!character) {
      return { success: false, error: `Entity not found: ${entityName} (${entityType})` };
    }

    character.record = addCompatibilityTagToRecord(character.record, tag);
    persistCharacterRecord(character);
    const tags =
      character.type === "player"
        ? parseTags(projectPlayerRecord(character.record).tags)
        : parseTags(projectNpcRecord(character.record).tags);

    log.event("db.write", {
      table: character.type === "player" ? "players" : "npcs",
      op: "update",
      rowId: character.id,
      rowName: character.name,
    });

    return {
      success: true,
      result: { entity: character.name, tags },
    };
  }

  const entity = resolveEntity(campaignId, entityName, entityType as EntityType);
  if (!entity) {
    return { success: false, error: `Entity not found: ${entityName} (${entityType})` };
  }

  const currentTags = parseTags(entity.tags);

  // Idempotent: don't add duplicates
  if (!currentTags.includes(tag)) {
    currentTags.push(tag);
  }

  const table = ENTITY_TYPE_TABLE_MAP[entityType as EntityType];
  const db = getDb();
  db.update(table)
    .set({ tags: JSON.stringify(currentTags) })
    .where(eq(table.id, entity.id))
    .run();
  log.event("db.write", {
    table: "dynamic",
    subTable: entityType,
    op: "update",
    rowId: entity.id,
    rowName: entity.name,
  });

  return {
    success: true,
    result: { entity: entity.name, tags: currentTags },
  };
}

function handleRemoveTag(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const entityName = args.entityName as string;
  const entityType = args.entityType as string;
  const tag = args.tag as string;

  if (!(entityType in ENTITY_TYPE_TABLE_MAP)) {
    return { success: false, error: `Invalid entity type: ${entityType}` };
  }

  if (entityType === "player" || entityType === "npc") {
    const character = resolveCharacterRecordByName(
      campaignId,
      entityName,
      entityType,
    );
    if (!character) {
      return { success: false, error: `Entity not found: ${entityName} (${entityType})` };
    }

    const before = JSON.stringify(character.record);
    character.record = removeCompatibilityTagFromRecord(character.record, tag);

    if (before === JSON.stringify(character.record)) {
      return { success: false, error: `Tag not found: "${tag}" on ${entityName}` };
    }

    persistCharacterRecord(character);
    const tags =
      character.type === "player"
        ? parseTags(projectPlayerRecord(character.record).tags)
        : parseTags(projectNpcRecord(character.record).tags);

    log.event("db.write", {
      table: character.type === "player" ? "players" : "npcs",
      op: "update",
      rowId: character.id,
      rowName: character.name,
    });

    return {
      success: true,
      result: { entity: character.name, tags },
    };
  }

  const entity = resolveEntity(campaignId, entityName, entityType as EntityType);
  if (!entity) {
    return { success: false, error: `Entity not found: ${entityName} (${entityType})` };
  }

  const currentTags = parseTags(entity.tags);
  const tagIndex = currentTags.indexOf(tag);

  if (tagIndex === -1) {
    return { success: false, error: `Tag not found: "${tag}" on ${entityName}` };
  }

  currentTags.splice(tagIndex, 1);

  const table = ENTITY_TYPE_TABLE_MAP[entityType as EntityType];
  const db = getDb();
  db.update(table)
    .set({ tags: JSON.stringify(currentTags) })
    .where(eq(table.id, entity.id))
    .run();
  log.event("db.write", {
    table: "dynamic",
    subTable: entityType,
    op: "update",
    rowId: entity.id,
    rowName: entity.name,
  });

  return {
    success: true,
    result: { entity: entity.name, tags: currentTags },
  };
}

function handleSetRelationship(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const entityAName = args.entityA as string;
  const entityBName = args.entityB as string;
  const tag = args.tag as string;
  const reason = args.reason as string;

  // Resolve entity IDs by searching all entity tables
  const entityAId = resolveEntityIdByName(campaignId, entityAName);
  const entityBId = resolveEntityIdByName(campaignId, entityBName);

  if (!entityAId) {
    return { success: false, error: `Entity not found: ${entityAName}` };
  }
  if (!entityBId) {
    return { success: false, error: `Entity not found: ${entityBName}` };
  }

  const db = getDb();
  const id = crypto.randomUUID();

  db.insert(relationships)
    .values({
      id,
      campaignId,
      entityA: entityAId,
      entityB: entityBId,
      tags: JSON.stringify([tag]),
      reason,
    })
    .onConflictDoUpdate({
      target: [relationships.campaignId, relationships.entityA, relationships.entityB],
      set: {
        tags: JSON.stringify([tag]),
        reason,
      },
    })
    .run();
  log.event("db.write", {
    table: "relationships",
    op: "insert",
    rowId: id,
    rowName: `${entityAName}<->${entityBName}`,
  });

  return {
    success: true,
    result: {
      entityA: entityAName,
      entityB: entityBName,
      tag,
      reason,
    },
  };
}

function handleAddChronicleEntry(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number
): ToolResult {
  const text = args.text as string;
  const id = crypto.randomUUID();

  const db = getDb();
  db.insert(chronicle)
    .values({
      id,
      campaignId,
      tick,
      text,
      createdAt: Date.now(),
    })
    .run();
  log.event("db.write", {
    table: "chronicle",
    op: "insert",
    rowId: id,
    rowName: null,
  });

  return {
    success: true,
    result: { entryId: id },
  };
}

async function handleLogEvent(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number
): Promise<ToolResult> {
  const text = args.text as string;
  const importance = args.importance as number;
  const participants = args.participants as string[];
  const durability = args.durability === "durable" ? "durable" : "scene_local";
  const futureRelevance =
    typeof args.futureRelevance === "string" ? args.futureRelevance.trim() : "";

  if (durability !== "durable") {
    return {
      success: true,
      result: {
        durability: "scene_local",
        persisted: false,
      },
    };
  }

  if (!futureRelevance) {
    return {
      success: false,
      error: "futureRelevance is required when log_event durability is durable",
    };
  }

  const db = getDb();
  const player = db
    .select({ currentLocationId: players.currentLocationId })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const playerLocation = player?.currentLocationId
    ? db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, player.currentLocationId))
        .get()
    : null;

  try {
    const eventId = await storeEpisodicEvent(campaignId, {
      text,
      tick,
      location: playerLocation?.name ?? "",
      participants,
      importance,
      type: "event",
    });
    await accumulateReflectionBudget(campaignId, participants, importance);

    return {
      success: true,
      result: {
        eventId,
        durability: "durable",
        persisted: true,
      },
    };
  } catch (error) {
    log.warn("Failed to store episodic event", error);
    return {
      success: false,
      error: `Failed to store episodic event: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function readToolString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readToolStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
    .map((entry) => entry.trim());
}

function uniqueToolStrings(values: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

function canonicalDialogueOutcomeText(args: Record<string, unknown>): string {
  const speakerRef = readToolString(args.speakerRef);
  const requestedRoleText = readToolString(args.requestedRoleText);
  const outcomeKind = readToolString(args.outcomeKind) ?? "unknown";
  const topicKind = readToolString(args.topicKind) ?? "other";
  const authorityKind = readToolString(args.authorityKind) ?? "unknown";
  const truthStatus = readToolString(args.truthStatus) ?? "unconfirmed";
  const summary = readToolString(args.summary) ?? "Dialogue outcome recorded.";
  const quote = readToolString(args.quote);
  const futureUseKind = readToolString(args.futureUseKind);
  const futureRelevance = readToolString(args.futureRelevance);
  const claims = Array.isArray(args.claims)
    ? args.claims
        .filter((claim): claim is Record<string, unknown> =>
          Boolean(claim) && typeof claim === "object" && !Array.isArray(claim))
        .map((claim) => {
          const claimKind = readToolString(claim.claimKind) ?? "other";
          const polarity = readToolString(claim.polarity) ?? "states";
          const claimSummary = readToolString(claim.summary) ?? "";
          return `${claimKind}/${polarity}: ${claimSummary}`;
        })
        .filter(Boolean)
    : [];

  return [
    `Dialogue outcome ${outcomeKind} on ${topicKind}.`,
    speakerRef ? `Speaker: ${speakerRef}.` : null,
    requestedRoleText ? `Requested role: ${requestedRoleText}.` : null,
    `Authority: ${authorityKind}; truth: ${truthStatus}.`,
    `Summary: ${summary}`,
    quote ? `Quote: ${quote}` : null,
    claims.length > 0 ? `Claims: ${claims.join(" | ")}` : null,
    futureUseKind ? `Future use: ${futureUseKind}.` : null,
    futureRelevance ? `Future relevance: ${futureRelevance}` : null,
  ].filter((part): part is string => Boolean(part)).join(" ");
}

async function handleRecordDialogueOutcome(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
): Promise<ToolResult> {
  const durability = args.durability === "durable" ? "durable" : "scene_local";
  const text = canonicalDialogueOutcomeText(args);
  const speakerRef = readToolString(args.speakerRef);
  const addresseeRefs = readToolStringArray(args.addresseeRefs);
  const sourceRefs = readToolStringArray(args.sourceRefs);
  const claims = Array.isArray(args.claims) ? args.claims : [];
  const participants = uniqueToolStrings([
    speakerRef,
    ...addresseeRefs,
    ...sourceRefs,
  ]);
  const baseResult = {
    text,
    outcomeKind: readToolString(args.outcomeKind),
    topicKind: readToolString(args.topicKind),
    authorityKind: readToolString(args.authorityKind),
    truthStatus: readToolString(args.truthStatus),
    speakerRef,
    addresseeRefs,
    requestedRoleText: readToolString(args.requestedRoleText),
    futureUseKind: readToolString(args.futureUseKind),
    futureRelevance: readToolString(args.futureRelevance),
    quote: readToolString(args.quote),
    summary: readToolString(args.summary),
    claims,
    sourceRefs,
    durability,
  };

  if (durability !== "durable") {
    return {
      success: true,
      result: {
        ...baseResult,
        persisted: false,
      },
    };
  }

  const futureRelevance = readToolString(args.futureRelevance);
  if (!futureRelevance) {
    return {
      success: false,
      error: "futureRelevance is required when record_dialogue_outcome durability is durable",
    };
  }

  const db = getDb();
  const player = db
    .select({ currentLocationId: players.currentLocationId })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();
  const playerLocation = player?.currentLocationId
    ? db
        .select({ name: locations.name })
        .from(locations)
        .where(eq(locations.id, player.currentLocationId))
        .get()
    : null;

  try {
    const eventId = await storeEpisodicEvent(campaignId, {
      text,
      tick,
      location: playerLocation?.name ?? "",
      participants,
      importance: 5,
      type: "event",
    });
    await accumulateReflectionBudget(campaignId, participants, 5);

    return {
      success: true,
      result: {
        ...baseResult,
        eventId,
        persisted: true,
      },
    };
  } catch (error) {
    log.warn("Failed to store dialogue outcome event", error);
    return {
      success: false,
      error: `Failed to store dialogue outcome event: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function mapWorldFactRoute(sourceKind: string | null): ActorKnowledgeRoute {
  switch (sourceKind) {
    case "direct_observation":
      return "direct_observation";
    case "public_record":
      return "public_record";
    case "report_message":
      return "report_message";
    case "rumor":
      return "rumor";
    case "claim":
      return "claim";
    case "memory":
      return "memory";
    case "comparison":
    case "other":
    default:
      return "belief";
  }
}

function mapWorldFactTruthStatus(truthStatus: string | null): ActorKnowledgeTruthStatus {
  switch (truthStatus) {
    case "observed":
      return "observed";
    case "verified":
      return "verified";
    case "reported":
      return "reported";
    case "rumored":
      return "rumored";
    case "claimed":
      return "claimed";
    case "disputed":
      return "disputed";
    case "believed":
    case "unknown":
    default:
      return "believed";
  }
}

function worldFactConfidence(truthStatus: string | null): number {
  switch (truthStatus) {
    case "verified":
    case "observed":
      return 80;
    case "reported":
      return 65;
    case "claimed":
    case "believed":
      return 55;
    case "rumored":
      return 40;
    case "disputed":
    case "unknown":
      return 35;
    default:
      return 50;
  }
}

function isLikelyEventSourceRef(ref: string): boolean {
  return /event|chronicle|tool-result|tool:/i.test(ref);
}

function canonicalWorldFactText(args: Record<string, unknown>): string {
  const sourceKind = readToolString(args.sourceKind) ?? "other";
  const truthStatus = readToolString(args.truthStatus) ?? "believed";
  const factKind = readToolString(args.factKind) ?? "other";
  const topicKind = readToolString(args.topicKind) ?? "other";
  const summary = readToolString(args.summary) ?? "World fact recorded.";
  const futureUseKind = readToolString(args.futureUseKind);
  const futureRelevance = readToolString(args.futureRelevance);
  const subjectRefs = readToolStringArray(args.subjectRefs);
  const sourceRefs = readToolStringArray(args.sourceRefs);
  const claims = Array.isArray(args.claims)
    ? args.claims
        .filter((claim): claim is Record<string, unknown> =>
          Boolean(claim) && typeof claim === "object" && !Array.isArray(claim))
        .map((claim) => {
          const claimKind = readToolString(claim.claimKind) ?? "other";
          const polarity = readToolString(claim.polarity) ?? "states";
          const claimSummary = readToolString(claim.summary) ?? "";
          return `${claimKind}/${polarity}: ${claimSummary}`;
        })
        .filter(Boolean)
    : [];

  return [
    `World fact ${factKind} on ${topicKind}.`,
    `Source: ${sourceKind}; truth: ${truthStatus}.`,
    subjectRefs.length > 0 ? `Subjects: ${subjectRefs.join(", ")}.` : null,
    sourceRefs.length > 0 ? `Source refs: ${sourceRefs.join(", ")}.` : null,
    `Summary: ${summary}`,
    claims.length > 0 ? `Claims: ${claims.join(" | ")}` : null,
    futureUseKind ? `Future use: ${futureUseKind}.` : null,
    futureRelevance ? `Future relevance: ${futureRelevance}` : null,
  ].filter((part): part is string => Boolean(part)).join(" ");
}

function handleRecordWorldFact(
  campaignId: string,
  args: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const actorId = executionContext?.subjectActorId;
  if (!actorId) {
    return {
      success: false,
      error: "record_world_fact requires a subject actor in the execution context",
    };
  }

  const futureRelevance = readToolString(args.futureRelevance);
  if (!futureRelevance) {
    return {
      success: false,
      error: "futureRelevance is required when record_world_fact durability is durable",
    };
  }

  const sourceKind = readToolString(args.sourceKind);
  const truthStatus = readToolString(args.truthStatus);
  const subjectRefs = readToolStringArray(args.subjectRefs);
  const sourceRefs = readToolStringArray(args.sourceRefs);
  const claims = Array.isArray(args.claims) ? args.claims : [];
  const statement = canonicalWorldFactText(args);

  try {
    const record = recordActorKnowledge({
      campaignId,
      actorId,
      route: mapWorldFactRoute(sourceKind),
      truthStatus: mapWorldFactTruthStatus(truthStatus),
      statement,
      subjectRefs,
      sourceKnowledgeIds: sourceRefs
        .filter((ref) => ref.startsWith("knowledge:"))
        .map((ref) => ref.slice("knowledge:".length)),
      sourceEventIds: sourceRefs.filter((ref) =>
        !ref.startsWith("knowledge:") && isLikelyEventSourceRef(ref)),
      confidence: worldFactConfidence(truthStatus),
      reliability: worldFactConfidence(truthStatus),
      privacy: "private",
      metadata: {
        toolName: "record_world_fact",
        sourceKind,
        truthStatus,
        factKind: readToolString(args.factKind),
        topicKind: readToolString(args.topicKind),
        futureUseKind: readToolString(args.futureUseKind),
        futureRelevance,
        claims,
        sourceRefs,
      },
    });

    return {
      success: true,
      result: {
        knowledgeId: record.id,
        factRef: `knowledge:${record.id}`,
        statement: record.statement,
        sourceKind,
        truthStatus,
        factKind: readToolString(args.factKind),
        topicKind: readToolString(args.topicKind),
        futureUseKind: readToolString(args.futureUseKind),
        futureRelevance,
        summary: readToolString(args.summary),
        claims,
        subjectRefs,
        sourceRefs,
        durability: "durable",
        persisted: true,
      },
    };
  } catch (error) {
    log.warn("Failed to record world fact", error);
    return {
      success: false,
      error: `Failed to record world fact: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// -- New tool handlers --------------------------------------------------------

function resolveSpawnNpcLocation(
  campaignId: string,
  args: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): ResolvedSpawnNpcLocation | null {
  const locationRef = args.locationRef as SpawnNpcLocationRef | undefined;
  const locationId = args.locationId as string | undefined;
  const locationName = args.locationName as string | undefined;
  let scene: ToolLocationRow | null = null;

  if (locationRef) {
    const refLocationId = locationRef === "current_scene"
      ? executionContext?.currentSceneScopeId
      : executionContext?.currentLocationId;
    scene = refLocationId ? resolveToolLocationById(campaignId, refLocationId) : null;
  } else if (locationId) {
    scene = resolveToolLocationById(campaignId, locationId);
  } else if (locationName) {
    scene = resolveToolLocationByNameOrId(campaignId, locationName);
  }

  if (!scene) return null;

  return {
    scene,
    broad: resolveBroadLocationForScene(campaignId, scene, executionContext),
  };
}

function handleSpawnNpc(
  campaignId: string,
  args: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const name = args.name as string;
  const tags = args.tags as string[];

  const resolvedLocation = resolveSpawnNpcLocation(campaignId, args, executionContext);
  if (!resolvedLocation) {
    return { success: false, error: "Location not found for grounded local spawn ref" };
  }
  const { scene: location, broad: broadLocation } = resolvedLocation;

  if (
    executionContext?.scope === "player_turn"
    && typeof args.locationName === "string"
    && location.id !== executionContext.currentLocationId
    && location.id !== executionContext.currentSceneScopeId
  ) {
    return {
      success: false,
      error: "spawn_npc locationName must resolve to the current scene/current location in player turns",
    };
  }

  const id = crypto.randomUUID();
  const draft = fromLegacyScaffoldNpc(
    {
      name,
      persona: tags.join(", "),
      tags,
      goals: { shortTerm: [], longTerm: [] },
      locationName: location.name,
      factionName: null,
      tier: "supporting",
    },
    { currentLocationName: broadLocation.name, sourceKind: "generator" },
  );
  const record = createCharacterRecordFromDraft(
    {
      ...draft,
      identity: {
        ...draft.identity,
        tier: "temporary",
      },
      socialContext: {
        ...draft.socialContext,
        currentLocationId: broadLocation.id,
        currentLocationName: broadLocation.name,
      },
    },
    { id, campaignId },
  );
  const npcProjection = projectNpcRecord(record);
  const db = getDb();
  db.insert(npcs)
    .values({
      id,
      campaignId,
      ...npcProjection,
      currentSceneLocationId: location.id,
      unprocessedImportance: 0,
      inactiveTicks: 0,
      createdAt: Date.now(),
    })
    .run();
  log.event("db.write", {
    table: "npcs",
    op: "insert",
    rowId: id,
    rowName: name,
  });

  return {
    success: true,
    result: {
      id,
      name,
      locationId: location.id,
      locationName: location.name,
      broadLocationId: broadLocation.id,
      broadLocationName: broadLocation.name,
      sceneLocationId: location.id,
      sceneLocationName: location.name,
      tier: "temporary",
    },
  };
}

function handlePromoteNpc(
  campaignId: string,
  args: Record<string, unknown>,
): ToolResult {
  const npcRef = args.npcRef as string;
  const newTier = normalizeNpcTier(args.newTier);
  const reason = args.reason as string;

  if (!newTier || newTier === "temporary") {
    return { success: false, error: "promote_npc newTier must be persistent or key." };
  }

  const db = getDb();
  const npcCandidates = refCandidates(npcRef, ["actor:", "npc:"]);
  const primaryRef = npcCandidates[0] ?? npcRef;
  const secondaryRef = npcCandidates[1] ?? primaryRef;
  const normalizedPrimary = primaryRef.trim().toLowerCase();
  const normalizedSecondary = secondaryRef.trim().toLowerCase();
  const npc = db
    .select({ id: npcs.id, name: npcs.name, tier: npcs.tier })
    .from(npcs)
    .where(
      sql`${npcs.campaignId} = ${campaignId} AND (${npcs.id} = ${primaryRef} OR ${npcs.id} = ${secondaryRef} OR LOWER(${npcs.name}) = ${normalizedPrimary} OR LOWER(${npcs.name}) = ${normalizedSecondary})`
    )
    .get();

  if (!npc) {
    return { success: false, error: `NPC not found: ${npcRef}` };
  }

  const oldTier = normalizeNpcTier(npc.tier);
  if (!oldTier) {
    return { success: false, error: `NPC ${npc.name} has invalid tier: ${npc.tier}` };
  }

  if (NPC_TIER_ORDER[newTier] <= NPC_TIER_ORDER[oldTier]) {
    return {
      success: false,
      error: "Can only promote upward (temporary -> persistent -> key).",
    };
  }

  db.update(npcs)
    .set({ tier: newTier })
    .where(eq(npcs.id, npc.id))
    .run();
  log.event("db.write", {
    table: "npcs",
    op: "update",
    rowId: npc.id,
    rowName: npc.name,
  });

  return {
    success: true,
    result: {
      npcId: npc.id,
      name: npc.name,
      oldTier,
      newTier,
      reason,
    },
  };
}

function handleSpawnItem(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const name = args.name as string;
  const tags = args.tags as string[];
  const ownerName = args.ownerName as string;
  const ownerType = args.ownerType as string;

  const id = crypto.randomUUID();
  const db = getDb();

  if (ownerType === "character") {
    const character = resolveCharacterByName(campaignId, ownerName);
    if (!character) {
      return { success: false, error: `Character not found: ${ownerName}` };
    }

    db.insert(items)
      .values({
        id,
        campaignId,
        name,
        tags: JSON.stringify(tags),
        ownerId: character.id,
        equipState: DEFAULT_AUTHORITATIVE_ITEM_STATE.equipState,
        equippedSlot: DEFAULT_AUTHORITATIVE_ITEM_STATE.equippedSlot,
        isSignature: DEFAULT_AUTHORITATIVE_ITEM_STATE.isSignature,
      })
      .run();
    log.event("db.write", {
      table: "items",
      op: "insert",
      rowId: id,
      rowName: name,
    });

    return {
      success: true,
      result: { id, name, owner: character.name, ownerType: "character" },
    };
  }

  if (ownerType === "location") {
    const location = resolveToolLocationByNameOrId(campaignId, ownerName);
    if (!location) {
      return { success: false, error: `Location not found: ${ownerName}` };
    }

    db.insert(items)
      .values({
        id,
        campaignId,
        name,
        tags: JSON.stringify(tags),
        locationId: location.id,
        equipState: DEFAULT_AUTHORITATIVE_ITEM_STATE.equipState,
        equippedSlot: DEFAULT_AUTHORITATIVE_ITEM_STATE.equippedSlot,
        isSignature: DEFAULT_AUTHORITATIVE_ITEM_STATE.isSignature,
      })
      .run();
    log.event("db.write", {
      table: "items",
      op: "insert",
      rowId: id,
      rowName: name,
    });

    return {
      success: true,
      result: { id, name, owner: location.name, ownerType: "location" },
    };
  }

  return { success: false, error: `Invalid ownerType: ${ownerType}` };
}

function handleRevealLocation(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const name = args.name as string;
  const description = args.description as string;
  const tags = args.tags as string[];
  const connectedToName = args.connectedToName as string;

  const contextLocationId = resolveContextLocationRef(connectedToName, executionContext);
  const existingLocation = contextLocationId
    ? resolveToolLocationById(campaignId, contextLocationId)
    : resolveToolLocationByNameOrId(campaignId, connectedToName);
  if (!existingLocation) {
    return { success: false, error: `Connected location not found: ${connectedToName}` };
  }

  const id = crypto.randomUUID();
  const db = getDb();
  const expiresAtTick = tick + 3;

  // Insert new location connected to existing one
  db.insert(locations)
    .values({
      id,
      campaignId,
      name,
      description,
      kind: "ephemeral_scene",
      parentLocationId: existingLocation.id,
      anchorLocationId: existingLocation.id,
      persistence: "ephemeral",
      expiresAtTick,
      archivedAtTick: null,
      tags: JSON.stringify(tags),
      isStarting: false,
      connectedTo: JSON.stringify([existingLocation.id]),
    })
    .run();
  log.event("db.write", {
    table: "locations",
    op: "insert",
    rowId: id,
    rowName: name,
  });

  db.insert(locationEdges)
    .values([
      {
        id: crypto.randomUUID(),
        campaignId,
        fromLocationId: existingLocation.id,
        toLocationId: id,
        travelCost: 1,
        discovered: true,
      },
      {
        id: crypto.randomUUID(),
        campaignId,
        fromLocationId: id,
        toLocationId: existingLocation.id,
        travelCost: 1,
        discovered: true,
      },
    ])
    .run();
  log.event("db.write", {
    table: "locationEdges",
    op: "insert",
    rowId: `${existingLocation.id}<->${id}`,
    rowName: `${existingLocation.name}<->${name}`,
  });

  // Update existing location's connectedTo to include new location (bidirectional)
  const existingRow = db
    .select({ connectedTo: locations.connectedTo })
    .from(locations)
    .where(eq(locations.id, existingLocation.id))
    .get();

  const existingConnections = existingRow
    ? (() => {
        try {
          const parsed = JSON.parse(existingRow.connectedTo) as unknown;
          return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === "string") : [];
        } catch {
          return [];
        }
      })()
    : [];

  existingConnections.push(id);

  db.update(locations)
    .set({ connectedTo: JSON.stringify(existingConnections) })
    .where(eq(locations.id, existingLocation.id))
    .run();
  log.event("db.write", {
    table: "locations",
    op: "update",
    rowId: existingLocation.id,
    rowName: existingLocation.name,
  });

  return {
    success: true,
    result: {
      id,
      name,
      connectedTo: existingLocation.name,
      kind: "ephemeral_scene",
      parentLocationId: existingLocation.id,
      anchorLocationId: existingLocation.id,
      persistence: "ephemeral",
      expiresAtTick,
      archivedAtTick: null,
    },
  };
}

function handleMoveTo(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
  executionContext?: ToolExecutionContext,
): ToolResult {
  if (executionContext?.scope === "actor_turn") {
    return handleActorMoveTo(campaignId, args, tick, executionContext);
  }

  const targetLocationName = args.targetLocationName as string;
  const targetLocationRef = refCandidates(targetLocationName, ["location:"])[1] ?? targetLocationName;

  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  if (!player) return { success: false, error: "No player found" };
  if (!player.currentLocationId) return { success: false, error: "Player has no current location" };

  const locationGraph = loadLocationGraph({ campaignId });
  const destination = resolveLocationTarget({
    targetName: targetLocationRef,
    locations: locationGraph.locations,
    currentTick: tick,
  });

  if (!destination) return { success: false, error: `Location not found: ${targetLocationName}` };

  const currentLoc = db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, player.currentLocationId))
    .get();

  const travelPath = resolveTravelPath({
    campaignId,
    fromLocationId: player.currentLocationId,
    toLocationId: destination.locationId,
    edges: locationGraph.edges,
    locations: locationGraph.locations,
    currentTick: tick,
  });

  if (!travelPath) {
    const reachable = listConnectedPaths({
      campaignId,
      fromLocationId: player.currentLocationId,
      edges: locationGraph.edges,
      locations: locationGraph.locations,
      currentTick: tick,
    }).map((path) => path.locationName);
    return {
      success: false,
      error: `${targetLocationName} is not connected to current location. Available paths: ${reachable.join(", ")}`,
    };
  }

  // Move player
  const destinationName = destination.locationName;
  const updatedPlayer = hydrateStoredPlayerRecord(player, {
    currentLocationName: destinationName,
  });

  db.update(players)
    .set({
      ...projectPlayerRecord({
        ...updatedPlayer,
        socialContext: {
          ...updatedPlayer.socialContext,
          currentLocationId: destination.locationId,
          currentLocationName: destinationName,
        },
      }),
      currentSceneLocationId: destination.locationId,
    })
    .where(eq(players.id, player.id))
    .run();
  log.event("db.write", {
    table: "players",
    op: "update",
    rowId: player.id,
    rowName: player.name ?? null,
  });

  const locationNameById = new Map(
    locationGraph.locations.map((location) => [location.id, location.name]),
  );
  const path = travelPath.locationIds
    .map((locationId) => locationNameById.get(locationId))
    .filter((locationName): locationName is string => Boolean(locationName));

  return {
    success: true,
    result: {
      locationId: destination.locationId,
      locationName: destinationName,
      travelCost: travelPath.totalTravelCost,
      path,
    },
  };
}

function handleActorMoveTo(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
  executionContext: ToolExecutionContext,
): ToolResult {
  const targetLocationName = args.targetLocationName as string;
  const targetLocationRef = refCandidates(targetLocationName, ["location:"])[1] ?? targetLocationName;
  const actorId = executionContext.subjectActorId;
  if (!actorId) {
    return { success: false, error: "Actor turn move_to requires subjectActorId" };
  }

  const db = getDb();
  const npc = db
    .select()
    .from(npcs)
    .where(eq(npcs.id, actorId))
    .get();
  if (!npc || npc.campaignId !== campaignId) {
    return { success: false, error: `NPC not found for actor move_to: ${actorId}` };
  }
  if (!npc.currentLocationId) {
    return { success: false, error: "NPC has no current location" };
  }

  const locationGraph = loadLocationGraph({ campaignId });
  const currentLoc = db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.id, npc.currentLocationId))
    .get();
  if (!currentLoc) {
    return { success: false, error: "Current location not found" };
  }

  const destination = resolveLocationTarget({
    targetName: targetLocationRef,
    locations: locationGraph.locations,
    currentTick: tick,
  });
  if (!destination) {
    return { success: false, error: `Location not found: ${targetLocationName}` };
  }

  const travelPath = resolveTravelPath({
    campaignId,
    fromLocationId: npc.currentLocationId,
    toLocationId: destination.locationId,
    edges: locationGraph.edges,
    locations: locationGraph.locations,
    currentTick: tick,
  });
  if (!travelPath) {
    const reachable = listConnectedPaths({
      campaignId,
      fromLocationId: npc.currentLocationId,
      edges: locationGraph.edges,
      locations: locationGraph.locations,
      currentTick: tick,
    }).map((path) => path.locationName);
    return {
      success: false,
      error: `${targetLocationName} is not connected to ${currentLoc.name}. Available paths: ${reachable.join(", ")}`,
    };
  }

  const destinationName = destination.locationName;
  const npcRecord = hydrateStoredNpcRecord(npc, {
    currentLocationName: destinationName,
  });
  db.update(npcs)
    .set({
      ...projectNpcRecord({
        ...npcRecord,
        socialContext: {
          ...npcRecord.socialContext,
          currentLocationId: destination.locationId,
          currentLocationName: destinationName,
        },
      }),
      currentSceneLocationId: destination.locationId,
    })
    .where(eq(npcs.id, actorId))
    .run();
  log.event("db.write", {
    table: "npcs",
    op: "update",
    rowId: actorId,
    rowName: npc.name,
  });

  const locationNameById = new Map(
    locationGraph.locations.map((location) => [location.id, location.name]),
  );
  const path = travelPath.locationIds
    .map((locationId) => locationNameById.get(locationId))
    .filter((locationName): locationName is string => Boolean(locationName));

  return {
    success: true,
    result: {
      actorId,
      actorName: npc.name,
      locationId: destination.locationId,
      locationName: destinationName,
      travelCost: travelPath.totalTravelCost,
      path,
    },
  };
}

function bridgeValidationFailure(issue: BridgeStateValidationIssue): ToolResult {
  return {
    success: false,
    error: `Bridge state validation failed: ${issue.message}`,
  };
}

function handleMoveActor(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const prepared = prepareMoveActorInput(args, executionContext);
  if (!prepared.ok) return bridgeValidationFailure(prepared.issue);

  const movement = handleMoveTo(
    campaignId,
    { targetLocationName: prepared.value.targetLocationName },
    tick,
    executionContext,
  );
  if (!movement.success) return movement;

  return {
    ...movement,
    result: {
      kind: "move_actor",
      actorRef: prepared.value.actorRef,
      actorRefs: prepared.value.actorRefs,
      destinationRef: prepared.value.destinationRef,
      routeEvidenceRefs: prepared.value.routeEvidenceRefs,
      intentSummary: prepared.value.intentSummary,
      locationId: readStringField(movement.result, "locationId"),
      locationName: readStringField(movement.result, "locationName"),
      travelCost: readIntegerField(movement.result, "travelCost"),
      path: Array.isArray((movement.result as Record<string, unknown> | undefined)?.path)
        ? (movement.result as { path: unknown[] }).path.filter((entry): entry is string => typeof entry === "string")
        : [],
      delegateTool: "move_to",
    },
  };
}

function handleCreateMinorPoi(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const prepared = prepareCreateMinorPoiInput(args, executionContext);
  if (!prepared.ok) return bridgeValidationFailure(prepared.issue);

  const revealed = handleRevealLocation(
    campaignId,
    {
      name: prepared.value.name,
      description: prepared.value.description,
      tags: prepared.value.tags,
      connectedToName: prepared.value.connectedToName,
    },
    tick,
    executionContext,
  );
  if (!revealed.success) return revealed;

  return {
    ...revealed,
    result: {
      ...(revealed.result as Record<string, unknown>),
      kind: "minor_poi",
      poiType: prepared.value.poiType,
      areaRef: prepared.value.areaRef,
      visibility: prepared.value.visibility,
      impact: "low",
      reason: prepared.value.reason,
      delegateTool: "reveal_location",
    },
  };
}

function handleCreateSceneExtra(
  campaignId: string,
  args: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const prepared = prepareCreateSceneExtraInput(args, executionContext);
  if (!prepared.ok) return bridgeValidationFailure(prepared.issue);

  const spawned = handleSpawnNpc(
    campaignId,
    {
      name: prepared.value.name,
      tags: prepared.value.tags,
      locationRef: prepared.value.locationRef,
    },
    executionContext,
  );
  if (!spawned.success) return spawned;

  return {
    ...spawned,
    result: {
      ...(spawned.result as Record<string, unknown>),
      kind: "scene_extra",
      role: prepared.value.role,
      temporary: true,
      reason: prepared.value.reason,
      delegateTool: "spawn_npc",
    },
  };
}

function handleStartSearch(
  args: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const built = buildStartSearchResult(args, executionContext);
  if (!built.ok) return bridgeValidationFailure(built.issue);
  return {
    success: true,
    result: built.value,
  };
}

function handleRecordPlayerIntent(
  args: Record<string, unknown>,
  executionContext?: ToolExecutionContext,
): ToolResult {
  const built = buildRecordPlayerIntentResult(args, executionContext);
  if (!built.ok) return bridgeValidationFailure(built.issue);
  return {
    success: true,
    result: built.value,
  };
}

function modeBaseAllowance(mode: string): string {
  switch (mode) {
    case "attack":
      return "The actor may create immediate threat, pressure, or a bounded exchange, but not an automatic fight-ending injury.";
    case "restrain":
      return "The actor may create a grab, block, or leverage attempt, but not an automatic capture without follow-up authority.";
    case "escape":
      return "The actor may create an opening or distance, but not completed escape unless movement/state tools later support it.";
    case "pursue":
      return "The actor may close distance or keep pressure, but not completed relocation unless movement tools later support it.";
    case "defend":
      return "The actor may guard, absorb, redirect, or buy time, but not erase the opposition's threat.";
    default:
      return "The actor may contest the beat locally, but the whole conflict remains unresolved.";
  }
}

function handleRequestContestedOutcome(
  campaignId: string,
  args: Record<string, unknown>,
): ToolResult {
  const actorName = String(args.actorName ?? "").trim();
  const targetName = String(args.targetName ?? "").trim();
  const mode = String(args.mode ?? "contest").trim();
  const intent = String(args.intent ?? "").trim();
  const stakes = String(args.stakes ?? "").trim();
  const evidenceRefs = Array.isArray(args.evidenceRefs)
    ? args.evidenceRefs
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => value.trim())
      .slice(0, 8)
    : [];

  const actor = resolveCharacterRecordByRef(campaignId, actorName);
  if (!actor) {
    return { success: false, error: `Actor not found for contested outcome: ${actorName}` };
  }

  const target = resolveCharacterRecordByRef(campaignId, targetName);
  if (!target) {
    return { success: false, error: `Target not found for contested outcome: ${targetName}` };
  }

  if (actor.id === target.id) {
    return { success: false, error: "Contested outcome requires two different actors" };
  }

  const actionText = `${mode}: ${intent}. Stakes: ${stakes}`;
  const combatEnvelope = buildCombatEnvelope({
    actor: {
      label: actor.name,
      powerStats: actor.record.powerStats,
    },
    target: {
      label: target.name,
      powerStats: target.record.powerStats,
    },
    hostileAction: true,
    actionText,
  });
  const bounds = combatEnvelope
    ? buildNarrativeOutcomeBounds(combatEnvelope, "contested")
    : null;
  const posture = combatEnvelope
    ? deriveCombatPosture(combatEnvelope, { vsLabel: target.name })
    : null;

  const noFinalAuthority =
    "Do not declare death, incapacitation, capture, escape, HP loss, inventory transfer, or relocation unless a later successful tool/state result commits it.";
  const prohibitedEffects = [
    ...(bounds?.prohibitions ?? [
      "No power outcome is settled because at least one side has no stored power assessment.",
    ]),
    noFinalAuthority,
  ];
  const allowedEffects = [
    modeBaseAllowance(mode),
    ...(bounds ? [...bounds.ceilings, ...bounds.floors] : [
      "The narrator may show effort, opposition, hesitation, and immediate pressure without deciding the contest.",
    ]),
  ];

  return {
    success: true,
    result: {
      kind: "contested_outcome_bounds",
      actorId: actor.id,
      actorName: actor.name,
      actorType: actor.type,
      targetId: target.id,
      targetName: target.name,
      targetType: target.type,
      mode,
      intent,
      stakes,
      evidenceRefs,
      combatEnvelopeBuilt: Boolean(combatEnvelope),
      matchup: combatEnvelope?.matchup ?? "unknown",
      posture: posture
        ? {
            posture: posture.posture,
            canWin: posture.canWin,
            mustAvoidCount: posture.mustAvoid.length,
          }
        : null,
      outcomeBounds: bounds,
      allowedEffects,
      prohibitedEffects,
      requiresFollowupTool:
        "Concrete HP, movement, inventory, tag, relationship, or durable memory changes require separate successful backend tools.",
    },
  };
}

function handleSetCondition(
  campaignId: string,
  args: Record<string, unknown>,
  outcomeTier?: string
): ToolResult {
  const targetName = args.targetName as string;
  const delta = args.delta as number | undefined;
  const value = args.value as number | undefined;

  if (delta === undefined && value === undefined) {
    return { success: false, error: "Either delta or value must be provided" };
  }

  const character = resolveCharacterByName(campaignId, targetName);
  if (!character) {
    return { success: false, error: `Character not found: ${targetName}` };
  }

  if (character.table === "npcs") {
    return {
      success: false,
      error: "NPCs do not have HP in the current system. Use add_tag/remove_tag for NPC conditions.",
    };
  }

  // Backend enforcement: reject HP decrease on Strong Hit unless combat where player is target
  if (outcomeTier === "strong_hit" && delta !== undefined && delta < 0) {
    return {
      success: false,
      error: "Cannot decrease HP on a Strong Hit. Strong Hit = full success with no damage to the player. Use add_tag for non-HP consequences.",
    };
  }

  const oldHp = character.hp ?? 5;
  let newHp: number;

  if (delta !== undefined) {
    newHp = Math.max(0, Math.min(5, oldHp + delta));
  } else {
    newHp = Math.max(0, Math.min(5, value!));
  }

  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.id, character.id))
    .get();

  if (!player) {
    return { success: false, error: `Character not found: ${targetName}` };
  }

  const updatedPlayer = hydrateStoredPlayerRecord(player);
  db.update(players)
    .set(projectPlayerRecord({
      ...updatedPlayer,
      state: {
        ...updatedPlayer.state,
        hp: newHp,
      },
    }))
    .where(eq(players.id, character.id))
    .run();
  log.event("db.write", {
    table: "players",
    op: "update",
    rowId: character.id,
    rowName: character.name,
  });

  return {
    success: true,
    result: {
      entity: character.name,
      oldHp,
      newHp,
      isDowned: newHp === 0,
    },
  };
}

function handleTransferItem(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const itemName = args.itemName as string;
  const targetName = args.targetName as string;
  const targetType = args.targetType as string;
  const equipState = args.equipState as InventoryEquipState | undefined;
  const equippedSlot = args.equippedSlot as string | undefined;

  const db = getDb();

  const item = resolveItemByNameOrRef(campaignId, itemName);

  if (!item) {
    return { success: false, error: `Item not found: ${itemName}` };
  }

  if (targetType === "character") {
    const character = resolveCharacterByName(campaignId, targetName);
    if (!character) {
      return { success: false, error: `Character not found: ${targetName}` };
    }

    const nextState = resolveCharacterTransferState({
      equipState,
      equippedSlot,
    });

    db.update(items)
      .set({
        ownerId: character.id,
        locationId: null,
        equipState: nextState.equipState,
        equippedSlot: nextState.equippedSlot,
      })
      .where(eq(items.id, item.id))
      .run();
    log.event("db.write", {
      table: "items",
      op: "update",
      rowId: item.id,
      rowName: item.name,
    });

    return {
      success: true,
      result: {
        item: item.name,
        target: character.name,
        action: nextState.equipState === "equipped" ? "equipped" : "carried",
        equipState: nextState.equipState,
        equippedSlot: nextState.equippedSlot,
      },
    };
  }

  if (targetType === "location") {
    const location = resolveEntity(campaignId, targetName, "location");
    if (!location) {
      return { success: false, error: `Location not found: ${targetName}` };
    }

    const nextState = resolveLocationTransferState();

    db.update(items)
      .set({
        ownerId: null,
        locationId: location.id,
        equipState: nextState.equipState,
        equippedSlot: nextState.equippedSlot,
      })
      .where(eq(items.id, item.id))
      .run();
    log.event("db.write", {
      table: "items",
      op: "update",
      rowId: item.id,
      rowName: item.name,
    });

    return {
      success: true,
      result: {
        item: item.name,
        target: location.name,
        action: "dropped",
        equipState: nextState.equipState,
        equippedSlot: nextState.equippedSlot,
      },
    };
  }

  return { success: false, error: `Invalid targetType: ${targetType}` };
}

function handleAdvanceTime(args: Record<string, unknown>): ToolResult {
  const minutes = typeof args.minutes === "number" ? args.minutes : Number(args.minutes);
  const reason = typeof args.reason === "string" ? args.reason.trim() : "";

  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 525_600) {
    return {
      success: false,
      error: "advance_time.minutes must be an integer between 1 and 525600",
    };
  }
  if (!reason) {
    return { success: false, error: "advance_time.reason is required" };
  }

  return {
    success: true,
    result: {
      minutes,
      reason,
      clockAdvanced: true,
    },
  };
}

function isWorldVersionConflict(error: unknown): error is WorldVersionConflictError {
  return error instanceof WorldVersionConflictError
    || (error instanceof Error && error.name === "WorldVersionConflictError");
}

function readStringField(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readIntegerField(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const value = (payload as Record<string, unknown>)[key];
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value;
}

function addStringRefs(target: Set<string>, values: readonly unknown[]): void {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) target.add(trimmed);
  }
}

function isSceneLocalLogEvent(toolName: string, result: ToolResult): boolean {
  return (toolName === "log_event" || toolName === "record_dialogue_outcome")
    && readStringField(result.result, "durability") === "scene_local";
}

function stateDeltaRefsForToolResult(input: {
  toolName: string;
  args: Record<string, unknown>;
  result: ToolResult;
}): string[] {
  const refs = new Set(
    input.toolName === "request_contested_outcome"
      ? []
      : inferRefsFromToolResultPayload(input.result.result),
  );
  const payload = input.result.result;
  switch (input.toolName) {
    case "add_tag":
    case "remove_tag":
      addStringRefs(refs, [
        input.args.entityName,
        input.args.entityType,
        readStringField(payload, "entity"),
      ]);
      break;
    case "set_relationship":
      addStringRefs(refs, [
        input.args.entityA,
        input.args.entityB,
        readStringField(payload, "entityA"),
        readStringField(payload, "entityB"),
      ]);
      break;
    case "add_chronicle_entry":
      addStringRefs(refs, [readStringField(payload, "entryId")]);
      break;
    case "log_event":
      addStringRefs(refs, [
        readStringField(payload, "eventId"),
        readStringField(payload, "durability"),
      ]);
      break;
    case "record_dialogue_outcome":
      addStringRefs(refs, [
        readStringField(payload, "eventId"),
        readStringField(payload, "outcomeKind"),
        readStringField(payload, "topicKind"),
        readStringField(payload, "futureUseKind"),
        readStringField(payload, "speakerRef"),
        readStringField(payload, "requestedRoleText"),
        readStringField(payload, "durability"),
      ]);
      break;
    case "record_world_fact":
      addStringRefs(refs, [
        readStringField(payload, "knowledgeId"),
        readStringField(payload, "factRef"),
        readStringField(payload, "factKind"),
        readStringField(payload, "topicKind"),
        readStringField(payload, "futureUseKind"),
        readStringField(payload, "durability"),
      ]);
      break;
    case "advance_time": {
      const minutes = readIntegerField(payload, "minutes");
      addStringRefs(refs, [
        "world_time",
        minutes !== null ? `elapsed:${minutes}` : null,
        readStringField(payload, "reason"),
      ]);
      break;
    }
    case "spawn_npc":
      addStringRefs(refs, [
        readStringField(payload, "id"),
        readStringField(payload, "name"),
        readStringField(payload, "locationId"),
        readStringField(payload, "broadLocationId"),
      ]);
      break;
    case "promote_npc":
      addStringRefs(refs, [
        readStringField(payload, "npcId"),
        readStringField(payload, "name"),
        readStringField(payload, "newTier"),
      ]);
      break;
    case "spawn_item":
      addStringRefs(refs, [
        readStringField(payload, "id"),
        readStringField(payload, "name"),
        readStringField(payload, "owner"),
      ]);
      break;
    case "reveal_location":
      addStringRefs(refs, [
        readStringField(payload, "id"),
        readStringField(payload, "name"),
        readStringField(payload, "parentLocationId"),
        readStringField(payload, "anchorLocationId"),
      ]);
      break;
    case "request_contested_outcome":
      break;
    case "set_condition":
      addStringRefs(refs, [readStringField(payload, "entity")]);
      break;
    case "move_to":
      addStringRefs(refs, [
        readStringField(payload, "locationId"),
        readStringField(payload, "locationName"),
      ]);
      break;
    case "move_actor":
      addStringRefs(refs, [
        readStringField(payload, "actorRef"),
        readStringField(payload, "destinationRef"),
        readStringField(payload, "locationId"),
        readStringField(payload, "locationName"),
      ]);
      break;
    case "create_minor_poi":
      addStringRefs(refs, [
        readStringField(payload, "id"),
        readStringField(payload, "name"),
        readStringField(payload, "poiType"),
        readStringField(payload, "anchorLocationId"),
        readStringField(payload, "areaRef"),
      ]);
      break;
    case "create_scene_extra":
      addStringRefs(refs, [
        readStringField(payload, "id"),
        readStringField(payload, "name"),
        readStringField(payload, "role"),
        readStringField(payload, "locationId"),
        readStringField(payload, "sceneLocationId"),
      ]);
      break;
    case "start_search":
      addStringRefs(refs, [
        readStringField(payload, "searchId"),
        readStringField(payload, "actorRef"),
        readStringField(payload, "query"),
      ]);
      break;
    case "record_player_intent":
      addStringRefs(refs, [
        readStringField(payload, "intentId"),
        readStringField(payload, "actorRef"),
        readStringField(payload, "intentType"),
        readStringField(payload, "targetHint"),
      ]);
      break;
    case "transfer_item":
      addStringRefs(refs, [
        readStringField(payload, "item"),
        readStringField(payload, "target"),
        readStringField(payload, "equipState"),
      ]);
      break;
  }
  return [...refs].slice(0, 32);
}

function runToolHandler(input: {
  campaignId: string;
  toolName: string;
  args: Record<string, unknown>;
  tick: number;
  outcomeTier?: string;
  executionContext?: ToolExecutionContext;
}): ToolResult | Promise<ToolResult> {
  switch (input.toolName) {
    case "add_tag":
      return handleAddTag(input.campaignId, input.args);
    case "remove_tag":
      return handleRemoveTag(input.campaignId, input.args);
    case "set_relationship":
      return handleSetRelationship(input.campaignId, input.args);
    case "add_chronicle_entry":
      return handleAddChronicleEntry(input.campaignId, input.args, input.tick);
    case "log_event":
      return handleLogEvent(input.campaignId, input.args, input.tick);
    case "record_dialogue_outcome":
      return handleRecordDialogueOutcome(input.campaignId, input.args, input.tick);
    case "record_world_fact":
      return handleRecordWorldFact(input.campaignId, input.args, input.executionContext);
    case "advance_time":
      return handleAdvanceTime(input.args);
    case "offer_quick_actions":
      return {
        success: true,
        result: { actions: input.args.actions },
      };
    case "spawn_npc":
      return handleSpawnNpc(input.campaignId, input.args, input.executionContext);
    case "promote_npc":
      return handlePromoteNpc(input.campaignId, input.args);
    case "spawn_item":
      return handleSpawnItem(input.campaignId, input.args);
    case "reveal_location":
      return handleRevealLocation(
        input.campaignId,
        input.args,
        input.tick,
        input.executionContext,
      );
    case "request_contested_outcome":
      return handleRequestContestedOutcome(input.campaignId, input.args);
    case "set_condition":
      return handleSetCondition(input.campaignId, input.args, input.outcomeTier);
    case "move_to":
      return handleMoveTo(input.campaignId, input.args, input.tick, input.executionContext);
    case "move_actor":
      return handleMoveActor(input.campaignId, input.args, input.tick, input.executionContext);
    case "create_minor_poi":
      return handleCreateMinorPoi(input.campaignId, input.args, input.tick, input.executionContext);
    case "create_scene_extra":
      return handleCreateSceneExtra(input.campaignId, input.args, input.executionContext);
    case "start_search":
      return handleStartSearch(input.args, input.executionContext);
    case "record_player_intent":
      return handleRecordPlayerIntent(input.args, input.executionContext);
    case "transfer_item":
      return handleTransferItem(input.campaignId, input.args);
    default:
      return { success: false, error: `Unknown tool: ${input.toolName}` };
  }
}

function finalizeAuthorityResult(input: {
  campaignId: string;
  toolName: string;
  args: Record<string, unknown>;
  tick: number;
  result: ToolResult;
  executionContext?: ToolExecutionContext;
}): ToolResult {
  const authority = input.executionContext?.authority;
  if (!authority || !STATE_BEARING_TOOLS.has(input.toolName)) {
    return input.result;
  }

  if (!input.result.success) {
    return attachToolResultAuthority(input.result, {
      campaignId: input.campaignId,
      sourceEntity: authority.sourceEntity,
      baseWorldVersion: authority.baseWorldVersion,
      elapsedWorldTimeMinutes: 0,
      stateDeltaRefs: [],
      eventRefs: [],
      witnesses: [],
      knowledgeOutputs: [],
      visibilityOutputs: [],
      resources: [],
      failureReason: input.result.error,
    });
  }

  if (isSceneLocalLogEvent(input.toolName, input.result)) {
    return attachToolResultAuthority(input.result, {
      campaignId: input.campaignId,
      sourceEntity: authority.sourceEntity,
      baseWorldVersion: authority.baseWorldVersion,
      elapsedWorldTimeMinutes: 0,
      stateDeltaRefs: ["scene_local_observation"],
      eventRefs: [],
      witnesses: [],
      knowledgeOutputs: [],
      visibilityOutputs: [],
      resources: [],
    });
  }

  const inferredRefs = stateDeltaRefsForToolResult(input);
  const elapsedWorldTimeMinutes =
    input.toolName === "advance_time"
      ? readIntegerField(input.result.result, "minutes") ?? 0
      : input.executionContext?.authority?.elapsedWorldTimeMinutes ?? 1;
  const trace = commitAuthorityTrace({
    campaignId: input.campaignId,
    operation: `tool:${input.toolName}`,
    baseWorldVersion: authority.baseWorldVersion,
    sourceEntity: authority.sourceEntity,
    elapsedWorldTimeMinutes,
    currentTick: input.tick,
    eventIds: inferredRefs.filter((ref) => /event|chronicle/i.test(ref)),
    stateDeltaRefs: inferredRefs,
    metadata: {
      toolName: input.toolName,
      args: input.args,
    },
  });

  return attachToolResultAuthority(input.result, {
    ...trace,
    eventRefs: trace.eventRefs,
    requireStateDelta: input.toolName !== "request_contested_outcome",
  });
}

// -- Main executor ------------------------------------------------------------

export async function executeToolCall(
  campaignId: string,
  toolName: string,
  args: Record<string, unknown>,
  tick: number,
  outcomeTier?: string,
  executionContext?: ToolExecutionContext,
): Promise<ToolResult> {
  const toolCallStart = Date.now();
  let resultForLog: ToolResult = { success: false, error: "Tool execution did not complete" };
  try {
    if (executionContext) {
      const groundingIssue = validateToolInputGrounding({
        toolName: toolName as RuntimeToolName,
        toolInput: args,
        context: executionContext,
      });
      if (groundingIssue) {
        resultForLog = {
          success: false,
          error: `Tool grounding failed: ${groundingIssue.message}`,
        };
        return resultForLog;
      }
    }

    const hasAuthority = Boolean(
      executionContext?.authority && STATE_BEARING_TOOLS.has(toolName),
    );
    if (hasAuthority && SYNC_SQLITE_STATE_BEARING_TOOLS.has(toolName)) {
      resultForLog = getDb().transaction(() => {
        validateBaseWorldVersion({
          campaignId,
          baseWorldVersion: executionContext!.authority!.baseWorldVersion,
          currentTick: tick,
        });
        const handlerResult = runToolHandler({
          campaignId,
          toolName,
          args,
          tick,
          outcomeTier,
          executionContext,
        }) as ToolResult;
        return finalizeAuthorityResult({
          campaignId,
          toolName,
          args,
          tick,
          result: handlerResult,
          executionContext,
        });
      });
      return resultForLog;
    }

    if (hasAuthority) {
      try {
        validateBaseWorldVersion({
          campaignId,
          baseWorldVersion: executionContext!.authority!.baseWorldVersion,
          currentTick: tick,
        });
      } catch (error) {
        if (isWorldVersionConflict(error)) {
          resultForLog = attachToolResultAuthority(
            buildValidationFailureToolResult(error.message),
            {
              campaignId,
              sourceEntity: executionContext!.authority!.sourceEntity,
              baseWorldVersion: executionContext!.authority!.baseWorldVersion,
              elapsedWorldTimeMinutes: 0,
              stateDeltaRefs: [],
              eventRefs: [],
              witnesses: [],
              knowledgeOutputs: [],
              visibilityOutputs: [],
              resources: [],
              failureReason: error.message,
            },
          );
          return resultForLog;
        }
        throw error;
      }
    }

    resultForLog = await runToolHandler({
      campaignId,
      toolName,
      args,
      tick,
      executionContext,
      outcomeTier,
    });
    resultForLog = finalizeAuthorityResult({
      campaignId,
      toolName,
      args,
      tick,
      result: resultForLog,
      executionContext,
    });
    return resultForLog;
  } catch (error) {
    if (executionContext?.authority && isWorldVersionConflict(error)) {
      resultForLog = attachToolResultAuthority(
        buildValidationFailureToolResult(error.message),
        {
          campaignId,
          sourceEntity: executionContext.authority.sourceEntity,
          baseWorldVersion: executionContext.authority.baseWorldVersion,
          elapsedWorldTimeMinutes: 0,
          stateDeltaRefs: [],
          eventRefs: [],
          witnesses: [],
          knowledgeOutputs: [],
          visibilityOutputs: [],
          resources: [],
          failureReason: error.message,
        },
      );
      return resultForLog;
    }
    log.error(`Tool execution failed: ${toolName}`, error);
    resultForLog = {
      success: false,
      error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
    return resultForLog;
  } finally {
    log.event("tool.call", {
      toolName,
      args,
      result: resultForLog,
      latencyMs: Date.now() - toolCallStart,
    });
  }
}
