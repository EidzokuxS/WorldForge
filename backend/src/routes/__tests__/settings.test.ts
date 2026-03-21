import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("../../settings/index.js", () => ({
  loadSettings: vi.fn(),
  saveSettings: vi.fn(),
}));

vi.mock("../../lib/index.js", () => ({
  getErrorMessage: vi.fn((_err: unknown, fallback: string) => fallback),
  getErrorStatus: vi.fn(() => 500),
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Must also mock helpers dependencies so the import chain doesn't pull in real modules
vi.mock("../../ai/index.js", () => ({
  resolveRoleModel: vi.fn(),
}));

vi.mock("../../campaign/index.js", () => ({
  getActiveCampaign: vi.fn(),
}));

vi.mock("../../db/index.js", () => ({
  getDb: vi.fn(),
}));

import { loadSettings, saveSettings } from "../../settings/index.js";
import settingsRoutes from "../settings.js";

const mockedLoad = vi.mocked(loadSettings);
const mockedSave = vi.mocked(saveSettings);

// ---------------------------------------------------------------------------
// App setup
// ---------------------------------------------------------------------------
const app = new Hono();
app.route("/api/settings", settingsRoutes);

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// GET /api/settings
// ---------------------------------------------------------------------------
describe("GET /api/settings", () => {
  it("returns settings as JSON", async () => {
    const fakeSettings = { judge: { temperature: 0.3 }, providers: [] };
    mockedLoad.mockReturnValue(fakeSettings as any);

    const res = await app.request("/api/settings");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(fakeSettings);
    expect(mockedLoad).toHaveBeenCalledOnce();
  });

  it("returns 500 when loadSettings throws", async () => {
    mockedLoad.mockImplementation(() => {
      throw new Error("disk error");
    });

    const res = await app.request("/api/settings");

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});

// ---------------------------------------------------------------------------
// POST /api/settings
// ---------------------------------------------------------------------------
describe("POST /api/settings", () => {
  it("saves settings and returns normalized result", async () => {
    const input = {
      providers: [],
      judge: { providerId: "p1", model: "m1", temperature: 0.5, maxTokens: 1024 },
      storyteller: { providerId: "p1", model: "m1", temperature: 0.7, maxTokens: 2048 },
      generator: { providerId: "p1", model: "m1", temperature: 0.9, maxTokens: 4096 },
      embedder: { providerId: "p1", model: "m1", temperature: 0, maxTokens: 512 },
      fallback: { providerId: "p1", model: "m1", temperature: 0.5, maxTokens: 1024, timeoutMs: 30000, retryCount: 2 },
      images: { enabled: false, providerId: "none", model: "", stylePrompt: "" },
      research: { enabled: true, maxSearchSteps: 10 },
    };
    const savedResult = { ...input, normalized: true };
    mockedSave.mockReturnValue(savedResult as any);

    const res = await app.request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual(savedResult);
    expect(mockedSave).toHaveBeenCalledOnce();
  });

  it("returns 400 for invalid JSON body", async () => {
    const res = await app.request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 400 for schema validation failure", async () => {
    const res = await app.request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providers: "not-an-array" }),
    });

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns 500 when saveSettings throws", async () => {
    const input = {
      providers: [],
      judge: { providerId: "p1", model: "m1", temperature: 0.5, maxTokens: 1024 },
      storyteller: { providerId: "p1", model: "m1", temperature: 0.7, maxTokens: 2048 },
      generator: { providerId: "p1", model: "m1", temperature: 0.9, maxTokens: 4096 },
      embedder: { providerId: "p1", model: "m1", temperature: 0, maxTokens: 512 },
      fallback: { providerId: "p1", model: "m1", temperature: 0.5, maxTokens: 1024, timeoutMs: 30000, retryCount: 2 },
      images: { enabled: false, providerId: "none", model: "", stylePrompt: "" },
      research: { enabled: true, maxSearchSteps: 10 },
    };
    mockedSave.mockImplementation(() => {
      throw new Error("write error");
    });

    const res = await app.request("/api/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });
});
