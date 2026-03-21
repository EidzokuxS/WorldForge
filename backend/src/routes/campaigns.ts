import { and, eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  assertSafeId,
  createCampaign,
  deleteCampaign,
  getActiveCampaign,
  listCampaigns,
  loadCampaign,
} from "../campaign/index.js";
import { getDb } from "../db/index.js";
import { factions, items, locations, npcs, players, relationships } from "../db/schema.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { parseBody, requireActiveCampaign } from "./helpers.js";
import { createCampaignSchema, promoteNpcBodySchema } from "./schemas.js";

const app = new Hono();

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

    const { name, premise, seeds } = result.data;
    const campaign = await createCampaign(name, premise, seeds);
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

app.get("/:id/world", (c) => {
  try {
    const id = c.req.param("id");
    assertSafeId(id);

    const activeCampaign = requireActiveCampaign(c, id);
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

    return c.json({
      locations: worldLocations,
      npcs: worldNpcs,
      factions: worldFactions,
      relationships: worldRelationships,
      player: worldPlayer[0] ?? null,
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
