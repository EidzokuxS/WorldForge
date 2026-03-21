import { describe, it, expect, vi } from "vitest";

// Mock heavy dependency modules so the import of helpers.ts does not
// pull in real AI SDK / database code.
vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
}));

vi.mock("../../lib/errors.js", () => ({
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
}));

import { requiresApiKey } from "../helpers.js";

// ---------------------------------------------------------------------------
// requiresApiKey
// ---------------------------------------------------------------------------
describe("requiresApiKey", () => {
  describe("returns false for local addresses", () => {
    it("localhost (http)", () => {
      expect(requiresApiKey("http://localhost:1234")).toBe(false);
    });

    it("localhost (https)", () => {
      expect(requiresApiKey("https://localhost/v1")).toBe(false);
    });

    it("localhost without port", () => {
      expect(requiresApiKey("http://localhost")).toBe(false);
    });

    it("LOCALHOST (case-insensitive)", () => {
      expect(requiresApiKey("http://LOCALHOST:8080")).toBe(false);
    });

    it("127.0.0.1 with port", () => {
      expect(requiresApiKey("http://127.0.0.1:5000")).toBe(false);
    });

    it("127.0.0.1 without port", () => {
      expect(requiresApiKey("http://127.0.0.1")).toBe(false);
    });

    it("0.0.0.0 with port", () => {
      expect(requiresApiKey("http://0.0.0.0:3001")).toBe(false);
    });

    it("0.0.0.0 without port", () => {
      expect(requiresApiKey("http://0.0.0.0")).toBe(false);
    });

    it("localhost embedded in path", () => {
      expect(requiresApiKey("http://myhost.com/localhost")).toBe(false);
    });
  });

  describe("returns true for remote addresses", () => {
    it("api.openai.com", () => {
      expect(requiresApiKey("https://api.openai.com/v1")).toBe(true);
    });

    it("generativelanguage.googleapis.com", () => {
      expect(requiresApiKey("https://generativelanguage.googleapis.com")).toBe(true);
    });

    it("remote IP address", () => {
      expect(requiresApiKey("http://192.168.1.100:8080")).toBe(true);
    });

    it("custom domain", () => {
      expect(requiresApiKey("https://my-llm-proxy.example.com/api")).toBe(true);
    });

    it("empty string", () => {
      expect(requiresApiKey("")).toBe(true);
    });

    it("bare domain without protocol", () => {
      expect(requiresApiKey("api.openai.com")).toBe(true);
    });
  });
});

