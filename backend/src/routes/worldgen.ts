import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { markGenerationComplete } from "../campaign/index.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
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
import { parseBody, requireActiveCampaign, resolveGenerator, resolveEmbedder } from "./helpers.js";
import { createLogger } from "../lib/index.js";

const log = createLogger("worldgen-route");
import { deleteCampaignLore, storeLoreCards } from "../vectors/lore-cards.js";
import {
  generateWorldSchema,
  regenerateSectionSchema,
  rollSeedSchema,
  saveEditsSchema,
  suggestSeedSchema,
  suggestSeedsSchema,
  parseWorldBookSchema,
  importWorldBookSchema,
} from "./schemas.js";
import {
  parseWorldBook,
  classifyEntries,
  importClassifiedEntries,
} from "../worldgen/worldbook-importer.js";

const app = new Hono();

app.post("/roll-seeds", async (c) => {
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
  try {
    const result = await parseBody(c, generateWorldSchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

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

        // Store lore cards in LanceDB (non-fatal — world is saved regardless)
        let loreStorageFailed = false;
        if (scaffold.loreCards.length > 0) {
          try {
            await storeLoreCards(scaffold.loreCards, resolveEmbedder(settings));
            log.info(`Stored ${scaffold.loreCards.length} lore cards in LanceDB`);
          } catch (loreError) {
            loreStorageFailed = true;
            const msg = loreError instanceof Error ? loreError.message : String(loreError);
            log.error(`Lore card storage failed: ${msg}`, loreError);
            await stream.writeSSE({
              event: "progress",
              data: JSON.stringify({
                step: -1,
                totalSteps: -1,
                label: `Lore storage failed: ${msg}. World saved without vector search.`,
              }),
            });
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
            loreCardCount: scaffold.loreCards.length,
            loreStorageFailed,
            startingLocation,
          }),
        });
      } catch (error) {
        log.error("World generation pipeline failed", error);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: getErrorMessage(error, "World generation failed."),
          }),
        });
      }
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "World generation failed.") },
      getErrorStatus(error)
    );
  }
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

    const { campaignId } = result.data;
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

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
      default:
        return c.json({ error: `Unknown section: ${section}` }, 400);
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
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

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

        await storeLoreCards(loreCards, resolveEmbedder(settings));
      } catch (loreError) {
        log.error("Lore re-extraction failed", loreError);
        return c.json({ ok: true, loreExtractionFailed: true });
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

// ───── WorldBook Import ─────

app.post("/parse-worldbook", async (c) => {
  try {
    const result = await parseBody(c, parseWorldBookSchema);
    if ("response" in result) return result.response;

    const { campaignId, worldbook } = result.data;
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const parsed = parseWorldBook(worldbook);
    const classified = await classifyEntries(parsed, gen.resolved);

    return c.json({ entries: classified });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to parse WorldBook.") },
      getErrorStatus(error),
    );
  }
});

app.post("/import-worldbook", async (c) => {
  try {
    const result = await parseBody(c, importWorldBookSchema);
    if ("response" in result) return result.response;

    const { campaignId, entries } = result.data;
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const settings = loadSettings();
    const embedder = resolveEmbedder(settings);

    const imported = await importClassifiedEntries(campaignId, entries, embedder);

    return c.json(imported);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to import WorldBook.") },
      getErrorStatus(error),
    );
  }
});

export default app;
