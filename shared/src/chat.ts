import type { ChatMessage } from "./types.js";

const LOOKUP_LOG_ENTRY_PATTERN = /^\[Lookup:\s*([^\]]+)\]\s*(.*)$/s;

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

export function formatLookupLogEntry(kind: string, answer: string): string {
  return `[Lookup: ${kind.trim()}] ${answer}`;
}

export function parseLookupLogEntry(
  content: string,
): { lookupKind: string; answer: string } | null {
  const match = content.match(LOOKUP_LOG_ENTRY_PATTERN);
  if (!match) {
    return null;
  }

  return {
    lookupKind: match[1]?.trim() ?? "",
    answer: match[2] ?? "",
  };
}
