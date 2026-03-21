/**
 * Shared JSON-string parsing helpers for engine modules.
 *
 * Each function safely parses a JSON string stored in SQLite (tags, goals,
 * beliefs) and returns a typed result, falling back to an empty default
 * on invalid input.
 */

// -- Types --------------------------------------------------------------------

export interface NpcGoals {
  short_term: string[];
  long_term: string[];
}

// -- Parsers ------------------------------------------------------------------

/** Parse a JSON string containing a string array (tags, flat goals, assets, etc.). */
export function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((t): t is string => typeof t === "string")
      : [];
  } catch {
    return [];
  }
}

/** Parse a JSON string containing an NPC goals object `{ short_term, long_term }`. */
export function parseNpcGoals(raw: string): NpcGoals {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      return {
        short_term: Array.isArray(obj.short_term)
          ? obj.short_term.filter((g): g is string => typeof g === "string")
          : [],
        long_term: Array.isArray(obj.long_term)
          ? obj.long_term.filter((g): g is string => typeof g === "string")
          : [],
      };
    }
  } catch { /* ignore */ }
  return { short_term: [], long_term: [] };
}

/** Parse a JSON string containing a beliefs array. */
export function parseBeliefs(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((b): b is string => typeof b === "string")
      : [];
  } catch {
    return [];
  }
}
