import { Hono } from "hono";
import type { Context } from "hono";
import { z } from "zod";
import {
  type CampaignKernel,
  type CampaignWorldDna,
  type CharacterDraft,
  type CampaignWorldNode as KernelWorldNode,
  type SeedCategory,
  type WorldSeeds,
} from "@worldforge/shared";
import {
  ingestCharacterDraft,
  IngestionPipelineError,
  type IngestionContext,
  type IngestionInput,
} from "../character/ingestion/index.js";
import {
  loadIpContext,
  loadPremiseDivergence,
  loadWorldgenResearchArtifact,
  saveIpContext,
  savePremiseDivergence,
  saveWorldgenResearchArtifact,
  saveWorldSeeds,
} from "../campaign/index.js";
import { readCampaignConfig } from "../campaign/manager.js";
import { assertSafeId } from "../campaign/paths.js";
import { getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import { parseBody, requireLoadedCampaign, resolveGenerator } from "./helpers.js";
import { characterDraftSchema } from "./schemas.js";
import { suggestSingleSeed, suggestWorldSeeds } from "../worldgen/index.js";
import { researchWorldgenArtifact } from "../worldgen/ip-researcher.js";
import { composeSelectedWorldbooks } from "../worldbook-library/index.js";
import {
  readOrCreateCampaignKernel,
  saveCampaignPlayerCharacter as savePlayerCharacterInKernel,
} from "../campaign-kernel/cast-kernel.js";
import { composeCampaignKernelWorldGraph as composeCampaignWorldGraph } from "../campaign-kernel/graph-kernel.js";
import { advanceCampaignKernelToWorldReady } from "../campaign-kernel/dna-adapter.js";
import { createCampaignChatMessage } from "../campaign-kernel/chat-kernel.js";
import { buildCampaignDebugSnapshot } from "../campaign-kernel/debug-snapshot.js";
import { createCampaignOpening } from "../campaign-kernel/opening-kernel.js";
import { createCampaignStartingSetup } from "../campaign-kernel/setup-kernel.js";
import { applyCampaignStateWriter } from "../campaign-kernel/state-writer.js";

const app = new Hono();

const seedCategorySchema = z.enum([
  "geography",
  "politicalStructure",
  "centralConflict",
  "culturalFlavor",
  "environment",
  "wildcard",
]);

const playerSourceSchema = z.enum(["player_created", "player_imported"]);

const parsePlayerSchema = z.object({
  concept: z.string().trim().min(1, "Character concept is required.").max(2000),
  overrideText: z.string().trim().max(2000).optional(),
}).strip();

const importCardSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  personality: z.string().default(""),
  scenario: z.string().default(""),
  tags: z.array(z.string()).default([]),
  mesExample: z.string().default(""),
  importMode: z.enum(["native", "outsider"]).default("native"),
  overrideText: z.string().trim().max(2000).optional(),
}).strip();

const savePlayerSchema = z.object({
  draft: characterDraftSchema,
  source: playerSourceSchema.default("player_created"),
}).strip();

const worldSeedsSchema = z.object({
  geography: z.string().trim().min(1, "Geography is required.").max(2000),
  politicalStructure: z.string().trim().min(1, "Political structure is required.").max(2000),
  centralConflict: z.string().trim().min(1, "Central conflict is required.").max(2000),
  culturalFlavor: z.array(z.string().trim().min(1)).min(1, "Cultural flavor is required.").max(12),
  environment: z.string().trim().min(1, "Environment is required.").max(2000),
  wildcard: z.string().trim().min(1, "Wildcard is required.").max(2000),
}).strip();

const applyWorldDnaSchema = z.object({
  seeds: worldSeedsSchema.optional(),
}).strip();

const suggestWorldDnaCategorySchema = z.object({
  category: seedCategorySchema,
}).strip();

const startSetupSchema = z.object({
  mode: z.enum(["gm_invented", "user_guided"]).default("gm_invented"),
  userStart: z.string().trim().max(2000).optional(),
}).strip();

const chatMessageSchema = z.object({
  message: z.string().trim().min(1, "Message is required.").max(4000),
}).strip();

function locationNamesFromKernel(nodes: KernelWorldNode[]): string[] {
  return nodes
    .filter((node) => node.type === "Location" || node.type === "SceneLocation")
    .map((node) => node.name.trim())
    .filter(Boolean);
}

function hasCompleteWorldSeeds(seeds: Partial<WorldSeeds> | undefined): seeds is WorldSeeds {
  return Boolean(
    seeds?.geography?.trim()
      && seeds.politicalStructure?.trim()
      && seeds.centralConflict?.trim()
      && seeds.environment?.trim()
      && seeds.wildcard?.trim()
      && Array.isArray(seeds.culturalFlavor)
      && seeds.culturalFlavor.some((value) => value.trim()),
  );
}

function readForgeKernel(campaignId: string): CampaignKernel {
  const kernel = readOrCreateCampaignKernel(campaignId);
  if (kernel.phase !== "draft" || kernel.worldDna) {
    return kernel;
  }

  const config = readCampaignConfig(campaignId);
  if (!hasCompleteWorldSeeds(config.seeds)) {
    return kernel;
  }

  return advanceCampaignKernelToWorldReady(campaignId);
}

function formatWorldDnaForPlayerContext(worldDna: CampaignWorldDna | null): string {
  if (!worldDna) {
    return "";
  }

  return [
    "Accepted World DNA:",
    `Geography: ${worldDna.geography}`,
    `Political structure: ${worldDna.politicalStructure}`,
    `Central conflict: ${worldDna.centralConflict}`,
    `Cultural flavor: ${worldDna.culturalFlavor}`,
    `Environment: ${worldDna.environment}`,
    `Wildcard: ${worldDna.wildcard}`,
  ].join("\n");
}

function playerPremiseContext(input: {
  campaignPremise: string;
  kernel: CampaignKernel;
}): string {
  const premise = input.kernel.premise || input.campaignPremise;
  const worldDna = formatWorldDnaForPlayerContext(input.kernel.worldDna);
  return worldDna ? `${premise}\n\n${worldDna}` : premise;
}

function buildPlayerIngestionContext(input: {
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

  const kernel = readForgeKernel(campaignId);
  const locationNames = locationNamesFromKernel(kernel.worldGraph.nodes);
  return {
    campaign,
    gen: gen.resolved,
    settings,
    kernel,
    locationNames,
  };
}

async function prepareWorldDnaSuggestion(c: Context, campaignId: string) {
  const campaign = await requireLoadedCampaign(c, campaignId);
  if (campaign instanceof Response) {
    return campaign;
  }

  const settings = loadSettings();
  const gen = resolveGenerator(settings);
  if ("error" in gen) {
    return c.json({ error: gen.error }, gen.status);
  }

  const config = readCampaignConfig(campaignId);
  let researchArtifact = loadWorldgenResearchArtifact(campaignId);
  let ipContext = researchArtifact ? null : loadIpContext(campaignId);
  let premiseDivergence = researchArtifact ? null : loadPremiseDivergence(campaignId);

  if (!ipContext && !researchArtifact && config.worldbookSelection?.length) {
    const composed = await composeSelectedWorldbooks(config.worldbookSelection, campaign.premise);
    ipContext = composed.ipContext;
    saveIpContext(campaignId, ipContext);
  }

  if (!ipContext && !researchArtifact && config.worldgenResearchEnabled !== false) {
    researchArtifact = await researchWorldgenArtifact(
      {
        premise: campaign.premise,
        name: campaign.name,
        knownIP: config.worldgenSourceHint,
        research: settings.research,
      },
      gen.resolved,
      settings.research.maxSearchSteps,
    );
    if (researchArtifact) {
      ipContext = null;
      premiseDivergence = null;
      saveWorldgenResearchArtifact(campaignId, researchArtifact);
    }
  }

  const premise =
    campaign.premise.trim()
    || researchArtifact?.rawPremise.trim()
    || (ipContext ? `A world based on the ${ipContext.franchise} setting` : "");
  if (!premise) {
    return c.json(
      { error: "Campaign premise or source context is required before World DNA can be re-rolled." },
      400,
    );
  }

  return {
    campaign,
    gen: gen.resolved,
    ipContext,
    premise,
    premiseDivergence,
    researchArtifact,
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

    return c.json({ kernel: readForgeKernel(campaignId) });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load campaign kernel.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/world-dna/apply", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, applyWorldDnaSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const campaignMeta = result.data.seeds
      ? saveWorldSeeds(campaignId, result.data.seeds as WorldSeeds)
      : campaign;
    const kernel = advanceCampaignKernelToWorldReady(campaignId);

    return c.json({
      campaign: campaignMeta,
      kernel,
      worldDna: kernel.worldDna,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to apply World DNA.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/world-dna/suggest", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const ctx = await prepareWorldDnaSuggestion(c, campaignId);
    if (ctx instanceof Response) return ctx;

    const result = await suggestWorldSeeds({
      premise: ctx.premise,
      name: ctx.campaign.name,
      role: ctx.gen,
      ipContext: ctx.ipContext,
      premiseDivergence: ctx.premiseDivergence,
      researchArtifact: ctx.researchArtifact,
    });
    if (result.premiseDivergence) {
      savePremiseDivergence(campaignId, result.premiseDivergence);
    }

    return c.json({ seeds: result.seeds });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to re-roll World DNA.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/world-dna/suggest-category", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, suggestWorldDnaCategorySchema);
    if ("response" in result) return result.response;

    const ctx = await prepareWorldDnaSuggestion(c, campaignId);
    if (ctx instanceof Response) return ctx;

    const category = result.data.category as SeedCategory;
    const value = await suggestSingleSeed({
      premise: ctx.premise,
      name: ctx.campaign.name,
      category,
      role: ctx.gen,
      ipContext: ctx.ipContext,
      premiseDivergence: ctx.premiseDivergence,
      researchArtifact: ctx.researchArtifact,
    });

    return c.json({ category, value });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to re-roll World DNA field.") },
      getErrorStatus(error),
    );
  }
});

app.get("/campaigns/:id/debug", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    return c.json({
      snapshot: buildCampaignDebugSnapshot(readOrCreateCampaignKernel(campaignId)),
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to load campaign debug snapshot.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/player/parse", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, parsePlayerSchema);
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
      buildPlayerIngestionContext({
        campaignId,
        premise: playerPremiseContext({
          campaignPremise: ctx.campaign.premise,
          kernel: ctx.kernel,
        }),
        gen: ctx.gen,
        settings: ctx.settings,
        locationNames: ctx.locationNames,
      }),
    );
    return c.json(draftResponse(draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to parse player character.");
  }
});

app.post("/campaigns/:id/player/import-card", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, importCardSchema);
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
      buildPlayerIngestionContext({
        campaignId,
        premise: playerPremiseContext({
          campaignPremise: ctx.campaign.premise,
          kernel: ctx.kernel,
        }),
        gen: ctx.gen,
        settings: ctx.settings,
        locationNames: ctx.locationNames,
      }),
    );
    return c.json(draftResponse(draft));
  } catch (error) {
    return pipelineErrorResponse(c, error, "Failed to import player character.");
  }
});

app.post("/campaigns/:id/cast/player", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, savePlayerSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const kernel = savePlayerCharacterInKernel({
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
      { error: getErrorMessage(error, "Failed to save player character.") },
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

    const kernel = composeCampaignWorldGraph(campaignId);

    return c.json({
      kernel,
      worldGraph: kernel.worldGraph,
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to compose world graph.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/setup/start", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, startSetupSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const kernel = createCampaignStartingSetup({
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
      { error: getErrorMessage(error, "Failed to create starting setup.") },
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

    const result = createCampaignOpening({ campaignId });

    return c.json(result);
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to create opening.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/chat/message", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const result = await parseBody(c, chatMessageSchema);
    if ("response" in result) return result.response;

    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    return c.json(createCampaignChatMessage({
      campaignId,
      message: result.data.message,
    }));
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to process chat message.") },
      getErrorStatus(error),
    );
  }
});

app.post("/campaigns/:id/state/apply", async (c) => {
  try {
    const campaignId = c.req.param("id");
    assertSafeId(campaignId);
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    return c.json(applyCampaignStateWriter({ campaignId }));
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to apply state writer.") },
      getErrorStatus(error),
    );
  }
});

export default app;
