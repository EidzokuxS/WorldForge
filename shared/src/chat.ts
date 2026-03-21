import type { ChatMessage } from "./types.js";

export function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<ChatMessage>;
  const validRole =
    candidate.role === "user" ||
    candidate.role === "assistant" ||
    candidate.role === "system";
  return validRole && typeof candidate.content === "string";
}
