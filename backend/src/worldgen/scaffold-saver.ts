import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  campaigns,
  factions,
  locations,
  npcs,
  relationships,
} from "../db/schema.js";
import type { WorldScaffold } from "./types.js";

type DbInstance = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];

interface BaseContext {
  tx: Tx;
  campaignId: string;
}

interface InsertContext extends BaseContext {
  locationIds: Map<string, string>;
  factionIds: Map<string, string>;
  npcIds: Map<string, string>;
}

function clearExistingScaffold({ tx, campaignId }: BaseContext): void {
  tx.delete(relationships).where(eq(relationships.campaignId, campaignId)).run();
  tx.delete(npcs).where(eq(npcs.campaignId, campaignId)).run();
  tx.delete(factions).where(eq(factions.campaignId, campaignId)).run();
  tx.delete(locations).where(eq(locations.campaignId, campaignId)).run();
}

function insertLocations(
  { tx, campaignId }: BaseContext,
  scaffoldLocations: WorldScaffold["locations"]
): Map<string, string> {
  const locationIds = new Map<string, string>();
  for (const location of scaffoldLocations) {
    const id = crypto.randomUUID();
    locationIds.set(location.name, id);
    tx.insert(locations)
      .values({
        id,
        campaignId,
        name: location.name,
        description: location.description,
        tags: JSON.stringify(location.tags),
        isStarting: location.isStarting ?? false,
        connectedTo: "[]",
      })
      .run();
  }
  return locationIds;
}

function updateAdjacency(
  tx: Tx,
  scaffoldLocations: WorldScaffold["locations"],
  locationIds: Map<string, string>,
): void {
  const adjacency = new Map<string, Set<string>>();

  for (const location of scaffoldLocations) {
    const locationId = locationIds.get(location.name);
    if (!locationId) continue;

    if (!adjacency.has(locationId)) {
      adjacency.set(locationId, new Set());
    }

    for (const connectionName of location.connectedTo) {
      const connectionId = locationIds.get(connectionName);
      if (!connectionId) continue;

      adjacency.get(locationId)!.add(connectionId);
      if (!adjacency.has(connectionId)) {
        adjacency.set(connectionId, new Set());
      }
      adjacency.get(connectionId)!.add(locationId);
    }
  }

  for (const [locationId, connectedSet] of adjacency) {
    tx.update(locations)
      .set({ connectedTo: JSON.stringify([...connectedSet]) })
      .where(eq(locations.id, locationId))
      .run();
  }
}

function insertFactions(
  { tx, campaignId }: BaseContext,
  scaffoldFactions: WorldScaffold["factions"]
): Map<string, string> {
  const factionIds = new Map<string, string>();
  for (const faction of scaffoldFactions) {
    const id = crypto.randomUUID();
    factionIds.set(faction.name, id);
    tx.insert(factions)
      .values({
        id,
        campaignId,
        name: faction.name,
        tags: JSON.stringify(faction.tags),
        goals: JSON.stringify(faction.goals),
        assets: JSON.stringify(faction.assets),
      })
      .run();
  }
  return factionIds;
}

function insertNpcs(
  { tx, campaignId }: BaseContext,
  scaffoldNpcs: WorldScaffold["npcs"],
  locationIds: Map<string, string>,
): Map<string, string> {
  const npcIds = new Map<string, string>();
  for (const npc of scaffoldNpcs) {
    const id = crypto.randomUUID();
    npcIds.set(npc.name, id);
    tx.insert(npcs)
      .values({
        id,
        campaignId,
        name: npc.name,
        persona: npc.persona,
        tags: JSON.stringify(npc.tags),
        tier: "key",
        currentLocationId: locationIds.get(npc.locationName) ?? null,
        goals: JSON.stringify({
          short_term: npc.goals.shortTerm,
          long_term: npc.goals.longTerm,
        }),
        beliefs: "{}",
        createdAt: Date.now(),
      })
      .run();
  }
  return npcIds;
}

function insertMembershipRelationships(
  ctx: InsertContext,
  scaffoldNpcs: WorldScaffold["npcs"]
): void {
  for (const npc of scaffoldNpcs) {
    if (!npc.factionName) continue;
    const npcId = ctx.npcIds.get(npc.name);
    const factionId = ctx.factionIds.get(npc.factionName);
    if (!npcId || !factionId) continue;

    ctx.tx.insert(relationships)
      .values({
        id: crypto.randomUUID(),
        campaignId: ctx.campaignId,
        entityA: npcId,
        entityB: factionId,
        tags: JSON.stringify(["Member"]),
        reason: `${npc.name} belongs to ${npc.factionName}`,
      })
      .run();
  }
}

function insertTerritoryRelationships(
  ctx: InsertContext,
  scaffoldFactions: WorldScaffold["factions"]
): void {
  for (const faction of scaffoldFactions) {
    const factionId = ctx.factionIds.get(faction.name);
    if (!factionId) continue;

    for (const territoryName of new Set(faction.territoryNames)) {
      const locationId = ctx.locationIds.get(territoryName);
      if (!locationId) continue;

      ctx.tx.insert(relationships)
        .values({
          id: crypto.randomUUID(),
          campaignId: ctx.campaignId,
          entityA: factionId,
          entityB: locationId,
          tags: JSON.stringify(["Controls"]),
          reason: `${faction.name} controls ${territoryName}`,
        })
        .run();
    }
  }
}

export function saveScaffoldToDb(
  campaignId: string,
  scaffold: WorldScaffold
): void {
  const db = getDb();

  db.transaction((tx) => {
    const base: BaseContext = { tx, campaignId };
    clearExistingScaffold(base);

    const locationIds = insertLocations(base, scaffold.locations);
    updateAdjacency(tx, scaffold.locations, locationIds);

    const factionIds = insertFactions(base, scaffold.factions);
    const npcIds = insertNpcs(base, scaffold.npcs, locationIds);

    const ctx: InsertContext = { ...base, locationIds, factionIds, npcIds };
    insertMembershipRelationships(ctx, scaffold.npcs);
    insertTerritoryRelationships(ctx, scaffold.factions);

    tx.update(campaigns)
      .set({ premise: scaffold.refinedPremise, updatedAt: Date.now() })
      .where(eq(campaigns.id, campaignId))
      .run();
  });
}
