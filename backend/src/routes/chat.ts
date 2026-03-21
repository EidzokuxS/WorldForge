import { Hono } from "hono";
import { callStoryteller } from "../ai/index.js";
import type { ChatMessage } from "../ai/index.js";
import {
  appendChatMessages,
  getCampaignPremise,
  getChatHistory,
} from "../campaign/chat-history.js";
import { getActiveCampaign } from "../campaign/manager.js";
import { clamp } from "../lib/clamp.js";
import { getErrorMessage, getErrorStatus } from "../lib/errors.js";
import { loadSettings } from "../settings/index.js";
import { resolveStoryteller } from "./helpers.js";
import { chatBodySchema, parseBody } from "./schemas.js";

const app = new Hono();

app.get("/history", (c) => {
  const activeCampaign = getActiveCampaign();
  if (!activeCampaign) {
    return c.json({ error: "No active campaign loaded." }, 400);
  }

  try {
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
      console.error("Failed to persist user message:", error);
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
              console.error("Failed to persist assistant message after 3 attempts:", error);
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

export default app;
