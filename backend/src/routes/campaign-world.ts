import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import type {
  CampaignWorldBuild,
  CampaignWorldState,
} from "@worldforge/shared";
import { createModel } from "../ai/index.js";
import { loadCampaign } from "../campaign/index.js";
import {
  campaignWorldBuildService,
  campaignWorldPlayerMessages,
  campaignWorldSourceService,
  CampaignWorldDatabaseError,
  CampaignWorldRepositoryError,
  CampaignWorldSourceError,
  createCampaignWorldRepository,
  openCampaignWorldDatabase,
  type CampaignWorldBuildService,
  type CampaignWorldSourceService,
  type StoredCampaignWorldBuild,
} from "../campaign-world/index.js";
import { getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import { resolveGenerator } from "./helpers.js";

const exactText = (maximum: number) => z.string()
  .min(1)
  .max(maximum)
  .refine((value) => value === value.trim());

const dnaSchema = z.object({
  geography: exactText(2_000),
  politicalStructure: exactText(2_000),
  centralConflict: exactText(2_000),
  culturalFlavor: exactText(2_000),
  environment: exactText(2_000),
  wildcard: exactText(2_000),
}).strict();

const startBuildSchema = z.object({
  expectedSourceDigest: exactText(128),
}).strict();

const acceptWorldSchema = z.object({
  expectedVersion: z.number().int().min(1),
  expectedContentHash: exactText(128),
}).strict();

type RouteStatus = 400 | 404 | 409 | 500;

interface RouteFailure {
  code: string;
  message: string;
  status: RouteStatus;
}

interface CampaignWorldRouteDependencies {
  buildService: CampaignWorldBuildService;
  sourceService: CampaignWorldSourceService;
  loadCampaign: typeof loadCampaign;
  loadSettings: typeof loadSettings;
  resolveGenerator: typeof resolveGenerator;
  createModel: typeof createModel;
  openDatabase: typeof openCampaignWorldDatabase;
  now: () => number;
  eventPollMilliseconds: number;
}

function failureResponse(c: Context, failure: RouteFailure): Response {
  return c.json({
    error: {
      code: failure.code,
      message: failure.message,
    },
  }, failure.status);
}

function sourceFailure(error: CampaignWorldSourceError): RouteFailure {
  switch (error.code) {
    case "campaign_source_invalid":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.campaignSourceInvalid,
        status: 400,
      };
    case "campaign_dna_invalid":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.campaignDnaInvalid,
        status: 400,
      };
    case "world_build_running":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.worldBuildRunning,
        status: 409,
      };
    case "campaign_world_exists":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.campaignWorldExists,
        status: 409,
      };
  }
}

function repositoryFailure(error: CampaignWorldRepositoryError): RouteFailure {
  switch (error.code) {
    case "campaign_recreation_required":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.campaignRecreationRequired,
        status: 409,
      };
    case "world_build_running":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.worldBuildRunning,
        status: 409,
      };
    case "campaign_world_exists":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.campaignWorldExists,
        status: 409,
      };
    case "source_changed":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.sourceChanged,
        status: 409,
      };
    case "world_version_conflict":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.worldVersionConflict,
        status: 409,
      };
    case "world_not_in_review":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.worldNotInReview,
        status: 409,
      };
    case "build_not_found":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.buildNotFound,
        status: 404,
      };
    case "world_not_found":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.worldNotFound,
        status: 404,
      };
    case "build_not_running":
    case "invalid_build_transition":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.requestFailed,
        status: 409,
      };
    case "world_state_corrupt":
      return {
        code: error.code,
        message: campaignWorldPlayerMessages.worldStateCorrupt,
        status: 500,
      };
  }
}

function databaseFailure(error: CampaignWorldDatabaseError): RouteFailure {
  if (error.code === "campaign_schema_outdated") {
    return {
      code: error.code,
      message: campaignWorldPlayerMessages.campaignSchemaOutdated,
      status: 409,
    };
  }
  if (error.code === "campaign_record_missing") {
    return {
      code: error.code,
      message: campaignWorldPlayerMessages.campaignNotFound,
      status: 404,
    };
  }
  return {
    code: error.code,
    message: campaignWorldPlayerMessages.requestFailed,
    status: 500,
  };
}

function routeFailure(error: unknown): RouteFailure {
  if (error instanceof CampaignWorldSourceError) return sourceFailure(error);
  if (error instanceof CampaignWorldRepositoryError) return repositoryFailure(error);
  if (error instanceof CampaignWorldDatabaseError) return databaseFailure(error);
  return {
    code: "campaign_world_request_failed",
    message: campaignWorldPlayerMessages.requestFailed,
    status: 500,
  };
}

async function parseRequest<T>(
  c: Context,
  schema: z.ZodType<T>,
): Promise<T | Response> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch {
    return failureResponse(c, {
      code: "invalid_request",
      message: campaignWorldPlayerMessages.invalidRequest,
      status: 400,
    });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return failureResponse(c, {
      code: "invalid_request",
      message: campaignWorldPlayerMessages.invalidRequest,
      status: 400,
    });
  }
  return parsed.data;
}

async function requireCampaign(
  c: Context,
  campaignId: string,
  dependencies: CampaignWorldRouteDependencies,
): Promise<Response | null> {
  try {
    await dependencies.loadCampaign(campaignId);
    return null;
  } catch (error) {
    if (getErrorStatus(error) === 404) {
      return failureResponse(c, {
        code: "campaign_not_found",
        message: campaignWorldPlayerMessages.campaignNotFound,
        status: 404,
      });
    }
    return failureResponse(c, routeFailure(error));
  }
}

function projectBuild(build: StoredCampaignWorldBuild): CampaignWorldBuild {
  return {
    buildId: build.buildId,
    status: build.status,
    stage: build.stage,
    lastEventSequence: build.lastEventSequence,
    sourceDigest: build.sourceDigest,
    errorCode: build.errorCode,
  };
}

function stateWithCursor(
  state: CampaignWorldState,
  build: StoredCampaignWorldBuild | null,
) {
  return {
    ...state,
    currentBuildId: build?.buildId ?? null,
    currentStage: build?.stage ?? null,
    lastEventSequence: build?.lastEventSequence ?? 0,
  };
}

function parseEventCursor(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) return 0;
  for (const character of value) {
    if (character < "0" || character > "9") return null;
  }
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) ? sequence : null;
}

function isTerminalBuild(status: StoredCampaignWorldBuild["status"]): boolean {
  return status === "completed" || status === "failed";
}

export function createCampaignWorldRoutes(
  overrides: Partial<CampaignWorldRouteDependencies> = {},
) {
  const dependencies: CampaignWorldRouteDependencies = {
    buildService: campaignWorldBuildService,
    sourceService: campaignWorldSourceService,
    loadCampaign,
    loadSettings,
    resolveGenerator,
    createModel,
    openDatabase: openCampaignWorldDatabase,
    now: Date.now,
    eventPollMilliseconds: 50,
    ...overrides,
  };
  const app = new Hono();

  app.get("/:id/world/source", async (c) => {
    const campaignId = c.req.param("id");
    const campaignError = await requireCampaign(c, campaignId, dependencies);
    if (campaignError) return campaignError;
    try {
      dependencies.buildService.recoverInterruptedBuild(campaignId);
      return c.json(dependencies.sourceService.load(campaignId));
    } catch (error) {
      return failureResponse(c, routeFailure(error));
    }
  });

  app.put("/:id/world/dna", async (c) => {
    const campaignId = c.req.param("id");
    const campaignError = await requireCampaign(c, campaignId, dependencies);
    if (campaignError) return campaignError;
    const body = await parseRequest(c, dnaSchema);
    if (body instanceof Response) return body;
    try {
      const source = await dependencies.sourceService.saveDna({
        campaignId,
        dna: body,
        assertWritable: dependencies.buildService.assertSourceWritable,
      });
      return c.json(source);
    } catch (error) {
      return failureResponse(c, routeFailure(error));
    }
  });

  app.post("/:id/world/builds", async (c) => {
    const campaignId = c.req.param("id");
    const campaignError = await requireCampaign(c, campaignId, dependencies);
    if (campaignError) return campaignError;
    const body = await parseRequest(c, startBuildSchema);
    if (body instanceof Response) return body;
    try {
      dependencies.buildService.recoverInterruptedBuild(campaignId);
      const settings = dependencies.loadSettings();
      const generator = dependencies.resolveGenerator(settings);
      if ("error" in generator) {
        return failureResponse(c, {
          code: "generator_not_configured",
          message: generator.error,
          status: generator.status,
        });
      }
      const started = await dependencies.buildService.startBuild({
        campaignId,
        expectedSourceDigest: body.expectedSourceDigest,
        providerId: generator.resolved.provider.id,
        modelName: generator.resolved.provider.model,
        model: dependencies.createModel(generator.resolved.provider, {
          role: "generator",
        }),
        temperature: generator.resolved.temperature,
        maxOutputTokens: generator.resolved.maxTokens,
      });
      return c.json(started, 202);
    } catch (error) {
      return failureResponse(c, routeFailure(error));
    }
  });

  app.get("/:id/world/builds/:buildId/events", async (c) => {
    const campaignId = c.req.param("id");
    const buildId = c.req.param("buildId");
    const campaignError = await requireCampaign(c, campaignId, dependencies);
    if (campaignError) return campaignError;
    const cursor = parseEventCursor(
      c.req.header("Last-Event-ID") ?? c.req.query("afterSequence"),
    );
    if (cursor === null) {
      return failureResponse(c, {
        code: "invalid_event_cursor",
        message: campaignWorldPlayerMessages.invalidRequest,
        status: 400,
      });
    }
    try {
      dependencies.buildService.recoverInterruptedBuild(campaignId);
      const handle = dependencies.openDatabase(campaignId);
      try {
        createCampaignWorldRepository(handle).loadBuildContext(buildId);
      } finally {
        handle.close();
      }
    } catch (error) {
      return failureResponse(c, routeFailure(error));
    }

    c.header("Cache-Control", "no-cache, no-transform");
    return streamSSE(c, async (stream) => {
      let afterSequence = cursor;
      while (!stream.aborted) {
        const handle = dependencies.openDatabase(campaignId);
        let build: StoredCampaignWorldBuild;
        try {
          const repository = createCampaignWorldRepository(handle);
          const events = repository.loadBuildEvents(buildId, afterSequence);
          for (const event of events) {
            await stream.writeSSE({
              id: String(event.sequence),
              event: event.type,
              data: JSON.stringify(event),
            });
            afterSequence = event.sequence;
          }
          build = repository.loadBuildContext(buildId);
        } finally {
          handle.close();
        }
        if (isTerminalBuild(build.status)) return;
        await stream.sleep(dependencies.eventPollMilliseconds);
      }
    });
  });

  app.get("/:id/world/state", async (c) => {
    const campaignId = c.req.param("id");
    const campaignError = await requireCampaign(c, campaignId, dependencies);
    if (campaignError) return campaignError;
    try {
      dependencies.buildService.recoverInterruptedBuild(campaignId);
      const handle = dependencies.openDatabase(campaignId);
      try {
        const repository = createCampaignWorldRepository(handle);
        const status = repository.loadSourceStatus();
        const latest = repository.loadLatestBuild();
        if (status === "review" || status === "accepted") {
          const world = repository.loadWorld();
          if (!world) {
            throw new CampaignWorldRepositoryError(
              "world_state_corrupt",
              "Campaign World status has no persisted world.",
            );
          }
          return c.json(stateWithCursor({ status, world }, latest));
        }
        const source = dependencies.sourceService.load(campaignId);
        if (status === "unbuilt") {
          return c.json(stateWithCursor({ status, source }, latest));
        }
        if (!latest) {
          throw new CampaignWorldRepositoryError(
            "world_state_corrupt",
            "Campaign World build status has no build row.",
          );
        }
        return c.json(stateWithCursor({
          status,
          source,
          build: projectBuild(latest),
        }, latest));
      } finally {
        handle.close();
      }
    } catch (error) {
      return failureResponse(c, routeFailure(error));
    }
  });

  app.post("/:id/world/accept", async (c) => {
    const campaignId = c.req.param("id");
    const campaignError = await requireCampaign(c, campaignId, dependencies);
    if (campaignError) return campaignError;
    const body = await parseRequest(c, acceptWorldSchema);
    if (body instanceof Response) return body;
    try {
      dependencies.buildService.recoverInterruptedBuild(campaignId);
      const handle = dependencies.openDatabase(campaignId);
      try {
        return c.json(createCampaignWorldRepository(handle).acceptWorld({
          expectedVersion: body.expectedVersion,
          expectedContentHash: body.expectedContentHash,
          acceptedAt: dependencies.now(),
        }));
      } finally {
        handle.close();
      }
    } catch (error) {
      return failureResponse(c, routeFailure(error));
    }
  });

  return app;
}

export default createCampaignWorldRoutes();
