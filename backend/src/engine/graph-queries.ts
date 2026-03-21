/**
 * Multi-hop relationship graph traversal via SQL JOINs.
 *
 * BFS from seed entity IDs up to maxDepth hops, resolving entity names
 * from players, npcs, locations, and factions tables.
 */

import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  relationships,
  players,
  npcs,
  locations,
  factions,
} from "../db/schema.js";

export interface GraphNode {
  entityId: string;
  entityName: string;
  relationships: Array<{
    targetId: string;
    targetName: string;
    tags: string[];
    reason: string | null;
  }>;
}

/**
 * Resolve an entity ID to its display name by querying all entity tables.
 */
function resolveEntityName(
  nameCache: Map<string, string>,
  id: string,
): string {
  const cached = nameCache.get(id);
  if (cached !== undefined) return cached;
  return id; // Fallback to raw ID
}

/**
 * Build a name cache for all entities in a campaign.
 * Queries players, npcs, locations, factions once upfront.
 */
function buildNameCache(campaignId: string): Map<string, string> {
  const db = getDb();
  const cache = new Map<string, string>();

  const playerRows = db
    .select({ id: players.id, name: players.name })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .all();
  for (const r of playerRows) cache.set(r.id, r.name);

  const npcRows = db
    .select({ id: npcs.id, name: npcs.name })
    .from(npcs)
    .where(eq(npcs.campaignId, campaignId))
    .all();
  for (const r of npcRows) cache.set(r.id, r.name);

  const locRows = db
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(eq(locations.campaignId, campaignId))
    .all();
  for (const r of locRows) cache.set(r.id, r.name);

  const facRows = db
    .select({ id: factions.id, name: factions.name })
    .from(factions)
    .where(eq(factions.campaignId, campaignId))
    .all();
  for (const r of facRows) cache.set(r.id, r.name);

  return cache;
}

/**
 * Traverse the relationship graph via BFS from seed entity IDs.
 *
 * @param campaignId - campaign to query
 * @param entityIds - starting entity IDs (e.g., NPC IDs at current location)
 * @param maxDepth - maximum hops (default 2: direct + one transitive)
 * @returns array of GraphNodes with resolved names and relationship details
 */
export function getRelationshipGraph(
  campaignId: string,
  entityIds: string[],
  maxDepth: number = 2,
): GraphNode[] {
  if (entityIds.length === 0) return [];

  const db = getDb();
  const nameCache = buildNameCache(campaignId);

  // Load all campaign relationships once
  const allRels = db
    .select()
    .from(relationships)
    .where(eq(relationships.campaignId, campaignId))
    .all();

  if (allRels.length === 0) return [];

  // BFS traversal
  const visited = new Set<string>();
  const nodeMap = new Map<string, GraphNode>();
  let frontier = [...entityIds];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const nextFrontier: string[] = [];

    for (const entityId of frontier) {
      if (visited.has(entityId)) continue;
      visited.add(entityId);

      const entityName = resolveEntityName(nameCache, entityId);
      const rels: GraphNode["relationships"] = [];

      for (const rel of allRels) {
        let targetId: string | null = null;

        if (rel.entityA === entityId) {
          targetId = rel.entityB;
        } else if (rel.entityB === entityId) {
          targetId = rel.entityA;
        }

        if (targetId === null) continue;

        let tags: string[] = [];
        try {
          const parsed = JSON.parse(rel.tags) as unknown;
          if (Array.isArray(parsed)) {
            tags = parsed.filter((t): t is string => typeof t === "string");
          }
        } catch {
          // ignore malformed tags
        }

        rels.push({
          targetId,
          targetName: resolveEntityName(nameCache, targetId),
          tags,
          reason: rel.reason,
        });

        if (!visited.has(targetId)) {
          nextFrontier.push(targetId);
        }
      }

      if (rels.length > 0) {
        nodeMap.set(entityId, { entityId, entityName, relationships: rels });
      }
    }

    frontier = nextFrontier;
  }

  return Array.from(nodeMap.values());
}
