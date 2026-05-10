import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { randomUUID } from "node:crypto";
import { parseLookupLogEntry } from "@worldforge/shared";
import { buildLookupHistoryMessages } from "../campaign/chat-history.js";
import {
  appendChatMessages,
  getChatHistory,
  getCampaignPremise,
  replaceChatMessage,
  getLastPlayerAction,
  createCheckpoint,
  pruneAutoCheckpoints,
  readCampaignConfig,
} from "../campaign/index.js";
import { clamp, getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import {
  parseBody,
  resolveStoryteller,
  resolveJudge,
  resolveEmbedder,
  requireLoadedCampaign,
  zodFirstError,
} from "./helpers.js";
import {
  chatActionBodySchema,
  chatEditBodySchema,
  chatHistoryQuerySchema,
  chatLookupBodySchema,
  chatOpeningBodySchema,
  chatRetryBodySchema,
  chatUndoBodySchema,
} from "./schemas.js";
import {
  createLogger,
  runWithTurnContext,
  getTurnContext,
} from "../lib/index.js";
import { rootPino } from "../lib/logger-setup.js";
import {
  sha256Prefix,
  isDeltaType,
  getOrCreateAggregator,
  finalizeAggregators,
} from "../lib/sse-hash.js";
import {
  processOpeningScene,
  processTurn,
  resumePendingTurnNarration,
  captureSnapshot,
  restoreSnapshot,
  buildDoneBoundaryData,
  findPendingNarrationSaga,
  NarrationRepairExhaustedError,
  PendingNarrationError,
  queuePostTurnSimulationProposals,
} from "../engine/index.js";
import type {
  TurnSagaRecord,
  TurnEvent,
  TurnSnapshot,
  TurnSummary,
} from "../engine/index.js";
import {
  drainPendingCommittedEvents,
  embedAndUpdateEvent,
} from "../vectors/episodic-events.js";
import {
  clearLastTurnSnapshot,
  endTurn,
  getLastTurnSnapshot,
  hasActiveTurn,
  hasLiveTurnSnapshot,
  setLastTurnSnapshot,
  tryBeginTurn,
} from "../campaign/runtime-state.js";
import type { Settings } from "../settings/index.js";
import type { ProviderConfig } from "../ai/provider-registry.js";
import {
  generateImage,
  resolveImageProvider,
  buildScenePrompt,
  buildLocationPrompt,
  ensureImageDir,
  cacheImage,
  imageExists,
} from "../images/index.js";
import { runGroundedLookup } from "../engine/grounded-lookup.js";

const log = createLogger("chat");

const app = new Hono();

function registerTurnAbortCleanup(args: {
  signal: AbortSignal;
  campaignId: string;
  route: string;
}): () => void {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    endTurn(args.campaignId);
    log.event("turn.abort.cleanup", {
      route: args.route,
      campaignId: args.campaignId,
    });
  };

  if (args.signal.aborted) {
    cleanup();
    return () => {};
  }

  args.signal.addEventListener("abort", cleanup, { once: true });
  return () => {
    args.signal.removeEventListener("abort", cleanup);
  };
}

/**
 * Rollback-critical work must finish before the turn is marked done.
 * Heavy world simulation is recorded as versioned proposals so player control
 * returns after the visible GM/narrator turn without allowing detached NPC or
 * faction LLM agents to mutate the world behind the `done` boundary.
 */
async function runRollbackCriticalPostTurn(
  _settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  summary: TurnSummary,
): Promise<void> {
  const db = (await import("../db/index.js")).getDb();
  const { players } = await import("../db/schema.js");
  const { eq } = await import("drizzle-orm");

  const player = db
    .select({
      currentLocationId: players.currentLocationId,
      currentSceneLocationId: players.currentSceneLocationId,
    })
    .from(players)
    .where(eq(players.campaignId, campaignId))
    .get();

  const result = queuePostTurnSimulationProposals({
    campaignId,
    tick: summary.tick,
    judgeProvider,
    playerLocationId: player?.currentLocationId,
    playerSceneScopeId: player?.currentSceneLocationId ?? undefined,
    route: "/chat/action",
    idempotencyKey: summary.idempotencyKey,
  });
  const actorSchedules = result.actorSchedules ?? [];
  log.event("simulation.proposals.queued", {
    campaignId,
    tick: summary.tick,
    baseWorldVersion: result.baseWorldVersion,
    proposalCount: result.queued.length,
    proposalTypes: result.queued.map((proposal) => proposal.proposalType),
    actorScheduleCount: actorSchedules.length,
    actorScheduleRoutes: actorSchedules.map((schedule) => ({
      actorId: schedule.actorId,
      route: schedule.route,
      reservation: schedule.reservation?.status ?? null,
      signals: schedule.signals.map((signal) => signal.type),
    })),
  });
}

function queueAuxiliaryPostTurnWork(
  settings: Settings,
  campaignId: string,
  _judgeProvider: ProviderConfig,
  summary: TurnSummary,
): void {
  // Capture current turn context (if any) so the detached IIFE below
  // can re-enter the same ALS frame. Without this, embedder/image
  // writes that happen asynchronously after the SSE stream closes
  // would emit log records with no turnId/campaignId mixin.
  const detachedCtx = getTurnContext();
  const body = async (): Promise<void> => {
    try {
      const emb = resolveEmbedder(settings);
      const embedderAvailable = !("error" in emb);

      const pendingCommittedEvents = drainPendingCommittedEvents(campaignId, summary.tick);

      if (pendingCommittedEvents.length > 0 && embedderAvailable) {
        for (const event of pendingCommittedEvents) {
          try {
            await embedAndUpdateEvent(event.id, event.text, emb.resolved.provider);
          } catch (err) {
            log.warn("Failed to embed episodic event", err);
          }
        }
      }

      const imgProvider = resolveImageProvider(settings);
      if (!imgProvider) {
        return;
      }

      const highImportanceEvents = summary.toolCalls
        .filter((tc) => tc.tool === "log_event")
        .filter((tc) => {
          const args = tc.args as Record<string, unknown>;
          return typeof args.importance === "number" && args.importance >= 7;
        });

      if (highImportanceEvents.length > 0) {
        const firstEvent = highImportanceEvents[0];
        const eventArgs = firstEvent.args as Record<string, unknown>;
        const eventText = eventArgs.text as string;
        const eventId = (() => {
          const result = firstEvent.result as Record<string, unknown> | undefined;
          const inner = result?.result as Record<string, unknown> | undefined;
          return inner?.eventId as string | undefined;
        })();

        if (eventText && eventId) {
          const db2 = (await import("../db/index.js")).getDb();
          const { players: playersTable, locations: locsTable } = await import("../db/schema.js");
          const { eq: eq2 } = await import("drizzle-orm");

          const playerRow = db2
            .select({ currentLocationId: playersTable.currentLocationId })
            .from(playersTable)
            .where(eq2(playersTable.campaignId, campaignId))
            .get();

          let locationName = "Unknown";
          if (playerRow?.currentLocationId) {
            const loc = db2
              .select({ name: locsTable.name })
              .from(locsTable)
              .where(eq2(locsTable.id, playerRow.currentLocationId))
              .get();
            if (loc) locationName = loc.name;
          }

          const premise = getCampaignPremise(campaignId);
          const prompt = buildScenePrompt({
            eventText,
            locationName,
            premise,
            stylePrompt: settings.images.stylePrompt,
          });
          ensureImageDir(campaignId, "scenes");
          const data = await generateImage({
            prompt,
            provider: imgProvider.provider,
            model: imgProvider.model,
          });
          cacheImage(campaignId, "scenes", `${eventId}.png`, data);
        }
      }

      const revealedLocations = summary.toolCalls.filter((tc) => tc.tool === "reveal_location");
      for (const reveal of revealedLocations) {
        const result = reveal.result as Record<string, unknown> | undefined;
        const inner = result?.result as Record<string, unknown> | undefined;
        const locId = inner?.id as string | undefined;
        const args = reveal.args as Record<string, unknown>;
        const locName = args.name as string;
        const locTags = (args.tags as string[]) || [];

        if (locId && locName && !imageExists(campaignId, "locations", `${locId}.png`)) {
          const premise = getCampaignPremise(campaignId);
          const prompt = buildLocationPrompt({
            locationName: locName,
            tags: locTags,
            premise,
            stylePrompt: settings.images.stylePrompt,
          });
          ensureImageDir(campaignId, "locations");
          const data = await generateImage({
            prompt,
            provider: imgProvider.provider,
            model: imgProvider.model,
          });
          cacheImage(campaignId, "locations", `${locId}.png`, data);
        }
      }
    } catch (err) {
      log.warn("Auxiliary post-turn work failed (non-blocking)", err);
    }
  };
  const runDetached = (): void => {
    if (detachedCtx) {
      // Re-enter the turn context so downstream log records still carry
      // turnId/campaignId/tick. role is cleared because this background
      // work is not scoped to any single LLM role.
      void runWithTurnContext({ ...detachedCtx, role: undefined }, body);
    } else {
      void body();
    }
  };

  // Defer the body itself, not only the await, so no synchronous DB or prompt
  // setup can run before the SSE generator reaches its final done event.
  setTimeout(runDetached, 0);
}

function buildOnPostTurn(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
): ((summary: TurnSummary) => Promise<void>) | undefined {
  return async (summary: TurnSummary) => {
    await runRollbackCriticalPostTurn(settings, campaignId, judgeProvider, summary);
    queueAuxiliaryPostTurnWork(settings, campaignId, judgeProvider, summary);
  };
}

function campaignHasAssistantMessages(campaignId: string): boolean {
  return getChatHistory(campaignId).some(
    (message) => message.role === "assistant" && !parseLookupLogEntry(message.content),
  );
}

async function writeTurnEventSSE(
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
  event: { type: string; data: unknown },
): Promise<void> {
  const eventName = event.type === "reasoning" ? "reasoning" : event.type;
  const dataStr =
    typeof event.data === "string" ? event.data : JSON.stringify(event.data);

  // Phase 58-03: hot-path instrumentation — per Codex review, avoid copying
  // full event.data into the log record. Delta/text-delta chunks are
  // aggregated into one `sse.stream.aggregate` event per stream end;
  // every other SSE payload emits a single record with type, byteLength,
  // and a short sha256 prefix so operators can correlate with captured
  // traffic without duplicating prose in the JSONL.
  const ctx = getTurnContext();
  if (ctx && isDeltaType(event.type)) {
    getOrCreateAggregator(ctx.turnId, event.type).record(dataStr);
  } else {
    log.event("sse.emit", {
      type: event.type,
      byteLength: Buffer.byteLength(dataStr, "utf8"),
      sha256Prefix: sha256Prefix(dataStr),
    });
  }

  await stream.writeSSE({
    event: eventName,
    data: dataStr,
  });
}

function withTurnBoundaryMetadata(
  campaignId: string,
  event: TurnEvent,
): TurnEvent {
  if (event.type !== "done") {
    return event;
  }
  return {
    ...event,
    data: buildDoneBoundaryData(campaignId, event.data),
  };
}

async function writeRouteTurnEventSSE(
  campaignId: string,
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
  event: TurnEvent,
): Promise<void> {
  await writeTurnEventSSE(stream, withTurnBoundaryMetadata(campaignId, event));
}

function isNarrationLockConflict(error: unknown): boolean {
  return error instanceof Error && error.name === "TurnSagaLockConflictError";
}

function isPendingNarrationError(error: unknown): error is PendingNarrationError {
  return error instanceof PendingNarrationError
    || (error instanceof Error && error.name === "PendingNarrationError");
}

function pendingNarrationData(
  saga: Pick<TurnSagaRecord, "id" | "turnId" | "status"> | null,
  message: string,
) {
  return {
    error: message,
    pendingNarration: true,
    resumable: Boolean(saga),
    sagaId: saga?.id,
    turnId: saga?.turnId,
    status: saga?.status,
  };
}

async function streamPendingTurnNarration(args: {
  campaignId: string;
  saga: Pick<TurnSagaRecord, "id" | "turnId" | "status">;
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> };
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ReturnType<typeof resolveEmbedder>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
}): Promise<"resumed" | "pending"> {
  try {
    const generator = resumePendingTurnNarration({
      campaignId: args.campaignId,
      turnId: args.saga.turnId,
      storytellerProvider: args.storytellerProvider,
      storytellerTemperature: args.storytellerTemperature,
      storytellerMaxTokens: args.storytellerMaxTokens,
      embedderResult: args.embedderResult && !("error" in args.embedderResult)
        ? args.embedderResult
        : undefined,
      onPostTurn: args.onPostTurn,
    });

    for await (const event of generator) {
      await writeRouteTurnEventSSE(args.campaignId, args.stream, event);
    }
    return "resumed";
  } catch (error) {
    if (!isNarrationLockConflict(error)) {
      throw error;
    }
    await writeTurnEventSSE(args.stream, {
      type: "error",
      data: pendingNarrationData(
        args.saga,
        "Pending narration is already being completed by another worker.",
      ),
    });
    return "pending";
  }
}

async function streamPendingNarrationBeforeRollback(args: {
  campaignId: string;
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> };
  storytellerProvider: ProviderConfig;
  storytellerTemperature: number;
  storytellerMaxTokens: number;
  embedderResult?: ReturnType<typeof resolveEmbedder>;
  onPostTurn?: (summary: TurnSummary) => void | Promise<void>;
  pendingMessage: string;
}): Promise<"none" | "resumed" | "pending"> {
  const pending = findPendingNarrationSaga({ campaignId: args.campaignId });
  if (!pending) {
    return "none";
  }

  try {
    return await streamPendingTurnNarration({
      campaignId: args.campaignId,
      saga: pending,
      stream: args.stream,
      storytellerProvider: args.storytellerProvider,
      storytellerTemperature: args.storytellerTemperature,
      storytellerMaxTokens: args.storytellerMaxTokens,
      embedderResult: args.embedderResult,
      onPostTurn: args.onPostTurn,
    });
  } catch (resumeError) {
    log.error("Pending narration resume failed; preserving settled turn state", resumeError);
    await writeTurnEventSSE(args.stream, {
      type: "error",
      data: pendingNarrationData(pending, args.pendingMessage),
    });
    return "pending";
  }
}

function toPersistedLookupKind(
  lookupKind: string,
  compareAgainst?: string,
): string {
  return lookupKind === "power_profile" && compareAgainst ? "compare" : lookupKind;
}

function buildLookupCommandText({
  lookupKind,
  subject,
  compareAgainst,
  question,
}: {
  lookupKind: string;
  subject: string;
  compareAgainst?: string;
  question?: string;
}): string {
  if (lookupKind === "power_profile") {
    const comparison = compareAgainst
      ? `/compare ${subject} vs ${compareAgainst}`
      : `/compare ${subject}`;
    return question ? `${comparison} :: ${question}` : comparison;
  }

  const lookupPrefixByKind: Record<string, string> = {
    world_canon_fact: "world",
    event_clarification: "event",
    character_canon_fact: "character",
  };
  const prefix = lookupPrefixByKind[lookupKind] ?? "character";
  const command = `/lookup ${prefix}: ${subject}`;
  return question ? `${command} :: ${question}` : command;
}

// -- GET /history -------------------------------------------------------------

app.get("/history", async (c) => {
  try {
    const query = chatHistoryQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json({ error: zodFirstError(query.error) }, 400);
    }

    const { campaignId } = query.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const premise = getCampaignPremise(campaignId);
    const messages = getChatHistory(campaignId);
    return c.json({
      messages,
      premise,
      hasLiveTurnSnapshot: hasLiveTurnSnapshot(campaignId),
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to read chat history.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /opening — Authoritative opening-scene generation via SSE ----------

app.post("/opening", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatOpeningBodySchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;

    if (campaignHasAssistantMessages(campaignId)) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Opening scene already exists for this campaign." }, 409);
    }

    const settings = loadSettings();
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }

    const embedderResult = resolveEmbedder(settings);
    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();
    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;

    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/opening",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
        const turnStart = Date.now();
        log.event("turn.begin", {
          route: "/opening",
          campaignId,
          tick: currentTick,
          storytellerProvider: {
            id: stResult.resolved.provider.id,
            model: stResult.resolved.provider.model,
            baseUrl: stResult.resolved.provider.baseUrl,
          },
        });

        let outcome: "success" | "error" = "success";
        try {
          const openingGenerator = processOpeningScene({
            campaignId,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
          });

          for await (const event of openingGenerator) {
            await writeRouteTurnEventSSE(campaignId, stream, event);
          }
        } catch (error) {
          outcome = "error";
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: getErrorMessage(error, "Opening scene generation failed.") }),
          });
        } finally {
          for (const agg of finalizeAggregators(turnId)) {
            log.event("sse.stream.aggregate", {
              type: agg.type,
              deltaCount: agg.deltaCount,
              totalBytes: agg.totalBytes,
              sha256OfConcatenated: agg.sha256OfConcatenated,
            });
          }
          log.event("turn.end", {
            route: "/opening",
            tick: currentTick,
            durationMs: Date.now() - turnStart,
            outcome,
          });
          try {
            rootPino.flush?.();
          } catch {
            // flush is best-effort; never surface as turn-end failure.
          }
          endTurn(campaignId);
          turnStartedForCampaign = null;
        }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getErrorMessage(error, "Opening request failed.") },
      getErrorStatus(error),
    );
  }
});

// -- POST / (legacy plain-text streaming) -------------------------------------

app.post("/", async (c) => {
  return c.json(
    {
      error: "Legacy POST /api/chat has been retired. Use /api/chat/action, /api/chat/opening, or /api/chat/lookup.",
    },
    410,
  );
});

// -- POST /action — Full turn cycle via SSE (Oracle + Storyteller + tools) ----

app.post("/action", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatActionBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, playerAction } = result.data;
    const compatibilityIntent = playerAction;
    const compatibilityMethod = "";
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;

    const settings = loadSettings();

    // Resolve Judge (required for Oracle)
    const judgeResult = resolveJudge(settings);
    if ("error" in judgeResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }

    // Resolve Storyteller (required for narration)
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }

    // Resolve Embedder (optional -- used for lore search)
    const embedderResult = resolveEmbedder(settings);

    const pendingSaga = findPendingNarrationSaga({ campaignId });
    if (pendingSaga) {
      c.header("Cache-Control", "no-cache, no-transform");
      const turnId = randomUUID();
      const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;
      return streamSSE(c, async (stream) => {
        const unregisterAbortCleanup = registerTurnAbortCleanup({
          signal: c.req.raw.signal,
          campaignId,
          route: "/action",
        });
        try {
          await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
            try {
              await streamPendingTurnNarration({
                campaignId,
                saga: pendingSaga,
                stream,
                storytellerProvider: stResult.resolved.provider,
                storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
                storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
                embedderResult,
                onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
              });
            } finally {
              endTurn(campaignId);
              turnStartedForCampaign = null;
            }
          });
        } finally {
          unregisterAbortCleanup();
        }
      });
    }

    // Auto-checkpoint before dangerous turns (HP <= 2)
    try {
      const db = (await import("../db/index.js")).getDb();
      const { players } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");

      const player = db
        .select({ hp: players.hp })
        .from(players)
        .where(eq(players.campaignId, campaignId))
        .get();

      if (player && player.hp <= 2) {
        await createCheckpoint(campaignId, {
          name: "auto-danger",
          description: "Auto-save: low HP",
          auto: true,
        });
        await pruneAutoCheckpoints(campaignId, 3);
      }
    } catch (err) {
      log.warn("Auto-checkpoint failed (non-blocking)", err);
    }

    // Capture pre-turn snapshot for potential undo/retry
    const snapshot = await captureSnapshot(campaignId);

    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();
    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;

    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/action",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
        const turnStart = Date.now();
        log.event("turn.begin", {
          route: "/action",
          campaignId,
          tick: currentTick,
          rawInput: playerAction,
          compatibilityFields: {
            intent: "mirrors rawInput",
            method: "empty",
          },
          judgeProvider: {
            id: judgeResult.resolved.provider.id,
            model: judgeResult.resolved.provider.model,
            baseUrl: judgeResult.resolved.provider.baseUrl,
          },
          storytellerProvider: {
            id: stResult.resolved.provider.id,
            model: stResult.resolved.provider.model,
            baseUrl: stResult.resolved.provider.baseUrl,
          },
        });

        let outcome: "success" | "error" | "restored" | "pending_resumed" | "pending" = "success";
        let settledTurnRollbackShield = false;
        try {
          const turnGenerator = processTurn({
            campaignId,
            playerAction,
            intent: compatibilityIntent,
            method: compatibilityMethod,
            judgeProvider: judgeResult.resolved.provider,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
            onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
          });

          for await (const event of turnGenerator) {
            // Reactive auto-checkpoint when HP drops to danger zone during turn
            if (event.type === "auto_checkpoint") {
              const detachedCtx = getTurnContext();
              const ckptBody = async (): Promise<void> => {
                try {
                  await createCheckpoint(campaignId, {
                    name: "auto-danger",
                    description: "Auto-save: HP dropped to danger zone",
                    auto: true,
                  });
                  await pruneAutoCheckpoints(campaignId, 3);
                } catch (err) {
                  log.warn("Reactive auto-checkpoint failed (non-blocking)", err);
                }
              };
              if (detachedCtx) {
                void runWithTurnContext({ ...detachedCtx, role: undefined }, ckptBody);
              } else {
                void ckptBody();
              }
            }

            if (event.type === "done") {
              settledTurnRollbackShield = true;
              setLastTurnSnapshot(campaignId, snapshot);
            }

            await writeRouteTurnEventSSE(campaignId, stream, event);
          }
        } catch (error) {
          if (isPendingNarrationError(error)) {
            outcome = "pending_resumed";
            const result = await streamPendingTurnNarration({
              campaignId,
              saga: error.pendingSaga,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
            });
            if (result === "pending") {
              outcome = "pending";
            }
            return;
          }
          if (error instanceof NarrationRepairExhaustedError) {
            outcome = "pending";
            const pending = findPendingNarrationSaga({ campaignId });
            await writeTurnEventSSE(stream, {
              type: "error",
              data: pendingNarrationData(
                pending,
                getErrorMessage(error, "Narration is pending repair."),
              ),
            });
            return;
          }
          const pendingResult = await streamPendingNarrationBeforeRollback({
            campaignId,
            stream,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult,
            onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
            pendingMessage: getErrorMessage(
              error,
              "Turn resolved but final narration is pending.",
            ),
          });
          if (pendingResult !== "none") {
            outcome = pendingResult === "resumed" ? "pending_resumed" : "pending";
            return;
          }
          if (settledTurnRollbackShield) {
            outcome = "error";
            log.error("Turn failed after settled done boundary; preserving finalized state", error);
            try {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  error: getErrorMessage(error, "Turn already settled; transport failed after finalization."),
                  settled: true,
                  recoverable: true,
                }),
              });
            } catch (writeError) {
              log.warn("Unable to report post-settlement action transport failure", writeError);
            }
            return;
          }
          outcome = "restored";
          log.error("Turn processing failed; restoring pre-turn boundary", error);
          try {
            await restoreSnapshot(campaignId, snapshot);
            const drainedEvents = drainPendingCommittedEvents(campaignId, currentTick);
            if (drainedEvents.length > 0) {
              log.event("turn.rollback.pending-committed-events-drained", {
                route: "/action",
                tick: currentTick,
                count: drainedEvents.length,
              });
            }
          } catch (restoreError) {
            outcome = "error";
            log.error("Failed to restore pre-turn boundary after action failure", restoreError);
          }
          clearLastTurnSnapshot(campaignId);
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: getErrorMessage(error, "Turn processing failed.") }),
          });
        } finally {
          for (const agg of finalizeAggregators(turnId)) {
            log.event("sse.stream.aggregate", {
              type: agg.type,
              deltaCount: agg.deltaCount,
              totalBytes: agg.totalBytes,
              sha256OfConcatenated: agg.sha256OfConcatenated,
            });
          }
          log.event("turn.end", {
            route: "/action",
            tick: currentTick,
            durationMs: Date.now() - turnStart,
            outcome,
          });
          // Per Gemini suggestion: flush transports before SSE closes so a
          // crash right after the final event still leaves a complete JSONL
          // on disk.
          try {
            rootPino.flush?.();
          } catch {
            // flush is best-effort; never surface as turn-end failure.
          }
          endTurn(campaignId);
          turnStartedForCampaign = null;
        }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getErrorMessage(error, "Action request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /lookup — Explicit grounded lookup via dedicated SSE -----------------

app.post("/lookup", async (c) => {
  try {
    const result = await parseBody(c, chatLookupBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, lookupKind, subject, compareAgainst, question } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    c.header("Cache-Control", "no-cache, no-transform");

    return streamSSE(c, async (stream) => {
      try {
        const lookup = await runGroundedLookup({
          campaignId,
          lookupKind,
          subject,
          compareAgainst,
          question,
        });
        const persistedMessages = buildLookupHistoryMessages(
          buildLookupCommandText({
            lookupKind,
            subject,
            compareAgainst,
            question,
          }),
          toPersistedLookupKind(lookup.lookupKind, compareAgainst),
          lookup.answer,
        );

        appendChatMessages(campaignId, persistedMessages);

        await stream.writeSSE({
          event: "lookup_result",
          data: JSON.stringify(lookup),
        });
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({ lookup: true }),
        });
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            error: getErrorMessage(error, "Lookup failed."),
          }),
        });
      }
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Lookup request failed.") },
      getErrorStatus(error),
    );
  }
});

// -- POST /retry — Re-roll the last turn with same player action --------------

app.post("/retry", async (c) => {
  let turnStartedForCampaign: string | null = null;
  try {
    const result = await parseBody(c, chatRetryBodySchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (!tryBeginTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }
    turnStartedForCampaign = campaignId;

    const settings = loadSettings();

    // Resolve Judge (required for Oracle)
    const judgeResult = resolveJudge(settings);
    if ("error" in judgeResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }

    // Resolve Storyteller (required for narration)
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: stResult.error }, stResult.status);
    }

    // Resolve Embedder (optional)
    const embedderResult = resolveEmbedder(settings);

    const pendingSaga = findPendingNarrationSaga({ campaignId });
    if (pendingSaga) {
      c.header("Cache-Control", "no-cache, no-transform");
      const turnId = randomUUID();
      const currentTick = readCampaignConfig(campaignId).currentTick ?? 0;
      return streamSSE(c, async (stream) => {
        const unregisterAbortCleanup = registerTurnAbortCleanup({
          signal: c.req.raw.signal,
          campaignId,
          route: "/retry",
        });
        try {
          await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
            try {
              await streamPendingTurnNarration({
                campaignId,
                saga: pendingSaga,
                stream,
                storytellerProvider: stResult.resolved.provider,
                storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
                storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
                embedderResult,
                onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
              });
            } finally {
              endTurn(campaignId);
              turnStartedForCampaign = null;
            }
          });
        } finally {
          unregisterAbortCleanup();
        }
      });
    }

    const previousSnapshot = getLastTurnSnapshot(campaignId);
    if (!previousSnapshot) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "Nothing to retry." }, 400);
    }
    const playerAction = getLastPlayerAction(campaignId);
    if (!playerAction) {
      endTurn(campaignId);
      turnStartedForCampaign = null;
      return c.json({ error: "No player action found to retry." }, 400);
    }

    await restoreSnapshot(campaignId, previousSnapshot);

    c.header("Cache-Control", "no-cache, no-transform");

    const turnId = randomUUID();
    const currentTick =
      readCampaignConfig(campaignId).currentTick ?? 0;

    return streamSSE(c, async (stream) => {
      const unregisterAbortCleanup = registerTurnAbortCleanup({
        signal: c.req.raw.signal,
        campaignId,
        route: "/retry",
      });
      try {
        await runWithTurnContext({ turnId, campaignId, tick: currentTick }, async () => {
        const turnStart = Date.now();
        log.event("turn.begin", {
          route: "/retry",
          campaignId,
          tick: currentTick,
          playerAction,
          judgeProvider: {
            id: judgeResult.resolved.provider.id,
            model: judgeResult.resolved.provider.model,
            baseUrl: judgeResult.resolved.provider.baseUrl,
          },
          storytellerProvider: {
            id: stResult.resolved.provider.id,
            model: stResult.resolved.provider.model,
            baseUrl: stResult.resolved.provider.baseUrl,
          },
        });

        let outcome: "success" | "error" | "restored" | "pending_resumed" | "pending" = "success";
        let settledTurnRollbackShield = false;
        try {
          const turnGenerator = processTurn({
            campaignId,
            playerAction,
            intent: playerAction, // Re-use player action as intent for retry
            method: "",
            judgeProvider: judgeResult.resolved.provider,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
            onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
          });

          for await (const event of turnGenerator) {
            if (event.type === "auto_checkpoint") {
              const detachedCtx = getTurnContext();
              const ckptBody = async (): Promise<void> => {
                try {
                  await createCheckpoint(campaignId, {
                    name: "auto-danger",
                    description: "Auto-save: HP dropped to danger zone",
                    auto: true,
                  });
                  await pruneAutoCheckpoints(campaignId, 3);
                } catch (err) {
                  log.warn("Reactive auto-checkpoint failed (non-blocking)", err);
                }
              };
              if (detachedCtx) {
                void runWithTurnContext({ ...detachedCtx, role: undefined }, ckptBody);
              } else {
                void ckptBody();
              }
            }

            if (event.type === "done") {
              settledTurnRollbackShield = true;
              setLastTurnSnapshot(campaignId, previousSnapshot);
            }

            await writeRouteTurnEventSSE(campaignId, stream, event);
          }
        } catch (error) {
          if (isPendingNarrationError(error)) {
            outcome = "pending_resumed";
            const result = await streamPendingTurnNarration({
              campaignId,
              saga: error.pendingSaga,
              stream,
              storytellerProvider: stResult.resolved.provider,
              storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
              storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
              embedderResult,
              onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
            });
            if (result === "pending") {
              outcome = "pending";
            }
            return;
          }
          if (error instanceof NarrationRepairExhaustedError) {
            outcome = "pending";
            const pending = findPendingNarrationSaga({ campaignId });
            await writeTurnEventSSE(stream, {
              type: "error",
              data: pendingNarrationData(
                pending,
                getErrorMessage(error, "Narration is pending repair."),
              ),
            });
            return;
          }
          const pendingResult = await streamPendingNarrationBeforeRollback({
            campaignId,
            stream,
            storytellerProvider: stResult.resolved.provider,
            storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
            storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
            embedderResult,
            onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
            pendingMessage: getErrorMessage(
              error,
              "Retry resolved but final narration is pending.",
            ),
          });
          if (pendingResult !== "none") {
            outcome = pendingResult === "resumed" ? "pending_resumed" : "pending";
            return;
          }
          if (settledTurnRollbackShield) {
            outcome = "error";
            log.error("Retry failed after settled done boundary; preserving finalized state", error);
            try {
              await stream.writeSSE({
                event: "error",
                data: JSON.stringify({
                  error: getErrorMessage(error, "Retry already settled; transport failed after finalization."),
                  settled: true,
                  recoverable: true,
                }),
              });
            } catch (writeError) {
              log.warn("Unable to report post-settlement retry transport failure", writeError);
            }
            return;
          }
          outcome = "restored";
          try {
            await restoreSnapshot(campaignId, previousSnapshot);
            const drainedEvents = drainPendingCommittedEvents(campaignId, currentTick);
            if (drainedEvents.length > 0) {
              log.event("turn.rollback.pending-committed-events-drained", {
                route: "/retry",
                tick: currentTick,
                count: drainedEvents.length,
              });
            }
          } catch (restoreError) {
            outcome = "error";
            log.error("Failed to restore pre-turn boundary after retry failure", restoreError);
          }
          clearLastTurnSnapshot(campaignId);
          await stream.writeSSE({
            event: "error",
            data: JSON.stringify({ error: getErrorMessage(error, "Retry failed.") }),
          });
        } finally {
          for (const agg of finalizeAggregators(turnId)) {
            log.event("sse.stream.aggregate", {
              type: agg.type,
              deltaCount: agg.deltaCount,
              totalBytes: agg.totalBytes,
              sha256OfConcatenated: agg.sha256OfConcatenated,
            });
          }
          log.event("turn.end", {
            route: "/retry",
            tick: currentTick,
            durationMs: Date.now() - turnStart,
            outcome,
          });
          try {
            rootPino.flush?.();
          } catch {
            // flush is best-effort; never surface as turn-end failure.
          }
          endTurn(campaignId);
          turnStartedForCampaign = null;
        }
        });
      } finally {
        unregisterAbortCleanup();
      }
    });
  } catch (error) {
    if (turnStartedForCampaign) {
      endTurn(turnStartedForCampaign);
    }
    return c.json(
      { error: getErrorMessage(error, "Retry request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /undo — Revert last action+response pair ----------------------------

app.post("/undo", async (c) => {
  try {
    const result = await parseBody(c, chatUndoBodySchema);
    if ("response" in result) return result.response;

    const { campaignId } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;
    if (hasActiveTurn(campaignId)) {
      return c.json({ error: "The world is still settling. Wait for the turn to finish." }, 409);
    }

    const previousSnapshot = getLastTurnSnapshot(campaignId);
    if (!previousSnapshot) {
      return c.json({ error: "Nothing to undo." }, 400);
    }

    // Restore pre-turn game state
    await restoreSnapshot(campaignId, previousSnapshot);

    // Single-step undo only
    clearLastTurnSnapshot(campaignId);

    return c.json({ ok: true, messagesRemoved: 2 });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Undo request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /edit — Edit an assistant message content ---------------------------

app.post("/edit", async (c) => {
  try {
    const result = await parseBody(c, chatEditBodySchema);
    if ("response" in result) return result.response;

    const { campaignId, messageIndex, newContent } = result.data;
    const campaign = await requireLoadedCampaign(c, campaignId);
    if (campaign instanceof Response) return campaign;

    const success = replaceChatMessage(
      campaignId,
      messageIndex,
      newContent
    );

    if (!success) {
      return c.json(
        { error: "Invalid message index or not an assistant message." },
        400
      );
    }

    return c.json({ ok: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Edit request failed.") },
      getErrorStatus(error)
    );
  }
});

export default app;
