import { describe, it, expect } from "vitest";
import { isRecord } from "../type-guards.js";

describe("isRecord", () => {
  describe("returns true for record-like values", () => {
    it("plain empty object", () => {
      expect(isRecord({})).toBe(true);
    });

    it("object with string keys", () => {
      expect(isRecord({ a: 1, b: "two" })).toBe(true);
    });

    it("nested object", () => {
      expect(isRecord({ nested: { deep: true } })).toBe(true);
    });

    it("Object.create(null) — prototype-less object", () => {
      expect(isRecord(Object.create(null))).toBe(true);
    });

    it("class instance (still typeof object)", () => {
      class Foo {
        x = 1;
      }
      expect(isRecord(new Foo())).toBe(true);
    });

    it("Date instance (typeof object)", () => {
      expect(isRecord(new Date())).toBe(true);
    });

    it("RegExp instance (typeof object)", () => {
      expect(isRecord(/abc/)).toBe(true);
    });

    it("Map instance (typeof object)", () => {
      expect(isRecord(new Map())).toBe(true);
    });

    it("Set instance (typeof object)", () => {
      expect(isRecord(new Set())).toBe(true);
    });

    // Note: arrays pass the current implementation because
    // typeof [] === "object" && [] !== null. This documents
    // the actual behavior.
    it("array (typeof object, not null)", () => {
      expect(isRecord([1, 2, 3])).toBe(true);
    });
  });

  describe("returns false for non-record values", () => {
    it("null", () => {
      expect(isRecord(null)).toBe(false);
    });

    it("undefined", () => {
      expect(isRecord(undefined)).toBe(false);
    });

    it("string", () => {
      expect(isRecord("hello")).toBe(false);
    });

    it("empty string", () => {
      expect(isRecord("")).toBe(false);
    });

    it("number", () => {
      expect(isRecord(42)).toBe(false);
    });

    it("zero", () => {
      expect(isRecord(0)).toBe(false);
    });

    it("NaN", () => {
      expect(isRecord(NaN)).toBe(false);
    });

    it("boolean true", () => {
      expect(isRecord(true)).toBe(false);
    });

    it("boolean false", () => {
      expect(isRecord(false)).toBe(false);
    });

    it("function", () => {
      expect(isRecord(() => {})).toBe(false);
    });

    it("arrow function", () => {
      const fn = (x: number) => x * 2;
      expect(isRecord(fn)).toBe(false);
    });

    it("symbol", () => {
      expect(isRecord(Symbol("test"))).toBe(false);
    });

    it("bigint", () => {
      expect(isRecord(BigInt(99))).toBe(false);
    });
  });
});
