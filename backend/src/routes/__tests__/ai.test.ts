import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("ai", () => ({
  generateText: vi.fn(),
}));

vi.mock("../../ai/index.js", () => ({
  createModel: vi.fn(() => "mock-model-instance"),
  resolveRoleModel: vi.fn(),
  testProviderConnection: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  clampTokens: vi.fn((n: number) => n),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { generateText } from "ai";
import {
  resolveRoleModel,
  testProviderConnection,
} from "../../ai/index.js";
import aiRoutes from "../ai.js";

const mockedTestProvider = vi.mocked(testProviderConnection);
const mockedResolveRole = vi.mocked(resolveRoleModel);
const mockedGenerateText = vi.mocked(generateText);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api", aiRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// POST /api/providers/test
// ---------------------------------------------------------------------------
describe("POST /api/providers/test", () => {
  it("calls testProviderConnection and returns result", async () => {
    mockedTestProvider.mockResolvedValue({ ok: true, latencyMs: 42 } as any);

    const res = await app.request("/api/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        baseUrl: "http://test.example.com",
        model: "test-model",
        apiKey: "sk-test",
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, latencyMs: 42 });
    expect(mockedTestProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "http://test.example.com",
        model: "test-model",
        apiKey: "sk-test",
      })
    );
  });

  it("returns 400 for invalid body (missing baseUrl)", async () => {
    const res = await app.request("/api/providers/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "m" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/ai/test-role
// ---------------------------------------------------------------------------
describe("POST /api/ai/test-role", () => {
  const validBody = {
    role: "judge",
    providers: [
      { id: "p1", name: "P1", baseUrl: "http://x", apiKey: "k", defaultModel: "m" },
    ],
    roles: {
      judge: { providerId: "p1", model: "judge-model", temperature: 0.5, maxTokens: 1024 },
    },
  };

  it("resolves role model and calls generateText, returns success", async () => {
    mockedResolveRole.mockReturnValue({
      provider: { baseUrl: "http://x", model: "judge-model", apiKey: "k" },
      temperature: 0.5,
      maxTokens: 1024,
    } as any);
    mockedGenerateText.mockResolvedValue({ text: "test response" } as any);

    const res = await app.request("/api/ai/test-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.role).toBe("judge");
    expect(body.model).toBe("judge-model");
    expect(body.response).toBe("test response");
    expect(body).toHaveProperty("latencyMs");
    expect(mockedResolveRole).toHaveBeenCalled();
    expect(mockedGenerateText).toHaveBeenCalled();
  });

  it("returns 400 when role config is missing", async () => {
    const res = await app.request("/api/ai/test-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody,
        roles: {}, // no judge config
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing role config");
  });

  it("returns 400 when providerId is empty", async () => {
    const res = await app.request("/api/ai/test-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody,
        roles: {
          judge: { providerId: "", temperature: 0.5, maxTokens: 1024 },
        },
      }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("providerId");
  });

  it("returns success:false on LLM error", async () => {
    mockedResolveRole.mockReturnValue({
      provider: { baseUrl: "http://x", model: "judge-model", apiKey: "k" },
      temperature: 0.5,
      maxTokens: 1024,
    } as any);
    mockedGenerateText.mockRejectedValue(new Error("LLM timeout"));

    const res = await app.request("/api/ai/test-role", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validBody),
    });

    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.role).toBe("judge");
    expect(body).toHaveProperty("latencyMs");
  });
});
