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
  readCampaignConfig,
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
import { listRecentLocationEventsForLocations } from "../engine/location-events.js";
import { listConnectedPaths, loadLocationGraph } from "../engine/location-graph.js";
import { loadAuthoritativeInventoryView } from "../inventory/authority.js";
import {
  getObserverAwareness,
  inferPresenceVisibility,
  resolveScenePresence,
} from "../engine/scene-presence.js";

const app = new Hono();

function toWorldPlayerInventoryItem(item: {
  id: string;
  name: string;
  tags: string;
  equipState: "carried" | "equipped";
  equippedSlot: string | null;
  isSignature: boolean;
}) {
  return {
    id: item.id,
    name: item.name,
    tags: item.tags,
    equipState: item.equipState,
    equippedSlot: item.equippedSlot,
    isSignature: item.isSignature,
  };
}

function toWorldSceneScopeId(row: {
  currentLocationId: string | null;
  currentSceneLocationId: string | null;
}) {
  return row.currentSceneLocationId ?? row.currentLocationId ?? null;
}

function buildWorldCurrentScene(args: {
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

  const presenceSnapshot = resolveScenePresence({
    playerActorId: player.id,
    broadLocationId: player.currentLocationId,
    sceneScopeId,
    actors: [
      {
        actorId: player.id,
        actorType: "player",
        broadLocationId: player.currentLocationId,
        sceneScopeId,
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
  const broadLocation =
    args.locations.find((location) => location.id === player.currentLocationId) ?? null;
  const sceneLocation = args.locations.find((location) => location.id === sceneScopeId) ?? broadLocation;

  return {
    id: sceneLocation?.id ?? sceneScopeId,
    name: sceneLocation?.name ?? null,
    broadLocationId: broadLocation?.id ?? player.currentLocationId,
    broadLocationName: broadLocation?.name ?? null,
    sceneNpcIds,
    clearNpcIds,
    awareness: {
      byNpcId: awarenessByNpcId,
      hintSignals: [...presenceSnapshot.playerAwarenessHints],
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

    const { name, premise, seeds, ipContext, premiseDivergence, worldbookSelection } = result.data;
    const campaign = await createCampaign(name, premise, seeds, {
      ipContext,
      premiseDivergence,
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
      .all();
    const worldNpcs = db.select().from(npcs).where(eq(npcs.campaignId, id)).all();
    const worldFactions = db
      .select()
      .from(factions)
      .where(eq(factions.campaignId, id))
      .all();
    const worldRelationships = db
      .select()
      .from(relationships)
      .where(eq(relationships.campaignId, id))
      .all();
    const worldPlayer = db.select().from(players).where(eq(players.campaignId, id)).all();
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
      .all();
    const locationGraph = loadLocationGraph({ campaignId: id });
    const recentEventsByLocationId = listRecentLocationEventsForLocations({
      campaignId: id,
      locationIds: worldLocations.map((location) => location.id),
      limitPerLocation: 5,
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
    const playerInventory = playerRow
      ? loadAuthoritativeInventoryView(id, playerRow.id)
      : null;
    const playerDraft = playerRecord ? toCharacterDraft(playerRecord) : null;
    const personaTemplates = readCampaignConfig(id).personaTemplates ?? [];
    const currentScene = buildWorldCurrentScene({
      player: playerRow,
      npcs: worldNpcs,
      locations: normalizedWorldLocations,
    });

    return c.json({
      locations: normalizedWorldLocations,
      currentScene,
      npcs: worldNpcs.map((row) => {
        const record = hydrateStoredNpcRecord(row);
        return {
          ...row,
          sceneScopeId: toWorldSceneScopeId(row),
          characterRecord: record,
          draft: toCharacterDraft(record),
          npc: toLegacyNpcDraft(record),
        };
      }),
      factions: worldFactions,
      relationships: worldRelationships,
      player: playerRow && playerRecord
        ? {
            ...playerRow,
            sceneScopeId: toWorldSceneScopeId(playerRow),
            characterRecord: playerRecord,
            draft: playerDraft,
            inventory: playerInventory?.carried.map(toWorldPlayerInventoryItem) ?? [],
            equipment: playerInventory?.equipped.map(toWorldPlayerInventoryItem) ?? [],
            inventoryItems: playerInventory?.carried.map((item) => item.name) ?? [],
            equippedItems: playerInventory?.compatibility.equippedItemRefs ?? [],
            signatureItems: playerInventory?.compatibility.signatureItems ?? [],
            character: toLegacyPlayerCharacterWithInventory(playerRecord, playerInventory ?? undefined),
          }
        : null,
      personaTemplates,
      items: worldItems,
    });
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

    return c.json({ items: playerItems });
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
    const locId = c.req.param("locId");
    assertSafeId(id);

    const activeCampaign = requireActiveCampaign(c, id);
    if (activeCampaign instanceof Response) return activeCampaign;

    const db = getDb();

    const locationNpcs = db
      .select({
        id: npcs.id,
        name: npcs.name,
        tags: npcs.tags,
        tier: npcs.tier,
      })
      .from(npcs)
      .where(and(eq(npcs.campaignId, id), eq(npcs.currentLocationId, locId)))
      .all();

    const locationItems = db
      .select({
        id: items.id,
        name: items.name,
        tags: items.tags,
      })
      .from(items)
      .where(and(eq(items.campaignId, id), eq(items.locationId, locId)))
      .all();

    return c.json({ npcs: locationNpcs, items: locationItems });
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
      success: true,
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
