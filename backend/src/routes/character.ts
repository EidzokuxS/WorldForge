import { Hono } from "hono";
import crypto from "node:crypto";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import { resolveStartingLocation } from "../worldgen/index.js";
import { parseCharacterDescription, generateCharacter, generateCharacterFromArchetype, mapV2CardToCharacter, parseNpcDescription, mapV2CardToNpc, generateNpcFromArchetype, researchArchetype } from "../character/index.js";
import {
  createCharacterRecordFromDraft,
  toLegacyNpcDraft,
  toLegacyPlayerCharacter,
} from "../character/record-adapters.js";
import { getDb } from "../db/index.js";
import { locations, players } from "../db/schema.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { eq } from "drizzle-orm";
import { parseBody, requireActiveCampaign, resolveGenerator, setupCharacterEndpoint } from "./helpers.js";
import { createLogger } from "../lib/index.js";
import {
  generateImage,
  resolveImageProvider,
  buildPortraitPrompt,
  ensureImageDir,
  cacheImage,
} from "../images/index.js";

const log = createLogger("character-route");
import {
  generateCharacterSchema,
  importV2CardSchema,
  parseCharacterSchema,
  researchCharacterSchema,
  resolveStartingLocationSchema,
  saveCharacterSchema,
} from "./schemas.js";

const app = new Hono();

function createDraftResponse(
  campaignId: string,
  draft: Awaited<ReturnType<typeof parseCharacterDescription>>,
) {
  const record = createCharacterRecordFromDraft(draft, {
    id: `draft:${draft.identity.displayName || "character"}`,
    campaignId,
  });

  if (draft.identity.role === "npc") {
    return {
      role: "key" as const,
      draft,
      npc: toLegacyNpcDraft(record),
    };
  }

  return {
    role: "player" as const,
    draft,
    character: toLegacyPlayerCharacter(record),
  };
}

app.post("/parse-character", async (c) => {
  try {
    const result = await parseBody(c, parseCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, concept, role, locationNames: bodyLoc, factionNames: bodyFac } = result.data;
    const ctx = setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    if (role === "key") {
      const draft = await parseNpcDescription({
        description: concept, premise: ctx.campaign.premise,
        locationNames: ctx.names.locationNames, factionNames: ctx.names.factionNames,
        role: ctx.gen,
      });
      return c.json(createDraftResponse(campaignId, draft));
    }

    const draft = await parseCharacterDescription({
      description: concept, premise: ctx.campaign.premise,
      locationNames: ctx.names.locationNames, role: ctx.gen,
    });
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return c.json({ error: getErrorMessage(error, "Failed to parse character.") }, getErrorStatus(error));
  }
});

app.post("/generate-character", async (c) => {
  try {
    const result = await parseBody(c, generateCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, role, locationNames: bodyLoc, factionNames: bodyFac } = result.data;
    const ctx = setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    if (role === "key") {
      const draft = await generateNpcFromArchetype({
        archetype: "a compelling and unique character",
        premise: ctx.campaign.premise,
        locationNames: ctx.names.locationNames, factionNames: ctx.names.factionNames,
        role: ctx.gen,
      });
      return c.json(createDraftResponse(campaignId, draft));
    }

    const draft = await generateCharacter({
      premise: ctx.campaign.premise,
      locationNames: ctx.names.locationNames, factionNames: ctx.names.factionNames,
      role: ctx.gen,
    });
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return c.json({ error: getErrorMessage(error, "Failed to generate character.") }, getErrorStatus(error));
  }
});

app.post("/research-character", async (c) => {
  try {
    const result = await parseBody(c, researchCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, archetype, role, locationNames: bodyLoc, factionNames: bodyFac } = result.data;
    const ctx = setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    const researchContext = await researchArchetype({
      archetype, role: ctx.gen, research: ctx.settings.research,
    });

    if (role === "key") {
      const draft = await generateNpcFromArchetype({
        archetype, premise: ctx.campaign.premise,
        locationNames: ctx.names.locationNames, factionNames: ctx.names.factionNames,
        role: ctx.gen, researchContext,
      });
      return c.json(createDraftResponse(campaignId, draft));
    }

    const draft = await generateCharacterFromArchetype({
      archetype, premise: ctx.campaign.premise,
      locationNames: ctx.names.locationNames, factionNames: ctx.names.factionNames,
      role: ctx.gen, researchContext,
    });
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return c.json({ error: getErrorMessage(error, "Failed to research character.") }, getErrorStatus(error));
  }
});

app.post("/import-v2-card", async (c) => {
  try {
    const result = await parseBody(c, importV2CardSchema);
    if ("response" in result) return result.response;

    const { campaignId, name, description, personality, scenario, tags, importMode, role, locationNames: bodyLoc, factionNames: bodyFac } = result.data;
    const ctx = setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    if (role === "key") {
      const draft = await mapV2CardToNpc({
        name, description, personality, scenario, v2Tags: tags, importMode,
        premise: ctx.campaign.premise,
        locationNames: ctx.names.locationNames, factionNames: ctx.names.factionNames,
        role: ctx.gen,
      });
      return c.json(createDraftResponse(campaignId, draft));
    }

    const draft = await mapV2CardToCharacter({
      name, description, personality, scenario, v2Tags: tags, importMode,
      premise: ctx.campaign.premise, locationNames: ctx.names.locationNames,
      role: ctx.gen,
    });
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return c.json({ error: getErrorMessage(error, "Failed to import V2 card.") }, getErrorStatus(error));
  }
});

app.post("/save-character", async (c) => {
  try {
    const result = await parseBody(c, saveCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, draft } = result.data;
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const db = getDb();

    // Find matching location by name
    const allLocations = db
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const matchedLocation = allLocations.find(
      (l) => l.name === draft.socialContext.currentLocationName,
    );
    if (!matchedLocation) {
      return c.json(
        {
          error: `Location "${draft.socialContext.currentLocationName}" not found in this campaign.`,
        },
        400,
      );
    }

    // Delete existing player for this campaign (single player per campaign)
    db.delete(players).where(eq(players.campaignId, campaignId)).run();

    const playerId = crypto.randomUUID();
    const characterRecord = createCharacterRecordFromDraft(
      {
        ...draft,
        socialContext: {
          ...draft.socialContext,
          currentLocationId: matchedLocation.id,
          currentLocationName: matchedLocation.name,
        },
      },
      {
        id: playerId,
        campaignId,
      },
    );
    const legacyCharacter = toLegacyPlayerCharacter(characterRecord);
    const derivedTags = deriveRuntimeCharacterTags(characterRecord);

    db.insert(players)
      .values({
        id: playerId,
        campaignId,
        name: legacyCharacter.name,
        race: legacyCharacter.race,
        gender: legacyCharacter.gender,
        age: legacyCharacter.age,
        appearance: legacyCharacter.appearance,
        hp: legacyCharacter.hp,
        characterRecord: JSON.stringify(characterRecord),
        derivedTags: JSON.stringify(derivedTags),
        tags: JSON.stringify(legacyCharacter.tags),
        equippedItems: JSON.stringify(legacyCharacter.equippedItems),
        currentLocationId: matchedLocation.id,
      })
      .run();

    // Fire-and-forget: generate portrait if image generation is enabled
    const settings = loadSettings();
    const imgProvider = resolveImageProvider(settings);
    if (imgProvider) {
      void (async () => {
        try {
          const prompt = buildPortraitPrompt({
            name: legacyCharacter.name,
            race: legacyCharacter.race,
            gender: legacyCharacter.gender,
            age: legacyCharacter.age,
            appearance: legacyCharacter.appearance,
            tags: legacyCharacter.tags,
            stylePrompt: settings.images.stylePrompt,
          });
          ensureImageDir(campaignId, "portraits");
          const imageData = await generateImage({ prompt, provider: imgProvider.provider, model: imgProvider.model });
          cacheImage(campaignId, "portraits", `${playerId}.png`, imageData);
        } catch (err) {
          log.warn("Portrait generation failed (non-blocking)", err);
        }
      })();
    }

    return c.json({ ok: true, playerId });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save character.") },
      getErrorStatus(error)
    );
  }
});

// ───── Starting Location ─────

app.post("/resolve-starting-location", async (c) => {
  try {
    const result = await parseBody(c, resolveStartingLocationSchema);
    if ("response" in result) return result.response;

    const { campaignId, prompt: userPrompt } = result.data;
    const campaign = requireActiveCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const db = getDb();
    const allLocations = db.select({ id: locations.id, name: locations.name, isStarting: locations.isStarting })
      .from(locations).where(eq(locations.campaignId, campaignId)).all();

    if (allLocations.length === 0) {
      return c.json({ error: "No locations found." }, 400);
    }

    if (!userPrompt?.trim()) {
      const starting = allLocations.find((l) => l.isStarting) ?? allLocations[0];
      return c.json({ locationId: starting.id, locationName: starting.name, narrative: null });
    }

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) return c.json({ error: gen.error }, gen.status);

    const locationNames = allLocations.map((l) => l.name);
    const resolved = await resolveStartingLocation({
      premise: campaign.premise,
      locationNames,
      userPrompt,
      role: gen.resolved,
    });

    const matched = allLocations.find((l) => l.name === resolved.locationName) ?? allLocations.find((l) => l.isStarting) ?? allLocations[0];
    return c.json({ locationId: matched.id, locationName: matched.name, narrative: resolved.narrative });
  } catch (error) {
    return c.json({ error: getErrorMessage(error, "Failed to resolve starting location.") }, getErrorStatus(error));
  }
});

export default app;
