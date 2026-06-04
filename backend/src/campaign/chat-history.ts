import fs from "node:fs";
import type { ChatMessage } from "@worldforge/shared";
import { formatLookupLogEntry, isChatMessage } from "@worldforge/shared";
import { readCampaignConfig } from "./manager.js";
import { getChatHistoryPath } from "./paths.js";

export function getCampaignPremise(campaignId: string): string {
  return readCampaignConfig(campaignId).premise;
}

export function getChatHistory(campaignId: string): ChatMessage[] {
  const filePath = getChatHistoryPath(campaignId);
  if (!fs.existsSync(filePath)) {
    return [];
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(isChatMessage);
  } catch {
    return [];
  }
}

export function appendChatMessages(
  campaignId: string,
  messages: ChatMessage[]
): void {
  const filePath = getChatHistoryPath(campaignId);
  const existing = getChatHistory(campaignId);
  existing.push(...messages);
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2), "utf-8");
}

export function buildLookupHistoryMessages(
  userCommand: string,
  lookupKind: string,
  answer: string,
): ChatMessage[] {
  return [
    { role: "user", content: userCommand },
    {
      role: "assistant",
      content: formatLookupLogEntry(lookupKind, answer),
    },
  ];
}

/**
 * Remove the last `count` messages from chat history.
 * Returns the removed messages (in order they appeared).
 */
export function popLastMessages(
  campaignId: string,
  count: number
): ChatMessage[] {
  const filePath = getChatHistoryPath(campaignId);
  const history = getChatHistory(campaignId);

  if (count <= 0 || history.length === 0) {
    return [];
  }

  const removeCount = Math.min(count, history.length);
  const removed = history.splice(history.length - removeCount, removeCount);

  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
  return removed;
}

/**
 * Replace the content of a specific assistant message in chat history.
 * Returns true on success, false if index is out of range or message is not assistant role.
 */
export function replaceChatMessage(
  campaignId: string,
  index: number,
  newContent: string
): boolean {
  const filePath = getChatHistoryPath(campaignId);
  const history = getChatHistory(campaignId);

  if (index < 0 || index >= history.length) {
    return false;
  }

  const message = history[index];
  if (!message || message.role !== "assistant") {
    return false;
  }

  message.content = newContent;
  fs.writeFileSync(filePath, JSON.stringify(history, null, 2), "utf-8");
  return true;
}

/**
 * Find the last user message in chat history.
 * Returns the message content or null if no user messages exist.
 */
export function getLastPlayerAction(campaignId: string): string | null {
  const history = getChatHistory(campaignId);

  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i]!.role === "user") {
      return history[i]!.content;
    }
  }

  return null;
}
