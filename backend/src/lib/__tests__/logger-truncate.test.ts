import { describe, it, expect } from "vitest";
import {
  serializePayload,
  truncatedReference,
  SERIALIZE_MAX_DEPTH,
} from "../logger-serializers.js";

interface TruncatedRef {
  _truncated: true;
  _sha256: string;
  _length: number;
  _head: string;
  _tail: string;
}

function isTruncated(v: unknown): v is TruncatedRef {
  return (
    typeof v === "object" &&
    v !== null &&
    (v as { _truncated?: unknown })._truncated === true &&
    typeof (v as { _sha256?: unknown })._sha256 === "string"
  );
}

describe("serializePayload — field-level recursive truncation", () => {
  it("returns primitive strings unchanged when under threshold", () => {
    expect(serializePayload("hello")).toBe("hello");
  });

  it("returns primitives (number, boolean, null, undefined) unchanged", () => {
    expect(serializePayload(42)).toBe(42);
    expect(serializePayload(true)).toBe(true);
    expect(serializePayload(null)).toBeNull();
    expect(serializePayload(undefined)).toBeUndefined();
  });

  it("truncates an oversized string into a TruncatedReference with sha256", () => {
    const big = "a".repeat(15000);
    const result = serializePayload(big);
    expect(isTruncated(result)).toBe(true);
    if (isTruncated(result)) {
      expect(result._length).toBe(15000);
      expect(result._head.length).toBe(500);
      expect(result._tail.length).toBe(500);
      expect(result._sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("preserves object shape: truncates huge siblings while keeping small ones", () => {
    const payload = {
      targetTags: ["a".repeat(15000), "short"],
      assembledChars: 42,
      type: "oracle_result",
      nested: { formatted: "x".repeat(15000), small: "ok" },
    };
    const result = serializePayload(payload) as Record<string, unknown>;

    expect(typeof result).toBe("object");
    expect(Array.isArray(result.targetTags)).toBe(true);
    const targetTags = result.targetTags as unknown[];
    expect(targetTags).toHaveLength(2);
    expect(isTruncated(targetTags[0])).toBe(true);
    expect(targetTags[1]).toBe("short");
    expect(result.assembledChars).toBe(42);
    expect(result.type).toBe("oracle_result");

    const nested = result.nested as Record<string, unknown>;
    expect(isTruncated(nested.formatted)).toBe(true);
    expect(nested.small).toBe("ok");
  });

  it("truncatedReference sha256 matches /^[0-9a-f]{64}$/", () => {
    const ref = truncatedReference("x".repeat(15000));
    expect(ref._sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("handles cycles without infinite loop", () => {
    const a: Record<string, unknown> = { name: "cyclic" };
    a.self = a;
    const result = serializePayload(a) as Record<string, unknown>;
    expect(result.name).toBe("cyclic");
    const self = result.self as Record<string, unknown>;
    expect(self._truncated).toBe(true);
    expect(self._reason).toBe("cycle");
  });

  it("collapses values at depth > SERIALIZE_MAX_DEPTH", () => {
    // Build an 8-level deep object so that at depth 6 we encounter a nested
    // object, and the values INSIDE that depth-6 object are at depth 7 which
    // must collapse to the max-depth marker.
    type Nested = { next?: Nested; leaf?: string };
    let node: Nested = { leaf: "bottom" };
    for (let i = 0; i < 7; i++) {
      node = { next: node };
    }
    const result = serializePayload(node) as Record<string, unknown>;
    expect(SERIALIZE_MAX_DEPTH).toBe(6);

    // Walk down. At depth > 6, entries should be the max-depth marker.
    let cursor: unknown = result;
    let depth = 0;
    while (
      typeof cursor === "object" &&
      cursor !== null &&
      "next" in (cursor as Record<string, unknown>)
    ) {
      cursor = (cursor as Record<string, unknown>).next;
      depth += 1;
      if (depth > SERIALIZE_MAX_DEPTH) break;
    }
    // Any further traversal below depth 6 should be a max-depth marker.
    // The easiest assertion: the final deepest descendant must be the marker.
    const deepest = cursor as Record<string, unknown> | null;
    if (deepest && deepest._reason !== undefined) {
      expect(deepest._reason).toBe("max-depth");
    } else {
      // Fallback: inspect the last 'next' via JSON stringify.
      const text = JSON.stringify(result);
      expect(text).toContain('"max-depth"');
    }
  });

  it("serializes Error instances to { name, message, stack }", () => {
    const err = new Error("boom");
    const result = serializePayload(err) as Record<string, unknown>;
    expect(result.name).toBe("Error");
    expect(result.message).toBe("boom");
    expect(typeof result.stack).toBe("string");
  });

  it("iterates through arrays element-by-element", () => {
    const input = [1, "two", { three: 3 }];
    const result = serializePayload(input) as unknown[];
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(1);
    expect(result[1]).toBe("two");
    expect((result[2] as Record<string, unknown>).three).toBe(3);
  });
});
