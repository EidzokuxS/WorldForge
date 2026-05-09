import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "../db/index.js";
import {
  createCharacterRecordFromDraft,
  fromLegacyScaffoldNpc,
  reconcileDraftBackedScaffoldNpc,
  toLegacyNpcDraft,
} from "../character/record-adapters.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import {
  campaigns,
  factions,
  items,
  locationEdges,
  locationRecentEvents,
  locations,
  npcs,
  players,
  relationships,
} from "../db/schema.js";
import type { WorldScaffold } from "./types.js";

type DbInstance = ReturnType<typeof getDb>;
type Tx = Parameters<Parameters<DbInstance["transaction"]>[0]>[0];
type ScaffoldLocation = WorldScaffold["locations"][number];
type ScaffoldLocationKind = NonNullable<ScaffoldLocation["kind"]>;

interface LocationPersistenceEntry {
  id: string;
  location: ScaffoldLocation;
  kind: ScaffoldLocationKind;
  parentLocationId: string | null;
}

interface LocationPersistencePlan {
  entries: LocationPersistenceEntry[];
  locationIds: Map<string, string>;
  locationEntriesByName: Map<string, LocationPersistenceEntry>;
}

interface NpcPlacement {
  currentLocationId: string | null;
  currentLocationName: string;
  currentSceneLocationId: string | null;
}

interface BaseContext {
  tx: Tx;
  campaignId: string;
}

interface InsertContext extends BaseContext {
  locationIds: Map<string, string>;
  factionIds: Map<string, string>;
  npcIds: Map<string, string>;
  relationshipKeys: Set<string>;
}

function insertScaffoldRelationship(
  ctx: InsertContext,
  relationship: {
    entityA: string;
    entityB: string;
    tags: string[];
    reason: string;
  },
): void {
  const key = `${relationship.entityA}\u0000${relationship.entityB}`;
  if (ctx.relationshipKeys.has(key)) return;
  ctx.relationshipKeys.add(key);

  ctx.tx.insert(relationships)
    .values({
      id: crypto.randomUUID(),
      campaignId: ctx.campaignId,
      entityA: relationship.entityA,
      entityB: relationship.entityB,
      tags: JSON.stringify(relationship.tags),
      reason: relationship.reason,
    })
    .run();
}

function normalizeLocationKind(location: ScaffoldLocation): ScaffoldLocationKind {
  return location.kind === "persistent_sublocation"
    ? "persistent_sublocation"
    : "macro";
}

function buildLocationPersistencePlan(
  scaffoldLocations: WorldScaffold["locations"],
): LocationPersistencePlan {
  const seenLocationNames = new Set<string>();
  for (const location of scaffoldLocations) {
    if (seenLocationNames.has(location.name)) {
      throw new Error(`Duplicate scaffold location name "${location.name}".`);
    }
    seenLocationNames.add(location.name);
  }

  const locationIds = new Map<string, string>();
  for (const location of scaffoldLocations) {
    locationIds.set(location.name, crypto.randomUUID());
  }

  const kindsByName = new Map<string, ScaffoldLocationKind>();
  for (const location of scaffoldLocations) {
    kindsByName.set(location.name, normalizeLocationKind(location));
  }

  const entries: LocationPersistenceEntry[] = [];
  const locationEntriesByName = new Map<string, LocationPersistenceEntry>();

  for (const location of scaffoldLocations) {
    const id = locationIds.get(location.name);
    if (!id) {
      throw new Error(`Missing generated location id for "${location.name}".`);
    }

    const kind = normalizeLocationKind(location);
    const parentLocationName = location.parentLocationName ?? null;
    let parentLocationId: string | null = null;

    if (kind === "persistent_sublocation") {
      if (!parentLocationName) {
        throw new Error(
          `Invalid parentLocationName for persistent sublocation "${location.name}".`,
        );
      }
      const parentKind = kindsByName.get(parentLocationName);
      const resolvedParentId = locationIds.get(parentLocationName);
      if (!resolvedParentId || parentKind !== "macro") {
        throw new Error(
          `Invalid parentLocationName "${parentLocationName}" for persistent sublocation "${location.name}".`,
        );
      }
      parentLocationId = resolvedParentId;
    } else if (parentLocationName) {
      throw new Error(
        `Invalid parentLocationName "${parentLocationName}" for macro location "${location.name}".`,
      );
    }

    const entry: LocationPersistenceEntry = {
      id,
      location,
      kind,
      parentLocationId,
    };
    entries.push(entry);
    locationEntriesByName.set(location.name, entry);
  }

  return { entries, locationIds, locationEntriesByName };
}

function insertLocationEdge(
  adjacency: Map<string, Set<string>>,
  fromLocationId: string,
  toLocationId: string,
): void {
  if (fromLocationId === toLocationId) return;
  if (!adjacency.has(fromLocationId)) {
    adjacency.set(fromLocationId, new Set());
  }
  adjacency.get(fromLocationId)!.add(toLocationId);
}

function resolveNpcPlacement(
  npc: WorldScaffold["npcs"][number],
  locationPlan: LocationPersistencePlan,
): NpcPlacement {
  const broadLocationEntry =
    locationPlan.locationEntriesByName.get(npc.locationName) ?? null;
  const broadLocationId = broadLocationEntry?.id ?? null;

  if (npc.sceneLocationName == null) {
    if (broadLocationEntry?.kind === "persistent_sublocation") {
      if (!broadLocationEntry.parentLocationId) {
        throw new Error(
          `Invalid locationName "${npc.locationName}" for NPC "${npc.name}".`,
        );
      }
      const parentEntry = locationPlan.entries.find(
        (entry) => entry.id === broadLocationEntry.parentLocationId,
      );
      return {
        currentLocationId: broadLocationEntry.parentLocationId,
        currentLocationName: parentEntry?.location.name ?? npc.locationName,
        currentSceneLocationId: broadLocationEntry.id,
      };
    }

    return {
      currentLocationId: broadLocationId,
      currentLocationName: npc.locationName,
      currentSceneLocationId: null,
    };
  }

  const sceneLocationEntry = locationPlan.locationEntriesByName.get(
    npc.sceneLocationName,
  );
  if (!sceneLocationEntry) {
    throw new Error(
      `Invalid sceneLocationName "${npc.sceneLocationName}" for NPC "${npc.name}".`,
    );
  }
  if (!broadLocationId) {
    throw new Error(
      `Invalid locationName "${npc.locationName}" for NPC "${npc.name}" with sceneLocationName "${npc.sceneLocationName}".`,
    );
  }

  if (sceneLocationEntry.kind === "macro") {
    if (broadLocationId !== sceneLocationEntry.id) {
      throw new Error(
        `NPC "${npc.name}" locationName "${npc.locationName}" conflicts with sceneLocationName "${npc.sceneLocationName}".`,
      );
    }
    return {
      currentLocationId: sceneLocationEntry.id,
      currentLocationName: npc.locationName,
      currentSceneLocationId: sceneLocationEntry.id,
    };
  }

  if (broadLocationId !== sceneLocationEntry.parentLocationId) {
    throw new Error(
      `NPC "${npc.name}" locationName "${npc.locationName}" conflicts with sceneLocationName "${npc.sceneLocationName}".`,
    );
  }

  return {
    currentLocationId: sceneLocationEntry.parentLocationId,
    currentLocationName: npc.locationName,
    currentSceneLocationId: sceneLocationEntry.id,
  };
}

function clearExistingScaffold({ tx, campaignId }: BaseContext): void {
  // Players and world items can outlive a scaffold rewrite, so clear location
  // FKs before replacing the location table.
  tx.update(players)
    .set({
      currentLocationId: null,
      currentSceneLocationId: null,
    })
    .where(eq(players.campaignId, campaignId))
    .run();
  tx.update(items)
    .set({ locationId: null })
    .where(eq(items.campaignId, campaignId))
    .run();
  tx.delete(relationships).where(eq(relationships.campaignId, campaignId)).run();
  tx.delete(npcs).where(eq(npcs.campaignId, campaignId)).run();
  tx.delete(factions).where(eq(factions.campaignId, campaignId)).run();
  tx.delete(locationRecentEvents)
    .where(eq(locationRecentEvents.campaignId, campaignId))
    .run();
  tx.delete(locationEdges).where(eq(locationEdges.campaignId, campaignId)).run();
  tx.delete(locations).where(eq(locations.campaignId, campaignId)).run();
}

function insertLocations(
  { tx, campaignId }: BaseContext,
  locationPlan: LocationPersistencePlan,
): Map<string, string> {
  const sortedEntries = [
    ...locationPlan.entries.filter((entry) => entry.kind === "macro"),
    ...locationPlan.entries.filter((entry) => entry.kind === "persistent_sublocation"),
  ];

  for (const entry of sortedEntries) {
    const { id, location } = entry;
    tx.insert(locations)
      .values({
        id,
        campaignId,
        name: location.name,
        description: location.description,
        kind: entry.kind,
        parentLocationId: entry.parentLocationId,
        // Worldgen creates persistent geography only; runtime scenes can anchor later.
        anchorLocationId: null,
        persistence: "persistent",
        expiresAtTick: null,
        archivedAtTick: null,
        tags: JSON.stringify(location.tags),
        isStarting: location.isStarting ?? false,
        connectedTo: "[]",
      })
      .run();
  }
  return locationPlan.locationIds;
}

function updateAdjacency(
  tx: Tx,
  campaignId: string,
  locationPlan: LocationPersistencePlan,
): void {
  const adjacency = new Map<string, Set<string>>();

  for (const entry of locationPlan.entries) {
    const location = entry.location;
    const locationId = entry.id;

    if (!adjacency.has(locationId)) {
      adjacency.set(locationId, new Set());
    }

    for (const connectionName of location.connectedTo) {
      const connectionId = locationPlan.locationIds.get(connectionName);
      if (!connectionId) continue;

      insertLocationEdge(adjacency, locationId, connectionId);
      insertLocationEdge(adjacency, connectionId, locationId);
    }

    if (entry.kind === "persistent_sublocation" && entry.parentLocationId) {
      insertLocationEdge(adjacency, entry.parentLocationId, entry.id);
      insertLocationEdge(adjacency, entry.id, entry.parentLocationId);
    }
  }

  for (const entry of locationPlan.entries) {
    if (!adjacency.has(entry.id)) {
      adjacency.set(entry.id, new Set());
    }
  }

  for (const [locationId, connectedSet] of adjacency) {
    const connectedTargets = [...connectedSet].filter((targetId) => targetId !== locationId);

    for (const targetId of connectedTargets) {
      tx.insert(locationEdges)
        .values({
          id: crypto.randomUUID(),
          campaignId,
          fromLocationId: locationId,
          toLocationId: targetId,
          travelCost: 1,
          discovered: true,
        })
        .run();
      }

    tx.update(locations)
      .set({ connectedTo: JSON.stringify(connectedTargets) })
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
  locationPlan: LocationPersistencePlan,
): Map<string, string> {
  const npcIds = new Map<string, string>();
  for (const npc of scaffoldNpcs) {
    const id = crypto.randomUUID();
    npcIds.set(npc.name, id);
    const placement = resolveNpcPlacement(npc, locationPlan);
    const canonicalDraft = npc.draft
      ? reconcileDraftBackedScaffoldNpc({
          ...npc,
          draft: npc.draft,
        })
      : fromLegacyScaffoldNpc(npc, {
          sourceKind: "worldgen",
          currentLocationName: npc.locationName,
          factionName: npc.factionName,
          originMode: "resident",
        });
    const characterRecord = createCharacterRecordFromDraft(
      {
        ...canonicalDraft,
        socialContext: {
          ...canonicalDraft.socialContext,
          currentLocationId: placement.currentLocationId,
          currentLocationName: placement.currentLocationName,
        },
      },
      {
        id,
        campaignId,
      },
    );
    const legacyNpc = toLegacyNpcDraft(characterRecord);

    tx.insert(npcs)
      .values({
        id,
        campaignId,
        name: legacyNpc.name,
        persona: legacyNpc.persona,
        characterRecord: JSON.stringify(characterRecord),
        derivedTags: JSON.stringify(deriveRuntimeCharacterTags(characterRecord)),
        tags: JSON.stringify(legacyNpc.tags),
        tier: legacyNpc.tier === "key" ? "key" : "persistent",
        currentLocationId: placement.currentLocationId,
        currentSceneLocationId: placement.currentSceneLocationId,
        goals: JSON.stringify({
          short_term: legacyNpc.goals.shortTerm,
          long_term: legacyNpc.goals.longTerm,
        }),
        beliefs: JSON.stringify(characterRecord.motivations.beliefs),
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

    insertScaffoldRelationship(ctx, {
      entityA: npcId,
      entityB: factionId,
      tags: ["Member"],
      reason: `${npc.name} belongs to ${npc.factionName}`,
    });
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

      insertScaffoldRelationship(ctx, {
        entityA: factionId,
        entityB: locationId,
        tags: ["Controls"],
        reason: `${faction.name} controls ${territoryName}`,
      });
    }
  }
}

export function saveScaffoldToDb(
  campaignId: string,
  scaffold: WorldScaffold
): void {
  const db = getDb();
  const locationPlan = buildLocationPersistencePlan(scaffold.locations);

  db.transaction((tx) => {
    const base: BaseContext = { tx, campaignId };
    clearExistingScaffold(base);

    const locationIds = insertLocations(base, locationPlan);
    updateAdjacency(tx, campaignId, locationPlan);

    const factionIds = insertFactions(base, scaffold.factions);
    const npcIds = insertNpcs(base, scaffold.npcs, locationPlan);

    const ctx: InsertContext = {
      ...base,
      locationIds,
      factionIds,
      npcIds,
      relationshipKeys: new Set(),
    };
    insertMembershipRelationships(ctx, scaffold.npcs);
    insertTerritoryRelationships(ctx, scaffold.factions);

    tx.update(campaigns)
      .set({ premise: scaffold.refinedPremise, updatedAt: Date.now() })
      .where(eq(campaigns.id, campaignId))
      .run();
  });
}
