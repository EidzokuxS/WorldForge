import { Hono } from "hono";
import { assertSafeId } from "../campaign/index.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import { parseBody, requireLoadedCampaign, resolveEmbedder } from "./helpers.js";
import { loreCardUpdateSchema } from "./schemas.js";
import { embedTexts } from "../vectors/embeddings.js";
import {
  getAllLoreCards,
  searchLoreCards,
  deleteCampaignLore,
  updateLoreCard,
  deleteLoreCardById,
} from "../vectors/lore-cards.js";

const app = new Hono();

/** GET /:id/lore — list all lore cards for the active campaign */
app.get("/:id/lore", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const cards = await getAllLoreCards();
    return c.json({ cards });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load lore cards.") },
      getErrorStatus(error)
    );
  }
});

/** GET /:id/lore/search?q=... — semantic search over lore cards */
app.get("/:id/lore/search", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const query = c.req.query("q")?.trim();
    if (!query) {
      return c.json({ error: "Query parameter 'q' is required." }, 400);
    }

    const settings = loadSettings();
    const embedderResult = resolveEmbedder(settings);
    if (!("resolved" in embedderResult)) {
      return c.json(
        { error: "Embedder not configured. Set up an Embedder in Settings." },
        400
      );
    }

    const [queryVector] = await embedTexts(
      [query],
      embedderResult.resolved.provider
    );
    if (!queryVector) {
      return c.json({ error: "Failed to generate query embedding." }, 500);
    }

    const limit = Math.min(
      Math.max(Number.parseInt(c.req.query("limit") ?? "5", 10) || 5, 1),
      20
    );
    const results = await searchLoreCards(queryVector, limit);

    return c.json({
      cards: results.map(({ vector: _v, ...rest }) => rest),
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Lore search failed.") },
      getErrorStatus(error)
    );
  }
});

/** PUT /:id/lore/:cardId — update one lore card for the active campaign */
app.put("/:id/lore/:cardId", async (c) => {
  try {
    const campaignId = c.req.param("id");
    const cardId = c.req.param("cardId");
    assertSafeId(campaignId);
    assertSafeId(cardId);

    const result = await parseBody(c, loreCardUpdateSchema);
    if ("response" in result) {
      return result.response;
    }

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const settings = loadSettings();
    const card = await updateLoreCard(cardId, {
      term: result.data.term,
      definition: result.data.definition,
      category: result.data.category,
    }, resolveEmbedder(settings));

    if (!card) {
      return c.json({ error: "Lore card not found." }, 404);
    }

    return c.json({ card });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to update lore card.") },
      getErrorStatus(error)
    );
  }
});

/** DELETE /:id/lore — delete all lore cards for the active campaign */
app.delete("/:id/lore", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    await deleteCampaignLore();
    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to delete lore cards.") },
      getErrorStatus(error)
    );
  }
});

/** DELETE /:id/lore/:cardId — delete one lore card for the active campaign */
app.delete("/:id/lore/:cardId", async (c) => {
  try {
    const campaignId = c.req.param("id");
    const cardId = c.req.param("cardId");
    assertSafeId(campaignId);
    assertSafeId(cardId);

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const deleted = await deleteLoreCardById(cardId);
    if (!deleted) {
      return c.json({ error: "Lore card not found." }, 404);
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to delete lore card.") },
      getErrorStatus(error)
    );
  }
});

export default app;
