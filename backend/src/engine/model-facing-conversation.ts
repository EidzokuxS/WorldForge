import {
  shouldDropModelFacingText,
  type ModelFacingPromptSafety,
} from "./model-facing-scene.js";
import {
  sanitizeModelFacingJsonValue,
  sanitizeModelFacingText,
} from "./model-facing-ref-safety.js";

export interface ModelFacingConversationEntry {
  role: string;
  content: string;
}

export interface FormatModelFacingRecentConversationOptions {
  safety?: ModelFacingPromptSafety;
  extraForbiddenTerms?: readonly string[];
  maxEntries?: number;
  maxChars?: number;
  assistantMode?: "omit" | "marker" | "sanitized";
}

export type FormatModelFacingPlayerActionOptions = Pick<
  FormatModelFacingRecentConversationOptions,
  "safety" | "extraForbiddenTerms" | "maxChars"
>;

const DEFAULT_RECENT_CONVERSATION_LIMIT = 8;
const DEFAULT_RECENT_CONVERSATION_MAX_CHARS = 1000;
const PRIOR_ASSISTANT_PROSE_MARKER =
  "[prior GM prose omitted: presentation only, not legal evidence or world authority]";

function isWhitespace(char: string): boolean {
  return char.length > 0 && char.trim() === "";
}

function compactModelFacingText(value: string, maxChars: number): string {
  let compacted = "";
  let pendingSpace = false;

  for (const char of value.trim()) {
    if (isWhitespace(char)) {
      pendingSpace = compacted.length > 0;
      continue;
    }
    if (pendingSpace) {
      compacted += " ";
      pendingSpace = false;
    }
    compacted += char;
  }

  if (compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function includesExtraForbiddenTerm(text: string, terms: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some((term) => lower.includes(term));
}

function normalizedExtraForbiddenTerms(terms: readonly string[] = []): string[] {
  return terms
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean);
}

function safeConversationRole(role: string): string {
  let compacted = "";
  for (const char of role.trim().toLowerCase()) {
    const code = char.charCodeAt(0);
    const isAsciiLetter = code >= 97 && code <= 122;
    const isDigit = code >= 48 && code <= 57;
    if (isAsciiLetter || isDigit || char === "_" || char === "-") {
      compacted += char;
    }
  }
  return compacted || "entry";
}

function modelFacingConversationRoleLabel(role: string): string {
  const safeRole = safeConversationRole(role);
  switch (safeRole) {
    case "user":
      return "player_claim";
    case "assistant":
      return "prior_gm_visible_prose_non_authority";
    default:
      return safeRole;
  }
}

export function sanitizeModelFacingConversationText(
  text: string,
  options: Pick<FormatModelFacingRecentConversationOptions, "safety" | "extraForbiddenTerms" | "maxChars"> = {},
): string {
  return compactModelFacingText(
    sanitizeModelFacingText(text, {
      safety: options.safety,
      extraForbiddenTerms: options.extraForbiddenTerms,
    }),
    options.maxChars ?? DEFAULT_RECENT_CONVERSATION_MAX_CHARS,
  );
}

export function formatModelFacingPlayerActionText(
  playerAction: string,
  options: FormatModelFacingPlayerActionOptions = {},
): string {
  return sanitizeModelFacingConversationText(playerAction, {
    ...options,
    maxChars: options.maxChars ?? DEFAULT_RECENT_CONVERSATION_MAX_CHARS,
  }) || "[empty player action]";
}

export function formatModelFacingConversationEntry(
  entry: ModelFacingConversationEntry,
  options: Omit<FormatModelFacingRecentConversationOptions, "maxEntries"> = {},
): string | null {
  const extraForbiddenTerms = normalizedExtraForbiddenTerms(options.extraForbiddenTerms);
  if (options.safety && shouldDropModelFacingText(entry.content, options.safety)) return null;
  if (includesExtraForbiddenTerm(entry.content, extraForbiddenTerms)) return null;

  const maxChars = options.maxChars ?? DEFAULT_RECENT_CONVERSATION_MAX_CHARS;
  const assistantMode = options.assistantMode ?? "marker";
  const roleLabel = modelFacingConversationRoleLabel(entry.role);
  if (roleLabel === "prior_gm_visible_prose_non_authority") {
    if (assistantMode === "omit") {
      return null;
    }
    if (assistantMode === "marker") {
      return `${roleLabel}: ${PRIOR_ASSISTANT_PROSE_MARKER}`;
    }
  }
  const content = sanitizeModelFacingConversationText(entry.content, {
    safety: options.safety,
    extraForbiddenTerms: options.extraForbiddenTerms,
    maxChars,
  });
  return `${roleLabel}: ${content}`;
}

export function sanitizeModelFacingJson(
  value: unknown,
  options: Pick<FormatModelFacingRecentConversationOptions, "safety" | "extraForbiddenTerms" | "maxChars"> = {},
): unknown {
  return sanitizeModelFacingJsonValue(value, options);
}

export {
  sanitizeModelFacingBackendRefs as redactModelFacingBackendRefs,
  redactModelFacingForbiddenTerms,
} from "./model-facing-ref-safety.js";

export function formatModelFacingRecentConversation(
  recentConversation?: readonly ModelFacingConversationEntry[],
  options: FormatModelFacingRecentConversationOptions = {},
): string {
  if (!recentConversation || recentConversation.length === 0) {
    return "- none";
  }

  const maxEntries = options.maxEntries ?? DEFAULT_RECENT_CONVERSATION_LIMIT;

  const lines = recentConversation
    .slice(-Math.max(maxEntries * 2, maxEntries))
    .map((entry) => formatModelFacingConversationEntry(entry, options))
    .filter((line): line is string => Boolean(line))
    .slice(-maxEntries)
    .map((line) => `- ${line}`)
    .filter((line) => line.trim().length > 0);

  return lines.join("\n") || "- none";
}
