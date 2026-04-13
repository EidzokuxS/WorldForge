import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { buildLookupHistoryMessages } from "../campaign/chat-history.js";
import {
  appendChatMessages,
  getChatHistory,
  getCampaignPremise,
  replaceChatMessage,
  getLastPlayerAction,
  createCheckpoint,
  pruneAutoCheckpoints,
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
import { createLogger } from "../lib/index.js";
import {
  processOpeningScene,
  processTurn,
  captureSnapshot,
  restoreSnapshot,
  tickPresentNpcs,
  simulateOffscreenNpcs,
  checkAndTriggerReflections,
  tickFactions,
} from "../engine/index.js";
import type {
  HiddenTurnSummary,
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
import { resolveFallbackProvider } from "../ai/with-model-fallback.js";
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

/**
 * Rollback-critical work must finish before the turn is marked done.
 */
async function runRollbackCriticalPostTurn(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  summary: TurnSummary,
): Promise<void> {
  const emb = resolveEmbedder(settings);
  const embedderProvider = !("error" in emb) ? emb.resolved.provider : undefined;
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

  if (player?.currentLocationId) {
    await simulateOffscreenNpcs(
      campaignId,
      summary.tick,
      judgeProvider,
      player.currentLocationId,
      player.currentSceneLocationId ?? undefined,
    );
  }

  await checkAndTriggerReflections(
    campaignId,
    summary.tick,
    judgeProvider,
    embedderProvider,
  );

  await tickFactions(campaignId, summary.tick, judgeProvider);
}

async function runLocalPresentSceneSettlement(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
  summary: HiddenTurnSummary,
): Promise<void> {
  const sceneScopeId = summary.currentSceneScopeId ?? summary.currentLocationId;
  if (!sceneScopeId) {
    return;
  }

  const emb = resolveEmbedder(settings);
  const embedderProvider = !("error" in emb) ? emb.resolved.provider : undefined;

  await tickPresentNpcs(
    campaignId,
    summary.predictedTick,
    judgeProvider,
    summary.currentLocationId ?? sceneScopeId,
    sceneScopeId,
    embedderProvider,
  );
}

function queueAuxiliaryPostTurnWork(
  settings: Settings,
  campaignId: string,
  summary: TurnSummary,
): void {
  void (async () => {
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
  })();
}

function buildOnPostTurn(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
): ((summary: TurnSummary) => Promise<void>) | undefined {
  return async (summary: TurnSummary) => {
    await runRollbackCriticalPostTurn(settings, campaignId, judgeProvider, summary);
    queueAuxiliaryPostTurnWork(settings, campaignId, summary);
  };
}

function buildOnBeforeVisibleNarration(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
): ((summary: HiddenTurnSummary) => Promise<void>) | undefined {
  return async (summary: HiddenTurnSummary) => {
    await runLocalPresentSceneSettlement(settings, campaignId, judgeProvider, summary);
  };
}

function campaignHasAssistantMessages(campaignId: string): boolean {
  return getChatHistory(campaignId).some((message) => message.role === "assistant");
}

async function writeTurnEventSSE(
  stream: { writeSSE: (event: { event: string; data: string }) => Promise<void> },
  event: { type: string; data: unknown },
): Promise<void> {
  if (event.type === "reasoning") {
    await stream.writeSSE({
      event: "reasoning",
      data: JSON.stringify(event.data),
    });
    return;
  }

  await stream.writeSSE({
    event: event.type,
    data: JSON.stringify(event.data),
  });
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
      return c.json({ error: stResult.error }, stResult.status);
    }

    const embedderResult = resolveEmbedder(settings);
    const fallbackProvider = resolveFallbackProvider(settings.fallback, settings.providers);

    c.header("Cache-Control", "no-cache, no-transform");

    return streamSSE(c, async (stream) => {
      try {
        const openingGenerator = processOpeningScene({
          campaignId,
          storytellerProvider: stResult.resolved.provider,
          storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
          storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
          embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
          fallbackProvider,
        });

        for await (const event of openingGenerator) {
          await writeTurnEventSSE(stream, event);
        }
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: getErrorMessage(error, "Opening scene generation failed.") }),
        });
      } finally {
        endTurn(campaignId);
        turnStartedForCampaign = null;
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

    const { campaignId, playerAction, intent, method } = result.data;
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
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }

    // Resolve Storyteller (required for narration)
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      return c.json({ error: stResult.error }, stResult.status);
    }

    // Resolve Embedder (optional -- used for lore search)
    const embedderResult = resolveEmbedder(settings);

    // Resolve Fallback provider (optional -- used for Oracle/Storyteller retry)
    const fallbackProvider = resolveFallbackProvider(settings.fallback, settings.providers);

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

    return streamSSE(c, async (stream) => {
      try {
        const turnGenerator = processTurn({
          campaignId,
          playerAction,
          intent,
          method,
          judgeProvider: judgeResult.resolved.provider,
          storytellerProvider: stResult.resolved.provider,
          storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
          storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
          embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
          fallbackProvider,
          onBeforeVisibleNarration: buildOnBeforeVisibleNarration(
            settings,
            campaignId,
            judgeResult.resolved.provider,
          ),
          onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
        });

        for await (const event of turnGenerator) {
          // Reactive auto-checkpoint when HP drops to danger zone during turn
          if (event.type === "auto_checkpoint") {
            void (async () => {
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
            })();
          }

          await writeTurnEventSSE(stream, event);
        }

        // Turn completed successfully -- store snapshot for potential undo/retry
        setLastTurnSnapshot(campaignId, snapshot);
      } catch (error) {
        try {
          await restoreSnapshot(campaignId, snapshot);
        } catch (restoreError) {
          log.error("Failed to restore pre-turn boundary after action failure", restoreError);
        }
        clearLastTurnSnapshot(campaignId);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: getErrorMessage(error, "Turn processing failed.") }),
        });
      } finally {
        endTurn(campaignId);
        turnStartedForCampaign = null;
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

    const settings = loadSettings();

    // Resolve Judge (required for Oracle)
    const judgeResult = resolveJudge(settings);
    if ("error" in judgeResult) {
      return c.json({ error: judgeResult.error }, judgeResult.status);
    }

    // Resolve Storyteller (required for narration)
    const stResult = resolveStoryteller(settings);
    if ("error" in stResult) {
      return c.json({ error: stResult.error }, stResult.status);
    }

    // Resolve Embedder (optional)
    const embedderResult = resolveEmbedder(settings);

    // Resolve Fallback provider (optional -- used for Oracle/Storyteller retry)
    const fallbackProvider = resolveFallbackProvider(settings.fallback, settings.providers);

    await restoreSnapshot(campaignId, previousSnapshot);

    c.header("Cache-Control", "no-cache, no-transform");

    return streamSSE(c, async (stream) => {
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
          fallbackProvider,
          onBeforeVisibleNarration: buildOnBeforeVisibleNarration(
            settings,
            campaignId,
            judgeResult.resolved.provider,
          ),
          onPostTurn: buildOnPostTurn(settings, campaignId, judgeResult.resolved.provider),
        });

        for await (const event of turnGenerator) {
          // Reactive auto-checkpoint when HP drops to danger zone during turn
          if (event.type === "auto_checkpoint") {
            void (async () => {
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
            })();
          }

          await writeTurnEventSSE(stream, event);
        }

        setLastTurnSnapshot(campaignId, previousSnapshot);
      } catch (error) {
        try {
          await restoreSnapshot(campaignId, previousSnapshot);
        } catch (restoreError) {
          log.error("Failed to restore pre-turn boundary after retry failure", restoreError);
        }
        clearLastTurnSnapshot(campaignId);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: getErrorMessage(error, "Retry failed.") }),
        });
      } finally {
        endTurn(campaignId);
        turnStartedForCampaign = null;
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

    return c.json({ success: true, messagesRemoved: 2 });
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

    return c.json({ success: true });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Edit request failed.") },
      getErrorStatus(error)
    );
  }
});

export default app;
