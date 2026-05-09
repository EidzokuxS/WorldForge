import { Hono } from "hono";
import crypto from "node:crypto";
import type { CharacterDraft } from "@worldforge/shared";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { readCampaignConfig, loadIpContext, loadPremiseDivergence } from "../campaign/index.js";
import { loadSettings } from "../settings/index.js";
import { resolveStartingLocation } from "../worldgen/index.js";
import {
  ingestCharacterDraft,
  IngestionPipelineError,
  type IngestionInput,
  type IngestionContext,
} from "../character/ingestion/index.js";
import {
  createCharacterRecordFromDraft,
  projectPlayerRecord,
  toCharacterDraft,
  toLegacyNpcDraft,
  toLegacyPlayerCharacter,
} from "../character/record-adapters.js";
import { buildCompatibilityTags } from "./compatibility-tags.js";
import { applyStartConditionEffects } from "../engine/start-condition-runtime.js";
import { getDb } from "../db/index.js";
import { items, locations, players } from "../db/schema.js";
import { deriveRuntimeCharacterTags } from "../character/runtime-tags.js";
import { and, eq } from "drizzle-orm";
import {
  parseBody,
  requireLoadedCampaign,
  resolveGenerator,
  setupCharacterEndpoint,
  type CharacterEndpointContext,
} from "./helpers.js";
import { createLogger } from "../lib/index.js";
import {
  generateImage,
  resolveImageProvider,
  buildPortraitPrompt,
  ensureImageDir,
  cacheImage,
} from "../images/index.js";
import { toAuthoritativeItemSeed } from "../inventory/index.js";

const log = createLogger("character-route");
import {
  generateCharacterSchema,
  importV2CardSchema,
  parseCharacterSchema,
  previewCanonicalLoadoutSchema,
  researchCharacterSchema,
  resolveStartingLocationSchema,
  saveCharacterSchema,
} from "./schemas.js";
import { deriveCanonicalLoadout } from "../character/loadout-deriver.js";
import type { Context } from "hono";

const app = new Hono();

type CampaignLocationCandidate = {
  id: string;
  name: string;
  isStarting?: boolean | null;
  kind?: string | null;
  parentLocationId?: string | null;
};

type PlayerStartPlacement =
  | {
      ok: true;
      broadLocationId: string;
      sceneLocationId: string;
      matchedLocation: CampaignLocationCandidate;
    }
  | {
      ok: false;
      error: string;
    };

function resolveDraftLocation(
  draft: CharacterDraft,
  allLocations: CampaignLocationCandidate[],
) {
  const preferredId =
    draft.startConditions.startLocationId ?? draft.socialContext.currentLocationId;
  if (preferredId) {
    const byId = allLocations.find((location) => location.id === preferredId);
    if (byId) {
      return byId;
    }
  }

  const preferredName = draft.socialContext.currentLocationName ?? null;
  if (preferredName) {
    const byName = allLocations.find((location) => location.name === preferredName);
    if (byName) {
      return byName;
    }
  }

  return allLocations.find((location) => location.isStarting) ?? allLocations[0] ?? null;
}

function resolvePlayerStartPlacement(
  matchedLocation: CampaignLocationCandidate,
  allLocations: CampaignLocationCandidate[],
): PlayerStartPlacement {
  if (matchedLocation.kind !== "persistent_sublocation") {
    return {
      ok: true,
      broadLocationId: matchedLocation.id,
      sceneLocationId: matchedLocation.id,
      matchedLocation,
    };
  }

  const parentLocationId = matchedLocation.parentLocationId ?? null;
  const parentLocation = parentLocationId
    ? allLocations.find((location) => location.id === parentLocationId)
    : null;
  if (!parentLocation || parentLocation.kind === "persistent_sublocation") {
    return {
      ok: false,
      error: `Starting location "${matchedLocation.name}" has an unresolved parent location.`,
    };
  }

  return {
    ok: true,
    broadLocationId: parentLocation.id,
    sceneLocationId: matchedLocation.id,
    matchedLocation,
  };
}

function createDraftResponse(campaignId: string, draft: CharacterDraft) {
  const record = createCharacterRecordFromDraft(draft, {
    id: `draft:${draft.identity.displayName || "character"}`,
    campaignId,
  });
  const compatibilityTags = buildCompatibilityTags(record);

  if (draft.identity.role === "npc") {
    return {
      role: "key" as const,
      characterRecord: record,
      draft,
      npc: {
        ...toLegacyNpcDraft(record),
        tags: compatibilityTags,
      },
    };
  }

  return {
    role: "player" as const,
    characterRecord: record,
    draft,
    character: {
      ...toLegacyPlayerCharacter(record),
      tags: compatibilityTags,
    },
  };
}

function createSavedCharacterResponse(
  playerId: string,
  characterRecord: ReturnType<typeof createCharacterRecordFromDraft>,
) {
  const compatibilityTags = buildCompatibilityTags(characterRecord);
  return {
    ok: true,
    playerId,
    characterRecord,
    draft: toCharacterDraft(characterRecord),
    character: {
      ...toLegacyPlayerCharacter(characterRecord),
      tags: compatibilityTags,
    },
  };
}

/**
 * Build the IngestionContext from a setupCharacterEndpoint result.
 * Wires ipContext + premiseDivergence from disk so the pipeline can
 * classify canonical status and feed VS Battles research correctly.
 */
function buildIngestionContext(
  ctx: CharacterEndpointContext,
  campaignId: string,
): IngestionContext {
  const ipContext = loadIpContext(campaignId) ?? null;
  const premiseDivergence = loadPremiseDivergence(campaignId) ?? null;
  return {
    gen: ctx.gen,
    campaign: {
      premise: ctx.campaign.premise,
      ipContext,
      premiseDivergence,
    },
    settings: ctx.settings,
    locationNames: ctx.names.locationNames,
    factionNames: ctx.names.factionNames,
  };
}

/**
 * Convert IngestionPipelineError to 502 with { error, stage, attempts }.
 * Other errors fall through to getErrorStatus/getErrorMessage.
 */
function pipelineErrorResponse(c: Context, error: unknown, fallback: string) {
  if (error instanceof IngestionPipelineError) {
    return c.json(
      { error: error.message, stage: error.stage, attempts: error.attempts },
      502,
    );
  }
  return c.json(
    { error: getErrorMessage(error, fallback) },
    getErrorStatus(error),
  );
}

app.post("/parse-character", async (c) => {
  try {
    const result = await parseBody(c, parseCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, concept, role, locationNames: bodyLoc, factionNames: bodyFac, overrideText } =
      result.data;
    const ctx = await setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    const input: IngestionInput = {
      mode: "parse",
      campaignId,
      role,
      freeText: concept,
      overrideText,
      locationNames: ctx.names.locationNames,
      factionNames: ctx.names.factionNames,
    };
    const draft = await ingestCharacterDraft(input, buildIngestionContext(ctx, campaignId));
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to parse character.");
  }
});

app.post("/generate-character", async (c) => {
  try {
    const result = await parseBody(c, generateCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, role, locationNames: bodyLoc, factionNames: bodyFac, overrideText } =
      result.data;
    const ctx = await setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    const input: IngestionInput = {
      mode: "generate",
      campaignId,
      role,
      overrideText,
      locationNames: ctx.names.locationNames,
      factionNames: ctx.names.factionNames,
    };
    const draft = await ingestCharacterDraft(input, buildIngestionContext(ctx, campaignId));
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to generate character.");
  }
});

app.post("/research-character", async (c) => {
  try {
    const result = await parseBody(c, researchCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, archetype, role, locationNames: bodyLoc, factionNames: bodyFac, overrideText } =
      result.data;
    const ctx = await setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    const input: IngestionInput = {
      mode: "research",
      campaignId,
      role,
      archetype,
      overrideText,
      locationNames: ctx.names.locationNames,
      factionNames: ctx.names.factionNames,
    };
    const draft = await ingestCharacterDraft(input, buildIngestionContext(ctx, campaignId));
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to research character.");
  }
});

app.post("/import-v2-card", async (c) => {
  try {
    const result = await parseBody(c, importV2CardSchema);
    if ("response" in result) return result.response;

    const {
      campaignId,
      name,
      description,
      personality,
      scenario,
      tags,
      mesExample,
      importMode,
      role,
      locationNames: bodyLoc,
      factionNames: bodyFac,
      overrideText,
    } = result.data;
    const ctx = await setupCharacterEndpoint(c, campaignId, role, bodyLoc, bodyFac);
    if (ctx instanceof Response) return ctx;

    const input: IngestionInput = {
      mode: "import",
      campaignId,
      role,
      v2Card: { name, description, personality, scenario, tags, mesExample, importMode },
      overrideText,
      locationNames: ctx.names.locationNames,
      factionNames: ctx.names.factionNames,
    };
    const draft = await ingestCharacterDraft(input, buildIngestionContext(ctx, campaignId));
    return c.json(createDraftResponse(campaignId, draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to import V2 card.");
  }
});

app.post("/save-character", async (c) => {
  try {
    const result = await parseBody(c, saveCharacterSchema);
    if ("response" in result) return result.response;

    const { campaignId, draft } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const db = getDb();

    const allLocations = db
      .select({
        id: locations.id,
        name: locations.name,
        isStarting: locations.isStarting,
        kind: locations.kind,
        parentLocationId: locations.parentLocationId,
      })
      .from(locations)
      .where(eq(locations.campaignId, campaignId))
      .all();
    const matchedLocation = resolveDraftLocation(draft, allLocations);
    if (!matchedLocation) {
      return c.json(
        {
          error: `Location "${draft.socialContext.currentLocationName ?? draft.startConditions.startLocationId ?? "unknown"}" not found in this campaign.`,
        },
        400,
      );
    }
    const placement = resolvePlayerStartPlacement(matchedLocation, allLocations);
    if (!placement.ok) {
      return c.json({ error: placement.error }, 400);
    }

    const existingPlayer = db
      .select({ id: players.id })
      .from(players)
      .where(eq(players.campaignId, campaignId))
      .get();

    if (existingPlayer) {
      db.delete(items)
        .where(and(eq(items.campaignId, campaignId), eq(items.ownerId, existingPlayer.id)))
        .run();
    }

    db.delete(players).where(eq(players.campaignId, campaignId)).run();

    const playerId = crypto.randomUUID();
    const canonicalLoadout = deriveCanonicalLoadout(draft);
    const draftRecord = createCharacterRecordFromDraft(
      {
        ...draft,
        socialContext: {
          ...draft.socialContext,
          currentLocationId: placement.sceneLocationId,
          currentLocationName: placement.matchedLocation.name,
        },
        startConditions: {
          ...draft.startConditions,
          startLocationId: placement.sceneLocationId,
        },
        loadout: canonicalLoadout.loadout,
      },
      {
        id: playerId,
        campaignId,
      },
    );
    const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;
    const { record: characterRecord } = applyStartConditionEffects(draftRecord, {
      currentTick,
      currentLocationId: placement.sceneLocationId,
    });
    const projection = projectPlayerRecord(characterRecord);

    db.insert(players)
      .values({
        id: playerId,
        campaignId,
        ...projection,
        currentLocationId: placement.broadLocationId,
        currentSceneLocationId: placement.sceneLocationId,
      })
      .run();

    if (canonicalLoadout.items.length > 0) {
      db.insert(items)
        .values(
          canonicalLoadout.items.map((item) =>
            toAuthoritativeItemSeed(campaignId, playerId, item),
          ),
        )
        .run();
    }

    // Fire-and-forget: generate portrait if image generation is enabled
    const settings = loadSettings();
    const imgProvider = resolveImageProvider(settings);
    if (imgProvider) {
      void (async () => {
        try {
          const prompt = buildPortraitPrompt({
            name: characterRecord.identity.displayName,
            race: characterRecord.profile.species,
            gender: characterRecord.profile.gender,
            age: characterRecord.profile.ageText,
            appearance: characterRecord.profile.appearance,
            tags: deriveRuntimeCharacterTags(characterRecord),
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

    return c.json(createSavedCharacterResponse(playerId, characterRecord));
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save character.") },
      getErrorStatus(error)
    );
  }
});

app.post("/preview-loadout", async (c) => {
  try {
    const result = await parseBody(c, previewCanonicalLoadoutSchema);
    if ("response" in result) return result.response;

    const { campaignId, draft } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    return c.json(deriveCanonicalLoadout(draft));
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to preview canonical loadout.") },
      getErrorStatus(error),
    );
  }
});

// ───── Starting Location ─────

app.post("/resolve-starting-location", async (c) => {
  try {
    const result = await parseBody(c, resolveStartingLocationSchema);
    if ("response" in result) return result.response;

    const { campaignId, prompt: userPrompt } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const db = getDb();
    const allLocations = db.select({
      id: locations.id,
      name: locations.name,
      isStarting: locations.isStarting,
      kind: locations.kind,
      parentLocationId: locations.parentLocationId,
    })
      .from(locations).where(eq(locations.campaignId, campaignId)).all();

    if (allLocations.length === 0) {
      return c.json({ error: "No locations found." }, 400);
    }

    const settings = loadSettings();
    const gen = resolveGenerator(settings);
    if ("error" in gen) return c.json({ error: gen.error }, gen.status);

    const resolved = await resolveStartingLocation({
      premise: campaign.premise,
      locations: allLocations,
      userPrompt,
      role: gen.resolved,
    });

    return c.json(resolved);
  } catch (error) {
    return c.json({ error: getErrorMessage(error, "Failed to resolve starting location.") }, getErrorStatus(error));
  }
});

export default app;
