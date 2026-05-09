/**
 * Shared parsing helpers for engine modules.
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
          : Array.isArray(obj.shortTerm)
            ? obj.shortTerm.filter((g): g is string => typeof g === "string")
            : [],
        long_term: Array.isArray(obj.long_term)
          ? obj.long_term.filter((g): g is string => typeof g === "string")
          : Array.isArray(obj.longTerm)
            ? obj.longTerm.filter((g): g is string => typeof g === "string")
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

// -- AI SDK step extraction ---------------------------------------------------

export interface CollectedToolCall {
  tool: string;
  args: unknown;
  result: unknown;
  toolCallId?: string;
}

interface StepLike {
  toolCalls?: Array<{ toolName: string; toolCallId?: string } & Record<string, unknown>>;
  toolResults?: unknown[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(record: Record<string, unknown>, field: string): string | null {
  const value = record[field];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function resultPayload(value: unknown): unknown {
  if (!isRecord(value)) return null;
  return value.output ?? value.result ?? null;
}

export function collectToolCalls(steps: StepLike[]): CollectedToolCall[] {
  const collected: CollectedToolCall[] = [];
  const seenToolCallIds = new Set<string>();

  for (const step of steps) {
    const calls = step.toolCalls ?? [];
    const results = step.toolResults ?? [];
    const resultsById = new Map<string, unknown>();

    for (const result of results) {
      if (!isRecord(result)) continue;
      const resultId = stringField(result, "toolCallId");
      if (resultId) {
        resultsById.set(resultId, result);
      }
    }

    for (let i = 0; i < calls.length; i++) {
      const tc = calls[i]!;
      const raw = tc as unknown as Record<string, unknown>;
      const toolCallId = stringField(raw, "toolCallId") ?? undefined;
      if (toolCallId) {
        if (seenToolCallIds.has(toolCallId)) {
          continue;
        }
        seenToolCallIds.add(toolCallId);
      }
      const rawResult = toolCallId && resultsById.has(toolCallId)
        ? resultsById.get(toolCallId)
        : results[i];
      collected.push({
        tool: tc.toolName,
        args: raw.input ?? raw.args ?? {},
        result: resultPayload(rawResult),
        ...(toolCallId ? { toolCallId } : {}),
      });
    }
  }
  return collected;
}
