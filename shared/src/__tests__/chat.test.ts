import { describe, it, expect } from "vitest";
import {
  formatLookupLogEntry,
  isChatMessage,
  parseLookupLogEntry,
} from "../chat.js";

describe("isChatMessage", () => {
  // -------------------------------------------------------------------------
  // Valid messages
  // -------------------------------------------------------------------------
  describe("valid ChatMessage objects", () => {
    it("accepts a user message", () => {
      expect(isChatMessage({ role: "user", content: "hello" })).toBe(true);
    });

    it("accepts an assistant message", () => {
      expect(isChatMessage({ role: "assistant", content: "hi there" })).toBe(
        true,
      );
    });

    it("accepts a system message", () => {
      expect(
        isChatMessage({ role: "system", content: "you are a narrator" }),
      ).toBe(true);
    });

    it("accepts empty content string", () => {
      expect(isChatMessage({ role: "user", content: "" })).toBe(true);
    });

    it("accepts a message with extra properties (structural typing)", () => {
      expect(
        isChatMessage({
          role: "user",
          content: "test",
          timestamp: Date.now(),
          extra: true,
        }),
      ).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: wrong role
  // -------------------------------------------------------------------------
  describe("invalid role values", () => {
    it("rejects role 'tool'", () => {
      expect(isChatMessage({ role: "tool", content: "data" })).toBe(false);
    });

    it("rejects role 'function'", () => {
      expect(isChatMessage({ role: "function", content: "data" })).toBe(false);
    });

    it("rejects numeric role", () => {
      expect(isChatMessage({ role: 1, content: "data" })).toBe(false);
    });

    it("rejects boolean role", () => {
      expect(isChatMessage({ role: true, content: "data" })).toBe(false);
    });

    it("rejects undefined role", () => {
      expect(isChatMessage({ role: undefined, content: "data" })).toBe(false);
    });

    it("rejects null role", () => {
      expect(isChatMessage({ role: null, content: "data" })).toBe(false);
    });

    it("rejects empty string role", () => {
      expect(isChatMessage({ role: "", content: "hello" })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: wrong content
  // -------------------------------------------------------------------------
  describe("invalid content values", () => {
    it("rejects numeric content", () => {
      expect(isChatMessage({ role: "user", content: 42 })).toBe(false);
    });

    it("rejects null content", () => {
      expect(isChatMessage({ role: "user", content: null })).toBe(false);
    });

    it("rejects undefined content", () => {
      expect(isChatMessage({ role: "user", content: undefined })).toBe(false);
    });

    it("rejects array content", () => {
      expect(isChatMessage({ role: "user", content: ["hello"] })).toBe(false);
    });

    it("rejects object content", () => {
      expect(isChatMessage({ role: "user", content: { text: "hi" } })).toBe(
        false,
      );
    });

    it("rejects boolean content", () => {
      expect(isChatMessage({ role: "user", content: true })).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: missing fields
  // -------------------------------------------------------------------------
  describe("missing fields", () => {
    it("rejects object with only role", () => {
      expect(isChatMessage({ role: "user" })).toBe(false);
    });

    it("rejects object with only content", () => {
      expect(isChatMessage({ content: "hello" })).toBe(false);
    });

    it("rejects empty object", () => {
      expect(isChatMessage({})).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Invalid: non-object values
  // -------------------------------------------------------------------------
  describe("non-object values", () => {
    it("rejects null", () => {
      expect(isChatMessage(null)).toBe(false);
    });

    it("rejects undefined", () => {
      expect(isChatMessage(undefined)).toBe(false);
    });

    it("rejects a string", () => {
      expect(isChatMessage("user: hello")).toBe(false);
    });

    it("rejects a number", () => {
      expect(isChatMessage(42)).toBe(false);
    });

    it("rejects a boolean", () => {
      expect(isChatMessage(true)).toBe(false);
    });

    it("rejects an array", () => {
      expect(isChatMessage(["user", "hello"])).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Type guard narrowing (compile-time check, runtime validation)
  // -------------------------------------------------------------------------
  describe("type narrowing", () => {
    it("narrows unknown to ChatMessage on success", () => {
      const input: unknown = { role: "assistant", content: "narrowed" };
      if (isChatMessage(input)) {
        // If TypeScript compiles this, the type guard works at the type level.
        expect(input.role).toBe("assistant");
        expect(input.content).toBe("narrowed");
      } else {
        // Force failure if guard incorrectly rejects
        expect.unreachable("isChatMessage should have returned true");
      }
    });
  });
});

describe("lookup log entries", () => {
  it("round-trips a standard lookup entry", () => {
    const content = formatLookupLogEntry(
      "character_canon_fact",
      "Gojo remains sealed until the Prison Realm is opened.",
    );

    expect(content).toBe(
      "[Lookup: character_canon_fact] Gojo remains sealed until the Prison Realm is opened.",
    );
    expect(parseLookupLogEntry(content)).toEqual({
      lookupKind: "character_canon_fact",
      answer: "Gojo remains sealed until the Prison Realm is opened.",
    });
  });

  it("round-trips compare lookup entries without frontend drift", () => {
    const content = formatLookupLogEntry(
      "compare",
      "Gojo controls range better, but Sukuna answers with broader lethal coverage.",
    );

    expect(parseLookupLogEntry(content)).toEqual({
      lookupKind: "compare",
      answer: "Gojo controls range better, but Sukuna answers with broader lethal coverage.",
    });
  });

  it("round-trips power_profile entries for compatibility", () => {
    const content = formatLookupLogEntry(
      "power_profile",
      "Infinity blocks direct contact while Red and Purple escalate ranged pressure.",
    );

    expect(parseLookupLogEntry(content)).toEqual({
      lookupKind: "power_profile",
      answer: "Infinity blocks direct contact while Red and Purple escalate ranged pressure.",
    });
  });

  it("returns null for non-lookup narration", () => {
    expect(parseLookupLogEntry("The rain sweeps across the station.")).toBeNull();
  });
});
