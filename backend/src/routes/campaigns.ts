import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  assertSafeId,
  createCampaign,
  deleteCampaign,
  getActiveCampaign,
  listCampaigns,
  loadCampaign,
  createCheckpoint,
  listCheckpoints,
  loadCheckpoint,
  deleteCheckpoint,
} from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { factions, items, locations, npcs, players, relationships } from "../db/schema.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { parseBody, requireActiveCampaign, requireGeneratedCampaign } from "./helpers.js";
import { createCampaignSchema, createCheckpointSchema, promoteNpcBodySchema } from "./schemas.js";
import {
  hydrateStoredNpcRecord,
  hydrateStoredPlayerRecord,
  toCharacterDraft,
  toLegacyNpcDraft,
  toLegacyPlayerCharacterWithInventory,
} from "../character/record-adapters.js";
import { buildCompatibilityTags } from "./compatibility-tags.js";
import { listRecentLocationEventsForLocations } from "../engine/location-events.js";
import { listConnectedPaths, loadLocationGraph } from "../engine/location-graph.js";
import { readWorldClock } from "../engine/living-world-authority.js";
import { loadAuthoritativeInventoryView } from "../inventory/authority.js";
import {
  getObserverAwareness,
  inferPresenceVisibility,
  resolveImmediateScenePresenceScopeId,
  resolveScenePresence,
} from "../engine/scene-presence.js";
import { assertPublicProjectionPayload } from "../engine/gameplay-control-plane-contract.js";
import {
  requirePublicDtoHandle,
  resolvePublicDtoHandle,
  toPublicDtoHandle,
  type PublicDtoHandleKind,
} from "../engine/public-dto-handles.js";

const app = new Hono();

function publicHandle(
  campaignId: string,
  kind: PublicDtoHandleKind,
  sourceId: string | number | null | undefined,
) {
  return toPublicDtoHandle({ campaignId, kind, sourceId });
}

function requiredPublicHandle(
  campaignId: string,
  kind: PublicDtoHandleKind,
  sourceId: string | number,
) {
  return requirePublicDtoHandle({ campaignId, kind, sourceId });
}

function sanitizeCharacterDraftForPublicProjection<T extends ReturnType<typeof toCharacterDraft>>(
  draft: T,
): T {
  return {
    ...draft,
    socialContext: {
      ...draft.socialContext,
      factionId: null,
      homeLocationId: null,
      currentLocationId: null,
      relationshipRefs: draft.socialContext.relationshipRefs.map((ref) => ({
        ...ref,
        entityId: null,
      })),
    },
    provenance: {
      ...draft.provenance,
      templateId: null,
    },
  };
}

function toWorldPlayerInventoryItem(item: {
  campaignId: string;
  id: string;
  name: string;
  tags: string;
  equipState: "carried" | "equipped";
  equippedSlot: string | null;
  isSignature: boolean;
}) {
  const itemHandle = requiredPublicHandle(item.campaignId, "item", item.id);
  return {
    id: itemHandle,
    itemHandle,
    name: item.name,
    tags: item.tags,
    equipState: item.equipState,
    equippedSlot: item.equippedSlot,
    isSignature: item.isSignature,
  };
}

function toWorldSceneScopeId(row: {
  currentLocationId: string | null;
  currentSceneLocationId?: string | null;
}) {
  return row.currentSceneLocationId ?? row.currentLocationId ?? null;
}

function buildWorldCurrentScene(args: {
  campaignId: string;
  player: {
    id: string;
    currentLocationId: string | null;
    currentSceneLocationId: string | null;
  } | null;
  npcs: Array<{
    id: string;
    name: string;
    currentLocationId: string | null;
    currentSceneLocationId: string | null;
    tags: string;
  }>;
  locations: Array<{
    id: string;
    name: string;
    kind?: string | null;
    parentLocationId?: string | null;
  }>;
}) {
  const player = args.player;
  if (!player || !player.currentLocationId) {
    return null;
  }

  const sceneScopeId = toWorldSceneScopeId(player);
  if (!sceneScopeId) {
    return null;
  }
  const storedBroadLocation =
    args.locations.find((location) => location.id === player.currentLocationId) ?? null;
  const sceneLocation =
    args.locations.find((location) => location.id === sceneScopeId) ?? storedBroadLocation;
  const parentBroadLocation = sceneLocation?.parentLocationId
    ? args.locations.find((location) => location.id === sceneLocation.parentLocationId) ?? null
    : null;
  const broadLocation = parentBroadLocation ?? storedBroadLocation;
  const broadLocationId = broadLocation?.id ?? player.currentLocationId;

  const presenceSceneScopeId = resolveImmediateScenePresenceScopeId(
    player.currentSceneLocationId,
  );

  const presenceSnapshot = resolveScenePresence({
    playerActorId: player.id,
    broadLocationId,
    sceneScopeId: presenceSceneScopeId,
    actors: [
      {
        actorId: player.id,
        actorType: "player",
        broadLocationId,
        sceneScopeId: presenceSceneScopeId,
        visibility: "clear",
      },
      ...args.npcs.map((npc) => {
        const visibility = inferPresenceVisibility(npc.tags);
        return {
          actorId: npc.id,
          actorType: "npc" as const,
          broadLocationId: npc.currentLocationId,
          sceneScopeId: npc.currentSceneLocationId,
          visibility: visibility.visibility,
          awarenessHint: visibility.awarenessHint,
        };
      }),
    ],
  });

  const npcIds = new Set(args.npcs.map((npc) => npc.id));
  const sceneNpcIds = presenceSnapshot.presentActorIds.filter(
    (actorId) => actorId !== player.id && npcIds.has(actorId),
  );
  const clearNpcIds = sceneNpcIds.filter(
    (npcId) => getObserverAwareness(presenceSnapshot, player.id, npcId) === "clear",
  );
  const awarenessByNpcId = Object.fromEntries(
    sceneNpcIds.map((npcId) => [
      npcId,
      getObserverAwareness(presenceSnapshot, player.id, npcId),
    ]),
  );
  return {
    id: requiredPublicHandle(args.campaignId, "place", sceneLocation?.id ?? sceneScopeId),
    sceneHandle: requiredPublicHandle(args.campaignId, "place", sceneLocation?.id ?? sceneScopeId),
    name: sceneLocation?.name ?? null,
    broadLocationId: publicHandle(args.campaignId, "place", broadLocationId),
    broadPlaceHandle: publicHandle(args.campaignId, "place", broadLocationId),
    broadLocationName: broadLocation?.name ?? null,
    sceneNpcIds: sceneNpcIds.map((npcId) => requiredPublicHandle(args.campaignId, "actor", npcId)),
    actorHandles: sceneNpcIds.map((npcId) => requiredPublicHandle(args.campaignId, "actor", npcId)),
    clearNpcIds: clearNpcIds.map((npcId) => requiredPublicHandle(args.campaignId, "actor", npcId)),
    clearActorHandles: clearNpcIds.map((npcId) => requiredPublicHandle(args.campaignId, "actor", npcId)),
    awareness: {
      byNpcId: Object.fromEntries(
        Object.entries(awarenessByNpcId).map(([npcId, band]) => [
          requiredPublicHandle(args.campaignId, "actor", npcId),
          band,
        ]),
      ),
      byActorHandle: Object.fromEntries(
        Object.entries(awarenessByNpcId).map(([npcId, band]) => [
          requiredPublicHandle(args.campaignId, "actor", npcId),
          band,
        ]),
      ),
      hintSignals: [...presenceSnapshot.playerAwarenessHints],
    },
  };
}

function buildWorldNpcPayload(
  campaignId: string,
  row: Parameters<typeof hydrateStoredNpcRecord>[0],
) {
  const record = hydrateStoredNpcRecord(row);
  const draft = sanitizeCharacterDraftForPublicProjection(toCharacterDraft(record));
  const compatibilityTags = buildCompatibilityTags(record);
  const actorHandle = requiredPublicHandle(campaignId, "actor", row.id);
  return {
    id: actorHandle,
    actorHandle,
    name: row.name,
    persona: row.persona,
    tags: row.tags,
    tier: row.tier,
    currentLocationId: publicHandle(campaignId, "place", row.currentLocationId),
    currentPlaceHandle: publicHandle(campaignId, "place", row.currentLocationId),
    sceneScopeId: publicHandle(campaignId, "place", toWorldSceneScopeId(row)),
    sceneHandle: publicHandle(campaignId, "place", toWorldSceneScopeId(row)),
    goals: row.goals,
    beliefs: row.beliefs,
    draft,
    npc: {
      ...toLegacyNpcDraft(record),
      draft,
      tags: compatibilityTags,
    },
  };
}

function buildWorldPlayerPayload(args: {
  campaignId: string;
  row: Parameters<typeof hydrateStoredPlayerRecord>[0];
  playerRecord: ReturnType<typeof hydrateStoredPlayerRecord>;
}) {
  const playerInventory = loadAuthoritativeInventoryView(args.campaignId, args.row.id);
  const compatibilityTags = buildCompatibilityTags(args.playerRecord);
  const draft = sanitizeCharacterDraftForPublicProjection(toCharacterDraft(args.playerRecord));
  const actorHandle = requiredPublicHandle(args.campaignId, "actor", args.row.id);
  const character = toLegacyPlayerCharacterWithInventory(
    args.playerRecord,
    playerInventory ?? undefined,
  );
  return {
    id: actorHandle,
    actorHandle,
    name: args.row.name,
    race: args.row.race,
    gender: args.row.gender,
    age: args.row.age,
    appearance: args.row.appearance,
    hp: args.row.hp,
    tags: args.row.tags,
    currentLocationId: publicHandle(args.campaignId, "place", args.row.currentLocationId),
    currentPlaceHandle: publicHandle(args.campaignId, "place", args.row.currentLocationId),
    sceneScopeId: publicHandle(args.campaignId, "place", toWorldSceneScopeId(args.row)),
    sceneHandle: publicHandle(args.campaignId, "place", toWorldSceneScopeId(args.row)),
    draft,
    inventory: playerInventory?.carried.map((item) => toWorldPlayerInventoryItem({
      ...item,
      campaignId: args.campaignId,
    })) ?? [],
    equipment: playerInventory?.equipped.map((item) => toWorldPlayerInventoryItem({
      ...item,
      campaignId: args.campaignId,
    })) ?? [],
    inventoryItems: playerInventory?.carried.map((item) => item.name) ?? [],
    equippedItems: playerInventory?.compatibility.equippedItemRefs ?? [],
    signatureItems: playerInventory?.compatibility.signatureItems ?? [],
    character: {
      ...character,
      draft,
      tags: compatibilityTags,
    },
  };
}

app.get("/", (c) => {
  try {
    return c.json(listCampaigns());
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to list campaigns.") },
      getErrorStatus(error)
    );
  }
});

app.post("/", async (c) => {
  try {
    const result = await parseBody(c, createCampaignSchema);
    if ("response" in result) return result.response;

    const {
      name,
      premise,
      seeds,
      ipContext,
      premiseDivergence,
      worldbookSelection,
      worldgenSourceHint,
      worldgenResearchEnabled,
    } = result.data;
    const campaign = await createCampaign(name, premise, seeds, {
      ipContext,
      premiseDivergence,
      ...(worldgenSourceHint ? { worldgenSourceHint } : {}),
      ...(typeof worldgenResearchEnabled === "boolean" ? { worldgenResearchEnabled } : {}),
      ...(Array.isArray(worldbookSelection) ? { worldbookSelection } : {}),
    });
    return c.json(campaign, 201);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to create campaign.") },
      getErrorStatus(error)
    );
  }
});

app.get("/active", (c) => {
  try {
    const campaign = getActiveCampaign();
    if (!campaign) return c.json({ campaign: null });
    return c.json({ campaign });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to get active campaign.") },
      getErrorStatus(error)
    );
  }
});

app.get("/:id/world", async (c) => {
  try {
    const id = c.req.param("id");
    assertSafeId(id);

    const activeCampaign = await requireGeneratedCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    const db = getDb();
    const worldLocations = db
      .select()
      .from(locations)
      .where(eq(locations.campaignId, id))
      .all() ?? [];
    const worldNpcs = db.select().from(npcs).where(eq(npcs.campaignId, id)).all() ?? [];
    const worldFactions = db
      .select()
      .from(factions)
      .where(eq(factions.campaignId, id))
      .all() ?? [];
    const worldRelationships = db
      .select()
      .from(relationships)
      .where(eq(relationships.campaignId, id))
      .all() ?? [];
    const worldPlayer = db.select().from(players).where(eq(players.campaignId, id)).all() ?? [];
    const worldItems = db
      .select({
        id: items.id,
        name: items.name,
        tags: items.tags,
        ownerId: items.ownerId,
        locationId: items.locationId,
      })
      .from(items)
      .where(eq(items.campaignId, id))
      .all() ?? [];
    const locationGraph = loadLocationGraph({ campaignId: id });
    const recentEventsByLocationId = listRecentLocationEventsForLocations({
      campaignId: id,
      locationIds: worldLocations.map((location) => location.id),
      limitPerLocation: 5,
      audience: { kind: "player", includeLocalSignals: true },
    });
    const normalizedWorldLocations = worldLocations.map((location) => {
      const { connectedTo: _connectedTo, ...worldLocation } = location;
      return {
        ...worldLocation,
        connectedPaths: listConnectedPaths({
          campaignId: id,
          fromLocationId: location.id,
          edges: locationGraph.edges,
          locations: locationGraph.locations,
        }).map((path) => ({
          edgeId: path.edgeId,
          toLocationId: path.locationId,
          toLocationName: path.locationName,
          travelCost: path.travelCost,
        })),
        recentHappenings: recentEventsByLocationId[location.id] ?? [],
      };
    });
    const playerRow = worldPlayer[0] ?? null;
    const playerRecord = playerRow ? hydrateStoredPlayerRecord(playerRow) : null;
    const locationIds = new Set(worldLocations.map((location) => location.id));
    const npcIds = new Set(worldNpcs.map((npc) => npc.id));
    const factionIds = new Set(worldFactions.map((faction) => faction.id));
    const itemIds = new Set(worldItems.map((item) => item.id));
    const publicEntityHandle = (sourceId: string | null | undefined) => {
      if (!sourceId) {
        return null;
      }
      if (locationIds.has(sourceId)) {
        return requiredPublicHandle(id, "place", sourceId);
      }
      if (npcIds.has(sourceId) || sourceId === playerRow?.id) {
        return requiredPublicHandle(id, "actor", sourceId);
      }
      if (factionIds.has(sourceId)) {
        return requiredPublicHandle(id, "faction", sourceId);
      }
      if (itemIds.has(sourceId)) {
        return requiredPublicHandle(id, "item", sourceId);
      }
      return requiredPublicHandle(id, "entity", sourceId);
    };
    const currentScene = buildWorldCurrentScene({
      campaignId: id,
      player: playerRow,
      npcs: worldNpcs,
      locations: normalizedWorldLocations,
    });
    const worldClock = readWorldClock(id);
    const publicLocations = normalizedWorldLocations.map((location) => {
      const placeHandle = requiredPublicHandle(id, "place", location.id);
      return {
        id: placeHandle,
        placeHandle,
        name: location.name,
        description: location.description,
        tags: location.tags,
        connectedTo: location.connectedPaths.map((path) => requiredPublicHandle(id, "place", path.toLocationId)),
        connectedToPlaceHandles: location.connectedPaths.map((path) => requiredPublicHandle(id, "place", path.toLocationId)),
        connectedPaths: location.connectedPaths.map((path) => ({
          edgeId: requiredPublicHandle(id, "route", path.edgeId),
          routeHandle: requiredPublicHandle(id, "route", path.edgeId),
          toLocationId: requiredPublicHandle(id, "place", path.toLocationId),
          toPlaceHandle: requiredPublicHandle(id, "place", path.toLocationId),
          toLocationName: path.toLocationName,
          travelCost: path.travelCost,
        })),
        recentHappenings: location.recentHappenings.map((event) => ({
          id: requiredPublicHandle(id, "event", event.id),
          eventHandle: requiredPublicHandle(id, "event", event.id),
          locationId: requiredPublicHandle(id, "place", event.locationId),
          placeHandle: requiredPublicHandle(id, "place", event.locationId),
          sourceLocationId: publicHandle(id, "place", event.sourceLocationId),
          sourcePlaceHandle: publicHandle(id, "place", event.sourceLocationId),
          anchorLocationId: publicHandle(id, "place", event.anchorLocationId),
          anchorPlaceHandle: publicHandle(id, "place", event.anchorLocationId),
          eventType: event.eventType,
          summary: event.summary,
          tick: event.tick,
          importance: event.importance,
          archivedAtTick: event.archivedAtTick,
          createdAt: event.createdAt,
        })),
        isStarting: location.isStarting,
        locationKind: location.kind,
        kind: location.kind,
        parentLocationId: publicHandle(id, "place", location.parentLocationId),
        parentPlaceHandle: publicHandle(id, "place", location.parentLocationId),
        anchorLocationId: publicHandle(id, "place", location.anchorLocationId),
        anchorPlaceHandle: publicHandle(id, "place", location.anchorLocationId),
        persistence: location.persistence,
        expiresAtTick: location.expiresAtTick,
        archivedAtTick: location.archivedAtTick,
      };
    });

    const payload = {
      locations: publicLocations,
      currentScene,
      state: {
        tick: worldClock.currentTick,
        currentTick: worldClock.currentTick,
        worldVersion: worldClock.worldVersion,
        worldTimeMinutes: worldClock.worldTimeMinutes,
        currentLocationId: publicHandle(id, "place", playerRow?.currentLocationId),
        currentPlaceHandle: publicHandle(id, "place", playerRow?.currentLocationId),
        currentSceneLocationId: publicHandle(id, "place", playerRow?.currentSceneLocationId),
        currentSceneHandle: publicHandle(id, "place", playerRow?.currentSceneLocationId),
      },
      currentTick: worldClock.currentTick,
      worldVersion: worldClock.worldVersion,
      worldTimeMinutes: worldClock.worldTimeMinutes,
      npcs: worldNpcs.map((row) => {
        return buildWorldNpcPayload(id, row);
      }),
      factions: worldFactions.map((faction) => ({
        id: requiredPublicHandle(id, "faction", faction.id),
        factionHandle: requiredPublicHandle(id, "faction", faction.id),
        name: faction.name,
        tags: faction.tags,
        goals: faction.goals,
        assets: faction.assets,
      })),
      relationships: worldRelationships.map((relationship) => ({
        id: requiredPublicHandle(id, "relationship", relationship.id),
        relationshipHandle: requiredPublicHandle(id, "relationship", relationship.id),
        entityA: publicEntityHandle(relationship.entityA),
        entityAHandle: publicEntityHandle(relationship.entityA),
        entityB: publicEntityHandle(relationship.entityB),
        entityBHandle: publicEntityHandle(relationship.entityB),
        tags: relationship.tags,
        reason: relationship.reason,
      })),
      player: playerRow && playerRecord
        ? buildWorldPlayerPayload({
            campaignId: id,
            row: playerRow,
            playerRecord,
          })
        : null,
      personaTemplates: [],
      items: worldItems.map((item) => ({
        id: requiredPublicHandle(id, "item", item.id),
        itemHandle: requiredPublicHandle(id, "item", item.id),
        name: item.name,
        tags: item.tags,
        ownerId: publicHandle(id, "actor", item.ownerId),
        ownerActorHandle: publicHandle(id, "actor", item.ownerId),
        locationId: publicHandle(id, "place", item.locationId),
        placeHandle: publicHandle(id, "place", item.locationId),
      })),
    };
    assertPublicProjectionPayload({ surface: "world", payload });
    return c.json(payload);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load world data.") },
      getErrorStatus(error)
    );
  }
});

// GET /campaigns/:id/inventory — player's owned items
app.get("/:id/inventory", (c) => {
  try {
    const id = c.req.param("id");
    assertSafeId(id);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    const db = getDb();
    const player = db
      .select()
      .from(players)
      .where(eq(players.campaignId, id))
      .get();

    if (!player) {
      return c.json({ items: [] });
    }

    const playerItems = db
      .select({
        id: items.id,
        name: items.name,
        tags: items.tags,
      })
      .from(items)
      .where(and(eq(items.campaignId, id), eq(items.ownerId, player.id)))
      .all();

    const payload = {
      items: playerItems.map((item) => ({
        id: requiredPublicHandle(id, "item", item.id),
        itemHandle: requiredPublicHandle(id, "item", item.id),
        name: item.name,
        tags: item.tags,
      })),
    };
    assertPublicProjectionPayload({ surface: "inventory", payload });
    return c.json(payload);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to get inventory.") },
      getErrorStatus(error)
    );
  }
});

// GET /campaigns/:id/locations/:locId/entities — NPCs and items at a location
app.get("/:id/locations/:locId/entities", (c) => {
  try {
    const id = c.req.param("id");
    const locHandle = c.req.param("locId");
    assertSafeId(id);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    const db = getDb();
    const campaignLocations = db
      .select({ id: locations.id })
      .from(locations)
      .where(eq(locations.campaignId, id))
      .all();
    const resolvedLocation = resolvePublicDtoHandle({
      campaignId: id,
      kind: "place",
      handle: locHandle,
      rows: campaignLocations,
    });
    if (!resolvedLocation) {
      return c.json({ error: "Location not found." }, 404);
    }

    const locationNpcs = db
      .select({
        id: npcs.id,
        name: npcs.name,
        tags: npcs.tags,
        tier: npcs.tier,
      })
      .from(npcs)
      .where(and(eq(npcs.campaignId, id), eq(npcs.currentLocationId, resolvedLocation.id)))
      .all();

    const locationItems = db
      .select({
        id: items.id,
        name: items.name,
        tags: items.tags,
      })
      .from(items)
      .where(and(eq(items.campaignId, id), eq(items.locationId, resolvedLocation.id)))
      .all();

    const payload = {
      npcs: locationNpcs.map((npc) => ({
        id: requiredPublicHandle(id, "actor", npc.id),
        actorHandle: requiredPublicHandle(id, "actor", npc.id),
        name: npc.name,
        tags: npc.tags,
        tier: npc.tier,
      })),
      items: locationItems.map((item) => ({
        id: requiredPublicHandle(id, "item", item.id),
        itemHandle: requiredPublicHandle(id, "item", item.id),
        name: item.name,
        tags: item.tags,
      })),
    };
    assertPublicProjectionPayload({ surface: "location_entities", payload });
    return c.json(payload);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to get location entities.") },
      getErrorStatus(error)
    );
  }
});

app.post("/:id/load", async (c) => {
  try {
    const id = c.req.param("id");
    const campaign = await loadCampaign(id);
    return c.json(campaign);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load campaign.") },
      getErrorStatus(error)
    );
  }
});

// POST /campaigns/:id/npcs/:npcId/promote — promote NPC tier
app.post("/:id/npcs/:npcId/promote", async (c) => {
  try {
    const campaignId = c.req.param("id");
    const npcId = c.req.param("npcId");
    assertSafeId(campaignId);

    const activeCampaign = requireActiveCampaign(c, campaignId);
    if (activeCampaign instanceof Response) return activeCampaign;

    const result = await parseBody(c, promoteNpcBodySchema);
    if ("response" in result) return result.response;

    const { newTier } = result.data;

    const db = getDb();

    // Find the NPC
    const npc = db
      .select({ id: npcs.id, name: npcs.name, tier: npcs.tier })
      .from(npcs)
      .where(and(eq(npcs.id, npcId), eq(npcs.campaignId, campaignId)))
      .get();

    if (!npc) {
      return c.json({ error: "NPC not found." }, 404);
    }

    // Validate upward-only promotion
    const tierOrder: Record<string, number> = { temporary: 0, persistent: 1, key: 2 };
    const currentOrder = tierOrder[npc.tier] ?? 0;
    const newOrder = tierOrder[newTier] ?? 0;

    if (newOrder <= currentOrder) {
      return c.json(
        { error: "Can only promote upward (temporary -> persistent -> key)." },
        400
      );
    }

    // Apply promotion
    db.update(npcs)
      .set({ tier: newTier })
      .where(eq(npcs.id, npcId))
      .run();

    return c.json({
      ok: true,
      npcId: npc.id,
      name: npc.name,
      oldTier: npc.tier,
      newTier,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to promote NPC.") },
      getErrorStatus(error)
    );
  }
});

// ───── Checkpoint endpoints ─────

app.post("/:id/checkpoints", async (c) => {
  try {
    const id = c.req.param("id");
    assertSafeId(id);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    const result = await parseBody(c, createCheckpointSchema);
    if ("response" in result) return result.response;

    const checkpoint = await createCheckpoint(id, {
      name: result.data.name,
      description: result.data.description,
    });
    return c.json(checkpoint, 201);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to create checkpoint.") },
      getErrorStatus(error)
    );
  }
});

app.get("/:id/checkpoints", (c) => {
  try {
    const id = c.req.param("id");
    assertSafeId(id);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    return c.json(listCheckpoints(id));
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to list checkpoints.") },
      getErrorStatus(error)
    );
  }
});

app.post("/:id/checkpoints/:checkpointId/load", async (c) => {
  try {
    const id = c.req.param("id");
    const checkpointId = c.req.param("checkpointId");
    assertSafeId(id);
    assertSafeId(checkpointId);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    const meta = await loadCheckpoint(id, checkpointId);
    return c.json(meta);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load checkpoint.") },
      getErrorStatus(error)
    );
  }
});

app.delete("/:id/checkpoints/:checkpointId", (c) => {
  try {
    const id = c.req.param("id");
    const checkpointId = c.req.param("checkpointId");
    assertSafeId(id);
    assertSafeId(checkpointId);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    deleteCheckpoint(id, checkpointId);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to delete checkpoint.") },
      getErrorStatus(error)
    );
  }
});

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    assertSafeId(id);
    await deleteCampaign(id);
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to delete campaign.") },
      getErrorStatus(error)
    );
  }
});

export default app;
