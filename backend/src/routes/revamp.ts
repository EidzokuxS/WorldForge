import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  type CharacterDraft,
  type RevampWorldNode,
} from "@worldforge/shared";
import {
  ingestCharacterDraft,
  IngestionPipelineError,
  type IngestionContext,
  type IngestionInput,
} from "../character/ingestion/index.js";
import { loadIpContext, loadPremiseDivergence } from "../campaign/index.js";
import { assertSafeId } from "../campaign/paths.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import { parseBody, requireLoadedCampaign, resolveGenerator } from "./helpers.js";
import { characterDraftSchema } from "./schemas.js";
import {
  readOrCreateRevampKernel,
  saveRevampPlayerCharacter,
} from "../revamp/cast-kernel.js";
import { composeRevampKernelWorldGraph } from "../revamp/graph-kernel.js";
import { createRevampOpening } from "../revamp/opening-kernel.js";
import { createRevampStartingSetup } from "../revamp/setup-kernel.js";

const app = new Hono();

const revampPlayerSourceSchema = z.enum(["player_created", "player_imported"]);

const revampParsePlayerSchema = z.object({
  concept: z.string().trim().min(1, "Character concept is required.").max(2000),
  overrideText: z.string().trim().max(2000).optional(),
}).strip();

const revampImportV2CardSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  tags: z.array(z.string()).default([]),
  mesExample: z.string().default(""),
  importMode: z.enum(["native", "outsider"]).default("native"),
  overrideText: z.string().trim().max(2000).optional(),
}).strip();

const revampSavePlayerSchema = z.object({
  draft: characterDraftSchema,
  source: revampPlayerSourceSchema.default("player_created"),
}).strip();

const revampStartSetupSchema = z.object({
  mode: z.enum(["gm_invented", "user_guided"]).default("gm_invented"),
  userStart: z.string().trim().max(2000).optional(),
}).strip();

function locationNamesFromKernel(nodes: RevampWorldNode[]): string[] {
  return nodes
    .filter((node) => node.type === "Location" || node.type === "SceneLocation")
    .map((node) => node.name.trim())
    .filter(Boolean);
}

function buildRevampIngestionContext(input: {
  campaignId: string;
  premise: string;
  gen: IngestionContext["gen"];
  settings: IngestionContext["settings"];
  locationNames: string[];
}): IngestionContext {
  return {
    gen: input.gen,
    campaign: {
      premise: input.premise,
      ipContext: loadIpContext(input.campaignId) ?? null,
      premiseDivergence: loadPremiseDivergence(input.campaignId) ?? null,
    },
    settings: input.settings,
    locationNames: input.locationNames,
    factionNames: [],
  };
}

async function preparePlayerIngestion(c: Context, campaignId: string) {
  const campaign = await requireLoadedCampaign(c, campaignId);
  if (campaign instanceof Response) {
    return campaign;
  }

  const settings = loadSettings();
  const gen = resolveGenerator(settings);
  if ("error" in gen) {
    return c.json({ error: gen.error }, gen.status);
  }

  const kernel = readOrCreateRevampKernel(campaignId);
  const locationNames = locationNamesFromKernel(kernel.worldGraph.nodes);
  return {
    campaign,
    gen: gen.resolved,
    settings,
    kernel,
    locationNames,
  };
}

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

function draftResponse(draft: CharacterDraft) {
  return { draft };
}

app.get("/campaigns/:id/kernel", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    return c.json({ kernel: readOrCreateRevampKernel(campaignId) });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load revamp kernel.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/player/parse", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, revampParsePlayerSchema);
    if ("response" in result) return result.response;

    const ctx = await preparePlayerIngestion(c, campaignId);
    if (ctx instanceof Response) return ctx;

    const input: IngestionInput = {
      mode: "parse",
      campaignId,
      role: "player",
      freeText: result.data.concept,
      overrideText: result.data.overrideText,
      locationNames: ctx.locationNames,
      factionNames: [],
    };
    const draft = await ingestCharacterDraft(
      input,
      buildRevampIngestionContext({
        campaignId,
        premise: ctx.kernel.premise || ctx.campaign.premise,
        gen: ctx.gen,
        settings: ctx.settings,
        locationNames: ctx.locationNames,
      }),
    );
    return c.json(draftResponse(draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to parse revamp player character.");
  }
});

app.post("/campaigns/:id/player/import-v2-card", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, revampImportV2CardSchema);
    if ("response" in result) return result.response;

    const ctx = await preparePlayerIngestion(c, campaignId);
    if (ctx instanceof Response) return ctx;

    const input: IngestionInput = {
      mode: "import",
      campaignId,
      role: "player",
      v2Card: {
        name: result.data.name,
        description: result.data.description,
        personality: result.data.personality,
        scenario: result.data.scenario,
        tags: result.data.tags,
        mesExample: result.data.mesExample,
        importMode: result.data.importMode,
      },
      overrideText: result.data.overrideText,
      locationNames: ctx.locationNames,
      factionNames: [],
    };
    const draft = await ingestCharacterDraft(
      input,
      buildRevampIngestionContext({
        campaignId,
        premise: ctx.kernel.premise || ctx.campaign.premise,
        gen: ctx.gen,
        settings: ctx.settings,
        locationNames: ctx.locationNames,
      }),
    );
    return c.json(draftResponse(draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to import revamp player character.");
  }
});

app.post("/campaigns/:id/cast/player", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, revampSavePlayerSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const kernel = saveRevampPlayerCharacter({
      campaignId,
      draft: result.data.draft,
      source: result.data.source,
    });

    return c.json({
      kernel,
      playerCharacter: kernel.castRegistry.playerCharacter,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to save revamp player character.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/graph/compose", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const kernel = composeRevampKernelWorldGraph(campaignId);

    return c.json({
      kernel,
      worldGraph: kernel.worldGraph,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to compose revamp world graph.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/setup/start", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, revampStartSetupSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const kernel = createRevampStartingSetup({
      campaignId,
      mode: result.data.mode,
      userStart: result.data.userStart,
    });

    return c.json({
      kernel,
      startingSetup: kernel.startingSetup,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to create revamp starting setup.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/opening", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const result = createRevampOpening({ campaignId });

    return c.json(result);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to create revamp opening.") },
      getErrorStatus(error),
    );
  }
});

export default app;
