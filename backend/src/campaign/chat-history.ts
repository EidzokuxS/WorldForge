import fs from "node:fs";
import type { ChatMessage } from "@worldforge/shared";
import { isChatMessage } from "@worldforge/shared";
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
