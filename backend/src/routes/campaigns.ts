import { eq } from "drizzle-orm";
import { Hono } from "hono";
import {
  assertSafeId,
  createCampaign,
  deleteCampaign,
  getActiveCampaign,
  listCampaigns,
  loadCampaign,
} from "../campaign/manager.js";
import { getDb } from "../db/index.js";
import { factions, locations, npcs, relationships } from "../db/schema.js";
import { getErrorMessage, getErrorStatus } from "../lib/errors.js";
import { createCampaignSchema, parseBody } from "./schemas.js";

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
    return c.json(getActiveCampaign());
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

    const activeCampaign = getActiveCampaign();
    if (!activeCampaign || activeCampaign.id !== id) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

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

    return c.json({
      locations: worldLocations,
      npcs: worldNpcs,
      factions: worldFactions,
      relationships: worldRelationships,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load world data.") },
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

app.delete("/:id", async (c) => {
  try {
    const id = c.req.param("id");
    await deleteCampaign(id);
    return c.json({ status: "ok" });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to delete campaign.") },
      getErrorStatus(error)
    );
  }
});

export default app;
