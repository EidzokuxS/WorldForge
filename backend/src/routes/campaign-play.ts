import type { Context } from "hono";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  CampaignPlayPublicErrorCode,
  CampaignPlayVersionExpectation,
} from "@worldforge/shared";
import { CAMPAIGN_PLAY_LIMITS } from "@worldforge/shared";
import { readCampaignConfig } from "../campaign/index.js";
import {
  campaignPlayApplication,
  CampaignPlayApplicationError,
  type CampaignPlayApplication,
} from "../campaign-play/campaign-play-application.js";
import {
  CAMPAIGN_PLAY_ERROR_METADATA,
  campaignPlayErrorResponseSchema,
  campaignPlayGeneratePlayerDraftRequestSchema,
  campaignPlayJournalPageSchema,
  campaignPlayOpeningAdmissionRequestSchema,
  campaignPlayNarrationRecoveryRequestSchema,
  campaignPlayParsePlayerCardRequestSchema,
  campaignPlayPutPlayerRequestSchema,
  campaignPlayPutPlayerResponseSchema,
  campaignPlayResearchPlayerRequestSchema,
  campaignPlayResumeTurnRequestSchema,
  campaignPlaySseEventSchema,
  campaignPlayStateSchema,
  campaignPlayTurnAdmissionRequestSchema,
  campaignPlayTurnAdmissionResponseSchema,
  campaignPlayTurnReadResponseSchema,
} from "../campaign-play/contracts.js";

interface CampaignPlayRouteDependencies {
  application: CampaignPlayApplication;
  readCampaign: typeof readCampaignConfig;
  eventPollMilliseconds: number;
}

interface ErrorContext {
  campaignId: string;
  expected?: Partial<CampaignPlayVersionExpectation>;
  turnId?: string;
  invalidCode?: CampaignPlayPublicErrorCode;
}

type PublicStatus = 404 | 409 | 422 | 503;

function parseNonnegativeInteger(value: string | undefined): number | null {
  if (value === undefined || value.length === 0) return 0;
  if ([...value].some((character) => character < "0" || character > "9")) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function publicErrorCode(
  error: unknown,
  invalidCode: CampaignPlayPublicErrorCode,
): CampaignPlayPublicErrorCode {
  return error instanceof CampaignPlayApplicationError
    ? error.publicCode
    : invalidCode;
}

function errorResponse(
  c: Context,
  dependencies: CampaignPlayRouteDependencies,
  error: unknown,
  context: ErrorContext,
): Response {
  const code = publicErrorCode(error, context.invalidCode ?? "service_unavailable");
  const metadata = CAMPAIGN_PLAY_ERROR_METADATA[code];
  let state: ReturnType<CampaignPlayApplication["loadState"]> | null = null;
  if (code !== "campaign_not_found" && code !== "world_not_accepted") {
    try {
      state = dependencies.application.loadState(context.campaignId);
    } catch {
      state = null;
    }
  }
  const body = campaignPlayErrorResponseSchema.parse({
    code,
    status: metadata.status,
    campaignPhase: state?.phase ?? null,
    acceptedWorldVersion: state?.acceptedWorldVersion ?? null,
    expectedWorldVersion: context.expected?.expectedWorldVersion ?? null,
    currentWorldVersion: state?.worldVersion ?? null,
    expectedRuntimeRevision: context.expected?.expectedRuntimeRevision ?? null,
    currentRuntimeRevision: state?.runtimeRevision ?? null,
    turnId: context.turnId ?? state?.activeTurn?.turnId ?? null,
    retryEligible: metadata.retryEligible,
    unmetRequirements: error instanceof CampaignPlayApplicationError
      ? error.unmetRequirements
      : [],
  });
  return c.json(body, metadata.status as PublicStatus);
}

async function requireCampaign(
  c: Context,
  dependencies: CampaignPlayRouteDependencies,
  campaignId: string,
): Promise<Response | null> {
  try {
    dependencies.readCampaign(campaignId);
    return null;
  } catch (error) {
    return errorResponse(c, dependencies, error, {
      campaignId,
      invalidCode: "campaign_not_found",
    });
  }
}

async function parseBody<T>(
  c: Context,
  schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
  dependencies: CampaignPlayRouteDependencies,
  context: ErrorContext,
): Promise<T | Response> {
  let value: unknown;
  try {
    value = await c.req.json();
  } catch (error) {
    return errorResponse(c, dependencies, error, context);
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) return errorResponse(c, dependencies, parsed, context);
  return parsed.data;
}

function expectation(value: unknown): Partial<CampaignPlayVersionExpectation> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return {
    ...(typeof record.expectedWorldVersion === "number"
      ? { expectedWorldVersion: record.expectedWorldVersion }
      : {}),
    ...(typeof record.expectedRuntimeRevision === "number"
      ? { expectedRuntimeRevision: record.expectedRuntimeRevision }
      : {}),
  };
}

export function createCampaignPlayRoutes(
  overrides: Partial<CampaignPlayRouteDependencies> = {},
) {
  const dependencies: CampaignPlayRouteDependencies = {
    application: campaignPlayApplication,
    readCampaign: readCampaignConfig,
    eventPollMilliseconds: 50,
    ...overrides,
  };
  const app = new Hono();

  app.use("/:id/play/*", async (c, next) => {
    const failure = await requireCampaign(c, dependencies, c.req.param("id"));
    if (failure) return failure;
    await next();
  });

  app.get("/:id/play/state", (c) => {
    const campaignId = c.req.param("id");
    try {
      return c.json(campaignPlayStateSchema.parse(
        dependencies.application.loadState(campaignId),
      ));
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId });
    }
  });

  app.post("/:id/play/player/cards/parse", async (c) => {
    const campaignId = c.req.param("id");
    const request = await parseBody(
      c,
      campaignPlayParsePlayerCardRequestSchema,
      dependencies,
      { campaignId, invalidCode: "invalid_character" },
    );
    if (request instanceof Response) return request;
    try {
      return c.json(await dependencies.application.parsePlayerCard(campaignId, request));
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId });
    }
  });

  app.post("/:id/play/player/drafts/generate", async (c) => {
    const campaignId = c.req.param("id");
    const request = await parseBody(
      c,
      campaignPlayGeneratePlayerDraftRequestSchema,
      dependencies,
      { campaignId, invalidCode: "invalid_character" },
    );
    if (request instanceof Response) return request;
    try {
      return c.json(await dependencies.application.generatePlayerDraft(campaignId, request));
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId });
    }
  });

  app.post("/:id/play/player/research", async (c) => {
    const campaignId = c.req.param("id");
    const request = await parseBody(
      c,
      campaignPlayResearchPlayerRequestSchema,
      dependencies,
      { campaignId, invalidCode: "invalid_character" },
    );
    if (request instanceof Response) return request;
    try {
      return c.json(await dependencies.application.researchPlayer(campaignId, request));
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId });
    }
  });

  app.put("/:id/play/player", async (c) => {
    const campaignId = c.req.param("id");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        invalidCode: "invalid_character",
      });
    }
    const parsed = campaignPlayPutPlayerRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(c, dependencies, parsed.error, {
        campaignId,
        expected: expectation(raw),
        invalidCode: "invalid_character",
      });
    }
    try {
      return c.json(campaignPlayPutPlayerResponseSchema.parse(
        dependencies.application.putPlayer(campaignId, parsed.data),
      ));
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        expected: parsed.data,
      });
    }
  });

  app.post("/:id/play/opening", async (c) => {
    const campaignId = c.req.param("id");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        invalidCode: "invalid_starting_conditions",
      });
    }
    const parsed = campaignPlayOpeningAdmissionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(c, dependencies, parsed.error, {
        campaignId,
        expected: expectation(raw),
        invalidCode: "invalid_starting_conditions",
      });
    }
    try {
      return c.json(campaignPlayTurnAdmissionResponseSchema.parse(
        dependencies.application.admitOpening(campaignId, parsed.data),
      ), 202);
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        expected: parsed.data,
      });
    }
  });

  app.post("/:id/play/turns", async (c) => {
    const campaignId = c.req.param("id");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        invalidCode: "invalid_intent",
      });
    }
    const parsed = campaignPlayTurnAdmissionRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(c, dependencies, parsed.error, {
        campaignId,
        expected: expectation(raw),
        invalidCode: "invalid_intent",
      });
    }
    try {
      return c.json(campaignPlayTurnAdmissionResponseSchema.parse(
        dependencies.application.admitTurn(campaignId, parsed.data),
      ), 202);
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        expected: parsed.data,
      });
    }
  });

  app.get("/:id/play/turns/:turnId", (c) => {
    const campaignId = c.req.param("id");
    const turnId = c.req.param("turnId");
    try {
      return c.json(campaignPlayTurnReadResponseSchema.parse(
        dependencies.application.loadTurn(campaignId, turnId),
      ));
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId, turnId });
    }
  });

  app.get("/:id/play/turns/:turnId/events", (c) => {
    const campaignId = c.req.param("id");
    const turnId = c.req.param("turnId");
    const cursor = parseNonnegativeInteger(
      c.req.header("Last-Event-ID") ?? c.req.query("afterSequence"),
    );
    if (cursor === null) {
      return errorResponse(c, dependencies, new Error("invalid event cursor"), {
        campaignId,
        turnId,
        invalidCode: "invalid_event_cursor",
      });
    }
    try {
      dependencies.application.loadTurn(campaignId, turnId);
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId, turnId });
    }
    c.header("Cache-Control", "no-cache, no-transform");
    return streamSSE(c, async (stream) => {
      let afterSequence = cursor;
      while (!stream.aborted) {
        const events = dependencies.application.listTurnEvents(
          campaignId,
          turnId,
          afterSequence,
        );
        for (const eventValue of events) {
          const event = campaignPlaySseEventSchema.parse(eventValue);
          await stream.writeSSE({
            id: String(event.sequence),
            event: event.type,
            data: JSON.stringify(event),
          });
          afterSequence = event.sequence;
        }
        const turn = dependencies.application.loadTurn(campaignId, turnId).turn;
        if (turn.status !== "processing") return;
        await stream.sleep(dependencies.eventPollMilliseconds);
      }
    });
  });

  app.post("/:id/play/turns/:turnId/resume", async (c) => {
    const campaignId = c.req.param("id");
    const turnId = c.req.param("turnId");
    let raw: unknown;
    try {
      raw = await c.req.json();
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        turnId,
        invalidCode: "turn_not_resumable",
      });
    }
    const parsed = campaignPlayResumeTurnRequestSchema.safeParse(raw);
    if (!parsed.success) {
      return errorResponse(c, dependencies, parsed.error, {
        campaignId,
        turnId,
        expected: expectation(raw),
        invalidCode: "turn_not_resumable",
      });
    }
    try {
      return c.json(campaignPlayTurnAdmissionResponseSchema.parse(
        dependencies.application.resumeTurn(campaignId, turnId, parsed.data),
      ), 202);
    } catch (error) {
      return errorResponse(c, dependencies, error, {
        campaignId,
        turnId,
        expected: parsed.data,
      });
    }
  });

  app.post("/:id/play/turns/:turnId/narration/recover", async (c) => {
    const context: ErrorContext = { campaignId: c.req.param("id"), turnId: c.req.param("turnId") };
    try {
      const campaign = await requireCampaign(c, dependencies, context.campaignId);
      if (campaign instanceof Response) return campaign;
      const body = await parseBody(
        c,
        campaignPlayNarrationRecoveryRequestSchema,
        dependencies,
        { ...context, invalidCode: "turn_not_resumable" },
      );
      if (body instanceof Response) return body;
      return c.json(
        dependencies.application.recoverNarration(
          context.campaignId,
          context.turnId!,
          body,
        ),
        202,
      );
    } catch (error) {
      return errorResponse(c, dependencies, error, context);
    }
  });

  app.get("/:id/play/journal", (c) => {
    const campaignId = c.req.param("id");
    const cursor = parseNonnegativeInteger(c.req.query("cursor"));
    const limit = parseNonnegativeInteger(c.req.query("limit") ?? "20");
    if (
      cursor === null || limit === null || limit < 1 ||
      limit > CAMPAIGN_PLAY_LIMITS.journalPage
    ) {
      return errorResponse(c, dependencies, new Error("invalid journal cursor"), {
        campaignId,
        invalidCode: "invalid_event_cursor",
      });
    }
    try {
      return c.json(campaignPlayJournalPageSchema.parse(
        dependencies.application.loadJournal(campaignId, cursor, limit),
      ));
    } catch (error) {
      return errorResponse(c, dependencies, error, { campaignId });
    }
  });

  return app;
}

export default createCampaignPlayRoutes();
