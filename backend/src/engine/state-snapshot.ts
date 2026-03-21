/**
 * State snapshot: captures pre-turn game state for undo/retry rollback.
 *
 * Before each turn, captureSnapshot() saves the player's HP, tags, location,
 * equipped items, and current tick. After the turn, spawned entity IDs are
 * recorded into the snapshot. restoreSnapshot() reverts player state and
 * deletes any entities created during the rolled-back turn.
 */

import { eq, inArray } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  players,
  npcs,
  items,
  locations,
  relationships,
  chronicle,
} from "../db/schema.js";
import { readCampaignConfig } from "../campaign/manager.js";
import { getCampaignDir } from "../campaign/paths.js";
import { createLogger } from "../lib/index.js";
import fs from "node:fs";
import path from "node:path";

const log = createLogger("state-snapshot");

// -- Types --------------------------------------------------------------------

export interface TurnSnapshot {
  playerHp: number;
  playerTags: string;
  playerLocationId: string | null;
  playerEquippedItems: string;
  tick: number;
  // IDs of entities created during the turn (for deletion on rollback)
  spawnedNpcIds: string[];
  spawnedItemIds: string[];
  revealedLocationIds: string[];
  createdRelationshipIds: string[];
  createdChronicleIds: string[];
}

// -- Capture ------------------------------------------------------------------

/**
 * Capture the current player state and tick before a turn begins.
 * All spawned* arrays start empty and should be populated during the turn
 * by tracking tool call results.
 */
export function captureSnapshot(campaignId: string): TurnSnapshot {
  const db = getDb();

  const player = db
    .select({
      hp: players.hp,
      tags: players.tags,
      currentLocationId: players.currentLocationId,
      equippedItems: players.equippedItems,
    })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  const config = readCampaignConfig(campaignId);
  const tick = config.currentTick ?? 0;

  return {
    playerHp: player?.hp ?? 5,
    playerTags: player?.tags ?? "[]",
    playerLocationId: player?.currentLocationId ?? null,
    playerEquippedItems: player?.equippedItems ?? "[]",
    tick,
    spawnedNpcIds: [],
    spawnedItemIds: [],
    revealedLocationIds: [],
    createdRelationshipIds: [],
    createdChronicleIds: [],
  };
}

// -- Restore ------------------------------------------------------------------

/**
 * Restore player state from a snapshot and delete any entities spawned
 * during the rolled-back turn.
 */
export function restoreSnapshot(
  campaignId: string,
  snapshot: TurnSnapshot
): void {
  const db = getDb();

  // 1. Restore player state
  db.update(players)
    .set({
      hp: snapshot.playerHp,
      tags: snapshot.playerTags,
      currentLocationId: snapshot.playerLocationId,
      equippedItems: snapshot.playerEquippedItems,
    })
    .where(eq(players.campaignId, campaignId))
    .run();

  // 2. Restore tick in config.json
  const config = readCampaignConfig(campaignId);
  const campaignDir = getCampaignDir(campaignId);
  const configPath = path.join(campaignDir, "config.json");
  const updatedConfig = { ...config, currentTick: snapshot.tick };
  fs.writeFileSync(configPath, JSON.stringify(updatedConfig, null, 2), "utf-8");

  // 3. Delete spawned NPCs
  if (snapshot.spawnedNpcIds.length > 0) {
    for (const id of snapshot.spawnedNpcIds) {
      db.delete(npcs).where(eq(npcs.id, id)).run();
    }
    log.info(`Deleted ${snapshot.spawnedNpcIds.length} spawned NPCs`);
  }

  // 4. Delete spawned items
  if (snapshot.spawnedItemIds.length > 0) {
    for (const id of snapshot.spawnedItemIds) {
      db.delete(items).where(eq(items.id, id)).run();
    }
    log.info(`Deleted ${snapshot.spawnedItemIds.length} spawned items`);
  }

  // 5. Delete revealed locations (clean up bidirectional connections first)
  if (snapshot.revealedLocationIds.length > 0) {
    for (const locId of snapshot.revealedLocationIds) {
      // Read the location to find its connections
      const loc = db
        .select({ connectedTo: locations.connectedTo })
        .from(locations)
        .where(eq(locations.id, locId))
        .get();

      if (loc) {
        // Parse adjacent location IDs
        let adjacentIds: string[] = [];
        try {
          adjacentIds = JSON.parse(loc.connectedTo) as string[];
        } catch {
          adjacentIds = [];
        }

        // Remove this location from each adjacent location's connectedTo
        for (const adjId of adjacentIds) {
          const adj = db
            .select({ connectedTo: locations.connectedTo })
            .from(locations)
            .where(eq(locations.id, adjId))
            .get();

          if (adj) {
            let adjConnections: string[] = [];
            try {
              adjConnections = JSON.parse(adj.connectedTo) as string[];
            } catch {
              adjConnections = [];
            }

            const filtered = adjConnections.filter((id) => id !== locId);
            db.update(locations)
              .set({ connectedTo: JSON.stringify(filtered) })
              .where(eq(locations.id, adjId))
              .run();
          }
        }
      }

      // Delete the location itself
      db.delete(locations).where(eq(locations.id, locId)).run();
    }
    log.info(
      `Deleted ${snapshot.revealedLocationIds.length} revealed locations`
    );
  }

  // 6. Delete created relationships
  if (snapshot.createdRelationshipIds.length > 0) {
    for (const id of snapshot.createdRelationshipIds) {
      db.delete(relationships).where(eq(relationships.id, id)).run();
    }
    log.info(
      `Deleted ${snapshot.createdRelationshipIds.length} created relationships`
    );
  }

  // 7. Delete created chronicle entries
  if (snapshot.createdChronicleIds.length > 0) {
    for (const id of snapshot.createdChronicleIds) {
      db.delete(chronicle).where(eq(chronicle.id, id)).run();
    }
    log.info(
      `Deleted ${snapshot.createdChronicleIds.length} chronicle entries`
    );
  }

  log.info(`Snapshot restored for campaign ${campaignId}, tick=${snapshot.tick}`);
}
