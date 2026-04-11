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

const log = createLogger("tool-executor");

// -- Types --------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  result?: unknown;
  error?: string;
}

type EntityType = "player" | "npc" | "location" | "item" | "faction";
type CharacterEntityType = "player" | "npc";

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
      traits: removeInsensitive(record.capabilities.traits, trimmed),
      flaws: removeInsensitive(record.capabilities.flaws, trimmed),
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

  if (entityType === "player") {
    const row = db
      .select()
      .from(players)
      .where(
        sql`${players.campaignId} = ${campaignId} AND LOWER(${players.name}) = LOWER(${entityName})`
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
      sql`${npcs.campaignId} = ${campaignId} AND LOWER(${npcs.name}) = LOWER(${entityName})`
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
        ? JSON.parse(projectPlayerRecord(character.record).tags) as string[]
        : JSON.parse(projectNpcRecord(character.record).tags) as string[];

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
        ? JSON.parse(projectPlayerRecord(character.record).tags) as string[]
        : JSON.parse(projectNpcRecord(character.record).tags) as string[];

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
    await accumulateReflectionBudget(campaignId, participants, importance);

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

function handleSpawnNpc(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const name = args.name as string;
  const tags = args.tags as string[];
  const locationName = args.locationName as string;

  const location = resolveEntity(campaignId, locationName, "location");
  if (!location) {
    return { success: false, error: `Location not found: ${locationName}` };
  }

  const id = crypto.randomUUID();
  const draft = fromLegacyScaffoldNpc(
    {
      name,
      persona: tags.join(", "),
      tags,
      goals: { shortTerm: [], longTerm: [] },
      locationName,
      factionName: null,
      tier: "supporting",
    },
    { currentLocationName: location.name, sourceKind: "generator" },
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
        currentLocationId: location.id,
        currentLocationName: location.name,
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

function handleRevealLocation(
  campaignId: string,
  args: Record<string, unknown>
): ToolResult {
  const name = args.name as string;
  const description = args.description as string;
  const tags = args.tags as string[];
  const connectedToName = args.connectedToName as string;

  const existingLocation = resolveLocationTarget({
    targetName: connectedToName,
    locations: loadLocationGraph({ campaignId }).locations,
  });
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
      kind: "ephemeral_scene",
      anchorLocationId: existingLocation.locationId,
      persistence: "ephemeral",
      tags: JSON.stringify(tags),
      isStarting: false,
      connectedTo: JSON.stringify([existingLocation.locationId]),
    })
    .run();

  db.insert(locationEdges)
    .values([
      {
        id: crypto.randomUUID(),
        campaignId,
        fromLocationId: existingLocation.locationId,
        toLocationId: id,
        travelCost: 1,
        discovered: true,
      },
      {
        id: crypto.randomUUID(),
        campaignId,
        fromLocationId: id,
        toLocationId: existingLocation.locationId,
        travelCost: 1,
        discovered: true,
      },
    ])
    .run();

  // Update existing location's connectedTo to include new location (bidirectional)
  const existingRow = db
    .select({ connectedTo: locations.connectedTo })
    .from(locations)
    .where(eq(locations.id, existingLocation.locationId))
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
    .where(eq(locations.id, existingLocation.locationId))
    .run();

  return {
    success: true,
    result: { id, name, connectedTo: existingLocation.locationName },
  };
}

function handleMoveTo(
  campaignId: string,
  args: Record<string, unknown>,
  tick: number,
): ToolResult {
  const targetLocationName = args.targetLocationName as string;

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
    targetName: targetLocationName,
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
    .set(projectPlayerRecord({
      ...updatedPlayer,
      socialContext: {
        ...updatedPlayer.socialContext,
        currentLocationId: destination.locationId,
        currentLocationName: destinationName,
      },
    }))
    .where(eq(players.id, player.id))
    .run();

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
        return await handleMoveTo(campaignId, args, tick);
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
