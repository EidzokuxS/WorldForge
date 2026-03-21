import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { callStoryteller } from "../ai/index.js";
import type { ChatMessage } from "@worldforge/shared";
import {
  appendChatMessages,
  getCampaignPremise,
  getChatHistory,
  getActiveCampaign,
  popLastMessages,
  replaceChatMessage,
  getLastPlayerAction,
} from "../campaign/index.js";
import { clamp, getErrorMessage, getErrorStatus } from "../lib/index.js";
import { loadSettings } from "../settings/index.js";
import { parseBody, resolveStoryteller, resolveJudge, resolveEmbedder } from "./helpers.js";
import { chatBodySchema, chatActionBodySchema, chatEditBodySchema } from "./schemas.js";
import { createLogger } from "../lib/index.js";
import { processTurn, captureSnapshot, restoreSnapshot, tickPresentNpcs, simulateOffscreenNpcs, checkAndTriggerReflections, tickFactions } from "../engine/index.js";
import type { TurnSnapshot, TurnSummary } from "../engine/index.js";
import { embedAndUpdateEvent } from "../vectors/episodic-events.js";
import type { Settings } from "../settings/index.js";
import type { ProviderConfig } from "../ai/provider-registry.js";

const log = createLogger("chat");

const app = new Hono();

// -- Module-level state for last turn (in-memory only) ------------------------

let lastTurnSnapshot: TurnSnapshot | null = null;

// -- Helpers ------------------------------------------------------------------

/**
 * Track spawned entity IDs from a state_update event into the snapshot.
 */
function trackSpawnedEntity(
  snapshot: TurnSnapshot,
  toolResult: { tool: string; args: unknown; result: unknown }
): void {
  const result = toolResult.result as Record<string, unknown> | undefined;
  if (!result || !result.id) return;

  const id = result.id as string;

  switch (toolResult.tool) {
    case "spawn_npc":
      snapshot.spawnedNpcIds.push(id);
      break;
    case "spawn_item":
      snapshot.spawnedItemIds.push(id);
      break;
    case "reveal_location":
      snapshot.revealedLocationIds.push(id);
      break;
    case "set_relationship":
      snapshot.createdRelationshipIds.push(id);
      break;
    case "add_chronicle_entry": {
      // Chronicle tool returns { entryId } not { id }
      const entryId = (result as Record<string, unknown>).entryId as string | undefined;
      if (entryId) {
        snapshot.createdChronicleIds.push(entryId);
      }
      break;
    }
  }
}

/**
 * Build onPostTurn callback that:
 * 1. Embeds log_event tool calls asynchronously
 * 2. Ticks NPC agents at the player's location
 * 3. Off-screen batch NPC simulation
 * 4. Checks NPC importance thresholds and triggers reflection if needed
 *
 * Failures are logged but never block or error the response.
 */
function buildOnPostTurn(
  settings: Settings,
  campaignId: string,
  judgeProvider: ProviderConfig,
): ((summary: TurnSummary) => Promise<void>) | undefined {
  return async (summary: TurnSummary) => {
    // -- 1. Embed log_event tool calls --
    const logEvents = summary.toolCalls.filter((tc) => tc.tool === "log_event");
    const emb = resolveEmbedder(settings);
    const embedderAvailable = !("error" in emb);

    if (logEvents.length > 0 && embedderAvailable) {
      for (const logEvent of logEvents) {
        const toolResult = logEvent.result as Record<string, unknown> | undefined;
        const inner = toolResult?.result as Record<string, unknown> | undefined;
        const eventId = inner?.eventId as string | undefined;
        const text = (logEvent.args as Record<string, unknown>)?.text as string | undefined;
        if (!eventId || !text) continue;

        try {
          await embedAndUpdateEvent(eventId, text, emb.resolved.provider);
        } catch (err) {
          log.warn("Failed to embed episodic event", err);
        }
      }
    }

    // -- 2. Tick NPC agents at player's location --
    // -- 3. Off-screen batch simulation (every N ticks) --
    try {
      const db = (await import("../db/index.js")).getDb();
      const { players } = await import("../db/schema.js");
      const { eq } = await import("drizzle-orm");

      const player = db
        .select({ currentLocationId: players.currentLocationId })
        .from(players)
        .where(eq(players.campaignId, campaignId))
        .get();

      if (player?.currentLocationId) {
        // Tick present NPCs
        const embedderProvider = embedderAvailable ? emb.resolved.provider : undefined;
        try {
          await tickPresentNpcs(
            campaignId,
            summary.tick,
            judgeProvider,
            player.currentLocationId,
            embedderProvider,
          );
        } catch (err) {
          log.warn("NPC tick processing failed (non-blocking)", err);
        }

        // Off-screen batch simulation (every N ticks)
        try {
          await simulateOffscreenNpcs(
            campaignId,
            summary.tick,
            judgeProvider,
            player.currentLocationId,
          );
        } catch (err) {
          log.warn("Off-screen NPC simulation failed (non-blocking)", err);
        }
      }
    } catch (err) {
      log.warn("NPC processing failed (non-blocking)", err);
    }

    // -- 4. Reflection checks (importance-triggered) --
    try {
      const embedderProvider = (() => {
        const emb = resolveEmbedder(settings);
        return !("error" in emb) ? emb.resolved.provider : undefined;
      })();

      await checkAndTriggerReflections(
        campaignId,
        summary.tick,
        judgeProvider,
        embedderProvider,
      );
    } catch (err) {
      log.warn("Reflection processing failed (non-blocking)", err);
    }

    // -- 5. World engine faction ticks (every N ticks) --
    try {
      await tickFactions(campaignId, summary.tick, judgeProvider);
    } catch (err) {
      log.warn("World engine tick failed (non-blocking)", err);
    }
  };
}

// -- GET /history -------------------------------------------------------------

app.get("/history", (c) => {
  try {
    const activeCampaign = getActiveCampaign();
    if (!activeCampaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
    }

    const premise = getCampaignPremise(activeCampaign.id);
    const messages = getChatHistory(activeCampaign.id);
    return c.json({ messages, premise });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Failed to read chat history.") },
      getErrorStatus(error)
    );
  }
});

// -- POST / (legacy plain-text streaming) -------------------------------------

app.post("/", async (c) => {
  try {
    const result = await parseBody(c, chatBodySchema);
    if ("response" in result) return result.response;

    const { playerAction } = result.data;
    const activeCampaign = getActiveCampaign();
    if (!activeCampaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
    }

    const stResult = resolveStoryteller(loadSettings());
    if ("error" in stResult) {
      return c.json({ error: stResult.error }, stResult.status);
    }

    const { provider, temperature, maxTokens } = stResult.resolved;

    let worldPremise: string;
    let chatHistory: ChatMessage[] = [];
    try {
      worldPremise = getCampaignPremise(activeCampaign.id);
      chatHistory = getChatHistory(activeCampaign.id);
    } catch (error) {
      return c.json(
        { error: getErrorMessage(error, "Failed to load chat context.") },
        getErrorStatus(error)
      );
    }

    const userMessage: ChatMessage = { role: "user", content: playerAction };

    // Fire-and-forget: persist user message without blocking the stream.
    try {
      appendChatMessages(activeCampaign.id, [userMessage]);
    } catch (error) {
      log.error("Failed to persist user message", error);
    }

    const streamResult = callStoryteller({
      playerAction,
      worldPremise,
      chatHistory,
      temperature: clamp(temperature, 0, 2),
      maxTokens: clamp(maxTokens, 1, 32000),
      provider,
      onFinish: async ({ text }) => {
        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: text.trim(),
        };
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            appendChatMessages(activeCampaign.id, [assistantMessage]);
            return;
          } catch (error) {
            if (attempt === 2) {
              log.error("Failed to persist assistant message after 3 attempts", error);
            } else {
              await new Promise((r) => setTimeout(r, 50));
            }
          }
        }
      },
    });

    return streamResult.toTextStreamResponse({
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Chat request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /action — Full turn cycle via SSE (Oracle + Storyteller + tools) ----

app.post("/action", async (c) => {
  try {
    const result = await parseBody(c, chatActionBodySchema);
    if ("response" in result) return result.response;

    const { playerAction, intent, method } = result.data;
    const activeCampaign = getActiveCampaign();
    if (!activeCampaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
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

    // Resolve Embedder (optional -- used for lore search)
    const embedderResult = resolveEmbedder(settings);

    // Capture pre-turn snapshot for potential undo/retry
    const snapshot = captureSnapshot(activeCampaign.id);

    c.header("Cache-Control", "no-cache, no-transform");

    return streamSSE(c, async (stream) => {
      try {
        const turnGenerator = processTurn({
          campaignId: activeCampaign.id,
          playerAction,
          intent,
          method,
          judgeProvider: judgeResult.resolved.provider,
          storytellerProvider: stResult.resolved.provider,
          storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
          storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
          embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
          onPostTurn: buildOnPostTurn(settings, activeCampaign.id, judgeResult.resolved.provider),
        });

        for await (const event of turnGenerator) {
          // Track spawned entities for rollback
          if (event.type === "state_update") {
            trackSpawnedEntity(
              snapshot,
              event.data as { tool: string; args: unknown; result: unknown }
            );
          }

          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          });
        }

        // Turn completed successfully -- store snapshot for potential undo/retry
        lastTurnSnapshot = snapshot;
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: getErrorMessage(error, "Turn processing failed.") }),
        });
      }
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Action request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /retry — Re-roll the last turn with same player action --------------

app.post("/retry", async (c) => {
  try {
    const activeCampaign = getActiveCampaign();
    if (!activeCampaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
    }

    if (!lastTurnSnapshot) {
      return c.json({ error: "Nothing to retry." }, 400);
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

    // Restore pre-turn game state
    restoreSnapshot(activeCampaign.id, lastTurnSnapshot);

    // Remove last assistant message (keep user message)
    popLastMessages(activeCampaign.id, 1);

    // Get the player action to re-run
    const playerAction = getLastPlayerAction(activeCampaign.id);
    if (!playerAction) {
      return c.json({ error: "No player action found to retry." }, 400);
    }

    // Capture fresh snapshot for the re-run
    const freshSnapshot = captureSnapshot(activeCampaign.id);

    c.header("Cache-Control", "no-cache, no-transform");

    return streamSSE(c, async (stream) => {
      try {
        const turnGenerator = processTurn({
          campaignId: activeCampaign.id,
          playerAction,
          intent: playerAction, // Re-use player action as intent for retry
          method: "",
          judgeProvider: judgeResult.resolved.provider,
          storytellerProvider: stResult.resolved.provider,
          storytellerTemperature: clamp(stResult.resolved.temperature, 0, 2),
          storytellerMaxTokens: clamp(stResult.resolved.maxTokens, 1, 32000),
          embedderResult: embedderResult && !("error" in embedderResult) ? embedderResult : undefined,
          onPostTurn: buildOnPostTurn(settings, activeCampaign.id, judgeResult.resolved.provider),
        });

        for await (const event of turnGenerator) {
          // Track spawned entities for potential next rollback
          if (event.type === "state_update") {
            trackSpawnedEntity(
              freshSnapshot,
              event.data as { tool: string; args: unknown; result: unknown }
            );
          }

          await stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event.data),
          });
        }

        // Store new snapshot for potential further retry/undo
        lastTurnSnapshot = freshSnapshot;
      } catch (error) {
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({ error: getErrorMessage(error, "Retry failed.") }),
        });
      }
    });
  } catch (error) {
    return c.json(
      { error: getErrorMessage(error, "Retry request failed.") },
      getErrorStatus(error)
    );
  }
});

// -- POST /undo — Revert last action+response pair ----------------------------

app.post("/undo", async (c) => {
  try {
    const activeCampaign = getActiveCampaign();
    if (!activeCampaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
    }

    if (!lastTurnSnapshot) {
      return c.json({ error: "Nothing to undo." }, 400);
    }

    // Restore pre-turn game state
    restoreSnapshot(activeCampaign.id, lastTurnSnapshot);

    // Remove last user + assistant message pair
    popLastMessages(activeCampaign.id, 2);

    // Single-step undo only
    lastTurnSnapshot = null;

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

    const { messageIndex, newContent } = result.data;
    const activeCampaign = getActiveCampaign();
    if (!activeCampaign) {
      return c.json({ error: "No active campaign loaded." }, 400);
    }

    const success = replaceChatMessage(
      activeCampaign.id,
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
