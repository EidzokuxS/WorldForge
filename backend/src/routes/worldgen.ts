import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { IpResearchContext, PremiseDivergence } from "@worldforge/shared";
import type { ResolvedRole } from "../ai/resolve-role-model.js";
import {
  readCampaignConfig,
  markGenerationComplete,
  saveIpContext,
  loadIpContext,
  savePremiseDivergence,
  loadPremiseDivergence,
} from "../campaign/index.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import {
  listWorldgenOperations,
  beginWorldgenOperation,
  extractLoreCards,
  interpretPremiseDivergence,
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
import { parseBody, requireActiveCampaign, requireLoadedCampaign, resolveGenerator, resolveEmbedder } from "./helpers.js";
import { resolveFallbackProvider } from "../ai/with-model-fallback.js";
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
  worldbookToIpContext,
} from "../worldgen/worldbook-importer.js";
import {
  composeSelectedWorldbooks,
  listWorldbookLibrary,
  importWorldbookToLibrary,
} from "../worldbook-library/index.js";
import { worldbookLibraryImportSchema } from "./schemas.js";

const app = new Hono();

app.get("/debug/progress", (c) => {
  return c.json(listWorldgenOperations());
});

async function resolvePremiseDivergence(
  campaignId: string,
  ipContext: IpResearchContext | null,
  premise: string,
  role: ResolvedRole,
  cached: PremiseDivergence | null,
): Promise<PremiseDivergence | null> {
  if (cached) {
    return cached;
  }

  const premiseDivergence = await interpretPremiseDivergence(ipContext, premise, role);
  if (premiseDivergence) {
    savePremiseDivergence(campaignId, premiseDivergence);
  }
  return premiseDivergence;
}

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
  let debugOperation:
    | ReturnType<typeof beginWorldgenOperation>
    | null = null;
  try {
    const result = await parseBody(c, suggestSeedsSchema);
    if ("response" in result) return result.response;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    debugOperation = beginWorldgenOperation({
      kind: "suggest-seeds",
      label: "Preparing World DNA suggestions...",
      franchise: result.data.franchise?.trim() || undefined,
      premise: result.data.premise,
    });
    debugOperation.startHeartbeat(10000);

    // Build knowledge context: reusable worldbook selection, legacy worldbook
    // entries, or franchise research.
    let ipContext = null;
    if (result.data.selectedWorldbooks?.length) {
      debugOperation.setLabel("Composing selected worldbooks...");
      ipContext = composeSelectedWorldbooks(result.data.selectedWorldbooks, result.data.premise).ipContext;
    } else if (result.data.worldbookEntries?.length) {
      debugOperation.setLabel("Converting WorldBook into generation context...");
      ipContext = worldbookToIpContext(result.data.worldbookEntries, result.data.name ?? "Worldbook");
    } else {
      const franchiseName = result.data.franchise?.trim();
      if (franchiseName && result.data.research !== false) {
        debugOperation.setLabel(`Researching franchise lore for ${franchiseName}...`);
        const { researchKnownIP } = await import("../worldgen/ip-researcher.js");
        ipContext = await researchKnownIP(
          { premise: result.data.premise, name: result.data.name ?? "", knownIP: franchiseName, research: settings.research },
          gen.resolved,
        );
      }
    }

    // If no premise provided but worldbook exists, generate premise from worldbook
    const premise = result.data.premise?.trim() ||
      (ipContext ? `A world based on the ${ipContext.franchise} setting` : "An original fantasy world");
    debugOperation.setLabel("Generating World DNA suggestions...");
    const { seeds, premiseDivergence } = await suggestWorldSeeds({
      premise,
      role: gen.resolved,
      ipContext,
    });

    debugOperation.finish("completed");

    return c.json({
      ...seeds,
      _ipContext: ipContext,
      _premiseDivergence: premiseDivergence,
    });
  } catch (error) {
    debugOperation?.finish("failed", error);
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
      ipContext: result.data.ipContext ?? undefined,
      premiseDivergence: result.data.premiseDivergence ?? undefined,
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
  let debugOperation:
    | ReturnType<typeof beginWorldgenOperation>
    | null = null;
  try {
    const result = await parseBody(c, generateWorldSchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    debugOperation = beginWorldgenOperation({
      kind: "generate-world",
      label: "Preparing world generation...",
      campaignId,
      franchise: result.data.ipContext?.franchise,
      premise: campaign.premise,
    });
    debugOperation.startHeartbeat(15000);

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    // Resolve Fallback role for lore extraction retry
    const fallbackProviderConfig = resolveFallbackProvider(settings.fallback, settings.providers);
    const fallbackRole = fallbackProviderConfig ? {
      provider: fallbackProviderConfig,
      temperature: gen.resolved.temperature,
      maxTokens: gen.resolved.maxTokens,
    } : undefined;

    return streamSSE(c, async (stream) => {
      const keepaliveTimer = setInterval(() => {
        void stream.writeSSE({
          event: "keepalive",
          data: "{}",
        }).catch(() => {
          // Ignore write errors here; the main generation flow will surface real failures.
        });
      }, 10000);

      try {
        // Load cached worldgen context: request body (fresh from wizard) or config cache
        const bodyIpContext = result.data.ipContext;
        const bodyPremiseDivergence = result.data.premiseDivergence ?? null;
        if (bodyIpContext) {
          saveIpContext(campaignId, bodyIpContext);
        }
        if (bodyPremiseDivergence) {
          savePremiseDivergence(campaignId, bodyPremiseDivergence);
        }
        let ipContext = bodyIpContext ?? loadIpContext(campaignId);
        let premiseDivergence = bodyPremiseDivergence ?? loadPremiseDivergence(campaignId);

        if (!ipContext) {
          const config = readCampaignConfig(campaignId);
          if (config.worldbookSelection?.length) {
            debugOperation?.setLabel("Composing saved worldbook selection...");
            ipContext = composeSelectedWorldbooks(config.worldbookSelection, campaign.premise).ipContext;
            saveIpContext(campaignId, ipContext);
            log.info(
              `Composed saved worldbook selection for campaign ${campaignId} (${ipContext.keyFacts.length} facts)`,
            );
          }
        }

        // If no ipContext exists, run research now (user may have skipped DNA step)
        if (!ipContext) {
          debugOperation?.setLabel("Researching franchise lore...");
          const { researchKnownIP } = await import("../worldgen/ip-researcher.js");
          ipContext = await researchKnownIP(
            { premise: campaign.premise, name: campaign.name, research: settings.research },
            gen.resolved,
          );
          if (ipContext) {
            saveIpContext(campaignId, ipContext);
            log.info(`Ran research on-demand: "${ipContext.franchise}" (${ipContext.keyFacts.length} facts)`);
          }
        }

        if (ipContext) {
          log.info(`Using IP context: "${ipContext.franchise}" (${ipContext.keyFacts.length} facts, source: ${bodyIpContext ? "request" : "cache"})`);
        }
        premiseDivergence = await resolvePremiseDivergence(
          campaignId,
          ipContext,
          campaign.premise,
          gen.resolved,
          premiseDivergence,
        );

        const { scaffold, enrichedIpContext } = await generateWorldScaffold(
          {
            campaignId,
            name: campaign.name,
            premise: campaign.premise,
            seeds: campaign.seeds,
            role: gen.resolved,
            fallbackRole,
            ipContext,
            premiseDivergence,
            research: settings.research,
          },
          async (progress) => {
            debugOperation?.setLabel(progress.label);
            await stream.writeSSE({
              event: "progress",
              data: JSON.stringify(progress),
            });
          }
        );

        // Save enriched ipContext back to cache if facts were added
        if (enrichedIpContext && ipContext && enrichedIpContext.keyFacts.length > ipContext.keyFacts.length) {
          saveIpContext(campaignId, enrichedIpContext);
          log.info(`Saved enriched IP context: ${ipContext.keyFacts.length} → ${enrichedIpContext.keyFacts.length} facts`);
        }

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
        debugOperation?.finish("completed");
      } catch (error) {
        log.error("World generation pipeline failed", error);
        debugOperation?.finish("failed", error);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: getErrorMessage(error, "World generation failed."),
          }),
        });
      } finally {
        clearInterval(keepaliveTimer);
      }
    });
  } catch (error) {
    debugOperation?.finish("failed", error);
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
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    // Load cached IP research for section regeneration
    const ipContext = loadIpContext(campaignId);
    const premiseDivergence = await resolvePremiseDivergence(
      campaignId,
      ipContext,
      campaign.premise,
      gen.resolved,
      loadPremiseDivergence(campaignId),
    );

    const req = {
      campaignId: campaign.id,
      name: campaign.name,
      premise: campaign.premise,
      seeds: campaign.seeds,
      role: gen.resolved,
      premiseDivergence,
    };

    const { section } = result.data;

    switch (section) {
      case "premise": {
        const refinedPremise = await generateRefinedPremiseStep(req, ipContext, result.data.additionalInstruction);
        return c.json({ refinedPremise });
      }
      case "locations": {
        const locations = await generateLocationsStep(req, result.data.refinedPremise, ipContext, result.data.additionalInstruction);
        return c.json({ locations });
      }
      case "factions": {
        const factions = await generateFactionsStep(req, result.data.refinedPremise, result.data.locationNames, ipContext, result.data.additionalInstruction);
        return c.json({ factions });
      }
      case "npcs": {
        const npcs = await generateNpcsStep(req, result.data.refinedPremise, result.data.locationNames, result.data.factionNames, ipContext, result.data.additionalInstruction);
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
    const campaign = await requireLoadedCampaign(c, campaignId);
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

app.get("/worldbook-library", (c) => {
  try {
    return c.json({ items: listWorldbookLibrary() });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to list reusable worldbooks.") },
      getErrorStatus(error),
    );
  }
});

app.post("/worldbook-library/import", async (c) => {
  try {
    const result = await parseBody(c, worldbookLibraryImportSchema);
    if ("response" in result) return result.response;

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) {
      return c.json({ error: gen.error }, gen.status);
    }

    const parsedEntries = parseWorldBook(result.data.worldbook);
    const imported = await importWorldbookToLibrary({
      displayName: result.data.displayName,
      originalFileName: result.data.originalFileName,
      parsedEntries,
      classify: () => classifyEntries(parsedEntries, gen.resolved),
    });

    return c.json(imported);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to import reusable worldbook.") },
      getErrorStatus(error),
    );
  }
});

app.post("/parse-worldbook", async (c) => {
  try {
    const result = await parseBody(c, parseWorldBookSchema);
    if ("response" in result) return result.response;

    const { worldbook } = result.data;

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
    const campaign = await requireLoadedCampaign(c, campaignId);
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
