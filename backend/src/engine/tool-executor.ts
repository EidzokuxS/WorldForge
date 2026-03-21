/**
 * Tool executor: validates and executes Storyteller tool calls against the DB.
 *
 * Every tool call returns a ToolResult (never throws). Invalid entity references
 * return error results so the Storyteller can retry with corrected arguments.
 */

import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  players,
  npcs,
  locations,
  items,
  factions,
  relationships,
  chronicle,
} from "../db/schema.js";
import { storeEpisodicEvent } from "../vectors/episodic-events.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("tool-executor");

// -- Types --------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

type EntityType = "player" | "npc" | "location" | "item" | "faction";

const ENTITY_TYPE_TABLE_MAP = {
  player: players,
  npc: npcs,
  location: locations,
  item: items,
  faction: factions,
} as const;

// -- Entity resolution --------------------------------------------------------

function resolveEntity(
  campaignId: string,
  entityName: string,
  entityType: EntityType
): { id: string; name: string; tags: string } | null {
  const table = ENTITY_TYPE_TABLE_MAP[entityType];
  if (!table) return null;

  const db = getDb();
  const row = db
    .select({ id: table.id, name: table.name, tags: table.tags })
    .from(table)
    .where(
      sql`${table.campaignId} = ${campaignId} AND LOWER(${table.name}) = LOWER(${entityName})`
    )
    .get();

  return row ?? null;
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

  for (const table of tables) {
    const row = db
      .select({ id: table.id })
      .from(table)
      .where(
        sql`${table.campaignId} = ${campaignId} AND LOWER(${table.name}) = LOWER(${entityName})`
      )
      .get();

    if (row) return row.id;
  }

  return null;
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

// -- Character resolution helper (search players then npcs) -------------------

function resolveCharacterByName(
  campaignId: string,
  name: string
): { id: string; name: string; table: "players" | "npcs"; hp?: number } | null {
  const db = getDb();

  // Search players first
  const player = db
    .select({ id: players.id, name: players.name, hp: players.hp })
    .from(players)
    .where(
      sql`${players.campaignId} = ${campaignId} AND LOWER(${players.name}) = LOWER(${name})`
    )
    .get();

  if (player) return { id: player.id, name: player.name, table: "players", hp: player.hp };

  // Then npcs
  const npc = db
    .select({ id: npcs.id, name: npcs.name })
    .from(npcs)
    .where(
      sql`${npcs.campaignId} = ${campaignId} AND LOWER(${npcs.name}) = LOWER(${name})`
    )
    .get();

  if (npc) return { id: npc.id, name: npc.name, table: "npcs" };

  return null;
}

// -- Tool handlers ------------------------------------------------------------

async function handleAddTag(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const entityName = args.entityName as string;
  const entityType = args.entityType as string;
  const tag = args.tag as string;

  if (!(entityType in ENTITY_TYPE_TABLE_MAP)) {
    return { success: false, error: `Invalid entity type: ${entityType}` };
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

  return {
    success: true,
    result: { entity: entity.name, tags: currentTags },
  };
}

async function handleRemoveTag(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const entityName = args.entityName as string;
  const entityType = args.entityType as string;
  const tag = args.tag as string;

  if (!(entityType in ENTITY_TYPE_TABLE_MAP)) {
    return { success: false, error: `Invalid entity type: ${entityType}` };
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

  return {
    success: true,
    result: { entity: entity.name, tags: currentTags },
  };
}

async function handleSetRelationship(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
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

async function handleAddChronicleEntry(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number
): Promise<ToolResult> {
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

  try {
    const eventId = await storeEpisodicEvent(campaignId, {
      text,
      tick,
      location: "",
      participants,
      importance,
      type: "event",
    });

    return {
      success: true,
      result: { eventId },
    };
  } catch (error) {
    log.warn("Failed to store episodic event", error);
    return {
      success: false,
      error: `Failed to store episodic event: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

// -- New tool handlers --------------------------------------------------------

async function handleSpawnNpc(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = args.name as string;
  const tags = args.tags as string[];
  const locationName = args.locationName as string;

  const location = resolveEntity(campaignId, locationName, "location");
  if (!location) {
    return { success: false, error: `Location not found: ${locationName}` };
  }

  const id = crypto.randomUUID();
  const db = getDb();
  db.insert(npcs)
    .values({
      id,
      campaignId,
      name,
      persona: tags.join(", "),
      tags: JSON.stringify(tags),
      tier: "temporary",
      currentLocationId: location.id,
      goals: '{"short_term":[],"long_term":[]}',
      beliefs: "[]",
      unprocessedImportance: 0,
      inactiveTicks: 0,
      createdAt: Date.now(),
    })
    .run();

  return {
    success: true,
    result: { id, name, location: location.name },
  };
}

async function handleSpawnItem(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
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
      })
      .run();

    return {
      success: true,
      result: { id, name, owner: character.name, ownerType: "character" },
    };
  }

  if (ownerType === "location") {
    const location = resolveEntity(campaignId, ownerName, "location");
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
      })
      .run();

    return {
      success: true,
      result: { id, name, owner: location.name, ownerType: "location" },
    };
  }

  return { success: false, error: `Invalid ownerType: ${ownerType}` };
}

async function handleRevealLocation(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const name = args.name as string;
  const description = args.description as string;
  const tags = args.tags as string[];
  const connectedToName = args.connectedToName as string;

  const existingLocation = resolveEntity(campaignId, connectedToName, "location");
  if (!existingLocation) {
    return { success: false, error: `Connected location not found: ${connectedToName}` };
  }

  const id = crypto.randomUUID();
  const db = getDb();

  // Insert new location connected to existing one
  db.insert(locations)
    .values({
      id,
      campaignId,
      name,
      description,
      tags: JSON.stringify(tags),
      isStarting: false,
      connectedTo: JSON.stringify([existingLocation.id]),
    })
    .run();

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

  return {
    success: true,
    result: { id, name, connectedTo: existingLocation.name },
  };
}

async function handleMoveTo(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const targetLocationName = args.targetLocationName as string;

  const db = getDb();
  const player = db
    .select()
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  if (!player) return { success: false, error: "No player found" };
  if (!player.currentLocationId) return { success: false, error: "Player has no current location" };

  // Resolve destination by name (case-insensitive)
  const destination = db
    .select()
    .from(locations)
    .where(
      sql`${locations.campaignId} = ${campaignId} AND LOWER(${locations.name}) = LOWER(${targetLocationName})`
    )
    .get();

  if (!destination) return { success: false, error: `Location not found: ${targetLocationName}` };

  // Check connectivity
  const currentLoc = db
    .select({ connectedTo: locations.connectedTo })
    .from(locations)
    .where(eq(locations.id, player.currentLocationId))
    .get();

  let connectedIds: string[] = [];
  if (currentLoc) {
    try {
      connectedIds = JSON.parse(currentLoc.connectedTo) as string[];
    } catch {
      connectedIds = [];
    }
  }

  if (!connectedIds.includes(destination.id)) {
    // List available paths for LLM retry
    const allLocs = db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const reachable = allLocs
      .filter((l) => connectedIds.includes(l.id))
      .map((l) => l.name);
    return {
      success: false,
      error: `${targetLocationName} is not connected to current location. Available paths: ${reachable.join(", ")}`,
    };
  }

  // Move player
  db.update(players)
    .set({ currentLocationId: destination.id })
    .where(eq(players.id, player.id))
    .run();

  return {
    success: true,
    result: { locationId: destination.id, locationName: destination.name },
  };
}

async function handleSetCondition(
  campaignId: string,
  args: Record<string, unknown>,
  outcomeTier?: string
): Promise<ToolResult> {
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
  db.update(players)
    .set({ hp: newHp })
    .where(eq(players.id, character.id))
    .run();

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

async function handleTransferItem(
  campaignId: string,
  args: Record<string, unknown>
): Promise<ToolResult> {
  const itemName = args.itemName as string;
  const targetName = args.targetName as string;
  const targetType = args.targetType as string;

  const db = getDb();

  // Resolve item by name
  const item = db
    .select({ id: items.id, name: items.name })
    .from(items)
    .where(
      sql`${items.campaignId} = ${campaignId} AND LOWER(${items.name}) = LOWER(${itemName})`
    )
    .get();

  if (!item) {
    return { success: false, error: `Item not found: ${itemName}` };
  }

  if (targetType === "character") {
    const character = resolveCharacterByName(campaignId, targetName);
    if (!character) {
      return { success: false, error: `Character not found: ${targetName}` };
    }

    db.update(items)
      .set({ ownerId: character.id, locationId: null })
      .where(eq(items.id, item.id))
      .run();

    return {
      success: true,
      result: { item: item.name, target: character.name, action: "transferred to character" },
    };
  }

  if (targetType === "location") {
    const location = resolveEntity(campaignId, targetName, "location");
    if (!location) {
      return { success: false, error: `Location not found: ${targetName}` };
    }

    db.update(items)
      .set({ ownerId: null, locationId: location.id })
      .where(eq(items.id, item.id))
      .run();

    return {
      success: true,
      result: { item: item.name, target: location.name, action: "transferred to location" },
    };
  }

  return { success: false, error: `Invalid targetType: ${targetType}` };
}

// -- Main executor ------------------------------------------------------------

export async function executeToolCall(
  campaignId: string,
  toolName: string,
  args: Record<string, unknown>,
  tick: number,
  outcomeTier?: string
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "add_tag":
        return await handleAddTag(campaignId, args);
      case "remove_tag":
        return await handleRemoveTag(campaignId, args);
      case "set_relationship":
        return await handleSetRelationship(campaignId, args);
      case "add_chronicle_entry":
        return await handleAddChronicleEntry(campaignId, args, tick);
      case "log_event":
        return await handleLogEvent(campaignId, args, tick);
      case "offer_quick_actions":
        return {
          success: true,
          result: { actions: args.actions },
        };
      case "spawn_npc":
        return await handleSpawnNpc(campaignId, args);
      case "spawn_item":
        return await handleSpawnItem(campaignId, args);
      case "reveal_location":
        return await handleRevealLocation(campaignId, args);
      case "set_condition":
        return await handleSetCondition(campaignId, args, outcomeTier);
      case "move_to":
        return await handleMoveTo(campaignId, args);
      case "transfer_item":
        return await handleTransferItem(campaignId, args);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  } catch (error) {
    log.error(`Tool execution failed: ${toolName}`, error);
    return {
      success: false,
      error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
