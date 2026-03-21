import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import crypto from "node:crypto";
import { getActiveCampaign, markGenerationComplete } from "../campaign/manager.js";
import { getErrorMessage, getErrorStatus } from "../lib/errors.js";
import { loadSettings } from "../settings/index.js";
import {
  extractLoreCards,
  generateWorldScaffold,
  generateRefinedPremiseStep,
  generateLocationsStep,
  generateFactionsStep,
  generateNpcsStep,
  rollSeed,
  rollWorldSeeds,
  saveScaffoldToDb,
  suggestSingleSeed,
  suggestWorldSeeds,
} from "../worldgen/index.js";
import { parseCharacterDescription, generateCharacter } from "../character/generator.js";
import { getDb } from "../db/index.js";
import { locations, factions, players } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { resolveGenerator, resolveEmbedder } from "./helpers.js";
import { embedTexts } from "../vectors/embeddings.js";
import { insertLoreCards, insertLoreCardsWithoutVectors, deleteCampaignLore } from "../vectors/lore-cards.js";
import {
  generateCharacterSchema,
  generateWorldSchema,
  parseBody,
  parseCharacterSchema,
  regenerateSectionSchema,
  rollSeedSchema,
  saveCharacterSchema,
  saveEditsSchema,
  suggestSeedSchema,
  suggestSeedsSchema,
} from "./schemas.js";

const app = new Hono();

app.post("/roll-seeds", (c) => {
  try {
    return c.json(rollWorldSeeds());
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to roll world seeds.") },
      getErrorStatus(error)
    );
  }
});

app.post("/roll-seed", async (c) => {
  try {
    const result = await parseBody(c, rollSeedSchema);
    if ("response" in result) return result.response;

    const { category } = result.data;
    return c.json({ category, value: rollSeed(category) });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to roll seed.") },
      getErrorStatus(error)
    );
  }
});

app.post("/suggest-seeds", async (c) => {
  try {
    const result = await parseBody(c, suggestSeedsSchema);
    if ("response" in result) return result.response;

    const gen = resolveGenerator(loadSettings());
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const seeds = await suggestWorldSeeds({
      premise: result.data.premise,
      role: gen.resolved,
    });
    return c.json(seeds);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to generate seed suggestions.") },
      getErrorStatus(error)
    );
  }
});

app.post("/suggest-seed", async (c) => {
  try {
    const result = await parseBody(c, suggestSeedSchema);
    if ("response" in result) return result.response;

    const { premise, category } = result.data;
    const gen = resolveGenerator(loadSettings());
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const value = await suggestSingleSeed({
      premise,
      category,
      role: gen.resolved,
    });
    return c.json({ category, value });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to suggest seed.") },
      getErrorStatus(error)
    );
  }
});

app.post("/generate", async (c) => {
  const result = await parseBody(c, generateWorldSchema);
  if ("response" in result) return result.response;

  const { campaignId } = result.data;
  const campaign = getActiveCampaign();
  if (!campaign || campaign.id !== campaignId) {
    return c.json({ error: "Campaign not active or not found." }, 400);
  }

  const settings = loadSettings();
  const gen = resolveGenerator(settings);
  if ("error" in gen) {
    return c.json({ error: gen.error }, gen.status);
  }

  return streamSSE(c, async (stream) => {
    try {
      const scaffold = await generateWorldScaffold(
        {
          campaignId,
          name: campaign.name,
          premise: campaign.premise,
          seeds: campaign.seeds,
          role: gen.resolved,
          research: settings.research,
        },
        async (progress) => {
          await stream.writeSSE({
            event: "progress",
            data: JSON.stringify(progress),
          });
        }
      );

      saveScaffoldToDb(campaignId, scaffold);
      markGenerationComplete(campaignId, scaffold.refinedPremise);

      // Store lore cards in LanceDB
      if (scaffold.loreCards.length > 0) {
        const cards = scaffold.loreCards.map((lc) => ({
          id: crypto.randomUUID(),
          term: lc.term,
          definition: lc.definition,
          category: lc.category,
        }));

        const embedderResult = resolveEmbedder(settings);
        if ("resolved" in embedderResult) {
          try {
            const definitions = cards.map((c) => `${c.term}: ${c.definition}`);
            const embeddings = await embedTexts(definitions, embedderResult.resolved.provider);
            await insertLoreCards(cards, embeddings);
          } catch (embedError) {
            console.error("Embedding failed, storing lore without vectors:", embedError);
            await insertLoreCardsWithoutVectors(cards);
          }
        } else {
          await insertLoreCardsWithoutVectors(cards);
        }
      }

      const startingLocation =
        scaffold.locations.find((location) => location.isStarting)?.name ??
        scaffold.locations[0]?.name ??
        "Unknown";

      await stream.writeSSE({
        event: "complete",
        data: JSON.stringify({
          refinedPremise: scaffold.refinedPremise,
          locationCount: scaffold.locations.length,
          npcCount: scaffold.npcs.length,
          factionCount: scaffold.factions.length,
          startingLocation,
        }),
      });
    } catch (error) {
      await stream.writeSSE({
        event: "error",
        data: JSON.stringify({
          error: getErrorMessage(error, "World generation failed."),
        }),
      });
    }
  });
});

app.post("/regenerate-section", async (c) => {
  try {
    const result = await parseBody(c, regenerateSectionSchema);
    if ("response" in result) return result.response;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const campaign = getActiveCampaign();
    if (!campaign) {
      return c.json({ error: "No active campaign." }, 400);
    }

    const req = {
      campaignId: campaign.id,
      name: campaign.name,
      premise: campaign.premise,
      seeds: campaign.seeds,
      role: gen.resolved,
    };

    const { section } = result.data;

    switch (section) {
      case "premise": {
        const refinedPremise = await generateRefinedPremiseStep(req, null, result.data.additionalInstruction);
        return c.json({ refinedPremise });
      }
      case "locations": {
        const locations = await generateLocationsStep(req, result.data.refinedPremise, null, result.data.additionalInstruction);
        return c.json({ locations });
      }
      case "factions": {
        const factions = await generateFactionsStep(req, result.data.refinedPremise, result.data.locationNames, null, result.data.additionalInstruction);
        return c.json({ factions });
      }
      case "npcs": {
        const npcs = await generateNpcsStep(req, result.data.refinedPremise, result.data.locationNames, result.data.factionNames, null, result.data.additionalInstruction);
        return c.json({ npcs });
      }
    }
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Section regeneration failed.") },
      getErrorStatus(error)
    );
  }
});

app.post("/save-edits", async (c) => {
  try {
    const result = await parseBody(c, saveEditsSchema);
    if ("response" in result) return result.response;

    const { campaignId, scaffold } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    saveScaffoldToDb(campaignId, scaffold);
    markGenerationComplete(campaignId, scaffold.refinedPremise);

    // Clear old lore cards before re-extraction
    await deleteCampaignLore();

    // Re-extract lore cards
    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("resolved" in gen) {
      try {
        const loreCards = await extractLoreCards(scaffold, gen.resolved);

        if (loreCards.length > 0) {
          const cards = loreCards.map((lc) => ({
            id: crypto.randomUUID(),
            term: lc.term,
            definition: lc.definition,
            category: lc.category,
          }));

          const embedderResult = resolveEmbedder(settings);
          if ("resolved" in embedderResult) {
            try {
              const definitions = cards.map((c) => `${c.term}: ${c.definition}`);
              const embeddings = await embedTexts(definitions, embedderResult.resolved.provider);
              await insertLoreCards(cards, embeddings);
            } catch (embedError) {
              console.error("Embedding failed, storing lore without vectors:", embedError);
              await insertLoreCardsWithoutVectors(cards);
            }
          } else {
            await insertLoreCardsWithoutVectors(cards);
          }
        }
      } catch (loreError) {
        console.error("Lore re-extraction failed:", loreError);
      }
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save world edits.") },
      getErrorStatus(error)
    );
  }
});

app.post("/parse-character", async (c) => {
  try {
    const result = await parseBody(c, parseCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, description } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const db = getDb();
    const locationNames = db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all()
      .map((r) => r.name);

    if (locationNames.length === 0) {
      return c.json({ error: "No locations found. Generate the world first." }, 400);
    }

    const character = await parseCharacterDescription({
      description,
      premise: campaign.premise,
      locationNames,
      role: gen.resolved,
    });

    return c.json(character);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to parse character.") },
      getErrorStatus(error)
    );
  }
});

app.post("/generate-character", async (c) => {
  try {
    const result = await parseBody(c, generateCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const db = getDb();
    const locationNames = db
      .select({ name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all()
      .map((r) => r.name);

    if (locationNames.length === 0) {
      return c.json({ error: "No locations found. Generate the world first." }, 400);
    }

    const factionNames = db
      .select({ name: factions.name })
      .from(factions)
      .where(eq(factions.campaignId, campaignId))
      .all()
      .map((r) => r.name);

    const character = await generateCharacter({
      premise: campaign.premise,
      locationNames,
      factionNames,
      role: gen.resolved,
    });

    return c.json(character);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to generate character.") },
      getErrorStatus(error)
    );
  }
});

app.post("/save-character", async (c) => {
  try {
    const result = await parseBody(c, saveCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, character } = result.data;
    const campaign = getActiveCampaign();
    if (!campaign || campaign.id !== campaignId) {
      return c.json({ error: "Campaign not active or not found." }, 400);
    }

    const db = getDb();

    // Find matching location by name
    const allLocations = db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const matchedLocation = allLocations.find((l) => l.name === character.locationName);
    if (!matchedLocation) {
      return c.json({ error: `Location "${character.locationName}" not found in this campaign.` }, 400);
    }

    // Delete existing player for this campaign (single player per campaign)
    db.delete(players).where(eq(players.campaignId, campaignId)).run();

    const playerId = crypto.randomUUID();
    db.insert(players)
      .values({
        id: playerId,
        campaignId,
        name: character.name,
        hp: character.hp,
        tags: JSON.stringify(character.tags),
        equippedItems: JSON.stringify(character.equippedItems),
        currentLocationId: matchedLocation.id,
      })
      .run();

    return c.json({ ok: true, playerId });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save character.") },
      getErrorStatus(error)
    );
  }
});

export default app;
