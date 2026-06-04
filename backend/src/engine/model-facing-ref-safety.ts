export interface ModelFacingTextSafety {
  forbiddenTerms?: readonly string[];
  backendOnlyTerms?: readonly string[];
}

export interface SanitizeModelFacingTextOptions {
  safety?: ModelFacingTextSafety;
  extraForbiddenTerms?: readonly string[];
  maxChars?: number;
}

export const MODEL_FACING_BACKEND_REF_REPLACEMENT = "[backend ref hidden]";

const BACKEND_REF_PREFIXES = [
  "tool-result",
  "tool_result",
  "action",
  "actor",
  "campaign",
  "candidate",
  "edge",
  "effect",
  "event",
  "fact",
  "faction",
  "item",
  "knowledge",
  "location",
  "movement",
  "npc",
  "player",
  "response",
  "route",
  "scene",
  "source",
  "authority",
  "world",
  "forecast",
  "tool",
  "loc",
] as const;

const BACKEND_REF_SEPARATORS = new Set([":", "-", "_"]);

const HYPHEN_PROSE_TOKENS = new Set([
  "player-facing",
  "player-supplied",
  "player-known",
  "source-boundary",
  "source-linked",
  "world-facing",
  "world-state",
  "world-states",
  "action-result",
]);

const UNDERSCORE_PROSE_TOKENS = new Set([
  "player_action",
  "player_known",
  "player_visible",
]);

function isWhitespace(char: string): boolean {
  return char.length > 0 && char.trim() === "";
}

function collapseWhitespace(value: string): string {
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

  return compacted;
}

function compactModelFacingText(value: string, maxChars?: number): string {
  const compacted = collapseWhitespace(value);
  if (!maxChars || compacted.length <= maxChars) return compacted;
  return `${compacted.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function isAsciiAlphaNumeric(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 90)
    || (code >= 97 && code <= 122);
}

function isHexChar(char: string | undefined): boolean {
  if (!char) return false;
  const code = char.charCodeAt(0);
  return (code >= 48 && code <= 57)
    || (code >= 65 && code <= 70)
    || (code >= 97 && code <= 102);
}

function isUuidBoundary(char: string | undefined): boolean {
  return !char || (!isHexChar(char) && char !== "-");
}

function isUuidAt(value: string, index: number): boolean {
  if (index < 0 || index + 36 > value.length) return false;
  if (!isUuidBoundary(value[index - 1])) return false;
  if (!isUuidBoundary(value[index + 36])) return false;

  for (let offset = 0; offset < 36; offset += 1) {
    const char = value[index + offset];
    if (offset === 8 || offset === 13 || offset === 18 || offset === 23) {
      if (char !== "-") return false;
      continue;
    }
    if (!isHexChar(char)) return false;
  }

  return true;
}

function isBackendRefTailChar(char: string | undefined): boolean {
  return isAsciiAlphaNumeric(char)
    || char === "."
    || char === "_"
    || char === ":"
    || char === "-";
}

function isTokenStartBoundary(char: string | undefined): boolean {
  return !char || (!isAsciiAlphaNumeric(char) && char !== "_");
}

interface BackendRefTokenMatch {
  token: string;
  prefix: string;
  separator: string;
  tail: string;
  end: number;
}

function matchBackendRefTokenAt(value: string, index: number): BackendRefTokenMatch | null {
  if (!isTokenStartBoundary(value[index - 1])) return null;

  const lower = value.toLowerCase();
  const matchingPrefix = BACKEND_REF_PREFIXES
    .filter((prefix) => lower.startsWith(prefix, index))
    .sort((left, right) => right.length - left.length)[0];
  if (!matchingPrefix) return null;

  const separatorIndex = index + matchingPrefix.length;
  const separator = value[separatorIndex];
  if (!BACKEND_REF_SEPARATORS.has(separator)) return null;

  const tailStart = separatorIndex + 1;
  if (!isAsciiAlphaNumeric(value[tailStart])) return null;

  let end = tailStart + 1;
  while (end < value.length && isBackendRefTailChar(value[end])) {
    end += 1;
  }

  const token = value.slice(index, end);
  return {
    token,
    prefix: matchingPrefix,
    separator,
    tail: value.slice(tailStart, end),
    end,
  };
}

function stripTerminalTokenPunctuation(value: string): string {
  let end = value.length;
  while (end > 0) {
    const char = value[end - 1];
    if (char !== "." && char !== ":" && char !== "-") {
      break;
    }
    end -= 1;
  }
  return value.slice(0, end);
}

function backendTokenIsUnsafe(prefix: string, separator: string, tail: string): boolean {
  if (separator === ":") return true;
  const normalizedTail = stripTerminalTokenPunctuation(tail);
  if (separator === "_") {
    return !UNDERSCORE_PROSE_TOKENS.has(`${prefix}_${normalizedTail}`.toLowerCase());
  }

  const token = `${prefix}-${normalizedTail}`.toLowerCase();
  if (HYPHEN_PROSE_TOKENS.has(token)) return false;
  if (prefix === "tool-result") return true;

  return true;
}

function backendRefPatternMatches(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    if (isUuidAt(value, index)) return true;

    const match = matchBackendRefTokenAt(value, index);
    if (match && backendTokenIsUnsafe(match.prefix, match.separator, match.tail.toLowerCase())) {
      return true;
    }
  }

  return false;
}

export function isBackendOnlyModelRef(value: string): boolean {
  const trimmed = value.trim();
  return !trimmed || backendRefPatternMatches(trimmed);
}

export function sanitizeModelFacingBackendRefs(text: string): string {
  let redacted = "";
  let index = 0;

  while (index < text.length) {
    if (isUuidAt(text, index)) {
      redacted += MODEL_FACING_BACKEND_REF_REPLACEMENT;
      index += 36;
      continue;
    }

    const match = matchBackendRefTokenAt(text, index);
    if (match) {
      redacted += backendTokenIsUnsafe(
        match.prefix,
        match.separator,
        match.tail.toLowerCase(),
      )
        ? MODEL_FACING_BACKEND_REF_REPLACEMENT
        : match.token;
      index = match.end;
      continue;
    }

    redacted += text[index];
    index += 1;
  }

  return redacted;
}

function replaceLiteralCaseInsensitive(
  value: string,
  search: string,
  replacement: string,
): string {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedSearch = search.toLocaleLowerCase();
  let cursor = 0;
  let result = "";

  while (cursor < value.length) {
    const matchIndex = normalizedValue.indexOf(normalizedSearch, cursor);
    if (matchIndex < 0) {
      result += value.slice(cursor);
      break;
    }
    result += value.slice(cursor, matchIndex);
    result += replacement;
    cursor = matchIndex + search.length;
  }

  return result;
}

export function redactModelFacingForbiddenTerms(
  text: string,
  terms: readonly string[] = [],
  replacement = "[private term hidden]",
): string {
  let redacted = text;
  for (const term of terms) {
    const trimmed = term.trim();
    if (!trimmed) continue;
    redacted = replaceLiteralCaseInsensitive(redacted, trimmed, replacement);
  }
  return redacted;
}

export function sanitizeModelFacingText(
  text: string,
  options: SanitizeModelFacingTextOptions = {},
): string {
  const safetyRedacted = redactModelFacingForbiddenTerms(
    text,
    options.safety?.forbiddenTerms,
    "[redacted]",
  );
  const backendOnlyRedacted = redactModelFacingForbiddenTerms(
    safetyRedacted,
    options.safety?.backendOnlyTerms,
    MODEL_FACING_BACKEND_REF_REPLACEMENT,
  );
  const privateRedacted = redactModelFacingForbiddenTerms(
    backendOnlyRedacted,
    options.extraForbiddenTerms,
  );
  return compactModelFacingText(
    sanitizeModelFacingBackendRefs(privateRedacted),
    options.maxChars,
  );
}

export function sanitizeModelFacingJsonValue(
  value: unknown,
  options: SanitizeModelFacingTextOptions = {},
): unknown {
  if (typeof value === "string") {
    return sanitizeModelFacingText(value, options);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeModelFacingJsonValue(entry, options));
  }
  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      sanitizeModelFacingText(key, options),
      sanitizeModelFacingJsonValue(entry, options),
    ]),
  );
}
