import { createHash } from "node:crypto";

const TRUNCATION_THRESHOLD = 10_000;
export const SERIALIZE_MAX_DEPTH = 6;

export interface TruncatedReference {
  _truncated: true;
  _sha256: string;
  _length: number;
  _head: string;
  _tail: string;
}

export function truncatedReference(s: string): TruncatedReference {
  return {
    _truncated: true,
    _sha256: createHash("sha256").update(s).digest("hex"),
    _length: s.length,
    _head: s.slice(0, 500),
    _tail: s.slice(-500),
  };
}

function serializeString(s: string): string | TruncatedReference {
  return s.length > TRUNCATION_THRESHOLD ? truncatedReference(s) : s;
}

function serializeValue(
  value: unknown,
  depth: number,
  seen: WeakSet<object>,
): unknown {
  if (depth > SERIALIZE_MAX_DEPTH) {
    return {
      _truncated: true,
      _reason: "max-depth",
      _typeof: typeof value,
    };
  }

  if (value === null || value === undefined) return value;
  if (typeof value === "string") return serializeString(value);
  if (
    typeof value === "number" ||
    typeof value === "boolean" ||
    typeof value === "bigint"
  ) {
    return value;
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: serializeString(value.message),
      stack: value.stack ? serializeString(value.stack) : undefined,
    };
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return { _truncated: true, _reason: "cycle" };
    }
    seen.add(value);
    return value.map((v) => serializeValue(v, depth + 1, seen));
  }

  if (typeof value === "object") {
    const obj = value as object;
    if (seen.has(obj)) {
      return { _truncated: true, _reason: "cycle" };
    }
    seen.add(obj);
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = serializeValue(v, depth + 1, seen);
    }
    return out;
  }

  // Functions, symbols — coerce to string representation.
  return String(value);
}

/**
 * Field-level recursive truncation. Walks objects/arrays key-by-key and
 * truncates ONLY oversized string values in place. Shape is preserved:
 *   `{ targetTags: [huge, "short"], assembledChars: 42 }` becomes
 *   `{ targetTags: [TruncatedRef, "short"], assembledChars: 42 }`.
 *
 * Max recursion depth: SERIALIZE_MAX_DEPTH (6). Cycles return a short marker.
 */
export function serializePayload(value: unknown): unknown {
  return serializeValue(value, 0, new WeakSet());
}
